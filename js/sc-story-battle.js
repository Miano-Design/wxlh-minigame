/* ============================================================================
   《残域》叙事 × 战斗融合层（R1.6 叙事轮 · 2026-10-02）
   ----------------------------------------------------------------------------
   父亲大人的原话（这一轮的唯一目标）：
     「玩家不是"看完剧情然后打架"，而是"剧情发展到这里，玩家必须亲自完成这个事件"。」

   三件事，只做这三件：
     ① **Boss 出场**：场景 → Boss 出现 → 动作 → 台词 → 开打（2~4 秒，只放一次）
     ② **战斗内残响**：由**战斗里真实发生的事**触发（`BattleStory.trigger(event)`），
        不是"到点了随便播一句"。第一句一定挂在"打到了 Boss"，所以永远播得出来。
     ③ **战后世界变化**：Boss 战胜利 → 一句"你改变了什么"（`BOSS[wid].after`）+ 已有的线索。

   ⚠️ 三条纪律（§三十 / §二十 / §七）：
     · **不重写剧情**：残响文本全部取自已经写好的 `mid` 那一拍，本文件只做"重新编排"；
     · **重刷不烦人**：出场序列与战后变化**只在第一次**给（`Story.seenBoss`），
       第二次之后直接开打、结算照旧；
     · **不暂停太久**：残响 1.8 秒自走、不登记热区、不挡操作、不改战斗结果。
   ========================================================================== */
