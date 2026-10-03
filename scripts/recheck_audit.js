/* 终版复检收口审计（2026-10-03）：node scripts/recheck_audit.js
   ==============================================================================
   这一把只量**复检点名的那七处**，别的一概不碰：
     P0-1 云同步客户端不许把 `code` 丢在 `readOwn()` 那一层
     P0-2 导入 / 读档槽 / 恢复备份必须是事务（迁移失败 = 一个字都不许改）
     P0-3 中段剧情只能有一个已读状态（`mid`），历史遗留的 `midstory` 要收敛掉
     P0-4 精英关判定不许漏传 worldId
     P1   战斗 session 隔离优先于 settledPanel 回放
     P1   `settledRun` 只能在 `settleRun` 成功之后才落账
     P1   老档夹具 A~E 再过一遍

   ⚠️ 哪些是**真跑**、哪些只是源码检查，逐条写在断言里（任务书要求分清楚）：
     · 真跑：P0-2 的两种事务、P0-3 的收敛与"会不会重播"、P0-4 的波次差异、
             P0-1 的云客户端 DB_ERROR 分支（把 wx.cloud 换成桩，走真 sync()）。
     · 源码检查（时序类，本地造不出真实竞态）：P1 的两条 —— 它们量的是
       "代码里那两句的先后", 这条由 settle_audit 的行为用例兜底。

   只读脚本：内存夹具 + 桩，不碰真存档、不写盘、不发网络请求。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('recheck_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { Core, D, G } = E;
const store = E.store;
const ROOT = E.ROOT, JS = E.JS;

const t = (item, ok, expected, actual) => {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
const readJs = (f) => fs.readFileSync(path.join(JS, f), 'utf8');
const codeOnly = (f) => strip(readJs(f));

Core.newGame(); Core.setPlayerName('复检'); Core.save();
const SAVE_KEY = Object.keys(store).filter((k) => /^wxlh_save_v\d+$/.test(k))[0];
const BAK_KEY = SAVE_KEY + '_bak';
let LOW_SEQ = 0;
const base = (extra) => Object.assign({
  v: 5, savedAt: 1700000000000,
  player: { level: 60, exp: 0, bestWorldIdx: 0, reincarnations: 0 },
  worlds: {}, worldFirstClear: {}, chars: {}, equips: {}, equipped: {}, items: {}, cur: {},
  bag: { itemCap: 50, matCap: 50, eqCap: 50, itemExpands: 0, matExpands: 0, eqExpands: 0 },
}, extra || {});
function through(n, stars) {
  const out = {};
  for (let i = 1; i <= n; i++) {
    out['W' + String(i).padStart(2, '0')] =
      { unlocked: true, stages: { normal: Array(12).fill(stars === undefined ? 3 : stars), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  }
  return out;
}
const load = (fx) => { store[SAVE_KEY] = JSON.stringify(fx); return Core.load(); };
/* 一份"看着正常、但 migrate 一定抛"的档：`altPlayers` 里塞 null。
   `fillDefaults` 对数组是**原样透传**的（`Array.isArray(def) ? data : …`），
   所以它过得了补默认值那一关，然后在 migrate 里 `p.attrs = …` 当场炸 ——
   正是我们要喂给事务那一支的东西。 */
function poison() {
  return Object.assign(base({ player: { level: 77, name: '坏档' } }), { altPlayers: [null] });
}
const rawMain = () => store[SAVE_KEY];
const snapS = () => JSON.stringify({ lv: Core.S.player.level, name: Core.S.player.name,
  worlds: Core.S.worlds, story: Core.S.story, cur: Core.S.cur });

