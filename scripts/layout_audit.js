/* 版面碰撞体检：node scripts/layout_audit.js
   ------------------------------------------------------------------------------
   为什么要有这一把（V9.6.143，父亲大人连着报了三次"排版有问题"）：
   现有的尺子只验"文字有没有画出来 / 有没有被省略号砍"，**验不了"画出来之后压在一起"**：
     · 文字画到卡片外面（出画）
     · 文字压在按钮上（药园那次就是：说明行压在"播种"按钮下面）
     · 两行文字上下压在一起（行高算错）
   做法：把每次 CV.text / U.btn / 卡片圆角矩形都记成**矩形**，然后按几何关系查三类问题。
   只读脚本，只调 Core.newGame()。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
/* 字宽模型：中文≈1×字号、西文≈0.55×字号、emoji≈1.1×字号。
   ⚠️ 以前这里写死 13/7 —— 字号 11px 的行会被**高估近两成**，
   于是"刚好放得下"的地方全被误报成"压到按钮上"（假警报比真问题还多）。 */
function charW(ch, size) {
  const c = ch.codePointAt(0);
  if (c > 0x1F000) return size * 1.1;
  return c > 127 ? size : size * 0.55;
}
const RECTS = [];
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(t.font || ''));
      const size = m ? +m[1] : 11;
      return { width: Array.from(String(s == null ? '' : s)).reduce((a, c) => a + charW(c, size), 0) };
    };
    if (k === 'fillText') return () => {};
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  /* V1.1.11：**必须有 createImage** —— 没有它，uiw.js 里那份题字图会走"图没到位"的兜底活字，
     于是 ⑥ 量到的是**兜底那一版的排版**，而真机上跑的是图片那一版（量错了还全绿）。
     这里给一个"同步就绪"的假图（尺寸按落位资源 1000×469），让尺子量的就是线上真正会画的那一版。 */
  createImage: () => ({ width: 1000, height: 469, set src(v) { if (this.onload) this.onload(); } }),
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.U;
CV.setup(global.wx.getWindowInfo());

/* 记矩形：文字 / 按钮 / 卡片 / 题字图 */
const rawText = CV.text, rawBtn = U.btn, rawRound = CV.round, rawBrand = U.brandTitle;
/* V1.1.11：品牌题字换成了**图片**（父亲大人自制 `icons/logo-title.png`，走 ctx.drawImage）。
   ① 只包 `U.brandTitle` 这一个出口 —— **不能去包 ctx.drawImage**：开机首屏那张提灯者底图也是
      drawImage，一包它就会多出一条"整屏大矩形"，而 ⑥ 用 `find` 取到的正好是它（实测：量出 33.5%，
      假的）；② 不包的话 ⑥ 找不到标题，会报"查不了"（本尺子自己写过"别让它静默变绿"）。 */
if (typeof U.brandTitle === 'function') {
  U.brandTitle = function (x, y, w) {
    const h = rawBrand.apply(U, arguments);
    note('img', x, y, w, h, '残域灯阁');
    return h;
  };
}
/* 引导气泡 / 弹层是**覆盖在正文之上**的，跟正文比碰撞全是假警报
   （实测：法宝页那条"天罡印掉出卡片底"，其实是气泡的圆角矩形把它框进去了）。
   所以覆盖层绘制期间记的矩形一律丢掉。 */
let IN_OVERLAY = false;
['drawCoach', 'drawOverlay'].forEach((fn) => {
  const raw = U[fn];
  if (typeof raw !== 'function') return;
  U[fn] = function () { IN_OVERLAY = true; try { return raw.apply(U, arguments); } finally { IN_OVERLAY = false; } };
});
function note(kind, x, y, w, h, label) { if (IN_OVERLAY) return; RECTS.push({ kind, x, y, w, h, label: String(label || '').slice(0, 30) }); }
CV.text = function (str, x, y, opt) {
  opt = opt || {};
  const s = (global.CV.GLYPHS ? String(str == null ? '' : str) : String(str == null ? '' : str));
  const size = opt.size || CV.FS.lg;
  const w = CV.measure(s, size, opt.bold);
  const align = opt.align || 'left';
  const x0 = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
  note('text', x0, y - size * 0.75, w, size * 1.5, String(str));
  return rawText.apply(CV, arguments);
};
U.btn = function (x, y, w, h, label, style, id) {
  note('btn', x, y, w, h, label + (id ? '' : '（不可点）'));
  return rawBtn.apply(U, arguments);
};
CV.round = function (x, y, w, h, r, fill, stroke, lw) {
  if (w > 200 && h > 24) note('card', x, y, w, h, 'card');
  return rawRound.apply(CV, arguments);
};

