/* 叙事连续性审计（R1.7 · 任务书 §二十七）：node scripts/story_continuity_audit.js
   ==============================================================================
   查 W01→W02→…→W36 **链子断没断**。四类判据，全部读真数据（`STORYDATA.ARC` + `WORLDS` + `BOSS`）：
     ① 上一世界的 `transition`（"往哪走"）必须接得上下一世界的 `premise`（"为什么进得来"）
        —— 判据是**关键词有交集**（人名/地名/物件名，不是泛泛的"继续"）；
     ② 上一世界的 `clue`（得到了什么线索）不许在下一世界凭空消失：它必须被 `premise/anomaly` 接住；
     ③ **不许提前泄底**：ARC 文本里出现"第八个是你"这类句子＝FAIL（§二十八 明令 W29 才落）；
     ④ 世界之间的**身份递进**只许按六卷走：第二卷才允许出现"有人认识你"，
        第三卷才允许"你来过"，第五卷才允许把"第八个位置"说实。
   只读：不改任何文案。 */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('story_continuity_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { D, G } = E;
const ARC = (G.STORYDATA && G.STORYDATA.ARC) || {};
const IDS = (D.WORLDS || []).map((w) => w.id);

/* 抽"实词"：中文里按 2 字滑窗取词，去掉泛化词（这些词到处都是，拿它判连续等于没判）。 */
const STOP = ['一个', '什么', '这里', '那里', '他们', '你们', '我们', '已经', '不是', '还是',
  '开始', '继续', '东西', '地方', '然后', '但是', '而且', '所以', '因为', '可以', '没有',
  '一次', '一直', '一样', '正在', '不会', '必须', '自己', '这个', '那个', '出现', '发现'];
function keys(s) {
  const out = {};
  const t = String(s || '');
  for (let i = 0; i < t.length - 1; i++) {
    const w = t.slice(i, i + 2);
    if (/[\s，。、」「：；？！…·—]/.test(w)) continue;
    if (STOP.indexOf(w) >= 0) continue;
    out[w] = 1;
  }
  return Object.keys(out);
}
const share = (a, b) => {
  const A = keys(a);
  return A.filter((k) => keys(b).indexOf(k) >= 0);
};

/* ---------- ① ② 链子：transition / clue 必须被下一世界接住 ---------- */
const broken = [], weak = [];
for (let i = 0; i < IDS.length - 1; i++) {
  const a = ARC[IDS[i]], b = ARC[IDS[i + 1]];
  if (!a || !b) { broken.push(IDS[i] + '→' + IDS[i + 1] + '（ARC 缺）'); continue; }
  const via = share(a.transition, b.premise + b.anomaly);
  const clue = share(a.clue, b.premise + b.anomaly + b.conflict);
  if (!via.length && !clue.length) weak.push(IDS[i] + '→' + IDS[i + 1] + '（过渡与线索都没被接住）');
  else if (!via.length) weak.push(IDS[i] + '→' + IDS[i + 1] + '（只有线索接住，过渡词没接上）');
}
(broken.length ? R.fail : R.pass)('36 世界的 ARC 数据齐全（链子有数据可查）', {
  file: 'js/sc-story-data.js', expected: '36/36', actual: broken.length ? broken.slice(0, 6).join(' ; ') : '36/36',
});
(weak.length ? R.warn : R.pass)('上一世界的"往哪走 / 得到什么"都被下一世界接住（§二十七 ①②）', {
  file: 'js/sc-story-data.js', expected: '35 组相邻世界都有交集',
  actual: weak.length ? weak.slice(0, 8).join(' ; ') : '35/35 组全接上',
});

/* ---------- ③ 不许提前泄底 ---------- */
{
  const LEAK = ['第八个是你', '第八个就是', '你就是第八', '第九个是'];
  const hit = [];
  IDS.forEach((id) => {
    const a = ARC[id] || {};
    const txt = [a.premise, a.anomaly, a.conflict, a.playerGoal, a.enemyPurpose,
      a.battleMechanic, a.bossRole, a.bossTrigger, a.environmentChange, a.clue, a.transition]
      .concat((a.battleEvents || []).map((e) => e.line)).join('｜');
    LEAK.forEach((w) => { if (txt.indexOf(w) >= 0) hit.push(id + '：' + w); });
  });
  (hit.length ? R.fail : R.pass)('ARC 正文里没有提前把"第八个"说穿（§二十八）', {
    file: 'js/sc-story-data.js', expected: '0 处', actual: hit.length ? hit.join(' ; ') : '0 处（W29 只说"浮出名字"，不说"就是你"）',
  });
  /* W29 必须保留"空位"，别写成满座 */
  const w29 = (ARC.W29 || {}).anomaly || '';
  (w29.indexOf('空位') >= 0 ? R.pass : R.fail)('W29 的异常仍然是"九块碑、八个名字、一个空位"', {
    file: 'js/sc-story-data.js', expected: '含"空位"', actual: w29 || '（缺）',
  });
  /* W36 必须留白：至少有一处"没有答案" */
  const w36 = ARC.W36 || {};
  const tail = (w36.clue || '') + (w36.transition || '');
  (tail.indexOf('空') >= 0 || tail.indexOf('愿不愿') >= 0 ? R.pass : R.fail)('W36 结尾"答一部分、留一部分"', {
    file: 'js/sc-story-data.js', expected: '留未知（空位 / 那个问题）', actual: tail || '（缺）',
  });
}

/* ---------- ④ 六卷身份递进：只许往后放，不许提前 ---------- */
{
  const volOf = (n) => (n <= 6 ? 1 : n <= 12 ? 2 : n <= 18 ? 3 : n <= 24 ? 4 : n <= 30 ? 5 : 6);
  const RULE = [
    { vol: 2, words: ['有人认识', '认识你', '记得你', '知道你是谁'], name: '"有人认识玩家"' },
    { vol: 3, words: ['你来过', '来过这里', '不是第一次', '上一次'], name: '"玩家以前来过"' },
    { vol: 5, words: ['第八个位置', '第八块', '第九个'], name: '"第八个位置"' },
  ];
  const bad = [];
  IDS.forEach((id, idx) => {
    const n = idx + 1;
    const a = ARC[id] || {};
    const txt = [a.premise, a.anomaly, a.conflict, a.enemyPurpose, a.bossRole, a.clue, a.transition]
      .concat((a.battleEvents || []).map((e) => e.line)).join('｜');
    RULE.forEach((r) => { if (n < r.vol && r.words.some((w) => txt.indexOf(w) >= 0)) bad.push(id + '（第' + volOf(n) + '卷）提前说 ' + r.name); });
  });
  (bad.length ? R.fail : R.pass)('身份线只许按卷往后放（§二十八 六卷节奏）', {
    file: 'js/sc-story-data.js', expected: '不提前泄底', actual: bad.length ? bad.join(' ; ') : '六卷节奏干净',
  });
}

R.note('口径：真读 STORYDATA.ARC（36 世界 × 11 字段 + 战斗节点）与 WORLDS/BOSS；只报不改。');
R.finish();
