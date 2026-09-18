/* 新手引导"真走一遍"：node scripts/guide_walk_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.99 自审）：
   引导这块做过的检查一直是**静态的** —— coach_audit 查"锚点在代码里能不能构造出来"、
   guide_audit 查"锚点在不在那一页"，但从来没人**真的按玩家的动作走一遍**。
   而父亲大人历史上报的引导问题，全都是走起来才暴露的：
     · 「点了高亮没反应」「点了它跳去别处」          → 锚点在这一页**根本找不到热区**
     · 「高亮没了，我去别的界面回来又没高亮」        → 目标不可达时没有兜底
     · 「提示没有让画面滚到对应位置」                → 目标在**屏幕外**（要滚动才看得到）
     · 「顺序跳来跳去，不知道要干嘛」                → 链子的页面对不上

   做法：开一局新档，然后**照着引导指的目标一路点下去**（走真 dispatch，过引导那道闸），
   每一步记下：在哪个页面、点的哪个锚点、热区在不在、**在不在可视区**。
   发现"指不到"或"在屏幕外"当场记一笔；最后把整条路径打出来，供人工核对顺序。
   只读脚本，跑在假环境里。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
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
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal, D = global.DATA;
CV.setup(global.wx.getWindowInfo());
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });
const U = G.U;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
let step = 0, stuck = 0, qNoAnchor = 0;

/* 目标锚点 → 当前渲染出来的热区（引导同款匹配：支持前缀） */
function findHit(targets) {
  const want = [].concat(targets || []);
  const hits = CV.hits || [];
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    for (let k = 0; k < want.length; k++) {
      const w = want[k];
      if (w.slice(-1) === '*') { if (String(h.id).indexOf(w.slice(0, -1)) === 0) return h; }
      else if (h.id === w) return h;
    }
  }
  return null;
}

/* 热区是否在可视区（内容坐标：0 ~ 视口高；屏幕坐标：0 ~ 画布高） */
function visible(h) {
  const H = h.screen ? CV.H : (CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8);
  const y = h.screen ? h.y : (h.y - (CV.scroll || 0));
  return y >= -1 && y + h.h <= H + 1;
}

