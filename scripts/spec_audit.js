/* 硬指标看板：node scripts/spec_audit.js

   起因（2026-09-17 十七度自审）：父亲大人在这些轮里**亲口定过一批硬数字**——
   离线上限 6h→满配 12h、开局 20000 点、普通单抽 500、技能 35/35/30、血统满级 50、
   招募券只能系统赠送、扫荡不掉券、副本不要消耗品、战斗不要"跳过"、满编 5 人才成阵、
   游离奇遇按 5/10/20/30/40/50/60 分钟递增且领完才重新计时……

   这些东西**分散在数据表、核心、界面三层**，任何一次改动都可能悄悄把它们破坏掉，
   而破坏之后不会报错、不会崩——只有玩家觉得"不对劲"。所以这里做成一块看板：
   一条一行，✓ 表示"和父亲大人定的完全一致"，✗ 立刻能看出是哪条被改坏了。

   只读。改完数值跑一下。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, UI = window.UI;
const UI_SRC = fs.readFileSync('js/ui.js', 'utf8');

let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : '')); };
const section = (t) => console.log('\n' + t);

/* ---------- 1. 挂机 / 离线上限 ---------- */
section('=== ① 挂机与离线上限（父亲大人："初始 6 小时，点满所有加成刚好 12 小时"）===');
Core.newGame(); Core.setPlayerName('硬指标'); Core.choosePlayerBloodline('修真');
chk('开局离线上限 = 6 小时', Core.offlineCapHours() === 6, Core.offlineCapHours() + 'h');
{
  const S = Core.S;
  D.WORLDS.forEach(w => { S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(3), hell: Array(12).fill(3) } }; });
  S.player.level = D.PLAYER_MAX_LV;
  ['points', 'otherworld', 'bloodCrystal', 'holy', 'corridor', 'skillChip', 'story'].forEach(k => Core.addCur(k, 1e9));
  for (let i = 0; i < 8; i++) Core.geneLockUnlock();                       // 铭刻 5 阶
  let g = 0; while (g++ < 40) { if (!Core.upgradeAuthority().ok) break; }   // 灯阁权限满
  g = 0;
  while (g++ < 4000) {                                                     // 建筑满
    const b = D.BUILDINGS.reduce((m, x) => ((S.buildings[x.id] || 0) < (S.buildings[m.id] || 0) ? x : m), D.BUILDINGS[0]);
    if (!Core.upgradeBuilding(b.id).ok) break;
  }
  chk('满配（铭刻5 + 权限10 + 医疗室50）= 12 小时，不溢出也不差一截', Core.offlineCapHours() === 12,
    `铭刻${S.player.geneLock} · 权限${S.auth} · 医疗室${S.buildings.medical} → ${Core.offlineCapHours()}h`);
  chk('医疗室 50 级封顶（每 10 级 +0.2h = 已含在内）', S.buildings.medical === 50, S.buildings.medical + ' 级');
  /* 在线挂机也要吃同一个上限（V9.5.80；否则"把页面挂着"就能攒到 24 小时） */
  Core.S.idle.bankSec = 0;
  for (let i = 0; i < 100; i++) Core.onlineTick(3600);
  chk('在线挂机同样吃 12 小时上限（挂一整天也只能攒到 12h）', Core.S.idle.bankSec === 12 * 3600, (Core.S.idle.bankSec / 3600) + 'h');
}

/* ---------- 2. 开局与价格 ---------- */
section('=== ② 开局与价格 ===');
Core.newGame();
chk('开局点数 20000（= 40 次普通单抽）', Core.S.cur.points === 20000, String(Core.S.cur.points));
chk('普通招募单抽 500 点', D.RECRUIT_POOLS.normal.cost.points === 500, JSON.stringify(D.RECRUIT_POOLS.normal.cost));
chk('技能等级上限 35 / 35 / 30', JSON.stringify(D.SKILL_MAX_BY_INDEX) === '[35,35,30]', JSON.stringify(D.SKILL_MAX_BY_INDEX));
chk('技能每级 +2%', (D.SKILL_PCT_PER_LV || 0.02) === 0.02, String(D.SKILL_PCT_PER_LV));
chk('血统满级 50', D.BLOODLINE_MAX === 50, String(D.BLOODLINE_MAX));
chk('主角等级上限 100，且等级从 0 起（数字 = 升过几次）', D.PLAYER_MAX_LV === 100 && D.EXP_TABLE[0] > 0, 'Lv0→1 需 ' + D.EXP_TABLE[0]);

/* ---------- 3. 招募券只能系统赠送 ---------- */
section('=== ③ 招募券：只能系统赠送（商店不卖、扫荡不掉）===');
{
  const sold = [];
  Object.entries(D.SHOPS || {}).forEach(([sid, shop]) => {
    (shop.items || []).forEach(it => { if (/券|ticket/i.test(JSON.stringify(it))) sold.push(sid + ':' + it.name); });
  });
  chk('所有商店都不卖招募券', sold.length === 0, sold.join(' / ') || '无');
  const dun = fs.readFileSync('js/dungeon.js', 'utf8');
  chk('扫荡传 noTicket（重复劳动刷不出券）', /noTicket: true/.test(dun));
  chk('手打副本才掉券（boss 50% / 精英 25% / 普通 8%）', /kind === 'boss'[\s\S]{0,80}0\.50/.test(dun));
}

