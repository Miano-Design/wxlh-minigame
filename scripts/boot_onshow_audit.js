/* 开机时序尺子（**真机那条缝** · onShow 同族）：node scripts/boot_onshow_audit.js
   ------------------------------------------------------------------------------
   为什么单开一支、而且必须**另起一个进程**：
   V1.0.6 的 P0 提审驳回（真机"游戏卡在此界面无法进一步游戏"）根因是**开机时序**——
   真机（小米11 · HyperOS 2.0.2 · 微信 8.0.76）启动时 `wx.onShow` **在注册那一刻就回调**，
   而我们的 onShow 处理器是 `relayoutNow → CV.render → realmState → S.player`，没有 try/catch；
   只要它跑在 `Core.load()/newGame()` 之前，就抛
   `TypeError: Cannot read properties of null (reading 'player')`，
   并且把 game.js 顶层**剩下的语句全部打断** → 审核员看到的就是"卡住"。

   ⚠️ 这个坑在 boot_audit 的**同进程**里测不出来：那边的 `Core` 只 require 一次，
   前面几个场景早把 `Core.S` 建好了（跨场景残留），于是"真机时序"跑起来也不会 null。
   要复现必须**整套全新加载**（core.js 也是新实例、`S` 真的是 null）—— 所以这里另起进程、
   自己一份干净环境。boot_audit 会 spawn 它一次，红绿一并报出来。

   ─────────────────────────────────────────────────────────────────────────
   V1.0.6 扩：**onShow 同族全测**（派单：只钉住"无存档 + 注册即回调"那条不够，
   同族路径一条都没测 —— 而它们的根是同一个：**建档完成之前只要有人触发渲染，就会崩**）。
   本文件现在覆盖五族：
     ① 切后台再切回来（onShow 第二次触发）：档已建好 / 档还没建好
     ② onShow 反复触发（连续多次）＋ 忠告弹窗还开着的时候触发
     ③ 建档进行中触发 onShow（竞争窗口）
     ④ 主画面 / 忠告弹窗开着的时候触发（这时 CV.top() 不是 home）
     ⑤ 无存档冷启动 + onShow 立刻触发（原来那 4 条，保留）

   【分类口径 · 派单要求写清"哪几条是模拟器能测的、哪几条只有真机能证"】
     · `[桩可测]`   = 用假环境把"真机会发生的事件序列"**重放**一遍，看**我们的代码崩不崩**、
                      状态建没建起来、当前页有没有被拽走、弹窗还在不在。这一族断言都属这类。
     · `[真机前提]` = "平台到底会不会这么派事件"本身。桩里只能**假设**，只有真机能证。
       本文件所有场景共用同一句前提：`wx.onShow 一注册就回调`，以及"启动途中/切后台回来
       都可能派 Show" —— 这不是我编的：驳回时真机 console 的栈里就写着
       `at <api onLifeCycle:Show callback function>`，而**开发者工具根本不派这个事件**。
       所以：**这一族在模拟器上一条都测不了**（不是桩不准，是平台差异）。
     · 造不出来的那一条（①"档还没建好时的第二次 onShow"）本文件**如实标出**，
       它的判据交给**改坏试验**（§文件末尾的《改坏试验怎么做》）。

   只读脚本：跑在假环境里，不碰真存档。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'game.js');

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
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
const handlers = { show: [], hide: [], resize: [] };
/* 定时器记账：整段重开机（下面 phase B）之前必须把**上一轮的间隔器**清掉 ——
   否则第一轮那个 1 秒心跳会拿着旧的 Core/CV 继续画，污染第二轮的错误捕获。 */
const liveTimers = new Set();
const _setTimeout = global.setTimeout, _setInterval = global.setInterval;
const _clearTimeout = global.clearTimeout, _clearInterval = global.clearInterval;
global.setTimeout = function (fn, ms) { const h = _setTimeout(fn, ms); liveTimers.add(h); return h; };
global.setInterval = function (fn, ms) { const h = _setInterval(fn, ms); liveTimers.add(h); return h; };
global.clearTimeout = function (h) { liveTimers.delete(h); return _clearTimeout(h); };
global.clearInterval = function (h) { liveTimers.delete(h); return _clearInterval(h); };
function clearAllTimers() { liveTimers.forEach((h) => { try { _clearTimeout(h); _clearInterval(h); } catch (e) {} }); liveTimers.clear(); }

