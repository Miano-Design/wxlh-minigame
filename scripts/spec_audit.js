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
const SIM = require('./_sim_allies');   // V1.1.11：组队入口从界面层搬出来（见同目录 _sim_allies.js）
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
/* 锁随机种子（与 world_curve / longrun_sim 同一套口径）：敌人编成与装备词条都吃 Math.random，
   不锁种子时同一把尺子两次读数不一样，体检报告就没人敢信了。
   ⚠️ 2026-09-27 补：这一条是天花板读数飘（139 vs 149）之后加的，缺的就是它。 */
let seed = 20260917;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const reseed = (s) => { seed = s || 20260917; };
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, UI = window.UI;
/* V1.1.11（网页版归档）：原来读的是 `js/ui.js`（网页版界面层）—— 本地已删，
   读不到就给空串，相关那几条"两端对表"的断言会走 ⏭（见下面 WB.OK 的判断）。 */
const UI_SRC = fs.existsSync('js/ui.js') ? fs.readFileSync('js/ui.js', 'utf8') : '';
const WB = require('./_web_basis');

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
  /* V1.1.11（康康 09-27）：**这条红是"用例没配满"，不是代码退化**。
     A12 给「铭刻」加了铭魂砂、「灯阁权限」加了灯油之后，这个"满配账号"只发货币、没发材料 ——
     下面两个循环（铭刻 5 阶 / 权限满）就**空转**了，读数变成"铭刻0 · 权限0 · 离线上限 7h"。
     补上材料（和小游戏里 GM 面板"各档材料×200"同一个口径）。 */
  ['mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5', 'beast_egg',
    'minghun_sha', 'xuesui_jing', 'dengyou', 'mijuan_canzhang', 'lingzhi_zhong']
    .forEach((k) => { S.items[k] = 9999; });
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
  /* V9.6.115（父亲大人："招募券的掉落几率是否会太高了"）：原来 boss 50% / 精英 28% / 杂兵 18%，
     实测"刷第 12 关 20 次 = 10 张高级券（异界征召令）≈ 2.5 个 SSR"，已经不属于"惊喜"量级。
     现在 boss 18% / 精英 10% / 杂兵 8%（刷 20 次 ≈ 0.9 个 SSR）。断言跟着新数值走。 */
  chk('手打副本才掉券，且量级已收紧（boss 18% / 精英 10% / 杂兵 8%）',
    /kind === 'boss'[\s\S]{0,80}0\.18/.test(dun) && /kind === 'elite'[\s\S]{0,80}0\.10/.test(dun) && /kind === 'combat'[\s\S]{0,80}0\.08/.test(dun));
}

