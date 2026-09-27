/* 存档码云函数 `savecode`（2026-09-27 · 0927-L2）
   ==============================================================================
   父亲大人：「导出不要再搬 17KB 文字了」——小游戏里没有文本框可粘贴，长串密文挪一次很痛苦。
   这里把那份密文换成 **8 位短码**：另一台设备把码贴进来就能取回，不用搬那一大坨。

   两个动作（客户端只调这两个）：
     · upload {data}  → 存一份密文，返回 {ok, code, expireAt}
     · claim  {code}  → 校验**没过期**且**没用过** → 返回 {ok, data, createdAt}，并把这条标记为已用

   口径（父亲大人选的默认那档）：**24 小时有效 ＋ 用一次即失效**。
   —— 界面上不做"7 天可多次"那一档；将来真要卖号/长时效，把 TTL_MS 与下面 claim 里的
      `used` 判断改成"计数"就行（一行改动，客户端不用动）。

   ⚠️ 为什么必须有云函数（而不是客户端直连集合）：
     ① 客户端写不进"别人那条"、也读不到（默认权限只认自己的 `_openid`），而码天生是**跨账号**搬的；
     ② "用过就作废"必须是**服务端**那一下判断，否则同时两台设备能各领一次。
   集合 `save_codes`：{ code, data, openid, createdAt, expireAt, used, usedAt, usedBy }
      · `data` 是**客户端那份密文原样**（服务端看不懂、也不解）；
      · `openid` = 生成者（谁生成的），`usedBy` = 取回者（同一个人的另一台设备就是同一个 openid）。 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLL = 'save_codes';
const CODE_LEN = 8;
/* ⚠️ 字母表**去掉易混的 O / 0 / I / 1**（父亲大人点名）：剩下 24 个字母 ＋ 8 个数字 ＝ 32 个符号，
   32^8 ≈ 1.1 万亿种，24 小时里撞车概率可以忽略（下面还有一次存在性复查）。 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 24 * 3600 * 1000;          // 24 小时有效
const KEEP_MS = 7 * 24 * 3600 * 1000;     // 过期码再留 7 天（方便对账），之后清掉
const MAX_CHARS = 64 * 1024;              // 存档密文上限（当前约 7KB；真超了就让玩家走导出/导入）

function randCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
function normCode(s) {
  const t = String(s == null ? '' : s).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (t.length === CODE_LEN) return t;
  const m = new RegExp('[A-HJ-NP-Z2-9]{' + CODE_LEN + '}').exec(t);
  return m ? m[0] : '';
}

exports.main = async (event) => {
  const action = String((event && event.action) || '');
  const wx = cloud.getWXContext();
  const openid = wx.OPENID || '';
  const now = Date.now();

  if (action === 'upload') {
    const data = String((event && event.data) || '');
    if (!data) return { ok: false, msg: 'empty' };
    if (data.length > MAX_CHARS) return { ok: false, msg: 'too_large' };
    /* 生成一个没被用过的码（撞了就再摇一次，最多 5 次） */
    for (let i = 0; i < 5; i++) {
      const code = randCode();
      const dup = await db.collection(COLL).where({ code }).count();
      if (dup && dup.total) continue;
      const expireAt = now + TTL_MS;
      await db.collection(COLL).add({
        data: { code, data, openid, createdAt: now, expireAt, used: false, usedAt: 0, usedBy: '' },
      });
      /* 顺手清掉"过期超过 7 天"的老码（只删自己这条时间线之外的陈货，失败不影响本次生成）。 */
      try {
        await db.collection(COLL).where({ expireAt: _.lt(now - KEEP_MS) }).remove();
      } catch (e) { /* 清理失败不是错误：留着下一个人再清 */ }
      return { ok: true, code, expireAt, createdAt: now };
    }
    return { ok: false, msg: 'code_busy' };
  }

  if (action === 'claim') {
    const code = normCode((event && event.code) || '');
    if (code.length !== CODE_LEN) return { ok: false, msg: 'bad_code' };
    const res = await db.collection(COLL).where({ code }).limit(1).get();
    const doc = (res.data || [])[0];
    if (!doc) return { ok: false, msg: 'not_found' };
    if (doc.used) return { ok: false, msg: 'used' };                                  // ① 用过了
    if (Number(doc.expireAt) && now > Number(doc.expireAt)) return { ok: false, msg: 'expired' };  // ② 过期了
    /* 标记已用：条件里带 `used:false` —— 两台设备同时领，只有一边能把它改成 true。 */
    const upd = await db.collection(COLL).where({ code, used: false })
      .update({ data: { used: true, usedAt: now, usedBy: openid } });
    const updated = (upd && upd.stats && Number(upd.stats.updated)) || 0;
    if (updated !== 1) return { ok: false, msg: 'used' };
    /* 再读一眼确认"这一下是我写进去的"（极端并发下把窗口再收窄一次；输了就当他已经用过）。 */
    const chk = await db.collection(COLL).where({ code }).limit(1).get();
    const after = (chk.data || [])[0];
    if (after && (Number(after.usedAt) !== now || String(after.usedBy) !== String(openid))) {
      return { ok: false, msg: 'used' };
    }
    return { ok: true, data: String(doc.data || ''), createdAt: Number(doc.createdAt) || 0, expireAt: Number(doc.expireAt) || 0 };
  }

  return { ok: false, msg: 'bad_action' };
};
