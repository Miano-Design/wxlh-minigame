/* 上限联动体检：node scripts/cap_audit.js [玩家等级] [世界序号]

   起因（2026-09-17 父亲大人）：「现在主角等级上限是多少，技能等级总数是不是应该跟等级一样，
   类似这些你是不是应该检查一下数值的联动啥的。」

   这个脚本专门回答"上限之间对不对得上"，一条线一行：
     · 上限（这条线最多能走多远）
     · 点满要花多少（按数据表现算，不靠估）
     · 按当前日收入要多少天
     · 判定：✓ 对得上 / ⚠ 供给过剩（资源永远花不掉）/ ⚠ 遥不可及（>365 天）/ △ 偏长

   只读。改完上限或曲线跑一遍，看有没有新的 ⚠。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA;

const LV = Math.max(1, Math.min(100, +(process.argv[2] || 30)));
const TIER = Math.max(1, Math.min(36, +(process.argv[3] || 3)));   // V9.6.76：世界扩到 36 张
const WORLD = 'W' + String(TIER).padStart(2, '0');

/* ---- 日收入模型（与 design_audit 同一套口径，别各算各的） ---- */
function snapshot(lv) {
  Core.newGame(); Core.setPlayerName('上限体检'); Core.choosePlayerBloodline('修真');
  Core.S.player.level = lv;
  Core.S.buildings = { core: Math.min(50, Math.round(lv / 2)), training: Math.min(50, Math.round(lv / 2)), medical: Math.min(50, lv), workshop: lv, geneLab: lv };
  Core.S.auth = Math.min(10, Math.floor(lv / 10));
  D.UNLOCKS.forEach(u => { Core.S.unlocks[u.id] = true; });
  ['W01', 'W02', 'W03'].forEach(w => { Core.S.worlds[w] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(2), hell: Array(12).fill(0) } }; });
  return Core.S;
}
snapshot(LV);
const r = Core.idleRates();
const sweep = Core.sweepLeft();
const boss = window.Dungeon.battleRewards(WORLD, 'normal', 12, 'boss');
const arena = D.arenaReward(Math.max(1, Math.round(LV / 2)));
const day = {
  points: r.pointsPerMin * 1440 + boss.points * sweep * 0.5,
  /* V9.6.134：货币 8 → 4 —— 原「故事点」并入点数，原「技能芯片 / 血统结晶 / 深井徽记」
     并入异界结晶。`battleRewards` / `arenaReward` 返回的对象**已经**是合并后的口径，
     所以这里不能再按老键名去取（取不到就是 NaN，整个体检会失真）。 */
  otherworld: r.otherworldPer10Min * 144 + boss.otherworld * sweep * 0.5 + arena.otherworld * D.ARENA_DAILY,
  /* V1.0.1（父亲大人）：圣洁晶石从"拍脑袋写死的 20"换成**实测口径** ——
     longrun_sim 的记账钩子（Core.tallyCur）90 天跑出来是日均 145。
     ⚠️ 上一版这里是 20，比真实值低 7 倍 —— 因为那个模拟漏了求签 / 周常 / 成就 / 图鉴，
     而且只打普通难度（首通奖励正是圣洁晶石的头号来源）。尺子漏项会把定价判断带偏。 */
  holy: 145,
  exp: r.expPerMin * 1440 * 1.5 + boss.exp * sweep * 0.5,      // 主角经验：挂机（含闭关领队）+ 副本
  charExp: boss.exp * sweep,                                   // 伙伴经验池：副本/扫荡那一份
  sectExp: D.SECT_EXP.perMin * 1440 + (D.SECT_EXP.normal + D.SECT_EXP.win) * sweep * 0.5,
};

let warn = 0;
const rows = [];
function row(name, cap, cost, note) {
  let worstDays = 0, worstKey = '', noIncome = '';
  Object.entries(cost).forEach(([k, v]) => {
    if (!v) return;
    const daily = day[k] || 0;
    if (daily <= 0) { noIncome = k; return; }
    const d = v / daily;
    if (d > worstDays) { worstDays = d; worstKey = k; }
  });
  let verdict = '✓ 对得上';
  if (noIncome) { verdict = `⚠ ${noIncome} 没有稳定日收入`; warn++; }
  else if (worstDays > 365) { verdict = `⚠ 遥不可及（约 ${(worstDays / 365).toFixed(1)} 年）`; warn++; }
  else if (worstDays > 120) verdict = `△ 偏长（${Math.round(worstDays)} 天）`;
  if (note) { verdict = note; }
  rows.push(`  ${name.padEnd(22, '　')} 上限 ${String(cap).padEnd(9)}${worstDays ? `点满约 ${String(Math.round(worstDays)).padStart(4)} 天（${worstKey}）` : ''.padEnd(18)}  ${verdict}`);
  return worstDays;
}

