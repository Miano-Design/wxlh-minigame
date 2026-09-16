/* 阶段 1 审计（不改任何网页版代码）：node scripts/audit-web.js
   把网页版当唯一标准，从它的代码里**自动抽取**迁移所需的清单，产出 docs/*.md。
   目的：不靠人回忆、不靠 AI"重新设计"，所有页面/按钮/规则/存档字段都来自源码本身。
   重跑这个脚本 = 重新审计（网页版改了以后必跑）。 */
const fs = require('fs');
const path = require('path');
const WEB = path.resolve(__dirname, '../../wxlh-game');
const OUT = path.resolve(__dirname, '../docs');
const read = (f) => fs.readFileSync(path.join(WEB, f), 'utf8');
const line = (s) => s.replace(/\s+/g, ' ').trim();

const ui = read('js/ui.js');
const core = read('js/core.js');
const data = read('js/data.js');
const css = read('css/style.css');
const indexHtml = read('index.html');

const files = {};
['index.html', 'css/style.css', 'js/main.js', 'js/core.js', 'js/data.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js', 'scripts/test_game.js', 'scripts/test_ui.js', 'manifest.webmanifest', 'sw.js']
  .forEach((f) => { try { files[f] = read(f); } catch (e) {} });

/* ---------- ① 浏览器 API 审计 ---------- */
const APIS = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'alert', 'confirm', 'prompt',
  'requestAnimationFrame', 'setInterval', 'setTimeout', 'Image', 'Audio', 'fetch', 'XMLHttpRequest', 'DOMParser',
  'querySelector', 'getElementById', 'innerHTML', 'classList', 'addEventListener', 'visibilitychange', 'beforeunload'];
function apiAudit() {
  const rows = [];
  APIS.forEach((api) => {
    const hit = [];
    Object.keys(files).forEach((f) => {
      const txt = files[f];
      const re = new RegExp('\\b' + api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      const n = (txt.match(re) || []).length;
      if (n) hit.push(`${f}×${n}`);
    });
    if (hit.length) rows.push(`| \`${api}\` | ${hit.join(' · ')} |`);
  });
  return rows.join('\n');
}

/* ---------- ② 功能清单：页面 + 动作 + 弹窗 ---------- */
function featureInventory() {
  // 页面：注册的屏幕 + 导出的界面函数
  const scr = (ui.match(/_screens: \{[^}]*\}/) || [''])[0];
  const screens = [...new Set([...scr.matchAll(/(\w+Screen)\b/g)].map((m) => m[1]))];
  const subScreens = [...new Set([...ui.matchAll(/function (\w*(?:Screen|List|Detail))\s*\(/g)].map((m) => m[1]))];
  const panels = (ui.match(/_panels: \{[\s\S]*?\n    \},/) || [''])[0];
  const panelNames = [...panels.matchAll(/(\w+)[,:]/g)].map((m) => m[1]).filter((x) => x.length > 2);
  // 动作：bindScreen 里 switch(act) 的 case
  const cases = [...ui.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]);
  // 界面里真正发出来的 data-act
  const acts = [...new Set([...ui.matchAll(/data-act="([a-z0-9-]+)"/g)].map((m) => m[1]))];
  // 所有弹窗/面板函数
  const modalFns = [...new Set([...ui.matchAll(/function (\w*(?:Modal|Panel|Detail|Html))\s*\(/g)].map((m) => m[1]))];
  return { screens: [...new Set(screens.concat(subScreens))], panelNames: [...new Set(panelNames)], cases: [...new Set(cases)], acts, modalFns };
}

/* ---------- ③ 存档结构 ---------- */
function saveSchema() {
  const ds = (core.match(/function defaultState\(\)[\s\S]*?\n  \}/) || [''])[0];
  const keys = [...ds.matchAll(/^\s{6}([a-zA-Z_]\w*)\s*:/gm)].map((m) => m[1]);
  const meta = [...ds.matchAll(/^\s{6}([a-zA-Z_]\w*)\s*:\s*([^,\n]+)/gm)].map((m) => `| \`${m[1]}\` | \`${line(m[2]).slice(0, 44)}\` |`);
  const saveKeys = [...core.matchAll(/SAVE_KEY = '([^']+)'|localStorage\.(getItem|setItem|removeItem)\(([^)]*)\)/g)].map((m) => line(m[0]));
  return { keys, meta: meta.join('\n'), saveKeys: [...new Set(saveKeys)] };
}

