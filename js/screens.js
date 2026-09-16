/* 小游戏界面（重做版）：一页一页照网页版 js/ui.js 复刻
   ------------------------------------------------------------------------------
   规矩：结构顺序、文案、颜色、字号、间距，全部照网页版同一页抄；
   数值一律取 CV.C / CV.SP / CV.FS（它们的源头是网页版 css/style.css 的 :root）。
   已复刻：开局三步（欢迎 → 起名 → 选血统）、首页。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const cname = G.cname || ((id) => (id === '@player' ? '主角' : id));
  const PAD = CV.SP[2];            // 14 = 网页版卡片内边距
  const GAP = CV.SP[2];            // 14 = 卡片间距（--sp3）

  /* ---------- 通用块：卡片 ---------- */
  function card(y, h) { CV.card(PAD, y, CV.W - PAD * 2, h); return y + h; }
  /* 区块标题（网页版 .section-title：12px / 字距 1 / 上 18 下 10） */
  function sectionTitle(text) {
    CV.y += 18;
    CV.text(text, PAD + 4, CV.y + 8, { size: CV.FS.md, color: CV.C.text2, bold: true });
    const w = CV.measure(text, CV.FS.md, true);
    CV.ctx.strokeStyle = CV.C.line; CV.ctx.lineWidth = 1;
    CV.ctx.beginPath(); CV.ctx.moveTo(PAD + 4 + w + 10, CV.y + 8); CV.ctx.lineTo(CV.W - PAD - 4, CV.y + 8); CV.ctx.stroke();
    CV.y += 18;
  }
  /* 三列文字宫格（网页版 .text-menu + .tile） */
  function tileGrid(list) {
    const cols = 3, gap = CV.SP[1];
    const cellW = (CV.W - PAD * 2 - gap * (cols - 1)) / cols;
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = PAD + c * (cellW + gap), y = CV.y + r * (54 + gap);
      CV.round(x, y, cellW, 54, 6, CV.C.panel, CV.C.line2);
      CV.text(CV.fit(t[1], cellW - 12, CV.FS.lg, true), x + cellW / 2, y + 22, { size: CV.FS.lg, bold: true, align: 'center' });
      CV.text(CV.fit(t[2] || '', cellW - 12, CV.FS.xs), x + cellW / 2, y + 40, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      if (t[0]) CV.hit(t[0], x, y, cellW, 54);
    });
    CV.y += Math.ceil(list.length / cols) * (54 + gap);
  }
  /* 提示小字（网页版 .hint：11px dim / 行高 1.7） */
  function hint(text) {
    CV.y += 8;
    CV.wrap(text, CV.W - PAD * 2, CV.FS.sm, 4).forEach((ln) => {
      CV.text(ln, PAD, CV.y + 7, { size: CV.FS.sm, color: CV.C.dim });
      CV.y += 17;
    });
  }

  /* ================= 开局 ①：欢迎（网页版 showTutorial 的文案） ================= */
  CV.register('welcome', function () {
    CV.y = 18;
    const blocks = [
      ['欢迎来到灯阁', 15, true],
      ['你被神秘存在选中，成为了「执灯者」。', 13, false],
      ['在这里，你将：', 12, false],
      ['· 进入残域执行探索任务', 12, false],
      ['· 招募伙伴，组建五人小队（主角必上阵）', 12, false],
      ['· 解锁血统与铭刻，突破极限', 12, false],
      ['· 挑战深井，寻找离开的方法', 12, false],
      ['', 6, false],
      ['如果下一场探索真的会死，你会带谁进去？', 13, true],
    ];
    const cardH = 28 + blocks.reduce((s, b) => s + (b[0] ? 20 : 8), 0);
    card(CV.y, cardH);
    let y = CV.y + PAD;
    blocks.forEach((b) => {
      if (!b[0]) { y += 8; return; }
      CV.wrap(b[0], CV.W - PAD * 2 - PAD * 2, b[1], 3).forEach((ln) => {
        CV.text(ln, PAD + PAD, y + 7, { size: b[1], bold: b[2], color: b[2] ? CV.C.text : CV.C.text2 });
        y += 20;
      });
    });
    CV.y += cardH + GAP;
    /* 主按钮：网页版 .btn.primary（实心红渐变） */
    const bw = CV.W - PAD * 2, bh = 44;
    const g = CV.ctx.createLinearGradient(0, CV.y, 0, CV.y + bh);
    g.addColorStop(0, '#c9364a'); g.addColorStop(1, '#97273a');
    CV.round(PAD, CV.y, bw, bh, 7, g, '#e05a6d40');
    CV.text('签订灯阁契约', CV.W / 2, CV.y + bh / 2, { size: CV.FS.lg, bold: true, align: 'center' });
    CV.hit('welcome_ok', PAD, CV.y, bw, bh);
    CV.y += bh;
  });
  CV.on('welcome_ok', () => { CV.reset('create'); });

  /* ================= 开局 ②：起名（网页版 showCharCreate 的文案） ================= */
  const NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];
  let nameIdx = Math.floor(Math.random() * NAMES.length);
  CV.register('create', function () {
    CV.y = 18;
    const h = 96;
    card(CV.y, h);
    CV.text('创建你的执灯者', PAD + PAD, CV.y + 26, { size: CV.FS.f1, bold: true });
    CV.wrap('灯阁需要一个名字来记录你的行程。这个名字将伴随你进入每一个世界。', CV.W - PAD * 4, CV.FS.md, 2)
      .forEach((ln, i) => CV.text(ln, PAD + PAD, CV.y + 48 + i * 18, { size: CV.FS.md, color: CV.C.dim }));
    /* 名字（网页版是输入框；canvas 用"点一下弹键盘自己打"，另给一个 🎲 换一个） */
    CV.round(PAD + PAD, CV.y + 66, CV.W - PAD * 4, 34, CV.RADIUS_SM, CV.C.panel2, CV.C.line2);
    CV.text(NAMES[nameIdx], CV.W / 2, CV.y + 83, { size: CV.FS.f2, bold: true, align: 'center', color: CV.C.gold });
    CV.hit('name_type', PAD + PAD, CV.y + 66, CV.W - PAD * 4, 34);
    CV.y += h + GAP;
    /* 两个按钮：🎲 换一个 / 以这个名字进入残域 */
    const bw = (CV.W - PAD * 2 - 10) / 2, bh = 44;
    CV.round(PAD, CV.y, bw, bh, 7, CV.C.panel2, CV.C.line2);
    CV.text('🎲 换一个', PAD + bw / 2, CV.y + bh / 2, { size: CV.FS.lg, align: 'center', color: CV.C.text2 });
    CV.hit('name_roll', PAD, CV.y, bw, bh);
    const g = CV.ctx.createLinearGradient(0, CV.y, 0, CV.y + bh);
    g.addColorStop(0, '#c9364a'); g.addColorStop(1, '#97273a');
    CV.round(PAD + bw + 10, CV.y, bw, bh, 7, g, '#e05a6d40');
    CV.text('以这个名字进入残域', PAD + bw + 10 + bw / 2, CV.y + bh / 2, { size: CV.FS.lg, bold: true, align: 'center' });
    CV.hit('name_ok', PAD + bw + 10, CV.y, bw, bh);
    CV.y += bh + GAP;
    hint('名字定完紧接着选血统：境界线跟着血统走，所以这一步不能拖到 Lv.10');
  });
  CV.on('name_roll', () => { nameIdx = (nameIdx + 1) % NAMES.length; CV.render(); });
  CV.on('name_type', () => {
    if (!(typeof wx !== 'undefined' && wx.showKeyboard)) { CV.toast('这台设备不支持键盘输入'); return; }
    try {
      if (wx.onKeyboardConfirm) wx.onKeyboardConfirm((res) => {
        const v = String((res && res.value) || '').trim().slice(0, 12);
        if (v) { NAMES[nameIdx] = v; }
        try { wx.hideKeyboard({}); } catch (e) {}
        CV.render();
      });
      wx.showKeyboard({ defaultValue: NAMES[nameIdx], maxLength: 12, multiple: false, confirmType: 'done', fail: () => {} });
    } catch (e) { CV.toast('打开键盘失败'); }
  });
  CV.on('name_ok', () => { Core.setPlayerName(NAMES[nameIdx]); CV.reset('bloodline'); });

  /* ================= 开局 ③：选血统（网页版 bloodlineModal 的文案） ================= */
  CV.register('bloodline', function () {
    CV.y = 18;
    CV.text('选择血统', PAD, CV.y + 8, { size: CV.FS.f1, bold: true });
    CV.y += 18;
    hint('境界线跟着血统走，选定后不可更改。');
    const ids = Object.keys(D.BLOODLINES);
    ids.forEach((id) => {
      const b = D.BLOODLINES[id];
      const h = 62;
      CV.card(PAD, CV.y, CV.W - PAD * 2, h);
      CV.text(b.name || id, PAD + PAD, CV.y + 22, { size: CV.FS.f1, bold: true });
      CV.wrap(b.desc || '', CV.W - PAD * 4, CV.FS.md, 2).forEach((ln, i) => CV.text(ln, PAD + PAD, CV.y + 42 + i * 16, { size: CV.FS.md, color: CV.C.dim }));
      CV.hit('bl:' + id, PAD, CV.y, CV.W - PAD * 2, h);
      CV.y += h + GAP;
    });
  });
  CV.on('bl', () => {});
  Object.keys({}).forEach(() => {});
  CV.on('bl_pick', () => {});

  /* ================= 首页（照网页版 homeScreen 的结构与内容） ================= */
  CV.register('home', function () {
    const S = Core.S, st = Core.realmState(), au = Core.authorityInfo(), sect = Core.sectInfo();
    CV.y = 4;
    /* ① 主角卡：四行文字行（网页版 .card.text-rows，行间虚线） */
    const rows = [
      ['【境界】', st.curName || '未定血统', st.hasBloodline ? ('第 ' + Math.min(st.realm + 1, D.REALM_STAGE_COUNT) + ' / ' + D.REALM_STAGE_COUNT + ' 阶') : '点【主角】卡里选血统'],
      ['【等级】', 'Lv.' + S.player.level, 'EXP ' + Math.floor((S.player.exp / (D.EXP_TABLE[S.player.level] || 1)) * 100) + '%'],
      ['【主角】', '六维待分 ' + (S.player.attrPoints || 0) + ' · 技能待加 ' + (S.player.skillPoints || 0), ''],
      ['【转生】', S.player.reincarnations + ' 世', '权限 Lv.' + au.lv + ' · 评级 Lv.' + sect.lv],
    ];
    const cardH = PAD * 2 + rows.length * 31;
    card(CV.y, cardH);
    rows.forEach((r, i) => {
      const y = CV.y + PAD + i * 31;
      CV.text(r[0], PAD + 14, y + 15, { size: CV.FS.md, color: CV.C.dim });
      const rw = CV.measure(r[1], CV.FS.lg, true);
      const str = CV.fit(r[1], CV.W - PAD * 2 - 28 - 90, CV.FS.lg, true);
      CV.text(str, CV.W - PAD - 14 - rw - (r[2] ? CV.measure(r[2], CV.FS.sm) + 8 : 0), y + 15,
        { size: CV.FS.lg, bold: true, color: (i === 0 && st.hasBloodline) || i === 2 ? CV.C.gold : CV.C.text });
      if (r[2]) CV.text(r[2], CV.W - PAD - 14, y + 15, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      if (i < rows.length - 1) {
        CV.ctx.save();
        CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
        CV.ctx.beginPath(); CV.ctx.moveTo(PAD + 14, y + 30.5); CV.ctx.lineTo(CV.W - PAD - 14, y + 30.5); CV.ctx.stroke();
        CV.ctx.restore();
      }
    });
    CV.hit('open_protag', PAD, CV.y, CV.W - PAD * 2, cardH);
    CV.y += cardH + GAP;

    /* ② 主线卡（网页版 questStrip） */
    const mq = Core.mainQuestState();
    const qi = mq.findIndex((x) => !x.claimed);
    const q = qi < 0 ? null : mq[qi];
    const qh = 72;
    card(CV.y, qh);
    if (q) {
      CV.text('主线 · ' + q.q.name, PAD + 14, CV.y + 24, { size: CV.FS.f1, bold: true });
      const tw = CV.measure('主线 · ' + q.q.name, CV.FS.f1, true);
      CV.round(PAD + 14 + tw + 8, CV.y + 14, CV.measure('第 ' + (qi + 1) + '/' + mq.length + ' 步', CV.FS.sm) + 12, 18, CV.RADIUS_SM, null, CV.C.line2);
      CV.text('第 ' + (qi + 1) + '/' + mq.length + ' 步', PAD + 14 + tw + 14, CV.y + 24, { size: CV.FS.sm, color: CV.C.text2 });
      CV.text('完成奖励：' + Core.rewardTextOf(q.q.reward), PAD + 14, CV.y + 48, { size: CV.FS.sm, color: CV.C.dim });
      const bw = 74, bx = CV.W - PAD - 14 - bw;
      const g2 = CV.ctx.createLinearGradient(0, CV.y + 16, 0, CV.y + 56);
      g2.addColorStop(0, '#c9364a'); g2.addColorStop(1, '#97273a');
      CV.round(bx, CV.y + 16, bw, 40, 7, q.done ? g2 : CV.C.panel2, q.done ? '#e05a6d40' : CV.C.line2);
      CV.text(q.done ? '领取奖励' : '去完成 ›', bx + bw / 2, CV.y + 36, { size: CV.FS.lg, bold: q.done, align: 'center', color: q.done ? CV.C.text : CV.C.text2 });
      CV.hit(q.done ? 'claim_quest' : 'goto_quest', bx, CV.y + 16, bw, 40);
    } else {
      CV.text('主线 · 已走完', PAD + 14, CV.y + 32, { size: CV.FS.f1, bold: true });
    }
    CV.y += qh + GAP;

    /* ③ 养成 + 日常（网页版 tileGrid，未解锁的收成一行灰字） */
    const keji = D.KEJI.reduce((a, k) => a + Core.kejiLv(k.id), 0);
    const bLv = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const growAll = [
      ['open_sect', '灯阁评级', 'Lv.' + sect.lv],
      ['open_keji', '秘术阁', '已修 ' + keji + ' 级'],
      ['open_fabao', '法宝', Core.fabaoState().own.length + '/' + D.FABAO.length + ' 件'],
      ['open_garden', '药园', Core.gardenState().filter((p) => p.plot).length + ' 块在用'],
      ['open_arena', '斗法台', '第 ' + Core.arenaState().floor + ' 台 · 剩 ' + Core.arenaState().left],
      ['open_mount', '坐骑', Core.mountState().own.length + '/' + D.MOUNTS.length + ' 匹'],
      ['open_refine', '炼化台', '装备材料炼血清'],
      ['open_authority', '灯阁权限', 'Lv.' + au.lv + '/' + au.max, 'buildings'],
      ['open_buildings', '基地建设', '合计 Lv.' + bLv, 'buildings'],
      ['open_genelock', '铭刻', S.player.geneLock > 0 ? S.player.geneLock + ' 阶' : '未解锁', 'geneLock'],
      ['open_beast', '伴生体', Object.keys(S.beast.owned || {}).length ? Object.keys(S.beast.owned || {}).length + ' 只' : '未孵化', 'beast'],
      ['open_reincarn', '转生天赋', S.player.reincarnations + ' 世', 'reincarn'],
      ['open_codex', '灯录', Core.codexState().owned + '/' + Core.codexState().total + ' 名', 'recruit'],
    ];
    const openGrow = growAll.filter((x) => !x[3] || Core.isUnlocked(x[3]));
    const lockedGrow = growAll.filter((x) => x[3] && !Core.isUnlocked(x[3])).map((x) => x[1]);
    sectionTitle('养成');
    tileGrid(openGrow);
    if (lockedGrow.length) hint('还没解锁：' + lockedGrow.join(' / '));
    CV.y += 6;
    CV.text('日常', PAD + 2, CV.y + 8, { size: CV.FS.sm, color: CV.C.dim });
    CV.y += 18;
    tileGrid([
      ['open_bounty', '限时悬赏', '按时重置'],
      ['open_tasks', '每日任务', '主线 / 日常 / 周常', 'tasks'],
      ['open_ach', '成就', '长线目标'],
      ['open_sign', '求签', Core.signState().canDraw ? '今日还没求' : '今日【' + Core.signState().tier + '】'],
      ['open_recruit', '招募伙伴', Core.freeRecruitAvailable() ? '今日免费 1 抽' : '攒碎片升星', 'recruit'],
      ['open_shop', '兑换大厅', '三档商店', 'shop'],
    ].filter((x) => !x[3] || Core.isUnlocked(x[3])));
    hint('血统与境界属于主角自身：点上面【主角】那张卡，在里面选血统 / 渡劫。');

    /* ④ 游历 */
    const tv = Core.travelProgress(), pend = Core.pendingTravel();
    sectionTitle('游历');
    const th = 46;
    card(CV.y, th);
    CV.text('【游历奇遇】', PAD + 14, CV.y + th / 2, { size: CV.FS.md, color: pend ? CV.C.gold : CV.C.dim });
    CV.text(pend ? pend.name + '（待领）' : '距下一次 ' + Math.round(Math.max(0, tv.every - tv.sec)) + ' 秒', CV.W - PAD - 14, CV.y + th / 2, { size: CV.FS.lg, bold: true, align: 'right' });
    CV.hit('open_travel', PAD, CV.y, CV.W - PAD * 2, th);
    CV.y += th + GAP;

    /* ⑤ 挂机（网页版 idleBlock：三行 + 两个按钮） */
    const bank = Core.idleBankGains(), rates = Core.idleRates(), lines = Core.idleLines(), t0 = Core.todayState();
    sectionTitle('挂机');
    const ih = 158;
    card(CV.y, ih);
    const dur = G.formatDuration || ((s) => s + '秒');
    CV.text('【挂机】', PAD + 14, CV.y + 24, { size: CV.FS.md, color: CV.C.dim });
    CV.text('◈' + rates.pointsPerMin.toFixed(1) + '/分', PAD + 70, CV.y + 24, { size: CV.FS.f1, bold: true, color: CV.C.gold });
    CV.text('EXP ' + rates.expPerMin.toFixed(1) + '/分 · 离线 ' + Math.round(Core.offlineEfficiency() * 100) + '% · 上限 ' + Core.offlineCapHours().toFixed(1) + 'h',
      PAD + 150, CV.y + 24, { size: CV.FS.sm, color: CV.C.dim });
    CV.text('【已挂】', PAD + 14, CV.y + 54, { size: CV.FS.md, color: CV.C.dim });
    CV.text(dur(bank.seconds), PAD + 70, CV.y + 54, { size: CV.FS.f1, bold: true });
    CV.text('【待领】', CV.W - PAD - 200, CV.y + 54, { size: CV.FS.md, color: CV.C.dim });
    CV.text('◈' + fmt(bank.points) + ' · EXP ' + fmt(bank.exp) + (bank.otherworld ? ' · ◆' + bank.otherworld : '') + (bank.mat ? ' · 材料 ' + bank.mat : ''),
      CV.W - PAD - 14, CV.y + 54, { size: CV.FS.md, color: CV.C.gold, align: 'right' });
    CV.text('【分工】', PAD + 14, CV.y + 82, { size: CV.FS.md, color: CV.C.dim });
    CV.text(CV.fit(lines.map((l) => l.line.name + ' ' + (l.leaderId ? cname(l.leaderId) : '空')).join(' · '), CV.W - PAD * 2 - 100, CV.FS.sm),
      PAD + 70, CV.y + 82, { size: CV.FS.sm, color: CV.C.dim });
    const bw2 = (CV.W - PAD * 2 - 28 - 10) / 2, by = CV.y + 100;
    CV.round(PAD + 14, by, bw2, 42, 7, CV.C.panel2, CV.C.line2);
    CV.text('派人分工', PAD + 14 + bw2 / 2, by + 21, { size: CV.FS.lg, align: 'center', color: CV.C.text2 });
    CV.hit('open_idlelines', PAD + 14, by, bw2, 42);
    const g3 = CV.ctx.createLinearGradient(0, by, 0, by + 42);
    g3.addColorStop(0, '#c9364a'); g3.addColorStop(1, '#97273a');
    CV.round(PAD + 14 + bw2 + 10, by, bw2, 42, 7, g3, '#e05a6d40');
    CV.text('⚡ 一键收取' + (t0.claimable ? '（' + t0.claimable + '）' : ''), PAD + 14 + bw2 + 10 + bw2 / 2, by + 21, { size: CV.FS.lg, bold: true, align: 'center' });
    CV.hit('claim_all', PAD + 14 + bw2 + 10, by, bw2, 42);
    CV.y += ih + GAP;

    /* ⑥ 设置 */
    sectionTitle('设置');
    tileGrid([['open_guide', '玩法指南', '分章图文'], ['open_curdoc', '货币图鉴', '币的用途与来源'], ['open_settings', '设置与存档', '存档 / 音效 / 导出']]);
    CV.y += 10;
  });

  /* ---------- 首页动作 ---------- */
  CV.on('claim_all', () => { const r = Core.claimEverything(); CV.toast(r && r.total ? '已领取' : '暂时没有可领的'); CV.render(); });
  CV.on('goto_quest', () => CV.toast('主线任务：点右侧按钮领取'));
  CV.on('claim_quest', () => { const r = Core.claimMainQuest && Core.claimMainQuest(); CV.toast((r && r.msg) || '已领取'); CV.render(); });
  ['open_protag', 'open_travel', 'open_idlelines', 'open_guide', 'open_curdoc', 'open_settings',
    'open_sect', 'open_keji', 'open_fabao', 'open_garden', 'open_arena', 'open_mount', 'open_refine',
    'open_authority', 'open_buildings', 'open_genelock', 'open_beast', 'open_reincarn', 'open_codex',
    'open_bounty', 'open_tasks', 'open_ach', 'open_sign', 'open_recruit', 'open_shop'].forEach((id) => {
    CV.on(id, () => CV.toast('这个界面康康还没复刻（下一批）'));
  });

  /* 底栏切页 */
  CV.NAV_TABS.forEach((t) => CV.on('tab:' + t.id, () => { CV.cur = t.id; CV.reset(t.id); }));
})();
