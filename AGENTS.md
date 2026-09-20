# 残域 · 微信小游戏（本项目专用规矩）

> 这是**项目级**规矩，只在这个目录里生效。全局规矩（称呼、硬边界等）在 `~/.codex/AGENTS.md`。

## 一、每次改完必须做的四件事（顺序固定）

**① 跑尺子**：改哪个模块就跑对应那几把（全量清单见 `scripts/`）：

| 改了什么 | 至少跑 |
|---|---|
| 界面 / 排版 / 字号 | `type_scale_audit` `spacing_audit` `page_smoke` `tap_audit` |
| 战斗 / 副本 / 结算 | `battle_flow_audit` `journey_audit` |
| 引导 / 主线任务 | `guide_walk_audit` `quest_play_audit` `coach_audit` |
| 数值 / 掉落 / 扫荡 | `sweep_ticket_audit` `cap_audit` `test_game` |
| 存档 / 迁移 | `save_migrate_audit` `switch_save_audit` |
| 逻辑层（data/core/battle/dungeon） | 先改**网页版**再 `node scripts/sync-logic.js`，然后两边都跑 `test_game` |

**② 上传体验版**：`node scripts/release.js --desc "这次改了什么"`
（它会按 `game.js` 里的 `GAME_VER` 上传，并**紧接着推手机预览**）

**③ 推手机预览 —— 每次必做，不许省。**
父亲大人要看效果只能靠手机，所以任何一次改动（哪怕只改一个字）都要让他手机上能立刻看到：
`wechatide -c Codex auto_preview --project <项目绝对路径>`
（`release.js` 已经带上这一步；如果只改了界面想快点看，用 `node scripts/release.js --preview-only`）

**④ 重编译模拟器**：`close_project_window` → `open_project_window`
（`simulator_refresh` **不会**重新编译，只重载模拟器）

最后：删除临时代码与临时截图，确认 `git status` 只剩本次要提交的文件。

## 二、版本号四处必须一致

`wxlh-game/index.html`（7 处 `?v=`）· `wxlh-game/sw.js` 的 `const V` ·
`wxlh-game/js/ui.js` 的 `GAME_VER` · `wxlh-minigame/game.js` 的 `globalThis.GAME_VER`。
改版本号时**四处一起改**，改完 `grep` 一遍确认（踩过一次：只提交了代码、漏改版本号）。

## 三、两条血泪教训（每次都自查）

1. **绝不让测试代码碰玩家存档。**（踩过两次，记牢）
   - 看效果用的后台挂钩只做"跳页面"，不许 `Core.newGame()`、不许改角色名/数值 ——
     游戏有**定时存盘**，测试数据会被写进存档（第一次：模拟器里角色名被我写成"临时"）。
   - 要看"必须产生状态才会出现的界面"（抽卡结果页、结算页这类），**优先在假环境里量**（`scripts/` 的审计脚本）；
     万不得已要在真机/模拟器上看，必须走这套**固定流程**：
     ① 先 `cp` 一份存档到 `/tmp` 并记下 `md5`；
     ② 看完图后**先 `close_project_window`**（把游戏进程关掉，否则它的定时存盘会把你还原的存档再覆盖一遍 ——
        这是第二次踩的坑）；
     ③ 再把那份存档原样拷回去，`md5` 校验一致才算完；
     ④ 之后重新开窗口时，游戏只会更新"上次见到玩家"这类时间戳字段（这是设计行为），
        校验时看**内容**（角色名 / 等级 / 货币），别死抠 md5。
2. **改完一定要看图。**
   尺子查不出"参数少一个""画出来是空的"这类事 —— 至少截一张你改动的那一屏。
   看图用 `node scripts/shot.js <名字>`（输出到 `截图/`，看完删掉）。

## 四、网页版是标准

- 逻辑层（`data/core/battle/dungeon`）**只有一份真相**，住在 `../wxlh-game/js/`；
  改逻辑 → 改网页版 → `node scripts/sync-logic.js`。
- 界面层：网页版 `js/ui.js` + `css/style.css` 是版式标准（字号五级、间距、按钮尺寸），
  小游戏 canvas 逐条对齐；两边不一致时**以网页版为准**，并在 `type_scale_audit` 里加一条断言。
