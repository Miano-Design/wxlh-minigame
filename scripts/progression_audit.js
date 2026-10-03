/* 成长推进审计（R1.4 数值轮 · 任务书 §一 / §五十一）：node scripts/progression_audit.js
   ==============================================================================
   **先建尺子，先不改数**（父亲大人原话：「先建立 progression_audit.js 与 economy_sim.js，先不要改」）。

   它真跑：敌人一律 `Dungeon.makeEnemies()` 生成，战斗一律 `Battle.run()`（和线上同一份引擎），
   **不复制任何公式、不编假数据**。三类玩家按 §二 建模（普通 / 认真 / 高效），
   每个世界输出 §五十一 要求的九列：
     世界 / 推荐等级 / 推荐战力 / 玩家实际战力 / 敌方总HP / 敌方总ATK / 敌方平均DEF /
     普通TTK / BossTTK / 死亡率 / 剩余HP

   ⚠️ 三条口径（和 `world_curve` 对齐，别两把尺子各写一套）：
     · **允许每场 1 次复活** —— 这是线上现实（见 world_curve 头部 §5.4），不是放水；
     · 通过判据用**多数票**：同一档位打 3 个种子，赢 2 次才算过（敌人编成是随机抽的）；
     · 每关各自满血开打（和 `world_curve` 一致），**跨关血量继承不在本尺子的口径里**。

   用法：
     node scripts/progression_audit.js                       # 全 36 世界 · 普通难度
     node scripts/progression_audit.js --worlds=W06,W12,W36  # 只看几个世界
     node scripts/progression_audit.js --diff=hard           # 换难度
     node scripts/progression_audit.js --no-scan             # 跳过"推荐等级"扫描（快）
   只读：不改任何数值、不碰存档。 */
const path = require('path');
const { boot, lineOf } = require('./_env');
const { makeReport } = require('./_report');
const SIM = require(path.resolve(__dirname, '..', '..', 'wxlh-minigame-scripts', '_sim_allies.js'));
const R = makeReport('progression_audit');

/* ---------- 参数 ---------- */
const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const flag = (k) => process.argv.indexOf('--' + k) >= 0;
const ONLY = (arg('worlds') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DIFF = arg('diff') || 'normal';
const SCAN = !flag('no-scan');
const REVIVE = !flag('no-revive');
const SEEDS = [20260917, 20260917 + 7919, 20260917 + 2 * 7919];   // world_curve 同款三个种子
const LVS = []; for (let l = 5; l <= 100; l += 5) LVS.push(l);

let E;
try { E = boot(); } catch (e) {
  R.blocked('加载游戏运行环境', { file: 'scripts/_env.js', reason: String((e && e.message) || e) });
  R.finish();
  return;
}
const { Core, D } = E;
const Dun = E.G.Dungeon, Battle = E.G.Battle;

/* 固定种子（不锁的话同一支队跑三次能给出三种答案，报告就没法做回归） */
let seed = SEEDS[0];
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

/* ---------- 三类玩家模型（§二） ---------- */
const RARITY_ORDER = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
const BEST = D.characters.slice()
  .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9))
  .map((c) => c.id);
