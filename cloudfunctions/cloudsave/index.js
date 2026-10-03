/* 云存档云函数 `cloudsave`（2026-10-01 · R1.2 收口 · **第二版：绕开 `update`**）
   ==============================================================================
   【这一版为什么重写】实测：这个云环境里
     · `doc(id).update(...)`        → `-502001 database request failed`
     · `where({_id}).update(...)`   → 同样 -502001（云库里 `_id` 不能当 update 条件）
     · `doc(id).set(...)`           → **真跑通了**（老记录归并那一步就是它）
   ⇒ 正式写入路径**不再使用任何 `update`**：
     · 占位（claim）：读全文 → 只换 `lease` → `set` 整份回去；
     · 推档（push）：走**服务端事务** `db.runTransaction`（事务里只允许 `doc` 操作、
       没有 `where` —— 我们本来就是确定性 `_id`，刚好不需要）。

   【保留不动的东西】
     · 确定性 `_id`：一个 OPENID ↔ 一条 `saves`（`'CS' + sha1('wxlh|'+openid).slice(0,30)`）；
     · "后登录设备生效"：`claim` 抢租约；`push` 只在 token 相符时放行；
     · 覆盖前留档：云端那份不同 → 进 `prev*`；
     · `notifyAt` / `notifyErr` / `act` / `prev*` 一个字段都不许丢（`set` 是整份替换，
       所以每一次都必须**先读全文、再改那几个字段**）。

   【错误必须能定位】所有数据库操作统一走 `dbErr(stage, e)` ——
   回去的永远是 `{ok:false, msg, stage, errCode, errMsg}`，不再是一行 "claim_fail"。

   ⚠️ 服务端**不解密玩家存档**（`mem-guard.js` 不复制到这里）：它只搬运密文
      `payload` 与 `ts/bytes/ver/act/lease/prev*` 这些短字段。 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLL = 'saves';
/* ================= 2026-10-03（任务书 §17「云函数部署必须真正核实」）=================
   GitHub 里这份源码改了 **不等于** 微信云端真的部署了新代码 —— 部署没跟上时，
   三台设备看起来"各说各话"，而客户端无从判断自己调的是哪一版。
   所以：**给这份云函数盖一个版本戳，并让 probe 原样回给客户端**。
   排查时只需在任意一台上跑 `GameGlobal.CloudSync.probe()`，看 version / env 就能确认
   三台是不是同一版云函数。改这份文件时**必须**把这个字符串一起改（当天的日期 + 代号）。 */
const CLOUDSAVE_VERSION = '2026-10-03-FINAL';
const ENV_TAG = String(process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'dyn');
const MAX_CHARS = 256 * 1024;

/* ---------- 与客户端 `js/sc-cloud.js` 的 fpOf **同一套**哈希（导出档信封里的账号指纹） ---------- */
function fnv(s) {
  s = String(s == null ? '' : s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function fpOf(openid) { return openid ? ('A' + fnv(openid)) : ''; }
function docIdOf(openid) {
  return 'CS' + crypto.createHash('sha1').update('wxlh|' + String(openid)).digest('hex').slice(0, 30);
}
function newToken() { return crypto.randomBytes(18).toString('hex'); }
const num = (v) => (Number(v) || 0);
const str = (v) => String(v == null ? '' : v);

/* ---------- 统一错误出口：**带 stage / errCode / errMsg** ---------- */
function dbErr(stage, e) {
  return {
    ok: false,
    msg: String(stage) + '_fail',
    stage: String(stage),
    errCode: String((e && (e.errCode || e.code)) || ''),
    errMsg: String((e && (e.errMsg || e.message || e)) || 'unknown').slice(0, 160),
  };
}
/** `set()` 的数据里**不能带 `_id`**（系统字段不能当普通字段写回去）；`_openid` 要保留。 */
function dataForSet(doc) {
  const out = Object.assign({}, doc || {});
  delete out._id;
  return out;
}

async function getById(id) {
  try {
    const r = await db.collection(COLL).doc(id).get();
    return (r && r.data) ? r.data : null;
  } catch (e) { return null; }          /* 不存在（doc.get 会抛）—— 不是错误 */
}

/** 定位"这个账号唯一那条"；老结构（随机 `_id`、可能多条）在这一步归并成一条。 */
async function ensure(openid) {
  const id = docIdOf(openid);
  const cur = await getById(id);
  if (cur) return { id: id, doc: cur };

  let list = [];
  try {
    const q = await db.collection(COLL).where({ _openid: openid }).limit(20).get();
    list = (q && q.data) || [];
  } catch (e) { list = []; }
  if (!list.length) return { id: id, doc: null };

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
    /* ⚠️ `notify` 的记号记在顶层，不搬就等于让玩家再收一次推送 */
    notifyAt: num(main.notifyAt), notifyErr: main.notifyErr || null,
    lease: main.lease || null,
    migratedAt: Date.now(),
  };
  const older = rest.find((x) => x && x.payload && str(x.payload) !== patch.payload);
  if (older) {
    patch.prevPayload = str(older.payload);
    patch.prevTs = num(older.ts);
    patch.prevBytes = str(older.payload).length;
    patch.prevAt = Date.now();
  }
  try { await db.collection(COLL).doc(id).set({ data: patch }); }
  catch (e) { return { id: id, doc: null, err: dbErr('migrate_set', e) }; }
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
    lease: doc.lease ? { id: str(doc.lease.id), ts: num(doc.lease.ts) } : null,
  };
}