/* ---- ① 主角自己 ---- */
const expAll = D.EXP_TABLE.reduce((a, b) => a + b, 0);   // V9.5.69：等级从 0 起，全表就是 0→满级
row('主角等级', `Lv.${D.PLAYER_MAX_LV}`, { exp: expAll });
const SKILL_CAPS = D.SKILL_MAX_BY_INDEX;             // V9.5.73：三条技能各有上限 35/35/30
const SKILL_BARS = SKILL_CAPS.length;
const skillSupply = Math.floor(D.PLAYER_MAX_LV / D.SKILL_POINT_EVERY_LV);   // 每 N 级 +1 点
const skillNeed = SKILL_CAPS.reduce((a, b) => a + b, 0);   // 0 基：上限值就是要点几次
{
  const ratio = skillSupply / skillNeed;
  const verdict = ratio > 1.25 ? `⚠ 多出 ${skillSupply - skillNeed} 点没处花（供给是需求的 ${ratio.toFixed(1)} 倍）`
    : ratio < 0.9 ? `⚠ 永远点不满（缺 ${skillNeed - skillSupply} 点）` : '✓ 对得上';
  if (ratio > 1.25 || ratio < 0.8) warn++;
  rows.push(`  ${'主角技能点'.padEnd(22, '　')} 上限 ${SKILL_CAPS.join('/')} 级   需要 ${skillNeed} 点 / Lv.100 给 ${skillSupply} 点   ${verdict}`);
}
{
  const pts = D.PLAYER_MAX_LV * D.ATTR_POINTS_PER_LV;   // Lv.0→Lv.100 共 100 次升级
  rows.push(`  ${'主角六维点'.padEnd(22, '　')} 上限 无（可堆一维）  Lv.100 共 ${pts} 点 → 六维值 +${pts * D.ATTR_POINT_VALUE}   △ 没有硬上限，靠装备/血统/境界制衡`);
}

/* ---- ② 伙伴（一名） ---- */
row('伙伴等级', `Lv.${D.PLAYER_MAX_LV}`, { charExp: expAll, points: D.LEVEL_POINTS.reduce((a, b) => a + b, 0) });
row('伙伴技能 3 条', SKILL_CAPS.join('/'), { otherworld: Core.SKILL_CHIP_COST.reduce((a, b) => a + b, 0) * 3 });
{
  let bc = 0, pt = 0;
  for (let lv = 0; lv < D.BLOODLINE_MAX; lv++) { const c = D.bloodlineCost(lv); bc += c.otherworld; pt += c.points; }
  row('伙伴血统', `Lv.${D.BLOODLINE_MAX}`, { otherworld: bc, points: pt });
  row('主角血统', `Lv.${D.BLOODLINE_MAX}`, { otherworld: bc, points: pt });
}
row('血清全喂满', `${D.SERUMS.length} 种`, { points: D.SERUMS.reduce((s, x) => s + x.max * x.points, 0) });

/* ---- ③ 主角长线 ---- */
row('境界', `${D.REALMS.length} 阶`, { points: Math.round(D.REALMS.reduce((a, x) => a + x.cost.points, 0) / 0.75) });
row('铭刻', `${D.GENE_LOCKS.length} 阶`, { otherworld: D.GENE_LOCKS.reduce((a, g) => a + g.cost.otherworld, 0) });
row('灯阁权限', `Lv.${D.AUTHORITY_MAX}`, (function () { const o = { holy: 0, otherworld: 0 }; for (let lv = 0; lv < D.AUTHORITY_MAX; lv++) { const c = D.authorityCost(lv); o.holy += c.holy; o.otherworld += c.otherworld; } return o; })());
row('建筑 5 座', '各 50 级', (function () { const o = { points: 0 }; D.BUILDINGS.forEach(b => { for (let lv = 1; lv <= 50; lv++) o.points += D.buildingCost(b.id, lv); }); return o; })());
row('秘术阁', `${D.KEJI.reduce((s, k) => s + k.max, 0)} 级`, (function () { const o = { otherworld: 0 }; D.KEJI.forEach(k => { for (let lv = 1; lv <= k.max; lv++) o.otherworld += D.kejiCost(k, lv); }); return o; })());
/* V9.6.134 顺手修：这一行原来把**购买价（点数）**当成异界结晶去除以异界结晶的日收入，
   于是"法宝点满要几天"一直被算大了十几倍（尺子自己有 bug，比数值偏了更坑）。
   现在按真实口径：购买花 ◉ 点数、祭炼花 ◆ 异界结晶，两条分开算。 */