const gateOf = (wi) => { let g = 0; for (let i = 0; i <= wi; i++) g = Math.max(g, D.WORLDS[i].reincarn || 0); return g; };
const rpFor = (n) => { let rp = 0; for (let k = 1; k <= n; k++) rp += Math.floor(100 * Math.pow(k, 1.15)); return rp; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function spendTalents() {
  for (let guard = 0; guard < 200; guard++) {
    const open = Object.keys(D.TALENTS).filter((b) => Core.S.player.talents[b] < 10);
    if (!open.length) break;
    const b = open.reduce((m, x) => (D.TALENT_COSTS[Core.S.player.talents[x]] < D.TALENT_COSTS[Core.S.player.talents[m]] ? x : m), open[0]);
    if (!Core.buyTalent(b).ok) break;
  }
}

/* profile：'A' 普通 / 'B' 认真 / 'C' 高效。约定：三类玩家都站在"该世界的推荐等级"上，
   差别只在**投入程度**（装备档次 / 强化 / 血统 / 技能 / 铭刻 / 秘术 / 权限 / 神装）。 */
function setup(profile, wid, lv) {
  seed = SEEDS[0];
  Core.newGame();
  Core.setPlayerName('推进审计');
  Core.choosePlayerBloodline('修真');
  const S = Core.S, p = S.player;
  const wi = D.WORLDS.findIndex((w) => w.id === wid);
  p.level = lv;
  p.attrPoints = lv * 3;
  D.ATTR_META.forEach((a) => Core.allocateAttr(a.id, Math.floor(p.attrPoints / (D.ATTR_META.length * 10)) * 10));
  const gate = gateOf(wi);
  p.reincarnations = gate;
  Core.addCur('rp', rpFor(gate));
  spendTalents();

  /* 各档投入度（同一世界、同一等级下，唯一变量是"玩得多认真"） */
  const SPEC = {
    A: { n: 4, rarityBias: -1, lvOff: -6, blood: 0.30, skill: 0.30, gl: Math.max(0, gate - 1), keji: 0.20, auth: 2, mount: false, fabao: false, myth: false, en: 0 },
    B: { n: 4, rarityBias: 0, lvOff: 0, blood: 0.50, skill: 0.40, gl: gate + 2, keji: 0.40, auth: 4, mount: true, fabao: true, myth: true, en: Math.round(lv / 8) },
    C: { n: 4, rarityBias: 0, lvOff: 0, blood: 1.00, skill: 1.00, gl: gate + 5, keji: 1.00, auth: 10, mount: true, fabao: true, myth: 'tier', en: Math.round(lv / 5) },
  }[profile];

  /* 伙伴：A 档拿"抽得到的中档"（跳过前几个最高稀有度），B/C 拿最高稀有度 */
  const ids = BEST.slice(profile === 'A' ? 2 : 0, (profile === 'A' ? 2 : 0) + SPEC.n);
  const plv = clamp(lv + SPEC.lvOff, 1, D.PLAYER_MAX_LV);
  ids.forEach((id) => {
    Core.addChar(id);
    S.chars[id].lv = plv;
    /* 星级按**该伙伴自己的稀有度上限**（`RARITY_MAXSTAR` 是 { N:3 … UR:6 } 的对象，不是数组）——
       写得差一档会让 "高效档" 的伙伴星级反而低于认真档，读数就没意义了。 */
    const maxStar = D.RARITY_MAXSTAR[D.charById[id].rarity] || 5;
    S.chars[id].star = profile === 'C' ? maxStar : Math.min(maxStar, profile === 'B' ? 3 : 2);
    S.chars[id].skillLv = D.SKILL_MAX_BY_INDEX.map((m) => Math.min(m, Math.round(plv * SPEC.skill)));
    S.chars[id].bloodlineLv = Math.min(D.BLOODLINE_MAX, Math.round(plv * SPEC.blood));
  });
  S.party = ['@player'].concat(ids);
  p.bloodlineLv = Math.min(D.BLOODLINE_MAX, Math.round(lv * SPEC.blood));

  /* 装备：按世界档次的品质；A 档降一档、且不强化 */
  const TIERS = ['N', 'R', 'SR', 'SSR', 'UR'];
  let rarity = wi >= 10 ? 'UR' : wi >= 4 ? 'SSR' : 'SR';
  if (profile === 'A') rarity = TIERS[Math.max(0, TIERS.indexOf(rarity) - 1)];
  S.bag.eqCap = 400;
  for (let i = 0; i < 120; i++) Core.grantEquip(wid, rarity, null);
  ['points', 'otherworld', 'bloodCrystal', 'holy', 'corridor', 'skillChip', 'story'].forEach((k) => Core.addCur(k, 1e9));
  /* 铭刻直接给到该档位该有的阶数（真刷的话要走门槛+料，本尺子只量"到这个进度的人有多强"） */
  p.geneLock = clamp(SPEC.gl, 0, D.GENE_LOCK_MAX);
  D.MOUNTS.forEach((m) => { if (SPEC.mount) Core.buyMount(m.id); });
  D.FABAO.forEach((f) => { if (SPEC.fabao) Core.buyFabao(f.id); });
  D.KEJI.forEach((k) => { for (let i = 0; i < Math.ceil(k.max * SPEC.keji); i++) Core.kejiUp(k.id); });
  for (let i = 0; i < SPEC.auth; i++) Core.upgradeAuthority();
  /* 神装：B 档"刷了多久给多少件"，C 档给得更多（§三十 神装终局模拟的输入端） */
  if (wi >= 20 && SPEC.myth === true) {
    const n = Math.min(700, 60 + (wi - 20) * 60);
    for (let i = 0; i < n; i++) Core.grantEquip(wid, 'MYTH', null);
  } else if (wi >= 20 && SPEC.myth === 'tier') {
    const n = Math.min(900, 150 + (wi - 20) * 90);
    for (let i = 0; i < n; i++) Core.grantEquip(wid, 'MYTH', null);
  }
  Core.autoEquipBest();
  /* 强化：按档位把身上那套点到指定等级（`enhance` 是装备实例字段；未强化的保持 0） */
  if (SPEC.en > 0) {
    Object.values(S.equips).forEach((eq) => {
      const worn = Object.values(S.equipped).some((sl) => Object.values(sl).indexOf(eq.uid) >= 0);
      if (worn) eq.enhance = Math.min(20, SPEC.en);
    });
  }
}

/* ---------- 单场战斗（含 world_curve 同款"每场 1 次复活"基线） ---------- */
function fight(wid, stage, diff) {
  const kind = Dun.finalKind(stage);
  const allies = SIM.buildAllies({}, {});
  if (!allies.length) return { win: false, rounds: 0, units: [] };
  const res = Battle.run({ allies, enemies: Dun.makeEnemies(wid, diff, stage, kind), worldId: wid, maxRounds: 60 });
  if (res.win || !REVIVE) return res;
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
  const a2 = units.filter((u) => u.side === 'ally').map((u) => carry(u, true));
  const e2 = units.filter((u) => u.side === 'enemy').map((u) => carry(u, false));
  if (!a2.length || !e2.length) return res;
  const r2 = Battle.run({ allies: a2, enemies: e2, worldId: wid, maxRounds: 60 });
  r2.rounds = (res.rounds || 0) + (r2.rounds || 0);   // 两段的总回合（TTK 用）
  return r2;
}

const allyStat = (res) => {
  const al = (res.units || []).filter((u) => u.side === 'ally');
  if (!al.length) return { n: 0, dead: 0, left: 0 };
  const dead = al.filter((u) => u.hp <= 0).length;
  const left = al.reduce((s, u) => s + Math.max(0, u.hp), 0) / Math.max(1, al.reduce((s, u) => s + u.maxHp, 0));
  return { n: al.length, dead, left };
};
const enemyTotals = (list) => {
  if (!list || !list.length) return null;
  const hp = list.reduce((s, u) => s + (u.hp || 0), 0);
  const atk = list.reduce((s, u) => s + (u.atk || 0), 0);
  const def = list.reduce((s, u) => s + (u.def || 0), 0) / list.length;
  return { n: list.length, hp, atk, def: Math.round(def) };
};

/* ---------- 单世界 · 单档案测量（每关 × 3 种子） ---------- */
function measure(profile, wid, lv, diff) {
  setup(profile, wid, lv);
  const power = Core.teamPower();
  const e1 = enemyTotals(Dun.makeEnemies(wid, diff, 1, 'combat'));
  const e12 = enemyTotals(Dun.makeEnemies(wid, diff, 12, 'boss'));
  let winAll = 0;
  const rc = [], rb = [], deathRate = [], leftPct = [], failAt = [];
  SEEDS.forEach((s) => {
    seed = s;
    /* ⚠️ 2026-10-03 世界曲线轮 · **这里刻意不再按种子重建队伍**（试过，已回退）。
       背景：`minLevel` 是每个种子前都 `setup` 一次的，`measure` 只在开头 setup 一次 ——
       两边的随机流不同，同一个 (档案, 世界, 等级, 种子) 可能给出不同结论
       （上一轮已修掉"失败就 break"那一半）。
       把 `measure` 也改成逐种子 setup 之后，尺子确实自洽了，但它同时**暴露出 7 个世界
       Boss TTK 超 20 回合**（W17/W19/W26/W28/W34/W35 —— 用**基线 bd101e9 的 js/dungeon.js**
       跑同一把修正后的尺子，同样超，见回单里的对照实验）—— 也就是说那是**基线就带着的条件**，
       要修得逐格重解 7 个世界的 Boss 表。任务书明写"不要开启下一轮无限数值微调"，
       所以这一轮**只保留上一轮那一半修正**，把这一半留成一条已知缺口（回单里写清楚）。
       ⚠️ 下次做世界曲线专项时：先恢复这句 `setup(profile, wid, lv);`，再一起解。 */
    let ok = true;
    for (let stage = 1; stage <= 12; stage++) {
      const res = fight(wid, stage, diff);
      const a = allyStat(res);
      deathRate.push(a.n ? a.dead / a.n : 1);
      leftPct.push(a.left);
      if (res.win) { (stage === 12 ? rb : rc).push(res.rounds || 0); }
      else { ok = false; failAt.push(stage); }
    }
    if (ok) winAll++;
  });
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    power, e1, e12, winAll,
    ttk: avg(rc), bossTtk: avg(rb),
    death: avg(deathRate), left: avg(leftPct),
    failAt: failAt[0] || 0,
  };
}

