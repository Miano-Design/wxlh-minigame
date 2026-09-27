/* 关卡难度曲线体检：node scripts/world_curve.js

   起因（2026-09-17 十五度自审）：`balance_check.js` 只量了 W01（新手队 Lv.11 能不能打过），
   但父亲大人前后两次抱怨的都是"关卡难度"（"副本前期难度太高、打没几关就卡关"、
   "深井一下子就能推好多关"）。20 个世界的难度曲线到底长什么样，一直没人整条量过。

   ⚠ 第一版这把尺子本身是错的：它只量**下限**（主角 + 2 名伙伴、伙伴低 4 级、全裸装），
     然后把"下限满级也打不穿"写成"13 个世界是硬墙"。可那个下限**不是任何一个玩家的状态**——
     真有人上满 5 人、真有人穿装备。照那把尺子去调难度，只会把游戏越调越水。
     所以这一版量**两档**，结论只认"常规档"：

     · 下限（裸装 3 人）：数值最坏情况，只用来定位"哪一段成长曲线在挨打"，不代表玩家
     · 常规（满编 5 人 + 本世界档次的装备 + 技能/血统按等级折算）：这才是正常玩家

   做法：对每个世界，从低到高试玩家等级，找出"能一口气打通这一世界普通 12 关（含守关 Boss）"
   的**最低等级**。含守关 Boss 是因为 Boss 才是真正卡人的那一关（长线模拟里卡的都是第 12 关）。

   还有第三档**满配**：常规档在 Lv.100 打不穿的世界，再问一句"每条养成线都点到上限的账号打不打得穿"。
   两档一起看才有意义 —— 常规档打不动、满配档打得动，那是"还得练"，不是"关卡做坏了"；
   满配档也打不动，才是真硬墙。

   随机数固定种子 —— 敌人编成与装备词条都吃 Math.random，不锁种子的话两次跑出来的数不一样，
   体检报告就不可信了。 */
const fs = require('fs');
const SIM = require('./_sim_allies');   // V1.1.11：组队入口从界面层搬出来（见同目录 _sim_allies.js）
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};

let seed = 20260917;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const reseed = () => { seed = 20260917; };

for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, Battle = window.Battle, Dun = window.Dungeon, UI = window.UI;

const RARITY_ORDER = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
const BEST_CHARS = D.characters.slice().sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9)).map(c => c.id);

/* V1.1.9（续13）：反解难度时只想扫几关，不想每次都等整条曲线。
   `--only=W29,W33,W34,W35,W36` 只跑这几张图（此时"落差 / 前期门槛"两节自动跳过，它们需要全集）；
   `--no-lower` 跳过"下限档"那一列（那一列只是对照，反解时用不上，省一半时间）。 */
const ONLY_IDS = (() => {
  const a = process.argv.find(x => x.startsWith('--only='));
  return a ? a.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null;
})();
const NO_LOWER = process.argv.includes('--no-lower');

/* 下限档：主角 + 2 名伙伴（伙伴低 4 级），全裸装。属性点全分掉（不攒着）。 */
function teamLower(lv) {
  Core.newGame();
  Core.setPlayerName('曲线下限');
  Core.choosePlayerBloodline('修真');
  const p = Core.S.player;
  p.level = lv;
  p.attrPoints = lv * 3;
  D.ATTR_META.forEach(a => Core.allocateAttr(a.id, Math.floor(p.attrPoints / (D.ATTR_META.length * 10)) * 10));
  ['C021', 'C022'].forEach(id => { try { Core.addChar(id); Core.S.chars[id].lv = Math.max(0, lv - 4); } catch (e) {} });
  Core.S.party = ['@player', 'C021', 'C022', null, null];
}

/* 常规档：满编 5 人（挑稀有度最高的 4 名伙伴）、穿本世界档次的装备、
   技能与血统按等级线性折算（Lv.100 时血统 50 满、技能 40 级上下，和长线模拟第 30 天实测一致）。 */
