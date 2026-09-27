/* 《残域》微信小游戏入口（重做版 · 2026-09-16）
   ------------------------------------------------------------------------------
   网页版是唯一标准：逻辑层 4 份原样同步，界面层一页一页照网页版 js/ui.js 复刻（js/screens.js）。
   加载顺序：环境垫片 → 逻辑层 → canvas 界面框架 → 界面 → 开机。
*/
require('./js/wx-adapter.js');   // window / localStorage 垫片 + 广告封装
/* V1.1.1（拆掉"加固分叉"）：内存加固的运行时搬到独立文件，**必须在 core.js 之前**加载 ——
   它把真正的 getProxied 挂到 globalThis，core.js 的钩子就取它（加固行为与注入时代完全一致）。
   放在 wx-adapter 之后：那一步才把 window / localStorage 这些全局垫好。 */
require('./js/mem-guard.js');
require('./js/data.js');
require('./js/core.js');
require('./js/battle.js');
require('./js/dungeon.js');
require('./js/cv.js');           // canvas 界面框架（配色/字号/圆角全部取网页版 :root，并按 clamp 缩放）
/* ⚠️ 音频必须排在这里：cv.js 之后（要包 CV.dispatch 的全局点击收口）、
   **uiw.js 之前**（引导/弹窗那层要包在音频外面）—— 顺序反了，"被引导吃掉的那一下"也会出声。 */
require('./js/audio.js');        // BGM 无缝循环 + WebAudio 现场合成音效（2026-09-27 音频系统）
require('./js/uiw.js');          // 通用件（卡片/标题行/键值行/宫格/按钮…每块对应网页版一个 CSS 类）
require('./js/sc-gameclub.js');  // 游戏圈入口（原生按钮的摆放与兜底，与页面无关，先于各页面加载）
require('./js/sc-cloud.js');     // 存档云同步（微信云开发 · 集合 saves；只登记两个联网口子，见 boot）
require('./js/sc-splash.js');    // 开机首屏（主视觉）+ 选命格背影（V1.1.3）
require('./js/sc-start.js');     // 开局三步：欢迎 → 起名 → 选血统
require('./js/sc-guide.js');     // 玩法指南 / 货币图鉴 / 游历奇遇
require('./js/sc-home.js');      // 灯阁（首页）
require('./js/sc-roster.js');   // 执灯者：伙伴总览 + 伙伴详情
require('./js/sc-recruit.js'); // 招募（三池 + 结果页 + 概率公示）
require('./js/sc-last.js');  // 炼化台 / 悬赏 / 任务成就 / 设置 / 挂机分工 / 深井
require('./js/sc-core-pages.js'); // 评级 / 权限 / 建设 / 境界 / 铭刻 / 伴生体 / 转生 / 灯录
require('./js/sc-lines.js');   // 秘术阁 / 法宝 / 坐骑 / 药园 / 斗法台 / 点灯（原「求签」）
require('./js/sc-grow.js');    // 成长（十三条养成线）+ 市集（四家店 · V1.1.9 正名：原「兑换大厅」）
require('./js/sc-party.js');   // 队伍（小队 / 编队预设 / 阵型 / 挑人上阵）
require('./js/sc-bag.js');     // 背包（道具 / 材料 / 装备 + 装备详情）
require('./js/sc-protag.js');  // 主角详情（角色页）
require('./js/sc-battle.js');   // 战斗页（副本 / 深井 / 斗法台共用）
require('./js/sc-dungeon.js');  // 残域：世界列表 → 世界详情 → 关卡 → 扫荡

