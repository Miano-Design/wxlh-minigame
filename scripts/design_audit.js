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
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA;
/* V1.1.11（网页版归档）：原来读 `js/ui.js`；本地已删 → 空串，对表那几条走 ⏭。 */
const uiSrc = fs.existsSync('js/ui.js') ? fs.readFileSync('js/ui.js', 'utf8') : '';
const WB = require('./_web_basis');
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
  otherworld: (r.otherworldPer10Min * 144) + (dun ? dun.per.otherworld * sweepLeft : 0) + arena.otherworld * D.ARENA_DAILY,
  holy: 0,
  rp: 0,
};
// 圣洁晶石：主线 / 世界首通（含困难·地狱）/ 登录 / 限时悬赏 / 周常 / 成就 / 图鉴 / 求签，
// longrun_sim 记账钩子实测 90 天日均 145（V1.0.1 补全尺子口径后的数字，同 cap_audit）
day.holy = 145;
/* V9.6.109（尺子自审）：这个"每天进账"模型里原来**没有经验** ——
   于是"练到 Lv.100"那几行一律显示「⚠ 没有稳定来源」，看着像设计缺口，
   其实是尺子自己少算了一项。经验有两条稳定来源：
     · 挂机：idleRates().expPerMin（每分钟）× 1440
     · 副本：每关结算给经验（按打通一巡的量级粗估，这里只取挂机这条**保底**来源，
       宁可估低不估高——它的用途是"几天能练满"，估低只会让天数偏保守。） */
day.exp = (() => {
  /* 用**核心的真实速率**（idleRates().expPerMin），别自己猜常量 ——
     第一版我写了个 1.2/min 的兜底，实际是 10/min，天数差了 8 倍。 */
  try { return Math.round(Core.idleRates().expPerMin * 1440); } catch (e) { return 0; }
})();
console.log('  每天进账（估）：' + D.CURRENCIES.map(c => `${c.icon}${c.name} ${Math.round(day[c.id])}`).join(' · '));
console.log('');
console.log('  单条成长线"点满"要花多少 / 按日收入要几天：');
const sinks = [
  ['建筑（5 座各 50 级）', (() => { const o = { points: 0 }; D.BUILDINGS.forEach(b => { for (let lv = 1; lv <= 50; lv++) o.points += D.buildingCost(b.id, lv); }); return o; })()],
  ['灯阁权限 ' + D.AUTHORITY_MAX + ' 级', (() => { const o = { holy: 0, otherworld: 0 }; for (let lv = 0; lv < D.AUTHORITY_MAX; lv++) { const c = D.authorityCost(lv); o.holy += c.holy; o.otherworld += c.otherworld; } return o; })()],
  ['铭刻 ' + D.GENE_LOCKS.length + ' 阶', (() => { const o = { otherworld: 0 }; D.GENE_LOCKS.forEach(g => { o.otherworld += g.cost.otherworld; }); return o; })()],
  ['主角练到 Lv.100', { points: 0, exp: D.EXP_TABLE.slice(1).reduce((a, b) => a + b, 0) }],
  ['一名伙伴练到 Lv.100', { points: D.LEVEL_POINTS.slice(1).reduce((a, b) => a + b, 0), exp: D.EXP_TABLE.slice(1).reduce((a, b) => a + b, 0) }],
  ['一名伙伴血统满 ' + D.BLOODLINE_MAX + ' 级', (() => { let bc = 0, pt = 0; for (let lv = 0; lv < D.BLOODLINE_MAX; lv++) { const c = D.bloodlineCost(lv); bc += c.otherworld; pt += c.points; } return { otherworld: bc, points: pt }; })()],
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
  /* V9.5.70：全线压慢之后，"月内满级"仍然是目标（上限 120 小时），
     这条判定跟着放宽——它的作用是拦住"345 小时"那种与挂机产出脱节的曲线，不是钉死某个数。 */
  console.log(`    Lv.${String(n).padStart(3)}  ${h.toFixed(1)} 小时  ${h <= 16 ? '✓ 第一天就能看到' : h <= 40 ? '✓ 一周内' : h <= 120 ? '✓ 一个月内' : '⚠ 太靠后了'}`);
});

/* ---------------- ③ 死内容 ---------------- */
console.log('\n=== ③ 死内容：存在但找不到入口的 ===');
const typeless = Object.entries(D.ITEMS).filter(([, it]) => !it.type).map(([k]) => k);
console.log('  没有 type 的道具：', typeless.length ? typeless.join(' ') : '无');
const consumables = Object.entries(D.ITEMS).filter(([, it]) => it.type === 'consumable').map(([k, it]) => k + '(' + it.name + ')');
if (consumables.length) {
  console.log(`  探索用消耗品 ${consumables.length} 种：` + consumables.join(' '));
  console.log('  它们的入口：', uiSrc.includes('[data-runuse]') ? '背包 → 道具详情 → 在本次探索中使用 ✓' : '⚠ 一个都没有');
} else {
  console.log('  探索用消耗品：0 种（V9.5.66 整条线下架）✓');
}
const shopItems = Object.values(D.SHOPS).flatMap(s => s.items.map(i => i.item)).filter(Boolean);
/* 血清不是在商店/掉落里拿的，是在「炼化台」用材料 + 点数现做的——
   体检脚本得知道这件事，否则会把所有血清全报成"没有来源"（假警报）。 */
const crafted = D.SERUMS.map(s => D.SERUM_ITEM(s.id));
const noSource = Object.keys(D.ITEMS).filter(k => !shopItems.includes(k) && !crafted.includes(k)
  && !(D.ITEMS[k].src || '').includes('掉落') && !(D.ITEMS[k].src || '').includes('奖励'));
console.log('  既不在商店、也不在掉落/奖励/炼化台里的道具：', noSource.length ? noSource.join(' ') : '无');

/* ---------------- ④ 死代码 ---------------- */
console.log('\n=== ④ 死代码：写了但没人调用 ===');
const allSrc = uiSrc + coreSrc + dataSrc;
const dead = [];
for (const src of [['ui.js', uiSrc], ['core.js', coreSrc]]) {
  const names = src[1].match(/^ {2}function [A-Za-z_][A-Za-z0-9_]*/gm) || [];
  names.map(s => s.replace(/^ {2}function /, '')).forEach(fn => {
    const n = (allSrc.match(new RegExp('\\b' + fn + '\\b', 'g')) || []).length;
    /* 计数口径：定义 1 次 + 每个调用点 1 次。
       n≤1 = 除了定义没人提它 → 真死代码（改版删界面最容易留下的东西）；
       n=2 = 只有一处调用，是正常写法，不报（以前一律报出来，噪音太大反而没人看）。 */
    if (n <= 1 && !/^_/.test(fn)) dead.push(`${src[0]} → ${fn}()`);
  });
}
console.log(dead.length ? '  ' + dead.join('\n  ') : '  无');
console.log('\n（本脚本只读；改完数值再跑一遍，看数字有没有回到合理区间）');
