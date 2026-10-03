/* 旧档迁移黑盒模拟（2026-10-03 终版任务书 §41 / §42 / §59）：node scripts/migration_fixture_audit.js
   ==============================================================================
   为什么要有这一把：**升级最不能伤的就是老玩家**。而"迁移对不对"这件事，
   光看代码看不出来 —— 老档的形状有一堆历史变体（没有 story 字段的 / 转过生把 worlds 清掉的 /
   只打到一半的 / 已经自己玩过一段剧情的），每一种都得真喂进去跑一遍。

   所以这里构造 8 个虚拟旧档，每个都走**完整黑盒**：

       写入 raw 存档  →  Core.load()（内部会 fillDefaults + migrate）
                     →  断言（旧进度一个字没丢、剧情按证据补、没多给任何东西）
                     →  Core.save()  →  Core.load()  →  **再断言一遍**

   最后那一步是 §59 的要求："迁移一次 A→B，再迁移一次必须 B→B"。

   断言一律对**玩家真正在乎的东西**：等级 / 星数 / 解锁 / 卷宗 / 有没有被要求重打 / 有没有多发东西。
   只读脚本：全程用内存里的一份夹具存档，不碰真存档、不写盘。
   ========================================================================== */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('migration_fixture_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { Core, D } = E;
const store = E.store;

/* 存档键名从工程里读出来（不写死 —— 换键名时这把尺子不会变成假绿） */
Core.newGame();
Core.save();
const SAVE_KEY = Object.keys(store).filter((k) => /^wxlh_save_v\d+$/.test(k))[0];
if (!SAVE_KEY) { R.blocked('找得到存档键名', { expected: 'wxlh_save*', actual: Object.keys(store).join(',') || '(空)' }); R.finish(); return; }

/* ---------- ① 快照：§42 点名要保的那些字段（迁移前后/存盘前后比对用） ---------- */
function snap(S) {
  const pick = {};
  try {
    pick.level = S.player.level;
    pick.bestWorldIdx = S.player.bestWorldIdx;
    pick.reincarnations = S.player.reincarnations;
    pick.worlds = S.worlds;
    pick.worldFirstClear = S.worldFirstClear;
    pick.cur = S.cur;
    pick.items = S.items;
    pick.equips = S.equips;
    pick.equipped = S.equipped;
    pick.chars = S.chars;
    pick.story = S.story;
    pick.corridor = S.corridor;
  } catch (e) {}
  return JSON.stringify(pick);
}
const stars = (S, wid, diff) => {
  const w = S.worlds && S.worlds[wid];
  return (w && w.stages && w.stages[diff || 'normal']) ? w.stages[diff || 'normal'].join('') : '(缺)';
};
const storyOf = (S, wid) => JSON.stringify((S.story.w || {})[wid] || null);
const bossOf = (S, wid) => !!(S.story.b || {})[wid];

/* ---------- ② 世界卡位：造一份"W01..Wn 全通"的世界表 ---------- */
function worldsThrough(n, opts) {
  opts = opts || {};
  const out = {};
  for (let i = 1; i <= n; i++) {
    const id = 'W' + String(i).padStart(2, '0');
    out[id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  }
  return out;
}
function firstClearThrough(n) {
  const out = {};
  for (let i = 1; i <= n; i++) out['W' + String(i).padStart(2, '0') + '_normal'] = true;
  return out;
}
/* 老档的公共底盘：只带"那个年代真的有"的字段（没有 story / 没有 3.0 之后的系统） */
function legacy(extra) {
  return Object.assign({
    v: 5, savedAt: 1700000000000,
    player: { level: 60, exp: 0, bestWorldIdx: 0, reincarnations: 0, attr: {}, skills: {} },
    worlds: {}, worldFirstClear: {}, chars: {}, equips: {}, equipped: {}, items: {}, cur: { points: 12345 },
    bag: { itemCap: 50, matCap: 50, eqCap: 50, itemExpands: 0, matExpands: 0, eqExpands: 0 },
    settings: { autoNext: true },
  }, extra || {});
}

/* ---------- ③ 跑一个夹具 ---------- */
function runFixture(fx) {
  store[SAVE_KEY] = JSON.stringify(fx);
  const ok = Core.load();
  const S = Core.S;
  return { ok: ok, S: S };
}
/* 存盘 → 再读一次（§59 幂等 / §42 存盘前后一致） */
function roundTrip(before) {
  const a = snap(Core.S);
  Core.save();
  const ok = Core.load();
  const b = snap(Core.S);
  return { ok: ok, same: a === b, a: a, b: b };
}
const t = (item, ok, expected, actual) => {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
};

/* ========================================================================== */

/* ---------- Fixture 01：最原始的档（只含 player / worlds，无 story） ---------- */
{
  const fx = legacy({ player: { level: 41, bestWorldIdx: 5, reincarnations: 0 },
    worlds: worldsThrough(6), worldFirstClear: firstClearThrough(6) });
  const r = runFixture(fx);
  t('F01 最原始档（无 story 字段）能读进来、不被当成空档', r.ok === true && r.S.player.level === 41,
    'load=true · level=41', 'load=' + r.ok + ' · level=' + (r.S && r.S.player.level));
  t('F01 已通关的 W01~W06 星数一个字没动', stars(r.S, 'W06') === '333333333333',
    'W06 normal = 333333333333', 'W06 normal = ' + stars(r.S, 'W06'));
  t('F01 W01~W06 的世界故事按证据补齐（四段全可读）',
    ['in', 'mid', 'pre', 'post'].every((p) => JSON.parse(storyOf(r.S, 'W06') || '{}')[p] === 1),
    'W06 story = in/mid/pre/post 全 1', 'W06 story = ' + storyOf(r.S, 'W06'));
  t('F01 W01~W06 的 Boss 卷宗自动解锁（不要求再打一遍）', bossOf(r.S, 'W06') === true,
    'story.b.W06 = 1', 'story.b.W06 = ' + bossOf(r.S, 'W06'));
  t('F01 没有凭据的 W07 不被凭空补上剧情', storyOf(r.S, 'W07') === 'null',
    'W07 无剧情记录', 'W07 = ' + storyOf(r.S, 'W07'));
  const rt = roundTrip();
  t('F01 存盘再读一次：结果逐字相同（迁移幂等）', rt.ok === true && rt.same === true,
    '第二次 load 后快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 02：早期档（旧职业体系 / 旧血统 / 旧装备名） ---------- */
{
  /* 装备的形状必须**和真档一样**（`base` 里全是要用的数）—— 少一个字段，
     `sanitizeSave()` 会当场把它当脏数据丢掉，那量到的就不是迁移对不对，而是夹具造错了。
     这里两件分别覆盖两条历史改名：`classSet`（旧"职业套装"）与 `血族`（备案改名前的血统名）。 */
  const eq0 = (uid, slot, name, extra) => Object.assign({
    uid: uid, slot: slot, rarity: 'SSR', name: name, enhance: 0,
    base: { atk: 120, hp: 800 }, affixes: [{ k: 'atkPct', v: 0.1 }],
  }, extra || {});
  const fx = legacy({
    player: { level: 30, bestWorldIdx: 2, reincarnations: 0, bloodline: '血族' },
    worlds: worldsThrough(3), worldFirstClear: firstClearThrough(3),
    equips: {
      e1: eq0('e1', 'weapon', '战士·磁轨枪', { classSet: 'warrior' }),
      e2: eq0('e2', 'armor', '血族·战甲', { bloodSet: '血族' }),
    },
    equipped: { '@player': { weapon: 'e1', armor: 'e2', head: null, hands: null, legs: null, accessory: null } },
    chars: { C001: { lv: 20, star: 2, shards: 5 } },
  });
  const r = runFixture(fx);
  t('F02 早期档能读进来', r.ok === true, 'load=true', 'load=' + r.ok);
  const e1 = r.S.equips && r.S.equips.e1, e2 = r.S.equips && r.S.equips.e2;
  t('F02 老装备一件都没丢（迁移不许顺手删东西）', !!(e1 && e2 && e1.slot === 'weapon' && e2.slot === 'armor'),
    'e1/e2 都还在', 'e1=' + !!(e1) + ' · e2=' + !!(e2));
  t('F02 旧「职业套装」换成血统套装，名字前缀跟着换，classSet 落干净',
    !!(e1 && e1.bloodSet === '狼人' && e1.classSet === undefined && e1.name === '狼人·磁轨枪'),
    'e1: bloodSet=狼人 · classSet 已删 · 名字=狼人·磁轨枪',
    e1 ? ('bloodSet=' + e1.bloodSet + ' · classSet=' + e1.classSet + ' · 名字=' + e1.name) : '(无)');
  t('F02 备案改名「血族 → 绯红」在装备与主角命格上都换过来了',
    !!(e2 && e2.bloodSet === '绯红' && e2.name === '绯红·战甲' && r.S.player.bloodline === '绯红'),
    'e2.bloodSet=绯红 · 名字=绯红·战甲 · player.bloodline=绯红',
    e2 ? ('bloodSet=' + e2.bloodSet + ' · 名字=' + e2.name + ' · 命格=' + r.S.player.bloodline) : '(无)');
  t('F02 老档的旧职业字段不影响世界进度',
    stars(r.S, 'W03') === '333333333333' && r.S.player.level === 30,
    'W03 仍全通 · level=30', stars(r.S, 'W03') + ' · level=' + r.S.player.level);
  const rt = roundTrip();
  t('F02 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 03：旧版转生（worlds 被清空，只有 bestWorldIdx 留痕） ---------- */
{
  const fx = legacy({ player: { level: 5, bestWorldIdx: 11, reincarnations: 2 }, worlds: {}, worldFirstClear: {} });
  const r = runFixture(fx);
  t('F03 被旧规则转生清空的档：世界**不会**被当成没打过（W12 剧情/Boss 补回来）',
    ['in', 'pre', 'mid', 'post'].every((p) => JSON.parse(storyOf(r.S, 'W12') || '{}')[p] === 1) && bossOf(r.S, 'W12') === true,
    'W12 四段 + Boss 卷宗都开', 'W12 = ' + storyOf(r.S, 'W12') + ' · boss=' + bossOf(r.S, 'W12'));
  t('F03 bestWorldIdx 只增不减：还是 11', r.S.player.bestWorldIdx === 11,
    'bestWorldIdx = 11', 'bestWorldIdx = ' + r.S.player.bestWorldIdx);
  t('F03 **不凭空造星**：W12 的星数没有被写出来（进度条仍从 0 起）',
    stars(r.S, 'W12') === '000000000000', 'W12 normal 全 0', 'W12 normal = ' + stars(r.S, 'W12'));
  t('F03 当年通关的世界被恢复成"能进"（W01~W12 解锁）',
    ['W01', 'W06', 'W12'].every((id) => !!(r.S.worlds[id] && r.S.worlds[id].unlocked)),
    'W01/W06/W12 都 unlocked', ['W01', 'W06', 'W12'].map((id) => id + '=' + !!(r.S.worlds[id] && r.S.worlds[id].unlocked)).join(' · '));
  t('F03 **不补发首通奖励**：世界首通记录标成"早就领过"（重打不再发）',
    r.S.worldFirstClear.W12_normal === true, 'worldFirstClear.W12_normal = true', '= ' + r.S.worldFirstClear.W12_normal);
  const rt = roundTrip();
  t('F03 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 04：W12 全通（世界改过名也不影响 —— 进度认 ID） ---------- */
{
  const fx = legacy({ player: { level: 80, bestWorldIdx: 11, reincarnations: 0 },
    worlds: worldsThrough(12), worldFirstClear: firstClearThrough(12) });
  const r = runFixture(fx);
  t('F04 W12 全通：星数一个字没动', stars(r.S, 'W12') === '333333333333',
    'W12 = 333333333333', 'W12 = ' + stars(r.S, 'W12'));
  t('F04 W12 世界故事 + Boss 卷宗都开（老玩家不用重打）', bossOf(r.S, 'W12') === true,
    'story.b.W12 = 1', 'boss = ' + bossOf(r.S, 'W12'));
  t('F04 W13 是转生门：0 次转生时**仍然锁着**（世界名换了也不许开）',
    !(r.S.worlds.W13 && r.S.worlds.W13.unlocked),
    'W13 锁', 'W13 unlocked = ' + !!(r.S.worlds.W13 && r.S.worlds.W13.unlocked));
  const rt = roundTrip();
  t('F04 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 05：W24 全通 + 3 转 ---------- */
{
  const fx = legacy({ player: { level: 100, bestWorldIdx: 23, reincarnations: 3 },
    worlds: worldsThrough(24), worldFirstClear: firstClearThrough(24) });
  const r = runFixture(fx);
  t('F05 W24 全通 + 3 转：W25 正确开放（转生门按次数）',
    !!(r.S.worlds.W25 && r.S.worlds.W25.unlocked), 'W25 unlocked', 'W25 unlocked = ' + !!(r.S.worlds.W25 && r.S.worlds.W25.unlocked));
  t('F05 W24 的历史进度与首通记录都在', stars(r.S, 'W24') === '333333333333' && r.S.worldFirstClear.W24_normal === true,
    'W24 全通 + 首通已领', stars(r.S, 'W24') + ' · fc=' + r.S.worldFirstClear.W24_normal);
  const rt = roundTrip();
  t('F05 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 06：已经存在**部分** S.story（不许被覆盖） ---------- */
{
  const fx = legacy({ player: { level: 70, bestWorldIdx: 11, reincarnations: 0 },
    worlds: worldsThrough(12), worldFirstClear: firstClearThrough(12),
    story: { w: { W01: { in: 1 } }, b: {}, c: {}, i: {}, choice: 0 } });
  const r = runFixture(fx);
  t('F06 老档里已经有的剧情状态不被覆盖（W01.in 还是 1）',
    JSON.parse(storyOf(r.S, 'W01') || '{}').in === 1,
    'W01.in = 1', 'W01 = ' + storyOf(r.S, 'W01'));
  t('F06 其余世界按证据**补**上（只增不减）', bossOf(r.S, 'W06') === true,
    'story.b.W06 = 1', 'boss W06 = ' + bossOf(r.S, 'W06'));
  const rt = roundTrip();
  t('F06 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 07：故事已经读到一半 ---------- */
{
  const fx = legacy({ player: { level: 70, bestWorldIdx: 11, reincarnations: 0 },
    worlds: worldsThrough(12), worldFirstClear: firstClearThrough(12),
    /* 玩家自己读到 W05 post、W06 停在 in —— 迁移不许把这些改回去 */
    story: { w: { W05: { in: 1, pre: 1, mid: 1, post: 1 }, W06: { in: 1 } }, b: { W05: 1 }, c: { C120: { s1: 1 } }, i: {}, choice: 0 } });
  const r = runFixture(fx);
  t('F07 读到一半的档：已读的那几段原样保留', JSON.parse(storyOf(r.S, 'W05') || '{}').post === 1,
    'W05.post = 1', 'W05 = ' + storyOf(r.S, 'W05'));
  t('F07 迁移只**往前补**：W06 的 pre/mid/post 被补上，in 不变',
    ['in', 'mid', 'pre', 'post'].every((p) => JSON.parse(storyOf(r.S, 'W06') || '{}')[p] === 1),
    'W06 四段全 1', 'W06 = ' + storyOf(r.S, 'W06'));
  t('F07 人物故事已读的那一则不被清掉', !!(r.S.story.c.C120 && r.S.story.c.C120.s1 === 1),
    'c.C120.s1 = 1', JSON.stringify(r.S.story.c.C120 || null));
  const rt = roundTrip();
  t('F07 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- Fixture 08：空新档（迁移绝不能污染它） ---------- */
{
  const fx = legacy({ player: { level: 1, bestWorldIdx: 0, reincarnations: 0 } });
  const r = runFixture(fx);
  t('F08 空档：**不许**被补出任何世界剧情（卷宗不该显示"打过"）',
    Object.keys(r.S.story.w || {}).length === 0 && Object.keys(r.S.story.b || {}).length === 0,
    'story.w / story.b 都空', 'w=' + Object.keys(r.S.story.w || {}).join(',') + ' · b=' + Object.keys(r.S.story.b || {}).join(','));
  t('F08 空档只开放 W01，W02 不能直接进',
    !!(r.S.worlds.W01 && r.S.worlds.W01.unlocked) && !(r.S.worlds.W02 && r.S.worlds.W02.unlocked),
    'W01 开 · W02 锁', 'W01=' + !!(r.S.worlds.W01 && r.S.worlds.W01.unlocked) + ' · W02=' + !!(r.S.worlds.W02 && r.S.worlds.W02.unlocked));
  const rt = roundTrip();
  t('F08 存盘再读一次：结果逐字相同', rt.same === true, '快照一致', rt.same ? '一致' : '**变了**');
}

/* ---------- 跨夹具：迁移标记只在迁移逻辑里写，不在 defaultState 里 ---------- */
{
  const fs = require('fs');
  const path = require('path');
  const core = fs.readFileSync(path.join(E.JS, 'core.js'), 'utf8');
  const defStart = core.indexOf('function defaultState()');
  const defEnd = core.indexOf('function fillDefaults', defStart);
  const def = core.slice(defStart, defEnd);
  const inDefault = /storyLegacyMigrated|storyLegacyChars|reincarnWorldRestored|gardenMigrated3/.test(def);
  t('迁移标记**不在** defaultState 里（否则 fillDefaults 会先补上、迁移永远不进）',
    inDefault === false, 'defaultState 里没有迁移标记',
    inDefault ? '**defaultState 里出现了迁移标记**' : '干净');
}

R.finish();