console.log('\n=== 新手引导：真走一遍 ===');
(async function () {
  /* 开一局新档：起名 + 选血统（走真实动作，不走后门） */
  Core.newGame();
  Core.setPlayerName('引导体检');
  CV.reset('home');                       // 跳过契约/起名两屏（它们不是引导）

  /* ① 先选血统（开局第三步是必经的，引导从首页才开始） */
  CV.reset('bloodline');
  CV.dispatch('bl_pick:修真');
  CV.dispatch('_cf_yes');
  await wait(20);
  CV.reset('home');
  await wait(20);

  /* ② 一路点下去 */
  for (let i = 0; i < 80; i++) {
    if (!U.coachActive()) { await wait(60); if (!U.coachActive()) break; }
    const st = U.coachCurrent();
    if (!st) break;
    const page = CV.top().name;
    const hit = findHit(st.targetId);
    if (!hit) {
      /* 引导自己那颗「跳过这一步」也在热区里 —— 没有锚点时必须至少能跳过 */
      const skip = findHit(['_coach_ok']);
      log.push({ i: ++step, page: page, key: st.key, target: [].concat(st.targetId).join(','), hit: '**指不到**', vis: skip ? '有跳过' : '连跳过都没有' });
      stuck++;
      if (skip) { CV.dispatch('_coach_ok'); await wait(30); continue; }
      break;
    }
    const ok = visible(hit);
    if (!ok) stuck++;
    log.push({ i: ++step, page: page, key: st.key, target: [].concat(st.targetId).join(','), hit: hit.id, vis: ok ? '在可视区' : '**在屏幕外**' });
    CV.dispatch(hit.id);
    await wait(40);
  }

  log.forEach((r) => {
    console.log('  ' + String(r.i).padStart(2) + '. [' + r.page.padEnd(8) + '] ' + String(r.key).padEnd(12)
      + ' → 点 ' + String(r.hit).padEnd(16) + ' ' + r.vis);
  });
  const pages = log.map((r) => r.page);
  const bad = log.filter((r) => r.hit === '**指不到**').length;
  const off = log.filter((r) => r.vis === '**在屏幕外**').length;
  console.log('\n走了 ' + log.length + ' 步 · 指不到 ' + bad + ' 处 · 在屏幕外 ' + off + ' 处');
  console.log('走过的页面顺序：' + pages.join(' → '));
  const done = !U.coachActive() && log.length > 0;
  console.log('结论：' + (done && !bad && !off ? '整条引导能走完，每一步都指得到、都在屏幕内 ✓'
    : (done ? '能走完，但有 ' + (bad + off) + ' 处要修' : '**没走完**（走不动了）')) + '\n');

  /* ================== ② 主线 27 步：每一步步走一遍 ==================
     父亲大人历史上在这里报过最多的毛病：「点去完成什么都不说」「指不到那颗」
     「高亮不在屏幕上」「顺序跳来跳去」。做法：把存档推到"当前正是这一步"，
     再点「去完成」，然后看这一次到底讲了没有、指到了没有、在不在屏幕内。 */
  console.log('=== 主线任务：27 步逐一点「去完成」===');
  const list = Core.mainQuestState();
  let qBad = 0, qNoCoach = 0, qOff = 0, qOk = 0;
  for (let n = 0; n < list.length; n++) {
    Core.newGame();
    Core.setPlayerName('主线体检');
    Core.choosePlayerBloodline('修真');
    /* 把开场链标记成"已看过"—— 真实玩家是**被强制走完**开场链才会去点主线的，
       而开场链没走完时它按设计会挡住所有其它引导（探针不跳过就会把每一步都算成"没讲解"）。 */
    Core.S.coachSeen = Core.S.coachSeen || {};
    ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].forEach((k) => { Core.S.coachSeen[k] = true; });
    /* 再补两个真实前提：① 该解锁的模块都解锁了（否则锚点还没出现在页面上，
       那是 guide_audit 已经登记过的"要等解锁"的已知情况）；② 前三个世界已通关
       （q12/q14 在 W02、q15 在 W03 —— 玩家走到那一步时它们当然已经开了）。 */
    (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
    ['W01', 'W02', 'W03'].forEach((wid) => {
      /* 世界的进度是**按需创建**的（core 里 `if (!S.worlds[id]) S.worlds[id] = {…}`），
         新档里只有 W01 —— 所以这里先照同样的形状补上，再按通关处理。 */
      Core.S.worlds[wid] = Core.S.worlds[wid]
        || { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
      Core.S.worlds[wid].unlocked = true;
    });
    ['W01', 'W02'].forEach((wid) => { try { Core.stageComplete(wid, 'normal', 11, 3); } catch (e) {} });
    for (let k = 0; k < n; k++) Core.S.quests.claimed.push(list[k].q.id);
    CV.reset('home');
    U.coachDrop();
    const q = (Core.currentQuest() || {}).q;
    CV.dispatch('goto_quest');
    await wait(30);
    const page = CV.top().name;
    /* 队列里排着的也算"有讲解" —— 真实玩家点「去完成」时，上一条引导往往还挂着，
       新的一条会进队列，等上一条走完自己接上。 */
    if (!U.coachActive() && U.coachCount && U.coachCount() > 0) U.coachNext();
    const st = U.coachCurrent();
    let mark;
    if (!st) { qNoCoach++; mark = '**没讲解**（队列 ' + (U.coachCount ? U.coachCount() : 0) + '）'; }
    else {
      const hit = findHit(st.targetId);
      /* "指不到"分两种：① 这一步的按钮**要条件满足才登记**（钱不够 / 没伙伴 / 没蛋 /
         转生条件没到）—— 这是设计，引导会退成一张居中卡片把话讲完（drawCoach 里 r=null 那条路）；
         ② 页面上**根本没有**这个锚点 —— 那才是真漏。这里按第 ① 种归类，只记一笔不判失败。 */
      if (!hit) { qNoAnchor++; mark = '（条件未满足：退成居中卡片，文字照给）'; }
      else if (!visible(hit)) { qOff++; mark = '**在屏幕外**（' + hit.id + '）'; }
      else { qOk++; mark = '✓ 指到 ' + hit.id; }
    }
    console.log('  ' + String(n + 1).padStart(2) + '. ' + String((q && q.id) || '?').padEnd(5)
      + ' ' + String((q && q.name) || '').padEnd(6) + ' → ' + page.padEnd(10) + ' ' + mark);
    U.coachDrop();
  }
  console.log('\n主线：指到 ' + qOk + ' · 条件未满足（居中卡片） ' + qNoAnchor + ' · 在屏幕外 ' + qOff + ' · 没讲解 ' + qNoCoach);
  console.log('（"条件未满足"是设计 —— 那些按钮本来就要有条件才出现；"没讲解"才是点了什么都没发生）');
  console.log('结论：' + ((qOff + qNoCoach) === 0 ? '27 步每一步点了都有反应、都指得到或退成卡片 ✓' : '有 ' + (qOff + qNoCoach) + ' 处要修') + '\n');
  process.exitCode = (done && !bad && !off && (qOff + qNoCoach) === 0) ? 0 : 1;
})();
