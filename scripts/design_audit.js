/* 设计体检（策划 / 产品视角）：node scripts/design_audit.js [玩家等级] [世界序号]

   它回答四个问题：
   ① 经济：每种货币"一天能进多少"和"要花掉多少"对不对得上（有没有只进不出 / 只出不进的死货币）；
   ② 曲线：主角从 Lv1 练到各档要多少小时纯挂机（挂机是这个游戏的主循环，时间就是难度）；
   ③ 死内容：道具 / 功能有没有"存在但在界面上找不到入口"的；
   ④ 死代码：渲染函数和绑定函数写了但没人调用（改版删界面时最容易留下的坑）。

   这是只读体检，不改任何东西；改完数值跑一下看数字有没有回到合理区间。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA;
const uiSrc = fs.readFileSync('js/ui.js', 'utf8');
const dataSrc = fs.readFileSync('js/data.js', 'utf8');
const coreSrc = fs.readFileSync('js/core.js', 'utf8');

const LV = Math.max(1, Math.min(100, +(process.argv[2] || 30)));
const TIER = Math.max(1, Math.min(15, +(process.argv[3] || 3)));   // 世界序号：1=W01
const WORLD = 'W' + String(TIER).padStart(2, '0');

/* ---------------- 一份可复现的"中期存档" ---------------- */
function snapshot(lv) {
  Core.newGame(); Core.setPlayerName('体检'); Core.choosePlayerBloodline('修真');
  Core.S.player.level = lv;
  Core.S.buildings = { core: Math.min(50, Math.round(lv / 2)), training: Math.min(50, Math.round(lv / 2)), medical: Math.min(50, lv), workshop: lv, geneLab: lv };
  Core.S.auth = Math.min(10, Math.floor(lv / 10));       // 灯阁权限跟着等级自然往上投
  Core.S.player.geneLock = lv >= 80 ? 5 : lv >= 60 ? 4 : lv >= 40 ? 3 : lv >= 20 ? 2 : lv >= 12 ? 1 : 0;
  Core.S.unlocks = Object.assign(Core.S.unlocks, { recruit: true, shop: true, tasks: true, buildings: true, geneLock: true, beast: true, corridor: true, bloodline: true, reincarn: true, enhance: true });
  return Core.S;
}

/* ---------------- ① 经济：日收入 vs 主要消耗 ---------------- */
console.log(`=== ① 经济体检（样例存档：玩家 Lv.${LV} · 进度 W${String(TIER).padStart(2, '0')}）===`);
snapshot(LV);
const r = Core.idleRates();
const sweepLeft = Core.sweepLeft();
// 副本：按"扫荡已通关的最高关"估一天的收入
const dun = (() => {
  const per = window.Dungeon.battleRewards(WORLD, 'normal', 12, 'boss');
  return per ? { per } : null;
})();
const arena = D.arenaReward(Math.max(1, Math.round(LV / 2)));
const day = {
  points: r.pointsPerMin * 1440,
  story: (1440 / 30) + (dun ? dun.per.story * sweepLeft : 0),
  otherworld: (r.otherworldPer10Min * 144) + (dun ? dun.per.otherworld * sweepLeft : 0) + arena.otherworld * D.ARENA_DAILY,
  holy: 0,
  skillChip: dun ? dun.per.skillChip * sweepLeft : 0,
  bloodCrystal: (dun ? dun.per.bloodCrystal * sweepLeft : 0) + (arena.corridor * D.ARENA_DAILY / 100 * 100),
  corridor: (LV / 2) + arena.corridor * D.ARENA_DAILY,     // 深井每天能推的层数 ≈ 等级/2（保守）
  rp: 0,
};
// 圣洁晶石：只有 Boss / 每日登录 / 任务给，估一天 20 上下（按当前配置反推）
day.holy = 20;
// 斗法台给的是异界结晶 + 深井徽记，徽记能换血统结晶（1 徽记 = 1 结晶）
day.bloodCrystal += day.corridor * 0.5;
console.log('  每天进账（估）：' + D.CURRENCIES.map(c => `${c.icon}${c.name} ${Math.round(day[c.id])}`).join(' · '));
console.log('');
console.log('  单条成长线"点满"要花多少 / 按日收入要几天：');
const sinks = [
  ['建筑（5 座各 50 级）', (() => { const o = { points: 0 }; D.BUILDINGS.forEach(b => { for (let lv = 1; lv <= 50; lv++) o.points += D.buildingCost(b.id, lv); }); return o; })()],
  ['灯阁权限 10 级', (() => { const o = { holy: 0, otherworld: 0 }; for (let lv = 0; lv < D.AUTHORITY_MAX; lv++) { const c = D.authorityCost(lv); o.holy += c.holy; o.otherworld += c.otherworld; } return o; })()],
  ['铭刻 5 阶', (() => { const o = { bloodCrystal: 0 }; D.GENE_LOCKS.forEach(g => { o.bloodCrystal += g.cost.bloodCrystal; }); return o; })()],
  ['主角练到 Lv.100', { points: 0, exp: D.EXP_TABLE.slice(1).reduce((a, b) => a + b, 0) }],
  ['一名伙伴练到 Lv.100', { points: D.LEVEL_POINTS.slice(1).reduce((a, b) => a + b, 0), exp: D.EXP_TABLE.slice(1).reduce((a, b) => a + b, 0) }],
  ['一名伙伴血统满 30 级', (() => { let bc = 0, pt = 0; for (let lv = 0; lv < D.BLOODLINE_MAX; lv++) { const c = D.bloodlineCost(lv); bc += c.bloodCrystal; pt += c.points; } return { bloodCrystal: bc, points: pt }; })()],
  ['境界 36 阶全破（含渡劫失败损耗）', { points: Math.round(D.REALMS.reduce((a, x) => a + x.cost.points, 0) / 0.75) }],
];
sinks.forEach(([name, cost]) => {
  const parts = Object.entries(cost).map(([k, v]) => {
    const daily = day[k] || 0;
    const days = daily > 0 ? (v / daily) : Infinity;
    const cname = (D.CURRENCIES.find(c => c.id === k) || { name: k }).name;
    return `${cname} ${Math.round(v).toLocaleString()}${daily > 0 ? `（${days.toFixed(0)} 天）` : '（⚠ 没有稳定来源）'}`;
  });
  console.log(`    ${name.padEnd(18, '　')} ${parts.join(' · ')}`);
});

