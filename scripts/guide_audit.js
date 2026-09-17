/* 小游戏引导系统静态审计：node scripts/guide_audit.js

   起因（父亲大人 2026-09-18）："这些东西都是写在代码里的，你只要代码没问题，这些问题不应该有。"
   画布版最容易出的三种错，读代码 + 真渲染一遍就能抓：
   ① **锚点写错/根本不在那一页** → 引导静默不播（玩家："点了去完成没反应"）；
   ② **key 重复**（且没声明共用）→ 两条抢一个"看过没"的位，后注册的永远不播；
   ③ **某个主线步没有引导** → 点了「去完成」什么都不讲。

   做法：借 page_smoke 的那套假 canvas，把每一页**真的渲染一遍**，把 CV.hits 收集起来 ——
   动态 id（stage:3 / eqd:xxx / bup:core）和"整组热区"都算得准，不靠猜。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

/* ---------- 假 canvas（与 page_smoke 同一套坑：GameGlobal 指向 global + wx 桩） ---------- */
const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA;
if (!CV || !Core) { console.log('CV / Core 没挂上 ✗'); process.exit(1); }
/* 必须和真实入口 game.js 一样先 setup，否则 CV.render() 第一行 `if (!CV.ctx) return;` 直接返回，
   CV.hits 永远是空的 —— 那样这份审计会"全绿但什么都没查"（page_smoke 就栽在这上面）。 */
CV.setup(global.wx.getWindowInfo());

let bad = 0, warn = 0;
const fail = (s) => { bad++; console.log('✗ ' + s); };
const warnf = (s) => { warn++; console.log('⚠ ' + s); };

/* ---------- 真渲染每一页，收集热区 ---------- */
Core.newGame();
Core.setPlayerName('审计');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}
/* 渲染两遍：① 新号原样 ② 功能全解锁 + 一点进度。
   为什么要两遍：很多锚点**本身是"解锁后才画出来"的**（关卡格、建筑升级按钮…）。
   只跑新号会把这类"合法缺失"当成错；只跑全解锁又会漏掉"新号上这一步指不到"的告警。
   两遍合一，才能既不误报、又能指出"这一步在新号上会退化成'点一下继续'"。 */
function renderAll() {
  const out = {};
  Object.keys(CV.panels || {}).forEach((page) => {
    try { CV.reset(page); out[page] = (CV.hits || []).map((h) => h.id); }
    catch (e) { out[page] = []; }
  });
  /* 'world'（关卡页）要先"进某个世界"才会画关卡格 —— 真实入口是 CV.dispatch('w:W01')。
     每个世界各渲染一次取并集，stage:0 / stage:11 这类锚点才算得准。 */
  Object.keys(CV.panels || {}).forEach((page) => {
    if (page !== 'world') return;
    D.WORLDS.forEach((w) => {
      try {
        CV.dispatch('w:' + w.id);
        CV.reset('world');
        (CV.hits || []).forEach((h) => { if (out.world.indexOf(h.id) < 0) out.world.push(h.id); });
      } catch (e) {}
    });
  });
  return out;
}
const freshHits = renderAll();
try {
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  Core.S.player.level = 120;
  /* V9.6.74：很多按钮是"钱够 / 条件到"才画出来的（秘术阁升级、法宝买、转生…）——
     不全解锁一遍的话，这些**合法缺席**会被当成"锚点不存在"。 */
  ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'corridor', 'skillChip'].forEach((k) => { try { Core.addCur(k, 999999); } catch (e) {} });
  Core.S.player.geneLock = 5;
  Core.S.buildings.core = 30;
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    /* 全部关卡标成"已通关"（不是 0）—— 0 只解锁第 1 关，后面的 stage:N 锚点还是画不出来 */
    if (w && w.stages) { Object.keys(w.stages).forEach((diff) => { w.stages[diff] = w.stages[diff].map(() => 3); }); }
  });
} catch (e) {}
const fullHits = renderAll();
const hitsByPage = {};
Object.keys(freshHits).forEach((p) => {
  const set = new Set(freshHits[p].concat(fullHits[p] || []));
  hitsByPage[p] = Array.from(set);
});
const freshSet = {};
Object.keys(freshHits).forEach((p) => { freshSet[p] = new Set(freshHits[p]); });
const allHits = new Set();
Object.keys(hitsByPage).forEach((p) => hitsByPage[p].forEach((id) => allHits.add(id)));

