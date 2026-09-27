/* 卡内净距体检：node scripts/inset_audit.js
   ------------------------------------------------------------------------------
   为什么要有这一把（V1.0.6，父亲大人 09-24 反馈图 05 / 08：「贴了」）：
   现有的四把尺子各管一段，**没有一把管"元素贴没贴住"**：
     · layout_audit  ：文字出画 / 压按钮 / 两行叠在一起（管的是"撞上"）；
     · spacing_audit ：组件间距是否走 8 的台阶（管的是"数值合不合规"）；
     · page_text_audit / visual_audit：文案在不在、图标同不同源。
   于是"说明行与按钮之间只剩 1px"这种**看起来粘住**的版式问题，四把尺子全绿也抓不到 ——
   它既没有"撞上"（1px 不算重叠），也不违反台阶（那 1px 根本不是设计值，是漏了网页版的 .mb2）。
   这一把专治它，判据全部来自网页版 css/style.css：
     R1 卡内净距：.card 是 `padding: var(--sp3)` = 14px，内容左右净距不得小于 10px
        （留 4px 容差给描边/圆角），也就是"内容不许越出卡片内边距"；
     R2 按钮贴字：网页版的按钮上方**永远**有量 —— 要么跟在一个 `.note/.hint.mb2` 后面（10px），
        要么自带 `style="margin-top:0.625rem"`（10px），要么和文字同行（.list-row 的 flex 兄弟）。
        所以"按钮上沿与上方文字块下沿的净距 < 3px"＝漏了那 10px，判红。
        （门槛取 3 而不是 8：网页版也有 0~5px 的合法情形（.kv 直连 .btn-row），
          但 0~2px 在任何一版里都不是设计值 —— 那种"粘住"就是漏量。）
   只读脚本，只调 Core.newGame()，不起模拟器。
   改坏试验（必须能红）：把 sc-lines.js 里「佩戴」那张卡的 `U.space(CV.SP[2])` 注释掉 →
    应报 `✗ [fabao_detail] 按钮「摘下」上方净距 1.2 < 3`；恢复后转绿。 */
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
/* 字宽模型与 layout_audit 同一套（中文≈字号 / 西文≈0.55 / emoji≈1.1） */
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

let IN_OVERLAY = false;
['drawCoach', 'drawOverlay'].forEach((fn) => {
  const raw = U[fn];
  if (typeof raw !== 'function') return;
  U[fn] = function () { IN_OVERLAY = true; try { return raw.apply(U, arguments); } finally { IN_OVERLAY = false; } };
});
/* screen 标记：顶栏 / 底栏 / 吸顶条画在**屏幕坐标**里，跟卡片的内容坐标不是一套 ——
   混在一起比会把"底栏那四个页签"当成卡片里的元素（第一版就踩了这个假警报）。 */
function note(kind, x, y, w, h, label) {
  if (IN_OVERLAY) return;
  RECTS.push({ kind, x, y, w, h, screen: CV.hitMode !== 'content', label: String(label || '').slice(0, 32) });
}
const rawText = CV.text, rawBtn = U.btn, rawRound = CV.round;
CV.text = function (str, x, y, opt) {
  opt = opt || {};
  const size = opt.size || CV.FS.lg;
  const s = String(str == null ? '' : str);
  const w = CV.measure(s, size, opt.bold);
  const align = opt.align || 'left';
  const x0 = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
  note('text', x0, y - size * 0.75, w, size * 1.5, s);
  return rawText.apply(CV, arguments);
};
U.btn = function (x, y, w, h, label, style, id) {
  note('btn', x, y, w, h, label);
  return rawBtn.apply(U, arguments);
};
CV.round = function (x, y, w, h, r, fill, stroke, lw) {
  if (w > 150 && h > 20) note('card', x, y, w, h, 'card');
  return rawRound.apply(CV, arguments);
};

/* 一个"什么都开"的档（与 layout_audit 同一套铺法，保证能进到内页） */
Core.newGame();
Core.setPlayerName('净距');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}
(D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 1234567));
try { Core.addItem(D.BEAST_EGG_ITEM, 90); Core.hatchBeast(10); } catch (e) {}
['fb01', 'fb07'].forEach((id) => { try { Core.buyFabao(id); } catch (e) {} });
['mt01', 'mt05'].forEach((id) => { try { Core.buyMount(id); } catch (e) {} });
try { Core.addChar(D.characters[0].id); Core.S.party = ['@player', D.characters[0].id, null, null, null]; } catch (e) {}
['mat_t1', 'mat_t5'].forEach((k) => { try { Core.addItem(k, 60); } catch (e) {} });

/* R1：卡内净距下限。取 3 而不是 14 —— 卡片里允许有"自带 8px 内边距"的子面板
   （阵型卡那种），那些是网页版就有的；这一条只抓"内容贴到卡片边框上 / 越出卡片"。
   下限 3＝比任何一版的设计值都紧，出现就是漏了内边距。 */
