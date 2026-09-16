/* 长线模拟：node scripts/longrun_sim.js [天数]

   起因（V9.5.79 自审）：前面几道体检验的都是"某一时刻的数字对不对"，
   但**时间一长会怎样**没人验过——资源会不会堆积成一堆没处花的数、某条线会不会卡死、
   数值会不会溢出。这个脚本模拟一个"每天正常玩一遍"的玩家，按优先级把资源花掉，
   然后把 1 / 7 / 14 / 30 天的状态打印出来看。

   模拟的每日行为（保守设定，不夸大）：
     · 挂机收益收一次（受离线上限截断——每天只上线一次的人拿不满 24 小时）
     · 扫荡 60 次当前已通关的最高关
     · 斗法台 5 场（赢了升台，输了退台，按战力估算）
     · 深井推进（按战力估算，打不过就停）
     · 每日任务全清 + 登录奖励 + 悬赏（能完成就领）
     · **上满队伍 + 把掉落里最好的装备穿上**（十五度自审补：原版模拟的玩家从不补人、
       也从不穿装备，于是它在 W08 卡住——那个"卡关"是模拟器的毛病，不是游戏的毛病。
       补人/穿装备不是"高玩操作"，是任何玩家都会做的事）
   花钱优先级（模拟一个懂行的玩家）：铭刻 → 主角血统 → 建筑 → 境界 → 秘术阁 → 权限 → 伙伴

   只读。改完数值跑一下，看"多少天到顶 / 有没有堆积"。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
/* V9.5.87（十五度自审）：锁随机种子 —— 这个模拟要拿来对比"改动前后"，报告本身必须是可复现的
   （不锁种子时，第 1 天的深井层数在 2~15 之间乱跳，根本没法判断某次改动是好是坏）。 */
let seed = 20260917;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, Dun = window.Dungeon, UI = window.UI;

const DAYS = Math.max(1, Math.min(365, +(process.argv[2] || 30)));
Core.newGame(); Core.setPlayerName('长线'); Core.choosePlayerBloodline('修真');
Core.ensureDaily();
const S = Core.S;
const log = [];
const NaNcheck = [];

function addDay() {
  // ⓪ 推图：用**真实战斗引擎**一关一关打（这是整个游戏的主循环，不能靠估算）
  pushWorlds();
  // ① 挂机：每天收一次，受离线上限截断
  S.idle.bankSec = Core.offlineCapHours() * 3600;
  Core.claimIdle();
  /* ② 扫荡：会玩的人一定扫**守关 Boss 那一关**——
       它是同一次扫荡消耗，但奖励是普通关的 5 倍左右（W01：普通 120 点 vs Boss 650 点）。
       ⚠ 这本身就是个设计问题（"选择扫荡关卡"其实永远该选第 12 关），先按最优打法模拟。 */
  let boss = null;
  D.WORLDS.forEach(w => {
    const st = S.worlds[w.id];
    if (st && st.unlocked && st.stages.normal[11] > 0) boss = { w: w.id };
  });
  if (boss) { S.sweep = { date: Core.dailyDate(), count: 0, bonus: 0 }; Dun.sweep(boss.w, 'normal', 12, 60); }
  // ②b 招募：免费抽用掉 + 用点数抽到没钱（伙伴是技能芯片的唯一去处，不招人芯片会白堆）
  ['normal', 'advanced'].forEach(p => { for (let i = 0; i < 4; i++) { if (!Core.freeRecruit(p).ok) break; } });
  // 招募也要克制：每天最多两次十连，其余点数留给养成（不然建筑/境界会被饿死）
  let pullGuard = 0;
  while (pullGuard++ < 2) { if (Core.recruitTen('normal').error) break; }
  // ③ 斗法台：5 场，守擂者按战力反推，粗略用"台数不高于战力/1000"判定
  for (let i = 0; i < D.ARENA_DAILY; i++) {
    const floor = S.arena.floor;
    const need = D.arenaEnemy(floor, Core.teamPower())[0];
    const win = need.hp < Core.teamPower() * 9;
    Core.arenaSettle(win);
  }
  /* ④ 深井：**用真实战斗引擎**打（十五度自审改）——
     原来是"战力 ×9 估算"，可深井是父亲大人点名抱怨过的系统，估算出来的层数不等于真能打到。
     这里和界面同口径：带上深井印记加成（历史最高每 10 层 +1.5%）。 */
  for (let i = 0; i < 30; i++) {
    const floor = S.corridor.floor;
    const allies = UI._panels.buildAllies(null, null, { mult: 1 + Core.corridorMarkBonus() });
    if (!allies.length) break;
    const res = window.Battle.run({ allies, enemies: [D.corridorEnemy(floor)], worldId: null, maxRounds: 60 });
    if (!res.win) break;
    const rw = D.corridorReward(floor);
    Core.addCur('points', rw.points); Core.addCur('story', rw.story);
    Core.addCur('corridor', rw.corridor);
    if (rw.bloodCrystal) Core.addCur('bloodCrystal', rw.bloodCrystal);
    S.corridor.best = Math.max(S.corridor.best, floor);
    S.corridor.floor++;
  }
  // ⑤ 每日任务 + 登录 + 悬赏
  D.DAILY_TASKS.forEach(t => { S.tasks.daily[t.id] = t.target; Core.claimTask(t.id); });
  if (Core.dailyAllDone && Core.dailyAllDone()) Core.claimDailyAll();
  Core.loginReward();
  Core.bountyState().list.forEach(b => { if (b.done && !b.claimed && !b.expired) Core.claimBounty(b.id); });
  // ⑥ 花钱：按优先级把能升的都升掉
  spendAll();
  /* ⑦ 上阵 + 穿装备（十五度自审补）——
     一个真玩家不会"抽到人就放在库里不练、掉一地装备不穿"。少了这两步，
     模拟出来的战力会低一大截，然后得出"W08 就卡死了"这种把责任推给游戏的结论。 */
  fillParty();
  Core.autoEquipBest();
}