global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  onWindowResize(cb) { handlers.resize.push(cb); },
  onShow(cb) { handlers.show.push(cb); },
  onHide(cb) { handlers.hide.push(cb); },
  setPreferredFramesPerSecond() {}, triggerGC() {}, onMemoryWarning() {},
  getFileSystemManager: () => ({ writeFileSync() {} }),
};

/* ---------- 事件重放器（真机动作 → 我们重放什么） ----------
   真机动作                        → 这里重放
   「用户切出去」                    → fireHide()（跑 onHide 处理器：落盘）
   「用户切回来」                    → fireShow()（跑 onShow 处理器：relayoutNow + catchUp）
   「平台在注册那一刻就派一次 Show」  → installImmediateShow()（wx.onShow 一被调用就回调）*/
let firedAtRegister = 0;      // "注册即回调"发生过几次（＝真机前提已就位）
const atRegister = [];        // 每次注册**那一刻**的全局状态快照
function installImmediateShow() {
  global.wx.onShow = function (cb) {
    handlers.show.push(cb);
    firedAtRegister++;
    atRegister.push({ core: !!(global.Core && global.Core.S), cv: !!global.CV });
    /* ⚠️ 这里**不许**把 cb() 包在 try/catch 里 —— 真机上它没被包，
       抛出去就会打断 game.js 顶层，我们要测的正是"会不会抛"。 */
    cb();
  };
}
function fireShow() {
  let err = null;
  handlers.show.slice().forEach((cb) => { try { cb({ scene: 1001 }); } catch (e) { if (!err) err = e; } });
  return err;
}
function fireHide() {
  let err = null;
  handlers.hide.slice().forEach((cb) => { try { cb({ scene: 1001 }); } catch (e) { if (!err) err = e; } });
  return err;
}
const wait = (ms) => new Promise((r) => _setTimeout(r, ms));

/* ---------- 整段重开机（phase B 要用"有存档"的开机） ----------
   只清本工程 require 缓存 + 本工程往 global 上挂的东西，我的假环境（wx/localStorage）不动 ——
   于是 store 里第一轮写下的存档会留给第二轮读，就得到"老档开机"。 */
const BEFORE_KEYS = new Set(Object.keys(global));
function reloadGame() {
  clearAllTimers();
  Object.keys(require.cache).forEach((k) => { if (k.indexOf(ROOT + path.sep) === 0) delete require.cache[k]; });
  Object.keys(global).forEach((k) => { if (!BEFORE_KEYS.has(k)) { try { delete global[k]; } catch (e) { global[k] = undefined; } } });
  handlers.show.length = 0; handlers.hide.length = 0; handlers.resize.length = 0;
  installImmediateShow();
  let err = null;
  try { require(GAME); } catch (e) { err = e; }
  return err;
}

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

