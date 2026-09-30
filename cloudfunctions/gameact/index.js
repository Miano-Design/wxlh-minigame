/* 游戏圈活跃任务 · 自定义条件回调（V1.0.4 · W 轮 · 父亲大人 09-27「7，可以」）
   ==============================================================================
   微信在活动里要显示"累计登录 5 天 / 在线 10 分钟 / 通关 N 次"的进度时，
   会按 MP「运营功能管理 → 基础配置 → 自定义条件」里配的**请求地址**打过来：

     请求：{ CreateTime, MsgType:'event', Event:'minigame_act_event_query_condition',
             MiniGame: { OpenId, TemplateId, ActId, ConditionId } }
     应答：{ ErrCode:0, IsConditionSatisfied:true/false, TemplateParamMap:{ 参数名: 数字 } }
   （官方文档《自定义条件接入指引》· minigame/dev/guide/open-ability/custom-task.html · 2026-09-27 抓取）

   这个云函数就是那个请求地址背后的东西（用**云开发 HTTP 访问服务**绑一个路径到它，
   例如 `/gameact` → 本函数；绑好后把完整 https 地址填进 MP 那一栏）。

   ---- 它做四件事，次序不能换 ------------------------------------------------
   ① 验签（＋加密模式下先解密）——见 `lib/verify.js`（照官方 cryptoDemo.zip 的算法）。
      没配 Token/AESKey 时，只要 `ACT_STRICT` 没被关掉就**一律拒绝**（fail-closed）：
      宁可活动查不到条件，也不让一个谁都能调的接口暴露玩家进度。
   ② 取 OpenId（`MiniGame.OpenId`，文档字段表里叫 `ActOpenId`，两个都认）。
   ③ 去 `saves` 集合读**这个小块**：`{ act: { loginDays, playMinutes, clears, at } }`
      —— 由客户端推档时顺手写上（`js/sc-cloud.js`）。**payload 那串密文一个字都不读**，
      也就没有"把存档解密逻辑抄第二份"这件事（派单点名）。
   ④ 交给 `lib/cond.js` 算，回那三样。**查不到档 / 读库出错 / 超时 → IsConditionSatisfied:false**，
      回包永远是 200 与 ErrCode 0（"回错"比"回没达成"危害大得多）。

   ---- 环境变量（云函数配置里填，全都有默认值）-------------------------------
     ACT_TOKEN         MP「自定义条件」里配的 Token（**必填**，否则严格模式下全拒）
     ACT_AES_KEY       EncodingAESKey（43 字符；配了才支持加密模式）
     ACT_APPID         默认 `wx61631124a2f9084b`（解出来要对上它，对不上＝拒绝）
     ACT_PATH_SECRET   可选：URL 上必须带 `?k=<它>`（多一道门闩，防地址被人扫到乱打）
     ACT_STRICT        默认 `1`（严格）。`0` ＝ 允许"平台没配 Token 的明文请求"（**测试期才用**）
     ACT_SAVE_COLL     默认 `saves`
     ACT_PARAM_MAP     可选：占位符改名，如 `{"login_days":"days"}`
     ACT_HTTP_WRAP     默认 `0`。`1` ＝ 把回包装进 `{statusCode,headers,body}`（HTTP 访问服务
                       若要求"完整响应"格式时打开；默认那种直返对象的形式云开发会 JSON 化）

   ⚠️ 部署这三步在康康/父亲大人手上（我这边跑不了）：① 上传并部署本函数；
      ② 云开发控制台 → HTTP 访问服务 → 把 `/gameact` 绑到本函数；③ 填环境变量 ＋ 把地址填进 MP。
      清单见回单《要父亲大人在后台配什么》。 */
const cloud = require('wx-server-sdk');
const V = require('./lib/verify');
const C = require('./lib/cond');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ENV = process.env || {};
const COLL = ENV.ACT_SAVE_COLL || 'saves';
const TOKEN = String(ENV.ACT_TOKEN || '');
const AES_KEY = String(ENV.ACT_AES_KEY || '');
const APPID = String(ENV.ACT_APPID || 'wx61631124a2f9084b');
const PATH_SECRET = String(ENV.ACT_PATH_SECRET || '');
const STRICT = String(ENV.ACT_STRICT === undefined ? '1' : ENV.ACT_STRICT) !== '0';
const WRAP = String(ENV.ACT_HTTP_WRAP || '0') === '1';
const DB_WAIT_MS = 1200;                 // 读库最长等这么久，超了就按"没达成"回（不许让平台等到超时）

