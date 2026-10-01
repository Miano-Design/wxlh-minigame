/* 数据引用完整性审计（R1.3 阶段二 ②）：node scripts/audit_data.js
   真读 `js/data.js` 运行后的表，检查重复 id / 悬空引用 / 非法概率 / 稀有度名字一致。
   概率表**按项目实际形状判**（不是"所有表都必须 =1"）。 */
const { boot, lineOf } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('audit_data');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { D } = E;

const dupOf = (arr) => { const s = {}; arr.forEach((v) => { s[v] = (s[v] || 0) + 1; }); return Object.keys(s).filter((k) => s[k] > 1); };

/* ① 世界 / 角色 / 装备 / 道具 的 id */
const wIds = (D.WORLDS || []).map((w) => w.id);
(dupOf(wIds).length ? R.fail : R.pass)('世界 id 无重复', { file: 'js/data.js', expected: '无重复', actual: dupOf(wIds).join(',') || '无' });
const cIds = (D.characters || []).map((c) => c.id);
(dupOf(cIds).length ? R.fail : R.pass)('伙伴 id 无重复', { file: 'js/data.js', expected: '无重复', actual: (dupOf(cIds).join(',') || '无') + '（共 ' + cIds.length + ' 个）' });
const itIds = Object.keys(D.ITEMS || {});
(dupOf(itIds).length ? R.fail : R.pass)('道具 id 无重复', { file: 'js/data.js', expected: '无重复', actual: (dupOf(itIds).join(',') || '无') + '（共 ' + itIds.length + ' 个）' });

/* ② 稀有度**是两条线**（项目自己写明了这个口径）：
      · `RARITIES`       = **角色**稀有度，五档，**永远没有 MYTH**（MYTH 是装备专属）；
      · `EQUIP_RARITIES` = **装备**品质，六档，含 MYTH。
   第一版把两者当成一张表 ⇒ 报了条假 FAIL。现在两边各钉一条，防的是"有人往 RARITIES 里塞 MYTH
   或从 EQUIP_RARITIES 里删一档" —— 那两种都会让按稀有度取色/取词条数的界面悄悄错档。 */
const RAR_CHAR = (D.RARITIES || []).slice();
const RAR_EQUIP = (D.EQUIP_RARITIES || []).slice();
const wantChar = ['N', 'R', 'SR', 'SSR', 'UR'];
const wantEquip = ['N', 'R', 'SR', 'SSR', 'UR', 'MYTH'];
const charOk = RAR_CHAR.join('/') === wantChar.join('/');
(charOk ? R.pass : R.fail)('角色稀有度五档、且**不含 MYTH**', {
  file: 'js/data.js', line: lineOf('js/data.js', 'const RARITIES'),
  expected: wantChar.join('/'), actual: RAR_CHAR.join('/'),
});
const equipOk = RAR_EQUIP.join('/') === wantEquip.join('/');
(equipOk ? R.pass : R.fail)('装备品质六档（含 MYTH）', {
  file: 'js/data.js', line: lineOf('js/data.js', 'const EQUIP_RARITIES'),
  expected: wantEquip.join('/'), actual: RAR_EQUIP.join('/'),
});
/* 分解收益表必须六档齐全（少一档就会出现"分解这件没收益"的静默 bug） */
const dg = D.DECOMPOSE_GAIN || {};
const missGain = wantEquip.filter((r) => typeof dg[r] !== 'number');
(missGain.length ? R.fail : R.pass)('分解收益表六档齐全', { file: 'js/data.js', expected: wantEquip.join('/'), actual: missGain.length ? ('缺 ' + missGain.join('/')) : '齐' });

/* ③ 悬空引用：商店卖的东西 / 任务奖励 / 掉落表指向的 id 必须真的存在 */
const itemSet = new Set(itIds);
const charSet = new Set(cIds);
/* `SHOPS` 是**对象**（按 id 存），不是数组 —— 两种形状都收，免得审计自己先崩。 */
const SHOP_LIST = Array.isArray(D.SHOPS) ? D.SHOPS
  : Object.keys(D.SHOPS || {}).map((k) => Object.assign({ id: k }, D.SHOPS[k]));
const badRef = [];
SHOP_LIST.forEach((sh) => (sh.items || []).forEach((it) => {
  const id = it && (it.id || it.item);
  if (id && !itemSet.has(id) && !charSet.has(id)) badRef.push('shops:' + (sh.id || '?') + ' → ' + id);
}));
(D.DAILY_TASKS || []).concat(D.WEEKLY_TASKS || []).forEach((tk) => {
  const rw = tk.reward || {};
  [].concat(rw.item || []).forEach((id) => { if (id && !itemSet.has(id)) badRef.push('task:' + tk.id + ' → ' + id); });
});
[].concat((D.DAILY_ALL_REWARD || {}).item || [], (D.WEEKLY_ALL_REWARD || {}).item || []).forEach((id) => {
  if (id && !itemSet.has(id)) badRef.push('task-all → ' + id);
});
(D.ACHIEVEMENTS || []).forEach((a) => {
  [].concat((a.reward || {}).item || []).forEach((id) => { if (id && !itemSet.has(id)) badRef.push('ach:' + a.id + ' → ' + id); });
});
(badRef.length ? R.fail : R.pass)('没有悬空引用（商店 / 任务 / 成就给的 id 都真的存在）', {
  file: 'js/data.js', expected: '0 条悬空', actual: badRef.length ? (badRef.length + ' 条：' + badRef.slice(0, 6).join(' , ')) : '0 条',
});

