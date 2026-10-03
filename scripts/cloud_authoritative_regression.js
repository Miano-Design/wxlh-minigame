/* 云同步「云端唯一权威」回归（2026-10-03 任务书 §十五 / §十八）：
     node scripts/cloud_authoritative_regression.js
   ==============================================================================
   这一把量的是**产品口径的翻转**：同步从"本地与云端谁新听谁的（冲突裁判）"
   收回成"**云端是唯一正式权威**"。判据全是"玩家身上真正发生的事"：

     1 本地 W03 / 云端 W08           → 自动同步之后是 **W08**
     2 本地 savedAt 比云端 ts 还大   → 仍然是 **W08**（savedAt 退出决策）
     3 自动同步与手动「找回存档」     → **同一条代码路径、同一个结果**
     4 回前台（onShow）              → 自动拉 W08
     5 被顶号设备**不能 push**
     6 被顶号设备**仍能 pull**
     7 被顶号设备**不会自动 reclaim**
     8 显式「重新登录」              → claim + pull + 回 gate
     9 云端没有档（NOT_FOUND）        → 允许用本地建首份
    10 云端数据库报错（DB_ERROR）      → **绝不建空档、绝不覆盖**
    11 busy 期间产生的 push           → **最终一定执行**（不许被吞）

   真跑方式：客户端那一侧是**产品自己的 `js/sc-cloud.js`**；服务端那一侧是
   **仓库里那一份 `cloudfunctions/cloudsave/index.js`**（把 `wx-server-sdk` 换成桩、
   把 `saves` 集合换成内存表）。所以量到的是"客户端 × 真云函数 × 假数据库"的完整链，
   不是对着源码做正则。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('cloud_authoritative_regression');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const G = E.G, Core = E.Core;
const CS = G.CloudSync;
if (!CS || !CS.sync) { R.blocked('CloudSync 在', { file: 'js/sc-cloud.js', expected: 'G.CloudSync.sync', actual: '没有' }); R.finish(); return; }

const t = (item, ok, expected, actual) => {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= 假云：把真云函数挂在内存数据库上 ================= */
const FN = path.join(E.ROOT, 'cloudfunctions/cloudsave/index.js');
const saves = new Map();
let dbMode = 'ok';                 // ok | dberror | notfound
let failNext = 0;                  // 让"数据库"临时炸几次（测 DB_ERROR）
let openid = 'oRegressionA';
let fnCalls = { pull: 0, push: 0, claim: 0, probe: 0 };
function mkErr(code, msg) { const e = new Error(msg || 'boom'); e.errCode = code; return e; }
function collection() {
  return {
    doc: (id) => ({
      get: async () => {
        if (failNext > 0) { failNext--; throw mkErr(-502001, 'database request failed'); }
        if (dbMode === 'dberror') throw mkErr(-502001, 'database request failed');
        const d = saves.get(id);
        if (!d) throw mkErr(-502004, 'document does not exist');
        return { data: JSON.parse(JSON.stringify(d)) };
      },
      set: async (o) => { if (dbMode === 'dberror') throw mkErr(-502001, 'database request failed'); saves.set(id, Object.assign({}, o.data)); return {}; },
      remove: async () => { saves.delete(id); return {}; },
    }),
    where: (cond) => ({ limit: () => ({ get: async () => {
      if (dbMode === 'dberror') throw mkErr(-502001, 'database request failed');
      const out = [];
      saves.forEach((d, id) => {
        const hit = Object.keys(cond || {}).every((k) => d[k] === cond[k]);
        if (hit) out.push(Object.assign({ _id: id }, d));
      });
      return { data: out };
    } }) }),
    add: async (o) => { const id = (o && o.data && o.data._id) || ('id' + saves.size); saves.set(id, Object.assign({}, o.data)); return { _id: id }; },
  };
}
function callCloudFn(data) {
  const sdk = {
    init() {}, DYNAMIC_CURRENT_ENV: 'dyn',
    database: () => ({
      collection, runTransaction: async (fn) => fn({ collection }),
    }),
    getWXContext: () => ({ OPENID: openid }),
  };
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) { return id === 'wx-server-sdk' ? sdk : orig.apply(this, arguments); };
  delete require.cache[require.resolve(FN)];
  let mod;
  try { mod = require(FN); } finally { Module.prototype.require = orig; }
  return Promise.resolve(mod.main(data || {})).then((r) => ({ result: r }));
}
/* 客户端那一侧：wx.cloud.callFunction 直接打到真云函数 */
const wx = global.wx;
wx.cloud = {
  init() {},
  callFunction(o) {
    const act = String((o && o.data && o.data.action) || '');
    if (fnCalls[act] !== undefined) fnCalls[act]++;
    return callCloudFn(o && o.data);
  },
  database() { throw new Error('客户端不许碰云数据库'); },
};