function teamNormal(wid, lv) {
  Core.newGame();
  Core.setPlayerName('曲线常规');
  Core.choosePlayerBloodline('修真');
  const S = Core.S, p = S.player;
  p.level = lv;
  p.attrPoints = lv * 3;
  D.ATTR_META.forEach(a => Core.allocateAttr(a.id, Math.floor(p.attrPoints / (D.ATTR_META.length * 10)) * 10));
  const ids = BEST_CHARS.slice(0, 4);
  ids.forEach(id => { Core.addChar(id); S.chars[id].lv = lv; });
  S.party = ['@player'].concat(ids);
  const skill = D.SKILL_MAX_BY_INDEX.map(m => Math.min(m, Math.round(lv * 0.4)));
  const blood = Math.min(D.BLOODLINE_MAX, Math.round(lv * 0.5));
  p.bloodlineLv = blood;
  ids.forEach(id => { S.chars[id].skillLv = skill.slice(); S.chars[id].bloodlineLv = blood; });
  const wi = D.WORLDS.findIndex(w => w.id === wid);
  /* V9.6.76：**转生门里的人数得算进去**。
     门后的世界（W13 起）压根进不去，除非已经转了 N 次 —— 那么"常规档"就不能还是
     "0 次转生 + 光板天赋"，那是**不存在的账号**，拿它量后期难度等于拿幽灵测关卡。
     所以按门给到该有的转生次数与转生点，再把点数花掉（挑最便宜的那一支点，和玩家一样）。 */
  let gateN = 0;
  for (let i = 0; i <= wi; i++) gateN = Math.max(gateN, D.WORLDS[i].reincarn || 0);
  p.reincarnations = gateN;
  let rp = 0;
  for (let k = 1; k <= gateN; k++) rp += Math.floor(100 * Math.pow(k, 1.15));
  Core.addCur('rp', rp);
  for (let guard = 0; guard < 200; guard++) {
    const open = Object.keys(D.TALENTS).filter(b => S.player.talents[b] < 10);
    if (!open.length) break;
    const b = open.reduce((m, x) => (D.TALENT_COSTS[S.player.talents[x]] < D.TALENT_COSTS[S.player.talents[m]] ? x : m), open[0]);
    if (!Core.buyTalent(b).ok) break;
  }
  const rarity = wi >= 10 ? 'UR' : wi >= 4 ? 'SSR' : 'SR';
  S.bag.eqCap = 400;                                   // 体检不测背包，别让自动分解把装备吃掉
  for (let i = 0; i < 120; i++) Core.grantEquip(wid, rarity, null);
  /* 久置养成的进度（V9.6.76）。
     以前这份"常规档"只有等级 + 血统 + 技能 + 装备，**铭刻/秘术阁/法宝/坐骑/灯阁权限全是 0** ——
     拿它量末段，等于让一个"什么都没攒"的账号去打第 30 张图，报出来的 >100 是尺子的问题，不是关卡的问题。
     按"走到这张图时该有的进度"给：铭刻按转生门给到的阶数，秘术阁/灯阁权限按四成，法宝坐骑全买。 */
  const gl = gateN ? (D.REINCARN_REQS[Math.min(gateN, D.REINCARN_REQS.length) - 1] || {}).geneLock : (wi >= 6 ? 2 : 1);
  ['points', 'otherworld', 'bloodCrystal', 'holy', 'corridor', 'skillChip', 'story'].forEach(k => Core.addCur(k, 1e9));
  for (let i = 0; i < gl + 2; i++) Core.geneLockUnlock();
  D.MOUNTS.forEach(m => Core.buyMount(m.id));
  D.FABAO.forEach(f => Core.buyFabao(f.id));
  D.KEJI.forEach(k => { for (let i = 0; i < Math.ceil(k.max * 0.4); i++) Core.kejiUp(k.id); });
  for (let i = 0; i < 4; i++) Core.upgradeAuthority();
  /* V9.6.76：第 21 张图起，玩家的装备表里已经有**血统神装（神话）**了 ——
     这份尺子要跟着版本走：不把神装算进来，"常规档"就还是在拿一套不存在的配装量末段。
     件数按"刷了多久"给：过第 21 张时手上也就几件，越往后越多（每张 +60 件，上限 700）。 */
  if (wi >= 20) {
    const n = Math.min(700, 60 + (wi - 20) * 60);
    for (let i = 0; i < n; i++) Core.grantEquip(wid, 'MYTH', null);
  }
  Core.autoEquipBest();
}

