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
  };
  const AUTO_NEXT_SEC = 8;         // 与网页版同一个值（AUTO_NEXT_SEC）
  let uidSeq = 0;
  const STATUS_TEXT = { poison: '中毒', burn: '燃烧', bleed: '流血', stun: '眩晕', freeze: '冰冻', weak: '虚弱', sunder: '破防', fear: '恐惧', taunt: '嘲讽', regen: '回复' };

  function clearTimer() {
    if (B.timer) { clearTimeout(B.timer); B.timer = null; }
    if (B.autoT) { clearInterval(B.autoT); B.autoT = null; }
  }
  function pushLog(line) { B.log.push(line); if (B.log.length > 60) B.log.shift(); }
  function nameOf(uid) { const u = B.units[uid]; return u ? u.name : ''; }

  function start(cfg) {
    clearTimer();
    B.on = true; B.cfg = cfg; B.done = false; B.panel = null; B.log = []; B.floaters = []; B.energy = {};
    B.speed = (Core.S.settings && Core.S.settings.speed) || 1;
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
    B.timer = setTimeout(step, Math.max(40, delay / B.speed));
    CV.render();
  }

  function floater(uid, text, color) {
    const u = B.units[uid];
    if (!u) return;
    B.floaters.push({ uid, text, color: color || CV.C.gold, t: Date.now() });
  }

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
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, (f.crit ? '暴击 ' : '-') + f.dmg, f.crit ? CV.C.gold : '#ff8080');
        B.energy[f.target] = Math.min(100, (B.energy[f.target] || 0) + 15);
        if (f.healed) { const s = B.units[f.source]; if (s) { s.hp = Math.min(s.maxHp, s.hp + f.healed); floater(f.source, '+' + f.healed, CV.C.green); } }
        if (f.killed) pushLog('💀 ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'dot': {
        const u = B.units[f.target];
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, '-' + f.dmg, '#ff8080');
        if (f.killed) pushLog('💀 ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'heal': {
        const u = B.units[f.target];
        if (u) u.hp = Math.min(u.maxHp, u.hp + f.amount);
        floater(f.target, '+' + f.amount, CV.C.green);
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
      const ai = B.panel.acts.findIndex(function (a) { return a.primary; });
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
      B.tip = B.panel.sub || '本波通过，继续推进…';
      const after = B.panel.after;
      B.panel = null;
      B.timer = setTimeout(function () { B.tip = null; if (after) after(); }, 900);
    }
    CV.render();
  }

  /* ---------- 画一帧战斗 ---------- */
  function unitCard(x, y, w, u, small) {
    const dead = u.hp <= 0;
    const av = small ? 42 : 50;
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
    CV.text(String(u.name || '?').slice(0, 1), cx, y + av / 2, { size: small ? 16 : 18, bold: true, align: 'center' });
    if (dead) CV.ctx.globalAlpha = 1;
    // 名字
    CV.text(CV.fit(u.name, w, CV.FS.sm), cx, y + av + 9 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'center' });
    // 血条
    const by = y + av + 20 * CV.SCALE, bw = w - 6 * CV.SCALE, bh = 5 * CV.SCALE;
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    CV.round(x + 3 * CV.SCALE, by, bw, bh, 3 * CV.SCALE, '#0d1120');
    if (pct > 0) CV.round(x + 3 * CV.SCALE, by, bw * pct, bh, 3 * CV.SCALE, pct < 0.35 ? CV.C.accent : CV.C.green);
    CV.text(Math.round(pct * 100) + '%', cx, by + bh + 7 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
    if (u.side === 'ally') {
      const en = B.energy[u.uid] || 0;
      if (en > 0) CV.round(x + 3 * CV.SCALE, by + bh + 13 * CV.SCALE, bw * (en / 100), 2.5 * CV.SCALE, 2, CV.C.gold);
    }
    return av + 30 * CV.SCALE + 10 * CV.SCALE;
  }

  function drawBattle() {
    U.begin();
    const res = B.res;
    if (!res) { U.card(function () { U.h3('战斗'); U.hint('没有进行中的战斗', 6 * CV.SCALE); }); return; }
    const units = Object.keys(B.units).map((k) => B.units[k]).filter((u) => u && u.side);
    const enemies = units.filter((u) => u.side === 'enemy');
    const allies = units.filter((u) => u.side === 'ally');
    const front = allies.filter((u) => u.position === 'front');
    const back = allies.filter((u) => u.position === 'back');
    /* 战场区：**和网页版同一套规则**（V9.6.0 父亲大人两条意见一起改）——
         · "敌我离得好近"：小游戏原来从战场顶按固定行高往下堆，满编时三行挤在上半屏；
         · "我方前后排离得太远"：网页版原来用 space-evenly 把三行摊满整屏，前后排隔了 185px。
       现在两边都是：**敌方占上方、我方前排+后排收成一组贴在日志上方**，
       我方两排之间只隔 14px（就是"一支部队"该有的距离），屏幕越高上下留白越多。 */
    const FIELD_TOP = U.y;
    const CARD_H = 92 * CV.SCALE;                 // 一张单位卡的高度（头像 + 名字 + 血条 + 百分比）
    const LOG_H = 126 * CV.SCALE;                 // 战斗日志卡占的高度（含外边距）
    const SIDE_GAP = 14 * CV.SCALE;               // 我方前排与后排的间距（和网页版 .b-side gap 一致）
    const FIELD_BOTTOM = CV.H - CV.NAV_H - CV.safeBottom - LOG_H;
    const allyBlockH = CARD_H * 2 + SIDE_GAP;
    const allyTop = Math.max(FIELD_TOP + CARD_H + 16 * CV.SCALE, FIELD_BOTTOM - allyBlockH);
    const enemyY = FIELD_TOP + Math.max(0, (allyTop - FIELD_TOP - CARD_H)) * 0.42;
    const rows = [
      { list: enemies, y: enemyY, ally: false },
      { list: front, y: allyTop, ally: true },
      { list: back, y: allyTop + CARD_H + SIDE_GAP, ally: true },
    ];
    rows.forEach((row) => {
      const list = row.list;
      if (!list.length) return;
      const n = Math.max(1, list.length);
      const g = 8 * CV.SCALE;
      const maxW = row.ally ? U.cw() * 0.24 : U.cw() * 0.3;
      const cw = Math.min(maxW, (U.cw() - g * (n - 1)) / n);
      const x0 = U.pad() + (U.cw() - (cw * n + g * (n - 1))) / 2;
      list.forEach((u, i) => unitCard(x0 + i * (cw + g), row.y, cw, u, row.ally));
    });
    /* 战斗日志贴着底部（网页版 #battle-log） */
    U.y = FIELD_BOTTOM + 6 * CV.SCALE;
    /* 战斗日志（最近 4 行，网页版 #battle-log） */
    U.card(function () {
      U.h3('战斗日志');
      const lines = B.log.slice(-4);
      if (!lines.length) U.hint('（战斗开始）', 4 * CV.SCALE);
      lines.forEach((ln) => U.hint(ln, 2 * CV.SCALE));
    });
    /* 结算：**整屏结算层**（网页版 .b-result：大标题 + 回合/星级 + 奖励胶囊 + 动作 + 收起返回） */
    if (B.panel) drawSettle(res, B.panel);
    if (B.tip) {
      const w = Math.min(CV.W - 60 * CV.SCALE, CV.measure(B.tip, CV.FS.lg) + 36 * CV.SCALE);
      const x = (CV.W - w) / 2, y = CV.H / 2 - 20 * CV.SCALE;
      CV.round(x, y, w, 40 * CV.SCALE, 12 * CV.SCALE, 'rgba(13,18,32,.93)', CV.C.gold);
      CV.text(B.tip, CV.W / 2, y + 20 * CV.SCALE, { size: CV.FS.lg, color: CV.C.gold, align: 'center' });
    }
  }

  /* 网页版 .reward-chip：bg --panel2 / 边 --line / 胶囊 / 左右 12px / 12px 字 */
  function drawChips(list, cx, y) {
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
    return yy - y;
  }
  function drawSettle(res, p) {
    const c = CV.ctx;
    c.fillStyle = 'rgba(5,6,10,.9)';
    c.fillRect(0, 0, CV.W, CV.H);
    CV.hitMode = 'screen';
    const cx = CV.W / 2;
    const rewards = (p.rewards || []).slice(0, 8);
    const acts = p.acts || [];
    const chipH = 0;
    // 竖直居中：按内容总高反推起始 y（网页版是 flex 居中）
    const CH = 40 * CV.SCALE, SUB = 18 * CV.SCALE;
    let total = 92 * CV.SCALE + SUB + 12 * CV.SCALE;
    if (rewards.length) total += 28 * CV.SCALE + 10 * CV.SCALE;
    if (acts.length) total += 44 * CV.SCALE + 12 * CV.SCALE;
    total += 44 * CV.SCALE;
    let y = Math.max(CV.TOP + 20 * CV.SCALE, (CV.H - total) / 2);
    // 大标题
    CV.text(res.win ? '胜 利' : '任务失败', cx, y + 26 * CV.SCALE,
      { size: 30 * CV.SCALE, bold: true, align: 'center', color: res.win ? CV.C.gold : CV.C.accent });
    y += 52 * CV.SCALE;
    // 回合 + 星级
    CV.text(res.rounds + ' 回合' + (p.sub ? ' · ' + p.sub : ''), cx, y + 8 * CV.SCALE,
      { size: CV.FS.md, align: 'center', color: CV.C.dim });
    y += SUB + 12 * CV.SCALE;
    if (rewards.length) {
      drawChips(rewards, cx, y);
      y += 28 * CV.SCALE + 10 * CV.SCALE;
    }
    // 动作按钮（最多两个并排，和网页版 .btn-row 一致）
    if (acts.length) {
      const gap = 10 * CV.SCALE, h = 44 * CV.SCALE;
      const n = acts.length;
      const w = (U.cw() - gap * (n - 1)) / n;
      acts.forEach(function (a, i) {
        const auto = (B.autoLeft > 0 && i === B.autoIdx);
        const label = auto ? a.label + '  ' + B.autoLeft + 's' : a.label;
        U.btn(U.pad() + i * (w + gap), y, w, h, label, a.style || 'ghost', a.id);
      });
      y += h + 12 * CV.SCALE;
    }
    // 收起奖励并返回（网页版最后一个按钮）
    U.btn(cx - 100 * CV.SCALE, y, 200 * CV.SCALE, 44 * CV.SCALE,
      res.win ? (acts.length ? '收下奖励并返回' : '收下奖励') : '返回', acts.length ? 'ghost' : 'primary', 'battle_close');
    CV.hitMode = 'content';
  }

  CV.register('battle', drawBattle);

  /* ---------- 顶部固定条（标题 / 速度 / 撤离）画在顶栏位置 ---------- */
  CV.battleHead = function (title) {
    const c = CV.ctx;
    const y = CV.safeTop;
    c.fillStyle = 'rgba(16,12,18,.98)';
    c.fillRect(0, y, CV.W, 42 * CV.SCALE);
    CV.text(CV.fit(title, CV.W - 150 * CV.SCALE, CV.FS.f1, true), 12 * CV.SCALE, y + 21 * CV.SCALE, { size: CV.FS.f1, bold: true });
    const bw = 62 * CV.SCALE;
    U.btn(CV.W - 12 * CV.SCALE - bw * 2 - 8 * CV.SCALE, y + 8 * CV.SCALE, bw, 26 * CV.SCALE, B.speed + '×速度', 'ghost', 'battle_speed');
    U.btn(CV.W - 12 * CV.SCALE - bw, y + 8 * CV.SCALE, bw, 26 * CV.SCALE, '撤离', 'ghost', 'battle_quit');
    CV.TOP = y + 42 * CV.SCALE;
  };

  CV.on('battle_speed', function () {
    B.speed = B.speed >= 3 ? 1 : B.speed + 1;
    if (Core.S.settings) { Core.S.settings.speed = B.speed; Core.save(); }
    CV.render();
  });
  CV.on('battle_quit', function () {
    U.confirm('撤离', '确定撤离？这场战斗不算数（不给奖励），本次探索进度会清空，已经拿到的奖励保留。', function () {
      clearTimer(); B.on = false; B.res = null; B.panel = null;
      const cfg = B.cfg; B.cfg = null;
      if (cfg && cfg.onQuit) cfg.onQuit(); else { CV.reset('dungeon'); }
    });
  });
  CV.on('battle_close', function () {
    clearTimer(); B.on = false; B.res = null; B.panel = null;
    const cfg = B.cfg; B.cfg = null;
    if (cfg && cfg.onClose) cfg.onClose(); else CV.reset('dungeon');
  });
  /* 结算面板上的自定义按钮（下一关 / 返回 / 继续） */
  CV.on('battle_act', function () {});

  G.BattleUI = {
    buildAllies,
    state: B,
    /* 打一场：cfg = { title, allies, enemies, worldId, maxRounds, onEnd(win,res,hpLeft), onQuit, onClose } */
    run(cfg) { start(cfg); fight(G.Battle.run({ allies: cfg.allies, enemies: cfg.enemies, worldId: cfg.worldId, maxRounds: cfg.maxRounds, allyHitMod: (G.Battle.MECHANICS[cfg.worldId] || {}).allyHitMod || 0 })); },
    fight,
    clear: function () { clearTimer(); B.on = false; B.res = null; B.panel = null; B.cfg = null; },
  };
})();
