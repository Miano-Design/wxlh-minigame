/* 路线 B（引擎渲染）· 画布适配：把样式表里的百分比宽度按真实画布宽换算成像素
   ------------------------------------------------------------------------------
   为什么非做不可：官方引擎在建节点的时候就执行 convertPercent（见 canvas-engine 的 create()），
   父级没有**显式**宽度时，子级 '33.33%' 会被折成 0 —— 宫格、按钮行会当场塌成一条缝。
   所以百分比不能交给引擎，得我们自己按"父级内容宽度 = 父级宽度 − 左右内边距"逐层算成像素。

   默认行为跟 CSS 一致：没写宽度的块级元素占满父级内容宽度（css-layout 的 stretch）。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CEFit = api;
})(typeof window !== 'undefined' ? window : this, function () {
  function isPct(v) { return typeof v === 'string' && /^-?\d*\.?\d+%$/.test(v); }
  function pctOf(v) { return parseFloat(v) / 100; }

  /* 样式表 → 一份按画布尺寸算好的新样式表（不原地改传入的对象） */
  function fit(styles, W, H) {
    const out = {};
    Object.keys(styles).forEach((k) => { out[k] = Object.assign({}, styles[k]); });

    /* 保命：引擎遇到"宽度 0 的文字"会在换行循环里卡死（截不出字、指针又不动）。
       所以任何被算成 0 的宽/高，一律抬到 1px——肉眼看不出来，但不会死循环。 */
    Object.keys(out).forEach((k) => {
      ['width', 'height', 'maxWidth', 'maxHeight'].forEach((p) => {
        if (out[k][p] === 0) out[k][p] = 1;
      });
    });

    /* 上下文路径本身就是树：`根__子__孙`，按 `__` 切开就能知道父子关系 */
    const parentOf = {};
    const children = {};
    Object.keys(out).forEach((k) => {
      const i = k.lastIndexOf('__');
      if (i < 0) return;
      const p = k.slice(0, i);
      if (!out[p]) return;
      parentOf[k] = p;
      (children[p] = children[p] || []).push(k);
    });

    /* 自顶向下：先定根，再一层层把子级的百分比折成像素 */
    const seen = {};
    function walk(key, parentW, parentH) {
      if (seen[key]) return;
      seen[key] = true;
      const s = out[key];
      if (isPct(s.width)) s.width = Math.round(parentW * pctOf(s.width));
      if (isPct(s.height)) s.height = Math.round(parentH * pctOf(s.height));
      /* 上下限的百分比是相对**父级内容盒**算的（CSS 规矩），跟自身宽度是两回事 */
      if (isPct(s.minWidth)) s.minWidth = Math.round(parentW * pctOf(s.minWidth));
      if (isPct(s.maxWidth)) s.maxWidth = Math.round(parentW * pctOf(s.maxWidth));
      if (isPct(s.minHeight)) s.minHeight = Math.round(parentH * pctOf(s.minHeight));
      if (isPct(s.maxHeight)) s.maxHeight = Math.round(parentH * pctOf(s.maxHeight));
      const w = typeof s.width === 'number' ? s.width : parentW;
      const h = typeof s.height === 'number' ? s.height : parentH;
      const innerW = Math.max(0, w - (s.paddingLeft || 0) - (s.paddingRight || 0));
      const innerH = Math.max(0, h - (s.paddingTop || 0) - (s.paddingBottom || 0));
      const kids = children[key] || [];

      /* 横排里的弹性项（.grow / .btn / .nav-item 这些 flex:1）：引擎的 flex 只分配"剩余空间"，
         不收缩。兄弟里只要有长文字，弹性项就会撑出屏幕（实测：世界卡片、队伍格全被切掉）。
         所以这里替引擎把宽度先分好：父级内容宽 − 已有明确宽度的兄弟 = 弹性项可分的空间。 */
      const fixedSum = kids.reduce((sum, k) => {
        const c = out[k];
        // 已定宽的按宽度算；没定宽的用"文字宽度提示"（__textW）估，别当 0——
        // 当 0 的话弹性兄弟会分到整个空余宽度，右边的东西就飘了。
        const cw = typeof c.width === 'number' ? c.width : (c.__textW || 0);
        return sum + cw + (c.marginLeft || 0) + (c.marginRight || 0);
      }, 0);
      const flexKids = kids.filter((k) => out[k].flex && typeof out[k].width !== 'number');
      if (flexKids.length) {
        const totalFlex = flexKids.reduce((sum, k) => sum + (out[k].flex || 1), 0);
        const spare = Math.max(0, innerW - fixedSum);
        flexKids.forEach((k) => {
          out[k].width = Math.max(24, Math.round((spare * (out[k].flex || 1)) / totalFlex));
        });
      }
      kids.forEach((c) => walk(c, innerW, innerH));
    }
    Object.keys(out).forEach((k) => { if (!parentOf[k]) walk(k, W, H); });

    /* 保命第二条：引擎的自动换行里有个 while，**文字宽度比一个字还窄**时
       截不出内容、指针又不往前走 → 整页卡死。窄到排不下就干脆不给宽度，
       让它按内容撑一行（顶多溢出，绝不会卡）。 */
    Object.keys(out).forEach((k) => {
      const isText = k.split('__').pop().indexOf('text.') === 0;
      if (isText && typeof out[k].width === 'number' && out[k].width < 24) delete out[k].width;
    });
    return out;
  }

  return { fit };
});
