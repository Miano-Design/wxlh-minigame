/* 《残域》微信小游戏入口（重做版 · 2026-09-16）
   ------------------------------------------------------------------------------
   网页版是唯一标准：逻辑层 4 份原样同步，界面层一页一页照网页版 js/ui.js 复刻（js/screens.js）。
   加载顺序：环境垫片 → 逻辑层 → canvas 界面框架 → 界面 → 开机。
*/
require('./js/wx-adapter.js');   // window / localStorage 垫片 + 广告封装
require('./js/data.js');
require('./js/core.js');
require('./js/battle.js');
require('./js/dungeon.js');
require('./js/cv.js');           // canvas 界面框架（配色/字号/圆角全部取网页版 :root，并按 clamp 缩放）
require('./js/uiw.js');          // 通用件（卡片/标题行/键值行/宫格/按钮…每块对应网页版一个 CSS 类）
require('./js/sc-start.js');     // 开局三步：欢迎 → 起名 → 选血统
require('./js/sc-guide.js');     // 玩法指南 / 货币图鉴 / 游历奇遇
require('./js/sc-home.js');      // 灯阁（首页）
require('./js/sc-roster.js');   // 执灯者：伙伴总览 + 伙伴详情
require('./js/sc-recruit.js'); // 招募（三池 + 结果页 + 概率公示）
require('./js/sc-last.js');  // 炼化台 / 悬赏 / 任务成就 / 设置 / 挂机分工 / 深井
require('./js/sc-core-pages.js'); // 评级 / 权限 / 建设 / 境界 / 铭刻 / 伴生体 / 转生 / 灯录
require('./js/sc-lines.js');   // 秘术阁 / 法宝 / 坐骑 / 药园 / 斗法台 / 求签
require('./js/sc-grow.js');    // 成长（十三条养成线）+ 兑换大厅（四家店）
require('./js/sc-party.js');   // 队伍（小队 / 编队预设 / 阵型 / 挑人上阵）
require('./js/sc-bag.js');     // 背包（道具 / 材料 / 装备 + 装备详情）
require('./js/sc-protag.js');  // 主角详情（角色页）
require('./js/sc-battle.js');   // 战斗页（副本 / 深井 / 斗法台共用）
require('./js/sc-dungeon.js');  // 残域：世界列表 → 世界详情 → 关卡 → 扫荡

const CV = globalThis.CV, Core = globalThis.Core, G = globalThis;
/* 小游戏复刻的网页版版本号（设置页底部那行要跟网页版一字不差） */
globalThis.GAME_VER = '9.6.110';
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
/* 底栏四个页签 → 对应页面（网页版 #navbar） */
CV.NAV_TABS.forEach(function (t) {
  CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); });
});
CV.setup(info);
CV.bindTouch();
/* V9.6.90（父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
   窗口尺寸是**会变的** —— 键盘弹出、横竖屏切换、分屏、切前后台都可能触发。
   以前只在开机算一次布局，一变就按老尺寸画，底栏就掉到画面外。
   现在窗口一变就重算布局 + 立刻重画一帧。 */
if (wx.onWindowResize) {
  wx.onWindowResize(function (res) {
    let now = {};
    try { now = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}; } catch (e) {}
    const s = (res && res.size) || {};
    relayoutNow(s.windowWidth || now.windowWidth, s.windowHeight || now.windowHeight, now);
  });
}
/* 从后台回来（看广告、切出去再切回来）同样可能换了窗口尺寸，这里再对齐一次。 */
if (wx.onShow) {
  wx.onShow(function () {
    let now = {};
    try { now = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}; } catch (e) {}
    relayoutNow(now.windowWidth, now.windowHeight, now);
    /* 切后台期间被系统节流掉的时间要补进挂机池（按离线规则封顶 + 吃离线效率），
       与网页版 main.js 的 visibilitychange 同一口径。 */
    catchUp();
  });
}
/* 切到后台立刻落盘 —— 微信随时可能把进程回收，等不到下一次自动存。 */
if (wx.onHide) wx.onHide(function () { try { Core.save(); } catch (e) {} });
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
let lastTick = Date.now();
let saveCounter = 0;
let pendingBoot = [];
/* 引导要**给开机弹窗让路**（网页版 webTour 同一条规矩：弹窗栈没空就不抢戏）。
   这个标记必须在第一次渲染之前就位 —— 首页一渲染就会跑 coachFor。 */
G.bootModalPending = function () { return pendingBoot.length > 0; };

/* 开机：没有存档 → 欢迎（网页版 main.js 的流程）；有存档 → 首页 + 离线结算 */
const hadSave = Core.load();
let bootGains = null;
if (hadSave) {
  Core.ensureDaily && Core.ensureDaily();
  /* 离线结算（和网页版一样：**入账在 core 里做，这里只决定要不要打扰玩家**） */
  bootGains = Core.settleOffline && Core.settleOffline();
}
/* 弹窗顺序照网页版：**离线收益先说，七日登录接在后面**。
   两个都要在"第一帧渲染"之前入队 —— 晚一步，开场引导就先占住屏幕了。 */
/* 开局三步（签契约 / 起名 / 选血统）还没走完时先不弹 —— 网页版 queueLoginReward 同一条规矩：
   开局是**不可跳过**的，弹窗砸在它上面会把玩家卡在两层面板中间。奖励不丢，只是晚点给。 */
if (bootGains && (bootGains.cheat || bootGains.seconds >= 300)) pendingBoot.push({ kind: 'offline', g: bootGains });
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
if (hadSave) {
  if (!Core.S.player.name) CV.reset('create');
  else if (!Core.S.player.bloodline) CV.reset('bloodline');
  else CV.reset('home');
} else {
  Core.newGame(); Core.ensureDaily && Core.ensureDaily();
  CV.reset('welcome');
}

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
