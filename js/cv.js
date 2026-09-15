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
  C: {
    bg: '#0a0d13', panel: '#141a24', panel2: '#1c2432', line: '#2a3446',
    text: '#e6edf7', dim: '#8b98ad', gold: '#ffd76a', accent: '#d43a4f', green: '#7ee0a3', red: '#ff6b6b',
  },
};

/* 自适应：按窗口宽度算缩放（平板上按 520 宽封顶并居中，跟网页版的 max-width:520px 一致），
   同时把刘海与底部小黑条留出来 —— 这两块用物理像素处理，不参与缩放。 */
CV.setup = function (info) {
  const W = info.windowWidth || 375;
  const H = info.windowHeight || 812;
  const sa = info.safeArea || null;
  CV.pxW = W; CV.pxH = H;
  CV.topInset = sa && sa.top ? sa.top : 0;
  CV.bottomInset = sa && sa.bottom != null ? Math.max(0, H - sa.bottom) : 0;
  CV.scale = Math.min(520 / 375, W / 375);            // 上限 520/375 ≈ 1.39（平板别铺满）
  CV.ox = Math.round((W - 375 * CV.scale) / 2);
  CV.W = 375;
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
  c.fillStyle = opt.fill || CV.C.panel;
  rrect(x, y, w, h, opt.r == null ? 12 : opt.r);
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
function addHit(id, x, y, w, h) { if (id) CV.hits.push({ id, x, y, w, h }); }

/* ---------- 排版游标（业务层只跟它打交道） ---------- */
const L = {
  y: 0,
  at(v) { this.y = v; return this; },
  gap(n) { this.y += (n == null ? 8 : n); return this; },
  /* 段落标题 */
  title(str, sub) {
    drawText(str, 16, this.y + 10, { size: 15, bold: true, color: CV.C.gold });
    if (sub) drawText(sub, CV.W - 16, this.y + 10, { size: 11, align: 'right', color: CV.C.dim });
    this.y += 26;
    return this;
  },
  /* 纯说明文字 */
  text(str, opt) {
    opt = opt || {};
    const size = opt.size || 13;
    const lines = String(str).split('\n');
    lines.forEach(ln => {
      drawText(ln, opt.x || 16, this.y + size / 2 + 2, { size, color: opt.color || CV.C.text, bold: opt.bold, align: opt.align });
      this.y += size + 6;
    });
    this.y += 2;
    return this;
  },
  /* 列表行：左边主标题+副标题，右边值；带 id 就能点 */
  row(label, sub, opt) {
    opt = opt || {};
    const h = sub ? 54 : 44;
    fillPanel(12, this.y, CV.W - 24, h, { fill: opt.disabled ? CV.C.panel : CV.C.panel });
    drawText(label, 24, this.y + (sub ? 20 : h / 2), { size: 14, bold: !!opt.bold, color: opt.disabled ? CV.C.dim : CV.C.text });
    if (sub) drawText(sub, 24, this.y + 38, { size: 11, color: CV.C.dim });
    if (opt.value) drawText(opt.value, CV.W - 24, this.y + (sub ? 20 : h / 2), { size: 13, align: 'right', color: opt.valueColor || CV.C.gold });
    if (opt.right) drawText(opt.right, CV.W - 24, this.y + (sub ? 38 : h / 2), { size: 11, align: 'right', color: CV.C.dim });
    if (opt.id && !opt.disabled) addHit(opt.id, 12, this.y, CV.W - 24, h);
    this.y += h + 8;
    return this;
  },
  /* 按钮：整行 */
  btn(label, id, opt) {
    opt = opt || {};
    const h = opt.h || 44;
    const w = opt.w || (CV.W - 32);
    const x = opt.x != null ? opt.x : (CV.W - w) / 2;
    CV.ctx.fillStyle = opt.disabled ? CV.C.panel : (opt.primary ? CV.C.accent : CV.C.panel2);
    rrect(x, this.y, w, h, 10);
    CV.ctx.fill();
    CV.ctx.strokeStyle = CV.C.line;
    CV.ctx.stroke();
    drawText(label, x + w / 2, this.y + h / 2, { size: opt.size || 14, bold: true, align: 'center', color: opt.disabled ? CV.C.dim : CV.C.text });
    if (id && !opt.disabled) addHit(id, x, this.y, w, h);
    this.y += h + 8;
    return this;
  },
  /* 一排按钮 */
  btnRow(list) {
    const n = list.length, gap = 8, w = (CV.W - 32 - gap * (n - 1)) / n;
    list.forEach((b, i) => {
      const x = 16 + i * (w + gap);
      const h = b.h || 40;
      CV.ctx.fillStyle = b.disabled ? CV.C.panel : (b.primary ? CV.C.accent : CV.C.panel2);
      rrect(x, this.y, w, h, 10);
      CV.ctx.fill();
      CV.ctx.strokeStyle = CV.C.line;
      CV.ctx.stroke();
      drawText(b.label, x + w / 2, this.y + h / 2, { size: b.size || 13, bold: true, align: 'center', color: b.disabled ? CV.C.dim : CV.C.text });
      if (b.id && !b.disabled) addHit(b.id, x, this.y, w, h);
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
  drawText(st, CV.W / 2, CV.TOP / 2 + 4, { size: 12, align: 'center', color: CV.C.text });

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
CV.fillPanel = fillPanel;
CV.drawText = drawText;
CV.addHit = addHit;

module.exports = CV;
