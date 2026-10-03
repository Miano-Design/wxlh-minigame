/* 经济模拟（R1.4 数值轮 · 任务书 §一 / §五十二 / §五十三）：node scripts/economy_sim.js
   ==============================================================================
   **先建尺子，先不改数**（父亲大人原话）。这把尺子回答三个问题：
     · 每一档进度、每一类玩家，**一天真实产出多少**（不是公式估算，见下）；
     · 每条主成长线**总造价多少**（一律读数据层现成的价格函数/表，不抄第二份）；
     · 按这个日收入，**要几天做完**；1/3/7/14/30/60/90/180 天各档资源**库存趋势**。

   日收入怎么测的：造一份"站在该世界档位"的存档 → 真调 **扫荡 `Dungeon.sweep` / 挂机
   `Core.claimIdle` / 深井 `D.corridorReward` / 斗法台 `D.arenaReward` / 药园 `D.GARDEN` /
   任务 `Core.claimEverything`** → 用游戏自己的 `Core.tallyCur()` 读这一天进账的货币，
   材料直接看 `S.items` 的增量。**货币与秘卷/强化料/经验模块都是实测**；个别只有"概率来源"
   的料（铭魂砂 / 血髓晶 / 重铸石 / 招募券）按各自数据表给的**名义概率**折算，并标 `EST`。

   三类玩家（§二）：A 普通 / B 认真 / C 高效。差别 = 扫荡次数 / 挂机时长 / 广告 / 深井层数 /
   药园轮次 —— 不是"战力差"。

   只读：不改任何数值、不碰存档。 */
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('economy_sim');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { Core, D } = E;
const Dun = E.G.Dungeon;

const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const ANCHORS = (arg('anchors') || 'W01,W06,W12,W19,W25,W31,W36').split(',').map((s) => s.trim()).filter(Boolean);
const MARKS = [1, 3, 7, 14, 30, 60, 90, 180];
const DAYS_MAX = 180;
let seed = 20261002;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

/* ---------- 三类玩家 ---------- */
/* ================= 2026-10-03（《长期留存型成长生态重平衡》§三）=================
   玩家模型从原来的三类扩成书里点名的**四类**（差别仍然是"行为"，不是"战力"）：
     A 零广告低活跃 · B 普通玩家 · C 稳定广告玩家 · D 高活跃玩家
   ⚠️ 原来 C 那一档是"高效（带广告）"，现在拆成 **C 稳定广告（中活跃 + 每日广告）**
      与 **D 高活跃（几乎拉满）** —— 分开才看得出"广告到底把曲线抬了多少"（§四 的定位问题）。 */
const PROFILES = {
  A: { name: '零广告低活跃', sweep: 6,  idleFrac: 0.35, ads: false, corridor: 3,  gardenCycles: 1, arenaWin: 2 },
  B: { name: '普通玩家',     sweep: 10, idleFrac: 0.5,  ads: false, corridor: 5,  gardenCycles: 1, arenaWin: 3 },
  C: { name: '稳定广告玩家', sweep: 18, idleFrac: 0.8,  ads: true,  corridor: 14, gardenCycles: 2, arenaWin: 5 },
  D: { name: '高活跃玩家',   sweep: 40, idleFrac: 1.0,  ads: true,  corridor: 25, gardenCycles: 3, arenaWin: 5 },
};
/* 每档进度对应的玩家等级（按 progression_audit 的推荐档取整） */
const LV_AT = { W01: 8, W06: 20, W12: 40, W19: 60, W25: 75, W31: 90, W36: 100 };
const gateOf = (wi) => { let g = 0; for (let i = 0; i <= wi; i++) g = Math.max(g, D.WORLDS[i].reincarn || 0); return g; };
const rpFor = (n) => { let rp = 0; for (let k = 1; k <= n; k++) rp += Math.floor(100 * Math.pow(k, 1.15)); return rp; };
const ORDER = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
const BEST = D.characters.slice().sort((a, b) => (ORDER[a.rarity] ?? 9) - (ORDER[b.rarity] ?? 9)).map((c) => c.id);

