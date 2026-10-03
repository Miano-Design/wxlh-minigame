/* 剧情 × 战斗矩阵 + 叙事完整度审计（R1.6 叙事轮 · 任务书 §三十一 / §三十二）：
     node scripts/story_battle_matrix.js
   ==============================================================================
   它回答一件事：**这个世界是不是"剧情让我关心一件事，战斗却完全无关"**（§三十三 的 FAIL 判据）。

   全部读**真数据 / 真引擎**，不是抄一份策划表：
     · 剧情侧：`G.STORYDATA`（in / pre / mid / post 四拍）+ `BOSS[wid]`（say / inner / after / mystery）
     · 战斗侧：**真调** `Dungeon.makeEnemies()` 生 Boss、真跑一场 `Battle.run()`，
               看引擎到底给没给 `phase`（二阶段/狂暴）帧 —— 不靠"代码里写了就算"
     · 残响侧：`G.BattleStory.tableOf(wid)`（事件 → 残响的唯一映射）
   只读：不改任何数值、任何文案。 */
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('story_battle_matrix');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { Core, D, G } = E;
const Dun = E.G.Dungeon, Battle = E.G.Battle;
const St = G.Story, BS = G.BattleStory;
/* 稀有度排序：与 `progression_audit` 用**同一张表**（别各写一份）。 */
const RARITY_ORDER = { UR: 0, SSR: 1, SR: 2, R: 3, N: 4 };
if (!BS) { R.blocked('BattleStory 没加载（js/sc-story-battle.js）', { expected: '叙事层可用', actual: '缺失' }); R.finish(); return; }

/* 固定种子：这一场要可复现（不然"有没有二阶段"每次读数都可能不同） */
let seed = 20261002;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

/* ---------- 测试队：**要能跑到阶段帧**，不是越强越好 ----------
   ⚠️ 这条踩过坑：第一版用"满配队"，Boss 第一回合就被打死 →
   `battle.js` 的阶段判定写的是 `if (boss.hp > 0)`，死了就不判 → **36/36 全报"跑不到阶段帧"**，
   那是尺子的假账（满配队不是任何一场真实 Boss 战的样子）。
   现在按 `power` 三档递减试，取**第一个真跑出阶段帧**的那一档，并在报告里写明用的是哪一档。 */
