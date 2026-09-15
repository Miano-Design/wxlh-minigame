/* 把网页版的逻辑层同步到小游戏工程里。
   用法：node scripts/sync-logic.js

   为什么要同步而不是各改一份：数值、战斗、副本、招募这些逻辑**只有一份真相**，
   它住在 ../wxlh-game/js/。小游戏这边只负责渲染与广告，逻辑一律从那 4 个文件拷过来。
   以后修 bug / 调数值 → 只改网页版 → 跑这个脚本 → 两个版本一起更新。
*/
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../wxlh-game/js');
const DST = path.resolve(__dirname, '../js');
/* 逻辑层 4 份：必须逐字节一致，而且不许碰 DOM */
const FILES = ['data.js', 'core.js', 'battle.js', 'dungeon.js'];
/* 路线 B 额外复用网页版的**界面层**（js/ui.js → js/ui-web.js）：同样逐字节一致。
   它当然会碰 DOM——那正是我们要复用的"界面字符串工厂"，
   小游戏里由 js/ce-dom.js 垫一套假 DOM 撑着跑，所以不参与下面的 DOM 检查。 */
const EXTRA = { 'ui.js': 'ui-web.js' };

let changed = 0, same = 0;
const JOBS = FILES.map(f => [f, f]).concat(Object.keys(EXTRA).map(k => [k, EXTRA[k]]));
JOBS.forEach(([f, out]) => {
  const a = path.join(SRC, f), b = path.join(DST, out);
  if (!fs.existsSync(a)) { console.error('✗ 找不到源文件：' + a); process.exitCode = 1; return; }
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
