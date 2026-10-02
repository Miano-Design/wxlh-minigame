/* 灯阁（首页）—— 照网页版 js/ui.js 的 homeScreen() 一段一段抄
   ------------------------------------------------------------------------------
   网页版顺序（V9.5.x 定死）：主角卡 → 主线 → 养成（含日常）→ 游历 → 挂机 → 设置。
   两条规矩照抄：① 同一个功能在首页只出现一次；② 提示都写在界面上，不靠悬停。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  /* V1.1.x（2026-09-27 · 音频系统）：首页领奖类动作的音效出口（G.AUD 缺失时静默跳过） */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }
  const fmt = G.fmt || ((n) => String(n));
  /* V1.1.5（A3）· 父亲大人：「全都完成后就可以**直接把主线任务的卡片去掉**了，不要放在那占位」。
     这句同时牵动两处：① 主页那张卡**整块不画**；② 指它的引导要有兜底锚点 ——
     否则引导指着一颗不存在的按钮（`coach_audit` 会记 miss，玩家看到一张没有指向的旁白卡）。 */
  function mainQuestDone() {
    const mq = (Core.mainQuestState && Core.mainQuestState()) || [];
    return mq.length > 0 && mq.every(function (x) { return x.claimed; });
  }

  /* ================= V1.1.18（N3 · 留存环第二格）—— **已撤**（康康 09-29）=================
     `todayTodoList()` 原来是"今天还能做什么"的唯一一份清单（主页那条汇总条 ＋ 它点开的只读弹窗共用）。
     父亲大人 09-29：「主页还是像原来那样，**只是把那一行胶囊去掉了，不要了**」⇒ 函数、卡片、弹窗一起删。
     要恢复去 `git show HEAD:js/sc-home.js` 取（连同那条 `CV.on('open_today', …)` 一起）。 */

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
    /* ================= R3.2（父亲大人 2026-10-02）："把养成区和日常换一下，先讲日常，再讲养成，
       养成讲完着重讲下成长的二级界面里还有其他功能" =================
       顺序照他念的改：② 日常 → ③ 养成 → ④ 成长的二级页 → ⑤ 主线。
       ⚠️ 每一句文案都必须与**屏幕上真有的东西**逐字对得上（那两排是读 `D.HOME_GROUPS` 摆的）：
          · 日常（`grid:daily`）= 任务 / 药园 / 招募；
          · 常去的地方（`grid:grow`）= 队伍 / 成长 / 斗法台 / 秘术阁 / 法宝 / 坐骑 / 伴生体 / 市集 / 点灯。
       上一版②那句还写着"法宝、市集、点灯…"却没提坐骑/伴生体，而且把两排的顺序讲反了 ——
       父亲大人："这个是老版本的介绍了"。 */
    { key: 'tut_blk2', page: 'home', target: 'grid:daily',
      /* R2.9：日常那排收紧成三格（任务 / 药园 / 招募），点灯、市集、成就分别挪到「常去的地方」
         与底部那一排 —— 这句文案同步改，别再说屏幕上没有的东西。 */
      text: '② 日常：每天最先做的三件 —— 任务（悬赏＋每日＋周常并成一页，页头能一键领取）、药园、招募。 有红点的就是"有东西可领"，别让它亮着。' },
    { key: 'tut_blk3', page: 'home', target: 'grid:grow',
      /* V1.1.5（A2）：这一排**按常用度从高到低**排。
         R2.9（父亲大人 2026-10-02）：首页那两排的成员调整过（药园/成就挪走、市集/点灯挪进来），
         文案**跟着实际内容改**——引导说的话必须和玩家看到的那排一致，否则等于教学错了。 */
      text: '③ 养成区：养成线都在这排格子里 —— 队伍、成长、斗法台、秘术阁、法宝、坐骑、伴生体、市集、点灯。越靠前的每天都要回来点，越靠后越少动；前期缺什么补什么。' },
    /* ④-A（父亲大人："养成讲完**着重讲下成长的二级界面里还有其他功能**"）：
       这一下是**真的点进去**（enter:true）—— 光说"里面还有别的"没用，得带他看一眼。 */
    { key: 'tut_blk3x', page: 'home', target: 'open_grow', enter: true,
      text: '这一排里的「成长」是总入口 —— 点开看一眼：主页摆不下的系统都收在里面。' },
    /* ④-B：落在成长页，指着「其他系统」那一整块（`grid:ov_growth_more`，见 overhaul-2.0.js）。
       `back:true` = 讲完自动退回灯阁，接着讲⑤（这条链的纪律：不横跨模块、不替他做决定）。 */
    { key: 'tut_blk3y', page: 'grow', target: 'grid:ov_growth_more', back: true, where: '成长',
      text: '④ 其他系统：铭刻、转生、图鉴、炼化台、灯阁评级、灯阁权限、境界渡劫、基地建设 —— 主页那排没有的都在这里，随进度一层层解锁。看完我带你回灯阁。' },
    { key: 'tut_blk4', page: 'home', enter: true,
      /* 锚点与文案**按当前进度算**（V1.1.5 · A3 的"兜底"）：
         还有没走完的主线步 → 指那颗「领取奖励 / 去完成」；
         27 步全领完（那张卡已经撤了）→ 改指「任务」那一格 —— 它一直存在，而且真的是之后每天要做的事。 */
      target: function () { return mainQuestDone() ? ['open_tasks', 'grid:daily'] : ['claim_quest', 'goto_quest']; },
      text: function () {
        return mainQuestDone()
          ? '主线 27 步已经全部走完 —— 那张卡不再占位置了。之后每天回来，把「任务」那一格里的悬赏 / 每日 / 周常收一下就行（页头有一键领取）。'
          : '详细怎么玩，跟着主线走就行 —— 每点一次「去完成」，我都会带你做那一步。 这张卡就是主线：做完一步回来领奖励，接着下一步。';
      } },
  ];
  /* R3.3：把这条链的**钥匙清单**挂出去一份（只读）—— 尺子（`quest_play_audit`）要按它走完整条链；
     它以前把五步写死在自己文件里，这一轮链子加了"成长二级页"两步就当场过时（假红）。
     ⚠️ 以后改 OPENING 不用再回来同步第二份。 */
  G.openingKeys = OPENING.map(function (s) { return s.key; });
  /* V9.6.69：首页那一行"还没解锁：…"点开要能看到"怎么解锁" —— 这里存一份当前未解锁的条目 */
  let lockedEntries = [];
  /* ⚠️ R3.4：原来这里有一个 `trimDots`（一组里最多亮 2 个红点、多的收进标题的「+N」）——
     它只被**旧首页正文**调用，而那段正文这一轮已经删掉（主页归 `overhaul-2.0.js`）。
     新主页不需要它：红点逐格挂，实测一行里最多只会亮 2 格（日常：任务＋招募；
     常去的地方：点灯；底排：成就）—— "满屏红点"那个前提在新排版下不成立。
     留着只会让下一个人以为它是活的（`entry_audit` 那类反查看不到"函数没人调"）。 */
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
      /* V1.1.5（A3）：target / text 允许写成**函数**（"主线走完之后指哪儿、说什么"要按当前进度算）。
         其余步骤照旧读静态值，写法向后兼容。 */
      const stTarget = (typeof st.target === 'function') ? st.target() : st.target;
      const stText = (typeof st.text === 'function') ? st.text() : st.text;
      U.coach(stTarget, stText, {
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
    recruit: '招募伙伴', tasks: '任务', shop: '市集', genelock: '铭刻',
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
            t: '接着往下打 —— 打完一关会自动解锁下一关，结算页里那颗「› 下一关」直接接着打。' },
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
    /* V1.1.5（A1）：任务页合并成一页（悬赏 → 每日 → 周常），页签没了 ——
       锚点从 `tasktab:daily`（已不存在）改成**能真领的那颗**，再兜底页头的「一键领取」。
       ⚠️ 尺子 `quest_play_audit` 里写死的也是 `tasktab:daily`，要一起改（不然它会红）。 */
    q_tasks:   { page: 'tasks',     s: ['task_claim:*', 'claim_all_tasks'],
                 t: '做完的任务在这页点「领取」收下 —— 也可以点页头那颗「一键领取」，把悬赏 / 每日 / 周常一次收完。' },
    q_keji:    { page: 'keji',      s: ['keji_up:*'],      t: '秘术阁：每条点一下按 ◆ 异界结晶升级、立刻永久生效。先挑一条主修的堆。' },
    q_fabao:   { page: 'fabao',     s: ['fabao_buy:*'],    t: '法宝：花 ◉ 点数买一件，「带上」它。给的是效果（汲取 / 开场能量 / 减伤），不是数值。' },
    q_garden:  { page: 'garden',    s: ['garden_plant:*'], t: '药园：空地上种一次，过一段时间回来收（不收就一直长着）。' },
    q_sign:    { page: 'sign',      s: ['sign_draw'],      t: '点灯：每天免费点一次，灯焰给当天的挂机加成 + 一点硬通货。' },
    q_arena:   { page: 'arena',     s: ['arena_fight'],    t: '斗法台：每天 5 次，赢了升一台拿 ◆ 异界结晶，输了退一台。' },
    q_mount:   { page: 'mount',     s: ['mount_buy:*'],    t: '坐骑：花 ◉ 点数驯服一匹，「乘骑」它给全队加属性。' },
    q_realm:   { page: 'realm',     s: ['realm_try'],      t: '境界渡劫：攒够材料就突破一小阶，全属性永久上涨；失败只扣材料、等级不掉。' },
    q_reincarn:{ page: 'reincarn',  s: ['do_reincarn'],    t: '转生：只重置等级换永久天赋点；残域进度与深井层数都保留（条件逐次抬高，第 1 次 Lv.100 + 铭刻 2 阶 + 灯芯 Lv.20）。' },
    /* V9.6.75（父亲大人："你安排"）：再补两条每天都会碰的系统 —— 挂机分工 / 限时悬赏 */
    /* V9.6.112：派领队要有"没上阵的伙伴"才登记按钮 —— 手上只有一名伙伴、还上了阵的玩家，
       这一页一个按钮都没有（引导只能退成一张讲不清的卡片）。文案里把这条出路写上。 */
    q_idle:    { page: 'idlelines', s: ['pickleader:*'],   t: '挂机分工：4 条产线各派 1 名领队（看领队对应那一维，不是战力）；没派领队的产线不产出。没有可派的伙伴就先回首页去招募。' },
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
    q13:  { page: 'protag',  s: ['pblup'], t: '命格升级消耗异界结晶 + 点数 —— 这是中期涨得最多的一条养成线（每升一级，你这支命格的两个属性一起涨）。' },
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
    /* V1.1.5（A3）：主线走完之后那张卡撤掉了 —— 这一条（与开场链最后一步共用钥匙）
       也必须跟着换锚点与文案，否则它在主页上什么都指不到（只剩一张旁白卡 + 一次 miss）。 */
    ['home', function () { return mainQuestDone() ? ['open_tasks', 'grid:daily'] : ['claim_quest', 'goto_quest']; },
      function () {
        return mainQuestDone()
          ? '主线走完了 —— 之后每天回来把「任务」那一格里的悬赏 / 每日 / 周常收一下（页头一键领取）。'
          : '主线每一步做完都能领奖励 —— 右边那颗按钮。';
      }, 'tut_blk4'],
    /* V9.6.112：这条和 q01b 的引导讲的是**同一件事**（点第 1 关开打）。
       以前各用各的钥匙 → 玩家在 q01b 那条点掉之后，这条又冒出来讲一遍，
       看着就是"第一关的指引打完之后出来还是第一关的指引"。现在共用 q01b 的钥匙。 */
    ['world', function () { return [nextStageAnchor('W01')]; },
      '点这一关就直接开打 —— 一关是一口气打到底的，打完最后一波才算过关。', 'tut_q01b'],
    ['recruit', ['pull1:normal', 'pull1:normal:free'], '每天有免费的招募次数，先用掉 —— 免费抽也计入主线。', TOPIC_KEY.recruit],
    ['protag', ['pblup'], '命格升级消耗异界结晶 + 点数，是中期涨得最多的一条养成线。', TOPIC_KEY.bloodline],
    /* V9.6.51（复审查出：这 9 个模块页"解锁时只讲一句、进去后没人讲"）——
       每条都是"进这一页 + 这一课没讲过"才播，锚点是那颗**主操作按钮**（前缀锚点支持动态 id）。 */
    ['keji',     ['keji_up:*'],       '秘术阁：42 条长线，每条点一下按 ◆ 异界结晶升级、立刻生效 —— 前期挑两条主修的堆。'],
    ['fabao',    ['fabao_buy:*'],     '法宝：花 ◉ 点数买，「带上」一个。它给的是效果（汲取 / 开场能量 / 减伤），不是数值。'],
    ['mount',    ['mount_buy:*'],     '坐骑：驯服后带上，给全队加属性（伙伴也吃）；不用给每个人各练一遍。'],
    ['garden',   ['garden_plant:*'],  '药园：空地上种，过一段时间回来收 —— 不收就一直长着，别忘了。'],
    ['arena',    ['arena_fight'],     '斗法台：每天 5 次机会，赢了升一台拿 ◆ 异界结晶，输了退一台（次数照常消耗，不会卡死在第 1 台）。'],
    ['sign',     ['sign_draw'],       '点灯：每天免费点一次，灯焰给当天的挂机加成 + 一点硬通货。'],
    ['refine',   ['craft:*'],         '炼化台：强化材料 + 点数炼精华，精华喂给伙伴是永久加成（每人每种有上限）。'],
    ['bounty',   ['bounty_claim:*'],  '限时悬赏：到点作废、达成才有奖励；四条全部结束后可以开新一期。'],
    ['idlelines',['pickleader:*'],    '挂机分工：4 条产线各派 1 名领队（看领队对应那一维，不是战力）；没派领队的产线不产出。'],
    /* 这四条是"看数值/被动成长"的页，没有单一主按钮 —— 锚点留空（引擎会自动退成"点一下继续"），
       但话必须说清"花什么、涨什么、多久涨"，不然玩家进来只会看到一屏数字。 */
    ['authority', [], '灯阁权限：花 ✦ 圣洁晶石 + ◆ 异界结晶升，给的全是倍率 —— 挂机产出、离线上限、离线效率、每日扫荡次数。'],
    ['sect',      [], '灯阁评级：打关卡自动涨，每级全队全属性 +0.5% —— 不用手动点，所以别在这页找按钮。'],
    ['realm',     [], '境界渡劫：每突破一小阶全属性永久上涨，36 阶走满合计 +50.4%。渡劫入口在这张卡下面的按钮。'],
    ['codex',     [], '灯录：收集伙伴解锁里程碑奖励，收满了就回来领。'],
    ['roster',    [], '伙伴：上阵的排前面（带红色角标），点卡片看详情 —— 等级、星级、命格、装备都在里面。'],
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
    shop:     { page: 'shop',     s: ['shoptab:god'], t: '市集：四家店各用不同货币，日常用券和材料都在这儿补。' },
    enhance:  { page: 'bag',      s: ['bagview:equip', 'eqd:*'], t: '装备强化解锁了：切到「装备」、点一件进去，花材料提升数值。' },
    buildings:{ page: 'buildings', s: ['bup:*'], t: '基地建设：五栋建筑每升一级都是永久加成，花的是挂机就能刷的点数。' },
    tasks:    { page: 'tasks',    s: ['task_claim:*', 'claim_all_tasks'], t: '任务解锁了：悬赏 / 每日 / 周常都在这一页，做完记得回来领（页头有一键领取）；主线在主页那张卡上一步一步领，成就有独立一页。' },
    corridor: { page: 'corridor', s: ['corridor_fight'], t: '深井解锁了：一直往上打、没有重置，每 10 层给一枚印记加成。' },
    bloodline:{ page: 'protag',   s: ['pblup'], t: '命格解锁了：升级消耗异界结晶 + 点数，每级全属性都涨。' },
    geneLock: { page: 'genelock', s: ['gl_unlock'], t: '铭刻解锁了：一条条点满，每条都是永久加成 —— 花的是异界结晶。' },
    beast:    { page: 'beast',    s: ['beast_hatch1', 'beast_hatch10'], t: '伴生体解锁了：花蛋孵出来能带上场，给全队加属性。' },
    reincarn: { page: 'reincarn', s: ['do_reincarn'], t: '转生解锁了：只重置等级换永久天赋点；残域进度与深井层数都保留 —— 中后期的主力成长线。' },
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
        /* V9.6.112：锚点允许写成**函数**（"接着打下一关"要按当前进度算）；
           V1.1.5：文案也允许写成函数（主页那条要看"主线走完没有"）。 */
        const anchors = (typeof row[1] === 'function') ? row[1]() : row[1];
        const ptext = (typeof row[2] === 'function') ? row[2]() : row[2];
      /* 页面级的基础引导也走「必须点中」（父亲大人要的是完全强制）—— 之前这几个是「看到就过」。 */
      /* row[3] = 与其它入口共用的钥匙（有就不重复讲） */
        U.coach(anchors, ptext, { key: row[3] || ('tut_page_' + row[0] + '_' + [].concat(anchors).join('_')), mustTap: true, queue: true });
    });
  };

  /* 未解锁一览：名字 + **怎么解锁**（对应网页版「🔒 还没解锁的功能」弹窗） */
  CV.register('locked', function () {
    U.begin();
    U.pageHead('还没解锁的功能');    // 标题 + 返回吸顶（父亲大人 09-27 深夜 · 派单 Z-B）
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

  /* ================= R3.2（父亲大人 2026-10-02："现在好像没有主线任务了，主线任务的入口在哪，
     新手指引有提到，但没看到入口"）=================
     背景：主线 27 步**只在主页那一张卡上**——父亲大人 09-26 定过口径：
       「主线任务就直接放在主页按顺序完成」「全都完成后就可以直接把主线任务的卡片去掉」，
     所以任务页里不再放主线（见 sc-last.js 顶上那段）。
     可 2.0 换掉 `CV.panels.home` 时，这张卡**跟着旧首页一起被换掉了**，于是：
       · 主页没有主线入口 —— 做完一步回来没地方领奖励，整条主线玩不下去；
       · 开场链第 ④ 步（`tut_blk4`）与主页页面引导（PAGE_GUIDE）的锚点都是
         `claim_quest` / `goto_quest`，这两颗按钮**只在这个旧首页里登记过** ⇒
         新首页上永远找不到目标（`miss`），那一步既收不掉也不会亮。
     修法：把这段卡**原样提出来**当公用件，一份实现喂两处 ——
       新首页（overhaul-2.0.js 的 renderHomeBody）与下面这段旧正文都调 `G.homeQuestCard()`。
     ⚠️ 不许在 overhaul 里再写第二份（两套实现＝改一处忘一处，任务书 §15）。
     行为一个字没改：**27 步全部领完之后整卡不画**（判据见本文件顶部的 mainQuestDone()）。 */
  function homeQuestCard() {
    const mq = Core.mainQuestState();
    const qi = mq.findIndex((x) => !x.claimed);
    const q = qi < 0 ? null : mq[qi];
    /* V1.1.5（A3）：**27 步全部领完之后，这张卡整块不画**（不留"主线 · 已走完"占位卡）。
       父亲大人：「全都完成后就可以直接把主线任务的卡片去掉」+「不要放在那占位」。 */
    if (!q) return 0;
    return U.card(function () {
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
      const label = q.done ? '领取奖励' : '去完成 ›';
      const bw = CV.measure(label, CV.FS.md) + 26 * CV.SCALE;
      const tag = '第 ' + (qi + 1) + '/' + mq.length + ' 步';
      /* .tag：11px · line-height 1.4 + padding 1px 6px + border 1px → 盒高 19.4 */
      const tagH = CV.FS.xs * 1.4 + 2 * CV.SCALE + 2 * CV.SCALE;
      const tagW = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE + 2 * CV.SCALE;
      const textW = U.iw() - bw - 10 * CV.SCALE;
      /* V1.1.12（0927-B · 三机型复审）：单行 `CV.fit` 在 320 上把任务名砍成「主线 · 熟…」，
         改成**折到两行**（步数标签永远跟第一行，与网页版 flex 行同义），
         下面"完成条件/完成奖励"两行随标题行数整体下移 —— 卡片是内容撑高的，不会挤到下一张卡。 */
      const titleLines = CV.wrap('主线 · ' + q.q.name, textW - tagW - 6 * CV.SCALE, CV.FS.f1, 2);
      const tw = CV.measure(titleLines[0], CV.FS.f1, true);
      titleLines.forEach((ln, i) => CV.text(ln, U.ix(), top + y1 + i * LH1, { size: CV.FS.f1, bold: true }));
      /* 标签和标题**同一中线**（.t1 是 align-items:center 的 flex 行） */
      CV.round(U.ix() + tw + 6 * CV.SCALE, top + y1 - tagH / 2, tagW, tagH, CV.RADIUS_SM, null, CV.C.line2);
      CV.text(tag, U.ix() + tw + 6 * CV.SCALE + tagW / 2, top + y1, { size: CV.FS.xs, color: CV.C.text2, align: 'center' });
      /* V9.6.72 / V9.6.142：条件与奖励两行**按判定原样折行**（`check` 与 `desc` 必须一致）。 */
      const condLines = CV.wrap('完成条件：' + q.q.desc, textW, CV.FS.sm, 2);
      const rwLines = CV.wrap('完成奖励：' + Core.rewardTextOf(q.q.reward), textW, CV.FS.sm, 2);
      const y2top = titleLines.length * LH1 + LGAP;
      condLines.forEach((ln, i) => CV.text(ln, U.ix(), top + y2top + LH2 * (i + 0.5), { size: CV.FS.sm, color: CV.C.dim }));
      const y3top = y2top + condLines.length * LH2 + LGAP;
      rwLines.forEach((ln, i) => CV.text(ln, U.ix(), top + y3top + LH2 * (i + 0.5), { size: CV.FS.sm, color: CV.C.dim }));
      const blockH = y3top + rwLines.length * LH2;
      /* 按钮跟整块内容**垂直居中**（.list-row 是 align-items:center），不是贴顶 */
      U.btn(U.ix() + U.iw() - bw, top + (blockH - BH) / 2, bw, BH, label, q.done ? 'primary' : 'ghost', q.done ? 'claim_quest' : 'goto_quest');
      U.y = top + blockH;                  // 内容撑高（每多折一行就多一个行盒）
    });
  }
  G.homeQuestCard = homeQuestCard;

  /* ---------- 首页动作 ---------- */
  /* B5 · 挂机加速：广告 → 直接发 2 小时产出（逻辑层 `Core.adIdleBoost`，折算与真挂机同源） */
  CV.on('ad_idle_boost', function () {
    /* 弱网：先给一句人话，不让玩家白看一条拉不起来的广告（R3 · 09-27 口径） */
    if (G.ADWEAK && G.ADWEAK.block()) return;
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); return; }
    AD.show('idle_boost').then(function (r) {
      if (!r || !r.granted) { CV.toast(r && r.reason === 'total' ? '今天看广告的次数用完了' : '今天这个加速次数用完了'); CV.render(); return; }
      const b = Core.adIdleBoost();
      const g = (b && b.gains) || {};
      /* F7 ②：一次性奖励类（看完广告拿到的 2 小时产出）→ 留（拿到多少别处看不到），缩到最短。 */
      CV.toast('📺 +2 小时：◉' + fmt(g.points || 0) + ' · EXP' + fmt(g.exp || 0) + ((g.otherworld || 0) ? (' · ◆' + g.otherworld) : ''), 2600);
      CV.render();
    });
  });
  /* ================= 康康 2026-09-29 · 「今日汇总」整条**撤掉**（父亲大人的图为准）=================
     原话：「**主页还是像原来那样，只是把那一行胶囊去掉了，不要了**」——他指的就是主页那条
     「今日 · 挂机收益 · 悬赏 1 · …」的只读汇总（图上被划掉的那一条）。
     连带一起撤：它点开的这个只读弹窗、主页那条卡、`todayTodoList()` 这个函数。
     ⚠️ N3 那套（策划总监 0927 的留存环第二格）**是父亲大人 09-29 亲自撤的**，
        不是它坏了 —— 要恢复的话去 git 历史里取，别在这儿临时拼。
     ⚠️ 主页「日常」那一块（标题 ＋ 任务/点灯/招募伙伴/市集/成就 五格）**照原样回来**，
        红点与「+N」也一起回来（见下面 ③ 那一段）。 */
  /* ================= V1.1.16（M 轮 · 挂机结算面板 ＋ 看广告双倍领取）=================
     父亲大人：「现在这个领取奖励也可以像战斗的结算那样把有什么奖励列举出来，然后两个选项，
     一个领取奖励，一个看广告双倍领取奖励，这个看广告双倍领取的次数也是不限次数」。
     挂机卡那颗「收取奖励」现在的走法：
       · **有挂机收益**（银行 ≥1 分钟）→ 先弹「挂机结算」面板（`U.idleSettle`）：
         逐项列出点数/经验/◆/材料（每项带自己的图标与数量）＋ 顶部"已挂 X" ＋ 两颗按钮；
       · **没有可列的挂机收益**（刚领完 / 挂不到 1 分钟）→ 一个字不变，走原来那条一键收
         （今日 / 周常那些照样收得到 —— 这条不许因为加面板就变少）。
     两条发奖路径：
       · 「领取」（`idle_claim`）＝ 既有那条结算路径 `Core.claimEverything()`（**与改动前逐字相同**）；
       · 「看广告 · 双倍领取」（`idle_double`）＝ `AD.show('offline_double')` → 走同一条路径，
         再把挂机那一份**原样再发一次**（`Core.claimIdleDouble`）⇒ 面板上列的那些 ×2。
       · **弱网拉不到广告 → 不给双倍**（父亲大人 09-27 口径）：一分不发、不吃补偿、面板留着；
         原额还在银行里，底下那颗「领取」照常能领（`idle_double_audit` ⑤ 段钉着）。 */
  CV.on('claim_all', function () {
    if (U.idleSettle && U.idleSettle()) return;
    const r = Core.claimEverything();
    snd(r && r.total ? 'claim' : 'error');
    /* F7 ②：一次性奖励类（"一键领取"是**聚合**动作，领了几项别处不显示）→ 留，本来就最短。 */
    CV.toast(r && r.total ? '已领取 ' + r.total + ' 项' : '暂时没有可领的');
  });
  /* ================= V1.1.x（0927-P · 挂机结算改成半透明弹窗）=================
     父亲大人 2026-09-27：「这个不用单开一页吧，就半透明弹窗叠加就行啦，然后支持点击空白处返回」。
     面板从"战斗结算那一层（整屏黑底、`CV.top() === 'battle'`）"改成 `U.confirm` 的**弹窗**
     （`U.idleSettle` → 半透明遮罩 ＋ 居中卡片），所以下面这两颗按钮的收尾也跟着改：
       · 原来收尾是 `CV.dispatch('battle_close')` —— 关的是**战斗页那一层**；现在没有那一层了，
         改回一次普通的 `CV.render()`（弹窗自己由这里清掉：`U.overlay = null`）。
       · 两颗按钮走 U.confirm 的**自定义按钮 id**（`okId: 'idle_claim'` / `cancelId: 'idle_double'`）：
         点下去**不会**顺手把弹窗关掉，所以"关弹窗"这件事由处理器自己负责 ——
         好处是"广告拉不到 → 不发奖"时能把弹窗原地留着（那颗「领取」照常领原额）。
     ⚠️ 别留下"发了奖但页面还停在结算层"或者"弹窗关了但奖没发"这两种半吊子。 */

  /* 挂机结算 ·「领取」：走既有那条结算路径，然后关掉弹窗、原地回灯阁 */
  CV.on('idle_claim', function () {
    const r = Core.claimEverything();
    snd(r && r.total ? 'claim' : 'error');
    U.overlay = null;                   // 关掉挂机结算弹窗（不再去关"战斗那一层"）
    /* F7 ②：同上 —— 挂机银行一次结算几项，聚合动作 → 留。 */
    CV.toast(r && r.total ? '已领取 ' + r.total + ' 项' : '暂时没有可领的');
  });
  /* 挂机结算 ·「看广告 · 双倍领取」
     ⚠️ `offline_double` 在 `wx-adapter` 的 FREE_SLOTS 里：**不查日配额、不占总闸、不限次数** ——
        所以这里既不判"今天还剩几次"、也不给按钮加禁用条件；真正的口径在那一处，
        谁把它从 FREE_SLOTS 里挪走，这把尺子（`idle_double_audit`）当场会红。 */
  CV.on('idle_double', function () {
    if (G.ADWEAK && G.ADWEAK.block()) return;   // 弱网：一句人话，弹窗原地留着（R3）
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); CV.render(); return; }
    /* 关弹窗 ＋ 报一句（0927-P 起面板是 `U.confirm` 那一层，不再有"从战斗页来"那本账）。 */
    const back = function (msg, ms) { U.overlay = null; if (msg) CV.toast(msg, ms || 2200); };
    const durOf = function (sec) { return G.formatDuration ? G.formatDuration(sec) : (sec + ' 秒'); };
    AD.show('offline_double').then(function (r) {
      /* ① 没拿到：**一律不给双倍**，面板原地留着 —— 底下那颗「领取」照常领原额，
            网络缓过来还能再点这颗换双倍（挂机银行不会因为点了这一下就少）。
            父亲大人 2026-09-27 的口径：「**弱网拉不到广告时不给双倍**，不用新造吧，就这样吧」
            —— 所以弱网**不走补偿**（`wx-adapter` 的 `NO_COMP_SLOTS` 里钉着"不限次数这两类"），
            这里也不再"先按原额发下去"：原额本来就还在银行里，发下去反而把这次翻倍机会用掉了。 */
      if (!r || !r.granted) {
        CV.toast(r && r.reason === 'skipped'
          ? '广告没看完，奖励没发'
          : '广告暂时拉不到，稍后再试（也可以直接点「领取」）', 2600);
        CV.render();                    // 弹窗一个字段都没动：原样留在屏幕上（原额还在银行里）
        return;
      }
      /* ③ 拿到了：先走既有那条结算路径（挂机那份也在里面），再把挂机那一份原样再发一次。 */
      const got = Core.claimEverything();
      const base = (got && got.detail && got.detail.idle) || null;
      /* ⚠️ 顺序不许调换：**先确认"这一次真的领到了挂机那一份"，才允许调翻倍** ——
         不然跨档之后那份"上一份档的旧记录"会被照发一遍（凭空发资源）。
         `claimIdle()` 一跑就把记录换成这一次的，所以"先领再翻"天然是同一份账。 */
      if (!base) {
        back('已领取（这次没能翻倍：没有可翻倍的挂机收益）', 3000);
        return;
      }
      const d = Core.claimIdleDouble ? Core.claimIdleDouble() : null;
      if (!d || !d.ok) {
        /* 极端兜底（面板只在"挂机可领"时开，理论上到不了）：奖已经发了，就当面向玩家说清 */
        back('已领取（这次没能翻倍：' + ((d && d.msg) || '没有可翻倍的挂机收益') + '）', 3000);
        return;
      }
      /* ④ **原地**把面板换成"已翻倍"的样子（与离线那条同一口径：让玩家看见 ×2 到底给了多少）：
         胶囊 ＝ 原额 ＋ 翻倍那份；看广告那颗收掉，只留「收下」（这一下只是关弹窗，不再发奖）。
         0927-P 起这一屏是 U.confirm（没有 `BattleUI.state.panel` 那本账了）⇒
         **重开同一层弹窗**（`cancel: false` ⇒ 只剩一颗「收下」），与离线翻倍那条逐字同一个做法。 */
      const a = d.gains || {};
      const pv = {
        points: (base.points || 0) + (a.points || 0),
        exp: (base.exp || 0) + (a.exp || 0),
        otherworld: (base.otherworld || 0) + (a.otherworld || 0),
        matItem: base.matItem || a.matItem || null,
        matCount: (base.matCount || 0) + (a.matCount || 0),
        matStashed: (base.matStashed || 0) + (a.matStashed || 0),
      };
      U.overlay = null;
      U.confirm('挂机结算', '已挂 ' + durOf(base.seconds || 0) + ' · 收益 ×2',
        function () { CV.render(); },
        { cancel: false, okLabel: '收下', chips: U.idleChips(pv), blankClose: true });
      /* F7 ②：一次性奖励类（看完广告拿到的双倍）→ 留，缩到最短。 */
      CV.toast('📺 挂机收益 ×2', 1600);
    });
  });
  CV.on('claim_travel', function () {
    const r = Core.claimTravel();
    snd(r && r.ok ? 'claim' : 'error');
    /* F7 ②：游历给的是"哪一个奇遇 ＋ 它的奖励"（别处看不到）→ 留；失败留。 */
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
    snd(r && r.ok ? 'claim' : 'error');
    /* F7 ②：主线那一行领完当场变成"已领"（看得见 → 删成功的"已领取"）；失败照旧说。 */
    if (!r || !r.ok) CV.toast((r && r.msg) || '还没完成');
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

  /* ================= 首页整屏底图（2026-10-02 · §十一 场景驱动 UI） =================
     父亲大人：「直接做成**底图压暗铺满背景**，然后内容直接叠在上面」。
     正式 KV（`brand/kv-main.jpg`，主包）按 cover 铺满**整块画布**，再压一层暗
     —— 于是这一页是"站在残域里看灯阁"，卡片是浮在世界上的记录页，不再是"顶部一张图 + 下面一屏黑"。
     图没到位（或加载失败）走**程序化底**：天空渐变 + 那盏暖光，第一帧绝不空。
     压暗的力度取 .72：卡片本身已经是半透明面板（88%），两层加起来仍读得清字，
     底图的轮廓与那盏灯还看得出来。 */
  CV.veils = CV.veils || {};
  /* 全站默认底图：**所有没有自己底图的页面都铺它**（父亲大人 2026-10-02：
     「应用到所有界面，包括顶部信息栏和底部导航栏都铺满」）。
     一张画铺满整屏 + 一道压暗；卡片（70%）、顶栏（78%）、底栏（78%）都是压在上面的半透明层，
     所以整局游戏是一张世界，而不是"首页有画、进去全黑"。 */
  CV.defaultVeil = function (c) {
    if (G.Story && G.Story.ensureKV) G.Story.ensureKV();
    const img = (G.Story && G.Story.kvImage) ? G.Story.kvImage() : null;
    if (img && img.width) {
      const s = Math.max(CV.W / img.width, CV.H / img.height) * 1.03;   // cover + 3% 过扫
      const dw = img.width * s, dh = img.height * s;
      c.drawImage(img, (CV.W - dw) / 2, (CV.H - dh) * 0.42, dw, dh);
    } else {
      const sky = c.createLinearGradient(0, 0, 0, CV.H);
      sky.addColorStop(0, CV.C.bg2); sky.addColorStop(1, CV.C.bg);   // OK:程序化底图
      c.fillStyle = sky; c.fillRect(0, 0, CV.W, CV.H);
      const rg = (typeof c.createRadialGradient === 'function')
        ? c.createRadialGradient(CV.W * 0.5, CV.H * 0.66, 0, CV.W * 0.5, CV.H * 0.66, CV.W * 0.8) : null;
      if (rg && rg.addColorStop) {
        rg.addColorStop(0, CV.a(CV.C.goldBright, .34)); rg.addColorStop(1, CV.a(CV.C.gold, 0));
        c.fillStyle = rg; c.fillRect(0, 0, CV.W, CV.H);
      }
    }
    /* 压暗：**必须让"卡片半透明"看得出来**（父亲大人：「卡片的半透明呢」）——
       第一版压到 .58~.82，底图被压得几乎看不见，卡片再透也没东西可透。
       现在收到 .34~.56：世界清清楚楚地在那儿，卡片是浮在它上面的半透明面板。
       文字照样读得清 —— 卡片本身还有 70% 的深色底（两层加起来才是不透明的那部分）。 */
    /* 2026-10-02（父亲大人）：底图压暗**统一 75** —— 不分段、不打折，一层平色压到底。 */
    c.fillStyle = CV.a(CV.C.bg, .75); c.fillRect(0, 0, CV.W, CV.H);
  };
  CV.veils.home = CV.defaultVeil;      // 首页就是这张（同一处算式，不许各写一份）

  /* 还没复刻的页面：给个明确提示，别点了没反应。
     ⚠ V9.5.99：这里**不能覆盖已经存在的真实处理器** —— CV.on 是同 id 后注册的赢，
     之前"成长"已经接上真实页面了，又在这里被占位提示盖掉，点了就只弹一句"还在复刻"。
     现在先查一下有没有处理器，有就跳过，以后每补一页都不用手动从这份清单里删。 */
  /* V9.6.39：原来这里兜底给 open_travel / open_guide 挂"还在复刻队列里"的 toast ——
     这两页在 sc-guide.js 里都接上真页面了，兜底永远不触发，删掉（不留没有 UI 的状态）。 */
})();