const CV = globalThis.CV, Core = globalThis.Core, G = globalThis;
/* ⚠️ V1.0.6（P0 · 提审驳回 · 真机「游戏卡在此界面无法进一步游戏」）——
   **读档 / 建档必须在任何渲染与任何事件注册之前**，这段就是那道闸。
   ─────────────────────────────────────────────────────────────────────────
   真机现场（小米11 · HyperOS 2.0.2.0 · 微信 8.0.76）的 console 栈：
     Object.realmState (game.js:4203) ← (game.js:12001) ← CV.render (5249)
       ← CV.splash (15157) ← (16658)                    …①开机首屏那一帧
       ← relayoutNow (16604) ← at <api onLifeCycle:Show callback function>   …②onShow
       ← relayoutNow (16604) ← (16584)                  …③另一次重排
   三条栈都落在**同一个入口**：`CV.render → realmState → S.player`，而那时 `S` 是 null。
   本机（模拟器）复现不出来 —— ⚠️ **不是因为开发者工具不派这个事件**。
   2026-09-24 实测（boot_onshow_audit 那条线上顺手探的）：开发者工具**也会派** Show，
   只是**异步** —— 探针打点是「注册 t=…739 / 回调 t=…762」，差 **23ms**；
   而真机是**在 `wx.onShow(...)` 这一次调用里同步回调**（驳回时 console 的栈
   `at <api onLifeCycle:Show callback function>`），当场就把 game.js 顶层打断。
   这个"同步 vs 异步 23ms"就是"本地好好的、真机卡死"的全部原因 ——
   旧的注释把两件事混成了一句（"工具不派事件"），下一轮别照那句理解。
   而我们的 onShow 处理器里是 `relayoutNow → CV.render`，**没有 try/catch**：
   它一旦跑在 `Core.load()/newGame()` 之前，就抛 TypeError，
   并且把 game.js 顶层**剩下的语句全部打断**（`CV.reset(...)` 再也跑不到）→ 玩家/审核员看到的就是"卡住"。

   V1.0.5 那次修的是**同一个症状**（"首次安装白屏"），但只把 `newGame()` 提到 `CV.splash()` 之前 ——
   **不够**：splash 之前还有 `CV.setup` / `bindTouch` / onResize / onShow 这一堆注册与渲染入口，
   真机的 Show 事件就钻在这条缝里。所以现在把这段提到**最前面**（根因）；
   渲染入口另有一道兜底闸（见 `js/cv.js` 的 `CV.render`：S 为 null 时先读档/建档再画，且**出声**）。
   ⚠️ 谁再往下挪这段，都会让真机那个洞重新打开 —— scripts/boot_audit.js 的场景 6 会当场报红。 */
const hadSave = Core.load();
let bootGains = null;
if (hadSave) {
  Core.ensureDaily && Core.ensureDaily();
  /* 离线结算（和网页版一样：**入账在 core 里做，这里只决定要不要打扰玩家**） */
  bootGains = Core.settleOffline && Core.settleOffline();
}
if (!hadSave) { Core.newGame(); Core.ensureDaily && Core.ensureDaily(); }
/* ⚠️ 心跳计时器也必须在**事件注册之前**就位（V1.0.6 · P0 的第二颗雷）：
   `onShow` 处理器里除了 `relayoutNow` 还调 `catchUp()`，而 `catchUp` 读 `lastTick` ——
   `let/const` 有 TDZ：真机上 onShow 一注册就回调时，这两行还没执行到，
   于是 `ReferenceError: Cannot access 'lastTick' before initialization`。
   真机 console 里看不到它，是因为**第一条 TypeError（S 为 null）先抛、把后面全挡住了** ——
   也就是说：只把建档那一段挪到前面还不够，这一颗雷会立刻顶上。 */
let lastTick = Date.now();
let saveCounter = 0;
/* 小游戏版本号（设置页底部那行读它） */
/* V1.0.3（2026-09-27 · 父亲大人拍板）：**上传版本号就用 1.0.3**。
   上一批（游戏圈入口）曾按"当前 +1"写成 1.0.4，这次他明确给了号，改回 1.0.3 ——
   **不是回退、不是笔误**：他的口径是"上传 / 提审 / 手上那份材料得是同一个号"。
   网页版已归档（本地删除），所以"四处同步"现在只剩这一处。 */
