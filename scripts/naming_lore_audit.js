/* 命名 / 世界观一致性审计（R1.4 数值轮 · 任务书 §十五 ~ §十六 / §四十二 ~ §四十四）：
     node scripts/naming_lore_audit.js
   ==============================================================================
   真扫**全仓的命名表**（世界 / Boss / 怪物 / 伙伴 / 道具 / 装备 / 法宝 / 坐骑 / 伴生体 / 套装），
   只报三类结构问题：
     · **重名** —— 同一个名字挂在两类东西上（除了明确允许的"套装＝世界名"）。
     · **身份层级乱** —— 执灯者 / 掌灯者 / 灯主 / 终焉·灯主 各是什么，不许串。
     · **现实宗教 / 神话专名** —— 直接引用现实信仰体系的名字（《残域》要自己的词）。
   ⚠️ 只报不改：改名是内容决策，本尺子只把清单摆出来（§四十四 明写"不要为了高级感全部改掉"）。 */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('naming_lore_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { D } = E;

/* ---------- ① 收集名字 ---------- */
const bucket = { 世界: [], Boss: [], 怪物: [], 精英: [], 伙伴: [], 技能: [], 铭刻阶: [], 道具: [], 法宝: [], 坐骑: [], 伴生体: [], 血清: [], 套装: [], 装备: [] };
(D.WORLDS || []).forEach((w) => {
  if (w.name) bucket.世界.push(w.name);
  if (w.boss) bucket.Boss.push(w.boss);
  [].concat(w.enemies || []).forEach((n) => n && bucket.怪物.push(n));
  if (w.elite) bucket.精英.push(w.elite);
});
(D.characters || []).forEach((c) => c.name && bucket.伙伴.push(c.name));
/* 技能名（§四十二 点名的"技能名"这一类）：每个伙伴 4 条（s1/s2/ult/passive） */
(D.characters || []).forEach((c) => {
  const sk = c.skills || {};
  ['s1', 's2', 'ult', 'passive'].forEach((k) => { if (sk[k] && sk[k].name) bucket.技能.push(sk[k].name); });
});
/* 铭刻 20 阶的阶名（原来只在 GENE_LOCKS 里，容易被漏掉 —— 它也是一个"名字"） */
(D.GENE_LOCKS || []).forEach((g) => g.name && bucket.铭刻阶.push(g.name));
Object.keys(D.ITEMS || {}).forEach((id) => { const it = D.ITEMS[id]; if (it && it.name) bucket.道具.push(it.name); });
(D.FABAO || []).forEach((f) => f.name && bucket.法宝.push(f.name));
(D.MOUNTS || []).forEach((m) => m.name && bucket.坐骑.push(m.name));
(D.BEASTS || []).forEach((b) => b.name && bucket.伴生体.push(b.name));
(D.SERUMS || []).forEach((s) => s.name && bucket.血清.push(s.name));
Object.keys(D.SETS || {}).forEach((k) => { const s = D.SETS[k]; if (s && s.name) bucket.套装.push(s.name); });
Object.keys(D.GOD_SETS || {}).forEach((k) => { const s = D.GOD_SETS[k]; if (s && s.name) bucket.套装.push(s.name); });
try { (D.codexEquipNameList ? D.codexEquipNameList() : []).forEach((n) => n && bucket.装备.push(String(n).replace(/^[^·]*·/, ''))); } catch (e) {}
Object.keys(D.BLOODLINE_EQUIP_NAMES || {}).forEach((k) => {
  const v = D.BLOODLINE_EQUIP_NAMES[k];
  if (typeof v === 'string') bucket.装备.push(v);
  else if (v && typeof v === 'object') Object.keys(v).forEach((kk) => { if (typeof v[kk] === 'string') bucket.装备.push(v[kk]); });
});

const counts = {};
Object.keys(bucket).forEach((cat) => bucket[cat].forEach((n) => {
  n = String(n).trim(); if (!n) return;
  counts[n] = counts[n] || [];
  if (counts[n].indexOf(cat) < 0) counts[n].push(cat);
}));
const cross = Object.keys(counts).filter((n) => counts[n].length > 1);
/* "套装＝世界名"是**明确定义**（世界套就该叫世界名）：逐条列出，不判死，只提醒。 */
const setWorldOverlap = cross.filter((n) => counts[n].indexOf('套装') >= 0 && counts[n].indexOf('世界') >= 0);
/* 两条**有据可查、不算 bug** 的同名（写在这儿防止下一个人又报一次）：
   · 「灯阁代行者」既是 W14 精英怪、又是可抽角色 C120 —— 那本来就是**同一个人**（代行），
     已在 `docs/lore/待裁决设定.md` #11 记档；
   · 血清的「XX精华」在道具表与血清表各有一份 —— 那是同一件东西的"物品条目 + 配方条目"。 */
const KNOWN_SAME = ['灯阁代行者'];
const isSameConcept = (n) => counts[n].length === 2 && counts[n].indexOf('道具') >= 0 && counts[n].indexOf('血清') >= 0;
/* 「XX神装」在套装表与装备表各一份 = 同一套东西的"套名 + 件名"，也是定义，不算重名。 */
const isSetPiece = (n) => counts[n].length === 2 && counts[n].indexOf('套装') >= 0 && counts[n].indexOf('装备') >= 0;
const realDup = cross.filter((n) => setWorldOverlap.indexOf(n) < 0 && KNOWN_SAME.indexOf(n) < 0
  && !isSameConcept(n) && !isSetPiece(n));
R.note('命名表规模：' + Object.keys(bucket).map((c) => c + ' ' + bucket[c].length).join(' · '));
{
  const allowed = setWorldOverlap.length ? '（"套装＝世界名"是定义，' + setWorldOverlap.length + ' 条：' + setWorldOverlap.slice(0, 5).join('/') + '…）' : '';
  (realDup.length ? R.warn : R.pass)('跨类重名检查' + allowed, {
    file: 'js/data.js', expected: '同一个名字不挂在两类东西上',
    actual: realDup.length ? realDup.slice(0, 10).map((n) => n + '（' + counts[n].join('/') + '）').join(' ; ') : '没有跨类重名',
  });
}

/* ---------- ② 身份层级（§十六） ---------- */
{
  const allNames = [];
  Object.keys(bucket).forEach((c) => bucket[c].forEach((n) => allNames.push({ n: String(n).trim(), cat: c })));
  const find = (kw) => allNames.filter((x) => x.n.indexOf(kw) >= 0);
  const zh = find('执灯者');
  const otherPerson = zh.filter((x) => x.cat !== '世界' && !/无名/.test(x.n));
  (otherPerson.length ? R.fail : R.pass)('「执灯者」只指玩家，不是任何具体角色的名字', {
    file: 'js/data.js', expected: '不挂在伙伴/Boss 上', actual: otherPerson.length ? otherPerson.map((x) => x.cat + '：' + x.n).join(' ; ') : '符合',
  });
  const bossNames = bucket.Boss.concat(bucket.怪物, bucket.精英);
  const dianzhu = bossNames.filter((n) => /灯主/.test(n));
  const finalBoss = (D.WORLDS.find((w) => w.id === 'W36') || {}).boss || '';
  /* ⚠️ 2026-10-03 修正：这一条的**期望值过期了**（它一直报 WARN，不是数据错，是判据没跟着剧情改）。
     旧 Boss「终焉·灯主」在剧情重构里**降为终章对白里的存在**（灯主只在 W36 战后说了一句），
     W36 的 Boss 换成「选择者」——见 `docs/story/视觉资产驱动剧情终稿.md` §终局那一节。
     新判据是两件事同时成立：
       · W36 Boss ＝ 选择者（真源 `js/data.js`）；
       · 灯主**不再**是任何一个 Boss / 精英怪（它只活在台词里）。
     做坏试验：把 W36 的 boss 改回「终焉·灯主」、或给任意精英起个带「灯主」的名字 → 当场红。 */
  const okFinal = finalBoss === '选择者' && dianzhu.length === 0;
  (okFinal ? R.pass : R.fail)('终局身份：W36 Boss ＝ 选择者，灯主只在对白里（不再是任何 Boss/精英）', {
    file: 'js/data.js', expected: 'W36 Boss = 选择者 · Boss/精英里没有灯主',
    actual: 'W36 Boss = ' + finalBoss + ' · 灯主系 Boss/精英 ' + (dianzhu.join(' / ') || '无'),
  });
  R.note('与「灯主」同族的名字（层级核对用）：' + (dianzhu.join(' · ') || '无'));
  const zhangdeng = find('掌灯者');
  R.note('「掌灯者」（灯阁执行者，允许存在）：' + (zhangdeng.map((x) => x.cat + '：' + x.n).join(' · ') || '暂无'));
}

/* ---------- ③ 现实宗教 / 神话专名（§四十二） ---------- */
{
  /* 只列**明确指向现实信仰体系**的词；不是一个黑名单就判死 —— 命中一律 WARN，交人判。 */
  const BAD = ['安卡', '十字', '圣母', '如来', '观音', '菩提', '阎罗', '阎王', '冥王', '奥丁', '宙斯', '洛神', '哪吒', '盘古', '女娲', '三清', '真主', '上帝', '宙'];
  const hit = [];
  Object.keys(bucket).forEach((c) => bucket[c].forEach((n) => {
    BAD.forEach((b) => { if (String(n).indexOf(b) >= 0) hit.push(c + '：' + n + '（含「' + b + '」）'); });
  }));
  (hit.length ? R.warn : R.pass)('命名里没有直接引用现实宗教 / 神话专名', {
    file: 'js/data.js', expected: '用《残域》自己的词', actual: hit.length ? hit.slice(0, 10).join(' ; ') : '干净',
  });
  /* 现实**文化 / 历史**专名（不是宗教）：单看每个词都"不违规"，但整张图堆在一起就是借现实文明。
     §四十二 明确要求"如果没有必要，改成《残域》自己的东西" —— 这里只报，不判死。 */
  const CULT = ['法老', '木乃伊', '圣甲虫', '祭司', '黄泉', '九幽', '冥界'];
  const chit = [];
  ['世界', 'Boss', '怪物', '精英', '道具', '装备', '法宝'].forEach((c) => bucket[c].forEach((n) => {
    CULT.forEach((b) => { if (String(n).indexOf(b) >= 0) chit.push(c + '：' + n); });
  }));
  R.note('现实文化专名（§四十二 待裁决，不是 FAIL）：' + (chit.join(' · ') || '无'));
}

/* ---------- ④ 称号式名字（§十五 / §四十四） ---------- */
{
  const TITLES = ['终焉', '无相', '洛神', '永恒', '虚空', '混沌', '天命'];
  const used = bucket.伙伴.filter((n) => TITLES.some((t) => n.indexOf(t) >= 0));
  R.note('「称号式」伙伴名（建议保留为 Boss / 阶段名，而不是人名）：' + (used.join(' · ') || '无'));
  const asBoss = bucket.Boss.concat(bucket.怪物).filter((n) => TITLES.some((t) => n.indexOf(t) >= 0));
  R.note('它们同时出现在敌方命名的：' + (asBoss.join(' · ') || '无'));
}

/* ---------- ⑤ 每个伙伴的"名字 / 血统 / 阵营"三件套齐全 ---------- */
{
  const miss = (D.characters || []).filter((c) => !c.name || !c.bloodline || !c.faction);
  (miss.length ? R.fail : R.pass)('120 个伙伴的名字 / 血统 / 阵营都齐', {
    file: 'js/data.js', expected: '0 缺项', actual: miss.length ? miss.slice(0, 6).map((c) => c.id).join(',') : '120 人全齐',
  });
}

R.note('口径：真读 D.WORLDS / D.characters / D.ITEMS / D.FABAO / D.MOUNTS / D.BEASTS / D.SETS / D.codexEquipNameList。');
R.note('本尺子只报清单，改名属内容决策（§四十四：不要为了高级感全部改掉）。');
R.finish();
