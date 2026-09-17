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
  function coachHero() {
    const L = [
      ['hero:0', '【境界】是你的修为阶段：每突破一阶全属性永久上涨，36 阶走满 +50.4%。突破在「成长 → 境界渡劫」。'],
      ['hero:1', '【等级】升级会给你属性点和技能点 —— 这两样要自己去「主角卡」里分，不会自动加。'],
      ['hero:2', '【主角】这一行就是提醒你还有多少点没分。数值是金色的，说明有事可做。'],
      ['hero:3', '【转生】是把等级和世界进度重置、换永久天赋点 —— 中后期最主要的成长线。'],
    ];
    L.forEach(function (x) { U.coach(x[0], x[1], { key: 'tut_hero_' + x[0], mustTap: true }); });
    U.coach('open_protag', '最后：点开这张主角卡 —— 六维、技能、装备、血统、境界全在里面。',
      { key: 'tut_hero_open', mustTap: true, swallow: false, queue: true, onDone: tourNext });
  }

  /* V9.6.36：**主线每一步 = 引导的一步**（父亲大人：合并成一套）。
     一张表按"当前主线是哪一步 + 现在在哪一页"决定播哪组；每组只播一次（key 记存档），
     所以老号第一次进这个模块时也会补上。旁白式、逐项、必须点中。 */
  const TUT = {
    q01:  { page: 'home',    run: coachHero },                       // 熟悉身体（逐项讲主角卡，已做）
    q01b: { page: 'world',   s: ['stage:0'], t: '这一关就是你的第一场仗 —— 点它直接开打；一关要一口气打完所有波次。' },
    q02:  { page: 'world',   s: ['stage:0'], t: '每通关一关解锁下一关，右下角会在打完后直接给你「下一关」。' },
    q03:  { page: 'recruit', s: ['pull1:normal', 'pull1:normal:free'], t: '招募在这里：每天有免费次数，先用掉 —— 免费抽也计入主线。' },
    q04:  { page: 'party',   s: ['pslot:0', 'pslot:1', 'pslot:2'], t: '点空格子把伙伴放上阵（共 5 格，主角占 1 格）。长按任意一格可以拖着换位置。' },
    q05:  { page: 'world',   s: ['stage:1'], t: '第 2 关开始出现多波敌人 —— 血量会继承，不会自动回满。' },
    q06:  { page: 'world',   s: ['stage:2'], t: '第 3 关打完就解锁「装备强化」这条线，回头记得把装备拉一拉。' },
    q07:  { page: 'bag',     s: ['bagview:equip'], t: '强化在这里：切到「装备」，点一件装备进去花材料强化。' },
    q08:  { page: 'world',   s: ['stage:3'], t: '第 4 关是精英关：敌人更硬、掉落更好，打不动就先回首页收挂机收益。' },
    q10:  { page: 'world',   s: ['stage:11'], t: '第 12 关是这一世界的守关 Boss —— 打完解锁下一个世界。' },
    q11:  { page: 'corridor',s: ['corridor_fight'], t: '深井：一直往上打、没有重置。每 10 层给一枚深井印记，井内全属性加成。' },
    q13:  { page: 'protag',  s: ['pblup'], t: '血统升级消耗血统结晶 + 点数 —— 这是中期最猛的成长线，每级全属性都涨。' },
  };
  function coachByQuest(page) {
    const cu = Core.currentQuest && Core.currentQuest();
    const qid = cu && cu.q && cu.q.id;
    const rule = qid && TUT[qid];
    if (!rule || rule.page !== page) return false;
    const key = 'tut_' + qid;
    if (U.coachSeen(key)) return false;
    if (rule.run) { rule.run(); return true; }
    U.coach(rule.s, rule.t, { key: key, mustTap: true });
    return true;
  }

  /* V9.6.37：**新解锁的功能也自动开指引**（父亲大人第 2 条：解锁时弹窗打断）。
     判定方式是"这个模块已解锁 + 这一课没讲过"，所以：
       · 新号刚解锁 → 第一次进这个模块就弹（并且是强制点中才算过）；
       · 老号从没进过 → 进去同样补一次。
     锚点可以写前缀（'bup:*' / 'eqd:*'），动态 id 也能锚。 */
  const UNLOCK_GUIDE = {
    recruit:  { page: 'recruit',  s: ['pull1:normal', 'pull1:normal:free'], t: '招募解锁了：每天有免费次数先用掉，抽到的伙伴记得去「队伍」上阵。' },
    shop:     { page: 'shop',     s: ['shoptab:god'], t: '兑换大厅：四家店各用不同货币，日常用券和材料都在这儿补。' },
    enhance:  { page: 'bag',      s: ['bagview:equip', 'eqd:*'], t: '装备强化解锁了：切到「装备」、点一件进去，花材料提升数值。' },
    buildings:{ page: 'buildings',s: ['bup:*'], t: '基地建设：五栋建筑每升一级都是永久加成，花的是挂机就能刷的点数。' },
    tasks:    { page: 'tasks',    s: ['tasktab:main'], t: '任务解锁了：主线 / 日常 / 周常 / 成就四个标签，做完记得回来领。' },
    corridor: { page: 'corridor', s: ['corridor_fight'], t: '深井解锁了：一直往上打、没有重置，每 10 层给一枚印记加成。' },
    bloodline:{ page: 'protag',   s: ['pblup'], t: '血统解锁了：升级消耗血统结晶 + 点数，每级全属性都涨。' },
    /* 这三条的按钮都是**条件出现**的（能突破/够蛋/够条件才有 id）——
       找不到目标时 drawCoach 会自动退回"点一下继续"，不会把人卡住。 */
    geneLock: { page: 'genelock', s: ['gl_unlock'], t: '铭刻解锁了：一条条点满，每条都是永久加成 —— 花的是血统结晶。' },
    beast:    { page: 'beast',    s: ['beast_hatch1', 'beast_hatch10'], t: '伴生体解锁了：花蛋孵出来能带上场，给全队加属性。' },
    reincarn: { page: 'reincarn', s: ['do_reincarn'], t: '转生解锁了：重置等级和世界进度换永久天赋点 —— 中后期的主力成长线。' },
  };
  function coachByUnlock(page) {
    const ids = Object.keys(UNLOCK_GUIDE);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], g = UNLOCK_GUIDE[id];
      if (g.page !== page) continue;
      if (!(Core.isUnlocked && Core.isUnlocked(id))) continue;
      if (U.coachSeen('tut_unlock_' + id)) continue;
      U.coach(g.s.length ? g.s : 'page_back', g.t, { key: 'tut_unlock_' + id, mustTap: g.s.length > 0 });
      return true;
    }
    return false;
  }

  /* V9.6.43（父亲大人："开局签订完契约选完系统后，就只能跟着指引先操作一遍，带着玩家整体操作一遍"）：
     把"一页一组"接成**一条链** —— 上一组走完自动进下一组，该换页就换页。
     每一步仍然可以「跳过这一步」（保命阀），但不会停在原地等人自己乱点。
     顺序：逐项讲主角卡 → 点开主角卡 → 回首页领主线奖励 → 去残域打第 1 关。 */
  const TOUR = [
    { key: 'tour_hero',  page: 'home',    run: coachHero },
    { key: 'tour_claim', page: 'home',    s: ['claim_quest', 'goto_quest'],
      t: '这里是主线：每做完一步就能在这儿领奖励。以后跟着它走就不会迷路。' },
    { key: 'tour_dun',   page: 'dungeon', s: ['w:W01'],
      t: '主线让你打副本：进「残域」，点这个世界，再点第 1 关就开打。' },
    { key: 'tour_world', page: 'world',   s: ['stage:0'],
      t: '点第 1 关就开始 —— 一关要一口气打完所有波次，血量继承、不会自动回满。' },
    /* V9.6.44：链子接着往下走 —— 打完回来领奖励 → 去招募 → 去队伍上阵。
       这几步也是"进到对应页面且没讲过就播"，所以哪怕玩家中途退出，下次进那一页也会续上。 */
    { key: 'tour_back',   page: 'home',    s: ['claim_quest', 'goto_quest'],
      t: '打完了？回首页把这一步的奖励领掉 —— 主线奖励不领，后面那步不会解锁。' },
    { key: 'tour_rec',    page: 'recruit', s: ['pull1:normal', 'pull1:normal:free'],
      t: '主线下一步要一名伙伴：每天有免费抽，先用掉 —— 免费抽也计入主线。' },
    { key: 'tour_team',   page: 'party',   s: ['pslot:0', 'pslot:1', 'pslot:2'],
      t: '抽到的伙伴来这儿上阵：点空格子放人；长按任意一格可以拖着换位置。' },
  ];
  G.tourNext = function () {
    const S = Core.S;
    S.coachSeen = S.coachSeen || {};
    for (let i = 0; i < TOUR.length; i++) {
      const st = TOUR[i];
      if (S.coachSeen[st.key]) continue;
      if (CV.top().name !== st.page) { CV.cur = st.page; CV.reset(st.page); }
      if (st.run) {
        /* 用 run() 的那一步（逐项讲主角卡）本身没有固定 key，
           这里立刻把 tour 的那把钥匙记上 —— 否则 G.tourNext 每次都会重新跑它、链子走不下去。 */
        S.coachSeen[st.key] = true; Core.save();
        st.run();
      }
      else {
        U.coach(st.s, st.t, { key: st.key, mustTap: true, queue: true,
          onDone: (i + 1 < TOUR.length) ? G.tourNext : null });
      }
      return;
    }
  };

  G.coachFor = function (page) {
    if (coachByUnlock(page)) return;     // 刚解锁的模块优先讲
    if (coachByQuest(page)) return;      // 主线那一步优先（合并成一套：一次只讲一件事）
    if (page === 'home') {
      const S = Core.S;
      for (let i = 0; i < TOUR.length; i++) {
        if (!(S.coachSeen || {})[TOUR[i].key]) { G.tourNext(); return; }
      }
    }
    const C = [
      ['home', ['claim_quest', 'goto_quest'], '主线每一步做完都能领奖励 —— 右边那颗按钮。'],
      ['home', ['claim_all'], '离线期间也在攒，回来点一下就能收。'],
      ['world', ['stage:0'], '点第 1 关就直接开打 —— 一关是一口气打到底的，打完最后一波才算过关。'],
      ['recruit', ['pull1:normal', 'pull1:normal:free'], '每天有免费的招募次数，先用掉 —— 免费抽也计入主线。'],
      ['protag', ['pblup'], '血统升级消耗血统结晶 + 点数，是中期最猛的成长线。'],
    ];
    C.forEach(function (row) {
      if (row[0] !== page) return;
      /* 页面级的基础引导也走「必须点中」（父亲大人要的是完全强制）—— 之前这几个是「看到就过」。 */
      U.coach(row[1], row[2], { key: 'tut_page_' + row[0] + '_' + [].concat(row[1]).join('_'), mustTap: true, queue: true });
    });
  };

  CV.register('home', function () {
    const S = Core.S;
    U.begin();

    /* ① 主角卡 .card.text-rows：四行【标签】值，行间虚线；整块都能点进角色页 */
    const st = Core.realmState(), au = Core.authorityInfo(), sect = Core.sectInfo();
    const rows = [
      ['【境界】', st.curName || '未定血统', st.hasBloodline ? ('已突破 ' + st.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶') : ''],
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
        CV.text(CV.fit(r[1], U.iw() - 28 * CV.SCALE - sw, CV.FS.lg, true), U.ix() + U.iw() - vw - sw, cy,
          { size: CV.FS.lg, bold: true, color: (i === 0 && st.hasBloodline) || i === 2 ? CV.C.gold : CV.C.text });
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
      if (q) {
        const label = q.done ? '领取奖励' : '去完成 ›';
        const bw = CV.measure(label, CV.FS.md) + 26 * CV.SCALE;
        const tw = CV.measure('主线 · ' + q.q.name, CV.FS.f1, true);
        const tag = '第 ' + (qi + 1) + '/' + mq.length + ' 步';
        const tagW = CV.measure(tag, CV.FS.xs) + 14 * CV.SCALE;
        const textW = U.iw() - bw - 10 * CV.SCALE;
        CV.text(CV.fit('主线 · ' + q.q.name, textW, CV.FS.f1, true), U.ix(), top + 10 * CV.SCALE, { size: CV.FS.f1, bold: true });
        CV.round(U.ix() + tw + 8 * CV.SCALE, top + 3 * CV.SCALE, tagW, 17 * CV.SCALE, CV.RADIUS_SM, null, CV.C.line2);
        CV.text(tag, U.ix() + tw + 8 * CV.SCALE + tagW / 2, top + 11.5 * CV.SCALE, { size: CV.FS.xs, color: CV.C.text2, align: 'center' });
        CV.text(CV.fit('完成奖励：' + Core.rewardTextOf(q.q.reward), textW, CV.FS.sm), U.ix(), top + 29 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        U.btn(U.ix() + U.iw() - bw, top, bw, BH, label, q.done ? 'primary' : 'ghost', q.done ? 'claim_quest' : 'goto_quest');
      } else {
        CV.text('主线 · 已走完', U.ix(), top + 10 * CV.SCALE, { size: CV.FS.f1, bold: true });
        CV.text('挑战更高难度与深井', U.ix(), top + 29 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      }
      U.y = top + BH;
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
    U.tiles(growAll.filter((x) => !x[3] || Core.isUnlocked(x[3])));
    const locked = growAll.filter((x) => x[3] && !Core.isUnlocked(x[3])).map((x) => x[1]);
    if (locked.length) { U.space(CV.SP[1]); U.hint('还没解锁：' + locked.join(' / ')); }
    /* 日常（网页版 .grid-title「日常」+ 六格；红点与"真的能领"同源） */
    U.space(CV.SP[2]);
    /* 网页版 .grid-title 的 margin 是 `var(--sp3) 2px var(--sp2)`：上 14 / 下 **10**。
       以前只推进了行高、没有下边距，标题跟下面那排卡片贴在一起了（父亲大人截图点出来的）。 */
    const gridTitleH = CV.FS.sm * 1.2;
    CV.text('日常', U.pad() + 2, U.y + gridTitleH / 2, { size: CV.FS.sm, color: CV.C.dim, ls: 2 });   // .grid-title letter-spacing 2px
    U.y += gridTitleH + CV.SP[1];
    U.tiles([
      ['open_bounty', '限时悬赏', null, null, bountyDot],
      ['open_tasks', '每日任务', null, 'tasks', taskDot],
      ['open_ach', '成就', null, null, achDot],
      ['open_sign', '求签', null, null, signReady],
      ['open_recruit', '招募伙伴', null, 'recruit', freeDot],
      ['open_shop', '兑换大厅', null, 'shop'],
    ].filter((x) => !x[3] || Core.isUnlocked(x[3])));
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
        CV.text('距下一次 ' + Math.round(Math.max(0, prog.every - prog.sec)) + ' 秒', U.ix() + U.iw(), cy, { size: CV.FS.md, color: CV.C.dim, align: 'right' });
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
      /* 行 1：【挂机】 + ◈x.x/分 + （EXP…/离线…/上限…） */
      let x = U.ix();
      CV.text('【挂机】', x, top + lh / 2, { size: CV.FS.md, color: dim });
      x += CV.measure('【挂机】', CV.FS.md) + GAP;
      const v1 = '◈ ' + r0.pointsPerMin.toFixed(1) + '/分';
      CV.text(v1, x, top + lh / 2, { size: CV.FS.md, color: txt });
      x += CV.measure(v1, CV.FS.md) + GAP;
      const s1 = 'EXP ' + r0.expPerMin.toFixed(1) + '/分 · 离线 ' + Math.round(Core.offlineEfficiency() * 100) + '% · 上限 ' + Core.offlineCapHours().toFixed(1) + 'h';
      CV.text(CV.fit(s1, U.ix() + U.iw() - x, CV.FS.sm), x, top + lh / 2, { size: CV.FS.sm, color: dim });
      /* 行 2：【已挂】+ 时长（网页版 V9.6.3 起把【待领】挪到单独一行，这里照做） */
      const y2 = top + lh;
      const dur = G.formatDuration ? G.formatDuration(bank.seconds) : (bank.seconds + '秒');
      const durTxt = dur + (Core.idleFull && Core.idleFull() ? '（已满）' : '');
      let x2 = U.ix();
      CV.text('【已挂】', x2, y2 + lh / 2, { size: CV.FS.md, color: dim });
      x2 += CV.measure('【已挂】', CV.FS.md) + GAP;
      CV.text(durTxt, x2, y2 + lh / 2, { size: CV.FS.md, color: txt });
      /* 行 3：【待领】**单开一行**（父亲大人：窄屏就不会被挤断行了） */
      const y3 = top + lh * 2;
      const gainTxt = '◈ ' + fmt(bank.points) + ' · EXP ' + fmt(bank.exp)
        + (bank.otherworld ? ' · ◆ ' + bank.otherworld : '') + (bank.story ? ' · ❖ ' + bank.story : '');
      let x3 = U.ix();
      CV.text('【待领】', x3, y3 + lh / 2, { size: CV.FS.md, color: dim });
      x3 += CV.measure('【待领】', CV.FS.md) + GAP;
      CV.text(CV.fit(gainTxt, U.ix() + U.iw() - x3, CV.FS.md), x3, y3 + lh / 2, { size: CV.FS.md, color: txt });
      /* 行 4：【分工】+ 名单 */
      const y4 = top + lh * 3;
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
