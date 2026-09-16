/* 路线 B · Node 里的假环境（构建脚本与测试共用）
   ------------------------------------------------------------------------------
   样式编译器和无头测试都要"像小游戏那样"把逻辑层 + 网页版界面层跑起来，
   这样编译出来的样式表就是运行时真正会用到的那一份（同一份代码、同一份数据）。
*/
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function install(extra) {
  const store = {};
  global.GameGlobal = global;
  global.window = global;
  global.localStorage = null;
  global.wx = Object.assign({
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    getStorageInfoSync: () => ({ keys: Object.keys(store) }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44 } }),
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, platform: 'devtools', safeArea: { top: 44 } }),
    createCanvas: () => ({ getContext: () => makeCtx(), width: 0, height: 0 }),
    onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onTouchCancel: () => {},
    offTouchStart: () => {}, offTouchMove: () => {}, offTouchEnd: () => {}, offTouchCancel: () => {},
    onShow: () => {}, onHide: () => {},
  }, extra || {});

  require(path.resolve(ROOT, 'js/ce-dom.js')).install();
  require(path.resolve(ROOT, 'js/wx-adapter.js'));
  require(path.resolve(ROOT, 'js/data.js'));
  require(path.resolve(ROOT, 'js/core.js'));
  require(path.resolve(ROOT, 'js/battle.js'));
  require(path.resolve(ROOT, 'js/dungeon.js'));
  if (!window.Core.load()) window.Core.newGame();
  require(path.resolve(ROOT, 'js/ui-web.js'));      // 网页版界面层（字符串工厂）
  return { Core: window.Core, DATA: window.DATA, UI: window.UI, store };
}

/* 假 2d context：文字量宽度给个像样的估算，别的调用一律吞掉 */
function makeCtx() {
  const base = {
    canvas: { width: 390, height: 844 },
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font || '');
      const fs = m ? parseFloat(m[1]) : 14;
      let w = 0;
      for (const ch of String(s)) w += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? fs : fs * 0.55;
      return { width: w };
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    measureTextWidth: () => 0,
  };
  /* 其余 canvas API 一律当空函数：引擎画圆角、画图会用到一堆我们没逐个列的方法，
     漏一个就抛错、漏一个就白测一次，索性用 Proxy 兜住（measureText 这种有返回值的单独给）。 */
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : (t[k] = () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

module.exports = { install, makeCtx, ROOT };
