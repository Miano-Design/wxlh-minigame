/* 升级回归总表（2026-10-03 终版任务书 §48）：node scripts/save_upgrade_regression.js
   ==============================================================================
   任务书要的是一张**一眼能看的表**，十一项各自 PASS / FAIL：

     SAVE_COMPAT · WORLD_PROGRESS · WORLD_NAME_RENAME · STORY_MIGRATION · BOSS_ARCHIVE
     FIRST_CLEAR · WORLD_GATE · REINCARNATION · CLOUD_SYNC · BATTLE_SESSION · SIGNATURE_GATE

   做法：能复用现成尺子的就**真跑那把尺子**（子进程，拿它的退出码当判据 —— 不是抄结论），
   剩下的（云函数 / 战斗 session / SIGNATURE 门）在这条里现场测。

   ⚠️ 云函数那一节是**真跑代码**：把 `wx-server-sdk` 换成桩（能指定"读得到 / 不存在 / 数据库炸"），
      再 `require` 云端那份 index.js 调 `pull` —— 因为"数据库坏了被当成没有存档"
      正是这一轮点名的 P0，靠读源码是证不出来的。

   只读脚本：内存夹具 + 临时桩，不碰真存档、不写盘、不发网络请求。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('save_upgrade_regression');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { Core, D } = E;
const store = E.store;
const ROOT = E.ROOT, JS = E.JS;

const t = (item, ok, expected, actual) => {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
const readJs = (f) => fs.readFileSync(path.join(JS, f), 'utf8');

Core.newGame(); Core.save();
const SAVE_KEY = Object.keys(store).filter((k) => /^wxlh_save_v\d+$/.test(k))[0];
const legacy = (extra) => Object.assign({
  v: 5, savedAt: 1700000000000,
  player: { level: 60, exp: 0, bestWorldIdx: 0, reincarnations: 0 },
  worlds: {}, worldFirstClear: {}, chars: {}, equips: {}, equipped: {}, items: {}, cur: {},
  bag: { itemCap: 50, matCap: 50, eqCap: 50, itemExpands: 0, matExpands: 0, eqExpands: 0 },
}, extra || {});
function through(n) {
  const out = {};
  for (let i = 1; i <= n; i++) out['W' + String(i).padStart(2, '0')] =
    { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  return out;
}
const storyFull = (S, wid) => {
  const w = (S.story.w || {})[wid] || {};
  return ['in', 'pre', 'mid', 'post'].every((p) => w[p] === 1) && !!(S.story.b || {})[wid];
};
function loadFixture(fx) { store[SAVE_KEY] = JSON.stringify(fx); return Core.load(); }

/* ==========================================================================
   ①②③④⑤⑥⑧ —— 直接跑现成的尺子（拿退出码当判据）
   ========================================================================== */
const runSub = (file) => {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, file)], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    return { code: 0, line: (String(out).match(/RESULT: .*/) || ['RESULT: (没输出)'])[0] };
  } catch (e) {
    return { code: (typeof e.status === 'number' ? e.status : 1), line: (String(e.stdout || e.message).match(/RESULT: .*/) || ['RESULT: (没输出)'])[0] };
  }
};
{
  const r = runSub('migration_fixture_audit.js');
  t('SAVE_COMPAT 旧档迁移黑盒（8 个夹具：读→迁移→断言→存盘→再读→再断言）', r.code === 0,
    'migration_fixture_audit 退出码 0', '退出码 ' + r.code + ' · ' + r.line);
}
{
  const r = runSub('world_save_compat_audit.js');
  t('WORLD_PROGRESS + WORLD_NAME_RENAME 世界 ID 稳定与世界改名兼容（§7 的 A/B/C/D）', r.code === 0,
    'world_save_compat_audit 退出码 0', '退出码 ' + r.code + ' · ' + r.line);
}
{
  const r = runSub('settle_audit.js');
  t('BATTLE_SESSION（行为）同一场只结算一次、不重复发奖、自动下一关链路通', r.code === 0,
    'settle_audit 退出码 0', '退出码 ' + r.code + ' · ' + r.line);
}

