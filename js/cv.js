/* Canvas 界面框架（小游戏没有 DOM，界面全靠画）
   ------------------------------------------------------------------------
   立即模式 + 排版游标：面板函数从 L.y 开始往下画，每画一个控件 y 自动往下走；
   触摸时反查 hits[] 派发。滚动由框架统一处理（内容高于可视区时手指拖动）。

   这一层只认三件事：**怎么画、怎么滚动、点到谁**。业务全在 screens.js 里。
*/
const CV = {
  /* 设计坐标：所有界面代码都按"375 宽"这套设计尺寸写，
     真机上由 setup() 算出缩放与居中偏移，在 draw 里统一 transform —— 这样界面代码一行都不用改。
     W/H 是"设计尺寸"，不是物理像素。 */
  W: 375, H: 812, TOP: 30, NAV_H: 62,
  pxW: 375, pxH: 812, scale: 1, ox: 0, topInset: 0, bottomInset: 0,
  ctx: null, DPR: 2,
  stack: [], hits: [], toasts: [],
  panels: {},
  /* 配色照抄网页版 css/style.css 的 :root */
  C: {
    bg: '#07090e', bg2: '#0b0e15',
    panel: '#111621', panel2: '#161d2a', panel3: '#1d2534',
    line: '#232b3b', line2: '#333e55',
    text: '#e9edf6', text2: '#b6bfd0', dim: '#7a849b',
    accent: '#d43a4f', accent2: '#97273a', gold: '#e6b64c', green: '#56c894', blue: '#6ec6ff',
    red: '#d43a4f',
  },
  RADIUS: 10,
  RADIUS_SM: 7,
};

/* 自适应：按窗口宽度缩放，平板按 520 宽封顶并居中；刘海与底部安全区按物理像素留白 */
CV.setup = function (info) {
  const W = info.windowWidth || 375;
  const H = info.windowHeight || 812;
  const sa = info.safeArea || null;
  CV.pxW = W; CV.pxH = H;
  CV.topInset = sa && sa.top ? sa.top : 0;
  CV.bottomInset = sa && sa.bottom != null ? Math.max(0, H - sa.bottom) : 0;
  /* 父亲大人定的路线 A 重做：**按真实宽度排版**（和网页版一样，不是"375 设计 + 整体缩放"）。
     网页版的容器上限是 520（#app max-width），这里照抄；超出部分居中留白。 */
  CV.scale = 1;
  CV.W = Math.min(520, W);
  CV.ox = Math.round((W - CV.W) / 2);
  // 设计高度 = 可用物理高度 / 缩放；太矮的设备给个下限，避免界面被压扁
  CV.H = Math.max(560, Math.round((H - CV.topInset - CV.bottomInset) / CV.scale));
  CV.TOP = 30;
  CV.NAV_H = 62;
  return CV;
};
// 物理坐标 → 设计坐标（触摸用）
CV.toDesign = (x, y) => ({ x: (x - CV.ox) / CV.scale, y: (y - CV.topInset) / CV.scale });

CV.register = (name, fn) => { CV.panels[name] = fn; };
CV.open = (name, params) => { CV.stack.push({ name, params: params || {}, scroll: 0 }); };
CV.reset = (name, params) => { CV.stack = [{ name, params: params || {}, scroll: 0 }]; };
CV.back = () => { if (CV.stack.length > 1) CV.stack.pop(); };
CV.top = () => CV.stack[CV.stack.length - 1] || null;

function toast(msg) {
  CV.toasts.push({ msg, at: Date.now() });
  if (CV.toasts.length > 3) CV.toasts.shift();
}
function fmt(n) {
  n = Math.floor(n || 0);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
}
function hhmmss(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (h) return `${h}小时${m}分`;
  if (m) return `${m}分${s}秒`;
  return `${s}秒`;
}
/* 颜色标注的稀有度文本，例如 [SSR] 用金色 */
function rarityColor(r) {
  return { N: '#9aa4b2', R: '#4da3ff', SR: '#b06bff', SSR: '#ffb03a', UR: '#ff4d6d' }[r] || CV.C.text;
}

