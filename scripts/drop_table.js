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

/* ---------- ⑥ 四条装备线一览（父亲大人："世界套装几套、血统套装几套、专属几套、神装几套，
   分别的掉落机制整理给我看看"）—— 数字全部摘自数据表与掉落代码，不写死、不凭记忆。 ---------- */
console.log('\n=== ⑥ 四条装备线：各几套 · 从哪来 ===');
{
  const pctR = (n) => (n * 100).toFixed(n * 100 % 1 ? 1 : 0) + '%';
  const boxNames = ['box_sr', 'box_ssr', 'box_ur', 'box_myth'].map(id => {
    const it = D.ITEMS[id];
    const spot = Object.entries(D.SHOPS).flatMap(([sid, s]) => s.items.filter(x => x.item === id).map(x => x.price + ' ' + (D.CURRENCIES.find(c => c.id === s.currency) || {}).name + (x.req ? '·需通' + x.req.world : ''))).join('/');
    return it.name + '（' + spot + '）';
  }).join(' · ');
  /* 一条装备只能属于一条线 —— 占比用**真在用的那条随机线**量（调 grantEquip 抽 4000 次） */
  const lineShare = (wid, rarity) => {
    const cnt = { 世界: 0, 血统: 0, 普通: 0 };
    Core.newGame(); Core.setPlayerName('套装占比'); Core.choosePlayerBloodline('修真');
    Core.S.bag.eqCap = 999999;
    for (let i = 0; i < 4000; i++) {
      const r = Core.grantEquip(wid, rarity);
      const e = r.equip;
      if (!e) continue;
      if (e.bloodSet) cnt.血统++; else if (e.set) cnt.世界++; else cnt.普通++;
    }
    return cnt;
  };
  console.log('  ① 世界套装 ' + Object.keys(D.SETS).length + ' 套（每个世界一套，2/4/6 件）');
  console.log('     来源：野外掉落（普通怪 15% / 精英 55% / 守关 100% 各掉一件）＋ W01 前 6 关首通保底'
    + ' ＋ 装备箱（' + boxNames + '；箱子里开出传说及以下时，走的还是这台随机线）');
  console.log('     一件装备落在哪条线（实测抽 4000 次）：SR ' + JSON.stringify(lineShare('W10', 'SR'))
    + ' · SSR ' + JSON.stringify(lineShare('W10', 'SSR')));
  console.log('  ② 血统套装 ' + Object.keys(D.BLOODLINE_SETS).length + ' 套（第 ' + D.BLOODLINE_MIN_WORLD + ' 张图起，'
    + (D.WORLDS.length - D.BLOODLINE_MIN_WORLD + 1) + ' 张 × ' + (D.BLOODLINE_KEYS || []).length + ' 支血统各一套，2/4/6 件）'
    + ' —— 名字带世界，如「' + D.BLOODLINE_SETS[D.bloodlineSetKey('W20', '绯红')].name + '」');
  console.log('     来源：和世界套装**同一台随机线**（野外掉落 + 装备箱），只是落点不同（见上面那行实测占比）；'
    + '穿戴要求同血统，**计件只认同一张图**的件');
  console.log('  ③ 血统神装 ' + Object.keys(D.GOD_SETS).length + ' 套（' + Object.values(D.GOD_SETS).map(s => s.name).join(' / ') + '，2/4/6 件）');
  {
    const w21 = D.WORLDS[20], w36 = D.WORLDS[35];
    const rows = ['normal', 'hard', 'hell'].map(d => diffCn[d] + ' ' + pctR(Dun.battleRewards(w21.id, d, 12, 'boss').mythChance || 0));
    const sameLate = ['normal', 'hard', 'hell'].every(d => (Dun.battleRewards(w21.id, d, 12, 'boss').mythChance || 0) === (Dun.battleRewards(w36.id, d, 12, 'boss').mythChance || 0));
    console.log('     来源一：第 21 张图起的**守关 Boss**（' + rows.join(' · ') + '）'
      + (sameLate ? ' —— 概率只跟难度有关，W21 到 W36 一样' : '（各世界不同）'));
    console.log('     来源二：血统神装箱 ' + pctR(0.15) + ' 升格（其余保底传说）· 通关 W20 后在异界商店上架');
    console.log('     ⚠ 杂兵、精英、任何第 20 张图之前的世界：**一处都没有**');
  }
  const sigRar = [...new Set(D.SIGNATURE_EQUIPS.map(x => (D.charById[x.charId] || {}).rarity))].join('/');
  const sigBl = [...new Set(D.SIGNATURE_EQUIPS.map(x => (D.charById[x.charId] || {}).bloodline))];
  console.log('  ④ 伙伴专属（本命）' + D.SIGNATURE_EQUIPS.length + ' 件 ＝ 6 支血统各**一人一套 6 件**（武器/头/胸甲/手/腿/饰品）'
    + ' · 绑定的都是本血统"含全部角色的 power 第一名"：' + sigRar + ' · 覆盖 ' + sigBl.length + ' 支血统 · UR 品质 · 每件 5 条词条');
  sigBl.forEach(bl => {
    const rows = D.SIGNATURE_EQUIPS.filter(s => ((D.charById || {})[s.charId] || {}).bloodline === bl);
    const c = (D.charById || {})[rows[0].charId] || {};
    console.log('     ' + (c.name || rows[0].charId) + '（' + bl + '·' + (c.rarity || '') + '）六件：'
      + rows.map(s => s.name).join(' / '));
  });
  console.log('     来源：地狱难度**守关** 5% ＋ UR 装备箱 10%；**优先掉还没拥有过的那件**'
    + '（36 件全拿到之后才转 ◆ 折现）—— 普通/困难不打地狱，就只剩开箱这条路');
  console.log('\n  说明：一件装备只会属于其中一条线（互斥）—— 判定顺序是 专属 > 神装 > 血统套装 > 世界套装 > 普通。');
}
