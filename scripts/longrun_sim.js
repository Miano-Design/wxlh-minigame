/* 长线模拟：node scripts/longrun_sim.js [天数]

   V1.1.8（丁组 B12 ⑤）：**加了"广告全开"档** —— `node scripts/longrun_sim.js 90 ads`
     在这一档里，把**每个广告点位每天都用满**再算一天：
       · 离线翻倍（不限次数）→ 按"当天挂机收入再给一份"建模（与《变现三条终版口径》§1.2 一致）
       · 挂机加速 ×3（每次 2 小时产出、直接发，`Core.adIdleBoost`）
       · 扫荡 +10 ×3（买来的额度**先加**、再按日扫荡，全额结算 —— `Core.addAdSweepBonus`）
       · 高级池免费 10 抽（`Core.adRecruitAdv`）
       · 签到双倍（`Core.claimLoginDouble`）
     倍速 ×5 **不进这一档**（纯时间权益、不改产出）。
     为什么要有这一档：广告整套上线之后，"**最坏一天**"是这一档而不是默认那档 ——
     判"经济会不会被打穿"必须看它（神话概率 B11 也是按这一档算完才收的）。

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
const SIM = require('./_sim_allies');   // V1.1.11：组队入口从界面层搬出来（见同目录 _sim_allies.js）
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
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, Dun = window.Dungeon, UI = window.UI;

const DAYS = Math.max(1, Math.min(365, +(process.argv[2] || 30)));
/* 广告全开档（见文件头）：`node scripts/longrun_sim.js 90 ads` */
const ADS = /^ads$/.test(String(process.argv[3] || ''));
Core.newGame(); Core.setPlayerName('长线'); Core.choosePlayerBloodline('修真');
Core.ensureDaily();
const S = Core.S;
const log = [];
const NaNcheck = [];

