/* 自动生成，不要手改：node scripts/ce-preview-build.js（只给浏览器预览用） */
(function () {
var __mods = {}, __cache = {};
function require(id) {
  if (__cache[id]) return __cache[id].exports;
  var m = { exports: {} }; __cache[id] = m;
  if (!__mods[id]) throw new Error("预览里没映射的 require: " + id);
  __mods[id](m, m.exports, require);
  return m.exports;
}
__mods["./lib/canvas-engine.js"] = function (module) { module.exports = window.__ENGINE; };
__mods["./ce-style.js"] = function (module) { module.exports = window.__STYLE; };
__mods["./ce-context.js"] = function (module, exports, require) {
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

  /* 行内样式串 → 引擎样式对象（只认常用几项：颜色 / 尺寸 / 透明度 / 边距）
     用途：运行时的兜底——万一某个状态没编进样式表，至少别让文字变成看不见的黑字。 */
  function inlineToStyle(text) {
    const out = {};
    String(text || '').split(';').forEach((part) => {
      const i = part.indexOf(':');
      if (i < 0) return;
      const prop = part.slice(0, i).trim().toLowerCase();
      const val = part.slice(i + 1).trim();
      const px = val.match(/^(-?[\d.]+)px$/);
      const num = px ? parseFloat(px[1]) : (/^-?[\d.]+$/.test(val) ? parseFloat(val) : null);
      switch (prop) {
        case 'color': out.color = val; break;
        case 'background': case 'background-color': if (!/gradient|url/.test(val)) out.backgroundColor = val; break;
        case 'border-color': out.borderColor = val; break;
        case 'opacity': if (num !== null) out.opacity = num; break;
        case 'font-size': if (num !== null) out.fontSize = num; break;
        case 'font-weight': if (/^\d+$/.test(val)) out.fontWeight = parseInt(val, 10) >= 600 ? 'bold' : 'normal'; break;
        case 'width': if (num !== null) out.width = num; else if (/%$/.test(val)) out.width = val; break;
        case 'height': if (num !== null) out.height = num; else if (/%$/.test(val)) out.height = val; break;
        case 'padding': if (num !== null) { out.paddingTop = num; out.paddingRight = num; out.paddingBottom = num; out.paddingLeft = num; } break;
        case 'margin-top': if (num !== null) out.marginTop = num; break;
        case 'margin-bottom': if (num !== null) out.marginBottom = num; break;
        case 'text-align': if (/^(left|center|right)$/.test(val)) out.textAlign = val; break;
        default: break;
      }
    });
    return out;
  }

  return { prepare, walk, contextKey, inlineClass, stripAliases, inlineToStyle };
});

};
__mods["./ce-fit.js"] = function (module, exports, require) {
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
        const cw = typeof c.width === 'number' ? c.width : 0;
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

};
__mods["./ce-html.js"] = function (module, exports, require) {
/* 路线 B（引擎渲染）· HTML → 引擎标记 翻译层
   ------------------------------------------------------------------------------
   网页版的界面代码（`js/ui-web.js`，就是从 wxlh-game/js/ui.js 同步过来的那一份）
   产出的是 HTML 字符串。引擎只吃它自己那套 XML（view / text / image），所以这里做翻译：

     · 标签映射：div/p/h3/header/nav/button… → view；span/b/i… → text；img → image
     · 只含文字的块级元素（div/p/h3）直接变成 `<text value="…"/>`，少一层套娃
     · 混排（文字 + 子元素）里的文字段各自变成 `<text value="…"/>`
     · HTML 实体要**解码**：引擎不解实体，写 `&amp;` 它就真显示 "&amp;"
     · `<svg>` 图标 → 换成字符（引擎画不了矢量图，关闭/返回按钮靠它不至于变空按钮）

   注意：块级文字"要不要占满父级宽度"不在这里决定，交给编译器按
   「父级是不是 flex 横排」来算（见 scripts/build-ce-style.js 的块级文字那一段）。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CEHtml = api;
})(typeof window !== 'undefined' ? window : this, function () {
  const TOKEN = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  const ATTR = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  const VOID = /^(br|hr|img|input|meta|link|area|base|col|embed|source|track|wbr)$/;
  const BLOCK = /^(div|p|h1|h2|h3|h4|h5|h6|header|footer|nav|main|section|article|ul|ol|li|form|label|table|tr|td|button)$/;
  const MAPPED = {
    img: 'image',
    input: 'view',
    br: 'skip', hr: 'skip',
    svg: 'icon', path: 'skip', circle: 'skip', rect: 'skip', line: 'skip', polyline: 'skip', polygon: 'skip', g: 'skip', defs: 'skip', use: 'skip',
    canvas: 'skip', video: 'skip', script: 'skip', style: 'skip', iframe: 'skip', select: 'skip', option: 'skip', textarea: 'view',
  };
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', hellip: '…', times: '✕' };

  function decode(s) {
    return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, body) => {
      if (body.charAt(0) === '#') {
        const code = body.charAt(1) === 'x' || body.charAt(1) === 'X'
          ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return isNaN(code) ? all : String.fromCharCode(code);
      }
      return ENTITIES[body] !== undefined ? ENTITIES[body] : all;
    });
  }

  /* 属性值里不能出现 > （引擎的解析器按 > 断标签），引号也要挑一种不冲突的 */
  function attrValue(v) {
    const s = String(v).replace(/>/g, '＞');
    if (s.indexOf('"') < 0) return '"' + s + '"';
    return "'" + s.replace(/'/g, '’') + "'";
  }

  function parseAttrs(str) {
    const out = {};
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(str))) {
      if (m[2] !== undefined) out[m[1]] = decode(m[2]);
      else if (m[3] !== undefined) out[m[1]] = decode(m[3]);
      else out[m[1]] = '';
    }
    return out;
  }

  /* HTML → 节点树 */
  function parse(html) {
    const rootNode = { tag: '#root', attrs: {}, children: [] };
    const stack = [rootNode];
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(html))) {
      const close = m[1], tag = m[2], attrStr = m[3], selfClose = m[4], text = m[5];
      if (text !== undefined) {
        const top = stack[stack.length - 1];
        if (text.replace(/\s+/g, '') !== '') top.children.push({ text: text.replace(/\s+/g, ' ') });
        continue;
      }
      if (close) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const node = { tag: tag.toLowerCase(), attrs: parseAttrs(attrStr), children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClose && !VOID.test(node.tag)) stack.push(node);
    }
    return rootNode;
  }

  /* 节点树 → 引擎标记 */
  function serialize(node, ctx) {
    const tag = node.tag;
    const mapped = MAPPED[tag];
    if (mapped === 'skip') return '';

    const attrs = node.attrs;
    const classes = (attrs.class || '').trim().split(/\s+/).filter(Boolean);
    const kids = node.children || [];
    const elems = kids.filter((c) => c.tag);
    const texts = kids.filter((c) => c.text !== undefined).map((c) => c.text);

    if (mapped === 'icon') {
      /* 矢量图标画不了：关闭键给 ✕、返回键给 ‹，其它给一个中点，别留空按钮 */
      const near = (ctx.ancestorClasses || []).join(' ');
      const glyph = /close-x/.test(near) ? '✕' : (/back-x/.test(near) ? '‹' : '·');
      return `<text class="ce-ico" value=${attrValue(glyph)}/>`;
    }

    const outTag = mapped === 'image' ? 'image'
      : (elems.length === 0 && texts.length ? 'text' : 'view');

    const outAttrs = [];
    if (classes.length) outAttrs.push('class="' + classes.join(' ') + '"');
    if (attrs.id) outAttrs.push('id="' + attrs.id + '"');
    if (attrs.style) outAttrs.push('style=' + attrValue(attrs.style));
    if (attrs.src) outAttrs.push('src=' + attrValue(attrs.src));
    Object.keys(attrs).forEach((k) => { if (k.indexOf('data-') === 0) outAttrs.push(k + '=' + attrValue(attrs[k])); });
    if (tag === 'input' && attrs.placeholder) outAttrs.push('value=' + attrValue(attrs.placeholder));

    if (outTag === 'image') return `<image ${outAttrs.join(' ')}/>`;

    if (outTag === 'text') {
      const value = texts.join(' ').trim();
      if (!value) return '';
      const cls = classes.slice();
      /* 这里**不加 blk**："要不要占满父级宽度"由编译器按父级是不是 flex 横排来定
         （加了的话，横排里的文字会撑爆一行——实测世界卡片、主线卡都被切）。 */
      const clsAttr = cls.length ? ' class="' + cls.join(' ') + '"' : '';
      const styleAttr = attrs.style ? ' style=' + attrValue(attrs.style) : '';
      return `<text${clsAttr}${styleAttr} value=${attrValue(value)}/>`;
    }

    /* 容器：文字段各自成 text，子元素递归 */
    const inner = [];
    const nextCtx = { ancestorClasses: (ctx.ancestorClasses || []).concat([classes.join(' ')]) };
    kids.forEach((child) => {
      if (child.text !== undefined) {
        const v = child.text.trim();
        if (v) inner.push(`<text value=${attrValue(v)}/>`);
      } else {
        inner.push(serialize(child, nextCtx));
      }
    });
    const head = outAttrs.length ? ' ' + outAttrs.join(' ') : '';
    return inner.length ? `<view${head}>${inner.join('')}</view>` : `<view${head}/>`;
  }

  function toXml(html) {
    const tree = parse(String(html));
    return (tree.children || []).map((c) => serialize(c, { ancestorClasses: [] })).join('');
  }

  return { toXml, decode };
});

};
__mods["./ce-home-data.js"] = function (module, exports, require) {
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

};
__mods["./ce-shell.js"] = function (module, exports, require) {
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
  return `<view id="app">
  ${topbarXml(d)}
  <scrollview id="view" scrollY="true"><view class="screen">${bodyXml}</view></scrollview>
  ${noNav ? '' : navbarXml(tab)}
</view>`;
}

