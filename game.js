/* 《残域》微信小游戏入口（新版：清包 + 以网页版为底 + 引擎适配层）
   ------------------------------------------------------------------------------
   这个工程里**没有旧的 canvas 界面**：界面只有一处真源（网页版 js/ui.js → js/ui-web.js），
   样式只有一处真源（网页版 css/style.css → 编译成 js/ce-style.js）。
   加载顺序：适配层（wx 存储/广告）→ 逻辑层 → 假 DOM → 网页版界面层 → 引擎应用层。
*/
require('./js/wx-adapter.js');   // wx 存储 / window 垫片 / 广告封装
require('./js/data.js');
require('./js/core.js');
require('./js/battle.js');
require('./js/dungeon.js');
require('./js/ce-dom.js').install();   // 假 DOM：让网页版界面代码在小游戏里跑（只取它的界面字符串）
require('./js/ui-web.js');             // 网页版界面层（从 wxlh-game/js/ui.js 同步而来，逐字节一致）
const app = require('./js/ce-app.js').boot();
if (!app) console.error('[CE] 引擎版启动失败：请检查 js/ce-*.js 与 js/ce-style.js 是否齐全');
