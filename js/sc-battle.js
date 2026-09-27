/* 战斗页（canvas）—— 照网页版 js/ui.js 的 startBattle / battle-overlay 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：头部（标题 / 速度 / 撤离）→ 敌人一行 → 我方前排 → 我方后排
   → 战斗日志 → 结算面板（奖励 chip + 下一关 / 返回）。
   逻辑一律走网页版的 Battle.run（同一份引擎、同一份帧序列），这里只负责"把帧画出来"。

   对外只暴露 BattleUI.start(配置)：副本、深井、斗法台都用它，别再各写一套。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  /* V1.1.x（2026-09-27 · 音频系统）：战斗音效的统一出口。
     在这一层接（**不在 js/battle.js 里接**）：battle.js 是纯逻辑帧序列，
     视图层才是"这一帧玩家看到/听到什么"的地方；G.AUD 不存在时静默跳过（尺子的假环境不加载音频）。 */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }

  /* ---------- 我方出战单位（照网页版 buildAllies 抄，含站位/阵容加成/伴生体） ---------- */
  function buildAllies(hpPctMap, extraBuffs, opts) {
    const S = Core.S;
    const mult = (opts && opts.mult) || 1;
    const fb = Core.factionBuffs(S.party);
    const buffAtk = (extraBuffs && extraBuffs.atkPct) || 0;
    const buffSpd = (extraBuffs && extraBuffs.spdPct) || 0;
    const allies = [];
    S.party.forEach((id, idx) => {
      if (!id) return;
      if (hpPctMap && hpPctMap[id] !== undefined && hpPctMap[id] <= 0.01) return;   // 这一波他已经倒下了
      const position = idx < 2 ? 'front' : 'back';
      if (id === '@player') {
        const pst = Core.effectivePlayerStats();
        const pFullHp = Math.round(pst.hp * (1 + fb.hpPct));
        const pHp = hpPctMap && hpPctMap['@player'] !== undefined ? Math.max(1, Math.round(pFullHp * hpPctMap['@player'])) : pFullHp;
        allies.push(Object.assign({}, pst, {
          name: Core.charName('@player'), kind: 'warrior', faction: null, position,
          skills: Core.protagonistSkills(), skillLv: S.player.skillLv || [0, 0, 0],
          atk: Math.round(pst.atk * (1 + fb.atkPct + buffAtk) * mult),
          def: Math.round(pst.def * mult),
          spd: Math.round(pst.spd * (1 + buffSpd) * mult),
          hp: Math.round(pHp * mult), maxHp: Math.round(pFullHp * mult),
          skillMult: (pst.skillMult || 1) + fb.skillPct,
          charId: '@player',
        }));
        return;
      }
      const base = D.charById[id];
      const eff = Core.effectiveStats(id);
      const fullHp = Math.round(eff.hp * (1 + fb.hpPct));
      const hp = hpPctMap && hpPctMap[id] !== undefined ? Math.max(1, Math.round(fullHp * hpPctMap[id])) : fullHp;
      allies.push(Object.assign({}, eff, {
        name: Core.charName(id), kind: base.kind, faction: base.faction, position,
        skills: base.skills, skillLv: S.chars[id].skillLv,
        atk: Math.round(eff.atk * (1 + fb.atkPct + buffAtk) * mult),
        def: Math.round(eff.def * mult),
        spd: Math.round(eff.spd * (1 + buffSpd) * mult),
        hp: Math.round(hp * mult), maxHp: Math.round(fullHp * mult),
        skillMult: eff.skillMult + fb.skillPct,
        charId: id,
      }));
    });
    const beastElem = Core.activeBeastElem();
    const bp = Core.beastPct();
    allies.forEach((a) => {
      a.beastElem = beastElem;
      if (bp.dmgReduce) a.dmgReduce = (a.dmgReduce || 0) + bp.dmgReduce;
    });
    return allies;
  }

  /* ---------- 进行中的战斗状态 ---------- */
  const B = {
    on: false, cfg: null, res: null, idx: 0, units: {}, log: [], floaters: [],
    speed: 1, timer: null, done: false, panel: null, energy: {}, tip: null,
    autoT: null, autoLeft: 0,
    tipAt: 0, tipT: null,        // 波次弹幕：起始时间 + 动画计时器（V9.6.123）
    /* V9.6.90：防重入闸门**单独一个字段**。以前是拿 `B.on && B.res` 凑的 ——
       看着能用，其实"波与波之间"正好也满足这两个条件，于是无缝交接那一瞬间
       下一波会被自己挡掉（副本第 5 关起多波，第 2 波直接打不开）。
       闸门现在只在这三处变：开打时立起 / 结算或撤离或离开战斗页时放下 /
       无缝交接给下一波之前先放下。 */
    busy: false,
  };
  /* V9.6.115（父亲大人）：结算自动进下一关的倒计时 8 秒 → **5 秒**（与网页版同一个值） */
  const AUTO_NEXT_SEC = 5;
  let uidSeq = 0;
  const STATUS_TEXT = { poison: '中毒', burn: '燃烧', bleed: '裂伤', stun: '眩晕', freeze: '冰冻', weak: '虚弱', sunder: '破防', fear: '恐惧', taunt: '嘲讽', regen: '回复' };

  function clearTimer() {
    if (B.timer) { clearTimeout(B.timer); B.timer = null; }
    if (B.autoT) { clearInterval(B.autoT); B.autoT = null; }
    /* V9.6.98（自审：定时器泄漏）：打击特效那个 55ms 的 interval（fxT）原来只有 finish()
       和"自己发现没有特效了"两条路会清 —— **撤离**那条路不清，于是离开战斗页之后
       它还会以 18fps 重画最多 0.9 秒（白耗电、还会重画一个新页面）。
       撤离=离场，就该立刻全清。 */
    if (fxT) { clearInterval(fxT); fxT = null; }
    if (B.tipT) { clearInterval(B.tipT); B.tipT = null; }   // V9.6.123：波次弹幕的动画计时器，离场一起清
  }
  function pushLog(line) { B.log.push(line); if (B.log.length > 60) B.log.shift(); }
  function nameOf(uid) { const u = B.units[uid]; return u ? u.name : ''; }

  function start(cfg) {
    clearTimer();
    /* V9.6.124（父亲大人："斗法台战斗完点收下奖励并返回，会返回到残域那边去，跳转错误"）：
       真因 —— 结算面板底部那颗「收下奖励并返回」用的是 `battle_close`，
       而它的兜底**写死成 CV.reset('dungeon')**：副本传了 onClose 所以看不出问题，
       斗法台 / 深井没传 → 一律被送到残域。
       修法不是给每个入口补一句（那还会漏），而是**战斗页自己记住"从哪来"**：
       开打那一刻把页面栈与滚动位置存下来，配置没给回调时就还原回去。 */
    B.back = { stack: CV.stack.slice(), scroll: CV.scroll || 0 };
    B.on = true; B.busy = true; B.cfg = cfg; B.done = false; B.panel = null; B.log = []; B.floaters = []; B.energy = {}; B.hitAt = {}; B.atkAt = {};
    /* V1.1.8（丙组 B9）：开打时的档位读**唯一口径** `Core.effSpeed()` ——
       免费只有 1×/2×；广告窗口内才是 5。老档里存的 3× 会在那里被回落成 2×。 */
    B.speed = Core.effSpeed ? Core.effSpeed() : ((Core.S.settings && Core.S.settings.speed) || 1);
    CV.battleSpeed = B.speed;
    B.title = cfg.title || '战斗';
    B.revived = false;                 // B10：复活"每场 1 次"，换一场就复位
    CV.reset('battle', { title: B.title });
  }

  /* 装一场战斗的帧序列（**只装不打**）—— `fight()` 用它，尺子也用它：
     尺子要"逐帧手推"来断言"伤害飘字与音效同帧"，不能靠 setTimeout 的节奏跑完整场。 */
  function loadRes(res) {
    B.res = res; B.idx = 0; B.units = {};
    /* 这一场的临时容器：真流程里由 `start()` 清好；尺子手推时由这里兜底（`||` 只补缺、不清空，
       所以真流程的行为一点没变）。没有这几行，"装一场但不打"就会在 hitFx 上撞 undefined。 */
    B.log = B.log || []; B.floaters = B.floaters || []; B.energy = B.energy || {};
    B.hitAt = B.hitAt || {}; B.atkAt = B.atkAt || {};
    const startFrame = res.frames[0];
    (startFrame.allies || []).concat(startFrame.enemies || []).forEach((u) => { B.units[u.uid] = Object.assign({}, u); });
    if (startFrame.note) pushLog('⚠ 世界机制：' + startFrame.note);
  }

  function fight(res) {
    loadRes(res);
    step();
  }

  function step() {
    if (!B.on) return;
    /* B9：广告窗口到期要**自动回落**（`effSpeed` 是唯一口径）—— 每帧问一次最省事，
       也顺手把"免费档"的选择变化吃进来（不会出现"一场里两个档"的鬼状态）。 */
    if (Core.effSpeed) { const s = Core.effSpeed(); if (s !== B.speed) { B.speed = s; CV.battleSpeed = s; } }
    const f = B.res.frames[B.idx++];
    if (!f || f.type === 'end') { finish(); return; }
    applyFrame(f);
    const delay = f.type === 'round' ? 260 : (f.type === 'skill' || f.type === 'phase' || f.type === 'revive' || f.type === 'summon') ? 520 : 300;
    /* V9.6.68（资料 §8「hitstop」）：暴击多停 ~90ms —— 打击感主要来自这一下"顿"。 */
    const stop = (f.type === 'damage' && f.crit) ? 90 : 0;
    B.timer = setTimeout(step, Math.max(40, (delay + stop) / B.speed));
    CV.render();
  }

  /* V9.6.28（父亲大人："战斗没有攻击、掉血的动效"）自审发现：飘字一直在往 B.floaters 里塞，
     **却没有任何地方把它画出来** —— 所以打了半天没有伤害数字、也没有受击反馈。
     这里是配套的动画帧：只要还有"活着的"动效（飘字 / 受击 / 出手），就按 ~18fps 重画，
     放完自动停（不在空闲时白烧电）。 */
  let fxT = null;
  function ensureFx() {
    if (fxT) return;
    fxT = setInterval(function () {
      const now = Date.now();
      const alive = (B.floaters || []).some(function (f) { return now - f.t < (f.ttl || D.BATTLE_GEOM.floatMs); })
        || Object.keys(B.hitAt || {}).some(function (k) { return now - B.hitAt[k] < 320; })
        || Object.keys(B.atkAt || {}).some(function (k) { return now - B.atkAt[k] < 220; });
      if (!alive) { clearInterval(fxT); fxT = null; }
      CV.render();
    }, 55);
  }
  /* V1.0.1（UI 设计师会诊）：异常状态 / Boss 二阶段这类"要看清一句话"的提示 0.9 秒读不完，
     允许传 ttl（网页版 js/ui.js 的 floater(..., ms) 是同一套口径，两边一起改）。 */
  function floater(uid, text, color, ttl, size) {
    const u = B.units[uid];
    if (!u) return;
    /* V1.0.1（开发自审会诊）：原来一律取 floatBase，于是**暴击在画布上不变大**，
       而网页版 `.floater.crit` 是 17 —— 两端差一档，而且表里的 floatCrit 根本没被读过。
       现在按类型传 size，与网页版同源。 */
    B.floaters.push({ uid, text, color: color || CV.C.gold, t: Date.now(),
      ttl: ttl || D.BATTLE_GEOM.floatMs, size: size || D.BATTLE_GEOM.floatBase });
    ensureFx();
  }
  /* 受击 / 出手：记一个时间戳，unitCard 按它算抖动与红闪 */
  function hitFx(uid) { if (uid) { B.hitAt[uid] = Date.now(); ensureFx(); } }
  function atkFx(uid) { if (uid) { B.atkAt[uid] = Date.now(); ensureFx(); } }

  function applyFrame(f) {
    switch (f.type) {
      case 'round': if (f.n <= 5 || f.n % 5 === 0) pushLog('—— 第 ' + f.n + ' 回合 ——'); break;
      case 'attack': B.energy[f.actor] = Math.min(100, (B.energy[f.actor] || 0) + 30); break;
      case 'skill':
        pushLog('✨ ' + nameOf(f.actor) + ' 使用【' + f.name + '】');
        if (f.ult) B.energy[f.actor] = 0;
        /* 技能释放 / 大绝：大绝那一档更重更亮（一帧一音，别一个技能叠好几下） */
        snd(f.ult ? 'ult' : 'skill');
        break;
      case 'damage': {
        const u = B.units[f.target];
        hitFx(f.target); atkFx(f.source || f.actor);      // 受击闪红 + 出手前冲
        /* V9.6.68（资料 §8/§9）：轻击一点点震、暴击明显一点 + 一下 hitstop（见 step）；
           平时不震，免得整场都在抖（原文："如果普通攻击都在震屏，玩家很快就烦"。） */
        B.shakeUntil = Date.now() + (f.crit ? 160 : 90);
        B.shakePx = f.crit ? 3 * CV.SCALE : 1.5 * CV.SCALE;
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, (f.crit ? '暴击 ' : '-') + f.dmg, f.crit ? CV.C.gold : CV.C.dmg,
          0, f.crit ? D.BATTLE_GEOM.floatCrit : D.BATTLE_GEOM.floatBase);
        /* ================= V1.1.x（2026-09-27 续单 · 父亲大人钉死的技术口径）=================
           **音效挂点 ＝ 伤害飘字出现的那一刻** —— 就写在这条 `floater(...)` 的下一行，
           同一个 `applyFrame` 调用里同步出声（同一帧）。
           ⚠️ **不许**挪到 `case 'round'` / `case 'attack'`（那是回合/波次起点）—— 那样会让
           一整回合的伤害在开头"齐发"一下，听起来就是"随便响的"。
           ⚠️ **不许**在 `step()` / `fight()` 里按帧时间轴配乐：帧之间还有 speed 缩放与 hitstop，
           音画必然错位。
           判据写在尺子里（`scripts/audio_audit.js` ⑩：逐帧断言"有伤害飘字 ⇒ 同一次调用里有音效"，
           并且**多段＝多声**（几个伤害飘字就几声）；⑨ 静态断言 round/attack 里没有 snd）。 */
        snd(f.crit ? 'crit' : 'hit');
        B.energy[f.target] = Math.min(100, (B.energy[f.target] || 0) + 15);
        if (f.healed) { const s = B.units[f.source]; if (s) { s.hp = Math.min(s.maxHp, s.hp + f.healed); floater(f.source, '+' + f.healed, CV.C.green); } }
        if (f.killed) pushLog('✗ ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'dot': {
        const u = B.units[f.target];
        hitFx(f.target);
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, '-' + f.dmg, CV.C.dmg);
        /* 持续伤害也是"伤害飘字"，也要有自己的一声（比命中轻、比命中短的小闷扣） */
        snd('dot');
        if (f.killed) pushLog('✗ ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'heal': {
        const u = B.units[f.target];
        if (u) u.hp = Math.min(u.maxHp, u.hp + f.amount);
        floater(f.target, '+' + f.amount, CV.C.green);
        ensureFx();
        break;
      }
      /* 护盾 / 闪避：各自一声音色（续单要求"被闪避给一个弱的空音；护盾这类特殊事件各自有音"）。
         `heal`（回血 / 吸血）**故意不出声** —— 吸血几乎每次都触发，再叠一声就是糊；
         这是本岗的判断，不是漏（要加一句话就行）。 */
      case 'shield': floater(f.target, '🛡+' + f.amount, CV.C.green); snd('shield'); break;
      case 'dodge': floater(f.target, '闪避', CV.C.dim); snd('dodge'); break;
      case 'skip': pushLog('😵 ' + nameOf(f.actor) + ' 无法行动'); break;
      case 'buff': floater(f.target, '↑ ' + f.name, CV.C.green); break;
      case 'status': floater(f.target, STATUS_TEXT[f.status] || '异常', CV.C.debuff, 1500); break;
      /* V1.0.1（UI 设计师会诊）：Boss 二阶段 / 狂暴以前**只有日志**（日志在下方、战斗在上方，
         等于没提示）。现在日志留全句、头上飘一行短标，当场就能看见。 */
      case 'phase': floater(f.boss, f.phase === 70 ? '⚠ 二阶段' : '⚠ 狂暴', CV.C.gold, 1800); pushLog('🔥 ' + f.text); break;
      case 'revive': { const u = B.units[f.boss]; if (u) u.hp = Math.round(u.maxHp * 0.3); floater(f.boss, '♻️ 复活', CV.C.green, 1500); snd('revive'); pushLog('♻️ ' + f.text); break; }
      case 'summon': pushLog('🕯 ' + f.text); break;
      case 'rule': pushLog('👁 ' + f.text); break;
      case 'nearDeath': floater(f.target, '⚠ 濒死', CV.C.gold); break;
      default: break;
    }
    B.floaters = B.floaters.slice(-8);
  }

  /* 一场打完：把结果交给配置里的 onEnd（副本负责推进波次 / 结算） */
  function finish() {
    if (B.done) return;
    B.done = true;
    B.hitAt = {}; B.atkAt = {};                 // 结算页不需要残留的受击/出手状态
    if (fxT) { clearInterval(fxT); fxT = null; }
    const cfg = B.cfg, res = B.res;
    // 补算剩余帧，保证血量/日志正确
    for (; B.idx < res.frames.length; B.idx++) {
      const f = res.frames[B.idx];
      if (['damage', 'dot', 'heal', 'revive'].indexOf(f.type) >= 0) applyFrame(f);
    }
    const hpLeft = {};
    Object.keys(B.units).forEach((uid) => { const u = B.units[uid]; if (u.side === 'ally' && u.charId) hpLeft[u.charId] = Math.max(0, u.hp / u.maxHp); });
    B.panel = cfg.onEnd(res.win, res, hpLeft) || {};
    B.panel.acts = B.panel.acts || [{ label: '返回', id: 'battle_close', style: 'ghost' }];
    /* 胜负结算音：**波与波之间不出声**（seamless 那一档不是"这一局结束了"，
       它只是"下一波马上来"，每波都来一声胜利音会吵成一锅粥）。 */
    if (!B.panel.seamless) snd(res.win ? 'win' : 'lose');
    /* 波与波之间**不弹结算页**（网页版 2026-09-15 定的规矩）：只在画面上飘一行提示，
       然后自己接着打下一波 —— 副本要"一口气打到底"。 */
    /* 胜利且有"主按钮"时开自动倒计时（网页版：8 秒内不点就自动进下一关；可在设置里关掉） */
    if (B.panel && B.panel.acts && B.panel.acts.length && Core.S.settings && Core.S.settings.autoNext !== false) {
      /* V9.6.115（自审抓到的第二个"开了没用"）：这里原来找的是 `a.primary`（布尔），
         可小游戏的调用方（副本 / 深井）给的是 `style: 'primary'` —— 两边键名对不上，
         `findIndex` 永远是 -1 → **"通关结算自动进下一关"的倒计时从来没启动过**。
         现在两种写法都认（谁写哪种都不会再让它哑掉）。 */
      const ai = B.panel.acts.findIndex(function (a) { return a.primary || a.style === 'primary'; });
      if (res.win && ai >= 0) {
        B.autoIdx = ai; B.autoLeft = AUTO_NEXT_SEC;
        if (B.autoT) clearInterval(B.autoT);
        B.autoT = setInterval(function () {
          B.autoLeft--;
          if (B.autoLeft <= 0) {
            clearInterval(B.autoT); B.autoT = null;
            const a = B.panel && B.panel.acts[B.autoIdx];
            if (a) CV.dispatch(a.id);
            return;
          }
          CV.render();
        }, 1000);
      }
    }
    if (B.panel.seamless) {
      /* V9.6.123（父亲大人："波间那个提示看着像要点击 → 做成飘过去就消失的第几波弹幕"）：
         文案来自调用方（"第 N/M 波"），这里只管**怎么出现**：
         0.9 秒内往上飘 26px 并淡出，没有边框/底色，点不到（本来也不该点）。
         动画靠一个 33ms 的小计时器重画（停就自己清掉，不白烧电）。 */
      /* V9.6.125（父亲大人："要不不要飘过的感觉，直接就是空屏然后写第几波，然后再进去战斗"）：
         改成"波次卡"——这一段**不画战场**，整屏只留一行「第 N 波」，淡入停留淡出，然后下一波开打。 */
      B.tip = B.panel.sub || '本波通过…';
      B.tipAt = Date.now();
      if (B.tipT) { clearInterval(B.tipT); B.tipT = null; }
      B.tipT = setInterval(function () {
        if (!B.tip) { clearInterval(B.tipT); B.tipT = null; return; }
        CV.render();
      }, 33);
      const after = B.panel.after;
      B.panel = null;
      B.timer = setTimeout(function () {
        B.tip = null;
        /* V9.6.90：**交接前先把闸门放下**。网页版是 overlay.remove()（= 放闸）在前、
           afterWave() 在后；小游戏这版漏了，于是第 2 波 run() 被自己的防重入挡掉，
           表现就是"第 5 关开始，第一波打完卡住，按啥都没用，只能撤离"。 */
        B.busy = false;
        if (after) after();
      }, 1050);   // V9.6.125：波次卡显示 1.05 秒（和网页版 .b-wave-card 的动画时长一致）
    }
    CV.render();
  }

  /* ---------- 画一帧战斗 ---------- */
  /* opt（V1.1.15 · 短屏压缩档）：{ av：头像直径, compact：名字与血量% 并一行 }
     —— 不传就是原口径（头像 50 ＋ 名字/血条/百分比三行），390/430 一个像素不变。 */
  function unitCard(x, y, w, u, small, opt) {
    const dead = u.hp <= 0;
    const compact = !!(opt && opt.compact);
    /* V1.0.1（父亲大人："我方人员的大小也很敌方的不一样，统一做成敌方那样的大小标准"）：
       原来我方 small 走 42、敌方 50 —— 两边一大一小。统一成 50。 */
    const av = (opt && opt.av) || 50;
    /* V9.6.28：受击抖一下 + 闪红；出手时朝对面冲一小步（我方右冲、敌方左冲） */
    const now = Date.now();
    const hitP = B.hitAt[u.uid] ? Math.max(0, 1 - (now - B.hitAt[u.uid]) / 300) : 0;
    const atkP = B.atkAt[u.uid] ? Math.max(0, 1 - (now - B.atkAt[u.uid]) / 220) : 0;
    const shake = hitP ? Math.sin(now / 28) * 3 * hitP : 0;
    const lunge = atkP ? (u.side === 'ally' ? 1 : -1) * 7 * Math.sin(atkP * Math.PI) : 0;
    x += shake + lunge;
    const cx = x + w / 2;
    if (dead) CV.ctx.globalAlpha = 0.25;
    CV.ctx.beginPath();
    if (u.side === 'enemy') CV.ctx.arc(cx, y + av / 2, av / 2, 0, Math.PI * 2);
    else CV.round(cx - av / 2, y, av, av, CV.RADIUS,  CV.C.panel3, u.isBoss ? CV.C.accent : CV.C.line, u.isBoss ? 2 : 1.5);
    if (u.side === 'enemy') {
      CV.ctx.fillStyle = CV.C.enemy;
      CV.ctx.fill();
      CV.ctx.strokeStyle = u.isBoss ? CV.C.accent : CV.C.line; CV.ctx.lineWidth = u.isBoss ? 2 : 1.5; CV.ctx.stroke();
    } else CV.ctx.fillStyle = CV.C.panel3;
    u._cx = cx; u._top = y; u._av = av;   // 飘字要用：记住这一张卡画在哪
    CV.text(String(u.name || '?').slice(0, 1), cx, y + av / 2, { size: small ? CV.FS.f1 : CV.DISP.d1, bold: true, align: 'center' });   // 头像首字：跟着层级 token 走（原来是裸 16/18）
    if (dead) CV.ctx.globalAlpha = 1;
    /* ---------- 短屏压缩档：名字与血量% 并成一行、血条紧跟其下 ----------
       每行省 8px，四行就是 32px —— 与"头像收一档、排距收一档"一起，才换来 320×568 上
       四行阵型＋角标＋日志卡全在自己的位置上（V1.1.15 · 见 drawBattle 顶部那段）。 */
    const fullW = w - 6 * CV.SCALE;
    const bw = fullW * 0.7;
    const bx = x + 3 * CV.SCALE + (fullW - bw) / 2;
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    const barH = D.BATTLE_GEOM.barHp * CV.SCALE;
    if (compact) {
      const pctTxt = Math.round(pct * 100) + '%';
      const pw = CV.measure(pctTxt, CV.FS.tag);
      const cy = y + av + 8 * CV.SCALE;
      CV.text(CV.fit(u.name, w - pw - 8 * CV.SCALE, CV.FS.tag), x + 3 * CV.SCALE, cy, { size: CV.FS.tag, color: CV.C.dim });
      CV.text(pctTxt, x + w - 3 * CV.SCALE, cy, { size: CV.FS.tag, color: CV.C.dim, align: 'right' });
      const by = y + av + 17 * CV.SCALE;
      CV.round(bx, by, bw, barH, CV.RADIUS_CHIP,  CV.C.bar);
      if (pct > 0) CV.round(bx, by, bw * pct, barH, CV.RADIUS_CHIP,  pct < 0.35 ? CV.C.accent : CV.C.green);
      if (u.side === 'ally') {
        const en = B.energy[u.uid] || 0;
        if (en > 0) CV.round(bx, by + barH + 6 * CV.SCALE, bw * (en / 100), D.BATTLE_GEOM.barEn * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
      }
      return av + 32 * CV.SCALE;
    }
    // 名字
    CV.text(CV.fit(u.name, w, CV.FS.sm), cx, y + av + 9 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'center' });
    /* V1.0.1（父亲大人："血条可以短一点（减长度不是减血量）"）：
       血条收成卡片内宽的 70% 并居中 —— 只动长度，血量与百分比都不变。 */
    const by = y + av + 20 * CV.SCALE, bh = barH;   // V1.0.1：与网页版同源（原 5）
    CV.round(bx, by, bw, bh, CV.RADIUS_CHIP,  CV.C.bar);
    if (pct > 0) CV.round(bx, by, bw * pct, bh, CV.RADIUS_CHIP,  pct < 0.35 ? CV.C.accent : CV.C.green);
    /* 血条百分比：网页版 .unit .u-hp 是**五级 11px**（小游戏原来画成 12px） */
    CV.text(Math.round(pct * 100) + '%', cx, by + bh + 7 * CV.SCALE, { size: CV.FS.tag, color: CV.C.dim, align: 'center' });
    if (u.side === 'ally') {
      const en = B.energy[u.uid] || 0;
      if (en > 0) CV.round(bx, by + bh + 13 * CV.SCALE, bw * (en / 100), D.BATTLE_GEOM.barEn * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
    }
    return av + 30 * CV.SCALE + 10 * CV.SCALE;
  }

  /* 波次卡：空屏（底色已是战斗页底色）+ 居中一行「第 N 波」，淡入停留淡出 */
  function drawWaveCard(areaBottom) {
    if (!B.tip) return;
    const k = Math.max(0, Math.min(1, (Date.now() - (B.tipAt || 0)) / 1050));
    const alpha = k < 0.18 ? (k / 0.18) : (k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1);
    /* V1.0.1（父亲大人："波间的文字应该是居中在这个区域的，现在的位置不对"）：
       原来用写死的 `LOG_H2 = 92` 自己估下半边界（真实是 150），而且是在算出
       阵容区边界**之前**画 —— 只能靠估，于是字落在红框偏下。
       现在直接由调用方把**阵容区的真实下边界**（FIELD_BOTTOM）传进来：
       上边界 = 内容顶 0，字画在正中。 */
    CV.text(B.tip, CV.W / 2, areaBottom / 2,
      { size: CV.TIER.t1, bold: true, align: 'center', color: CV.a(CV.C.text, alpha.toFixed(2)) });   // V1.0.1：原来是死 token CV.FS.t1（不存在）→ 按兜底 13px 画，比网页版整整小两级
  }

  function drawBattle() {
    U.begin();
    const res = B.res;
    /* V1.0.1（**实证**，不是猜）：battle_flow_audit 的逐帧断言报过
       「出现过的 top：96 / 658」—— 96 就是这张占位卡的 top，
       说明换波 / 结算交接的空档里 B.res 短暂为空，这一帧会退回**没有日志卡的占位版**，
       下一帧日志卡又出现。战斗页还开着（B.on）时保留布局、不再退占位版。 */
    if (!res) {
      /* V1.1.9（丙组）：**没有战斗的结算页**（扫荡）走这里 —— `B.res` 为空但 `B.panel` 有值，
         也要把结算层挂上去（原来只 `return`，面板挂了却谁也不画）。 */
      if (B.panel) { CV.pageOverlay = function () { drawSettle(null, B.panel); }; return; }
      if (B.on) return;
      U.card(function () { U.h3('战斗'); U.hint('没有进行中的战斗', 6 * CV.SCALE); });
      return;
    }
    /* V9.6.128（父亲大人："波间的空屏只在上方的阵容区域中间显示就行，不要占用整个屏幕，
       下面的战斗日志和撤离加速两个按钮不要跟着闪"）：
       波次卡**只在阵容区**里显示 —— 日志、撤离、加速（以及底栏）照常画，不再整屏 return。 */
    const units = Object.keys(B.units).map((k) => B.units[k]).filter((u) => u && u.side);
    const enemies = units.filter((u) => u.side === 'enemy');
    const allies = units.filter((u) => u.side === 'ally');
    const front = allies.filter((u) => u.position === 'front');
    const back = allies.filter((u) => u.position === 'back');
    /* 波次卡：**只在阵容区**画一行「第 N 波」；日志与按钮不动（V9.6.128）。
       它的 y 需要阵容区的下边界，所以调用点挪到 FIELD_BOTTOM 算出来之后（见下）。 */
    /* 战场区：**和网页版同一套规则**（V9.6.0 父亲大人两条意见一起改）——
         · "敌我离得好近"：小游戏原来从战场顶按固定行高往下堆，满编时三行挤在上半屏；
         · "我方前后排离得太远"：网页版原来用 space-evenly 把三行摊满整屏，前后排隔了 185px。
       现在两边都是：**敌方占上方、我方前排+后排收成一组贴在日志上方**，
       我方两排之间只隔 14px（就是"一支部队"该有的距离），屏幕越高上下留白越多。 */
    const FIELD_TOP = U.y;
    /* ── 战场四行：**几何只定义一次** ──────────────────────────────────────
       V1.0.1（父亲大人："你每次修改都要代码级修改啊，别老是只改表面"）：
       这段以前是三处各写各的 —— 行高写死 92（而 unitCard 实际画出来是 90）、
       每一行的 y 手写、组间距又有两个互相打架的约束（space*2 / 固定值）。
       所以每次调间距都要重新算一遍，还算错过一次。
       现在：**行高、排内间距、组间距三个常量**摆在这儿，行的 y 一律由行号推出来，
       中间那道组间距只在这一个地方出现 —— 以后调间距就是改一个数。 */
    const AV = D.BATTLE_GEOM.av * CV.SCALE;       // 头像直径：与网页版同源（D.BATTLE_GEOM，V1.0.1）
    const LOG_H = 150 * CV.SCALE;                 // 战斗日志卡占的高度（含外边距，留够 4 行，别让底部被裁）
    /* V1.0.6（父亲大人 09-24 反馈图 12「上下都太贴了，中间间距小一点」）：
       中间那道组间距原是一个半头像（81px）—— 敌我两组之间空出一大片，而上下两头反而挤：
       上面敌人贴着头条、下面「撤离 / 速度」离日志卡只有 10px。
       这里把中间收成 0.9 个头像；四行是**在战场区里居中**的，中间省下来的高度会自动
       平分到上下两头 —— 一次改动同时满足他那两句话（上松下松、中间收紧）。 */
    /* V9.6.2（父亲大人："战斗日志还是出画了"）：这里是**内容坐标**（渲染时已经被顶栏整体下移），
       所以"画面底部"要减掉顶栏与安全区 —— 以前直接拿 CV.H 算，日志被推出去约一整个顶栏的高度。 */
    const CONTENT_H = CV.H - CV.safeBottom - (CV.TOP + 8) - 8;
    /* V9.6.8（父亲大人）：「撤离 / 速度」挪到右下角、战斗日志**上面** ——
       这一行要占位置，所以单位摆放的下边界要再往上让出它的高度，免得挤在一起。 */
    /* 右下角那两颗按钮与战斗日志之间的净距（原 10px：截图里看着像粘在日志卡上；现在 8+8 上下各让一点） */
    const CORNER_PAD = 8 * CV.SCALE;
    const CORNER_H = U.BTN_SM * CV.SCALE + CORNER_PAD;
    /* 四行：0 敌方后排 / 1 敌方前排 / 2 我方前排 / 3 我方后排（后排在上、前排朝对面，像象棋）。
       整组在战场区里竖直居中，屏幕越高留白越多。两处细节（V1.0.1，父亲大人："我方往上一点，
       现在跟两颗按钮太贴了"）：
         · **末行不该再算一次排间距**（needH 里那个 SIDE_GAP 是行"之间"的，最后一排后面没有行）；
         · 底部额外留 BOTTOM_PAD —— "撤离 / 速度"就在下面，居中的均分留白不够它们喘气。 */
    const PAD_TOP = 16 * CV.SCALE;                          // 上沿至少留 16：居中后没余量时也不贴头条
    /* ================= V1.1.15（2026-09-27 · 派单 I 第 4 条 · 视觉复审 P0-3）=================
       为什么要有这一段：320×568（iPhone 5 / SE 档）上"四行阵型 ＋ 角标行 ＋ 4 行日志卡"**根本放不下** ——
       实测需要 466.6px、可用只有 226px，于是「撤离 / 1×速度 / 5×」压在我方前两名头像上、
       我方后排直接画到日志卡上（证据：…/关键取证/320-战斗页-按钮压队友.png ＋ crop-320-b2.png）。
       旧算法只在"放得下"的档位成立：`rowTop` 被 `Math.max(16, 居中余量)` 夹在 16，
       剩下的 226px 缺口全部溢到下面的角标行与日志卡上 —— 而所有尺子全绿（detail_audit 只在 390 上量）。

       现在按**可用高度反算档位**，只影响放不下的机型（390/430 走标准档，一个像素不动）：
         标准档：4 行 ×（头像 54 ＋ 行内附加 40）＋ 两处排距 ＋ 角标行 48 ＋ 日志卡 150
         压缩档：① 头像降到"刚好放得下"的那一档（下限 34）；
                 ② 行内附加 40→32（名字与血量% 并成一行，见 unitCard 的 compact 分支）；
                 ③ 排距 14→8、组距 0.9av→0.65av、底垫 30→10；
                 ④ 日志只留最近 2 行，**三颗角标并进日志卡的表头行**（省掉单独那一行 48px）。
       ④ 这一条是给头像腾空间的关键：不做它，320 上头像只能收到 24px（比底栏图标还小）。
       判据仍是 detail_audit 那三条净距（敌排离头条 ≥16 / 我方末排底→角标 ≥20 / 角标→日志卡 ≥12）。 */
    const LOG_MIN_CARD = 100 * CV.SCALE;                    // 压缩档日志卡最小高（表头行 ＋ 2 行日志）
    /* minGap = 这一档"末排底 → 它下面那件东西"必须留出的净距（标准档＝detail_audit 那条 ≥20px；
       压缩档下面就是日志卡的表头行，留 8 就够）。**判"放得下"用的是它，不是 BOTTOM_PAD** ——
       BOTTOM_PAD 只是居中时想要的呼吸感（标准档 30）：390/430 上 need 比 avail 大 4.6px，
       老代码就是让它溢进 BOTTOM_PAD 那点余量里、照样过那三条净距 —— 所以这里也不能把它当硬线，
       否则 390 会被误判成"放不下"、跟着切压缩档（那 4.6px 的误判幅度真的踩到过）。 */
    function battleFit(o) {
      const fieldBottom = CONTENT_H - o.logBlock;           // 底部整块（日志卡、压缩档含角标行）的上沿
      const unitsBottom = fieldBottom - o.cornerH;          // 阵型的下边界
      return {
        av: o.av, extra: o.extra, side: o.side, group: o.av * o.groupK, groupK: o.groupK,
        bottomPad: o.bottomPad, logBlock: o.logBlock, cornerH: o.cornerH, cornerInLog: !!o.cornerInLog,
        fieldBottom: fieldBottom, unitsBottom: unitsBottom,
        avail: unitsBottom - o.minGap - PAD_TOP, centTop: unitsBottom - o.bottomPad,
        need: 4 * (o.av + o.extra) + 3 * o.side + o.av * o.groupK,
      };
    }
    const STD = battleFit({ av: AV, extra: 40 * CV.SCALE, side: 14 * CV.SCALE, groupK: 0.9,
      bottomPad: 30 * CV.SCALE, minGap: 20 * CV.SCALE, logBlock: LOG_H, cornerH: CORNER_H });
    const TIGHT = { extra: 32 * CV.SCALE, side: 8 * CV.SCALE, groupK: 0.65,
      bottomPad: 10 * CV.SCALE, minGap: 8 * CV.SCALE,
      logBlock: LOG_MIN_CARD + CORNER_PAD + 2 * CV.SCALE, cornerH: 0, cornerInLog: true };
    let M = STD;
    if (STD.need > STD.avail) {
      M = null;
      for (let av = AV; av >= 34 * CV.SCALE - 0.01; av -= 1 * CV.SCALE) {
        const m = battleFit(Object.assign({ av: av }, TIGHT));
        if (m.need <= m.avail) { M = m; break; }
      }
      /* 兜底：连下限都放不下（比 320 更短的屏）→ 取最低档，宁可略挤也不许溢出到角标/日志上 */
      if (!M) M = battleFit(Object.assign({ av: 34 * CV.SCALE }, TIGHT));
    }
    const compact = M.cornerInLog;
    const CARD_H = M.av + M.extra;                          // 一行占的高度 = 头像 + 名字/血条/百分比
    const SIDE_GAP = M.side, GROUP_GAP = M.group;
    const FIELD_BOTTOM = M.fieldBottom, FIELD_BOTTOM_UNITS = M.unitsBottom;
    const BOTTOM_PAD = M.bottomPad;
    const rowStep = CARD_H + SIDE_GAP;
    const needH = M.need;
    const areaH = M.centTop - FIELD_TOP;
    const rowTop = FIELD_TOP + Math.max(PAD_TOP, (areaH - needH) / 2);
    const rowY = (i) => rowTop + i * rowStep + (i >= 2 ? GROUP_GAP : 0);
    /* 尺子接口（V1.1.15）：把**这一帧真正用的档位**交出去 —— detail_audit ⑥ 要按它算三条净距。
       与 `G.rewardChips` 同一个做法：尺子量的是真代码算出来的几何，不是自己再猜一遍
       （旧版 ⑥ 把头像写死 50 去反推卡顶，压缩档一上场就会量错 —— 它已经量错过一次：
       320 上报"敌排顶 2px"，其实卡顶就在 16）。unitAv 是**画出来的**头像直径。 */
    G.battleGeom = { unitAv: compact ? M.av : 50, rowH: CARD_H, compact: compact, cornerInLog: compact };
    if (!B.tip) {   // V9.6.128：波次卡期间**只跳过阵容绘制**，日志与撤离/加速照常画
      const rows = [
        { list: enemies.filter((u) => u.position !== 'front'), y: rowY(0), ally: false },   // 敌方后排（最上）
        { list: enemies.filter((u) => u.position === 'front'), y: rowY(1), ally: false },   // 敌方前排（靠中）
        { list: front, y: rowY(2), ally: true },                                            // 我方前排（靠中）
        { list: back, y: rowY(3), ally: true },                                             // 我方后排（最下）
      ];
      /* V9.6.68（资料 §8：「震屏幅度要小、时间要短」）：命中时**只震战场这一片**
         （单位卡 / 飘字 / 红闪一起震），顶栏与日志不动 —— 用 canvas translate 做，
         画完立刻还原，热区不受影响。轻击 1.5px、暴击 3px，见 hitFx 里设的 B.shakePx。 */
      const shaking = (B.shakeUntil || 0) > Date.now();
      const shakePx = B.shakePx || 0;
      const sx = shaking ? (Math.random() < 0.5 ? -shakePx : shakePx) : 0;
      const sy = shaking ? (Math.random() < 0.5 ? -shakePx : shakePx) : 0;
      CV.ctx.save();
      CV.ctx.translate(sx, sy);
      rows.forEach((row) => {
        const list = row.list;
        if (!list.length) return;
        const n = Math.max(1, list.length);
        const g = 8 * CV.SCALE;
        /* V1.0.1（父亲大人："我方人员的大小也很敌方的不一样，统一做成敌方那样的大小标准"）：
           原来我方按 24% 宽、敌方按 30% —— 同一张卡两种尺寸。统一走 30%。 */
        const maxW = U.cw() * 0.3;
        const cw = Math.min(maxW, (U.cw() - g * (n - 1)) / n);
        const x0 = U.pad() + (U.cw() - (cw * n + g * (n - 1))) / 2;
        /* 标准档传 av: 0 → unitCard 走它原来的 50（390/430 一个像素不动）；
           压缩档才把反算出来的 av 传下去（同时也把"名字与血量% 并一行"打开）。 */
        list.forEach((u, i) => unitCard(x0 + i * (cw + g), row.y, cw, u, row.ally,
          { av: compact ? M.av : 0, compact: compact }));
      });
      /* 伤害 / 回复飘字（V9.6.28）：上升 26px + 淡出，带深色描边保证在任何底色上都看得清。
         位置取自各卡刚才记下的 _cx/_top —— 所以先画完所有单位再画它。 */
      (B.floaters || []).forEach(function (f) {
        const u = B.units[f.uid];
        if (!u || u._cx == null) return;
        const p = Math.min(1, (Date.now() - f.t) / (f.ttl || D.BATTLE_GEOM.floatMs));
        if (p >= 1) return;
        const fy = u._top - 4 * CV.SCALE - D.BATTLE_GEOM.floatRise * CV.SCALE * p;
        const alpha = 1 - p * p;
        CV.ctx.save();
        CV.ctx.globalAlpha = alpha;
        const size = (f.size || D.BATTLE_GEOM.floatBase) * CV.SCALE;   // V1.0.1：原来写死 14（编外第六档）；现在按类型取（暴击走 floatCrit＝一级 17）
        CV.ctx.lineWidth = 3 * CV.SCALE; CV.ctx.strokeStyle = CV.a(CV.C.shade, .75);
        CV.ctx.font = '600 ' + size + 'px ' + CV.FONT;
        CV.ctx.textAlign = 'center'; CV.ctx.textBaseline = 'middle';
        CV.ctx.strokeText(f.text, u._cx, fy);
        CV.ctx.fillStyle = f.color || CV.C.gold;
        CV.ctx.fillText(f.text, u._cx, fy);
        CV.ctx.restore();
      });
      /* 受击红闪：在头像外再描一圈（画在飘字之前，所以不会被盖） */
      Object.keys(B.hitAt || {}).forEach(function (uid) {
        const u = B.units[uid];
        if (!u || u._cx == null) return;
        const p = Math.max(0, 1 - (Date.now() - B.hitAt[uid]) / 300);
        if (p <= 0) return;
        CV.ctx.save();
        CV.ctx.globalAlpha = 0.75 * p;
        CV.ctx.strokeStyle = CV.C.dangerText; CV.ctx.lineWidth = 2.5 * CV.SCALE;
        if (u.side === 'enemy') { CV.ctx.beginPath(); CV.ctx.arc(u._cx, u._top + u._av / 2, u._av / 2 + 2, 0, Math.PI * 2); CV.ctx.stroke(); }
        else CV.round(u._cx - u._av / 2 - 2, u._top - 2, u._av + 4, u._av + 4, CV.RADIUS,  null, CV.C.dangerText, 2.5 * CV.SCALE);
        CV.ctx.restore();
      });
      /* V1.0.1（父亲大人："波次卡的高度和战斗阵容的高度不一样，所以切到波次卡日志就向上补位"）：
         真凶 —— 这一句原来写在 `if (!B.tip)` **外面**，而与之配对的 ctx.save()
         在 if **里面**。战斗中两者配对；**一到波次卡，save 不执行、restore 照样执行**，
         每帧多弹出一层画布状态，把外层 `translate(0, 顶栏+8)` 的坐标系弹掉，
         整块内容（日志卡 + 撤离/速度按钮）就被顶偏；下一波 tip 变回假又恢复 ——
         正是"弹上去又回来"。这也解释了为什么"去掉波次卡就不弹"。
         修法：把它挪进 if，与 save 严格配对。 */
      CV.ctx.restore();                       // 震屏结束：还原坐标系（必须与上面的 save 配对）
    }

    /* 右下角三颗按钮：撤离 / N×速度 / ×5
       标准档：单独一行，压在日志卡上面（V9.6.8 父亲大人定的站位）；
       压缩档：并进日志卡的表头行（见下面那段注释）—— 卡先画，角标后画，才压得住卡底。 */
    if (!compact) battleCornerButtons(FIELD_BOTTOM - CORNER_PAD);
    /* 波次卡（居中在阵容区）—— 放在这里是因为它要用 FIELD_BOTTOM */
    if (B.tip) drawWaveCard(FIELD_BOTTOM);
    /* 战斗日志贴着内容底部（网页版 #battle-log） */
    U.y = FIELD_BOTTOM + CORNER_PAD;
    /* 战斗日志（最近 4 行，网页版 #battle-log）
       V1.0.1（父亲大人）：**高度锁死** —— 新一波开始时 B.log 会清空，
       不锁的话卡片先缩上去、再随日志变多重新拉长。minH 取 4 行时的自然高度（140）。 */
    U.card(function () {
      U.h3('战斗日志');
      const lines = B.log.slice(compact ? -2 : -4);
      if (!lines.length) U.hint('（战斗开始）', 4 * CV.SCALE);
      lines.forEach((ln) => U.hint(ln, 2 * CV.SCALE));
    }, { minH: compact ? LOG_MIN_CARD : 140 });
    /* 压缩档：三颗角标压在日志卡的表头行右侧（「战斗日志」在左、按钮在右，同一中线）。
       这一行是**省出来的** —— 标准档它在卡上面单独占 48px，那 48px 在 320 上正好是头像
       从 24px 长到 36px 的本钱。表头中线 ≈ 卡顶 ＋ padY(SP2) ＋ 半个按钮高。 */
    if (compact) battleCornerButtons(FIELD_BOTTOM + CORNER_PAD + 6 * CV.SCALE + U.BTN_SM * CV.SCALE);
    /* 结算：交给 CV.pageOverlay 画（整屏覆盖层，不在内容层里 —— 这样才是真居中、命中区也对） */
    CV.pageOverlay = B.panel ? function () { drawSettle(res, B.panel); } : null;
    /* 波次卡已经在 drawBattle 开头接管了整屏（含这一行字），这里不再重复画 */

  }

  /* 网页版 .reward-chip：bg --panel2 / 边 --line / 胶囊 / 左右 12px / 12px 字 */
  /* 先算再画：结算层要**先知道胶囊占多高**才能把下面的按钮排开
     （V9.6.8 父亲大人真机截图：胶囊换行到第二排、下面的按钮却还按一排算，直接压上去）。 */
  function chipLayout(list) {
    const gap = 6 * CV.SCALE, h = 24 * CV.SCALE;
    const widths = list.map((t) => CV.measure(t, CV.FS.md) + 24 * CV.SCALE);
    // 先按一行排，超宽就换行（网页版是 flex-wrap）
    const lines = [[]];
    let w = 0;
    widths.forEach((wd, i) => {
      const cur = lines[lines.length - 1];
      const need = w + (cur.length ? gap : 0) + wd;
      if (need > U.cw() && cur.length) { lines.push([i]); w = wd; }
      else { cur.push(i); w = need; }
    });
    return { lines, widths, h, gap, height: lines.length * h + (lines.length - 1) * gap };
  }
  function drawChips(list, cx, y) {
    const L = chipLayout(list), gap = L.gap, h = L.h, widths = L.widths, lines = L.lines;
    let yy = y;
    lines.forEach((idx) => {
      const total = idx.reduce((a, i) => a + widths[i], 0) + gap * (idx.length - 1);
      let x = cx - total / 2;
      idx.forEach((i) => {
        CV.round(x, yy, widths[i], h, h / 2, CV.C.panel2, CV.C.line);
        CV.text(list[i], x + widths[i] / 2, yy + h / 2, { size: CV.FS.md, align: 'center' });
        x += widths[i] + gap;
      });
      yy += h + gap;
    });
    return L.height;
  }
  function drawSettle(res, p) {
    const c = CV.ctx;
    c.fillStyle = CV.a(CV.C.shade, .9);
    c.fillRect(0, 0, CV.W, CV.H);
    CV.hitMode = 'screen';                 // 这一层画在屏幕坐标里，命中区也要按屏幕坐标登记
    const prevOverlay = CV.pageOverlay;
    const cx = CV.W / 2;
    /* 胶囊上限：战斗结算 8 条（老口径）；扫荡那种"聚合后仍可能很多"的页面自己传 `maxChips` 放宽。 */
    const rewards = (p.rewards || []).slice(0, p.maxChips || 8);
    const acts = p.acts || [];
    // 竖直居中：按内容总高反推起始 y（网页版是 flex 居中）
    const CH = 40 * CV.SCALE, SUB = 18 * CV.SCALE;
    /* V9.6.8（父亲大人真机截图："结算界面乱的"）：奖励胶囊会换行，这里必须用**真实高度**，
       以前写死 28px —— 胶囊换到第二排时按钮就压在胶囊上。 */
    const chipsH = rewards.length ? chipLayout(rewards).height : 0;
    let total = 92 * CV.SCALE + SUB + 12 * CV.SCALE;
    if (rewards.length) total += chipsH + 10 * CV.SCALE;
    if (acts.length) total += acts.length * (44 * CV.SCALE + 10 * CV.SCALE);   // V9.6.128：动作按钮改成上下排列
    total += 44 * CV.SCALE;
    let y = Math.max(CV.TOP + 20 * CV.SCALE, (CV.H - total) / 2);
    /* V1.1.9（丙组）：这一层现在**也给扫荡结算用**（`BattleUI.showResult`）——
       扫荡没有"胜负/回合"，所以大标题与第二行都允许外面直接给（不给就还是老样子）。
       `res` 也允许为空（扫荡那条路传 `null`）。 */
    const R = res || {};
    const big = p.bigTitle || (R.win ? '胜 利' : '任务失败');
    CV.text(big, cx, y + 26 * CV.SCALE,
      { size: CV.DISP.d3 * CV.SCALE, bold: true, align: 'center', color: p.bigTitleColor || (R.win ? CV.C.gold : CV.C.accent) });
    y += 52 * CV.SCALE;
    // 第二行：战斗是"回合 + 星级"；扫荡直接给一整句（`line2`）
    const line2 = p.line2 || ((R.rounds ? (R.rounds + ' 回合') : '') + (p.sub ? ((R.rounds ? ' · ' : '') + p.sub) : ''));
    if (line2) CV.text(line2, cx, y + 8 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
    y += SUB + 12 * CV.SCALE;
    if (rewards.length) {
      drawChips(rewards, cx, y);
      y += chipsH + 10 * CV.SCALE;
    }
    /* V9.6.128（父亲大人："把继续下一关的按钮放上面，收下奖励并返回放下面，
       上下排列、长度一致不就好了"）：
       动作按钮**上下排列、整宽、与底部那颗等长** —— 不再左右并排。
       这样"自动在左、深井跑右"这种不一致从排版上就不存在了；顺序也固定：
       先"接着打"（继续/下一关），最后才是"收下奖励并返回"。 */
    const BW = Math.min(320 * CV.SCALE, U.iw());
    const BH = 44 * CV.SCALE;
    U.inCard = false;
    acts.forEach(function (a, i) {
      const auto = (B.autoLeft > 0 && i === B.autoIdx);
      U.y = y;
      U.btn(cx - BW / 2, y, BW, BH,
        auto ? (a.label + '  ' + B.autoLeft + 's') : a.label, a.style || 'ghost', a.id);
      y += BH + 10 * CV.SCALE;
    });
    /* ================= V1.1.16（M 轮 · 挂机结算）=================
       底下那颗的**文案 / 样式 / 动作**现在允许外面指定 —— 挂机那条路要的是「领取」
       （金底主按钮；点了既发奖又关页），战斗 / 扫荡那条路不给就维持原样
       （ghost ＋ `battle_close`）。`closeId` 必须能换，否则「领取」会被当成"只关页不领奖"。 */
    // 最后一行：收起奖励并返回（与上面每一颗**同宽**）
    U.y = y;
    U.btn(cx - BW / 2, y, BW, BH,
      p.closeLabel || (R.win ? (acts.length ? '收下奖励并返回' : '收下奖励') : '返回'),
      p.closeStyle || (acts.length ? 'ghost' : 'primary'), p.closeId || 'battle_close');
    CV.hitMode = 'content';
    CV.pageOverlay = prevOverlay;
  }

  CV.register('battle', drawBattle);

  /* ================= V1.1.9（丙组 · 通用结算页）=================
     父亲大人：「**现在扫荡的结算不行，里面还有乱码，可以像战斗结算那样展示**」。
     扫荡不是战斗，但它要做的是同一件事：把"这一趟拿到了什么"用**同一套胶囊**摆出来。
     所以这里把战斗那条路**整个借出去**（同一个 `drawSettle` / `drawChips` / 同一个页面），
     而不是在扫荡那边另写一套（那正是"两套写法迟早分叉"的老坑）：
       · `panel.title`   → 顶栏标题（战斗页那条头）
       · `panel.bigTitle`→ 大字（战斗是"胜 利/任务失败"，扫荡给"扫荡完成"）
       · `panel.line2`   → 第二行整句（扫荡写"扫荡 N 次 · 世界 第 X 关（难度）"）
       · `panel.rewards` → 胶囊（**只认 D.CURRENCIES/D.ITEMS 那套图标与名字**，内部键名漏不出来）
       · `panel.acts`    → 可选的动作按钮（扫荡传空 → 底下那颗变成主按钮）
     还要把"从哪儿来"记下来：底下那颗 `battle_close` 会按它退回（扫荡 → 回扫荡页/世界页）。
     ⚠️ 这个函数**必须挂在 `G.BattleUI` 已经建好之后**（放在文件末尾那个对象里）——
        第一版写在 `CV.register('battle')` 后面，那时 `G.BattleUI` 还不存在，
        加载就抛 `Cannot set properties of undefined`（七把尺子当场全红，page_smoke 直接指出行号）。 */
  function showResult(panel) {
    B.back = { stack: CV.stack.slice(), scroll: CV.scroll || 0 };
    B.on = false; B.res = null; B.done = true; B.busy = false; B.cfg = null;
    B.autoIdx = -1; B.autoLeft = 0;
    if (B.autoT) { clearInterval(B.autoT); B.autoT = null; }
    B.panel = panel || {};
    B.panel.acts = B.panel.acts || [];
    CV.reset('battle', { title: B.panel.title || '结算' });
  }

  /* ---------- 顶部固定条（标题 / 速度 / 撤离）画在顶栏位置 ---------- */
  CV.battleHead = function (title) {
    const c = CV.ctx;
    const y = CV.safeTop;
    c.fillStyle = CV.a(CV.C.overlay, .98);
    c.fillRect(0, y, CV.W, 44 * CV.SCALE);
    /* V9.6.2（父亲大人："真机也按不了 / 被遮挡"）：
       ① 这一条画在**屏幕坐标**里（在内容裁剪之前），命中区也必须按屏幕坐标登记 ——
          以前默认按内容坐标登记，手指得往上偏一整个顶栏才点得到（真机同样点不动）。
       V9.6.8（父亲大人）：「撤离 / 3×速度」从这一条挪到**右下角、战斗日志上面** ——
       顶栏这一条现在只放战斗标题，不占按钮位。 */
    CV.hitMode = 'screen';
    CV.hitMode = 'content';
    const PAD = 12 * CV.SCALE;
    CV.text(CV.fit(title, CV.W - PAD * 2, CV.FS.f1, true), PAD, y + 22 * CV.SCALE, { size: CV.FS.f1, bold: true });
    CV.TOP = y + 44 * CV.SCALE;
  };

  /* 右下角「撤离 / N×速度」：贴在战斗日志上方，右对齐（V9.6.8 父亲大人） */
  function battleCornerButtons(bottomY) {
    const bh = U.BTN_SM * CV.SCALE, gap = 8 * CV.SCALE;
    const w1 = CV.measure('撤离', CV.FS.md) + 26 * CV.SCALE;
    /* ================= V1.1.9（乙组 · 父亲大人）=================
       「**那个战斗五倍加速的单开一个按钮，不要跟现在的 x1/x2 合在一起**」
       原来是一颗按钮循环 1×→2×→（第 3 下看广告）→5×。现在拆成两颗：
         · **免费档那颗**：**只在 1× / 2× 之间切**（不再有第 3 下，也不再显示 5×）；
         · **×5 那颗**：单开一颗。没开 → 点了走 `AD.show('speed_x5')`；开了 → 显示倒计时进"已开"态，
           **再点不再重复扣次数**（只报一句还剩多久）。
       ⚠️ `S.settings.speed` 的口径**一个字没改**：免费档仍存 1/2，×5 只体现在 `speedUntil` 上
          （`Core.effSpeed()` 是唯一入口，`ad_audit` 在盯这条）。 */
    const free = freeSpeed();
    const spd = free + '×速度';
    const w2 = CV.measure(spd, CV.FS.md) + 26 * CV.SCALE;
    const x5Left = (Core.speedLeftSec && Core.speedLeftSec()) || 0;
    const x5On = x5Left > 0;
    const x5Label = x5On ? ('5× · ' + Math.floor(x5Left / 60) + ':' + String(x5Left % 60).padStart(2, '0')) : '📺 5×';
    const w3 = CV.measure(x5Label, CV.FS.md) + 26 * CV.SCALE;
    const x3 = U.pad() + U.cw() - w3, x2 = x3 - gap - w2, x1 = x2 - gap - w1;
    const y = bottomY - bh;
    U.btn(x1, y, w1, bh, '撤离', 'ghost', 'battle_quit');
    U.btn(x2, y, w2, bh, spd, 'ghost', 'battle_speed');
    /* ×5 那颗：已开时走"已开"态（金边金字），未开时也照常可点（走广告） */
    U.btn(x3, y, w3, bh, x5Label, x5On ? 'gold' : 'ghost', 'battle_speed_x5');
    return bh;
  }

  /* 免费档（1/2）—— 与 `Core.effSpeed()` 分开：那个是"当前生效档"（广告期内是 5），
     这个只回答"免费那颗按钮现在选的是几"。老档里的 3/5 一律回落成 2。 */
  function freeSpeed() {
    const s = (Core.S.settings && Core.S.settings.speed) || 1;
    return s >= 2 ? 2 : 1;
  }

  CV.on('battle_speed', function () {
    /* V1.1.9：这颗**只管免费档 1× ⇄ 2×**（原来点第 3 下会去开广告，现在那件事归旁边那颗 ×5）。 */
    const next = freeSpeed() === 1 ? 2 : 1;
    if (Core.S.settings) { Core.S.settings.speed = next; Core.save(); }
    if (Core.effSpeed) { B.speed = Core.effSpeed(); CV.battleSpeed = B.speed; }
    CV.toast(next + '× 速度', 1200);
    CV.render();
  });
  CV.on('battle_speed_x5', function () {
    const left = (Core.speedLeftSec && Core.speedLeftSec()) || 0;
    if (left > 0) {
      /* **已开**：再点不再扣次数（广告配额也不动），只报一句还剩多久 */
      CV.toast('×5 还剩 ' + Math.floor(left / 60) + ' 分 ' + (left % 60) + ' 秒', 1800);
      return;
    }
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块（免费档 1×/2×）', 2000); return; }
    AD.show('speed_x5').then(function (r) {
      if (!r || !r.granted) { CV.toast('广告没看完，倍速没开'); CV.render(); return; }
      if (Core.grantSpeedAd) Core.grantSpeedAd();
      if (Core.effSpeed) { B.speed = Core.effSpeed(); CV.battleSpeed = B.speed; }
      CV.toast('📺 ×5 已开 · 30 分钟（不限次数、不计总次数）', 2400);
      CV.render();
    });
  });
  /* ================= V1.1.8（丙组 B10 · 战斗复活）=================
     父亲大人的口径：**每场 1 次**；复活续战 —— **敌人带剩余血量进场**、**只回阵亡者、血量 50%**。
     做法：把这一场"打到一半的双方面板"原样搬进新一场（`B.units` 里每个单位的当前血量）：
       · **敌人**：`hp` 取当前值（不清空、不回满）——这就是"带剩余血量进场"；
       · **我方**：活着的保留当前血量；**阵亡的按 `maxHp × 50%` 复活**；
       · 状态/护盾/能量这些**战斗期的临时态不带过去**（新一场从干净状态起，能量按当前值续）；
       · 用**同一份 cfg** 重开 → 对上层（波次推进 / 结算 / 斗法台 / 深井）完全透明。
     配额：`AD.show('revive', {perBattle:true})` —— 日配额由 `LIMITS.revive` 表达，
     但"每场 1 次"由 `B.revived` 把关（换一场自动复位），**并计入总闸**。 */
  function carryUnit(u, isAlly) {
    /* 界面层不用 `getProxied`（那是逻辑层给数据表用的包装，见 core.js 顶部）——
       这里就是一份临时规格对象，跟着本文件其它地方的写法用普通对象。 */
    const spec = {};
    Object.keys(u).forEach(function (k) {
      /* 不带过去：实例身份 / 战斗期临时态（状态、护盾、相位、召唤标记）/ 减伤类的"这一场的"快照 */
      if (['uid', 'side', 'statuses', 'shield', 'phase70', 'phase30', 'revived', 'summoned'].indexOf(k) >= 0) return;
      spec[k] = u[k];
    });
    spec.maxHp = u.maxHp;
    spec.hp = isAlly ? (u.hp > 0 ? u.hp : Math.round(u.maxHp * 0.5)) : Math.max(1, Math.round(u.hp));
    spec.initEnergy = Math.max(0, Math.min(100, u.energy || 0));
    return spec;
  }
  function battleRevive() {
    const cfg = B.cfg;
    if (!cfg) { CV.toast('现在没有进行中的战斗'); return; }
    if (B.revived) { CV.toast('这一场已经复活过了（每场 1 次）'); return; }
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); return; }
    AD.show('revive', { perBattle: true }).then(function (r) {
      if (!r || !r.granted) { CV.toast(r && r.reason === 'total' ? '今天看广告的次数用完了' : '广告没看完，没有复活'); CV.render(); return; }
      const units = Object.keys(B.units || {}).map(function (k) { return B.units[k]; });
      const allies = units.filter(function (u) { return u.side === 'ally'; }).map(function (u) { return carryUnit(u, true); });
      const enemies = units.filter(function (u) { return u.side === 'enemy'; }).map(function (u) { return carryUnit(u, false); });
      if (!allies.length || !enemies.length) { CV.toast('这一场没有可复活的对象'); CV.render(); return; }
      const revived = allies.filter(function (s, i) { return units.filter(function (u) { return u.side === 'ally'; })[i].hp <= 0; }).length;
      B.revived = true;
      G.BattleUI.clear();                    // 收掉这一场（含 busy 闸门），下面立刻重开
      G.BattleUI.run(Object.assign({}, cfg, { allies: allies, enemies: enemies }));
      CV.toast('♻️ 已复活：阵亡 ' + revived + ' 人回 50% 血 · 敌人带剩余血量续战', 2600);
    });
  }
  CV.on('battle_revive', battleRevive);
  /* 打完/撤离之后回哪儿：优先用配置给的回调；没给就**还原开打时的页面栈**。
     只有连"从哪来"都没有（极端情况）才退到残域列表。 */
  function backToSource(kind) {
    const cfg = B.cfg; B.cfg = null;
    if (cfg && cfg[kind]) { cfg[kind](); return; }
    if (B.back && B.back.stack && B.back.stack.length) {
      CV.stack = B.back.stack.slice();
      CV.scroll = B.back.scroll || 0;
      CV.pageOverlay = null; CV.sticky = null;
      CV.render();
      return;
    }
    CV.reset('dungeon');
  }
  CV.on('battle_quit', function () {
    U.confirm('撤离', '确定撤离？这场战斗不算数（不给奖励），本次探索进度会清空，已经拿到的奖励保留。', function () {
      clearTimer(); B.on = false; B.res = null; B.panel = null; B.busy = false;
      backToSource('onQuit');
    });
  });
  CV.on('battle_close', function () {
    clearTimer(); B.on = false; B.res = null; B.panel = null; B.busy = false;
    backToSource('onClose');
  });
  /* 结算面板上的自定义按钮（下一关 / 返回 / 继续） */
  CV.on('battle_act', function () {});

  G.BattleUI = {
    buildAllies,
    showResult,
    state: B,
    /* V9.6.89（父亲大人报的"网页版斗法台能连点跳层"）：小游戏这边同一套结构，
       也补上防重入 —— 连点两下挑战只会开一场，而不是两场各自结算。 */
    busy: function () { return !!B.busy; },
    /* 打一场：cfg = { title, allies, enemies, worldId, maxRounds, onEnd(win,res,hpLeft), onQuit, onClose } */
    run(cfg) { if (this.busy()) { CV.toast('战斗进行中…'); return false; } start(cfg); fight(G.Battle.run({ allies: cfg.allies, enemies: cfg.enemies, worldId: cfg.worldId, maxRounds: cfg.maxRounds, allyHitMod: (G.Battle.MECHANICS[cfg.worldId] || {}).allyHitMod || 0 })); },
    fight,
    clear: function () { clearTimer(); B.on = false; B.res = null; B.panel = null; B.cfg = null; B.busy = false; },
    /* ---------- 测试口（只有尺子用，不参与游戏逻辑）----------
       `audio_audit` 要能**逐帧手推** `applyFrame`，验证"每一次伤害飘字都有同帧音效、
       且多段＝多声"。没有这个口子，尺子就只能读源码猜挂点，那种尺子抓不到
       "音效被挪去了回合开始"这类改动（父亲大人续单点名要做坏试验能变红的那条）。 */
    _load: loadRes,
    _applyFrame: applyFrame,
    _battle: B,
  };
})();
