/* 微信服务器（HTTP）适配层 —— 纯逻辑，不碰数据库、不碰网络，所以尺子能直接喂包
   ==============================================================================
   为什么需要它：官方那条路只有一种接法 —— **开发者服务器 URL**。
   微信在配置消息推送时会先发一个 **GET** 来验地址（要原样回 `echostr`），
   之后才把发货单用 **POST** 打过来。两种都带 `signature`，必须验。

   签名算法（官方原文）：
     把 `Token` / `timestamp` / `nonce` 三个参数**按字典序排序** → 拼接成一个字符串
     → 做 `sha1` → 就是 `signature`。

   ⚠️ 两条**别自作聪明**的地方：
     1. `sort()` 是**默认的字典序**（不是长短、不是数字大小）—— 官方例子里的
        `["1514711492","1714036504","AAAAA"]` 正是这个顺序（数字串排在字母前）。
        尺子拿官方那个例子当**金标准**钉死了（token=AAAAA / ts=1714036504 / nonce=1514711492
        → `f464b24fc39322e44b38aa78f5edd27bd1441696`）。
     2. 验签要**定时比较**（`timingSafeEqual`），别用 `===` —— 别给爆破留时间差。 */
const crypto = require('crypto');

function signatureOf(token, timestamp, nonce) {
  const parts = [String(token == null ? '' : token),
    String(timestamp == null ? '' : timestamp),
    String(nonce == null ? '' : nonce)];
  return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
}

function checkSignature(token, signature, timestamp, nonce) {
  if (!token || !signature) return false;
  const mine = Buffer.from(signatureOf(token, timestamp, nonce));
  const got = Buffer.from(String(signature));
  if (mine.length !== got.length) return false;
  try { return crypto.timingSafeEqual(mine, got); } catch (e) { return false; }
}

/** 云开发「HTTP 访问服务」给云函数的 event 形状 → 一个干净的三元组；不是 HTTP 事件就 null。 */
function readHttp(event) {
  const e = event || {};
  if (!e.httpMethod && !e.queryStringParameters) return null;
  let body = String(e.body == null ? '' : e.body);
  if (e.isBase64Encoded) { try { body = Buffer.from(body, 'base64').toString('utf8'); } catch (err) { body = ''; } }
  return { method: String(e.httpMethod || 'GET').toUpperCase(), query: e.queryStringParameters || {}, body: body };
}

/** 回包：`{statusCode, headers, body}` —— 云开发 HTTP 访问服务认这个形状。 */
function httpReply(statusCode, body, contentType) {
  return {
    statusCode: Number(statusCode) || 200,
    headers: { 'Content-Type': contentType || 'text/plain; charset=utf-8' },
    body: String(body == null ? '' : body),
  };
}

/** 把一条 HTTP 请求判成一个动作（**判据全在这里，上层只照着做**）。 */
function routeHttp(event, token) {
  const req = readHttp(event);
  if (!req) return null;                                   // 不是 HTTP 事件（是 callFunction）
  const q = req.query || {};
  if (!checkSignature(token, q.signature, q.timestamp, q.nonce)) return { act: 'deny' };
  if (req.method === 'GET') return { act: 'echo', echostr: String(q.echostr == null ? '' : q.echostr) };
  if (req.method === 'POST') {
    let body = null;
    try { body = JSON.parse(req.body || '{}'); }
    catch (e) { return { act: 'badjson' }; }
    /* 安全模式：包体是纯密文 `{ToUserName, Encrypt}`，**不能拿 signature 验**（官方原话），
       要拿 token/timestamp/nonce/Encrypt 四个值算 `msg_signature`。 */
    if (body && body.Encrypt) {
      return { act: 'enc', body: body, query: q };
    }
    return { act: 'msg', msg: body };
  }
  return { act: 'method', method: req.method };
}

