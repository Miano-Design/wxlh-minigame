/* 存档兼容体检（更新不许要求玩家删档）：node scripts/save_migrate_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人："以后上线小程序有别的玩家，总不能也让人删档重开吧"）。

   上线之后**每一次更新**都会遇到同一件事：玩家手里是**旧版本的存档**，
   而代码里多了新系统（新货币、新面板、新计数）。这一条如果没兜住，
   玩家一更新就是"从头开始"——比任何数值问题都致命。

   这把尺子不讲道理，只做实验：造几种"真的会遇到的旧存档"，丢进 Core.load()，
   然后断言 —— ① 能读进来；② 进度（等级 / 货币 / 角色 / 关卡 / 已领任务）一点不丢；
   ③ 新字段被补齐（不是 undefined）；④ 每一页都能画出来（不是读进来就崩）；
   ⑤ 读不出来的那几种（损坏 / 来自更高版本）必须**原样备份**，绝不能悄悄覆盖。
   只读脚本，跑在假环境里。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, G = global.GameGlobal;
CV.setup(global.wx.getWindowInfo());
const SAVE_KEY = 'wxlh_save_v5';
const BAK_KEY = SAVE_KEY + '_bak';

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
/* 每一个存档都全新开一个进程来跑（模块有缓存，同一进程里 load 两次会互相干扰） */
const { execFileSync } = require('child_process');
const SELF = __filename;
function runCase(name, build, checks) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [SELF, '--case', name], { encoding: 'utf8', env: Object.assign({}, process.env, { SAVE_CASE: name }) });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const ok = /__ALL_OK__/.test(out);
  console.log('\n【' + name + '】');
  out.split('\n').filter((l) => /✓|✗/.test(l)).forEach((l) => {
    if (/✓/.test(l)) pass++; else fail++;
    console.log('  ' + l.trim());
  });
  return ok;
}

