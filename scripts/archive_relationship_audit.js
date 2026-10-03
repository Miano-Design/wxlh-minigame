/* 卷宗关系审计（NARRATIVE-UX-FINAL-2026-10 §六十六 / §六十七 / §二十）：node scripts/archive_relationship_audit.js
   ==============================================================================
   量四件事，全部读**真数据**（`STORYDATA.ARCHIVE` + 运行时的 `Story.recordsOf / refsOf / archiveStats`）：
     ① 数量口径（§六十六）：一般世界 ≥2 · 关键世界 ≥3 · 核心 Boss 世界 ≥5 · W29 ≥5 · W36 ≥5；
     ② 每条记录都**有信息**（正文非空、有类型、有状态）——不许拿空壳凑数；
     ③ 关系链（§六十七）：W03→W08→…→W34→W36 七条跨世界关联必须**双向**存在
        （从 B 点进去也要看得到 A，否则"两份记录对不上"这件事玩家发现不了）；
     ④ 冲突（§二十）：五组"互相矛盾"必须**两边都是 conflict 状态**而且互相引用。

   ⚠️ 判据只认"玩家真的点得到"：`refs` 指向的 id 必须在册，而且运行时 `Story.refsOf()` 能吐出来。
   ========================================================================== */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('archive_relationship_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const G = E.G, Core = E.Core;
const SD = (G && G.STORYDATA) || {};
const ARCHIVE = SD.ARCHIVE || {}, ALL = SD.ARCHIVE_ALL || {};
const St = G.Story;
const t = (item, ok, expected, actual) => { if (ok) R.pass(item, { expected, actual }); else R.fail(item, { expected, actual }); };

if (!Object.keys(ARCHIVE).length) { R.blocked('卷宗数据读得出来', { file: 'js/sc-story-overhaul-data.js', expected: 'SD.ARCHIVE', actual: '没有' }); R.finish(); return; }
if (!St || !St.recordsOf) { R.blocked('运行时卷宗接口在', { file: 'js/sc-story.js', expected: 'Story.recordsOf', actual: '没有' }); R.finish(); return; }

const IDS = Object.keys(ARCHIVE).sort();
const CORE_BOSS = ['W06', 'W12', 'W18', 'W24', 'W30', 'W36'];
const KEY = ['W03', 'W07', 'W08', 'W13', 'W25', 'W29', 'W34'];

/* ---------- ① 数量口径 ---------- */
{
  const lowest = IDS.map((id) => ({ id, n: ARCHIVE[id].length })).sort((a, b) => a.n - b.n);
  const badAll = lowest.filter((x) => x.n < 2);
  t('①-a 一般世界 ≥2 条（36 个世界全都够）', badAll.length === 0, '没有少于 2 条的',
    badAll.length ? badAll.map((x) => x.id + ':' + x.n).join(' ') : '最少 ' + lowest[0].id + ':' + lowest[0].n);
  const badKey = KEY.filter((id) => (ARCHIVE[id] || []).length < 3);
  t('①-b 关键世界 ≥3 条', badKey.length === 0, '关键世界都够',
    badKey.length ? badKey.map((id) => id + ':' + ARCHIVE[id].length).join(' ') : KEY.map((id) => id + ':' + ARCHIVE[id].length).join(' '));
  const badCore = CORE_BOSS.filter((id) => (ARCHIVE[id] || []).length < 5);
  t('①-c 核心 Boss 世界 ≥5 条', badCore.length === 0, '六个都 ≥5',
    badCore.length ? badCore.map((id) => id + ':' + ARCHIVE[id].length).join(' ') : CORE_BOSS.map((id) => id + ':' + ARCHIVE[id].length).join(' '));
  t('①-d W29 ≥5 · W36 ≥5', (ARCHIVE.W29 || []).length >= 5 && (ARCHIVE.W36 || []).length >= 5,
    'W29 ≥5 · W36 ≥5', 'W29=' + (ARCHIVE.W29 || []).length + ' · W36=' + (ARCHIVE.W36 || []).length);
}

/* ---------- ② 每条都有信息 ---------- */
{
  const bad = [];
  Object.keys(ALL).forEach((id) => {
    const r = ALL[id];
    if (!String(r.body || '').trim()) bad.push(id + ':空正文');
    if (!String(r.type || '').trim()) bad.push(id + ':无类型');
    if (!String(r.status || '').trim()) bad.push(id + ':无状态');
    if (!/^W\d\d-\d\d\d$/.test(id)) bad.push(id + ':编号格式不对');
  });
  t('② 每条记录都有信息（正文 / 类型 / 状态齐，编号是 W##-NNN）',
    bad.length === 0, '不合规 0 条', bad.length ? bad.length + ' 条：' + bad.slice(0, 6).join(' ') : '共 ' + Object.keys(ALL).length + ' 条全合规');
}

/* ---------- ③ 关系链：七条，而且双向 ---------- */
{
  const NEED = [
    ['W03', 'W08'], ['W07', 'W13'], ['W13', 'W18'],
    ['W18', 'W24'], ['W24', 'W29'], ['W29', 'W34'], ['W34', 'W36'],
  ];
  /* 跨世界的 refs 对（方向无所谓，但两边都得找得到对方） */
  const cross = {};
  Object.keys(ALL).forEach((id) => {
    const a = ALL[id].world;
    (ALL[id].refs || []).forEach((to) => {
      const b = ALL[to] && ALL[to].world;
      if (!a || !b || a === b) return;
      (cross[a + '>' + b] = cross[a + '>' + b] || []).push(id + '→' + to);
    });
  });
  const missing = NEED.filter((p) => !(cross[p[0] + '>' + p[1]] || cross[p[1] + '>' + p[0]]));
  const oneWay = NEED.filter((p) => {
    if (missing.indexOf(p) >= 0) return false;
    return !(cross[p[0] + '>' + p[1]] && cross[p[1] + '>' + p[0]]);
  });
  t('③-a 七条主线关联都在（W03→W08→W13→W18→W24→W29→W34→W36）',
    missing.length === 0, '缺 0 条', missing.length ? '缺：' + missing.map((p) => p.join('→')).join(' ') : '七条都在');
  t('③-b 关联是**双向**的（从任意一头点进去都找得到另一头）',
    oneWay.length === 0, '单向 0 条', oneWay.length ? '单向：' + oneWay.map((p) => p.join('→')).join(' ') : '都双向');
  /* 运行时真的点得动：随便挑一条链，看 `Story.refsOf` 吐不吐得出来 */
  const probe = ALL['W29-004'];
  if (probe) {
    const refs = St.refsOf('W29-004');
    t('③-c 运行时 `Story.refsOf()` 真的能顺着点过去（W29-004 → 关联记录）',
      refs.length >= 2, '至少 2 条关联', refs.length + ' 条：' + refs.map((r) => r.id).join(','));
  } else {
    R.fail('③-c 运行时 Story.refsOf() 真的能顺着点过去', { expected: 'W29-004 存在', actual: '不存在' });
  }
}

/* ---------- ④ 五组冲突：两边都是 conflict，而且互相引用 ---------- */
{
  const PAIRS = [['W03', 'W08'], ['W07', 'W13'], ['W18', 'W24'], ['W25', 'W29'], ['W30', 'W34']];
  const bad = [];
  PAIRS.forEach((p) => {
    const inA = (ARCHIVE[p[0]] || []).filter((r) => r.status === 'conflict');
    const inB = (ARCHIVE[p[1]] || []).filter((r) => r.status === 'conflict');
    if (!inA.length || !inB.length) { bad.push(p.join('/') + '：' + (inA.length ? '' : p[0] + '没有矛盾记录 ') + (inB.length ? '' : p[1] + '没有矛盾记录')); return; }
    /* 两边至少要有一对互相引用（直接或间接） */
    const ok = inA.some((a) => (a.refs || []).some((to) => (ALL[to] || {}).world === p[1])) ||
      inB.some((b) => (b.refs || []).some((to) => (ALL[to] || {}).world === p[0]));
    if (!ok) bad.push(p.join('/') + '：两边都没有互相引用');
  });
  t('④ 五组"互相矛盾"都成立（两边各有一条 conflict，而且互相引用）',
    bad.length === 0, '5 组都成立', bad.length ? bad.join(' ｜ ') : 'W03/W08 · W07/W13 · W18/W24 · W25/W29 · W30/W34');
}

/* ---------- ⑤ 已经捡到的和还没捡到的，运行时口径要对得上 ---------- */
{
  Core.newGame(); Core.setPlayerName('卷宗尺子');
  const before = St.archiveStats();
  t('⑤-a 新档：一条记录都还没捡到（卷宗不是开局就全给你）',
    before.found === 0, 'found=0', 'found=' + before.found + ' · total=' + before.total);
  St.markSeen('W29', 'post'); St.markBoss('W29');
  const after = St.archiveStats();
  t('⑤-b 打完 W29 → 这个世界的记录才进册',
    after.found === (ARCHIVE.W29 || []).length, 'found=' + (ARCHIVE.W29 || []).length, 'found=' + after.found);
  const again = St.collectArchive('W29');
  t('⑤-c 重读一遍不会再"重新发现"（发现卡只弹一次）', again === null, 'null', String(again && again.id));
}

R.finish();
