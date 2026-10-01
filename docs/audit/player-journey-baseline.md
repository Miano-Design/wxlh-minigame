# 《残域》当前版本基线（R1.8 玩家旅程轮 · 写在动手之前）

> 基线 commit：**R1.7 之后**（`main`，本轮开始时的真实 HEAD）
> 尺子：`audit_release` 全链 + `player_journey_audit`（本轮新增）
> ⚠️ 本文**不引用任何旧报告**，全部是这次从代码与运行时重新取的。

## 1. 当前真实页面

**58 个**（运行时 `CV.panels` 枚举，可独立渲染）。底栏一级页 4 格：灯阁 `home` / 残域 `dungeon` / 执灯者 `roster` / 背包 `bag`。

## 2. 当前真实入口

| 从哪 | 怎么进 | 备注 |
|---|---|---|
| 开机 | `gate`（主画面）→ `welcome` → `create`（起名）→ `bloodline`（命格）→ `home` | 四页齐（`player_journey_audit` START 判过） |
| 灯阁 | 底部四格 + `grow`（成长总览，13 个 `open_*` 入口） | 入口全部有处理器 |
| 残域 | `dungeon` → `w:W##`（世界卡）→ `world` | 点世界卡会**自动压一层 `in` 剧情** |
| 世界页 | `stage:i`（12 格）→ 战斗 | Boss/精英关前自动播 `pre` |
| 战斗 | `BattleUI.run()`（副本 / 深井 / 斗法台 / 挂机领取四条路） | 结算走 `onEnd` 返回面板 |

## 3. 当前返回链

`ux_audit` 逐页真派发过：**每个二级页的返回都回到上一层**（不是回首页、不是原地不动）。
底栏四格各有自己的现场（`CV.tabMemo`）：切走再切回保页面 + 保滚动。

## 4. 当前剧情入口

`in`（第一次进世界，自动）/ `pre`（Boss·精英关前，自动）/ `mid`（战斗内残响，由战斗事件触发）/
`post`（战后）/ `story_archive`（卷宗）/ 角色故事 / 装备故事。
**自动播放是真的**（`player_journey_audit` 里 `dispatch(w:W01)` 后栈顶就是 `story`）。

## 5. 当前战斗入口

`stage:*` → `startStage()` → `fightWave()` → `BattleUI.run()`；
深井 `corridor_fight`、斗法台 `arena_fight`、挂机领取各自走同一个 `BattleUI.run`。

## 6. 当前结算入口

`BattleUI` 的 `onEnd` 回调返回面板对象 → `CV.pageOverlay` 画结算层（`drawSettle`）。
字段：`title / sub / rewards / acts / closeLabel / worldId / lore / **changed**`（`changed` 是本轮新加的"战场变化"）。

## 7. 当前存档状态

`S`（`Core`）里与剧情有关的：`story.w / b / c / i / choice / e`。
**唯一的读取入口**：`Story.stateOf(worldId)` → `{unseen, introSeen, battleSeen, bossSeen, cleared, clueFound, epilogueSeen}`
（本轮收口；全仓只剩这一处拼七档，R1.8 前是 `sc-story-battle.js` 自己拼了一遍）。

## 8. 当前视觉资源路径

| 资源 | 路径 | 真实使用 |
|---|---|---|
| 主 KV | `brand/kv-main.jpg`（主包，271KB） | **首页 `Story.kvImage()` 真的用它**（`story_visual_path_audit` 判过） |
| 12 场景 | `story/scene/img_scene_*.jpg` | 12/12 有世界用；绘制入口 `Story.bg` / `CV.veils.battle` |
| 6 Boss | `story/boss/img_boss_W*.png` | 6/6 在位；剧情页 + **战斗出场序列**两处都读它 |

## 9. 当前数值审计结果

`progression_audit`（真跑战斗）· `economy_sim`（真跑一天）· `drop_economy_audit`：
读数与上一轮一致，本轮**没有改任何数值**（只做回归）。

## 10. 当前已知 WARN（动手前列全）

| 来源 | WARN | 性质 |
|---|---|---|
| `audit_release` | 源码 2 处 `console.log` | 项目既有的 `[wxlh]` 线上日志，**不计 FAIL** |
| `story_battle_matrix` | Boss 阶段帧探针 12/36 | **数值层**：W13~W28 一段要么一击秒、要么打不动（与 W13 起"要满配"同源） |
| `ux_audit` | 主按钮 >2 的页面 1 个（招募，一卡一颗）· 带价格按钮字数 >8 · 引导锚点清单 | 三条都在报告里给了"保持原样"的理由 |
| `audit_pages` | 5 个 WARN | 历史遗留（已核过不是死链） |
| `audit_routes` | 5 个 WARN | 同上 |