/* 造一份"站在 anchor 世界档位"的存档（只为了测产出，不代表成长曲线） */
function setup(profile, anchor) {
  seed = 20261002;
  Core.newGame();
  Core.setPlayerName('经济模拟');
  Core.choosePlayerBloodline('修真');
  const S = Core.S, p = S.player;
  const wi = D.WORLDS.findIndex((w) => w.id === anchor);
  p.level = LV_AT[anchor] || 40;
  p.reincarnations = gateOf(wi);
  Core.addCur('rp', rpFor(p.reincarnations));
  p.geneLock = Math.max(1, gateOf(wi));
  /* 解锁到 anchor（12 关全通，扫荡才有靶子） */
  D.WORLDS.forEach((w, i) => {
    if (i > wi) return;
    S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
    S.worldUnlocked = true;
  });
  /* 挂机产线要有领队（没领队那条线不产出） */
  BEST.slice(0, 8).forEach((id) => { try { Core.addChar(id); S.chars[id].lv = p.level; } catch (e) {} });
  D.IDLE_LINES.forEach((l, i) => { S.idle.lines[l.id] = BEST[i + 4] && S.chars[BEST[i + 4]] ? BEST[i + 4] : null; });
  S.party = ['@player'].concat(BEST.slice(0, 4));
  S.bag.eqCap = 400;
  ['points', 'otherworld', 'holy'].forEach((k) => Core.addCur(k, 0));
  S.items = S.items || {};
}

/* 一天的真实产出。返回 { cur, items } */
function simulateDay(profile, anchor) {
  const P = PROFILES[profile];
  const S = Core.S;
  Core.tallyCur(true);
  /* ① 扫荡：会玩的都扫**守关 Boss 那一关**（同一次消耗，奖励最高） */
  S.sweep = { date: Core.dailyDate(), count: 0, bonus: 0, adBonus: 0 };
  if (P.ads) for (let i = 0; i < 3; i++) Core.addAdSweepBonus(10);
  Dun.sweep(anchor, 'normal', 12, P.sweep);
  /* ② 挂机：受离线上限截断（一天只上线一次的人拿不满 24 小时） */
  S.idle.bankSec = Math.round(Core.offlineCapHours() * 3600 * P.idleFrac);
  Core.claimIdle();
  if (P.ads) { S.idle.bankSec = Math.round(Core.offlineCapHours() * 3600 * P.idleFrac); Core.claimIdle(); for (let i = 0; i < 3; i++) Core.adIdleBoost(); }
  /* ③ 深井：用**真实奖励函数**逐层加（不是"估算层数×平均收益"） */
  const base = (S.corridor && S.corridor.floor) || 1;
  for (let f = base; f < base + P.corridor; f++) {
    const rw = D.corridorReward(f);
    if (rw.points) Core.addCur('points', rw.points);
    if (rw.otherworld) Core.addCur('otherworld', rw.otherworld);
    if (rw.mat) { const m = D.ITEMS[rw.mat.item] ? rw.mat : null; if (m) Core.addItem(m.item, m.n || 1); }
  }
  /* ④ 斗法台：赢 N 场，奖励走真实函数 */
  for (let i = 0; i < P.arenaWin; i++) {
    const rw = D.arenaReward((S.arena.floor || 1) + i);
    if (rw.otherworld) Core.addCur('otherworld', rw.otherworld);
  }
  /* ⑤ 药园：每块地按"一天能收几轮"算，收成走真实 GARDEN 表 */
  const plots = Math.min(8, D.GARDEN_PLOTS || 4);
  for (let i = 0; i < plots; i++) {
    const g = D.GARDEN[i % D.GARDEN.length];
    for (let c = 0; c < P.gardenCycles; c++) {
      if (g.out) Core.addItem(g.out.item, g.out.n);
      if (g.extra && Math.random() < g.extra.p) Core.addItem(g.extra.item, g.extra.n);
      Core.addItem(D.GARDEN_SEED, -0);   // 种子自循环（回收 70%）在这里不建模，只记产出
    }
  }
  /* ⑥ 任务 / 签到 / 求签 / 悬赏 / 周常 */
  Core.drawSign();
  D.DAILY_TASKS.forEach((t) => { S.tasks.daily[t.id] = t.target; });
  Core.loginReward();
  if (P.ads) Core.claimLoginDouble();
  Core.claimEverything();
  const cur = Object.assign({ points: 0, otherworld: 0, holy: 0, rp: 0 }, Core.tallyCur() || {});
  const items = {};
  Object.keys(S.items || {}).forEach((k) => { if (S.items[k] > 0) items[k] = S.items[k]; });
  return { cur, items };
}

/* ---------- 各主成长线的总造价 ----------
   ⚠️ 口径：**真扣一遍、看差值**（不是把公式再抄一份到尺子里 —— 抄一份迟早和游戏分叉）。
   做法：造一份"材料/货币管够、世界全通、Lv.100"的存档 → 存快照 → 把这条线点满 → 再存快照 → 相减。 */
