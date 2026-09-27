/* 存档云同步体检（2026-09-27 · 0927-L → **0927-L2 改口径**）：node scripts/cloud_sync_audit.js
   ------------------------------------------------------------------------------
   父亲大人的口径两次变化，这一把尺子跟着改成 L2：**静默同步**（不弹窗、不提示、谁新听谁的）
   ＋ **存档码**（8 位 · 24 小时 · 用一次即失效）。逐条对应派单里的硬要求：
     ① 环境 ID 写对、**全工程只有一处**（云函数那边走 DYNAMIC_CURRENT_ENV，不许再写死一个）；
     ② **静默是硬判据**：自动那条路（第一次触摸 / 切后台 / 打关结算 / 失败重试）
        **一个 toast、一个弹窗都不能有** —— 静态扫函数体 ＋ 真跑一遍数弹窗；
     ③ 冲突**取时间戳更新的那份**（两个方向都验：云新→换上；本地新→推上去）；
     ④ **覆盖前留档**：本地被覆盖 → 旧本地进 SAVE_KEY_bak（且真能一键取回）；
        云端被覆盖 → 旧云端进那条记录的 `prev*` 栏（且真能一键取回）；
     ⑤ 存档码 **8 位、去掉易混的 O/0/I/1**（跑真云函数代码，摇 200 个码逐个查字母表）；
     ⑥ `claim` 的**过期 / 已用**两道校验（真跑云函数：过期拒、用过拒、正常才给、给完就作废）；
     ⑦ **旧的粘贴式导出 / 导入必须还在**（离线保险绳，不许被存档码顶掉）；
     ⑧ 推档跟上进度：脏标记 / 切后台必推 / 打关结算同一分钟合并 / 每天 20 次上限；
     ⑨ 首帧不发网络请求（加载 0 次、boot 后 0 次、第一次交互之后才 >0）；
     ⑩ 开关默认开、老档能补默认、关掉之后一个网络请求都不发。

   只读脚本：跑在假环境里（假的云开发 ＋ **真的云函数代码**），不碰真存档、不碰真云环境。

   ⚠️ **做坏试验（要能变红）**：读源码那几条走 `CS_SRC`（默认 js/sc-cloud.js）。
      · 给自动路径里塞一句 `CV.toast('同步完成')` → ② 静态那条当场红；
      · 把 `keepLocalBackup(...)` 那一行删掉 → ④ 红（"覆盖前留档"）；
      · 把云函数里 `doc.used` / `expireAt` 那两行判断删掉 → ⑥ 红；
      · 把字母表改回含 O / 0 / I / 1 → ⑤ 红。
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const JS = path.resolve(__dirname, '../js');
const FN_DIR = path.resolve(__dirname, '../cloudfunctions/savecode');
const SRC_PATH = process.env.CS_SRC ? path.resolve(process.env.CS_SRC) : path.join(JS, 'sc-cloud.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const FN_SRC = fs.readFileSync(path.join(FN_DIR, 'index.js'), 'utf8');

const ENV_ID = 'cloudbase-d0gk9s3sv8a797189';
const CLOUD_KEY = 'wxlh_cloud_v1';
const SAVE_KEY = 'wxlh_save_v5';
const BAK_KEY = SAVE_KEY + '_bak';

let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : '')); };
const sec = (t) => console.log('\n' + t);

/* ================= 假的云开发（集合 + 云函数调用） ================= */
const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const TXT = [];                                            // 当前这一帧画出来的字
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'fillText') return (s) => { TXT.push(String(s)); };
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };

