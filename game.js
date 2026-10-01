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
/* V1.0.4 · 官方能力接入层（R2~R8 · 父亲大人 09-27 点单）：内存告警 / 弱网 / 帧率 / 更新 /
   收藏 / 鼠标滚轮。**只注册、不动作** —— 真正的注册由下面的 `G.CAP.install()` 在
   读档/建档之后调（与音频那条同一条时序纪律）。放在 cv.js 之后：它要包 CV 的换页入口。 */
require('./js/wx-cap.js');
/* ⚠️ 音频必须排在这里：cv.js 之后（要包 CV.dispatch 的全局点击收口）、
   **uiw.js 之前**（引导/弹窗那层要包在音频外面）—— 顺序反了，"被引导吃掉的那一下"也会出声。 */
require('./js/audio.js');        // BGM 无缝循环 + WebAudio 现场合成音效（2026-09-27 音频系统）
require('./js/uiw.js');          // 通用件（卡片/标题行/键值行/宫格/按钮…每块对应网页版一个 CSS 类）
require('./js/sc-gameclub.js');  // 游戏圈入口（原生按钮的摆放与兜底，与页面无关，先于各页面加载）
require('./js/sc-cloud.js');     // 存档云同步（微信云开发 · 集合 saves；只登记两个联网口子，见 boot）
require('./js/sc-namecheck.js'); // 自由命名 · 内容安全闸（V1.0.4 · V：本地筛 → 名单 → 云函数机审）
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
/* B 批（2026-10-01）：剧情系统 —— 内容表要先于系统层加载（系统层启动时读 STORYDATA）。 */
require('./js/sc-story-data.js'); // 剧情内容（36 世界四段 + Boss + 人物 + 装备 + 12 母版映射）
require('./js/sc-story.js');      // 小说式播放器 + 卷宗 + 程序化场景（占位背景）

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
/* V1.1.20（F1-5）：这一句是**开机兜底**（不是玩家选择）—— 读不出来进救援态时，
   `keepRescue: true` 让它"只建内存档、不覆盖主键"（主键那份读不出来的原文要留着）。 */
if (!hadSave) { Core.newGame({ keepRescue: true }); Core.ensureDaily && Core.ensureDaily(); }
/* ⚠️ 心跳计时器也必须在**事件注册之前**就位（V1.0.6 · P0 的第二颗雷）：
   `onShow` 处理器里除了 `relayoutNow` 还调 `catchUp()`，而 `catchUp` 读 `lastTick` ——
   `let/const` 有 TDZ：真机上 onShow 一注册就回调时，这两行还没执行到，
   于是 `ReferenceError: Cannot access 'lastTick' before initialization`。
   真机 console 里看不到它，是因为**第一条 TypeError（S 为 null）先抛、把后面全挡住了** ——
   也就是说：只把建档那一段挪到前面还不够，这一颗雷会立刻顶上。 */
let lastTick = Date.now();
let saveCounter = 0;
/* R1.2 · P1：心跳的句柄。**声明必须早于下面所有注册点** —— 真机上 `wx.onShow(...)` 会
   在注册那一刻就同步回调（本项目为这一类 TDZ 栽过两次），到时候处理器里要碰它。 */
let heartbeatTimer = null;
/* 小游戏版本号（设置页底部那行读它） */
/* V1.0.4（2026-09-27 · 父亲大人 09-27 点单：「官方能力接入」这一批**全部算 1.0.4**）。
   · 1.0.3 已于 09-27 传成体验版 ⇒ **那个号冻住，这一批不许再改它**；
   · 版本号**只此一处**（网页版已归档，`scripts/release.js` 直接读这一行）；
   · 历史（别当笔误）：上一批（游戏圈入口）曾把号写成 1.0.4，父亲大人当时给了 1.0.3，
     就改回 1.0.3 上传了 —— 现在是**新一轮**，号按他要的 1.0.4 走。 */
/* V1.0.4 → **回到 1.0.3**（父亲大人 2026-09-27 深夜：「**版本还是 1.0.3 吧**」）——
   他的口径一直是"上传 / 提审 / 手上材料用同一个号"，同号再传一次＝**覆盖体验版**（不是笔误、不是回退）。 */