module.exports = { shell, TABS };

};
__mods["./ce-engine.js"] = function (module, exports, require) {
/* 路线 B（引擎渲染）· 引擎管道（所有页面共用）
   ------------------------------------------------------------------------------
   一页从"标记文本"到"画在屏幕上"要过的几道手续，全在这里：
     ① 预处理：行内样式→类名、每个元素补上下文类名（js/ce-context.js）
     ② 折算：百分比宽度按真实画布宽算成像素（js/ce-fit.js）
     ③ 自检：模板里的元素在样式表里查得到吗（查不到=整套样式都没有→黑底黑字）
     ④ 渲染：updateViewPort → init(标记, 样式表) → 钉住根节点尺寸 → layout
     ⑤ 补一刀：滚动区高度（css-layout 的 flexShrink 默认 0，内容一高就把底栏顶出屏幕）
*/
const Engine = require('./lib/canvas-engine.js');
const CTX = require('./ce-context.js');
const CEFit = require('./ce-fit.js');
const STYLE = require('./ce-style.js');

let Layout = Engine && (Engine.default || Engine.Layout || Engine);
if (Layout && Layout.__esModule) Layout = Layout.default;

function available() { return !!Layout && typeof Layout.init === 'function'; }

/* 逻辑像素 → 画布：主画布按 dpr 建，再 scale 一次，之后坐标都按逻辑像素写 */
function setupCanvas(withDpr) {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const W = info.windowWidth, H = info.windowHeight;
  const dpr = withDpr === false ? 1 : (info.pixelRatio || 1);
  const canvas = wx.createCanvas();
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx.scale) ctx.scale(dpr, dpr);
  return { canvas, ctx, W, H, dpr };
}