globalThis.GAME_VER = '1.0.3';
/* V1.0.2（多账号调试自审时在 Console 里抓到的）：
   这一行原来是**裸调用** —— 冷启动时 jsbridge 还没就绪，wx.getWindowInfo() 会抛
   「[jsbridge] invoke getSystemInfo fail: jsbridge not ready」。
   而它写在 game.js 的**顶层**：一抛出去，下面的 CV.setup / bindTouch / 心跳**全都不会执行**，
   表现就是白屏卡死。下面 onWindowResize 和 onShow 那两处早就包了 try/catch，只有这里是漏的。
   拿到的是空对象也不怕：CV.relayout 里 `if (!w || !h) return`，会保持默认尺寸，
   再由下面那次延迟补算 / onWindowResize 兜回来。 */
let info = {};
try { info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}; } catch (e) {}
/* 底栏四个页签 → 对应页面（网页版 #navbar） */
CV.NAV_TABS.forEach(function (t) {
  CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); });
});
CV.setup(info);
CV.bindTouch();
/* 开机那一次如果没拿到尺寸（jsbridge 未就绪），延后补一次 —— onWindowResize 只在
   "窗口真的变了"时才触发，窗口不变它是不会来救场的。 */
if (!info.windowWidth) {
  setTimeout(function () {
    let now = {};
    try { now = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}; } catch (e) {}
    relayoutNow(now.windowWidth, now.windowHeight, now);
  }, 300);
}
/* V9.6.90（父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
   窗口尺寸是**会变的** —— 键盘弹出、横竖屏切换、分屏、切前后台都可能触发。
   以前只在开机算一次布局，一变就按老尺寸画，底栏就掉到画面外。
   现在窗口一变就重算布局 + 立刻重画一帧。 */
/* V1.1.15（2026-09-27 · 时序不变量）：**音频的前后台钩子必须在这里装** ——
   也就是"读档/建档（上面那几行）之后"。原来它写在 js/audio.js 的模块顶层，
   等于"事件注册早于建档"，被 `boot_onshow_audit` 的时序断言抓了个正着。 */
try { if (globalThis.AUDInstallLifecycle) globalThis.AUDInstallLifecycle(); } catch (e) {}
if (wx.onWindowResize) {
  wx.onWindowResize(function (res) {
    let now = {};
    try { now = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}; } catch (e) {}
    const s = (res && res.size) || {};
    relayoutNow(s.windowWidth || now.windowWidth, s.windowHeight || now.windowHeight, now);
  });
}
/* 从后台回来（看广告、切出去再切回来）同样可能换了窗口尺寸，这里再对齐一次。 */
/* 防熄屏 · 开机第一件事（V1.1.19 · 父亲大人："玩着玩着手机就黑屏了"）：
   `wx.setKeepScreenOn(true)` —— 放置类玩家大半时间是在灯阁看挂机数字，正是会黑屏的那种场景。
   适配器里那句 `G.keepScreenOn` 自己带了三层兜底（没有这个 API／调用抛错／返回失败都不出声），
   所以这里连 return 都不用看：它只影响"屏幕亮不亮"，不该影响开机。 */
