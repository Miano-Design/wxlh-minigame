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
| 场景母版 | **12** | `story/scene/img_scene_<sceneId>.jpg` | `Story.bg()`（剧情页）/ `CV.veils.battle()`（战斗页）——**同一张图**，所以剧情→战斗视觉连续 |
| Boss 立绘 | **6** | `story/boss/img_boss_W<nn>.png` | 剧情页 Boss 层 + **战斗出场序列** `Story.bossImage()` |
| 图标源 SVG | 60 | `story/icons-src/`（`packOptions.ignore` 排除，不进包） | 由 `scripts/build-visual-assets.js` 编译 |

### 12 场景 ↔ 世界映射（`STORYDATA.SCENE`，一处真源）

| 场景 id | 母版名 | 用在哪些世界 |
|---|---|---|
| `bio_lab` | 培养舱走廊 | W01 W02 W23 |
| `bio_swamp` | 瘴气荒原 | W09 W10 W28 W33 |
| `bio_sea` | 沉海柱廊 | W16 |
| `ghost_house` | 旧宅内厅 | W03 W07 W15 |
| `ghost_town` | 雾中小镇 | W08 |
| `ghost_env` | 客轮内舱 | W05 W18 W21 |
| `ghost_wall` | 长明高墙 | W27 W31 |
| `tech_waste` | 轨道废土 | W06 W17 |
| `tech_base` | 机械纵深 | W19 W22 W26 W30 W34 |
| `mystic_ruins` | 石质遗迹 | W04 W11 W24 W29 W35 |
| `mystic_throne` | 冰雪王座 | W12 W13 |
| `god_hall` | 灯阁大厅 | W14 W20 W25 W32 W36 |

### 6 Boss ↔ 世界（六卷锚点）

| 世界 | Boss | 文件 |
|---|---|---|
| W06 轨道废土带 | 轨道主控 | `story/boss/img_boss_W06.png` |
| W12 蚀环远征 | 蚀冠之王 | `img_boss_W12.png` |
| W18 白墙疗养院 | 白衣院长 | `img_boss_W18.png` |
| W24 灰烬圣所 | 灰袍祭司 | `img_boss_W24.png` |
| W30 熔芯之炉 | 熔芯核心 | `img_boss_W30.png` |
| W36 灯阁王座 | 终焉·灯主 | `img_boss_W36.png` |

> 其余 30 个世界的守关 Boss **没有专属立绘**（原素材就没有），出场序列照常走：
> 名字取 `WORLDS[].boss`，台词/身份取 `STORYDATA.ARC[wid].bossTrigger / bossRole` —— **不画空框**。

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

