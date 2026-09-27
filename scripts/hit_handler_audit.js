/* 热区 id ↔ 处理器 全量对账：node scripts/hit_handler_audit.js
   ==============================================================================
   起因（康康 2026-09-26）：「背包 → 装备页，格子末尾那颗「＋（扩容）」看着能点、点了没反应」，
   而且 `tap_audit` 跑完还报「没有死键 ✓」。
   根因是**两套拼法**：渲染处写 `CV.hit('bag_expand:' + view)`（装备页 ＝ `bag_expand:equip`），
   注册处手写 `CV.on('bag_expand:eq')` —— 中间没有任何地方会报错；
   `cv.js` 的 `hitHasHandler()` 判它"没有处理器"，于是把它当**引导锚点**放行 → 点了什么都不发生。

   这一把尺子只做一件事，但是**全量**的：把每一页 × **每一个状态**渲染后登记过的热区 id
   全部收上来，和 `CV.on(...)` 注册的处理器（含 `x:*` 前缀处理器）逐个对账，分四类：
     ✓ exact   —— 有同 id 处理器
     ✓ prefix  —— 有 `前缀:*` 处理器（点得动）
     · inert   —— 在"故意没有动作"名单里（引导锚点 / 调试暗门），不算死键
     ✗ DEAD    —— **没有处理器、也不在上面的名单里**：看着能点、点了没反应（＝那只扩容格）
   额外送一条**拼法提示**：对每个 DEAD，看"同一个前缀下"有没有别的处理器 ——
     有的话说明八成是**拼法不一致**（`bag_expand:equip` vs `bag_expand:eq`），直接点名。

   还有一条**这张表自己的体检**：`_ui_states.js` 里写的状态热区，如果一页渲染下来
   从没被登记过（说明页名/热区名已经改名了），报出来 —— 免得"表过期了但尺子静默跳过"。

   只读脚本：跑在假环境里、不碰真存档、不派发任何动作（只"收 id"）。
   ============================================================================== */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const STATES = require('./_ui_states');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
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

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
CV.setup(global.wx.getWindowInfo());
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });

/* 同 tap_audit：这两类是**故意没有动作**的热区（引导锚点 / 调试暗门），不算死键 */
const INERT = ['attr_card', 'party_board', 'stage_grid', 'gm_tap', 'hero:', 'grid:'];
const inertOk = (id) => INERT.indexOf(id) >= 0;
const hasH = (id) => {
  if ((CV.onAct || {})[id]) return 'exact';
  const i = String(id).indexOf(':');
  if (i > 0 && (CV.onAct || {})[String(id).slice(0, i + 1) + '*']) return 'prefix';
  return null;
};

function openState() {
  Core.newGame();
  Core.setPlayerName('对账');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  if (D.characters && D.characters.length) {
    const cid = D.characters[0].id;
    Core.S.chars[cid] = { lv: 20, star: 3, exp: 0, attrs: {}, skillLv: [1, 1, 1], bloodlineLv: 1, equips: {} };
    Core.S.party[1] = cid;
  }
  /* 给几件装备 + 一件法宝 / 一匹坐骑：装备详情、换装候选、法宝/坐骑详情那些页才有得渲染 */
  for (let i = 0; i < 3; i++) { try { Core.grantEquip('W01', 'SR'); } catch (e) {} }
  try { Core.addCur('points', 999999); } catch (e) {}
  try { Core.addCur('otherworld', 999999); } catch (e) {}
  try { Core.addCur('holy', 999999); } catch (e) {}
  try { if (D.FABAO && D.FABAO[0]) { Core.buyFabao(D.FABAO[0].id); Core.wearFabao(D.FABAO[0].id); } } catch (e) {}
  try { if (D.MOUNTS && D.MOUNTS[0]) { Core.buyMount(D.MOUNTS[0].id); Core.wearMount(D.MOUNTS[0].id); } } catch (e) {}
  ['ticket_normal', 'ticket_adv', 'exp_s'].forEach((k) => { try { Core.addItem(k, 5); } catch (e) {} });
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  });
}

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

console.log('\n=== 热区 id ↔ 处理器 全量对账（含"同一页名的每个状态"）===');

/* ---------- ① 收：每一页 × 每一个状态 ---------- */
const byPage = {};          // page -> Set(ids)
const stateHit = {};        // 'page|via' -> 这颗热区在那一版里出现过没有（表自己的体检）
function collect(page, via) {
  openState();
  if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); if (U.coachDrop) U.coachDrop(); }
  let hits = [];
  try {
    CV.reset(page);
    (via || []).forEach((id) => { CV.dispatch(id); });
    hits = (CV.hits || []).map((h) => String(h.id));
  } catch (e) {
    return { err: e.message, hits: [] };
  }
  if (!byPage[page]) byPage[page] = new Set();
  hits.forEach((id) => byPage[page].add(id));
  (via || []).forEach((id) => { stateHit[page + '|' + id] = (CV.hits || []).some((h) => String(h.id) === id) || !!stateHit[page + '|' + id]; });
  return { hits };
}

const pages = Object.keys(CV.panels || {});
const renderErr = [];
pages.forEach((p) => { const r = collect(p, []); if (r.err) renderErr.push(p + '：' + r.err); });
STATES.forEach((e) => { const r = collect(e.page, e.via); if (r.err) renderErr.push(e.page + '(' + e.via.join('+') + ')：' + r.err); });

