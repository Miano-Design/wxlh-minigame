/* 细节回归钉（父亲大人 09-24 那六条「尺子抓不到」的）：node scripts/detail_audit.js
   ------------------------------------------------------------------------------
   由来：09-24 那轮反馈里有六条，**改完了、但四把老尺子全绿也抓不到**（我逐条做了改坏试验
   确认过：退回改动，layout_audit / battle_flow_audit 照样全绿）。这一把把六条钉住，
   每一条都写清"为什么老尺子看不见"，并且**每条都验过改坏会红**：

   ① 文字压按钮（全页范围）—— 01「技能行的描述从 +1 按钮底下穿过去」
      ⚠️ layout_audit 那条②**只查首屏可见带**（`y+h < H-底栏`），而技能行在第 2 屏往下，
         永远进不了它的视窗 → 老尺子抓不到。这里对**整页**查，只把底栏/顶栏/弹层排除。
      改坏试验：把 uiw.js 的 `descW` 改回 `U.iw() - PAD*2` → 报"文字压按钮 22×17"。
   ② 命格卡的印记站位 —— 02「印记盖住 `Lv.1 / 50` 的 50」
      老尺子只断言了"U.h3 支持 opt.glyph"，不管调用方怎么用 → 抓不到。
      改坏试验：把 sc-protag 的 h3 改回"另一行 CV.blGlyph(…, U.ix()+U.iw()-8, …)" → 报错。
   ③ 货币符号在**文案里**的取色 —— 04「货币还是白色图标」
      visual_audit 只管"图标形状同源"，不管 CV.text 里那一支的取色 → 抓不到。
      改坏试验：把 cv.js 的 `gcol` 改回 `opt.color || CV.C.text` → 全省上百处报白。
   ④ 数字不许被劈到两行 —— 09「奖励 ✦ 430 被断成 ✦ 43 / 0」
      page_text_audit 的"残句"只看**行尾是不是连接符**，数字本身不算 → 抓不到。
      改坏试验：把 uiw.js 的 .hint/.note（wrapBlock）或 .list-row 的 **CV.wrapTokens 换回逐字 CV.wrap**
       → 立刻报 [reincarn]「…/100」/「0/1500/2500）」、[idlelines]「…+1」/「50%）」。
      （悬赏那一行自己现在只剩一行、劈不开了，所以这条改坏试验要动**共用折行器**才验得出。）
      page_text_audit ①-b3 的排序断言**只验执灯者那一页** → 抓不到。
      改坏试验：把 sc-party 的 pickparty 改回 `Object.keys(S.chars)` → 报顺序不符。
   ⑥ 战斗页的上下留白（满编 5v5）—— 12「上下都太贴了，中间间距小一点」
      battle_flow_audit 只管生命周期（进场/交接/离场），不管间距 → 抓不到。
      改坏试验：把 sc-battle 的 GROUP_GAP 改回 `AV*1.5`、CORNER_PAD 改回 4/6 → 报"中段空/上下贴"。
   ------------------------------------------------------------------------------
   只读脚本：假 canvas，只调 Core.newGame()，不碰真存档、不起模拟器。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
/* 字宽模型与 layout_audit 同一套（中文≈字号 / 西文≈0.55 / emoji≈1.1）—— 两把尺子对同一句话
   得量出同一个宽度，不然改一处、另一处报假警报。 */
function charW(ch, size) {
  const c = ch.codePointAt(0);
  if (c > 0x1F000) return size * 1.1;
  return c > 127 ? size : size * 0.55;
}
let RECTS = [];
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(t.font || ''));
      const size = m ? +m[1] : 11;
      return { width: Array.from(String(s == null ? '' : s)).reduce((a, c) => a + charW(c, size), 0) };
    };
    if (k === 'fillText') return () => {};
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
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onWindowResize() {}, onShow() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.U;
CV.setup(global.wx.getWindowInfo());

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 记录层：底栏 / 顶栏 / 弹层**画的东西不算内容**（它们画在屏幕坐标里，
   跟内容坐标混在一起比会造出一堆假警报 —— layout_audit 的 IN_OVERLAY 是同一个道理，
   这里多包一层 navbar/topbar，因为它也是 CV.text 画的）。 */
