/* 订阅消息的**纯判据**（V1.0.4 · X 轮）—— 与 wx-server-sdk 无关，尺子能直接 require（照 gameact 的做法）。
   判据只有一条：**订阅过 ＋ 银行满了 ＋ 这一次满还没认领 → 发**。缺任一条都不许发。

   ⚠️ "还没发过"看的是**记录顶层的 `notifyAt`**（＝上一次处理过的那份 `bankFullAt`），
      **不是 `act` 里的某一个键** —— 推档是**整块覆盖** `act`（`js/sc-cloud.js` 的 `data.act = act`），
      本地那份永远不知道云端改过哪一位，写在 `act` 里的记号**下一次推档就被抹掉**
      ⇒ 判据会以为"没发过"，同一份满被一轮一轮重发。顶层字段客户端一个字都不写，才存得住。
   ⚠️ 认领**在发送之前**（见 index.js）：官方文档明说触发器可能重复推送同一条，
      并发两跑也只该发一条；失败（含 43101 额度用完）同样只试一次，绝不重试到烧配额。 */

/* 把秒数写成"2小时30分"这种人话（关键词是"事物"类时用这个） */
function hhmm(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h <= 0) return m + '分钟';
  return h + '小时' + (m ? m + '分' : '');
}
/* 同一个秒数的 24 小时制写法（关键词若是"时间"类，只能填 02:30 这种） */
function hhmmColon(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const p = (n) => String(n).padStart(2, '0');
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60));
}
/* 收益：**纯整数**（54000）。不用"5.4万"：关键词若是**数字**类，带"万"字会被判参数不合规（47003）；
   纯数字在"数字 / 事物"两类下都合法 —— 模板类型还没核之前，选那个两边都不会错的口径。 */
function amount(n) { return String(Math.max(0, Math.floor(Number(n) || 0))); }

/* 这一条记录该不该发？ */
function shouldSend(rec, now, minIdleMs) {
  const a = (rec && rec.act) || null;
  if (!a) return false;
  if (Number(a.subMsg) !== 1) return false;                        // 没订阅 ⇒ 绝不打扰
  const full = Number(a.bankFullAt) || 0;
  if (!(full > 0)) return false;                                    // 没满 ⇒ 不发
  if (full > now) return false;                                     // 时间在未来（改过表）⇒ 不发
  if (Number((rec && rec.notifyAt) || 0) >= full) return false;      // 这一次满已经认领/发过 ⇒ 不重发
  if (minIdleMs && (now - full) < minIdleMs) return false;           // 刚满那一刻别急着发（默认不用）
  return true;
}

/* 三个关键词的值 —— **真发送与尺子共用这一份**（免得尺子量的是另一套）。
   keys ＝ MP 后台模板里那三个字段名（`thing1` 这种，见 index.js 的 KEY_MAP）。 */
function messageData(act, keys, opts) {
  const a = act || {}, K = keys || {}, o = opts || {};
  /* `durSec` ＝ **银行里攒了多久**（不是"满了之后过了多久"，见 index.js 那一段） */
  const sec = Math.max(0, Math.floor(Number(o.durSec) || 0));
  const dur = String(o.timeStyle || '') === 'colon' ? hhmmColon(sec) : hhmm(sec);
  const d = {};
  /* ⚠️ 默认 key 必须与 `index.js` 的 KEY_MAP 一致（**已按 MP 后台核对**：
     离线收益 thing1 / 挂机时长 thing8 / 温馨提示 thing4）。改一处就要改两处，见那个文件头的说明。 */
  d[K.income || 'thing1'] = { value: amount(a.bankAmount) };
  d[K.hours || 'thing8'] = { value: dur };
  d[K.tip || 'thing4'] = { value: String(o.tip || '挂机收益已经满了，回来收一下吧') };
  return d;
}

module.exports = { shouldSend: shouldSend, messageData: messageData, hhmm: hhmm, hhmmColon: hhmmColon, amount: amount };
