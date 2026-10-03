/* 世界 ID 稳定性 + 旧档兼容（2026-10-03 终版任务书 §6 / §7）：node scripts/world_save_compat_audit.js
   ==============================================================================
   背景：36 个世界在这一轮全换过身份（W05 无归客轮 → 迷雾林海、W12 蚀环远征 → 镜像城市 …，
   见 `docs/lore/旧名迁移表.md`）。改名字本身没问题，**危险的是"改名字把进度改丢了"** ——
   只要有任何一处按"世界名"认进度，改完名老玩家那张图就变成新图（星数归零、锁回去、Boss 重打）。

   所以这把尺子钉两件事：
     ① **世界进度永远认 `W01~W36` 这个稳定 ID**（数据级 + 源码级两条）；
     ② 任务书 §7 的四个场景 A/B/C/D —— 每一种都拿真档喂进 `Core.load()` 再断言。

   只读脚本：内存里的夹具存档，不碰真存档、不写盘。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('world_save_compat_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { Core, D } = E;
const store = E.store;

Core.newGame(); Core.save();
const SAVE_KEY = Object.keys(store).filter((k) => /^wxlh_save_v\d+$/.test(k))[0];
if (!SAVE_KEY) { R.blocked('找得到存档键名', { expected: 'wxlh_save*', actual: Object.keys(store).join(',') || '(空)' }); R.finish(); return; }

const t = (item, ok, expected, actual) => {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
};
function load(fx) { store[SAVE_KEY] = JSON.stringify(fx); return Core.load(); }
const base = (extra) => Object.assign({
  v: 5, savedAt: 1700000000000,
  player: { level: 60, exp: 0, bestWorldIdx: 0, reincarnations: 0 },
  worlds: {}, worldFirstClear: {}, chars: {}, equips: {}, equipped: {}, items: {}, cur: {},
  bag: { itemCap: 50, matCap: 50, eqCap: 50, itemExpands: 0, matExpands: 0, eqExpands: 0 },
}, extra || {});
function worldsThrough(n) {
  const out = {};
  for (let i = 1; i <= n; i++) {
    const id = 'W' + String(i).padStart(2, '0');
    out[id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  }
  return out;
}
const starsOf = (S, wid, diff) => {
  const w = S.worlds && S.worlds[wid];
  return (w && w.stages && w.stages[diff || 'normal']) ? w.stages[diff || 'normal'].join('') : '(缺)';
};
const storyFull = (S, wid) => {
  const w = (S.story.w || {})[wid] || {};
  return ['in', 'pre', 'mid', 'post'].every((p) => w[p] === 1) && !!(S.story.b || {})[wid];
};

/* ==========================================================================
   〇、世界 ID 本身：连续、唯一、且"新名"与迁移表一致
   ========================================================================== */
{
  const ids = D.WORLDS.map((w) => w.id);
  const seq = ids.every((id, i) => id === 'W' + String(i + 1).padStart(2, '0'));
  t('〇 36 个世界的 ID 是 W01~W36（连续、稳定 —— 存档只认它）',
    ids.length === 36 && seq && new Set(ids).size === 36,
    '36 个 · W01..W36 连续且不重复', ids.length + ' 个 · ' + (seq ? '连续' : '**不连续**'));

  /* 迁移表（文档侧真源）里的"新名"必须与 data.js 逐字一致，否则文档与游戏说法就分叉了。 */
  /* ⚠️ 只取「## 一、世界名」那一张表 —— 下面还有「二、Boss 名」，
     一起正则会把 Boss 新名当成世界新名比（第一版就是这么假红的）。 */
  const mdAll = fs.readFileSync(path.join(E.ROOT, 'docs/lore/旧名迁移表.md'), 'utf8');
  const cut = mdAll.indexOf('## 二、');
  const md = cut > 0 ? mdAll.slice(0, cut) : mdAll;
  const rows = {};
  md.replace(/^\|\s*(W\d\d)\s*\|([^|]*)\|([^|]*)\|/gm, (m, id, oldN, newN) => { rows[id] = String(newN).replace(/\*\*/g, '').trim(); return m; });
  const bad = [];
  D.WORLDS.forEach((w) => {
    const n = rows[w.id];
    if (n && n.indexOf('（不变') >= 0) return;                       // 只是加了括注
    if (n && n !== w.name) bad.push(w.id + ' 文档=' + n + ' / 代码=' + w.name);
  });
  t('〇 旧名迁移表里的"新名"与 js/data.js 逐字一致（文档与游戏不许各说各话）',
    bad.length === 0, '每一行都对得上', bad.slice(0, 5).join(' ; ') || '全部一致');

  /* 源码级：玩家可见路径里不许出现旧世界名，更不许按世界名判进度。 */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
  const OLD = ['无归客轮', '轨道废土带', '蚀环远征', '灯阁王座', '寒冠王座', '哑雾小镇'];
  const jsFiles = fs.readdirSync(E.JS).filter((f) => /\.js$/.test(f));
  const hits = [];
  jsFiles.forEach((f) => {
    const src = strip(fs.readFileSync(path.join(E.JS, f), 'utf8'));
    OLD.forEach((n) => { if (src.indexOf(n) >= 0) hits.push(f + ':' + n); });
  });
  t('〇 去注释之后，js/ 里没有一处旧世界名（玩家可见路径只用新名）',
    hits.length === 0, '0 处', hits.slice(0, 5).join(' ; ') || '0 处');

  const byName = [];
  jsFiles.forEach((f) => {
    const src = strip(fs.readFileSync(path.join(E.JS, f), 'utf8'));
    if (/world\.name\s*===|\.name\s*==\s*'[^']*'/.test(src) && /world/i.test(src)) byName.push(f);
  });
  t('〇 没有任何地方按"世界名"判进度（只许认 W01~W36 这个 ID）',
    byName.length === 0, '0 个文件', byName.join(' ') || '0 个文件');
}

