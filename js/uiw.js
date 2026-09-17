/* 小游戏通用件（照网页版 css/style.css 一块块抄）
   ------------------------------------------------------------------------------
   规矩（父亲大人 2026-09-17：从头复刻）：
     · 这里**只放通用块**，每个块注释里都写清它对应网页版哪个类；
     · 数值一律取 CV.SP / CV.FS / CV.RADIUS —— setup() 里按网页版根字号
       clamp(14.5px, 3.85vw, 16px) 缩放过，所以小游戏和网页一样大；
     · 每页只负责"按网页版的结构顺序把块摆出来"，不自己发明间距。

   用法：U.begin() 归零 → 依次调用块（U.card(...) / U.h3(...) / U.kv(...) …）
   每个块自己推进 U.y，并返回它占的高度。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  const U = {};
  G.U = U;

  /* ---------- 全局工具（逐字对齐网页版 js/ui.js 的同名函数） ---------- */
  /* fmt：网页版把 20000 显示成「2.0万」、1.2 亿显示成「1.20亿」——
     小游戏原来没有这个函数，各页各自 `G.fmt || String` 兜底，于是首页显示成「55000」，
     和网页版完全不是一个观感（V9.5.93 修：补上同一个 fmt，并挂到全局给所有页用）。 */
  G.fmt = function (n) {
    n = Math.floor(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(n);
  };
  U.fmt = G.fmt;
  /* formatDuration：网页版同一段逻辑（小时/分/秒三档） */
  G.formatDuration = function (sec) {
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h) return h + '小时' + m + '分';
    if (m) return m + '分' + s + '秒';
    return s + '秒';
  };

  U.y = 0;                 // 纵向游标（从内容区顶部算起）
  U.dry = false;           // true = 只量高度不画（U.card 用它先量后画底）
  U.begin = function () { U.y = 0; };
  U.pad = () => 12 * CV.SCALE;                        // 网页版 #view padding: 0.75rem（屏幕边距）
  U.cw = () => CV.W - U.pad() * 2;                    // 卡片/区块外宽
  /* V9.5.93（父亲大人："文字贴边"）：网页版 .card 有一圈 14px 内边距（padding: var(--sp3)），
     小游戏这边原来只画了卡片框、内容却按卡片边缘排 —— 所有卡片里的文字/按钮都贴着边框。
     现在卡片内统一走 U.ix()/U.iw()（内容左边界 / 内容宽），不在卡片里时等于屏幕内容区。 */
  /* 按钮尺寸（逐条对齐网页版 css）：.btn = min-height 2.75rem(44)・padding 0 18・字号 13；
     .btn.small = min-height 2.5rem(40)・padding 0 13・字号 12；.btn-row .btn 最小宽 5.375rem(86) 且**换行不截断**。 */
  U.BTN_H = 44; U.BTN_SM = 40; U.BTN_MINW = 86;
  U.inCard = false;
  U.inPad = () => (U.inCard ? CV.SP[2] : 0);
  U.ix = () => U.pad() + U.inPad();
  U.iw = () => U.cw() - U.inPad() * 2;
  U.space = function (px) { U.y += px; };
  const draw = (fn) => { if (!U.dry) fn(); };
  /* 页面要自己排"两栏卡"（左文字 + 右按钮列）时用 U.draw —— 它认得 U.card 的先量后画，
     不会在量高度那一趟把东西画两遍。 */
  U.draw = (fn) => draw(fn);

  /* ---------- 卡片 .card（bg --panel / 边 --line / 圆角 10 / 内边距 14 / 下边距 14）
     传一个画内容的函数：它按"内容游标"往下画，卡片底由这里先量后画。 ---------- */
  /* opt.padY：纵向内边距（默认 14，和网页版 .card 一致）。
     网页版有几张卡是"贴边卡"（比如首页游历条 padding: 2px 14px / 挂机卡 4px 14px 14px），
     纵向内边距明显更小 —— 用同一个 14 会让卡片白白高一截。 */
  U.card = function (content, opt) {
    const pad = CV.SP[2], padY = (opt && opt.padY !== undefined) ? opt.padY * CV.SCALE : pad;
    const top = U.y, outer = U.inCard;
    U.inCard = true;
    U.dry = true; U.y = top + padY; content(); const inner = U.y - top - padY;
    U.dry = false;
    const h = inner + padY * 2;
    if (h > 4) CV.card(U.pad(), top, U.cw(), h);
    U.y = top + padY; content();
    U.inCard = outer;
    U.y = top + h + CV.SP[2];
    U.lastBottom = CV.SP[2];
    return h;
  };

  /* ---------- 卡片标题行 .card h3（V9.5.30：标题 / 右侧小字 / 右侧按钮三条同一中线）
     · 左边 3×13 金色竖条 + 标题 15px 粗体；右侧小字 11px 灰、贴右。 ---------- */
  U.h3 = function (title, sub, opt) {
    opt = opt || {};
    /* opt.btn = { label, id }：标题行右侧的小按钮（网页版 .card h3 .hbtn，和标题/小字同一中线） */
    if (opt.btn) {
      const bw = CV.measure(opt.btn.label, CV.FS.sm) + 20 * CV.SCALE;
      const bh = 26 * CV.SCALE;
      U.btn(U.ix() + U.iw() - bw, U.y - 6 * CV.SCALE, bw, bh, opt.btn.label, 'ghost', opt.btn.id);
    }
    const bar = 3, gap = 7, lh = CV.FS.f1 * 1.3;
    const top = U.y;
    draw(() => {
      const cy = top + lh / 2;
      const g = CV.ctx.createLinearGradient(0, cy - 6.5, 0, cy + 6.5);
      g.addColorStop(0, CV.C.gold); g.addColorStop(1, '#8a6a1e');
      CV.round(U.ix(), cy - 6.5, bar, 13, 2, g);
      /* opt.color：标题颜色（网页版是内联 color，比如"没激活的产线标题压灰、激活的走金色"） */
      CV.text(CV.fit(title, U.iw() - 120, CV.FS.f1, true), U.ix() + bar + gap, cy,
        { size: CV.FS.f1, bold: true, color: opt.color || CV.C.text, ls: 0.2 });   // .card h3 letter-spacing .2px
      const subRight = opt.btn ? (CV.measure(opt.btn.label, CV.FS.sm) + 30 * CV.SCALE) : 0;   // 让开右侧按钮
      if (sub) CV.text(CV.fit(sub, U.iw() - 90 - subRight, CV.FS.sm), U.ix() + U.iw() - subRight, cy, { size: CV.FS.sm, color: opt.subColor || CV.C.dim, align: 'right' });
    });
    U.y = top + lh + 10 * CV.SCALE;                   // 标题下边距 10（.card h3 margin-bottom）
    return lh + 10 * CV.SCALE;
  };

  /* ---------- 键值行 .kv（左灰标签 / 右值，左右两端贴齐内容区） ---------- */
  U.kv = function (k, v, color) {
    const lh = CV.FS.lg * 1.35, pad = 5 * CV.SCALE, h = lh + pad * 2;
    const top = U.y;
    draw(() => {
      const cy = top + h / 2;
      CV.text(CV.fit(k, U.iw() * 0.55, CV.FS.lg), U.ix(), cy, { size: CV.FS.lg, color: CV.C.dim });
      CV.text(CV.fit(v, U.iw() * 0.45, CV.FS.lg), U.ix() + U.iw(), cy, { size: CV.FS.lg, color: color || CV.C.text, align: 'right' });
      CV.ctx.save();
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + h - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + h - .5); CV.ctx.stroke();
      CV.ctx.restore();
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 提示小字 .hint（11px 灰，行高 1.7）/ 说明 .note（12px 灰，行高 1.75） ---------- */
  /* widthIn：给"左文字 + 右按钮列"这种两栏卡用（网页版左列 flex:1，右列按内容宽）。
     不传就是整块内容宽。 */
  function wrapBlock(text, size, lh, color, gapTop, widthIn) {
    const lhPx = size * lh;
    const W = widthIn || U.iw();
    const lines = CV.wrap(text, W, size, 6);
    const top = U.y + (gapTop || 0);
    draw(() => lines.forEach((ln, i) => CV.text(ln, U.ix(), top + lhPx * (i + 0.5), { size, color })));
    U.y = top + lines.length * lhPx;
    return lines.length * lhPx;
  }
  U.hint = function (text, gapTop, widthIn) { return wrapBlock(text, CV.FS.sm, 1.7, CV.C.dim, gapTop, widthIn); };
  U.note = function (text, gapTop, widthIn) { return wrapBlock(text, CV.FS.md, 1.75, CV.C.dim, gapTop, widthIn); };

  /* ---------- 说明框 .event-desc（网页版：bg --panel / 圆角 10 / 内边距 12 / 13px 灰字 1.7 行高）
     开局契约、起名提示这类"成段说明"都用它，别再直接铺在卡片上。 ---------- */
  U.eventDesc = function (lines, gapIn) {
    const pad = 12 * CV.SCALE, size = CV.FS.lg, lh = size * 1.7;
    const src = [].concat(lines || []);
    // 先按宽度把所有行折出来（每行可以是纯文本，也可以是 { t, color, bold }）
    const out = [];
    src.forEach((raw) => {
      const obj = (typeof raw === 'string') ? { t: raw } : raw;
      if (!obj || !obj.t) { out.push({ t: '', blank: true }); return; }
      /* 行尾可以接一段不同颜色的字（网页版是 <b style="color:var(--accent)">执灯者</b> 这种内联强调） */
      const full = obj.tail ? (obj.t + obj.tail.t) : obj.t;
      const ws = CV.wrap(full, U.iw() - pad * 2, size, 8);
      ws.forEach((ln, i) => {
        const last = i === ws.length - 1;
        // 末尾那段如果整段都在这一行里，就拆成"前半 + 强调后半"两截画
        let head = ln, tail = null;
        if (last && obj.tail && ln.length > obj.tail.t.length && ln.slice(-obj.tail.t.length) === obj.tail.t) {
          head = ln.slice(0, ln.length - obj.tail.t.length);
          tail = obj.tail;
        }
        out.push({ t: head, color: obj.color, bold: obj.bold && last, tail });
      });
    });
    const h = pad * 2 + out.length * lh;
    const top = U.y + (gapIn || 0);
    draw(() => {
      CV.round(U.ix(), top, U.iw(), h, CV.RADIUS, CV.C.panel);
      out.forEach((o, i) => {
        if (!o.t) return;
        const x0 = U.ix() + pad, cy = top + pad + lh * (i + 0.5);
        CV.text(o.t, x0, cy, { size, color: o.color || CV.C.dim, bold: o.bold });
        if (o.tail) {
          const w1 = CV.measure(o.t, size, o.bold);
          CV.text(o.tail.t, x0 + w1, cy, { size, color: o.tail.color || CV.C.dim, bold: o.tail.bold });
        }
      });
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 区块小标题 .section-title（12px 字距 1px，右边一条线） ---------- */
  U.sectionTitle = function (text) {
    /* V9.6.1（父亲大人："上面的间距太大了，要和下面一样"）：小节标题上下间距必须相等 ——
       上面那块卡片自己已经留了 14px 下边距，这里只补差额，两边都是 14px。 */
    const WANT = CV.SP[2];
    const extraTop = Math.max(0, WANT - (U.lastBottom || 0));
    const top = U.y + extraTop, lh = CV.FS.md * 1.3;
    draw(() => {
      const cy = top + lh / 2;
      CV.text(text, U.ix() + 4, cy, { size: CV.FS.md, color: CV.C.text2, bold: true, ls: 1 });   // .section-title letter-spacing 1px
      const w = CV.measure(text, CV.FS.md, true);
      CV.ctx.strokeStyle = CV.C.line; CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.ix() + 4 + w + 10, cy); CV.ctx.lineTo(U.ix() + U.iw() - 4, cy); CV.ctx.stroke();
    });
    U.y = top + lh + WANT;
    U.lastBottom = WANT;
    return lh + extraTop + WANT;
  };

  /* ---------- 三列文字宫格 .text-menu + .tile（名字 13 粗体 / 状态 11 灰，居中） ---------- */
  U.tiles = function (list, cols) {
    cols = cols || 3;
    /* V9.6.7：网页版 .text-menu 的 gap 是 var(--sp2)=10px（不是 sp3=14）。
       第 0 版这里写成 CV.SP[2] 了 —— 格子因此窄 3px、缝宽 4px，整块宫格跟网页版对不上。 */
    const gap = CV.SP[1], cellW = (U.iw() - gap * (cols - 1)) / cols;
    const th = 54 * CV.SCALE;
    const startY = U.y;
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = U.ix() + c * (cellW + gap), y = startY + r * (th + gap);
      /* t = [动作, 名字, 小字(可空), 解锁(可空), 红点] —— 和网页版 tile(x) 同一份结构。
         V9.5.68（父亲大人）：主页格子里**只留功能名**；"有东西可领"改用红点表达。 */
      const dot = t[4];
      draw(() => {
        CV.round(x, y, cellW, th, 6 * CV.SCALE, CV.C.panel, CV.C.line2);
        const inner = cellW - 12 * CV.SCALE;
        const hasSub = !!(t[2]);
        const cy = hasSub ? y + th / 2 - 7 * CV.SCALE : y + th / 2;
        const nameW = CV.measure(t[1], CV.FS.lg, true);
        const dotW = dot ? 10 * CV.SCALE : 0;
        const tx = x + cellW / 2 - (nameW + dotW) / 2;
        CV.text(CV.fit(t[1], inner - dotW, CV.FS.lg, true), tx, cy, { size: CV.FS.lg, bold: true });
        if (dot) {                                    // 网页版 .tt-dot：6px 红点，跟在名字右边 4px
          CV.ctx.beginPath();
          CV.ctx.arc(tx + nameW + 4 * CV.SCALE + 3 * CV.SCALE, cy - 5 * CV.SCALE, 3 * CV.SCALE, 0, Math.PI * 2);
          CV.ctx.fillStyle = CV.C.accent; CV.ctx.fill();
        }
        if (hasSub) CV.text(CV.fit(t[2], inner, CV.FS.xs), x + cellW / 2, cy + 15 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      });
      if (t[0]) CV.hit(t[0], x, y, cellW, th);
    });
    const rows = Math.ceil(list.length / cols);
    U.y = startY + rows * th + (rows - 1) * gap;
    U.lastBottom = 0;
    return rows * th + (rows - 1) * gap;
  };

  /* ---------- 列表行 .list-row（左标题+说明、右按钮） ---------- */
  U.listRow = function (o) {
    const t1 = CV.FS.f1 * 1.35, t2 = CV.FS.sm * 1.55, pad = 10 * CV.SCALE;
    /* o.ico：行首一个大字符（网页版 .list-row 里那个 <span style="font-size:1.1875rem">）。
       o.rightText：行尾一段灰色小字（网页版 游历 / 秘术阁 那些行的右侧奖励）。 */
    const icoW = o.ico ? (CV.measure(o.ico, 19 * CV.SCALE) + 10 * CV.SCALE) : 0;
    const rightW = o.rightText ? (CV.measure(o.rightText, CV.FS.sm) + 10 * CV.SCALE) : 0;
    /* V9.6.7：网页版 .t1/.t2 是**换行**的（没有 line-clamp），原来这里用 CV.fit 单行截断，
       "开启后进入战斗立即结算，不再逐帧播放，适合挂机刷本"会被砍成"…适…"。
       现在按可用宽度折行，行高照 CSS 的 line-height（t1 1.35 / t2 1.55）。 */
    const availW = U.iw() - (o.rightW || 0) - rightW - icoW - 12 * CV.SCALE;
    /* o.tag：标题行右侧跟着一枚小标（网页版 .list-row .t1 > .tag，金色描边胶囊） */
    const tagW = o.tag ? (CV.measure(o.tag, CV.FS.xs) + 14 * CV.SCALE) : 0;
    const l1 = CV.wrap(o.t1, availW - tagW, CV.FS.f1);
    const l2 = o.t2 ? CV.wrap(o.t2, availW, CV.FS.sm) : [];
    const h = Math.max(pad * 2 + l1.length * t1 + (l2.length ? 4 * CV.SCALE + l2.length * t2 : 0), 44 * CV.SCALE);
    const top = U.y;
    draw(() => {
      if (o.dim) CV.ctx.save(), CV.ctx.globalAlpha = 0.45;   /* 网页版已领取行 opacity:.45/.5 */
      const y0 = top + pad;
      if (o.ico) CV.text(o.ico, U.ix() + 4, y0 + (l1.length * t1 + (l2.length ? 4 * CV.SCALE + l2.length * t2 : 0)) / 2, { size: 19 * CV.SCALE });
      if (o.rightText) CV.text(o.rightText, U.ix() + U.iw(), y0 + (l1.length * t1) / 2, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      l1.forEach((ln, i) => CV.text(ln, U.ix() + 4 + icoW, y0 + t1 * (i + 0.5), { size: CV.FS.f1, bold: true }));
      if (o.tag) {
        const tw = CV.measure(l1[l1.length - 1], CV.FS.f1, true), th = CV.FS.xs * 1.5;
        const tx = U.ix() + 4 + icoW + Math.min(tw, availW - tagW) + 6 * CV.SCALE, ty = y0 + t1 * (l1.length - 0.5) - th / 2;
        CV.round(tx, ty, tagW, th, 999, null, CV.C.gold);
        CV.text(o.tag, tx + tagW / 2, ty + th / 2, { size: CV.FS.xs, align: 'center', color: CV.C.gold });
      }
      l2.forEach((ln, i) => CV.text(ln, U.ix() + 4 + icoW, y0 + l1.length * t1 + 4 * CV.SCALE + t2 * (i + 0.5),
        { size: CV.FS.sm, color: CV.C.dim }));
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + h - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + h - .5); CV.ctx.stroke();
      if (o.dim) CV.ctx.restore();
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 按钮 .btn（primary 红渐变 / gold / ghost；高度 44） ---------- */
  /* dis=true：网页版 `.btn[disabled] { opacity:.34; pointer-events:none }` —— 变灰、且不登记热区 */
  U.btn = function (x, y, w, h, label, style, id, dis) {
    h = h || U.BTN_H * CV.SCALE;
    const g = style === 'primary' ? CV.ctx.createLinearGradient(0, y, 0, y + h)
      : style === 'gold' ? CV.ctx.createLinearGradient(0, y, 0, y + h) : null;
    if (style === 'primary') { g.addColorStop(0, '#c9364a'); g.addColorStop(1, CV.C.accent2); }
    if (style === 'gold') { g.addColorStop(0, '#b98d2a'); g.addColorStop(1, '#87631a'); }
    const fill = g || (style === 'ghost' ? null : CV.C.panel2);
    const line = style === 'ghost' ? CV.C.line : (style === 'primary' ? '#e05a6d40' : style === 'gold' ? '#e6b64c44' : CV.C.line2);
    draw(() => {
      if (dis) { CV.ctx.save(); CV.ctx.globalAlpha = 0.34; }
      /* 按下态：网页版 .btn:active 是 scale(.97) + 背景压暗一档。
         画布里做等价的两件事 —— 四周缩进 1px + 叠一层半透明黑。 */
      const down = CV.pressed && id && CV.pressed === id;
      if (down) { x += 1; y += 1; w -= 2; h -= 2; }
      CV.round(x, y, w, h, CV.RADIUS_SM, fill, line);
      if (down) CV.round(x, y, w, h, CV.RADIUS_SM, 'rgba(0,0,0,.22)', null);
      /* 长标签换行，不截断 —— 网页版 .btn-row .btn { white-space: normal; line-height: 1.25 } */
      const size = h <= U.BTN_SM * CV.SCALE ? CV.FS.md : CV.FS.lg;
      const lines = CV.wrap(label, w - 16 * CV.SCALE, size, 2);
      const lh = size * 1.25;
      lines.forEach(function (ln, i) {
        CV.text(ln, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh,
          { size, bold: style === 'primary' || style === 'gold', align: 'center', color: style === 'gold' ? '#fdf3dc' : CV.C.text });
      });
      if (dis) CV.ctx.restore();
    });
    if (id && !dis) CV.hit(id, x, y, w, h);
    return h;
  };
  /* 一行按钮（等分；网页版 .btn-row） */
  U.btnRow = function (list, gapIn, hIn) {
    const gap = gapIn === undefined ? 10 * CV.SCALE : gapIn, h = (hIn || U.BTN_H) * CV.SCALE;
    const top = U.y;
    /* 宽度按"文字自然宽"比例分（网页版 .btn-row .btn 是 flex: 1 1 auto + min-width 5.375rem）：
       字多的按钮拿更多宽度，所以"免费抽 1 次（今日还剩 3 次）"这类长标签在网页版是一行，
       等分宽度会把它们挤成两行。 */
    const avail = U.iw() - gap * (list.length - 1);
    const nat = list.map((b) => Math.max(U.BTN_MINW * CV.SCALE, CV.measure(b.label, CV.FS.lg) + 24 * CV.SCALE));
    const sum = nat.reduce((a, b) => a + b, 0) || 1;
    const widths = nat.map((w) => Math.max(U.BTN_MINW * CV.SCALE, w * avail / sum));
    let x = U.ix();
    list.forEach((b, i) => { U.btn(x, top, widths[i], h, b.label, b.style, b.id, b.dis); x += widths[i] + gap; });
    U.y = top + h;
    return h;
  };

  /* ---------- 进度条 .bar（高 8 / 圆角 6） ---------- */
  U.bar = function (pct, color) {
    const h = 8 * CV.SCALE, top = U.y;
    draw(() => {
      CV.round(U.ix(), top, U.iw(), h, 6 * CV.SCALE, '#0d1120');
      const w2 = Math.max(0, Math.min(1, pct)) * U.iw();
      if (w2 > 1) CV.round(U.ix(), top, w2, h, 6 * CV.SCALE, color || CV.C.gold);
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 固定底部动作条（V9.5.54：按钮位置固定，不跟内容上下跳） ---------- */
  U.actionBar = function (list) {
    const gap = 10 * CV.SCALE, h = 44 * CV.SCALE;
    const y = CV.H - CV.NAV_H - CV.safeBottom - h - 12 * CV.SCALE;
    CV.ctx.fillStyle = CV.C.bg2;
    CV.ctx.fillRect(0, y - 10 * CV.SCALE, CV.W, h + 22 * CV.SCALE);
    const w = (U.cw() - gap * (list.length - 1)) / list.length;
    list.forEach((b, i) => U.btn(U.pad() + i * (w + gap), y, w, h, b.label, b.style, b.id));
    U.actionBottom = y;
    return h;
  };

  /* ---------- 确认弹窗（网页版 confirmBox：居中、两个按钮） ---------- */
  U.confirm = function (title, text, onOk) {
    const bw = Math.min(CV.W - 40, 420), x = (CV.W - bw) / 2;
    const lines = CV.wrap(text, bw - 28 * CV.SCALE, CV.FS.lg, 8);
    const h = 52 * CV.SCALE + lines.length * CV.FS.lg * 1.7 + 54 * CV.SCALE;
    const y = (CV.H - h) / 2;
    U.overlay = { x, y, w: bw, h, title, lines, text, onOk };
    CV.render();
  };
  CV.on('_cf_no', () => { U.overlay = null; CV.render(); });
  CV.on('_cf_yes', () => { const o = U.overlay; U.overlay = null; if (o && o.onOk) o.onOk(); else CV.render(); });
  /* ---------- 引导气泡（照网页版 coachmark）----------
     V9.6.27（父亲大人）：网页版有二十来处"首次操作引导"，小游戏一处都没有 —— 这是目前最大的功能缺口。
     画布版的做法：**不另存坐标**，直接拿 CV.hits 里那颗热区的矩形当锚点
     （所以页面怎么写都不用管引导），外面套一圈金色高亮框 + 一张提示卡；点任意位置关掉。
     只弹一次：看过记进 S.coachSeen。 */
  let coachState = null;
  const coachQueue = [];
  /* V9.6.35（父亲大人定的需求）：引导是**强制、逐项、必须真点到那颗按钮**才放行。
     用法：U.coach(targetId, text, opts)
       opts.key      —— 记进存档的键（默认用 targetId 拼）；老号第一次进某模块时补一次靠它
       opts.mustTap  —— true：必须**点中目标本身**才推进（点别处不生效）
       opts.queue    —— true：当前有引导时不丢弃，排队等这条播完（逐项介绍就是排一串）
     U.coachSkipAll() 给"跳过整条"，U.coachSeen(key) 查这条看过没有。 */
  U.coach = function (targetId, text, opts) {
    opts = opts || {};
    const S = G.Core && G.Core.S;
    if (!S) return;
    S.coachSeen = S.coachSeen || {};
    const key = opts.key || [].concat(targetId).join('|');
    if (S.coachSeen[key]) return;                      // 看过就不再弹
    const item = { targetId: targetId, key: key, text: text, mustTap: !!opts.mustTap, swallow: opts.swallow !== false };
    if (coachState) { if (opts.queue) coachQueue.push(item); return; }
    coachState = item;
  };
  U.coachSeen = function (key) { return !!(G.Core && G.Core.S && (G.Core.S.coachSeen || {})[key]); };
  U.coachMark = function (item) {
    const S = G.Core.S; S.coachSeen = S.coachSeen || {};
    if (item && item.key) S.coachSeen[item.key] = true;
    G.Core.save();
  };
  U.coachNext = function () {
    coachState = null;
    while (coachQueue.length) {
      const it = coachQueue.shift();
      const S = G.Core.S;
      if (!(S.coachSeen || {})[it.key]) { coachState = it; break; }
    }
    CV.render();
  };
  U.coachCount = function () { return (coachState ? 1 : 0) + coachQueue.length; };
  /* 点中"高亮的那颗"才算过。swallow=true 时这一下**只推进引导、不执行原动作**
     （逐项介绍用：点一下"【境界】"只是听下一项，不该顺手把页面跳走）。 */
  const _dispatch = CV.dispatch;
  CV.dispatch = function (id) {
    const st = coachState;
    if (st && st.mustTap) {
      const want = [].concat(st.targetId);
      if (want.indexOf(id) >= 0) {
        if (st.swallow !== false) { U.coachMark(st); U.coachNext(); return true; }   // 吃掉这一下
        const r = _dispatch(id);
        if (coachState === st) { U.coachMark(st); U.coachNext(); }
        return r;
      }
    }
    return _dispatch(id);
  };
  U.drawCoach = function () {
    if (!coachState) return;
    const S = G.Core.S;
    const c = CV.ctx;
    /* 锚点：优先找非屏幕坐标（内容区）的那一颗，换算到屏幕 y */
    let r = null;
    const want = [].concat(coachState.targetId);
    /* 锚点支持"前缀"（写成 'bup:*'）：建筑升级、装备格这类 id 带后缀（bup:core / eqd:eq123），
       不可能写死，用前缀就能锚到"这一类"里的第一颗（V9.6.37）。 */
    const match = function (id) {
      for (let i = 0; i < want.length; i++) {
        const w = want[i];
        if (w.slice(-1) === '*') { if (id.indexOf(w.slice(0, -1)) === 0) return true; }
        else if (id === w) return true;
      }
      return false;
    };
    (CV.hits || []).forEach(function (h) {
      if (r || !match(h.id)) return;
      r = h.screen ? { x: h.x, y: h.y, w: h.w, h: h.h } : { x: h.x, y: h.y - (CV.scroll || 0) + CV.TOP + 8, w: h.w, h: h.h };
    });
    /* V9.6.34（父亲大人："你这个提示也没有让画面跟着滚动到对应位置啊"）：
       目标可能在本屏之外（比如挂机的"收取奖励"在首页下方）——
       先把它滚进可视区再画引导，否则高亮框和提示都指着屏幕外，等于没引导。
       做法：算一下目标中心离可视区中心差多少 → 改 CV.scroll → 重画一帧（下一次进来就在视野里了）。 */
    const viewTop = CV.TOP + 8, viewBot = CV.H - CV.NAV_H - CV.safeBottom - 8;
    if (r && (r.y < viewTop + 6 || r.y + r.h > viewBot - 6)) {
      const mid = (viewTop + viewBot) / 2;
      const want = Math.max(0, Math.min(CV.maxScroll || 0, (CV.scroll || 0) + (r.y + r.h / 2 - mid)));
      if (Math.abs(want - (CV.scroll || 0)) > 1) {
        CV.scroll = want;
        setTimeout(function () { CV.render(); }, 0);   // 滚到位后再画（这一帧先放行）
        return;
      }
    }
    c.save();
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, CV.W, CV.H);
    const pad = 6;
    if (r) {
      /* 高亮框：把锚点"挖"出来（先清一块、再描金框） */
      c.fillStyle = 'rgba(0,0,0,0)';
      c.clearRect ? null : null;
      CV.round(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 12 * CV.SCALE, 'rgba(0,0,0,0)', CV.C.gold, 2);
    }
    const lines = CV.wrap(coachState.text, CV.W - 60 * CV.SCALE, CV.FS.lg, 5);
    const th = 44 * CV.SCALE + lines.length * CV.FS.lg * 1.7;
    const tw = CV.W - 40 * CV.SCALE;
    const tx = 20 * CV.SCALE;
    const ty = r ? Math.min(CV.H - th - 40 * CV.SCALE, r.y + r.h + 16 * CV.SCALE) : (CV.H - th) / 2;
    CV.round(tx, ty, tw, th, 14 * CV.SCALE, CV.C.panel, CV.C.gold);
    lines.forEach(function (ln, i) {
      CV.text(ln, tx + 14 * CV.SCALE, ty + 22 * CV.SCALE + CV.FS.lg * 1.7 * i, { size: CV.FS.lg });
    });
    /* V9.6.38（自审）：mustTap 但这次**没找到锚点**（目标按钮是条件出现的，比如
       "突破铭刻"只在能突破时才有）→ 必须退回"点一下继续"，否则玩家找不到可点的高亮、直接卡死。
       引导的第一原则是"不能把人卡住"，其次才是强制。 */
    const forced = coachState.mustTap && !!r;
    CV.text(forced ? '点高亮的地方 ›' : '点一下继续 ›',
      tx + tw - 14 * CV.SCALE, ty + th - 16 * CV.SCALE,
      { size: CV.FS.sm, color: CV.C.gold, align: 'right' });
    c.restore();
    CV.hitMode = 'screen';
    /* mustTap 的那条**不铺全屏"随便点"**，只有一颗小小的"跳过这一步"
       （父亲大人：完全强制 —— 但每一步仍然允许跳过，不然卡住就没救了）；
       其它条维持"点一下继续"。 */
    if (forced) {
      const sw = 76 * CV.SCALE, sh = 30 * CV.SCALE;
      U.btn(tx, ty + th - sh - 6 * CV.SCALE, sw, sh, '跳过这一步', 'ghost', '_coach_ok');
    } else {
      CV.hit('_coach_ok', 0, 0, CV.W, CV.H);
    }
    CV.hitMode = 'content';
  };
  /* 「跳过这一步」：标记已看并播下一条（**没有"整条跳过"** —— 父亲大人要的是完全强制） */
  CV.on('_coach_ok', function () {
    if (!coachState) return;
    U.coachMark(coachState);
    U.coachNext();
  });

  U.drawOverlay = function () {
    const o = U.overlay;
    if (!o) return;
    const c = CV.ctx;
    c.fillStyle = 'rgba(0,0,0,.62)'; c.fillRect(0, 0, CV.W, CV.H);
    /* V9.6.10（自审：整体偏"笨重"）：网页版的浮层 / 底部条都带投影
       （box-shadow: 0 -4px 1.25rem rgba(0,0,0,.45)），小游戏原来是一块贴死的平色，
       所以弹窗像"糊"在页面上。这里补一层柔和外投影。 */
    c.save();
    c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 22 * CV.SCALE; c.shadowOffsetY = 6 * CV.SCALE;
    CV.round(o.x, o.y, o.w, o.h, 14 * CV.SCALE, CV.C.bg2, CV.C.line);
    c.restore();
    CV.text(o.title, o.x + 14 * CV.SCALE, o.y + 24 * CV.SCALE, { size: CV.FS.f1, bold: true });
    o.lines.forEach((ln, i) => CV.text(ln, o.x + 14 * CV.SCALE, o.y + 52 * CV.SCALE + CV.FS.lg * 1.7 * (i + 0.5), { size: CV.FS.lg, color: CV.C.dim }));
    const by = o.y + o.h - 44 * CV.SCALE - 10 * CV.SCALE;
    const bw = (o.w - 28 * CV.SCALE - 10 * CV.SCALE) / 2;
    /* 确认弹窗画在**屏幕坐标**里（内容区已经 restore），命中区也要按屏幕坐标登记 */
    CV.hitMode = 'screen';
    U.btn(o.x + 14 * CV.SCALE, by, bw, 44 * CV.SCALE, '取消', 'ghost', '_cf_no');
    U.btn(o.x + 14 * CV.SCALE + bw + 10 * CV.SCALE, by, bw, 44 * CV.SCALE, '确定', 'primary', '_cf_yes');
    CV.hitMode = 'content';
  };
})();
