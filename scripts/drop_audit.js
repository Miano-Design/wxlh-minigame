/* 掉落分配体检：node scripts/drop_audit.js

   起因（2026-09-18 父亲大人）："各种装备或道具材料掉落的几率你都检查一下分配合不合理。"

   装备品质那一段由 drop_table.js 管（按世界段的概率表）；这里管**除此之外的所有掉落**：
     · 一场战斗到底掉什么、期望掉多少（材料 / 券 / 兽魂石 / 经验模块 / 装备）
     · 把"一场"换算成"一天"（照玩家的真实打法：12 关一巡 + 扫荡 60 次）
     · 和**消耗口**对一对：强化吃什么材料、孵蛋要几颗、招募券够不够
     · 商店的箱子开出来的东西，档位对不对（这一条当场抓出过一个大坑）

   只读。改掉落跑一下。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const Core = window.Core, D = window.DATA, Dun = window.Dungeon;

let alarm = 0;
const warn = (t) => { alarm++; console.log('  ⚠ ' + t); };

/* 一关的"种类"：1~4 普通、4/8 精英、12 守关（与 Dun.finalKind 同源） */
const stageKind = (s) => Dun.finalKind(s);

/* 体检专用的"无限背包"。默认三池各 50 格，几千次采样一定会被塞满；
   一旦满了 `Core.addItem` 返回 false，那一件掉落**不会进 `got`**（游戏里走待领箱，东西不丢），
   尺子读到的掉率就被吃掉。实测过：兽魂石因此被读成 0.3 颗/天，真值 1.8 颗/天。
   —— 所以每个采样段开跑前都要先 `openBag()`。 */
const openBag = () => { Core.S.bag.itemCap = 1e6; Core.S.bag.matCap = 1e6; Core.S.bag.eqCap = 1e6; };

/* 打一遍某世界的普通难度：12 关各一次，统计掉落（跑 N 次取平均） */
function runWorld(worldId, diff, N) {
  Core.newGame(); Core.setPlayerName('掉落体检'); Core.choosePlayerBloodline('修真');
  openBag();                                        // 别让背包满触发自动分解、也别让掉落被容量吃掉
  const acc = {};
  const add = (k, v) => { acc[k] = (acc[k] || 0) + v; };
  for (let r = 0; r < N; r++) {
    for (let s = 1; s <= 12; s++) {
      const kind = stageKind(s);
      const g = Dun.grantRewards(worldId, diff, s, kind);
      (g.got || []).forEach(x => {
        const key = x.k === 'item' ? x.v : x.k === 'equip' ? '装备' : x.k;
        add(key, x.k === 'item' ? (x.n || 1) : 1);
      });
    }
  }
  const out = {};
  Object.entries(acc).forEach(([k, v]) => { out[k] = +(v / N).toFixed(2); });
  return out;
}

console.log('=== ① 打完一张图的 12 关，平均能拿到什么（普通难度）===');
const worldsToTry = [1, 3, 5, 8, 10, 14, 18, 20, 21, 26, 31, 36];
const rows = worldsToTry.map(n => ({ n, w: D.WORLDS[n - 1], got: runWorld(D.WORLDS[n - 1].id, 'normal', 200) }));
const itemKeys = ['装备', 'mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5', 'ticket_normal', 'ticket_adv', 'beast_egg', 'exp_l', 'exp_xl', 'exp_xxl'];
console.log('  世界        ' + itemKeys.map(k => k.padEnd(9)).join(''));
rows.forEach(r => {
  console.log('  W' + String(r.n).padStart(2) + ' ' + r.w.name.padEnd(6) + ' ' + itemKeys.map(k => String(r.got[k] || 0).padEnd(9)).join(''));
});

console.log('\n=== ② 换算成"一天"（照玩家的真实打法：扫荡守关 18 次 + 手打一巡 12 关）===');
{
  const per = D.WORLDS.length;
  [10, 20, 30, 36].forEach(n => {
    const w = D.WORLDS[n - 1];
    const hand = rows.find(x => x.n === n) || { got: runWorld(w.id, 'normal', 200) };
    const g = hand.got;
    /* 扫荡只给材料 / 点数 / 结晶（不给券 —— 见 dungeon.js 的说明），所以按 noTicket 算一次守关 */
    Core.newGame(); Core.setPlayerName('扫荡体检'); Core.choosePlayerBloodline('修真');
    openBag();
    const sw = {};
    const N = 300;
    for (let i = 0; i < N; i++) {
      const r = Dun.grantRewards(w.id, 'normal', 12, 'boss', { noTicket: true });
      (r.got || []).forEach(x => { const key = x.k === 'item' ? x.v : (x.k === 'equip' ? '装备' : x.k); sw[key] = (sw[key] || 0) + (x.k === 'item' ? (x.n || 1) : 1); });
    }
    Object.keys(sw).forEach(k => { sw[k] = +(sw[k] / N).toFixed(2); });
    const day = {};
    Object.entries(g).forEach(([k, v]) => { day[k] = (day[k] || 0) + v; });
    Object.entries(sw).forEach(([k, v]) => { day[k] = (day[k] || 0) + v * 18; });
    console.log('  打到 W' + n + '（' + w.name + '）时的一天：'
      + itemKeys.filter(k => day[k]).map(k => k + ' ' + Math.round(day[k])).join(' · '));
  });
}

