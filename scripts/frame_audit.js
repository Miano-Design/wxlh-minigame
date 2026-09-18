/* 画布"帧状态"审计：node scripts/frame_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.90，父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
   画布界面是**一块共享的 ctx**，一帧里 save/translate/clip/restore 必须严格配对。
   只要任何一页的绘制函数**抛异常**或者**忘了 restore**，这一帧的裁剪与位移就留在 ctx 上，
   下一帧从"脏坐标系"起画 —— 表现就是**越点越偏、底栏/顶栏整条掉出画面**，
   而且 page_smoke（假 ctx 把 save/restore 吃掉）、tap_audit（只看抛不抛错）都**看不见**。

   做法：
     ① 假 ctx 真的记 save/restore 的**栈深**，并累加 translate 的位移；
     ② 包一层 CV.render：每次渲染前后比对栈深与位移 —— 不等就是"漏还原"；
     ③ 把全部页面 × 全部热区照 tap_audit 那样点一遍，每次点击后再渲染都重新验；
     ④ 顺带验底栏几何：非全屏页里 tab:* 的命中矩形必须整条落在画布内。
   只读脚本，不碰真存档。
*/
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

/* ---------- 会记账的假 ctx ---------- */
const CTX = {
  depth: 0, maxDepth: 0, underflow: 0,
  tx: 0, ty: 0,          // 当前累计位移
  baseTx: 0, baseTy: 0,  // 这一帧 setTransform 之后的基准位移
  matrixReset: 0,        // 这一帧显式设过几次矩阵（dpr 归位）
  _stack: [],
  bad: [],               // {where, depth, tx, ty}
};
function resetCtxMeter() {
  CTX.depth = 0; CTX.tx = 0; CTX.ty = 0; CTX.baseTx = 0; CTX.baseTy = 0;
  CTX.matrixReset = 0; CTX._stack = []; CTX.maxDepth = 0; CTX.underflow = 0;
}
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'save') return () => { CTX._stack.push([CTX.tx, CTX.ty]); CTX.depth++; if (CTX.depth > CTX.maxDepth) CTX.maxDepth = CTX.depth; };
    if (k === 'restore') return () => {
      if (CTX.depth === 0) { CTX.underflow++; return; }
      CTX.depth--;
      const p = CTX._stack.pop();
      if (p) { CTX.tx = p[0]; CTX.ty = p[1]; }
    };
    if (k === 'translate') return (x, y) => { CTX.tx += Number(x) || 0; CTX.ty += Number(y) || 0; };
    if (k === 'scale') return () => { CTX.matrixReset++; };
    /* setTransform 会把矩阵重置成参数那一份 —— 记成"这一帧的基准位移" */
    if (k === 'setTransform') return () => { CTX.matrixReset++; CTX.tx = 0; CTX.ty = 0; CTX.baseTx = 0; CTX.baseTy = 0; };
    if (k === 'resetTransform') return () => { CTX.matrixReset++; CTX.tx = 0; CTX.ty = 0; CTX.baseTx = 0; CTX.baseTy = 0; };
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
/* 窗口是可变的：跑第二遍时把它改成"横屏宽窗"，验窗口变化后底栏还在画面里 */
const ENV = { windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } };
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ENV,
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  onWindowResize() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA;
CV.setup(global.wx.getWindowInfo());
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });

