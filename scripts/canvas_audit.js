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
  [/'点【主角】卡里选命格'/, '命格是开局必经的一步，不该再引导"选命格"'],
  [/Math\.min\(st\.realm \+ 1/, '境界从 0 阶起算，应显示"已突破 N 阶"'],
  /* V9.5.93：这条原来写成 /\/ 100\b/，把"能量/100""经验百分比/100"也算成"写死等级上限"了（假警报）。
     改成只在**等级语境**里查：lv/level 出现 "/ 100" 才算写死。 */
  [/(?:lv|Lv|level|等级)\s*(?:>=|<=|>|<|===|==)\s*100\b/, '等级上限请用 D.PLAYER_MAX_LV，不要写死 100'],
  /* V9.6.90（技能《weixin-game》§4「颜色格式限制」查出来的）：
     微信画布对 `#RRGGBBAA` 这种 8 位 hex **部分支持/不稳定**，赋值失败时会沿用上一次的填充色
     —— 表现就是"黑底黑字"（父亲大人最早报的毛病，一直没找到根）。
     全仓改成 rgba() 之后加这条规则钉住，别再写回去。（注释里提到不算，见下面的过滤） */
  [/(?:fillStyle|strokeStyle|shadowColor|addColorStop|lineSoft:|CV\.round\()[^\n]*#[0-9a-fA-F]{8}\b/, '画布颜色请用 rgba()，不要用 8 位 hex（#RRGGBBAA 在微信画布上不稳定）'],
  /* V9.6.122（父亲大人："残域的世界排版也有问题"）—— 残域详情页**必须**带上网页版的那三样，
     不然玩家看不出精英关/守关 Boss 是什么，也不知道 ⚔ 是什么意思：
       · 关卡格的 ⚔ 精英角标（网页版 .sc-mark）
       · 格子下面那行图例（网页版 <div class="hint mt2">）
       · 格子字号走层级（网页版 .stage-cell 现为二级 15px，别再写 14/16/20 这种编外值） */
  [/stage:\s*' \+ i[\s\S]{0,400}?size:\s*\(isBoss \?/, '关卡格字号必须走层级 token（原来是编外的 14/16/20）'],
];

/* 残域详情页的"三件套"——缺一个都算没复刻到位 */
/* 战斗页：波间提示必须是"飘过就消失的一行字"，不能是金色描边小框
   （V9.6.123 父亲大人："继续推进那个提示看着像要点击"） */
const BATTLE_MUST = [
  [/B\.tipAt/, '波次弹幕缺动画起点（tipAt）——应该是飘上去淡出，不是一直挂着'],
  [/clearInterval\(B\.tipT\)/, '波次弹幕的动画计时器没在离场清理里清掉（会空转）'],
];
const BATTLE_FORBID = [
  [/CV\.round\([^\n]*B\.tip[^\n]*CV\.C\.gold/, '波次提示不许画成金色描边框（看着像按钮）'],
  [/'继续推进…'|继续推进/, '文案已改成"第 N/M 波"，不要再写"继续推进"'],
];
const DUNGEON_MUST = [
  [/U\.hint\('⚔ 精英关（更硬、掉得更好）· 🔱 守关 Boss（打完开下一个世界）'/, '关卡格下面缺网页版那行图例（⚔/🔱 的含义）'],
  [/isElite[\s\S]{0,200}?CV\.text\('⚔'/, '精英关注册不到 ⚔ 角标（网页版 .sc-mark）'],
  [/Dun\.wavePlan\(i \+ 1\)\.indexOf\('elite'\)/, '精英关判定要跟网页版同源（Dun.wavePlan）'],
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
  /* 战斗页的波次弹幕：查必须有的（tipAt/清理）与不许有的（金框/旧文案） */
  if (f === 'sc-battle.js') {
    BATTLE_MUST.forEach(([re, why]) => { if (!re.test(src)) { bad++; console.log(`  ✗ ${f}：缺 ${why}`); } });
    /* 源码里可能整段注释提到"继续推进"，先剥注释再查禁用项 */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
    BATTLE_FORBID.forEach(([re, why]) => { if (re.test(code)) { bad++; console.log(`  ✗ ${f}：命中 ${re} —— ${why}`); } });
  }
  /* 残域详情页的"三件套"：只在 sc-dungeon.js 里查（缺一样就是没复刻到位） */
  if (f === 'sc-dungeon.js') {
    DUNGEON_MUST.forEach(([re, why]) => {
      if (!re.test(src)) { bad++; console.log(`  ✗ ${f}：缺 ${why}`); }
    });
  }
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