console.log('\n=== ③ 和消耗口对一对 ===');
{
  /* 强化：每一档要吃的材料（见 ENHANCE_RATE / enhanceQuote）—— 每失败不降级，平均几次上一次 */
  const rateSum = D.ENHANCE_RATE.reduce((a, b) => a + b, 0);
  const avgTries = D.ENHANCE_RATE.length / rateSum;    // 平均每次成功要几次
  console.log('  把一件装备从 +0 砸到 +20：平均需要 ' + avgTries.toFixed(2) + ' × 20 ≈ ' + Math.round(avgTries * 20) + ' 次尝试（每次吃 1 块对应档位材料）');
  console.log('  六件装备全 +20 ≈ ' + Math.round(avgTries * 20 * 6) + ' 块材料（一个人）');
  const w20 = rows.find(x => x.n === 20) || { got: {} };
  const matsPerRun = itemKeys.filter(k => k.startsWith('mat_')).reduce((s, k) => s + (w20.got[k] || 0), 0);
  console.log('  而打一巡 W20 平均掉 ' + matsPerRun.toFixed(1) + ' 块材料 → 一个人满强化约需 ' + Math.round(avgTries * 20 * 6 / Math.max(0.1, matsPerRun)) + ' 巡');

  /* 兽魂石：10 颗孵 1 只 —— 用**实测**的守关/精英掉率算日产量（别在体检里另写一份假设） */
  {
    Core.newGame(); Core.setPlayerName('兽魂体检'); Core.choosePlayerBloodline('修真');
    openBag();
    const N = 4000;
    let eggBoss = 0, eggElite = 0;
    for (let i = 0; i < N; i++) {
      const gb = Dun.grantRewards('W21', 'normal', 12, 'boss', { noTicket: true });
      eggBoss += (gb.got || []).filter(x => x.v === 'beast_egg').reduce((s, x) => s + (x.n || 1), 0);
      const ge = Dun.grantRewards('W21', 'normal', 8, 'elite', { noTicket: true });
      eggElite += (ge.got || []).filter(x => x.v === 'beast_egg').reduce((s, x) => s + (x.n || 1), 0);
    }
    const perDay = eggBoss / N * 18;                 // 扫荡 18 次守关（10 基础 + 灯阁权限满 +8）
    console.log('  兽魂石：守关 ' + (eggBoss / N * 100).toFixed(1) + '% · 精英 ' + (eggElite / N * 100).toFixed(1)
      + '% → 扫荡 18 次 ≈ ' + perDay.toFixed(1) + ' 颗/天（10 颗孵 1 只 → 约 ' + (perDay / 10).toFixed(1) + ' 只/天，全 12 只约 '
      + Math.ceil(12 / Math.max(0.01, perDay / 10)) + ' 天收齐）');
    if (perDay > 15) warn('兽魂石日产 ' + perDay.toFixed(0) + ' 颗 —— 12 只伴生体两天就刷穿了（曾经就是 105/天）');
  }
  const b = Dun.battleRewards(D.WORLDS[35].id, 'normal', 12, 'boss');
  if (b.equipChance < 1) warn('守关 Boss 的装备掉落率不是 100%（现在是 ' + b.equipChance + '）—— 守关该必掉');

  /* 招募券：手打才有 */
  const w36 = rows.find(x => x.n === 36) || { got: {} };
  const tN = w36.got.ticket_normal || 0, tA = w36.got.ticket_adv || 0;
  console.log('  招募券：手打一巡 W36 = 普通券 ' + tN.toFixed(1) + ' + 高级券 ' + tA.toFixed(1) + '（扫荡不给券，是设计）');
  console.log('         高级池 10 连要 10 张高级券 → 一天手打一巡能凑 ' + ((tA) / 10).toFixed(2) + ' 次十连');
}

