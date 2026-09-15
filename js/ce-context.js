/* 《残域》小游戏版 · 路线 B（引擎渲染）公共件：上下文类名 / 行内样式
   ------------------------------------------------------------------------------
   官方引擎（minigame-canvas-engine 1.0.x）有两个硬限制：
     ① 样式表只认「单个类名」：styleSheet[类名] → 样式对象，`.card .t1` 这种后代选择器看不懂；
     ② `<view style="...">` 传进去是字符串，会**把类名合并出来的样式整个顶掉**，等于没有行内样式。

   这个文件把两件事都变成「类名」，于是引擎只需要按类名查表：
     · 上下文类名：祖先链逐级用 `__` 连接，每级 `标签.类1.类2#id`（类名排序，跟书写顺序无关）
         <view class="page"><text class="t1"> → `view.page__text.t1`
     · 行内样式：`style="color:var(--gold)"` → 换成类名 `isx3fa1`（同一串样式永远同一个类名），
         真正的样式对象由构建期算好写进 js/ce-style.js

   构建脚本（scripts/build-ce-style.js）和小游戏运行时都 require 这个文件，
   用同一个 prepare()，所以两边算出来的类名、上下文**完全一致**。
*/

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CEContext = api;
})(typeof window !== 'undefined' ? window : this, function () {
  /* 标签：<tag attr="..." /> —— 属性值里的 > 由引号分支接住 */
  const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const ATTR_RE = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  const CLASS_ATTR_RE = /(\sclass\s*=\s*")([^"]*)(")/;
  const CLASS_ATTR_RE_S = /(\sclass\s*=\s*')([^']*)(')/;
  const STYLE_ATTR_RE = /\s+style\s*=\s*("[^"]*"|'[^']*')/;

  function parseAttrs(str) {
    const out = {};
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(str))) {
      if (m[2] !== undefined) out[m[1]] = m[2];
      else if (m[3] !== undefined) out[m[1]] = m[3];
      else out[m[1]] = '';
    }
    return out;
  }

  function normClasses(v) {
    return String(v || '').trim().split(/\s+/).filter(Boolean);
  }

  /* 我们自己生成的上下文类名（`view#app__view.card`）里一定带 `#` 或 `__`；
     网页版的类名不会有这两种字符。滤掉它们，prepare() 再跑一遍才能得到同一串路径
     （否则第二次会把上一次的别名当成真类名，路径越滚越长，样式就全对不上了）。 */
  function stripAliases(classes) {
    return classes.filter((c) => !/[#]|__/.test(c));
  }

  /* 行内样式的类名：同一串样式（去空格后）永远得到同一个名字 */
  function inlineClass(text) {
    let h = 5381;
    const s = String(text).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'isx' + h.toString(36);
  }

  /* 一级上下文：标签.类1.类2#id（类名排序，保证「写顺序不同、结果一样」） */
  function contextKey(tag, classes, id, parentPath) {
    const cls = Array.from(new Set(classes)).sort();
    let seg = tag;
    if (cls.length) seg += '.' + cls.join('.');
    if (id) seg += '#' + id;
    return parentPath ? parentPath + '__' + seg : seg;
  }

  /* 预处理：行内样式 → 类名，并给每个元素补上下文类名
     返回 { xml, inlines }，inlines[类名] = 原始 style 文本（构建期算样式要用） */
  function prepare(xml, opts) {
    const inlines = {};
    TAG_RE.lastIndex = 0;
    const stack = [];
    const out = String(xml).replace(TAG_RE, (full, close, tag, attrStr, selfClose) => {
      if (close) { stack.pop(); return full; }
      const attrs = parseAttrs(attrStr);
      const classes = stripAliases(normClasses(attrs.class));
      const id = attrs.id || '';
      let tagOut = full;
      const own = [];

      const rawStyle = attrs.style;
      if (rawStyle !== undefined) {
        const cls = inlineClass(rawStyle);
        inlines[cls] = rawStyle;
        own.push(cls);
        tagOut = tagOut.replace(STYLE_ATTR_RE, '');
      }

      const all = classes.concat(own);
      const parentPath = stack.length ? stack[stack.length - 1] : '';
      const path = contextKey(tag, all, id, parentPath);
      if (!selfClose) stack.push(path);

      const next = all.concat([path]).join(' ');
      if (CLASS_ATTR_RE.test(tagOut)) tagOut = tagOut.replace(CLASS_ATTR_RE, '$1' + next + '$3');
      else if (CLASS_ATTR_RE_S.test(tagOut)) tagOut = tagOut.replace(CLASS_ATTR_RE_S, '$1' + next + '$3');
      else if (next) tagOut = tagOut.replace(/\s*(\/?>)$/, ` class="${next}"$1`);
      return tagOut;
    });
    return { xml: out, inlines };
  }

  /* 只要结构、不改内容时用这个（构建脚本要"每个元素的祖先链"） */
  function walk(xml, onOpen) {
    TAG_RE.lastIndex = 0;
    const stack = [];
    let m;
    while ((m = TAG_RE.exec(xml))) {
      const close = m[1], tag = m[2], attrStr = m[3], selfClose = m[4];
      if (close) { stack.pop(); continue; }
      const attrs = parseAttrs(attrStr);
      const classes = stripAliases(normClasses(attrs.class));
      const id = attrs.id || '';
      const parent = stack.length ? stack[stack.length - 1] : null;
      const node = {
        tag,
        attrs,
        classes,
        id,
        path: contextKey(tag, classes, id, parent ? parent.path : ''),
        raw: m[0],
      };
      onOpen(node, stack.slice());
      if (!selfClose) stack.push(node);
    }
  }

  return { prepare, walk, contextKey, inlineClass, stripAliases };
});