/* 铺一个"什么都开"的档 */
Core.newGame();
Core.setPlayerName('版面');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}
(D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 1234567));
try { Core.addItem(D.BEAST_EGG_ITEM, 90); Core.hatchBeast(10); } catch (e) {}
['fb01', 'fb07'].forEach((id) => { try { Core.buyFabao(id); } catch (e) {} });
['mt01', 'mt05'].forEach((id) => { try { Core.buyMount(id); } catch (e) {} });
try { Core.addChar(D.characters[0].id); Core.S.party = ['@player', D.characters[0].id, null, null, null]; } catch (e) {}
['mat_t1', 'mat_t5'].forEach((k) => { try { Core.addItem(k, 60); } catch (e) {} });
Object.keys(Core.S.worlds || {}).forEach((w) => { const v = Core.S.worlds[w]; if (v && v.stages) Object.keys(v.stages).forEach((d) => { v.stages[d] = v.stages[d].map(() => 3); }); });

const CHROME = ['welcome', 'create', 'bloodline', 'battle'];
const SKIP_HINT = /^(距下一次|距离下一次)/;          // 游历倒计时在顶部栏里，不参与
let issues = 0;
function inContent(r) { return r.y > CV.TOP - 2 && r.y + r.h < CV.H - CV.NAV_BASE - 2; }

/* V1.1.11（康康 09-27）：**这一段原来只在 390×844 上跑一遍** —— 于是"小屏出画"它一直看不见：
   父亲大人报的「小屏幕背包显示有问题」就是这条盲区漏掉的（背包格子宽度有 62pt 下限，
   320 宽的屏上 5 列硬撑出屏幕、第 5 列被切掉一半，**而当时所有尺子全绿**）。
   现在**每个页面 × 三种机型各扫一遍**，报错行后面带机型，定位更快。 */
