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
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};

let seed = 20260917;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const reseed = () => { seed = 20260917; };

for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, Battle = window.Battle, Dun = window.Dungeon, UI = window.UI;

const RARITY_ORDER = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
const BEST_CHARS = D.characters.slice().sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9)).map(c => c.id);

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
  const rarity = wi >= 10 ? 'UR' : wi >= 4 ? 'SSR' : 'SR';
  S.bag.eqCap = 400;                                   // 体检不测背包，别让自动分解把装备吃掉
  for (let i = 0; i < 120; i++) Core.grantEquip(wid, rarity, null);
  Core.autoEquipBest();
}

/* 这一世界普通难度能不能从头到尾打穿（12 关，每关都从满血开打，和游戏里一样）。
   ⚠ 一局一采样不可信：敌人编成是随机抽的，同一档位换个种子就能从"险过"翻成"惨败"。
     所以每档位打 3 次、**赢 2 次才算过**（多数票），把运气成分压掉。 */
function clearsWorld(wid, lv, tier) {
  if (tier === 'lower') teamLower(lv); else teamNormal(wid, lv);
  for (let stage = 1; stage <= 12; stage++) {
    const kind = Dun.finalKind(stage);
    const allies = UI._panels.buildAllies({}, {});
    if (!allies.length) return false;
    const res = Battle.run({
      allies, enemies: Dun.makeEnemies(wid, 'normal', stage, kind),
      worldId: wid, maxRounds: 60,
    });
    if (!res.win) return false;
  }
  return true;
}

const ATTEMPTS = 3;
function clearsWorldVoted(wid, lv, tier) {
  let win = 0;
  for (let i = 0; i < ATTEMPTS; i++) {
    seed = 20260917 + i * 7919;      // 每次换一个种子，别让同一套敌人编成决定结论
    if (clearsWorld(wid, lv, tier)) win++;
    if (win >= 2) return true;       // 已经过半，提前收工
  }
  return false;
}

const LVS = [];
for (let l = 5; l <= 100; l += 5) LVS.push(l);

function minLevel(wid, tier) {
  for (const lv of LVS) { reseed(); if (clearsWorldVoted(wid, lv, tier)) return lv; }
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
  Core.autoEquipBest();
}

console.log('=== 每个世界要多少级才打得穿普通 12 关（含守关 Boss）===');
console.log('  世界'.padEnd(22) + '  下限(裸装3人)   常规(满编5人+本档装备)');
const lower = [], normal = [];
D.WORLDS.forEach(w => {
  const a = minLevel(w.id, 'lower');
  const b = minLevel(w.id, 'normal');
  lower.push(a); normal.push(b);
  const label = `${w.id} ${w.name}`;
  console.log('  ' + label.padEnd(20)
    + (' Lv.' + (a === null ? '>100' : a)).padEnd(17)
    + ' Lv.' + (b === null ? '>100 ⚠' : b));
});

/* 只认"常规档"的结论——下限档不是任何玩家的状态，它的数字只作对照。 */
console.log('\n=== 相邻世界的落差（常规档）===');
let jump = 0;
for (let i = 1; i < D.WORLDS.length; i++) {
  if (normal[i] === null || normal[i - 1] === null) continue;
  const d = normal[i] - normal[i - 1];
  if (d >= 15) { console.log(`  ⚠ ${D.WORLDS[i - 1].id}→${D.WORLDS[i].id}：需要多练 ${d} 级（${normal[i - 1]} → ${normal[i]}），落差偏大`); jump++; }
}
if (!jump) console.log('  ✓ 相邻世界的等级门槛落差都在 15 级以内，没有断崖');

const walls = normal.filter(n => n === null).length;
console.log(`\n结论（只看常规档）：${walls
  ? '有 ' + walls + ' 个世界常规档满级打不穿，逐个用满配档复核下面的结论'
  : '20 个世界最迟 Lv.' + Math.max.apply(null, normal) + ' 都能打穿 ✓'}`);
const lowerKnown = lower.filter(x => x !== null);
console.log(`  下限档（裸装 3 人）仅供参考：${lowerKnown.length ? '最迟 Lv.' + Math.max.apply(null, lowerKnown) : '一个都打不穿'}，`
  + `${lower.filter(x => x === null).length} 个世界裸装打不穿 —— 这不是 bug，是"该穿装备该上人"的意思。`);

/* 常规档打不穿的世界：用满配账号复核 —— 满配能过就是"要求养成到位"，满配也过不去才是硬墙。 */
const stuck = D.WORLDS.filter((w, i) => normal[i] === null);
if (stuck.length) {
  console.log('\n=== 满配档复核（每条养成线都点到上限的账号）===');
  let realWall = 0;
  stuck.forEach(w => {
    let ok = false;
    for (let i = 0; i < ATTEMPTS && !ok; i++) {
      seed = 20260917 + i * 7919;
      teamMax();
      ok = true;
      for (let stage = 1; stage <= 12; stage++) {
        const kind = Dun.finalKind(stage);
        const allies = UI._panels.buildAllies({}, {});
        if (!allies.length || !Battle.run({ allies, enemies: Dun.makeEnemies(w.id, 'normal', stage, kind), worldId: w.id, maxRounds: 60 }).win) { ok = false; break; }
      }
    }
    if (!ok) realWall++;
    console.log(`  ${w.id} ${w.name}：${ok ? '✓ 满配打得穿（要求养成到位，不是硬墙）' : '✗ 满配也打不穿 —— 真硬墙，要调'}`);
  });
  console.log(`  → ${realWall ? '有 ' + realWall + ' 个世界连满配都过不去，这才需要动数值' : '没有一个世界连满配都过不去：不用动数值'}`);
}