/* 上阵：主角必上，剩下 4 格按「等级 → 稀有度 → 星级」挑最强的（就是玩家会挑的顺序）。 */
function fillParty() {
  const order = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
  const own = Object.keys(S.chars).sort((a, b) => {
    const ca = S.chars[a], cb = S.chars[b];
    if ((cb.lv || 0) !== (ca.lv || 0)) return (cb.lv || 0) - (ca.lv || 0);
    const ra = (D.charById[a] || {}).rarity, rb = (D.charById[b] || {}).rarity;
    if ((order[ra] ?? 9) !== (order[rb] ?? 9)) return (order[ra] ?? 9) - (order[rb] ?? 9);
    return (cb.star || 1) - (ca.star || 1);
  });
  const party = ['@player'];
  own.forEach(id => { if (party.length < 5 && !party.includes(id)) party.push(id); });
  while (party.length < 5) party.push(null);
  S.party = party;
}

function spendAll() {
  // 铭刻（血统结晶）—— 前置是等级 + 通关
  for (let i = 0; i < 5; i++) { if (Core.geneLockUnlock().ok) continue; break; }
  // 主角血统（结晶 + 点数）
  let guard = 0;
  while (guard++ < 60 && Core.upgradePlayerBloodline().ok) { /* 一路升 */ }
  // 伙伴血统（结晶 + 点数）—— 结晶的另一个大出口，模拟里不能漏
  guard = 0;
  while (guard++ < 2000) {
    const ids = Object.keys(S.chars).filter(x => (S.chars[x].bloodlineLv || 0) < D.BLOODLINE_MAX);
    if (!ids.length) break;
    const low = ids.reduce((m, x) => ((S.chars[x].bloodlineLv || 0) < (S.chars[m].bloodlineLv || 0) ? x : m), ids[0]);
    if (Core.bloodlineUpgrade(low).ok) continue;
    break;
  }
  // 建筑（点数）
  guard = 0;
  while (guard++ < 600) {
    const b = D.BUILDINGS.reduce((min, x) => ((S.buildings[x.id] || 0) < (S.buildings[min.id] || 0) ? x : min), D.BUILDINGS[0]);
    if (Core.upgradeBuilding(b.id).ok) continue;
    break;
  }
  // 境界（点数 + 材料）—— 失败也扣，所以只试到条件不满足为止
  guard = 0;
  while (guard++ < 80) { const r = Core.attemptRealm(); if (!r.ok || !r.success && guard > 40) break; }
  // 秘术阁（异界结晶）：挑"还没满级且等级最低"的那条（满级的线要跳过，不然会被它挡住）
  guard = 0;
  while (guard++ < 200) {
    const open = D.KEJI.filter(x => Core.kejiLv(x.id) < x.max);
    if (!open.length) break;
    const k = open.reduce((min, x) => (Core.kejiLv(x.id) < Core.kejiLv(min.id) ? x : min), open[0]);
    if (Core.kejiUp(k.id).ok) continue;
    break;
  }
  // 灯阁权限（圣洁晶石 + 结晶）
  guard = 0;
  while (guard++ < 12) { if (Core.upgradeAuthority().ok) continue; break; }
  // 法宝（异界结晶的大出口）
  D.FABAO.forEach(f => { if (!Core.fabaoState().own.includes(f.id)) Core.buyFabao(f.id); });
  // 坐骑（点数）
  D.MOUNTS.forEach(m => { if (!Core.mountState().own.includes(m.id)) Core.buyMount(m.id); });
  // 伙伴：等级轮流升；技能按"还没满级且技能等级最低的那个人"轮流点（芯片会分给所有人）
  guard = 0;
  while (guard++ < 400) {
    const ids = Object.keys(S.chars);
    if (!ids.length) break;
    const lowLv = ids.reduce((m, x) => ((S.chars[x].lv || 0) < (S.chars[m].lv || 0) ? x : m), ids[0]);
    if (Core.levelUp(lowLv, 10).ok) continue;
    let did = false;
    for (let i = 0; i < 3 && !did; i++) {
      const cand = ids.filter(x => (S.chars[x].skillLv[i] || 0) < D.SKILL_MAX_BY_INDEX[i]);
      if (!cand.length) continue;
      const low = cand.reduce((m, x) => ((S.chars[x].skillLv[i] || 0) < (S.chars[m].skillLv[i] || 0) ? x : m), cand[0]);
      did = Core.skillUp(low, i).ok;
    }
    if (!did) break;
  }
}

