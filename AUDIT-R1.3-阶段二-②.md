# R1.3 阶段二 ② · 六支 Audit 脚本 —— 进行中报告

版本 **1.0.5** · 本轮**只做 ②**（不碰 ③ 注释 / ④ 分享）

## 一、进度：六支完成四支（**不声称通过验收**）

- `scripts/audit_balance.js` ✅ 能独立跑 · **7 PASS / 2 WARN / 7 FAIL** · 退出码 1
- `scripts/audit_data.js`    ✅ 能独立跑 · **10 PASS / 0 WARN / 0 FAIL** · 退出码 0
- `scripts/audit_text.js`    ✅ 能独立跑 · **2 PASS / 0 FAIL** · 退出码 0
- `scripts/audit_pages.js`   ✅ 能独立跑 · **1 PASS / 1 WARN** · 退出码 0
- `scripts/audit_routes.js`   ❌ **未写**（返回链专项）
- `scripts/audit_release.js`  ❌ **未写**（总门）

公共层：`scripts/_env.js` —— 把游戏**真的**加载进 Node（假画布/假 wx；`data/core/battle/dungeon/cv`
与线上同一份代码）。加载失败一律 `BLOCKED`，**绝不当 PASS**。
`scripts/_report.js` —— 统一 `[PASS]/[WARN]/[FAIL]/[BLOCKED]` ＋ `RESULT/STATUS` ＋ 退出码。

任务书要求"六支都可独立运行" ⇒ **本阶段未达**，只交付 4/6。

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
下一轮由 `audit_routes` 按真路由核一遍；不排除是审计盲区。

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
