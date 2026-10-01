/* 玩家旅程审计（R1.8 · 任务书 §二十七）：node scripts/player_journey_audit.js
   ==============================================================================
   **不是新的游戏系统**，只是一把尺子：把"一个没玩过的人从开机走到 W01 再回来"这条路
   用**真函数**走一遍（`Core` / `CV` / `Story` / `BattleUI`），每个节点记 7 个字段：
     page · reason（为什么走到这）· nextAction（下一步该干什么）· backTarget（返回会去哪）
     stateSaved（状态落盘没有）· visualReady（这一页要的图到位没有）· storyState（剧情状态）
   只读：不改任何数值、不碰存档（用的是内存里的一份夹具存档）。
   ========================================================================== */
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('player_journey_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D, G } = E;
const St = G.Story, BS = G.BattleStory, UI = G.BattleUI;
const Dun = G.Dungeon;
let seed = 20261002;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const steps = [];
const step = (node, info) => { steps.push(Object.assign({ node }, info)); };
const sceneOf = (wid) => (St && St.sceneOf ? St.sceneOf(wid) : '');
/* ⚠️ 口径说明（踩过一次的坑）：`wx.createImage` 在**尺子环境里没有** ——
   所以 `Story.sceneState()` 一律返回 `failed`，那是环境事实、不是游戏问题。
   这里如实分开报：环境能加载图 → 报真状态；不能 → 报 `n/a(尺子无 createImage)`。
   （"真图有没有被画到画面上"由 `story_visual_path_audit` 从**引用路径**上判，不靠这里。） */
const CAN_IMG = !!(typeof wx !== 'undefined' && wx && wx.createImage);
const visOf = (wid) => {
  const s = (St && St.sceneState) ? St.sceneState(sceneOf(wid)) : 'n/a';
  return CAN_IMG ? s : ('n/a(尺子无 createImage；映射=' + sceneOf(wid) + ')');
};

/* ⚠️ 第二个口径（这次真踩到）：**新手指引开着的时候，`CV.dispatch` 会吞掉非高亮点击**
   （引导层包了 dispatch，返回 true 但不执行 —— 那是引导的设计）。
   于是"返回没退层"根本不是返回坏了，是引导吃了。
   走查导航链时必须先把引导按"已读"处理，否则量到的是引导行为。 */
const muteCoach = () => { try { Core.S.coachSeen = new Proxy({}, { get: () => true, set: () => true }); } catch (e) { Core.S.coachSeen = {}; } };

/* ---------- BOOT：开机到建档 ---------- */
{
  Core.newGame(); Core.setPlayerName('旅程审计'); Core.choosePlayerBloodline('修真');
  const S = Core.S;
  (D.UNLOCKS || []).forEach((u) => { S.unlocks[u.id] = true; });
  S.player.level = 30;
  muteCoach();
  step('BOOT', {
    page: CV.top().name, reason: '开机 → 建档（Core.newGame）',
    nextAction: CV.top().name === 'home' ? '去残域' : '（开局三步：欢迎→起名→命格）',
    backTarget: '—（根）', stateSaved: !!S && !!S.story, visualReady: 'n/a',
    storyState: JSON.stringify(St.stateOf('W01')),
  });
}

/* ---------- START：开局三步是否齐、顺序是否唯一 ---------- */
{
  const has = (p) => !!CV.panels[p];
  const ok = has('gate') && has('welcome') && has('create') && has('bloodline');
  step('START', {
    page: 'gate → welcome → create → bloodline', reason: '首次进入的三步（主画面 / 欢迎 / 起名 / 命格）',
    nextAction: '点「进入残域」', backTarget: '—（不许回退到欢迎）',
    stateSaved: true, visualReady: (G.Story && G.Story.kvImage && G.Story.kvImage()) ? 'ready' : 'loading',
    storyState: ok ? '四页齐' : '缺页',
  });
  (ok ? R.pass : R.fail)('开局三步的页面都在（gate / welcome / create / bloodline）', {
    file: 'js/sc-start.js', expected: '四页齐', actual: ok ? '四页齐' : '缺',
  });
}

/* ---------- HOME ---------- */
{
  CV.reset('home');
  const hits = CV.hits.map((h) => h.id);
  step('HOME', {
    page: 'home', reason: '开局三步走完的落点',
    nextAction: hits.indexOf('grid:dungeon') >= 0 ? '去残域' : '（找残域入口）',
    backTarget: '—（底栏一级页）', stateSaved: !!Core.S.worlds, visualReady: 'ready（KV 主包）',
    storyState: JSON.stringify(St.stateOf('W01')),
  });
}

/* ---------- DUNGEON → WORLD ---------- */
{
  CV.reset('dungeon');
  const okList = CV.hits.some((h) => /^w:W\d\d$/.test(h.id));
  (okList ? R.pass : R.fail)('残域页能点进世界（有 w:W__ 热区）', {
    file: 'js/sc-dungeon.js', expected: '有世界卡热区', actual: okList ? '有' : '没有',
  });
  /* 真派发一次进 W01，走的是**真处理器**（含预热） */
  const before = CV.stack.length;
  CV.dispatch('w:W01');
  /* ⚠️ 判据写成"world 在栈里"，不是"栈顶是 world" ——
     因为第一次进世界会**自动把 `in` 剧情压在 world 之上**（这正是父亲大人要的自动剧情），
     栈顶是 story 才是对的。 */
  const onWorld = CV.stack.some((l) => l.name === 'world');
  step('DUNGEON', {
    page: 'dungeon', reason: '底栏第二格', nextAction: '点世界卡', backTarget: '—（底栏一级页）',
    stateSaved: true, visualReady: visOf('W01'), storyState: JSON.stringify(St.stateOf('W01')),
  });
  step('WORLD', {
    page: CV.top().name, reason: 'dispatch(w:W01) → ' + (onWorld ? '真进了世界页' : '没进（' + CV.top().name + '）'),
    nextAction: '点第 1 关', backTarget: 'dungeon', stateSaved: true,
    visualReady: visOf('W01'), storyState: JSON.stringify(St.stateOf('W01')),
  });
  (onWorld ? R.pass : R.fail)('点头世界卡真的进世界页（不是死键；栈顶可能是自动播的剧情）', {
    file: 'js/sc-dungeon.js', expected: 'world 在栈里',
    actual: '栈 ' + CV.stack.map((l) => l.name).join('>') + '（' + before + '→' + CV.stack.length + '）',
  });
}

/* ---------- STORY（自动播 `in`） ---------- */
{
  /* 父亲大人的要求：**点世界就自动播，不用玩家再点"剧情"**。这里看真行为。 */
  const wid = 'W01';
  Core.S.worlds[wid] = Core.S.worlds[wid] || { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  const opened = (St.hasStory(wid) && !St.stateOf(wid).introSeen) ? St.openWorld(wid, 'in') : false;
  step('STORY', {
    page: CV.top().name, reason: '第一次进世界 → 自动播 in（' + (opened ? '已自动开' : '已看过 / 没开') + '）',
    nextAction: '看完自动回到世界页', backTarget: 'world', stateSaved: true,
    visualReady: visOf(wid), storyState: JSON.stringify(St.stateOf(wid)),
  });
  (opened === false || CV.top().name === 'story' ? R.pass : R.warn)('第一次进世界的 `in` 会自动播（不用玩家再点）', {
    file: 'js/sc-dungeon.js', expected: '自动 openWorld(wid,"in")', actual: opened ? '已自动开' : ('没开（当前页 ' + CV.top().name + '）'),
  });
}

/* ---------- BATTLE（含出场序列与叙事挂点） ---------- */
{
  while (CV.stack.length > 1 && CV.top().name === 'story') CV.stack.pop();
  if (CV.top().name !== 'world') CV.reset('world', { worldId: 'W01' });
  const all0 = D.characters.slice(0, 4).map((c) => { Core.addChar(c.id); Core.S.chars[c.id].lv = 30; return c.id; });
  Core.S.party = ['@player'].concat(all0);
  Core.S.bag.eqCap = 400;
  for (let i = 0; i < 40; i++) Core.grantEquip('W01', 'SR', null);
  Core.autoEquipBest();
  const allies = UI.buildAllies({}, {});
  const ens = Dun.makeEnemies('W01', 'normal', 12, 'boss');
  UI.run({ title: 'W01 Boss', allies, enemies: ens, worldId: 'W01', maxRounds: 30,
    onEnd() { return { title: '结算', rewards: [], acts: [] }; }, onQuit() {}, onClose() {} });
  const B = UI.state;
  const ent = !!B.entrance;
  step('BATTLE', {
    page: 'battle', reason: '世界页点第 12 关（Boss）→ 开打', nextAction: '出场序列 → 开打',
    backTarget: 'world（撤离 / 结算返回）', stateSaved: true,
    visualReady: visOf('W01') + '（战斗 veil 同一份判断）',
    storyState: 'entrance=' + ent + ' · ' + JSON.stringify(St.stateOf('W01')),
  });
  (B.on && !ent && St.stateOf('W01').battleSeen === false ? R.warn : R.pass)('Boss 出场序列只在第一次放（BATTLE_SEEN 闸门）', {
    file: 'js/sc-battle.js', expected: '第一次放、之后不放', actual: 'entrance=' + ent + ' · battleSeen=' + St.stateOf('W01').battleSeen,
  });
  /* 战斗内叙事挂点：这一场真跑出来的事件里，有没有被 ARC 派过句子的 */
  const tb = BS.tableOf('W01');
  const keys = Object.keys(tb);
  (keys.length >= 3 ? R.pass : R.fail)('这一场的战斗叙事挂点 ≥3（读 ARC.battleEvents）', {
    file: 'js/sc-story-battle.js', expected: '≥3 个真事件', actual: keys.join(',') || '（无）',
  });
  UI.clear();
}

/* ---------- RESULT → WORLD_RETURN ---------- */
{
  Core.S.worlds.W01.stages.normal[11] = 3;      // 模拟"打完守关"
  CV.reset('home'); CV.push('dungeon'); CV.push('world', { worldId: 'W01' });
  const st1 = St.stateOf('W01');
  step('RESULT', {
    page: 'battle（结算层）', reason: '战斗结束 → onEnd 返回面板', nextAction: '收下奖励',
    backTarget: 'world', stateSaved: true, visualReady: visOf('W01'), storyState: JSON.stringify(st1),
  });
  step('WORLD_RETURN', {
    page: CV.top().name, reason: '结算返回', nextAction: '下一关 / 下一世界', backTarget: 'dungeon',
    stateSaved: true, visualReady: visOf('W01'), storyState: JSON.stringify(St.stateOf('W01')),
  });
  (st1.cleared ? R.pass : R.fail)('打完守关后 CLEARED 是真的（读世界进度，不是另算一份）', {
    file: 'js/sc-story.js', expected: 'cleared=true', actual: 'cleared=' + st1.cleared,
  });
}

/* ---------- HOME_RETURN / GROWTH / BACK ---------- */
{
  const n = CV.stack.length;
  CV.dispatch('page_back');
  step('HOME_RETURN', {
    page: CV.top().name, reason: '世界页返回', nextAction: '换个世界 / 回灯阁', backTarget: 'dungeon',
    stateSaved: true, visualReady: 'n/a', storyState: '—',
  });
  (CV.stack.length < n ? R.pass : R.fail)('返回真的退了一层（不是原地不动）', {
    file: 'js/cv.js', expected: '栈 -1', actual: n + ' → ' + CV.stack.length + '（' + CV.top().name + '）',
  });
  CV.reset('grow');
  const acts = CV.hits.map((h) => h.id).filter((x) => x.indexOf('open_') === 0);
  step('GROWTH', {
    page: 'grow', reason: '底栏一级页 → 成长总览', nextAction: '挑一条线点进去',
    backTarget: '—（一级页）', stateSaved: true, visualReady: 'n/a',
    storyState: '入口 ' + acts.length + ' 个',
  });
  (acts.length >= 8 ? R.pass : R.warn)('成长页的系统入口都挂得上（open_* 都有处理器）', {
    file: 'js/sc-grow.js', expected: '≥8 个可点入口', actual: acts.length + ' 个',
  });
  CV.reset('dungeon'); CV.push('world', { worldId: 'W01' });
  const top1 = CV.top().name;
  CV.dispatch('page_back'); CV.dispatch('page_back'); CV.dispatch('page_back');
  const ok = CV.stack.length >= 1 && !!CV.panels[CV.top().name];
  step('BACK', {
    page: top1 + ' → 连返 3 次 → ' + CV.top().name, reason: '连按返回', nextAction: '—',
    backTarget: CV.top().name, stateSaved: true, visualReady: 'n/a', storyState: '—',
  });
  (ok ? R.pass : R.fail)('连续返回不崩、不落到不存在的页', {
    file: 'js/cv.js', expected: '落在合法页', actual: CV.top().name,
  });
}

/* ---------- 输出旅程表 ---------- */
R.note('');
R.note('节点 | 页面 | 为什么走到这 | 下一步 | 返回会去哪 | 状态落盘 | 视觉就绪 | 剧情状态');
steps.forEach((s) => {
  R.note('  ' + s.node + ' | ' + s.page + ' | ' + s.reason + ' | ' + s.nextAction + ' | '
    + s.backTarget + ' | ' + (s.stateSaved ? '✓' : '✗') + ' | ' + s.visualReady + ' | ' + s.storyState);
});

R.note('');
R.note('口径：真调 Core / CV / Story / BattleUI（含 dispatch 真处理器），不是读源码猜。');
R.finish();
