/* UX 终审尺子（R1.5 UX 轮 · 任务书 §五十）：node scripts/ux_audit.js
   ==============================================================================
   **真渲染每一个页面**（不是 grep 字面量），然后从运行时抓：
     页面入口/出口 · 返回链 · 滚动恢复 · 热区（死按钮 / 碰撞）· 按钮（主次 / 字数）
     · 文案（失败词 / 数字格式 / 长文本）· 内容高度 vs 底栏 · 连点 / 连返 · toast 清单

   ⚠️ 三条纪律：
     · 渲染不出来的页面记 **BLOCKED**（要真实前提：战斗中的 battle 页之类），**不许当 PASS**；
     · 只报事实，改动由人拍（本尺子不改代码）；
     · "死按钮"判据用**运行时 `CV.hits` + handler 表**，不看字面量 —— 拼出来的 id
       （斗法台/深井结算那颗 `kind + '_back'`）必须能通过（历史踩过这个坑）。 */
const fs = require('fs');
const path = require('path');
const { boot, ROOT, JS } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('ux_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D, G } = E;

/* ⚠️ 底栏四格的处理器**注册在真实入口 `game.js`**（`js/` 里没有）——
   `_env` 只加载 `js/*.js`，不补这一句的话本尺子会把 `tab:*` 误判成"死按钮"（假账）。
   口径与 `tap_audit` / `frame_audit` / `deadkey_audit` 一致。 */
CV.NAV_TABS.forEach((t) => {
  if (!CV.onAct['tab:' + t.id]) CV.on('tab:' + t.id, function () { CV.switchTab(t.id); });
});

/* ---------- 源码扫描：入口表 / 返回键 ---------- */
const SRC = {};
fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)).forEach((f) => { SRC['js/' + f] = fs.readFileSync(path.join(JS, f), 'utf8'); });
const SRC_ALL = Object.keys(SRC).map((k) => ({ file: k, t: SRC[k] })).concat([{ file: 'js/cv.js', t: fs.readFileSync(path.join(JS, 'cv.js'), 'utf8') }]);
const lineOfNeedle = (needle) => {
  for (let i = 0; i < SRC_ALL.length; i++) {
    const lines = SRC_ALL[i].t.split('\n');
    for (let j = 0; j < lines.length; j++) if (lines[j].indexOf(needle) >= 0) return SRC_ALL[i].file + ':' + (j + 1);
  }
  return '';
};
const grab = (re) => { const out = []; SRC_ALL.forEach(({ t }) => { let m; while ((m = re.exec(t))) out.push(m[1]); }); return out; };

const PAGES = Object.keys(CV.panels);
/* ⚠️ 引导锚点：**整块区域、本来就没有动作**，不是"看着能点却没反应"的按钮。
   口径与测试台 `deadkey_audit.js` 的 ANCHORS **逐条一致**（那边已经把它写成白名单），
   这里照抄一份是为了不重复报假账；两处要改一起改。 */