window.BattleStory = (function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const SD = () => (G.STORYDATA || {});
  const D = () => G.DATA;
  const Core = () => G.Core;
  const Story = () => G.Story;

  /* 事件名表（§八 给的那张表，逐条对齐）——两个用途：
       ① 战斗页照着它调 `trigger`；② 尺子 `story_battle_matrix` 照着它查"这一场有没有叙事反馈"。 */
  const EVENTS = [
    'battle_start', 'first_hit', 'player_low_hp', 'boss_low_hp',
    /* R1.7：血量阈值按**三个**分开报（战斗页就是这么调的）——
       原来只登记了一个笼统的 `boss_low_hp`，于是 ARC 里写 `boss_hp50` 的世界
       会被尺子判成"用了不存在的事件"。事件表以**实际实现**为准。 */
    'boss_hp75', 'boss_hp50', 'boss_hp25',
    'boss_phase_2', 'boss_phase_3', 'boss_skill', 'boss_buff', 'boss_debuff',
    'player_break', 'player_death', 'player_revive', 'element_counter',
    'world_rule', 'battle_win', 'battle_fail',
  ];
  /* 残响的**派发顺序**：把 `mid` 那一拍的节拍按这个顺序一句一句派出去。
     为什么是这个顺序：按"这场战斗里**必然会发生**的先后"排 ——
       第一句挂 first_hit（一定打得到 Boss，Boss 被秒也成立，这是老 `maybeEcho` 踩出来的经验），
       然后按血量阈值往上叠，最后才是"可能要打很久才出现"的机制类事件。
     这样任何世界的前一两句残响都**一定播得出来**，不会出现"写了却永远不触发"。 */
  const DISPATCH = [
    'first_hit', 'boss_hp75', 'boss_hp50', 'boss_hp25',
    'boss_phase_2', 'boss_phase_3', 'boss_skill', 'boss_buff',
    'world_rule', 'player_low_hp', 'player_death', 'element_counter',
  ];
  const ECHO_MS = 1800;                      // 与 sc-battle 那条"残响"同一档（1.8 秒）
  const ENTRANCE_MS = 2400;                  // Boss 出场：2.4 秒（§四 要求 2~5 秒）

  let cur = null;                            // 本场：{ worldId, isBoss, table, fired, queue }

  const beatsOf = (worldId, part) => {
    const w = (SD().WORLDS || {})[worldId];
    const arr = w && w[part];
    return (arr && arr.length) ? arr : null;
  };
  /* 一拍 → 一行可播的字。对白带说话人，旁白/物件不带（§二十四：系统 / 角色 / Boss 分开）。 */
  const lineOf = (b) => {
    if (!b || !b.s) return '';
    if (b.k === 'd') return b.who ? (b.who + '：' + b.s) : String(b.s);
    return String(b.s);
  };
  /* 世界 → 事件 → 一句残响。**唯一一份映射**，战斗页与尺子都读它。 */
  function tableOf(worldId) {
    /* ================= R1.7：优先读 `ARC.battleEvents` =================
       老路子是"把 `mid` 那一拍的节拍按顺序派给事件"——可 36 个世界的 `mid` 各只有 1 拍，
       于是每场只有 1 条残响，而且**它和战斗里真实发生的事没关系**。
       现在每个世界的 ARC 明确写了 ≥3 个节点，每个节点自带 `trigger`（战斗事件名）、
       `type`（narrative / mechanic / environment_change）与一句 `line` ——
       这一份才是"战斗事件 → 剧情事件"的真映射。`mid` 那一路退成**兜底**（ARC 缺了才用）。 */
    const arc = (SD().ARC || {})[worldId];
    if (arc && arc.battleEvents && arc.battleEvents.length) {
      const out = {};
      arc.battleEvents.forEach((e) => {
        if (!e || !e.trigger || !e.line) return;
        if (out[e.trigger]) return;                       // 同一个事件只留第一条
        out[e.trigger] = e.line;
        VOICE[e.trigger] = (e.type === 'mechanic' || e.type === 'environment_change') ? 'system' : 'story';
      });
      return out;
    }
    const bs = beatsOf(worldId, 'mid') || [];
    const out = {};
    bs.forEach((b, i) => { const ev = DISPATCH[i]; if (ev && !out[ev]) out[ev] = lineOf(b); });
    return out;
  }
  /* 事件 → 由谁来说（§二十四：系统层与角色层不许混）。
     ARC 里 `type: 'mechanic' / 'environment_change'` 的节点＝**系统层**（走【残域机制】那种口吻），
     其余＝角色/旁白层。这份表由 `tableOf` 顺便填，`trigger` 时用它决定前缀。 */
  const VOICE = {};

  /* ---------- 一场开始 ---------- */
  function begin(cfg) {
    cfg = cfg || {};
    const wid = cfg.worldId || '';
    cur = { worldId: wid, isBoss: !!cfg.isBoss, table: tableOf(wid), fired: {}, queue: [] };
    /* ================= 2026-10-03（父亲大人：「战斗过程的残响窗口……不要了」）=================
       残响那一层 UI 撤掉之后，"播过就记已读"的那一下**没有执行者了**——
       而卷宗里那条「战斗中残响」是按已读/未读展示的（`sc-story.js` 的 `PARTS`），
       一个永远点不亮的"未读"看着就像坏了。
       所以这里补上：**玩家进了这一场，就把这一拍的 `mid` 记成已读** ——
       事实也如此（他确实打过这一场了）；内容照旧能在卷宗里逐句重读。 */
    try {
      const St = Story();
      if (wid && St && St.markSeen && St.seen && !St.seen(wid, 'mid')) St.markSeen(wid, 'mid');
    } catch (e) {}
    /* battle_start 是"这一场的第一句"—— 有就排在最前面（没有就跳过，不报错） */
    if (cur.table.battle_start) { cur.fired.battle_start = 1; cur.queue.push({ ev: 'battle_start', text: cur.table.battle_start }); }
    /* 老行为兜底：`mid` 一拍都没有的世界，仍然给一句（免得"这一场完全没有叙事反馈"）。
       文本来源还是现有数据（Boss 的 `say`），不新写故事。 */
    if (!Object.keys(cur.table).length) {
      const boss = Story() && Story().bossOf ? Story().bossOf(wid) : null;
      if (boss && boss.say) cur.table.first_hit = boss.say;
    }
    return cur;
  }

  /* ---------- 战斗里发生了一件事（§八 的唯一入口） ---------- */
  /* ================= 系统层回声（§九 / §二十四） =================
     为什么要这一条：现有 36 个世界的 `mid` 各只有 **1 拍**（W36 两拍）——
     §三十 明写"本轮不要重写剧情"，所以"角色/旁白"那一层本来就只有 1~2 句。
     可 §九 又要求"世界机制真正进入战斗"，§二十四 要求**系统提示与角色台词彻底分开**。
     解法：**机制事件**（世界规则改写 / Boss 开盾 / Boss 召唤 / 我方濒危）触发时，
     用**引擎里已经写好的那句机制说明**（`Battle.MECHANICS[wid].note`，如"感染：敌人攻击附带中毒"）
     播一条【残域机制】系统回声 —— 不新写一个字，且它与"谁在说话"这件事是分开的。
     ⚠️ 每场每类只播一次；没有 `note` 就不播（绝不编）。 */
  const MECH_EVENTS = ['world_rule', 'boss_skill', 'boss_buff', 'player_low_hp'];
  function mechNote(worldId) {
    const m = (G.Battle && G.Battle.MECHANICS) ? G.Battle.MECHANICS[worldId] : null;
    return (m && m.note) ? String(m.note) : '';
  }
  function trigger(ev, info) {
    if (!cur || !ev) return false;
    const key = String(ev);
    if (cur.fired[key]) return false;
    const line = cur.table[key];
    if (line) {
      cur.fired[key] = 1;
      /* ARC 标的 `type` 决定谁在说话：机制/环境那两类走**系统层**（前缀也是这么来的） */
      const v = VOICE[key] || 'story';
      cur.queue.push({ ev: key, text: v === 'system' ? ('【残域机制】' + line) : line, at: Date.now(), voice: v });
      return true;
    }
    /* 剧情那一拍没有对应句子 → 退到**系统层**（只给机制类事件，且世界真的有机制说明） */
    if (MECH_EVENTS.indexOf(key) >= 0 && !cur.fired['sys:' + key]) {
      const note = mechNote(cur.worldId);
      if (!note) return false;
      cur.fired['sys:' + key] = 1;
      cur.queue.push({ ev: key, text: '【残域机制】' + note, at: Date.now(), voice: 'system' });
      return true;
    }
    return false;
  }
  /* 取一条待播的残响（UI 每帧问一次；没有就返回 null） */
  function take() { return (cur && cur.queue.length) ? cur.queue.shift() : null; }
  function pending() { return !!(cur && cur.queue.length); }
  function firedOf(ev) { return !!(cur && cur.fired[ev]); }
  function worldOf() { return cur ? cur.worldId : ''; }
  function tableOfCur() { return cur ? Object.assign({}, cur.table) : {}; }

  /* ---------- ① Boss 出场（2.4 秒，只放一次） ---------- */
  /* ================= 剧情状态（§二十一）：**只加一个键，不新造一套系统** =================
     父亲大人要求区分 UNSEEN / INTRO_SEEN / BATTLE_SEEN / BOSS_SEEN / CLEARED / CLUE_FOUND / EPILOGUE_SEEN。
     这七档里，**六档本来就已经存在**，我只补了第七档：
       · INTRO_SEEN    = `S.story.w[wid].in`   （进图剧情看过）
       · BATTLE_SEEN   = `S.story.e[wid]`      ← **本轮新增的唯一一个键**（出场序列放过没有）
       · BOSS_SEEN     = `S.story.b[wid]`      （Boss 战后剧情看过）
       · EPILOGUE_SEEN = `S.story.w[wid].post` （战后那一拍看过）
       · CLUE_FOUND    = 同上（线索就是 post 的关键物件，`Story.clueOf`）
       · CLEARED       = `S.worlds[wid].stages.normal[11] > 0`
       · UNSEEN        = 上面全假
     `e` 用**懒补**（老档没有那个键也没关系，读的时候补一个空表），不进 `defaultState`。 */
  /* R1.8（§七）：七档状态的**唯一读取入口搬到 `Story.stateOf()`**，这里只做转发 ——
     谁都不许再自己拼一遍"哪些键算什么状态"。 */
  function stageState(worldId) {
    const St = Story();
    if (St && St.stateOf) return St.stateOf(worldId);
    return { UNSEEN: true };   // 拿不到剧情层（尺子单独加载）时的兜底：当成"没看过"
  }
  function markBattleSeen(worldId) {
    const St = Story();
    if (St && St.markBattleSeen) St.markBattleSeen(worldId);
  }

  /* 返回 null ＝ 不放（不是 Boss / 已经见过 / 没有数据）。
     `start` 由调用方给（战斗页在真正开打那一刻调），本函数只产出内容。 */
  function entranceOf(worldId) {
    const St = Story();
    if (!worldId || !St || !St.bossOf) return null;
    /* §二十：**放过一次就不再放**（挂了重来也不放 —— 那是同一件事看第四遍）。
       判据用 BATTLE_SEEN，不是 BOSS_SEEN：Boss 战后剧情是"通关后"才记的，
       用它当闸门的话，打输一次就等于"这一场演出永远没放过"。 */
    if (stageState(worldId).battleSeen) return null;
    if (St.seenBoss && St.seenBoss(worldId)) return null;          // 已经通关看过 Boss 线，也不再演
    const boss = St.bossOf(worldId);
    const w = (D().WORLDS || []).find((x) => x.id === worldId) || {};
    /* ================= R1.8（§四 / §二十三）：**36 个世界都要有出场** =================
       原来这里 `if (!boss) return null;` —— 而 `BOSS` 表只有 6 个锚点，
       于是**另外 30 个世界根本没有 Boss 出场**（走查尺子量出来的：entrance=false）。
       现在退到 ARC：`bossRole`（它是什么/为什么挡在这里）+ `bossTrigger`（出场那一刻发生了什么），
       与 `WORLDS[].boss` 的名字拼成同一段出场 —— 六锚点仍用 `BOSS` 表（信息更全），一个字没动。 */
    const arc = (SD().ARC || {})[worldId] || {};
    const name = (boss && boss.name) || w.boss || '';
    const say = (boss && boss.say) || arc.bossTrigger || '';
    const inner = (boss && boss.inner) || arc.bossRole || '';
    if (!name && !say) return null;
    return {
      worldId,
      name: name,
        say: say,                                                     // Boss 台词 / 出场那一刻（角色层）
        /* §四十三：六个核心 Boss 的"记忆台词·首次见面"（其余世界是空串）。
           出场序列会把它接在 `say` 后面画一行（见 `sc-battle.js:drawEntrance`）。 */
        say2: (boss && boss.lines && boss.lines.meet) || '',
      inner: inner,                                                 // 它为什么挡在这里（身份/目的层）
      mech: w.mechanic ? ('【残域机制】' + w.mechanic) : '',        // 系统层：本世界的规则
      ms: ENTRANCE_MS,
    };
  }
  /* 出场序列正在走的时候，战斗**不推进**（step() 问这个） */
  function entranceActive() { return !!(G.BattleUI && G.BattleUI.entranceActive && G.BattleUI.entranceActive()); }

  /* ---------- ③ 战后世界变化（只放一次） ---------- */
  function changeOf(worldId) {
    const St = Story();
    if (!worldId || !St || !St.bossOf) return null;
    const boss = St.bossOf(worldId);
    /* R1.7：**普通世界也要有"战斗改变了什么"**。六个锚点用 `BOSS.after`（原有），
       其余 30 个世界用 ARC 的 `environmentChange` —— 两处都是已经写好的数据，不新造字段。 */
    const arc = (SD().ARC || {})[worldId] || {};
    const clue = arc.clue || (St.clueOf && St.clueOf(worldId, 'post')) || '';
    const after = (boss && boss.after) || arc.environmentChange || '';
    /* R2.x（NARRATIVE-UX-FINAL §四十四）：六个核心 Boss 还有一句**记忆台词·战后**
       （`lines.after`，如"这次少了一件。"）—— 它跟在"战场变化"那句后面，
       由**结算页**画出来（`sc-dungeon` 传给面板，`sc-battle` 落在同一块里）。
       没有 `lines` 的世界这里就是空串，结算页那一行不出现。 */
    const after2 = (boss && boss.lines && boss.lines.after) || '';
    if (!after && !clue) return null;
    return { after: after, after2: after2, clue: clue, mystery: (boss && boss.mystery) || arc.transition || '' };
  }

  /* ---------- 尺子用的只读投影（不参与运行） ---------- */
  function matrixRow(worldId) {
    const w = (D().WORLDS || []).find((x) => x.id === worldId) || {};
    const t = tableOf(worldId);
    const St = Story();
    const boss = (St && St.bossOf) ? St.bossOf(worldId) : null;
    const beats = (p) => beatsOf(worldId, p) || [];
    return {
      id: worldId,
      name: w.name || '',
      mechanic: w.mechanic || '',
      conflict: lineOf(beats('pre')[0]) || lineOf(beats('in')[0]) || '',
      echo: Object.keys(t).map((k) => k + '：' + t[k]),
      echoEvents: Object.keys(t),
      boss: boss ? boss.name : (w.boss || ''),
      bossSay: boss ? (boss.say || '') : '',
      bossInner: boss ? (boss.inner || '') : '',
      after: boss ? (boss.after || '') : '',
      clue: (St && St.clueOf) ? (St.clueOf(worldId, 'post') || '') : '',
      mystery: boss ? (boss.mystery || '') : '',
      parts: { in: beats('in').length, pre: beats('pre').length, mid: beats('mid').length, post: beats('post').length },
      next: (D().WORLDS || [])[((D().WORLDS || []).findIndex((x) => x.id === worldId)) + 1],
    };
  }

  const API = {
    EVENTS: EVENTS, DISPATCH: DISPATCH, ECHO_MS: ECHO_MS, ENTRANCE_MS: ENTRANCE_MS,
    begin, trigger, take, pending, firedOf, worldOf, tableOfCur, tableOf,
    entranceOf, changeOf, entranceActive, matrixRow, lineOf,
    stageState, markBattleSeen,
  };
  G.BattleStory = API;
  return API;
})();
