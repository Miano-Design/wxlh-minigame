/* 游戏圈入口的"闪烁"体检：node scripts/gameclub_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人 2026-09-26）：「设置里面我现在滑动页面进入游戏圈的按钮会**一闪一闪的**」。

   为什么不能只靠模拟器截图：原生按钮 **在开发者工具里根本建不出来**
   （`wx.createGameClubButton` 走不通 → `GC.available()` 恒为 false），
   所以模拟器里永远只走"画布兜底"那一条路 —— **闪的是真机那条**。这脚本的做法是：
   在假环境里**给一个能建出来的原生按钮**（记录 show/hide/destroy），然后把"滑动"一帧一帧地喂进去，
   逐帧量三件事：
     · 这一行现在在不在可视区里（`placeContent` 的往返值算得出来）；
     · 玩家这一刻**看得见的是哪一颗**（原生的 shown ／ 画布的 `open_gameclub` 热区）；
     · 以及"原生重建了几次"（每帧重建 ＝ 卡 ＋ 闪）。
   判据（就是父亲大人那句"一闪一闪"的可测定义）：
     ① **零空洞**：整行在可视区里时，原生的没显示、画布的也没画 → 玩家看到"这里什么都没有" → 不许出现；
     ② **零叠加**：两颗同时可见（原生的盖着画布的，字会重影） → 不许出现；
     ③ **重建不许按帧来**：滑动 N 帧，原生重建次数必须是 **O(1)**（停稳后一次），不是每帧一次。
   只读脚本，跑在假环境里，不碰真存档、不碰微信。*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };

/* ---------- 可控定时器：原生按钮的"停稳 160ms 再重建"要能真的跑起来 ---------- */
let timerSeq = 0;
const timers = [];
function setTimer(fn, ms) { const id = ++timerSeq; timers.push({ id, fn, ms: ms || 0 }); return id; }
function clearTimer(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); }
function flushTimers(max) {
  let n = 0;
  while (timers.length && n < (max || 50)) { const t = timers.shift(); n++; try { t.fn(); } catch (e) { console.log('  ✗ 定时器里抛错：' + e.message); } }
  return n;
}

/* ---------- 假的"原生按钮"：能建出来，并记录 show/hide/destroy ---------- */
const nativeLog = { created: 0, shown: 0, hidden: 0, destroyed: 0 };
function makeFakeButton() {
  const b = { __shown: false, style: null };
  b.show = () => { b.__shown = true; nativeLog.shown++; };
  b.hide = () => { b.__shown = false; nativeLog.hidden++; };
  b.destroy = () => { b.__shown = false; nativeLog.destroyed++; };
  return b;
}
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  /* 触摸回调**收下来**：⑥ 段要真的模拟一次"按住 → 滑动 → 抬手"的手指（`CV.dragging` 只由触摸层置位），
     所以这里不能再用空函数。 */
  onTouchStart(fn) { touch.start = fn; }, onTouchMove(fn) { touch.move = fn; },
  onTouchEnd(fn) { touch.end = fn; }, onTouchCancel(fn) { touch.cancel = fn; },
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
  createGameClubButton(opts) { nativeLog.created++; const b = makeFakeButton(); b.style = opts && opts.style; return b; },
};
const touch = {};
global.setTimeout = setTimer;
global.clearTimeout = clearTimer;

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal, U = G.U;
CV.setup(global.wx.getWindowInfo());
CV.bindTouch();
const GC = G.GameClub;

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* 记下每一帧 placeContent 的入参（＝那一行按钮在**内容坐标**里的位置） */
let place = null;
const realPlace = GC.placeContent;
GC.placeContent = function (x, y, w, h, label) {
  const ret = realPlace.call(GC, x, y, w, h, label);
  place = { x, y, w, h, ret };
  return ret;
};

