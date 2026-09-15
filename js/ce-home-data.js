/* 路线 B（引擎渲染）首页数据
   ------------------------------------------------------------------------------
   界面字符串现在全部来自网页版界面层（js/ui-web.js），这个文件只剩一件小事：
   顶栏那一小块数据（名字 / 等级 / 铭刻 / 三种主力货币）——canvas 里没有 DOM，得自己拼。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CEHomeData = api;
})(typeof window !== 'undefined' ? window : this, function () {
  /* ---------------------------- 真实数据 ---------------------------- */
  /* 顶栏那一小块（名字 / 等级 / 铭刻 + 三种主力货币），外壳和首页都要用 */
  function topbar() {
    const C = window.Core, D = window.DATA, S = C.S;
    const f = window.fmt || ((x) => String(x));
    const main = D.CURRENCIES.filter((c) => ['points', 'holy', 'otherworld'].indexOf(c.id) >= 0);
    return {
      player: {
        name: S.player.name || '执灯者',
        lv: S.player.level,
        gene: S.player.geneLock > 0 ? `铭刻·${D.GENE_LOCKS[S.player.geneLock - 1].name}` : '',
      },
      currencies: main.map((c) => ({ icon: c.icon, color: c.color, value: f(S.cur[c.id]) })),
    };
  }

  return { topbar };
});