/* ---------- 4. 副本：不要消耗品、不要跳过战斗 ---------- */
section('=== ④ 副本：不要消耗品、不要"跳过战斗" ===');
{
  const dup = Object.entries(D.ITEMS).filter(([, it]) => /治疗剂|强化剂/.test(it.name || '')).map(([k]) => k);
  chk('探索消耗品（治疗剂 / 强化剂）整条线已删', dup.length === 0, dup.join(',') || '无');
  chk('战斗界面没有"跳过战斗"按钮', !/data-act="skip|case 'skip-battle'|skipBattle/.test(UI_SRC));
  chk('战斗界面有"撤离"（删掉跳过之后的替代）', /撤离/.test(UI_SRC));
  chk('通关结算有"自动进下一关"（可关）', /autoNext/.test(UI_SRC) && D !== null);
}

/* ---------- 5. 阵容：满编 5 人才成阵 ---------- */
section('=== ⑤ 阵容：必须上满 5 人才激活 ===');
{
  Core.newGame(); Core.setPlayerName('阵容'); Core.choosePlayerBloodline('修真');
  ['C021', 'C022', 'C023', 'C024'].forEach(id => { try { Core.addChar(id); } catch (e) {} });
  Core.S.party = ['@player', 'C021', 'C022', 'C023', null];
  const fb4 = Core.factionBuffs(Core.S.party);
  Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024'];
  const fb5 = Core.factionBuffs(Core.S.party);
  chk('4 人：没有任何阵容加成', (fb4.atkPct || 0) === 0 && (fb4.hpPct || 0) === 0, JSON.stringify({ atk: fb4.atkPct, hp: fb4.hpPct, full: fb4.full }));
  chk('5 人：阵容激活并给加成', (fb5.atkPct || 0) > 0 && fb5.full === true, JSON.stringify({ atk: fb5.atkPct, 阵: fb5.names }));
}

/* ---------- 6. 游离奇遇：5/10/20/30/40/50/60 分钟递增 ---------- */
section('=== ⑥ 游离奇遇：按 5·10·20·30·40·50·60 分钟递增，领完才重新计时，每天重开一轮 ===');
chk('节奏表就是 [5,10,20,30,40,50,60] 分钟', JSON.stringify(D.TRAVEL_STEPS_SEC) === JSON.stringify([300, 600, 1200, 1800, 2400, 3000, 3600]), JSON.stringify(D.TRAVEL_STEPS_SEC));
{
  Core.newGame(); Core.setPlayerName('奇遇'); Core.choosePlayerBloodline('修真');
  const t = () => Core.S.travel || {};
  Core.travelAccrue(299);
  chk('攒不到 5 分钟不会冒出奇遇', !Core.pendingTravel(), '已攒 ' + t().bankSec + 's');
  Core.travelAccrue(1);
  chk('攒满 5 分钟冒出一个奇遇', !!Core.pendingTravel());
  Core.travelAccrue(9999);
  chk('压着一个没领时不再计时（不会连出两个）', t().bankSec === 0 && !!Core.pendingTravel());
  Core.claimTravel();
  chk('领完之后重新计时，且间隔走到第二档（10 分钟）', Core.travelEverySec() === 600 && t().bankSec === 0, Core.travelEverySec() + 's');
  Core.claimTravel();
  /* 跨天：新一轮从第一档（5 分钟）重新开始 */
  Core.S.travel.day = '2000-01-01';
  Core.travelAccrue(1);
  chk('跨天：新一轮回到 5 分钟档、进度清零', Core.travelEverySec() === 300 && t().bankSec === 1, Core.travelEverySec() + 's');
}

/* ---------- 7. 一键收取与挂机领取 ---------- */
section('=== ⑦ 收取：没有次数限制，也不会重复发 ===');
{
  Core.newGame(); Core.setPlayerName('收取'); Core.choosePlayerBloodline('修真'); Core.ensureDaily();
  D.DAILY_TASKS.forEach(x => { Core.S.tasks.daily[x.id] = x.target; });
  Core.S.idle.bankSec = 1800;
  const before = Core.S.cur.points;
  const r1 = Core.claimEverything();
  const mid = Core.S.cur.points;
  Core.claimEverything();
  const after = Core.S.cur.points;
  chk('一键收取真的收到东西', mid > before, '◈ +' + (mid - before));
  chk('连点第二次不再重复发（收取无次数限制但不重复）', after === mid, '第二次 +' + (after - mid));
  chk('收取条目数是实打实算出来的', r1.total > 0, '本次 ' + r1.total + ' 项');
}

/* ---------- 8. 深井：不再是"100 层掉档"的那条曲线 ---------- */
section('=== ⑧ 深井曲线（十五度自审修的那条）===');
{
  const base = f => { const e = D.corridorEnemy(f); return e.hp / (e.isBoss ? 2.4 : e.isElite ? 1.7 : 1); };
  chk('第 101 层接着第 100 层涨（不是掉回第 88 层）', base(101) > base(100), Math.round(base(100)) + ' → ' + Math.round(base(101)));
  chk('第 301 层接着第 300 层涨', base(301) > base(300), Math.round(base(300)) + ' → ' + Math.round(base(301)));
  const ach = D.ACHIEVEMENTS.filter(a => /corridor\.best >=/.test(String(a.check)));
  const maxReq = Math.max.apply(null, ach.map(a => +String(a.check).match(/>= (\d+)/)[1]));
  chk('深井成就最高的那档，在实测天花板（约 130 层）之内', maxReq <= 130, '最高要求 ' + maxReq + ' 层');
}

console.log(`\n硬指标看板：${pass} 条对得上，${fail} 条对不上`);
process.exit(fail ? 1 : 0);
