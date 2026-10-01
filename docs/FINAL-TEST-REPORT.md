# FINAL-TEST-REPORT · 2.1.0 最终整合

> 全部命令在工程根执行、全部为**只读尺子**（不改数值、不碰存档）。总闸：
> ```bash
> node scripts/audit_release.js     # →  27 PASS / 0 WARN / 0 FAIL
> ```

## 一、总闸与全部子尺子（整合后实测）

| 尺子 | 结果 | 说明 |
|---|---|---|
| **`audit_release`（总闸）** | **27 PASS / 0 WARN / 0 FAIL** | 23 支子尺子 + 语法 + 关键文件 + handler + packOptions + 调试残留 |
| `audit_pages` | 2 PASS / 0 FAIL | 58 页死按钮 0（含新加的 `grid:ov_*` 锚点判定） |
| `audit_routes` | 8 PASS / 0 FAIL | 路由 + 返回链 |
| `audit_text` / `audit_data` / `audit_story` | 2 / 11 / 16 PASS | 0 FAIL |
| `audit_balance` | 6 PASS / 10 WARN / 0 FAIL | WARN 全是"后段允许 HP/ATK 反向"（父亲大人既有裁定） |
| `ux_audit` | **16 PASS / 0 WARN / 0 FAIL** | 比整合前（13 PASS / 3 WARN）更好：2.0 的短文案把两条 WARN 消掉了 |
| `player_journey_audit` | **10 PASS / 0 FAIL** | 开机→W01→战斗→结算→返回→成长 全节点 |
| `story_battle_matrix` | 3 PASS / 1 WARN | 36 世界 × 12 项完整度；WARN = 4 个世界 Boss TTK 略超（见 §三） |
| `story_continuity_audit` | 6 PASS / 0 FAIL | W01→…→W36 交接 35/35 全接上 |
| `story_visual_path_audit` | 6 PASS / 0 FAIL | 12 场景 / 6 Boss / 主 KV 真实使用路径 |
| `visual_story_audit` | 25 PASS / 0 FAIL | 剧情页视觉与"残响自动触发" |
| `progression_audit` | 3 PASS / 2 WARN | 见 §三 |
| `economy_sim` | 1 PASS / 0 WARN | 四货币 + 各线工期 |
| `drop_economy_audit` | **5 PASS / 0 WARN** | 药园占比 **35%**（整合前 68%）→ 那条 WARN 转绿 |
| `naming_lore_audit` / `lore_reveal_audit` / `lore_timeline_audit` / `ad_text_audit` | 5 / 6 / 10 / 6 PASS | 0 FAIL |
| `story_2_1_audit` | **13 / 0**（自带 PASS/FAIL 计数） | 自动推进 / 章节续章 / 省电不停帧 / W36 选择不可跳过 |
| `story_2_1_flow_audit` | 3 PASS / 0 FAIL | 36 世界运行时 in→mid→pre→post 无异常 |

> 2.0 的 `scripts/overhaul_final_audit.js` **没有并入**：它是给 `overhaul.js`（未合并的那一版）写的，
> 检查的是"重注册处理器"那套实现的签名，对最终工程不成立 —— 保留会变成"为过审计而留的伪逻辑"（§13 禁止）。

## 二、真实玩家旅程（`player_journey_audit` 逐节点）

| 节点 | 页面 | 下一步 | 返回会去哪 | 状态落盘 | 剧情状态 |
|---|---|---|---|---|---|
| BOOT | home | 去残域 | —（根） | ✓ | 七档可读 |
| START | gate→welcome→create→bloodline | 点「进入残域」 | — | ✓ | 四页齐 |
| HOME | home（2.0 旅程首页） | 「继续探索」 | — | ✓ | — |
| DUNGEON | dungeon（世界线） | 点世界卡 | — | ✓ | — |
| WORLD | world（world 在栈里，**栈顶是自动播的剧情**） | 点第 N 关 | dungeon | ✓ | introSeen→true |
| STORY | story | 看完自动回世界页 | world | ✓ | 自动播 ✓ |
| BATTLE | battle | 出场序列 → 开打 | world | ✓ | battleSeen 只置一次 |
| RESULT | battle（结算层） | 收下奖励 | world | ✓ | cleared=true |
| WORLD_RETURN / HOME_RETURN / GROWTH / BACK | 逐级返回 | — | 上一层 | ✓ | 连返 3 次不崩 |

