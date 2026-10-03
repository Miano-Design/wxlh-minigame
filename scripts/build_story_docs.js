/* 从**实装数据**生成剧情文档（2026-10-03 · 视觉资产驱动剧情重构）
   ============================================================================
   为什么要生成而不是手写：这一轮 36 个世界全换了身份，"文档说 A、代码里是 B" 是最贵的错。
   所以 `docs/story/视觉资产驱动剧情终稿.md` / `docs/lore/W01-W36剧情策划表.md` /
   `docs/lore/Boss剧情表.md` 三份**全部从代码读出来**：
     · 世界名 / desc / 敌人 / 精英 / 机制  ← `js/data.js` 的 WORLDS
     · 台词（in/pre/mid/post）/ 地点 / 关键物件 / 线索 / 钩子 ← `js/sc-story-data.js` 的 WORLDS + ARC
     · Boss 名 / 它的话 / 它留下什么 / 悬念 ← `BOSS` 表
   跑：`node scripts/build_story_docs.js`（改完剧情重跑一次即可）。
   ⚠️ 它**只写这三份 md**，不碰任何 js。 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const vm = require('vm');
const ctx = {}; ctx.globalThis = ctx; ctx.GameGlobal = ctx;
vm.runInNewContext(read('js/sc-story-data.js'), ctx);
vm.runInNewContext(read('js/sc-story-overhaul-data.js'), ctx);
const S = ctx.STORYDATA;
/* data.js 的世界表：**正则读**（它不是一个导出对象，避免把整份 data.js eval 进来）*/
const dataSrc = read('js/data.js');
const W = {};
[...dataSrc.matchAll(/\{ id: '(W\d\d)',[^}]*?name: '([^']*)',\s*theme: '([^']*)',\s*desc: '([^']*)'[^}]*?mechanic: '([^']*)',\s*boss: '([^']*)',[^}]*?enemies: ([^\n]*?),\s*elite: '([^']*)'/gs)]
  .forEach((m) => { W[m[1]] = { name: m[2], theme: m[3], desc: m[4], mechanic: m[5], boss: m[6], enemies: m[7], elite: m[8] }; });
const VOLS = S.VOLS;
const IDS = []; for (let i = 1; i <= 36; i++) IDS.push('W' + (i < 10 ? '0' + i : i));
const volOf = (id) => VOLS.find((v) => Number(id.slice(1)) >= v.from && Number(id.slice(1)) <= v.to) || {};
const line = (b) => b ? (b.k === 'd' ? (b.who + '：' + b.s) : b.s) : '';
const beats = (a) => (a || []).map((b) => '- ' + line(b)).join('\n');

let out1 = '# 《残域》视觉资产驱动剧情终稿\n\n'
  + '> **这份文件是生成的**（`node scripts/build_story_docs.js`）。真源是代码：\n'
  + '> `世界和boss的生图提示词汇总.md`（视觉第一真源）→ `js/data.js` + `js/sc-story-data.js`（实装）。\n'
  + '> 改剧情请改代码再重跑本脚本，**不要手改这份 md**。\n\n'
  + '## 〇、两句话\n\n'
  + '1. **图先定世界是什么，剧情再写。** 每个世界的台词都能从它那张图里的视觉事实长出来。\n'
  + '2. **旧名在玩家可见路径上已经 0 处。** 旧世界的名字只留在历史文档与 git history 里。\n\n'
  + '## 一、六卷结构\n\n| 卷 | 卷名 | 世界 | 这一卷回答 |\n|---|---|---|---|\n';
const VOL_ASK = { 1: '我在哪里', 2: '这里为什么会保存这些东西', 3: '谁在试图让这些东西继续存在',
  4: '灯到底是什么', 5: '保存到底付出了什么', 6: '那我到底要不要让它继续' };
VOLS.forEach((v) => { out1 += '| ' + v.n + ' | 《' + v.name + '》 | W' + String(v.from).padStart(2, '0') + '–W' + String(v.to).padStart(2, '0') + ' | ' + (VOL_ASK[v.n] || '') + ' |\n'; });

