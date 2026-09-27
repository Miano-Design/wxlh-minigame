/* 数据体检 + 老档兼容体检：node scripts/data_audit.js

   起因（V9.5.72 父亲大人：「你再进行最终的自审自查，确保没有遗漏」）：
   前面几道体检分别管数值曲线（balance / cap）、界面（product）、文案（copy），
   但有两块一直没人管：
     ① **数据本身的健全性**——主键有没有重复、价格是不是正数、曲线是不是单调不减；
     ② **老档兼容**——连着改了好几版结构（技能 1 基→0 基、探索消耗品下架、等级从 0 起、
        建筑/评级起点变化），老存档读进来会不会缺字段、会不会崩、会不会丢东西。

   只读，不碰真实存档（用内存里的 localStorage 桩）。 */
/* V9.6.109（尺子自审）：压测名单里对不上核心层的名字，收集起来在结尾一并报出来 */
const UNRESOLVED = [];
const fs = require('fs');
const store = {};
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
function El(tag) {
  const el = {
    tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html || ''; },
    textContent: '', value: '', disabled: false, scrollTop: 0, scrollHeight: 0, offsetWidth: 0,
    appendChild(c) { this.children.push(c); return c; }, remove() {},
    querySelector(sel) { this._qs = this._qs || {}; return this._qs[sel] || (this._qs[sel] = El('stub:' + sel)); },
    querySelectorAll() { return []; }, addEventListener() {}, focus() {}, click() {},
    get firstChild() { return this.children[0] || null; },
  };
  return el;
}
const byId = {};
global.document = {
  readyState: 'complete',
  getElementById(id) { return byId[id] || (byId[id] = El('div#' + id)); },
  createElement(t) { return El(t); },
  addEventListener() {}, querySelector: () => null, hidden: false, elementFromPoint: () => null,
};
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, UI = window.UI;

let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

/* ================= ① 主键唯一 ================= */
console.log('=== ① 数据表主键唯一 ===');
const TABLES = {
  ITEMS: Object.keys(D.ITEMS),
  ACHIEVEMENTS: D.ACHIEVEMENTS.map(x => x.id),
  WORLDS: D.WORLDS.map(x => x.id),
  MAIN_QUESTS: D.MAIN_QUESTS.map(x => x.id),
  DAILY_TASKS: D.DAILY_TASKS.map(x => x.id),
  WEEKLY_TASKS: D.WEEKLY_TASKS.map(x => x.id),
  KEJI: D.KEJI.map(x => x.id),
  BEASTS: D.BEASTS.map(x => x.id),
  FABAO: D.FABAO.map(x => x.id),
  MOUNTS: D.MOUNTS.map(x => x.id),
  SERUMS: D.SERUMS.map(x => x.id),
  TRAVELS: D.TRAVELS.map(x => x.id),
  GUIDE_CHAPTERS: D.GUIDE_CHAPTERS.map(x => x.id),
  UNLOCKS: D.UNLOCKS.map(x => x.id),
  CURRENCIES: D.CURRENCIES.map(x => x.id),
  BUILDINGS: D.BUILDINGS.map(x => x.id),
};
let dupAll = 0;
Object.entries(TABLES).forEach(([name, ids]) => {
  const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  if (dup.length) { fail(`${name} 主键重复：${dup.join(' ')}`); dupAll++; }
});
if (!dupAll) ok(`${Object.keys(TABLES).length} 张表主键都唯一`);
{
  const chars = Object.keys(D.charById);
  if (chars.length < 100) fail(`角色表只有 ${chars.length} 名（图鉴应该上百）`);
  else ok(`角色表 ${chars.length} 名 · 六维 ${D.ATTR_META.length} 项`);
}