/* ============================================================================
   安全模式（AES-256-CBC）
   ==============================================================================
   官方原文：`AESKey = Base64_Decode(EncodingAESKey + "=")`（32 字节）；
   密文 Base64 解码后做 **CBC / PKCS#7** 解密，得到
     `FullStr = random(16B) + msg_len(4B, 网络字节序) + msg + appid`
   并**必须校验 appid 与本小程序相符**（不校验就等于谁都能伪造一条"合法"密文）。

   金标准（**直接用官方文档那一组**，不是我自造自验）：
     EncodingAESKey = 'A'×43 · Token = 'AAAAA' · ts=1714112445 · nonce=415670741
     密文 → 明文 `{"ToUserName":"gh_97417a04a28d",...,"debug_str":"hello world"}`
     签名 → `046e02f8204d34f8ba5fa3b1db94908f3df2e9b3` */
function aesKeyOf(encodingAESKey) {
  return Buffer.from(String(encodingAESKey == null ? '' : encodingAESKey) + '=', 'base64');
}
function pkcs7Unpad(buf) {
  if (!buf || !buf.length) return buf;
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32 || pad > buf.length) return buf;
  return buf.slice(0, buf.length - pad);
}
/** 解出 `{msg, appid}`；任何一步不对都抛（**宁可炸也不要"假装解开了"**）。 */
function decryptMsg(encodingAESKey, encryptB64) {
  const key = aesKeyOf(encodingAESKey);
  if (key.length !== 32) throw new Error('bad aes key length ' + key.length);
  const iv = key.slice(0, 16);
  const dec = crypto.createDecipheriv('aes-256-cbc', key, iv);
  dec.setAutoPadding(false);                                // PKCS#7 我们自己剥（下面的 unpad）
  const raw = Buffer.concat([dec.update(Buffer.from(String(encryptB64), 'base64')), dec.final()]);
  const full = pkcs7Unpad(raw);
  if (full.length < 20) throw new Error('too short');
  const msgLen = full.readUInt32BE(16);
  const msg = full.slice(20, 20 + msgLen).toString('utf8');
  const appid = full.slice(20 + msgLen).toString('utf8');
  return { msg: msg, appid: appid };
}
/** 安全模式下的签名：token / timestamp / nonce / Encrypt **四个**字典序排序再 sha1。 */
function msgSignatureOf(token, timestamp, nonce, encrypt) {
  return crypto.createHash('sha1').update([String(token == null ? '' : token),
    String(timestamp == null ? '' : timestamp),
    String(nonce == null ? '' : nonce),
    String(encrypt == null ? '' : encrypt)].sort().join('')).digest('hex');
}
function checkMsgSignature(token, signature, timestamp, nonce, encrypt) {
  if (!token || !signature) return false;
  const mine = Buffer.from(msgSignatureOf(token, timestamp, nonce, encrypt));
  const got = Buffer.from(String(signature));
  if (mine.length !== got.length) return false;
  try { return crypto.timingSafeEqual(mine, got); } catch (e) { return false; }
}

/** 加密（微信→我们那条路的**逆运算**）。生产路径用不到它 ——
    存在的唯一理由是**尺子能造一条真密文**去打云函数，把"安全模式"这条腿端到端验通，
    而不是只验一个解密函数。 */
function encryptMsg(encodingAESKey, msg, appid) {
  const key = aesKeyOf(encodingAESKey);
  if (key.length !== 32) throw new Error('bad aes key length ' + key.length);
  const body = Buffer.from(String(msg == null ? '' : msg), 'utf8');
  const app = Buffer.from(String(appid == null ? '' : appid), 'utf8');
  const head = Buffer.alloc(20);
  crypto.randomBytes(16).copy(head, 0);
  head.writeUInt32BE(body.length, 16);
  let buf = Buffer.concat([head, body, app]);
  const padN = (32 - (buf.length % 32)) || 32;              // PKCS#7：K=32
  buf = Buffer.concat([buf, Buffer.alloc(padN, padN)]);
  const iv = key.slice(0, 16);
  const enc = crypto.createCipheriv('aes-256-cbc', key, iv);
  enc.setAutoPadding(false);
  return Buffer.concat([enc.update(buf), enc.final()]).toString('base64');
}

module.exports = { signatureOf: signatureOf, checkSignature: checkSignature,
  readHttp: readHttp, httpReply: httpReply, routeHttp: routeHttp,
  aesKeyOf: aesKeyOf, decryptMsg: decryptMsg, encryptMsg: encryptMsg,
  msgSignatureOf: msgSignatureOf, checkMsgSignature: checkMsgSignature };
