/* canvas 界面体检：node scripts/canvas_audit.js

   起因（V9.5.82 自审）：小游戏这边 `js/sc-*.js` 是**手写的 canvas 界面**，
   不像 `js/ui.js` 那样从网页版逐字节同步——所以网页版改了数值/口径之后，
   canvas 里最容易留下"旧数字、旧文案"。这轮就抓到：技能还写着 `/10`（上限早改成 35/35/30）、
   境界还是 1 基（"第 N+1 阶"）、"重置回 Lv.1"、"这一步不能拖到 Lv.10"、"点【主角】卡里选血统"。

   这个脚本把这些"网页版已经改掉、canvas 里可能还留着"的写法列成规则，跑一次全扫。 */
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '../js');
const files = fs.readdirSync(DIR).filter(f => /^sc-.*\.js$/.test(f));
let bad = 0;

const RULES = [
  [/重置回 Lv\.1/, '等级从 0 起 → 应写 Lv.0'],
  [/不能拖到 Lv\.1?0?/, '血统是开局必经的一步，不该再提"拖到某级"'],
  [/\/10）/, '技能上限已改成 35/35/30，不能写死 /10'],
  [/skillLv \|\| \[1, 1, 1\]/, '技能从 0 级起，兜底数组应为 [0, 0, 0]'],
  [/'点【主角】卡里选血统'/, '血统是开局必经的一步，不该再引导"选血统"'],
  [/Math\.min\(st\.realm \+ 1/, '境界从 0 阶起算，应显示"已突破 N 阶"'],
  /* V9.5.93：这条原来写成 /\/ 100\b/，把"能量/100""经验百分比/100"也算成"写死等级上限"了（假警报）。
     改成只在**等级语境**里查：lv/level 出现 "/ 100" 才算写死。 */
  [/(?:lv|Lv|level|等级)\s*(?:>=|<=|>|<|===|==)\s*100\b/, '等级上限请用 D.PLAYER_MAX_LV，不要写死 100'],
];
// 容易写错的：技能每条上限不同，不能用统一的 SKILL_MAX
const MUST_USE = [
  [/D\.SKILL_MAX\b(?!_BY_INDEX)/, '技能每条上限不同 → 请用 D.SKILL_MAX_BY_INDEX[i]'],
];

files.forEach(f => {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  RULES.forEach(([re, why]) => {
    if (re.test(src)) { bad++; console.log(`  ✗ ${f}：命中 ${re} —— ${why}`); }
  });
  // 只在真有技能等级显示的地方检查 MUST_USE
  if (/skillLv/.test(src)) {
    MUST_USE.forEach(([re, why]) => {
      if (re.test(src)) { bad++; console.log(`  ✗ ${f}：命中 ${re} —— ${why}`); }
    });
  }
});

console.log(`\n扫了 ${files.length} 个 canvas 界面文件（${files.join(' ')}）`);
console.log(bad === 0 ? '结论：canvas 界面与网页版口径一致 ✓' : `结论：有 ${bad} 处 canvas 内容没跟上网页版`);
process.exit(bad ? 1 : 0);
