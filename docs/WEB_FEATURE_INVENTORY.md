# 网页版功能清单（自动生成：node scripts/audit-web.js）

> 从 `js/ui.js` 源码里抽取。**每一行都对应网页版真实代码**，不是 AI 回忆。
> 迁移时逐项打勾；**未迁移的必须显式标记"待迁移"，禁止静默删除**。

## 1. 页面（界面函数）

共 18 个注册页 + 74 个面板/弹窗函数。

### 主页面
- `homeScreen`
- `dungeonScreen`
- `rosterScreen`
- `bagScreen`
- `partyScreen`
- `charsScreen`
- `equipScreen`
- `growScreen`
- `worldsList`
- `worldDetail`
- `runScreen`
- `corridorScreen`
- `protagonistDetail`
- `charDetail`
- `bagEquipList`
- `equipDetail`
- `itemDetail`
- `bindScreen`

### 面板 / 弹窗（每一个都是网页版真实存在的二级界面）
- `closeModal`
- `updateModal`
- `showPanel`
- `currencyModal`
- `guideModal`
- `codexModal`
- `worldDetail`
- `sweepModal`
- `partyHpHtml`
- `potionBarHtml`
- `protagonistDetail`
- `charGridHtml`
- `charDetail`
- `equipDetail`
- `recruitModal`
- `recruitRatesModal`
- `ssrPickModal`
- `shopModal`
- `buildingsModal`
- `gardenModal`
- `arenaModal`
- `fabaoModal`
- `mountModal`
- `signModal`
- `bloodlineModal`
- `sectModal`
- `travelModal`
- `kejiModal`
- `authorityModal`
- `idleLinesModal`
- `bountyModal`
- `beastModal`
- `realmModal`
- `weeklyHtml`
- `achHtml`
- `tasksModal`
- `geneLockModal`
- `reincarnModal`
- `lootPanel`
- `bagModal`
- `itemDetail`
- `refineModal`
- `settingsModal`
- `autoNextBtnHtml`
- `unitHtml`
- `gmModal`

## 2. 可点元素（data-act）

网页版界面里实际发出的动作共 **18** 个：

- `open-travel`
- `claim-quest`
- `goto-quest`
- `open-idlelines`
- `claim-all`
- `open-corridor`
- `back-worlds`
- `open-sweep`
- `abandon-run`
- `fight-corridor`
- `open-corridor-shop`
- `auto-equip`
- `open-recruit`
- `open-codex`
- `open-realm`
- `open-bloodline`
- `open-guide`
- `open-curdoc`

## 3. 动作处理分支（`bindScreen` 里的 case）

共 **50** 个分支：

- `round`
- `attack`
- `skill`
- `damage`
- `dot`
- `heal`
- `shield`
- `dodge`
- `skip`
- `buff`
- `phase`
- `revive`
- `summon`
- `rule`
- `open-recruit`
- `claim-all`
- `open-shop`
- `open-buildings`
- `open-authority`
- `open-sect`
- `open-keji`
- `open-travel`
- `open-bloodline`
- `open-garden`
- `open-refine`
- `open-arena`
- `open-fabao`
- `open-mount`
- `open-sign`
- `open-tasks`
- `open-genelock`
- `open-reincarn`
- `open-idlelines`
- `open-bounty`
- `open-realm`
- `open-beast`
- `open-settings`
- `claim-quest`
- `goto-quest`
- `open-guide`
- `open-codex`
- `open-curdoc`
- `open-ach`
- `auto-equip`
- `open-corridor`
- `open-corridor-shop`
- `fight-corridor`
- `back-worlds`
- `abandon-run`
- `open-sweep`

## 4. 迁移状态表（逐项填写，禁止留空）

| 功能 | 网页版位置 | 小游戏位置 | 状态 |
| --- | --- | --- | --- |
| `open-travel` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `claim-quest` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `goto-quest` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-idlelines` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `claim-all` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-corridor` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `back-worlds` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-sweep` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `abandon-run` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `fight-corridor` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-corridor-shop` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `auto-equip` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-recruit` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-codex` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-realm` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-bloodline` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-guide` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
| `open-curdoc` | ui.js 的 data-act | ce-app 点击派发 → 网页版处理函数 | ✅ 机制已通（待逐项验收） |