/* ==========================================================================
   P0-1 · 云同步客户端不许把 `code` 丢在 readOwn 那层
   ========================================================================== */
{
  const src = codeOnly('sc-cloud.js');
  const readOwnBody = (src.match(/function readOwn\(\)[\s\S]{0,600}/) || [''])[0];
  t('P0-1【源码】`readOwn()` 的错误分支把云函数给的 code / stage / lease 原样带出去',
    /ok:\s*false[^}]*code:\s*r\.code/.test(readOwnBody),
    '错误分支里有 code: r.code', readOwnBody.match(/return \{[^}]*\}/) ? readOwnBody.match(/return \{[^}]*\}/)[0].trim() : '(没找到)');
  t('P0-1【源码】上层提示按 `code` 判类型，**不许**去匹配中文 msg',
    /code === 'DB_ERROR'/.test(src) && !/为什么[\s\S]{0,40}indexOf\('云端/.test(src),
    "NET_MSG 里有 code === 'DB_ERROR' 分支", /code === 'DB_ERROR'/.test(src) ? '有' : '**没有**');

  /* 真跑：把 wx.cloud 换成桩，让 cloudsave 回一个 DB_ERROR，走真的 sync()。
     判据是"客户端拿到的那句话里说得清不是没有存档"，并且**本机存档一个字没动**。 */
  const wx = global.wx;
  const hadCloud = wx.cloud;
  wx.cloud = { init() {}, callFunction() { return Promise.resolve({ result: { ok: false, code: 'DB_ERROR', msg: 'get_fail', stage: 'get', ver: 'test' } }); } };
  try { G.CloudSync._reset(); } catch (e) {}
  try { G.CloudSync.toggle(true); } catch (e) {}
  const beforeRaw = rawMain();
  const p = (typeof G.CloudSync.sync === 'function') ? G.CloudSync.sync('recheck') : null;
  Promise.resolve(p).then(function (r) {
    const msg = String((r && r.msg) || '');
    t('P0-1【真跑】DB_ERROR 不会被当成"没有云档"：给的是"读不到、别删档"那句',
      !!(r && r.ok === false) && /不是"没有存档"|不是「没有存档」|别删档/.test(msg),
      'ok:false 且提示里说清"不是没有存档"', JSON.stringify({ ok: r && r.ok, skip: r && r.skip, msg: msg }));
    t('P0-1【真跑】那一次失败没有动本机主档（没建新档、没覆盖）',
      rawMain() === beforeRaw, '主档原文不变', rawMain() === beforeRaw ? '没动' : '**被改了**');
    wx.cloud = hadCloud;
    /* 把桩留下的状态（busy / 重试计时器 / 偏好）清干净，别让后面的用例踩到它 */
    try { G.CloudSync._reset(); } catch (e) {}
    f2();
  });
}

/* ==========================================================================
   P0-2 · 事务：导入 / 读档槽 / 恢复备份
   ========================================================================== */
