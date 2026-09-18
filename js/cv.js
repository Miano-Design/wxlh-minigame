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
      line: '#232b3b', line2: '#333e55', lineSoft: 'rgba(255,255,255,.05)',
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
    const canvas = wx.createCanvas();
    CV.canvas = canvas;
    CV.ctx = canvas.getContext('2d');
    CV.relayout(info || {});
    try { G.CE_CANVAS = canvas; } catch (e) {}       // 开发期截图用
    return CV;
  };

  /* ---------- 按窗口尺寸重算布局（开机 + 每次窗口变化都走这里） ----------
     V9.6.90（父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
     以前尺寸只在开机算一次，而且 **dpr 缩放只 scale() 了一次** ——
     只要主画布被平台重设过一次尺寸（微信在**窗口尺寸变化 / 键盘弹出 / 前后台切换**时会重设
     主画布，重设会**清空整个 ctx 状态**，包括我们那次 scale），
       ① 缩放没了 → 整块界面按 1/dpr 画，底栏整条跑到画面外；
       ② CV.H 还是老值 → 底栏按老高度摆，窗口一变矮就出画。
     现在：尺寸变化一律重算；并且**每帧都显式 setTransform**（见 CV.render），
     外部谁把变换洗掉了都不影响我们。 */
  CV.relayout = function (info) {
    info = info || {};
    const pxW = info.windowWidth || CV.pxW || 375;
    const pxH = info.windowHeight || CV.pxH || 812;
    const dpr = info.pixelRatio || CV.DPR || 1;
    const sa = info.safeArea || null;
    CV.safeTop = sa && sa.top ? sa.top : 0;
    CV.safeBottom = sa && sa.bottom != null ? Math.max(0, pxH - sa.bottom) : 0;
    CV.W = Math.min(520, pxW);            // 网页版 #app 的 max-width: 520
    CV.H = pxH;
    CV.DPR = dpr;
    CV.pxW = pxW; CV.pxH = pxH;
    const canvas = CV.canvas;
    if (canvas) {
      const bw = Math.round(pxW * dpr), bh = Math.round(pxH * dpr);
      /* 只在真的变了时才赋值（赋值会清空 ctx 状态） */
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      try { CV.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
    }
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
    CV.NAV_BASE = 62 * k;      // 底栏基准高：战斗页会把它清成 0（整屏接管），离开时必须恢复
    return CV;
  };

  /* ---------- 字体缺的符号：自己画（V9.6.26，父亲大人："缺少的图标都重新画进去"） ----------
     微信画布的中文字体里没有 ♜（象棋车），直接写会渲染成"豆腐块"。
     以前用 ◇ 顶替 —— 能看，但跟网页版/别处对不上（父亲大人："随便搞个替代既不好看、
     又容易跟别的界面联系不上"）。这里给这些符号配**矢量画法**，并挂在 CV.GLYPHS 上；
     CV.text / CV.measure 会自动识别：遇到这些字符就按图标宽（= 字号）走，其余照常排版。
     代价为零，调用点一行都不用改（页面里照旧写 '♜ 深井印记'）。 */
  CV.GLYPHS = {
    '♜': function (c, x, y, s, color) {           // x = 图标中心，y = 垂直中线
      const w = s * 0.86, h = s, L = x - w / 2, R = x + w / 2;
      const top = y - h * 0.42, bot = y + h * 0.42;
      const rr = function (rx, ry, rw, rh, rad) {
        const r2 = Math.min(rad, rw / 2, rh / 2);
        c.beginPath();
        c.moveTo(rx + r2, ry);
        c.arcTo(rx + rw, ry, rx + rw, ry + rh, r2);
        c.arcTo(rx + rw, ry + rh, rx, ry + rh, r2);
        c.arcTo(rx, ry + rh, rx, ry, r2);
        c.arcTo(rx, ry, rx + rw, ry, r2);
        c.closePath(); c.fill();
      };
      c.save(); c.fillStyle = color;
      rr(L, bot - h * 0.16, w, h * 0.16, h * 0.05);                 // 底座
      c.beginPath();                                                 // 塔身（上窄下宽）
      c.moveTo(L + w * 0.17, bot - h * 0.16);
      c.lineTo(L + w * 0.27, top + h * 0.30);
      c.lineTo(R - w * 0.27, top + h * 0.30);
      c.lineTo(R - w * 0.17, bot - h * 0.16);
      c.closePath(); c.fill();
      const mw = w * 0.21, gap = w * 0.115;                          // 顶冠三垛
      for (let i = 0; i < 3; i++) rr(L + i * (mw + gap), top, mw, h * 0.30, h * 0.04);
      c.restore();
    },
  };
  CV.hasGlyph = function (str) {
    const t = String(str == null ? '' : str);
    for (const k in CV.GLYPHS) if (t.indexOf(k) >= 0) return true;
    return false;
  };
  CV.glyphWidth = function (ch, size) { return CV.GLYPHS[ch] ? size : 0; };

  /* ---------- 绘制原语（数值都对齐网页版） ---------- */
  /* V9.6.66（父亲大人："字都画出来了"级别的小毛病）：引导文案里用 **粗体** 标重点，
     但画布不认 markdown —— 结果是**星号原样画在屏幕上**（截图里就是"① **角色卡**：…"）。
     统一在三个入口（画 / 量 / 折行）把这两顆星号去掉，宽度和绘制口径就永远一致。 */
  function _md(str) { return String(str == null ? '' : str).replace(/\*\*/g, ''); }
  CV.plain = _md;
  CV.text = function (str, x, y, opt) {
    opt = opt || {};
    const c = CV.ctx;
    c.fillStyle = opt.color || CV.C.text;
    c.font = `${opt.bold ? '600 ' : ''}${opt.size || CV.FS.lg}px ${CV.FONT}`;
    /* opt.ls：字距（网页版那一堆 letter-spacing）。引擎不支持 letterSpacing 时
       设不上去、当没写，不会报错。 */
    const lsOk = ('letterSpacing' in c);
    if (lsOk && opt.ls) { try { c.letterSpacing = opt.ls + 'px'; } catch (e) {} }
    c.textAlign = opt.align || 'left';
    c.textBaseline = opt.baseline || 'middle';
    const raw = _md(str);
    if (CV.hasGlyph(raw)) {
      /* 分段：普通文字照旧 fillText，缺字形的字符交给 CV.GLYPHS 画 */
      const size = opt.size || CV.FS.lg;
      /* 必须按**码点**切（Array.from），不能用逐码元切 —— emoji 是代理对，
         切开就变成两个半字符（🏪 会被劈成两半）。 */
      const segs = Array.from(raw);
      let total = 0;
      segs.forEach(function (t) { total += CV.GLYPHS[t] ? size : CV.measure(t, size, opt.bold); });
      let px = opt.align === 'center' ? x - total / 2 : (opt.align === 'right' ? x - total : x);
      segs.forEach(function (t) {
        if (CV.GLYPHS[t]) { CV.GLYPHS[t](c, px + size / 2, y, size, opt.color || CV.C.text); px += size; }
        else { const ta = c.textAlign; c.textAlign = 'left'; c.fillText(t, px, y); c.textAlign = ta; px += CV.measure(t, size, opt.bold); }
      });
      if (lsOk && opt.ls) { try { c.letterSpacing = '0px'; } catch (e) {} }
      return;
    }
    c.fillText(raw, x, y);
    if (lsOk && opt.ls) { try { c.letterSpacing = '0px'; } catch (e) {} }
  };
  CV.measure = function (str, size, bold) {
    const c = CV.ctx;
    c.font = `${bold ? '600 ' : ''}${size}px ${CV.FONT}`;
    const raw = _md(str);
    if (CV.hasGlyph(raw)) {
      let w = 0;
      Array.from(raw).forEach(function (t) {
        if (!t) return;
        w += CV.GLYPHS[t] ? size : (function () { try { return c.measureText(t).width || 0; } catch (e) { return t.length * size * 0.9; } })();
      });
      return w;
    }
    try { return c.measureText(raw).width || 0; } catch (e) { return raw.length * size * 0.9; }
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
    /* V9.6.10：网页版 .card 有一条 `inset 0 1px 0 #ffffff08` 的顶部高光 ——
       卡片"有厚度、不糊"的关键就是它；小游戏原来没画，所以整块看着是平的、笨的。 */
    if (opt.line !== null) {
      const r = Math.min(opt.radius === undefined ? CV.RADIUS : opt.radius, w / 2, h / 2);
      CV.ctx.save();
      CV.ctx.strokeStyle = 'rgba(255,255,255,.06)'; CV.ctx.lineWidth = 1;
      CV.round(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5), null, 'rgba(255,255,255,.06)');
      CV.ctx.restore();
    }
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
    const chars = _md(str).split('');
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
  CV.reset = function (name, opts) { CV.stack = [{ name, opts: opts || {} }]; CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.render(); };
  CV.push = function (name, opts) { CV.stack.push({ name, opts: opts || {} }); CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.render(); };
  CV.pop = function () { if (CV.stack.length > 1) CV.stack.pop(); CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.render(); };
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
    /* V9.6.29（父亲大人："战斗撤离后出来的界面，下面的导航栏出画了"）：
       战斗页是整屏接管，会把 NAV_H 清成 0；但**以前只有清、没有恢复** ——
       于是打完/撤离回到普通页，底栏还按 H-0 画，整条掉到屏幕外。
       现在非 chromeless 一律恢复成基准值。 */
    if (chromeless) { CV.TOP = CV.safeTop; CV.NAV_H = 0; }
    else { CV.NAV_H = CV.NAV_BASE || (62 * CV.SCALE); }
    /* V9.6.90（父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
       画布变换**每帧显式归位**，不再依赖开机那一次 scale()。
       微信在窗口尺寸变化 / 键盘弹出 / 切前后台时会**重设主画布**，重设会清掉 ctx 的全部状态
       （变换、裁剪、线宽…）。那时候界面就会按 1/dpr 画，底栏整条被推出画面 ——
       而且"点几下才犯"（正好点了要弹键盘的输入框）。现在从根上不成立。 */
    try { c.setTransform(CV.DPR, 0, 0, CV.DPR, 0, 0); } catch (e) {}
    c.save();
    try {
    /* V9.6.10（父亲大人："整体画面笨重、没网页版精致"自审）：
       网页版 #app 是 `linear-gradient(180deg, --bg2, --bg)`（上略亮、下压暗），
       小游戏原来是一块平色 —— 平色在手机上会显得糊、重。照网页版铺一层竖向渐变。 */
    const bgGrad = c.createLinearGradient(0, 0, 0, CV.H);
    bgGrad.addColorStop(0, CV.C.bg2); bgGrad.addColorStop(1, CV.C.bg);
    c.fillStyle = bgGrad;
    c.fillRect(0, 0, CV.W, CV.H);
    c.translate(Math.round((CV.pxW - CV.W) / 2), 0);
    c.beginPath(); c.rect(0, 0, CV.W, CV.H); c.clip();
    if (CV.top().name === 'battle') CV.battleHead((CV.top().opts && CV.top().opts.title) || '战斗');
    else if (!chromeless) CV.topbar();
    c.save();
    /* 内容层再包一层 try/finally：任何一页画到一半抛错（改文案、改数据最容易犯），
       也要把"裁剪 + 位移"还回去 —— 否则这一帧脏掉的坐标系会留在共享 ctx 上，
       下一帧从脏坐标起画，越点越偏、底栏整条跑出画面（V9.6.90）。 */
    try {
      c.beginPath(); c.rect(0, CV.TOP + 8, CV.W, CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8); c.clip();
      c.translate(0, CV.TOP + 8 - (CV.scroll || 0));
      CV.y = 0;
      const fn = CV.panels[CV.top().name];
      if (fn) fn(CV.top().opts);
      /* V9.6.30：引导气泡集中在这里挂 —— 页面画完、CV.hits 已经齐了，查表就知道该给哪颗按钮做引导。 */
      if (G.coachFor) G.coachFor(CV.top().name);
    } finally {
      /* 内容总高：游标在通用件里（U.y），以前这里读的是 CV.y —— 那个变量在渲染时被归零后
         再没人写过，于是 contentH 恒等于 20、maxScroll 恒为 0，**滚动等于没有**（V9.5.93 修）。 */
      CV.contentH = ((G.U && G.U.y) || CV.y || 0) + 20;
      c.restore();
    }
    /* 内容画完才知道总高：把滚动量夹回合法范围（换页 / 状态变化后内容变短也要收回来）。
       V9.6.7（父亲大人："能一屏显示就一屏显示，不要还能上下拉一点的，很别扭"）：
       以前不管内容多高都额外加一段 CV.SP[1] 的下留白，于是**刚好铺满一屏**的页面
       （深井就是）也还能被拉动十来像素。现在只有内容真的超出一屏才给那点留白。 */
    const viewH = CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8;
    const bottom = CV.contentH - 20;        // contentH 里那 20 是给"滚到底"留的尾白，量的时候要减掉
    CV.maxScroll = bottom <= viewH ? 0 : (bottom - viewH + CV.SP[1]);
    if (CV.scroll > CV.maxScroll) { CV.scroll = CV.maxScroll; }
    /* 吸顶条（背包的三大标签）：画在**内容裁剪之外 + 屏幕坐标**里，所以不跟着滚动。
       页面自己负责把内容从它下面开始排（U.y 先让出它的高度）。
       位置在顶栏之下、底栏之上，画在内容之后 → 内容从它下面滚过去。 */
    if (CV.sticky) CV.sticky();
    if (!chromeless) CV.navbar();
    if (G.U && G.U.drawOverlay) G.U.drawOverlay();     // 确认弹窗画在最上面（通用件 U）
    if (G.U && G.U.drawCoach) G.U.drawCoach();        // 引导气泡（首次操作提示，V9.6.27）
    /* 页面级覆盖层（战斗结算这类"整屏一幕"）：**必须在内容裁剪之外**画 ——
       V9.6.1（父亲大人："结算内容也得在画面中间"）：以前结算画在内容层里，被顶栏下移、还跟着滚动，
       既不在正中、命中区也整体偏下（"收下奖励并返回"因此点不动）。 */
    if (CV.pageOverlay) CV.pageOverlay();
    CV.drawToasts();
    } finally {
      /* 外层的还原也必须无条件执行（顶栏 / 吸顶条 / 覆盖层任何一处抛错都不能把坐标系留给下一帧） */
      c.restore();
    }
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
    /* V9.6.90（技能《weixin-game》§布局：右上角是**系统胶囊按钮区**，约 87×44）：
       小游戏右上角永远压着微信那颗「···」胶囊，顶栏这一行的文字不能顶到它下面去。
       名字 + Lv + 铭刻名整行都按这个右边界收着写。 */
    const CAPSULE_W = 87 * CV.SCALE;
    const ROW_RIGHT = CV.W - PAD - CAPSULE_W;
    const lv = (S && S.player.level) || 0;
    const ny = top + 10 * CV.SCALE + 10 * CV.SCALE;   // 行内中线
    /* Lv. 胶囊：网页版 .plv（金色描边 + 圆角 7 + 左右 6px） */
    const lvTxt = 'Lv.' + lv;
    const lw = CV.measure(lvTxt, CV.FS.sm) + 12 * CV.SCALE;
    /* 名字最长 12 个字，得先按"胶囊让开后的可用宽度"截断（不然长名字会钻到系统胶囊底下） */
    const name = CV.fit((S && S.player.name) || '执灯者', ROW_RIGHT - PAD - lw - 20 * CV.SCALE, CV.FS.f1, true);
    CV.text(name, PAD, ny, { size: CV.FS.f1, bold: true });
    const nw = CV.measure(name, CV.FS.f1, true);
    CV.round(PAD + nw + 10 * CV.SCALE, ny - 8 * CV.SCALE, lw, 16 * CV.SCALE, CV.RADIUS_SM, null, 'rgba(230,182,76,.4)');
    CV.text(lvTxt, PAD + nw + 10 * CV.SCALE + lw / 2, ny, { size: CV.FS.sm, color: CV.C.gold, align: 'center' });
    /* 铭刻名（网页版 .genelock：11px 红字，只在解锁后出现） */
    if (S && S.player.geneLock > 0 && D && D.GENE_LOCKS && D.GENE_LOCKS[S.player.geneLock - 1]) {
      const gt = '铭刻·' + D.GENE_LOCKS[S.player.geneLock - 1].name;
      CV.text(CV.fit(gt, ROW_RIGHT - (PAD + nw + 10 * CV.SCALE + lw + 10 * CV.SCALE), CV.FS.sm), PAD + nw + 10 * CV.SCALE + lw + 10 * CV.SCALE, ny,
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
    /* V9.6.7（父亲大人："看着像按钮、点了没反应"）：这颗胶囊以前**完全没登记热区**，
       点了什么都不发生。网页版它是开「货币图鉴」的入口，这里补上。 */
    if (x + 40 * CV.SCALE < CV.W - PAD) {
      const w = chip('全部货币', '▤', null, true, true);
      CV.hitMode = 'screen';
      CV.hit('open_currency', x - w - 6 * CV.SCALE, cy, w, CHIP_H);
      CV.hitMode = 'content';
    }
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
  /* V9.6.90：加了时长参数（网页版 toast(msg, ms) 同款）——
     退款说明这类长句子 1.6 秒根本读不完。 */
  CV.toast = function (msg, ms) {
    CV.toasts = [{ msg, t: Date.now() }];
    CV.render();
    setTimeout(() => { CV.toasts = []; CV.render(); }, ms || 1600);
  };

  /* ---------- 触摸 ---------- */
  CV.bindTouch = function () {
    const toW = (e) => {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return { x: (t.clientX || t.pageX || 0) - Math.round((CV.pxW - CV.W) / 2), y: t.clientY || t.pageY || 0 };
    };
    const RAF = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : ((fn) => setTimeout(fn, 16));
    let downY = 0, moved = false, startScroll = 0, lastY = 0, lastT = 0, vel = 0, raf = null;
    /* V9.6.66（父亲大人："引导时……不能滑动界面"）：引导期间**整屏锁死** ——
       手指滑动不再滚页，也不会触发惯性；点也只有"高亮的那颗 / 跳过这一步"能被 hitAt 认出来。 */
    let coachLock = false;
    const coachOn = () => !!(G.U && G.U.coachActive && G.U.coachActive());
    const stopMomentum = () => { if (raf) { try { cancelAnimationFrame(raf); } catch (e) {} raf = null; } };
    /* 滚动：以前框架里**只有读没有写**（CV.scroll 永远是 0），页面一长（首页、残域）下面的内容
       就永远看不到。这里补上拖拽滚动 + 松手惯性，和手机原生滚动手感一致。 */
    /* 手指这一点命中了哪颗热区（坐标换算规则和 touchend 完全一致 —— 一处写错就会"按下亮 A、抬手触发 B"） */
    const hitAt = (p) => {
      const ly = CV.localY(p.y);
      const overlayOnly = !!(G.U && G.U.overlay);
      for (let i = CV.hits.length - 1; i >= 0; i--) {
        const h = CV.hits[i];
        if (overlayOnly && !h.screen) continue;
        /* 引导是**真模态**：只放行引导自己要的那两颗，其余热区一律不吃（V9.6.45） */
        if (G.U && G.U.coachAllows && !G.U.coachAllows(h)) continue;
        const wy = h.screen ? p.y : ly;
        if (p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) return h;
      }
      return null;
    };
    wx.onTouchStart((e) => {
      const p = toW(e);
      downY = p.y; lastY = p.y; lastT = Date.now(); vel = 0; moved = false;
      startScroll = CV.scroll || 0;
      stopMomentum();
      coachLock = coachOn();
      /* V9.6.40（父亲大人：两侧一致 / 手感）：网页版按钮有 :active 缩放，画布原来点下去毫无反馈。
         按下先记住"按的是哪颗"，U.btn 会把它画成按下态；抬手或开始滚动就清掉。 */
      const h = hitAt(p);
      if (h) { CV.pressed = h.id; CV.render(); }
    });
    wx.onTouchMove((e) => {
      const p = toW(e);
      const dy = p.y - downY;
      if (Math.abs(dy) > 8) moved = true;
      if (coachLock || coachOn()) { CV.pressed = null; return; }     // 引导在：不滚、不给按下态
      if (!moved) return;
      if (CV.pressed) { CV.pressed = null; CV.render(); }   // 一变成滚动就不算"按着按钮"了
      const now = Date.now(), dt = Math.max(1, now - lastT);
      vel = (p.y - lastY) / dt;                    // px/ms，向下拖为正
      lastY = p.y; lastT = now;
      const next = Math.max(0, Math.min(CV.maxScroll || 0, startScroll - dy));
      if (next !== CV.scroll) { CV.scroll = next; CV.render(); }
    });
    wx.onTouchEnd((e) => {
      const p = toW(e);
      if (coachLock && moved) { coachLock = false; return; }          // 引导期间的滑动：整下丢掉
      coachLock = false;
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
      if (CV.pressed) { CV.pressed = null; CV.render(); }
      const ly = CV.localY(p.y);
      const overlayOnly = !!(G.U && G.U.overlay);   // 确认弹窗打开时，底下的内容不吃点击
      for (let i = CV.hits.length - 1; i >= 0; i--) {
        const h = CV.hits[i];
        if (overlayOnly && !h.screen) continue;
        /* 引导在的时候，只认它自己那颗（V9.6.66）—— 与 hitAt 同一条规矩，
           否则"按下没反应、抬手却真的跳页了"。 */
        if (G.U && G.U.coachAllows && !G.U.coachAllows(h)) continue;
        const wy = h.screen ? p.y : ly;
        if (p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) {
          CV.dispatch(h.id); return;
        }
      }
    });
    /* V9.6.90（技能《weixin-game》§触摸事件）：**触摸取消也要接**。
       来电、切前后台、系统手势打断时微信只发 onTouchCancel 不发 onTouchEnd ——
       原来没接，于是"按下态"和"滑动惯性"会卡在那里：按钮一直是按下样子，
       或者松手后还继续自己滚。取消 = 这一下不算点击，只把状态清干净。 */
    if (wx.onTouchCancel) {
      wx.onTouchCancel(() => {
        CV.pressed = null; coachLock = false; stopMomentum(); CV.render();
      });
    }
  };

  G.CV = CV;
})();