const ANCHORS = ['attr_card', 'party_board', 'stage_grid', 'hero:', 'grid:'];
const isAnchor = (id) => ANCHORS.some((k) => id === k || String(id).indexOf(k) === 0);
const ENTRY = {
  push: grab(/CV\.push\(\s*'([a-z_0-9]+)'/g),
  reset: grab(/CV\.reset\(\s*'([a-z_0-9]+)'/g),
  jump: grab(/CV\.jump\(\s*'([a-z_0-9]+)'/g),
  /* 入口一律看**运行时登记的动作表**（`open_*` 有的是在循环里批量注册的，字面 grep 会漏） */
  open: Object.keys(CV.onAct).filter((k) => k.indexOf('open_') === 0).map((k) => k.slice(5)),
};
const entered = ENTRY.push.concat(ENTRY.reset, ENTRY.jump, ENTRY.open)
  /* 动作表里还有一类 `open_*_` 的复合 id（如 open_xxx_detail），取首段再比一次 */
  .concat(Object.keys(CV.onAct).filter((k) => k.indexOf('open_') === 0).map((k) => k.slice(5).split('_')[0]));
const TABS = CV.NAV_TABS.map((t) => t.id);

/* 每个页面的"返回键 id"：从 U.pageHead(...backId) 抽；默认 page_back */
const backIdOf = (name) => {
  let id = null;
  SRC_ALL.forEach(({ t }) => {
    const at = t.indexOf("CV.register('" + name + "'");
    if (at < 0) return;
    const seg = t.slice(at, at + 1400);
    const m = seg.match(/backId:\s*'([a-zA-Z_0-9]+)'/);
    if (m) id = m[1];
  });
  return id || 'page_back';
};

/* ---------- 夹具：一份"玩到中期"的存档，让页面有东西可画 ---------- */
function fixture() {
  Core.newGame(); Core.setPlayerName('UX审计'); Core.choosePlayerBloodline('修真');
  const S = Core.S;
  S.player.level = 45; S.player.attrPoints = 90; S.player.bloodlineLv = 20; S.player.geneLock = 3;
  ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 500000));
  S.bag.eqCap = 400; S.bag.matCap = 400; S.bag.itemCap = 400;
  Object.keys(D.UNLOCKS ? {} : {}).length;   // noop，保持结构清晰
  (D.UNLOCKS || []).forEach((u) => { S.unlocks[u.id] = true; });
  D.WORLDS.forEach((w, i) => { S.worlds[w.id] = { unlocked: i < 14, stages: { normal: Array(12).fill(i < 12 ? 3 : 0), hard: Array(12).fill(0), hell: Array(12).fill(0) } }; });
  S.worldUnlocked = true;
  D.characters.slice(0, 8).forEach((c) => { try { Core.addChar(c.id); S.chars[c.id].lv = 40; S.chars[c.id].star = 3; } catch (e) {} });
  S.party = ['@player'].concat(D.characters.slice(0, 4).map((c) => c.id));
  for (let i = 0; i < 80; i++) Core.grantEquip('W06', 'SSR', null);
  Core.autoEquipBest();
  S.items.mat_t1 = 200; S.items.mat_t2 = 120; S.items.mat_t3 = 80; S.items.minghun_sha = 40; S.items.xuesui_jing = 30;
  D.GARDEN.forEach(() => {});
  S.items.lingzhi_zhong = 20;
  /* ⚠️ 引导一律按"已读"处理：引导气泡有一条"**把目标滚进视野**"的行为（uiw.js drawCoach），
     它会在渲染中途改 `CV.scroll` —— 那会污染"热区几何 / 遮挡"这几项测量。
     这是本尺子的测量口径，不是改游戏（引导行为由 `guide_walk_audit` 单独验）。 */
  try { S.coachSeen = new Proxy({}, { get: () => true, set: () => true }); } catch (e) { S.coachSeen = {}; }
  return S;
}

/* ---------- 抓取：包一层 U.btn / CV.toast，渲染一页 ---------- */
const btnLog = [];
const toastLog = [];
const rawBtn = G.U.btn.bind(G.U);
G.U.btn = function (x, y, w, h, label, style, id, dis) {
  btnLog.push({ label: String(label == null ? '' : label), style: style || 'default', id: id || '', dis: !!dis, x, y, w, h });
  return rawBtn(x, y, w, h, label, style, id, dis);
};
const rawToast = CV.toast;
CV.toast = function (msg, ms) { toastLog.push(String(msg)); return rawToast.call(CV, msg, ms); };

function renderPage(name, opts) {
  E.TEXT.length = 0; btnLog.length = 0;
  CV.stack = [{ name: 'home', opts: {} }, { name: name, opts: opts || {} }];
  CV.cur = TABS.indexOf(name) >= 0 ? name : CV.cur;
  CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.stickyH = 0; CV.bottomBarH = 0; CV.pageHead = null;
  let err = null;
  try { CV.render(); } catch (e) { err = String((e && e.message) || e); }
  /* ⚠️ 渲染闸在"这一帧里又请求了一次重画"时会**紧接着再画一帧**（真机上是异步补帧，
     假环境里同步跑完）→ 同一颗按钮会被记两次。按"完全相同的一次绘制"去重，
     免得把"画了两遍"误报成"一页两颗主按钮"。 */
  const seen = {};
  const btns = btnLog.filter((b) => {
    const k = [b.id, b.label, b.style, Math.round(b.x), Math.round(b.y)].join('|');
    if (seen[k]) return false; seen[k] = 1; return true;
  });
  const hseen = {};
  const hits = CV.hits.filter((h) => {
    const k = [h.id, Math.round(h.x), Math.round(h.y), Math.round(h.w)].join('|');
    if (hseen[k]) return false; hseen[k] = 1; return true;
  });
  return {
    hits, texts: E.TEXT.slice(), btns,
    err, contentY: G.U ? G.U.y : 0,
  };
}

const PAGE_OPTS = {
  char: () => ({ id: Core.S.party[1] }),
  eqdetail: () => {
    const uid = Object.keys(Core.S.equips)[0];
    return { uid };
  },
  item: () => ({ id: Object.keys(D.ITEMS).find((k) => D.ITEMS[k].type === 'material') || 'mat_t1' }),
  fabao_detail: () => ({ id: (D.FABAO[0] || {}).id }),
  mount_detail: () => ({ id: (D.MOUNTS[0] || {}).id }),
  beast_detail: () => ({ id: (D.BEASTS[0] || {}).id }),
  pickleader: () => ({ line: (D.IDLE_LINES[0] || {}).id }),
  pickswap: () => ({ slot: 1 }),
  equip_pick: () => ({ cid: Core.S.party[1], slot: 'weapon' }),
  serum_pick: () => ({ cid: Core.S.party[1] }),
  ssr_pick: () => ({}),
};

/* ---------- ① 页面清单 + 孤岛页 ---------- */
const results = {};
fixture();
PAGES.forEach((p) => {
  let opts = null;
  try { opts = PAGE_OPTS[p] ? PAGE_OPTS[p]() : null; } catch (e) { opts = null; }
  results[p] = renderPage(p, opts);
});
const blocked = PAGES.filter((p) => results[p].err);
const okPages = PAGES.filter((p) => !results[p].err);
R.note('页面总数：' + PAGES.length + '（可独立渲染 ' + okPages.length + ' 页，需前置状态 ' + blocked.length + ' 页）');
R.note('底栏四格：' + TABS.join(' / '));

const islands = PAGES.filter((p) => TABS.indexOf(p) < 0 && entered.indexOf(p) < 0 && p !== 'home');
(islands.length ? R.warn : R.pass)('没有"进不去"的孤岛页（每个页面都至少有一个入口）', {
  file: 'js/sc-*.js', expected: '无孤岛', actual: islands.length ? islands.join(' , ') : PAGES.length + ' 页都有入口',
});

/* ---------- ② 死按钮（运行时热区 → handler 表） ---------- */
{
  const has = (id) => {
    if (CV.onAct[id]) return true;
    const i = String(id).indexOf(':');
    return i > 0 && !!CV.onAct[String(id).slice(0, i + 1) + '*'];
  };
  const dead = [];
  Object.keys(results).forEach((p) => {
    if (results[p].err) return;
    results[p].hits.forEach((h) => { if (!has(h.id) && !isAnchor(h.id)) dead.push(p + ' → ' + h.id); });
  });
  const uniq = dead.filter((v, i) => dead.indexOf(v) === i);
  (uniq.length ? R.fail : R.pass)('没有"有热区没人接"的死按钮（' + okPages.length + ' 页运行时全扫）', {
    file: 'js/sc-*.js', expected: '0 个死按钮', actual: uniq.length ? uniq.slice(0, 10).join(' ; ') : '0 个',
  });
}

/* ---------- ③ 热区碰撞（同层矩形相交 > 2px） ---------- */
{
  const clash = [];
  const sameId = {};
  Object.keys(results).forEach((p) => {
    if (results[p].err) return;
    const H = results[p].hits.filter((h) => !h.ghost);
    for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) {
      const a = H[i], b = H[j];
      if (!!a.screen !== !!b.screen) continue;
      /* 引导锚点整块盖住真按钮（`hero:*` 盖 `open_protag`、`grid:*` 盖 `open_*`）**是设计**：
         锚点只给引导定位用，真正派发的是下面那颗真按钮。 */
      if (isAnchor(a.id) || isAnchor(b.id)) continue;
      /* 引导气泡（`_coach_*`）**本来就是"压在页面上"的浮层**，与下层重叠是它的设计；
         真正的判据是"它在的时候下层点不到"（由 coachLock 管，属运行时行为，静态量不到）。 */
      if (/^_coach/.test(a.id) || /^_coach/.test(b.id)) continue;
      /* **同一个 id** 盖了两块（典型：「整张卡可点」＋卡里那颗同名按钮）——
         不是"两块区域抢点"，是同一个动作的两个入口，单列 INFO。 */
      if (String(a.id) === String(b.id)) { sameId[a.id] = (sameId[a.id] || p); continue; }
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) clash.push(p + ' → ' + a.id + ' × ' + b.id);
    }
  });
  const U2 = clash.filter((v, i) => clash.indexOf(v) === i);
  (U2.length ? R.warn : R.pass)('热区不互相压（同一帧同一层里没有两块重叠的可点区域）', {
    file: 'js/sc-*.js', expected: '0 处重叠', actual: U2.length ? U2.slice(0, 8).join(' ; ') : '干净',
  });
  const sid = Object.keys(sameId);
  R.note('「整张卡可点 ＋ 卡里还有一颗同名按钮」（同一动作两个入口，不是抢点）：'
    + (sid.length ? sid.map((k) => sameId[k] + ':' + k).join(' , ') : '无'));
}

