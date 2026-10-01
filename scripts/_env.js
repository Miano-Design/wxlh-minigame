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
  /* ================= R1.9 整合：加载清单**从 game.js 派生** =================
     以前这里写死成"7 个基础文件 + 所有 `sc-*.js`" —— 于是**任何不叫 `sc-` 的页面层都不会被加载**
     （2.0 的 `js/overhaul-2.0.js` 正好不是 `sc-` 开头）。
     后果是典型的"审计环境才生效"：尺子测的是 A，真机跑的是 B（任务书 §15 明令禁止）。
     现在直接读 `game.js` 里的 `require('./js/xxx.js')` **按真实顺序**加载 ——
     真机加载什么，尺子就加载什么；以后再加文件也不用回来同步这份清单。 */
  function runtimeList() {
    const out = [];
    try {
      const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
      src.replace(/require\(['"]\.\/js\/([^'"]+)['"]\)/g, (m, f) => { out.push(f); return m; });
    } catch (e) {}
    /* 兜底：万一 game.js 读不到（老环境），退回原来的写法，不许因此少加载界面层 */
    if (!out.length) {
      return ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
        .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)));
    }
    return out;
  }
  runtimeList().forEach((f) => {
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