/* 2026-09-29：父亲大人拍板 ——「你把现在的问题都解决了**传 1.0.4** 的」。
  这一版的内容见 `岗位回单/版本说明-1.0.4-20260928.md`（战斗数值修正 / 复活 / 云存档取回 / 起名与输入 /
  小屏适配 / 提示精简 / 返回键与呼吸带 / GM 后门按环境开）。 */
/* 2026-10-01：父亲大人点单「设置界面里加一个兑换码的按钮」——
   **1.0.4 已经正式发布了**（线上版本就是它），所以这一批必须换号，不能覆盖线上那个包。
   1.0.5 ＝ 兑换码 / 新手礼包：设置页一颗入口，码表在 `js/data.js` 的 `GIFT_CODES`、
   判据在 `Core.claimGift()` —— **纯本地，一次网络请求都不发**（父亲大人：
   「不要调用 mp 后台，直接写在游戏里就行了，就当新手礼包让用户直接领了」）。 */
globalThis.GAME_VER = '1.0.5';
/* ================= V1.0.4 · R1 / R9（父亲大人 09-27 点单：线上日志 ＋ 事件上报）=========
   开机这两行是**真机白屏 / 丢档排查的第一现场**，也是最缺的两条信息：
     · `boot/save` —— 这次到底读到档了没有、多大、存档版本几号（**只报字节数与版本号，
       绝不上报存档内容**：`G.LOG` 的字段白名单会把别的键全丢掉，见 wx-adapter 的说明）；
     · `boot/load_fail` —— 读不出来时**为什么**（json = 明文坏了 / enc = 密文解不开 /
       shape = 不像存档 / migrate:xxx = 迁移抛错），与设置页那行诊断同一个来源（Core.loadIssue）。
   `app_open` 是 R9 要的六个事件之一，口径是**每天一次**（用本地日期当闸）：
   后台要的是"日活"，不是"每次冷启动"。没有 `wx.reportEvent` 时出口自己静默跳过。 */
try {
  if (G.LOG) {
    const dg = (Core.saveDiag ? Core.saveDiag() : null) || {};
    G.LOG.info('boot', 'save', { ok: !!hadSave, bytes: dg.len || 0, ver: (Core.S && Core.S.v) || 0 });
    if (!hadSave) {
      const li = Core.loadIssue ? Core.loadIssue() : null;
      if (li) G.LOG.warn('boot', 'load_fail', { why: String(li.why || '') + (li.err ? '|' + li.err : '') });
    }
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    if (localStorage.getItem('wxlh_open_day') !== day) {
      localStorage.setItem('wxlh_open_day', day);
      G.LOG.event('app_open', { day: day, ver: String(globalThis.GAME_VER || '') });
    }
  }
} catch (e) {}
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
  /* 父亲大人 09-27 深夜（派单 Z-C）：「点下面的导航按钮又得重新进去界面重新找」——
     页签不再直接 reset，改走 `CV.switchTab`：离开时把这一格现场（整条栈 + 滚动位置）存下来，
     切回来时还原（含当时停在的那个二级页）；没有现场 / 那条栈已经没有了才落回该格首页。 */
  CV.on('tab:' + t.id, function () { CV.switchTab(t.id); });
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
    /* 回前台：**先把后台那段时间一次算清**，再起表（顺序不能反 —— 反了就是两条路各算一遍）。 */
    catchUp();
    try { startHeartbeat(); } catch (e) {}
    /* 防熄屏（V1.1.19 · 父亲大人："玩着玩着手机就黑屏了"）：`setKeepScreenOn` 的效果
       **只在当前小游戏前台有效**，切出去（看广告、回消息）回来就没了 ⇒ 每次回前台补一次。
       放在 try 里 + 适配器里那句"没有这个 API 就静默跳过"，绝不因为这一条把开机弄崩。 */
    try { if (G.keepScreenOn) G.keepScreenOn(); } catch (e) {}
  });
}
/* 切到后台立刻落盘 —— 微信随时可能把进程回收，等不到下一次自动存。 */
/* V1.1.20（F1-1）：这一句是**自动**存盘（可能玩家根本没动手就被切走了）——
   照常落盘、照常推 idle.lastTs，但不许把"谁新听谁的"判据（savedAt）推成"现在"。
   玩家真玩过的那几下，各自的存盘已经把判据盖好了，不差这一句。 */
