/* 灯阁（首页）—— 照网页版 js/ui.js 的 homeScreen() 一段一段抄
   ------------------------------------------------------------------------------
   网页版顺序（V9.5.x 定死）：主角卡 → 主线 → 养成（含日常）→ 游历 → 挂机 → 设置。
   两条规矩照抄：① 同一个功能在首页只出现一次；② 提示都写在界面上，不靠悬停。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));

  CV.register('home', function () {
    const S = Core.S;
    U.begin();

    /* ① 主角卡 .card.text-rows：四行【标签】值，行间虚线；整块都能点进角色页 */
    const st = Core.realmState(), au = Core.authorityInfo(), sect = Core.sectInfo();
    const rows = [
      ['【境界】', st.curName || '未定血统', st.hasBloodline ? ('已突破 ' + st.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶') : ''],
      ['【等级】', 'Lv.' + S.player.level, 'EXP ' + Math.floor((S.player.exp / (D.EXP_TABLE[S.player.level] || 1)) * 100) + '%'],
      ['【主角】', '六维待分 ' + (S.player.attrPoints || 0) + ' · 技能待加 ' + (S.player.skillPoints || 0), ''],
      ['【转生】', S.player.reincarnations + ' 世', '权限 Lv.' + au.lv + ' · 评级 Lv.' + sect.lv],
    ];
    const cardH = U.card(function () {
      const rowH = 31 * CV.SCALE;
      const top = U.y;
      rows.forEach(function (r, i) {
        const cy = top + rowH * i + rowH / 2;
        CV.text(r[0], U.pad(), cy, { size: CV.FS.md, color: CV.C.dim });
        const vw = CV.measure(r[1], CV.FS.lg, true);
        const sw = r[2] ? CV.measure(r[2], CV.FS.sm) + 8 * CV.SCALE : 0;
        CV.text(CV.fit(r[1], U.cw() - 28 * CV.SCALE - sw, CV.FS.lg, true), U.pad() + U.cw() - 14 * CV.SCALE - vw - sw, cy,
          { size: CV.FS.lg, bold: true, color: (i === 0 && st.hasBloodline) || i === 2 ? CV.C.gold : CV.C.text });
        if (r[2]) CV.text(r[2], U.pad() + U.cw() - 14 * CV.SCALE, cy, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
        if (i < rows.length - 1) {
          CV.ctx.save();
          CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
          CV.ctx.beginPath(); CV.ctx.moveTo(U.pad(), top + rowH * (i + 1) - .5); CV.ctx.lineTo(U.pad() + U.cw(), top + rowH * (i + 1) - .5); CV.ctx.stroke();
          CV.ctx.restore();
        }
      });
      U.y = top + rowH * rows.length;
    });
    CV.hit('open_protag', U.pad(), U.y - cardH - CV.SP[2], U.cw(), cardH);

    /* ② 主线卡（网页版 questStrip） */
    const mq = Core.mainQuestState();
    const qi = mq.findIndex((x) => !x.claimed);
    const q = qi < 0 ? null : mq[qi];
    U.card(function () {
      const h = 72 * CV.SCALE, top = U.y;
      if (q) {
        const bw = 74 * CV.SCALE, bx = U.pad() + U.cw() - bw;
        CV.text(CV.fit('主线 · ' + q.q.name, U.cw() - bw - 16 * CV.SCALE, CV.FS.f1, true), U.pad(), top + 24 * CV.SCALE, { size: CV.FS.f1, bold: true });
        const tw = CV.measure('主线 · ' + q.q.name, CV.FS.f1, true);
        const tag = '第 ' + (qi + 1) + '/' + mq.length + ' 步';
        const tagW = CV.measure(tag, CV.FS.sm) + 14 * CV.SCALE;
        CV.round(U.pad() + tw + 8 * CV.SCALE, top + 14 * CV.SCALE, tagW, 18 * CV.SCALE, CV.RADIUS_SM, null, CV.C.line2);
        CV.text(tag, U.pad() + tw + 8 * CV.SCALE + tagW / 2, top + 23 * CV.SCALE, { size: CV.FS.sm, color: CV.C.text2, align: 'center' });
        CV.text('完成奖励：' + Core.rewardTextOf(q.q.reward), U.pad(), top + 48 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        U.btn(bx, top + 16 * CV.SCALE, bw, 40 * CV.SCALE, q.done ? '领取奖励' : '去完成 ›', q.done ? 'primary' : 'ghost', q.done ? 'claim_quest' : 'goto_quest');
      } else {
        CV.text('主线 · 已走完', U.pad(), top + 32 * CV.SCALE, { size: CV.FS.f1, bold: true });
        CV.text('挑战更高难度与深井', U.pad(), top + 52 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      }
      U.y = top + h;
    });

    /* ③ 养成（网页版 growBlock）：一条线一个入口 + 未解锁的收成一行灰字 */
    const keji = D.KEJI.reduce((a, k) => a + Core.kejiLv(k.id), 0);
    const bLv = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const arena = Core.arenaState(), signSt = Core.signState();
    const growAll = [
      ['open_party', '队伍', S.party.filter(Boolean).length + ' 人上阵'],
      ['open_grow', '成长', '六条养成线总览'],
      ['open_sect', '灯阁评级', 'Lv.' + sect.lv],
      ['open_keji', '秘术阁', keji + ' 级'],
      ['open_fabao', '法宝', Core.fabaoState().own.length ? Core.fabaoState().own.length + '/' + D.FABAO.length + ' 件' : '去挑一件'],
      ['open_garden', '药园', Core.gardenState().filter((p) => p.plot).length + ' 块在用'],
      ['open_arena', '斗法台', '第 ' + arena.floor + ' 台 · 剩 ' + arena.left + ' 次'],
      ['open_mount', '坐骑', Core.mountState().own.length ? Core.mountState().own.length + '/' + D.MOUNTS.length + ' 匹' : '去驯一匹'],
      ['open_refine', '炼化台', '装备材料炼血清'],
      ['open_authority', '灯阁权限', 'Lv.' + au.lv + '/' + au.max, 'buildings'],
      ['open_buildings', '基地建设', '合计 Lv.' + bLv, 'buildings'],
      ['open_genelock', '铭刻', S.player.geneLock > 0 ? S.player.geneLock + ' 阶' : '未解锁', 'geneLock'],
      ['open_beast', '伴生体', Object.keys(S.beast.owned || {}).length ? Object.keys(S.beast.owned || {}).length + ' 只' : '未孵化', 'beast'],
      ['open_reincarn', '转生天赋', S.player.reincarnations + ' 世', 'reincarn'],
      ['open_codex', '灯录', Core.codexState().owned + '/' + Core.codexState().total + ' 名', 'recruit'],
    ];
    U.sectionTitle('养成');
    U.tiles(growAll.filter((x) => !x[3] || Core.isUnlocked(x[3])));
    const locked = growAll.filter((x) => x[3] && !Core.isUnlocked(x[3])).map((x) => x[1]);
    if (locked.length) { U.space(CV.SP[1]); U.hint('还没解锁：' + locked.join(' / ')); }
    /* 日常（网页版 .grid-title「日常」+ 六格） */
    U.space(CV.SP[2]);
    U.y += 16 * CV.SCALE;
    CV.text('日常', U.pad() + 2, U.y - 8 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
    U.tiles([
      ['open_bounty', '限时悬赏', '按时重置'],
      ['open_tasks', '每日任务', '主线 / 日常 / 周常', 'tasks'],
      ['open_ach', '成就', '长线目标'],
      ['open_sign', '求签', signSt.canDraw ? '今日还没求' : '今日【' + signSt.tier + '】'],
      ['open_recruit', '招募伙伴', (function () {
        const up = D.recruitUpChar();
        return up ? '本期 UP：' + up.name + ' · ' + up.faction : '去招募伙伴';
      })(), 'recruit'],
      ['open_shop', '兑换大厅', '三档商店', 'shop'],
    ].filter((x) => !x[3] || Core.isUnlocked(x[3])));
    U.space(CV.SP[2]);
    U.hint('全部养成线的总览在「执灯者 → 成长」。');

    /* ④ 游历（网页版 travelBlock：只有一个「游历奇遇」条） */
    U.sectionTitle('游历');
    const prog = Core.travelProgress(), pend = Core.pendingTravel();
    U.card(function () {
      const h = 44 * CV.SCALE, top = U.y, cy = top + h / 2;
      CV.text('【游历奇遇】', U.pad(), cy, { size: CV.FS.md, color: pend ? CV.C.gold : CV.C.dim });
      if (pend) {
        CV.text(pend.name, U.pad() + U.cw(), cy, { size: CV.FS.md, color: CV.C.gold, align: 'right' });
        CV.hit('claim_travel', U.pad(), top, U.cw(), h);
      } else {
        CV.text('距下一次 ' + Math.round(Math.max(0, prog.every - prog.sec)) + ' 秒', U.pad() + U.cw(), cy, { size: CV.FS.md, color: CV.C.dim, align: 'right' });
        CV.hit('open_travel', U.pad(), top, U.cw(), h);
      }
      U.y = top + h;
    });

    /* ⑤ 挂机（网页版 idleBlock：三行 + 两个按钮；V9.5.27/28：整块灰字、按钮叫"收取奖励"） */
    U.sectionTitle('挂机');
    const r0 = Core.idleRates(), bank = Core.idleBankGains(), lines = Core.idleLines();
    U.card(function () {
      const lh = 26 * CV.SCALE, top = U.y;
      const dim = CV.C.dim, txt = CV.C.dim;             // V9.5.28：这一块全部灰字
      // 行 1：挂机速率
      CV.text('【挂机】', U.pad(), top + lh / 2, { size: CV.FS.md, color: dim });
      CV.text('◈ ' + r0.pointsPerMin.toFixed(1) + '/分', U.pad() + 62 * CV.SCALE, top + lh / 2, { size: CV.FS.md, color: txt });
      CV.text('EXP ' + r0.expPerMin.toFixed(1) + '/分 · 离线 ' + Math.round(Core.offlineEfficiency() * 100) + '% · 上限 ' + Core.offlineCapHours().toFixed(1) + 'h',
        U.pad() + 140 * CV.SCALE, top + lh / 2, { size: CV.FS.sm, color: dim });
      // 行 2：已挂 / 待领
      const y2 = top + lh;
      const dur = G.formatDuration ? G.formatDuration(bank.seconds) : (bank.seconds + '秒');
      CV.text('【已挂】', U.pad(), y2 + lh / 2, { size: CV.FS.md, color: dim });
      // V9.5.82：挂满上限时补一个「已满」（和网页版一致），免得玩家以为收益卡住了
      CV.text(dur + (Core.idleFull && Core.idleFull() ? '（已满）' : ''), U.pad() + 62 * CV.SCALE, y2 + lh / 2, { size: CV.FS.md, color: txt });
      const gainTxt = '◈ ' + fmt(bank.points) + ' · EXP ' + fmt(bank.exp)
        + (bank.otherworld ? ' · ◆ ' + bank.otherworld : '') + (bank.story ? ' · ❖ ' + bank.story : '');
      CV.text('【待领】', U.pad() + U.cw() - CV.measure(gainTxt, CV.FS.md) - 70 * CV.SCALE, y2 + lh / 2, { size: CV.FS.md, color: dim });
      CV.text(gainTxt, U.pad() + U.cw(), y2 + lh / 2, { size: CV.FS.md, color: txt, align: 'right' });
      // 行 3：分工
      const y3 = top + lh * 2;
      CV.text('【分工】', U.pad(), y3 + lh / 2, { size: CV.FS.md, color: dim });
      CV.text(CV.fit(lines.map((l) => l.line.name + ' ' + (l.leaderId ? G.cname(l.leaderId) : '空')).join(' · '), U.cw() - 60 * CV.SCALE, CV.FS.sm),
        U.pad() + 62 * CV.SCALE, y3 + lh / 2, { size: CV.FS.sm, color: dim });
      /* 行间虚线（网页版 .idle-line 的 border-bottom: 1px dashed） */
      CV.ctx.save();
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
      [1, 2].forEach((i) => {
        CV.ctx.beginPath(); CV.ctx.moveTo(U.pad(), top + lh * i - .5); CV.ctx.lineTo(U.pad() + U.cw(), top + lh * i - .5); CV.ctx.stroke();
      });
      CV.ctx.restore();
      // 两个按钮
      const by = top + lh * 3 + 8 * CV.SCALE, bh = 42 * CV.SCALE, gap = 10 * CV.SCALE;
      const bw = (U.cw() - gap) * 0.42;
      U.btn(U.pad(), by, bw, bh, '派人分工', 'ghost', 'open_idlelines');
      U.btn(U.pad() + bw + gap, by, U.cw() - bw - gap, bh, '收取奖励', 'primary', 'claim_all');
      U.y = by + bh;
    });

    /* ⑥ 设置（网页版 settingsBlock：只有 玩法指南 / 设置与存档 两块） */
    U.sectionTitle('设置');
    U.tiles([['open_guide', '玩法指南'], ['open_settings', '设置与存档']]);
    U.y += 10 * CV.SCALE;
  });

  /* ---------- 首页动作 ---------- */
  CV.on('claim_all', function () {
    const r = Core.claimEverything();
    CV.toast(r && r.total ? '已领取 ' + r.total + ' 项' : '暂时没有可领的');
  });
  CV.on('claim_travel', function () {
    const r = Core.claimTravel();
    CV.toast(r && r.ok ? '🎁 ' + r.msg : (r && r.msg) || '还没有新的游历');
    CV.render();
  });
  CV.on('goto_quest', () => CV.toast('主线任务：点右侧按钮领取'));
  CV.on('claim_quest', function () {
    const r = Core.claimMainQuest && Core.claimMainQuest();
    CV.toast((r && r.msg) || '已领取');
    CV.render();
  });
  /* 还没复刻的页面：给个明确提示，别点了没反应 */
  ['open_protag', 'open_party', 'open_grow', 'open_travel', 'open_idlelines', 'open_guide', 'open_settings',
    'open_sect', 'open_keji', 'open_fabao', 'open_garden', 'open_arena', 'open_mount', 'open_refine',
    'open_authority', 'open_buildings', 'open_genelock', 'open_beast', 'open_reincarn', 'open_codex',
    'open_bounty', 'open_tasks', 'open_ach', 'open_sign', 'open_recruit', 'open_shop'].forEach(function (id) {
    CV.on(id, () => CV.toast('这一页还在复刻队列里（下一步）'));
  });
})();