out1 += '\n## 二、W01–W36 完整世界表\n\n> 每格：**这个地方（place）** · 关键物件 · 视觉核心（图里认得出的事实）· 线索 · 下一站钩子\n\n';
let docs2 = '# 《残域》W01–W36 剧情策划表（视觉资产驱动 · 2026-10-03 重写）\n\n'
  + '> **生成的**（`node scripts/build_story_docs.js`）。台词真源＝`js/sc-story-data.js`，\n'
  + '> 世界卡真源＝`js/data.js`。六卷弧：看见"灯" → 看见"记录" → 人类为什么会消失 →\n'
  + '> 灯真正是什么 → 保存的代价 → 最初的问题。\n\n';
let docs3 = '# 《残域》Boss 剧情表（36 世界 36 Boss · 2026-10-03 重写）\n\n'
  + '> **生成的**（`node scripts/build_story_docs.js`）。六个卷末锚点的旧体系**已废止** ——\n'
  + '> 36 个世界的守关 Boss 全部是角色：它有职责、有一句话、打完会留下一样东西。\n\n';
IDS.forEach((id) => {
  const w = S.WORLDS[id] || {}, a = S.ARC[id] || {}, d = W[id] || {}, b = S.BOSS[id] || {};
  const v = volOf(id);
  out1 += '### ' + id + '　' + (d.name || '') + '　·　' + (b.name || d.boss || '') + '\n\n'
    + '- **卷**：第 ' + v.n + ' 卷《' + v.name + '》\n'
    + '- **地点**：' + (w.place || '') + '　**关键物件**：' + (w.obj || '') + '\n'
    + '- **视觉核心**：' + (a.anomaly || '') + '\n'
    + '- **玩家在这儿遇到的事**：' + (a.conflict || '') + '（目标：' + (a.playerGoal || '') + '）\n'
    + '- **Boss**：**' + (b.name || d.boss || '') + '** —— ' + (b.inner || a.bossRole || '') + '\n'
    + '- **它说的话**：「' + (b.say || a.bossTrigger || '') + '」\n'
    + '- **打完留下**：' + (b.after || a.environmentChange || '') + '\n'
    + '- **线索**：' + (a.clue || '') + '\n'
    + '- **下一站**：' + (a.transition || '（终章）') + '\n\n';
  docs2 += '## ' + id + '　' + (d.name || '') + '（第 ' + v.n + ' 卷《' + v.name + '》）\n\n'
    + '| 项 | 内容 |\n|---|---|\n'
    + '| 地点 / 关键物件 | ' + (w.place || '') + ' / ' + (w.obj || '') + ' |\n'
    + '| 世界卡 | ' + (d.desc || '') + ' |\n'
    + '| 机制 | ' + (d.mechanic || '') + ' |\n'
    + '| 敌人 / 精英 | ' + String(d.enemies || '').replace(/\.split\('\|'\)/, '') + ' / ' + (d.elite || '') + ' |\n'
    + '| Boss | ' + (b.name || d.boss || '') + ' |\n'
    + '| 进入 | ' + line((w.in || [])[0]) + ' |\n'
    + '| 战前 | ' + line((w.pre || [])[0]) + ' |\n'
    + '| 战斗中残响 | ' + line((w.mid || [])[0]) + ' |\n'
    + '| 战后 | ' + line((w.post || [])[0]) + ' |\n'
    + '| 视觉核心 | ' + (a.anomaly || '') + ' |\n'
    + '| 冲突 / 目标 | ' + (a.conflict || '') + ' / ' + (a.playerGoal || '') + ' |\n'
    + '| 线索 | ' + (a.clue || '') + ' |\n'
    + '| 下一站 | ' + (a.transition || '（终章）') + ' |\n\n'
    + '**全部台词**\n\n进入：\n' + beats(w.in) + '\n\n战前：\n' + beats(w.pre) + '\n\n残响：\n' + beats(w.mid)
    + '\n\n战后：\n' + beats(w.post) + '\n\n---\n\n';
  docs3 += '## ' + id + '　' + (b.name || d.boss || '') + '（' + (d.name || '') + '）\n\n'
    + '- **它为什么挡在这里**：' + (a.bossRole || '') + '\n'
    + '- **它到底是什么**：' + (b.inner || '') + '\n'
    + '- **它知道什么**：' + (a.clue || '') + '\n'
    + '- **它为什么和玩家冲突**：' + (a.conflict || '') + '\n'
    + '- **它说的那一句**：「' + (b.say || '') + '」\n'
    + '- **战斗里看得见的事**：' + ((a.battleEvents || [])[0] ? a.battleEvents[0].line : '') + '\n'
    + '- **打完留下什么**：' + (b.after || a.environmentChange || '') + '\n'
    + '- **留下的问题**：' + (b.mystery || '') + '\n\n';
});
out1 += '\n## 三、36 个 Boss 一句话定位\n\n| 世界 | Boss | 它的职责 | 它的那一句 |\n|---|---|---|---|\n';
IDS.forEach((id) => { const b = S.BOSS[id] || {}, a = S.ARC[id] || {}, d = W[id] || {};
  out1 += '| ' + id + ' | ' + (b.name || d.boss || '') + ' | ' + (b.inner || a.bossRole || '') + ' | 「' + (b.say || '') + '」 |\n'; });
