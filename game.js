/* 《残域》微信小游戏入口

   加载顺序很重要：
   ① 先跑适配层——它把 window / localStorage 这两个"网页世界的东西"垫好，
      网页版那套逻辑代码（data/core/battle/dungeon）才能原样跑起来；
   ② 再按依赖顺序加载逻辑层（和 index.html 里的顺序一致）；
   ③ 最后交给 Canvas 界面层。
   逻辑层请用 scripts/sync-logic.js 从网页版同步，不要在这个文件夹里手改。 */

require('./js/wx-adapter.js');
require('./js/data.js');
require('./js/core.js');
require('./js/battle.js');
require('./js/dungeon.js');

/* 路线 B 样片开关（2026-09-15）：
     true  = 用官方引擎 + 网页版样式渲染首页（js/ce-home.js，见 README「路线 B」一节）
     false = 走原来的手绘 Canvas 界面层（js/cv.js + js/screens.js + js/ui-canvas.js）
   Node 无头测试（scripts/test-minigame.js）会先把 globalThis.CE_SAMPLE 置成 false，
   这样那 55 项旧测试仍然测的是原来的界面层。全量迁移完成后，本开关连同旧界面层一起删。 */
const CE_SAMPLE = (typeof globalThis !== 'undefined' && globalThis.CE_SAMPLE !== undefined)
  ? globalThis.CE_SAMPLE : true;

let ceOk = false;
if (CE_SAMPLE) {
  try {
    require('./js/ce-dom.js').install();   // 垫一套假 DOM：网页版界面层的字符串工厂才能跑
    require('./js/ui-web.js');             // 网页版界面层（从 wxlh-game/js/ui.js 同步而来）
    ceOk = !!require('./js/ce-app.js').boot();
  } catch (e) {
    console.error('[CE] 引擎版启动失败，回退原来的界面层：' + (e && e.message));
    ceOk = false;
  }
}

if (!ceOk) {
  /* 没开开关、引擎没起来、或者还没有存档（首次进入要走起名 / 选血统）→ 交给原来的界面层 */
  require('./js/cv.js');        // Canvas 界面框架
  require('./js/screens.js');   // 全部界面
  require('./js/ui-canvas.js').boot();
}
