/* ================= 存档云同步（微信云开发 · 集合 saves / save_codes）=================
   父亲大人的口径（2026-09-27 · 0927-L 第一版 → **0927-L2 改口径**）：
     「存档存在本地那手机玩和电脑玩数据不互通啊，能存在微信上吗」
     →「**静默同步就行，不要影响玩家体验**」＋「导出不再搬 17KB 文字，给个存档码」（24 小时 · 用一次即失效）。

   ⚠️ **L2 改掉了 L1 的"冲突只提示、不静默覆盖"** —— 现在是：
     · 进游戏**只读本地**（秒进、断网照玩）；联网只发生在"第一次用户交互之后"与"切后台"；
     · **比时间戳、谁新听谁的**：云端新 → 直接换上（一个弹窗都没有）；本地新 → 用本地并推上云；
     · **不弹窗，但绝不丢档**：覆盖之前把被覆盖的那一份留档 ——
       本地被云覆盖 → 旧本地原文进 `wxlh_save_v5_bak`（设置页那句「恢复上一份存档」就是取回口）；
       云端被本地覆盖 → 旧云端留在同一条记录的 `prev*` 栏里（设置页「取回云端旧备份」）。
       这是"不打扰玩家"与"不丢档"两全的唯一办法。
     · 联网失败**静默重试**（退避 30s / 2min / 5min），本地照常玩，**没有任何阻塞或报错弹窗**。

   分工：本地存档层（`js/core.js` 的 packSave / unpackSave / SAVE_KEY 五个口子）**一行没动**。
   云上那份只是"另一份副本"：上传走 `Core.exportSave()`（同一套密文），
   下载/取回走 `Core.importSave()`（同一条"先留 `_pre_switch`、失败整份回滚"的切档路）。

   推档跟上进度：**脏标记**（存档真变了才推）＋ **切后台必推** ＋ **打关/结算后推**
   （同一分钟内的多次合并成一次）＋ 每天记账上限 **20 次**（防异常刷；正常玩家一天 5 次以内）。

   钥匙是**微信账号**。⚠️ **R1.2 · P0 起，存档的读 / 写 / 占位全部走云函数 `cloudsave`**：
   原来是客户端直接读集合（`where({}).get()` 靠数据库权限把自己那条筛出来），
   权限一配宽整张表就落到客户端上；现在服务端用 `getWXContext().OPENID` 定位"这个账号唯一那条"，
   **客户端一行云数据库代码都没有**，也永远拿不到别人的记录。
   账号指纹（导出档里那个 `fp`）是 `_openid` 的哈希（服务端算好下发，口径没变），
   **openid 本体不落盘、不出档、也不下发**。
   存档码那条路（`savecode` 云函数）走另一招：码本身就是钥匙（8 位、24 小时、用一次即失效）。
   环境 ID 全工程**只此一处**。 */
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  const WX = (typeof wx !== 'undefined') ? wx : null;
  /* ================= V1.0.4 · R1（父亲大人 09-27 点单：「云同步（推送成功或失败、取回、冲突取值）」）===
     云同步是**唯一一条会自己动玩家存档的联网链路**，偏偏它全程静默 ——
     出问题的时候"玩家没看到任何提示"就等于"我们也没有任何线索"。
     所以这一条链上只补日志（**口径一个字不改**）：推送成功/失败、取回（带上字节数与时间戳）、
     以及"谁新听谁的"那一刻的取值。只报字节数/时间戳这类短字段，**两份存档内容都不上报**。 */
  /* ⚠️ F2 · 0930L：**每次现取** `G.LOG`，不在模块加载时捕获一份。
     理由：`G.LOG` 是 `js/wx-adapter.js` 建的，而那个模块在某些链路里会被重新加载
     （换一份新的 `G.LOG`）—— 旧写法会一直往**已经没人读的那个实例**里写，
     真机排查时"日志里什么都没有"，正是这一类。 */
  function clog(action, data) {
    try { const L = G.LOG; if (L) L.info('cloud', action, data || {}); } catch (e) {}
  }

  /* ---------- 环境与集合（**环境 ID 只有这一处**） ---------- */
  const ENV_ID = 'cloudbase-d0gk9s3sv8a797189';
  const COLL = 'saves';
  const CODE_FN = 'savecode';
  /* R1.2 · P0：存档的读 / 写 / 占位全走这一支云函数（客户端**一行云数据库代码都没有**）。 */
  const SAVE_FN = 'cloudsave';
  const PREF_KEY = 'wxlh_cloud_v1';          // 云同步自己的偏好/账本（**不进玩家存档**，不碰 packSave 的口径）
  const SAVE_KEY = 'wxlh_save_v5';           // 与 core 同一把钥匙（**只读它、只往 _bak 里写留档**）
  const SAVE_BAK = SAVE_KEY + '_bak';
  const PUSH_CAP_PER_DAY = 20;               // 每天推送记账上限（防异常刷）
  const MERGE_MS = 60 * 1000;                // 打关/结算后的推送：同一分钟内合并成一次
  const RETRY_WAIT = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];
  /* 双端单活：另一台设备的租约**多久不算数**。超过这个时长没动静 = 那台已经走了，
     本机照常上线（不然一次网络抖动没占上位，这台就永远只读了）。 */
  const LEASE_TTL_MS = 15 * 60 * 1000;

  const DEFAULTS = function () {
    return {
      on: true,              // 云同步开关：**默认开**（老档没有这一段 = 走这里的默认值）
      accountId: '',         // 账号指纹（openid 的哈希）——第一次读到云端那条之后才有
      day: '', pushes: 0,    // 今天的推送次数（跨天清零）
      lastPushHash: '',      // 脏标记：上次推上去的那份存档的哈希
      lastPushAt: 0,
      lastSyncAt: 0,         // 界面上那句"上次同步"
      lastAutoPullAt: 0,
      prevAt: 0, prevTs: 0, prevBytes: 0,   // 云端那条里"更旧的备份"（上次读到的）
    };
  };

  let cache = null;
  /* ================= 康康 2026-10-01 · **双端单活**：本机设备标识 =================
     父亲大人：「你可以设置双端只有一端能在线，避免双端打架，就是手机登陆的时候，
               电脑端如果也登陆着，则电脑端下线，就**以晚登陆的为主**」。
     ⚠️ `deviceId()` **必须是模块作用域的** —— 它一开始被我写进 `prefs()` 里，而 `actBlock()`
        是在外面调它的 ⇒ 每次都是一次 `ReferenceError`，被 `actBlock()` 自己的 try/catch
        **静默吃掉** ⇒ "功能在、租约一个字都写不上去"（最阴的那种失效）。现在提到模块级。
     标识**留在本机**（localStorage 单独一个键）：存档要能跨端搬，设备身份不能跟着存档走。 */
  const DEV_KEY = 'wxlh_dev_v1';
  let devId = '';
  function deviceId() {
    if (devId) return devId;
    try {
      devId = String(localStorage.getItem(DEV_KEY) || '');
      if (!devId) { devId = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEV_KEY, devId); }
    } catch (e) { devId = 'd0'; }
    return devId;
  }
  /* 本机最近一次"占位"（写进云上 `act.sess.ts` 的那个数）＋"被另一台设备顶下线"的旗标。
     被顶下线期间这条链**只读不写**：云端更新照样换下来（双端内容保持一致），但一个字都不写回去。 */
  /* `noticeAt` 与 `NOTICE_HOLD_MS`：被顶下线那条提示**不是只讲一次就再也回不来** ——
     玩家点了「知道了」之后如果还在这台玩（一直在推不上去），隔一段时间再提醒一次；
     不然他就被**永久困在只读态**、连"重新登录"的入口都找不到了。 */
  /* `leaseToken` ＝ 服务端发给本机的"在场凭证"（每次登陆换一个；只活这一次会话，不落盘）。
     它才是服务端认的那把钥匙：`push` 那边 `where({_id, 'lease.token': 本机token})`。 */
  let leaseTs = 0, superseded = false, noticeShown = false, noticeAt = 0, leaseToken = '';
  /* `supersededTs` ＝ 判我们"被顶下线"那一刻**云上那条的时间戳**。
     为什么要留它：判据必须是"**另一台更新** ⇒ 本机只读"（父亲大人 09-27 的口径），
     不是"另一台开过一次 ⇒ 本机永远只读"。留了这个数，本机之后**真玩出了更新的进度**时
     才能自己重新站起来（见 push 里"抢位重推"那一段），不用玩家去点「重新登录」。 */
  let supersededTs = 0;
  const NOTICE_HOLD_MS = 3 * 60 * 1000;

  /** 偏好/账本：读出来一律**补齐默认值**（老版本写的对象里缺字段、或整段不存在，都按默认值走）。 */
  function prefs() {
    if (cache) return cache;
    let o = null;
    try { o = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch (e) { o = null; }
    const d = DEFAULTS(), out = {};
    Object.keys(d).forEach(function (k) { out[k] = (o && o[k] !== undefined) ? o[k] : d[k]; });
    /* ================= V1.1.x（0927-P · 父亲大人 2026-09-27 原话）=================
       「**默认开启云同步，关不了**」——原来这里是"只认明确写了 false ＝ 关"，
       开关那一行还在设置页上；现在设置页那张卡整张撤了，且开关**钉成常开**：
       不管磁盘上写的什么（老档里写过 false 的也一样），读出来一律是 true。
       ⇒ 没有任何入口能把它关掉；`boot()` 里"关着就不挂口子"那条分支自然永不成立，
          静默同步那套口径（谁新听谁的、不弹窗、覆盖前两头留档、每天 20 次上限）一个字没改。 */
    out.on = true;
    out.accountId = String(out.accountId || '');
    out.day = String(out.day || '');
    out.pushes = Number(out.pushes) || 0;
    out.lastPushHash = String(out.lastPushHash || '');
    ['lastPushAt', 'lastSyncAt', 'lastAutoPullAt', 'prevAt', 'prevTs', 'prevBytes'].forEach(function (k) { out[k] = Number(out[k]) || 0; });
    cache = out;
    return cache;
  }
  function savePrefs() {
    try {
      const w = localStorage.setItem(PREF_KEY, JSON.stringify(cache));
      /* V1.1.20（F1-3）：写盘失败不许静默 —— 这一份是"今天推了几次 / 上次推的是哪一版"的账本，
         写不下就会重复推（次数上限失效）。至少留一条日志，别让它无声无息。 */
      if (w === false) clog('prefs_write_fail', { key: PREF_KEY });
    } catch (e) {
      clog('prefs_write_fail', { key: PREF_KEY, err: String((e && e.message) || '') });
    }
    return cache;
  }
  /** 跨天就把"今天的推送次数"清零（和广告配额同一套口径）。 */
  function rollDay(P) {
    P = P || prefs();
    const d = today();
    if (P.day !== d) { P.day = d; P.pushes = 0; }
    return P;
  }
  function today() {
    const d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /** 32 位 FNV-1a：同一份内容永远同一串；只用来**比较**和**做账号指纹**，不当密码学用。 */
  function hash(s) {
    s = String(s == null ? '' : s);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function fpOf(openid) { return openid ? ('A' + hash(openid)) : ''; }
  /** 本地档"最后一次**玩家真的在玩**"的时刻 —— 与云端那条的 ts 同一口径（都是 `savedAt`）。
      ⚠️ V1.1.20（F1-1 · 阻塞级）：**不许再用 `idle.lastTs` 当冲突判据**。
     它会被开机流程（离线结算、15 秒心跳、开机那几条提示）盖上"现在"，于是"谁新听谁的"
     实际比的是"谁刚开过游戏" ⇒ `cloudTs > localTs()` 恒假，云上更新的那份永远拉不下来
     （父亲大人报的"手机推到第三关、电脑上还是第二关"）。`savedAt` 只由玩家驱动的存盘刷新，
     开机结算那一段有专门的闸（core.js 的 settleWriting）拦着。
     老档还没补上这个字段时（正常路径上 `migrate()` 已经兜底补过）退到 `idle.lastTs`，再退到 0。 */
  function localTs() {
    const s = G.Core && G.Core.S;
    if (!s) return 0;
    const a = Number(s.savedAt);
    if (a > 0) return a;
    const t = s.idle && s.idle.lastTs;
    return Number(t) || 0;
  }
  /** 现在这份存档的密文（**内存里的**那份，不是磁盘上 15 秒前那份）。 */
  function currentRaw() {
    try { return String((G.Core && G.Core.exportSave && G.Core.exportSave()) || ''); } catch (e) { return ''; }
  }
  function kb(n) { return (Number(n) / 1024).toFixed(1) + ' KB'; }
  function unref(t) { try { if (t && typeof t.unref === 'function') t.unref(); } catch (e) {} return t; }

  /** 覆盖之前先把"要被盖掉的那一份"留在本机：写的是 core 的备份键、
      格式与 core 的 `backupSave()` 一样（`{at, why, raw}`）——设置页那句
      「恢复上一份存档」与 `Core.restoreFromBackup()` 直接就能把它取回来，不需要新界面。 */
  function keepLocalBackup(raw, why) {
    if (!raw) return false;
    try {
      localStorage.setItem(SAVE_BAK, JSON.stringify({ at: Date.now(), why: why || 'cloud', raw: String(raw) }));
      return true;
    } catch (e) { return false; }
  }

  /* ================= V1.0.4 · W（游戏圈活跃任务）：随档带走的一小块计数 =================
     `gameact` 云函数要能回答平台"累计登录几天 / 在线多少分钟 / 通关几次"，而**存档本体是密文**
     （解它的算法在 js/mem-guard.js，只有一份，**不许抄到云函数里当第二份**——派单点名）。
     所以推档时**另带一小块数字**写进同一条记录的 `act` 字段：
       · 只有整数（`Core.actSnapshot()` 的出口），没有名字、没有存档内容、没有密文；
       · 服务端只读这一小块，`payload` 一个字都不碰；
       · **不顺路多发一次网络请求**：就挂在原有那三种推送（第一次交互 / 切后台 / 打关结算）上，
         口径与次数上限一个字没改（还是每天 20 次）。玩家一旦切出去看活动页，走的正是"切后台必推"。
     ================= V1.0.4 · X（订阅消息）在这里补了三行 =================
       上一版这里只搬了三个数，**云端 `notify` 要的 `subMsg / bankFullAt / bankAmount` 漏在门口
       没搬上去**（`actSnapshot()` 里有、`act` 里没有）—— 结果是"整条链一次都不会发"，
       而且**静默**：云函数扫不到候选、日志里连一行都没有。这三行就是那处接线。
       ⚠️ 三个数全部来自 `Core.actSnapshot()` 的同一个出口（判据不在这儿重算第二份）。 */
  function actBlock(tsOverride) {
    const C0 = G.Core;
    if (!C0 || typeof C0.actSnapshot !== 'function') return null;
    try {
      const s = C0.actSnapshot() || {};
      const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
      /* 占位时间戳**由调用方给**（推档那次用它写字，占位那次也用同一个数）——
         这样"写上去的 `sess.ts`"与"本机记的 `leaseTs`"永远是同一次，不会各写各的。 */
      const leaseStamp = Number(tsOverride) || Date.now();
      return {
        loginDays: n(s.loginDays), playMinutes: n(s.playMinutes), clears: n(s.clears),
        /* V1.0.4 · X（订阅消息）：云端 `notify` 判据只认这几个 —— 全是数字、不含身份信息。
           `bankSec` 是"银行里攒了多久"（推给玩家那句「挂机时长」用它，不是"满了之后过了多久"）。 */
        subMsg: n(s.subMsg), bankFullAt: n(s.bankFullAt), bankAmount: n(s.bankAmount), bankSec: n(s.bankSec),
        at: Date.now(),
        /* ================= 康康 2026-10-01 · **双端单活租约**（父亲大人 10-01）=================
           原话：「你可以设置双端只有一端能在线，避免双端打架，就是手机登陆的时候，电脑端如果也登陆着，
                   则电脑端下线，就**以晚登陆的为主**」。
           做法：每次推档都把"**本机在场证明**"一起写进云上那份 `act`——
             · `sess.id` ＝ 本机设备标识（`deviceId()`，只存在本机）；
             · `sess.ts` ＝ 这一刻的毫秒时间戳 ⇒ **谁后登录，谁的 ts 更新**。
           另一端拉到这份 `act` 时比对：`sess.id ≠ 自己` 且 `ts` 比自己的新 ⇒ 判定"我被顶下线"，
           立刻**停止写档**（防止两端互相覆盖）并提示「已在另一台设备登录，本机已下线」。
           ⚠️ 只多一个字段，`notify` 云函数读的还是那几个数字，不受影响。 */
        sess: { id: deviceId(), ts: leaseStamp },
      };
    } catch (e) { return null; }
  }

  /* ---------- 云开发（客户端 SDK；没有云能力就是"这台设备同步不了"，不影响本机存档） ---------- */
  /* ================= F2 · 0930L（父亲大人 2026-09-30：「存档也是啊，同一个微信，都能上微信了，
     怎么可能没网络」）=================================================================
     真问题不是"没网络"，而是**这条链全程静默**：电脑端到底有没有 `wx.cloud`、`init` 成没成功、
     云函数到底报了什么 —— 一处都看不见，于是"电脑端进度不动"只能靠猜。
     现在这一条链上的**每一个失败点都落账**（进 `G.LOG` 的 ring，能被 `LOG.recent()` 读到）
     并把最近一次失败记在 `lastErr` 里 —— 设置页那行诊断（`statusText()`）就是读它。
     ⚠️ 只记**错误码与短原因**，存档内容、openid 一个字都不进（与 `G.LOG` 的字段白名单同一条纪律）。 */
  let inited = false, initErr = '', lastErr = null;
  function noteErr(why, err) {
    lastErr = { at: Date.now(), why: String(why || '?'), err: String(err == null ? '' : err).slice(0, 60) };
    clog('fail', { why: lastErr.why, reason: lastErr.err });     // 'why' / 'reason' 都在 G.LOG 的白名单里
    return lastErr;
  }
  function cloudAbsent() {
    if (!WX) return 'no_wx';
    if (!WX.cloud) return 'no_cloud';
    return '';
  }
  /* "这台设备没有云能力"这一次会话只落一条账（不然每次同步都写一条，把别的日志淹了） */
  let absentLogged = false;
  function logAbsent(why) {
    if (absentLogged) return;
    absentLogged = true;
    clog('absent', { why: why || cloudAbsent() || 'no_cloud' });
  }
  function cloud() {
    const miss = cloudAbsent();
    if (miss) return null;
    if (!inited) {
      try { WX.cloud.init({ env: ENV_ID, traceUser: true }); }
      catch (e) {
        /* init 就抛错：以前这里是**静默 return null**（正是"电脑端没参与同步"最可疑的那一处） */
        initErr = String((e && (e.errMsg || e.message)) || 'init').slice(0, 60);
        noteErr('init', initErr);
        return null;
      }
      inited = true;
    }
    return WX.cloud;
  }
  /* ================= R1.2 · P0（父亲大人 2026-10-01 的任务书）：**客户端一行云数据库代码都没有** =====
     原来这里有两支 —— `db()`（拿 `wx.cloud.database()`）与 `query()`（跑一次集合查询），
     读档走的是 `collection('saves').where({}).get()`：**空条件＝集合扫描**，
     靠"数据库权限只回自己那条"把自己那条筛出来。权限一旦被配宽，整张表就落到客户端上
     （别的账号的档也在里面）—— 这是安全 / 带宽 / 性能 / 隐私四重的洞。
     **现在这两支整个删掉**：存档的读、写、占位全部走云函数 `cloudsave`，
     服务端用 `getWXContext().OPENID` 定位"这个账号唯一那条"，客户端**永远拿不到别人的记录**。
     做坏试验：把 `db()/query()` 任何一处加回来 → `cloud_sync_audit` 的「客户端不碰云数据库」当场红。 */
  /** 读"自己那条"。默认权限（仅创建者可读写）下查回来的就是自己那条；
      万一集合权限被设成"所有人可读"，这里**也绝不乱挑一条** —— 见下面 myDoc 的守卫。
      ⚠️ 空条件 `where({})` 在某些基础库上会被判"参数不合法"—— 真被拒了就退到不带条件那条。 */
  /** 调一次 `cloudsave` 云函数：`{ok, ...}`；异常一律收成 `{ok:false, why:'net'|'sdk'}`。 */
  function saveFn(action, data) {
    const c = cloud();
    if (!c || !c.callFunction) return Promise.resolve({ ok: false, why: 'unsupported' });
    const payload = Object.assign({ action: action }, data || {});
    return new Promise(function (resolve) {
      let req = null;
      try { req = c.callFunction({ name: SAVE_FN, data: payload }); }
      catch (e) { noteErr('sdk', (e && e.message) || '调用失败'); resolve({ ok: false, why: 'sdk', err: (e && e.message) || '调用失败' }); return; }
      Promise.resolve(req).then(function (res) {
        const r = (res && res.result) || null;
        if (!r) { noteErr('fn', 'empty'); resolve({ ok: false, why: 'empty' }); return; }
        if (r.ok) resolve(r);
        else {
          /* ⚠️ `superseded` 是**服务端**给的下线判决（不是网络错误）：不许当成"没连上"去重试 ——
             它要走"被顶下线"那条路（只读 ＋ 提示 ＋ 重新登录），重试只会一直撞墙。 */
          const why = String(r.msg || 'fail');
          if (why !== 'superseded') noteErr('fn', why);
          resolve({ ok: false, why: why, lease: r.lease || null });
        }
      }).catch(function (e) {
        const em = (e && (e.errMsg || e.message)) || '未知错误';
        noteErr('fn', em);                    // ← 云函数调用失败（读档 / 写档 / 占位都走这一条）
        resolve({ ok: false, why: 'net', err: em });
      });
    });
  }

  function readOwn() {
    return saveFn('pull', {}).then(function (r) {
      if (!r.ok) return { ok: false, why: r.why, err: r.err };
      const P = prefs(), doc = r.doc || null;
      /* 账号指纹由**服务端**算（`fpOf(openid)`，与客户端同一套 FNV-1a）——
         客户端再也看不到 openid，但导出档里的 `fp` 口径一个字没变。 */
      if (r.fp && r.fp !== P.accountId) { P.accountId = String(r.fp); savePrefs(); }
      /* ================= 康康 2026-10-01 · **双端单活**：判"被顶下线" =================
         云上那条的 `lease` 记的是"上一次是谁占的位"（老记录上还可能是 `act.sess`）：
           · 是本机        → 本机就是在场那一端（把本机租约时间对齐到那一笔）；
           · 是别的设备、而且**比本机这次占位更晚** → 本机被顶下线（只读，不再写档）；
           · 没有 / 是更旧的别人的 → 本机接着用。
         判据放在**唯一的读入口**上 ⇒ 自动那条路（sync）、手动两颗（找回存档 / 取回上一份）
         看到的都是同一个结论，不会各判一套。
         ⚠️ 这一支只是**UI 判断**（谁在场、要不要弹那句提示）；真正的强制在服务端：
            `push` 那边是 `where({_id, 'lease.token': 本机 token})` 的**条件更新**，
            本机即使把 `superseded` 认成 false，只要 token 不是当前那个，**一个字都写不进去**。
         做坏试验：把下面那句 `superseded = true` 删掉 → `cloud_sync_audit` ⑪ 那条当场红。 */
      const sess = (doc && (doc.lease || (doc.act && doc.act.sess))) || null;
      if (sess && sess.id) {
        if (String(sess.id) === deviceId()) { leaseTs = Math.max(leaseTs, Number(sess.ts) || 0); superseded = false; supersededTs = 0; }
        /* 别人的租约：**不比本机这次占位早**、而且**还在有效期内**（＝那台确实还在线）才算顶下线。
           过期租约（那台早走了）不拦本机。
           ⚠️ 这里是 `>=` 不是 `>`：`Date.now()` 只有毫秒分辨率，而"另一台抢租约"与"本机记租约"
           完全可能落在**同一个毫秒**里（尺子上真的复现过：三次里错两次）。同刻且不是本机时，
           判对方持有才是安全的 —— 反正服务端那一道条件更新也会拒（本机不会因此被误写成"在线"）。 */
        else if ((Number(sess.ts) || 0) >= leaseTs && (Date.now() - (Number(sess.ts) || 0)) < LEASE_TTL_MS) {
          /* 2026-10-03：顺手记下"判只读那一刻云上那条的 ts" —— 本机之后真玩出更新的进度时，
             `push` 要靠它决定"能不能自己站起来"（见 push 顶部与抢位重推那两段）。 */
          superseded = true; supersededTs = doc ? (Number(doc.ts) || 0) : 0;
        }
        else { superseded = false; supersededTs = 0; }
      } else { superseded = false; supersededTs = 0; }
      /* 顺手记住"云端那条里有没有更旧的备份"——设置页那行字（与一键取回）就看它。 */
      P.prevAt = doc ? (Number(doc.prevAt) || 0) : 0;
      P.prevTs = doc ? (Number(doc.prevTs) || 0) : 0;
      P.prevBytes = doc ? (Number(doc.prevBytes) || 0) : 0;
      savePrefs();
      return { ok: true, doc: doc };
    });
  }
  /* ================= R1.2 · P0：客户端那支"直接写云数据库"的 `writeDoc()` 已整个删除 =================
     原来它是"有那条就 update、没有就 add"，全靠客户端自己判断 —— 两台设备第一次同时推就会
     `A add` ＋ `B add` ＝ **两条记录**（我们自己在 `myDoc()` 里留过 `list.length > 1 → why:'multi'`
     这个脚印）。现在写走云函数 `cloudsave`：服务端按 OPENID 定位**唯一那条**（`_id` 由 OPENID 推导），
     并且用 `where({_id, 'lease.token': 本机token})` 做**原子条件更新** —— 旧设备即使本地
     `superseded === false`，token 对不上也**一个字都写不进去**。 */
  /* ================= 康康 2026-10-01 · **双端单活**：占位 / 顶下线提示 / 重新登录 =================
     父亲大人：「只有一端能在线，避免双端打架……**以晚登陆的为主**」。
     三件事都在这里，一处收口：
       · `claimLease()`  —— 占位：把"本机这次会话在场"写进云上那条的 `act.sess`，
                            **只写这一小块数字，payload 一个字不动**；
       · `maybeNotifySuperseded()` —— 被顶下线时**只讲一次**（走现成的 `U.confirm`，
                            不动页面结构；一颗「重新登录」、一颗「知道了」）；
       · `reclaim()`      —— 「重新登录」＝再占一次位（晚登陆的为主），然后照常结算一趟。
     ⚠️ 自动那条路（sync / push / retry）**平时一个字都不弹**（cloud_sync_audit ② 钉着）；
        只有"被另一台设备顶下线"这一件事会说话 —— 因为不说的话，玩家只会以为"存档又没同步"，
        而实际原因是"这台已经下线了"，两者要做的事完全不同。 */
  function leaseOf(doc) { return (doc && (doc.lease || (doc.act && doc.act.sess))) || null; }
  /** 占位（登陆）：叫服务端把 `lease` 原子地换成本机的新 token。
      云上那条还没建过（第一次玩）时占不了位 —— 但随后的 `push` 建记录会把同一个 token 一起写进去。
      "以晚登陆的为主"就落在这一句上：谁后调它，谁就是当前设备。 */
  function claimLease(doc) {
    return saveFn('claim', { device: deviceId() }).then(function (r) {
      if (!r.ok) { noteErr('claim', r.why || 'fail'); return { ok: false, why: r.why || 'fail' }; }
      leaseToken = String(r.token || '');
      leaseTs = Number(r.ts) || Date.now();
      superseded = false; supersededTs = 0;
      return { ok: true };
    });
  }
  function maybeNotifySuperseded(on) {
    if (!on) { noticeShown = false; noticeAt = 0; return; }
    if (!superseded) { noticeShown = false; return; }
    /* 讲过了、而且还在"静默期"内 → 不重复打扰；超过静默期还在这台玩 → 再讲一次。 */
    if (noticeShown && (Date.now() - noticeAt) < NOTICE_HOLD_MS) return;
    noticeShown = true; noticeAt = Date.now();
    try {
      const U2 = G.U;
      if (!U2 || typeof U2.confirm !== 'function') { clog('superseded', { why: 'no-ui' }); return; }
      U2.confirm(
        '已在另一台设备登录',
        '本机已下线：进度不再往云上传（云端更新的进度照样会同步下来）。\n要继续在这台设备玩，点下面这颗。',
        function () { reclaim('notice'); },
        { okLabel: '重新登录', cancelLabel: '知道了' }
      );
    } catch (e) { clog('superseded', { why: String((e && e.message) || '').slice(0, 40) }); }
  }
  /** 「重新登录」：把本机重新占回来（＝以晚登陆的为主），然后照常结算一趟。 */
  function reclaim(reason) {
    noticeShown = false; noticeAt = 0;
    superseded = false;                        // 先放开：占位这一趟才有资格写
    return sync('reclaim', { claim: true }).then(function (r) {
      const ok = !!(r && r.ok && !superseded);
      clog('reclaim', { ok: ok, why: String((r && (r.skip || r.took)) || '') });
      const msg = ok ? '已取回云端最新进度（这台设备的进度以云端那份为准）。\n点下面那颗，从主画面重新进入游戏。'
        : ((r && r.msg) || '还是没连上，稍后再试（切回前台会自动再试一次）。');
      /* ================= 2026-10-03（父亲大人）=================
         「被顶号重新登陆**必须是字面上的重新登陆**，而不是还停留在当前页面，
          就是**重新拉取最新的档、从启动界面重新进入游戏**。」
         ⇒ 成功之后**不留在当前页**：上面那一趟 sync 已经把云端那份换进内存（谁新听谁的），
           这里把**页面栈整个清掉、回到开机主画面**（`gate`）—— 玩家从主画面重新进游戏，
           看到的就一定是刚取回来的那份档。弹窗是"已经换好了"的回执，不是"继续玩"的按钮。
         ⚠️ 失败时不回退页面（没拿到档就回主画面，等于把人晾在半路）；照旧只提示重试。 */
      if (ok) {
        try { if (G.CV && G.CV.reset) G.CV.reset('gate'); } catch (e) {}
      }
      try {
        const U2 = G.U;
        if (U2 && typeof U2.confirm === 'function') U2.confirm('已重新登录', msg, null, { cancel: false, okLabel: '进入游戏' });
      } catch (e) {}
      return { ok: ok, msg: msg, why: String((reason || '')) };
    });
  }
  /** 云函数（存档码走它：客户端写不了别人那条，也只有服务端能做"用过就作废"这种原子判断）。 */
  function callFn(data) {
    return new Promise(function (resolve) {
      const c = cloud();
      if (!c || !c.callFunction) { resolve({ ok: false, why: 'unsupported' }); return; }
      let req = null;
      try { req = c.callFunction({ name: CODE_FN, data: data }); } catch (e) { resolve({ ok: false, why: 'sdk' }); return; }
      Promise.resolve(req).then(function (res) {
        const r = (res && res.result) || null;
        if (!r) { resolve({ ok: false, why: 'empty' }); return; }
        if (r.ok) resolve({ ok: true, code: r.code, data: r.data, expireAt: r.expireAt, createdAt: r.createdAt });
        else resolve({ ok: false, why: String(r.msg || 'fail') });
      }).catch(function (e) {
        const em = (e && (e.errMsg || e.message)) || '未知错误';
        noteErr('fn', em);                    // ← 云函数调用失败（存档码 / 机审都走这条）
        resolve({ ok: false, why: 'net', err: em });
      });
    });
  }

  const NET_MSG = function (r) {
    if (r && r.why === 'unsupported') return '这台设备没有云开发能力，存档只在本机';
    if (r && r.why === 'too_big') return '这份存档太大了，传不上去（先照本机玩，稍后我们再处理）';
    if (r && r.why === 'empty') return '云端那边没收到存档内容，稍后再试';
    if (r && r.why === 'no_token') return '这台还没占上位，稍后会自动再试一次';
    return '云端连不上（' + ((r && (r.err || r.why)) || '网络问题') + '）';
  };

  /* ---------- 把云端那份换到本地（**覆盖前一定先留档**） ---------- */
  function applyCloudSave(payload, ts, why) {
    payload = String(payload || '');
    if (!payload) return { ok: false, why: 'empty' };
    const mine = currentRaw();
    if (payload === mine) return { ok: true, same: true, ts: Number(ts) || 0 };
    keepLocalBackup(mine, why || 'cloud');          // ← 被盖掉的那一份（本机原文）留在 _bak 里，能一键取回
    let r = null;
    try { r = G.Core.importSave(payload); }
    catch (e) { r = { ok: false, msg: String(e && e.message) }; }
    if (!r || !r.ok) return { ok: false, why: 'bad', msg: (r && r.msg) || '云端那份读不出来' };
    const P = prefs();
    P.lastPushHash = hash(currentRaw());   // 刚换上的这份 = 云端已有，别马上又推回去
    P.lastSyncAt = Date.now();
    savePrefs();
    /* 取回（R1）：谁新听谁的 —— 这一条记录的是"换上了云端那份"，字节数 + 那份自己的时间戳 */
    clog('take', { bytes: payload.length, ts: Number(ts) || 0, why: String(why || '') });
    return { ok: true, ts: Number(ts) || 0 };
  }

  /* ---------- 推 ---------- */
  function push(P, doc, reason) {
    /* 双端单活：被顶下线期间**一个字都不许写回云端**（否则两台设备就会互相覆盖，
       正是父亲大人要防的"打架"）。这里再兜一道 —— 上面 sync 已经分流过一次，
       但这颗是**所有**写路径的唯一出口，兜在出口上才不怕以后从别处绕进来。 */
    /* ================= 2026-10-03（父亲大人：「手机同步不到开发者工具的存档」）=================
       挡在这一句上的**原来**是"只要 `superseded` 就别推"。可 `superseded` 的成因可能是
       "另一台**只是开过一次**、租约在它手上"，而不是"另一台真的更新"——
       于是一台设备只要被别的设备占过位，**之后打出来的所有进度全被扔掉**（云上永远是旧那份），
       另一台自然怎么都同步不到（这正是父亲大人报的那条）。
       现在按原口径收口：**只有"云上那份不比本机旧"才是真只读**；
       本机已经比"判只读那一刻云上的那份"更新了 ⇒ 放行去推（推的时候服务端会让我们先抢回租约）。 */
    if (superseded && !(supersededTs && localTs() > supersededTs)) return Promise.resolve({ ok: false, skip: 'superseded' });
    const raw = currentRaw();
    if (!raw) return Promise.resolve({ ok: false, skip: 'nodata' });
    const h = hash(raw);
    /* 脏标记对**所有**入口一视同仁：本机这份跟云上那份一模一样就不传（手动那颗也省着来，
       页面会说一句"本机和云端已经一样了"）。`reason` 留着只为将来区分口径用。 */
    if (h === P.lastPushHash) return Promise.resolve({ ok: true, skip: 'clean' });
    if (P.pushes >= PUSH_CAP_PER_DAY) return Promise.resolve({ ok: false, skip: 'cap' });
    /* V1.1.20（F1-1）：这一条记录的 `ts`（对面那台设备比新旧的唯一依据）＝ **这份档自己**的
       `savedAt`（玩家最后一次真在玩的时刻）。整条链（本地判据 / 推上去的 ts / prev* 的 ts）同一个口径。 */
    const ts = localTs() || Date.now();
    /* 占位时间戳取一次、两处共用：写进 `act.sess.ts` 与记在本机的 `leaseTs` 是同一个数。 */
    const actTs = Date.now();
    const act = actBlock(actTs);
    /* 没占到位就先占一次（老窗口 / 云函数刚部署时的那种会话）——
       `push` 那一步服务端要 token 对得上才写，所以这里不能省。 */
    /* 把"把手上这份推上去"抽出来：'superseded' 那一支要**抢回租约后再推一次**，推的是同一份东西。 */
    const sendPush = function () {
      return saveFn('push', {
        payload: raw, ts: ts, bytes: raw.length, ver: String(G.GAME_VER || ''),
        act: act, token: leaseToken, device: deviceId(),
      });
    };
    /* `superseded` 为真 ⇒ 手上那个 token 一定已经作废了（服务端早换给别人）：直接去占位，
       别拿它白跑一趟（那一趟必定被拒，白多一次云函数调用）。 */
    const path = ((leaseToken && !superseded) ? Promise.resolve({ ok: true }) : claimLease(doc));
    return path.then(function () {
      /* ⚠️ R1.2 实测抓到的：占位没成功时**不许硬推**。原来这里不看占位结果，
         一旦 claim 那一下没成（云函数刚部署 / 网络抖），就会拿空 token 去推 ——
         服务端照规矩回 `no_token`，玩家那行诊断变成"云函数调不通"，而其实只是"还没占上位"。
         现在停在这一步、报一句人话，等下一轮（开机 / 回前台 / 打关）自动再占一次。 */
      if (!leaseToken) return { ok: false, skip: 'notoken', why: 'no_token', msg: NET_MSG({ why: 'no_token' }) };
      return sendPush();
    }).then(function (r) {
      /* ================= 2026-10-03 · **抢位重推**（同一条收口）=================
         服务端按 token 拒了我们（`superseded`）。这一刻先分一次岔，判据与上面那句同源：
           · **本机这份比云上那份新** ⇒ 这不是"被顶下线"，是"**这台才是刚在玩的那台**"
             （`savedAt` 比云上那条的 `ts` 大就是证据）⇒ 当场把位占回来、用新 token 再推**一次**；
           · 云上不比本机旧（或抢位没抢到）⇒ 真·被顶下线：转只读 ＋ 走那个"讲一次"的口。
         ⚠️ 只重推一次（`reason === 'reclaim'` 时不重推）：两台设备不会无限互抢 ——
            抢回来的那一推若再被拒，就落回只读，与原来一模一样。
         ⚠️ 覆盖前留档那条一个字没动：这一推照旧把云上那份写进 `prev*`，两头的档都不丢。 */
      if (r && !r.ok && String(r.why) === 'superseded' && reason !== 'reclaim'
          && doc && Number(doc.ts || 0) < ts) {
        return claimLease(doc).then(function (c) {
          if (!c.ok || !leaseToken) return r;          // 没抢到：照原样走下面的只读那条
          return sendPush();
        });
      }
      return r;
    }).then(function (r) {
      if (!r.ok) {
        if (String(r.why) === 'superseded') {
          /* **服务端**判的下线：本机立刻转只读（本地那个 `superseded` 认成 false 也没用，
             因为写这一下已经被服务端按 token 拒了）。然后走同一个提示口。 */
          superseded = true; leaseToken = '';
          supersededTs = Number((doc && doc.ts) || 0);
          maybeNotifySuperseded(true);
          clog('push_denied', { bytes: raw.length });
          return { ok: false, skip: 'superseded' };
        }
        clog('push_fail', { bytes: raw.length, why: String(r.why || '') });
        return { ok: false, skip: 'fail', why: r.why, msg: NET_MSG(r) };
      }
      /* 推上去了 ⇒ 这一趟也算一次"占位"（本机就是在场那一端），租约时间对齐同一个数。 */
      leaseTs = actTs; superseded = false; supersededTs = 0;
      P.pushes++;
      P.lastPushHash = h;
      P.lastPushAt = Date.now();
      P.lastSyncAt = P.lastPushAt;
      if (r.prev && doc) { P.prevAt = Number(doc.ts) || 0; P.prevTs = Number(doc.ts) || 0; P.prevBytes = String(doc.payload || '').length; }
      savePrefs();
      clog('push_ok', { bytes: raw.length, ts: ts, n: P.pushes });
      return { ok: true, pushed: true, bytes: raw.length, ts: ts, prev: !!r.prev };
    });
  }

  /* ---------- 静默结算（**唯一的一处收口**：读一次云端 → 谁新听谁的） ---------- */
 let busy = false, retryTimer = null, retryTries = 0, progressTimer = null;
  /** @param opts {claim} 开机 / 回前台那一趟要**先占位**（＝一次"登陆"，见 claimLease） */
  function sync(reason, opts) {
    const wantClaim = !!(opts && opts.claim);
    const P = rollDay();
    if (!P.on) return Promise.resolve({ ok: false, skip: 'off' });
    if (!WX || !WX.cloud) {
      /* F2 · 0930L：**"这台设备根本没有云能力"必须落账** —— 这正是"电脑端没参与同步"最像的那一种；
         以前它是**一声不响**就 return 掉的（玩家那台电脑上到底有没有 wx.cloud，谁都看不见）。 */
      logAbsent(cloudAbsent());
      return Promise.resolve({ ok: false, skip: 'unsupported' });
    }
    if (busy) return Promise.resolve({ ok: false, skip: 'busy' });
    /* V1.1.20（F1-5）：**救援态（本机存档读不出来、主键禁写）期间云同步也停** ——
       那一刻内存里是"空新档"，推上去等于把玩家云上那份真进度顶掉（还会顺手覆盖
       读档失败时留的那份原样备份）；拉下来又会把救援现场换掉。等玩家显式选择之后再说。 */
    if (G.Core && G.Core.rescueInfo && G.Core.rescueInfo()) return Promise.resolve({ ok: false, skip: 'rescue' });
    busy = true;
    /* V1.1.20（F1-1）：冲突判据在**这一轮同步开始的那一刻**取一次快照 —— readOwn() 要过网络，
       期间玩家操作 / 心跳存盘都可能把本机判据抬新；拿"网络回来那一刻的本机"去比，
       比的就不是"这一轮开始时谁新"了（第一下触摸之后紧跟的那次存盘最典型）。
       ⚠️ 光靠这一步还不够：真正让判据"不虚高"的是 core 的 settleWriting 那道闸
       （开机结算不许刷新 savedAt）—— 两条一起才成立。 */
    const localAtStart = localTs();
    return readOwn().then(function (got) {
      if (!got.ok) return { ok: false, skip: 'fail', why: got.why, msg: NET_MSG(got) };
      const doc = got.doc || null;
      const cloudTs = doc ? (Number(doc.ts) || 0) : 0;
      /* ================= 康康 2026-10-01 · **双端单活**（两处分流）=================
         ① **开机 / 回前台 ＝ 一次登陆 ⇒ 先占位**（父亲大人：「以晚登陆的为主」）。
            只在云上那条的租约**不是本机**时才写 —— 同一台设备连着开几次，一次都不多写。
         ② **被顶下线 ⇒ 只读**：云端更新照样换下来（双端内容保持一致），但一个字都不写回去，
            并且把"本机已下线"这件事**讲一次**（不讲的话玩家只会以为"存档又没同步"）。 */
      const sess = leaseOf(doc);
      /* ⚠️ 判据只看"云上那条的租约是不是本机"，**不看有没有那条** ——
         R1.2 起服务端那边是"记录存不存在都认"，客户端也拿不到 `_id` 了
         （`publicDoc()` 特意不下发 `_id` / `_openid`）。 */
      const needClaim = wantClaim && !(sess && String(sess.id) === deviceId());
      return (needClaim ? claimLease(doc) : Promise.resolve(null)).then(function () {
        /* ================= 2026-10-03（父亲大人：「手机同步不到开发者工具的存档」）=================
           `superseded` 只说明"云上那条的租约在别的设备手里"，**不等于"对面更新"**。
           对面可能只是开过一次 App（开机那一趟就占了位）—— 那就把本机**刚打出来的进度**白白拦住，
           云上永远是旧那份，第三台设备自然怎么都同步不到（父亲大人报的就是这一条）。
           收口成原口径：**只有"云上那份不比本机旧"才是真·被顶下线**（转只读 ＋ 讲一次）；
           本机比云上更新 ⇒ 照常往下走，`push` 会先替我们把租约抢回来（见那里"抢位重推"）。
           ⚠️ 这里比的是 `localAtStart`（本轮同步开始时取的那一份判据），不是取档之后的本机。 */
        const reallyBehind = superseded && !(supersededTs && localAtStart > supersededTs);
        if (reallyBehind) {
          maybeNotifySuperseded(true);
          if (doc && cloudTs > localAtStart) {
            const rr = applyCloudSave(doc.payload, doc.ts, 'cloud');
            return { ok: true, took: 'cloud', ts: rr.ok ? rr.ts : 0, skip: 'superseded' };
          }
          return { ok: true, took: 'none', skip: 'superseded' };
        }
        if (doc && cloudTs > localAtStart) {
          /* 云端更新 → **直接换上**（不弹窗、不提示）；万一那份读不出来（比如来自更新的版本），
             退到"用本地推上去"——推的时候旧云端会进 `prev*`，两头都不丢。 */
          const r = applyCloudSave(doc.payload, doc.ts, 'cloud');
          if (r.ok) return { ok: true, took: 'cloud', ts: r.ts };
          return push(P, doc, reason).then(function (p) {
            return { ok: p.ok, took: 'fallback', pushed: !!p.pushed, skip: p.skip, bytes: p.bytes };
          });
        }
        return push(P, doc, reason).then(function (p) {
          return p.ok ? { ok: true, took: p.pushed ? 'local' : 'none', skip: p.skip, pushed: !!p.pushed, bytes: p.bytes } : p;
        });
      });
    }).then(function (r) {
      busy = false;
      /* 一次静默结算的最后取值（R1）：local ＝ 本地新推上去 / cloud ＝ 云端新换下来 /
         none ＝ 两边一样 / fallback ＝ 云端那份读不出来、改推本地 / fail ＝ 没通 /
         superseded ＝ 本机被另一台设备顶下线（只读那一趟） */
      clog(r && r.ok ? 'sync' : 'sync_fail', {
        from: String((r && (r.took || r.skip)) || '?'), bytes: (r && r.bytes) || 0, ok: !!(r && r.ok),
      });
      /* 通了就把"最近一次失败"擦掉 —— 设置页那行诊断会自己回到「已连」 */
      if (r && r.ok) { lastErr = null; retryTries = 0; if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } }
      /* `notoken`（还没占上位）也算"这一趟没成"—— 排一次静默重试，别干等下一轮开机。 */
      else if (r && (r.skip === 'fail' || r.skip === 'notoken')) scheduleRetry();
      return r;
    }, function (e) {
      busy = false; scheduleRetry();
      return { ok: false, skip: 'fail', err: String(e && e.message) };
    });
  }
  /** 联网失败**静默重试**：退避 30s → 2min → 5min（不再往上加），全程没有弹窗、不挡操作。 */
  function scheduleRetry() {
    if (retryTimer || !prefs().on) return;
    const wait = RETRY_WAIT[Math.min(retryTries, RETRY_WAIT.length - 1)];
    retryTries++;
    retryTimer = unref(setTimeout(function () { retryTimer = null; sync('retry'); }, wait));
  }

  /* ---------- 三个触发口（都在"第一次用户交互之后"或更晚，首帧一次网络都不发） ---------- */
  /** @param mode 'first'（第一次触摸：结算一次）| 'hide'（切后台：**必推**）| 'progress'（打关/结算）*/
  function triggerAuto(mode) {
    /* ⚠️ 归一化之前先留一份原样：'boot' / 'show' 会被下面那句映射成 'first'，
       而**占位的判据认的是原样的那一个**（开机、回前台＝一次登陆）。 */
    const raw = mode;
    mode = (mode === 'hide') ? 'hide' : (mode === 'progress' ? 'progress' : 'first');
    const P = rollDay();
    if (!P.on || !WX || !WX.cloud) return Promise.resolve({ ok: false, skip: 'off' });
    const now = Date.now();
    if (mode === 'first') { P.lastAutoPullAt = now; savePrefs(); }   // 只记个时间，不做冷却（见 boot 里的口径）
    if (mode === 'progress' && P.lastPushAt && now - P.lastPushAt < MERGE_MS) {
      /* 同一分钟内的多次打关/结算**合并成一次**：等这一分钟走完再推（那一推是"当时那一整份"）。 */
      scheduleMergedPush();
      return Promise.resolve({ ok: true, skip: 'merged' });
    }
    /* 开机 / 回前台 → 这一趟**先占位**（双端单活：以晚登陆的为主）；其余口子照旧。 */
    return sync(mode, { claim: (raw === 'boot' || raw === 'show') });
  }
  function scheduleMergedPush() {
    if (progressTimer) return;
    const P = prefs();
    const wait = Math.max(5000, MERGE_MS - (Date.now() - P.lastPushAt));
    progressTimer = unref(setTimeout(function () { progressTimer = null; sync('progress'); }, wait));
  }
  /** 打关 / 结算之后叫一声（页面不用管，见下面的钩子）——脏标记与每日上限都在 sync 里管。 */
  function noteProgress() {
    return triggerAuto('progress');
  }

  /* ---------- 把"打关 / 结算"挂上（**不动逻辑层的源码**：只包一层出口） ---------- */
  function hookProgress() {
    const C = G.Core;
    if (!C) return;
    ['battleSettle', 'stageComplete'].forEach(function (k) {
      const orig = C[k];
      if (typeof orig !== 'function' || orig.__cloudHooked) return;
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        try { noteProgress(); } catch (e) { /* 同步出错绝不影响打完这一关 */ }
        return r;
      };
      wrapped.__cloudHooked = true;
      C[k] = wrapped;
    });
  }

  /* ---------- 导出 / 导入的账号指纹（**旧的粘贴式路子一个字没改**） ---------- */
  /** 导出：把存档本体装进一个信封，信封上带**账号指纹**（openid 的哈希，不是 openid）。 */
  function wrapExport(raw) {
    return JSON.stringify({ app: 'wxlh', t: 'save', v: 2, fp: prefs().accountId || '', data: String(raw == null ? '' : raw) });
  }
  /** 导入前的校验：没绑账号 → 放行但**标注**；绑了账号 → 指纹不一致就拒收。 */
  function checkImport(txt) {
    let env = null;
    try { env = JSON.parse(String(txt)); } catch (e) { env = null; }
    /* 老导出串（当年直接复制出去的那段密文 / 明文）：整串就是存档本体，没有指纹可验。 */
    if (!env || typeof env !== 'object' || env.app !== 'wxlh' || env.t !== 'save' || typeof env.data !== 'string') {
      return { ok: true, data: String(txt), note: '这份是旧格式的导出串（没带账号指纹），本次不做账号校验', legacy: true };
    }
    const me = prefs().accountId;
    if (env.fp) {
      if (!me) return { ok: true, data: env.data, note: '本机还没绑上微信账号，本次不做账号校验' };
      if (env.fp !== me) return { ok: false, foreign: true, msg: '这份存档是另一个微信账号导出的，为了不覆盖错人，已拒绝导入' };
      return { ok: true, data: env.data, note: '' };
    }
    return { ok: true, data: env.data, note: '这份导出档没带账号指纹（导出时还没绑上账号），本次不做账号校验' };
  }
  /** 把"玩家点名要的那一份"换进来（粘贴式导入 / 存档码取回 / 取回云端旧备份）：覆盖前一律先留档。 */
  function applyExternal(payload, why) {
    return applyCloudSave(payload, 0, why || 'import');
  }

  /* ---------- 存档码（云函数 savecode：8 位 · 24 小时 · 用一次即失效） ---------- */
  const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;        // 与云函数同一套字母表：去掉易混的 O / 0 / I / 1
  function normCode(s) {
    const t = String(s == null ? '' : s).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (CODE_RE.test(t)) return t;
    /* 剪贴板里可能混着说明文字：挑出那一段 8 位码（仍是同一套字母表，O/0/I/1 一律不算）。 */
    const m = /[A-HJ-NP-Z2-9]{8}/.exec(t);
    return m ? m[0] : '';
  }
  function codeMsg(r) {
    const why = String((r && r.why) || '');
    if (why === 'not_found') return '没找到这个存档码（是不是抄错了一位？）';
    if (why === 'used') return '这个存档码已经被用过了（一个码只能用一次）';
    if (why === 'expired') return '这个存档码过期了（码只有 24 小时有效，重新生成一个）';
    if (why === 'empty' || why === 'nodata') return '本机还没有存档';
    if (why === 'too_large') return '存档太大了，云端不收（这种情况请走导出 / 导入那条路）';
    if (why === 'unsupported') return '这台设备没有云开发能力，用不了存档码（可以继续用导出 / 导入）';
    return '没换成（' + (why || '网络问题') + '），可以再点一次试试';
  }
  /** 「生成存档码」：把现在这份密文传上去，换回一个 8 位短码（24 小时 · 用一次即失效）。 */
  function makeCode() {
    const P = prefs();
    if (!P.on) return Promise.resolve({ ok: false, msg: '云同步是关着的：先点上面那一行打开' });
    if (!WX || !WX.cloud || !WX.cloud.callFunction) return Promise.resolve({ ok: false, msg: codeMsg({ why: 'unsupported' }) });
    const raw = currentRaw();
    if (!raw) return Promise.resolve({ ok: false, msg: codeMsg({ why: 'nodata' }) });
    return callFn({ action: 'upload', data: raw }).then(function (r) {
      if (!r.ok) return { ok: false, msg: codeMsg(r) };
      return { ok: true, code: r.code, expireAt: Number(r.expireAt) || 0 };
    });
  }
  /** 「用存档码取回」：把码交给云函数换回那份密文（只剩"要不要覆盖本机"这一下要玩家点头）。 */
  function claimCode(code) {
    const P = prefs();
    if (!P.on) return Promise.resolve({ ok: false, msg: '云同步是关着的：先点上面那一行打开' });
    if (!WX || !WX.cloud || !WX.cloud.callFunction) return Promise.resolve({ ok: false, msg: codeMsg({ why: 'unsupported' }) });
    const c = normCode(code);
    if (!c) return Promise.resolve({ ok: false, msg: '没认出存档码：它是一串 8 位的字母数字（没有 O / 0 / I / 1）' });
    return callFn({ action: 'claim', code: c }).then(function (r) {
      if (!r.ok) return { ok: false, msg: codeMsg(r) };
      return { ok: true, data: r.data, createdAt: Number(r.createdAt) || 0, code: c };
    });
  }

  /* ⚠️ **兑换码不走这里**（2026-10-01 · 父亲大人拍板「不要调用 mp 后台，直接写在游戏里」）：
     码表在 `js/data.js` 的 `GIFT_CODES`，判据在 `Core.claimGift()`，界面在 `js/sc-last.js`——
     **一次网络请求都不发**（这条链上客户端与服务端都没有它）。第一版曾做成云函数校验，
     那支 `cloudfunctions/gift` 已整个删除；将来要发限时码 / 抽奖码再把它建回来。 */
  /* ---------- 手动两颗（**只有玩家自己点的那两下才说话**，自动那条路一个字都不弹） ---------- */
  /** 手动「从云端下载存档」（L1 点名要的那颗，六个月后救档用）：只读回云端**现在那条**，
      要不要覆盖由页面那一问决定（本机那份在覆盖时照旧先留档）。 */
  function pullCloud() {
    const P = prefs();
    if (!P.on) return Promise.resolve({ ok: false, msg: '云同步是关着的：先点上面那一行打开' });
    if (!WX || !WX.cloud) return Promise.resolve({ ok: false, msg: '这台设备没有云开发能力' });
    return readOwn().then(function (got) {
      if (!got.ok) return { ok: false, msg: NET_MSG(got) };
      const doc = got.doc;
      if (!doc || !doc.payload) return { ok: false, msg: '微信账号上还没有存档（先让自动同步上传一次）' };
      return { ok: true, doc: { payload: String(doc.payload), ts: Number(doc.ts) || 0, bytes: Number(doc.bytes) || String(doc.payload).length } };
    });
  }
  /** 手动取回"云端那条里更旧的那一份备份"。 */
  function takeCloudPrev() {
    const P = prefs();
    if (!P.on) return Promise.resolve({ ok: false, msg: '云同步是关着的' });
    if (!WX || !WX.cloud) return Promise.resolve({ ok: false, msg: '这台设备没有云开发能力' });
    return readOwn().then(function (got) {
      if (!got.ok) return { ok: false, msg: NET_MSG(got) };
      const doc = got.doc;
      if (!doc || !doc.prevPayload) return { ok: false, msg: '云端没有更旧的备份' };
      const r = applyCloudSave(String(doc.prevPayload), Number(doc.prevTs) || 0, 'cloudprev');
      if (!r.ok) return { ok: false, msg: r.msg || '那份备份读不出来' };
      return { ok: true, at: Number(doc.prevTs) || 0, bytes: Number(doc.prevBytes) || String(doc.prevPayload).length };
    });
  }
  function manualPush() {
    const P = prefs();
    if (!P.on) return Promise.resolve({ ok: false, msg: '云同步是关着的：先点上面那一行打开' });
    if (!WX || !WX.cloud) return Promise.resolve({ ok: false, msg: '这台设备没有云开发能力' });
    return sync('manual').then(function (r) {
      if (r.ok && r.skip === 'superseded') return { ok: false, msg: '本机已下线（另一台设备在玩）：先点「重新登录」再同步' };
      if (r.ok && r.took === 'cloud') return { ok: true, msg: '云端那份更新：已经换成云端那份了' };
      if (r.ok && r.pushed) return { ok: true, msg: '已同步到微信（' + kb(r.bytes || 0) + '）' };
      if (r.ok) return { ok: true, msg: '本机和云端已经一样了，不用重复上传' };
      return { ok: false, msg: r.msg || '这次没同步上，等下次自动再试' };
    });
  }
  function info() {
    const P = prefs();
    return {
      available: !!(WX && WX.cloud),
      on: true,                       // 常开（见 prefs 里那段：父亲大人 09-27「关不了」）
      bound: !!P.accountId,
      lastSyncAt: P.lastSyncAt,
      lastPushAt: P.lastPushAt,
      pushes: P.pushes,
      cap: PUSH_CAP_PER_DAY,
      prevAt: P.prevAt, prevTs: P.prevTs, prevBytes: P.prevBytes,
    };
  }

  /* ================= F2 · 0930L：**可见诊断**（把"静默"变成"看得见"）=================
     父亲大人 09-30：「存档也是啊，同一个微信，都能上微信了，怎么可能没网络」——
     他说得对：真问题从来不是"没网络"，而是这条链**出了事没人知道**。
     这里只做两件事（口径一个字没改）：
       · `diag()`       —— 给尺子与排查读的结构（状态 + 原因 + 时间戳）；
       · `statusText()` —— 设置页那一行就是它（`云端：已连 · 上次同步 hh:mm` /
                           `云端：未连（原因）· 上次同步 hh:mm`）。
     ⚠️ 只显示**状态、原因与时间**，不显示 openid、不显示存档内容。 */
  const WHY_TEXT = {
    no_wx: '没有微信环境', no_cloud: '这台设备没有云开发能力',
    init: '云服务初始化失败', read: '读不到云端', write: '存不到云端',
    fn: '云函数调不通', sdk: '云接口不可用', net: '云端连不上',
    empty: '云端没收到存档内容', too_big: '存档太大', no_token: '还没占上位',
  };
  function diag() {
    const P = prefs();
    const miss = cloudAbsent();
    const out = {
      state: 'ok', why: '', detail: '', lastFailAt: 0,
      lastSyncAt: Number(P.lastSyncAt) || 0, lastPushAt: Number(P.lastPushAt) || 0,
      bound: !!P.accountId, env: ENV_ID,
      /* 双端单活：本机是否已被另一台设备顶下线（设置页那行字读它）。 */
      superseded: superseded,
    };
    if (miss) { out.state = 'nocloud'; out.why = miss; }
    else if (initErr) { out.state = 'initerr'; out.why = 'init'; out.detail = initErr; }
    else if (superseded) { out.state = 'superseded'; out.why = 'superseded'; }
    else if (lastErr) { out.state = 'error'; out.why = lastErr.why; out.detail = lastErr.err; out.lastFailAt = lastErr.at; }
    else if (!inited) { out.state = 'idle'; out.why = ''; }   // 还没试过（开机首帧一次网络都不发，这是正常态）
    return out;
  }
  function hhmm(t) {
    const d = new Date(Number(t) || 0), p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  /** 设置页那一行。**不许**出现"云同步 / 立即同步"这两个词（cloud_sync_audit ⑦ 段钉着）。 */
  function statusText() {
    const d = diag();
    const last = d.lastSyncAt ? ('上次同步 ' + hhmm(d.lastSyncAt)) : '还没同步过';
    if (d.state === 'ok') return '云端：已连 · ' + last;
    if (d.state === 'idle') return '云端：还没连过 · ' + last;
    /* 双端单活：被顶下线时这一行必须自己说出来 —— 玩家才不会把"本机下线"当成"存档又没同步"。 */
    if (d.state === 'superseded') return '云端：本机已下线（另一台设备在玩）· ' + last;
    const why = WHY_TEXT[d.why] || (d.why || '未知原因');
    const tail = (d.detail && d.state !== 'nocloud') ? ('｜' + d.detail) : '';
    return '云端：未连（' + why + tail + '）· ' + last;
  }
  function toggle() {
    /* V1.1.x（0927-P）：开关**关不掉**了（父亲大人 09-27：「默认开启云同步，关不了」）——
       函数留着只为兼容旧调用点：调它一律报"常开"，不再改任何标志位、也不再关掉联网口子。 */
    boot();
    return { on: true, msg: '云同步：常开（存档一直留一份在微信账号上，静默同步）' };
  }

  /* ---------- 开机：只登记口子，**首帧一次网络都不发** ---------- */
  let armed = false, firstDone = false;
  function boot() {
    if (armed) return;
    const P = prefs();
    if (P.on === false) return;                    // 关着的时候连口子都不挂
    armed = true;
    hookProgress();
    /* F2 · 0930L：开机就落一条"这台设备有没有云能力"（没有就有人知道原因了，不再是一团静默） */
    {
      const miss = cloudAbsent();
      if (miss) logAbsent(miss);
    }
    /* 回到前台 = 新的一次"会话"：**回来就拉**（父亲大人 2026-10-01：
       「你要确保双端的数据是能拉取的，他得**一打开游戏就自动同步**」）——
       不再等玩家先摸一下屏幕。 */
    if (WX && WX.onShow) {
      try { WX.onShow(function () { firstDone = false; triggerAuto('show'); }); } catch (e) {}
    }
    /* ================= 康康 2026-10-01 · **开机就拉**（父亲大人的新口径）=================
       原设计是"**第一次用户交互之后**才联网"（怕首帧自动联网），代价就是：
       玩家打开游戏、看着旧进度干等，直到他碰一下屏幕才去拉云 —— 双端看起来永远不同步。
       现在改成：**开机 300ms 就拉一次**（先让首帧落、再联网），并把 `firstDone` 置上，
       保证**同一次会话只拉一次**；`onShow`（切回前台）也同样立刻拉一次（另一台设备刚推过就该跟上）。
       ⚠️ 触摸那条钩子**留着当兜底**：万一开机那次没跑成（云能力晚到 / 网络刚起来），
          玩家第一次触摸会补拉一次（`firstDone` 为真时不重复）。
       做坏试验：把下面这行删掉 → 一把"开机即拉"的断言（待补）当场红。 */
    /* ⚠️ `firstDone` 必须**在真正开始拉的那一刻**才置真 —— 早置等于把触摸兜底关掉：
       万一这 300ms 里玩家先摸了屏幕（或定时器没跑），那次触摸就成了**唯一**能拉的机会，
       置早了它就 return 掉了 ⇒ 双端还是不同步。（这条是尺子"回到前台第一下要看一次云端"
       抓出来的，不是我自己想到的。） */
    try { unref(setTimeout(function () { firstDone = true; triggerAuto('boot'); }, 300)); }
    catch (e) { firstDone = true; try { triggerAuto('boot'); } catch (e2) {} }
    if (WX && WX.onTouchStart) {
      /* 兜底：万一开机那次没跑成，玩家**第一次触摸**补拉一次（同一次会话只拉一次）。 */
      try {
        WX.onTouchStart(function () {
          if (firstDone) return;
          firstDone = true;
          triggerAuto('first');
        });
      } catch (e) {}
    }
    if (WX && WX.onHide) {
      /* 切后台 = 这一局可能就结束了（微信随时会回收进程）—— **必推**这一次。 */
      try { WX.onHide(function () { triggerAuto('hide'); }); } catch (e) {}
    }
  }

  /* ================= R1.2：dev probe 的**人手入口**（父亲大人 2026-10-01 选的"乙"）=================
     云函数里那个 `{action:'probe'}` 能把写入链**一步一步**跑一遍（读 → set 一个探针字段 →
     再读验证 → 清掉），但它之前**没有门**：只能靠调云函数触发，而"往开发者工具 console 里
     敲一行"这条路我这边打不进去。现在挂上来，**一行就能查**：

         GameGlobal.CloudSync.probe()

     回来的是 `{ok, hasDoc, get, set, verify, clean, stage?, errCode?, errMsg?}` ——
     哪一步炸、什么码，一眼可见（今天那个 `-502001` 就是靠它定的位）。
     ⚠️ 只在**排查时**手动调：它会对**你自己那条云存档**做两次 `set`（探针前 / 探针后各一次），
        别在"两台设备同时正在推档"的时候连着点。它不接入任何正式游戏逻辑。 */
  function probeCloud() {
    return saveFn('probe').then(function (r) {
      try { if (G.LOG && G.LOG.info) G.LOG.info('cloud', 'probe', { ok: !!(r && r.ok), stage: r && r.stage, errCode: r && r.errCode }); } catch (e) {}
      return r;
    });
  }

  G.CloudSync = {
    ENV_ID: ENV_ID, COLL: COLL, CODE_FN: CODE_FN, SAVE_FN: SAVE_FN, PREF_KEY: PREF_KEY,
    boot: boot, triggerAuto: triggerAuto, noteProgress: noteProgress, sync: sync,
    manualPush: manualPush, pullCloud: pullCloud, takeCloudPrev: takeCloudPrev,
    /* 双端单活（父亲大人 10-01：「只有一端能在线……以晚登陆的为主」）：
       `reclaim()` ＝ 那颗「重新登录」；`isSuperseded()` 给尺子与排查读状态。 */
    reclaim: reclaim, isSuperseded: function () { return superseded; },
    makeCode: makeCode, claimCode: claimCode, normCode: normCode,
    wrapExport: wrapExport, checkImport: checkImport, applyExternal: applyExternal,
    applyCloudSave: applyCloudSave, info: info, toggle: toggle,
    /* F2 · 0930L：诊断（设置页那一行 ＋ 尺子读它）。口径一个字没改，只是把静默变可见。 */
    diag: diag, statusText: statusText,
    /* 排查用的人手入口：console 里粘一行 `GameGlobal.CloudSync.probe()` 就能跑云函数那套体检 */
    probe: probeCloud,
    /* V1.1.x（0927-P · 删档先留一手）：把"覆盖前留档"这一个口**正式开出来**给界面用 ——
       就是模块内部一直在用的 `keepLocalBackup`（写 `wxlh_save_v5_bak`，格式与 core 的
       `backupSave` 逐字相同 ⇒ 设置页「找回存档」里那份"本机备份"与
       `Core.restoreFromBackup()` 直接就能取回它）。删档那种最重的操作**不另写一套留档**。 */
    keepBackup: keepLocalBackup,
    /* 尺子用：清掉内存缓存与挂着的计时器（偏好本身留在 localStorage 里，由尺子自己控制） */
    _reset: function () {
      cache = null; inited = false; busy = false; retryTries = 0; armed = false;
      initErr = ''; lastErr = null;          // F2 · 0930L：诊断状态也一起清（尺子要反复试各种岔路）
      absentLogged = false;
      leaseTs = 0; superseded = false; noticeShown = false; noticeAt = 0; leaseToken = '';   // 双端单活：租约状态也一起清
      supersededTs = 0;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }
    },
    _hash: hash, _fp: fpOf, _keepBackup: keepLocalBackup, _currentRaw: currentRaw,
  };
})();
