/* 订阅消息 ·「收益满了提醒我」（V1.0.4 · X 轮 · 父亲大人 09-27「2，可以」）
   ==============================================================================
   一次性订阅的规矩：**玩家点一次同意，只能推一条**。所以这一趟只干一件事：
     挂机银行**满了**、玩家**订阅过**、而且**这一次满还没认领过** → 推一条；推完就记上，绝不重发。

   数据从哪来：不用解开存档密文 —— 客户端推档时会在记录的 `act` 里带**一小块明文数字**
   （`js/sc-cloud.js` 的 `data.act` ⇒ `Core.actSnapshot()`）：
     · `act.subMsg`      1 = 玩家订阅过（0 = 没订阅 / 老档）
     · `act.bankFullAt`  挂机银行**满**的时刻（毫秒；没满 = 0）
     · `act.bankAmount`  满那一刻能收多少（推送里那个数字）

   「这一次满已经发过没」记在**记录顶层的 `notifyAt`**（不是 `act` 里）：客户端推档是**整块覆盖**
   `act`，写在 `act` 里的记号下一次推档就被抹掉（复核时实测出来的那个坑，详见 lib/cond.js 的说明）。

   三条纪律（都有理由，别顺手改）：
     · **认领在发送之前**：官方文档明说"定时触发器可能重复推送同一条"，并发两跑也只该发一条；
     · **失败一律静默、且不重试**（连 43101"额度已用完"也只留一行日志）—— 不然 10 分钟一轮能把配额烧光；
     · **不带 page**：小游戏没有页面路径（`page` 是"小程序内页面"，填了反而可能被判参数错）。

   ✅ **那三个关键词的 key 已于 2026-09-28 对着 MP 后台核过并改正**（康康用父亲大人的登录态查的
      「订阅消息 → 我的模板 → 详情」）—— 后台原文是：
        离线收益 {{thing1.DATA}} · 挂机时长 {{thing8.DATA}} · 温馨提示 {{thing4.DATA}}
      而代码原来写的是 `thing1 / thing2 / thing3` ⇒ **后两个在模板里根本不存在** ⇒
      每次发送都会返回 **47003（数据结构不对）** ⇒ **订阅推送一次都发不出去**（这就是"订阅用不了"的
      第二个独立原因；第一个是客户端只等 1 秒、等不过云函数冷启动）。
      要换模板/改字段时：改下面默认值，或设环境变量 `NOTIFY_KEYS='{"income":"thing1",...}'`。
   ============================================================================== */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ENV = process.env || {};
const COLL = String(ENV.NOTIFY_SAVE_COLL || 'saves');
const TMPL = String(ENV.NOTIFY_TEMPLATE_ID || 'zYhQJ6mWH6a1N0A4ryaXMKcd6Uw_h2L9KuBGPT08RnA');   // 与 js/wx-adapter.js 的 SUB_TMPL 同一个
/* 跳转版本：**正式版已经上线（09-28 发布）**，所以默认改成 formal —— 玩家点通知要落到正式版，
   落到 trial（体验版）会让普通玩家打不开或进到不该进的版本。
   （父亲大人 09-29：「这个你直接按照正式版去做就行了吧」。要临时改回体验版/开发版，
     设环境变量 NOTIFY_STATE=trial|developer 即可，不用改代码。） */
const STATE = String(ENV.NOTIFY_STATE || 'formal');
/* 挂机时长写法：默认"2小时30分"（关键词是"事物"类）；若后台那个关键词是"时间"类，设 NOTIFY_TIME_STYLE=colon → "02:30" */
const TIME_STYLE = String(ENV.NOTIFY_TIME_STYLE || '');
const TIP_TEXT = '挂机收益已经满了，回来收一下吧';
/* 模板「离线收益领取提醒」的三个关键词 → 模板里的 key（**已核**，见文件头说明） */
const KEY_MAP = (function () {
  const d = { income: 'thing1', hours: 'thing8', tip: 'thing4' };
  try {
    const o = JSON.parse(String(ENV.NOTIFY_KEYS || ''));
    if (o && typeof o === 'object') ['income', 'hours', 'tip'].forEach((k) => { if (o[k]) d[k] = String(o[k]); });
  } catch (e) {}
  return d;
})();

/* 纯判据与文案换算在 lib/cond.js（与 sdk 无关 → 尺子能直接 require 它） */
const { shouldSend, messageData } = require('./lib/cond.js');
function mask(openid) { return String(openid || '').slice(0, 6); }
function errOf(e) { return (e && (e.errMsg || e.message)) || String(e || 'fail'); }