const IN_MIN = 3 * CV.SCALE;
const BTN_GAP_MIN = 3 * CV.SCALE;  // R2：按钮上沿与上方文字块下沿的净距下限
const CHROME = ['welcome', 'create', 'bloodline', 'battle', 'gate'];
let issues = 0;

function uniq(list) {
  const out = [];
  list.forEach((r) => {
    if (!out.some((d) => Math.abs(d.x - r.x) < 0.6 && Math.abs(d.y - r.y) < 0.6
      && Math.abs(d.w - r.w) < 0.6 && Math.abs(d.h - r.h) < 0.6)) out.push(r);
  });
  return out;
}
/* 嵌套剔除：按钮里那行文字（被按钮整块包住）不参与比较 */
function topsOnly(inner) {
  return inner.filter((r) => !inner.some((o) => o !== r
    && o.x <= r.x + 0.6 && o.y <= r.y + 0.6 && o.x + o.w >= r.x + r.w - 0.6 && o.y + o.h >= r.y + r.h - 0.6
    && (o.w * o.h) > (r.w * r.h) * 1.2));
}
function check(name) {
  /* 只看**可视内容带**：顶栏之下、底栏之上。底栏那四个页签也是 CV.text 画的，
     但它的 y 落在底栏带里 —— 不排掉就会跟正文的按钮错配成一对。 */
  const band = CV.H - CV.NAV_BASE - 2;
  const rects = uniq(RECTS.filter((r) => r.kind !== 'card' && !r.screen
    && r.y > CV.TOP - 2 && (r.y + r.h) < band));
  /* 卡片：要够高才算卡片（.btn 也是圆角矩形，44 高的按钮会被误当成卡片 —— h>56 把它们排掉） */
  const cards = uniq(RECTS.filter((r) => r.kind === 'card' && !r.screen && r.w > 200 && r.h > 56));
  const inner = topsOnly(rects.filter((r) => r.kind !== 'card'));
  /* R1 —— 内容必须落在卡片内边距里 */
  inner.forEach((r) => {
    const host = cards.filter((c) => r.y >= c.y - 1 && r.y + r.h <= c.y + c.h + 1 && r.x >= c.x - 1 && r.x + r.w <= c.x + c.w + 1);
    if (!host.length) return;
    const c = host[0];
    const left = r.x - c.x, right = (c.x + c.w) - (r.x + r.w);
    if (left < IN_MIN - 0.5 || right < IN_MIN - 0.5) {
      issues++;
      console.log('  ✗ [' + name + '] 卡内元素贴边：' + r.kind + '「' + r.label + '」左右净距 '
        + left.toFixed(1) + ' / ' + right.toFixed(1) + '（下限 ' + IN_MIN + '）');
    }
  });
  /* R2 —— 按钮不许贴着上方文字块 */
  const btns = inner.filter((r) => r.kind === 'btn');
  const texts = inner.filter((r) => r.kind === 'text' && r.w > 0);
  btns.forEach((b) => {
    let worst = null;
    texts.forEach((t) => {
      if (t.y + t.h > b.y + 0.5) return;                       // 只看向上方的
      /* 横向要真重叠：取较窄那个的 40% 作为门槛
         （不然"上一行最左边的标签"和"下一行最右边的按钮"会被错配成一对 —— 假警报） */
      const ov = Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x);
      if (ov < Math.min(t.w, b.w) * 0.4) return;
      const gap = b.y - (t.y + t.h);
      if (!worst || gap < worst.gap) worst = { gap: gap, t: t };
    });
    if (worst && worst.gap < BTN_GAP_MIN) {
      issues++;
      console.log('  ✗ [' + name + '] 按钮「' + b.label + '」上方净距 ' + worst.gap.toFixed(1)
        + ' < ' + BTN_GAP_MIN + ' —— 贴住了上方文字「' + worst.t.label + '」（网页版那里有 .mb2 / margin-top 10px）');
    }
  });
}

/* 所有标签页 */
Object.keys(CV.panels || {}).forEach((name) => {
  if (CHROME.indexOf(name) >= 0) return;
  RECTS.length = 0;
  try { CV.reset(name); } catch (e) { console.log('  ✗ [' + name + '] 渲染失败：' + e.message); issues++; return; }
  check(name);
});
/* 二级页（要靠 id 事件进的那几页）——按真入口走一遍 */
[['fabao_detail', 'fb01'], ['fabao_detail', 'fb07'], ['mount_detail', 'mt01'],
  ['fabao_detail', 'nope'], ['mount_detail', 'nope']]
  .forEach((pair) => {
    const tag = pair[0] + ':' + pair[1];
    RECTS.length = 0;
    try { CV.reset('home'); CV.onAct[pair[0] + ':*'](pair[1]); }
    catch (e) { console.log('  ✗ [' + tag + '] 进不去：' + e.message); issues++; return; }
    check(tag);
  });

console.log(issues
  ? '结论：✗ 卡内净距 ' + issues + ' 处不合格（网页版 .card padding 14 / 按钮上方 mb2 10）'
  : '结论：✓ 卡内净距全部合格（' + Object.keys(CV.panels || {}).length + ' 个页面 ＋ 5 张二级页）');
process.exit(issues ? 1 : 0);
