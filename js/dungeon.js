/* 《残域》副本/关卡/深井：敌人编成、路线生成、奖励 */
window.Dungeon = (function () {
  const D = window.DATA;
  /* ================= V1.1.15（2026-09-27 · 父亲大人："现在的背包的待领箱有 bug"）=================
     **掉落统一出口**。这一文件原来 17 处全写成 `if (Core.addItem(...)) got.push(...)` ——
     背包满时那一行**什么都不做**：不进背包、不进待领箱、结算页也不列。
     玩家打了一关只看到"什么都没掉"，待领箱里也永远收不到副本掉的东西（掉落凭空蒸发）。
     现在统一走这个口：**装得下 → 进背包；装不下 → 进待领箱**，并照样列进结算（多一个 `stashed` 标）。
     ⚠️ 这条规矩与 core.js 的 `applyRewardObj`（任务/悬赏/图鉴奖励）同源：
        "宁可少收也不吞" —— 凡是要发给玩家的东西，都不许在容量这一步消失。 */
  function dropItem(got, id, n) {
    const num = Math.max(1, Math.round(n || 1));
    if (Core.addItem(id, num)) { got.push({ k: 'item', v: id, n: num, stashed: false }); return true; }
    if (Core.stashItem) Core.stashItem(id, num);
    got.push({ k: 'item', v: id, n: num, stashed: true });
    return false;
  }
  /* 世界主题 → 敌人阵营（V9.6.86 跟着阵营改地名） */
  const THEME_FACTION = { bio: '灰原', ghost: '幽都', mystic: '雾乡', tech: '锈港', god: null };

  function diffMult(diff) { return (D.DIFFICULTY.find(d => d.id === diff) || D.DIFFICULTY[0]).mult; }
  function rewardMult(diff) { return (D.DIFFICULTY.find(d => d.id === diff) || D.DIFFICULTY[0]).rewardMult; }
  /* V9.5.64（父亲大人：副本前期太难、没几关就卡）——
   关卡成长从 1.16 放到 1.13；攻击曲线也从 1.10 放到 1.085（见 makeEnemies）。
   V1.0.1（父亲大人："整体难度都调整一下，现在主角单挂都能直接平推到十关十一关"）：
   1.13 这一档被压过头了 —— 第 12 关的敌人只比第 1 关强 4.3 倍，成长太缓。
   V1.0.1 修正（product_audit 会诊，注意别再往这块注释里插 /★ ★/ —— 嵌套注释会提前闭合）：
   原文写"第 12 关强 5.4 倍"是按 1.15^12 算的，而公式是 stageMult(stage) = 1.15^(stage-1)
   → 第 12 关 4.65 倍；同一文件第 91 行也写着 4.65×，两句话打架，以公式为准。
   提到 1.15（第 12 关强 4.65 倍），前期手感由上面的 EASE 单独管，两边不打架。 */
function stageMult(stage) { return Math.pow(1.15, stage - 1); }

  // 生成一场战斗的敌人
  function makeEnemies(worldId, diff, stage, kind) {
    const w = D.WORLDS.find(x => x.id === worldId);
    const wi = D.WORLDS.indexOf(w);
    /* V9.5.91（父亲大人："前期的副本还是有点难了，可以再降一点"）——
       实测（3 人裸装、普通难度）看清了病灶：**压力全压在守关 BOSS 上**。
       前 11 关 Lv.3 就能过，第 12 关却要 W02 Lv.11 / W03 Lv.16 / W04 Lv.27 / W05 Lv.50，
       而且失败是 12~15 回合被**打死**（不是打不动）。
       所以给前六个世界一个 0.60→0.95 的平滑系数（第 7 个世界起完全不动）：
       敌人 HP 与攻击都乘它，守关 BOSS 自己那份也一样乘 —— 目标是把"守关"从
       前面关卡的 2.6~3.0 倍压到 1.3~1.6 倍，前期不再在最后一关突然变成墙。 */
    /* V1.0.1（父亲大人）：原 0.26 起太软，敌人 HP/攻击只有两三成 —— 开局一刀一个、主角单挂能平推到 10~11 关。整体抬起，第一关落在一只手数得过来的回合数。
       V1.1.9（续13 · P0-2）：**EASE[0] 0.75 → 0.90**（父亲大人拍板「1 改＝P0 四项全改」）。
       依据＝报告 §五 5.2／§八 8.2：`balance_check` 实测 **W01 第 1/2 关 1 回合就结束** ——
       玩家还没看到战斗系统（技能 / 连击 / 状态一个都没展示）就过关了，新手前 10 分钟的教学价值被浪费。
       改后第 1 关落在 **2~3 回合**。 */
    const EASE = [0.90, 0.78, 0.82, 0.86, 0.90, 0.95, 1.0];
    /* ================= V1.1.9（续13 · P0-1 拆 5 道硬墙 ＋ P0-2 压平两处陡段）=================
       起因（报告 §五 5.1，本轮最重的一条）：`world_curve` 满配档（每条线点到上限的账号）
       复核出 **W29 / W33 / W34 / W35 / W36 五个世界满配也打不穿 —— 真硬墙**。
       为什么必须改：这五张图是**全部成长线的前置** → 一条墙同时卡死三条线 ——
         ① **铭刻**（`longrun_sim 90` 实测：铭刻卡在"通关 W17"，玩家卡在 W16）；
         ② **世界首通 ✦**（主要来源）；
         ③ **境界 / 评级**（评级经验来自推进）。
       同时压平两处陡段（报告 §五 5.2）：W14→W15 常规档**多练 15 级**、W16→W17 **多练 30 级**
       （相邻世界的落差应在 5 级内）。
       数值怎么来的：**按"满配能过 ＋ 30% 余量"用 `world_curve` 满配档现场反解**
       （world_curve 结尾的"余量"一栏就是这个判据的读数），不是拍脑袋；
       改动后的读数（常规档所需等级 / 满配余量）逐条贴在回单里。
       ⚠️ 这张表**只给第 7 个世界之后**用（前 6 个世界仍走上面的 EASE，两段互不影响）；
          key 是**世界下标**（W15 = 14 … W36 = 35）。 */
    const EASE_LATE = {
      /* ---------- H2 轮（2026-09-27 父亲大人拍板【收】）：把 W13~W17 的白给区一起收 ----------
         父亲大人看了 H 轮回单 §六 ③（"白给区其实从 W13 就起"）之后拍板收。

         ⚠️ 真值是**用探针把刻度上限抬到 16 才读出来的**（官方尺子上限 3.00，这一段的读数
            本来全是"≥3.00"的假天花板）：**W13 15.60 / W14 12.25 / W15 10.40(血)·9.85(血攻) /
            W16 8.75·8.95 / W17 8.20** —— 比拍板时以为的"≥3.50"还高 2.5~4.5 倍。
         算式沿用 H 轮：`新 ease = 旧 ease × 改前真余量 ÷ 目标余量`（余量 ∝ 1/ease）。
         W15 / W16 两栏不同（攻击成长比血量缓），所以 **f 取两栏的交集中点**，
         保证**血 / 血攻两栏都落在 1.30~1.45 内**（不是只看一栏）：
           W15 f∈[1.30/9.85, 1.45/10.40]=[0.1320, 0.1394] → 取 0.1357
           W16 f∈[1.30/8.75, 1.45/8.95]=[0.1486, 0.1620] → 取 0.1553

         ⚠️ **必须记住的后果（回单 §六 已单列，不是附注）**：这三张图原来被 0.95 / 0.82 / 0.70
            压软过（那是上一轮为了压平"W14→W15 多练 15 级 / W16→W17 多练 30 级"特意做的），
            现在整段反向抬起 → **W12→W13 会出现一道约 11 倍的敌人强度断崖**
            （W12 常规档 Lv.5、W13 常规档将变成 `>Lv.100`）。
            根因是"余量对齐"这条判据**只在末段成立**：满配号的强度远高于 W13 这类图的设计强度，
            硬把余量压到 1.40 ＝ 把中段也变成"要满配"。平滑的做法是从白给区真正的起点
            （W08 甚至更前）一路斜坡上去，那要动 W08~W12 —— **父亲大人本轮没批，没动。** */
      12: 11.14,  // W13 寒冠王座：15.60 → 目标 1.40（旧 ease 1.00 = 这条表原来没设它）
      13: 8.75,   // W14 灯阁试炼场：12.25 → 1.40（旧 1.00）
      14: 6.90,   // W15 绯月旧堡：10.40 / 9.85 → 1.40 / 1.35（旧 0.95）
                  //   ⚠️ 这张图的两栏读数差 0.55，而余量刻度是 0.05 一档 → 能落进的格子很粗：
                  //   ease 7.00 → 1.35 / 1.30（血攻贴下界）、6.75 → 1.45 / 1.35（血贴上界）；
                  //   取中间 6.90，两栏都离开边界、且都在 1.30~1.45 内。
      15: 5.28,   // W16 沉海废墟：8.75 / 8.95 → 1.36 / 1.39（旧 0.82）
      16: 4.10,   // W17 蜂群主控：8.20 → 1.40（旧 0.70）
      /* ================= H 轮（2026-09-27 · 后期难度"两头"重画）=================
         起因：`world_curve` 量余量那句原来写死 `k <= 1.6001` —— **1.60 是刻度上限，不是余量**。
         上限抬到 3.00 之后，"W18~W25 白给"这句才露出真身：**W18 的真实余量是 3.10**，一路递减到
         W25 的 1.50。所以上一轮"给 wi 17~24 加 ease 1.15、读数一个没动"**不是这张表不管用**，
         而是**读数被 1.60 封顶盖住了**（3.10 ÷ 1.15 仍 > 1.60，屏幕上照旧写 1.60）。
         —— 这是"没有真实读数之前不许动难度"的下半句：**读数还得先确认它没被自己的刻度骗了**。
         手段为什么选这一层（不是 `stageMult` 的后期段，也不是 `data.js` 的世界基准）：
           · 目标是**按图**调（W18~W25 一组、W32~W36 另一组）→ `stageMult` / `diffMult` 是**全局**的，
             一改会把前六个世界一起抬上去（那六关的门槛已经贴到 85 / 95 的天花板，动一下必红）→ 层不对；
           · `data.js` 的 w.hp / w.atk / w.def 是**世界自身的"基准强度"**，36 张图共享一条被断言锁住
             （`test_game` 验单调）的成长形状；把 W18 的基准乘 2.2 ＝ 把它挪进 W27~W29 的数值区间，
             以后再没人看得出"这张图本来是第 18 张"→ 表示层不干净；
           · `ease` 本来就是**"这张图相对基准的难度系数"**，值 >1 ＝ 在基准之上再加硬，语义天然吻合。
         数值怎么来的：**ease ＝ 改前真实余量 ÷ 目标余量**（余量 ∝ 1/ease，两栏同源）。
         目标取甜区中点 **1.40**（W18 记 3.10 → 3.10/2.20 ＝ 1.41；其余逐条见行末）。
         改后读数（血 / 血攻两栏）按同一把尺子复跑，已贴进回单。 */
      17: 2.20,   // W18 白墙疗养院：余量 3.10 → ~1.41（白给区起点，抬得最狠）
      18: 2.05,   // W19 星骸遗址：2.85 → ~1.39
      19: 1.93,   // W20 灯阁回廊：2.70 → ~1.40
      20: 1.54,   // W21 无声戏院：2.15 → ~1.40
      21: 1.29,   // W22 锈蚀方舟：1.80 → ~1.40
      22: 1.39,   // W23 巢母孵化间：1.95 → ~1.40（**注意：它是"常规档 Lv.90 就能过"的世界**，
                  //   抬它等于把 W23 也推进"要满配"那一档 —— 代价在回单里单列）
      23: 1.25,   // W24 灰烬圣所：1.75 → ~1.40（同上：常规档 Lv.100）
      24: 1.07,   // W25 镜界法庭：1.50 → ~1.40（第 3 道转生门，只按余量收，不再往上抬）
      28: 0.75,   // W29 第九碑庭：硬墙（−25%）
      30: 0.75,   // W31 回音之墙：**报告漏列的第 6 道墙**（同一把尺子同一判据下，满配也打不穿）——
                  //   而且它是**第 4 道转生门**（W31 需要转生 4 次），堵在这儿等于堵住最后一道门。
                  //   证据：改前 `world_curve` 满配复核里它写的是"满配 + 1 次复活 打得穿"
                  //   （＝不许复活时打不穿），与报告 §5.1 点名的 5 道墙同一种表现。回单里单列。
                   //   余量 1.20，在甜区内，本轮不动。
      31: 0.83,   // W32 万灯之座：改前"不许复活打不穿"（尺子读不出：它要 k≥1.05 才有的量，
                  //   按同一把尺子的线性关系反推 ≈0.91，比 1.00 更糟）→ 抬到 ~1.10
      32: 0.68,   // W33 吞噬环带：1.00（零容错）→ ~1.10
      33: 0.75,   // W34 时序废墟：1.10（已达标，不动）
      34: 0.68,   // W35 九幽渡口：1.00（零容错）→ ~1.10（**康康那张表漏列的第 7 处**，与 W32/W33 同一种表现）
      35: 0.66,   // W36 灯阁王座：改前"不许复活打不穿"（同上，反推 ≈0.97）→ 抬到 ~1.10
    };
    const ease = wi < EASE.length ? EASE[wi] : (EASE_LATE[wi] === undefined ? 1 : EASE_LATE[wi]);
    const m = diffMult(diff) * stageMult(stage) * ease;                // HP 用满倍率（V5 §51）
    const mAtk = diffMult(diff) * Math.pow(1.085, stage - 1) * ease;   // 攻击放缓（V9.5.64 再放缓一档）
    const mDef = diffMult(diff) * Math.pow(1.06, stage - 1);           // 防御放缓，避免伤害坍缩
    const faction = THEME_FACTION[w.theme];
    const mk = (name, hp, atk, def, opts) => Object.assign({
      name, hp: Math.round(hp), atk: Math.round(atk), def: Math.round(def),
      spd: 55 + stage * 2 + (opts && opts.isBoss ? 20 : 0),
      faction, eva: 0.02 + (diff === 'hell' ? 0.03 : 0),
      resPct: diff === 'hell' ? 0.15 : diff === 'hard' ? 0.08 : 0,
    }, opts || {});
    // 同名敌人加 A/B/C 后缀，敌情预告与战斗画面保持一致
    const label = list => {
      const count = {};
      list.forEach(e => { count[e.name] = (count[e.name] || 0) + 1; });
      const seen = {};
      list.forEach(e => {
        if (count[e.name] > 1) {
          seen[e.name] = (seen[e.name] || 0) + 1;
          e.name = e.name + ' ' + String.fromCharCode(64 + seen[e.name]);
        }
      });
      return list;
    };
    if (kind === 'boss') {
      const bossHp = w.bossHp[D.DIFFICULTY.findIndex(d => d.id === diff)] || w.bossHp[0];
      // Boss 血量按世界序号缩放（早期世界玩家战力低，避免数值碾压）
      /* V9.5.64（父亲大人：前期副本卡关）——首关 Boss 血量系数 0.28 → 0.10，
         之后每个世界再 +0.05：第一个 Boss 是"能打赢的关"，不是劝退墙。 */
      const bossHpMult = (0.05 + wi * 0.05) * ease;
      const list = [mk(w.boss, bossHp * bossHpMult, w.atk * 1.10 * diffMult(diff) * (1 + stage * 0.04) * ease, w.def * 1.4 * diffMult(diff) * (1 + stage * 0.05), { isBoss: true, position: 'back' })];
      list.push(mk(w.enemies[0], w.hp * m * 1.5, w.atk * mAtk, w.def * mDef, { position: 'front' }));
      if (diff !== 'normal') list.push(mk(w.enemies[1], w.hp * m * 1.5, w.atk * mAtk, w.def * mDef, { position: 'front' }));
      return label(list);
    }
    if (kind === 'elite') {
      return label([
        mk(w.elite, w.hp * 2.0 * m, w.atk * 1.35 * mAtk, w.def * 1.3 * mDef, { isElite: true, position: 'back' }),
        /* V1.0.5（2026-09-23 游戏策划总监会诊查出）：这里原来写死 `Math.random() * 3`，
           而同文件下面那一波用的是 `w.enemies.length` —— 只要某个世界的敌人表不是 3 只，
           抽到的下标就越界 → 取到 `undefined` → **"名字 undefined"直接上屏**。
           改成和下面同一份判据（取表的真实长度），增删怪物都不会再炸。 */
        mk(w.enemies[Math.floor(Math.random() * w.enemies.length)], w.hp * m, w.atk * mAtk, w.def * mDef, { position: 'front' }),
      ]);
    }
    /* V1.0.1（父亲大人："前期可以一个敌人，到后期可以固定 5 个敌人啊，就慢慢增加，
       到第 3 个世界就固定五个敌人"）：
       敌人数**按世界**递增，不再按关卡：第 1 个世界 1 只、第 2 个 3 只、
       第 3 个世界起**固定 5 只**（都不再打折 —— 折扣那套是当初"一刀一个"的根源）。 */
    const n = wi === 0 ? 1 : (wi === 1 ? 3 : 5);
    const out = [];
    for (let i = 0; i < n; i++) {
      /* V1.0.1（父亲大人："敌方阵型跟我方阵型一样，前 2 后 3"）：
         敌人也分前后排 —— 引擎本来就按 position 选目标（先打前排），
         以前只给敌人一排，等于"所有人都能打到"；现在前 2 后 3，
         前排站着就替后排挡刀（打光前排才碰后排），和我方同一套规矩。 */
      out.push(mk(w.enemies[Math.floor(Math.random() * w.enemies.length)],
        w.hp * m, w.atk * mAtk, w.def * mDef, { position: i < 2 ? 'front' : 'back' }));
    }
    return label(out);
  }

  // 战斗奖励
  function battleRewards(worldId, diff, stage, kind) {
    const tier = D.WORLDS.findIndex(x => x.id === worldId) + 1;
    /* V1.0.1（游戏策划总监会诊查出：**奖励线性 × 难度指数**）：
       原来 `1+(stage-1)×0.08` —— 第 12 关只 1.88×；而敌人 HP 是 `1.15^(stage-1)`，
       第 12 关 4.65× → **单位血量的收益只剩 40%**（越往后打越亏）。
       改成与 HP **同底**（`1.15^(stage-1)`）。系数取 **1.68** 的算法：
         · 旧曲线 12 关合计 = Σ(1+0.08(s-1)) = 17.28
         · 新曲线 12 关合计 = Σ(1.15^(s-1)) = 29.0
         · 29.0 / 17.28 = **1.68** → 总量不变，只有**形状**变：
           前几关少给（第 1 关 1.000→0.595）、后几关多给（第 12 关 1.880→2.769）。
       （⚠️ 第一版我写的是 ÷2.47 —— 那是"第 12 关不变"，结果前面全降 40~60%，
        30 天长线从推到 W11 掉到只到 W02。÷2.47 与 ÷1.68 差的就是"保末关"还是"保总量"。） */
    const rm = rewardMult(diff) * Math.pow(1.15, stage - 1) / 1.68;
    const base = { points: 0, exp: 0, otherworld: 0, equipChance: 0 };
    if (kind === 'boss') {
      base.points = Math.round((500 + tier * 150) * rm);
      base.exp = Math.round((300 + tier * 80) * rm);
      /* V9.6.134：货币 8 → 4 —— 原「故事点」并入点数，原「技能芯片 / 血统结晶」并入异界结晶。
         产出**数值不动**，只换币种：这样每一条养成线"攒够要几天"跟合并前完全一样
         （价格那边已经按同一个池子的日收入等比放大过）。 */
      base.points += Math.round(50 * rm);                       // 原 故事点
      base.otherworld = Math.round(30 * rm)                     // 原 异界结晶
        + Math.round((50 + tier * 8) * rm * 0.5333)             // 原 技能芯片（同底 · 12 关总量不变）
        + Math.round((diff === 'hell' ? 30 : diff === 'hard' ? 15 : 5) * rm * 0.5333);   // 原 血统结晶（同底）
      /* V9.5.65（策划体检留档）：一度想把这行从 5/15/30 翻倍，理由是"铭刻 5 阶要 8200 枚结晶"。
         补上"扫荡"这一环后实测发现守关 Boss 是**可反复扫荡**的稳定来源：
         每天 60 次扫荡 ≈ 300 枚/天，铭刻全解锁约 27 天、单伙伴血统满 8 天，供给本来就够。
         所以维持原值——不要凭半张表去改经济。 */
      base.equipChance = 1;
      /* V9.6.78：这里原来写 `equipMin`（守关至少 SR/SSR）——那是**旧掉落表**的产物。
         现在"这一段图的守关至少出什么档"写在 data.js 的 DROP_BLOCKS.bossMin 里，
         和世界段一起维护（两处各写一份迟早对不上，实测已经因为跳过封顶导致 W01 出传说）。
         概率也不再看难度另写一份表，统一由 rollEquipRarity(世界, 来源, 难度) 算。 */
      /* V9.6.76：第 21 张图起，守关 Boss 有概率掉**血统神装（神话）** ——
         末段真正的成长线在这里（见 data.js 的 GOD_SETS）。只给 Boss，不给杂兵/精英：
         "刷神话"该是一件有目标的事，不是刷两关就顺出来的货。 */
      /* V9.6.79：守关掉神话的概率从 10/20/35% 收到 **5/12/25%**。
         起因是 drop_audit 把那本账算了出来：扫荡 60 次守关 = 一天 6 件神话，
         "神装是后期也算稀有的东西"这句话就站不住了（父亲大人的原话）。
         收到 5% 之后是 ~3 件/天，给一个 5 人队凑齐 6 件×5 人仍然要几周。 */
      /* ================= V1.1.8（乙组 B11 · 神话概率"收"）=================
         **这是一段"冻结段"的改动，理由必须写在代码里**（《总落地清单》§1 点名）：
         父亲大人 09-26 拍板「**收**」—— 因为 **B6 给扫荡加了"每天 +30 次"**（18 → 48 次，×2.67），
         若神话概率不动，**神装的日产出会跟着 ×2.67**：普通档 0.9 → 2.4 件/天、
         地狱档 4.5 → 12 件/天 —— "一整套神话 ≈ 9 天"会被腰斩到 **≈ 3.5 天**（地狱 ≈ 1.9 → 0.7 天），
         终局线（神装是"后期也算稀有的东西"）当场失效。
         按 **2.67 反比**把三档收回来（0.05/0.12/0.25 ÷ 2.67 ≈ 0.019/0.045/0.094）：
           · 这是**为了维持原产出量级**，不是为了改设计（产出回到"每天约 0.9 / 4.5 件"这个基线）；
           · 所以它与 B6 **必须同批上线**：只放次数不收概率 → 有一段时间神话 ×2.67；
             只收概率不放次数 → 扫荡党被白砍一刀（这也是"'必须同批'的第 5 条"的由来）。
         ⚠️ 已经掉出去的装备收不回来 —— 这一行**上线即生效**，回滚要连 B6 一起退。 */
      if (tier >= 21) base.mythChance = diff === 'hell' ? 0.094 : diff === 'hard' ? 0.045 : 0.019;
    } else if (kind === 'elite') {
      base.points = Math.round((80 + tier * 40) * rm * 2.5);
      base.exp = Math.round((60 + tier * 20) * rm * 2.5);
      base.points += Math.random() < 0.5 ? Math.round(15 * rm) : 0;   // 原 故事点
      base.otherworld += Math.round((15 + tier * 2) * rm * 0.5333);    // 原 技能芯片（同底 · 12 关总量不变）
      base.equipChance = 0.55;
    } else {
      base.points = Math.round((80 + tier * 40) * rm);
      base.exp = Math.round((60 + tier * 20) * rm);
      base.otherworld += Math.round((5 + tier) * rm * 0.5333);         // 原 技能芯片（同底 · 12 关总量不变）
      base.equipChance = 0.15;
    }
    return base;
  }

  // 结算奖励（含装备掉落）
  /* opts.noTicket：扫荡时传 true —— 见下面招募券那一段的说明。
     opts.extra：预留（比如活动加成），目前没用。 */
  function grantRewards(worldId, diff, stage, kind, opts) {
    opts = opts || {};
    const r = battleRewards(worldId, diff, stage, kind);
    const got = [];
    const Core = window.Core;
    if (r.points) { Core.addCur('points', r.points); got.push({ k: 'points', v: r.points }); }
    if (r.otherworld) { Core.addCur('otherworld', r.otherworld); got.push({ k: 'otherworld', v: r.otherworld }); }
    // 天赋「灯阁恩赐」的掉落加成：装备掉落率、材料掉落率、宝箱补给率统一按比例提高
    const dropBoost = Core.graceDropMult ? Core.graceDropMult() : 1;
    /* 首通保底（V9.6.6 父亲大人）：开局不再白送一套 R 装备，改成"前面几关自己打出来"。
       规则：W01 普通前 6 关，**每关首通**保底 1 件，部位优先补主角身上空着的槽；
       稀有度按 data.js 的 EARLY_GUARANTEE（前 3 关 N、后 3 关 R）。
       主角六个槽都满了就不再保底（自限，不需要额外开关）。
       判定"首通"用 S.worlds[...].stages[...] === 0 —— grantRewards 在 stageComplete 之前调用，
       所以这时读到的还是"未通关"状态。
       V1.0.1（游戏策划总监会诊查出，两个都是 0 基 / 1 基混用）：
        ① 保底表 `EARLY_GUARANTEE.W01.normal` 的键是 **0~5**（0 基），这里却拿 **1 基的 stage**
           去查 → 第 1 关查到的是"头"、**武器那条永远查不到**、第 6 关直接查空（没有保底）。
           本文件 288 行的 `stages[diff][stage - 1]` 才是对的写法，这里漏了 -1。
        ② `gStage` 同样读的是 `[stage]`，也就是**下一关**的星数 —— 于是"下一关没通关"时
           重打本关每次都再触发一次保底（扫荡也满足这个条件）→ 前期单场 ◆ 从 6 变 11（+83%，无上限）。
       两处都改成 0 基。 */
    const gRule = D.earlyGuarantee(worldId, diff, stage - 1);
    const gStage = (Core.S.worlds[worldId] && Core.S.worlds[worldId].stages && Core.S.worlds[worldId].stages[diff]
      && Core.S.worlds[worldId].stages[diff][stage - 1]) || 0;
    const guarantee = (gRule && gStage === 0) ? gRule : null;
    if (guarantee || Math.random() < Math.min(1, r.equipChance * dropBoost)) {
      /* V9.6.78：品质改由**世界段**决定（见 data.js 的 DROP_BLOCKS）——
         世界序号 + 掉落来源（杂兵/精英/守关）+ 难度，三样一起算；
         这一段图的上限（cap）是硬的，早期世界无论怎么打都出不了高档货。 */
      const worldIdx = D.WORLDS.findIndex(x => x.id === worldId) + 1;
      let rarity = guarantee ? guarantee.rarity : D.rollEquipRarity(worldIdx, kind, diff);
      if (r.mythChance && Math.random() < r.mythChance) rarity = 'MYTH';
      const res = Core.grantEquip(worldId, rarity, guarantee ? guarantee.slot : undefined);
      if (res.equip) got.push({ k: 'equip', v: res.equip });
      /* V1.1.15：装备格满 → 装备进**装备待领箱**（不再折现）——结算页照样列出来、标 📮 */
      else if (res.stashed) got.push({ k: 'equip', v: res.eq, stashed: true });
      /* V1.1.15：装备格满时 `grantEquip` 是**强制折现**（这是给"无限掉落"设计的防堆积）。
         结算页得说清"这件装备是被折现了、不是没掉" —— 带上 bagFull 让胶囊标出来。 */
      else if (res.sold) got.push({ k: 'otherworld', v: res.gain, sold: true, bagFull: !!res.bagFull, overflow: !!res.overflow });
    }
    // 地狱 Boss：5% 掉落伙伴专属装备（UR · 本命 36 件）
    if (kind === 'boss' && diff === 'hell' && Math.random() < 0.05) {
      /* 2026-09-27（父亲大人要的"收集感"）：36 件里**优先给还没拥有过的那件**（挑件在数据层，
         见 data.js 的 `pickSignatureEquip`）；36 件全拿到之后转 ◆ 折现，不再硬塞重复件。 */
      const sigId = D.pickSignatureEquip((Core.S.codex && Core.S.codex.equipNames) || []);
      if (sigId < 0) {
        Core.addCur('otherworld', D.DECOMPOSE_GAIN.UR);
        got.push({ k: 'otherworld', v: D.DECOMPOSE_GAIN.UR, sold: true, allSignature: true });
      } else {
        const sigRes = Core.grantSignatureEquip(sigId);
        if (sigRes.equip) got.push({ k: 'equip', v: sigRes.equip, signature: true });
        else if (sigRes.sold) got.push({ k: 'otherworld', v: sigRes.gain, sold: true });
      }
    }
    if (r.exp) got.push({ k: 'exp', v: r.exp });
    /* 强化材料掉落：精英 35%、Boss 必掉 1~2 件，普通战 8% 小概率掉。
       V9.6.79：档位改由 D.matTierWeights(世界) 给 —— 旧写法 `Math.min(5, 世界序号)`
       让第 5 张图之后永远只掉 T5，而 +5/+10/+15 要吃 T2/T3/T4，掉落这一路是断的。 */
    const wi = D.WORLDS.findIndex(x => x.id === worldId);
    const worldIdx = wi + 1;
    const pickMat = () => {
      const w = D.matTierWeights(worldIdx);
      const total = Object.values(w).reduce((a, x) => a + x, 0);
      let rr = Math.random() * total, acc = 0, t = worldIdx;
      for (const k of Object.keys(w)) { acc += w[k]; if (rr <= acc) { t = +k; break; } }
      return 'mat_t' + t;
    };
    const matId = pickMat();
    if (kind === 'elite' && Math.random() < Math.min(1, 0.35 * dropBoost)) { dropItem(got, matId, 1); }
    if (kind === 'boss') { const n = 1 + (Math.random() < 0.5 ? 1 : 0); dropItem(got, matId, n); }
    if (kind === 'combat' && Math.random() < Math.min(1, 0.08 * dropBoost)) { dropItem(got, matId, 1); }
    /* V9.5.66（父亲大人）：探索消耗品（治疗剂 / 强化剂）整条线删掉，这里原来占着
       "普通战 20% / 精英 40% / Boss 必掉"三档掉落位。直接空掉会让每一局的收益凭空缩水，
       所以把这三档**换成同档位的强化材料**——材料有真实去处（强化装备、建筑、商店都在吃）。
       老档里已经买到的消耗品在 core.js 的 migrate() 里按原价退点数。 */
    const supplyChance = kind === 'boss' ? 1 : kind === 'elite' ? 0.40 : 0.20;
    if (Math.random() < Math.min(1, supplyChance * dropBoost)) {
      const sn = kind === 'boss' ? 2 : 1;
      dropItem(got, matId, sn);
    }
    /* 招募券掉落（V9.5.75 复核）：券是"探索的惊喜"，**扫荡不给**。
       起因：券改成"商店不卖、只能玩法获得"之后，我算了一下日产量——
       扫荡守关 Boss 一次掉券概率 50%，一天 60 次扫荡 = **30 张高级券（异界征召令）**（地狱再 +21 张限定券），
       而高级池 25% 出 SSR → 等于是每天白送 7 个 SSR，图鉴两周就满，招募这条线直接失去意义。
       现在：手打副本照旧掉券（打一关完整 12 层 ≈ 1.6 张普通券 + 1 张高级券，是"惊喜"的量级），
       扫荡只给材料 / 点数 / 结晶 —— 扫荡是"重复劳动"，惊喜不该从重复劳动里刷。 */
    /* V9.6.115（父亲大人："现在招募券的掉落几率是否会太高了"）：**确实偏高**，已下调。
       改前的实测（drop_table 那套算出来的）：反复刷第 12 关（守关 Boss）**每次 0.5 张高级券**，
       打 20 次 = 10 张 = 10 抽；高级池 SSR 25% → **20 次刷本 ≈ 2.5 个 SSR**。
       这已经不是"探索的惊喜"，是把抽卡按次数发。而券是"商店不卖、只能玩法获得"的硬通货，
       发多了招募这条线（以及限定券 / 圣洁晶石的消耗）就失去意义。
       下调后（每次）：守关 Boss 0.18 / 精英 0.10 / 杂兵 0.08 / 地狱 Boss 额外限定券 0.12。
       折算：刷第 12 关 20 次 ≈ 3.6 张高级券 ≈ 0.9 个 SSR；一个世界 12 关全清 ≈
       1.7 张普通券 + 0.4 张高级券 —— 仍然比"一天白给"好得多，但回到了"每十几次给一次惊喜"的量级。 */
    if (!opts.noTicket) {
      if (kind === 'boss' && Math.random() < Math.min(1, 0.18 * dropBoost)) {
        dropItem(got, 'ticket_adv', 1);
      } else if (kind === 'elite' && Math.random() < Math.min(1, 0.10 * dropBoost)) {
        dropItem(got, 'ticket_adv', 1);
      } else if (kind === 'combat' && Math.random() < Math.min(1, 0.08 * dropBoost)) {
        dropItem(got, 'ticket_normal', 1);
      }
      // 地狱难度的 Boss 额外掉限定券（限定池是"定向池"，券最稀有）
      if (diff === 'hell' && kind === 'boss' && Math.random() < 0.12) {
        dropItem(got, 'ticket_lim', 1);
      }
    }
    /* （旧这里的"高阶世界 12% 掉低一档材料"已经并进 pickMat 的低档权重里：
       现在每一颗材料的档位都是按世界抽的，天然不会断档。） */
    // 高阶经验模块：W07 起精英/Boss 掉落，等级曲线调整后需要稳定的高阶经验来源
    if (worldIdx >= 7 && (kind === 'boss' || (kind === 'elite' && Math.random() < 0.3 * dropBoost))) {
      const expId = worldIdx >= 15 ? 'exp_xxl' : worldIdx >= 11 ? 'exp_xl' : 'exp_l';
      const n = kind === 'boss' ? (worldIdx >= 11 ? 1 : 2) : 1;
      dropItem(got, expId, n);
    }
    /* 原来的"增益补给 / 高阶消耗品"两段判定同样并进素材掉落：
       精英/Boss 额外给一件当前档位材料，保证一局的实得收益不因删道具而变少。 */
    if (kind !== 'combat' && Math.random() < Math.min(1, 0.30 * dropBoost)) {
      dropItem(got, matId, 1);
    }
    /* 兽魂石：伴生体的唯一稳定来源。
       V9.6.79（drop_audit 算出来的）：原来是"守关**必掉** 1~3 颗、精英 30%"，
       而扫荡一天能打 60 次守关 → **一天 105 颗**，孵一只要 10 颗 = 一天孵 10 只。
       全游戏只有 12 只伴生体，等于这个系统两天就被刷穿，兽魂升级那条线也一起废掉。
      现在：守关 10%、精英 5% → 扫荡 18 次守关 ≈ **1.8 颗/天**（10 颗孵 1 只 → 约 0.18 只/天，
      全 12 只约 66 天收齐，重复的转兽魂）。
      ⚠️ 这行原来写的是"约 6 颗/天"——那是**尺子读错**：drop_audit 的采样段没开大背包，
       几千次抽样把 50 格塞满后掉落不再进 `got`，掉率被读成 1.8%（真值 10%）。
       尺子已修（`openBag()`），1.8 是修完之后的实测值。 */
    if (kind === 'boss' && Math.random() < Math.min(1, 0.10 * dropBoost)) {
      dropItem(got, D.BEAST_EGG_ITEM, 1);
    } else if (kind === 'elite' && Math.random() < Math.min(1, 0.05 * dropBoost)) {
      dropItem(got, D.BEAST_EGG_ITEM, 1);
    }
    /* ================= V1.1.4（A12-F · 新料的产出口）=================
       《收口2》§3.1 / §3.3 定的口径：**只加一个额外掉落槽，不动现有材料档** ——
         · 守关 Boss 额外 30% × 1 颗（W10 起，见下）· 精英额外 15% × 1 颗；
         · 两种料按**需求比 2:1** 分（铭魂砂 293 块 : 血髓晶 145 块），所以期望 2/3 给砂、1/3 给晶。
       ⚠️ **两条不能省的理由**：① 现有 6 种材料的日产量必须"一个数不变"（§3.3 第 2 条）；
          ② 新料在旧版里会被画成 `undefined` 空框 → 产出必须与消耗、入门包同批上（《总落地清单》§2.2 第 4 条）。
       ⚠️ 概率 30% / 15% 是**临时保守值**（§1.4 那张表），数值轮按 30 天库存曲线调。 */
    const newMatChance = kind === 'boss' ? 0.30 : kind === 'elite' ? 0.15 : 0;
    if (newMatChance && Math.random() < Math.min(1, newMatChance * dropBoost)) {
      const id = Math.random() < 2 / 3 ? 'minghun_sha' : 'xuesui_jing';
      dropItem(got, id, 1);
    }
    /* ================= V1.1.13（0927-E · 总监 §5.3 来源⑤）：守关 Boss 额外槽 ＋ 重铸石 =================
       8% × 1 颗，**挂在同一条"额外掉落槽"上**（与铭魂砂/血髓晶同一条规矩，不动它们那两档概率）。
       为什么只挂守关 Boss：给**不看广告、也不买东西**的玩家一条路（总监原话）。
       ⚠️ 8% 是**临时值**（表 B），数值轮按 30 天库存曲线调。 */
    if (kind === 'boss' && Math.random() < Math.min(1, 0.08 * dropBoost)) {
      dropItem(got, 'reforge_stone', 1);
    }
    /* 「灵植种」的"副本材料档"那一半来源（《收口2》§3.1）：跟着材料档小概率掉。
       它是药园自循环（收成回收 70%）之外的**缺口补充** —— 没有它，新号手里 0 颗种子就种不下去，
       只能去市集买（那条"不设卡"的保险也在）。⚠️ 10% 是临时值。 */
    if (Math.random() < Math.min(1, 0.10 * dropBoost)) {
      dropItem(got, 'lingzhi_zhong', 1);
    }
    /* 「材料包·上品」的地狱守关那一格（《收口2》§3.2 来源列）。
       ⚠️ 加了 W10 门槛（我加的，原文没写）：上品包给的是 **T5 材料**，
          若第 1 张图的地狱守关就能掉，等于前期的强化线被空投一段。这道门槛是
          "别让新东西在开局就出"的同一条原则（《收口2》§3.3 里"神装不该早期出"也是这么处理的）。 */
    if (kind === 'boss' && diff === 'hell' && worldIdx >= 10 && Math.random() < 0.05) {
      dropItem(got, 'matpack_high', 1);
    }
    return { rewards: r, got };
  }

  /* 关卡 = 一场接一场的连续战斗（对标《道友修仙》的副本：点进去就打，不再让人选路线）。
     波数随**世界**推进：W01 一波、W02 两波、W03 起固定三波（V1.0.1）。
     最后一波才是"结算波"：第 4/8 关是精英、第 12 关是守关 Boss，其余是区域决战。
     波与波之间血量继承——这是"连打"的重量所在：
     上一波残血进下一波就会被压死，所以**上阵人数与站位**才是唯一的安全垫
     （V9.5.66 起探索消耗品整条线已下架，这句原来点名的治疗剂 / 强化剂不存在了）。 */
  function finalKind(stage) {
    return stage === 12 ? 'boss' : stage % 4 === 0 ? 'elite' : 'combat';
  }
  function wavePlan(stage, worldId) {
    /* V1.0.1（父亲大人："波次也是根据世界递增的，到第三世界后才是固定 3 波"）：
       波次**按世界**递增 —— 第 1 个世界 1 波、第 2 个 2 波、第 3 个世界起固定 3 波
       （最后一波按关卡是精英或守关 Boss）。不传 worldId 时按 3 波兜底。 */
    const wi = worldId ? D.WORLDS.findIndex((w) => w.id === worldId) : -1;
    const n = wi < 0 ? 3 : (wi === 0 ? 1 : wi === 1 ? 2 : 3);
    const out = [];
    for (let i = 0; i < n - 1; i++) out.push('combat');
    out.push(finalKind(stage));
    return out;
  }
  // 扫荡
  function sweep(worldId, diff, stage, times) {
    const Core = window.Core;
    if (!Core.S.worlds[worldId] || Core.S.worlds[worldId].stages[diff][stage - 1] <= 0) {
      return { ok: false, msg: '通关后才能扫荡' };
    }
    // 每日扫荡上限：跨天归零统一走 Core.ensureSweepDay（这条规则只留一处定义，V9.5.90）
    Core.ensureSweepDay();
    const cap = Core.sweepCap();
    // 剩余次数走 sweepLeft()：它已经把「额外额度」算进去了
    const left = Core.sweepLeft();
    if (left <= 0) { Core.save(); return { ok: false, msg: `今日扫荡次数已用完（${cap}/${cap}）` }; }
    const n = Math.min(times, left);
    const kind = finalKind(stage);
    const total = [];
    let exp = 0;
    for (let i = 0; i < n; i++) {
      const g = grantRewards(worldId, diff, stage, kind, { noTicket: true });   // V9.5.75：扫荡不掉招募券（见 grantRewards 里的说明）
      // 扫荡 = 自动重打这一关：经验与战绩必须和手打一致。
      // 以前 exp 只写进 got（结算面板照样显示 "EXP+xxx"），却没有一行把它加进角色/主角经验（V9.5 修）。
      exp += g.rewards.exp || 0;
      total.push(g);
    }
    const party = Core.S.party.filter(Boolean);
    if (exp) {
      Core.addCharExp(party, exp);                       // 与手打普通波同一口径
      Core.addPlayerBattleExp(Math.round(exp * 0.5));
    }
    // 战斗统计与"战斗 N 次"这类进度也要跟着走——否则扫荡党永远完不成日常/成就，两套口径打架
    for (let i = 0; i < n; i++) Core.battleSettle({}, true, kind === 'boss');
    /* V1.1.4（A12-F · 「秘卷残章」的唯一来源）：《收口2》§3.1 = **每 5 次扫荡 1 张**，
       而且写明"走扫荡、不占副本掉落"（所以它不在这上面的 grantRewards 里，只在扫荡这条路上）。
       口径：按**今日累计扫荡次数**跨过 5 的倍数发（S.sweep.count 跨天归零，见 ensureSweepDay），
       所以一天最多 2 张（扫荡基础 10 次）——与 §3.1 的"≤4/天"上限一致（权限 +8 次时最多 3~4 张）。
       ⚠️ 每 5 次 1 张是《收口2》给的，不是临时值。 */
    const beforeCnt = Core.S.sweep.count || 0;            // 这里 S.sweep.count 还是"这一批之前"的值
    const scrolls = Math.floor((beforeCnt + n) / 5) - Math.floor(beforeCnt / 5);
    if (scrolls > 0) {
      /* 同上：扫荡给"秘卷残章"，背包满时也进待领箱（不许因为容量把这条产出口吞掉） */
      const sg = [];
      dropItem(sg, 'mijuan_canzhang', scrolls);
      total.push({ rewards: {}, got: sg });
    }
    Core.S.sweep.count += n;
    Core.save();
    return { ok: true, total, count: n, capped: n < times };
  }

  return { makeEnemies, battleRewards, grantRewards, finalKind, wavePlan, sweep, diffMult, stageMult, THEME_FACTION };
})();
