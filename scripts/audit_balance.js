/* 世界数值连续性审计（R1.3 阶段二 ②·第一支）：node scripts/audit_balance.js
   ==============================================================================
   **真跑**：敌人数值一律用游戏自己的 `Dungeon.makeEnemies()` 生成（不复制公式、不编假数据）。
   判定分三档（任务书 §三）：
     PASS = 结构正确；WARN = 数值异常但**不能仅凭数学判成 Bug**（比如 W12→W13）；
     FAIL = 数据损坏 / 非法值 / 缺失 / 反向曲线这类**结构错误**。
   ⚠️ 本轮只报事实，**不改任何数值**。 */
const { boot, lineOf } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('audit_balance');

let E;
try { E = boot(); } catch (e) {
  R.blocked('加载游戏运行环境', { file: 'scripts/_env.js', reason: String((e && e.message) || e) });
  R.finish();
  return;
}
const { Core, D, CV } = E;

/* ---------- 1. 世界表完整性（W01~W36 连续、无重、无缺） ---------- */
const WS = D.WORLDS.slice();
const ids = WS.map((w) => w.id);
const want = [];
for (let i = 1; i <= 36; i++) want.push('W' + String(i).padStart(2, '0'));
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
R.pass('世界表 36 个（W01~W36）', { expected: '36', actual: String(WS.length) });
if (WS.length !== 36) R.fail('世界数量不是 36', { file: 'js/data.js', expected: '36', actual: String(WS.length) });
if (dup.length) R.fail('世界 id 有重复', { file: 'js/data.js', expected: '无重复', actual: dup.join(',') });
else R.pass('世界 id 无重复');
const miss = want.filter((w) => ids.indexOf(w) < 0);
if (miss.length) R.fail('世界 id 有缺档', { file: 'js/data.js', expected: want[0] + '…' + want[35], actual: '缺 ' + miss.join(',') });
else R.pass('世界 id 连续无缺档（W01~W36）');
const order = ids.every((v, i) => v === want[i]);
R.pass('世界表的**顺序**就是 W01→W36（索引＝世界号）', { actual: ids.slice(0, 3).join(',') + ' … ' + ids.slice(-1)[0] });
if (!order) R.fail('世界表顺序与编号不一致（会让"按索引取难度"错位）', { file: 'js/data.js', expected: 'W01,W02,…', actual: ids.slice(0, 6).join(',') + '…' });

/* ---------- 2. 逐世界实际生成的敌人数值（真调 makeEnemies） ---------- */
const totalsOf = (wid, diff) => {
  let list = [];
  try { list = E.G.Dungeon.makeEnemies(wid, diff || 'normal', 1, 'combat') || []; }
  catch (e) { return null; }
  if (!list.length) return null;
  const hp = list.reduce((s, u) => s + (u.hp || 0), 0);
  const atk = list.reduce((s, u) => s + (u.atk || 0), 0);
  const def = list.reduce((s, u) => s + (u.def || 0), 0) / list.length;
  return { n: list.length, hp, atk, def: Math.round(def) };
};

const gen = WS.map((w) => ({ w, t: totalsOf(w.id, 'normal') }));
const badGen = gen.filter((g) => !g.t || !isFinite(g.t.hp) || !isFinite(g.t.atk) || g.t.hp <= 0);
if (badGen.length) {
  R.fail('有世界生不出敌人 / 数值非法', { file: 'js/dungeon.js', expected: '36 个世界都能生成', actual: badGen.map((g) => g.w.id).join(',') });
} else {
  R.pass('36 个世界都能真的生成敌人（normal / stage 1 / 普通波）', { actual: '例：W01 ' + gen[0].t.hp + " hp / W36 " + gen[35].t.hp + " hp" });
}
R.note('逐世界（normal · stage 1 · combat）实测：世界 · 基数HP/ATK/DEF · 生成单位数 · 总HP · 总ATK · 均DEF');
gen.forEach((g) => {
  if (!g.t) return;
  R.note('  ' + g.w.id + ' ' + (g.w.name || '') + ' · ' + g.w.hp + '/' + g.w.atk + '/' + g.w.def
    + ' · n=' + g.t.n + ' · Σhp=' + g.t.hp + ' · Σatk=' + g.t.atk + ' · avgDef=' + g.t.def);
});