(async function main() {
  /* ═══════════════════ ⑤ 无存档冷启动 + onShow 立刻触发（原有那条，保留） ═══════════════════ */
  console.log('\n=== ⑤ 无存档冷启动 + onShow 注册即回调（真机动作：首次安装点开游戏）===');
  installImmediateShow();
  const errA = (() => { try { require(GAME); return null; } catch (e) { return e; } })();
  let Core = global.Core, CV = global.CV;
  t('[真机前提] onShow 在注册那一刻就回调了（桩已按真机时序摆好；没回调说明尺子自己失效）',
    firedAtRegister > 0, '回调 ' + firedAtRegister + ' 次');
  t('[桩可测] 无存档冷启动**不抛错**（抛了＝真机上就是"卡住"）',
    !errA, errA ? (errA.constructor.name + ': ' + errA.message) : '无异常');
  t('[桩可测] 状态真的建起来了（S 不是 null —— 抛错会把建档那几行一起打断）',
    !!(Core && Core.S), Core && Core.S ? 'S.player.level=' + Core.S.player.level : '**S 仍是 null**');
  t('[桩可测] 界面落在开局那几页之一（不是"顶栏 + 空白"的死屏）',
    !!(CV && CV.top) && ['gate', 'welcome', 'create', 'bloodline', 'home'].indexOf(CV.top().name) >= 0,
    CV && CV.top ? '当前页 ' + CV.top().name : 'CV 都还没起来');

  /* ═══════ ③ 建档进行中触发 onShow（竞争窗口）—— 用「注册那一刻的状态」当判据 ═══════ */
  console.log('\n=== ③ 建档进行中触发 onShow（真机动作：启动还没走完，平台又派一次 Show）===');
  /* 这一条**不是**重放事件，而是钉住"事件注册必须排在读档/建档之后"这条**时序不变量**：
     只要注册那一刻 S 已经建好，那"任何 onShow（第一次、第二次、第 N 次）跑起来时 S 都不可能是 null"。
     ⚠️ 桩里造不出"注册时 S 还是 null"这个状态（game.js 的时序已经保证注册在建档之后；
        `Core.S` 是只读 getter，外面也改不成 null）—— 所以这一条的**反面**交给改坏试验证：
        把 game.js 的建档块挪回 `wx.onShow` 注册之后，这一条当场红（见文件末尾）。 */
  const regOk = atRegister.length > 0 && atRegister.every((s) => s.core);
  t('[桩可测·时序不变量] onShow 注册的那一刻，S 已经建好（＝"建档排在事件注册之前"，③的正面判据）',
    regOk, atRegister.map((s) => (s.core ? 'S已建好' : '**S还是null**')).join(' / ') || '没记到');
  t('[桩可测] 心跳基准（lastTick）也在注册之前就位 —— 否则 catchUp 会撞 TDZ',
    !errA, errA ? '抛了：' + errA.message : '没抛（onShow 处理器里 catchUp 已能跑）');

  /* ----------------- 交给 phase B：有存档开机（才能到"主画面 gate"） -----------------
     要让第二轮真的算"**完整老档**"（不然开机会落到 起名 / 选命格 那两步），
     这里得把名字与命格补齐再落盘 —— 走的是游戏自己的接口，不是伪造存档 JSON。 */
  /* 名字必须走**白名单**（core.cleanName：不在 D.PROTAG_NAMES 里的名字会被判空 —— 第一版我
     随手写了"开机时序"，结果名字没设上、第二轮变成"缺名字的老档"，打印出来自相矛盾）。 */
  try {
    const nm = (global.DATA.PROTAG_NAMES || [])[0] || '夜行者';
    Core.setPlayerName(nm);
    Core.choosePlayerBloodline('修真');
  } catch (e) {}
  try { Core.save(); } catch (e) {}          // 把这一轮建的档落到 store 里 → 第二轮就是"老档"
  console.log('  （phase B 用的老档：name=' + (Core.S.player.name || '**空**')
    + ' · bloodline=' + (Core.S.player.bloodline || '**空**') + ' → 完整老档＝开机会落到主画面 gate）');
  const errB = reloadGame();
  Core = global.Core; CV = global.CV;
  const U = global.U;
  console.log('\n=== ①/②/④ 有存档开机：主画面 + 忠告弹窗（真机动作：老玩家切后台再切回来）===');
  t('[桩可测] 有存档开机同样不抛错（onShow 仍在注册那一刻回调）',
    !errB, errB ? (errB.constructor.name + ': ' + errB.message) : '无异常');

  await wait(2200);                           // 品牌首屏 1.5s → 忠告弹窗
  const popupOpen = !!(U && U.overlay);
  t('[桩可测] 冷启动的忠告弹窗真的弹出来了（后面两条要拿它当场景）', popupOpen,
    popupOpen ? '弹窗在位：' + U.overlay.title : '**没弹出来**（这条场景就没测成）');

  /* ② onShow 反复触发（弹窗还开着）—— 真机动作：用户来回切好几次 */
  const err2 = [];
  for (let i = 0; i < 5; i++) { const e = fireShow(); if (e) err2.push(e.message); }
  t('[桩可测·②反复] 弹窗开着时连发 5 次 onShow：一次都不抛',
    err2.length === 0, err2.length ? err2[0] : '5 次都没抛');
  t('[桩可测·②反复] 弹窗还在、页面没被拽走（onShow 只重排+补挂机，不许动页面栈）',
    !!(U && U.overlay) && CV.top().name === 'gate',
    '弹窗 ' + (U && U.overlay ? '还在' : '**没了**') + ' · 当前页 ' + CV.top().name);

  /* ④ 主画面（忠告关掉之后）触发 onShow —— 真机动作：用户在主画面上切出去再切回来 */
  CV.dispatch('_cf_yes');                     // ＝点「我知道了」
  await wait(60);
  const pageNow = CV.top().name;
  t('[桩可测·④主画面] 关掉忠告后落在**主画面 gate**（老档不重走开局三步）', pageNow === 'gate', '当前页 ' + pageNow);
  const err4 = [];
  for (let i = 0; i < 3; i++) { const e = fireShow(); if (e) err4.push(e.message); }
  t('[桩可测·④主画面] 主画面上连发 3 次 onShow：不抛错、还停在 gate（没被拽去 home）',
    err4.length === 0 && CV.top().name === 'gate',
    err4.length ? err4[0] : '当前页 ' + CV.top().name);

  /* ① 切后台再切回来（档已建好）—— 真机动作：用户切出去（onHide→落盘）再切回来（onShow） */
  const sBefore = Core.S;
  const rawBefore = store[Object.keys(store)[0]];
  const errHide = fireHide();
  await wait(30);
  const errShow = fireShow();
  t('[桩可测·①切后台] onHide → onShow 一轮：两次都不抛', !errHide && !errShow,
    (errHide ? 'onHide:' + errHide.message : '') + (errShow ? ' onShow:' + errShow.message : '') || '都没抛');
  t('[桩可测·①切后台] 切回来之后：存档对象没被重建（onShow 不许把 S 读档/建档重来）',
    Core.S === sBefore, Core.S === sBefore ? '同一个 S' : '**S 被换掉了**');
  t('[桩可测·①切后台] 切回来之后还停在原页面（不许被重置回 home / 开局页）',
    CV.top().name === 'gate', '当前页 ' + CV.top().name);
  t('[桩可测·①切后台] onHide 真的落盘了（真机上切后台就是靠这一下保命）',
    !!store[Object.keys(store)[0]] && store[Object.keys(store)[0]].length > 50,
    '存档 ' + (store[Object.keys(store)[0]] || '').length + ' 字节');

  console.log('\n【造不出来的那一条（如实说）】');
  console.log('  · ①"档还没建好时的第二次 onShow" / ③"注册时 S 还是 null"：');
  console.log('    桩里**造不出来** —— game.js 现在的时序保证"注册 onShow 时建档已完成"，');
  console.log('    而 `Core.S` 是只读 getter（外部改不成 null），所以没有任何入口能重放这个状态。');
  console.log('    这一条的反面由**改坏试验**证：把建档块挪回注册之后 → 上面 ③ 那条当场红（见文件末尾）。');

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  clearAllTimers();
  process.exit(fail ? 1 : 0);
})();