/* ---------- 造一份"读得出来"的存档（用产品自己的 packSave 口径：exportSave） ---------- */
Core.newGame(); Core.setPlayerName('云回归');
const saveAt = (lv) => {
  Core.S.player.level = lv;
  Core.S.savedAt = Date.now();          // 本地判据（诊断用）
  Core.save();
  return Core.exportSave();
};
const lvNow = () => Core.S.player.level;
/* 云端那条的 id：**必须与云函数同一套算法**（`'CS' + sha1('wxlh|'+openid).slice(0,30)`）——
   第一版我图省事拿 pull 的返回值当 id，结果夹具写到了另一个键上，
   后面几条"改云端 payload"根本没生效（量出来的是旧 payload）——典型的夹具假红。 */
const crypto = require('crypto');
function cloudIdOf() { return 'CS' + crypto.createHash('sha1').update('wxlh|' + openid).digest('hex').slice(0, 30); }
let cloudId = null;
async function putCloudDoc(payload, ts, lease) {
  const id = cloudIdOf();
  cloudId = id;
  saves.set(id, { _id: id, _openid: openid, payload: String(payload), ts: Number(ts) || 0,
    bytes: String(payload).length, ver: '2.1.0', at: Date.now(),
    lease: lease || null, prevPayload: '', prevTs: 0, prevBytes: 0, prevAt: 0 });
  return id;
}
const resetAll = () => {
  saves.clear(); cloudId = null; dbMode = 'ok'; failNext = 0;
  fnCalls = { pull: 0, push: 0, claim: 0, probe: 0 };
  openid = 'oRegressionA';
  try { CS._reset(); } catch (e) {}
  try { CS.toggle && CS.toggle(true); } catch (e) {}
};

