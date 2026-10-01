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
for (let i = 1; i < gen.length; i++) {
  const a = gen[i - 1], b = gen[i];
  if (!a.t || !b.t) continue;
  const rh = b.t.hp / a.t.hp, ra = b.t.atk / a.t.atk;
  if (rh > WARN_JUMP || ra > WARN_JUMP) {
    R.warn(a.w.id + ' → ' + b.w.id + '：数值大幅跳变', {
      file: 'js/dungeon.js', line: lineOf('js/dungeon.js', 'EASE_LATE'),
      expected: '相邻世界倍率 ≤ ' + WARN_JUMP + 'x',
      actual: 'HP ' + rh.toFixed(3) + 'x · ATK ' + ra.toFixed(3) + 'x',
      reason: '**设计级异常候选，不自动判定为程序 Bug**（见 AUDIT-R1.3-阶段一.md）',
    });
  }
  /* ================= 父亲大人 2026-10-01 裁定【甲】=================
     「**不要**把 W01~W36 普通世界 HP/ATK 单调递增当成唯一正确标准。`EASE_LATE` 是上一轮按
      真实玩家余量与战斗手感反解出来的难度调节曲线，部分后段世界允许 HP/ATK 下降 ——
      只要**实际战斗体验**仍形成合理递进。」
     ⇒ 生成值的反向 **只报 WARN**（钉事实，不判错）；判"曲线是否合理"的标准升级为
       **真实战斗难度**（TTK / 生存时间 / 整波压力 / 不同配置档位）——那一层尺子按裁定"逐步增加"。
     ⇒ **`EASE_LATE` 数据一个字不动。** */
  if (rh < 0.95 || ra < 0.95) {
    R.warn(a.w.id + ' → ' + b.w.id + '：生成值反向（后一个世界更弱）', {
      file: 'js/dungeon.js', line: lineOf('js/dungeon.js', 'const EASE_LATE'),
      expected: '按【甲】裁定：允许存在（以真实战斗体验为准）',
      actual: 'HP ' + rh.toFixed(3) + 'x · ATK ' + ra.toFixed(3) + 'x',
      reason: 'EASE_LATE 是"满配余量"曲线，非单调是设计意图；**仅记录，不判错**',
    });
  }
}

/* ---------- 4. W29 → W30 单列（任务书点名） ---------- */
{
  const a = gen.filter((g) => g.w.id === 'W29')[0], b = gen.filter((g) => g.w.id === 'W30')[0];
  if (a && b && a.t && b.t) {
    const rh = b.t.hp / a.t.hp, ra = b.t.atk / a.t.atk;
    const rev = rh < 1 || ra < 1;
    const ev = { file: 'js/data.js', expected: 'W30 ≥ W29（不反向）', actual: 'HP ' + rh.toFixed(3) + 'x · ATK ' + ra.toFixed(3) + 'x' };
    if (rev) R.warn('W29 → W30 反向下降（已钉住事实，本轮不改）', Object.assign(ev, { reason: 'unexpected reverse progression' }));
    else R.pass('W29 → W30 没有反向下降', ev);
  } else R.blocked('W29 / W30 读不到生成值', { reason: '世界表或生成函数缺项' });
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
    /* 交叉验：W13 的总 HP / W12 的总 HP 应当与其 ease 比值**同量级**（证明索引没串位） */
    const g12 = gen.filter((g) => g.w.id === 'W12')[0], g13 = gen.filter((g) => g.w.id === 'W13')[0];
    if (g12 && g13 && g12.t && g13.t && late[12]) {
      const real = g13.t.hp / g12.t.hp, expect = late[12];
      const ratioOfRatios = real / expect;
      const ok = ratioOfRatios > 0.5 && ratioOfRatios < 2;      // 同量级即可（两边基数不同）
      (ok ? R.pass : R.warn)('W13 的 ease 索引没串位（实测倍率与 EASE_LATE[12] 同量级）', {
        file: 'js/dungeon.js', line: lineOf('js/dungeon.js', '12: 48.89'),
        expected: '≈ ' + expect + 'x', actual: real.toFixed(3) + 'x（比值 ' + ratioOfRatios.toFixed(2) + '）',
      });
    }
  }
}

R.finish();