/* ================= ② 数值健全：正数 + 单调不减 ================= */
console.log('\n=== ② 数值健全（价格为正、曲线单调不减）===');
function positive(name, list) {
  const badv = list.filter(([, v]) => !(v > 0)).map(([k]) => k);
  if (badv.length) fail(`${name} 里有非正数：${badv.slice(0, 5).join(' ')}`);
}
function nondecreasing(name, list) {
  for (let i = 1; i < list.length; i++) {
    if (list[i][1] < list[i - 1][1]) { fail(`${name} 曲线在「${list[i][0]}」掉了：${list[i - 1][1]} → ${list[i][1]}`); return; }
  }
}
positive('经验表', D.EXP_TABLE.map((v, i) => ['Lv.' + i, v]));
positive('伙伴升级点数', D.LEVEL_POINTS.map((v, i) => ['Lv.' + i, v]));
nondecreasing('经验表', D.EXP_TABLE.map((v, i) => ['Lv.' + i, v]));
nondecreasing('伙伴升级点数', D.LEVEL_POINTS.map((v, i) => ['Lv.' + i, v]));
nondecreasing('建筑（灯芯）', Array.from({ length: 50 }, (_, i) => ['Lv.' + i, D.buildingCost('core', i)]));
nondecreasing('血统', Array.from({ length: D.BLOODLINE_MAX }, (_, i) => ['Lv.' + i, D.bloodlineCost(i).points]));
nondecreasing('境界', D.REALMS.map((r, i) => ['第' + i + '阶', r.cost.points]));
nondecreasing('评级', Array.from({ length: D.SECT_MAX }, (_, i) => ['Lv.' + i, D.sectExpNeed(i)]));
nondecreasing('秘术阁（攻伐诀）', Array.from({ length: D.KEJI[0].max }, (_, i) => ['Lv.' + i, D.kejiCost(D.KEJI[0], i + 1)]));
positive('灯阁权限', Array.from({ length: D.AUTHORITY_MAX }, (_, i) => ['Lv.' + (i + 1), D.authorityCost(i).holy]));
positive('法宝价', D.FABAO.map(f => [f.id, f.cost]));
positive('血清价', D.SERUMS.map(s => [s.id, s.points]));
positive('坐骑价', D.MOUNTS.map(m => [m.id, (m.cost && m.cost.points) || 0]));
if (D.EXP_TABLE.length !== D.PLAYER_MAX_LV || D.LEVEL_POINTS.length !== D.PLAYER_MAX_LV) {
  fail(`经验表长度 ${D.EXP_TABLE.length} / 点数表 ${D.LEVEL_POINTS.length} ≠ 等级上限 ${D.PLAYER_MAX_LV}`);
}
Object.entries(D.SHOPS).forEach(([sid, shop]) => {
  if (!D.CURRENCIES.some(c => c.id === shop.currency)) fail(`商店 ${sid} 的结算货币「${shop.currency}」不存在`);
  shop.items.forEach((it, i) => {
    if (!(it.price > 0)) fail(`${shop.name} 第 ${i + 1} 件「${it.name}」价格非正数`);
    if (it.item && !D.ITEMS[it.item]) fail(`${shop.name} 卖的道具「${it.item}」不存在`);
    if (it.currencyGain) Object.keys(it.currencyGain).forEach(k => { if (!D.CURRENCIES.some(c => c.id === k)) fail(`${shop.name} 兑换的货币「${k}」不存在`); });
    if (it.shardRandom && !['N', 'R', 'SR', 'SSR', 'UR'].includes(it.shardRandom)) fail(`${shop.name} 的碎片稀有度「${it.shardRandom}」不合法`);
  });
});
ok('商店价钱 / 货币 / 商品 id 全部有效');
/* 招募经济的两条规则（V9.5.75 父亲大人定的）：
   ① **招募券不上架**——券是"白抽一次"的奖励，只能用钱买的话就失去意义了；
      顺带也彻底消灭了"券价 vs 单抽价"这类比价问题（V9.5.74 就是靠它抓出两处倒挂）。
   ② 十连不能比 10 次单抽还贵。 */
{
  let inv = 0;
  const ticketIds = Object.values(D.RECRUIT_POOLS).map(p => p.ticket);
  Object.entries(D.SHOPS).forEach(([sid, shop]) => {
    shop.items.forEach(it => {
      if (ticketIds.includes(it.item)) { fail(`${shop.name} 还在卖招募券「${it.item}」——券只能靠玩法获得`); inv++; }
    });
  });
  Object.entries(D.RECRUIT_POOLS).forEach(([pid, pool]) => {
    const cur = Object.keys(pool.cost)[0];
    const single = pool.cost[cur], ten = pool.ten[cur];
    if (ten && single && ten > single * 10) { fail(`${pool.name} 的十连 ${ten} 比 10 次单抽 ${single * 10} 还贵`); inv++; }
  });
  if (!inv) ok('招募券不在任何商店里 · 十连 ≤ 10 次单抽');
}
function rewardSanity(label, r) {
  if (!r || typeof r !== 'object') return;
  Object.entries(r).forEach(([k, v]) => {
    if (typeof v === 'number' && !(v > 0)) fail(`${label} 奖励里的 ${k}=${v} 非正数`);
  });
}
D.MAIN_QUESTS.forEach(q => rewardSanity('主线 ' + q.id, q.reward));
D.DAILY_TASKS.forEach(t => rewardSanity('日常 ' + t.id, t.reward));
D.WEEKLY_TASKS.forEach(t => rewardSanity('周常 ' + t.id, t.reward));
D.ACHIEVEMENTS.forEach(a => rewardSanity('成就 ' + a.id, a.reward));
D.TRAVELS.forEach(t => rewardSanity('奇遇 ' + t.id, t.effect));
ok('任务 / 成就 / 奇遇的奖励没有负数或零');

/* 极端值健壮性：深井 / 斗法台是"无上限"的，层数很大时公式不能溢出成 Infinity / NaN */
console.log('\n=== ②b 极端值健壮性（无上限系统不会算出 Infinity / NaN）===');
{
  let ext = 0;
  const finite = (label, obj) => {
    Object.entries(obj).forEach(([k, v]) => {
      if (typeof v === 'number' && !Number.isFinite(v)) { fail(`${label} 的 ${k} = ${v}`); ext++; }
    });
  };
  [50, 100, 200, 500, 1000].forEach(f => finite('深井第 ' + f + ' 层敌人', D.corridorEnemy(f)));
  [10, 50, 100, 500, 1000].forEach(f => finite('斗法台第 ' + f + ' 台守擂者', D.arenaEnemy(f, 500000)[0]));
  finite('深井第 999 层奖励', D.corridorReward(999));
  finite('评级 Lv.59 需求', { need: D.sectExpNeed(59) });
  finite('境界最终阶', D.REALMS[D.REALMS.length - 1].cost);
  finite('建筑 49 级价', { p: D.buildingCost('core', 49) });
  finite('血统 29 级价', D.bloodlineCost(29));
  finite('秘术阁 60 级价', { p: D.kejiCost(D.KEJI[0], 60) });
  if (!ext) ok('深井 1000 层 / 斗法台 1000 台 / 各线满级前一级：全部是有限数');
}

/* ---- ②c 每种货币都要有"来源"和"去处"（V9.5.76 自审新增）----
   起因：招募券从商店下架之后，异界结晶 / 深井徽记各少了两个出口；
   这类改动最容易出现的结果是"某种货币只进不出"（攒着没用）或"只出不进"（永远缺）。
   这里把两边的出口都数一遍，任何一边为 0 就报。 */