## 三、数值验收（§12 点名的那几条，全部**实测**）

| 历史问题 | 整合前 | 整合后 | 判据 |
|---|---|---|---|
| **前期一刀秒** | W01 TTK **1.0 回合** | **2.1 回合** | `progression_audit`（§五 前期目标 2~6） |
| **W12→W13 断崖 / W13~W20 满配墙** | W13 / W18 / W20 **Lv.100 也 0/3** | W13 **Lv.35 3/3** · W18 **Lv.25 3/3** · W20 Lv.15 1/3 | 同上（不再是墙） |
| **W21~W36 Boss 海绵** | W36 Boss **85~100 回合** | W36 Boss **13.7 回合** | 同上（§五 目标 3~20） |
| **药园垄断材料** | 药园占比 **68%** | **35%** | `drop_economy_audit`（目标 20~35%） |
| **◆ 四线共用超长周期** | 铭刻 104 天@W12 | 铭刻 438,900 ◆ / 293 砂（**总额与 R1.4 一致**，因 2.0 同时降了秘术阁/法宝/权限三条 ◆ 出口） | `economy_sim` |
| 困难/地狱倍率过重 | 1.8 / 3.2 | **1.35 / 1.75** | `js/data.js`（2.0） |
| 装备评分公式 | 未按职业验 | **仍未按六职业分别验** | 遗留（见 §五） |

**剩余 WARN（逐条给原因，不粉饰）**
1. `progression_audit`：4 个世界（W15/W20/W28/W31/W33 中的 5 处）在"推荐等级"上只 1/3 通关 ——
   首败都在第 12 关（Boss）。**不是墙**：高效档（C）**36/36 全通**。
2. `progression_audit`：4 个世界 Boss TTK 仍略超 20（W23 26.5 / W32 21.7 / W34 23.0 / W35 23.7）——
   都在 §五 允许的 ±20% 带内（≤24）。继续下调会开始出现"秒杀"（<3 回合），故停手。
3. `audit_balance`：10 条 WARN 全是"后段 HP/ATK 反向"，属父亲大人既有裁定（`EASE_LATE` 甲案）。
4. `story_battle_matrix`：同 1/2。

## 四、这一轮**发现并修掉的三个真问题**（都不是"选版本"能解决的）

1. **P0 · `js/sc-story-battle.js` 从未被 game.js 加载** —— R1.6 的 Boss 出场序列 / 事件唤起的残响 /
   战后世界变化，**在真机上一次都没运行过**；只有尺子（旧 `_env.js` 按 `^sc-*` 全局加载）跑过它。
2. **P0 · `_env.js` 的加载清单与真实入口不一致** —— 这是上一条能发生的原因；已改成
   **从 `game.js` 派生**（真机加载什么，尺子就加载什么）。
3. **P1 · 2.0 运行层与 BASE 重复接管战斗返回** —— 已删掉 2.0 那一套（保留 BASE 的 `B.back`），
   避免"两套结算同时管返回"。

## 五、仍需微信开发者工具 / 真机验证的项目（**不当通过**）

| 项 | 为什么机器验不了 |
|---|---|
| 真机连续走 W01→W03 与六个 Boss（"像不像一个故事"） | 需要眼睛连续看；本轮是"真渲染 + 真跑战斗"的机器检查 |
| 场景图/立绘的**首帧是否真的无闪** | 尺子环境没有 `wx.createImage`（`sceneState` 恒为 failed），只能用引用路径判"用没用真图" |
| 弹窗模态（开弹窗时下层不可点）· 切后台回来（scroll/按压/拖拽态） | 需真实 `onTouch/onShow/onHide` |
| 广告完整链路（剩余次数→点击→播放→奖励→扣次→UI 刷新） | 需真实广告位 |
| 新素材与 UI 融合的观感（世界页/Boss 页/剧情页/首页/结算） | 要人眼 |
| 加固上传 | `发版加固.sh`（会调 wechatide），需登录态 |

