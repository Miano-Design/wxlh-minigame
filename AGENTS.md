# 残域 · 微信小游戏（项目专属事实）

> **通用做法不写在这里** —— 四步收尾（尺子 → 上传 → 预览 → 重编译）、存档纪律、
> 两端同源、版本号只在定版 +1、后门不进仓库 —— 一律读
> `~/.codex/knowledge/guides/小游戏开发纪律.md`（类级，去掉项目名字也成立）。
> 本文件只写**绑在这个项目上的事实**。

## 一、只剩小游戏一个端（2026-09-27 起 · **本节已按新事实重写**）

| | 路径 | 说明 |
|---|---|---|
| 小游戏（**唯一的端**） | 本目录 | AppID **`wx61631124a2f9084b`**（父亲大人 2026-09-23 亲口确认；`project.config.json` 一直是这个），账号「残域灯阁」；**无远端、只本地 commit** |
| 网页版（**只读归档**） | 本地**已删** | 远端 `https://github.com/Miano-Design/wxlh-game`，末次同步 commit `589bebb`；**不再维护、不接单、界面层永远停在 V1.0.4** |

- **逻辑层的真相就在本目录 `js/`**（`data.js` / `core.js` / `battle.js` / `dungeon.js`）——**直接改这里**。
  ⚠️ 以前那套"改网页版 → `sync-logic.js` 单向同步"**已作废**（脚本已退役成一句提示）。
- **"两端一致"这条约束也作废**：界面对表、`parity_audit` / `stale_audit` 一并退役；
  其余尺子里"拿网页版当基准"的那几条走 ⏭ 跳过（总闸 `scripts/_web_basis.js` 的 `WB.OK`）。

## 二、版本号（只改一处）

本目录 `game.js` 的 `globalThis.GAME_VER`（网页版那三处随归档一起冻结，不再同步）。
当前 **1.0.3**（父亲大人 2026-09-27 拍板：上传 / 提审 / 材料统一用这个号）。

## 三、尺子（`scripts/`，改哪块跑哪把）

| 改了什么 | 至少跑 |
|---|---|
| 界面 / 排版 / 字号 | `layout_audit` `page_text_audit` `type_scale_audit` `spacing_audit` `page_smoke` `tap_audit` |
| 战斗 / 副本 / 结算 | `battle_flow_audit` `journey_audit` |
| 引导 / 主线 | `guide_walk_audit` `quest_play_audit` `coach_audit` |
| 数值 / 掉落 / 难度 | `test_game` `sweep_ticket_audit` `cap_audit` `drop_audit` `balance_check` `world_curve` `longrun_sim` `spec_audit` `data_audit` |
| 存档 / 迁移 / 云同步 | `save_audit` `save_migrate_audit` `switch_save_audit` `cloud_sync_audit` |
| 广告 / 收益领取 | `ad_audit` `idle_double_audit` **`retention_audit`**（留存环：七日登录 7 格 ＋ 今日汇总） |
| 音频 | `audio_audit` |
| 一切**弹窗**排版 | `overlay_audit` |
| 图标 / 字形 / 印记 | `icon_unique_audit` `glyph_audit` `equip_render_audit` |
| 交互 / 热区 / 死键 | `hit_handler_audit` `party_drag_audit` `perf_audit` |
| **数值口径的尺子也全在本目录 `scripts/`**（`balance_check` / `longrun_sim` / `world_curve` 已从归档里捞回来，`node scripts/<名>.js` 直接跑） |
| **画布 `save/restore`** | `battle_flow_audit` 里那条"数量配对"断言（**配错一个就会整块偏移**） |
| 整体自审（最慢，各约 10 分钟） | `frame_audit`（画布帧）× `tap_audit`（交互死键） |

> ⚠️ 上面那三份数值尺子**曾经**因为"网页版才是唯一标准"被删过、又在归档那天从
> `wxlh-game/` 捞回来（在 `scripts/_sim_allies.js` 里补回了组队那一段）。**现在只有这一份**，
> 别再回 `../wxlh-game/` 找（那个目录本地已经没有了）。

## 四、命令

- 上传体验版 + 推预览：`node scripts/release.js --desc "…"`（只推预览加 `--preview-only`）
- 重编译模拟器：`close_project_window` → `open_project_window`
  （`simulator_refresh` **只重载不编译**）
- 截图：`node scripts/shot.js <名字>`（输出到 `截图/`）

## 五、多账号调试的存档位置（测试用）

`~/Library/Application Support/微信开发者工具/<hash>/WeappSimulator/WeappStorage/storage_<appid>_<openid>.json`
（文件名就是 openid；本项目主档 `o6zAJszR55N4ACs7cgHoJBq1Hlm4`）
