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
  /* V9.6.69（资料 §10：触控目标 ≥44×44 —— WCAG AAA / Apple HIG 同口径）：
     小按钮原来是 40（×SCALE≈1.04 也只有 41.6px），手机上容易点不准 → 抬到 44。 */
  /* V9.6.118（父亲大人："整体的间距、大小、对齐都检查一遍"）：按钮尺寸回到网页版的口径 ——
     .btn min-height 2.75rem = 44px、.btn.small 2.5rem = 40px、标题行按钮 .hbtn 2.125rem = 34px。
     原来画布写的是 46 / 44 —— 小按钮比网页版胖 4px，一屏里几十颗按钮都跟着胖，
     行距和卡片高度全被顶起来（"看着笨重、间距不对劲"的来源之一）。 */
  U.BTN_H = 44; U.BTN_SM = 40; U.BTN_TITLE = 34; U.BTN_MINW = 86;
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
    /* V9.6.118（父亲大人："技能的重置和下面加点的框还是贴的很近"）：
       网页版的 .hbtn 是 **2.125rem = 34px** 高，而 h3 是 flex 行 —— 行高会被按钮撑到 34px，
       再吃 10px 下边距，下面第一块才起步。画布这边原来只画了 26px 的按钮、
       行高又按"标题行高 19.5px"算 —— 于是按钮比行高还高出 6.5px，
       直接压到下面第一行面板上（截图里"重置"和第一颗 +1 贴在一起就是这么来的）。
       现在：行高 = max(标题行高, 按钮高)，按钮居中在行内，再由下面 10px 收尾。 */
    const bar = 3, gap = 7, lh = CV.FS.f1 * 1.3;
    const btnH = U.BTN_TITLE * CV.SCALE;
    const rowH = opt.btn ? Math.max(lh, btnH) : lh;
    if (opt.btn) {
      const bw = CV.measure(opt.btn.label, CV.FS.sm) + 20 * CV.SCALE;
      U.btn(U.ix() + U.iw() - bw, U.y + (rowH - btnH) / 2, bw, btnH, opt.btn.label, 'ghost', opt.btn.id);
    }
    const top = U.y;
    draw(() => {
      const cy = top + rowH / 2;                     // 标题 / 小字 / 按钮共用这一条中线
      const g = CV.ctx.createLinearGradient(0, cy - 6.5, 0, cy + 6.5);
      g.addColorStop(0, CV.C.gold); g.addColorStop(1, '#8a6a1e');
      CV.round(U.ix(), cy - 6.5, bar, 13, 2, g);
      /* opt.color：标题颜色（网页版是内联 color，比如"没激活的产线标题压灰、激活的走金色"） */
      CV.text(CV.fit(title, U.iw() - 120, CV.FS.f1, true), U.ix() + bar + gap, cy,
        { size: CV.FS.f1, bold: true, color: opt.color || CV.C.text, ls: 0.2 });   // .card h3 letter-spacing .2px
      const subRight = opt.btn ? (CV.measure(opt.btn.label, CV.FS.sm) + 30 * CV.SCALE) : 0;   // 让开右侧按钮
      if (sub) CV.text(CV.fit(sub, U.iw() - 90 - subRight, CV.FS.sm), U.ix() + U.iw() - subRight, cy, { size: CV.FS.sm, color: opt.subColor || CV.C.dim, align: 'right' });
    });
    U.y = top + rowH + 10 * CV.SCALE;                 // 标题下边距 10（.card h3 margin-bottom）
    return rowH + 10 * CV.SCALE;
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
  /* V9.6.90：第 3 个参数以前叫 widthIn（两栏卡用的可用宽度），但全仓从来没人传过宽度，
     倒是有地方想传"颜色" —— 统一改成 color，别再让调用方猜。 */
  U.hint = function (text, gapTop, color) { return wrapBlock(text, CV.FS.sm, 1.7, color || CV.C.dim, gapTop); };
  U.note = function (text, gapTop, widthIn) { return wrapBlock(text, CV.FS.md, 1.75, CV.C.dim, gapTop, widthIn); };

  /* ---------- 技能行 .skill-row（V9.6.117：主角详情 / 伙伴详情**共用这一个**）----------
     网页版的规矩（css 里 .skill-row 那三条），画布照抄：
       · 每条技能是**自己的一个面板**：panel 底 / 圆角 10 / 内边距 10 / 条与条之间 8px
       · .sname 三级(13px)粗体 ＋ 紧跟一枚五级(11px)描边胶囊（Lv.N/M）＋ 可选 +1 按钮（同一中线）
       · .sdesc 五级(11px)灰字，**距名字 3px**，行高 1.55
     起因（父亲大人："技能的版面有问题，间距又又贴在一起的了"）：
     原来两个页面各写一套（一个把名字/胶囊/描述直接铺在卡片上、行高只有 22px，
     另一个把 +1 做成整行大按钮），胶囊和描述贴在一起、间距还和别处不一样。
     现在只有这一份实现，层级和间距都跟着 .skill-row 走。 */
  U.skillRow = function (o) {
    o = o || {};
    const PAD = 10 * CV.SCALE, GAP = 8 * CV.SCALE;
    const name = String(o.name || '');
    const nameH = CV.FS.lg * 1.35;
    /* V9.6.119（父亲大人："这个加 1 的框明显偏上你没检查出来吗"）：
       **同一个坑我在标题行修过、却在技能行漏了** —— 按钮高 40px，而这一行只按
       "名字行高 17.5px"算高度、又拿 nameH/2 当中间线：按钮顶边 = 面板顶 − 1.25px，
       直接**戳出面板外面**，看着就是"偏上"。
       网页版不会这样：`.sname` 是 flex 行，放得下 .btn.small(2.5rem) 时这一行就长成 40px，
       名字和按钮一起在 40px 里居中。现在照它来 —— 名字行高 = max(名字行高, 按钮高)。 */
    const btnH = o.btnId === undefined ? 0 : U.BTN_SM * CV.SCALE;
    const nameRowH = btnH ? Math.max(nameH, btnH) : nameH;
    const bw = o.btnId === undefined ? 0 : 52 * CV.SCALE;
    const tagW = o.tag ? (CV.measure(o.tag, CV.FS.sm) + 12 * CV.SCALE) : 0;
    const tagH = o.tag ? (CV.FS.sm * 1.4 + 2 * CV.SCALE) : 0;
    const descW = U.iw() - PAD * 2;
    const descLines = o.desc ? CV.wrap(o.desc, descW, CV.FS.sm) : [];
    const descH = descLines.length ? (3 * CV.SCALE + descLines.length * CV.FS.sm * 1.55) : 0;
    const rowH = PAD * 2 + nameRowH + descH;
    const top = U.y;
    CV.round(U.ix(), top, U.iw(), rowH, 10 * CV.SCALE, CV.C.panel);
    const cy = top + PAD + nameRowH / 2;         // 名字 / 等级胶囊 / 按钮共用这一条中线
    CV.ctx.save();
    if (o.dim) CV.ctx.globalAlpha = 0.5;
    CV.text(CV.fit(name, U.iw() - PAD * 2 - bw - tagW - 12 * CV.SCALE, CV.FS.lg, true), U.ix() + PAD, cy,
      { size: CV.FS.lg, bold: true, color: o.color || CV.C.text });
    const nw = CV.measure(CV.fit(name, U.iw() - PAD * 2 - bw - tagW - 12 * CV.SCALE, CV.FS.lg, true), CV.FS.lg, true);
    if (o.tag) {
      const tx = U.ix() + PAD + nw + 6 * CV.SCALE;
      CV.round(tx, cy - tagH / 2, tagW, tagH, CV.RADIUS_SM, null, CV.C.line2);
      CV.text(o.tag, tx + tagW / 2, cy, { size: CV.FS.sm, color: CV.C.text2, align: 'center' });
    }
    if (descLines.length) {
      descLines.forEach(function (ln, k) {
        CV.text(ln, U.ix() + PAD, top + PAD + nameRowH + 3 * CV.SCALE + CV.FS.sm * 1.55 * (k + 0.5),
          { size: CV.FS.sm, color: CV.C.dim });
      });
    }
    CV.ctx.restore();
    /* 按钮在**面板里**、和名字同一条中线（不能像以前那样 top-10 悬到上一行去） */
    if (o.btnId !== undefined) {
      /* V9.6.119：不能点的时候必须画成**禁用态**（网页版 .btn[disabled]{opacity:.34;pointer-events:none}）——
         以前传 id='' 只是"登记不上热区"，按钮看着照样是亮的、点了没反应，就是无效按键。 */
      U.btn(U.ix() + U.iw() - PAD - bw, cy - btnH / 2, bw, btnH, o.btnLabel || '+1',
        o.btnStyle || 'ghost', o.btnId, !!o.btnDis);
    }
    U.y = top + rowH + (o.last ? 0 : GAP);
    return rowH;
  };

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
  /* groupId：给**整片宫格**登记一个锚点（引导要整片高亮，不能只框第一个格子）。
     它登记在最后 → 派发时先命中它（引导只放行它，格子本身的热区被挡住）。 */
  U.tiles = function (list, cols, groupId) {
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
    if (groupId) CV.hit(groupId, U.ix(), startY, U.iw(), rows * th + (rows - 1) * gap);
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
    /* V9.6.117（排版层级）：o.t1sub = 跟在标题后面的一段**五级**灰字
       （网页版六维那行就是 `<span style="color:var(--dim);font-size:0.6875rem">` 内联在标题里）。
       以前没有这个口子，只能把名字和解释拼成一个字符串整行画成**二级** —— 解释文字于是和名字一样大
       （父亲大人："六维的解释文字太大了"）。 */
    const subW = o.t1sub ? (CV.measure(' ' + o.t1sub, CV.FS.sm) + 4 * CV.SCALE) : 0;
    const l1 = CV.wrap(o.t1, availW - tagW - subW, CV.FS.f1);
    const l2 = o.t2 ? CV.wrap(o.t2, availW, CV.FS.sm) : [];
    const h = Math.max(pad * 2 + l1.length * t1 + (l2.length ? 4 * CV.SCALE + l2.length * t2 : 0), 44 * CV.SCALE);
    const top = U.y;
    draw(() => {
      if (o.dim) CV.ctx.save(), CV.ctx.globalAlpha = 0.45;   /* 网页版已领取行 opacity:.45/.5 */
      const y0 = top + pad;
      if (o.ico) CV.text(o.ico, U.ix() + 4, y0 + (l1.length * t1 + (l2.length ? 4 * CV.SCALE + l2.length * t2 : 0)) / 2, { size: CV.ICO * CV.SCALE });
      if (o.rightText) CV.text(o.rightText, U.ix() + U.iw(), y0 + (l1.length * t1) / 2, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      l1.forEach((ln, i) => CV.text(ln, U.ix() + 4 + icoW, y0 + t1 * (i + 0.5), { size: CV.FS.f1, bold: true }));
      if (o.t1sub) {
        /* 解释文字跟在**最后一行**标题后面（和网页版同一行同一个基线） */
        const lastW = CV.measure(String(l1[l1.length - 1]), CV.FS.f1, true);
        CV.text(o.t1sub, U.ix() + 4 + icoW + lastW + 6 * CV.SCALE, y0 + t1 * (l1.length - 0.5),
          { size: CV.FS.sm, color: CV.C.dim });
      }
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
    /* V9.6.90：颜色一律 rgba()，**不许用 8 位 hex**（#RRGGBBAA）——
       微信画布对这个格式"部分支持/不稳定"，赋值失败时画布会**保持上一次的填充色**，
       表现就是"黑底黑字"（父亲大人最早报的那个毛病）。见 canvas_audit 的同名规则。 */
    const line = style === 'ghost' ? CV.C.line : (style === 'primary' ? 'rgba(224,90,109,.25)' : style === 'gold' ? 'rgba(230,182,76,.27)' : CV.C.line2);
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

  /* V9.6.90：「固定底部动作条」U.actionBar 已删 —— 全仓没人调用（真正在用的两条底条
     是"页面级覆盖层"：背包的批量分解条 CV.pageOverlay、招募的抽卡条），
     而它按**屏幕坐标**算 y 却是在**内容层**里画的：谁哪天顺手用了它，
     按钮就会整体下移一整个顶栏、贴着底栏甚至出画。留着就是一颗雷。 */

  /* ---------- 确认弹窗（网页版 confirmBox：居中、两个按钮） ----------
     V9.6.90：加了 opt —— 网页版好几处弹窗是"一串奖励胶囊 + 下面一个按钮"
     （离线收益 / 七日登录），canvas 原来只有"两行字 + 取消/确定"，
     所以那两个弹窗在小游戏里根本没法照着做。现在支持：
       opt.chips   奖励胶囊文案数组（自动居中折行）
       opt.note    按钮上方的一行灰色小字
       opt.cancel  false = 只有一个按钮（offline / 公告这类）
       opt.okLabel 那个按钮的字（默认"确定"） */
  const CHIP_H = 26, CHIP_GAP = 6 * CV.SCALE;
  /* 胶囊居中折行：返回 [[{t,w},…], …] */
  function chipRows(list, maxW) {
    const rows = [[]];
    let used = 0;
    list.forEach(function (t) {
      const w = CV.measure(t, CV.FS.sm) + 22 * CV.SCALE;
      const row = rows[rows.length - 1];
      if (row.length && used + w + CHIP_GAP > maxW) { rows.push([]); used = 0; }
      rows[rows.length - 1].push({ t: t, w: w });
      used += w + CHIP_GAP;
    });
    return rows.filter((r) => r.length);
  }
  U.confirm = function (title, text, onOk, opt) {
    opt = opt || {};
    /* V9.6.94（父亲大人："离线后开启游戏的弹窗字也贴一起了"）：
       以前弹窗高度是一套公式、drawOverlay 又是另一套坐标 —— 两边必然漂移。
       带奖励胶囊的离线收益弹窗里，"离线期间…"那行小字就压到了按钮上。
       现在**只在这里排一次版**：每一块的 y 都在这个循环里定下来，
       drawOverlay 只负责照着这些坐标画，不可能再对不上。 */
    const PAD = 14 * CV.SCALE;
    const bw = Math.min(CV.W - 40, 420), x = (CV.W - bw) / 2;
    const inner = bw - PAD * 2;
    const LH_T = CV.FS.f1 * 1.35;      // 标题行盒 20.25
    const LH_L = CV.FS.lg * 1.7;       // 正文行盒 22.1
    const LH_N = CV.FS.xs * 1.7;       // 小字行盒 18.7
    const lines = CV.wrap(text, inner, CV.FS.lg, 9);
    const rows = (opt.chips && opt.chips.length) ? chipRows(opt.chips.filter(Boolean), inner) : [];
    const note = opt.note ? CV.wrap(opt.note, inner, CV.FS.xs, 3) : [];
    let cy = PAD;
    const titleY = cy + LH_T / 2; cy += LH_T;
    const lineY = [];
    if (lines.length) cy += 8 * CV.SCALE;
    lines.forEach(function () { cy += LH_L; lineY.push(cy - LH_L / 2); });
    const chipY = [];
    if (rows.length) {
      cy += 10 * CV.SCALE;
      rows.forEach(function (row, i) { chipY.push(cy + CHIP_H / 2); cy += CHIP_H + (i < rows.length - 1 ? CHIP_GAP : 0); });
    }
    const noteY = [];
    if (note.length) {
      cy += 8 * CV.SCALE;
      note.forEach(function () { cy += LH_N; noteY.push(cy - LH_N / 2); });
    }
    cy += 16 * CV.SCALE;               // 按钮与上面内容的间距
    const btnY = cy; cy += 44 * CV.SCALE;
    const h = cy + PAD;
    const y = (CV.H - h) / 2;
    U.overlay = {
      x: x, y: y, w: bw, h: h, title: title, lines: lines, text: text, onOk: onOk,
      rows: rows, note: note, single: opt.cancel === false, okLabel: opt.okLabel || '确定',
      pad: PAD, titleY: titleY, lineY: lineY, chipY: chipY, noteY: noteY, btnY: btnY,
    };
    CV.render();
  };
  /* 离线收益 / 时间异常（与网页版 showOfflineGains 同一份文案，V9.6.90） */
  U.offlineGains = function (g) {
    if (!g) return;
    if (g.cheat) {
      U.confirm('⚠ 时间异常', '检测到系统时间被修改，本次离线收益已取消。',
        function () { CV.render(); }, { cancel: false, okLabel: '知道了' });
      return;
    }
    const D = G.DATA || {};
    const fmt = G.fmt || ((n) => String(n));
    const dur = G.formatDuration ? G.formatDuration(g.seconds) : (g.seconds + ' 秒');
    const chips = [];
    chips.push('◈ +' + fmt(g.gains.points));
    chips.push('EXP +' + fmt(g.gains.exp));
    if (g.gains.otherworld) chips.push('◆ +' + g.gains.otherworld);
    if (g.gains.story) chips.push('❖ +' + g.gains.story);
    if (g.gains.matCount && g.gains.matItem) {
      const it = (D.ITEMS || {})[g.gains.matItem];
      chips.push('⚙️ ' + ((it && it.name) || g.gains.matItem) + '×' + g.gains.matCount);
    }
    if (g.gains.matStashed) chips.push('📮 待领箱 +' + g.gains.matStashed);
    U.confirm('欢迎回来，执灯者',
      '离线 ' + dur + '（效率 ' + Math.round(g.efficiency * 100) + '%）',
      function () { CV.render(); },
      { cancel: false, okLabel: '收下', chips: chips, note: '离线期间挂机分工的产线一样在跑。' });
  };
  /* 七日登录（与网页版 showLoginReward 同一份文案） */
  U.loginReward = function (r) {
    if (!r) return;
    const D = G.DATA || {};
    const txt = r.reward.ssrTicket ? '🎫 SSR自选券'
      : ((G.Core && G.Core.rewardTextOf) ? G.Core.rewardTextOf(r.reward) : '第 ' + r.day + ' 天奖励');
    const moon = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗'][Math.max(0, Math.min(6, r.day - 1))];
    U.confirm('七日登录 · 第 ' + r.day + ' 天', '今日奖励',
      function () { CV.render(); },
      { cancel: false, okLabel: '收下', chips: [moon + ' ' + txt] });
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
  /* V9.6.66（与网页版 V9.6.65 同步）：**玩家自己点「去完成」= 主动求引导**，这种必须每次都给。
     原来小游戏的引导是"看过就永不再弹"，于是第二次点前往只会把人送到页面、什么都不说
     （网页版同一个毛病，父亲大人："又没说要干嘛"）。用一个短窗口的开关把"主动要的"和
     "路过顺手讲的"分开。 */
  let coachForceUntil = 0;
  /* 这次"主动求引导"是为**哪一条**破例（null = 不限定，老口径） */
  let coachForceKey = null;
  /* V9.6.112（父亲大人："第一关的指引打完之后出来还是第一关的指引"）：
     「去完成」开的那 2.5 秒强制窗口，原来对**所有**引导都有效 ——
     玩家做完这一步、再回到那一页，同一条卡片又冒出来讲一遍（看着就是没更新）。
     现在这个窗口**每条只破例一次**：主动求一次就讲一次，之后照常按"已看过"收敛。 */
  const coachForcedUsed = {};
  /* V9.6.68（资料 §5「引导每一步都要能测」）：本地引导漏斗 —— 形状与网页版一致，
     记 看过/点过/跳过/没指到 + 累计毫秒；GM 面板里能看（sc-last 的调试页）。 */
  function coachFunnel(key, what, ms) {
    if (!key || !(G.Core && G.Core.S)) return;
    const S = G.Core.S;
    S.coachStats = S.coachStats || {};
    const st = S.coachStats[key] = S.coachStats[key] || { view: 0, tap: 0, skip: 0, miss: 0, ms: 0, msN: 0 };
    st[what] = (st[what] || 0) + 1;
    if (what === 'tap' || what === 'skip') { st.ms = (st.ms || 0) + Math.max(0, ms || 0); st.msN = (st.msN || 0) + 1; }
    G.Core.save();
  }
  U.coachFunnel = coachFunnel;
  U.coachForce = function (ms, onlyKey) {
    coachForceUntil = Date.now() + (ms || 2500);
    /* V9.6.112（父亲大人："招募的指引得点好几下才能换"／"第一关的指引打完之后出来还是它"）：
       「去完成」开的那 2.5 秒窗口，原来对**所有**引导都有效 ——
       于是玩家点完这一步、只要这 2.5 秒里又渲染了别的页，那一页的基础引导也会跳出来。
       现在窗口**只对玩家点的那一步破例**（onlyKey 传进来是谁，就只有谁能再讲一遍），
       而且每条只破例一次：同一条不会因为换页回来又讲第二遍。 */
    coachForceKey = onlyKey || null;
    for (const k in coachForcedUsed) delete coachForcedUsed[k];
  };
  U.coachForced = function () { return Date.now() < coachForceUntil; };
  /* 这一次"主动求引导"还能不能为**这一条**破例 */
  const forcedNow = function (key) {
    if (Date.now() >= coachForceUntil) return false;
    if (coachForceKey && String(coachForceKey) !== String(key)) return false;
    return !coachForcedUsed[key];
  };
  /* V9.6.67（查漏补缺）：**战斗页整屏接管，引导在那一页既不画也不挡**。
     起因：主线 q01b 那类"点第 1 关就开打"的步骤带 waitFor（打完才算过），
     玩家一点高亮就进了战斗 —— 引导还在，于是把战斗页的撤离 / 加速 / 结算按钮全挡死，
     只能等打完（或者点"跳过这一步"，可那行小字在战斗画面上根本看不到）。
     现在战斗期间引导自动让路，打完回到世界页它再接着算。 */
  function coachSuspended() {
    try { const t = CV.top && CV.top(); return !!(t && t.name === 'battle'); } catch (e) { return false; }
  }
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
    if (S.coachSeen[key] && !forcedNow(key)) return;   // 看过就不再弹（玩家主动又要了，才再讲一次）
    if (forcedNow(key)) coachForcedUsed[key] = true;   // 破例只给一次
    /* V9.6.66（父亲大人："引导时只能点高亮区域，不能点其他区域或滑动界面"）：
       mustTap 改成**默认开** —— 所有引导都只有两条出路：点高亮的那颗，或者点右下角「跳过这一步」。
       以前非强制的那些给了一颗全屏热区（点哪都算过），玩家一边看引导一边还能操作别的东西。 */
    const item = { targetId: targetId, key: key, text: text, mustTap: opts.mustTap !== false, swallow: opts.swallow !== false, onDone: opts.onDone,
      /* V9.6.67（查漏补缺）：记住它是**在哪一页**登记的。引导是页面在 render 里登记的，
         而"讲完这一步自动退上一层"（CV.pop）会让那一次 render 的引导挂到上一层去
         —— 实测：讲完六维回首页，屏幕上飘着一条"血统升级"的卡，指的却是首页上没有的东西。
         现在换页了就先放下（**不标已读**，等玩家回到那一页再讲）。 */
      bornPage: (CV.top && CV.top()) ? CV.top().name : null,
      waitFor: opts.waitFor,   // waitFor：**这件事真的做完了**才算过（父亲大人拍板的第 2 条）
      where: opts.where };     // where：这一步要在哪一页做（目标不在本页时告诉玩家去哪）
    /* V9.6.43 自审：同一个 key 不能重复入队 —— 链式引导每帧都会问一次，
       不拦的话队列会**无限堆积**（每渲染一帧塞一条）。 */
    if (coachState && coachState.key === key) return;
    for (let i = 0; i < coachQueue.length; i++) if (coachQueue[i].key === key) return;
    if (coachState) {
      if (opts.queue) coachQueue.push(item);
      return;
    }
    coachState = item;
  };
  U.coachSeen = function (key) { return !!(G.Core && G.Core.S && (G.Core.S.coachSeen || {})[key]); };
  U.coachMark = function (item) {
    const S = G.Core.S; S.coachSeen = S.coachSeen || {};
    if (item && item.key) S.coachSeen[item.key] = true;
    G.Core.save();
  };
  U.coachNext = function () {
    const done = coachState && coachState.onDone;
    coachState = null;
    while (coachQueue.length) {
      const it = coachQueue.shift();
      const S = G.Core.S;
      if (!(S.coachSeen || {})[it.key]) { coachState = it; break; }
    }
    /* V9.6.43：这一组播完了 → 交给链式引导的下一步（"带着走"靠它；
       注意**先渲染再回调**，否则回调里换页会在没有引导的状态下多画一帧）。 */
    if (!coachState && done) { CV.render(); setTimeout(done, 0); return; }
    CV.render();
  };
  U.coachCount = function () { return (coachState ? 1 : 0) + coachQueue.length; };
  U.coachActive = function () { return !!coachState; };   // 触摸层用它挡滚动（引导期间不许滑屏）
  /* V9.6.67：给"开场链"用的两颗 —— 看当前在讲哪一条 / 把插队的放下来（**不标已读**，
     它下次进那一页还会补讲）。开场链要一路走完，中途被别的引导插进来会挑错下一步。 */
  U.coachCurrent = function () { return coachState; };
  /* V9.6.105（自审抓到的）：**队列里排着的下一条要顶上来** ——
     引导因为换页被丢弃时（bornPage 对不上），原来只把当前这条清掉，
     队列里的下一条就永远不冒出来了（玩家感受："引导没了 / 卡住 / 走错乱"）。
     这里统一成一个 promote：没有当前条时，把队列里第一条没看过的顶上来。 */
  function promoteCoach() {
    if (coachState) return;
    const S = G.Core && G.Core.S;
    while (coachQueue.length) {
      const it = coachQueue.shift();
      if (S && S.coachSeen && S.coachSeen[it.key]) continue;
      coachState = it; return;
    }
  }
  U.coachDrop = function () { coachState = null; promoteCoach(); };
  /* V9.6.102：玩家点「去完成」＝ 换一件事讲 —— 把当前这条和**排队等着的**一起清掉。
     只清当前那条（coachDrop）是不够的：上一条引导常常正排在队列里，
     换页之后它会接着冒出来，看着就像"引导讲的是上一件事"（父亲大人："任务引导走错乱了"）。 */
  U.coachClearAll = function () { coachState = null; coachQueue.length = 0; };
  /* V9.6.45（父亲大人："小游戏指引一半还是能点到别的窗口"）：
     引导画在最上层只是**视觉**上盖住了，底下那些按钮的热区仍然在 CV.hits 里、照样能派发 ——
     看着被挡住，其实还能点到别的。这里给派发加一道闸：引导在的时候，
     只放行「引导自己的那颗（跳过这一步）」和「高亮的目标」，其余一律吃掉。 */
  U.coachAllows = function (h) {
    if (!coachState) return true;
    /* V9.6.95（自审：弹窗按钮点不动）：引导在的时候只放行"高亮那颗"，
       但**弹窗是更高一层的模态** —— 弹窗打开期间，引导一律不拦，
       由触摸层的"只放行弹窗按钮"那条规则统一把关。
       否则会出现：引导还挂着 → 弹窗弹出来 → 点「确定」被引导吃掉，玩家卡住。 */
    if (G.U && G.U.overlay) return true;
    if (coachSuspended()) return true;              // 战斗页：引导让路（见上）
    if (h.id === '_coach_ok') return true;
    const want = [].concat(coachState.targetId);
    for (let i = 0; i < want.length; i++) {
      const w = want[i];
      if (w.slice(-1) === '*') { if (h.id.indexOf(w.slice(0, -1)) === 0) return true; }
      else if (h.id === w) return true;
    }
    return false;
  };
  /* V9.6.108（父亲大人："队伍上阵又上不了了，其他东西也都点不了了"）：
     判断一颗热区是不是**当前引导要你点的那一片**。
     用途：有些热区是"给引导当锚点"的整块区域（队伍阵型 party_board、六维卡 attr_card、
     关卡格 stage_grid…），它们**没有动作**却盖在真按钮上面 ——
     以前触摸层会把点击派发给它们（因为它们在有引导时"被放行"），于是
     点队伍空位派发的是 party_board → 什么都不发生 → 上不了阵、整页像死了。
     现在这类"没有处理器的锚点"只有在"引导正开着、且它就是引导目标"时才吃点击
     （那时点它＝关掉引导），其余情况一律让下面的真按钮拿到点击。 */
  U.coachIsTarget = function (h) {
    if (!coachState) return false;
    const want = [].concat(coachState.targetId);
    for (let i = 0; i < want.length; i++) {
      const w = String(want[i]);
      if (w.slice(-1) === '*') { if (String(h.id).indexOf(w.slice(0, -1)) === 0) return true; }
      else if (String(h.id) === w) return true;
    }
    return false;
  };
  /* 点中"高亮的那颗"才算过。swallow=true 时这一下**只推进引导、不执行原动作**
     （逐项介绍用：点一下"【境界】"只是听下一项，不该顺手把页面跳走）。 */
  const _dispatch = CV.dispatch;
  CV.dispatch = function (id) {
    const st = coachState;
    /* V9.6.95（自审：弹窗按钮点不动）：**弹窗比引导高一层**。
       引导在的时候这条派发会把"非高亮"的动作全吃掉 —— 弹窗自己的「确定 / 收下」
       也被一起吃了，于是"引导还挂着 + 弹窗弹出来"时玩家点不动弹窗，卡住。
       弹窗打开期间一律按原样派发：能不能点由触摸层那条"只放行弹窗按钮"把关。 */
    if (G.U && G.U.overlay) return _dispatch(id);
    /* V9.6.102（父亲大人："新手指引和任务引导又走错乱了"）：
       「去完成 / 领取奖励」是**玩家明确要求做这一步**，不是"路过顺手点了一下"。
       引导期间那条"点高亮那颗只推进引导、不执行动作"的规矩会把它们吃掉 ——
       于是点了没反应、页面没跳，屏幕上还挂着上一条引导（看着就是"引导讲的是上一件事"）。
       这两颗按钮一律直接执行：执行完 goQuest 会清掉旧引导、按新一步重新讲。 */
    if (id === 'goto_quest' || id === 'claim_quest') return _dispatch(id);
    if (!st || coachSuspended()) return _dispatch(id);   // 战斗页：按原样派发，不拦
    /* V9.6.66（父亲大人："引导时只能点高亮区域，不能点其他区域或滑动界面"）：
       这里原来是**漏的** —— 只有按下判定（hitAt）过滤了，真正执行动作的这条派发路
       直接 `return _dispatch(id)`，所以高亮期间点别处照样跳页（实测点到了"查看境界·渡劫"）。
       现在引导在 = 真模态：只有「高亮的那颗」和「跳过这一步」能派发，其余一律吃掉。 */
    if (id === '_coach_ok') return _dispatch(id);
    const want = [].concat(st.targetId);
    /* 锚点支持**前缀**（'eqd:*' / 'bup:*'）：动态 id 不可能写死，
       原来只认全等 → 这类锚点怎么点都不过，只能靠"跳过这一步"。 */
    const hit = want.some(function (w) {
      return (w.slice(-1) === '*') ? (id.indexOf(w.slice(0, -1)) === 0) : (id === w);
    });
    if (!hit) return true;                       // 点别处：吃掉，什么都不做
    /* V9.6.107（父亲大人："直接点高亮区域取消就行了"）：
       点中高亮那颗 = ①**执行它的动作**（点关卡就开打、点空格就上阵…）
                    + ②**把这条引导收掉**（不再留着把整页锁死）。
       以前分成"只推进"（swallow:true）和"等做完才放行"（waitFor）两条路，
       后者会把玩家锁在那一步上（高亮指错地方时就是死锁）。 */
    coachFunnel(st.key, 'tap', st._t0 ? (Date.now() - st._t0) : 0);
    U.coachMark(st);
    coachState = null;
    promoteCoach();
    const r = _dispatch(id);
    setTimeout(function () {
      /* V9.6.112（父亲大人："上阵也得上两个"）：这一下**可能已经把玩家带到下一页**，
         而那一页会在自己的 render 里登记一条新引导（比如挑人页的"点一个伙伴，他就上阵了"）。
         原来这里无条件 `U.coachNext()` —— 它会把**刚登记的那条**当成"当前这条"清掉，
         于是新页面上一条提示都没有，玩家看着一列名字不知道还要再点一下。
         现在：只有"没有新引导顶上来"时才推进队列。 */
      if (typeof st.onDone === 'function') st.onDone();
      else if (!coachState) U.coachNext();
      CV.render();                                   // 让新一步立刻画出来
    }, 0);
    return r;
  };
  U.drawCoach = function () {
    if (!coachState) return;
    if (coachSuspended()) return;                   // 战斗页不画引导（战斗自己的界面优先）
    /* 换页了就别再画（见 bornPage 的说明）：直接放下，**不标已读、也不跑 onDone**
       （跑 onDone 会误触发"退回上一层"，把玩家拽到更乱的地方）。 */
    if (coachState.bornPage && coachState.bornPage !== ((CV.top() || {}).name)) {
      coachFunnel(coachState.key, 'miss');     // 换页了：这一步这次没讲成
      coachState = null;
      promoteCoach();                          // V9.6.105：换页丢掉的这条之后，队列里的下一条要顶上来
      if (coachState) { setTimeout(function () { CV.render(); }, 0); }
      return;
    }
    /* V9.6.61（父亲大人拍板第 2 条：**做完才放行**）：
       带 waitFor 的引导，先问"这件事真做完了吗" —— 做完了就直接过、连提示都不留；
       没做完才继续挡着（并且每帧都在问，所以玩家一做完立刻放行，不用再点一次）。 */
    if (coachState.waitFor) {
      let done = false;
      try { done = !!coachState.waitFor(); } catch (e) { done = true; }   // 判定出错就别卡人
      if (done) { U.coachMark(coachState); U.coachNext(); return; }
    }
    const S = G.Core.S;
    const c = CV.ctx;
    /* 锚点：优先找非屏幕坐标（内容区）的那一颗，换算到屏幕 y */
    let r = null;
    const want = [].concat(coachState.targetId);
    /* 锚点支持"前缀"（写成 'bup:*'）：建筑升级、装备格这类 id 带后缀（bup:core / eqd:eq123），
       不可能写死，用前缀就能锚到"这一类"里的第一颗（V9.6.37）。 */
    /* V9.6.106（父亲大人："队伍上阵又上不了了"）：
       一条引导可以写**一串**锚点（'pslot:*, party_board'），以前是"按热区注册顺序取第一个命中的"——
       后注册的整块区域（party_board）会盖过前面的空格锚点，于是高亮指向一块**点不动的区域**，
       配"做完才放行"就把玩家卡死。
       现在**锚点列表的顺序说了算**：先拿第一个锚点去找热区，找不到才看第二个 ——
       写在前面的就是优先。 */
    const rectOf = function (h) {
      return h.screen ? { x: h.x, y: h.y, w: h.w, h: h.h }
        : { x: h.x, y: h.y - (CV.scroll || 0) + CV.TOP + 8, w: h.w, h: h.h };
    };
    for (let wi = 0; wi < want.length && !r; wi++) {
      const w = String(want[wi]);
      const hits = CV.hits || [];
      /* V9.6.112（真流程审计）：**前缀锚点取"登记顺序里的第一颗"**，不是最后一颗。
         热区是按绘制顺序登记的（第一行先登记），而"最后一颗"在列表尾部 ——
         于是 `fabao_buy:*` 高亮指向**最贵的那件法宝**、`garden_plant:*` 指向最后一垄地
         （种子最贵的那垄）：玩家点下去买不起，引导还赖着不走，
         看着就是"点了没反应、要连点好几下"。取第一颗＝最便宜/最前面那颗，才是玩家会先点的。 */
      for (let i = 0; i < hits.length; i++) {
        const id = String(hits[i].id);
        const ok = w.slice(-1) === '*' ? id.indexOf(w.slice(0, -1)) === 0 : id === w;
        if (ok) { r = rectOf(hits[i]); break; }
      }
    }
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
    /* V9.6.63（父亲大人："高亮没了、去别的界面又跳回来、回来也没高亮、不知道要干嘛"）：
       高亮只画在"目标就在本页"时；如果这一步的目标在**别的页**，就必须在提示卡里
       写清"去「XX」做这一步" —— 否则玩家只看到一张没有指向的卡。
       如果那一步的按钮**当前不可用**（比如资源不够），也照样写明，别让人对着一个不亮的按钮发呆。 */
    const textAll = coachState.text + ((!r && coachState.where) ? ('  → 去「' + coachState.where + '」完成这一步。') : '');
    const lines = CV.wrap(textAll, CV.W - 60 * CV.SCALE, CV.FS.lg, 6);
    /* V9.6.108（父亲大人："去了那个小字后框也没跟着缩上去"）：
       卡片高度原来按"上下各 22"算（44），其中下面那 22 是留给「跳过这一步」那行小字的。
       小字去掉之后，底部就多出一整条空白。现在按内容算：
         有高亮 → 底部只留 10；
         没高亮 → 底部留 20（那里还要写一行「点任意处继续 ›」）。 */
    const padBottom = r ? 10 : 20;
    const th = 22 * CV.SCALE + lines.length * CV.FS.lg * 1.7 + padBottom * CV.SCALE;
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
    /* V9.6.107（父亲大人："把引导的跳过这一步去掉，就直接点高亮区域取消就行了"）：
       · 不再有「跳过这一步」那颗按钮；
       · **点高亮区域本身就既执行动作、又把这个引导收掉**（见 CV.dispatch 里那条）；
       · 万一这一页连高亮都找不到（目标按钮是条件出现的，比如"突破铭刻"只在能突破时才有），
         就点**任意处继续** —— 绝不把玩家锁死（上一版就是"找不到高亮 + 那行小字在屏幕上很难看见"
         导致整页点不动）。 */
    c.restore();
    CV.hitMode = 'screen';
    if (!r) {
      CV.text('点任意处继续 ›', tx + tw - 14 * CV.SCALE, ty + th - 11 * CV.SCALE,
        { size: CV.FS.sm, color: CV.C.gold, align: 'right' });
      CV.hit('_coach_ok', 0, 0, CV.W, CV.H);
    }
    /* V9.6.68（资料 §5）：卡片真的画出来了 → 记一次「看过」并开始计时；
       没找到锚点（指不到那颗）另记一笔「没指到」，这是最该修的一种。 */
    coachState._t0 = Date.now();
    coachFunnel(coachState.key, 'view');
    if (!r) coachFunnel(coachState.key, 'miss');
    CV.hitMode = 'content';
  };
  /* 「跳过这一步」：标记已看并播下一条（**没有"整条跳过"** —— 父亲大人要的是完全强制） */
  CV.on('_coach_ok', function () {
    if (!coachState) return;
    coachFunnel(coachState.key, 'skip', coachState._t0 ? (Date.now() - coachState._t0) : 0);
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
    /* 所有 y 都由 U.confirm 排好版（o.titleY / o.lineY / o.chipY / o.noteY / o.btnY），
       这里只负责照着画 —— V9.6.94 起不再各算各的。 */
    const PAD = o.pad || 14 * CV.SCALE;
    CV.text(o.title, o.x + PAD, o.y + o.titleY, { size: CV.FS.f1, bold: true });
    o.lines.forEach((ln, i) => CV.text(ln, o.x + PAD, o.y + o.lineY[i], { size: CV.FS.lg, color: CV.C.dim }));
    /* 奖励胶囊（居中折行）——网页版 .reward-chips */
    (o.rows || []).forEach(function (row, ri) {
      const cy = o.y + o.chipY[ri];
      const total = row.reduce((s, c) => s + c.w, 0) + CHIP_GAP * (row.length - 1);
      let cx = o.x + (o.w - total) / 2;
      row.forEach(function (c) {
        CV.round(cx, cy - CHIP_H / 2, c.w, CHIP_H, 999, CV.C.panel2, CV.C.line);
        CV.text(c.t, cx + c.w / 2, cy, { size: CV.FS.sm, align: 'center', color: CV.C.gold });
        cx += c.w + CHIP_GAP;
      });
    });
    /* 说明小字 */
    (o.note || []).forEach(function (ln, i) {
      CV.text(ln, o.x + o.w / 2, o.y + o.noteY[i], { size: CV.FS.xs, align: 'center', color: CV.C.dim });
    });
    const by = o.y + o.btnY;
    const bw = (o.w - PAD * 2 - 10 * CV.SCALE) / 2;
    /* 确认弹窗画在**屏幕坐标**里（内容区已经 restore），命中区也要按屏幕坐标登记。
       V9.6.95：这里是**真模态** —— 用 'overlay' 模式登记，触摸层会只放行这两颗按钮，
       底栏/顶栏/吸顶条在弹窗打开期间一律不吃点击（以前弹窗开着还能点底栏换页）。 */
    CV.hitMode = 'overlay';
    if (o.single) {
      U.btn(o.x + PAD, by, o.w - PAD * 2, 44 * CV.SCALE, o.okLabel || '确定', 'primary', '_cf_yes');
    } else {
      U.btn(o.x + PAD, by, bw, 44 * CV.SCALE, '取消', 'ghost', '_cf_no');
      U.btn(o.x + PAD + bw + 10 * CV.SCALE, by, bw, 44 * CV.SCALE, o.okLabel || '确定', 'primary', '_cf_yes');
    }
    CV.hitMode = 'content';
  };
})();