t('① 全部页面 × 全部已知状态都能渲染（不抛异常）', renderErr.length === 0,
  renderErr.length ? renderErr.slice(0, 3).join('；') : pages.length + ' 页 ＋ ' + STATES.length + ' 个状态组合');

/* ---------- ② 对账：每个热区 id 有没有处理器 ---------- */
const dead = [], deadInert = [], counter = { exact: 0, prefix: 0, inert: 0 };
Object.keys(byPage).forEach((page) => {
  Array.from(byPage[page]).sort().forEach((id) => {
    const kind = hasH(id);
    if (kind) { counter[kind]++; return; }
    if (inertOk(id) || INERT.some((x) => id.indexOf(x) === 0)) { counter.inert++; deadInert.push(page + ' / ' + id); return; }
    dead.push({ page, id });
  });
});
if (dead.length) {
  dead.forEach((d) => {
    /* 拼法提示：同一个前缀下有没有别的处理器（有 → 八成是两套拼法） */
    const i = d.id.indexOf(':');
    let hint = '';
    if (i > 0) {
      const pre = d.id.slice(0, i + 1);
      const sib = Object.keys(CV.onAct || {}).filter((k) => k.indexOf(pre) === 0 && k !== d.id && k.slice(-1) !== '*');
      if (sib.length) hint = '  ← 同一前缀下有处理器 ' + sib.join(' / ') + '（**疑似两套拼法**）';
      else if ((CV.onAct || {})[pre + '*']) hint = '  ← 有 ' + pre + '* 兜底（不该报，请核这条尺子）';
    }
    console.log('  ✗ DEAD：' + d.page + ' 页的「' + d.id + '」没有处理器 —— 看着能点、点了没反应' + hint);
  });
}
t('② 热区 id 全部有处理器（或属"故意无动作"名单）',
  dead.length === 0,
  dead.length ? ('死键 ' + dead.length + ' 个') : ('对账 ' + (counter.exact + counter.prefix + counter.inert) + ' 个热区：同 id ' + counter.exact + ' · 前缀 ' + counter.prefix + ' · 锚点 ' + counter.inert));

/* ---------- ③ 复用：那只真死键的**回归断言**（康康 09-26 的 case） ---------- */
{
  const bagIds = byPage.bag || new Set();
  const expandIds = Array.from(bagIds).filter((id) => id.indexOf('bag_expand:') === 0);
  const badExpand = expandIds.filter((id) => !hasH(id));
  t('③ 背包那颗「＋（扩容）」（两个标签各一颗）都点得动',
    expandIds.length >= 2 && badExpand.length === 0,
    expandIds.length ? (expandIds.join(' / ') + (badExpand.length ? ('　✗ 没处理器：' + badExpand.join(' / ')) : '　全都有处理器')) : '**一个都没收到**（背包页没渲染出扩容器？）');
}

/* ---------- ④ 这张表自己的体检：写进 `_ui_states.js` 的状态热区必须真的被登记过 ---------- */
{
  const stale = [];
  STATES.forEach((e) => {
    e.via.forEach((id) => {
      /* 只查"最后一跳"（真正的状态切换）：前面的都只是把它带进那一页 */
      if (!stateHit[e.page + '|' + id] && !hasH(id)) stale.push(e.page + ' → ' + id);
    });
  });
  t('④ 状态表没过期（表里写的每一个状态热区，页面上真的登记过）',
    stale.length === 0, stale.length ? ('表里这些热区页面上没有：' + stale.join(' / ')) : STATES.length + ' 组状态全都在');
}

/* ---------- ⑤ 静态：全项目扫"同款风险"（热区 id 是现场拼的、处理器是手写字面量） ----------
   丙组 1 的要求：这类"两套拼法"的错**全项目再扫一遍**。
   判据（不猜、可复核）：
     · 渲染侧写了 `CV.hit('前缀:' + 变量)` → 说明这个前缀下的 **id 是算出来的**；
     · 如果注册侧**没有** `CV.on('前缀:*')` 兜底、只有一串手写字面量 →
       两边一旦对不上就是"看着能点、点了没反应"（`bag_expand:equip` vs `bag_expand:eq` 就是这一类）。
   这类站点不一定都错（值域小的时候手写也行），所以**列出来 + 给出该前缀下已注册的字面量**，
   让人一眼能核；真正"已经错了"的由 ②③ 两条动态断言负责报红。 */
{
  const files = fs.readdirSync(JS).filter((f) => /\.js$/.test(f));
  const risky = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(JS, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (t) => t.replace(/[^\n]/g, ' '));
    const re = /CV\.hit\(\s*'([a-z_]+):'\s*\+/g;
    let m;
    while ((m = re.exec(src))) {
      const pre = m[1] + ':';
      if ((CV.onAct || {})[pre + '*']) continue;                 // 有前缀兜底 → 安全
      const lits = Object.keys(CV.onAct || {}).filter((k) => k.indexOf(pre) === 0 && k.slice(-1) !== '*');
      const line = src.slice(0, m.index).split('\n').length;
      risky.push({ where: f + ':' + line, pre, lits });
    }
  });
  if (risky.length) {
    console.log('  · 静态提示：这些热区 id 是**现场拼的**、而这个前缀没有 `:*` 兜底（核一下值域是否都注册了）：');
    risky.forEach((r) => console.log('      ' + r.where + '  ' + r.pre + 'x  → 已注册字面量：' + (r.lits.length ? r.lits.join(' / ') : '**一个都没有**')));
  } else {
    console.log('  · 静态提示：没有"现场拼 id 又没前缀兜底"的站点（这一类风险已清零）');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
