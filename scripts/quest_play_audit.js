/* 主线"真玩一遍"（带引导、带真动作）：node scripts/quest_play_audit.js
   ------------------------------------------------------------------------------
   为什么还要多这一层（V9.6.111 父亲大人："第一关的指引打完之后出来还是第一关的指引，
   招募的指引得点好几下才能换，上阵也得上两个"）：
     已有的 guide_walk_audit 只做了一件事 —— 点「去完成」，看屏幕上那句引导**文案对不对**。
     它**从不真的去做那件事**，也**从不回到上一页再走一遍**。
     可玩家踩到的坑恰恰都在"做完之后再回来"：
       · 打完第 1 关回到世界页，同一条引导（换了个 key）又冒出来，还是指着第 1 关；
       · 同一页有三条讲同一件事的引导（解锁那条 / 主线那条 / 页面那条），得连着点好几下；
       · 上阵要走"点空格 → 选伙伴"两步，引导只在第一步把话说完，第二步没人管。

   做法（严格照玩家的动作）：
     新档 → 开场链（点高亮）→ 反复【首页点「去完成」→ 看讲什么 → **点高亮真的把那件事做掉**
     → 回首页领奖】直到前 8 步主线走完；每一步都记：讲的是哪句、指到哪颗、
     **这颗是不是"还没做的那件事"**、要点几下才换下一条、以及"回来之后同一条还会不会再冒出来"。
   只读脚本，跑在假环境里（战斗引擎换成一帧就赢，不碰真存档）。 */
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
const touch = { start: [], move: [], end: [] };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { touch.start.push(fn); }, onTouchMove(fn) { touch.move.push(fn); }, onTouchEnd(fn) { touch.end.push(fn); },
  onTouchCancel() {},
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal, D = global.DATA, U = G.U;
CV.setup(global.wx.getWindowInfo());
CV.bindTouch();
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });
/* 战斗引擎换成一帧就赢：这把尺子考的是"引导与流程"，不是数值 */
G.Battle.run = function () {
  return { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = () => ((CV.top() || {}).name || '?');
const TUT_OF = G.questGuide || {};
let bad = 0;
const mark = (ok, name, extra) => { if (!ok) bad++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : '')); };

function findHit(targets) {
  const want = [].concat(targets || []);
  const hits = CV.hits || [];
  for (let k = 0; k < want.length; k++) {
    const w = String(want[k]);
    for (let i = 0; i < hits.length; i++) {
      const id = String(hits[i].id);
      if (w.slice(-1) === '*') { if (id.indexOf(w.slice(0, -1)) === 0) return hits[i]; }
      else if (id === w) return hits[i];
    }
  }
  return null;
}
function scr(h) {
  return { x: h.x + h.w / 2, y: h.screen ? (h.y + h.h / 2) : (h.y - (CV.scroll || 0) + CV.TOP + 8 + h.h / 2) };
}
const evOf = (p) => ({ touches: [{ clientX: p.x, clientY: p.y }], changedTouches: [{ clientX: p.x, clientY: p.y }] });
/* 和玩家一样**走真触摸**（不直接调 dispatch）——"点了没反应"这类问题只有这样才查得出 */
function tap(h) {
  if (!h) return false;
  const p = scr(h);
  touch.start.forEach((fn) => fn(evOf(p)));
  touch.end.forEach((fn) => fn(evOf(p)));
  return true;
}
const tapId = (id) => tap(findHit([id]));
/* 长按（队伍换位那套手势）：真触摸按下 → 等过长按阈值 → 拖 → 松手 */
async function dragFromTo(fromHit, toHit) {
  const a = scr(fromHit), b = scr(toHit);
  touch.start.forEach((fn) => fn(evOf(a)));
  await wait(480);
  const grabbed = !!CV.grab;
  touch.move.forEach((fn) => fn(evOf(b)));
  touch.end.forEach((fn) => fn(evOf(b)));
  return grabbed;
}
function guide() {
  const st = U.coachCurrent && U.coachCurrent();
  return st ? { key: st.key, want: [].concat(st.targetId).join(' | '), text: String(st.text || '') } : null;
}
/* 等引导稳定下来（渲染里有 setTimeout(…,0) 的接续） */
async function settle(ms) {
  await wait(ms || 120);
}
/* 玩家动作：把当前引导"点掉"。返回点了几下、以及点的是哪颗。 */
async function tapGuideAway(maxTaps) {
  let taps = 0, last = null;
  const first = guide();
  for (let i = 0; i < (maxTaps || 4); i++) {
    const st = guide();
    if (!st) break;
    /* 开场链/主线引导的目标优先；指不到就点它自己那颗兜底热区（和玩家看到的"点任意处继续"一致） */
    const h = findHit(U.coachCurrent().targetId) || findHit(['_coach_ok']);
    if (!h) break;
    last = h.id;
    tap(h);
    taps++;
    await settle(80);
    /* 点完这一下等于"做了那件事"：战斗页/选人页会推进来，等它稳 */
    if (page() === 'battle') break;
  }
  return { taps, last, first };
}