/* 这一世界普通难度能不能从头到尾打穿（12 关，每关都从满血开打，和游戏里一样）。
   ⚠ 一局一采样不可信：敌人编成是随机抽的，同一档位换个种子就能从"险过"翻成"惨败"。
     所以每档位打 3 次、**赢 2 次才算过**（多数票），把运气成分压掉。 */
/* ================= V1.1.9（续13）· 新基线：**允许每场 1 次复活** =================
   依据＝报告 §五 5.4：复活（B10）是**线上现实**，"不能假装不存在" ——
   同一张 W20 守关，禁止复活时 Lv.100 也打不过（Boss 剩 9.5% 血），
   允许 1 次复活后 **Lv.36~40 就能过**。所以通过线必须按"有复活"重画，
   而 5 道硬墙也要按这个标准修（否则修完还是被复活打穿，等于白修）。
   实现口径**与战斗页 `battleRevive` 逐条一致**：敌人带**剩余**血量进场、我方阵亡者按
   `maxHp × 50%` 起来（活着的保留当前血量）、这一场的临时态（状态/护盾/相位/召唤标记）不带过去。
   ⚠️ 复活的**参数本身（回血 50% → 35%？）本轮一个字没动** —— 父亲大人没拍（回单里列成待拍）。 */

/* 打一关；allowRevive = 允许那一次复活。
   `scale` = 把敌人整体强度乘一个系数（用来量"余量"：1.30 ＝ 派单要的"满配能过 ＋ 30% 余量"）。 */
function fightStage(wid, stage, allowRevive, scale, scale_axis) {
  const kind = Dun.finalKind(stage);
  const allies = SIM.buildAllies({}, {});
  if (!allies.length) return false;
  const mk = () => {
    const list = Dun.makeEnemies(wid, 'normal', stage, kind);
    if (!scale || scale === 1) return list;
    /* ⚠️ 两栏口径，**必须分开看**（第一版只量了一栏，读数把人骗过一次）：
       · `hpOnly`：只涨 **HP** —— "敌人血量还能再厚多少"；
       · `hpAtk` ：HP 与攻击一起涨 —— 这一栏才是"强度"。
       为什么两栏差得远：伤害公式是 `atk²/(atk+def)`，**攻击是平方项** ——
       +30% 攻击 ≈ +69% 伤害，所以"攻击也涨 30%"比"血量涨 30%"狠得多，
       而 `ease` 同时作用在 HP 与攻击上（`m = … * ease`、`mAtk = … * ease`；防御那条 `mDef` 不带 ease）。 */
    return list.map(e => Object.assign({}, e, {
      hp: e.hp * scale,
      atk: scale_axis === 'hp' ? e.atk : e.atk * scale,
    }));
  };
  const res = Battle.run({ allies, enemies: mk(), worldId: wid, maxRounds: 60 });
  if (res.win) return true;
  if (!allowRevive) return false;
  const carry = (u, isAlly) => {
    const spec = {};
    Object.keys(u).forEach((k) => {
      if (['uid', 'side', 'statuses', 'shield', 'phase70', 'phase30', 'revived', 'summoned', 'hp', 'maxHp', 'energy'].indexOf(k) >= 0) return;
      spec[k] = u[k];
    });
    spec.maxHp = u.maxHp;
    spec.hp = isAlly ? (u.hp > 0 ? u.hp : Math.round(u.maxHp * 0.5)) : Math.max(1, Math.round(u.hp));
    spec.initEnergy = Math.max(0, Math.min(100, u.energy || 0));
    return spec;
  };
  const units = res.units || [];
  const a2 = units.filter(u => u.side === 'ally').map(u => carry(u, true));
  const e2 = units.filter(u => u.side === 'enemy').map(u => carry(u, false));
  if (!a2.length || !e2.length) return false;
  return Battle.run({ allies: a2, enemies: e2, worldId: wid, maxRounds: 60 }).win;
}

function clearsWorld(wid, lv, tier, revive, scale, scale_axis) {
  if (tier === 'lower') teamLower(lv);
  else if (tier === 'max') teamMax();
  else teamNormal(wid, lv);
  for (let stage = 1; stage <= 12; stage++) {
    if (!fightStage(wid, stage, revive, scale, scale_axis)) return false;
  }
  return true;
}

