# ASSET-MAP · 资源与入口map（2.1.0）

> 原则（任务书 §10）：**不删任何用户原有素材**；已有素材优先；缺图必须降级不白屏。

## 一、主包（开机即得）

| 资源 | 路径 | 大小 | 真实使用点 |
|---|---|---|---|
| 主 KV | `brand/kv-main.jpg` | 271 KB | 首页背景 `CV.veils.home` ← `Story.kvImage()` ← `STORYDATA.KV_FILE` |
| 主题字标 | `brand/logo-title.png` | 139 KB | 开机三步 + 首页 `U.brand()` |

> 旧主视觉 `icons/mv-main-lamp.jpg` **已由用户删除**；`story_visual_path_audit` 核过：
> **正常路径 0 处引用**（只在历史注释里提到）。

## 二、剧情分包 `story/`

| 资源 | 数量 | 路径规则 | 真实使用点 |
|---|---|---|---|
| 世界场景图 | **36** | `story/scene/img_scene_W<nn>.jpg` | `Story.bg()`（剧情页）/ `CV.veils.battle()`（战斗页）——**同一张图**，所以剧情→战斗视觉连续 |
| 深井场景图 | **1** | `story/scene/img_scene_corridor.jpg` | `CV.veils.battle()` 在没有 `CV.battleWorld`（深井那种无世界号的战斗）时取它 |
| Boss 立绘 | **36** | `story/boss/img_boss_W<nn>.png` | 剧情页 Boss 层 + **战斗出场序列** `Story.bossImage()` |
| 图标源 SVG | 60 | `story/icons-src/`（`packOptions.ignore` 排除，不进包） | 由 `scripts/build-visual-assets.js` 编译 |

> **2026-10-03 换图**：父亲大人送来 36 个世界的场景 + Boss ＋ 深井一张。
> 原图合计 **227 MB** —— 落包前一律先压（`scripts/_imgpack.py`）：
> 场景 810×1440 JPEG q74（~139 KB/张）、Boss 720×1280 PNG 256 色带真透明（~200 KB/张）。
> 剧情分包 **20.9 MB → 13.3 MB**，整包 24.5 MB → **16.8 MB**。
> 同时删掉 12 张旧场景母版（**文件**），"母版 id"那条链改由 `STORYDATA.MASTER_WORLD` 折到代表世界。

### "场景气质" ↔ 世界映射（`STORYDATA.SCENE`，一处真源）

| 场景气质 | 名字（页眉用） | 用在哪些世界 | 代表世界（`MASTER_WORLD`，取图用） |
|---|---|---|
| `bio_lab` | 培养舱走廊 | W01 W02 W23 | W01 |
| `bio_swamp` | 瘴气荒原 | W09 W10 W28 W33 | W09 |
| `bio_sea` | 沉海柱廊 | W16 | W16 |
| `ghost_house` | 旧宅内厅 | W03 W07 W15 | W03 |
| `ghost_town` | 雾中小镇 | W08 | W08 |
| `ghost_env` | 客轮内舱 | W05 W18 W21 | W05 |
| `ghost_wall` | 长明高墙 | W27 W31 | W27 |
| `tech_waste` | 轨道废土 | W06 W17 | W06 |
| `tech_base` | 机械纵深 | W19 W22 W26 W30 W34 | W19 |
| `mystic_ruins` | 石质遗迹 | W04 W11 W24 W29 W35 | W04 |
| `mystic_throne` | 冰雪王座 | W12 W13 | W12 |
| `god_hall` | 灯阁大厅 | W14 W20 W25 W32 W36 | W14 |

### Boss ↔ 世界

> 2026-10-03 起 **36 个世界的守关 Boss 全部有专属立绘**（原来只有六个卷末锚点）。


| 世界 | Boss | 文件 |
|---|---|---|
| **W01…W36（全部 36 个）** | 取 `WORLDS[].boss` | `story/boss/img_boss_W<nn>.png` |
| W06 轨道废土带 | 轨道主控 | `story/boss/img_boss_W06.png` |
| W12 蚀环远征 | 蚀冠之王 | `img_boss_W12.png` |
| W18 白墙疗养院 | 白衣院长 | `img_boss_W18.png` |
| W24 灰烬圣所 | 灰袍祭司 | `img_boss_W24.png` |
| W30 熔芯之炉 | 熔芯核心 | `img_boss_W30.png` |
| W36 灯阁王座 | 终焉·灯主 | `img_boss_W36.png` |

> 名字取 `WORLDS[].boss`，台词/身份取 `STORYDATA.ARC[wid].bossTrigger / bossRole`。
> 立绘没到位时**不再退成程序几何剪影**——不画人，场景照旧
> （父亲大人：「把之前占位用的图形删掉」）。

## 三、图标（程序化，不进包体）

| 资源 | 数量 | 生成物 | 真源 |
|---|---|---|---|
| 世界图标 | 36 | `js/assets-icons.js`（369 KB，路径 op） | `story/icons-src/*.svg` |
| 全局图标 | 24 | 同上 | 同上 |
| 五行 | 5 | `CV.GLYPHS` 私有区码位 U+E010~E014 | — |

老表（`NAV_ICONS` / `CUR_ICONS` / `WORLD_ICONS` / `BLOOD_GLYPH` / `FACTION_GLYPH`）**全部保留成 fallback**。

## 四、音频 / 其他

| 资源 | 路径 | 说明 |
|---|---|---|
| 背景音乐 | `audio/`（+用户提供的 mp3 已合成进 BGM） | `AUD` 无缝循环 |
| 音效 | 程序化合成（WebAudio） | 不进包体 |

## 五、资源加载的三态（R1.7 起的口径，**防闪屏**）

```
ready   → 正式素材（真图）
loading → 主题平底（CV.THEME_TINT，5 个主题；无几何、无旧光）——"画还没显影"，不是另一张画
failed  → 才走程序化保险（bgBase + bgStructure）
```

预热点：`game.js`（开机）、`sc-dungeon.js` 的 `w:*`（进世界）、`startStage()`（开打前）——
让 `loading` 那段尽量发生在玩家还没看到这一页的时候。

## 六、缺图时的降级（都不白屏）

| 缺什么 | 会发生什么 |
|---|---|
| 场景图 | 主题平底 → 程序化底（**不会黑屏、不会留白**） |
| Boss 立绘 | 出场序列只演文字（名字 + 台词 + 身份 + 机制行） |
| 主 KV | 首页回落 `CV.defaultVeil` 平色底 |
| 图标 op | 回落老表（`NAV_ICONS` 等）或 emoji 兜底 |