console.log('\n=== ②c 货币的来源与去处（不能只进不出 / 只出不进）===');
{
  const sinks = {}, srcs = {};
  const add = (o, k, n) => { if (k) o[k] = (o[k] || 0) + (n || 1); };
  // 去处：商店结算 + 各条养成线的消耗 + 少数写死在代码里的（强化 / 背包扩容 / 技能芯片）
  Object.values(D.SHOPS).forEach(s => add(sinks, s.currency, 3));
  Object.values(D.RECRUIT_POOLS).forEach(p => Object.keys(p.cost).forEach(k => add(sinks, k)));
  Object.values(D.BUILDINGS).forEach(() => add(sinks, 'points'));
  for (let i = 0; i < D.AUTHORITY_MAX; i++) Object.keys(D.authorityCost(i)).forEach(k => add(sinks, k));
  D.KEJI.forEach(() => add(sinks, D.KEJI_COIN));
  D.FABAO.forEach(() => add(sinks, 'otherworld'));
  D.MOUNTS.forEach(m => Object.keys(m.cost || {}).forEach(k => add(sinks, k)));
  for (let lv = 0; lv < D.BLOODLINE_MAX; lv++) Object.keys(D.bloodlineCost(lv)).forEach(k => add(sinks, k));
  D.REALMS.forEach(r => Object.keys(r.cost).forEach(k => add(sinks, k)));
  D.GENE_LOCKS.forEach(g => Object.keys(g.cost).forEach(k => add(sinks, k)));
  D.TALENT_COSTS.forEach(() => add(sinks, 'rp'));
  D.SERUMS.forEach(() => add(sinks, 'points'));
  D.GARDEN.forEach(() => add(sinks, 'points'));
  add(sinks, 'points', 2);        // 装备强化 / 背包扩容
  add(sinks, 'otherworld', 1);    // 装备强化
  add(sinks, 'otherworld', 1);   // V9.6.134：技能芯片已并入异界结晶
  // 来源
  Object.values(D.LOGIN_REWARDS).forEach(r => Object.keys(r).forEach(k => add(srcs, k)));
  Object.values(D.DAILY_ALL_REWARD).forEach(k => add(srcs, k));
  Object.values(D.WEEKLY_ALL_REWARD).forEach(k => add(srcs, k));
  [D.MAIN_QUESTS, D.WEEKLY_TASKS, D.ACHIEVEMENTS].forEach(list => list.forEach(x => Object.keys(x.reward || {}).forEach(k => add(srcs, k))));
  D.TRAVELS.forEach(t => Object.keys(t.effect || {}).forEach(k => add(srcs, k)));
  ['points', 'otherworld'].forEach(k => add(srcs, k, 3));   // 挂机 + 副本 + 扫荡
  ['skillChip', 'bloodCrystal', 'corridor', 'holy'].forEach(k => add(srcs, k, 2));  // 副本 / 深井 / 斗法台 / 任务
  add(srcs, 'rp', 1);             // 转生
  let coinBad = 0;
  D.CURRENCIES.forEach(c => {
    const s = sinks[c.id] || 0, e = srcs[c.id] || 0;
    if (!s) { fail(`${c.icon}${c.name} 没有任何去处（只进不出）`); coinBad++; }
    if (!e) { fail(`${c.icon}${c.name} 没有任何来源（只出不进）`); coinBad++; }
  });
  if (!coinBad) ok(`8 种货币都有来源和去处（${D.CURRENCIES.map(c => c.name).join(' / ')}）`);
}

/* ================= ③ 老档兼容 ================= */
console.log('\n=== ③ 老档兼容（旧结构存档 → 迁移 → 渲染）===');
function makeOldSave() {
  Core.newGame();
  Core.setPlayerName('老档');
  Core.choosePlayerBloodline('修真');
  const S = Core.S;
  S.player.level = 42;
  S.player.attrPoints = 30;
  S.player.skillLv = [3, 3, 3];            // 旧口径：1 级是起点
  S.player.skillPoints = 12;
  S.items.heal_s = 4;                      // 已下架的探索消耗品（迁移时要退成点数）
  S.items.buff_muscle = 2;
  S.items.exp_m = 7;
  S.stash = [{ id: 'heal_x', n: 3 }];
  S.buildings = { core: 6, training: 5, medical: 4, workshop: 3, geneLab: 2 };
  S.sect = { lv: 9, exp: 120 };
  S.auth = 2;
  S.chars.C021 = { lv: 20, exp: 0, star: 2, shards: 15, skillLv: [4, 4, 4], bloodlineLv: 5 };
  S.chars.C022 = { lv: 8, exp: 0, star: 1, shards: 0, skillLv: [2, 1, 1], bloodlineLv: 2 };
  S.party = ['@player', 'C021', 'C022', null, null];
  S.beast.owned.B001 = { lv: 3, soul: 5 }; // 旧口径：1 基
  S.beast.active = 'B001';
  S.cur.points = 50000;
  ['skillZeroBased', 'charExp', 'travel', 'garden', 'arena'].forEach(k => { delete S[k]; });   // 老档没有这些新字段
  return JSON.parse(JSON.stringify(S));
}