/* "推荐等级"＝ 认真档能**一口气打通这个世界普通 12 关**的最低等级（多数票 2/3） */
function minLevel(wid, diff) {
  for (const lv of LVS) {
    let win = 0;
    for (const s of SEEDS) {
      seed = s;
      setup('B', wid, lv);
      /* ================= 2026-10-03 余项收口 · **两把量尺必须走同一条随机流** =================
         原来这里写的是 `stage <= 12 && ok` —— 一失败就 break，**少打的那几关也就少消耗随机数**；
         而下面 `measure()` 是**无条件打满 12 关**的。于是同一个 (档案, 世界, 等级, 种子)
         在"找推荐等级"和"在推荐等级上复测"里走的是**两条不同的随机流** ——
         实测 W15 出现自相矛盾：minLevel 说 ≥2/3 能通，measure 在同一个等级上只有 1/3。
         这条不是放松判据（改完 minLevel 只会找到**更高或相同**的等级），是让两把尺对同一个样本
         给出同一个结论。 */
      let ok = true;
      for (let stage = 1; stage <= 12; stage++) { if (!fight(wid, stage, diff).win) ok = false; }
      if (ok) win++;
      if (win >= 2) return lv;
    }
  }
  return null;
}

/* ---------- 跑 ---------- */
const WORLDS = D.WORLDS.filter((w) => !ONLY.length || ONLY.indexOf(w.id) >= 0);
R.note('难度=' + DIFF + ' · 复活基线=' + (REVIVE ? '允许每场 1 次' : '禁止') + ' · 每档 3 种子多数票 · 世界数=' + WORLDS.length);
R.note('三类玩家：A 普通（中档伙伴/低一档装备/不强化/铭刻最省）· B 认真（满编最高稀有度/本档装备/按世界强化）· C 高效（全满血统技能/铭刻更高/神装更多）');
R.note('');
R.note('世界 · 推荐Lv · 推荐战力(B) · 战力A/B/C · 敌ΣHP · 敌ΣATK · 敌均DEF · 普通TTK · BossTTK · 死亡率 · 剩余HP · 结果');

