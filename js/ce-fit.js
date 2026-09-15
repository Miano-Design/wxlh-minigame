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
      (children[key] || []).forEach((c) => walk(c, innerW, innerH));
    }
    Object.keys(out).forEach((k) => { if (!parentOf[k]) walk(k, W, H); });
    return out;
  }

  return { fit };
});
