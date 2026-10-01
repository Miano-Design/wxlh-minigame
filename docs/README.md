# 《残域》文档索引

> 仓库：`Miano-Design/wxlh-minigame`（**公开**）· 分支 `main`
> 这份索引是给**外部审阅**用的：想知道"某一轮改了什么、结论是什么"，从下面按时间倒着看即可。
> 所有数字都来自仓库里的尺子（`scripts/`），可以本地复跑。

---

## 一、最近四轮的报告（倒序，最新在最上）

> ⚠️ **先看这份**：最终整合版（2.1.0）的交接与账目 ——
> [CODEX-HANDOFF-FINAL.md](CODEX-HANDOFF-FINAL.md) · [FINAL-CHANGELOG.md](FINAL-CHANGELOG.md) ·
> [FINAL-TEST-REPORT.md](FINAL-TEST-REPORT.md) · [ASSET-MAP.md](ASSET-MAP.md)

| 轮次 | 文档 | 一句话 |
|---|---|---|
| **R1.9** 最终整合 | [docs/FINAL-CHANGELOG.md](FINAL-CHANGELOG.md) | **2.0(UX/经济/战斗反馈) × 2.1(36世界连续叙事) 熔成单版本 `2.1.0`**；逐项账目 + 没合并的东西与理由 |
| R1.9 交接 | [docs/CODEX-HANDOFF-FINAL.md](CODEX-HANDOFF-FINAL.md) | 工程结构 / 三条纪律 / 怎么验 |
| R1.9 测试 | [docs/FINAL-TEST-REPORT.md](FINAL-TEST-REPORT.md) | 27 PASS / 0 WARN / 0 FAIL + 数值实测对比 + 待真机项 |
| R1.9 资源 | [docs/ASSET-MAP.md](ASSET-MAP.md) | 主包 / 分包 / 图标 / 三态加载 / 缺图降级 |
| **R1.8** 玩家旅程总审 | [docs/audit/R1.8-玩家旅程总审.md](audit/R1.8-玩家旅程总审.md) | 以"第一次打开游戏的人"视角走查；割裂点 10 处（7 SEAMLESS / 3 NOTICEABLE / 0 BROKEN）；P0×3 已修 |
| R1.8 基线 | [docs/audit/player-journey-baseline.md](audit/player-journey-baseline.md) | 动手**之前**的 10 项真实基线（页面/入口/返回链/剧情/战斗/结算/存档/视觉路径/数值/WARN） |
| **R1.7** 36 世界叙事重构 | [docs/story/R1.7-36世界叙事重构.md](story/R1.7-36世界叙事重构.md) | 每世界"一件事"（ARC 11 字段 + ≥3 战斗剧情节点）；闪屏根因修复 |
| **R1.6** 剧情×战斗融合 | [docs/story/剧情×战斗融合.md](story/剧情×战斗融合.md) | Boss 出场序列 / 事件驱动残响 / 战后世界变化；`BattleStory` 叙事层 |
| **R1.5** UX 终审 | [docs/ux/残域UX终审报告.md](ux/残域UX终审报告.md) | 真渲染 58 页查返回链/滚动/热区/按钮主次；主按钮主次收口 |
| **R1.4** 数值终审 | [docs/balance/残域全局数值终审.md](balance/残域全局数值终审.md) | 先建 5 把尺子再改数；铭刻曲线断层修复（金额一分未动） |

## 二、自动生成的审计产物（机器产出，可直接读）

| 文件 | 内容 |
|---|---|
| [docs/story/story_visual_reference_audit.json](story/story_visual_reference_audit.json) | 19 条视觉资源记录：`asset / references / normalPath / fallbackOnly / status`（12 场景 + 6 Boss + 主 KV） |

## 三、世界观与叙事圣经（A 批，**已锁定不改**）