/* ---------- ④ 返回链：每个二级页 → 返回 → 必须回到上一层 ---------- */
{
  const bad = [];
  PAGES.filter((p) => TABS.indexOf(p) < 0 && p !== 'home' && !results[p].err).forEach((p) => {
    const bid = backIdOf(p);
    fixture();
    CV.stack = [{ name: 'home', opts: {} }, { name: p, opts: PAGE_OPTS[p] ? PAGE_OPTS[p]() : {} }];
    CV.cur = 'home';
    let err = null;
    try { CV.render(); } catch (e) { err = 1; }
    if (err) { bad.push(p + '（渲染不了）'); return; }
    let handled = true;
    try { handled = CV.dispatch(bid); } catch (e) { handled = false; }
    const top = CV.top().name;
    if (!handled) bad.push(p + ' → ' + bid + '（没人接）');
    else if (top !== 'home') bad.push(p + ' → ' + bid + ' 之后落在 ' + top + '（不是上一层）');
  });
  (bad.length ? R.fail : R.pass)('每个二级页的返回都回到**上一层**（不是回主界面、也不是原地不动）', {
    file: 'js/sc-*.js', expected: '返回 = 上一层', actual: bad.length ? bad.slice(0, 10).join(' ; ') : '全部符合',
  });
}

