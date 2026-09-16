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
const TIER = Math.max(1, Math.min(15, +(process.argv[3] || 3)));
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
  story: 1440 / 30 + boss.story * sweep * 0.5,
  otherworld: r.otherworldPer10Min * 144 + boss.otherworld * sweep * 0.5 + arena.otherworld * D.ARENA_DAILY,
  holy: 20,
  skillChip: boss.skillChip * sweep * 0.5,
  bloodCrystal: boss.bloodCrystal * sweep * 0.5 + 30,
  corridor: LV / 2 + arena.corridor * D.ARENA_DAILY,
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
const expAll = D.EXP_TABLE.slice(1).reduce((a, b) => a + b, 0);
row('主角等级', `Lv.${D.EXP_TABLE.length - 1}`, { exp: expAll });
const SKILL_MAX = D.SKILL_MAX;                       // 技能等级上限（主角与伙伴共用）
const SKILL_BARS = 3;                                // 主角技能固定 3 条
const skillSupply = Math.floor((D.EXP_TABLE.length - 1) / D.SKILL_POINT_EVERY_LV);   // 每 N 级 +1 点
const skillNeed = (SKILL_MAX - 1) * SKILL_BARS;
{
  const ratio = skillSupply / skillNeed;
  const verdict = ratio > 1.25 ? `⚠ 多出 ${skillSupply - skillNeed} 点没处花（供给是需求的 ${ratio.toFixed(1)} 倍）`
    : ratio < 0.8 ? `⚠ 永远点不满（缺 ${skillNeed - skillSupply} 点）` : '✓ 对得上';
  if (ratio > 1.25 || ratio < 0.8) warn++;
  rows.push(`  ${'主角技能点'.padEnd(22, '　')} 上限 3 条×Lv.${SKILL_MAX}   需要 ${skillNeed} 点 / Lv.100 给 ${skillSupply} 点   ${verdict}`);
}
{
  const pts = (D.EXP_TABLE.length - 1 - 1) * D.ATTR_POINTS_PER_LV;
  rows.push(`  ${'主角六维点'.padEnd(22, '　')} 上限 无（可堆一维）  Lv.100 共 ${pts} 点 → 六维值 +${pts * D.ATTR_POINT_VALUE}   △ 没有硬上限，靠装备/血统/境界制衡`);
}

/* ---- ② 伙伴（一名） ---- */
row('伙伴等级', `Lv.${D.EXP_TABLE.length - 1}`, { charExp: expAll, points: D.LEVEL_POINTS.slice(1).reduce((a, b) => a + b, 0) });
row('伙伴技能 3 条', `Lv.${SKILL_MAX}`, { skillChip: Core.SKILL_CHIP_COST.reduce((a, b) => a + b, 0) * 3 });
{
  let bc = 0, pt = 0;
  for (let lv = 0; lv < D.BLOODLINE_MAX; lv++) { const c = D.bloodlineCost(lv); bc += c.bloodCrystal; pt += c.points; }
  row('伙伴血统', `Lv.${D.BLOODLINE_MAX}`, { bloodCrystal: bc, points: pt });
  row('主角血统', `Lv.${D.BLOODLINE_MAX}`, { bloodCrystal: bc, points: pt });
}
row('血清全喂满', `${D.SERUMS.length} 种`, { points: D.SERUMS.reduce((s, x) => s + x.max * x.points, 0) });

/* ---- ③ 主角长线 ---- */
row('境界', `${D.REALMS.length} 阶`, { points: Math.round(D.REALMS.reduce((a, x) => a + x.cost.points, 0) / 0.75) });
row('铭刻', `${D.GENE_LOCKS.length} 阶`, { bloodCrystal: D.GENE_LOCKS.reduce((a, g) => a + g.cost.bloodCrystal, 0) });
row('灯阁权限', `Lv.${D.AUTHORITY_MAX}`, (function () { const o = { holy: 0, otherworld: 0 }; for (let lv = 0; lv < D.AUTHORITY_MAX; lv++) { const c = D.authorityCost(lv); o.holy += c.holy; o.otherworld += c.otherworld; } return o; })());
row('建筑 5 座', '各 50 级', (function () { const o = { points: 0 }; D.BUILDINGS.forEach(b => { for (let lv = 1; lv <= 50; lv++) o.points += D.buildingCost(b.id, lv); }); return o; })());
row('秘术阁', `${D.KEJI.reduce((s, k) => s + k.max, 0)} 级`, (function () { const o = { otherworld: 0 }; D.KEJI.forEach(k => { for (let lv = 1; lv <= k.max; lv++) o.otherworld += D.kejiCost(k, lv); }); return o; })());
row('法宝', `${D.FABAO.length} 件`, { otherworld: D.FABAO.reduce((a, f) => a + (f.cost || 0), 0) });
row('坐骑', `${D.MOUNTS.length} 匹`, { points: D.MOUNTS.reduce((a, m) => a + ((m.cost && m.cost.points) || 0), 0) });
{
  let cum = 0;
  for (let lv = 1; lv < D.SECT_MAX; lv++) cum += D.sectExpNeed(lv);
  row('灯阁评级', `Lv.${D.SECT_MAX}`, { sectExp: cum });
}

console.log(`=== 上限联动体检（样例存档：玩家 Lv.${LV} · 进度 W${String(TIER).padStart(2, '0')}）===`);
console.log('  日收入（估）：' + ['points', 'otherworld', 'holy', 'skillChip', 'bloodCrystal', 'exp', 'charExp', 'sectExp'].map(k => `${k} ${Math.round(day[k]).toLocaleString()}`).join(' · '));
console.log('');
rows.forEach(x => console.log(x));
console.log(`\n结论：${warn === 0 ? '所有上限之间对得上 ✓' : '有 ' + warn + ' 处上限对不上，要调'}`);