const SWEEP = [[390, 844, ''], [320, 568, ' @320×568'], [430, 932, ' @430×932']];
SWEEP.forEach(([sw, sh, sizeTag]) => {
CV.setup({ windowWidth: sw, windowHeight: sh, pixelRatio: 3, safeArea: { top: 44, bottom: sh - 34 } });
Object.keys(CV.panels || {}).forEach((rawName) => {
  const name = rawName + sizeTag;
  if (CHROME.indexOf(rawName) >= 0) return;
  RECTS.length = 0;
  let y0 = 0;
  try { CV.reset(rawName); } catch (e) { console.log('  ✗ ' + name + ' 渲染失败：' + e.message); issues++; return; }
  /* 只看**正文区**：顶栏 / 底栏是"全局装饰"，跟正文按钮比会一堆假警报
     （比如设置页那颗「❓ 玩法指南」和顶栏的货币数值）。 */
  const texts = RECTS.filter(r => r.kind === 'text' && String(r.label).trim() && inContent(r));
  const btns = RECTS.filter(r => r.kind === 'btn' && inContent(r));
  /* 卡片去重：U.card 是先量后画，同一条卡片会记两次（fill + stroke）。
     不去重的话后面每条问题都会报两遍。 */
  const seen = {};
  const cards = RECTS.filter(r => r.kind === 'card').filter(c => {
    const k = [Math.round(c.x), Math.round(c.y), Math.round(c.w), Math.round(c.h)].join(',');
    if (seen[k]) return false;
    seen[k] = 1; return true;
  });
  // ① 出画：文字超出左右边界
  texts.forEach(t => {
    if (t.x < 1 || t.x + t.w > CV.W - 1) { issues++; console.log(`  ✗ ${name}：文字出画「${t.label}」（x=${Math.round(t.x)} 右=${Math.round(t.x + t.w)}，画布宽 ${CV.W}）`); }
  });
  // ② 文字压在按钮上（同一水平带、水平区间重叠）
  texts.forEach(t => {
    btns.forEach(b => {
      /* 按钮上那行字**本来就是它自己的标签**（CV.text 画在按钮矩形里）。
         排除"文字完全落在按钮内"和"文字就是按钮文案"这两种。 */
      const insideBtn = t.x >= b.x - 2 && t.x + t.w <= b.x + b.w + 2 && t.y >= b.y - 2 && t.y + t.h <= b.y + b.h + 2;
      if (insideBtn || String(t.label) === String(b.label).replace(/（不可点）$/, '')) return;
      const vOverlap = Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y);
      const hOverlap = Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x);
      if (vOverlap > t.h * 0.6 && hOverlap > 8) {
        issues++;
        console.log(`  ✗ ${name}：文字压在按钮上「${t.label}」×「${b.label}」（重叠 ${Math.round(hOverlap)}×${Math.round(vOverlap)}）`);
      }
    });
  });
  /* ③ 文字超出它**所在**卡片的底边。
     关键：先判定"这段文字属于哪张卡"——取**包住它顶边的最内层**卡片，
     不能拿"y 在卡片范围 +40 以内"去凑（那样会把下一张卡的字也算进来，全是假警报）。 */
  texts.forEach(t => {
    let home = null;
    cards.forEach(c => {
      /* 用**中线**判定归属：底部导航那几行正好贴着最后一张卡的下沿，
         只按"顶边在卡里"会把它算进卡片、然后报"掉出卡片底"（全是假警报）。 */
      const mid = t.y + t.h / 2;
      if (mid >= c.y && mid <= c.y + c.h && (!home || c.h < home.h)) home = c;
    });
    if (!home) return;
    if (t.y + t.h > home.y + home.h + 2) {
      issues++;
      console.log(`  ✗ ${name}：文字掉出卡片底「${t.label}」（文字底 ${Math.round(t.y + t.h)}，卡片底 ${Math.round(home.y + home.h)}）`);
    }
  });
  /* ================= ④⑤ V1.1.12（0927-B · 交互复审补的两条盲区）=================
     这一轮父亲大人报的"小屏背包"之所以一直没被抓住，根因就是**页面级排版只在一个尺寸上检过** ——
     康康把这一段扩成三机型之后，**同一次盲区里的另外两类问题仍没人管**，所以在这里补上：

     ④ **热区尺寸 ≥88rpx**（《专业基准》交互档的硬指标）：
        以前全站只有"热区有没有处理器"这条尺子，**没有一条量尺寸** ——
        实测（改前）**309 处一维不够、51 处两维都不够**（每个页面的返回键 40×40 就在其中）。
        ⚠️ 判"**有效**热区"：`U.card` 是先量后画，卡里的按钮会被登记两次；而且"整张卡可点"那种设计下，
           小按钮是被**更大的卡片热区**包住的 —— 那些不算问题（手指点到的是那张卡）。
           所以先剔掉"中心被另一个更大的同坐标系热区包住"的那些，再量剩下那层的尺寸。
     */
  {
    /* 88rpx ≙ **44pt**（《专业基准》括注给的物理口径）。
       ⚠️ 不按屏宽重新换算：画布端按钮高度是绝对 pt、不随屏宽伸缩，按屏宽算会在 430 上变成 50.4pt，
          比物理基准更严 → "同一颗按钮在大屏上反而不合格"（实测 430 上多出 6 条假红）。 */
    const minPx = 44;
    const area = (r) => r.w * r.h;
    const all = (CV.hits || []).filter((h) => h.space !== 'modal');
    const tops = all.filter((h) => !all.some((o) => o !== h && o.screen === h.screen
      && area(o) > area(h)
      && h.x + h.w / 2 >= o.x && h.x + h.w / 2 <= o.x + o.w
      && h.y + h.h / 2 >= o.y && h.y + h.h / 2 <= o.y + o.h));
    const small = tops.filter((h) => h.w < minPx - 0.5 || h.h < minPx - 0.5);
    if (small.length) {
      issues += small.length;
      small.slice(0, 8).forEach((h) => console.log(`  ✗ ${name}：热区小于 88rpx「${h.id}」${Math.round(h.w)}×${Math.round(h.h)}（本机型下限 ${minPx.toFixed(1)}）`));
      if (small.length > 8) console.log(`  … ${name} 还有 ${small.length - 8} 处同类`);
    }
  }
  /* ⑤ **被省略号砍掉的文字**（按机型）
     同一个盲区的另一半：`page_text_audit` 里那条"不许出现 …"**只在 390 上跑**，
     而窄屏上正是最容易被砍的（背包 5 列格子名字在 320 上变「异界征…」就是这么漏掉的）。
     这里在**每个机型**上再盯一遍（玩法指南豁免：那是成段说明文，正文自带省略号）。 */
  if (rawName !== 'guide') {
    const cut = texts.filter((t) => String(t.label).indexOf('…') >= 0);
    if (cut.length) {
      issues += cut.length;
      cut.slice(0, 6).forEach((t) => console.log(`  ✗ ${name}：文字被省略号砍「${t.label}」`));
    }
  }
});
});   // ← 三机型循环（V1.1.11）
/* ============================================================================
   ⑥ 构图：**主画面那一块必须落在画面纵向中部**（V1.0.6 加）
   ----------------------------------------------------------------------------
   为什么补这一条（2026-09-23 父亲大人一眼看出来的）：
     小游戏主画面「品牌两行 ＋【进入残域】」当时挤在顶部四分之一（块纵向中心 ≈18%），
     网页版是 51% —— 两端差了 33 个百分点，而**当时所有尺子全绿**：
     page_smoke 只管"渲染不抛错"、layout_audit 只管"有没有压在一起 / 出画 / 掉出卡片"、
     visual_audit 只管"色 / 字 / 圆角有没有走令牌"……**没有一条管"排在哪"**。
     所以这里补一条几何断言：量**画出来的**矩形（不是读源码里的数字），块纵向中心必须落在 40%~60%。
   三种机型各算一遍（短屏 / 常见 / 长屏），防止"只在一台机器上居中"。
   坐标换算：内容层从 `CV.TOP + 8` 起画（见 cv.js 的 translate），gate 是 chromeless 页
   → CV.TOP = CV.safeTop，且内容不满一屏、不滚动。 */
