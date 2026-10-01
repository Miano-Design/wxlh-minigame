/* 最小运行适配层（六个 audit 共用）—— **把游戏本身真的加载进来**，不复制任何游戏公式。
   假的只有"画布 / wx 接口 / 存档落盘"这三样，`data.js / core.js / battle.js / dungeon.js / cv.js`
   与线上跑的是同一份代码。加载失败一律由调用方报 `BLOCKED`，**绝不当成 PASS**。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'js');

function boot(opts) {
  opts = opts || {};
  const W = opts.width || 390, H = opts.height || 844;
  const store = {};
  const TEXT = [];
  global.GameGlobal = global;
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
      if (k === 'fillText') return (s) => { TEXT.push(String(s)); };
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
        'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
      if (props.indexOf(k) >= 0) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const canvas = { width: W, height: H, getContext: () => ctx, toDataURL: () => '' };
  global.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: W, windowHeight: H, pixelRatio: 3, safeArea: { top: opts.safeTop || 44, bottom: opts.safeBottom || (H - 34) } }),
    getSystemInfoSync: () => ({ platform: 'devtools', SDKVersion: '3.5.0' }),
    onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
    onWindowResize() {}, onShow() {}, onHide() {},
    getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
    setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {}, hideKeyboard() {},
    vibrateShort() {}, setKeepScreenOn() {}, triggerGC() {}, onMemoryWarning() {},
    env: { USER_DATA_PATH: '/tmp' },
  };
  ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
    .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
    .forEach((f) => {
      const p = path.join(JS, f);
      if (fs.existsSync(p)) require(p);
    });
  const CV = global.CV;
  CV.setup(global.wx.getWindowInfo());
  return { CV, Core: global.Core, D: global.DATA, U: global.GameGlobal.U, G: global.GameGlobal, TEXT, store, ROOT, JS };
}

/** 读源码某一行（audit 报"行号"用） */
function lineOf(file, needle) {
  try {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) if (lines[i].indexOf(needle) >= 0) return i + 1;
  } catch (e) {}
  return 0;
}
module.exports = { boot, lineOf, ROOT, JS };
