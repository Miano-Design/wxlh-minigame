/* 路线 B（引擎渲染）样式编译器：node scripts/build-ce-style.js
   ------------------------------------------------------------------------------
   网页版那套 CSS 是给浏览器用的（后代选择器、grid、gap、prefers、calc/env…），
   官方引擎只吃「单个类名 → 样式对象」。这个脚本负责把前者编译成后者：

     读入： ../wxlh-game/css/style.css（唯一真源，样式只在这里改）
            ce-extra.css（本工程独有，只放"canvas 里必须换写法"的那几条外壳规则）
            页面模板（js/ce-tpl-*.js）+ 样例数据（js/ce-home-data.js 的 sample）
     输出： js/ce-style.js      ——  { '上下文类名': {引擎样式} }，运行时直接喂给 Layout.init
            控制台报告          ——  有多少条规则被降级/丢弃，降级成什么

   编译期做的事（浏览器替我们做、而引擎不做的那些）：
     · CSS 变量展开、@media/@keyframes 丢弃
     · 后代选择器（.card .t1）→ 算完级联，挂到上下文类名上（见 js/ce-context.js）
     · display:grid + grid-template-columns → flex 换行 + 每格宽度百分比
     · 继承（color / font-size / text-align 等）显式写进子孙样式
     · 不支持的能力按"最接近的样子"降级：渐变色取首色、baseline→center、
       margin:auto→flex:1、position:fixed→留在文档流
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WEB_CSS = path.resolve(ROOT, '../wxlh-game/css/style.css');
const EXTRA_CSS = path.resolve(ROOT, 'ce-extra.css');
const OUT_JS = path.resolve(ROOT, 'js/ce-style.js');

/* ============================ 1. 读 CSS ============================ */
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }

/* 整块丢掉某个 at-rule（@media / @keyframes / @font-face…） */
function dropAtRule(src, name) {
  let out = '', i = 0, dropped = 0;
  for (;;) {
    const j = src.indexOf('@' + name, i);
    if (j < 0) { out += src.slice(i); break; }
    out += src.slice(i, j);
    let depth = 0, m = src.indexOf('{', j);
    if (m < 0) { i = src.length; continue; }
    for (; m < src.length; m++) {
      if (src[m] === '{') depth++;
      else if (src[m] === '}') { depth--; if (!depth) break; }
    }
    dropped++;
    i = m + 1;
  }
  return { css: out, dropped };
}

function collectVars(src) {
  const vars = {};
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(src))) vars[m[1]] = m[2].trim();
  return vars;
}

function expandVars(src, vars) {
  for (let i = 0; i < 6; i++) {
    src = src.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g, (all, name, fb) => {
      if (vars[name] !== undefined) return vars[name];
      return fb !== undefined ? fb.trim() : '0px';
    });
  }
  return src;
}

function parseDecls(body) {
  const out = [];
  body.split(';').forEach((part) => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const prop = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).trim();
    if (prop && val) out.push([prop, val]);
  });
  return out;
}

function parseRules(src) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m, order = 0;
  while ((m = re.exec(src))) {
    const selText = m[1].trim();
    if (!selText || selText.charAt(0) === '@') continue;
    const decls = parseDecls(m[2]);
    if (!decls.length) continue;
    rules.push({ selText, decls, order: order++ });
  }
  return rules;
}

/* ============================ 2. 选择器 ============================ */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const DROP_PSEUDO = /::(before|after|first-line|placeholder)|:(hover|focus|focus-visible|focus-within|first-child|last-child|nth-child|not|checked|disabled|placeholder-shown|active\b(?![^\s,]*\s*$))/;

