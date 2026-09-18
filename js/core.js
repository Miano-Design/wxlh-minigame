/* 《残域》核心逻辑：状态 / 存档 / 挂机 / 养成 / 经济 */
window.Core = (function () {
  const D = window.DATA;
  const SAVE_KEY = 'wxlh_save_v5';
  const SLOT_COUNT = 3;
  const slotKey = n => `${SAVE_KEY}_slot${n}`;
  let S = null;
  let uidCounter = 1;
  // 核心层自己也要给文案用（挂机产线、渡劫消耗），格式与界面保持一致
  function fmtNum(n) {
    n = Math.floor(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(n);
  }

  /* ================= 存档 ================= */
  const ATTR_ZERO = () => ({ muscle: 0, immune: 0, cell: 0, nerve: 0, intelligence: 0, spirit: 0 });
  // row：主角站前排还是后排（V8.3 新增）。默认前排——和旧存档的战场表现一致。
  /* V9.5.69（父亲大人）：**所有等级从 0 起算**——数字就是"已经升过几次"。
     主角 Lv.0 / 技能 Lv.0 / 建筑 0 级 / 评级 Lv.0 / 伴生体 0 级（血统、铭刻、境界、权限本来就是 0 起）。 */
  function freshProtagonist(name) {
    return { name: name || '', level: 0, exp: 0, bloodline: null, bloodlineLv: 0, attrPoints: 0, attrs: ATTR_ZERO(), skillPoints: 0, skillLv: [0, 0, 0], row: 'front' };
  }
  function defaultState() {
    return {
      v: 5,
      createdAt: Date.now(),
      player: Object.assign(freshProtagonist('执灯者'), { geneLock: 0, reincarnations: 0, talents: { body: 0, energy: 0, nerve: 0, grace: 0 } }),
      altPlayers: [],         // 新建的主角（体验不同血统），与当前主角可切换
      // V9.2：背包分三池（道具 / 材料 / 装备），各 50 格起、各自扩容
      bag: { itemCap: 50, itemExpands: 0, matCap: 50, matExpands: 0, eqCap: 50, eqExpands: 0 },
      cur: { points: 0, story: 0, otherworld: 0, holy: 0, skillChip: 0, bloodCrystal: 0, corridor: 0, rp: 0 },
      chars: {},            // id → {lv, exp, star, shards, skillLv:[1,1,1], bloodlineLv}
      // 上阵 5 格（固定前 2 后 3）：0/1 前排，2/3/4 后排。
      // '@player' 就是主角本人——主角必上阵，所以他也占其中一格，站位能拖到前排也能拖到后排。
      party: ['@player', null, null, null, null],
      equips: {},           // uid → 装备实例
      equipped: { '@player': { weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null } },
      items: {},            // itemId → count
      serums: {},           // charId（或 '@player'）→ { serumId: 已服支数 }
      buildings: { core: 0, training: 0, medical: 0, workshop: 0, geneLab: 0 },   // 建筑从 0 级起（0 级 = 没升过）
      auth: 0,               // 灯阁权限等级（对标"洞府"：高级货币的一次性长线投资）
      sect: { lv: 0, exp: 0 },   // 灯阁评级（从 0 起：打关卡自动涨的全局长线）
      keji: {},                  // 秘术阁（对标"KeJi"）：id → 等级
      travel: { bankSec: 0, pending: null, got: 0, round: 0, day: '' },   // 挂机游历奇遇（对标"YouLi"）
      charExp: 0,               // 伙伴经验池（V9.5.46）：所有伙伴共用这一份，升级从这里扣、重生返还回来
      garden: Array(4).fill(null),       // 药园（对标"洞府·药园"）：每块地 null 或 {kind, at}
      arena: { floor: 1, best: 1, date: '', used: 0 },   // 斗法台（对标"Arena"）
      fabao: { own: [], on: null },      // 法宝（对标"FaBao"）：own = 已拥有，on = 主角佩戴的那件
      mount: { own: [], on: null },      // 坐骑（对标"Horse"）：own = 已驯服，on = 当前乘骑的那匹
      sign: { date: '', tier: '', idlePct: 0, drawn: 0 },   // 求签（对标"SignItem"）：今天的签文与挂机加成
      worlds: {},           // worldId → {unlocked, stages: {normal:[stars×12], hard, hell}}
      worldFirstClear: {},  // 'worldId_diff' → true（通关奖励每个世界·每个难度只发一次）
      corridor: { floor: 1, best: 0 },
      // 保底按池分开记账：高级 / 限定 各自算 SSR / UR / 当期 UP 的累计数
      recruit: { pity: { advanced: { ssr: 0, ur: 0, up: 0 }, limited: { ssr: 0, ur: 0, up: 0 } }, lastFree: '',
        free: { date: '', normal: { used: 0, at: 0 }, advanced: { used: 0, at: 0 } } },   // V9.5.51 每日免费抽
      shop: { dailyDate: '', dailyItems: [], bought: {} },
      // bonus：额外扫荡额度（由玩法自行发放的临时加次数；网页版不发，恒为 0，跨天清零）
      sweep: { date: '', count: 0, bonus: 0 },
      tasks: { date: '', daily: {}, claimed: {}, allClaimed: false, weekKey: '', weekly: {}, weeklyClaimed: {}, weeklyAllClaimed: false },
      login: { day: 0, round: 1, lastClaim: '' },
      idle: { bankSec: 0, lastTs: Date.now(), lines: { cultivate: null, gather: null, explore: null, guard: null } },
      bounty: { start: Date.now(), claimed: {}, list: null, rev: 0 },   // 限时悬赏：list 按当前进度生成，本期固定（rev 见 migrate）
      beast: { owned: {}, active: null },                       // 伴生体：owned[id] = {lv, soul}；active = 随行的那只
      stats: { battles: 0, wins: 0, bosses: 0, runs: 0, recruits: 0, enhances: 0, bestFloor: 0, profileViews: 0,
        taskClaims: 0, signDraws: 0 },   // V9.6.74：主线新步骤要用的两个计数（老档没有 → 一律 || 0 兜底）
      settings: { speed: 1, autoSellN: false, autoSellR: false, sfx: true, autoBattle: false, autoNext: true },
      codex: { chars: [], equipsSeen: 0, claimed: [] },
      achievements: {},       // achId → true（已领取）
      presets: [null, null, null],   // 3 组编队预设（保存队伍成员）
      pendingRun: null,       // 未打完的副本进度：刷新 / 切后台回来可以继续
      unlocks: {},
      quests: { claimed: [] },
      ssrTicket: 0,
      tutorial: false,
    };
  }

  let suppressSave = false;
  let saveFailed = false;
  /* V9.6.92：**离线窗口只在结算过之后才允许被"存盘盖章"**。
     背景：save() 里那句 `S.idle.lastTs = Date.now()` 是有意行为（存盘 = 刚见过玩家），
     但它有个致命前提 —— 开机必须先 settleOffline 再存盘。
     只要开机流程里在结算之前多一次存盘（引导漏斗统计、下架道具退款提示、某个 UI 初始化……），
     离线几小时的收益就被那一下悄悄抹掉，玩家只会觉得"我明明关了几小时，怎么什么都没有"。
     小游戏 V9.6.90 真的踩到了（coachFunnel 在首帧渲染时存了一次）。
     现在改成：**载入存档后、结算完成前，任何存盘都不动 lastTs**。 */
  let offlineSettled = false;
  function save() {
    if (suppressSave) return;
    if (offlineSettled) S.idle.lastTs = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
      saveFailed = false;
    } catch (e) {
      // 存储不可用（隐私模式）/ 配额满：只提示一次，别让玩家打完一整局才发现没存上
      if (!saveFailed) {
        saveFailed = true;
        notice('⚠ 存档写入失败：浏览器存储不可用或已满，请到「设置 → 导出存档」先备份');
      }
    }
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
    /* suppressSave 仍然保持"关着"：网页版删完档会立刻 reload，
       期间任何一次 beforeunload / 定时存盘都不许把**旧档写回去**（这是它原来的用处）。
       存盘开关由 newGame() 负责恢复 —— "开始新游戏"才代表真的重新开始。 */
    suppressSave = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== 5) return false;
      S = Object.assign(defaultState(), data);
      migrate();
      /* 刚读进来的存档带着"上次见到玩家"的时间戳 —— 在 settleOffline 跑来认领它之前，
         中途任何一次存盘都不许把它冲掉（V9.6.92，见 save() 与 offlineSettled 的说明）。 */
      offlineSettled = false;
      return true;
    } catch (e) { return false; }
  }
  // 上阵 5 格归一化：0/1 前排，2/3/4 后排；'@player' 一定在里面（主角必上阵）。
  // 老存档是 4 格且主角不占位，按他原来站的那一排把他插进去，其它人顺序不变。
  function normalizeParty(raw, oldRow) {
    const src = (Array.isArray(raw) ? raw : []).slice(0, 5);
    if (src.indexOf('@player') >= 0) {
      // 已经是新结构：只补长度、清掉不再拥有的角色
      while (src.length < 5) src.push(null);
      return src.map(id => (id === '@player' || (id && S.chars && S.chars[id])) ? id : null);
    }
    const mates = src.filter(id => id && S.chars && S.chars[id]);
    const arr = oldRow === 'back'
      ? [mates[0] || null, mates[1] || null, '@player', mates[2] || null, mates[3] || null]
      : ['@player', mates[0] || null, mates[1] || null, mates[2] || null, mates[3] || null];
    while (arr.length < 5) arr.push(null);
    return arr.slice(0, 5);
  }
  // 旧档迁移：C001 林默不再是主角占位，主角为独立实体
 function migrate() {
    const def = defaultState();
    S.stats = Object.assign(def.stats, S.stats || {});
    // V8.0 新增的三块（灯阁评级 / 秘术阁 / 挂机游历）：老档补默认值，缺字段不会读出 undefined
    S.sect = Object.assign({ lv: 1, exp: 0 }, S.sect || {});
    S.keji = S.keji || {};
    S.travel = Object.assign({ bankSec: 0, pending: null, got: 0, round: 0, day: '' }, S.travel || {});
    if (typeof S.charExp !== 'number') S.charExp = 0;
    // 老档：把每个人身上攒的零散经验并进共享池（不丢东西）
    Object.values(S.chars || {}).forEach(c => { if (c && c.exp) { S.charExp += c.exp; c.exp = 0; } });
    S.garden = Object.assign(Array(def.garden.length).fill(null), S.garden || {});
    S.arena = Object.assign({ floor: 1, best: 1, date: '', used: 0 }, S.arena || {});
    S.fabao = Object.assign({ own: [], on: null }, S.fabao || {});
    S.mount = Object.assign({ own: [], on: null }, S.mount || {});
    S.sign = Object.assign({ date: '', tier: '', idlePct: 0, drawn: 0 }, S.sign || {});
    // V8.3：主角也能选前后排（老档默认前排）
    S.player.row = S.player.row === 'back' ? 'back' : 'front';
    S.recruit = Object.assign(def.recruit, S.recruit || {});
    // 招募保底从"两个散字段"改成"按池记账"；老档把旧计数搬过来，进度不丢
    S.recruit.pity = S.recruit.pity || {};
    [['advanced', 'pityAdvS', 'pityAdv'], ['limited', 'pityLimS', 'pityLim']].forEach(([k, ssrKey, urKey]) => {
      const cur = S.recruit.pity[k] || {};
      S.recruit.pity[k] = {
        ssr: cur.ssr || S.recruit[ssrKey] || 0,
        ur: cur.ur || S.recruit[urKey] || 0,
        up: cur.up || 0,
      };
      delete S.recruit[ssrKey];
      delete S.recruit[urKey];
    });
    S.idle.lines = Object.assign({ cultivate: null, gather: null, explore: null, guard: null }, S.idle.lines || {});
    S.bounty = Object.assign({ start: Date.now(), claimed: {}, list: null }, S.bounty || {});
    S.bounty.claimed = S.bounty.claimed || {};
    /* V9.6.17（父亲大人："限时悬赏的时间还是没改"）：悬赏期**生成一次就写进存档**，
       只改数据表里的 hours 对老档无效（它那一期的截止时间是老的）。rev 对不上就丢掉这一期、
       按新表重新生成 —— 一次性迁移，之后 rev 就一致了。 */
    if (S.bounty.rev !== D.BOUNTY_REV) {
      S.bounty = { start: Date.now(), claimed: {}, list: null, rev: D.BOUNTY_REV };
    }
    // 悬赏改成"按进度动态生成"，老档没有 list 就在这里补一份（不改变已领记录）
    if (!Array.isArray(S.bounty.list) || !S.bounty.list.length) S.bounty.list = D.makeBounties(S);
    S.beast = Object.assign({ owned: {}, active: null }, S.beast || {});
    S.beast.owned = S.beast.owned || {};
    if (S.beast.active && !S.beast.owned[S.beast.active]) S.beast.active = null;
    S.player.realm = S.player.realm || 0;   // 已突破的境界（小阶）数
    // 境界从「10 个大境」改成「36 小阶」（见 data.js REALMS 注释）。
    // 老存档按「旧第 N 境 = 新第 4N 阶」换算：加成总量不变（旧 N×5% = 新 4N×1.4%），
    // 已解锁的内容一件不少；用 realmScaled 做一次性标记，避免每次读档都乘 4。
    // 注意：这个标记**不能**写进 defaultState（那会让老档也带着它，老档就永远不换算了），
    // 只能由 newGame() 在建档时落上——见 newGame 里的说明。
    if (!S.realmScaled) { S.player.realm = S.player.realm * 4; S.realmScaled = true; }
    S.auth = S.auth || 0;   // 灯阁权限等级
    S.sweep = Object.assign(def.sweep, S.sweep || {});
    S.sweep.bonus = S.sweep.bonus || 0;
    /* V9.5.66（父亲大人）：探索消耗品整条线删掉（ITEMS 里已经没有它们了）。
       老存档背包 / 待领箱里可能还躺着几个——不清理的话，背包会画出一格名字是 undefined 的空格子，
       点进去还会报错。这里按**当时商店里的原价**退回 ◈ 点数（玩家是真买的，不能凭空吞掉）。
       退款天然只做一次：清掉之后存档里就没有这些 id 了，下次读档退不到东西。 */
    const retired = D.RETIRED_ITEMS || {};
    let retiredRefund = 0;
    Object.keys(retired).forEach(id => {
      const n = S.items[id] || 0;
      if (n > 0) { retiredRefund += n * retired[id]; delete S.items[id]; }
    });
    (S.stash || []).forEach(x => {
      if (x && x.n > 0 && retired[x.id] !== undefined) { retiredRefund += x.n * retired[x.id]; x.n = 0; }
    });
    if (retiredRefund > 0) {
      S.stash = (S.stash || []).filter(x => x && x.n > 0);
      S.cur.points += retiredRefund;
      S.retiredRefund = (S.retiredRefund || 0) + retiredRefund;
      S.retiredRefundPending = true;      // main.js 读到这一位就在开局给一次提示，不静默改玩家的钱
    }
    // 老存档补新字段：设置项 / 图鉴领取记录 / 登录轮次
    S.settings = Object.assign(def.settings, S.settings || {});
    S.tasks = Object.assign(def.tasks, S.tasks || {});
    S.tasks.weekly = S.tasks.weekly || {};
    S.tasks.weeklyClaimed = S.tasks.weeklyClaimed || {};
    S.achievements = S.achievements || {};
    S.presets = Array.isArray(S.presets) ? S.presets.slice(0, 3) : [null, null, null];
    while (S.presets.length < 3) S.presets.push(null);
    S.pendingRun = S.pendingRun || null;
    S.serums = S.serums || {};   // 老档补齐：血清服用记录
    // 待领箱（背包满时的兜底）：老档补空数组，同时剔除脏条目
    S.stash = Array.isArray(S.stash) ? S.stash.filter(x => x && (x.n || 0) > 0 && D.ITEMS[x.id]) : [];
    // 老档补齐：招募角色的装备槽从 3 个扩到 6 个（世界套装 4/6 件效果才可能触发）
    Object.keys(S.chars || {}).forEach(id => {
      S.equipped[id] = Object.assign({ weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null }, S.equipped[id] || {});
    });
    Object.values(S.equips || {}).forEach(e => { if (e.lock === undefined) e.lock = false; });
    /* V9.6.81（父亲大人："现在的职业套装改成血统套装"）：老存档里的装备带着旧的 `classSet`（定位名，
       如 warrior）。按 LEGACY_KIND_SET 换成血统，名字前缀也跟着换（'战士·磁轨枪' → '狼人·磁轨枪'），
       玩家的套装不会凭空掉档。跑过一次存档里就没有 classSet 了，天然只迁移一次。 */
    Object.values(S.equips || {}).forEach(e => {
      if (!e || !e.classSet) return;
      const oldKind = e.classSet;
      const bl = (D.LEGACY_KIND_SET || {})[oldKind] || null;
      e.bloodSet = bl;
      delete e.classSet;
      const oldName = (D.KIND_NAMES || {})[oldKind];
      if (bl && oldName && typeof e.name === 'string' && e.name.indexOf(oldName + '·') === 0) {
        e.name = bl + e.name.slice(oldName.length);
      }
    });
    /* V9.6.82：血统套装改成"按世界"之后，老的血统件（只有 bloodSet、没有 bloodWorld）
       在套装卡里会显示成 0/6 却不知道为什么。给它们补上出处（第 10 张图，血统套装的最早一张），
       让它们仍然是有效的一套、能被计数。 */
    Object.values(S.equips || {}).forEach(e => {
      if (e && e.bloodSet && !e.bloodWorld) e.bloodWorld = D.WORLDS[Math.max(0, (D.BLOODLINE_MIN_WORLD || 10) - 1)].id;
    });
    /* V9.6.86：血统体系改成"血统即定位"，**魔法血统被删掉**（成员并入修真）。
       老存档里跟魔法血统有关的东西必须迁移，否则：主角的技能栏会指向一个不存在的血统（直接白屏级问题），
       玩家的魔法套装件也永远凑不齐。 */
    const BL_RENAME = { '魔法': '修真' };
    if (S.player && BL_RENAME[S.player.bloodline]) S.player.bloodline = BL_RENAME[S.player.bloodline];
    Object.values(S.equips || {}).forEach(e => {
      if (!e) return;
      if (e.bloodSet && BL_RENAME[e.bloodSet]) e.bloodSet = BL_RENAME[e.bloodSet];
      if (e.godSet && BL_RENAME[e.godSet]) e.godSet = BL_RENAME[e.godSet];
    });
    S.codex = Object.assign({ chars: [], equipsSeen: 0 }, S.codex || {});
    S.codex.claimed = Array.isArray(S.codex.claimed) ? S.codex.claimed : [];
    S.login = Object.assign(def.login, S.login || {});
    S.cur = Object.assign(def.cur, S.cur || {});
    // ⚠️ 只跑一次：C001 是旧版"主角占位"，新版主角是独立实体。
    // 之前这段没有开关，**每次读档都会跑**——玩家只要抽到 C001（他很普通池里 N 档 6 人之一），
    // 下次开游戏角色就被删掉，花的货币不退（V9.2 修）。
    if (S.chars && S.chars['C001'] && !S.c001Merged) {
      // 转移 C001 装备到主角
      const old = (S.equipped && S.equipped['C001']) || {};
      const slots = S.equipped['@player'];
      ['weapon', 'armor', 'accessory'].forEach(k => { if (old[k] && !slots[k]) slots[k] = old[k]; });
      delete S.equipped['C001'];
      delete S.chars['C001'];
      if (S.codex && S.codex.chars) S.codex.chars = S.codex.chars.filter(x => x !== 'C001');
      S.c001Merged = true;
    }
    if (!S.c001Merged) {
      if (S.party) S.party = S.party.map(id => (id === 'C001' ? null : id));
      S.c001Merged = true;
    }
    // V8.3：上阵位从「4 格（主角不占位）」改成「5 格（前 2 后 3，主角占一格）」
    S.party = normalizeParty(S.party, S.player.row);
    if (Array.isArray(S.presets)) S.presets = S.presets.map(p => (p ? normalizeParty(p, 'front') : p));
    if (!S.equipped['@player']) S.equipped['@player'] = { weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null };
    // V8.3：老档里可能存在的"一件装备被多人穿"（旧版换装 / 一键最优装备留下的脏数据）——
    // 在装备槽补齐之后再修，只留给排在最前面的那个人
    dedupeEquips();
    S.player.bloodline = S.player.bloodline || null;
    S.player.bloodlineLv = S.player.bloodlineLv || 0;
    // V9.5.83：老档里可能存着带 HTML 特殊字符的名字（名字会拼进界面模板）→ 读档时清一遍
    S.player.name = cleanName(S.player.name);
    (S.altPlayers || []).forEach(p => { if (p) p.name = cleanName(p.name); });
    S.player.attrs = Object.assign(ATTR_ZERO(), S.player.attrs || {});
    S.player.attrPoints = S.player.attrPoints || 0;
    /* V9.5.69：技能等级从 1 起改成 0 起。老档一次性把已点等级整体减 1（Lv.1→Lv.0），
       这样"实际强度"和"已花点数"都保持不变，不会因为改口径白送或白扣。
       用 skillZeroBased 这个一次性标记，避免每次读档都减。 */
    if (!S.skillZeroBased) {
      const conv = v => Math.max(0, (v || 1) - 1);
      S.player.skillLv = (S.player.skillLv || [1, 1, 1]).slice(0, 3).map(conv);
      Object.values(S.chars || {}).forEach(c => { if (c) c.skillLv = (c.skillLv || [1, 1, 1]).slice(0, 3).map(conv); });
      (S.altPlayers || []).forEach(p => { if (p) p.skillLv = (p.skillLv || [1, 1, 1]).slice(0, 3).map(conv); });
      S.skillZeroBased = true;
    }
    /* V9.5.78：技能点改成"按等级算"的纯函数（skillPointsForLevel），
       老档与转生档都自动算对，不需要一次性标记，也不会重复发放。 */
    S.player.skillPoints = skillPointsForLevel();
    S.player.skillLv = (S.player.skillLv || [0, 0, 0]).slice(0, 3);
    /* V9.5.83：脏档洗净放**最后**跑——前面还有「技能 1 基→0 基」这类一次性换算，
       先洗会把越界的值夹住、再被换算改一次（实测技能等级会差 1 级）。洗净永远该是最后一道。 */
    sanitizeSave();
    if (S.player.skillPoints === undefined) {
      const spent = S.player.skillLv.reduce((s, x) => s + x, 0);     // 技能等级从 0 起，已花点数就是等级和
      // 技能点每 3 级 1 点，老档按同一口径补算，避免"老档凭空多出几十点"
      S.player.skillPoints = Math.max(0, Math.floor(S.player.level / D.SKILL_POINT_EVERY_LV) - spent);
    }
    S.altPlayers = Array.isArray(S.altPlayers) ? S.altPlayers : [];
    S.altPlayers.forEach(p => {
      p.attrs = Object.assign(ATTR_ZERO(), p.attrs || {});
      p.attrPoints = p.attrPoints || 0;
      p.skillLv = (p.skillLv || [0, 0, 0]).slice(0, 3);
      if (p.skillPoints === undefined) {
        const spent = p.skillLv.reduce((s, x) => s + x, 0);
        p.skillPoints = Math.max(0, Math.floor(p.level / D.SKILL_POINT_EVERY_LV) - spent);
      }
    });
    // 背包从"道具+装备一个池子"改成三池分开（V9.2：道具 / 材料 / 装备）。
    // 老档的扩容次数同时算给三边：总格数只多不少，不会因为改版缩水。
    if (!S.bag || S.bag.itemCap === undefined) {
      const oldExpands = (S.bag && S.bag.expands) || 0;
      S.bag = {
        itemCap: D.BAG_BASE_ITEM_CAP + oldExpands * D.BAG_EXPAND_SIZE, itemExpands: oldExpands,
        matCap: D.BAG_BASE_MAT_CAP + oldExpands * D.BAG_EXPAND_SIZE, matExpands: oldExpands,
        eqCap: D.BAG_BASE_EQ_CAP + oldExpands * D.BAG_EXPAND_SIZE, eqExpands: oldExpands,
      };
    }
    if (S.bag.matCap === undefined) {   // V9.2 中途有过"只有两池"的版本，补上材料池
      S.bag.matCap = D.BAG_BASE_MAT_CAP; S.bag.matExpands = 0;
    }
    // 世界首通奖励改成"每个世界·每个难度只发一次"。
    // 老档里已经打穿的世界要当场标成"已领过"，否则更新之后还能再白领一轮（V9.2）。
    S.unlocks = S.unlocks || {};
    S.worldFirstClear = S.worldFirstClear || {};
    Object.keys(S.worlds || {}).forEach(wid => {
      const w = S.worlds[wid];
      ['normal', 'hard', 'hell'].forEach(d => {
        if (w && w.stages && w.stages[d] && w.stages[d].length && w.stages[d].every(x => x > 0)) {
          S.worldFirstClear[wid + '_' + d] = true;
        }
      });
    });
    // 功能解锁按"当前进度"补一遍：老档（或解锁表后续加过条目）读进来时，
    // 已经打过的关卡要立刻反映成"已解锁"，否则新加的解锁门禁会把老玩家拦在外面。
    refreshUnlocks();
  }
  function newGame() {
    S = defaultState();
    offlineSettled = true;     // 新档没有"离线窗口"要保，存盘照常盖章（V9.6.92）
    /* V9.6.100：**开始新游戏 = 恢复存盘**。
       wipeSave() 会把 suppressSave 关上（防"删档后又被 beforeunload 写回旧档"），
       小游戏没有 reload 这一步，所以必须由 newGame 负责重新打开存盘开关 ——
       否则"删档重开"之后玩家这一局玩多久都不会落盘。 */
    suppressSave = false;
    S.player.name = '';   // 创建角色时填写
    // 旧档境界换算（10 大境 → 36 小阶，×4）只能作用在"V9 之前的老档"上。
    // 这个标记以前要等第一次读档才写入，于是新档第一次读档时也被乘了 4
    // （新档渡劫 5 次 → 重开变 20 阶）。建档时就把标记落上，新档永远不会被换算（V9.5 修）。
    S.realmScaled = true;
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
  function cleanName(n) {
    return String(n == null ? '' : n).replace(NAME_BAD, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  }
  function setPlayerName(name) {
    const clean = cleanName(name);
    if (!clean) return false;
    S.player.name = clean;
    save();
    return true;
  }
  // 主角显示名（@player 即玩家本人）
  function charName(id) {
    if (id === '@player') return S.player.name || '主角';
    return D.charById[id] ? D.charById[id].name : id;
  }
  function exportSave() { return JSON.stringify(S); }
  function importSave(json) {
    try {
      const data = JSON.parse(json);
      if (!data || data.v !== 5) return { ok: false, msg: '存档版本不兼容' };
      S = Object.assign(defaultState(), data);
      migrate();     // 老版本导出的存档也要补字段（之前漏了这一步，导入老档会缺东西）
      save();
      return { ok: true };
    } catch (e) { return { ok: false, msg: '存档文件损坏' }; }
  }
  function saveSlot(n) { try { localStorage.setItem(slotKey(n), JSON.stringify(S)); return true; } catch (e) { return false; } }
  function loadSlot(n) {
    try {
      const raw = localStorage.getItem(slotKey(n));
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.v !== 5) return false;
      S = Object.assign(defaultState(), data);
      migrate();     // 同上：读存档槽也要走一遍迁移
      save();
      return true;
    } catch (e) { return false; }
  }
  function slotInfo() {
    const out = [];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const raw = localStorage.getItem(slotKey(i));
      let meta = null;
      if (raw) { try { const d = JSON.parse(raw); meta = { level: d.player.level, floor: d.corridor.best, time: d.idle && d.idle.lastTs }; } catch (e) {} }
      out.push({ slot: i, exists: !!raw, meta });
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
    emitCur(id, d);
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
      const set = D.SETS[setId];
      if (!set) return;
      if (n >= 2 && set.b2) Object.entries(set.b2).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
      if (n >= 4 && set.b4) Object.entries(set.b4).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
      if (n >= 6 && set.b6) Object.entries(set.b6).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
    });
  }
  /* --- 转生天赋：一支入口，文案与效果同源（D.TALENTS 的节点自带 e 效果表） --- */
  const TALENT_PCT_KEYS = ['atkPct', 'hpPct', 'defPct', 'spdPct', 'critPct', 'critDmg', 'skillPct', 'evaPct', 'spiritPct'];
  function talentAll() {
    const t = S.player.talents;
    const out = {};
    ['body', 'energy', 'nerve', 'grace'].forEach(b => {
      Object.entries(D.talentEffect(b, t[b] || 0)).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
    });
    return out;
  }
  function talentPct() {
    const all = talentAll(), out = {};
    TALENT_PCT_KEYS.forEach(k => { out[k] = all[k] || 0; });
    return out;
  }
  // 战斗引擎专用的天赋字段（减伤/受治疗/开场能量/CD/先制/必杀）
  function talentCombatExtra() {
    const all = talentAll();
    return {
      dmgReduce: Math.min(0.6, all.dmgReduce || 0),
      healUp: all.healUp || 0,
      initEnergy: all.initEnergy || 0,
      cdRed: all.cdRed || 0,
      firstStrike: all.firstStrike || 0,
      ultPct: all.ultPct || 0,
    };
  }
  const graceIdleMult = () => 1 + (talentAll().idlePct || 0);
  const graceExpMult = () => 1 + (talentAll().expPct || 0);
  const graceDropMult = () => 1 + (talentAll().dropPct || 0) + kejiBonus().dropPct;
  // 背包占用 = 道具种类数 + 未装备装备件数
  function bagUsage() {
    const equippedUids = new Set();
    Object.values(S.equipped || {}).forEach(slots => Object.values(slots || {}).forEach(uid => { if (uid) equippedUids.add(uid); }));
    const eqCount = Object.keys(S.equips).filter(uid => !equippedUids.has(uid)).length;
    const stacks = Object.entries(S.items).filter(([, n]) => n > 0);
    const isMat = k => ((D.ITEMS[k] || {}).type === 'material');
    const matStacks = stacks.filter(([k]) => isMat(k)).length;
    const itemStacks = stacks.length - matStacks;
    return {
      eqCount, itemStacks, matStacks,
      // used/cap 保留成"道具那一块"，老调用点不会读错
      used: itemStacks, cap: S.bag.itemCap,
      matUsed: matStacks, matCap: S.bag.matCap,
      eqUsed: eqCount, eqCap: S.bag.eqCap,
      total: eqCount + itemStacks + matStacks,
    };
  }
  function addItem(id, n = 1) {
    if (!(S.items[id] > 0)) {
      // 新堆叠要占格：材料进材料池，其余进道具池
      const isMat = (D.ITEMS[id] || {}).type === 'material';
      const u = bagUsage();
      if (isMat ? u.matUsed >= u.matCap : u.itemStacks >= S.bag.itemCap) return false;
    }
    S.items[id] = (S.items[id] || 0) + n;
    return true;
  }
  // 能否再放进这个道具（已有堆叠不占新格）
  function canAddItem(id) {
    if (S.items[id] > 0) return true;
    const u = bagUsage();
    return (D.ITEMS[id] || {}).type === 'material' ? u.matUsed < u.matCap : u.itemStacks < S.bag.itemCap;
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
    S.stash = S.stash || [];
    const ex = S.stash.find(x => x.id === id);
    if (ex) ex.n += n;
    else S.stash.push({ id, n, at: Date.now() });
    notice(`背包已满：${(D.ITEMS[id] || {}).name || id}×${n} 已存入待领箱`);
  }
  function stashCount() { return (S.stash || []).reduce((s, x) => s + (x.n || 0), 0); }
  function stashList() { return (S.stash || []).slice(); }
  // 把待领箱里"现在装得下"的东西搬进背包；装不下的留着
  function claimStash() {
    S.stash = S.stash || [];
    let moved = 0;
    S.stash.forEach(x => {
      if (!(x.n > 0)) return;
      if (!canAddItem(x.id)) return;
      const n = x.n;
      if (addItem(x.id, n)) { moved += n; x.n = 0; }
    });
    S.stash = S.stash.filter(x => (x.n || 0) > 0);
    if (moved) save();
    return { ok: moved > 0, moved, left: stashCount() };
  }
  // 统一的"奖励对象"结算：货币走 addCur，item 走 addItem。
  // 所有奖励（任务 / 周常 / 登录 / 悬赏 / 图鉴）都走这一个入口，避免"某处支持道具、某处不支持"。
  function applyRewardObj(obj) {
    const out = { stashed: [] };
    Object.entries(obj || {}).forEach(([k, v]) => {
      // 道具装不下就进待领箱（之前是直接丢掉 addItem 的返回值，背包满时奖励静默蒸发）
      if (k === 'item') [].concat(v).forEach(id => { if (!addItem(id)) { stashItem(id, 1); out.stashed.push(id); } });
      else if (k === 'ssrTicket') S.ssrTicket = (S.ssrTicket || 0) + (v === true ? 1 : v || 0);
      else addCur(k, v);
    });
    return out;
  }

  /* ================= 角色 ================= */
  function addChar(id) {
    const base = D.charById[id];
    if (!base) return { isNew: false };
    if (S.chars[id]) {
      const gain = D.DUP_SHARDS[base.rarity];
      S.chars[id].shards += gain;
      return { isNew: false, shards: gain };
    }
    S.chars[id] = { lv: 0, exp: 0, star: 1, shards: 0, skillLv: [0, 0, 0], bloodlineLv: 0 };   // 伙伴也从 0 级起
    S.equipped[id] = { weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null };
    if (!S.codex.chars.includes(id)) S.codex.chars.push(id);
    return { isNew: true };
  }
  function addShards(id, n) {
    if (S.chars[id]) S.chars[id].shards += n;
    else { addChar(id); S.chars[id].shards += n; }
  }
  function levelCost(charId) {
    const c = S.chars[charId];
    if (!c || c.lv >= D.PLAYER_MAX_LV) return null;
    return { exp: D.EXP_TABLE[c.lv], points: D.LEVEL_POINTS[c.lv] };
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
    if (!S.chars[newId]) return { ok: false, msg: '未拥有该伙伴' };
    const outId = S.party[slotIdx];
    if (outId === '@player') return { ok: false, msg: '主角必上阵，这一格不能换' };
    if (outId === newId) return { ok: false, msg: '他已经在这一格了' };
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
    return { ok: true, outId: outId || null, inheritLv, moved };
  }
  function levelUp(charId, times = 1) {
    const c = S.chars[charId];
    if (!c) return { ok: false, msg: '未拥有该伙伴' };
    let ups = 0;
    for (let i = 0; i < times; i++) {
      if (c.lv >= D.PLAYER_MAX_LV) break;
      const cost = levelCost(charId);
      if ((S.charExp || 0) < cost.exp || S.cur.points < cost.points) break;
      S.charExp -= cost.exp; S.cur.points -= cost.points;
      c.lv++; ups++;
    }
    save();
    return { ok: ups > 0, ups, msg: ups > 0 ? `升到 Lv.${c.lv}` : (S.charExp < 1 ? '伙伴经验不够（用经验模块补）' : '点数不够') };
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
    if (!c) return { ok: false, msg: '未拥有该伙伴' };
    if (c.lv <= 0 && !c.exp) return { ok: false, msg: '已经是 Lv.0 了' };
    const refund = expSpentOn(charId);
    c.lv = 0; c.exp = 0;
    S.charExp = (S.charExp || 0) + refund;
    save();
    return { ok: true, refund, msg: `重生完成：返还 ${fmtNum(refund)} 伙伴经验` };
  }
  // V9.5.46：经验模块不再"选一个人喂"，直接进共享池（谁要练谁就从池子里扣）
  function useExpItem(itemId, n = 1) {
    const item = D.ITEMS[itemId];
    if (!item || item.type !== 'exp') return { ok: false, msg: '不是经验道具' };
    const have = S.items[itemId] || 0;
    if (have < 1) return { ok: false, msg: '道具不足' };
    const use = Math.max(1, Math.min(n, have));
    S.items[itemId] -= use;
    if (S.items[itemId] <= 0) delete S.items[itemId];
    S.charExp = (S.charExp || 0) + item.exp * use;
    task('item1', use);
    save();
    return { ok: true, msg: `+${(item.exp * use).toLocaleString()} 伙伴经验（×${use}）`, count: use, pool: S.charExp };
  }
  /* ================= 血清（永久强化剂） =================
     对标同类放置游戏的"丹药矩阵"：成长被拆成很多次小成长，喂一支就有一次可见的跳动。
     规则：每人每种有次数上限；血统血清只有对应血统能用；效果真的进属性计算（不是文案）。 */
  function serumTaken(charId, serumId) {
    const m = S.serums[charId];
    return (m && m[serumId]) || 0;
  }
  function serumApplied(charId) {
    const m = S.serums[charId] || {};
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
    if (!sd) return { ok: false, msg: '没有这个配方' };
    // V9.5.86（边界压测）：n 传 null/NaN 时 Math.floor 会给出 NaN，后面的扣款会写成 NaN
    const want = Math.max(1, Math.floor(Number(n)) || 1);
    const haveMat = S.items[sd.mat] || 0;
    const can = Math.min(want, Math.floor(haveMat / sd.matN), Math.floor(S.cur.points / sd.points));
    if (can < 1) {
      if (haveMat < sd.matN) return { ok: false, msg: `${D.ITEMS[sd.mat].name}不足（${haveMat}/${sd.matN}）` };
      return { ok: false, msg: `点数不足（${S.cur.points.toLocaleString()}/${sd.points.toLocaleString()}）` };
    }
    S.items[sd.mat] -= sd.matN * can;
    if (S.items[sd.mat] <= 0) delete S.items[sd.mat];
    S.cur.points -= sd.points * can;
    addItem(D.SERUM_ITEM(serumId), can);
    task('item1', can);
    save();
    return { ok: true, count: can, msg: `炼化「${sd.name}」×${can}` };
  }
  // 使用：喂给某名角色（或主角 '@player'）
  function useSerum(charId, serumId, n = 1) {
    const sd = D.serumById[serumId];
    if (!sd) return { ok: false, msg: '没有这支血清' };
    const itemId = D.SERUM_ITEM(serumId);
    const have = S.items[itemId] || 0;
    if (have < 1) return { ok: false, msg: '道具不足' };
    const isPlayer = charId === '@player';
    const base = isPlayer ? null : D.charById[charId];
    if (!isPlayer && !S.chars[charId]) return { ok: false, msg: '未拥有该伙伴' };
    if (sd.bloodline) {
      const bl = isPlayer ? S.player.bloodline : (base && base.bloodline);
      if (!bl) return { ok: false, msg: `该伙伴还没觉醒血统，先觉醒「${sd.bloodline}」再用` };
      if (bl !== sd.bloodline) return { ok: false, msg: `只有「${sd.bloodline}」血统能用这支血清` };
    }
    S.serums[charId] = S.serums[charId] || {};
    const taken = S.serums[charId][serumId] || 0;
    const room = sd.max - taken;
    if (room <= 0) return { ok: false, msg: `已达上限（${sd.max} 支）` };
    const use = Math.max(1, Math.min(n, have, room));
    S.items[itemId] -= use;
    if (S.items[itemId] <= 0) delete S.items[itemId];
    S.serums[charId][serumId] = taken + use;
    task('item1', use);
    save();
    const kn = D.SERUM_KEYS[sd.key] || sd.key;
    return { ok: true, count: use, msg: `${sd.name} ×${use}：${kn} 永久 +${(sd.per * use * 100).toFixed(1)}%` };
  }
  function starUp(charId) {
    const c = S.chars[charId];
    const base = D.charById[charId];
    if (!c) return { ok: false, msg: '未拥有该伙伴' };
    const maxStar = D.RARITY_MAXSTAR[base.rarity];
    if (c.star >= maxStar) return { ok: false, msg: '已达最高星级' };
    const need = D.STAR_COST[c.star];
    if (c.shards < need) return { ok: false, msg: `碎片不足（${c.shards}/${need}）` };
    c.shards -= need;
    c.star++;
    save();
    return { ok: true, msg: `升到 ${c.star}★` };
  }
  /* V9.5.73（父亲大人：技能上限 35/35/30）：伙伴技能也用同一张上限表，
     但伙伴花的是**技能芯片**（主角花技能点）。上限从 11 涨到 35，价目表不能还是手写 11 条，
     所以改成公式：第 lv 级（0 基）要 10 × 1.16^lv 个芯片。
       满一条 35 级 ≈ 1.1 万芯片 ≈ 3 天（芯片日收入约 2400~4400）
       一个伙伴三条点满 ≈ 3.3 万芯片 ≈ 7~14 天 —— 和其它养成线的量级一致。 */
  const SKILL_CHIP_BASE = 10, SKILL_CHIP_GROW = 1.16;
  const SKILL_CHIP_COST = Array.from({ length: D.SKILL_MAX }, (_, lv) => Math.round(SKILL_CHIP_BASE * Math.pow(SKILL_CHIP_GROW, lv)));
  function skillUp(charId, idx) {
    const c = S.chars[charId];
    if (!c) return { ok: false, msg: '未拥有该伙伴' };
    /* V9.5.86（边界压测）：索引越界时 cost 会变 undefined，`skillChip -= undefined` 直接写成 NaN。
       注意 `null >= 0` 在 JS 里是 **true**（null 会隐式转成 0），所以不能只判大小，得判整数。 */
    const si = Number(idx);
    if (!Number.isInteger(si) || si < 0 || si > 2) return { ok: false, msg: '技能不存在' };
    const lv = c.skillLv[si];
    if (lv >= D.SKILL_MAX_BY_INDEX[idx]) return { ok: false, msg: '已满级' };
    const cost = SKILL_CHIP_COST[lv];      // 技能从 0 级起，价目表也跟着 0 起
    if (S.cur.skillChip < cost) return { ok: false, msg: `技能芯片不足（${S.cur.skillChip}/${cost}）` };
    S.cur.skillChip -= cost;
    c.skillLv[idx]++;
    save();
    return { ok: true, msg: `技能升到 Lv.${c.skillLv[idx]}` };
  }

  /* ================= 血统 / 铭刻 ================= */
  /* V9.5.89（十七度自审）：血统升级的"报价"收成一份 ——
     界面原来读 D.bloodlineCost()（毛价），而真正升级时会打血统实验室的折扣（最高 -40%）：
     按钮写着"❥ 120 + ◈ 3000"、实际只扣 1800。玩家看到一个虚高的价钱就不敢点了。
     charId 传 '@player' 或伙伴 id；返回 null 表示已经没得升。 */
  function bloodlineQuote(charId) {
    const discount = Math.min(0.4, S.buildings.geneLab * 0.01);
    const apply = (cost) => ({
      bloodCrystal: Math.ceil(cost.bloodCrystal * (1 - discount)),
      points: Math.ceil(cost.points * (1 - discount)),
      discount,
    });
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
    if (!c) return { ok: false, msg: '未拥有该伙伴' };
    if (!isUnlocked('bloodline')) return { ok: false, msg: `🔒 ${unlockTip('bloodline')}` };
    if (c.bloodlineLv >= D.BLOODLINE_MAX) return { ok: false, msg: '血统已满级' };
    const q = bloodlineQuote(charId);            // 与界面同一份报价（已含血统实验室折扣）
    const cost = { bloodCrystal: q.bloodCrystal, points: q.points };
    if (!spend(cost)) return { ok: false, msg: '血统结晶或点数不足' };
    c.bloodlineLv++;
    save();
    return { ok: true, msg: `${base.bloodline}血统 Lv.${c.bloodlineLv}` };
  }
  function geneLockInfo() {
    const cur = S.player.geneLock;
    if (cur >= 5) return { max: true };
    const next = D.GENE_LOCKS[cur];
    const reqs = [];
    const worldReq = ['W01', 'W03', 'W06', 'W09', 'W12'][cur];
    const lvReq = [1, 20, 40, 60, 80][cur];
    const cleared = S.worlds[worldReq] && S.worlds[worldReq].stages.normal.every(s => s > 0);
    if (!cleared) reqs.push(`通关${D.WORLDS.find(w => w.id === worldReq).name}·普通`);
    if (S.player.level < lvReq) reqs.push(`玩家等级达到 Lv.${lvReq}`);
    if (S.cur.bloodCrystal < next.cost.bloodCrystal) reqs.push(`血统结晶 ${S.cur.bloodCrystal}/${next.cost.bloodCrystal}`);
    return { max: false, next, can: reqs.length === 0, reqs };
  }
  function geneLockUnlock() {
    const info = geneLockInfo();
    if (info.max) return { ok: false, msg: '铭刻已完全解锁' };
    if (!info.can) return { ok: false, msg: info.reqs.join('；') };
    S.cur.bloodCrystal -= info.next.cost.bloodCrystal;
    S.player.geneLock++;
    save();
    return { ok: true, msg: `铭刻 ${info.next.name} 已解锁！` };
  }

  /* ================= 属性计算 ================= */
  // 装备面板数值（含强化）
  function equipStats(eq) {
    const mult = 1 + eq.enhance * 0.05;
    const out = { atk: 0, def: 0, hp: 0, spd: 0, critPct: 0 };
    Object.entries(eq.base).forEach(([k, v]) => { out[k] = (out[k] || 0) + v * mult; });
    const affix = {};
    eq.affixes.forEach(a => { affix[a.k] = (affix[a.k] || 0) + a.v; });
    return { flat: out, affix };
  }
  function effectiveStats(charId) {
    const c = S.chars[charId];
    const base = D.charById[charId];
    if (!c || !base) return null;
    const lvMult = 1 + c.lv * 0.035;      // V9.5.69：等级从 0 起，Lv.0 = 基准 1.0
    const starMult = D.STAR_MULT[c.star - 1];
    const a = {};
    Object.keys(base.attrs).forEach(k => { a[k] = base.attrs[k] * lvMult * starMult; });
    // 百分比加成（加算区）
    const pct = { atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0, resPct: 0, lifesteal: 0, spiritPct: 0 };
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
    ['atkPct', 'hpPct', 'defPct', 'spdPct', 'critPct', 'critDmg', 'skillPct', 'evaPct', 'spiritPct'].forEach(k => { pct[k] += tt[k] || 0; });
    applySerums(charId, pct);                      // 血清（永久强化剂）
    applyBeast(pct);                               // 随行伴生体（全队加成）
    applyAuthority(pct);                           // 灯阁权限（满 10 级的全属性加成）
    applySect(pct);                                // 灯阁评级（全队，随进度自动涨）
    applyKeji(pct);                                // 秘术阁（全队百分比长线）
    applyMount(pct);                               // 坐骑（全队，含招募角色）
    // 装备
    const eq = S.equipped[charId] || {};
    const flat = { atk: 0, def: 0, hp: 0, spd: 0 };
    const sets = {};
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
    return {
      atk: Math.round(atk), def: Math.round(def), hp: Math.round(hp), spd: Math.round(spd),
      crit, critDmg: 2.0 + pct.critDmg, eva, skillMult,
      lifesteal: pct.lifesteal + (base.kind === 'vampire' ? 0.1 : 0),
      resPct: pct.resPct || 0,
      attrs: a, sets,
      ...talentCombatExtra(),
    };
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
    const a = {};
    Object.keys(P.baseAttrs).forEach(k => { a[k] = P.baseAttrs[k] * lvMult; });
    // 六维属性点加成（每点 +ATTR_POINT_VALUE）
    const pa = S.player.attrs || {};
    Object.keys(a).forEach(k => { a[k] += (pa[k] || 0) * D.ATTR_POINT_VALUE; });
    const pct = { atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0.05, resPct: 0, lifesteal: 0, spiritPct: 0 };
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
    ['atkPct', 'hpPct', 'defPct', 'spdPct', 'critPct', 'critDmg', 'skillPct', 'evaPct', 'spiritPct'].forEach(k => { pct[k] += tt[k] || 0; });
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
    const eq = S.equipped['@player'] || {};
    const flat = { atk: 0, def: 0, hp: 0, spd: 0 };
    const psets = {};
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
    return {
      atk: Math.round(atk), def: Math.round(def), hp: Math.round(hp), spd: Math.round(spd),
      crit, critDmg: 2.0 + pct.critDmg, eva, skillMult,
      lifesteal: pct.lifesteal, resPct: pct.resPct || 0, attrs: a,
      ...extra,
    };
  }
  function playerPower() {
    const st = effectivePlayerStats();
    return Math.round(st.atk * 2 + st.def + st.hp * 0.2 + st.spd * 3);
  }
  function choosePlayerBloodline(id) {
    if (!D.BLOODLINES[id]) return { ok: false, msg: '血统不存在' };
    if (S.player.bloodline) return { ok: false, msg: '血统一旦选择不可更改' };
    if (S.player.level < D.BLOODLINE_UNLOCK_LV) return { ok: false, msg: `主角 Lv.${D.BLOODLINE_UNLOCK_LV} 才能觉醒血统（当前 Lv.${S.player.level}）` };
    S.player.bloodline = id;
    save();
    return { ok: true, msg: `已觉醒${id}血统，境界线开启：${D.realmName(id, 0)} 起` };
  }
  // 当前血统的 36 阶全览（境界页整条展示用）
  function realmChainOf(bloodlineId) { return D.realmChain(bloodlineId || S.player.bloodline); }
  function upgradePlayerBloodline() {
    if (!S.player.bloodline) return { ok: false, msg: '尚未选择血统' };
    // 解锁门禁：血统"强化"要通关 潜影窟·第1关 才开（与 D.UNLOCKS 的说明同源；
    // 起步时的"选血统"不受限——那是开局必经的一步）
    if (!isUnlocked('bloodline')) return { ok: false, msg: `🔒 ${unlockTip('bloodline')}` };
    if (S.player.bloodlineLv >= D.BLOODLINE_MAX) return { ok: false, msg: '血统已满级' };
    const q = bloodlineQuote('@player');         // 与界面同一份报价（已含血统实验室折扣）
    const cost = { bloodCrystal: q.bloodCrystal, points: q.points };
    if (!spend(cost)) return { ok: false, msg: '血统结晶或点数不足' };
    S.player.bloodlineLv++;
    save();
    return { ok: true, msg: `血统 Lv.${S.player.bloodlineLv}` };
  }
  function teamPower() {
    // 上阵 5 格里就有主角本人（'@player'），所以这里按人算，别再单独加一次主角战力
    return S.party.filter(Boolean).reduce((sum, id) => sum + (id === '@player' ? playerPower() : power(id)), 0);
  }
  // 阵型（对标《道友修仙》的"阵法"）：由 D.FORMATIONS 的具名组合判定，界面直接显示"站的是哪一阵"。
  // 规则只有两条：①「同阵营」那一族只取命中的最高档，不重复叠；② 主角是万能补位（顶人数最多的那个阵营）。
  function formationState(partyIds) {
    const ids = (partyIds || []).filter(Boolean);
    // V9.5.44（父亲大人）：阵型只有**上满 5 人**才可能激活（不满编一律算未成阵）
    const full = ids.length >= 5;
    const count = {};
    ids.forEach(id => { const c = D.charById[id]; if (c) count[c.faction] = (count[c.faction] || 0) + 1; });
    let top = '';
    Object.keys(count).forEach(f => { if (!top || count[f] > count[top]) top = f; });
    const eff = Object.assign({}, count);
    if (top) eff[top] += 1;              // 主角补位
    const vals = Object.values(eff);
    const maxN = vals.length ? Math.max.apply(null, vals) : 0;
    const twoPlus = vals.filter(n => n >= 2).length;
    const kinds = Object.keys(count).length;
    const has = {
      tri: full && maxN >= 3, quad: full && maxN >= 4, penta: full && maxN >= 5,
      pillar: full && twoPlus >= 2, allfour: full && kinds >= 4,
    };
    const SAME_FAMILY = ['penta', 'quad', 'tri'];
    const bestSame = SAME_FAMILY.find(x => has[x]) || null;
    const hit = [];
    const buff = { atkPct: 0, hpPct: 0, skillPct: 0 };
    D.FORMATIONS.forEach(f => {
      if (!has[f.id]) return;
      if (SAME_FAMILY.includes(f.id) && f.id !== bestSame) return;   // 同阵营只取最高档
      hit.push(f.id);
      Object.keys(f.buff).forEach(k => { buff[k] = (buff[k] || 0) + f.buff[k]; });
    });
    return {
      atkPct: buff.atkPct, hpPct: buff.hpPct, skillPct: buff.skillPct,
      count, eff, maxN, kinds, hit,
      bestSame,
      active: hit.map(id => D.FORMATIONS.find(f => f.id === id)),
      // 界面用：现在命中的阵型名，没命中就是"未成阵"
      names: hit.map(id => (D.FORMATIONS.find(f => f.id === id) || {}).name).filter(Boolean),
      full,
    };
  }
  function factionBuffs(partyIds) { return formationState(partyIds); }

  /* ================= 装备操作 ================= */
  /* opts.preferWorldSet：开箱专用 —— 世界套装的概率从 60% 抬到 80%
     （父亲大人："箱子开出来的是那一张图的套装"，见 openBox） */
  function grantEquip(worldId, rarity, slot, opts0) {
    opts0 = opts0 || {};
    const uid = 'eq' + Date.now().toString(36) + '_' + (uidCounter++);
    const slots = slot ? [slot] : D.DROP_SLOTS;
    const s = slots[Math.floor(Math.random() * slots.length)];
    // 装备类别：普通 / 世界套装 / 血统套装 / 血统神装（神话专属）
    let opts = { setType: 'plain' };
    const roll = Math.random();
    /* 神话只会是血统神装，没有"普通神话"这一说。
       血统怎么挑（V9.6.76）：**七成偏向上阵那 5 个人的血统**，剩下三成六支里随机。
       全随机的话，想给主力凑一套要刷到天荒地老；全按队伍给又变成"没有选择"。
       偏差给到七三，既照顾主力，又留着"别的血统也能刷出来"的空间。 */
    const wi = D.WORLDS.findIndex(x => x.id === worldId) + 1;
    const hasBlood = wi >= D.BLOODLINE_MIN_WORLD;
    if (rarity === 'MYTH') opts = { setType: 'god', godSet: randomGodSet() };
    else if (rarity === 'R') opts = roll < 0.5 ? { setType: 'plain' } : { setType: 'world' };
    else if (rarity === 'SR' || rarity === 'SSR' || rarity === 'UR') {
      /* 血统套装**第 10 张图起**才有（父亲大人："就第 10 个世界后每个世界都有对应的血统套装"）——
         第 10 张之前那 30% 落点只给普通装，不会掉出一件"属于不存在套装"的装备
         （makeEquip 里还有一道兜底：这张图没这套就退化成世界套装）。 */
      const pWorld = rarity === 'SR' ? (opts0.preferWorldSet ? 0.85 : 0.7) : (opts0.preferWorldSet ? 0.8 : 0.6);
      if (roll < pWorld) opts = { setType: 'world' };
      else opts = hasBlood ? { setType: 'blood', bloodSet: randomBloodlineSet() } : { setType: 'plain' };
    }
    const eq = D.makeEquip(worldId, s, rarity, uid, opts);
    S.equips[uid] = eq;
    S.codex.equipsSeen++;
    // 自动分解（设置页开关）：白装 / 绿装不进背包，直接换成异界结晶
    if ((rarity === 'N' && S.settings.autoSellN) || (rarity === 'R' && S.settings.autoSellR)) {
      delete S.equips[uid];
      const gain = D.DECOMPOSE_GAIN[rarity];
      addCur('otherworld', gain);
      return { sold: true, gain, auto: true };
    }
    // 装备格子已满 → 自动分解为异界结晶
    if (bagUsage().eqUsed > S.bag.eqCap) {
      const gain = D.DECOMPOSE_GAIN[rarity];
      delete S.equips[uid];
      addCur('otherworld', gain);
      return { sold: true, gain, bagFull: true };
    }
    return { equip: eq };
  }
  /* 套装该给哪支血统：**七成偏向上阵那 5 个人**，三成六支里随机。
     全随机的话想给主力凑一套要刷到天荒地老；全按队伍给又变成"没有选择"。
     （V9.6.81：血统套装与血统神装共用这一条随机线 —— 都是血统的东西。） */
  function randomBloodSet(pool) {          // pool = 一组"血统名"，返回其中一个
    const party = (S.party || []).filter(Boolean)
      .map(id => (id === '@player' ? S.player.bloodline : (D.charById[id] || {}).bloodline))
      .filter(b => b && pool.indexOf(b) >= 0);
    if (party.length && Math.random() < 0.7) return party[Math.floor(Math.random() * party.length)];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function randomGodSet() { return randomBloodSet(Object.keys(D.GOD_SETS)); }
  /* ⚠ 这里要的是**血统名**，不是套装 key（V9.6.82 踩过：传错的池子会让 makeEquip 找不到套装、
     静默降级成世界套装 —— 表面不报错，实际血统套装一件都掉不出来）。 */
  function randomBloodlineSet() { return randomBloodSet(D.BLOODLINE_KEYS || Object.keys(D.BLOODLINE_SETS)); }
  // 伙伴专属装备（UR，绑定角色 · 六支血统各一件）
  function grantSignatureEquip(sigId) {
    const uid = 'eq' + Date.now().toString(36) + '_' + (uidCounter++);
    /* 专属装备的基础值按**玩家当前进度**那张图的档位生成（V9.6.83）——
       以前是写死的 320，第 20 张图之后随便一件普通 UR 武器都比它强，专属成了纪念品。 */
    const eq = D.makeSignatureEquip(sigId, uid, boxSourceWorld());
    if (!eq) return { sold: false };
    S.equips[uid] = eq;
    S.codex.equipsSeen++;
    if (bagUsage().eqUsed > S.bag.eqCap) {
      delete S.equips[uid];
      addCur('otherworld', D.DECOMPOSE_GAIN.UR);
      return { sold: true, gain: D.DECOMPOSE_GAIN.UR, bagFull: true };
    }
    return { equip: eq, signature: true };
  }

  // 扩容分三种：kind = 'item'（道具）| 'mat'（材料）| 'eq'（装备），三条曲线各自独立。
  // 每次 +10 格，价格从 ◈ 1500 起、每扩一次 ×1.3。
  function buyBagCap(kind) {
    const k = ['eq', 'mat'].includes(kind) ? kind : 'item';
    const expandsKey = k + 'Expands';
    const capKey = k + 'Cap';
    const label = { eq: '装备', mat: '材料', item: '道具' }[k];
    const cost = D.bagExpandCost(S.bag[expandsKey] || 0);
    if (!spend({ points: cost })) return { ok: false, msg: `点数不足（需 ◈ ${cost}）` };
    S.bag[expandsKey] = (S.bag[expandsKey] || 0) + 1;
    S.bag[capKey] += D.BAG_EXPAND_SIZE;
    save();
    return { ok: true, msg: `${label}格 +${D.BAG_EXPAND_SIZE}，现在 ${S.bag[capKey]} 格` };
  }
  function equipItem(charId, uid) {
    const eq = S.equips[uid];
    if (!eq) return false;
    if (!canEquip(charId, eq)) return false;
    // 一件装备只能有一个人穿：先把它从别人（或自己的别的槽）身上摘下来。
    // 旧版少了这一步，同一件装备会同时留在多个角色身上（越换装越脏）。
    unequipEverywhere(uid, charId);
    if (!S.equipped[charId]) S.equipped[charId] = { weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null };
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
        if (cid === keepId && k === (S.equips[uid] || {}).slot) return;   // 自己本来就穿在这个槽，保留
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
    ['chars', 'items', 'equips', 'serums'].forEach(k => { if (!S[k] || typeof S[k] !== 'object') S[k] = {}; });
    Object.keys(S.chars).forEach(id => { if (!D.charById[id]) delete S.chars[id]; });
    Object.keys(S.items).forEach(k => { if (!D.ITEMS[k]) delete S.items[k]; });
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
    Object.keys(S.cur || {}).forEach(k => { S.cur[k] = Math.max(0, numOr(S.cur[k], 0)); });
    S.player.level = clampNum(S.player.level, 0, D.PLAYER_MAX_LV);
    S.player.exp = Math.max(0, numOr(S.player.exp, 0));
    S.player.attrPoints = Math.max(0, numOr(S.player.attrPoints, 0));
    S.player.skillPoints = Math.max(0, numOr(S.player.skillPoints, 0));
    S.player.bloodlineLv = clampNum(S.player.bloodlineLv, 0, D.BLOODLINE_MAX);
    S.player.realm = clampNum(S.player.realm, 0, D.REALM_STAGE_COUNT);
    S.player.geneLock = clampNum(S.player.geneLock, 0, D.GENE_LOCKS.length);
    S.player.reincarnations = Math.max(0, numOr(S.player.reincarnations, 0));
    S.player.skillLv = (S.player.skillLv || [0, 0, 0]).slice(0, 3).map((v, i) => clampNum(v, 0, D.SKILL_MAX_BY_INDEX[i]));
    while (S.player.skillLv.length < 3) S.player.skillLv.push(0);
    S.player.attrs = S.player.attrs || {};
    D.ATTR_META.forEach(a => { S.player.attrs[a.id] = Math.max(0, numOr(S.player.attrs[a.id], 0)); });
    D.BUILDINGS.forEach(b => { S.buildings[b.id] = clampNum(S.buildings[b.id], 0, 99); });
    S.auth = clampNum(S.auth, 0, D.AUTHORITY_MAX);
    S.sect = { lv: clampNum(S.sect && S.sect.lv, 0, D.SECT_MAX), exp: Math.max(0, numOr(S.sect && S.sect.exp, 0)) };
    S.corridor = { floor: clampNum(S.corridor && S.corridor.floor, 1, 9999), best: clampNum(S.corridor && S.corridor.best, 0, 9999) };
    S.arena = Object.assign({ floor: 1, best: 1, date: '', used: 0 }, S.arena || {});
    S.arena.floor = clampNum(S.arena.floor, 1, 9999);
    S.arena.used = Math.max(0, numOr(S.arena.used, 0));
    Object.keys(S.keji || {}).forEach(k => { if (!D.kejiById(k)) delete S.keji[k]; });
    Object.values(S.chars).forEach(c => {
      c.lv = clampNum(c.lv, 0, D.PLAYER_MAX_LV);
      c.star = clampNum(c.star, 1, D.RARITY_MAXSTAR[D.charById[c.id] && D.charById[c.id].rarity] || 6);
      c.shards = Math.max(0, numOr(c.shards, 0));
      c.bloodlineLv = clampNum(c.bloodlineLv, 0, D.BLOODLINE_MAX);
      c.skillLv = (c.skillLv || [0, 0, 0]).slice(0, 3).map((v, i) => clampNum(v, 0, D.SKILL_MAX_BY_INDEX[i]));
      while (c.skillLv.length < 3) c.skillLv.push(0);
    });
    Object.keys((S.beast && S.beast.owned) || {}).forEach(id => {
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
      if (!Array.isArray(pr.waves) || !pr.waves.length) pr.waves = ['combat'];
      pr.hpPct = pr.hpPct && typeof pr.hpPct === 'object' ? pr.hpPct : {};
      Object.keys(pr.hpPct).forEach(k => { pr.hpPct[k] = clampNum(pr.hpPct[k], 0, 1); });
      if (!D.WORLDS.some(w => w.id === pr.worldId)) S.pendingRun = null;
    } else if (S.pendingRun !== undefined) {
      S.pendingRun = null;
    }
  }
  function dedupeEquips() {
    const seen = new Set();
    let fixed = 0;
    const party = Array.isArray(S.party) ? S.party.filter(Boolean) : [];
    const order = ['@player'].concat(party, Object.keys(S.equipped || {}));
    const done = {};
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
    if (!eq) return { ok: false };
    eq.lock = !eq.lock;
    save();
    return { ok: true, lock: eq.lock };
  }
  // 一键最优装备：按"能不能穿 + 词条价值"给主角与全队自动选装，已锁定的装备照常可以给人穿
  function equipScore(eq) {
    const st = equipStats(eq);
    let s = st.flat.atk * 2 + st.flat.def * 1.2 + st.flat.hp * 0.2 + st.flat.spd * 3 + (st.flat.critPct || 0) * 2000;
    Object.entries(st.affix).forEach(([k, v]) => {
      const w = { atkPct: 1200, hpPct: 500, defPct: 900, skillPct: 1000, critPct: 1500, critDmg: 600, spdPct: 900, evaPct: 700, resPct: 300, lifesteal: 800 }[k] || 200;
      s += v * w;
    });
    return s;
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
    const targets = charId ? [charId] : ['@player'].concat(S.party.filter(Boolean));
    // 谁身上穿着什么：这一份一开始就锁死，只有"被换下来的那件"会解禁
    const worn = new Set();
    Object.keys(S.equipped).forEach(cid => {
      const cur = S.equipped[cid] || {};
      Object.keys(cur).forEach(slot => { if (cur[slot]) worn.add(cur[slot]); });
    });
    let changed = 0;
    const detail = [];
    targets.forEach(cid => {
      if (cid !== '@player' && !S.chars[cid]) return;
      const cur = S.equipped[cid] || (S.equipped[cid] = { weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null });
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
    return { ok: true, changed, members: targets.length, detail };
  }
  // 穿戴规则：专属限本人；血统套装与血统神装都要求**同血统**；槽位受角色类型限制
  function canEquip(charId, eq) {
    if (!eq) return false;
    if (eq.charId && eq.charId !== charId) return false;
    if (charId !== '@player' && !S.chars[charId]) return false;
    /* 血统套装 / 血统神装：只有**同血统**的人穿得上（V9.6.81 起两条线同一条规矩）。
       这是"凑齐一套"的代价 —— 六件都得是这支血统，别人代穿不算。 */
    const bl = charId === '@player' ? S.player.bloodline : (D.charById[charId] || {}).bloodline;
    if (eq.bloodSet && eq.bloodSet !== bl) return false;
    if (eq.godSet && eq.godSet !== bl) return false;
    /* ⚠ 老存档兜底：V9.6.81 之前的装备带的是 `classSet`（定位名，如 warrior）。
       migrate() 会把它换成血统，但**万一有漏网的**（手动改档 / 更老的版本），
       这里按 LEGACY_KIND_SET 现算一次，别让玩家看到"穿不上又不知道为什么"。 */
    if (eq.classSet) {
      const mapped = (D.LEGACY_KIND_SET || {})[eq.classSet];
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
    return { points: Math.ceil(base * (1 - discount)), otherworld: 2 + Math.floor(eq.enhance / 5) * 2 };
  }
  /* V9.5.89（十七度自审）：**报价**和**实扣**必须是同一份数据。
     原来界面只显示 enhanceCost（点数 + 结晶），而 enhance() 在没材料时还要把代用点数加进点数、
     有材料时还要吃掉一块材料 —— 实测：无材料时按钮写 ◈200 实扣 ◈400，+12 那一档写 1640 实扣 4640；
     有材料时按钮上一个字都没提"要消耗一块材料"。玩家按的不是他看到的那个价。
     现在界面和扣款都读这一个 quote，结构上不允许再分叉。 */
  function enhanceQuote(uid) {
    const eq = S.equips[uid];
    if (!eq) return null;
    const cost = enhanceCost(eq);
    const mat = enhanceMat(eq);
    return {
      maxed: eq.enhance >= 20,
      points: cost.points + (mat.has ? 0 : mat.subPoints),   // 真正会扣的点数（含代用）
      basePoints: cost.points,
      substitute: mat.has ? 0 : mat.subPoints,
      otherworld: cost.otherworld,
      itemId: mat.itemId,
      itemName: (D.ITEMS[mat.itemId] || {}).name || mat.itemId,
      matHave: mat.has,
      matOwned: S.items[mat.itemId] || 0,
      tier: mat.tier,
      rate: D.ENHANCE_RATE[Math.min(eq.enhance, D.ENHANCE_RATE.length - 1)],
    };
  }
  // 强化所需材料：无材料时按 tier 折算点数代用
  function enhanceMat(eq) {
    const tier = D.enhanceMatTier(eq.enhance);
    const itemId = 'mat_t' + tier;
    const has = (S.items[itemId] || 0) > 0;
    return { itemId, tier, has, subPoints: has ? 0 : D.MAT_SUBSTITUTE_POINTS[tier] };
  }
  function enhance(uid) {
    const eq = S.equips[uid];
    if (!eq) return { ok: false, msg: '装备不存在' };
    if (!isUnlocked('enhance')) return { ok: false, msg: `🔒 ${unlockTip('enhance')}` };
    if (eq.enhance >= 20) return { ok: false, msg: '已满强化' };
    const q = enhanceQuote(uid);                 // 与界面同一份报价
    const cost = { points: q.points, otherworld: q.otherworld };
    // 先判够不够，再扣材料——顺序反了会白吞材料（档案里的同类问题）
    if (!canAfford(cost)) {
      return { ok: false, msg: q.matHave ? '点数或异界结晶不足' : `点数不足（无${q.itemName}，需代用 ◈ ${q.substitute}）` };
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
      return { ok: true, msg: `强化成功 +${eq.enhance}` };
    }
    save();
    return { ok: false, fail: true, msg: `强化失败（成功率 ${Math.round(rate * 100)}%），装备未降级` };
  }
  function decompose(uid) {
    const eq = S.equips[uid];
    if (!eq) return { ok: false };
    if (eq.lock) return { ok: false, msg: '这件装备已锁定，先解锁再分解' };
    let gain = D.DECOMPOSE_GAIN[eq.rarity];
    gain += Math.floor(eq.enhance * 3);   // 强化投入部分返还
    // 若装备中先卸下
    Object.values(S.equipped).forEach(slots => {
      Object.keys(slots).forEach(k => { if (slots[k] === uid) slots[k] = null; });
    });
    delete S.equips[uid];
    addCur('otherworld', gain);
    save();
    return { ok: true, gain };
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
    return { ok: count > 0, gain, count };
  }
  /* --- 编队预设：3 组槽位，一键保存 / 一键套用 --- */
  function savePreset(idx) {
    if (idx < 0 || idx > 2) return { ok: false, msg: '预设不存在' };
    S.presets[idx] = S.party.slice();
    save();
    return { ok: true, msg: `已保存到预设 ${idx + 1}` };
  }
  function applyPreset(idx) {
    const p = S.presets[idx];
    if (!p) return { ok: false, msg: '该预设还是空的' };
    S.party = normalizeParty(p, 'front');      // 老预设（4 格）与新预设（5 格）都能套
    save();
    return { ok: true, msg: `已套用预设 ${idx + 1}` };
  }
  function inventoryEquips() {
    const equippedUids = new Set();
    Object.values(S.equipped).forEach(slots => Object.values(slots).forEach(u => u && equippedUids.add(u)));
    return Object.values(S.equips).sort((a, b) => D.RARITIES.indexOf(b.rarity) - D.RARITIES.indexOf(a.rarity) || b.enhance - a.enhance);
  }

  /* ================= 站位（前排 / 后排） =================
     规则只有一条：**谁站前排谁挨打**——敌人优先攻击前排，前排没人了才打后排。
     所以谁想站哪一排是玩家的战术选择：主角也不例外。 */
  const ROW_NAME = { front: '前排', back: '后排' };
  function rowOfSlots(row) { return row === 'front' ? [0, 1] : [2, 3, 4]; }
  // 主角站在哪一排：看他自己占的是哪一格（0/1 前排，2/3/4 后排）
  function playerRow() {
    const i = S.party.indexOf('@player');
    return i >= 2 ? 'back' : 'front';
  }
  function setPlayerRow(row) {
    const r = row === 'back' ? 'back' : 'front';
    if (playerRow() === r) return { ok: false, msg: `主角已经在${ROW_NAME[r]}了` };
    const mv = moveMemberRow('@player', r);
    if (!mv.ok) return mv;
    S.player.row = r;      // 兼容：老字段跟着走，读旧档的人也能看对
    save();
    return { ok: true, msg: `主角已换到${ROW_NAME[r]}` };
  }
  // 两个上阵位互换（含空位）：把人挪到另一排，或者同排换顺序
  function swapPartySlots(a, b) {
    a = +a; b = +b;
    const n = S.party.length;
    if (!(a >= 0 && a < n && b >= 0 && b < n)) return { ok: false, msg: '位置不对' };
    if (a === b) return { ok: false, msg: '选的是同一个位置' };
    if (!S.party[a] && !S.party[b]) return { ok: false, msg: '两个位置都是空的' };
    const tmp = S.party[a]; S.party[a] = S.party[b]; S.party[b] = tmp;
    syncPlayerRow();
    save();
    return { ok: true, msg: '已换位', party: S.party.slice() };
  }
  // 老字段 S.player.row 与"主角占哪一格"保持一致（主角站位以 S.party 为准，这里只是同步）
  function syncPlayerRow() {
    if (S.party && S.party.indexOf('@player') >= 0) S.player.row = playerRow();
  }
  // 把某名上阵成员移到另一排：目标排有空位就搬过去，没空位就和那一排第一个换
  function moveMemberRow(id, row) {
    const from = S.party.indexOf(id);
    if (from < 0) return { ok: false, msg: '这名伙伴不在队伍里' };
    const r = row === 'front' ? 'front' : 'back';
    const want = rowOfSlots(r);
    if (want.includes(from)) return { ok: false, msg: `已经在${ROW_NAME[r]}了` };
    const empty = want.find(i => !S.party[i]);
    if (empty !== undefined) {
      S.party[empty] = S.party[from];
      S.party[from] = null;
      syncPlayerRow();
      save();
      return { ok: true, msg: `已移到${ROW_NAME[r]}`, party: S.party.slice() };
    }
    const other = want[0];
    const swapped = S.party[other];
    S.party[other] = S.party[from];
    S.party[from] = swapped;
    syncPlayerRow();
    save();
    const nm = swapped ? charName(swapped) : '队友';
    return { ok: true, msg: `已与「${nm}」换位`, party: S.party.slice() };
  }
  // 谁站在哪一排：界面用（队伍页标签、战斗前的站位预览都读这一处）
  function rowLayout() {
    const out = { front: [], back: [] };
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
      return i < 0 ? null : { idx: i, protag: true };
    }
    if (p === 'row:front' || p === 'row:back') return { row: String(p).slice(4) };
    if (p === '' || p === null || p === undefined) return null;
    const n = +p;
    return (n >= 0 && n < S.party.length) ? { idx: n } : null;
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
    if (!pa || !pb) return { ok: false, msg: '位置不对' };
    if (pb.row) {
      if (pa.row) return { ok: false, msg: '位置不对' };
      const id = S.party[pa.idx];
      if (!id) return { ok: false, msg: '这个位置是空的' };
      return moveMemberRow(id, pb.row);
    }
    if (pa.row) return { ok: false, msg: '位置不对' };
    if (pa.idx === pb.idx) return { ok: false, msg: '选的是同一个位置' };
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
    let list = D.characters.filter(c => c.rarity === rar && !c.hidden);
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
    opts = opts || {};
    let list = charsOfRarity(rar, pool);
    if (!list.length) list = D.characters.filter(c => c.rarity === rar && !c.hidden);
    if (!list.length) list = D.characters;
    // 限定池的 SSR：一半概率直接给当期 UP；保底触发时 100% 给当期 UP
    if (pool === 'limited' && rar === 'SSR') {
      const up = poolUpChar('limited');
      if (up && (opts.forceUp || Math.random() < D.RECRUIT_POOLS.limited.upRatio)) list = [up];
    }
    // 高级池的 SSR/UR 优先给没拥有过的角色（"补图鉴"就是这个池子的定位）
    if (opts.prioritizeNew) {
      const fresh = list.filter(c => !S.chars[c.id]);
      if (fresh.length) list = fresh;
    }
    return list[Math.floor(Math.random() * list.length)];
  }
  function pityOf(pool) {
    S.recruit.pity = S.recruit.pity || {};
    const p = S.recruit.pity[pool] || (S.recruit.pity[pool] = { ssr: 0, ur: 0, up: 0 });
    p.ssr = p.ssr || 0; p.ur = p.ur || 0; p.up = p.up || 0;
    return p;
  }
  // 给界面看的保底进度（普通池没有保底）
  function pityView(pool) {
    if (pool === 'normal' || !D.RECRUIT_POOLS[pool]) return null;
    const p = pityOf(pool);
    return {
      ssr: { n: p.ssr, cap: D.PITY.SSR },
      ur: { n: p.ur, cap: D.PITY.UR },
      up: pool === 'limited' ? { n: p.up, cap: D.PITY_UP } : null,
    };
  }
  // opts.noCost：十连已整笔扣费，单抽不再重复扣（见 recruitTen）
  // opts.noGrant：只决定"抽到谁"，先不入库——十连要先确认有没有 SR 再一起发，
  //   否者补保底时会白送第 11 个人（V9.2 修）
  function recruitOnce(pool, opts) {
    opts = opts || {};
    const p = D.RECRUIT_POOLS[pool];
    if (!p) return { error: '卡池不存在' };
    let usedTicket = null;
    if (!opts.noCost) {
      // 招募券优先于货币：有对应券就先扣券（券是玩法掉出来的，货币是攒出来的）
      if (p.ticket && (S.items[p.ticket] || 0) > 0) { removeItem(p.ticket, 1); usedTicket = p.ticket; }
      else if (!spend(p.cost)) return { error: '货币不足（也没有对应的招募券）' };
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
    const base = pickCharOfRarity(rar, pool, {
      forceUp,
      prioritizeNew: !!p.prioritizeNew && D.RARITIES.indexOf(rar) >= 3,
    });
    if (pool !== 'normal') {
      const pit = pityOf(pool);
      const up = poolUpChar(pool);
      if (D.RARITIES.indexOf(base.rarity) >= 3) pit.ssr = 0;
      if (D.RARITIES.indexOf(base.rarity) >= 4) pit.ur = 0;
      if (up && base.id === up.id) pit.up = 0;
    }
    const res = opts.noGrant ? { isNew: false } : addChar(base.id);
    if (!opts.noGrant) save();
    const upChar = poolUpChar(pool);
    return {
      id: base.id, name: base.name, rarity: base.rarity, isNew: res.isNew, shards: res.shards || 0,
      isUp: !!(upChar && base.id === upChar.id), usedTicket,
    };
  }
  // 某个池现在有多少张券（界面显示"券 N 张"用）
  function ticketOf(pool) {
    const p = D.RECRUIT_POOLS[pool];
    return p && p.ticket ? { id: p.ticket, n: S.items[p.ticket] || 0 } : null;
  }
  function recruitTen(pool) {
    const p = D.RECRUIT_POOLS[pool];
    if (!p) return { error: '卡池不存在' };
    const cost = p.ten || p.cost;
    // 十连是一次交易，规则只有一条：要么 10 张券，要么全额货币，不支持混付（界面也这么写）。
    let usedTickets = 0;
    if (p.ticket && (S.items[p.ticket] || 0) >= 10) { removeItem(p.ticket, 10); usedTickets = 10; }
    else {
      if (!canAfford(cost)) return { error: '货币不足（招募券也不足 10 张）' };
      spend(cost);
    }
    // 先抽完 10 次再统一入库：这样"十连保底 SR"是把最后一次换掉，
    // 而不是额外再补一个人（旧版会白送第 11 个）
    const picks = [];
    for (let i = 0; i < 10; i++) {
      const r = recruitOnce(pool, { noCost: true, noGrant: true });
      if (r.error) return { error: r.error, results: [] };
      picks.push(r);
    }
    if (!picks.some(r => D.RARITIES.indexOf(r.rarity) >= 2)) {
      const base = pickCharOfRarity('SR', pool);
      picks[picks.length - 1] = { id: base.id, name: base.name, rarity: base.rarity, pityFix: true };
    }
    const results = picks.map(r => {
      const res = addChar(r.id);
      return Object.assign({}, r, { isNew: res.isNew, shards: res.shards || 0 });
    });
    save();
    return { results, usedTickets };
  }
  /* 每日免费抽（V9.5.51 父亲大人）：
     普通池：每天 3 次，且**两次之间隔 10 分钟**；高级池：每天 1 次；
     限定池没有免费。次数和"上次用的时间"都按自然日刷新（和每日任务同一把钟）。 */
  const FREE_RULES = { normal: { daily: 3, gapSec: 600 }, advanced: { daily: 1, gapSec: 0 } };
  function freeState(pool) {
    const rule = FREE_RULES[pool];
    if (!rule) return { daily: 0, used: 0, left: 0, ready: false, waitSec: 0 };
    const today = dailyDate();
    const f = S.recruit.free;
    if (f.date !== today) { f.date = today; f.normal = { used: 0, at: 0 }; f.advanced = { used: 0, at: 0 }; }
    const st = f[pool] || (f[pool] = { used: 0, at: 0 });
    const left = Math.max(0, rule.daily - st.used);
    // 次数用完就不再报冷却（界面也就不会再显示倒计时）
    const wait = (rule.gapSec && left > 0) ? Math.max(0, Math.ceil((st.at + rule.gapSec * 1000 - Date.now()) / 1000)) : 0;
    return { daily: rule.daily, used: st.used, left, ready: left > 0 && wait <= 0, waitSec: wait };
  }
  const freeRecruitAvailable = (pool = 'normal') => freeState(pool).ready;
  function freeRecruit(pool = 'normal') {
    const st = freeState(pool);
    if (!st.ready) return { error: st.left <= 0 ? '今日免费次数已用完' : '还要再等一会儿' };
    S.recruit.free[pool].used = st.used + 1;
    S.recruit.free[pool].at = Date.now();
    const rar = rollRarityInPool(pool);                       // 出率跟该池同源
    const base = pickCharOfRarity(rar, pool);
    const res = addChar(base.id);
    S.stats.recruits++;
    task('recruit1', 1);
    save();
    return { id: base.id, name: base.name, rarity: base.rarity, isNew: res.isNew, shards: res.shards || 0, free: true, pool };
  }
  function ssrTicketUse(charId) {
    const base = D.charById[charId];
    if (!base || base.rarity !== 'SSR' || S.ssrTicket <= 0) return { ok: false, msg: '无法选择' };
    S.ssrTicket--;
    addChar(charId);
    S.stats.recruits++;
    save();
    return { ok: true, msg: `获得 ${base.name}` };
  }

  /* ================= 挂机 ================= */
  // 2026-09-12 调整产出：点数 (10+0.3Lv) / 分、经验 (8+0.5Lv) / 分，
  // 与等级曲线（Lv1→100 累计 EXP 74.4 万 / 点数 22.6 万）配套；天赋「灯阁恩赐」的挂机/经验节点在此生效。
  function idleBaseRates() {
    const lv = S.player.level;
    const au = authority();
    const kb = kejiBonus();
    const coreBonus = (1 + S.buildings.core * 0.02 + (S.player.geneLock >= 1 ? 0.10 : 0) + au.idlePct + kb.idlePct) * graceIdleMult() * signIdleMult();
    return {
      pointsPerMin: (10 + lv * 0.3) * coreBonus,
      // V9.5.65（策划体检）：经验斜率 0.5 → 0.7、底数 8 → 10。
      // 旧值配合 80×Lv^1.32 的经验表，纯挂机到 Lv.20 要 33 小时；现在约 13 小时。
      expPerMin: (10 + lv * 0.7) * (1 + S.buildings.training * 0.03 + au.expPct + kb.expPct) * graceExpMult(),
      otherworldPer10Min: 1 + Math.floor(lv / 50),
      storyPer30Min: 1,
    };
  }
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
    const bonuses = {};
    D.IDLE_LINES.forEach(l => { bonuses[l.id] = idleLineBonus(l.id); });
    const base = idleBaseRates();
    return {
      bonuses,
      points: base.pointsPerMin * bonuses.explore,
      exp: base.expPerMin * bonuses.cultivate,
      otherworld: base.otherworldPer10Min * bonuses.guard,
      matPerMin: bonuses.gather > 0 ? D.IDLE_MAT_PER_MIN * (1 + bonuses.gather) : 0,
    };
  }
  function idleRates() {
    const base = idleBaseRates();
    const c = idleLineContrib();
    return {
      pointsPerMin: base.pointsPerMin + c.points,
      expPerMin: base.expPerMin + c.exp,
      otherworldPer10Min: base.otherworldPer10Min + c.otherworld,
      storyPer30Min: base.storyPer30Min,
      matPerMin: c.matPerMin,
      lineBonuses: c.bonuses,
    };
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
      else if (l.out === 'otherworld') per = `+${c.otherworld.toFixed(2)} 结晶 / 10 分`;
      else per = `+${c.matPerMin.toFixed(2)} 材料 / 分`;
      const st = leaderId ? effectiveStats(leaderId) : null;
      const attrValue = (st && st.attrs && l.attr) ? Math.round(st.attrs[l.attr] || 0) : 0;
      return { line: l, leaderId, bonus, attrValue, per: leaderId ? per : '未派领队，不产出' };
    });
  }
  // 派遣 / 撤下领队：上阵主力不能派（他们要出战），同一个人不能同时管两条线
  function setIdleLeader(lineId, charId) {
    if (!D.IDLE_LINES.some(l => l.id === lineId)) return { ok: false, msg: '没有这条产线' };
    if (!charId) { S.idle.lines[lineId] = null; save(); return { ok: true, msg: '已撤下领队' }; }
    if (!S.chars[charId]) return { ok: false, msg: '没有这名伙伴' };
    if (S.party.includes(charId)) return { ok: false, msg: '上阵主力不能派去挂机，先把他换下来' };
    const other = D.IDLE_LINES.find(l => l.id !== lineId && S.idle.lines[l.id] === charId);
    if (other) return { ok: false, msg: `他已经在「${other.name}」了` };
    S.idle.lines[lineId] = charId;
    save();
    return { ok: true, msg: `${charName(charId)} 已派往「${D.IDLE_LINES.find(l => l.id === lineId).name}」` };
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
    if (now < last - 60000) { S.idle.lastTs = now; return { cheat: true }; }   // 防改时间
    const elapsedSec = Math.min((now - last) / 1000, offlineCapHours() * 3600);
    if (elapsedSec < 60) { S.idle.lastTs = now; return null; }
    const eff = offlineEfficiency();
    const r = idleRates();
    const mins = elapsedSec / 60 * eff;
    const gains = {
      points: Math.round(r.pointsPerMin * mins),
      exp: Math.round(r.expPerMin * mins),
      otherworld: Math.floor(elapsedSec / 600) * r.otherworldPer10Min,
      story: Math.floor(elapsedSec / 1800) * r.storyPer30Min,
      mat: Math.floor((r.matPerMin || 0) * mins),
    };
    /* ⚠️ 离线收益必须**在这里**入账。
       以前入账写在 UI.showOfflineGains 里（那是"弹结算窗"的地方），而 main.js 只在
       离线 ≥5 分钟时才调它——于是离线 1~5 分钟的收益算完就被丢掉，lastTs 却已经推到当前时间，
       玩家白等一场。现在改成：核心负责入账，UI 只负责显示，弹不弹窗与拿不拿到彻底分开（V9.5 修）。 */
    addCur('points', gains.points);
    addCur('otherworld', gains.otherworld);
    addCur('story', gains.story);
    addPlayerExp(gains.exp);
    const matOut = grantIdleMat(gains.mat);
    if (matOut && matOut.count > 0) { gains.matItem = matOut.item; gains.matCount = matOut.count; gains.mat = matOut.count; }
    else { gains.matFull = !!(matOut && matOut.full); gains.matStashed = (matOut && matOut.stashed) || 0; gains.mat = 0; }
    S.idle.lastTs = now;
    travelAccrue(elapsedSec);      // 离线时间同样攒"游历奇遇"
    addSectExp(Math.floor(elapsedSec / 60 * D.SECT_EXP.perMin));
    save();
    return { seconds: elapsedSec, gains, efficiency: eff };
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
    return {
      points: Math.floor(r.pointsPerMin * mins),
      exp: Math.floor(r.expPerMin * mins),
      otherworld: Math.floor(Math.floor(S.idle.bankSec / 600) * r.otherworldPer10Min),
      story: Math.floor(S.idle.bankSec / 1800) * r.storyPer30Min,
      mat: Math.floor((r.matPerMin || 0) * mins),
      seconds: S.idle.bankSec,
    };
  }
  // 采集产线产出的材料按玩家等级换成对应档位（越往后材料越高级，但数量按 2 的幂递减）
  function idleMatItem() {
    const tier = Math.min(5, 1 + Math.floor(S.player.level / 20));
    return { item: 'mat_t' + tier, tier };
  }
  // 折算并入库；背包满就整批跳过（宁可少收，也不吞玩家的东西）
  function grantIdleMat(units) {
    if (!(units > 0)) return null;
    const mi = idleMatItem();
    const count = Math.floor(units / Math.pow(2, mi.tier - 1));
    if (count <= 0) return null;
    // 背包满：不吞玩家的东西，先记进待领箱（清出格子后在背包页一键领回）
    if (!addItem(mi.item, count)) { stashItem(mi.item, count); return { item: mi.item, count: 0, tier: mi.tier, full: true, stashed: count }; }
    return { item: mi.item, count, tier: mi.tier };
  }
  function claimIdle() {
    const g = idleBankGains();
    addCur('points', g.points);
    addCur('otherworld', g.otherworld);
    addCur('story', g.story);
    addPlayerExp(g.exp);
    /* V9.5.79（自审·长线模拟）：**在线挂机也要产评级经验**。
       以前只有 settleOffline（离线结算）里那一行会加，而玩法指南写的是"挂机每分钟 +1.2"——
       于是把游戏开着挂一整天的玩家，评级经验一点不涨（同一段时间，离线算、在线不算，两套口径）。
       现在按同样的比例补上；离线那条走 elapsedSec、这条走 bankSec，两个时间窗互不重叠，不会重复计。 */
    addSectExp(Math.floor(S.idle.bankSec / 60 * D.SECT_EXP.perMin));
    // 采集产线的材料：按档位折算，背包满就跳过（不吞玩家的东西，只是这一轮收不进来）
    if (g.mat > 0) {
      const m = grantIdleMat(g.mat);
      if (m && m.count > 0) { g.matItem = m.item; g.matCount = m.count; g.mat = m.count; }
      else { g.matFull = !!(m && m.full); g.matStashed = (m && m.stashed) || 0; g.mat = 0; }
    }
    S.idle.bankSec = 0;
    task('idle1', 1);
    save();
    return g;
  }
  function addPlayerExp(n) {
    // V9.5.86：同样的道理——非有限数会让经验变成 Infinity/-Infinity，字符串会拼接成 '0abc'
    const raw = typeof n === 'string' ? Number(n) : n;
    if (!Number.isFinite(raw) || !raw) return;
    S.player.exp += raw;
    while (S.player.level < D.PLAYER_MAX_LV && S.player.exp >= D.EXP_TABLE[S.player.level]) {
      S.player.exp -= D.EXP_TABLE[S.player.level];
      S.player.level++;
      S.player.attrPoints = (S.player.attrPoints || 0) + D.ATTR_POINTS_PER_LV;
    }
    S.player.skillPoints = skillPointsForLevel();   // V9.5.78：技能点按等级重算（见上面的说明）
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
    const spent = (S.player.skillLv || [0, 0, 0]).reduce((a, b) => a + b, 0);
    return Math.max(0, Math.min(S.player.level || 0, cap) - spent);
  }

  /* ================= 主角技能加点 ================= */
  // 技能组：觉醒血统后替换为血统技能
  function protagonistSkills() {
    return (S.player.bloodline && D.BLOODLINE_SKILLS[S.player.bloodline]) || D.PROTAGONIST.skills;
  }
  function allocateSkill(idx) {
    const lv = S.player.skillLv || (S.player.skillLv = [0, 0, 0]);
    if (idx < 0 || idx > 2) return { ok: false, msg: '技能不存在' };
    if (lv[idx] >= D.SKILL_MAX_BY_INDEX[idx]) return { ok: false, msg: '已满级' };
    if ((S.player.skillPoints || 0) < 1) return { ok: false, msg: '没有可用技能点' };
    S.player.skillPoints--;
    lv[idx]++;
    save();
    return { ok: true, msg: `技能升到 Lv.${lv[idx]}` };
  }
  function resetSkills() {
    /* V9.5.71（自审）：技能从 1 基改成 0 基之后这里漏改了——
       原来退的是 sum(等级-1)、重置成 [1,1,1]，而技能等级从 0 起算意味着：
       退 2 点却把三条技能又放回 1 级（净赚 3 级），反复洗点可以白刷技能等级。
       现在按 0 基口径：退 sum(等级)、重置成 [0,0,0]。 */
    const lv = S.player.skillLv || [0, 0, 0];
    const refund = lv.reduce((s, x) => s + x, 0);
    if (refund <= 0) return { ok: false, msg: '尚未加点' };
    S.player.skillLv = [0, 0, 0];
    S.player.skillPoints = (S.player.skillPoints || 0) + refund;
    save();
    return { ok: true, msg: `已重置，返还 ${refund} 点技能点` };
  }

  // 六维属性点分配（每点 +ATTR_POINT_VALUE 维值）
  function allocateAttr(attrId, n = 1) {
    if (!D.ATTR_META.some(a => a.id === attrId)) return { ok: false, msg: '属性不存在' };
    n = Math.min(n, S.player.attrPoints || 0);
    if (n <= 0) return { ok: false, msg: '没有可用属性点' };
    S.player.attrPoints -= n;
    S.player.attrs[attrId] = (S.player.attrs[attrId] || 0) + n;
    save();
    return { ok: true, msg: `${D.ATTR_META.find(a => a.id === attrId).name} +${n * D.ATTR_POINT_VALUE}` };
  }
  // 六维洗点：把已经分出去的属性点全部退回"可用点数"，免费、可反复洗。
  // 和 resetSkills 对称：加错了不该逼人重开档。
  function resetAttrs() {
    const spent = D.ATTR_META.reduce((s, a) => s + ((S.player.attrs && S.player.attrs[a.id]) || 0), 0);
    if (spent <= 0) return { ok: false, msg: '还没分配过属性点' };
    S.player.attrs = ATTR_ZERO();
    S.player.attrPoints = (S.player.attrPoints || 0) + spent;
    save();
    return { ok: true, msg: `已洗点，退回 ${spent} 点属性点` };
  }

  /* ================= 多主角（新建角色体验不同血统） ================= */
  const PROTAGONIST_KEYS = ['name', 'level', 'exp', 'bloodline', 'bloodlineLv', 'attrPoints', 'attrs', 'skillPoints', 'skillLv'];
  function snapshotProtagonist() {
    const p = {};
    PROTAGONIST_KEYS.forEach(k => { p[k] = S.player[k]; });
    p.attrs = Object.assign(ATTR_ZERO(), p.attrs);
    p.skillLv = (p.skillLv || [0, 0, 0]).slice();
    return p;
  }
  function restoreProtagonist(p) {
    PROTAGONIST_KEYS.forEach(k => { S.player[k] = p[k]; });
    S.player.attrs = Object.assign(ATTR_ZERO(), p.attrs);
    S.player.skillLv = (p.skillLv || [0, 0, 0]).slice();
  }
  function protagonistList() {
    return [
      Object.assign(snapshotProtagonist(), { current: true }),
      ...S.altPlayers.map((p, i) => Object.assign({}, p, { altIndex: i })),
    ];
  }
  function createProtagonist(name) {
    name = (name || '').trim();
    if (!name) return { ok: false, msg: '名字不能为空' };
    if (S.altPlayers.length >= 6) return { ok: false, msg: '最多创建 6 个额外主角' };
    S.altPlayers.push(snapshotProtagonist());
    restoreProtagonist(freshProtagonist(name));
    save();
    return { ok: true, msg: `新主角「${name}」已创建，天赋与血统从 Lv.1 重新选` };
  }
  function switchProtagonist(altIndex) {
    const alt = S.altPlayers[altIndex];
    if (!alt) return { ok: false, msg: '主角不存在' };
    const cur = snapshotProtagonist();
    S.altPlayers[altIndex] = cur;
    restoreProtagonist(alt);
    save();
    return { ok: true, msg: `已切换为「${S.player.name}」` };
  }

  /* ================= 建筑 ================= */
  function upgradeBuilding(id) {
    const lv = S.buildings[id];
    if (lv >= 50) return { ok: false, msg: '已满级' };
    const cost = { points: D.buildingCost(id, lv) };
    if (!spend(cost)) return { ok: false, msg: '点数不足' };
    S.buildings[id]++;
    save();
    return { ok: true, msg: `升到 Lv.${S.buildings[id]}` };
  }

  /* ================= 灯阁权限（对标《道友修仙》的"洞府"） ================= */
  // 建筑用点数（软货币）升级，这条线专用高级货币（✦ 圣洁晶石 + ◆ 异界结晶）——
  // 目的：给"抽卡之外"的高级货币一个长线出口，投进去就永久生效，转生也保留。
  function authority() { return D.authorityBonus(S.auth || 0); }
  function authorityInfo() {
    const lv = S.auth || 0;
    const max = D.AUTHORITY_MAX;
    return {
      lv, max,
      maxed: lv >= max,
      cost: lv >= max ? null : D.authorityCost(lv),
      now: authority(),
      nextDesc: lv >= max ? null : D.AUTHORITY[lv].desc,
      rows: D.AUTHORITY,
    };
  }
  function upgradeAuthority() {
    const lv = S.auth || 0;
    if (lv >= D.AUTHORITY_MAX) return { ok: false, msg: '灯阁权限已满级' };
    const cost = D.authorityCost(lv);
    if (!canAfford(cost)) return { ok: false, msg: `材料不足：需要 ${cost.holy} 圣洁晶石 + ${cost.otherworld} 异界结晶` };
    spend(cost);
    S.auth = lv + 1;
    save();
    return { ok: true, msg: `灯阁权限提升到 Lv.${S.auth}` };
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
    return {
      lv, exp, need, max: D.SECT_MAX, maxed: lv >= D.SECT_MAX,
      pct: D.sectBonusPct(lv),                 // 当前全队加成（数值，不是对象）
      nextPct: D.sectBonusPct(Math.min(D.SECT_MAX, lv + 1)),
      rate: D.SECT_PCT_PER_LV,
      gain: D.SECT_EXP,
    };
  }
  // 每级：全队全属性 +0.5%（与铭刻 / 血统 / 血清同为百分比区，加算）
  function sectBonusPct() {
    if (!S.sect) return { atkPct: 0, hpPct: 0, defPct: 0, spdPct: 0, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0 };
    const v = D.sectBonusPct(S.sect.lv || 0);
    return { atkPct: v, hpPct: v, defPct: v, spdPct: v, critPct: 0, critDmg: 0, skillPct: 0, evaPct: 0 };
  }
  function applySect(pct) {
    const s = sectBonusPct();
    Object.keys(s).forEach(k => { if (s[k]) pct[k] = (pct[k] || 0) + s[k]; });
  }
  // 涨评级经验；返回本次升了几级（UI 用来提示"评级提升"）
  function addSectExp(n) {
    if (!n || n <= 0) return 0;
    if (!S.sect) S.sect = { lv: 0, exp: 0 };
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
    const out = { combat: {}, idlePct: 0, expPct: 0, dropPct: 0, offlinePct: 0 };
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
    if (!k) return { ok: false, msg: '没有这条秘术' };
    let done = 0;
    for (let i = 0; i < times; i++) {
      const cost = kejiCostOf(id);
      if (cost === null) break;
      if ((S.cur[D.KEJI_COIN] || 0) < cost) break;
      addCur(D.KEJI_COIN, -cost);
      S.keji[id] = kejiLv(id) + 1;
      done++;
    }
    if (!done) {
      const cost = kejiCostOf(id);
      return { ok: false, msg: cost === null ? `${k.name} 已满级` : `${curMeta(D.KEJI_COIN).name}不足（需要 ${cost}）` };
    }
    const lv = kejiLv(id);
    save();
    return { ok: true, msg: `${k.name} 提升到 Lv.${lv}（${k.info} +${(k.rate * lv * 100).toFixed(1)}%）`, lv, done };
  }

  /* ================= 挂机游历奇遇（对标《道友修仙》的 YouLi） =================
     节奏（父亲大人定的）：进游戏后第 5 分钟出第一次，之后 10 / 20 / 30 / 40 / 50 分钟，
     60 分钟封顶（再往后固定每小时一次）。**领完才开始算下一轮**，待领的时候不计时，
     所以不会攒着一堆没领的；跨天（自然日）重新从第一次开始。
     攒满停在"待触发"，不会过期丢东西。界面上不写这套说明，玩家看进度条就行。 */
  function travelBank() {
    if (!S.travel) S.travel = { bankSec: 0, pending: null, got: 0, round: 0, day: '' };
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
    return { sec: t.bankSec, every, round: t.round, pct: Math.min(1, t.bankSec / every), pending: t.pending };
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
    if (!tv) return { ok: false, msg: '还没有新的游历' };
    applyRewardObj(tv.effect);
    const rolled = travelDayRoll(t);      // 跨天才来领：这一轮按新的一天从头算
    t.pending = null;
    t.round = rolled ? 0 : t.round + 1;   // 领完才开始算下一轮，间隔按节奏表往后走
    t.bankSec = 0;
    t.got = (t.got || 0) + 1;
    save();
    return { ok: true, msg: `${tv.name}：${travelRewardText(tv)}`, travel: tv };
  }
  function travelRewardText(tv) {
    return rewardTextOf(tv.effect);
  }
  // 把效果对象写成一行可读文字（说明由效果派生，不另写一套文案）
  function rewardTextOf(eff) {
    const parts = [];
    const curKeys = ['points', 'story', 'otherworld', 'holy', 'skillChip', 'bloodCrystal', 'corridor', 'rp'];
    curKeys.forEach(k => { if (eff[k]) parts.push(`${curMeta(k).icon}${eff[k]}`); });
    if (eff.item) [].concat(eff.item).forEach(id => parts.push(`${(D.ITEMS[id] || {}).name || id}×1`));
    return parts.join(' · ') || '空手而归';
  }
  function curMeta(id) { return D.CURRENCIES.find(c => c.id === id) || { name: id, icon: '' }; }

  /* ================= 药园（对标《道友修仙》洞府里的"药园"） ================= */
  // 种下去等时间，回来收材料——给"点数"开一个稳定出口，也给强化材料一条不用刷副本的路。
  function gardenState() {
    if (!S.garden) S.garden = Array(D.GARDEN_PLOTS).fill(null);
    return D.GARDEN.map((g, i) => {
      const plot = S.garden[i] || null;
      const leftMs = plot ? Math.max(0, plot.at - Date.now()) : 0;
      return { idx: i, kind: g, plot, leftMs, ready: !!plot && leftMs <= 0 };
    });
  }
  function plantGarden(idx, gardenId) {
    const g = D.GARDEN.find(x => x.id === gardenId);
    if (!g) return { ok: false, msg: '没有这种灵田' };
    if (S.garden[idx]) return { ok: false, msg: '这块地还种着东西' };
    if (!canAfford({ points: g.points })) return { ok: false, msg: `◈ 点数不足（需要 ${fmtNum(g.points)}）` };
    spend({ points: g.points });
    S.garden[idx] = { id: g.id, at: Date.now() + g.sec * 1000 };
    save();
    return { ok: true, msg: `已种下「${g.name}」，${Math.round(g.sec / 60)} 分钟后可收` };
  }
  // 收获一块地；熟了才让收（没熟的提示还剩多久）
  function harvestGarden(idx) {
    const p = S.garden[idx];
    if (!p) return { ok: false, msg: '这块地是空的' };
    if (Date.now() < p.at) return { ok: false, msg: `还没熟（剩 ${Math.ceil((p.at - Date.now()) / 1000)} 秒）` };
    const g = D.GARDEN.find(x => x.id === p.id);
    const got = [];
    // 收获一律保底：装得下进背包，装不下进待领箱——绝不出现"地清了、东西没了"
    const take = (id, n) => {
      const nm = `${(D.ITEMS[id] || {}).name || id}×${n}`;
      if (addItem(id, n)) { got.push(nm); return; }
      stashItem(id, n);
      got.push(`${nm}（背包满，已存待领箱）`);
    };
    take(g.out.item, g.out.n);
    if (g.extra && Math.random() < g.extra.p) {
      const before = got.length;
      take(g.extra.item, g.extra.n);
      got[before] = '稀有 ' + got[before];
    }
    S.garden[idx] = null;
    save();
    return { ok: true, msg: `收获：${got.join(' · ')}`, got };
  }
  function harvestAllGarden() {
    const out = [];
    gardenState().forEach(s => { if (s.ready) { const r = harvestGarden(s.idx); if (r.ok) out.push(r.msg); } });
    return { ok: out.length > 0, msg: out.length ? `收了 ${out.length} 块地` : '没有成熟的地', list: out };
  }

  /* ================= 斗法台（对标《道友修仙》的斗法 / Arena） =================
     单机没真 PVP，所以守擂者按你自己的队伍战力换算——层数越高越强，每天 5 次。 */
  function arenaState() {
    if (!S.arena) S.arena = { floor: 1, best: 1, date: '', used: 0 };
    if (S.arena.date !== dailyDate()) { S.arena.date = dailyDate(); S.arena.used = 0; }
    const floor = S.arena.floor;
    return {
      floor, best: S.arena.best, used: S.arena.used, cap: D.ARENA_DAILY,
      left: Math.max(0, D.ARENA_DAILY - S.arena.used),
      reward: D.arenaReward(floor),
      enemies: D.arenaEnemy(floor, teamPower()),
    };
  }
  // 打完一台：赢则升台拿奖励，输则退一台（保底第 1 台，不会卡死）
  function arenaSettle(win) {
    const st = arenaState();
    if (st.left <= 0) return { ok: false, msg: '今日斗法次数已用完' };
    S.arena.used++;
    task('arena1', 1);          // 每日任务：斗法台守擂 1 次
    let msg;
    if (win) {
      const rw = D.arenaReward(S.arena.floor);
      Object.entries(rw).forEach(([k, v]) => addCur(k, v));
      S.arena.floor++;
      S.arena.best = Math.max(S.arena.best, S.arena.floor);
      msg = `守擂成功！升到第 ${S.arena.floor} 台 · ◆ ${rw.otherworld} · ♜ ${rw.corridor}`;
    } else {
      S.arena.floor = Math.max(1, S.arena.floor - 1);
      msg = '守擂失败，退一台再来（次数照常消耗）';
    }
    save();
    return { ok: true, win, msg, floor: S.arena.floor, left: Math.max(0, D.ARENA_DAILY - S.arena.used) };
  }

  /* ================= 法宝（对标《道友修仙》的法宝） =================
     装备给数值，法宝给效果：主角带 1 件，按效果并进属性区 / 战斗额外区。 */
  function fabaoState() {
    if (!S.fabao) S.fabao = { own: [], on: null };
    return {
      own: S.fabao.own.slice(), on: S.fabao.on,
      list: D.FABAO.map(f => Object.assign({}, f, { owned: S.fabao.own.includes(f.id), active: S.fabao.on === f.id })),
    };
  }
  function buyFabao(id) {
    const f = D.fabaoById(id);
    if (!f) return { ok: false, msg: '没有这件法宝' };
    if (!S.fabao) S.fabao = { own: [], on: null };
    if (S.fabao.own.includes(id)) return { ok: false, msg: `已经有「${f.name}」了` };
    if ((S.cur.otherworld || 0) < f.cost) return { ok: false, msg: `◆ 异界结晶不足（需要 ${f.cost}）` };
    addCur('otherworld', -f.cost);
    S.fabao.own.push(id);
    if (!S.fabao.on) S.fabao.on = id;
    save();
    return { ok: true, msg: `得到法宝「${f.name}」：${f.desc}` };
  }
  function wearFabao(id) {
    if (!S.fabao) S.fabao = { own: [], on: null };
    if (id && !S.fabao.own.includes(id)) return { ok: false, msg: '还没有这件法宝' };
    S.fabao.on = id || null;
    save();
    return { ok: true, msg: id ? `已佩戴「${D.fabaoById(id).name}」` : '已摘下法宝' };
  }
  // 法宝效果：数值类进 pct，战斗额外类进 extra（与转生天赋的额外字段同一处）
  function applyFabao(pct, extra) {
    const f = (S.fabao && S.fabao.on) ? D.fabaoById(S.fabao.on) : null;
    if (!f) return;
    Object.entries(f.eff).forEach(([k, v]) => {
      if (k === 'dmgReduce' || k === 'initEnergy') { extra[k] = (extra[k] || 0) + v; return; }
      pct[k] = (pct[k] || 0) + v;
    });
  }
  // 触发时的定时器入口（在线挂机每秒调用）
  function travelTick(dtSec) { travelAccrue(dtSec); }

  /* ================= 坐骑（对标《道友修仙》的坐骑） =================
     法宝给"效果"、坐骑给"基础数值"：驯服一匹全队（含主角）永久加成，随时能换乘。 */
  function mountState() {
    if (!S.mount) S.mount = { own: [], on: null };
    return {
      own: S.mount.own.slice(), on: S.mount.on,
      list: D.MOUNTS.map(m => Object.assign({}, m, { owned: S.mount.own.includes(m.id), active: S.mount.on === m.id })),
    };
  }
  function buyMount(id) {
    const m = D.mountById(id);
    if (!m) return { ok: false, msg: '没有这匹坐骑' };
    if (!S.mount) S.mount = { own: [], on: null };
    if (S.mount.own.includes(id)) return { ok: false, msg: `已经有「${m.name}」了` };
    // 货币部分走 canAfford / spend，材料部分走背包（两者口径分开，报错能指明缺哪一样）
    const curCost = Object.assign({}, m.cost);
    delete curCost.mat; delete curCost.matN;
    if (!canAfford(curCost)) {
      const lack = Object.entries(curCost).filter(([k, v]) => (S.cur[k] || 0) < v)
        .map(([k, v]) => `${curMeta(k).name} ${fmtNum(v)}`).join(' + ');
      return { ok: false, msg: `货币不足：需要 ${lack}` };
    }
    if (m.cost.mat && (S.items[m.cost.mat] || 0) < m.cost.matN) {
      return { ok: false, msg: `${(D.ITEMS[m.cost.mat] || {}).name || m.cost.mat}不足（需要 ${m.cost.matN}，现有 ${S.items[m.cost.mat] || 0}）` };
    }
    spend(curCost);
    if (m.cost.mat) removeItem(m.cost.mat, m.cost.matN);
    S.mount.own.push(id);
    if (!S.mount.on) S.mount.on = id;
    save();
    return { ok: true, msg: `驯服了坐骑「${m.name}」：${m.desc}` };
  }
  function wearMount(id) {
    if (!S.mount) S.mount = { own: [], on: null };
    if (id && !S.mount.own.includes(id)) return { ok: false, msg: '还没有这匹坐骑' };
    S.mount.on = id || null;
    save();
    return { ok: true, msg: id ? `已乘骑「${D.mountById(id).name}」` : '已下坐骑' };
  }
  // 坐骑加成：全队（含主角）通用，所以在两条属性计算路径里都要调用
  function applyMount(pct) {
    const m = (S.mount && S.mount.on) ? D.mountById(S.mount.on) : null;
    if (!m) return;
    Object.entries(m.pct).forEach(([k, v]) => { pct[k] = (pct[k] || 0) + v; });
  }

  /* ================= 求签（对标《道友修仙》的求签） =================
     每天免费摇一次签：签文分五档，给当天的挂机加成 + 一点硬通货。
     它解决的是"每天上线第一件事点哪里"——先求一签，再看今天要干嘛。 */
  function signState() {
    if (!S.sign) S.sign = { date: '', tier: '', idlePct: 0, drawn: 0 };
    const today = dailyDate();
    const fresh = S.sign.date === today;
    return {
      fresh, drawn: S.sign.drawn || 0,
      tier: fresh ? S.sign.tier : '', idlePct: fresh ? (S.sign.idlePct || 0) : 0,
      pick: fresh ? (D.SIGNS.find(s => s.tier === S.sign.tier) || null) : null,
      canDraw: !fresh,
      total: (S.stats && S.stats.signs) || 0,
    };
  }
  function drawSign() {
    const st = signState();
    if (!st.canDraw) return { ok: false, msg: '今天已经求过签了，明天再来' };
    const s = D.rollSign();
    S.sign = { date: dailyDate(), tier: s.tier, idlePct: s.idlePct, drawn: (S.sign.drawn || 0) + 1 };
    S.stats.signDraws = (S.stats.signDraws || 0) + 1;   // 主线「求签」用（drawn 只记今天）
    applyRewardObj(s.gain);
    S.stats.signs = (S.stats.signs || 0) + 1;
    task('sign1', 1);           // 每日任务：求签 1 次
    save();
    return { ok: true, sign: s, msg: `求得【${s.tier}】：${s.text}` };
  }
  // 今日签文的挂机加成：只加成当天，隔天自动失效（按日期判定，不做定时器）
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
      S.worlds[id] = { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
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
      if (!S.worldFirstClear[fcKey]) {
        S.worldFirstClear[fcKey] = true;
        firstClearReward = D.FIRST_CLEAR[diff];
        Object.entries(firstClearReward).forEach(([k, v]) => addCur(k, v));
      }
    }
    S.stats.runs++;
    task('dungeon1', 1);
    // 灯阁评级经验：打关卡就涨，首通给全额，重复刷给一半（对标"宗门等级随进度涨"）
    const sectGain = Math.round((D.SECT_EXP[diff] || D.SECT_EXP.normal) * (first ? 1 : 0.5));
    const sectUp = addSectExp(sectGain);
    const newUnlocks = refreshUnlocks();
    save();
    return { first, firstClearReward, newUnlocks, sectGain, sectUp };
  }
  // 根据当前进度刷新功能解锁，返回本次新解锁的功能名列表
  function refreshUnlocks() {
    const newly = [];
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
    return D.MAIN_QUESTS.map(q => ({
      q,
      done: q.check(S),
      claimed: S.quests.claimed.includes(q.id),
    }));
  }
  function currentQuest() {
    const list = mainQuestState();
    return list.find(x => !x.claimed) || null;
  }
  function claimQuest(id) {
    const q = D.MAIN_QUESTS.find(x => x.id === id);
    if (!q || S.quests.claimed.includes(id)) return { ok: false };
    if (!q.check(S)) return { ok: false, msg: '尚未完成' };
    S.quests.claimed.push(id);
    applyRewardObj(q.reward);
    // 任务上写的 unlock 是真的会发出去的（之前只写在表里没人执行，等于装饰）。
    // 返回"这次真正解锁了哪几个"，界面照着弹——避免弹的是隔壁那个任务的内容。
    const unlocked = [];
    String(q.unlock || '').split(',').filter(Boolean).forEach(uid => {
      if (S.unlocks[uid]) return;
      S.unlocks[uid] = true;
      const u = D.UNLOCKS.find(x => x.id === uid);
      if (u) unlocked.push(u.name);
    });
    save();
    return { ok: true, unlocked };
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
    if (!it || !it.req || !it.req.world) return { ok: true };
    const w = it.req.world;
    if (worldCleared(w, 'normal')) return { ok: true };
    const wd = D.WORLDS.find(x => x.id === w);
    return { ok: false, req: `通关 ${wd ? wd.name : w}·普通` };
  }
  function buyShopItem(shopId, idx) {
    const shop = D.SHOPS[shopId];
    const it = shop.items[idx];
    if (!it) return { ok: false, msg: '商品不存在' };
    const avail = shopReq(it);
    if (!avail.ok) return { ok: false, msg: `🔒 ${avail.req} 后解锁` };
    const key = shopId + '_' + idx + '_' + dailyDate();
    if (it.stock > 0 && (S.shop.bought[key] || 0) >= it.stock) return { ok: false, msg: '今日已售罄' };
    // 背包满时先拦下来，避免"钱扣了、道具没进包"
    if (it.item && !canAddItem(it.item)) return { ok: false, msg: '背包已满，先扩容或分解装备' };
    if (!spend({ [shop.currency]: it.price })) return { ok: false, msg: '货币不足' };
    S.shop.bought[key] = (S.shop.bought[key] || 0) + 1;
    if (it.item && !addItem(it.item, it.count || 1)) {
      addCur(shop.currency, it.price);            // 兜底退款，双保险
      return { ok: false, msg: '背包已满，已退还货币' };
    }
    if (it.currencyGain) Object.entries(it.currencyGain).forEach(([k, v]) => addCur(k, v));
    if (it.shardRandom) {
      const c = pickCharOfRarity(it.shardRandom, 'normal');
      addShards(c.id, it.shardCount);
      it._lastShard = c.name;
    }
    save();
    return { ok: true, msg: '购买成功' + (it._lastShard ? `（${it._lastShard}碎片）` : '') };
  }
  function openBox(itemId) {
    const item = D.ITEMS[itemId];
    if (!item || item.type !== 'box') return { ok: false, msg: '不是宝箱' };
    if (!removeItem(itemId)) return { ok: false, msg: '没有该宝箱' };
    // UR 箱：10% 开出伙伴专属装备（UR，六支血统各一件，见 data.js 的 SIGNATURE_EQUIPS）
    if (item.rarity === 'UR' && Math.random() < 0.10) {
      const sigId = Math.floor(Math.random() * D.SIGNATURE_EQUIPS.length);
      const sigRes = grantSignatureEquip(sigId);
      save();
      if (sigRes.equip) return { ok: true, equip: sigRes.equip, signature: true };
      if (sigRes.sold) return { ok: true, sold: true, gain: sigRes.gain || 0 };
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
    const res = grantEquip(worldId, rarity, undefined, { preferWorldSet: true });
    save();
    return { ok: true, equip: res.equip, sold: res.sold, gain: res.gain || 0 };
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
  function openBoxes(itemId, n = 1) {
    const have = S.items[itemId] || 0;
    if (have < 1) return { ok: false, msg: '没有该宝箱' };
    const use = Math.max(1, Math.min(n, have));
    const equips = [];
    let sold = 0, soldGain = 0;
    for (let i = 0; i < use; i++) {
      const r = openBox(itemId);
      if (!r.ok) break;
      if (r.equip) equips.push(r.equip);
      if (r.sold) { sold++; soldGain += r.gain || 0; }
    }
    return { ok: equips.length + sold > 0, equips, sold, soldGain, count: equips.length + sold };
  }
  // 每日刷新的"今天是哪天"。**必须用本地日期**：
  // 之前用 toISOString()（UTC），北京时间要等到早上 8 点才翻新，
  // 而周常、免费招募走的是本地时间——同一天里两套钟，界面写着"每天 0 点重置"却对不上（V9.2 修）。
  function dailyDate() {
    const d = new Date();
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
    if (S.sweep.date !== dailyDate()) { S.sweep.date = dailyDate(); S.sweep.count = 0; S.sweep.bonus = 0; }
  }
  // 今日剩余扫荡次数（跨天自动重置）
  function sweepLeft() {
    ensureSweepDay();
    return Math.max(0, sweepCap() + (S.sweep.bonus || 0) - (S.sweep.count || 0));
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
    if (S.tasks.date !== today) {
      S.tasks.date = today; S.tasks.daily = {}; S.tasks.claimed = {}; S.tasks.allClaimed = false;
    }
    ensureWeekly();
  }
  // 周一为一周起点；跨周自动清空周常进度
  function weekKey() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    const p = n => String(n).padStart(2, '0');
    return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`;
  }
  function ensureWeekly() {
    const k = weekKey();
    if (S.tasks.weekKey !== k) {
      S.tasks.weekKey = k; S.tasks.weekly = {}; S.tasks.weeklyClaimed = {}; S.tasks.weeklyAllClaimed = false;
    }
  }
  // 每日任务的进度同时喂给对应周常（同一套动作，不额外要求玩家改变玩法）
  // 每日任务 → 周常进度来源的映射（新加的求签 / 斗法台不进周常，所以 src 留空）
  const TASK_SRC = { battle5: 'battle', idle1: 'idle', enhance1: 'enhance', recruit1: 'recruit', dungeon1: 'dungeon', item1: 'item', sign1: null, arena1: null };
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
  function weeklyState() {
    ensureWeekly();
    return D.WEEKLY_TASKS.map(t => ({
      t, prog: S.tasks.weekly[t.id] || 0, done: (S.tasks.weekly[t.id] || 0) >= t.target, claimed: !!S.tasks.weeklyClaimed[t.id],
    }));
  }
  function claimWeekly(id) {
    ensureWeekly();
    const t = D.WEEKLY_TASKS.find(x => x.id === id);
    if (!t || S.tasks.weeklyClaimed[id]) return { ok: false, msg: '已领取' };
    if ((S.tasks.weekly[id] || 0) < t.target) return { ok: false, msg: '本周还没完成' };
    S.tasks.weeklyClaimed[id] = true;
    applyRewardObj(t.reward);
    save();
    return { ok: true, msg: '周常奖励已领取' };
  }
  function claimAllWeekly() {
    ensureWeekly();
    if (S.tasks.weeklyAllClaimed) return { ok: false, msg: '已领取' };
    if (!D.WEEKLY_TASKS.every(t => (S.tasks.weekly[t.id] || 0) >= t.target)) return { ok: false, msg: '本周任务尚未全部完成' };
    S.tasks.weeklyAllClaimed = true;
    applyRewardObj(D.WEEKLY_ALL_REWARD);
    save();
    return { ok: true, msg: '周常全清奖励已领取' };
  }
  /* ================= 成就 ================= */
  function achievementState() {
    return D.ACHIEVEMENTS.map(a => ({ a, done: !!a.check(S), claimed: !!S.achievements[a.id] }));
  }
  function achievementSummary() {
    const st = achievementState();
    return { total: st.length, claimed: st.filter(x => x.claimed).length, done: st.filter(x => x.done).length, list: st };
  }
  function claimAchievement(id) {
    const a = D.ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return { ok: false, msg: '成就不存在' };
    if (S.achievements[a.id]) return { ok: false, msg: '已领取' };
    if (!a.check(S)) return { ok: false, msg: '尚未达成' };
    S.achievements[a.id] = true;
    applyRewardObj(a.reward);
    save();
    return { ok: true, msg: `🏅 成就达成：${a.name}`, name: a.name };
  }
  function claimTask(id) {
    ensureDaily();
    const t = D.DAILY_TASKS.find(x => x.id === id);
    if (!t || S.tasks.claimed[id]) return { ok: false };
    if ((S.tasks.daily[id] || 0) < t.target) return { ok: false, msg: '未完成' };
    S.tasks.claimed[id] = true;
    S.stats.taskClaims = (S.stats.taskClaims || 0) + 1;   // 主线「领赏」用
    applyRewardObj(t.reward);
    save();
    return { ok: true };
  }
  function claimAllTasks() {
    ensureDaily();
    if (S.tasks.allClaimed) return { ok: false, msg: '已领取' };
    const allDone = D.DAILY_TASKS.every(t => (S.tasks.daily[t.id] || 0) >= t.target);
    if (!allDone) return { ok: false, msg: '尚未完成全部任务' };
    S.tasks.allClaimed = true;
    S.stats.taskClaims = (S.stats.taskClaims || 0) + 1;   // 一键全领也算领过
    applyRewardObj(D.DAILY_ALL_REWARD);
    save();
    return { ok: true };
  }
  function loginReward() {
    const today = dailyDate();
    if (S.login.lastClaim === today) return null;
    S.login.lastClaim = today;
    // 七天一循环：第 7 天领完后回到第 1 天，而不是永远停在第 7 天重复发 SSR 自选券
    if (S.login.day >= D.LOGIN_REWARDS.length) { S.login.day = 0; S.login.round = (S.login.round || 1) + 1; }
    S.login.day += 1;
    const r = D.LOGIN_REWARDS[S.login.day - 1];
    applyRewardObj(r);
    save();
    return { day: S.login.day, reward: r, round: S.login.round || 1, cycleDays: D.LOGIN_REWARDS.length };
  }

  /* ================= 转生 ================= */
  /* 这一次转生要什么（V9.6.76：从"三次都要铭刻 5 阶"改成阶梯，见 D.REINCARN_REQS 的说明） */
  function reincarnNeed(count) {
    const list = D.REINCARN_REQS || [];
    if (!list.length) return { lv: 100, geneLock: 5, core: 30 };
    const i = Math.min(Math.max(0, count === undefined ? (S.player.reincarnations || 0) : count), list.length - 1);
    return list[i];
  }
  function reincarnGap(count) {
    const r = reincarnNeed(count);
    return {
      lv: Math.max(0, r.lv - S.player.level),
      geneLock: Math.max(0, r.geneLock - S.player.geneLock),
      core: Math.max(0, r.core - (S.buildings.core || 0)),
    };
  }
  function canReincarnate() {
    const g = reincarnGap();
    return !g.lv && !g.geneLock && !g.core;
  }
  function reincarnate() {
    if (!canReincarnate()) {
      const r = reincarnNeed();
      return { ok: false, msg: `条件未满足（玩家 Lv.${r.lv} + 铭刻 ${r.geneLock} 阶 + 灯芯 Lv.${r.core}）` };
    }
    const n = S.player.reincarnations + 1;
    const rp = Math.floor(100 * Math.pow(n, 1.15));
    S.player.reincarnations = n;
    addCur('rp', rp);
    /* 重置：玩家等级、世界进度。
       V9.5.78（自审）：这里原来写的是 level = 1 —— 等级改 0 基之后，转生会把玩家"送"到 Lv.1。
       改成回 Lv.0（和新建档同一个起点）。
       另外：技能点不再随重练重复发放（见 addPlayerExp 里"按等级重算"的说明），
       所以转生后一路练回 Lv.100 也不会多出 100 点没处花的技能点。 */
    S.player.level = 0; S.player.exp = 0;
    S.player.skillPoints = skillPointsForLevel();
    S.worlds = {};
    unlockWorld('W01');
    S.corridor.floor = 1;
    save();
    return { ok: true, rp, count: n };
  }
  function buyTalent(branch) {
    const lv = S.player.talents[branch];
    if (lv >= 10) return { ok: false, msg: '已满级' };
    const cost = D.TALENT_COSTS[lv];
    if (S.cur.rp < cost) return { ok: false, msg: `转生点不足（${S.cur.rp}/${cost}）` };
    S.cur.rp -= cost;
    S.player.talents[branch]++;
    save();
    return { ok: true };
  }

  /* ================= 图鉴收集 ================= */
  function codexState() {
    const owned = S.codex.chars.filter(id => D.charById[id]).length;
    return {
      // 总数只算"抽得到的人"：隐藏角色永远拿不到，算进去会让图鉴永远集不满
      owned, total: D.characters.filter(c => !c.hidden).length,
      rewards: D.CODEX_REWARDS.map(r => ({
        n: r.n, reward: r.reward,
        reached: owned >= r.n,
        claimed: S.codex.claimed.includes(r.n),
      })),
    };
  }
  function claimCodexReward(n) {
    const r = D.CODEX_REWARDS.find(x => x.n === n);
    if (!r) return { ok: false, msg: '奖励不存在' };
    if (S.codex.claimed.includes(n)) return { ok: false, msg: '已领取' };
    if (S.codex.chars.filter(id => D.charById[id]).length < n) return { ok: false, msg: `还差 ${n - codexState().owned} 名伙伴` };
    S.codex.claimed.push(n);
    applyRewardObj(r.reward);
    save();
    return { ok: true, msg: `图鉴奖励已领取（${n} 名）` };
  }

  /* ================= 今日概览 / 收取奖励 ================= */
  // 首页「今日」卡要的三件事：挂机待收、任务进度、免费招募。
  // 全部从存档现算，不额外存字段——这样"卡上写的"和"实际能领的"不可能对不上。
  function todayState() {
    ensureDaily();
    const bank = idleBankGains();
    const daily = D.DAILY_TASKS.map(t => ({
      t, prog: S.tasks.daily[t.id] || 0,
      done: (S.tasks.daily[t.id] || 0) >= t.target,
      claimed: !!S.tasks.claimed[t.id],
    }));
    const weekly = weeklyState();
    const dailyClaimable = daily.filter(x => x.done && !x.claimed).length;
    const weeklyClaimable = weekly.filter(x => x.done && !x.claimed).length
      + (weekly.every(x => x.done) && !S.tasks.weeklyAllClaimed ? 1 : 0);
    const achClaimable = achievementState().filter(a => a.done && !a.claimed).length;
    const codexClaimable = codexState().rewards.filter(r => r.reached && !r.claimed).length;
    const idleReady = bank.seconds >= 60;
    return {
      idle: bank, idleReady, idleSeconds: bank.seconds,
      dailyDone: daily.filter(x => x.done).length, dailyTotal: daily.length, dailyClaimable,
      weeklyClaimable, achClaimable, codexClaimable,
      freeRecruit: freeRecruitAvailable('normal') || freeRecruitAvailable('advanced'),
      freeRecruitReady: (freeRecruitAvailable('normal') || freeRecruitAvailable('advanced')) && isUnlocked('recruit'),
      signReady: signState().canDraw,          // 今日还没求签 → 首页给个提醒
      claimable: (idleReady ? 1 : 0) + dailyClaimable + weeklyClaimable + achClaimable + codexClaimable,
    };
  }
  // 收取奖励：把"已经达成、躺在那儿等点"的奖励一次全领掉。
  // 不做"帮你花"，只做"帮你收"——收取不会失败，也不会改变任何进度。
  function claimEverything() {
    ensureDaily();
    const beforeCur = Object.assign({}, S.cur);
    const beforeItems = Object.assign({}, S.items);
    const detail = { idle: null, tasks: 0, allDaily: false, weekly: 0, allWeekly: false, ach: 0, codex: 0 };
    // 先收挂机：挂机本身会推进"领挂机"这条日常，所以必须排在任务之前
    const bank = idleBankGains();
    if (bank.seconds >= 60) detail.idle = claimIdle();
    D.DAILY_TASKS.forEach(t => { if (claimTask(t.id).ok) detail.tasks++; });
    if (claimAllTasks().ok) detail.allDaily = true;
    D.WEEKLY_TASKS.forEach(t => { if (claimWeekly(t.id).ok) detail.weekly++; });
    if (claimAllWeekly().ok) detail.allWeekly = true;
    D.ACHIEVEMENTS.forEach(a => { if (claimAchievement(a.id).ok) detail.ach++; });
    D.CODEX_REWARDS.forEach(r => { if (claimCodexReward(r.n).ok) detail.codex++; });
    // 差额由"前后快照"算出来，不依赖各领取函数回报数值——永远和账户实际变化一致
    const gains = { cur: {}, items: {} };
    Object.keys(S.cur).forEach(k => { const d = (S.cur[k] || 0) - (beforeCur[k] || 0); if (d) gains.cur[k] = d; });
    Object.keys(S.items).forEach(k => { const d = (S.items[k] || 0) - (beforeItems[k] || 0); if (d) gains.items[k] = d; });
    save();
    const total = (detail.idle ? 1 : 0) + detail.tasks + (detail.allDaily ? 1 : 0)
      + detail.weekly + (detail.allWeekly ? 1 : 0) + detail.ach + detail.codex;
    return { detail, gains, seconds: detail.idle ? detail.idle.seconds : 0, total };
  }
  // 下一关：同难度往后推一格；打完第 12 关顺延到下一难度，难度打完顺延到下一世界
  function nextStage(worldId, diff, stageIdx) {
    if (!S.worlds[worldId] || !S.worlds[worldId].unlocked) return null;
    if (stageIdx + 1 < 12) {
      const r = { worldId, diff, stageIdx: stageIdx + 1 };
      return stageUnlocked(r.worldId, r.diff, r.stageIdx) ? r : null;
    }
    const order = D.DIFFICULTY.map(d => d.id);
    const di = order.indexOf(diff);
    if (di >= 0 && di < order.length - 1 && worldCleared(worldId, diff)) {
      const r = { worldId, diff: order[di + 1], stageIdx: 0 };
      if (stageUnlocked(r.worldId, r.diff, 0)) return r;
    }
    const wi = D.WORLDS.findIndex(x => x.id === worldId);
    if (wi >= 0 && wi < D.WORLDS.length - 1) {
      const nw = D.WORLDS[wi + 1];
      if (S.worlds[nw.id] && S.worlds[nw.id].unlocked && stageUnlocked(nw.id, 'normal', 0)) {
        return { worldId: nw.id, diff: 'normal', stageIdx: 0 };
      }
    }
    return null;
  }

  /* ================= 限时悬赏 ================= */
  // 悬赏按当前进度动态生成（D.makeBounties），生成结果存进存档，本期固定不再变。
  // 每条从本期起点开始各算各的截止时间；过期作废，全部结束后可以开新一轮。
  function bountyCheck(b) {
    const p = b.param || {};
    switch (b.kind) {
      case 'stage': return !!(S.worlds[p.world] && S.worlds[p.world].stages[p.diff || 'normal'][p.stage - 1] > 0);
      case 'level': return S.player.level >= p.n;
      case 'chars': return Object.keys(S.chars).length >= p.n;
      case 'ssr': return Object.keys(S.chars).filter(id => {
        const c = D.charById[id];
        return c && ['SSR', 'UR'].includes(c.rarity);
      }).length >= p.n;
      case 'enhance': return (S.stats.enhances || 0) >= p.n;
      case 'corridor': return (S.corridor.best || 0) >= p.n;
      case 'beast': return Object.keys(S.beast.owned || {}).length >= p.n;
      case 'realm': return (S.player.realm || 0) >= p.n;
      default: return false;
    }
  }
  function bountyState() {
    if (!Array.isArray(S.bounty.list) || !S.bounty.list.length) S.bounty.list = D.makeBounties(S);
    const now = Date.now();
    const start = (S.bounty && S.bounty.start) || now;
    const claimed = (S.bounty && S.bounty.claimed) || {};
    const list = S.bounty.list.map(b => {
      const deadline = start + b.hours * 3600e3;
      const leftMs = deadline - now;
      return { b, deadline, leftMs, expired: leftMs <= 0, done: bountyCheck(b), claimed: !!claimed[b.id] };
    });
    return {
      list, start,
      claimable: list.filter(x => x.done && !x.claimed && !x.expired).length,
      allOver: list.every(x => x.claimed || x.expired),
    };
  }
  function claimBounty(id) {
    const item = bountyState().list.find(x => x.b.id === id);
    if (!item) return { ok: false, msg: '悬赏不存在' };
    if (item.claimed) return { ok: false, msg: '已经领过了' };
    if (item.expired) return { ok: false, msg: '这条悬赏已经过期' };
    if (!item.done) return { ok: false, msg: '目标还没完成' };
    S.bounty.claimed[id] = true;
    applyRewardObj(item.b.reward);
    save();
    return { ok: true, msg: `悬赏达成：${item.b.name}`, reward: item.b.reward, name: item.b.name };
  }
  function renewBounties() {
    if (!bountyState().allOver) return { ok: false, msg: '还有悬赏没结束（没领或没过期）' };
    S.bounty = { start: Date.now(), claimed: {}, list: D.makeBounties(S) };
    save();
    return { ok: true, msg: '新一期悬赏已按你的进度刷新' };
  }

  /* ================= 伴生体（第二条养成线） ================= */
  // 上阵 1 只：给全队属性加成 + 一个被动 + 五行克制（进本看世界属性）。
  // 孵化花兽魂石，重复获得转兽魂，兽魂升等级 —— 和角色的"抽卡→碎片→升星"是同一套结构。
  function beastState() {
    const owned = S.beast.owned || {};
    const list = Object.keys(owned).map(id => {
      const b = D.beastById(id);
      if (!b) return null;
      const lv = owned[id].lv || 0;      // V9.5.81：伴生体也是 0 基
      return {
        id, b, lv, soul: owned[id].soul || 0,
        active: S.beast.active === id,
        pct: D.beastPctAt(b, lv),
        maxLv: lv >= D.BEAST_MAX_LV,
      };
    }).filter(Boolean).sort((a, b) => D.RARITIES.indexOf(b.b.rarity) - D.RARITIES.indexOf(a.b.rarity) || b.lv - a.lv);
    return {
      list, count: list.length,
      active: S.beast.active || null,
      activeBeast: S.beast.active ? D.beastById(S.beast.active) : null,
      eggs: S.items[D.BEAST_EGG_ITEM] || 0,
      eggCost: D.BEAST_EGG_COST,
      canHatch: (S.items[D.BEAST_EGG_ITEM] || 0) >= D.BEAST_EGG_COST,
    };
  }
  // 随行伴生体的属性加成（会被 effectiveStats / effectivePlayerStats / 战斗一起用）
  function beastPct() {
    const id = S.beast.active;
    const owned = id && S.beast.owned[id];
    const b = id ? D.beastById(id) : null;
    if (!owned || !b) return {};
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
    if (!mine || !foe) return { mine: null, foe: null, mult: 1, state: 'none' };
    if (D.ELEMENT_COUNTER[mine] === foe) return { mine, foe, mult: 1 + D.ELEMENT_BONUS, state: 'up' };
    if (D.ELEMENT_COUNTER[foe] === mine) return { mine, foe, mult: 1 - D.ELEMENT_PENALTY, state: 'down' };
    return { mine, foe, mult: 1, state: 'even' };
  }
  function hatchBeast(n) {
    n = Math.max(1, Math.floor(n || 1));
    const need = D.BEAST_EGG_COST * n;
    const have = S.items[D.BEAST_EGG_ITEM] || 0;
    if (have < need) return { ok: false, msg: `兽魂石不足：孵 ${n} 只要 ${need} 颗（现有 ${have}）` };
    S.items[D.BEAST_EGG_ITEM] -= need;
    if (S.items[D.BEAST_EGG_ITEM] <= 0) delete S.items[D.BEAST_EGG_ITEM];
    const got = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random(), acc = 0, rar = 'N';
      for (const [k, v] of Object.entries(D.BEAST_RARITY_RATE)) { acc += v; if (r <= acc) { rar = k; break; } }
      const pool = D.BEASTS.filter(b => b.rarity === rar);
      const b = pool[Math.floor(Math.random() * pool.length)] || D.BEASTS[0];
      const cur = S.beast.owned[b.id];
      if (cur) {
        cur.soul = (cur.soul || 0) + 2;
        got.push({ id: b.id, name: b.name, rarity: b.rarity, elem: b.elem, dup: true, soul: cur.soul });
      } else {
        S.beast.owned[b.id] = { lv: 0, soul: 0 };   // V9.5.69：伴生体也从 0 级起
        got.push({ id: b.id, name: b.name, rarity: b.rarity, elem: b.elem, dup: false });
      }
    }
    // 第一只自动随行，省一步操作
    if (!S.beast.active && got.length) S.beast.active = got[0].id;
    S.stats.beasts = (S.stats.beasts || 0) + n;
    save();
    return { ok: true, got, count: n, msg: `孵化 ${n} 只伴生体` };
  }
  function setActiveBeast(id) {
    if (id && !S.beast.owned[id]) return { ok: false, msg: '还没有这只伴生体' };
    S.beast.active = id || null;
    save();
    return { ok: true, msg: id ? `${D.beastById(id).name} 已随行` : '已收回伴生体' };
  }
  function beastLevelUp(id) {
    const cur = S.beast.owned[id];
    const b = D.beastById(id);
    if (!cur || !b) return { ok: false, msg: '还没有这只伴生体' };
    if ((cur.lv || 0) >= D.BEAST_MAX_LV) return { ok: false, msg: '已经是满级' };
    const need = D.BEAST_SOUL_PER_LV * ((cur.lv || 0) + 1);
    if ((cur.soul || 0) < need) return { ok: false, msg: `兽魂不足：升到 Lv.${(cur.lv || 0) + 1} 需要 ${need} 兽魂（现有 ${cur.soul || 0}）` };
    cur.soul -= need;
    cur.lv = (cur.lv || 0) + 1;
    save();
    return { ok: true, msg: `${b.name} 升到 Lv.${cur.lv}`, lv: cur.lv };
  }

  /* ================= 境界（渡劫） ================= */
  // 每 10 级一个境界，达标即可渡劫；成功全属性 +5%，失败只扣材料与点数、等级不掉，可以反复挑战。
  function realmState() {
    const realm = S.player.realm || 0;
    const next = D.REALMS[realm] || null;
    const tier = next ? Math.min(5, 1 + Math.floor(next.lv / 20)) : 5;
    const matItem = 'mat_t' + tier;
    return {
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
    };
  }
  function realmBonusPct() { return (S.player.realm || 0) * D.REALM_PCT; }
  function attemptRealm() {
    const st = realmState();
    if (!st.hasBloodline) return { ok: false, msg: '先选定血统——境界线跟着血统走，没血统就没有境界' };
    if (!st.next) return { ok: false, msg: '已经到达最终境界' };
    if (!st.levelOk) return { ok: false, msg: `先升到 Lv.${st.next.lv}（当前 Lv.${S.player.level}）` };
    if (st.haveMat < st.matN) {
      return { ok: false, msg: `渡劫材料不足：需要 ${D.ITEMS[st.matItem].name} ×${st.matN}（现有 ${st.haveMat}）` };
    }
    if (!canAfford({ points: st.points })) return { ok: false, msg: `点数不足：需要 ◈ ${fmtNum(st.points)}` };
    // 先扣消耗：失败也扣，这是"天道不收白食"；但等级不掉，所以永远有下一次
    S.items[st.matItem] -= st.matN;
    if (S.items[st.matItem] <= 0) delete S.items[st.matItem];
    spend({ points: st.points });
    const success = Math.random() < st.next.rate;
    if (success) S.player.realm = st.realm + 1;
    save();
    return {
      ok: true, success, name: st.nextName, rate: st.next.rate,
      realm: S.player.realm, bonusPct: realmBonusPct(),
      msg: success
        ? `渡劫成功：突破「${st.nextName}」，主角属性永久 +${(D.REALM_PCT * 100).toFixed(1)}%`
        : `渡劫失败：消耗已扣除，但等级不掉，再来一次就好`,
    };
  }

  /* ================= 战斗结算钩子 ================= */
  /* --- 副本进度落盘：刷新 / 切后台被系统回收后可以接着打 ---- */
  function setPendingRun(data) {
    S.pendingRun = data ? JSON.parse(JSON.stringify(data)) : null;
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
  // 战斗获得的玩家经验（同样吃经验天赋）；挂机经验已在 idleRates 里算过，不重复加成
  function addPlayerBattleExp(exp) {
    addPlayerExp(Math.round((exp || 0) * graceExpMult()));
  }

  return {
    get S() { return S; },
    save, load, newGame, wipeSave, exportSave, importSave, saveSlot, loadSlot, slotInfo, migrate,
    addCur, canAfford, spend, addItem, removeItem, canAddItem, setCurListener, applyRewardObj, sweepCap,
    setNoticeListener, stashItem, stashCount, stashList, claimStash,
    bagUsage, buyBagCap,
    addChar, addShards, levelCost, levelUp, useExpItem, swapPartyMember, partnerExp, expSpentOn, rebornChar, starUp, skillUp, SKILL_CHIP_COST,
    craftSerum, useSerum, serumTaken, serumApplied,
    bloodlineUpgrade, geneLockInfo, geneLockUnlock,
    equipStats, effectiveStats, power, teamPower, factionBuffs, formationState,
    effectivePlayerStats, playerPower, choosePlayerBloodline, upgradePlayerBloodline,
    allocateAttr, resetAttrs, allocateSkill, resetSkills, protagonistSkills, protagonistList, createProtagonist, switchProtagonist,
    grantEquip, grantSignatureEquip, equipItem, canEquip, unequipItem, enhanceCost, enhance, decompose, decomposeMany, inventoryEquips,
    enhanceQuote, bloodlineQuote,
    toggleEquipLock, autoEquipBest, equipScore, savePreset, applyPreset,
    unequipEverywhere, equipWearer, dedupeEquips,
    playerRow, setPlayerRow, swapPartySlots, moveMemberRow, rowLayout, ROW_NAME, rowOfSlots, normalizeParty,
    parsePos, posRow, swapPositions,
    recruitOnce, recruitTen, freeRecruit, freeRecruitAvailable, freeState, ssrTicketUse, ticketOf,
    idleRates, idleBaseRates, idleLines, idleLineBonus, setIdleLeader, idleMatItem, grantIdleMat,
    settleOffline, onlineTick, idleBankGains, claimIdle, addPlayerExp, offlineCapHours, offlineEfficiency, idleFull,
    upgradeBuilding, authority, authorityInfo, upgradeAuthority,
    sectInfo, sectBonusPct, addSectExp,
    kejiLv, kejiCostOf, kejiBonus, kejiUp,
    travelAccrue, travelTick, travelProgress, travelEverySec, pendingTravel, claimTravel, rollTravel, rewardTextOf,
    gardenState, plantGarden, harvestGarden, harvestAllGarden,
    arenaState, arenaSettle, fabaoState, buyFabao, wearFabao,
    mountState, buyMount, wearMount, applyMount,
    signState, drawSign, signIdleMult,
    unlockWorld, worldCleared, stageComplete, stageUnlocked,
    refreshUnlocks, isUnlocked, unlockTip, skillPointsForLevel,
    mainQuestState, currentQuest, claimQuest,
    setPlayerName, charName,
    buyShopItem, openBox, openBoxes, boxSourceWorld, dailyDate, sweepLeft, enhanceMat,
    addSweepBonus, ensureSweepDay,
    shopReq,
    ensureDaily, task, claimTask, claimAllTasks, loginReward,
    ensureWeekly, weeklyState, claimWeekly, claimAllWeekly, weekKey,
    achievementState, achievementSummary, claimAchievement,
    todayState, claimEverything, nextStage,
    bountyState, claimBounty, renewBounties, realmState, realmBonusPct, attemptRealm, realmChainOf, pityView, pityOf,
    beastState, hatchBeast, setActiveBeast, beastLevelUp, beastPct, activeBeastElem, elementMultiplier,
    setPendingRun, clearPendingRun, corridorMarks, corridorMarkBonus, worldReincarnNeed,
    canReincarnate, reincarnate, reincarnNeed, reincarnGap, buyTalent,
    codexState, claimCodexReward,
    battleSettle, addCharExp, addPlayerBattleExp, graceExpMult, graceDropMult, graceIdleMult, talentAll,
  };
})();
