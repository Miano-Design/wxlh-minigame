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

  /* ---------- ③ 广告位 ID（上线前替换） ---------- */
  const AD_UNITS = {
    // 激励视频：一个"广告位"可以被多个点位复用；也可以按点位各建一个，便于看后台数据
    rewarded: 'adunit-xxxxxxxxxxxxxxxx',
    // 插屏
    interstitial: 'adunit-yyyyyyyyyyyyyyyy',
  };
  // 找不到广告或没有真 ID 时，整个模块进入"演练模式"：奖励照给，只是没有广告
  const CAN_USE_AD = !!(WX && WX.createRewardedVideoAd) && AD_UNITS.rewarded.indexOf('xxxx') < 0;

  /* ---------- ④ 每个点位的每日次数（跳过日期重置、防改时间） ---------- */
  const QUOTA_KEY = 'wxlh_ad_quota';
  const LIMITS = {
    offline_double: 3,   // 离线收益翻倍（放置类第一广告点）
    idle_boost: 5,       // 挂机加速 2 小时
    sweep_plus: 2,       // 扫荡次数 +3
    pre_buff: 5,         // 战前增益（攻击 +25%）
    free_recruit: 3,     // 普通池免费 1 抽
    recruit_adv: 1,      // 高级池免费 1 抽（贵，所以只给 1 次）
    holy_pack: 2,        // ✦圣洁晶石 ×30
    otherworld_pack: 2,  // ◆异界结晶 ×50
    login_double: 1,     // 签到双倍
    revive: 1,           // 阵亡复活（每关 1 次，按关卡记，不按天）
  };
  function today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function quotaLoad() {
    const raw = safeGet(QUOTA_KEY);
    let q = null;
    try { q = raw ? JSON.parse(raw) : null; } catch (e) { q = null; }
    if (!q || q.date !== today()) q = { date: today(), used: {}, comp: 0 };
    q.used = q.used || {};
    q.comp = q.comp || 0;
    return q;
  }
  function quotaSave(q) { safeSet(QUOTA_KEY, JSON.stringify(q)); }
  function quotaLeft(slot) { const q = quotaLoad(); return Math.max(0, (LIMITS[slot] || 0) - (q.used[slot] || 0)); }
  function quotaUse(slot) { const q = quotaLoad(); q.used[slot] = (q.used[slot] || 0) + 1; quotaSave(q); }

  /* ---------- 激励视频封装 ---------- */
  let rewardedAd = null;
  function getRewarded() {
    if (!CAN_USE_AD) return null;
    if (rewardedAd) return rewardedAd;
    rewardedAd = WX.createRewardedVideoAd({ adUnitId: AD_UNITS.rewarded });
    // 拉取失败时下一次 show 会自动重试；这里只记录，不影响流程
    rewardedAd.onError(() => {});
    return rewardedAd;
  }
  /* show(slot) → Promise<{ granted, reason }>
     约定：**只要玩家点了"看广告"这个动作，奖励就必须给**（广告拉不到时走补偿，每天最多 2 次）。
     理由：广告是"可选增强"，玩家不该为空广告买单；这也是微信审核认可的口径。 */
  function showRewarded(slot) {
    return new Promise(resolve => {
      if (quotaLeft(slot) <= 0) { resolve({ granted: false, reason: 'quota' }); return; }
      const ad = getRewarded();
      if (!ad) { resolve(grantCompensated(slot, 'no_ad')); return; }
      let settled = false;
      const done = r => { if (settled) return; settled = true; resolve(r); };
      ad.onClose(res => {
        if (res && res.isEnded) { quotaUse(slot); done({ granted: true, reason: 'ok' }); }
        else done({ granted: false, reason: 'skipped' });      // 半途关掉 = 不给奖励（这是行业惯例）
      });
      ad.show().catch(() => ad.load().then(() => ad.show()).catch(() => done(grantCompensated(slot, 'load_fail'))));
    });
  }
  // 广告不可用时的补偿：照给奖励，但每天最多 2 次，防止有人拔网线白刷
  function grantCompensated(slot, why) {
    const q = quotaLoad();
    if (q.comp >= 2) return { granted: false, reason: 'no_ad_nocomp' };
    q.comp++; quotaSave(q);
    quotaUse(slot);
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
    units: AD_UNITS,
    limits: LIMITS,
    left: quotaLeft,
    show: showRewarded,
    interstitial: maybeInterstitial,
    // 调试面板用
    _today: today,
  };
})();
