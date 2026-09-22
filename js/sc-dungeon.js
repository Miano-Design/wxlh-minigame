/* 残域（副本）—— 照网页版 js/ui.js 的 worldsList / worldDetail / runScreen / sweepModal 复刻
   ------------------------------------------------------------------------------
   结构（V9.5.x）：
     ① 世界列表：继续上次副本（有存档才出现）→ 深井挑战 → 残域（36 个世界卡）
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
  /* bg：格底色。V1.0.1 起由数据层的 D.worldTint(世界id) 给（五族色相 × 族内明度阶梯），
     网页版同一串颜色内联到 .world-ico 上；不传就退回旧底色（转生门那张、以及 ♾ 深井格）。 */
  function worldCard(icon, title, sub, tag, id, dim, bg, theme) {
    const h = 82 * CV.SCALE, top = U.y;      // 网页版 .world-card 实测 82（图标 52 + 上下内边距 14）
    const x = U.pad(), w = U.cw();
    /* 未解锁的世界：整张卡压暗（网页版 .world-card 加了 opacity:.45），不只是标题变灰 */
    if (dim) CV.ctx.globalAlpha = 0.45;
    CV.card(x, top, w, h);
    const box = 52 * CV.SCALE;
    CV.round(x + 12 * CV.SCALE, top + (h - box) / 2, box, box, 12 * CV.SCALE, bg || '#232c42', CV.C.line);
    CV.text(icon, x + 12 * CV.SCALE + box / 2, top + h / 2, { size: CV.DISP.d2, align: 'center' });
    /* 右上角的族形（五族形状语言）：与格底色相构成"色 + 形"双重编码。
       顶点表与网页版同一份（D.FACTION_GLYPH），别在这儿另画一套形状。 */
    const gs = 12 * CV.SCALE;
    if (theme && D.FACTION_GLYPH[theme]) {
      CV.poly(D.FACTION_GLYPH[theme],
        x + 12 * CV.SCALE + box - 3 * CV.SCALE - gs, top + (h - box) / 2 + 3 * CV.SCALE,
        gs, D.worldGlyphColor(theme));
    }
    const tx = x + 12 * CV.SCALE + box + 12 * CV.SCALE;
    const tw = CV.measure(title, CV.FS.f1, true);
    /* V9.6.127（父亲大人："世界名和进度的小字得作为一个整体，去居中对齐前面的图标；
       你现在看文字是偏上的"）：
       网页版是 flex + align-items:center，标题与小字**作为一个整体**自动居中；
       画布这边原来把它们分别钉在 top+24 / top+46，整块的中心在 34 左右、而图标中心在 41 → 偏上 7px。
       现在先算整块高度（标题行 + 2px + 小字行），再以**卡片中线**为中心上下摊开。 */
    const T1 = CV.FS.f1 * 1.3, T2 = CV.FS.sm * 1.55;
    const blockH = T1 + 2 * CV.SCALE + T2;
    const blockTop = top + (h - blockH) / 2;
    const titleCy = blockTop + T1 / 2;
    CV.text(title, tx, titleCy, { size: CV.FS.f1, bold: true });
    if (tag) {
      const tagW = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE;
      CV.round(tx + tw + 8 * CV.SCALE, titleCy - 9 * CV.SCALE, tagW, 18 * CV.SCALE, CV.RADIUS_SM, null, '#2f5b41');
      CV.text(tag, tx + tw + 8 * CV.SCALE + tagW / 2, titleCy, { size: CV.FS.xs, color: CV.C.green, align: 'center' });
    }
    CV.text(CV.fit(sub, w - (tx - x) - 30 * CV.SCALE, CV.FS.sm), tx, blockTop + T1 + 2 * CV.SCALE + T2 / 2,
      { size: CV.FS.sm, color: CV.C.dim });
    CV.text('›', x + w - 14 * CV.SCALE, top + h / 2, { size: CV.FS.f1, color: CV.C.dim, align: 'right' });
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
      /* V9.6.24（父亲大人）：去掉终局挑战标签与历史最高 —— 深井是一直往上打的、没有重置，
         所以历史最高这个概念本身就不成立。 */
      worldCard('♾', '深井', '当前第 ' + S.corridor.floor + ' 层', null, 'open_corridor', false);
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
      worldCard(w.ico || ICON[w.theme] || '⚔', w.name,   // V9.6.127：每个世界自己的图标（data.js），主题图标只兜底
        unlocked ? ('进度 ' + prog + '/12 · ' + String(w.mechanic).split('：')[0]) : '🔒 通关上一世界解锁',
        cleared ? '已通关' : '', 'w:' + w.id, false, D.worldTint(w.id), w.theme);
    });
    /* 转生门：门后那一张要显示出来（跟网页版同一口径）。
       "没解锁的不显示"说的是**还没走到**的世界；转生门是"走到了、过不去"，
       藏起来玩家就不知道下一步在哪 —— 这是 V9.6.76 加的，两边保持一致。 */
    const nextLocked = D.WORLDS.find((w) => !(S.worlds[w.id] && S.worlds[w.id].unlocked));
    const gateNeed = nextLocked ? Core.worldReincarnNeed(nextLocked.id) : 0;
    if (gateNeed) {
      worldCard('🔒', nextLocked.name,
        '需要转生 ' + gateNeed + ' 次才能进入 · 当前 ' + (S.player.reincarnations || 0) + ' 次',
        '', 'w:' + nextLocked.id, true);
    }
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
      /* V1.0.1：头部换成"族色图标格 + 世界名"（和列表页世界卡同一套视觉语言）。
         同一个世界在列表页和详情页必须看到**同一个色、同一个形** ——
         列表页上了色、点进去又变回纯文字，看着像两套界面。
         几何与 worldCard() 里那段一致（52 的格子在这里缩到 40，因为详情页头部比列表矮一档）。 */
      const box = 40 * CV.SCALE, top = U.y, x = U.ix();
      CV.round(x, top, box, box, 10 * CV.SCALE, D.worldTint(w.id), CV.C.line);
      CV.text(w.ico || ICON[w.theme] || '⚔', x + box / 2, top + box / 2,
        { size: CV.DISP.d2, align: 'center' });
      const gs = 11 * CV.SCALE;
      if (D.FACTION_GLYPH[w.theme]) {
        CV.poly(D.FACTION_GLYPH[w.theme], x + box - 3 * CV.SCALE - gs, top + 3 * CV.SCALE,
          gs, D.worldGlyphColor(w.theme));
      }
      CV.text(CV.fit(w.name, U.iw() - box - 12 * CV.SCALE, CV.FS.f1, true),
        x + box + 10 * CV.SCALE, top + box / 2, { size: CV.FS.f1, bold: true, ls: 0.2 });
      U.y = top + box + 10 * CV.SCALE;
      U.note(w.desc, 2 * CV.SCALE);                 // 网页版这一行是 0.75rem（12px）
      U.space(CV.SP[2]);                            // V9.6.122：网页版 .kv mt2 = 10（原来 4，太挤）
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
      U.y = top + h + 12 * CV.SCALE;                // V9.6.122：网页版 .diff-tabs margin-bottom = 12（原来 4）
    }
    // 12 个关卡格（4 列）
    {
      const gap = 8 * CV.SCALE, cols = 4;
      const cw = (U.cw() - gap * (cols - 1)) / cols;
      const top = U.y;
      /* V9.6.70：整片关卡格登记一颗**组锚点** —— 引导要指"这一关"但那一关还没解锁时，
         退而指整片格子（总比弹一张"不知道指哪"的卡强）。 */
      CV.hit('stage_grid', U.pad(), top - 4 * CV.SCALE, U.cw(), cw * 3 + gap * 2 + 8 * CV.SCALE);
      for (let i = 0; i < 12; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const x = U.pad() + c * (cw + gap), y = top + r * (cw + gap);
        const unlocked = Core.stageUnlocked(w.id, diff, i);
        const stars = st ? st.stages[diff][i] : 0;
        const isBoss = i === 11;
        /* V9.6.122（父亲大人："残域的世界排版也有问题"）：照网页版补齐两件事 ——
           ① 精英关右上角要挂 ⚔ 角标（wg 用 wavePlan 判，和网页版同一份数据）；
           ② 格子里字号统一走层级：网页版 .stage-cell 是 **二级 15px**、整格粗体
              （我上一版把守关格写成 20px 反而更偏了）。 */
        const isElite = !isBoss && Dun.wavePlan(i + 1).indexOf('elite') >= 0;
        const done = stars > 0;
        CV.ctx.globalAlpha = unlocked ? 1 : 0.3;
        CV.round(x, y, cw, cw, 10 * CV.SCALE, done ? '#1d2b22' : CV.C.panel2,
          done ? '#2f5b41' : (isBoss ? CV.C.accent : CV.C.line));
        CV.text(isBoss ? '👹' : String(i + 1), x + cw / 2, y + cw / 2 - (stars ? 7 * CV.SCALE : 0),
          { size: CV.FS.f1, bold: true, align: 'center', color: isBoss ? CV.C.accent : CV.C.text });
        if (isElite) CV.text('⚔', x + cw - 5 * CV.SCALE, y + 10 * CV.SCALE,
          { size: CV.FS.xs, align: 'right', color: CV.C.dim });   // .sc-mark：右上角、五级、85% 不透明度
        if (stars) CV.text('★'.repeat(stars), x + cw / 2, y + cw - 14 * CV.SCALE, { size: CV.FS.xs, color: CV.C.gold, align: 'center', ls: -1 });
        CV.ctx.globalAlpha = 1;
        if (unlocked) CV.hit('stage:' + i, x, y, cw, cw);
      }
      U.y = top + 3 * cw + 2 * gap;
    }
    /* V9.6.122：网页版关卡格下面有一行图例（hint mt2）——小游戏这边原来**没有**，
       玩家看不出 ⚔ / 👹 是什么意思。文案照网页版原样。 */
    U.hint('⚔ 精英关（更硬、掉得更好）· 👹 守关 Boss（打完开下一个世界）', 10 * CV.SCALE);
    // 扫荡
    const canSweep = st && st.stages[diff].some((s) => s > 0);
    if (canSweep) {
      U.space(CV.SP[1]);
      const left = Core.sweepLeft();
      U.btnRow([{
        label: '⏩ 扫荡（可选关卡 · 今日剩余 ' + left + '/' + Core.sweepCap() + ' 次）',
        style: 'ghost', id: 'sweep_open', dis: left <= 0,
      }]);
    }
  });

  /* ================= ③ 扫荡（选关卡 + 选次数，照网页版 sweepModal） ================= */
  let sweepSel = 11;
  CV.register('sweep', function () {
    const S = Core.S;
    /* V9.6.70：这一页是从世界页推上来的（view.worldId 一定有值），但**代码不能假设**——
       page_smoke 单独渲染这一页时 view.worldId 是空的，原来直接读 w.id 就崩。
       真机上如果哪天从别处进来，同样会崩；这里给个兜底。 */
    const w = D.WORLDS.find((x) => x.id === view.worldId) || D.WORLDS[0];
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
    /* 奖励胶囊文案照网页版 rewardChips()：货币带图标（◉/◆/❖/▣…）、装备带品质色前缀、道具带 🎒 */
    const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };
    const rewards = (g.got || []).map((x) => {
      if (x.k === 'equip') return '🗡 ' + x.v.name;
      if (x.k === 'exp') return 'EXP+' + x.v;
      if (x.k === 'item') return '🎒 ' + ((D.ITEMS[x.v] || {}).name || x.v) + (x.n > 1 ? '×' + x.n : '');
      return curIcon(x.k) + '+' + x.v;
    });
    if (comp && comp.firstClearReward) Object.keys(comp.firstClearReward).forEach((k) => rewards.push('首通 ' + curIcon(k) + '+' + comp.firstClearReward[k]));
    if (comp && comp.newUnlocks && comp.newUnlocks.length) comp.newUnlocks.forEach((n) => rewards.push('🔓 解锁【' + n + '】'));
    /* 结算页直接给「再来一次 / 下一关」——不用回世界列表再点关，推图节奏不断。
       V9.6.116（父亲大人："每个世界推到第 12 关就不要有自动下一关了，只能返回，
       由玩家自己选择打下一个世界还是同一世界的下一个难度"）：
       第 12 关（守关 Boss）打完 = 这张图走到头了 —— 这里只留「返回世界」，
       连「再来一次」都不给（想重打可以从世界列表再点它）。
       顺带一个好处：结算页没有主按钮，**"自动进下一关"的倒计时也就不会启动**。 */
    const isWorldBoss = si >= 11;
    const nx = isWorldBoss ? null : Core.nextStage(wid, df, si);
    afterSettle = isWorldBoss ? null : { worldId: wid, diff: df, stageIdx: si };
    /* V9.6.128（父亲大人："副本那边我还没试过，还是功能重复的按钮，你再查查"）：
       守关 Boss 那场原来挂了一颗「返回世界」—— 底部那颗「收下奖励并返回」做的就是这件事
       （onClose → CV.reset('world')），两颗按钮同一个功能 → 去掉，只留底部那颗。 */
    const acts = isWorldBoss ? [] : [{ label: '↻ 再来一次', style: 'ghost', id: 'dun_again' }];
    if (nx) {
      const nw = D.WORLDS.find((x) => x.id === nx.worldId);
      afterSettle = { worldId: nx.worldId, diff: nx.diff, stageIdx: nx.stageIdx };
      acts.push({ label: '› 下一关（' + (nw ? nw.name : nx.worldId) + ' ' + (nx.stageIdx + 1) + '/12）', style: 'primary', id: 'dun_next' });
    }
    run = null;
    /* V9.6.69（资料 §4「让玩家觉得自己成功」）：首通给一次**看得见**的庆祝 ——
       只加表现、不加资源；"人生第一次通关"那一次更明显，而且只放一次（落盘）。 */
    const firstClear = !!(comp && comp.firstClearReward);
    if (firstClear) {
      const firstEver = !S.celebratedFirst;
      if (firstEver) { S.celebratedFirst = true; Core.save(); }
      setTimeout(function () { CV.toast(firstEver ? '🎉 第一次通关！干得漂亮' : '🎉 首通！'); }, 320);
    }
    return { title: '★'.repeat(stars) + ' 通关', sub: '第 ' + stage + ' 关已通过' + (firstClear ? ' · 🎉 首通' : ''), rewards, acts, worldId: wid };
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
            /* V9.6.123（父亲大人："波间那个继续推进的提示，看着像要点击；
               换成第几波的弹幕，飘过去然后消失"）：文案给"即将开始的第 N 波"。 */
            /* V9.6.125（父亲大人："直接试第 12 关，每一波都是第 3/3 波，第二波第三波要对应上"）：
               这里 run.wave **已经 ++ 过**，它就是"即将打的那一波"（0 基）→ 显示要 +1。
               上一版照抄了网页版的 +2（网页版的 ++ 发生在 afterWave 里、晚一拍），再被上限一夹 → 每波都 3/3。
               两边公式**天生差 1**，注释写清别再互抄。两面都在 battle_flow_audit 里有断言。 */
            title: '本波通过', sub: '第 ' + (run.wave + 1) + '/' + run.waves.length + ' 波', rewards: [], acts: [], seamless: true,
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
      /* 转生门后的世界也会出现在列表里（V9.6.76，见世界列表那段）——点它要说清门槛，
         不能"点了跳进去"，也不能点了没反应（父亲大人对死键零容忍）。 */
      const st = Core.S.worlds[w.id];
      if (!st || !st.unlocked) {
        const need = Core.worldReincarnNeed(w.id);
        const has = Core.S.player.reincarnations || 0;
        CV.toast(need > 0 ? ('🔒 需要转生 ' + need + ' 次才能进入（当前 ' + has + ' 次）') : '🔒 通关上一世界后解锁');
        return;
      }
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
