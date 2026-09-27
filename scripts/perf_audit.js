/* 帧成本体检：node scripts/perf_audit.js
   ------------------------------------------------------------------------------
   起因（2026-09-27 父亲大人："现在我界面滑动有点卡卡的，是我手机卡还是游戏卡"）：
   画布界面是"每次滑动 → 整页重画一遍"，所以"卡不卡"＝**一帧画多少东西**。
   单看代码看不出来，要数：这一帧调了多少次 `fillText`（最贵：每个字一次字形查找 +
   度量）、多少次 `measureText`、多少次图形/图片操作。

   做法：假 ctx 把每个方法**按名字计数**（measureText 还按被量的字数加权重），
   把每页 × 每个状态铺一遍，各渲染一帧，报：
     · ms/帧（Node 上的相对值 —— 手机上大约是这里的 5~10 倍，看倍率不看绝对值）
     · 文字 / 度量 / 图形 / 图片 四类操作的次数
   只读，不碰真存档。

   判据（经验值，2026-09-27 定）：
     · `fillText` 一帧 ≤ 300：安全（滚动 60fps 有富余）
     · 300~800：能跑，但在低端机上会掉帧
     · > 800：一定卡 —— 逐字画的长文本必须走"分段画 + 度量缓存"（见 sc-guide.js 的修法） */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const STATES = require('./_ui_states');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

/* ---------- 会数数的假 ctx ---------- */
const OPS = {};
const bump = (k, n) => { OPS[k] = (OPS[k] || 0) + (n || 1); };
let measureChars = 0;
const PROPS = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
  'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing', 'lineCap',
  'lineJoin', 'miterLimit', 'globalCompositeOperation', 'filter', 'imageSmoothingEnabled'];
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => { bump('measureText'); measureChars += String(s).length; return { width: 8 + String(s).length * 7 }; };
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
    if (k === 'canvas') return canvas;
    if (PROPS.indexOf(k) >= 0) return t[k];
    if (typeof k === 'symbol') return undefined;
    return function () { bump(String(k)); };
  },
  set(t, k, v) { t[k] = v; return true; },
});
const TOUCH = {};                                  // 把触摸处理器收下来（第 ② 段要用）
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { TOUCH.start = fn; }, onTouchMove(fn) { TOUCH.move = fn; }, onTouchEnd(fn) { TOUCH.end = fn; },
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
CV.setup(global.wx.getWindowInfo());
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });
(CV.bindTouch || function () { })();     // 真实入口 game.js 里调的；不调就抓不到触摸处理器（第 ② 段要用）

/* 状态：与 tap_audit 同一份表（`_ui_states.js`），保证"同一页的每个标签页"都量到 */
function openState() {
  Core.newGame();
  Core.setPlayerName('帧成本');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  if (D.characters && D.characters.length) {
    const cid = D.characters[0].id;
    Core.S.chars[cid] = { lv: 20, star: 3, exp: 0, attrs: {}, skillLv: [1, 1, 1], bloodlineLv: 1, equips: {} };
    Core.S.party[1] = cid;
  }
  Core.S.player.level = 40;
  Core.S.player.attrPoints = 5;
  Core.S.player.skillPoints = 5;
  ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'skillChip', 'corridor'].forEach((k) => Core.addCur(k, 99999));
  ['ticket_normal', 'ticket_adv'].forEach((k) => Core.addItem(k, 20));
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  });
}

const SCREENS = [];
Object.keys(CV.panels || {}).forEach((page) => {
  SCREENS.push({ page, via: [], label: page });
  STATES.filter((e) => e.page === page).forEach((e) => {
    SCREENS.push({ page, via: e.via, label: page + '[' + e.via.join('+') + ']' });
  });
});

console.log('\n=== 每页渲染一帧的成本（滑动一次＝重画一帧）===');
console.log('  页面'.padEnd(46) + 'ms/帧   fillText  measureText  图形  图片');
const rows = [];
SCREENS.forEach((scr) => {
  openState();
  if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); }
  try {
    CV.reset(scr.page);
    scr.via.forEach((id) => { if (U && U.coachDrop) U.coachDrop(); CV.dispatch(id); });
    CV.render();                                    // 预热（首帧要建缓存/量字宽）
    for (const k of Object.keys(OPS)) delete OPS[k];
    measureChars = 0;
    CV.render();                                    // 只数这一帧
    const ops = Object.assign({}, OPS);
    const N = 40;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) CV.render();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
    rows.push({ label: scr.label, ms, ops, chars: measureChars });
  } catch (e) {
    rows.push({ label: scr.label, ms: -1, err: e.message, ops: {} });
  }
});