try { if (G.keepScreenOn) G.keepScreenOn(); } catch (e) {}
if (wx.onShow) {
  wx.onShow(function () {
    let now = {};
    try { now = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}; } catch (e) {}
    relayoutNow(now.windowWidth, now.windowHeight, now);
    /* 切后台期间被系统节流掉的时间要补进挂机池（按离线规则封顶 + 吃离线效率），
       与网页版 main.js 的 visibilitychange 同一口径。 */
    catchUp();
    /* 防熄屏（V1.1.19 · 父亲大人："玩着玩着手机就黑屏了"）：`setKeepScreenOn` 的效果
       **只在当前小游戏前台有效**，切出去（看广告、回消息）回来就没了 ⇒ 每次回前台补一次。
       放在 try 里 + 适配器里那句"没有这个 API 就静默跳过"，绝不因为这一条把开机弄崩。 */
    try { if (G.keepScreenOn) G.keepScreenOn(); } catch (e) {}
  });
}
/* 切到后台立刻落盘 —— 微信随时可能把进程回收，等不到下一次自动存。 */
if (wx.onHide) wx.onHide(function () { try { Core.save(); } catch (e) {} });
/* 云同步（js/sc-cloud.js）：**只在这里登记两个联网口子** —— 第一次用户交互之后 / 切后台。
   首帧一次网络都不发（存档照旧只读本地，秒进、断网可玩）；开关关着时连口子都不挂。 */
if (G.CloudSync && G.CloudSync.boot) G.CloudSync.boot();
function relayoutNow(w, h, now) {
  if (!w || !h) return;
  /* 尺寸没变就只重画一帧（重画本身也会把 dpr 矩阵设回去 —— 微信随时可能洗掉它） */
  CV.relayout({ windowWidth: w, windowHeight: h, pixelRatio: now && now.pixelRatio, safeArea: now && now.safeArea });
  CV.render();
}
/* ==================================================================================
   心跳 —— V9.6.90 补上的**最大一块缺口**：
   网页版 main.js 里有一条每秒的心跳，小游戏这边一条都没有。于是这四件事在
   **小游戏里从来没发生过**（玩法机制直接是死的，不是"看着不一样"）：
     ① `Core.onlineTick(dt)` —— 挂机的每秒入池（bankSec）＋ **游历奇遇计时**（travelTick 在它里面）。
        没有它：挂机收益永远是 0，游历奇遇的"5/10/20/30…分钟出一次"永远等不到。
     ② `Core.settleOffline()` —— 离线结算（离线几小时的收益 + 防改时间）。
     ③ 每 15 秒自动存盘 —— 小游戏原来只在"玩家操作时"存，半路被杀进程就丢一截。
     ④ 首页挂机区实时刷新 —— 原来数字只有换页才动。
   下面按网页版那一条一比一补上（dt 单帧封顶 10 秒，防卡顿跳变；切后台按离线规则补）。
================================================================================== */
let pendingBoot = [];
/* 引导要**给开机弹窗让路**（网页版 webTour 同一条规矩：弹窗栈没空就不抢戏）。
   这个标记必须在第一次渲染之前就位 —— 首页一渲染就会跑 coachFor。 */
G.bootModalPending = function () { return pendingBoot.length > 0; };

/* 开机：**读档/建档已经在文件最前面做完了**（V1.0.6 · P0，见那段长注释与 boot_audit 场景 6）。
   这里只剩"要不要打扰玩家"：有没有离线收益、七日登录要不要排队。 */
/* 弹窗顺序照网页版：**离线收益先说，七日登录接在后面**。
   两个都要在"第一帧渲染"之前入队 —— 晚一步，开场引导就先占住屏幕了。 */
/* 开局三步（签契约 / 起名 / 选血统）还没走完时先不弹 —— 网页版 queueLoginReward 同一条规矩：
   开局是**不可跳过**的，弹窗砸在它上面会把玩家卡在两层面板中间。奖励不丢，只是晚点给。 */
if (bootGains && (bootGains.cheat || bootGains.seconds >= 300)) pendingBoot.push({ kind: 'offline', g: bootGains });
/* ================= V1.1.18（N5 · 留存环：回归礼）=================
   断了一阵子（`S.login.lastClaim` 与今天差 ≥2 个自然日）再回来 → 开机**就发**一份回归礼，
   弹窗只负责"报账"。排在这里（离线收益之后、七日登录之前）：三条都按"先给实惠、再给日常"排。
   ⚠️ 必须排在 `flushBootModals` 认领七日登录**之前** —— 七日登录一认领，`lastClaim` 就变成今天，
      "隔了几天"这个判定当场归零（所以发在这里，而不是弹窗的回调里）。 */
