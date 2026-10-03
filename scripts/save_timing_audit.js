/* 落盘时机审计（2026-10-03 父亲大人：「有数值变化就更新一次存档，会很浪费吗」→ 选 A）：
     node scripts/save_timing_audit.js
   ==============================================================================
   这一把量的是**A（闪退时少丢进度）**，分两层：

     ① **界面层不许直接改存档。** `sc-*.js` 里出现 `Core.S.xxx = …` 就是绕过逻辑层改档 ——
        这种写法改完没有任何人负责落盘，而且会绕过 Core 里那一堆"改完顺手 save"的收口。
        （实测：0 处。这条钉住它别长出来。）

     ② **逻辑层的动作函数：改了状态就必须真的落盘。** 逐个真调 `Core.<动作>()`，
        用 `localStorage.setItem` 当"落盘"的探针（比包 `Core.save` 准：内部调的是模块内的 save），
        凡是"状态变了、一个字节都没写"的都要**在下面的名单里给出理由**，名单外一律 FAIL。

   为什么不是"每个数值变化都存一次"：那是另一头的浪费。实测（本机 node）：
       · 存档 JSON 108.7 KB · 落盘密文 289.8 KB · `Core.save()` 一次约 **4.29 ms**
         （JSON.stringify 0.87 ms + 加密 2.97 ms + 写盘）；
       · 一场守关 Boss 战只有 **10 帧** —— 逐帧存一场 43ms，无感，这条不浪费；
       · 真正会痛的是**批处理循环**：拆 50 件 = 215ms 同步写盘。
   所以口径是"**循环里不存、结束存一次；关键节点立刻存；其余交给 15 秒心跳**"——
   下面 ② 就是在保证"结束存一次"这一步没漏。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('save_timing_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const Core = E.Core, D = E.D, JS = E.JS;

/* ---------- ① 界面层不许直接改存档 ---------- */
{
  const RE = /Core\.S(\.[A-Za-z_$][\w$]*)+(\[[^\]]*\])?\s*(=[^=]|\+\+|--|\.push|\.splice|\.sort|\.pop|\.shift)|delete\s+Core\.S\./;
  const bad = [];
  fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)).forEach((f) => {
    /* ⚠️ 先把注释**整段抹成空白**再扫（保留行号）——
       多行注释的续行不以 `*` 开头，按"行首是不是注释"筛是筛不干净的（第一版就被那段
       `coachSeen` 的解释文字坑了第二次）。 */
    const raw = fs.readFileSync(path.join(JS, f), 'utf8');
    const lines = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
      .split('\n');
    lines.forEach((ln, i) => {
      if (!ln.trim()) return;
      if (!RE.test(ln)) return;
      /* ⚠️ 判据要给人**改完顺手存**留位置：项目里绝大多数写法是"上一行改、下一行 `Core.save()`"。
         第一版只看**这一行**、于是把 5 处"下一行就存了"的真·合规写法全报成红 —— 那是尺子的错。 */
      /* 窗口＝**跳过注释与空行之后的下 5 行代码**：项目里"改完写一段解释、再 save()"是常态写法，
         按物理行数切会把它们全报成红（第一版 3 行窗口就被 `coachSeen` 那段注释坑了一次）。 */
      const codeAfter = [];
      for (let j = i; j < lines.length && codeAfter.length < 5; j++) {
        const L = lines[j];
        if (!L.trim()) continue;
        codeAfter.push(L);
      }
      const win = codeAfter.join('\n');
      if (/\bCore\.save\s*\(/.test(win)) return;
      bad.push(f + ':' + (i + 1) + '  ' + ln.trim().slice(0, 60));
    });
  });
  (bad.length ? R.fail : R.pass)('① 界面层改了存档就必须紧跟着落盘（改完 3 行内要有 Core.save()）', {
    file: 'js/sc-*.js', expected: '0 处"改了却不存"',
    actual: bad.length ? bad.slice(0, 6).join(' ; ') : '0 处（改档的都紧跟 save）',
  });
}