store['wxlh_save_v5'] = JSON.stringify(makeOldSave());
const loaded = Core.load();
if (!loaded) fail('老档读不进来（load 返回 false）');
else {
  const S = Core.S;
  ok('老档读入成功（v5 结构不变，靠 migrate 补字段）');
  if (S.player.skillLv.join() !== '2,2,2') fail(`老档技能迁移不对：期望 2,2,2，实际 ${S.player.skillLv.join()}`);
  if (S.chars.C021.skillLv.join() !== '3,3,3') fail(`伙伴技能迁移不对：期望 3,3,3，实际 ${S.chars.C021.skillLv.join()}`);
  const refundExpect = 4 * 500 + 2 * 1500 + 3 * 9000;
  if (S.items.heal_s !== undefined || S.items.buff_muscle !== undefined) fail('已下架的消耗品还留在背包里');
  if (S.retiredRefund !== refundExpect) fail(`退款金额不对：期望 ${refundExpect}，实际 ${S.retiredRefund}`);
  if ((S.stash || []).length) fail('待领箱里还留着已下架的道具');
  /* 技能点规则换代（每 3 级 1 点 → 每级 1 点）也要给老档补齐：
     Lv.42 按新规则应有 42 点，已点掉 2+2+2 = 6 点 → 手上应该剩 36 点。
     不补的话，一个满级老档会因为"等级到顶再也拿不到点"而永远点不满技能。 */
  const expectPts = 42 - (2 + 2 + 2);
  if (S.player.skillPoints !== expectPts) fail(`老档技能点没按新规则补齐：期望 ${expectPts}，实际 ${S.player.skillPoints}`);
  ['charExp', 'travel', 'garden', 'arena', 'beast', 'sect', 'keji', 'sign', 'fabao', 'mount'].forEach(k => {
    if (S[k] === undefined || S[k] === null) fail(`老档缺字段没补：${k}`);
  });
  if (typeof S.charExp !== 'number') fail('charExp 没补成数字');
  const nums = { '主角等级': S.player.level, '属性点': S.player.attrPoints, '技能点': S.player.skillPoints, '点数': S.cur.points, '评级': S.sect.lv };
  Object.entries(nums).forEach(([k, v]) => { if (!Number.isFinite(v)) fail(`老档字段 ${k} = ${v}（不是有效数字）`); });
  ok(`迁移结果：技能 ${S.player.skillLv.join('/')} · 退回点数 ${S.retiredRefund} · 缺字段全部补齐`);
  /* V1.1.11（网页版归档）：这一段（还有下面按名字点屏幕函数那一段）遍历的都是**网页版界面层**。
     本地已删 → 整段跳过；老档能不能渲染由小游戏端的 `page_smoke` / `save_migrate_audit` /
     `tap_audit` 覆盖（它们跑的是真 canvas 管线，比这里"返回字符串有没有洞"更硬）。 */
  const P = (UI && UI._panels) || null;
  let renderBad = 0;
  if (!P) console.log('  ⏭ 老档渲染冒烟（原本遍历网页版屏表 · 网页版已归档）');
  (P ? Object.entries(P._screens) : []).forEach(([name, fn]) => {
    try {
      const html = fn();
      if (typeof html !== 'string' || !html.length) { fail(`老档渲染 ${name} 是空的`); renderBad++; return; }
      const hole = html.match(/undefined|NaN|\[object Object\]/);
      if (hole) { fail(`老档渲染 ${name} 出现 ${hole[0]}`); renderBad++; }
    } catch (e) { fail(`老档渲染 ${name} 抛异常：${e.message}`); renderBad++; }
  });
  ['protagonistDetail', 'charDetail', 'bagModal', 'realmModal', 'beastModal', 'geneLockModal'].forEach(k => {
    const fn = P && P[k];        // V1.1.11：网页版没了 → P 为 null，这一步直接跳过
    if (typeof fn !== 'function') return;
    try {
      const out = fn(k === 'charDetail' ? 'C021' : undefined);
      const html = typeof out === 'string' ? out : (out && out.innerHTML) || '';
      if (!html.length) { fail(`老档面板 ${k} 是空的`); renderBad++; }
      const hole = html.match(/undefined|NaN/);
      if (hole) { fail(`老档面板 ${k} 出现 ${hole[0]}`); renderBad++; }
    } catch (e) { fail(`老档面板 ${k} 抛异常：${e.message}`); renderBad++; }
  });
  if (!renderBad) ok('迁移后的老档：全部页面与面板都能渲染，没有 undefined / NaN');
  try { Core.save(); Core.load(); ok('迁移后可以正常保存 / 再次读档'); }
  catch (e) { fail('迁移后保存或再次读档失败：' + e.message); }
}

/* ================= ④ 新档渲染（对照组） ================= */
console.log('\n=== ④ 新档渲染（对照组）===');
Core.newGame(); Core.setPlayerName('新档'); Core.choosePlayerBloodline('修真');
/* V1.1.11（网页版归档）：这一段原来遍历**网页版界面层**的屏表（`UI._panels._screens`）做渲染冒烟。
   网页版本地已删 → 没有 `UI` 了。小游戏端对应的那件事由 `page_smoke` / `tap_audit` / `frame_audit`
   三把尺子在做（它们跑的是真正的 canvas 渲染管线），所以这里**整段跳过**、不再重复。 */
if (typeof UI !== 'undefined' && UI && UI._panels && UI._panels._screens) {
  let n = 0;
  Object.entries(UI._panels._screens).forEach(([name, fn]) => {
    try { const h = fn(); if (!h || /undefined|NaN/.test(h)) { fail(`新档渲染 ${name} 有洞`); n++; } }
    catch (e) { fail(`新档渲染 ${name} 抛异常：${e.message}`); n++; }
  });
  if (!n) ok('新档全部页面渲染正常');
} else {
  console.log('  ⏭ 新档渲染冒烟（原本遍历网页版屏表 · 网页版已归档）→ 由 page_smoke / tap_audit / frame_audit 覆盖');
}

/* ================= ⑤ 导出函数冒烟 =================
   起因（V9.5.77 自审）：测试只覆盖"我们想到要测"的路径，导出函数里那些没人调的角落
   （比如 addCharExp 收到异常参数）会一直藏着。这里把 Core 的**每个导出函数**都用
   几组常见参数真调一次：抛异常、或者返回值里出现 NaN / Infinity，都报出来。 */