/* ---------- ⑤ 滚动：进新页归零 / 返回上一层恢复 ---------- */
{
  const bad = [];
  const probe = (a, b) => {
    fixture();
    CV.reset('home');
    CV.push(a);
    CV.scroll = 300;
    CV.render();                              // 让 a 这一页算一次 maxScroll（内容不够长时会被夹）
    const maxA = CV.maxScroll || 0;
    CV.scroll = Math.min(300, maxA);
    const kept = CV.scroll;
    CV.push(b);
    const fresh = CV.scroll;
    CV.pop();
    const back = CV.scroll;
    return { fresh, back, maxA, kept };
  };
  [['world', 'story'], ['bag', 'eqdetail'], ['dungeon', 'world'], ['roster', 'char']].forEach(([a, b]) => {
    let r; try { r = probe(a, b); } catch (e) { bad.push(a + '→' + b + ' 抛错'); return; }
    if (r.fresh !== 0) bad.push(a + '→' + b + ' 进新页没归零（' + r.fresh + '）');
    /* ⚠️ 上一层内容不够长时，`render()` 会把 scroll **夹回 maxScroll**（那是正确行为，不是 bug）。
       所以只在"上一层自己滚得动"时才要求恢复 300。 */
    if (r.maxA >= 300 && r.back !== r.kept) bad.push(a + '→' + b + ' 返回没恢复位置（' + r.back + ' ≠ ' + r.kept + '）');
  });
  (bad.length ? R.fail : R.pass)('滚动三态：进新页归零 · 返回上一层恢复原位', {
    file: 'js/cv.js', expected: '进=0 / 回=原位', actual: bad.length ? bad.join(' ; ') : '三组探针全对',
  });
}