/* ---------- 绘制原语 ---------- */
function rrect(x, y, w, h, r) {
  const c = CV.ctx;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function fillPanel(x, y, w, h, opt) {
  const c = CV.ctx; opt = opt || {};
  // opt.grad = [上色, 下色] → 与网页版卡片/按钮的 linear-gradient(180deg,…) 同款
  let painted = false;
  if (opt.grad && c.createLinearGradient) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    if (g && g.addColorStop) {
      g.addColorStop(0, opt.grad[0]); g.addColorStop(1, opt.grad[1]);
      c.fillStyle = g; painted = true;
    }
  }
  if (!painted) c.fillStyle = opt.fill || opt.grad && opt.grad[0] || CV.C.panel;
  rrect(x, y, w, h, opt.r == null ? CV.RADIUS : opt.r);
  c.fill();
  c.strokeStyle = opt.line || CV.C.line;
  c.lineWidth = 1;
  c.stroke();
}
function drawText(str, x, y, opt) {
  const c = CV.ctx; opt = opt || {};
  c.fillStyle = opt.color || CV.C.text;
  c.font = `${opt.bold ? 'bold ' : ''}${opt.size || 14}px sans-serif`;
  c.textAlign = opt.align || 'left';
  c.textBaseline = 'middle';
  c.fillText(String(str), x, y);
}
/* 文字宽度约束：超长截断 / 折行 */
function measure(str, size, bold) {
  const c = CV.ctx;
  try {
    c.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    const m = c.measureText ? c.measureText(String(str)) : null;
    if (m && m.width) return m.width;
  } catch (e) { /* 没有真 canvas 时用估算 */ }
  // 估算：中文按一个字号宽，英文/数字按 0.55
  let w = 0;
  for (const ch of String(str)) w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? size : size * 0.55;
  return w;
}
// 超长就截断加省略号（列表标签、按钮文字用）
function fitText(str, maxW, size, bold) {
  str = String(str);
  if (maxW <= 0) return '';
  if (measure(str, size, bold) <= maxW) return str;
  let s = str;
  while (s.length > 1 && measure(s + '…', size, bold) > maxW) s = s.slice(0, -1);
  return s + '…';
}
// 长段落按宽度折行（段落文字用）
function wrapText(str, maxW, size, bold) {
  const out = [];
  String(str).split('\n').forEach(par => {
    let line = '';
    for (const ch of par) {
      if (line && measure(line + ch, size, bold) > maxW) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  });
  return out;
}
function addHit(id, x, y, w, h) { if (id) CV.hits.push({ id, x, y, w, h }); }
// 按下反馈（网页版是 transform: scale(.97)）：按到哪个按钮，就把它画小一点点
function isPressed(id) { return !!id && CV.pressedId === id && (Date.now() - (CV.pressedAt || 0)) < 160; }
CV.pressedId = null; CV.pressedAt = 0;

/* ---------- 排版游标（业务层只跟它打交道） ---------- */
const L = {
  y: 0,
  at(v) { this.y = v; return this; },
  gap(n) { this.y += (n == null ? 8 : n); return this; },
  /* 段落标题 */
  title(str, sub) {
    // 与网页版 .section-title 同款：12px 灰字 + 右边一条渐隐细线（不是金色大字）
    this.y += 8;
    drawText(str, 16, this.y + 8, { size: 12, bold: true, color: CV.C.text2 });
    const m = CV.ctx.measureText ? CV.ctx.measureText(str) : null;
    const tw = (m && m.width) ? m.width : String(str).length * 12;
    const lineX = 16 + tw + 10;
    const grad = CV.ctx.createLinearGradient ? CV.ctx.createLinearGradient(lineX, 0, CV.W - 16, 0) : null;
    if (grad) { grad.addColorStop(0, CV.C.line2); grad.addColorStop(1, 'rgba(0,0,0,0)'); CV.ctx.strokeStyle = grad; }
    else CV.ctx.strokeStyle = CV.C.line2;
    CV.ctx.lineWidth = 1;
    CV.ctx.beginPath();
    CV.ctx.moveTo(lineX, this.y + 8);
    CV.ctx.lineTo(CV.W - 16, this.y + 8);
    CV.ctx.stroke();
    if (sub) drawText(sub, CV.W - 16, this.y + 24, { size: 10, align: 'right', color: CV.C.dim });
    this.y += (sub ? 38 : 24);
    return this;
  },
  /* 纯说明文字 */
  text(str, opt) {
    opt = opt || {};
    const size = opt.size || 13;
    // 居中要按**屏幕中心**，不能按左边距——旧版这里 `align:'center'` 是拿 x=16 当中心，
    // 于是名字这类居中文字被画到屏幕左边外面去了（父亲大人截图里的「白泽」）。
    const x = opt.x !== undefined ? opt.x : (opt.align === 'center' ? CV.W / 2 : 16);
    const maxW = (opt.maxW || (CV.W - 16 - (opt.align === 'center' ? 16 : x)));
    const lines = wrapText(str, maxW, size, opt.bold);   // 折行，不再画出屏幕
    lines.forEach(ln => {
      drawText(ln, x, this.y + size / 2 + 2, { size, color: opt.color || CV.C.text, bold: opt.bold, align: opt.align });
      this.y += size + 6;
    });
    this.y += 2;
    return this;
  },
  /* 列表行：左边主标题+副标题，右边值；带 id 就能点 */
  row(label, sub, opt) {
    opt = opt || {};
    const h = sub ? 54 : 44;
    // 卡片：网页版 .card 是浅渐变 + 1px 描边
    fillPanel(12, this.y, CV.W - 24, h, { grad: [CV.C.panel, '#0e1420'], line: CV.C.line });
    const valueW = opt.value ? measure(opt.value, 13) + 12 : 0;
    // opt.icon：左侧一个圆角方块图标（网页版世界行的 🧟👻 那种）
    const iconW = opt.icon ? 40 : 0;
    if (opt.icon) {
      fillPanel(24, this.y + (h - 34) / 2, 34, 34, { fill: '#1a2230', line: CV.C.line, r: 8 });
      drawText(opt.icon, 41, this.y + h / 2, { size: 18, align: 'center' });
    }
    const x0 = 24 + iconW;
    const labelW = CV.W - 24 - x0 - valueW;              // 左右各留 24 的边距
    drawText(fitText(label, labelW, 14, !!opt.bold), x0, this.y + (sub ? 20 : h / 2), { size: 14, bold: !!opt.bold, color: opt.disabled ? CV.C.dim : CV.C.text });
    if (sub) drawText(fitText(sub, CV.W - 24 - x0, 11), x0, this.y + 38, { size: 11, color: CV.C.dim });
    if (opt.value) drawText(opt.value, CV.W - 24, this.y + (sub ? 20 : h / 2), { size: 13, align: 'right', color: opt.valueColor || CV.C.gold });
    if (opt.right) drawText(fitText(opt.right, CV.W - 48, 11), CV.W - 24, this.y + (sub ? 38 : h / 2), { size: 11, align: 'right', color: CV.C.dim });
    if (opt.id && !opt.disabled) addHit(opt.id, 12, this.y, CV.W - 24, h);
    this.y += h + 8;
    return this;
  },
  /* 按钮：整行 */
  btn(label, id, opt) {
    opt = opt || {};
    const h = opt.h || 44;
    const full = opt.w || (CV.W - 32);
    const press = isPressed(id);
    const w = full - (press ? 6 : 0);
    const x = (opt.x != null ? opt.x : (CV.W - full) / 2) + (press ? 3 : 0);
    // 与网页版 .btn 对齐：圆角 7、描边 line2；primary / gold 是 180deg 渐变，ghost 透明底
    const style = opt.disabled ? { fill: CV.C.panel, line: CV.C.line }
      : opt.primary ? { grad: ['#c9364a', CV.C.accent2], line: '#e05a6d40' }
        : opt.gold ? { grad: ['#b98d2a', '#87631a'], line: '#e6b64c44' }
          : opt.ghost ? { fill: 'transparent', line: CV.C.line }
            : { fill: CV.C.panel2, line: CV.C.line2 };
    fillPanel(x, this.y + (press ? 1 : 0), w, h - (press ? 2 : 0), Object.assign({ r: CV.RADIUS_SM }, style));
    drawText(fitText(label, w - 14, opt.size || 13, true), x + w / 2, this.y + h / 2, {
      size: opt.size || 13, bold: true, align: 'center',
      color: opt.disabled ? CV.C.dim : (opt.gold ? '#fdf3dc' : (opt.ghost ? CV.C.text2 : CV.C.text)),
    });
    if (id && !opt.disabled) addHit(id, x, this.y, w, h);
    this.y += h + 8;
    return this;
  },
  /* 一排按钮 */
  btnRow(list) {
    const n = list.length, gap = 8, w = (CV.W - 32 - gap * (n - 1)) / n;
    list.forEach((b, i) => {
      const press = isPressed(b.id);
      const x = 16 + i * (w + gap) + (press ? 2 : 0);
      const bh = b.h || 40;
      const style = b.disabled ? { fill: CV.C.panel, line: CV.C.line }
        : b.primary ? { grad: ['#c9364a', CV.C.accent2], line: '#e05a6d40' }
          : b.gold ? { grad: ['#b98d2a', '#87631a'], line: '#e6b64c44' }
            : { fill: CV.C.panel2, line: CV.C.line2 };
      fillPanel(x, this.y + (press ? 1 : 0), w - (press ? 4 : 0), bh - (press ? 2 : 0), Object.assign({ r: CV.RADIUS_SM }, style));
      drawText(fitText(b.label, w - 10, b.size || 12, true), x + w / 2, this.y + bh / 2, { size: b.size || 12, bold: true, align: 'center', color: b.disabled ? CV.C.dim : CV.C.text });
      if (b.id && !b.disabled) addHit(b.id, x, this.y, w, bh);
    });
    this.y += (list[0] && list[0].h || 40) + 8;
    return this;
  },
  /* 网格（关卡格子 / 背包格子） */
  grid(cols, cells, opt) {
    opt = opt || {};
    const gap = 8, w = (CV.W - 32 - gap * (cols - 1)) / cols, h = opt.h || w;
    cells.forEach((cell, i) => {
      const cx = 16 + (i % cols) * (w + gap);
      const cy = this.y + Math.floor(i / cols) * (h + gap);
      if (!cell) { fillPanel(cx, cy, w, h, { fill: '#0f141d' }); return; }
      fillPanel(cx, cy, w, h, { fill: cell.done ? '#1d2b22' : (cell.bg || CV.C.panel2), line: cell.boss ? CV.C.accent : CV.C.line });
      // 名字太长就折两行（背包格子里很常见：初级经验模块）
      const lines = String(cell.label).split('\n').slice(0, 2);
      const baseY = cy + h / 2 - (cell.sub ? 6 : 0) - (lines.length > 1 ? 8 : 0);
      lines.forEach((ln, i) => {
        drawText(ln, cx + w / 2, baseY + i * 13, { size: cell.size || 15, bold: true, align: 'center', color: cell.color || CV.C.text });
      });
      if (cell.sub) drawText(cell.sub, cx + w / 2, cy + h - 12, { size: 9, align: 'center', color: CV.C.gold });
      if (cell.id && !cell.disabled) addHit(cell.id, cx, cy, w, h);
    });
    this.y += Math.ceil(cells.length / cols) * (h + gap);
    return this;
  },
  /* 文字宫格（网页版 .text-menu）：3 列，名字 + 状态，右上角可带红点 */
  tiles(items, cols) {
    const n = cols || 3, gap = 8, h = 56;
    const w = (CV.W - 32 - gap * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = 16 + (i % n) * (w + gap);
      const y = this.y + Math.floor(i / n) * (h + gap);
      fillPanel(x, y, w, h, { fill: CV.C.panel, line: CV.C.line2, r: 6 });
      const sub = it.sub ? (it.sub.length > 12 ? it.sub.slice(0, 12) : it.sub) : '';
      drawText(fitText(it.label, w - 8, 13, true), x + w / 2, y + (sub ? 21 : h / 2), { size: 13, bold: true, align: 'center', color: it.disabled ? CV.C.dim : CV.C.text });
      if (sub) drawText(fitText(sub, w - 8, 10), x + w / 2, y + 38, { size: 10, align: 'center', color: CV.C.dim });
      if (it.dot) {
        CV.ctx.fillStyle = CV.C.accent;
        CV.ctx.beginPath();
        if (CV.ctx.arc) CV.ctx.arc(x + w - 11, y + 11, 3, 0, Math.PI * 2);
        CV.ctx.fill();
      }
      if (it.id && !it.disabled) addHit(it.id, x, y, w, h);
    });
    this.y += Math.ceil(Math.max(1, items.length) / n) * (h + gap) + 2;
    return this;
  },
  /* 进度条 */
  meter(pct, label, opt) {
    opt = opt || {};
    const h = opt.h || 10, w = CV.W - 32;
    CV.ctx.fillStyle = '#0f141d';
    rrect(16, this.y, w, h, h / 2); CV.ctx.fill();
    CV.ctx.fillStyle = opt.color || CV.C.gold;
    rrect(16, this.y, Math.max(2, w * Math.max(0, Math.min(1, pct || 0))), h, h / 2); CV.ctx.fill();
    if (label) {
      drawText(label, 16, this.y + h / 2, { size: 9, color: '#0a0d13' });
      this.y += h + 4;
    } else this.y += h + 4;
    return this;
  },
  /* 空行占位 */
  spacer(h) { this.y += (h == null ? 16 : h); return this; },
};

