# 浏览器 API 审计（自动生成：node scripts/audit-web.js）

> 网页版是唯一标准。这里列出它用到的所有浏览器能力，以及小游戏里对应的替代方案。
> **结论先行**：逻辑层（data/core/battle/dungeon）**零 DOM 依赖**（有守卫用例），只有界面层 `ui.js` 用 DOM 与 CSS。

| 浏览器 API | 出现位置（文件×次数） |
| --- | --- |
| `window` | js/main.js×3 · js/core.js×2 · js/data.js×1 · js/battle.js×2 · js/dungeon.js×4 · js/ui.js×41 · scripts/test_game.js×6 · scripts/test_ui.js×11 |
| `document` | js/main.js×5 · js/ui.js×45 · scripts/test_ui.js×3 |
| `localStorage` | js/core.js×6 · scripts/test_game.js×1 · scripts/test_ui.js×1 |
| `navigator` | index.html×3 · js/ui.js×5 |
| `location` | index.html×1 · js/ui.js×3 · sw.js×1 |
| `history` | js/ui.js×2 |
| `confirm` | js/ui.js×2 |
| `setInterval` | js/main.js×1 · js/ui.js×1 · scripts/test_ui.js×1 |
| `setTimeout` | js/main.js×2 · js/ui.js×29 · scripts/test_ui.js×5 |
| `fetch` | scripts/test_ui.js×2 · sw.js×3 |
| `querySelector` | js/ui.js×111 · scripts/test_ui.js×6 |
| `getElementById` | js/main.js×1 · js/ui.js×18 · scripts/test_ui.js×1 |
| `innerHTML` | js/ui.js×17 · scripts/test_ui.js×45 |
| `classList` | js/ui.js×17 · scripts/test_ui.js×1 |
| `addEventListener` | index.html×1 · js/main.js×3 · js/ui.js×27 · scripts/test_ui.js×6 · sw.js×3 |
| `visibilitychange` | js/main.js×1 |
| `beforeunload` | js/main.js×1 · js/core.js×1 · scripts/test_game.js×1 |

## 替代方案（小游戏侧）

| 能力 | 网页版 | 小游戏替代 | 现状 |
| --- | --- | --- | --- |
| 全局对象 | window | `GameGlobal`（wx-adapter 把 window 指过去） | ✅ 已适配 |
| DOM 树 | document.createElement / innerHTML | 假 DOM（ce-dom：最小 DOM 树 + querySelector） | ✅ 已适配 |
| CSS 布局 | 浏览器 CSS 引擎 | style.css → 编译成引擎样式表（ce-style.js） | ✅ 已适配 |
| HTML → 渲染 | 浏览器渲染 | ce-html：HTML → 引擎标记；引擎负责画 | ✅ 已适配 |
| 存储 | localStorage | wx.getStorageSync / setStorageSync | ✅ 已适配 |
| 输入 | click 事件 | wx.onTouch* → 引擎命中 → 转成"点同一个节点" | ✅ 已适配 |
| 定时/动画 | requestAnimationFrame / setTimeout | 同名 API（wx 环境自带） | ✅ 一致 |
| 弹窗 | #modal-root（DOM） | 接住内容 → 引擎画成 sheet | ✅ 已适配 |
| 战斗画面 | #battle-root（DOM） | 接住内容 → 引擎画，内容变了重画 | ✅ 已适配 |
| 图片 / 音频 | <img> / <audio> | wx.createImage / InnerAudioContext | ⏳ 待迁移（当前界面基本纯文字+emoji） |
| fetch / XHR | 无（单机游戏） | — | 不需要 |