let SKIP = false;
const rawText = CV.text, rawBtn = U.btn, rawRound = CV.round;
['navbar', 'topbar'].forEach((fn) => {
  const raw = CV[fn];
  if (typeof raw !== 'function') return;
  CV[fn] = function () { SKIP = true; try { return raw.apply(CV, arguments); } finally { SKIP = false; } };
});
['drawCoach', 'drawOverlay'].forEach((fn) => {
  const raw = U[fn];
  if (typeof raw !== 'function') return;
  U[fn] = function () { SKIP = true; try { return raw.apply(U, arguments); } finally { SKIP = false; } };
});
function note(kind, x, y, w, h, label) { if (SKIP) return; RECTS.push({ kind, x, y, w, h, label: String(label || '') }); }
CV.text = function (str, x, y, opt) {
  if (!SKIP) {
    opt = opt || {};
    const size = opt.size || CV.FS.lg, s = String(str == null ? '' : str);
    const w = CV.measure(s, size, opt.bold);
    const al = opt.align || 'left';
    note('text', al === 'center' ? x - w / 2 : (al === 'right' ? x - w : x), y - size * 0.75, w, size * 1.5, s);
  }
  return rawText.apply(CV, arguments);
};
U.btn = function (x, y, w, h, label) { note('btn', x, y, w, h, label); return rawBtn.apply(U, arguments); };
CV.round = function (x, y, w, h, r, fill, stroke, lw) {
  if (w > 150 && h > 20) note('card', x, y, w, h, 'card');
  return rawRound.apply(CV, arguments);
};