const bootComeback = (hadSave && Core.grantComeback) ? Core.grantComeback() : null;
if (bootComeback) pendingBoot.push({ kind: 'comeback', g: bootComeback });
pendingBoot.push({ kind: 'login' });
/* 下架道具退款：core 的 migrate 会把老档里剩的治疗剂/强化剂按原价退成 ◈ 点数，
   并置一位 retiredRefundPending。**钱变了就得说一声** ——
   网页版 main.js 开局会提示一次（读完就清标记并落盘），小游戏原来没人读这一位，
   于是点数凭空多了一截，玩家只会以为自己记错了。 */
if (hadSave && Core.S.retiredRefundPending) {
  const gotRefund = Core.S.retiredRefund || 0;
  Core.S.retiredRefundPending = false;
  try { Core.save(); } catch (e) {}
  setTimeout(function () {
    CV.toast('治疗剂 / 强化剂已下架，背包里剩的按原价退回：◈ ' + gotRefund.toLocaleString(), 4200);
  }, 600);
}
/* 冷启动首屏（V1.1.3 · 创意总监 H5）：见 js/sc-splash.js。
   两条位置上的讲究，都是实测出来的：
     ① 必须在**第一次 CV.reset 之前** —— 它是一层覆盖绘制，第一帧就该在画面上；
        顺序反了玩家会先看到一帧黑屏；
     ② 必须排在**上面那几行 `pendingBoot.push(...)` 之后** ——
        首屏自己会渲染一帧，那一帧里 coachFor 会跑一次；开机弹窗要是还没入队，
        "弹窗没清完就不弹引导"那道闸就形同虚设：开场引导会先占住屏幕，
        把离线收益 / 七日登录永远堵在队列里（本单实测踩到过，boot_audit 当场报红 6 条）。 */
if (CV.splash) CV.splash(1500);
/* V1.0.5 → V1.0.6（父亲大人 2026-09-23 · **忠告独立成弹窗，冷启动先弹**）
   ---------------------------------------------------------------------------
   V1.0.5：「开局的适龄和版权两个弹窗可以不要，主画面可以在初次登陆选完血统出现，上面有个
   按钮写进入残域；之后登陆就直接主画面进残域。」→ 那两页"必须点才放行"的合规闸（notice /
   copyright）删掉，合规内容常驻主画面。
   V1.0.6 再改口径：「健康游戏是独立的弹窗，不要跟主画面做到一起」，时机他选 **C**：
     · 主画面（sc-start.js 的 gate 页）只剩**两块**：品牌 ＋【进入残域】；
     · 《健康游戏忠告》四句全文搬进 `U.healthNotice` 弹窗，**冷启动第一件事**就是它
       —— 关掉才往下走（玩家在关掉之前碰不到任何玩法，2.6.2 的"游戏开始前"仍然满足）。
   顺序：品牌首屏（splash 1.5s）→ 忠告弹窗 → 关掉 → 主画面（新档：先欢迎/签契约 → 起名 →
   选命格，再落到主画面）→ 点【进入残域】→ 灯阁。
   ⚠️ 那串 `hadSave` 分支**不能删**，它是老档的开局补步：
     · 完整老档         → 主画面；· 缺名字 / 缺命格 → 先补那一步（那两步里没有任何玩法），
       补完落到主画面（见 sc-start.js 的 name_ok / bl_pick 处理器）；· 新档 → 欢迎 → 起名 → 选命格。 */
