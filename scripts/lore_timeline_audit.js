/* 剧情信息揭示节奏（2026-10-01 · 父亲大人 §二十二）：
   node scripts/lore_timeline_audit.js
   ==============================================================================
   盯的不是"写得好不好"，而是**哪一卷说了哪一句** —— 提前泄底是最难改回来的一类错
   （玩家看过就回不去了）。判据直接来自 `docs/lore/mysteries.md` 的六层约束：

     卷一 W01~W06  玩家**不知道自己是谁**：不许出现 你来过 / 你上次 / 重载 / 保存 / 封存
     卷二 W07~W12  只建立"有东西认识你"：W07 不许点名"你上次"；"你来过"第一次落地在 W12
     卷三 W13~W18  第一次意识到"我确实醒来过"（W18 病历）
     卷四 W19~W24  开始怀疑灯阁在保存什么
     卷五 W25~W30  正式落地"我的名字在旧记录里"（W29 第八块碑 ← `{名}` 唯一正式揭示）
     卷六 W31~W36  最终问题（W36 第九块碑再次亮起、**无字**）

   三条硬断言：
     ① 卷一、卷二**不许**出现"你来过 / 你上次"这类整句；
     ② `{名}` 只准出现在 W18 / W25 / W29（A 批 `characters.md` 点名的三处）；
     ③ "第八个" 这个概念**只准**在允许的世界里出现，且 W29 之前**不许**把"第八个＝玩家"说死。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeReport } = require('./_report');
const ROOT = path.resolve(__dirname, '..');
const R = makeReport('lore_timeline_audit');
function t(item, ok, expected, actual) {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
  return ok;
}
function loadStoryData() {
  const g = {};
  new Function('GameGlobal', fs.readFileSync(path.join(ROOT, 'js/sc-story-data.js'), 'utf8'))(g);
  return g.STORYDATA;
}
const SD = loadStoryData();
const PARTS = ['in', 'pre', 'mid', 'post'];
const idx = (id) => parseInt(String(id).slice(1), 10);
const worldText = (id) => PARTS.map((p) => (SD.WORLDS[id][p] || []).map((b) => String(b.s || '')).join(' ')).join(' ');
const allWorlds = Object.keys(SD.WORLDS).sort();

/* ---------- ① 卷一 + 卷二（W01~W11）不许出现"你来过 / 你上次" ----------
   ⚠️ W12 **不算在内**：它是卷二卷末 Boss，按 §二十二 就是要把问题抛出来
      （"你来过这儿。上一次，你没走到这儿。"）—— 所以下面另有一条**正向**断言盯它必须抛。 */
{
  const BAN = ['你来过', '你上次', '上一次你', '你不是第一次', '你回来过'];
  const hits = [];
  allWorlds.filter((id) => idx(id) <= 11).forEach((id) => {
    const txt = worldText(id);
    BAN.forEach((w) => { if (txt.indexOf(w) >= 0) hits.push(id + '：' + w); });
  });
  t('① 卷一＋卷二前半（W01~W11）不出现"你来过 / 你上次"这类整句',
    hits.length === 0, '0 处',
    hits.length ? hits.join(' · ') : '干净');
  /* 正向：W12 必须**真的**把"你来过"抛出来（这是卷二卷末 cliffhanger，回收点不许空） */
  const w12 = worldText('W12');
  t('①-a W12 卷末 Boss 确实抛出"你来过"（卷二 cliffhanger 的回收点）',
    w12.indexOf('你来过') >= 0 || w12.indexOf('你不是第一次') >= 0,
    'W12 含"你来过 / 你不是第一次"', w12.indexOf('你来过') >= 0 ? '含「你来过」' : '不含');
}

/* ---------- ①-b 卷一不许出现"设定术语"（保存 / 封存 / 重载 / 残片）---------- */
{
  const TERM = ['保存', '封存', '重载', '残片', '灯阁在留', '被保存'];
  const hits = [];
  allWorlds.filter((id) => idx(id) <= 6).forEach((id) => {
    const txt = worldText(id);
    TERM.forEach((w) => { if (txt.indexOf(w) >= 0) hits.push(id + '：' + w); });
  });
  t('①-b 卷一（W01~W06）不出现"保存 / 封存 / 重载 / 残片"这些设定术语',
    hits.length === 0, '0 处', hits.length ? hits.join(' · ') : '干净');
}

/* ---------- ② `{名}` 只准在三处出现 ---------- */
{
  const ALLOW = ['W18', 'W25', 'W29'];
  const found = allWorlds.filter((id) => worldText(id).indexOf('{名}') >= 0);
  const bad = found.filter((id) => ALLOW.indexOf(id) < 0);
  const miss = ALLOW.filter((id) => found.indexOf(id) < 0);
  t('② 玩家署名 `{名}` 只出现在 W18 / W25 / W29（三处都是 A 批点名的落点）',
    bad.length === 0 && miss.length === 0,
    '正好 ' + ALLOW.join(' / '),
    bad.length ? ('越界：' + bad.join(' ')) : (miss.length ? ('缺：' + miss.join(' ')) : '三处齐 · ' + found.join(' ')));
}