/* ---------- 4. 副本：不要消耗品、不要跳过战斗 ---------- */
section('=== ④ 副本：不要消耗品、不要"跳过战斗" ===');
{
  const dup = Object.entries(D.ITEMS).filter(([, it]) => /治疗剂|强化剂/.test(it.name || '')).map(([k]) => k);
  chk('探索消耗品（治疗剂 / 强化剂）整条线已删', dup.length === 0, dup.join(',') || '无');
  chk('战斗界面没有"跳过战斗"按钮', !/data-act="skip|case 'skip-battle'|skipBattle/.test(UI_SRC));
  /* V1.1.11（网页版归档）：这两条查的是**网页版界面层**的源码 —— 本地已删，⏭ 跳过。
     （小游戏端对应的两条在 `battle_flow_audit` / `journey_audit` 里照常钉着。） */
  if (WB.OK) {
    chk('战斗界面有"撤离"（删掉跳过之后的替代）', /撤离/.test(UI_SRC));
    chk('通关结算有"自动进下一关"（可关）', /autoNext/.test(UI_SRC) && D !== null);
  } else {
    console.log('  ⏭ 战斗界面"撤离" / 结算"自动进下一关"（查网页版源码 · 网页版已归档，本条退役）');
  }
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
/* 现场量天花板：把每条养成线点到上限的账号（含血统神装）从第 1 层往上推，推到打不过为止。
   写死数字不行 —— 世界从 20 张变成 36 张、又加了神装之后，那个数就作废了。
   ⚠️ 三个必须一起做的口径（2026-09-27 修，起因是"同账号两把尺子 139 vs 149"）：
     ① 每次量之前 `reseed()` —— 敌人编成吃 Math.random，单抽一次会抖；
     ② **换 3 个种子取中位**（多数票）—— 一个种子可能刚好抽到克制的编成；
     ③ 这把尺子对**深井印记 ×1.45** 极敏感（差 10~12 层），所以**两个数都打出来**，
        不许只报一个让人猜"这个数带没带印记"。 */
const CEIL_SEEDS = [20260917, 20270219, 20270807];
const ceilingProbe = (function () {
  const R = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
  const best = D.characters.slice().sort((a, b) => (R[a.rarity] ?? 9) - (R[b.rarity] ?? 9)).map(c => c.id);
  Core.newGame(); Core.setPlayerName('深井天花板'); Core.choosePlayerBloodline('修真');
  const S = Core.S, p = S.player;
  D.WORLDS.forEach(w => { S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(3), hell: Array(12).fill(3) } }; });
  p.level = D.PLAYER_MAX_LV; p.attrPoints = 300; p.bloodlineLv = D.BLOODLINE_MAX;
  Core.addCur('rp', 1e6);
  Object.keys(D.TALENTS).forEach(b => { for (let i = 0; i < 10; i++) Core.buyTalent(b); });
  p.realm = D.REALM_STAGE_COUNT; if (S.sect) S.sect.lv = D.SECT_MAX;
  D.ATTR_META.forEach(a => Core.allocateAttr(a.id, 50));
  ['points', 'otherworld', 'bloodCrystal', 'holy', 'corridor', 'skillChip', 'story'].forEach(k => Core.addCur(k, 1e9));
  for (let i = 0; i < 8; i++) Core.geneLockUnlock();
  best.slice(0, 4).forEach(id => { Core.addChar(id); S.chars[id].lv = D.PLAYER_MAX_LV; S.chars[id].star = 5; S.chars[id].skillLv = D.SKILL_MAX_BY_INDEX.slice(); S.chars[id].bloodlineLv = D.BLOODLINE_MAX; });
  S.party = ['@player'].concat(best.slice(0, 4));
  let g = 0; while (g++ < 4000) { const b = D.BUILDINGS.reduce((m, x) => ((S.buildings[x.id] || 0) < (S.buildings[m.id] || 0) ? x : m), D.BUILDINGS[0]); if (!Core.upgradeBuilding(b.id).ok) break; }
  D.MOUNTS.forEach(m => Core.buyMount(m.id));
  D.FABAO.forEach(f => Core.buyFabao(f.id));
  g = 0; while (g++ < 3000) { const o = D.KEJI.filter(x => Core.kejiLv(x.id) < x.max); if (!o.length) break; if (!Core.kejiUp(o[0].id).ok) break; }
  g = 0; while (g++ < 40) { if (!Core.upgradeAuthority().ok) break; }
  S.bag.eqCap = 3000;
  const lastWorld = D.WORLDS[D.WORLDS.length - 1].id;
  for (let i = 0; i < 200; i++) Core.grantEquip(lastWorld, 'UR');
  for (let i = 0; i < 600; i++) Core.grantEquip(lastWorld, 'MYTH');
  Core.autoEquipBest();
  S.corridor.best = 400;                                        // 印记按上限（+45%）
  const ladder = (withMark) => {
    let f = 1;
    for (; f <= 400; f++) {
      const mult = withMark ? 1 + Core.corridorMarkBonus() : 1;
      const allies = SIM.buildAllies(null, null, { mult });
      const res = window.Battle.run({ allies, enemies: [D.corridorEnemy(f)], worldId: null, maxRounds: 60 });
      if (!res.win) break;
    }
    return f - 1;
  };
  const vote = (withMark) => {
    const vals = CEIL_SEEDS.map(s => { reseed(s); return ladder(withMark); });
    vals.sort((a, b) => a - b);
    return { mid: vals[1], lo: vals[0], hi: vals[2], vals };
  };
  return { mark: vote(true), bare: vote(false) };
})();
const corridorCeiling = ceilingProbe.mark.mid;                  // 对外只用"含印记"这个数（线上玩家都带印记）
{
  const base = f => { const e = D.corridorEnemy(f); return e.hp / (e.isBoss ? 2.4 : e.isElite ? 1.7 : 1); };
  chk('第 101 层接着第 100 层涨（不是掉回第 88 层）', base(101) > base(100), Math.round(base(100)) + ' → ' + Math.round(base(101)));
  chk('第 301 层接着第 300 层涨', base(301) > base(300), Math.round(base(300)) + ' → ' + Math.round(base(301)));
  const ach = D.ACHIEVEMENTS.filter(a => /corridor\.best >=/.test(String(a.check)));
  const maxReq = Math.max.apply(null, ach.map(a => +String(a.check).match(/>= (\d+)/)[1]));
  /* V9.6.77（自审）：这里的 130 原来是**写死的**——世界扩到 36 张、又加了血统神装之后，
     天花板早就不是那个数了（写死的尺子＝拿旧规则审新版本）。现在现场量一遍：
     把每条养成线点到上限的账号从第 1 层往上推，推到打不过为止（3 种子取中位，见上面那段）。 */
  console.log('  深井天花板：含印记 ×1.45 = **' + corridorCeiling + ' 层**（3 种子 ' + ceilingProbe.mark.vals.join('/') + '）'
    + ' · 不带印记 = ' + ceilingProbe.bare.mid + ' 层（' + ceilingProbe.bare.vals.join('/') + '）'
    + ' → 印记值 +' + (corridorCeiling - ceilingProbe.bare.mid) + ' 层');
  chk('印记只加不减（带上印记的天花板不低于裸的）', corridorCeiling >= ceilingProbe.bare.mid,
    corridorCeiling + ' ≥ ' + ceilingProbe.bare.mid);
  chk('3 种子不抖（极差 ≤ 2 层，读数可复现）', ceilingProbe.mark.hi - ceilingProbe.mark.lo <= 2,
    ceilingProbe.mark.vals.join('/'));
  chk('深井成就最高的那档，在实测天花板之内', maxReq <= corridorCeiling,
    '最高要求 ' + maxReq + ' 层 · 实测天花板 ' + corridorCeiling + ' 层（含印记 ×1.45）');
}