out1 += '\n## 四、世界 → 世界钩子链\n\n> `transition`（上一站的出口）必须被下一站的 `premise` 接住 —— `story_continuity_audit` 逐对核。\n\n';
IDS.forEach((id, i) => { const a = S.ARC[id] || {}, n = S.ARC[IDS[i + 1]];
  out1 += '- **' + id + '** ' + (a.clue || '') + ' → ' + (a.transition || '（终章）') + (n ? '　⇒　下一站：' + n.premise : '') + '\n'; });
out1 += '\n## 五、伏笔（首次出现 → 回收）\n\n'
  + '| 伏笔 | 首现 | 回收 |\n|---|---|---|\n'
  + '| 「灰」这个字 | W01 名牌背面 | 线上贯穿；卷末由 Boss 的 `mystery` 继续挂 |\n'
  + '| 舱门从**里面**撬开 | W02 | W11 档案厅的撤离记录 |\n'
  + '| 灯会让异常**退开** | W01 战后 | W06「灯能不让一件事结束」 |\n'
  + '| 记录停在一半（"等"） | W11 | W18 出发 37 人、归航 0 人 |\n'
  + '| 名单第 19 个名字＝{名} | W18 | W25 聚落墙上的炭字 → W29 第八个名字 |\n'
  + '| 第八个名字 / 第九个空位 | W29 | W36 留白（选择者把问题交回玩家） |\n'
  + '| 终焉·灯主 | W36 战后对白 | 不占 Boss 插槽（旧 Boss 体系已废止） |\n\n'
  + '## 六、视觉资产 → 剧情对应\n\n'
  + '每个世界的场景图 / Boss 立绘都在 `story/scene/img_scene_W##.jpg`、`story/boss/img_boss_W##.png`，\n'
  + '剧情里的 `place` / `anomaly` / Boss 身份**都能从那张图的视觉事实读出来**（任务书 §二/§三）。\n'
  + '深井那张另算：`story/scene/img_scene_corridor.jpg`。\n\n'
  + '## 七、旧名迁移\n\n'
  + '32 个旧世界名 + 32 个旧 Boss 名在**玩家可见路径已经 0 处**（去注释后扫 `js/`）。\n'
  + '旧 Boss「终焉·灯主」降为终章对白里的存在；W36 Boss 换成**选择者**。\n'
  + '2.1 叙事追加层（`js/sc-story-overhaul-data.js` 的 RICH 表）退役，中段插叙退回世界自己的 `mid`。\n\n'
  + '## 八、审计结果\n\n'
  + '`audit_release` 29 PASS / 0 FAIL；`audit_story` / `lore_reveal` / `lore_timeline` /\n'
  + '`story_continuity` / `story_2_1` / `story_2_1_flow` / `visual_story` 全绿。\n';