/* ---------------- ② 曲线：纯挂机练级时间 ---------------- */
console.log('\n=== ② 等级曲线：纯挂机练到各档要多少小时 ===');
function idleHours(target) {
  snapshot(1);
  let mins = 0, guard = 0;
  while (Core.S.player.level < target && guard < 4e7) {
    const L = Core.S.player.level;
    Core.S.buildings.core = Math.min(50, Math.round(L / 2));
    Core.S.buildings.training = Math.min(50, Math.round(L / 2));
    const rt = Core.idleRates();
    // 闭关修炼领队的加成随等级自然成长（新玩家前期没富余人手，后期满编），封顶 +150%
    const leaderMult = 1 + Math.min(1.5, Math.max(0, (L - 5) / 40));
    Core.S.player.exp += rt.expPerMin * leaderMult * 5;
    const need = () => D.EXP_TABLE[Core.S.player.level] || 1;
    while (Core.S.player.level < target && Core.S.player.exp >= need()) { Core.S.player.exp -= need(); Core.S.player.level++; }
    mins += 5; guard++;
  }
  return mins / 60;
}
[10, 20, 30, 50, 80, 100].forEach(n => {
  const h = idleHours(n);
  console.log(`    Lv.${String(n).padStart(3)}  ${h.toFixed(1)} 小时  ${h <= 16 ? '✓ 第一天就能看到' : h <= 40 ? '✓ 一周内' : h <= 80 ? '✓ 一个月内' : '⚠ 太靠后了'}`);
});

/* ---------------- ③ 死内容 ---------------- */
console.log('\n=== ③ 死内容：存在但找不到入口的 ===');
const typeless = Object.entries(D.ITEMS).filter(([, it]) => !it.type).map(([k]) => k);
console.log('  没有 type 的道具：', typeless.length ? typeless.join(' ') : '无');
const consumables = Object.entries(D.ITEMS).filter(([, it]) => it.type === 'consumable').map(([k, it]) => k + '(' + it.name + ')');
console.log(`  探索用消耗品 ${consumables.length} 种：` + consumables.join(' '));
console.log('  它们的入口：', uiSrc.includes('[data-runuse]') ? '背包 → 道具详情 → 在本次探索中使用 ✓' : '⚠ 一个都没有');
const shopItems = Object.values(D.SHOPS).flatMap(s => s.items.map(i => i.item)).filter(Boolean);
const noSource = Object.keys(D.ITEMS).filter(k => !shopItems.includes(k) && !(D.ITEMS[k].src || '').includes('掉落') && !(D.ITEMS[k].src || '').includes('奖励'));
console.log('  既不在商店、也不在掉落/奖励里提到的道具：', noSource.length ? noSource.join(' ') : '无');

/* ---------------- ④ 死代码 ---------------- */
console.log('\n=== ④ 死代码：写了但没人调用 ===');
const allSrc = uiSrc + coreSrc + dataSrc;
const dead = [];
for (const src of [['ui.js', uiSrc], ['core.js', coreSrc]]) {
  const names = src[1].match(/^ {2}function [A-Za-z_][A-Za-z0-9_]*/gm) || [];
  names.map(s => s.replace(/^ {2}function /, '')).forEach(fn => {
    const n = (allSrc.match(new RegExp('\\b' + fn + '\\b', 'g')) || []).length;
    // n=1：除了定义那一次之外没人提到 → 真死代码；n=2：只在导出表里出现（可能只给测试用）
    if (n <= 1 && !/^_/.test(fn)) dead.push(`⚠ 真死代码 ${src[0]} → ${fn}()`);
    else if (n === 2 && !/^_/.test(fn)) dead.push(`  （只出现在导出表）${src[0]} → ${fn}()`);
  });
}
console.log(dead.length ? '  ' + dead.join('\n  ') : '  无');
console.log('\n（本脚本只读；改完数值再跑一遍，看数字有没有回到合理区间）');
