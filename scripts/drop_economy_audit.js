/* 掉落 / 材料经济审计（R1.4 数值轮 · 任务书 §二十四 / §三十五 ~ §三十七 / §五十）：
     node scripts/drop_economy_audit.js
   ==============================================================================
   真读掉落表、真调 `Dungeon.grantRewards()` 抽样结算（不是抄一份掉率公式），回答四件事：
     · 掉落段结构对不对（世界越高、封顶越高、守关保底越高）；
     · 神装产出量级对不对（§三十：不能三四天毕业）；
     · 药园 vs 副本的材料占比对不对（§三十五：药园承担 20~35%）；
     · 商店价格 / 材料包里的 id 有没有悬空。
   只读：不改任何数值。 */
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('drop_economy_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { D, Core } = E;
const Dun = E.G.Dungeon;
let seed = 20261002;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ORD = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, MYTH: 5 };
/* `Core.sweepCap()` 要读存档（无档会抛）—— 先开一局，后面几节共用 */
Core.newGame(); Core.setPlayerName('掉落审计'); Core.choosePlayerBloodline('修真');
const sweepCap = () => { try { return Core.sweepCap(); } catch (e) { return D.SWEEP_DAILY_CAP; } };

/* ---------- ① 掉落段结构 ---------- */
{
  const B = D.DROP_BLOCKS || [];
  const bad = [];
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    const sum = Object.keys(b.w || {}).reduce((s, k) => s + b.w[k], 0);
    if (Math.abs(sum - 1) > 0.001) bad.push('第' + (i + 1) + '段权重和=' + sum.toFixed(3));
    if (i && !(b.upTo > B[i - 1].upTo)) bad.push('第' + (i + 1) + '段 upTo 没递增');
    if (i && (ORD[b.cap] || 0) < (ORD[B[i - 1].cap] || 0)) bad.push('第' + (i + 1) + '段 封顶下降 ' + B[i - 1].cap + '→' + b.cap);
    if (i && (ORD[b.bossMin] || 0) < (ORD[B[i - 1].bossMin] || 0)) bad.push('第' + (i + 1) + '段 守关保底下降 ' + B[i - 1].bossMin + '→' + b.bossMin);
  }
  (bad.length ? R.fail : R.pass)('掉落段：权重和为 1、世界越高封顶/守关保底只升不降', {
    file: 'js/data.js', expected: '单调不退档', actual: bad.length ? bad.join(' ; ') : B.length + ' 段全对（最高封顶 ' + B[B.length - 1].cap + '）',
  });
}

/* ---------- ② 神装产出来自**真实奖励函数** ---------- */
{
  const out = [];
  const cap = sweepCap();
  [['W21', 'normal'], ['W21', 'hell'], ['W30', 'normal'], ['W36', 'hell']].forEach(([wid, diff]) => {
    const r = Dun.battleRewards(wid, diff, 12, 'boss');
    out.push(wid + '/' + diff + ' 神话率 ' + ((r.mythChance || 0) * 100).toFixed(1) + '% → 扫荡' + cap + '次 ≈ ' + ((r.mythChance || 0) * cap).toFixed(2) + ' 件/天');
  });
  const n36 = (Dun.battleRewards('W36', 'normal', 12, 'boss').mythChance || 0) * cap;
  R.note('神装日产出（守关扫荡 ' + cap + ' 次）：' + out.join(' · '));
  (n36 <= 3 ? R.pass : R.warn)('普通难度神装日产出在"稀有"量级（≤3 件/天）', {
    file: 'js/dungeon.js', expected: '≤3 件/天（§三十：不能三四天一套）', actual: n36.toFixed(2) + ' 件/天',
  });
}