/* ---------- ② 逻辑层动作：改了就必须落盘 ---------- */
/* ⚠️ 两份名单都必须**带理由**（任务书的口径：白名单不是免检，是"查过并说明为什么安全"）。 */
const LEAF = {            // 叶子函数：本身不落盘，但**调用方一定落盘**（结算 / 扫荡 / 抽卡那几条链）
  addCharExp: '伙伴经验池；调用方是战斗结算 / 扫荡 / 喂经验，那几处结束都会 save()',
  addPlayerBattleExp: '玩家战斗经验；调用方同上（settleRun / sweep）',
  applyRewardObj: '奖励落库的原子口；调用方是任务 / 悬赏 / 图鉴 / 邮件，那些动作各自 save()',
  addCur: '货币原子口；全项目产出都经它，调用方负责落盘',
  addItem: '道具原子口；同上',
  removeItem: '同上（消耗口）',
  grantEquip: '发装备的原子口；调用方（掉落 / 开箱 / 保底 / 尺子）负责落盘',
  grantSignatureEquip: '同上',
  addShardPool: '碎片池原子口；调用方负责落盘',
  unlockWorld: '解锁世界；调用方是 stageComplete / 转生 / 迁移，都 save()',
  refreshUnlocks: '功能解锁表刷新；调用方同上',
  addChar: '抽卡 / 关卡赠送伙伴的原子口；调用方（recruit / 首通保底）负责落盘',
  claimStash: '待领箱领取；函数里是 `if (moved) save()` —— 箱子空时 moved=false 不写（探针这次正是空箱）',
  claimStashEq: '装备待领箱，同上',
  addAdSweepBonus: '扫荡次数 +N；`if (!k) return 0` 提前返回（探针传了 0）—— 真加时函数里有 save()',
  travelProgress: '挂机游历推进；调用方（心跳 / 领取）负责落盘',
  settleOffline: '离线结算：**故意不落盘**（`settleWriting` 那道闸 —— 开机结算不许把 savedAt 盖章成"现在"），结果由随后的正常存盘带上',
};
const LAZY = {            // 惰性初始化：只是把"今天 / 本周"的键补上，不是玩家进度
  task: '任务表惰性初始化（补 date / weekKey），不算进度',
  claimTask: '参数不合法 / 条件不满足时提前返回，只顺手补了日期键（领奖那条路本身会 save）',
  claimAllTasks: '同上',
  claimWeekly: '同上',
  claimAllWeekly: '同上',
  bountyState: '悬赏惰性初始化（补当天悬赏期），不算进度',
  claimBounty: '同上',
  sweepLeft: '扫荡次数惰性初始化（补 date），不算进度',
  mailBox: '信匣惰性初始化',
  arenaState: '斗法台惰性初始化（补 date）',
  gardenState: '药园惰性初始化',
  fabaoState: '法宝惰性初始化',
  mountState: '坐骑惰性初始化',
  signState: '点灯惰性初始化',
  actRoll: '活跃度惰性初始化（跨天时补 day / loginDays）',
  setPendingRun: '把"进行中的副本"记进存档（**故意不落盘**：它跟着下一次正常存盘走，见 core 里那段注释）',
  setActiveBeast: '伴生体上阵标记；调用方（界面）随后会 save()',
};