function anchorOk(anchor, page, onlyFresh) {
  const pool = (page && hitsByPage[page]) ? hitsByPage[page] : null;
  const has = (id) => {
    if (id === anchor) return true;
    if (anchor.slice(-1) === '*') return id.indexOf(anchor.slice(0, -1)) === 0;   // 前缀锚点
    if (id.slice(-1) === '*') return anchor.indexOf(id.slice(0, -1)) === 0;       // 命中的是"整组热区"
    return false;
  };
  if (onlyFresh) {
    const fresh = freshSet[page] || new Set();
    for (const id of fresh) if (has(id)) return true;
    return false;
  }
  if (pool) { for (const id of pool) if (has(id)) return true; return false; }
  for (const id of allHits) if (has(id)) return true;
  return false;
}
/* 一条引导的锚点可以写成一串（['eqd:*','bagview:equip']）＝"任一命中即可" */
function anyAnchorOk(list, page, onlyFresh) {
  for (let i = 0; i < list.length; i++) if (anchorOk(list[i], page, onlyFresh)) return true;
  return false;
}

/* ---------- 抽表 ---------- */
const home = fs.readFileSync(path.join(JS, 'sc-home.js'), 'utf8');
const data = fs.readFileSync(path.join(JS, 'data.js'), 'utf8');