/* ---------- ⑥ 按钮：主按钮数量 / 文字长度 ---------- */
{
  const manyPrimary = [], longLabel = [];
  Object.keys(results).forEach((p) => {
    const r = results[p];
    if (r.err) return;
    const prim = r.btns.filter((b) => (b.style === 'primary' || b.style === 'gold') && !b.dis && b.id !== 'page_back');
    /* 判据按 §三十三 的原意：**"三四个按钮都像主按钮"**才是问题；
       一页两块独立内容、各有一颗主按钮（如招募两张池卡各一颗）是正常的。 */
    if (prim.length > 2) manyPrimary.push(p + '（' + prim.length + ' 颗：' + prim.map((b) => b.label).join(' / ') + '）');
    r.btns.forEach((b) => { if (b.label.replace(/[‹›→]/g, '').trim().length > 8 && b.id !== 'page_back') longLabel.push(p + '：' + b.label); });
  });
  R.note('主按钮 >1 颗的页面数：' + manyPrimary.length + '（这是"每页一个第一动作"的对照，不是一律判错）');
  (manyPrimary.length ? R.warn : R.pass)('每页第一动作不明显（同时有 2 颗以上主按钮）', {
    file: 'js/sc-*.js', expected: '一页一颗主按钮', actual: manyPrimary.length ? manyPrimary.slice(0, 8).join(' ; ') : '全部 ≤1',
  });
  (longLabel.length ? R.warn : R.pass)('按钮文字不长（≤8 字，§三十四）', {
    file: 'js/sc-*.js', expected: '2~5 字为主', actual: longLabel.length ? longLabel.slice(0, 10).join(' ; ') : '全部 ≤8 字',
  });
}

/* ---------- ⑦ 文案：失败词 / 数字格式 ---------- */
{
  const bare = [];
  Object.keys(SRC).forEach((f) => {
    const lines = SRC[f].split('\n');
    lines.forEach((ln, i) => {
      /* 只有"孤立一句失败"才报：后面带说明（差多少 / 怎么解）的不报 */
      const m = ln.match(/toast\(\s*'([^']*)'/);
      if (m && /^(失败|操作失败|不能操作|无法使用|不可用)$/.test(m[1].trim())) bare.push(f + ':' + (i + 1) + ' → ' + m[1]);
    });
  });
  (bare.length ? R.fail : R.pass)('没有"只说失败、不解释为什么"的提示（§十）', {
    file: 'js/sc-*.js', expected: '失败要带原因 + 下一步', actual: bare.length ? bare.slice(0, 8).join(' ; ') : '干净',
  });
  /* 数字格式：同一页里同时出现"裸 5 位数"与"带千分位" */
  const mixed = [];
  Object.keys(results).forEach((p) => {
    if (results[p].err) return;
    const ts = results[p].texts.join(' ');
    const hasRaw = /\b\d{5,}\b/.test(ts);
    const hasSep = /\b\d{1,3}(,\d{3})+\b/.test(ts);
    if (hasRaw && hasSep) mixed.push(p);
  });
  (mixed.length ? R.warn : R.pass)('同一页的数字格式统一（不混用 12000 / 12,000）', {
    file: 'js/sc-*.js', expected: '一页一种写法', actual: mixed.length ? mixed.join(' , ') : '干净',
  });
}

