/* 《残域》副本/关卡/深井：敌人编成、路线生成、奖励 */
window.Dungeon = (function () {
  const D = window.DATA;
  const THEME_FACTION = { bio: '先锋', ghost: '异能', mystic: '策略', tech: '科技', god: null };

  function diffMult(diff) { return (D.DIFFICULTY.find(d => d.id === diff) || D.DIFFICULTY[0]).mult; }
  function rewardMult(diff) { return (D.DIFFICULTY.find(d => d.id === diff) || D.DIFFICULTY[0]).rewardMult; }
  /* V9.5.64（父亲大人：副本前期太难、没几关就卡）——
   关卡成长从 1.16 放到 1.13；攻击曲线也从 1.10 放到 1.085（见 makeEnemies）。 */
function stageMult(stage) { return Math.pow(1.13, stage - 1); }

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
    const ease = wi >= 7 ? 1 : 0.40 + wi * 0.0857;
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
      const list = [mk(w.boss, bossHp * bossHpMult, w.atk * 1.10 * diffMult(diff) * (1 + stage * 0.04) * ease, w.def * 1.4 * diffMult(diff) * (1 + stage * 0.05), { isBoss: true })];
      list.push(mk(w.enemies[0], w.hp * m * 1.5, w.atk * mAtk, w.def * mDef, {}));
      if (diff !== 'normal') list.push(mk(w.enemies[1], w.hp * m * 1.5, w.atk * mAtk, w.def * mDef, {}));
      return label(list);
    }
    if (kind === 'elite') {
      return label([
        mk(w.elite, w.hp * 2.0 * m, w.atk * 1.35 * mAtk, w.def * 1.3 * mDef, { isElite: true }),   // V9.5.64：精英不再是一堵墙
        mk(w.enemies[Math.floor(Math.random() * 3)], w.hp * m, w.atk * mAtk, w.def * mDef, {}),
      ]);
    }
    // 前期单人也能打：1关1只(70%)，2关1只(85%)，3关2只(85%)，4关2只(92%)，5关起满编，8关起3只
    if (stage <= 2) {
      const weak = stage === 1 ? 0.7 : 0.85;
      return [mk(w.enemies[0], w.hp * m * weak, w.atk * mAtk * weak, w.def * mDef * weak, {})];
    }
    if (stage <= 4) {
      const weak = stage === 3 ? 0.85 : 0.92;
      const out = [];
      for (let i = 0; i < 2; i++) out.push(mk(w.enemies[i % w.enemies.length], w.hp * m * weak, w.atk * mAtk * weak, w.def * mDef * weak, {}));
      return label(out);
    }
    const n = 2 + (stage >= 8 ? 1 : 0);
    const out = [];
    for (let i = 0; i < n; i++) out.push(mk(w.enemies[Math.floor(Math.random() * w.enemies.length)], w.hp * m, w.atk * mAtk, w.def * mDef, {}));
    return label(out);
  }

  // 战斗奖励
  function battleRewards(worldId, diff, stage, kind) {
    const tier = D.WORLDS.findIndex(x => x.id === worldId) + 1;
    const rm = rewardMult(diff) * (1 + (stage - 1) * 0.08);
    const base = { points: 0, exp: 0, story: 0, otherworld: 0, skillChip: 0, bloodCrystal: 0, equipChance: 0, equipMin: null };
    if (kind === 'boss') {
      base.points = Math.round((500 + tier * 150) * rm);
      base.exp = Math.round((300 + tier * 80) * rm);
      base.story = Math.round(50 * rm);
      base.otherworld = Math.round(30 * rm);
      base.skillChip = 50 + tier * 8;
      /* V9.5.65（策划体检留档）：一度想把这行从 5/15/30 翻倍，理由是"铭刻 5 阶要 8200 枚结晶"。
         补上"扫荡"这一环后实测发现守关 Boss 是**可反复扫荡**的稳定来源：
         每天 60 次扫荡 ≈ 300 枚/天，铭刻全解锁约 27 天、单伙伴血统满 8 天，供给本来就够。
         所以维持原值——不要凭半张表去改经济。 */
      base.bloodCrystal = diff === 'hell' ? 30 : diff === 'hard' ? 15 : 5;
      base.equipChance = 1;
      base.equipMin = diff === 'hell' ? 'SSR' : 'SR';
    } else if (kind === 'elite') {
      base.points = Math.round((80 + tier * 40) * rm * 2.5);
      base.exp = Math.round((60 + tier * 20) * rm * 2.5);
      base.story = Math.random() < 0.5 ? Math.round(15 * rm) : 0;
      base.skillChip = 15 + tier * 2;
      base.equipChance = 0.55;
    } else {
      base.points = Math.round((80 + tier * 40) * rm);
      base.exp = Math.round((60 + tier * 20) * rm);
      base.skillChip = 5 + tier;
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
    if (r.story) { Core.addCur('story', r.story); got.push({ k: 'story', v: r.story }); }
    if (r.otherworld) { Core.addCur('otherworld', r.otherworld); got.push({ k: 'otherworld', v: r.otherworld }); }
    if (r.skillChip) { Core.addCur('skillChip', r.skillChip); got.push({ k: 'skillChip', v: r.skillChip }); }
    if (r.bloodCrystal) { Core.addCur('bloodCrystal', r.bloodCrystal); got.push({ k: 'bloodCrystal', v: r.bloodCrystal }); }
    // 天赋「灯阁恩赐」的掉落加成：装备掉落率、材料掉落率、宝箱补给率统一按比例提高
    const dropBoost = Core.graceDropMult ? Core.graceDropMult() : 1;
    if (Math.random() < Math.min(1, r.equipChance * dropBoost)) {
      const cap = D.stageDropCap(stage);
      let rarity = D.rollRarity(diff, r.equipMin);
      if (!r.equipMin) rarity = D.capRarity(rarity, cap);   // Boss保底不受上限影响
      const res = Core.grantEquip(worldId, rarity);
      if (res.equip) got.push({ k: 'equip', v: res.equip });
      else if (res.sold) got.push({ k: 'otherworld', v: res.gain, sold: true });
    }
    // 地狱 Boss：5% 掉落 SSR 伙伴专属装备
    if (kind === 'boss' && diff === 'hell' && Math.random() < 0.05) {
      const sig = D.SIGNATURE_EQUIPS[Math.floor(Math.random() * D.SIGNATURE_EQUIPS.length)];
      const sigRes = Core.grantSignatureEquip(D.SIGNATURE_EQUIPS.indexOf(sig));
      if (sigRes.equip) got.push({ k: 'equip', v: sigRes.equip, signature: true });
      else if (sigRes.sold) got.push({ k: 'otherworld', v: sigRes.gain, sold: true });
    }
    if (r.exp) got.push({ k: 'exp', v: r.exp });
    // 强化材料掉落：精英 35%、Boss 必掉 1~2 件，普通战 8% 小概率掉，tier 随世界序号
    const wi = D.WORLDS.findIndex(x => x.id === worldId);
    const tier = Math.min(5, wi + 1);
    const matId = 'mat_t' + tier;
    if (kind === 'elite' && Math.random() < Math.min(1, 0.35 * dropBoost)) { if (Core.addItem(matId)) got.push({ k: 'item', v: matId, n: 1 }); }
    if (kind === 'boss') { const n = 1 + (Math.random() < 0.5 ? 1 : 0); if (Core.addItem(matId, n)) got.push({ k: 'item', v: matId, n }); }
    if (kind === 'combat' && Math.random() < Math.min(1, 0.08 * dropBoost)) { if (Core.addItem(matId)) got.push({ k: 'item', v: matId, n: 1 }); }
    /* V9.5.66（父亲大人）：探索消耗品（治疗剂 / 强化剂）整条线删掉，这里原来占着
       "普通战 20% / 精英 40% / Boss 必掉"三档掉落位。直接空掉会让每一局的收益凭空缩水，
       所以把这三档**换成同档位的强化材料**——材料有真实去处（强化装备、建筑、商店都在吃）。
       老档里已经买到的消耗品在 core.js 的 migrate() 里按原价退点数。 */
    const supplyChance = kind === 'boss' ? 1 : kind === 'elite' ? 0.40 : 0.20;
    if (Math.random() < Math.min(1, supplyChance * dropBoost)) {
      const sn = kind === 'boss' ? 2 : 1;
      if (Core.addItem(matId, sn)) got.push({ k: 'item', v: matId, n: sn });
    }
    /* 招募券掉落（V9.5.75 复核）：券是"探索的惊喜"，**扫荡不给**。
       起因：券改成"商店不卖、只能玩法获得"之后，我算了一下日产量——
       扫荡守关 Boss 一次掉券概率 50%，一天 60 次扫荡 = **30 张圣契招募令**（地狱再 +21 张限定券），
       而高级池 25% 出 SSR → 等于是每天白送 7 个 SSR，图鉴两周就满，招募这条线直接失去意义。
       现在：手打副本照旧掉券（打一关完整 12 层 ≈ 1.6 张普通券 + 1 张高级券，是"惊喜"的量级），
       扫荡只给材料 / 点数 / 结晶 —— 扫荡是"重复劳动"，惊喜不该从重复劳动里刷。 */
    if (!opts.noTicket) {
      if (kind === 'boss' && Math.random() < Math.min(1, 0.50 * dropBoost)) {
        if (Core.addItem('ticket_adv')) got.push({ k: 'item', v: 'ticket_adv', n: 1 });
      } else if (kind === 'elite' && Math.random() < Math.min(1, 0.28 * dropBoost)) {
        if (Core.addItem('ticket_adv')) got.push({ k: 'item', v: 'ticket_adv', n: 1 });
      } else if (kind === 'combat' && Math.random() < Math.min(1, 0.18 * dropBoost)) {
        if (Core.addItem('ticket_normal')) got.push({ k: 'item', v: 'ticket_normal', n: 1 });
      }
      // 地狱难度的 Boss 额外掉限定券（限定池是"定向池"，券最稀有）
      if (diff === 'hell' && kind === 'boss' && Math.random() < 0.35) {
        if (Core.addItem('ticket_lim')) got.push({ k: 'item', v: 'ticket_lim', n: 1 });
      }
    }
    // 高阶世界的普通战斗也会掉低级材料（前期囤的材料不会因为世界推进变废）
    if (kind !== 'boss' && tier > 1 && Math.random() < 0.12 * dropBoost) {
      const lowId = 'mat_t' + (tier - 1);
      if (Core.addItem(lowId)) got.push({ k: 'item', v: lowId, n: 1 });
    }
    // 高阶经验模块：W07 起精英/Boss 掉落，等级曲线调整后需要稳定的高阶经验来源
    if (tier >= 7 && (kind === 'boss' || (kind === 'elite' && Math.random() < 0.3 * dropBoost))) {
      const expId = tier >= 15 ? 'exp_xxl' : tier >= 11 ? 'exp_xl' : 'exp_l';
      const n = kind === 'boss' ? (tier >= 11 ? 1 : 2) : 1;
      if (Core.addItem(expId, n)) got.push({ k: 'item', v: expId, n });
    }
    /* 原来的"增益补给 / 高阶消耗品"两段判定同样并进素材掉落：
       精英/Boss 额外给一件当前档位材料，保证一局的实得收益不因删道具而变少。 */
    if (kind !== 'combat' && Math.random() < Math.min(1, 0.30 * dropBoost)) {
      if (Core.addItem(matId, 1)) got.push({ k: 'item', v: matId, n: 1 });
    }
    // 兽魂石：伴生体的唯一稳定来源。Boss 必掉 1~3 颗，精英 30% 掉 1 颗
    if (kind === 'boss') {
      const n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
      if (Core.addItem(D.BEAST_EGG_ITEM, n)) got.push({ k: 'item', v: D.BEAST_EGG_ITEM, n });
    } else if (kind === 'elite' && Math.random() < Math.min(1, 0.30 * dropBoost)) {
      if (Core.addItem(D.BEAST_EGG_ITEM, 1)) got.push({ k: 'item', v: D.BEAST_EGG_ITEM, n: 1 });
    }
    return { rewards: r, got };
  }

  /* 关卡 = 一场接一场的连续战斗（对标《道友修仙》的副本：点进去就打，不再让人选路线）。
     波数随关卡推进：1~4 关 1 波、5~8 关 2 波、9~12 关 3 波。
     最后一波才是"结算波"：第 4/8 关是精英、第 12 关是守关 Boss，其余是区域决战。
     波与波之间血量继承——这是"连打"的重量所在，也是治疗剂 / 强化剂仍然有用的地方。 */
  function finalKind(stage) {
    return stage === 12 ? 'boss' : stage % 4 === 0 ? 'elite' : 'combat';
  }
  function wavePlan(stage) {
    const n = stage <= 4 ? 1 : stage <= 8 ? 2 : 3;
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
    Core.S.sweep.count += n;
    Core.save();
    return { ok: true, total, count: n, capped: n < times };
  }

  return { makeEnemies, battleRewards, grantRewards, finalKind, wavePlan, sweep, diffMult, stageMult, THEME_FACTION };
})();