/* ---------- 主绘制 ---------- */
CV.draw = function () {
  const c = CV.ctx;
  CV.hits = [];
  // 每次重画都从"物理像素 → DPR"这一层开始，避免 transform 叠加
  c.setTransform(CV.DPR, 0, 0, CV.DPR, 0, 0);
  c.fillStyle = CV.C.bg;
  c.fillRect(0, 0, CV.pxW, CV.pxH);            // 先铺满物理屏（上下留白也是这个底色）
  // 进入"设计坐标"：平移出刘海与居中偏移，再按设备宽度缩放
  c.save();
  c.translate(CV.ox, CV.topInset);
  c.scale(CV.scale, CV.scale);

  const top = CV.top();
  // 顶栏
  fillPanel(0, 0, CV.W, CV.TOP + 2, { r: 0, line: 'rgba(0,0,0,0)' });
  const st = (CV.statusText && CV.statusText()) || '';
  drawText(fitText(st, CV.W - 16, 12), CV.W / 2, CV.TOP / 2 + 4, { size: 12, align: 'center', color: CV.C.text });
  // 顶栏点一下 = 打开货币图鉴（网页版也是这个交互）
  addHit('open_curdoc', 0, 0, CV.W, CV.TOP);

  if (top) {
    const panel = CV.panels[top.name];
    const viewH = CV.H - CV.TOP - CV.NAV_H;
    // 二级页顶部有返回条：正文本来就得从返回条下面开始，否则第一行会被盖住
    const barH = CV.stack.length > 1 ? 46 : 0;
    c.save();
    c.beginPath();
    c.rect(0, CV.TOP + barH, CV.W, viewH - barH);
    c.clip();
    c.translate(0, -top.scroll);
    L.at(CV.TOP + barH + 10);
    if (panel) {
      CV.lastError = null;
      try { panel(top.params); } catch (e) {
        // 界面出错不能静默：记下来（测试会断言它必须是 null），同时画在屏幕上让玩家看得见
        CV.lastError = { panel: top.name, message: e && e.message, stack: e && e.stack };
        drawText('界面出错：' + (e && e.message), 16, CV.TOP + 30, { size: 12, color: CV.C.red });
        top.contentH = CV.TOP + 60;
      }
    }
    top.contentH = Math.max(L.y, viewH + CV.TOP + barH);
    c.restore();
    top.maxScroll = Math.max(0, top.contentH - (CV.TOP + viewH));
    if (top.scroll > top.maxScroll) top.scroll = top.maxScroll;
  }

  // 底部导航
  const tabs = CV.tabs || [];
  if (tabs.length) {
    fillPanel(0, CV.H - CV.NAV_H, CV.W, CV.NAV_H, { r: 0 });
    const tw = CV.W / tabs.length;
    tabs.forEach((t, i) => {
      const x = i * tw;
      const active = CV.stack.length === 1 && CV.top() && CV.top().name === t.panel;
      // 网页版选中态：顶部一道 26×2 的金色小横条（.nav-item.active::before）
      if (active) {
        CV.ctx.fillStyle = CV.C.gold;
        rrect(x + tw / 2 - 13, CV.H - CV.NAV_H, 26, 2, 1);
        CV.ctx.fill();
      }
      drawText(t.name, x + tw / 2, CV.H - CV.NAV_H / 2, { size: 14, bold: active, align: 'center', color: active ? CV.C.gold : CV.C.dim });
      addHit('nav_' + t.panel, x, CV.H - CV.NAV_H, tw, CV.NAV_H);
    });
  }
  // 二级页的返回条（浮在顶部）
  if (CV.stack.length > 1) {
    fillPanel(0, CV.TOP, CV.W, 44, { r: 0 });
    drawText('‹ 返回', 20, CV.TOP + 22, { size: 14, color: CV.C.gold });
    addHit('back', 0, CV.TOP, 90, 44);
    const title = (CV.panels.titleOf && CV.panels.titleOf(CV.top())) || '';
    if (title) drawText(title, CV.W / 2, CV.TOP + 22, { size: 14, bold: true, align: 'center' });
  }

  // 提示
  CV.toasts = CV.toasts.filter(t => Date.now() - t.at < 2600);
  CV.toasts.forEach((t, i) => {
    const y = CV.H - CV.NAV_H - 34 - i * 32;
    CV.ctx.fillStyle = 'rgba(20,26,36,.95)';
    rrect(24, y - 15, CV.W - 48, 30, 15); CV.ctx.fill();
    drawText(t.msg, CV.W / 2, y, { size: 12, align: 'center', color: CV.C.gold });
  });
  c.restore();
};