/* `saves` 集合（一个账号一条）＋ `save_codes` 集合（云函数写的那张表） */
const NET = { init: 0, read: 0, write: 0, fn: 0 };
const netTotal = () => NET.init + NET.read + NET.write + NET.fn;
let CLOUD_OPENID = 'oFakeAccountA';
const cloudDocs = [];
const codeDocs = [];                                       // 云函数用的那张表
const TOUCH = [];
const SHOW = [], HIDE = [];
let CLOUD_FN = null;                                       // 真的 savecode 云函数（下面 require 进来）
const matchCond = (d, cond) => Object.keys(cond || {}).every((k) => {
  const c = cond[k];
  if (c && typeof c === 'object' && '$lt' in c) return Number(d[k]) < Number(c.$lt);
  return d[k] === c;
});
function saveColl() {
  const st = { cond: null, lim: 0 };
  const api = {
    where(cond) { st.cond = cond || {}; return api; },
    limit(n) { st.lim = n; return api; },
    get() { NET.read++; const list = cloudDocs.filter((d) => matchCond(d, st.cond)); return Promise.resolve({ data: list.slice(0, st.lim || 20).map((d) => JSON.parse(JSON.stringify(d))) }); },
    add(o) {
      NET.write++;
      const d = Object.assign({ _id: 'doc' + (cloudDocs.length + 1), _openid: CLOUD_OPENID }, o.data || {});
      cloudDocs.push(d);
      while (cloudDocs.filter((x) => x._openid === d._openid).length > 1) {           // 一个账号只留一条
        const i = cloudDocs.findIndex((x) => x._openid === d._openid && x !== d);
        if (i < 0) break;
        cloudDocs.splice(i, 1);
      }
      return Promise.resolve({ _id: d._id });
    },
    doc(id) {
      return {
        update(o) {
          NET.write++;
          const d = cloudDocs.filter((x) => x._id === id)[0];
          if (d) Object.assign(d, o.data || {});
          return Promise.resolve({ stats: { updated: d ? 1 : 0 } });
        },
      };
    },
  };
  return api;
}
function codeColl() {                                      // 给云函数用的（走同一张 codeDocs）
  const st = { cond: null, lim: 0 };
  const api = {
    where(cond) { st.cond = cond || {}; return api; },
    limit(n) { st.lim = n; return api; },
    get() { return Promise.resolve({ data: codeDocs.filter((d) => matchCond(d, st.cond)).slice(0, st.lim || 20).map((d) => Object.assign({}, d)) }); },
    count() { return Promise.resolve({ total: codeDocs.filter((d) => matchCond(d, st.cond)).length }); },
    add(o) { const d = Object.assign({ _id: 'code' + (codeDocs.length + 1) }, o.data || {}); codeDocs.push(d); return Promise.resolve({ _id: d._id }); },
    update(o) { const hit = codeDocs.filter((d) => matchCond(d, st.cond)); hit.forEach((d) => Object.assign(d, o.data || {})); return Promise.resolve({ stats: { updated: hit.length } }); },
    remove() { const hit = codeDocs.filter((d) => matchCond(d, st.cond)); hit.forEach((d) => { const i = codeDocs.indexOf(d); if (i >= 0) codeDocs.splice(i, 1); }); return Promise.resolve({ stats: { removed: hit.length } }); },
  };
  return api;
}
const cloudStub = {
  init(opt) { NET.init++; cloudStub.lastInit = opt; },
  database() {
    return {
      command: { lt: (v) => ({ $lt: v }) },
      collection: (name) => (name === 'save_codes' ? codeColl() : saveColl()),
    };
  },
  callFunction(o) {
    NET.fn++;
    if (!CLOUD_FN) return Promise.reject(new Error('cloud fn missing'));
    if (o.name !== 'savecode') return Promise.reject(new Error('unknown fn ' + o.name));
    return CLOUD_FN.main(o.data || {}).then((result) => ({ result }));
  },
};
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { TOUCH.push(fn); }, onTouchMove() {}, onTouchEnd() {},
  onWindowResize() {}, onShow(fn) { SHOW.push(fn); }, onHide(fn) { HIDE.push(fn); },
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
  cloud: cloudStub,
};

/* ---------- 把 **真的云函数代码** 加载进来（只把 wx-server-sdk 换成一个假的） ---------- */
{
  const Module = require('module');
  const origRequire = Module.prototype.require;
  const fakeSdk = {
    DYNAMIC_CURRENT_ENV: 'dyn-current-env',
    init() {},
    getWXContext() { return { OPENID: CLOUD_OPENID }; },
    database: () => cloudStub.database(),
  };
  Module.prototype.require = function (id) {
    if (id === 'wx-server-sdk') return fakeSdk;
    return origRequire.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(path.join(FN_DIR, 'index.js'))];
    CLOUD_FN = require(path.join(FN_DIR, 'index.js'));
  } catch (e) {
    console.log('✗ 云函数加载失败：' + e.message);
  } finally {
    Module.prototype.require = origRequire;
  }
}

require(path.join(JS, 'mem-guard.js'));                    // 存档加密（导出/导入走的就是这一层）
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const Core = global.Core, D = global.DATA, CV = global.CV, U = global.U;
const CS = global.CloudSync;
if (!CS) { console.log('✗ 没有挂上 G.CloudSync（js/sc-cloud.js 没被加载？）'); process.exit(1); }
CV.setup(global.wx.getWindowInfo());
Core.newGame(); Core.setPlayerName('云端体检');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}

