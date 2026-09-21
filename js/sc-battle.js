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
  const STATUS_TEXT = { poison: '中毒', burn: '燃烧', bleed: '流血', stun: '眩晕', freeze: '冰冻', weak: '虚弱', sunder: '破防', fear: '恐惧', taunt: '嘲讽', regen: '回复' };

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
    B.speed = (Core.S.settings && Core.S.settings.speed) || 1;
    CV.battleSpeed = B.speed;
    B.title = cfg.title || '战斗';
    CV.reset('battle', { title: B.title });
  }

  function fight(res) {
    B.res = res; B.idx = 0; B.units = {};
    const startFrame = res.frames[0];
    (startFrame.allies || []).concat(startFrame.enemies || []).forEach((u) => { B.units[u.uid] = Object.assign({}, u); });
    if (startFrame.note) pushLog('⚠ 世界机制：' + startFrame.note);
    step();
  }

  function step() {
    if (!B.on) return;
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
      const alive = (B.floaters || []).some(function (f) { return now - f.t < 900; })
        || Object.keys(B.hitAt || {}).some(function (k) { return now - B.hitAt[k] < 320; })
        || Object.keys(B.atkAt || {}).some(function (k) { return now - B.atkAt[k] < 220; });
      if (!alive) { clearInterval(fxT); fxT = null; }
      CV.render();
    }, 55);
  }
  function floater(uid, text, color) {
    const u = B.units[uid];
    if (!u) return;
    B.floaters.push({ uid, text, color: color || CV.C.gold, t: Date.now() });
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
        break;
      case 'damage': {
        const u = B.units[f.target];
        hitFx(f.target); atkFx(f.source || f.actor);      // 受击闪红 + 出手前冲
        /* V9.6.68（资料 §8/§9）：轻击一点点震、暴击明显一点 + 一下 hitstop（见 step）；
           平时不震，免得整场都在抖（原文："如果普通攻击都在震屏，玩家很快就烦"。） */
        B.shakeUntil = Date.now() + (f.crit ? 160 : 90);
        B.shakePx = f.crit ? 3 * CV.SCALE : 1.5 * CV.SCALE;
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, (f.crit ? '暴击 ' : '-') + f.dmg, f.crit ? CV.C.gold : '#ff8080');
        B.energy[f.target] = Math.min(100, (B.energy[f.target] || 0) + 15);
        if (f.healed) { const s = B.units[f.source]; if (s) { s.hp = Math.min(s.maxHp, s.hp + f.healed); floater(f.source, '+' + f.healed, CV.C.green); } }
        if (f.killed) pushLog('💀 ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'dot': {
        const u = B.units[f.target];
        hitFx(f.target);
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, '-' + f.dmg, '#ff8080');
        if (f.killed) pushLog('💀 ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'heal': {
        const u = B.units[f.target];
        if (u) u.hp = Math.min(u.maxHp, u.hp + f.amount);
        floater(f.target, '+' + f.amount, CV.C.green);
        ensureFx();
        break;
      }
      case 'shield': floater(f.target, '🛡+' + f.amount, CV.C.green); break;
      case 'dodge': floater(f.target, '闪避', CV.C.dim); break;
      case 'skip': pushLog('😵 ' + nameOf(f.actor) + ' 无法行动'); break;
      case 'buff': floater(f.target, '↑ ' + f.name, CV.C.green); break;
      case 'status': floater(f.target, STATUS_TEXT[f.status] || '异常', '#c8a2ff'); break;
      case 'phase': pushLog('🔥 ' + f.text); break;
      case 'revive': { const u = B.units[f.boss]; if (u) u.hp = Math.round(u.maxHp * 0.3); pushLog('♻ ' + f.text); break; }
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
  function unitCard(x, y, w, u, small) {
    const dead = u.hp <= 0;
    /* V1.0.1（父亲大人："我方人员的大小也很敌方的不一样，统一做成敌方那样的大小标准"）：
       原来我方 small 走 42、敌方 50 —— 两边一大一小。统一成 50。 */
    const av = 50;
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
    else CV.round(cx - av / 2, y, av, av, 12 * CV.SCALE, '#232c42', u.isBoss ? CV.C.accent : CV.C.line, u.isBoss ? 2 : 1.5);
    if (u.side === 'enemy') {
      CV.ctx.fillStyle = '#2e1a24';
      CV.ctx.fill();
      CV.ctx.strokeStyle = u.isBoss ? CV.C.accent : CV.C.line; CV.ctx.lineWidth = u.isBoss ? 2 : 1.5; CV.ctx.stroke();
    } else CV.ctx.fillStyle = '#232c42';
    u._cx = cx; u._top = y; u._av = av;   // 飘字要用：记住这一张卡画在哪
    CV.text(String(u.name || '?').slice(0, 1), cx, y + av / 2, { size: small ? CV.FS.f1 : CV.DISP.d1, bold: true, align: 'center' });   // 头像首字：跟着层级 token 走（原来是裸 16/18）
    if (dead) CV.ctx.globalAlpha = 1;
    // 名字
    CV.text(CV.fit(u.name, w, CV.FS.sm), cx, y + av + 9 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'center' });
    /* V1.0.1（父亲大人："血条可以短一点（减长度不是减血量）"）：
       血条收成卡片内宽的 70% 并居中 —— 只动长度，血量与百分比都不变。 */
    const fullW = w - 6 * CV.SCALE;
    const bw = fullW * 0.7;
    const bx = x + 3 * CV.SCALE + (fullW - bw) / 2;
    const by = y + av + 20 * CV.SCALE, bh = 5 * CV.SCALE;
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    CV.round(bx, by, bw, bh, 3 * CV.SCALE, '#0d1120');
    if (pct > 0) CV.round(bx, by, bw * pct, bh, 3 * CV.SCALE, pct < 0.35 ? CV.C.accent : CV.C.green);
    CV.text(Math.round(pct * 100) + '%', cx, by + bh + 7 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
    if (u.side === 'ally') {
      const en = B.energy[u.uid] || 0;
      if (en > 0) CV.round(bx, by + bh + 13 * CV.SCALE, bw * (en / 100), 2.5 * CV.SCALE, 2, CV.C.gold);
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
      { size: CV.FS.t1, bold: true, align: 'center', color: 'rgba(233,236,242,' + alpha.toFixed(2) + ')' });
  }

  function drawBattle() {
    U.begin();
    const res = B.res;
    /* V1.0.1（**实证**，不是猜）：battle_flow_audit 的逐帧断言报过
       「出现过的 top：96 / 658」—— 96 就是这张占位卡的 top，
       说明换波 / 结算交接的空档里 B.res 短暂为空，这一帧会退回**没有日志卡的占位版**，
       下一帧日志卡又出现。战斗页还开着（B.on）时保留布局、不再退占位版。 */
    if (!res) {
      if (B.on || B.panel) return;
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
    const CARD_H = 92 * CV.SCALE;                 // 一张单位卡的高度（头像 + 名字 + 血条 + 百分比）
    const LOG_H = 150 * CV.SCALE;                 // 战斗日志卡占的高度（含外边距，留够 4 行，别让底部被裁）
    const SIDE_GAP = 14 * CV.SCALE;               // 我方前排与后排的间距（和网页版 .b-side gap 一致）
    /* V9.6.2（父亲大人："战斗日志还是出画了"）：这里是**内容坐标**（渲染时已经被顶栏整体下移），
       所以"画面底部"要减掉顶栏与安全区 —— 以前直接拿 CV.H 算，日志被推出去约一整个顶栏的高度。 */
    const CONTENT_H = CV.H - CV.safeBottom - (CV.TOP + 8) - 8;
    const FIELD_BOTTOM = CONTENT_H - LOG_H;
    /* V9.6.8（父亲大人）：「撤离 / 速度」挪到右下角、战斗日志**上面** ——
       这一行要占位置，所以单位摆放的下边界要再往上让出它的高度，免得挤在一起。 */
    const CORNER_H = U.BTN_SM * CV.SCALE + 10 * CV.SCALE;
    const FIELD_BOTTOM_UNITS = FIELD_BOTTOM - CORNER_H;
    /* V9.6.1（父亲大人给的批注）：中间那块不能是空的 —— 敌方 / 我方 / 日志要**紧凑占满一屏**。
       把余量**四等分**（上留白 / 敌我之间×2 / 下留白），也就是敌我空档 = 上下留白的 2 倍，
       和网页版 .b-field 的 `justify-content: space-around` 是同一套几何。 */
    /* V1.0.1（父亲大人："敌方阵型跟我方阵型一样，前 2 后 3，战斗显示为上方为后排、
       下方为前排，像下象棋一样"）：敌我各两排 —— **后排在上、前排在下**（前排朝对面），
       所以是 4 行、两个排间距。 */
    const stackH = CARD_H * 4 + SIDE_GAP * 2;
    const space = Math.max(6 * CV.SCALE, ((FIELD_BOTTOM_UNITS - FIELD_TOP) - stackH) / 4);
    const enemyY = FIELD_TOP + space;
    /* V1.0.1（父亲大人："现在双方阵型贴在一起了"）：改成四行之后余量被摊薄，
       敌我两组就挤到一块儿了。这里给两组之间一个**最小间距**（至少半张卡高），
       小屏也不会贴脸。 */
    const GROUP_GAP = Math.max(space * 2, CARD_H * 0.5);
    const allyTop = enemyY + CARD_H + SIDE_GAP + GROUP_GAP;
    if (!B.tip) {   // V9.6.128：波次卡期间**只跳过阵容绘制**，日志与撤离/加速照常画
      const rows = [
        { list: enemies.filter((u) => u.position !== 'front'), y: enemyY, ally: false },                       // 敌方后排（最上）
        { list: enemies.filter((u) => u.position === 'front'), y: enemyY + CARD_H + SIDE_GAP, ally: false },   // 敌方前排（靠中）
        { list: front, y: allyTop, ally: true },                                                              // 我方前排（靠中）
        { list: back, y: allyTop + CARD_H + SIDE_GAP, ally: true },                                           // 我方后排（最下）
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
        list.forEach((u, i) => unitCard(x0 + i * (cw + g), row.y, cw, u, row.ally));
      });
      /* 伤害 / 回复飘字（V9.6.28）：上升 26px + 淡出，带深色描边保证在任何底色上都看得清。
         位置取自各卡刚才记下的 _cx/_top —— 所以先画完所有单位再画它。 */
      (B.floaters || []).forEach(function (f) {
        const u = B.units[f.uid];
        if (!u || u._cx == null) return;
        const p = Math.min(1, (Date.now() - f.t) / 900);
        if (p >= 1) return;
        const fy = u._top - 4 * CV.SCALE - 26 * CV.SCALE * p;
        const alpha = 1 - p * p;
        CV.ctx.save();
        CV.ctx.globalAlpha = alpha;
        const size = 14 * CV.SCALE;
        CV.ctx.lineWidth = 3 * CV.SCALE; CV.ctx.strokeStyle = 'rgba(0,0,0,.75)';
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
        CV.ctx.strokeStyle = '#ff5a5a'; CV.ctx.lineWidth = 2.5 * CV.SCALE;
        if (u.side === 'enemy') { CV.ctx.beginPath(); CV.ctx.arc(u._cx, u._top + u._av / 2, u._av / 2 + 2, 0, Math.PI * 2); CV.ctx.stroke(); }
        else CV.round(u._cx - u._av / 2 - 2, u._top - 2, u._av + 4, u._av + 4, 13 * CV.SCALE, null, '#ff5a5a', 2.5 * CV.SCALE);
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

    /* 右下角两个按钮：撤离 / N×速度（战斗日志上面） */
    battleCornerButtons(FIELD_BOTTOM - 4 * CV.SCALE);
    /* 波次卡（居中在阵容区）—— 放在这里是因为它要用 FIELD_BOTTOM */
    if (B.tip) drawWaveCard(FIELD_BOTTOM);
    /* 战斗日志贴着内容底部（网页版 #battle-log） */
    U.y = FIELD_BOTTOM + 6 * CV.SCALE;
    /* 战斗日志（最近 4 行，网页版 #battle-log）
       V1.0.1（父亲大人）：**高度锁死** —— 新一波开始时 B.log 会清空，
       不锁的话卡片先缩上去、再随日志变多重新拉长。minH 取 4 行时的自然高度（140）。 */
    U.card(function () {
      U.h3('战斗日志');
      const lines = B.log.slice(-4);
      if (!lines.length) U.hint('（战斗开始）', 4 * CV.SCALE);
      lines.forEach((ln) => U.hint(ln, 2 * CV.SCALE));
    }, { minH: 140 });
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
    c.fillStyle = 'rgba(5,6,10,.9)';
    c.fillRect(0, 0, CV.W, CV.H);
    CV.hitMode = 'screen';                 // 这一层画在屏幕坐标里，命中区也要按屏幕坐标登记
    const prevOverlay = CV.pageOverlay;
    const cx = CV.W / 2;
    const rewards = (p.rewards || []).slice(0, 8);
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
    // 大标题
    CV.text(res.win ? '胜 利' : '任务失败', cx, y + 26 * CV.SCALE,
      { size: CV.DISP.d3 * CV.SCALE, bold: true, align: 'center', color: res.win ? CV.C.gold : CV.C.accent });
    y += 52 * CV.SCALE;
    // 回合 + 星级
    CV.text(res.rounds + ' 回合' + (p.sub ? ' · ' + p.sub : ''), cx, y + 8 * CV.SCALE,
      { size: CV.FS.md, align: 'center', color: CV.C.dim });
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
    // 最后一行：收起奖励并返回（与上面每一颗**同宽**）
    U.y = y;
    U.btn(cx - BW / 2, y, BW, BH,
      res.win ? (acts.length ? '收下奖励并返回' : '收下奖励') : '返回', acts.length ? 'ghost' : 'primary', 'battle_close');
    CV.hitMode = 'content';
    CV.pageOverlay = prevOverlay;
  }

  CV.register('battle', drawBattle);

  /* ---------- 顶部固定条（标题 / 速度 / 撤离）画在顶栏位置 ---------- */
  CV.battleHead = function (title) {
    const c = CV.ctx;
    const y = CV.safeTop;
    c.fillStyle = 'rgba(16,12,18,.98)';
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
    const spd = (B.speed || 1) + '×速度';
    const w2 = CV.measure(spd, CV.FS.md) + 26 * CV.SCALE;
    const x2 = U.pad() + U.cw() - w2, x1 = x2 - gap - w1;
    const y = bottomY - bh;
    U.btn(x1, y, w1, bh, '撤离', 'ghost', 'battle_quit');
    U.btn(x2, y, w2, bh, spd, 'ghost', 'battle_speed');
    return bh;
  }

  CV.on('battle_speed', function () {
    B.speed = B.speed >= 3 ? 1 : B.speed + 1;
    CV.battleSpeed = B.speed;
    if (Core.S.settings) { Core.S.settings.speed = B.speed; Core.save(); }
    CV.render();
  });
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
    state: B,
    /* V9.6.89（父亲大人报的"网页版斗法台能连点跳层"）：小游戏这边同一套结构，
       也补上防重入 —— 连点两下挑战只会开一场，而不是两场各自结算。 */
    busy: function () { return !!B.busy; },
    /* 打一场：cfg = { title, allies, enemies, worldId, maxRounds, onEnd(win,res,hpLeft), onQuit, onClose } */
    run(cfg) { if (this.busy()) { CV.toast('战斗进行中…'); return false; } start(cfg); fight(G.Battle.run({ allies: cfg.allies, enemies: cfg.enemies, worldId: cfg.worldId, maxRounds: cfg.maxRounds, allyHitMod: (G.Battle.MECHANICS[cfg.worldId] || {}).allyHitMod || 0 })); },
    fight,
    clear: function () { clearTimer(); B.on = false; B.res = null; B.panel = null; B.cfg = null; B.busy = false; },
  };
})();
