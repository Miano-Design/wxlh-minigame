/* 开机首屏 ＋ 选命格背影（V1.1.3 · AI 视觉工程师）
   ==================================================================================
   起因（创意总监《三维度审核》H5）：
     ① 「冷启动无加载态」—— 开机的第一帧画布上什么都没画（**纯黑**），
        而这正是玩家（和审核员）看到的第一眼；
     ② 主视觉从落地那天起**代码零引用** ——
        "提灯入残域"那盏灯从来没上过任何一张屏（网页版这一轮也一起挂上了，见 index.html）。
   V1.1.5（父亲大人："主视觉换成真图"）：底图换成 Flow 出的真图
   `icons/主视觉-提灯入残域-暗调.jpg`（896×1200 · 3:4 · 533KB），**两端同一张、字节一致**
   （网页版 `css/style.css` 的 `#boot::before` / `.bl-veil::before` 用的是同一个文件名，
   尺子 mv_audit 第 ⑧ 条把两端文件名钉在一起）。
   原来用的 `icons/主视觉-提灯入残域.png`（SVG 母版栅格化，1080×1920）已随本次换图删除 ——
   底图只留一张，不留"同一件美术两份定义"。

   这一份干两件事：
     · 开机首屏：主视觉满屏铺 ＋ 游戏名（**活字**）＋ 一条来回走的灯芯（加载态）＋ 版本号，
       约 1.5 秒后自动让位，手指点一下可以立刻跳过（这一下不往下传 —— 见 cv.js 的触摸闸）；
     · 选命格页的背影：同一张图取中偏下裁切、压暗 —— 六张命格卡立在那盏灯的后面，
       而不是浮在纯黑上（网页版是同一条，见 css/style.css 的 .bl-veil）。

   三条规矩：
     · **图片里没有一个字**，标题一律活字（`残域灯阁` 必须与备案名一字不差）；
     · 首帧不可能是黑的：底图没加载完时先铺天空渐变 ＋ 灯晕 ＋ 标题；
     · 底图**只有这一张**（真图 jpg）：不许在 canvas 里再手画一遍提灯者 ——
       同一件美术两份定义，改一边忘一边，本项目踩过 ≥6 次。
     · 3:4 的图在 9:16 画布上 `cover` 会横向裁掉约 25%（每边 12.5%）：提灯者与那盏灯在
       画面 57% 上，裁不掉；纵向没有溢出，所以取中与取中偏下在竖屏上等价（横向才生效）。
   ================================================================================== */
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  if (!CV) return;

  /* ⚠️ **文件名必须是 ASCII**（V1.0.5 实测的硬约束）：`wx.createImage()` 在模拟器 / 真机上
     加载**中文名**的资源一律 `onerror`（实测：`icons/主视觉-提灯入残域-暗调.jpg` 失败，
     同一份字节改成 `icons/mv-main-lamp.jpg` 立刻 896×1200 加载成功；`icons/测试图.jpg` 同样失败）。
     也就是说 V1.1.3/V1.1.5 那两轮"主视觉上屏"在小游戏端**一次都没真的显示过** ——
     当时只做了合成仿真（见 岗位回单/AI视觉工程师-主视觉真图落地.md 第七节），没在模拟器里看过。
     网页版那边不受影响（CSS 走 HTTP，中文名正常），所以**两端文件名可以不同**，
     "两端同一张图"改由**字节一致（sha256）**来钉（尺子 visual_audit ⑦ / mv_audit ⑧）。 */
  /* ================= 2026-10-01（父亲大人 §三）· **正式主视觉上台** =================
     正式 KV ＝ `story/kv/img_main_kv.jpg`（1080×1920，9:16，在 **story 分包**里）。
     加载顺序（三段，缺一层才落下一层）：
       ① 先 `wx.loadSubpackage({name:'story'})` 把分包拉下来（失败静默忽略）；
       ② 取正式 KV —— 成功就是正式主视觉；
       ③ 失败才退 **`icons/mv-main-lamp.jpg`**（896×1200，老图）——
          它现在的定位是**极端兼容 fallback**，正常流程不会再主动显示它；
       ④ 两张都不行 ⇒ 程序化"深色底 + 唯一那盏暖光"（下面 gate 那一支）。
     ⚠️ 加载期**不要再跳回老图**：中途露的是 ④ 那层深色底 + 题字，观感是"灯还没点亮"，
        不会出现"先出新图再闪回旧图"。 */
  const SRC = ((G.STORYDATA && G.STORYDATA.KV_FILE) || 'story/kv/img_main_kv.jpg');
  const LEGACY_SRC = 'icons/mv-main-lamp.jpg';
  let img = null, imgOk = false, legacyTried = false;
  function loadImg(src) {
    try {
      if (!G.wx || typeof G.wx.createImage !== 'function') return;
      img = G.wx.createImage();
      /* 图到位之后**补重画一帧**：主画面（gate）这一类页面不是每秒重画的（只有灯阁首页在跳秒），
         图晚到一步就会一直停在"只有底色"的那一帧上（实测：模拟器 2.5 秒截图里主视觉是空的）。 */
      img.onload = function () { imgOk = true; try { CV.render(); } catch (e) {} };
      img.onerror = function () {
        imgOk = false;
        if (!legacyTried) { legacyTried = true; loadImg(LEGACY_SRC); }   // 极端兼容：退回老主视觉
      };
      img.src = src;
    } catch (e) { img = null; imgOk = false; }
  }
  try {
    if (G.wx && G.wx.loadSubpackage) {
      /* 分包没配 / 拉不动都**不许影响开机**：失败就当作"正式 KV 拿不到"，走老图或程序化底 */
      G.wx.loadSubpackage({ name: 'story', success: function () { loadImg(SRC); }, fail: function () { loadImg(SRC); } });
    } else loadImg(SRC);
  } catch (e) { loadImg(SRC); }

  /* cover 铺法：短边贴满、长边溢出裁掉（与网页版 `background-size: cover` 同一条口径）。
     底图的构图是"主体靠右、脚踩下三分之一"，所以**取中偏下**比取正中最经得起裁。 */
  function cover(c, alpha, yBias) {
    if (!imgOk || !img || !img.width || !img.height) return false;
    const s = Math.max(CV.W / img.width, CV.H / img.height);
    const w = img.width * s, h = img.height * s;
    const dy = (CV.H - h) * (yBias === undefined ? 0.5 : yBias);
    c.save();
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.drawImage(img, (CV.W - w) / 2, dy, w, h);
    c.restore();
    return true;
  }
  /* 压暗：中间一条亮、两头暗 —— 与网页版 `#boot::after` 同一套口径，
     活字才压得住（不然标题正好落在灯晕上，读不出来）。 */
  function scrim(c, top, mid, bottom) {
    const g = c.createLinearGradient(0, 0, 0, CV.H);
    g.addColorStop(0, CV.a(CV.C.shade, top));
    g.addColorStop(0.42, CV.a(CV.C.shade, mid));
    g.addColorStop(1, CV.a(CV.C.shade, bottom));
    c.fillStyle = g;
    c.fillRect(0, 0, CV.W, CV.H);
  }

  /* ---------- ① 开机首屏 ---------- */
  let until = 0, from = 0, raf = null;
  const RAF = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); };

  CV.splashActive = function () { return until > 0 && Date.now() < until; };
  CV.splashSkip = function () {
    until = 0;
    CV.topOverlay = null;
    CV.render();
  };
  CV.splash = function (ms) {
    from = Date.now();
    until = from + (ms || 1500);
    CV.topOverlay = drawSplash;
    CV.render();
    const loop = function () {
      if (!CV.splashActive()) { raf = null; CV.topOverlay = null; CV.render(); return; }
      CV.render();
      raf = RAF(loop);
    };
    if (!raf) raf = RAF(loop);
  };

  function drawSplash() {
    const c = CV.ctx;
    if (!c) return;
    const t = Math.min(1, Math.max(0, (Date.now() - from) / (until - from)));
    c.save();
    /* 底：天空渐变（**这一层保证第一帧不是黑的** —— 图还没 load 完也有东西可看） */
    const sky = c.createLinearGradient(0, 0, 0, CV.H);
    sky.addColorStop(0, CV.C.bg);
    sky.addColorStop(0.62, CV.C.bg2);
    sky.addColorStop(1, CV.C.panel);
    c.fillStyle = sky;
    c.fillRect(0, 0, CV.W, CV.H);
    if (!cover(c, 1, 0.5)) {
      /* 图还没到：先把"唯一那处暖光"画出来 —— 提灯入残域，第一帧就该有那盏灯 */
      const rg = c.createRadialGradient(CV.W * 0.48, CV.H * 0.68, 0, CV.W * 0.48, CV.H * 0.68, CV.W * 0.95);
      rg.addColorStop(0, CV.a(CV.C.goldBright, 0.45));
      rg.addColorStop(0.35, CV.a(CV.C.gold, 0.18));
      rg.addColorStop(1, CV.a(CV.C.gold, 0));
      c.fillStyle = rg;
      c.fillRect(0, 0, CV.W, CV.H);
    }
    scrim(c, 0.72, 0.28, 0.86);

    /* 品牌：**题字图**（父亲大人自制 `story/kv/logo-title.png`）＋ 副题 ＋ 加载条 ＋ 版本。
       V1.1.11：原来这两行都是活字；现在上面那行换成他的图（`U.brandTitle`，
       与主画面 gate 同一处出口 —— 不许在这里再写一份算式）。图没到位时它会**自动退回活字**
       「残域灯阁」，所以"第一帧不是黑的、也不空"这条仍然成立。 */
    const cx = CV.W / 2;
    const brandW = Math.min(CV.W * 0.72, 460 * CV.SCALE);
    const brandH = U.brandTitleH(brandW);
    U.brandTitle(cx - brandW / 2, CV.H * 0.42 - brandH / 2, brandW);
    const ty = CV.H * 0.42 + brandH / 2;
    CV.text('提灯入残域', cx, ty + 26 * CV.SCALE, { size: CV.FS.lg, align: 'center', color: CV.C.text2, ls: 4 });
    const bw = CV.W * 0.34, bh = 3 * CV.SCALE;
    const bx = cx - bw / 2, by = ty + 56 * CV.SCALE;
    CV.round(bx, by, bw, bh, CV.RADIUS_CHIP, CV.a(CV.C.gold, 0.18));
    /* 来回走的灯芯：不定进度（真正的结束信号是这一层自己淡出，不是进度走满） */
    const kw = bw * 0.4;
    CV.round(bx + (bw - kw) * t, by, kw, bh, CV.RADIUS_CHIP, CV.C.gold);
    CV.text('灯芯燃起中…', cx, by + 22 * CV.SCALE, { size: CV.FS.sm, align: 'center', color: CV.C.dim });
    /* V1.1.5 笔误修正：这里原来写的是 `CV.dim`（**少了一个 .C**）。
       CV.dim 是 undefined → CV.text 里 `c.fillStyle = opt.color || CV.C.text` 取的是
       `CV.C.text`（正文近白 #e9edf6），于是版本号这一行一直是**近白**的，
       和它上面那行 --dim 的"灯芯燃起中…"不同色。文案岗查出来过、一直没动，这次一起修。 */
    if (G.GAME_VER) CV.text('残域灯阁 V' + G.GAME_VER, cx, CV.H - CV.safeBottom - 24 * CV.SCALE,
      { size: CV.FS.sm, align: 'center', color: CV.C.dim });
    /* V1.0.3（AI 视觉工程师 · 提审硬要求）：这里原来还有一行适龄提示 —— 删掉了。
       原因：首屏只停 1.5 秒、还能点一下跳过，**一闪而过不叫"显著"**（网页版那边同一处也是这么删的）。
       V1.0.6：主画面上那颗适龄徽标也撤了（父亲大人 2026-09-23：「适龄好像到时上线小程序会
       自己打，这些等审核通过再说吧」），适龄全文只留在「设置与存档」那张卡里；
       品牌首屏这一屏只留品牌（合规岗 2.6.2 要的是《健康游戏忠告》全文，它常驻在主画面上）。 */
    c.restore();
  }

  /* ---------- ② 选命格页的背影 ---------- */
  CV.veils = CV.veils || {};
  CV.veilPage = function (name, fn) { CV.veils[name] = fn; };
  CV.veilPage('bloodline', function (c) {
    /* 网页版那一屏是**两层**叠出来的：`.bl-veil::before`（主视觉 ×0.42）在下面，
       上面还压着 `.modal-mask`（rgba(shade,.62)）—— 肉眼看到的其实只有 0.42×(1-0.62) ≈ **0.16**。
       画布这端没有那层 mask，所以在这里把同样的一档压回去，两端才是一个观感（不是"一端水印、一端样片"）。
       取中偏下裁切：把提灯者留在六张卡后面，而不是把它切掉半个头。 */
    cover(c, 0.42, 0.62);
    scrim(c, 0.68, 0.62, 0.72);
  });

  /* ---------- ③ 主画面的背影（V1.0.5；V1.0.6 只服务 `gate` 一页）----------
     父亲大人："开局的适龄和版权两个弹窗可以不要，主画面可以在初次登陆选完血统出现，
     上面有个按钮写进入残域" —— 主画面这一页（`gate`）在网页版是**主视觉满屏铺**：
     `#boot::before`（同一张真图 cover）＋ `#boot::after`（0.72 / 0.28@42% / 0.86 的竖向渐隐）。
     画布这端照同一条画（same 图、same 档位），两端才是同一个观感。
     V1.0.6：原来 `copyright` 那页也挂这层背影，整页已按父亲大人的话删掉（著作权不要），
     所以这里只剩 `gate` 一次登记。忠告卡是**实底**（U.card → CV.C.panel），
     正文对比度不吃背景的亏（尺子 visual_audit ⑩ 的对比度那条两端各钉一次）。 */
  function mainVeil(c) {
    cover(c, 1, 0.5);
    scrim(c, 0.72, 0.28, 0.86);
  }
  CV.veilPage('gate', mainVeil);
})();
