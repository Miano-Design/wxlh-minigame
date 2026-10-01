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
      /* ================= V1.1.20（F1-3 · 严重）：**写盘失败必须抛** =================
         原来这里只把 safeSet 的 false 原样返回，而调用方（core.js 的 save()、
         backupSave()、saveSlot() …）只认"**抛异常**"这一种失败 —— 于是存储写不进去时
         既不抛、也没人看返回值：`core.save()` 的 catch 和那句"提示一次"是**死代码**，
         玩家打完一整局以为存上了（配额/存档槽同一条路一起静默丢）。
         现在按"真 localStorage 的规矩"抛出来（浏览器配额满时也是抛 QuotaExceededError），
         调用方的 catch 与提示就都活了；同时**保留返回值语义**（真的返回 false 时，
         消费方也认 —— 尺子/网页垫片那种只返回布尔的实现照样能判失败）。 */
      setItem: (k, v) => { if (!safeSet(k, String(v))) throw new Error('localStorage.setItem 失败：' + k); },
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
  /* ================= 2026-10-01（父亲大人拍板）· **全局总闸不限次数** =================
     原话：「**全局广告总闸不限次数**」。
     背景就是他实测到的那条 bug：扫荡那颗按钮显示"今日还剩 1 次"，点下去却回
     「今天看广告的次数用完了」—— 因为**点位配额还有、全局 20 次已经用完**。
     这一刀从根上解决：**全局不再设上限**（`totalLeft()` 恒为 Infinity，
     `showRewarded` 不再查它）。于是"按钮上写几次"＝"真实还能看几次"，
     UI 与判定不可能再对不上。
     · `AD_TOTAL_CAP` 这个数**留着**（只作为统计/调试参考，`AD.totalCap` 仍可读）；
     · 点位自己的每日配额（挂机 3 / 扫荡 3 / 高级池 10 / 签到 1 / 复活每场 1）**一个没动** ——
       那是玩法节奏，不是防刷闸；时间权益类（离线翻倍 / 倍速 ×5）本来就不计总闸。 */
  const AD_TOTAL_UNLIMITED = true;
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
  let qMirror = null;      // V1.1.20（F1-3）：本次会话刚写下的那份配额（写盘失败时靠它兜底）
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
    /* V1.1.20（F1-3）：**刚写过的那一份优先**（见 quotaSave 的 qMirror）——
       写盘失败时也不会把"今天用过的次数"还回去。跨天就自然失效（date 对不上）。 */
    if (qMirror && qMirror.date === today()) {
      const m = {};
      Object.keys(qMirror.used || {}).forEach((k) => { m[k] = decN(qMirror.used[k]); });
      return { date: qMirror.date, used: m, comp: decN(qMirror.comp), total: decN(qMirror.total), v: QV };
    }
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
    /* ================= V1.1.20（F1-3）：配额写盘失败也要**有人接** =================
       原来 `safeSet(...)` 的返回值直接丢掉：写不进去 ⇒ 下一次 quotaLoad 读回来的还是旧值
       ⇒ 次数"用不完"（拔网线刷奖励那一类）。现在两件事：
         ① 留一份**本次会话的内存镜像**（qMirror）—— 磁盘没写上，这一次会话也照它算；
         ② 打一条日志（配额是防作弊用的，写不上必须让人看见）。 */
    const ok = safeSet(QUOTA_KEY, JSON.stringify(out));
    qMirror = out;
    if (!ok) {
      try { if (G.LOG) G.LOG.warn('ad', 'quota_write_fail', { date: String(out.date || '') }); } catch (e) {}
      try { console.warn('[ad] 广告配额没写进存储：本次会话按内存里的记账继续（重启会丢）'); } catch (e) {}
    }
    return ok;
  }
  function quotaLeft(slot) { const q = quotaLoad(); return Math.max(0, (LIMITS[slot] || 0) - (q.used[slot] || 0)); }
  function totalLeft() {
    if (AD_TOTAL_UNLIMITED) return Infinity;
    const q = quotaLoad(); return Math.max(0, AD_TOTAL_CAP - (q.total || 0));
  }
  /* 记一次"用掉了"：日配额（复活按场记，不占日配额）＋ 总闸（时间权益两类不占） */
  function quotaUse(slot, perBattle) {
    const q = quotaLoad();
    if (!perBattle) q.used[slot] = (q.used[slot] || 0) + 1;
    if (FREE_SLOTS.indexOf(slot) < 0) q.total = (q.total || 0) + 1;
    quotaSave(q);
  }
  /* ================= V1.1.21（2026-09-28 · F7 的 GM 面板「清 CD」留的接口）=================
     广告配额（各点位次数 / 补偿 / 总闸）存在本地且带**签名防改档**，所以只有这里能"把今天清零"。
     ⚠️ 调用方是 **GM 面板**，而 GM 面板在 `js/sc-last.js` 里有一道**环境门**：
     `envVersion` 是 `develop` / `trial` 才开、**正式版（release）永远关** ——
     所以这个函数**不构成对玩家的口子**（正式版里没有任何入口能调到它）。
     语义：把记账重置成"今天、什么都还没用过"（＝与跨天重置同一条路，签名照常写）。 */
  function quotaReset() {
    const fresh = { date: today(), used: {}, comp: 0, total: 0, v: QV };
    quotaSave(fresh);
    try { if (G.LOG) G.LOG.info('ad', 'quota_reset', { date: fresh.date }); } catch (e) {}
    return true;
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
  /* ================= V1.1.20（F1-4 · 严重）：**"点了没回执"＋"连点两下"都要堵住** =================
     现状（代码级已证）：`ad.show()` 既不 resolve 也不 reject 时（拉不起来 / onError 先到），
     `done` 永远不被调用 ⇒ 页面停在 awaiting 态，玩家看到的就是"点了没反应"；
     而 `pendingReward` 是**单槽**，连点两下时第二次会把第一次覆盖 ⇒ 第一条 Promise 永不 settle。
     两条一起修：
       ① `rewardBusy` 闸：一次只允许一条请求在飞，第二次点击当场回 `{granted:false, reason:'busy'}`；
       ② **硬超时 9 秒**：到点走**既有**的补偿分支（真广告拉不到本来就有这条路，口径不改），
          并且只在"`pendingReward` 还是自己"时才清它（不会顺手把别人的请求清掉）。
     ⚠️ 超时/失败之后那条晚到的 onClose 会看到 `pendingReward` 已被取走 → 直接 return，
        不会重复发奖（这是"取走即清空"那条既有纪律在兜底）。 */
  const REWARD_TIMEOUT_MS = 9000;
  /* ================= 康康 2026-09-29（父亲大人："看完广告游戏就结束了"）=================
     ⚠️ 上面那个 9 秒是给"**广告拉不起来**"用的（`ad.show()` 既不 resolve 也不 reject 时不让玩家白等），
        可激励视频正常要放 **15~30 秒** —— 原来它不分青红皂白一路挂着：
        广告还在放，9 秒一到就被判成"拉不到" ⇒ `done()` ⇒ **把游戏当场恢复** ⇒
        战斗在广告后面继续打完、x5 倒计时也没了（玩家回到画面时战斗早结束）。
        现在**广告一旦真的开演**（`ad.show()` resolve），就把那个 9 秒换成下面这个**长兜底**：
        只防"广告既不关也不回调"这种卡死（正常永远不触发），奖励仍由 `onClose` 结算。
        做坏试验：把"换成 60 秒"那两行删掉 → `ad_audit` 的
        「真广告播 20 秒期间**不许**被判定成拉不到」当场红。 */
  const AD_PLAYING_TIMEOUT_MS = 60000;
  let rewardBusy = false;
  /* ================= 康康 2026-09-29 · 广告开演＝全游戏暂停 =================
     父亲大人：「我发现看广告的时候游戏进程没有暂停，等广告结束后再结算是否观看完成然后再继续」。
     微信激励视频是**盖在画面上的一层原生浮层**，游戏自己的 JS 计时器照跑 ——
     于是战斗继续推帧、结算页倒计时继续走、特效还在画、BGM 还在响。
     修法：在**唯一那条真广告出口**（下面 `showRewarded` 里 `ad.show()` 前后）收口 ——
       · 开演前：战斗那一场挂起（`BattleUI.pauseForAd`，清推帧与倒计时）、音频静音（`AUD.pauseForAd`）；
       · 结算时（看完 / 半途关掉 / 拉不到 / 超时，**四个出口都会走 `done()`**）：
         原样恢复（`BattleUI.resumeAfterAd` ＋ `AUD.resumeAfterAd`）。
     ⚠️ **演练期（没有真广告）不暂停** —— 没有浮层可等，停一下反而怪（见 showRewarded 的 ① 分支）。
     ⚠️ 幂等：`adPaused` 只有从 false→true / true→false 才动一次，重复调用不会把状态搞乱。
     做坏试验：把 pause/resume 那两句删掉 → `ad_audit` 的"看广告期间真的停了""回来真的接着打"当场红。 */
  let adPaused = false;
  function adPause(on) {
    on = !!on;
    if (on === adPaused) return;
    adPaused = on;
    try {
      if (on) {
        if (G.BattleUI && G.BattleUI.pauseForAd) G.BattleUI.pauseForAd();
        if (G.AUD && G.AUD.pauseForAd) G.AUD.pauseForAd();
      } else {
        if (G.AUD && G.AUD.resumeAfterAd) G.AUD.resumeAfterAd();
        if (G.BattleUI && G.BattleUI.resumeAfterAd) G.BattleUI.resumeAfterAd();
      }
    } catch (e) {}
  }
  try { G.adPause = adPause; } catch (e) {}     // 尺子用它读"现在是不是广告挂起态"
  /* V1.0.4 · R1 / R9（父亲大人 09-27 点单）：广告这条链**只在这一处**记账 ——
     `slot`（哪个点位）+ `granted` + `reason`，一共三个短字段（不含账号、不含存档）。
     `reason === 'ok'` ＝ 玩家**真的看完了一条广告** ⇒ 顺带上报一次 `ad_watch` 事件（R9）；
     演练期直接发奖（drill）与拉不到时的补偿（compensated_*）都**不算看完广告**，
     只记在日志里 —— 后台那份漏斗要的是"真看过的量"，不是"发过奖的量"。 */
  function adLog(slot, granted, reason) {
    try {
      if (!G.LOG) return;
      G.LOG.info('ad', 'show', { slot: slot, granted: granted, reason: reason });
      if (granted && reason === 'ok') G.LOG.event('ad_watch', { slot: slot });
    } catch (e) {}
  }
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
    const req = new Promise(resolve => {
      if (!perBattle && !unlimited && quotaLeft(slot) <= 0) { resolve({ granted: false, reason: 'quota' }); return; }
      /* 全局总闸：不限次数时（现在的口径）这一步永不拦人。留着分支是为了口径可回退。 */
      if (!unlimited && totalLeft() <= 0) { resolve({ granted: false, reason: 'total' }); return; }
      /* ① 演练期：直接发（父亲大人的口径："前期可以点了直接发奖励"） */
      if (!CAN_USE_AD) { quotaUse(slot, perBattle); resolve({ granted: true, reason: 'drill' }); return; }
      /* ② V1.1.20（F1-4）：一条在飞时挡住第二次点击（不再让第二条请求把单槽 pendingReward 顶掉） */
      if (rewardBusy) { resolve({ granted: false, reason: 'busy' }); return; }
      let ad = null;
      try { ad = getRewarded(); }
      catch (e) { ad = null; }                       // createRewardedVideoAd 抛错也照"拉不到"处理
      if (!ad) { resolve(grantCompensated(slot, 'no_ad', perBattle)); return; }
      let settled = false;
      let timer = null;
      const mine = { slot, perBattle, done: null };
      const done = function (r) {
        if (settled) return; settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        rewardBusy = false;
        if (pendingReward === mine) pendingReward = null;   // ← 只清自己的那一槽
        adPause(false);                                     // 广告收工（任何出口）→ 游戏继续
        resolve(r);
      };
      mine.done = done;
      /* 每次请求只挂**一个待结算**（回调是单例上那一个，见 getRewarded 的说明） */
      pendingReward = mine;
      rewardBusy = true;
      /* ③ 硬超时：8~10 秒拿不到回执就当"这一次拉不到广告"，走既有补偿分支（不再让玩家白等） */
      timer = setTimeout(function () { done(grantCompensated(slot, 'timeout', perBattle)); }, REWARD_TIMEOUT_MS);
      /* 真广告要开演了：先把这一场挂起、把声音让给广告（结算时在 done() 里恢复）。 */
      adPause(true);
      /* ⚠️ 这里**刻意不 unref**：尺子在 Node 里跑时，unref 过的计时器不挡进程退出 ——
         而外面正 await 这条 Promise，进程一退就成了"永远没有回执"的假现场。 */
      let r0 = null;
      try { r0 = ad.show(); } catch (e) { done(grantCompensated(slot, 'load_fail', perBattle)); return; }
      Promise.resolve(r0).then(function () {
        /* 广告**真的开演了**：把"拉不起来"那个 9 秒换成 60 秒长兜底（理由见 AD_PLAYING_TIMEOUT_MS）。
           ⚠️ 只在自己这一条还挂着的时候动 `timer`（`settled` 了就什么都不做）。 */
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        timer = setTimeout(function () { done(grantCompensated(slot, 'timeout', perBattle)); }, AD_PLAYING_TIMEOUT_MS);
      }).catch(() => ad.load().then(() => ad.show()).then(function () {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        timer = setTimeout(function () { done(grantCompensated(slot, 'timeout', perBattle)); }, AD_PLAYING_TIMEOUT_MS);
      }).catch(() => done(grantCompensated(slot, 'load_fail', perBattle))));
    });
    /* R1 / R9：**所有出口**（演练期直接发 / 配额用尽 / 拉不到补偿 / 看完 / 半途关掉）
       都在这一行统一记账 —— 十几个点位各自 resolve，单独埋点必漏。 */
    return req.then(function (r) {
      adLog(slot, !!(r && r.granted), String((r && r.reason) || '?'));
      return r;
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
    /* ================= 2026-10-01（父亲大人 §十六）· **"能不能看"只此一处** =================
       以前每个页面自己拼 `AD.left(slot) > 0`，于是"点位还有、全局没了"那种矛盾
       就会变成「UI 说还有 1 次、点下去说用完了」。现在统一走 `AD.status(slot)`：
       它一次看全 **点位配额 · 全局总闸 · 广告模块 · 弱网**，返回一个对象；
       按钮的**文案与禁用态都从它来**，页面不许自己算。 */
    status: function (slot, opts) {
      const perBattle = !!(opts && opts.perBattle);
      const unlimited = FREE_SLOTS.indexOf(slot) >= 0 || perBattle;
      const quota = unlimited ? Infinity : quotaLeft(slot);
      const total = totalLeft();
      const weak = !!(G.ADWEAK && G.ADWEAK.block && G.ADWEAK.block());
      if (quota <= 0) return { ok: false, reason: 'quota', quota: quota, total: total, weak: weak, text: '今日次数已用完' };
      if (total <= 0) return { ok: false, reason: 'total', quota: quota, total: total, weak: weak, text: '今日广告额度已用完' };
      return { ok: true, reason: '', quota: quota, total: total, weak: weak, text: '' };
    },
    /* 按钮上那句"（今日还剩 N 次）"——**唯一一处拼法**，页面直接拼在标签后面。 */
    quotaText: function (slot, opts) {
      const s = G.AD.status(slot, opts);
      if (!s.ok) return '（' + s.text + '）';
      if (s.weak) return '（网络不太好）';
      if (s.quota === Infinity) return '';
      return '（今日还剩 ' + s.quota + ' 次）';
    },
    totalLeft: totalLeft,
    totalCap: AD_TOTAL_CAP,
    totalUnlimited: AD_TOTAL_UNLIMITED,
    compCap: AD_COMP_CAP,
    compLeft: () => Math.max(0, AD_COMP_CAP - quotaLoad().comp),   // 调试/尺子用（补偿还剩几次）
    show: showRewarded,
    interstitial: maybeInterstitial,
    /* GM 面板「清 CD」用（F7 留的接口，康康在这里落地）：把当日广告配额清空。
       调用方只有 `js/sc-last.js` 的 GM 按钮，而那道门是"只在 develop/trial 开"⇒ 正式版调不到。 */
    resetQuota: quotaReset,
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

  /* ================= V1.0.4 · X（订阅消息 · 父亲大人「2，可以」）=================
     玩家点一次同意 → 我们**只能给他推一条**（一次性订阅的规矩）。
     所以这里只做一件事：**老老实实去请求**，把结果如实回报给界面（成没成、为什么没成），
     不做"假装成功"这套（那种假成功会让玩家以为收到了、其实什么都没发生）。
     ⚠️ 模板 ID 只有这一处 —— 换模板改这一个常量（它来自 MP 后台「订阅消息 → 我的模板」）。 */
  const SUB_TMPL = 'zYhQJ6mWH6a1N0A4ryaXMKcd6Uw_h2L9KuBGPT08RnA';
  function requestSubMsg() {
    return new Promise(function (resolve) {
      if (!WX || typeof WX.requestSubscribeMessage !== 'function') {
        resolve({ ok: false, why: 'no_api' }); return;
      }
      try {
        WX.requestSubscribeMessage({
          tmplIds: [SUB_TMPL],
          success: function (res) {
            const v = res && res[SUB_TMPL];
            resolve({ ok: v === 'accept', why: v === 'accept' ? 'ok' : String(v || 'reject') });
          },
          fail: function () { resolve({ ok: false, why: 'fail' }); },
        });
      } catch (e) { resolve({ ok: false, why: 'throw' }); }
    });
  }
  G.SUB_TMPL = SUB_TMPL;
  G.requestSubMsg = requestSubMsg;

  /* ---------- ⑤ 分享（V1.0.3）----------
     小游戏的"转发"默认是**关着**的：不调 showShareMenu 右上角就没有转发入口，
     也没有任何报错 —— 2026-09-26 父亲大人问"为什么不能分享"就是这么来的。
     卡图先不指定（微信默认截当前画面），要专门 5:4 卡图时在这里补 imageUrl。 */
  /* ================= 康康 2026-09-29（父亲大人定稿）=================
     原来这里是「**一个人做的**暗色放置小游戏 · 来残域灯阁当执灯者」——
     他明确要求：**不要出现任何作者自述，只谈游戏**；而且分享卡片要说成"你是天选之子"那口气。
     新标题是**第二人称、只讲游戏**的那一条（他从中选定）；
     文案唯一出处就在这一行 —— 改口吻只改这里，别处不许再写第二份。 */
  const SHARE_TITLE = '残域选中的人，只能是你';
  if (WX && WX.showShareMenu) {
    try { WX.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }); } catch (e) {}
  }
  if (WX && WX.onShareAppMessage) {
    WX.onShareAppMessage(() => ({ title: SHARE_TITLE }));
  }
  if (WX && WX.onShareTimeline) {
    WX.onShareTimeline(() => ({ title: SHARE_TITLE }));
  }

  /* ================= 康康 2026-10-01 · **自然分享的统一入口**（R1.3 阶段④）=================
     父亲大人划的边界（原话）：「不做分享一次领奖 / 分享三次领奖 / 分享返资源 / 邀请返利 /
     助力 / 砍价 / 强制分享后才能继续 / 高频自动弹出」—— **分享与奖励彻底解绑**。
     所以这一层只做三件事：
       · 按**场景**（`context.type`）挑一句**用真实数据拼的**文案（不伪造排行榜 / 战力 / 好友成绩）；
       · 带一个**轻量 query**（`shareType=…`）告诉别人"这分享从哪来"，**不做邀请返利那套**；
       · **所有异常都吞掉**：没有分享 API / 玩家取消 / 调用失败 —— 一律回一句人话，
         绝不把 `wx.shareAppMessage fail` 这类技术错误丢给玩家，也绝不影响主流程。
     ⚠️ 页面**不许**自己调 `wx.shareAppMessage` —— 一律走 `G.shareGame(...)`（一处收口）。 */
  const SHARE_TYPES = {
    settings: () => '残域里亮着的那盏灯，是我点的。',
    battle: (c) => '刚在《残域》【' + (c.world || '残域') + '】打赢了第 ' + (c.stage || '?') + ' 关。',
    first: (c) => '《残域》【' + (c.world || '残域') + '】第一次通关，下一层更难。',
    character: (c) => '我在《残域》觉醒了【' + (c.name || '一位执灯者') + '】。',
    equip: (c) => '刚在《残域》拿到一件【' + (c.rarity || '神话') + '】装备。',
    world: (c) => '《残域》已经走到【' + (c.world || '残域') + '】了。',
  };
  function shareGame(context) {
    const c = context || {};
    const mk = SHARE_TYPES[c.type] || SHARE_TYPES.settings;
    let title = SHARE_TITLE;
    try { title = String(mk(c) || '') || SHARE_TITLE; } catch (e) {}
    const opt = { title: title, query: 'shareType=' + encodeURIComponent(String(c.type || 'settings')) };
    if (c.imageUrl) opt.imageUrl = c.imageUrl;
    if (!WX || typeof WX.shareAppMessage !== 'function') {
      return { ok: false, msg: '这个版本还不支持分享，下次更新就能用了' };
    }
    try {
      WX.shareAppMessage(opt);
      try { const L = G.LOG; if (L) L.info('share', { type: String(c.type || 'settings') }); } catch (e) {}
      return { ok: true };
    } catch (e) {
      /* 玩家取消也算"这一趟结束了"：不报错、不惩罚、不阻断 */
      return { ok: false, msg: '暂时没能打开分享，请再试一次' };
    }
  }
  G.shareGame = shareGame;

  /* ================= V1.0.4 · ⑥ 线上实时日志 ＋ 事件上报（R1 / R9 · 父亲大人 09-27 点单）======
     为什么要它：真机白屏、丢档、广告拉不到这类问题，以前只能靠"猜 ＋ 让玩家描述"。
     `wx.getRealtimeLogManager`（基础库 **2.14.4** 起）把分级日志**上报到 MP 后台**，
     真机现场像开控制台一样能看 —— 以后再遇到白屏/丢档，不用靠猜。

     四条纪律（都写死在这个出口里，别处不许绕过）：
       ① **出口只有这一处**（`G.LOG.info / warn / error / event`）—— 十几处直接调 wx 的写法，
          下一版（R9 加事件、云同步加口径）就得挨个改，一改就漏；
       ② **老基础库 / 没有这两个 API → 静默降级**：日志退化成只 `console`，事件整个跳过。
          开除机链路上**不许因为新接的能力把启动弄崩**（提审驳回过的同类坑）；
       ③ **不上报存档全文、不上报任何账号 / 密钥 / openid** —— 只上报事件名 ＋ 几个短字段
          （关卡号、granted、reason、字节数、版本号这类）。存档密文也不上报；
       ④ 上报失败一律吞掉：**日志坏了不许影响玩法**。
     用法：`G.LOG.info('boot', 'load_ok', { bytes: 4096, ver: 5 })`。 */
  const LOG_RING = [];                     // 最近 80 条留在内存里（尺子 / 真机诊断读它，不落盘）
  const LOG_RING_MAX = 80;
  /* 字段白名单：只放行"短字符串 + 数字"这一类**没有隐私**的名字。
     白名单外的键只有值是数字/布尔才留 —— 字符串一律不进（防有人顺手把整份对象塞进来）。 */
  const LOG_PICK = /^(event|slot|page|name|scope|action|level|why|reason|ok|granted|win|world|diff|stage|kind|bytes|size|ver|tier|pool|day|count|ms|ts|api|n|from|to)$/;
  function LOG_clean(data) {
    const out = {};
    if (!data || typeof data !== 'object') return out;
    Object.keys(data).forEach(function (k) {
      const v = data[k];
      if (typeof v === 'number') { out[k] = Math.round(v * 100) / 100; return; }
      if (typeof v === 'boolean') { out[k] = v; return; }
      if (typeof v === 'string' && LOG_PICK.test(k)) out[k] = String(v).slice(0, 40);
    });
    return out;
  }
  function LOG_serial(data) {
    const c = LOG_clean(data);
    const ks = Object.keys(c);
    return ks.length ? ' ' + ks.map((k) => k + '=' + c[k]).join(' ') : '';
  }
  let _logMan = null, _logTries = 0;
  function LOG_manager() {
    if (_logMan) return _logMan;
    if (!WX || typeof WX.getRealtimeLogManager !== 'function') return null;
    if (_logTries >= 2) return null;       // 试两次还不行就别再试（别每次打日志都去建一遍）
    _logTries++;
    try { _logMan = WX.getRealtimeLogManager() || null; } catch (e) { _logMan = null; }
    return _logMan;
  }
  function LOG_line(level, scope, action, data) {
    const line = '[wxlh] ' + String(scope || '-') + ' · ' + String(action || '-') + LOG_serial(data);
    try { (console[level] || console.log).call(console, line); } catch (e) {}
    LOG_RING.push({ t: Date.now(), level: level, line: line });
    if (LOG_RING.length > LOG_RING_MAX) LOG_RING.shift();
    const m = LOG_manager();
    if (m && typeof m[level] === 'function') { try { m[level](line); } catch (e) {} }
    return line;
  }
  /* 事件名与字段的**固定口径**（R9）：这批名字要父亲大人在 MP「实验系统」里先建好。 */
  function LOG_report(eventId, data) {
    if (!eventId) return false;
    const ev = String(eventId);
    LOG_line('info', 'event', ev, data);
    if (!WX || typeof WX.reportEvent !== 'function') return false;
    try {
      const d = LOG_clean(data);
      /* reportEvent 的值只吃 string / number —— 布尔转成 1/0，免得后台那一格是空的 */
      Object.keys(d).forEach(function (k) { if (typeof d[k] === 'boolean') d[k] = d[k] ? 1 : 0; });
      WX.reportEvent(ev, d);
      return true;
    } catch (e) { return false; }
  }
  G.LOG = {
    info: function (scope, action, data) { return LOG_line('info', scope, action, data); },
    warn: function (scope, action, data) { return LOG_line('warn', scope, action, data); },
    error: function (scope, action, data) { return LOG_line('error', scope, action, data); },
    event: LOG_report,
    /* 诊断（尺子用）：日志有没有走真通道、最近几条是什么 */
    diag: function () {
      return { api: !!(WX && typeof WX.getRealtimeLogManager === 'function'), manager: !!_logMan,
        eventApi: !!(WX && typeof WX.reportEvent === 'function'), ring: LOG_RING.slice(-20) };
    },
    recent: function (n) { return LOG_RING.slice(-(n || 20)); },
  };

  /* ================= V1.0.4 · ⑦ 弱网口径（R3 · 父亲大人 09-27 点单）=================
     `wx.onNetworkWeakChange` 的登记在 `js/wx-cap.js`；这里只留**判定与文案**这一处出口 ——
     十几个"看广告"的地方都读它，谁也别自己写一份判断。
     为什么按钮要变脸、而不是"点了再看运气"：弱网下拉不到广告，玩家白等十几秒还没奖励，
     体感是"这游戏坑我"。所以弱网时那颗按钮直接写「网络不太好」，点了给一句人话。
     ⚠️ **补偿口径一个字没改**（`NO_COMP_SLOTS`）：弱网只是"别让他白点"，
        真拉不到时双倍那类照样不给、也不吃补偿；资源点位照旧走既有补偿。 */
  G.ADWEAK = {
    weak: false,
    /* 弱网时把按钮文案换掉（一处判定，别处只调用） */
    label: function (text) { return G.ADWEAK.weak ? '网络不太好' : text; },
    /* 弱网时点了给一句人话（返回 true ＝ 这一下已经处理，调用方直接 return） */
    block: function () {
      if (!G.ADWEAK.weak) return false;
      try { if (G.CV && G.CV.toast) G.CV.toast('网络不太好，等网络恢复了再看广告', 2200); } catch (e) {}
      return true;
    },
  };
})();