function f2() {
  /* —— importSave —— */
  load(base({ player: { level: 42, name: '现场' } }));
  store[SAVE_KEY] = rawMain();                       // 把现场落回主键（load 不改主键）
  const mainBefore = rawMain(), sBefore = snapS();
  const r1 = Core.importSave(JSON.stringify(poison()));
  t('P0-2【真跑】导入一份"迁移会抛"的档 → 返回失败', r1 && r1.ok === false && r1.msg,
    'ok:false + 一句人话', JSON.stringify(r1));
  t('P0-2【真跑】导入失败后**主档原文一个字没变**', rawMain() === mainBefore,
    '主档不变', rawMain() === mainBefore ? '没动' : '**被半迁移的档覆盖了**');
  t('P0-2【真跑】导入失败后**内存 S 整份回滚**（没有留下半迁移的档）', snapS() === sBefore,
    'S 与动手前一致', snapS() === sBefore ? '一致' : '**变了**');

  /* —— 读档槽 —— */
  load(base({ player: { level: 42, name: '现场' } }));
  store[SAVE_KEY] = rawMain();
  store['wxlh_slot_1'] = JSON.stringify(poison());
  const main2 = rawMain(), s2 = snapS();
  const ok2 = Core.loadSlot(1);
  t('P0-2【真跑】读一份"迁移会抛"的槽位 → 返回失败、主档与内存都不动',
    ok2 === false && rawMain() === main2 && snapS() === s2,
    'loadSlot=false · 主档与 S 都不变',
    'loadSlot=' + ok2 + ' · 主档' + (rawMain() === main2 ? '没动' : '**变了**') + ' · S' + (snapS() === s2 ? '没动' : '**变了**'));

  /* —— 恢复备份 —— */
  load(base({ player: { level: 42, name: '现场' } }));
  store[SAVE_KEY] = rawMain();
  const main3 = rawMain(), s3 = snapS(), issue3 = Core.loadIssue();
  store[BAK_KEY] = JSON.stringify({ at: 1, why: 'recheck', raw: JSON.stringify(poison()) });
  const r3 = Core.restoreFromBackup();
  t('P0-2【真跑】恢复一份"迁移会抛"的备份 → 返回失败、主档与内存都不动',
    r3 && r3.ok === false && rawMain() === main3 && snapS() === s3,
    'ok:false · 主档与 S 都不变',
    'ok=' + (r3 && r3.ok) + ' · 主档' + (rawMain() === main3 ? '没动' : '**变了**') + ' · S' + (snapS() === s3 ? '没动' : '**变了**'));
  t('P0-2【真跑】恢复失败后 `lastLoadIssue` 没有被无条件清空',
    JSON.stringify(Core.loadIssue()) === JSON.stringify(issue3),
    '诊断记录保持动手前那一份', JSON.stringify(Core.loadIssue()));
  /* 成功那条路照旧：正常备份能恢复，并且 issue 会被清掉 */
  const good = base({ player: { level: 55, name: '备份那份' } });
  store[BAK_KEY] = JSON.stringify({ at: 2, why: 'recheck', raw: JSON.stringify(good) });
  const r4 = Core.restoreFromBackup();
  t('P0-2【真跑】正常备份照旧能恢复（事务没有把好路也堵上）',
    r4 && r4.ok === true && Core.S.player.name === '备份那份',
    'ok:true 且换成了备份那份', 'ok=' + (r4 && r4.ok) + ' · name=' + Core.S.player.name);

  f3();
}

/* ==========================================================================
   P0-3 · 中段剧情只有一个已读状态
   ========================================================================== */
function f3() {
  /* 收敛：历史遗留的 midstory 要被折成 mid 并删掉 */
  load(base({ player: { level: 30, bestWorldIdx: 0, reincarnations: 0 },
    worlds: { W01: { unlocked: true, stages: { normal: [3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0], hard: Array(12).fill(0), hell: Array(12).fill(0) } } },
    story: { w: { W01: { in: 1, midstory: 1 } }, b: {}, c: {}, i: {}, choice: 0 } }));
  const w1 = (Core.S.story.w || {}).W01 || {};
  t('P0-3【真跑】历史遗留的 `midstory` 被收敛成 `mid`，旧键删掉',
    w1.mid === 1 && w1.midstory === undefined,
    'mid=1 · midstory 不存在', JSON.stringify(w1));
  /* 幂等：存盘再读一次还是同一个结果 */
  Core.save(); const snapA = JSON.stringify(Core.S.story.w.W01);
  Core.load();
  t('P0-3【真跑】收敛只做一次、且幂等（再读一遍结果逐字相同）',
    JSON.stringify(Core.S.story.w.W01) === snapA,
    '两次结果一致', JSON.stringify(Core.S.story.w.W01));

  /* 老玩家：第 6 关打过 → 不再自动播中段；新玩家：没打过 → 会播 */
  const St = G.Story;
  const seenByOld = St.seen('W01', 'mid');
  const wouldOld = seenByOld ? false : true;                 // openInterlude 的判据就是 seen(mid)
  t('P0-3【真跑】老玩家（第 6 关已打过）不会再被强制播中段剧情',
    seenByOld === true && wouldOld === false,
    'seen(W01,"mid")=true ⇒ openInterlude 直接返回 false',
    'seen(mid)=' + seenByOld);
  load(base({ player: { level: 1, bestWorldIdx: 0, reincarnations: 0 } }));
  t('P0-3【真跑】新玩家第一次打到第 6 关：中段剧情仍是"没看过"（会播）',
    G.Story.seen('W01', 'mid') === false,
    'seen(W01,"mid")=false', 'seen(mid)=' + G.Story.seen('W01', 'mid'));

  /* 源码：不许再有第二套已读状态被写 */
  const bad = [];
  ['sc-story.js', 'sc-dungeon.js', 'sc-story-battle.js'].forEach((f) => {
    const s = codeOnly(f);
    if (/seen\([^)]*'midstory'/.test(s)) bad.push(f + ':seen');
    if (/markSeen\([^)]*'midstory'/.test(s)) bad.push(f + ':markSeen');
    if (/part:\s*'midstory'/.test(s)) bad.push(f + ':part');
  });
  t('P0-3【源码】全项目不再往 `midstory` 写已读状态（`midstory` 只剩内容字段 / 函数名）',
    bad.length === 0, '0 处', bad.join(' ; ') || '0 处');
  t('P0-3【源码】`openInterlude` 用 `mid` 判定、`part` 也写 `mid`',
    /if \(Story\.seen\(worldId, 'mid'\)\) return false;/.test(codeOnly('sc-story.js'))
      && /part:'mid'/.test(codeOnly('sc-story.js')),
    "seen(worldId,'mid') + part:'mid'", '见源码');

  f4();
}

