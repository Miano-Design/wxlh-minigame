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
    /* ===== 排版层级（V9.6.117 定稿，父亲大人："整体游戏得区分字体的层级，一级二级三级…）=====
       全项目**只有这五级**，每一级只对应一个尺寸；任何"我就用 12.5 试试"的做法都是违例
       （type_scale_audit 会当场报出来）。两边必须一一对应（网页版是 rem，画布是 px）：

         一级 f2  17px  --fs-2   0.9375rem×…  页面标题（顶栏标题、结算大标题）
         二级 f1  15px  --fs-1   0.9375rem    卡片标题 h3、列表行主标题 .t1、名字
         三级 lg  13px  --fs-lg  0.8125rem    正文：正文说明、按钮 .btn、技能名 .sname、kv 行
         四级 md  12px  --fs-md  0.75rem      次要说明：.note、小节标题、小按钮 .btn.small
         五级 sm  11px  --fs-sm/xs 0.6875rem 注释：.hint、.sub、标签 tag、meta、时间

       说明两点，都是**故意**的：
         · xs 和 sm 是**同一级**（都是五级 11px）—— xs 是历史名字，留着是为了不动三百多处调用；
           新代码一律用 sm。两者永远相等，audit 会盯着。
         · 图标 / 大数字（战力、深井层数）不属于文字层级，走 CV.ICO / CV.DISP（见下），
           它们是"图形元素"，不参与正文排版。 */
    FS: { xs: 11, sm: 11, md: 12, lg: 13, f1: 15, f2: 17 },
    /* 层级别名：新代码推荐写 t1..t5（一眼看出是第几级，不用猜 f1/f2 是大是小） */
    TIER: { t1: 17, t2: 15, t3: 13, t4: 12, t5: 11 },
    /* 非文字元素（图标 / 展示数字）**不属于排版层级**，但也不能随手写 19、22、30 ——
       它们各有名字，改规格只改这里一处（type_scale_audit 会挡住裸数字）。 */
    ICO: 19,                                    // 行首图标（网页版 .list-row 的 1.1875rem）
    DISP: { d1: 20, d2: 24, d3: 30, d4: 40 },   // 展示数字：战力 20 / 关卡图标 24 / 胜负大字 30 / 深井层数 40
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
    /* 货币符号→专属色：开机就把 data.js 那张表读进来缓存（V9.6.139）。
       放在 setup 里是因为它一定在 data.js 之后跑。 */
    try { CV.syncCurrencyColors(); } catch (e) {}
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
    /* V9.6.111（父亲大人："灯阁小队前面有一个乱码"）：
       画布的中文字体里**没有 ⚔**（DOM 有字体回退，canvas 是"豆腐块"）——
       网页版标题写的是「⚔️ 灯阁小队」，小游戏照抄就成了乱码。
       按父亲大人定的规矩（"缺少的图标都重新画进去"），这里自己画**交叉双剑**：
       两道长刃斜交叉、各自一段护手、一段短柄、一颗尾珠 —— 纯路径，任何设备都画得出来。
       （底栏「残域」那个图标也是它，一处画好两处都好看。） */
    '⚔': function (c, x, y, s, color) {
      const w = s * 0.96, h = s * 0.96;
      const x0 = x - w / 2, y0 = y - h / 2;
      const P = (nx, ny) => [x0 + nx * w, y0 + ny * h];
      const seg = (a, b, lw) => {
        c.lineWidth = Math.max(1, lw);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      };
      c.save();
      c.strokeStyle = color; c.fillStyle = color;
      c.lineCap = 'round'; c.lineJoin = 'round';
      /* 一把剑：tip（剑尖）→ guard（护手所在处）→ grip（柄尾） */
      const sword = (tip, guard, grip) => {
        seg(tip, guard, s * 0.115);                       // 刃
        const dx = guard[0] - tip[0], dy = guard[1] - tip[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len, py = dx / len;              // 刃的垂直方向
        const gl = s * 0.15;                              // 护手半长
        seg([guard[0] - px * gl, guard[1] - py * gl], [guard[0] + px * gl, guard[1] + py * gl], s * 0.075);
        seg(guard, grip, s * 0.085);                      // 柄
        c.beginPath(); c.arc(grip[0], grip[1], s * 0.055, 0, Math.PI * 2); c.fill();   // 尾珠
      };
      sword(P(0.13, 0.05), P(0.63, 0.60), P(0.75, 0.74));
      sword(P(0.87, 0.05), P(0.37, 0.60), P(0.25, 0.74));
      c.restore();
    },
  };
  CV.hasGlyph = function (str) {
    const t = String(str == null ? '' : str);
    for (const k in CV.GLYPHS) if (t.indexOf(k) >= 0) return true;
    return false;
  };
  /* 货币符号 → 专属色（从货币表来，别处不许再手写颜色）。
     晚一点挂：data.js 先加载，这里只是把表读出来缓存一份。 */
  CV.CUR_COLOR = {};
  CV.currencyIn = function (str) {
    const t = str == null ? '' : String(str);
    for (const k in CV.CUR_COLOR) if (t.indexOf(k) >= 0) return true;
    return false;
  };
  CV.syncCurrencyColors = function () {
    const list = (G.DATA && G.DATA.CURRENCIES) || [];
    CV.CUR_COLOR = {};
    list.forEach(function (c) {
      const ch = String(c.icon || '').trim();
      if (ch) CV.CUR_COLOR[ch] = c.color;
    });
  };
  CV.glyphWidth = function (ch, size) { return CV.GLYPHS[ch] ? size : 0; };

  /* ---------- 绘制原语（数值都对齐网页版） ---------- */
  /* V9.6.66（父亲大人："字都画出来了"级别的小毛病）：引导文案里用 **粗体** 标重点，
     但画布不认 markdown —— 结果是**星号原样画在屏幕上**（截图里就是"① **角色卡**：…"）。
     统一在三个入口（画 / 量 / 折行）把这两顆星号去掉，宽度和绘制口径就永远一致。 */
  /* V9.6.111：顺手去掉**变体选择符 U+FE0F / U+FE0E** 和**连接符 U+200D**。
     这三个都是"零宽"的排版控制字符，网页版靠字体回退把它们吃掉；
     画布却会当成独立字符去量宽度、找字形 —— 找不到就是一个小方块（看着像乱码）。
     组合式 emoji（🧙‍♂️ 男法师这种"基础 emoji + 连接符 + 性别符"）画布合成不了，
     所以先按表降级成"它能显示的那个主体"，再兜底剥掉剩下的控制字符。 */
  const ZWJ_FALLBACK = {
    '🧙‍♂️': '🧙', '🧙‍♀️': '🧙',
    '🧑‍⚕️': '🧑', '👨‍👩‍👧': '👨', '🏳️‍🌈': '🏳️',
  };
  function _md(str) {
    let s = String(str == null ? '' : str);
    for (const k in ZWJ_FALLBACK) if (s.indexOf(k) >= 0) s = s.split(k).join(ZWJ_FALLBACK[k]);
    return s.replace(/\*\*/g, '').replace(/[\uFE0E\uFE0F\u200D]/g, '');
  }
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
    /* V9.6.139（父亲大人："货币的图标还是没有统一，兑换大厅和法宝购买这些需要货币的
       都要对应到上方 4 种货币的图标，现在还是存在有白色块"）：
       顶栏那四颗是**带专属色**的，别处（兑换大厅 / 法宝购买 / 各处的价钱）一直是白字 ——
       同一种货币在两个地方长得不一样，看着就是"没统一"。
       这里做一次性收口：**只要一段文字里出现那四个货币符号，就自动按货币表的颜色画**，
       调用点一行都不用改（页面里照旧写 '◉ 500'）。没出现货币符号时这段判断只是一次 indexOf，
       开销可以忽略。 */
    const curHits = CV.currencyIn(raw);
    if (curHits || CV.hasGlyph(raw)) {
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
        else {
          const ta = c.textAlign; c.textAlign = 'left';
          if (curHits && CV.CUR_COLOR[t]) c.fillStyle = CV.CUR_COLOR[t];   // 货币符号：用自己的颜色
          c.fillText(t, px, y);
          if (curHits && CV.CUR_COLOR[t]) c.fillStyle = opt.color || CV.C.text;
          c.textAlign = ta; px += CV.measure(t, size, opt.bold);
        }
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
  /* V9.6.95（自审：弹窗开着时点底栏居然能换页）：
     屏幕坐标的热区分两种 —— 顶栏 / 底栏 / 吸顶条是"平时就在那儿"的，
     而弹窗自己那两颗按钮是"模态"的。以前只有一个 screen 标记，于是弹窗打开时
     底栏照样能点（模态等于没挡住）。现在多一个 modal 标记，触摸层按它放行。 */
  CV.hit = function (id, x, y, w, h) {
    CV.hits.push({
      id: id, x: x, y: y, w: w, h: h,
      screen: CV.hitMode === 'screen' || CV.hitMode === 'overlay',
      modal: CV.hitMode === 'overlay',
    });
  };
  /* V9.6.108：这颗热区有没有处理器（精确 id 或前缀处理器）。
     "给引导当锚点"的整块区域（party_board / attr_card / stage_grid…）没有处理器 ——
     它们不该吃点击，否则会把手感全吃掉（点队伍空位却派发了 party_board → 上不了阵）。 */
  function hitHasHandler(h) {
    const id = String(h.id);
    if (CV.onAct[id]) return true;
    const i = id.indexOf(':');
    return i > 0 && !!CV.onAct[id.slice(0, i + 1) + '*'];
  }
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
  /* ---------- 滚动位置记忆（V9.6.130 父亲大人："滑到中间点开一个伙伴，一退出来就回滚，
     还得再翻半天去找他"）----------
     规矩：**进入子页（push）时记住当前页的滚动位置；返回（pop）时恢复上一层的位置**；
     而**换标签/重进（reset）仍然从头看**（这是父亲大人认可的行为）。
     一处修，所有列表页一起受益（执灯者 / 背包 / 任务 / 世界列表 / 各商店…）。 */
  CV.scrollMemo = {};
  CV.reset = function (name, opts) {
    CV.stack = [{ name, opts: opts || {} }]; CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.grabCfg = null; CV.dropGrab();
    CV.scrollMemo[name] = 0;                 // 换标签＝从头看，把这一页的记忆清掉
    CV.render();
  };
  /* ---------- 长按抓起 · 拖动换位（V9.6.111） ----------
     父亲大人："小游戏队伍拖拽换位不了。"——以前这件事**根本没做**：
     sc-party 里写着"长按拖动在 canvas 上代价大，改成点格子选伙伴"，
     可引导和文案一直写着"长按抓起、拖到别处松手"，玩家照着做当然拖不动。
     现在补上，规则与网页版一致：
       · 长按 420ms 抓起（手指滑走＝在滚动，不算抓）；
       · 抓起后高亮那一格，手指压到哪一格就把它标成落点（写"放这里"）；
       · 松手落在别的格子＝换位（Core.swapPositions）；落回自己/空白＝原地放下；
       · 抓起状态下**也可以直接点目标格**（网页版同款：点一下即可换过去）。
     页面只要挂一份 CV.grabCfg：{ from(id)->下标, targetAt(p)->下标, drop(from,to) }。 */
  CV.grab = null;
  CV.grabCfg = null;
  CV.dropGrab = function () { CV.grab = null; };

  CV.push = function (name, opts) {
    CV.scrollMemo[(CV.top() || {}).name] = CV.scroll || 0;    // 记住"从哪来、看到哪了"
    CV.stack.push({ name, opts: opts || {} });
    CV.scroll = CV.scrollMemo[name] || 0;                    // 这一页自己也有记忆（比如从详情再进详情）
    CV.pageOverlay = null; CV.sticky = null; CV.dropGrab(); CV.render();
  };
  CV.pop = function () {
    CV.scrollMemo[(CV.top() || {}).name] = CV.scroll || 0;   // 离开这一页：记住它看到哪
    if (CV.stack.length > 1) CV.stack.pop();
    CV.scroll = CV.scrollMemo[(CV.top() || {}).name] || 0;   // 回到上一层：**恢复它原来看到的位置**
    CV.pageOverlay = null; CV.sticky = null; CV.dropGrab(); CV.render();
  };
  /* V9.6.102（"新手指引和任务引导又走错乱了"）：从首页**直接跳**到某个子页 ——
     中间**不渲染首页**。goQuest 原来是 `CV.reset('home'); CV.push(dest)`，
     那一次首页渲染会把首页自己那条引导（"主线每一步做完都能领奖励"）登记下来，
     而玩家点「去完成」时正带着"这次必须再讲一遍"的开关 —— 于是抢在目标页前面冒出来，
     玩家看到的就是首页那句话，而不是这一步该讲的话（实测 27 步里 23 步串台）。 */
  CV.jump = function (name, opts) {
    CV.stack = [{ name: 'home', opts: {} }, { name: name, opts: opts || {} }];
    CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null;
    CV.render();
  };
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
    /* V1.0.1（父亲大人："结束一波整个战斗日志卡往上弹，下一波又回来"）：
       真凶在这里 —— 战斗页（chromeless）是**一屏固定版面**，本来就不该参与滚动，
       可是 viewH 里仍然减了 NAV_H（战斗页根本不画底栏），于是日志卡贴底后
       内容还"多出"约 60px → maxScroll ≈ 60，页面**可滚**；
       波次卡那 1 秒里布局参数一抖，夹取后的 scroll 就落到 60 上下，
       整块内容（含日志卡、"撤离/速度"两颗按钮）被 translate 顶上去 —— 下一波又回来。
       （父亲大人两张截图实测：战斗中卡片底边在 88.7% 高度、波次卡时在 81.7%，正好差约 60px。）
       修法：**chromeless 页面（战斗 / 开局那几页）maxScroll 恒 0**，彻底不参与滚动。 */
    CV.maxScroll = chromeless ? 0 : (bottom <= viewH ? 0 : (bottom - viewH + CV.SP[1]));
    if (CV.scroll > CV.maxScroll) { CV.scroll = CV.maxScroll; }
    /* 吸顶条（背包的三大标签）：画在**内容裁剪之外 + 屏幕坐标**里，所以不跟着滚动。
       页面自己负责把内容从它下面开始排（U.y 先让出它的高度）。
       位置在顶栏之下、底栏之上，画在内容之后 → 内容从它下面滚过去。 */
    if (CV.sticky) CV.sticky();
    if (!chromeless) CV.navbar();
    if (G.U && G.U.drawOverlay) G.U.drawOverlay();     // 确认弹窗画在最上面（通用件 U）
    /* V9.6.95：弹窗开着的时候**不画引导气泡** ——
       以前顺序反了（引导画在弹窗上面），玩家看到的是"引导压在确认框上"，
       点确认又会被引导吃掉（同一个病根：没把弹窗当成更高一层的模态）。 */
    if (G.U && G.U.drawCoach && !G.U.overlay) G.U.drawCoach();   // 引导气泡（首次操作提示，V9.6.27）
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
    /* 货币行（V9.6.134，父亲大人：「要不砍成 4 种？这样刚好顶部标签那里放得下」）：
       货币只剩四种 → **四种全放**，不再藏哪一种，一眼看完自己有什么。
       原来那颗「▤ 全部货币」一并去掉：点**任意**货币胶囊本来就会打开货币图鉴
       （含全部四种的用途与来源），那颗按钮跟它同一个功能，留着只是占位置。 */
    const cur = (S && S.cur) || {};
    const fmt = G.fmt || ((n) => String(n));
    const main = (D ? D.CURRENCIES : []).slice();
    let x = PAD;
    const cy = top + ROW_H + BAR_TOP;
    const chip = function (label, icon, color, dim, dashed) {
      const w = 11 * CV.SCALE + CV.measure(icon, CV.FS.md) + 5 * CV.SCALE + CV.measure(label, CV.FS.md) + 11 * CV.SCALE;
      /* 四颗要挤在一行里：给一个上限（每颗不超过四分之一宽），
         数值太长（比如 1000.0万）就缩字号，别让第四颗掉出画面。 */
      const ww = Math.min(Math.max(40 * CV.SCALE, w), (CV.W - PAD * 2 - 18 * CV.SCALE) / 4);
      CV.round(x, cy, ww, CHIP_H, CV.RADIUS_SM, CV.C.panel, dashed ? CV.C.line2 : CV.C.line);
      let tx = x + 11 * CV.SCALE;
      /* V9.6.134：图标也用货币表里的**专属色**（以前统一是白字，四种币看着一模一样） */
      if (icon) { CV.text(icon, tx, cy + CHIP_H / 2, { size: CV.FS.md, color: color || CV.C.text }); tx += CV.measure(icon, CV.FS.md) + 5 * CV.SCALE; }
      const room = ww - (tx - x) - 8 * CV.SCALE;
      const numSize = CV.measure(label, CV.FS.md) <= room ? CV.FS.md : CV.FS.sm;
      CV.text(CV.fit(label, room, numSize, true), tx, cy + CHIP_H / 2, { size: numSize, color: dim ? CV.C.dim : CV.C.text, bold: true });
      x += ww + 6 * CV.SCALE;
      return ww;
    };
    /* 每一颗胶囊都登记热区 → 点它打开货币图鉴（V9.6.7 补的那条规矩，
       现在从"只有最后一颗能点"扩到"四颗都能点"）。 */
    CV.hitMode = 'screen';
    main.forEach((cc) => {
      const x0 = x;
      const w = chip(fmt(cur[cc.id] || 0), cc.icon, cc.color, false, false);
      CV.hit('cur:' + cc.id, x0, cy, w, CHIP_H);
    });
    CV.hitMode = 'content';
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
      CV.text(t.ico, cx, y + 22, { size: CV.ICO, align: 'center' });
      CV.text(t.name, cx, y + 42, { size: CV.FS.sm, align: 'center', color: active ? CV.C.gold : CV.C.dim });
      /* V9.6.145（"再审一遍"抓到的两边不一致）：网页版底栏有**红点**（主页=挂机有待领、
         背包=待领箱里有东西），小游戏这边**一个点都没画** —— 玩家在小游戏里看不出
         "有东西等你处理"。这里照网页版 navbarHtml 的同一套规则补上（一处判定都不另写）：
           · 主页：挂机攒够 5 分钟（和网页版 idleClaimable() 同一个门槛）
           · 背包：待领箱里有东西（stashCount() > 0）
         执灯者那格**不点**——网页版 V9.5.67 专门删过（那格没有"待领"的东西，纯误报）。 */
      let dot = false;
      if (t.id === 'home') dot = ((G.Core.S && (G.Core.idleBankGains() || {}).seconds) || 0) >= 300;
      else if (t.id === 'bag') dot = ((G.Core.stashCount && G.Core.stashCount()) || 0) > 0;
      if (dot) {
        c.fillStyle = CV.C.accent;
        /* 位置照网页版 `.nav-item .dot`：**图标的右上角**（top 0.5rem、靠右 18px），
           直径 0.4375rem ≈ 7px；颜色是 var(--accent)（两边同一个红）。 */
        c.beginPath(); c.arc(cx + 16 * CV.SCALE, y + 13 * CV.SCALE, 3.5 * CV.SCALE, 0, Math.PI * 2); c.fill();
      }
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
    /* V9.6.111：长按抓起用的计时器（和网页版同一个时长） */
    const GRAB_MS = 420;
    let grabTimer = null;
    /* 本次手势是不是"抓着东西的那一次"。区别对待很重要：
       · 长按刚触发 → 这次手势就是"拖"，松手落在别的格子＝换位、落回原处＝还原地拿着；
       · 拿着东西时**再点一下目标格** → 新的手势，松手＝就在那一格放下（网页版同款备用路径）；
       · 拿着东西时点的是别的东西（返回、预设…）→ 这一下手势照常执行，手里那格不动。 */
    let gestureGrab = false;
    function clearGrabTimer() { if (grabTimer) { clearTimeout(grabTimer); grabTimer = null; } }
    /* V9.6.66（父亲大人："引导时……不能滑动界面"）：引导期间**整屏锁死** ——
       手指滑动不再滚页，也不会触发惯性；点也只有"高亮的那颗 / 跳过这一步"能被 hitAt 认出来。 */
    let coachLock = false;
    const coachOn = () => !!(G.U && G.U.coachActive && G.U.coachActive());
    const stopMomentum = () => { if (raf) { try { cancelAnimationFrame(raf); } catch (e) {} raf = null; } };
    /* 滚动：以前框架里**只有读没有写**（CV.scroll 永远是 0），页面一长（首页、残域）下面的内容
       就永远看不到。这里补上拖拽滚动 + 松手惯性，和手机原生滚动手感一致。 */
    /* 手指这一点命中了哪颗热区（坐标换算规则和 touchend 完全一致 —— 一处写错就会"按下亮 A、抬手触发 B"） */
    /* ignoreCoach：**跳过引导那道闸**。
       只有"长按抓起"用它 —— 引导自己教的就是"长按任意一格抓起、拖到别处松手"，
       而引导在的时候 hitAt 只放行它自己那颗（队伍页放行的是 party_board 那块**没有动作**的锚点），
       于是长按拿到的是一块点不动的区域、CV.grabCfg.from() 返回 null → 抓不起来。
       玩家在引导里试拖 → 拖不动（父亲大人："还是拖拽不了"）。 */
    const hitAt = (p, ignoreCoach) => {
      const ly = CV.localY(p.y);
      const overlayOnly = !!(G.U && G.U.overlay);
      let fallback = null;          // 没有处理器的锚点区域 → 兜底候选
      for (let i = CV.hits.length - 1; i >= 0; i--) {
        const h = CV.hits[i];
        /* 弹窗打开 = 真模态：只放行弹窗自己那两颗按钮，底栏/顶栏/吸顶条一律不吃（V9.6.95） */
        if (overlayOnly && !h.modal) continue;
        /* 引导是**真模态**：只放行引导自己要的那两颗，其余热区一律不吃（V9.6.45） */
        if (!ignoreCoach && G.U && G.U.coachAllows && !G.U.coachAllows(h)) continue;
        const wy = h.screen ? p.y : ly;
        if (!(p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h)) continue;
        /* V9.6.108（父亲大人："队伍上阵又上不了了，其他东西也都点不了了"）：
           **优先给"有处理器"的热区**。没有处理器的是给引导当锚点的整块区域
           （队伍阵型 party_board、六维卡 attr_card、关卡格 stage_grid…），
           它们盖在真按钮上面，以前会把点击全吃掉 ——
           实测：点队伍空位，派发的却是 party_board（没有处理器）→ 什么都不发生 → 上不了阵。
           现在这类区域退成兜底：只有底下确实没有别的可点时才轮到它（那时点它＝关掉引导）。 */
        if (!hitHasHandler(h)) { if (!fallback) fallback = h; continue; }
        return h;
      }
      return fallback;
    };
    /* V9.6.111：手指这一点压在哪一格"能拿起的那格"上？不是就 null。
       （长按抓起与"拿着东西点目标格"都要用它，口径和 hitAt 完全一致） */
    const grabSlotAt = (p) => {
      if (!CV.grabCfg || !CV.grabCfg.from) return null;
      const h = hitAt(p, true);          // 抓起不看引导那道闸（见 hitAt 的 ignoreCoach）
      if (!h) return null;
      const idx = CV.grabCfg.from(h.id);
      return (idx === null || idx === undefined) ? null : idx;
    };
    wx.onTouchStart((e) => {
      const p = toW(e);
      downY = p.y; lastY = p.y; lastT = Date.now(); vel = 0; moved = false;
      startScroll = CV.scroll || 0;
      stopMomentum();
      coachLock = coachOn();
      gestureGrab = false;
      /* 手里已经拿着一格（上一次长按的残留）：
         · 点的是"能拿起的那一格" → 这次手势就是"放下的手势"，松手在那一格放下；
         · 点的是别的东西 → 手里那格不动，这一下照常当普通点击走（返回/预设照样能点）。 */
      if (CV.grab) {
        const gIdx = grabSlotAt(p);
        if (CV.grab.fresh) {
          gestureGrab = true;                       // 还是"创造抓取"的那一次手势，继续拖着
        } else if (gIdx !== null) {
          gestureGrab = true;
          CV.grab.over = gIdx;
          CV.render();
        }
        if (gestureGrab) return;
      }
      /* V9.6.40（父亲大人：两侧一致 / 手感）：网页版按钮有 :active 缩放，画布原来点下去毫无反馈。
         按下先记住"按的是哪颗"，U.btn 会把它画成按下态；抬手或开始滚动就清掉。 */
      const h = hitAt(p);
      if (h) { CV.pressed = h.id; CV.render(); }
      /* V9.6.111：长按抓起（队伍换位）——按下这一格是"可抓起"的，就等 420ms（和网页版同一个值）。 */
      clearGrabTimer();
      if (CV.grabCfg && CV.grabCfg.from) {
        /* V9.6.112（父亲大人："还是拖拽不了"）：这里原来用的是**过了引导闸门**的那颗
           （引导在时是 party_board 那块没有动作的锚点）→ 永远抓不起来。
           抓起要单独查一次"这一格能不能拿起"（不看引导闸），战斗/其它页面不受影响。 */
        const idx = grabSlotAt(p);
        if (idx !== null && idx !== undefined) {
          grabTimer = setTimeout(function () {
            grabTimer = null;
            CV.grab = { from: idx, x: p.x, y: p.y, over: idx, fresh: true };
            gestureGrab = true;
            CV.pressed = null;
            try { if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' }); } catch (e2) {}
            CV.render();
          }, GRAB_MS);
        }
      }
    });
    wx.onTouchMove((e) => {
      const p = toW(e);
      const dy = p.y - downY;
      if (Math.abs(dy) > 8) moved = true;
      /* 抓起中：不滚页面，只跟手 + 更新落点高亮 */
      if (CV.grab && gestureGrab) {
        CV.grab.x = p.x; CV.grab.y = p.y;
        if (CV.grabCfg && CV.grabCfg.targetAt) CV.grab.over = CV.grabCfg.targetAt(p);
        stopMomentum();
        CV.render();
        return;
      }
      if (moved) clearGrabTimer();        // 手指滑走＝在滚页面，不算长按
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
      clearGrabTimer();
      /* 松手时"手里拿着东西"，且这一下就是抓着的手势：
         落点在哪一格 —— 换到那一格；落回自己或空白 —— 手里继续拿着（等下一下拖动或点选，
         网页版就是这套规矩：松在空白处不会掉出去，还能移到别处再放）。
         拿着东西时**再点自己那一格** = 放回原位。 */
      if (CV.grab && gestureGrab) {
        const g = CV.grab;
        const to = (g.over === undefined || g.over === null) ? null : g.over;
        const wasFresh = !!g.fresh;
        g.fresh = false;
        if (to !== null && to !== g.from && CV.grabCfg && CV.grabCfg.drop) {
          CV.grab = null;
          try { CV.grabCfg.drop(g.from, to); } catch (e3) {}
        } else if (!wasFresh && to === g.from) {
          CV.grab = null;                       // 再点一下自己＝放回原位（网页版同款）
          CV.toast('已放回原位');
        } else {
          g.over = null;                        // 落在空白处：手里还拿着，落点高亮收掉
        }
        CV.pressed = null; CV.render();
        gestureGrab = false;
        return;
      }
      gestureGrab = false;
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
      let fallback = null;
      for (let i = CV.hits.length - 1; i >= 0; i--) {
        const h = CV.hits[i];
        /* 弹窗打开 = 真模态：只放行弹窗自己那两颗按钮，底栏/顶栏/吸顶条一律不吃（V9.6.95） */
        if (overlayOnly && !h.modal) continue;
        /* 引导在的时候，只认它自己那颗（V9.6.66）—— 与 hitAt 同一条规矩，
           否则"按下没反应、抬手却真的跳页了"。 */
        if (G.U && G.U.coachAllows && !G.U.coachAllows(h)) continue;
        const wy = h.screen ? p.y : ly;
        if (!(p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h)) continue;
        /* V9.6.108：优先给有处理器的热区；锚点区域退成兜底（同 hitAt） */
        if (!hitHasHandler(h)) { if (!fallback) fallback = h; continue; }
        CV.dispatch(h.id); return;
      }
      if (fallback) CV.dispatch(fallback.id);      // 底下没有别的可点：点它＝关掉引导
    });
    /* V9.6.90（技能《weixin-game》§触摸事件）：**触摸取消也要接**。
       来电、切前后台、系统手势打断时微信只发 onTouchCancel 不发 onTouchEnd ——
       原来没接，于是"按下态"和"滑动惯性"会卡在那里：按钮一直是按下样子，
       或者松手后还继续自己滚。取消 = 这一下不算点击，只把状态清干净。 */
    if (wx.onTouchCancel) {
      wx.onTouchCancel(() => {
        /* 手里拿着东西时被打断（来电/切后台/系统手势）：这一下不算"放下"，
           继续拿着，但**不能再算"刚抓起的那一次手势"**（否则下一次点按钮会被当成继续拖）。 */
        if (CV.grab) CV.grab.fresh = false;
        gestureGrab = false;
        CV.pressed = null; coachLock = false; stopMomentum(); CV.render();
      });
    }
  };

  G.CV = CV;
})();