/* ─────────────────────────────────────────────────────────────────────────────
   《改坏试验怎么做》（每条都跑过、都变红；原文存
      `岗位回单/验收截图-1.0.6/小游戏-M1onShow同族-改坏试验.txt`）

   ①「退回修复」型（证明**根因那一条**是真的在把关）：
      a. 把 onShow 的注册提前到建档之前（＝V1.0.5 的时序）：
         在 game.js 的 `const hadSave = Core.load();` 之前插一行
           if (wx.onShow) wx.onShow(function () { relayoutNow(390, 844, {}); });
         → ③「注册那一刻 S 已建好」当场红；而「不抛错／S 建起来了」**仍是绿的**，
           因为 cv.js 渲染入口那道兜底闸把这次渲染救了回来（两层防线的第一层坏了、第二层接住）。
      b. 再把兜底闸一起去掉（＝V1.0.5 那一版的真实形状）：删掉 cv.js 里
           if (G.Core && G.Core.ensureState && !G.Core.S) G.Core.ensureState();
         → 「不抛错」「S 真的建起来了」也一起红（TypeError: Cannot read properties of null）。
      c. 心跳那颗雷单独验：把 `let lastTick = Date.now();` 挪到 onShow 注册**之后**
         （声明留在模块顶层、赋值放到注册后面）→ onShow 处理器里的 catchUp 撞 TDZ：
           ReferenceError: Cannot access 'lastTick' before initialization
         → ③「心跳基准也在注册之前就位」红。
   ②「灵敏度」型（证明**场景类**断言不是白写的）：在 onShow 处理器里加一句 CV.reset('home')，
      → ①/④「切回来还停在原页面」红。这条不是历史上的 bug，只是证明那两条断言真会咬人。
   ───────────────────────────────────────────────────────────────────────────── */
