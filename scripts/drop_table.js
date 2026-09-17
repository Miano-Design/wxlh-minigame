/* 装备掉落表体检：node scripts/drop_table.js

   起因（2026-09-18 父亲大人）："装备的掉落概率你有写好吗？…不要你在第一个世界就有掉落神装的概率，
   那太不合理了，神装那是后期也算稀有的物品。"

   这把尺子回答三件事，全部**从真在用的那张表算**（D.dropChancesOf，不是另抄一份）：
     · 每个世界、每种来源（杂兵 / 精英 / 守关）、每种难度，到底掉什么档、各多少概率
     · 一段一段看：品质有没有随世界变好（不能后面的图反而更差）
     · 神话到底什么时候才可能出现、从谁身上（它不在掉落表里，只能看 dungeon 的 mythChance）

   只读。改完掉落表跑一下。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const D = window.DATA, Dun = window.Dungeon;

const ORDER = D.EQUIP_RARITIES;                       // N R SR SSR UR MYTH
const NAME = { N: '普通', R: '精良', SR: '稀有', SSR: '史诗', UR: '传说', MYTH: '神话' };
const kindCn = { normal: '杂兵', elite: '精英', boss: '守关' };
const diffCn = { normal: '普通', hard: '困难', hell: '地狱' };
const pct = (p) => (p * 100).toFixed(p >= 0.1 ? 0 : 1).padStart(4) + '%';

function line(worldIdx, kind, diff) {
  const t = D.dropChancesOf(worldIdx, kind, diff).table;
  return ORDER.filter(r => t[r]).map(r => NAME[r] + ' ' + pct(t[r])).join('  ');
}

console.log('=== ① 每一个世界的掉落（普通难度 · 杂兵 / 精英 / 守关）===');
console.log('  世界   杂兵                                    精英                                    守关（必掉，有保底）');
D.WORLDS.forEach((w, i) => {
  const n = i + 1;
  console.log('  ' + String(n).padStart(2) + ' ' + w.name.padEnd(6)
    + ' ' + line(n, 'normal', 'normal').padEnd(38)
    + ' ' + line(n, 'elite', 'normal').padEnd(38)
    + ' ' + line(n, 'boss', 'normal'));
});

console.log('\n=== ② 世界段的规则（一段一条，改这里就是改掉落） ===');
D.DROP_BLOCKS.forEach(b => {
  const from = (D.DROP_BLOCKS[D.DROP_BLOCKS.indexOf(b) - 1] || { upTo: 0 }).upTo + 1;
  console.log('  W' + String(from).padStart(2, '0') + '~W' + String(b.upTo).padStart(2, '0')
    + '  本段上限 ' + NAME[b.cap] + '（' + b.cap + '）· 守关至少 ' + NAME[b.bossMin]
    + '  ·  杂兵：' + Object.entries(b.w).map(([r, p]) => NAME[r] + ' ' + pct(p)).join(' + '));
});

console.log('\n=== ③ 难度只影响"抬档"，不影响上限（早期世界打地狱也出不了高档） ===');
[1, 5, 10, 20, 25, 36].forEach(n => {
  console.log('  W' + String(n).padStart(2) + ' 守关：'
    + ['normal', 'hard', 'hell'].map(d => diffCn[d] + ' → ' + line(n, 'boss', d)).join('   |   '));
});

console.log('\n=== ④ 神话（血统神装）—— 它不在掉落表里 ===');
{
  let firstWorld = null;
  for (let n = 1; n <= D.WORLDS.length; n++) {
    const r = Dun.battleRewards(D.WORLDS[n - 1].id, 'normal', 12, 'boss');
    if (r.mythChance) { firstWorld = n; break; }
  }
  if (!firstWorld) console.log('  （没有任何世界会掉神话 —— 这条线断了）');
  else {
    console.log('  第 ' + firstWorld + ' 张图（' + D.WORLDS[firstWorld - 1].name + '）起，且**只有守关 Boss**：');
    ['normal', 'hard', 'hell'].forEach(d => {
      const r = Dun.battleRewards(D.WORLDS[firstWorld - 1].id, d, 12, 'boss');
      console.log('    ' + diffCn[d] + '：' + pct(r.mythChance) + '   （掉落概率本身也是 100% 必掉一件，这一件有该概率变成神话）');
    });
    const early = [];
    for (let n = 1; n < firstWorld; n++) {
      const kinds = ['normal', 'elite', 'boss'];
      kinds.forEach(k => { if (Dun.battleRewards(D.WORLDS[n - 1].id, 'hell', 12, k).mythChance) early.push(D.WORLDS[n - 1].id); });
    }
    console.log('  第 1~' + (firstWorld - 1) + ' 张图：神话概率 ' + (early.length ? '✗ 有 ' + early.join(',') : '✓ 一处都没有'));
  }
}

console.log('\n=== ⑤ 期望档位（0=普通 … 4=传说，越高越好）===');
{
  const expectIdx = (w, kind, diff) => {
    const t = D.dropChancesOf(w, kind, diff).table;
    return Object.entries(t).reduce((s, [r, p]) => s + ORDER.indexOf(r) * p, 0);
  };
  console.log('  世界  杂兵  精英  守关   守关(地狱)');
  [1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18, 20, 21, 25, 26, 30, 31, 36].forEach(n => {
    console.log('  W' + String(n).padStart(2) + '  '
      + expectIdx(n, 'normal', 'normal').toFixed(2) + '  '
      + expectIdx(n, 'elite', 'normal').toFixed(2) + '  '
      + expectIdx(n, 'boss', 'normal').toFixed(2) + '   '
      + expectIdx(n, 'boss', 'hell').toFixed(2));
  });
  let mono = true, prev = -1;
  for (let n = 1; n <= D.WORLDS.length; n++) {
    const e = expectIdx(n, 'normal', 'normal');
    if (e < prev - 1e-9) mono = false;
    prev = Math.max(prev, e);
  }
  let order2 = true;
  for (let n = 1; n <= D.WORLDS.length; n++) {
    if (!(expectIdx(n, 'normal', 'normal') <= expectIdx(n, 'elite', 'normal') + 1e-9
      && expectIdx(n, 'elite', 'normal') <= expectIdx(n, 'boss', 'normal') + 1e-9)) order2 = false;
  }
  console.log('\n  结论：' + (mono ? '✓ 越往后的世界掉得越好' : '✗ 有世界掉得比前一张差')
    + ' · ' + (order2 ? '✓ 杂兵 ≤ 精英 ≤ 守关' : '✗ 来源之间的档次乱了'));
}