/* ── 各步主线"那件事"怎么做（都用手点，不走后门） ── */
async function doBattleStage(stageIdx) {
  /* 世界页上点第 stageIdx+1 关 → 打完 → 结算页点「下一关 / 返回」回到上一步 */
  const h = findHit(['stage:' + stageIdx, 'stage_grid']);
  if (!h) return { ok: false, why: '世界页上没有第 ' + (stageIdx + 1) + ' 关的热区' };
  tap(h);
  /* V1.0.1：每关改成 3 波后，一场要走 3 次无缝交接 —— 900ms 不够，放宽到 2.6s。 */
  /* V1.0.1：每关改成 3 波后，**每波之间还有 1050ms 的波次卡** ——
     总时长 = 3×1050 + 结算 ≈ 3.5s，原来等 900ms 根本等不到，所以主线尺子报"打完停在 battle"。 */
  await wait(4500);                      // 3 波 × 波次卡 1050ms + 结算页
  if (page() === 'battle') {
    /* 结算页：优先「下一关」，没有就「返回」 */
    tapId('dun_next') || tapId('battle_close');
    await wait(400);
    if (page() === 'battle') { tapId('battle_close'); await wait(300); }
  }
  return { ok: true, why: '第 ' + (stageIdx + 1) + ' 关打完（现在在 ' + page() + '）' };
}
async function goHome() {
  for (let i = 0; i < 4 && page() !== 'home'; i++) {
    if (page() === 'battle') { tapId('battle_close'); await wait(200); continue; }
    tapId('tab:home');
    await wait(150);
    if (page() !== 'home') { CV.reset('home'); await wait(80); }
  }
}
async function claimAll() {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    if (!tapId('claim_quest')) break;
    n++;
    await wait(120);
    if (U.overlay && U.overlay.onOk) { U.overlay.onOk(); await wait(120); }
  }
  return n;
}
/* 玩家习惯：**能领的都领掉**（每日任务的红点看到了就点）。
   这条也顺便替我们检查"任务页的领取按钮点得动"。 */
async function claimDailies() {
  let n = 0;
  tapId('tab:home'); await wait(60);
  if (!tapId('open_tasks')) { return 0; }
  await wait(150);
  tapId('tasktab:daily'); await wait(120);
  for (let i = 0; i < 10; i++) {
    const h = (CV.hits || []).slice().reverse().find((x) => String(x.id).indexOf('task_claim:') === 0);
    if (!h) break;
    tap(h); n++;
    await wait(160);
  }
  await goHome();
  return n;
}

/* 这一步"那件事"做完了没有 —— 直接问它自己的判定 */
const qCheck = (id) => {
  const q = D.MAIN_QUESTS.find((x) => x.id === id);
  return !!(q && q.check(Core.S));
};
/* 引导指到的关，是不是"还没通关的那一关"（不是"刚打过的那一关"） */
function anchorStageIsNext() {
  const h = findHit(U.coachCurrent().targetId);
  const m = h && /^stage:(\d+)$/.exec(String(h.id));
  if (!m) return { ok: false, why: '高亮不是某一关（' + (h ? h.id : '指不到') + '）' };
  const idx = +m[1];
  const arr = (Core.S.worlds.W01 && Core.S.worlds.W01.stages.normal) || [];
  if (arr[idx]) return { ok: false, why: '指的第 ' + (idx + 1) + ' 关**已经通关了**（' + arr[idx] + ' 星）' };
  for (let i = 0; i < idx; i++) if (!arr[i]) return { ok: false, why: '前面第 ' + (i + 1) + ' 关还没通，却指着第 ' + (idx + 1) + ' 关' };
  return { ok: true, why: '第 ' + (idx + 1) + ' 关（还没通关）' };
}