const ATTEMPTS = 3;
function clearsWorldVoted(wid, lv, tier, revive, scale, scale_axis) {
  let win = 0;
  for (let i = 0; i < ATTEMPTS; i++) {
    seed = 20260917 + i * 7919;      // 每次换一个种子，别让同一套敌人编成决定结论
    if (clearsWorld(wid, lv, tier, revive, scale, scale_axis)) win++;
    if (win >= 2) return true;       // 已经过半，提前收工
  }
  return false;
}

const LVS = [];
for (let l = 5; l <= 100; l += 5) LVS.push(l);

function minLevel(wid, tier, revive) {
  for (const lv of LVS) { reseed(); if (clearsWorldVoted(wid, lv, tier, revive)) return lv; }
  return null;
}

/* 满配档：每条养成线都点到上限的账号（不是"贵族玩家"，是把模拟跑满，问一句天花板有多高）。
   用它可以区分"关卡做坏了"和"要求满配"这两件事。 */
function teamMax() {
  Core.newGame();
  Core.setPlayerName('曲线满配');
  Core.choosePlayerBloodline('修真');
  const S = Core.S, p = S.player;
  D.WORLDS.forEach(w => {
    S.worlds[w.id] = S.worlds[w.id] || { unlocked: true, stages: {} };
    S.worlds[w.id].unlocked = true;
    ['normal', 'hard', 'hell'].forEach(d => { S.worlds[w.id].stages[d] = Array(12).fill(3); });
  });
  p.level = D.PLAYER_MAX_LV; p.attrPoints = 300; p.bloodlineLv = D.BLOODLINE_MAX;
  p.rp = 6200 * 4;                                     // 转生天赋四支点满
  p.realm = D.REALM_STAGE_COUNT;                       // 境界 36 阶
  if (S.sect) S.sect.lv = D.SECT_MAX;                  // 灯阁评级满
  D.ATTR_META.forEach(a => Core.allocateAttr(a.id, 50));
  ['points', 'otherworld', 'bloodCrystal', 'holy', 'corridor', 'skillChip', 'story'].forEach(k => Core.addCur(k, 1e9));
  for (let i = 0; i < 8; i++) Core.geneLockUnlock();    // 铭刻 5 阶
  const ids = BEST_CHARS.slice(0, 4);
  ids.forEach(id => { Core.addChar(id); S.chars[id].lv = D.PLAYER_MAX_LV; S.chars[id].star = 5; S.chars[id].skillLv = D.SKILL_MAX_BY_INDEX.slice(); S.chars[id].bloodlineLv = D.BLOODLINE_MAX; });
  S.party = ['@player'].concat(ids);
  let guard = 0;
  while (guard++ < 4000) {                             // 建筑
    const b = D.BUILDINGS.reduce((m, x) => ((S.buildings[x.id] || 0) < (S.buildings[m.id] || 0) ? x : m), D.BUILDINGS[0]);
    if (!Core.upgradeBuilding(b.id).ok) break;
  }
  D.MOUNTS.forEach(m => Core.buyMount(m.id));
  D.FABAO.forEach(f => Core.buyFabao(f.id));
  guard = 0;
  while (guard++ < 2000) {                             // 秘术阁
    const open = D.KEJI.filter(x => Core.kejiLv(x.id) < x.max);
    if (!open.length) break;
    if (!Core.kejiUp(open[0].id).ok) break;
  }
  guard = 0;
  while (guard++ < 40) { if (!Core.upgradeAuthority().ok) break; }
  S.bag.eqCap = 800;
  for (let i = 0; i < 200; i++) Core.grantEquip(D.WORLDS[D.WORLDS.length - 1].id, 'UR', null);
  for (let i = 0; i < 400; i++) Core.grantEquip(D.WORLDS[D.WORLDS.length - 1].id, 'MYTH', null);   // 满配 = 血统神装也配齐（V9.6.76）
  Core.autoEquipBest();
}

console.log('=== 每个世界要多少级才打得穿普通 12 关（含守关 Boss）===');
console.log('  世界'.padEnd(22) + '  下限(裸装3人)   常规(满编5人+本档装备)');
const lower = [], normal = [];
D.WORLDS.forEach(w => {
  if (ONLY_IDS && ONLY_IDS.indexOf(w.id) < 0) { lower.push(null); normal.push(null); return; }
  const a = (ONLY_IDS || NO_LOWER) ? null : minLevel(w.id, 'lower');
  const b = minLevel(w.id, 'normal');
  lower.push(a); normal.push(b);
  const label = `${w.id} ${w.name}`;
  console.log('  ' + label.padEnd(20)
    + (' Lv.' + (a === null ? '—' : a)).padEnd(17)
    + ' Lv.' + (b === null ? '>100 ⚠' : b));
});

