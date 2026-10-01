/* 剧情揭示节奏审计（R1.4 数值轮 · 任务书 §十九 / §二十）：node scripts/lore_reveal_audit.js
   ==============================================================================
   检查"提前揭底"：六卷各有**允许知道什么**，前面几卷不许把后面才该落地的话说出来。
   扫的是**真文本**（`G.STORYDATA.WORLDS` 的 in/pre/mid/post + 世界卡 desc + Boss 台词），
   不是扫关键词表。
   ⚠️ 本尺子**只报**：发现违规就 FAIL，交给剧情轮去改；**它自己不动一个字**（A 批圣经锁死）。 */
const { boot, lineOf } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('lore_reveal_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { D, G } = E;
const SD = (G.STORYDATA || {}).WORLDS || {};

/* 六卷（§四） */
const VOLS = [
  { n: 1, name: '灯下之地', from: 1, to: 6 },
  { n: 2, name: '雾中的人', from: 7, to: 12 },
  { n: 3, name: '第二次醒来', from: 13, to: 18 },
  { n: 4, name: '没有归途的文明', from: 19, to: 24 },
  { n: 5, name: '第八个名字', from: 25, to: 30 },
  { n: 6, name: '最后一盏灯', from: 31, to: 36 },
];
const volOf = (i) => VOLS.find((v) => i >= v.from && i <= v.to);

/* 每卷"不许出现"的词（§十九）。按卷给，**后面的卷可以自由用**。 */
const FORBID = {
  1: ['你来过', '上一次', '重载', '保存', '第八个是你', '第八个就是', '灯主', '第一任执灯者', '最早的执灯者'],
  2: ['重载', '第八个是你', '第八个就是', '最早的执灯者'],
  3: ['第八个是你', '第八个就是', '最早的执灯者'],
  4: ['第八个是你', '第八个就是'],
  5: [],
  6: [],
};

/* 收集一个世界的全部用户可见文本 */
function textsOf(wid) {
  const out = [];
  const w = D.WORLDS.find((x) => x.id === wid);
  if (w && w.desc) out.push({ where: '世界卡 desc', s: w.desc });
  const b = SD[wid];
  if (b) ['title', 'in', 'pre', 'mid', 'post'].forEach((k) => {
    if (k === 'title') { if (b.title) out.push({ where: '章节标题', s: b.title }); return; }
    (b[k] || []).forEach((beat, i) => { if (beat && beat.s) out.push({ where: wid + '.' + k + '[' + i + ']', s: String(beat.s) }); });
  });
  const boss = (G.STORYDATA || {}).BOSS && (G.STORYDATA.BOSS[wid] || G.STORYDATA.BOSS[wid.replace(/^W0?/, '')]);
  if (boss) JSON.stringify(boss, (k, v) => { if (typeof v === 'string' && v) out.push({ where: wid + '.boss.' + k, s: v }); return v; });
  return out;
}

const viol = [];
for (let i = 1; i <= 36; i++) {
  const wid = 'W' + String(i).padStart(2, '0');
  const v = volOf(i);
  const bad = FORBID[v.n] || [];
  if (!bad.length) continue;
  textsOf(wid).forEach((t) => {
    bad.forEach((term) => { if (t.s.indexOf(term) >= 0) viol.push('第' + v.n + '卷 ' + wid + ' ' + t.where + ' 出现「' + term + '」：' + t.s); });
  });
}
(viol.length ? R.fail : R.pass)('六卷揭示节奏：前面几卷没有提前揭底', {
  file: 'js/sc-story-data.js', expected: '各卷只出现该知道的信息',
  actual: viol.length ? viol.slice(0, 8).join(' ; ') : '干净（第1~6卷逐条对照通过）',
});

/* §二十：W18 怀疑 → W29 确认 → W36 终极问题，三句各司其职 */
{
  const w18 = (D.WORLDS.find((w) => w.id === 'W18') || {}).desc || '';
  const w29 = (D.WORLDS.find((w) => w.id === 'W29') || {}).desc || '';
  const w36 = (D.WORLDS.find((w) => w.id === 'W36') || {}).desc || '';
  const chain = [];
  /* W18 只许"怀疑"（出现"你的名字"这类异常，但不许给出答案） */
  const ok18 = /你/.test(w18) && !/第八个|就是你|一定是你/.test(w18);
  (ok18 ? R.pass : R.fail)('W18 世界卡停在"怀疑"、没有把答案说完', { file: 'js/data.js', line: lineOf('js/data.js', "id: 'W18'"), expected: '提到你、但不点破', actual: w18 });
  /* W29 世界卡不许再写"第八个是你"；答案留给 W29 剧情本体 */
  const ok29 = !/第八个是你|第八个就是/.test(w29);
  (ok29 ? R.pass : R.fail)('W29 世界卡不提前点破（答案只在剧情里落地）', { file: 'js/data.js', line: lineOf('js/data.js', "id: 'W29'"), expected: '留给剧情', actual: w29 });
  /* W36 必须仍然是"终极问题" */
  const ok36 = /为什么|资格/.test(w36);
  (ok36 ? R.pass : R.fail)('W36 世界卡是终极问题', { file: 'js/data.js', line: lineOf('js/data.js', "id: 'W36'"), expected: '提出最终问题', actual: w36 });
  chain.push('W18「' + w18 + '」→ W29「' + w29 + '」→ W36「' + w36 + '」');
  R.note('节奏链：' + chain.join(''));
}

/* `{名}` 令牌只许在 W18 / W25 / W29（项目既定口径） */
{
  const bad = [];
  for (let i = 1; i <= 36; i++) {
    const wid = 'W' + String(i).padStart(2, '0');
    if (['W18', 'W25', 'W29'].indexOf(wid) >= 0) continue;
    textsOf(wid).forEach((t) => { if (t.s.indexOf('{名}') >= 0) bad.push(wid + ' ' + t.where); });
  }
  (bad.length ? R.fail : R.pass)('`{名}` 令牌只出现在 W18 / W25 / W29', {
    file: 'js/sc-story-data.js', expected: '只这三处', actual: bad.length ? bad.slice(0, 6).join(' , ') : '符合',
  });
}

/* 每个世界都该有四段剧情（in/pre/mid/post），缺段会让剧情页空白 */
{
  const miss = [];
  for (let i = 1; i <= 36; i++) {
    const wid = 'W' + String(i).padStart(2, '0');
    const b = SD[wid];
    if (!b) { miss.push(wid + '(整段缺)'); continue; }
    ['in', 'pre', 'mid', 'post'].forEach((k) => { if (!b[k] || !b[k].length) miss.push(wid + '.' + k); });
  }
  (miss.length ? R.fail : R.pass)('36 个世界的四段剧情都齐（进图/战前/残响/战后）', {
    file: 'js/sc-story-data.js', expected: '36×4 段', actual: miss.length ? miss.slice(0, 8).join(' , ') : '36 个世界全齐',
  });
}

R.note('口径：真扫 STORYDATA.WORLDS 的 in/pre/mid/post + data.js 世界卡 desc；本尺子只报不改。');
R.finish();
