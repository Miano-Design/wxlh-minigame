/* 路线 B（引擎渲染）· 应用层
   ------------------------------------------------------------------------------
   这一层干的事：**把网页版的界面字符串拿过来，翻成引擎标记，画上去**。
   界面只有一处真源（网页版 js/ui.js，同步到 js/ui-web.js），内容/文案/类名一个字不改，
   样式只有一处真源（网页版 css/style.css，编译成 js/ce-style.js）。

   一个页面 = 外壳（顶栏 / 正文滚动区 / 底栏）+ 网页版那个页面函数产出的 HTML。
   底部四个页签可以点；页内按钮暂时只打日志（交互那一层还没接，见 README「路线 B」）。
*/
const CEEngine = require('./ce-engine.js');
const CEHtml = require('./ce-html.js');
const CEShell = require('./ce-shell.js');
const CEHomeData = require('./ce-home-data.js');

/* 网页版 UI 里导出的页面函数：_screens.homeScreen / dungeonScreen / rosterScreen / bagScreen */
const SCREEN_FN = {
  home: 'homeScreen',
  dungeon: 'dungeonScreen',
  roster: 'rosterScreen',
  bag: 'bagScreen',
};
/* 子页（网页版里是页内切换）：渲染成整页，底部页签高亮留在它所属的那个 tab 上 */
const SUBS = {
  party: { tab: 'roster', fn: 'partyScreen' },
  chars: { tab: 'roster', fn: 'charsScreen' },
  grow: { tab: 'roster', fn: 'growScreen' },
  equip: { tab: 'bag', fn: 'equipScreen' },
};

function screens() {
  const U = window.UI;
  return (U && U._panels && U._panels._screens) || (U && U._screens) || null;
}

/* 某个页签的整页标记（纯函数，构建脚本也用它来编译样式表） */
function pageMarkup(tab, opts) {
  const S = screens();
  const sub = SUBS[tab];
  const navTab = sub ? sub.tab : tab;
  const fn = S && S[((opts && opts.fn) || (sub && sub.fn) || SCREEN_FN[tab] || tab)];
  if (!fn) throw new Error('[CE] 网页版界面层没有这个页面：' + tab);
  return CEShell.shell(navTab, CEHtml.toXml(fn()), opts);
}

/* 有没有存档：没有就返回 false（首次进入要走"起名 / 选血统"，那一套还没搬） */
function ensureSave() {
  const C = window.Core;
  if (!C) return false;
  if (C.S) return true;
  try { return !!C.load(); } catch (e) { return false; }
}

function bind(app, out) {
  CEEngine.flatten(out.Layout).forEach((el) => {
    const ds = el.dataset || {};
    if (ds.tab) {
      el.on('click', () => { if (app.tab !== ds.tab) show(app, ds.tab); });
    } else if (ds.act) {
      el.on('click', () => console.log('[CE] 点了 ' + ds.act + '（页内交互还没接）'));
    }
  });
}

function draw(app) {
  const out = CEEngine.renderPage(app.view.ctx, app.view.W, app.view.H, pageMarkup(app.tab));
  bind(app, out);
  app.out = out;
  console.log(`[CE] ${app.tab} 已渲染：画布 ${app.view.W}×${app.view.H} dpr${app.view.dpr}`
    + ` · 元素 ${out.Layout.eleCount} 个`
    + (out.scroller ? ` · 滚动区 ${Math.round(out.scroller.layoutBox.width)}×${Math.round(out.scroller.layoutBox.height)}` : '')
    + (out.scroller ? ` · 内容高 ${Math.round(out.scroller.scrollHeight)}` : ''));
  if (CEEngine.isDevtools()) CEEngine.devtoolsLog(out.Layout);
  return out;
}

function show(app, tab) {
  app.tab = tab;
  /* 让网页版那层知道"现在在哪一页"（写进假 DOM，状态真的会切） */
  const U = window.UI;
  if (U && U._setTab) { try { U._setTab(tab); } catch (e) { /* 假 DOM 足够撑住，撑不住也无妨 */ } }
  return draw(app);
}

function boot(opts) {
  opts = opts || {};
  if (!CEEngine.available()) { console.error('[CE] 引擎没加载成功，退回原来的界面层'); return null; }
  if (!screens()) { console.error('[CE] 网页版界面层没加载，退回原来的界面层'); return null; }
  if (!opts.data && !ensureSave()) {
    console.warn('[CE] 还没有存档（首次进入要起名 / 选血统），这一轮交给原来的界面层');
    return null;
  }
  const view = CEEngine.setupCanvas(opts.dpr);
  const app = { tab: 'home', view };
  draw(app);
  return app;
}

module.exports = { boot, show, draw, pageMarkup };
