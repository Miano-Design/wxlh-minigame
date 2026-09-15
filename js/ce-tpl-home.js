/* 路线 B（引擎渲染）首页模板
   ------------------------------------------------------------------------------
   写法：页面结构照抄网页版 js/ui.js 的 homeScreen()，**类名一个字不改**——
   样式只有一处真源（网页版 css/style.css），改那边、重跑编译器就跟着变。

   引擎的三条脾气（都不是我们的口味问题，实测得出，见 _ce_probe.html）：
     ① 文字写在 `value="..."` 属性里 —— 元素之间的文字内容引擎**直接丢掉**；
     ② 不解 XML 实体 —— 写 `&amp;` 就真显示 "&amp;"，所以文本里的引号/尖括号得换掉；
     ③ 标签要写 XML 那套：div/span/button → view/text。
   另外网格（网页版 display:grid）里每一格外面包一层 <view class="cell">：
   引擎不支持 grid/gap，格宽和缝隙由编译器按列数算好（见 scripts/build-ce-style.js）。
*/

/* 属性值里的文本：引擎不解实体，所以只做"不能让 XML 崩掉"的替换，不做 &amp; 那一套 */
function txt(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/"/g, '”').replace(/</g, '＜').replace(/>/g, '＞');
}

/* 文字节点：<text class="..." value="..." /> */
function T(cls, value, styleText) {
  return `<text class="${cls}"${styleText ? ` style="${styleText}"` : ''} value="${txt(value)}"/>`;
}

const TILES = (list) => list.map((t) => `<view class="cell"><view class="tile">${T('tt-name', t.name)}${T('tt-sub', t.sub)}</view></view>`).join('');

module.exports = function homeTemplate(d) {
  const rows = [
    `<view class="row static">${T('rk', '【境界】')}${T('rv', d.hero.realm, 'color:' + d.hero.realmColor)}${T('rs', d.hero.realmSub)}</view>`,
    `<view class="row static">${T('rk', '【等级】')}${T('rv', d.hero.level)}${T('rs', d.hero.levelSub)}</view>`,
    `<view class="row static">${T('rk', '【主角】')}${T('rv', d.hero.protag, d.hero.protagGold ? 'color:var(--gold)' : '')}${T('rs', d.hero.protagSub)}</view>`,
    `<view class="row static">${T('rk', '【转生】')}${T('rv', d.hero.reincarn)}${T('rs', d.hero.reincarnSub)}</view>`,
  ].join('');

  const quest = d.quest.empty
    ? `<view class="card"><view class="list-row"><view class="grow">${T('t1', '主线 · 已走完')}${T('t2', '挑战更高难度与深井')}</view></view></view>`
    : `<view class="card"><view class="list-row">
        <view class="grow">
          <view class="t1">${T('t1-t', '主线 · ' + d.quest.name)}${T('tag', d.quest.step)}</view>
          ${T('t2 blk', '完成奖励：' + d.quest.reward)}
        </view>
        <view class="btn small ${d.quest.done ? 'primary' : 'ghost'}">${T('btn-t', d.quest.done ? '领取奖励' : '去完成 ›')}</view>
      </view></view>`;

  const travel = d.travel.pend
    ? `<view class="card text-rows" style="padding:2px var(--sp3)"><view class="row">${T('rk', '【游历奇遇】', 'color:var(--gold)')}${T('rv', d.travel.name + '（待领）')}${T('rs', d.travel.sub)}</view></view>`
    : `<view class="card text-rows" style="padding:2px var(--sp3)"><view class="row">${T('rk', '【游历奇遇】')}${T('rv', '距下一次 ' + d.travel.left)}${T('rs', d.travel.sub)}</view></view>`;

  const idle = d.idle;
  const chips = d.currencies
    .map((c) => `<view class="cur-chip">${T('cur-ico', c.icon, 'color:' + c.color)}${T('cur-val', c.value)}</view>`).join('');

  return `<view id="app">
  <view id="topbar">
    <view class="player-row">
      ${T('pname', d.player.name)}
      ${T('plv', 'Lv.' + d.player.lv)}
      ${d.player.gene ? T('genelock', d.player.gene) : ''}
      <view class="tb-spacer"/>
    </view>
    <view id="curbar">${chips}<view class="cur-chip more">${T('cur-val', '▤ 全部货币')}</view></view>
  </view>
  <scrollview id="view" scrollY="true">
    <view class="screen">

      <view class="card text-rows">${rows}</view>

      ${quest}

      <view class="section-title">${T('section-title-t', '养成')}</view>
      <view class="text-menu">${TILES(d.grow)}</view>
      ${d.growLocked ? T('hint mt2 blk', '还没解锁：' + d.growLocked + '（跟着关卡进度开，推图就会一个个亮起来）') : ''}
      <view class="grid-title">${T('grid-title-t', '日常')}</view>
      <view class="text-menu">${TILES(d.daily)}</view>
      ${T('hint mt2 blk', d.growHint)}

      <view class="section-title">${T('section-title-t', '游历')}</view>
      ${travel}
      ${T('hint mt2 blk', d.travelHint)}

      <view class="section-title">${T('section-title-t', '挂机')}</view>
      <view class="card idle-card">
        <view class="idle-line">${T('il-k', '【挂机】')}${T('il-v', idle.rate)}${T('il-s', idle.rateSub)}</view>
        <view class="idle-line">${T('il-k', '【已挂】')}${T('il-v', idle.banked)}${T('il-k', '【待领】')}${T('il-r', idle.gain)}</view>
        <view class="idle-line idle-mini">${T('il-k', '【分工】')}${T('il-s', idle.lines)}</view>
        <view class="btn-row mt2">
          <view class="btn small ghost">${T('btn-t', '派人分工')}</view>
          <view class="btn ${idle.canClaim ? 'primary' : ''}">${T('btn-t', idle.claim)}</view>
        </view>
        ${T('hint mt2 blk', '离线也算：回来点一次「一键收取」就把挂机、任务、周常、成就、图鉴里攒下的奖励一起领走。')}
      </view>

      <view class="section-title">${T('section-title-t', '设置')}</view>
      <view class="text-menu">${TILES(d.settings)}</view>
      <view class="tb-spacer" style="height:14px"/>

    </view>
  </scrollview>
  <view id="navbar">
    ${d.nav.map((n) => `<view class="nav-item${n.active ? ' active' : ''}">${T('ico', n.icon)}${T('nav-t', n.name)}</view>`).join('')}
  </view>
</view>`;
};
