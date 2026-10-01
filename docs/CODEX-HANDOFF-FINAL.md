# CODEX-HANDOFF-FINAL · 交接说明（2.1.0 最终整合版）

## 一、这是什么

把四个来源熔成**一个**可运行版本：
`wxlh-minigame`（当前仓库，含 R1.4~R1.8）+ 2.0 落地包 + 2.0 完整工程 + 2.1 完整工程。
最终版本号 **`2.1.0`**（`game.js` 的 `GAME_VER`，工程内只有这一处版本号）。

详细逐项账目见 [FINAL-CHANGELOG.md](FINAL-CHANGELOG.md)，
测试读数见 [FINAL-TEST-REPORT.md](FINAL-TEST-REPORT.md)，
资源与入口 map 见 [ASSET-MAP.md](ASSET-MAP.md)。

## 二、工程结构（只有一个正式运行入口）

```
game.js                     ← 唯一入口。require 顺序 = 真实加载顺序（尺子也照它加载）
  js/wx-adapter.js          ← 环境垫片 / 广告 / 音频
  js/mem-guard.js           ← 内存加固运行时
  js/data.js                ← 数值与文案真源（含 2.0 的经济改动）
  js/assets-icons.js        ← 生成物（36 世界 + 24 全局图标，路径 op）
  js/core.js  js/battle.js  js/dungeon.js   ← 逻辑层（战斗 / 关卡生成）
  js/cv.js  js/wx-cap.js  js/audio.js  js/uiw.js   ← 渲染框架与通用件
  js/sc-*.js                ← 58 个页面
  js/sc-story-data.js       ← 剧情数据：四拍 + BOSS + 人物 + 装备 + 12 母版映射 + ARC（36 世界"一件事"）
  js/sc-story-overhaul-data.js  ← 2.1：36 世界连续叙事扩展（midstory / 加厚的 pre·post）
  js/sc-story.js            ← 小说式播放器 + 卷宗 + 场景三态（ready/loading/failed）
  js/sc-story-battle.js     ← 叙事×战斗融合层：Boss 出场 / 事件唤起的残响 / 战后变化
  js/overhaul-2.0.js        ← 2.0 旅程驱动运行层（首页/成长/残域 + 战斗机制条）
```

**没有并行的第二套入口**：`overhaul.js`（2.0 落地包的 561 行那版）**没有并入**，
理由写在 `FINAL-CHANGELOG.md` §四（它会重注册已有处理器 = 隐式竞争）。

## 三、三条必须知道的纪律

1. **改加载清单只需改 `game.js`** —— `scripts/_env.js` 会从它派生，尺子与真机同源。
2. **加 js 文件要同步 `code.fortify.config.json`** 的混淆白名单，否则上传后的包**真机白屏**
   （加固闸门 `check-output.js` 会拦下来，但别等它拦）。
3. **剧情状态只有一个读取口**：`Story.stateOf(worldId)` →
   `{unseen, introSeen, battleSeen, bossSeen, cleared, clueFound, epilogueSeen}`；
   唯一的写入口是 `Story.markSeen / markBoss / markBattleSeen`。别在页面里自己拼 `S.story.*`。

## 四、怎么验（跑完应当 0 FAIL）

```bash
node scripts/audit_release.js          # 总闸：27 PASS / 0 WARN / 0 FAIL
node scripts/player_journey_audit.js   # 开机→W01→战斗→结算→返回
node scripts/story_battle_matrix.js    # 36 世界 × 12 项叙事完整度
node scripts/story_2_1_audit.js        # 2.1 自动剧情状态机（13/0）
```

## 五、还没做 / 必须真机确认的

见 `FINAL-TEST-REPORT.md` §五。一句话：**"连续玩下来像不像一个故事""素材融合好不好看"**
这类只能用眼睛判的项，本轮没有实机连打，**不当通过**。