row('法宝', `${D.FABAO.length} 件`, Object.assign(
  { points: D.FABAO.reduce((a, f) => a + (f.cost || 0), 0) },
  { otherworld: D.FABAO.reduce((a, f) => { let s = 0; for (let lv = 0; lv < D.FABAO_MAX_LV; lv++) s += D.fabaoRefineCost(f, lv).otherworld; return a + s; }, 0) }));
row('坐骑', `${D.MOUNTS.length} 匹`, { points: D.MOUNTS.reduce((a, m) => a + ((m.cost && m.cost.points) || 0), 0) });
{
  let cum = 0;
  for (let lv = 1; lv < D.SECT_MAX; lv++) cum += D.sectExpNeed(lv);
  row('灯阁评级', `Lv.${D.SECT_MAX}`, { sectExp: cum });
}

console.log(`=== 上限联动体检（样例存档：玩家 Lv.${LV} · 进度 W${String(TIER).padStart(2, '0')}）===`);
console.log('  日收入（估）：' + ['points', 'otherworld', 'holy', 'exp', 'charExp', 'sectExp'].map(k => `${k} ${Math.round(day[k]).toLocaleString()}`).join(' · '));
console.log('');
rows.forEach(x => console.log(x));

/* ---- 每级的消耗 vs 获取：曲线形状对不对（父亲大人："每级的消耗与获取与游戏进程是否合理"）
   只看"点满要几天"会漏掉一种病：前期白给、后期卡死（或者反过来）。
   所以把每条线的**分段耗时**打出来，看它是不是平滑地变长。 ---- */
console.log('\n=== 每一级要花多久（看曲线形状，不是只看总天数） ===');
function ladder(name, lvTo, costOf, unit, marks) {
  let cum = 0;
  const out = [];
  const maxLv = Math.max(...marks);
  for (let lv = 0; lv < maxLv; lv++) {
    cum += costOf(lv) / (day[unit] || 1);
    if (marks.includes(lv + 1)) out.push(`Lv.${lv + 1} ${cum < 1 ? cum.toFixed(2) : Math.round(cum)} 天`);
  }
  console.log(`  ${name.padEnd(14, '　')} ${out.join(' · ')}`);
}
ladder('主角等级', 100, lv => D.EXP_TABLE[lv], 'exp', [1, 5, 10, 25, 50, 75, 100]);
ladder('伙伴等级', 100, lv => D.EXP_TABLE[lv], 'charExp', [1, 5, 10, 25, 50, 75, 100]);
ladder('建筑（单座）', 50, lv => D.buildingCost('core', lv), 'points', [1, 5, 10, 20, 35, 50]);
ladder('主角血统', D.BLOODLINE_MAX, lv => D.bloodlineCost(lv).points, 'points', [1, 5, 10, 20, 30]);
ladder('灯阁评级', D.SECT_MAX, lv => D.sectExpNeed(lv), 'sectExp', [1, 5, 10, 20, 40, 60]);
ladder('秘术阁（攻伐诀）', D.KEJI[0].max, lv => D.kejiCost(D.KEJI[0], lv + 1), 'otherworld', [1, 5, 10, 20, 30, 60]);
console.log('\n  读法：每一段都是"到这里累计花了几天"。前期（前 10 级）应该以分钟~小时计，');
console.log('        中段线性变长，末段最长但仍在同一条曲线上——中间突然跳档就是数值没接好。');