function fresh() {
  Core.newGame(); Core.setPlayerName('落盘体检');
  Core.S.player.level = 80;
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  D.WORLDS.forEach((w) => { Core.S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(3), hell: Array(12).fill(3) } }; });
  D.characters.slice(0, 8).forEach((c) => Core.addChar(c.id));
  Core.S.party = ['@player'].concat(D.characters.slice(0, 4).map((c) => c.id));
  Core.S.bag.eqCap = 400;
  for (let i = 0; i < 60; i++) Core.grantEquip('W10', 'SSR', null);
  Core.autoEquipBest();
  ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 1e7));
  D.MOUNTS.forEach((m) => Core.buyMount(m.id));
  D.FABAO.forEach((f) => Core.buyFabao(f.id));
  Core.save();
}
function argsOf() {
  const e0 = Object.keys(Core.S.equips || {})[0];
  return {
    addCur: ['points', 10], addItem: ['mat_t1', 1], removeItem: ['mat_t1', 1],
    grantEquip: ['W10', 'SR', null], enhance: [e0], decompose: [e0],
    decomposeMany: [Object.keys(Core.S.equips || {}).slice(0, 3)],
    equipItem: ['@player', e0], unequipItem: ['@player', 'weapon'],
    addChar: ['C001'], addCharExp: [['@player'], 100], addPlayerBattleExp: [100],
    setPlayerName: ['体检'], choosePlayerBloodline: ['修真'], buyTalent: [Object.keys(D.TALENTS || {})[0]],
    allocateAttr: [(D.ATTR_META && D.ATTR_META[0] && D.ATTR_META[0].id), 1],
    buyMount: [D.MOUNTS[0] && D.MOUNTS[0].id], buyFabao: [D.FABAO[0] && D.FABAO[0].id],
    upKeji: [D.KEJI && D.KEJI[0] && D.KEJI[0].id],
    claimGift: ['____'], claimCode: ['____'], claimTask: ['daily1'], claimBounty: [0],
    claimIdle: [], claimStash: [], claimEverything: [], openBox: ['box_ur'], openMatPack: ['matpack_low'],
    recruit: ['advanced'], drawSign: [], plantGarden: [0], harvestGarden: [0], buyGardenPlot: [],
    sweep: ['W01', 'normal', 1, 1], arenaFight: [], corridorFight: [],
    mailClaim: ['____'], applyRewardObj: [{ points: 1 }], setActiveBeast: ['____'], setPendingRun: [{}],
  };
}
{
  let wrote = false;
  const origSet = global.localStorage.setItem;
  global.localStorage.setItem = function (k, v) {
    if (String(k).indexOf('wxlh_save_v') === 0 && !/_bak|_pre|_slot|_pre_switch|_pre_restore/.test(String(k))) wrote = true;
    return origSet.call(this, k, v);
  };
  const cand = Object.keys(Core).filter((k) => typeof Core[k] === 'function'
    && /^(add|remove|grant|use|buy|up|claim|do|set|apply|enhance|decompose|equip|unequip|learn|open|recruit|draw|plant|harvest|expand|feed|refine|reforge|level|star|skill|attr|blood|realm|gene|awaken|sweep|corridor|arena|travel|sign|mail|gift|task|bounty|idle)/i.test(k)
    && !/^(get|is|info|save|slotInfo|loadIssue|rescueInfo|backupInfo|saveDiag)/.test(k));
  const unexplained = [], known = [];
  cand.forEach((name) => {
    fresh();
    const before = JSON.stringify(Core.S);
    wrote = false;
    try { Core[name].apply(Core, argsOf()[name] || []); } catch (e) { return; }      // 参数不对就跳过
    if (JSON.stringify(Core.S) === before) return;                                   // 没变 → 不适用
    if (wrote) return;                                                               // 变了且落盘 ✓
    if (LEAF[name] || LAZY[name]) known.push(name); else unexplained.push(name);
  });
  global.localStorage.setItem = origSet;
  R.note('扫了 ' + cand.length + ' 个动作函数；"改了状态但没落盘"共 ' + (known.length + unexplained.length)
    + ' 个（白名单 ' + known.length + ' · **没交代的 ' + unexplained.length + '**）');
  (unexplained.length ? R.fail : R.pass)('② 逻辑层动作"改了就必须落盘"（没落盘的必须在名单里给出理由）', {
    file: 'js/core.js', expected: '0 个没交代的',
    actual: unexplained.length ? unexplained.join(' ') : ('全部有交代（叶子函数 / 惰性初始化 / 故意延后，见脚本内名单）'),
  });
}

R.finish();