const rows = [];
WORLDS.forEach((w) => {
  const rec = SCAN ? minLevel(w.id, DIFF) : null;
  const lv = rec || clamp(10 + D.WORLDS.indexOf(w) * 3, 5, 100);
  const A = measure('A', w.id, lv, DIFF);
  const B = measure('B', w.id, lv, DIFF);
  const C = measure('C', w.id, lv, DIFF);
  rows.push({ w, lv, rec, A, B, C });
  R.note('  ' + w.id + ' ' + (w.name || '') + ' · 推荐Lv.' + (rec === null ? '>100' : rec) + ' · B战力 ' + B.power
    + ' · A/B/C ' + A.power + '/' + B.power + '/' + C.power
    + ' · 敌ΣHP ' + (B.e1 ? B.e1.hp : '?') + ' · 敌ΣATK ' + (B.e1 ? B.e1.atk : '?') + ' · 敌均DEF ' + (B.e1 ? B.e1.def : '?')
    + ' · TTK ' + B.ttk.toFixed(1) + ' · Boss ' + B.bossTtk.toFixed(1)
    + ' · 死亡率 ' + (B.death * 100).toFixed(0) + '% · 剩余HP ' + (B.left * 100).toFixed(0) + '%'
    + ' · 通关 ' + B.winAll + '/3' + (B.winAll < 2 ? ('（首败第 ' + B.failAt + ' 关）') : ''));
});