/* 切后台：**先停表、再落盘** —— 后台那段时间交给回前台时的 `catchUp()` 一次算清，
   心跳不许在后台继续跑（挂机数字 / CAP.tick / 15 秒自动存盘全都不该在那儿空转）。 */
if (wx.onHide) wx.onHide(function () {
  try { stopHeartbeat(); } catch (e) {}
  try { Core.save({ auto: true }); } catch (e) {}
});
/* 云同步（js/sc-cloud.js）：**只在这里登记两个联网口子** —— 第一次用户交互之后 / 切后台。
   首帧一次网络都不发（存档照旧只读本地，秒进、断网可玩）；开关关着时连口子都不挂。 */
if (G.CloudSync && G.CloudSync.boot) G.CloudSync.boot();
/* ================= V1.1.20（F1-5 · 严重）：读档失败 / 更高版本 → **救援态**，喊玩家拍板 =================
   背景：原来"读不出来"＝当场建档，而 newGame() 里那句 save() 立刻把主键写成空新档 ——
   玩家那一份（也许只是这一版读不懂、下个版本就能读）就这么被顶掉了（与 core.js 文件头
   那句"绝不让一点进度被下一次存盘悄悄覆盖"自相矛盾）。现在 core 侧已经**禁写**（suppressSave），
   这里只做一件事：**把选择权交给玩家**（不替他做主，也不静默）。
     · 「继续新档」→ `Core.rescueConfirmNewGame()`：解闸 + 落一份新档（＝玩家显式的"重新开始"）；
     · 「先不写盘」  → 保持禁写：这一局照常能玩，但**什么都不落盘**；
                        想救回进度就去 设置 → 找回存档（那里有"本机备份"＝读档失败时原样留的那份），
                        想彻底重来就走 设置 → 删档重开（同样是显式选择，它会解闸）。
   ⚠️ 用 `wx.showModal`（原生弹窗）而不是画布里那套：这一刻游戏还没有任何页面/交互，
      而且这件事必须**拦住人**（救援态是"禁写"，玩家要是不知情就等于白玩一局）。
      真机/工具都有这个 API；没有它（老基础库）就退化成一条 toast，绝不因此崩开机。
   位置：排在**忠告弹窗之后、进主画面之前**（见 afterHealthNotice）—— 那一刻屏幕上没有别的弹窗，
   玩家也还没开始玩，正好把"要不要覆盖"这件事问掉（同 flushBootModals 那条"不叠弹窗"的规矩）。 */
function askRescue(next) {
  const ri = (Core.rescueInfo ? Core.rescueInfo() : null);
  const why = String((ri && ri.why) || '');
  const name = ({ json: '存档文件坏了', enc: '存档这一版解不开（密钥或格式不匹配）', shape: '内容不像存档' })[why]
    || (/^future-v/.test(why) ? '这份档来自更新的版本（这一版游戏读不懂它）' : why);
  const msg = '本机存档读不出来（' + name + '）。\n\n'
    + '为了不覆盖它，自动保存已经暂停。\n'
    + '· 点「继续新档」＝ 从现在开始重新玩（旧的那份会在【设置 → 找回存档】里留一手）；\n'
    + '· 点「先不写盘」＝ 这一局不落盘，先去【设置 → 找回存档】把旧进度找回来再玩。';
  const go = function () { try { next(); } catch (e) {} };
  if (wx && typeof wx.showModal === 'function') {
    try {
      wx.showModal({
        title: '存档没读出来', content: msg, confirmText: '继续新档', cancelText: '先不写盘',
        success: function (res) {
          if (res && res.confirm) {
            Core.rescueConfirmNewGame();
            go();
            try { CV.toast('已开始新档（旧的那份在【设置 → 找回存档】里）', 3600); } catch (e) {}
          } else {
            go();
            try { CV.toast('没有写盘：【设置 → 找回存档】可以把旧进度找回来', 4400); } catch (e) {}
          }
        },
        fail: function () { go(); try { CV.toast('存档读不出来，自动保存已暂停（见【设置 → 找回存档】）', 4400); } catch (e) {} },
      });
      return;
    } catch (e) { /* 掉到下面的 toast 兜底 */ }
  }
  go();
  try { CV.toast('存档读不出来，自动保存已暂停：去【设置 → 找回存档】', 5200); } catch (e) {}
}
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
/* V1.0.4 · T（父亲大人 09-27 第 14 条 · 省电模式）：灯阁重绘的节拍计数。
   ⚠️ 只影响"挂机区那一屏多久重画一次"—— 下面 `Core.onlineTick(dt)`（挂机入池 / 游历奇遇）
   与"每 15 秒自动存盘"两条**照旧每秒 / 每 15 秒走**，省电模式一秒都不慢它们。 */