/* ---------- 触摸 ---------- */
CV._touch = null;
CV.onTouchStart = function (x, y) {
  const d = CV.toDesign(x, y);
  CV._touch = { x0: d.x, y0: d.y, y: d.y, moved: false, scrolled: false };
  // 按下的那一刻先记下"按到了谁"，用来做缩放反馈（手指一离开就恢复）
  for (let i = CV.hits.length - 1; i >= 0; i--) {
    const h = CV.hits[i];
    if (d.x >= h.x && d.x <= h.x + h.w && d.y >= h.y && d.y <= h.y + h.h) { CV.pressedId = h.id; CV.pressedAt = Date.now(); return; }
  }
  CV.pressedId = null;
};
CV.onTouchMove = function (x, y) {
  const t = CV._touch, top = CV.top();
  if (!t || !top) return;
  const d = CV.toDesign(x, y);
  const dy = t.y - d.y;
  if (Math.abs(d.y - t.y0) > 8) t.moved = true;
  if (t.moved) {
    top.scroll = Math.max(0, Math.min(top.maxScroll || 0, top.scroll + dy));
    t.scrolled = true;
  }
  t.y = d.y;
};
CV.onTouchEnd = function (x, y) {
  const t = CV._touch;
  CV._touch = null;
  if (!t || t.scrolled) return;
  const d = CV.toDesign(x, y);
  for (let i = CV.hits.length - 1; i >= 0; i--) {
    const h = CV.hits[i];
    if (d.x >= h.x && d.x <= h.x + h.w && d.y >= h.y && d.y <= h.y + h.h) return CV.dispatch(h.id);
  }
};
CV.dispatch = function (id) {
  if (id === 'back') { CV.back(); return; }
  if (id.indexOf('nav_') === 0) { CV.reset(id.slice(4)); return; }
  const handler = CV.actions[id];
  if (handler) { handler(); return; }
  // 前缀型处理（装备 uid / 角色 id 这类动态生成的 id 用这个，避免为每一条数据都注册一遍）
  const hit = CV.prefixes.find(p => id.indexOf(p.prefix) === 0);
  if (hit) { hit.fn(id); return; }
  toast('（这个入口还没接上）');
};
CV.actions = {};   // id → 处理函数，业务层往这里注册
CV.on = (id, fn) => { CV.actions[id] = fn; };
CV.prefixes = [];
CV.onPrefix = (prefix, fn) => { CV.prefixes.push({ prefix, fn }); CV.prefixes.sort((a, b) => b.prefix.length - a.prefix.length); };

CV.fmt = fmt;
CV.hhmmss = hhmmss;
CV.toast = toast;
CV.L = L;
CV.rarityColor = rarityColor;
// 稀有度颜色直接取 data.js 那一份，保证两版一字不差
CV.rarityColorOf = function (r) {
  const D = (typeof window !== 'undefined' && window.DATA) || null;
  return (D && D.RARITY_COLOR && D.RARITY_COLOR[r]) || rarityColor(r);
};
CV.fillPanel = fillPanel;
CV.drawText = drawText;
CV.addHit = addHit;
CV.fitText = fitText;      // 业务层（战斗单位等）也要用
CV.measure = measure;

module.exports = CV;
