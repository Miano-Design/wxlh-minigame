/* 小游戏「渲染每一页」冒烟（node scripts/page_smoke.js）
   ------------------------------------------------------------------------------
   为什么必须有这一层：V9.6.59 我把两张引导表误删了，**页面函数本身不抛错** ——
   是 CV.render 里调 G.coachFor 时才抛 ReferenceError，页面画一半就断。
   test_game / test_ui 是逻辑层测试，**测不到**；coach_audit 只管引导表；
   只有"真的把每一页渲染一遍"才能当场抓住这类问题。

   做法：假 canvas（任何绘图方法都吃掉）+ 真 CV.render()，把 50 个注册页面逐个渲染。
   两个坑（都踩过）：
     ① GameGlobal 必须指向 global —— data.js 是挂在 window 上的，
        另建一个空对象的话 G.DATA 是空的，所有 sc-*.js 加载即失败；
     ② 必须带 wx 桩（createCanvas / getWindowInfo / onTouch*），否则 CV.setup 就断了。
   只读脚本，不改任何东西。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;                  // ← 坑 ①
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
global.wx = {                                // ← 坑 ②
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};

const loadErrors = [];
const files = ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)));
files.forEach((f) => {
  const p = path.join(JS, f);
  if (!fs.existsSync(p)) return;
  try { require(p); } catch (e) { loadErrors.push(f + ' → ' + e.message); }
});

console.log('\n=== 小游戏页面渲染冒烟 ===');
if (loadErrors.length) {
  console.log('  **有文件加载失败**（后面结果不可信）：');
  loadErrors.forEach((x) => console.log('    ' + x));
}
const CV = global.CV, Core = global.Core;
if (!CV || !Core) { console.log('  CV / Core 没挂上，无法继续 ✗\n'); process.exit(1); }
/* V9.6.70（父亲大人："你这叫瞻前不顾后"）：**这里原来漏了 CV.setup()** ——
   而 CV.render() 开头就是 `if (!CV.ctx) return;`，于是"每一页渲染成功"其实是**一句空话**
   （什么都没画，CV.hits 恒为 0）。真实入口 game.js 是调了 setup 的，这里必须一样。 */
CV.setup(wx.getWindowInfo());
Core.newGame(); Core.setPlayerName('体检'); Core.chooseBloodline ? 0 : 0;
try { Core.choosePlayerBloodline('修真'); } catch (e) {}

const names = Object.keys(CV.panels || {});
const bad = [];
names.forEach((n) => { try { CV.reset(n); } catch (e) { bad.push(n + ' → ' + e.message); } });

console.log('  注册页面 ' + names.length + ' 个 · 完整 render 成功 ' + (names.length - bad.length) + ' 个');
if (bad.length) { console.log('  渲染抛异常的：'); bad.forEach((b) => console.log('    ' + b)); }
else console.log('  每一页都能走完整个渲染管线 ✓');
console.log('');
process.exit(bad.length || loadErrors.length ? 1 : 0);
