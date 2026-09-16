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
    U.card(function () {
      U.h3('欢迎来到灯阁');
      U.note('你被神秘存在选中，成为了「执灯者」。');
      U.space(CV.SP[1]);
      U.note('在这里，你将：', 4 * CV.SCALE);
      ['· 进入残域执行探索任务', '· 招募伙伴，组建五人小队（主角必上阵）',
        '· 解锁血统与铭刻，突破极限', '· 挑战深井，寻找离开的方法'].forEach((t) => U.hint(t, 2 * CV.SCALE));
      U.space(CV.SP[2]);
      U.hint('如果下一场探索真的会死，你会带谁进去？', 6 * CV.SCALE);
    });
    U.space(CV.SP[3]);
    U.btnRow([{ label: '签订灯阁契约', style: 'primary', id: 'welcome_ok' }]);
  });
  CV.on('welcome_ok', () => CV.reset('create'));

  /* ================= ② 起名（网页版 showCharCreate） ================= */
  const NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];
  let nameIdx = Math.floor(Math.random() * NAMES.length);
  CV.register('create', function () {
    U.begin();
    U.card(function () {
      U.h3('创建你的执灯者');
      U.note('灯阁需要一个名字来记录你的行程。这个名字将伴随你进入每一个世界。');
      U.space(CV.SP[2]);
      /* 名字框：网页版是一个 input，canvas 里点一下弹微信键盘；右边一个 🎲 换一个 */
      const h = 44 * CV.SCALE, gap = 8 * CV.SCALE;
      const bw = 52 * CV.SCALE;
      const top = U.y;
      CV.round(U.pad(), top, U.cw() - bw - gap, h, CV.RADIUS_SM, CV.C.panel2, CV.C.line2);
      CV.text(NAMES[nameIdx], U.pad() + (U.cw() - bw - gap) / 2, top + h / 2, { size: CV.FS.f2, bold: true, align: 'center', color: CV.C.gold });
      CV.hit('name_type', U.pad(), top, U.cw() - bw - gap, h);
      U.btn(U.pad() + U.cw() - bw, top, bw, h, '🎲', 'ghost', 'name_roll');
      U.y = top + h;
    });
    U.space(CV.SP[3]);
    U.btnRow([{ label: '以这个名字进入残域', style: 'primary', id: 'name_ok' }]);
    U.y += CV.SP[1];
    U.hint('名字定完紧接着选血统：境界线跟着血统走，所以这一步不能拖到 Lv.10');
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
        U.h3(id, bl.desc);
        U.kv('境界线', bl.realms.slice(0, 5).join(' → ') + (bl.realms.length > 5 ? ' → …' : ''));
        U.hint('每大境分初期 / 中期 / 后期 / 大圆满，共 ' + D.REALM_STAGE_COUNT + ' 阶。', 6 * CV.SCALE);
        U.space(CV.SP[2]);
        U.btnRow([{ label: '觉醒 ' + id + ' 血统', style: 'gold', id: 'bl_pick:' + id }]);
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
