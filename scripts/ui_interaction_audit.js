/* 交互审计（NARRATIVE-UX-FINAL-2026-10 §五十 / §五十一 / §六十九）：node scripts/ui_interaction_audit.js
   ==============================================================================
   §六十九 要的不是"看一眼有没有按钮"，是**点下去真的会发生事情、而且只发生一次**。
   所以这一把把新老两条链**真渲染 + 真派发**一遍：

     ① 有 handler：渲染 卷宗页 / 卷宗二级页 / 首页 / 残域世界页，把当轮登记的每一个热区
        拿去 `CV.dispatch` 的同一套判据里查 —— **一个死键都不许有**；
     ② 有反馈：点一条卷宗记录 → 页面真的换成 `story_record`；再点一次**不会把页面压两层**
        （§四十五：一次用户意图只能产生一次结果）；
     ③ 不穿透：`story_find`（那本"发现卡"的全屏热区）必须**登记在 `story_next` 之后** ——
        同一层里后画的中，否则点"保存至卷宗"会顺手翻页；
     ④ 结算措辞（§三十二 / §三十三）：世界里的战斗必须是「记录完成 / 调查中止」＋ 败因一句 ＋
        「新增记录」一行，而且**只有调查场次**这么叫（深井 / 斗法台不许被叫成调查）。

   只读脚本：不写存档、不改文案，全部在假画布上跑真界面层。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('ui_interaction_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const G = E.G, Core = E.Core, CV = G.CV, St = G.Story;
const t = (item, ok, expected, actual) => { if (ok) R.pass(item, { expected, actual }); else R.fail(item, { expected, actual }); };
const src = (rel) => { try { return fs.readFileSync(path.join(E.ROOT, rel), 'utf8'); } catch (e) { return ''; } };

if (!CV || !St) { R.blocked('界面层与剧情层都加载了', { expected: 'CV + Story', actual: '缺' }); R.finish(); return; }

/* ================= 摘掉引导模态（**尺子一贯做法**，与 `sc-story.js` 里那条同源）=================
   ⚠️ 不摘掉的话，下面②那一串派发会被引导吃掉：`uiw.js` 包了一层 `CV.dispatch` ——
   引导期间"点高亮那一颗之外的东西"一律不执行（那是**产品要的行为**，防止玩家乱点，
   实测：新档首页点 `ov_archive` 只会被吞掉，页面不动）。
   可这把尺子量的是"**按钮本身有没有接对**"，不是"引导拦得对不对"（后者归 coach/guide 那几把）。
   所以这里先摘掉，量完再说。 */
G.coachFor = function () {};

/* 与 `cv.js:hitHasHandler` 同一条判据（精确 id 或 `前缀:*`） */
function hasHandler(id) {
  if (CV.onAct[id]) return true;
  const i = String(id).indexOf(':');
  return i > 0 && !!CV.onAct[String(id).slice(0, i + 1) + '*'];
}
const hitsOf = () => (CV.hits || []).map((h) => String(h.id));

/* 造一点"打过几场"的存档，让卷宗页有内容可渲染 */
Core.newGame(); Core.setPlayerName('交互尺子');
['W01', 'W03', 'W18', 'W29', 'W36'].forEach((w) => { St.markSeen(w, 'post'); St.markBoss(w); });

/* ---------- ① 渲染四个页面，逐个热区查处理器 ---------- */
const PAGES = [
  ['home', null],
  ['dungeon', null],
  ['story_archive', null],
  ['story_record', null],
];
{
  const dead = [];
  let seen = 0;
  /* ================= "死键"到底怎么算 —— 口径与框架**逐字对齐** =================
     项目里有两类热区，不能混为一谈：
       · **动作**：自己有处理器（`open_tasks` / `arcrec:*` / `w:W01` …）—— 点了必须做事；
       · **锚点**：故意**不挂**处理器，只作引导高亮与"点空白关掉引导"的兜底
         （`hero:0..3` 是主角卡四行的定位锚、`grid:daily` 是那排宫格的整块锚 ——
          真正可点的是它**底下**那些 `open_*`，见 `uiw.js:U.tiles` 与 `cv.js:scanHit` 的兜底注释）。
     所以判据是：**没有处理器的那一颗，必须至少压着一颗有处理器的热区**（有真按钮垫着）。
     一块既没处理器、底下又是空的整块区域，才是真的"看着能点、点了没反应"。
     ⚠️ 底栏 `tab:*` 的处理器在 `game.js` 里注册（`_env.boot()` 只加载 `js/`，
        不执行 `game.js` 的函数体）—— 所以这一条改成查"game.js 里确实登记了它"，
        而不是假装它在 `CV.onAct` 里（那是尺子环境的盲区，不是产品缺陷）。 */
  const gameSrc = src('game.js');
  const navHandled = (id) => /^tab:/.test(id) && gameSrc.indexOf("CV.on('tab:' + t.id") >= 0;
  const rects = () => (CV.hits || []).map((h) => ({ id: String(h.id), x: h.x, y: h.y, w: h.w, h: h.h }));
  const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  function scanPage(page) {
    const list = rects();
    const handled = list.filter((h) => hasHandler(h.id) || navHandled(h.id));
    list.forEach((h) => {
      if (!h.id) return;
      seen++;
      if (hasHandler(h.id) || navHandled(h.id)) return;
      /* 兜底锚点：必须压着一颗有处理器的热区 */
      const covered = handled.some((k) => overlaps(h, k));
      if (!covered) dead.push(page + ' → ' + h.id);
    });
  }
  PAGES.forEach((p) => {
    try { CV.reset(p[0], p[1] || {}); } catch (e) { R.fail('渲染 ' + p[0], { expected: '不抛错', actual: String(e && e.message) }); return; }
    scanPage(p[0]);
  });
  /* `story_record` 需要先有"正在看哪一条"才有内容；上面那次渲染是空壳，
     这里单独再渲染一遍带内容的（二级页 + 关联卷宗那一串热区才是这轮新增的重点）。 */
  try {
    CV.reset('story_archive');
    CV.dispatch('arcrec:W29-004');
    scanPage('story_record');
  } catch (e) { R.fail('渲染带内容的卷宗二级页', { expected: '不抛错', actual: String(e && e.message) }); }
  t('① 四个页面渲出来的热区没有"真死键"（没处理器的必须压着一颗真按钮）',
    dead.length === 0, '死键 0 个（共查 ' + seen + ' 个热区）',
    dead.length ? dead.slice(0, 8).join(' ｜ ') : '共查 ' + seen + ' 个热区，全部有处理器或垫着真按钮');
}

