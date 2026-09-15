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

const UI = require('./js/ui-canvas.js');

UI.boot();
