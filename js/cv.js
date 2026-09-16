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
    /* —— 令牌缩放：与网页版 html{font-size:clamp(14.5px,3.85vw,16px)} 同一条公式 ——
       375 及以下 → 14.5/16 = 0.906；430 以上 → 16/16 = 1；中间线性过渡。
       这样同一个界面在手机和网页上看起来一样大（父亲大人要求"网页版是唯一标准"）。 */
    const root = Math.max(14.5, Math.min(16, 0.0385 * pxW));
    const k = root / 16;
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

  /* ---------- 触摸命中区 ---------- */
  CV.hit = function (id, x, y, w, h) { CV.hits.push({ id, x, y, w, h }); };
  CV.dispatch = function (id) {
    const fn = CV.onAct[id];
    if (fn) fn();
  };
  CV.onAct = {};
  CV.on = function (id, fn) { CV.onAct[id] = fn; };

  /* ---------- 页面栈 ---------- */
  CV.register = function (name, drawFn) { CV.panels[name] = drawFn; };
  CV.reset = function (name, opts) { CV.stack = [{ name, opts: opts || {} }]; CV.render(); };
  CV.push = function (name, opts) { CV.stack.push({ name, opts: opts || {} }); CV.render(); };
  CV.pop = function () { if (CV.stack.length > 1) CV.stack.pop(); CV.render(); };
  CV.top = function () { return CV.stack[CV.stack.length - 1] || { name: 'home', opts: {} }; };

  /* ---------- 渲染一帧 ---------- */
  CV.render = function () {
    const c = CV.ctx;
    if (!c) return;
    CV.hits = [];
    CV.y = 0;
    /* 开局三步（欢迎 / 起名 / 选血统）时**不画顶栏和底栏**——
       网页版这时整块界面是隐藏的（没签契约看不到游戏界面，V9.5.23 定的），这里照做。 */
    const chromeless = ['welcome', 'create', 'bloodline'].indexOf(CV.top().name) >= 0;
    if (chromeless) { CV.TOP = CV.safeTop; CV.NAV_H = 0; }
    c.save();
    c.fillStyle = CV.C.bg;
    c.fillRect(0, 0, CV.W, CV.H);
    c.translate(Math.round((CV.pxW - CV.W) / 2), 0);
    c.beginPath(); c.rect(0, 0, CV.W, CV.H); c.clip();
    if (!chromeless) CV.topbar();
    c.save();
    c.beginPath(); c.rect(0, CV.TOP + 8, CV.W, CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8); c.clip();
    c.translate(0, CV.TOP + 8 - (CV.scroll || 0));
    CV.y = 0;
    const fn = CV.panels[CV.top().name];
    if (fn) fn(CV.top().opts);
    CV.contentH = CV.y + 20;
    c.restore();
    if (!chromeless) CV.navbar();
    if (G.U && G.U.drawOverlay) G.U.drawOverlay();     // 确认弹窗画在最上面（通用件 U）
    CV.drawToasts();
    c.restore();
  };

  /* ---------- 顶栏（照网页版 #topbar：玩家行 + 货币行） ---------- */
  CV.topbar = function () {
    const c = CV.ctx, S = (G.Core && G.Core.S) || null;
    const top = CV.safeTop;
    const h = top + 78;
    CV.TOP = h;
    c.fillStyle = 'rgba(7,9,14,.98)';
    c.fillRect(0, 0, CV.W, h);
    c.strokeStyle = CV.C.line; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h - .5); c.lineTo(CV.W, h - .5); c.stroke();
    const name = (S && S.player.name) || '执灯者';
    const lv = (S && S.player.level) || 1;
    CV.text(name, 14, top + 20, { size: CV.FS.f1, bold: true });
    const nw = CV.measure(name, CV.FS.f1, true);
    /* Lv. 胶囊：网页版 .plv（金色描边 + 圆角 7） */
    const lvTxt = 'Lv.' + lv;
    const lw = CV.measure(lvTxt, CV.FS.sm) + 12;
    CV.round(14 + nw + 10, top + 20 - 8, lw, 16, CV.RADIUS_SM, null, '#e6b64c66');
    CV.text(lvTxt, 14 + nw + 10 + lw / 2, top + 20, { size: CV.FS.sm, color: CV.C.gold, align: 'center' });
    /* 货币行：网页版 #curbar 的三个主力货币 + 全部货币 */
    const D = G.DATA;
    const cur = (S && S.cur) || {};
    const main = (D ? D.CURRENCIES : []).filter((x) => ['points', 'holy', 'otherworld'].indexOf(x.id) >= 0);
    let x = 14;
    const fmt = G.fmt || ((n) => String(n));
    main.forEach((cc) => {
      const label = cc.icon + ' ' + fmt(cur[cc.id] || 0);
      const w = CV.measure(label, CV.FS.md) + 22;
      CV.round(x, top + 40, w, 30, CV.RADIUS_SM, CV.C.panel, CV.C.line);
      CV.text(cc.icon, x + 11, top + 55, { size: CV.FS.md, color: cc.color });
      CV.text(fmt(cur[cc.id] || 0), x + 11 + CV.measure(cc.icon, CV.FS.md) + 5, top + 55, { size: CV.FS.md });
      x += w + 6;
    });
    const more = '▤ 全部货币';
    const mw = CV.measure(more, CV.FS.md) + 22;
    CV.round(x, top + 40, mw, 30, CV.RADIUS_SM, CV.C.panel, CV.C.line);
    CV.text(more, x + 11, top + 55, { size: CV.FS.md, color: CV.C.dim });
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
        c.fillRect(cx - 14, y, 28, 2);
      }
      CV.hit('tab:' + t.id, tabW * i, y, tabW, h);
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
    let downY = 0, moved = false;
    wx.onTouchStart((e) => { const p = toW(e); downY = p.y; moved = false; });
    wx.onTouchMove((e) => { const p = toW(e); if (Math.abs(p.y - downY) > 8) moved = true; });
    wx.onTouchEnd((e) => {
      const p = toW(e);
      if (moved) return;
      for (let i = CV.hits.length - 1; i >= 0; i--) {
        const h = CV.hits[i];
        if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) { CV.dispatch(h.id); return; }
      }
    });
  };

  G.CV = CV;
})();