/* ==========================================================================
   STORY_MIGRATION / BOSS_ARCHIVE / FIRST_CLEAR —— 现场再量一遍（不靠子进程的结论）
   ========================================================================== */
{
  loadFixture(legacy({ player: { level: 60, bestWorldIdx: 11, reincarnations: 0 },
    worlds: through(12), worldFirstClear: {} }));
  const S = Core.S;
  t('STORY_MIGRATION 老档（推到 W12）升级后 W01~W12 的世界故事直接可读',
    storyFull(S, 'W01') && storyFull(S, 'W12'),
    'W01 与 W12 四段全开', 'W01=' + storyFull(S, 'W01') + ' · W12=' + storyFull(S, 'W12'));
  t('STORY_MIGRATION 迁移是**只增不减**：已读的不被改回去、未读的往前补',
    (S.story.w.W12 || {}).post === 1 && (S.story.w.W13 || undefined) === undefined,
    'W12.post=1 · W13 无记录', JSON.stringify(S.story.w.W12) + ' · W13=' + JSON.stringify(S.story.w.W13 || null));
  t('BOSS_ARCHIVE 老档打过的 Boss 自动进卷宗（Boss 计数不再是 0/36）',
    Object.keys(S.story.b || {}).length === 12, 'story.b 里 12 项',
    Object.keys(S.story.b || {}).length + ' 项');
}
{
  /* FIRST_CLEAR：**不补发**。把已通关的世界再"通"一次，首通奖励必须是空的。 */
  const before = JSON.stringify(Core.S.cur);
  const res = Core.stageComplete('W12', 'normal', 11, 3);
  t('FIRST_CLEAR 迁移**不补发首通奖励**：重打通关时不再发一次（也没重算世界进度）',
    !res.firstClearReward && JSON.stringify(Core.S.cur) === before,
    'firstClearReward 空 · 货币不变',
    'firstClearReward=' + JSON.stringify(res.firstClearReward) + ' · 货币' + (JSON.stringify(Core.S.cur) === before ? '不变' : '**变了**'));
}

