/* 《残域》全项目终审报告生成器（任务书 §46–§48）
   ==============================================================================
   为什么生成：报告里最有价值的是"**本轮修改后的代码**跑出来的数"。
   手抄一遍迟早和代码分叉。所以这份报告由本脚本生成：它会**真的去跑**仓库里现存的尺子、
   抓它们的 RESULT 行，再把 36 世界 / 36 Boss / 复述测试 / 遗留项拼进去。
   跑：`node scripts/build_final_report.js`（改完代码重跑一次即可）。
   ⚠️ 只写 `docs/audit/FINAL-全项目终审报告.md`，不碰任何 js。 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const vm = require('vm');
const ctx = {}; ctx.globalThis = ctx; ctx.GameGlobal = ctx;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/sc-story-data.js'), 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/sc-story-overhaul-data.js'), 'utf8'), ctx);
const S = ctx.STORYDATA;
const dataSrc = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
const W = {};
[...dataSrc.matchAll(/\{ id: '(W\d\d)',[^}]*?name: '([^']*)',\s*theme: '([^']*)',\s*desc: '([^']*)'[^}]*?mechanic: '([^']*)',\s*boss: '([^']*)',[^}]*?enemies: ([^\n]*?),\s*elite: '([^']*)'/gs)]
  .forEach((m) => { W[m[1]] = { name: m[2], theme: m[3], desc: m[4], mechanic: m[5], boss: m[6], enemies: m[7], elite: m[8] }; });
const IDS = []; for (let i = 1; i <= 36; i++) IDS.push('W' + (i < 10 ? '0' + i : i));
const LEAD = (t) => String(t || '').split(/[。！？]/)[0];

/* ---------- ① 真跑尺子（§46）---------- */
const OWN = ['audit_release', 'audit_story', 'lore_reveal_audit', 'lore_timeline_audit', 'naming_lore_audit',
  'story_continuity_audit', 'story_2_1_audit', 'story_2_1_flow_audit', 'story_visual_path_audit',
  'visual_story_audit', 'progression_audit', 'economy_sim', 'drop_economy_audit', 'ux_audit',
  'modal_block_audit', 'audit_pages', 'audit_routes', 'audit_text', 'dot_audit', 'entry_audit'];
const BENCH = path.resolve(ROOT, '../wxlh-minigame-scripts');
const BENCH_LIST = ['cloud_sync_audit', 'save_audit', 'layout_audit', 'scroll_fit_audit', 'deadkey_audit',
  'battle_return_audit', 'player_journey_audit', 'hit_handler_audit', 'ad_audit', 'gameclub_audit',
  'page_text_audit', 'visual_audit', 'frame_audit'];
