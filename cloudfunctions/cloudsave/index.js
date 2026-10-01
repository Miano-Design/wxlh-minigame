/* 云存档云函数 `cloudsave`（2026-10-01 · R1.2 · P0）
   ==============================================================================
   父亲大人 2026-10-01 的任务书（R1.2 · P0）点名三件事，这一支就是它们的落地：

     ① **客户端永远不许扫 `saves` 整个集合**。
        原来客户端是 `collection('saves').where({}).get()`（空条件＝集合扫描），
        靠"数据库权限只回自己那条"把自己那条筛出来 —— 权限一旦配宽，整张表就被拉下来了。
        现在：**客户端一行云数据库代码都没有**，读写全走本函数。

     ② **一个微信账号 = 唯一一份正式云存档**。
        记录 `_id` 由 OPENID 推导（`sha1('wxlh|' + openid)` 前 30 位）⇒ 天然唯一，
        两台设备同时首推也不可能各建一条。老记录（随机 `_id`）在第一次访问时**自动归并**：
        取最新那条搬进确定性 `_id`，更旧那条塞进同一条的 `prev*` 栏（找回存档能回溯），
        然后删掉老的 —— 全程不丢字节。

     ③ **双端单活由服务端强制**（不再靠客户端"自觉"）。
        · `claim`：开机 / 回前台 = 一次"登陆" ⇒ 服务端把 `lease` 原子地换成本机的新 token；
        · `push` ：**条件更新** `where({_id, 'lease.token': 本机token})` ——
          token 对不上就 `stats.updated === 0`，**一个字都不会写进去**。
          所以"B 抢到租约 → A 仍拿旧 doc → A update 整条记录"这条路是**物理上不存在**的。

   ---- 服务端能看到的（也只看到这些）----------------------------------------
     openid（`getWXContext().OPENID`）· payload（**密文原样，本函数不解**）· ts · bytes · ver · act
     · lease{token,id,ts} · prev*
   ⚠️ `js/mem-guard.js` 的加解密**绝不复制到这里** —— 服务端不需要、也不允许看懂玩家存档。
   返回给客户端的 doc **只有自己的那一条**（其它账号的记录永远不会出现在任何应答里）。

   ---- 与既有那支 `savecode` 的分工 ------------------------------------------
     `savecode` 管"跨账号搬档"的 8 位短码；本函数管"同一个账号自己的那一份"。
     两支职责不混。

   ---- 与 `notify` / `gameact` 的关系 -----------------------------------------
     那两支照样直接读 `saves` 的 `act` 小块（服务端读，合规）。所以本函数写的时候
     **必须用 `update`（合并）而不是 `set`（替换）**，否则会把 `notify` 的 `notifyAt` 记号抹掉
     —— 全量替换只在"归并老记录"那一处用，且把那两个字段显式搬过去。 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLL = 'saves';
const MAX_CHARS = 256 * 1024;          // 存档密文上限（当前约 16KB；真超了就让玩家走导出/导入）

/* ---------- 与客户端 `js/sc-cloud.js` 的 fpOf **同一套**哈希 ----------
   导出档信封里的账号指纹就是它。两处必须逐字一致，否则老导出档在跨端导入时会被判"不是同一个账号"。
   （客户端：32 位 FNV-1a，`(h >>> 0).toString(16)`；这里照抄，不做第二套。） */