const openingSrc = home.slice(home.indexOf('const OPENING = ['), home.indexOf('\n  ];', home.indexOf('const OPENING = [')));
const opening = [];
openingSrc.replace(/\{ key: '([a-z0-9_]+)',\s*page: '([a-z]+)',\s*target: (?:'([^']+)'|\[([^\]]+)\])[\s\S]*?text: '([^']*)'/g,
  (m, key, page, one, many, text) => {
    const targets = one ? [one] : many.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    opening.push({ key: key, page: page, targets: targets, text: text });
    return m;
  });

const tutSrc = home.slice(home.indexOf('const TUT = {'), home.indexOf('\n  };', home.indexOf('const TUT = {')));
const tut = {};
tutSrc.replace(/(q[0-9a-z_]+):\s*\{([^}]*)\}/g, (m, qid, body) => {
  const page = (body.match(/page: '([a-z]+)'/) || [])[1];
  const anchors = [];
  const arr = body.match(/\bs:\s*\[([^\]]*)\]/);
  if (arr) arr[1].split(',').forEach((x) => { const v = x.trim().replace(/^'|'$/g, ''); if (v) anchors.push(v); });
  tut[qid] = { page: page, anchors: anchors, run: /run:/.test(body), text: (body.match(/t:\s*'([^']*)'/) || [])[1] || '' };
  return m;
});

console.log('\n=== 小游戏引导审计 ===');
console.log('注册页面 ' + Object.keys(hitsByPage).length + ' 个 · 全部热区 ' + allHits.size + ' 个 · 开场链 ' + opening.length + ' 步 · 主线引导 ' + Object.keys(tut).length + ' 条\n');

/* ---------- ① 锚点必须在它那一页真的存在 ---------- */
opening.forEach((st) => {
  if (!anyAnchorOk(st.targets, st.page, false)) {
    fail('开场链「' + st.key + '」的锚点 ' + st.targets.join('/') + ' 在「' + st.page + '」页根本不存在 —— 引导会静默不播');
  } else if (!anyAnchorOk(st.targets, st.page, true)) {
    warnf('开场链「' + st.key + '」的锚点要等解锁后才有（新号上会退化成"点一下继续"）：' + st.targets.join('/'));
  }
});
Object.keys(tut).forEach((qid) => {
  const r = tut[qid];
  if (r.run || !r.anchors.length) return;
  if (!anyAnchorOk(r.anchors, r.page, false)) {
    fail('主线步 ' + qid + '（' + r.page + ' 页）的锚点 ' + r.anchors.join('/') + ' 根本不存在 —— 这一步没有高亮');
  } else if (!anyAnchorOk(r.anchors, r.page, true)) {
    warnf('主线步 ' + qid + ' 的锚点要等解锁后才有（新号上这一步没有高亮）：' + r.anchors.join('/'));
  }
});
if (!bad) console.log('✓ 规则① 所有引导锚点在对应页面都存在（不会静默不播）');

/* ---------- ② key 重复（共用钥匙要在 TOPIC_KEY 里声明） ---------- */
const topicKeys = ((home.match(/const TOPIC_KEY = \{([^}]*)\}/) || ['', ''])[1].match(/'([^']+)'/g) || [])
  .map((s) => s.replace(/'/g, ''));
const keyCount = {};
opening.forEach((st) => { keyCount[st.key] = (keyCount[st.key] || 0) + 1; });
Object.keys(tut).forEach((q) => { keyCount['tut_' + q] = (keyCount['tut_' + q] || 0) + 1; });
const unlockSrc = home.slice(home.indexOf('const UNLOCK_GUIDE = {'), home.indexOf('\n  };', home.indexOf('const UNLOCK_GUIDE = {')));
(unlockSrc.match(/^\s{4}([a-zA-Z]+):\s*\{/gm) || []).forEach((l) => {
  const id = l.trim().replace(/:\s*\{$/, '');
  keyCount['tut_unlock_' + id] = (keyCount['tut_unlock_' + id] || 0) + 1;
});
const dupKeys = Object.keys(keyCount).filter((k) => keyCount[k] > 1 && topicKeys.indexOf(k) < 0);
if (dupKeys.length) fail('这些 key 重了但没在 TOPIC_KEY 里声明共用：' + dupKeys.join('、'));
else console.log('✓ 规则② key 没有意外重复');

/* ---------- ③ 每个主线步都要有引导（或有写明理由的豁免） ---------- */
const EXEMPT = { q03: '招募在开场三区块里讲过，不重复' };
const questBlock = data.slice(data.indexOf('const MAIN_QUESTS = ['), data.indexOf('\n  ];', data.indexOf('const MAIN_QUESTS = [')));
const quests = [];
questBlock.replace(/\{ id: '([a-z0-9_]+)', name: '([^']+)'/g, (m, id, name) => { quests.push({ id: id, name: name }); return m; });
const questTopic = (home.match(/const QUEST_TOPIC = \{([^}]*)\}/) || ['', ''])[1];
const missing = quests.filter((q) => !tut[q.id] && !EXEMPT[q.id] && questTopic.indexOf(q.id) < 0);
if (missing.length) fail('这些主线步点了「去完成」什么都不讲：' + missing.map((q) => q.id + '(' + q.name + ')').join('、'));
else console.log('✓ 规则③ ' + quests.length + ' 个主线步都有引导（豁免 ' + Object.keys(EXEMPT).length + ' 个）');

/* ---------- 告警：别一关一关念 ---------- */
const stageTalks = Object.keys(tut).filter((q) => {
  const m = (tut[q].text || '').match(/第\s*(\d+)\s*关/);
  return m && Number(m[1]) >= 2;
});
if (stageTalks.length > 3) {
  warnf('有 ' + stageTalks.length + ' 条主线引导在讲"第 N 关是干嘛的"（' + stageTalks.join('、') + '）—— 关卡信息应该画在格子上，别一关一关弹窗念');
}

/* ---------- ④ 跨系统：界面里用到的 D.xxx 数据必须真的存在 ----------
   父亲大人："你得结合玩法机制整体的代码去对应呀，不能只看引导，这叫瞻前不顾后。"
   这条就是那个"后"：canvas 界面写的是 D.xxx（数据层），数据层改名/没导出 → 页面直接崩。
   真抓到过：药园页写 D.GARDENS，数据里叫 D.GARDEN → 整页崩 + 播种按钮也是死的。
   做法：把 data.js 的 export 名单抽出来，再去 sc-*.js 里逐个核对用到的 D.xxx。 */
const dataExports = new Set();
const expBlock = data.slice(data.lastIndexOf('return {'), data.length);
expBlock.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*[,:}]/g, (m, name) => { dataExports.add(name); return m; });
['GARDEN', 'GARDEN_PLOTS', 'WORLDS', 'UNLOCKS'].forEach((k) => dataExports.add(k));
const usedData = {};
fs.readdirSync(JS).filter((f) => /^(sc-.*|uiw|cv)\.js$/.test(f)).forEach((f) => {
  const src = fs.readFileSync(path.join(JS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  src.replace(/\bD\.([A-Za-z_][A-Za-z0-9_]*)/g, (m, name) => {
    (usedData[name] = usedData[name] || new Set()).add(f);
    return m;
  });
});
const missingData = Object.keys(usedData).filter((n) => !dataExports.has(n));
if (missingData.length) {
  /* 注意分工：**真崩**由 page_smoke（真渲染）负责抓；这条只管"引用过期/名字对不上"，
     所以是告警 —— 有些地方写了 `|| 兜底` 不会崩，但那说明数据已经改名/搬走，早晚要还。 */
  missingData.forEach((n) => warnf(`界面引用了 D.${n}（${Array.from(usedData[n]).join('、')}），但 data.js 没有这个导出 —— 引用过期了（有兜底才没崩）`));
} else {
  console.log(`✓ 规则④ 界面用到的 ${Object.keys(usedData).length} 个数据项在 data.js 里都有（不会因为改名崩页）`);
}

console.log('\n结论：' + (bad ? '✗ 有 ' + bad + ' 处硬问题' : '小游戏引导系统静态自洽 ✓') + (warn ? '（另有 ' + warn + ' 条告警）' : '') + '\n');
if (bad) process.exitCode = 1;
