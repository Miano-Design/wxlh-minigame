/* 开局三步（照网页版 js/ui.js 的 showTutorial / showCharCreate / bloodlineModal 逐句抄）
   ------------------------------------------------------------------------------
   ① 欢迎（必须签契约）→ ② 起名 → ③ 选血统 → 首页。
   网页版这三步是不可跳过的弹窗（没有 ×、遮罩点不掉、返回键也关不掉）；
   小游戏这边本来就是分页，天然跳不过去。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;

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
        { t: '🧬 解锁血统与铭刻，突破极限' },
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
  CV.on('name_type', function () {
    if (!(G.wx && G.wx.showKeyboard)) { CV.toast('这台设备不支持键盘输入'); return; }
    try {
      if (G.wx.onKeyboardConfirm) {
        G.wx.onKeyboardConfirm(function (res) {
          const v = String((res && res.value) || '').trim().slice(0, 12);
          if (v) NAMES[nameIdx] = v;
          try { G.wx.hideKeyboard({}); } catch (e) {}
          CV.render();
        });
      }
      G.wx.showKeyboard({ defaultValue: NAMES[nameIdx], maxLength: 12, multiple: false, confirmType: 'done', fail: function () {} });
    } catch (e) { CV.toast('打开键盘失败'); }
  });
  CV.on('name_ok', () => { Core.setPlayerName(NAMES[nameIdx]); CV.reset('bloodline'); });

  /* ================= ③ 选血统（网页版 bloodlineModal 的"未选"分支） ================= */
  CV.register('bloodline', function () {
    U.begin();
    U.h3('选择血统', '选定后不可更改');                 // 网页版：标题右侧写"选定后不可更改"
    U.y += CV.SP[1];
    Object.keys(D.BLOODLINES).forEach((id) => {
      const bl = D.BLOODLINES[id];
      U.card(function () {
        /* V9.6.96（父亲大人报"选科技进去变修真"）：
           这位用户的操作路径查不出代码问题（当前代码选科技就是科技，有端到端取证），
           但这个页面的**手感**确实容易点错 —— 六张卡纵向排开要滚很远，而"觉醒"按钮
           压在每张卡的**最底部**，紧挨着下一张卡的标题：手指一抖就点到隔壁那条血统了。
           现在改成网页版 .card h3 .hbtn 那种排法：**按钮挪到卡片标题行右侧**（和血统名同一行），
           并且**整张卡片都能点** —— 点哪张就是哪张，不用瞄准一颗小按钮。 */
        const cardTop = U.y - CV.SP[2];        // 卡片外框上沿（U.card 的上下内边距 = SP[2]）
        U.h3(id, bl.desc, { btn: { label: '觉醒', id: 'bl_pick:' + id } });
        U.kv('境界线', bl.realms.slice(0, 5).join(' → ') + (bl.realms.length > 5 ? ' → …' : ''));
        U.hint(bl.role ? (bl.role + '。每大境分初期 / 中期 / 后期 / 大圆满，共 ' + D.REALM_STAGE_COUNT + ' 阶。')
          : ('每大境分初期 / 中期 / 后期 / 大圆满，共 ' + D.REALM_STAGE_COUNT + ' 阶。'), 6 * CV.SCALE);
        if (!U.dry) CV.hit('bl_pick:' + id, U.pad(), cardTop, U.cw(), U.y - cardTop);
      });
    });
  });
  Object.keys(G.DATA.BLOODLINES).forEach(function (id) {
    CV.on('bl_pick:' + id, function () {
      U.confirm('确认血统', '选择「' + id + '」后不可更改，境界线将从「' + D.realmName(id, 0) + '」开始。确定吗？', function () {
        const r = Core.choosePlayerBloodline(id);
        CV.toast(r.msg || '已觉醒');
        CV.reset('home');
      });
    });
  });
})();