/* ---------- 9. 跨天重置：第二天该恢复的必须真的恢复 ---------- */
section('=== ⑨ 跨天重置（把存档里的日期拨回昨天，再看各系统有没有恢复）===');
{
  Core.newGame(); Core.setPlayerName('跨天'); Core.choosePlayerBloodline('修真'); Core.ensureDaily();
  const YESTERDAY = '2000-01-01';
  /* 免费抽：普通 3 次 / 高级 1 次，跨天必须回满 */
  Core.S.recruit.free.date = YESTERDAY;
  Core.S.recruit.free.normal = { used: 3, at: Date.now() };
  Core.S.recruit.free.advanced = { used: 1, at: 0 };
  chk('免费抽：跨天回满（普通 3 次 / 高级 1 次）',
    Core.freeState('normal').left === 3 && Core.freeState('advanced').left === 1);
  /* 扫荡次数：跨天回满 */
  Core.S.sweep = { date: YESTERDAY, count: 99, bonus: 50 };
  chk('扫荡次数：跨天回满，且昨天剩下的"额外额度"不带到今天', Core.sweepLeft() === Core.sweepCap());
  /* 斗法台次数：跨天回满 */
  Core.S.arena = { floor: 5, best: 5, date: YESTERDAY, used: 99 };
  chk('斗法台：跨天回满 5 次', Core.arenaState().left === (D.ARENA_DAILY || 5));
  /* 求签：跨天要能再摇一次 */
  Core.S.sign = { date: YESTERDAY, tier: '上上', idlePct: 0.1, drawn: 1 };
  chk('求签：跨天签名与加成清空、可以再摇', Core.signState().fresh === false && Core.signState().idlePct === 0);
  /* 商店每日限购：昨天买过的不占今天的额度 */
  {
    const shop = Object.entries(D.SHOPS).find(([, s]) => (s.items || []).some(it => it.stock > 0));
    if (shop) {
      const [sid, s] = shop;
      const idx = s.items.findIndex(it => it.stock > 0);
      Core.addCur(s.currency, 1e9);
      Core.S.shop.bought = {};
      Core.S.shop.bought[sid + '_' + idx + '_' + YESTERDAY] = 99;      // 昨天买满了
      const r = Core.buyShopItem(sid, idx);
      chk('商店每日限购：昨天买满不挡今天', r.ok === true, r.msg || '可以买');
    } else {
      chk('商店每日限购：昨天买满不挡今天', false, '找不到带限购的商品');
    }
  }
  /* 登录奖励：跨天能再领，且七天一循环不卡在第 7 天 */
  {
    Core.S.login = { day: D.LOGIN_REWARDS.length, lastClaim: YESTERDAY, round: 1 };
    const r = Core.loginReward();
    chk('登录奖励：跨天能再领，第 8 天回到第 1 天（不是永远发第 7 天）',
      !!r && r.day === 1 && (r.reward === D.LOGIN_REWARDS[0]));
  }
  /* 每日任务：跨天清空重来 */
  {
    D.DAILY_TASKS.forEach(t => { Core.S.tasks.daily[t.id] = t.target; });
    Core.S.tasks.date = YESTERDAY;
    Core.ensureDaily();
    const done = D.DAILY_TASKS.filter(t => (Core.S.tasks.daily[t.id] || 0) > 0).length;
    chk('每日任务：跨天清空（进度归零，可以重新做）', done === 0, done + ' 条还留着昨天的进度');
  }
}

console.log(`\n硬指标看板：${pass} 条对得上，${fail} 条对不上`);
process.exit(fail ? 1 : 0);
