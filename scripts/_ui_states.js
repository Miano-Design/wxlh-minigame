/* 尺子共用的一张小表：**"同一个页名 + 多个状态"的界面**。
   ------------------------------------------------------------------------------
   为什么需要它（V1.1.7 · 康康 2026-09-26 抓到的真死键 `bag_expand:equip`）：
     画布界面里，"页"是 `CV.panels[name]`，可**同一页名底下可以有好几个状态**
     （背包的「道具 / 装备」、商店的四家店、灯录的两卷…）——这些状态靠一个**模块级变量**切换
     （`view` / `shopTab` / `codexVol`），切换用的热区是 `CV.on('bagview:equip')` 这种。
     而 `tap_audit` 是"对每个页名 `CV.reset(page)` 一次、收一次热区"→ **永远只扫到第一个状态**。
     装备页那颗「＋（扩容）」就是这么漏掉的：它只在 `view === 'equip'` 时才登记，
     而那一页在尺子里从来没被切到过。

   用法（两把尺子都读它，不许各写一份）：
     const STATES = require('./_ui_states');
     STATES.forEach((e) => { e.via.forEach((id) => CV.dispatch(id)); ...再收热区... });

   字段：
     page    —— 页名（CV.reset(page) 用的那个）
     via     —— **进入这个状态要派发的热区 id**（就是玩家会点的那一颗颗）
     why     —— 一句话说明这几个状态差在哪（回单/排查时看得懂）
   ⚠️ **新写一个"带标签页 / 筛选 / 多卷"的页面时，把它的状态加进这张表** ——
      否则两把尺子都只会扫到它的第一个状态（这正是那只死键的成因）。
      加完后跑 `node scripts/hit_handler_audit.js`：**它会告诉你这张表本身有没有过期**
      （表里写的 hotkey 从没被登记过 → 报"表过期"，不会静默跳过）。 */
module.exports = [
  { page: 'bag', via: ['bagview:item', 'bagview:equip'],
    why: '背包两个标签：道具（并池后含材料）/ 装备 —— 扩容格、批量分解、两行分类都只在装备那一版里' },
  { page: 'bag', via: ['bagview:equip', 'ecat:world', 'ecat:blood', 'ecat:god', 'ecat:sig'],
    why: '装备页的"分类"筛选（全部/世界/命格/神装/专属）—— 筛完格子数变少、末尾扩容器跟着变' },
  { page: 'bag', via: ['bagview:equip', 'efilter:weapon', 'efilter:armor', 'efilter:head', 'efilter:hands', 'efilter:legs', 'efilter:accessory'],
    why: '装备页的"部位"筛选（6 个部位各一版）' },
  { page: 'shop', via: ['shoptab:god', 'shoptab:otherworld', 'shoptab:story', 'shoptab:corridor'],
    why: '兑换大厅四家店：货架条目完全不同（`buy:0`…`buy:14` 的下标只在某一家里存在）' },
  { page: 'codex', via: ['codexvol:chars', 'codexvol:equips'],
    why: '灯录两卷：伙伴卷 / 装备卷' },
  { page: 'world', via: ['w:W01', 'diff:hard', 'diff:hell'],
    why: '世界详情三个难度页签（`stage:*` 的可用状态、扫荡入口都随难度变）' },
];
