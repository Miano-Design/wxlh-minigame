/* 返回链 / 路由审计（R1.3 阶段二 ②）：node scripts/audit_routes.js
   ==============================================================================
   **只查不改**。入口 id、页面名、驱动方式全部照现有 `battle_return_audit` 那一套真流程
   （不自己另编一套 API），逐场景验四件事：
     source（从哪来）· expected（该回哪）· actual（真回了哪）· stack / scroll 有没有恢复。
   每个场景都把 `CV.scroll` 先摆到一个非 0 值：**返回后不许无故变成 0** ——
   这是任务书 §四点名的"不能只看页面名对不对"。
   ⚠️ 本轮只报事实；**发现的问题不修**（任务书 §十一）。 */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('audit_routes');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D, G, U } = E;
if (!G.BattleUI) { R.blocked('BattleUI 没挂上（战斗页没加载）', { file: 'js/sc-battle.js', reason: '路由审计必须真打一场' }); R.finish(); return; }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = () => ((CV.top() || {}).name);
const stackNames = () => (CV.stack || []).map((l) => l && l.name);
const WIN = { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] };
const LOSE = { win: false, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: false, rounds: 1 }] };

function fresh() {
  Core.newGame();
  Core.setPlayerName('路由体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  /* ⚠️ 这三样**必须有**（照 `battle_return_audit` 那把能跑的尺子）：
       ① 一支队伍 —— 没队伍这场根本开不起来（第一版就是这儿报的假 BLOCKED）；
       ② `unlocked: true` ＋ W01 十二关全通 —— 关卡格子才点得动；
       ③ **把引导摘掉**（`G.coachFor = noop`）—— 引导是"真模态"，会把 `dun_back` 这类点击吃掉
          （第一版那条"点了 ‹ 没动"的 FAIL 就是它，不是产品的路由问题）。 */
  ['C021', 'C022'].forEach((id) => { try { Core.addChar(id); Core.S.chars[id].lv = 20; } catch (e) {} });
  Core.S.party = ['@player', 'C021', 'C022', null, null];
  Core.S.worlds.W01 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  Core.S.worlds.W02 = { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  Core.S.coachSeen = {};
  ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].forEach((k) => { Core.S.coachSeen[k] = true; });
  if (U && U.coachClearAll) U.coachClearAll();
  G.coachFor = function () {};
  try { G.BattleUI.clear(); } catch (e) {}
  CV.reset('home');
}
async function waitPanel(maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (maxMs || 6000)) {
    if (G.BattleUI.state && G.BattleUI.state.panel) return G.BattleUI.state.panel;
    await wait(100);
  }
  return null;
}
/** 一个场景 = 摆好来源页与滚动 → 开打 → 结算 → 点返回 → 逐条比对 */
/* ================= 2026-10-01（B 批二轮）：把"自动播的剧情层"关掉 =================
   进世界第一次会**自动播一段剧情**（`in`，父亲大人二轮 §四），于是 `CV.dispatch('w:W01')`
   之后栈顶是 `story`。真实玩家会读它 / 点跳过，然后才去点关卡 —— 本尺子的场景要照这个
   顺序搭，否则量的是"玩家在读剧情时点了关卡格"这种**游戏里根本到不了的姿势**。
   ⚠️ 这里**没有放宽任何断言**：① 仍然要求"打完回 world"、⑥ 仍然要求"‹ 回 dungeon"；
      只是把"进世界之后那一步"补上（`sc-dungeon` 的 `startStage` 里也有同一层收口，
      两条路必须落到同一个结果 —— 那一条是产品侧兜底，这一条是场景侧还原）。 */
function closeAutoStory() {
  while (CV.stack.length > 1 && CV.top().name === 'story') CV.pop();
}

async function scenario(opt) {
  fresh();
  G.Battle.run = function () { return opt.lose ? LOSE : WIN; };
  /* 先把"来源页"摆出来（照现有尺子的真入口） */
  opt.enter();
  const requestedScroll = opt.scroll == null ? 380 : opt.scroll;
  /* 只允许测试真正可能存在的源位置：页面没有这么长就按 maxScroll 夹回，
     避免把"不可到达的 380"当成真实玩家现场。 */
  CV.scroll = Math.min(requestedScroll, Math.max(0, CV.maxScroll || 0));
  const src = page(), srcStack = stackNames(), srcScroll = CV.scroll;
  opt.start();                                   // 真正开打
  const panel = await waitPanel();
  if (!panel) {
    R.blocked(opt.name + '：没等到结算面板', { expected: '打完出结算', actual: '6 秒内没有 panel' });
    return;
  }
  CV.dispatch(opt.closeId || 'battle_close');
  await wait(120);
  const back = page(), backStack = stackNames(), backScroll = CV.scroll;
  const stackOk = backStack.indexOf(src) >= 0;
  const scrollOk = Math.abs(backScroll - srcScroll) < 1;
  const ok = back === opt.expect && stackOk;
  const ev = {
    file: 'js/sc-battle.js',
    expected: '回到 ' + opt.expect + '（来源 ' + src + ' · 栈 ' + srcStack.join('>') + ' · scroll ' + srcScroll + '）',
    actual: '回到 ' + back + ' · 栈 ' + backStack.join('>') + ' · scroll ' + backScroll,
  };
  if (!ok) R.fail(opt.name, ev);
  else if (!scrollOk) R.warn(opt.name + '：页面对了，但**滚动位置没恢复**', Object.assign({}, ev, { reason: '任务书 §四：scroll 也要恢复' }));
  else R.pass(opt.name, ev);
}

