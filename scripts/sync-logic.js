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
/* V9.6.66（父亲大人点头）：**路线 B 整套拆掉** ——
   以前这里还顺手把网页版的界面层（ui.js → ui-web.js）/ 入口页 / 样式 / 图标清单，
   以及"只审网页版"的那几个脚本（test_ui / product_audit / copy_audit /
   design_audit / spec_audit / data_audit / sync-web）一起搬进来。
   那些文件小游戏一次都没加载过（入口是 game.js），却让工程里躺着 600KB 的副本，
   谁看都以为"小游戏有两套界面"。现在只同步**小游戏真正会用**的东西 ——
   逻辑层 4 份 + 逻辑层的体检脚本；要审网页版的界面，回 ../wxlh-game 跑那边的同名脚本。 */
/* 测试与体检脚本：只同步"纯逻辑层"的那几份。
   balance_check / longrun_sim / world_curve 因为要 eval 网页版的 ui.js（界面层），
   路径已经改成读 ../wxlh-game，属于小游戏自己的副本 —— 再同步会把那行路径覆盖掉，所以不同步。 */
/* drop_table.js 是"纯逻辑层"的尺子（只读 data.js + dungeon.js，不碰界面），
   所以两边各留一份、跟着同步 —— 掉落表改完，网页版和小游戏看到的概率表必须是同一张。 */
const CHECKS = ['test_game.js', 'cap_audit.js', 'drop_table.js'];

let changed = 0, same = 0;
const JOBS = [];
FILES.forEach(f => JOBS.push([f, f]));
CHECKS.forEach(f => JOBS.push(['scripts/' + f, 'scripts/' + f]));
JOBS.forEach(([f, out]) => {
  const a = path.join(f.startsWith('scripts/') ? WEB_ROOT : SRC, f);
  const b = path.join(f.startsWith('scripts/') ? PROJ : DST, out);
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
