/* 数值体检（策划用）：拿**真实战斗引擎**跑一遍，别拍脑袋调数值。
   用法：node scripts/balance_check.js [玩家等级]
   · 副本：新手队（主角 + 2 个伙伴）从 W01 第 1 关打到第 12 关，看卡在哪。
     **跑两遍**：① 一件装备都没有（开局真实状态）；② 穿满首通保底打出来的那套（N×3 + R×3）。
     这样一改装备/掉落的数值，就能一眼看出"前几关没装备会不会卡"。
   · 深井：同一支队从第 1 层往上推，看能推到几层。
   输出每关：结果 / 回合数 / 我方剩余血量百分比。
*/
const fs = require('fs');
const SIM = require('./_sim_allies');   // V1.1.11：组队入口从界面层搬出来（见同目录 _sim_allies.js）
const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
/* V9.5.87（十五度自审）：锁随机种子 —— 战斗里有暴击/闪避这类随机，不锁种子的话
   同一支队跑五次能给出"首败在第 10 层"到"第 18 层"五种答案，这种体检报告没法用来做回归。 */
let seed = 20260917;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) {
  eval(fs.readFileSync(f, 'utf8'));
}
const Core = window.Core, D = window.DATA, UI = window.UI, Battle = window.Battle, Dungeon = window.Dungeon;

const LV = Number(process.argv[2] || 11);
function newTeam() {
  Core.newGame();
  Core.setPlayerName('体检');
  Core.choosePlayerBloodline('修真');
  Core.S.player.level = LV;
  // 主角六维按"平均分配"点掉（不攒着），伙伴取两个最早能拿到的
  const p = Core.S.player;
  p.attrPoints = LV * 4;
  D.ATTR_META.forEach((a) => Core.allocateAttr(a.id, Math.floor(p.attrPoints / (D.ATTR_META.length * 10)) * 10));
  ['C021', 'C022'].forEach((id) => { try { Core.addChar(id); Core.S.chars[id].lv = Math.max(1, LV - 4); } catch (e) {} });
  Core.S.party = ['@player', 'C021', 'C022', null, null];
}
function fight(enemies, worldId) {
  const allies = SIM.buildAllies({}, {});
  const res = Battle.run({ allies, enemies, worldId, maxRounds: 60 });
  return { win: res.win, rounds: res.rounds || 0 };
}

/* V9.6.7（父亲大人）：开局不再白送一套 R 装备，改成前面几关首通保底掉。
   所以体检要跑**两遍**：裸装的那一遍决定"第 1 关会不会一上来就打不过"。 */
function runWorld(label, gear) {
  console.log(`\n=== 副本（W01 普通，等级 ${LV} 的新手队 主角+2伙伴，${label}） ===`);
  newTeam();
  if (gear) {
    [['weapon', 'N'], ['head', 'N'], ['armor', 'N'], ['hands', 'R'], ['legs', 'R'], ['accessory', 'R']]
      .forEach(([slot, rarity]) => Core.grantEquip('W01', rarity, slot));
  }
  for (let stage = 1; stage <= 12; stage++) {
    const kind = stage === 12 ? 'boss' : (stage % 4 === 0 ? 'elite' : 'combat');
    const r = fight(Dungeon.makeEnemies('W01', 'normal', stage, kind), 'W01');
    console.log(`  第 ${String(stage).padStart(2)} 关（${kind}）：${r.win ? '胜' : '败'} · ${r.rounds} 回合`);
  }
}
runWorld('一件装备都没有', false);
runWorld('穿满首通保底那套（N×3 + R×3）', true);

console.log(`\n=== 深井（同一支队往上推） ===`);
newTeam();
let floor = 1;
for (; floor <= 120; floor++) {
  const st = fight([D.corridorEnemy(floor)], null);
  const tag = floor % 50 === 0 ? 'BOSS' : floor % 10 === 0 ? '精英' : '普通';
  if (floor <= 12 || floor % 10 === 0 || !st.win) {
    console.log(`  第 ${String(floor).padStart(3)} 层（${tag}）：${st.win ? '胜' : '败'} · ${st.rounds} 回合`);
  }
  if (!st.win) break;
}
console.log(`  → 这支队能推到第 ${floor} 层（首败处）`);