function teamAt(wid, mul) {
  Core.newGame(); Core.setPlayerName('叙事审计'); Core.choosePlayerBloodline('修真');
  const S = Core.S;
  (D.UNLOCKS || []).forEach((u) => { S.unlocks[u.id] = true; });
  D.WORLDS.forEach((w) => { S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } }; });
  /* **按世界定档**：同一个固定队伍不可能同时陪 W01 的 16 万血 Boss 和 W36 的 600 万血 Boss 玩，
     所以队伍跟着世界走（等级与世界序号成正比、装备用这个世界档位的品质），
     再乘一个 `mul` 去扫"偏弱 / 正好 / 偏强"三档。 */
  const wi = Math.max(0, D.WORLDS.findIndex((w) => w.id === wid));
  const lv = Math.max(5, Math.min(D.PLAYER_MAX_LV, Math.round((8 + wi * 2.6) * mul)));
  const rarity = wi >= 10 ? 'UR' : wi >= 4 ? 'SSR' : 'SR';
  /* ================= 2026-10-03 世界曲线轮 · **阵容口径与真实世界档位对齐** =================
     原来这里用的是 `D.characters.slice(0, 4)` —— 角色表**最前面的四个**（也就是最弱的一批），
     而且不点铭刻 / 没有坐骑法宝 / 不强化。后果实测过：这 10 个世界的守关 Boss，
     把档位从 mul 0.7 一路加到 3.0（Lv 顶到 100）**照样打不过**（win=false）——
     连 30% 血线都摸不到，自然永远没有二阶段/狂暴帧，尺子就报"跑不到阶段帧"。
     那是**测试队的账，不是游戏本体的账**：`progression_audit` 用世界档位正常阵容
     （满编最高稀有度 + 本档装备 + 按世界给的铭刻 + 坐骑法宝 + 强化）跑同一批 Boss，
     36/36 世界都能过关、TTK 全在区间内。
     所以这里改成**与 `progression_audit` 的 B（认真）档同源**的阵容口径 ——
     不重新发明一套队伍，按那套已成熟的规格来（稀有度排序取前 4、星级/血统/技能按档、
     铭刻按该世界的转生门、坐骑法宝买齐、按世界给强化等级）。
     ⚠️ 只改**测试 fixture**，一个 Boss 数值都没动。 */
  const REAL_N = 4;
  const BEST = D.characters.slice()
    .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9))
    .map((c) => c.id);
  let gate = 0;
  for (let i = 0; i <= wi; i++) gate = Math.max(gate, D.WORLDS[i].reincarn || 0);
  S.player.level = lv;
  S.player.bloodlineLv = Math.min(D.BLOODLINE_MAX, Math.round(lv * 0.5));
  S.player.geneLock = Math.min(D.GENE_LOCK_MAX, gate + 2);
  S.player.attrPoints = lv * 3;
  D.ATTR_META.forEach((a) => Core.allocateAttr(a.id, Math.floor(S.player.attrPoints / (D.ATTR_META.length * 10)) * 10));
  BEST.slice(0, REAL_N).forEach((id) => {
    Core.addChar(id);
    const maxStar = D.RARITY_MAXSTAR[D.charById[id].rarity] || 5;
    S.chars[id].lv = lv;
    S.chars[id].star = Math.min(maxStar, 3);
    S.chars[id].bloodlineLv = Math.min(D.BLOODLINE_MAX, Math.round(lv * 0.5));
    S.chars[id].skillLv = D.SKILL_MAX_BY_INDEX.map((m) => Math.min(m, Math.round(lv * 0.4)));
  });
  S.party = ['@player'].concat(BEST.slice(0, REAL_N));
  S.bag.eqCap = 900;
  ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 1e9));
  D.MOUNTS.forEach((m) => Core.buyMount(m.id));
  D.FABAO.forEach((f) => Core.buyFabao(f.id));
  for (let i = 0; i < 4; i++) Core.upgradeAuthority();
  for (let i = 0; i < 60; i++) Core.grantEquip(wid, rarity, null);
  Core.autoEquipBest();
  /* 按世界给强化：与 progression_audit 的 B 档同一口径（`en = round(lv/8)`，上限 20）。 */
  const en = Math.min(20, Math.round(lv / 8));
  if (en > 0) Object.values(S.equips).forEach((eq) => {
    const worn = Object.values(S.equipped).some((sl) => Object.values(sl).indexOf(eq.uid) >= 0);
    if (worn) eq.enhance = en;
  });
  return S;
}

/* 真跑一场守关 Boss，回收：有没有 Boss、有没有阶段帧、跑了几回合、谁赢 */
function bossFight(worldId) {
  let best = null;
  const MULS = [0.7, 1.0, 1.4, 1.9];
  for (let i = 0; i < MULS.length; i++) {
    teamAt(worldId, MULS[i]);
    const enemies = Dun.makeEnemies(worldId, 'normal', 12, 'boss');
    const hasBoss = enemies.some((e) => e.isBoss);
    /* 组队入口在战斗页上（`BattleUI.buildAllies`）—— 尺子里以前有两处写法，
       这里统一走**战斗页那一份**（它与真实开打用的是同一个函数）。 */
    const allies = (G.BattleUI && G.BattleUI.buildAllies) ? G.BattleUI.buildAllies({}, {}) : null;
    if (!hasBoss) return { hasBoss: false, phases: 0, rounds: 0, win: false, power: 0 };
    if (!allies || !allies.length) continue;
    const res = Battle.run({ allies, enemies, worldId, maxRounds: 60 });
    const phases = (res.frames || []).filter((f) => f && f.type === 'phase').length;
    /* R1.7：「机制是否真的发生」＝这一场里有没有**机制类帧**（状态/规则/护盾/召唤/濒死/阶段）。
       真跑出来才算，不看代码里写没写。 */
    const MECH_FRAMES = ['status', 'rule', 'shield', 'summon', 'nearDeath', 'phase', 'revive'];
    const mech = (res.frames || []).filter((f) => f && MECH_FRAMES.indexOf(f.type) >= 0).length;
    const rec = { hasBoss, phases, mech, rounds: res.rounds || 0, win: !!res.win, mul: MULS[i] };
    if (!best || rec.phases > best.phases) best = rec;
    if (rec.phases > 0 && rec.win) return rec;      // 既跑到了阶段、又打赢了 → 就是它
  }
  return best || { hasBoss: true, phases: 0, rounds: 0, win: false, mul: 0 };
}

/* ---------- 跑 36 个世界 ---------- */
const rows = [];
D.WORLDS.forEach((w) => {
  const m = BS.matrixRow(w.id);
  const f = bossFight(w.id);
  rows.push(Object.assign({}, m, { fight: f, engine: (Battle.MECHANICS || {})[w.id] || null }));
});