console.log('\n=== 主线真玩一遍（带引导、带真动作）===');
(async () => {
  Core.newGame();
  /* 真游戏开机时 game.js 会跑一次 ensureDaily（每日任务列表是**开机生成**的）——
     探针不补这一步，"领 1 次任务奖励"那一步就永远没有能领的东西（第一版就是这么误报的）。 */
  if (Core.ensureDaily) Core.ensureDaily();
  Core.setPlayerName('真玩');
  Core.choosePlayerBloodline('修真');
  CV.reset('home');
  await settle(60);

  /* ① 开场链：让玩家那样点掉（这几步是强制的） */
  {
    let guard = 0;
    const OPEN = ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'];
    while (guard++ < 30) {
      const st = guide();
      if (!st || OPEN.indexOf(st.key) < 0) break;
      await tapGuideAway(2);
      await settle(60);
    }
    const left = OPEN.filter((k) => !(Core.S.coachSeen || {})[k]);
    mark(left.length === 0, '开场链能走完', left.length ? '还剩 ' + left.join(',') : '五步都过了');
  }

  /* ② 一路玩下去：**每一步都按"当前真正该做的那一步"走**（不写死顺序） */
  const visited = [];
  for (let n = 0; n < 14; n++) {
    await goHome();
    await settle(120);
    const cu = Core.currentQuest();
    if (!cu) { console.log('\n（主线全部做完）'); break; }
    const want = cu.q.id, q = cu.q;
    visited.push(want);
    console.log('\n' + String(n + 1).padStart(2) + '. ' + want + '  【' + q.name + '】');

    /* 已经做完的 → 玩家只会去领奖；这里如实模拟（不点「去完成」） */
    if (qCheck(want)) {
      const got = await claimAll();
      mark(got > 0, '这一步已经做完 → 能领到奖', got ? '领了 ' + got + ' 次' : '**点「领取奖励」没反应**');
      continue;
    }

    /* 点「去完成」——玩家的真实发起方式 */
    if (!tapId('goto_quest')) { mark(false, '首页上找不到「去完成」'); break; }
    await settle(220);
    const st = guide();
    if (!st) mark(false, '点了「去完成」什么都没讲', '停在 ' + page());
    else {
      mark(true, '讲了：' + st.key, '在 ' + page() + ' 指 ' + st.want);
      const wantT = (TUT_OF[want] && TUT_OF[want].t) || '';
      mark(String(st.text).trim() === String(wantT).trim(), '讲的正是这一步的话', String(st.text).slice(0, 24) + '…');
      const h = findHit(U.coachCurrent().targetId);
      /* 条件没满足时（比如"派领队"但手上没有没上阵的伙伴）按钮本来就不登记，
         引导退成一张**把话说清楚**的卡片 —— 这是设计，不算失败；但文案必须写到这件事上。 */
      const explains = /没有|先去|不够|条件/.test(String(st.text));
      mark(!!h || explains, '高亮指得到一颗真热区（或退成把话讲清的卡片）',
        h ? h.id : (explains ? '条件未满足：卡片里已写明怎么办' : '**指不到且没说清怎么办**'));
      /* "指向哪一关"必须是**还没通的那一关**（父亲大人："出来还是第一关的指引"） */
      if (String(st.want).indexOf('stage:') >= 0) {
        const a = anchorStageIsNext();
        mark(a.ok, '高亮指的是"该打的那一关"，不是刚打过的那一关', a.why);
      }
    }

    /* ③ 点高亮，把那件事真的做掉（战斗类会一路打到结算页） */
    /* 判定标准：**这一步自己的那条引导，点一下就换/收掉**。
       换页之后新冒出来的那条（挑人页说要选伙伴、装备页说要按强化）是**下一步**，
       不算"得点好几下" —— 那正是我们要的逐步引导。 */
    const g0 = guide();
    const h0 = (g0 && findHit(U.coachCurrent().targetId)) || findHit(['_coach_ok']);
    mark(!!h0, '高亮那颗真的点得到', h0 ? String(h0.id) : '连兜底热区都没有');
    if (h0) { tap(h0); await wait(220); }
    /* 带 waitFor（做完才放行）的引导是**条件满足后的下一帧**自己收掉的，
       点完要多等一帧再判，否则会误报"点了不换"。 */
    CV.render();                  // 真机上任何一次触摸/落帧都会重画，这里补上再判
    await wait(180);
    const g1 = guide();
    /* 带 waitFor 的引导是"这件事真做完才放行"——它**留在屏幕上是对的**，
       只要高亮已经移到下一颗可点的东西（比如任务页从「日常」标签移到「领取」）。 */
    const h1 = g1 ? findHit(U.coachCurrent().targetId) : null;
    const moved = !g1 || g1.key !== (g0 && g0.key) || (h1 && h0 && String(h1.id) !== String(h0.id));
    mark(moved, '这一步自己的引导点一下就有进展（不用点好几下）',
      !moved ? '还挂着同一条、高亮也没动：' + (g1 && g1.key)
        : (g1 ? '高亮移到 ' + h1.id : '已收掉'));
    /* 两步/多段的步骤：像玩家那样**接着做，直到真的做完**（多段任务就是一关一关推） */
    for (let k = 0; k < 6 && !qCheck(want); k++) {
      const pageNow = page();
      if (pageNow === 'battle') {
        await wait(800);
        tapId('dun_next') || tapId('battle_close');
        await wait(350);
        if (page() === 'battle') { tapId('battle_close'); await wait(250); }
        continue;
      }
      if (pageNow === 'pickparty') {
        const g2 = guide();
        mark(!!g2, '挑人页也会说一句（上阵是两步，第二步不能没人管）', g2 ? g2.key : '**挑人页上一条引导都没有**');
        const who = findHit(['set:*']);
        mark(!!who, '挑人页有伙伴可点', who ? who.id : '**没有可选伙伴**');
        if (who) { tap(who); await wait(250); }
        continue;
      }
      if (pageNow === 'eqdetail') {
        const g2 = guide();
        mark(!!g2, '装备详情页也会说一句（强化是两步）', g2 ? g2.key : '**详情页上一条引导都没有**');
        const enh = findHit(['eq_enh']);
        mark(!!enh, '详情页有「强化」可点', enh ? enh.id : '**没有强化按钮**');
        if (enh) {
          const before2 = Core.S.stats.enhances || 0;
          tap(enh); await wait(250);
          const after2 = Core.S.stats.enhances || 0;
          mark(after2 > before2, '点「强化」真的强化了一次',
            (after2 > before2 ? '强化次数 ' + before2 + ' → ' + after2 : '**没强化成**（材料/点数不够？）'));
        }
        continue;
      }
      /* 还没做完：这一步要的那颗（引导指着的，或引导表里写的锚点）再点一次 */
      const stt = U.coachCurrent();
      const tRule = TUT_OF[want] || {};
      const anchors = stt ? stt.targetId : ((typeof tRule.s === 'function') ? tRule.s() : tRule.s);
      const h = findHit(anchors) || findHit(['_coach_ok']);
      if (!h) break;
      tap(h);
      await wait(260);
      CV.render();
      await wait(140);
    }
    if (qCheck(want)) {
      mark(true, want + ' 真的做完了', '现在在 ' + page());
    } else if (!findHit((g0 && g0.want) ? String(g0.want).split(' | ') : []) &&
               /没有|先去|不够|条件/.test(String((g0 && g0.text) || ''))) {
      /* 条件未满足（手上没有可派的伙伴这类）——卡片把话说清了，流程到此为止，不算卡死 */
      mark(true, want + ' 条件未满足，但引导说清了怎么办（不是死胡同）', '现在在 ' + page());
      console.log('   （这一步需要玩家自己先补条件，链子在这里正常停住）');
      break;
    } else {
      mark(false, want + ' 真的做完了', '现在在 ' + page());
    }

    /* ④ 做完回首页领奖 —— 领完**同一个页面**还会不会再冒出一条讲同一件事的 */
    await goHome();
    await claimDailies();                 // 能领的日常顺手领掉（玩家习惯，也顺便给后面攒 ◆）
    const got = await claimAll();
    mark(got > 0, '做完能领到奖', got ? '领了 ' + got + ' 次' : '**点「领取奖励」没反应**');
    await settle(200);
    /* 回到这一步该在的那一页，看会不会"又讲一遍" */
    const backPage = (TUT_OF[want] || {}).page;
    if (backPage && backPage !== 'home') {
      CV.reset('home'); await wait(80);
      CV.push(backPage); await settle(260);
      const g2 = guide();
      if (g2) mark(false, '回到「' + backPage + '」又冒出一条引导', g2.key + '：' + String(g2.text).slice(0, 26) + '…');
      else mark(true, '回到「' + backPage + '」没有重复的引导');
      U.coachDrop();
    }
  }
  console.log('\n走过的步骤：' + visited.join(' → '));
  console.log('结论：' + (bad === 0 ? '整条主线"真玩一遍"没有卡点 ✓' : '有 ' + bad + ' 处要修 ✗') + '\n');
  process.exitCode = bad ? 1 : 0;
})();