function log() {
  try { console.log.apply(console, ['[gameact]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
}

/* ---------- 回包（两种形状，内容同一份） ----------
   V1.0.4 · W（第一次独立复核补的两处口径，官方《消息推送》原文）：
     · **安全模式的回包必须加密**（「其他回包内容需加密处理」）：平台那边解不开明文 JSON。
       所以 `send` 认一个 ctx：这一趟请求是密文进来的 → 回包也加密（Encrypt ＋ MsgSignature）。
     · **URL 校验那次 GET 要回 echostr 原文**（文档：`验签通过后，请原样返回 echostr 字符串`）。
       回一个 JSON 壳子（{"echo":…}）平台判它"地址不通" —— 见下面的 `rawText()`。
       ⚠️ 严格模式下的 GET 若带 `msg_signature`（安全模式的地址校验），echostr 本身是密文，
          要**先解密再回明文**（见 main 的 ② 段）。 */
function send(obj, ctx) {
  let out = obj;
  if (ctx && ctx.secure && AES_KEY) {
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = String(ctx.nonce || '');
    const enc = V.encrypt(AES_KEY, JSON.stringify(obj), APPID);
    out = { Encrypt: enc, MsgSignature: V.signOf(TOKEN, ts, nonce, enc), TimeStamp: ts, Nonce: nonce };
  }
  if (!WRAP) return out;
  return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(out) };
}
/** URL 校验专用：正文就是那一串原文（任何 JSON 壳子都会让平台判"地址不通"） */
function rawText(s) {
  return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: String(s == null ? '' : s) };
}
/** 拒绝：ErrCode 非 0（文档：「非0表示失败」），玩家那边最多是"查不到条件"，不会拿到数据 */
function deny(code, why, ctx) {
  log('deny', code, why);
  return send({ ErrCode: code, ErrMsg: String(why || 'denied') }, ctx);
}

/* ---------- 取请求（HTTP 访问服务 / 直接调用两种形状都认） ---------- */
function readReq(event) {
  const e = event || {};
  const q = Object.assign({}, e.queryStringParameters || {}, e.query || {});
  let body = e.body;
  if (e.isBase64Encoded && typeof body === 'string') {
    try { body = Buffer.from(body, 'base64').toString('utf8'); } catch (err) { body = ''; }
  }
  /* 没有 body 字段、但整包本来就是平台那串 JSON（云函数被直接触发时）→ 当 body 用 */
  let direct = null;
  if (body === undefined || body === null || body === '') {
    if (e.MiniGame || e.Event) direct = e;
    body = '';
  }
  return {
    method: String(e.httpMethod || (direct ? 'POST' : 'GET')).toUpperCase(),
    query: q,
    body: String(body == null ? '' : body),
    direct: direct,
  };
}

function safeJson(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

/* ---------- 读计数块（只读 `act` 这一小块，绝不碰 payload） ---------- */
function readAct(openid) {
  const q = db.collection(COLL).where({ _openid: String(openid) }).limit(1).get()
    .then(function (r) {
      const doc = ((r && r.data) || [])[0];
      if (!doc) return null;
      const act = doc.act;
      return (act && typeof act === 'object') ? act : null;
    })
    .catch(function (e) { log('read_fail', String((e && (e.errMsg || e.message)) || 'err')); return null; });
  /* 时间上限：不让一次数据库抖动把平台那一下拖成超时（超时＝平台记一次失败） */
  return new Promise(function (resolve) {
    let done = false;
    const timer = setTimeout(function () { done = true; log('read_timeout'); resolve(null); }, DB_WAIT_MS);
    q.then(function (v) { if (done) return; done = true; clearTimeout(timer); resolve(v); });
  });
}

/* ---------- 条件应答 ---------- */
function answer(conditionId, act, extraLog, ctx) {
  const r = C.evaluate(conditionId, act, ENV);
  log('cond', String(conditionId), 'sat=' + r.IsConditionSatisfied,
    JSON.stringify(r.TemplateParamMap), r.unknown ? 'unknown_condition' : (r.missing ? 'no_act' : ''), extraLog || '');
  /* 只把文档里那三样发出去（unknown / missing 是给控制台日志看的内部标记，不往外带） */
  const wire = { ErrCode: Number(r.ErrCode) || 0, IsConditionSatisfied: !!r.IsConditionSatisfied, TemplateParamMap: r.TemplateParamMap };
  if (r.ErrMsg) wire.ErrMsg = String(r.ErrMsg);
  return send(wire, ctx);
}

exports.main = async (event) => {
  const req = readReq(event);
  const q = req.query;
  const ctx = { secure: false, nonce: q.nonce };      // 这一趟是不是密文进来的（回包要跟着加密）

  /* ① 门闩（可选）：URL 上的口令。地址被人扫到时，连验签那一步都不用给它走 */
  if (PATH_SECRET && String(q.k || '') !== PATH_SECRET) return deny(403, 'bad_path_secret', ctx);

  /* ② URL 校验（平台检查"地址通不通"那次 GET）：验签 ＋ **原样回 echostr 字符串**。
        安全模式下这一趟的 echostr 也是密文 ⇒ 用 msg_signature 验 ＋ 解密，再回明文。 */
  if (req.method === 'GET') {
    let echo = String(q.echostr || '');
    const isAesEcho = String(q.encrypt_type || '') === 'aes' || !!q.msg_signature;
    if (isAesEcho && AES_KEY) {
      if (!V.checkMsgSignature(TOKEN, q.timestamp, q.nonce, echo, q.msg_signature)) return deny(401, 'bad_msg_signature', ctx);
      try { echo = V.decrypt(AES_KEY, echo).msg; }
      catch (e) { return deny(401, 'decrypt_failed:' + ((e && e.message) || 'err'), ctx); }
    } else if (TOKEN) {
      if (!V.checkPlainSignature(TOKEN, q.timestamp, q.nonce, q.signature)) return deny(401, 'bad_signature', ctx);
    } else if (STRICT) {
      return deny(403, 'no_token_configured', ctx);
    }
    return rawText(echo);
  }

  /* ③ 取正文：加密模式（body 是 {"Encrypt": "..."}）先验 msg_signature 再解密；否则按明文验签 */
  const rawBody = req.body;
  let payload = null;
  const bodyObj = safeJson(rawBody);
  if (bodyObj && typeof bodyObj.Encrypt === 'string' && bodyObj.Encrypt) {
    ctx.secure = true;
    if (!AES_KEY) return deny(401, 'aes_key_not_configured', ctx);
    if (!V.checkMsgSignature(TOKEN, q.timestamp, q.nonce, bodyObj.Encrypt, q.msg_signature)) {
      return deny(401, 'bad_msg_signature', ctx);
    }
    let dec = null;
    try { dec = V.decrypt(AES_KEY, bodyObj.Encrypt); }
    catch (e) { return deny(401, 'decrypt_failed:' + ((e && e.message) || 'err'), ctx); }
    if (APPID && dec.appid && dec.appid !== APPID) return deny(401, 'appid_mismatch', ctx);
    payload = safeJson(dec.msg);
  } else {
    if (TOKEN) {
      if (!V.checkPlainSignature(TOKEN, q.timestamp, q.nonce, q.signature)) return deny(401, 'bad_signature', ctx);
    } else if (STRICT) {
      return deny(403, 'no_token_configured', ctx);
    }
    payload = req.direct || bodyObj;
  }
  if (!payload || typeof payload !== 'object') return deny(400, 'bad_body', ctx);

  /* ④ 事件名（不是我们认的那条就明确说不认，别假装处理过） */
  if (payload.Event && String(payload.Event) !== 'minigame_act_event_query_condition') {
    log('unknown_event', String(payload.Event));
    return send({ ErrCode: 0, IsConditionSatisfied: false, ErrMsg: 'unknown_event' }, ctx);
  }

  const g = payload.MiniGame || payload.miniGame || {};
  const openid = String(g.OpenId || g.ActOpenId || '');
  const conditionId = String(g.ConditionId || '');
  if (!openid) { log('no_openid'); return answer(conditionId, null, 'no_openid', ctx); }

  const act = await readAct(openid);
  return answer(conditionId, act, act ? '' : 'no_doc', ctx);
};
