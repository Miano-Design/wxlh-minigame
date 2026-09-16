/* 把网页版的逻辑层同步到小游戏工程里。
   用法：node scripts/sync-logic.js

   为什么要同步而不是各改一份：数值、战斗、副本、招募这些逻辑**只有一份真相**，
   它住在 ../wxlh-game/js/。小游戏这边只负责渲染与广告，逻辑一律从那 4 个文件拷过来。
   以后修 bug / 调数值 → 只改网页版 → 跑这个脚本 → 两个版本一起更新。
*/
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../wxlh-game/js');
const WEB_ROOT = path.resolve(__dirname, '../../wxlh-game');   // 网页版根目录（底包文件在它下面）
const PROJ = path.resolve(__dirname, '..');                    // 本工程根目录
const DST = path.resolve(__dirname, '../js');
/* 逻辑层 4 份：必须逐字节一致，而且不许碰 DOM */
const FILES = ['data.js', 'core.js', 'battle.js', 'dungeon.js'];
/* 路线 B 额外复用网页版的**界面层**（js/ui.js → js/ui-web.js）：同样逐字节一致。
   它当然会碰 DOM——那正是我们要复用的"界面字符串工厂"，
   小游戏里由 js/ce-dom.js 垫一套假 DOM 撑着跑，所以不参与下面的 DOM 检查。
   js/ui.js 也一起刷（底包快照 index.html 引的就是它），免得两份界面层各老各的。 */
const EXTRA = { 'ui.js': ['ui-web.js', 'ui.js'], 'main.js': 'main.js' };
/* 网页版的"包"也一起搬一份（新工程以网页版为底）：入口页、样式、图标清单。
   注意：小游戏运行时用的是编译好的 js/ce-style.js，css/style.css 只是"底包快照"。 */
const PACK = [['index.html', 'index.html'], ['css/style.css', 'css/style.css'],
  ['manifest.webmanifest', 'manifest.webmanifest'], ['sw.js', 'sw.js']];
/* 测试与体检脚本也一起同步（它们本来就和网页版逐字节一致，各留一份会各自变旧，
   结果是小游戏这边跑的还是上一版的用例——2026-09-17 发现并补上）。 */
const CHECKS = ['test_ui.js', 'test_game.js', 'balance_check.js', 'design_audit.js', 'product_audit.js', 'copy_audit.js', 'cap_audit.js'];

let changed = 0, same = 0;
const JOBS = [];
FILES.forEach(f => JOBS.push([f, f]));
Object.keys(EXTRA).forEach(k => [].concat(EXTRA[k]).forEach(out => JOBS.push([k, out])));
PACK.forEach(([a, b]) => JOBS.push([a, b]));
CHECKS.forEach(f => JOBS.push(['scripts/' + f, 'scripts/' + f]));
JOBS.forEach(([f, out]) => {
  const fromJs = FILES.indexOf(f) >= 0 || (EXTRA[f] !== undefined && !f.startsWith('scripts/'));
  const a = path.join(fromJs ? SRC : WEB_ROOT, f), b = path.join(fromJs ? DST : PROJ, out);
  if (!fs.existsSync(a)) { console.error('✗ 找不到源文件：' + a); process.exitCode = 1; return; }
  if (f.startsWith('scripts/') && !fs.existsSync(path.dirname(b))) fs.mkdirSync(path.dirname(b), { recursive: true });
  const src = fs.readFileSync(a);
  const old = fs.existsSync(b) ? fs.readFileSync(b) : null;
  if (old && old.equals(src)) { same++; console.log('= ' + f + ' → ' + out + '（一致）'); return; }
  fs.writeFileSync(b, src);
  changed++;
  console.log('✓ ' + f + ' → ' + out + '（已更新）');
});

// 顺手体检：逻辑层不许碰 DOM（碰了就说明有人在里面写了界面代码，小游戏会直接崩）
const FORBIDDEN = [/\bdocument\./, /\bnavigator\./, /querySelector/, /createElement/];
let bad = [];
FILES.forEach(f => {
  const txt = fs.readFileSync(path.join(DST, f), 'utf8');
  FORBIDDEN.forEach(re => { if (re.test(txt)) bad.push(f + ' 命中 ' + re); });
});
if (bad.length) {
  console.error('\n✗ 逻辑层里出现了 DOM 调用（小游戏没有 DOM，跑不起来）：\n  ' + bad.join('\n  '));
  process.exitCode = 1;
} else {
  console.log('\n✓ 逻辑层没有 DOM 依赖（可原样跑在小游戏里）');
}
console.log(`\n同步完成：更新 ${changed} 个，未变 ${same} 个。`);