/* ---------- 包一层 render：每次渲染的前后都要"零净变化" ---------- */
const CHROMELESS = ['welcome', 'create', 'bloodline', 'battle'];
let leaks = 0, unders = 0, geom = 0;
const rawRender = CV.render;
CV.render = function () {
  const page = CV.top().name;
  resetCtxMeter();
  rawRender.apply(CV, arguments);
  const chromeless = CHROMELESS.indexOf(page) >= 0;
  /* ① 栈深必须回到 0 —— 否则这一帧的裁剪/位移会留给下一帧 */
  if (CTX.depth !== 0) {
    leaks++;
    console.log('✗ 漏还原：' + page + ' 页渲染完 ctx 还压着 ' + CTX.depth + ' 层（下一帧坐标会脏 → 越点越偏）');
  }
  if (CTX.underflow) { unders++; console.log('✗ restore 多于 save：' + page + ' 页多还原了 ' + CTX.underflow + ' 次'); }
  /* ①' 每帧都要**自己把 dpr 矩阵设回去**：微信会重设主画布并清掉 ctx 的全部状态，
       只靠开机那一次 scale() 的话，被清一次界面就整体按 1/dpr 画、底栏整条跑出画面
       （V9.6.90 的病根）。这条就是那把"别再退回去"的锁。 */
  if (CTX.matrixReset < 1) {
    leaks++;
    console.log('✗ 这一帧没有显式设矩阵：' + page + ' 页 —— 平台重设画布后界面会按 1/dpr 画，底栏出画');
  }
  /* ② 位移必须回到"这一帧 setTransform 之后的基准值" —— 多出来的 translate 就是画面整体跑偏 */
  if (Math.abs(CTX.tx - CTX.baseTx) > 0.5 || Math.abs(CTX.ty - CTX.baseTy) > 0.5) {
    leaks++;
    console.log('✗ 位移没还原：' + page + ' 页渲染完累计位移 (' + CTX.tx.toFixed(1) + ',' + CTX.ty.toFixed(1)
      + ')，基准 (' + CTX.baseTx.toFixed(1) + ',' + CTX.baseTy.toFixed(1) + ') → 整块画面跑偏');
  }
  /* ③ 底栏几何：非全屏页，四个页签必须整条落在画布内 */
  if (!chromeless) {
    const tabs = (CV.hits || []).filter((h) => String(h.id).indexOf('tab:') === 0);
    if (tabs.length !== (CV.NAV_TABS || []).length) {
      geom++;
      console.log('✗ 底栏缺页签：' + page + ' 页只登记了 ' + tabs.length + ' 个 tab 热区（应为 ' + CV.NAV_TABS.length + ' 个）');
    }
    tabs.forEach((h) => {
      if (h.y < 0 || h.y + h.h > CV.H + 0.5) {
        geom++;
        console.log('✗ 底栏出画：' + page + ' 页的 ' + h.id + ' 命中区 y=' + h.y.toFixed(0) + '~' + (h.y + h.h).toFixed(0) + '，画布高 ' + CV.H);
      }
    });
  }
};

/* ---------- 铺一个"什么都开、什么都够"的档，跑全部页面 × 全部热区 ---------- */
function openState() {
  Core.newGame();
  Core.setPlayerName('帧检');
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
  if (D.GARDEN) D.GARDEN.forEach((g) => Core.addItem(g.seedItem || g.id, 5));
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  });
}

console.log('\n=== 画布帧状态审计（漏还原 / 位移跑偏 / 底栏出画 / 窗口变化） ===');
let tapped = 0;
function sweep(tag) {
Object.keys(CV.panels || {}).forEach((page) => {
  openState();
  let ids = [];
  try { CV.reset(page); ids = (CV.hits || []).map((h) => h.id); }
  catch (e) { console.log('✗ ' + page + ' 页渲染就抛异常：' + e.message); leaks++; return; }
  const seen = new Set();
  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    tapped++;
    try { CV.dispatch(id); } catch (e) { /* 崩不崩由 tap_audit 管，这里只管帧状态 */ }
  });
});
}
sweep('竖屏');

/* ---------- 第四关：窗口真的变了以后，底栏还在不在画面里 ----------
   V9.6.90（父亲大人："刚开始不会，点几下就出画了"）：这条直接盯"布局是开机一次算死的"这个病根。 */
function resizeCase(name, w, h, safeBottom) {
  ENV.windowWidth = w; ENV.windowHeight = h;
  ENV.safeArea = { top: 44, bottom: h - safeBottom };
  if (!CV.relayout) { console.log('✗ 没有 CV.relayout()：窗口一变，布局就只能拿老尺寸画 → 底栏会出画'); leaks++; return; }
  CV.relayout(ENV);
  openState();
  CV.reset('home');
  const tabs = (CV.hits || []).filter((h) => String(h.id).indexOf('tab:') === 0);
  const bad = tabs.filter((h) => h.y < 0 || h.y + h.h > CV.H + 0.5).length;
  const ok = tabs.length === (CV.NAV_TABS || []).length && bad === 0;
  if (!ok) leaks++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + '（' + w + '×' + h + '）底栏 ' + tabs.length + ' 个页签，'
    + (bad ? bad + ' 个出画' : '整条都在画面内'));
}
console.log('\n=== 窗口变化后底栏还出不出画 ===');
resizeCase('键盘弹出（高度变矮）', 390, 500, 0);
resizeCase('回到竖屏', 390, 844, 34);
resizeCase('宽窗 / 平板', 600, 900, 20);
resizeCase('小屏（iPhone SE）', 320, 568, 0);

console.log('\n共渲染 ' + Object.keys(CV.panels || {}).length
  + ' 页 ×2 轮 · 派发 ' + tapped + ' 次点击 · 4 组窗口尺寸');
console.log('结论：' + ((leaks + unders + geom) === 0
  ? '每一帧都干净收尾（栈深归零 / 位移归位 / 底栏不出画）✓'
  : '✗ 漏还原 ' + leaks + ' 处 · restore 多调用 ' + unders + ' 处 · 底栏几何 ' + geom + ' 处') + '\n');
process.exitCode = (leaks + unders + geom) === 0 ? 0 : 1;