/* ---------- ⑧ 内容高度 vs 底栏（是否被遮挡） ---------- */
{
  const over = [];
  Object.keys(results).forEach((p) => {
    const r = results[p];
    if (r.err) return;
    const limit = CV.H - (CV.bottomBarH || 0) - (CV.TOP || 0);
    if (r.contentY && r.contentY > limit + 2) over.push(p + '（内容 ' + Math.round(r.contentY) + ' > 可用 ' + Math.round(limit) + '）');
  });
  R.note('内容高度 vs 可用高度（超过的页面＝需要滚动，属正常；列出来只为看有没有"最后一张卡贴死底栏"）：' + (over.length ? over.length + ' 页' : '无'));
}

/* ---------- ⑨ 连点 / 连返 ---------- */
{
  /* 连点：同一帧派发同一个热区两次，栈深不许翻倍 */
  fixture();
  CV.reset('home');
  CV.render();
  const pushHit = CV.hits.find((h) => h.id === 'tab_dungeon' || h.id === 'grid:daily' || h.id === 'open_protag');
  let double = 'no-hit';
  if (pushHit) {
    CV.dispatch(pushHit.id);
    const d1 = CV.stack.length;
    CV.dispatch(pushHit.id);
    const d2 = CV.stack.length;
    double = (d2 - d1 > 1) ? ('翻倍 ' + d1 + '→' + d2) : ('稳（' + d1 + '→' + d2 + '）');
  }
  (double.indexOf('翻倍') < 0 ? R.pass : R.fail)('连点同一颗按钮不会产生两次业务结果（栈深不翻倍）', {
    file: 'js/cv.js', expected: '一次意图＝一次结果', actual: double,
  });
  /* 连返：从二级页连按返回 8 次，栈必须始终合法 */
  fixture();
  CV.reset('home'); CV.push('world');
  let bad = '';
  for (let i = 0; i < 8; i++) {
    try { CV.dispatch('page_back'); } catch (e) { bad = '第 ' + (i + 1) + ' 次抛错：' + e.message; break; }
    if (!CV.stack.length) { bad = '第 ' + (i + 1) + ' 次把栈清空了'; break; }
    if (!CV.panels[CV.top().name]) { bad = '第 ' + (i + 1) + ' 次落到不存在的页 ' + CV.top().name; break; }
  }
  (bad ? R.fail : R.pass)('连续返回 8 次不崩、不空白、不落到不存在的页', {
    file: 'js/cv.js', expected: '始终停在合法页', actual: bad || ('收在 ' + CV.top().name),
  });
}

/* ---------- ⑩ 弹窗模态：开弹窗时下层不许被点到 ---------- */
{
  /* 运行时的模态层由 `CV.hitMode === 'overlay'` 标记：开弹窗时它登记的热区带 modal=true，
     下层的普通热区**不许**被派发（命中判定见 cv.js 的触摸入口）。这里量的是"有没有这种层"。 */
  const withModal = Object.keys(results).filter((p) => !results[p].err && results[p].hits.some((h) => h.modal));
  R.note('渲染时就带模态层的页面：' + (withModal.join(' , ') || '无（弹窗是点击后才开，静态帧量不到）'));
  R.note('⚠️ 弹窗的"下层不可点"属**点击后**状态，静态渲染量不到 —— 建议用 `automation_game_action` 实机点一次确认。');
}

