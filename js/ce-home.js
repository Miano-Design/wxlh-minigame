/* 路线 B（引擎渲染）· 首页运行时
   ------------------------------------------------------------------------------
   做三件事：
     ① 从逻辑层取数据（js/ce-home-data.js 的 fromCore），套进模板（js/ce-tpl-home.js）；
     ② 预处理标记：行内样式 → 类名、每个元素补上下文类名（js/ce-context.js，与构建脚本同一套算法）；
     ③ 喂给官方引擎渲染：updateViewPort → init(模板, 样式表) → layout(ctx)。

   样式表 js/ce-style.js 是**生成物**，改样式请改网页版 css/style.css（或 ce-extra.css）后跑：
     node scripts/build-ce-style.js
*/
const Engine = require('./lib/canvas-engine.js');
const CTX = require('./ce-context.js');
const HomeData = require('./ce-home-data.js');
const STYLE = require('./ce-style.js');
const CEFit = require('./ce-fit.js');

let Layout = Engine && (Engine.default || Engine.Layout || Engine);
if (Layout && Layout.__esModule) Layout = Layout.default;

/* 逻辑像素 → 画布：主画布按 dpr 建，再 scale 一次，之后所有坐标都按逻辑像素写 */
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

/* 把一页渲染到给定画布上（小游戏和浏览器预览共用这一条路径） */
function render(ctx, W, H, data) {
  const prepared = CTX.prepare(require('./ce-tpl-home.js')(data));

  /* 画布尺寸是设备决定不了的常量，交给引擎算不出来，所以 init 之后手动钉住根节点 */
  Layout.updateViewPort({ width: W, height: H });
  /* 百分比宽度必须按真实画布宽先折成像素，否则宫格会塌（原因见 js/ce-fit.js） */
  Layout.init(prepared.xml, CEFit.fit(STYLE, W, H));
  const root = Layout.children[0];
  if (root && root.style) {
    root.style.width = W;
    root.style.height = H;
  }
  Layout.layout(ctx);

  /* 滚动区高度：css-layout 里 flexShrink 默认是 0，内容比屏幕高时子节点不肯缩，
     会把底栏顶到屏幕外。这里按"屏幕高 − 顶栏 − 底栏"钉死一次，最稳。 */
  if (root && root.children) {
    const scroller = root.children.filter((c) => c.type === 'ScrollView')[0];
    if (scroller) {
      const others = root.children.reduce((sum, c) => sum + (c === scroller ? 0 : (c.layoutBox && c.layoutBox.height) || 0), 0);
      const h = Math.max(120, Math.round(H - others));
      if (scroller.style.height !== h) {
        scroller.style.height = h;
        Layout.layout(ctx);
      }
    }
  }
  return { Layout, root, styleSheet: CEFit.fit(STYLE, W, H) };
}

/* 有没有存档：没有就返回 false（首次进入要走"起名 / 选血统"那套，本页还没做） */
function ensureSave() {
  const C = window.Core;
  if (!C) return false;
  if (C.S) return true;
  try { return !!C.load(); } catch (e) { return false; }
}

function boot(opts) {
  opts = opts || {};
  if (!Layout || typeof Layout.init !== 'function') {
    console.error('[CE] 引擎没加载成功，退回原来的界面层');
    return null;
  }
  if (!opts.data && !ensureSave()) {
    console.warn('[CE] 还没有存档（首次进入要起名 / 选血统），这一轮交给原来的界面层');
    return null;
  }
  const view = setupCanvas(opts.dpr);
  const data = opts.data || HomeData.fromCore();
  const out = render(view.ctx, view.W, view.H, data);
  /* 启动留一行日志：迁移期间靠它在开发者工具的 console 里核对"真的按画布尺寸画出来了" */
  const scroller = out.root && out.root.children.filter((c) => c.type === 'ScrollView')[0];
  console.log(`[CE] 首页已渲染：画布 ${view.W}×${view.H} dpr${view.dpr} · 元素 ${out.Layout.eleCount} 个`
    + (scroller ? ` · 滚动区 ${Math.round(scroller.layoutBox.width)}×${Math.round(scroller.layoutBox.height)}` : ''));
  return { Layout: out.Layout, canvas: view.canvas, ctx: view.ctx, width: view.W, height: view.H };
}

module.exports = { boot, render };