/* ==========================================================================
   测试 A：W12 全通 + 世界改名 → 升级后进度一个字不动
   ========================================================================== */
{
  load(base({ player: { level: 80, bestWorldIdx: 11, reincarnations: 0 },
    worlds: worldsThrough(12), worldFirstClear: { W12_normal: true } }));
  const S = Core.S;
  t('A W12（蚀环远征 → 镜像城市）升级后星数仍然是全通', starsOf(S, 'W12') === '333333333333',
    '333333333333', starsOf(S, 'W12'));
  t('A W12 仍然解锁（改名不影响解锁状态）', !!(S.worlds.W12 && S.worlds.W12.unlocked),
    'unlocked', 'unlocked=' + !!(S.worlds.W12 && S.worlds.W12.unlocked));
  t('A W12 世界剧情 + Boss 卷宗都开（老玩家不用重打）', storyFull(S, 'W12'),
    '四段 + Boss 都开', JSON.stringify(S.story.w.W12) + ' · boss=' + !!S.story.b.W12);
  t('A W13 走转生门：0 次转生时锁着（不是"改名就开"）',
    !(S.worlds.W13 && S.worlds.W13.unlocked),
    'W13 锁（需要 1 转）', 'W13 unlocked=' + !!(S.worlds.W13 && S.worlds.W13.unlocked));
  /* 转生一次之后必须立刻开 —— 转生门不能被"改名"这件事挡住 */
  S.player.reincarnations = 1;
  Core.refreshWorldUnlocks();
  t('A 转生 1 次之后 W13 立刻开放（转生门照常生效）',
    !!(S.worlds.W13 && S.worlds.W13.unlocked), 'W13 unlocked',
    'W13 unlocked=' + !!(S.worlds.W13 && S.worlds.W13.unlocked));
}

/* ==========================================================================
   测试 B：W12 只通前 6 关 → 不许凭空全通，剧情只给"看得到的那些"
   ========================================================================== */
{
  load(base({ player: { level: 40, bestWorldIdx: 0, reincarnations: 0 },
    worlds: { W12: { unlocked: true, stages: { normal: [3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0], hard: Array(12).fill(0), hell: Array(12).fill(0) } } } }));
  const S = Core.S;
  t('B 前 6 关进度一字不动', starsOf(S, 'W12') === '333333000000',
    '333333000000', starsOf(S, 'W12'));
  /* ⚠️ 关卡解锁的口径是"上一关通关"（`stageUnlocked`：`stages[diff][i-1] > 0`）——
     通到第 6 关 ⇒ 第 7 关是开的、**第 8 关起才锁**。第一版这里写成"第 7 关也该锁"，是尺子错了。 */
  t('B 后面没打的关卡仍然锁着（没有凭空全通）',
    Core.stageUnlocked('W12', 'normal', 6) === true && Core.stageUnlocked('W12', 'normal', 7) === false
      && Core.stageUnlocked('W12', 'normal', 11) === false,
    '第 7 关可进 · 第 8/12 关不可进',
    'stage6=' + Core.stageUnlocked('W12', 'normal', 6) + ' · stage7=' + Core.stageUnlocked('W12', 'normal', 7)
      + ' · stage11=' + Core.stageUnlocked('W12', 'normal', 11));
  const w = S.story.w.W12 || {};
  t('B 只有"看得到的那些"剧情被补上（in/mid 可读，pre/post 不给）',
    w.in === 1 && w.mid === 1 && w.pre === undefined && w.post === undefined,
    'in=1 · mid=1 · pre/post 无', JSON.stringify(w));
  t('B 没打完的世界**不给** Boss 卷宗（不许伪造"打过"）', !S.story.b.W12,
    'story.b.W12 空', 'boss=' + !!S.story.b.W12);
}