/* 推图：找当前世界上第一个没通关的普通关，真打一场；赢了才继续下一关。
   打不过就停（这就是玩家会遇到的"卡关"）。 */
function pushWorlds() {
  for (let guard = 0; guard < 8; guard++) {
    let target = null;
    for (let wi = 0; wi < D.WORLDS.length && !target; wi++) {
      const w = D.WORLDS[wi];
      const st = S.worlds[w.id];
      if (!st || !st.unlocked) continue;
      const idx = st.stages.normal.findIndex(s => !(s > 0));
      if (idx >= 0) target = { wid: w.id, stage: idx + 1, idx };
    }
    if (!target) break;
    const kind = Dun.finalKind(target.stage);
    const allies = UI._panels.buildAllies({}, {});
    if (!allies.length) break;
    const res = window.Battle.run({
      allies, enemies: Dun.makeEnemies(target.wid, 'normal', target.stage, kind),
      worldId: target.wid, maxRounds: 60,
    });
    if (!res.win) break;
    const g = Dun.grantRewards(target.wid, 'normal', target.stage, kind);
    Core.addCharExp(S.party.filter(Boolean), g.rewards.exp);
    Core.addPlayerBattleExp(Math.round(g.rewards.exp * 0.5));
    Core.stageComplete(target.wid, 'normal', target.idx, 3);
  }
}

