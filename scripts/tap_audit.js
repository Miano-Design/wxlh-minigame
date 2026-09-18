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
const inertOk = (id) => INERT.indexOf(id) >= 0 || /^poke:/.test(id) === false && false;

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

console.log('\n=== 全界面点一遍（死键 / 交互崩溃） ===');
Object.keys(CV.panels || {}).forEach((page) => {
  openState();
  let ids = [];
  try { CV.reset(page); ids = (CV.hits || []).map((h) => h.id); }
  catch (e) { bad++; console.log('✗ ' + page + ' 渲染就抛异常：' + e.message); return; }
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
      console.log('⚠ 死键：' + page + ' 页的 ' + id + ' 没有处理器（看着能点、点了没反应）');
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
        console.log('⚠ 被闸门吃掉：' + page + ' 页的 ' + id + ' 有处理器，但派发时没跑到（正常状态下不该发生）');
      }
    }
    catch (e) {
      bad++;
      console.log('✗ ' + page + ' 页点 ' + id + ' 崩了：' + e.message);
    }
  });
});

console.log('\n共派发 ' + taps + ' 次点击 · 页面 ' + Object.keys(CV.panels || {}).length + ' 个');

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
  Object.keys(CV.panels || {}).forEach((page) => {
    openState();
    /* 每页都从干净状态开始：上一页留下的弹窗/引导热区会把结果带偏 */
    if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); }
    let hits = [];
    try { CV.reset(page); hits = (CV.hits || []).slice(); } catch (e) { return; }
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
          console.log('  ⚠ 被锚点吃掉：' + page + ' 页的「' + l.id + '」被「' + d.id + '」压住，点它会派发成 ' + (winner || '（什么都不是）'));
        }
      });
    });
  });
  console.log('\n锚点覆盖检查：核了 ' + checked + ' 处 · 被吃掉 ' + eaten + ' 处');
  if (eaten) { bad++; }
}
console.log('结论：' + (bad ? '✗ 有 ' + bad + ' 处崩溃' : '没有交互崩溃 ✓') + (warn ? '；' + warn + ' 个死键待核' : '；没有死键 ✓') + '\n');
process.exitCode = bad ? 1 : 0;