const num = (v) => (v || 0).toLocaleString();
rows.sort((a, b) => b.ms - a.ms).forEach((r) => {
  if (r.err) { console.log('  ✗ ' + r.label + ' 渲染抛异常：' + r.err); return; }
  const o = r.ops;
  const shape = ['fillRect', 'strokeRect', 'arc', 'fill', 'stroke', 'lineTo', 'moveTo', 'roundRect', 'rect', 'clip']
    .reduce((s, k) => s + (o[k] || 0), 0);
  const img = ['drawImage', 'createPattern'].reduce((s, k) => s + (o[k] || 0), 0);
  const flag = (o.fillText || 0) > 800 ? ' ⚠️' : (o.fillText || 0) > 300 ? ' △' : '';
  console.log('  ' + r.label.padEnd(44) + String(r.ms.toFixed(2)).padStart(6) + flag
    + '  ' + num(o.fillText).padStart(8) + '  ' + num(o.measureText).padStart(11)
    + '  ' + num(shape).padStart(5) + '  ' + num(img).padStart(4));
});

const worst = rows.filter((r) => !r.err).slice(0, 5);
console.log('\n=== 最贵的五页 ===');
worst.forEach((r, i) => {
  console.log('  ' + (i + 1) + '. ' + r.label + ' · ' + r.ms.toFixed(2) + 'ms/帧 · fillText ' + num(r.ops.fillText)
    + ' · measureText ' + num(r.ops.measureText) + (r.ops.fillText > 300 ? '  ⚠️ 逐字画的长文本，滑动一定掉帧' : ''));
});
const heavy = rows.filter((r) => !r.err && (r.ops.fillText || 0) > 300);
console.log('\n判据：fillText ≤300 安全 · 300~800 低端机会掉帧 · >800 必卡。'
  + '当前超 300 的有 ' + heavy.length + ' 页。');

/* ---------- ② 滑动合帧 ----------
   V1.1.15（2026-09-27 父亲大人："界面滑动有点卡卡的"）：
   `wx.onTouchMove` 在高刷屏上 60~120Hz 派发，原来**每个事件都整页重画一次**——
   一拖就是"同一帧里画好几遍"。修法是"每帧最多画一次"（CV 的 `drawSoon`）。
   这一条把它钉住：连发 60 个 touchmove，**同步画的帧数必须是个位数**（合帧前＝60）。
   做坏试验：把 cv.js 里的 `drawSoon()` 换回 `CV.render()` → 这一条立刻红。 */
(async function scrollTest() {
  console.log('\n=== ② 滑动合帧：连发 60 个 touchmove，同步画几帧 ===');
  openState();
  /* 引导/弹窗在的时候是**故意锁滚**的（`coachOn()` 直接 return），
     而 openState 之后渲染又会把引导重新支起来 —— 这里把引导整套关掉再测，
     否则量到的是"被引导挡住的那条路"，不是滚动那条。 */
  if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); U.coachActive = function () { return false; }; }
  try { CV.reset('keji'); } catch (e) { }
  CV.render();
  if (!TOUCH.start || !TOUCH.move || !TOUCH.end) { console.log('  ⏭ 没抓到触摸处理器'); return; }
  if (!(CV.maxScroll > 0)) { console.log('  ⏭ 这一页没有可滚动内容（maxScroll=' + (CV.maxScroll || 0) + '）'); return; }
  let frames = 0;
  const orig = CV.render;
  CV.render = function () { frames++; return orig.apply(CV, arguments); };
  const pt = (y) => ({ touches: [{ clientX: 195, clientY: y }], changedTouches: [{ clientX: 195, clientY: y }] });
  TOUCH.start(pt(700));
  for (let i = 1; i <= 60; i++) TOUCH.move(pt(700 - i * 6));   // 往上拖 360px
  const sync = frames;
  const dragged = Math.round(CV.scroll);                       // 拖动期间真的滚了 = 走的是滚动那条路
  TOUCH.end({ touches: [], changedTouches: [{ clientX: 195, clientY: 340 }] });
  await new Promise((r) => setTimeout(r, 150));                 // 等合帧那一帧落地
  CV.render = orig;
  console.log('  60 个 touchmove → **同步画 ' + sync + ' 帧**，连惯性一共 ' + frames + ' 帧'
    + (sync <= 3 ? '  ✓ 每帧最多画一次' : '  ⚠️ 每个事件都在画（合帧失效）'));
  console.log('  拖动期间滚到 ' + dragged + ' / ' + Math.round(CV.maxScroll) + '（>0 才说明真的在滚）'
    + (dragged > 0 ? '  ✓' : '  ⚠️ 这一拖没滚起来，本条不算数'));
})();