(async function () {
  /* ---------- 1 / 2：本地 W03、云端 W08（连 savedAt 都比云端新）→ 自动同步必须拿到 W08 ---------- */
  resetAll();
  await putCloudDoc(saveAt(88), 1000, { id: 'dOther', ts: Date.now(), token: 'tok-other' });
  const cloudRaw = saves.get(cloudId).payload;
  Core.newGame(); Core.setPlayerName('本地那份'); saveAt(3);
  Core.S.savedAt = Date.now() + 600000;          // 本地 savedAt **故意比云端 ts 大**
  Core.save();
  const localToldTime = Core.S.savedAt;
  let r = await CS.triggerAuto('show');          // 回前台（典型自动同步，走真正的那个触发口）
  t('1 本地 W03 / 云端 W08 → 自动同步之后是**云端那份**（lv88）',
    lvNow() === 88, 'lv88（云端）', 'lv' + lvNow() + ' · ' + JSON.stringify(r));
  t('2 本地 savedAt 比云端 ts 更大时**依然**以云端为准（savedAt 退出同步决策）',
    lvNow() === 88 && r.took === 'cloud', 'took=cloud · lv88',
    'took=' + (r && r.took) + ' · lv' + lvNow() + ' · 本地原来的 savedAt=' + localToldTime);

  /* ---------- 3：自动同步与手动「找回存档」走同一条路、结果一样 ---------- */
  Core.newGame(); Core.setPlayerName('再来一次'); saveAt(3);
  const viaAuto = await CS.sync('boot');
  const lvAuto = lvNow();
  Core.newGame(); Core.setPlayerName('再来一次'); saveAt(3);
  const viaManual = await CS.pullAuthoritativeCloud('manual');
  t('3 自动同步与手动「找回存档」得到**完全相同**的结果（同一条 authoritative pull）',
    lvAuto === lvNow() && viaAuto.took === 'cloud' && viaManual.took === 'cloud',
    '两条都是 cloud · 都到 lv88',
    '自动=' + viaAuto.took + '(lv' + lvAuto + ') · 手动=' + viaManual.took + '(lv' + lvNow() + ')');

  /* ---------- 4：回前台自动拉（不需要玩家点任何东西） ---------- */
  saves.get(cloudId).payload = saveAt(77);       // 另一台推了 W?? 上去（lv77）
  Core.newGame(); Core.setPlayerName('前台'); saveAt(5);
  /* ⚠️ 这里必须走 `triggerAuto('show')`（产品里 onShow 真正调的那个口），**不是** `sync('show')`：
     第一版写的是 `sync('show')` —— 于是"onShow 不拉"这种破坏（塞在 triggerAuto 里）**照样绿**，
     破坏测试当场把这条揪出来了（尺子测的不是玩家走的那条路）。 */
  r = await CS.triggerAuto('show');
  t('4 回前台（onShow）自动拉到云端最新那份', lvNow() === 77 && r.took === 'cloud',
    'lv77', 'lv' + lvNow() + ' · ' + JSON.stringify(r));

  /* ---------- 5 / 6 / 7：被顶号 = 不能写、能读、且不自动 reclaim ---------- */
  {
    saves.get(cloudId).lease = { id: 'dOtherDevice', ts: Date.now(), token: 'tok-other' };
    saves.get(cloudId).payload = saveAt(66);
    Core.newGame(); Core.setPlayerName('被顶号'); saveAt(9);
    const pushBefore = fnCalls.push, claimBefore = fnCalls.claim;
    r = await CS.sync('progress');               // 玩家在被顶号的设备上继续玩、想推
    t('5 被顶号设备**不能 push**（服务端一次都没收到推档）',
      fnCalls.push === pushBefore, 'push 次数不变', pushBefore + ' → ' + fnCalls.push);
    t('6 被顶号设备**仍能 pull**（读到的是云端那份 lv66，不是本地 lv9）',
      lvNow() === 66, 'lv66', 'lv' + lvNow());
    t('7 被顶号设备**不会自动 reclaim**（claim 一次都没发生）',
      fnCalls.claim === claimBefore, 'claim 次数不变', claimBefore + ' → ' + fnCalls.claim);
  }

  /* ---------- 8：显式「重新登录」＝ claim + pull（+ 回 gate 由 reclaim 自己做） ---------- */
  {
    saves.get(cloudId).lease = { id: 'dOtherDevice', ts: Date.now(), token: 'tok-other' };
    saves.get(cloudId).payload = saveAt(55);
    const claimBefore = fnCalls.claim;
    const rr = await CS.reclaim();
    t('8 显式「重新登录」：claim 真的发生、并且拉到了云端那份',
      fnCalls.claim === claimBefore + 1 && lvNow() === 55 && rr.ok === true,
      'claim +1 · lv55 · ok', 'claim ' + claimBefore + '→' + fnCalls.claim + ' · lv' + lvNow() + ' · ok=' + rr.ok);
  }

  /* ---------- 9：云端没有档（NOT_FOUND）→ 允许用本地建首份 ---------- */
  {
    resetAll();
    Core.newGame(); Core.setPlayerName('首份'); saveAt(11);
    const pushBefore = fnCalls.push;
    r = await CS.sync('boot');
    const has = [...saves.values()].some((d) => d.payload);
    t('9 云端确实没有档 → 用本地创建第一份（真写进去了）',
      has && fnCalls.push > pushBefore, '云上落了一条', 'hasDoc=' + has + ' · push ' + pushBefore + '→' + fnCalls.push);
  }

  /* ---------- 10：DB_ERROR → 绝不建空档、绝不覆盖 ---------- */
  {
    resetAll();
    await putCloudDoc(saveAt(44), 2000, null);
    const before = saves.get(cloudId).payload;
    Core.newGame(); Core.setPlayerName('本地'); saveAt(7);
    dbMode = 'dberror';
    const pushBefore10 = fnCalls.push;
    const claimBefore10 = fnCalls.claim;
    r = await CS.sync('progress');
    const after = saves.get(cloudId).payload;
    /* ⚠️ 判据里**必须有"连试都没试过去建"这一条**：第一版只比"云端原文有没有变" ——
       而 DB_ERROR 时 `push` 自己也会失败，于是"把它当成没有存档、去建一份"这个错误动作
       **照样能通过**。破坏测试就是这么把这条揪出来的。 */
    /* ⚠️ 第二条（破坏测试又揪出来的）：**光盯 `fnCalls.push` 还不够** ——
       写路径是"先 `claim` 拿 token、再 `push`"，DB_ERROR 时那一趟 `claim` 自己也会失败、
       于是 `if (!leaseToken) return {skip:'notoken'}` 把 `push` 挡在门外：`push` 计数器不动，
       可**客户端明明已经伸手去写云端了**（真赶上"只有 pull 这一步坏"的岔路，那一趟就会把云档覆盖掉）。
       ⇒ 判据改盯**整个写路径**（claim ＋ push 一起数）。 */
    t('10 云端数据库报错（DB_ERROR）→ 不判定为"没有存档"：写路径一次都不许碰',
      r.ok === false && after === before && lvNow() === 7
        && fnCalls.push === pushBefore10 && fnCalls.claim === claimBefore10,
      'ok=false · 云端原文不动 · **claim/push 一次都没发** · 本地照常玩',
      'ok=' + r.ok + ' · 云端' + (after === before ? '没动' : '**被改了**')
        + ' · push ' + pushBefore10 + '→' + fnCalls.push + ' · claim ' + claimBefore10 + '→' + fnCalls.claim
        + ' · lv' + lvNow());
  }

  /* ---------- 11：busy 期间产生的 push，最终一定执行 ---------- */
  {
    resetAll();
    await putCloudDoc(saveAt(20), 3000, { id: 'dSomebody', ts: Date.now(), token: 'tok-x' });
    Core.newGame(); Core.setPlayerName('忙'); saveAt(30);
    /* 先把写权拿到手（显式重新登录那一路 = claim）—— 不然这台是"被顶号"的只读端，
       第一趟 progress 会走 pull（那是正确行为，但量不到"忙的时候挡下的推"）。 */
    await CS.reclaim();
    Core.S.player.level = 31; Core.save();         // 玩家真打了一关
    const pushBefore = fnCalls.push;
    /* ⚠️ 场景要摆对（前两版都摆错了，这条一直是假红）：
       "busy 吞掉的那次推" 必须是**第一次 push 已经取完快照、还挂在空中**的时候发生的。
       前两版一上来就 `Core.save()` 抬到 32 —— 而那一趟 push 还没轮到取快照，它**本身就带了 32**，
       收工后补跑自然只剩 `clean`（量到 push=1，看着像"吞了"，其实压根没吞。
       反过来说，这也说明**光看"push 次数"分不清"真吞了"和"快照本来就新"**）。
       ⇒ 这里把**第一趟 push**扣在空中（拦 `wx.cloud.callFunction` 里 action==='push' 那一下），
         等它确实取完快照（lv31）之后再抬到 32 —— 这才是任务书 §十四 要的那个岔路。 */
    const origCall = wx.cloud.callFunction;
    let held = false, releaseHold = null;
    wx.cloud.callFunction = function (o) {
      const p = origCall.apply(this, arguments);      // 照常发出去（fnCalls 也照常计）
      const act = String((o && o.data && o.data.action) || '');
      if (!held && act === 'push') {
        held = true;
        return new Promise(function (res, rej) { releaseHold = function () { p.then(res, rej); }; });
      }
      return p;
    };
    /* 盯住"补跑"那一趟：它是由 `finish` 里的脏标记排出来的 `sync('pending',{push:true})`。 */
    let catchup = null;
    const origSync = CS.sync;
    CS.sync = function (reason, opts) {
      const p = origSync.call(CS, reason, opts);
      if (String(reason) === 'pending' && opts && opts.push) { try { p.then(function (x) { catchup = x; }); } catch (e) {} }
      return p;
    };
    const first = CS.sync('progress');             // 占住 busy；快照 lv31，这个 push 被扣在空中
    await wait(25);                                // 等它真的走到 push（readOwn 回来、快照已取）
    Core.S.player.level = 32; Core.save();         // **同步在飞的时候**又打了一关
    const second = CS.sync('progress');            // 撞上 busy → 记脏标记
    if (releaseHold) releaseHold();                // 放行第一趟
    let firstR = null, secondR = null;
    first.then(function (x) { firstR = x; }); second.then(function (x) { secondR = x; });
    await Promise.all([first, second]);
    await wait(400);                               // 等补跑那一趟（它是 setTimeout(0) 排的，跑完还要过一次网络）
    wx.cloud.callFunction = origCall;
    CS.sync = origSync;
    /* 诊断：万一自动补跑没成，手动来一次同口径的 `pending` 看它到底卡在哪（写进 actual 里）。 */
    const probe = await CS.sync('pending', { push: true });
    /* ⚠️ 判据必须是"**至少两次**"（第一趟 + 补跑那一趟）：第一版只写 `> pushBefore` ——
       于是"busy 那次被吞掉、只留下第一趟"这种破坏照样能过（破坏测试揪出来的第二条）。 */
    t('11 busy 期间产生的 push **最终一定执行**（脏标记补跑，不吞进度）',
      fnCalls.push >= pushBefore + 2, 'push 至少 2 次（第一趟 + 补跑）',
      '起始=' + pushBefore + ' · 收工后=' + fnCalls.push
        + ' · first=' + JSON.stringify(firstR) + ' · second=' + JSON.stringify(secondR)
        + ' · 自动补跑=' + JSON.stringify(catchup) + ' · 手动同口径=' + JSON.stringify(probe));
  }

  R.finish();
})();