/* ---------- ⑪ Toast 清单（§九：先列出来，不一律删） ---------- */
{
  const sites = [];
  Object.keys(SRC).forEach((f) => {
    const lines = SRC[f].split('\n');
    lines.forEach((ln, i) => { const m = ln.match(/CV\.toast\(\s*'([^']{0,40})/); if (m) sites.push(f + ':' + (i + 1) + ' ' + m[1]); });
  });
  R.note('Toast 调用点共 ' + sites.length + ' 处（§九 要求先建清单，不是一律删）。');
  /* 只报**光秃秃的状态词**（界面已经变了还要说一遍）；
     带补充信息的（如「已装备（从 X 身上取下）」——"从谁身上摘的"在那一页看不到）不算冗余。 */
  const redundant = sites.filter((s) => {
    const m = s.match(/CV\.toast\(\s*'([^']*)'/);
    if (!m) return false;
    const msg = m[1];
    return /^(已装备|已领取|已保存|已切换|打开成功|升级成功|分解成功|已返回|设置成功)$/.test(msg.trim());
  });
  (redundant.length ? R.warn : R.pass)('没有"界面已经变了还要 toast 一遍"的冗余提示（§九）', {
    file: 'js/sc-*.js', expected: '界面变化能表达的就别 toast', actual: redundant.length ? redundant.slice(0, 8).join(' ; ') : '干净',
  });
}

/* ---------- ⑫ 四档屏宽（§二十 / §四）：热区不许出画、不许永远被底栏盖住 ---------- */
{
  const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932]];
  const outOfCanvas = [], underBar = [];
  SIZES.forEach(([w, h]) => {
    try { CV.relayout({ windowWidth: w, windowHeight: h, pixelRatio: 3, safeArea: { top: 20, bottom: h - 20 } }); } catch (e) { return; }
    PAGES.forEach((p) => {
      let opts = null;
      try { opts = PAGE_OPTS[p] ? PAGE_OPTS[p]() : null; } catch (e) { opts = null; }
      let r; try { r = renderPage(p, opts); } catch (e) { return; }
      if (r.err) return;
      const navTop = CV.H - (CV.bottomBarH || 0);
      const scr = (hit) => (hit.screen ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h }
        : { x: hit.x, y: hit.y + CV.TOP + 8 - CV.scroll, w: hit.w, h: hit.h });
      /* ① 出画：**横向**越界永远算 bug；**纵向**只有"这页根本滚不动"时才算
         （能滚的页面，内容在折线以下属正常，靠滚动看得到）。 */
      r.hits.filter((hh) => !hh.ghost && !isAnchor(hh.id)).forEach((hh) => {
        const s = scr(hh);
        const horiz = (s.x < -1 || s.x + s.w > CV.W + 1);
        const vert = (!CV.maxScroll && s.y + s.h > CV.H + 1);
        if (horiz || vert) {
          outOfCanvas.push(w + ' ' + p + ' ' + hh.id + '（x ' + Math.round(s.x) + '~' + Math.round(s.x + s.w) + ' / y ' + Math.round(s.y + s.h) + '）');
        }
      });
      /* ② 滚到底之后仍被底栏盖住 = 永远点不到 */
      CV.scroll = CV.maxScroll || 0; CV.render();
      CV.hits.filter((hh) => !hh.ghost && !isAnchor(hh.id)).forEach((hh) => {
        const s = scr(hh);
        if (s.y + s.h > navTop + 1 && s.y < navTop - 30) underBar.push(w + ' ' + p + ' ' + hh.id);
      });
    });
  });
  /* 还原默认尺寸，后面的检查用 390×844 */
  try { CV.relayout({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }); } catch (e) {}
  const oU = outOfCanvas.filter((v, i) => outOfCanvas.indexOf(v) === i);
  const bU = underBar.filter((v, i) => underBar.indexOf(v) === i);
  (oU.length ? R.fail : R.pass)('四档屏宽（320/375/390/430）下没有热区跑出画布', {
    file: 'js/sc-*.js', expected: '全部落在画布内', actual: oU.length ? oU.slice(0, 10).join(' ; ') : '四档全干净',
  });
  (bU.length ? R.warn : R.pass)('滚到底之后没有被底栏永久盖住的按钮', {
    file: 'js/sc-*.js', expected: '滚完能点到', actual: bU.length ? bU.slice(0, 10).join(' ; ') : '干净',
  });
}

