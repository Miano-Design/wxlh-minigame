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
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.U;
CV.setup(global.wx.getWindowInfo());

/* 记矩形：文字 / 按钮 / 卡片 */
const rawText = CV.text, rawBtn = U.btn, rawRound = CV.round;
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

Object.keys(CV.panels || {}).forEach((name) => {
  if (CHROME.indexOf(name) >= 0) return;
  RECTS.length = 0;
  let y0 = 0;
  try { CV.reset(name); } catch (e) { console.log('  ✗ ' + name + ' 渲染失败：' + e.message); issues++; return; }
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
});
console.log('\n' + (issues ? `结论：有 ${issues} 处版面碰撞/出画，要修` : '结论：所有页面的文字都没有出画、没有压按钮、没有掉出卡片 ✓'));
process.exit(issues ? 1 : 0);