let homePaintTick = 0;
/* 引导要**给开机弹窗让路**（网页版 webTour 同一条规矩：弹窗栈没空就不抢戏）。
   这个标记必须在第一次渲染之前就位 —— 首页一渲染就会跑 coachFor。 */
G.bootModalPending = function () { return pendingBoot.length > 0; };
/* V1.0.4 · R5（父亲大人 09-27 点单：版本更新提示）：
   `wx.getUpdateManager().onUpdateReady` 一到，就**排进这条开机弹窗队列** ——
   不直接弹。理由跟离线收益/七日登录同一条：开机那一刻屏幕上有品牌首屏、忠告、
   离线收益、七日登录，谁抢谁的戏都会让玩家看到两层压在一起。
   队列的规矩是"灯阁 ＋ 没有弹窗/引导"才轮到它（见 flushBootModals）。 */
G.queueUpdateNotice = function () { pendingBoot.push({ kind: 'update' }); };

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
  /* V1.1.20（F1-1）：开机这一句也是**自动**存盘（玩家还没动手），走 auto 那一档。 */
  try { Core.save({ auto: true }); } catch (e) {}
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
  const into = function () {
    CV.reset(hadSave
      ? (!Core.S.player.name ? 'create' : (!Core.S.player.bloodline ? 'bloodline' : 'gate'))
      : 'welcome');
  };
  /* V1.1.20（F1-5）：读档失败/更高版本 → 先把"要不要覆盖"问掉，再进主画面（见 askRescue）。 */
  if (!hadSave && Core.rescueInfo && Core.rescueInfo()) { askRescue(into); return; }
  into();
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
  /* R1.2 · P1：心跳在后台是**停着的**（见下面 startHeartbeat/stopHeartbeat），所以回前台这一补
     就是**唯一**一次对后台那段的结算 —— 门槛从原来的 10 秒放宽到"只要真的过了一段时间"，
     否则几秒的切出（看广告回来那种）会白丢。封顶与效率口径**一个字没变**（还是
     `offlineCapHours()` + `offlineEfficiency()`），不会重复计时：心跳那一路已经停了。 */
  if (gap > 0.5) {
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
  /* 版本更新（R5）：插在这里 —— 排在"给实惠的那几条"之后、与别的一样要等灯阁空出来。
     只用单按钮弹窗（`U.updateReady`），点一下 = applyUpdate 立即重启进新代码。 */
  if (item.kind === 'update') {
    if (G.U && G.U.updateReady) G.U.updateReady();
    else { try { CV.toast('新版本已就绪，重启后生效', 3000); } catch (e) {} }
    return;
  }
  /* 七日登录：**发放放在这里**（不是开机那一刻）—— 网页版也是等弹窗栈空了才发，
     免得奖励弹窗和开局三步/离线收益打架。同一天第二次调用会返回 null，所以不会重复发。 */
  if (item.kind === 'login') { const lr = Core.loginReward && Core.loginReward(); if (lr) G.U.loginReward(lr); }
}
/* 七日登录：老档、新档都要发（网页版 queueLoginReward 同一处修补） */
/* ================= R1.2 · P1（父亲大人 2026-10-01 任务书点名）：全局心跳的**生命周期** =============
   原来这里是一句 `setInterval(..., 1000)` **从开机跑到进程结束** —— 切到后台（看广告、回消息、
   锁屏）它照跑：挂机数字、能力层的小事、15 秒自动存盘全在后台空转，真机上就是实打实的耗电。
   现在收成一对开关：
     · `startHeartbeat()` —— 起表（重复调用无害；起表时把 `lastTick` 对齐到"现在"，
        后台那段时间**只由 `catchUp()` 一次算清**，不许两条路各算一遍）；
     · `stopHeartbeat()` —— 停表；
     · `onHide` → **先停表再落盘**；`onShow` → **先 catchUp 再起表**。
   业务逻辑一个字没动（还是这一秒里那五件事：onlineTick / actTick / 15 秒自动存盘 /
   主页重画 / CAP.tick），只是"什么时候不该跑"被管住了。 */
