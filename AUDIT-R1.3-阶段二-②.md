# R1.3 阶段二 ② · 六支 Audit 脚本 —— 进行中报告

版本 **1.0.5** · 本轮**只做 ②**（不碰 ③ 注释 / ④ 分享）

## 一、进度：**六支全部落地、都能独立跑**

- `scripts/audit_balance.js` ✅ **7 PASS / 2 WARN / 7 FAIL** · 退出码 1（FAIL 是真发现，见二）
- `scripts/audit_routes.js`  ✅ **3 PASS / 5 WARN / 0 FAIL / 0 BLOCKED** · 退出码 0
- `scripts/audit_pages.js`   ✅ **1 PASS / 1 WARN / 0 FAIL** · 退出码 0
- `scripts/audit_text.js`    ✅ **2 PASS / 0 FAIL** · 退出码 0
- `scripts/audit_data.js`    ✅ **10 PASS / 0 WARN / 0 FAIL** · 退出码 0
- `scripts/audit_release.js` ✅ **9 PASS / 1 WARN / 2 FAIL** · 退出码 1（总门如实拒绝放行）

`audit_release` 的两条 FAIL：① `audit_balance` 退出码非 0（它抓到的 7 处反向曲线，见二）；
② **调试残留**：`game.js` 里还留着另一个会话的**临时截图钩子**（源码里带 `[CE-SHOT]`）——
上传前必须清掉（本条只报、不改）。

公共层：`scripts/_env.js` —— 把游戏**真的**加载进 Node（假画布/假 wx；`data/core/battle/dungeon/cv`
与线上同一份代码）。加载失败一律 `BLOCKED`，**绝不当 PASS**。
`scripts/_report.js` —— 统一 `[PASS]/[WARN]/[FAIL]/[BLOCKED]` ＋ `RESULT/STATUS` ＋ 退出码。

任务书要求"六支都可独立运行" ⇒ **已满足**；但总门本身是 FAIL（上面两条），**不算通过发布门禁**。

## 二、`audit_balance` 的真发现

**① W12 → W13（任务书点名）—— 数字完全对上**

```
[WARN] W12 → W13：数值大幅跳变
  file: js/dungeon.js:64
  expected: 相邻世界倍率 ≤ 8x
  actual: HP 56.712x · ATK 55.4xx
  reason: 设计级异常候选，不自动判定为程序 Bug
```

并**交叉验过索引没串位**：56.712 ÷ `EASE_LATE[12]`(48.89) = 1.16（同量级）。
这条防的是"以后改数组索引，把 W13 读成 W14"。

**② 新发现：7 处反向曲线**（任务书 §三.3 判 FAIL 的那一类，生成值口径）

```
W27 → W28   HP 0.948x · ATK 0.943x
W28 → W29   HP 0.759x · ATK 0.753x
W29 → W30   HP 0.771x · ATK 0.767x
…（完整清单由脚本逐条打印）
```

来源：`EASE_LATE` 在这几档是**递减**的（W28=10.96 → W29=7.90 → W30=5.78）。
**本轮只钉事实、不改数据**（任务书 §十一）。

## 三、`audit_pages` 的 WARN（新发现，待核）

```
[WARN] 可能进不去：keji, fabao, mount, sign, roster
```

这几页的入口可能是**动态拼**的（`CV.push(t[0])` 之类），静态扫不到 ——
`audit_routes` 已按真路由核过 `corridor / arena / world / dungeon / bag` 这些主入口，**都通**；
这五页仍留给下一轮逐页点进去核（**不直接判死链**）。

## 三′、`audit_routes` 的真结果（3 PASS / 5 WARN）

真流程（入口 id、页面名、驱动方式照 `battle_return_audit` 那套，不另编 API）：

- ✅ ① 残域→世界→关卡→战斗→「收下奖励并返回」→ **回世界**
- ✅ ②b 连打第二场后返回 → **仍在世界页**
- ✅ ⑥ 副本打完一关出来：**栈深 ≥2**、吸顶 ‹ 真能回残域列表
- ✅ ⑦ 从背包页开一场（兜底路径）→ 回到背包
- ⚠️ WARN ×5：**页面对了，但 `CV.scroll` 没恢复**（深井 380→15.75、斗法台 380→0、失败返回 380→0 …）
  —— 任务书 §四点名"不能只看页面名"，这条**如实报出来，本轮不修**。

> 桩的两条教训（都写进脚本注释）：① **没造队伍**这场根本开不起来（第一版 3 条假 BLOCKED）；
> ② **引导是"真模态"**，会把 `dun_back` 这类点击吃掉 ⇒ 第一版报了条"点了 ‹ 没动"的**假 FAIL**，
> 摘掉引导后转 PASS。

## 四、审计自身的两条教训（已写进脚本注释）

1. **`D.RARITIES` 是 5 档（角色线）、`EQUIP_RARITIES` 才是 6 档（装备线，含 MYTH）**。
   第一版拿"六档"去要求 `RARITIES` ⇒ **假 FAIL**。现在两边各钉一条，并守住"别往 RARITIES 里塞 MYTH"。
2. **底栏 `tab:*` 的处理器由 `game.js` 开机注册**，而审计不加载 `game.js` ⇒
   第一版报 **204 个"死按钮"，全是假账**；补上那一行后变成 **0 个**。

## 五、本轮**没有**修改的东西

**业务代码一个字节没动**：只新增 `scripts/`（已在 `packOptions.ignore`，不进小游戏包）。
世界数值 / W13~W36 曲线 / 战斗公式 / 转生门 / Router / 返回链 / 云存档 / 掉落 / 经济 / 装备分解：全部未动。

## 六、下一步

1. `audit_routes.js`：`A → B → Battle → Result → Back`（含连打两场 / 失败 / 复活），
   验证 **stack ＋ scroll** 都恢复；**只查不改**；
2. `audit_release.js`：调前五支 ＋ 语法检查 ＋ 关键文件/页面/handler ＋ `packOptions.ignore` ＋ 调试残留；
3. 出最终版报告（六支各自 PASS/FAIL）。