| 文件 | 内容 |
|---|---|
| [docs/lore/world.md](lore/world.md) | 世界观总纲 |
| [docs/lore/chapters.md](lore/chapters.md) | 六卷结构 |
| [docs/lore/timeline.md](lore/timeline.md) | 时间线 |
| [docs/lore/factions.md](lore/factions.md) | 四大阵营 |
| [docs/lore/characters.md](lore/characters.md) | 核心人物表 |
| [docs/lore/mysteries.md](lore/mysteries.md) | 核心谜团 |
| [docs/lore/items.md](lore/items.md) | 道具 / 装备故事 |
| [docs/lore/plot-outline.md](lore/plot-outline.md) | 剧情大纲 |
| [docs/lore/W01-W36剧情策划表.md](lore/W01-W36剧情策划表.md) | 36 世界逐世界策划表 |
| [docs/lore/Boss剧情表.md](lore/Boss剧情表.md) | 六个核心 Boss 的剧情作用 |
| [docs/lore/伏笔回收表.md](lore/伏笔回收表.md) | 伏笔 → 回收 对照 |
| [docs/lore/待裁决设定.md](lore/待裁决设定.md) | 需拍板的设定冲突（`DESIGN_REVIEW`） |

## 四、视觉素材规格

| 文件 | 内容 |
|---|---|
| [docs/story/叙事素材系统-第一期.md](story/叙事素材系统-第一期.md) | 12 张母版映射与用法 |
| [docs/story/母版提示词-第一期.md](story/母版提示词-第一期.md) | 12 张场景母版的生图提示词 |
| [docs/story/母版提示词-第二期视觉优化.md](story/母版提示词-第二期视觉优化.md) | 第二期视觉优化提示词 |

## 五、历史归档（`docs/archive/`，**结论已被后续轮次取代，别当现状读**）

> R1.9 整合时把这四份从仓库根目录移进 `docs/archive/`：它们写的是 **1.0.5 时代**的状态，
> 留在根目录会被误当成"当前结论"。内容一字未删（含"已解决·请勿改回去"那几条知识），
> 只是**不再代表现在**。

| 文件 | 内容 | 现在看它要注意 |
|---|---|---|
| [archive/AUDIT-R1.3-阶段一.md](archive/AUDIT-R1.3-阶段一.md) | 全局审计第一阶段（数值/批量分解/返回链） | 里面的数值结论已被 R1.4 数值终审取代 |
| [archive/AUDIT-R1.3-阶段二-②.md](archive/AUDIT-R1.3-阶段二-②.md) | 第二阶段执行记录 | 同上 |
| [archive/AUDIT-R1.3-阶段二-②-BASELINE.md](archive/AUDIT-R1.3-阶段二-②-BASELINE.md) | W01~W36 全表实测基线 | 读数来自旧 EASE 表；现在的曲线见 R1.9 的 `dungeon.js` |
| [archive/ISSUES-待检查.md](archive/ISSUES-待检查.md) | 问题单 | 第一节"已解决·请勿改回去"**仍然有效**（是知识）；第二节的"未决"里，版本号口径已在 2.1.0 定案 |

---

## 六、怎么复跑（都在 `scripts/` 下，`cd` 到仓库根执行）

```bash
node scripts/audit_release.js           # 总闸：一次跑完下面全部（25 PASS / 1 WARN / 0 FAIL）
node scripts/player_journey_audit.js    # 玩家旅程：开机 → W01 → 战斗 → 结算 → 返回
node scripts/story_battle_matrix.js     # 36 世界 × 12 项叙事完整度 + 逐世界连续体验一行
node scripts/story_continuity_audit.js  # W01→…→W36 交接连续性
node scripts/story_visual_path_audit.js # 12 场景 / 6 Boss / 主 KV 的真实使用路径
node scripts/ux_audit.js                # 真渲染 58 页：返回链/滚动/热区/按钮
node scripts/progression_audit.js       # 真跑战斗：推荐等级 / TTK / 死亡率
node scripts/economy_sim.js             # 真跑一天：货币与材料收支
```

全部为**只读**尺子（不改数值、不碰存档），失败一律以退出码 1 + `FAIL` 行返回。

## 七、已知的 WARN（都写清了原因，不是"看着不舒服"）

1. `audit_release`：源码 2 处 `console.log` —— 项目既有的 `[wxlh]` 线上日志，不计 FAIL。
2. `story_battle_matrix`：**Boss 阶段帧探针 12/36** —— W13~W28 那一段要么一击秒、要么打不动
   （与"W13 起要满配才过"同源），属**数值层**，不是叙事层能修的。
3. `ux_audit`：3 条（招募一卡一颗主按钮 / 带价格按钮字数 >8 / 引导锚点清单），逐条给了"保持原样"的理由。
4. `progression_audit`：4 条（前期 TTK 偏短、后期 Boss TTK 43~100 回合等），已在数值报告里列成"没改的清单"。