/* 只认"常规档"的结论——下限档不是任何玩家的状态，它的数字只作对照。 */
console.log('\n=== 转生门（父亲大人："不转生就通关就不好玩了"）===');
const gates = D.WORLDS.filter(w => w.reincarn);
if (!gates.length) console.log('  （没有世界设门槛）');
gates.forEach(w => console.log('  ' + w.id + ' ' + w.name + '：需要转生 ' + w.reincarn + ' 次'));
if (gates.length) {
  const firstGate = D.WORLDS.findIndex(x => x.reincarn);
  const worst = gates[gates.length - 1].reincarn;
  console.log('  → 满配但不转生的账号，推进到第 ' + firstGate + ' 个世界（' + D.WORLDS[firstGate].id + '）就会停下');
  console.log('  → 全部 ' + D.WORLDS.length + ' 个世界，最多需要转生 ' + worst + ' 次（' + D.WORLDS.length + ' 张图 / ' + gates.length + ' 道门）');
}

if (!ONLY_IDS) {
console.log('\n=== 相邻世界的落差（常规档）===');
let jump = 0;
for (let i = 1; i < D.WORLDS.length; i++) {
  /* ================= V1.1.15（2026-09-27 · 策划总监 H 单点名的洞）=================
     常规档 `null` = "满级 100 也打不穿"。原来这一对是 **`continue` 整对跳过** ——
     于是 **W17（Lv.25）→ W18（>Lv.100）** 这种**全游戏最大的一级断崖从没被报过**，
     底下那句"✓ 相邻世界的等级门槛落差都在 15 级以内，没有断崖" 是**空的**（把最陡的那一段漏掉了）。
     现在分两种报法：
       · 一边是数字、另一边 null → 报"**档位切换**"（从这张图起进入"满配档"世界，设计如此，
         但必须让人看见 —— 否则谁都以为后半段是"练级能过"的）；
       · 两边都是数字且落差 ≥15 → 照旧报"落差偏大"。 */
  if (normal[i] === null && normal[i - 1] !== null) {
    console.log(`  · ${D.WORLDS[i - 1].id}→${D.WORLDS[i].id}：**档位切换** —— 前一站常规档 Lv.${normal[i - 1]} 能过，`
      + `这一站满级也过不去（从这张图起进入"满配档"世界）。不是落差，但玩家到此会明显"撞墙"，要看得见。`);
    jump++;
    continue;
  }
  if (normal[i] === null || normal[i - 1] === null) continue;
  const d = normal[i] - normal[i - 1];
  if (d >= 15) { console.log(`  ⚠ ${D.WORLDS[i - 1].id}→${D.WORLDS[i].id}：需要多练 ${d} 级（${normal[i - 1]} → ${normal[i]}），落差偏大`); jump++; }
}
if (!jump) console.log('  ✓ 相邻世界的等级门槛落差都在 15 级以内，没有断崖');

const walls = normal.filter(n => n === null).length;
console.log(`\n结论（只看常规档）：${walls
  ? '有 ' + walls + ' 个世界常规档满级打不穿，逐个用满配档复核下面的结论'
  : D.WORLDS.length + ' 个世界最迟 Lv.' + Math.max.apply(null, normal) + ' 都能打穿 ✓'}`);
const lowerKnown = lower.filter(x => x !== null);
console.log(`  下限档（裸装 3 人）仅供参考：${lowerKnown.length ? '最迟 Lv.' + Math.max.apply(null, lowerKnown) : '一个都打不穿'}，`
  + `${lower.filter(x => x === null).length} 个世界裸装打不穿 —— 这不是 bug，是"该穿装备该上人"的意思。`);
} else {
  const sel = D.WORLDS.filter(w => ONLY_IDS.indexOf(w.id) >= 0).map((w, k) => w.id + '＝Lv.' + (normal[D.WORLDS.indexOf(w)] === null ? '>100 ⚠' : normal[D.WORLDS.indexOf(w)]));
  console.log('\n（`--only` 模式：只扫了 ' + ONLY_IDS.join(' / ') + '，落差 / 前期门槛 / 结论这几节需要全集，已跳过）');
  console.log('  常规档读数：' + sel.join(' · '));
}

