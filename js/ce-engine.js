/* 路线 B（引擎渲染）· 引擎管道（所有页面共用）
   ------------------------------------------------------------------------------
   一页从"标记文本"到"画在屏幕上"要过的几道手续，全在这里：
     ① 预处理：行内样式→类名、每个元素补上下文类名（js/ce-context.js）
     ② 折算：百分比宽度按真实画布宽算成像素（js/ce-fit.js）
     ③ 自检：模板里的元素在样式表里查得到吗（查不到=整套样式都没有→黑底黑字）
     ④ 渲染：updateViewPort → init(标记, 样式表) → 钉住根节点尺寸 → layout
     ⑤ 补一刀：滚动区高度（css-layout 的 flexShrink 默认 0，内容一高就把底栏顶出屏幕）
*/
const Engine = require('./lib/canvas-engine.js');
const CTX = require('./ce-context.js');
const CEFit = require('./ce-fit.js');
const STYLE = require('./ce-style.js');

let Layout = Engine && (Engine.default || Engine.Layout || Engine);
if (Layout && Layout.__esModule) Layout = Layout.default;

function available() { return !!Layout && typeof Layout.init === 'function'; }

/* 逻辑像素 → 画布：主画布按 dpr 建，再 scale 一次，之后坐标都按逻辑像素写 */
function setupCanvas(withDpr) {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const W = info.windowWidth, H = info.windowHeight;
  const dpr = withDpr === false ? 1 : (info.pixelRatio || 1);
  const canvas = wx.createCanvas();
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx.scale) ctx.scale(dpr, dpr);
  return { canvas, ctx, W, H, dpr };
}

function screenOf(LayoutInst, cls) {
  let found = null;
  (function walk(el) {
    if (found) return;
    if ((el.className || '').split(/\s+/).indexOf(cls) >= 0) { found = el; return; }
    (el.children || []).forEach(walk);
  })(LayoutInst.children[0]);
  return found;
}

function flatten(LayoutInst) {
  const out = [];
  (function walk(el) { out.push(el); (el.children || []).forEach(walk); })(LayoutInst.children[0]);
  return out;
}

function renderPage(ctx, W, H, markup) {
  const prepared = CTX.prepare(markup);

  /* 先算一张"内在宽度表"：文字元素用真画布实测，容器取子级最大值 + 左右内边距。
     折算层分配弹性宽度时用它，替代"按字数估"——不写死任何尺寸数值。 */
  const nodes = [];
  CTX.walk(prepared.xml, (node) => nodes.push(node));
  const raw0 = CEFit.fit(STYLE, W, H);          // 先拿一份（只为读字号/内边距）
  const intrinsic = {};
  nodes.forEach((node) => {
    const st = raw0[node.path] || {};
    const v = node.attrs && node.attrs.value;
    let w = 0;
    if (v) {
      const m = CEFit.measureText(v, st.fontSize, st.fontWeight);
      w = m !== null ? m : (st.__textW || 0);
    }
    intrinsic[node.path] = Math.max(intrinsic[node.path] || 0, w);
  });
  for (let i = nodes.length - 1; i >= 0; i--) {           // 后序：子级先算完
    const node = nodes[i];
    const st = raw0[node.path] || {};
    const pad = (st.paddingLeft || 0) + (st.paddingRight || 0);
    if (intrinsic[node.path] && !pad) continue;
    const parentPath = node.path.slice(0, node.path.lastIndexOf('__'));
    if (parentPath) intrinsic[parentPath] = intrinsic[parentPath] || 0;
    if (parentPath) intrinsic[parentPath] = Math.max(intrinsic[parentPath], (intrinsic[node.path] || 0) + pad);
  }

  const styleSheet = CEFit.fit(STYLE, W, H, intrinsic);

  /* 自检：查不到上下文的元素 = 整套样式都没有（引擎按默认值画：黑底黑字、边距全丢） */
  const missing = [];
  CTX.walk(prepared.xml, (node) => { if (!styleSheet[node.path]) missing.push(node.path); });
  /* 兜底：某个状态下的类名组合没编进样式表时，从"最近的、存在的祖先上下文"继承文字样式。
     不然那个元素整套样式都没有 → 引擎按默认值画 = 黑底黑字（父亲大人截图里的那个）。 */
  const INHERIT = ['color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign', 'whiteSpace', 'wordBreak', 'textOverflow'];
  const inheritFrom = (path) => {
    let p2 = path;
    for (let i = 0; i < 12; i++) {
      const cut = p2.lastIndexOf('__');
      if (cut < 0) break;
      p2 = p2.slice(0, cut);
      const src = styleSheet[p2];
      if (src) {
        const st = {};
        INHERIT.forEach((k) => { if (src[k] !== undefined) st[k] = src[k]; });
        if (Object.keys(st).length) styleSheet[path] = st;
        return;
      }
    }
  };
  missing.forEach(inheritFrom);
  if (missing.length) {
    /* 兜底：把这些元素身上的行内样式（颜色 / 透明度这些）当场折一份挂到它们的类名上——
       上下文没了，但至少字是白的，不会"黑底黑字看不见"。 */
    Object.keys(prepared.inlines).forEach((cls) => {
      if (styleSheet[cls]) return;
      const st = CTX.inlineToStyle(prepared.inlines[cls]);
      if (Object.keys(st).length) styleSheet[cls] = st;
    });
    console.warn(`[CE] ${missing.length} 个元素的上下文样式没编进 ce-style.js（已用行内样式兜底，边距可能不对）：`
      + missing.slice(0, 4).map((p) => p.split('__').slice(-1)[0]).join(' / ')
      + ' → 重跑 node scripts/build-ce-style.js');
  }

  Layout.updateViewPort({ width: W, height: H });
  if (typeof Layout.clear === 'function') Layout.clear();
  Layout.init(prepared.xml, styleSheet);
  const root = Layout.children[0];
  if (root && root.style) { root.style.width = W; root.style.height = H; }
  Layout.layout(ctx);

  const scroller = root && root.children ? root.children.filter((c) => c.type === 'ScrollView')[0] : null;
  if (scroller) {
    const others = root.children.reduce((sum, c) => sum + (c === scroller ? 0 : (c.layoutBox && c.layoutBox.height) || 0), 0);
    const h = Math.max(120, Math.round(H - others));
    if (scroller.style.height !== h) { scroller.style.height = h; Layout.layout(ctx); }
  }
  return { Layout, root, scroller, styleSheet, missing };
}

/* 开发期（开发者工具里）打一张"版块位置小地图"：迁移期间靠它核对间距 */
function devtoolsLog(LayoutInst) {
  const screen = screenOf(LayoutInst, 'screen');
  if (!screen) return;
  const map = screen.children
    .filter((c) => c.type === 'View' || c.type === 'ScrollView')
    .map((c) => `${(c.className || '').split(/\s+/)[0]}@${Math.round(c.layoutBox.absoluteY)}+${Math.round(c.layoutBox.height)}`)
    .join(' ');
  console.log('[CE] 版块位置 ' + map);
}

function isDevtools() {
  try { return (wx.getSystemInfoSync ? wx.getSystemInfoSync().platform : '') === 'devtools'; } catch (e) { return false; }
}

module.exports = { Layout: () => Layout, available, setupCanvas, renderPage, devtoolsLog, isDevtools, flatten, screenOf };
