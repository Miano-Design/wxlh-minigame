/* 路线 B（引擎渲染）· 假 DOM（只为让网页版的界面代码能跑）
   ------------------------------------------------------------------------------
   网页版的 `js/ui.js` 里有 39 处 document 调用（填顶栏、绑按钮、弹面板）。
   小游戏没有 DOM，直接 require 它会崩。但我们**只想借它的"界面字符串"**，
   所以给它垫一套"看起来像 DOM、写进去什么也不会发生"的空壳：
   顶栏 innerHTML、面板 appendChild、querySelectorAll → 都不会抛异常，只是没有真元素。

   好处：`UI._setTab('dungeon')` 这类状态切换函数可以原样调用——
   它内部会 refresh()+render() 去写 DOM，写到假元素里就完了，状态已经切好了。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CEDom = api;
})(typeof window !== 'undefined' ? window : this, function () {
  function makeEl(tag) {
    return {
      tagName: String(tag || 'div').toUpperCase(),
      children: [],
      dataset: {},
      style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      innerHTML: '', outerHTML: '', textContent: '', value: '', id: '', className: '',
      onclick: null, onchange: null, oninput: null,
      querySelector() { return null; },
      querySelectorAll() { return []; },
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.push(c); return c; },
      removeChild(c) { return c; },
      remove() {},
      setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
      getBoundingClientRect() { return { left: 0, top: 0, right: 375, bottom: 92, width: 375, height: 92 }; },
      scrollIntoView() {}, focus() {}, blur() {}, click() {},
      contains() { return false; }, closest() { return null; },
      cloneNode() { return makeEl(tag); },
    };
  }

  /* 弹窗宿主：网页版把弹窗 appendChild 到 #modal-root。这里把它的 innerHTML 接住，
     交给引擎画成底部抽屉（见 js/ce-app.js）。不接住的话，网页版的弹窗小游戏里全丢。 */
  const capture = (root, bucket) => {
    root.appendChild = function (child) {
      try { bucket.push(child && child.innerHTML ? child.innerHTML : ''); } catch (e) {}
      this.children.push(child);
      return child;
    };
    return root;
  };

  function install(g) {
    g = g || (typeof window !== 'undefined' ? window : global);
    const byId = {};
    g.__CE_MODALS = g.__CE_MODALS || [];
    g.__CE_TOASTS = g.__CE_TOASTS || [];
    const doc = {
      getElementById(id) {
        if (id === 'modal-root') return doc.__modalRoot;
        if (id === 'toast-root') return doc.__toastRoot;
        return (byId[id] = byId[id] || makeEl('div'));
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement: makeEl,
      createDocumentFragment: () => makeEl('fragment'),
      addEventListener() {}, removeEventListener() {},
      body: makeEl('body'),
      documentElement: makeEl('html'),
      __modalRoot: capture(makeEl('div'), g.__CE_MODALS),
      __toastRoot: capture(makeEl('div'), g.__CE_TOASTS),
      head: makeEl('head'),
      readyState: 'complete',
    };
    doc.body.appendChild = function (c) { this.children.push(c); return c; };
    if (!g.document) g.document = doc;
    if (!g.location) g.location = { hostname: '', search: '', href: '', pathname: '/' };
    if (!g.navigator) g.navigator = { userAgent: 'minigame' };
    if (!g.history) g.history = { pushState() {}, replaceState() {}, back() {}, state: null, length: 1 };
    if (!g.addEventListener) g.addEventListener = () => {};
    if (!g.removeEventListener) g.removeEventListener = () => {};
    if (g.innerWidth === undefined) g.innerWidth = 375;
    if (g.innerHeight === undefined) g.innerHeight = 812;
    if (g.scrollY === undefined) g.scrollY = 0;
    if (!g.scrollTo) g.scrollTo = () => {};
    if (!g.requestAnimationFrame) g.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    if (!g.cancelAnimationFrame) g.cancelAnimationFrame = clearTimeout;
    return doc;
  }

  return { install, makeEl };
});
