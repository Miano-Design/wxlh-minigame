# 残域 · 微信小游戏（项目专属事实）

> **通用做法不写在这里** —— 四步收尾（尺子 → 上传 → 预览 → 重编译）、存档纪律、
> 两端同源、版本号只在定版 +1、后门不进仓库 —— 一律读
> `~/.codex/knowledge/guides/小游戏开发纪律.md`（类级，去掉项目名字也成立）。
> 本文件只写**绑在这个项目上的事实**。

## 一、两端

| | 路径 | 说明 |
|---|---|---|
| 网页版（**唯一标准**） | `../wxlh-game/` | 仓库 `Miano-Design/wxlh-game`（private） |
| 小游戏 | 本目录 | AppID `wx69e989a1d09967aa`，账号「残域灯阁」；**无远端、只本地 commit** |

- 逻辑层（`data.js` / `core.js` / `battle.js` / `dungeon.js`）**只有一份真相**，住在 `../wxlh-game/js/`；
  改完跑 `node scripts/sync-logic.js` 单向同步过来。
- 界面以网页版 `js/ui.js` + `css/style.css` 为准，canvas 逐条对齐。

## 二、版本号改这四处（必须一起改）

`../wxlh-game/index.html`（7 处 `?v=`）· `../wxlh-game/sw.js` 的 `const V` ·
`../wxlh-game/js/ui.js` 的 `GAME_VER` · 本目录 `game.js` 的 `globalThis.GAME_VER`

## 三、尺子（`scripts/`，改哪块跑哪把）

| 改了什么 | 至少跑 |
|---|---|
| 界面 / 排版 / 字号 | `layout_audit` `page_text_audit` `type_scale_audit` `spacing_audit` `page_smoke` `tap_audit` |
| 战斗 / 副本 / 结算 | `battle_flow_audit` `journey_audit` |
| 引导 / 主线 | `guide_walk_audit` `quest_play_audit` `coach_audit` |
| 数值 / 掉落 | `sweep_ticket_audit` `cap_audit` `test_game` |
| 存档 / 迁移 | `save_migrate_audit` `switch_save_audit` |
| 逻辑层 | 先改网页版 → `sync-logic.js` → 两边都跑 `test_game` |
| **画布 `save/restore`** | `battle_flow_audit` 里那条"数量配对"断言（**配错一个就会整块偏移**） |
| 整体自审（最慢，各约 10 分钟） | `frame_audit`（画布帧）× `tap_audit`（交互死键） |

## 四、命令

- 上传体验版 + 推预览：`node scripts/release.js --desc "…"`（只推预览加 `--preview-only`）
- 重编译模拟器：`close_project_window` → `open_project_window`
  （`simulator_refresh` **只重载不编译**）
- 截图：`node scripts/shot.js <名字>`（输出到 `截图/`）

## 五、多账号调试的存档位置（测试用）

`~/Library/Application Support/微信开发者工具/<hash>/WeappSimulator/WeappStorage/storage_<appid>_<openid>.json`
（文件名就是 openid；本项目主档 `o6zAJszR55N4ACs7cgHoJBq1Hlm4`）