/* 造一份"有进度"的档（level 越高的档越大：用来验"更旧 / 更新"） */
function mkPlain(level, points) {
  Core.newGame();
  Core.setPlayerName('云端体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  Core.S.player.level = level;
  Core.addCur('points', points);
  const cid = D.characters[0].id;
  Core.addChar(cid);
  Core.S.chars[cid].lv = level;
  Core.S.worlds.W01.stages.normal = Core.S.worlds.W01.stages.normal.map(() => 3);
  return JSON.stringify(Core.S);
}
const snapshot = () => JSON.stringify(Core.S);
const prefsWrite = (o) => { store[CLOUD_KEY] = JSON.stringify(o); CS._reset(); };
const levelsOf = () => ({ lv: Core.S.player.level, points: Core.S.cur.points });

/* 打点：自动那条路**一个弹窗都不许有** */
let toasts = 0, lastToast = '';
const origToast = CV.toast;
CV.toast = function (msg, ms) { toasts++; lastToast = String(msg); return origToast.call(CV, msg, ms); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
/* ---------- ① 环境 ID / 集合 / 云函数 ---------- */
sec('=== ① 环境 ID 与三个名字 ===');
{
  const hits = [];
  fs.readdirSync(JS).filter((f) => f.endsWith('.js')).forEach((f) => {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    const n = (src.match(new RegExp(ENV_ID, 'g')) || []).length;
    if (n) hits.push(f + '×' + n);
  });
  chk('环境 ID 在客户端只写一处（换环境只改一个地方）', hits.length === 1 && hits[0] === 'sc-cloud.js×1', hits.join(' / ') || '一处都没写');
  chk('写的就是父亲大人开好的那个云环境', CS.ENV_ID === ENV_ID && SRC.indexOf(ENV_ID) >= 0);
  chk('集合名：存档 saves · 存档码 save_codes（云函数里那张表）', CS.COLL === 'saves' && CS.CODE_FN === 'savecode' && /'save_codes'/.test(FN_SRC));
  chk('云函数侧不另写死环境（走 DYNAMIC_CURRENT_ENV）',
    /DYNAMIC_CURRENT_ENV/.test(FN_SRC) && FN_SRC.indexOf(ENV_ID) < 0);
  chk('云函数的入口挂上了（尺子把它当真的跑）', !!CLOUD_FN && typeof CLOUD_FN.main === 'function');
}

/* ---------- ② 静默：自动路径不许有任何"会弹给玩家"的东西 ---------- */
sec('=== ② 静默（自动那条路：没有 toast、没有弹窗、没有阻塞）===');
{
  const body = (name) => {
    const re = new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\}');
    const m = re.exec(SRC);
    return m ? m[0] : '';
  };
  const AUTO = ['triggerAuto', 'sync', 'applyCloudSave', 'scheduleRetry', 'noteProgress', 'scheduleMergedPush', 'hookProgress'];
  const dirty = AUTO.filter((f) => /CV\.toast|U\.confirm|showModal|wx\.showModal|alert\(/.test(body(f)));
  chk('源码级：自动路径的每一个函数体里都没有 toast / 弹窗', dirty.length === 0, dirty.join('、') || '干净');
  chk('源码级：整个模块里只有"玩家自己点的那几条"才说话（CV.toast 只出现在取码/取回等手动出口）',
    (SRC.match(/CV\.toast/g) || []).length === 0);

  /* 真跑一遍：云端更新 → 本地**静默**跟上 */
  prefsWrite({ on: true });
  mkPlain(20, 5000); Core.save();
  const t0 = Number(Core.S.idle.lastTs);
  mkPlain(35, 900000); const cloudRaw = Core.exportSave();
  store[SAVE_KEY] = Core.exportSave(); Core.load();          // 本机退回 lv20（时间戳还是"刚才"，所以要往回拨）
  Core.S.idle.lastTs = t0 - 60000; Core.save();
  cloudDocs.length = 0;
  cloudDocs.push({ _id: 'docA', _openid: CLOUD_OPENID, payload: cloudRaw, ts: t0 + 60000, bytes: cloudRaw.length, at: Date.now() });
  toasts = 0;
  const r = await CS.triggerAuto('first');
  chk('云端更新：直接换上（比时间戳）', r.took === 'cloud' && levelsOf().lv === 35, JSON.stringify(r) + ' 现在 lv' + levelsOf().lv);
  chk('全程**没有一次 toast**（静默是硬判据）', toasts === 0, 'toast ' + toasts + ' 次' + (lastToast ? '（' + lastToast + '）' : ''));
  chk('全程**没有弹窗**（U.overlay 一直是空的）', !U.overlay);
}

/* ---------- ③④ 冲突取更新的那份 + 覆盖前留档 ---------- */
sec('=== ③④ 谁新听谁的 ＋ 覆盖前一定留档（两头都能取回来）===');
{
  /* ③-a 云新 → 本地换上；旧本地进 _bak */
  prefsWrite({ on: true });
  mkPlain(20, 5000); Core.save();
  Core.addCur('points', 987654321); Core.save();   // 独一无二的标记：这份就是"要被盖掉的旧本地"
  const marker = String(Core.S.cur.points);
  const localOld = Core.exportSave();
  const t0 = Number(Core.S.idle.lastTs);
  cloudDocs.length = 0;
  mkPlain(41, 900000); const cloudRaw2 = Core.exportSave();
  const cloudTs2 = t0 + 120000;
  cloudDocs.push({ _id: 'docB', _openid: CLOUD_OPENID, payload: cloudRaw2, ts: cloudTs2, bytes: cloudRaw2.length, at: Date.now() });
  store[SAVE_KEY] = localOld; Core.load();
  Core.S.idle.lastTs = t0; Core.save();
  delete store[BAK_KEY];                           // 上一段留下的备份清掉：这一条只验"这一次覆盖留没留档"
  let r = await CS.triggerAuto('hide');
  chk('云新：换上了云端那份（lv41）', levelsOf().lv === 41, JSON.stringify(r));
  let bak = null; try { bak = JSON.parse(store[BAK_KEY] || 'null'); } catch (e) {}
  let bakPlain = '';
  try { bakPlain = String(globalThis.__MP_DEC_STR(bak.raw)); } catch (e) { bakPlain = ''; }
  chk('留档：被盖掉的**旧本地**（那份带唯一标记的）原样进了 SAVE_KEY_bak',
    !!bak && !!bak.raw && bakPlain.indexOf(marker) >= 0 && snapshot().indexOf(marker) < 0,
    bak ? ('why=' + bak.why + ' · 标记 ' + marker + ' 在备份里=' + (bakPlain.indexOf(marker) >= 0)) : '没有备份');
  /* 设置页那颗「恢复上一份存档」真能把旧本地取回来 */
  const back = Core.restoreFromBackup();
  chk('留档真的能取回（Core.restoreFromBackup → 回到 lv20）', back.ok === true && Core.S.player.level === 20, back.msg || '');

  /* ③-b 本地新 → 推上去；旧云端进那条记录的 prev* 栏 */
  prefsWrite({ on: true });
  mkPlain(20, 5000); Core.save();
  const t1 = Number(Core.S.idle.lastTs);
  cloudDocs.length = 0;
  mkPlain(41, 900000); const oldCloud = Core.exportSave();
  cloudDocs.push({ _id: 'docC', _openid: CLOUD_OPENID, payload: oldCloud, ts: t1 - 120000, bytes: oldCloud.length, at: Date.now() });
  mkPlain(55, 1000000); Core.save();                          // 本机进度更新
  const mineRaw = Core.exportSave();
  r = await CS.triggerAuto('hide');
  chk('本地新：用本地那份**推上云**', r.took === 'local' && r.pushed === true, JSON.stringify(r));
  chk('云上那条换成了本机这份', String(cloudDocs[0].payload) === mineRaw);
  chk('留档：旧云端进了那条记录的 prev* 栏（另留一份）',
    String(cloudDocs[0].prevPayload) === oldCloud && Number(cloudDocs[0].prevTs) === t1 - 120000);
  const got = await CS.pullCloud();
  chk('设置页看得见那份旧备份（info 里有时间/大小）', CS.info().prevAt > 0 && CS.info().prevBytes > 0);
  const take = await CS.takeCloudPrev();
  chk('一键取回云端旧备份：真的换回了去（lv41，而不是推动那次前的 lv41 之前那份）',
    take.ok === true && Core.S.player.level === 41, (take.msg || '') + ' lv' + Core.S.player.level);
}

/* ---------- ⑤⑥ 存档码：8 位去易混 + claim 两道校验 ---------- */
sec('=== ⑤⑥ 存档码（8 位 · 去易混 · 24 小时 · 用一次即失效）===');
{
  const ALPHA = (/const ALPHABET = '([^']+)'/.exec(FN_SRC) || [])[1] || '';
  chk('字母表 32 个符号：24 字母 ＋ 8 数字，**没有 O / 0 / I / 1**',
    ALPHA.length === 32 && !/[O0I1]/.test(ALPHA), ALPHA);
  chk('码长是 8 位', /const CODE_LEN = 8;/.test(FN_SRC));
  chk('有效期 24 小时', /const TTL_MS = 24 \* 3600 \* 1000;/.test(FN_SRC));
  chk('云函数里留着"将来要卖号/长时效"的改法注释（界面上不做那一档）',
    /7 天可多次|卖号/.test(FN_SRC) && !/7 \* 24/.test(FN_SRC.replace(/KEEP_MS[^\n]*/, '')));

  prefsWrite({ on: true });
  mkPlain(60, 1234567); Core.save();
  const mine = Core.exportSave();
  const made = await CS.makeCode();
  chk('生成存档码：拿到一个 8 位码', made.ok === true && /^[A-HJ-NP-Z2-9]{8}$/.test(made.code || ''), made.code || made.msg || '');
  chk('云端只存密文，明文一个字不含', codeDocs.length === 1 && String(codeDocs[0].data) === mine
    && String(codeDocs[0].data).slice(0, 5) === 'MPG1:' && /^[A-HJ-NP-Z2-9]{8}$/.test(codeDocs[0].code));
  chk('码上记了生成者与过期时间', !!codeDocs[0].openid && Number(codeDocs[0].expireAt) > Date.now());
  /* 摇 200 个码：每一个符号都必须在字母表里（O/0/I/1 一次都不许出现） */
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const rr = await CS.makeCode();
    if (!rr.ok || !/^[A-HJ-NP-Z2-9]{8}$/.test(rr.code) || Array.from(rr.code).some((c) => ALPHA.indexOf(c) < 0)) bad++;
  }
  chk('摇 200 个码：全部是 8 位、全在安全字母表里', bad === 0, bad + ' 个不合格');

  /* claim 的三条路：没找到 / 过期 / 用过 / 正常 */
  const code = codeDocs[codeDocs.length - 1].code;
  const nf = await CS.claimCode('ZZZZZZZZ');
  chk('claim：不存在的码 → not_found', nf.ok === false && nf.msg.indexOf('没找到') >= 0, nf.msg || '');
  codeDocs[codeDocs.length - 1].expireAt = Date.now() - 1000;
  const ex = await CS.claimCode(code);
  chk('claim：**过期**的码 → 拒绝（expired）', ex.ok === false && ex.msg.indexOf('过期') >= 0, ex.msg || '');
  codeDocs[codeDocs.length - 1].expireAt = Date.now() + 3600000;
  /* 换一台设备（同一个微信账号）用码取回 */
  mkPlain(3, 10); Core.save();                                 // 本机变成新手档
  const before = levelsOf();
  const cl = await CS.claimCode(code);
  chk('claim：没过期没用过 → 拿回那份密文', cl.ok === true && String(cl.data) === mine, cl.msg || '');
  chk('claim 之后这条被标记已用（used / usedAt / usedBy）',
    codeDocs[codeDocs.length - 1].used === true && Number(codeDocs[codeDocs.length - 1].usedAt) > 0);
  const a = CS.applyExternal(cl.data, 'code');
  chk('取回之后：进度回到那份（lv60，且旧的那份先进了 _bak）',
    a.ok === true && Core.S.player.level === 60, '之前 lv' + before.lv + ' → 现在 lv' + Core.S.player.level);
  const again = await CS.claimCode(code);
  chk('**用一次即失效**：同一个码再取一次 → 拒绝（used）', again.ok === false && again.msg.indexOf('用过') >= 0, again.msg || '');
  /* 客户端的码解析：混在句子里的码也认得出，但 O/0/I/1 一律不算 */
  chk('剪贴板里混了说明文字也能认出那串码', CS.normCode('存档码：abcdefgh 谢谢') === '' ? false : true);
  chk('带 O / 0 / I / 1 的一律不当码（易混字符不是一个码）', CS.normCode('OOOO0000') === '' && CS.normCode('IIII1111') === '');
}

