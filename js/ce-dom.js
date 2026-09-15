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
  /* ---------- 最小 DOM 树 ----------
     网页版靠 document.querySelectorAll('[data-act]') 找按钮再挂 onclick。
     要让那套绑定真的生效，假 DOM 就得真的有一棵树：innerHTML 赋进来 → 解析成节点。
     只用得上这几样：标签、class、id、data-*、父子关系、querySelector(All)。 */
  const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  const ATTR = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

  function parseAttrs(str) {
    const out = {};
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(str))) {
      if (m[2] !== undefined) out[m[1]] = m[2];
      else if (m[3] !== undefined) out[m[1]] = m[3];
      else out[m[1]] = '';
    }
    return out;
  }

  function matchOne(el, sel) {
    sel = sel.trim();
    if (!sel) return false;
    const tagM = sel.match(/^[a-zA-Z][\w-]*/);
    if (tagM && el.tagName.toLowerCase() !== tagM[0].toLowerCase()) return false;
    const idM = sel.match(/#([\w-]+)/);
    if (idM && el.id !== idM[1]) return false;
    const clsM = sel.match(/\.[\w-]+/g) || [];
    for (const c of clsM) if ((el.className || '').split(/\s+/).indexOf(c.slice(1)) < 0) return false;
    const attrM = sel.match(/\[([\w-]+)(?:=("([^"]*)"|'([^']*)'|[^\]]+))?\]/g) || [];
    for (const a of attrM) {
      const m = a.match(/^\[([\w-]+)(?:=("([^"]*)"|'([^']*)'|[^\]]+))?\]$/);
      const raw = m[1];
      const key = raw.indexOf('data-') === 0 ? raw.slice(5) : raw;      // dataset 里存的是去掉 data- 的名字
      const isData = raw.indexOf('data-') === 0;
      if (isData && !(key in (el.dataset || {}))) return false;
      const want = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[2] ? m[2].replace(/^"|"$/g, '') : undefined));
      if (want !== undefined) {
        const have = key === 'id' ? el.id : (key === 'class' ? el.className : el.dataset[key]);
        if (String(have) !== want) return false;
      }
    }
    return true;
  }

  function matches(el, selector) {
    return selector.split(',').some((one) => {
      const parts = one.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return false;
      if (!matchOne(el, parts[parts.length - 1])) return false;
      let i = parts.length - 2, node = el.parentNode;
      while (i >= 0) {
        let found = false;
        while (node) { if (matchOne(node, parts[i])) { found = true; node = node.parentNode; break; } node = node.parentNode; }
        if (!found) return false;
        i--;
      }
      return true;
    });
  }

  function walk(el, fn) { (el.children || []).forEach((c) => { fn(c); walk(c, fn); }); }

  function makeEl(tag) {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      children: [], parentNode: null, dataset: {},
      style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      outerHTML: '', textContent: '', value: '', id: '', className: '',
      onclick: null, onchange: null, oninput: null,
      _html: '',
      querySelector(sel) { const all = this.querySelectorAll(sel); return all.length ? all[0] : null; },
      querySelectorAll(sel) { const out = []; walk(this, (c) => { if (matches(c, sel)) out.push(c); }); return out; },
      appendChild(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; },
      insertBefore(c) { if (c) { c.parentNode = this; this.children.push(c); } return c; },
      removeChild(c) { return c; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); },
      setAttribute(k, v) { if (k === 'class') this.className = v; else if (k === 'id') this.id = v; else if (k.indexOf('data-') === 0) this.dataset[k.slice(5)] = v; },
      removeAttribute(k) { if (k === 'class') this.className = ''; },
      getAttribute(k) { return k === 'class' ? this.className : (k === 'id' ? this.id : (this.dataset[k.slice(5)] || null)); },
      addEventListener(type, fn) { if (type === 'click') this.onclick = this.onclick || fn; },
      removeEventListener() {}, dispatchEvent() {},
      getBoundingClientRect() { return { left: 0, top: 0, right: 375, bottom: 92, width: 375, height: 92 }; },
      scrollIntoView() {}, focus() {}, blur() {}, click() { if (typeof this.onclick === 'function') this.onclick(); },
      contains() { return false; }, closest() { return null; },
      cloneNode() { return makeEl(tag); },
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html; },
      set(v) { el._html = String(v); el.children = parseHtml(el._html, el); },
    });
    return el;
  }

  /* innerHTML 文本 → 节点树（够用就好：标签 / 属性 / 文本） */
  function parseHtml(html, parent) {
    const out = [];
    const stack = [{ el: { children: out }, parent: parent }];
    TAG.lastIndex = 0;
    let m;
    while ((m = TAG.exec(html))) {
      const close = m[1], tag = m[2], attrStr = m[3], self = m[4], text = m[5];
      if (text !== undefined) continue;                       // 文本不影响点击绑定，略过
      if (close) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = parseAttrs(attrStr);
      const node = makeEl(tag);
      node.className = attrs.class || '';
      node.id = attrs.id || '';
      Object.keys(attrs).forEach((k) => { if (k.indexOf('data-') === 0) node.dataset[k.slice(5)] = attrs[k]; });
      const top = stack[stack.length - 1];
      node.parentNode = top.parent;
      top.el.children.push(node);
      if (!self) stack.push({ el: node, parent: node });
    }
    return out;
  }

  /* 弹窗宿主：网页版把弹窗 appendChild 到 #modal-root。这里把它的 innerHTML 接住，
     交给引擎画成底部抽屉（见 js/ce-app.js）。不接住的话，网页版的弹窗小游戏里全丢。 */
  // 注意：这里在模块作用域，拿不到 install() 的 g —— 元素桶要当参数传进来（早先写 g.__CE_MODALS_ELS 直接抛错被 catch 吞了）
  const capture = (root, bucket, els) => {
    root.appendChild = function (child) {
      try {
        bucket.push(child && child.innerHTML ? child.innerHTML : '');
        if (els) els.push(child);
      } catch (e) {}
      this.children.push(child);
      return child;
    };
    return root;
  };

  function install(g) {
    g = g || (typeof window !== 'undefined' ? window : global);
    const byId = {};
    g.__CE_MODALS = g.__CE_MODALS || [];
    g.__CE_MODALS_ELS = g.__CE_MODALS_ELS || [];
    g.__CE_TOASTS = g.__CE_TOASTS || [];
    const doc = {
      getElementById(id) {
        if (id === 'modal-root') return doc.__modalRoot;
        if (id === 'toast-root') return doc.__toastRoot;
        if (id === 'battle-root') { g.__CE_BATTLE_ROOT = doc.__battleRoot; return doc.__battleRoot; }
        return (byId[id] = byId[id] || makeEl('div'));
      },
      // 返回空壳而不是 null：网页版里有大量 `querySelector(...).innerHTML = ...`、`.onclick = ...`，
      // 返回 null 会当场抛错把整段流程打断（战斗层、弹窗都栽在这）。
      querySelector() { return makeEl('div'); },
      querySelectorAll() { return []; },
      createElement: makeEl,
      createDocumentFragment: () => makeEl('fragment'),
      addEventListener() {}, removeEventListener() {},
      body: makeEl('body'),
      documentElement: makeEl('html'),
      __modalRoot: capture(makeEl('div'), g.__CE_MODALS, g.__CE_MODALS_ELS),
      __toastRoot: capture(makeEl('div'), g.__CE_TOASTS),
      __battleRoot: (function (el) {
        // 战斗层：网页版每次刷新都 createElement + appendChild，这里把最新内容同步到 innerHTML 上，
        // 小游戏侧每次读 innerHTML 就能拿到"当前这一帧的战斗画面"
        el.appendChild = function (child) { this.children = [child]; this.innerHTML = (child && child.innerHTML) || ''; return child; };
        return el;
      })(makeEl('div')),
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
