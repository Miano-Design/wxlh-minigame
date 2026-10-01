/* 开局三步（照网页版 js/ui.js 的 showTutorial / showCharCreate / bloodlineModal 逐句抄）
   ------------------------------------------------------------------------------
   ① 欢迎（必须签契约）→ ② 起名 → ③ 选血统 → **主画面（gate）** → 点【进入残域】→ 首页。
   网页版这三步是不可跳过的弹窗（没有 ×、遮罩点不掉、返回键也关不掉）；
   小游戏这边本来就是分页，天然跳不过去。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;

  /* ================= ⓪ 主画面（V1.0.6 · 设计师 · 两块收口） =================
     父亲大人 2026-09-23 原话：「著作权不要啊，个人的没有这个，适龄好像到时上线小程序会自己打，
     这些等审核通过再说吧」；问他忠告留不留，答：「留着呗」。
     同日再改口径：「健康游戏是独立的弹窗，不要跟主画面做到一起」—— 时机他选 **C＝冷启动先弹**。
     主画面**只剩两块**：品牌 →【进入残域】（与网页版 #boot 逐样对齐）。
     《健康游戏忠告》四句搬进**独立弹窗** `U.healthNotice`（uiw.js），由 game.js 在冷启动时
     先弹、关掉才往下走（老档：弹窗 → 主画面；新档：弹窗 → 欢迎/签契约 → 起名 → 选命格 → 主画面）。
     撤掉的两块（连落位一起撤）：
       · 适龄提示徽标（含「看全文 ›」那颗）—— 网页版那颗同步撤；⚠️ **「设置与存档」里那张
         适龄卡保留**（父亲大人点名留的，文案仍取自 D.COMPLIANCE.ageFull）；
       · 著作权人信息——主画面那一行、那颗入口、以及它点开的 `copyright` 专门页
         （设置页里那份也一起撤；个人主体没有这一项，等审核通过再说）。
     ⚠️ 忠告那四句**一字不省、同屏、不滚动、不用点开** —— 合规岗 2026-09-23 现抓官方原文后拍死：
        特别规范 2.6.2 ＋《微信小程序平台常见拒绝情形》3.6.6 要的是"游戏开始前、显著位置
        **全文登载**"，摘要＋点开、要滚动才看全，都判"不是全文登载"。
        （"先弹"不算违规：弹窗排在玩家碰得到任何玩法之前，四句全在，且不用滚动、不用点开第二层。）
     两条硬口径：
       · **文案一个字都不在本文件里** —— 全部来自 data.js 的 `D.COMPLIANCE`（两端同一份来源，
         本文件只负责排版；尺子 page_text_audit 会查有没有手抄）；
       · **主画面不自己让位**（没有超时、没有自动跳走）：开机那 1.5 秒首屏过去之后就停在这一页，
         唯一的出口是【进入残域】—— 与网页版同一条。 */

  /* ---------- 主画面（老档的开机第一页 / 新档走完建档三步的落点） ----------
     与网页版 #boot 逐样对齐：品牌 →【进入残域】。
     **忠告不在这里**（父亲大人：不要跟主画面做到一起）—— 它是 uiw.js 的 U.healthNotice 弹窗，
     开机那一会儿盖在这一页上面；关掉才看得见这一页。 */
  CV.register('gate', function () {
    U.begin();
    /* V1.0.6（父亲大人 2026-09-23：「这个文字和按钮不应该居中在画面吗，都在上面好看吗」）：
       品牌（两行活字）＋【进入残域】是**一个整体块**，整块排在画面纵向中部 —— 不是只把按钮挪下去。
       居中范围＝**安全可视窗**：上沿从 `safeTop + 8` 起（cv.js 的内容层就从这里开始画，
       8 是那圈裁剪留白），下沿到 `H - safeBottom` 为止 —— 于是顶部不撞胶囊那一行、底部不撞 home 条，
       短屏 / 长屏都不用"为了躲安全区把块推回顶部"。
       块高 = 标题 0.7×d3 ＋ 副标题 30S ＋ 收尾 12S ＋ 段距 SP[4] ＋ 按钮 44S（与下面逐项对应）。
       尺子：scripts/layout_audit.js 的《构图》那一节（320×568 / 390×844 / 430×932 各算一遍，40%~60%）。 */
    const S = CV.SCALE;
    const viewTop = CV.safeTop + 8;
    const viewH = CV.H - CV.safeBottom - viewTop;
    /* V1.1.11（父亲大人 09-27：「这个是我做的主画面标题…换掉电脑字，记得适配不同手机的屏幕」）：
       品牌从**两行活字**换成他的题字图（`U.brandTitle`，宽度按屏宽 86%、短屏再夹一道高度上限）。
       ⇒ 块高里那一条 `DISP.d3×0.7` 换成 `U.brandTitleH(brandW)`，其余项不变；
       「提灯入残域」作为副题**仍是活字**（图里只有那四个字，没有这句）。 */
    const brandW = Math.min(CV.W * 0.94, 620 * S);   // 2026-10-01 题字放大：0.86 → 0.94（父亲大人："不太突出"）
    const brandH = U.brandTitleH(brandW);
    const blockH = brandH + 6 * S + 30 * S + 12 * S + CV.SP[4] + U.BTN_H * S;
    /* 落位再收半步：**光学中心**——几何居中看着偏下，本室惯用比几何中心高一点（约 5% 屏高）；
       这一下也正好让开主视觉里右下那尊提灯者（真图里它的头部上沿约在 58% 处，
       块底压在 53% 左右才留得出净距 —— **主体不许被色块/文字压**，那是红线，不是偏好）。
       V1.1.11（换成题字图之后）：块高从"一行活字"长到"一张图"（132px 级），
       原来的 `(viewH - blockH)/2 - OPTICAL` 会把整块顶到 40% 线以上（尺子当场报 39.9%）。
       改成**直接对准目标中心线**：可视窗中心再抬 5% 屏高 —— 换任何块高，中心都落在它该在的地方。 */
    const centerY = viewTop + viewH / 2 - CV.H * 0.05;
    U.space(Math.max(CV.SP[4], centerY - blockH / 2 - viewTop));
    /* 品牌：与网页版 #boot 的 .boot-title / .boot-say 同两行**活字**
       （主视觉底图里一个字都没有 —— 图带字＝同一件美术两份定义）。 */
    U.draw(function () {
      const y0 = U.y;
      U.brandTitle(CV.W / 2 - brandW / 2, y0, brandW);       // 题字图（图没到位时自动退回活字）
      const ty = y0 + brandH + 6 * CV.SCALE;
      CV.text('提灯入残域', CV.W / 2, ty + 30 * CV.SCALE, { size: CV.FS.lg, align: 'center', color: CV.C.text2, ls: 4 });
      U.y = ty + 30 * CV.SCALE + 12 * CV.SCALE;
    });
    U.space(CV.SP[4]);
    /* 唯一的出口：与网页版 mainScreenHtml 的 `data-enter` 同一件事（1.0.3 那两道"必须点才放行"的
       闸已按合规岗的判断取消，但这一页也不自己跳走）。 */
    U.btnRow([{ label: D.COMPLIANCE.enterLabel, style: 'primary', id: 'gate_enter' }]);
  });

  /* V1.0.6：原来这里还有 2.6.1 的【著作权人信息】专门页（页名 `copyright`）与它的两颗跳转
     （owner_more → copyright / owner_back → gate）。父亲大人 2026-09-23 拍板「著作权不要啊，
     个人的没有这个……等审核通过再说吧」—— 整页连注册一起删掉。留着空页＝审核员点开一片空白。 */
  /* 进残域：接上首页（开局三步 / 补步都已经走完了才到得了这一页）。 */
  CV.on('gate_enter', function () { CV.reset('home'); });

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
  /* V1.0.4 · V（父亲大人 09-27）：名字框**能敲、也能换**。
     `nameDraft` = 玩家自己敲的那个（空 = 用名单里的 NAMES[nameIdx]，也就是从前的走法）。 */
  let nameDraft = '';
  let nameBusy = false;          // 机审在跑：这一下别让他连点（一次请求 <1s）
  CV.register('create', function () {
    U.begin();
    U.card(function () {
      U.h3('创建你的执灯者');
      /* V1.0.4 · V2（父亲大人 09-27：「起名窗口不用有那么多小字注释」）：
         原来这里是一整段说明文（"灯阁需要一个名字来记录你的行程……"）—— **删掉**。
         V1.0.4（09-27 深夜再改，父亲大人：「**起名窗口的小字都删了**」）：
         最后那一行操作提示（"点名字框可以自己敲…"）也**一并删掉** —— 起名卡里从此**一行小字都没有**，
         只留：标题 ＋ 名字框（点它能敲）＋ 🎲（从名单换一个）＋ 底下那颗主按钮。
         ⚠️ 名字上限改成**按中文字符算**（12 个汉字 / 24 个字母），见 `js/sc-namecheck.js` 的 `MAX_W`。 */
      U.space(CV.SP[1]);
      /* 名字框：点它弹微信键盘敲字；右边那个 🎲 = 从名单里换一个（快捷入口，不联网） */
      const h = 44 * CV.SCALE, gap = 8 * CV.SCALE;
      const bw = 52 * CV.SCALE;
      const top = U.y;
      CV.round(U.ix(), top, U.iw() - bw - gap, h, CV.RADIUS_SM, CV.a(CV.C.panel, .50), CV.C.line);
      /* F7 ①：字号**不许**再乘 CV.SCALE（那是观感系数）—— 一乘就把二级字缩到 12.3px、破了五级阶梯 */
      CV.text(CV.fit(nameDraft || NAMES[nameIdx], U.iw() - bw - gap - 24 * CV.SCALE, CV.FS.f1),
        U.ix() + 12 * CV.SCALE, top + h / 2, { size: CV.FS.f1 });
      CV.hit('name_type', U.ix(), top, U.iw() - bw - gap, h);
      U.btn(U.ix() + U.iw() - bw, top, bw, h, '🎲', 'ghost', 'name_roll');
      U.y = top + h;
    });
    U.space(CV.SP[3]);
    /* V9.6.90：按钮文案与网页版对齐（网页版 showCharCreate 那颗是「创建并开始探索」） */
    U.btnRow([{ label: '创建并开始探索', style: 'primary', id: 'name_ok' }]);

  });
  CV.on('name_roll', () => { nameDraft = ''; nameIdx = (nameIdx + 1) % NAMES.length; CV.render(); });
  /* ================= V1.0.4 · V（2026-09-27 · 父亲大人：「自由命名可以接入 api 不……之前就是因为
     命名没有限制被警告了才关的，现在开了云开发能接吗」）=================
     当年那次（V1.0.1 · P0 事故，也发生在这一处）：名字框是自由输入，`NAMES[nameIdx] = v` 输什么存
     什么；有人输了政治敏感词 → 平台判【UGC 模块存在政治敏感内容】、限 **48 小时**整改，
     处置是**整段撤掉自由输入**（改成"从预设名单里换一个"＝白名单，可自证）。

     现在自由输入**开回来，但带审**（平台对 UGC 的硬要求就是"要么没有 UGC，要么有内容安全过滤"）：
       敲字 → 本地筛（成本 0，见 js/sc-namecheck.js）→ 云函数 `checkname` 机审（微信内容安全）→
       **过了才签发那张一次性凭据**，`Core.setPlayerName` 才落盘。
     ⚠️ 三条不许破的：① 名单里的名字不花那次请求（可自证，断网也能起名）；
       ② **没网 / 没云 → 自由输入这条路不可用**，让他用右边那颗 🎲 换名单里的（老路一个字没删）；
       ③ **别绕过 `G.NameCheck` 把键盘里那串字直接塞进 Core** —— 那正是当年翻车的样子。 */
  CV.on('name_type', function () {
    G.NameCheck.ask(nameDraft, function (text, err) {
      if (err) { CV.toast(err); return; }
      const l = G.NameCheck.local(text);
      if (!l.ok) { CV.toast(l.msg); return; }     // 不合格的当场说，不用等云端那一秒
      nameDraft = l.name;
      CV.render();
    });
  });
  CV.on('name_ok', function () {
    if (nameBusy) return;
    const nm = nameDraft || NAMES[nameIdx];
    if (nameDraft) { nameBusy = true; CV.toast('正在审这个名字…'); }   // 名单那条路是同步的，不弹这句
    G.NameCheck.submit(nm, function (r) {
      nameBusy = false;
      if (!r.ok) { CV.toast(r.msg); CV.render(); return; }
      Core.setPlayerName(r.name || nm);
      CV.reset('bloodline');
    });
  });

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
        /* F7 ②：选完命格整个界面切到主画面（看得见 → 删成功语）；失败（条件不满足）留。 */
        if (!r.ok) CV.toast(r.msg || '觉不了');
        /* V1.0.5：选完命格先到**主画面**，由玩家自己点【进入残域】进首页
           （父亲大人："主画面可以在初次登陆选完血统出现"）。 */
        CV.reset('gate');
      });
    });
  });
})();
