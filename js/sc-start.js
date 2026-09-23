/* 开局三步（照网页版 js/ui.js 的 showTutorial / showCharCreate / bloodlineModal 逐句抄）
   ------------------------------------------------------------------------------
   ① 欢迎（必须签契约）→ ② 起名 → ③ 选血统 → 首页。
   网页版这三步是不可跳过的弹窗（没有 ×、遮罩点不掉、返回键也关不掉）；
   小游戏这边本来就是分页，天然跳不过去。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;

  /* ================= ⓪ 开机合规闸（V1.0.3 · AI 视觉工程师 · 提审硬要求） =================
     依据《微信小游戏平台运营规范》特别规范：
       · 2.6.2《健康游戏忠告》—— 必须在**游戏开始前**、画面的**显著位置全文登载**；
       · 2.6.1 —— 在游戏开始前、忠告**之后**设专门页面，标明游戏著作权人 / 出版服务单位 /
                 批准文号 / 出版物号等；
       · 6.1 适龄提示 —— 显著、可读。
     小游戏原来是一条都没有（rg 著作权 / 健康游戏忠告 全库 0 命中），适龄提示只在开机首屏闪 1.5 秒。
     现在照网页版同一条流程（ui.js:showComplianceGate）做**两页**：
       notice     ——《健康游戏忠告》全文 ＋ 适龄徽标 ＋ 「下一步」；
       copyright  ——【著作权人信息】专门页 ＋ 适龄徽标 ＋ 「进入灯阁」。
     两条硬口径：
       · **文案一个字都不在本文件里** —— 全部来自 data.js 的 `D.COMPLIANCE`（两端同一份来源，
         本文件只负责排版；尺子 page_text_audit 会查有没有手抄）；
       · **必须点出来**（没有超时、没有自动让位）：开机那 1.5 秒的首屏过去之后，
         画面就停在 notice 上，唯一的出口是按钮 —— 与网页版同一条。 */
  /* 适龄徽标：两页都**常驻**（老做法只有开机首屏一闪），点一下看全文。
     底色 CV.C.panel ＋ 文字 CV.C.text2 ≥4.5:1（与网页版 #gate .gate-age 同一档；
     尺子 visual_audit 的对比度那条两端各钉一次）。 */
  function ageBadge() {
    const h = 40 * CV.SCALE, top = U.y;
    CV.round(U.pad(), top, U.cw(), h, CV.RADIUS_SM, CV.C.panel, CV.a(CV.C.gold, .5));
    CV.text(CV.fit(D.COMPLIANCE.ageBadge, U.cw() - 90 * CV.SCALE, CV.FS.lg), U.pad() + 12 * CV.SCALE, top + h / 2,
      { size: CV.FS.lg, color: CV.C.text2, bold: true });
    CV.text('看全文 ›', U.pad() + U.cw() - 12 * CV.SCALE, top + h / 2,
      { size: CV.FS.md, color: CV.C.gold, align: 'right' });
    CV.hit('age_more', U.pad(), top, U.cw(), h);
    U.y = top + h + CV.SP[3];
  }
  CV.on('age_more', function () {
    /* 全文（与网页版逐字一致）：只看不改状态 —— 关掉它，合规闸还在原地 */
    U.confirm('适龄提示', D.COMPLIANCE.ageFull, null, { cancel: false, okLabel: '知道了' });
  });

  CV.register('notice', function () {
    U.begin();
    U.space(Math.max(24 * CV.SCALE, CV.H * 0.06));
    ageBadge();
    U.card(function () {
      U.h3(D.COMPLIANCE.healthTitle);
      /* 四句**逐句一行、一句不省**（法规要的是全文登载，缩写或只放链接都不算） */
      D.COMPLIANCE.healthAdvice.forEach(function (line) {
        U.hint(line, 4 * CV.SCALE, CV.C.text2);
      });
    });
    U.space(CV.SP[3]);
    U.btnRow([{ label: '下一步 · 著作权人信息', style: 'primary', id: 'notice_next' }]);
    /* 步骤与小字与网页版**逐字一致**（对表尺子 parity_audit 会两边比对，谁少一句谁红） */
    U.hint('第 1 / 2 步 · 《健康游戏忠告》全文', CV.SP[2], CV.C.dim);
  });
  CV.on('notice_next', function () { CV.reset('copyright'); });

  CV.register('copyright', function () {
    U.begin();
    U.space(Math.max(16 * CV.SCALE, CV.H * 0.04));
    ageBadge();
    U.card(function () {
      U.h3(D.COMPLIANCE.ownerTitle);
      U.hint(D.COMPLIANCE.ownerNote, CV.SP[1]);
      D.COMPLIANCE.ownerFields.forEach(function (f) {
        /* 值留空 → 统一画「待填」（由父亲大人一处填、两端同时生效） */
        U.kv(f.k, f.v || D.COMPLIANCE.ownerBlank, f.v ? CV.C.text2 : CV.C.dim);
      });
    });
    U.space(CV.SP[3]);
    U.btnRow([{ label: '进入灯阁', style: 'primary', id: 'gate_enter' }]);
    U.hint('第 2 / 2 步 · 点「进入灯阁」开始游戏', CV.SP[2], CV.C.dim);
  });
  /* 放行：进 game.js 在开机时算好的那一页（欢迎 / 起名 / 选命格 / 首页）——
     合规闸只负责挡在前面，不负责决定去哪一页。 */
  CV.on('gate_enter', function () { CV.reset((G && G.NEXT_AFTER_NOTICE) || 'home'); });

  /* ================= ① 欢迎（网页版 showTutorial 的文案） ================= */
  CV.register('welcome', function () {
    U.begin();
    /* 网页版是居中弹窗（sticky、没有关闭入口），小游戏这边是整页，所以先留一段上边距把它压到画面中部 */
    U.space(Math.max(40 * CV.SCALE, CV.H * 0.18));
    U.card(function () {
      U.h3('欢迎来到灯阁');
      U.eventDesc([
        { t: '你被神秘存在选中，成为了', tail: { t: '执灯者', color: CV.C.accent, bold: true } },
        { t: '' },
        { t: '在这里，你将：' },
        { t: '🌀 进入残域执行探索任务' },
        { t: '👥 招募伙伴，组建五人小队（主角必上阵）' },
        { t: '🧬 解锁命格与铭刻，突破极限' },
        { t: '♾ 挑战深井，寻找离开的方法' },
        { t: '' },
        { t: '如果下一场探索真的会死，你会带谁进去？', bold: true },
      ], 2 * CV.SCALE);
      U.space(CV.SP[2]);
      U.btnRow([{ label: '签订灯阁契约', style: 'primary', id: 'welcome_ok' }]);
    });
  });

  /* V9.6.33（父亲大人："我重开在这就卡死了"）：**真死键** ——
     「签订灯阁契约」只登记了热区，全工程**没有任何 welcome_ok 的处理器**，点了什么都不会发生，
     于是清档重开后永远卡在开局页。
     （上一轮我那个"热区 vs 处理器"审计脚本**已经把它报出来了**，我判成误报放过了 —— 这是我的错。） */
  CV.on('welcome_ok', function () { CV.reset('create'); });

  /* ================= ② 起名（网页版 showCharCreate） ================= */
  const NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];
  let nameIdx = Math.floor(Math.random() * NAMES.length);
  CV.register('create', function () {
    U.begin();
    U.card(function () {
      U.h3('创建你的执灯者');
      U.eventDesc(['灯阁需要一个名字来记录你的行程。这个名字将伴随你进入每一个世界。'], 2 * CV.SCALE);
      U.space(CV.SP[2]);
      /* 名字框：网页版是一个 input，canvas 里点一下弹微信键盘；右边一个 🎲 换一个 */
      const h = 44 * CV.SCALE, gap = 8 * CV.SCALE;
      const bw = 52 * CV.SCALE;
      const top = U.y;
      CV.round(U.ix(), top, U.iw() - bw - gap, h, CV.RADIUS_SM, CV.C.panel, CV.C.line);
      CV.text(CV.fit(NAMES[nameIdx], U.iw() - bw - gap - 24 * CV.SCALE, CV.FS.f1 * CV.SCALE), U.ix() + 12 * CV.SCALE, top + h / 2, { size: CV.FS.f1 * CV.SCALE });
      CV.hit('name_type', U.ix(), top, U.iw() - bw - gap, h);
      U.btn(U.ix() + U.iw() - bw, top, bw, h, '🎲', 'ghost', 'name_roll');
      U.y = top + h;
    });
    U.space(CV.SP[3]);
    /* V9.6.90：按钮文案与网页版对齐（网页版 showCharCreate 那颗是「创建并开始探索」） */
    U.btnRow([{ label: '创建并开始探索', style: 'primary', id: 'name_ok' }]);

  });
  CV.on('name_roll', () => { nameIdx = (nameIdx + 1) % NAMES.length; CV.render(); });
  /* V1.0.1（2026-09-23 · 平台违规警告 · P0 事故，康康漏改的那一处）
     ────────────────────────────────────────────────────────────────
     原来这里弹微信键盘让玩家**自由输入**名字，`NAMES[nameIdx] = v` 输什么存什么。
     有人输了政治敏感词 → 平台判【UGC 模块存在政治敏感内容】、
     限 **48 小时**整改（截止 2026-09-25 08:38），逾期封禁「被搜索 / 分享 / 分享到朋友圈」能力。

     **为什么上次没堵住**：V1.0.1 那次只改了 sc-last.js 的「新建主角」，
     漏了**这一处开局起名** —— 而起名才是每个玩家必经的那一步。（这是康康的漏改，记在这儿。）

     现在起名**只能从下面这份预设名单里选**：点名字 = 换一个，不再产生任何自由文本。
     名单里也不含任何姓氏 + 名字的可组合结构（都是完整的固定词），从根上不可能拼出敏感词。

     ⚠️ 别再把这里改回 showKeyboard：平台那条规范要的是「UGC 模块不得出现违规内容」，
        而**去自由输入是唯一零成本且可自证的合规做法**（接内容安全 API 需要 access_token，
        客户端直调不了，得养云函数 —— 单机游戏不值得）。 */
  CV.on('name_type', function () {
    nameIdx = (nameIdx + 1) % NAMES.length;   // 点名字框 = 换一个（原来是弹键盘）
    CV.render();
  });
  CV.on('name_ok', () => { Core.setPlayerName(NAMES[nameIdx]); CV.reset('bloodline'); });

  /* ================= ③ 选血统（网页版 bloodlineModal 的"未选"分支） ================= */
  CV.register('bloodline', function () {
    U.begin();
    U.h3('选择命格', '选定后不可更改');                 // 网页版：标题右侧写"选定后不可更改"
    U.y += CV.SP[1];
    Object.keys(D.BLOODLINES).forEach((id) => {
      const bl = D.BLOODLINES[id];
      /* V1.1.3（创意总监 B3：这一页**两端不同源**）：
         网页版 `js/ui.js:3304` 那张卡是 `bl-scope`（边框走本命格的暗档）＋ 名字前面挂印记 `blGlyph(id,18)`，
         而小游戏这一页只有标题和三行小字 —— 没有印记、也没有灯色。
         于是"选命格 ＝ 点亮你那盏灯"这件事，**恰好在要送审的那一端看不见**（六灯同框缺席）。
         现在补齐，取值全部从数据层来（第一盏灯＝锚色本人）：
           · 灯色  CV.blLamp(id, 0) → D.BLOOD_LAMP[id][0]（＝BLOOD_THEME[id].lamp，与网页版 --t-lamp 同源）
           · 印记  CV.blGlyph(id, …) → D.BLOOD_GLYPH[id]（顶点表只有一份，两端共用）
           · 边框  从同一盏灯派一个 α（`CV.a(lamp,.38)`）——
             网页版那一档是 --t-line2 的六个 hex，canvas 这端不再手抄一遍第二张表。 */
      const lamp = CV.blLamp(id, 0) || CV.C.text;   // 取不到就退回正文色，绝不画出 undefined
      U.card(function () {
        /* V9.6.96（父亲大人报"选科技进去变修真"）：
           这位用户的操作路径查不出代码问题（当前代码选科技就是科技，有端到端取证），
           但这个页面的**手感**确实容易点错 —— 六张卡纵向排开要滚很远，而"觉醒"按钮
           压在每张卡的**最底部**，紧挨着下一张卡的标题：手指一抖就点到隔壁那条血统了。
           现在改成网页版 .card h3 .hbtn 那种排法：**按钮挪到卡片标题行右侧**（和血统名同一行），
           并且**整张卡片都能点** —— 点哪张就是哪张，不用瞄准一颗小按钮。 */
        const cardTop = U.y - CV.SP[2];        // 卡片外框上沿（U.card 的上下内边距 = SP[2]）
        /* V9.6.142：血统说明原来塞在标题右边的窄位里 → 「狼人近战输出。每级：攻击+1.2%、…」被砍。
           改成**标题行只放名字 + 觉醒按钮**，说明和境界线各占一整行 —— 一字不丢。 */
        U.h3(id, '', {
          color: lamp,                                     // 名字走本命格的灯色（网页版 .bl-title）
          glyph: { bl: id, color: lamp, size: CV.ICO },    // 印记在名字左边（网页版 blGlyph(id,18)；画布走 CV.ICO 令牌）
          btn: { label: '觉醒', id: 'bl_pick:' + id },
        });
        U.hint(bl.desc, 2 * CV.SCALE);
        /* V9.6.142：境界线那串名字走 kv（右边只能占约 62% 宽）→ 被砍成「兽崽 → 幼狼 → …」。
           改成**整行小字**（占满宽度），六条血统的完整境界线都看得见。 */
        U.hint('境界线：' + bl.realms.join(' → '), 2 * CV.SCALE);
        U.hint('每大境分初期 / 中期 / 后期 / 大圆满，共 ' + D.REALM_STAGE_COUNT + ' 阶。', 2 * CV.SCALE);
        if (!U.dry) CV.hit('bl_pick:' + id, U.pad(), cardTop, U.cw(), U.y - cardTop);
      }, { line: CV.a(lamp, .38) });
    });
  });
  Object.keys(G.DATA.BLOODLINES).forEach(function (id) {
    CV.on('bl_pick:' + id, function () {
      U.confirm('确认命格', '选择「' + id + '」后不可更改，境界线将从「' + D.realmName(id, 0) + '」开始。确定吗？', function () {
        const r = Core.choosePlayerBloodline(id);
        CV.toast(r.msg || '已觉醒');
        CV.reset('home');
      });
    });
  });
})();