/* 这一帧玩家看得见哪一颗 */
const h = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0));   // 两个数差多少（06-4 比坐标用）
function seen() {
  const nativeShown = !!(GC.btn && GC.key && GC.btn.__shown);
  const canvasDrawn = (CV.hits || []).some((h) => String(h.id) === 'open_gameclub');
  const top = CV.TOP + 8;
  const bot = CV.H - (CV.NAV_H || 0) - (CV.safeBottom || 0);
  const sy = place ? (place.y - (CV.scroll || 0) + CV.TOP + 8) : null;
  const inside = !!(place && sy >= top - 0.5 && sy + place.h <= bot + 0.5);
  return { nativeShown, canvasDrawn, inside, sy };
}

console.log('\n=== 游戏圈入口 · 滚动闪烁体检 ===');
Core.newGame();
if (Core.ensureDaily) Core.ensureDaily();
if (Core.setPlayerName) Core.setPlayerName('体检');
U.coachDrop && U.coachDrop();
if (Core.S.coachSeen) Object.keys(Core.S.coachSeen).forEach((k) => { delete Core.S.coachSeen[k]; });
CV.reset('settings');
flushTimers();
U.coachDrop && U.coachDrop();

/* ⚠️ 0927-P（父亲大人把设置页重排了）：游戏圈现在是**第 4 块**（主角列表 / 声音 / 自动分解 / 游戏圈），
   默认视口里它不一定在屏上（`placeContent` 只在整行都在可视区里时才摆原生按钮）。
   所以先把这一行滚进视口、放完定时器让它真的停稳，再开始量 —— 否则「原生建得出来」那条会假红。 */
const rowY = place ? place.y : 0;          // 这一行在**内容坐标**里的位置
const maxScroll = CV.maxScroll || 0;
const rowS = Math.max(0, Math.min(maxScroll, rowY - 240));
CV.scroll = rowS;
CV.render(); flushTimers();
CV.render(); flushTimers();
t('假环境里原生按钮**建得出来**（否则测的还是画布兜底那条路，等于没测）',
  GC.available() && nativeLog.created > 0, 'created=' + nativeLog.created);

/* 停稳态：原生那颗应该已经在位、页面**不该**再画画布兜底那颗 */
let s = seen();
t('停稳时：原生那颗在位（show 过）、画布的没画（不叠加）',
  s.nativeShown && !s.canvasDrawn, 'native=' + s.nativeShown + ' · canvas=' + s.canvasDrawn);

/* 滑动：真的把 scroll 一帧一帧推下去（与 cv.js 的触摸那条路一致），逐帧量 */
if (maxScroll < 40) {
  console.log('  ⚠ 设置页可滚量只有 ' + Math.round(maxScroll) + 'px —— 这一页短，滚动窗口小（仍然照测）');
}
const steps = [];
for (let i = 1; i <= 20; i++) {
  CV.scroll = Math.min(maxScroll, Math.round(maxScroll * i / 20));
  CV.render();
  steps.push(Object.assign({ step: i, scroll: CV.scroll, created: nativeLog.created }, seen()));
}
const holes = steps.filter((x) => x.inside && !x.nativeShown && !x.canvasDrawn);
const doubles = steps.filter((x) => x.nativeShown && x.canvasDrawn);
t('① 滑动中**零空洞**：整行在可视区里时，总有一颗看得见（原生的或画布的）',
  holes.length === 0, holes.length ? ('空洞 ' + holes.length + ' 帧（例：第 ' + holes[0].step + ' 帧滚动 ' + holes[0].scroll + '）') : '20 帧全都有');
t('② 滑动中**零叠加**：不会"原生盖着画布"两颗同时可见（字会重影）',
  doubles.length === 0, doubles.length ? ('叠加 ' + doubles.length + ' 帧') : '没有叠加');
const during = steps[steps.length - 1].created - steps[0].created + (steps[0].created > 0 ? 0 : 0);
const rebuilds = steps[steps.length - 1].created;
t('③ 重建不按帧来：滑 20 帧期间原生按钮重建次数 ≤ 2（每帧重建会卡＋闪）',
  rebuilds <= 2, '滑完共重建 ' + rebuilds + ' 次');