function fnv(s) {
  s = String(s == null ? '' : s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function fpOf(openid) { return openid ? ('A' + fnv(openid)) : ''; }

/* ---------- 确定性 `_id`：一个 OPENID ↔ 一条记录 ----------
   sha1 前 30 位十六进制（120 bit）—— 撞车概率可以忽略；OPENID 本身不进 `_id`。 */
function docIdOf(openid) {
  return 'CS' + crypto.createHash('sha1').update('wxlh|' + String(openid)).digest('hex').slice(0, 30);
}
function newToken() { return crypto.randomBytes(18).toString('hex'); }
const num = (v) => (Number(v) || 0);
const str = (v) => String(v == null ? '' : v);

async function getById(id) {
  try {
    const r = await db.collection(COLL).doc(id).get();
    return (r && r.data) ? r.data : null;
  } catch (e) { return null; }          // 不存在（doc.get 会抛）—— 不是错误
}

/** 找到"这个账号唯一那条"；老结构（随机 `_id`、可能多条）在这一步自动归并成一条。 */
async function ensure(openid) {
  const id = docIdOf(openid);
  const cur = await getById(id);
  if (cur) return { id: id, doc: cur };

  /* 老记录：同一个 openid 名下的全部（正常情况下 0~2 条；截 20 条足够兜底） */
  let list = [];
  try {
    const q = await db.collection(COLL).where({ _openid: openid }).limit(20).get();
    list = (q && q.data) || [];
  } catch (e) { list = []; }
  if (!list.length) return { id: id, doc: null };          // 这个账号还没有云存档

  list.sort((a, b) => num(b.ts) - num(a.ts));
  const main = list[0];
  const rest = list.slice(1);
  const patch = {
    _openid: openid,
    payload: str(main.payload), ts: num(main.ts), bytes: num(main.bytes) || str(main.payload).length,
    ver: str(main.ver), at: num(main.at),
    act: main.act || null,
    prevPayload: str(main.prevPayload), prevTs: num(main.prevTs),
    prevBytes: num(main.prevBytes), prevAt: num(main.prevAt),
    /* ⚠️ `notify` 的记号必须搬过来 —— 它记在记录顶层，不搬就等于让玩家再收一次推送 */
    notifyAt: num(main.notifyAt), notifyErr: main.notifyErr || null,
    lease: main.lease || null,
    migratedAt: Date.now(),
  };
  /* 归并时**先保旧档**：另一条（更旧的）那份进 `prev*`，与平时"云端被覆盖"同一个口径 */
  const older = rest.find((x) => x && x.payload && str(x.payload) !== patch.payload);
  if (older) {
    patch.prevPayload = str(older.payload);
    patch.prevTs = num(older.ts);
    patch.prevBytes = str(older.payload).length;
    patch.prevAt = Date.now();
  }
  await db.collection(COLL).doc(id).set({ data: patch });
  /* 搬完再删老的 —— 顺序不能反（先删后写，中间失败就是真丢档） */
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d || !d._id || d._id === id) continue;
    try { await db.collection(COLL).doc(d._id).remove(); } catch (e) {}
  }
  return { id: id, doc: await getById(id) };
}

/** 返回给客户端的形状：**只有自己的那一条**，且不含 `_id` / `_openid`。 */
function publicDoc(doc) {
  if (!doc) return null;
  return {
    payload: str(doc.payload), ts: num(doc.ts), bytes: num(doc.bytes) || str(doc.payload).length,
    ver: str(doc.ver), at: num(doc.at), act: doc.act || null,
    prevPayload: str(doc.prevPayload), prevTs: num(doc.prevTs),
    prevBytes: num(doc.prevBytes), prevAt: num(doc.prevAt),
    /* 租约交给客户端只为**UI 判断**（谁在场）；真正的强制在 push 那道的条件更新上 */
    lease: doc.lease ? { id: str(doc.lease.id), ts: num(doc.lease.ts) } : null,
  };
}