/* ---------- ④ 规则索引（函数即规则） ---------- */
function ruleIndex(src, name) {
  const fns = [...src.matchAll(/^  function (\w+)\(/gm)].map((m) => m[1]);
  return { name, count: fns.length, fns };
}

const feat = featureInventory();
const save = saveSchema();
const rules = [ruleIndex(core, 'core.js'), ruleIndex(data, 'data.js'), ruleIndex(files['js/battle.js'] || '', 'battle.js'), ruleIndex(files['js/dungeon.js'] || '', 'dungeon.js')];

fs.writeFileSync(path.join(OUT, 'BROWSER_API_AUDIT.md'), `# 浏览器 API 审计（自动生成：node scripts/audit-web.js）

> 网页版是唯一标准。这里列出它用到的所有浏览器能力，以及小游戏里对应的替代方案。
> **结论先行**：逻辑层（data/core/battle/dungeon）**零 DOM 依赖**（有守卫用例），只有界面层 \`ui.js\` 用 DOM 与 CSS。

| 浏览器 API | 出现位置（文件×次数） |
| --- | --- |
${apiAudit()}

## 替代方案（小游戏侧）

| 能力 | 网页版 | 小游戏替代 | 现状 |
| --- | --- | --- | --- |
| 全局对象 | window | \`GameGlobal\`（wx-adapter 把 window 指过去） | ✅ 已适配 |
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
`);

fs.writeFileSync(path.join(OUT, 'WEB_FEATURE_INVENTORY.md'), `# 网页版功能清单（自动生成：node scripts/audit-web.js）

> 从 \`js/ui.js\` 源码里抽取。**每一行都对应网页版真实代码**，不是 AI 回忆。
> 迁移时逐项打勾；**未迁移的必须显式标记"待迁移"，禁止静默删除**。

## 1. 页面（界面函数）

共 ${feat.screens.length} 个注册页 + ${feat.panelNames.length} 个面板/弹窗函数。

### 主页面
${feat.screens.map((s) => `- \`${s}\``).join('\n')}

### 面板 / 弹窗（每一个都是网页版真实存在的二级界面）
${feat.modalFns.map((s) => `- \`${s}\``).join('\n')}

## 2. 可点元素（data-act）

网页版界面里实际发出的动作共 **${feat.acts.length}** 个：

${feat.acts.map((a) => `- \`${a}\``).join('\n')}

## 3. 动作处理分支（\`bindScreen\` 里的 case）

共 **${feat.cases.length}** 个分支：

${feat.cases.map((a) => `- \`${a}\``).join('\n')}

## 4. 迁移状态表（逐项填写，禁止留空）

| 功能 | 网页版位置 | 小游戏位置 | 状态 |
| --- | --- | --- | --- |
${feat.acts.map((a) => `| \`${a}\` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |`).join('\n')}
`);

fs.writeFileSync(path.join(OUT, 'WEB_SAVE_SCHEMA.md'), `# 网页版存档结构（自动生成：node scripts/audit-web.js）

> 唯一标准 = \`js/core.js\` 的 \`defaultState()\` 与读写函数。小游戏**必须复用同一份 core.js**（逐字节同步），
> 所以存档结构天然一致；这里列出字段清单，供迁移时核对"有没有漏字段"。

## 存档键
${save.saveKeys.map((k) => `- \`${k}\``).join('\n')}

## defaultState() 顶层字段（共 ${save.keys.length} 个）
${save.keys.map((k) => `- \`${k}\``).join('\n')}

## 字段与默认值
| 字段 | 默认值 |
| --- | --- |
${save.meta}
`);

fs.writeFileSync(path.join(OUT, 'WEB_GAME_RULES.md'), `# 网页版玩法规则索引（自动生成：node scripts/audit-web.js）

> 规则**只有一份**：\`js/data.js\`（数值/概率/配置）+ \`js/core.js\`（状态与经济）+ \`js/battle.js\`（战斗）+ \`js/dungeon.js\`（关卡）。
> 小游戏通过 sync-logic.js **逐字节同步**这四个文件，因此规则天然一致——**禁止在界面层实现任何规则**。
> 本文件是"规则地图"：想改哪条规则，去对应的函数；界面层只准调用它们。

| 文件 | 函数数 |
| --- | --- |
${rules.map((r) => `| \`${r.name}\` | ${r.count} |`).join('\n')}

## core.js 全部函数（状态 / 经济 / 养成 / 存档）
${rules[0].fns.map((f) => `- \`Core.${f}()\``).join('\n')}

## battle.js 全部函数（战斗回合与结算）
${rules[2].fns.map((f) => `- \`Battle.${f}()\``).join('\n')}

## dungeon.js 全部函数（关卡 / 掉落 / 难度）
${rules[3].fns.map((f) => `- \`Dungeon.${f}()\``).join('\n')}
`);

console.log('审计文档已生成到 docs/：');
fs.readdirSync(OUT).forEach((f) => console.log('  -', f));
