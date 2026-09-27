/* 滚动适配体检（小游戏端）：node scripts/scroll_fit_audit.js
   ==============================================================================
   起因（V1.1.4 · P0 · 父亲大人："改完选血统那里滑动不了了"）：
     V1.0.1 为了治"战斗界面能上下滑动"，把 `chromeless` 那几页的可滚量一律写成 0 ——
     而**"不画顶栏/底栏"和"一屏定版、不许滚"是两回事**：前者是视觉口径，
     后者是"每个元素位置按窗口高算死"。两张名单里只有战斗页属于后者，
     「选命格」却长成了六张卡纵向排开的长页（contentH 1081 > 可视 758）——
     于是本该有 333px 可滚的页面被锁成 0：**手指能拖，页面纹丝不动**，
     后四张命格永远点不到（「觉醒」按钮在每张卡里）。

   为什么现有尺子抓不到：
     · page_smoke 只问"这一页渲染有没有抛错" —— 它照常不抛；
     · layout_audit 只查"文字有没有画到卡片外 / 压在一起" —— 内容是排得好好的；
     · 谁也不问"这一页**该不该能动**"。CV.maxScroll 算错的表现**不是报错，是"没反应"**。

   这一把尺子量四件事（全部真跑：假 canvas + 真 CV.render + 合成触摸事件）：
     ① 通则／逐页：**内容高过一屏 ⇒ maxScroll 必须 > 0**；不到一屏 ⇒ 必须 = 0（V9.6.7 不许"多拉一截"）
     ② 例外只有战斗页：它是一屏定版，可滚量恒 0（V1.0.1 那条不许被这次改坏）
     ③ 选命格页专项：它是长页、可滚量 > 0、且 = 内容 − 可视 + 留白
     ④ 真拖一把：合成的触摸序列要把选命格**滚得到底**；滚到底后第六张卡的命中区
        必须在可视区内 —— 点它就命中 `bl_pick:<第六个命格>`（＝"点得到"这件事的判据）
     ⑤ 多机型：320×568 / 390×844 / 430×932 三种窗口下 ①③ 都成立（防"只在小屏上对"）
   只读脚本，只调 Core.newGame()，不写任何东西。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

/* ---------- 启动一个"能真渲染"的假环境（照 page_smoke 的两条坑） ---------- */
const store = {};
global.GameGlobal = global;                  // ← 坑 ①：data.js 挂在 window 上
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    /* 字宽模型照 layout_audit 那条（中文 ≈1×字号、西文 ≈0.55×字号、emoji ≈1.1×）——
       以前写死 13/7 会让"刚好放得下"的行被误判。字号从 ctx.font 里现读（CV.text/CV.measure 都会先设它）。 */
    if (k === 'measureText') return (s) => {
      const m = String(t.font || '').match(/(\d+(?:\.\d+)?)px/);
      const size = m ? parseFloat(m[1]) : 13;
      let w = 0;
      for (const ch of String(s == null ? '' : s)) {
        const cp = ch.codePointAt(0);
        w += cp > 0x1F000 ? size * 1.1 : (cp > 127 ? size : size * 0.55);
      }
      return { width: w };
    };
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
/* 触摸回调要**收下来自己发**：这一把尺子的第 ④ 条就是靠它模拟真手指 */
const TOUCH = { start: null, move: null, end: null };
global.wx = {                                // ← 坑 ②：没有它 CV.setup 就断
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { TOUCH.start = fn; }, onTouchMove(fn) { TOUCH.move = fn; }, onTouchEnd(fn) { TOUCH.end = fn; },
  onTouchCancel() {}, getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {}, createImage: () => ({}),
};

const loadErrors = [];
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => {
    const p = path.join(JS, f);
    if (!fs.existsSync(p)) return;
    try { require(p); } catch (e) { loadErrors.push(f + ' → ' + e.message); }
  });

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