function screenOf(LayoutInst, cls) {
  let found = null;
  (function walk(el) {
    if (found) return;
    if ((el.className || '').split(/\s+/).indexOf(cls) >= 0) { found = el; return; }
    (el.children || []).forEach(walk);
  })(LayoutInst.children[0]);
  return found;
}

function flatten(LayoutInst) {
  const out = [];
  (function walk(el) { out.push(el); (el.children || []).forEach(walk); })(LayoutInst.children[0]);
  return out;
}

function renderPage(ctx, W, H, markup) {
  const prepared = CTX.prepare(markup);
  const styleSheet = CEFit.fit(STYLE, W, H);

  /* 自检：查不到上下文的元素 = 整套样式都没有（引擎按默认值画：黑底黑字、边距全丢） */
  const missing = [];
  CTX.walk(prepared.xml, (node) => { if (!styleSheet[node.path]) missing.push(node.path); });
  if (missing.length) {
    /* 兜底：把这些元素身上的行内样式（颜色 / 透明度这些）当场折一份挂到它们的类名上——
       上下文没了，但至少字是白的，不会"黑底黑字看不见"。 */
    Object.keys(prepared.inlines).forEach((cls) => {
      if (styleSheet[cls]) return;
      const st = CTX.inlineToStyle(prepared.inlines[cls]);
      if (Object.keys(st).length) styleSheet[cls] = st;
    });
    console.warn(`[CE] ${missing.length} 个元素的上下文样式没编进 ce-style.js（已用行内样式兜底，边距可能不对）：`
      + missing.slice(0, 4).map((p) => p.split('__').slice(-1)[0]).join(' / ')
      + ' → 重跑 node scripts/build-ce-style.js');
  }

  Layout.updateViewPort({ width: W, height: H });
  if (typeof Layout.clear === 'function') Layout.clear();
  Layout.init(prepared.xml, styleSheet);
  const root = Layout.children[0];
  if (root && root.style) { root.style.width = W; root.style.height = H; }
  Layout.layout(ctx);

  const scroller = root && root.children ? root.children.filter((c) => c.type === 'ScrollView')[0] : null;
  if (scroller) {
    const others = root.children.reduce((sum, c) => sum + (c === scroller ? 0 : (c.layoutBox && c.layoutBox.height) || 0), 0);
    const h = Math.max(120, Math.round(H - others));
    if (scroller.style.height !== h) { scroller.style.height = h; Layout.layout(ctx); }
  }
  return { Layout, root, scroller, styleSheet, missing };
}