/* 停稳之后（把画面滚回"这一行看得见"的位置）：放完定时器，原生那颗要重新在位、画布那颗收起来。
   ⚠️ 不能拿"滑到底"那个位置验 —— 设置页比一屏长，滑到底时这一行已经**滚过去了**，
      那时原生本来就该收走（它不吃 canvas 裁剪，留着会飘在顶栏上）。 */
CV.scroll = Math.max(0, Math.min(maxScroll, rowY - 240));
CV.render();
flushTimers();
CV.render();
flushTimers();
const after = seen();
t('④ 停稳之后（画面停在这一行上）：原生那颗重新在位、画布那颗收起来（回到"只有一颗"）',
  after.inside && after.nativeShown && !after.canvasDrawn,
  'inside=' + after.inside + ' · native=' + after.nativeShown + ' · canvas=' + after.canvasDrawn);

/* 那一行滚出可视区时：原生必须收走（它不会被 canvas 裁掉，会飘在顶栏/底栏上） */
CV.scroll = 0; CV.render(); flushTimers();
const topEdge = seen();
CV.scroll = maxScroll; CV.render(); flushTimers();
const botEdge = seen();
t('⑤ 那一行滚出可视区时，原生按钮被收走（原生组件不吃 canvas 裁剪，会飘在顶栏上）',
  !topEdge.nativeShown || topEdge.inside, '顶部：native=' + topEdge.nativeShown + ' inside=' + topEdge.inside);