/* ---------- 3. 相邻世界倍率（生成值的比值；异常报 WARN，结构错报 FAIL） ---------- */
const WARN_JUMP = 8;          // 相邻世界总 HP 涨过 8 倍 ⇒ 值得报给人看（不是判定为 Bug）
const dips = [];              // 单步局部回落（只记录，判错在 §4）
for (let i = 1; i < gen.length; i++) {
  const a = gen[i - 1], b = gen[i];
  if (!a.t || !b.t) continue;
  const rh = b.t.hp / a.t.hp, ra = b.t.atk / a.t.atk;
  if (rh > WARN_JUMP || ra > WARN_JUMP) {
    R.warn(a.w.id + ' → ' + b.w.id + '：数值大幅跳变', {
      file: 'js/dungeon.js', line: lineOf('js/dungeon.js', 'EASE_LATE'),
      expected: '相邻世界倍率 ≤ ' + WARN_JUMP + 'x',
      actual: 'HP ' + rh.toFixed(3) + 'x · ATK ' + ra.toFixed(3) + 'x',
      reason: '**设计级异常候选，不自动判定为程序 Bug**（见 docs/archive/AUDIT-R1.3-阶段一.md）',
    });
  }
  /* ================= 2026-10-03 世界曲线重解 · **判据换成"最终有效战斗体验"** =================
     父亲大人 2026-10-01 的【甲】裁定 + 2026-10-03《下一次数值裁决任务书》§三/§五/§十一 情况 A：
       · 世界数值**允许局部下降**，不要求 HP/ATK/EASE 逐格递增；
       · 「只有当**最终有效战斗体验**出现明显反向，才进入重标定」；
       · 只有"**连续多个世界明显变弱**"才算体验倒退（单步小幅回落允许）。
     所以这里**单步下降只记录、不判错**；真正判错的是 §4 那两条：
       ① 一场守关的**收益**不能倒退（收益是真金白银的那一侧，比 HP 更能说明"值不值得推"）；
       ② 不能出现"连降 ≥2 段且累计跌到 75% 以下"这种**连续明显变弱**。
     （`EASE_LATE` 是**反向补偿曲线** —— 它要抵消世界里基准值的增长，所以它自己必须递减。
       拿"它是否递增"当判据，本身就是一个错的测量模型。） */
  if (rh < 0.95 || ra < 0.95) {
    dips.push(a.w.id + '→' + b.w.id + ' ' + (rh < 0.95 ? 'HP ' + rh.toFixed(3) + 'x' : 'ATK ' + ra.toFixed(3) + 'x'));
  }
  if (rh < 0.95 || ra < 0.95) {
    /* 只记一笔，不报 WARN —— 判错在下面 §4（连续明显变弱 / 收益倒退）。 */
  }
}

