/* 小游戏 canvas 界面框架（重做版）
   ------------------------------------------------------------------------------
   规矩（父亲大人 2026-09-16 定）：
     · **网页版是唯一标准**：这里所有数值都从网页版 css/style.css 的 :root 与规则里抄，
       不允许自己设计颜色/字号/间距；
     · 布局用"游标 + 相对计算"（一律基于 CV.W），**不许写死 375 这类设计宽**；
     · 每个界面按网页版同一页的结构顺序画，一页一页对照。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;

  const CV = {
    /* 画布尺寸（逻辑像素）——运行时由 setup() 按真实窗口算出来 */
    W: 375, H: 812, TOP: 0, NAV_H: 62,
    ctx: null, DPR: 1, safeTop: 0, safeBottom: 0,
    stack: [], hits: [], toasts: [],
    panels: {},
    /* —— 设计令牌：逐条抄自网页版 css/style.css 的 :root（唯一标准）—— */
    C: {
      bg: '#07090e', bg2: '#0b0e15',
      panel: '#111621', panel2: '#161d2a', panel3: '#1d2534',
      line: '#232b3b', line2: '#333e55', lineSoft: '#ffffff0d',
      text: '#e9edf6', text2: '#b6bfd0', dim: '#7a849b',
      accent: '#d43a4f', accent2: '#97273a', gold: '#e6b64c',
      green: '#56c894', blue: '#6ec6ff', red: '#d43a4f',
    },
    /* 下面这几组数值在 setup() 里按网页版的根字号等比缩放：
       网页版 css 里是 html { font-size: clamp(14.5px, 3.85vw, 16px) }，
       所有令牌都是 rem —— 这里用**同一条公式**算出系数 k，两边字距/间距才会一样大。 */
    SCALE: 1,
    SP: [4, 10, 14, 18, 24],       // --sp1..--sp5
    RADIUS: 10, RADIUS_SM: 7,      // --radius / --radius-sm
    FS: { xs: 11, sm: 11, md: 12, lg: 13, f1: 15, f2: 17 },   // --fs-xs..--fs-2
    FONT: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    NAV_TABS: [
      { id: 'home', name: '灯阁', ico: '🏮' },
      { id: 'dungeon', name: '残域', ico: '⚔' },
      { id: 'roster', name: '执灯者', ico: '👥' },
      { id: 'bag', name: '背包', ico: '🎒' },
    ],
  };
  CV.cur = 'home';

  /* ---------- 初始化：按真实窗口算尺寸（不再"375 设计 + 整体缩放"） ---------- */
  CV.setup = function (info) {
    const pxW = info.windowWidth || 375;
    const pxH = info.windowHeight || 812;
    const dpr = info.pixelRatio || 1;
    const sa = info.safeArea || null;
    CV.safeTop = sa && sa.top ? sa.top : 0;
    CV.safeBottom = sa && sa.bottom != null ? Math.max(0, pxH - sa.bottom) : 0;
    CV.W = Math.min(520, pxW);            // 网页版 #app 的 max-width: 520
    CV.H = pxH;
    CV.DPR = dpr;
    const canvas = wx.createCanvas();
    canvas.width = Math.round(pxW * dpr);
    canvas.height = Math.round(pxH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    CV.ctx = ctx;
    CV.pxW = pxW; CV.pxH = pxH;
    /* —— 令牌缩放：与网页版保持一致（父亲大人要求"网页版是唯一标准"）——
       V9.5.84：网页版把根字号从 clamp(14.5px, 3.85vw, 16px) 改成**固定 16px**，
       原因是 375 及以下的手机上根字号只有 14.5px，最小那档字号 11×0.906 = **9.97px**，
       比定下的"字号下限 11px"还小（父亲大人一直说"字看不到"就是这个）。
       这里跟着把 k 固定成 1：字号恒为 11/11/12/13/15/17，间距/圆角/控件高也不再缩。
       代价是窄屏上内容大 10%（多滚一点），换来的是所有字都真的 ≥11px。 */
    const k = 1;
    CV.SCALE = k;
    CV.SP = [4, 10, 14, 18, 24].map((v) => v * k);
    CV.FS = { xs: 11 * k, sm: 11 * k, md: 12 * k, lg: 13 * k, f1: 15 * k, f2: 17 * k };
    CV.RADIUS = 10 * k; CV.RADIUS_SM = 7 * k;
    CV.NAV_H = 62 * k;
    try { G.CE_CANVAS = canvas; } catch (e) {}       // 开发期截图用
    return CV;
  };

  /* ---------- 绘制原语（数值都对齐网页版） ---------- */
  CV.text = function (str, x, y, opt) {
    opt = opt || {};
    const c = CV.ctx;
    c.fillStyle = opt.color || CV.C.text;
    c.font = `${opt.bold ? '600 ' : ''}${opt.size || CV.FS.lg}px ${CV.FONT}`;
    c.textAlign = opt.align || 'left';
    c.textBaseline = opt.baseline || 'middle';
    c.fillText(String(str), x, y);
  };
  CV.measure = function (str, size, bold) {
    const c = CV.ctx;
    c.font = `${bold ? '600 ' : ''}${size}px ${CV.FONT}`;
    try { return c.measureText(String(str)).width || 0; } catch (e) { return String(str).length * size * 0.9; }
  };
  /* 圆角矩形（网页版 .card：bg #111621 / 边 #232b3b / 圆角 10） */
  CV.round = function (x, y, w, h, r, fill, stroke, lw) {
    const c = CV.ctx;
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  };
  CV.card = function (x, y, w, h, opt) {
    opt = opt || {};
    CV.round(x, y, w, h, opt.radius === undefined ? CV.RADIUS : opt.radius,
      opt.fill || CV.C.panel, opt.line === null ? null : (opt.line || CV.C.line));
  };
  /* 文字截断：超宽加省略号（网页版的 text-overflow: ellipsis） */
  CV.fit = function (str, maxW, size, bold) {
    str = String(str == null ? '' : str);
    if (CV.measure(str, size, bold) <= maxW) return str;
    let out = str;
    while (out.length > 1 && CV.measure(out + '…', size, bold) > maxW) out = out.slice(0, -1);
    return out + '…';
  };
  /* 折行：按可用宽度断行（返回行数组，最多 maxLines 行，超出末行加省略号） */
  CV.wrap = function (str, maxW, size, maxLines) {
    const chars = String(str == null ? '' : str).split('');
    const lines = [];
    let line = '';
    chars.forEach((ch) => {
      if (CV.measure(line + ch, size) > maxW && line) { lines.push(line); line = ch; }
      else line += ch;
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
      const keep = lines.slice(0, maxLines);
      keep[maxLines - 1] = CV.fit(keep[maxLines - 1] + (lines[maxLines] || ''), maxW, size);
      return keep;
    }
    return lines;
  };

  /* ---------- 触摸命中区 ----------
     V9.5.93（父亲大人："小游戏功能点了没反应"）：命中区**分两套坐标系**，
     以前混在一起比，导致内容区的按钮判定整体偏移了一整条顶栏（点 A 触发 A 下面那个）。
       · 内容区（U.card / U.btn / 宫格…）：画在"内容游标"里，坐标从内容顶部算 → 'content'
       · 顶栏 / 底栏 / 确认弹窗：直接按屏幕坐标画 → 'screen'
     登记时带上坐标系，派发时各自换算，两边都不再错位。 */
  CV.hitMode = 'content';
  CV.hit = function (id, x, y, w, h) { CV.hits.push({ id, x, y, w, h, screen: CV.hitMode === 'screen' }); };
  /* 屏幕坐标 → 内容坐标（含滚动） */
  CV.localY = function (py) { return py - (CV.TOP + 8) + (CV.scroll || 0); };
  CV.dispatch = function (id) {
    const fn = CV.onAct[id];
    if (fn) { fn(); return true; }
    /* 动态 id（装备 uid、道具 id 这类）：允许登记前缀处理器 'eqd:*'，
       命中时把冒号后面那段当参数传进去 —— 否则每画一件装备就得注册一个闭包。 */
    const i = String(id).indexOf(':');
    if (i > 0) {
      const pre = String(id).slice(0, i + 1) + '*';
      if (CV.onAct[pre]) { CV.onAct[pre](String(id).slice(i + 1)); return true; }
    }
    return false;
  };
  CV.onAct = {};
  CV.on = function (id, fn) { CV.onAct[id] = fn; };

  /* ---------- 页面栈（每次换页把滚动位置归零，和网页版换页一个手感） ---------- */
  CV.scroll = 0;
  CV.register = function (name, drawFn) { CV.panels[name] = drawFn; };
  /* 换页时把"页面级覆盖层"清掉 —— 否则结算层会跟着下一页一起被画出来（V9.6.1 修） */
  CV.reset = function (name, opts) { CV.stack = [{ name, opts: opts || {} }]; CV.scroll = 0; CV.pageOverlay = null; CV.render(); };
  CV.push = function (name, opts) { CV.stack.push({ name, opts: opts || {} }); CV.scroll = 0; CV.pageOverlay = null; CV.render(); };
  CV.pop = function () { if (CV.stack.length > 1) CV.stack.pop(); CV.scroll = 0; CV.pageOverlay = null; CV.render(); };
  CV.top = function () { return CV.stack[CV.stack.length - 1] || { name: 'home', opts: {} }; };

  /* ---------- 渲染一帧 ---------- */
  CV.render = function () {
    const c = CV.ctx;
    if (!c) return;
    CV.hits = [];
    CV.y = 0;
    /* 开局三步（欢迎 / 起名 / 选血统）时**不画顶栏和底栏**——
       网页版这时整块界面是隐藏的（没签契约看不到游戏界面，V9.5.23 定的），这里照做。 */
    /* 战斗页也是整屏接管：网页版战斗遮罩盖住了顶栏和底栏，这里同样不画标准顶栏/底栏，
       由战斗页自己画"标题 / 速度 / 撤离"那一条（V9.5.93）。 */
    const chromeless = ['welcome', 'create', 'bloodline', 'battle'].indexOf(CV.top().name) >= 0;
    if (chromeless) { CV.TOP = CV.safeTop; CV.NAV_H = 0; }
    c.save();
    c.fillStyle = CV.C.bg;
    c.fillRect(0, 0, CV.W, CV.H);
    c.translate(Math.round((CV.pxW - CV.W) / 2), 0);
    c.beginPath(); c.rect(0, 0, CV.W, CV.H); c.clip();
    if (CV.top().name === 'battle') CV.battleHead((CV.top().opts && CV.top().opts.title) || '战斗');
    else if (!chromeless) CV.topbar();
    c.save();
    c.beginPath(); c.rect(0, CV.TOP + 8, CV.W, CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8); c.clip();
    c.translate(0, CV.TOP + 8 - (CV.scroll || 0));
    CV.y = 0;
    const fn = CV.panels[CV.top().name];
    if (fn) fn(CV.top().opts);
    /* 内容总高：游标在通用件里（U.y），以前这里读的是 CV.y —— 那个变量在渲染时被归零后
       再没人写过，于是 contentH 恒等于 20、maxScroll 恒为 0，**滚动等于没有**（V9.5.93 修）。 */
    CV.contentH = ((G.U && G.U.y) || CV.y || 0) + 20;
    c.restore();
    /* 内容画完才知道总高：把滚动量夹回合法范围（换页 / 状态变化后内容变短也要收回来）。
       V9.6.7（父亲大人："能一屏显示就一屏显示，不要还能上下拉一点的，很别扭"）：
       以前不管内容多高都额外加一段 CV.SP[1] 的下留白，于是**刚好铺满一屏**的页面
       （深井就是）也还能被拉动十来像素。现在只有内容真的超出一屏才给那点留白。 */
    const viewH = CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8;
    const bottom = CV.contentH - 20;        // contentH 里那 20 是给"滚到底"留的尾白，量的时候要减掉
    CV.maxScroll = bottom <= viewH ? 0 : (bottom - viewH + CV.SP[1]);
    if (CV.scroll > CV.maxScroll) { CV.scroll = CV.maxScroll; }
    if (!chromeless) CV.navbar();
    if (G.U && G.U.drawOverlay) G.U.drawOverlay();     // 确认弹窗画在最上面（通用件 U）
    /* 页面级覆盖层（战斗结算这类"整屏一幕"）：**必须在内容裁剪之外**画 ——
       V9.6.1（父亲大人："结算内容也得在画面中间"）：以前结算画在内容层里，被顶栏下移、还跟着滚动，
       既不在正中、命中区也整体偏下（"收下奖励并返回"因此点不动）。 */
    if (CV.pageOverlay) CV.pageOverlay();
    CV.drawToasts();
    c.restore();
  };

  /* ---------- 顶栏（照网页版 #topbar：玩家行 + 货币行） ----------
     网页版数值（css/style.css）：
       .player-row  padding: sp2(10) 12 sp1(4)，gap sp2(10)；.pname 15 粗体；.plv 11 金色 + 描边；
                    .genelock 11 红字（铭刻名）
       #curbar      padding: 2px 12px sp2(10)，gap 0.375rem(6)
       .cur-chip    min-height 2.5rem(**40px**)、padding 5px 11px、radius 7、字号 12、gap 5
     小游戏原来把胶囊画成 30px 高、左边距 14 —— 比网页版矮一截、还往外偏 2px（V9.5.93 修）。 */
  CV.topbar = function () {
    const c = CV.ctx, S = (G.Core && G.Core.S) || null, D = G.DATA;
    const top = CV.safeTop;
    const ROW_H = 34, CHIP_H = 40, BAR_TOP = 2, BAR_BOTTOM = 10;
    const h = top + ROW_H + BAR_TOP + CHIP_H + BAR_BOTTOM;
    CV.TOP = h;
    c.fillStyle = 'rgba(7,9,14,.94)';
    c.fillRect(0, 0, CV.W, h);
    c.strokeStyle = CV.C.line; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h - .5); c.lineTo(CV.W, h - .5); c.stroke();
    const PAD = 12 * CV.SCALE;                       // 网页版顶栏左右 0.75rem
    const name = (S && S.player.name) || '执灯者';
    const lv = (S && S.player.level) || 0;
    const ny = top + 10 * CV.SCALE + 10 * CV.SCALE;   // 行内中线
    CV.text(name, PAD, ny, { size: CV.FS.f1, bold: true });
    const nw = CV.measure(name, CV.FS.f1, true);
    /* Lv. 胶囊：网页版 .plv（金色描边 + 圆角 7 + 左右 6px） */
    const lvTxt = 'Lv.' + lv;
    const lw = CV.measure(lvTxt, CV.FS.sm) + 12 * CV.SCALE;
    CV.round(PAD + nw + 10 * CV.SCALE, ny - 8 * CV.SCALE, lw, 16 * CV.SCALE, CV.RADIUS_SM, null, '#e6b64c66');
    CV.text(lvTxt, PAD + nw + 10 * CV.SCALE + lw / 2, ny, { size: CV.FS.sm, color: CV.C.gold, align: 'center' });
    /* 铭刻名（网页版 .genelock：11px 红字，只在解锁后出现） */
    if (S && S.player.geneLock > 0 && D && D.GENE_LOCKS && D.GENE_LOCKS[S.player.geneLock - 1]) {
      const gt = '铭刻·' + D.GENE_LOCKS[S.player.geneLock - 1].name;
      CV.text(CV.fit(gt, CV.W - PAD * 2 - nw - lw - 30, CV.FS.sm), PAD + nw + 10 * CV.SCALE + lw + 10 * CV.SCALE, ny,
        { size: CV.FS.sm, color: CV.C.accent });
    }
    /* 货币行：三个主力货币 + 全部货币（图标 + 数值，胶囊 40 高） */
    const cur = (S && S.cur) || {};
    const fmt = G.fmt || ((n) => String(n));
    const main = (D ? D.CURRENCIES : []).filter((x) => ['points', 'holy', 'otherworld'].indexOf(x.id) >= 0);
    let x = PAD;
    const cy = top + ROW_H + BAR_TOP;
    const chip = function (label, icon, color, dim, dashed) {
      const w = 11 * CV.SCALE + CV.measure(icon, CV.FS.md) + 5 * CV.SCALE + CV.measure(label, CV.FS.md) + 11 * CV.SCALE;
      const ww = Math.max(40 * CV.SCALE, w);
      CV.round(x, cy, ww, CHIP_H, CV.RADIUS_SM, CV.C.panel, dashed ? CV.C.line2 : CV.C.line);
      if (dashed) {                                   // .cur-chip.more：虚线边框
        CV.ctx.save();
        CV.ctx.strokeStyle = CV.C.line2; CV.ctx.setLineDash([4, 3]); CV.ctx.lineWidth = 1;
        CV.round(x, cy, ww, CHIP_H, CV.RADIUS_SM, null, CV.C.line2);
        CV.ctx.restore();
      }
      let tx = x + 11 * CV.SCALE;
      if (icon) { CV.text(icon, tx, cy + CHIP_H / 2, { size: CV.FS.md, color: color || CV.C.text }); tx += CV.measure(icon, CV.FS.md) + 5 * CV.SCALE; }
      CV.text(label, tx, cy + CHIP_H / 2, { size: CV.FS.md, color: dim ? CV.C.dim : CV.C.text, bold: true });
      x += ww + 6 * CV.SCALE;
      return ww;
    };
    main.forEach((cc) => { chip(fmt(cur[cc.id] || 0), cc.icon, cc.color, false, false); });
    if (x + 40 * CV.SCALE < CV.W - PAD) chip('全部货币', '▤', null, true, true);
  };

  /* ---------- 底栏（照网页版 #navbar：四格，选中金色） ---------- */
  CV.navbar = function () {
    const c = CV.ctx;
    const h = CV.NAV_H + CV.safeBottom;
    const y = CV.H - h;
    c.fillStyle = 'rgba(12,15,23,.98)';
    c.fillRect(0, y, CV.W, h);
    const tabW = CV.W / CV.NAV_TABS.length;
    CV.NAV_TABS.forEach((t, i) => {
      const cx = tabW * i + tabW / 2;
      const active = CV.top().name === t.id || (CV.top().name === 'home' && t.id === 'home');
      CV.text(t.ico, cx, y + 22, { size: 19, align: 'center' });
      CV.text(t.name, cx, y + 42, { size: CV.FS.sm, align: 'center', color: active ? CV.C.gold : CV.C.dim });
      if (active) {
        c.fillStyle = CV.C.gold;
        c.fillRect(cx - 13, y, 26, 2);          // 网页版 .nav-item.active::before：1.625rem × 2px
      }
      CV.hitMode = 'screen';
      CV.hit('tab:' + t.id, tabW * i, y, tabW, h);
      CV.hitMode = 'content';
    });
  };

  CV.drawToasts = function () {
    if (!CV.toasts.length) return;
    const t = CV.toasts[0];
    const w = Math.min(CV.W - 40, CV.measure(t.msg, CV.FS.lg) + 32);
    const x = (CV.W - w) / 2, y = CV.TOP + 12;
    CV.round(x, y, w, 34, 999, 'rgba(0,0,0,.85)', CV.C.line);
    CV.text(t.msg, CV.W / 2, y + 17, { size: CV.FS.lg, align: 'center' });
  };
  CV.toast = function (msg) {
    CV.toasts = [{ msg, t: Date.now() }];
    CV.render();
    setTimeout(() => { CV.toasts = []; CV.render(); }, 1600);
  };

  /* ---------- 触摸 ---------- */
  CV.bindTouch = function () {
    const toW = (e) => {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return { x: (t.clientX || t.pageX || 0) - Math.round((CV.pxW - CV.W) / 2), y: t.clientY || t.pageY || 0 };
    };
    const RAF = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : ((fn) => setTimeout(fn, 16));
    let downY = 0, moved = false, startScroll = 0, lastY = 0, lastT = 0, vel = 0, raf = null;
    const stopMomentum = () => { if (raf) { try { cancelAnimationFrame(raf); } catch (e) {} raf = null; } };
    /* 滚动：以前框架里**只有读没有写**（CV.scroll 永远是 0），页面一长（首页、残域）下面的内容
       就永远看不到。这里补上拖拽滚动 + 松手惯性，和手机原生滚动手感一致。 */
    wx.onTouchStart((e) => {
      const p = toW(e);
      downY = p.y; lastY = p.y; lastT = Date.now(); vel = 0; moved = false;
      startScroll = CV.scroll || 0;
      stopMomentum();
    });
    wx.onTouchMove((e) => {
      const p = toW(e);
      const dy = p.y - downY;
      if (Math.abs(dy) > 8) moved = true;
      if (!moved) return;
      const now = Date.now(), dt = Math.max(1, now - lastT);
      vel = (p.y - lastY) / dt;                    // px/ms，向下拖为正
      lastY = p.y; lastT = now;
      const next = Math.max(0, Math.min(CV.maxScroll || 0, startScroll - dy));
      if (next !== CV.scroll) { CV.scroll = next; CV.render(); }
    });
    wx.onTouchEnd((e) => {
      const p = toW(e);
      if (moved) {                                 // 松手 → 惯性
        let sp = -vel * 14;
        if (Math.abs(sp) < 1) return;
        const step = () => {
          sp *= 0.92;
          const next = Math.max(0, Math.min(CV.maxScroll || 0, CV.scroll + sp));
          const edge = next === CV.scroll;
          CV.scroll = next; CV.render();
          if (Math.abs(sp) > 0.6 && !edge) raf = RAF(step); else raf = null;
        };
        raf = RAF(step);
        return;
      }
      /* 点击：内容区登记的是"内容坐标"，这里换算（− 顶栏 − 8 + 滚动）后再比 ——
         以前两边坐标系不同直接比，内容区所有按钮的判定都偏了一整条顶栏。 */
      const ly = CV.localY(p.y);
      const overlayOnly = !!(G.U && G.U.overlay);   // 确认弹窗打开时，底下的内容不吃点击
      for (let i = CV.hits.length - 1; i >= 0; i--) {
        const h = CV.hits[i];
        if (overlayOnly && !h.screen) continue;
        const wy = h.screen ? p.y : ly;
        if (p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) {
          CV.dispatch(h.id); return;
        }
      }
    });
  };

  G.CV = CV;
})();