/* ---------- ③ "第八个"这个概念只在允许的世界出现 ---------- */
{
  /* W11 只出现"八"的痕迹（册子页码）；W15 空页压痕；W21 第八场；W22 第八行；
     W27 出现"第八个位置"但**不许确认身份**；W29 正式揭示；W36 收尾。 */
  const ALLOW = ['W11', 'W15', 'W21', 'W22', 'W27', 'W29', 'W36'];
  const found = allWorlds.filter((id) => worldText(id).indexOf('第八') >= 0);
  const bad = found.filter((id) => ALLOW.indexOf(id) < 0);
  t('③ "第八个"这个概念只出现在允许的世界（W11/W15/W21/W22/W27/W29/W36）',
    bad.length === 0, '越界 0 处',
    bad.length ? ('越界：' + bad.join(' ')) : ('命中 ' + found.join(' ') + '（都在允许表里）'));
}

/* ---------- ③-b W29 之前，不许把"第八个＝玩家"说死 ---------- */
{
  const DEAD = ['第八个是你', '你就是第八个', '第八个我们知道是谁', '第八个的名字是你'];
  const hits = [];
  allWorlds.filter((id) => idx(id) < 29).forEach((id) => {
    const txt = worldText(id);
    DEAD.forEach((w) => { if (txt.indexOf(w) >= 0) hits.push(id + '：' + w); });
  });
  t('③-b W29 之前不许把"第八个＝玩家"说死（只许留位置、不许点名）',
    hits.length === 0, '0 处', hits.length ? hits.join(' · ') : '干净');
  /* 反向：W29 必须**真的**把 `{名}` 落在碑上（不然这条伏笔没回收） */
  t('③-c W29 第九碑庭确实是"第八块碑＝玩家署名"的正式落地',
    worldText('W29').indexOf('{名}') >= 0 && worldText('W29').indexOf('第八') >= 0,
    'W29 同时出现 {名} 与 第八', 'W29 符合');
}

/* ---------- ④ 第九个名字：第一期**必须留白** ---------- */
{
  const ANSWER = ['第九个是', '第九个名字是', '第九个叫', '第九个就是'];
  const hits = [];
  allWorlds.concat(Object.keys(SD.CHARS || {}), Object.keys(SD.ITEMS || {})).forEach((id) => {
    const txt = SD.WORLDS[id] ? worldText(id) : (SD.CHARS[id] ? JSON.stringify(SD.CHARS[id]) : String(SD.ITEMS[id] || ''));
    ANSWER.forEach((w) => { if (txt.indexOf(w) >= 0) hits.push(id + '：' + w); });
  });
  t('④ 第九个名字**仍然留白**（没有任何一处给出答案）',
    hits.length === 0, '0 处', hits.length ? hits.join(' · ') : '干净');
}

/* ---------- ⑤ 六卷结构与 36 世界对应关系仍然成立 ---------- */
{
  const VOLS = SD.VOLS || [];
  const okVols = VOLS.length === 6 && VOLS.every((v, i) => v.from === i * 6 + 1 && v.to === (i + 1) * 6);
  t('⑤ 六卷结构不变（每卷 6 张图 · 1~36 无缝）', okVols,
    '6 卷 × 6 图', VOLS.map((v) => v.n + ':' + v.from + '-' + v.to).join(' '));
  /* ⑤-b 六卷的卷首必须正好对上**四个转生门之后那一张**（数据层的 reincarn 标记）
          —— 卷界与转生门是同一件事，错一格整套节奏就散了。 */
  const dataSrc = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
  const gate = ['W13', 'W19', 'W25', 'W31'].filter((id) => new RegExp("id: '" + id + "',[^\\n]*?reincarn:").test(dataSrc));
  /* ⚠️ 卷一→卷二**没有**转生门（数据层只在 W13/W19/W25/W31 打了 `reincarn`），
     所以对得上的是"卷三~卷六的卷首"。W07 那条单列一句说明，免得被读成"漏了一个门"。 */
  const volStarts = VOLS.slice(2).map((v) => 'W' + String(v.from).padStart(2, '0'));
  t('⑤-b 卷三~卷六的卷首 = 四个转生门所在的那一张（W13/W19/W25/W31）',
    gate.length === 4 && volStarts.join(' ') === gate.join(' '),
    '卷首 ' + volStarts.join(' ') + ' = 转生门 ' + gate.join(' '),
    volStarts.join(' ') + ' vs ' + gate.join(' ') + '（W07 是卷一→卷二，本来就没有门）');
}

R.finish();