/* ==========================================================================
   WORLD_GATE / REINCARNATION
   ========================================================================== */
{
  loadFixture(legacy({ player: { level: 90, bestWorldIdx: 24, reincarnations: 0 },
    /* ⚠️ 夹具只能给到 W12 —— 给 `through(25)` 等于把 W13 先解锁好，
       那量到的就不是"门有没有挡住"，而是夹具自己开的门（第一版就是这么假红的）。 */
    worlds: through(12), worldFirstClear: {} }));
  const S = Core.S;
  t('WORLD_GATE 转生门是**唯一真相**：W12 通关但 0 转 ⇒ W13 锁着',
    !(S.worlds.W13 && S.worlds.W13.unlocked), 'W13 锁',
    'W13 unlocked=' + !!(S.worlds.W13 && S.worlds.W13.unlocked));
  /* 顺带确认"困难/地狱不解锁新世界"：给 W12 塞满 hard/hell 不应改变 W13 */
  S.worlds.W12.stages.hard = Array(12).fill(3);
  S.worlds.W12.stages.hell = Array(12).fill(3);
  Core.refreshWorldUnlocks();
  t('WORLD_GATE 困难/地狱全通**不解锁**下一个世界（只有普通难度算主线）',
    !(S.worlds.W13 && S.worlds.W13.unlocked), 'W13 仍然锁',
    'W13 unlocked=' + !!(S.worlds.W13 && S.worlds.W13.unlocked));
}
{
  /* 转生有门槛（`D.REINCARN_REQS`：第 3 次的第 3 项是 Lv.100 + 铭刻 4 阶 + 灯芯 Lv.35）——
     夹具要把这三样都摆到位，否则量到的是"没资格转生"，不是"转生会不会清残域"。 */
  loadFixture(legacy({ player: { level: 100, bestWorldIdx: 23, reincarnations: 2, geneLock: 4 },
    buildings: { core: 35 }, worlds: through(24), worldFirstClear: {} }));
  const S = Core.S;
  S.player.level = 100;
  const beforeKeys = Object.keys(S.worlds).slice().sort();
  const beforeW12 = JSON.stringify(S.worlds.W12);
  const beforeFc = JSON.stringify(S.worldFirstClear);
  const r = Core.reincarnate();
  const afterKeys = Object.keys(Core.S.worlds).slice().sort();
  /* ⚠️ 判据是"**已经有的一个都不少、星数一字不改**"，不是"键集合完全相等" ——
     转生会把 W25 那道转生门打开（新解锁一张图），那是**该发生**的事，不是被清空。
     （第一版写成"键集合必须一样"，把"开门"误判成了"丢档"。） */
  const lost = beforeKeys.filter((k) => afterKeys.indexOf(k) < 0);
  t('REINCARNATION 第 3 次转生：已有的世界一张不少、星数与首通记录**保留**（不再被清空）',
    r.ok !== false && lost.length === 0 && JSON.stringify(Core.S.worlds.W12) === beforeW12
      && JSON.stringify(Core.S.worldFirstClear) === beforeFc,
    '没有世界被删 · W12 星数不变 · 首通记录不变',
    (r.ok === false ? ('转生失败：' + r.msg)
      : ('丢了 ' + lost.length + ' 张（' + lost.join(',') + '）'
        + ' · W12 ' + (JSON.stringify(Core.S.worlds.W12) === beforeW12 ? '不变' : '**变了**')
        + ' · 首通 ' + (JSON.stringify(Core.S.worldFirstClear) === beforeFc ? '不变' : '**变了**'))));
  t('REINCARNATION 转生次数 +1、且 W25 转生门随之开放',
    Core.S.player.reincarnations === 3 && !!(Core.S.worlds.W25 && Core.S.worlds.W25.unlocked),
    'reincarnations=3 · W25 开',
    'reincarnations=' + Core.S.player.reincarnations + ' · W25=' + !!(Core.S.worlds.W25 && Core.S.worlds.W25.unlocked));
}

/* ==========================================================================
   CLOUD_SYNC —— 真跑云函数（wx-server-sdk 换成桩）
   ========================================================================== */
/* ⚠️ 这一段要 await 云函数的 Promise ⇒ 包在 async IIFE 里（CommonJS 顶层不许 await）。
   下面两节是纯同步的，跑完各自断言、最后统一收口（见文件末尾的 `cloudPromise.then`）。 */