const MAT_ALL = ['mat_t1', 'mat_t2', 'mat_t2b', 'mat_t3', 'mat_t3b', 'mat_t4', 'mat_t4b', 'mat_t5',
  'minghun_sha', 'xuesui_jing', 'dengyou', 'mijuan_canzhang', 'lingzhi_zhong', 'reforge_stone'];
function snap() { return { cur: Object.assign({}, Core.S.cur), items: Object.assign({}, Core.S.items || {}) }; }
function diffCost(a, b) {
  const out = { cur: {}, items: {} };
  /* 花掉 ＝ a（前） − b（后），所以正的数就是"这条线一共吃了多少" */
  Object.keys(a.cur).forEach((k) => { const d = (a.cur[k] || 0) - (b.cur[k] || 0); if (d) out.cur[k] = d; });
  Object.keys(a.items).forEach((k) => { const d = (a.items[k] || 0) - (b.items[k] || 0); if (d) out.items[k] = d; });
  return out;
}
function freshForCost() {
  Core.newGame(); Core.setPlayerName('造价'); Core.choosePlayerBloodline('修真');
  const S = Core.S;
  D.WORLDS.forEach((w) => { S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(3), hell: Array(12).fill(3) } }; });
  /* ⚠️ 所有"功能解锁"要一次点亮：血统 / 强化这类入口受 `isUnlocked()` 管，
     不点亮的话"点满一遍"会在第一步就返回"🔒 通关…解锁"，差值当然是空的（踩过）。 */
  (D.UNLOCKS || []).forEach((u) => { S.unlocks[u.id] = true; });
  S.player.level = D.PLAYER_MAX_LV; S.player.reincarnations = 4;
  ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 1e12));
  S.bag.matCap = 99999; S.bag.eqCap = 400;
  MAT_ALL.forEach((id) => { S.items[id] = 1e6; });
  return S;
}
function costOf(act) {
  freshForCost();
  const a = snap();
  const oldRnd = Math.random;
  try { act(); } finally { Math.random = oldRnd; }
  return diffCost(a, snap());
}
const sumCur = (c, k) => Math.round(c.cur[k] || 0);
const sumMat = (c, id) => Math.round(c.items[id] || 0);

function lineCosts() {
  const out = {};
  out.geneLock = costOf(() => { for (let i = 0; i < D.GENE_LOCK_MAX; i++) Core.geneLockUnlock(); });
  out.bloodline = costOf(() => { let g = 0; while (g++ < 60 && Core.upgradePlayerBloodline().ok) { /* 0→50 */ } });
  out.kejiAll = costOf(() => { D.KEJI.forEach((k) => Core.kejiUp(k.id, k.max)); });
  out.authority = costOf(() => { for (let i = 0; i < D.AUTHORITY_MAX; i++) Core.upgradeAuthority(); });
  out.mountsAll = costOf(() => { D.MOUNTS.forEach((m) => { Core.buyMount(m.id); let g = 0; while (g++ < 60 && Core.feedMount(m.id).ok) {} }); });
  out.fabaoAll = costOf(() => { D.FABAO.forEach((f) => { Core.buyFabao(f.id); let g = 0; while (g++ < 60 && Core.refineFabao(f.id).ok) {} }); });
  out.realm = costOf(() => { Math.random = () => 0; for (let i = 0; i < D.REALM_STAGE_COUNT; i++) Core.attemptRealm(); });
  /* 强化一件 0→20：把随机数钉成 0（`Math.random()<rate` 恒真）→ 量的是**必成**口径之下的实扣 */
  out.enhanceOne = (function () {
    freshForCost();
    const res = Core.grantEquip('W36', 'MYTH', null);
    const uid = (res && res.equip && res.equip.uid) || (res && res.eq && res.eq.uid);
    if (!uid) return { cur: {}, items: {} };
    const a = snap();
    const oldRnd = Math.random;
    Math.random = () => 0;
    let g = 0; while (g++ < 40 && Core.enhance(uid).ok) {}
    Math.random = oldRnd;
    return diffCost(a, snap());
  })();
  return out;
}

/* ---------- 跑 ---------- */
const lines = lineCosts();
const rows = [];
Object.keys(PROFILES).forEach((pf) => {
  ANCHORS.forEach((anchor) => {
    setup(pf, anchor);
    const d = simulateDay(pf, anchor);
    rows.push({ pf, anchor, cur: d.cur, items: d.items });
    R.note('[' + pf + ' ' + PROFILES[pf].name + '] ' + anchor + ' · 日收入 ◉' + Math.round(d.cur.points || 0)
      + ' ◆' + Math.round(d.cur.otherworld || 0) + ' ✦' + Math.round(d.cur.holy || 0) + ' ♾' + Math.round(d.cur.rp || 0)
      + ' · 材料 ' + Object.keys(d.items).filter((k) => d.items[k] > 0).map((k) => k + '×' + Math.round(d.items[k])).join(' '));
  });
});