/* ---- 门槛 vs 上限：不能出现"要求超过上限"的死门槛（V9.5.71 自审新增） ---- */
let gate = 0;
const gateFail = [];
D.GENE_LOCKS.forEach((g, i) => {
  const lvReq = [1, 20, 40, 60, 80][i];
  if (lvReq > D.PLAYER_MAX_LV) { gateFail.push(`铭刻 ${i + 1} 要求 Lv.${lvReq} > 上限 Lv.${D.PLAYER_MAX_LV}`); gate++; }
});
D.REALMS.forEach((r, i) => {
  if (r.lv > D.PLAYER_MAX_LV) { gateFail.push(`境界第 ${i + 1} 阶要求 Lv.${r.lv} > 上限`); gate++; }
});
if (D.BLOODLINE_UNLOCK_LV > D.PLAYER_MAX_LV) { gateFail.push('血统觉醒门槛超过等级上限'); gate++; }
{
  /* 转生阶梯（V9.6.76）：**每一档**的三个门槛都要够得着，不能只看最后一档。
     这是"死锁体检"：上一版三次转生都写着"铭刻 5 阶"，长线模拟 180 天证明那根本到不了。 */
  (D.REINCARN_REQS || []).forEach((need, i) => {
    const nth = i + 1;
    if (need.lv > D.PLAYER_MAX_LV) { gateFail.push(`第 ${nth} 次转生要求 Lv.${need.lv} > 等级上限`); gate++; }
    if (need.geneLock > D.GENE_LOCKS.length) { gateFail.push(`第 ${nth} 次转生要求铭刻 ${need.geneLock} 阶 > 铭刻上限`); gate++; }
    if (need.core > 50) { gateFail.push(`第 ${nth} 次转生要求灯芯 Lv.${need.core} > 建筑上限`); gate++; }
  });
  const reqs = D.REINCARN_REQS || [];
  if (!reqs.length) { gateFail.push('转生阶梯是空的（转生会变成无门槛）'); gate++; }
  reqs.forEach((r, i) => {
    if (i && (r.geneLock < reqs[i - 1].geneLock || r.core < reqs[i - 1].core)) { gateFail.push(`第 ${i + 1} 次转生比上一次还容易（阶梯倒挂了）`); gate++; }
  });
}
console.log('\n=== 门槛 vs 上限（有没有"这辈子到不了"的解锁条件）===');
console.log(`  铭刻 5 阶要 Lv.${[1, 20, 40, 60, 80].slice(-1)[0]} · 境界 36 阶要 Lv.${D.REALMS[D.REALMS.length - 1].lv} · 评级上限 Lv.${D.SECT_MAX}`);
console.log('  转生阶梯：' + (D.REINCARN_REQS || []).map((r, i) => `第${i + 1}次=Lv.${r.lv}+铭刻${r.geneLock}+灯芯${r.core}`).join(' · '));
console.log(gateFail.length ? '  ' + gateFail.map(x => '✗ ' + x).join('\n  ') : '  所有门槛都在上限之内 ✓');

/* ---- 深井曲线单调性 + 段界连续性（V9.5.87 十五度自审新增） ----
   起因：深井的成长是**分段**的（1~100 层 6%、101~300 层 4.5%、301 层起 3.5%），
   而旧写法每段都从第 0 层重新起算指数，于是段界不是"接着涨"而是**倒扣**：
   第 101 层比第 100 层软 4 倍、第 301 层比第 300 层软 17 倍 —— 玩家啃完 100 层 BOSS，
   下一层比第 88 层还软。这种错不会报错、不会崩，只会让数值静默地不合理。 */
let curveBad = 0;
{
  const baseHp = f => { const e = D.corridorEnemy(f); return e.hp / (e.isBoss ? 2.4 : e.isElite ? 1.7 : 1); };
  const issues = [];
  let prev = baseHp(1), prevF = 1;
  for (let f = 2; f <= 400; f++) {
    const e = D.corridorEnemy(f);
    if (e.isElite || e.isBoss) continue;                 // 精英/Boss 是倍率，跨类型比单调没意义
    const cur = baseHp(f);
    const perStep = Math.pow(cur / prev, 1 / (f - prevF));   // 摊到每一层的平均增幅
    if (perStep < 1.0) issues.push(`第 ${f} 层反而比第 ${prevF} 层软（${Math.round(prev)} → ${Math.round(cur)}）`);
    else if (perStep > 1.075) issues.push(`第 ${prevF}→${f} 层平均每层 ×${perStep.toFixed(3)}（最陡的一段才 1.060，说明段界没接上）`);
    prev = cur; prevF = f;
  }
  console.log('\n=== 深井曲线：单调递增 + 段界不许断档（1~400 层）===');
  console.log(issues.length ? '  ' + issues.slice(0, 5).map(x => '✗ ' + x).join('\n  ') : '  ✓ 1~400 层单调递增，100 / 300 层段界都接得上');
  curveBad = issues.length;
}

console.log(`\n结论：${warn === 0 && !curveBad ? '所有上限之间对得上、曲线也没断档 ✓'
  : (warn ? '有 ' + warn + ' 处上限对不上' : '') + (curveBad ? (warn ? '、' : '') + '深井曲线有 ' + curveBad + ' 处断档' : '') + '，要调'}`);