/* ④ 概率表：出率表各项必须在 [0,1]，且**同池之和为 1**（项目里只有"卡池出率"是这种表） */
const badProb = [];
Object.keys(D.RECRUIT_POOLS || {}).forEach((k) => {
  const p = D.RECRUIT_POOLS[k];
  const rates = p.rates || {};
  let sum = 0;
  Object.keys(rates).forEach((r) => {
    const v = rates[r];
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1) badProb.push(k + '.' + r + '=' + v);
    else sum += v;
  });
  if (Math.abs(sum - 1) > 0.001) badProb.push(k + ' 出率和=' + sum.toFixed(4));
});
(badProb.length ? R.fail : R.pass)('卡池出率表：每项在 [0,1] 且同池和为 1', {
  file: 'js/data.js', line: lineOf('js/data.js', 'const RECRUIT_POOLS'), expected: '和=1', actual: badProb.length ? badProb.join(' , ') : (Object.keys(D.RECRUIT_POOLS).length + ' 个池子都对'),
});
/* 掉落：只查"数值是 0~1 的数"这一条（项目里掉落权重表不是归一表，不做 =1 的误判） */
const badDrop = [];
(D.WORLDS || []).forEach((w) => {
  [].concat(w.drop || []).forEach((d) => {
    if (d && typeof d.p === 'number' && (d.p < 0 || d.p > 1)) badDrop.push(w.id + ':' + d.p);
  });
});
(badDrop.length ? R.fail : R.pass)('世界掉落概率都在 [0,1]（权重表不按 =1 判）', {
  file: 'js/data.js', expected: '0≤p≤1', actual: badDrop.length ? badDrop.join(',') : '干净',
});

/* ⑤ 价格 / 奖励里的非法数（NaN / 负数） */
const badNum = [];
SHOP_LIST.forEach((sh) => (sh.items || []).forEach((it) => {
  [].concat(it.price || it.cost || []).forEach((v, i) => {
    const n = typeof v === 'object' ? v.n : v;
    if (n !== undefined && (typeof n !== 'number' || !isFinite(n) || n < 0)) badNum.push('shops:' + (sh.id || '?') + '#' + i + '=' + n);
  });
}));
(badNum.length ? R.fail : R.pass)('商店价格没有非法数（负数 / NaN / 非数字）', {
  file: 'js/data.js', expected: '全部 ≥0 的有限数', actual: badNum.length ? badNum.slice(0, 6).join(',') : '干净',
});

/* ⑥ 阶梯成本必须**单调递增**（R1.4 数值轮新增；起因＝父亲大人 §十 抓到的
      「铭刻 5 阶 131250 → 6 阶 10500，高阶突然便宜 92%」）。
   这条按"类型"判，不按个例判：凡"第 N 阶 / 第 N 级"的**单步成本**，一律不许后一阶比前一阶便宜。
   早期允许有明显台阶（所以用"≥ 前一阶"，不是要求等差/等比）。 */
{
  const lines = [];
  const push = (name, arr, pick) => {
    const vs = (arr || []).map(pick).map((v) => (typeof v === 'number' ? v : null));
    if (vs.length >= 2 && vs.every((v) => v !== null)) lines.push({ name, vs });
  };
  push('铭刻 ◆', D.GENE_LOCKS, (g) => g.cost && g.cost.otherworld);
  push('铭刻 铭魂砂', D.GENE_LOCKS, (g) => g.matN);
  push('灯阁权限 ✦', Array.from({ length: D.AUTHORITY_MAX || 0 }, (_, lv) => (D.authorityCost ? (D.authorityCost(lv) || {}).holy : null)), (v) => v);
  push('命格 ◆（0→50）', Array.from({ length: D.BLOODLINE_MAX || 0 }, (_, lv) => (D.bloodlineCost ? D.bloodlineCost(lv).otherworld : null)), (v) => v);
  push('坐骑喂养 ◉', Array.from({ length: (D.MOUNT_MAX_LV || 0) }, (_, lv) => (D.mountFeedCost && D.MOUNTS && D.MOUNTS[0] ? D.mountFeedCost(D.MOUNTS[0], lv) : null)), (v) => v);
  push('法宝祭炼', Array.from({ length: (D.FABAO_MAX_LV || 0) }, (_, lv) => (D.fabaoRefineCost && D.FABAO && D.FABAO[0] ? D.fabaoRefineCost(D.FABAO[0], lv) : null)), (v) => (typeof v === 'object' ? v.otherworld : v));
  const broken = [];
  lines.forEach((L) => {
    for (let i = 1; i < L.vs.length; i++) {
      if (L.vs[i] < L.vs[i - 1]) {
        broken.push(L.name + ' 第 ' + (i + 1) + ' 档 ' + L.vs[i] + ' < 上一档 ' + L.vs[i - 1]);
        break;
      }
    }
  });
  (broken.length ? R.fail : R.pass)('阶梯成本单调递增（单步成本不许越往后越便宜）', {
    file: 'js/data.js', expected: '每档 ≥ 上一档',
    actual: broken.length ? broken.join(' ; ') : lines.map((L) => L.name + '(' + L.vs.length + '档)').join(' · '),
  });
}

R.finish();