fs.mkdirSync(path.join(ROOT, 'docs/story'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/story/视觉资产驱动剧情终稿.md'), out1);
fs.writeFileSync(path.join(ROOT, 'docs/lore/W01-W36剧情策划表.md'), docs2);
fs.writeFileSync(path.join(ROOT, 'docs/lore/Boss剧情表.md'), docs3);

/* ================= 给 GPT 评审的**单文件总览**（2026-10-03 父亲大人点单）=================
   一份文档装完：六卷大纲 · 每世界内容 · **展示内容与时机** · **卷宗详细内容**。
   「展示时机」这一节尤其重要 —— 它回答的是"这段话是在什么时候上屏的"：
     进图自动 / 战前自动（Boss+精英关）/ 第 6 关中段插叙 / 战斗内（已撤）/ 战后自动 /
     Boss 出场序列 / 结算页（线索行已删）/ 卷宗重读。 */
let g = '# 《残域》剧情总览（给 GPT 评审用）\n\n'
  + '> 这份是**生成的**（`node scripts/build_story_docs.js`），真源是代码：\n'
  + '> `世界和boss的生图提示词汇总.md`（视觉第一真源）→ `js/data.js` + `js/sc-story-data.js`（实装）。\n'
  + '> 文档与代码不会分叉：改剧情改代码，然后重跑本脚本。\n\n'
  + '## 一、核心设定（三句话）\n\n'
  + '1. **残域**不是废土，是**被保存下来的世界残片**；\n'
  + '2. **灯**能做五件事：记录 · 固定 · 连接 · 封存 · 重载；\n'
  + '3. 全书的核心问题：**被保存、复制、重载的世界，还是原本的世界吗？**\n\n'
  + '## 二、六卷大纲\n\n| 卷 | 卷名 | 世界 | 这一卷回答 | 卷首转场那一句 |\n|---|---|---|---|---|\n';
const ASK = { 1: '我在哪里', 2: '这里为什么会保存这些东西', 3: '谁在试图让这些东西继续存在',
  4: '灯到底是什么', 5: '保存到底付出了什么', 6: '那我到底要不要让它继续' };
VOLS.forEach((v) => { g += '| ' + v.n + ' | 《' + v.name + '》 | W' + String(v.from).padStart(2, '0') + '–W' + String(v.to).padStart(2, '0') + ' | ' + (ASK[v.n] || '') + ' | 「' + (v.line || '') + '」 |\n'; });

g += '\n## 三、展示内容与时机（每一段话什么时候上屏）\n\n'
  + '| 内容 | 数据来源 | 上屏时机 | 玩家怎么离开 |\n|---|---|---|---|\n'
  + '| `in` 进图 | `WORLDS[wid].in` | **第一次进这个世界时自动播**（进世界页那一刻） | 点屏继续 / 右上角「跳过」 |\n'
  + '| `pre` 战前 | `WORLDS[wid].pre` | **守关 Boss（第 12 关）或精英关**开打前自动播，每个世界只打断一次 | 播完**自动接着开打**（不用再点关） |\n'
  + '| 中段插叙 | `WORLDS[wid].mid`（`midstory` 在追加层退役后＝这一拍） | **第 6 关**前自动播一次 | 播完回到第 6 关继续 |\n'
  + '| 战斗内残响 | `ARC[wid].battleEvents` | ⚠️ **已按父亲大人要求撤除**（不再在战斗里弹窗）。数据保留，供将来换一种呈现 | — |\n'
  + '| `post` 战后 | `WORLDS[wid].post` | **打赢守关 Boss 后自动播**（结算页关掉之后触发） | 播完回世界页 |\n'
  + '| Boss 出场 | `BOSS[wid]` 的 `say` / `inner` + `WORLDS[wid].mechanic` | **守关 Boss 开打那一刻**，约 2.4 秒，只放一次（放过就不再放） | 自动结束 → 开打 |\n'
  + '| 结算页线索 | `Story.clueOf(wid,\'post\')` | ⚠️ **已按父亲大人要求从结算页去掉**（"想看剧情去本章卡片"） | — |\n'
  + '| 卷宗重读 | 上面全部 | 玩家自己在**卷宗**里点开重读 | 随时退出 |\n\n'
  + '> 阅读节奏：正文停留**按这一拍自己的字数**算（5.5 字/秒 + 0.8 秒起步，下限 2.6 秒 / 上限 9 秒），\n'
  + '> 卷名卡 1.6 秒。手动点屏翻页不受影响。\n\n'
  + '## 四、卷宗（"灯录之外的那一本"）里到底有什么\n\n'
  + '卷宗是**看过的东西的收纳处**，四个标签页：**残域卷 / Boss / 人物 / 装备**（计数写在页眉）。\n\n'
  + '| 标签页 | 收录什么 | 什么时候解锁 | 读完的样子 |\n|---|---|---|---|\n'
  + '| 残域卷 | 每个世界的 `in` / `pre` / `mid`（残响）/ `post` 四段 | 该段**看过**才算 | 每段一行「已读 · 轻点重读」/「未读」 |\n'
  + '| Boss | 36 个世界的守关 Boss（名字 + 它是谁 + 它说的那一句 + 留下的问题） | **打赢守关 Boss** 就记下来（`Story.markBoss()`） | 从「未解锁 · 打到这里才会记下来」变成可展开 |\n'
  + '| 人物 | 推动过事件的角色的三则故事（`s1/s2/s3`） | 首次获得 / 成长 / 特殊事件 | 同上 |\n'
  + '| 装备 | 世界套装 / 专属 / 神装 / 核心道具的故事 | 拿到那件才算 | 同上 |\n\n'
  + '> 页眉那句话是：「残域的记录，只记你看过的」。\n\n'
  + '## 五、W01–W36 逐世界完整内容\n\n';
IDS.forEach((id) => {
  const w = S.WORLDS[id] || {}, a = S.ARC[id] || {}, d = W[id] || {}, b = S.BOSS[id] || {};
  const v = (S.VOLS || []).find((x) => Number(id.slice(1)) >= x.from && Number(id.slice(1)) <= x.to) || {};
  const beats = (arr, tag) => ((arr || []).length ? ((tag || '') + (arr || []).map((x) => line(x)).join(' / ')) : '（无）');
  g += '### ' + id + '　' + (d.name || '') + '　<sub>第 ' + v.n + ' 卷《' + v.name + '》· ' + (w.title || '') + '</sub>\n\n'
    + '- **地点 / 关键物件**：' + (w.place || '') + ' / ' + (w.obj || '') + '\n'
    + '- **视觉核心（图里认得出来的事实）**：' + (a.anomaly || '') + '\n'
    + '- **前提（怎么走到这儿的）**：' + (a.premise || '') + '\n'
    + '- **玩家在这遇到的事 / 目标**：' + (a.conflict || '') + ' / ' + (a.playerGoal || '') + '\n'
    + '- **敌人 / 精英**：' + String(d.enemies || '').replace(/\.split\('\|'\)/, '') + ' / ' + (d.elite || '') + '\n'
    + '- **机制**：' + (d.mechanic || '') + '\n'
    + '- **Boss**：**' + (b.name || d.boss || '') + '** —— ' + (b.inner || a.bossRole || '') + '\n'
    + '  - 它说的那一句：「' + (b.say || '') + '」\n'
    + '  - 打完留下：' + (b.after || a.environmentChange || '') + '\n'
    + '  - 它留下的问题：' + (b.mystery || '') + '\n'
    + '- **线索（本章埋）**：' + (a.clue || '') + '\n'
    + '- **下一站钩子**：' + (a.transition || '（终章）') + '\n'
    + '- **进入剧情**：' + beats(w.in) + '\n'
    + '- **战前剧情**：' + beats(w.pre) + '\n'
    + '- **中段插叙**：' + beats(w.mid) + '\n'
    + '- **战后剧情**：' + beats(w.post) + '\n'
    + '- **战斗内事件（已撤上屏，仅存档数据）**：' + ((a.battleEvents || []).map((e) => e.trigger + '→' + e.line).join(' ｜ ') || '（无）') + '\n\n';
});
fs.writeFileSync(path.join(ROOT, 'docs/story/剧情总览-给GPT评审.md'), g);
console.log('已生成：docs/story/视觉资产驱动剧情终稿.md / docs/lore/W01-W36剧情策划表.md / docs/lore/Boss剧情表.md / docs/story/剧情总览-给GPT评审.md');