console.log('\n=== ⑥ 构图：主画面（品牌 ＋【进入残域】）整块落在画面纵向中部（40%~60%，且不比几何中心低）===');
const COMPOSE = [];
[[320, 568, '短屏 SE 类'], [390, 844, '常见'], [430, 932, '长屏 Pro Max 类']].forEach((row) => {
  const [w, h, label] = row;
  CV.setup({ windowWidth: w, windowHeight: h, pixelRatio: 3, safeArea: { top: 44, bottom: h - 34 } });
  RECTS.length = 0;
  try { CV.reset('gate'); } catch (e) { issues++; console.log(`  ✗ gate @${w}×${h} 渲染失败：${e.message}`); return; }
  /* V1.1.11：标题从活字换成了题字图（drawImage 记成 kind:'img'）—— 两种都认。
     认不出就报错（别静默变绿），这正是这条断言当初写下的话。 */
  const title = RECTS.find((r) => (r.kind === 'img' || r.kind === 'text') && r.label === '残域灯阁');
  const btn = RECTS.find((r) => r.kind === 'btn' && r.label.indexOf('进入残域') >= 0);
  if (!title || !btn) {
    issues++; console.log(`  ✗ gate @${w}×${h}：找不到品牌标题或【进入残域】按钮 —— 这条断言查不了（别让它静默变绿）`);
    return;
  }
  /* 内容坐标 → 屏幕坐标：+CV.TOP(=safeTop) +8，再减滚动量（gate 不滚） */
  const base = CV.TOP + 8 - (CV.scroll || 0);
  const top = base + title.y;                 // 标题字框上沿（CV.text 记的是 baseline-0.75em）
  const bottom = base + btn.y + btn.h;        // 按钮下沿
  const centerPct = ((top + bottom) / 2) / CV.H * 100;
  /* 可视窗（安全区）中心：块该落在这条线上，或**略高**（光学中心 / 让开右下主体）。 */
  const viewCenterPct = ((CV.safeTop + 8) + (CV.H - CV.safeBottom)) / 2 / CV.H * 100;
  const ok = centerPct >= 40 && centerPct <= 60;
  if (!ok) {
    issues++;
    console.log(`  ✗ gate @${w}×${h}（${label}）：主画面那块**没有居中** —— 块纵向中心 ${centerPct.toFixed(1)}%`
      + `（要求 40%~60%）· 块高 ${Math.round(bottom - top)}px`);
  }
  if (centerPct > viewCenterPct + 0.5) {
    issues++;
    console.log(`  ✗ gate @${w}×${h}（${label}）：块掉到可视窗中心线**下面**了（${centerPct.toFixed(1)}% > ${viewCenterPct.toFixed(1)}%）`
      + ` —— 主体（提灯者）在右下，块只许落在中心线上下不越界`);
  }
  COMPOSE.push(`${w}×${h} ${centerPct.toFixed(1)}%（可视窗中心 ${viewCenterPct.toFixed(1)}%）`);
});
if (!issues) console.log('  三种机型：' + COMPOSE.join(' · ') + ' ✓');