function heartbeatBody() {
  const now = Date.now();
  const dt = Math.min(10, (now - lastTick) / 1000);   // 单帧最多计 10 秒，防卡顿跳变
  lastTick = now;
  try { Core.onlineTick(dt); } catch (e) {}
  /* V1.0.4 · W：游戏圈活跃任务的"累计在线时长"按这一秒一次的心跳累加
     （两次心跳之间只认 0 < dt ≤ 5 秒、一天封顶 8 小时；口径全在 js/core.js 的 actTick，
     这里只负责叫一声 —— 它自己出错绝不许影响这一帧）。 */
  try { if (Core.actTick) Core.actTick(now); } catch (e) {}
  saveCounter += dt;
  /* V1.1.20（F1-1）：15 秒自动存盘走 **auto** 那一档 —— 它照常落盘（被杀进程不丢进度），
     但"谁新听谁的"判据（savedAt）**只由玩家驱动的存盘刷新**。
     不加这一档的话："开着游戏发呆两小时"会把本机判成"刚玩过"，于是另一台设备上更新的那份拉不下来
     （甚至被这台发呆的顶掉）——那正是父亲大人报的那个症状的第二种形态。 */
  if (saveCounter >= 15) { saveCounter = 0; try { Core.save({ auto: true }); } catch (e) {} }
  /* 主界面（灯阁）的挂机区/游历奇遇要"活着"：默认每秒重画一帧；
     有弹窗、有引导、正在战斗时不动（那几种情况各自有更合适的重画时机）。
     省电模式（第 14 条）下改成**每 3 秒一次** —— 挂机数字还是活的，只是慢一点。
     `% 1` 恒为真，所以没开省电时这一行的行为与以前**一字不差**。 */
  homePaintTick++;
  const homeEvery = (G.CAP && G.CAP.powerOn && G.CAP.powerOn()) ? 3 : 1;
  if (CV.top().name === 'home'
    && !(G.U && (G.U.overlay || (G.U.coachActive && G.U.coachActive())))
    && !CV.toasts.length
    && (homePaintTick % homeEvery) === 0) CV.render();
  flushBootModals();
  /* 能力层的一秒一次的小事（现在只有一件：收藏过的那句差别话，R8）—— 见 js/wx-cap.js */
  try { if (G.CAP && G.CAP.tick) G.CAP.tick(); } catch (e) {}
}
function startHeartbeat() {
  if (heartbeatTimer) return;                 // 已经在跑：不重复起表
  lastTick = Date.now();                      // 与 catchUp 的分工：后台那段由 catchUp 算，这里只从"现在"往后算
  heartbeatTimer = setInterval(heartbeatBody, 1000);
}
function stopHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}
startHeartbeat();
/* 开局走完（进到灯阁）再发一次 —— 上面那 1 秒的心跳也会周期性地来碰这件事 */
setTimeout(flushBootModals, 900);
/* ================= V1.0.4 · 官方能力接入（R2~R8 · 父亲大人 09-27 点单）=================
   位置是刻意的：**读档/建档 ＋ 弹窗队列 ＋ 心跳都就位之后**才注册 ——
   与音频那条 `AUDInstallLifecycle` 同一条时序纪律（真机冷启动卡死那次，就是事件注册排在了建档前面）。
   里面每一条能力自带"没有这个 API 就静默跳过"，这一行外面再包一层 try：
   **新接的能力绝不许把开机弄崩**。 */
try { if (G.CAP && G.CAP.install) G.CAP.install(); } catch (e) {}