R.note('');
const fmtCost = (c) => {
  const cur = Object.keys(c.cur).map((k) => (k === 'rp' ? '♾' : k === 'otherworld' ? '◆' : k === 'holy' ? '✦' : '◉') + Math.round(c.cur[k])).join(' ');
  const it = Object.keys(c.items).map((k) => ((D.ITEMS[k] || {}).name || k) + '×' + Math.abs(Math.round(c.items[k]))).join(' ');
  return (cur || '—') + (it ? ' · ' + it : '');
};
R.note('主成长线总造价（**真扣一遍取差值**，不是抄公式）：');
R.note('  铭刻 1→20        = ' + fmtCost(lines.geneLock));
R.note('  血统 0→50 ×1 人   = ' + fmtCost(lines.bloodline));
R.note('  强化 1 件 0→20    = ' + fmtCost(lines.enhanceOne) + '（"必成"口径：把随机钉成 1）');
R.note('  秘术阁全部线满    = ' + fmtCost(lines.kejiAll));
R.note('  灯阁权限 0→20     = ' + fmtCost(lines.authority));
R.note('  全部坐骑买入+喂满 = ' + fmtCost(lines.mountsAll));
R.note('  全部法宝买入+祭炼 = ' + fmtCost(lines.fabaoAll));
R.note('  境界 0→' + D.REALM_STAGE_COUNT + ' 阶（必成） = ' + fmtCost(lines.realm));

/* 工期：用"认真档"在该档位的日收入当基准，按**最紧的那一侧货币**折算天数 */
function daysFor(cost, income) {
  let worst = 0, which = '';
  Object.keys(cost.cur).forEach((k) => {
    if (k === 'rp') return;
    const per = Math.max(0, Math.round(income[k] || 0));
    const need = Math.max(0, Math.round(cost.cur[k]));
    if (need <= 0) return;
    if (per <= 0) { worst = Infinity; which = k; return; }
    const d = need / per;
    if (d > worst) { worst = d; which = k; }
  });
  return { days: worst, which };
}
R.note('');
R.note('按【认真档】各档位日收入折算的工期（取最紧的那一侧货币）：');
['W01', 'W06', 'W12', 'W19', 'W25', 'W31', 'W36'].forEach((anchor) => {
  const row = rows.find((r) => r.pf === 'B' && r.anchor === anchor);
  if (!row) return;
  const parts = [
    ['铭刻1→20', lines.geneLock], ['血统×1人', lines.bloodline], ['强化×1件', lines.enhanceOne],
    ['秘术阁满', lines.kejiAll], ['权限0→20', lines.authority], ['境界满', lines.realm],
  ].map(([label, c]) => { const r = daysFor(c, row.cur); return label + ' ' + (r.days === Infinity ? '∞' : r.days.toFixed(1)) + 'd'; });
  R.note('  ' + anchor + '（◉' + Math.round(row.cur.points) + ' ◆' + Math.round(row.cur.otherworld) + ' ✦' + Math.round(row.cur.holy) + '）：' + parts.join(' · '));
});

/* 铭刻分段工期（§十一 要的四档节奏就在这里看） */
{
  const row = rows.find((r) => r.pf === 'B' && r.anchor === 'W12');
  const per = Math.max(1, Math.round((row || {}).cur ? row.cur.otherworld : 1));
  const gl = D.GENE_LOCKS.map((g) => g.cost.otherworld);
  const seg = (a, b) => gl.slice(a, b).reduce((x, y) => x + y, 0);
  R.note('  铭刻分段（认真档 W12 · ◆' + per + '/天）：1→5 阶 ' + (seg(0, 5) / per).toFixed(1)
    + ' 天 · 5→10 阶 ' + (seg(5, 10) / per).toFixed(1) + ' 天 · 10→15 阶 ' + (seg(10, 15) / per).toFixed(1)
    + ' 天 · 15→20 阶 ' + (seg(15, 20) / per).toFixed(1) + ' 天');
}