/* 常规档打不穿的世界：用满配账号复核 —— 满配能过就是"要求养成到位"，满配也过不去才是硬墙。 */
/* ================= V1.1.9（续13）· **允许 1 次复活**的常规档基线（`--revive` 才跑）=================
   报告 §五 5.4 的口径：复活是线上现实，通过线必须按它重画 —— 所以这张表**才是**新基线，
   上面那张（不允许复活）留作对照。多数票（3 赢 2）与上面完全同源。
   为什么默认不跑：要再扫一遍 20 个世界，耗时翻倍；它是"重画基线"时才需要的读数。 */
if (process.argv.includes('--revive')) {
  console.log('\n=== 新基线：允许每场 1 次复活时，常规档要多少级能打穿（多数票 3 赢 2）===');
  const pairs = [];
  D.WORLDS.forEach((w, i) => {
    reseed();
    const lv = minLevel(w.id, 'normal', true);
    pairs.push({ id: w.id, noRev: normal[i], rev: lv });
    console.log('  ' + `${w.id} ${w.name}`.padEnd(20)
      + ('不许复活 Lv.' + (normal[i] === null ? '>100' : normal[i])).padEnd(20)
      + '允许 1 次复活 Lv.' + (lv === null ? '>100' : lv));
  });
  const helped = pairs.filter(p => p.noRev === null && p.rev !== null).length;
  const still = pairs.filter(p => p.rev === null).length;
  console.log(`  → 复活把 ${helped} 个"不许复活时打不穿"的世界救回来了`
    + (still ? `；还有 ${still} 个连复活也打不穿（详见上面的满配复核）` : '；**新基线下 36 个世界全部打得穿** ✓'));
}

const stuck = D.WORLDS.filter((w, i) => normal[i] === null && (!ONLY_IDS || ONLY_IDS.indexOf(w.id) >= 0));
if (stuck.length) {
  console.log('\n=== 满配档复核（每条养成线都点到上限的账号）===');
  let realWall = 0;
  stuck.forEach(w => {
    reseed();
    const ok = clearsWorldVoted(w.id, 0, 'max', false, 1);
    /* 余量：把敌人强度乘 k（k>1 = 更硬），看满配还能不能打穿。两栏口径（HP / HP+攻击，见 fightStage 的注释）。
       ⚠️ 2026-09-27 修尺子：原来这句写的是 `for (let k = 1.05; k <= 1.6001; k += 0.05)` ——
          **1.60 是刻度上限，不是量出来的余量**。总监报告里"W18~W25 余量 1.60"因此是**封顶读数**：
          那些世界的真实余量比 1.60 还高（白给得更狠），所以谁按"1.60"去调难度都顶不动读数
          （康康 09-27 就这么白改了一次）。现在上限抬到 **3.0**，先让"白给到什么程度"能看见，
          再谈按图分段调 —— **没有真实读数之前不许动难度**。 */
    let mHp = 0, mAtk = 0;
    if (ok) {
      ['hp', 'atk'].forEach((axis, i) => {
        let m = 1;
        for (let k = 1.05; k <= 3.0001; k += 0.05) {
          reseed();
          if (!clearsWorldVoted(w.id, 0, 'max', false, +k.toFixed(2), axis)) break;
          m = +k.toFixed(2);
        }
        if (i === 0) mHp = m; else mAtk = m;
      });
    }
    /* 满配打不穿时再问一句"**允许 1 次复活**呢"（报告 §5.4 定的新基线：复活是线上现实）。 */
    const okRevive = ok ? true : (reseed(), clearsWorldVoted(w.id, 0, 'max', true, 1));
    if (!ok && !okRevive) realWall++;
    console.log(`  ${w.id} ${w.name}：`
      + (ok ? '✓ 满配打得穿（要求养成到位，不是硬墙）· 余量 血×' + mHp.toFixed(2) + ' / 血攻×' + mAtk.toFixed(2)
        : (okRevive ? '· 满配 + 1 次复活 打得穿（按新基线不算墙）' : '✗ 满配也打不穿（连 1 次复活都不够）—— 真硬墙，要调')));
  });
  console.log(`  → ${realWall ? '有 ' + realWall + ' 个世界连"满配＋1 次复活"都过不去，这才需要动数值' : '没有一个世界连"满配＋1 次复活"都过不去：不用动数值'}`);
}