console.log('\n=== 滚动适配（内容高过一屏 ⇒ 必须滚得动）===');
{
  const CV = global.CV, Core = global.Core, U = global.U;
  if (loadErrors.length) { console.log('  **有文件加载失败**（后面结果不可信）：' + loadErrors.join(' · ')); }
  if (!CV || !Core || !U) { console.log('  CV / Core / U 没挂上，无法继续 ✗\n'); process.exit(1); }
  CV.setup(wx.getWindowInfo());
  CV.bindTouch();          // 触摸回调在 bindTouch 里登记（game.js 开机就是这么次序调的）
  Core.newGame();
  Core.setPlayerName('体检');

  /* 一屏定版页（位置按窗口高算死、本来就不该滚）：与 cv.js 里那张名单同源。
     ⚠️ 这里是**尺子**不是实现：它只钉"谁被允许锁"，改实现要连它一起改 —— 故意的。 */
  const ONE_SCREEN = ['battle'];
  const pages = Object.keys(CV.panels || {});

  /* 一页渲染一帧，回报这一页的量 */
  function measure(name) {
    CV.reset(name);
    const viewH = CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8;   // 渲染后读回的就是这一页实际用的口径
    const content = CV.contentH - 20;                             // contentH 里那 20 是滚到底的尾白
    return { name, content, viewH, maxScroll: CV.maxScroll, hitBottom: U.y };
  }

  /* ---------- ① + ② 逐页通则 ---------- */
  const rows = pages.map(measure);
  const badFit = rows.filter((r) => (r.content > r.viewH ? !(r.maxScroll > 0) : !(r.maxScroll === 0)));
  t('① 逐页：内容高过一屏 ⇒ maxScroll > 0；不到一屏 ⇒ = 0',
    badFit.length === 0,
    badFit.length
      ? badFit.map((r) => r.name + '（内容 ' + Math.round(r.content) + ' / 可视 ' + Math.round(r.viewH)
        + ' → maxScroll ' + Math.round(r.maxScroll) + '）').join('；')
      : pages.length + ' 页逐页过（长页 ' + rows.filter((r) => r.maxScroll > 0).length + ' 页能滚）');

  const battle = rows.find((r) => r.name === 'battle');
  t('② 例外只有战斗页：它是一屏定版，可滚量恒 0（V1.0.1 那条没被弄坏）',
    !!battle && battle.maxScroll === 0,
    battle ? '战斗页内容 ' + Math.round(battle.content) + ' / 可视 ' + Math.round(battle.viewH)
      + ' → maxScroll ' + Math.round(battle.maxScroll) : '没注册战斗页');
  const locked = rows.filter((r) => r.maxScroll === 0 && r.content > r.viewH).map((r) => r.name);
  t('被"锁住却明明超一屏"的页面只能是 ONE_SCREEN 那几页（这张名单就是这次事故的根因表）',
    locked.every((n) => ONE_SCREEN.indexOf(n) >= 0),
    locked.length ? '实测锁住：' + locked.join(' / ') + ' · 允许锁：' + ONE_SCREEN.join(' / ') : '没有页面被误锁');

  /* ---------- ③ 选命格页专项 ---------- */
  const bl = measure('bloodline');
  t('③ 选命格是**长页面**（六张卡纵向排开，内容确实高过一屏）', bl.content > bl.viewH,
    '内容 ' + Math.round(bl.content) + ' / 可视 ' + Math.round(bl.viewH) + '（超 ' + Math.round(bl.content - bl.viewH) + 'px）');
  t('③ 选命格页 maxScroll > 0（**这就是父亲大人报的 P0 的判据**）', bl.maxScroll > 0,
    'maxScroll = ' + Math.round(bl.maxScroll));
  t('③ 可滚量 = 内容 − 可视 + 一段留白（没多也没少）',
    Math.abs(bl.maxScroll - (bl.content - bl.viewH + CV.SP[1])) <= 1,
    Math.round(bl.maxScroll) + ' vs ' + Math.round(bl.content - bl.viewH + CV.SP[1]));

  /* ---------- ④ 真拖一把（合成触摸序列，走的是 cv.js 里那套真手感） ---------- */
  CV.reset('bloodline');
  const W = CV.W;
  const fx = W / 2;
  let y0 = CV.TOP + CV.H * 0.6;
  const tap = (x, y) => { TOUCH.start({ touches: [{ clientX: x, clientY: y }] }); TOUCH.end({ changedTouches: [{ clientX: x, clientY: y }] }); };
  const drag = (x, from, to, steps) => {
    TOUCH.start({ touches: [{ clientX: x, clientY: from }] });
    for (let i = 1; i <= steps; i++) {
      TOUCH.move({ touches: [{ clientX: x, clientY: from + (to - from) * i / steps }] });
    }
    TOUCH.end({ changedTouches: [{ clientX: x, clientY: to }] });
  };
  const before = CV.scroll;
  drag(fx, y0, y0 - 260, 10);        // 手指往上拖 260px ＝ 内容往下走
  const afterDrag = CV.scroll;
  t('④ 手指往上拖，页面**真的跟着走**（不是"手指能拖、画面不动"）', afterDrag > before,
    '拖动前 scroll = ' + Math.round(before) + ' → 拖后 ' + Math.round(afterDrag));
  for (let k = 0; k < 8 && CV.scroll < CV.maxScroll; k++) drag(fx, y0, y0 - 300, 10);   // 一直拖到底
  t('④ 能滚到底（scroll 到得了 maxScroll，后面几张卡看得见）',
    Math.abs(CV.scroll - CV.maxScroll) <= 1,
    'scroll = ' + Math.round(CV.scroll) + ' / maxScroll = ' + Math.round(CV.maxScroll));
  t('④ 滚到底之后不会"多滚出去"（0 ≤ scroll ≤ maxScroll）', CV.scroll >= 0 && CV.scroll <= CV.maxScroll);

  /* 滚到底：最后一张命格卡的「觉醒」热区必须在可视区内，而且点得到 */
  CV.scroll = CV.maxScroll; CV.render();
  const ids = Object.keys(global.DATA.BLOODLINES);
  const lastId = ids[ids.length - 1];
  const hit = (CV.hits || []).filter((h) => h.id === 'bl_pick:' + lastId && !h.screen).pop();
  const visTop = CV.TOP + 8, visBot = CV.H - CV.safeBottom - 8;
  if (!hit) {
    t('④ 第六张命格「' + lastId + '」的觉醒热区存在', false, 'CV.hits 里没有 bl_pick:' + lastId);
  } else {
    const sy0 = hit.y - CV.scroll + CV.TOP + 8, sy1 = hit.y + hit.h - CV.scroll + CV.TOP + 8;
    const inView = sy0 >= visTop && sy1 <= visBot;
    t('④ 滚到底后第六张命格「' + lastId + '」完全落在可视区里（点得到）', inView,
      '卡片区 ' + Math.round(sy0) + '~' + Math.round(sy1) + ' · 可视 ' + Math.round(visTop) + '~' + Math.round(visBot));
    global.U.overlay = null;
    /* 卡片没露出来就不许"隔着屏幕点它" —— 假 canvas 不裁剪，照着坐标硬点会是**假的绿**。
       真人手指只能在可视区里动，所以这一条必须绑在上一条的结论上。 */
    if (!inView) {
      t('④ 点它 ＝ 命中 bl_pick:' + lastId + '（弹出确认框，不是点空）', false,
        '卡片在可视区外（' + Math.round(sy0) + '~' + Math.round(sy1) + '），手指够不到 —— 不计通过');
    } else {
      tap(fx, (sy0 + sy1) / 2);
      const ov = global.U.overlay;
      t('④ 点它 ＝ 命中 bl_pick:' + lastId + '（弹出确认框，不是点空）',
        !!ov && String(ov.title || '').indexOf('确认命格') >= 0,
        ov ? '弹窗标题：' + ov.title : '什么都没弹（没命中）');
      global.U.overlay = null;
    }
  }

  /* ---------- ⑥ 战斗页：拖了也不动 ---------- */
  Core.choosePlayerBloodline && (function () { try { Core.choosePlayerBloodline('修真'); } catch (e) {} })();
  CV.reset('battle', { title: '战斗' });
  const bMax = CV.maxScroll;
  drag(fx, y0, y0 - 260, 10);
  t('⑥ 战斗页拖了也不动（maxScroll 恒 0 · scroll 恒 0）',
    bMax === 0 && CV.scroll === 0, 'maxScroll = ' + Math.round(bMax) + ' · 拖后 scroll = ' + Math.round(CV.scroll));

  /* ---------- ⑤ 多机型 ---------- */
  const sizes = [[320, 568], [390, 844], [430, 932]];
  const bad2 = [];
  sizes.forEach(([w, h]) => {
    CV.setup({ windowWidth: w, windowHeight: h, pixelRatio: 3, safeArea: { top: 44, bottom: h - 34 } });
    const b = measure('bloodline');
    const need = b.content > b.viewH;
    if ((need && !(b.maxScroll > 0)) || (!need && b.maxScroll !== 0)) {
      bad2.push(w + '×' + h + '：内容 ' + Math.round(b.content) + '/可视 ' + Math.round(b.viewH)
        + ' → ' + Math.round(b.maxScroll));
    }
  });
  t('⑤ 三种机型下选命格都滚得动（不是"只在我这台机器上对"）', bad2.length === 0,
    bad2.length ? bad2.join('；') : sizes.map((s) => s[0] + '×' + s[1]).join(' / ') + ' 全过');

  /* ================= V1.1.7（A7 · 滚动三态）=================
     父亲大人报过的两处现场（原话见派单）：
       · 「从执灯者进去伙伴详情页是**直接在最底下**的」→ 进新页必须归零；
       · 「任务那里，**每次领取完他就会回到最上面**」→ 原地重画必须保位；
       · 以及他更早认可的那条（V9.6.130）：**退出来要回到离开时的位置** → 返回必须恢复。
     这三条以前散在三个函数里、只有注释，没有尺子；这条就是它们的判据。
     找一个**真能滚的长页**来测（拿选命格页，它是本项目最长的页之一）。 */
  {
    const longPage = rows.filter((r) => r.maxScroll > 60).map((r) => r.name)[0] || 'bloodline';
    /* ⑥ 进新页 → 归零：先把这一页滚到中段、离开、再进来一次 —— 不许把上次的位置搬回来。
       （这条正是"伙伴详情一进去就在最底下"的判据：那一页一个页名底下有 120 个伙伴。） */
    CV.reset(longPage);
    const mid = Math.max(20, Math.round((CV.maxScroll || 0) / 2));
    CV.scroll = mid; CV.render();
    const leftFrom = CV.scroll;
    CV.push('home');                        // 进"另一页"（顺便把它自己的位置也记下）
    CV.push(longPage);                      // 再进这个长页 —— 必须回到顶部
    const reentered = CV.scroll;
    t('⑥ 进新页 → 归零（再进同一个页名也不许搬回上次的位置）',
      reentered === 0, '上次离开时 ' + Math.round(leftFrom) + ' → 再进来 ' + Math.round(reentered));

    /* ⑦ 原地重画 → 保位：同一个页面因为数据变了重画一次（领奖 / 切标签 / 买东西都是这条路） */
    CV.scroll = mid; CV.render();
    const before = CV.scroll;
    CV.render(); CV.render();               // 连画两帧（数据没变、内容没变）
    t('⑦ 原地重画 → 保位（重画一次/两次都不许跳）',
      CV.scroll === before && CV.scroll > 0, Math.round(before) + ' → ' + Math.round(CV.scroll));

    /* ⑧ 返回上一页 → 恢复：把当前页滚到中段、进子页、退回来 —— 要回到离开时那个位置 */
    CV.reset(longPage);
    CV.scroll = mid; CV.render();
    const beforePush = CV.scroll;
    CV.push('bag');
    CV.pop();
    t('⑧ 返回上一页 → 恢复（退回离开时那个位置，不是回顶也不是到底）',
      CV.scroll === beforePush, Math.round(beforePush) + ' → 进了子页再退回来 ' + Math.round(CV.scroll));

    /* ⑨ 边界（就是"伙伴详情在最底下"那个 case）：进一个**比自己矮**的页，
       上一页的大 scroll 不许把它夹到"最底下" —— 必须是 0。 */
    CV.reset(longPage);
    CV.scroll = CV.maxScroll || 0; CV.render();          // 先在本页滑到底
    CV.push('home');                                     // 进一个内容更短的页
    t('⑨ 进"更矮的页"时不许被夹到最底下（上一页滑到底也不影响这一页）',
      CV.scroll === 0, '上一页到底 ' + Math.round(CV.maxScroll || 0) + ' → 新页 ' + Math.round(CV.scroll));
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
}