/* 一个"什么都开"的档 */
Core.newGame();
Core.setPlayerName('细节钉');
try { Core.choosePlayerBloodline('绯红'); } catch (e) {}
(D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
['points', 'otherworld', 'holy', 'rp', 'skillChip'].forEach((k) => Core.addCur(k, 999999));
Core.S.player.skillPoints = 9;                                  // 让技能行的 +1 真的画出来
try { Core.addChar(D.characters[0].id); Core.S.party = ['@player', D.characters[0].id, null, null, null]; } catch (e) {}
['fb01', 'fb07'].forEach((id) => { try { Core.buyFabao(id); } catch (e) {} });
['mt01', 'mt05'].forEach((id) => { try { Core.buyMount(id); } catch (e) {} });

/* 全部页面（含要靠 id 进的二级页）跑一遍，把矩形收齐 */
const CHROME = ['welcome', 'create', 'bloodline', 'battle', 'gate'];
const PAGES = [];
function renderAll() {
  Object.keys(CV.panels || {}).forEach((name) => {
    if (CHROME.indexOf(name) >= 0) return;
    RECTS = [];
    try { CV.reset(name); } catch (e) { return; }
    PAGES.push({ name, rects: RECTS.slice() });
  });
  [['fabao_detail', 'fb01'], ['fabao_detail', 'fb07'], ['mount_detail', 'mt01'],
    ['char', D.characters[0].id]].forEach(([pg, id]) => {
    RECTS = [];
    try { CV.reset('home'); RECTS = []; CV.onAct[pg + ':*'](id); } catch (e) { return; }
    PAGES.push({ name: pg + ':' + id, rects: RECTS.slice() });
  });
}
renderAll();

console.log('\n=== ① 全页范围：文字不许压在按钮上（01 技能行的描述压 +1）===');
{
  let hits = 0;
  PAGES.forEach(({ name, rects }) => {
    const body = rects.filter((r) => r.y > CV.TOP - 2);
    const btns = body.filter((r) => r.kind === 'btn');
    const texts = body.filter((r) => r.kind === 'text');
    btns.forEach((b) => texts.forEach((x) => {
      /* 按钮自己那行标签不算（它就画在按钮矩形里） */
      const inside = x.x >= b.x - 2 && x.x + x.w <= b.x + b.w + 2 && x.y >= b.y - 2 && x.y + x.h <= b.y + b.h + 2;
      if (inside || String(x.label) === String(b.label)) return;
      const h = Math.min(x.x + x.w, b.x + b.w) - Math.max(x.x, b.x);
      const v = Math.min(x.y + x.h, b.y + b.h) - Math.max(x.y, b.y);
      if (h > 4 && v > 4) {
        hits++;
        if (hits <= 4) console.log('     ✗ [' + name + '] 「' + x.label.slice(0, 24) + '」×「' + b.label + '」重叠 ' + h.toFixed(0) + '×' + v.toFixed(0));
      }
    }));
  });
  t('整页（不只首屏）没有"文字压按钮"', hits === 0, hits ? hits + ' 处' : '干净');
}

console.log('\n=== ② 命格卡的印记挂在标题里，不许甩到行尾压等级（02）===');
{
  const read = (f) => fs.readFileSync(path.join(JS, f), 'utf8');
  const protag = read('sc-protag.js'), corePages = read('sc-core-pages.js'), bag = read('sc-bag.js');
  const tailGlyph = /CV\.blGlyph\([^;]*U\.ix\(\) \+ U\.iw\(\) - 8 \* CV\.SCALE/.test(protag + corePages + bag);
  t('没有"把印记甩到标题行最右端"的写法', !tailGlyph, tailGlyph ? '还有人这么画' : '干净');
  t('主角 / 境界两处命格卡的印记走 opt.glyph（且 after＝跟在标题文字之后）',
    /glyph: \{ bl: pbl[^}]*after: true/.test(protag) && /glyph: \{ bl: st\.bloodline[^}]*after: true/.test(corePages));
  t('U.h3 支持 opt.glyph.after（排版的那一头也在）', /gBefore = glyph && !glyph\.after/.test(read('uiw.js')));
}

console.log('\n=== ③ 文案里的货币符号必须用货币色（04）===');
{
  /* 把自绘支路每一次调用都记下来：CV.GLYPHS[t](ctx, x, y, size, color) */
  const calls = [];
  Object.keys(CV.GLYPHS || {}).forEach((ch) => {
    const raw = CV.GLYPHS[ch];
    CV.GLYPHS[ch] = function (c, x, y, size, color) { calls.push({ ch, color }); return raw.apply(this, arguments); };
  });
  calls.length = 0;                          // 页面在上一步已经渲染过一遍；这里再渲染一次专门记取色
  Object.keys(CV.panels || {}).forEach((name) => {
    if (CHROME.indexOf(name) >= 0) return;
    try { CV.reset(name); } catch (e) {}
  });
  const cur = calls.filter((c) => CV.CUR_COLOR[c.ch]);
  const wrong = cur.filter((c) => String(c.color) !== String(CV.CUR_COLOR[c.ch]));
  t('自绘货币符号的取色一律来自货币表', wrong.length === 0,
    wrong.length ? wrong.length + ' 处白的（例：' + wrong[0].ch + ' → ' + wrong[0].color + '，应为 ' + CV.CUR_COLOR[wrong[0].ch] + '）'
      : '共 ' + cur.length + ' 次调用全对');
  t('这条断言不是空跑（页面里真有用文案写的货币符号）', cur.length >= 10, cur.length + ' 次');
}

console.log('\n=== ④ 数字不许被折行劈成两半（09）===');
{
  let bad = 0;
  PAGES.forEach(({ name, rects }) => {
    const texts = rects.filter((r) => r.kind === 'text' && r.label.trim())
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < texts.length - 1; i++) {
      const a = texts[i], b = texts[i + 1];
      if (Math.abs(a.x - b.x) > 1) continue;                       // 不是同一列
      const gap = b.y - (a.y + a.h);
      if (gap < -2 || gap > a.h) continue;                         // 不是紧挨着的下一行
      if (/\d$/.test(a.label) && /^\d/.test(b.label)) {
        bad++;
        if (bad <= 4) console.log('     ✗ [' + name + '] 「' + a.label.slice(-12) + '」/「' + b.label.slice(0, 12) + '」—— 数字被劈开了');
      }
    }
  });
  t('没有"上行以数字结尾、下行以数字开头"的紧邻两行', bad === 0, bad ? bad + ' 处' : '干净');
}

console.log('\n=== ⑤ 选伙伴上阵的顺序 = 既定规则（10）===');
{
  const S = Core.S;
  const ids = D.characters.slice(0, 12).map((c) => c.id);      // 2026-09-27：没有 hidden 概念了
  ids.forEach((id) => Core.addChar(id));
  ids.forEach((id, i) => { const c = S.chars[id]; c.lv = (i * 7) % 40; c.star = 1 + (i % 5); });
  S.party = ['@player', ids[5], ids[10], null, null];
  const want = global.charSortDefault(ids.filter((id) => S.party.indexOf(id) < 0)).map((id) => Core.charName(id));
  RECTS = [];
  CV.reset('pickparty');
  const drawn = RECTS.filter((r) => r.kind === 'text' && want.indexOf(r.label) >= 0)
    .sort((a, b) => a.y - b.y).map((r) => r.label);
  const seen = [];
  drawn.forEach((s) => { if (seen.indexOf(s) < 0) seen.push(s); });
  t('"选伙伴上阵"画出来的顺序 = G.charSortDefault（与执灯者同一条规则）',
    seen.length > 0 && seen.join() === want.join(),
    seen.join(' → ').slice(0, 60));
}

console.log('\n=== ⑥ 战斗页上下留白（满编 5v5）· **三机型各算一遍** ===');
/* ================= V1.1.15（2026-09-27 · 派单 I 第 1/4 条）=================
   这一段原来**只在 390×844 上跑一遍** —— 于是 320 上"我方前两名被撤离/速度压住"
   它一直看不见（它报 25px ✓，实机是负净距）。跟 layout_audit 的扩法一样，现在三档各扫一遍；
   另外，几何不再靠"头像写死 50"反推卡顶 —— 战场把这一帧的档位挂在 `G.battleGeom` 上
   （unitAv / rowH / compact / cornerInLog），这里读它。压缩档（短屏）的
   "末排底 → 下面那件东西"是**日志卡的表头行**（角标并进去了），所以那一条按压缩档的判据走。 */
[[320, 568, 20, 534], [390, 844, 44, 810], [430, 932, 47, 898]].forEach(function (MODEL) {
  const [MW, MH, MTOP, MBOT] = MODEL;
  CV.setup({ windowWidth: MW, windowHeight: MH, pixelRatio: 3, safeArea: { top: MTOP, bottom: MBOT } });
  /* 满编＝我方 5（2 前 3 后）＋ 敌方 5（3 后 2 前），跟父亲大人 12 图里那场一个阵型。
     战斗引擎换成"一帧就结束"的假结果（不真打），考的是**这一帧画在哪**。 */
  const mk = (uid, side, position, name) => ({ uid, side, position, name, hp: 1000, maxHp: 1000, kind: 'warrior', faction: null, skills: [], skillLv: [0, 0, 0] });
  const rawRun = global.Battle.run;
  global.Battle.run = () => ({
    win: true, rounds: 1, frames: [
      { type: 'start',
        allies: [mk('a1', 'ally', 'front', '夜行者'), mk('a2', 'ally', 'front', '星尘'),
          mk('a3', 'ally', 'back', '江黎'), mk('a4', 'ally', 'back', '秦戈'), mk('a5', 'ally', 'back', '巫马遥')],
        enemies: [mk('e1', 'enemy', 'back', '怨影甲'), mk('e2', 'enemy', 'back', '怨影乙'), mk('e3', 'enemy', 'back', '怨影丙'),
          mk('e4', 'enemy', 'front', '怨声守卫'), mk('e5', 'enemy', 'front', '怨声主祭')] },
      { type: 'end', win: true, rounds: 1 },
    ],
  });
  RECTS = [];
  global.BattleUI.clear();
  global.BattleUI.run({ title: '留白体检', allies: [], enemies: [], worldId: null, maxRounds: 10, onEnd() { return { acts: [] }; } });
  global.Battle.run = rawRun;
  /* 卡顶/头像直径一律读**真几何**（unitCard 每次都把 _top/_av 记在单位上） */
  const geo = global.battleGeom || {};
  const UNITS = global.BattleUI.state.units || {};
  const topsOf = (names) => names.map((n) => Object.keys(UNITS).map((k) => UNITS[k]).find((u) => u && u.name === n))
    .filter(Boolean).map((u) => u._top);
  global.BattleUI.clear();
  const body = RECTS.slice();
  const byLabel = (lab) => body.filter((r) => r.kind === 'text' && r.label === lab);
  const enemyTops = topsOf(['怨影甲', '怨影乙', '怨影丙', '怨声守卫', '怨声主祭']);
  const allyTops = topsOf(['夜行者', '星尘', '江黎', '秦戈', '巫马遥']);
  const corner = body.filter((r) => r.kind === 'btn' && /^(撤离|\d×速度)$/.test(r.label));
  const logText = byLabel('战斗日志')[0];
  const logCard = logText ? body.filter((r) => r.kind === 'card' && r.y <= logText.y && r.y + r.h >= logText.y).pop() : null;
  const enemyTop = Math.min.apply(null, enemyTops), allyTopMin = Math.min.apply(null, allyTops), allyTopMax = Math.max.apply(null, allyTops);
  const CARD_H = geo.rowH || (D.BATTLE_GEOM.av + 40) * CV.SCALE;
  const allyBottom = allyTopMax + CARD_H;
  const cornerTop = Math.min.apply(null, corner.map((r) => r.y)), cornerBottom = Math.max.apply(null, corner.map((r) => r.y + r.h));
  /* 我方「前排」那一排与敌方「前排」那一排之间的空档＝中间那道组距 */
  const enemyFrontTop = Math.max.apply(null, enemyTops);     // 敌方"前排"是下面那一排
  const midGap = allyTopMin - (enemyFrontTop + CARD_H);
  const tag = ' @' + MW + '×' + MH + (geo.compact ? '（压缩档 av=' + Math.round(geo.unitAv) + '）' : '');
  const show = '敌排顶 ' + enemyTop.toFixed(0) + ' ／ 敌我中段 ' + midGap.toFixed(0)
    + ' ／ 我方末排底 → 角标 ' + (cornerTop - allyBottom).toFixed(0)
    + ' ／ 角标底 → 日志卡 ' + (logCard ? (logCard.y - cornerBottom).toFixed(0) : '—');
  t('满编 5v5 也画得出来（10 个单位都在）' + tag, enemyTops.length === 5 && allyTops.length === 5, enemyTops.length + ' 敌 / ' + allyTops.length + ' 我');
  t('① 上不贴：敌人排卡顶离头条 ≥16px' + tag, enemyTop >= 16 * CV.SCALE - 0.5, enemyTop.toFixed(0) + 'px');
  t('② 中不空：敌我两组的空档 ≤70px（原来 95）' + tag, midGap <= 70 * CV.SCALE, midGap.toFixed(0) + 'px');
  t('③ 下不贴：我方末排底 → 撤离/速度 ≥20px' + tag, cornerTop - allyBottom >= 20 * CV.SCALE - 0.5, (cornerTop - allyBottom).toFixed(0) + 'px');
  if (geo.cornerInLog) {
    /* 压缩档：角标并进日志卡表头，所以"角标底 → 日志卡"这条不成立（角标**就在**卡里）；
       换成同一件事的两条硬约束 —— 阵型不许画进卡里、卡本身不许出画。 */
    t('④ 下不贴：日志卡顶 → 我方末排底 ≥8px' + tag, !!logCard && logCard.y - allyBottom >= 8 * CV.SCALE - 0.5,
      logCard ? (logCard.y - allyBottom).toFixed(0) + 'px' : '没找到日志卡');
    t('⑤ 封口：日志卡整个落在内容区内（卡底 ≤ 内容底）' + tag,
      !!logCard && logCard.y + logCard.h <= CV.H - CV.safeBottom - 2, logCard ? ('卡底 ' + (logCard.y + logCard.h).toFixed(0) + ' / 内容底 ' + (CV.H - CV.safeBottom)) : '没找到日志卡');
  } else {
    t('④ 下不贴：撤离/速度 → 日志卡 ≥12px' + tag, !!logCard && logCard.y - cornerBottom >= 12 * CV.SCALE - 0.5, logCard ? (logCard.y - cornerBottom).toFixed(0) + 'px' : '没找到日志卡');
  }
  console.log('     实测' + tag + '：' + show);
});
CV.setup(global.wx.getWindowInfo());       // 复位（后面的段落按 390 口径继续）

console.log('\n' + (fail ? '结论：✗ ' + fail + ' 条不达标' : '结论：✓ 六条细节全部达标（' + pass + ' 项全过）'));
process.exit(fail ? 1 : 0);
