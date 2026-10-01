/* 剧情内容审计（B 批 · 2026-10-01）：node scripts/audit_story.js
   ==============================================================================
   为什么需要它：剧情内容（`js/sc-story-data.js`）是**手写的一大张表**，
   最容易犯的错不是崩溃，而是"对不上"——
     · 少写一段（某个世界只有 in / pre，玩家点开战后是空白）；
     · 世界 ID 打错一个字母（`W7` / `w07`），只有走到那一步才会发现；
     · 场景映射指向一个不存在的母版（占位背景画不出来 → 一片黑）；
     · 人物故事挂在**不存在的角色 ID** 上（抽到那个人永远看不到故事）。
   这些都不会让游戏崩，但会在玩家那边变成"这里坏了"。所以全部钉成 FAIL。

   本尺子只读 `js/sc-story-data.js` 与 `js/data.js`（真源），**不跑游戏**（快、可复现）。
   退出码：有 FAIL → 1；全过 → 0（与另外六支同一套 `_report`）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeReport } = require('./_report');
const ROOT = path.resolve(__dirname, '..');
const R = makeReport('audit_story');
const PARTS = ['in', 'pre', 'mid', 'post'];
const BOSS_WORLDS = ['W06', 'W12', 'W18', 'W24', 'W30', 'W36'];

/* 一条断言：ok 决定 PASS / FAIL，expected / actual 一律带上（"没测到不许当通过"） */
function t(item, ok, expected, actual) {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
  return ok;
}

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
/* 内容文件只往 GameGlobal 上挂一个 STORYDATA，不需要画布/存档 —— 给它一个假全局即可 */
function loadStoryData() {
  const g = {};
  new Function('GameGlobal', read('js/sc-story-data.js'))(g);
  return g.STORYDATA;
}
function loadWorlds() {
  const out = {};
  const re = /\{ id: '(W\d\d)',[^\n]*?name: '([^']+)'/g;
  let m;
  const src = read('js/data.js');
  while ((m = re.exec(src))) out[m[1]] = m[2];
  return out;
}
function loadCharIds() {
  const out = new Set();
  const re = /\['(C\d{3})',/g;
  let m;
  const src = read('js/data.js');
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

const SD = loadStoryData();
const WORLD = loadWorlds();
const CHARIDS = loadCharIds();
const WIDS = Object.keys(WORLD);

/* ---------- ①②③ 内容表本身 ---------- */
const hasAll5 = !!(SD && SD.WORLDS && SD.SCENE && SD.BOSS && SD.CHARS && SD.ITEMS);
t('① 内容表能读出来（WORLDS / SCENE / BOSS / CHARS / ITEMS 五张子表都在）',
  hasAll5, '五张子表', SD ? Object.keys(SD).join(' ') : '（读不出来）');

const missPart = [];
WIDS.forEach((id) => {
  const w = SD.WORLDS[id];
  if (!w) { missPart.push(id + '(整节缺)'); return; }
  PARTS.forEach((p) => { if (!w[p] || !w[p].length) missPart.push(id + '.' + p); });
});
t('② 36 个世界**每个都有四段**（in / pre / mid / post 且非空）',
  missPart.length === 0, (WIDS.length * 4) + ' 段全部非空',
  missPart.length ? missPart.join(' ') : '36 × 4 段齐全');

const extra = Object.keys(SD.WORLDS).filter((id) => !WORLD[id]);
t('③ 内容表里没有**多出来的世界**（data.js 是唯一真源，不许自己造世界）',
  extra.length === 0, '每个 key 都在 data.js 的 WORLDS 里', extra.join(' ') || '没有多出来的');

/* ---------- ④ 场景映射（12 张母版） ---------- */
const missScene = WIDS.filter((id) => !SD.SCENE[id]);
const badScene = WIDS.filter((id) => SD.SCENE[id] && !SD.SCENE_INFO[SD.SCENE[id]]);
t('④ SCENE 映射：36 个世界全覆盖，且指向的母版都在 SCENE_INFO 里',
  missScene.length === 0 && badScene.length === 0, '全覆盖 · 母版都在表里',
  '缺映射 ' + (missScene.join(' ') || '无') + ' ｜ 坏映射 ' + (badScene.join(' ') || '无'));

/* ---------- ⑤⑥ 六卷 Boss 线 ---------- */
const missBoss = BOSS_WORLDS.filter((id) => !SD.BOSS[id]);
t('⑤ 六卷 Boss 线覆盖 W06/W12/W18/W24/W30/W36（一期只做这六个）',
  missBoss.length === 0, '六个卷末 Boss 都有剧情',
  missBoss.length ? ('缺 ' + missBoss.join(' ')) : Object.keys(SD.BOSS).join(' '));
const badBossKey = Object.keys(SD.BOSS).filter((id) => !WORLD[id]);
t('⑥ Boss 表的 key 都是真世界（不许挂在不存在的世界上）',
  badBossKey.length === 0, 'key ⊆ data.js 世界', badBossKey.join(' ') || '齐');

/* ---------- ⑦ 人物故事 ---------- */
const badChar = [];
Object.keys(SD.CHARS).forEach((id) => {
  if (!CHARIDS.has(id)) badChar.push(id + '(不在角色表)');
  [1, 2, 3].forEach((n) => {
    if (!SD.CHARS[id]['s' + n] || !SD.CHARS[id]['s' + n].length) badChar.push(id + '.s' + n);
  });
});
t('⑦ 人物故事挂在**真实存在**的角色 ID 上，且三则齐全',
  badChar.length === 0, Object.keys(SD.CHARS).length + ' 位 · 每人 s1/s2/s3 都有',
  badChar.join(' ') || 'ID 真实 · 三则齐全');

/* ---------- ⑧ 每一拍的形态 ---------- */
const badBeat = [];
WIDS.forEach((id) => {
  PARTS.forEach((p) => {
    (SD.WORLDS[id][p] || []).forEach((b, i) => {
      const at = id + '.' + p + '[' + i + ']';
      if (!b || ['n', 'd', 'o'].indexOf(b.k) < 0) badBeat.push(at + ' k=' + (b && b.k));
      else if (b.k === 'd' && !b.who) badBeat.push(at + ' 缺 who');
      else if (!b.s || !String(b.s).trim()) badBeat.push(at + ' 空文字');
    });
  });
});
t('⑧ 每一拍都是三种合法形态之一（n 旁白 / d 对白带 who / o 物件），且都有文字',
  badBeat.length === 0, 'k ∈ {n,d,o} · 对白有名字 · 文字非空',
  badBeat.slice(0, 8).join(' ') || '全部合法');

/* ---------- ⑨ 节奏红线 ---------- */
const over = [];
WIDS.forEach((id) => {
  PARTS.forEach((p) => {
    const n = (SD.WORLDS[id][p] || []).reduce((a, b) => a + String(b.s || '').length, 0);
    if (n > 220) over.push(id + '.' + p + '=' + n);
  });
});
R.note('超 220 字的段：' + (over.length ? over.join(' ') : '无'));
t('⑨ 单段阅读量在节奏红线内（普通世界 20~60 秒档：单段 ≤ 220 字）',
  over.length === 0, '每段 ≤ 220 字', over.slice(0, 8).join(' ') || '都在红线内');

/* ---------- ⑩⑪ 装备故事落点 ---------- */
/* ⑫ 六卷区间（章节转场的真源）：必须**首尾相接盖满 1~36**，不许有缝、不许重叠。
   它与 `docs/lore/chapters.md` 是同源两份 —— 这一条只保证"代码这一份自洽"，
   文档那一份靠人核对（改卷名要两边一起改，数据文件里写了这句话）。 */
const VOLS = SD.VOLS || [];
const volBad = [];
{
  let want = 1;
  VOLS.forEach((v) => {
    if (v.from !== want) volBad.push('第' + v.n + '卷起点 ' + v.from + '≠' + want);
    if (v.to < v.from) volBad.push('第' + v.n + '卷区间倒挂');
    want = v.to + 1;
  });
  if (want !== 37) volBad.push('盖到 ' + (want - 1) + ' 为止，没盖满 36');
  if (VOLS.length !== 6) volBad.push('卷数 ' + VOLS.length + '≠6');
}
t('⑫ 六卷区间首尾相接、盖满 1~36（章节转场靠它）',
  volBad.length === 0, '6 卷 · 1→36 无缝无重叠', volBad.join(' ') ||
  VOLS.map((v) => v.n + ':' + v.from + '-' + v.to).join(' '));

/* ---------- ⑩⑪ 装备故事落点（原编号顺延） ---------- */
const missSet = ['SET_W06', 'SET_W12', 'SET_W18', 'SET_W24', 'SET_W30', 'SET_W36'].filter((k) => !SD.ITEMS[k]);
t('⑩ 六卷锚点套装都有「一段」故事',
  missSet.length === 0, 'SET_W06/W12/W18/W24/W30/W36 各一段',
  missSet.length ? ('缺 ' + missSet.join(' ')) : '六段齐全');
const missLine = WIDS.filter((id) => !SD.ITEMS['SET_' + id] && !SD.SET_LINE[id]);
t('⑪ 其余世界套装都有一句话（不许有世界既没长文也没短句）',
  missLine.length === 0, '36 个世界都有装备故事落点', missLine.join(' ') || '齐');

/* ---------- ⑬ 四档宽度的版面验收（320 / 375 / 390 / 430） ----------
   量的是**页面自己的折行与行高**（`Story.measureBeat`）—— 不另写一套公式。
   判据：每一拍的文字块都得装进可视区（底部还要留 26px 给"轻点继续"）。
   ⚠️ 已知局限（照 layout_audit 的同一句声明）：`_env` 的 measureText 是**近似字宽模型**，
   它只能证明"不顶出画面"这种量级的问题，不能替代真机观感。 */
const PROFILES = [
  { name: '320×568', w: 320, h: 568, safeTop: 20, safeBottom: 548 },
  { name: '375×667', w: 375, h: 667, safeTop: 20, safeBottom: 647 },
  { name: '390×844', w: 390, h: 844, safeTop: 44, safeBottom: 810 },
  { name: '430×932', w: 430, h: 932, safeTop: 47, safeBottom: 898 },
];
let env = null;
try { env = require('./_env').boot({ width: 390, height: 844 }); } catch (e) { env = null; }
if (!env || !env.G || !env.G.Story || !env.G.Story.measureBeat) {
  /* 加载失败一律 BLOCKED —— **绝不当成 PASS**（与另外六支同一条纪律） */
  R.blocked('⑬ 四档宽度版面验收：剧情页加载失败',
    { expected: '能 boot 出 Story.measureBeat', actual: env ? '模块在但缺 measureBeat' : String(env) });
} else {
  const CV = env.CV, U = env.G.U, St = env.G.Story;
  PROFILES.forEach((p) => {
    CV.setup({ windowWidth: p.w, windowHeight: p.h, pixelRatio: 3,
      safeArea: { top: p.safeTop, bottom: p.safeBottom } });
    U.y = 0;
    const boxW = CV.W - U.pad() * 2;
    const room = St.viewH() - 26 * CV.SCALE;
    let bad = 0, worst = null;
    WIDS.forEach((id) => {
      PARTS.forEach((part) => {
        (SD.WORLDS[id][part] || []).forEach((b, i) => {
          const m = St.measureBeat(b, boxW);
          if (m.blockH > room) {
            bad++;
            if (!worst || m.blockH > worst.h) worst = { at: id + '.' + part + '[' + i + ']', h: Math.round(m.blockH) };
          }
        });
      });
    });
    R.note(p.name + '：可视 ' + Math.round(room) + 'px · 最长一拍 ' +
      Math.round(WIDS.reduce((a, id) => Math.max(a, ...PARTS.map((part) =>
        (SD.WORLDS[id][part] || []).reduce((x, b) => Math.max(x, St.measureBeat(b, boxW).blockH), 0))), 0)) + 'px');
    t('⑬ ' + p.name + '：每一拍都装得下（不顶出画面）', bad === 0,
      '每一拍 ≤ ' + Math.round(room) + 'px',
      bad ? (bad + ' 拍超界，最糟 ' + worst.at + '=' + worst.h + 'px') : '全部装得下');
  });
}

R.finish();
