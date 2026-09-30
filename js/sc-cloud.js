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

   钥匙是**微信账号**：客户端 SDK 读写自己的记录会自动带 `_openid`、默认只能读写自己那条
   —— 不用云函数也不用养 token。账号指纹（导出档里那个 `fp`）是 `_openid` 的哈希，
   **openid 本体不落盘、不出档**。
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
  const LOG = G.LOG || null;
  function clog(action, data) { try { if (LOG) LOG.info('cloud', action, data || {}); } catch (e) {} }

  /* ---------- 环境与集合（**环境 ID 只有这一处**） ---------- */
  const ENV_ID = 'cloudbase-d0gk9s3sv8a797189';
  const COLL = 'saves';
  const CODE_FN = 'savecode';
  const PREF_KEY = 'wxlh_cloud_v1';          // 云同步自己的偏好/账本（**不进玩家存档**，不碰 packSave 的口径）
  const SAVE_KEY = 'wxlh_save_v5';           // 与 core 同一把钥匙（**只读它、只往 _bak 里写留档**）
  const SAVE_BAK = SAVE_KEY + '_bak';
  const PUSH_CAP_PER_DAY = 20;               // 每天推送记账上限（防异常刷）
  const MERGE_MS = 60 * 1000;                // 打关/结算后的推送：同一分钟内合并成一次
  const RETRY_WAIT = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000];

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
  function actBlock() {
    const C0 = G.Core;
    if (!C0 || typeof C0.actSnapshot !== 'function') return null;
    try {
      const s = C0.actSnapshot() || {};
      const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
      return {
        loginDays: n(s.loginDays), playMinutes: n(s.playMinutes), clears: n(s.clears),
        /* V1.0.4 · X（订阅消息）：云端 `notify` 判据只认这几个 —— 全是数字、不含身份信息。
           `bankSec` 是"银行里攒了多久"（推给玩家那句「挂机时长」用它，不是"满了之后过了多久"）。 */
        subMsg: n(s.subMsg), bankFullAt: n(s.bankFullAt), bankAmount: n(s.bankAmount), bankSec: n(s.bankSec),
        at: Date.now(),
      };
    } catch (e) { return null; }
  }

  /* ---------- 云开发（客户端 SDK；没有云能力就是"这台设备同步不了"，不影响本机存档） ---------- */
  let inited = false;
  function cloud() {
    if (!WX || !WX.cloud) return null;
    if (!inited) {
      try { WX.cloud.init({ env: ENV_ID, traceUser: true }); } catch (e) { return null; }
      inited = true;
    }
    return WX.cloud;
  }
  function db() {
    const c = cloud();
    if (!c) return null;
    try { return c.database(); } catch (e) { return null; }
  }
  /** 一条查询走一遍（同步抛错与异步 reject 都收成同一种结果）。 */
  function query(make) {
    return new Promise(function (resolve) {
      let req = null;
      try { req = make(); }
      catch (e) { resolve({ ok: false, why: 'sdk', err: (e && e.message) || '调用失败' }); return; }
      Promise.resolve(req).then(function (res) {
        resolve({ ok: true, list: (res && res.data) || [] });
      }).catch(function (e) {
        resolve({ ok: false, why: 'net', err: (e && (e.errMsg || e.message)) || '未知错误' });
      });
    });
  }
  /** 读"自己那条"。默认权限（仅创建者可读写）下查回来的就是自己那条；
      万一集合权限被设成"所有人可读"，这里**也绝不乱挑一条** —— 见下面 myDoc 的守卫。
      ⚠️ 空条件 `where({})` 在某些基础库上会被判"参数不合法"—— 真被拒了就退到不带条件那条。 */
  function readRaw() {
    const d = db();
    if (!d) return Promise.resolve({ ok: false, why: 'unsupported' });
    return query(function () {
      const col = d.collection(COLL);
      return (typeof col.where === 'function') ? col.where({}).get() : col.get();
    }).then(function (r) {
      if (r.ok) return r;
      return query(function () { return d.collection(COLL).get(); });
    });
  }
  /** 挑出"我这个账号"的那一条，并顺手把账号指纹学下来（默认权限只回自己那条；
      真出现多条 → 判为权限配置有问题，停下来报错，不猜）。 */
  function myDoc(list) {
    const P = prefs();
    if (!P.accountId) {
      if (list.length > 1) return { ok: false, why: 'multi' };
      if (list.length === 1) {
        P.accountId = fpOf(list[0] && list[0]._openid);
        if (P.accountId) savePrefs();
      }
      return { ok: true, doc: list[0] || null };
    }
    /* 同一个账号理论上一台设备一条；真留下两条（两台设备同时首推那种极端情况），
       按存档时间戳取**最新那条**（只认自己账号的，别人的一条都不碰）。 */
    const mine = list.filter(function (d) { return fpOf(d && d._openid) === P.accountId; });
    if (!mine.length) return { ok: true, doc: null };
    mine.sort(function (a, b) { return (Number(b.ts) || 0) - (Number(a.ts) || 0); });
    return { ok: true, doc: mine[0] };
  }
  function readOwn() {
    return readRaw().then(function (r) {
      if (!r.ok) return r;
      const m = myDoc(r.list);
      if (!m.ok) return { ok: false, why: m.why };
      const P = prefs(), doc = m.doc || null;
      /* 顺手记住"云端那条里有没有更旧的备份"——设置页那行字（与一键取回）就看它。 */
      P.prevAt = doc ? (Number(doc.prevAt) || 0) : 0;
      P.prevTs = doc ? (Number(doc.prevTs) || 0) : 0;
      P.prevBytes = doc ? (Number(doc.prevBytes) || 0) : 0;
      savePrefs();
      return { ok: true, doc: doc };
    });
  }
  /** 写：有那条就 update、没有就 add（**合并写**：不管本地改了几处，写上去的都是当时那一整份）。 */
  function writeDoc(doc, data) {
    return new Promise(function (resolve) {
      const d = db();
      if (!d) { resolve({ ok: false, why: 'unsupported' }); return; }
      let req = null;
      try {
        if (doc && doc._id) req = d.collection(COLL).doc(doc._id).update({ data: data });
        else req = d.collection(COLL).add({ data: data });
      } catch (e) { resolve({ ok: false, why: 'sdk' }); return; }
      Promise.resolve(req).then(function () { resolve({ ok: true }); })
        .catch(function (e) { resolve({ ok: false, why: 'net', err: (e && (e.errMsg || e.message)) || '未知错误' }); });
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
        resolve({ ok: false, why: 'net', err: (e && (e.errMsg || e.message)) || '未知错误' });
      });
    });
  }

  const NET_MSG = function (r) {
    if (r && r.why === 'unsupported') return '这台设备没有云开发能力，存档只在本机';
    if (r && r.why === 'multi') return '云端这份存档读不出来（云端的配置有问题），先照本机这份玩，稍后再试。';
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
    const raw = currentRaw();
    if (!raw) return Promise.resolve({ ok: false, skip: 'nodata' });
    const h = hash(raw);
    /* 脏标记对**所有**入口一视同仁：本机这份跟云上那份一模一样就不传（手动那颗也省着来，
       页面会说一句"本机和云端已经一样了"）。`reason` 留着只为将来区分口径用。 */
    if (h === P.lastPushHash) return Promise.resolve({ ok: true, skip: 'clean' });
    if (P.pushes >= PUSH_CAP_PER_DAY) return Promise.resolve({ ok: false, skip: 'cap' });
    /* V1.1.20（F1-1）：这一条记录的 `ts`（对面那台设备比新旧的唯一依据）＝ **这份档自己**的
       `savedAt`（玩家最后一次真在玩的时刻）。整条链（本地判据 / 推上去的 ts / prev* 的 ts）同一个口径。 */
    const data = { payload: raw, ts: localTs() || Date.now(), bytes: raw.length, ver: String(G.GAME_VER || ''), at: Date.now() };
    const act = actBlock();
    if (act) data.act = act;                            // V1.0.4 · W：只加这一小块数字（见上）
    if (doc && doc.payload && String(doc.payload) !== raw) {
      /* 云端被本地覆盖 → **旧云端另留一份**（同一条记录里的 `prev*` 栏，设置页能取回）。 */
      data.prevPayload = String(doc.payload);
      data.prevTs = Number(doc.ts) || 0;
      data.prevBytes = String(doc.payload).length;
      data.prevAt = Date.now();
    }
    return writeDoc(doc, data).then(function (w) {
      if (!w.ok) { clog('push_fail', { bytes: raw.length, why: String(w.why || '') }); return { ok: false, skip: 'fail', why: w.why, msg: NET_MSG(w) }; }
      P.pushes++;
      P.lastPushHash = h;
      P.lastPushAt = Date.now();
      P.lastSyncAt = P.lastPushAt;
      if (data.prevPayload) { P.prevAt = data.prevAt; P.prevTs = data.prevTs; P.prevBytes = data.prevBytes; }
      savePrefs();
      clog('push_ok', { bytes: raw.length, ts: data.ts, n: P.pushes });
      return { ok: true, pushed: true, bytes: raw.length, ts: data.ts, prev: !!data.prevPayload };
    });
  }

  /* ---------- 静默结算（**唯一的一处收口**：读一次云端 → 谁新听谁的） ---------- */
 let busy = false, retryTimer = null, retryTries = 0, progressTimer = null;
  function sync(reason) {
    const P = rollDay();
    if (!P.on) return Promise.resolve({ ok: false, skip: 'off' });
    if (!WX || !WX.cloud) return Promise.resolve({ ok: false, skip: 'unsupported' });
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
    }).then(function (r) {
      busy = false;
      /* 一次静默结算的最后取值（R1）：local ＝ 本地新推上去 / cloud ＝ 云端新换下来 /
         none ＝ 两边一样 / fallback ＝ 云端那份读不出来、改推本地 / fail ＝ 没通 */
      clog(r && r.ok ? 'sync' : 'sync_fail', {
        from: String((r && (r.took || r.skip)) || '?'), bytes: (r && r.bytes) || 0, ok: !!(r && r.ok),
      });
      if (r && r.ok) { retryTries = 0; if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } }
      else if (r && r.skip === 'fail') scheduleRetry();
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
    return sync(mode);
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
    /* 回到前台 = 新的一次"会话"：把"这一轮还没看云端"重置掉（玩家切出去看了别人的进度、
       或者另一台设备刚推过，回来第一下就该跟上）。 */
    if (WX && WX.onShow) {
      try { WX.onShow(function () { firstDone = false; }); } catch (e) {}
    }
    if (WX && WX.onTouchStart) {
      /* **第一次用户交互之后**才允许联网（微信不喜欢首帧自动联网，和自动播同一个道理）。
         ⚠️ 一次会话只结算这一下（不是每个触摸都联网）—— 第一版按"6 小时冷却"写，
            结果"上午在手机打了一关、中午回电脑"在冷却窗口里看不到新进度；父亲大人的口径是
            **推档要跟上进度**，读一次云端本来也便宜，所以改成"回前台后的第一下 ⇒ 看一次"。
            boot() 之前已经有过交互也不算：`firstDone` 从这里开始算。 */
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

  G.CloudSync = {
    ENV_ID: ENV_ID, COLL: COLL, CODE_FN: CODE_FN, PREF_KEY: PREF_KEY,
    boot: boot, triggerAuto: triggerAuto, noteProgress: noteProgress, sync: sync,
    manualPush: manualPush, pullCloud: pullCloud, takeCloudPrev: takeCloudPrev,
    makeCode: makeCode, claimCode: claimCode, normCode: normCode,
    wrapExport: wrapExport, checkImport: checkImport, applyExternal: applyExternal,
    applyCloudSave: applyCloudSave, info: info, toggle: toggle,
    /* V1.1.x（0927-P · 删档先留一手）：把"覆盖前留档"这一个口**正式开出来**给界面用 ——
       就是模块内部一直在用的 `keepLocalBackup`（写 `wxlh_save_v5_bak`，格式与 core 的
       `backupSave` 逐字相同 ⇒ 设置页「找回存档」里那份"本机备份"与
       `Core.restoreFromBackup()` 直接就能取回它）。删档那种最重的操作**不另写一套留档**。 */
    keepBackup: keepLocalBackup,
    /* 尺子用：清掉内存缓存与挂着的计时器（偏好本身留在 localStorage 里，由尺子自己控制） */
    _reset: function () {
      cache = null; inited = false; busy = false; retryTries = 0; armed = false;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }
    },
    _hash: hash, _fp: fpOf, _keepBackup: keepLocalBackup, _currentRaw: currentRaw,
  };
})();