function addDay() {
  /* V9.6.146（父亲大人："你自己根据获得的程度判定货币稀有度"）：
     从这一行起给**进项**记账（Core.tallyCur 只记 addCur 的正数，花出去的不算）——
     `addCur` 是所有产出的唯一入口，所以副本/悬赏/任务/求签/奇遇/分解/挂机一条都跑不掉。 */
  Core.tallyCur(true);
  // ⓪ 推图：用**真实战斗引擎**一关一关打（这是整个游戏的主循环，不能靠估算）
  pushWorlds();
  // ⓪b 回头补困难 / 地狱首通（V1.0.1）
  pushDifficulties();
  // ① 挂机：每天收一次，受离线上限截断
  S.idle.bankSec = Core.offlineCapHours() * 3600;
  Core.claimIdle();
  if (ADS) {
    /* B4 离线翻倍：**把当天挂机这一条收入再给一份**（不限次数 —— 一天只上线一次的玩家就翻一次）；
       B5 挂机加速 ×3：每次 2 小时产出、直接发（走的正是界面上那颗按钮的入口）。 */
    S.idle.bankSec = Core.offlineCapHours() * 3600;
    Core.claimIdle();
    for (let i = 0; i < 3; i++) Core.adIdleBoost();
  }
  /* ② 扫荡：会玩的人一定扫**守关 Boss 那一关**——
       它是同一次扫荡消耗，但奖励是普通关的 5 倍左右（W01：普通 120 点 vs Boss 650 点）。
       ⚠ 这本身就是个设计问题（"选择扫荡关卡"其实永远该选第 12 关），先按最优打法模拟。 */
  let boss = null;
  D.WORLDS.forEach(w => {
    const st = S.worlds[w.id];
    if (st && st.unlocked && st.stages.normal[11] > 0) boss = { w: w.id };
  });
  if (boss) {
    S.sweep = { date: Core.dailyDate(), count: 0, bonus: 0, adBonus: 0 };
    /* B6：广告额度**先加**（3 次 × +10），再按日扫荡 —— 那 30 次是"全额结算"的真扫荡 */
    if (ADS) for (let i = 0; i < 3; i++) Core.addAdSweepBonus(10);
    Dun.sweep(boss.w, 'normal', 12, 60 + (ADS ? 30 : 0));
  }
  // ②b 招募：免费抽用掉 + 用点数抽到没钱（伙伴是技能芯片的唯一去处，不招人芯片会白堆）
  ['normal', 'advanced'].forEach(p => { for (let i = 0; i < 4; i++) { if (!Core.freeRecruit(p).ok) break; } });
  /* B7：高级池"看广告免费 1 抽" ×10（广告全开档才打） */
  if (ADS) for (let i = 0; i < 10; i++) Core.adRecruitAdv();
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
    const allies = SIM.buildAllies(null, null, { mult: 1 + Core.corridorMarkBonus() });
    if (!allies.length) break;
    const res = window.Battle.run({ allies, enemies: [D.corridorEnemy(floor)], worldId: null, maxRounds: 60 });
    if (!res.win) break;
    const rw = D.corridorReward(floor);
    Core.addCur('points', rw.points);
    Core.addCur('otherworld', rw.otherworld);
    
    S.corridor.best = Math.max(S.corridor.best, floor);
    S.corridor.floor++;
  }
  /* ⑤ 每日任务 + 登录 + 悬赏 + 求签
     V1.0.1（父亲大人："你根据这个再去定别的物品的定价"）：
     这一段原来漏了**求签 / 周常 / 成就 / 图鉴**，而它们都是圣洁晶石的来源 ——
     于是模拟报出来的 holy 日收入（41）远低于真实值，按它判价会把限定池判成"抽不起"。
     改成：先求签、把每日进度拉满，再交给 claimEverything() 一次收干净（它自己会领
     每日 / 全部完成 / 周常 / 成就 / 图鉴，重复调用安全）。 */
  Core.drawSign();
  D.DAILY_TASKS.forEach(t => { S.tasks.daily[t.id] = t.target; });
  Core.loginReward();
  if (ADS) Core.claimLoginDouble();          // B8 签到双倍（只翻当天那一格）
  Core.bountyState().list.forEach(b => { if (b.done && !b.claimed && !b.expired) Core.claimBounty(b.id); });
  Core.claimEverything();
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
  // V9.6.76：**给下一阶铭刻留钱**。
  //   实测（第 60~180 天）：结晶永远在 10 枚上下、铭刻永远差 375 里的 75 枚 —— 模拟把自己锁死了。
  //   原因是它"手里有多少花多少"，全倒给伙伴血统，而铭刻检查排在花钱之前。
  //   真玩家会看着"铭刻 2：血统结晶 300/375"攒两天再买，模拟也照着做。
  const gl = Core.geneLockInfo();
  let reserve = gl && gl.next ? (gl.next.cost.otherworld || 0) : 0;
  /* V9.6.144：只有"钱到位就能买"时才为铭刻留钱。
     如果它还被**通关进度**挡着（reqs 里还有"通关 XXX"），留钱就是纯浪费 ——
     实测：模拟会为「铭刻 8 阶（要通关血月旧堡）」一直攒，90 天一步不动。
     真玩家看着那行字就会先把结晶花在秘术阁上。 */
  if (gl && gl.reqs && gl.reqs.some(r => String(r).indexOf('通关') === 0)) reserve = 0;
  for (let i = 0; i < 5; i++) { if (Core.geneLockUnlock().ok) continue; break; }
  /* 主角血统（结晶 + 点数）
     V9.6.144（长线模拟自审抓到的）：这里原来**没有**保留额检查 ——
     而它在 spendAll 里排在最前面，会把结晶一路掏到 0；后面秘术阁那个无底洞再掏一遍。
     结果：模拟到第 180 天结晶常年只有几十枚，永远攒不出「铭刻 2 阶 = 10500」，
     于是**一次都转不了生**，卡在 W13，门后 24 张图完全没被验证过。
     真玩家会盯着转生页那句"铭刻 1/2"攒钱，模拟也照做。 */
  let guard = 0;
  while (guard++ < 60 && S.cur.otherworld > reserve && Core.upgradePlayerBloodline().ok) { /* 一路升 */ }
  /* 伙伴血统（结晶 + 点数）—— 结晶的另一个大出口。
     V9.6.76 两处改对：① 只养**上阵的那 5 个**（原来是把结晶平摊给全部 120 个伙伴，
     一次升 1 级的那种"雨露均沾"打法，真玩家不这么玩）；② 花到"下一阶铭刻的保留额"就停。 */
  guard = 0;
  while (guard++ < 2000 && S.cur.otherworld > reserve) {
    const ids = S.party.filter(x => x && x !== '@player' && S.chars[x] && (S.chars[x].bloodlineLv || 0) < D.BLOODLINE_MAX);
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
  while (guard++ < 200 && S.cur.otherworld > reserve) {
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
  /* ---- V9.6.144：补齐"真玩家一定会做、但模拟一直没做"的几条主力养成 ----
     以前这个模拟只做 上阵 + 一键最优装备，于是战力只有真玩家的一个零头，
     推图卡在 W16 就得出"后期很慢"的结论 —— 那是模拟器的缺口，不是游戏的锅。
     下面四条都是**界面上一键就能做**的事，模拟按"能做就做"来。 */
  // ① 血清：配方解锁了就炼、炼了就喂（永久属性，界面一键能做完）
  D.SERUMS.forEach(s => {
    if (!Core.serumUnlocked(s)) return;
    const item = D.SERUM_ITEM(s.id);
    const target = (S.party || []).filter(x => x);
    target.forEach(id => {
      if (s.bloodline && id !== '@player' && (D.charById[id] || {}).bloodline !== s.bloodline) return;
      if (s.bloodline && id === '@player' && S.player.bloodline !== s.bloodline) return;
      let g = 0;
      while (g++ < 80 && (S.items[item] || 0) < 1 && Core.craftSerum(s.id, 5).ok) { /* 炼到够 */ }
      Core.useSerum(id, s.id, 5);
    });
  });
  // ② 坐骑喂养 / 法宝祭炼（V9.6.130 的新线，模拟原来完全没碰）
  guard = 0;
  while (guard++ < 30 && Core.feedMount((Core.mountState() || {}).on) .ok) { /* 喂到喂不动 */ }
  guard = 0;
  while (guard++ < 30 && Core.refineFabao((Core.fabaoState() || {}).on).ok) { /* 祭炼到炼不动 */ }
  // ③ 装备强化：给上阵那 5 人身上的装备一路强化（界面上的"强化"按钮）
  guard = 0;
  while (guard++ < 400) {
    const uids = [];
    (S.party || []).filter(x => x).forEach(id => {
      const eq = S.equipped[id] || {};
      Object.keys(eq).forEach(slot => { if (eq[slot]) uids.push(eq[slot]); });
    });
    if (!uids.length) break;
    const low = uids.reduce((m, u) => ((S.equips[m] && S.equips[m].enhance || 0) <= ((S.equips[u] || {}).enhance || 0) ? m : u), uids[0]);
    if (S.cur.otherworld <= reserve) break;          // 同样给铭刻留钱
    if (Core.enhance(low).ok) continue;
    break;
  }
  // ④ 限定池招募（V1.0.1 货币对调后，圣洁晶石的主力出口 = 定向 UP、50 抽保底当期 UP）
  //    这里只抽限定池：高级池现在花异界结晶，一起抽会吃掉留给铭刻的钱，模拟就转不了生了。
  guard = 0;
  while (guard++ < 10 && Core.recruitTen('limited').ok) { /* 抽到抽不动 */ }
  /* 伙伴：等级轮流升；技能按"还没满级且技能等级最低的那个人"轮流点。
     ⚠️ V9.6.144：伙伴技能现在是花**异界结晶**的（货币合并之后），而且这是个无底洞
     （全伙伴 × 3 条 × 35 级）—— 同样必须给下一阶铭刻留钱，否则模拟永远攒不出
     「铭刻 2 阶 = 10500」，180 天一次都转不了生。 */
  guard = 0;
  while (guard++ < 400) {
    const ids = Object.keys(S.chars);
    if (!ids.length) break;
    const lowLv = ids.reduce((m, x) => ((S.chars[x].lv || 0) < (S.chars[m].lv || 0) ? x : m), ids[0]);
    if (Core.levelUp(lowLv, 10).ok) continue;
    if (S.cur.otherworld <= reserve) break;      // 攒着给铭刻，先不点技能
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
    const allies = SIM.buildAllies({}, {});
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

/* 补困难 / 地狱首通（V1.0.1）。

   为什么必须有这一段：世界首通奖励 FIRST_CLEAR 是圣洁晶石的**头号来源**
   （普通 100 / 困难 150 / 地狱 250，36 张图全通就是 18,000），
   而原来这个模拟**只打普通难度** → holy 的日收入被砍掉一大半，
   拿它去判断"限定招募 100 晶石一抽贵不贵"必然得出错误结论。

   节奏模仿真玩家：普通通完一张图，才会回头补它的困难 / 地狱；
   每天每个难度只补一关（不会一天刷完），打不过就跳过换下一张图。 */
function pushDifficulties() {
  for (const diff of ['hard', 'hell']) {
    for (const w of D.WORLDS) {
      const st = S.worlds[w.id];
      if (!st || !st.unlocked) continue;
      if (!st.stages.normal.every(s => s > 0)) continue;       // 普通没通完，不回头打
      const idx = st.stages[diff].findIndex(s => !(s > 0));
      if (idx < 0) continue;
      const stage = idx + 1;
      const kind = Dun.finalKind(stage);
      const allies = SIM.buildAllies({}, {});
      if (!allies.length) return;
      const res = window.Battle.run({
        allies, enemies: Dun.makeEnemies(w.id, diff, stage, kind),
        worldId: w.id, maxRounds: 60,
      });
      if (!res.win) continue;                                   // 这关打不过就换下一张图
      const g = Dun.grantRewards(w.id, diff, stage, kind);
      Core.addCharExp(S.party.filter(Boolean), g.rewards.exp);
      Core.addPlayerBattleExp(Math.round(g.rewards.exp * 0.5));
      Core.stageComplete(w.id, diff, idx, 3);
    }
  }
}

/* 转生门：门后的世界进不去（unlockWorld 会挡），能转生就转。
   V9.6.76 才补上这一段 —— 长线模拟以前**根本不会转生**，所以"三道转生门是不是死锁"
   它一句都答不上来。体检脚本必须跟着版本走，不然它报的绿灯是假的：
   实测第 60~180 天玩家一步没动过，模拟照样打勾。 */
const reincLog = [];
const gateStuck = { world: null, since: 0, gap: null, need: 0 };
function maybeReincarnate(day) {
  const next = D.WORLDS.find(w => !(Core.S.worlds[w.id] && Core.S.worlds[w.id].unlocked));
  if (!next) { gateStuck.world = null; return false; }
  const need = Core.worldReincarnNeed(next.id);
  const cur = Core.S.player.reincarnations || 0;
  if (!need || cur >= need) { gateStuck.world = null; return false; }
  if (!Core.canReincarnate()) {
    if (gateStuck.world !== next.id) Object.assign(gateStuck, { world: next.id, since: day, need });
    gateStuck.gap = Core.reincarnGap();
    gateStuck.days = day - gateStuck.since;
    return false;
  }
  const r = Core.reincarnate();
  if (r.ok) { reincLog.push({ day, count: r.count, world: next.id }); gateStuck.world = null; }
  return r.ok;
}

function snapshot(day) {
  const S2 = Core.S;
  const lines = [
    `第 ${String(day).padStart(3)} 天`,
    `转生${S2.player.reincarnations}`,
    `Lv.${String(S2.player.level).padStart(3)}`,
    `战力 ${String(Math.round(Core.teamPower())).padStart(7)}`,
    // V9.6.134：货币 8 → 4，这一行只报四种
    `◉${String(Math.round(S2.cur.points)).padStart(9)}`,
    `◆${String(Math.round(S2.cur.otherworld)).padStart(8)}`,
    `✦${String(Math.round(S2.cur.holy)).padStart(5)}`,
    `♾${String(Math.round(S2.cur.rp)).padStart(3)}`,
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
const DAY_GAIN = {};                       // 各货币的**累计进项**（见 addDay 里的 tallyCur）
for (let day = 1; day <= DAYS; day++) {
  addDay();
  Object.entries(Core.tallyCur() || {}).forEach(([k, v]) => { DAY_GAIN[k] = (DAY_GAIN[k] || 0) + v; });
  maybeReincarnate(day);
  if (marks.indexOf(day) >= 0 || day === DAYS) snapshot(day);
}

console.log(`=== 长线模拟（每天正常玩一遍：挂机 + 扫荡 60 + 斗法台 5 + 深井推进 + 日常全清）===`);
console.log(log.join('\n'));
console.log('\n=== 体检结论 ===');
if (NaNcheck.length) NaNcheck.forEach(x => console.log('  ✗ ' + x));
else console.log('  ✓ 全程没有 NaN / Infinity / 负数货币');
/* 转生门体检：门后那几张图到底进不进得去（这才是"中后期卡不卡死"的答案） */
{
  const maxGate = Math.max.apply(null, D.WORLDS.map(w => w.reincarn || 0));
  console.log('\n=== 转生门 ===');
  if (!reincLog.length) {
    console.log(gateStuck.world
      ? `  ✗ ${DAYS} 天一次都没转成 —— 卡在 ${gateStuck.world}（要转生 ${gateStuck.need} 次，还差 ${JSON.stringify(gateStuck.gap)}），门后 ${D.WORLDS.length - D.WORLDS.findIndex(w => w.id === gateStuck.world)} 张图全进不去`
      : '  · 没碰到转生门（天数太短或早就到头了）');
  } else {
    reincLog.forEach(x => console.log(`  第 ${x.day} 天：第 ${x.count} 次转生（当时卡在 ${x.world}）`));
    const cur = Core.S.player.reincarnations || 0;
    if (cur >= maxGate) console.log(`  ✓ 转生 ${cur} 次，${maxGate} 道门全部迈过`);
    else if (gateStuck.world) console.log(`  △ 转了 ${cur} 次，还卡在 ${gateStuck.world}（要 ${gateStuck.need} 次）—— 天数不够，不是死锁`);
  }
}
const spent = ['points', 'otherworld', 'holy', 'rp'].filter(k => Core.S.cur[k] > 0);
/* V9.6.146：**实测日收入**（进项，不含开局赠送）——判断"哪种货币更稀有"就看这里，
   不再靠 cap_audit 里那个写死的 `holy: 20`（那个假设把圣洁晶石说成最稀有，与实测相反）。 */
console.log('\n=== 各货币的实测日收入（' + DAYS + ' 天累计 ÷ 天数，不含开局赠送）'
  + (ADS ? '【**广告全开档**】' : '【默认档】') + ' ===');
['points', 'otherworld', 'holy', 'rp'].forEach(k => {
  const nm = (D.CURRENCIES.find(c => c.id === k) || {}).name || k;
  console.log('  ' + nm.padEnd(6) + ' 日均 ' + Math.round((DAY_GAIN[k] || 0) / DAYS).toLocaleString().padStart(9) + '  · ' + DAYS + ' 天累计 ' + Math.round(DAY_GAIN[k] || 0).toLocaleString());
});
// 按日收入从多到少排：这就是"稀有度"的客观口径
console.log('  → 稀有度（由多到少）：' + ['points', 'otherworld', 'holy', 'rp']
  .map(k => ({ k, v: (DAY_GAIN[k] || 0) / DAYS })).sort((a, b) => b.v - a.v)
  .map(x => (D.CURRENCIES.find(c => c.id === x.k) || {}).name || x.k).join(' > '));
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