CV.reset('gate');                       // 弹窗背后就是主画面（与网页版 #boot 同一个样子）
function afterHealthNotice() {
  CV.reset(hadSave
    ? (!Core.S.player.name ? 'create' : (!Core.S.player.bloodline ? 'bloodline' : 'gate'))
    : 'welcome');
}
/* 品牌首屏（1.5 秒）走完再弹忠告 —— 不然弹窗会盖在"灯芯燃起中…"那条进度条上。 */
setTimeout(function () {
  if (G.U && G.U.healthNotice) G.U.healthNotice(afterHealthNotice);
  else afterHealthNotice();
}, 1500);

function catchUp() {
  const now = Date.now();
  const gap = (now - lastTick) / 1000;
  lastTick = now;
  if (gap > 10) {
    const cap = (Core.offlineCapHours ? Core.offlineCapHours() : 6) * 3600;
    Core.onlineTick(Math.min(gap, cap) * (Core.offlineEfficiency ? Core.offlineEfficiency() : 1));
  }
}

function flushBootModals() {
  if (!pendingBoot.length) return;
  if (CV.top().name !== 'home') return;                        // 开局还没走完
  if (G.U && (G.U.overlay || (G.U.coachActive && G.U.coachActive()))) return;   // 有弹窗/引导压着，先让路
  const item = pendingBoot.shift();
  if (item.kind === 'offline') { G.U.offlineGains(item.g); return; }
  /* 回归礼（N5）：奖**开机那一刻就发过了**，这里只报账（读一份已经到手的账，不发第二次） */
  if (item.kind === 'comeback') { if (G.U.comebackGift) G.U.comebackGift(item.g); return; }
  /* 七日登录：**发放放在这里**（不是开机那一刻）—— 网页版也是等弹窗栈空了才发，
     免得奖励弹窗和开局三步/离线收益打架。同一天第二次调用会返回 null，所以不会重复发。 */
  if (item.kind === 'login') { const lr = Core.loginReward && Core.loginReward(); if (lr) G.U.loginReward(lr); }
}
/* 七日登录：老档、新档都要发（网页版 queueLoginReward 同一处修补） */
setInterval(function () {
  const now = Date.now();
  const dt = Math.min(10, (now - lastTick) / 1000);   // 单帧最多计 10 秒，防卡顿跳变
  lastTick = now;
  try { Core.onlineTick(dt); } catch (e) {}
  saveCounter += dt;
  if (saveCounter >= 15) { saveCounter = 0; try { Core.save(); } catch (e) {} }
  /* 主界面（灯阁）的挂机区/游历奇遇要"活着"：每秒重画一帧。
     有弹窗、有引导、正在战斗时不动（那几种情况各自有更合适的重画时机）。 */
  if (CV.top().name === 'home'
    && !(G.U && (G.U.overlay || (G.U.coachActive && G.U.coachActive())))
    && !CV.toasts.length) CV.render();
  flushBootModals();
}, 1000);
/* 开局走完（进到灯阁）再发一次 —— 上面那 1 秒的心跳也会周期性地来碰这件事 */
setTimeout(flushBootModals, 900);

/* 开发期截图（devtools 里画布是 HTMLCanvasElement → 自己导出 PNG，康康好对比） */
try {
  const plat = (wx.getSystemInfoSync ? (wx.getSystemInfoSync().platform || '') : '');
  if (plat === 'devtools' || !plat || /devtools/i.test(String(info.platform || ''))) {   // getWindowInfo 的 platform 在模拟器里可能不是 devtools，这里放宽
    setTimeout(() => {
      const canvas = globalThis.CE_CANVAS;
      if (!canvas || !canvas.toDataURL) { console.log('[CE-SHOT-FAIL] 没有画布'); return; }
      const b64 = String(canvas.toDataURL('image/png')).split(',')[1] || '';
      const p = (wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : '/tmp') + '/ce-shot.png';
      const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
      if (fs && fs.writeFileSync) { fs.writeFileSync(p, b64, 'base64'); console.log('[CE-SHOT] ' + p); }
      else console.log('[CE-SHOT-FAIL] 不能写文件');
    }, 2500);
  }
} catch (e) {}