/* ================= ⑥ 0927-P：**拖动中一次都不许建原生**、抬手后必须建到位 =================
   起因（父亲大人 2026-09-27）：「**进入游戏圈的按钮滑动的时候还是会频闪**」。
   根因（本脚本逐帧量出来的）：以前 `GC.tick` 只看"滚动位置这一帧变没变"——
   手指滑得慢、或者**中途顿一下**，手指还按在屏幕上，160ms 那个计时器照样到点 →
   原生被**建在手指停住时的旧位置**上；手指接着一动，位置又变 → 又 hide 掉 →
   原生出现／消失 ＝ 真机上那种频闪（模拟器里看不见，因为原生按钮在开发者工具里根本建不出来）。
   修法：`js/cv.js` 的触摸层给一个 `CV.dragging`（位移过 8px 阈值置 true、抬手/取消置 false），
   `GC.tick` 在拖动期间**只记 want、只确保原生已 hide**，抬手之后才走原来那套"停稳 160ms 重建"。
   做坏试验（必须能红）：把 `GC.tick` 里 `if (CV.dragging) {...}` 那一段删掉 →
   ⑥-1 当场红（拖动中那个 160ms 计时器又会到点、原生被建出来）。
   这一段的手指是**真事件序列**（走 `CV.bindTouch` 绑的 wx.onTouch* ），
   而且最后一下"手指停住没动"——正是他报的那个场景。 */
{
  console.log('\n=== ⑥ 拖动中：原生 0 次创建 → 抬手后建到位 ===');
  /* 回到"这一行看得见、原生已经在位"的稳态 */
  CV.scroll = rowS;
  CV.render(); flushTimers();
  CV.render(); flushTimers();
  const base = nativeLog.created;
  const evt = (y) => ({ touches: [{ clientX: 195, clientY: y }], changedTouches: [{ clientX: 195, clientY: y }] });
  const rowScreenY = rowY - (CV.scroll || 0) + CV.TOP + 8;
  /* 滑动的方向（⚠️ 有讲究）：上面那一段稳态把画面停在了 `rowS` 上，而 `rowS` 就是
     这个页面**能滚的最大量**（这一行在设置页第 4 块，要滚到底才看得见）——
     所以只有**手指往下滑**（scroll 变小）才真的动得了；往上滑会被夹在 maxScroll 上、
     一行都不动，那这一段就等于没测（本脚本第一版就是这么"假绿"的）。
     距离取 60px，滑完这一行还在视口里。 */
  const dist = Math.min(60, Math.max(10, Math.round(rowS - 20)));
  /* 拖动中的"停一会儿"：手指**还在屏幕上**、画面已经几帧没动了 —— 这正是父亲大人报的
     "滑得慢 / 中途顿一下"。原来那个 160ms 的计时器在这种时候照样到点（＝频闪的根因），
     所以每一跳之后都放掉挂着的定时器 ＋ 再渲染几帧（≥160ms 的等价物）。 */
  const holdFrames = (n) => { for (let k = 0; k < (n || 3); k++) { flushTimers(200); CV.render(); } };
  if (touch.start && touch.move && touch.end) {
    const scrollStart = CV.scroll;
    touch.start(evt(rowScreenY));
    for (let i = 1; i <= 5; i++) {
      touch.move(evt(rowScreenY + Math.round(dist * i / 5)));
      holdFrames(3);
    }
    /* 手指**停在原地**那一下（父亲大人报的就是这一下）：位移 0 ⇒ 速度归零，
       但手指还在屏幕上 ⇒ `CV.dragging` 还是 true ⇒ 这个 160ms 谁都不许重建。 */
    touch.move(evt(rowScreenY + dist));
    holdFrames(4);
    t('⑥-0 这几下**真的把页面滚动了**（前置条件：否则这一段等于没测）',
      Math.abs(CV.scroll - scrollStart) >= 8, 'scroll ' + Math.round(scrollStart) + ' → ' + Math.round(CV.scroll));
    const duringCreated = nativeLog.created - base;
    let sm = seen();
    t('⑥-1 拖动中（含手指中途停住那一下）：原生按钮创建 **0 次**',
      duringCreated === 0, '拖动中新建 ' + duringCreated + ' 次（应 0）· CV.dragging=' + CV.dragging);
    t('⑥-2 拖动中玩家看得见的是画布兜底那颗（零空洞：原生收起了，画布那颗补上）',
      !sm.nativeShown && (sm.canvasDrawn || !sm.inside),
      'native=' + sm.nativeShown + ' · canvas=' + sm.canvasDrawn + ' · inside=' + sm.inside);
    /* 抬手：这一次手势结束 → 回原来那套 160ms 稳定重建 */
    touch.end(evt(rowScreenY + dist));
    flushTimers(400); CV.render(); flushTimers(400);
    const afterCreated = nativeLog.created - base - duringCreated;
    const st = seen();
    t('⑥-3 抬手之后 160ms 内：原生**建到位**（show 过、就在这一行上、画布那颗收起来）',
      afterCreated >= 1 && st.nativeShown && !st.canvasDrawn,
      '抬手后新建 ' + afterCreated + ' 次 · native=' + st.nativeShown + ' · canvas=' + st.canvasDrawn
      + ' · inside=' + st.inside);
    /* 顺带核对：画布兜底那颗与原生那颗**同一位置 / 同尺寸 / 同底色 / 同描边 / 同圆角 / 同字号** */
    const style = (GC.btn && GC.btn.style) || {};
    const sy = st.sy;
    const samePos = h(style.left, place.x) <= 1 && h(style.top, sy) <= 1
      && h(style.width, place.w) <= 1 && h(style.height, place.h) <= 1;
    t('⑥-4 两颗**同位置 / 同尺寸 / 同底色 / 同描边 / 同圆角 / 同字号**（动完别让它俩长得不一样）',
      samePos
      && style.backgroundColor === CV.C.panel2 && style.borderColor === CV.C.line2 && style.borderWidth === 1
      && style.borderRadius === Math.round(CV.RADIUS_SM) && style.fontSize === Math.round(CV.FS.md),
      '原生 ' + JSON.stringify({ left: style.left, top: style.top, w: style.width, h: style.height,
        bg: style.backgroundColor, line: style.borderColor, r: style.borderRadius, fs: style.fontSize })
      + ' · 画布 ' + JSON.stringify({ left: place.x, top: Math.round(sy), w: place.w, h: place.h,
        bg: CV.C.panel2, line: CV.C.line2, r: CV.RADIUS_SM, fs: CV.FS.md }));
    CV.dragging = false;                 // 收尾：别把标志位留在"拖动中"
  } else {
    t('⑥-0 触摸回调收下来了（前置条件）', false, '没有拿到 wx.onTouchStart/Move/End');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