console.log('\n=== ⑤ 导出函数冒烟（每个导出函数真调一次）===');
{
  /* V9.5.86（自审）：原来这 6 个函数是**直接跳过**的（它们要求具体对象参数，通用参数必然抛错），
     等于"冒烟"漏掉了 6 个出口——跳过就是没测。现在改成**喂真参数**：
     先造一件真装备 / 一个真建筑，再按它们的签名调，这样才真的覆盖到了。 */
  const SPECIAL_ARGS = {
    equipStats: c => [c.realEquip],
    equipScore: c => [c.realEquip],
    enhanceCost: c => [c.realEquip],
    enhanceMat: c => [c.realEquip],
    decomposeMany: c => [[c.realEquip.uid]],
    upgradeBuilding: () => ['core'],
  };
  const coreNames = Object.keys(Core).filter(k => typeof Core[k] === 'function');
  const throws = [], nans = [];
  coreNames.forEach(n => {
    Core.newGame(); Core.setPlayerName('冒烟'); Core.choosePlayerBloodline('修真');
    Core.addChar('C021');
    Core.grantEquip('W05', 'SR', 'weapon');
    const ctx = { realEquip: Core.S.equips[Object.keys(Core.S.equips)[0]] || { uid: 'x', name: 'x', rarity: 'R', slot: 'weapon', enhance: 0, base: {}, affixes: [], lock: false } };
    const argsets = [[], ['C021'], ['@player'], [1], ['W01', 'normal'], ['exp_s'], ['god'], [{}]];
    const argsetsFor = fn => (SPECIAL_ARGS[fn] ? [SPECIAL_ARGS[fn](ctx)] : argsets);
    let done = false;
    const list = argsetsFor(n);
    for (let i = 0; i < list.length && !done; i++) {
      const a = list[i];
      try {
        const r = Core[n].apply(null, a);
        done = true;
        const chk = (v, path) => { if (typeof v === 'number' && !Number.isFinite(v)) nans.push(`${n}(${JSON.stringify(a)}) 返回 ${path} = ${v}`); };
        chk(r, 'self');
        if (r && typeof r === 'object' && !Array.isArray(r)) Object.entries(r).forEach(([k, v]) => chk(v, k));
      } catch (e) {
        if (i === list.length - 1) throws.push(`${n}() → ${e.message}`);
      }
    }
  });
  if (throws.length) throws.forEach(x => fail('导出函数全部参数都抛异常：' + x));
  if (nans.length) nans.forEach(x => fail('导出函数返回 NaN / Infinity：' + x));
  if (!throws.length && !nans.length) ok(`${coreNames.length} 个导出函数：没有崩溃、没有 NaN`);
}

/* ================= ⑥ 边界参数压测 =================
   起因（V9.5.86 自审）：⑤ 只用了"正常参数"，但真正把存档写坏的往往是**异常参数**——
   0 / 负数 / NaN / Infinity / 1e15。这里给所有"吃数字"的核心函数喂一圈这些值，
   要求两件事：① 不抛异常；② 调用完之后存档里的关键数字仍然是有限数（没被写成 NaN）。 */
console.log('\n=== ⑥ 边界参数压测（0 / 负数 / NaN / Infinity / 1e15）===');
{
  const BADS = [0, -1, NaN, Infinity, -Infinity, 1e15, undefined, null, '', 'abc'];
  /* [函数名, 参数模板（用 % 占位那个坏值）]；% 只放数字，字符串参数单独用 '.' 表示"不存在的 id" */
  const CASES = [
    ['addCur', v => ['points', v]], ['addPlayerExp', v => [v]], ['addCharExp', v => [['C021'], v]],
    ['addSectExp', v => [v]], ['onlineTick', v => [v]], ['levelUp', v => ['C021', v]],
    ['skillUp', v => ['C021', v]], ['addItem', v => ['exp_s', v]], ['removeItem', v => ['exp_s', v]],
    ['allocateAttr', v => ['muscle', v]], ['allocateSkill', v => [v]], ['hatchBeast', v => [v]],
    ['craftSerum', v => ['sr_atk', v]], ['useExpItem', v => ['exp_s', v]], ['openBoxes', v => ['box_r', v]],
    ['addShards', v => ['C021', v]], ['starUp', v => ['C021']], ['rebornChar', v => ['C021']],
    ['buyBagCap', v => ['item']], ['setIdleLeader', v => ['cultivate', '.']], ['swapPartyMember', v => [1, '.']],
    ['buyFabao', v => ['.']], ['buyMount', v => ['.']], ['buyShopItem', v => ['god', v]],
    /* V9.6.109（尺子自审）：这里原来写的是 `addItemToStash` —— 核心层**没有这个函数**
       （真名 stashItem），而下面是"名字对不上就静默跳过"，于是这条压测一直是死的。 */
    ['decomposeMany', v => [[v]]], ['setPlayerName', v => [v]], ['stashItem', v => ['exp_s', v]],
  ];
  let crush = 0, poison = 0;
  CASES.forEach(([fn, mk]) => {
    if (typeof Core[fn] !== 'function') { UNRESOLVED.push(fn); return; }   // 名字对不上：**记下来**（见文件末尾）
    BADS.forEach(v => {
      Core.newGame(); Core.setPlayerName('压测'); Core.choosePlayerBloodline('修真');
      Core.addChar('C021'); Core.S.cur.points = 1000;
      try { Core[fn].apply(null, mk(v)); }
      catch (e) { crush++; console.log(`  ✗ ${fn}(${JSON.stringify(v)}) 抛异常：${e.message}`); return; }
      // 状态有没有被污染成 NaN / Infinity
      const poisoned = Object.entries(Core.S.cur).filter(([, x]) => typeof x === 'number' && !Number.isFinite(x));
      const lvBad = !Number.isFinite(Core.S.player.level) || !Number.isFinite(Core.S.player.exp);
      if (poisoned.length || lvBad) {
        poison++;
        console.log(`  ✗ ${fn}(${JSON.stringify(v)}) 把存档写成了非法数：` +
          poisoned.map(([k, x]) => k + '=' + x).join(' ') + (lvBad ? ` 等级=${Core.S.player.level} 经验=${Core.S.player.exp}` : ''));
      }
    });
  });
  if (!crush && !poison) console.log(`  ${CASES.length} 个核心函数 × ${BADS.length} 种坏参数：不崩、也不会把存档写成 NaN ✓`);
  else { bad += crush + poison; }
}

/* ================= ⑦ 战斗引擎异常编成 =================
   起因（V9.5.86 自审）：战斗是整个游戏的心脏，但之前只在"正常编成"下跑过。
   这里喂 11 种异常编成 × 5 种回合上限：空敌人 / 空我方 / 1 打 5 / 巨大数值 / 零属性 /
   负血 / NaN 属性 / 缺字段 / 没有技能 / 位置为空 …… 要求不崩、且帧里的数字都是有限数。 */