const cloudPromise = (async function () {
  const Module = require('module');
  const origRequire = Module.prototype.require;
  const FN = path.join(ROOT, 'cloudfunctions/cloudsave/index.js');
  /* 桩要能**分别**控制 `doc.get` 与 `where` —— 老记录归并那条路是"doc 查无此条 → where 才炸"，
     一个总开关量不到它（第一版就是这么假绿的：where 压根没被调用）。 */
  function cloudCall(behavior, event) {
    const b = typeof behavior === 'string' ? { docGet: behavior, where: 'ok' } : behavior;
    const mkErr = (code, msg) => { const e = new Error(msg || 'boom'); e.errCode = code; return e; };
    const collection = {
      doc: () => ({
        get: async () => {
          if (b.docGet === 'notfound') throw mkErr(-502004, 'document does not exist');
          if (b.docGet === 'dberror') throw mkErr(-502001, 'database request failed');
          return { data: { _id: 'x', _openid: 'o_test', payload: 'P', ts: 111, bytes: 1, ver: 'v' } };
        },
        set: async () => ({}), remove: async () => ({}),
      }),
      where: () => ({ limit: () => ({ get: async () => {
        if (b.where === 'dberror') throw mkErr(-502001, 'database request failed');
        return { data: [] };
      } }) }),
      add: async () => ({}),
    };
    const db = { collection: () => collection, runTransaction: async (fn) => fn({ collection: () => collection }) };
    const sdk = { init() {}, DYNAMIC_CURRENT_ENV: 'dyn', database: () => db, getWXContext: () => ({ OPENID: 'o_test' }) };
    Module.prototype.require = function (id) { return id === 'wx-server-sdk' ? sdk : origRequire.apply(this, arguments); };
    delete require.cache[require.resolve(FN)];
    let mod;
    try { mod = require(FN); } finally { Module.prototype.require = origRequire; }
    return Promise.resolve(mod.main(event || { action: 'pull' }));
  }

  const notFound = await cloudCall('notfound', { action: 'pull' });
  t('CLOUD_SYNC 「这个账号还没有云端存档」→ ok:true + hasDoc:false（正常的"新玩家"）',
    notFound && notFound.ok === true && notFound.hasDoc === false,
    'ok=true · hasDoc=false', JSON.stringify({ ok: notFound && notFound.ok, hasDoc: notFound && notFound.hasDoc }));

  const dbError = await cloudCall('dberror', { action: 'pull' });
  t('CLOUD_SYNC 「数据库读不出来」→ ok:false + code=DB_ERROR（**绝不是"没有存档"**）—— §19 的 P0',
    dbError && dbError.ok === false && dbError.code === 'DB_ERROR',
    'ok=false · code=DB_ERROR',
    JSON.stringify({ ok: dbError && dbError.ok, code: dbError && dbError.code, stage: dbError && dbError.stage, errCode: dbError && dbError.errCode }));

  const whereFail = await cloudCall({ docGet: 'notfound', where: 'dberror' }, { action: 'pull' });
  t('CLOUD_SYNC 老记录归并时 `where` 挂了 → 同样报 DB_ERROR（不许判成"新账号"）',
    whereFail && whereFail.ok === false && whereFail.code === 'DB_ERROR',
    'ok=false · code=DB_ERROR',
    JSON.stringify({ ok: whereFail && whereFail.ok, code: whereFail && whereFail.code, stage: whereFail && whereFail.stage }));

  const hasDoc = await cloudCall('ok', { action: 'pull' });
  t('CLOUD_SYNC 云端真有档 → ok:true + hasDoc:true（三条路互不混淆）',
    hasDoc && hasDoc.ok === true && hasDoc.hasDoc === true,
    'ok=true · hasDoc=true', JSON.stringify({ ok: hasDoc && hasDoc.ok, hasDoc: hasDoc && hasDoc.hasDoc }));

  const src = fs.readFileSync(FN, 'utf8');
  const codeOnly = strip(src);
  t('CLOUD_SYNC 云函数里那条"一律 return null"的写法已经消失（catch 必须区分）',
    !/catch \(e\) \{ return null; \}/.test(codeOnly),
    '没有无条件的 return null', /catch \(e\) \{ return null; \}/.test(codeOnly) ? '**还在**' : '已收口');
  t('CLOUD_SYNC 客户端把 DB_ERROR 与"云端没有存档"分开说话',
    /code === 'DB_ERROR'/.test(strip(readJs('sc-cloud.js'))),
    "sc-cloud.js 里有 code === 'DB_ERROR' 分支",
    /code === 'DB_ERROR'/.test(strip(readJs('sc-cloud.js'))) ? '有' : '**没有**');
})();

