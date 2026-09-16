# 网页版 UI 结构（骨架 + 生成方式）

> 唯一标准 = 网页版 `index.html` + `css/style.css` + `js/ui.js`。
> 小游戏里**不允许自行设计界面**；本文件的用途是"逐页对照清单"。

## 1. 外壳（index.html）

```
#app
├── header#topbar           顶栏（玩家行 + 货币行 #curbar）
├── main#view               正文（换页只换这里的内容，.screen 包一层）
└── nav#navbar              底部 4 格：灯阁 / 残域 / 执灯者 / 背包
#modal-root                 弹窗层（二级页 .page / 居中确认框 .sheet.center）
#toast-root                 提示
#battle-root                战斗层（整屏覆盖）
```

## 2. 页面层级（从 ui.js 抽取，详见 WEB_FEATURE_INVENTORY.md）

- 一级（底部导航 4 个）：`homeScreen` / `dungeonScreen` / `rosterScreen` / `bagScreen`
- 二级（页内切换）：`partyScreen` / `charsScreen` / `growScreen`（执灯者）、`equipScreen`（背包）
- 三级（`showPanel` 打开的整页面板）：图鉴 / 商店 / 任务 / 成就 / 签到 / 建筑 / 科技 / 悬赏 /
  竞技场 / 法宝 / 坐骑 / 花园 / 游历 / 深井 / 转生 / 天赋 / 设置 / 存档 / 概率公示 …
- 弹窗：确认框（`.sheet.center`）、招募结果、道具详情、装备详情…

## 3. 组件（CSS 类名 → 语义）

| 组件 | 类名 | 状态 |
| --- | --- | --- |
| 卡片 | `.card` / `.panel` | 普通 / `.plain` |
| 顶栏货币 | `.cur-chip` | 普通 / `.more` |
| 底部导航 | `.nav-item` | 普通 / `.active`（含红点 `.dot`） |
| 主标签（矩形吸顶） | `.tab-cards` / `.tab-card` | 普通 / `.active` |
| 胶囊标签 | `.pill` / `.pill.sm` | 普通 / `.active`（分类小一号） |
| 文字宫格入口 | `.text-menu` / `.tile`（`.tt-name`/`.tt-sub`） | 普通 / `.locked` |
| 列表行 | `.list-row`（`.grow`/`.t1`/`.t2`/`.tag`） | 普通 / `.sel` / `.no-sel` |
| 属性行 | `.text-rows .row`（`.rk`/`.rv`/`.rs`）/ `.kv` | `.static`（不可点） |
| 按钮 | `.btn` | `.primary` / `.gold` / `.ghost` / `.small` / `.block` / `[disabled]` |
| 进度条 | `.bar`（`.hp` `.energy` `.exp`，`.txt` 内嵌文字） | 低血 `.hp.low` |
| 背包格 | `.bg-slot`（`.bg-name`/`.bg-count`） | `.filled` / `.sel` / `.no-sel` / `.add`（扩容） |
| 装备格 | `.eq-tile`（`.eq-name`/`.eq-brief`） | 空槽 `.off` |
| 角色卡 | `.char-card`（`.avatar`/`.cname`/`.cmeta`/`.inparty`） | 稀有度 `.rarity-N/R/SR/SSR/UR` |
| 队伍格 | `.pslot` | `.filled` / `.protag-slot` / `.grabbing` / `.drop-target` |
| 弹窗 | `.page`（二级整页）/ `.sheet.center`（确认框） | 遮罩 `.modal-mask` |
| 战斗 | `.b-field` / `.b-row` / `.unit`（`.u-avatar`/`.u-name`/`.u-hp`）/ `.floater` | `.dead` / `.acting` / `.boss` |
| 空状态 | `.empty` | — |
| 提示 | `#toast-root .toast` | — |

## 4. 状态清单（每个组件都要支持）

正常 / 按下（`:active`）/ 禁用（`[disabled]`、`.locked`）/ 选中（`.active`、`.sel`）/
锁定（`.locked`、`.off`）/ 空（`.empty`）/ 加载（战斗结算）/ 错误（红色 toast）/
安全区域（`env(safe-area-inset-*)`）。

## 5. 逐页结构（待补，方法已定）

每一页的"元素树 + 坐标"用两个工具导出后对照，不靠肉眼：
1. 网页版：`node scripts/audit-web.js` 生成的清单 + `_cmp.html`（浏览器里导出真实坐标）；
2. 小游戏版：`node /tmp/ce-dump.js <页名>`（引擎布局坐标）；
3. 差值表：总偏差越小越接近，当前首页 **2680**（目标 < 1000）。