console.log('\n=== ⑦ 战斗引擎异常编成 ===');
{
  const Battle = window.Battle;
  const base = () => ({ name: '我方', kind: 'warrior', position: 'front', skills: D.PROTAGONIST.skills, skillLv: [0, 0, 0], maxHp: 1000, hp: 1000, atk: 100, def: 50, spd: 50, crit: 0, critDmg: 1.5, eva: 0, skillMult: 1 });
  const foe = () => ({ name: '敌方', kind: 'warrior', hp: 1000, atk: 100, def: 50, spd: 50 });
  const CASES = [
    ['空敌人', [], []], ['空我方', [base()], []], ['双方都空', [], []],
    ['1 打 5', [base()], [foe(), foe(), foe(), foe(), foe()]],
    ['5 打 1', [base(), base(), base(), base(), base()], [foe()]],
    ['巨大数值', [Object.assign(base(), { maxHp: 1e12, hp: 1e12, atk: 1e9 })], [Object.assign(foe(), { hp: 1e12, atk: 1e9 })]],
    ['零属性', [Object.assign(base(), { maxHp: 1, hp: 1, atk: 0, def: 0, spd: 0 })], [Object.assign(foe(), { hp: 1, atk: 0, def: 0, spd: 0 })]],
    ['负血', [Object.assign(base(), { hp: -5 })], [Object.assign(foe(), { hp: -5 })]],
    ['NaN 属性', [Object.assign(base(), { maxHp: NaN, hp: NaN, atk: NaN })], [Object.assign(foe(), { hp: NaN })]],
    ['缺字段', [{ name: '裸人' }], [{ name: '裸敌' }]],
    ['没有技能', [Object.assign(base(), { skills: null, skillLv: null })], [foe()]],
    ['位置为空', [Object.assign(base(), { position: null })], [foe()]],
  ];
  let fb = 0;
  CASES.forEach(([label, allies, enemies]) => {
    [0, -1, 1, 60, 999].forEach(mr => {
      let res;
      try { res = Battle.run({ allies, enemies, worldId: null, maxRounds: mr }); }
      catch (e) { fb++; console.log(`  ✗ ${label} maxRounds=${mr} 抛异常：${e.message}`); return; }
      if (!res || !Array.isArray(res.frames) || typeof res.win !== 'boolean') { fb++; console.log(`  ✗ ${label} maxRounds=${mr} 返回结构不对`); return; }
      // NaN 属性那条是"输入就带毒"：引擎不该崩，但帧里出现 NaN 属于**输入问题**，
      // 由存档层的 sanitizeSave 负责（装备 base 带 NaN 会被整件丢掉）——这里只查不崩。
      if (label === 'NaN 属性') return;
      const nan = res.frames.find(f => Object.values(f).some(v => typeof v === 'number' && !Number.isFinite(v)));
      if (nan) { fb++; console.log(`  ✗ ${label} maxRounds=${mr} 帧里出现非法数：${JSON.stringify(nan).slice(0, 100)}`); }
    });
  });
  if (!fb) console.log(`  ${CASES.length} 种异常编成 × 5 种回合上限：不崩、帧里没有 NaN ✓（NaN 属性那条由存档层拦截）`);
  else bad += fb;
}

/* ================= V1.1.9（续13 · 乙组）：道具 / 材料的稀有度（**只加展示字段**）=================
   依据＝报告 §十（52 件逐件分级表）＋ §10.3（只分级不改产出）。他拍板「2 认」。
   为什么这里必须有断言：`ITEMS[].rarity` **从 V9.2 起就被"装备箱"用着**（语义是"开出什么品质"），
   这一轮又给 47 件材料/道具加了同名字段 —— 一旦开箱那条路读错了对象，
   玩家点材料就会被当箱子开掉（而且不会报错）。所以要**钉死"box 之外读不到自己的 rarity"**。
   ⚠️ 合法值用 `EQUIP_RARITIES`（含 MYTH）；`RARITIES` 是**伙伴**那条五档表（没有 MYTH），别用错。 */
{
  let rb = 0;
  const ids = Object.keys(D.ITEMS);
  const noR = ids.filter(id => !(D.EQUIP_RARITIES || []).includes(D.ITEMS[id].rarity));
  if (noR.length) { rb++; console.log('  ✗ 这些道具没有合法 rarity：' + noR.join(' / ')); }
  else {
    const nMat = ids.filter(i => D.ITEMS[i].type === 'material').length;
    const nSerum = ids.filter(i => D.ITEMS[i].type === 'serum').length;
    const nBox = ids.filter(i => D.ITEMS[i].type === 'box').length;
    console.log(`  ${ids.length} 件道具/材料全部带合法 rarity（材料 ${nMat} · 血清 ${nSerum} · 箱 ${nBox}）✓`);
  }

  /* ② 静态：开箱函数**第一道闸**就是 `type !== 'box'`，且判定在读 rarity 之前。 */
  const coreSrc = fs.readFileSync('js/core.js', 'utf8');
  const openFn = coreSrc.slice(coreSrc.indexOf('function openBox('), coreSrc.indexOf('function openBoxes('));
  const iGuard = openFn.indexOf("item.type !== 'box'");
  const iRarity = openFn.indexOf('item.rarity');
  if (iGuard < 0 || (iRarity >= 0 && iGuard > iRarity)) {
    rb++; console.log("  ✗ 开箱逻辑没有「先判 type === 'box'」这道闸（或在读 rarity 之后才判）");
  } else {
    console.log("  静态：开箱逻辑第一道闸就是 `type !== 'box'` → 材料的 rarity 到不了那里 ✓");
  }

  /* ③ 动态：把**每一件非 box 道具**都真当箱子开一次 —— 必须全被挡住、一件装备都不发。 */
  Core.newGame(); Core.setPlayerName('稀有度');
  const leaked = [];
  ids.filter(id => D.ITEMS[id].type !== 'box').forEach((id) => {
    Core.S.items[id] = 3;
    const eq0 = Object.keys(Core.S.equips || {}).length;
    const cnt0 = Core.S.items[id];
    const r = Core.openBox(id);
    if (!r || r.ok || r.equip || r.sold) leaked.push(id + '(被当成箱子)');
    if (Object.keys(Core.S.equips || {}).length !== eq0) leaked.push(id + '(发了装备)');
    if (Core.S.items[id] !== cnt0) leaked.push(id + '(被扣掉了)');
  });
  if (leaked.length) { rb++; console.log('  ✗ 这些非 box 道具被开箱逻辑处理了：' + leaked.slice(0, 8).join(' / ')); }
  else console.log('  动态：把每件非 box 道具都当箱子开一次 —— 全部被挡、没发装备、也没扣掉它 ✓');
  if (rb) bad += rb;
}

