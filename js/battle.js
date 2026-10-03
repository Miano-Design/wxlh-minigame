/* 《残域》战斗引擎：同步计算整局战斗，输出帧序列供 UI 播放 */
window.Battle = (function () {
  const D = window.DATA;

  /* ---------- 世界机制 ---------- */
  /* V9.5.88（十六度自审）：世界机制给玩家上的状态一直是"闷声上"的 ——
     `addStatus` 只管改数值，不往帧里写任何东西，界面里也没有一处显示状态（`.status-strip` 早被删了）。
     于是"感染：敌人攻击附带中毒"这句世界说明，玩家在战斗里完全看不到反馈：
     中毒只有回合开始的掉血飘字、眩晕只有一行"无法行动"，而**流血 / 虚弱 / 破防**连一个字都没有，
     只会觉得"怎么突然打不动了 / 怎么突然挨打更疼了"。这里统一走 applyStatus：
     状态真的挂上了就往帧里塞一条，界面飘一行状态名（被抗性挡掉就不飘，免得骗人）。 */
  /* extra：状态上的额外字段（V9.6.86 起用它带"施加者的攻击"，中毒/灼烧按它算伤害） */
  function applyStatus(target, frames, id, turns, extra) {
    if (!target || target.hp <= 0) return false;
    if (!addStatus(target, id, turns, extra)) return false;
    if (frames) frames.push({ type: 'status', target: target.uid, status: id });
    return true;
  }
  const MECHANICS = {
    W01: { onEnemyHit(t, fr) { if (Math.random() < 0.30) applyStatus(t, fr, 'poison', 2); }, note: '感染：敌人攻击附带中毒' },
    W02: { enemySpd: 1.2, onEnemyHit(t, fr) { if (Math.random() < 0.30) applyStatus(t, fr, 'bleed', 2); }, note: '突袭：敌人速度+20%；裂伤' },
    W03: { onEnemyHit(t, fr) { if (Math.random() < 0.25) applyStatus(t, fr, 'weak', 2); }, note: '恐惧：降低攻击；诅咒' },
    W04: { onEnemyHit(t, fr) { if (Math.random() < 0.15) applyStatus(t, fr, 'stun', 1); }, bossRevive: true, note: '陷阱：随机眩晕；复活' },
    /* 效果是"打到只剩 1 点血"（濒死），不是真的秒杀 —— 飘字也跟着叫"濒死"（V9.2 对齐）。
       V1.0.1（游戏策划总监会诊揪出的真 bug）：原来**每次敌人命中都独立掷 3%**，
       而一场 12 关的战斗里敌人要命中几十上百次 —— 累积起来几乎必中，
       于是"稀有事件"变成了"迟早挨一次"。实测最狠的一档：裸装 3 人、Lv.100 打 W05
       **0/3 通过**（第 7/10/12 关 3~7 回合被打死）；把这条关掉，同一套配置 **3/3 通过**。
       后果不只是难：`world_curve` 算出的 W05 下限 >100、W06 只要 85 ——
       **曲线在第 5/6 世界倒挂**（越往后越容易），玩家看到的"卡关"和数值曲线对不上。
       改法按策划建议取最省的一种：**每个单位每场最多触发一次**。
       标记打在单位对象上（`t._ndUsed`），而单位是每场新建的 → 天然随场重置，不用额外的开场钩子。 */
    W05: { onEnemyHit(t, frames) {
      if (t._ndUsed || t.hp <= 1) return;
      if (Math.random() < 0.03) { t._ndUsed = 1; t.hp = 1; frames.push({ type: 'nearDeath', target: t.uid }); }
    }, note: '迷失：每场最多一次，你会在雾里丢掉方向（打到剩 1 点血）' },
    W06: { enemyShield: 0.2, note: '沉眠：开场升起水幕护盾；远程水压冲击' },
    W07: { onEnemyHit(t, fr) { if (Math.random() < 0.20) applyStatus(t, fr, 'stun', 1); }, note: '睡眠：概率无法行动；幻觉' },
    W08: { allyHitMod: -0.15, note: '浓雾：命中-15%' },
    W09: { onEnemyHit(t, fr) { if (Math.random() < 0.30) applyStatus(t, fr, 'bleed', 3); }, note: '撕裂：裂伤；群体攻击' },
    W10: { onEnemyHit(t, fr) { if (Math.random() < 0.35) applyStatus(t, fr, 'poison', 3); }, note: '中毒：持续掉血；缠绕' },
    W11: { bossSummon: true, enemyLifesteal: 0.2, note: '召唤旧船员；汲取' },
    W12: { onEnemyHit(t, fr) { if (Math.random() < 0.25) applyStatus(t, fr, 'sunder', 2); }, note: '腐化：降低防御；群体增益' },
    W13: { onEnemyHit(t, fr) { if (Math.random() < 0.20) applyStatus(t, fr, 'freeze', 1); }, note: '冰冻：无法行动；王权强化' },
    W14: { randomRule: true, note: '随机规则：每回合变化' },
    /* W15~W20 的机制以前只写在世界表里、战斗引擎里根本没有（`MECHANICS[worldId] || {}` 直接落空），
       等于最后 6 个世界（180 关）是纯数值怪，但世界详情页照常写着"吸血 / 水压 / 幻觉…"。
       这里按世界表上的文案逐条补齐（V9.5）。 */
    W15: { enemyLifesteal: 0.25, enemyRageEvery: 4, enemyRage: 1.08, rageNote: '绯月高悬：敌方攻击提升', note: '汲取：敌人攻击回复自身；绯月强化' },
    W16: { allyDotPct: 0.04, allyDebuffChance: 0.30, allyDebuffId: 'weak', allyDebuffTurns: 2, debuffNote: '触手缠住了', note: '水压：每回合全队掉血；触手缠绕' },
    W17: { enemyAoeEvery: 3, enemyAoeMult: 1.2, enemyAoeName: '无人机群', onEnemyHit(t, fr) { if (Math.random() < 0.25) applyStatus(t, fr, 'weak', 2); }, note: '无人机群：群体攻击；电磁干扰' },
    W18: { confuseChance: 0.15, bossRevive: true, note: '幻觉：概率攻击队友；死亡复活' },
    W19: { enemyShield: 0.25, enemyAoeEvery: 5, enemyAoeMult: 1.5, enemyAoeName: '轨道扫射', note: '星骸护盾；轨道扫射' },
    W20: { randomRule: true, ruleEvery: 3, suppressAllies: 0.15, allyDotPct: 0.02, note: '规则改写：每 3 回合变换；全场压制' },
    /* W21~W36（V9.6.76 世界扩到 36 张时补的）。
       规矩照旧：**世界表上写什么，战斗引擎里就得真有什么** —— W15~W20 当年就是这个坑
       （文案写着吸血/水压，引擎里落空，180 关纯数值怪）。这里 16 条逐条对上，
       规则名也改成可配置的（镜界/灯阁说的不是同一句话）。 */
    W21: { onEnemyHit(t, fr) { if (Math.random() < 0.28) applyStatus(t, fr, 'weak', 2); }, enemyShield: 0.15, note: '静默：攻击附带恐惧；护幕' },
    W22: { enemyShield: 0.22, onEnemyHit(t, fr) { if (Math.random() < 0.20) applyStatus(t, fr, 'weak', 2); }, note: '锈壳护盾；电磁干扰' },
    W23: { onEnemyHit(t, fr) { if (Math.random() < 0.30) applyStatus(t, fr, 'poison', 3); }, bossSummon: true, note: '感染：攻击附带中毒；召唤幼体' },
    W24: { onEnemyHit(t, fr) { if (Math.random() < 0.25) applyStatus(t, fr, 'sunder', 2); }, enemyRageEvery: 5, enemyRage: 1.08, rageNote: '焚香燃起：敌方攻击提升', note: '腐化：降低防御；焚香灼烧' },
    W25: { randomRule: true, ruleEvery: 4, ruleName: '镜界法则', confuseChance: 0.12, note: '规则轮转：每 4 回合换一条；镜面幻觉' },
    W26: { enemyShield: 0.25, enemyAoeEvery: 5, enemyAoeMult: 1.4, enemyAoeName: '轨道扫射', note: '培养护盾；轨道扫射' },
    W27: { bossSummon: true, enemyLifesteal: 0.22, note: '召唤夜影；汲取' },
    W28: { onEnemyHit(t, fr) { if (Math.random() < 0.32) applyStatus(t, fr, 'poison', 3); }, allyDebuffChance: 0.25, allyDebuffId: 'weak', allyDebuffTurns: 2, debuffNote: '藤蔓缠住了', note: '中毒：持续掉血；藤蔓缠绕' },
    W29: { onEnemyHit(t, fr) { if (Math.random() < 0.22) applyStatus(t, fr, 'sunder', 2); }, bossRevive: true, note: '诅咒：降低防御；碑纹苏醒' },
    W30: { onEnemyHit(t, fr) { if (Math.random() < 0.30) applyStatus(t, fr, 'poison', 3); }, enemyRageEvery: 4, enemyRage: 1.08, rageNote: '炉温升高：敌方攻击提升', note: '灼烧：持续掉血；炉温强化' },
    W31: { confuseChance: 0.18, onEnemyHit(t, fr) { if (Math.random() < 0.20) applyStatus(t, fr, 'weak', 2); }, note: '幻觉：概率攻击队友；诅咒' },
    W32: { randomRule: true, ruleEvery: 3, suppressAllies: 0.12, note: '规则改写：每 3 回合变换；灯影压制' },
    W33: { onEnemyHit(t, fr) { if (Math.random() < 0.30) applyStatus(t, fr, 'bleed', 3); }, enemyShield: 0.20, note: '撕裂：裂伤；吞噬护盾' },
    W34: { onEnemyHit(t, fr) { if (Math.random() < 0.20) applyStatus(t, fr, 'freeze', 1); }, enemySpd: 1.15, note: '冰冻：无法行动；时序加速' },
    W35: { enemyLifesteal: 0.25, onEnemyHit(t, fr) { if (Math.random() < 0.22) applyStatus(t, fr, 'weak', 2); }, note: '汲取：敌人攻击回复自身；摆渡' },
    W36: { randomRule: true, ruleEvery: 3, suppressAllies: 0.15, allyDotPct: 0.02, note: '规则改写：每 3 回合变换；全场压制' },
  };

  let uidSeq = 0;
  function addStatus(unit, id, turns, extra) {
    // 异常抗性
    const isDebuff = ['poison', 'burn', 'bleed', 'stun', 'freeze', 'weak', 'sunder', 'fear'].includes(id);
    if (isDebuff && unit.resPct && Math.random() < unit.resPct) return false;
    /* ================= 0928 抢修单 F5 #4：两个增益必须能共存 =================
       旧写法：`const ex = unit.statuses.find(s => s.id === id); if (ex) ex.turns = max(...)`
       —— 而**所有增益共用 id 'buff'**（减益共用 'debuff'），于是"命中已有条目"时
       **只把回合续到最长、新效果整段丢弃**：探针实测先挂 `{atkPct:.25,critPct:.10}`
       再挂 `{skillPct:.15}`，getBuffs 仍读到 `{atkPct:.25,critPct:.10,skillPct:0}`。
       后果：「聚灵阵（全队技能伤害 +15%）」只要目标身上已有任何一条增益就完全无效，
       只把那条续命；泰坦 / 念动力的全队 buff、世界机制的随机 buff 也都在抢同一个槽。
       现在：**按效果键 merge 进同一条、且每个键各自计时**（`timers[k]`），
       同一个键重复施加取"绝对值更大的那个"（强的覆盖弱的，不叠加、不会滚雪球）。 */
    if (id === 'buff' || id === 'debuff') {
      let ex = unit.statuses.find(s => s.id === id);
      if (!ex) { ex = { id: id, turns: turns, timers: {} }; unit.statuses.push(ex); }
      Object.keys(extra || {}).forEach(k => {
        if (k === 'id' || k === 'turns' || k === 'timers') return;
        const v = extra[k] || 0;
        if (ex[k] === undefined || Math.abs(v) > Math.abs(ex[k])) ex[k] = v;
        ex.timers[k] = Math.max(ex.timers[k] || 0, turns);
      });
      ex.turns = Math.max(ex.turns, turns);
      return true;
    }
    const ex = unit.statuses.find(s => s.id === id);
    if (ex) ex.turns = Math.max(ex.turns, turns);
    else unit.statuses.push(Object.assign({ id, turns }, extra || {}));
    return true;
  }
  function hasStatus(unit, id) { return unit.statuses.some(s => s.id === id); }
  function getBuffs(unit) {
    // spdPct 以前不在这个表里，于是「剑心通明」「念动屏障」这类写着"速度+20%"的技能
    // 在战斗里完全没生效（加不加都没区别）。补上这一项，文案与效果才同源（V9.5）。
    const b = { atkPct: 0, defPct: 0, spdPct: 0, critPct: 0, skillPct: 0, evaPct: 0, lifesteal: 0, poisonOnHit: 0 };
    unit.statuses.forEach(s => {
      if (s.id === 'buff') Object.keys(b).forEach(k => { b[k] += (s[k] || 0); });
      if (s.id === 'debuff') { b.atkPct += (s.atkPct || 0); b.defPct += (s.defPct || 0); }
    });
    if (hasStatus(unit, 'weak')) b.atkPct -= 0.25;
    if (hasStatus(unit, 'sunder')) b.defPct -= 0.30;
    return b;
  }

  function dealDamage(src, dst, mult, opts, frames, log) {
    opts = opts || {};
    const sb = getBuffs(src), db = getBuffs(dst);
    let atk = src.atk * (1 + sb.atkPct);
    if (src.kind === 'warrior' && src.hp / src.maxHp < 0.5) atk *= 1.2; // 嗜战
    let def = Math.max(1, dst.def * (1 + db.defPct));
    if (opts.pierce) def *= (1 - opts.pierce);
    let dmg = (atk * atk) / (atk + def) * (mult || 1);
    /* 0928 抢修单 F5 #1：技能伤害倍率 **只吃技能那一发**（castSkill 传 opts.skill）。
       `skillMult` 和 `skillPct` 的名字/文案都是"技能伤害"，普攻也乘就成了又一次"界面在骗人"
       —— 角色页写着"技能伤害 +X%"，玩家会在普攻上看到它，那不是同源而是巧合。 */
    if (src.side === 'ally' && opts.skill) dmg *= (src.skillMult || 1) * (1 + sb.skillPct);
    // 命中/闪避
    let hitChance = 0.95 + (opts.hitMod || 0) - Math.min(0.6, dst.eva + db.evaPct);
    hitChance = Math.max(0.3, Math.min(1, hitChance));
    if (Math.random() > hitChance) {
      frames.push({ type: 'dodge', target: dst.uid });
      return 0;
    }
    // 暴击
    let crit = false;
    const critRate = Math.min(0.6, (src.crit || 0.05) + sb.critPct + (src.kind === 'assassin' ? 0.10 : 0));
    if (opts.sureCrit || Math.random() < critRate) {
      crit = true;
      let cd = (src.critDmg || 2.0) + (src.kind === 'ranger' ? 0.25 : 0);
      dmg *= cd;
    }
    // 阵营克制（玩家阵营 vs 敌人无阵营，敌人按世界主题映射阵营）
    if (src.faction && dst.faction) {
      if (D.FACTION_COUNTER[src.faction] === dst.faction) dmg *= 1.15;
      else if (D.FACTION_COUNTER[dst.faction] === src.faction) dmg *= 0.90;
    }
    /* 五行克制（0928 抢修单 F5 #2）：随行伴生体属性克**这张图的属性** → +15%；被反克 → -8%。
       算式只留一份（`D.elementMult`，界面 Core.elementMultiplier 读的是同一份）——
       以前战斗这段因为"敌人从来没带 elem"从没跑过，界面上那句承诺是空的。 */
    if (src.side === 'ally' && src.beastElem && dst.elem) dmg *= D.elementMult(src.beastElem, dst.elem);
    dmg *= 0.9 + Math.random() * 0.2;
    if (hasStatus(dst, 'bleed')) dmg *= 1.15;
    if (dst.kind === 'tank') dmg *= 0.88;
    // 转生天赋「永恒之躯」减伤（上限 60%，见 Core.talentCombatExtra）
    if (dst.dmgReduce) dmg *= (1 - Math.min(0.6, dst.dmgReduce));
    dmg = Math.max(1, Math.round(dmg));
    // 护盾
    let absorbed = 0;
    if (dst.shield > 0) {
      absorbed = Math.min(dst.shield, dmg);
      dst.shield -= absorbed;
      dmg -= absorbed;
    }
    dst.hp = Math.max(0, dst.hp - dmg);
    // 吸血
    const ls = (src.lifesteal || 0) + sb.lifesteal;
    let healed = 0;
    if (ls > 0 && dmg > 0) {
      healed = Math.round(dmg * ls);
      src.hp = Math.min(src.maxHp, src.hp + healed);
    }
    src.energy = Math.min(100, (src.energy || 0) + 30);
    dst.energy = Math.min(100, (dst.energy || 0) + 15);
    /* F5 #8：伤害帧带上出手者**结算后的真能量** —— 界面原来自己另记一本账
       （attack +30 / 被打 +15），技能每段伤、治疗/护盾/增益都不涨，于是"还没满就放大招 /
       满了不放"。现在界面只负责显示引擎给的值。 */
    frames.push({ type: 'damage', source: src.uid, target: dst.uid, dmg, crit, absorbed, healed, killed: dst.hp <= 0, energy: src.energy, targetEnergy: dst.energy });
    if (opts.execute && dst.hp / dst.maxHp < 0.5 && dmg > 0) {
      const extra = Math.round(dmg * 0.5);
      dst.hp = Math.max(0, dst.hp - extra);
      frames.push({ type: 'damage', source: src.uid, target: dst.uid, dmg: extra, crit: false, execute: true, killed: dst.hp <= 0 });
    }
    return dmg;
  }

  function healUnit(src, dst, mult, frames) {
    /* 0928 抢修单 F5 #1 连带：这一行原来也乘 `src.skillMult` —— 而盟友的 skillMult 恒为 1，
       所以从来没人发现它有害。三项接上之后它就是一颗雷：skillMult 的标签/词条都是**技能伤害**
       （`PCT_LABEL.skillPct = '技能伤害'`），却会顺带把治疗量放到 8~16 倍
       （法术型/治疗型靠精神堆 skillMult，满配白昼实测 16.24）→ 治疗者每次施法全队回满，
       等于**暗改治疗**。这里回退成接线前的口径（治疗只吃技能倍率本身＋受治疗加成），
       与"技能伤害只作用于伤害"同一条规矩。 */
    let amount = src.atk * mult;
    if (src.kind === 'healer') amount *= 1.2;
    // 受治疗加成（天赋「受治疗+8%」）作用在被打的人身上
    if (dst.healUp) amount *= (1 + dst.healUp);
    amount = Math.round(amount * (0.9 + Math.random() * 0.2));
    dst.hp = Math.min(dst.maxHp, dst.hp + amount);
    frames.push({ type: 'heal', source: src.uid, target: dst.uid, amount });
  }

  function alive(units) { return units.filter(u => u.hp > 0); }
  function pickTarget(src, enemies, preferred) {
    const list = alive(enemies);
    if (!list.length) return null;
    const taunter = list.find(u => hasStatus(u, 'taunt'));
    if (taunter && src.side !== taunter.side) return taunter;
    if (preferred === 'lowest') return list.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b));
    /* V1.0.5 定稿（2026-09-23 游戏策划总监《经济三改》回单）：**点名技 / 全体技可以越排**。
       这一行排在下面的分排之前，是故意的、不是漏的：
       · 它是"前排挡刀"唯一的解法 —— 后排的精英 / 守关 Boss 不然永远够不到；
       · 删掉它，守关战会退化成"先清小怪"的耐力战，V1.0.1 刚调好的前期手感跟着回退。
       嘲讽（上一行的 taunter）仍是唯一能把目标从"前排"拉走的机制；全体技走另一条路、不受影响。 */
    if (preferred === 'boss') return list.find(u => u.isBoss) || list[0];
    /* V1.0.5（2026-09-23 游戏策划总监会诊查出：「敌方分排**画得出来、引擎不认**」）：
       原来这层"先打前排"**只对敌人生效**（原文是 `if (src.side === 'enemy')`），
       我方仍走 `list` 全随机 —— 而 `dungeon.js` 的阵型注释和 `ui.js` 的战斗画面
       都**已经按"前 2 后 3、前排替后排挡刀"来画、也这么承诺了**，承诺＞实现。
       现在不分敌我：**选谁都是先看前排**，前排打光才碰后排（和我方阵型同一套规矩）。
       注：`position` 缺失时 front 为空 → 自动退回全体随机，不会锁死目标。 */
    const front = list.filter(u => u.position === 'front');
    const pool = front.length ? front : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- 敌人构造 ---------- */
  function makeEnemyUnit(spec, side) {
    return Object.assign({
      uid: 'e' + (uidSeq++), side: side || 'enemy', name: spec.name, faction: spec.faction || null,
      // maxHp 必须优先取规格里的值：副本是"带血打下一波"的，
      // 若把 maxHp 当成 hp（当前血量），每一波都会把上一波挨的伤"抹掉"——
      // 400/1000 进场会被引擎当成 400/400，打完写回 100%，血线自己涨回满。
      // 敌人不传 maxHp（生成即满血），所以照旧取 spec.hp。
      maxHp: spec.maxHp || spec.hp, hp: spec.hp, atk: spec.atk, def: spec.def, spd: spec.spd || 60,
      crit: 0.05, critDmg: 2.0, eva: spec.eva || 0.02, skillMult: 1, lifesteal: spec.lifesteal || 0,
      resPct: spec.resPct || 0, energy: 0, statuses: [], shield: spec.shield || 0,
      isBoss: !!spec.isBoss, isElite: !!spec.isElite, kind: 'mob',
      elem: spec.elem || null, beastElem: null,
      phase70: false, phase30: false, revived: false, summoned: false,
    }, {});
  }

  /* ---------- 主流程 ---------- */
  // cfg: { allies:[unitSpec], enemies:[unitSpec], worldId, maxRounds, allyHitMod }
  function run(cfg) {
    const frames = [];
    const mech = MECHANICS[cfg.worldId] || {};
    const allies = cfg.allies.map(spec => {
      const u = makeEnemyUnit(spec, 'ally');
      u.kind = spec.kind; u.faction = spec.faction; u.position = spec.position;
      // V9.5.71：技能等级从 0 起（0 = 没点过，倍率 1.0），兜底数组跟着改
      u.skills = spec.skills; u.skillLv = spec.skillLv || [0, 0, 0];
      u.name = spec.name;
      // 转生天赋带来的战斗字段（旧版这些属性根本没被传进战斗引擎）
      u.dmgReduce = spec.dmgReduce || 0;
      u.healUp = spec.healUp || 0;
      u.cdRed = spec.cdRed || 0;
      u.firstStrike = spec.firstStrike || 0;
      u.ultPct = spec.ultPct || 0;
      u.energy = Math.min(100, spec.initEnergy || 0);
      u.beastElem = spec.beastElem || null;   // 随行伴生体属性（五行克制用）
      u.charId = spec.charId;                 // 记住这是队伍里的谁：波间血量继承 / 战后写回都要靠它
      /* 0928 抢修单 F5 #1：**暴击率 / 暴击伤害 / 技能伤害**三项进公式。
         以前盟友复用 `makeEnemyUnit`，拿到的是敌人写死的 `crit:0.05 / critDmg:2.0 / skillMult:1`
         ——而 `Core.effectiveStats` 早就把这三项算出来、角色页也在显示（`sc-roster` / `sc-protag`），
         装备评分里 critPct 权重还是全场最高（1500）→ **角色页在骗人**：传 crit 0.99 实测暴击率 5.3%、
         传 skillMult 2 伤害一字不变。现在按规格真读（缺省才用敌人的 5% / 2× / 1×）。
         ⚠️ skillMult 只在技能上生效（见 dealDamage 的 opts.skill），不吃普攻。 */
      u.crit = spec.crit != null ? spec.crit : 0.05;
      u.critDmg = spec.critDmg != null ? spec.critDmg : 2.0;
      u.skillMult = spec.skillMult != null ? spec.skillMult : 1;
      return u;
    });
    /* V1.0.1（父亲大人："为啥我现在打还是一排五个的布局"）：
       真凶 —— 上面 allies 那行有 `u.position = spec.position`，**enemies 这行漏了**，
       于是敌人的前后排标记在进引擎时被丢掉（= undefined），
       渲染时 `position !== 'front'` 恒成立 → 五个全落进"后排"那一行，看着就是一排。
       补上；没标的一律当前排（老数据 / 其他调用点不至于空着）。 */
    const enemies = cfg.enemies.map(spec => {
      const u = makeEnemyUnit(spec);
      u.position = spec.position || 'front';
      /* F5 #2：敌人**从来没带 elem**，而引擎判的正是"单个敌人的属性"（永远 null）——
         五行克制因此从未生效。敌人没自带属性时，按 **cfg.worldId 这张图的属性**补上
         （`Dungeon.makeEnemies` 现在也会自己带上；这里兜底，保证别的调用点也同源）。 */
      if (!u.elem && cfg.worldId) u.elem = D.worldElement(cfg.worldId);
      return u;
    });
    if (mech.enemyShield) enemies.forEach(u => { u.shield = Math.round(u.maxHp * mech.enemyShield); });
    if (mech.enemySpd) enemies.forEach(u => { u.spd *= mech.enemySpd; });
    if (mech.enemyLifesteal) enemies.forEach(u => { u.lifesteal += mech.enemyLifesteal; });
    const all = allies.concat(enemies);
    all.forEach(u => { u.name = u.name || '敌人'; });
    frames.push({ type: 'start', allies: allies.map(publicUnit), enemies: enemies.map(publicUnit), note: mech.note });

    const maxRounds = cfg.maxRounds || (enemies.some(e => e.isBoss) ? 50 : 30);
    let win = false;
    let round = 0;

    for (round = 1; round <= maxRounds; round++) {
      frames.push({ type: 'round', n: round });
      // 随机规则（W14 每回合换、W20 每 3 回合换）
      if (mech.randomRule && round % (mech.ruleEvery || 1) === 0) {
        const rules = ['atkUp', 'defDown', 'spdUp'];
        // 用"第几次规则"来轮换，而不是 round % 3——否则 ruleEvery=3 时永远停在同一档
        const rule = rules[Math.floor(round / (mech.ruleEvery || 1)) % 3];
        const pool = rule === 'defDown' ? allies : enemies;
        // spdUp 以前加的是 atkPct（写着"速度提升"、实际提攻击），这里改成真加 spdPct
        const st = rule === 'atkUp' ? { kind: 'buff', buff: { atkPct: 0.15 } }
          : rule === 'spdUp' ? { kind: 'buff', buff: { spdPct: 0.15 } }
            : { kind: 'debuff', buff: { defPct: -0.2 } };
        pool.forEach(u => { if (u.hp > 0) addStatus(u, st.kind, 2, st.buff); });
        const ruleWho = mech.ruleName || '灯阁规则';   // 镜界法庭、万灯之座说的不是同一句话
        frames.push({ type: 'rule', text: rule === 'atkUp' ? `${ruleWho}：敌方攻击提升` : rule === 'defDown' ? `${ruleWho}：我方防御下降` : `${ruleWho}：敌方速度提升` });
      }
      // 回合开始：DOT / 恢复
      for (const u of all) {
        if (u.hp <= 0) continue;
        for (const s of u.statuses) {
          if (s.id === 'poison' || s.id === 'burn') {
            /* V9.6.86 修（本轮挖出来的最大一个坑）：中毒/灼烧原来按**目标最大生命 × 5%/6%** 掉血 ——
               守关 Boss 有 1382 万血，一次 tick 就是 82 万，**一个会挂灼烧的法师两三轮就能把任何 Boss 烧穿**。
               实测：一个 Lv.5、拿着本档装备的队伍靠这个把 36 张图全部打穿，整条难度曲线是假的。
               现在改成按**施加者的攻击**算（50%/tick），并封顶在目标最大生命的 4%：
                 · 打小怪：和以前差不多（不会因为它把前期变难）
                 · 打 Boss：从 82 万/ tick 降到"法师攻击的一半（且不超过 Boss 的 4%）"，Boss 重新需要真打
               施加者不明时（世界机制挂的中毒，施加者是敌人）退回目标最大生命 5%/6% —— 玩家这边的压力不变。 */
            const base = s.srcAtk ? s.srcAtk * 0.50 : u.maxHp * (s.id === 'poison' ? 0.05 : 0.06);
            const dot = Math.max(1, Math.min(Math.round(base), Math.round(u.maxHp * 0.04)));
            u.hp = Math.max(0, u.hp - dot);
            frames.push({ type: 'dot', target: u.uid, status: s.id, dmg: dot, killed: u.hp <= 0 });
          }
          if (s.id === 'regen') {
            const amt = Math.round(u.maxHp * 0.06);
            u.hp = Math.min(u.maxHp, u.hp + amt);
            frames.push({ type: 'heal', target: u.uid, amount: amt, status: 'regen' });
          }
        }
      }
      /* ---------- 世界机制：回合开始的额外压力（W15~W20） ---------- */
      if (mech.allyDotPct) {
        alive(allies).forEach(u => {
          const d = Math.max(1, Math.round(u.maxHp * mech.allyDotPct));
          u.hp = Math.max(0, u.hp - d);
          frames.push({ type: 'dot', target: u.uid, status: 'pressure', dmg: d, killed: u.hp <= 0 });
        });
      }
      if (mech.allyDebuffChance && Math.random() < mech.allyDebuffChance) {
        const pool = alive(allies);
        if (pool.length) {
          const t = pool[Math.floor(Math.random() * pool.length)];
          if (addStatus(t, mech.allyDebuffId || 'weak', mech.allyDebuffTurns || 2)) {
            frames.push({ type: 'rule', text: `${mech.debuffNote || '被缠住'} ${t.name}` });
          }
        }
      }
      if (mech.enemyRageEvery && round > 1 && round % mech.enemyRageEvery === 0) {
        enemies.forEach(u => { if (u.hp > 0) u.atk = Math.round(u.atk * (mech.enemyRage || 1.06)); });
        frames.push({ type: 'rule', text: mech.rageNote || '敌方攻击提升' });
      }
      if (mech.enemyAoeEvery && round > 1 && round % mech.enemyAoeEvery === 0) {
        const live = enemies.filter(u => u.hp > 0);
        if (live.length && alive(allies).length) {
          frames.push({ type: 'skill', actor: live[0].uid, name: mech.enemyAoeName || '轨道扫射', energy: live[0].energy || 0 });
          live.forEach(src => {
            alive(allies).forEach(t => {
              dealDamage(src, t, mech.enemyAoeMult || 1.2, {}, frames);
              if (mech.onEnemyHit) mech.onEnemyHit(t, frames);
            });
          });
        }
      }
      if (mech.suppressAllies && round % (mech.ruleEvery || 3) === 0) {
        alive(allies).forEach(u => addStatus(u, 'debuff', 2, { defPct: -mech.suppressAllies }));
        frames.push({ type: 'rule', text: '全场压制：我方防御下降' });
      }
      if (!checkEnd()) break;
      // 行动顺序
      // 首回合速度：天赋「先制」在第 1 回合把速度按比例提高后再排行动顺序
      const spdOf = u => u.spd * (1 + (getBuffs(u).spdPct || 0)) * (round === 1 ? 1 + (u.firstStrike || 0) : 1);
      /* ================= R1.2 · P1（父亲大人 2026-10-01 任务书点名）=================
         原来这一句把 `Math.random()` 写在 `sort()` 的比较器**里面**：
           `sort((a,b) => spdOf(b)*抖动 - spdOf(a)*抖动)`
         比较器要求"同一个问题永远同一个答案"（自反 / 反对称 / 传递），而这里每比一次都重抽 ——
         于是同一个单位的排序结果取决于引擎拿它跟谁比、比了几次，排序严格来说是**未定义行为**。
         现在：**每个单位每个回合只抽一次**抖动，算完 initiative 再排。
         口径一个字没变：还是 0.95~1.05 的等比抖动、还是速度大者先手、先制天赋 / 速度 buff
         照旧进 `spdOf`（它们只是乘在同一个数上）。
         做坏试验：把 `Math.random()` 挪回比较器里 → `battle_flow_audit` 的
         「行动顺序：比较器里不许有随机数」＋「同一条随机序列下顺序唯一确定」当场红。 */
      const initiative = alive(all).map(u => ({ u: u, roll: spdOf(u) * (0.95 + Math.random() * 0.1) }));
      initiative.sort((a, b) => b.roll - a.roll);
      const order = initiative.map(x => x.u);
      for (const u of order) {
        if (u.hp <= 0) continue;
        // 眩晕/冰冻
        if (hasStatus(u, 'stun') || hasStatus(u, 'freeze')) {
          frames.push({ type: 'skip', actor: u.uid, reason: hasStatus(u, 'stun') ? 'stun' : 'freeze' });
          continue;
        }
        const foes = u.side === 'ally' ? enemies : allies;
        const friends = u.side === 'ally' ? allies : enemies;
        if (!alive(foes).length) break;
        act(u, foes, friends, frames, mech, cfg);
        if (!checkEnd()) break;
      }
      // Boss 复活检查（需遍历所有 Boss，含已死亡）
      if (mech.bossRevive) {
        for (const boss of enemies.filter(e => e.isBoss)) {
          if (!boss.revived && boss.hp <= 0) {
            boss.revived = true;
            boss.hp = Math.round(boss.maxHp * 0.3);
            frames.push({ type: 'revive', boss: boss.uid, text: `${boss.name} 从灰烬中复活！` });
          }
        }
      }
      // Boss 阶段
      for (const boss of enemies.filter(e => e.isBoss && e.hp > 0)) {
        const ratio = boss.hp / boss.maxHp;
        if (!boss.phase70 && ratio <= 0.70) {
          boss.phase70 = true;
          boss.atk *= 1.2;
          frames.push({ type: 'phase', boss: boss.uid, phase: 70, text: `${boss.name} 进入第二阶段！攻击提升` });
        }
        if (!boss.phase30 && ratio <= 0.30) {
          boss.phase30 = true;
          boss.atk *= 1.3;
          boss.spd *= 1.2;
          frames.push({ type: 'phase', boss: boss.uid, phase: 30, text: `${boss.name} 狂暴了！` });
        }
        /* 2026-09-23（文案策划 · 提审合规；创意总监《三维度审核》H2 点名，父亲大人在案）：
           这里原来叫「被召唤的亡灵」——"亡灵"是冥界语汇，而这行字**玩家每场都看得见**
           （会召唤的 Boss 有三张图：W11 幽帆船坞 / W23 巢母孵化间 / W27 长明夜行）。
           召唤物是**世界无关**的：船坞召的是旧船员、孵化间召的是幼体、夜行召的是夜影，
           所以名字必须中性 —— 改成「爪牙」。同轮 W35 那句死亡描写一起清（见 data.js 的同名注释）。 */
        if (mech.bossSummon && !boss.summoned && ratio <= 0.5) {
          boss.summoned = true;
          const add = makeEnemyUnit({ name: '被召唤的爪牙', hp: Math.round(boss.maxHp * 0.25), atk: boss.atk * 0.6, def: boss.def * 0.6, spd: 50 });
          /* F5 #5：召唤物以前**没有 position** → 渲染时 `position !== 'front'` 恒成立，
             它被画进"后排"那一行（甚至不上屏）；同时 `pickTarget` 的 front 过滤把它当后排，
             前排没清光时单点技能**够不到它**（看不见又打不到）。统一当前排。 */
          add.position = 'front';
          enemies.push(add); all.push(add);
          frames.push({ type: 'summon', enemy: publicUnit(add), text: `${boss.name} 召唤了爪牙！` });
        }
      }
      if (!checkEnd()) break;
      // 状态计时
      all.forEach(u => {
        u.statuses.forEach(s => {
          s.turns--;
          /* F5 #4：增益/减益的**每个效果键各自计时** —— 同一格里可以同时挂着
             "攻击+15%（还剩 2 回合）"与"技能伤害+15%（还剩 1 回合）"，
             一条到点只掉它自己那一项，不连坐另一条。 */
          if (s.timers) {
            Object.keys(s.timers).forEach(k => {
              s.timers[k]--;
              if (s.timers[k] <= 0) { delete s.timers[k]; delete s[k]; }
            });
            if (!Object.keys(s.timers).length) s.turns = 0;
          }
        });
        u.statuses = u.statuses.filter(s => s.turns > 0);
        Object.keys(u.cds || {}).forEach(k => { if (u.cds[k] > 0) u.cds[k]--; });
      });
    }
    win = alive(allies).length > 0 && !alive(enemies).length;
    frames.push({ type: 'end', win, rounds: Math.min(round, maxRounds), timeout: round > maxRounds });
    /* V1.1.9（续13 · 复活基线）：多回一份**本场结束时的双方单位**（hp / maxHp / energy 都还是活的）。
       用处只有一个：`world_curve` 要按"**允许每场 1 次复活**"这条新基线重跑
       （报告 §5.4 —— 复活是线上现实，不能假装不存在），而复活的口径是
       "**敌人带剩余血量续战、阵亡者回 50% 血**"，那就必须拿得到这一刻的血量。
       游戏本身不用这个字段（战斗页自己留着 `B.units`），所以它是**纯增量**、不改任何行为。 */
    return { frames, win, rounds: Math.min(round, maxRounds), units: all };

    function checkEnd() {
      if (!alive(enemies).length || !alive(allies).length) return false;
      return true;
    }
  }

  function publicUnit(u) {
    // charId 必须带上：界面靠它把"打完这一波剩多少血"写回 run.hpPct，
    // 下一波才谈得上"血量继承"。少了它，每波都会满血开打（V8.9 修）。
    return { uid: u.uid, name: u.name, side: u.side, maxHp: u.maxHp, hp: u.hp, isBoss: u.isBoss, position: u.position, kind: u.kind, charId: u.charId };
  }

  /* ---------- 单位行动 ---------- */
  function act(u, foes, friends, frames, mech, cfg) {
    u.cds = u.cds || { s1: 0, s2: 0 };
    const isAlly = u.side === 'ally';
    const sb = getBuffs(u);
    // 幻觉（W18）：行动前有概率被支配，转而攻击同伴——这条机制世界表上写着，但引擎里一直没有
    if (isAlly && mech.confuseChance && Math.random() < mech.confuseChance) {
      const others = alive(friends).filter(x => x !== u);
      if (others.length) {
        const t = others[Math.floor(Math.random() * others.length)];
        const cfFrame = { type: 'attack', actor: u.uid };
        frames.push(cfFrame);
        frames.push({ type: 'rule', text: `${u.name} 被幻觉支配，攻向同伴！` });
        dealDamage(u, t, 1.0, {}, frames);
        cfFrame.energy = u.energy || 0;
        return;
      }
    }
    // ===== 盟友技能 AI =====
    if (isAlly && u.skills) {
      // V9.5.73：技能从 0 级起 + 每级 +2%（旧写法是 1+(lv-1)*0.07，等级改 0 基之后
      // 会在 Lv.0 算出 0.93 倍——等于把所有初始技能暗削 7%）。满级强度：技能 1.70 / 必杀 1.60。
      const skillMultLv = i => 1 + (u.skillLv[i] || 0) * (window.DATA.SKILL_PCT_PER_LV || 0.02);
      // 天赋「技能CD-1」：技能冷却统一减 1（最低 1 回合），必杀不受影响
      const cdOf = i => Math.max(1, (i === 0 ? u.skills.s1.cd : u.skills.s2.cd) - (u.cdRed || 0));
      // 必杀
      if (u.energy >= 100) {
        u.energy = 0;
        castSkill(u, u.skills.ult, 2, foes, friends, frames, mech, cfg, skillMultLv(2), true);
        return;
      }
      const liveFriends = alive(friends);
      const lowAlly = liveFriends.length ? liveFriends.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b)) : null;
      // 治疗优先
      if (u.kind === 'healer' && lowAlly && lowAlly.hp / lowAlly.maxHp < 0.55 && u.cds.s1 <= 0) {
        u.cds.s1 = cdOf(0); castSkill(u, u.skills.s1, 0, foes, friends, frames, mech, cfg, skillMultLv(0)); return;
      }
      /* V9.6.86：这里原来有一条"控制型优先打 Boss"的 AI 分支。
         血统=定位之后已经没有 controller 这个定位了（控制技能按父亲大人的意思分散在各血统里），
         这条分支永远不会命中，删掉。 */
      if (u.cds.s1 <= 0) { u.cds.s1 = cdOf(0); castSkill(u, u.skills.s1, 0, foes, friends, frames, mech, cfg, skillMultLv(0)); return; }
      if (u.cds.s2 <= 0) { u.cds.s2 = cdOf(1); castSkill(u, u.skills.s2, 1, foes, friends, frames, mech, cfg, skillMultLv(1)); return; }
    }
    // ===== 敌人技能 =====
    if (!isAlly) {
      // Boss 特殊技（每 4 行动一次 AOE）
      u.actCount = (u.actCount || 0) + 1;
      if (u.isBoss && u.actCount % 4 === 0) {
        frames.push({ type: 'skill', actor: u.uid, name: '毁灭冲击', energy: u.energy || 0 });
        alive(foes).forEach(t => dealDamage(u, t, 1.5, { hitMod: 0.1 }, frames));
        alive(foes).forEach(t => { if (mech.onEnemyHit) mech.onEnemyHit(t, frames); });
        return;
      }
      if (u.isElite && u.actCount % 3 === 0) {
        const t = pickTarget(u, foes);
        frames.push({ type: 'skill', actor: u.uid, name: '猛击', energy: u.energy || 0 });
        if (t) dealDamage(u, t, 1.8, {}, frames);
        if (t && mech.onEnemyHit) mech.onEnemyHit(t, frames);
        return;
      }
    }
    // ===== 普攻 =====
    const target = pickTarget(u, foes);
    if (!target) return;
    /* F5 #8：出手帧带 actor 的能量；dealDamage 会先 +30，所以帧先入列、**结算后再回填**真值。 */
    const atkFrame = { type: 'attack', actor: u.uid };
    frames.push(atkFrame);
    const hitMod = u.side === 'ally' ? (cfg.allyHitMod || 0) : 0;
    dealDamage(u, target, 1.0, { hitMod }, frames);
    atkFrame.energy = u.energy || 0;
    if (u.side === 'enemy' && mech.onEnemyHit) mech.onEnemyHit(target, frames);
    if (sb.poisonOnHit) applyStatus(target, frames, 'poison', sb.poisonOnHit, { srcAtk: u.atk });
  }

  function castSkill(u, sk, idx, foes, friends, frames, mech, cfg, lvMult, isUlt) {
    /* F5 #8：技能帧带 actor 能量（必杀前一帧能量已被清零，界面据此可以只显示、不自己记） */
    frames.push({ type: 'skill', actor: u.uid, name: sk.name, ult: !!isUlt, energy: u.energy || 0 });
    // 天赋「超载：必杀伤害+25%」只加在必杀上
    const mult = sk.mult * (lvMult || 1) * (isUlt ? 1 + (u.ultPct || 0) : 1);
    const targetsOf = t => {
      if (t === 'allEnemies') return alive(foes);
      if (t === 'team') return alive(friends);
      if (t === 'self') return [u];
      if (t === 'lowest') return [alive(friends).reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b))];
      if (t === 'topAlly') return [alive(friends).reduce((a, b) => (a.atk > b.atk ? a : b))];
      if (t === 'random') return [pickTarget(u, foes)];
      return [pickTarget(u, foes, alive(foes).some(f => f.isBoss) && Math.random() < 0.7 ? 'boss' : null)];
    };
    switch (sk.type) {
      case 'dmg': {
        const hits = sk.hits || 1;
        for (let h = 0; h < hits; h++) {
          const ts = targetsOf(sk.target).filter(Boolean);
          let dealt = 0;
          ts.forEach(t => {
            /* opts.skill：这一发是**技能**伤害 —— 技能伤害倍率 / 技能伤害加成只在这里生效（F5 #1）。 */
            dealt += dealDamage(u, t, mult, { pierce: sk.pierce, sureCrit: sk.sureCrit, execute: sk.execute, hitMod: cfg.allyHitMod || 0, skill: true }, frames);
            if (sk.status && t.hp > 0) {
              const st = sk.status;
              if (!st.chance || Math.random() < st.chance) {
                // 技能挂状态同样要看得见（以前飘字/日志里一片安静，玩家只能靠"怎么打不动了"猜）
                if (st.self) applyStatus(u, frames, st.id, st.turns, { srcAtk: u.atk });
                else applyStatus(t, frames, st.id, st.turns, { srcAtk: u.atk });
              }
            }
          });
          if (sk.lifesteal && dealt > 0) {
            const healed = Math.round(dealt * sk.lifesteal);
            u.hp = Math.min(u.maxHp, u.hp + healed);
            frames.push({ type: 'heal', source: u.uid, target: u.uid, amount: healed, lifesteal: true });
          }
        }
        break;
      }
      case 'heal': {
        targetsOf(sk.target).filter(Boolean).forEach(t => {
          healUnit(u, t, mult, frames);
          /* V1.1.16（0927-Y 数值轮）：原来这里直接 `addStatus` —— **治疗型技能挂的状态没有飘字帧**
             （`applyStatus` 才会 push `type:'status'`；`addStatus` 只改状态、不产生帧）。
             同一个文件里"伤害型技能挂状态"早就走 `applyStatus`（见上面 dmg 分支），
             所以"续命之环"这类治疗附带的状态在战斗里**看得见效果、看不到提示** —— 静默错。
             这一轮治疗族补到 6 条（新增"群疗·持续""群净"）之后暴露得更明显，一并收口。 */
          if (sk.status) applyStatus(t, frames, sk.status.id, sk.status.turns);
        });
        break;
      }
      case 'cleanseHeal': {
        targetsOf(sk.target).filter(Boolean).forEach(t => {
          const bad = t.statuses.find(s => ['poison', 'burn', 'bleed', 'stun', 'freeze', 'weak', 'sunder', 'fear'].includes(s.id));
          if (bad) t.statuses = t.statuses.filter(s => s !== bad);
          healUnit(u, t, mult, frames);
        });
        break;
      }
      case 'shield': {
        targetsOf(sk.target).filter(Boolean).forEach(t => {
          t.shield = (t.shield || 0) + Math.round(t.maxHp * mult);
          frames.push({ type: 'shield', target: t.uid, amount: Math.round(t.maxHp * mult) });
        });
        break;
      }
      case 'teamshield': {
        targetsOf(sk.target).filter(Boolean).forEach(t => {
          t.shield = (t.shield || 0) + Math.round(t.maxHp * mult);
          frames.push({ type: 'shield', target: t.uid, amount: Math.round(t.maxHp * mult) });
          if (sk.buff) addStatus(t, 'buff', sk.buff.turns, sk.buff);
        });
        break;
      }
      case 'buff': case 'debuff': {
        targetsOf(sk.target).filter(Boolean).forEach(t => {
          addStatus(t, sk.type === 'buff' ? 'buff' : 'debuff', sk.buff.turns, sk.buff);
          frames.push({ type: 'buff', target: t.uid, name: sk.name });
        });
        break;
      }
      case 'energy': {
        targetsOf(sk.target).filter(Boolean).forEach(t => {
          t.energy = Math.min(100, (t.energy || 0) + sk.mult);
          frames.push({ type: 'buff', target: t.uid, name: '能量+' + sk.mult });
        });
        break;
      }
    }
    /* 非伤害类技能以前一点能量都不给（能量只在 dealDamage 里发），
       于是治疗 / 辅助 / 护盾型角色放出技能却攒不出必杀，越"不输出"的角色越看不到自己的必杀——
       实测同条件 30 回合：治疗者 5 次、战士 9 次，治疗者那 5 次基本全靠"挨打"。
       伤害类技能已经通过 dealDamage 拿到能量，这里只补非伤害类，且必杀本身不回收能量（V9.5）。 */
    if (!isUlt && u.side === 'ally' && sk.type !== 'dmg') {
      u.energy = Math.min(100, (u.energy || 0) + 30);
    }
  }

  return {
    run, MECHANICS,
    // 测试用：状态结算 / 加状态（验"速度增益真的进了速度区"这类文案与效果同源的问题）
    _internals: { getBuffs, addStatus, makeEnemyUnit },
  };
})();
