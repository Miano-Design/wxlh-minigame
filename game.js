/* 《残域》微信小游戏入口（新版：清包 + 以网页版为底 + 引擎适配层）
   ------------------------------------------------------------------------------
   这个工程里**没有旧的 canvas 界面**：界面只有一处真源（网页版 js/ui.js → js/ui-web.js），
   样式只有一处真源（网页版 css/style.css → 编译成 js/ce-style.js）。
   加载顺序：适配层（wx 存储/广告）→ 逻辑层 → 假 DOM → 网页版界面层 → 引擎应用层。
*/
/* 路线开关（父亲大人要求"试 A"）：
     'A' = 旧的 canvas 手写界面（js/cv.js + js/screens.js + js/ui-canvas.js，35 个界面手绘坐标）
     'B' = 引擎渲染（网页版界面 + 编译样式 → 引擎画到 canvas）—— 现在默认 B
   两套并存、随时切换，方便同机对比。 */
const UI_ROUTE = 'A';

require('./js/wx-adapter.js');   // wx 存储 / window 垫片 / 广告封装
require('./js/data.js');
require('./js/core.js');
require('./js/battle.js');
require('./js/dungeon.js');
if (UI_ROUTE === 'A') {
  /* 路线 A：手写 canvas 界面（逻辑层同一份，只是界面层换成手绘） */
  require('./js/cv.js');
  require('./js/screens.js');
  require('./js/ui-canvas.js').boot();
} else {
require('./js/ce-dom.js').install();   // 假 DOM：让网页版界面代码在小游戏里跑（只取它的界面字符串）
require('./js/ui-web.js');             // 网页版界面层（从 wxlh-game/js/ui.js 同步而来，逐字节一致）
const app = require('./js/ce-app.js').boot();
if (!app) console.error('[CE] 引擎版启动失败：请检查 js/ce-*.js 与 js/ce-style.js 是否齐全');
}

/* 开发期截图：小游戏项目用不了 simulator_screenshot，也**没有** wx.canvasToTempFilePath，
   但 devtools 里的画布是 HTMLCanvasElement → 直接 toDataURL + FileSystemManager 写成 PNG 文件，
   把路径打到 console，康康读那个文件即可。 */
(function () {
  try {
    const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    if (info.platform !== 'devtools') return;
    setTimeout(() => {
      const canvas = globalThis.CE_CANVAS;
      if (!canvas || !canvas.toDataURL) { console.log('[CE-SHOT-FAIL] 画布不支持 toDataURL'); return; }
      let url = '';
      try { url = canvas.toDataURL('image/png'); } catch (e) { console.log('[CE-SHOT-FAIL] toDataURL: ' + e.message); return; }
      const b64 = String(url).split(',')[1] || '';
      const path = (wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : '/tmp') + '/ce-shot.png';
      try {
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (fs && fs.writeFileSync) {
          fs.writeFileSync(path, b64, 'base64');
          console.log('[CE-SHOT] ' + path + ' (' + Math.round(b64.length * 0.75 / 1024) + 'KB)');
          return;
        }
      } catch (e) { console.log('[CE-SHOT-FAIL] 写文件: ' + e.message); }
      console.log('[CE-SHOT-DATAURL] ' + url.slice(0, 200));
    }, 2500);
  } catch (e) { /* 截图失败不该影响游戏 */ }
})();
