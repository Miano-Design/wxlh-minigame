/* ================= 加固钩子（V1.1.1 · 拆掉"加固分叉"，见 js/mem-guard.js）=================
   本文件（core.js）是**两端共用的一份真相**。曾经《小游戏内存风险检测与辅助加固工具》把一整套
   加解密运行时**注入到本文件头部**：小游戏端带加固、网页版不带 → 两端不同源、`sync-logic` 拒绝覆盖。
   现在运行时搬去 `wxlh-minigame/js/mem-guard.js`（只在游戏端、在本文件**之前**加载），
   本文件只留这一个钩子：
     · 小游戏端：mem-guard 已把真正的 `getProxied` 挂到 `globalThis` → 下面取到它，
       正文里那些 `getProxied({...})` 包装照旧生效（加固行为一点没变）；
     · 网页版 / 各把尺子：没有那个文件 → 退化成恒等函数（对象原样返回，零开销）。
   ⚠️ 不许把运行时再注回本文件（那会让两端又分叉）；要改加固就改 mem-guard 的生成侧。 */
const getProxied = (typeof globalThis !== 'undefined' && typeof globalThis.getProxied === 'function')
  ? globalThis.getProxied
  : function (v) { return v; };
/* 《残域》核心逻辑：状态 / 存档 / 挂机 / 养成 / 经济 */
window.Core = (function () {
  const D = window.DATA;
 const SAVE_KEY = 'wxlh_save_v5';
  /* V9.6.113（父亲大人："以后上线小程序有别的玩家，总不能也让人删档重开吧"）：
     存档的兼容规则写死在下面这几行 —— 上线之后**任何一次更新都不许要求玩家删档**：
       · 存档里带自己认识的版本号（S.v）；
       · 读档时**先按默认结构补齐缺的字段**（fillDefaults），再跑语义迁移（migrate）——
         以后加新系统（新货币、新面板、新计数）不需要为每个字段写一行补丁；
       · 老版本存档（v < 当前）一律走迁移，**不拒收**；
       · 万一真读不出来（文件损坏 / 来自更高版本），先把原始内容**原样备份**再退出去，
         绝不让玩家的一点进度被下一次存盘悄悄覆盖掉。 */
  const SAVE_VER = 5;
  const SAVE_BAK = SAVE_KEY + '_bak';       // 读档失败时的原样备份（含时间与原因）
  const SLOT_COUNT = 3;
  const slotKey = n => `${SAVE_KEY}_slot${n}`;
  let S = null;
  let uidCounter = 1;
  // 核心层自己也要给文案用（挂机产线、渡劫消耗），格式与界面保持一致
  function fmtNum(n) {
    n = Math.floor(n || 0);
    // V9.6.140：口径与界面层 fmt() 同一份 —— 一律不带小数点，10 万以下原样显示精确整数
    if (n >= 1e8) return Math.round(n / 1e8) + '亿';
    if (n >= 1e5) return Math.round(n / 1e4) + '万';
    return String(n);
  }

  /* ================= 存档 ================= */
  /* V1.1.12（父亲大人 09-27：「**只要不被人改就行了**」）—— 存档**加密**的两个口子：
     · `packSave()`：写盘前把整份 JSON 过一层加密（算法在 `js/mem-guard.js`，只在小游戏端加载）；
     · `unpackSave()`：读盘时**先按密文解**，解不开（没有 `MPG1:` 前缀）就当**明文**读 ——
       老档 / 老导出串 / 手工备份**全部继续可用**：不迁移、不会因为加密毁掉任何人的进度。
     ⚠️ **读档失败时"原样备份"那条路不许动**：备份里存的是**原始字符串**（密文或明文都原样留），
        它永远是可诊断的；这一层防的是"改文件白嫖"，不是"读不出来就丢档"。
     ⚠️ 没有 mem-guard 的环境（网页版 / 各把尺子的假环境）→ 两个函数退化成恒等，行为与从前一致。 */
  function packSave(obj) {
    const json = JSON.stringify(obj);
    const e = (typeof globalThis !== 'undefined') ? globalThis.__MP_ENC_STR : null;
    return (typeof e === 'function') ? e(json) : json;
  }
  /* 读档时"到底是明文读不动、还是密文解不开"—— 这两件事的救法完全不同：
     明文坏 = 档真坏了；密文解不开 = 密钥/格式不匹配（**档还是好的，只是这一版读不懂**）。
     所以 `unpackSave` 顺手把结论记在这儿，`load()` 报原因时用它（V1.1.15 存档审计）。 */
  let lastUnpackIssue = null;
  function unpackSave(raw) {
    if (raw == null) return raw;
    lastUnpackIssue = null;
    /* 头写成"MPG + 数字 + 冒号"：将来换密钥是加一条 `MPG2:`（旧档照样解，见 mem-guard 的密钥表） */
    const isCipher = /^MPG\d+:/.test(String(raw));
    const d = (typeof globalThis !== 'undefined') ? globalThis.__MP_DEC_STR : null;
    if (typeof d === 'function') {
      try {
        const s = d(raw);
        if (typeof s === 'string') {
          /* V1.1.15（2026-09-27 存档审计）：**解出来的必须是 JSON 才算解密成功**。
             为什么加这一条：将来万一换了密钥，旧档也能"解"出一串乱码（base64 能过、
             XOR 用错 key 也照样出字符）—— 拿乱码去 `JSON.parse` 会在上层报"json 错"，
             玩家看到的还是"档没了"，而真正的原因（密钥不匹配）被埋掉。
             在这里判一次，读档失败的原因就能精确到"密文解不开"。 */
          try { JSON.parse(s); return s; }
          catch (e2) { lastUnpackIssue = 'enc'; }          // 解得出字符、但不是 JSON → 密钥/格式不匹配
        }
        else if (isCipher) lastUnpackIssue = 'enc';        // 带密文头却解不出来（base64 坏了 / 没解密器）
      } catch (e) { if (isCipher) lastUnpackIssue = 'enc'; }
    }
    return raw;
  }
  const ATTR_ZERO = () => ( getProxied({ muscle: 0, immune: 0, cell: 0, nerve: 0, intelligence: 0, spirit: 0 }));
  /* 天赋初值：四支天赋树各 0 级（分支键与 data.js 的 TALENTS 同源）。
     和 ATTR_ZERO 放一起，是因为**"新档初值"必须只有一份定义** ——
     以前它只写在 defaultState() 里，于是 createProtagonist() 走 freshProtagonist() 时
     一个都没有，新建主角就继承了旧主角的天赋（V1.0.3 · 产品经理报的 P1）。 */
  const TALENT_ZERO = () => ( getProxied({ body: 0, energy: 0, nerve: 0, grace: 0 }));
  // row：主角站前排还是后排（V8.3 新增）。默认前排——和旧存档的战场表现一致。
  /* V9.5.69（父亲大人）：**所有等级从 0 起算**——数字就是"已经升过几次"。
     主角 Lv.0 / 技能 Lv.0 / 建筑 0 级 / 评级 Lv.0 / 伴生体 0 级（血统、铭刻、境界、权限本来就是 0 起）。 */
  function freshProtagonist(name, nameAudited) {
    /* 这一份就是**新档初值**的唯一定义：新档、新建主角、老档补字段都从这里取。
       V1.0.3（产品经理报的 P1）：`realm / talents / reincarnations / geneLock` 原来
       只写在 defaultState() 里，freshProtagonist 里一个都没有 —— 于是"新建主角"
       拿到的是**旧主角**的境界 / 天赋 / 转生世数 / 铭刻阶数（实测：境界 12 阶 + 满天赋 + 转生 3 世，
       新主角一出生就带着这些）。现在四样都归零，名单也补进了 PROTAGONIST_KEYS。 */
    return  getProxied({ name: name || '', level: 0, exp: 0, bloodline: null, bloodlineLv: 0, attrPoints: 0,
      attrs: ATTR_ZERO(), skillPoints: 0, skillLv:  getProxied([0, 0, 0]), row: 'front',
      realm: 0, geneLock: 0, reincarnations: 0, talents: TALENT_ZERO(),
      /* V1.0.4 · V：这一位主角的名字**是不是过了机审的**（名单外的自由名字才记，见 setPlayerName）。 */
      nameAudited: nameAudited || '' });
  }
  function defaultState() {
    return  getProxied({
      v: 5,
      /* V1.1.20（F1-1 · 云同步"谁新听谁的"）：**玩家最后一次真正产生进度/操作的时刻**（毫秒）。
         为什么不用 `idle.lastTs`：那个字段会被开机流程（settleOffline 结算、每 15 秒心跳）盖章成
         "现在"，于是判据变成"谁刚开过游戏"，而不是"哪份档更新"—— 云上那份再新也拉不下来（阻塞级）。
         口径（三句话，全在 save() / settleOffline() 里）：
           · **玩家驱动的存盘** → 刷新它；
           · **开机自愈 / 离线结算那一段** → 一个字都不许动（settleWriting 那道闸）；
           · **自动存盘（15 秒心跳 / 开机提示）** → 落盘照旧，但不刷新它（save({auto:true})）。
         老档没有这个字段 → `migrate()` 用 `idle.lastTs` 兜底补一次（别让老档判成 0 ⇒ 被云端随便盖）。 */
      savedAt: 0,
      player: Object.assign(freshProtagonist('执灯者'),  getProxied({ geneLock: 0, reincarnations: 0, talents: TALENT_ZERO(),
        /* V1.1.9（续13 · P0-4）：**历史最高通关世界的下标**（0 = 还没通关任何世界）。
           为什么要单独存：转生会把 `player.level` 清零、也会把 `S.worlds` 清空，
           挂机基数如果只看等级，转生一次挂机就腰斩（打 W16 的号掉回新手档）。
           这个字段**转生不清**，只涨不跌（见 stageComplete / migrate）。 */
        bestWorldIdx: 0 })),
      altPlayers:  getProxied([]),         // 新建的主角（体验不同血统），与当前主角可切换
      // V9.2：背包分三池（道具 / 材料 / 装备），各 50 格起、各自扩容
      bag:  getProxied({ itemCap: 50, itemExpands: 0, matCap: 50, matExpands: 0, eqCap: 50, eqExpands: 0 }),
      // V9.6.134：货币 8 → 4（见 data.js 顶部的四层说明）
      cur:  getProxied({ points: 0, otherworld: 0, holy: 0, rp: 0 }),
      chars:  getProxied({}),            // id → {lv, exp, star, skillLv:[1,1,1], bloodlineLv}
      /* ================= B 批（2026-10-01）· 剧情进度 =================
         父亲大人：「A 是世界观圣经，B 是实现层」——剧情只看过没看过，**不参与任何数值**。
           · `w[worldId][part]` 世界段落（in/pre/mid/post）四个标记
           · `b[worldId]`        Boss 剧情（六卷锚点）
           · `c[charId]['s1'..'s3']` 人物故事三则
           · `i[key]`            装备故事（套装 / 神装 / 核心道具 / 本命）
           · `choice`            W36 终局选择：0 未选 / 1 熄灭 / 2 继续点燃
         **放在这里＝老档由 fillDefaults 自动补齐、云同步跟着存档走**（不要再单开一个
         localStorage 键 —— 那样手机与电脑的剧情进度就不通了）。
         只增不删：以后加字段照这个形状往里塞，别改结构（改了老档就认不出来）。 */
      story:  getProxied({ w:  getProxied({}), b:  getProxied({}), c:  getProxied({}), i:  getProxied({}), choice: 0 }),
      /* V9.6.129：碎片改成**按稀有度的公共池**（抽到谁都进同一个池子，不再各攒各的）。
         V1.1.14（0927-F）：**新档**从今天起按"每人一份 ＋ 满星后才转通用"记账（见 addChar），
         `shardPoolMerged` 这个"老档一次性合并"的标记**只在 newGame 里落**（不能写进 defaultState ——
         那会被 `fillDefaults` 填给老档、把老档的合并整段跳过，实测当场红）。 */
      shardPool:  getProxied({ N: 0, R: 0, SR: 0, SSR: 0, UR: 0 }),
      // 上阵 5 格（固定前 2 后 3）：0/1 前排，2/3/4 后排。
      // '@player' 就是主角本人——主角必上阵，所以他也占其中一格，站位能拖到前排也能拖到后排。
      party:  getProxied(['@player', null, null, null, null]),
      equips:  getProxied({}),           // uid → 装备实例
      equipped:  getProxied({ '@player':  getProxied({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null }) }),
      items:  getProxied({}),            // itemId → count
      serums:  getProxied({}),           // charId（或 '@player'）→ { serumId: 已服支数 }
      buildings:  getProxied({ core: 0, training: 0, medical: 0, workshop: 0, geneLab: 0 }),   // 建筑从 0 级起（0 级 = 没升过）
      auth: 0,               // 灯阁权限等级（对标"洞府"：高级货币的一次性长线投资）
      sect:  getProxied({ lv: 0, exp: 0 }),   // 灯阁评级（从 0 起：打关卡自动涨的全局长线）
      keji:  getProxied({}),                  // 秘术阁（对标"KeJi"）：id → 等级
      travel:  getProxied({ bankSec: 0, pending: null, got: 0, round: 0, day: '' }),   // 挂机游历奇遇（对标"YouLi"）
      charExp: 0,               // 伙伴经验池（V9.5.46）：所有伙伴共用这一份，升级从这里扣、重生返还回来
      /* 药园 3.0：开几块地由 `gardenPlots` 记（**玩家花点数买**，开局 2 块、最多 8 块）。
         每块地 null，或 { q: 品质id, at: 成熟时间戳 }（`q` 就是种下去那一刻掷到的下品/中品/上品/极品）。 */
      gardenPlots: 2,
      garden: Array(D.GARDEN_MAX).fill(null),
      arena:  getProxied({ floor: 1, best: 1, date: '', used: 0 }),   // 斗法台（对标"Arena"）
      /* V9.6.130：法宝多一条"祭炼"等级线、坐骑多一条"喂养"等级线（父亲大人点头的方案）
         lvMap = { id → 等级 }；0 级＝刚买到时的原始效果 */
      fabao:  getProxied({ own:  getProxied([]), on: null, lvMap:  getProxied({}) }),
      mount:  getProxied({ own:  getProxied([]), on: null, lvMap:  getProxied({}) }),   // 坐骑（V9.6.130：lvMap = 喂养等级）
      sign:  getProxied({ date: '', tier: '', idlePct: 0, drawn: 0 }),   // 点灯（原「求签」，对标"SignItem"）：今天的灯焰与挂机加成
      worlds:  getProxied({}),           // worldId → {unlocked, stages: {normal:[stars×12], hard, hell}}
      worldFirstClear:  getProxied({}),  // 'worldId_diff' → true（通关奖励每个世界·每个难度只发一次）
      /* V9.6.113：新档一出生就带这个标记 —— "旧版把 C001 当主角占位"那段迁移只该对**很老的档**跑。
         不给默认值的话会有个很脏的后果：新玩家正常抽到 C001（普通池 N 档 6 人之一），
         下次开机 migrate 一跑就把他删了，等级和碎片一起没（玩家只会说"我的伙伴不见了"）。 */
      c001Merged: true,
      corridor:  getProxied({ floor: 1, best: 0 }),
      // 保底按池分开记账：高级 / 限定 各自算 SSR / UR / 当期 UP 的累计数
      recruit:  getProxied({ pity:  getProxied({ advanced:  getProxied({ ssr: 0, ur: 0, up: 0 }), limited:  getProxied({ ssr: 0, ur: 0, up: 0 }) }), lastFree: '',
        free:  getProxied({ date: '', normal:  getProxied({ used: 0, at: 0 }), advanced:  getProxied({ used: 0, at: 0 }) }) }),   // V9.5.51 每日免费抽
      shop:  getProxied({ dailyDate: '', dailyItems:  getProxied([]), bought:  getProxied({}) }),
      /* ================= V1.0.5 · 兑换码 / 新手礼包（2026-10-01 · 父亲大人点单）=================
         `gifts` ＝ 这个账号已经领过的码：`{ 码: 领取时刻(ms) }`。
         · 进**存档**（不是 localStorage）：换设备也能靠云同步带走 ⇒ "每个码每个玩家只能领一次"
           在两台设备上同样成立；
         · 老档没有这一段 → `fillDefaults` 自动补成空表、从"一个都没领过"起；
         · 码表在 `js/data.js` 的 `GIFT_CODES`（**唯一真源**），这里只存"领过没"。
         ⚠️ 已知取舍：本机记的账挡得住重复点，**挡不住改档的人** —— 这一批码本来就是公开送的
            新手礼包，所以接受（见 data.js 那张表上的两条说明）；将来发限时码要搬去服务端。 */
      gifts:  getProxied({}),
      // bonus：额外扫荡额度（由玩法自行发放的临时加次数；网页版不发，恒为 0，跨天清零）
      /* V1.1.8（B6）：`bonus` ＝ 灯阁权限的额外额度；`adBonus` ＝ 广告买来的额度（两本账分开记） */
      sweep:  getProxied({ date: '', count: 0, bonus: 0, adBonus: 0 }),
      tasks:  getProxied({ date: '', daily:  getProxied({}), claimed:  getProxied({}), allClaimed: false, weekKey: '', weekly:  getProxied({}), weeklyClaimed:  getProxied({}), weeklyAllClaimed: false }),
      /* V1.1.8（B8）：`doubledDay` ＝ 哪一天已经翻过倍（只翻当天那一格、不补历史） */
      login:  getProxied({ day: 0, round: 1, lastClaim: '', doubledDay: '', comeback: '' }),
      idle:  getProxied({ bankSec: 0, lastTs: Date.now(), lines:  getProxied({ cultivate: null, gather: null, explore: null, guard: null }) }),
      bounty:  getProxied({ start: Date.now(), claimed:  getProxied({}), list: null, rev: 0 }),   // 限时悬赏：list 按当前进度生成，本期固定（rev 见 migrate）
      beast:  getProxied({ owned:  getProxied({}), active: null }),                       // 伴生体：owned[id] = {lv, soul}；active = 随行的那只
      stats:  getProxied({ battles: 0, wins: 0, bosses: 0, runs: 0, recruits: 0, enhances: 0, bestFloor: 0, profileViews: 0,
        taskClaims: 0, signDraws: 0 }),   // V9.6.74：主线新步骤要用的两个计数（老档没有 → 一律 || 0 兜底）
      /* ================= V1.0.4 · W（游戏圈活跃任务的三个计数）=================
         父亲大人 09-27：「7，可以」（游戏圈活跃任务 / 每日抽奖）。平台侧的活动任务要问我们
         "这个玩家达成了没"，判据只能来自玩家自己的档 —— 所以这里有三个**只涨**的计数：
           · `loginDays` 累计登录天数（跨天在 `ensureDaily` 里 +1）；
           · `playSec`   累计在线秒数（`actTick()` 按心跳累加，一天封顶 8 小时防挂机刷）；
           · 通关次数不在这里 —— 直接复用已有的 `S.stats.runs`（累计通关副本关卡，转生不清）。
         ⚠️ **不是新系统**：它不进任何奖励环、不改任何数值、界面上一个字都不显示
            （唯一出口是 `Core.actSnapshot()`，客户端推档时顺手带一小块数字給云函数）。
            `lastTickAt` / `day` / `daySec` 只服务于"防改时间"，不往外发。
         老档没有这一段 → `fillDefaults` 自动补空、从 0 起（见 scripts/activity_audit.js ④）。 */
      /* ================= V1.0.4 · X（订阅消息 · 父亲大人「2，可以」）=================
         多两个**随档上云**的数（都是数字，绝不含身份信息）：
           · `subMsg`      玩家有没有订阅"收益满了提醒我"（0/1）；
           · `bankFullAt`  挂机银行**满**的时刻（毫秒；没满＝0）。
         云函数 `notify` 靠这两个数（＋"满那一刻能收多少"的 `bankAmount`）决定发不发服务通知。
         ⚠️ **"这一次满已经发过"的记号不在这里**：那一位是**云端写在记录顶层的 `notifyAt`**
            （见 cloudfunctions/notify/index.js）。写在 `act` 里存不住 —— 推档是**整块覆盖** `act`
            （`js/sc-cloud.js` 的 `data.act = act`），本地这份永远不知道该位被云端改过，
            下一次推档一覆盖就没了 ⇒ 判据会以为"没发过"，同一份满被一遍遍重发。
            （这条是 X 轮复核时实测出来的，别再搬回去。） */
      act:  getProxied({ day: '', loginDays: 0, playSec: 0, daySec: 0, lastTickAt: 0,
        subMsg: 0, bankFullAt: 0 }),
      /* V9.6.115（父亲大人）：自动战斗整条下线 —— 默认值里也不留这个键（老存里的残留值没人读了）。
         autoNext 保留（结算 5 秒自动进下一关）。 */
      /* V1.1.x（2026-09-27 · 音频系统）：`bgm` / `sfx` ＝ 音乐 / 音效两个开关，**默认都开**。
         老档没有这两个键 → 下面 migrate 那句 `S.settings = Object.assign(def.settings, S.settings || …)`
         会把默认值补上（老玩家进游戏照样有声音；见 scripts/audio_audit.js ③）。 */
      /* V1.0.4 · T（父亲大人 09-27 第 14 条）：`savePower` ＝ 省电模式开关，**默认关**。
         老档没有这个键 → `fillDefaults`（本函数返回的默认结构）**自动补空成 false**，
         与 bgm / sfx / favAt 同一条路：**不用写迁移，packSave / unpackSave / SAVE_KEY 那五个口子一个字没动**。
         （存档里它就是 settings 下的一个布尔，`js/wx-cap.js` 的 CAP.powerOn() / `js/audio.js` 的 bgmOn() 读它。） */
      /* `subMsg`（V1.0.4 · X）：玩家有没有订阅"收益满了提醒我"。默认 false —— 订阅必须玩家**自己点**。 */
      settings:  getProxied({ speed: 1, autoSellN: false, autoSellR: false, bgm: true, sfx: true, autoNext: true, savePower: false, subMsg: false }),
      codex:  getProxied({ chars:  getProxied([]), equipNames:  getProxied([]), equipsSeen: 0, claimed:  getProxied([]) }),
      achievements:  getProxied({}),       // achId → true（已领取）
      presets:  getProxied([null, null, null]),   // 3 组编队预设（保存队伍成员）
      pendingRun: null,       // 未打完的副本进度：刷新 / 切后台回来可以继续
      unlocks:  getProxied({}),
      quests:  getProxied({ claimed:  getProxied([]) }),
      ssrTicket: 0,
      /* V1.0.4 · R8（父亲大人 09-27 点单：「收藏事件」）：玩家点右上角"收藏"的那一天。
         一个时间戳就够（0 ＝ 没收藏过），**老档由 fillDefaults 自动补空**，不用写迁移；
         只在"进游戏说一句话"这一处用（`js/wx-cap.js`），不进任何奖励环、不算数值。 */
      favAt: 0,
    });
  }

  let suppressSave = false;
  let saveFailed = false;
  /* V9.6.113：这一次读进来的存档是不是"很老的那种"（判断必须看**原始数据**，
     因为在 fillDefaults 补齐之后，"老档没有、新档才有"的字段就再也分不出来了）。 */
  let legacyRaw = false;
  /* V9.6.92：**离线窗口只在结算过之后才允许被"存盘盖章"**。
     背景：save() 里那句 `S.idle.lastTs = Date.now()` 是有意行为（存盘 = 刚见过玩家），
     但它有个致命前提 —— 开机必须先 settleOffline 再存盘。
     只要开机流程里在结算之前多一次存盘（引导漏斗统计、下架道具退款提示、某个 UI 初始化……），
     离线几小时的收益就被那一下悄悄抹掉，玩家只会觉得"我明明关了几小时，怎么什么都没有"。
     小游戏 V9.6.90 真的踩到了（coachFunnel 在首帧渲染时存了一次）。
     现在改成：**载入存档后、结算完成前，任何存盘都不动 lastTs**。 */
  let offlineSettled = false;
  /* ================= V1.1.20（F1-1 · 阻塞级）：`savedAt` 的两道闸 =================
     上面那条（offlineSettled）管的是 `idle.lastTs` —— 那是"离线窗口"，权威用法在 settleOffline。
     本条新加的是**"谁新听谁的"判据（savedAt）**，它比 idle.lastTs 严一档，多两道闸：
       ① `settleWriting`：settleOffline 自己那一段写盘（＝开机自愈/结算）—— 玩家这时还没进游戏，
          **一个字都不许刷**。这就是那条阻塞级的根因（原来开机结算把判据盖成"现在"）。
       ② `save({auto:true})`：自动存盘（15 秒心跳、开机那几条提示）—— 照常落盘、也照常推
          idle.lastTs，但**不算玩家在玩**。没有这道闸，"开着游戏发呆"也会把判据推成"现在"，
          玩家回到另一台设备就拉不到云上更新的那份。 */
  let settleWriting = false;
  function save(opt) {
    if (suppressSave) return;
    const auto = !!(opt && opt.auto);
    if (offlineSettled && !settleWriting) {
      const now = Date.now();
      S.idle.lastTs = now;                 // 存盘 = 刚见过玩家（V9.6.92 的既有口径，离线窗口用它）
      if (!auto) S.savedAt = now;          // F1-1：只有玩家驱动的那几次存盘才算"真的在玩"
    }
    try {
      const wrote = localStorage.setItem(SAVE_KEY, packSave(S));
      /* F1-3：写盘失败**不许被静默吞掉** —— 适配层的 localStorage 现在失败会抛（真异常走 catch），
         这里再认一次它返回的 false（老垫片 / 尺子的假环境只返回布尔，不会抛）。 */
      if (wrote === false) throw new Error('storage setItem returned false');
      saveFailed = false;
    } catch (e) {
      // 存储不可用（隐私模式）/ 配额满：只提示一次，别让玩家打完一整局才发现没存上
      if (!saveFailed) {
        saveFailed = true;
        /* V1.1.20（F1-3）：原来这句指的是「设置 → 导出存档」—— 那个入口父亲大人 09-27 已经撤了
           （存档那一块收口成唯一一颗「找回存档」）。指一个不存在的入口＝玩家照做也找不到东西。 */
        notice('⚠ 存档写入失败：微信存储写不进去（可能已满或不可用），请到「设置 → 找回存档」看看有没有旧备份，或清理一下微信存储后重试');
      }
      try { console.warn('[save] 写盘失败（这次进度没落盘）：' + (e && e.message)); } catch (e2) {}
    }
  }
  /* ================= 渲染前的兜底闸（V1.0.6 · P0 提审驳回：真机"卡在此界面"） =================
     `S` 为 null 时：**先试着读档，读不出来才建档**，并把"怎么救的"返回给调用方。
     为什么这条放在 core、而不是塞进每个渲染入口：只有这里知道"读档优先、建档兜底"的次序；
     渲染入口（小游戏 cv.js 的 CV.render / 网页版 ui.js 的 render）只负责"发现 null 就叫它一声"。
     ⚠️ 必须**出声**（console.warn）：走到这里说明开机顺序出了岔子（正常开机绝不会走到），
        静默救回来＝把事故藏起来。
     ⚠️ 它只是兜底：根因是 game.js（小游戏）把建档排在一切渲染/事件注册之前。 */
  function ensureState() {
    if (S) return 'ok';
    let loaded = false;
    try { loaded = load(); } catch (e) { loaded = false; }
    /* V1.1.20（F1-5）：这条也是"开机兜底"（不是玩家选择）—— 读不出来时照样禁写。 */
    if (!loaded) { newGame({ keepRescue: true }); ensureDaily(); }
    try {
      console.warn('[boot] 渲染前发现 S=null：' + (loaded ? '已重新读档' : '已先建内存档')
        + '，界面继续画（正常开机不该走到这里，请把这条日志交给康康）');
    } catch (e) {}
    return loaded ? 'rescued:loaded' : 'rescued:new';
  }
  // 彻底删除进度（阻止 beforeunload 等钩子重新写入）
  function wipeSave() {
    /* V9.6.100（父亲大人给的复现步骤："开局选一个血统 → 设置里删档重开 → 选另一个血统 →
       进游戏还是旧血统"）：这里原来**只删硬盘上的档，没清内存里的 S**。
       于是删档之后内存里还是旧那个主角（血统还挂着）——
       再选血统时 choosePlayerBloodline 第一句就是 `if (S.player.bloodline) return 失败`，
       新选择被拒绝，界面又没看返回值、照样把人放进游戏 → 玩家看到旧血统。
       （网页版之所以没这毛病：它删完档会 location.reload()，内存跟着一起清。）
       另外 suppressSave 原来是**开了不关**：就算不 reload，之后所有存盘都是空操作，
       玩家重开这一局玩多久都不会落盘。现在两件事一起修：
       删档 = 真的回到"全新档"（内存 + 硬盘 + 存盘开关）。 */
    S = defaultState();
    offlineSettled = true;      // 全新档没有离线窗口要保
    lastLoadIssue = null;       // 玩家自己按的"删档"＝这条诊断该收起来了（V1.1.15）
    rescue = null;              // V1.1.20（F1-5）：玩家**自己选**的"删档重开"＝救援态到期（他明确不要那份了）
    /* suppressSave 仍然保持"关着"：网页版删完档会立刻 reload，
       期间任何一次 beforeunload / 定时存盘都不许把**旧档写回去**（这是它原来的用处）。
       存盘开关由 newGame() 负责恢复 —— "开始新游戏"才代表真的重新开始。 */
    suppressSave = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  function load() {
    /* V9.6.113：读档分成"能读 / 读不出但保住"两条路，任何一条都不许毁数据 */
    /* V1.1.20（F1-1 的连带）：**这一句必须在最前面** —— migrate() 里有一处 `save()`（碎片合并），
       而从第二次 load 开始，`offlineSettled` 可能还留着上一次 settleOffline 的 true；
       那样一来"读档过程中"的存盘就会把 idle.lastTs / savedAt 盖成现在（离线窗口与判据一起被抹）。
       读档路径上的存盘一律不许盖章 —— 与 V9.6.92 那条不变量同一个口径，只是提前到第一行。 */
    offlineSettled = false;
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    let data = null;
    try {
      data =  getProxied(JSON.parse(unpackSave(raw)));
    } catch (e) {
      /* 原因细分（V1.1.15）：`enc` = 密文解不开（档多半还在，只是这一版读不懂）；`json` = 明文本身坏了。 */
      const why = lastUnpackIssue || 'json';
      lastLoadIssue = issue(why, raw, e);
      backupSave(raw, why);
      enterRescue(why, raw);
      return false;
    }
    if (!data || typeof data !== 'object') { lastLoadIssue = issue('shape', raw); backupSave(raw, 'shape'); enterRescue('shape', raw); return false; }
    const ver = Number(data.v || 0);
    /* 来自**更高版本**的存档（玩家装过新版又回到旧版）：不覆盖、不删，原样备份后退出去 */
    if (ver > SAVE_VER) { lastLoadIssue = issue('future-v' + ver, raw); backupSave(raw, 'future-v' + ver); enterRescue('future-v' + ver, raw); return false; }
    legacyRaw = (data.c001Merged === undefined) && (data.altPlayers === undefined) && (data.fabao === undefined);
    /* 缺字段自动补齐（新系统上线后老档也能直接读），再跑语义迁移（改名 / 换算 / 退款这类） */
    S = fillDefaults(defaultState(), data);
    S.v = SAVE_VER;
    /* V1.1.15（2026-09-27 · P0）：**迁移抛异常 ≠ 存档坏了**。
       原来 `migrate()` 裸调，任何一个字段对不上就一路抛到开机流程 ——
       表现就是"更了个版本，我的档没了"（其实是新档顶上来把它盖了）。
       现在：迁移出错只记一笔、游戏照常进（数据按"已读到的样子"用），并留下 `loadIssue` 给界面报。 */
    try { migrate(); }
    catch (e) {
      lastLoadIssue = issue('migrate:' + (e && e.message ? e.message : 'unknown'), raw);
      /* ⚠️ 这一行是 2026-09-27 审计补的：迁移出错时，**原档必须先留一份**。
         实测过（`equips` 里塞 null 的那种档）：迁移抛错 → 我们让它"按已读到的样子继续"，
         玩家接着玩 → 15 秒后心跳把**这份半迁移的档**写盘 → 原始档就真的没了。
         留了备份，最坏情况也只是"设置页里有旧档可恢复"。 */
      backupSave(raw, 'migrate');
      try { console.warn('[save] 迁移这一步出错了，进度按已读到的样子保留：' + (e && e.message)); } catch (e2) {}
    }
    /* 刚读进来的存档带着"上次见到玩家"的时间戳 —— 在 settleOffline 跑来认领它之前，
       中途任何一次存盘都不许把它冲掉（V9.6.92，见 save() 与 offlineSettled 的说明）。 */
    offlineSettled = false;
    return true;
  }
  /* 读档失败时**先备份**：玩家的一点进度都不许因为一次更新凭空消失。
     备份里连"什么时候、为什么读不出来"一起记，出了问题能追。 */
  let lastBackupIssue = null;          // V1.1.20（F1-5）：备份**没写下来**这件事本身也要留痕（原来静默）
  function backupSave(raw, why) {
    try {
      /* V1.1.15（2026-09-27 · P0"我手里的存档没了"）：**备份只许变好，不许变坏** ——
         原来每次读档失败都无脑覆盖 `_bak`：万一某次失败是个"小毛病"（比如迁移抛错），
         它会把上一次*真正读得出来*的那份好备份冲掉。现在先看旧的能不能读，
         旧的好、新的坏 → 保留旧的。 */
      const old = localStorage.getItem(SAVE_BAK);
      if (old) {
        try {
          const o = JSON.parse(old);
          const oOk = o && o.raw && (function () { try { return !!(JSON.parse(unpackSave(o.raw))); } catch (e) { return false; } })();
          const nOk = (function () { try { return !!(JSON.parse(unpackSave(String(raw)))); } catch (e) { return false; } })();
          if (oOk && !nOk) return;                       // 旧备份读得出、新的读不出 → 别覆盖
        } catch (e) { /* 旧备份自己也坏了 → 让新的盖上（新的至少是最近那份） */ }
      }
      localStorage.setItem(SAVE_BAK, JSON.stringify( getProxied({ at: Date.now(), why: why || 'unknown', raw: String(raw) })));
    } catch (e) {
      /* V1.1.20（F1-5）：**备份写不下就没声了** —— 那条是玩家的最后一条救命绳，必须出声。
         （原来这里是空 catch：主档读不出来、备份又没写上，玩家和我们都拿不到任何线索。） */
      lastBackupIssue =  getProxied({ at: Date.now(), why: String(why || 'unknown'), err: String((e && e.message) || '') });
      try { console.warn('[save] 读档失败时那份**原样备份没写下来**（why=' + lastBackupIssue.why + '）：' + lastBackupIssue.err
        + ' —— 主档还在原地没动，但请尽快把这条日志交给康康'); } catch (e2) {}
    }
  }
  /* ================= V1.1.20（F1-5 · 严重）：读档失败 / 更高版本 → **救援态（禁写）** =================
     与文件头那句口径对齐：「万一真读不出来（文件损坏 / 来自更高版本），先把原始内容原样备份再退出去，
     **绝不让玩家的一点进度被下一次存盘悄悄覆盖掉**」。
     原来这条只有前半句做到了 —— 备份是"尽力而为"，而覆盖是**立刻发生**的：
     读不出来 → game.js 走 `Core.newGame()` → newGame 里那句 `save()` 当场把主键写成一份空新档；
     紧接着 15 秒心跳也照写。玩家那一份（也许只是这一版读不懂、下个版本就能读）就这么被顶掉了。
     现在：读不出来就进**救援态** —— `suppressSave = true`，主键一个字节都不许动，
     等玩家**显式选择**（① 开机那个弹窗点「继续新档」＝ rescueConfirmNewGame；② 设置页的「找回存档」
     恢复成功；③ 设置页的「删档重开」）才解闸。三条都是"玩家自己按的"，没有一条是自动的。
     ⚠️ 救援态里**云同步也停**（sc-cloud 的 sync/push 读 rescueInfo）：那时的内存档是空新档，
       推上去等于把玩家云上那份真进度顶掉（还会把 `_bak` 里那份原文覆盖掉）。 */
  let rescue = null;
  function enterRescue(why, raw) {
    if (rescue) return rescue;                    // 已经是救援态：不覆盖原因，只留第一次那一条
    rescue =  getProxied({ why: String(why || 'unknown'), at: Date.now(), len: String(raw == null ? '' : raw).length });
    suppressSave = true;                          // ← 主键禁写（本档想在救援态里活下来）
    try { console.warn('[save] 读档失败 → 进入救援态（自动存盘已停，等玩家显式选择）：' + rescue.why); } catch (e) {}
    return rescue;
  }
  function rescueInfo() { return rescue; }
  /** 玩家显式选择「继续新档」：解闸 + 立刻落一份新档（这一刻起主键才允许被覆盖）。 */
  function rescueConfirmNewGame() {
    if (!rescue) return false;
    rescue = null;
    suppressSave = false;
    save();
    return true;
  }
  /* ================= V1.1.15（2026-09-27 · P0「我手里的存档没了」）=================
     背景：父亲大人重新上传到手机之后，手里的进度不见了。老实说 —— **先修好这三件事**，
     因为不管这次到底是哪条路径，老代码都有同一个结构性毛病：
       · 读档失败**没有任何出口** —— 玩家看到的就是"档没了"，康康这边也拿不到"哪一步坏的"；
       · 读不出来之后，新档一存盘就把主档盖了（原始串只躺在 `_bak` 里，没人能拿到）；
       · `migrate()` 抛异常一路抛到开机流程（表现同样是"档没了"）。
     三道保险：① `saveDiag()` 把"本机到底有什么"摊开（设置页显示，父亲大人念一句就知道）；
               ② `restoreFromBackup()` 一键把 `_bak` 里那份救回来；
               ③ `migrate` 出错不再致命、备份不被坏的覆盖（见 backupSave）。 */
  let lastLoadIssue = null;
  const issue = (why, raw, e) => ({ why: why, at: Date.now(), len: String(raw == null ? '' : raw).length,
    err: (e && e.message) ? e.message : '' });
  function loadIssue() { return lastLoadIssue; }
  function backupInfo() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(SAVE_BAK) || 'null'); } catch (e) { o = null; }
    if (!o || !o.raw) return { exists: false };
    let readable = false;
    try { readable = !!JSON.parse(unpackSave(o.raw)); } catch (e) { readable = false; }
    return { exists: true, at: o.at || 0, why: o.why || '', len: String(o.raw).length, readable: readable };
  }
  function restoreFromBackup() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(SAVE_BAK) || 'null'); } catch (e) { o = null; }
    if (!o || !o.raw) return  getProxied({ ok: false, msg: '本机没有备份' });
    let data = null;
    try { data = JSON.parse(unpackSave(o.raw)); }
    catch (e) { return  getProxied({ ok: false, msg: '备份也读不出来（' + (e.message || '未知') + '）' }); }
    if (!data || typeof data !== 'object') return  getProxied({ ok: false, msg: '备份内容不像存档' });
    /* 恢复之前先把"当前这份"留一手（父亲大人可能只是试一下）—— 存在 `_pre_restore`，不参与自动读写。 */
    try { const cur = localStorage.getItem(SAVE_KEY); if (cur) localStorage.setItem(SAVE_KEY + '_pre_restore', cur); } catch (e) {}
    S = fillDefaults(defaultState(), data);
    S.v = SAVE_VER;
    try { migrate(); } catch (e) { /* 恢复优先：迁移这一步出问题也不拦着玩家把进度拿回来 */ }
    lastLoadIssue = null;
    /* V1.1.20（F1-5 / F1-2）：恢复成功＝玩家**显式**选定了这份档 —— 救援态到此结束（主键可以写了）。 */
    rescue = null;
    /* savedAt 按"现在"（与"删档重开 / 新档"同一口径）：玩家这一下是明确要这一份。
       —— 若不盖，这份档会因为 savedAt 老（老档补的是 idle.lastTs）被云上那份盖回去。 */
    S.savedAt = Date.now();
    /* V1.1.20（F1-2）：这份档自带的**离线窗口要补跑一次**。
       原来这里直接 `offlineSettled = true; save();` —— 等于把那份档的 idle.lastTs 盖章成"现在"，
       它自带的离线收益（比如"8 小时没玩"那一段）当场归零。现在：闸门先关回去，按它自己的
       时间戳补跑一次结算（沿用开机那一条唯一的结算函数），再落盘。 */
    offlineSettled = false;
    try { settleOffline(); } catch (e) { /* 补结算出错不该拦着"把进度拿回来"这件事本身 */ }
    offlineSettled = true;
    save();
    return  getProxied({ ok: true, at: o.at || 0, msg: '已恢复到 ' + (o.at ? new Date(o.at).toLocaleString() : '备份那份') });
  }
  function saveDiag() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    return  getProxied({
      key: SAVE_KEY, has: !!raw, len: raw ? String(raw).length : 0,
      enc: !!raw && String(raw).slice(0, 5) === 'MPG1:',
      ver: (S && S.v) || 0, bak: backupInfo(), issue: lastLoadIssue,
      /* V1.1.20（F1-1 / F1-5）：判据时刻、救援态、以及"备份没写下来"那条 —— 设置页/日志看它 */
      savedAt: (S && S.savedAt) || 0, rescue: rescue, backupFailed: lastBackupIssue,
    });
  }
  /* 按默认结构**递归**补齐：缺的字段给默认值，多出来的字段原样保留。
     数组（背包槽、阵容、技能等级…）以存档里的为准，长度也不强行改 —— 交给 migrate 决定。 */
  function fillDefaults(def, data) {
    if (Array.isArray(def)) return Array.isArray(data) ? data : def.slice();
    if (def && typeof def === 'object') {
      const out =  getProxied({});
      const src = (data && typeof data === 'object' && !Array.isArray(data)) ? data :  getProxied({});
      Object.keys(def).forEach(function (k) {
        out[k] = Object.prototype.hasOwnProperty.call(src, k) ? fillDefaults(def[k], src[k]) : def[k];
      });
      Object.keys(src).forEach(function (k) { if (!(k in out)) out[k] = src[k]; });   // 多出来的字段别丢
      return out;
    }
    return (data === undefined) ? def : data;
  }
  // 上阵 5 格归一化：0/1 前排，2/3/4 后排；'@player' 一定在里面（主角必上阵）。
  // 老存档是 4 格且主角不占位，按他原来站的那一排把他插进去，其它人顺序不变。
  function normalizeParty(raw, oldRow) {
    const src = (Array.isArray(raw) ? raw :  getProxied([])).slice(0, 5);
    if (src.indexOf('@player') >= 0) {
      // 已经是新结构：只补长度、清掉不再拥有的角色
      while (src.length < 5) src.push(null);
      return src.map(id => (id === '@player' || (id && S.chars && S.chars[id])) ? id : null);
    }
    const mates = src.filter(id => id && S.chars && S.chars[id]);
    const arr = oldRow === 'back'
      ?  getProxied([mates[0] || null, mates[1] || null, '@player', mates[2] || null, mates[3] || null])
      :  getProxied(['@player', mates[0] || null, mates[1] || null, mates[2] || null, mates[3] || null]);
    while (arr.length < 5) arr.push(null);
    return arr.slice(0, 5);
  }
  // 旧档迁移：C001 林默不再是主角占位，主角为独立实体
 function migrate() {
    const def = defaultState();
    /* ================= V1.1.20（F1-1）：老档补 `savedAt` =================
       没有这个字段的老档（本字段是 09-28 才加的）**不许判成 0** —— 0 会让云端那份（哪怕更旧）
       无条件盖上来。兜底就用它唯一的"最后落盘时刻" `idle.lastTs`；连那个也没有（理论上不会，
       defaultState 的 idle.lastTs 就是 Date.now()）就用"现在" —— 宁可本机保守一点，
       也别把一份活着的档判成"从来没玩过"。
       幂等：本字段一旦 > 0 就不再进这段（老档只会被补一次）。 */
    if (!(S.savedAt > 0)) S.savedAt = Math.max(0, Number(S.idle && S.idle.lastTs) || 0) || Date.now();
    S.stats = Object.assign(def.stats, S.stats ||  getProxied({}));
    // V8.0 新增的三块（灯阁评级 / 秘术阁 / 挂机游历）：老档补默认值，缺字段不会读出 undefined
    S.sect = Object.assign( getProxied({ lv: 1, exp: 0 }), S.sect ||  getProxied({}));
    S.keji = S.keji ||  getProxied({});
    S.travel = Object.assign( getProxied({ bankSec: 0, pending: null, got: 0, round: 0, day: '' }), S.travel ||  getProxied({}));
    if (typeof S.charExp !== 'number') S.charExp = 0;
    // 老档：把每个人身上攒的零散经验并进共享池（不丢东西）
    Object.values(S.chars ||  getProxied({})).forEach(c => { if (c && c.exp) { S.charExp += c.exp; c.exp = 0; } });
    /* V9.6.129：碎片从"每人各攒"改成"按稀有度公共池" —— 老存档把各人身上的碎片**原样并入**池子，
       一点不丢；跑过一次就把标记写上（S.shardPoolMerged），不再重复累加。 */
    if (!S.shardPool) S.shardPool =  getProxied({ N: 0, R: 0, SR: 0, SSR: 0, UR: 0 });
    /* V9.6.134：货币 8 → 4 —— 老存档手里的旧币**折算并入新币，一点不丢**。
       折算率取"这个池子的日收入 ÷ 旧币的日收入"（跟价格那边的系数同源），所以
       玩家攒了"能买几件东西"的购买力在合并前后是一样的，不是随手给个数。
       跑过一次就写标记，不再重复累加。 */
    if (!S.curMerged4) {
      const c = S.cur || (S.cur =  getProxied({}));
      const n = (k) => Math.max(0, Math.floor(c[k] || 0));
      // 故事点 → 点数（点数池 50418/天 ÷ 故事点 706/天 ≈ 71）
      if (c.story) { c.points = (c.points || 0) + n('story') * 71; delete c.story; }
      // 技能芯片 ×3.5、血统结晶 ×28、深井徽记 ×30 → 异界结晶（异界结晶池 1804/天）
      const addOw = n('skillChip') * 3.5 + n('bloodCrystal') * 28 + n('corridor') * 30;
      if (addOw) c.otherworld = (c.otherworld || 0) + Math.round(addOw);
      delete c.skillChip; delete c.bloodCrystal; delete c.corridor;
      S.curMerged4 = true;
    }
    if (!S.shardPoolMerged) {
      let moved = 0;
      Object.keys(S.chars ||  getProxied({})).forEach(function (id) {
        const c = S.chars[id]; const base = D.charById[id];
        if (!c || !base) return;
        const n = Math.max(0, Math.floor(c.shards || 0));
        if (n) { S.shardPool[base.rarity] = (S.shardPool[base.rarity] || 0) + n; moved += n; }
        c.shards = 0;
      });
      S.shardPoolMerged = true;
      if (moved) save();
    }
    S.garden = Object.assign(Array(def.garden.length).fill(null), S.garden ||  getProxied({}));
    S.arena = Object.assign( getProxied({ floor: 1, best: 1, date: '', used: 0 }), S.arena ||  getProxied({}));
    S.fabao = Object.assign( getProxied({ own:  getProxied([]), on: null }), S.fabao ||  getProxied({}));
    S.mount = Object.assign( getProxied({ own:  getProxied([]), on: null }), S.mount ||  getProxied({}));
    S.sign = Object.assign( getProxied({ date: '', tier: '', idlePct: 0, drawn: 0 }), S.sign ||  getProxied({}));
    // V8.3：主角也能选前后排（老档默认前排）
    S.player.row = S.player.row === 'back' ? 'back' : 'front';
    S.recruit = Object.assign(def.recruit, S.recruit ||  getProxied({}));
    // 招募保底从"两个散字段"改成"按池记账"；老档把旧计数搬过来，进度不丢
    S.recruit.pity = S.recruit.pity ||  getProxied({});
     getProxied([ getProxied(['advanced', 'pityAdvS', 'pityAdv']),  getProxied(['limited', 'pityLimS', 'pityLim'])]).forEach(([k, ssrKey, urKey]) => {
      const cur = S.recruit.pity[k] ||  getProxied({});
      S.recruit.pity[k] =  getProxied({
        ssr: cur.ssr || S.recruit[ssrKey] || 0,
        ur: cur.ur || S.recruit[urKey] || 0,
        up: cur.up || 0,
      });
      delete S.recruit[ssrKey];
      delete S.recruit[urKey];
    });
    S.idle.lines = Object.assign( getProxied({ cultivate: null, gather: null, explore: null, guard: null }), S.idle.lines ||  getProxied({}));
    S.bounty = Object.assign( getProxied({ start: Date.now(), claimed:  getProxied({}), list: null }), S.bounty ||  getProxied({}));
    S.bounty.claimed = S.bounty.claimed ||  getProxied({});
    /* V9.6.17（父亲大人："限时悬赏的时间还是没改"）：悬赏期**生成一次就写进存档**，
       只改数据表里的 hours 对老档无效（它那一期的截止时间是老的）。rev 对不上就丢掉这一期、
       按新表重新生成 —— 一次性迁移，之后 rev 就一致了。 */
    if (S.bounty.rev !== D.BOUNTY_REV) {
      S.bounty =  getProxied({ start: Date.now(), claimed:  getProxied({}), list: null, rev: D.BOUNTY_REV });
    }
    // 悬赏改成"按进度动态生成"，老档没有 list 就在这里补一份（不改变已领记录）
    if (!Array.isArray(S.bounty.list) || !S.bounty.list.length) S.bounty.list = D.makeBounties(S);
    S.beast = Object.assign( getProxied({ owned:  getProxied({}), active: null }), S.beast ||  getProxied({}));
    S.beast.owned = S.beast.owned ||  getProxied({});
    if (S.beast.active && !S.beast.owned[S.beast.active]) S.beast.active = null;
    S.player.realm = S.player.realm || 0;   // 已突破的境界（小阶）数
    // 境界从「10 个大境」改成「36 小阶」（见 data.js REALMS 注释）。
    // 老存档按「旧第 N 境 = 新第 4N 阶」换算：加成总量不变（旧 N×5% = 新 4N×1.4%），
    // 已解锁的内容一件不少；用 realmScaled 做一次性标记，避免每次读档都乘 4。
    // 注意：这个标记**不能**写进 defaultState（那会让老档也带着它，老档就永远不换算了），
    // 只能由 newGame() 在建档时落上——见 newGame 里的说明。
    if (!S.realmScaled) { S.player.realm = S.player.realm * 4; S.realmScaled = true; }
    S.auth = S.auth || 0;   // 灯阁权限等级
    S.sweep = Object.assign(def.sweep, S.sweep ||  getProxied({}));
    S.sweep.bonus = S.sweep.bonus || 0;
    /* V9.5.66（父亲大人）：探索消耗品整条线删掉（ITEMS 里已经没有它们了）。
       老存档背包 / 待领箱里可能还躺着几个——不清理的话，背包会画出一格名字是 undefined 的空格子，
       点进去还会报错。这里按**当时商店里的原价**退回 ◉ 点数（玩家是真买的，不能凭空吞掉）。
       退款天然只做一次：清掉之后存档里就没有这些 id 了，下次读档退不到东西。 */
    const retired = D.RETIRED_ITEMS ||  getProxied({});
    let retiredRefund = 0;
    Object.keys(retired).forEach(id => {
      const n = S.items[id] || 0;
      if (n > 0) { retiredRefund += n * retired[id]; delete S.items[id]; }
    });
    (S.stash ||  getProxied([])).forEach(x => {
      if (x && x.n > 0 && retired[x.id] !== undefined) { retiredRefund += x.n * retired[x.id]; x.n = 0; }
    });
    if (retiredRefund > 0) {
      S.stash = (S.stash ||  getProxied([])).filter(x => x && x.n > 0);
      S.cur.points += retiredRefund;
      S.retiredRefund = (S.retiredRefund || 0) + retiredRefund;
      S.retiredRefundPending = true;      // main.js 读到这一位就在开局给一次提示，不静默改玩家的钱
    }
    // 老存档补新字段：设置项 / 图鉴领取记录 / 登录轮次
    S.settings = Object.assign(def.settings, S.settings ||  getProxied({}));
    /* ================= V1.0.4 · A2②（父亲大人 2026-09-27 深夜：「**结算的自动下一关保留**，
       只是设置页里的不要」）=================
       事实：设置页那张「战斗」卡（＝自动进下一关）早先按他的要求**整张撤掉**了，
       可战斗页仍然读 `S.settings.autoNext` —— 于是**老档里把它关过**的玩家，
       现在**没有任何入口能再开回来**（每个结算页都会一直等他点，像卡住一样）。
       他现在的口径：**功能保留**（结算 5 秒自动进下一关照旧），只是不要设置页那张卡。
       ⇒ 迁移里**把这一位强制归正为 true**：玩家没有入口可改的东西，就不该留着他当年关过的状态。
       （战斗页那句判据一个字没动：`sc-battle.js` 仍然读 `settings.autoNext !== false`。） */
    S.settings.autoNext = true;
    S.tasks = Object.assign(def.tasks, S.tasks ||  getProxied({}));
    S.tasks.weekly = S.tasks.weekly ||  getProxied({});
    S.tasks.weeklyClaimed = S.tasks.weeklyClaimed ||  getProxied({});
    S.achievements = S.achievements ||  getProxied({});
    S.presets = Array.isArray(S.presets) ? S.presets.slice(0, 3) :  getProxied([null, null, null]);
    while (S.presets.length < 3) S.presets.push(null);
    S.pendingRun = S.pendingRun || null;
    S.serums = S.serums ||  getProxied({});   // 老档补齐：血清服用记录
    // 待领箱（背包满时的兜底）：老档补空数组，同时剔除脏条目
    S.stash = Array.isArray(S.stash) ? S.stash.filter(x => x && (x.n || 0) > 0 && D.ITEMS[x.id]) :  getProxied([]);
    /* ================= V1.1.15（2026-09-27 · 父亲大人："不行啊，那我要是副本掉落的装备呢"）==========
       装备待领箱（`S.stashEq`）：装备格满时掉的/开出来的装备先存这儿，扩容后一键领回。
       为什么必须有：原来满格是**强制折现成 ◆** —— 刷本出的 UR 就这么变成一点结晶，
       玩家扩容回来发现"装备没了"。道具那边早就有 `S.stash` 兜底，装备这条一直空着。
       ⚠️ 老档补空数组 + 剔除脏条目（uid/名字缺的不要），和 `S.stash` 同一套规矩。 */
    S.stashEq = Array.isArray(S.stashEq) ? S.stashEq.filter(e => e && e.uid && e.name && e.slot) :  getProxied([]);
    // 老档补齐：招募角色的装备槽从 3 个扩到 6 个（世界套装 4/6 件效果才可能触发）
    Object.keys(S.chars ||  getProxied({})).forEach(id => {
      S.equipped[id] = Object.assign( getProxied({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null }), S.equipped[id] ||  getProxied({}));
    });
    Object.values(S.equips ||  getProxied({})).forEach(e => { if (e.lock === undefined) e.lock = false; });
    /* V1.1.13（0927-E）：两档重铸带来的两个**新字段**（老装备按默认值读，**不补发炉火、
       不改老装备的词条** —— 谁都别占便宜、也谁都不吃亏，总监 §十）。
       ⚠️ 这两个字段只在"读取时缺就补"，**跑不跑都不影响老装备的词条与数值**。 */
    Object.values(S.equips ||  getProxied({})).forEach(e => {
      if (!e) return;
      if (!e.forge || typeof e.forge.n !== 'number') e.forge = { n: 0 };
      if (!Array.isArray(e.affixLock)) e.affixLock = [];
    });
    /* V9.6.81（父亲大人："现在的职业套装改成血统套装"）：老存档里的装备带着旧的 `classSet`（定位名，
       如 warrior）。按 LEGACY_KIND_SET 换成血统，名字前缀也跟着换（'战士·磁轨枪' → '狼人·磁轨枪'），
       玩家的套装不会凭空掉档。跑过一次存档里就没有 classSet 了，天然只迁移一次。 */
    Object.values(S.equips ||  getProxied({})).forEach(e => {
      if (!e || !e.classSet) return;
      const oldKind = e.classSet;
      const bl = (D.LEGACY_KIND_SET ||  getProxied({}))[oldKind] || null;
      e.bloodSet = bl;
      delete e.classSet;
      const oldName = (D.KIND_NAMES ||  getProxied({}))[oldKind];
      if (bl && oldName && typeof e.name === 'string' && e.name.indexOf(oldName + '·') === 0) {
        e.name = bl + e.name.slice(oldName.length);
      }
    });
    /* V9.6.82：血统套装改成"按世界"之后，老的血统件（只有 bloodSet、没有 bloodWorld）
       在套装卡里会显示成 0/6 却不知道为什么。给它们补上出处（第 10 张图，血统套装的最早一张），
       让它们仍然是有效的一套、能被计数。 */
    Object.values(S.equips ||  getProxied({})).forEach(e => {
      if (e && e.bloodSet && !e.bloodWorld) e.bloodWorld = D.WORLDS[Math.max(0, (D.BLOODLINE_MIN_WORLD || 10) - 1)].id;
    });
    /* V9.6.86：血统体系改成"血统即定位"，**魔法血统被删掉**（成员并入修真）。
       老存档里跟魔法血统有关的东西必须迁移，否则：主角的技能栏会指向一个不存在的血统（直接白屏级问题），
       玩家的魔法套装件也永远凑不齐。 */
    const BL_RENAME =  getProxied({ '魔法': '修真' });
    if (S.player && BL_RENAME[S.player.bloodline]) S.player.bloodline = BL_RENAME[S.player.bloodline];
    Object.values(S.equips ||  getProxied({})).forEach(e => {
      if (!e) return;
      if (e.bloodSet && BL_RENAME[e.bloodSet]) e.bloodSet = BL_RENAME[e.bloodSet];
      if (e.godSet && BL_RENAME[e.godSet]) e.godSet = BL_RENAME[e.godSet];
    });
    /* 2026-09-23（文案策划 · 备案改名：血族 → 绯红）：
       血统的 id **就是它的中文名**，所以"改个词"等于换 id —— 老存档里的
       S.player.bloodline / equip.bloodSet / equip.godSet 可能还是「血族」，
       不迁移就是"主角没命格 + 套装永远凑不齐"。装备名里的前缀（血族·／血族神装·）
       一起换，免得背包里新旧名字混着看。跑过一次存档里就没有「血族」了，天然只迁移一次。 */
    const BL_RENAME_V2 =  getProxied({ '血族': '绯红' });
    if (S.player && BL_RENAME_V2[S.player.bloodline]) S.player.bloodline = BL_RENAME_V2[S.player.bloodline];
    Object.values(S.equips ||  getProxied({})).forEach(e => {
      if (!e) return;
      if (e.bloodSet && BL_RENAME_V2[e.bloodSet]) e.bloodSet = BL_RENAME_V2[e.bloodSet];
      if (e.godSet && BL_RENAME_V2[e.godSet]) e.godSet = BL_RENAME_V2[e.godSet];
      if (typeof e.name !== 'string') return;
      if (e.name.indexOf('血族神装·') === 0) e.name = '绯红神装·' + e.name.slice(5);
      else if (e.name.indexOf('血族·') === 0) e.name = '绯红·' + e.name.slice(3);
    });
    /* 2026-09-23（文案策划 · 提审合规；创意总监《三维度审核》H1）：求签 → **点灯** 改壳。
       档位名（大吉/上吉/中吉/小吉/末吉 → 长明/炽光/明光/柔光/微光）**就是存进存档的值** ——
       `signState().pick` 是拿 `S.sign.tier` 去 `D.SIGNS` 里找同名的，不迁移就会出现
       "今天的面板写着【大吉】但灯焰文案是空的"。跑过一次存档里就没有旧档位名了，天然只迁移一次。
       只翻名字，不动 weight / gain / idlePct / date / drawn。 */
    const SIGN_RENAME =  getProxied({ '大吉': '长明', '上吉': '炽光', '中吉': '明光', '小吉': '柔光', '末吉': '微光' });
    if (S.sign && SIGN_RENAME[S.sign.tier]) S.sign.tier = SIGN_RENAME[S.sign.tier];
    /* 2026-09-23（文案策划 · 提审合规 · 48 小时整改）:幽都（ghost）装备名整批换壳（符咒 /
       佛珠 / 道袍 / 镇魂 / 缚灵 / 驱邪 / 镇宅 / 往生 那一套），修真血统的四件同源词一起换。
       装备名**是存进存档的值**（`data.makeEquip` 把 name 写进 `S.equips[uid].name`），
       不迁移就会出现"老玩家背包里还挂着一串符咒名"。跑过一次存档里就没有旧名了，天然只迁移一次。
       ⚠️ 只翻**显示名**：uid / slot / base / affixes / set / bloodSet / 强化等级一个都没动。
       ⚠️ 血统 / 神装的件带前缀（`修真·道冠` / `修真神装·符咒护手`），所以还要按"·"后的尾巴再对一次。
       ⚠️ 改 `data.js` 的 EQUIP_NAMES / BLOODLINE_EQUIP_NAMES 时，**一定要同时改这张表**。 */
    const EQUIP_NAME_RENAME =  getProxied({
      '镇魂铃': '沉铃', '驱邪短刃': '净尘短刃', '缚灵符剑': '束纹长剑',
      '符咒道袍': '沉纹长袍', '怨念披风': '旧纹披风', '镇宅法衣': '守宅长衣',
      '护身佛珠': '静心珠', '盐晶挂坠': '霜晶挂坠', '往生铜钱': '旧纹铜钱',
      '镇魂冠': '静默冠', '驱邪头巾': '净尘额巾', '符纸额带': '束纹额带',
      '缚灵手套': '束纹手套', '符咒护腕': '灰纹护腕', '镇魂臂甲': '静默臂甲',
      '疾行符靴': '轻行短靴', '镇魂护腿': '静默护腿', '游影绑腿': '沉影绑腿',
      '道冠': '云冠', '云纹道衣': '云纹长衣', '符咒护手': '灵纹护手', '玉符': '古玉佩',
      /* 2026-09-23（文案策划 · 合规岗体检报告 R6）：同源清扫 —— mystic 装备名「秘陵铠甲」→
         「秘纹铠甲」。它和 W29 的「第九碑陵」是同一个「陵」（陵墓语汇），上一轮只清世界名时漏了它。
         装备名是存进存档的值，所以这张迁移表必须同时改（上面那条 ⚠️ 就是为它写的）。 */
      '秘陵铠甲': '秘纹铠甲',
    });
    Object.values(S.equips ||  getProxied({})).forEach(e => {
      if (!e || typeof e.name !== 'string') return;
      if (EQUIP_NAME_RENAME[e.name]) { e.name = EQUIP_NAME_RENAME[e.name]; return; }
      const cut = e.name.lastIndexOf('·');
      if (cut <= 0) return;
      const tail = e.name.slice(cut + 1);
      if (EQUIP_NAME_RENAME[tail]) e.name = e.name.slice(0, cut + 1) + EQUIP_NAME_RENAME[tail];
    });
    /* ================= 2026-09-27（本命装备 36 件）· 老档手里那几件专属就地升级 =================
       父亲大人四条：专属词条 5 条 / 改绑第一 / 不要隐藏角色 / 每人一套本命。
       老玩家手里已有的专属（含最初那 6 件、全是武器）必须**就地升级**，不能留着当废件：
         · 词条补齐到 5 条 —— 按**新表里同部位那一件**重建（不是随手加两条凑数）；
         · **只有一件要改绑**：代行之刃（C120 灯阁代行者 ＝ 狼人第三）→ C111 黑田宗一（狼人第一），
           名字与 sigText 跟着换。另两件元素咏叹（C059 楚衍）/ 磐岩壁垒（C117 零式）**本来就绑的第一**
           —— 04:30 父亲大人修正"不要排除隐藏角色"之后，它们不用改绑、名字也不用换（见 data.js
           的 `SIGNATURE_LEGACY_BINDING` / `SIGNATURE_KEEP_NAME`）；
         · 基础值补到新系数（旧 ×1.15 → 新 ×1.30）—— 只补差、只补一次；整数仍是整数；
         · `uid` / `slot` / `enhance` / `lock` **原样保留**（玩家强化过的等级不许被重置）。
       幂等靠逐件标记 `sigRev`（**不写进 defaultState** —— 写进去老档就会先拿到默认值、这段永不执行）：
       跑两遍既不会变两件、也不会把词条再加一遍。认不出来的一律不动（宁可不迁，也不许改坏）。 */
    Object.keys(S.equips ||  getProxied({})).forEach(uid => {
      const e = S.equips[uid];
      if (!e || !e.charId) return;                          // 只有专属件带 charId
      if (e.sigRev === D.SIGNATURE_REV) return;             // 已经迁过
      const sigId = D.signatureIdOf(e);
      if (sigId < 0) return;
      const sig = D.SIGNATURE_EQUIPS[sigId];
      e.charId = sig.charId;
      e.name = sig.name;
      e.sigText = sig.text;
      e.slot = sig.slot;
      e.affixes = sig.affixes.map(a =>  getProxied({ k: a.k, v: a.v }));
      if (e.base) Object.keys(e.base).forEach(k => {
        const v = e.base[k] * D.SIGNATURE_BASE_RATIO;
        e.base[k] = Number.isInteger(e.base[k]) ? Math.round(v) : +v.toFixed(3);
      });
      e.sigRev = D.SIGNATURE_REV;
    });
    S.codex = Object.assign( getProxied({ chars:  getProxied([]), equipsSeen: 0 }), S.codex ||  getProxied({}));
    S.codex.claimed = Array.isArray(S.codex.claimed) ? S.codex.claimed :  getProxied([]);
    /* V1.1.3（A10 图鉴装备卷）：老档**回填** —— 玩家已经穿在身上 / 躺在背包里的装备名，
       一读档就该算进装备卷（不然老玩家打开灯录看到"0 / 232"，会以为收集进度被清了）。
       放在这里（并池容量合并之后）是材料《总落地清单》§2.2 点名的顺序：**容量合并 → 装备卷回填**。 */
    S.codex.equipNames = Array.isArray(S.codex.equipNames) ? S.codex.equipNames :  getProxied([]);
    Object.keys(S.equips ||  getProxied({})).forEach(uid => {
      const e = S.equips[uid];
      if (e && e.name && S.codex.equipNames.indexOf(e.name) < 0) S.codex.equipNames.push(e.name);
    });
    /* 2026-09-27（本命 36 件）· 装备卷名单**换了**：旧专属名（代行之刃 / 元素咏叹 / 磐岩壁垒）已不存在，
       而 `codexEquipNameList()` 也不再摊平出 C120 / weapon / 神装文案这些永远集不到的字符串。
       老档的 `equipNames` 里可能还挂着那些旧名 —— 不清掉的话，"已收集"会**超过总数**
       （收集数按"名字在不在名单里"算，collected 那一侧没有滤网）。只留现在还在名单里的名字。 */
    const validEquipNames =  getProxied({});
    D.codexEquipNameList().forEach(n => { validEquipNames[n] = 1; });
    S.codex.equipNames = S.codex.equipNames.filter(n => validEquipNames[n]);
    /* ================= V1.1.4（A12-F 第 4 块 · 老档入门包）=================
       《续2》§3.5 第 3 条：**内容 = 铭魂砂×5 ＋ 血髓晶×3**，条件 = 老档且**已经动过铭刻或命格**，
       **只发一次**。写在这里（材料表 → 两个报价 → 产出口 → 入门包）是《总落地清单》§1 那条硬线：
       顺序倒了的话，入门包会按**旧报价**判条件（旧报价不看材料，等于白判）。

       幂等**靠"这个字段在不在"**，不靠 `S.flags`（《续3》风险表 R7 点名：老档可能没有 `S.flags`，
       先补再判就会抛错；而且 flag 一旦被别处清掉就会重复发）。写法与 `realmScaled` 完全一样 ——
       **不写进 defaultState**（写进去 `fillDefaults` 会先给老档补上默认值，这段就永远不进），
       新档由 `newGame()` 在建档时落位。

       ⚠️ 数量**刻意小**（《续2》原话"它只是垫脚，不是补偿"）：老玩家当年按纯 ◆ 价买过的那些阶，
          **不倒欠材料、也不退那 25% 的 ◆**（§3.5 第 1/2 条，那正是往老档注入 14.6 万 ◆ 的口子）。 */
    if (S.a12Pack === undefined) {
      const touchedGene = (S.player.geneLock || 0) > 0;                       // 点过铭刻
      const touchedBlood = (S.player.bloodlineLv || 0) > 0                    // 主角命格
        || Object.keys(S.chars ||  getProxied({})).some(id => (((S.chars ||  getProxied({}))[id] ||  getProxied({})).bloodlineLv || 0) > 0);
      if (touchedGene || touchedBlood) {
        /* 装不下就进待领箱 —— 读档路径上不许有"发不出去就丢掉"的写法（同 migrate 里其它几段）。 */
         getProxied([['minghun_sha', 5], ['xuesui_jing', 3]]).forEach(([id, n]) => {
          if (!addItem(id, n)) stashItem(id, n);
        });
        S.a12PackGiven = true;
      }
      S.a12Pack = true;
      save();
    }
    S.login = Object.assign(def.login, S.login ||  getProxied({}));
    S.cur = Object.assign(def.cur, S.cur ||  getProxied({}));
    // ⚠️ 只跑一次：C001 是旧版"主角占位"，新版主角是独立实体。
    // 之前这段没有开关，**每次读档都会跑**——玩家只要抽到 C001（他很普通池里 N 档 6 人之一），
    // 下次开游戏角色就被删掉，花的货币不退（V9.2 修）。
    /* V9.6.113：只对**真的很老**的档跑这段（既没有标记、也没有后来才有的系统）。
       否则"新玩家抽到 C001 → 下次开机被删"这种事会一直发生。 */
    const legacySave = legacyRaw || ((S.c001Merged === undefined) && !S.altPlayers && !S.fabao);
    if (S.chars && S.chars['C001'] && legacySave) {
      // 转移 C001 装备到主角
      const old = (S.equipped && S.equipped['C001']) ||  getProxied({});
      const slots = S.equipped['@player'];
       getProxied(['weapon', 'armor', 'accessory']).forEach(k => { if (old[k] && !slots[k]) slots[k] = old[k]; });
      delete S.equipped['C001'];
      delete S.chars['C001'];
      if (S.codex && S.codex.chars) S.codex.chars = S.codex.chars.filter(x => x !== 'C001');
      S.c001Merged = true;
    }
    if (!S.c001Merged) {
      /* 只对老档动手（把占位的 C001 从阵容里摘掉）；现代档缺标记时，**只补标记、不动数据** */
      if (legacySave && S.party) S.party = S.party.map(id => (id === 'C001' ? null : id));
      S.c001Merged = true;
    }
    // V8.3：上阵位从「4 格（主角不占位）」改成「5 格（前 2 后 3，主角占一格）」
    S.party = normalizeParty(S.party, S.player.row);
    if (Array.isArray(S.presets)) S.presets = S.presets.map(p => (p ? normalizeParty(p, 'front') : p));
    if (!S.equipped['@player']) S.equipped['@player'] =  getProxied({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null });
    // V8.3：老档里可能存在的"一件装备被多人穿"（旧版换装 / 一键最优装备留下的脏数据）——
    // 在装备槽补齐之后再修，只留给排在最前面的那个人
    dedupeEquips();
    S.player.bloodline = S.player.bloodline || null;
    S.player.bloodlineLv = S.player.bloodlineLv || 0;
    /* V9.5.83：老档里可能存着带 HTML 特殊字符的名字（名字会拼进界面模板）→ 读档时清一遍。
       V1.0.1（2026-09-23 · 平台违规警告 · P0）：线上老档里**已经存着违规名**的情况也要清 ——
       平台要求的就是【整改清除线上违规内容】，而玩家手机上的存档我们够不着，
       只能在他下次开局读档时清掉。所以这里给一个兜底：白名单外的名字直接**换成预设名**，
       而不是留空（留空会让界面显示成「主角」，玩家以为档坏了）。 */
    /* ⚠️ 兜底**必须是确定性的** —— 第一版这里写了 D.pickProtagName()，而它内部调 Math.random()；
       读档路径**多掷一次骰子**，后面所有依赖随机的模拟（战斗、掉落、测试）全错位，
       test_game 当场红了 2 条（治疗者必杀次数那两条）。读档不是玩游戏，不能有随机副作用。
       改成按原名长度在名单里取一个 —— 确定性、有变化、同名档每次进来结果一致。 */
    const nameFallback = function (old) {
      const n = String(old == null ? '' : old).length;
      return D.PROTAG_NAMES[n % D.PROTAG_NAMES.length];
    };
    /* ================= V1.0.4 · V（2026-09-27 · 自由命名 ＋ 内容安全机审）=================
       名字的保留判据多了一条出口：`nameAudited` 里记着"这一个名字是过了微信内容安全机审的"
       （`js/sc-namecheck.js` 过审后写、`setPlayerName` 落盘时写）。
       放行条件是**记着的那串字与当前名字一模一样** —— 这样：
         · 老档（没有 `nameAudited`）：判据还是"必须在名单里"，当年那个违规名照旧一个字都不留；
         · 本机刚过审的自由名字：读档不再被下面这行兜底换成预设名（否则玩家改完名字、
           退一次游戏，名字就自己变回去了）。
       ⚠️ 平台那条【整改清除线上违规内容】的口径没变：**名单外的、又拿不出过审凭据的，一律换掉。 */
    const keepName = function (p) {
      const listed = cleanName(p && p.name);
      if (listed) return listed;
      const raw = shapeName(p && p.name);
      /* ================= V1.0.4 · A2①（父亲大人 2026-09-27 深夜：「**现在有审核的话不用按老规则走了**」）===
         老规则（V1.0.1 那次平台违规警告的整改）：**名单外的名字一律换成预设名** ——
         当时是因为"自由输入已经关掉、拿不出过审凭据"，所以只能见一个清一个。
         现在**自由输入开回来了、而且每次输入都过微信内容安全机审**（`js/sc-namecheck.js`），
         这条老规则就只剩副作用：**老档里玩家自己起过的名字，读档时会被悄悄换成预设名**
         （玩家会说"我的名字被人改了"）。
         ⇒ 新口径：**读档放行老名字**（不在名单里也留）；**新输入照旧必须过机审**（那条一点没松）。
         平台"整改清除线上违规内容"这条要求仍由**输入侧**保证：能进来的名字都过审。 */
      if (raw) return raw;
      const signed = (p && p.nameAudited) ? shapeName(p.nameAudited) : '';
      return (raw && signed === raw) ? raw : '';
    };
    S.player.name = keepName(S.player) || nameFallback(S.player.name);
    (S.altPlayers ||  getProxied([])).forEach(p => { if (p) p.name = keepName(p) || nameFallback(p.name); });
    S.player.attrs = Object.assign(ATTR_ZERO(), S.player.attrs ||  getProxied({}));
    S.player.attrPoints = S.player.attrPoints || 0;
    /* V9.5.69：技能等级从 1 起改成 0 起。老档一次性把已点等级整体减 1（Lv.1→Lv.0），
       这样"实际强度"和"已花点数"都保持不变，不会因为改口径白送或白扣。
       用 skillZeroBased 这个一次性标记，避免每次读档都减。 */
    if (!S.skillZeroBased) {
      const conv = v => Math.max(0, (v || 1) - 1);
      S.player.skillLv = (S.player.skillLv ||  getProxied([1, 1, 1])).slice(0, 3).map(conv);
      Object.values(S.chars ||  getProxied({})).forEach(c => { if (c) c.skillLv = (c.skillLv ||  getProxied([1, 1, 1])).slice(0, 3).map(conv); });
      (S.altPlayers ||  getProxied([])).forEach(p => { if (p) p.skillLv = (p.skillLv ||  getProxied([1, 1, 1])).slice(0, 3).map(conv); });
      S.skillZeroBased = true;
    }
    /* V9.5.78：技能点改成"按等级算"的纯函数（skillPointsForLevel），
       老档与转生档都自动算对，不需要一次性标记，也不会重复发放。 */
    S.player.skillPoints = skillPointsForLevel();
    S.player.skillLv = (S.player.skillLv ||  getProxied([0, 0, 0])).slice(0, 3);
    /* V9.5.83：脏档洗净放**最后**跑——前面还有「技能 1 基→0 基」这类一次性换算，
       先洗会把越界的值夹住、再被换算改一次（实测技能等级会差 1 级）。洗净永远该是最后一道。 */
    sanitizeSave();
    if (S.player.skillPoints === undefined) {
      const spent = S.player.skillLv.reduce((s, x) => s + x, 0);     // 技能等级从 0 起，已花点数就是等级和
      // 技能点每 3 级 1 点，老档按同一口径补算，避免"老档凭空多出几十点"
      S.player.skillPoints = Math.max(0, Math.floor(S.player.level / D.SKILL_POINT_EVERY_LV) - spent);
    }
    S.altPlayers = Array.isArray(S.altPlayers) ? S.altPlayers :  getProxied([]);
    S.altPlayers.forEach(p => {
      p.attrs = Object.assign(ATTR_ZERO(), p.attrs ||  getProxied({}));
      p.attrPoints = p.attrPoints || 0;
      p.skillLv = (p.skillLv ||  getProxied([0, 0, 0])).slice(0, 3);
      if (p.skillPoints === undefined) {
        const spent = p.skillLv.reduce((s, x) => s + x, 0);
        p.skillPoints = Math.max(0, Math.floor(p.level / D.SKILL_POINT_EVERY_LV) - spent);
      }
    });
    // 背包从"道具+装备一个池子"改成三池分开（V9.2：道具 / 材料 / 装备）。
    // 老档的扩容次数同时算给三边：总格数只多不少，不会因为改版缩水。
    if (!S.bag || S.bag.itemCap === undefined) {
      const oldExpands = (S.bag && S.bag.expands) || 0;
      S.bag =  getProxied({
        itemCap: D.BAG_BASE_ITEM_CAP + oldExpands * D.BAG_EXPAND_SIZE, itemExpands: oldExpands,
        matCap: D.BAG_BASE_MAT_CAP + oldExpands * D.BAG_EXPAND_SIZE, matExpands: oldExpands,
        eqCap: D.BAG_BASE_EQ_CAP + oldExpands * D.BAG_EXPAND_SIZE, eqExpands: oldExpands,
      });
    }
    /* V1.1.1（背包四份样本 S4 抓到的真洞）：**极老档**（只有 `bag: { expands: N }`）在
       `fillDefaults` 那一步就已经被补上了 `itemCap: 50` —— 于是上面那个分支（判 itemCap 缺不缺）
       根本不进，老玩家**买过的扩容次数被静默丢掉**（本来 50+2×10=70，结果只剩 50）。
       这里补一条按"旧字段存在性"走的迁移：只要 `expands` 还在，就把三池的容量都抬到
       "基数 + 扩容次数×10"（**只多不少**，与上面那条同一个口径），并留一个幂等标记。 */
    if (S.bag && S.bag.expands !== undefined && !S.bag.mergedExpandsApplied) {
      const e = S.bag.expands || 0;
      getProxied(['item', 'mat', 'eq']).forEach(k => {
        const capKey = k + 'Cap', expKey = k + 'Expands';
        const base = { item: D.BAG_BASE_ITEM_CAP, mat: D.BAG_BASE_MAT_CAP, eq: D.BAG_BASE_EQ_CAP }[k];
        S.bag[capKey] = Math.max(S.bag[capKey] || 0, base + e * D.BAG_EXPAND_SIZE);
        S.bag[expKey] = Math.max(S.bag[expKey] || 0, e);
      });
      S.bag.mergedExpandsApplied = true;
    }
    if (S.bag.matCap === undefined) {   // V9.2 中途有过"只有两池"的版本，补上材料池
      S.bag.matCap = D.BAG_BASE_MAT_CAP; S.bag.matExpands = 0;
    }
    // 世界首通奖励改成"每个世界·每个难度只发一次"。
    // 老档里已经打穿的世界要当场标成"已领过"，否则更新之后还能再白领一轮（V9.2）。
    S.unlocks = S.unlocks ||  getProxied({});
    S.worldFirstClear = S.worldFirstClear ||  getProxied({});
    Object.keys(S.worlds ||  getProxied({})).forEach(wid => {
      const w = S.worlds[wid];
       getProxied(['normal', 'hard', 'hell']).forEach(d => {
        if (w && w.stages && w.stages[d] && w.stages[d].length && w.stages[d].every(x => x > 0)) {
          S.worldFirstClear[wid + '_' + d] = true;
        }
      });
    });
    // 功能解锁按"当前进度"补一遍：老档（或解锁表后续加过条目）读进来时，
    // 已经打过的关卡要立刻反映成"已解锁"，否则新加的解锁门禁会把老玩家拦在外面。
    /* V1.1.9（续13 · P0-4）：老档补"历史最高通关世界"。
       口径：取 **max(存档里已有的值, 当前实际打穿的最高世界)** —— 老档没这个字段时按当前进度给一次。
       ⚠️ 如实说清一处局限：**如果这个老档已经转过生、当前进度又低于它当年打到的地方**，
       "当年"那个数字在任何地方都没有留痕（转生会清 `S.worlds`），所以补不出来 ——
       这种情况会从"当前进度"起算（也就是只赚不亏，但拿不回那一次的腰斩）。新档起不会有这个问题。 */
    S.player.bestWorldIdx = Math.max(S.player.bestWorldIdx || 0, bestWorldIdx());
    /* ================= 2026-09-27（父亲大人深夜拍板）· **已转过生的老档补偿** =================
       背景：转生原来是"清 `S.worlds` ＋ 清 `S.worldFirstClear` ＋ 深井回第 1 层"（见 reincarnate 的说明），
       现在改成"残域与深井都保留"。已经照旧规则转过生的档，进度是真被清掉了 —— 但
       `S.player.bestWorldIdx`（历史最高通关世界，转生不清）还在，用它把**能进 / 已解锁**恢复回来：
         · **只恢复"解锁"，不补星**：星数在旧档里没有任何留痕，凭空造星＝编数据（进度条仍从 0 起）；
         · 范围到 `bestWorldIdx + 1`：**通关第 k 张图本来就会解锁第 k+1 张**
           （stageComplete 里 `diff === 'normal'` 那一步），所以"当年解锁到哪儿"是可证的，
           恢复它不算送东西（门禁仍走 unlockWorld 的转生门槛，该锁的照样锁）。
         · **不补发任何首通奖励** —— 那笔账早就花过了。世界 `_normal` 的通关是**有凭据**的：
           `bestWorldIdx = k` 的定义就是"第 k 张图某个难度 12/12"，而困难必须先通普通
           （见 stageUnlocked），所以第 0…k 张图的普通难度**必定**通关过、首通也必定领过
           ⇒ 标成"已领"，重打不再发钱（与 V9.2"老档里已打穿的世界当场标成已领过"同一手法）。
           ⚠️ hard / hell **没有凭据**（错标＝扣他真该拿的那份），一律不动。
         · 条件本身自洽：恢复后 0…k 都已解锁 → 不再进这段；标记只写一次，重复跑没有任何可改的。
       顺手把**深井那一半**也补回来（父亲大人原话是"世界进度和深井进度都被重置了"，
       只补世界等于只补了一半）：深井被清成 `floor: 1`，而 `best`（历史最高层）留着。
       代码里**只有一个地方写 floor**（sc-last.js：打过一个赢就 `best = max(best, floor)` ＋ `floor = floor + 1`），
       所以"当前层"恒等于 `best + 1`（新档 best 0 / floor 1 也成立，见 defaultState）。
       ⇒ 只在"被清过的签名"上动手：`floor <= 1 且 best > 0` 时恢复成 `best + 1`；
          正常档永远不会命中（正常档 floor = best + 1，best = 0 时 floor = 1 → 两条都不满足）。
          ⚠️ 不给补偿的情况：`best` 也是 0 的档什么都不做（他本来就没进过深井）。
          ⚠️ 深井奖励每层都能重拿（不是首通制），所以这条也等于"不再靠重爬深井刷一遍"。
       ⚠️ 幂等标记**不能写进 defaultState**（fillDefaults 会先把它补进老档 → 这段永远不进），
          与 realmScaled / a12Pack / skillZeroBased 同一写法。
       ⚠️ 这里**刻意不 save()**：读档路径上任何一次存盘都可能把 `idle.lastTs` 顶到"现在"、
          抹掉离线收益（V9.6.92 的边界）。这段的结果会在开机后的第一次正常存盘落盘，
          万一没落成也不怕 —— 条件自洽，重跑结果一模一样。 */
    {
      const hi = Math.max(0, S.player.bestWorldIdx || 0);          // 历史最高**通关**的图（下标）
      const hiW = Math.min(D.WORLDS.length - 1, hi + 1);           // 通关第 hi 张 → 第 hi+1 张当年也解锁过
      let missing = 0;
      for (let i = 0; i <= hiW; i++) { const w = S.worlds[D.WORLDS[i].id]; if (!w || !w.unlocked) missing++; }
      /* ================= 2026-10-03（父亲大人：「删档重开还是直接第二个世界就显示出来了」）=================
         这道补偿**必须先有凭据**，否则会误伤一张刚建档的空档：
         `bestWorldIdx` 是**只涨不跌**的字段，它的 `0` 有**两种含义** —— ①从没通关过任何世界；②通关过 W01。
         原来只看 `hi+1` 那个范围 ⇒ 一把 `hi = 0` 的**空档**也被读成"打过 W01" ⇒ 顺手把 **W02** 解锁，
         玩家看到的就是"第一张图一关没打，第二张已经躺在列表里了"（R3.5 那一改只修了"当前旅程指哪儿"，
         没有拦住列表这一列 —— 这次堵上）。
         凭据只有一条：**`S.worlds` 被清空只可能来自"照旧规则转过生"** ——
         现在转生**不再清残域**（见 reincarnate 的说明），所以只有下面两种档可能真的缺解锁：
           · `reincarnations >= 1`（真的转过生，进度被那次旧规则清过）；
           · `hi >= 1`（bestWorldIdx 非 0 ⇒ 至少打过 W02，那 W01 必定通关过 —— 老档没有 reincarnations 字段时的兜底）。
         新档 / 从没转生过、也没打过 W02 的档，一律**不进这一支**；这一支本身照旧幂等（标记只写一次）。
         ⚠️ 只改"什么时候补"，恢复的范围与"不补星、不补首通奖励"的口径一个字没动。 */
      const reinc = Math.max(0, S.player.reincarnations || 0);
      if (missing && (reinc >= 1 || hi >= 1) && !S.reincarnWorldRestored) {
        for (let i = 0; i <= hiW; i++) {
          const wid = D.WORLDS[i].id;
          unlockWorld(wid);                                    // 能进 / 已解锁（不受等级与星数影响）
          if (i <= hi) S.worldFirstClear[wid + '_normal'] = true;  // 那笔首通账早花过了：不许重打重发（第 hi+1 张没通关，不标）
        }
        S.reincarnWorldRestored = true;
      }
      const cf = S.corridor || (S.corridor =  getProxied({ floor: 1, best: 0 }));
      /* ================= 药园 3.0 迁移（2026-10-02 · 父亲大人提案）=================
         3.0 之前"开了几块地"是**算出来的**（基础 4 块 ＋ 通关 W09/W18/W27/W36 各一块）；
         3.0 起改成"玩家花点数买、存在 `S.gardenPlots` 里"。
         老档没有这个字段 → `fillDefaults` 会补上默认值 **2**，那等于**把老玩家的地收回两块**。
         所以这里按**当年那条规则**算一遍补给他（只加不减），并留迁移标记。
         ⚠️ 里程碑清单是**历史规则的快照**，故意写死在这里 —— 迁移代码就该冻在"当时那一刻"，
            跟着新的表走会算错（同理别去读 D.GARDEN_PLOT_REQ，它已经删了）。 */
      if (!S.gardenMigrated3) {
        let legacy = 4;                                  // 3.0 之前的基础块数
        ['W09', 'W18', 'W27', 'W36'].forEach(function (wid) {
          const w = S.worlds[wid];
          if (w && w.stages && w.stages.normal && w.stages.normal.every(function (x) { return x > 0; })) legacy++;
        });
        S.gardenPlots = Math.max(S.gardenPlots || D.GARDEN_PLOTS, Math.min(D.GARDEN_MAX, legacy));
        S.gardenMigrated3 = true;
      }
      if ((cf.floor || 1) <= 1 && (cf.best || 0) > 0 && !S.reincarnCorridorRestored) {
        cf.floor = cf.best + 1;                                // 深井停在哪层：唯一解（见上面的不变量）
        S.reincarnCorridorRestored = true;
      }
    }
    refreshUnlocks();
  }
  /* V1.1.20（F1-5）：`opt.keepRescue` ＝ 这条路只是"把内存档建起来让界面能用"
     （开机 boot / 渲染兜底 ensureState），**不算玩家选择** ⇒ 救援态那道禁写继续留着。
     不带参数 = "玩家自己按的开始新游戏 / 删档重开" ⇒ 清掉救援态（那是显式选择）。 */
  function newGame(opt) {
    S = defaultState();
    offlineSettled = true;     // 新档没有"离线窗口"要保，存盘照常盖章（V9.6.92）
    /* V1.1.20（F1-1）：新档的 savedAt 就是"现在" —— 空壳判 0 会让云端那份（哪怕更旧）
       无条件盖上来；而"删档重开 / 新玩家"这两条路本来就该以本机为准（与旧行为一致）。 */
    S.savedAt = Date.now();
    /* V9.6.100：**开始新游戏 = 恢复存盘**。
       wipeSave() 会把 suppressSave 关上（防"删档后又被 beforeunload 写回旧档"），
       小游戏没有 reload 这一步，所以必须由 newGame 负责重新打开存盘开关 ——
       否则"删档重开"之后玩家这一局玩多久都不会落盘。 */
    suppressSave = false;
    /* V1.1.20（F1-5）：**救援态里建档不许覆盖主键** —— 开机读到一份读不出来的档时，
       game.js 照样会调 newGame() 把内存档建起来（界面要能用），但那一份不许落到主键上；
       等玩家在弹窗里点「继续新档」（rescueConfirmNewGame）或自己走删档重开才解闸。 */
    if (!(opt && opt.keepRescue)) rescue = null;      // 玩家主动开的这一局 = 显式选择
    if (rescue) suppressSave = true;
    S.player.name = '';   // 创建角色时填写
    // 旧档境界换算（10 大境 → 36 小阶，×4）只能作用在"V9 之前的老档"上。
    // 这个标记以前要等第一次读档才写入，于是新档第一次读档时也被乘了 4
    // （新档渡劫 5 次 → 重开变 20 阶）。建档时就把标记落上，新档永远不会被换算（V9.5 修）。
    S.realmScaled = true;
    /* V1.1.4（A12 老档入门包）：同理 —— 新档在建档时就把标记落上，
      这样"新号刚点了一阶铭刻再读档"不会被当成老档白拿一份入门包。 */
    S.a12Pack = true;
    /* V1.1.14（0927-F）：碎片改成"按人各算各的"，而 `shardPoolMerged` 是**老档那一次合并**的标记 ——
       新档建好就落上，免得"新号攒了一堆他自己的碎片、第一次读档全被并进通用池"（新口径当场作废）。
       和 `realmScaled` / `a12Pack` 同一个套路：**建档时落标记，老档靠缺标记走到迁移那一支**。 */
    S.shardPoolMerged = true;
    // 新手资源（V5.0 §113）
    addCur('points', D.STARTER.points);
    addCur('holy', D.STARTER.holy);
    Object.entries(D.STARTER.items).forEach(([k, v]) => addItem(k, v));
    /* V9.6.6（父亲大人）：开局**不再白送一整套 R 装备**。
       原话："直接给装备好像不太好，就在前面副本保底掉落几件给玩家，有点获得感。"
       所以改成用**首通保底**把这一套发下去：W01 普通前 6 关每关保底 1 件、部位优先补
       主角身上空着的槽（见 data.js 的 EARLY_GUARANTEE 和 dungeon.js 的 grantRewards）。
       正常推图的玩家打完第 6 关正好凑齐一套，但每一件都是自己打出来的。
       —— 老存档里已经拿到的 start_* 装备不动（送出去的东西不收回）。 */
    unlockWorld('W01');
    save();
  }
  /* V9.5.83（自审·网页版）：名字要**在源头清洗**，不能只在显示处转义。
     起因：队伍盘/主角详情/装备指派弹窗等 5 处模板都是 `${cname('@player')}` 直接拼 HTML，
     玩家把名字打成 `<img src=x onerror=…>` 就会被浏览器当真标签解析（自己的档自己搞坏，
     但界面会直接烂掉）。在这里把 HTML 特殊字符去掉，所有渲染点（现在和以后）都安全。 */
  const NAME_BAD = /[<>&"'`\\]/g;
  /* V1.0.1（2026-09-23 · 微信平台违规警告 · P0 事故）
     ────────────────────────────────────────────────────────────────
     原来这里是**黑名单**清洗（拿 NAME_BAD 正则把坏字抠掉）。黑名单的问题很朴素：
     **它永远列不全** —— 有人把政治敏感词输进了名字框（平台给的违规图示就是那三个字），
     平台判【UGC 模块存在政治敏感内容】，限 **48 小时**整改，
     逾期封禁「被搜索 / 分享 / 分享到朋友圈」能力。

     改成**白名单**：名字必须是预设名单（PROTAG_NAMES）里那一个，否则一律拒绝。
     白名单的好处是**可自证** —— 不在名单里的字符串，一个都进不来，不需要"想全所有敏感词"。

     配合：起名/改名/新建主角三处的自由输入**全部去掉**（小游戏 sc-start.js 与 sc-last.js、
     网页版同一个 modal），入口只剩【从名单里换一个】。 */
  /* ================= V1.0.4（2026-09-27 · 父亲大人："12个字是中文字符，不是英文，我刚打拼音都超了"）===
     名字上限**按"中文字符"算，不按"字符个数"算**：
       · 一个汉字（含全角标点）＝ 2 个宽度单位；字母 / 数字 / 半角标点 ＝ 1；
       · 上限 **24 个宽度单位**（＝12 个汉字，或者 24 个字母）——
         所以"打拼音打一半就超了"这件事不会再发生。
     ⚠️ 这条口径在**三处**必须一致（前端 core / 前端 sc-namecheck / 云函数 checkname 各一份，
        云函数那边是另一个运行时，没法 require 同一个文件，所以三份都要带同一段注释）。
     名字宽度函数：一处定义在这里，另两处照抄同一套判据。 */
  function nameWidth(s) {
    let w = 0;
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      w += ((c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
        || (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFF60)) ? 2 : 1;
    }
    return w;
  }
  /* 按宽度截断：超了就掐（不切断半个"字"的算法 —— 全角算 2，掐的时候整块留或整块丢） */
  function clipName(s, maxW) {
    const M = maxW || 24;
    let w = 0, out = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      const cw = ((c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
        || (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFF60)) ? 2 : 1;
      if (w + cw > M) break;
      out += ch; w += cw;
    }
    return out;
  }
  const NAME_MAX_W = 24;                       // ＝ 12 个汉字 / 24 个字母
  function cleanName(n) {
    const s = clipName(String(n == null ? '' : n).replace(NAME_BAD, '').replace(/\s+/g, ' ').trim(), NAME_MAX_W);
    if (!s) return '';
    return D.PROTAG_NAMES.indexOf(s) >= 0 ? s : '';   // 不在白名单 → 返回空，调用方据此拒绝
  }

  /* ================= V1.0.4 · V（2026-09-27 · 自由命名 ＋ 内容安全机审 · 父亲大人）=================
     父亲大人原话：「自由命名可以接入 api 不，可以的话我感觉还是可以开的，之前就是因为命名没有限制
     被警告了才关的，现在开了云开发能接吗」。所以这一轮把自由输入开回来，**但必须带审**：
       · 白名单（`cleanName`）**一个字都没删** —— 它是"没网 / 没云"时唯一的降级路径；
       · 名单外的名字要落盘，必须带一份**刚过审的凭据**（`takeNameTicket`）；
       · 凭据由 `js/sc-namecheck.js` 在云函数 `checkname` 返回通过时签发，**一次一用、60 秒过期**
         （够走完"敲字 → 点确定"这一下，又不至于留成一张长期通行证）。

     "凭据"这层为什么值：`cleanName` 的白名单能自证，而那正是它的局限 —— 名单里的名字
     永远只有 18 个。开自由输入要么受控地放开白名单，要么把"谁审过"这件事记下来。
     这里选后者：**审过才放行、审过才记档**（`S.player.nameAudited`），
     读档时还要再对一次（见 migrate 里的 `keepName`）。 */
  const NAME_TICKET_MS = 60 * 1000;
  let nameTicket = null;                       // { name, at } —— 一次一用的过审凭据
  /* 名字的"形状"：去危险字符、压空白、**按宽度掐到 24 个单位（＝12 个汉字 / 24 个字母）**。
     判据与界面、云函数三处同口径（见上面 `nameWidth` / `clipName` 的注释）。 */
  function shapeName(n) {
    return clipName(String(n == null ? '' : n).replace(NAME_BAD, '').replace(/\s+/g, ' ').trim(), NAME_MAX_W);
  }
  function isListName(n) { return D.PROTAG_NAMES.indexOf(String(n == null ? '' : n)) >= 0; }
  /* 机审通过后签发（只认名单外的名字）；签发后 60 秒内、且**字串一字不差**才认。 */
  function grantNameTicket(name) {
    const s = shapeName(name);
    if (!s || isListName(s)) return false;
    nameTicket = { name: s, at: Date.now() };
    return true;
  }
  function takeNameTicket(name) {
    if (!nameTicket || nameTicket.name !== name) return false;
    if (Date.now() - nameTicket.at > NAME_TICKET_MS) { nameTicket = null; return false; }
    nameTicket = null;                         // 一次一用：同一张凭据不许落两个名字/两个主角
    return true;
  }
  function setPlayerName(name) {
    const s = shapeName(name);
    if (!s) return false;
    const listed = isListName(s);
    /* 名单外 → 必须拿得出刚过审的凭据；拿不出就拒绝（调用方据此给玩家一句人话）。 */
    if (!listed && !takeNameTicket(s)) return false;
    S.player.name = s;
    /* 记下"这一个名字审过了"（名单里的名字不需要 —— 它自己能自证，所以这里清空，
       免得旧的凭据跟着新名字一起留在档里）。 */
    S.player.nameAudited = listed ? '' : s;
    save();
    return true;
  }
  // 主角显示名（@player 即玩家本人）
  function charName(id) {
    if (id === '@player') return S.player.name || '主角';
    return D.charById[id] ? D.charById[id].name : id;
  }
  /* 导出/导入存档：**导出走的也是加密那条口子**（否则"手工造一份明文 JSON 再导进来"就是另一个白嫖口）。
     导入时 `unpackSave` 两种都认 —— 老玩家手里那份**明文**导出串照样能粘进来。 */
  function exportSave() { return packSave(S); }
  /* ================= V1.1.15（2026-09-27 存档审计）=================
     **"换档"这类操作一律先备份现场、出错要能回滚。**
     审计抓到的真洞（比"重传丢档"那次更隐蔽）：
       `importSave` / `loadSlot` 原来是 `S = fillDefaults(...)` → **裸调 `migrate()`** → `save()`。
       迁移一旦抛错（老档缺字段、字段类型不对、某条换算越界），异常被外层 catch 吃掉、
       函数返回"存档文件损坏"——**可内存里的 S 已经被换成那份半迁移的档了**，
       而 `game.js` 的 15 秒心跳会照常 `Core.save()` → **玩家原来那份主档被静默覆盖**。
       玩家看到的是"我导入了一下，结果我自己的档没了"。
     现在：切档前把主档原文留一份（`_pre_switch`），并把 `S / offlineSettled / legacyRaw`
     一起入栈，任何一步抛错都**整份回滚**再报错；迁移出错不再致命（与 `load()` 同一口径）。 */
  function switchStateTo(rawData, why) {
    const prevS = S, prevOffline = offlineSettled, prevLegacy = legacyRaw;
    let prevRaw = null;
    try { prevRaw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    try {
      if (prevRaw) { try { localStorage.setItem(SAVE_KEY + '_pre_switch', prevRaw); } catch (e) {} }
      /* V1.1.20（F1-2 / F1-1）：切档期间**一律不许盖章** —— 下面 `migrate()` 与那句 `save()`
         都可能写盘，而这份新档自带的时间戳（离线窗口 ＋ savedAt）正是它最值钱的东西。
         原来这里没有重置 offlineSettled：在"本会话已经结算过"的情况下（offlineSettled=true），
         那句 save() 会当场把新档的 idle.lastTs 盖成"现在" —— 探针实测：8 小时的离线窗口 → 0。
         （回滚栈里已经存着 prevOffline，下面 catch 那支照旧整份还原。） */
      offlineSettled = false;
      legacyRaw = (rawData.c001Merged === undefined) && (rawData.altPlayers === undefined) && (rawData.fabao === undefined);
      S = fillDefaults(defaultState(), rawData);
      S.v = SAVE_VER;
      try { migrate(); }
      catch (e) {
        lastLoadIssue = issue('migrate:' + (e && e.message ? e.message : 'unknown'), prevRaw || '');
        /* 同 `load()`：迁移出错也要把**切换前那份主档**留成备份（`_pre_switch` 是现场快照，
           这里再进一次标准备份口，设置页的【恢复上一份存档】才看得到它）。 */
        if (prevRaw) backupSave(prevRaw, 'migrate');
        try { console.warn('[save] 迁移这一步出错了（' + why + '），进度按已读到的样子保留：' + (e && e.message)); } catch (e2) {}
      }
      /* V1.1.20（F1-5）：换档成功＝玩家**显式**选定了这一份（云取回 / 存档码 / 导入 / 读档槽）——
         救援态到此结束，并把那道禁写一起解掉（否则刚换进来的这份永远落不了盘）。 */
      if (rescue) { rescue = null; suppressSave = false; }
      save();
      /* ================= V1.1.20（F1-2）：给**换进来的这份档**补跑一次离线结算 =================
         换档（云取回 / 存档码 / 导入 / 读档槽 / 恢复备份）之后，新档自带的离线窗口必须按它自己的
         `idle.lastTs` 结算一次 —— 否则那份窗口要么被盖章抹掉（上面那句 save 的老行为），
         要么永远拿不到（没有任何路径给它跑 settleOffline）。
         补结算失败**不算换档失败**（档已经换好并落盘了），只留一条日志。 */
      try { settleOffline(); }
      catch (e) {
        offlineSettled = true;
        try { console.warn('[save] 换档后的离线补结算出错（档已经换好、没丢）：' + (e && e.message)); } catch (e2) {}
      }
      return true;
    } catch (e) {
      S = prevS; offlineSettled = prevOffline; legacyRaw = prevLegacy;      // 整份回滚，绝不留下半迁移的 S
      if (prevRaw) { try { localStorage.setItem(SAVE_KEY, prevRaw); } catch (e2) {} }
      lastLoadIssue = issue(why + ':' + (e && e.message ? e.message : 'unknown'), '');
      return false;
    }
  }
  function importSave(json) {
    try {
      const data =  getProxied(JSON.parse(unpackSave(json)));
      if (!data || typeof data !== 'object') return  getProxied({ ok: false, msg: '存档文件损坏' });
      /* V9.6.113：导入**自己老版本**导出的存档也要能进来（补齐字段 + 迁移），
         只有"更高版本"的存档才拒收（那说明对方用的是更新的版本，导向后兼容）。 */
      if (Number(data.v || 0) > SAVE_VER) return  getProxied({ ok: false, msg: '存档来自更新的版本，请先更新游戏' });
      if (!switchStateTo(data, 'import')) return  getProxied({ ok: false, msg: '这份存档读不进来，已原样退回，你的进度没动' });
      return  getProxied({ ok: true });
    } catch (e) { return  getProxied({ ok: false, msg: '存档文件损坏' }); }
  }
  function saveSlot(n) { try { localStorage.setItem(slotKey(n), packSave(S)); return true; } catch (e) { return false; } }
  function loadSlot(n) {
    try {
      const raw = localStorage.getItem(slotKey(n));
      if (!raw) return false;
      const data =  getProxied(JSON.parse(unpackSave(raw)));
      if (!data || typeof data !== 'object') return false;
      if (Number(data.v || 0) > SAVE_VER) return false;      // 更高版本：不载入（也不覆盖）
      /* V1.1.15：这条路原来也是裸调 migrate + 直接 save（同 importSave 那个洞），现在走同一套"先备份后切换" */
      return switchStateTo(data, 'slot');
    } catch (e) { return false; }
  }
  function slotInfo() {
    const out =  getProxied([]);
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const raw = localStorage.getItem(slotKey(i));
      let meta = null;
      /* V1.1.15：这里原来直接 `JSON.parse(raw)` —— 可存档槽存的是**密文**（`packSave`），
         于是元信息永远解析不出来（列表显示"空槽"，玩家以为槽位丢了）。走同一条 `unpackSave`。 */
      if (raw) { try { const d =  getProxied(JSON.parse(unpackSave(raw))); meta =  getProxied({ level: d.player.level, floor: d.corridor.best, time: d.idle && d.idle.lastTs }); } catch (e) { meta = null; } }
      out.push( getProxied({ slot: i, exists: !!raw, meta }));
    }
    return out;
  }

  /* ================= 货币 ================= */
  // 货币变化广播：UI 订阅它做"±数值跳动"（放置游戏唯一的手感来源）。
  // 放在 addCur / spend 里，任何来源的收支都会自动有反馈，不需要在每个按钮上重复写。
  let curListener = null;
  function setCurListener(fn) { curListener = fn; }
  // 系统级提示广播（背包满 / 存档写不进去这类"必须让玩家知道一次"的事）
  let noticeListener = null;
  function setNoticeListener(fn) { noticeListener = fn; }
  function notice(msg) {
    if (!noticeListener) return;
    try { noticeListener(msg); } catch (e) { /* UI 出错不影响核心逻辑 */ }
  }
  function emitCur(id, delta) {
    if (!curListener || !delta) return;
    try { curListener(id, delta); } catch (e) { /* UI 出错不影响存档 */ }
  }
  function addCur(id, n) {
    /* V9.5.86（自审·边界参数压测）：这里原来只判 `!n`——传 NaN 会把货币写成 NaN、
       传 Infinity 会写成 Infinity，传字符串会做字符串拼接（'0abc'）。货币是存档的地基，
       非有限数一律忽略；顺手把数值型字符串转成数字（老代码有 `addCur(k, '100')` 这种写法）。 */
    const raw = typeof n === 'string' ? Number(n) : n;
    if (!Number.isFinite(raw) || !raw) return;
    const d = Math.floor(raw);
    S.cur[id] = Math.max(0, (S.cur[id] || 0) + d);
    /* V1.0.1（父亲大人："你自己根据获得的程度你判定一下货币的稀有度"）：
       给体检脚本一根"收入记账"的钩子 —— **只记进项**（d>0），花出去的不算。
       为什么要走这一层：`addCur` 是**所有**产出的唯一入口，在这里记账，
       任何一条线（副本/悬赏/任务/求签/奇遇/分解…）都跑不掉，也不用逐个函数去插桩。
       默认关闭，不影响正式游戏。 */
    if (curTally && d > 0) curTally[id] = (curTally[id] || 0) + d;
    emitCur(id, d);
  }
  let curTally = null;
  /* `tallyCur(true)` 开始记、`tallyCur(false)` 停并清空、**`tallyCur()` 只读**（不清空）。
     ⚠️ 第一版写成 `tallyCur(on){ curTally = on ? {} : null }` —— 于是"读取"那一下会把累计清零，
     跑出来全是 0。取值和重置必须是两件事。 */
  function tallyCur(on) {
    if (on !== undefined) curTally = on ?  getProxied({}) : null;
    return curTally;
  }
  function canAfford(cost) {
    return Object.entries(cost).every(([k, v]) => (S.cur[k] || 0) >= v);
  }
  function spend(cost) {
    if (!canAfford(cost)) return false;
    Object.entries(cost).forEach(([k, v]) => { S.cur[k] -= v; emitCur(k, -v); });
    return true;
  }

  /* ================= 道具 ================= */
  // 套装加成：世界套装 2/4/6 件；血统套装 2/4/6 件（按"同一张图+同一支血统"计件）；血统神装 2/4/6 件
  function applySetBonuses(pct, sets) {
    Object.entries(sets).forEach(([setId, n]) => {
      if (setId.startsWith('blood:')) {
        const cs = D.BLOODLINE_SETS[setId.slice(6)];      // key = `${世界id}|${血统}`
        if (!cs) return;
        if (n >= 2 && cs.b2) Object.entries(cs.b2).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        if (n >= 4 && cs.b4) Object.entries(cs.b4).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        if (n >= 6 && cs.b6) Object.entries(cs.b6).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        return;
      }
      if (setId.startsWith('god:')) {              // 血统神装：2 / 4 / 6 件
        const gs = D.GOD_SETS[setId.slice(4)];
        if (!gs) return;
        if (n >= 2 && gs.b2) Object.entries(gs.b2).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        if (n >= 4 && gs.b4) Object.entries(gs.b4).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        if (n >= 6 && gs.b6) Object.entries(gs.b6).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        return;
      }
      /* V1.1.15：**本命套装**（第 4 类）—— 六件同一位伙伴的专属 → 2/4/6 三档。
         效果表在 data.js 的 `SIGNATURE_SET`（一处定义）；这里只按件数取档。 */
      if (setId.startsWith('sig:')) {
        const ss = D.SIGNATURE_SET;
        if (!ss) return;
        if (n >= 2 && ss.b2) Object.entries(ss.b2).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        if (n >= 4 && ss.b4) Object.entries(ss.b4).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        if (n >= 6 && ss.b6) Object.entries(ss.b6).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
        return;
      }
      const set = D.SETS[setId];
      if (!set) return;
      if (n >= 2 && set.b2) Object.entries(set.b2).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
      if (n >= 4 && set.b4) Object.entries(set.b4).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
      if (n >= 6 && set.b6) Object.entries(set.b6).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
    });
  }
  /* --- 转生天赋：一支入口，文案与效果同源（D.TALENTS 的节点自带 e 效果表） --- */
  const TALENT_PCT_KEYS =  getProxied(['atkPct', 'hpPct', 'defPct', 'spdPct', 'critPct', 'critDmg', 'skillPct', 'evaPct', 'spiritPct']);
  function talentAll() {
    const t = S.player.talents;
    const out =  getProxied({});
     getProxied(['body', 'energy', 'nerve', 'grace']).forEach(b => {
      Object.entries(D.talentEffect(b, t[b] || 0)).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
    });
    return out;
  }
  function talentPct() {
    const all = talentAll(), out =  getProxied({});
    TALENT_PCT_KEYS.forEach(k => { out[k] = all[k] || 0; });
    return out;
  }
  // 战斗引擎专用的天赋字段（减伤/受治疗/开场能量/CD/先制/必杀）
  function talentCombatExtra() {
    const all = talentAll();
    return  getProxied({
      dmgReduce: Math.min(0.6, all.dmgReduce || 0),
      healUp: all.healUp || 0,
      initEnergy: all.initEnergy || 0,
      cdRed: all.cdRed || 0,
      firstStrike: all.firstStrike || 0,
      ultPct: all.ultPct || 0,
    });
  }
  const graceIdleMult = () => 1 + (talentAll().idlePct || 0);
  const graceExpMult = () => 1 + (talentAll().expPct || 0);
  const graceDropMult = () => 1 + (talentAll().dropPct || 0) + kejiBonus().dropPct;
  // 背包占用 = 道具种类数 + 未装备装备件数
  function bagUsage() {
    const equippedUids =  getProxied(new Set());
    Object.values(S.equipped ||  getProxied({})).forEach(slots => Object.values(slots ||  getProxied({})).forEach(uid => { if (uid) equippedUids.add(uid); }));
    const eqCount = Object.keys(S.equips).filter(uid => !equippedUids.has(uid)).length;
    const stacks = Object.entries(S.items).filter(([, n]) => n > 0);
    const isMat = k => ((D.ITEMS[k] ||  getProxied({})).type === 'material');
    /* V1.1.1（父亲大人 0926 拍板：「并池容量还是 50，**单格物品上限 100 个**，超过 100 就会占两格」）：
       占用格数从"每种 1 格"改成 **Σ ceil(件数 / BAG_STACK_MAX)** —— 一件东西超过 100 个就占第二格。
       ⚠️ 这个算式**只有这一处**（界面读 bagUsage()、不自己算），上限常量也只在 data.js 定义一次。 */
    const MAX = D.BAG_STACK_MAX || 100;
    const slotsOf = n => Math.max(0, Math.ceil((n || 0) / MAX));
    /* V1.1.2（A11 并池 · 父亲大人 0926 拍板「**并池容量还是 50**，单格物品上限 100」）：
       道具与材料**并成一个池**（材料不再单独占一个 50 格池）—— 他心里的口径一直是"一个背包"，
       而且并池之后"品种 52 种 vs 50 格"才真的能撞到（扩容才有用）。
       占用格数 = 池子里所有种类 Σ ceil(件数/100)（材料与道具一视同仁）。 */
    const usedAll = stacks.reduce((a, [, n]) => a + slotsOf(n), 0);
    const itemStacks = usedAll;          // 并池后 "itemStacks" 就是这个池子的占用
    const matStacks = 0;                 // 材料那一块已并入同一个池（字段保留给老调用点，恒 0）
    const itemSlots = stacks.filter(([k]) => !isMat(k)).reduce((a, [, n]) => a + slotsOf(n), 0);
    const matSlots = usedAll - itemSlots;
    /* 容量口径：**max(基数 50, 两侧已扩容值, 实际理论占用)**。
       他明确"老档不做一次性宽限"，靠这个取大天然兜住：老档一读档，容量自动不低于它已经占的格数，
       所以任何改动都不会让老档"缩水"（也不会出现"东西凭空进待领箱"）。 */
    const capAll = Math.max(D.BAG_BASE_CAP || 50, S.bag.itemCap || 0, S.bag.matCap || 0, usedAll);
    const capOf = (base, stored, used) => Math.max(base || 50, stored || 0, used || 0);
    return  getProxied({
      eqCount, itemStacks, matStacks,
      // used/cap ＝ **整个背包**（并池后唯一那个池）；matUsed/matCap 保留字段、供老调用点读
      used: usedAll, cap: capAll,
      itemSlots, matSlots,
      matUsed: matStacks, matCap: capOf(D.BAG_BASE_MAT_CAP, S.bag.matCap, matStacks),
      eqUsed: eqCount, eqCap: capOf(D.BAG_BASE_EQ_CAP, S.bag.eqCap, eqCount),
      total: eqCount + usedAll,
    });
  }
  function addItem(id, n = 1) {
    /* V1.1.1：判据收进 canAddItem（"加完占几格"那一条），避免两处各写一遍容量规则。
       —— 这项目被"同一件事写两份"咬过多次（尺子也钉了这一条：容量常量与算式各只有一处）。 */
    if (!canAddItem(id, n)) return false;
    S.items[id] = (S.items[id] || 0) + n;
    return true;
  }
  // 能否再放进这个道具（已有堆叠不占新格）
  /* V1.1.1（单格上限 100）：能不能再放 n 个 —— 按"**加完之后**占几格"判，不再按"有没有这种"判。
     满了就 return false（调用方把它送进待领箱，东西不会丢；界面有"背包已满"的提示＋一键扩容）。 */
  function canAddItem(id, n = 1) {
    const u = bagUsage();
    const MAX = D.BAG_STACK_MAX || 100;
    const cur = S.items[id] || 0;
    const before = Math.ceil(cur / MAX), after = Math.ceil((cur + n) / MAX);
    /* 并池后只有**一个**容量口径：整个背包（道具＋材料）占多少格 vs cap。 */
    return u.used - before + after <= u.cap;
  }
  function removeItem(id, n = 1) {
    if ((S.items[id] || 0) < n) return false;
    S.items[id] -= n;
    if (S.items[id] <= 0) delete S.items[id];
    return true;
  }
  /* ================= 待领箱（背包满时的兜底） =================
     背包满的时候，**奖励不能凭空消失**。凡是"该发出去但装不下"的道具一律进这里，
     玩家在背包页点一下「领回」就全部入包（本来的口径是"宁可少收也不吞"，
     但日常/周常/悬赏/药园这类奖励一旦被吞掉，玩家根本不知道自己亏了）。 */
  function stashItem(id, n = 1) {
    if (!(n > 0)) return;
    if (!D.ITEMS[id]) return;                    // 不认识的 id 不进箱，免得存档里堆垃圾
    S.stash = S.stash ||  getProxied([]);
    const ex = S.stash.find(x => x.id === id);
    if (ex) ex.n += n;
    else S.stash.push( getProxied({ id, n, at: Date.now() }));
    notice(`背包已满：${(D.ITEMS[id] ||  getProxied({})).name || id}×${n} 已存入待领箱`);
  }
  function stashCount() { return (S.stash ||  getProxied([])).reduce((s, x) => s + (x.n || 0), 0); }
  function stashList() { return (S.stash ||  getProxied([])).slice(); }
  /* 还差几格才能把待领箱清空（界面提示用）。
     V1.1.15（2026-09-27 · 父亲大人："扩容后还是没东西"）：以前界面只说"领回了 N 件"，
     玩家不懂"为什么领不回来"——现在把"差几格"直接写在卡片上。 */
  function stashNeedCells() {
    const u = bagUsage();
    const MAX = D.BAG_STACK_MAX || 100;
    let need = 0;
    (S.stash ||  getProxied([])).forEach(x => {
      if (!(x.n > 0)) return;
      const before = Math.ceil((S.items[x.id] || 0) / MAX);
      const after = Math.ceil(((S.items[x.id] || 0) + x.n) / MAX);
      need += Math.max(0, after - before);
    });
    return Math.max(0, need - Math.max(0, u.cap - u.used));
  }
  /* ================= 装备待领箱（V1.1.15）=================
     装备格满时，掉的/开出来的装备**存这儿**（不再是"折现成 ◆"）。
     上限 60 件（约 20KB 存档）：真堆到 60 件还不扩容，才折现并把原因告诉玩家 ——
     存档不许因为"一直不扩容"无限膨胀。 */
  const EQ_STASH_MAX = 60;
  function stashEquip(eq) {
    if (!eq || !eq.uid) return  getProxied({ stashed: false, sold: false });
    S.stashEq = S.stashEq ||  getProxied([]);
    if (S.stashEq.length >= EQ_STASH_MAX) {
      const gain = D.DECOMPOSE_GAIN[eq.rarity] || 0;
      addCur('otherworld', gain);
      return  getProxied({ stashed: false, sold: true, gain: gain, overflow: true });
    }
    S.stashEq.push(eq);
    return  getProxied({ stashed: true, sold: false });
  }
  function stashEqCount() { return (S.stashEq ||  getProxied([])).length; }
  function stashEqList() { return (S.stashEq ||  getProxied([])).slice(); }
  /* 装备格空出多少就领回多少（与道具那条同一个口径：**能放多少放多少**） */
  function claimStashEq() {
    S.stashEq = S.stashEq ||  getProxied([]);
    let moved = 0;
    while (S.stashEq.length) {
      const eq = S.stashEq[0];
      /* 口径与 `grantEquip` 一致：**加进去之后**超没超（eqUsed + 1 > eqCap） */
      if (bagUsage().eqUsed + 1 > bagUsage().eqCap) break;
      S.equips[eq.uid] = eq;
      S.stashEq.shift();
      moved++;
    }
    if (moved) save();
    return  getProxied({ ok: moved > 0, moved: moved, left: stashEqCount(),
      need: Math.max(0, stashEqCount() - Math.max(0, bagUsage().eqCap - bagUsage().eqUsed)) });
  }
  // 把待领箱里"现在装得下"的东西搬进背包；装不下的留着
  function claimStash() {
    S.stash = S.stash ||  getProxied([]);
    let moved = 0;
    S.stash.forEach(x => {
      if (!(x.n > 0)) return;
      if (!canAddItem(x.id, 1)) return;
      /* V1.1.15（2026-09-27 · 父亲大人："待领箱的卡片显示和扩容后还是没东西"）——
         **原来的写法是"整堆能装下才领"**：`if (addItem(x.id, x.n))`。
         可箱里常常是一大堆（例如 250 颗，按单格上限 100 要占 3 格），
         玩家只扩了一两格 → 一件都领不回来，看起来就是"扩容了也没用"。
         现在**能放多少放多少**：先从整堆往下折半试出放得下的量，再往上补齐到最大。 */
      let k = x.n;
      while (k > 1 && !canAddItem(x.id, k)) k = Math.max(1, Math.floor(k / 2));
      while (k < x.n && canAddItem(x.id, k + 1)) k++;
      if (k > 0 && addItem(x.id, k)) { moved += k; x.n -= k; }
    });
    S.stash = S.stash.filter(x => (x.n || 0) > 0);
    if (moved) save();
    return  getProxied({ ok: moved > 0, moved, left: stashCount(), need: stashNeedCells() });
  }
  // 统一的"奖励对象"结算：货币走 addCur，item 走 addItem。
  // 所有奖励（任务 / 周常 / 登录 / 悬赏 / 图鉴）都走这一个入口，避免"某处支持道具、某处不支持"。
  function applyRewardObj(obj) {
    const out =  getProxied({ stashed:  getProxied([]) });
    Object.entries(obj ||  getProxied({})).forEach(([k, v]) => {
      // 道具装不下就进待领箱（之前是直接丢掉 addItem 的返回值，背包满时奖励静默蒸发）
      if (k === 'item')  getProxied([]).concat(v).forEach(id => { if (!addItem(id)) { stashItem(id, 1); out.stashed.push(id); } });
      else if (k === 'ssrTicket') S.ssrTicket = (S.ssrTicket || 0) + (v === true ? 1 : v || 0);
      else addCur(k, v);
    });
    return out;
  }

  /* ================= 角色 ================= */
  function addChar(id) {
    const base = D.charById[id];
    if (!base) return  getProxied({ isNew: false });
    if (S.chars[id]) {
      /* ================= V1.1.14（0927-F · 父亲大人）=================
         「**还是得当前伙伴等级满星了，之后再抽出来才成通用的**，不然还是得**按照抽到谁就是谁的碎片**」
         ⇒ 重复抽到先记在**他自己**那份；**该伙伴满星之后**再抽到，才转成**该稀有度的通用池**。 */
      const gain = (typeof D.DUP_SHARDS === 'number') ? D.DUP_SHARDS : (D.DUP_SHARDS[base.rarity] || 10);   // V9.6.129：统一 10 碎片
      const c = S.chars[id];
      const maxStar = D.RARITY_MAXSTAR[base.rarity] || 6;
      if ((c.star || 1) >= maxStar) {
        addShardPool(base.rarity, gain);                       // 满星了 → 进通用池（同档别人能用）
        return  getProxied({ isNew: false, shards: gain, to: 'pool' });
      }
      c.shards = Math.max(0, (c.shards || 0) + gain);          // 没满星 → 进他自己那份
      return  getProxied({ isNew: false, shards: gain, to: 'self' });
    }
    S.chars[id] =  getProxied({ lv: 0, exp: 0, star: 1, shards: 0, skillLv:  getProxied([0, 0, 0]), bloodlineLv: 0 });   // 伙伴也从 0 级起
    S.equipped[id] =  getProxied({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null });
    if (!S.codex.chars.includes(id)) S.codex.chars.push(id);
    return  getProxied({ isNew: true });
  }
  function addShards(id, n) {
    /* 与 `addChar` 同一条规矩（V1.1.14）：**没满星进他自己那份，满星之后转该档通用池**。
       商店买碎片、悬赏给碎片、道具开出碎片……都走这一个入口。 */
    const base = D.charById[id];
    if (!S.chars[id]) addChar(id);
    const c = S.chars[id];
    if (!base || !c) return 0;
    const add = Number(n);
    if (!isFinite(add) || add === 0) return shardsOf(id);
    const maxStar = D.RARITY_MAXSTAR[base.rarity] || 6;
    if ((c.star || 1) >= maxStar) return addShardPool(base.rarity, add);
    c.shards = Math.max(0, (c.shards || 0) + add);
    return c.shards;
  }
  function levelCost(charId) {
    const c = S.chars[charId];
    if (!c || c.lv >= D.PLAYER_MAX_LV) return null;
    return  getProxied({ exp: D.EXP_TABLE[c.lv], points: D.LEVEL_POINTS[c.lv] });
  }
  /* V9.5.46（父亲大人）：伙伴升级统一吃**共享的伙伴经验池**（S.charExp）——
     经验模块往池子里加，升级从池子里扣，伙伴重生把花掉的加回池子。
     这样前期练的低稀有度伙伴，后期重生就能把经验让给高稀有度伙伴。 */
  function partnerExp() { return S.charExp || 0; }
  /* 无损换将（V9.5.47）：把 slotIdx 上的伙伴换成 newId ——
       ① 新伙伴继承被换下那位的等级（取较高者，绝不掉级）；
       ② 被换下那位身上"新伙伴也穿得了"的装备跟着转过去；穿不了（别人专属 / 血统对不上）留在原位。
     返回 { ok, outId, inheritLv, moved }。 */
  function swapPartyMember(slotIdx, newId) {
    if (!S.chars[newId]) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    const outId = S.party[slotIdx];
    if (outId === '@player') return  getProxied({ ok: false, msg: '主角必上阵，这一格不能换' });
    if (outId === newId) return  getProxied({ ok: false, msg: '他已经在这一格了' });
    let inheritLv = 0, moved = 0;
    if (outId && S.chars[outId]) {
      const keep = Math.max(S.chars[outId].lv, S.chars[newId].lv);
      if (keep !== S.chars[newId].lv) { S.chars[newId].lv = keep; inheritLv = keep; }
    }
    S.party[slotIdx] = newId;
    // 全场只有一个位置能站同一个人：别的地方还站着他就先撤掉
    S.party.forEach((id, i) => { if (i !== slotIdx && id === newId) S.party[i] = null; });
    if (outId && S.chars[outId] && S.equipped[outId]) {
      Object.keys(S.equipped[outId]).forEach(slot => {
        const uid = S.equipped[outId][slot];
        if (!uid || !S.equips[uid]) return;
        if (!canEquip(newId, S.equips[uid])) return;      // 穿不了就留在原伙伴身上
        if (equipItem(newId, uid)) moved++;
      });
    }
    save();
    return  getProxied({ ok: true, outId: outId || null, inheritLv, moved });
  }
  function levelUp(charId, times = 1) {
    const c = S.chars[charId];
    if (!c) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    let ups = 0;
    for (let i = 0; i < times; i++) {
      if (c.lv >= D.PLAYER_MAX_LV) break;
      const cost = levelCost(charId);
      if ((S.charExp || 0) < cost.exp || S.cur.points < cost.points) break;
      S.charExp -= cost.exp; S.cur.points -= cost.points;
      c.lv++; ups++;
    }
    save();
    return  getProxied({ ok: ups > 0, ups, msg: ups > 0 ? `升到 Lv.${c.lv}` : (S.charExp < 1 ? '伙伴经验不够（用经验模块补）' : '点数不够') });
  }
  // 一个伙伴从 Lv.0 练到此刻，一共吃掉多少伙伴经验（重生就返还这么多）
  // V9.5.69：等级从 0 起，所以累加的是 EXP_TABLE[0 .. lv-1]（第 k 项 = 从 k 级升到 k+1 级的代价）
  function expSpentOn(charId) {
    const c = S.chars[charId];
    if (!c) return 0;
    let sum = (c.exp || 0);
    for (let lv = 0; lv < c.lv; lv++) sum += D.EXP_TABLE[lv] || 0;
    return sum;
  }
  /* 伙伴重生：等级回到 Lv.0，把这级路上吃掉的伙伴经验全数退回池子（点数不返还）。
     装备 / 星级 / 血统 / 血清 都不动 —— 只重置"等级"这一条线。 */
  function rebornChar(charId) {
    const c = S.chars[charId];
    if (!c) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    if (c.lv <= 0 && !c.exp) return  getProxied({ ok: false, msg: '已经是 Lv.0 了' });
    const refund = expSpentOn(charId);
    c.lv = 0; c.exp = 0;
    S.charExp = (S.charExp || 0) + refund;
    save();
    return  getProxied({ ok: true, refund, msg: `重生完成：返还 ${fmtNum(refund)} 伙伴经验` });
  }
  // V9.5.46：经验模块不再"选一个人喂"，直接进共享池（谁要练谁就从池子里扣）
  function useExpItem(itemId, n = 1) {
    const item = D.ITEMS[itemId];
    if (!item || item.type !== 'exp') return  getProxied({ ok: false, msg: '不是经验道具' });
    const have = S.items[itemId] || 0;
    if (have < 1) return  getProxied({ ok: false, msg: '道具不足' });
    const use = Math.max(1, Math.min(n, have));
    S.items[itemId] -= use;
    if (S.items[itemId] <= 0) delete S.items[itemId];
    S.charExp = (S.charExp || 0) + item.exp * use;
    task('item1', use);
    save();
    return  getProxied({ ok: true, msg: `+${(item.exp * use).toLocaleString()} 伙伴经验（×${use}）`, count: use, pool: S.charExp });
  }
  /* ================= 血清（永久强化剂） =================
     对标同类放置游戏的"丹药矩阵"：成长被拆成很多次小成长，喂一支就有一次可见的跳动。
     规则：每人每种有次数上限；血统血清只有对应血统能用；效果真的进属性计算（不是文案）。 */
  function serumTaken(charId, serumId) {
    const m = S.serums[charId];
    return (m && m[serumId]) || 0;
  }
  function serumApplied(charId) {
    const m = S.serums[charId] ||  getProxied({});
    return Object.keys(m).reduce((n, k) => n + m[k], 0);
  }
  // 把血清加成并进百分比区（与血统 / 天赋同区，加算）
  function applySerums(charId, pct) {
    const m = S.serums[charId];
    if (!m) return;
    Object.keys(m).forEach(sid => {
      const sd = D.serumById[sid];
      if (!sd) return;
      pct[sd.key] = (pct[sd.key] || 0) + sd.per * m[sid];
    });
  }
  // 随行伴生体：给全队（含主角）的加成，同样并进百分比区
  function applyBeast(pct) {
    const bp = beastPct();
    Object.keys(bp).forEach(k => { pct[k] = (pct[k] || 0) + bp[k]; });
  }
  // 灯阁权限：满 10 级才有的一条"全属性 +5%"，同样走百分比区（与血统 / 铭刻加算）
  function applyAuthority(pct) {
    const v = authority().allPct;
    if (!v) return;
    pct.atkPct += v; pct.hpPct += v; pct.defPct += v; pct.spdPct += v;
  }
  // 炼化：材料 + 点数 → 血清道具
  function craftSerum(serumId, n = 1) {
    const sd = D.serumById[serumId];
    if (!sd) return  getProxied({ ok: false, msg: '没有这个配方' });
    /* V9.6.138：`unlock` 从"写在数据里没人读"改成**真门槛** ——
       配方按通关进度开（见 data.js 里 SERUMS 的注释）。已经炼出来的照常能用，
       只挡"再炼"，所以老存档里存着的血清不会作废。 */
    if (!serumUnlocked(sd)) return  getProxied({ ok: false, msg: `🔒 ${serumUnlockTip(sd)}` });
    // V9.5.86（边界压测）：n 传 null/NaN 时 Math.floor 会给出 NaN，后面的扣款会写成 NaN
    const want = Math.max(1, Math.floor(Number(n)) || 1);
    const haveMat = S.items[sd.mat] || 0;
    const can = Math.min(want, Math.floor(haveMat / sd.matN), Math.floor(S.cur.points / sd.points));
    if (can < 1) {
      if (haveMat < sd.matN) return  getProxied({ ok: false, msg: `${D.ITEMS[sd.mat].name}不足（${haveMat}/${sd.matN}）` });
      return  getProxied({ ok: false, msg: `点数不足（${S.cur.points.toLocaleString()}/${sd.points.toLocaleString()}）` });
    }
    S.items[sd.mat] -= sd.matN * can;
    if (S.items[sd.mat] <= 0) delete S.items[sd.mat];
    S.cur.points -= sd.points * can;
    addItem(D.SERUM_ITEM(serumId), can);
    task('item1', can);
    save();
    return  getProxied({ ok: true, count: can, msg: `炼化「${sd.name}」×${can}` });
  }
  /* ================= V1.1.13（0927-E · 总监 §5.3 来源②）：炼化台的重铸石配方 =================
     `2×mat_t3 ＋ ◉4,000 → 1 颗`，**不限次**。取值全部来自 `D.REFORGE_CRAFT`（不在这里写死数字）。
     与 `craftSerum` 的差别只有一处：这里**不看解锁进度**（原材料本身就够后期了）。 */
  function craftReforgeStone(n) {
    const R = D.REFORGE_CRAFT ||  getProxied({ mat: 'mat_t3', matN: 2, points: 4000, out: 1 });
    const want = Math.max(1, Math.floor(Number(n)) || 1);
    const haveMat = S.items[R.mat] || 0;
    const can = Math.min(want, Math.floor(haveMat / R.matN), Math.floor((S.cur.points || 0) / R.points));
    if (can < 1) {
      if (haveMat < R.matN) return  getProxied({ ok: false, msg: `${(D.ITEMS[R.mat] ||  getProxied({})).name || R.mat} 不足（${haveMat}/${R.matN}）` });
      return  getProxied({ ok: false, msg: `◉ 点数不足（${fmtNum(S.cur.points || 0)}/${fmtNum(R.points)}）` });
    }
    S.items[R.mat] -= R.matN * can;
    if (S.items[R.mat] <= 0) delete S.items[R.mat];
    addCur('points', -R.points * can);
    addItem(D.REFORGE_ITEM || 'reforge_stone', (R.out || 1) * can);
    task('item1', can);
    save();
    return  getProxied({ ok: true, count: can, msg: `炼化「重铸石」×${(R.out || 1) * can}` });
  }
  /* 配方解锁：unlock = 要通关到第几张图（普通 12 关全清才算） */
  function serumUnlocked(sd) {
    /* ⚠️ 不能写成 `(sd.unlock) || 1` —— unlock: 0 是"开局就能炼"的合法值，
       而 0 是假值，会被 `|| 1` 悄悄改成"需要通关第 1 张图"（实测新号因此炼不出力量血清）。 */
    const n = (sd && typeof sd.unlock === 'number') ? sd.unlock : 1;
    if (n <= 0) return true;
    const w = D.WORLDS[n - 1];
    if (!w) return true;                       // 数据写超了就当没限制，别把人锁死
    const st = S.worlds && S.worlds[w.id];
    return !!(st && st.stages && st.stages.normal && st.stages.normal.every((x) => x > 0));
  }
  function serumUnlockTip(sd) {
    const n = (sd && typeof sd.unlock === 'number') ? sd.unlock : 1;
    const w = D.WORLDS[n - 1];
    return w ? ('通关 ' + w.name + '·普通 后开放') : '';
  }
  // 使用：喂给某名角色（或主角 '@player'）
  function useSerum(charId, serumId, n = 1) {
    const sd = D.serumById[serumId];
    if (!sd) return  getProxied({ ok: false, msg: '没有这支精华' });
    const itemId = D.SERUM_ITEM(serumId);
    const have = S.items[itemId] || 0;
    if (have < 1) return  getProxied({ ok: false, msg: '道具不足' });
    const isPlayer = charId === '@player';
    const base = isPlayer ? null : D.charById[charId];
    if (!isPlayer && !S.chars[charId]) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    if (sd.bloodline) {
      const bl = isPlayer ? S.player.bloodline : (base && base.bloodline);
      if (!bl) return  getProxied({ ok: false, msg: `该伙伴还没觉醒命格，先觉醒「${sd.bloodline}」再用` });
      if (bl !== sd.bloodline) return  getProxied({ ok: false, msg: `只有「${sd.bloodline}」命格能用这支精华` });
    }
    S.serums[charId] = S.serums[charId] ||  getProxied({});
    const taken = S.serums[charId][serumId] || 0;
    const room = sd.max - taken;
    if (room <= 0) return  getProxied({ ok: false, msg: `已达上限（${sd.max} 支）` });
    const use = Math.max(1, Math.min(n, have, room));
    S.items[itemId] -= use;
    if (S.items[itemId] <= 0) delete S.items[itemId];
    S.serums[charId][serumId] = taken + use;
    task('item1', use);
    save();
    const kn = D.SERUM_KEYS[sd.key] || sd.key;
    return  getProxied({ ok: true, count: use, msg: `${sd.name} ×${use}：${kn} 永久 +${(sd.per * use * 100).toFixed(1)}%` });
  }
  /* ---------- 伙伴碎片：按稀有度通用（V9.6.129） ---------- */
  function shardPoolOf(rarity) { return (S.shardPool && S.shardPool[rarity]) || 0; }
  /* V1.1.14（0927-F）：**他自己那份**（`S.chars[id].shards`）。
     老档里这个字段被 V9.6.129 的合并迁移清零并进了通用池（那一轮的口径照旧、不追溯），
     从这一版起重新按人记账。 */
  function shardsOf(charId) { const c = S.chars[charId]; return (c && c.shards) || 0; }
  /* 升星要什么、够不够 —— **界面唯一口径**（伙伴详情那三行、列表行、按钮能不能点、提示文案都读它），
     免得界面自己再算一遍"自己＋通用 vs 需求"（本项目对"同一件事写两份"踩过多次）。 */
  function starInfo(charId) {
    const c = S.chars[charId], base = D.charById[charId];
    if (!c || !base) return null;
    const maxStar = D.RARITY_MAXSTAR[base.rarity] || 6;
    const full = (c.star || 1) >= maxStar;
    const need = full ? 0 : (D.starCostOf ? D.starCostOf(base.rarity, c.star) : D.STAR_COST[c.star]);
    const own = shardsOf(charId);
    const pool = shardPoolOf(base.rarity);
    return  getProxied({
      star: c.star, maxStar, full, need, own, pool, rarity: base.rarity,
      total: own + pool, can: !full && (own + pool) >= need,
      fromOwn: Math.min(own, need), fromPool: Math.max(0, need - own),
    });
  }
  /* V9.6.131（data_audit 抓到）：导出函数被传异常入参（比如 []）时**不能返回 NaN/Infinity** ——
     稀有度不认识就退回 N 档，数量非数字就当 0，永远返回一个数字。 */
  function addShardPool(rarity, n) {
    if (!S.shardPool) S.shardPool =  getProxied({ N: 0, R: 0, SR: 0, SSR: 0, UR: 0 });
    const rar = (typeof rarity === 'string' && rarity && (rarity in S.shardPool)) ? rarity : 'N';
    const add = Number(n);
    S.shardPool[rar] = Math.max(0, (S.shardPool[rar] || 0) + (isFinite(add) ? add : 0));
    return S.shardPool[rar];
  }
  /* 给某个伙伴加碎片 = 加进**他那档**的公共池（抽到重复角色、商店买碎片、悬赏都走这里） */
  function addShardsToPool(charId, n) {
    const base = D.charById[charId];
    return addShardPool(base ? base.rarity : 'N', n);
  }
  function starUp(charId) {
    const c = S.chars[charId];
    const base = D.charById[charId];
    if (!c) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    const maxStar = D.RARITY_MAXSTAR[base.rarity];
    if (c.star >= maxStar) return  getProxied({ ok: false, msg: '已达最高星级' });
    /* V1.1.14（0927-F · 父亲大人）：**先吃自己的，不够再用同稀有度通用池补**。
       成本走 `D.starCostOf(rarity, star)`（UR 那条独立曲线在这里生效）。 */
    const need = D.starCostOf ? D.starCostOf(base.rarity, c.star) : D.STAR_COST[c.star];
    const own = shardsOf(charId);
    const pool = shardPoolOf(base.rarity);
    if (own + pool < need) {
      return  getProxied({ ok: false, msg: `碎片不足（他自己的 ${own} ＋ ${base.rarity} 通用 ${pool} ＝ ${own + pool} / 需 ${need}）` });
    }
    const fromOwn = Math.min(own, need);
    c.shards = own - fromOwn;
    const rest = need - fromOwn;
    if (rest > 0) addShardPool(base.rarity, -rest);
    c.star++;
    /* ================= V1.1.15（2026-09-27 · 父亲大人："升完星后溢出的不会转成万能碎片"）==========
       升到**满星那一刻**，他自己那份剩下的碎片就再也用不上了
       （满星之后新抽到的、买到的本来就走通用池），可这份"溢出"原来一直躺在他一个人身上 ——
       别人用不到、他自己也吃不下。现在一起转进**同档通用池**（"万能碎片"）。 */
    let overflow = 0;
    if (c.star >= maxStar && (c.shards || 0) > 0) {
      overflow = c.shards;
      addShardPool(base.rarity, overflow);
      c.shards = 0;
    }
    save();
    return  getProxied({ ok: true,
      msg: `升到 ${c.star}★（他自己的 ${fromOwn} 颗${rest ? (' ＋ 通用 ' + rest + ' 颗') : ''}`
        + (overflow ? (' · 满星溢出 ' + overflow + ' 颗已转 ' + base.rarity + ' 通用碎片') : '') + '）',
      fromOwn, fromPool: rest, overflow: overflow });
  }
  /* V9.5.73（父亲大人：技能上限 35/35/30）：伙伴技能也用同一张上限表，
     但伙伴花的是**异界结晶**（主角花技能点）。上限从 11 涨到 35，价目表不能还是手写 11 条，
     所以改成公式：第 lv 级（0 基）要 35 × 1.16^lv（合并货币后 ×3.5）。
       满一条 35 级 ≈ 3.5 万结晶 ≈ 3 天（异界结晶池约 1800/天）
       一个伙伴三条点满 ≈ 11 万结晶 ≈ 7~14 天 —— 和其它养成线的量级一致。 */
  /* V9.6.134：技能芯片并入异界结晶 → 价格 ×3.5
     （芯片日收入 518，异界结晶池 1804，518×3.5 = 1813 ≈ 池收入）——
     "满一条技能要几天"跟合并前一样，只是改从异界结晶里扣。 */
  const SKILL_CHIP_BASE = 35, SKILL_CHIP_GROW = 1.16;
  const SKILL_CHIP_COST = Array.from( getProxied({ length: D.SKILL_MAX }), (_, lv) => Math.round(SKILL_CHIP_BASE * Math.pow(SKILL_CHIP_GROW, lv)));
  function skillUp(charId, idx) {
    const c = S.chars[charId];
    if (!c) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    /* V9.5.86（边界压测）：索引越界时 cost 会变 undefined，`skillChip -= undefined` 直接写成 NaN。
       注意 `null >= 0` 在 JS 里是 **true**（null 会隐式转成 0），所以不能只判大小，得判整数。 */
    const si = Number(idx);
    if (!Number.isInteger(si) || si < 0 || si > 2) return  getProxied({ ok: false, msg: '技能不存在' });
    const lv = c.skillLv[si];
    if (lv >= D.SKILL_MAX_BY_INDEX[idx]) return  getProxied({ ok: false, msg: '已满级' });
    const cost = SKILL_CHIP_COST[lv];      // 技能从 0 级起，价目表也跟着 0 起
    if (S.cur.otherworld < cost) return  getProxied({ ok: false, msg: `异界结晶不足（${S.cur.otherworld}/${cost}）` });
    S.cur.otherworld -= cost;
    c.skillLv[idx]++;
    save();
    return  getProxied({ ok: true, msg: `技能升到 Lv.${c.skillLv[idx]}` });
  }

  /* ================= 血统 / 铭刻 ================= */
  /* V9.5.89（十七度自审）：血统升级的"报价"收成一份 ——
     界面原来读 D.bloodlineCost()（毛价），而真正升级时会打血统实验室的折扣（最高 -40%）：
     按钮写着"❥ 120 + ◉ 3000"、实际只扣 1800。玩家看到一个虚高的价钱就不敢点了。
     charId 传 '@player' 或伙伴 id；返回 null 表示已经没得升。 */
  function bloodlineQuote(charId) {
    const discount = Math.min(0.4, S.buildings.geneLab * 0.01);
    const apply = (cost) => ( getProxied({
      otherworld: Math.ceil((cost.otherworld || 0) * (1 - discount)),
      points: Math.ceil(cost.points * (1 - discount)),
      discount,
      /* V1.1.4（A12-F · 命格接「血髓晶」）：**材料不吃实验室折扣**——
         《续2》§3.2 给的是逐级固定块数（0→50 级合计 145 块/人），
         跟着折扣浮动会让"每人 145 块"这个口径当场失效（尺子也钉不住）。 */
      mat: cost.mat || D.BLOODLINE_MAT,
      matN: cost.matN || 0,
      /* V1.1.16（0927-Y 数值轮 · 报告 §五 I2）：末段第二种料，与第一种同一条口径（不吃折扣） */
      mat2: cost.mat2 || D.BLOODLINE_MAT2,
      mat2N: cost.mat2N || 0,
    }));
    if (charId === '@player') {
      if (!S.player.bloodline || S.player.bloodlineLv >= D.BLOODLINE_MAX) return null;
      return apply(D.bloodlineCost(S.player.bloodlineLv));
    }
    const c = S.chars[charId];
    if (!c || c.bloodlineLv >= D.BLOODLINE_MAX) return null;
    return apply(D.bloodlineCost(c.bloodlineLv));
  }
  function bloodlineUpgrade(charId) {
    const c = S.chars[charId];
    const base = D.charById[charId];
    if (!c) return  getProxied({ ok: false, msg: '未拥有该伙伴' });
    if (!isUnlocked('bloodline')) return  getProxied({ ok: false, msg: `🔒 ${unlockTip('bloodline')}` });
    if (c.bloodlineLv >= D.BLOODLINE_MAX) return  getProxied({ ok: false, msg: '命格已满级' });
    const q = bloodlineQuote(charId);            // 与界面同一份报价（已含血统实验室折扣）
    /* V1.1.4：材料先判、再扣钱 —— 反过来的话"钱扣了料不够"就要退款，多一条回滚路径。
       V1.1.16（0927-Y 数值轮 · 报告 §五 I2）：命格末段（Lv.40 起）多一种料（`mat2`）。 */
    const matId = q.mat, matN = q.matN || 0;
    if (matN && (S.items[matId] || 0) < matN) {
      return  getProxied({ ok: false, msg: `${(D.ITEMS[matId] ||  getProxied({})).name || matId} 不足（${S.items[matId] || 0}/${matN}）` });
    }
    const mat2Id = q.mat2, mat2N = q.mat2N || 0;
    if (mat2N && (S.items[mat2Id] || 0) < mat2N) {
      return  getProxied({ ok: false, msg: `${(D.ITEMS[mat2Id] ||  getProxied({})).name || mat2Id} 不足（${S.items[mat2Id] || 0}/${mat2N}）` });
    }
    const cost =  getProxied({ otherworld: q.otherworld, points: q.points });
    if (!spend(cost)) return  getProxied({ ok: false, msg: '异界结晶或点数不足' });
    if (matN) addItem(matId, -matN);
    if (mat2N) addItem(mat2Id, -mat2N);
    c.bloodlineLv++;
    save();
    return  getProxied({ ok: true, msg: `${base.bloodline}命格 Lv.${c.bloodlineLv}` });
  }
  function geneLockInfo() {
    const cur = S.player.geneLock;
    /* V9.6.134：上限从写死的 5 改成**读数据表**。9.6.130 把铭刻扩到 20 阶，
       但这里还写着 `cur >= 5` 就是满级、后面两个要求的数组也只有 5 个元素 ——
       结果第 6 阶以后永远点不动（玩家看得到 20 行，第 6 行起全锁死）。
       现在要求直接读 GENE_LOCKS 里的 w（世界）与 lv（等级）字段，加多少阶都不用再改这里。 */
    if (cur >= D.GENE_LOCKS.length) return  getProxied({ max: true });
    const next = D.GENE_LOCKS[cur];
    const reqs =  getProxied([]);
    const worldReq = next.w;
    const lvReq = next.lv || 0;
    const w = D.WORLDS.find(x => x.id === worldReq);
    const cleared = !worldReq || (S.worlds[worldReq] && S.worlds[worldReq].stages.normal.every(s => s > 0));
    if (!cleared && w) reqs.push(`通关${w.name}·普通`);
    if (S.player.level < lvReq) reqs.push(`玩家等级达到 Lv.${lvReq}`);
    const need = next.cost.otherworld || 0;
    if ((S.cur.otherworld || 0) < need) reqs.push(`异界结晶 ${S.cur.otherworld || 0}/${need}`);
    /* V1.1.4（A12-F · 铭刻接「铭魂砂」）：材料与货币**分开报**——
       混成一句"材料不足"玩家不知道该去哪刷哪一样。`matHave`/`matNeed` 也给界面直接用。 */
    const matId = next.mat || D.GENE_LOCK_MAT;
    const matN = next.matN || 0;
    const matHave = matN ? (S.items[matId] || 0) : 0;
    if (matN && matHave < matN) reqs.push(`${(D.ITEMS[matId] ||  getProxied({})).name || matId} ${matHave}/${matN}`);
    return  getProxied({ max: false, next, can: reqs.length === 0, reqs, mat: matId, matN, matHave });
  }
  function geneLockUnlock() {
    const info = geneLockInfo();
    if (info.max) return  getProxied({ ok: false, msg: '铭刻已完全解锁' });
    if (!info.can) return  getProxied({ ok: false, msg: info.reqs.join('；') });
    S.cur.otherworld -= info.next.cost.otherworld;
    /* V1.1.4：材料一并扣（走 addItem 的负数通道，与法宝祭炼 / 坐骑喂养同一写法）。 */
    if (info.matN) addItem(info.mat, -info.matN);
    S.player.geneLock++;
    save();
    return  getProxied({ ok: true, msg: `铭刻 ${info.next.name} 已解锁！` });
  }

  /* ================= 属性计算 ================= */
  // 装备面板数值（含强化）
  function equipStats(eq) {
    const mult = 1 + eq.enhance * 0.05;
    const out =  getProxied({ atk: 0, def: 0, hp: 0, spd: 0, critPct: 0 });
    Object.entries(eq.base).forEach(([k, v]) => { out[k] = (out[k] || 0) + v * mult; });
    const affix =  getProxied({});
    eq.affixes.forEach(a => { affix[a.k] = (affix[a.k] || 0) + a.v; });
    return  getProxied({ flat: out, affix });
  }
  function effectiveStats(charId) {
    const c = S.chars[charId];
    const base = D.charById[charId];
    if (!c || !base) return null;
    const lvMult = 1 + c.lv * 0.035;      // V9.5.69：等级从 0 起，Lv.0 = 基准 1.0
    const starMult = D.STAR_MULT[c.star - 1];
    const a =  getProxied({});
    Object.keys(base.attrs).forEach(k => { a[k] = base.attrs[k] * lvMult * starMult; });
    // 百分比加成（加算区）
    const pct =  getProxied({ atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0, resPct: 0, lifesteal: 0, spiritPct: 0 });
    // 血统
    const bl = D.BLOODLINES[base.bloodline];
    if (bl && c.bloodlineLv > 0) {
      const blm = c.bloodlineLv * (S.player.geneLock >= 4 ? 1.5 : 1);
      if (bl.atkPct) pct.atkPct += bl.atkPct * blm;
      if (bl.hpPct) pct.hpPct += bl.hpPct * blm;
      if (bl.defPct) pct.defPct += bl.defPct * blm;
      if (bl.skillPct) pct.skillPct += bl.skillPct * blm;
      if (bl.critPct) pct.critPct += bl.critPct * blm;
      if (bl.lifesteal) pct.lifesteal += bl.lifesteal * blm;
      if (bl.spdPct) pct.spdPct += bl.spdPct * blm;
      if (bl.spiritPct) pct.spiritPct += bl.spiritPct * blm;
      if (bl.allPct) { pct.atkPct += bl.allPct * blm; pct.hpPct += bl.allPct * blm; pct.defPct += bl.allPct * blm; pct.spdPct += bl.allPct * blm; }
    }
    // 铭刻
    if (S.player.geneLock >= 1) { pct.atkPct += 0.05; pct.hpPct += 0.05; pct.defPct += 0.05; pct.spdPct += 0.05; }
    if (S.player.geneLock >= 2) pct.skillPct += 0.15;
    if (S.player.geneLock >= 5) { pct.atkPct += 0.15; pct.hpPct += 0.15; pct.defPct += 0.15; pct.spdPct += 0.15; }
    // 转生天赋：效果全部由 D.talentEffect 派生，文案与数值同源
    // （旧版是两套硬编码数组，说明改了、效果没改，导致 15 个节点写了没实装）
    const tt = talentPct();
     getProxied(['atkPct', 'hpPct', 'defPct', 'spdPct', 'critPct', 'critDmg', 'skillPct', 'evaPct', 'spiritPct']).forEach(k => { pct[k] += tt[k] || 0; });
    applySerums(charId, pct);                      // 血清（永久强化剂）
    applyBeast(pct);                               // 随行伴生体（全队加成）
    applyAuthority(pct);                           // 灯阁权限（满 10 级的全属性加成）
    applySect(pct);                                // 灯阁评级（全队，随进度自动涨）
    applyKeji(pct);                                // 秘术阁（全队百分比长线）
    applyMount(pct);                               // 坐骑（全队，含招募角色）
    // 装备
    const eq = S.equipped[charId] ||  getProxied({});
    const flat =  getProxied({ atk: 0, def: 0, hp: 0, spd: 0 });
    const sets =  getProxied({});
    Object.values(eq).forEach(uid => {
      if (!uid || !S.equips[uid]) return;
      const e = S.equips[uid];
      const st = equipStats(e);
      Object.keys(flat).forEach(k => { flat[k] += st.flat[k] || 0; });
      flat.spd += st.flat.spd || 0;
      pct.critPct += st.flat.critPct || 0;
      Object.entries(st.affix).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
      if (e.set) sets[e.set] = (sets[e.set] || 0) + 1;
      /* 血统套装：**同一张图 + 同一支血统**才算一套（V9.6.82 按世界拆开），且只有同血统的人穿得上 */
      if (e.bloodSet && e.bloodWorld && e.bloodSet === base.bloodline) {
        const bk = 'blood:' + e.bloodWorld + '|' + e.bloodSet;
        sets[bk] = (sets[bk] || 0) + 1;
      }
      /* 血统神装：只有**同血统**的人穿上的那几件才算数（V9.6.76） */
      if (e.godSet && e.godSet === base.bloodline) sets['god:' + e.godSet] = (sets['god:' + e.godSet] || 0) + 1;
      /* V1.1.15：**本命套装**（第 4 类）—— 只数"这位伙伴自己的专属"那几件（`sigSet` = 角色 id）。
         别人穿不上（canEquip 按 charId 锁），所以这里再判一次 `e.charId === charId` 是双保险。 */
      if (e.sigSet && e.charId === charId) sets['sig:' + e.sigSet] = (sets['sig:' + e.sigSet] || 0) + 1;
    });
    applySetBonuses(pct, sets);
    // 主攻击属性
    const atkAttr = D.ATK_ATTR[base.kind] || 'muscle';
    if (pct.spiritPct) a.spirit *= (1 + pct.spiritPct);
    const atk = (a[atkAttr] * 1.8 + flat.atk) * (1 + pct.atkPct);
    const def = (a.immune * 1.6 + flat.def) * (1 + pct.defPct);
    const hp = (a.cell * 25 + flat.hp) * (1 + pct.hpPct);
    const spd = (a.nerve * 1.2 + flat.spd) * (1 + pct.spdPct);
    const crit = Math.min(0.6, 0.05 + a.intelligence * 0.0008 + pct.critPct);
    const eva = Math.min(0.6, a.nerve * 0.0012 + pct.evaPct);
    const skillMult = 1 + a.spirit * 0.006 + pct.skillPct;
    return  getProxied({
      atk: Math.round(atk), def: Math.round(def), hp: Math.round(hp), spd: Math.round(spd),
      crit, critDmg: 2.0 + pct.critDmg, eva, skillMult,
      lifesteal: pct.lifesteal + (base.kind === 'vampire' ? 0.1 : 0),
      resPct: pct.resPct || 0,
      attrs: a, sets,
      ...talentCombatExtra(),
    });
  }
  function power(charId) {
    const st = effectiveStats(charId);
    if (!st) return 0;
    return Math.round(st.atk * 2 + st.def + st.hp * 0.2 + st.spd * 3);
  }
  /* ================= 主角（玩家）独立属性 ================= */
  function effectivePlayerStats() {
    const P = D.PROTAGONIST;
    const lvMult = 1 + S.player.level * 0.035;   // V9.5.69：同上
    const a =  getProxied({});
    Object.keys(P.baseAttrs).forEach(k => { a[k] = P.baseAttrs[k] * lvMult; });
    // 六维属性点加成（每点 +ATTR_POINT_VALUE）
    const pa = S.player.attrs ||  getProxied({});
    Object.keys(a).forEach(k => { a[k] += (pa[k] || 0) * D.ATTR_POINT_VALUE; });
    const pct =  getProxied({ atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0.05, resPct: 0, lifesteal: 0, spiritPct: 0 });
    // 铭刻（全队加成 + 主角每阶额外3%）
    if (S.player.geneLock >= 1) { pct.atkPct += 0.05; pct.hpPct += 0.05; pct.defPct += 0.05; pct.spdPct += 0.05; }
    if (S.player.geneLock >= 2) pct.skillPct += 0.15;
    if (S.player.geneLock >= 5) { pct.atkPct += 0.15; pct.hpPct += 0.15; pct.defPct += 0.15; pct.spdPct += 0.15; }
    const glExtra = S.player.geneLock * 0.03;
    pct.atkPct += glExtra; pct.hpPct += glExtra; pct.defPct += glExtra; pct.spdPct += glExtra;
    // 主角血统
    if (S.player.bloodline) {
      const bl = D.BLOODLINES[S.player.bloodline];
      const blm = S.player.bloodlineLv * (S.player.geneLock >= 4 ? 1.5 : 1);
      if (bl) {
        if (bl.atkPct) pct.atkPct += bl.atkPct * blm;
        if (bl.hpPct) pct.hpPct += bl.hpPct * blm;
        if (bl.defPct) pct.defPct += bl.defPct * blm;
        if (bl.skillPct) pct.skillPct += bl.skillPct * blm;
        if (bl.critPct) pct.critPct += bl.critPct * blm;
        if (bl.lifesteal) pct.lifesteal += bl.lifesteal * blm;
        if (bl.spdPct) pct.spdPct += bl.spdPct * blm;
        if (bl.spiritPct) pct.spiritPct += bl.spiritPct * blm;
        if (bl.allPct) { pct.atkPct += bl.allPct * blm; pct.hpPct += bl.allPct * blm; pct.defPct += bl.allPct * blm; pct.spdPct += bl.allPct * blm; }
      }
    }
    // 转生天赋（主角同样吃满四支天赋）
    const tt = talentPct();
     getProxied(['atkPct', 'hpPct', 'defPct', 'spdPct', 'critPct', 'critDmg', 'skillPct', 'evaPct', 'spiritPct']).forEach(k => { pct[k] += tt[k] || 0; });
    applySerums('@player', pct);                   // 血清（主角同样是永久加成）
    applyBeast(pct);                               // 随行伴生体（全队加成）
    applyAuthority(pct);                           // 灯阁权限（满 10 级的全属性加成）
    applySect(pct);                                // 灯阁评级（对标"宗门等级"：随进度自动涨）
    applyKeji(pct);                                // 秘术阁（对标"KeJi"：42 条百分比长线）
    applyMount(pct);                               // 坐骑（全队，含主角）
    // 境界（渡劫）：9 大境 × 初/中/后/大圆满 = 36 小阶，每阶全属性 +1.4%（合计 +50.4%），属于永久成长
    const rp = realmBonusPct();
    if (rp) { pct.atkPct += rp; pct.hpPct += rp; pct.defPct += rp; pct.spdPct += rp; }
    // 装备（6 槽）
    const eq = S.equipped['@player'] ||  getProxied({});
    const flat =  getProxied({ atk: 0, def: 0, hp: 0, spd: 0 });
    const psets =  getProxied({});
    Object.values(eq).forEach(uid => {
      if (!uid || !S.equips[uid]) return;
      const st = equipStats(S.equips[uid]);
      const e = S.equips[uid];
      flat.atk += st.flat.atk || 0;
      flat.def += st.flat.def || 0;
      flat.hp += st.flat.hp || 0;
      flat.spd += st.flat.spd || 0;
      pct.critPct += st.flat.critPct || 0;
      Object.entries(st.affix).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
      if (e.set) psets[e.set] = (psets[e.set] || 0) + 1;
      if (e.bloodSet && e.bloodWorld && e.bloodSet === S.player.bloodline) {
        const bk = 'blood:' + e.bloodWorld + '|' + e.bloodSet;
        psets[bk] = (psets[bk] || 0) + 1;
      }
      if (e.godSet && e.godSet === S.player.bloodline) psets['god:' + e.godSet] = (psets['god:' + e.godSet] || 0) + 1;
    });
    applySetBonuses(pct, psets);
    // 法宝：数值类并进百分比区（要放在伤害公式之前），效果类并进战斗额外区
    const extra = talentCombatExtra();
    applyFabao(pct, extra);
    if (pct.spiritPct) a.spirit *= (1 + pct.spiritPct);
    const atk = (a.muscle * 1.8 + flat.atk) * (1 + pct.atkPct);
    const def = (a.immune * 1.6 + flat.def) * (1 + pct.defPct);
    const hp = (a.cell * 25 + flat.hp) * (1 + pct.hpPct);
    const spd = (a.nerve * 1.2 + flat.spd) * (1 + pct.spdPct);
    const crit = Math.min(0.6, 0.05 + a.intelligence * 0.0008 + pct.critPct);
    const eva = Math.min(0.6, a.nerve * 0.0012 + pct.evaPct);
    const skillMult = 1 + a.spirit * 0.006 + pct.skillPct;
    return  getProxied({
      atk: Math.round(atk), def: Math.round(def), hp: Math.round(hp), spd: Math.round(spd),
      crit, critDmg: 2.0 + pct.critDmg, eva, skillMult,
      lifesteal: pct.lifesteal, resPct: pct.resPct || 0, attrs: a,
      ...extra,
    });
  }
  function playerPower() {
    const st = effectivePlayerStats();
    return Math.round(st.atk * 2 + st.def + st.hp * 0.2 + st.spd * 3);
  }
  function choosePlayerBloodline(id) {
    if (!D.BLOODLINES[id]) return  getProxied({ ok: false, msg: '命格不存在' });
    if (S.player.bloodline) return  getProxied({ ok: false, msg: '命格一旦选择不可更改' });
    if (S.player.level < D.BLOODLINE_UNLOCK_LV) return  getProxied({ ok: false, msg: `主角 Lv.${D.BLOODLINE_UNLOCK_LV} 才能觉醒命格（当前 Lv.${S.player.level}）` });
    S.player.bloodline = id;
    save();
    return  getProxied({ ok: true, msg: `已觉醒${id}命格，境界线开启：${D.realmName(id, 0)} 起` });
  }
  // 当前血统的 36 阶全览（境界页整条展示用）
  function realmChainOf(bloodlineId) { return D.realmChain(bloodlineId || S.player.bloodline); }
  function upgradePlayerBloodline() {
    if (!S.player.bloodline) return  getProxied({ ok: false, msg: '尚未选择命格' });
    // 解锁门禁：血统"强化"要通关 潜影窟·第1关 才开（与 D.UNLOCKS 的说明同源；
    // 起步时的"选血统"不受限——那是开局必经的一步）
    if (!isUnlocked('bloodline')) return  getProxied({ ok: false, msg: `🔒 ${unlockTip('bloodline')}` });
    if (S.player.bloodlineLv >= D.BLOODLINE_MAX) return  getProxied({ ok: false, msg: '命格已满级' });
    const q = bloodlineQuote('@player');         // 与界面同一份报价（已含血统实验室折扣）
    /* V1.1.4（A12-F · 命格接「血髓晶」）：主角这条**与伙伴那条同一份口径**——
       两边都从 bloodlineQuote 取料，不然会出现"伙伴要料、主角不要料"这种最难查的分叉。 */
    const matId = q.mat, matN = q.matN || 0;
    if (matN && (S.items[matId] || 0) < matN) {
      return  getProxied({ ok: false, msg: `${(D.ITEMS[matId] ||  getProxied({})).name || matId} 不足（${S.items[matId] || 0}/${matN}）` });
    }
    const cost =  getProxied({ otherworld: q.otherworld, points: q.points });
    if (!spend(cost)) return  getProxied({ ok: false, msg: "异界结晶或点数不足" });
    if (matN) addItem(matId, -matN);
    S.player.bloodlineLv++;
    save();
    return  getProxied({ ok: true, msg: `命格 Lv.${S.player.bloodlineLv}` });
  }
  function teamPower() {
    // 上阵 5 格里就有主角本人（'@player'），所以这里按人算，别再单独加一次主角战力
    return S.party.filter(Boolean).reduce((sum, id) => sum + (id === '@player' ? playerPower() : power(id)), 0);
  }
  // 阵型（对标《道友修仙》的"阵法"）：由 D.FORMATIONS 的具名组合判定，界面直接显示"站的是哪一阵"。
  // 规则只有两条：①「同阵营」那一族只取命中的最高档，不重复叠；② 主角是万能补位（顶人数最多的那个阵营）。
  function formationState(partyIds) {
    const ids = (partyIds ||  getProxied([])).filter(Boolean);
    // V9.5.44（父亲大人）：阵型只有**上满 5 人**才可能激活（不满编一律算未成阵）
    const full = ids.length >= 5;
    const count =  getProxied({});
    ids.forEach(id => { const c = D.charById[id]; if (c) count[c.faction] = (count[c.faction] || 0) + 1; });
    let top = '';
    Object.keys(count).forEach(f => { if (!top || count[f] > count[top]) top = f; });
    const eff = Object.assign( getProxied({}), count);
    if (top) eff[top] += 1;              // 主角补位
    const vals = Object.values(eff);
    const maxN = vals.length ? Math.max.apply(null, vals) : 0;
    const twoPlus = vals.filter(n => n >= 2).length;
    const kinds = Object.keys(count).length;
    const has =  getProxied({
      tri: full && maxN >= 3, quad: full && maxN >= 4, penta: full && maxN >= 5,
      pillar: full && twoPlus >= 2, allfour: full && kinds >= 4,
    });
    const SAME_FAMILY =  getProxied(['penta', 'quad', 'tri']);
    const bestSame = SAME_FAMILY.find(x => has[x]) || null;
    const hit =  getProxied([]);
    const buff =  getProxied({ atkPct: 0, hpPct: 0, skillPct: 0 });
    D.FORMATIONS.forEach(f => {
      if (!has[f.id]) return;
      if (SAME_FAMILY.includes(f.id) && f.id !== bestSame) return;   // 同阵营只取最高档
      hit.push(f.id);
      Object.keys(f.buff).forEach(k => { buff[k] = (buff[k] || 0) + f.buff[k]; });
    });
    return  getProxied({
      atkPct: buff.atkPct, hpPct: buff.hpPct, skillPct: buff.skillPct,
      count, eff, maxN, kinds, hit,
      bestSame,
      active: hit.map(id => D.FORMATIONS.find(f => f.id === id)),
      // 界面用：现在命中的阵型名，没命中就是"未成阵"
      names: hit.map(id => (D.FORMATIONS.find(f => f.id === id) ||  getProxied({})).name).filter(Boolean),
      full,
    });
  }
  function factionBuffs(partyIds) { return formationState(partyIds); }

  /* ================= 装备操作 ================= */
  /* opts.preferWorldSet：开箱专用 —— 世界套装的概率从 60% 抬到 80%
     （父亲大人："箱子开出来的是那一张图的套装"，见 openBox） */
  function grantEquip(worldId, rarity, slot, opts0) {
    opts0 = opts0 ||  getProxied({});
    const uid = 'eq' + Date.now().toString(36) + '_' + (uidCounter++);
    const slots = slot ?  getProxied([slot]) : D.DROP_SLOTS;
    const s = slots[Math.floor(Math.random() * slots.length)];
    // 装备类别：普通 / 世界套装 / 血统套装 / 血统神装（神话专属）
    let opts =  getProxied({ setType: 'plain' });
    const roll = Math.random();
    /* 神话只会是血统神装，没有"普通神话"这一说。
       血统怎么挑（V9.6.76）：**七成偏向上阵那 5 个人的血统**，剩下三成六支里随机。
       全随机的话，想给主力凑一套要刷到天荒地老；全按队伍给又变成"没有选择"。
       偏差给到七三，既照顾主力，又留着"别的血统也能刷出来"的空间。 */
    const wi = D.WORLDS.findIndex(x => x.id === worldId) + 1;
    const hasBlood = wi >= D.BLOODLINE_MIN_WORLD;
    if (rarity === 'MYTH') opts =  getProxied({ setType: 'god', godSet: randomGodSet() });
    else if (rarity === 'R') opts = roll < 0.5 ?  getProxied({ setType: 'plain' }) :  getProxied({ setType: 'world' });
    else if (rarity === 'SR' || rarity === 'SSR' || rarity === 'UR') {
      /* 血统套装**第 10 张图起**才有（父亲大人："就第 10 个世界后每个世界都有对应的血统套装"）——
         第 10 张之前那 30% 落点只给普通装，不会掉出一件"属于不存在套装"的装备
         （makeEquip 里还有一道兜底：这张图没这套就退化成世界套装）。 */
      const pWorld = rarity === 'SR' ? (opts0.preferWorldSet ? 0.85 : 0.7) : (opts0.preferWorldSet ? 0.8 : 0.6);
      if (roll < pWorld) opts =  getProxied({ setType: 'world' });
      else opts = hasBlood ?  getProxied({ setType: 'blood', bloodSet: randomBloodlineSet() }) :  getProxied({ setType: 'plain' });
    }
    const eq = D.makeEquip(worldId, s, rarity, uid, opts);
    S.equips[uid] = eq;
    S.codex.equipsSeen++;
    /* V1.1.3（A10 图鉴装备卷）：记**装备名**（同一件装备不同强化/词条算一种）——
       名字是"收集轴"的粒度，uid 那种一次性 id 没法当图鉴用。 */
    if (S.codex.equipNames && eq.name && S.codex.equipNames.indexOf(eq.name) < 0) S.codex.equipNames.push(eq.name);
    // 自动分解（设置页开关）：白装 / 绿装不进背包，直接换成异界结晶
    if ((rarity === 'N' && S.settings.autoSellN) || (rarity === 'R' && S.settings.autoSellR)) {
      delete S.equips[uid];
      const gain = D.DECOMPOSE_GAIN[rarity];
      addCur('otherworld', gain);
      return  getProxied({ sold: true, gain, auto: true });
    }
    /* ================= V1.1.15（2026-09-27 · 父亲大人："那我要是副本掉落的装备呢"）=================
       装备格满 → **进装备待领箱**（不再是折现成 ◆）。
       原来是 `delete S.equips[uid]; addCur('otherworld', gain);` —— 刷本出的 UR 直接变成一点结晶，
       玩家扩容回来发现装备没了。现在存进 `S.stashEq`，装备页顶部会出现「📮 待领箱」卡片，
       点"全部领回"就回到背包（一件不丢）。只有堆到 60 件上限还不扩容，才折现。 */
    if (bagUsage().eqUsed > S.bag.eqCap) {
      delete S.equips[uid];
      const sr = stashEquip(eq);
      if (sr.stashed) return  getProxied({ equip: null, stashed: true, eq: eq, bagFull: true });
      return  getProxied({ sold: true, gain: sr.gain || 0, bagFull: true, overflow: !!sr.overflow });
    }
    return  getProxied({ equip: eq });
  }
  /* 套装该给哪支血统：**七成偏向上阵那 5 个人**，三成六支里随机。
     全随机的话想给主力凑一套要刷到天荒地老；全按队伍给又变成"没有选择"。
     （V9.6.81：血统套装与血统神装共用这一条随机线 —— 都是血统的东西。） */
  function randomBloodSet(pool) {          // pool = 一组"血统名"，返回其中一个
    const party = (S.party ||  getProxied([])).filter(Boolean)
      .map(id => (id === '@player' ? S.player.bloodline : (D.charById[id] ||  getProxied({})).bloodline))
      .filter(b => b && pool.indexOf(b) >= 0);
    if (party.length && Math.random() < 0.7) return party[Math.floor(Math.random() * party.length)];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function randomGodSet() { return randomBloodSet(Object.keys(D.GOD_SETS)); }
  /* ⚠ 这里要的是**血统名**，不是套装 key（V9.6.82 踩过：传错的池子会让 makeEquip 找不到套装、
     静默降级成世界套装 —— 表面不报错，实际血统套装一件都掉不出来）。 */
  function randomBloodlineSet() { return randomBloodSet(D.BLOODLINE_KEYS || Object.keys(D.BLOODLINE_SETS)); }
  // 伙伴专属装备（本命 · UR · 绑定角色 · 6 支血统 × 6 个部位 ＝ 36 件，见 data.js 的 SIGNATURE_EQUIPS）
  function grantSignatureEquip(sigId) {
    const uid = 'eq' + Date.now().toString(36) + '_' + (uidCounter++);
    /* 专属装备的基础值按**玩家当前进度**那张图的档位生成（V9.6.83）——
      以前是写死的 320，第 20 张图之后随便一件普通 UR 武器都比它强，专属成了纪念品。 */
    const eq = D.makeSignatureEquip(sigId, uid, boxSourceWorld());
    if (!eq) return  getProxied({ sold: false });
    S.equips[uid] = eq;
    S.codex.equipsSeen++;
    /* ================= 0928 抢修单 F5 #3：专属装备满格时**不许"折现即永久消失"** =================
       旧顺序是"先写图鉴名字（equipNames）→ 再判容量 → 满了就 delete + 折现 240◆"。
       而 `pickSignatureEquip` 正是拿 `equipNames` 判"这件有没有拥有过"——
       于是一件被折现的本命装备，系统此后永远认定"已拥有"，**对玩家永久消失**
       （36 件收集线那一条直接断掉，结算页还只写"已折现"）。
       处置：① 容量判定挪到**写图鉴名字之前**；② 与 `grantEquip` **共用同一个出口**
       （`stashEquip`：装得下 → 进包；装不下 → 进装备待领箱，可领回；只有待领箱也满 60 件才折现）。 */
    if (bagUsage().eqUsed > S.bag.eqCap) {
      delete S.equips[uid];
      const sr = stashEquip(eq);
      if (sr.stashed) {
        if (S.codex.equipNames && eq.name && S.codex.equipNames.indexOf(eq.name) < 0) S.codex.equipNames.push(eq.name);
        return  getProxied({ equip: null, stashed: true, eq: eq, bagFull: true, signature: true });
      }
      return  getProxied({ sold: true, gain: sr.gain || 0, bagFull: true, overflow: !!sr.overflow, signature: true });
    }
    if (S.codex.equipNames && eq.name && S.codex.equipNames.indexOf(eq.name) < 0) S.codex.equipNames.push(eq.name);
    return  getProxied({ equip: eq, signature: true });
  }

  // 扩容分三种：kind = 'item'（道具）| 'mat'（材料）| 'eq'（装备），三条曲线各自独立。
  // 每次 +10 格，价格从 ◉ 1500 起、每扩一次 ×1.3。
  function buyBagCap(kind) {
    /* V1.1.2（并池）：道具池与材料池并成一个 —— 所以 `item` 与 `mat` 两种 kind 都扩**同一个池**
       （扩容价按同一个 expands 计数往上走，不会出现"两个池各花一份钱"）。`eq` 保持独立。 */
    const k = kind === 'eq' ? 'eq' : 'item';
    const expandsKey = k + 'Expands';
    const capKey = k + 'Cap';
    const label = (k === 'eq') ? '装备' : '背包';
    const cost = D.bagExpandCost(S.bag[expandsKey] || 0);
    if (!spend( getProxied({ points: cost }))) return  getProxied({ ok: false, msg: `点数不足（需 ◉ ${cost}）` });
    S.bag[expandsKey] = (S.bag[expandsKey] || 0) + 1;
    S.bag[capKey] += D.BAG_EXPAND_SIZE;
    if (k === 'item') S.bag.matCap = Math.max(S.bag.matCap || 0, S.bag.itemCap);   // 并池：两侧同步，老读法也不会看到"材料池更小"
    save();
    return  getProxied({ ok: true, msg: `${label}格 +${D.BAG_EXPAND_SIZE}，现在 ${S.bag[capKey]} 格` });
  }
  function equipItem(charId, uid) {
    const eq = S.equips[uid];
    if (!eq) return false;
    if (!canEquip(charId, eq)) return false;
    // 一件装备只能有一个人穿：先把它从别人（或自己的别的槽）身上摘下来。
    // 旧版少了这一步，同一件装备会同时留在多个角色身上（越换装越脏）。
    unequipEverywhere(uid, charId);
    if (!S.equipped[charId]) S.equipped[charId] =  getProxied({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null });
    S.equipped[charId][eq.slot] = uid;
    save();
    return true;
  }
  // 把某件装备从所有人的所有槽里摘掉（keepId 指向的那个角色除外——他马上要穿上）
  function unequipEverywhere(uid, keepId) {
    let removed = 0;
    Object.entries(S.equipped).forEach(([cid, slots]) => {
      if (!slots) return;
      Object.keys(slots).forEach(k => {
        if (slots[k] !== uid) return;
        if (cid === keepId && k === (S.equips[uid] ||  getProxied({})).slot) return;   // 自己本来就穿在这个槽，保留
        slots[k] = null;
        removed++;
      });
    });
    return removed;
  }
  // 找出某件装备现在穿在谁身上（没有则返回 null）。装备页 / 选装备页都靠它显示"谁穿着"
  function equipWearer(uid) {
    if (!S.equips[uid]) return null;
    const hit = Object.entries(S.equipped).find(([, slots]) => slots && Object.values(slots).includes(uid));
    return hit ? hit[0] : null;
  }
  // 清掉"一件装备多人穿"的脏数据：主角优先，其次队伍顺序，最后其余角色
  // （老存档读档时跑一次，改完之后的存档不会再出现这种数据）
  /* ================= 脏档洗净（V9.5.83 自审） =================
     游戏有「导入存档」入口，玩家可能粘进一份被改过 / 半截的档（未知 id、NaN、负数）。
     不清洗的话，渲染时会在 `D.charById[id].rarity`、`D.ITEMS[k].name` 这类地方直接抛异常——
     界面整片白，而玩家又没有任何入口去修（连设置页都进不去）。
     这里在**读档的唯一入口**（migrate）做一次收敛：
       · 未知伙伴 / 未知道具 / 未知或残缺装备 → 丢掉（已穿戴的引用交给 dedupeEquips 清）
       · 货币、等级、星级、技能等级、碎片、建筑、评级、深井、斗法台、伴生体 → 收敛到合法区间
     原则：**宁可少一点，也绝不崩**。 */
  function numOr(v, dft) { const n = Number(v); return Number.isFinite(n) ? n : dft; }
  function clampNum(v, min, max, dft) { return Math.min(max, Math.max(min, numOr(v, dft === undefined ? min : dft))); }
  function sanitizeSave() {
     getProxied(['chars', 'items', 'equips', 'serums']).forEach(k => { if (!S[k] || typeof S[k] !== 'object') S[k] =  getProxied({}); });
    Object.keys(S.chars).forEach(id => { if (!D.charById[id]) delete S.chars[id]; });
    /* V1.1.20（F1-7）：道具**件数也要洗**。原来这里只删未知 id，件数原样收下 ——
       一份被改过的档塞进 `NaN` / 负数 / 字符串，`bagUsage()` 会整串变 NaN ⇒ 背包显示 NaN、
       `canAddItem()` 恒假 ⇒ 之后掉的东西全进待领箱、而 `stashNeedCells()` 也是 NaN 领不回来。
       口径：非有限数按 0、负数/0 直接删键（与"未知 id 就删"同一条：宁可少，绝不崩）。 */
    Object.keys(S.items).forEach(k => {
      if (!D.ITEMS[k]) { delete S.items[k]; return; }
      const n = Math.floor(numOr(S.items[k], 0));
      if (!(n > 0)) { delete S.items[k]; return; }
      S.items[k] = n;
    });
    Object.keys(S.equips).forEach(uid => {
      const e = S.equips[uid];
      /* V9.5.86（自审·战斗引擎压测）：这里原来只校验槽位和稀有度——
         一件 `base: { atk: NaN }` 的装备能通过，然后一路把 NaN 带进战力、血量、
         战斗帧，最后写进"进行中的探索"存档（run.hpPct 变 NaN），界面上就是 NaN%。
         现在把数值字段也校验掉：base 里每个数必须是有限数、affixes 的加成同理、
         enhance 夹到 0~99。任何一项不合法就整件丢掉（宁可少一件，不能带毒）。 */
      const fin = v => Number.isFinite(Number(v));
      const ok = e && typeof e === 'object' && !!D.EQUIP_SLOTS[e.slot] && !!D.EQUIP_RARITY_MULT[e.rarity]
        && fin(e.enhance) && Number(e.enhance) >= 0
        && e.base && typeof e.base === 'object'
        && Object.values(e.base).every(fin)
        && (!e.affixes || (Array.isArray(e.affixes) && e.affixes.every(a => a && fin(a.v))));
      if (!ok) { delete S.equips[uid]; return; }
      e.enhance = clampNum(e.enhance, 0, 99);
    });
    Object.keys(S.cur ||  getProxied({})).forEach(k => { S.cur[k] = Math.max(0, numOr(S.cur[k], 0)); });
    S.player.level = clampNum(S.player.level, 0, D.PLAYER_MAX_LV);
    S.player.exp = Math.max(0, numOr(S.player.exp, 0));
    S.player.attrPoints = Math.max(0, numOr(S.player.attrPoints, 0));
    S.player.skillPoints = Math.max(0, numOr(S.player.skillPoints, 0));
    S.player.bloodlineLv = clampNum(S.player.bloodlineLv, 0, D.BLOODLINE_MAX);
    S.player.realm = clampNum(S.player.realm, 0, D.REALM_STAGE_COUNT);
    S.player.geneLock = clampNum(S.player.geneLock, 0, D.GENE_LOCKS.length);
    S.player.reincarnations = Math.max(0, numOr(S.player.reincarnations, 0));
    S.player.skillLv = (S.player.skillLv ||  getProxied([0, 0, 0])).slice(0, 3).map((v, i) => clampNum(v, 0, D.SKILL_MAX_BY_INDEX[i]));
    while (S.player.skillLv.length < 3) S.player.skillLv.push(0);
    S.player.attrs = S.player.attrs ||  getProxied({});
    D.ATTR_META.forEach(a => { S.player.attrs[a.id] = Math.max(0, numOr(S.player.attrs[a.id], 0)); });
    D.BUILDINGS.forEach(b => { S.buildings[b.id] = clampNum(S.buildings[b.id], 0, 99); });
    S.auth = clampNum(S.auth, 0, D.AUTHORITY_MAX);
    S.sect =  getProxied({ lv: clampNum(S.sect && S.sect.lv, 0, D.SECT_MAX), exp: Math.max(0, numOr(S.sect && S.sect.exp, 0)) });
    S.corridor =  getProxied({ floor: clampNum(S.corridor && S.corridor.floor, 1, 9999), best: clampNum(S.corridor && S.corridor.best, 0, 9999) });
    S.arena = Object.assign( getProxied({ floor: 1, best: 1, date: '', used: 0 }), S.arena ||  getProxied({}));
    S.arena.floor = clampNum(S.arena.floor, 1, 9999);
    S.arena.used = Math.max(0, numOr(S.arena.used, 0));
    Object.keys(S.keji ||  getProxied({})).forEach(k => { if (!D.kejiById(k)) delete S.keji[k]; });
    Object.values(S.chars).forEach(c => {
      c.lv = clampNum(c.lv, 0, D.PLAYER_MAX_LV);
      c.star = clampNum(c.star, 1, D.RARITY_MAXSTAR[D.charById[c.id] && D.charById[c.id].rarity] || 6);
      c.shards = Math.max(0, numOr(c.shards, 0));
      c.bloodlineLv = clampNum(c.bloodlineLv, 0, D.BLOODLINE_MAX);
      c.skillLv = (c.skillLv ||  getProxied([0, 0, 0])).slice(0, 3).map((v, i) => clampNum(v, 0, D.SKILL_MAX_BY_INDEX[i]));
      while (c.skillLv.length < 3) c.skillLv.push(0);
    });
    Object.keys((S.beast && S.beast.owned) ||  getProxied({})).forEach(id => {
      const b = S.beast.owned[id];
      if (!D.beastById(id)) { delete S.beast.owned[id]; return; }
      b.lv = clampNum(b.lv, 0, D.BEAST_MAX_LV);
      b.soul = Math.max(0, numOr(b.soul, 0));
    });
    if (S.beast && S.beast.active && !S.beast.owned[S.beast.active]) S.beast.active = null;
    dedupeEquips();
    /* 队伍最后再归一化一次：上面刚把"不在册的伙伴"删掉了，队伍里可能还留着他们的 id
       （normalizeParty 在 migrate 的前半段跑过，那时这些 id 还在）——不补这一步，
       渲染队伍盘时就会在 D.charById[id].rarity 上崩。 */
    S.party = normalizeParty(S.party);
    /* V9.5.86：**进行中的探索**也要洗——它同样被存进档里（刷新/被系统回收后接着打），
       一份被改过的档可能带着 NaN 的血线或离谱的波次，进副本页就会画出 "NaN%" 的血条。 */
    if (S.pendingRun && typeof S.pendingRun === 'object') {
      const pr = S.pendingRun;
      pr.stage = clampNum(pr.stage, 1, 12);
      pr.wave = clampNum(pr.wave, 0, 2);
      if (!Array.isArray(pr.waves) || !pr.waves.length) pr.waves =  getProxied(['combat']);
      pr.hpPct = pr.hpPct && typeof pr.hpPct === 'object' ? pr.hpPct :  getProxied({});
      Object.keys(pr.hpPct).forEach(k => { pr.hpPct[k] = clampNum(pr.hpPct[k], 0, 1); });
      if (!D.WORLDS.some(w => w.id === pr.worldId)) S.pendingRun = null;
    } else if (S.pendingRun !== undefined) {
      S.pendingRun = null;
    }
  }
  function dedupeEquips() {
    const seen =  getProxied(new Set());
    let fixed = 0;
    const party = Array.isArray(S.party) ? S.party.filter(Boolean) :  getProxied([]);
    const order =  getProxied(['@player']).concat(party, Object.keys(S.equipped ||  getProxied({})));
    const done =  getProxied({});
    order.forEach(cid => {
      if (done[cid]) return;
      done[cid] = true;
      const slots = S.equipped[cid];
      if (!slots) return;
      Object.keys(slots).forEach(k => {
        const uid = slots[k];
        if (!uid) return;
        if (!S.equips[uid] || seen.has(uid)) { slots[k] = null; fixed++; return; }
        seen.add(uid);
      });
    });
    return fixed;
  }
  // 装备锁定：锁上的装备不会被分解（含批量分解），避免手滑拆掉主力装备
  function toggleEquipLock(uid) {
    const eq = S.equips[uid];
    if (!eq) return  getProxied({ ok: false });
    eq.lock = !eq.lock;
    save();
    return  getProxied({ ok: true, lock: eq.lock });
  }
  // 一键最优装备：按"能不能穿 + 词条价值"给主角与全队自动选装，已锁定的装备照常可以给人穿
  /* ================= 装备评分（V9.6.126 父亲大人："装备加个评分吧……排序就按评分"）=================
     全项目**唯一的装备评分**，一键最优装备和背包排序都用它 —— 只有一个口径，不会"分高的没被选上"。
     它就是这件装备**真实数值**的折算（不是另编一套"世界×品质"的表），所以三条要求天然满足：
       · 世界越靠后 → base 随 tier 线性涨（makeEquip）→ 分更高；
       · 同图品质越高 → 品质倍率 + 词条条数一起涨 → 分更高；
       · 强化过 → equipStats 里 1+enhance×5% 放大基础值 → 同款分更高。
     权重与伙伴战力同一套（atk×2 / def×1.2 / hp×0.2 / spd×3 + 百分比词条单价）。 */
  function equipScore(eq) {
    const st = equipStats(eq);
    let s = st.flat.atk * 2 + st.flat.def * 1.2 + st.flat.hp * 0.2 + st.flat.spd * 3 + (st.flat.critPct || 0) * 2000;
    Object.entries(st.affix).forEach(([k, v]) => {
      /* V1.1.13（0927-E · 总监 §3.3 第四行）：**`spiritPct` 原来落在这张表的兜底 200（全场最低）** ——
         而 `skillMult = 1 + 精神×0.006 + pct.skillPct`（本文件 effectiveStats），
         `ATK_ATTR` 里 healer / support 的主攻击属性**就是 spirit**（data.js）。
         也就是说：评分表把"修真 / 念动力最想要的词条"判成全场最差 —— **与血统设计自相矛盾**。
         给正式权重 1000（与技能伤害同档）。 */
      const w =  getProxied({ atkPct: 1200, hpPct: 500, defPct: 900, skillPct: 1000, critPct: 1500, critDmg: 600, spdPct: 900, evaPct: 700, resPct: 300, lifesteal: 800, spiritPct: 1000 })[k] || 200;
      s += v * w;
    });
    /* V9.6.129（父亲大人："装备评分还能显示到小数点后好几位，不要有小数点，直接显示到个位数"）：
       评分是"基础值 × 权重 + 百分比词条折算"算出来的浮点数，**在这里取整** ——
       排序、背包格子、详情页、一键最优装备用的是同一个数，所以在源头取整一处就全干净了
       （原来只有个别地方忘了取整，就会露出 1523.4700000000003 这种）。 */
    return Math.round(s);
  }
  /* 一键最优装备（V9.5.91 父亲大人重做）
     旧版规则是"把全队**未锁定**的装备全脱下来回池子、再重新分配"——两个毛病：
       ① 会把别人身上的装备抢走（玩家只想让这个人穿好的，结果全队都被洗了一遍）；
       ② 从没上阵的伙伴身上也扒（装备凭空跑到主力身上，玩家找不到）。
     现在只有三条规则：
       ① 候选池 = **没穿在任何人身上**的装备（锁定的不自动动：锁 = 别自动动它）；
       ② 只动 targets 这些人自己的格子：某格有更好的候选就换上，没有就保持原样；
       ③ 绝不碰其他任何人的装备（这条是硬规则，测试守着）。
     charId 传 '@player' 或伙伴 id = 只给这一个人配；不传 = 全体上阵成员各配一次。 */
  function autoEquipBest(charId) {
    const targets = charId ?  getProxied([charId]) :  getProxied(['@player']).concat(S.party.filter(Boolean));
    // 谁身上穿着什么：这一份一开始就锁死，只有"被换下来的那件"会解禁
    const worn =  getProxied(new Set());
    Object.keys(S.equipped).forEach(cid => {
      const cur = S.equipped[cid] ||  getProxied({});
      Object.keys(cur).forEach(slot => { if (cur[slot]) worn.add(cur[slot]); });
    });
    let changed = 0;
    const detail =  getProxied([]);
    targets.forEach(cid => {
      if (cid !== '@player' && !S.chars[cid]) return;
      const cur = S.equipped[cid] || (S.equipped[cid] =  getProxied({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null }));
      const slots = cid === '@player' ? D.PLAYER_SLOTS : D.RECRUIT_SLOTS;
      slots.forEach(slot => {
        const oldUid = cur[slot];
        const oldEq = oldUid ? S.equips[oldUid] : null;
        if (oldEq && oldEq.lock) return;                       // 锁着的一律不动
        let best = oldEq, bestScore = oldEq ? equipScore(oldEq) : -1;
        Object.values(S.equips).forEach(e => {
          if (e.uid === oldUid) return;
          if (worn.has(e.uid)) return;                         // 别人身上穿着 —— 绝不抢
          if (e.lock) return;                                  // 锁着的不自动动
          if (e.slot !== slot) return;
          if (!canEquip(cid, e)) return;
          const sc = equipScore(e);
          if (sc > bestScore) { bestScore = sc; best = e; }
        });
        if (best && best.uid !== oldUid) {
          cur[slot] = best.uid;
          if (oldUid) worn.delete(oldUid);                      // 换下来的回池子（可能给队里其他人用）
          worn.add(best.uid);
          changed++;
          detail.push(`${charName(cid)} ${D.EQUIP_SLOTS[slot]} → ${best.name}`);
        }
      });
    });
    save();
    return  getProxied({ ok: true, changed, members: targets.length, detail });
  }
  // 穿戴规则：专属限本人；血统套装与血统神装都要求**同血统**；槽位受角色类型限制
  function canEquip(charId, eq) {
    if (!eq) return false;
    if (eq.charId && eq.charId !== charId) return false;
    if (charId !== '@player' && !S.chars[charId]) return false;
    /* 血统套装 / 血统神装：只有**同血统**的人穿得上（V9.6.81 起两条线同一条规矩）。
       这是"凑齐一套"的代价 —— 六件都得是这支血统，别人代穿不算。 */
    const bl = charId === '@player' ? S.player.bloodline : (D.charById[charId] ||  getProxied({})).bloodline;
    if (eq.bloodSet && eq.bloodSet !== bl) return false;
    if (eq.godSet && eq.godSet !== bl) return false;
    /* ⚠ 老存档兜底：V9.6.81 之前的装备带的是 `classSet`（定位名，如 warrior）。
       migrate() 会把它换成血统，但**万一有漏网的**（手动改档 / 更老的版本），
       这里按 LEGACY_KIND_SET 现算一次，别让玩家看到"穿不上又不知道为什么"。 */
    if (eq.classSet) {
      const mapped = (D.LEGACY_KIND_SET ||  getProxied({}))[eq.classSet];
      if (!mapped || mapped !== bl) return false;
    }
    return (charId === '@player' ? D.PLAYER_SLOTS : D.RECRUIT_SLOTS).includes(eq.slot);
  }
  function unequipItem(charId, slot) {
    if (!S.equipped[charId]) return false;
    S.equipped[charId][slot] = null;
    save();
    return true;
  }
  function enhanceCost(eq) {
    const base = Math.round((100 + eq.enhance * 60) * D.EQUIP_RARITY_MULT[eq.rarity]);
    const discount = Math.min(0.4, S.buildings.workshop * 0.01);
    return  getProxied({ points: Math.ceil(base * (1 - discount)), otherworld: 2 + Math.floor(eq.enhance / 5) * 2 });
  }
  /* V9.5.89（十七度自审）：**报价**和**实扣**必须是同一份数据。
     原来界面只显示 enhanceCost（点数 + 结晶），而 enhance() 在没材料时还要把代用点数加进点数、
     有材料时还要吃掉一块材料 —— 实测：无材料时按钮写 ◉200 实扣 ◉400，+12 那一档写 1640 实扣 4640；
     有材料时按钮上一个字都没提"要消耗一块材料"。玩家按的不是他看到的那个价。
     现在界面和扣款都读这一个 quote，结构上不允许再分叉。 */
  function enhanceQuote(uid) {
    const eq = S.equips[uid];
    if (!eq) return null;
    const cost = enhanceCost(eq);
    const mat = enhanceMat(eq);
    return  getProxied({
      maxed: eq.enhance >= 20,
      points: cost.points + (mat.has ? 0 : mat.subPoints),   // 真正会扣的点数（含代用）
      basePoints: cost.points,
      substitute: mat.has ? 0 : mat.subPoints,
      otherworld: cost.otherworld,
      itemId: mat.itemId,
      itemName: (D.ITEMS[mat.itemId] ||  getProxied({})).name || mat.itemId,
      matHave: mat.has,
      matOwned: S.items[mat.itemId] || 0,
      tier: mat.tier,
      rate: D.ENHANCE_RATE[Math.min(eq.enhance, D.ENHANCE_RATE.length - 1)],
    });
  }
  // 强化所需材料：无材料时按 tier 折算点数代用
  function enhanceMat(eq) {
    const tier = D.enhanceMatTier(eq.enhance);
    /* V1.1.16（0927-Y 数值轮 · 报告 §五 I1）：一档可能有好几种料（`MAT_TIER_IDS`）——
       **功能等价，谁有吃谁**，`mat_tN` 排第一（先把玩家手里那一大堆花掉）。
       这一处的效果正是报告要的"把一些货币消耗换成道具/材料"：
       以前同档只有一种料、没有了就用点数代用（`MAT_SUBSTITUTE_POINTS`）；
       现在同档有兄弟料就直接吃料、不代用。**报价与扣款仍走同一个 quote**（结构上不允许分叉）。 */
    const itemId = D.mathaveOfTier ? D.mathaveOfTier(tier, S.items) : ('mat_t' + tier);
    const has = (S.items[itemId] || 0) > 0;
    return  getProxied({ itemId, tier, has, subPoints: has ? 0 : D.MAT_SUBSTITUTE_POINTS[tier] });
  }
  function enhance(uid) {
    const eq = S.equips[uid];
    if (!eq) return  getProxied({ ok: false, msg: '装备不存在' });
    if (!isUnlocked('enhance')) return  getProxied({ ok: false, msg: `🔒 ${unlockTip('enhance')}` });
    if (eq.enhance >= 20) return  getProxied({ ok: false, msg: '已满强化' });
    const q = enhanceQuote(uid);                 // 与界面同一份报价
    const cost =  getProxied({ points: q.points, otherworld: q.otherworld });
    // 先判够不够，再扣材料——顺序反了会白吞材料（档案里的同类问题）
    if (!canAfford(cost)) {
      /* V9.6.112（真流程审计）：报错要说清**差哪一种**。
         原来不管差点数还是差异界结晶都写"点数不足" —— 玩家兜里 2 万点数、
         只差 2 个 ◆，屏幕上却说"点数不足"，只会当成 bug 或者以为自己看错了。 */
      const short =  getProxied([]);
      if ((S.cur.points || 0) < q.points) short.push('点数 ◉' + q.points);
      if ((S.cur.otherworld || 0) < q.otherworld) short.push('异界结晶 ◆' + q.otherworld);
      const lack = short.length ? short.join(' + ') : '材料';
      return  getProxied({ ok: false, msg: q.matHave ? (`不够 ${lack}`) : (`不够 ${lack}（无${q.itemName}，需额外代用 ◉ ${q.substitute}）`) });
    }
    if (q.matHave) {
      S.items[q.itemId]--;
      if (S.items[q.itemId] <= 0) delete S.items[q.itemId];
    }
    spend(cost);
    const rate = D.ENHANCE_RATE[eq.enhance];
    S.stats.enhances++;
    task('enhance1', 1);
    if (Math.random() < rate) {
      eq.enhance++;
      save();
      return  getProxied({ ok: true, msg: `强化成功 +${eq.enhance}` });
    }
    save();
    return  getProxied({ ok: false, fail: true, msg: `强化失败（成功率 ${Math.round(rate * 100)}%），装备未降级` });
  }
  /* ================= V1.1.8（戊组 A13-F · 重铸石）=================
     口径（《收口2》§1.4 的 A13-F/A13-N）：
       · **重 roll 副词条的「数值」** —— 只换数值、**不换词条种类**（想要别的种类得换一件装备）；
       · **锁定过的装备不可重摇**（锁 = 别动它，与"一键最优装备 / 分解"同一条规矩）；
       · 消耗 ＝ **1 块当前档材料 ＋ ◉3,000**（临时保守值，偏贵；数值轮只改 `REFORGE_POINTS` 与那条公式）。
     三条硬判据（`test_game` 里逐个断言）：① 重铸 20 次后**词条种类集合不变**；
       ② 数值**全在 `AFFIX_POOL` 区间内**（走 `D.rollAffixValue`，与生成装备同一个函数）；
       ③ **强化等级与锁定状态不变**（重铸只碰 `affixes[].v` 那一个字段）。 */
  /* ================= V1.1.13（0927-E · 总监 D 单 §四 · 两档重铸 ＋ 锁定 ＋ 炉火）=================
     档 A「重摇数值」：只重摇**未锁定**词条的 `v`（`k` 不变）—— 老口径，保留；
     档 C「重抽词条」：未锁定词条的**种类 ＋ 数值**一起重抽（走 `D.rollAffixKey` 部位加权池，
       排除"已锁的"与"这次已经抽到的"，所以一件装备上不会出现两条同名词条）；
     档 B「锁定」是**附加**在 A/C 上的：每锁 1 条 ＋1 颗石（最多锁 n−1 条 —— 至少留 1 条参与）。
     炉火：每做一次**档 A** `eq.forge.n += 1`；`n` 到 `REFORGE_PITY−1` 时下一次档 A 触发保底 ——
       对本次参与重摇的每一条取 `max(新值, 旧值)` 并清零（**档 C 不计数也不清零**）。
     ⚠️ 只碰 `affixes` / `forge` / `affixLock` 三个字段：`base / enhance / lock / set / bloodSet / godSet / rarity`
        一个都不动（这条是既有保证，V1.1.13 继续钉住 —— test_game 里有断言）。
     ⚠️ `eq.lock`（整件保护）优先级最高：锁定的装备**两档都不能重铸**（要先解锁）。
     ⚠️ 词条锁用**新字段 `eq.affixLock`**（下标数组）—— **绝不复用 `eq.lock`**：
        一个字段两个意思会同时砸掉"一键最优装备 / 批量分解 / 重铸"三处已有断言（总监 §4.2 命名铁律）。
     ⚠️ 专属装备（`eq.charId`）**不能做档 C**：词条种类是它设计的一部分（`sig.affixes`），
        重抽等于把它改成另一件装备。档 A 可用（数值重摇不影响它的身份）。 */
  function reforgeModeOf(mode) { return mode === 'kind' ? 'kind' : 'value'; }
  /* 一件装备的**词条总评**（q 均值，0~1）—— 界面的"词条总评"、重铸前后对比、历史最好
     三处都读它，只算一处（`D.affixQ` 是 q 的唯一口径）。 */
  function affixMeanQ(eq) {
    const list = (eq && eq.affixes) || [];
    if (!list.length) return 0;
    let s = 0;
    list.forEach(a => { s += D.affixQ ? D.affixQ(a.k, eq.rarity, a.v) : 0; });
    return +(s / list.length).toFixed(3);
  }
  function affixLocksOf(eq) {
    const n = (eq.affixes || []).length;
    return (eq.affixLock ||  getProxied([])).filter(i => typeof i === 'number' && i >= 0 && i < n);
  }
  function reforgeCost(eq, opts) {
    const mode = reforgeModeOf((opts ||  getProxied({})).mode);
    const tier = D.enhanceMatTier(eq.enhance || 0);
    const locks = affixLocksOf(eq).length;
    const stoneN = (mode === 'kind' ? (D.REFORGE_KIND_STONE || 3) : 1) + locks * (D.REFORGE_LOCK_STONE || 1);
    const itemN = mode === 'kind' ? (D.REFORGE_KIND_MAT || 2) : 1;
    const points = mode === 'kind' ? (D.REFORGE_KIND_POINTS || 9000) : (D.REFORGE_POINTS || 3000);
    const item = 'mat_t' + tier;
    const matHave = S.items[item] || 0;
    /* 材料不足照**强化那条现成的路**代用（`MAT_SUBSTITUTE_POINTS`）——
       ⚠️ **不许用材料替代"重铸石"本身**：石头是这套机制唯一的闸门（总监 §5.2）。 */
    const short = Math.max(0, itemN - matHave);
    const substitute = short * ((D.MAT_SUBSTITUTE_POINTS ||  getProxied([]))[tier] || 0);
    return  getProxied({
      mode, locks, tier, item, itemN, points,
      stone: D.REFORGE_ITEM || 'reforge_stone', stoneN,
      matHave, short, substitute,
    });
  }
  function reforgeQuote(uid, opts) {
    const eq = S.equips[uid];
    if (!eq) return null;
    const mode = reforgeModeOf((opts ||  getProxied({})).mode);
    const c = reforgeCost(eq, { mode });
    const locks = affixLocksOf(eq);
    const n = (eq.affixes || []).length;
    const forgeN = (eq.forge && eq.forge.n) || 0;
    const perAffix = (eq.affixes || []).map((a, i) => {
      const pool = (D.AFFIX_POOL ||  getProxied({}))[a.k] ||  getProxied({});
      const q = D.affixQ ? D.affixQ(a.k, eq.rarity, a.v) : 0;      // 本档可达区间里的位置（0~1）
      return  getProxied({
        i, k: a.k, v: a.v, name: pool.name || a.k,
        q: +q.toFixed(3), tier: D.affixTierName ? D.affixTierName(q) : '',
        locked: locks.indexOf(i) >= 0,
      });
    });
    const meanQ = perAffix.length ? perAffix.reduce((s, x) => s + x.q, 0) / perAffix.length : 0;
    return  getProxied({
      uid, mode, locked: !!eq.lock, can: !eq.lock,
      points: c.points, item: c.item, itemN: c.itemN, tier: c.tier,
      substitute: c.substitute, short: c.short, matHave: c.matHave,
      stone: c.stone, stoneN: c.stoneN, stoneHave: S.items[c.stone] || 0,
      locks, canLock: n - locks.length > 1,                       // 至少留 1 条参与
      kindable: !eq.charId,                                       // 专属装备不能重抽词条
      perAffix, meanQ: +meanQ.toFixed(3), tierAvg: D.affixTierName ? D.affixTierName(meanQ) : '',
      forgeN, pityAt: (D.REFORGE_PITY || 6) - 1, pityReady: forgeN >= (D.REFORGE_PITY || 6) - 1,
      affixes: perAffix,
    });
  }
  /* 词条锁开关（档 B）。**唯一入口** —— 界面只调它，不许自己去改 `eq.affixLock`。 */
  function setAffixLock(uid, i, on) {
    const eq = S.equips[uid];
    if (!eq) return  getProxied({ ok: false, msg: '装备不存在' });
    const n = (eq.affixes || []).length;
    if (!(i >= 0 && i < n)) return  getProxied({ ok: false, msg: '没有这条词条' });
    const cur = affixLocksOf(eq);
    if (on) {
      if (cur.indexOf(i) < 0) {
        if (cur.length >= n - 1) return  getProxied({ ok: false, msg: `最多锁 ${n - 1} 条 —— 至少要留 1 条参与重铸` });
        cur.push(i);
      }
    } else {
      const at = cur.indexOf(i);
      if (at >= 0) cur.splice(at, 1);
    }
    eq.affixLock = cur.slice().sort((a, b) => a - b);
    save();
    return  getProxied({ ok: true, affixLock: eq.affixLock });
  }
  function reforgeEquip(uid, opts) {
    const eq = S.equips[uid];
    if (!eq) return  getProxied({ ok: false, msg: '装备不存在' });
    if (eq.lock) return  getProxied({ ok: false, msg: '这件装备已锁定 —— 先解锁再重铸（锁=别动它）' });
    if (!eq.affixes || !eq.affixes.length) return  getProxied({ ok: false, msg: '这件装备没有副词条，重铸不了' });
    const mode = reforgeModeOf((opts ||  getProxied({})).mode);
    if (mode === 'kind' && eq.charId) return  getProxied({ ok: false, msg: '专属装备不能重抽词条（词条种类是它的设计的一部分）' });
    const q = reforgeQuote(uid, { mode });              // 与界面同一份报价（含锁定条数）
    const stoneName = (D.ITEMS[q.stone] ||  getProxied({})).name || q.stone;
    if (q.stoneHave < q.stoneN) {
      return  getProxied({ ok: false, msg: `${stoneName} 不足（${q.stoneHave}/${q.stoneN}）` });
    }
    const payPoints = q.points + (q.short > 0 ? q.substitute : 0);
    if ((S.cur.points || 0) < payPoints) {
      return  getProxied({ ok: false, msg: q.short > 0
        ? `◉ 点数不足（需 ${fmtNum(payPoints)}，含材料代用 ◉${fmtNum(q.substitute)}）`
        : `◉ 点数不足（需 ${fmtNum(payPoints)}）` });
    }
    /* 先扣料再摇（顺序反了会"摇完才发现不够"）：石头 / 材料（不够就点数代用）/ 点数 */
    addItem(q.stone, -q.stoneN);
    if (q.short <= 0) addItem(q.item, -q.itemN);
    addCur('points', -payPoints);
    const before = eq.affixes.map(a => a.v);
    const beforeKinds = eq.affixes.map(a => a.k);
    const meanBefore = q.meanQ;
    const n0 = (eq.forge && eq.forge.n) || 0;
    const locks = q.locks;
    let pityHit = false;
    if (mode === 'kind') {
      const used = locks.map(i => eq.affixes[i].k);
      eq.affixes.forEach((a, i) => {
        if (locks.indexOf(i) >= 0) return;              // 锁定的**一个字节都不动**
        const k = D.rollAffixKey(eq.slot, used);
        if (!k) return;
        used.push(k);
        a.k = k;
        a.v = D.rollAffixValue(k, eq.rarity);
      });
    } else {
      pityHit = n0 >= (D.REFORGE_PITY || 6) - 1;
      eq.affixes.forEach((a, i) => {
        if (locks.indexOf(i) >= 0) return;
        const nv = D.rollAffixValue(a.k, eq.rarity);
        a.v = pityHit ? Math.max(nv, a.v) : nv;         // 炉火保底：必不倒退
      });
    }
    /* `forge.n` 只被**档 A** 推进（档 C 不计数也不清零）；`forge.best` 记**历史最好的总评** ——
       "这次有没有刷新记录"是总监 §4.4 第 3 条要求的对比卡内容之一。 */
    if (!eq.forge) eq.forge = { n: 0, best: 0 };
    if (mode === 'value') eq.forge.n = pityHit ? 0 : Math.min(n0 + 1, (D.REFORGE_PITY || 6) - 1);
    const meanAfter = affixMeanQ(eq);
    const newBest = meanAfter > (eq.forge.best || 0);
    if (newBest) eq.forge.best = meanAfter;
    save();
    return  getProxied({
      ok: true, uid, mode, before, beforeKinds, pityHit,
      meanBefore, meanAfter, newBest, best: eq.forge.best || 0,
      affixes: eq.affixes.map(a => ( getProxied({ k: a.k, v: a.v }))),
      msg: mode === 'kind' ? '重抽完成：词条种类与数值都换了'
        : (pityHit ? '🔥 炉火保底：这次必不倒退' : '重铸完成：词条种类不变，数值已重摇'),
    });
  }
  function decompose(uid) {
    const eq = S.equips[uid];
    if (!eq) return  getProxied({ ok: false });
    if (eq.lock) return  getProxied({ ok: false, msg: '这件装备已锁定，先解锁再分解' });
    let gain = D.DECOMPOSE_GAIN[eq.rarity];
    gain += Math.floor(eq.enhance * 3);   // 强化投入部分返还
    // 若装备中先卸下
    Object.values(S.equipped).forEach(slots => {
      Object.keys(slots).forEach(k => { if (slots[k] === uid) slots[k] = null; });
    });
    delete S.equips[uid];
    addCur('otherworld', gain);
    save();
    return  getProxied({ ok: true, gain });
  }
  // 批量分解：一次结算、一次存档
  function decomposeMany(uids) {
    let gain = 0, count = 0;
    uids.forEach(uid => {
      const eq = S.equips[uid];
      if (!eq) return;
      if (eq.lock) return;   // 锁定的装备不参与批量分解
      gain += D.DECOMPOSE_GAIN[eq.rarity] + Math.floor(eq.enhance * 3);
      Object.values(S.equipped).forEach(slots => {
        Object.keys(slots).forEach(k => { if (slots[k] === uid) slots[k] = null; });
      });
      delete S.equips[uid];
      count++;
    });
    if (count) { addCur('otherworld', gain); save(); }
    return  getProxied({ ok: count > 0, gain, count });
  }
  /* --- 编队预设：3 组槽位，一键保存 / 一键套用 --- */
  function savePreset(idx) {
    if (idx < 0 || idx > 2) return  getProxied({ ok: false, msg: '预设不存在' });
    S.presets[idx] = S.party.slice();
    save();
    return  getProxied({ ok: true, msg: `已保存到预设 ${idx + 1}` });
  }
  function applyPreset(idx) {
    const p = S.presets[idx];
    if (!p) return  getProxied({ ok: false, msg: '该预设还是空的' });
    S.party = normalizeParty(p, 'front');      // 老预设（4 格）与新预设（5 格）都能套
    save();
    return  getProxied({ ok: true, msg: `已套用预设 ${idx + 1}` });
  }
  /* 装备槽的固定顺序（**只在评分相同时**当兜底，保证顺序稳定） */
  const EQUIP_SLOT_ORDER =  getProxied(['weapon', 'head', 'armor', 'hands', 'legs', 'accessory']);
  /* 背包里的装备排序（V9.6.123 父亲大人："装备的排序方式要像伙伴那样"）：
     伙伴是 **上阵 → 等级 → 稀有度 → 星级**；装备按同一种"形状"来：
       **强化等级（投资）→ 品质 → 部位（固定序）→ 名称**。
     为什么强化在前：它和伙伴的"等级"一样，是玩家**自己练上去的**那条线，
     先看到自己练过的，再按品质兜底 —— 比"只看品质"更符合"我练的在哪"。
     ⚠️ 品质必须用 EQUIP_RARITIES（含 MYTH），不能用角色用的 RARITIES ——
     用错表的话神装 indexOf 是 -1，会被排到最后（以前 inventoryEquips 就是这个毛病）。 */
  function sortEquips(list) {
    return (list ||  getProxied([])).slice().sort((a, b) =>
      equipScore(b) - equipScore(a)                                   // V9.6.126：按评分（高→低，和"一键最优装备"同一份分）
      || EQUIP_SLOT_ORDER.indexOf(a.slot) - EQUIP_SLOT_ORDER.indexOf(b.slot)
      || String(a.uid || '').localeCompare(String(b.uid || '')));     // 完全同分也稳定
  }
  function inventoryEquips() {
    const equippedUids =  getProxied(new Set());
    Object.values(S.equipped).forEach(slots => Object.values(slots).forEach(u => u && equippedUids.add(u)));
    return sortEquips(Object.values(S.equips));
  }

  /* ================= 站位（前排 / 后排） =================
     规则只有一条：**谁站前排谁挨打**——敌人优先攻击前排，前排没人了才打后排。
     所以谁想站哪一排是玩家的战术选择：主角也不例外。 */
  const ROW_NAME =  getProxied({ front: '前排', back: '后排' });
  function rowOfSlots(row) { return row === 'front' ?  getProxied([0, 1]) :  getProxied([2, 3, 4]); }
  // 主角站在哪一排：看他自己占的是哪一格（0/1 前排，2/3/4 后排）
  function playerRow() {
    const i = S.party.indexOf('@player');
    return i >= 2 ? 'back' : 'front';
  }
  function setPlayerRow(row) {
    const r = row === 'back' ? 'back' : 'front';
    if (playerRow() === r) return  getProxied({ ok: false, msg: `主角已经在${ROW_NAME[r]}了` });
    const mv = moveMemberRow('@player', r);
    if (!mv.ok) return mv;
    S.player.row = r;      // 兼容：老字段跟着走，读旧档的人也能看对
    save();
    return  getProxied({ ok: true, msg: `主角已换到${ROW_NAME[r]}` });
  }
  // 两个上阵位互换（含空位）：把人挪到另一排，或者同排换顺序
  function swapPartySlots(a, b) {
    a = +a; b = +b;
    const n = S.party.length;
    if (!(a >= 0 && a < n && b >= 0 && b < n)) return  getProxied({ ok: false, msg: '位置不对' });
    if (a === b) return  getProxied({ ok: false, msg: '选的是同一个位置' });
    if (!S.party[a] && !S.party[b]) return  getProxied({ ok: false, msg: '两个位置都是空的' });
    const tmp = S.party[a]; S.party[a] = S.party[b]; S.party[b] = tmp;
    syncPlayerRow();
    save();
    return  getProxied({ ok: true, msg: '已换位', party: S.party.slice() });
  }
  // 老字段 S.player.row 与"主角占哪一格"保持一致（主角站位以 S.party 为准，这里只是同步）
  function syncPlayerRow() {
    if (S.party && S.party.indexOf('@player') >= 0) S.player.row = playerRow();
  }
  // 把某名上阵成员移到另一排：目标排有空位就搬过去，没空位就和那一排第一个换
  function moveMemberRow(id, row) {
    const from = S.party.indexOf(id);
    if (from < 0) return  getProxied({ ok: false, msg: '这名伙伴不在队伍里' });
    const r = row === 'front' ? 'front' : 'back';
    const want = rowOfSlots(r);
    if (want.includes(from)) return  getProxied({ ok: false, msg: `已经在${ROW_NAME[r]}了` });
    const empty = want.find(i => !S.party[i]);
    if (empty !== undefined) {
      S.party[empty] = S.party[from];
      S.party[from] = null;
      syncPlayerRow();
      save();
      return  getProxied({ ok: true, msg: `已移到${ROW_NAME[r]}`, party: S.party.slice() });
    }
    const other = want[0];
    const swapped = S.party[other];
    S.party[other] = S.party[from];
    S.party[from] = swapped;
    syncPlayerRow();
    save();
    const nm = swapped ? charName(swapped) : '队友';
    return  getProxied({ ok: true, msg: `已与「${nm}」换位`, party: S.party.slice() });
  }
  // 谁站在哪一排：界面用（队伍页标签、战斗前的站位预览都读这一处）
  function rowLayout() {
    const out =  getProxied({ front:  getProxied([]), back:  getProxied([]) });
    S.party.forEach((id, i) => { if (id) out[i < 2 ? 'front' : 'back'].push(id); });
    return out;
  }
  // 位置标识有三种：
  //   '0'~'4'         = 上阵 5 格（0/1 前排、2/3/4 后排，**永远固定前 2 后 3**）
  //   'P' / '@player' = 主角本人——他就占着 5 格里的某一格，所以等同于那个格子
  //   'row:front' / 'row:back' = 整排（界面上"前排 / 后排"那两行标题，也是可放下的落点）
  // 位置→排的换算只有这一处，界面不用自己算。
  function parsePos(p) {
    if (p === 'P' || p === '@player') {
      const i = S.party.indexOf('@player');
      return i < 0 ? null :  getProxied({ idx: i, protag: true });
    }
    if (p === 'row:front' || p === 'row:back') return  getProxied({ row: String(p).slice(4) });
    if (p === '' || p === null || p === undefined) return null;
    const n = +p;
    return (n >= 0 && n < S.party.length) ?  getProxied({ idx: n }) : null;
  }
  function posRow(p) {
    const v = parsePos(p);
    if (!v) return null;
    if (v.row) return v.row;
    return v.idx < 2 ? 'front' : 'back';
  }
  // 换位总入口（长按拖拽 / 点击都走这一个）：从 a 拖到 b。
  //   落在某一格上＝两格互换（主角也只是一个格子的占用者，跟队友一样换）
  //   落在整排标题上＝把这一格上的人搬到那一排（有空位进空位，满员和最前面那位换）
  function swapPositions(a, b) {
    const pa = parsePos(a), pb = parsePos(b);
    if (!pa || !pb) return  getProxied({ ok: false, msg: '位置不对' });
    if (pb.row) {
      if (pa.row) return  getProxied({ ok: false, msg: '位置不对' });
      const id = S.party[pa.idx];
      if (!id) return  getProxied({ ok: false, msg: '这个位置是空的' });
      return moveMemberRow(id, pb.row);
    }
    if (pa.row) return  getProxied({ ok: false, msg: '位置不对' });
    if (pa.idx === pb.idx) return  getProxied({ ok: false, msg: '选的是同一个位置' });
    return swapPartySlots(pa.idx, pb.idx);
  }

  /* ================= 招募 ================= */
  // 三个池子的差异全部由 RECRUIT_POOLS 的数据决定，这里只按结构执行：
  // 普通池只出 N/R/SR；高级池 SR 起抽 + 优先未拥有；限定池锁当期阵营 + 当期 UP
  function poolUpChar(pool) {
    return pool === 'limited' ? D.recruitUpChar() : null;
  }
  function rollRarityInPool(pool) {
    let r = Math.random(), acc = 0;
    for (const [rar, p] of Object.entries(D.RECRUIT_POOLS[pool].rates)) {
      acc += p;
      if (r <= acc) return rar;
    }
    const keys = Object.keys(D.RECRUIT_POOLS[pool].rates);
    return keys[keys.length - 1] || 'R';
  }
  // 该池该稀有度能出哪些人（限定池锁阵营；该档位在本阵营里没人就退回全量，避免抽空）
  function charsOfRarity(rar, pool) {
    /* 2026-09-27（父亲大人：「就没有隐藏角色这种概念」）：`!c.hidden` 这道滤网整个撤掉 ——
       原先被它挡在池外的 6 位 UR（楚衍 / 郑遥 / 零式 / 无相 / 终焉 / 灯阁代行者）现在正常出。 */
    let list = D.characters.filter(c => c.rarity === rar);
    if (pool === 'limited') {
      const up = poolUpChar('limited');
      if (up) {
        const f = list.filter(c => c.faction === up.faction);
        if (f.length) list = f;
      }
    }
    return list;
  }
  function pickCharOfRarity(rar, pool, opts) {
    opts = opts ||  getProxied({});
    let list = charsOfRarity(rar, pool);
    if (!list.length) list = D.characters.filter(c => c.rarity === rar);
    if (!list.length) list = D.characters;
    // 限定池的 SSR：一半概率直接给当期 UP；保底触发时 100% 给当期 UP
    if (pool === 'limited' && rar === 'SSR') {
      const up = poolUpChar('limited');
      if (up && (opts.forceUp || Math.random() < D.RECRUIT_POOLS.limited.upRatio)) list =  getProxied([up]);
    }
    // 高级池的 SSR/UR 优先给没拥有过的角色（"补图鉴"就是这个池子的定位）
    if (opts.prioritizeNew) {
      const fresh = list.filter(c => !S.chars[c.id]);
      if (fresh.length) list = fresh;
    }
    return list[Math.floor(Math.random() * list.length)];
  }
  function pityOf(pool) {
    S.recruit.pity = S.recruit.pity ||  getProxied({});
    const p = S.recruit.pity[pool] || (S.recruit.pity[pool] =  getProxied({ ssr: 0, ur: 0, up: 0 }));
    p.ssr = p.ssr || 0; p.ur = p.ur || 0; p.up = p.up || 0;
    return p;
  }
  // 给界面看的保底进度（普通池没有保底）
  function pityView(pool) {
    if (pool === 'normal' || !D.RECRUIT_POOLS[pool]) return null;
    const p = pityOf(pool);
    return  getProxied({
      ssr:  getProxied({ n: p.ssr, cap: D.PITY.SSR }),
      ur:  getProxied({ n: p.ur, cap: D.PITY.UR }),
      up: pool === 'limited' ?  getProxied({ n: p.up, cap: D.PITY_UP }) : null,
    });
  }
  // opts.noCost：十连已整笔扣费，单抽不再重复扣（见 recruitTen）
  // opts.noGrant：只决定"抽到谁"，先不入库——十连要先确认有没有 SR 再一起发，
  //   否者补保底时会白送第 11 个人（V9.2 修）
  function recruitOnce(pool, opts) {
    opts = opts ||  getProxied({});
    const p = D.RECRUIT_POOLS[pool];
    if (!p) return  getProxied({ error: '卡池不存在' });
    let usedTicket = null;
    if (!opts.noCost) {
      // 招募券优先于货币：有对应券就先扣券（券是玩法掉出来的，货币是攒出来的）
      if (p.ticket && (S.items[p.ticket] || 0) > 0) { removeItem(p.ticket, 1); usedTicket = p.ticket; }
      else if (!spend(p.cost)) return  getProxied({ error: '货币不足（也没有对应的招募券）' });
    }
    S.stats.recruits++;
    task('recruit1', 1);
    let rar = rollRarityInPool(pool);
    let forceUp = false;
    if (pool !== 'normal') {
      const pit = pityOf(pool);
      pit.ssr++; pit.ur++;
      if (pool === 'limited') pit.up++;
      // 三档保底各自独立：UR 保底不被 SSR 打断，当期 UP 保底只被"抽到当期 UP"重置
      if (pit.ur >= D.PITY.UR) rar = 'UR';
      else if (pit.ssr >= D.PITY.SSR && D.RARITIES.indexOf(rar) < 3) rar = 'SSR';
      if (pool === 'limited' && pit.up >= D.PITY_UP) { rar = 'SSR'; forceUp = true; }
    }
    const base = pickCharOfRarity(rar, pool,  getProxied({
      forceUp,
      prioritizeNew: !!p.prioritizeNew && D.RARITIES.indexOf(rar) >= 3,
    }));
    if (pool !== 'normal') {
      const pit = pityOf(pool);
      const up = poolUpChar(pool);
      if (D.RARITIES.indexOf(base.rarity) >= 3) pit.ssr = 0;
      if (D.RARITIES.indexOf(base.rarity) >= 4) pit.ur = 0;
      if (up && base.id === up.id) pit.up = 0;
    }
    const res = opts.noGrant ?  getProxied({ isNew: false }) : addChar(base.id);
    if (!opts.noGrant) save();
    const upChar = poolUpChar(pool);
    return  getProxied({
      id: base.id, name: base.name, rarity: base.rarity, isNew: res.isNew, shards: res.shards || 0, to: res.to || 'self',
      isUp: !!(upChar && base.id === upChar.id), usedTicket,
    });
  }
  // 某个池现在有多少张券（界面显示"券 N 张"用）
  function ticketOf(pool) {
    const p = D.RECRUIT_POOLS[pool];
    return p && p.ticket ?  getProxied({ id: p.ticket, n: S.items[p.ticket] || 0 }) : null;
  }
  function recruitTen(pool) {
    const p = D.RECRUIT_POOLS[pool];
    if (!p) return  getProxied({ error: '卡池不存在' });
    const cost = p.ten || p.cost;
    // 十连是一次交易，规则只有一条：要么 10 张券，要么全额货币，不支持混付（界面也这么写）。
    let usedTickets = 0;
    if (p.ticket && (S.items[p.ticket] || 0) >= 10) { removeItem(p.ticket, 10); usedTickets = 10; }
    else {
      if (!canAfford(cost)) return  getProxied({ error: '货币不足（招募券也不足 10 张）' });
      spend(cost);
    }
    // 先抽完 10 次再统一入库：这样"十连保底 SR"是把最后一次换掉，
    // 而不是额外再补一个人（旧版会白送第 11 个）
    const picks =  getProxied([]);
    for (let i = 0; i < 10; i++) {
      const r = recruitOnce(pool,  getProxied({ noCost: true, noGrant: true }));
      if (r.error) return  getProxied({ error: r.error, results:  getProxied([]) });
      picks.push(r);
    }
    if (!picks.some(r => D.RARITIES.indexOf(r.rarity) >= 2)) {
      const base = pickCharOfRarity('SR', pool);
      picks[picks.length - 1] =  getProxied({ id: base.id, name: base.name, rarity: base.rarity, pityFix: true });
    }
    const results = picks.map(r => {
      const res = addChar(r.id);
      return Object.assign( getProxied({}), r,  getProxied({ isNew: res.isNew, shards: res.shards || 0, to: res.to || 'self' }));
    });
    save();
    return  getProxied({ results, usedTickets });
  }
  /* ================= V1.1.16（0927-Y 数值轮 · 报告 §6-8①）：点数出口＝普通池「百连」=================
     起因（报告 §四 / §6-8）：**建筑是点数唯一的出口**，而它在广告档 90 天就点满了
     → `longrun_sim 90 ads` 实测第 90 天手里剩 **727 万 ◉**（等级 / 主角血统 / 建筑三条线全到顶）。
     普通池单抽 ◉500 本来就是现成的出口（727 万 ＝ 14,500 抽），**问题只是"一次一次点不现实"**。
     做法：**复用 `recruitTen` 连打 times 次**（默认 10 次 ＝ 100 抽）——
       出率 / 保底 / "有券先用券" / 每日任务记账 全在原来那一段里，**零新内容、零新概率**。
     ⚠️ **一笔一笔付**（`recruitTen` 自己扣钱扣券）：所以"抽到一半钱不够"是真实会发生的，
        返回里必须带 `done`（真抽了几组）与 `stopped`（为什么停）—— 界面按这个报账，
        不许把"以为抽了 100 次"当成 100 次。
     ⚠️ 上限 20 组（＝200 抽）只是防误触；`×0` / 负数一律夹到 1 组。 */
  function recruitBulk(pool, times) {
    const p = D.RECRUIT_POOLS[pool];
    if (!p) return  getProxied({ error: '卡池不存在' });
    const n = Math.max(1, Math.min(20, Math.floor(times) || 1));
    const results = [];
    let done = 0, usedTickets = 0, stopped = null;
    for (let i = 0; i < n; i++) {
      const r = recruitTen(pool);
      if (r.error) { stopped = r.error; break; }
      results.push.apply(results, r.results || []);
      usedTickets += r.usedTickets || 0;
      done++;
    }
    if (!done) return  getProxied({ error: stopped || '抽不了' });
    save();
    return  getProxied({ results, usedTickets, done, stops: stopped, pool });
  }
  /* 每日免费抽（V9.5.51 父亲大人）：
     普通池：每天 3 次，且**两次之间隔 10 分钟**；高级池：每天 1 次；
     限定池没有免费。次数和"上次用的时间"都按自然日刷新（和每日任务同一把钟）。 */
  const FREE_RULES =  getProxied({ normal:  getProxied({ daily: 3, gapSec: 600 }), advanced:  getProxied({ daily: 1, gapSec: 0 }) });
  function freeState(pool) {
    const rule = FREE_RULES[pool];
    if (!rule) return  getProxied({ daily: 0, used: 0, left: 0, ready: false, waitSec: 0 });
    const today = dailyDate();
    const f = S.recruit.free;
    if (f.date !== today) { f.date = today; f.normal =  getProxied({ used: 0, at: 0 }); f.advanced =  getProxied({ used: 0, at: 0 }); }
    const st = f[pool] || (f[pool] =  getProxied({ used: 0, at: 0 }));
    const left = Math.max(0, rule.daily - st.used);
    // 次数用完就不再报冷却（界面也就不会再显示倒计时）
    const wait = (rule.gapSec && left > 0) ? Math.max(0, Math.ceil((st.at + rule.gapSec * 1000 - Date.now()) / 1000)) : 0;
    return  getProxied({ daily: rule.daily, used: st.used, left, ready: left > 0 && wait <= 0, waitSec: wait });
  }
  const freeRecruitAvailable = (pool = 'normal') => freeState(pool).ready;
  function freeRecruit(pool = 'normal') {
    const st = freeState(pool);
    if (!st.ready) return  getProxied({ error: st.left <= 0 ? '今日免费次数已用完' : '还要再等一会儿' });
    S.recruit.free[pool].used = st.used + 1;
    S.recruit.free[pool].at = Date.now();
    /* ================= R1.2 · P1（父亲大人 2026-10-01 任务书点名）：**每日免费抽与付费抽同源** =========
       原来这里自己又走了一遍 `rollRarityInPool` ＋ `pickCharOfRarity` —— 于是同一个高级池
       有**两条**免费路，行为却不一样：
         · 看广告那次（`adRecruitAdv`）复用 `recruitOnce(noCost)` ⇒ **计保底、优先未拥有**；
         · 每日免费那次（这里）自己摇 ⇒ **不计保底、不优先未拥有**。
       而这与项目**已经写下的规则**是矛盾的（三处都在说要同源）：
         · 高级池 ⓘ 的说明（data.js）："**每抽**累计 1 次保底：满 50 抽必出 SSR…"；
         · 池子描述（data.js）："50 抽内必出 SSR、100 抽内必出 UR，并且**优先给「你还没有的伙伴」**"；
         · `adRecruitAdv` 的注释（core.js）："免费抽和广告抽在抽卡这件事上**完全同源**，只有谁付钱不同"。
       ⇒ 按任务书的**情况 A** 收口：抽卡本体一律走 `recruitOnce(noCost)`（出率 / 三档保底 /
         优先未拥有 / 入库 / `stats.recruits` / 日常"招募 1 次" / 存档**全在里面**，不再有第二份），
         这里只留"免费次数账"。**卡池基础概率 / pity 数值 / UP 概率 / 十连保底一个字没动。**
       做坏试验：把 `recruitOnce` 那句换回"自己摇" → `test_game` 的
       「每日免费高级抽也计入保底」当场红。 */
    const r = recruitOnce(pool,  getProxied({ noCost: true }));
    if (r.error) {                                       // 理论到不了（池子在上面已经验过），但账不能白扣
      S.recruit.free[pool].used = st.used;
      save();
      return r;
    }
    return Object.assign(r,  getProxied({ free: true, pool }));
  }
  /* ================= V1.1.8（乙组 B7 · 高级池看广告免费 1 抽）=================
     口径（终版 §3.1 第 7 步）：**10 次/天**、每次免 1 抽（等价 ◆200）。
     实现：与"每日免费抽"**分两条账**（`freeRecruit` 用 `S.recruit.free`，这条用广告配额），
     抽卡本身走同一段逻辑（出率 / 保底 / 计入 `stats.recruits` 与日常"招募 1 次"）——
     所以"免费抽"和"广告抽"在抽卡这件事上完全同源，只有"谁付钱"不同。 */
  function adRecruitAdv() {
    /* **复用 `recruitOnce` 的 noCost 通道**（出率 / 保底 / 入库 / 计入日常全在里面）——
       不另写一遍抽卡逻辑：那种"两套拼法"正是这个项目反复踩的坑（本轮尺子也在盯）。
       与"每日免费抽"的唯一差别是账记在哪：那条记 `S.recruit.free`，这条记广告配额（在 wx-adapter 里）。 */
    const r = recruitOnce('advanced',  getProxied({ noCost: true }));
    if (r.error) return r;
    return Object.assign(r,  getProxied({ free: true, pool: 'advanced' }));
  }
  function ssrTicketUse(charId) {
    const base = D.charById[charId];
    if (!base || base.rarity !== 'SSR' || S.ssrTicket <= 0) return  getProxied({ ok: false, msg: '无法选择' });
    S.ssrTicket--;
    addChar(charId);
    S.stats.recruits++;
    save();
    return  getProxied({ ok: true, msg: `获得 ${base.name}` });
  }

  /* ================= 挂机 ================= */
  // 2026-09-12 调整产出：点数 (10+0.3Lv) / 分、经验 (8+0.5Lv) / 分，
  // 与等级曲线（Lv1→100 累计 EXP 74.4 万 / 点数 22.6 万）配套；天赋「灯阁恩赐」的挂机/经验节点在此生效。
  function idleBaseRates() {
    const lv = S.player.level;
    const au = authority();
    const kb = kejiBonus();
    const coreBonus = (1 + S.buildings.core * 0.02 + (S.player.geneLock >= 1 ? 0.10 : 0) + au.idlePct + kb.idlePct) * graceIdleMult() * signIdleMult();
    return  getProxied({
      /* ================= V1.1.9（续13 · P0-4 挂机基数改成跟进度走）=================
         父亲大人拍板「挂机基数改成跟进度走」，依据＝《整体数值审核报告》§一 1.2 第 1/2 条：
           ① **基础奖励只看玩家等级，而转生会把等级清零** —— `longrun_sim 90` 实测第 24 天转生一次，
              挂机基础从 40/分（Lv100）掉回 10/分（Lv0）。玩家在打 W16~W20 的图，挂机却按新手档给。
           ② ◆（异界结晶）那条 `1 + floor(lv/50)` 只有 1/2/3 三档，后期 3/10 分 = 432/天，
              而同期扫荡守关是 10,602/天（**24 倍**）—— 挂着"会给结晶"的名，实际只占日产出 4%。
         改法（照报告 §十一 P0 #4 / #5 的原文公式）：
           · `pointsPerMin`：`(10 + lv*0.3)` → **`(10 + max(lv, 进度档) * 0.3)`**
           · `otherworldPer10Min`：`1 + floor(lv/50)` → **`1 + floor(进度档/36)`**
         其中"进度档"＝ **历史最高通关世界的下标 × 6**（W01=0 … W36=210，见 `progressTier()`）。
         老档影响：**只赚不亏**（基数只会变高）；且因为取的是"历史最高"，转生之后不会腰斩。
         ⚠️ `expPerMin` 这一条**没动**：经验本来就该跟着当前等级走（等级是它的"挡位"），
            报告也只点了点数与结晶两条。 */
      pointsPerMin: (10 + Math.max(lv, progressTier()) * 0.3) * coreBonus,
      // V9.5.65（策划体检）：经验斜率 0.5 → 0.7、底数 8 → 10。
      // 旧值配合 80×Lv^1.32 的经验表，纯挂机到 Lv.20 要 33 小时；现在约 13 小时。
      expPerMin: (10 + lv * 0.7) * (1 + S.buildings.training * 0.03 + au.expPct + kb.expPct) * graceExpMult(),
      otherworldPer10Min: 1 + Math.floor(progressTier() / 36),
    });
  }
  /* 挂机基数用的"进度档"＝历史最高通关世界 × 6（见 idleBaseRates 的注释）。
     取 `S.player.bestWorldIdx`（转生不清），并且**与当前进度取大**：
     万一老档的字段没跟上（或手改过存档），当场还能按现在打到的图算，不会亏。 */
  function bestWorldIdx() {
    let hi = Math.max(0, S.player.bestWorldIdx || 0);
    const ws = S.worlds ||  getProxied({});
    Object.keys(ws).forEach((wid) => {
      const st = ws[wid];
      if (!st || !st.stages) return;
      const done = ['normal', 'hard', 'hell'].some((d) => {
        const arr = st.stages[d];
        return Array.isArray(arr) && arr.length >= 12 && arr.every((x) => x > 0);
      });
      if (done) hi = Math.max(hi, D.WORLDS.findIndex((w) => w.id === wid));
    });
    return Math.max(0, hi);
  }
  function progressTier() { return bestWorldIdx() * 6; }
  /* ================= 挂机分工 ================= */
  // 4 条产线各派一名领队（不能用已上阵的主力，给板凳角色一个去处）。
  // 领队战力越高，这条线产出越高；没派领队 = 这条线不产出。
  function idleLineLeader(lineId) {
    const cid = S.idle.lines[lineId];
    return cid && S.chars[cid] ? cid : null;
  }
  function idleLineBonus(lineId) {
    const cid = idleLineLeader(lineId);
    if (!cid) return 0;
    const line = D.IDLE_LINES.find(l => l.id === lineId);
    // 按"这条产线要看的那一维"算加成：闭关看精神、采集看肌肉、探索看神经、守卫看免疫
    const st = effectiveStats(cid);
    const v = (st && st.attrs && line && line.attr) ? (st.attrs[line.attr] || 0) : 0;
    return Math.min((line && line.maxBonus) || 1.5, v / D.IDLE_LINE_ATTR_DIV);
  }
  // 各产线"自己那一份"的产出（在基础挂机之外额外加，所以要先算基础值，避免自我引用）
  function idleLineContrib() {
    const bonuses =  getProxied({});
    D.IDLE_LINES.forEach(l => { bonuses[l.id] = idleLineBonus(l.id); });
    const base = idleBaseRates();
    return  getProxied({
      bonuses,
      points: base.pointsPerMin * bonuses.explore,
      exp: base.expPerMin * bonuses.cultivate,
      otherworld: base.otherworldPer10Min * bonuses.guard,
      matPerMin: bonuses.gather > 0 ? D.IDLE_MAT_PER_MIN * (1 + bonuses.gather) : 0,
    });
  }
  function idleRates() {
    const base = idleBaseRates();
    const c = idleLineContrib();
    return  getProxied({
      pointsPerMin: base.pointsPerMin + c.points,
      expPerMin: base.expPerMin + c.exp,
      otherworldPer10Min: base.otherworldPer10Min + c.otherworld,
      matPerMin: c.matPerMin,
      lineBonuses: c.bonuses,
    });
  }
  // 界面用：每条线现在派了谁、加成多少、产出多少
  function idleLines() {
    const c = idleLineContrib();
    return D.IDLE_LINES.map(l => {
      const leaderId = idleLineLeader(l.id);
      const bonus = c.bonuses[l.id] || 0;
      let per = '未派领队，不产出';
      if (l.out === 'exp') per = `+${fmtNum(c.exp)} EXP / 分`;
      else if (l.out === 'points') per = `+${fmtNum(c.points)} 点 / 分`;
      /* V9.6.140（父亲大人："有些都不需要小数点"）：速率保留**一位**小数就够。
         "+0.67 结晶 / 10 分" 这种两位小数只是噪音，取整又会让低产线变成 0（看着像没派领队）。 */
      else if (l.out === 'otherworld') per = `+${c.otherworld.toFixed(1)} 结晶 / 10 分`;
      else per = `+${c.matPerMin.toFixed(1)} 材料 / 分`;
      const st = leaderId ? effectiveStats(leaderId) : null;
      const attrValue = (st && st.attrs && l.attr) ? Math.round(st.attrs[l.attr] || 0) : 0;
      return  getProxied({ line: l, leaderId, bonus, attrValue, per: leaderId ? per : '未派领队，不产出' });
    });
  }
  // 派遣 / 撤下领队：上阵主力不能派（他们要出战），同一个人不能同时管两条线
  function setIdleLeader(lineId, charId) {
    if (!D.IDLE_LINES.some(l => l.id === lineId)) return  getProxied({ ok: false, msg: '没有这条产线' });
    if (!charId) { S.idle.lines[lineId] = null; save(); return  getProxied({ ok: true, msg: '已撤下领队' }); }
    if (!S.chars[charId]) return  getProxied({ ok: false, msg: '没有这名伙伴' });
    if (S.party.includes(charId)) return  getProxied({ ok: false, msg: '上阵主力不能派去挂机，先把他换下来' });
    const other = D.IDLE_LINES.find(l => l.id !== lineId && S.idle.lines[l.id] === charId);
    if (other) return  getProxied({ ok: false, msg: `他已经在「${other.name}」了` });
    S.idle.lines[lineId] = charId;
    save();
    return  getProxied({ ok: true, msg: `${charName(charId)} 已派往「${D.IDLE_LINES.find(l => l.id === lineId).name}」` });
  }
  function offlineCapHours() {
    /* 基础上线 6 小时；三条加成**点满加起来正好 +6 小时** → 满配刚好 12 小时（父亲大人定的）：
         铭刻 5 阶        +4 小时（一次性大节点）
         灯阁权限 2/7 级  +0.5 × 2 = +1 小时
         医疗室 每 10 级  +0.2 × 5 = +1 小时（50 级封顶）
       所以不会"点满还差一截"，也不会提前撞上限（Math.min 只是兜底，正常永远不触发）。 */
    let cap = 6 + (S.player.geneLock >= 5 ? 4 : 0);
    cap += Math.floor(S.buildings.medical / 10) * 0.2;
    cap += authority().capHours;
    return Math.min(12, Math.round(cap * 100) / 100);      // 顺手抹掉浮点尾数
  }
  function offlineEfficiency() {
    return Math.min(1.5, 0.85 + S.buildings.medical * 0.01 + (talentAll().offlinePct || 0) + authority().offlinePct + kejiBonus().offlinePct);
  }
  // 上线结算离线收益
  function settleOffline() {
    const now = Date.now();
    const last = S.idle.lastTs || now;
    offlineSettled = true;    // 从这一刻起，存盘可以正常把 lastTs 推到"现在"（V9.6.92）
    /* ================= V1.1.20（F1-1 · 根因闸）=================
       **这一段是"开机自愈 / 离线结算"，不是玩家在玩** —— 所以整段（含里面每一次
       addCur / grantIdleMat / save）都不许把 `savedAt`（"谁新听谁的"判据）刷新成"现在"。
       原来没有这道闸：开机结算最后那句 `save()` 当场把判据盖章，于是
       `cloudTs > localTs()` 恒假 ⇒ **云上那份再新也拉不下来**（父亲大人报的"手机推到第三关、
       电脑上还是第二关"就是这么来的）。`save({auto:true})` 那道闸管的是心跳（隔一层），
       这一道管的是结算本体（近因）—— 两道都要，缺一条都不行。 */
    settleWriting = true;
    try {
      if (now < last - 60000) { S.idle.lastTs = now; return  getProxied({ cheat: true }); }   // 防改时间
      const elapsedSec = Math.min((now - last) / 1000, offlineCapHours() * 3600);
      if (elapsedSec < 60) { S.idle.lastTs = now; return null; }
      const eff = offlineEfficiency();
      const r = idleRates();
      const mins = elapsedSec / 60 * eff;
      const gains =  getProxied({
        points: Math.round(r.pointsPerMin * mins),
        exp: Math.round(r.expPerMin * mins),
        otherworld: Math.floor(elapsedSec / 600) * r.otherworldPer10Min,
        mat: Math.floor((r.matPerMin || 0) * mins),
      });
      /* ⚠️ 离线收益必须**在这里**入账。
         以前入账写在 UI.showOfflineGains 里（那是"弹结算窗"的地方），而 main.js 只在
         离线 ≥5 分钟时才调它——于是离线 1~5 分钟的收益算完就被丢掉，lastTs 却已经推到当前时间，
         玩家白等一场。现在改成：核心负责入账，UI 只负责显示，弹不弹窗与拿不拿到彻底分开（V9.5 修）。 */
      addCur('points', gains.points);
      addCur('otherworld', gains.otherworld);
      addPlayerExp(gains.exp);
      const matOut = grantIdleMat(gains.mat);
      if (matOut && matOut.count > 0) { gains.matItem = matOut.item; gains.matCount = matOut.count; gains.mat = matOut.count; }
      else { gains.matFull = !!(matOut && matOut.full); gains.matStashed = (matOut && matOut.stashed) || 0; gains.mat = 0; }
      /* ================= V1.1.8（乙组 B4 · 离线翻倍）=================
         父亲大人的口径：**全额 ×2、不限次数**；【定】**每个离线结算窗口只能翻一次**。
         落地：把"这一次结算给了多少"原样记下来（秒数 ＋ 各项实际到账数），
         广告翻倍就是**照这份记录再发一份** —— 所以：
           · 翻的一定是"这一次真的拿到的"，不是重算一遍（重算会跟当时的效率/加成对不上）；
           · `doubled` 标记保证同一个窗口**只翻一次**（不然回主页还能反复点）；
           · 下一次 `settleOffline` 会把记录整条换掉（新窗口、doubled 复位）。 */
      S.idle.lastSettle =  getProxied({
        sec: elapsedSec,
        points: gains.points, exp: gains.exp, otherworld: gains.otherworld,
        matItem: gains.matItem || null, matCount: gains.matCount || 0,
        doubled: false, at: now,
      });
      S.idle.lastTs = now;
      travelAccrue(elapsedSec);      // 离线时间同样攒"游历奇遇"
      addSectExp(Math.floor(elapsedSec / 60 * D.SECT_EXP.perMin));
      save();
      return  getProxied({ seconds: elapsedSec, gains, efficiency: eff });
    } finally { settleWriting = false; }
  }
  /* 离线翻倍（B4）：把最近一次离线结算**再发一份**；同一个窗口只许翻一次。 */
  function lastOfflineSettle() { return S.idle.lastSettle || null; }
  function claimOfflineDouble() {
    const ls = S.idle.lastSettle;
    if (!ls) return  getProxied({ ok: false, msg: '这次没有可翻倍的离线收益' });
    if (ls.doubled) return  getProxied({ ok: false, msg: '这次离线收益已经翻过倍了' });
    ls.doubled = true;
    addCur('points', ls.points || 0);
    addCur('otherworld', ls.otherworld || 0);
    addPlayerExp(ls.exp || 0);
    const again =  getProxied({ points: ls.points || 0, exp: ls.exp || 0, otherworld: ls.otherworld || 0, matItem: null, matCount: 0 });
    /* 材料照**当时那一档**再发一份（`grantIdleMat` 会按"现在的等级"重新取档 —— 那可能不是同一种材料）。
       装不下就进待领箱（同一套"宁可少收也不吞"）。 */
    if (ls.matItem && ls.matCount) {
      if (addItem(ls.matItem, ls.matCount)) { again.matItem = ls.matItem; again.matCount = ls.matCount; }
      else { stashItem(ls.matItem, ls.matCount); again.matStashed = ls.matCount; }
    }
    save();
    return  getProxied({ ok: true, gains: again, sec: ls.sec, msg: '离线收益已翻倍' });
  }
  // 在线挂机：每秒累计
  /* V9.5.80（自审）：**在线挂机也要吃同一个上限**。
     以前只有离线结算那条有 min(…, offlineCapHours)，在线是 `bankSec += dtSec` 无限累加——
     把游戏开着挂一整天就能攒到 24 小时收益，"离线上限 6 小时"形同虚设（我实测挂 23 小时
     bankSec 就是 23 小时）。现在在线累到上限就停住，和离线口径一致。 */
  function onlineTick(dtSec) {
    const capSec = offlineCapHours() * 3600;
    if (S.idle.bankSec < capSec) S.idle.bankSec = Math.min(capSec, S.idle.bankSec + dtSec);
    travelTick(dtSec);
  }
  // 挂机收益是否已顶到上限（界面用它标"已满"，免得玩家以为卡住了）
  function idleFull() { return S.idle.bankSec >= offlineCapHours() * 3600 - 1; }
  function idleBankGains() {
    const r = idleRates();
    const mins = S.idle.bankSec / 60;
    return  getProxied({
      points: Math.floor(r.pointsPerMin * mins),
      exp: Math.floor(r.expPerMin * mins),
      otherworld: Math.floor(Math.floor(S.idle.bankSec / 600) * r.otherworldPer10Min),
      mat: Math.floor((r.matPerMin || 0) * mins),
      seconds: S.idle.bankSec,
    });
  }
  // 采集产线产出的材料按玩家等级换成对应档位（越往后材料越高级，但数量按 2 的幂递减）
  function idleMatItem() {
    const tier = Math.min(5, 1 + Math.floor(S.player.level / 20));
    return  getProxied({ item: 'mat_t' + tier, tier });
  }
  // 折算并入库；背包满就整批跳过（宁可少收，也不吞玩家的东西）
  function grantIdleMat(units) {
    if (!(units > 0)) return null;
    const mi = idleMatItem();
    const count = Math.floor(units / Math.pow(2, mi.tier - 1));
    if (count <= 0) return null;
    // 背包满：不吞玩家的东西，先记进待领箱（清出格子后在背包页一键领回）
    if (!addItem(mi.item, count)) { stashItem(mi.item, count); return  getProxied({ item: mi.item, count: 0, tier: mi.tier, full: true, stashed: count }); }
    return  getProxied({ item: mi.item, count, tier: mi.tier });
  }
  /* ================= V1.1.16（M 轮 · 挂机结算 ＋ 看广告双倍领取）=================
     父亲大人：「现在这个领取奖励也可以像战斗的结算那样把有什么奖励列举出来，然后两个选项，
     一个领取奖励，一个看广告双倍领取奖励，**这个看广告双倍领取的次数也是不限次数**」。
     【定】挂机银行那一份也能翻倍，口径与离线翻倍（乙组 B4）**同源**，不是第二套算法：
       · 广告槽仍走 `offline_double`（它在 `wx-adapter` 的 FREE_SLOTS 里：**不查日配额、不占总闸**）；
       · 翻的一定是"**这一次真的到账的那一份**"（照记录原样再发一份，不重算 ——
         重算会跟当时的产线领队 / 建筑加成对不上，玩家看到的就是"翻倍后还没原来多"）；
       · **同一个窗口只能翻一次**（`used` 标记）；挂机银行一清空就是新的一轮 ⇒
         "每轮翻一次"＝"想翻几次都有得翻"，与"广告不限次数"并不冲突。
     ⚠️ 记录存在 `S.idle.lastIdleClaim`（与离线那条 `S.idle.lastSettle` 同一个位置、同一套思路）：
        换档 / 新档会**跟着换**，不会出现"拿上一份档的账再发一份"（放模块变量就会）。
        调用方也必须是"先真领一次、再翻"（界面那条路就是这样，见 sc-home）。 */
  function lastIdleClaimOf() { return (S.idle && S.idle.lastIdleClaim) || null; }
  function claimIdle() {
    const g = idleBankGains();
    addCur('points', g.points);
    addCur('otherworld', g.otherworld);
    addPlayerExp(g.exp);
    /* V9.5.79（自审·长线模拟）：**在线挂机也要产评级经验**。
       以前只有 settleOffline（离线结算）里那一行会加，而玩法指南写的是"挂机每分钟 +1.2"——
       于是把游戏开着挂一整天的玩家，评级经验一点不涨（同一段时间，离线算、在线不算，两套口径）。
       现在按同样的比例补上；离线那条走 elapsedSec、这条走 bankSec，两个时间窗互不重叠，不会重复计。 */
    addSectExp(Math.floor(S.idle.bankSec / 60 * D.SECT_EXP.perMin));
    // 采集产线的材料：按档位折算，背包满就跳过（不吞玩家的东西，只是这一轮收不进来）
    /* 材料那一份要连"进包还是进待领箱"一起记下来（背包满时 `grantIdleMat` 只回 count:0 ＋ stashed），
       否则双倍那一份就不知道该往哪儿发（吞掉玩家的材料＝最不该的错）。 */
    let matItem = null, matCount = 0, matStash = 0;
    if (g.mat > 0) {
      const m = grantIdleMat(g.mat);
      if (m && m.count > 0) { g.matItem = m.item; g.matCount = m.count; g.mat = m.count; matItem = m.item; matCount = m.count; }
      else {
        g.matFull = !!(m && m.full); g.matStashed = (m && m.stashed) || 0; g.mat = 0;
        matItem = (m && m.item) || null; matStash = (m && m.stashed) || 0;
      }
    }
    S.idle.bankSec = 0;
    /* V1.0.4 · X（订阅消息）：把银行**领空**了 ⇒"满了的那一刻"当场作废。
       不清掉的话，下一拍心跳之前推一次档，云端会看到"还满着"而补发一条已经过期的提醒
       （`scripts/notify_audit.js` ④ 那条"领走之后立刻回 0"钉着这一处）。 */
    if (S.act) S.act.bankFullAt = 0;
    task('idle1', 1);
    S.idle.lastIdleClaim =  getProxied({
      points: g.points, exp: g.exp, otherworld: g.otherworld,
      matItem, matCount, matStash, sec: g.seconds || 0, at: Date.now(), used: false,
    });
    save();
    return g;
  }
  /* 挂机收益翻倍：把最近一次挂机结算**原样再发一份**；同一个窗口只许翻一次。 */
  function claimIdleDouble() {
    const ls = (S.idle && S.idle.lastIdleClaim) || null;
    if (!ls) return  getProxied({ ok: false, msg: '这次没有可翻倍的挂机收益' });
    if (ls.used) return  getProxied({ ok: false, msg: '这次挂机收益已经翻过倍了' });
    /* 只认"刚刚那一次领取"：这份记录只在内存里，跨档（换存档 / 新档）后它就是**上一份档的账**，
       照它再发一份＝凭空发资源。界面那条路本来就是"先真领一次、再翻"，所以只要把窗口
       开得比"看一条广告 ＋ 面板停留"宽就够了（10 分钟，正常 15~40 秒就走完）。 */
    if (!ls.at || Date.now() - ls.at > 10 * 60 * 1000) return  getProxied({ ok: false, msg: '这一次的挂机收益已经过期，重新收一次再翻' });
    ls.used = true;
    addCur('points', ls.points || 0);
    addCur('otherworld', ls.otherworld || 0);
    addPlayerExp(ls.exp || 0);
    const again =  getProxied({ points: ls.points || 0, exp: ls.exp || 0, otherworld: ls.otherworld || 0, matItem: null, matCount: 0 });
    if (ls.matItem && ls.matCount) {
      if (addItem(ls.matItem, ls.matCount)) { again.matItem = ls.matItem; again.matCount = ls.matCount; }
      else { stashItem(ls.matItem, ls.matCount); again.matStashed = ls.matCount; }
    }
    if (ls.matItem && ls.matStash) {
      stashItem(ls.matItem, ls.matStash);
      again.matStashed = (again.matStashed || 0) + ls.matStash;
    }
    save();
    return  getProxied({ ok: true, gains: again, sec: ls.sec, msg: '挂机收益已翻倍' });
  }
  /* ================= V1.1.8（乙组 B5 · 挂机加速）=================
     口径（终版 §3.1 第 5 步）：**3 次/天**、每次 **2 小时挂机产出**，**直接发**、不写进挂机银行。
     折算与 `idleBankGains()` 同一套公式（挂机 2 小时 ＝ 120 分钟；◆ 每 10 分钟一档 ×12），
     所以"广告加速两小时"和"真挂两小时"在产出上完全同源（差别只有：不吃离线上限、不进银行）。
     ⚠️ 只发 ◉/EXP/◆ 这三样（与离线那条同一口径）；**不发材料** ——
        材料线有它自己的节拍（药园/副本/产线），塞进来会让"材料日产量"那张账对不上。 */
  function adIdleBoost() {
    const r = idleRates();
    const mins = 120;
    const gains =  getProxied({
      points: Math.round(r.pointsPerMin * mins),
      exp: Math.round(r.expPerMin * mins),
      otherworld: Math.floor(mins / 10) * r.otherworldPer10Min,
    });
    addCur('points', gains.points);
    addCur('otherworld', gains.otherworld);
    addPlayerExp(gains.exp);
    save();
    return  getProxied({ ok: true, gains, seconds: mins * 60 });
  }
  function addPlayerExp(n) {
    // V9.5.86：同样的道理——非有限数会让经验变成 Infinity/-Infinity，字符串会拼接成 '0abc'
    const raw = typeof n === 'string' ? Number(n) : n;
    if (!Number.isFinite(raw) || !raw) return;
    S.player.exp += raw;
    while (S.player.level < D.PLAYER_MAX_LV && S.player.exp >= D.EXP_TABLE[S.player.level]) {
      S.player.exp -= D.EXP_TABLE[S.player.level];
      S.player.level++;
      /* V1.0.1（游戏策划总监会诊查出）：六维点原来还是"每级 +3"的**累加**写法 ——
         而技能点早在 V9.5.78 就改成了状态函数（见下面 skillPointsForLevel 的说明：
         "转生会把等级重置回 Lv.0，累加写法会在重练时再发一遍"）。**六维漏改了。**
         后果：每次转生重练都白拿 300 点，4 转生 = +2400，六维无上限。 */
    }
    /* V1.0.1：这两个都要在 while **外面**重算 —— 技能点本来就在外面，
       六维点我第一版写进了 while 里，于是"没升级就不重算"（test_game 立刻报红）。
       两个都是"状态的函数"，任何一次经验变化后都该按当前等级算一遍。 */
    attrPointsForLevel();
    S.player.skillPoints = skillPointsForLevel();   // V9.5.78：技能点按等级重算（见上面的说明）
  }

  /* 主角六维点：唯一算法（与技能点同一套思路）
     V1.0.1：可用点 = min(当前等级, 上限) × 每级点数 − **已经点掉的**
     写成状态的函数，而不是升级时累加 —— 转生 / GM 改等级 / 老档迁移都能自动算对。 */
  function attrPointsForLevel() {
    const lv = Math.min(S.player.level || 0, D.PLAYER_MAX_LV);
    const total = lv * D.ATTR_POINTS_PER_LV;
    const spent = D.ATTR_META.reduce((s, a) => s + ((S.player.attrs && S.player.attrs[a.id]) || 0), 0);
    S.player.attrPoints = Math.max(0, total - spent);
    return S.player.attrPoints;
  }

  /* ================= 主角技能点：唯一算法 =================
     V9.5.78（自审）：技能点的数量**只由一个公式决定**——
       可用点 = min(当前等级, 三条技能点满所需的总点数) − 已经点掉的点
     为什么不用"每升一级 +1"那种累加写法：
       · 转生会把等级重置回 Lv.0，累加写法会在重练时**再发一遍** 100 点，
         而技能早就点满了，于是界面上永远挂着"技能待加 100"；
       · GM 改等级、老档迁移这些"跳过升级过程"的情况，累加写法也补不齐。
     现在它是**状态的函数**而不是过程的产物，转生、改档、洗点之后都会自动算对。
     （副作用：以后如果要从别处发技能点，得改成加项而不是覆盖，注释留在这里提醒。） */
  function skillPointsForLevel() {
    const cap = D.SKILL_MAX_BY_INDEX.reduce((a, b) => a + b, 0);
    const spent = (S.player.skillLv ||  getProxied([0, 0, 0])).reduce((a, b) => a + b, 0);
    return Math.max(0, Math.min(S.player.level || 0, cap) - spent);
  }

  /* ================= 主角技能加点 ================= */
  // 技能组：觉醒血统后替换为血统技能
  function protagonistSkills() {
    return (S.player.bloodline && D.BLOODLINE_SKILLS[S.player.bloodline]) || D.PROTAGONIST.skills;
  }
  function allocateSkill(idx) {
    const lv = S.player.skillLv || (S.player.skillLv =  getProxied([0, 0, 0]));
    if (idx < 0 || idx > 2) return  getProxied({ ok: false, msg: '技能不存在' });
    if (lv[idx] >= D.SKILL_MAX_BY_INDEX[idx]) return  getProxied({ ok: false, msg: '已满级' });
    if ((S.player.skillPoints || 0) < 1) return  getProxied({ ok: false, msg: '没有可用技能点' });
    S.player.skillPoints--;
    lv[idx]++;
    save();
    return  getProxied({ ok: true, msg: `技能升到 Lv.${lv[idx]}` });
  }
  function resetSkills() {
    /* V9.5.71（自审）：技能从 1 基改成 0 基之后这里漏改了——
       原来退的是 sum(等级-1)、重置成 [1,1,1]，而技能等级从 0 起算意味着：
       退 2 点却把三条技能又放回 1 级（净赚 3 级），反复洗点可以白刷技能等级。
       现在按 0 基口径：退 sum(等级)、重置成 [0,0,0]。 */
    const lv = S.player.skillLv ||  getProxied([0, 0, 0]);
    const refund = lv.reduce((s, x) => s + x, 0);
    if (refund <= 0) return  getProxied({ ok: false, msg: '尚未加点' });
    S.player.skillLv =  getProxied([0, 0, 0]);
    S.player.skillPoints = (S.player.skillPoints || 0) + refund;
    save();
    return  getProxied({ ok: true, msg: `已重置，返还 ${refund} 点技能点` });
  }

  // 六维属性点分配（每点 +ATTR_POINT_VALUE 维值）
  function allocateAttr(attrId, n = 1) {
    if (!D.ATTR_META.some(a => a.id === attrId)) return  getProxied({ ok: false, msg: '属性不存在' });
    n = Math.min(n, S.player.attrPoints || 0);
    if (n <= 0) return  getProxied({ ok: false, msg: '没有可用属性点' });
    S.player.attrPoints -= n;
    S.player.attrs[attrId] = (S.player.attrs[attrId] || 0) + n;
    save();
    return  getProxied({ ok: true, msg: `${D.ATTR_META.find(a => a.id === attrId).name} +${n * D.ATTR_POINT_VALUE}` });
  }
  // 六维洗点：把已经分出去的属性点全部退回"可用点数"，免费、可反复洗。
  // 和 resetSkills 对称：加错了不该逼人重开档。
  function resetAttrs() {
    const spent = D.ATTR_META.reduce((s, a) => s + ((S.player.attrs && S.player.attrs[a.id]) || 0), 0);
    if (spent <= 0) return  getProxied({ ok: false, msg: '还没分配过属性点' });
    S.player.attrs = ATTR_ZERO();
    S.player.attrPoints = (S.player.attrPoints || 0) + spent;
    save();
    return  getProxied({ ok: true, msg: `已洗点，退回 ${spent} 点属性点` });
  }

  /* ================= 多主角（新建角色体验不同血统） ================= */
  /* V1.0.3 · P1（产品经理报，改法照单执行）：
     这一张名单原来只有 9 个字段，**漏掉 5 个"长得不像资料"的进度字段** ——
       realm（境界）／talents（天赋）／reincarnations（转生世数）／geneLock（铭刻阶数）／row（站位）。
     新建主角只重置名单里的 9 个，这 5 个**原样留在新主角身上**：
     实测【境界 12 阶 + 满天赋 + 转生 3 世】时新建主角，新档一出生就带着旧主角的境界与天赋
     （产品经理报的 P1：新主角 Lv.0，境界却已经不是 0）。
     口径：新建主角**必须回到新档初值** —— 境界 0 / 天赋全 0 / 转生 0 世 / 铭刻 0 阶 / 站位前排。

     ⚠️ 往里加字段时，**值不是标量的那几个必须在 snapshot/restore 里各拷一份**
     （attrs / talents 是对象、skillLv 是数组）：直接传引用＝两个主角共用同一个对象，
     改一个动两个，比"没重置"更难查。 */
  const PROTAGONIST_KEYS =  getProxied(['name', 'level', 'exp', 'bloodline', 'bloodlineLv', 'attrPoints', 'attrs',
    'skillPoints', 'skillLv', 'realm', 'talents', 'reincarnations', 'geneLock', 'row',
    /* V1.0.4 · V：`nameAudited` 必须跟着主角走 —— 不然切一位主角再切回来，
       那位过审的自由名字就"丢了凭据"，下一次读档被换成预设名（test_game 那条
       "快照要覆盖 S.player 每一个字段"也会当场红）。 */
    'nameAudited',
    /* V1.1.9（续13 · P0-4）：`bestWorldIdx`（历史最高通关世界）也是 `S.player` 上的一个字段 ——
       不列进来的话，`test_game` 那条"快照必须覆盖 S.player 的每一个字段"当场红（本轮实测踩到），
       而且新建主角会**继承上一任的进度档**（和 V1.0.3 那五个字段同一个坑）。
       口径：进度档跟着"这个世界打到哪"，新建主角＝新档，所以它也回 0。 */
    'bestWorldIdx']);
  function snapshotProtagonist() {
    const p =  getProxied({});
    PROTAGONIST_KEYS.forEach(k => { p[k] = S.player[k]; });
    p.attrs = Object.assign(ATTR_ZERO(), p.attrs);
    p.skillLv = (p.skillLv ||  getProxied([0, 0, 0])).slice();
    p.talents = Object.assign(TALENT_ZERO(), p.talents);    // 深拷：不然两个主角共用同一个天赋对象
    return p;
  }
  function restoreProtagonist(p) {
    PROTAGONIST_KEYS.forEach(k => { S.player[k] = p[k]; });
    S.player.attrs = Object.assign(ATTR_ZERO(), p.attrs);
    S.player.skillLv = (p.skillLv ||  getProxied([0, 0, 0])).slice();
    S.player.talents = Object.assign(TALENT_ZERO(), p.talents);
    /* 老档的 altPlayers 快照里没有这几个字段（名单是这一版才补的）——
       取不到就按**新档初值**补，绝不留 undefined（境界 / 铭刻 / 站位读到 undefined
       在界面上会静默当 0，但写回存档就是一个"缺字段"的档，下一轮迁移又要兜一次）。 */
    S.player.realm = p.realm || 0;
    S.player.reincarnations = p.reincarnations || 0;
    S.player.geneLock = p.geneLock || 0;
    S.player.row = p.row || 'front';
    S.player.bestWorldIdx = Math.max(0, p.bestWorldIdx || 0);   // V1.1.9（续13）：老快照没这个字段 → 按新档初值
  }
  function protagonistList() {
    return  getProxied([
      Object.assign(snapshotProtagonist(),  getProxied({ current: true })),
      ...S.altPlayers.map((p, i) => Object.assign( getProxied({}), p,  getProxied({ altIndex: i }))),
    ]);
  }
  function createProtagonist(name) {
    /* V1.0.4 · V：新建主角的名字也走**同一条判据**（名单里 → 免审；名单外 → 必须带过审凭据）。
       以前这里只 `.trim()`，等于"名字从哪来的"没人把关 —— 现在三个入口（起名 / 改名 / 新建主角）
       都从 `setPlayerName` 或这里进，规则只有这一份。 */
    const nm = shapeName(name);
    if (!nm) return  getProxied({ ok: false, msg: '名字不能为空' });
    if (S.altPlayers.length >= 6) return  getProxied({ ok: false, msg: '最多创建 6 个额外主角' });
    const listed = isListName(nm);
    if (!listed && !takeNameTicket(nm)) return  getProxied({ ok: false, msg: '这个名字还没过审，换一个试试' });
    S.altPlayers.push(snapshotProtagonist());
    restoreProtagonist(freshProtagonist(nm, listed ? '' : nm));
    save();
    return  getProxied({ ok: true, msg: `新主角「${nm}」已创建，天赋与命格从 Lv.1 重新选` });
  }
  function switchProtagonist(altIndex) {
    const alt = S.altPlayers[altIndex];
    if (!alt) return  getProxied({ ok: false, msg: '主角不存在' });
    const cur = snapshotProtagonist();
    S.altPlayers[altIndex] = cur;
    restoreProtagonist(alt);
    save();
    return  getProxied({ ok: true, msg: `已切换为「${S.player.name}」` });
  }

  /* ================= 建筑 ================= */
  /* 每栋建筑的上限（`upgradeBuilding` 那道闸）；5 栋全满 ＝ 250 级 —— `sc-grow.js` 那行
     「Lv.X / 250」就是这个口径。**只此一处**，`buildingMaxed()`（下面的死条闸门）也读它。 */
  const BUILDING_MAX_LV = 50;
  /** 建筑**全满**了没（每栋都到顶）。用途只有一个：满级后「基地建设升级 1 级」这条额外任务
      再派发就没意义了 —— **满级后不留死条**（父亲大人 0929-I 点头的口子）。 */
  function buildingMaxed() {
    const list = D.BUILDINGS || [];
    return list.length > 0 && list.every(b => (S.buildings[b.id] || 0) >= BUILDING_MAX_LV);
  }
  function upgradeBuilding(id) {
    const lv = S.buildings[id];
    if (lv >= BUILDING_MAX_LV) return  getProxied({ ok: false, msg: '已满级' });
    const cost =  getProxied({ points: D.buildingCost(id, lv) });
    if (!spend(cost)) return  getProxied({ ok: false, msg: '点数不足' });
    S.buildings[id]++;
    task('build1', 1);          // 0929-I 额外任务：基地建设升级 1 级（周常不接这条 → TASK_SRC 里是 null）
    save();
    return  getProxied({ ok: true, msg: `升到 Lv.${S.buildings[id]}` });
  }

  /* ================= 灯阁权限（对标《道友修仙》的"洞府"） ================= */
  // 建筑用点数（软货币）升级，这条线专用高级货币（✦ 圣洁晶石 + ◆ 异界结晶）——
  // 目的：给"抽卡之外"的高级货币一个长线出口，投进去就永久生效，转生也保留。
  function authority() { return D.authorityBonus(S.auth || 0); }
  function authorityInfo() {
    const lv = S.auth || 0;
    const max = D.AUTHORITY_MAX;
    return  getProxied({
      lv, max,
      maxed: lv >= max,
      cost: lv >= max ? null : D.authorityCost(lv),
      now: authority(),
      nextDesc: lv >= max ? null : D.AUTHORITY[lv].desc,
      rows: D.AUTHORITY,
    });
  }
  /* 权限等级的解锁判定：D.authorityReq(lv) 给出"通关 XX·普通"，
     这里对照玩家的世界进度（普通难度 12 关全清才算通关那张图）。 */
  function authorityReqMet(lv) {
    try {
      const idx = Math.min(D.WORLDS.length - 1, Math.max(0, Math.ceil(lv * 1.8) - 1));
      const wid = D.WORLDS[idx].id;
      const w = S.worlds[wid];
      return !!(w && w.stages && w.stages.normal && w.stages.normal[11] > 0);
    } catch (e) { return true; }   // 判定出错就放行，别卡住玩家
  }
  function upgradeAuthority() {
    const lv = S.auth || 0;
    if (lv >= D.AUTHORITY_MAX) return  getProxied({ ok: false, msg: '灯阁权限已满级' });
    /* V9.6.133：权限 20 级 → 每一级都要**跟着进度**解锁（通关第 N 张图），不再一次点到顶 */
    const req = D.authorityReq ? D.authorityReq(lv + 1) : '';
    if (req && !authorityReqMet(lv + 1)) return  getProxied({ ok: false, msg: '还没解锁：' + req });
    const cost = D.authorityCost(lv);
    /* ⚠️ 货币与材料**分两个对象**走：`canAfford / spend` 只认货币键，
       把 `mat / matN` 混进去会被当成"货币数量不足"而永远点不动（`S.cur.mat` 是 undefined）。 */
    const cur =  getProxied({ holy: cost.holy, otherworld: cost.otherworld });
    if (!canAfford(cur)) return  getProxied({ ok: false, msg: `材料不足：需要 ${cost.holy} 圣洁晶石 + ${cost.otherworld} 异界结晶` });
    /* V1.1.4（A12-F · 灯阁权限接「灯油」）：每级 3 块（《收口2》§3.1），20 级共 60 块。
       仍然"先判料、再扣钱"：货币是不可逆的，材料是可补的。 */
    const matN = cost.matN || 0;
    if (matN && (S.items[cost.mat] || 0) < matN) {
      return  getProxied({ ok: false, msg: `${(D.ITEMS[cost.mat] ||  getProxied({})).name || cost.mat} 不足（${S.items[cost.mat] || 0}/${matN}）` });
    }
    spend(cur);
    if (matN) addItem(cost.mat, -matN);
    S.auth = lv + 1;
    save();
    return  getProxied({ ok: true, msg: `灯阁权限提升到 Lv.${S.auth}` });
  }

  /* ================= 灯阁评级（对标《道友修仙》的"宗门等级"） =================
     它那条线是 321 级、随主线推进自动涨、每级抬全队属性。
     我们做成同样的机制：**不用手动点**，打关卡 / 打赢 / 挂机都会涨经验，满了自动升。
     这样"打关卡"这件事除了掉装备之外，还有一条挡不住的长期回报。 */
  function sectInfo() {
    // V9.5.81（自审·边界档）：评级从 0 级起，`|| 1` 会把 0 当成假值吞掉 →
    // 新号被显示成 Lv.1，sectBonusPct 还按 Lv.1 白送 0.5% 全队属性。0 是合法值，只能兜底成 0。
    const lv = (S.sect && S.sect.lv) || 0;
    const exp = (S.sect && S.sect.exp) || 0;
    const need = D.sectExpNeed(lv);
    return  getProxied({
      lv, exp, need, max: D.SECT_MAX, maxed: lv >= D.SECT_MAX,
      pct: D.sectBonusPct(lv),                 // 当前全队加成（数值，不是对象）
      nextPct: D.sectBonusPct(Math.min(D.SECT_MAX, lv + 1)),
      rate: D.SECT_PCT_PER_LV,
      gain: D.SECT_EXP,
    });
  }
  // 每级：全队全属性 +0.5%（与铭刻 / 血统 / 血清同为百分比区，加算）
  function sectBonusPct() {
    if (!S.sect) return  getProxied({ atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0 });
    const v = D.sectBonusPct(S.sect.lv || 0);
    return  getProxied({ atkPct: v, hpPct: v, defPct: v, spdPct: v, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0 });
  }
  function applySect(pct) {
    const s = sectBonusPct();
    Object.keys(s).forEach(k => { if (s[k]) pct[k] = (pct[k] || 0) + s[k]; });
  }
  // 涨评级经验；返回本次升了几级（UI 用来提示"评级提升"）
  function addSectExp(n) {
    if (!n || n <= 0) return 0;
    if (!S.sect) S.sect =  getProxied({ lv: 0, exp: 0 });
    if (S.sect.lv >= D.SECT_MAX) return 0;
    S.sect.exp += n;
    let up = 0;
    while (S.sect.lv < D.SECT_MAX && S.sect.exp >= D.sectExpNeed(S.sect.lv)) {
      S.sect.exp -= D.sectExpNeed(S.sect.lv);
      S.sect.lv++;
      up++;
    }
    if (S.sect.lv >= D.SECT_MAX) S.sect.exp = 0;
    save();
    return up;
  }

  /* ================= 秘术阁（对标《道友修仙》的 KeJi） =================
     对标的是它那套"每条线每级只加一点点、但能一路修到顶"的长线（合 550 级）。
     我们做成 42 条：33 条加战斗（攻/生/防/速/暴击/暴伤/技能/闪避…），9 条加挂机经济
     （产出/经验/掉落/离线上限…）。消耗统一走 ◆ 异界结晶（这是它的 coinBase 那一路），
     让高级货币在"抽卡"之外有第二个出口。 */
  function kejiLv(id) { return (S.keji && S.keji[id]) || 0; }
  function kejiCostOf(id) {
    const k = D.kejiById(id);
    if (!k) return 0;
    const lv = kejiLv(id);
    return lv >= k.max ? null : D.kejiCost(k, lv);
  }
  // 所有秘术的加成汇总：战斗键进 pct，产出键单独给
  function kejiBonus() {
    const out =  getProxied({ combat:  getProxied({}), idlePct: 0, expPct: 0, dropPct: 0, offlinePct: 0 });
    D.KEJI.forEach(k => {
      const lv = kejiLv(k.id);
      if (!lv) return;
      const v = k.rate * lv;
      if (k.key === 'idlePct' || k.key === 'expPct' || k.key === 'dropPct' || k.key === 'offlinePct') out[k.key] += v;
      else out.combat[k.key] = (out.combat[k.key] || 0) + v;
    });
    return out;
  }
  function applyKeji(pct) {
    const kb = kejiBonus().combat;
    Object.keys(kb).forEach(k => { pct[k] = (pct[k] || 0) + kb[k]; });
  }
  function kejiUp(id, times = 1) {
    const k = D.kejiById(id);
    if (!k) return  getProxied({ ok: false, msg: '没有这条秘术' });
    let done = 0;
    for (let i = 0; i < times; i++) {
      const cost = kejiCostOf(id);
      if (cost === null) break;
      if ((S.cur[D.KEJI_COIN] || 0) < cost) break;
      /* V1.1.4（A12-F · 秘术阁接「秘卷残章」）：每 5 级补 1 张（《收口2》§3.1）。
         放在循环里逐级判（不是"批量前判一次"）—— 连点 10 级会正好吃掉 2 张，与逐级点完全一致。 */
      const matId = D.KEJI_MAT, matN = D.kejiMatNeed(kejiLv(id));
      if (matN && (S.items[matId] || 0) < matN) {
        if (!done) return  getProxied({ ok: false, msg: `${(D.ITEMS[matId] ||  getProxied({})).name || matId} 不足（${S.items[matId] || 0}/${matN}）` });
        break;
      }
      addCur(D.KEJI_COIN, -cost);
      if (matN) addItem(matId, -matN);
      S.keji[id] = kejiLv(id) + 1;
      done++;
    }
    if (!done) {
      const cost = kejiCostOf(id);
      const matN = D.kejiMatNeed(kejiLv(id));
      const matId = D.KEJI_MAT;
      return  getProxied({ ok: false, msg: cost === null ? `${k.name} 已满级`
        : (matN && (S.items[matId] || 0) < matN ? `${(D.ITEMS[matId] ||  getProxied({})).name || matId} 不足（${S.items[matId] || 0}/${matN}）`
          : `${curMeta(D.KEJI_COIN).name}不足（需要 ${cost}）`) });
    }
    const lv = kejiLv(id);
    save();
    return  getProxied({ ok: true, msg: `${k.name} 提升到 Lv.${lv}（${k.info} +${(k.rate * lv * 100).toFixed(1)}%）`, lv, done });
  }

  /* ================= 挂机游历奇遇（对标《道友修仙》的 YouLi） =================
     节奏（父亲大人定的）：进游戏后第 5 分钟出第一次，之后 10 / 20 / 30 / 40 / 50 分钟，
     60 分钟封顶（再往后固定每小时一次）。**领完才开始算下一轮**，待领的时候不计时，
     所以不会攒着一堆没领的；跨天（自然日）重新从第一次开始。
     攒满停在"待触发"，不会过期丢东西。界面上不写这套说明，玩家看进度条就行。 */
  function travelBank() {
    if (!S.travel) S.travel =  getProxied({ bankSec: 0, pending: null, got: 0, round: 0, day: '' });
    const t = S.travel;
    if (typeof t.round !== 'number') t.round = 0;
    if (typeof t.day !== 'string') t.day = '';
    return t;
  }
  // 跨天：新的一天从第一次（5 分钟）重新计
  function travelDayRoll(t) {
    const today = dailyDate();
    if (t.day === today) return false;
    t.day = today;
    t.round = 0;
    t.bankSec = 0;
    return true;
  }
  // 这一轮要等多久（秒）：按节奏表往后走，表走完就固定在最后一步
  function travelEverySec() {
    const t = travelBank();
    const steps = D.TRAVEL_STEPS_SEC;
    return steps[Math.min(t.round, steps.length - 1)];
  }
  function travelProgress() {
    const t = travelBank();
    travelDayRoll(t);
    const every = travelEverySec();
    return  getProxied({ sec: t.bankSec, every, round: t.round, pct: Math.min(1, t.bankSec / every), pending: t.pending });
  }
  // 累计挂机时长（在线 + 离线都算）；有没领的压着就不计时（领完才重新计）
  function travelAccrue(sec) {
    if (!sec || sec <= 0) return;
    const t = travelBank();
    travelDayRoll(t);
    if (t.pending) return;
    t.bankSec += sec;
    if (t.bankSec >= travelEverySec()) { t.bankSec = 0; t.pending = rollTravel(); }
  }
  function rollTravel() {
    let r = Math.random() * D.TRAVEL_TOTAL_W;
    for (const tv of D.TRAVELS) { r -= tv.w; if (r <= 0) return tv.id; }
    return D.TRAVELS[0].id;
  }
  function pendingTravel() {
    const t = travelBank();
    return t.pending ? D.TRAVELS.find(x => x.id === t.pending) || null : null;
  }
  function claimTravel() {
    const t = travelBank();
    const tv = pendingTravel();
    if (!tv) return  getProxied({ ok: false, msg: '还没有新的游历' });
    applyRewardObj(tv.effect);
    const rolled = travelDayRoll(t);      // 跨天才来领：这一轮按新的一天从头算
    t.pending = null;
    t.round = rolled ? 0 : t.round + 1;   // 领完才开始算下一轮，间隔按节奏表往后走
   t.bankSec = 0;
   t.got = (t.got || 0) + 1;
    task('travel1', 1);         // 0929-I 额外任务：领取游历奇遇 1 次（不接周常 → TASK_SRC['travel1'] 是 null）
   save();
   return  getProxied({ ok: true, msg: `${tv.name}：${travelRewardText(tv)}`, travel: tv });
 }
  function travelRewardText(tv) {
    return rewardTextOf(tv.effect);
  }
  // 把效果对象写成一行可读文字（说明由效果派生，不另写一套文案）
  function rewardTextOf(eff) {
    const parts =  getProxied([]);
    // V9.6.134：货币 8 → 4
    const curKeys =  getProxied(['points', 'otherworld', 'holy', 'rp']);
    curKeys.forEach(k => { if (eff[k]) parts.push(`${curMeta(k).icon}${eff[k]}`); });
    /* V1.1.13（0927-E）：同一件道具出现多次要**并成一件**（「重铸石×2」），
       不许写成「重铸石×1 · 重铸石×1」—— 周常 / 悬赏这轮开始会一次发好几颗同样的石头。 */
    if (eff.item) {
      const cnt =  getProxied({});
      const order = [];
       getProxied([]).concat(eff.item).forEach(id => { if (cnt[id] === undefined) { cnt[id] = 0; order.push(id); } cnt[id]++; });
      order.forEach(id => {
        const nm = (D.ITEMS[id] ||  getProxied({})).name || id;
        parts.push(cnt[id] > 1 ? `${nm}×${cnt[id]}` : `${nm}×1`);
      });
    }
    return parts.join(' · ') || '空手而归';
  }
  function curMeta(id) { return D.CURRENCIES.find(c => c.id === id) ||  getProxied({ name: id, icon: '' }); }

  /* ================= V1.0.5 · 兑换码 / 新手礼包（2026-10-01 · 父亲大人点单）=================
     父亲大人：「不要调用 mp 后台，直接写在游戏里就行了，就当新手礼包让用户直接领了」
             「每个码每个玩家只能领取一次哦」。
     全项目**唯一**的兑换出口（界面只把玩家敲的那串字符原样递进来，判据一条都不许留在界面里）：
       · 归一化：大写 ＋ 只留 0-9 A-Z —— 大小写、空格、横杠都不影响玩家照着抄；
       · 码表读 `D.GIFT_CODES`（数据层**唯一真源**，界面里一串码都不许写、额度也不许抄）；
       · "一人一次"读 `S.gifts`（进存档 ＋ 跟着云同步走 ⇒ 换设备也照样只领一次）；
       · 发奖走 `applyRewardObj`（全项目唯一的发奖入口：货币入账 / 道具进包 / 背包满了进待领箱）。
     ⚠️ 顺序是**先记账再发奖**：万一发奖中途抛错，重进也不会把这个码算成"还能再领"。
        反过来的话，坏的那一半是"东西没到手、码也废了"，比这更糟。 */
  function claimGift(code) {
    const c = String(code == null ? '' : code).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!c) return  getProxied({ ok: false, why: 'empty' });
    const goods = D.GIFT_CODES[c];
    if (!goods) return  getProxied({ ok: false, why: 'bad' });      // "码写错"与"码不存在"**同一条**
    if (!S.gifts) S.gifts =  getProxied({});
    if (S.gifts[c]) return  getProxied({ ok: false, why: 'used', code: c });
    S.gifts[c] = Date.now();
    const got = applyRewardObj(goods);
    save();
    return  getProxied({ ok: true, code: c, goods: goods, stashed: (got && got.stashed) ||  getProxied([]) });
  }

  /* ================= 药园（对标《道友修仙》洞府里的"药园"） ================= */
  // 种下去等时间，回来收材料——给"点数"开一个稳定出口，也给强化材料一条不用刷副本的路。
  function gardenState() {
    if (!S.garden) S.garden = Array(D.GARDEN_MAX).fill(null);
    while (S.garden.length < D.GARDEN_MAX) S.garden.push(null);
    /* ================= 药园 3.0（2026-10-02 · 父亲大人提案）=================
       地不再"按进度自动开"、也不再"第 i 块固定第 i%4 种灵田"：
         · 开几块 = **玩家自己买**（S.gardenPlots，开局 2 块、最多 8 块、价按已开数量递增）；
         · 种下去那一刻**掷品质**（下品/中品/上品/极品，概率随进度加权，见 data.js 的账），
           收成与时长都跟着那一档走 —— 所以"这块地现在是哪一档"必须读**存档里那一块**，
           不能再从地块索引推。 */
    const total = gardenPlots();
    const out =  getProxied([]);
    for (let i = 0; i < D.GARDEN_MAX; i++) {
      const plot = S.garden[i] || null;
      const locked = i >= total;
      const leftMs = plot ? Math.max(0, plot.at - Date.now()) : 0;
      /* `kind` 只在**已经种着**时才有值 = 掷出来的那一档；空地没有 kind。
         老档（3.0 之前）存的是 { id:'g1', at } —— 由 plotKindOf 兼容读出来。 */
      const g = plot ? plotKindOf(plot) : null;
      out.push( getProxied({ idx: i, kind: g, plot, locked, leftMs, ready: !!plot && leftMs <= 0 }));
    }
    return out;
  }
  /* 现在开了几块地：**玩家买出来的**（S.gardenPlots）。老档在 loadSave 里做一次迁移补齐。 */
  function gardenPlots() {
    const n = Math.max(D.GARDEN_PLOTS, Math.floor(S.gardenPlots || D.GARDEN_PLOTS));
    return Math.min(D.GARDEN_MAX, n);
  }
  /* 开下一块地要多少 ◉（买满返回 0 = 不能再买） */
  function gardenNextPrice() {
    const n = gardenPlots();
    return n >= D.GARDEN_MAX ? 0 : (D.GARDEN_PLOT_PRICE[n] || 0);
  }
  /* 存档里那块地种的是哪一档：新档存 q（品质 id）；老档只存 id（3.0 之前的灵田 id） */
  function plotKindOf(plot) {
    const key = plot && (plot.q || plot.id);
    return D.GARDEN.find(x => x.id === key) || D.GARDEN[0];
  }
  /* 掷品质：按**进度**取一张权重表（前期多下品、后期多上品/极品）。
     进度只认一个数：S.player.bestWorldIdx（历史最高通关世界下标，0 起）—— 与别处同一口径。 */
  function gardenOdds() {
    const idx = Math.max(0, S.player.bestWorldIdx || 0);
    const band = D.GARDEN_ODDS.find(b => idx <= b.upTo) || D.GARDEN_ODDS[D.GARDEN_ODDS.length - 1];
    return band.w.slice();
  }
  function gardenRollQuality() {
    const w = gardenOdds(), sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return D.GARDEN[i]; }
    return D.GARDEN[0];
  }
  /* 买地：价钱按"已开数量"递增（第 3 块起），买满 8 块为止 */
  function buyGardenPlot() {
    const n = gardenPlots();
    if (n >= D.GARDEN_MAX) return  getProxied({ ok: false, msg: `最多 ${D.GARDEN_MAX} 块，已经满了` });
    const price = gardenNextPrice();
    if (!canAfford( getProxied({ points: price }))) return  getProxied({ ok: false, msg: `◉ 点数不足（新增灵田需要 ${fmtNum(price)}）` });
    spend( getProxied({ points: price }));
    S.gardenPlots = n + 1;
    save();
    return  getProxied({ ok: true, msg: `开垦了第 ${n + 1} 块灵田（◉ ${fmtNum(price)}）` });
  }
  function plantGarden(idx, gardenId) {
    if (idx >= gardenPlots()) return  getProxied({ ok: false, msg: '这块地还没开（在下面点「新增灵田」）' });
    if (S.garden[idx]) return  getProxied({ ok: false, msg: '这块地还种着东西' });
    const cost = D.GARDEN_PLANT_COST;
    if (!canAfford( getProxied({ points: cost }))) return  getProxied({ ok: false, msg: `◉ 点数不足（播种需要 ${fmtNum(cost)}）` });
    /* V1.1.4（A12-F · 药园接「灵植种」）：每块地 1 颗（《收口2》§3.1）。
       收成时回收 70%（见 harvestGarden）→ 播 10 收 7，自循环；缺口由副本材料档与市集补（不设卡）。 */
    const seedId = D.GARDEN_SEED, seedN = D.GARDEN_SEED_N || 1;
    if ((S.items[seedId] || 0) < seedN) {
      return  getProxied({ ok: false, msg: `${(D.ITEMS[seedId] ||  getProxied({})).name || seedId} 不足（${S.items[seedId] || 0}/${seedN}，市集可买）` });
    }
    /* 掷品质 → 收成与时长都跟着它走。**掷的结果直接落在存档里**（收成时按存档读，
       绝不重掷一次），否则"看到的"和"收到的"就是两回事。 */
    const g = gardenRollQuality();
    spend( getProxied({ points: cost }));
    addItem(seedId, -seedN);
    S.garden[idx] =  getProxied({ q: g.id, at: Date.now() + g.sec * 1000 });
    task('gard1', 1);           // 0929-I 额外任务：药园种植 1 次（周常 w_garden 由 TASK_SRC['gard1']='garden' 自动喂）
    save();
    return  getProxied({ ok: true, kind: g, msg: `种出了「${g.name}」，${D.fmtClock(g.sec)}后可以收` });
  }
  // 收获一块地；熟了才让收（没熟的提示还剩多久）
  function harvestGarden(idx) {
    const p = S.garden[idx];
    if (!p) return  getProxied({ ok: false, msg: '这块地是空的' });
    if (Date.now() < p.at) return  getProxied({ ok: false, msg: `还没熟（剩 ${Math.ceil((p.at - Date.now()) / 1000)} 秒）` });
    /* 收成读**存档里那一档**（3.0 起存 `q`；老档只有 `id`，由 plotKindOf 兼容）——
       不在收成时重掷，玩家看到的那一档就是拿到的那一档。 */
    const g = plotKindOf(p);
    const got =  getProxied([]);
    // 收获一律保底：装得下进背包，装不下进待领箱——绝不出现"地清了、东西没了"
    const take = (id, n) => {
      const nm = `${(D.ITEMS[id] ||  getProxied({})).name || id}×${n}`;
      if (addItem(id, n)) { got.push(nm); return; }
      stashItem(id, n);
      /* V1.1.15（2026-09-27）：文案与背包页那张卡片同一口径（📮 待领箱），
         别处只说"背包满"玩家不知道东西去哪了。 */
      got.push(`${nm}（📮 已存待领箱）`);
    };
    take(g.out.item, g.out.n);
    if (g.extra && Math.random() < g.extra.p) {
      const before = got.length;
      take(g.extra.item, g.extra.n);
      got[before] = '稀有 ' + got[before];
    }
    /* V1.1.4（A12-F）：「收成回收 70%」——把这一茬用掉的种子里 70% 还回去。
       一块地只用 1 颗，所以 0.7 不能靠 `floor`（那会永远还 0 颗、药园当场变纯消耗）；
       按"整颗保底 + 小数部分按概率进位"算：播 10 收 7 就是这条式子的长期结果。
       比例只此一处（`D.GARDEN_SEED_RECYCLE`），改它等于改药园的"永动程度"——属数值轮。 */
    const backRaw = (D.GARDEN_SEED_N || 1) * (D.GARDEN_SEED_RECYCLE || 0);
    const back = Math.floor(backRaw) + (Math.random() < (backRaw - Math.floor(backRaw)) ? 1 : 0);
    if (back > 0) take(D.GARDEN_SEED, back);
    S.garden[idx] = null;
    save();
    return  getProxied({ ok: true, msg: `收获：${got.join(' · ')}`, got });
  }
  function harvestAllGarden() {
    const out =  getProxied([]);
    gardenState().forEach(s => { if (s.ready) { const r = harvestGarden(s.idx); if (r.ok) out.push(r.msg); } });
    return  getProxied({ ok: out.length > 0, msg: out.length ? `收了 ${out.length} 块地` : '没有成熟的地', list: out });
  }

  /* ================= 斗法台（对标《道友修仙》的斗法 / Arena） =================
     单机没真 PVP，所以守擂者按你自己的队伍战力换算——层数越高越强，每天 5 次。 */
  function arenaState() {
    if (!S.arena) S.arena =  getProxied({ floor: 1, best: 1, date: '', used: 0 });
    if (S.arena.date !== dailyDate()) { S.arena.date = dailyDate(); S.arena.used = 0; }
    const floor = S.arena.floor;
    return  getProxied({
      floor, best: S.arena.best, used: S.arena.used, cap: D.ARENA_DAILY,
      left: Math.max(0, D.ARENA_DAILY - S.arena.used),
      reward: D.arenaReward(floor),
      enemies: D.arenaEnemy(floor, teamPower()),
    });
  }
  // 打完一台：赢则升台拿奖励，输则退一台（保底第 1 台，不会卡死）
  function arenaSettle(win) {
    const st = arenaState();
    if (st.left <= 0) return  getProxied({ ok: false, msg: '今日斗法次数已用完' });
    S.arena.used++;
    task('arena1', 1);          // 每日任务：斗法台守擂 1 次
    let msg;
    if (win) {
      const rw = D.arenaReward(S.arena.floor);
      Object.entries(rw).forEach(([k, v]) => addCur(k, v));
      S.arena.floor++;
      S.arena.best = Math.max(S.arena.best, S.arena.floor);
      /* V1.0.1（游戏策划总监会诊查出）：V9.6.134「货币 8→4」那次是**文本替换**做的，
         把 `${S.arena.floor}` 和 `${rw.otherworld}` 两个插值一起抹掉了 —— 玩家每次赢
         都只看到"升到第  台 · ◆ "（两处空着）。这里补回真值。 */
      msg = `守擂成功！升到第 ${S.arena.floor} 台 · ◆ ${rw.otherworld || 0}`;
    } else {
      S.arena.floor = Math.max(1, S.arena.floor - 1);
      msg = '守擂失败，退一台再来（次数照常消耗）';
    }
    save();
    return  getProxied({ ok: true, win, msg, floor: S.arena.floor, left: Math.max(0, D.ARENA_DAILY - S.arena.used) });
  }

  /* ================= 法宝（对标《道友修仙》的法宝） =================
     装备给数值，法宝给效果：主角带 1 件，按效果并进属性区 / 战斗额外区。 */
  function fabaoState() {
    if (!S.fabao) S.fabao =  getProxied({ own:  getProxied([]), on: null });
    return  getProxied({
      own: S.fabao.own.slice(), on: S.fabao.on,
      list: D.FABAO.map(f => Object.assign( getProxied({}), f,  getProxied({ owned: S.fabao.own.includes(f.id), active: S.fabao.on === f.id, lv: fabaoLv(f.id), maxLv: D.FABAO_MAX_LV }))),
    });
  }
  function buyFabao(id) {
    const f = D.fabaoById(id);
    if (!f) return  getProxied({ ok: false, msg: '没有这件法宝' });
    if (!S.fabao) S.fabao =  getProxied({ own:  getProxied([]), on: null });
    if (S.fabao.own.includes(id)) return  getProxied({ ok: false, msg: `已经有「${f.name}」了` });
    /* V9.6.112（真流程审计抓到的死结）：法宝原来是**扣 ◆ 异界结晶**，最便宜的一件要 1000 ◆ ——
       而新号打完整个世界才拿 200 ◆，主线却把"获得 1 件法宝"排在**第 4 关刚开完**的时候：
       界面上按钮全是灰的（买不起就不登记热区），引导指不到任何东西，这一步永远完不成，
       后面整条主线陪着一起卡。
       改回**◉ 点数**（这也是引导文案一直在写的口径：「法宝：花 ◉ 点数买一件」）——
       ◉ 是前期就充裕的货币，价格量级（1000~15000）本来就是按点数定的。
       秘术阁继续扣 ◆（13 起）——那条线是真正的 ◆ 消耗口。 */
    if ((S.cur.points || 0) < f.cost) return  getProxied({ ok: false, msg: `◉ 点数不足（需要 ${f.cost}）` });
    addCur('points', -f.cost);
    S.fabao.own.push(id);
    if (!S.fabao.on) S.fabao.on = id;
    save();
    return  getProxied({ ok: true, msg: `得到法宝「${f.name}」：${f.desc}` });
  }
  function wearFabao(id) {
    if (!S.fabao) S.fabao =  getProxied({ own:  getProxied([]), on: null });
    if (id && !S.fabao.own.includes(id)) return  getProxied({ ok: false, msg: '还没有这件法宝' });
    S.fabao.on = id || null;
    save();
    return  getProxied({ ok: true, msg: id ? `已佩戴「${D.fabaoById(id).name}」` : '已摘下法宝' });
  }
  /* ---------- 法宝祭炼 / 坐骑喂养（V9.6.130）----------
     两条线的共同点：**买/驯服只是起点**，之后还要能一直往里投 —— 不然前期做完就成摆设。 */
  function fabaoLv(id) { return (S.fabao && S.fabao.lvMap && S.fabao.lvMap[id]) || 0; }
  function mountLv(id) { return (S.mount && S.mount.lvMap && S.mount.lvMap[id]) || 0; }
  function refineFabao(id) {
    const f = D.fabaoById(id);
    if (!f) return  getProxied({ ok: false, msg: '没有这件法宝' });
    if (!S.fabao || !S.fabao.own.includes(id)) return  getProxied({ ok: false, msg: '还没有这件法宝' });
    const lv = fabaoLv(id);
    if (lv >= D.FABAO_MAX_LV) return  getProxied({ ok: false, msg: '已经祭炼到顶（' + D.FABAO_MAX_LV + ' 级）' });
    const c = D.fabaoRefineCost(f, lv);
    if ((S.cur.otherworld || 0) < c.otherworld) return  getProxied({ ok: false, msg: `◆ 异界结晶不足（需要 ${c.otherworld}）` });
    if ((S.items[c.mat] || 0) < c.matN) return  getProxied({ ok: false, msg: `${(D.ITEMS[c.mat] ||  getProxied({})).name || c.mat} 不足（需要 ${c.matN}）` });
    addCur('otherworld', -c.otherworld);
    addItem(c.mat, -c.matN);
    if (!S.fabao.lvMap) S.fabao.lvMap =  getProxied({});
    S.fabao.lvMap[id] = lv + 1;
    save();
    return  getProxied({ ok: true, msg: `「${f.name}」祭炼到 ${lv + 1} 级（效果 +${Math.round((lv + 1) * D.FABAO_LV_PCT * 100)}%）` });
  }
  function feedMount(id) {
    const m = D.mountById(id);
    if (!m) return  getProxied({ ok: false, msg: '没有这匹坐骑' });
    if (!S.mount || !S.mount.own.includes(id)) return  getProxied({ ok: false, msg: '还没有这匹坐骑' });
    const lv = mountLv(id);
    const max = D.MOUNT_MAX_LV[m.rarity] || 10;
    if (lv >= max) return  getProxied({ ok: false, msg: `已经喂到顶（${max} 级，${m.rarity} 档上限）` });
    const c = D.mountFeedCost(m, lv);
    if ((S.cur.points || 0) < c.points) return  getProxied({ ok: false, msg: `◉ 点数不足（需要 ${c.points}）` });
    if ((S.items[c.mat] || 0) < c.matN) return  getProxied({ ok: false, msg: `${(D.ITEMS[c.mat] ||  getProxied({})).name || c.mat} 不足（需要 ${c.matN}）` });
    addCur('points', -c.points);
    addItem(c.mat, -c.matN);
    if (!S.mount.lvMap) S.mount.lvMap =  getProxied({});
    S.mount.lvMap[id] = lv + 1;
    save();
    return  getProxied({ ok: true, msg: `「${m.name}」喂养到 ${lv + 1} 级（全属性 +${((lv + 1) * D.MOUNT_LV_PCT * 100).toFixed(1)}%）` });
  }
  /* 法宝效果随祭炼等级放大：每级 +5% 的效果量 */
  function fabaoEffMul(id) { return 1 + fabaoLv(id) * D.FABAO_LV_PCT; }
  /* 坐骑：基础 pct + 等级给的"全属性"加成 */
  function mountBonusPct(id) {
    const m = D.mountById(id);
    if (!m) return  getProxied({});
    const out = Object.assign( getProxied({}), m.pct);
    /* ⚠️ allPct 只有"血统加成"那条路会展开（见 effectiveStats 里的 bl.allPct）——
       坐骑这条线必须在这里自己展开成四条百分比，否则喂养了却不涨属性（尺子当场抓到过）。 */
    const add = mountLv(id) * D.MOUNT_LV_PCT;
    if (add)  getProxied(['atkPct', 'hpPct', 'defPct', 'spdPct']).forEach((k) => { out[k] = (out[k] || 0) + add; });
    return out;
  }

  // 法宝效果：数值类进 pct，战斗额外类进 extra（与转生天赋的额外字段同一处）
  function applyFabao(pct, extra) {
    const f = (S.fabao && S.fabao.on) ? D.fabaoById(S.fabao.on) : null;
    if (!f) return;
    const mul = fabaoEffMul(f.id);          // V9.6.130：祭炼等级越高，效果越强
    Object.entries(f.eff).forEach(([k, v0]) => { const v = v0 * mul;
      if (k === 'dmgReduce' || k === 'initEnergy') { extra[k] = (extra[k] || 0) + v; return; }
      pct[k] = (pct[k] || 0) + v;
    });
  }
  // 触发时的定时器入口（在线挂机每秒调用）
  function travelTick(dtSec) { travelAccrue(dtSec); }

  /* ================= 坐骑（对标《道友修仙》的坐骑） =================
     法宝给"效果"、坐骑给"基础数值"：驯服一匹全队（含主角）永久加成，随时能换乘。 */
  function mountState() {
    if (!S.mount) S.mount =  getProxied({ own:  getProxied([]), on: null });
    return  getProxied({
      own: S.mount.own.slice(), on: S.mount.on,
      list: D.MOUNTS.map(m => Object.assign( getProxied({}), m,  getProxied({ owned: S.mount.own.includes(m.id), active: S.mount.on === m.id, lv: mountLv(m.id), maxLv: D.MOUNT_MAX_LV[m.rarity] || 10 }))),
    });
  }
  function buyMount(id) {
    const m = D.mountById(id);
    if (!m) return  getProxied({ ok: false, msg: '没有这匹坐骑' });
    if (!S.mount) S.mount =  getProxied({ own:  getProxied([]), on: null });
    if (S.mount.own.includes(id)) return  getProxied({ ok: false, msg: `已经有「${m.name}」了` });
    // 货币部分走 canAfford / spend，材料部分走背包（两者口径分开，报错能指明缺哪一样）
    const curCost = Object.assign( getProxied({}), m.cost);
    delete curCost.mat; delete curCost.matN;
    if (!canAfford(curCost)) {
      const lack = Object.entries(curCost).filter(([k, v]) => (S.cur[k] || 0) < v)
        .map(([k, v]) => `${curMeta(k).name} ${fmtNum(v)}`).join(' + ');
      return  getProxied({ ok: false, msg: `货币不足：需要 ${lack}` });
    }
    if (m.cost.mat && (S.items[m.cost.mat] || 0) < m.cost.matN) {
      return  getProxied({ ok: false, msg: `${(D.ITEMS[m.cost.mat] ||  getProxied({})).name || m.cost.mat}不足（需要 ${m.cost.matN}，现有 ${S.items[m.cost.mat] || 0}）` });
    }
    spend(curCost);
    if (m.cost.mat) removeItem(m.cost.mat, m.cost.matN);
    S.mount.own.push(id);
    if (!S.mount.on) S.mount.on = id;
    save();
    return  getProxied({ ok: true, msg: `驯服了坐骑「${m.name}」：${m.desc}` });
  }
  function wearMount(id) {
    if (!S.mount) S.mount =  getProxied({ own:  getProxied([]), on: null });
    if (id && !S.mount.own.includes(id)) return  getProxied({ ok: false, msg: '还没有这匹坐骑' });
    S.mount.on = id || null;
    save();
    return  getProxied({ ok: true, msg: id ? `已乘骑「${D.mountById(id).name}」` : '已下坐骑' });
  }
  // 坐骑加成：全队（含主角）通用，所以在两条属性计算路径里都要调用
  function applyMount(pct) {
    const m = (S.mount && S.mount.on) ? D.mountById(S.mount.on) : null;
    if (!m) return;
    const bonus = mountBonusPct(m.id);      // V9.6.130：喂养等级给的"全属性"也算进来
    Object.entries(bonus).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
  }

  /* ================= 点灯（原「求签」，对标《道友修仙》的 SignItem） =================
     每天免费点亮一次灯芯：灯焰分五档，给当天的挂机加成 + 一点硬通货。
     它解决的是"每天上线第一件事点哪里"——先点灯，再看今天要干嘛。
     V1.0.1 改壳（创意总监 H1）：对外一律叫"点灯"，函数名与字段名（drawSign / signState /
     S.sign）**一个都没改** —— 它们不进玩家眼睛，改它们等于白担一次存档风险。 */
  function signState() {
    if (!S.sign) S.sign =  getProxied({ date: '', tier: '', idlePct: 0, drawn: 0 });
    const today = dailyDate();
    const fresh = S.sign.date === today;
    return  getProxied({
      fresh, drawn: S.sign.drawn || 0,
      tier: fresh ? S.sign.tier : '', idlePct: fresh ? (S.sign.idlePct || 0) : 0,
      pick: fresh ? (D.SIGNS.find(s => s.tier === S.sign.tier) || null) : null,
      canDraw: !fresh,
      total: (S.stats && S.stats.signs) || 0,
    });
  }
  function drawSign() {
    const st = signState();
    if (!st.canDraw) return  getProxied({ ok: false, msg: '今天的灯已经点过了，明天再来' });
    const s = D.rollSign();
    S.sign =  getProxied({ date: dailyDate(), tier: s.tier, idlePct: s.idlePct, drawn: (S.sign.drawn || 0) + 1 });
    S.stats.signDraws = (S.stats.signDraws || 0) + 1;   // 主线「点灯」用（drawn 只记今天）
    applyRewardObj(s.gain);
    S.stats.signs = (S.stats.signs || 0) + 1;
    task('sign1', 1);           // 每日任务：点灯 1 次
    save();
    return  getProxied({ ok: true, sign: s, msg: `点亮【${s.tier}】：${s.text}` });
  }
  // 今日灯焰的挂机加成：只加成当天，隔天自动失效（按日期判定，不做定时器）
  function signIdleMult() {
    if (!S.sign || S.sign.date !== dailyDate()) return 1;
    return 1 + (S.sign.idlePct || 0);
  }

  /* ================= 世界进度 ================= */
  function unlockWorld(id) {
    /* V9.6.76（父亲大人："中后期合理关是可以的，不然还没转生或一次转生就通关了，就不好玩了"）：
       最后几个世界**要求转生次数**才开 —— 满配但不转生也进不去。
       这样"转生"才是通关路上真正的一环，而不是可有可无的彩蛋。 */
    const w = D.WORLDS.find(x => x.id === id);
    if (w && w.reincarn && (S.player.reincarnations || 0) < w.reincarn) return;   // 条件没到：保持锁着
    if (!S.worlds[id]) {
      S.worlds[id] =  getProxied({ unlocked: true, stages:  getProxied({ normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) }) });
    } else if (!S.worlds[id].unlocked) {
      S.worlds[id].unlocked = true;
    }
  }
  /* 这个世界的转生门槛（0 = 没门槛）；界面用它显示"需要转生 N 次" */
  function worldReincarnNeed(id) {
    const w = D.WORLDS.find(x => x.id === id);
    return (w && w.reincarn) || 0;
  }
  function worldCleared(id, diff) {
    const w = S.worlds[id];
    return w && w.stages[diff].every(s => s > 0);
  }
  function stageComplete(worldId, diff, stageIdx, stars) {
    unlockWorld(worldId);
    const w = S.worlds[worldId];
    const first = w.stages[diff][stageIdx] === 0;
    w.stages[diff][stageIdx] = Math.max(w.stages[diff][stageIdx], stars);
    let firstClearReward = null;
    if (stageIdx === 11 && w.stages[diff].every(s => s > 0)) {
      // 全难度通关 → 解锁下一世界 / 下一难度提示
      const wi = D.WORLDS.findIndex(x => x.id === worldId);
      if (diff === 'normal' && wi < D.WORLDS.length - 1) unlockWorld(D.WORLDS[wi + 1].id);
      // ⚠️ 通关奖励只能领一次：之前这里缺了"第一次"判断，
      // 重复刷已满进度的第 12 关会一次次重发（等于无限刷高级货币），V9.2 修。
      const fcKey = worldId + '_' + diff;
      /* V1.1.9（续13 · P0-4）：顺手把"历史最高通关世界"抬上去（挂机基数按它算，转生不清）。
         只涨不跌 —— 所以用 max，直接赋值会在"转生后重打前几个世界"时把进度档打回去。 */
      S.player.bestWorldIdx = Math.max(S.player.bestWorldIdx || 0, wi);
      if (!S.worldFirstClear[fcKey]) {
        S.worldFirstClear[fcKey] = true;
        firstClearReward = D.FIRST_CLEAR[diff];
        Object.entries(firstClearReward).forEach(([k, v]) => addCur(k, v));
      }
    }
    /* F5 #7：通关计数走**唯一出口**（手动通关与扫荡共用，见 registerStageClear）。 */
    registerStageClear();
    // 灯阁评级经验：打关卡就涨，首通给全额，重复刷给一半（对标"宗门等级随进度涨"）
    const sectGain = Math.round((D.SECT_EXP[diff] || D.SECT_EXP.normal) * (first ? 1 : 0.5));
    const sectUp = addSectExp(sectGain);
    const newUnlocks = refreshUnlocks();
    save();
    return  getProxied({ first, firstClearReward, newUnlocks, sectGain, sectUp });
  }
  // 根据当前进度刷新功能解锁，返回本次新解锁的功能名列表
  function refreshUnlocks() {
    const newly =  getProxied([]);
    D.UNLOCKS.forEach(u => {
      if (S.unlocks[u.id]) return;
      const w = S.worlds[u.world];
      if (w && w.stages.normal[u.stage - 1] > 0) {
        S.unlocks[u.id] = true;
        newly.push(u.name);
      }
    });
    return newly;
  }
  function isUnlocked(id) {
    if (S.unlocks[id]) return true;
    return false;
  }
  function unlockTip(id) {
    const u = D.UNLOCKS.find(x => x.id === id);
    return u ? u.tip : '';
  }
  /* ================= 主线任务 ================= */
  function mainQuestState() {
    return D.MAIN_QUESTS.map(q => ( getProxied({
      q,
      done: q.check(S),
      claimed: S.quests.claimed.includes(q.id),
    })));
  }
  function currentQuest() {
    const list = mainQuestState();
    return list.find(x => !x.claimed) || null;
  }
  function claimQuest(id) {
    const q = D.MAIN_QUESTS.find(x => x.id === id);
    if (!q || S.quests.claimed.includes(id)) return  getProxied({ ok: false });
    if (!q.check(S)) return  getProxied({ ok: false, msg: '尚未完成' });
    S.quests.claimed.push(id);
    applyRewardObj(q.reward);
    // 任务上写的 unlock 是真的会发出去的（之前只写在表里没人执行，等于装饰）。
    // 返回"这次真正解锁了哪几个"，界面照着弹——避免弹的是隔壁那个任务的内容。
    const unlocked =  getProxied([]);
    String(q.unlock || '').split(',').filter(Boolean).forEach(uid => {
      if (S.unlocks[uid]) return;
      S.unlocks[uid] = true;
      const u = D.UNLOCKS.find(x => x.id === uid);
      if (u) unlocked.push(u.name);
    });
    save();
    return  getProxied({ ok: true, unlocked });
  }
  function stageUnlocked(worldId, diff, stageIdx) {
    const w = S.worlds[worldId];
    if (!w || !w.unlocked) return false;
    if (diff === 'hard' && !worldCleared(worldId, 'normal')) return false;
    if (diff === 'hell' && !worldCleared(worldId, 'hard')) return false;
    if (stageIdx === 0) return true;
    return w.stages[diff][stageIdx - 1] > 0;
  }

  /* ================= 商店 ================= */
  // 商品解锁条件：req.world 需要先通关该世界（普通难度）——高阶材料/经验模块按进度上架
  function shopReq(it) {
    if (!it || !it.req || !it.req.world) return  getProxied({ ok: true });
    const w = it.req.world;
    if (worldCleared(w, 'normal')) return  getProxied({ ok: true });
    const wd = D.WORLDS.find(x => x.id === w);
    return  getProxied({ ok: false, req: `通关 ${wd ? wd.name : w}·普通` });
  }
  /* ================= V1.1.15（2026-09-27 · 父亲大人："最多一次买 100 个，
     然后要自动算身上的货币最多买几个"）=================
     **这一行商品、按你身上的钱最多能买几个** —— 四道上限一起卡，取最小的那个：
       ① 钱（单价 × N ≤ 现有货币）；② 今日库存（stock − 已买）；③ 背包放不放得下
       （按 `count × N` 判，含"单格 100 上限、超了要占第二格"那条）；④ **单次上限 100**。
     界面那颗「买满」就是读它 —— 玩家不用自己心算"我这点钱能买几个"。 */
  function shopMaxQty(shopId, idx) {
    const shop = D.SHOPS[shopId];
    const it = shop && shop.items[idx];
    if (!it) return 0;
    const avail = shopReq(it);
    if (!avail.ok) return 0;
    const key = shopId + '_' + idx + '_' + dailyDate();
    const bought0 = S.shop.bought[key] || 0;
    const unit = it.count || 1;
    let cap = 100;                                                            // ④ 单次上限
    if (it.stock > 0) cap = Math.min(cap, Math.max(0, it.stock - bought0));   // ② 库存
    cap = Math.min(cap, Math.floor((S.cur[shop.currency] || 0) / Math.max(1, it.price)));   // ① 钱
    if (it.item) {                                                            // ③ 背包
      let k = cap;
      while (k > 1 && !canAddItem(it.item, unit * k)) k--;
      cap = (cap > 0 && !canAddItem(it.item, unit)) ? 0 : k;
    }
    return Math.max(0, cap);
  }
  function buyShopItem(shopId, idx, qty) {
    const shop = D.SHOPS[shopId];
    const it = shop.items[idx];
    if (!it) return  getProxied({ ok: false, msg: '商品不存在' });
    const avail = shopReq(it);
    if (!avail.ok) return  getProxied({ ok: false, msg: `🔒 ${avail.req} 后解锁` });
    /* ================= V1.1.15（2026-09-27 · 父亲大人："购物加多个购买数量"）=================
       一次买 N 个（`qty` 省略＝1 ⇒ 老调用点零改动、行为一模一样）。三道上限一起卡，
       谁的额度先到就报谁，别让玩家"点了没反应"：
         ① 今日库存（`stock` − 已买）；② 钱够不够（价 × N）；③ 背包放不放得下（`count` × N）。
       ⚠️ 不走"自动缩量"：买 10 个只放得下 6 个时**直接报错并说清还差多少**，
          比"悄悄买 6 个"清楚（这条与本项目"宁可少收也不吞"同源：要么按你要的买成，要么明说）。 */
    /* `qty`：省略/1 = 买 1 个；0 或 'max' = **按"钱最多能买几个"自动算**；上限 100。
       要的比 100 多 → 就按 100 买，并在回执里说清（不静默改数）。 */
    let capped = false;
    let n;
    if (qty === 0 || qty === 'max') {
      n = shopMaxQty(shopId, idx);
      if (n <= 0) return  getProxied({ ok: false, msg: '买不了：钱不够 / 今日售罄 / 背包放不下' });
    } else {
      n = Math.max(1, Math.floor(qty || 1));
      if (n > 100) { n = 100; capped = true; }
    }
    const key = shopId + '_' + idx + '_' + dailyDate();
    const bought0 = S.shop.bought[key] || 0;
    if (it.stock > 0 && bought0 + n > it.stock) {
      const left = Math.max(0, it.stock - bought0);
      return  getProxied({ ok: false, msg: left ? `今日只还剩 ${left} 个（你要买 ${n} 个）` : '今日已售罄' });
    }
    // 背包满时先拦下来，避免"钱扣了、道具没进包"
    const unit = it.count || 1;
    if (it.item && !canAddItem(it.item, unit * n)) return  getProxied({ ok: false, msg: `背包放不下 ×${n}，先扩容或分解装备` });
    const cost = it.price * n;
    if (!spend( getProxied({ [shop.currency]: cost }))) return  getProxied({ ok: false, msg: n > 1 ? `货币不足（×${n} 需 ${cost}）` : '货币不足' });
    S.shop.bought[key] = bought0 + n;
    if (it.item && !addItem(it.item, unit * n)) {
      addCur(shop.currency, cost);                // 兜底退款，双保险
      return  getProxied({ ok: false, msg: '背包已满，已退还货币' });
    }
    if (it.currencyGain) Object.entries(it.currencyGain).forEach(([k, v]) => addCur(k, v * n));
    if (it.shardRandom) for (let q = 0; q < n; q++) {
      const c = pickCharOfRarity(it.shardRandom, 'normal');
      /* V1.1.14（0927-F）：买到的碎片也按新规矩走 —— 进**他**那份；他已经满星才转通用池。
         toast 要说清进的是哪一边（否则玩家会以为"我买的是通用碎片"。） */
      const ch0 = S.chars[c.id];
      it._lastPool = !!(ch0 && (ch0.star || 1) >= (D.RARITY_MAXSTAR[c.rarity] || 6));
      addShards(c.id, it.shardCount);
      it._lastShard = c.name;
      it._lastRarity = c.rarity;
    }
    save();
    return  getProxied({ ok: true, qty: n, msg: '购买成功' + (n > 1 ? (' ×' + n) : '') + (capped ? '（单次上限 100）' : '') + (it._lastShard
      ? (it._lastPool ? `（${it._lastShard} 已满星 → ${it._lastRarity} 通用碎片 +${it.shardCount}）` : `（${it._lastShard} 碎片 +${it.shardCount}）`)
      : '') });
  }
  function openBox(itemId) {
    const item = D.ITEMS[itemId];
    if (!item || item.type !== 'box') return  getProxied({ ok: false, msg: '不是宝箱' });
    if (!removeItem(itemId)) return  getProxied({ ok: false, msg: '没有该宝箱' });
    /* V1.1.4（A12 材料包）：三档材料包走**同一个开箱入口**（两端的"开启"按钮都调 openBoxes），
       所以在这里分岔。开出表只有一处（`D.MAT_PACKS`），这里只管摇与入库。 */
    if (item.matPack) return openMatPack(item.matPack);
    // UR 箱：10% 开出伙伴专属装备（UR · 本命 36 件，见 data.js 的 SIGNATURE_EQUIPS）
    if (item.rarity === 'UR' && Math.random() < 0.10) {
      /* 2026-09-27（父亲大人要的"收集感"）：36 件里**优先给还没拥有过的那件**，
         全拿到之后转 ◆ 折现（不再硬塞重复件）。挑件这一句在数据层（`D.pickSignatureEquip`），
         `grantSignatureEquip` 仍然是"给我第几件、就发第几件"的笨函数。 */
      const sigId = D.pickSignatureEquip((S.codex && S.codex.equipNames) ||  getProxied([]));
      if (sigId < 0) {
        addCur('otherworld', D.DECOMPOSE_GAIN.UR);
        save();
        return  getProxied({ ok: true, sold: true, gain: D.DECOMPOSE_GAIN.UR, allSignature: true });
      }
      const sigRes = grantSignatureEquip(sigId);
      save();
      if (sigRes.equip) return  getProxied({ ok: true, equip: sigRes.equip, signature: true });
      if (sigRes.sold) return  getProxied({ ok: true, sold: true, gain: sigRes.gain || 0 });
    }
    /* V9.6.79（自审抓到的坑）：这里原来固定从**前三个世界**里抽一个当装备档位 ——
       于是后期花 2000 异界结晶买的 UR 箱，开出来的武器攻击只有 84~164，
       **还不如第 10 张图的白装（222）**。箱子越买越亏，等于把"高阶货币出口"做成了废品回收站。
       现在按"你打到哪"给档位（见 boxSourceWorld）。 */
    const worldId = boxSourceWorld();
    let rarity = item.rarity;
    if (item.mythBox) rarity = Math.random() < 0.15 ? 'MYTH' : 'UR';   // 保底传说、小概率神话
    /* V9.6.80（父亲大人："箱子开出来的世界套装以开箱时的当前进度为准，比如你 20 就开 20 的套装"）：
       ① 档位 = 当前进度那张图（见 boxSourceWorld）；
       ② 而且**主要出那张图的世界套装**（原来跟野外掉落同一套随机：60% 世界套装 / 40% 血统套装，
          开箱的人往往就是冲着"这一段的套装"去的，所以箱子给到 80%）。 */
    const res = grantEquip(worldId, rarity, undefined,  getProxied({ preferWorldSet: true }));
    save();
    /* V1.1.15：装备格满时装备进**装备待领箱**（不再折现）——带 stashed 让界面说清"去哪领" */
    return  getProxied({ ok: true, equip: res.equip, stashed: !!res.stashed, eq: res.eq || null,
      sold: res.sold, gain: res.gain || 0, bagFull: !!res.bagFull });
  }
  /* 开箱按"你打到哪"给档位 = **已解锁的最高世界**（父亲大人："以开箱时的当前进度为准"）。
     注意是"已解锁"而不是"已通关"：走到第 20 张图里、哪怕还没打完，箱子也该开 20 的货。
     新号还没解锁第二张图时给 W01，不会开出超前的东西。 */
  function boxSourceWorld() {
    let unlocked = null;
    D.WORLDS.forEach(w => {
      const st = S.worlds[w.id];
      if (!st || !st.unlocked) return;
      unlocked = w;
    });
    return (unlocked || D.WORLDS[0]).id;
  }
  // 批量开箱：逐个结算并汇总
  /* ================= V1.1.4（A12 材料包 · 开箱）=================
     一个箱子 = 按权重池摇 `draws` 次，每次出一种材料（《收口2》§3.2：3 / 4 / 5 块）。
     两条纪律：① **装不下就进待领箱**（箱子已经被吃掉了，东西不能凭空消失 —— 这是本项目的
     "宁可少收也不吞"口径）；② 返回的 `pack` 是"拿到了哪些 id"的清单，界面据此报出具体名字。 */
  function openMatPack(kind) {
    const pack = (D.MAT_PACKS ||  getProxied({}))[kind] || (D.MAT_PACKS ||  getProxied({})).low;
    if (!pack) return  getProxied({ ok: false, msg: '没有这种材料包' });
    const total = pack.pool.reduce((a, p) => a + p[1], 0);
    const got =  getProxied([]), stashed =  getProxied([]);
    for (let i = 0; i < pack.draws; i++) {
      let r = Math.random() * total, pick = pack.pool[0][0];
      for (let j = 0; j < pack.pool.length; j++) { r -= pack.pool[j][1]; if (r <= 0) { pick = pack.pool[j][0]; break; } }
      if (addItem(pick, 1)) got.push(pick);
      else { stashItem(pick, 1); stashed.push(pick); }
    }
    save();
    /* 名字与件数合并成一句（连开 10 包时不要把同一件东西念 10 遍）。 */
    const tally = list => {
      const m =  getProxied({});
      list.forEach(id => { m[id] = (m[id] || 0) + 1; });
      return Object.keys(m).map(id => ((D.ITEMS[id] ||  getProxied({})).name || id) + '×' + m[id]).join(' · ');
    };
    const msg = `${pack.name}：${tally(got) || '—'}` + (stashed.length ? `（另有 ${stashed.length} 件装不下，📮 已存待领箱）` : '');
    return  getProxied({ ok: got.length > 0 || stashed.length > 0, pack: got, stashed, msg });
  }
  function openBoxes(itemId, n = 1) {
    const have = S.items[itemId] || 0;
    if (have < 1) return  getProxied({ ok: false, msg: '没有该宝箱' });
    const use = Math.max(1, Math.min(n, have));
    const equips =  getProxied([]);
    let sold = 0, soldGain = 0;
    let eqStashed = 0;                      // 进装备待领箱的件数（V1.1.15）
    /* V1.1.4：材料包开出来的是**材料**（不是装备），单独一列汇总 ——
       否则批量开 10 包之后界面只能说一句"已开启"，玩家不知道自己拿到了什么。 */
    const mats =  getProxied([]);
    let packMsg = '';
    let stopMsg = '';                       // 「装备格满了、箱子没开」那类"提前收工"的原因（要带给玩家看）
    for (let i = 0; i < use; i++) {
      const r = openBox(itemId);
      if (!r.ok) { stopMsg = r.msg || stopMsg; break; }
      if (r.equip) equips.push(r.equip);
      if (r.stashed) eqStashed++;
      if (r.sold) { sold++; soldGain += r.gain || 0; }
      if (r.pack) r.pack.forEach(id => mats.push(id));
      if (r.msg) packMsg = r.msg;
    }
    return  getProxied({ ok: equips.length + sold + mats.length > 0, equips, sold, soldGain, mats,
      /* ⚠️ 原来这里只带 packMsg，**开箱被拒的原因（r.msg）被丢掉了** —— 玩家点了没反应、
         连"格子满了"都不知道。现在把 stopMsg 带出去（界面直接 toast 它）。 */
      msg: packMsg || stopMsg || (eqStashed ? ('装备格已满：' + eqStashed + ' 件装备已存进「📮 待领箱」，扩容后可领回') : undefined),
      eqStashed: eqStashed,
      count: equips.length + sold + mats.length + eqStashed });
  }
  // 每日刷新的"今天是哪天"。**必须用本地日期**：
  // 之前用 toISOString()（UTC），北京时间要等到早上 8 点才翻新，
  // 而周常、免费招募走的是本地时间——同一天里两套钟，界面写着"每天 0 点重置"却对不上（V9.2 修）。
  function dailyDate() {
    const d =  getProxied(new Date());
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  // 每日扫荡上限（灯阁权限越高，次数越多）
  function sweepCap() { return D.SWEEP_DAILY_CAP + authority().sweep; }
  /* V9.5.90（十八度自审）：扫荡的"今天"只留这一处定义。
     原来跨天逻辑被写了三遍（sweepLeft / addSweepBonus / Dun.sweep），而 sweepLeft 那句是
     `return sweepCap() + bonus` —— 跨天时把**昨天的额外额度**算进今天的剩余次数，
     于是界面会显示"今天还能扫 cap+50 次"，玩家点"全部剩余"时实际只能扫 cap 次。
     网页版目前没有任何地方发额外额度（bonus 恒为 0），所以玩家碰不到；但这是"一接活动就露头"的坑，
     而且"同一个规则写三遍"本身就是错的。现在三处都调 ensureSweepDay()。 */
  function ensureSweepDay() {
    /* 跨天归零：三本账一起清（日上限那本不用清，它是常量）—— 含 V1.1.8 加的"广告额度" `adBonus`。 */
    if (S.sweep.date !== dailyDate()) { S.sweep.date = dailyDate(); S.sweep.count = 0; S.sweep.bonus = 0; S.sweep.adBonus = 0; }
  }
  // 今日剩余扫荡次数（跨天自动重置）
  function sweepLeft() {
    ensureSweepDay();
    /* V1.1.8（乙组 B6）：**"广告额度"与"日上限"分开记**（《总落地清单》§1 点名）——
       日上限（`sweepCap()` ＝ 基础 10 ＋ 灯阁权限）与"额外额度"（`bonus`）各是一本账，
       广告买来的 10 次记在**第三本** `adBonus` 上：不挤占日上限、跨天清零、不受权限线影响。 */
    return Math.max(0, sweepCap() + (S.sweep.bonus || 0) + (S.sweep.adBonus || 0) - (S.sweep.count || 0));
  }
  /* 广告买扫荡：+10 次（B6；"3 次/天"由 wx-adapter 的 LIMITS 管，"只对已通关关卡"由界面把关） */
  function addAdSweepBonus(n) {
    ensureSweepDay();
    const k = Math.max(0, Math.floor(n || 0));
    if (!k) return 0;
    S.sweep.adBonus = (S.sweep.adBonus || 0) + k;
    save();
    return S.sweep.adBonus;
  }
  // 今日额外扫荡额度 +n（跨天先归零，避免昨天的额度留到今天）
  function addSweepBonus(n) {
    const k = Math.max(0, Math.floor(n || 0));
    if (!k) return 0;
    ensureSweepDay();
    S.sweep.bonus = (S.sweep.bonus || 0) + k;
    save();
    return S.sweep.bonus;
  }

  /* ================= 任务 / 登录 ================= */
  function ensureDaily() {
    const today = dailyDate();
    actRoll(today);                              // V1.0.4 · W：跨天就把"累计登录天数"记一笔（幂等）
    if (S.tasks.date !== today) {
      if (S.tasks.date) carryOverDailies();        // 跨天：先把昨天"做完没领"的补发掉（见下）
      S.tasks.date = today; S.tasks.daily =  getProxied({}); S.tasks.claimed =  getProxied({}); S.tasks.allClaimed = false;
    }
    ensureWeekly();
  }
  /* ================= V1.0.4 · W：游戏圈活跃任务的三个计数（判据出口只此一处）=================
     父亲大人 09-27「7，可以」；平台侧活动任务来问"达成没"，我们就按这三样答。
     这一块**只记账、不发奖、不显示**，唯一的出口是 `actSnapshot()`（云同步推档时带走）。

     两条防作弊口径（照离线收益那套"防改时间"的思路，派单点名）：
       · **按心跳累加**：`actTick()` 由 game.js 的 1 秒心跳调用，两次心跳之间的间隔
         只认 **0 < dt ≤ 5 秒** —— 玩家把手机时间往前拨（dt 巨大）、往回拨（dt ≤ 0）、
         或者游戏被切到后台（定时器被微信掐住，回来那一跳 dt 远大于 5 秒）都不记账；
       · **每天封顶 8 小时**：`daySec` 记当天已经算过的秒数，到顶就一天都不再涨
         （挂机一整天最多算 8 小时，"在线时长"类任务刷不出花来）。
     跨天那一笔在 `ensureDaily()` 里（全项目唯一的"今天开始了"口子）：
     `day` 记当天日期、`daySec` 归零、`loginDays` ＋1 —— 幂等，同一天进多少次都只算一天。 */
  const ACT_DAY_CAP_SEC = 8 * 3600;      // 一天最多记 8 小时在线
  const ACT_TICK_MAX_SEC = 5;            // 单次心跳最多认 5 秒（防改时间 / 防后台挂机）
  function actRoll(today) {
    if (!S.act) S.act =  getProxied({ day: '', loginDays: 0, playSec: 0, daySec: 0, lastTickAt: 0 });
    if (S.act.day === today) return false;
    /* 从"没有这一天"到"新的这一天"：+1。player 把时间拨到明天再拨回来 = 一天只加一次
       （`day` 已经是明天了，拨回来时 `day !== today` 会再 +1 —— 这条**故意的**：
        宁可多算一天登录，也不让"拨表"把登录天数卡死；而在线秒数那一边是分秒不差的）。 */
    S.act.day = today;
    S.act.loginDays = Math.max(0, Number(S.act.loginDays) || 0) + 1;
    S.act.daySec = 0;
    return true;
  }
  /** 心跳记账（game.js 每秒叫一次）。返回这一次真的记了多少秒（尺子读它）。 */
  function actTick(now) {
    if (!S || !S.act) return 0;
    /* V1.0.4 · X：顺手对一次"挂机银行满了没"（满了就记时刻，云端 `notify` 靠它发服务通知）。
       放在所有提前 return 之前 —— 时钟异常那些分支也不该漏掉这一件事。 */
    try { actBankFullAt(); } catch (e) {}
    const t = Number(now) || Date.now();
    const last = Number(S.act.lastTickAt) || 0;
    S.act.lastTickAt = t;
    if (!last) return 0;                                   // 第一次心跳：只对表，不记账
    const dt = (t - last) / 1000;
    if (!(dt > 0) || dt > ACT_TICK_MAX_SEC) return 0;       // 时钟跳了 / 后台被挂起 → 不记
    const used = Math.max(0, Number(S.act.daySec) || 0);
    if (used >= ACT_DAY_CAP_SEC) return 0;                  // 今天已经记满 8 小时
    const add = Math.min(dt, ACT_DAY_CAP_SEC - used);
    S.act.daySec = used + add;
    S.act.playSec = Math.max(0, Number(S.act.playSec) || 0) + add;
    return add;
  }
  /** **唯一出口**：随档上云的那一小块**明文数字**（全是整数；通关次数复用 `S.stats.runs`）。
      两个消费方各取所需：`gameact` 取前三个（平台判活跃任务），`notify` 取后三个（订阅消息）。
      注意这里**不返回** day / daySec / lastTickAt —— 内部对表字段一个都不往外发。 */
  function actSnapshot() {
    const a = S && S.act ? S.act : {};
    /* V1.0.4 · X（复核时补的一处口径）：满了那一刻报的**两个数**都从现成的 `idleBankGains()` 出来
       （不在这儿重算第二份公式）：
         · `bankAmount` ＝ 这时候收能拿到多少点点；
         · `bankSec`    ＝ **银行里攒了多久**（满的时候就是本档的挂机上限，6～12 小时）。
       ⚠️ 为什么要有 `bankSec`：模板那句话是「离线收益 ＋ 挂机时长」，问的是"你挂了多久、攒了多少"。
          复核时用"满了之后过了多久"填这一格，推出去的是「离线收益 54000 / 挂机时长 1分钟」——
          两个数自相矛盾（挂一分钟攒不出 54000）；而且本档上限带 0.5 小时那种加成，
          正确值正是"2小时30分"这种形状（派单里的例子就是这个形状）。 */
    let g = null;
    try { g = (typeof idleBankGains === 'function') ? idleBankGains() : null; } catch (e) { g = null; }
    const bankAmount = Math.max(0, Math.floor((g && g.points) || 0));
    const bankSec = Math.max(0, Math.floor((g && g.seconds) || 0));
    return {
      loginDays: Math.floor(Math.max(0, Number(a.loginDays) || 0)),
      playMinutes: Math.floor(Math.max(0, Number(a.playSec) || 0) / 60),
      clears: Math.floor(Math.max(0, Number((S && S.stats && S.stats.runs) || 0))),
      /* V1.0.4 · X（订阅消息）：这两个也随档上云 —— 云端 `notify` 靠它们决定发不发服务通知。
         "这一次满发过没有"那一位**根本不在这里**（它是云端写在记录顶层的字段，见文件头那条）。 */
      subMsg: (S && S.settings && S.settings.subMsg === true) ? 1 : 0,
      /* "满的时刻"**只在真的满着**的时候才往外报 —— 判据就是那个唯一的口 `idleFull()`，
         谁也别拿存档里那个可能会过期的数直接当"满"（领走 / 新档 / 任何清空银行的路径之后，
         它还留着上一轮的值；报了它，云端就可能补发一条已经过期的提醒）。 */
      bankFullAt: ((typeof idleFull === 'function' && idleFull()) ? Math.max(0, Math.floor(Number(a.bankFullAt) || 0)) : 0),
      /* 满了那一刻"能收多少 / 挂了多久"（推送里那两个数字）；没满就是 0（见上面那段）。 */
      bankAmount: bankAmount,
      bankSec: bankSec,
    };
  }
  /* 挂机银行**满了**的那一刻（毫秒）；没满返回 0。判据只有一处：`idleFull()`（别自己算）。 */
  function actBankFullAt() {
    if (!S || !S.act) return 0;
    const full = (typeof idleFull === 'function') ? !!idleFull() : false;
    if (!full) { S.act.bankFullAt = 0; return 0; }
    if (!S.act.bankFullAt) S.act.bankFullAt = Date.now();
    return S.act.bankFullAt;
  }
  /** 界面/尺子用的读数（含"今天记了多少"这种只用于排查的字段，**不往云端发**） */
  function actInfo() {
    const a = (S && S.act) || {};
    return {
      day: String(a.day || ''),
      loginDays: Math.floor(Math.max(0, Number(a.loginDays) || 0)),
      playSec: Math.floor(Math.max(0, Number(a.playSec) || 0)),
      todaySec: Math.floor(Math.max(0, Number(a.daySec) || 0)),
      dayCapSec: ACT_DAY_CAP_SEC,
      snap: actSnapshot(),
    };
  }
  /* ================= V1.1.18（N4 · 留存环：跨天不再把"昨天做完没领"的奖励吃掉）=================
     父亲大人拍板「把留存环做了」；策划总监 N 单的 N4：这里跨天那一句原来把 `daily / claimed`
     整个清空 —— 昨天**做完但忘了点「领取」**的那几条，奖励**当场蒸发**。
     这是"惩罚性缺口"：玩家第二天回来发现"我明明做完了却没拿到"，对次日回访是纯负面。
     修法：跨天**之前**先把"已达成且未领"的补发掉，走全项目唯一的发奖入口 `applyRewardObj`
     （货币直接入账、道具走 `addItem`，装不下自动进「📮 待领箱」）—— **不新写第二套设施**，
     也**不弹窗**（不打扰）；玩家该得的东西自己就到账/进箱了。
     ⚠️ 只结清**一份**：`S.tasks.date` 一换就等于结清，不会跨好几天累积补发。
     上限算得死（0929-I 重算）：**核心 8 条**（合计 ◉3,000 ＋ ◆70 ＋ ✦20）
     ＋ **额外 4 条**（额外上限 ◉500 ＋ ◆100 —— `travel1` ◉500、`gard1`/`build1`/`corridor1` 各 ◆30/40/30）
     ＋ 全清那份；占日收入（◉≈39,946 / ◆≈3,600 / ✦≈145）不到 10% —— 不破坏经济。 */
  function carryOverDailies() {
    const list = D.DAILY_TASKS || [];
    const daily = S.tasks.daily || {};
    const claimed = S.tasks.claimed || {};
    let n = 0;
    /* 每一条"做完没领"的都补发 —— **含额外那 4 条**（它们同样是玩家做出来的，一并算清）。 */
    list.forEach(t => {
      if ((daily[t.id] || 0) < t.target) return;
      if (claimed[t.id]) return;                   // 领过的照旧不补
      applyRewardObj(t.reward);
      n++;
    });
    /* 全清那份同理：**核心**那 8 条都做完却忘了点「全部领取」→ 一起补上。
       判据走唯一出口 `dailyCoreDone()`（额外 4 条做没做都不影响全清 —— H 单 §4）。 */
    if (dailyCoreDone() && !S.tasks.allClaimed) { applyRewardObj(D.DAILY_ALL_REWARD); n++; }
    if (n) notice('昨日有 ' + n + ' 项日常奖励已自动补发（已存入待领箱或直接入账）');
    return n;
  }
  // 周一为一周起点；跨周自动清空周常进度
  function weekKey() {
    const d =  getProxied(new Date());
    const day = (d.getDay() + 6) % 7;
    const monday =  getProxied(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day));
    const p = n => String(n).padStart(2, '0');
    return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
  }
  function ensureWeekly() {
    const k = weekKey();
    if (S.tasks.weekKey !== k) {
      S.tasks.weekKey = k; S.tasks.weekly =  getProxied({}); S.tasks.weeklyClaimed =  getProxied({}); S.tasks.weeklyAllClaimed = false;
    }
  }
  // 每日任务的进度同时喂给对应周常（同一套动作，不额外要求玩家改变玩法）
  /* 每日任务 → 周常进度来源的映射（`null` ＝ 这条不进周常）。
     0929-I：斗法台由 `null` 改成 `'arena'`（新增的周常 `w_arena` 就用它；`arenaSettle` 那行一个字没加）；
     新增三条额外日常各自带上自己的 src（`garden` / `corridor`），周常那三条由这里的映射自动喂。 */
  const TASK_SRC =  getProxied({ battle5: 'battle', idle1: 'idle', enhance1: 'enhance', recruit1: 'recruit',
    dungeon1: 'dungeon', item1: 'item', sign1: null, arena1: 'arena',
    gard1: 'garden', build1: null, corridor1: 'corridor', travel1: null });
  function weeklyTick(src, n) {
    if (!src) return;
    ensureWeekly();
    D.WEEKLY_TASKS.forEach(t => { if (t.src === src) S.tasks.weekly[t.id] = (S.tasks.weekly[t.id] || 0) + n; });
  }
  function task(id, n = 1) {
    ensureDaily();
    S.tasks.daily[id] = (S.tasks.daily[id] || 0) + n;
    weeklyTick(TASK_SRC[id], n);
  }
  /* ================= V1.0.4（0929-I）：两档「全清」判据的**唯一出口** =================
     `claimAllTasks()` / `claimAllWeekly()` / `todayState()` / `carryOverDailies()` /
     界面 `allDailyDone`・`allWeeklyDone` / 尺子 —— **全读这里**。

     判据 ＝「**没标 `bonus` 的那些**全做完」：新增的 7 条是「额外任务」，各自独立领，
     **不进全清的门槛**（父亲大人拍的 A 案；全清奖励的数值逐字不动 —— H 单 §4）。
     ⚠️ 判据只此一处：这四处以前各自 `every(...)` 一遍，加了 bonus 之后只要漏改一处
        （最典型的是跨天补发的 `carryOverDailies()`）就会"界面说能领、点下去说没完成"。
     ⚠️ 这两个函数**故意不调 `ensureDaily()`**：`carryOverDailies()` 就是在 `ensureDaily()`
        内部被调用的（那时 `S.tasks.date` 还是昨天），在这里再进一次会自递归。
        调用方该 `ensureDaily()` 的自己先调（现有四个调用点都调了）。 */
  const coreTasksOf = (list) => (list || []).filter(t => !t.bonus);
  function dailyCoreDone() {
    const l = coreTasksOf(D.DAILY_TASKS);
    return l.length > 0 && l.every(t => (S.tasks.daily[t.id] || 0) >= t.target);
  }
  function weeklyCoreDone() {
    const l = coreTasksOf(D.WEEKLY_TASKS);
    return l.length > 0 && l.every(t => (S.tasks.weekly[t.id] || 0) >= t.target);
  }
  /** 这条任务现在还要不要**派发**（不派发 ＝ 界面不画那一行）。判据只此一处；
      `buildingMaxed()` 在建筑那一节（同一条闸门 `upgradeBuilding` 也在用）；
      已完成当天的进度不受影响（`claimTask` 照旧能把它结清，不吞掉已经做出来的东西）。 */
  function taskVisible(id) { return !(id === 'build1' && buildingMaxed()); }
  function weeklyState() {
    ensureWeekly();
    return D.WEEKLY_TASKS.map(t => ( getProxied({
      t, prog: S.tasks.weekly[t.id] || 0, done: (S.tasks.weekly[t.id] || 0) >= t.target, claimed: !!S.tasks.weeklyClaimed[t.id],
    })));
  }
  function claimWeekly(id) {
    ensureWeekly();
    const t = D.WEEKLY_TASKS.find(x => x.id === id);
    if (!t || S.tasks.weeklyClaimed[id]) return  getProxied({ ok: false, msg: '已领取' });
    if ((S.tasks.weekly[id] || 0) < t.target) return  getProxied({ ok: false, msg: '本周还没完成' });
    S.tasks.weeklyClaimed[id] = true;
    applyRewardObj(t.reward);
    save();
    return  getProxied({ ok: true, msg: '周常奖励已领取' });
  }
  function claimAllWeekly() {
    ensureWeekly();
    if (S.tasks.weeklyAllClaimed) return  getProxied({ ok: false, msg: '已领取' });
    if (!weeklyCoreDone()) return  getProxied({ ok: false, msg: '本周任务尚未全部完成' });
    S.tasks.weeklyAllClaimed = true;
    applyRewardObj(D.WEEKLY_ALL_REWARD);
    save();
    return  getProxied({ ok: true, msg: '周常全清奖励已领取' });
  }
  /* ================= 成就 ================= */
  function achievementState() {
    return D.ACHIEVEMENTS.map(a => ( getProxied({ a, done: !!a.check(S), claimed: !!S.achievements[a.id] })));
  }
  function achievementSummary() {
    const st = achievementState();
    return  getProxied({ total: st.length, claimed: st.filter(x => x.claimed).length, done: st.filter(x => x.done).length, list: st });
  }
  function claimAchievement(id) {
    const a = D.ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return  getProxied({ ok: false, msg: '成就不存在' });
    if (S.achievements[a.id]) return  getProxied({ ok: false, msg: '已领取' });
    if (!a.check(S)) return  getProxied({ ok: false, msg: '尚未达成' });
    S.achievements[a.id] = true;
    applyRewardObj(a.reward);
    save();
    return  getProxied({ ok: true, msg: `🏅 成就达成：${a.name}`, name: a.name });
  }
  function claimTask(id) {
    ensureDaily();
    const t = D.DAILY_TASKS.find(x => x.id === id);
    if (!t || S.tasks.claimed[id]) return  getProxied({ ok: false });
    if ((S.tasks.daily[id] || 0) < t.target) return  getProxied({ ok: false, msg: '未完成' });
    S.tasks.claimed[id] = true;
    S.stats.taskClaims = (S.stats.taskClaims || 0) + 1;   // 主线「领赏」用
    applyRewardObj(t.reward);
    save();
    return  getProxied({ ok: true });
  }
  function claimAllTasks() {
    ensureDaily();
    if (S.tasks.allClaimed) return  getProxied({ ok: false, msg: '已领取' });
    /* 判据＝**核心 8 条**全做完（额外 4 条不进门槛）—— 唯一出口 `dailyCoreDone()`。 */
    if (!dailyCoreDone()) return  getProxied({ ok: false, msg: '尚未完成全部任务' });
    S.tasks.allClaimed = true;
    S.stats.taskClaims = (S.stats.taskClaims || 0) + 1;   // 一键全领也算领过
    applyRewardObj(D.DAILY_ALL_REWARD);
    save();
    return  getProxied({ ok: true });
  }
  function loginReward() {
    const today = dailyDate();
    if (S.login.lastClaim === today) return null;
    S.login.lastClaim = today;
    /* 七天一循环：第 7 天领完后回到第 1 天，而不是永远停在第 7 天重复发 SSR 自选券。
       V1.1.16（0927-Y 数值轮 · 报告 §6-6 N2）：**第 8 天起换一张表**（常规轮）——
       表挂在轮次上（`D.loginTableOf`，全项目唯一一处），第 2 轮起都读常规轮，
       所以"第 8 天"不再掉回首轮那个最薄的格子（落差 4.91× ＝现状水平，见 data.js 那张注释）。 */
    if (S.login.day >= D.loginTableOf(S.login.round || 1).length) { S.login.day = 0; S.login.round = (S.login.round || 1) + 1; }
    S.login.day += 1;
    const tbl = D.loginTableOf(S.login.round || 1);
    const r = tbl[S.login.day - 1];
    applyRewardObj(r);
    save();
    return  getProxied({ day: S.login.day, reward: r, round: S.login.round || 1, cycleDays: tbl.length });
  }
  /* ================= V1.1.18（N5 · 留存环：回归礼）=================
     父亲大人拍板「把留存环做了」；策划总监 N 单的 N5：断了一阵子再回来，给一份"回来的理由"。
     · **不用新判定字段**：`S.login.lastClaim`（已有）与今天差 ≥2 个自然日
       ⇔ 至少有一整天完全没上线（只要上过线，开机那次七日登录就会把 lastClaim 写成当天）。
     · **防重发只用一位**：`S.login.comeback`（记"哪一天发过"）—— 老档由 `migrate` 里那句
       `S.login = Object.assign(def.login, S.login||{})` 自动补空，不动 packSave/unpackSave 五个口子。
     · **发奖走全项目唯一的 `applyRewardObj`**（货币入账、道具入包/进待领箱）。
     · **在开机那一刻就发**（不是等弹窗被点开）：进程被杀在弹窗前也不丢；弹窗只负责"报账"。
     · **必须封顶**：≥7 天与 30 天发的一样 —— 否则等于反向激励"晾一周再回来"。 */
  function dayGapDays(from, to) {
    const a = String(from || '').split('-').map(Number);
    const b = String(to || '').split('-').map(Number);
    if (a.length !== 3 || b.length !== 3 || a.some(isNaN) || b.some(isNaN)) return 0;
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }
  function comebackRewardOf(days) {
    /* 数值（策划总监定的表，折算成"天产量"）：2~3 天 0.83 · 4~6 天 1.87 · ≥7 天 3.37 */
    if (days >= 7) return  getProxied({ points: 100000, otherworld: 1000, holy: 80, item: ['ticket_normal', 'ticket_normal', 'ticket_normal'] });
    if (days >= 4) return  getProxied({ points: 60000, otherworld: 600, holy: 30 });
    return  getProxied({ points: 30000, otherworld: 300 });
  }
  function comebackState() {
    const today = dailyDate();
    if (!S.login || !S.login.lastClaim) return null;       // 新号（还没领过签到）不算回归
    if (S.login.comeback === today) return null;           // 今天已经发过
    const days = dayGapDays(S.login.lastClaim, today);
    if (days < 2) return null;
    return  getProxied({ days: days, reward: comebackRewardOf(days) });
  }
  /* 开机调一次：真发（幂等 —— 当天发过就不再发），返回"发了什么"给弹窗报账 */
  function grantComeback() {
    const st = comebackState();
    if (!st) return null;
    S.login.comeback = dailyDate();
    applyRewardObj(st.reward);
    /* V1.1.20（F1-1）：这一句是**开机**跑的（game.js 在玩家动手之前就调），所以走自动存盘 ——
       它照常落盘，但不许把"谁新听谁的"判据推成"现在"（那不是"玩家在玩"）。 */
    save({ auto: true });
    return  getProxied({ days: st.days, reward: st.reward });
  }
  /* ================= V1.1.8（乙组 B8 · 签到全双倍）=================
     口径（终版 §3.1 第 8 步）：**1 次/天**、**只翻当天那一格**、**不补历史**。
    实现：把当天那一格的奖励**原样再发一份**（走 `applyRewardObj` 同一个入口 → ✦ 与招募券都在里面 ✓），
     用 `S.login.doubledDay` 记住"哪一天翻过"：
       · 同一天再点 → 拒绝（"今天的签到已经翻过倍了"）；
       · 第二天进来 → 新的一天，可以再翻；
       · 昨天没翻的**不补**（只认今天）。 */
  function claimLoginDouble() {
    const today = dailyDate();
    if (!S.login.day) return  getProxied({ ok: false, msg: '今天还没签到' });
    if (S.login.doubledDay === today) return  getProxied({ ok: false, msg: '今天的签到已经翻过倍了' });
    /* V1.1.16：翻倍要翻**今天那一格**，所以也得走"轮次 → 表"这同一个出口（别在第二处再读首轮表） */
    const r = D.loginTableOf(S.login.round || 1)[S.login.day - 1];
    if (!r) return  getProxied({ ok: false, msg: '没有可翻倍的签到奖励' });
    S.login.doubledDay = today;
    applyRewardObj(r);
    save();
    return  getProxied({ ok: true, day: S.login.day, reward: r, msg: '签到奖励已翻倍' });
  }

  /* ================= 转生 ================= */
  /* ================= V1.1.8（丙组 B9 · 战斗倍速）=================
     父亲大人的口径（终版 §1.3，他知情选的乙方案）：**免费只剩 1× / 2×**；
     第 3 下 → 看广告 → **30 分钟 ×5**；**不限次数、不计总闸**（纯时间权益，不给资源）。
     落地口径：**`S.settings.speed` 只在广告有效期内为 5**（到期自动回落）——
       所以存两样：`speed`（免费选的那个档，只许 1/2）＋ `speedUntil`（广告窗口的截止毫秒）。
       真正生效的档由 `effSpeed()` 算，**全项目只此一处**（战斗页、以后的任何地方都读它）。
     ⚠️ 老档里可能存着 3 或 5（免费 3× 时代）→ 一律回落成 2（免费档上限就是 2）。 */
  const SPEED_AD_MS = 30 * 60 * 1000;
  function effSpeed() {
    const st = S.settings ||  getProxied({});
    if (st.speedUntil && Date.now() < st.speedUntil) return 5;
    const s = st.speed || 1;
    /* V1.1.9（续12 复核补的）：原来写 `s >= 5 ? 2 : s` —— **只兜住了 5，漏了 3**。
       免费 3× 时代的老档里 `speed:3` 照样生效（按钮显示"2×速度"、实际跑 3×，纯静默错），
       而这段注释本来就写着"老档里可能存着 3 或 5 → 一律回落成 2"。**改成按注释口径收口**：
       免费档只可能是 1 / 2；5 只从上面的 `speedUntil` 分支来。 */
    return s >= 2 ? 2 : 1;
  }
  function grantSpeedAd() {
    if (!S.settings) S.settings =  getProxied({});
    S.settings.speedUntil = Date.now() + SPEED_AD_MS;
    save();
    return S.settings.speedUntil;
  }
  function speedLeftSec() {
    const u = (S.settings ||  getProxied({})).speedUntil || 0;
    return Math.max(0, Math.ceil((u - Date.now()) / 1000));
  }
  /* 这一次转生要什么（V9.6.76：从"三次都要铭刻 5 阶"改成阶梯，见 D.REINCARN_REQS 的说明） */
  function reincarnNeed(count) {
    const list = D.REINCARN_REQS ||  getProxied([]);
    if (!list.length) return  getProxied({ lv: 100, geneLock: 5, core: 30 });
    const i = Math.min(Math.max(0, count === undefined ? (S.player.reincarnations || 0) : count), list.length - 1);
    return list[i];
  }
  function reincarnGap(count) {
    const r = reincarnNeed(count);
    return  getProxied({
      lv: Math.max(0, r.lv - S.player.level),
      geneLock: Math.max(0, r.geneLock - S.player.geneLock),
      core: Math.max(0, r.core - (S.buildings.core || 0)),
    });
  }
  function canReincarnate() {
    const g = reincarnGap();
    return !g.lv && !g.geneLock && !g.core;
  }
  function reincarnate() {
    if (!canReincarnate()) {
      const r = reincarnNeed();
      return  getProxied({ ok: false, msg: `条件未满足（玩家 Lv.${r.lv} + 铭刻 ${r.geneLock} 阶 + 灯芯 Lv.${r.core}）` });
    }
    const n = S.player.reincarnations + 1;
    const rp = Math.floor(100 * Math.pow(n, 1.15));
    S.player.reincarnations = n;
    addCur('rp', rp);
    /* 重置只动"等级"这一条线：等级 / 经验 / 按等级重算的可用点数（六维与技能点）。
       V9.5.78（自审）：这里原来写的是 level = 1 —— 等级改 0 基之后，转生会把玩家"送"到 Lv.1。
       改成回 Lv.0（和新建档同一个起点）。
       另外：技能点不再随重练重复发放（见 addPlayerExp 里"按等级重算"的说明），
       所以转生后一路练回 Lv.100 也不会多出 100 点没处花的技能点。
       ⚠️ 六维**已投入的点数不清**（`attrPointsForLevel()` 只重算"可用点"＝等级应得 − 已投）。 */
    S.player.level = 0; S.player.exp = 0;
    S.player.skillPoints = skillPointsForLevel();
    attrPointsForLevel();                 // V1.0.1：六维点也按等级重算（原来累加，重练会再发一遍）
    /* ================= 2026-09-27（父亲大人深夜拍板）· 转生**不再清残域与深井** =================
       父亲大人的原话：「然后现在转生把世界进度和深井进度都重置了！这么离谱吗」→
       「**深井和世界进度都保留啊**」。所以原来这里那三行"清进度"全部去掉：
         · `S.worlds = {}`         → 保留（已解锁的世界 / 星数 / 三档难度进度全不动）
         · `S.worldFirstClear = {}` → 保留（首通记录保留 ⇒ 重打也不重发首通）
         · `S.corridor.floor = 1`   → 保留（深井停在哪层就还在哪层；`best` 本来就保留）
       ⚠️ 一条**如实记下的代价**（不是 bug，是父亲大人拍的板，两版数在同期回单里）：
         当年 V1.0.1 那三行是一次**收益修正** —— 世界进度清了、首通也跟着重开，转生后重练期间
         靠"重打首通"回一波钱。现在进度与首通都保留 ⇒ **转生不再带来任何"重打首通"的收益**。
       ⚠️ 已经转过生的老档（进度真被清过）由 migrate() 里 `bestWorldIdx` 那一段补偿。 */
    unlockWorld('W01');   // 兜底：万一是空档也保证第一张进得去（正常档早解锁了，这行是无操作）
    save();
    return  getProxied({ ok: true, rp, count: n });
  }
  function buyTalent(branch) {
    const lv = S.player.talents[branch];
    if (lv >= 10) return  getProxied({ ok: false, msg: '已满级' });
    const cost = D.TALENT_COSTS[lv];
    if (S.cur.rp < cost) return  getProxied({ ok: false, msg: `转生点不足（${S.cur.rp}/${cost}）` });
    S.cur.rp -= cost;
    S.player.talents[branch]++;
    save();
    return  getProxied({ ok: true });
  }

  /* ================= 图鉴收集 ================= */
  function codexState() {
    /* V1.1.3（A10 图鉴两卷）：按**卷表**遍历（卷数不写死）。
       2026-09-27（父亲大人："就没有隐藏角色这种概念"）：伙伴卷不再是"只算抽得到的"，
       而是**全体伙伴** —— 那 6 位 UR 已经正常进池，图鉴也就能收满了。 */
    const volumes = D.CODEX_VOLUMES.map(v => {
      const all = v.list();
      const have = (S.codex[v.key] ||  getProxied([])).filter(id => v.id !== 'chars' || D.charById[id]);
      const owned = have.length;
      return  getProxied({
        id: v.id, name: v.name, key: v.key, owned, total: all.length,
        rewards: v.rewards.map(r => ( getProxied({
          n: r.n, reward: r.reward, vol: v.id, volName: v.name,
          reached: owned >= r.n,
          /* 老档的领取记录是**裸数字**（那时只有伙伴卷）→ 这里两种都认，不迁移也不会重复发 */
          claimed: S.codex.claimed.includes(v.id + ':' + r.n) || (v.id === 'chars' && S.codex.claimed.includes(r.n)),
        }))),
      });
    });
    const c0 = volumes[0];
    return  getProxied({
      volumes,
      // 老调用点（首页红点等）读的还是这三个扁平字段 —— 指伙伴卷
      owned: c0.owned, total: c0.total, rewards: c0.rewards,
      claimable: volumes.reduce((a, v) => a + v.rewards.filter(r => r.reached && !r.claimed).length, 0),
    });
  }
  function claimCodexReward(volId, n) {
    /* 老签名兼容：claimCodexReward(20) ＝ 伙伴卷那一档。 */
    if (n === undefined) { n = volId; volId = 'chars'; }
    const vol = D.CODEX_VOLUMES.filter(x => x.id === volId)[0];
    const r = vol && vol.rewards.find(x => x.n === n);
    if (!r) return  getProxied({ ok: false, msg: '奖励不存在' });
    const st = (codexState().volumes.filter(x => x.id === volId)[0]) ||  getProxied({ owned: 0, name: volId });
    if (S.codex.claimed.includes(volId + ':' + n) || (volId === 'chars' && S.codex.claimed.includes(n))) {
      return  getProxied({ ok: false, msg: '已领取' });
    }
    if (st.owned < n) return  getProxied({ ok: false, msg: `还差 ${n - st.owned} 个${st.name}` });
    S.codex.claimed.push(volId + ':' + n);
    applyRewardObj(r.reward);
    save();
    return  getProxied({ ok: true, msg: `灯录奖励已领取（${st.name} ${n} 个）` });
  }

  /* ================= 今日概览 / 收取奖励 ================= */
  // 首页「今日」卡要的三件事：挂机待收、任务进度、免费招募。
  // 全部从存档现算，不额外存字段——这样"卡上写的"和"实际能领的"不可能对不上。
  function todayState() {
    ensureDaily();
    const bank = idleBankGains();
    const daily = D.DAILY_TASKS.map(t => ( getProxied({
      t, prog: S.tasks.daily[t.id] || 0,
      done: (S.tasks.daily[t.id] || 0) >= t.target,
      claimed: !!S.tasks.claimed[t.id],
    })));
    const weekly = weeklyState();
    const dailyClaimable = daily.filter(x => x.done && !x.claimed).length;
    const weeklyClaimable = weekly.filter(x => x.done && !x.claimed).length
      + (weeklyCoreDone() && !S.tasks.weeklyAllClaimed ? 1 : 0);   // 全清那 1 项：判据的唯一出口（额外 3 条不进门槛）
    const achClaimable = achievementState().filter(a => a.done && !a.claimed).length;
    const codexClaimable = codexState().rewards.filter(r => r.reached && !r.claimed).length;
    const idleReady = bank.seconds >= 60;
    return  getProxied({
      idle: bank, idleReady, idleSeconds: bank.seconds,
      dailyDone: daily.filter(x => x.done).length, dailyTotal: daily.length, dailyClaimable,
      weeklyClaimable, achClaimable, codexClaimable,
      freeRecruit: freeRecruitAvailable('normal') || freeRecruitAvailable('advanced'),
      freeRecruitReady: (freeRecruitAvailable('normal') || freeRecruitAvailable('advanced')) && isUnlocked('recruit'),
      signReady: signState().canDraw,          // 今日还没求签 → 首页给个提醒
      claimable: (idleReady ? 1 : 0) + dailyClaimable + weeklyClaimable + achClaimable + codexClaimable,
    });
  }
  // 收取奖励：把"已经达成、躺在那儿等点"的奖励一次全领掉。
  // 不做"帮你花"，只做"帮你收"——收取不会失败，也不会改变任何进度。
  /* ================= V1.1.5（A1 · 一键领取）=================
     父亲大人：「任务那里可以加个**一键领取**的功能，就不用一个个点了」。
     《定调与口径》§2 第 7 条的落法：**不新写第二套**，给这个已有的"一键收"入口加一个 scope：
       · scope = 'all'（默认，首页挂机卡那颗「收取奖励」用）＝ 挂机 ＋ 每日(含全清) ＋ 周常(含全清)
                                                    ＋ 成就 ＋ 图鉴（**与改动前逐字相同**）；
       · scope = 'task'（任务页页头那颗「一键领取」）＝ **悬赏 ＋ 每日(含全清) ＋ 周常(含全清)**，
                                                     **不含挂机、不含主线、不含成就/图鉴**
                                                    （主线必须"一步一领"，这是他这一条的本意）。
     为什么悬赏只进 'task' 不进 'all'：'all' 是首页挂机卡的动作，改它等于顺手改掉另一颗按钮的语义与
     长线模拟的模型（`longrun_sim` 拿它当"一天的收尾"）—— 这一轮只动他点名的那一处。
     差额仍由**前后快照**算（不依赖各领取函数回报数值），所以永远不会漏发/重发。 */
  function claimEverything(scope) {
    ensureDaily();
    const onlyTasks = scope === 'task';
    const beforeCur = Object.assign( getProxied({}), S.cur);
    const beforeItems = Object.assign( getProxied({}), S.items);
    const detail =  getProxied({ idle: null, bounty: 0, tasks: 0, allDaily: false, weekly: 0, allWeekly: false, ach: 0, codex: 0 });
    if (onlyTasks) {
      /* 悬赏是"会过期的东西"，排在每日/周常前面收（《定调与口径》§3.3 的"按到期压力"同一口径）。 */
      const bst = bountyState();
      bst.list.forEach(x => { if (x.done && !x.claimed && !x.expired && claimBounty(x.b.id).ok) detail.bounty++; });
    } else {
      // 先收挂机：挂机本身会推进"领挂机"这条日常，所以必须排在任务之前
      const bank = idleBankGains();
      if (bank.seconds >= 60) detail.idle = claimIdle();
    }
    D.DAILY_TASKS.forEach(t => { if (claimTask(t.id).ok) detail.tasks++; });
    if (claimAllTasks().ok) detail.allDaily = true;
    D.WEEKLY_TASKS.forEach(t => { if (claimWeekly(t.id).ok) detail.weekly++; });
    if (claimAllWeekly().ok) detail.allWeekly = true;
    if (!onlyTasks) {
      D.ACHIEVEMENTS.forEach(a => { if (claimAchievement(a.id).ok) detail.ach++; });
      D.CODEX_REWARDS.forEach(r => { if (claimCodexReward(r.n).ok) detail.codex++; });
    }
    // 差额由"前后快照"算出来，不依赖各领取函数回报数值——永远和账户实际变化一致
    const gains =  getProxied({ cur:  getProxied({}), items:  getProxied({}) });
    Object.keys(S.cur).forEach(k => { const d = (S.cur[k] || 0) - (beforeCur[k] || 0); if (d) gains.cur[k] = d; });
    Object.keys(S.items).forEach(k => { const d = (S.items[k] || 0) - (beforeItems[k] || 0); if (d) gains.items[k] = d; });
    save();
    const total = (detail.idle ? 1 : 0) + detail.bounty + detail.tasks + (detail.allDaily ? 1 : 0)
      + detail.weekly + (detail.allWeekly ? 1 : 0) + detail.ach + detail.codex;
    return  getProxied({ detail, gains, seconds: detail.idle ? detail.idle.seconds : 0, total });
  }
  // 下一关：同难度往后推一格；打完第 12 关顺延到下一难度，难度打完顺延到下一世界
  function nextStage(worldId, diff, stageIdx) {
    if (!S.worlds[worldId] || !S.worlds[worldId].unlocked) return null;
    if (stageIdx + 1 < 12) {
      const r =  getProxied({ worldId, diff, stageIdx: stageIdx + 1 });
      return stageUnlocked(r.worldId, r.diff, r.stageIdx) ? r : null;
    }
    /* V9.6.116（父亲大人："每个世界推到第 12 关就不要有自动下一关了，只能返回，
       由玩家自己选择打下一个世界还是同一世界的下一个难度"）：
       **打完一个世界的第 12 关（守关 Boss）＝这一段路到头了**，别再替他做决定。
       原来这里会自动接到"同世界的下一个难度"、再不然"下一个世界的第 1 关" ——
       等于把"选哪个世界、哪个难度"这件大事替玩家拍了，他连自己解锁了什么都还没看清。
       现在到了最后一关就返回 null：结算页只剩「返回」，玩家回世界列表自己挑。
       （关卡 1~11 的"下一关"完全不受影响。） */
    return null;
  }

  /* ================= 限时悬赏 ================= */
  // 悬赏按当前进度动态生成（D.makeBounties），生成结果存进存档，本期固定不再变。
  // 每条从本期起点开始各算各的截止时间；过期作废，全部结束后可以开新一轮。
  function bountyCheck(b) {
    // V1.0.5：判据搬到 data.js（D.bountyDone）——生成端与这里共用同一份，不再两处各写一套
    return D.bountyDone(S, b);
  }
  function bountyState() {
    if (!Array.isArray(S.bounty.list) || !S.bounty.list.length) S.bounty.list = D.makeBounties(S);
    const now = Date.now();
    const start = (S.bounty && S.bounty.start) || now;
    const claimed = (S.bounty && S.bounty.claimed) ||  getProxied({});
    const list = S.bounty.list.map(b => {
      const deadline = start + b.hours * 3600e3;
      const leftMs = deadline - now;
      return  getProxied({ b, deadline, leftMs, expired: leftMs <= 0, done: bountyCheck(b), claimed: !!claimed[b.id] });
    });
    return  getProxied({
      list, start,
      claimable: list.filter(x => x.done && !x.claimed && !x.expired).length,
      allOver: list.every(x => x.claimed || x.expired),
    });
  }
  function claimBounty(id) {
    const item = bountyState().list.find(x => x.b.id === id);
    if (!item) return  getProxied({ ok: false, msg: '悬赏不存在' });
    if (item.claimed) return  getProxied({ ok: false, msg: '已经领过了' });
    if (item.expired) return  getProxied({ ok: false, msg: '这条悬赏已经过期' });
    if (!item.done) return  getProxied({ ok: false, msg: '目标还没完成' });
    S.bounty.claimed[id] = true;
    applyRewardObj(item.b.reward);
    save();
    return  getProxied({ ok: true, msg: `悬赏达成：${item.b.name}`, reward: item.b.reward, name: item.b.name });
  }
  function renewBounties() {
    if (!bountyState().allOver) return  getProxied({ ok: false, msg: '还有悬赏没结束（没领或没过期）' });
    S.bounty =  getProxied({ start: Date.now(), claimed:  getProxied({}), list: D.makeBounties(S) });
    save();
    return  getProxied({ ok: true, msg: '新一期悬赏已按你的进度刷新' });
  }

  /* ================= 伴生体（第二条养成线） ================= */
  // 上阵 1 只：给全队属性加成 + 一个被动 + 五行克制（进本看世界属性）。
  // 孵化花兽魂石，重复获得转兽魂，兽魂升等级 —— 和角色的"抽卡→碎片→升星"是同一套结构。
  function beastState() {
    const owned = S.beast.owned ||  getProxied({});
    const list = Object.keys(owned).map(id => {
      const b = D.beastById(id);
      if (!b) return null;
      const lv = owned[id].lv || 0;      // V9.5.81：伴生体也是 0 基
      return  getProxied({
        id, b, lv, soul: owned[id].soul || 0,
        active: S.beast.active === id,
        pct: D.beastPctAt(b, lv),
        maxLv: lv >= D.BEAST_MAX_LV,
      });
    }).filter(Boolean).sort((a, b) => D.RARITIES.indexOf(b.b.rarity) - D.RARITIES.indexOf(a.b.rarity) || b.lv - a.lv);
    return  getProxied({
      list, count: list.length,
      active: S.beast.active || null,
      activeBeast: S.beast.active ? D.beastById(S.beast.active) : null,
      eggs: S.items[D.BEAST_EGG_ITEM] || 0,
      eggCost: D.BEAST_EGG_COST,
      canHatch: (S.items[D.BEAST_EGG_ITEM] || 0) >= D.BEAST_EGG_COST,
    });
  }
  // 随行伴生体的属性加成（会被 effectiveStats / effectivePlayerStats / 战斗一起用）
  function beastPct() {
    const id = S.beast.active;
    const owned = id && S.beast.owned[id];
    const b = id ? D.beastById(id) : null;
    if (!owned || !b) return  getProxied({});
    return D.beastPctAt(b, owned.lv || 0);   // V9.5.81：同上
  }
  function activeBeastElem() {
    const b = S.beast.active ? D.beastById(S.beast.active) : null;
    return b ? b.elem : null;
  }
  // 五行克制：我方随行属性克本世界属性 → 伤害 +15%；被反克 → -8%
  function elementMultiplier(worldId) {
    const mine = activeBeastElem();
    const foe = D.worldElement(worldId);
    if (!mine || !foe) return  getProxied({ mine: mine || null, foe: foe || null, mult: 1, state: 'none' });
    /* 0928 抢修单 F5 #2：算式只留一份（`D.elementMult`）—— **战斗公式读的是同一份**
       （`js/battle.js` 的 dealDamage），所以界面这句 "+15% / -8%" 从此与伤害数字同源，
       不再是"界面写一套、战斗写一套（而战斗那套从没跑过）"。 */
    const mult = D.elementMult(mine, foe);
    const state = mult > 1 ? 'up' : mult < 1 ? 'down' : 'even';
    return  getProxied({ mine, foe, mult, state });
  }
  function hatchBeast(n) {
    n = Math.max(1, Math.floor(n || 1));
    const need = D.BEAST_EGG_COST * n;
    const have = S.items[D.BEAST_EGG_ITEM] || 0;
    if (have < need) return  getProxied({ ok: false, msg: `兽魂石不足：孵 ${n} 只要 ${need} 颗（现有 ${have}）` });
    S.items[D.BEAST_EGG_ITEM] -= need;
    if (S.items[D.BEAST_EGG_ITEM] <= 0) delete S.items[D.BEAST_EGG_ITEM];
    const got =  getProxied([]);
    for (let i = 0; i < n; i++) {
      let r = Math.random(), acc = 0, rar = 'N';
      for (const [k, v] of Object.entries(D.BEAST_RARITY_RATE)) { acc += v; if (r <= acc) { rar = k; break; } }
      const pool = D.BEASTS.filter(b => b.rarity === rar);
      const b = pool[Math.floor(Math.random() * pool.length)] || D.BEASTS[0];
      const cur = S.beast.owned[b.id];
      if (cur) {
        cur.soul = (cur.soul || 0) + 2;
        got.push( getProxied({ id: b.id, name: b.name, rarity: b.rarity, elem: b.elem, dup: true, soul: cur.soul }));
      } else {
        S.beast.owned[b.id] =  getProxied({ lv: 0, soul: 0 });   // V9.5.69：伴生体也从 0 级起
        got.push( getProxied({ id: b.id, name: b.name, rarity: b.rarity, elem: b.elem, dup: false }));
      }
    }
    // 第一只自动随行，省一步操作
    if (!S.beast.active && got.length) S.beast.active = got[0].id;
    S.stats.beasts = (S.stats.beasts || 0) + n;
    save();
    return  getProxied({ ok: true, got, count: n, msg: `孵化 ${n} 只伴生体` });
  }
  function setActiveBeast(id) {
    if (id && !S.beast.owned[id]) return  getProxied({ ok: false, msg: '还没有这只伴生体' });
    S.beast.active = id || null;
    save();
    return  getProxied({ ok: true, msg: id ? `${D.beastById(id).name} 已随行` : '已收回伴生体' });
  }
  function beastLevelUp(id) {
    const cur = S.beast.owned[id];
    const b = D.beastById(id);
    if (!cur || !b) return  getProxied({ ok: false, msg: '还没有这只伴生体' });
    if ((cur.lv || 0) >= D.BEAST_MAX_LV) return  getProxied({ ok: false, msg: '已经是满级' });
    const need = D.BEAST_SOUL_PER_LV * ((cur.lv || 0) + 1);
    if ((cur.soul || 0) < need) return  getProxied({ ok: false, msg: `兽魂不足：升到 Lv.${(cur.lv || 0) + 1} 需要 ${need} 兽魂（现有 ${cur.soul || 0}）` });
    cur.soul -= need;
    cur.lv = (cur.lv || 0) + 1;
    save();
    return  getProxied({ ok: true, msg: `${b.name} 升到 Lv.${cur.lv}`, lv: cur.lv });
  }

  /* ================= 境界（渡劫） ================= */
  // 每 10 级一个境界，达标即可渡劫；成功全属性 +5%，失败只扣材料与点数、等级不掉，可以反复挑战。
  function realmState() {
    const realm = S.player.realm || 0;
    const next = D.REALMS[realm] || null;
    const tier = next ? Math.min(5, 1 + Math.floor(next.lv / 20)) : 5;
    const matItem = 'mat_t' + tier;
    return  getProxied({
      realm, next,
      // 境界名跟着血统走：'血将后期' / '筑基初期' …（没选血统时为空，界面上先引导选血统）
      bloodline: S.player.bloodline || null,
      hasBloodline: !!S.player.bloodline,
      curName: D.realmName(S.player.bloodline, Math.min(realm, D.REALM_STAGE_COUNT - 1)),
      nextName: next ? D.realmName(S.player.bloodline, realm + 1) : null,
      bonusPct: realm * D.REALM_PCT,
      levelOk: next ? S.player.level >= next.lv : false,
      matItem, matN: next ? next.cost.matN : 0,
      haveMat: next ? (S.items[matItem] || 0) : 0,
      points: next ? next.cost.points : 0,
      rate: next ? next.rate : 0,
    });
  }
  function realmBonusPct() { return (S.player.realm || 0) * D.REALM_PCT; }
  function attemptRealm() {
    const st = realmState();
    if (!st.hasBloodline) return  getProxied({ ok: false, msg: '先选定命格——境界线跟着命格走，没命格就没有境界' });
    if (!st.next) return  getProxied({ ok: false, msg: '已经到达最终境界' });
    if (!st.levelOk) return  getProxied({ ok: false, msg: `先升到 Lv.${st.next.lv}（当前 Lv.${S.player.level}）` });
    if (st.haveMat < st.matN) {
      return  getProxied({ ok: false, msg: `渡劫材料不足：需要 ${D.ITEMS[st.matItem].name} ×${st.matN}（现有 ${st.haveMat}）` });
    }
    if (!canAfford( getProxied({ points: st.points }))) return  getProxied({ ok: false, msg: `点数不足：需要 ◉ ${fmtNum(st.points)}` });
    // 先扣消耗：失败也扣，这是"天道不收白食"；但等级不掉，所以永远有下一次
    S.items[st.matItem] -= st.matN;
    if (S.items[st.matItem] <= 0) delete S.items[st.matItem];
    spend( getProxied({ points: st.points }));
    const success = Math.random() < st.next.rate;
    if (success) S.player.realm = st.realm + 1;
    save();
    return  getProxied({
      ok: true, success, name: st.nextName, rate: st.next.rate,
      realm: S.player.realm, bonusPct: realmBonusPct(),
      msg: success
        ? `渡劫成功：突破「${st.nextName}」，主角属性永久 +${(D.REALM_PCT * 100).toFixed(1)}%`
        : `渡劫失败：消耗已扣除，但等级不掉，再来一次就好`,
    });
  }

  /* ================= 战斗结算钩子 ================= */
  /* --- 副本进度落盘：刷新 / 切后台被系统回收后可以接着打 ---- */
  function setPendingRun(data) {
    S.pendingRun = data ?  getProxied(JSON.parse(JSON.stringify(data))) : null;
    save();
  }
  function clearPendingRun() { S.pendingRun = null; save(); }
  /* --- 深井印记（由历史最高层派生，不需要额外存档字段） --- */
  const corridorMarks = () => D.corridorMarks(S.corridor.best || 0);
  const corridorMarkBonus = () => D.corridorMarkBonus(S.corridor.best || 0);

  function battleSettle(rewards, won, isBoss) {
    if (won) {
      S.stats.wins++;
      Object.entries(rewards).forEach(([k, v]) => {
        if (k === 'exp') { /* 角色经验在战斗内结算 */ }
        else addCur(k, v);
      });
      /* V9.5.79（自审·长线模拟）：玩法指南一直写着"每打赢一场 +2 评级经验"，
         但代码里**从来没有这一行**（SECT_EXP.win 定义了却没人用）。
         现在补上：所有胜利都算（手动战斗、扫荡、深井、斗法台都走这里）。 */
      addSectExp(D.SECT_EXP.win);
    }
    S.stats.battles++;
    if (isBoss && won) S.stats.bosses++;
    task('battle5', 1);
    save();
  }
  function addCharExp(charIds, exp) {
    // 天赋「灯阁恩赐」的经验加成在这里统一生效（副本 / 深井角色经验）
    // V9.5.46：统一进**共享的伙伴经验池**（charIds 只作兼容参数保留）
    /* V9.5.77（自审·导出函数冒烟）：这里原来不校验参数——万一有人传进来 undefined，
       算出来是 NaN，`S.charExp + NaN` 会把**整个伙伴经验池**变成 NaN 写进存档，
       之后所有升级、重生、经验模块全都废掉（而且很难查）。
       经验池是存档里最值钱的字段之一，值得加一道闸。 */
    const raw = Number(exp);
    const n = Number.isFinite(raw) ? Math.round(raw * graceExpMult()) : 0;
    if (!n) return 0;
    S.charExp = (S.charExp || 0) + n;
    return n;
  }
  /* ================= 0928 抢修单 F5 #7：两条路共用的两个出口 ================= */
  /* ① 通关经验：**角色经验 ×2、战绩（主角战斗经验）×1**（父亲大人 0928 拍板）。
     以前"手打"与"扫荡"各写一份系数（手打 ×2/×1、扫荡 ×1/×0.5），而紧邻的注释还写着
     "经验与战绩必须和手打一致"——纯扫荡党的成长速度只有手打的一半，扫荡又正是官方主推的减负手段。
     现在两支都调这里，系数只此一处。 */
  const STAGE_EXP_CHAR_MULT = 2;      // 角色经验（伙伴经验池）
  const STAGE_EXP_PLAYER_MULT = 1;    // 战绩（主角战斗经验）
  function grantStageExp(exp) {
    const base = Number(exp) || 0;
    if (base <= 0) return  getProxied({ char: 0, player: 0 });
    const charN = addCharExp((S.party ||  getProxied([])).filter(Boolean), base * STAGE_EXP_CHAR_MULT);
    const playerN = Math.round(base * STAGE_EXP_PLAYER_MULT);
    addPlayerBattleExp(playerN);
    return  getProxied({ char: charN || 0, player: playerN });
  }
  /* ② 通关计数：「完成 1 次副本」日常（dungeon1）与「本周通关 10 次副本」周常（w_run，
     由 task 的 TASK_SRC 自动喂）都从这一处走。**只计次数**——首通 / 星级 / 首通奖励
     仍只挂在 `stageComplete` 上，扫荡不许把它们一起带出来。 */
  function registerStageClear(n) {
    const k = Math.max(1, Math.round(n || 1));
    S.stats.runs += k;
    task('dungeon1', k);
  }
  /* ③ 深井推过一层：`registerStageClear()` 的先例 —— **手打与"长线模拟"共用的唯一出口**。
     0929-I 新增的「深井挑战成功 1 次」日常（`corridor1`）与「本周深井推进 10 层」周常
     （`w_corridor`，由 `task` 的 `TASK_SRC['corridor1']='corridor'` 自动喂）都从这一处走。
     `floor` / `best` 的推进也收在这里（"推过一层"就是这么定义的），奖励的发放仍留在调用方
     （界面层要塞结算页、模拟只用记账）。
     ⚠️ **为什么必须落 core**：`longrun_sim.js` 的深井循环**不走界面层**（原来直接改
        `S.corridor` ＋ `addCur`）。打点若留在界面层，尺子里"本周深井"会永远是 0，两套口径当场打架。 */
  function registerCorridorClear(floor) {
    const f = Math.max(1, Math.round(Number(floor)) || (S.corridor.floor || 1));
    S.corridor.best = Math.max(S.corridor.best || 0, f);
    S.corridor.floor = f + 1;
    task('corridor1', 1);
    return f;
  }
  // 战斗获得的玩家经验（同样吃经验天赋）；挂机经验已在 idleRates 里算过，不重复加成
  function addPlayerBattleExp(exp) {
    addPlayerExp(Math.round((exp || 0) * graceExpMult()));
  }

  return  getProxied({
    get S() { return S; },
    save, load, newGame, wipeSave, ensureState, exportSave, importSave, saveSlot, loadSlot, slotInfo, migrate,
    /* V1.1.15（P0 存档）：读档诊断 / 从备份恢复（设置页用） */
    saveDiag, backupInfo, restoreFromBackup, loadIssue,
    /* V1.1.20（F1-5）：读档失败/更高版本 → **救援态**（禁写）＋ 玩家显式"继续新档"才解闸 */
    rescueInfo, rescueConfirmNewGame,
    addCur, canAfford, spend, addItem, removeItem, canAddItem, setCurListener, applyRewardObj, sweepCap, sortEquips, equipScore,
    /* V1.0.5：兑换码 / 新手礼包 —— 全项目唯一的兑换出口（码表在 data.js 的 GIFT_CODES） */
    claimGift,
    shardPoolOf, addShardPool, addShardsToPool, shardsOf, starInfo,
    setNoticeListener, stashItem, stashCount, stashList, stashNeedCells, claimStash,
    /* V1.1.15：装备待领箱（满格时掉的/开出来的装备先存这儿，扩容后领回） */
    stashEquip, stashEqCount, stashEqList, claimStashEq,
    bagUsage, buyBagCap,
    /* F5 #7：扫荡与手打共用的两个出口（通关经验 ×2/×1、通关计数） */
    grantStageExp, registerStageClear, registerCorridorClear,
    tallyCur, addChar, addShards, levelCost, levelUp, useExpItem, swapPartyMember, partnerExp, expSpentOn, rebornChar, starUp, skillUp, SKILL_CHIP_COST,
    craftSerum, craftReforgeStone, useSerum, serumTaken, serumApplied, serumUnlocked, serumUnlockTip,
    bloodlineUpgrade, geneLockInfo, geneLockUnlock,
    equipStats, effectiveStats, power, teamPower, factionBuffs, formationState,
    effectivePlayerStats, playerPower, choosePlayerBloodline, upgradePlayerBloodline,
    allocateAttr, resetAttrs, allocateSkill, resetSkills, protagonistSkills, protagonistList, createProtagonist, switchProtagonist,
    grantEquip, grantSignatureEquip, equipItem, canEquip, unequipItem, enhanceCost, enhance, decompose, decomposeMany, inventoryEquips,
    enhanceQuote, bloodlineQuote,
    toggleEquipLock, autoEquipBest, equipScore, savePreset, applyPreset,
    /* V1.1.8（戊组 A13-F）：重铸石 —— 报价与重铸（界面只调这两个，判据都在这里） */
    reforgeQuote, reforgeEquip, reforgeCost, setAffixLock, affixLocksOf, affixMeanQ,
    unequipEverywhere, equipWearer, dedupeEquips,
    playerRow, setPlayerRow, swapPartySlots, moveMemberRow, rowLayout, ROW_NAME, rowOfSlots, normalizeParty,
    parsePos, posRow, swapPositions,
    recruitOnce, recruitTen, recruitBulk, freeRecruit, freeRecruitAvailable, freeState, ssrTicketUse, ticketOf,
    idleRates, idleBaseRates, idleLines, idleLineBonus, setIdleLeader, idleMatItem, grantIdleMat,
    progressTier, bestWorldIdx,
    settleOffline, onlineTick, idleBankGains, claimIdle, claimIdleDouble, lastIdleClaimOf, addPlayerExp, offlineCapHours, offlineEfficiency, idleFull,
    /* V1.1.8（乙组 B4/B5/B6/B7/B8）：五个广告点位的**逻辑层入口**（界面只管展示与调用，判据都在这里） */
    lastOfflineSettle, claimOfflineDouble, adIdleBoost, addAdSweepBonus, adRecruitAdv, claimLoginDouble,
    /* V1.1.18（N5 · 留存环）：回归礼（开机发一次，弹窗只报账） */
    comebackState, grantComeback, comebackRewardOf, dayGapDays,
    /* V1.1.8（丙组 B9）：倍速的**唯一口径入口**（免费 1/2 ＋ 广告窗口内的 5） */
    effSpeed, grantSpeedAd, speedLeftSec, SPEED_AD_MS,
    upgradeBuilding, authority, authorityInfo, upgradeAuthority, authorityReqMet,
    sectInfo, sectBonusPct, addSectExp,
    kejiLv, kejiCostOf, kejiBonus, kejiUp,
    travelAccrue, travelTick, travelProgress, travelEverySec, pendingTravel, claimTravel, rollTravel, rewardTextOf,
    gardenState, gardenPlots, gardenNextPrice, gardenOdds, buyGardenPlot, plantGarden, harvestGarden, harvestAllGarden,
    arenaState, arenaSettle, fabaoState, buyFabao, wearFabao, refineFabao, fabaoLv, fabaoEffMul, feedMount, mountLv, mountBonusPct,
    mountState, buyMount, wearMount, applyMount,
    signState, drawSign, signIdleMult,
    unlockWorld, worldCleared, stageComplete, stageUnlocked,
    refreshUnlocks, isUnlocked, unlockTip, skillPointsForLevel,
    mainQuestState, currentQuest, claimQuest,
    setPlayerName, charName,
    /* V1.0.4 · V：自由命名的判据出口（界面层只读这几个，不自己再写一套）
       —— `shapeName` 成型、`isListName` 是否在可自证的白名单里、
       `grantNameTicket` 机审通过后签发那张一次性凭据。 */
    shapeName, isListName, grantNameTicket,
    buyShopItem, shopMaxQty, openBox, openBoxes, openMatPack, boxSourceWorld, dailyDate, sweepLeft, enhanceMat,
    addSweepBonus, ensureSweepDay,
    shopReq,
    ensureDaily, task, claimTask, claimAllTasks, loginReward, ensureSweepDay,
    /* 0929-I：两档「全清」判据的唯一出口（界面 / 尺子都读它，别再各自 every 一遍）
       ＋ 建筑满级「不留死条」的闸门 */
    dailyCoreDone, weeklyCoreDone, buildingMaxed, taskVisible,
    /* V1.0.4 · W（游戏圈活跃任务）：三个计数的唯一出口 —— 心跳记账 / 读数 / 快照 */
    actTick, actSnapshot, actInfo, actBankFullAt,
    ensureWeekly, weeklyState, claimWeekly, claimAllWeekly, weekKey,
    achievementState, achievementSummary, claimAchievement,
    todayState, claimEverything, nextStage,
    bountyState, claimBounty, renewBounties, realmState, realmBonusPct, attemptRealm, realmChainOf, pityView, pityOf,
    beastState, hatchBeast, setActiveBeast, beastLevelUp, beastPct, activeBeastElem, elementMultiplier,
    setPendingRun, clearPendingRun, corridorMarks, corridorMarkBonus, worldReincarnNeed,
    canReincarnate, reincarnate, reincarnNeed, reincarnGap, buyTalent,
    codexState, claimCodexReward,
    battleSettle, addCharExp, addPlayerBattleExp, graceExpMult, graceDropMult, graceIdleMult, talentAll,
  });
})();
