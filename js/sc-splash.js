/* 开机首屏 ＋ 选命格背影（V1.1.3 · AI 视觉工程师）
   ==================================================================================
   起因（创意总监《三维度审核》H5）：
     ① 「冷启动无加载态」—— 开机的第一帧画布上什么都没画（**纯黑**），
        而这正是玩家（和审核员）看到的第一眼；
     ② 主视觉 `icons/主视觉-提灯入残域.svg` 从落地那天起**代码零引用** ——
        "提灯入残域"那盏灯从来没上过任何一张屏（网页版这一轮也一起挂上了，见 index.html）。

   这一份干两件事：
     · 开机首屏：主视觉满屏铺 ＋ 游戏名（**活字**）＋ 一条来回走的灯芯（加载态）＋ 版本号，
       约 1.5 秒后自动让位，手指点一下可以立刻跳过（这一下不往下传 —— 见 cv.js 的触摸闸）；
     · 选命格页的背影：同一张图取中偏下裁切、压暗 —— 六张命格卡立在那盏灯的后面，
       而不是浮在纯黑上（网页版是同一条，见 css/style.css 的 .bl-veil）。

   三条规矩：
     · **图片里没有一个字**，标题一律活字（`残域灯阁` 必须与备案名一字不差）；
     · 首帧不可能是黑的：底图没加载完时先铺天空渐变 ＋ 灯晕 ＋ 标题；
     · 底图**只有这一张**：它是 SVG 母版栅格化出来的产物（工具 tools/mv_raster.py），
       不许在 canvas 里再手画一遍提灯者 —— 同一件美术两份定义，改一边忘一边，本项目踩过 ≥6 次。
   ================================================================================== */
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  if (!CV) return;

  const SRC = 'icons/主视觉-提灯入残域.png';
  let img = null, imgOk = false;
  try {
    if (G.wx && typeof G.wx.createImage === 'function') {
      img = G.wx.createImage();
      img.onload = function () { imgOk = true; };
      img.onerror = function () { imgOk = false; };
      img.src = SRC;
    }
  } catch (e) { img = null; }

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

    /* 活字：游戏名（＝备案名，一字不差）＋ 副题 ＋ 加载条 ＋ 版本 */
    const cx = CV.W / 2;
    const ty = CV.H * 0.42;
    CV.text('残域灯阁', cx, ty, { size: CV.DISP.d3, bold: true, align: 'center', color: CV.C.gold, ls: 4 });
    CV.text('提灯入残域', cx, ty + 30 * CV.SCALE, { size: CV.FS.lg, align: 'center', color: CV.C.text2, ls: 4 });
    const bw = CV.W * 0.34, bh = 3 * CV.SCALE;
    const bx = cx - bw / 2, by = ty + 60 * CV.SCALE;
    CV.round(bx, by, bw, bh, CV.RADIUS_CHIP, CV.a(CV.C.gold, 0.18));
    /* 来回走的灯芯：不定进度（真正的结束信号是这一层自己淡出，不是进度走满） */
    const kw = bw * 0.4;
    CV.round(bx + (bw - kw) * t, by, kw, bh, CV.RADIUS_CHIP, CV.C.gold);
    CV.text('灯芯燃起中…', cx, by + 22 * CV.SCALE, { size: CV.FS.sm, align: 'center', color: CV.C.dim });
    if (G.GAME_VER) CV.text('残域灯阁 V' + G.GAME_VER, cx, CV.H - CV.safeBottom - 24 * CV.SCALE,
      { size: CV.FS.sm, align: 'center', color: CV.dim });
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
})();