/* 一条选择器 → [{tag, classes, id, pseudo, combinator}]；不支持的返回 {drop} */
function parseSelector(sel) {
  const raw = sel.trim();
  if (!raw) return { drop: '空' };
  if (/::(before|after|first-line|placeholder)/.test(raw)) return { drop: '伪元素' };
  if (/\[/.test(raw)) return { drop: '属性选择器' };
  if (/:(hover|focus|focus-visible|focus-within|first-child|last-child|nth-child|not|checked|disabled|placeholder-shown)/.test(raw)) {
    return { drop: '伪类' };
  }
  const norm = raw.replace(/\s*>\s*/g, ' > ').replace(/\s+/g, ' ');
  const toks = norm.split(' ');
  const parts = [];
  let comb = null;
  for (const tok of toks) {
    if (tok === '>') { comb = '>'; continue; }
    if (!tok) continue;
    const pseudo = /:active\b/.test(tok);
    const body = tok.replace(/:(active|any)\b/g, '');
    const idM = body.match(/#([\w-]+)/);
    const classM = body.match(/\.[\w-]+/g) || [];
    const tagM = body.match(/^[a-zA-Z][\w-]*/);
    parts.push({
      tag: tagM ? tagM[0] : null,
      id: idM ? idM[1] : null,
      classes: classM.map((c) => c.slice(1)),
      pseudo,
      combinator: parts.length ? (comb || ' ') : null,
    });
    comb = null;
  }
  if (!parts.length) return { drop: '空' };
  if (parts.some((p) => !p.tag && !p.id && !p.classes.length)) return { drop: '未识别' };
  let a = 0, b = 0, c = 0;
  parts.forEach((p) => { if (p.id) a++; b += p.classes.length + (p.pseudo ? 1 : 0); if (p.tag) c++; });
  return { parts, specificity: [a, b, c] };
}

function compoundMatch(part, node) {
  if (part.tag && part.tag !== node.tag) return false;
  if (part.id && part.id !== node.id) return false;
  for (const c of part.classes) if (node.classes.indexOf(c) < 0) return false;
  return true;
}

/* chain：根 → 当前元素 */
function selectorMatch(parts, chain) {
  let pi = parts.length - 1, ci = chain.length - 1;
  if (pi < 0 || ci < 0) return false;
  if (!compoundMatch(parts[pi], chain[ci])) return false;
  pi--;
  while (pi >= 0) {
    const rel = parts[pi + 1].combinator;
    if (rel === '>') {
      ci--;
      if (ci < 0 || !compoundMatch(parts[pi], chain[ci])) return false;
    } else {
      let found = -1;
      for (let k = ci - 1; k >= 0; k--) {
        if (compoundMatch(parts[pi], chain[k])) { found = k; break; }
      }
      if (found < 0) return false;
      ci = found;
    }
    pi--;
  }
  return true;
}

/* ============================ 3. 值 → 引擎样式 ============================ */
const NOTES = {};
let VARS = {};
/* 行内 style="..." 里的 var() 也要展开（模板里写了 style="color:var(--gold)"） */
function withVars(v) { return VARS && Object.keys(VARS).length ? expandVars(v, VARS) : v; }

/* 简写的多值：按顶层空格切（calc(...) / var(...) 里的空格不算） */
function splitValues(v) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of String(v)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function note(kind, prop, detail) {
  const key = kind + ' · ' + prop + (detail ? ' → ' + detail : '');
  NOTES[key] = (NOTES[key] || 0) + 1;
}

function evalCalc(expr) {
  const inner = expr.replace(/^\s*calc\(/i, '').replace(/\)\s*$/, '');
  if (/env\(/.test(inner) && !/\d/.test(inner)) return 0;
  const cleaned = inner.replace(/env\([^)]*\)/g, '0px').replace(/var\([^)]*\)/g, '0px');
  const toks = cleaned.split(/([+-])/).map((t) => t.trim()).filter((t) => t !== '');
  let sum = 0, sign = 1;
  for (const t of toks) {
    if (t === '+') { sign = 1; continue; }
    if (t === '-') { sign = -1; continue; }
    const px = t.match(/^(-?[\d.]+)px$/);
    const plain = t.match(/^(-?[\d.]+)$/);
    if (px) sum += sign * parseFloat(px[1]);
    else if (plain) sum += sign * parseFloat(plain[1]);
    else if (/%/.test(t)) return null;
  }
  return sum;
}

/* 长度：px / % / calc → 数字或 "NN%" */
function len(v) {
  const s = String(v).trim();
  if (/^\d*\.?\d+px$/.test(s)) return parseFloat(s);
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  if (/^\d*\.?\d+%$/.test(s)) return s;
  if (/^calc\(/i.test(s)) { const r = evalCalc(s); return r === null ? null : r; }
  if (s === 'auto' || s === 'none' || s === 'normal') return null;
  return null;
}

function pxLen(v) { const r = len(v); return typeof r === 'number' ? r : null; }

function parseColorToken(v) {
  const s = String(v).trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^rgba?\(/.test(s)) return s;
  if (/^[a-zA-Z]+$/.test(s)) return s;
  return null;
}

/* linear-gradient(...) 在引擎里画不出来：取第一个颜色当纯色近似 */
function gradientFirstColor(v) {
  const inner = String(v).slice(String(v).indexOf('(') + 1, String(v).lastIndexOf(')'));
  const parts = splitTop(inner, ',');
  for (let i = 1; i < parts.length; i++) {
    const c = parseColorToken(parts[i].trim().split(/\s+/)[0]);
    if (c && c !== 'transparent') return c;
  }
  const c0 = parseColorToken(parts[0] ? parts[0].trim().split(/\s+/)[0] : '');
  return c0 || null;
}

function setShorthand(out, prop, val, map) {
  const toks = splitValues(val);
  const v = toks.map((t) => len(t));
  if (v.some((x) => x === null)) { note('降级', prop + '（多值）', val); return; }
  /* 简写一律摊成四条边：引擎是"具体边优先"，只写 padding 覆盖不掉上一条规则的 paddingTop */
  if (v.length === 1) { out[map[0]] = v[0]; out[map[1]] = v[0]; out[map[2]] = v[0]; out[map[3]] = v[0]; out[map[4]] = v[0]; }
  else if (v.length === 2) { out[map[1]] = v[0]; out[map[2]] = v[1]; out[map[3]] = v[0]; out[map[4]] = v[1]; }
  else if (v.length === 3) { out[map[1]] = v[0]; out[map[2]] = v[1]; out[map[3]] = v[2]; out[map[4]] = v[1]; }
  else { out[map[1]] = v[0]; out[map[2]] = v[1]; out[map[3]] = v[2]; out[map[4]] = v[3]; }
}
const PAD = ['padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
const MAR = ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
const RAD = ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];

function parseBorderShorthand(out, prop, val, side) {
  const toks = val.split(/\s+/).filter(Boolean);
  const w = pxLen(toks[0]);
  const styleWords = /^(solid|dashed|dotted|double|none|hidden)$/;
  const colorTok = toks.find((t) => !styleWords.test(t) && !/^[\d.]+px$/.test(t) && parseColorToken(t));
  const styleTok = toks.find((t) => /^(solid|dashed|dotted|none)$/.test(t));
  if (w !== null) {
    if (!side) out.borderWidth = w;
    else out['border' + side + 'Width'] = w;
  }
  if (colorTok) {
    const c = parseColorToken(colorTok);
    if (!side) out.borderColor = c;
    else out['border' + side + 'Color'] = c;
  }
  if (styleTok === 'none' || (!styleTok && w === null)) {
    if (!side) out.borderWidth = 0; else out['border' + side + 'Width'] = 0;
  }
  if (styleTok === 'dashed' || styleTok === 'dotted') note('降级', 'border-style', styleTok + ' → 实线');
}

function convertDecls(decls, ctx) {
  const out = {};
  const meta = { gridCols: 0, gap: 0, lineHeightUnitless: null };
  /* left/top/right/bottom 只在绝对定位时才有意义；普通流里留着会把布局算成 NaN */
  const pendingPos = {};
  for (const [prop, rawVal] of decls) {
    const val = String(withVars(rawVal)).trim();
    if (/^(inherit|initial|unset|revert)$/.test(val)) { note('降级', prop, val + ' → 按继承处理'); continue; }
    switch (prop) {
      case 'width': case 'height': case 'min-width': case 'min-height': case 'max-width': case 'max-height': {
        const key = prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
        const v = len(val);
        if (v !== null) out[key] = v; else note('丢弃', prop, val);
        break;
      }
      case 'padding': setShorthand(out, prop, val, PAD); break;
      case 'margin':
        if (/auto/.test(val)) {
          if (/^(0\s+)?auto$/.test(val) || /^auto$/.test(val)) { note('降级', 'margin:auto', '父级居中→不居中'); }
          else { out.flex = 1; note('降级', 'margin-left:auto', 'flex:1'); }
          setShorthandSafe(out, prop, val.replace(/auto/g, '0'), MAR);
        } else setShorthand(out, prop, val, MAR);
        break;
      case 'margin-top': out.marginTop = pxLen(val) ?? 0; break;
      case 'margin-bottom': out.marginBottom = pxLen(val) ?? 0; break;
      case 'margin-left':
        if (val === 'auto') { out.flex = 1; note('降级', 'margin-left:auto', 'flex:1'); }
        else out.marginLeft = pxLen(val) ?? 0;
        break;
      case 'margin-right': out.marginRight = pxLen(val) ?? 0; break;
      case 'padding-top': out.paddingTop = pxLen(val) ?? 0; break;
      case 'padding-bottom': out.paddingBottom = pxLen(val) ?? 0; break;
      case 'padding-left': out.paddingLeft = pxLen(val) ?? 0; break;
      case 'padding-right': out.paddingRight = pxLen(val) ?? 0; break;
      case 'border': parseBorderShorthand(out, prop, val, null); break;
      case 'border-top': parseBorderShorthand(out, prop, val, 'Top'); break;
      case 'border-bottom': parseBorderShorthand(out, prop, val, 'Bottom'); break;
      case 'border-left': parseBorderShorthand(out, prop, val, 'Left'); break;
      case 'border-right': parseBorderShorthand(out, prop, val, 'Right'); break;
      case 'border-color': { const c = parseColorToken(val.split(/\s+/)[0]); if (c) out.borderColor = c; break; }
      case 'border-width': out.borderWidth = pxLen(val) ?? 0; break;
      case 'border-radius':
        if (/px/.test(val)) setShorthand(out, prop, val, RAD); else note('丢弃', prop, val);
        break;
      case 'background': case 'background-color': {
        if (/gradient\(/.test(val)) {
          const c = gradientFirstColor(val);
          if (c) { out.backgroundColor = c; note('降级', prop, '渐变 → 纯色 ' + c); }
          else note('丢弃', prop, val);
        } else if (/^url\(/.test(val)) note('丢弃', prop, '背景图');
        else {
          const c = parseColorToken(val);
          if (c) out.backgroundColor = c; else note('丢弃', prop, val);
        }
        break;
      }
      case 'color': { const c = parseColorToken(val); if (c) out.color = c; else note('丢弃', prop, val); break; }
      case 'font-size': { const v = pxLen(val); if (v !== null) out.fontSize = v; else note('丢弃', prop, val); break; }
      case 'font-weight': {
        if (/^(bold|bolder)$/.test(val)) out.fontWeight = 'bold';
        else if (/^\d+$/.test(val)) out.fontWeight = parseInt(val, 10) >= 600 ? 'bold' : 'normal';
        break;
      }
      case 'font-family':
        if (/^(inherit|initial|unset)$/.test(val)) break;   // 交给继承那一遍（引擎不做继承，我们在编译期显式写下去）
        out.fontFamily = val.replace(/["']/g, '').split(',')[0].trim();
        break;
      case 'line-height':
        if (/^\d*\.?\d+$/.test(val)) meta.lineHeightUnitless = parseFloat(val);
        else if (/px$/.test(val)) out.lineHeight = pxLen(val);
        else note('丢弃', prop, val);
        break;
      case 'letter-spacing': { const v = pxLen(val); if (v !== null) out.letterSpacing = v; else note('丢弃', prop, val); break; }
      case 'text-align':
        if (/^(left|center|right)$/.test(val)) out.textAlign = val; else note('丢弃', prop, val);
        break;
      case 'text-overflow':
        if (val === 'ellipsis') out.textOverflow = 'ellipsis'; else note('丢弃', prop, val);
        break;
      case 'white-space':
        if (/^(nowrap|normal|pre|pre-wrap|pre-line)$/.test(val)) out.whiteSpace = val; else note('丢弃', prop, val);
        break;
      case 'word-break':
        if (val === 'break-all') out.wordBreak = 'break-all'; else note('丢弃', prop, val);
        break;
      case 'text-shadow': out.textShadow = val.replace(/px/g, 'px'); break;
      case 'opacity': { const v = parseFloat(val); if (!isNaN(v)) out.opacity = v; break; }
      case 'display':
        if (val === 'grid' || val === 'inline-grid') { out.flexDirection = 'row'; out.flexWrap = 'wrap'; meta.isGrid = true; }
        else if (val === 'flex' || val === 'inline-flex') { out.flexDirection = out.flexDirection || 'row'; }
        else if (val === 'none') note('丢弃', prop, 'display:none（模板里别写这个节点）');
        break;
      case 'flex-direction':
        if (val === 'column' || val === 'row') out.flexDirection = val;
        else if (/column/.test(val)) { out.flexDirection = 'column'; note('降级', prop, val + ' → column'); }
        break;
      case 'flex-wrap':
        if (val === 'wrap' || val === 'nowrap') out.flexWrap = val;
        break;
      case 'flex': {
        const t = val.split(/\s+/);
        /* 引擎里的 css-layout 只认 `flex` 这个数字（不认 flexGrow / flexShrink），
           所以这里就把 flex 写成数字，别写 flexGrow——写了等于没写。 */
        if (t[0] === 'none') { out.flex = 0; break; }
        const g = parseFloat(t[0]);
        if (!isNaN(g)) out.flex = g;
        break;
      }
      case 'flex-grow': { const v = parseFloat(val); if (!isNaN(v)) out.flex = v; break; }
      case 'flex-shrink': { const v = parseFloat(val); if (!isNaN(v)) out.flexShrink = v; break; }
      case 'justify-content':
        if (/^(flex-start|center|flex-end|space-between|space-around)$/.test(val)) out.justifyContent = val;
        else if (val === 'start') out.justifyContent = 'flex-start';
        else if (val === 'end') out.justifyContent = 'flex-end';
        else note('丢弃', prop, val);
        break;
      case 'align-items':
        if (/^(flex-start|center|flex-end|stretch)$/.test(val)) out.alignItems = val;
        else if (val === 'baseline') { out.alignItems = 'center'; note('降级', prop, 'baseline → center'); }
        else if (val === 'start') out.alignItems = 'flex-start';
        else if (val === 'end') out.alignItems = 'flex-end';
        else note('丢弃', prop, val);
        break;
      case 'align-self':
        if (/^(flex-start|center|flex-end|stretch)$/.test(val)) out.alignSelf = val; else note('丢弃', prop, val);
        break;
      case 'position':
        if (val === 'absolute') out.position = 'absolute';
        else if (val === 'fixed') { note('降级', prop, 'fixed → 留在文档流'); }
        else if (val === 'relative' || val === 'static') { /* 引擎里默认就是普通流 */ }
        else note('丢弃', prop, val);
        break;
      case 'top': case 'bottom': case 'left': case 'right': {
        const v = len(val);
        if (v !== null) pendingPos[prop] = v; else note('丢弃', prop, val);
        break;
      }
      case 'gap': case 'row-gap': case 'column-gap': {
        const v = pxLen(val);
        if (v !== null) meta.gap = Math.max(meta.gap, v);
        else note('丢弃', prop, val);
        break;
      }
      case 'grid-template-columns': {
        const m = val.match(/repeat\(\s*(\d+)\s*,/);
        if (m) meta.gridCols = parseInt(m[1], 10);
        else {
          const parts = splitTop(val, ',').filter((x) => x.trim());
          if (parts.length > 1) meta.gridCols = parts.length;
          else note('丢弃', prop, val);
        }
        break;
      }
      case 'transform': note('丢弃', prop, val); break;
      case 'box-shadow': note('丢弃', prop, val); break;
      case 'overflow': case 'overflow-x': case 'overflow-y': case 'cursor': case 'user-select':
      case 'transition': case 'animation': case 'z-index': case 'pointer-events': case 'visibility':
      case 'backdrop-filter': case 'text-transform': case 'word-spacing': case 'vertical-align':
        note('丢弃', prop, val); break;
      default:
        if (prop.indexOf('-webkit') === 0 || prop.indexOf('scrollbar') >= 0) { note('丢弃', prop, val); break; }
        note('丢弃', prop, val);
    }
  }
  if (out.position === 'absolute') Object.assign(out, pendingPos);
  return { style: out, meta };
}

function setShorthandSafe(out, prop, val, map) {
  const toks = val.split(/\s+/).filter(Boolean);
  if (toks.some((t) => len(t) === null)) return;
  setShorthand(out, prop, toks.join(' '), map);
}

/* ============================ 4. 页面模板 ============================ */
const PAGES = [
  { name: 'home', tpl: 'js/ce-tpl-home.js', data: 'home' },
];

function loadPages() {
  const sample = require(path.resolve(ROOT, 'js/ce-home-data.js')).sample();
  return PAGES.map((p) => {
    const prepared = ctxMod.prepare(require(path.resolve(ROOT, p.tpl))(sample));
    return { name: p.name, markup: prepared.xml, inlines: prepared.inlines };
  });
}

/* ============================ 5. 主流程 ============================ */
const ctxMod = require(path.resolve(ROOT, 'js/ce-context.js'));

function main() {
  let css = stripComments(fs.readFileSync(WEB_CSS, 'utf8'));
  for (const at of ['media', 'keyframes', 'font-face', 'supports', 'import', 'charset']) {
    const r = dropAtRule(css, at);
    if (r.dropped) { CSS_DROPPED[at] = r.dropped; css = r.css; }
  }
  const vars = collectVars(css);
  VARS = vars;
  css = expandVars(css, vars);

  let extra = '';
  if (fs.existsSync(EXTRA_CSS)) extra = expandVars(stripComments(fs.readFileSync(EXTRA_CSS, 'utf8')), vars);

  const rules = parseRules(css + '\n' + extra);

  /* 展开选择器 + 预筛 */
  const compiled = [];
  rules.forEach((r) => {
    splitTop(r.selText, ',').forEach((one) => {
      const p = parseSelector(one);
      if (p.drop) { SEL_DROPPED[p.drop] = (SEL_DROPPED[p.drop] || 0) + 1; return; }
      compiled.push({ parts: p.parts, specificity: p.specificity, order: r.order, decls: r.decls });
    });
  });

  /* 收集所有页面的元素（含祖先链），顺便算每个元素的 inline style */
  const elements = [];
  loadPages().forEach((page) => {
    ctxMod.walk(page.markup, (node, ancestors) => {
      const isxCls = node.classes.filter((c) => page.inlines[c] !== undefined);
      const inlineDecls = isxCls.length ? parseDecls(page.inlines[isxCls[0]]) : null;
      elements.push({ page: page.name, node, ancestors, inlineDecls });
    });
  });

  /* 每个元素：匹配规则 → 合并声明 → 转引擎样式 */
  const styles = {};
  const inlineOf = {};
  elements.forEach((el) => {
    const node = el.node, ancestors = el.ancestors;
    const chain = ancestors.concat([node]);
    const matched = [];
    for (const r of compiled) {
      if (r.parts.some((p) => p.pseudo)) continue;
      if (selectorMatch(r.parts, chain)) matched.push(r);
    }
    matched.sort((a, b) => {
      for (let i = 0; i < 3; i++) { if (a.specificity[i] !== b.specificity[i]) return a.specificity[i] - b.specificity[i]; }
      return a.order - b.order;
    });
    let decls = [];
    matched.forEach((r) => { decls = decls.concat(r.decls); });
    const conv = convertDecls(decls, {});
    /* :active 单独一层（引擎支持 IStyle[':active']） */
    const activeDecls = [];
    for (const r of compiled) {
      if (!r.parts.some((p) => p.pseudo)) continue;
      const plain = { parts: r.parts.map((p) => Object.assign({}, p, { pseudo: false })) };
      if (selectorMatch(plain.parts, chain)) activeDecls.push(r);
    }
    if (activeDecls.length) {
      let ad = [];
      activeDecls.forEach((r) => { ad = ad.concat(r.decls); });
      const aconv = convertDecls(ad, {});
      if (Object.keys(aconv.style).length) conv.style[':active'] = aconv.style;
    }
    conv.node = node;
    conv.ancestors = ancestors;
    conv.inline = el.inlineDecls ? convertDecls(el.inlineDecls, {}).style : null;
    conv.grid = conv.meta;
    styles[node.path] = conv;
    if (conv.inline) inlineOf[node.path] = conv.inline;
  });

  /* 继承：把 color / font-size 这类可继承样式显式写进子孙（引擎不做继承） */
  const INHERIT = ['color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign', 'whiteSpace', 'wordBreak', 'textOverflow'];
  elements.forEach(({ node, ancestors }) => {
    const conv = styles[node.path];
    let inherited = {};
    ancestors.forEach((a) => {
      const s = styles[a.path].style;
      INHERIT.forEach((k) => { if (s[k] !== undefined) inherited[k] = s[k]; });
    });
    const own = Object.assign({}, inherited, conv.inline || {}, conv.style);
    conv.style = own;
    if (conv.meta.lineHeightUnitless) own.lineHeight = Math.round((own.fontSize || 12) * conv.meta.lineHeightUnitless);
  });

  /* 网格：容器已改成 flex 换行，这里把每格宽度算出来（gap 用格子内边距近似） */
  elements.forEach(({ node, ancestors }) => {
    const parent = ancestors.length ? styles[ancestors[ancestors.length - 1].path] : null;
    const conv = styles[node.path];
    if (parent && parent.meta && parent.meta.isGrid && parent.meta.gridCols) {
      const cols = parent.meta.gridCols;
      conv.style.width = (100 / cols).toFixed(4) + '%';
      const gap = parent.meta.gap || 0;
      if (gap > 0 && node.classes.indexOf('cell') >= 0) {
        conv.style.paddingTop = gap / 2;
        conv.style.paddingRight = gap / 2;
        conv.style.paddingBottom = gap / 2;
        conv.style.paddingLeft = gap / 2;
      }
      note('映射', 'grid', cols + ' 列 → flex 换行 + 宽 ' + (100 / cols).toFixed(2) + '%');
    }
  });

  /* gap：引擎没有 gap 这个东西，摊成子元素的边距（横排给右边距，换行或竖排再给下边距） */
  elements.forEach((el) => {
    const conv = styles[el.node.path];
    const gap = conv.meta && conv.meta.gap;
    if (!gap || conv.meta.isGrid) return;
    const row = conv.style.flexDirection !== 'column';
    const wrap = conv.style.flexWrap === 'wrap';
    elements.forEach((k) => {
      if (!k.ancestors.length || k.ancestors[k.ancestors.length - 1].path !== el.node.path) return;
      const s = styles[k.node.path].style;
      if (row) s.marginRight = gap;
      if (wrap || !row) s.marginBottom = gap;
    });
    note('映射', 'gap', gap + 'px → 子元素边距');
  });

  /* 兜底：单个类名的样式（万一运行时出现样例里没有的上下文，至少不至于裸奔） */
  const bare = {};
  elements.forEach(({ node }) => {
    node.classes.forEach((cls) => {
      const fake = { tag: node.tag, classes: [cls], id: '' };
      const matched = [];
      for (const r of compiled) {
        if (r.parts.some((p) => p.pseudo)) continue;
        if (selectorMatch(r.parts, [fake])) matched.push(r);
      }
      if (!matched.length) return;
      matched.sort((a, b) => {
        for (let i = 0; i < 3; i++) { if (a.specificity[i] !== b.specificity[i]) return a.specificity[i] - b.specificity[i]; }
        return a.order - b.order;
      });
      let decls = [];
      matched.forEach((r) => { if (r.parts.length === 1) decls = decls.concat(r.decls); });
      const conv = convertDecls(decls, {});
      bare[cls] = Object.assign(bare[cls] || {}, conv.style);
    });
  });

  const out = {};
  Object.keys(bare).forEach((k) => { out[k] = bare[k]; });
  Object.keys(styles).forEach((k) => {
    const s = styles[k].style;
    const cleaned = {};
    Object.keys(s).forEach((p) => { if (s[p] !== undefined && s[p] !== null) cleaned[p] = s[p]; });
    if (Object.keys(cleaned).length) out[k] = cleaned;
  });

  const header = '/* 自动生成，不要手改：node scripts/build-ce-style.js\n'
    + '   来源：../wxlh-game/css/style.css + ce-extra.css，按元素上下文算好的引擎样式表。\n'
    + '   生成时间：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' */\n';
  fs.writeFileSync(OUT_JS, header + 'module.exports = ' + JSON.stringify(out, null, 1) + ';\n', 'utf8');

  /* ---------- 报告 ---------- */
  console.log(`样式表已生成：js/ce-style.js（${Object.keys(out).length} 条，${(fs.statSync(OUT_JS).size / 1024).toFixed(1)}KB）`);
  console.log(`元素 ${elements.length} 个 · CSS 规则 ${rules.length} 条 · 展开选择器 ${compiled.length} 条`);
  if (Object.keys(CSS_DROPPED).length) console.log('整块丢弃的 at-rule：', CSS_DROPPED);
  if (Object.keys(SEL_DROPPED).length) console.log('整条丢弃的选择器：', SEL_DROPPED);
  const groups = {};
  Object.keys(NOTES).sort().forEach((k) => { const g = k.split(' · ')[0]; (groups[g] = groups[g] || []).push(k + '  ×' + NOTES[k]); });
  Object.keys(groups).forEach((g) => {
    console.log(`\n【${g}】${groups[g].length} 类`);
    groups[g].slice(0, 40).forEach((l) => console.log('  ' + l));
    if (groups[g].length > 40) console.log('  …还有 ' + (groups[g].length - 40) + ' 类');
  });
}

const CSS_DROPPED = {};
const SEL_DROPPED = {};
main();