/* ==========================================================================
   P0-4 · 精英关判定必须带 worldId
   ========================================================================== */
function f4() {
  const dsrc = codeOnly('sc-dungeon.js');
  const calls = dsrc.match(/Dun\.wavePlan\(i \+ 1[^)]*\)/g) || [];
  t('P0-4【源码】两处 `wavePlan(i+1, …)` 都带了世界号（角标一处、战前剧情一处）',
    calls.length >= 2 && calls.every((c) => /,\s*(w\.id|view\.worldId)/.test(c)),
    '2 处都带世界号', calls.join(' / ') || '(没找到)');
  /* 真跑：证明"漏传世界号"真的会判错 —— 同一关号在不同世界波次方案不同 */
  const diff = [];
  D.WORLDS.forEach((w, wi) => {
    for (let i = 1; i <= 12; i++) {
      const a = G.Dungeon.wavePlan(i, w.id).join(',');
      const b = G.Dungeon.wavePlan(i).join(',');
      if (a !== b) diff.push(w.id + ' 第' + i + '关: 带世界=' + a + ' / 不带=' + b);
    }
  });
  t('P0-4【真跑】确实存在"漏传世界号就判错"的关卡（证明这条修的是真问题，不是文字游戏）',
    diff.length > 0, '至少 1 处不同', diff.slice(0, 3).join(' ; ') || '**没有差异 → 这条修得没意义**');
  t('P0-4【真跑】第 6 关自动剧情那处判据与 `startStage` 用的是同一套波次方案',
    /Dun\.wavePlan\(i \+ 1, view\.worldId\)/.test(codeOnly('sc-dungeon.js'))
      && /Dun\.wavePlan\(stage, worldId\)/.test(codeOnly('sc-dungeon.js')),
    '两处都按 (stage, worldId) 算', '见源码');

  f5();
}

/* ==========================================================================
   P1 · 战斗 session：隔离顺序 + 凭据落账时机（源码检查；行为由 settle_audit 兜）
   ========================================================================== */