/* ================= V1.1.13（0927-E）· 部位加权池的完整性 =================
   `AFFIX_WEIGHT_BY_SLOT` 是"重抽词条按部位抽"的唯一依据（总监 0927-D §3.4 表 C）。
   它有两个**不会自己报错**的坏法：① 键写错（`atkPct` 写成 `atk`）→ 那条词条权重悄悄变 1；
   ② 某个部位的整行漏掉几个词条 → 那几条只能靠兜底权重 1（等于没加权，而且看不出来）。
   所以这里按"表与池必须一一对齐"来断：**每个键都在池里、每个部位的权重表覆盖池子里的全部词条、
   六个部位一个不少、权重都是正数**。 */
{
  let wb = 0;
  const pool = Object.keys(D.AFFIX_POOL || {});
  const tbl = D.AFFIX_WEIGHT_BY_SLOT || {};
  const slots = Object.keys(D.EQUIP_SLOTS || {});
  const badKeys = [];
  const missing = [];
  Object.keys(tbl).forEach(slot => {
    Object.keys(tbl[slot]).forEach(k => { if (pool.indexOf(k) < 0) badKeys.push(slot + '.' + k); });
    pool.forEach(k => { if (typeof tbl[slot][k] !== 'number' || tbl[slot][k] <= 0) missing.push(slot + '.' + k); });
  });
  const noSlot = slots.filter(s => !tbl[s]);
  if (badKeys.length) { wb++; console.log('  ✗ 部位权重表里有**不在词条池**里的键：' + badKeys.slice(0, 6).join(' / ')); }
  if (missing.length) { wb++; console.log('  ✗ 这些部位没给词条权重（会落兜底 1，等于没加权）：' + missing.slice(0, 8).join(' / ')); }
  if (noSlot.length) { wb++; console.log('  ✗ 这些部位整行都没有权重表：' + noSlot.join(' / ')); }
  if (!wb) {
    const rows = Object.keys(tbl).map(s => s + ':' + pool.filter(k => tbl[s][k] >= 4).join('+') || s).join(' · ');
    console.log(`  部位加权池：${Object.keys(tbl).length} 个部位 × ${pool.length} 条词条全对齐、主权重(≥4)＝[${rows}] ✓`);
  }
  bad += wb;
}

/* ================= 2026-09-27（0927-G · 本命装备）· 专属装备的三条硬口径 =================
   父亲大人四条拍板：**专属词条 5 条 / 改绑第一 / 不要隐藏角色 / 每人一套本命**。
   ⚠️ 04:30 修正：「第一不要排除隐藏角色啊，都说隐藏角色也能正常抽出来咯，就没有隐藏角色这种概念」
     → 绑定口径改成**含全部角色**取 power 第一；"不要隐藏角色"从"不许绑"升级成**这个概念整个消失**。
   这三条都属于"表看起来对、其实错了也一样跑得通"的那一类，所以这里**现场重算**、不读表的自觉：
     ① 36 件（6 支血统 × 6 个部位）且**每件正好 5 条词条**（同档普通 UR 是 4 条）；
     ② 每件绑定的人 = **含全部角色、满级满星的 `Core.power` 第一名**（口径＝派单那条：
        `addChar → lv=PLAYER_MAX_LV · star=RARITY_MAXSTAR · bloodlineLv=BLOODLINE_MAX · skillLv=SKILL_MAX_BY_INDEX`）；
     ③ **"隐藏角色"这个概念已经不存在**：没有任何角色带 `hidden` 标记，且图鉴伙伴卷 ＝ 全体伙伴
        （原先被 `hidden` 挡在池外的 6 位 UR 现在可抽、可收 —— 光删标记不算，池子也要真的放人）。
   外加派单 §四 的验收口径：末期 W36 一件专属 ≈ 同档同部位普通 UR 的 **1.30~1.45×**、W01 **≥ 1.15×**
   （普通 UR 一侧按 2000 次采样取平均 —— 单抽一件会抖，尺子不能跟着抖）。
   做坏试验（必须能红，本单跑过、结果见回单）：换一位绑定 → ② 红；砍掉一条词条 → ① 红；
   给某个角色加回 `hidden: true`（或把伙伴卷滤掉一个人）→ ③ 红。 */