exports.main = async (event) => {
  const wx = cloud.getWXContext();
  const openid = wx.OPENID || '';
  if (!openid) return { ok: false, msg: 'no_openid' };       // 拿不到账号 = 什么都没法做

  const action = str(event && event.action);
  const now = Date.now();

  /* ---------- 读：自己的那一条（没有就 null） ---------- */
  if (action === 'pull') {
    const r = await ensure(openid);
    return { ok: true, fp: fpOf(openid), doc: publicDoc(r.doc), hasDoc: !!r.doc };
  }

  /* ---------- 占位（登陆）：把租约原子地换成本机的新 token ----------
     "以晚登陆的为主"就落在这一句上：谁后调它，谁就是当前设备。
     记录还不存在时（首次）占不了位 —— 但 `push` 建记录时会把同一个 token 一起写进去。 */
  if (action === 'claim') {
    const r = await ensure(openid);
    const token = newToken();
    const device = str(event && event.device).slice(0, 32);
    if (r.doc) {
      try {
        await db.collection(COLL).where({ _id: r.id })
          .update({ data: { lease: { token: token, id: device, ts: now } } });
      } catch (e) { return { ok: false, msg: 'claim_fail' }; }
    }
    return { ok: true, token: token, ts: now, hasDoc: !!r.doc };
  }

  /* ---------- 写：**条件更新**，token 对不上就一个字都不写 ---------- */
  if (action === 'push') {
    const token = str(event && event.token);
    if (!token) return { ok: false, msg: 'no_token' };
    const payloadIn = str(event && event.payload);
    if (!payloadIn) return { ok: false, msg: 'empty' };
    if (payloadIn.length > MAX_CHARS) return { ok: false, msg: 'too_big' };

    const r = await ensure(openid);
    const device = str(event && event.device).slice(0, 32);
    const data = {
      payload: payloadIn,
      ts: num(event.ts) || now,
      bytes: num(event.bytes) || payloadIn.length,
      ver: str(event.ver),
      at: now,
      act: event.act || null,
      lease: { token: token, id: device, ts: now },
    };
    /* 云端被本地覆盖 → 旧云端另留一份（与老口径一字不差） */
    if (r.doc && r.doc.payload && str(r.doc.payload) !== payloadIn) {
      data.prevPayload = str(r.doc.payload);
      data.prevTs = num(r.doc.ts);
      data.prevBytes = str(r.doc.payload).length;
      data.prevAt = now;
    }

    if (r.doc) {
      /* ① 正路：拿本机 token 做**原子**条件更新 */
      const res = await db.collection(COLL).where({ _id: r.id, 'lease.token': token }).update({ data: data });
      if (res && res.stats && res.stats.updated === 1) {
        return { ok: true, pushed: true, ts: data.ts, at: now, bytes: data.bytes, prev: !!data.prevPayload };
      }
      /* ①′ 那条从来没有过租约（老版本写下的记录）→ 允许接手一次（两个条件都不匹配就还是拒绝） */
      if (!(r.doc.lease && r.doc.lease.token)) {
        const res2 = await db.collection(COLL).where({ _id: r.id, lease: _.exists(false) }).update({ data: data });
        if (res2 && res2.stats && res2.stats.updated === 1) {
          return { ok: true, pushed: true, ts: data.ts, at: now, bytes: data.bytes, prev: !!data.prevPayload };
        }
        const res3 = await db.collection(COLL).where({ _id: r.id, 'lease.token': '' }).update({ data: data });
        if (res3 && res3.stats && res3.stats.updated === 1) {
          return { ok: true, pushed: true, ts: data.ts, at: now, bytes: data.bytes, prev: !!data.prevPayload };
        }
      }
      /* ② 被顶下线：**服务端说了算**（客户端本地 `superseded === false` 也没用） */
      return { ok: false, msg: 'superseded', lease: r.doc.lease ? { id: str(r.doc.lease.id), ts: num(r.doc.lease.ts) } : null };
    }

    /* ③ 还没有那条 → 建。`_id` 是确定性的 ⇒ 两台同时建也只有一条成立 */
    try {
      await db.collection(COLL).add({ data: Object.assign({ _id: r.id, _openid: openid }, data) });
      return { ok: true, pushed: true, created: true, ts: data.ts, at: now, bytes: data.bytes, prev: false };
    } catch (e) {
      /* 已经被另一台抢建了 → 回到条件更新那条路（本机 token 必然对不上 → 拒绝） */
      const res = await db.collection(COLL).where({ _id: r.id, 'lease.token': token }).update({ data: data });
      if (res && res.stats && res.stats.updated === 1) {
        return { ok: true, pushed: true, ts: data.ts, at: now, bytes: data.bytes, prev: !!data.prevPayload };
      }
      return { ok: false, msg: 'superseded', lease: null };
    }
  }

  return { ok: false, msg: 'unknown_action' };
};