/* ---------- 输出矩阵（§三十一 的那五列） ---------- */
R.note('世界 · 剧情冲突 · 战斗机制 · Boss事件 · 战后变化 · 新线索');
rows.forEach((r) => {
  R.note('  ' + r.id + ' ' + r.name
    + ' · 冲突「' + (r.conflict || '—') + '」'
    + ' · 机制 ' + (r.mechanic || '—')
    + ' · Boss「' + (r.boss || '—') + '」' + (r.fight.phases ? '（' + r.fight.phases + ' 段）' : '')
    + ' · 变化「' + (r.after || '—') + '」'
    + ' · 线索「' + (r.clue || '—') + '」');
});

/* ---------- §三十二 的 11 项叙事完整度（逐项真判） ---------- */
/* 「Boss 是否具有身份」这一项**分段判**：
   六卷锚点（W06/12/18/24/30/36）必须有 `inner`（它为什么挡在这里）＋`say`（战前一句）；
   其余 30 个世界的守关 Boss 只要求**有名字**（§十六 的身份层级：只有六卷锚点是"角色级"Boss）。 */
const ANCHOR_BOSS = ['W06', 'W12', 'W18', 'W24', 'W30', 'W36'];
const ARC = (G.STORYDATA && G.STORYDATA.ARC) || {};
const EV = BS.EVENTS || [];
/* §二十六 的 **12 项**：每一条都读真数据（ARC / 引擎 / 真跑出来的帧），不读策划表。 */
const CHECK = [
  ['① 为什么进入这个世界', (r) => !!(ARC[r.id] && ARC[r.id].premise)],
  ['② 发现什么（异常）', (r) => !!(ARC[r.id] && ARC[r.id].anomaly)],
  ['③ 为什么必须战斗', (r) => !!(ARC[r.id] && ARC[r.id].conflict)],
  ['④ 敌人为什么阻挡玩家', (r) => !!(ARC[r.id] && ARC[r.id].enemyPurpose)],
  ['⑤ 世界机制是什么', (r) => !!(ARC[r.id] && ARC[r.id].battleMechanic) && !!r.mechanic],
  ['⑥ 机制是否**真的发生**（真跑出机制帧）', (r) => !!r.engine && r.fight.mech > 0],
  ['⑦ Boss 是谁', (r) => !!(ARC[r.id] && ARC[r.id].bossRole) && !!r.boss],
  ['⑧ Boss 为什么存在', (r) => (ANCHOR_BOSS.indexOf(r.id) >= 0 ? !!r.bossInner : !!(ARC[r.id] && ARC[r.id].enemyPurpose))],
  ['⑨ 战斗中发生了什么（≥3 个真·剧情节点）', (r) => {
    const ev = (ARC[r.id] || {}).battleEvents || [];
    return ev.length >= 3 && ev.every((e) => EV.indexOf(e.trigger) >= 0);
  }],
  ['⑩ 战斗结果改变了什么', (r) => !!(ARC[r.id] && ARC[r.id].environmentChange) || !!r.after],
  ['⑪ 得到了什么新线索', (r) => !!(ARC[r.id] && ARC[r.id].clue) || !!r.clue],
  ['⑫ 下一世界为什么成立', (r) => !!(ARC[r.id] && ARC[r.id].transition) && (!!r.next || r.id === 'W36')],
];
const zeros = [];
const score = {};
rows.forEach((r) => {
  const miss = [];
  CHECK.forEach(([name, fn]) => { let ok = false; try { ok = !!fn(r); } catch (e) { ok = false; } if (ok) score[name] = (score[name] || 0) + 1; else miss.push(name); });
  if (miss.length) zeros.push({ r, miss });
});
R.note('');
R.note('叙事完整度（11 项 · 36 世界逐项真判）：');
CHECK.forEach(([name]) => R.note('  ' + name + '：' + (score[name] || 0) + '/36'));
const bad = zeros.filter((z) => z.miss.length >= 2);
if (bad.length) {
  R.fail('有世界在 12 项里缺 2 项以上（＝"剧情让我关心一件事、战斗却完全无关"的候选）', {
    file: 'js/sc-story-data.js', expected: '每世界 ≥11/12',
    actual: bad.slice(0, 8).map((z) => z.r.id + '（缺 ' + z.miss.length + '：' + z.miss.slice(0, 3).join('/') + '…）').join(' ; '),
  });
} else {
  const partial = zeros.map((z) => z.r.id + '(' + z.miss.join('/') + ')');
  (partial.length ? R.warn : R.pass)('每个世界都在 12 项里达标 ≥11（只缺 1 项的列出来）', {
    file: 'js/sc-story-data.js', expected: '36 个世界都完整（12/12）',
    actual: partial.length ? partial.slice(0, 10).join(' ; ') : '36/36 全达标',
  });
}

