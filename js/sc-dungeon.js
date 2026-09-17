/* 残域（副本）—— 照网页版 js/ui.js 的 worldsList / worldDetail / runScreen / sweepModal 复刻
   ------------------------------------------------------------------------------
   结构（V9.5.x）：
     ① 世界列表：继续上次副本（有存档才出现）→ 深井挑战 → 残域（20 个世界卡）
     ② 世界详情：返回 → 世界卡（描述 / 世界机制 / 守关Boss）→ 难度页签 → 12 个关卡格 → 扫荡
     ③ 点关卡格直接开打（一关一口气打到底，波与波之间不弹结算页）
   数值与判定一律走网页版 Core / Dungeon —— 这里只负责摆位置与画。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA, Dun = G.Dungeon, BattleUI = G.BattleUI;
  const ICON = { bio: '🧟', ghost: '👻', mystic: '🏺', tech: '🛰', god: '👁' };
  const DIFF_NAME = { normal: '普通', hard: '困难', hell: '地狱' };

  let view = { worldId: null, diff: 'normal' };
  let run = null;              // 进行中的关卡（与网页版同结构，落盘用）

  /* ---------- 世界卡（网页版 .world-card：图标 52 / 标题 / 小字 / 右箭头） ---------- */
  function worldCard(icon, title, sub, tag, id, dim) {
    const h = 82 * CV.SCALE, top = U.y;      // 网页版 .world-card 实测 82（图标 52 + 上下内边距 14）
    const x = U.pad(), w = U.cw();
    /* 未解锁的世界：整张卡压暗（网页版 .world-card 加了 opacity:.45），不只是标题变灰 */
    if (dim) CV.ctx.globalAlpha = 0.45;
    CV.card(x, top, w, h);
    const box = 52 * CV.SCALE;
    CV.round(x + 12 * CV.SCALE, top + (h - box) / 2, box, box, 12 * CV.SCALE, '#232c42', CV.C.line);
    CV.text(icon, x + 12 * CV.SCALE + box / 2, top + h / 2, { size: 24, align: 'center' });
    const tx = x + 12 * CV.SCALE + box + 12 * CV.SCALE;
    const tw = CV.measure(title, CV.FS.f1, true);
    CV.text(title, tx, top + 24 * CV.SCALE, { size: CV.FS.f1, bold: true });
    if (tag) {
      const tagW = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE;
      CV.round(tx + tw + 8 * CV.SCALE, top + 15 * CV.SCALE, tagW, 18 * CV.SCALE, CV.RADIUS_SM, null, '#2f5b41');
      CV.text(tag, tx + tw + 8 * CV.SCALE + tagW / 2, top + 24 * CV.SCALE, { size: CV.FS.xs, color: CV.C.green, align: 'center' });
    }
    CV.text(CV.fit(sub, w - (tx - x) - 30 * CV.SCALE, CV.FS.sm), tx, top + 46 * CV.SCALE,
      { size: CV.FS.sm, color: CV.C.dim });
    CV.text('›', x + w - 14 * CV.SCALE, top + h / 2, { size: 16, color: CV.C.dim, align: 'right' });
    if (dim) CV.ctx.globalAlpha = 1;
    if (id) CV.hit(id, x, top, w, h);
    U.y = top + h + CV.SP[2];          // 网页版 .card 的 margin-bottom = sp3(14)
    return h;
  }

  /* ================= ① 世界列表 ================= */
  CV.register('dungeon', function () {
    const S = Core.S;
    U.begin();
    /* 继续上次副本（只有存档里有未打完的进度才画，和网页版一致） */
    const pr = S.pendingRun;
    if (pr && pr.worldId && pr.waves) {
      const w = D.WORLDS.find((x) => x.id === pr.worldId);
      U.card(function () {
        U.h3('继续上次副本', (w ? w.name : pr.worldId) + ' · 第 ' + pr.stage + '/12 关 · 第 ' +
          Math.min((pr.wave || 0) + 1, (pr.waves || [1]).length) + '/' + (pr.waves || [1]).length + ' 波');
        U.space(CV.SP[1]);
        U.btnRow([
          { label: '继续探索', style: 'primary', id: 'dun_resume' },
          { label: '放弃这一轮', style: 'ghost', id: 'dun_drop' },
        ]);
      });
    }
    /* 深井挑战：同样"没解锁就不显示"（父亲大人：还没解锁的地图先隐藏，解锁了再出现） */
    const corridorLocked = !Core.isUnlocked('corridor');
    if (!corridorLocked) {
      U.sectionTitle('深井挑战');
      worldCard('♾', '深井', '当前第 ' + S.corridor.floor + ' 层 · 历史最高 ' + S.corridor.best + ' 层',
        '终局挑战', 'open_corridor', false);
    }
    /* 残域：**只列已解锁的世界**（V9.6.2 父亲大人："还没解锁的地图就别显示，等解锁了再显示"）——
       以前把 20 个全列出来、未解锁的压暗加锁，一屏全是"🔒 通关上一世界解锁"，既没用又碍眼。 */
    const worldList = D.WORLDS.filter((w) => S.worlds[w.id] && S.worlds[w.id].unlocked);
    U.sectionTitle('残域（' + worldList.length + '/' + D.WORLDS.length + '）');
    worldList.forEach((w) => {
      const st = S.worlds[w.id];
      const unlocked = true;
      const cleared = st.stages.normal.every((s) => s > 0);
      const prog = st.stages.normal.filter((s) => s > 0).length;
      worldCard(ICON[w.theme] || '⚔', w.name,
        unlocked ? ('进度 ' + prog + '/12 · ' + String(w.mechanic).split('：')[0]) : '🔒 通关上一世界解锁',
        cleared ? '已通关' : '', 'w:' + w.id, false);
    });
  });

  /* ================= ② 世界详情 ================= */
  CV.register('world', function () {
    const S = Core.S;
    const w = D.WORLDS.find((x) => x.id === view.worldId);
    if (!w) { U.begin(); U.card(function () { U.h3('残域'); U.hint('这个世界不存在', 6 * CV.SCALE); }); return; }
    const st = S.worlds[w.id];
    const diff = view.diff;
    U.begin();
    // 返回世界列表
    const backTxt = '‹ 返回世界列表';
    const bw = CV.measure(backTxt, CV.FS.md) + 26 * CV.SCALE;      // .btn.small：左右 13px
    U.btn(U.pad(), U.y, bw, U.BTN_SM * CV.SCALE, backTxt, 'ghost', 'dun_back');
    U.space(U.BTN_SM * CV.SCALE + CV.SP[2]);                       // 按钮下 14（.btn margin-bottom）
    // 世界卡
    U.card(function () {
      U.h3(ICON[w.theme] + ' ' + w.name);
      U.note(w.desc, 2 * CV.SCALE);                 // 网页版这一行是 0.75rem（12px）
      U.space(CV.SP[1]);
      U.kv('世界机制', w.mechanic, CV.C.accent);     // 整句照抄，别只留冒号前半截
      U.kv('守关Boss', w.boss);
    });
    // 难度页签
    const tabs = D.DIFFICULTY.map((d) => ({
      label: d.name + (d.id !== 'normal' ? ' ×' + d.mult : ''),
      style: diff === d.id ? 'primary' : 'ghost',
      id: 'diff:' + d.id,
      disabled: d.id !== 'normal' && !Core.worldCleared(w.id, d.id === 'hard' ? 'normal' : 'hard'),
    }));
    {
      const gap = 6 * CV.SCALE, h = U.BTN_SM * CV.SCALE;
      const cw = (U.cw() - gap * (tabs.length - 1)) / tabs.length;
      const top = U.y;
      tabs.forEach((t, i) => {
        const x = U.pad() + i * (cw + gap);
        if (!t.disabled) U.btn(x, top, cw, h, t.label, t.style, t.id);
        else {
          CV.round(x, top, cw, h, CV.RADIUS_SM, null, CV.C.line);
          CV.ctx.globalAlpha = 0.35;
          CV.text(CV.fit(t.label, cw - 8, CV.FS.lg), x + cw / 2, top + h / 2, { size: CV.FS.lg, align: 'center', color: CV.C.dim });
          CV.ctx.globalAlpha = 1;
        }
      });
      U.y = top + h + CV.SP[1];
    }
    // 12 个关卡格（4 列）
    {
      const gap = 8 * CV.SCALE, cols = 4;
      const cw = (U.cw() - gap * (cols - 1)) / cols;
      const top = U.y;
      for (let i = 0; i < 12; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const x = U.pad() + c * (cw + gap), y = top + r * (cw + gap);
        const unlocked = Core.stageUnlocked(w.id, diff, i);
        const stars = st ? st.stages[diff][i] : 0;
        const isBoss = i === 11;
        const done = stars > 0;
        CV.ctx.globalAlpha = unlocked ? 1 : 0.3;
        CV.round(x, y, cw, cw, 10 * CV.SCALE, done ? '#1d2b22' : CV.C.panel2,
          done ? '#2f5b41' : (isBoss ? CV.C.accent : CV.C.line));
        CV.text(isBoss ? '👹' : String(i + 1), x + cw / 2, y + cw / 2 - (stars ? 7 * CV.SCALE : 0),
          { size: isBoss ? 16 : 14 * CV.SCALE, bold: !isBoss, align: 'center', color: isBoss ? CV.C.accent : CV.C.text });
        if (stars) CV.text('★'.repeat(stars), x + cw / 2, y + cw - 14 * CV.SCALE, { size: CV.FS.xs, color: CV.C.gold, align: 'center', ls: -1 });
        CV.ctx.globalAlpha = 1;
        if (unlocked) CV.hit('stage:' + i, x, y, cw, cw);
      }
      U.y = top + 3 * cw + 2 * gap;
    }
    // 扫荡
    const canSweep = st && st.stages[diff].some((s) => s > 0);
    if (canSweep) {
      U.space(CV.SP[1]);
      const left = Core.sweepLeft();
      U.btnRow([{
        label: '⏩ 扫荡（可选关卡 · 今日剩余 ' + left + '/' + Core.sweepCap() + ' 次）',
        style: left > 0 ? 'ghost' : 'ghost', id: left > 0 ? 'sweep_open' : '',
      }]);
    }
  });

  /* ================= ③ 扫荡（选关卡 + 选次数，照网页版 sweepModal） ================= */
  let sweepSel = 11;
  CV.register('sweep', function () {
    const S = Core.S;
    const w = D.WORLDS.find((x) => x.id === view.worldId);
    const diff = view.diff;
    const arr = (S.worlds[w.id] && S.worlds[w.id].stages[diff]) || [];
    const cleared = arr.map((s, i) => ({ s, i })).filter((x) => x.s > 0);
    U.begin();
    U.btn(U.pad(), U.y, CV.measure('‹ 返回', CV.FS.md) + 26 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹ 返回', 'ghost', 'sweep_back');
    U.space(U.BTN_SM * CV.SCALE + CV.SP[2]);
    U.card(function () {
      U.h3('扫荡', w.name + ' · ' + DIFF_NAME[diff]);
      U.kv('今日剩余次数', Core.sweepLeft() + ' / ' + Core.sweepCap());
      U.space(CV.SP[1]);
      U.hint('选择扫荡关卡（已通关的）', 2 * CV.SCALE);
      const gap = 8 * CV.SCALE, cols = 4;
      const cw = (U.cw() - gap * (cols - 1)) / cols;
      const top = U.y + 4 * CV.SCALE;
      cleared.forEach((x, k) => {
        const r = Math.floor(k / cols), c = k % cols;
        const bx = U.pad() + c * (cw + gap), by = top + r * (cw + gap);
        const sel = x.i === sweepSel;
        CV.ctx.globalAlpha = 1;
        CV.round(bx, by, cw, cw, 10 * CV.SCALE, sel ? '#1d2b22' : CV.C.panel2, sel ? CV.C.gold : CV.C.line);
        CV.text(String(x.i + 1), bx + cw / 2, by + cw / 2 - 6 * CV.SCALE, { size: CV.FS.f1, bold: true, align: 'center', color: sel ? CV.C.gold : CV.C.text });
        CV.text('★'.repeat(x.s), bx + cw / 2, by + cw - 13 * CV.SCALE, { size: CV.FS.xs, color: CV.C.gold, align: 'center', ls: -1 });
        CV.hit('ssel:' + x.i, bx, by, cw, cw);
      });
      const rows = Math.ceil(cleared.length / cols);
      U.y = top + rows * cw + (rows - 1) * gap;
      U.space(CV.SP[1]);
      U.space(CV.SP[2]);
      U.btnRow([
        { label: '扫荡 ×1', style: 'ghost', id: 'sweep_1' },
        { label: '扫荡 ×5', style: 'ghost', id: 'sweep_5' },
        { label: '扫荡 ×10', style: 'ghost', id: 'sweep_10' },
        { label: '全部剩余', style: 'primary', id: 'sweep_all' },
      ], 6 * CV.SCALE);
    });
  });

  /* ================= ④ 一关一口气打到底（照网页版 startRun / fightWave） ================= */
  function startStage(worldId, diff, stageIdx) {
    const S = Core.S;
    const stage = stageIdx + 1;
    run = {
      worldId, diff, stage, stageIdx,
      waves: Dun.wavePlan(stage), wave: 0, hpPct: {}, kills: 0, deaths: 0,
    };
    S.party.filter(Boolean).forEach((id) => { run.hpPct[id] = 1; });
    Core.setPendingRun(run);
    fightWave();
  }

  let afterSettle = null;        // 结算后「再来一次 / 下一关」的目标（照网页版 nextStage）
  function settleRun(res, hpLeft) {
    const S = Core.S;
    const wid = run.worldId, df = run.diff, si = run.stageIdx, stage = run.stage;
    const kind = run.waves[run.waves.length - 1];
    const isBoss = kind === 'boss';
    /* 奖励与统计口径**逐条对齐网页版 doFinalBattle**（经验 ×2 进伙伴池、玩家吃一半、battleSettle 计一场） */
    const g = Dun.grantRewards(wid, df, stage, kind);
    Core.addCharExp(S.party.filter(Boolean), g.rewards.exp * 2);
    Core.addPlayerBattleExp(g.rewards.exp);
    Core.battleSettle({}, true, isBoss);
    /* 星级：1 星保底；整关无人阵亡 +1；决战回合 ≤20 再 +1 */
    const anyDead = (run.deaths || 0) > 0 || Object.keys(hpLeft || {}).some((k) => hpLeft[k] <= 0);
    const stars = 1 + (anyDead ? 0 : 1) + (res.rounds <= 20 ? 1 : 0);
    const comp = Core.stageComplete(wid, df, si, stars);
    Core.clearPendingRun();
    /* 奖励胶囊文案照网页版 rewardChips()：货币带图标（◈/◆/❖/▣…）、装备带品质色前缀、道具带 🎒 */
    const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };
    const rewards = (g.got || []).map((x) => {
      if (x.k === 'equip') return '🗡 ' + x.v.name;
      if (x.k === 'exp') return 'EXP+' + x.v;
      if (x.k === 'item') return '🎒 ' + ((D.ITEMS[x.v] || {}).name || x.v) + (x.n > 1 ? '×' + x.n : '');
      return curIcon(x.k) + '+' + x.v;
    });
    if (comp && comp.firstClearReward) Object.keys(comp.firstClearReward).forEach((k) => rewards.push('首通 ' + curIcon(k) + '+' + comp.firstClearReward[k]));
    if (comp && comp.newUnlocks && comp.newUnlocks.length) comp.newUnlocks.forEach((n) => rewards.push('🔓 解锁【' + n + '】'));
    /* 结算页直接给「再来一次 / 下一关」——不用回世界列表再点关，推图节奏不断 */
    const nx = Core.nextStage(wid, df, si);
    afterSettle = { worldId: wid, diff: df, stageIdx: si };
    const acts = [{ label: '↻ 再来一次', style: 'ghost', id: 'dun_again' }];
    if (nx) {
      const nw = D.WORLDS.find((x) => x.id === nx.worldId);
      afterSettle = { worldId: nx.worldId, diff: nx.diff, stageIdx: nx.stageIdx };
      acts.push({ label: '› 下一关（' + (nw ? nw.name : nx.worldId) + ' ' + (nx.stageIdx + 1) + '/12）', style: 'primary', id: 'dun_next' });
    }
    run = null;
    return { title: '★'.repeat(stars) + ' 通关', sub: '第 ' + stage + ' 关已通过', rewards, acts, worldId: wid };
  }

  function fightWave() {
    if (!run) return;
    const kind = run.waves[run.wave];
    const w = D.WORLDS.find((x) => x.id === run.worldId);
    const allies = BattleUI.buildAllies(run.hpPct, null);
    if (!allies.length) { Core.clearPendingRun(); run = null; CV.reset('dungeon'); CV.toast('全队重伤，探索失败'); return; }
    const enemies = Dun.makeEnemies(run.worldId, run.diff, run.stage, kind);
    const isBoss = kind === 'boss';
    const WAVE_NAME = { combat: '遭遇战', elite: '精英伏击', boss: '守关之战' };
    BattleUI.run({
      title: w.name + ' 第 ' + run.stage + '/12 关 · 第 ' + (run.wave + 1) + '/' + run.waves.length + ' 波 · ' + (WAVE_NAME[kind] || '遭遇战'),
      allies, enemies, worldId: run.worldId,
      maxRounds: isBoss ? 50 : 30,
      onQuit() { Core.clearPendingRun(); run = null; CV.reset('dungeon'); },
      onClose() { CV.reset('world'); },
      onEnd(win, res, hpLeft) {
        Object.keys(hpLeft || {}).forEach((k) => { if (run) run.hpPct[k] = hpLeft[k]; });
        if (!win) {
          const wid = w.id;
          run = null;
          Core.clearPendingRun();
          view.worldId = wid;
          return { title: '战斗失败', sub: '再接再厉，先练练队伍', rewards: [], acts: [{ label: '返回世界', style: 'ghost', id: 'battle_close' }] };
        }
        const isLast = run && run.wave === run.waves.length - 1;
        if (!isLast) {
          run.wave++;
          Core.setPendingRun(run);
          return {
            title: '本波通过', sub: '继续推进…', rewards: [], acts: [], seamless: true,
            after() { fightWave(); },
          };
        }
        return settleRun(res, hpLeft);
      },
    });
  }

  /* ================= 事件 ================= */
  CV.on('w:W01', function () {});      // 具体世界在下面统一绑定
  D.WORLDS.forEach(function (w) {
    CV.on('w:' + w.id, function () {
      view.worldId = w.id; view.diff = 'normal';
      CV.push('world');
    });
  });
  CV.on('dun_back', function () { CV.pop(); });
  ['normal', 'hard', 'hell'].forEach(function (df) {
    CV.on('diff:' + df, function () { view.diff = df; CV.render(); });
  });
  for (let i = 0; i < 12; i++) {
    CV.on('stage:' + i, function () {
      if (!Core.stageUnlocked(view.worldId, view.diff, i)) { CV.toast('先通关前面的关卡'); return; }
      startStage(view.worldId, view.diff, i);
    });
  }
  CV.on('sweep_open', function () {
    const arr = (Core.S.worlds[view.worldId] && Core.S.worlds[view.worldId].stages[view.diff]) || [];
    const done = arr.map((s, i) => ({ s, i })).filter((x) => x.s > 0);
    sweepSel = done.length ? done[done.length - 1].i : 0;
    CV.push('sweep');
  });
  CV.on('sweep_back', function () { CV.pop(); });
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(function (i) {
    CV.on('ssel:' + i, function () { sweepSel = i; CV.render(); });
  });
  function doSweep(times) {
    const n = times <= 0 ? Core.sweepLeft() : times;
    if (n <= 0) { CV.toast('今日扫荡次数已用完'); return; }
    const r = Dun.sweep(view.worldId, view.diff, sweepSel + 1, n);
    if (!r.ok) { CV.toast(r.msg || '扫荡失败'); return; }
    const agg = {};
    r.total.forEach(function (t) {
      t.got.forEach(function (g) {
        if (g.k === 'equip') agg._eq = (agg._eq || 0) + 1;
        else if (g.k === 'item') agg._it = (agg._it || 0) + (g.n || 1);
        else agg[g.k] = (agg[g.k] || 0) + g.v;
      });
    });
    const parts = [];
    Object.keys(agg).forEach(function (k) {
      if (k === '_eq') parts.push('🗡装备×' + agg[k]);
      else if (k === '_it') parts.push('🎒道具×' + agg[k]);
      else if (k === 'exp') parts.push('EXP+' + agg[k]);
      else parts.push(k + '+' + agg[k]);
    });
    CV.toast('扫荡 ' + r.count + ' 次：' + (parts.join(' · ') || '无掉落'));
    CV.render();
  }
  CV.on('sweep_1', function () { doSweep(1); });
  CV.on('sweep_5', function () { doSweep(5); });
  CV.on('sweep_10', function () { doSweep(10); });
  CV.on('sweep_all', function () { doSweep(0); });
  CV.on('dun_resume', function () {
    const pr = Core.S.pendingRun;
    if (!pr || !pr.waves) { CV.toast('没有可继续的副本'); return; }
    run = pr;
    view.worldId = pr.worldId; view.diff = pr.diff || 'normal';
    CV.toast('已继续上次的副本');
    fightWave();
  });
  CV.on('dun_drop', function () {
    U.confirm('放弃这一轮', '确定放弃上次没打完的副本？已获得的奖励保留。', function () {
      Core.clearPendingRun(); run = null; CV.render();
    });
  });
  CV.on('dun_again', function () {
    const t = afterSettle; afterSettle = null; BattleUI.clear();
    if (t) { view.worldId = t.worldId; view.diff = t.diff; startStage(t.worldId, t.diff, t.stageIdx); }
    else CV.reset('world');
  });
  CV.on('dun_next', function () {
    const t = afterSettle; afterSettle = null; BattleUI.clear();
    if (t) { view.worldId = t.worldId; view.diff = t.diff; startStage(t.worldId, t.diff, t.stageIdx); }
    else CV.reset('world');
  });
  CV.on('open_corridor', function () { CV.push('corridor'); });   // 深井页（sc-last.js）
})();
