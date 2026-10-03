/* 礼包发货云函数 `giftbox`（2026-10-02 · 父亲大人「开工」）
   ==============================================================================
   这一支同时当**两个角色**（靠 event 的形状分流，互不干扰）：

     A. **微信的消息推送**（`Event === 'minigame_deliver_goods'`）
        玩家在游戏圈/福利中心领到礼包时，微信把这条推到我们这儿。我们把它落成一张工单，
        然后**必须回 `{ErrCode:0}`** —— 回错/超时会按 2^n 分钟重试，失败多了触发熔断、礼包被停用。

     B. **客户端的取件口**（`{action:'pull'|'ack'}`）
        ⚠️ 为什么不让服务端直接把道具写进存档：我们的存档 `payload` 是**客户端加密的密文**，
        服务端看不懂也不解（R1.2 定的口径）。所以发货走**两段式**：
          微信 → 我（落工单）→ 客户端下次上来取 → 走游戏里那个唯一的发奖入口 `applyRewardObj`。
        这也天然满足官方的"发货失败要重试、要幂等"：工单按 `OrderId` 去重，取了才算完。

   表（两张）：
     · `gift_orders`  `_id = 'GO|' + OrderId` —— **就是幂等锁**（`add` 撞主键＝这条已收过）
     · `gift_inbox`   `_id = openid`，字段 `pending: [{od, goods, at}]` —— 待取的工单

   ⚠️ **本云环境有一条实测铁律（2026-10-01 那轮排查钉下的）**：
      `update` 一律报 `-502001`，**所以这套代码一个 `.update()` 都不用** ——
      改一条记录永远是「读全文 → 只换要换的字段 → `set` 覆盖回去」。
      别看着别扭就顺手换成 `update`，那会当场把发货打断。 */