/* ==========================================================================
   测试 C：W12 全通 → 被旧规则转生清空 → 升级后按证据恢复
   ========================================================================== */
{
  load(base({ player: { level: 5, bestWorldIdx: 11, reincarnations: 2 }, worlds: {}, worldFirstClear: {} }));
  const S = Core.S;
  t('C bestWorldIdx 仍然正确（只增不减）', S.player.bestWorldIdx === 11,
    'bestWorldIdx = 11', 'bestWorldIdx = ' + S.player.bestWorldIdx);
  t('C 被清空的历史进度不算"不存在"：W01~W12 的剧情与 Boss 卷宗全都开',
    storyFull(S, 'W01') && storyFull(S, 'W06') && storyFull(S, 'W12'),
    'W01/W06/W12 都开', ['W01', 'W06', 'W12'].map((id) => id + '=' + storyFull(S, id)).join(' · '));
  t('C 世界可进入范围得到恢复（W01~W12 解锁）',
    ['W01', 'W06', 'W12'].every((id) => !!(S.worlds[id] && S.worlds[id].unlocked)),
    'W01/W06/W12 unlocked',
    ['W01', 'W06', 'W12'].map((id) => id + '=' + !!(S.worlds[id] && S.worlds[id].unlocked)).join(' · '));
  t('C **不凭空造星**：W12 的星数没有被写出来', starsOf(S, 'W12') === '000000000000',
    '000000000000', starsOf(S, 'W12'));
  /* 不补发首通：真的把第 12 关再"通"一次，看有没有再发一笔 */
  const before = JSON.stringify(S.cur);
  const res = Core.stageComplete('W12', 'normal', 11, 3);
  const got = res && res.firstClearReward;
  t('C **不补发首通奖励**：重打通关时不会再发一次（钱没变）',
    !got && JSON.stringify(Core.S.cur) === before,
    'firstClearReward 为空 · 货币不变', 'firstClearReward=' + JSON.stringify(got) + ' · 货币' + (JSON.stringify(Core.S.cur) === before ? '不变' : '**变了**'));
}

/* ==========================================================================
   测试 D：全新空档 → 迁移绝不能污染它
   ========================================================================== */
{
  load(base({ player: { level: 1, bestWorldIdx: 0, reincarnations: 0 } }));
  const S = Core.S;
  t('D 空档只开放 W01', !!(S.worlds.W01 && S.worlds.W01.unlocked),
    'W01 unlocked', 'W01=' + !!(S.worlds.W01 && S.worlds.W01.unlocked));
  t('D W02 不能直接进（不许被"历史进度补偿"顺手开出来）',
    Core.stageUnlocked('W02', 'normal', 0) === false && !(S.worlds.W02 && S.worlds.W02.unlocked),
    'W02 锁', 'W02 unlocked=' + !!(S.worlds.W02 && S.worlds.W02.unlocked));
  t('D 卷宗不显示"W01 已经打过"（story 一个都不许有）',
    Object.keys(S.story.w || {}).length === 0 && Object.keys(S.story.b || {}).length === 0,
    'story 全空', 'w=' + Object.keys(S.story.w || {}).join(',') + ' · b=' + Object.keys(S.story.b || {}).join(','));
  t('D 空档没有被迁移写上任何"历史凭据"',
    !S.reincarnWorldRestored && !S.reincarnCorridorRestored,
    '补偿标记都没落', 'worldRestored=' + !!S.reincarnWorldRestored + ' · corridorRestored=' + !!S.reincarnCorridorRestored);
}

R.finish();
