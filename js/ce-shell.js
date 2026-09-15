/* 路线 B（引擎渲染）· 外壳（顶栏 / 正文滚动区 / 底栏）
   ------------------------------------------------------------------------------
   网页版的外壳是 index.html 里的三个空壳 + ui.js 的 renderTopbar/renderNavbar 填内容；
   canvas 里没有 DOM，所以这里按同样的类名手写这三个壳——
   **长相仍然由网页版 CSS 决定**（.player-row/.cur-chip/.nav-item 都在 style.css 里）。
*/
const CEHomeData = require('./ce-home-data.js');

/* 与网页版 ui.js 的 TABS 一致：灯阁 / 残域 / 执灯者 / 背包 */
const TABS = [
  { id: 'home', name: '灯阁', ico: '🏮' },
  { id: 'dungeon', name: '残域', ico: '⚔' },
  { id: 'roster', name: '执灯者', ico: '👥' },
  { id: 'bag', name: '背包', ico: '🎒' },
];

function topbarXml(d) {
  const chips = d.currencies
    .map((c) => `<view class="cur-chip"><text class="cur-ico" style="color:${c.color}" value="${c.icon}"/>`
      + `<text class="cur-val" value="${String(c.value)}"/></view>`).join('');
  return `<view id="topbar">
    <view class="player-row">
      <text class="pname" value="${d.player.name}"/>
      <text class="plv" value="Lv.${d.player.lv}"/>
      ${d.player.gene ? `<text class="genelock" value="${d.player.gene}"/>` : ''}
      <view class="tb-spacer"/>
    </view>
    <view id="curbar">${chips}<view class="cur-chip more"><text class="cur-val" value="▤ 全部货币"/></view></view>
  </view>`;
}

function navbarXml(tab) {
  return `<view id="navbar">${TABS.map((t) => `<view class="nav-item${t.id === tab ? ' active' : ''}" data-tab="${t.id}">`
    + `<text class="ico" value="${t.ico}"/><text class="nav-t" value="${t.name}"/></view>`).join('')}</view>`;
}

/* 整页：顶栏 + 正文（滚动）+ 底栏 */
function shell(tab, bodyXml, opts) {
  const d = (opts && opts.topbar) || CEHomeData.topbar();
  const noNav = !!(opts && opts.noNav);
  /* 弹窗层：网页版的弹窗（sheet）塞在 #modal-root 里，这里把它画在最上层（放在最后 = 画在最上面） */
  const overlay = (opts && opts.overlay) || '';
  return `<view id="app">
  ${topbarXml(d)}
  <scrollview id="view" scrollY="true"><view class="screen">${bodyXml}</view></scrollview>
  ${noNav ? '' : navbarXml(tab)}
  ${overlay ? `<view id="modal-root">${overlay}</view>` : ''}
</view>`;
}

module.exports = { shell, TABS };