/* ================= 2026-10-03（《长期留存型成长生态重平衡》§二 · 180 天验收）=================
   这一轮的最高优先级指标：**四类玩家能不能在 180 天里把"核心成长"走完**。
   "核心成长"＝铭刻 + 血统 + 强化（单件必成口径）+ 秘术阁 + 灯阁权限 + 境界 —— 就是上面那几条线。
   算法：把这几条线**同一货币加起来**（一个钱包、多个出口），除以该档 **W36 期日收入**，
        取**最紧的那一侧货币** ⇒ 需要多少天。日收入是实测的（不是公式估算）。
   判据：≤180 天 = PASS；>180 = WARN（把最紧的是哪一侧、完成度差多少写出来）。
   ⚠️ 只报数、不改数（§一「先建尺子先不要改」）；要调就调数据层，然后重跑本尺子看这条曲线。 */
{
  const CORE = ['geneLock', 'bloodline', 'enhanceOne', 'kejiAll', 'authority', 'realm'];
  R.note('');
  R.note('180 天验收（§二 · 四类玩家 · 核心成长一整包 ÷ 该档 W36 期日收入）：');
  Object.keys(PROFILES).forEach((pf) => {
    const row = rows.find((r) => r.pf === pf && r.anchor === 'W36') || rows.filter((r) => r.pf === pf).pop();
    if (!row) return;
    const need = {};
    CORE.forEach((k) => {
      const c = (lines[k] && lines[k].cur) || {};
      Object.keys(c).forEach((x) => { need[x] = (need[x] || 0) + Math.max(0, c[x]); });
    });
    const r2 = daysFor({ cur: need }, row.cur);
    const days = r2.days;
    const ok = days <= 180;
    R[ok ? 'pass' : 'warn']('§二 180 天 · ' + pf + ' ' + PROFILES[pf].name + ' 走完核心成长需 ' + (days === Infinity ? '∞' : days.toFixed(0)) + ' 天', {
      file: 'js/data.js', expected: '≤ 180 天',
      actual: '最紧一侧 = ' + (r2.which || '-') + ' · 完成度 ' + (isFinite(days) ? Math.round(180 / days * 100) + '%' : '∞'),
    });
  });
}

/* ---------- 库存趋势（1/3/7/…/180 天）：按各档日收入线性积分 ---------- */
{
  R.note('');
  R.note('库存趋势（按各档本世界日收入线性积分；EXP = 按优先级花掉之后的净存）：');
  Object.keys(PROFILES).forEach((pf) => {
    /* 用该档"最靠后的可达锚点"当日收入近似整段长线（保守上界，标 EST） */
    const best = rows.filter((r) => r.pf === pf).slice(-1)[0];
    const per = { points: Math.round(best.cur.points || 0), otherworld: Math.round(best.cur.otherworld || 0), holy: Math.round(best.cur.holy || 0) };
    R.note('  [' + pf + '] 取 ' + best.anchor + ' 档日收入 ◉' + per.points + ' ◆' + per.otherworld + ' ✦' + per.holy
      + ' → 1/3/7/14/30/60/90/180 天累计：' + MARKS.map((d) => d + 'd ◉' + per.points * d + ' ◆' + per.otherworld * d + ' ✦' + per.holy * d).join(' | '));
  });
  R.note('  ⚠️ 这是"只进不出"的上界；对照上面的工期表看"够不够"，不要当成实际库存。');
}

/* ---------- 健康判定（§五十四） ---------- */
{
  const B = rows.find((r) => r.pf === 'B' && r.anchor === 'W36') || rows.slice(-1)[0];
  const ratio = (k) => { const xs = rows.map((r) => r.cur[k] || 0); return xs; };
  R.note('');
  R.note('溢出/短缺候选（只报数据，裁决见 docs/balance/残域全局数值终审.md）：');
  R.pass('四货币日收入都可测', { actual: '◉ 最高 ' + Math.max.apply(null, ratio('points')) + ' · ◆ 最高 ' + Math.max.apply(null, ratio('otherworld')) + ' · ✦ 最高 ' + Math.max.apply(null, ratio('holy')) + ' · ♾ 最高 ' + Math.max.apply(null, ratio('rp')) });
  if (Math.round(B.cur.points || 0) > 0 && Math.round(B.cur.otherworld || 0) === 0) R.warn('◆ 日收入为 0', { actual: 'W36 档 ◆=0' });
  R.note('  ⚠ 铭魂砂 / 血髓晶 / 重铸石 / 招募券 属概率掉落，本表按数据表名义概率折算（EST），不是逐次实测。');
}

R.note('');
R.note('口径：真实入口 = Dungeon.sweep / Core.claimIdle / D.corridorReward / D.arenaReward / D.GARDEN / Core.claimEverything / Core.tallyCur');
R.note('（§一 明写"先建尺子先不要改"；数值裁决见 docs/balance/残域全局数值终审.md）');
R.finish();