const cloud = require('wx-server-sdk');
const D = require('./lib/deliver.js');
const W = require('./lib/wechat.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ORDERS = 'gift_orders';
const INBOX = 'gift_inbox';
const CFG = 'mp_cfg';            // 消息推送的 Token 存这儿（**不进仓库**：这个仓库是公开的）
const MAX_PENDING = 50;          // 待取工单上限（防某天被刷成一大坨）

/* Token 从云数据库读、进程内缓存 —— 为什么不写死在代码里：
   `Miano-Design/wxlh-minigame` 是**公开仓库**，写进去等于把签名密钥公开，
   别人就能伪造发货单。放进 `mp_cfg` 那条（只有云函数读得到）才安全。 */
let CFG_MEMO = null;
async function pushCfg() {
  if (CFG_MEMO) return CFG_MEMO;
  const cfg = await readDoc(CFG, 'push');
  if (cfg && cfg.token) CFG_MEMO = { token: String(cfg.token), aesKey: String(cfg.aesKey || '') };
  return CFG_MEMO || { token: '', aesKey: '' };
}
async function pushToken() { return (await pushCfg()).token; }

async function ensure(name) {
  try { await db.createCollection(name); } catch (e) { /* 已存在：忽略 */ }
}
/** 读一条；**不存在时返回 null 而不是抛**（我们只用它判断"有没有"）。 */
async function readDoc(coll, id) {
  try { const r = await db.collection(coll).doc(id).get(); return (r && r.data) || null; }
  catch (e) { return null; }
}

/* ============================ A. 收发货单 ============================ */
async function onPush(event) {
  const order = D.parsePush(event);
  if (!order) return D.reply(0);                 // 不是我们的活：回 0（别让别的场景被我们拖重试）

  /* ① 幂等锁：`add` 撞主键＝这条已经收过了（**绝不能重复发货**）。
     ⚠️ 这里踩过一个真坑（2026-10-02，被 `giftbox_audit` 当场抓住）：
        第一版把"表不存在 → 建表 → 重试 add"写在一个 catch 里，然后**在 catch 里 return 了**，
        于是"表是新建的"那一次**工单落了、待取箱没入** —— 单子永远取不出来。
        现在改成：锁只负责"是不是第一回"，**入箱那一步任何情况下都会走下去**。 */
  const oid = 'GO|' + order.orderId;
  const rec = {
    _id: oid, orderId: order.orderId, openid: order.openid, goods: order.goods,
    dropped: order.dropped, clamped: order.clamped,
    giftId: order.giftId, giftTypeId: order.giftTypeId, isPreview: order.isPreview,
    at: Date.now(),
  };
  let locked = false;
  for (let attempt = 0; attempt < 2 && !locked; attempt++) {
    try { await db.collection(ORDERS).add({ data: rec }); locked = true; }
    catch (e) {
      const msg = String((e && (e.errMsg || e.message)) || '');
      if (attempt === 0 && /not exist/i.test(msg)) { await ensure(ORDERS); continue; }  // 建表后重试一次
      /* 撞主键（＝这条收过）**或其它写失败**：都去回查一眼那条在不在 */
      if (await readDoc(ORDERS, oid)) break;
      /* 真写不进去 —— 回非 0 让微信按 2^n 重试（吞掉就等于把这份礼弄丢了） */
      return D.reply(1, 'order write failed');
    }
  }

  /* ② 已经**取走**了？（`done` 标记是 `ack` 时盖的）
     ⚠️ 这一条是补上来的洞（2026-10-02，尺子的做坏试验当场抓出来）：
        没有它的话，"玩家取了 → 微信又重试同一单 → 我们当作漏发再补一份" 会**重复发货**。
        "自愈"只该补"落了单但没入箱"的那种漏，**不该补已经发出去的**。 */
  const ord = await readDoc(ORDERS, oid);
  if (ord && ord.done) return D.reply(0);

  /* ③ 已经在箱子里了？（幂等出口） */
  const box0 = await readDoc(INBOX, order.openid);
  const has = ((box0 && box0.pending) || []).some(function (x) { return x && x.od === order.orderId; });
  if (has) return D.reply(0);

  /* ④ 入箱（读全文 → 只换 pending → set 覆盖；全环境不用 update）。
     上面那道"在不在箱子里"的检查同时兜住了一种情况：上一次单子落了、箱子没写成功 —— 微信重试时这里会补上。 */
  const pending = ((box0 && box0.pending) || []).filter(function (x) { return x && x.od; })
    .slice(-MAX_PENDING + 1);
  /* `gt` / `gid` 一并带过去：客户端拿 `GiftTypeId` 查「这是哪个礼包」——
     只发编号不发名字（名字表在客户端 `D.GIFT_TYPE_NAME`，改文案不用重传云函数）。 */
  pending.push({ od: order.orderId, goods: order.goods, at: Date.now(),
    gt: Number(order.giftTypeId) || 0, gid: String(order.giftId || '') });
  try {
    await db.collection(INBOX).doc(order.openid).set({ data: { pending: pending, at: Date.now() } });
  } catch (e) {
    const msg = String((e && (e.errMsg || e.message)) || '');
    if (/not exist/i.test(msg)) await ensure(INBOX);
    try { await db.collection(INBOX).doc(order.openid).set({ data: { pending: pending, at: Date.now() } }); }
    catch (e2) { return D.reply(1, 'inbox write failed'); }   // 让微信重试：重试时会走"补入箱"那条路
  }
  return D.reply(0);                               // ★ 发货这条路**永远回 0**
}

/* ============================ B. 客户端取件 ============================ */
async function onPull(openid) {
  if (!openid) return { ok: false, msg: 'noopenid' };
  const box = await readDoc(INBOX, openid);
  const pending = ((box && box.pending) || []).filter(function (x) { return x && x.od && x.goods; });
  return { ok: true, pending: pending };
}
async function onAck(openid, orders) {
  if (!openid) return { ok: false, msg: 'noopenid' };
  const done = (Array.isArray(orders) ? orders : []).map(String);
  const box = await readDoc(INBOX, openid);
  const left = ((box && box.pending) || []).filter(function (x) { return x && x.od && done.indexOf(String(x.od)) < 0; });
  try { await db.collection(INBOX).doc(openid).set({ data: { pending: left, at: Date.now() } }); }
  catch (e) { return { ok: false, msg: 'write' }; }
  /* ★ 给取走的那几单盖上 `done`：这样微信日后再重试同一单，我们**不会再发一份**
     （没有这一步就是重复发货的来源，见 onPush ② 那段注释）。 */
  for (const od of done) {
    const key = 'GO|' + od;
    const rec = await readDoc(ORDERS, key);
    if (!rec || rec.done) continue;
    try { await db.collection(ORDERS).doc(key).set({ data: Object.assign({}, rec, { done: true, doneAt: Date.now() }) }); }
    catch (e) { /* 盖不上就算了：最坏是下次重试再补一份，属于可接受的降级 */ }
  }
  return { ok: true, left: left.length };
}

exports.main = async (event) => {
  const e = event || {};
  const wx = cloud.getWXContext() || {};
  /* ================= A′. HTTP 访问服务那条路（官方唯一的接法）=================
     微信配置消息推送时会先 GET 来验地址（要**原样回 echostr**），之后 POST 发货单。
     两条都带 `signature`，用 `mp_cfg` 里的 Token 验签。 */
  {
    const rt = W.routeHttp(e, await pushToken());
    if (rt) {
      if (rt.act === 'deny') return W.httpReply(403, 'bad signature');
      if (rt.act === 'echo') return W.httpReply(200, rt.echostr);          // ★ 原样回，别加引号别加换行
      if (rt.act === 'msg') {
        const r = await onPush(rt.msg);
        return W.httpReply(200, JSON.stringify(r), 'application/json');    // 发货要回 {ErrCode:0}
      }
      /* 安全模式：纯密文。验 `msg_signature`（**不拿 signature**，官方点名说过）→ 解密 → 当普通消息走。
         ⚠️ 解不开时**回非 0**，让微信按 2^n 重试并留下日志 —— 绝不当成"收下了"（那会把玩家的礼静默吞掉）。 */
      if (rt.act === 'enc') {
        const cfg = await pushCfg();
        const q = rt.query || {};
        const enc = String((rt.body && rt.body.Encrypt) || '');
        if (!W.checkMsgSignature(cfg.token, q.msg_signature, q.timestamp, q.nonce, enc)) {
          return W.httpReply(200, JSON.stringify(D.reply(1, 'bad msg_signature')), 'application/json');
        }
        if (!cfg.aesKey) return W.httpReply(200, JSON.stringify(D.reply(1, 'aes key not set')), 'application/json');
        let inner = null;
        try { const dec = W.decryptMsg(cfg.aesKey, enc); inner = JSON.parse(dec.msg); }
        catch (e) { return W.httpReply(200, JSON.stringify(D.reply(1, 'decrypt failed')), 'application/json'); }
        const r = await onPush(inner);
        return W.httpReply(200, JSON.stringify(r), 'application/json');
      }
      if (rt.act === 'badjson') return W.httpReply(400, 'bad json');
      return W.httpReply(405, 'method not allowed');
    }
  }
  try {
    /* 官方推送：本环境里 OPENID 也能拿到，但**以推送里的 ToUserOpenid 为准**（那才是收货人） */
    if (D.parsePush(e)) return await onPush(e);
    const action = String(e.action || '');
    if (action === 'pull') return await onPull(wx.OPENID || '');
    if (action === 'ack') return await onAck(wx.OPENID || '', e.orders);
    return { ok: false, msg: 'unknown_action' };
  } catch (err) {
    /* 推送路径上**出错也要回 0**（回非 0 会触发重试+熔断）；客户端路径回错误对象即可。 */
    if (D.parsePush(e)) return D.reply(0, 'caught');
    return { ok: false, msg: 'threw', err: String((err && err.message) || err) };
  }
};