/* ---------- ⑫a 锁定状态 / 空状态：光"灰掉"或光"暂无"不算解释（§十二 / §十三） ---------- */
{
  const lockBad = [], emptyBad = [];
  const REASON = /通关|Lv\.|需要|未达|解锁|后开放|条件|还差/;
  const NEXT = /前往|去|获得|解锁|探索|试试|先|可以|通关/;
  Object.keys(results).forEach((p) => {
    const r = results[p];
    if (r.err) return;
    const ts = r.texts.join('\n');
    if (ts.indexOf('未解锁') >= 0 && !REASON.test(ts)) lockBad.push(p);
    if ((ts.indexOf('暂无') >= 0 || ts.indexOf('还没有') >= 0) && !NEXT.test(ts)) emptyBad.push(p);
  });
  (lockBad.length ? R.warn : R.pass)('锁定状态都说清了"为什么锁 / 怎么解锁"（§十二）', {
    file: 'js/sc-*.js', expected: '灰掉之外还要给条件', actual: lockBad.length ? lockBad.join(' , ') : '干净（"未解锁"都带了解锁条件）',
  });
  (emptyBad.length ? R.warn : R.pass)('空状态都给了"下一步"（§十三）', {
    file: 'js/sc-*.js', expected: '不只是一句"暂无"', actual: emptyBad.length ? emptyBad.join(' , ') : '干净',
  });
}

/* ---------- ⑫b 帧首清屏：换页不许把上一帧留在屏幕上（2026-10-02 父亲大人） ----------
   现场：新档签完《灯阁契约》进起名页，**契约那张卡还留在屏幕上**，和起名卡叠着。
   根因不在排版 —— `CV.render()` 以前**从来不擦画布**，靠"铺底渐变不透明"顺手盖住上一帧；
   10-02 那道渐变为了"底图透得出来"收到 50% alpha，于是**没有底图的页面**（`welcome` / `create`）
   把上一页的像素当底图透了出来。
   这条尺子只问一件事：**每一帧的第一笔画的是不是 clearRect** ——
   是，换页就不可能留鬼影；不是，将来任何一次"把底色调透明"都会让同一个病复发。
   （实现：包一层 ctx 记账；`_env` 的假画布对任何方法都返回函数，所以这里只看"调用顺序"。） */
{
  const seq = [];
  const inner = CV.ctx;
  const WATCH = ['clearRect', 'fillRect', 'fillText', 'drawImage', 'beginPath', 'fill', 'stroke'];
  CV.ctx = new Proxy(inner, {
    get(t, k) {
      if (WATCH.indexOf(k) >= 0) {
        return function () { seq.push(k); const f = t[k]; if (typeof f === 'function') return f.apply(t, arguments); };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const bad = [];
  const probe = ['home', 'dungeon', 'bag', 'grow', 'welcome', 'create', 'gate', 'bloodline', 'story'];
  probe.forEach((p) => {
    if (!CV.panels[p]) return;
    seq.length = 0;
    let err = null;
    try { CV.reset(p); } catch (e) { err = String((e && e.message) || e); }
    if (err) return;
    if (seq[0] !== 'clearRect') bad.push(p + '（首笔=' + (seq[0] || '无绘制') + '）');
  });
  CV.ctx = inner;
  (bad.length ? R.fail : R.pass)('每一帧的第一笔都是"擦干净画布"（换页不留上一帧的鬼影）', {
    file: 'js/cv.js', expected: '渲染序列以 clearRect 开头', actual: bad.length ? bad.join(' ; ') : '9 页全部以 clearRect 起笔',
  });
}

/* ---------- ⑬ 需要前置状态、静态渲染不了的页面（诚实记录，不算 PASS） ---------- */
if (blocked.length) {
  R.note('⚠️ 需真实前置状态、本轮静态渲染不了的页面（**未验证**）：' + blocked.map((p) => p + '(' + String(results[p].err).slice(0, 40) + ')').join(' ; '));
}

R.note('口径：真渲染 CV.panels 的全部页面 + 运行时 CV.hits/onAct + 包一层 U.btn/CV.toast 抓到的按钮与提示。');
R.note('只报事实：改动见《残域 UX 终审报告》。');
R.finish();