/* ---------- ② 点一条记录：有反馈，而且不会压两层 ---------- */
{
  CV.reset('story_archive');
  CV.dispatch('arctab:records');
  const before = CV.stack.length;
  CV.dispatch('arcrec:W18-005');
  const top1 = CV.top().name, depth1 = CV.stack.length;
  CV.dispatch('arcrec:W18-005');            // 同一颗再点一次
  const top2 = CV.top().name, depth2 = CV.stack.length;
  t('② 点卷宗记录：页面真的换成二级页（有反馈）',
    top1 === 'story_record' && depth1 === before + 1, 'story_record · 栈 +1',
    top1 + ' · 栈 ' + before + '→' + depth1);
  t('②-b 同一颗连点两次**不会压两层**（一次意图只产生一次结果）',
    depth2 === depth1 && top2 === 'story_record', '栈深不变',
    '栈 ' + depth1 + '→' + depth2 + ' · 顶 ' + top2);
}

/* ---------- ③ 不穿透：发现卡必须登记在 story_next 之后 ---------- */
{
  const st = src('js/sc-story.js');
  const iNext = st.indexOf("CV.hit('story_next'");
  const iFind = st.indexOf("CV.hit('story_find'");
  t('③ 发现卡的全屏热区登记在 `story_next` **之后**（后画的中 → 点保存不会顺手翻页）',
    iNext > 0 && iFind > iNext, 'story_find 在 story_next 之后',
    'story_next@' + iNext + ' · story_find@' + iFind);
  t('③-b 发现卡只在**战后那一拍读完**那一刻弹（不会提前把记录给玩家看）',
    /findCard && cur\.meta && cur\.meta\.part === 'post' && done\(\)/.test(st),
    "gate: part==='post' && done()", /findCard && cur\.meta[^\n]*/.test(st) ? (st.match(/findCard && cur\.meta[^\n]*/) || [''])[0].slice(0, 70) : '没找到');
}

/* ---------- ④ 结算措辞（§三十二 / §三十三） ---------- */
{
  const bt = src('js/sc-battle.js'), dun = src('js/sc-dungeon.js');
  t('④ 世界战斗的结算大标题是「记录完成 / 调查中止」（不是笼统的胜利/失败）',
    /p\.survey \? '记录完成' : '胜 利'/.test(bt) && /p\.survey \? '调查中止' : '战 败'/.test(bt),
    "survey ? '记录完成'/'调查中止'",
    '记录完成=' + /p\.survey \? '记录完成'/.test(bt) + ' · 调查中止=' + /p\.survey \? '调查中止'/.test(bt));
  t('④-b 只有调查场次这么叫（深井 / 斗法台 / 扫荡不传 survey，仍是胜利/失败）',
    /survey: true/.test(dun) && !/survey: true/.test(src('js/sc-last.js')),
    'sc-dungeon 传 survey · 深井那条链不传',
    'sc-dungeon=' + /survey: true/.test(dun) + ' · sc-last 里出现 survey=' + /survey: true/.test(src('js/sc-last.js')));
  t('④-c 失败必须有「为什么停 / 下一步怎么办」那一句（defeatHint 真的接到面板上）',
    /function defeatHint\(/.test(bt) && /const hint = \(!\(res && res\.win\)/.test(bt) && /hintLines\.forEach/.test(bt),
    'defeatHint → hintLines → 画出来',
    'defeatHint=' + /function defeatHint\(/.test(bt) + ' · 接到面板=' + /hintLines\.forEach/.test(bt));
  t('④-d 胜利结算有「新增记录」一行（这一场留下了什么）',
    /新增记录 ×/.test(bt) && /p\.records/.test(bt) && /records: records/.test(dun),
    'sc-battle 画 · sc-dungeon 传',
    '画=' + /新增记录 ×/.test(bt) + ' · 传=' + /records: records/.test(dun));
}

/* ---------- ⑤ 按钮三态（§五十）：至少"处理中/已保存"这条路不许只活在文档里 ---------- */
{
  const st = src('js/sc-story.js');
  /* 【保存至卷宗】点下去之后卡片必须消失（＝"完成"那一态真的会发生），
     而不是"点了没反应、卡片还杵在那儿"。 */
  CV.reset('story_archive');
  St.markSeen('W07', 'post'); St.markBoss('W07');
  const found = St.pendingFind();
  St.clearFind();
  const gone = St.pendingFind() === null;
  t('⑤ 【保存至卷宗】点完卡片真的会消失（完成态不是"点了没反应"）',
    gone && /CV\.on\('story_find', function \(\) \{ Story\.clearFind\(\); CV\.render\(\); \}\)/.test(st),
    'clearFind + render', 'clearFind=' + gone + ' · 处理器在=' + /CV\.on\('story_find'/.test(st));
  R.note('（W07 那次 pendingFind＝' + (found ? found.id : 'null') + '：收卷只在第一次，重跑不会重复弹）');
}

R.finish();
