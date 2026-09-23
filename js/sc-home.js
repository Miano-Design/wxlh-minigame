/* 灯阁（首页）—— 照网页版 js/ui.js 的 homeScreen() 一段一段抄
   ------------------------------------------------------------------------------
   网页版顺序（V9.5.x 定死）：主角卡 → 主线 → 养成（含日常）→ 游历 → 挂机 → 设置。
   两条规矩照抄：① 同一个功能在首页只出现一次；② 提示都写在界面上，不靠悬停。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));

  /* ---------- 首次操作引导（网页版 coachmark 的画布版）----------
     V9.6.30：集中一处按页面查表，挂在 cv.js 渲染完之后（那时 CV.hits 已经齐了）。
     每条只弹一次（S.coachSeen），一页命中多条时按顺序：这次弹第一条，下次进来弹第二条。 */
  /* V9.6.35（父亲大人定的需求：完全强制 / 逐项 / 必须点中 / 旁白式 / 与主线合并）：
     开局第一组 —— 逐项介绍**主角卡**（主线一「熟悉身体」就是这一步）。
     四行各讲一句，点一下听下一项（swallow：只推进、不跳页），
     最后一步要求**真的点开主角卡**——那才是主线一真正要的动作。 */
  /* ============================================================================
     开场引导（V9.6.67，父亲大人："第一个引导我点了高亮他就直接进去角色卡了，
     要不顺便就介绍六维，然后再回到首页介绍别的 —— 你要判定哪些引导是可以点进去二级界面，
     哪些只是介绍"）。

     所以每一步都必须先声明**它是哪一类**：
       · enter: true   —— **点了就进去**：这一下真的执行那个动作（开角色卡 / 开主线那一步），
                          进去之后由下一步接着讲（页面切过去就会播）。
       · 不写 enter     —— **只是介绍**：点高亮只推进讲解，绝不顺手动页面/花资源。
     back: true 表示"这一步讲完自动退回上一层"（比如讲完六维回首页接着讲养成区）。
     三步之外不再横跨别的模块 —— 详细怎么玩交给主线（点「去完成」才开）。 */
  const OPENING = [
    /* 锚点用**整张卡**（open_protag 才是真的那颗动作；hero:0..3 只是四行的定位锚，
       没有处理器 —— 拿它当"点进去"的锚，点下去什么都不会发生）。 */
    { key: 'tut_blk1', page: 'home', target: 'open_protag', enter: true,
      text: '① 角色卡：你的身份和状态都在这 —— 境界（修为阶段）、等级、待分配的属性/技能点、转生次数。 点开这张卡，里面的六维我接着讲。' },
    { key: 'tut_blk1x', page: 'protag', target: 'attr_card', back: true, where: '角色卡',
      text: '这就是六维：升级拿到的属性点在这里一点一点加，每一维管什么下面都写着（生命/速度/技能伤害…）。 看完我带你回首页，接着讲别的。' },
    { key: 'tut_blk2', page: 'home', target: 'grid:grow',
      text: '② 养成区：13 条养成线都在这排格子里 —— 队伍、成长、秘术阁、法宝、药园、坐骑、炼化台… 前期不用全点，缺什么补什么；每条点进去都会有它自己的说明。' },
    { key: 'tut_blk3', page: 'home', target: 'grid:daily',
      text: '③ 日常区：每天该做的事 —— 限时悬赏、每日任务、成就、点灯，还有招募和兑换。 有红点的就是"有东西可领"，别让它亮着。' },
    { key: 'tut_blk4', page: 'home', target: ['claim_quest', 'goto_quest'], enter: true,
      text: '详细怎么玩，跟着主线走就行 —— 每点一次「去完成」，我都会带你做那一步。 下面这条就是主线：做完一步回来领奖励，接着下一步。' },
  ];
  /* V9.6.69：首页那一行"还没解锁：…"点开要能看到"怎么解锁" —— 这里存一份当前未解锁的条目 */
  let lockedEntries = [];
  /* V9.6.69（资料 §7）：红点收敛 —— 一组里最多亮 2 个，多出来的收进标题的「+N」。
     满屏红点＝没有红点：到处都亮，玩家反而看不出该先干哪件。 */
  function trimDots(list) {
    let shown = 0, hidden = 0;
    const out = list.map(function (x) {
      if (!x[4]) return x;
      if (shown < 2) { shown++; return x; }
      hidden++;
      return [x[0], x[1], x[2], x[3], false];
    });
    return { list: out, hidden: hidden };
  }
  function openingLeft() {
    const seen = Core.S.coachSeen || {};
    return OPENING.filter(function (s) { return !seen[s.key]; }).length;
  }
  let tourRunning = false;
  /* 开场链的驱动器：一次只播**当前这一页**的那一步，讲完（或玩家跳过）再叫自己。
     不主动换页 —— 该进角色卡是玩家按①点进去的，进不去就一直等他。 */
  G.openingNext = function () {
    const S = Core.S; S.coachSeen = S.coachSeen || {};
    /* V9.6.113：GM 里点「重跑新手引导」＝玩家主动要看一遍 ——
       这一次不受下面那条"领过奖就作废"的规矩限制；整条走完自动把开关关掉。 */
    if (S.tourForce && openingLeft() === 0) { S.tourForce = false; Core.save(); }
    /* V9.6.71（与网页版同一条判断）：只要玩家**已经领过任何一个主线奖励**，
       说明他已经在按主线玩了 —— 开场链剩下的步骤直接作废，不再中途冒出来打断他。 */
    try {
      const list = Core.mainQuestState();
      if (!S.tourForce && list.some(function (x) { return x.claimed; })) {
        OPENING.forEach(function (st) { S.coachSeen[st.key] = true; });
        Core.save();
      }
    } catch (e) {}
    if (openingLeft() === 0) { tourRunning = false; return false; }
    tourRunning = true;
    if (U.coachActive && U.coachActive()) {
      /* 正在讲的是**开场链自己**的某一步 → 等它（它讲完会再叫我）；
         是**别的**引导（解锁/主线/页面）插进来的 → 先把它放下，让开场链把这几步走完。
         放下的那一条**不标已读**，玩家下次进那一页还会补讲。 */
      const cur = U.coachCurrent && U.coachCurrent();
      const mine = cur && OPENING.some(function (s) { return s.key === cur.key; });
      if (mine) return true;
      if (U.coachDrop) U.coachDrop();
    }
    const page = (CV.top() || {}).name;
    for (let i = 0; i < OPENING.length; i++) {
      const st = OPENING[i];
      if (S.coachSeen[st.key]) continue;
      if (st.page !== page) continue;                      // 不在这一页：先看后面有没有本页的步骤
      U.coach(st.target, st.text, {
        key: st.key,
        mustTap: true,
        swallow: !st.enter,                                // 只是介绍的那几步：只推进，不执行原动作
        where: st.where,
        onDone: function () {
          if (st.back) CV.pop();                           // 讲完自动退回上一层，接着讲别的
          G.openingNext();
        },
      });
      return true;
    }
    /* V9.6.67：这一页**没有**开场步骤（比如玩家先进了残域）—— 返回 false，
       让 coachFor 继续往下走（解锁指引 / 主线指引 / 页面指引），
       不然"开场链没走完"会把所有其它引导一直堵住。 */
    return false;
  };

  G.tourNext = G.openingNext;   // 老名字留着（别处/文档还提过），指向同一条链

  /* ============================================================================
     V9.6.59 紧急恢复：上一版我重写 coachHero 时用切片替换，
     **把 TUT（主线步）和 UNLOCK_GUIDE（解锁指引）两张表连同它们的两个函数一起切掉了** ——
     而 G.coachFor 仍在调用它们 → 每次渲染都抛 ReferenceError（页面画一半就断）。
     教训：用"首尾标记切片"改代码，一定要先确认两个标记之间**只有**要替换的内容。
     下面按原内容恢复（并保留之前审计过的去重与锚点修正）。
     ============================================================================ */

  /* 主线每一步 = 引导的一步（父亲大人：合并成一套） */
  /* V9.6.67：同一件事只讲一遍 —— 解锁那条 / 主线那条 / 页面那条共用钥匙 */
  const TOPIC_KEY = {
    enhance: 'guide_enhance', bloodline: 'guide_bloodline', corridor: 'guide_corridor',
    recruit: 'guide_recruit', buildings: 'guide_buildings',
  };
  const QUEST_TOPIC = { q07: 'enhance', q13: 'bloodline', q11: 'corridor', q09: 'buildings' };
  /* 页面 → 中文名：引导卡里写"去「XX」完成这一步"用（父亲大人：不能只给一张没指向的卡） */
  const PAGE_NAME = {
    home: '灯阁首页', world: '残域·世界页', dungeon: '残域', bag: '背包（切到装备）',
    party: '队伍', corridor: '深井', protag: '主角详情', buildings: '基地建设',
    recruit: '招募伙伴', tasks: '任务', shop: '兑换大厅', genelock: '铭刻',
    beast: '伴生体', reincarn: '转生天赋', keji: '秘术阁', fabao: '法宝',
    mount: '坐骑', garden: '药园', arena: '斗法台', sign: '点灯', refine: '炼化台',
    bounty: '限时悬赏', idlelines: '挂机分工',
  };
  /* V9.6.112（父亲大人："第一关的指引打完之后出来还是第一关的指引"）：
     「接着打哪一关」不能写死成 stage:0 —— 打完第 1 关回到世界页，高亮还指着第 1 关，
     玩家只会觉得引导没更新。这里永远给**第一个还没通关**的普通关。
     （写死关号的那几步（q05 指第 4 关、q10/q14/q15 指第 12 关）保持不动：
       它们本来就是"打到那一关"，而且"已经做完了"那一步由 goQuest 直接送回首页领奖。） */
  function nextStageAnchor(wid) {
    const w = (G.Core && G.Core.S && G.Core.S.worlds && G.Core.S.worlds[wid]) || null;
    const arr = (w && w.stages && w.stages.normal) || [];
    for (let i = 0; i < arr.length; i++) if (!arr[i]) return 'stage:' + i;
    return 'stage:11';
  }
  const TUT = {
    /* V9.6.112（父亲大人："第一关的指引打完之后出来还是第一关的指引"）：见 nextStageAnchor ——
       「接着打哪一关」永远指向**第一个还没通关**的普通关，不写死。 */
    /* 同一件事的三条入口共用一把钥匙（V9.6.67）：
       解锁时那条（UNLOCK_GUIDE）、主线那一步（TUT）、页面级那一句（C 表）——
       谁先讲，另外两条自动跳过，不再连着看三张一模一样的卡。 */
    /* V9.6.67（查漏补缺）：同一个功能有**三条入口**会各讲一句 ——
       解锁时（UNLOCK_GUIDE）、主线那一步（TUT）、页面级那一句（下面的 C 表）。
       三张卡内容几乎一样，玩家会连着看三遍（第一张刚点掉，第二张又冒出来）。
       给它们**同一把钥匙**：谁先讲，后面两条自动跳过（见 TOPIC_KEY / QUEST_TOPIC）。 */
    /* V9.6.66（与网页版对齐）：主线一「熟悉身体」的落点是**角色页**，就讲角色页里的东西。
       原来这里写的是 run: coachHero（重播首页三区块）—— 玩家点「去完成」进到角色页，
       屏幕上却飘着"① 角色卡：你的身份和状态都在这"那张讲首页的卡，指的还是被盖住的首页。
       （开场三区块由 TOUR 负责，跟主线一不是同一件事。） */
    /* V9.6.67：锚点改用整块六维卡（attr_card）—— 加点的 +1/+10 在没点数时**不登记热区**，
       只锚它们会让这一步在新号上找不到位置；`key` 与开场链那条（tut_blk1x）**共用**，
       因为讲的是同一件事：谁先讲，另一条自动跳过（否则讲完六维回首页时，
       这一条会被"顺手登记"，然后挂在首页上指着一个不存在的目标）。 */
    q01:  { page: 'protag',  s: ['attr_card'], key: 'tut_blk1x', t: '这是你的属性面板：升级得属性点和技能点，点 +1 分配，六维、技能、装备、命格都在这一页。' },
    q01b: { page: 'world',   s: function () { return [nextStageAnchor('W01'), 'stage_grid']; },
            t: '这一关就是你的第一场仗 —— 点它直接开打；一关要一口气打完所有波次。' },
    /* V9.6.112：锚点改成**下一关**（打完第 1 关就指第 2 关），文案也跟着说"接着打"。
       以前写死 stage:0：玩家刚打完第 1 关，出来又看见一条指着第 1 关的引导。 */
    q02:  { page: 'world',   s: function () { return [nextStageAnchor('W01'), 'stage_grid']; },
            t: '接着往下打 —— 打完一关会自动解锁下一关，结算页右下角直接给你「下一关」。' },
    /* V9.6.69：q04「并肩作战」原来没有专门一条（只在开场讲过招募/队伍）——
       父亲大人指的"第 5 步高亮只亮一小块"就是这一步。现在给它一条：锚点用**整块阵型区**
       （party_board，两排五格），而不是某个格子或"前排"两个字。 */
    /* V9.6.106（父亲大人："现在队伍上阵又上不了了"）：
       这一步的锚点原来只有 `party_board`（整块阵型区）—— 它**没有任何动作**，
       而这一步又是"做完才放行"（要真的上阵 1 名伙伴）。于是：高亮指向一块点不动的区域，
       其余点击全被引导吃掉 → **玩家在队伍页上不了阵**。
       现在锚点先给**真能点的空格**（`pslot:*` → 点它开挑人页 → 选中伙伴即完成这一步），
       整块阵型区退成第二顺位（没有空格时才用它做视觉锚点）。 */
    q04:  { page: 'party',   s: ['pslot:*', 'party_board'], t: '上阵就在这块：点空格把伙伴放进去（共 5 格，主角占 1 格）。想换位置长按任意一格抓起、拖到别处松手。' },
    /* V9.6.103（父亲大人："主线 4 的去完成引导还是错的，引导到副本去了"）：
       q03「第一位同伴」原来**在这张表里没有条目** —— 开场三区块讲过招募，所以当时
       "不重复讲"是对的；但落点也必须在这张表里，否则 goQuest 拿不到目标页、掉进兜底
       （那一刻的兜底是"送残域"），玩家点主线 4 就被送去看副本 ✗。
       而且 V9.6.66 定的规矩是"玩家主动点去完成，永远该有话说" —— 所以补一条**独立**的：
       自己的 key（go_q03），不跟开场那条共用，点了就一定讲一遍。 */
    /* V9.6.112（父亲大人："招募的指引得点好几下才能换"）：
       这一步原来用的是**自己一把钥匙**（go_q03），于是同一页会连着讲三条几乎一样的卡：
       解锁那条（guide_recruit）、页面那条（guide_recruit）、主线这条（go_q03）——
       玩家点掉一张又来一张，感受就是"得点好几下才能换"。
       现在三处**共用一把钥匙**（TOPIC_KEY.recruit）；玩家点「去完成」时 goQuest 会开
       coachForce 窗口，所以"主动求引导"照样会再讲一遍，不会漏。 */
    q03:  { page: 'recruit', s: ['pull1:normal', 'pull1:normal:free'], key: TOPIC_KEY.recruit,
            t: '招募伙伴：每天有免费次数，先用掉 —— 免费抽也计入这条主线。想多抽就往下选池子。' },
    /* V9.6.74：q05 合并了原来的第 2/3/4 关；q06/q08 已删（任务表里没有它们了） */
    /* V9.6.112（quest_play_audit 抓到的第二处）：原来写 stage:3（第 4 关）——
       可那时候第 4 关**还没解锁、页面上根本没登记热区**，锚点就退成 stage_grid
       那块**没有动作**的整片区域：玩家点高亮什么都不发生，还得点好几下才换，
       "一路推进到第 4 关"这一步永远做不完。
       改成"第一个还没通关的那一关"（一定是已解锁、点了就开打的那一颗），
       玩家顺着 2→3→4 一路打下去，文案说的还是"推进到第 4 关"。 */
    q05:  { page: 'world',   s: function () { return [nextStageAnchor('W01'), 'stage_grid']; },
            t: '一路推进到第 4 关 —— 打完这一关会解锁「装备强化 / 基地建设 / 每日任务」。' },
    q07:  { page: 'bag',     s: ['eqd:*', 'bagview:equip'], t: '强化在这里：切到「装备」，点一件装备进去花材料强化。' },
    q09:  { page: 'buildings', s: ['bup:*'], t: '建筑每升一级都是永久加成 —— 灯芯加挂机产出、训练室加经验、医疗室加离线效率；花的是挂机就能刷的点数。' },
    q10:  { page: 'world',   s: function () { return [nextStageAnchor('W01'), 'stage_grid']; },
            t: '第 12 关是这一世界的守关 Boss —— 打完解锁下一个世界。一路打过去。' },
    q11:  { page: 'corridor', s: ['corridor_fight'], t: '深井：一直往上打、没有重置。每 10 层给一枚深井印记，井内全属性加成。' },
    /* V9.6.74（主线重排，与网页版同一条链）：补上"系统课"这几步的引导 —— 每条只教一件不同的事 */
    /* V9.6.112（真流程审计）：锚点原来只有**标签页**（点它只是切标签，什么事都没发生），
       玩家点完发现这一步还是没完成。现在优先指"能领的那颗按钮"，没得领才退回标签。 */
    /* V9.6.112（真流程审计）：任务页默认停在**主线**标签，而"领 1 次奖励"要做的是
       **日常**标签里的「领取」；锚点原来只指主线标签 → 点一下只是切标签、这一步永远完不成。
       现在优先指"能领的那颗按钮"，没有就指「日常」标签 —— 切过去之后
       （waitFor 还挂着）高亮会自动移到那颗「领取」，玩家照着一路点就完成了。 */
    q_tasks:   { page: 'tasks',     s: ['task_claim:*', 'tasktab:daily'],
                 t: '做完的任务在这页点「领取」收下 —— 日常任务在「日常」标签里。' },
    q_keji:    { page: 'keji',      s: ['keji_up:*'],      t: '秘术阁：每条点一下按 ◆ 异界结晶升级、立刻永久生效。先挑一条主修的堆。' },
    q_fabao:   { page: 'fabao',     s: ['fabao_buy:*'],    t: '法宝：花 ◉ 点数买一件，「带上」它。给的是效果（汲取 / 开场能量 / 减伤），不是数值。' },
    q_garden:  { page: 'garden',    s: ['garden_plant:*'], t: '药园：空地上种一次，过一段时间回来收（不收就一直长着）。' },
    q_sign:    { page: 'sign',      s: ['sign_draw'],      t: '点灯：每天免费点一次，灯焰给当天的挂机加成 + 一点硬通货。' },
    q_arena:   { page: 'arena',     s: ['arena_fight'],    t: '斗法台：每天 5 次，赢了升一台拿 ◆ 异界结晶，输了退一台。' },
    q_mount:   { page: 'mount',     s: ['mount_buy:*'],    t: '坐骑：花 ◉ 点数驯服一匹，「乘骑」它给全队加属性。' },
    q_realm:   { page: 'realm',     s: ['realm_try'],      t: '境界渡劫：攒够材料就突破一小阶，全属性永久上涨；失败只扣材料、等级不掉。' },
    q_reincarn:{ page: 'reincarn',  s: ['do_reincarn'],    t: '转生：重置等级与世界进度换永久天赋点（条件逐次抬高，第 1 次 Lv.100 + 铭刻 2 阶 + 灯芯 Lv.20）。' },
    /* V9.6.75（父亲大人："你安排"）：再补两条每天都会碰的系统 —— 挂机分工 / 限时悬赏 */
    /* V9.6.112：派领队要有"没上阵的伙伴"才登记按钮 —— 手上只有一名伙伴、还上了阵的玩家，
       这一页一个按钮都没有（引导只能退成一张讲不清的卡片）。文案里把这条出路写上。 */
    q_idle:    { page: 'idlelines', s: ['pickleader:*'],   t: '挂机分工：4 条产线各派 1 名领队（看领队**对应那一维**，不是战力）；没派领队的产线不产出。没有可派的伙伴就先回首页去招募。' },
    q_bounty:  { page: 'bounty',    s: ['bounty_claim:*'], t: '限时悬赏：达成后手动领奖，到点作废 —— 别让它白白过期。' },
    /* 伴生体在潜影窟第 3 关解锁，灯录随收集推进 —— 都放在这个位置 */
    q_beast:   { page: 'beast',     s: ['beast_hatch1'],   t: '伴生体：用兽魂石孵化，孵出来带上场给全队加属性。' },
    q_codex:   { page: 'codex',     s: ['codex_claim:*'],  t: '灯录：收集伙伴解锁里程碑奖励，收满了就回来领。' },
    /* V9.6.70（静态审计查出来的）：q12 / q14 / q15 原来**没有引导** —— 点了「去完成」只是跳到那个世界、什么都不说。 */
    q12:  { page: 'world', s: function () { return [nextStageAnchor('W02'), 'stage_grid']; },
            t: '下一个世界「潜影窟」：点第 1 关开打。换个世界敌人会更硬 —— 打不动就回首页收挂机收益、回队伍练一练再回来。' },
    q14:  { page: 'world', s: function () { return [nextStageAnchor('W02'), 'stage_grid']; },
            t: '这一关打完就通关整个潜影窟了 —— 点第 12 关（守关 Boss）。' },
    q15:  { page: 'world', s: function () { return [nextStageAnchor('W03'), 'stage_grid']; },
            t: '最后这个世界「怨声旧宅」的守关 Boss —— 点第 12 关。打之前先把挂机收益收掉、装备拉满。' },
    q13:  { page: 'protag',  s: ['pblup'], t: '命格升级消耗异界结晶 + 点数 —— 这是中期最猛的成长线，每级全属性都涨。' },
  };
  /* V9.6.99（"点去完成把我送到别的界面、弹窗内容还不对"）：
     每一步该去哪一页、指哪一颗，**这张表就是唯一出处**。
     sc-last 的 goQuest 以前自己另写了一套落点（只特判 7 步、其余全丢进残域），
     于是秘术阁/药园/求签/斗法台/伴生体/灯录/转生…统统被送到残域。现在它来问这里。 */
  G.questTarget = function (qid) { return (TUT[qid] && TUT[qid].page) || null; };
  /* 引导表本身也挂出去一份（只读）：审计脚本要用它核对"这一步该讲哪句话" */
  G.questGuide = TUT;
  /* V9.6.112（父亲大人："招募的指引得点好几下才能换"）：**页面引导表**从 coachFor 里提出来，
     提到模块级 —— 这样"同一条主线步"和"同一页的基础引导"能对上同一把钥匙（见 pageGuideKey）。
     原来这两张表各算各的 key，同一件事在两处各说一遍：玩家点掉一张又来一张，
     感受就是"得点好几下才能换"。 */
  const PAGE_GUIDE = [
    /* key 与开场链最后一步（tut_blk4）共用：讲的是同一件事（主线那颗按钮） */
    ['home', ['claim_quest', 'goto_quest'], '主线每一步做完都能领奖励 —— 右边那颗按钮。', 'tut_blk4'],
    /* V9.6.112：这条和 q01b 的引导讲的是**同一件事**（点第 1 关开打）。
       以前各用各的钥匙 → 玩家在 q01b 那条点掉之后，这条又冒出来讲一遍，
       看着就是"第一关的指引打完之后出来还是第一关的指引"。现在共用 q01b 的钥匙。 */
    ['world', function () { return [nextStageAnchor('W01')]; },
      '点这一关就直接开打 —— 一关是一口气打到底的，打完最后一波才算过关。', 'tut_q01b'],
    ['recruit', ['pull1:normal', 'pull1:normal:free'], '每天有免费的招募次数，先用掉 —— 免费抽也计入主线。', TOPIC_KEY.recruit],
    ['protag', ['pblup'], '命格升级消耗异界结晶 + 点数，是中期最猛的成长线。', TOPIC_KEY.bloodline],
    /* V9.6.51（复审查出：这 9 个模块页"解锁时只讲一句、进去后没人讲"）——
       每条都是"进这一页 + 这一课没讲过"才播，锚点是那颗**主操作按钮**（前缀锚点支持动态 id）。 */
    ['keji',     ['keji_up:*'],       '秘术阁：42 条长线，每条点一下按 ◆ 异界结晶升级、立刻生效 —— 前期挑两条主修的堆。'],
    ['fabao',    ['fabao_buy:*'],     '法宝：花 ◉ 点数买，「带上」一个。它给的是**效果**（汲取 / 开场能量 / 减伤），不是数值。'],
    ['mount',    ['mount_buy:*'],     '坐骑：驯服后带上，给全队加属性；养成线里最省事的一条。'],
    ['garden',   ['garden_plant:*'],  '药园：空地上种，过一段时间回来收 —— 不收就一直长着，别忘了。'],
    ['arena',    ['arena_fight'],     '斗法台：每天 5 次机会，赢了升一台拿 ◆ 异界结晶，输了退一台（次数照常消耗，不会卡死在第 1 台）。'],
    ['sign',     ['sign_draw'],       '点灯：每天免费点一次，灯焰给**当天**的挂机加成 + 一点硬通货。'],
    ['refine',   ['craft:*'],         '炼化台：强化材料 + 点数炼精华，精华喂给伙伴是**永久**加成（每人每种有上限）。'],
    ['bounty',   ['bounty_claim:*'],  '限时悬赏：到点作废、达成才有奖励；四条全部结束后可以开新一期。'],
    ['idlelines',['pickleader:*'],    '挂机分工：4 条产线各派 1 名领队，领队战力越高产出越高；没派领队的产线不产出。'],
    /* 这四条是"看数值/被动成长"的页，没有单一主按钮 —— 锚点留空（引擎会自动退成"点一下继续"），
       但话必须说清"花什么、涨什么、多久涨"，不然玩家进来只会看到一屏数字。 */
    ['authority', [], '灯阁权限：花 ✦ 圣洁晶石 + ◆ 结晶升，给的全是**倍率** —— 挂机产出、离线上限、离线效率、每日扫荡次数。'],
    ['sect',      [], '灯阁评级：**打关卡自动涨**，每级全队全属性 +0.5% —— 不用手动点，所以别在这页找按钮。'],
    ['realm',     [], '境界渡劫：每突破一小阶**全属性永久上涨**，36 阶走满合计 +50.4%。渡劫入口在这张卡下面的按钮。'],
    ['codex',     [], '灯录：收集伙伴解锁里程碑奖励，收满了就回来领。'],
    ['roster',    [], '执灯者：上阵的排前面（带红色角标），点卡片看详情 —— 等级、星级、命格、装备都在里面。'],
    ['char',      ['lv1'], '伙伴详情：升级 / 升星 / 命格升级 / 装备全在这一页；最下面是属性面板和队伍操作（从队伍点进来才有）。'],
    /* V9.6.112（父亲大人："上阵也得上两个"）：**两步的流程，第二步也要有人说话**。
       上阵 = 点空格 → 进挑人页 → 点一个伙伴；强化 = 点一件装备 → 进装备详情 → 点「强化」。
       以前引导只在第一步把话说完，玩家进到第二页看着一列名字/一堆按钮愣在那里。 */
    ['pickparty', ['set:*', 'page_back'], '点一个伙伴，他就上阵了 —— 左上角可以取消，不用怕点错。'],
    ['eqdetail',  ['eq_enh', 'eq_back'],  '点「强化」花材料升一级 —— 成功或失败都算一次，强化不会掉级。'],
  ];
  /* 同一页、同一个首锚点 = 同一件事 → 用同一把钥匙（谁先讲，另一处自动跳过） */
  function pageGuideKey(page, anchors) {
    const first = String([].concat(anchors || [])[0] || '');
    for (let i = 0; i < PAGE_GUIDE.length; i++) {
      const row = PAGE_GUIDE[i];
      if (row[0] !== page) continue;
      const rowAnchors = (typeof row[1] === 'function') ? row[1]() : row[1];
      if (String([].concat(rowAnchors || [])[0] || '') !== first) continue;
      return row[3] || ('tut_page_' + page + '_' + [].concat(rowAnchors).join('_'));
    }
    return null;
  }
  function coachByQuest(page) {
    const cu = Core.currentQuest && Core.currentQuest();
    const qid = cu && cu.q && cu.q.id;
    const rule = qid && TUT[qid];
    if (!rule || rule.page !== page) return false;
    /* 与"解锁时"那一条共用钥匙：同一件事只讲一遍（V9.6.67）。
       rule.key 用于和**开场链**里讲同一件事的那一步共用（比如主线一 ↔ 开场讲六维）。 */
    /* V9.6.112：钥匙的优先级 —— 这一步自己写的 > 主题共用钥匙 > **本页基础引导那一把** > 按步号。
       第三档是这一版补的：同一件事在"主线步"和"页面引导"里各有一份文案，
       以前两边各算各的 key → 同一件事讲两遍（"得点好几下才能换"）。 */
    /* V9.6.112：锚点允许写成**函数**（"接着打下一关"这种要按当前进度算的）。
       其余地方照旧读 rule.s（字符串数组）。先算锚点，钥匙要用它去对页面引导表。 */
    const anchors = (typeof rule.s === 'function') ? rule.s() : rule.s;
    const key = rule.key || TOPIC_KEY[QUEST_TOPIC[qid]] || pageGuideKey(page, anchors) || ('tut_' + qid);
    /* V9.6.66（与网页版同步）：玩家自己点「前往 ›」＝主动求引导，这次必须再讲一遍 */
    if (U.coachSeen(key) && !U.coachForced()) return false;
    if (rule.run) { rule.run(); return true; }
    /* V9.6.61（父亲大人拍板第 2 条：做完才放行）：
       主线这一课的"过关条件"就是**那一步主线本身有没有完成** ——
       直接绑它的 check()，所以"点一下按钮"不算过，得真做完。
       （每一步仍然保留「跳过这一步」，所以不会把人卡死。） */
    const quest = (D.MAIN_QUESTS || []).filter(function (q) { return q.id === qid; })[0];
    /* V9.6.66（与网页版对齐）：这一步**已经做完了**的（比如"熟悉身体"就是打开角色页本身）
       就不能再挂 waitFor —— 否则引导刚登记就被判定"做完"、当场自己消失，玩家什么都看不见。
       没做过的才用"做完才放行"。 */
    const alreadyDone = quest ? !!quest.check(Core.S) : false;
    /* V9.6.106（"队伍上阵又上不了了"）：**锚点必须点了有用**。
       以前不管锚点有没有动作，一律 swallow:false + waitFor（做完才放行）——
       于是只要锚点是一块"区域"（party_board / attr_card 这种纯视觉锚点），
       就会出现：高亮的地方点了没反应、点别处又被引导吃掉 → 玩家彻底卡住。
       现在先看有没有"真能点"的那一颗：
         · 有 → 照旧：点高亮真的生效，做完才放行；
         · 没有 → 这一条只当讲解：点高亮只是翻页（swallow:true），也不挂"做完才放行"。 */
    /* 判"点了有用"要**看这一页真正登记出来的热区**（coachFor 是在页面画完之后才跑的，
       CV.hits 已经齐了）：锚点能匹配到某颗热区、且那颗热区有处理器 → 才算"有用"。
       （V9.6.106 第一版只查了 onAct 的键名，漏掉"逐个注册"的写法 ——
         队伍的空格是 pslot:0…4，锚点写 pslot:* 就匹配不到键名，于是被误判成"点了没用"。） */
    const actionable = [].concat(anchors || []).some(function (anchor) {
      const a = String(anchor);
      return (CV.hits || []).some(function (h) {
        const id = String(h.id);
        const matched = a.slice(-1) === '*' ? id.indexOf(a.slice(0, -1)) === 0 : id === a;
        if (!matched) return false;
        if (CV.onAct[id]) return true;                                  // 精确处理器
        const i = id.indexOf(':');
        return i > 0 && !!CV.onAct[id.slice(0, i + 1) + '*'];            // 前缀处理器
      });
    });
    U.coach(anchors, rule.t, {
      key: key,
      queue: true,          // V9.6.71：玩家主动点「去完成」的那一步，不能被别的引导挤掉
      mustTap: true,
      /* swallow:false = 点高亮的那一下**真的生效**（点关卡就开打、点装备就进强化）。
         配 waitFor 用：点完不消提示，等这一步真做完才放行。 */
      swallow: !actionable,
      waitFor: (actionable && quest && !alreadyDone) ? function () { return !!quest.check(Core.S); } : null,
      where: PAGE_NAME[rule.page] || rule.page,
    });
    return true;
  }
  /* V9.6.112：把"这一步用的引导钥匙"算给外面（goQuest 要用它开"只对这一条破例"的窗口）——
     口径和上面 coachByQuest 里那一行**必须一致**，所以抽成一个函数，两边都调它。 */
  G.questGuideKey = function (qid) {
    const rule = TUT[qid];
    if (!rule) return null;
    const anchors = (typeof rule.s === 'function') ? rule.s() : rule.s;
    return rule.key || TOPIC_KEY[QUEST_TOPIC[qid]] || pageGuideKey(rule.page, anchors) || ('tut_' + qid);
  };

  /* 新解锁的功能也自动开指引（父亲大人第 2 条：解锁时弹窗打断）。
     判定是"该模块已解锁 + 这一课没讲过"，所以新号刚解锁、老号从没进过，都会补一次。
     锚点可以写前缀（'bup:*' / 'eqd:*'），动态 id 也能锚。 */
  const UNLOCK_GUIDE = {
    /* 与主线步 / 页面级那两句共用钥匙（V9.6.67）——同一件事只讲一遍 */
    recruit:  { page: 'recruit',  s: ['pull1:normal', 'pull1:normal:free'], t: '招募解锁了：每天有免费次数先用掉，抽到的伙伴记得去「队伍」上阵。' },
    shop:     { page: 'shop',     s: ['shoptab:god'], t: '兑换大厅：四家店各用不同货币，日常用券和材料都在这儿补。' },
    enhance:  { page: 'bag',      s: ['bagview:equip', 'eqd:*'], t: '装备强化解锁了：切到「装备」、点一件进去，花材料提升数值。' },
    buildings:{ page: 'buildings', s: ['bup:*'], t: '基地建设：五栋建筑每升一级都是永久加成，花的是挂机就能刷的点数。' },
    tasks:    { page: 'tasks',    s: ['tasktab:main'], t: '任务解锁了：主线 / 日常 / 周常 / 成就四个标签，做完记得回来领。' },
    corridor: { page: 'corridor', s: ['corridor_fight'], t: '深井解锁了：一直往上打、没有重置，每 10 层给一枚印记加成。' },
    bloodline:{ page: 'protag',   s: ['pblup'], t: '命格解锁了：升级消耗异界结晶 + 点数，每级全属性都涨。' },
    geneLock: { page: 'genelock', s: ['gl_unlock'], t: '铭刻解锁了：一条条点满，每条都是永久加成 —— 花的是异界结晶。' },
    beast:    { page: 'beast',    s: ['beast_hatch1', 'beast_hatch10'], t: '伴生体解锁了：花蛋孵出来能带上场，给全队加属性。' },
    reincarn: { page: 'reincarn', s: ['do_reincarn'], t: '转生解锁了：重置等级和世界进度换永久天赋点 —— 中后期的主力成长线。' },
  };
  /* V9.6.62（父亲大人拍板第 3 条：解锁弹窗"时机要准，不能影响体验"）—— 三道闸：
       ① 不在战斗中（战斗是整屏接管，弹层会打断节奏）；
       ② 不叠在别的确认框/弹窗上（U.overlay 开着就先不弹）；
       ③ 不在切页那一瞬间（等 ~0.4 秒，页面稳了再说）。 */
  let lastPage = null, lastPageAt = 0;
  function coachPageSettled(page) {
    if (page !== lastPage) { lastPage = page; lastPageAt = Date.now(); return false; }
    return (Date.now() - lastPageAt) > 400;
  }
  function coachByUnlock(page) {
    if (page === 'battle') return false;                          // ①
    if (G.U && G.U.overlay) return false;                         // ②
    if (!coachPageSettled(page)) return false;                    // ③
    const ids = Object.keys(UNLOCK_GUIDE);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], g = UNLOCK_GUIDE[id];
      if (g.page !== page) continue;
      if (!(Core.isUnlocked && Core.isUnlocked(id))) continue;
      const key = TOPIC_KEY[id] || ('tut_unlock_' + id);
      if (U.coachSeen(key)) continue;
      U.coach(g.s.length ? g.s : 'page_back', g.t, { key: key, mustTap: g.s.length > 0 });
      return true;
    }
    return false;
  }

  G.coachFor = function (page) {
    if (G.U && G.U.overlay) return;      // 别的弹窗（比如登录奖励）开着就先不弹引导
    /* V9.6.90：开机弹窗（离线收益 / 七日登录）**优先于引导** ——
       网页版 webTour 也是等弹窗栈空了才接上（父亲大人报过"第一次登录引导和七天登录奖励弹窗打架"）。
       这里排好队：弹窗先讲，讲完引导自己会接上。 */
    if (G.bootModalPending && G.bootModalPending()) return;
    /* V9.6.67：开场链优先 —— 但**只在这一页真有开场步骤时**才占位。
       玩家要是先跑去了残域/背包，这里就放行给解锁指引和主线指引，
       不至于"开场链没走完 → 别的引导全都不给"。 */
    if (G.openingNext()) return;
    /* V9.6.103（"点主线 1 的去完成，进角色卡却讲血统解锁…"）：
       玩家**主动**点「去完成」（coachForced 窗口内）= 他要求你讲**这一步**。
       所以这一步的主线指引要排在"模块解锁 / 页面导览"那两种前面 ——
       否则同一页上先到的那条会抢话，玩家看到的就不是这一步要干的事。 */
    if (U.coachForced && U.coachForced() && coachByQuest(page)) return;
    if (coachByUnlock(page)) return;     // 刚解锁的模块优先讲
    if (coachByQuest(page)) return;      // 主线那一步优先（合并成一套：一次只讲一件事）
    PAGE_GUIDE.forEach(function (row) {
      if (row[0] !== page) return;
      /* V9.6.112：锚点允许写成**函数**（"接着打下一关"要按当前进度算） */
      const anchors = (typeof row[1] === 'function') ? row[1]() : row[1];
      /* 页面级的基础引导也走「必须点中」（父亲大人要的是完全强制）—— 之前这几个是「看到就过」。 */
      /* row[3] = 与其它入口共用的钥匙（有就不重复讲） */
      U.coach(anchors, row[2], { key: row[3] || ('tut_page_' + row[0] + '_' + [].concat(anchors).join('_')), mustTap: true, queue: true });
    });
  };

  /* 未解锁一览：名字 + **怎么解锁**（对应网页版「🔒 还没解锁的功能」弹窗） */
  CV.register('locked', function () {
    U.begin();
    U.btn(U.pad(), U.y, 44 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'page_back');
    CV.text('还没解锁的功能', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    if (!lockedEntries.length) { U.hint('该解锁的都解锁了。', 4 * CV.SCALE); return; }
    U.card(function () {
      U.h3('🔒 一共 ' + lockedEntries.length + ' 项', '解锁条件都写在下面');
      lockedEntries.forEach(function (x) {
        U.listRow({ t1: x[1], t2: Core.unlockTip(x[3]) });
      });
    });
    U.hint('点左上角返回首页，接着玩。', 4 * CV.SCALE);
  });
  CV.on('open_locked', function () { CV.push('locked'); });

  CV.register('home', function () {
    const S = Core.S;
    U.begin();

    /* ① 主角卡 .card.text-rows：四行【标签】值，行间虚线；整块都能点进角色页 */
    const st = Core.realmState(), au = Core.authorityInfo(), sect = Core.sectInfo();
    const rows = [
      ['【境界】', st.curName || '未定命格', st.hasBloodline ? ('已突破 ' + st.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶') : ''],
      ['【等级】', 'Lv.' + S.player.level, 'EXP ' + Math.floor((S.player.exp / (D.EXP_TABLE[S.player.level] || 1)) * 100) + '%'],
      ['【主角】', '六维待分 ' + (S.player.attrPoints || 0) + ' · 技能待加 ' + (S.player.skillPoints || 0), ''],
      ['【转生】', S.player.reincarnations + ' 世', '权限 Lv.' + au.lv + ' · 评级 Lv.' + sect.lv],
    ];
    const cardH = U.card(function () {
      const rowH = 33.5 * CV.SCALE;      // 网页版 .text-rows .row 实测 33.5（卡片总高 163）
      const top = U.y;
      rows.forEach(function (r, i) {
        const cy = top + rowH * i + rowH / 2;
        CV.text(r[0], U.ix(), cy, { size: CV.FS.md, color: CV.C.dim });
        const vw = CV.measure(r[1], CV.FS.lg, true);
        const sw = r[2] ? CV.measure(r[2], CV.FS.sm) + 8 * CV.SCALE : 0;
        /* V1.0.1（父亲大人："六维待分的字没有待加的时候灰字展示就行了，不用一直高亮"）：
           原来 i===2（【主角】六维待分 / 技能待加）**永远金色**，没有待加点时也在发光。
           改成和网页版同一条判据：有点数才 gold，没有就 dim。 */
        const valColor = (i === 0 && st.hasBloodline) ? CV.C.gold
          : i === 2 ? ((S.player.attrPoints || S.player.skillPoints) ? CV.C.gold : CV.C.dim)
          : CV.C.text;
        CV.text(CV.fit(r[1], U.iw() - 28 * CV.SCALE - sw, CV.FS.lg, true), U.ix() + U.iw() - vw - sw, cy,
          { size: CV.FS.lg, bold: true, color: valColor });
        if (r[2]) CV.text(r[2], U.ix() + U.iw(), cy, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
        /* V9.6.35：四行各登记一颗热区 —— 开局引导要**逐项**讲（父亲大人：逐项介绍），
           只有整卡一颗热区的话，"讲【等级】"就没法只高亮那一行。 */
        CV.hit('hero:' + i, U.ix(), cy - rowH / 2, U.iw(), rowH);
        if (i < rows.length - 1) {
          CV.ctx.save();
          CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
          CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + rowH * (i + 1) - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + rowH * (i + 1) - .5); CV.ctx.stroke();
          CV.ctx.restore();
        }
      });
      U.y = top + rowH * rows.length;
    });
    CV.hit('open_protag', U.pad(), U.y - cardH - CV.SP[2], U.cw(), cardH);

    /* ② 主线卡（网页版 questStrip） */
    const mq = Core.mainQuestState();
    const qi = mq.findIndex((x) => !x.claimed);
    const q = qi < 0 ? null : mq[qi];
    /* V9.6.2（父亲大人："网页版的这个主线卡间距很合理，小游戏显得卡片太大"）：
       网页版主线卡是一行 .list-row（padding 0），**高度由右侧那个 40px 的按钮决定** →
       卡片实测 71.3（= 40 + 上下内边距 28 + 边框）。小游戏原来把内容写死成 72 → 卡片 100，白白高了 30。
       现在照网页版：内容块高 = 按钮高（40），标题/奖励两行在这个高度里排。 */
    U.card(function () {
      const BH = U.BTN_SM * CV.SCALE, top = U.y;
      /* V9.6.93（父亲大人："主线任务那个板块大字和小字贴一起了"）：
         网页版这块是 `.t1` + 两条 `.t2`，行距按 CSS 精确算：
           .t1  font-size 15 · line-height 1.35 → 行盒 20.25
           .t2  font-size 11 · line-height 1.55 → 行盒 17.05，且 **margin-top: 0.25rem = 4px**
         小游戏以前把三行写死在 top+10 / top+24 / top+39（推进只有 14、15），
         比网页版少了 6px 一行 —— 所以"大字和小字贴在一起"。
         现在照 CSS 直接算，行盒高度决定卡片高度（网页版是内容撑高，不是按钮撑高）。 */
      const LH1 = CV.FS.f1 * 1.35;              // 20.25 标题行
      const LH2 = CV.FS.sm * 1.55;              // 17.05 小字行
      const LGAP = 4 * CV.SCALE;                // .t2 的 margin-top
      const y1 = LH1 / 2;                       // 标题中线
      const y2 = LH1 + LGAP + LH2 / 2;          // 完成条件中线
      const y3 = LH1 + LGAP + LH2 + LGAP + LH2 / 2;   // 完成奖励中线
      if (q) {
        const label = q.done ? '领取奖励' : '去完成 ›';
        const bw = CV.measure(label, CV.FS.md) + 26 * CV.SCALE;
        const tag = '第 ' + (qi + 1) + '/' + mq.length + ' 步';
        /* .tag：11px · line-height 1.4 + padding 1px 6px + border 1px → 盒高 19.4 */
        const tagH = CV.FS.xs * 1.4 + 2 * CV.SCALE + 2 * CV.SCALE;
        const tagW = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE + 2 * CV.SCALE;
        const textW = U.iw() - bw - 10 * CV.SCALE;
        /* 标题要给右边的步数标签**留位置**（网页版是 flex 行：标题 + tag 同排，
           标题过长时自己换行）—— 原来按未截断的宽度量，长任务名会把标签顶出卡片。 */
        const title = CV.fit('主线 · ' + q.q.name, textW - tagW - 6 * CV.SCALE, CV.FS.f1, true);
        const tw = CV.measure(title, CV.FS.f1, true);
        CV.text(title, U.ix(), top + y1, { size: CV.FS.f1, bold: true });
        /* 标签和标题**同一中线**（.t1 是 align-items:center 的 flex 行） */
        CV.round(U.ix() + tw + 6 * CV.SCALE, top + y1 - tagH / 2, tagW, tagH, CV.RADIUS_SM, null, CV.C.line2);
        CV.text(tag, U.ix() + tw + 6 * CV.SCALE + tagW / 2, top + y1, { size: CV.FS.xs, color: CV.C.text2, align: 'center' });
        /* V9.6.72（父亲大人："通关条件这一行小字注释吧，要符合实际"）：
           desc 就是判定条件，原样写出来；check 和 desc 必须一致（网页版有审计规则⑥盯着）。 */
        /* V9.6.142（父亲大人："伴生体的孵化那行字被省略了"顺带全站扫）：这两行也是单行 fit →
           任务条件一长就被砍成「完成条件：打开主页最上面的主角卡，…」。
           网页版那两行是 HTML，会自己折行；画布这边改成**折到最多两行**、卡片高度跟着算。 */
        const condLines = CV.wrap('完成条件：' + q.q.desc, textW, CV.FS.sm, 2);
        const rwLines = CV.wrap('完成奖励：' + Core.rewardTextOf(q.q.reward), textW, CV.FS.sm, 2);
        const y2top = LH1 + LGAP;
        condLines.forEach((ln, i) => CV.text(ln, U.ix(), top + y2top + LH2 * (i + 0.5), { size: CV.FS.sm, color: CV.C.dim }));
        const y3top = y2top + condLines.length * LH2 + LGAP;
        rwLines.forEach((ln, i) => CV.text(ln, U.ix(), top + y3top + LH2 * (i + 0.5), { size: CV.FS.sm, color: CV.C.dim }));
        const blockH = y3top + rwLines.length * LH2;
        /* 按钮跟整块内容**垂直居中**（.list-row 是 align-items:center），不是贴顶 */
        U.btn(U.ix() + U.iw() - bw, top + (blockH - BH) / 2, bw, BH, label, q.done ? 'primary' : 'ghost', q.done ? 'claim_quest' : 'goto_quest');
        U.y = top + blockH;                  // 内容撑高（每多折一行就多一个行盒）
      } else {
        CV.text('主线 · 已走完', U.ix(), top + y1, { size: CV.FS.f1, bold: true });
        CV.text('挑战更高难度与深井', U.ix(), top + y2, { size: CV.FS.sm, color: CV.C.dim });
        U.y = top + y2 + LH2 / 2;            // 两行版：20.25 + 4 + 17.05
      }
    });

    /* ③ 养成（网页版 growBlock）：一条线一个入口 + 未解锁的收成一行灰字 */
    const keji = D.KEJI.reduce((a, k) => a + Core.kejiLv(k.id), 0);
    const bLv = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const arena = Core.arenaState(), signSt = Core.signState();
    /* V9.5.68（父亲大人）：主页格子里**啥小字都不要，只留功能名**——
       小游戏这边原来照"状态小字"画了「1 人上阵 / Lv.0 / 0 级 / 第 1 台·剩 5 次 …」一屏小字，
       和网页版已经不一样了。现在按网页版的 growBlock / dailyBlock 逐条对齐：
       只有功能名；"有东西可领"用红点（悬赏可领 / 任务可领 / 成就有奖励 / 今天还没求签 / 免费抽可用）。 */
    const achDot = Core.achievementSummary().list.filter((x) => x.done && !x.claimed).length > 0;
    const signReady = !!signSt.canDraw;
    const today = Core.todayState ? Core.todayState() : null;
    const taskDot = !!(today && (today.dailyClaimable + today.weeklyClaimable > 0));
    const bountyDot = Core.bountyState().claimable > 0;
    const freeDot = Core.isUnlocked('recruit') && (Core.freeState('normal').ready || Core.freeState('advanced').ready);
    const growAll = [
      ['open_party', '队伍'],
      ['open_grow', '成长'],
      ['open_sect', '灯阁评级'],
      ['open_keji', '秘术阁'],
      ['open_fabao', '法宝'],
      ['open_garden', '药园'],
      ['open_arena', '斗法台'],
      ['open_mount', '坐骑'],
      ['open_refine', '炼化台'],
      ['open_authority', '灯阁权限', null, 'buildings'],
      ['open_buildings', '基地建设', null, 'buildings'],
      ['open_genelock', '铭刻', null, 'geneLock'],
      ['open_beast', '伴生体', null, 'beast'],
      ['open_reincarn', '转生天赋', null, 'reincarn'],
      ['open_codex', '灯录', null, 'recruit'],
    ];
    U.sectionTitle('养成');
    U.tiles(growAll.filter((x) => !x[3] || Core.isUnlocked(x[3])), 3, 'grid:grow');
    lockedEntries = growAll.filter((x) => x[3] && !Core.isUnlocked(x[3]));
    const locked = lockedEntries.map((x) => x[1]);
    /* V9.6.69（资料 §3「逐步披露，但要让玩家看到还能解锁什么」）：
       未解锁的格子不铺出来（一屏灰的更乱），但这一行**可以点** —— 点开逐条写明怎么解锁。
       和网页版同一套（那边是弹窗，这边推一个 locked 页）。 */
    if (locked.length) {
      U.space(CV.SP[1]);
      const h = U.hint('还没解锁：' + locked.join(' / ') + '  ›', 0);
      CV.hit('open_locked', U.ix() - 2, U.y - h, U.iw() + 4, h);
    }
    /* 日常（网页版 .grid-title「日常」+ 六格；红点与"真的能领"同源） */
    U.space(CV.SP[2]);
    /* 网页版 .grid-title 的 margin 是 `var(--sp3) 2px var(--sp2)`：上 14 / 下 **10**。
       以前只推进了行高、没有下边距，标题跟下面那排卡片贴在一起了（父亲大人截图点出来的）。 */
    const gridTitleH = CV.FS.sm * 1.2;
    const dailyTitleY = U.y + gridTitleH / 2;
    CV.text('日常', U.pad() + 2, dailyTitleY, { size: CV.FS.sm, color: CV.C.dim, ls: 2 });   // .grid-title letter-spacing 2px
    U.y += gridTitleH + CV.SP[1];
    /* V9.6.69（资料 §7「别让 HUD 到处是点」）：红点收敛 —— 一组里最多亮 2 个，多的收进标题的 +N */
    const dailyList = trimDots([
      ['open_bounty', '限时悬赏', null, null, bountyDot],
      ['open_tasks', '每日任务', null, 'tasks', taskDot],
      ['open_ach', '成就', null, null, achDot],
      ['open_sign', '点灯', null, null, signReady],
      ['open_recruit', '招募伙伴', null, 'recruit', freeDot],
      ['open_shop', '兑换大厅', null, 'shop'],
    ].filter((x) => !x[3] || Core.isUnlocked(x[3])));
    if (dailyList.hidden) CV.text('+' + dailyList.hidden, U.pad() + U.cw(), dailyTitleY,
      { size: CV.FS.xs, color: CV.C.gold, align: 'right' });
    U.tiles(dailyList.list, 3, 'grid:daily');
    /* V9.6.7：这一行「全部养成线的总览在「执灯者 → 成长」。」网页版**没有** ——
       父亲大人的规矩是"主页只留功能名，非必要的注释都不要"，删掉。 */
    U.space(CV.SP[2]);

    /* ④ 游历（网页版 travelBlock：只有一个「游历奇遇」条） */
    U.sectionTitle('游历');
    const prog = Core.travelProgress(), pend = Core.pendingTravel();
    U.card(function () {
      const h = 33 * CV.SCALE, top = U.y, cy = top + h / 2;      // 网页版：行高 33 + 上下内边距 2 → 卡片 39
      CV.text('【游历奇遇】', U.ix(), cy, { size: CV.FS.md, color: pend ? CV.C.gold : CV.C.dim });
      if (pend) {
        const rw = Core.rewardTextOf(pend.effect);
        const rwW = CV.measure(rw, CV.FS.sm) + 10 * CV.SCALE;
        CV.text(CV.fit(pend.name, U.iw() - 100 * CV.SCALE - rwW, CV.FS.md), U.ix() + U.iw() - rwW, cy, { size: CV.FS.md, color: CV.C.gold, align: 'right' });
        CV.text(CV.fit(rw, rwW, CV.FS.sm), U.ix() + U.iw(), cy, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
        CV.hit('claim_travel', U.pad(), top, U.cw(), h);
      } else {
        CV.text('距下一次 ' + D.fmtClock(Math.max(0, prog.every - prog.sec)), U.ix() + U.iw(), cy, { size: CV.FS.md, color: CV.C.dim, align: 'right' });
        CV.hit('open_travel', U.pad(), top, U.cw(), h);
      }
      U.y = top + h;
    }, { padY: 2 });

    /* ⑤ 挂机（网页版 idleBlock：三行 + 两个按钮；V9.5.27/28：整块灰字、按钮叫"收取奖励"） */
    U.sectionTitle('挂机');
    const r0 = Core.idleRates(), bank = Core.idleBankGains(), lines = Core.idleLines();
    U.card(function () {
      const lh = 28 * CV.SCALE, top = U.y;
      const dim = CV.C.dim, txt = CV.C.dim;             // V9.5.28：这一块全部灰字
      const GAP = CV.SP[2];                             // .idle-line gap: var(--sp2)
      /* 行 1：【挂机】 + ◉x.x/分 + （EXP…/离线…/上限…） */
      let x = U.ix();
      CV.text('【挂机】', x, top + lh / 2, { size: CV.FS.md, color: dim });
      x += CV.measure('【挂机】', CV.FS.md) + GAP;
      const v1 = '◉ ' + r0.pointsPerMin.toFixed(1) + '/分';
      CV.text(v1, x, top + lh / 2, { size: CV.FS.md, color: txt });
      x += CV.measure(v1, CV.FS.md) + GAP;
      const s1 = 'EXP ' + r0.expPerMin.toFixed(1) + '/分 · 离线 ' + Math.round(Core.offlineEfficiency() * 100) + '% · 上限 ' + Core.offlineCapHours().toFixed(1) + 'h';
      /* V9.6.142：这一段原来硬塞在同一行、放不下就 `fit` 砍掉 —— 屏幕窄一点就变成
         「… 离线 85% · …」，把最重要的"离线上限"吃掉。网页版那里是 flex，会自动折到下一行；
         这里照做：**放不下就另起一行，后面几行整体下移**（卡片自己长高）。 */
      const wrap1 = (x + CV.measure(s1, CV.FS.sm) > U.ix() + U.iw());
      if (wrap1) CV.text(s1, U.ix(), top + lh * 1.5, { size: CV.FS.sm, color: dim });
      else CV.text(s1, x, top + lh / 2, { size: CV.FS.sm, color: dim });
      const dy = wrap1 ? lh : 0;                // 行 1 折了，后面整体下移一行
      /* 行 2：【已挂】+ 时长（网页版 V9.6.3 起把【待领】挪到单独一行，这里照做） */
      const y2 = top + lh + dy;
      const dur = G.formatDuration ? G.formatDuration(bank.seconds) : (bank.seconds + '秒');
      const durTxt = dur + (Core.idleFull && Core.idleFull() ? '（已满）' : '');
      let x2 = U.ix();
      CV.text('【已挂】', x2, y2 + lh / 2, { size: CV.FS.md, color: dim });
      x2 += CV.measure('【已挂】', CV.FS.md) + GAP;
      CV.text(durTxt, x2, y2 + lh / 2, { size: CV.FS.md, color: txt });
      /* 行 3：【待领】**单开一行**（父亲大人：窄屏就不会被挤断行了） */
      const y3 = top + lh * 2 + dy;
      const gainTxt = '◉ ' + fmt(bank.points) + ' · EXP ' + fmt(bank.exp)
        + (bank.otherworld ? ' · ◆ ' + bank.otherworld : '');
      let x3 = U.ix();
      CV.text('【待领】', x3, y3 + lh / 2, { size: CV.FS.md, color: dim });
      x3 += CV.measure('【待领】', CV.FS.md) + GAP;
      CV.text(CV.fit(gainTxt, U.ix() + U.iw() - x3, CV.FS.md), x3, y3 + lh / 2, { size: CV.FS.md, color: txt });
      /* 行 4：【分工】+ 名单 */
      const y4 = top + lh * 3 + dy;
      CV.text('【分工】', U.ix(), y4 + lh / 2, { size: CV.FS.md, color: dim });
      const x4 = U.ix() + CV.measure('【分工】', CV.FS.md) + GAP;
      /* V9.6.7（父亲大人）：只写产线名，**不写人名** —— 派了谁、加多少，点进「挂机分工」里看。
         颜色本身就是状态：没派领队（没激活）灰、派了（激活）金。
         超宽时折到第二行（卡片自己会长高），不再用省略号砍掉后半截。 */
      const lhS = CV.FS.sm * 1.45;
      let px = x4, py = y4 + (lh - lhS) / 2, rows = 1;
      lines.forEach(function (l, i) {
        if (i) {
          const sw = CV.measure(' · ', CV.FS.sm);
          if (px + sw > U.ix() + U.iw() && px > x4) { px = x4; py += lhS; rows++; }
          CV.text(' · ', px, py + lhS / 2, { size: CV.FS.sm, color: CV.C.dim });
          px += sw;
        }
        const t = l.line.name;
        const w = CV.measure(t, CV.FS.sm);
        if (px + w > U.ix() + U.iw() && px > x4) { px = x4; py += lhS; rows++; }
        CV.text(t, px, py + lhS / 2, { size: CV.FS.sm, color: l.leaderId ? CV.C.gold : dim });
        px += w;
      });
      const extra = (rows - 1) * lhS;
      /* 行间虚线（网页版 .idle-line 的 border-bottom: 1px dashed） */
      CV.ctx.save();
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
      [1, 2, 3].forEach((i) => {
        CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + lh * i - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + lh * i - .5); CV.ctx.stroke();
      });
      CV.ctx.restore();
      // 两个按钮（网页版 .btn-row：左小右大，间距 10）
      const by = top + lh * 4 + extra + 8 * CV.SCALE, bh = U.BTN_H * CV.SCALE, gap = 10 * CV.SCALE;
      const bw = (U.iw() - gap) * 0.42;
      U.btn(U.ix(), by, bw, bh, '派人分工', 'ghost', 'open_idlelines');
      U.btn(U.ix() + bw + gap, by, U.iw() - bw - gap, bh, '收取奖励', 'primary', 'claim_all');
      U.y = by + bh;
    });

    /* ⑥ 设置（网页版 settingsBlock：只有 玩法指南 / 设置与存档 两块） */
    U.sectionTitle('设置');
    U.tiles([['open_guide', '玩法指南'], ['open_settings', '设置与存档']]);
    U.y += 10 * CV.SCALE;
  });

  /* ---------- 首页动作 ---------- */
  CV.on('claim_all', function () {
    const r = Core.claimEverything();
    CV.toast(r && r.total ? '已领取 ' + r.total + ' 项' : '暂时没有可领的');
  });
  CV.on('claim_travel', function () {
    const r = Core.claimTravel();
    CV.toast(r && r.ok ? '🎁 ' + r.msg : (r && r.msg) || '还没有新的游历');
    CV.render();
  });
  /* V9.6.31（父亲大人："我点去完成，他给我一个弹窗，内容还不对，而不是引导我去完成任务"）：
     这里原来是一句占位 toast（而且文案抄错了）—— 点了最没用。改成**真的带路**：
     找到当前主线，交给 sc-last 里那张已经写好的跳转表（goQuest：属性面板 / 招募 / 建筑 /
     队伍 / 装备 / 残域对应世界 / 深井…）。 */
  CV.on('goto_quest', function () {
    const cu = Core.currentQuest && Core.currentQuest();
    if (!cu || !cu.q) { CV.toast('主线已经走完了'); return; }
    if (G.goQuest) G.goQuest(cu.q.id);
    else CV.toast('这一步要去「' + (cu.q.desc || '对应页面') + '」完成');
  });
  /* V9.6.21（父亲大人："主线任务点领取奖励没反应"）：
     原来调的是 `Core.claimMainQuest` —— **这个函数压根不存在**（core 只有 claimQuest(id)），
     于是 `r` 一直是 undefined，只弹一句"已领取"、奖励根本没发，看着就像点了没反应。 */
  CV.on('claim_quest', function () {
    const cu = Core.currentQuest && Core.currentQuest();
    if (!cu || !cu.q) { CV.toast('主线已经走完了'); return; }
    if (!cu.done) { CV.toast('这一步还没完成'); return; }
    const r = Core.claimQuest(cu.q.id);
    CV.toast((r && r.msg) || (r && r.ok ? '已领取' : '还没完成'));
    CV.render();
  });
  CV.on('open_party', function () { CV.push('party'); });
  CV.on('open_grow', function () { CV.push('grow'); });
  /* 六条养成线的小页面（秘术阁 / 法宝 / 坐骑 / 药园 / 斗法台 / 求签）——都接上真实页面了 */
  ['open_keji', 'open_fabao', 'open_mount', 'open_garden', 'open_arena', 'open_sign'].forEach(function (id) {
    CV.on(id, function () { CV.push(id.replace('open_', '')); });
  });
  /* 剩下几条线：评级 / 权限 / 建设 / 境界 / 铭刻 / 伴生体 / 转生 / 灯录 */
  CV.on('open_sect', function () { CV.push('sect'); });
  CV.on('open_authority', function () { CV.push('authority'); });
  CV.on('open_buildings', function () { CV.push('buildings'); });
  CV.on('open_realm', function () { CV.push('realm'); });
  CV.on('open_genelock', function () { CV.push('genelock'); });
  CV.on('open_beast', function () { CV.push('beast'); });
  CV.on('open_reincarn', function () { CV.push('reincarn'); });
  CV.on('open_codex', function () { CV.push('codex'); });
  /* 最后一批：炼化台 / 悬赏 / 任务成就 / 设置 / 挂机分工 */
  CV.on('open_refine', function () { CV.push('refine'); });
  CV.on('open_bounty', function () { CV.push('bounty'); });
  CV.on('open_tasks', function () { CV.push('tasks'); });
  CV.on('open_settings', function () { CV.push('settings'); });
  CV.on('open_idlelines', function () { CV.push('idlelines'); });
  CV.on('open_shop', function () { CV.push('shop'); });

  CV.on('open_recruit', function () {
    if (!Core.isUnlocked('recruit')) { CV.toast('🔒 ' + Core.unlockTip('recruit'), 2400); return; }
    CV.push('recruit');
  });

  /* 还没复刻的页面：给个明确提示，别点了没反应。
     ⚠ V9.5.99：这里**不能覆盖已经存在的真实处理器** —— CV.on 是同 id 后注册的赢，
     之前"成长"已经接上真实页面了，又在这里被占位提示盖掉，点了就只弹一句"还在复刻"。
     现在先查一下有没有处理器，有就跳过，以后每补一页都不用手动从这份清单里删。 */
  /* V9.6.39：原来这里兜底给 open_travel / open_guide 挂"还在复刻队列里"的 toast ——
     这两页在 sc-guide.js 里都接上真页面了，兜底永远不触发，删掉（不留没有 UI 的状态）。 */
})();