console.log('\n=== ④ 商店的箱子：开出来的东西档位对不对 ===');
{
  Core.newGame(); Core.setPlayerName('开箱体检'); Core.choosePlayerBloodline('修真');
  const src = Core.boxSourceWorld ? Core.boxSourceWorld() : '(没有这个函数)';
  console.log('  开箱取哪个世界做档位：' + src);
  ['box_r', 'box_sr', 'box_ssr', 'box_ur', 'box_myth'].forEach(id => {
    const it = D.ITEMS[id];
    if (!it) { console.log('  ' + id + '：' + (D.SHOPS.otherworld.items.some(x => x.item === id) ? '在卖但**道具表里没有** ✗' : '（没有这件）')); return; }
    const price = Object.values(D.SHOPS).map(s => (s.items.find(x => x.item === id) || {}).price);
    console.log('  ' + id + ' ' + it.name + '：' + (it.desc || '').slice(0, 46) + ' · 价 ' + price.filter(Boolean).join('/'));
  });
  /* 档位是否随进度走：新号开 UR 箱 vs 满进度开 UR 箱 */
  const newbie = (() => { Core.newGame(); Core.setPlayerName('新号'); Core.choosePlayerBloodline('修真'); return Core.boxSourceWorld(); })();
  const veteran = (() => {
    Core.newGame(); Core.setPlayerName('老号'); Core.choosePlayerBloodline('修真');
    D.WORLDS.slice(0, 20).forEach(w => { Core.S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } }; });
    return Core.boxSourceWorld();
  })();
  console.log('  新号开箱档位 ' + newbie + ' · 打通 20 张图后开箱档位 ' + veteran);
  if (newbie === veteran) warn('开箱档位不随进度走 —— 后期买的箱子会开出新手装（这正是 V9.6.79 修掉的那个坑）');
}

/* ================= V1.1.9（续13 · P0-3）：装备**强制折现**不许把 ◆ 打穿 =================
   起因（报告 §三 3.2 第 1/3 条 ＋ §七 7.2 第 1 条，**本轮最大的经济缺口**）：
     B6 的"扫荡 +30 次（看广告）"把装备产出从 21 件/天 抬到 **51 件/天**，而装备格只有 50 →
     `grantEquip` 的"格满自动分解"会**替玩家把一整天的装备折现**成 ◆。
   这一条**原本一把尺子都没盯**（报告 §十一 P2 #15 点过"尺子与口径"），所以补在这里：
     量法＝**一件折现多少 ◆** × **51 件**，品质分布取**末期守关**（32/35 号世界：SR 5% / SSR 23% / UR 72%，
     与报告 §三 3.2 引的那一行逐字相同 → 可复核）。
     判据＝报告 §十一 P0 #3 的反解目标"折现从 2.4 万 ◆/天 回到 ~9,700"：
          线画在 **≤ 基线 ◆ 日产（5,636，报告 §七 7.1 默认档实测）× 2.2**。
     实测：改前 **24,271 ◆/天（4.31×）→ 红**；改后 **9,996 ◆/天（1.77×）→ 绿**。
     ⇒ 这就是"改坏试验"的那把尺子：把 `DECOMPOSE_GAIN` 改回去，它当场红。 */
  /* ⚠️ 2026-09-27 口径变更（父亲大人："不行啊，那我要是副本掉落的装备呢"）：
     **装备格满时不再自动折现**，而是进「装备待领箱」（`S.stashEq`，上限 60 件），
     扩容后一键领回 ⇒ 那条"替玩家折现一整天装备"的通道**只在待领箱也满 60 件时**才触发。
     所以实际的 ◆ 日产**回到基线 5,636**（9,996 那一条不再发生），玩家换到的是**真装备**。
     下面这段照旧量"万一折现"的单价账 —— 它守的是 `DECOMPOSE_GAIN` 与品质分布别被调坏，
     以及"折现通道真的兜得住"（暂存箱满 60 件之后仍要有人接）。 */
{
  console.log('\n=== 装备强制折现（B6 的 +30 次扫荡 → 51 件/天 → 格满自动分解）===');
  const BASE_OC_PER_DAY = 5636;                 // 报告 §七 7.1：默认档 ◆ 日产（修前基线）
  const per = D.dropChancesOf(32, 'boss', 'normal').table;   // 末期守关品质（与报告同一行）
  let one = 0; const parts = [];
  Object.keys(per).forEach((q) => { one += per[q] * D.DECOMPOSE_GAIN[q]; parts.push(q + ' ' + (per[q] * 100).toFixed(0) + '%'); });
  const day = one * 51;
  const ratio = day / BASE_OC_PER_DAY;
  console.log(`  末期守关 [${parts.join(' / ')}] → 单件 ${one.toFixed(1)} ◆ · 51 件/天 ＝ ${day.toFixed(0)} ◆/天`);
  console.log(`  相对基线 ◆ 日产 ${BASE_OC_PER_DAY} ＝ **${ratio.toFixed(2)}×**（判据 ≤2.2×）`);
  if (ratio > 2.2) {
    alarm++;
    console.log(`  ✗ 强制折现把 ◆ 打穿了：${day.toFixed(0)} ◆/天 ＝ 基线的 ${ratio.toFixed(2)} 倍 ——`
      + ' 这正是 B6 上线后报告点出的那个缺口（调回 DECOMPOSE_GAIN 或收掉广告那 30 件）');
  } else {
    console.log('  ✓ 强制折现没有把 ◆ 打穿（广告那 30 件不再等于 4.3 倍日收入）');
  }
}

console.log('\n' + (alarm ? '✗ 有 ' + alarm + ' 条要看' : '✓ 掉落分配没有明显不合理的地方'));
