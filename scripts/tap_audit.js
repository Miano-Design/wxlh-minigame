/* 全界面"点一遍"审计：node scripts/tap_audit.js

   起因（父亲大人："很多功能点击无效" / "点进去是空白"）：画布界面里每一颗热区都是
   CV.hit(id) + CV.on(id)。两者对不上就是**死键**（看着能点、点了没反应），
   而这种错只有"真点一遍"才查得出来。

   做法：假 canvas 起 51 页 → 每页渲染后把它登记过的热区**一个个派发一遍** →
     ① 抛异常的 → 报错（页面/交互会崩）
     ② 没有对应处理器、又不在"故意无动作"名单里的 → 死键告警
   只读脚本：跑在假环境里，不碰真存档。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
/* V1.1.7（B-2）：同一页名底下的**每个状态**都要铺一遍再收热区 ——
   这张表由 `_ui_states.js` 提供（两把尺子共用一份，不许各写一份）。 */
const STATES = require('./_ui_states');

/* ---- ⓪ 静态检查：按钮不许"看着能点、其实没热区" ----
   V1.0.1（开发自审会诊）：本脚本原来只查**一个方向** —— 热区登记了、但没有处理器。
   反过来那条缝一直敞着：`id: 条件 ? 'x' : ''` 这种写法在条件不满足时，
   按钮**照样按常色画出来**（不是禁用态），而 `U.btn` 只在 `id && !dis` 时才登记热区
   → 玩家看到一个能点的按钮，点下去既没反应也没提示。全项目同一批共 11 处。
   口径：在按钮对象里，只要 `id` 是**三元表达式**且把空串当"关"这一支，就必须同时给出 `dis:`；
   想让按钮变灰是唯一的正确做法（网页版这些位置全是 `disabled`）。
   做坏试验：随便找一颗按钮把 `dis` 去掉 → 立刻报出来。 */
{
  const files = fs.readdirSync(JS).filter(f => /\.js$/.test(f));
  const bad = [];
  files.forEach(f => {
    /* 先把注释剥掉：本文件自己的说明里就写着 `id: 条件 ? 'x' : ''` 这个反面样例，
       不剥注释会把它自己报成违规（第一版就踩了）。 */
    const src = fs.readFileSync(path.join(JS, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (t) => t.replace(/[^\n]/g, ' '));
    const re = /id:\s*[^,\n]*\?\s*'[a-z_][a-z0-9_]*'\s*:\s*''/g;
    let m;
    while ((m = re.exec(src))) {
      const open = src.lastIndexOf('{', m.index);
      const close = src.indexOf('}', m.index);
      const chunk = open >= 0 && close > open ? src.slice(open, close) : src.slice(m.index, m.index + 200);
      if (!/\bdis:/.test(chunk)) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(f + ':' + line);
      }
    }
  });
  if (bad.length) {
    console.log('=== ⓪ 静态：这些按钮写了空 id、却没给 dis（看着能点、点了没反应）===\n  ✗ ' + bad.join('\n  ✗ '));
  } else {
    console.log('=== ⓪ 静态：没有"看着能点、其实没热区"的按钮 ✓ ===');
  }
}

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
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

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
CV.setup(global.wx.getWindowInfo());
/* 底栏四个页签的处理器是在**真实入口 game.js** 里注册的，这里补上（否则会把 tab:* 误判成死键） */
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });

/* 故意没有动作的热区（纯粹给引导当锚点用 / 玩家点了本来就该什么都不发生） */
/* 故意没有动作的热区：①纯给引导当锚点（attr_card / party_board / stage_grid / hero:N / grid:*）
   ②调试暗门（gm_tap 由连点计数处理） */
const INERT = ['attr_card', 'party_board', 'stage_grid', 'gm_tap', 'hero:', 'grid:'];
/* V9.6.109（尺子自审）：这行原来是 `INERT.indexOf(id) >= 0 || /^poke:/.test(id) === false && false`
   —— 后半截恒为 false（`x === false && false`），是当初改到一半留下的乱码。
   行为上没错，但"看不懂的表达式"本身就是隐患，现在写成一句人话：
   锚点类热区（纯给引导当落点）不算死键。 */
const inertOk = (id) => INERT.indexOf(id) >= 0;

let bad = 0, warn = 0, taps = 0;