/* ---------- ③ 药园 vs 副本：材料占比（§三十五 目标 20~35%） ---------- */
{
  /* 副本侧：在 W30 连打 200 次守关，数真掉出来的材料（走 grantRewards 真结算） */
  Core.newGame(); Core.setPlayerName('掉落审计'); Core.choosePlayerBloodline('修真');
  const S = Core.S;
  S.bag.matCap = 999999; S.bag.itemCap = 999999; S.bag.eqCap = 999999;
  S.worlds.W30 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  const before = {};
  const N = 200;
  for (let i = 0; i < N; i++) Dun.grantRewards('W30', 'normal', 12, 'boss');
  const mats = ['mat_t1', 'mat_t2', 'mat_t2b', 'mat_t3', 'mat_t3b', 'mat_t4', 'mat_t4b', 'mat_t5'];
  let dungeonTotal = 0;
  mats.forEach((id) => { dungeonTotal += (S.items[id] || 0); });
  const perSweep = dungeonTotal / N;
  const dungeonDay = perSweep * sweepCap();
  /* 药园侧：8 块地 × **每天 2 轮**（＝玩家一天上线两次的保守口径，不是 24 小时不间断收） */
  let gardenDay = 0;
  const plots = D.GARDEN_PLOTS || 4;
  const ROUNDS = 2;
  for (let i = 0; i < plots; i++) {
    const g = D.GARDEN[i % D.GARDEN.length];
    gardenDay += (g.out ? g.out.n : 0) * ROUNDS;
  }
  const ratio = gardenDay / Math.max(1, gardenDay + dungeonDay);
  R.note('材料日产（W30）：副本 ' + dungeonDay.toFixed(1) + ' / 天 · 药园（' + plots + ' 块地 × 每天 ' + ROUNDS + ' 轮）' + gardenDay.toFixed(1) + ' / 天'
    + ' → 药园占比 ' + (ratio * 100).toFixed(0) + '%');
  (ratio >= 0.20 && ratio <= 0.35 ? R.pass : R.warn)('药园承担 20~35% 的长期材料需求（§三十五）', {
     file: 'js/data.js', expected: '20%~35%', actual: (ratio * 100).toFixed(0) + '%',
    reason: '⚠️ 与"材料是铭刻/强化的瓶颈"是**同一件事的两面**：直接砍药园会把材料线做成硬墙 —— 要动就得先抬副本掉落，属下一轮',
  });
}

/* ---------- ④ 材料包 / 商店里的 id 不能悬空 ---------- */
{
  const bad = [];
  Object.keys(D.MAT_PACKS || {}).forEach((k) => {
    ((D.MAT_PACKS[k] || {}).pool || []).forEach(([id]) => { if (!D.ITEMS[id]) bad.push('MAT_PACKS.' + k + '→' + id); });
  });
  let shopN = 0;
  const shopList = Array.isArray(D.SHOPS) ? D.SHOPS : Object.keys(D.SHOPS || {}).map((k) => Object.assign({ id: k }, D.SHOPS[k]));
  shopList.forEach((sh) => (sh.items || []).forEach((it) => {
    shopN++;
    const id = it.id || it.item || it.itemId;
    if (id && !D.ITEMS[id]) bad.push('SHOPS.' + (sh.id || '?') + '→' + id);
    const p = it.price || it.cost;
    [].concat(p || []).forEach((v) => { const n = typeof v === 'object' ? v.n : v; if (n !== undefined && (!isFinite(n) || n < 0)) bad.push('SHOPS.' + (sh.id || '?') + ' 价格非法'); });
  }));
  (bad.length ? R.fail : R.pass)('材料包 / 商店引用的道具 id 都存在、价格合法（' + shopN + ' 个商品）', {
    file: 'js/data.js', expected: '无悬空 id', actual: bad.length ? bad.slice(0, 6).join(' ; ') : '干净',
  });
}

/* ---------- ⑤ 强化材料不断档：每个世界都能掉到"该档 + 低档" ---------- */
{
  const miss = [];
  for (let i = 1; i <= 36; i++) {
    const w = D.matTierWeights ? D.matTierWeights(i) : null;
    if (!w) { miss.push('W' + i + '(没有材料权重表)'); continue; }
    const n = Object.keys(w).filter((k) => w[k] > 0).length;
    if (!n) miss.push('W' + i + '(空表)');
  }
  (miss.length ? R.fail : R.pass)('36 个世界都有强化材料权重（不会出现"这张图不掉料"）', {
    file: 'js/data.js', expected: '36 个世界都有', actual: miss.length ? miss.slice(0, 6).join(' , ') : '36 个世界全有',
  });
}

R.note('口径：真读 DROP_BLOCKS / MAT_PACKS / SHOPS / matTierWeights，真调 Dungeon.battleRewards + grantRewards。');
R.finish();