/* ==========================================================================
   BATTLE_SESSION —— 源码级：任务书 §21 点名禁止的那一行必须不在
   ========================================================================== */
{
  const src = strip(readJs('sc-dungeon.js'));
  t('BATTLE_SESSION §21：`if (!run && myRun) run = myRun;`（旧回调复活旧战斗）已经删干净',
    !/!\s*run\s*&&\s*myRun\s*\)\s*run\s*=\s*myRun/.test(src),
    '源码里没有这一行', /!\s*run\s*&&\s*myRun/.test(src) ? '**还在**' : '已删');
  t('BATTLE_SESSION 每一场战斗有唯一 sessionId，`onEnd` 按号认场（不是按"run 还在不在"）',
    /session:\s*\+\+sessionSeq/.test(src) && /run\.session !== mySession/.test(src),
    'startStage 发号 · onEnd 比号', (/session:\s*\+\+sessionSeq/.test(src) ? '发号 ✓' : '发号 ✗') + ' · ' + (/run\.session !== mySession/.test(src) ? '比号 ✓' : '比号 ✗'));
  t('BATTLE_SESSION 结算幂等认的是**那一场的对象身份**（不是"上一张面板"）',
    /settledRun\s*&&\s*settledRun\s*===\s*myRun/.test(src),
    'settledRun === myRun', /settledRun\s*&&\s*settledRun\s*===\s*myRun/.test(src) ? '有' : '**没有**');
}

/* ==========================================================================
   SIGNATURE_GATE —— W25 是唯一那道门，所有来源都得过
   ========================================================================== */
{
  loadFixture(legacy({ player: { level: 40, bestWorldIdx: 5, reincarnations: 0 }, worlds: through(6) }));
  Core.refreshWorldUnlocks();
  t('SIGNATURE_GATE W01~W24：还没到 W25 时 `inSignatureEra()` 为假（本命装不许产出）',
    Core.inSignatureEra() === false, 'false', String(Core.inSignatureEra()));
  loadFixture(legacy({ player: { level: 100, bestWorldIdx: 24, reincarnations: 3 }, worlds: through(25) }));
  Core.refreshWorldUnlocks();
  t('SIGNATURE_GATE 到 W25 起 `inSignatureEra()` 为真（本命装时代开始）',
    Core.inSignatureEra() === true, 'true', String(Core.inSignatureEra()));

  /* 各来源逐条查"有没有过这道门"。GM（`gm_sig`）是调试入口、正式版关着，按设计不受门限制。 */
  const dsrc = strip(readJs('dungeon.js'));
  /* ⚠️ 判据直接写"地狱 Boss 那条掉落条件里必须有门"，不去猜行号 / 不去比第一个
     `diff === 'hell'`（文件里先出现的是**掉率表**那一行 —— 第一版就是这么比错的）。
     做坏试验：把 dungeon.js 里那句 `Core.inSignatureEra() &&` 删掉 → 这条当场红。 */
  const hellGate = /kind === 'boss' && diff === 'hell' && Core\.inSignatureEra\(\)/.test(dsrc);
  t('SIGNATURE_GATE 地狱 Boss 掉落本命装那条**必须过门**（§35 点名的漏）',
    hellGate,
    "地狱 Boss 掉落条件 = `kind === 'boss' && diff === 'hell' && Core.inSignatureEra()`",
    hellGate ? '过了门' : '**没门**（W01 地狱就能刷本命装）');
  const csrc = strip(readJs('core.js'));
  const boxLine = (csrc.match(/item\.rarity === 'UR'[^\n]*/) || [''])[0];
  t('SIGNATURE_GATE UR 箱那条**必须过门**', /inSignatureEra\(\)/.test(boxLine),
    'UR 箱那行里有 inSignatureEra()', boxLine.trim() || '(没找到那一行)');
  /* 全项目不许有人自己写一句"世界号 ≥ 25"当门（第二道门 = 迟早分叉）。 */
  const selfMade = [];
  ['core.js', 'dungeon.js', 'sc-last.js', 'sc-bag.js'].forEach((f) => {
    const s = strip(readJs(f));
    if (/>=\s*25\b/.test(s) && !/inSignatureEra/.test(s)) selfMade.push(f);
  });
  t('SIGNATURE_GATE 没有第二个"W25 门"（判据只此一处）', selfMade.length === 0,
    '0 个文件', selfMade.join(' ') || '0 个');
}

cloudPromise.then(function () { R.finish(); });