/* ============================================================================
   ⑦ 顶栏四颗货币：**最小机型也放得下**（V1.0.6 · 父亲大人「B，收口」）
   ----------------------------------------------------------------------------
   起因：网页端顶栏那四颗从"文字字形"换成自绘 SVG 时，上一单列过一条代价——
   "顶栏四颗宽度会变，要核最小机型放得下"。画布端这一排是自绘的，宽度由自己算，
   所以这里拿**画布端**当实测：320×568（短屏）与 390×844 各跑一遍，顶栏那一条里
   ① 每段文字都不许出画（x<0 或 x+w>W）；② 四颗的数值不许横向叠在一起。
   网页端同一条按令牌算（见 wxlh-game/scripts/visual_audit.js ⑩：grid 1fr 等分 + min-width:0
   + 数字溢出走省略号 ⇒ 结构上不可能撑破行；两边结论写在同一张回单里）。 */
console.log('\n=== ⑦ 顶栏四颗货币：最小机型放得下（320×568 / 390×844）===');
[[320, 568, '短屏 iPhone 5/SE 档'], [390, 844, '常见']].forEach((row) => {
  const [w, h, label] = row;
  CV.setup({ windowWidth: w, windowHeight: h, pixelRatio: 3, safeArea: { top: 44, bottom: h - 34 } });
  Core.newGame();
  ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 9876543));
  RECTS.length = 0;
  try { CV.reset('home'); } catch (e) { issues++; console.log(`  ✗ home @${w}×${h} 渲染失败：${e.message}`); return; }
  const bar = RECTS.filter((r) => r.kind === 'text' && r.y < 120 && String(r.label).trim());
  const out = bar.filter((r) => r.x < -0.5 || r.x + r.w > CV.W + 0.5);
  if (out.length) {
    issues++;
    console.log(`  ✗ 顶栏 @${w}×${h}（${label}）：有 ${out.length} 段文字出画 —— `
      + out.slice(0, 3).map((r) => `「${r.label}」右沿 ${Math.round(r.x + r.w)}>${CV.W}`).join(' / '));
  }
  /* 数值文本：允许被 `CV.fit` 截断成"988万…"那种形态（裁短是**有意**的降级，不是问题） */
  const vals = bar.filter((r) => /^[\d.]+万?…?$/.test(String(r.label).replace(/[,\s]/g, '')));
  if (vals.length !== 4) {
    issues++;
    console.log(`  ✗ 顶栏 @${w}×${h}（${label}）：只量到 ${vals.length} 颗数值（应当 4 颗）——`
      + ' 这条断言不许"空着变绿"，先查顶栏是不是没画出来');
  }
  let ov = 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i].x < vals[i - 1].x + vals[i - 1].w - 1) ov++;
  }
  if (ov) { issues++; console.log(`  ✗ 顶栏 @${w}×${h}（${label}）：四颗数值有 ${ov} 处横向叠住`); }
  if (!out.length && !ov) {
    console.log(`  ✓ 顶栏 @${w}×${h}（${label}）：${vals.length} 颗数值全在画内、互不叠（最大 ${vals.map((r) => r.label).join(' / ')}）`);
  }
});

console.log('\n' + (issues ? `结论：有 ${issues} 处版面碰撞/出画/构图问题，要修` : '结论：所有页面的文字都没有出画、没有压按钮、没有掉出卡片，主画面整块纵向居中，顶栏四颗最小机型放得下 ✓'));
process.exit(issues ? 1 : 0);
