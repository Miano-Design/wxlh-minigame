/* 微信「消息推送」验签 ＋ 解密（V1.0.4 · W 轮 · 游戏圈活跃任务）
   ==============================================================================
   这一份**不是自创**：算法逐条照微信官方示例代码 `cryptoDemo.zip`
   （开放文档《消息推送》里的「示例下载」→ https://wximg.gtimg.com/shake_tv/mpwiki/cryptoDemo.zip，
    2026-09-27 抓取；包内 `SampleCode/php/{sha1,pkcs7Encoder,wxBizMsgCrypt}.php` 与 Python 版同源）。

   ① 签名：`sha1( 排序后的 token / timestamp / nonce [/ encrypt] 拼成一个串 )`
      · 明文模式（URL 校验 / 明文推送）：token、timestamp、nonce 三个排序；
      · 加密模式：token、timestamp、nonce、**encrypt** 四个排序 → 就是 `msg_signature`。
      → php/sha1.php `getSHA1()`；文档原文「注意：不要使用 signature 验证！」（加密模式要用 msg_signature）。

   ② 解密：AES-256-CBC ＋ 自实现的 PKCS#7（块大小 **32**，不是 16）
      · AESKey = Base64_Decode( EncodingAESKey + "=" ) → 32 字节；IV = AESKey 前 16 字节；
      · 明文结构：**16 字节随机串 ＋ 4 字节网络序长度 ＋ 消息体 ＋ AppID**
      → php/pkcs7Encoder.php `Prpcrypt::decrypt()` 逐行对照。

   ⚠️ 为什么自己解 PKCS#7 而不用 Node 的 `setAutoPadding(true)`：
      微信示例的补位块大小写死 32（`PKCS7Encoder::$block_size = 32`），解密时按"最后一字节"
      去补位再剥 16+4 的头。这里**按原样实现**（`setAutoPadding(false)` ＋ 手写去填充），
      免得将来某次 Node 版本/补位口径变化把"能解"变成"偶发解不开"。

   ⚠️ 本文件**只做密码学**，不碰数据库、不判条件 —— 所以 `scripts/activity_audit.js`
      能把它和 cond.js 一起真跑，不需要云环境。 */
const crypto = require('crypto');

/** sha1 十六进制小写（与微信示例 `sha1($str)` 同一口径） */
function sha1Hex(s) {
  return crypto.createHash('sha1').update(String(s), 'utf8').digest('hex');
}

/** 字典序排序后拼接再 sha1（微信示例 `sort($array, SORT_STRING)` ＋ `implode`） */
function signOf(token, timestamp, nonce, extra) {
  const arr = [String(token == null ? '' : token), String(timestamp == null ? '' : timestamp), String(nonce == null ? '' : nonce)];
  if (extra != null) arr.push(String(extra));
  arr.sort();
  return sha1Hex(arr.join(''));
}

/** 定长比较（别用 === 比签名：能省掉一次时序侧信道，也顺便挡住非字符串入参） */
function same(a, b) {
  const x = Buffer.from(String(a == null ? '' : a), 'utf8');
  const y = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (x.length === 0 || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/** 明文模式验签（URL 校验用的就是这个：token/timestamp/nonce 三参） */
function checkPlainSignature(token, timestamp, nonce, signature) {
  if (!token || !signature || timestamp == null || nonce == null) return false;
  return same(signOf(token, timestamp, nonce, null), signature);
}

/** 加密模式验签（四参 ＋ encrypt；`msg_signature`） */
function checkMsgSignature(token, timestamp, nonce, encrypt, msgSignature) {
  if (!token || !encrypt || !msgSignature || timestamp == null || nonce == null) return false;
  return same(signOf(token, timestamp, nonce, encrypt), msgSignature);
}

/** EncodingAESKey（43 字符）→ 32 字节 AESKey */
function aesKeyOf(encodingAESKey) {
  const k = String(encodingAESKey == null ? '' : encodingAESKey);
  if (k.length !== 43) throw new Error('illegal_aes_key_len');
  const key = Buffer.from(k + '=', 'base64');
  if (key.length !== 32) throw new Error('illegal_aes_key');
  return key;
}

/**
 * 解密微信密文。返回 `{ msg, appid }`；解不开就抛（调用方一律当"拒绝"）。
 * @param {string} encodingAESKey 43 字符的 EncodingAESKey
 * @param {string} encryptBase64   密文（Base64）
 */
function decrypt(encodingAESKey, encryptBase64) {
  const key = aesKeyOf(encodingAESKey);
  const iv = key.slice(0, 16);
  const buf = Buffer.from(String(encryptBase64 == null ? '' : encryptBase64), 'base64');
  if (!buf.length || buf.length % 16 !== 0) throw new Error('illegal_cipher_len');
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  d.setAutoPadding(false);
  let out = Buffer.concat([d.update(buf), d.final()]);
  /* 去 PKCS#7 补位（微信示例：倒数第一字节；不在 1..32 就按 0 处理） */
  const pad = out.length ? out[out.length - 1] : 0;
  const cut = (pad >= 1 && pad <= 32) ? pad : 0;
  out = out.slice(0, out.length - cut);
  if (out.length < 20) throw new Error('illegal_buffer');
  const len = out.readUInt32BE(16);                     // 网络序（pack("N")）
  if (len < 0 || 20 + len > out.length) throw new Error('illegal_buffer');
  return {
    msg: out.slice(20, 20 + len).toString('utf8'),
    appid: out.slice(20 + len).toString('utf8'),
  };
}

/**
 * 加密回包（安全模式的应答要走这里）。
 * 官方原文（《消息推送》· 安全模式）：「回包给微信服务器…其他回包内容需加密处理」——
 * 明文 / 兼容模式下回纯 JSON 就行，**安全模式下平台等的是密文**，回明文它解析不了。
 * 结构与 `decrypt()` 严格对称：random(16B) ＋ msg_len(4B 网络序) ＋ msg ＋ appid，
 * 再用 PKCS#7（块大小 **32**，与微信示例 `PKCS7Encoder::$block_size = 32` 一致）补位。
 * @returns {string} Base64 密文
 */
function encrypt(encodingAESKey, msg, appid) {
  const key = aesKeyOf(encodingAESKey);
  const iv = key.slice(0, 16);
  const body = Buffer.from(String(msg == null ? '' : msg), 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length, 0);
  let full = Buffer.concat([crypto.randomBytes(16), len, body, Buffer.from(String(appid == null ? '' : appid), 'utf8')]);
  const pad = 32 - (full.length % 32);
  full = Buffer.concat([full, Buffer.alloc(pad, pad)]);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  c.setAutoPadding(false);                       // 补位自己来：微信示例块大小是 32，不是 16
  return Buffer.concat([c.update(full), c.final()]).toString('base64');
}

module.exports = { sha1Hex, signOf, same, checkPlainSignature, checkMsgSignature, decrypt, encrypt, aesKeyOf };
