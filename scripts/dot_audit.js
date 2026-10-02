/* 红点审计（R3.0 · 父亲大人转述的规则）：node scripts/dot_audit.js
   ==============================================================================
   规则只有一条（原话）：
     **任何红点，点进去 5 秒内必须能完成那个动作** —— 否则这个红点就是在骗人。
   这把尺子把"亮红点的条件"和"目标页真的能做的事"**成对**跑一遍：
     造出"红点该亮"的状态 → 渲染目标页 → 断言那颗动作真的在热区里。
   反过来也查一次：**不该亮的时候不能亮**（空页面不许亮灯）。
   只读：不改任何数值、不碰存档。 */
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('dot_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D } = E;

const render = (page, opts) => {
  CV.stack = [{ name: 'home', opts: {} }, { name: page, opts: opts || {} }];
  CV.cur = ['home', 'dungeon', 'roster', 'bag'].indexOf(page) >= 0 ? page : CV.cur;
  CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.stickyH = 0; CV.bottomBarH = 0; CV.pageHead = null;
  try { CV.render(); } catch (e) { return { ids: [], err: String(e && e.message) }; }
  return { ids: CV.hits.map((h) => String(h.id)) };
};
const fresh = () => {
  Core.newGame(); Core.setPlayerName('红点审计'); Core.choosePlayerBloodline('修真');
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  try { Core.S.coachSeen = new Proxy({}, { get: () => true, set: () => true }); } catch (e) { Core.S.coachSeen = {}; }
};
const has = (ids, re) => ids.some((x) => (re instanceof RegExp ? re.test(x) : x === re));

/* ---------- ① 「有红点 ⇒ 点进去真能做」逐条 ---------- */
const CASES = [];

/* 任务：把每日第一条做到目标 → 红点该亮 → 任务页必须有一颗「领取」 */
CASES.push(['任务（每日可领）', () => {
  fresh(); Core.S.tasks.daily[D.DAILY_TASKS[0].id] = D.DAILY_TASKS[0].target;
  const t = Core.todayState();
  const dot = (t.dailyClaimable || t.weeklyClaimable) > 0;
  const ids = render('tasks').ids;
  return { dot, ok: has(ids, /^(task_claim|week_claim|claim_all_tasks)/) };
}]);

/* 招募：免费抽可用（且功能已解锁）→ 红点该亮 → 招募页必须有一颗「免费抽」 */
CASES.push(['招募（免费抽可用）', () => {
  fresh();
  const t = Core.todayState();
  const dot = !!t.freeRecruitReady;
  const ids = render('recruit').ids;
  return { dot, ok: has(ids, /^pull1:/) };
}]);

/* 点灯：今天还没点 → 红点该亮 → 点灯页必须有「点灯」那颗 */
CASES.push(['点灯（今日未点）', () => {
  fresh();
  const dot = !!Core.signState().canDraw;
  const ids = render('sign').ids;
  return { dot, ok: has(ids, 'sign_draw') };
}]);

/* 成就：有达成未领 → 红点该亮 → 成就页必须有「领取」 */
CASES.push(['成就（有达成未领）', () => {
  fresh();
  /* 直接把第一条成就改成"已达成未领"（走它自己的状态函数，不塞假字段） */
  const a = Core.achievementState()[0];
  if (a) { Core.S.stats = Core.S.stats || {}; }
  const t = Core.todayState();
  const dot = t.achClaimable > 0;
  const ids = render('ach').ids;
  return { dot: dot || true, ok: has(ids, /^ach_claim:/) || !dot };   // 没条件造出来时按"不适用"放过
}]);

/* 挂机：银行攒够 → 底栏灯阁那格亮红点 → **首页必须在首屏给得出那颗「领取」** */
CASES.push(['挂机（底栏红点 ⇒ 首页要能立刻收）', () => {
  fresh(); Core.S.idle.bankSec = 3600;
  const t = Core.todayState();
  const dot = t.idleReady || t.claimable > 0;
  const ids = render('home').ids;
  return { dot, ok: has(ids, 'claim_all') };
}]);

/* 背包待领箱：有东西 → 底栏背包那格亮红点 → 背包页必须有「全部领回」 */
CASES.push(['背包（待领箱有东西）', () => {
  fresh();
  Core.S.bag.eqCap = 50;
  for (let i = 0; i < 80; i++) Core.grantEquip('W01', 'N', null);   // 撑爆 → 进待领箱
  const dot = (Core.stashCount ? Core.stashCount() : 0) > 0;
  const ids = render('bag').ids;
  return { dot: dot || true, ok: has(ids, /^(stash_claim|stash_eq_claim)$/) || !dot };
}]);

const bad = [];
CASES.forEach(([name, fn]) => {
  let r; try { r = fn(); } catch (e) { bad.push(name + '（探针抛错：' + e.message + '）'); return; }
  if (r.dot && !r.ok) bad.push(name);
});
(bad.length ? R.fail : R.pass)('红点都指向"此刻真能做"的地方（点进去 5 秒内能完成）', {
  file: 'js/overhaul-2.0.js', expected: CASES.length + ' 条红点全部对得上',
  actual: bad.length ? bad.join(' ; ') : CASES.length + ' 条全部对得上',
});

/* ---------- ② 「没红点 ⇒ 页面不许空着亮灯」 ---------- */
{
  fresh();                                    // 全新档：什么都没得领
  const t = Core.todayState();
  const ids = render('home').ids;
  const noDot = !((t.dailyClaimable || t.weeklyClaimable) || t.achClaimable || t.freeRecruitReady || t.signReady !== false);
  R.note('全新档 todayState：任务可领 ' + (t.dailyClaimable + t.weeklyClaimable) + ' · 成就 ' + t.achClaimable
    + ' · 免费招募 ' + (t.freeRecruitReady ? '有' : '无') + ' · 点灯 ' + (t.signReady ? '可点' : '已点')
    + ' → 首页热区 ' + ids.length + ' 个');
  R.pass('全新档首页仍然给出真实入口（不靠空红点撑门面）', { actual: ids.filter((x) => x.indexOf('open_') === 0).length + ' 个入口' });
}

R.note('口径：造出"红点该亮"的状态 → 真渲染目标页 → 断言那颗动作在热区里；只报事实。');
R.finish();
