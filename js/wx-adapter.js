/* 环境适配层：把网页世界缺的东西补齐，让 data/core/battle/dungeon 原样跑在小游戏里。
   ------------------------------------------------------------------------
   ① window：小游戏的全局对象叫 GameGlobal，逻辑层代码里全是 window.X，这里把它指过去
   ② localStorage：core.js 有 6 处读写，改成 wx 的本地存储
   ③ 广告：激励视频 / 插屏的统一封装（含"拉不到广告也要给奖励"的降级）
   ④ 广告位 ID：上线前在「流量主 → 广告位管理」里建好，把下面的占位填成真 ID
*/

(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof globalThis !== 'undefined') ? globalThis : this;
  // wx 在小游戏里一定存在；但为了能在 Node 里跑测试、也不让"环境异常"直接白屏，缺了就退化成内存存储
  const WX = (typeof wx !== 'undefined') ? wx : null;

  /* ---------- ① window ---------- */
  if (!G.window) G.window = G;

  /* ---------- ② localStorage（wx 本地存储，单 key 上限 1MB，我们的存档只有几十 KB） ---------- */
  const mem = {};
  function safeGet(k) {
    if (!WX || !WX.getStorageSync) return (k in mem ? mem[k] : null);
    try { const v = WX.getStorageSync(k); return (v === '' || v === undefined) ? null : v; } catch (e) { return null; }
  }
  function safeSet(k, v) {
    if (!WX || !WX.setStorageSync) { mem[k] = v; return true; }
    try { WX.setStorageSync(k, v); return true; } catch (e) { return false; }
  }
  function safeDel(k) {
    if (!WX || !WX.removeStorageSync) { delete mem[k]; return true; }
    try { WX.removeStorageSync(k); return true; } catch (e) { return false; }
  }
  if (!G.localStorage) {
    G.localStorage = {
      getItem: safeGet,
      setItem: (k, v) => safeSet(k, String(v)),
      removeItem: safeDel,
      // 存档列表 / 调试用
      keys: () => { if (!WX || !WX.getStorageInfoSync) return Object.keys(mem); try { return WX.getStorageInfoSync().keys || []; } catch (e) { return []; } },
    };
  }

  /* ---------- ③ 广告位 ID（**B1：全模块只有这一处要改**） ----------
     流量主资质下来之后，把 `rewarded` 换成「流量主 → 广告位管理」里的真 ID（形如 `adunit-1a2b3c4d5e6f7g8h`）——
     改完之后 `CAN_USE_AD` 自动变 true，**全站各点位从"演练期直接发奖"切到"真拉广告"**，界面一个字都不用动。
     现在**仍是占位**（资质未下）：父亲大人 2026-09-26 的口径是
     「看广告的按钮和位置先留出来，**前期可以点了直接发奖励**，后面等我们资质过了，我们再把广告的链接填进去」。 */
  const AD_UNITS = {
    // 激励视频：一个"广告位"可以被多个点位复用；也可以按点位各建一个，便于看后台数据
    /* V1.1.15（2026-09-27 · 父亲大人流量主资质通过）：**真 ID 已接入**。
       形如 `adunit-` ＋ 16 位十六进制。改完 `CAN_USE_AD` 自动变 true ⇒ 全站"看广告"点位
       从"演练期直接发奖"切成"**真拉广告、看完才发奖**"；拉不到时走既有的补偿口径（≤10/天）。 */
    rewarded: 'adunit-c8a67014af0e50ee',
    // 插屏（本轮不接，保持占位）
    interstitial: 'adunit-yyyyyyyyyyyyyyyy',
  };
  // 找不到广告或没有真 ID 时，整个模块进入"演练模式"：奖励照给，只是没有广告
  const CAN_USE_AD = !!(WX && WX.createRewardedVideoAd) && AD_UNITS.rewarded.indexOf('xxxx') < 0;

  /* ---------- ④ 每个点位的每日次数（跳过日期重置、防改时间） ---------- */
  const QUOTA_KEY = 'wxlh_ad_quota';
  /* ================= V1.1.8（甲组 B2/B3 · 终版口径 §3.1 第 2/3 步）=================
     B3 · **终版次数**（全是他拍的）：挂机 3/天 · 扫荡 3/天 · 高级池 10/天 · 签到 1/天 · 复活 **每场 1 次**。
         —— 这张表里**只留这一轮真正接了点位的槽**：老的 `pre_buff / holy_pack / otherworld_pack /
            free_recruit / offline_double` 五项**没有入口**（本轮不接），留在表里只会让下一个人以为"有那功能"。
     B2 · **总闸 20/天**：只算**资源点位**（挂机加速 / 扫荡 / 高级池 / 签到 / 复活）；
         **不算**"离线翻倍"（他不限次数）与"倍速 ×5"（纯时间权益、不给资源）。
     ⚠️ B2 的"演练期分支"：**没有真广告可拉时不吃 comp** ——
        comp（补偿）只在"广告**已经上线**了、但这一次拉不到"时用，上限 10/天；
        演练期（资质未下）点了**直接发奖**，既不占 comp、也照常记次数（不然"一天几次"的口径就假了）。 */
  const AD_TOTAL_CAP = 20;          // 资源点位总闸 / 天
  const AD_COMP_CAP = 10;           // 补偿上限 / 天（只在真广告拉不到时用）
  const FREE_SLOTS = ['offline_double', 'speed_x5'];   // 不计总闸、不限次数（时间权益 / 无资源）
  const LIMITS = {
    idle_boost: 3,       // B5 挂机加速 2 小时 · 3 次/天
    sweep_plus: 3,       // B6 扫荡 +10 次（全额）· 3 次/天
    recruit_adv: 10,     // B7 高级池免费 1 抽 · 10 次/天
    login_double: 1,     // B8 签到全双倍 · 1 次/天
    revive: 1,           // B10 战斗复活 · **每场 1 次**（配额由战斗页按场记，见 show 的 perBattle）
  };
  function today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  /* ================= V1.1.12（父亲大人 09-27：「**广告次数一起加密**」）=================
     为什么：配额（今天各点位用了几次 / 补偿用了几次 / 总闸）原来是一段**明文 JSON** 存在本地存档里
     —— 内存挂工具查不到它（它是存储不是堆），但**改存档就能白嫖**：把 `used` 清零、或者把 `date`
     改成明天，当天次数当场重置。
     ⇒ 现在三件事一起做：
       ① **数字全部走内存加固那套 encode/decode**（`mem-guard.js` 挂的 `__MP_ENCODE/__MP_DECODE`，
          与货币/等级**同一套比特级双射**）——存档里躺的是密文；
       ② 存一个**签名**（对 date＋各项计数算的编码值）：**日期被人改过就对不上** → 判为被动过；
       ③ 被动过怎么办：**当天按"已用完"处理**（不是清零 —— 清零等于奖励改档的人）。
       ⚠️ 老档（没有 `v` 字段）当**明文**读一次，随即写成 v2 —— 不追溯、不误伤。
       ⚠️ 没有 mem-guard 时（网页版 / 尺子的假环境）encode/decode 退化成恒等函数，行为与从前一致。 */
  const QV = 2;
  const encN = (v) => { const e = G.__MP_ENCODE; const n = Number(v) || 0; return (typeof e === 'function') ? e(n) : n; };
  const decN = (v) => {
    const d = G.__MP_DECODE; const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    const r = (typeof d === 'function') ? d(n) : n;
    return (Number.isFinite(r) && r >= 0 && r < 1e9) ? Math.floor(r) : 0;
  };
  function quotaSig(date, used, comp, total) {
    const s = date + '|' + Object.keys(used).sort().map((k) => k + '=' + used[k]).join(',') + '|' + comp + '|' + total;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 100000;
  }
  function quotaLoad() {
    const raw = safeGet(QUOTA_KEY);
    let q = null;
    try { q = raw ? JSON.parse(raw) : null; } catch (e) { q = null; }
    if (!q) return { date: today(), used: {}, comp: 0, total: 0, v: QV };
    const enc = q.v >= QV;
    const used = {};
    Object.keys(q.used || {}).forEach((k) => { used[k] = enc ? decN(q.used[k]) : (Number(q.used[k]) || 0); });
    const comp = enc ? decN(q.comp) : (Number(q.comp) || 0);
    const total = enc ? decN(q.total) : (Number(q.total) || 0);
    /* ⚠️ 顺序很重要（V1.1.12 第一版写反了，探针当场抓到"改日期照样白嫖"）：
       **先验签、再判跨天** —— 因为签名里含 date，改日期会先把签名弄坏；
       反过来先判 `date !== today()` 的话，改日期直接走"正常跨天重置"，等于给改档的人发福利。 */
    if (enc && decN(q.sig) !== quotaSig(q.date, used, comp, total)) {
      /* 日期或计数被改过 → **当天按已用完**（不奖励改档的人），并且把口径写成密文 */
      const blocked = {};
      Object.keys(LIMITS).forEach((k) => { blocked[k] = LIMITS[k]; });
      const out = { date: today(), used: blocked, comp: AD_COMP_CAP, total: AD_TOTAL_CAP, v: QV };
      quotaSave(out);
      return out;
    }
    if (q.date !== today()) return { date: today(), used: {}, comp: 0, total: 0, v: QV };   // 跨天：正常重置
    return { date: q.date, used, comp, total, v: QV };
  }
  function quotaSave(q) {
    const used = {};
    Object.keys(q.used || {}).forEach((k) => { used[k] = q.used[k]; });
    const out = { date: q.date, v: QV, used: {}, comp: encN(q.comp), total: encN(q.total) };
    Object.keys(used).forEach((k) => { out.used[k] = encN(used[k]); });
    out.sig = encN(quotaSig(q.date, used, q.comp, q.total));
    safeSet(QUOTA_KEY, JSON.stringify(out));
  }
  function quotaLeft(slot) { const q = quotaLoad(); return Math.max(0, (LIMITS[slot] || 0) - (q.used[slot] || 0)); }
  function totalLeft() { const q = quotaLoad(); return Math.max(0, AD_TOTAL_CAP - (q.total || 0)); }
  /* 记一次"用掉了"：日配额（复活按场记，不占日配额）＋ 总闸（时间权益两类不占） */
  function quotaUse(slot, perBattle) {
    const q = quotaLoad();
    if (!perBattle) q.used[slot] = (q.used[slot] || 0) + 1;
    if (FREE_SLOTS.indexOf(slot) < 0) q.total = (q.total || 0) + 1;
    quotaSave(q);
  }

  /* ---------- 激励视频封装 ---------- */
  let rewardedAd = null;
  /* V1.1.15（2026-09-27 · 父亲大人实测"看一次扣了两回次数"）：
     `wx.createRewardedVideoAd` 返回的是**单例**，而 `onClose` 是**累加注册**的 ——
     原来的写法每次点"看广告"都往这个单例上再挂一个回调。
     于是"先取消一次（挂 A）、再看完一次（挂 B）"⇒ **看完时 A 和 B 同时触发**，
     `quotaUse` 被调用两次 ⇒ 3 次变 1 次（他看到的正是这个）。
     修法：**onClose 只在创建时注册一次**，用 `pendingReward` 指向"当前这一次请求"；
     回调里取走并清空它，天然幂等（谁先到谁处理，第二个直接 return）。 */
  let pendingReward = null;
  function getRewarded() {
    if (!CAN_USE_AD) return null;
    if (rewardedAd) return rewardedAd;
    rewardedAd = WX.createRewardedVideoAd({ adUnitId: AD_UNITS.rewarded });
    // 拉取失败时下一次 show 会自动重试；这里只记录，不影响流程
    rewardedAd.onError(() => {});
    rewardedAd.onClose(res => {
      const p = pendingReward;
      pendingReward = null;                       // ← 取走即清空：同一次请求只结算一次
      if (!p) return;
      if (res && res.isEnded) { quotaUse(p.slot, p.perBattle); p.done({ granted: true, reason: 'ok' }); }
      else p.done({ granted: false, reason: 'skipped' });   // 半途关掉 = 不给奖励（行业惯例）
    });
    return rewardedAd;
  }
  /* show(slot, opts) → Promise<{ granted, reason }>
     约定（三条，缺一条都不算落）：
       ① **演练期（没有真 ID / 没广告 API）→ 直接发奖，不吃 comp**；
       ② 真广告期拉不到 → 走补偿（comp ≤ 10/天）——"玩家不该为空广告买单"这条不变；
       ③ **资源点位总闸 20/天**（`FREE_SLOTS` 两类不计）。
       ④ **不限次数的两类点位（`offline_double` / `speed_x5`）拉不到就"只报拉不到"**，
          不走补偿、也不吃 comp —— 见下面 `grantCompensated` 的说明。
     opts.perBattle：复活专用 —— 它的配额是"每场 1 次"，由战斗页自己记（这里不查/不记日配额）。 */
  function showRewarded(slot, opts) {
    opts = opts || {};
    const perBattle = !!opts.perBattle;
    /* "不限次数"的点位（离线翻倍 / 倍速 ×5）**连日配额都不查** ——
       它们的表里本来就没有 LIMITS 项，若照查就会 `max(0, 0-0)=0` 被当成"没次数了"永远点不动
       （探针实测踩到过一次：离线翻倍返回 quota）。 */
    const unlimited = FREE_SLOTS.indexOf(slot) >= 0;
    return new Promise(resolve => {
      if (!perBattle && !unlimited && quotaLeft(slot) <= 0) { resolve({ granted: false, reason: 'quota' }); return; }
      if (!unlimited && totalLeft() <= 0) { resolve({ granted: false, reason: 'total' }); return; }
      /* ① 演练期：直接发（父亲大人的口径："前期可以点了直接发奖励"） */
      if (!CAN_USE_AD) { quotaUse(slot, perBattle); resolve({ granted: true, reason: 'drill' }); return; }
      const ad = getRewarded();
      if (!ad) { resolve(grantCompensated(slot, 'no_ad', perBattle)); return; }
      let settled = false;
      const done = r => {
        if (settled) return; settled = true;
        if (pendingReward && pendingReward.slot === slot && pendingReward.perBattle === perBattle) pendingReward = null;
        resolve(r);
      };
      /* 每次请求只挂**一个待结算**（回调是单例上那一个，见 getRewarded 的说明） */
      pendingReward = { slot, perBattle, done };
      ad.show().catch(() => ad.load().then(() => ad.show()).catch(() => done(grantCompensated(slot, 'load_fail', perBattle))));
    });
  }
  /* 真广告拉不到时的补偿：照给奖励，但每天最多 `AD_COMP_CAP` 次，防止有人拔网线白刷。
     ⚠️ 与演练期那条**分开**：演练期走上面的 `!CAN_USE_AD` 分支，一次 comp 都不吃。 */
  /* ================= V1.1.17（2026-09-27 · 父亲大人：「**弱网拉不到广告时不给双倍**」）=====
     为什么只排除"不限次数"这两类：补偿那套的存在理由是"**玩家不该为空广告买单**"——
     资源点位（挂机加速 / 扫荡 / 高级池 / 签到 / 复活）**每一条都有日配额或每场配额**，
     广告拉不起来时玩家是**真丢了一次机会**，所以照给一次、记在 comp（≤10/天）里。
     `offline_double`（收益 ×2）与 `speed_x5`（倍速 ×5）**没有配额可丢**：拉不到就"稍后再试"，
     玩家一分钱没损失；照给反而是**白送**（拔网线刷双倍 / 刷倍速）。
     ⇒ 这两类拉不到时**原样返回 `{granted:false, reason:'no_ad'|'load_fail'}`**，
       既不发奖、也不吃 comp。原额照旧能领（双倍那颗按钮下面就是「领取」）。 */
  const NO_COMP_SLOTS = FREE_SLOTS;
  function grantCompensated(slot, why, perBattle) {
    if (NO_COMP_SLOTS.indexOf(slot) >= 0) return { granted: false, reason: why };
    const q = quotaLoad();
    if (q.comp >= AD_COMP_CAP) return { granted: false, reason: 'no_ad_nocomp' };
    q.comp++;
    quotaSave(q);
    quotaUse(slot, perBattle);
    return { granted: true, reason: 'compensated_' + why };
  }

  /* ---------- 插屏（按节奏弹，别贪） ---------- */
  let interAd = null, lastInter = 0, stageCounter = 0;
  function maybeInterstitial(force) {
    if (!WX || !WX.createInterstitialAd || AD_UNITS.interstitial.indexOf('yyyy') < 0) return;
    stageCounter++;
    const now = Date.now();
    const ok = force ? (now - lastInter > 60000) : (stageCounter % 3 === 0 && now - lastInter > 60000);
    if (!ok) return;
    if (!interAd) {
      interAd = WX.createInterstitialAd({ adUnitId: AD_UNITS.interstitial });
      interAd.onError(() => {});
    }
    lastInter = now;
    interAd.show().catch(() => {});
  }

  /* ---------- 对外接口 ---------- */
  G.AD = {
    enabled: CAN_USE_AD,
    /* 演练期（资质未下）＝ true：界面照旧画那一颗，点了**直接发奖**。
       界面**不做分支**（父亲大人要的是"按钮和位置先留出来"），只把这一位留给调试面板看。 */
    drill: !CAN_USE_AD,
    units: AD_UNITS,
    limits: LIMITS,
    left: quotaLeft,
    totalLeft: totalLeft,
    totalCap: AD_TOTAL_CAP,
    compCap: AD_COMP_CAP,
    compLeft: () => Math.max(0, AD_COMP_CAP - quotaLoad().comp),   // 调试/尺子用（补偿还剩几次）
    show: showRewarded,
    interstitial: maybeInterstitial,
    // 调试面板用
    _today: today,
  };

  /* ================= V1.1.19（2026-09-27 · 父亲大人：「有没有游戏进行时防止熄屏的，
     现在玩着玩着手机就黑屏了」）=================
     微信给的那一条 API 就是 `wx.setKeepScreenOn`（基础库 2.0.6 起）：
       · **只在当前小游戏生效，离开之后设置失效** ⇒ ① 开机调一次；② 每次回到前台再补一次
         （切后台回来会失效，看广告那一下也算切后台）；
       · 老基础库 / 开发者工具里可能**没有这个函数** ⇒ 静默跳过，**绝不能因此崩**
         （这条 API 只影响"屏幕亮不亮"，不值得为它冒开机的险）。
     为什么常亮而不是只在战斗里亮：这是放置类，玩家大半时间停在灯阁看挂机数字、
     等游历奇遇，那正是他要"别黑屏"的场景。**代价照实说**：屏幕常亮会更费电
     （后续真要省电，再加一个设置开关，别在这里偷偷按场景挑）。 */
  function keepScreenOn() {
    try {
      if (!WX || typeof WX.setKeepScreenOn !== 'function') return false;
      WX.setKeepScreenOn({ keepScreenOn: true, fail: function () {} });
      return true;
    } catch (e) { return false; }
  }
  G.keepScreenOn = keepScreenOn;

  /* ---------- ⑤ 分享（V1.0.3）----------
     小游戏的"转发"默认是**关着**的：不调 showShareMenu 右上角就没有转发入口，
     也没有任何报错 —— 2026-09-26 父亲大人问"为什么不能分享"就是这么来的。
     卡图先不指定（微信默认截当前画面），要专门 5:4 卡图时在这里补 imageUrl。 */
  const SHARE_TITLE = '一个人做的修仙放置小游戏 · 来灯阁当执灯者';
  if (WX && WX.showShareMenu) {
    try { WX.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }); } catch (e) {}
  }
  if (WX && WX.onShareAppMessage) {
    WX.onShareAppMessage(() => ({ title: SHARE_TITLE }));
  }
  if (WX && WX.onShareTimeline) {
    WX.onShareTimeline(() => ({ title: SHARE_TITLE }));
  }
})();
