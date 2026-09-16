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

  U.y = 0;                 // 纵向游标（从内容区顶部算起）
  U.dry = false;           // true = 只量高度不画（U.card 用它先量后画底）
  U.begin = function () { U.y = 0; };
  U.pad = () => 12 * CV.SCALE;                        // 网页版 #view padding: 0.75rem
  U.cw = () => CV.W - U.pad() * 2;                    // 内容宽
  U.space = function (px) { U.y += px; };
  const draw = (fn) => { if (!U.dry) fn(); };

  /* ---------- 卡片 .card（bg --panel / 边 --line / 圆角 10 / 内边距 14 / 下边距 14）
     传一个画内容的函数：它按"内容游标"往下画，卡片底由这里先量后画。 ---------- */
  U.card = function (content) {
    const pad = CV.SP[2], top = U.y;
    U.dry = true; U.y = top + pad; content(); const inner = U.y - top - pad;
    U.dry = false;
    const h = inner + pad * 2;
    if (h > 4) CV.card(U.pad(), top, U.cw(), h);
    U.y = top + pad; content();
    U.y = top + h + CV.SP[2];
    return h;
  };

  /* ---------- 卡片标题行 .card h3（V9.5.30：标题 / 右侧小字 / 右侧按钮三条同一中线）
     · 左边 3×13 金色竖条 + 标题 15px 粗体；右侧小字 11px 灰、贴右。 ---------- */
  U.h3 = function (title, sub, opt) {
    opt = opt || {};
    const bar = 3, gap = 7, lh = CV.FS.f1 * 1.3;
    const top = U.y;
    draw(() => {
      const cy = top + lh / 2;
      const g = CV.ctx.createLinearGradient(0, cy - 6.5, 0, cy + 6.5);
      g.addColorStop(0, CV.C.gold); g.addColorStop(1, '#8a6a1e');
      CV.round(U.pad(), cy - 6.5, bar, 13, 2, g);
      CV.text(CV.fit(title, U.cw() - 120, CV.FS.f1, true), U.pad() + bar + gap, cy, { size: CV.FS.f1, bold: true });
      if (sub) CV.text(CV.fit(sub, U.cw() - 90, CV.FS.sm), U.pad() + U.cw(), cy, { size: CV.FS.sm, color: opt.subColor || CV.C.dim, align: 'right' });
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
      CV.text(CV.fit(k, U.cw() * 0.55, CV.FS.lg), U.pad(), cy, { size: CV.FS.lg, color: CV.C.dim });
      CV.text(CV.fit(v, U.cw() * 0.45, CV.FS.lg), U.pad() + U.cw(), cy, { size: CV.FS.lg, color: color || CV.C.text, align: 'right' });
      CV.ctx.save();
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.pad(), top + h - .5); CV.ctx.lineTo(U.pad() + U.cw(), top + h - .5); CV.ctx.stroke();
      CV.ctx.restore();
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 提示小字 .hint（11px 灰，行高 1.7）/ 说明 .note（12px 灰，行高 1.75） ---------- */
  function wrapBlock(text, size, lh, color, gapTop) {
    const lhPx = size * lh;
    const lines = CV.wrap(text, U.cw(), size, 6);
    const top = U.y + (gapTop || 0);
    draw(() => lines.forEach((ln, i) => CV.text(ln, U.pad(), top + lhPx * (i + 0.5), { size, color })));
    U.y = top + lines.length * lhPx;
    return lines.length * lhPx;
  }
  U.hint = function (text, gapTop) { return wrapBlock(text, CV.FS.sm, 1.7, CV.C.dim, gapTop); };
  U.note = function (text, gapTop) { return wrapBlock(text, CV.FS.md, 1.75, CV.C.dim, gapTop); };

  /* ---------- 区块小标题 .section-title（12px 字距 1px，右边一条线） ---------- */
  U.sectionTitle = function (text) {
    const top = U.y + CV.SP[3], lh = CV.FS.md * 1.3;
    draw(() => {
      const cy = top + lh / 2;
      CV.text(text, U.pad() + 4, cy, { size: CV.FS.md, color: CV.C.text2, bold: true });
      const w = CV.measure(text, CV.FS.md, true);
      CV.ctx.strokeStyle = CV.C.line; CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.pad() + 4 + w + 10, cy); CV.ctx.lineTo(U.pad() + U.cw() - 4, cy); CV.ctx.stroke();
    });
    U.y = top + lh + CV.SP[1];                          // 下边距 10
    return lh + CV.SP[3] + CV.SP[1];
  };

  /* ---------- 三列文字宫格 .text-menu + .tile（名字 13 粗体 / 状态 11 灰，居中） ---------- */
  U.tiles = function (list, cols) {
    cols = cols || 3;
    const gap = CV.SP[1], cellW = (U.cw() - gap * (cols - 1)) / cols;
    const th = 54 * CV.SCALE;
    const startY = U.y;
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = U.pad() + c * (cellW + gap), y = startY + r * (th + gap);
      draw(() => {
        CV.round(x, y, cellW, th, 6 * CV.SCALE, CV.C.panel, CV.C.line2);
        const inner = cellW - 12 * CV.SCALE;
        const hasSub = !!(t[2]);
        const cy = hasSub ? y + th / 2 - 7 * CV.SCALE : y + th / 2;
        CV.text(CV.fit(t[1], inner, CV.FS.lg, true), x + cellW / 2, cy, { size: CV.FS.lg, bold: true, align: 'center' });
        if (hasSub) CV.text(CV.fit(t[2], inner, CV.FS.xs), x + cellW / 2, cy + 15 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      });
      if (t[0]) CV.hit(t[0], x, y, cellW, th);
    });
    const rows = Math.ceil(list.length / cols);
    U.y = startY + rows * th + (rows - 1) * gap;
    return rows * th + (rows - 1) * gap;
  };

  /* ---------- 列表行 .list-row（左标题+说明、右按钮） ---------- */
  U.listRow = function (o) {
    const t1 = CV.FS.f1 * 1.35, t2 = CV.FS.sm * 1.55, pad = 10 * CV.SCALE;
    const h = Math.max(pad * 2 + t1 + 4 * CV.SCALE + t2, 44 * CV.SCALE);
    const top = U.y;
    draw(() => {
      const y0 = top + pad;
      CV.text(CV.fit(o.t1, U.cw() - (o.rightW || 0) - 12 * CV.SCALE, CV.FS.f1, true), U.pad() + 4, y0 + t1 / 2, { size: CV.FS.f1, bold: true });
      if (o.t2) CV.text(CV.fit(o.t2, U.cw() - (o.rightW || 0) - 12 * CV.SCALE, CV.FS.sm), U.pad() + 4, y0 + t1 + 4 * CV.SCALE + t2 / 2, { size: CV.FS.sm, color: CV.C.dim });
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.pad(), top + h - .5); CV.ctx.lineTo(U.pad() + U.cw(), top + h - .5); CV.ctx.stroke();
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 按钮 .btn（primary 红渐变 / gold / ghost；高度 44） ---------- */
  U.btn = function (x, y, w, h, label, style, id) {
    const g = style === 'primary' ? CV.ctx.createLinearGradient(0, y, 0, y + h)
      : style === 'gold' ? CV.ctx.createLinearGradient(0, y, 0, y + h) : null;
    if (style === 'primary') { g.addColorStop(0, '#c9364a'); g.addColorStop(1, CV.C.accent2); }
    if (style === 'gold') { g.addColorStop(0, '#b98d2a'); g.addColorStop(1, '#87631a'); }
    const fill = g || (style === 'ghost' ? null : CV.C.panel2);
    const line = style === 'ghost' ? CV.C.line : (style === 'primary' ? '#e05a6d40' : style === 'gold' ? '#e6b64c44' : CV.C.line2);
    draw(() => {
      CV.round(x, y, w, h, CV.RADIUS_SM, fill, line);
      CV.text(CV.fit(label, w - 12, CV.FS.lg), x + w / 2, y + h / 2,
        { size: CV.FS.lg, bold: style === 'primary' || style === 'gold', align: 'center', color: style === 'gold' ? '#fdf3dc' : CV.C.text });
    });
    if (id) CV.hit(id, x, y, w, h);
    return h;
  };
  /* 一行按钮（等分；网页版 .btn-row） */
  U.btnRow = function (list, gapIn) {
    const gap = gapIn === undefined ? 10 * CV.SCALE : gapIn, h = 44 * CV.SCALE;
    const w = (U.cw() - gap * (list.length - 1)) / list.length;
    const top = U.y;
    list.forEach((b, i) => U.btn(U.pad() + i * (w + gap), top, w, h, b.label, b.style, b.id));
    U.y = top + h;
    return h;
  };

  /* ---------- 进度条 .bar（高 8 / 圆角 6） ---------- */
  U.bar = function (pct, color) {
    const h = 8 * CV.SCALE, top = U.y;
    draw(() => {
      CV.round(U.pad(), top, U.cw(), h, 6 * CV.SCALE, '#0d1120');
      const w2 = Math.max(0, Math.min(1, pct)) * U.cw();
      if (w2 > 1) CV.round(U.pad(), top, w2, h, 6 * CV.SCALE, color || CV.C.gold);
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
  U.drawOverlay = function () {
    const o = U.overlay;
    if (!o) return;
    const c = CV.ctx;
    c.fillStyle = 'rgba(0,0,0,.62)'; c.fillRect(0, 0, CV.W, CV.H);
    CV.round(o.x, o.y, o.w, o.h, 14 * CV.SCALE, CV.C.bg2, CV.C.line);
    CV.text(o.title, o.x + 14 * CV.SCALE, o.y + 24 * CV.SCALE, { size: CV.FS.f1, bold: true });
    o.lines.forEach((ln, i) => CV.text(ln, o.x + 14 * CV.SCALE, o.y + 52 * CV.SCALE + CV.FS.lg * 1.7 * (i + 0.5), { size: CV.FS.lg, color: CV.C.dim }));
    const by = o.y + o.h - 44 * CV.SCALE - 10 * CV.SCALE;
    const bw = (o.w - 28 * CV.SCALE - 10 * CV.SCALE) / 2;
    U.btn(o.x + 14 * CV.SCALE, by, bw, 44 * CV.SCALE, '取消', 'ghost', '_cf_no');
    U.btn(o.x + 14 * CV.SCALE + bw + 10 * CV.SCALE, by, bw, 44 * CV.SCALE, '确定', 'primary', '_cf_yes');
  };
})();