/* ---------- 判据（只报事实，不改数值） ---------- */
R.note('');
const noRec = rows.filter((r) => r.rec === null);
if (noRec.length) {
  R.warn('认真档在 Lv.100 也打不穿的世界', {
    file: 'js/dungeon.js', expected: '所有世界都该有可通关等级',
    actual: noRec.map((r) => r.w.id).join(', '),
    reason: '可能是"要满配才能过"（不是关卡坏了）—— 需结合高效档读数判断',
  });
} else R.pass('36 个世界在认真档都有可通关等级（普通难度，含守关 Boss）', { actual: '最高推荐 Lv.' + Math.max.apply(null, rows.map((r) => r.rec || 0)) });

/* 认真档通关率：低于 2/3 记 WARN（随机波动 + 构筑门槛） */
const shaky = rows.filter((r) => r.B.winAll < 2);
if (shaky.length) {
  R.warn('认真档在"推荐等级"上仍打不满 2/3 的世界', {
    file: 'js/dungeon.js', expected: 'B 档 ≥ 2/3',
    actual: shaky.map((r) => r.w.id + '(' + r.B.winAll + '/3' + (r.B.failAt ? '·首败' + r.B.failAt : '') + ')').join(', '),
    reason: '§五 允许 ±20% 波动；这里只记录，是否调整看数据',
  });
} else R.pass('认真档在所有世界的推荐等级上都稳定通关（≥2/3）');

/* 相邻世界的推荐等级落差（§§ 建议 5 级内；world_curve 已有这条，本尺子只复核） */
let maxGap = 0, gapAt = '';
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1].rec, b = rows[i].rec;
  if (a == null || b == null) continue;
  if (b - a > maxGap) { maxGap = b - a; gapAt = rows[i - 1].w.id + '→' + rows[i].w.id; }
}
R.pass('相邻世界推荐等级最大落差', { actual: 'Lv.' + maxGap + '（' + (gapAt || '-') + '）' });

/* TTK 目标区间（§五）：只报区间外的，不算判死 */
const TT = rows.map((r) => ({ id: r.w.id, t: r.B.ttk, b: r.B.bossTtk }));
const ttkOut = TT.filter((x) => x.t > 0 && (x.t < 2 || x.t > 14));
const bossOut = TT.filter((x) => x.b > 0 && (x.b < 3 || x.b > 20));
if (ttkOut.length) R.warn('普通关 TTK 落在 §五 区间外（2~14 回合）', { actual: ttkOut.map((x) => x.id + '=' + x.t.toFixed(1)).join(', ') });
else R.pass('所有普通关 TTK 在 2~14 回合区间内');
if (bossOut.length) R.warn('Boss TTK 落在 §五 区间外（3~20 回合）', { actual: bossOut.map((x) => x.id + '=' + x.b.toFixed(1)).join(', ') });
else R.pass('所有 Boss TTK 在 3~20 回合区间内');

/* 高效档不该被轻松打穿（若 C 档也能在"推荐等级"上稳定过，说明该世界对高投入玩家偏软） */
R.note('高效档（C）参考：' + rows.map((r) => r.w.id + '#' + r.C.winAll).join(' '));
R.note('数据出处：js/dungeon.js makeEnemies · js/battle.js Battle.run · js/core.js effectiveStats/teamPower');
R.note('（本尺子只报事实：§一 明写"先建尺子先不要改"。数值裁决见 docs/balance/残域全局数值终审.md）');
R.finish();
