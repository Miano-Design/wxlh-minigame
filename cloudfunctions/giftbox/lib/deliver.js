/* 礼包发货 · 纯逻辑层（不碰数据库、不碰网络 —— 所以能被尺子单独喂各种包来测）
   ==============================================================================
   官方协议（`developers.weixin.qq.com/minigame/dev/guide/open-ability/game-gift.html`）：
     微信在玩家领到礼包时，把一条 **消息推送** 发到我们的服务端，Event ＝ `minigame_deliver_goods`，
     里头 `MiniGame.ToUserOpenid` 是收货人、`GoodsList` 是要发的道具。
     **服务端必须回 `{ErrCode:0}`** —— 回得不对/超时/非 0 会被当成发货失败，
     按 2^n 分钟重试（2/4/8…到 1024），失败多了直接触发熔断把礼包停用。

   这一层只做三件事，全是纯函数：
     ① `parsePush(event)`  —— 判断"这是不是发货单"，是就拆成一条工单 `{orderId, openid, goods, ...}`；
     ② `toGoods(list)`     —— 把官方的 `GoodsList[{Id,Num}]` 翻成**我们发奖入口认的那个形状**
                              （`applyRewardObj` 的口径：货币直接给键，道具走 `item` 数组）；
     ③ `reply(ok, msg)`    —— 回包。**任何情况下都要回一个合法的 0**，除了真的不知道该干嘛。

   ⚠️ 三条设计决定（都写在注释里，免得以后有人"顺手优化"掉）：
     1. **道具 ID 直接用游戏内的 id**（`ticket_normal` / `matpack_mid` …）——
        MP 后台建道具时就这么填，于是这里**不需要第二张映射表**（少一张表就少一处会漂的地方）。
     2. `GoodsList` 里的 id **不认识的直接丢掉并记账**，绝不原样透传：
        客户端的 `applyRewardObj` 对不认识的键会当成"货币"加进去（静默造出一种假货币）。
     3. 数量**封顶**（单件 ≤ 99）：礼包配错一个数量不该把经济打崩；超了按 99 发并留痕。 */
/* ⚠️ 两类东西的封顶**不一样**（第一版一刀切 99，被自己的尺子当场抓住）：
     道具是"件"，99 件已经很夸张；**货币动辄上万**，一刀切会把正常礼包压成 99。
   所以：道具 99、货币 100 万。 */
const MAX_NUM = 99;
const MAX_CUR = 1000000;
/* 与 `js/data.js` 的 `CURRENCIES` 同一套键（四个层级：日常 / 养成 / 高级 / 转生） */
const CUR_KEYS = ['points', 'otherworld', 'holy', 'rp'];

/** 官方的 `GoodsList[{Id,Num}]` → `applyRewardObj` 认的奖励对象。 */
function toGoods(list) {
  const out = {};
  const dropped = [];
  const clamped = [];
  (Array.isArray(list) ? list : []).forEach(function (g) {
    if (!g) return;
    const id = String(g.Id == null ? '' : g.Id);
    let n = Math.floor(Number(g.Num));
    if (!id) return;
    if (!isFinite(n) || n <= 0) n = 1;
    if (CUR_KEYS.indexOf(id) >= 0) {
      if (n > MAX_CUR) { clamped.push(id + ':' + n); n = MAX_CUR; }
      out[id] = (out[id] || 0) + n;
      return;
    }
    if (n > MAX_NUM) { clamped.push(id + ':' + n); n = MAX_NUM; }
    /* 不认识的 id **一律丢掉**：透传下去会被 `applyRewardObj` 当成货币加（见文件头第 2 条）。 */
    if (!KNOWN_ITEM(id)) { dropped.push(id); return; }
    if (!out.item) out.item = [];
    for (let i = 0; i < n; i++) out.item.push(id);
  });
  return { goods: out, dropped: dropped, clamped: clamped };
}

/* 认识哪些道具 id —— **唯一真源是游戏自己的数据层**，但云函数读不到 `js/data.js`。
   所以这里留一张**显式白名单**（只列我们打算拿去发礼包的那些），并配一把尺子
   （`giftbox_audit`）钉住"白名单里的每个 id 都真实存在于 data.js"，防手滑写错一个字母。
   ⚠️ 不是"所有 55 个道具"：礼包只发这一批，**白名单越短越安全**。 */
const GIFT_ITEM_IDS = [
  'ticket_normal', 'ticket_adv', 'ticket_lim',          // 三张招募券
  'exp_l', 'exp_xl',                                     // 高级 / 超级经验模块
  'mat_t2', 'mat_t3', 'mat_t4',                          // 强化材料三档
  'matpack_low', 'matpack_mid', 'matpack_high',          // 材料包三档
  'reforge_stone',                                       // 重铸石
  'box_sr', 'box_ssr',                                   // 装备箱
  'beast_egg', 'dengyou', 'lingzhi_zhong',               // 伴生 / 灯阁点灯 / 药园种子
];
function KNOWN_ITEM(id) { return GIFT_ITEM_IDS.indexOf(id) >= 0; }

/** 这条推送是不是"给我们发货的"？是就拆成工单，不是就回 null（旁路给别的场景处理）。 */
function parsePush(event) {
  const e = event || {};
  if (String(e.MsgType || '') !== 'event') return null;
  if (String(e.Event || '') !== 'minigame_deliver_goods') return null;
  const mm = e.MiniGame || {};
  const orderId = String(mm.OrderId == null ? '' : mm.OrderId);
  const openid = String(mm.ToUserOpenid == null ? '' : mm.ToUserOpenid);
  if (!orderId || !openid) return null;                 // 缺关键字段：当"不是我们的活"，不猜
  const r = toGoods(mm.GoodsList);
  return {
    orderId: orderId,
    openid: openid,
    goods: r.goods,
    /* 只作记账用（不发给玩家）：丢了哪些不认识的 id、哪些超量被压过 */
    dropped: r.dropped,
    clamped: r.clamped,
    giftId: String(mm.GiftId == null ? '' : mm.GiftId),
    giftTypeId: Number(mm.GiftTypeId) || 0,
    isPreview: Number(mm.IsPreview) || 0,
    zone: Number(mm.Zone) || 0,
    sendTime: Number(mm.SendTime) || 0,
  };
}

/** 回包。**发货这条路必须回 0**（回别的会被当成失败、按 2^n 重试到熔断）。 */
function reply(errCode, errMsg) {
  const o = { ErrCode: Number(errCode) || 0 };
  if (errMsg) o.ErrMsg = String(errMsg);
  return o;
}

module.exports = { parsePush: parsePush, toGoods: toGoods, reply: reply,
  GIFT_ITEM_IDS: GIFT_ITEM_IDS, CUR_KEYS: CUR_KEYS, MAX_NUM: MAX_NUM, MAX_CUR: MAX_CUR };