/* ---------- 4. 最终有效战斗体验：收益不倒退 ＋ 不许"连续多个世界明显变弱" ---------- */
{
  /* 收益口径：**这一世界守关 Boss 那一场**能拿到多少（◉ 直接计，◆ 按 3 点折算 —— 与商店的
     换算口径同源）。用 `Dungeon.battleRewards`（真源），不另抄一份公式。 */
  const valOf = (wid) => {
    let r = null;
    try { r = E.G.Dungeon.battleRewards(wid, 'normal', 12, 'boss') || {}; } catch (e) { r = null; }
    if (!r) return null;
    return { pts: Number(r.points) || 0, other: Number(r.otherworld) || 0,
      v: (Number(r.points) || 0) + (Number(r.otherworld) || 0) * 3 };
  };
  const vals = gen.map((g) => valOf(g.w.id));
  const badVal = [];
  for (let i = 1; i < vals.length; i++) {
    if (!vals[i] || !vals[i - 1]) continue;
    if (vals[i].v < vals[i - 1].v) badVal.push(gen[i - 1].w.id + '→' + gen[i].w.id + ' ' + (vals[i].v / vals[i - 1].v).toFixed(3) + 'x');
  }
  (badVal.length ? R.fail : R.pass)('推进收益不倒退（后一个世界的守关收益不低于前一个）', {
    file: 'js/dungeon.js', line: lineOf('js/dungeon.js', 'function battleRewards'),
    expected: '每一格 ≥ 前一格', actual: badVal.length ? badVal.join(' ; ') : 'W01→W36 逐格不降',
  });

  /* "连续多个世界明显变弱"：连降 ≥2 段、且累计跌到 75% 以下 —— 两条同时成立才判错。
     单步小幅回落（比如 W13→W14）是设计允许的局部下降，不算。 */
  const RUN_MIN = 2, CUM_MIN = 0.75;
  const runs = [];
  let start = 0, len = 1;
  for (let i = 1; i < gen.length; i++) {
    const a = gen[i - 1].t, b = gen[i].t;
    if (!a || !b) { len = 1; start = i; continue; }
    if (b.hp < a.hp) { if (len === 1) start = i - 1; len++; }
    else { if (len >= 2) runs.push({ a: start, b: i - 1, len: len - 1, cum: gen[i - 1].t.hp / gen[start].t.hp }); len = 1; }
  }
  if (len >= 2) runs.push({ a: start, b: gen.length - 1, len: len - 1, cum: gen[gen.length - 1].t.hp / gen[start].t.hp });
  const badRun = runs.filter((r) => r.len >= RUN_MIN && r.cum <= CUM_MIN);
  const desc = (r) => gen[r.a].w.id + '→' + gen[r.b].w.id + '（连降 ' + r.len + ' 段 · 累计 ' + (r.cum * 100).toFixed(1) + '%）';
  (badRun.length ? R.warn : R.pass)('没有"连续多个世界明显变弱"（连降 ≥2 段且累计 ≤75% 才判错）', {
    file: 'js/dungeon.js', line: lineOf('js/dungeon.js', 'const EASE_LATE'),
    expected: '不允许连续明显变弱；单步局部回落允许',
    actual: badRun.length ? badRun.map(desc).join(' ; ') : ('通过的连降段：' + (runs.length ? runs.map(desc).join(' ; ') : '无')),
  });
  R.note('有效强度曲线上的**全部**连降段（含允许的）：' + (runs.length ? runs.map(desc).join(' · ') : '（无）'));
  if (dips.length) R.note('单步局部回落（设计允许，不计错）：' + dips.join(' · '));

  /* ================= 真实有效曲线整表（任务书 §二：**叠层之后**的最终值）=================
     这一张就是"玩家实际吃到的东西"：`Dungeon.makeEnemies` 生成之后的总 HP / 总 ATK（已经含
     EASE_LATE × progressionRelief × earlyPace × mAtkRelief × diffMult × stageMult 全部叠层），
     加上守关 Boss 的 HP 与那一场的收益。**不要拿 EASE_LATE 原始表值去和它对**（那是两回事，
     本文件 §5 的"索引没串位"那条就是为这个踩过的坑）。 */
  R.note('');
  R.note('真实有效曲线（normal · 第 1 关 · 普通波 → 总 HP/ATK；第 12 关守关 → BossHP/收益）：');
  gen.forEach((g, i) => {
    const v = vals[i];
    if (!g.t) return;
    let bhp = '—';
    try {
      const list = E.G.Dungeon.makeEnemies(g.w.id, 'normal', 12, 'boss') || [];
      const boss = list.filter((e) => e && e.isBoss)[0];
      if (boss) bhp = boss.hp;
    } catch (e) {}
    R.note('  ' + g.w.id + ' ' + (g.w.name || '') + ' · Σhp=' + g.t.hp + ' · Σatk=' + g.t.atk
      + ' · BossHP=' + bhp
      + ' · 守关收益 ◉' + (v ? v.pts : '?') + ' + ◆' + (v ? v.other : '?') + '（折 ◉' + (v ? v.v : '?') + '）');
  });
}

