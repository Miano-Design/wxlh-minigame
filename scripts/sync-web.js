/* 把网页版整包同步进小游戏工程：node scripts/sync-web.js
   父亲大人原来靠"手动清空 + 粘贴网页版"，但那会把适配层/路线A/文档/截图一起清掉。
   这个脚本只覆盖"网页版那一份"（页面、样式、图标清单、逻辑层、界面层、网页版自带测试），
   康康自己写的东西（ce-*.js / cv.js / screens.js / ui-canvas.js / scripts / docs / 截图）一律不动。
*/
const fs = require('fs');
const path = require('path');
const WEB = path.resolve(__dirname, '../../wxlh-game');
const DST = path.resolve(__dirname, '..');

const FILES = [
  'index.html', 'manifest.webmanifest', 'sw.js',
  'css/style.css',
  'js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js', 'js/main.js',
  'scripts/test_game.js', 'scripts/test_ui.js',
];
let n = 0;
FILES.forEach((f) => {
  const a = path.join(WEB, f), b = path.join(DST, f);
  if (!fs.existsSync(a)) { console.log('跳过（网页版没有）：' + f); return; }
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.copyFileSync(a, b);
  n++;
});
/* 图标整个目录同步 */
const iconsA = path.join(WEB, 'icons'), iconsB = path.join(DST, 'icons');
if (fs.existsSync(iconsA)) {
  fs.mkdirSync(iconsB, { recursive: true });
  fs.readdirSync(iconsA).forEach((f) => fs.copyFileSync(path.join(iconsA, f), path.join(iconsB, f)));
  n++;
}
console.log(`✓ 网页版整包已同步：${n} 项（适配层 / 路线A / 文档 / 截图 都没动）`);
