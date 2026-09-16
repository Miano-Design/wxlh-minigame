/* 数据体检 + 老档兼容体检：node scripts/data_audit.js

   起因（V9.5.72 父亲大人：「你再进行最终的自审自查，确保没有遗漏」）：
   前面几道体检分别管数值曲线（balance / cap）、界面（product）、文案（copy），
   但有两块一直没人管：
     ① **数据本身的健全性**——主键有没有重复、价格是不是正数、曲线是不是单调不减；
     ② **老档兼容**——连着改了好几版结构（技能 1 基→0 基、探索消耗品下架、等级从 0 起、
        建筑/评级起点变化），老存档读进来会不会缺字段、会不会崩、会不会丢东西。

   只读，不碰真实存档（用内存里的 localStorage 桩）。 */
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
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js', 'js/main.js']) eval(fs.readFileSync(f, 'utf8'));
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
  add(sinks, 'skillChip', 1);     // 伙伴技能升级（core.js skillUp）
  // 来源
  Object.values(D.LOGIN_REWARDS).forEach(r => Object.keys(r).forEach(k => add(srcs, k)));
  Object.values(D.DAILY_ALL_REWARD).forEach(k => add(srcs, k));
  Object.values(D.WEEKLY_ALL_REWARD).forEach(k => add(srcs, k));
  [D.MAIN_QUESTS, D.WEEKLY_TASKS, D.ACHIEVEMENTS].forEach(list => list.forEach(x => Object.keys(x.reward || {}).forEach(k => add(srcs, k))));
  D.TRAVELS.forEach(t => Object.keys(t.effect || {}).forEach(k => add(srcs, k)));
  ['points', 'story', 'otherworld'].forEach(k => add(srcs, k, 3));   // 挂机 + 副本 + 扫荡
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
  const P = UI._panels;
  let renderBad = 0;
  Object.entries(P._screens).forEach(([name, fn]) => {
    try {
      const html = fn();
      if (typeof html !== 'string' || !html.length) { fail(`老档渲染 ${name} 是空的`); renderBad++; return; }
      const hole = html.match(/undefined|NaN|\[object Object\]/);
      if (hole) { fail(`老档渲染 ${name} 出现 ${hole[0]}`); renderBad++; }
    } catch (e) { fail(`老档渲染 ${name} 抛异常：${e.message}`); renderBad++; }
  });
  ['protagonistDetail', 'charDetail', 'bagModal', 'realmModal', 'beastModal', 'geneLockModal'].forEach(k => {
    const fn = P[k];
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
{
  let n = 0;
  Object.entries(UI._panels._screens).forEach(([name, fn]) => {
    try { const h = fn(); if (!h || /undefined|NaN/.test(h)) { fail(`新档渲染 ${name} 有洞`); n++; } }
    catch (e) { fail(`新档渲染 ${name} 抛异常：${e.message}`); n++; }
  });
  if (!n) ok('新档全部页面渲染正常');
}

/* ================= ⑤ 导出函数冒烟 =================
   起因（V9.5.77 自审）：测试只覆盖"我们想到要测"的路径，导出函数里那些没人调的角落
   （比如 addCharExp 收到异常参数）会一直藏着。这里把 Core 的**每个导出函数**都用
   几组常见参数真调一次：抛异常、或者返回值里出现 NaN / Infinity，都报出来。 */
console.log('\n=== ⑤ 导出函数冒烟（每个导出函数真调一次）===');
{
  /* 这几个函数天然要求"具体对象"参数（装备实例 / uid 数组 / 建筑 id），
     用通用参数调必然抛错，属于正常，不算问题。 */
  const NEEDS_OBJECT = ['equipStats', 'decomposeMany', 'equipScore', 'upgradeBuilding', 'enhanceCost', 'enhanceMat'];
  const coreNames = Object.keys(Core).filter(k => typeof Core[k] === 'function');
  const throws = [], nans = [];
  coreNames.forEach(n => {
    if (NEEDS_OBJECT.indexOf(n) >= 0) return;
    Core.newGame(); Core.setPlayerName('冒烟'); Core.choosePlayerBloodline('修真');
    const argsets = [[], ['C021'], ['@player'], [1], ['W01', 'normal'], ['exp_s'], ['god'], [{}]];
    let done = false;
    for (let i = 0; i < argsets.length && !done; i++) {
      const a = argsets[i];
      try {
        const r = Core[n].apply(null, a);
        done = true;
        const chk = (v, path) => { if (typeof v === 'number' && !Number.isFinite(v)) nans.push(`${n}(${JSON.stringify(a)}) 返回 ${path} = ${v}`); };
        chk(r, 'self');
        if (r && typeof r === 'object' && !Array.isArray(r)) Object.entries(r).forEach(([k, v]) => chk(v, k));
      } catch (e) {
        if (i === argsets.length - 1) throws.push(`${n}() → ${e.message}`);
      }
    }
  });
  if (throws.length) throws.forEach(x => fail('导出函数全部参数都抛异常：' + x));
  if (nans.length) nans.forEach(x => fail('导出函数返回 NaN / Infinity：' + x));
  if (!throws.length && !nans.length) ok(`${coreNames.length} 个导出函数：没有崩溃、没有 NaN`);
}

console.log(`\n结论：${bad === 0 ? '数据健全 + 老档兼容 + 导出函数健壮 ✓' : '有 ' + bad + ' 项要修'}`);
process.exit(bad ? 1 : 0);