/* ==================== 子进程：真的跑一次读档 ==================== */
if (process.argv[2] === '--case') {
  const name = process.argv[3];
  const mk = {};
  /* ① "上个版本"的存档：v5 但**缺了后来才加的那些块**（这是最常见的一种） */
  mk.old_missing_blocks = () => {
    return {
      v: 5, createdAt: Date.now() - 86400000,
      player: { name: '老玩家', level: 37, exp: 120, bloodline: '修真', bloodlineLv: 3, attrPoints: 5, attrs: { muscle: 2, immune: 1, cell: 0, nerve: 0, intelligence: 0, spirit: 0 }, skillPoints: 3, skillLv: [2, 1, 0], row: 'back' },
      /* V9.6.134：这份老档刻意保留**旧版 8 种货币**（含已下架的 故事点 / 技能芯片 /
         血统结晶 / 深井徽记）—— 迁移必须把它们按系数折进新币，一点不丢。 */
      cur: { points: 54321, holy: 88, otherworld: 7, story: 401, skillChip: 12, bloodCrystal: 20, corridor: 0, rp: 3 },
      chars: { C002: { lv: 41, star: 3, shards: 5, skillLv: [2, 2, 2], bloodlineLv: 1 } },
      party: ['@player', 'C002', null, null, null],
      worlds: { W01: { unlocked: true, stages: { normal: [3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hell: [] } } },
      quests: { claimed: ['q01', 'q01b', 'q02'] },
      /* 注意：**故意不给** travel / garden / arena / fabao / mount / sign / keji / beast / codex / presets… */
    };
  };
  /* ② 更老的版本号（v4）——以前这种会被直接"当成没存档" */
  mk.older_version = () => Object.assign(mk.old_missing_blocks(), { v: 4 });
  /* ③ 队伍还是 4 格、主角不占位的结构（很早的版本） */
  mk.old_party4 = () => {
    const s = mk.old_missing_blocks();
    s.party = ['C002', 'C999', null, null];     // C999 是已经不存在的角色
    s.player.row = 'back';
    return s;
  };
  /* ③b 真的很老的档：没有 c001Merged / altPlayers / fabao（那时还没有这些系统），
         C001 是"旧版主角占位" —— 这一段迁移必须**还能跑**，不能被新规则误伤。 */
  mk.ancient_save = () => {
    const s = mk.old_missing_blocks();
    delete s.fabao; delete s.altPlayers; delete s.c001Merged;
    s.chars = { C001: { lv: 30, star: 2, shards: 0, skillLv: [1, 1, 1], bloodlineLv: 0 } };
    s.party = ['C001', null, null, null, null];
    return s;
  };
  /* ③c V1.0.1 改壳（求签 → 点灯）：老档里存着**旧档位名**（大吉 / 上吉…）。
     档位名是**存进存档的值**，不迁移就会出现"面板写着【大吉】、灯焰文案却是空的"。
     这份档刻意把 sign 写成改壳前的样子（今天已点、档位＝大吉）。 */
  mk.old_sign_words = () => Object.assign(mk.old_missing_blocks(), {
    sign: { date: Core.dailyDate(), tier: '大吉', idlePct: 0.3, drawn: 1 },
  });
  /* ================= V1.1.14（0927-F）· **老档不许少碎片** =================
     父亲大人的口径：碎片改成"按人各算各的"，但**老档已经并进公共池的那些原样保留**
     （不追溯、不收回、**不摊派**）。所以这份老档刻意写成：
       · 已经有 `shardPool`（N0 / R77 / SR31 / SSR9 / UR3 —— 就是"当年合并出来的通用池"）；
       · 还没有 `shardPoolMerged` 标记（＝V9.6.129 那次合并**还没跑过**）；
       · 某人身上还挂着 5 颗自己的碎片（老字段 `chars.C002.shards`）。
     读档后必须：**池子只增不减**（R 77 → 82）、各人那点并进去不丢、合并标记写上、**再读一遍不重复加**。 */
  mk.shard_pool_old = () => Object.assign(mk.old_missing_blocks(), {
    shardPool: { N: 0, R: 77, SR: 31, SSR: 9, UR: 3 },
  });
  /* ③d V1.0.1 二轮（幽都装备名换壳）：装备名**也是存进存档的值**（`S.equips[uid].name`）。
     这份档刻意留下换壳前的名字，三种都要覆盖：
       ① 世界套装件（无前缀）：符咒道袍；② 血统 / 神装件（带「·」前缀）：修真·道冠；
       ③ **不该被误伤**的对照件：狼纹胸甲（不在换名表里，动了就是过度清理）。 */
  mk.old_equip_words = () => Object.assign(mk.old_missing_blocks(), {
    equips: {
      E1: { uid: 'E1', name: '符咒道袍', slot: 'armor', rarity: 'SSR', enhance: 3, base: { def: 120, hp: 900 }, affixes: [{ k: 'defPct', v: 0.12 }], set: 'W03' },
      E2: { uid: 'E2', name: '修真·道冠', slot: 'head', rarity: 'SSR', enhance: 0, base: { def: 60, hp: 500 }, affixes: [], bloodSet: '修真', bloodWorld: 'W10' },
      E3: { uid: 'E3', name: '狼纹胸甲', slot: 'armor', rarity: 'SSR', enhance: 1, base: { def: 100, hp: 800 }, affixes: [], set: 'W03' },
    },
    equipped: { '@player': { weapon: null, head: 'E2', armor: 'E1', hands: null, legs: null, accessory: null } },
  });
  /* ⓪ 2026-09-27（0927-G · 本命装备 36 件）：老档手里那几件**专属**必须就地升级，不许留成废件。
     这份档攒了三种真会遇到的旧专属（口径按 04:30 修正：绑定 = **含全部角色**的第一名）：
       E1 代行之刃 —— 绑 C120 灯阁代行者（狼人**第三**）→ 该改绑 C111 黑田宗一 ＋ 2 条词条 ＋ 强化 +7；
       E2 元素咏叹 —— 绑 C059 楚衍（修真**第一**，本就对）→ **不改绑、不改名**，只补词条；
       E3 绯河刃   —— 绑 C115（绯红第一），名字留用，锁着（lock）＋ 强化 +3；
       E4 对照件   —— 一件普通 SSR（没有 charId），迁移**一个字都不该动**。
     通过标准：三件都还在（不许变两件/变丢）· 词条补齐到 5 条且与新表同部位那件逐条一致 ·
     只有该改的那一件换绑定换名字（C120 消失）· **uid/slot/enhance/lock 原样** ·
     基础值只补一次差（×1.30÷1.15）· 再跑一次迁移**值不再变**（幂等）。 */
  mk.sig_old_equips = () => Object.assign(mk.old_missing_blocks(), {
    equips: {
      E1: { uid: 'E1', name: '代行之刃', slot: 'weapon', rarity: 'UR', enhance: 7, lock: false, base: { atk: 1707 }, affixes: [{ k: 'atkPct', v: 0.18 }, { k: 'skillPct', v: 0.15 }], set: null, bloodSet: null, bloodWorld: null, godSet: null, charId: 'C120', sigText: '灯阁代行者专属：本命飞剑（狼人·战士）' },
      E2: { uid: 'E2', name: '元素咏叹', slot: 'weapon', rarity: 'UR', enhance: 0, lock: false, base: { atk: 1707 }, affixes: [{ k: 'skillPct', v: 0.24 }, { k: 'critPct', v: 0.06 }], set: null, bloodSet: null, bloodWorld: null, godSet: null, charId: 'C059', sigText: '楚衍专属：精神共鸣凝成的法珠（修真·法师）' },
      E3: { uid: 'E3', name: '绯河刃', slot: 'weapon', rarity: 'UR', enhance: 3, lock: true, base: { atk: 1707 }, affixes: [{ k: 'atkPct', v: 0.20 }, { k: 'critDmg', v: 0.30 }], set: null, bloodSet: null, bloodWorld: null, godSet: null, charId: 'C115', sigText: '白河秋专属：绯红的极致一击（绯红·刺客）' },
      E4: { uid: 'E4', name: '狼纹胸甲', slot: 'armor', rarity: 'SSR', enhance: 1, base: { def: 100, hp: 800 }, affixes: [{ k: 'defPct', v: 0.12 }], set: 'W03' },
    },
    equipped: { '@player': { weapon: 'E1', head: null, armor: 'E4', hands: null, legs: null, accessory: null } },
    /* 图鉴装备卷的老名单：旧专属名（代行之刃 / 元素咏叹）已经不在新名单里了 —— 迁移要清掉它们，
       否则"已收集"会把它们算进去、显示成超过总数（收集数按名字算，collected 侧没有滤网）。 */
    codex: { chars: [], equipsSeen: 0, equipNames: ['代行之刃', '元素咏叹', '绯河刃', '狼纹胸甲'], claimed: [] },
  });
  /* ④ 存档损坏（手改坏 / 存盘写一半断电） */
  mk.broken_json = () => '{ "v": 5, "player": { "name": "断' ;
  /* ⑤ 来自**更高版本**的存档（玩家先装了新版，又回到旧版） */
  mk.future_version = () => Object.assign(mk.old_missing_blocks(), { v: 99 });
  /* ==================================================================================
     ⑥ 背包四份样本（V1.1.1 · 单格上限 100 那一条的验收；材料《收口2》§2.4 的可执行定义）
     为什么要四份：容量口径改成"占用格数 = Σ ceil(件数/100) ＋ cap = max(50, 已扩容, 理论占用)"，
     而老档里是"种数少、数量大"（一件东西几千个）——**一改规则当天就可能超格**。
     这四份就是"玩家手里真的会有的四种背包"：双池都扩过 / 只扩过一个池 / 从没进过背包 / 极老档。
     通过标准：**不抛错 · 数字不缩水 · 东西不丢 · 只做一次**（他不做一次性宽限，靠 max 取大天然兜住）。 */
  const manyItems = (extra) => Object.assign({
    mat_t1: 9000, mat_t2: 60, mat_t3: 120, mat_t4: 5, mat_t5: 3, beast_egg: 40,
    exp_m: 25, exp_l: 12, ticket_normal: 9, ticket_adv: 4, box_r: 6, box_sr: 3, box_ssr: 1,
  }, extra || {});
  mk.bag_both_expanded = () => Object.assign(mk.old_missing_blocks(), {
    bag: { itemCap: 80, itemExpands: 3, matCap: 70, matExpands: 2, eqCap: 50, eqExpands: 0 },
    items: manyItems(),
  });
  mk.bag_mat_only = () => Object.assign(mk.old_missing_blocks(), {
    bag: { itemCap: 50, itemExpands: 0, matCap: 90, matExpands: 4, eqCap: 50, eqExpands: 0 },
    items: manyItems(),
  });
  mk.bag_never_touched = () => Object.assign(mk.old_missing_blocks(), {
    bag: { itemCap: 50, itemExpands: 0, matCap: 50, matExpands: 0, eqCap: 50, eqExpands: 0 },
    items: { exp_m: 3, ticket_normal: 1 },   // 用**真实存在的 id**（假 id 会被迁移当残留清掉，那是对的）
  });
  mk.bag_ancient_merged = () => {
    const s = mk.old_missing_blocks();
    delete s.bag;                                // 极老档：只有旧合并池字段
    s.bag = { expands: 2 };
    s.items = manyItems();
    delete s.stash;
    return s;
  };
  /* ⑦ V1.1.4（A12 材料）两份样本 —— 入门包这条规则的**两半**都要钉住：
       发（动过铭刻/命格的老档）＋ **不发**（从没动过的那一半，防"多发"）。
       ⑦a：老档但没动过铭刻 / 命格 → 一颗新料都不该有。 */
  mk.a12_pack_fresh = () => {
    const s = mk.old_missing_blocks();
    s.player.geneLock = 0;
    s.player.bloodline = null;
    s.player.bloodlineLv = 0;
    Object.keys(s.chars).forEach((id) => { s.chars[id].bloodlineLv = 0; });
    s.bag = { itemCap: 50, itemExpands: 0, matCap: 50, matExpands: 0, eqCap: 50, eqExpands: 0 };
    s.items = { exp_m: 3, ticket_normal: 1 };
    return s;
  };

  const builder = mk[name];
  const raw = typeof builder() === 'string' ? builder() : JSON.stringify(builder());
  store = {};
  store[SAVE_KEY] = raw;
  const loaded = Core.load();
  const S = Core.S;
  const out = (msg) => console.log(msg);
  const say = (ok, what, extra) => out((ok ? '✓' : '✗') + ' ' + what + (extra ? '  → ' + extra : ''));
  const bak = store[BAK_KEY] || null;

  /* 很老的档（C001 是旧版主角占位）：这段迁移只该对老档跑 */
  if (name === 'ancient_save') {
    say(loaded === true, '很老的档也能读进来');
    say(!S.chars || !S.chars.C001, '旧版占位的 C001 被摘掉（这段老迁移还在跑）', JSON.stringify(Object.keys(S.chars || {})));
    say(S.c001Merged === true, '迁移标记补上了（下次不会再跑一遍）');
    say(S.player && S.player.level === 37, '主角进度没丢', 'Lv.' + (S.player && S.player.level));
    if (loaded && S.c001Merged && !(S.chars || {}).C001) out('__ALL_OK__');
    process.exit(0);
  }
  if (name === 'shard_pool_old') {
    /* 老档的碎片**一个都不许少**（V1.1.14）：
       ① 公共池原样保留（R 77 → 82：把 C002 身上那 5 颗并进来）；
       ② 各人身上那点在合并后清零（它们已经在池子里了，不丢）；
       ③ 合并标记写上、**再读一遍不重复加**（否则就是白送碎片）。 */
    say(loaded === true, '老档（只有公共池）能读进来');
    const pool = S.shardPool || {};
    const sum = (p) => ['N', 'R', 'SR', 'SSR', 'UR'].reduce((a, k) => a + (p[k] || 0), 0);
    /* 不写死"哪一档涨 5"（C002 是 N 档 —— 第一版按 R 档写，当场假红）：只钉**总数不减 + 逐档不减**。 */
    const t0 = sum(pool);
    say(t0 === 125, '公共池一个不少、还把各人身上那 5 颗并了进来（120＋5＝125）',
      'N=' + (pool.N || 0) + ' R=' + (pool.R || 0) + ' SR=' + (pool.SR || 0) + ' SSR=' + (pool.SSR || 0) + ' UR=' + (pool.UR || 0));
    say((pool.R || 0) >= 77 && (pool.SR || 0) >= 31 && (pool.SSR || 0) >= 9 && (pool.UR || 0) >= 3,
      '原有那几档**一档都没被摊派/收回**（N 档多出来的 5 就是 C002 身上那份）');
    say(!(S.chars || {}).C002 || (S.chars.C002.shards || 0) === 0, '各人身上那点已并入池子（不重复记账）');
    say(S.shardPoolMerged === true, '合并标记写上了（下次不会再跑一遍）');
    Core.save(); Core.load();
    const p2 = Core.S.shardPool || {};
    const t1 = sum(p2);
    say(t1 === t0, '存盘再读一遍：池子总数不变（没重复累加）', t0 + ' → ' + t1);
    if (loaded && t1 === t0 && t0 === 125) out('__ALL_OK__');
    process.exit(0);
  }
  if (name === 'broken_json' || name === 'future_version') {
    /* 这两种**读不进来是对的**，但必须原样备份、而且不许动主存档 */
    say(loaded === false, '读不出来（预期）');
    say(!!bak, '原样备份到了 ' + BAK_KEY, bak ? String(JSON.parse(bak).why) : '(没有备份)');
    say(store[SAVE_KEY] === raw, '主存档**原样没动**（没被覆盖、没被删）');
    if (loaded === false && bak && store[SAVE_KEY] === raw) out('__ALL_OK__');
    process.exit(0);
  }
  /* 背包四份样本（V1.1.1）：不缩水 / 不丢东西 / 只做一次 */
  /* V1.1.4（A12 材料 · 老档入门包）：**不发**的那一半 —— 从没动过铭刻 / 命格的老档一颗新料都不该有。
     （另一半"发"在下面 bag_* 四份样本里验：那四份的底档都带着 bloodlineLv，属于"动过命格"。） */
  if (name === 'a12_pack_fresh') {
    say(loaded === true, '老档能读进来');
    say(Core.S.items.minghun_sha === undefined && Core.S.items.xuesui_jing === undefined,
      '从没动过铭刻 / 命格的老档：**不发**入门包', JSON.stringify(Core.S.items));
    say(Core.S.a12Pack === true, '迁移标记落上了（下次读档不会再判一遍）');
    try { Core.migrate && Core.migrate(); } catch (e) {}
    say(Core.S.items.minghun_sha === undefined, '再读一次仍然不发（幂等）', JSON.stringify(Core.S.items));
    if (loaded) out('__ALL_OK__');
    process.exit(0);
  }
  if (name.indexOf('bag_') === 0) {
    const u = Core.bagUsage();
    const items = Core.S.items || {};
    say(loaded === true, '旧存档能读进来（背包口径改了也不许读不进来）');
    const MAX = D.BAG_STACK_MAX || 100;
    const bigMat = name !== 'bag_never_touched';
    if (bigMat) {
      say(items.mat_t1 === 9000 && items.beast_egg === 40, '东西一件没丢（大额材料原样在）',
        'mat_t1=' + items.mat_t1 + ' · beast_egg=' + items.beast_egg);
      /* V1.1.2 并池之后：一个池子里同时有道具与材料 —— 材料那几格用 `matSlots` 看（字段保留） */
      say(u.matSlots === Math.ceil(9000 / MAX) + Math.ceil(60 / MAX) + Math.ceil(120 / MAX) + 3,
        '材料在池子里占的格数 = Σ ceil(件数/100)（9000/60/120/5/3/40 → 六种）', '占 ' + u.matSlots + ' 格');
    } else {
      say(items.exp_m === 3 && items.ticket_normal === 1, '近乎空的背包：读档不报错、那两件道具还在', JSON.stringify(items));
    }
    /* 容量口径：max(基数 50, 已扩容值, **实际理论占用**) —— 三条一起验 */
    if (name === 'bag_both_expanded') {
      say(u.cap === u.used && u.used >= 103, '并池容量 = max(50, 已扩容 80/70, **实际占用 103**) ＝ 103 —— 占用那一路真的参与取大',
        'cap=' + u.cap + ' · used=' + u.used);
      say(u.matCap === 70, '旧 matCap 仍是冻结快照（70），没有被并池改掉', 'matCap=' + u.matCap);
      say(Core.S.bag.itemCap === 80 && Core.S.bag.matCap === 70, '旧容量字段**仍在**（冻结快照，回滚与网页版靠它）');
    }
    if (name === 'bag_mat_only') say(u.cap === u.used && u.cap >= 103, '只扩过材料池：并池容量 = max(50, 50, 90, 占用 103) ＝ 103，不缩水', 'cap=' + u.cap);
    if (name === 'bag_never_touched') {
      /* V1.1.4（A12）改口径：这份样本的底档带着「命格 Lv.3」→ 属于"动过命格的老档"，
         按《续2》§3.5 第 3 条拿得到入门包（铭魂砂×5 ＋ 血髓晶×3 ＝ 多占 **2 格**）。
         原来是"只占 2 格"（A11 时代还没有入门包）；现在正确值是 **4 格**。 */
      say(u.cap === 50 && u.used === 4, '从没进过背包：容量仍是基数 50；基础 2 格 ＋ 入门包 2 格 ＝ 4 格', 'cap=' + u.cap + ' used=' + u.used);
      say(items.minghun_sha === 5 && items.xuesui_jing === 3, 'A12 入门包发到了（铭魂砂×5 ＋ 血髓晶×3）', JSON.stringify(items));
    }
    if (name === 'bag_ancient_merged') {
      say(u.cap >= 103 && Core.S.bag.itemExpands === 2, '极老档（只有旧合并池 expands:2）→ 三池容量都按 50+2×10=70 起取大',
        'cap=' + u.cap + ' · itemExpands=' + Core.S.bag.itemExpands);
      say(!!Core.S.bag && Core.S.bag.itemCap !== undefined, '旧结构被补成三池（itemCap/matCap/eqCap 都有了）', JSON.stringify(Core.S.bag));
      /* V1.1.4（A12）改口径：这份样本**背包已经占满**（used 103 ＝ cap 103）→ 入门包整批进待领箱。
         原来是"待领箱必须是空的"（A11 时代）；现在正确值是"**正好**是那 8 件入门包" ——
         既不许丢（数量对得上），也不许凭空多出别的。 */
      const st = Core.stashList ? Core.stashList() : [];
      const stCnt = Core.stashCount ? Core.stashCount() : 0;
      say(stCnt === 8
        && st.some((x) => x.id === 'minghun_sha' && x.n === 5)
        && st.some((x) => x.id === 'xuesui_jing' && x.n === 3)
        && st.every((x) => x.id === 'minghun_sha' || x.id === 'xuesui_jing'),
        '背包满时入门包整批进待领箱：8 件、id 与件数都对，没有别的东西', 'stash=' + stCnt + ' ' + JSON.stringify(st.map((x) => x.id + '×' + x.n)));
      /* 幂等（A12 明点的那条风险）：**多读一次档不许再发一遍入门包** —— 背包与待领箱都不许变。
         这条与下面那条 bag 幂等是同一件事的两个面（一个看容量、一个看东西）。 */
      const snapItems = JSON.stringify(Core.S.items), snapStash = JSON.stringify(Core.S.stash);
      try { Core.migrate && Core.migrate(); } catch (e) {}
      say(JSON.stringify(Core.S.items) === snapItems && JSON.stringify(Core.S.stash) === snapStash,
        '多读一次档：入门包没有重复发（背包与待领箱一字未动）',
        '砂=' + (Core.S.items.minghun_sha || 0) + ' · 箱内 ' + (Core.stashCount ? Core.stashCount() : 0));
      /* 幂等：再跑一次迁移，容量与标记都不许变 */
      const before = JSON.stringify(Core.S.bag);
      try { Core.migrate && Core.migrate(); } catch (e) {}
      say(JSON.stringify(Core.S.bag) === before, '迁移幂等（再跑一次结果一样）', before);
    }
    if (loaded && (bigMat ? items.mat_t1 === 9000 : true) && u.cap >= 50) out('__ALL_OK__');
    process.exit(0);
  }

  say(loaded === true, '旧存档能读进来');
  if (!loaded) { process.exit(0); }
  /* 进度一点不丢 */
  /* 2026-09-23（文案策划 · 提审合规，顺手修了一把一直红的尺子 —— **不是我把它调绿了**）：
     这条原来断言 `S.player.name === '老玩家'`（就是造档时写进去的那个名字）。但**平台审核要求
     "主角名只能从预设名单里选、不许自由输入"**，于是 core.js 的 cleanName() 改成了白名单：
     不在 PROTAG_NAMES 里的名字一律拒掉、由 nameFallback() 落一个**确定的**预设名（北辰）。
     也就是说 —— 游戏的行为是对的（旧档里那个自填名必须被换掉），**过时的是这条期望**：
     它还在要求"自填名原样活下来"。四个用例因此长期各挂一条红。
     改法不是放宽，而是换成**新规矩的断言**：等级不许变 + 名字必须落在预设白名单里。
     这条比原来那条更严 —— 它顺带守住"自填名不许穿过读档进入游戏"这条审核线。 */
  say(S.player.level === 37 && D.PROTAG_NAMES.indexOf(S.player.name) >= 0,
    '主角等级没变，名字被规整进预设名单（平台要求：不许自由输入）',
    'Lv.' + S.player.level + ' ' + S.player.name);
  /* V9.6.134：货币 8 → 4 —— 老档的「故事点 401」并进点数（×71）、
     「技能芯片 12 ×3.5 + 血统结晶 20 ×28 + 深井徽记 0 ×30」并进异界结晶。
     这里不是"数字不许变"，而是**折算规则必须对得上、且旧键要清干净**：
       points      = 54321 + 401×71 = 82792
       otherworld  = 7 + round(12×3.5 + 20×28 + 0×30) = 7 + 602 = 609
     旧的四个键必须一个都不剩（留着就是"改一半"）。 */
  const expPoints = 54321 + 401 * 71;
  const expOw = 7 + Math.round(12 * 3.5 + 20 * 28 + 0 * 30);
  say(S.cur.points === expPoints, '老档的故事点折进了点数（×71，一点没丢）', '◉' + S.cur.points + '（应为 ' + expPoints + '）');
  say(S.cur.otherworld === expOw, '老档的技能芯片/血统结晶/深井徽记折进了异界结晶', '◆' + S.cur.otherworld + '（应为 ' + expOw + '）');
  say(['story', 'skillChip', 'bloodCrystal', 'corridor'].every(k => !(k in S.cur)),
    '四个旧货币键全清干净了（没留"半新半旧"的档）', Object.keys(S.cur).join(','));
  say(S.cur.holy === 88 && S.cur.rp === 3, '没被合并的两种货币原样保留', '✦' + S.cur.holy + ' ♾' + S.cur.rp);
  const who = S.chars.C002 || S.chars.C001;
  say(!!who && who.lv === 41, '伙伴等级没变（没被迁移逻辑顺手删掉）', who ? 'Lv.' + who.lv : '(没了)');
  say(S.worlds.W01.stages.normal[2] === 2, '关卡进度没变');
  say((S.quests.claimed || []).length === 3, '已领任务没变');
  /* 主角站在哪一格由"他原来那一排"决定（老档 player.row）——这里只要求：长度 5、主角在里面、招募到的伙伴还在 */
  say(S.party.length === 5 && S.party.indexOf('@player') >= 0 && S.party.indexOf('C002') >= 0,
    '阵容被规整成 5 格、主角和伙伴都在里面', JSON.stringify(S.party));
  say(S.party.indexOf('C999') < 0, '已经不存在的伙伴被清掉（不然会崩）');
  /* 新字段被补齐（老档没有的那些） */
  const need = ['travel', 'garden', 'arena', 'fabao', 'mount', 'sign', 'keji', 'recruit', 'tasks', 'idle', 'bounty', 'beast', 'codex', 'presets', 'unlocks'];
  const miss = need.filter((k) => S[k] === undefined || S[k] === null);
  say(miss.length === 0, '新系统字段全部补齐（不再是 undefined）', miss.length ? '缺：' + miss.join(',') : need.length + ' 项齐全');
  say(S.recruit && S.recruit.pity && S.recruit.pity.advanced && typeof S.recruit.pity.advanced.ssr === 'number', '深层字段也补齐了（recruit.pity.advanced.ssr）');
  say(S.travel && typeof S.travel.bankSec === 'number', '挂机/游历的计时字段补齐');
  /* V1.0.1 改壳（求签 → 点灯）：档位名是**存进存档的值**，旧档必须被迁移。
     老档（改壳前）存的是大吉 / 上吉…，只改壳不迁移 = 面板显示【大吉】而文案是空的。 */
  if (name === 'old_sign_words') {
    say(S.sign.tier === '长明', '旧档位名（大吉）被迁移成新档位名（长明）', String(S.sign.tier));
    const st = Core.signState();
    say(!!st.pick && st.pick.tier === '长明', '面板还能取到对应的灯焰文案（不是空白）', st.pick ? st.pick.tier : '(取不到)');
    say(S.sign.idlePct === 0.3 && S.sign.drawn === 1 && Core.signIdleMult() > 1,
      '挂机加成与已点次数原样保留（改壳不许动数值）', '+' + Math.round(S.sign.idlePct * 100) + '% · 已点 ' + S.sign.drawn + ' 次');
  }
  /* V1.0.1 二轮（幽都装备名换壳）：装备名是**存进存档的值**，老档必须一起翻；
     但只许翻显示名 —— 强化等级 / 词条 / 基础值 / uid 绑定一个都不许动。 */
  if (name === 'old_equip_words') {
    const name1 = S.equips.E1 ? S.equips.E1.name : '(丢了)';
    const name2 = S.equips.E2 ? S.equips.E2.name : '(丢了)';
    const name3 = S.equips.E3 ? S.equips.E3.name : '(丢了)';
    say(name1 === '沉纹长袍', '世界套装件换名（符咒道袍 → 沉纹长袍）', name1);
    say(name2 === '修真·云冠', '带「·」前缀的血统件也换（修真·道冠 → 修真·云冠）', name2);
    say(name3 === '狼纹胸甲', '不在换名表里的装备名**完全不被动**（防过度清理）', name3);
    say(S.equips.E1 && S.equips.E1.enhance === 3 && S.equips.E1.affixes.length === 1 && S.equips.E1.base.def === 120,
      '只翻显示名：强化等级 / 词条 / 基础值一个没动',
      '强化 ' + S.equips.E1.enhance + ' · 词条 ' + S.equips.E1.affixes.length + ' 条 · 防御 ' + S.equips.E1.base.def);
    say(S.equipped['@player'].armor === 'E1' && S.equipped['@player'].head === 'E2',
      '穿在身上的那两件一起换名，uid 绑定没断',
      S.equipped['@player'].head + ' / ' + S.equipped['@player'].armor);
  }
  /* ⓪ 2026-09-27（0927-G · 本命装备 36 件）：旧专属的就地升级 */
  if (name === 'sig_old_equips') {
    const sigOf = (cid, slot) => (D.SIGNATURE_EQUIPS || []).filter((s) => s.charId === cid && s.slot === slot)[0] || {};
    const e1 = S.equips.E1, e2 = S.equips.E2, e3 = S.equips.E3, e4 = S.equips.E4;
    say(Object.keys(S.equips).length === 4, '三件专属＋一件对照件都在（没变成 6 件、也没丢件）', Object.keys(S.equips).join(','));
    say(!!e1 && e1.name === '黑田·破军刀' && e1.charId === 'C111',
      '唯一要改绑的那件（代行之刃 C120 狼人第三 → 黑田·破军刀 C111 狼人第一）', e1 ? e1.name + ' / ' + e1.charId : '(丢了)');
    say(!!e2 && e2.name === '元素咏叹' && e2.charId === 'C059',
      '本来就绑第一的那件：**不改绑也不改名**（元素咏叹 → C059 楚衍，修真第一）', e2 ? e2.name + ' / ' + e2.charId : '(丢了)');
    say(!!e3 && e3.name === '绯河刃' && e3.charId === 'C115', '绑定本来就对的那件：名字留用（绯河刃）', e3 ? e3.name : '(丢了)');
    const same = (e, cid, slot) => {
      const sig = sigOf(cid, slot);
      if (!e || !Array.isArray(sig.affixes)) return false;
      return e.affixes.length === 5 && sig.affixes.every((a, i) => e.affixes[i].k === a.k && e.affixes[i].v === a.v);
    };
    say(same(e1, 'C111', 'weapon') && same(e2, 'C059', 'weapon') && same(e3, 'C115', 'weapon'),
      '词条补齐到 5 条，且与新表同部位那件**逐条一致**（不是随手加两条）',
      e1 ? e1.affixes.length + '/' + e2.affixes.length + '/' + e3.affixes.length + ' 条' : '');
    say(e1 && e1.sigText && e1.sigText.indexOf('黑田宗一') === 0, 'sigText 也跟着换了角色（文案不许留旧人）', e1 && e1.sigText);
    say(!!e1 && e1.enhance === 7 && !!e3 && e3.enhance === 3 && e3.lock === true,
      '强化等级与锁定原样保留（+7 / +3、E3 仍锁着）', e1 ? '+' + e1.enhance + ' · E3 +' + e3.enhance + ' lock=' + e3.lock : '');
    const wantAtk = Math.round(1707 * D.SIGNATURE_BASE_RATIO);
    say(!!e1 && e1.base.atk === wantAtk, '基础值补到新系数那一档（1707 → ' + wantAtk + '，×1.30÷1.15）', e1 && String(e1.base.atk));
    say(!!e4 && e4.name === '狼纹胸甲' && e4.affixes.length === 1 && e4.base.def === 100 && e4.enhance === 1,
      '对照件（普通 SSR，没有 charId）**一个字都没动**（防过度清理）',
      e4 ? e4.name + ' · ' + e4.affixes.length + ' 条 · 防御 ' + e4.base.def : '(丢了)');
    /* 幂等：再跑一次迁移 —— 词条不许变 10 条、基础值不许再乘一次 */
    const snap = JSON.stringify([e1, e2, e3]);
    try { Core.migrate && Core.migrate(); } catch (e) {}
    say(JSON.stringify([S.equips.E1, S.equips.E2, S.equips.E3]) === snap,
      '再跑一次迁移：词条还是 5 条、基础值没有重复相乘（幂等）',
      S.equips.E1 ? S.equips.E1.affixes.length + ' 条 · 攻 ' + S.equips.E1.base.atk : '');
    say(Object.keys(S.equips).length === 4, '再跑一次也没有多出件数', Object.keys(S.equips).join(','));
    /* 图鉴装备卷：旧名清掉、新名跟上、收集数不许超过总数 */
    const names = S.codex.equipNames || [];
    const vol = Core.codexState().volumes.filter((v) => v.id === 'equips')[0];
    say(names.indexOf('代行之刃') < 0,
      '图鉴装备卷把"已经不存在"的旧专属名清掉了（代行之刃）', names.join(','));
    say(names.indexOf('黑田·破军刀') >= 0 && names.indexOf('元素咏叹') >= 0 && names.indexOf('绯河刃') >= 0,
      '换名后的新名与留用名都在装备卷里（黑田·破军刀 / 元素咏叹 / 绯河刃）', names.join(','));
    say(vol && vol.owned <= vol.total && vol.total > 200,
      '装备卷"已收集 ≤ 总数"（旧清单会把 C120 / weapon / 神装文案当可收集项，已修）',
      vol ? vol.owned + ' / ' + vol.total : '(取不到)');
  }
  say(S.v === 5, '版本号被写成当前版本', 'v=' + S.v);
  /* 读进来之后**每一页都要画得出来**（读档崩页面＝玩家进不去游戏） */
  const pages = (CV.panels ? Object.keys(CV.panels) : []);
  let bad = [];
  pages.forEach((p) => {
    if (['pickleader', 'pickswap', 'pickparty'].indexOf(p) >= 0) return;   // 需要先选目标的页，单独测
    try { CV.reset(p); } catch (e) { bad.push(p + '(' + e.message + ')'); }
  });
  say(bad.length === 0, '读档后每一页都能画出来（' + pages.length + ' 页）', bad.length ? bad.slice(0, 4).join(' / ') : '全过');
  /* 再存一次再读一次：来回一趟不丢东西 */
  Core.save();
  const again = Core.load();
  /* 存盘再读一遍：折算**只能发生一次**，第二次读档不许再加一遍（那就是白送货币） */
  say(again === true && Core.S.player.level === 37 && Core.S.cur.points === expPoints && Core.S.cur.otherworld === expOw,
    '存盘再读一遍，进度依旧、折算也没重复跑', '◉' + Core.S.cur.points + ' ◆' + Core.S.cur.otherworld);
  if (loaded && !bad.length) out('__ALL_OK__');
  process.exit(0);
}

/* ==================== 主进程：逐个跑 ==================== */
console.log('\n=== 存档兼容体检（更新不许要求玩家删档）===');
const cases = ['old_missing_blocks', 'older_version', 'old_party4', 'old_sign_words', 'old_equip_words', 'sig_old_equips', 'shard_pool_old', 'ancient_save', 'broken_json', 'future_version',
  /* V1.1.1：背包四份样本（单格上限 100 那一条的验收） */
  'bag_both_expanded', 'bag_mat_only', 'bag_never_touched', 'bag_ancient_merged',
  /* V1.1.4（A12 材料）：入门包"不发"的那一半 */
  'a12_pack_fresh'];
let okAll = true;
cases.forEach((c) => { if (!runCase(c)) okAll = false; });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (okAll ? '旧存档都能平滑升级，读不出来的也会原样备份 ✓' : '有存档会丢 / 会崩 ✗') + '\n');
process.exitCode = okAll ? 0 : 1;