function f5() {
  const src = codeOnly('sc-dungeon.js');
  const iStale = src.indexOf('run.session !== mySession');
  const iReplay = src.indexOf('settledRun && settledRun === myRun');
  t('P1【源码】session 隔离**排在** settledPanel 回放之前（先看是不是当前那一场）',
    iStale > 0 && iReplay > 0 && iStale < iReplay,
    'stale 判定在前、回放在后', 'stale@' + iStale + ' · replay@' + iReplay);
  const iPanel = src.indexOf('settledPanel = panel');
  const iMark = src.indexOf('settledRun = myRun');
  t('P1【源码】`settledPanel` 赋值排在 `settledRun = myRun` **之前**（失败不留假标记）',
    iPanel > 0 && iMark > 0 && iPanel < iMark,
    '先写面板、再落"已结算"的账', 'panel@' + iPanel + ' · mark@' + iMark);
  t('P1【源码】兜底面板仍然保留、且只在两条异常路径上被调',
    /function lastResortPanel\(win\)/.test(src) && (src.match(/lastResortPanel\(/g) || []).length === 3,
    '定义 1 + 调用 2', (src.match(/lastResortPanel\(/g) || []).length + ' 次');

  f6();
}

/* ==========================================================================
   P1 · 老档夹具 A~E（任务书点名的五个场景）
   ========================================================================== */
function f6() {
  /* A 全新空档 */
  load(base({ player: { level: 1, bestWorldIdx: 0, reincarnations: 0 } }));
  let S = Core.S;
  t('夹具A【真跑】空档：W01 可进、W02 锁、story 不凭空出现、bestWorldIdx=0',
    !!(S.worlds.W01 && S.worlds.W01.unlocked) && !(S.worlds.W02 && S.worlds.W02.unlocked)
      && Object.keys(S.story.w || {}).length === 0 && S.player.bestWorldIdx === 0 && S.player.reincarnations === 0,
    'W01 开 · W02 锁 · story 空 · bestWorldIdx=0 · 0 转',
    'W01=' + !!(S.worlds.W01 && S.worlds.W01.unlocked) + ' · W02=' + !!(S.worlds.W02 && S.worlds.W02.unlocked)
      + ' · story=' + Object.keys(S.story.w || {}).length + ' · best=' + S.player.bestWorldIdx);

  /* B W01 推到第 6 关 */
  load(base({ player: { level: 25, bestWorldIdx: 0, reincarnations: 0 },
    worlds: { W01: { unlocked: true, stages: { normal: [3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0], hard: Array(12).fill(0), hell: Array(12).fill(0) } } } }));
  S = Core.S;
  const b = S.story.w.W01 || {};
  t('夹具B【真跑】W01 推到第 6 关：in=1 · mid=1，pre/post/Boss 不凭空出现',
    b.in === 1 && b.mid === 1 && b.pre === undefined && b.post === undefined && !S.story.b.W01,
    'in/mid=1 · pre/post 无 · 无 Boss', JSON.stringify(b) + ' · boss=' + !!S.story.b.W01);
  t('夹具B【真跑】再次进第 6 关不会强制重播 mid（判据 = seen(mid)）',
    G.Story.seen('W01', 'mid') === true, 'seen(W01,"mid")=true', String(G.Story.seen('W01', 'mid')));
  t('夹具B【真跑】没有凭空全通：第 7 关之后仍然锁着',
    Core.stageUnlocked('W01', 'normal', 7) === false && Core.stageUnlocked('W01', 'normal', 11) === false,
    '第 8/12 关锁', 'stage7=' + Core.stageUnlocked('W01', 'normal', 7) + ' · stage11=' + Core.stageUnlocked('W01', 'normal', 11));

  /* C W12 普通全清 */
  load(base({ player: { level: 80, bestWorldIdx: 11, reincarnations: 0 }, worlds: through(12) }));
  S = Core.S;
  const c = S.story.w.W12 || {};
  t('夹具C【真跑】W12 普通全清：四段 + Boss 全开（不用重打）',
    ['in', 'mid', 'pre', 'post'].every((p) => c[p] === 1) && !!S.story.b.W12,
    'in/mid/pre/post=1 · Boss=1', JSON.stringify(c) + ' · boss=' + !!S.story.b.W12);

  /* D 旧规则转生（worlds 被清） */
  load(base({ player: { level: 5, bestWorldIdx: 11, reincarnations: 2 }, worlds: {}, worldFirstClear: {} }));
  S = Core.S;
  const d = S.story.w.W12 || {};
  t('夹具D【真跑】旧规则转生清空过：历史世界解锁恢复、剧情可查、**不补假星**',
    ['in', 'mid', 'pre', 'post'].every((p) => d[p] === 1) && !!S.story.b.W12
      && !!(S.worlds.W01 && S.worlds.W01.unlocked) && !!(S.worlds.W12 && S.worlds.W12.unlocked)
      && S.worlds.W12.stages.normal.join('') === '000000000000',
    '剧情/Boss 开 · W01/W12 解锁 · 星数全 0',
    JSON.stringify(d) + ' · boss=' + !!S.story.b.W12 + ' · W12星=' + S.worlds.W12.stages.normal.join(''));
  const beforeCur = JSON.stringify(S.cur);
  const res = Core.stageComplete('W12', 'normal', 11, 3);
  t('夹具D【真跑】不重复发首通奖励（重打一次，钱不变）',
    !res.firstClearReward && JSON.stringify(Core.S.cur) === beforeCur,
    'firstClearReward 空 · 货币不变',
    'firstClearReward=' + JSON.stringify(res.firstClearReward) + ' · 货币' + (JSON.stringify(Core.S.cur) === beforeCur ? '不变' : '**变了**'));

  /* E 新档（与 A 同源，单独再确认一次"不会被 refreshWorldUnlocks 顺手判成历史剧情"） */
  load(base({ player: { level: 1, bestWorldIdx: 0, reincarnations: 0 } }));
  Core.refreshWorldUnlocks();        // 开机那条路会调它 —— 调完也不许冒出剧情
  S = Core.S;
  t('夹具E【真跑】`refreshWorldUnlocks()` 跑过之后，新档仍然没有半条历史剧情',
    Object.keys(S.story.w || {}).length === 0 && Object.keys(S.story.b || {}).length === 0
      && !(S.worlds.W02 && S.worlds.W02.unlocked),
    'story 仍空 · W02 仍锁',
    'story=' + Object.keys(S.story.w || {}).length + ' · W02=' + !!(S.worlds.W02 && S.worlds.W02.unlocked));

  f7();
}

/* ==========================================================================
   P1 · savedAt 三态（自动存盘 / 离线结算 ≠ 玩家行为；玩家操作 = 玩家行为）
   ==========================================================================
   ⚠️ 这一节只管**本机这三态**。云同步那一整套（pull 无云档 → 正常创建 /
     被顶下线 → 只读 + 提示 / 重新登录 → 重新 claim lease / 另一台较新 → 取回）
     在测试台的 `cloud_sync_audit.js` 里（110 条，自带一套云库模拟器）。
     那一把**不在本仓库**（住在 `../wxlh-minigame-scripts/`），所以进不了发布总闸 ——
     这一点在回单里如实写明，不假装它在这条链里。 */
function f7() {
  load(base({ player: { level: 5, bestWorldIdx: 0, reincarnations: 0 } }));
  Core.settleOffline();                       // 开机那条路：结算完才把"可以盖章"的闸放开
  const stamped = () => Core.S.savedAt;

  Core.S.savedAt = 111;
  Core.save({ auto: true });                  // 15 秒心跳 / 自动存盘那条路
  t('P1【真跑】自动存盘**不刷新** `savedAt`（它不代表玩家产生了新进度）',
    stamped() === 111, 'savedAt 保持 111', String(stamped()));

  Core.S.savedAt = 222;
  Core.save();                                // 玩家驱动的存盘
  t('P1【真跑】玩家操作的存盘**刷新** `savedAt`', stamped() > 222,
    'savedAt > 222（盖成现在）', String(stamped()));

  Core.S.savedAt = 333;
  Core.S.idle.lastTs = Date.now() - 3600 * 1000;   // 造一个离线窗口，逼 settleOffline 真跑一段
  Core.settleOffline();
  t('P1【真跑】`settleOffline()`（离线结算）**不刷新** `savedAt`',
    stamped() === 333, 'savedAt 保持 333', String(stamped()));

  R.finish();
}