console.log('\n=== ⑨ 本命专属 36 件（2026-09-27 · 父亲大人四条）===');
{
  let sg = 0;
  const sigs = D.SIGNATURE_EQUIPS || [];
  const BL = D.BLOODLINE_KEYS || ['狼人', '修真', '绯红', '科技', '念动力', '泰坦'];
  const SL = D.SIGNATURE_SLOT_ORDER || ['weapon', 'head', 'armor', 'hands', 'legs', 'accessory'];
  const byBl = {}, bySlot = {};
  sigs.forEach(s => {
    const c = D.charById[s.charId] || {};
    byBl[c.bloodline] = (byBl[c.bloodline] || 0) + 1;
    bySlot[s.slot] = (bySlot[s.slot] || 0) + 1;
  });
  if (sigs.length !== 36) { console.log('  ✗ 本命专属不是 36 件（实为 ' + sigs.length + ' 件）'); sg++; }
  if (!BL.every(b => byBl[b] === 6)) { console.log('  ✗ 有血统没凑满 6 件：' + JSON.stringify(byBl)); sg++; }
  if (!SL.every(s => bySlot[s] === 6)) { console.log('  ✗ 有部位没凑满 6 件：' + JSON.stringify(bySlot)); sg++; }
  const badN = sigs.filter(s => !Array.isArray(s.affixes) || s.affixes.length !== 5);
  if (badN.length) { console.log('  ✗ 不是每件 5 条词条：' + badN.map(s => s.name + '(' + ((s.affixes || []).length) + '条)').join(' / ')); sg++; }
  if (new Set(sigs.map(s => s.name)).size !== sigs.length) { console.log('  ✗ 36 件里有重名'); sg++; }
  if (!sg) console.log('  ✓ 36 件（6 支血统 × 6 个部位）· 每件 5 条词条 · 名字不重名');

  /* ②③ 绑定：现场按"满级满星"重算每支血统的第一名（**含全部角色**，不排除任何人） */
  Core.newGame();
  D.characters.forEach(c => {
    Core.addChar(c.id);
    const s = Core.S.chars[c.id];
    s.lv = D.PLAYER_MAX_LV; s.star = D.RARITY_MAXSTAR[c.rarity];
    s.bloodlineLv = D.BLOODLINE_MAX; s.skillLv = D.SKILL_MAX_BY_INDEX.slice();
  });
  let bindBad = 0;
  BL.forEach(bl => {
    const rank = D.characters.filter(c => c.bloodline === bl)
      .map(c => ({ id: c.id, name: c.name, p: Core.power(c.id) }))
      .sort((a, b) => b.p - a.p);
    const top = rank[0];
    sigs.filter(s => (D.charById[s.charId] || {}).bloodline === bl).forEach(s => {
      if (s.charId !== top.id) {
        console.log('  ✗ ' + bl + '：' + s.name + ' 绑的是 ' + s.charId + '，公开第一应是 ' + top.id + ' ' + top.name + '（' + top.p + '）');
        bindBad++;
      }
    });
  });
  /* ③ "隐藏角色"这个概念必须整个消失：没人带标记 ＋ 图鉴/卡池都收全员 */
  const marked = D.characters.filter(c => c.hidden !== undefined);
  const codexChars = (D.CODEX_VOLUMES || []).filter(v => v.id === 'chars')[0];
  const codexN = codexChars ? codexChars.list().length : -1;
  if (marked.length) {
    console.log('  ✗ 还有 ' + marked.length + ' 个角色带 hidden 标记：' + marked.map(c => c.id).join(' / '));
    sg++;
  }
  if (codexN !== D.characters.length) {
    console.log('  ✗ 图鉴伙伴卷只收 ' + codexN + ' 人，角色表有 ' + D.characters.length + ' 人（有人被挡在池外）');
    sg++;
  }
  if (bindBad) sg++;
  if (!bindBad && !marked.length && codexN === D.characters.length) {
    console.log('  ✓ 六支血统绑的都是"**含全部角色**的 power 第一"（现场重算：'
      + BL.map(bl => bl + '→' + sigs.filter(s => (D.charById[s.charId] || {}).bloodline === bl)[0].charId).join(' · ') + '）');
    console.log('  ✓ "隐藏角色"这个概念已经不存在：' + D.characters.length + ' 人全可抽、图鉴伙伴卷也收全员');
  }

  /* ④ 数值口径（派单 §四）：W36 六部位全部 1.30~1.45，W01 全部 ≥1.15 */
  const avg = {};
  SL.forEach(sl => ['W01', 'W36'].forEach(w => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += Core.equipScore(D.makeEquip(w, sl, 'UR', 'q' + i, {}));
    avg[w + '|' + sl] = sum / 2000;
  }));
  let lo36 = 9, hi36 = 0, lo01 = 9, hi01 = 0;
  SL.forEach(sl => {
    sigs.forEach((s, i) => {
      if (s.slot !== sl) return;
      const r36 = Core.equipScore(D.makeSignatureEquip(i, 'm' + i, 'W36')) / avg['W36|' + sl];
      const r01 = Core.equipScore(D.makeSignatureEquip(i, 'n' + i, 'W01')) / avg['W01|' + sl];
      lo36 = Math.min(lo36, r36); hi36 = Math.max(hi36, r36);
      lo01 = Math.min(lo01, r01); hi01 = Math.max(hi01, r01);
    });
  });
  const in36 = lo36 >= 1.30 && hi36 <= 1.45;
  if (!in36) { console.log('  ✗ W36 倍率越界：' + lo36.toFixed(3) + '~' + hi36.toFixed(3) + '（要 1.30~1.45）'); sg++; }
  if (lo01 < 1.15) { console.log('  ✗ W01 倍率低于 1.15：' + lo01.toFixed(3)); sg++; }
  if (in36 && lo01 >= 1.15) {
    console.log('  ✓ 36 件的评分倍率：W36 ' + lo36.toFixed(3) + '~' + hi36.toFixed(3) + '（要 1.30~1.45）'
      + ' ｜ W01 ' + lo01.toFixed(3) + '~' + hi01.toFixed(3) + '（要 ≥1.15）');
  }
  bad += sg;
}

console.log(`\n结论：${bad === 0 ? '数据健全 + 老档兼容 + 导出函数健壮 + 边界参数安全 + 战斗引擎抗造 + 道具稀有度不串线 + 部位加权池对齐 + 本命专属口径对齐 ✓' : '有 ' + bad + ' 项要修'}`);
/* V9.6.109：**尺子自己过期**也要现形 —— 压测名单里对不上核心层的名字，一律列出来。
   （以前静默跳过，于是写错的函数名能躺很久，看着全绿其实少测一条。） */
if (UNRESOLVED.length) {
  console.log('  ⚠ 压测名单里有 ' + UNRESOLVED.length + ' 个名字在核心层找不到（尺子过期，请改名或删掉）：'
    + UNRESOLVED.join('、'));
  bad++;
}
process.exit(bad ? 1 : 0);
