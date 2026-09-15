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
