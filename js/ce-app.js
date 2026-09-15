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
  if (tab === 'setup') return setupMarkup();
  const S = screens();
  /* 弹窗：网页版往 #modal-root 里塞的内容（被 ce-dom 接住）→ 翻译成引擎标记，作为最上层 */
  const modals = (window.__CE_MODALS || []);
  const modalXml = modals.length ? CEHtml.toXml(modals[modals.length - 1]) : '';
  /* 战斗层：网页版 startBattle() 把整屏战斗写进 #battle-root（定时器每回合重写），
     这里每次都读它最新的 innerHTML，画在最上层。 */
  const battleRoot = window.__CE_BATTLE_ROOT;
  const battleHtml = battleRoot && battleRoot.innerHTML ? battleRoot.innerHTML : '';
  const battleXml = battleHtml ? CEHtml.toXml(battleHtml) : '';
  const withOverlay = (xml) => {
    let out = xml;
    if (battleXml) out = out.replace(/<\/view>\s*$/, `<view id="battle-root">${battleXml}</view></view>`);
    if (modalXml) out = out.replace(/<\/view>\s*$/, `<view id="modal-root">${modalXml}</view></view>`);
    return out;
  };
  const sub = SUBS[tab];
  const navTab = sub ? sub.tab : tab;
  const fn = S && S[((opts && opts.fn) || (sub && sub.fn) || SCREEN_FN[tab] || tab)];
  if (!fn) throw new Error('[CE] 网页版界面层没有这个页面：' + tab);
  return withOverlay(CEShell.shell(navTab, CEHtml.toXml(fn()), opts));
}


/* 新档开局（还没有存档时）：在引擎版里起名 + 选血统。
   以前这里直接 return null 退回旧的 canvas 界面 —— 手机上首次进入看到的就是旧版式，
   所以"随便点几页都没对齐"。现在新档也走这套界面。 */
const SETUP_NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];

function setupMarkup() {
  const D = window.DATA, Core = window.Core, S = Core.S;
  const cur = S.player.bloodline || '';
  /* 三步照网页版来（文案就抄 ui.js 的 showTutorial / showCharCreate / bloodlineModal）：
     ① 欢迎 + 签订灯阁契约  ② 起名（canvas 里没有输入框，用"换一个"代替打字）  ③ 选血统 */
  const rows = Object.keys(D.BLOODLINES).map((k) => {
    const b = D.BLOODLINES[k] || {};
    const on = cur === k;
    return `<view class="card" data-bl="${k}" style="cursor:pointer;${on ? 'border-color:var(--gold)' : ''}">
      <view class="t1"><text class="t1-t" value="${b.name || k}"/>${on ? '<text class="tag" style="color:var(--gold)" value="已选"/>' : ''}</view>
      <view class="t2"><text class="t2-t" value="${b.desc || ''}"/></view>
    </view>`;
  }).join('');

  const body = `
    <view class="card">
      <view class="t1"><text class="t1-t" value="欢迎来到灯阁"/></view>
      <view class="t2"><text class="t2-t" value="你被神秘存在选中，成为了「执灯者」。在这里，你将进入残域执行探索任务、招募伙伴组建五人小队（主角必上阵）、解锁血统与铭刻、挑战深井，寻找离开的方法。"/></view>
      <view class="t2"><text class="t2-t" value="新手补给已发放：◈50,000 · ✦1,000 · 经验模块×20 · 治疗剂×10"/></view>
    </view>

    <view class="section-title"><text class="section-title-t" value="创建你的执灯者"/></view>
    <view class="card">
      <view class="list-row" data-name="roll" style="cursor:pointer">
        <view class="grow">
          <view class="t1"><text class="t1-t" value="${S.player.name || '未命名'}"/></view>
          <view class="t2"><text class="t2-t" value="灯阁需要一个名字来记录你的行程（点一下换一个）"/></view>
        </view>
        <text class="chev" value="🎲"/>
      </view>
    </view>

    <view class="section-title"><text class="section-title-t" value="选择血统"/></view>
    <view class="hint mt2 blk"><text class="hint-t blk" value="境界线跟着血统走，选定后不可更改。"/></view>
    ${rows}

    <view class="btn-row mt2"><view class="btn primary block ${cur ? '' : 'off'}" data-setup="ok"><text class="btn-t" value="${cur ? '以这个名字进入残域' : '请先选一条血统'}"/></view></view>
    <text class="hint mt2 blk" value=""/>
  `;
  return CEShell.shell('home', body, { noNav: true });
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
    } else if (ds.name === 'roll') {
      el.on('click', () => {
        const cur = window.Core.S.player.name;
        const i = SETUP_NAMES.indexOf(cur);
        const next = SETUP_NAMES[(i + 1 + SETUP_NAMES.length) % SETUP_NAMES.length];
        window.Core.setPlayerName(next);
        draw(app);
      });
    } else if (ds.bl) {
      el.on('click', () => {
        try { window.Core.choosePlayerBloodline(ds.bl); } catch (e) { console.warn('[CE] 选血统失败：' + e.message); }
        draw(app);
      });
    } else if (ds.setup === 'ok') {
      el.on('click', () => {
        if (!window.Core.S.player.bloodline) return;
        app.tab = 'home';
        draw(app);
      });
    } else if (el.className && el.className.indexOf('modal-mask') >= 0) {
      el.on('click', () => {
        const els = window.__CE_MODALS_ELS || [];
        const last = els[els.length - 1];
        try { if (last && window.UI && window.UI.closeModal) window.UI.closeModal(last); } catch (e) {}
        if (window.__CE_MODALS) window.__CE_MODALS.length = 0;
        if (window.__CE_MODALS_ELS) window.__CE_MODALS_ELS.length = 0;
        draw(app);
      });
    } else if (ds.act) {
      el.on('click', () => console.log('[CE] 点了 ' + ds.act + '（页内交互还没接）'));
    }
  });
}

let battlePoll = null;
function watchBattle(app) {
  if (battlePoll) return;
  let last = '';
  battlePoll = setInterval(() => {
    const root = window.__CE_BATTLE_ROOT;
    const html = root && root.innerHTML ? root.innerHTML : '';
    if (html === last) return;                       // 没变就不画
    last = html;
    try { draw(app); } catch (e) { console.warn('[CE] 战斗重画失败：' + e.message); }
    if (!html && battlePoll) { clearInterval(battlePoll); battlePoll = null; }   // 战斗结束就停
  }, 100);
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
  if (window.__CE_BATTLE_ROOT && window.__CE_BATTLE_ROOT.innerHTML) watchBattle(app);
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
    /* 新档：在引擎版里起名 + 选血统（以前这里退回旧界面，手机上首进的旧版式就是这么来的） */
    try {
      window.Core.newGame();
      const n = SETUP_NAMES[Math.floor(Math.random() * SETUP_NAMES.length)];
      if (window.Core.setPlayerName) window.Core.setPlayerName(n);
      console.log('[CE] 新档：进入起名 / 选血统（引擎版）');
    } catch (e) { console.error('[CE] 建新档失败：' + e.message); return null; }
  }
  const view = CEEngine.setupCanvas(opts.dpr);
  const app = { tab: window.Core.S && window.Core.S.player.name && window.Core.S.player.bloodline ? 'home' : 'setup', view };
  draw(app);
  return app;
}

module.exports = { boot, show, draw, pageMarkup };
