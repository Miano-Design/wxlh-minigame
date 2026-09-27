/* 本命专属 36 件的数值探针（私有 · 只读 · 不参与交付）：node scripts/_sig_scale.js
   派单 0927-G 的硬指标：W36 一件专属 ≈ 同档同部位普通 UR 的 1.30~1.45×，W01 ≥ 1.15×。
   这里**只用交付物本身**（D.SIGNATURE_EQUIPS ＋ D.makeSignatureEquip ＋ Core.equipScore），
   普通 UR 一侧用同一条 makeEquip 采样（4000 次/格）取平均。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const D = window.DATA, Core = window.Core;

let seed = 12345;
Math.random = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

Core.newGame();
const SLOTS = D.SIGNATURE_SLOT_ORDER;
const pct = (k) => (D.AFFIX_POOL[k] || {}).name || k;

console.log('=== ① 36 件表（1 血统 6 部位）===');
D.BLOODLINE_KEYS.forEach((bl) => {
  const rows = D.SIGNATURE_EQUIPS.filter((s) => (D.charById[s.charId] || {}).bloodline === bl);
  console.log('\n【' + bl + '】绑 ' + rows[0].charId + ' ' + (D.charById[rows[0].charId] || {}).name
    + '（' + (D.charById[rows[0].charId] || {}).role + '）');
  rows.forEach((s) => {
    console.log('  ' + s.slot.padEnd(10) + s.name.padEnd(12)
      + s.affixes.map((a) => pct(a.k) + '+' + (a.v * 100).toFixed(1) + '%').join(' · '));
  });
});

console.log('\n=== ② 评分倍率（Core.equipScore，普通 UR 每格采样 4000 次）===');
const avg = {};
SLOTS.forEach((slot) => {
  ['W01', 'W36'].forEach((w) => {
    let s = 0;
    for (let i = 0; i < 4000; i++) s += Core.equipScore(D.makeEquip(w, slot, 'UR', 'u' + i, {}));
    avg[w + '|' + slot] = s / 4000;
  });
});
console.log('部位'.padEnd(11) + '普通UR 01/36'.padEnd(18) + '专属 01→36'.padEnd(18) + '倍率 01 / 36');
const ratios = { W01: [], W36: [] };
SLOTS.forEach((slot) => {
  let lo = [9, 9];
  D.BLOODLINE_KEYS.forEach((bl) => {
    const idx = D.SIGNATURE_EQUIPS.findIndex((s) => s.slot === slot && (D.charById[s.charId] || {}).bloodline === bl);
    const s01 = Core.equipScore(D.makeSignatureEquip(idx, 'a' + bl + slot, 'W01'));
    const s36 = Core.equipScore(D.makeSignatureEquip(idx, 'b' + bl + slot, 'W36'));
    const r01 = s01 / avg['W01|' + slot], r36 = s36 / avg['W36|' + slot];
    ratios.W01.push(r01); ratios.W36.push(r36);
    lo = [Math.min(lo[0], r01), Math.min(lo[1], r36)];
  });
  console.log(slot.padEnd(11)
    + (Math.round(avg['W01|' + slot]) + ' / ' + Math.round(avg['W36|' + slot])).padEnd(18)
    + (Math.round(avg['W01|' + slot] * lo[0]) + ' → ' + Math.round(avg['W36|' + slot] * lo[1])).padEnd(18)
    + (lo[0].toFixed(3) + ' / ' + lo[1].toFixed(3)));
});
const f3 = (v) => v.toFixed(3);
console.log('\n36 件的最差~最好：W01 ' + f3(Math.min.apply(null, ratios.W01)) + '~' + f3(Math.max.apply(null, ratios.W01))
  + ' ｜ W36 ' + f3(Math.min.apply(null, ratios.W36)) + '~' + f3(Math.max.apply(null, ratios.W36)));
console.log('派单线：W36 ∈ 1.30~1.45 ＋ W01 ≥ 1.15 ｜ SIGNATURE_BASE_MULT = ' + D.SIGNATURE_BASE_MULT);
console.log('\n=== ③ 逐格（W36 倍率）===');
SLOTS.forEach((slot) => {
  console.log('  ' + slot.padEnd(10) + D.BLOODLINE_KEYS.map((bl) => {
    const idx = D.SIGNATURE_EQUIPS.findIndex((s) => s.slot === slot && (D.charById[s.charId] || {}).bloodline === bl);
    return bl + ' ' + (Core.equipScore(D.makeSignatureEquip(idx, 'c' + bl + slot, 'W36')) / avg['W36|' + slot]).toFixed(2);
  }).join(' ｜ '));
});