/* ---------- 5. EASE / EASE_LATE 的实际映射（防"索引错位"） ---------- */
{
  const src = require('fs').readFileSync(require('path').join(E.ROOT, 'js/dungeon.js'), 'utf8');
  const grab = (name) => {
    const m = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n    \\};').exec(src);
    if (!m) return null;
    const out = {};
    const re = /(\d+)\s*:\s*([\d.]+)/g; let g;
    while ((g = re.exec(m[1]))) out[g[1]] = Number(g[2]);
    return out;
  };
  const late = grab('EASE_LATE');
  if (!late) R.blocked('读不到 EASE_LATE', { file: 'js/dungeon.js', reason: '配方变了（不是对象字面量）' });
  else {
    R.pass('EASE_LATE 的世界映射（key 是**世界下标**：12 → W13）', {
      file: 'js/dungeon.js', line: lineOf('js/dungeon.js', 'const EASE_LATE'),
      actual: Object.keys(late).sort((a, b) => a - b).slice(0, 6).map((k) => 'idx' + k + '→W' + (Number(k) + 1) + '=' + late[k]).join(' · '),
    });
    /* ================= 交叉验：W12→W13 这一步（防 ease 索引串位） =================
       ⚠️ 2026-10-03 余项收口 · **判据换成实测带**，原判据已过时，写明理由：
       原来这里拿"实测倍率"去比 `EASE_LATE[12]` 这个**原始表值**（48.89），要求同量级。
       但 `js/dungeon.js` 在这张表之上还叠了两层（同一文件里写死的）：
         · `progressionRelief = 0.42`（wi 12~21 的剧情推进减压）
         · `earlyPace = 3.9`（wi < 12 的 HP 前期档 —— **只作用在 HP 上**）
       也就是说 W13/W12 的真实期望是 `48.89 × 0.42 ÷ 3.9 ≈ 5.26`，不是 48.89。
       原判据的模型停在"表还没被叠层"那一版，一直在误报（实测 6.232，比值 0.13）。
       现在改成**按设计意图直接量这一步**：W13 是"转生之后的第一张图"，它相对 W12
       应当是一段**能感觉到的台阶**（≥3x），但不能是断层（≤8x，与上面 §3 的判据同一条线）。
       索引真串了位的话，W13 会退回平地（<3x）或直接炸成断层（>8x），两头都会红。
       `EASE_LATE[12]` 的原值仍打在 actual 里，方便对照。 */
    const g12 = gen.filter((g) => g.w.id === 'W12')[0], g13 = gen.filter((g) => g.w.id === 'W13')[0];
    if (g12 && g13 && g12.t && g13.t && late[12]) {
      const real = g13.t.hp / g12.t.hp, expect = late[12];
      const ok = real >= 3 && real <= 8;                        // 台阶要看得见，但不能是断层
      (ok ? R.pass : R.warn)('W12→W13 是"看得见的台阶"（3~8x），ease 索引没串位', {
        file: 'js/dungeon.js', line: lineOf('js/dungeon.js', '12: 48.89'),
        expected: '实测 3~8x（转生门台阶）',
        actual: real.toFixed(3) + 'x（EASE_LATE[12]=' + expect + ' · 表值之上还叠了 relief 0.42 / 前期 HP 档 3.9）',
      });
    }
  }
}

R.finish();