/* ---------- ⑦ 导出 / 导入 / 存档码：**界面撤了，逻辑与处理器都还在** ----------
   ⚠️ 口径 2026-09-27（0927-P）**变了**：父亲大人原话「**存档只用留一个找回存档，以防丢档的时候
   可以回溯就行了，感觉也不用导出导入了，反正存档都在云**」——所以设置页上那四颗按钮
   （📤 导出存档 / 📥 导入存档 / 生成存档码 / 用存档码取回）**整段撤掉**，换成一颗「找回存档」。
   这一条尺子跟着改成"**界面不再露出、逻辑与处理器一个字没少**"：
     · 四颗按钮的热区与文案**一个都不许在设置页上**（这就是他点名要的）；
     · 四条**处理器**都还在（`save_export / save_import / code_make / code_claim`）——
       以后他要把入口挂回来，贴一颗按钮就行（逻辑层：`Core.exportSave/importSave`、
       `CS.wrapExport/checkImport/makeCode/claimCode` 全都没动）；
     · 「找回存档」那颗必须真的画在屏上、热区登记上（存档这一块现在只剩它）。
   做坏试验（必须能红）：把 `U.tiles([['save_recover', …]])` 那一行删掉 → ⑦-3 当场红。 */
sec('=== ⑦ 导出 / 导入 / 存档码：界面按父亲大人 09-27 的话撤掉，逻辑与处理器保留 ===');
{
  const last = fs.readFileSync(path.join(JS, 'sc-last.js'), 'utf8');
  chk('设置页**不再画**那四颗按钮（导出 / 导入 / 生成码 / 用码取回）',
    !/label:\s*'📤 导出存档'/.test(last) && !/label:\s*'📥 导入存档'/.test(last)
    && !/label:\s*'生成存档码'/.test(last) && !/label:\s*'用存档码取回'/.test(last));
  chk('四条**处理器都还在**（逻辑层要挂回来随时能挂）',
    /CV\.on\('save_export'/.test(last) && /CV\.on\('save_import'/.test(last)
    && /CV\.on\('code_make'/.test(last) && /CV\.on\('code_claim'/.test(last));
  chk('导出走的是"信封 + 账号指纹"那条老路', /CS\.wrapExport\(/.test(last) && /applyExternal|importSave/.test(last));
  chk('导入仍然先过账号指纹校验', /CS\.checkImport\(/.test(last));
  mkPlain(66, 777);
  const env = CS.wrapExport(Core.exportSave());
  const chkEnv = CS.checkImport(env);
  chk('信封能自洽（wrapExport → checkImport 放行）', chkEnv.ok === true && chkEnv.data === Core.exportSave());
  /* **真的把设置页画一遍**：那一屏现在只剩"一排三颗"（找回存档 / 新手指引 / 玩法指南）
     ＋最下面那颗红边框删档按钮 —— 四颗旧的**一颗都不许在**。 */
  let seen = null;
  for (let s = 0; s <= 4000; s += 100) {
    CV.reset('settings'); CV.scroll = s; TXT.length = 0; CV.render();
    if (['找回存档', '新手指引', '玩法指南'].every((l) => TXT.some((x) => x.indexOf(l) >= 0))) {
      seen = { s: s, ids: (CV.hits || []).map((h) => h.id), txt: TXT.slice() };
      break;
    }
  }
  chk('真的渲染：那一排三颗（找回存档 / 新手指引 / 玩法指南）画在屏上，热区都在',
    !!seen && ['save_recover', 'reset_coach', 'open_guide'].every((i) => seen.ids.indexOf(i) >= 0),
    seen ? ('scroll=' + seen.s + ' · 热区 ' + seen.ids.filter((i) => ['save_recover', 'reset_coach', 'open_guide'].indexOf(i) >= 0).join('+')) : '整页滚遍都没画出来');
  const gone = ['导出存档', '导入存档', '生成存档码', '用存档码取回', '恢复上一份存档', '云同步', '立即同步'];
  let leaked = null;
  for (let s = 0; s <= 4000 && !leaked; s += 100) {
    CV.reset('settings'); CV.scroll = s; TXT.length = 0; CV.render();
    const hit = gone.filter((l) => TXT.some((x) => x.indexOf(l) >= 0));
    if (hit.length) leaked = { s: s, hit: hit };
  }
  chk('真的渲染：整页滚一遍，那七样（导出/导入/存档码两颗/恢复上一份/云同步/立即同步）**一处都不出现**',
    !leaked, leaked ? ('scroll=' + leaked.s + ' 还画着 ' + leaked.hit.join('、')) : '四种滚动位置都干净');
}

/* ---------- ⑧ 推档跟上进度（脏标记 / 切后台必推 / 合并 / 20 次上限） ---------- */
sec('=== ⑧ 推档跟上进度 ===');
{
  prefsWrite({ on: true });
  chk('每天上限 20 次（正常玩家一天 5 次以内）', CS.info().cap === 20);
  cloudDocs.length = 0;
  mkPlain(30, 300000); Core.save();
  let before = NET.write;
  let r = await CS.sync('manual');
  chk('第一次推：云上落了一条（密文 + 时间戳）',
    r.pushed === true && NET.write === before + 1 && String(cloudDocs[0].payload).slice(0, 5) === 'MPG1:', JSON.stringify(r));
  r = await CS.sync('manual');
  chk('脏标记：本机没变就不重复上传', r.skip === 'clean' && NET.write === before + 1, r.skip || '');
  /* 打关/结算：同一分钟内的多次合并成一次 */
  Core.addCur('points', 111); Core.save();
  r = await CS.noteProgress();
  chk('打关/结算之后会推（脏了、且离上次推超过一分钟就先推这一下）', r && r.ok === true, JSON.stringify(r));
  Core.addCur('points', 222); Core.save();
  const n1 = NET.write;
  r = await CS.noteProgress();
  chk('**同一分钟内的第二次**：合并成一次（这一次不再写云端）', r.skip === 'merged' && NET.write === n1, r.skip || '');
  /* 切后台必推：哪怕刚推过（不受"同一分钟合并"那条限制） */
  Core.addCur('points', 333); Core.save();
  const n2 = NET.write;
  r = await CS.triggerAuto('hide');
  chk('切后台**必推**（合并那条只管打关/结算）', r.pushed === true && NET.write === n2 + 1, JSON.stringify(r));
  /* 一天 20 次上限：把账本灌到 20 再推一次 */
  const P = JSON.parse(store[CLOUD_KEY]);
  P.pushes = 20; store[CLOUD_KEY] = JSON.stringify(P); CS._reset();
  Core.addCur('points', 444); Core.save();
  const n3 = NET.write;
  r = await CS.sync('manual');
  chk('一天推到 20 次：再脏也挡住（防异常刷）', r.skip === 'cap' && NET.write === n3, r.skip || '');
  /* 打关/结算那一钩子：**真的打一场**（不是只调 noteProgress），云端要跟着动 */
  prefsWrite({ on: true });
  cloudDocs.length = 0;
  mkPlain(30, 1000); Core.save();
  CS.boot();                                        // 挂上 battleSettle / stageComplete 的钩子
  const n4 = NET.write;
  Core.battleSettle({ points: 500 }, true, false);  // 一次胜利结算
  await wait(30);
  chk('打关/结算之后**自动跟上**：云端真的写了一次（钩子挂上了）', NET.write === n4 + 1,
    '云端写入 ' + n4 + ' → ' + NET.write);
}

/* ---------- ⑨ 首帧不发网络 ---------- */
sec('=== ⑨ 首帧不发网络请求 ===');
{
  const probe = `
    const fs=require('fs'),path=require('path');const JS=${JSON.stringify(JS)};
    const store={};global.GameGlobal=global;global.window=global;
    global.localStorage={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
    const ctx=new Proxy({},{get(t,k){if(k==='measureText')return s=>({width:10});if(k==='createLinearGradient')return()=>({addColorStop(){}});const p=['font','fillStyle','strokeStyle','lineWidth','globalAlpha','textAlign','textBaseline','shadowColor','shadowBlur','shadowOffsetY','letterSpacing'];if(p.indexOf(k)>=0)return t[k];return()=>{};},set(t,k,v){t[k]=v;return true;}});
    const canvas={width:390,height:844,getContext:()=>ctx,toDataURL:()=>''};
    let NET=0;let touch=null;
    const docs=[{_id:'d',_openid:'oX',payload:'{}',ts:1,bytes:2}];
    global.wx={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:390,windowHeight:844}),onTouchStart:f=>{touch=f;},onTouchMove(){},onTouchEnd(){},onHide(){},getStorageSync(){return null;},setStorageSync(){},removeStorageSync(){},setClipboardData(){},getClipboardData(){},
      cloud:{init(){NET++;},callFunction(){NET++;return Promise.resolve({result:{ok:false}});},database(){return{command:{lt:v=>({$lt:v})},collection(){const api={where(){return api;},limit(){return api;},get(){NET++;return Promise.resolve({data:docs});},count(){return Promise.resolve({total:0});},add(){NET++;return Promise.resolve({_id:'x'});},update(){NET++;return Promise.resolve({stats:{updated:1}});},remove(){return Promise.resolve({});},doc(){return{update(){NET++;return Promise.resolve({});}};}};return api;}};}}};
    require(path.join(JS,'mem-guard.js'));
    ['wx-adapter.js','data.js','core.js','battle.js','dungeon.js','cv.js','uiw.js'].concat(fs.readdirSync(JS).filter(f=>/^sc-.*\\.js\$/.test(f))).forEach(f=>{const p=path.join(JS,f);if(fs.existsSync(p))require(p);});
    const CS=global.CloudSync;
    CS.boot();
    const afterBoot=NET;
    CS.triggerAuto('first').then(()=>{ process.stdout.write(JSON.stringify({afterBoot,afterTouch:NET,touchArmed:typeof touch==='function'})); });
  `;
  let out = {};
  try { out = JSON.parse(execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' })); }
  catch (e) { out = { err: String(e.message).slice(0, 140) }; }
  chk('boot() 只登记口子，**一个网络请求都不发**', out.afterBoot === 0, 'boot 之后联网 ' + out.afterBoot + ' 次' + (out.err ? ' [' + out.err + ']' : ''));
  chk('第一个口子挂在"第一次触摸"上（不是开机定时器）', out.touchArmed === true);
  chk('第一次用户交互之后才联网', out.afterTouch > 0, '交互之后 ' + out.afterTouch + ' 次');
  const bootSrc = (/function boot\(\)[\s\S]*?\n  \}/.exec(SRC) || [''])[0];
  chk('boot() 源码里没有 sync / 联网调用（联网只能从三个口子进来）', !!bootSrc && !/\bsync\(/.test(bootSrc));

  /* 联网那口子开着，但**一次会话只结算一下**（不是每个触摸都联网）——
     并且"回前台"要把它重置：不然别的设备刚推过，这台回来看不到。 */
  prefsWrite({ on: true });
  cloudDocs.length = 0;
  mkPlain(30, 1000); Core.save();
  cloudDocs.push({ _id: 'docT', _openid: CLOUD_OPENID, payload: Core.exportSave(), ts: Number(Core.S.idle.lastTs) + 1000, bytes: 10, at: Date.now() });
  TOUCH.length = 0; SHOW.length = 0;
  CS.boot();
  const onTouch = TOUCH[TOUCH.length - 1], onShow = SHOW[SHOW.length - 1];
  const r0 = NET.read;
  onTouch(); await wait(20);
  const r1 = NET.read;
  onTouch(); await wait(20);
  chk('回到前台的**第一下**：看一次云端（推档跟不上进度就白搭）', r1 === r0 + 1, '读 ' + r0 + '→' + r1 + '→' + NET.read);
  chk('同一会话里再点：不再重复联网（不是每个触摸都发一次）', NET.read === r1, '再点之后 ' + NET.read);
  if (typeof onShow === 'function') onShow();
  onTouch(); await wait(20);
  chk('切回前台之后（onShow）：第一下又会看一次云端', NET.read === r1 + 1, '读 ' + r1 + '→' + NET.read);
}

/* ---------- ⑩ 开关：**默认开、而且关不了**（0927-P 改的口径） ----------
   父亲大人 2026-09-27：「**默认开启云同步，关不了**」——设置页那张「云同步」卡整张撤了
   （开关也跟着撤），开关在 `js/sc-cloud.js` 里被**钉成常开**：
     `prefs().on` 读出来恒 true（老档里写过 `on:false` 的也一样）、`info().on` 恒 true。
   做坏试验（必须能红）：把 `prefs()` 里的 `out.on = true` 改回 `out.on = out.on !== false`
   → ⑩-2／⑩-3 当场红（老档里的 false 又能把同步关掉）。 */
sec('=== ⑩ 云同步开关：默认开 · 老档里的 false 也补成开 · 关不了 ===');
{
  delete store[CLOUD_KEY]; CS._reset();
  chk('从来没同步过（本地没有这段偏好）→ 默认是**开**', CS.info().on === true);
  store[CLOUD_KEY] = '{}'; CS._reset();
  chk('老档里只写了半个对象 → 缺的字段按默认补（on=开）', CS.info().on === true);
  /* 关键那一条：老档/老偏好里**明确写过 false** 的也不再是"关"。 */
  store[CLOUD_KEY] = JSON.stringify({ on: false, lastSyncAt: 1700000000000, pushes: 3 }); CS._reset();
  const i2 = CS.info();
  chk('老偏好里写过 on:false 的：**照样是开**（开关钉死，没有任何入口能关掉）',
    i2.on === true, 'info().on=' + i2.on + '（应 true）');
  chk('老偏好里其它字段不许被默认值冲掉', i2.lastSyncAt === 1700000000000 && i2.pushes === 3,
    'lastSyncAt=' + i2.lastSyncAt + ' · pushes=' + i2.pushes);
  store[CLOUD_KEY] = '{"not json"'; CS._reset();
  chk('这段偏好整个坏掉也不影响游戏（退回默认、不抛错）', CS.info().on === true);
  prefsWrite({ on: false }); CS._reset();
  const r = CS.toggle();
  chk('调那个旧开关函数：报"常开"，`info().on` 仍然是 true（关不掉）',
    r.on === true && CS.info().on === true, JSON.stringify(r));
  /* 关不掉 ⇒ 静默同步那条路照常工作（切后台必推） */
  cloudDocs.length = 0;
  mkPlain(30, 300000); Core.save();
  const n0 = NET.write;
  const rr = await CS.triggerAuto('hide');
  chk('既然关不掉：切后台照样把这一份推上云（不是"没入口了、同步也停了"）',
    rr.pushed === true && NET.write === n0 + 1, JSON.stringify(rr));
  /* 界面上**一处都能不出现**那个开关 */
  const lastSrc = fs.readFileSync(path.join(JS, 'sc-last.js'), 'utf8');
  chk('设置页上没有任何云同步开关的入口（cloud_toggle 热区与文案都撤了）',
    !/id:\s*'cloud_toggle'/.test(lastSrc) && !/CV\.on\('cloud_toggle'/.test(lastSrc)
    && !/label:\s*'立即同步'/.test(lastSrc));
}

console.log('\n云同步体检：' + pass + ' 条对得上，' + fail + ' 条对不上');
if (fail) { console.log('结论：✗ 云同步这条链上有硬要求没落地，逐条看上面红色的'); process.exitCode = 1; }
else console.log('结论：静默同步（谁新听谁的、覆盖前必留档）、存档码两道校验、粘贴式导出入还在 ✓');
})();
