/* 官方能力接入层（V1.0.4 · R2 / R3 / R4 / R5 / R8 · 父亲大人 09-27 点单）
   ------------------------------------------------------------------------------------------
   这一层只做一件事：把**微信官方那几条"锦上添花"的能力**接上，并且**一条都不许影响开机**。
   所以每条能力都长成同一个样子：
     `typeof wx.xxx === 'function'` 先试 → 有就注册 → **没有就整段跳过、一声不响**；
     注册与回调全包在 try/catch 里（回调里出错的代价是"这个功能不生效"，不是"玩家白屏"）。
   （"新接的能力把启动弄崩"正是提审驳回过的同类坑，见 game.js 开头那段 P0 注释。）

   分工：
     · 日志出口 / 事件上报（R1 · R9）      → `js/wx-adapter.js` 的 `G.LOG`（**唯一出口**）
     · 弱网的判定与文案（R3）              → `js/wx-adapter.js` 的 `G.ADWEAK`（各页面只读它）
     · 上报 `wx.onError / onUnhandledRejection` 的收口也在 `install()` 里（R1 点单的一条）
     · 音频打断（R6）                      → `js/audio.js` 的 `installLifecycle`
     · PC 鼠标 / 滚轮（R7）                → `js/cv.js` 的 `CV.bindTouch`（与触摸同一套手势）
     · 意见反馈 / 联系客服（R10）          → `js/sc-gameclub.js` 的原生按钮层 ＋ 设置页那一排
     · 变暗不熄屏（T1 · 父亲大人 09-27 第 1 条）  → 本文件（亮度接管 / 5 分钟调最暗 / 触摸恢复；
       常亮那条 `setKeepScreenOn(true)` 照旧在 game.js，**全程不出现 `setKeepScreenOn(false)`**）
     · 省电模式（T14 · 第 14 条）                 → 本文件的 fpsWant（全程 30）
       ＋ `js/audio.js` 的 bgmOn（停 BGM、保音效）＋ `game.js` 的灯阁重绘节拍（1 秒 → 3 秒）
   注册时机：由 `game.js` 在**读档/建档 ＋ 弹窗队列都就位之后**调 `G.CAP.install()` ——
   与音频那条 `AUDInstallLifecycle` 同一条时序纪律（真机冷启动卡死那次就是事件注册排在了建档前面）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof globalThis !== 'undefined') ? globalThis : this;
  const WX = (typeof wx !== 'undefined') ? wx : null;
  const LOG = G.LOG || { info() {}, warn() {}, error() {}, event() { return false; } };
  const CV = G.CV || null;

  const CAP = {
    installed: false,
    /* 每条能力一份可数的状态 —— 尺子直接读这里，不在各处埋计数 */
    fps: { cur: 0, calls: 0, has: !!(WX && typeof WX.setPreferredFramesPerSecond === 'function') },
    mem: { warns: 0, level: 0, releases: 0, gcs: 0, lastGc: 0, gcSkip: 0 },
    net: { weak: false, type: '', changes: 0 },
    update: { ready: false, failed: 0, applied: 0 },
    fav: { got: 0, greeted: false },
  };
  G.CAP = CAP;

  /* ================= R4 · 帧率分级省电（父亲大人 09-27：「战斗中 60、挂机看数字时降到 30」）===
     `wx.setPreferredFramesPerSecond(1~60)` —— 画布自绘，降帧就是实打实省电。
     两个讲究（点单里写死的）：
       ① **只在场景变化时切**，不许在 render 里每帧调 —— 所以只在"换页/整屏覆盖层"那一刻同步；
       ② 没有这个 API 就整段跳过（`fps.has` 为 false 时一次都不调）。
     分档：灯阁（挂机看数字，画面几乎不动）→ 30；**战斗 / 结算 / 抽卡 / 其余一切 → 60**。
     ⚠️ 与 09-27 刚做的"游戏进行时不熄屏"是一对（那条在 `game.js` / `wx-adapter` 里，别动）。 */
  const FPS_HI = 60, FPS_LOW = 30;
  const LOW_PAGES = { home: true };
  function fpsWant() {
    /* V1.0.4 · T（父亲大人 09-27 第 14 条 · 省电模式）：开了省电就是**全程 30** ——
       连结算/抽卡那层整屏一幕（pageOverlay）与战斗一起降到 30，排在下面那两档之前：
       省电是玩家自己按下去的，优先级最高；关掉就立刻回到原来的分档（30/60）。 */
    if (powerOn()) return FPS_LOW;
    if (CV && CV.pageOverlay) return FPS_HI;              // 结算/抽卡那种整屏一幕：一定 60
    const n = (CV && CV.top) ? CV.top().name : '';
    return LOW_PAGES[n] ? FPS_LOW : FPS_HI;
  }
  function fpsSync() {
    const want = fpsWant();
    if (want === CAP.fps.cur) return false;               // ← "只在变化时调"就靠这一行
    CAP.fps.cur = want;
    if (!CAP.fps.has) return false;
    try { WX.setPreferredFramesPerSecond(want); CAP.fps.calls++; } catch (e) { return false; }
    return true;
  }
  CAP.fpsWant = fpsWant;
  CAP.fpsSync = fpsSync;

  /* 换页 = 场景变化。**五处**入口都包一层（`CV.jump` 是"直接跳页"那条路，别漏）。
     F6 #13：原来漏了 `CV.switchTab` —— 底栏四格之间的切换不走 reset/push/pop/jump，
     它自己有还原分支（V1.1.17 起）⇒ 换 tab 时帧率档位不重算。
     以前这一条被"tabMemo 是死代码"掩盖着（还原分支永远走不到），F6 #2 修好之后就会露出来：
     灯阁（30）切到战斗/其它页（60）时 fpsSync 不跟，省电那一档也跟着失准。 */
  function wrapPages() {
    if (!CV || CV.__capWrapped) return;
    CV.__capWrapped = true;
    ['reset', 'push', 'pop', 'jump', 'switchTab'].forEach(function (m) {
      const orig = CV[m];
      if (typeof orig !== 'function') return;
      CV[m] = function () {
        const r = orig.apply(this, arguments);
        try { fpsSync(); } catch (e) {}
        /* 切场景顺手做一次 GC（**节流**：60 秒最多一次，见 R2 的口径"不许每帧调"） */
        try { idleGC('scene'); } catch (e2) {}
        return r;
      };
    });
  }

  /* ================= R2 · 内存告警自救（父亲大人 09-27：「收到告警 → 清可再生缓存」）=======
     `wx.onMemoryWarning`（基础库 **2.0.2**；Android 还带 level 5/10/15）。
     我们手上**能重算**的缓存盘了一遍，一共两处，都在这里清：
       · `CV.dropTextCache()` —— 文本测量缓存（渲染里最贵的那张表，纯派生）；
       · `AUD.dropCaches()`  —— 音效合成 PCM 缓存（清了下次现合成）。
     两张**没清**的，理由是"清掉不划算 / 有副作用"，照实写在这里：
       · 首屏主视觉与品牌图（`sc-splash.js` / `uiw.js` 各一张）—— 一共两张常驻解码图，
         清掉换来的内存很有限，但重解码那一瞬有"图还没好、画面空一块"的风险；
       · 存档 / 内存加固（`mem-guard.js`）—— **那是玩家数据，一个字都不许碰**（点单里写死）。
     `wx.triggerGC()` 只在**告警**与**切场景（节流 60 秒）**时调，绝不在 render 里调。 */
  function releaseCaches(why) {
    let n = 0;
    try { if (CV && CV.dropTextCache) n += CV.dropTextCache(); } catch (e) {}
    try { if (G.AUD && G.AUD.dropCaches) n += G.AUD.dropCaches(); } catch (e2) {}
    CAP.mem.releases++;
    LOG.info('mem', 'release', { count: n, why: why });
    return n;
  }
  function triggerGC(why) {
    if (!WX || typeof WX.triggerGC !== 'function') { CAP.mem.gcSkip++; return false; }
    CAP.mem.gcs++;
    CAP.mem.lastGc = Date.now();
    try { WX.triggerGC(); } catch (e) { return false; }
    LOG.info('mem', 'gc', { why: why });
    return true;
  }
  /* 切场景那次 GC 要节流：换页本来就可能连着来（reset → push），每页调一次是浪费 */
  const GC_SCENE_GAP = 60000;
  function idleGC(why) {
    if (!WX || typeof WX.triggerGC !== 'function') return false;
    if (Date.now() - (CAP.mem.lastGc || 0) < GC_SCENE_GAP) { CAP.mem.gcSkip++; return false; }
    return triggerGC(why);
  }
  function onMemoryWarning(res) {
    const lv = Number((res && res.level) || 0) || 0;
    CAP.mem.warns++;
    CAP.mem.level = lv;
    LOG.warn('mem', 'warning', { level: lv });
    releaseCaches('warning');
    triggerGC('warning');
  }
  CAP.releaseCaches = releaseCaches;
  CAP.triggerGC = triggerGC;

  /* ================= R3 · 弱网感知（父亲大人 09-27：「弱网时那颗按钮写"网络不太好"」）=====
     `wx.onNetworkWeakChange` 回 `{weakNet, networkType}`。
     这里只做一件事：把状态写进 `G.ADWEAK`（判定与文案的**唯一出口**在 wx-adapter 里），
     然后**重画一帧** —— 网络恢复时按钮要当着玩家的面变回"看广告"，不用他重进页面。
     ⚠️ 弱网**不吃补偿、也不给双倍**那条口径在 `wx-adapter` 的 `NO_COMP_SLOTS` 里，一个字没动。 */
  function onNetWeak(res) {
    const weak = !!(res && res.weakNet);
    const type = String((res && res.networkType) || '');
    if (weak === CAP.net.weak && type === CAP.net.type) return;
    CAP.net.weak = weak;
    CAP.net.type = type;
    CAP.net.changes++;
    if (G.ADWEAK) G.ADWEAK.weak = weak;
    LOG.info('net', weak ? 'weak' : 'ok', { name: type });
    try { if (CV && CV.render) CV.render(); } catch (e) {}
  }
  CAP.netWeak = function (weak, type) { onNetWeak({ weakNet: !!weak, networkType: type || '' }); };

  /* ================= R5 · 版本更新提示（父亲大人 09-27：「让玩家真的走到新代码」）=========
     `wx.getUpdateManager`（基础库 **1.9.90**）：
       · `onUpdateReady` → 提示"新版本已就绪，重启后生效"，点确认就 `applyUpdate()`；
       · `onUpdateFailed` → **只记日志，不打扰**（点单里的原话）。
     提示**不许抢开机那几层弹窗**（离线收益 / 七日登录 / 忠告），所以不在这里直接弹 ——
     交给 `game.js` 的开机弹窗队列（`G.queueUpdateNotice`），和别的开机弹窗排同一个队。
     队列不在（尺子的假环境）→ 退化成一句 toast，仍然把 `applyUpdate` 的入口留着。 */
  let _um = null;
  function onUpdateReady() {
    CAP.update.ready = true;
    LOG.info('update', 'ready');
    try {
      if (G.queueUpdateNotice) { G.queueUpdateNotice(); return; }
      if (G.CV && G.CV.toast) G.CV.toast('新版本已就绪，重启一下就能用上', 3200);
    } catch (e) {}
  }
  CAP.applyUpdate = function () {
    CAP.update.applied++;
    LOG.info('update', 'apply');
    try { if (_um && _um.applyUpdate) _um.applyUpdate(); } catch (e) { return false; }
    return true;
  };

  /* ================= R8 · 收藏事件（父亲大人 09-27：「记一位，之后进游戏说一句」）=========
     `wx.onAddToFavorites`（基础库 **2.10.3**）—— 玩家点右上角"收藏"时给一次事件。
     存档里只加**一个时间戳** `S.favAt`（老档由 `fillDefaults` 自动补 0，不用迁移代码）。
     之后进游戏给**一句**差别化的话（点单写死"一句就够，别做弹窗"）→ 走 toast，排队见 `tick()`。
     ⚠️ 一个字段、不进引导、不发奖励：这一条只是"记得他收藏过"，不是新的奖励环。 */
  function onAddToFavorites() {
    CAP.fav.got++;
    let first = false;
    try {
      const S = G.Core && G.Core.S;
      if (S) { first = !S.favAt; S.favAt = Date.now(); if (G.Core.save) G.Core.save(); }
    } catch (e) {}
    LOG.info('fav', 'added', { ok: first });
    try {
      if (G.CV && G.CV.toast) G.CV.toast(first ? '已收藏 —— 多谢执灯者，灯阁给你留着位子' : '已收藏，多谢', 2600);
    } catch (e2) {}
    CAP.fav.greeted = true;                 // 当场已经谢过，进游戏不再重复说一遍
  }

  /* ================= R1 · 全局错误上报（父亲大人 09-27：「onError / onUnhandledRejection」）==
     "真机白屏"这类问题的一条命门：**错误文本得能出到后台**，不然只能靠猜。
     只上报**错误文本的前 120 字**（`why` 字段），不带存档、不带账号。
     这两个回调在真机上**不会**在注册那一刻同步触发，但仍然跟别的注册一起放在 install()
     里（读档之后）—— 时序纪律统一，别在下一轮又长出一个"注册早于建档"的洞。 */
  function onError(text) {
    LOG.error('app', 'error', { why: String((text && text.message) || text || '').slice(0, 120) });
  }
  function onUnhandledRejection(res) {
    const r = (res && res.reason) || res || '';
    LOG.error('app', 'rejection', { why: String((r && r.message) || r || '').slice(0, 120) });
  }
  CAP.onError = onError;
  CAP.onUnhandledRejection = onUnhandledRejection;

  /* ================= T14 · 省电模式（父亲大人 09-27 第 14 条）=================
     他的原话：「**可以**（省电模式），这个就像我 1 说的，**你这里把方案完善了**」——
     所以这是**一个开关、三条一起生效**（设置页「通用」卡里的第三行，默认关）：
       · 背景音乐 **停掉**（真 stop，音效一条都不动 —— 打击感不能丢） → `js/audio.js` 的 bgmOn()
       · 帧率 **全程 30**（连战斗/结算也是 30，不走 60）             → 本文件 fpsWant() 的第一条
       · 灯阁重绘 **每 3 秒一次**（挂机数字还是活的，只是慢一点）     → `game.js` 的 1 秒心跳读 powerOn()
     关掉＝三条**立刻**恢复、不用重进游戏：翻开关那一刻 `js/sc-last.js` 会调 `AUD.apply()`（音乐回来）
     ＋ `CAP.fpsSync()`（帧率回档），灯阁重绘下一拍就回 1 秒。
     ⚠️ 与大 R4 那条「战斗 60 / 挂机 30」不冲突：**没开省电时那条一个字没变**（它只是被本开关整体压到 30）。 */
  function powerOn() {
    try {
      const S = G.Core && G.Core.S;
      return !!(S && S.settings && S.settings.savePower === true);   // 只有确确实实的 true 才算开
    } catch (e) { return false; }
  }
  CAP.powerOn = powerOn;

  /* ================= T1 · 变暗不熄屏（父亲大人 09-27 第 1 条）=================
     他的原话：「**不要**（自动放开常亮），**可以屏幕亮度变暗，但不能熄屏**」，
     深夜又补了一句口径：「**1，5 分钟，调最暗**」。
     用官方 `wx.setScreenBrightness / wx.getScreenBrightness`（**仅当前小游戏生效**）：
       ① 开机先 `getScreenBrightness` 记一次**玩家自己的亮度** —— **只在拿到值时才接管**，
          拿不到（老基础库 / 开发者工具）→ 整段跳过、一声不响（开机照常）；
       ② 没有任何 `touchstart` 满 5 分钟 → 调到**最暗**（`BRIGHT_MIN = 0`，官方取值 0~1，0 ＝ 最暗）；
       ③ **任何触摸** → **立刻**恢复"玩家自己的亮度"（不等下一帧、不等下一次 render）；
       ④ 调暗状态里切回前台（onShow）：**不恢复满亮** —— 还在无操作窗口里就把最暗再按一次
          （系统切后台会把亮度还回去，这一条就是防"一回来就满亮"）；
       ⑤ **战斗页同一条规则**（他玩着的时候一直在碰屏幕，所以战斗里基本不会触发；没有单独的后门）。
     ⚠️ **红线（父亲大人明确否掉的）**：这里**永远不放开常亮** ——
        本文件（以及整个工程）**一处 `setKeepScreenOn(false)` 都不许出现**；
        "最暗 ≠ 熄屏"，常亮那条 `setKeepScreenOn(true)` 照旧由 game.js 开机 / 每次回前台补（一个字没动）。
     触摸收口为什么**不注册第二个 `wx.onTouchStart`**：玩家每一次触摸本来就要过 `js/cv.js` onDown 里的
        `AUD.unlock()`（PC 鼠标那一路也复用 onDown）—— 从那一扇门被叫一下最省、也最不容易漏；
        自己再注册一个监听会与既有假环境尺子（它们给 onTouchStart 只留一个槽）打架。 */
  const BRIGHT_MIN = 0;                  // ← 要"最暗还不够暗"就改这一个数（0~1；0 ＝ 最暗，但**不是熄屏**）
  const IDLE_DIM_MS = 5 * 60 * 1000;     // 父亲大人 09-27 深夜原话：「1，5分钟，调最暗」—— 照这个，别自己改
  /* F6 #14：`sets` 记**尝试次数**、`ok` 记**平台回调确认成功**的次数、`failed` 记失败次数 ——
     原来只有 sets/last，而 `setScreenBrightness` 的**异步 fail（工具 / 老机型不支持）被吞掉**，
     诊断口照样显示"已调到最暗"（"不许静默假成功"这条正好落在这儿）。 */
  CAP.bright = { has: false, user: null, dimmed: false, gets: 0, sets: 0, ok: 0, failed: 0, last: null, applied: null, why: '', lastTouch: Date.now() };

  /* 开机那一次：**拿到玩家的亮度才接管** */
  function brightRead() {
    const B = CAP.bright;
    if (!WX || typeof WX.getScreenBrightness !== 'function' || typeof WX.setScreenBrightness !== 'function') {
      B.why = 'no_api';                    // 老基础库 / 开发者工具：整段跳过，绝不因此影响开机
      return false;
    }
    try {
      WX.getScreenBrightness({
        success: function (res) {
          const v = Number(res && res.value);
          if (!isFinite(v)) { B.why = 'bad_value'; return; }
          B.user = Math.max(0, Math.min(1, v));
          B.has = true;
          B.gets++;
          B.why = '';
          LOG.info('screen', 'read', { v: Math.round(B.user * 100) });
        },
        fail: function (e) { B.why = 'fail:' + String((e && e.errMsg) || ''); },
      });
    } catch (e) { B.why = 'throw'; return false; }
    return true;
  }
  /* 每一次真要调亮度都从这里走（尺子只需看 CAP.bright.sets / .last） */
  function brightSet(v, why) {
    const B = CAP.bright;
    if (!B.has) return false;
    B.sets++;                              // 尝试次数（同步记账，尺子读它）
    B.last = v;                            // 最后**请求**的值（口径与改前一致，别处读它不炸）
    try {
      WX.setScreenBrightness({
        value: v,
        /* F6 #14：成功才算成功（`ok` 计数 + `applied` 才是真的写进去的那个值） */
        success: function () { B.ok++; B.applied = v; B.why = ''; },
        /* 失败**不许假成功**：写进 `why`、记进 `failed`，`applied` 保持上一次真正生效的值 ——
           诊断口（`G.CAP.bright`）从此能一眼分开"我调过（sets）"和"它真生效了（ok/applied）"。 */
        fail: function (e) {
          B.failed++;
          B.why = why + ':fail:' + String((e && e.errMsg) || '');
          LOG.warn('screen', 'set_fail', { why: why, v: Math.round(v * 100) });
        },
      });
    } catch (e) {
      B.failed++;
      B.why = why + ':throw';
      LOG.warn('screen', 'set_throw', { why: why });
      return false;
    }
    LOG.info('screen', why, { v: Math.round(v * 100) });
    return true;
  }
  function brightDim() {
    const B = CAP.bright;
    if (!B.has || B.dimmed) return false;
    if (!brightSet(BRIGHT_MIN, 'dim')) return false;
    B.dimmed = true;
    return true;
  }
  function brightRestore() {
    const B = CAP.bright;
    if (!B.has || !B.dimmed) return false;
    if (!brightSet(B.user, 'restore')) return false;
    B.dimmed = false;
    return true;
  }
  /* 无操作窗口到没到（tick 每秒问一次；onShow 也问一次，但**只在还超窗时才按最暗**） */
  function brightIdle(force) {
    const B = CAP.bright;
    if (!B.has) return false;
    if (Date.now() - B.lastTouch < IDLE_DIM_MS) return false;
    if (force) B.dimmed = false;           // 切回前台：系统可能已经把亮度还回去了 → 重新按一次最暗
    return brightDim();
  }
  /* 触摸那一刻（cv.js 的 onDown → AUD.unlock → 这里）：重置窗口 ＋ 立刻恢复 */
  CAP.brightPing = function () {
    const B = CAP.bright;
    B.lastTouch = Date.now();
    try { brightRestore(); } catch (e) {}
    return true;
  };

  /* ================= 安装（game.js 在**读档/建档之后**调一次） ================= */
  CAP.install = function () {
    if (CAP.installed) return false;
    CAP.installed = true;
    wrapPages();
    try { fpsSync(); } catch (e) {}
    /* T1（第 1 条）：开机记一次玩家自己的亮度 —— 拿不到就整段跳过（老基础库 / 工具里不许崩） */
    try { brightRead(); } catch (e2) {}
    /* T1 ④：回前台**不恢复满亮** —— 还在无操作窗口里就把最暗再按一次（切后台会把亮度还回去）。
       F6 #3：顺手把渲染闸复位并补画一帧 —— 后台期间那一次 rAF 没派发也不会"画面冻住、点击还有反应"。 */
    try {
      if (WX && typeof WX.onShow === 'function') WX.onShow(function () {
        try { brightIdle(true); } catch (e3) {}
        try { if (CV && CV.resetRenderGate) CV.resetRenderGate(); } catch (e4) {}
      });
    } catch (e4) {}
    /* 每一条都独立 try：一条注册不上，不许影响后面几条，更不许影响开机 */
    const reg = function (name, fn) {
      try { if (WX && typeof WX[name] === 'function') { fn(WX[name].bind(WX)); return true; } } catch (e) {}
      return false;
    };
    CAP.reg = {
      mem: reg('onMemoryWarning', (f) => f(onMemoryWarning)),
      net: reg('onNetworkWeakChange', (f) => f(onNetWeak)),
      err: reg('onError', (f) => f(onError)),
      rej: reg('onUnhandledRejection', (f) => f(onUnhandledRejection)),
      fav: reg('onAddToFavorites', (f) => f(onAddToFavorites)),
    };
    /* 更新管理器不是 onXxx，单独一条 */
    try {
      if (WX && typeof WX.getUpdateManager === 'function') {
        _um = WX.getUpdateManager();
        CAP.reg.upd = !!_um;
        if (_um && _um.onUpdateReady) _um.onUpdateReady(onUpdateReady);
        if (_um && _um.onUpdateFailed) _um.onUpdateFailed(function () { CAP.update.failed++; LOG.warn('update', 'failed'); });
      }
    } catch (e) { CAP.reg.upd = false; }
    /* 开机那一句：这批能力到底接上了几条（真机上一眼看得见 —— 没接上的就是"老基础库"） */
    LOG.info('boot', 'cap', {
      api: Object.keys(CAP.reg).filter((k) => CAP.reg[k]).join(','),
      n: Object.keys(CAP.reg).filter((k) => CAP.reg[k]).length,
    });
    /* 收藏过 → 进游戏说一句（一小会儿之后再试探，别挤在开机那几帧里） */
    try { if (G.Core && G.Core.S && G.Core.S.favAt) CAP.fav.pending = true; } catch (e2) {}
    return true;
  };

  /* 每秒和开机各来一次：只做"该说话的时候说一句"（收藏过的那句差别话）。
     判据与开机弹窗同一个：**灯阁 + 没弹窗**才说，否则继续等。 */
  CAP.tick = function () {
    /* T1（第 1 条）：无操作满 5 分钟 → 调到最暗。每秒问一次（game.js 的 1 秒心跳里调本函数）——
       没有这个 API / 还没拿到玩家亮度时，brightIdle 自己返回 false，一声不响。 */
    try { brightIdle(false); } catch (e0) {}
    if (!CAP.fav.pending || CAP.fav.greeted) return false;
    try {
      if (!CV || !CV.top || CV.top().name !== 'home') return false;
      if (G.U && (G.U.overlay || (G.U.coachActive && G.U.coachActive()))) return false;
      CAP.fav.pending = false;
      CAP.fav.greeted = true;
      if (G.CV && G.CV.toast) G.CV.toast('欢迎回来，收藏过的执灯者', 2600);
      return true;
    } catch (e) { return false; }
  };
})();
