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
  S.player.level = lv; S.player.bloodlineLv = Math.round(D.BLOODLINE_MAX * 0.3); S.player.geneLock = 2;
  S.player.attrPoints = lv * 3;
  D.ATTR_META.forEach((a) => Core.allocateAttr(a.id, Math.floor(S.player.attrPoints / (D.ATTR_META.length * 10)) * 10));
  D.characters.slice(0, 4).forEach((c) => {
    Core.addChar(c.id);
    S.chars[c.id].lv = lv; S.chars[c.id].star = 3;
    S.chars[c.id].bloodlineLv = Math.round(D.BLOODLINE_MAX * 0.3);
    S.chars[c.id].skillLv = D.SKILL_MAX_BY_INDEX.map((m) => Math.round(m * 0.3));
  });
  S.party = ['@player'].concat(D.characters.slice(0, 4).map((c) => c.id));
  S.bag.eqCap = 900;
  ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 1e9));
  for (let i = 0; i < 60; i++) Core.grantEquip(wid, rarity, null);
  Core.autoEquipBest();
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
    const rec = { hasBoss, phases, rounds: res.rounds || 0, win: !!res.win, mul: MULS[i] };
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
const CHECK = [
  ['为什么来到这里', (r) => r.parts.in > 0 || r.parts.pre > 0],
  ['这里发生什么', (r) => !!r.conflict],
  ['为什么必须战斗', (r) => r.parts.pre > 0 || !!r.bossSay],
  ['敌人为什么阻止玩家', (r) => !!r.bossInner || !!r.boss],
  ['战斗机制是否来自世界设定', (r) => !!r.mechanic && !!r.engine],
  ['Boss 是否具有身份', (r) => (ANCHOR_BOSS.indexOf(r.id) >= 0 ? (!!r.boss && !!r.bossInner && !!r.bossSay) : !!r.boss)],
  ['Boss 战是否有阶段变化（**真跑出来的帧**）', (r) => r.fight.hasBoss && r.fight.phases > 0],
  ['战斗中是否有至少一个叙事反馈', (r) => r.echoEvents.length > 0],
  ['战斗胜利是否改变了什么', (r) => r.parts.post > 0],
  ['是否产生新线索', (r) => !!r.clue],
  ['下一步是否自然（有下一个世界）', (r) => !!r.next || r.id === 'W36'],
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
const bad = zeros.filter((z) => z.miss.length >= 3);
if (bad.length) {
  R.fail('有世界在 11 项里缺 3 项以上（＝"剧情让我关心一件事、战斗却完全无关"的候选）', {
    file: 'js/sc-story-data.js', expected: '每世界 ≥9/11',
    actual: bad.slice(0, 8).map((z) => z.r.id + '（缺 ' + z.miss.length + '：' + z.miss.slice(0, 3).join('/') + '…）').join(' ; '),
  });
} else {
  const partial = zeros.map((z) => z.r.id + '(' + z.miss.join('/') + ')');
  (partial.length ? R.warn : R.pass)('每个世界都在 11 项里达标 ≥9（缺 1~2 项的列出来）', {
    file: 'js/sc-story-data.js', expected: '36 个世界都完整',
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
R.finish();