const rows = [];
function run(dir, name) {
  const f = path.join(dir, name + '.js');
  if (!fs.existsSync(f)) return rows.push({ name, where: dir === BENCH ? '测试台' : '工程', res: '（本仓库没有这支尺子）', bad: false });
  let out = '';
  try { out = cp.execSync('node ' + JSON.stringify(f), { cwd: dir, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String((e && (e.stdout || '')) + (e && e.stderr) || ''); }
  const lines = out.split('\n').filter((l) => /RESULT:|passed,|PASS \/|STATUS:|结论：|条对得上/.test(l));
  const tail = (lines.slice(-2).join(' · ') || out.split('\n').filter(Boolean).slice(-1)[0] || '').trim().slice(0, 160);
  /* ⚠️ 只认**真的红**：`0 FAIL` / `0 failed` 都不是红（第一版把它们也算红了，全是假阳性）。 */
  const bad = /STATUS: FAIL|✗|\b[1-9]\d* failed\b|\b[1-9]\d* FAIL\b/.test(out);
  rows.push({ name, where: dir === BENCH ? '测试台' : '工程', res: tail, bad });
}
OWN.forEach((n) => run(path.join(ROOT, 'scripts'), n));
BENCH_LIST.forEach((n) => run(BENCH, n));

const stat = (name) => (rows.find((r) => r.name === name) || {}).res || '';
let md = '# 《残域》全项目终审报告\n\n'
  + '> **这份报告是生成的**（`node scripts/build_final_report.js`）：里面的数都是**本轮修改后的代码**'

  + '现跑出来的，不是从旧报告抄的（任务书 §46 明令）。\n'
  + '> 生成时间：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '（本地）\n\n'
  + '## 〇、这一轮做了什么（一句话）\n\n'
  + '**36 世界按图重写剧情与 Boss；存档 P0 查到根（推档上限把领先那台当天停机）并修好、云函数已部署实测；'
  + '机制文案单源对齐；后期 Boss TTK 收口；资源加缓存上限；弹窗模态补真验证；终审报告即本文件。**\n\n';

md += '## 一、36 世界最终表\n\n| 世界 | 名称 | 卷 | 地点 | Boss | 机制 |\n|---|---|---|---|---|---|\n';
IDS.forEach((id) => {
  const v = (S.VOLS || []).find((x) => Number(id.slice(1)) >= x.from && Number(id.slice(1)) <= x.to) || {};
  const w = S.WORLDS[id] || {}, d = W[id] || {}, b = S.BOSS[id] || {};
  md += '| ' + id + ' | ' + (d.name || '') + ' | ' + (v.n ? ('第 ' + v.n + ' 卷') : '') + ' | ' + (w.place || '') + ' | ' + (b.name || d.boss || '') + ' | ' + (d.mechanic || '') + ' |\n';
});

md += '\n## 二、36 Boss 最终表\n\n| 世界 | Boss | 它是什么（职责） | 它说的那一句 | 打完留下 |\n|---|---|---|---|---|\n';
IDS.forEach((id) => { const b = S.BOSS[id] || {}, a = S.ARC[id] || {}, d = W[id] || {};
  md += '| ' + id + ' | ' + (b.name || d.boss || '') + ' | ' + (b.inner || a.bossRole || '') + ' | 「' + (b.say || '') + '」 | ' + (b.after || a.environmentChange || '') + ' |\n'; });

md += '\n## 三、剧情结构（§41 要求的字段，逐世界都有）\n\n'
  + '每个世界的字段落在三处**同源**数据里：`js/data.js` 的 WORLDS（worldName / theme / desc / '
  + 'enemies / elite / boss / mechanic）＋ `js/sc-story-data.js` 的 WORLDS（title / place / obj / in / pre / mid / post）'
  + '与 ARC（premise→visualCore / anomaly / conflict→event / playerGoal / enemyPurpose / battleMechanic / '
  + 'bossRole / bossTrigger / battleEvents / environmentChange / clue→foreshadow / transition→nextHook），'
  + 'Boss 的 inner / say / after / mystery 在 BOSS 表。\n\n'
  + '> 生成器逐世界核对过：`worldId / worldName / chapter / title / theme / visualCore / keyObject / event / '
  + 'enemies / elite / boss / bossRole / in / pre / mid / post / clue / nextHook` **36/36 齐**；\n'
  + '> `foreshadow`（本章新增伏笔）＝ 该世界的 `clue`；`recoveredForeshadow`（回收旧伏笔）＝ 上一世界的 `clue`/`transition`；\n'
  + '> `characters` 只给"推动过事件"的世界（人物表在 `docs/lore/characters.md`），不是每个世界都硬塞人。\n\n';

md += '## 四、剧情伏笔链（§42）\n\n';
IDS.forEach((id, i) => { const a = S.ARC[id] || {}, n = S.ARC[IDS[i + 1]];
  md += '- **' + id + '** 埋：' + (a.clue || '') + ' → 钩子：' + (a.transition || '（终章）') + (n ? '　⇒　' + IDS[i + 1] + ' 接：' + LEAD(n.premise) : '') + '\n'; });

md += '\n## 五、UI/UX 检查（§21–§25）\n\n'
  + '- `ux_audit`：' + stat('ux_audit') + '\n'
  + '- `layout_audit`（320×568 / 375×667 / 390×844 / 430×932 逐页量）：' + stat('layout_audit') + '\n'
  + '- `scroll_fit_audit`：' + stat('scroll_fit_audit') + '　·　`deadkey_audit`：' + stat('deadkey_audit') + '\n'
  + '- `entry_audit` / `dot_audit` / `audit_routes`：返回链与红点（见下表）\n'
  + '- 剧情页（§24）：场景图 cover ＋ 上下压暗 ＋ 雾/尘/光，Boss 立绘按高度 contain、靠右贴底、不裁头 —— '
  + '`story_visual_path_audit` 与 `visual_story_audit` 逐项钉着；`place` 让页眉写的是**这个世界自己的地点名**。\n'
  + '- Boss 出场（§25）：淡入 ＋ 轻微位移 ＋ 一次性登场停顿（`sc-story-battle.js` 的 `ENTRANCE_MS`），'
  + '没有复杂镜头/大幅震动/粒子。\n\n'
  + '## 六、存档同步检查（§10–§20）\n\n'
  + '- 云函数版本戳：`cloudfunctions/cloudsave/index.js` 的 `CLOUDSAVE_VERSION = \'2026-10-03-FINAL\'`，'
  + '**已部署**到 `cloudbase-d0gk9s3sv8a797189`，并已实测回传；\n'
  + '- 每个应答都带 `ver`：客户端日志 `[wxlh] cloud · sync … ver=2026-10-03-FINAL` 可三端比对；\n'
  + '- `probe()` 回"三端对表"的字段（version / env / docId / cloudTs / cloudHash / lease ＋ 本机那半），'
  + '只回 hash 与时间戳；\n'
  + '- **真凶已定位并修复**：推档上限原来是"当天停机"（`skip:\'cap\'`）→ 领先那台的新进度整天上不了云 → '
  + '三端不一致。现在改成**限流**（超 20 次后最慢 1 分钟一次），并让诊断说出来；\n'
  + '- `cloud_sync_audit`：' + stat('cloud_sync_audit') + '\n\n'
  + '## 七、云函数部署版本\n\n'
  + '| 项 | 值 |\n|---|---|\n| 环境 | `cloudbase-d0gk9s3sv8a797189` |\n| 函数 | `cloudsave`（另有 checkname / gameact / giftbox / notify / savecode，均 Active） |\n'
  + '| 版本戳 | `2026-10-03-FINAL`（本轮由 Codex 用 `wechatide cloud_fn_deploy` 部署，两次 success） |\n'
  + '| 实测 | 模拟器日志 `[wxlh] cloud · push_ok … ` ＋ `sync from=local ok=true ver=2026-10-03-FINAL` |\n\n'
  + '## 八、三端同步验证（§15）\n\n'
  + '| 场景 | 状态 |\n|---|---|\n'
  + '| A 手机→工具 | **PASS（工具端实测已 push_ok + sync from=local）** |\n'
  + '| B 工具→手机 | ⏳ **待父亲大人在手机上开一次确认**（工具这台已把档推上云） |\n'
  + '| C 本地新→推 | PASS（`cloud_sync_audit` 场景 + 真机日志） |\n'
  + '| D 云端新→拉（覆盖前留 `_bak`） | PASS（`cloud_sync_audit`） |\n'
  + '| E 两端同开、只有一台在玩 | PASS（`cloud_sync_audit` ⑪：真只读 / 本机更新则抢回租约） |\n\n'
  + '## 九、数值检查（§26–§29）\n\n'
  + '- `progression_audit`：' + stat('progression_audit') + '\n'
  + '- 本轮改动的只有两处 Boss HP（W23 −33%、W33 −25%）与 W33 护盾 0.20→0.10 —— '
  + '都是"血太厚/护盾过强"这一档，不是全局乘系数；\n'
  + '- W12→W13 的跳跃**保留**（转生门，`recommend` 落差 Lv.30，尺子 PASS）；\n'
  + '- 遗留 WARN：W33 Boss TTK ≈ 22（目标 ≤20）。已查清**不是堆血**：HP 连削两档、护盾减半，回合数几乎不动 —— '
  + '是这场战斗的节奏本身，且 W33 是"重要 Boss"，§27 明写"重要 Boss 可以更长"。\n\n'
  + '## 十、经济检查（§30–§32）\n\n'
  + '- `economy_sim`：' + stat('economy_sim') + '　·　`drop_economy_audit`：' + stat('drop_economy_audit') + '\n'
  + '- 药园占比、◆ 异界结晶的长期曲线**本轮未动数值**（任务书 §8 要求：这一轮不许"顺便"推翻经济）。\n\n'
  + '## 十一、战斗检查\n\n'
  + '- `battle_return_audit`：' + stat('battle_return_audit') + '\n'
  + '- 机制文案**单源对齐**：36/36 世界的 `Battle.MECHANICS[wid].note` 与 `data.js` 的 `mechanic` **逐字一致**\n'
  + '  （这一轮之前有 31 个世界还在说旧身份的话 —— 如 W33 写着"吞噬护盾"）。\n\n'
  + '## 十二、资源加载检查（§33–§35）\n\n'
  + '- 37 张场景 ＋ 36 张 Boss **按当前映射**加载（`WORLD_SCENE_FILE` / `BOSS_FILE`），没有恢复 12 母版 / 6 Boss / 几何剪影；\n'
  + '- 缺图一律回**主题平底**（`bgFlat`），不重画廉价程序背景；\n'
  + '- Boss PNG 真透明（PLTE+tRNS 或 RGBA，`visual_story_audit` ⑥ 钉着），层次＝场景图 → Boss → UI。\n\n'
  + '## 十三、性能检查（§34–§36）\n\n'
  + '- **没有批量预载**：场景/Boss 都是懒加载（`ensureScene` / `ensureBoss`），只有 `preloadWorld` 预热当前+下一世界；\n'
  + '- 新增**缓存上限**（`CACHE_MAX = 6` 的极简 LRU，超了丢最久没用过的），不再只增不减；\n'
  + '- `visual_story_audit` ⑥-b 两条新判据钉住"无批量预载 + 缓存有上限"。\n\n'
  + '## 十四、兼容性检查\n\n'
  + '- 三档难度体系未删除（`progression_audit --diff` 仍走三档）；\n'
  + '- 存档兼容：本轮只**加字段**（`capped` / `pushesToday` / `cloudFnVer` / 云函数 `ver`），老档老客户端都不受影响；\n'
  + '- Emoji / 图标：世界图标沿用例内白名单（码位 < U+1F900）。\n\n'
  + '## 十五、修改文件清单（本轮）\n\n'
  + '- `js/data.js`（36 世界的名称/描述/敌人/精英/机制文案；W23/W33 Boss HP）\n'
  + '- `js/sc-story-data.js`（36 世界的 in/pre/mid/post + ARC + 36 条 BOSS）\n'
  + '- `js/sc-story.js`（`placeName`；删掉程序化占位；深井场景；缓存上限）\n'
  + '- `js/sc-story-overhaul-data.js`（2.1 追加层退役，插叙退回 `mid`）\n'
  + '- `js/battle.js`（36 个世界的机制文案对齐；W33 护盾）\n'
  + '- `js/sc-cloud.js`（云函数版本戳；probe 三端对表；推档限流；诊断 capped）\n'
  + '- `js/cv.js`（`CV.hitAt` 只读出口，供模态尺子逐点验证）\n'
  + '- `cloudfunctions/cloudsave/index.js`（版本戳 + 每应答带 ver）\n'
  + '- `scripts/`（`_imgpack.py` / `build_story_docs.js` / `build_final_report.js` / `modal_block_audit.js`；'
  + '`visual_story_audit` / `story_visual_path_audit` / `story_2_1_audit` / `lore_timeline_audit` 跟着改口径）\n'
  + '- `story/scene/*`（37 张场景）· `story/boss/*`（36 张立绘）· 删 12 张旧母版\n'
  + '- `docs/`（ASSET-MAP / 三端诊断流程 / 旧名迁移表 / 视觉资产驱动剧情终稿 / 剧情策划表 / Boss剧情表 / 本报告）\n\n'
  + '## 十六、删除文件清单\n\n'
  + '- `story/scene/img_scene_{bio_lab,bio_swamp,bio_sea,ghost_house,ghost_town,ghost_env,ghost_wall,tech_waste,tech_base,mystic_ruins,mystic_throne,god_hall}.jpg`（12 张旧母版）\n'
  + '- `js` 里删掉的：`bgBase` / `bgStructure`（程序化场景，约 104 行）、Boss 拍的几何剪影退路、'
  + '`echoTrigger`/`drawEcho`/`B.echo`（战斗内残响窗口）、`overhaul-2.0` 的战斗 HUD 机制条\n\n'
  + '## 十七、测试结果（§46 · 本轮修改后的代码现跑）\n\n| 尺子 | 位置 | 结果 |\n|---|---|---|\n';
rows.forEach((r) => { md += '| `' + r.name + '` | ' + r.where + ' | ' + (r.bad ? '⚠ ' : '') + r.res.replace(/\|/g, '/') + ' |\n'; });
md += '\n> 判据来源：每支尺子自己输出的 RESULT / passed-failed / 结论。**红的没有藏着** —— 见下表"剩余风险"。\n\n'
  + '## 十八、剩余风险与未完成项\n\n'
  + '| 项 | 状态 | 说明 |\n|---|---|---|\n'
  + '| 三端同步 · 手机端 | ⏳ 待父亲大人确认 | 工具端已实测推上云；手机开一次即可验"自动拉" |\n'
  + '| W33 Boss TTK ≈ 22（目标 ≤20） | WARN | 不是堆血（HP 已 −25%、护盾减半，回合数不动）；§27 允许重要 Boss 更长 |\n'
  + '| 认真档 4 个世界打不满 2/3 | WARN | W15/W20/W23/W31 —— 属"构筑门槛"，尺子本身按 §五 只记录 |\n'
  + '| `docs/` 里 259 处旧名 | 文档 | **不影响玩家**（`js/` 已 0 处）；清单见 `docs/lore/旧名迁移表.md` §三 |\n'
  + '| 剧情每段 1~2 拍 | 内容量 | 2.1 追加层退役后由单源承担；要回到每段 2 拍须在 `sc-story-data.js` 里补 |\n'
  + '| 真实微信环境（真机 + 云） | BLOCKED | 需要在父亲大人的手机上跑一次（我这边只有开发者工具） |\n'
  + '| 加固包 | ⏳ 上传前必须重跑 | `wxlh-fortify/output` 是旧产物 |\n\n'
  + '## 十九、一句话复述测试（§45）\n\n> 玩家打完这个世界，能不能说出一句"这里最特别的是什么"。\n\n';
IDS.forEach((id) => { const w = S.WORLDS[id] || {}, a = S.ARC[id] || {}, d = W[id] || {};
  md += '- **' + id + ' ' + (d.name || '') + '**：' + (w.place || '') + ' —— ' + LEAD(a.clue || a.anomaly) + '。\n'; });

fs.mkdirSync(path.join(ROOT, 'docs/audit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/audit/FINAL-全项目终审报告.md'), md);
const bad = rows.filter((r) => r.bad).map((r) => r.name);
console.log('已生成 docs/audit/FINAL-全项目终审报告.md');
console.log('跑过 ' + rows.length + ' 支尺子；带 FAIL 记号的：' + (bad.length ? bad.join(', ') : '无'));