/* 用"全解锁 + 有伙伴 + 有点资源"的状态点，才能把后面的页面点出来 */
function openState() {
  Core.newGame();
  Core.setPlayerName('点检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  if (D.characters && D.characters.length) {
    const cid = D.characters[0].id;
    Core.S.chars[cid] = { lv: 20, star: 3, exp: 0, attrs: {}, skillLv: [1, 1, 1], bloodlineLv: 1, equips: {} };
    Core.S.party[1] = cid;
  }
  Core.S.player.level = 40;
  Core.S.player.attrPoints = 5;
  Core.S.player.skillPoints = 5;
  ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'skillChip', 'corridor'].forEach((k) => Core.addCur(k, 99999));
  ['ticket_normal', 'ticket_adv'].forEach((k) => Core.addItem(k, 20));
  if (D.GARDEN) D.GARDEN.forEach((g) => Core.addItem(g.seedItem || g.id, 5));
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  });
}

/* ---------- V1.1.7（B-2）"同一页名 + 多状态"的盲区 ----------
   原来这里是 `Object.keys(CV.panels).forEach(page => { CV.reset(page); 收热区; })` ——
   **一个页名只渲染一次**，于是"背包的装备页""商店的四家店""灯录的两卷"这些状态
   从来轮不到（装备页那颗「＋（扩容）」就是这么漏掉的：它只在 `view==='equip'` 时登记，
   而尺子只渲染过 `view==='item'` 那一版）。现在按 `_ui_states` 把每个状态都铺一遍。
   状态清单在 `scripts/_ui_states.js`（改那道表就能扩尺子覆盖面）。 */
const SCREENS = [];
Object.keys(CV.panels || {}).forEach((page) => {
  SCREENS.push({ page, via: [], label: page });
  STATES.filter((e) => e.page === page).forEach((e) => {
    SCREENS.push({ page, via: e.via, label: page + '[' + e.via.join(' + ') + ']' });
  });
});

console.log('\n=== 全界面点一遍（死键 / 交互崩溃） ===');
console.log('（页面 ' + Object.keys(CV.panels || {}).length + ' 个 → 摊平成 ' + SCREENS.length + ' 屏：含同页多状态）');
SCREENS.forEach((scr) => {
  const page = scr.page;
  openState();
  if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); }
  let ids = [];
  try {
    CV.reset(page);
    /* 先把它推进这个状态（就是玩家点那几颗标签）——派发本身也会被算进"有没有处理器"，
       所以状态热区本身有问题时，下面那条会照常报出来。 */
    scr.via.forEach((id) => { if (U && U.coachDrop) U.coachDrop(); CV.dispatch(id); });
    ids = (CV.hits || []).map((h) => h.id);
  }
  catch (e) { bad++; console.log('✗ ' + scr.label + ' 渲染就抛异常：' + e.message); return; }
  const seen = new Set();
  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    taps++;
    const hasExact = !!(CV.onAct || {})[id];
    const i = String(id).indexOf(':');
    const pref = i > 0 ? String(id).slice(0, i + 1) + '*' : null;
    const hasPrefix = pref ? !!(CV.onAct || {})[pref] : false;
    if (!hasExact && !hasPrefix) {
      if (inertOk(id) || INERT.some((x) => id.indexOf(x) === 0)) return;
      warn++;
      console.log('⚠ 死键：' + scr.label + ' 的 ' + id + ' 没有处理器（看着能点、点了没反应）');
      return;
    }
    try {
      /* V9.6.104：**有处理器 ≠ 真的跑到了**。
         上一轮那类 bug（点「去完成」被引导那道闸吃掉、页面没跳）就是"处理器在，
         但派发时被拦下了"。这里在**正常状态**（没有弹窗、没有引导）下派发，
         并盯住处理器到底有没有被调用 —— 被吃掉就报出来。 */
      if (U && U.overlay) U.overlay = null;
      if (U && U.coachDrop) U.coachDrop();
      let ran = false;
      const exact = CV.onAct[id];
      const i0 = String(id).indexOf(':');
      const pref0 = i0 > 0 ? String(id).slice(0, i0 + 1) + '*' : null;
      const preFn = pref0 ? CV.onAct[pref0] : null;
      const mark = function (fn) { return function () { ran = true; return fn.apply(this, arguments); }; };
      if (exact) CV.onAct[id] = mark(exact);
      if (preFn) CV.onAct[pref0] = mark(preFn);
      CV.dispatch(id);
      if (exact) CV.onAct[id] = exact;
      if (preFn) CV.onAct[pref0] = preFn;
      if (!ran) {
        warn++;
        console.log('⚠ 被闸门吃掉：' + scr.label + ' 的 ' + id + ' 有处理器，但派发时没跑到（正常状态下不该发生）');
      }
    }
    catch (e) {
      bad++;
      console.log('✗ ' + scr.label + ' 点 ' + id + ' 崩了：' + e.message);
    }
  });
});