/* 开发期（开发者工具里）打一张"版块位置小地图"：迁移期间靠它核对间距 */
function devtoolsLog(LayoutInst) {
  const screen = screenOf(LayoutInst, 'screen');
  if (!screen) return;
  const map = screen.children
    .filter((c) => c.type === 'View' || c.type === 'ScrollView')
    .map((c) => `${(c.className || '').split(/\s+/)[0]}@${Math.round(c.layoutBox.absoluteY)}+${Math.round(c.layoutBox.height)}`)
    .join(' ');
  console.log('[CE] 版块位置 ' + map);
}

function isDevtools() {
  try { return (wx.getSystemInfoSync ? wx.getSystemInfoSync().platform : '') === 'devtools'; } catch (e) { return false; }
}

module.exports = { Layout: () => Layout, available, setupCanvas, renderPage, devtoolsLog, isDevtools, flatten, screenOf };

};
__mods["./ce-app.js"] = function (module, exports, require) {
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
  const sub = SUBS[tab];
  const navTab = sub ? sub.tab : tab;
  const fn = S && S[((opts && opts.fn) || (sub && sub.fn) || SCREEN_FN[tab] || tab)];
  if (!fn) throw new Error('[CE] 网页版界面层没有这个页面：' + tab);
  return CEShell.shell(navTab, CEHtml.toXml(fn()), opts);
}


/* 新档开局（还没有存档时）：在引擎版里起名 + 选血统。
   以前这里直接 return null 退回旧的 canvas 界面 —— 手机上首次进入看到的就是旧版式，
   所以"随便点几页都没对齐"。现在新档也走这套界面。 */
const SETUP_NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];

function setupMarkup() {
  const D = window.DATA, Core = window.Core, S = Core.S;
  const cur = S.player.bloodline || '';
  const rows = Object.keys(D.BLOODLINES).map((k) => {
    const b = D.BLOODLINES[k] || {};
    const on = cur === k;
    return `<view class="list-row${on ? ' on' : ''}" data-bl="${k}" style="cursor:pointer;${on ? 'border-color:var(--gold)' : ''}">
      <view class="grow">
        <view class="t1"><text class="t1-t" value="${b.name || k}"/>${on ? '<text class="tag" style="color:var(--gold)" value="已选"/>' : ''}</view>
        <view class="t2"><text class="t2-t" value="${b.desc || '' }"/></view>
      </view>
      <text class="chev" value="${on ? '✓' : '›'}"/>
    </view>`;
  }).join('');
  const body = `
    <view class="section-title"><text class="section-title-t" value="起名"/></view>
    <view class="card">
      <view class="list-row" data-name="roll" style="cursor:pointer">
        <view class="grow"><view class="t1"><text class="t1-t" value="${S.player.name || '未命名'}"/></view>
        <view class="t2"><text class="t2-t" value="点一下换一个名字"/></view></view>
        <text class="chev" value="🎲"/>
      </view>
    </view>
    <view class="section-title"><text class="section-title-t" value="选一条血统"/></view>
    <view class="card">${rows}</view>
    <text class="hint mt2 blk">血统决定走哪条境界线，选定后不可更改。</text>
    <view class="btn-row mt2"><view class="btn primary block" data-setup="ok"><text class="btn-t" value="${cur ? '开始游戏' : '先选一条血统'}"/></view></view>
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

};
window.CEApp = require("./ce-app.js");
window.__CEENGINE = require("./ce-engine.js");
})();