/** 推档要写回去的**整份**（`set` 是整份替换 ⇒ 必须从 current 复制、只改该改的那几个）。 */
function buildPushDoc(current, input) {
  const next = dataForSet(current);
  const payloadIn = str(input.payload);
  const prevPayload = str(current.payload);
  if (prevPayload && prevPayload !== payloadIn) {
    next.prevPayload = prevPayload;
    next.prevTs = num(current.ts);
    next.prevBytes = prevPayload.length;
    next.prevAt = input.now;
  }
  next.payload = payloadIn;
  next.ts = num(input.ts) || input.now;
  next.bytes = num(input.bytes) || payloadIn.length;
  next.ver = str(input.ver);
  next.at = input.now;
  next.act = input.act || null;
  next.lease = { token: input.token, id: input.device, ts: input.now };
  return next;
}

exports.main = async (event) => {
  const wx = cloud.getWXContext();
  const openid = wx.OPENID || '';
  if (!openid) return { ok: false, msg: 'no_openid', stage: 'openid' };

  const action = str(event && event.action);
  const now = Date.now();

  /* ================= 读：自己的那一条（没有就 null） ================= */
  if (action === 'pull') {
    const r = await ensure(openid);
    if (r.err) return r.err;
    return { ok: true, fp: fpOf(openid), doc: publicDoc(r.doc), hasDoc: !!r.doc };
  }

  /* ================= 占位（登陆）：**读全文 → 只换 lease → set 整份** ================= */
  if (action === 'claim') {
    const r = await ensure(openid);
    if (r.err) return r.err;
    const token = newToken();
    const device = str(event && event.device).slice(0, 32);
    if (r.doc) {
      const full = dataForSet(r.doc);
      full.lease = { token: token, id: device, ts: now };
      try { await db.collection(COLL).doc(r.id).set({ data: full }); }
      catch (e) { return dbErr('claim_set', e); }
    }
    return { ok: true, token: token, ts: now, hasDoc: !!r.doc };
  }

  /* ================= 写：**服务端事务**（事务里只有 doc，没有 where） =================
     "被顶下线"与"数据库出错"**必须分开报** —— 不然以后又会出现
     "数据库坏了却提示玩家另一台设备登录"的假错误。用闭包变量记判定，
     不依赖 SDK 是否把自定义错误属性透传出来。 */
  if (action === 'push') {
    const token = str(event && event.token);
    if (!token) return { ok: false, msg: 'no_token', stage: 'push_arg' };
    const payloadIn = str(event && event.payload);
    if (!payloadIn) return { ok: false, msg: 'empty', stage: 'push_arg' };
    if (payloadIn.length > MAX_CHARS) return { ok: false, msg: 'too_big', stage: 'push_arg' };

    const r = await ensure(openid);
    if (r.err) return r.err;
    const device = str(event && event.device).slice(0, 32);
    const input = {
      payload: payloadIn, ts: num(event && event.ts), bytes: num(event && event.bytes),
      ver: str(event && event.ver), act: (event && event.act) || null,
      token: token, device: device, now: now,
    };

    /* ① 那条还不存在 → 建。确定性 `_id`：两台同时建也只有一条成立 */
    if (!r.doc) {
      const seed = buildPushDoc({ _openid: openid }, input);
      seed._openid = openid;
      try {
        await db.collection(COLL).add({ data: Object.assign({ _id: r.id }, seed) });
        return { ok: true, pushed: true, created: true, ts: seed.ts, at: now, bytes: seed.bytes, prev: false };
      } catch (e) {
        /* 被另一端抢建了：**这不是服务异常** —— 重新读一次，按租约判 */
        const cur = await getById(r.id);
        if (!cur) return dbErr('create_add', e);
        const ct = (cur.lease && cur.lease.token) ? str(cur.lease.token) : '';
        if (ct && ct !== token) {
          return { ok: false, msg: 'superseded', stage: 'create_lost',
            lease: cur.lease ? { id: str(cur.lease.id), ts: num(cur.lease.ts) } : null };
        }
        r.doc = cur;                       /* 抢建那条还没有租约 → 落到下面的事务路径接手 */
      }
    }
    if (!r.doc) return { ok: false, msg: 'push_fail', stage: 'push_nodoc' };

    let verdict = '';
    try {
      const out = await db.runTransaction(async (tx) => {
        const ref = tx.collection(COLL).doc(r.id);
        const got = await ref.get();
        const current = got && got.data;
        if (!current) { verdict = 'missing'; throw new Error('missing_doc'); }
        const curToken = (current.lease && current.lease.token) ? str(current.lease.token) : '';
        /* 已经有租约、而且不是本机 ⇒ 旧设备，拒（"后登录设备生效"就落在这一句上）。
           租约为空（老记录 / 刚迁移过来）⇒ 允许本机接手一次。 */
        if (curToken && curToken !== token) { verdict = 'superseded'; throw new Error('superseded'); }
        const next = buildPushDoc(current, input);
        await ref.set({ data: next });
        return { prev: !!(str(current.payload) && str(current.payload) !== payloadIn) };
      });
      return { ok: true, pushed: true, ts: num(input.ts) || now, at: now,
        bytes: num(input.bytes) || payloadIn.length, prev: !!(out && out.prev) };
    } catch (e) {
      if (verdict === 'superseded') {
        const cur = await getById(r.id);
        return { ok: false, msg: 'superseded', stage: 'push_tx',
          lease: (cur && cur.lease) ? { id: str(cur.lease.id), ts: num(cur.lease.ts) } : null };
      }
      return dbErr(verdict === 'missing' ? 'push_missing' : 'push_tx', e);
    }
  }

  /* ================= dev probe（**不接入正式游戏逻辑**） =================
     一步一步来：get → set 一个探针字段 → 再 get 验证 → 清掉探针字段。
     哪一步炸、炸在什么码上，原样回给客户端 —— 以后不用再"猜 API"。 */
  if (action === 'probe') {
    const out = { ok: true, hasDoc: false, get: false, set: false, verify: false, clean: false,
      version: CLOUDSAVE_VERSION, env: ENV_TAG };
    const r = await ensure(openid);
    if (r.err) return r.err;
    out.hasDoc = !!r.doc;
    out.docId = r.id;
    /* 云端那份的"指纹"（**只回 hash 与时间戳，不回 payload 本体**，任务书 §11/§18）：
       三台设备一比对，就知道自己看到的是不是同一份档。 */
    if (r.doc) {
      out.cloudTs = Number(r.doc.ts) || 0;
      out.cloudBytes = Number(r.doc.bytes) || 0;
      out.cloudHash = crypto.createHash('sha1').update(String(r.doc.payload || '')).digest('hex').slice(0, 12);
      out.leaseId = (r.doc.lease && r.doc.lease.id) || '';
      out.leaseTs = (r.doc.lease && Number(r.doc.lease.ts)) || 0;
      out.hasPrev = !!r.doc.prevPayload;
    }
    if (!r.doc) { out.stage = 'probe_nodoc'; return out; }
    try { const g = await db.collection(COLL).doc(r.id).get(); out.get = !!(g && g.data); }
    catch (e) { return Object.assign(dbErr('probe_get', e), out); }
    const withProbe = dataForSet(r.doc);
    withProbe.__probe = now;
    try { await db.collection(COLL).doc(r.id).set({ data: withProbe }); out.set = true; }
    catch (e) { return Object.assign(dbErr('probe_set', e), out); }
    try { const g2 = await db.collection(COLL).doc(r.id).get(); out.verify = !!(g2 && g2.data && g2.data.__probe); }
    catch (e) { return Object.assign(dbErr('probe_verify', e), out); }
    const clean = dataForSet(r.doc);          /* r.doc 是探针之前那份快照 ⇒ 天然没有 __probe */
    try { await db.collection(COLL).doc(r.id).set({ data: clean }); out.clean = true; }
    catch (e) { return Object.assign(dbErr('probe_clean', e), out); }
    return out;
  }

  return { ok: false, msg: 'unknown_action', stage: 'dispatch' };
};
