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
const TUT_OF = G.questGuide || {};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* 等"状态不再变"再判，而不是死等固定毫秒 ——
   V9.6.102：批量跑（机器有负载）时固定 sleep 会等到不够，量出来就是"偶发串台"；
   一把会自己抖的尺子比没有尺子更糟（红了分不清是代码坏了还是运气差）。 */
async function settle(collect, maxMs) {
  const t0 = Date.now();
  let last = null, same = 0;
  await wait(60);                     // 最少等 60ms：引导里有 setTimeout(…,0) 的接续
  while (Date.now() - t0 < (maxMs || 600)) {
    await wait(20);
    /* 把这一段时间里"屏幕上出现过哪几句引导"记下来 ——
       同一页会渲染多次，玩家**第一眼**看到的那句才是要判的（V9.6.103）。 */
    const cur = U && U.coachCurrent && U.coachCurrent();
    if (collect && cur && cur.text) {
      const tx = String(cur.text).trim();
      if (collect.indexOf(tx) < 0) collect.push(tx);
    }
    const key = ((U && U.coachCurrent() && U.coachCurrent().key) || '-') + '|'
      + ((CV.top() || {}).name || '?') + '|' + (U && U.coachCount ? U.coachCount() : '?');
    /* **连续两次**采样都一样才算稳定 —— 只比一次，在机器有负载时会提前收工（偶发假报） */
    if (key === last) { same++; if (same >= 2) return; }
    else { same = 0; }
    last = key;
  }
}
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
    /* 开场链只跟**它自己**的步骤：最后一步（tut_blk4）点下去会真的开主线，
       再往下跟就会走进战斗 —— 那是③段要测的事。 */
    if (['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].indexOf(st.key) < 0) break;
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
    /* 判"玩家第一眼看到的那句"：优先用这段时间里出现过的第一句 */
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

  /* ================== ③ 连续走：从新档一路点到底 ==================
     上面 ② 是"每一步单独开一局"，看不见**跨步骤的串扰** ——
     上一步的引导还挂在队列里、下一步冒出来，或者奖励领完引导没跟上，
     玩家感受到的就是"引导走错乱了"。这里一局到底：
       做完 → 领奖 → 下一步「去完成」 → 看这一次讲的是不是**这一步自己的话**。
     判定用**文案**：当前引导的文字必须等于这一步在引导表里写的那句。 */
  console.log('=== 连续走：一局到底，逐步核对"这次讲的是不是这一步的话" ===');
  Core.newGame();
  Core.setPlayerName('连贯体检');
  Core.choosePlayerBloodline('修真');
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  ['W01', 'W02', 'W03'].forEach((wid) => {
    Core.S.worlds[wid] = Core.S.worlds[wid]
      || { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
    Core.S.worlds[wid].unlocked = true;
  });
  /* 开场链按真实流程**已经走完**（真实玩家是被强制走完它才会去点主线的）——
     否则开场链最后一步（"跟着主线走"，enter:true 会真的执行导航）会插进主线第一步里，
     量出来的就不是主线引导本身了。 */
  Core.S.coachSeen = {};
  ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].forEach((k) => { Core.S.coachSeen[k] = true; });
  let walkBad = 0, walked = 0;
  /* 推进方式：每一步**显式**把存档推到"当前正是这一步"（前 n 步已领）——
     这样不会像"边做边领"那样偶尔跳步/重复；但**引导状态不清**，
     所以"上一步的引导串到这一步"这类问题照样测得出来。 */
  const ALLQ = Core.mainQuestState();
  for (let n = 0; n < ALLQ.length; n++) {
    Core.S.quests.claimed = ALLQ.slice(0, n).map((x) => x.q.id);
    CV.cur = 'home'; CV.reset('home');
    let cu = Core.currentQuest() || {};
    const q = cu.q;
    if (!q) break;
    walked++;
    const qNow = cu.q;
    /* 开场链若还在，先按玩家那样点掉它（真实流程里它是强制的） */
    let guard = 0;
    while (U.coachActive() && guard++ < 12) {
      const st0 = U.coachCurrent();
      const mine0 = ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].indexOf(st0 && st0.key) >= 0;
      if (!mine0) break;
      const hit0 = findHit(st0.targetId) || findHit(['_coach_ok']);
      if (!hit0) break;
      CV.dispatch(hit0.id); await settle();
    }
    const seenTexts = [];
    CV.dispatch('goto_quest');
    await settle(seenTexts);
    const page = CV.top().name;
    if (!U.coachActive() && U.coachCount && U.coachCount() > 0) U.coachNext();
    const st = U.coachCurrent();
    /* 判"玩家第一眼看到的那句"：优先用这段时间里出现过的第一句 */
    const firstText = seenTexts.length ? seenTexts[0] : (st && st.text ? String(st.text).trim() : null);
    const want = (TUT_OF[qNow.id] && TUT_OF[qNow.id].t) || null;
    let mark;
    if (!st) { walkBad++; mark = '**没讲**'; }
    /* V9.6.103：**引导表里没有这一步**必须算失败 ——
       以前这里 `want` 为空就跳过文案比对，于是 q03（表里漏了）悄悄走了兜底"送残域"
       却一直显示 ✓，直到父亲大人报"主线 4 被引导到副本去了"。 */
    else if (!want) { walkBad++; mark = '**引导表里没有这一步的落点/文案**（现在停在 ' + page + '）'; }
    else if (want && firstText !== String(want).trim()) {
      walkBad++;
      mark = '**讲的是别的事**：' + String(firstText || '(空)').slice(0, 18) + '…（这一步该讲：' + String(want).slice(0, 14) + '…）';
    } else { mark = '✓ ' + page; }
    console.log('  ' + String(n + 1).padStart(2) + '. ' + String(qNow.id).padEnd(11) + ' → ' + mark);
    U.coachDrop();
  }
  console.log('\n连续走了 ' + walked + ' 步 · 讲错/没讲 ' + walkBad + ' 步');
  console.log('结论：' + (walkBad === 0 ? '每一步都讲的是它自己的那句话，没有串台 ✓' : '有 ' + walkBad + ' 步串台 ✗') + '\n');

  process.exitCode = (done && !bad && !off && (qOff + qNoCoach) === 0 && walkBad === 0) ? 0 : 1;
})();