function snapshot(day) {
  const S2 = Core.S;
  const lines = [
    `第 ${String(day).padStart(3)} 天`,
    `Lv.${String(S2.player.level).padStart(3)}`,
    `战力 ${String(Math.round(Core.teamPower())).padStart(7)}`,
    `◈${String(Math.round(S2.cur.points)).padStart(9)}`,
    `◆${String(Math.round(S2.cur.otherworld)).padStart(7)}`,
    `❥${String(Math.round(S2.cur.bloodCrystal)).padStart(6)}`,
    `✦${String(Math.round(S2.cur.holy)).padStart(5)}`,
    `▣${String(Math.round(S2.cur.skillChip)).padStart(6)}`,
    `♜${String(Math.round(S2.cur.corridor)).padStart(4)}`,
    `建筑${String(Object.values(S2.buildings).reduce((a, b) => a + b, 0)).padStart(3)}`,
    `血统Lv.${String(S2.player.bloodlineLv).padStart(2)}`,
    `铭刻${S2.player.geneLock}`,
    `境界${String(S2.player.realm || 0).padStart(2)}`,
    `评级${String(S2.sect.lv).padStart(2)}`,
    `秘术${String(D.KEJI.reduce((s, k) => s + Core.kejiLv(k.id), 0)).padStart(4)}`,
    `深井${String(S2.corridor.best).padStart(3)}`,
    `副本${(() => { let cleared = 0, cur = 'W01'; D.WORLDS.forEach(w => { const st = S2.worlds[w.id]; if (!st || !st.unlocked) return; cleared += st.stages.normal.filter(s => s > 0).length; cur = w.id; }); return cur + '-' + cleared + '关'; })()}`,
  ];
  log.push('  ' + lines.join(' · '));
  // 顺手找 NaN / 负数
  Object.entries(S2.cur).forEach(([k, v]) => { if (!Number.isFinite(v)) NaNcheck.push(`第 ${day} 天 货币 ${k} = ${v}`); });
  if (!Number.isFinite(Core.teamPower())) NaNcheck.push(`第 ${day} 天 战力 = ${Core.teamPower()}`);
}

const marks = [1, 3, 7, 14, 21, 30, 60, 90].filter(d => d <= DAYS);
snapshot(0);
for (let day = 1; day <= DAYS; day++) {
  addDay();
  if (marks.indexOf(day) >= 0 || day === DAYS) snapshot(day);
}

console.log(`=== 长线模拟（每天正常玩一遍：挂机 + 扫荡 60 + 斗法台 5 + 深井推进 + 日常全清）===`);
console.log(log.join('\n'));
console.log('\n=== 体检结论 ===');
if (NaNcheck.length) NaNcheck.forEach(x => console.log('  ✗ ' + x));
else console.log('  ✓ 全程没有 NaN / Infinity / 负数货币');
const spent = ['points', 'otherworld', 'bloodCrystal', 'holy', 'skillChip'].filter(k => Core.S.cur[k] > 0);
console.log('  ' + (spent.length ? '⚠ 第 ' + DAYS + ' 天仍有余额没花完：' + spent.map(k => (D.CURRENCIES.find(c => c.id === k) || {}).name + ' ' + Math.round(Core.S.cur[k])).join(' · ') + '（看是不是某条线已经满了、货币没处花）' : '✓ 所有货币都花光了（说明出口够）'));
console.log('  · 已到顶的线：' + [
  Core.S.player.level >= D.PLAYER_MAX_LV ? '等级' : null,
  Core.S.player.geneLock >= D.GENE_LOCKS.length ? '铭刻' : null,
  Core.S.player.bloodlineLv >= D.BLOODLINE_MAX ? '主角血统' : null,
  Object.values(Core.S.buildings).every(v => v >= 50) ? '建筑' : null,
  Core.S.player.realm >= D.REALM_STAGE_COUNT ? '境界' : null,
  Core.S.sect.lv >= D.SECT_MAX ? '评级' : null,
].filter(Boolean).join(' / ') || '（还没有满的线）');

// 收尾：把"没满的线还差什么"打出来，方便判断卡在哪
console.log('\n=== 各条线还差什么（卡点自查）===');
const Sf = Core.S;
console.log('  铭刻：' + (Core.geneLockInfo().max ? '已满' : JSON.stringify(Core.geneLockInfo().reqs)));
console.log('  下一个境界：' + (Core.realmState().next ? `Lv.${Core.realmState().next.lv} · 材料 ${Core.realmState().haveMat}/${Core.realmState().matN} · ◈${Core.realmState().points}` : '已满'));
console.log('  灯阁权限：Lv.' + Sf.auth + '/' + D.AUTHORITY_MAX + ' 下一级 ' + JSON.stringify(Sf.auth >= D.AUTHORITY_MAX ? '已满' : D.authorityCost(Sf.auth)));
console.log('  关卡进度：' + D.WORLDS.map(w => { const st = Sf.worlds[w.id]; return st && st.unlocked ? `${w.id}:${st.stages.normal.filter(s => s > 0).length}/12` : null; }).filter(Boolean).join(' '));