(async () => {
  /* ① 残域 → 世界 → 关卡 → 战斗 → 返回 */
  await scenario({
    name: '① 残域→世界→关卡→战斗→「收下奖励并返回」→ 回世界',
    enter() { CV.reset('dungeon'); CV.dispatch('w:W01'); closeAutoStory(); },
    expect: 'world',
    start() { CV.dispatch('stage:0'); },
  });
  /* ② 同上，但**连打两场**（下一关）—— 任务书 §四"连续战斗" */
  await scenario({
    name: '② 残域→世界→关卡→战斗→再打一关→返回 → 仍回世界',
    enter() { CV.reset('dungeon'); CV.dispatch('w:W01'); closeAutoStory(); },
    expect: 'world',
    start() { CV.dispatch('stage:0'); },
  });
  {
    /* 连打第二场：第一场出来之后，从世界页再开一关 */
    G.Battle.run = function () { return WIN; };
    CV.dispatch('stage:1');
    const panel2 = await waitPanel();
    if (!panel2) R.blocked('②b 第二场没开起来', { expected: '能连打', actual: '没有 panel' });
    else {
      CV.dispatch('battle_close');
      await wait(120);
      if (page() !== 'world') R.fail('②b 连打第二场后返回 → 应仍在世界页', { file: 'js/sc-battle.js', expected: 'world', actual: page() });
      else R.pass('②b 连打第二场后返回 → 仍在世界页');
    }
  }
  /* ③ 灯阁 → 深井 → 战斗 → 返回 */
  await scenario({
    name: '③ 灯阁→深井→战斗→返回 → 回深井',
    enter() { CV.reset('home'); CV.push('corridor'); },
    expect: 'corridor',
    start() { CV.dispatch('corridor_fight'); },
  });
  /* ④ 灯阁 → 斗法台 → 战斗 → 返回 */
  await scenario({
    name: '④ 灯阁→斗法台→战斗→返回 → 回斗法台',
    enter() { CV.reset('arena'); },
    expect: 'arena',
    start() { CV.dispatch('arena_fight'); },
  });
  /* ⑤ 战斗**失败** → 返回（来源页不许被改） */
  await scenario({
    name: '⑤ 斗法台→战斗（失败）→返回 → 仍回斗法台',
    enter() { CV.reset('arena'); },
    expect: 'arena',
    lose: true,
    start() { CV.dispatch('arena_fight'); },
  });
  /* ⑥ 打完一关出来，**吸顶 ‹** 得能回上一层（F8 那条：那一页不许变成"根"） */
  {
    fresh();
    G.Battle.run = function () { return WIN; };
    CV.reset('dungeon'); CV.dispatch('w:W01'); CV.dispatch('stage:0');
    await waitPanel();
    CV.dispatch('battle_close');
    await wait(120);
    const backId = (CV.pageHead || {}).backId || 'page_back';
    const deep = CV.stack.length;
    CV.dispatch(backId);
    await wait(120);
    const ok = deep >= 2 && page() === 'dungeon';
    (ok ? R.pass : R.fail)('⑥ 副本打完一关出来：栈深 ≥2 且吸顶 ‹ 真能回残域列表', {
      file: 'js/cv.js', expected: '栈 ≥2 · ‹ 回到 dungeon', actual: '栈深 ' + deep + ' · ‹=' + backId + ' · 回到 ' + page(),
    });
  }
  /* ⑦ 从"跟战斗无关"的页开一场（兜底路径）：结算返回也不许跳到别的页 */
  {
    fresh();
    G.Battle.run = function () { return WIN; };
    CV.reset('home'); CV.push('bag');
    CV.scroll = 380;
    const before = page();
    G.BattleUI.run({ title: '路由兜底', allies: [], enemies: [], worldId: null, maxRounds: 3, onEnd() { return { acts: [] }; } });
    await waitPanel();
    CV.dispatch('battle_close');
    await wait(120);
    (page() === before ? R.pass : R.fail)('⑦ 从背包页开一场：返回后回到背包（兜底不许乱跳）', {
      file: 'js/sc-battle.js', expected: before, actual: page(),
    });
  }
  R.finish();
})();