/* ---------- 三条结构性断言（本轮的硬要求） ---------- */
{
  const noEcho = rows.filter((r) => !r.echoEvents.length).map((r) => r.id);
  (noEcho.length ? R.fail : R.pass)('每个世界都至少有一条**由战斗事件触发**的残响（§八）', {
    file: 'js/sc-story-battle.js', expected: '36/36', actual: noEcho.length ? noEcho.join(',') : '36/36（第一句一定挂在"打到了 Boss"）',
  });
  const noPhase = rows.filter((r) => r.fight.hasBoss && !r.fight.phases).map((r) => r.id);
  (noPhase.length ? R.warn : R.pass)('Boss 战真跑得出二阶段/狂暴帧（§七 的战斗叙事节点）', {
    file: 'js/battle.js', expected: '有 Boss 的世界都跑到阶段帧',
    actual: noPhase.length ? ('跑不到阶段帧：' + noPhase.join(',')) : '全部跑到（一队满配打完 60 回合内）',
  });
  const noMech = rows.filter((r) => !r.engine).map((r) => r.id);
  (noMech.length ? R.fail : R.pass)('世界机制在战斗引擎里**真的有实现**（不是文案包装，§九）', {
    file: 'js/battle.js', expected: '36/36 世界都在 MECHANICS 里有条目',
    actual: noMech.length ? noMech.join(',') : '36/36（世界描写 → 战斗机制 这条链是通的）',
  });
}

R.note('');
R.note('口径：剧情读 STORYDATA/BOSS，战斗**真跑**（Dungeon.makeEnemies + Battle.run），残响读 BattleStory.tableOf。');
/* ================= 《36 世界连续体验报告》（§三十六 要求的逐世界一行） =================
   五列口径（每列 PASS/WARN/FAIL，不看"功能有没有"，只看"这一环成不成立"）：
     · 进入是否自然     ：ARC.premise 存在，且上一世界 transition 被它接住（`story_continuity_audit` 同口径）
     · 战斗是否由剧情产生：ARC.conflict/enemyPurpose 存在（"为什么必须打"有答案）
     · 战斗是否讲故事   ：ARC 的 ≥3 个战斗节点全部挂在我支持的真事件上
     · 战后是否改变     ：ARC.environmentChange 存在（或锚点 Boss 有 after）
     · 是否推动下一世界 ：ARC.clue + transition 存在，且不是最后一个世界时有下一个世界 */
R.note('');
R.note('《36 世界连续体验报告》 世界 | 进入是否自然 | 战斗是否由剧情产生 | 战斗是否讲故事 | 战后是否改变 | 是否推动下一世界');
{
  const AR = (G.STORYDATA && G.STORYDATA.ARC) || {};
  const V = (ok, soft) => (ok ? 'PASS' : (soft ? 'WARN' : 'FAIL'));
  const key2 = (s) => { const o = {}; const t = String(s || ''); for (let i = 0; i < t.length - 1; i++) { const w = t.slice(i, i + 2); if (!/[\s，。、」「：；？！…·—]/.test(w)) o[w] = 1; } return Object.keys(o); };
  const share = (a, b) => { const A = key2(a); const B = key2(b); return A.some((k) => B.indexOf(k) >= 0); };
  rows.forEach((r, i) => {
    const a = AR[r.id] || {};
    const prev = i ? AR[rows[i - 1].id] : null;
    const enterOk = !prev || share(prev.transition, (a.premise || '') + (a.anomaly || ''));
    const col = [
      V(!!a.premise && enterOk, !!a.premise),
      V(!!a.conflict && !!a.enemyPurpose),
      V((a.battleEvents || []).length >= 3 && (a.battleEvents || []).every((e) => (BS.EVENTS || []).indexOf(e.trigger) >= 0)),
      V(!!a.environmentChange || !!r.after),
      V(!!a.clue && !!a.transition && (!!r.next || r.id === 'W36')),
    ];
    R.note('  ' + r.id + ' | ' + col.join(' | '));
  });
}
R.finish();