console.log('\n共派发 ' + taps + ' 次点击 · 页面 ' + Object.keys(CV.panels || {}).length + ' 个（摊平成 ' + SCREENS.length + ' 屏）');

/* ---- V9.6.108：**锚点区域不许吃点击** ----
   有些热区是"给引导当锚点"的整块区域（party_board / attr_card / stage_grid / grid:* / hero:*），
   它们没有处理器，却盖在真按钮上面 —— 触摸层是"最后登记的那颗优先"，
   于是点真按钮时派发的是这些区域 → 什么都不发生。
   实测就是这么把"队伍上阵"整页点死的（点空位派发 party_board）。
   这里逐页检查：对每一颗"没有处理器"的热区，看它压住了哪些"有处理器"的热区，
   然后在**真按钮的中心**点一下，确认那颗真按钮的处理器真的跑到。 */
{
  let eaten = 0, checked = 0;
  const hasH = (id) => {
    if (CV.onAct[id]) return true;
    const i = String(id).indexOf(':');
    return i > 0 && !!CV.onAct[String(id).slice(0, i + 1) + '*'];
  };
  SCREENS.forEach((scr) => {
    const page = scr.page;
    openState();
    /* 每页都从干净状态开始：上一页留下的弹窗/引导热区会把结果带偏 */
    if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); }
    let hits = [];
    try {
      CV.reset(page);
      scr.via.forEach((id) => { if (U && U.coachDrop) U.coachDrop(); CV.dispatch(id); });
      hits = (CV.hits || []).slice();
    } catch (e) { return; }
    const dead = hits.filter((h) => !hasH(h.id));
    const live = hits.filter((h) => hasH(h.id));
    dead.forEach((d) => {
      live.forEach((l) => {
        /* 只在**同一坐标系**里比：屏幕坐标（顶栏/底栏/弹窗）和内容坐标（页面内容）
           数值上会"重叠"，但那不是真的压住（V9.6.108 修假警报）。 */
        if (!!d.screen !== !!l.screen) return;
        const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
        const inside = cx >= d.x && cx <= d.x + d.w && cy >= d.y && cy <= d.y + d.h;
        if (!inside) return;
        checked++;
        /* 真按钮的中心如果也落在锚点区域里 → 点那里，看真正跑到的是谁 */
        const top = hits.slice().reverse().find((h) => !!h.screen === !!l.screen
          && cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h && hasH(h.id));
        const winner = top ? top.id : null;
        if (winner !== l.id) {
          eaten++;
          console.log('  ⚠ 被锚点吃掉：' + scr.label + ' 的「' + l.id + '」被「' + d.id + '」压住，点它会派发成 ' + (winner || '（什么都不是）'));
        }
      });
    });
  });
  console.log('\n锚点覆盖检查：核了 ' + checked + ' 处 · 被吃掉 ' + eaten + ' 处');
  if (eaten) { bad++; }
}
console.log('结论：' + (bad ? '✗ 有 ' + bad + ' 处崩溃' : '没有交互崩溃 ✓') + (warn ? '；' + warn + ' 个死键待核' : '；没有死键 ✓') + '\n');
/* V1.1.7（B-2 的连带）：**死键也要让退出码非 0**。
   原来是 `exitCode = bad ? 1 : 0` —— 死键只打印一行 ⚠、退出码照样 0，
   于是"看退出码判绿不绿"的流程会把一只真死键当成全绿（康康那只是从截图上看出来的，
   不是这台尺子报出来的）。尺子的存在意义就是"红了就是红"，这条必须一起改。 */
process.exitCode = (bad || warn) ? 1 : 0;