exports.main = async () => {
  const now = Date.now();
  /* ================= 2026-09-28（康康 · 代码审查抓到的规模风险）=================
     这个云函数的**平台超时只有 3 秒**（`cloud_fn_info` 实测），而下面是**顺序**处理
     最多 100 条、每条要 2 次读库＋1 次发消息 ⇒ 订阅的人一多，跑到一半就被平台砍掉。
     更糟的是**认领在发之前**（`notifyAt` 先写），被砍在中间的那些 doc 已经"认领过了"
     ⇒ 按既有口径"失败也认领、不重试"，那一次满就**永远不发**了。
     修法（不依赖平台改配置）：**给自己留一条时间预算** —— 一进循环就记时，超过 ~2.2 秒
     就**停止本轮**（剩下的**不认领**，留给 10 分钟后的下一轮）。
     这样超时被砍也只会砍在"还没开始处理"的那些上，不会砍在"认领了但没发"的缝里。 */
  const DEADLINE = now + 2200;
  let sent = 0, scanned = 0, skipped = 0, failed = 0;
  try {
    /* 只捞"订阅过 且 满了"那一小撮；一次最多 100 条（10 分钟一轮，够用且不烧配额） */
    const r = await db.collection(COLL)
      .where({ 'act.subMsg': 1, 'act.bankFullAt': db.command.gt(0) })
      .limit(100).get();
    const list = (r && r.data) || [];
    scanned = list.length;
    for (const doc of list) {
      if (Date.now() > DEADLINE) { console.log('[notify] time_budget', '本轮到此为止，剩下的留给下一轮（未认领）'); break; }
      if (!shouldSend(doc, now, 0)) { skipped++; continue; }
      const a = doc.act || {};
      const full = Math.max(0, Math.floor(Number(a.bankFullAt) || 0));
      const openid = String(doc._openid || doc.openid || '');
      if (!openid || !doc._id) { failed++; console.log('[notify] doc_bad', mask(openid)); continue; }
      /* ① 先认领：同一个"满"只处理一次（触发器可能重复推送、也可能两跑并发；失败也认领＝这个窗口不再重试） */
      try {
        await db.collection(COLL).doc(doc._id).update({ data: { notifyAt: full, notifyClaimAt: now } });
      } catch (e) {
        failed++;
        console.log('[notify] claim_fail', mask(openid), errOf(e));
        continue;
      }
      /* ② 再发。「挂机时长」＝**银行里攒了多久**（满的时候就是本档的挂机上限，6～12 小时）；
         老版本客户端 / 老档没带 `bankSec` 时退到"满了多久"（至少不是空值、也不会撑爆长度口径）。 */
      const durSec = Math.max(0, Math.floor(Number(a.bankSec) || 0))
        || Math.max(0, Math.floor((now - full) / 1000));
      try {
        const res = await cloud.openapi.subscribeMessage.send({
          touser: openid,
          templateId: TMPL,
          lang: 'zh_CN',
          miniprogramState: STATE,
          data: messageData(a, KEY_MAP, { durSec: durSec, timeStyle: TIME_STYLE, tip: TIP_TEXT }),
        });
        sent++;
        try { await db.collection(COLL).doc(doc._id).update({ data: { notifySentAt: Date.now(), notifyErr: '' } }); } catch (e) {}
        console.log('[notify] sent', mask(openid), 'durSec=' + durSec, 'errcode=' + ((res && res.errCode) || 0));
      } catch (e) {
        failed++;
        const code = Number((e && e.errCode) || 0) || 0;
        try { await db.collection(COLL).doc(doc._id).update({ data: { notifyErr: String(code || errOf(e)), notifyFailAt: Date.now() } }); } catch (e2) {}
        /* 43101 ＝ 他的一次性订阅已经用掉了（或主开关关了）——这不是故障，是规矩：只留一行，不重试 */
        console.log('[notify] send_fail', mask(openid), code === 43101 ? 'used_up' : (code + ' ' + errOf(e)));
      }
    }
  } catch (e) {
    console.log('[notify] scan_fail', errOf(e));
  }
  console.log('[notify] done scanned=' + scanned + ' sent=' + sent + ' skipped=' + skipped + ' failed=' + failed);
  return { ok: true, scanned, sent, skipped, failed };
};

exports.KEY_MAP = KEY_MAP;