/* === 前期门槛（V9.5.91 父亲大人："前期的副本还是有点难了"）===
   上一轮量出来：压力全在守关 BOSS——前 11 关 Lv.3 就能过，第 12 关却要 W02 Lv.11 / W03 Lv.16 /
   W04 Lv.27 / W05 Lv.50，而且失败是**被打死**（不是打不动）。dungeon.js 因此给前六个世界
   加了一个平滑系数。这一段就是那把尺子：**前期几个世界，"几个人、几级"必须能推完**。
   门槛是父亲大人定的体感线，不是数学推导：单人也要能推完前三个世界，第四到第六个世界
   允许要求 3 个人。 */
{
  const nakedTeam = (lv, n) => {
    Core.newGame();
    Core.setPlayerName('前期');
    Core.choosePlayerBloodline('修真');
    const p = Core.S.player;
    p.level = lv;
    p.attrPoints = lv * 3;
    D.ATTR_META.forEach(a => Core.allocateAttr(a.id, Math.floor(p.attrPoints / (D.ATTR_META.length * 10)) * 10));
    const ids = ['C021', 'C022', 'C023'].slice(0, n - 1);
    ids.forEach(id => { try { Core.addChar(id); Core.S.chars[id].lv = Math.max(0, lv - 4); } catch (e) {} });
    Core.S.party = ['@player'].concat(ids);
    while (Core.S.party.length < 5) Core.S.party.push(null);
  };
  const clearsWhole = (wid, lv, n, upto) => {   // upto：只要求推到第 N 关（不传＝推完 12 关）
    let win = 0;
    for (let k = 0; k < 3; k++) {
      seed = 100 + k * 37;
      nakedTeam(lv, n);
      let ok = true;
      for (let stage = 1; stage <= (upto || 12) && ok; stage++) {
        const allies = SIM.buildAllies({}, {});
        if (!allies.length) { ok = false; break; }
        if (!Battle.run({ allies, enemies: Dun.makeEnemies(wid, 'normal', stage, Dun.finalKind(stage)), worldId: wid, maxRounds: 60 }).win) ok = false;
      }
      if (ok) win++;
    }
    return win >= 2;
  };
  /* V1.0.1（父亲大人重新定了敌人数：W01 一只、W02 三只、W03 起固定五只）——
     原来"单人也要推完前三个世界"这条体感线不再成立：W03 是**五打一**。
     改成：前两个世界单人可达，第三个世界起按 3 人算；上限值按实测重定。 */
  /* V1.0.1（父亲大人："第一个世界的前几关单人就行了，后面肯定要上阵的"）：
     门槛口径改成两段 ——
       · **W01 前 3 关：单人裸装**（一上来就要求单人推完 12 关不现实）
       · 其余：**3 人裸装推完整世界**
     格式：[世界, 人数, 等级上限, 只推到第 N 关（不填＝12）] */
  const GATES = [['W01', 1, 8, 3], ['W01·全通', 3, 35], ['W02', 3, 45], ['W03', 3, 55], ['W04', 3, 60], ['W05', 3, 80], ['W06', 3, 95]];
  console.log('\n=== 前期门槛（裸装，人数 × 等级必须推得动整个世界的 12 关）===');
  let bad = 0;
  GATES.forEach(([widRaw, n, cap, upto]) => {
    const wid = widRaw.replace('·全通', '');
    let need = null;
    for (let lv = 3; lv <= 100; lv++) { if (clearsWhole(wid, lv, n, upto)) { need = lv; break; } }
    const ok = need !== null && need <= cap;
    if (!ok) bad++;
    console.log(`  ${widRaw}：${n} 人裸装${upto ? '前 ' + upto + ' 关' : '全 12 关'}需要 Lv.${need === null ? '>100' : need}（门槛 ≤${cap}）${ok ? '✓' : ' ⚠ 前期偏难'}`);
  });
  console.log(bad ? `  → 有 ${bad} 个前期世界超过门槛，要再降` : '  → 前六个世界全部达标（前期不再卡人）');
}
