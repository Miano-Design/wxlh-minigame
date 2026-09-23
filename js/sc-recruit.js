/* 招募 —— 照网页版 js/ui.js 的 recruitModal / recruitRatesModal / showResults 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     · 整页「招募伙伴」+ 右上角一个 ⓘ（概率与保底，不占按钮位）
     · 每个池子一张卡：池名 → 招募券行（有券才显示，金色实线；没券就是灰虚线说明）→
       概率行（N/R/SR/SSR/UR 带稀有度色）→ 限定池的「本期 UP」条 → 两个按钮：
       「抽 1 次（免费/花什么）」+「十连（…）」——**按钮文案如实反映这次扣什么**
     · 抽卡结果页：伙伴卡网格 + 「继续招募」（同池再来一次）+「返回」（回招募页）
       用免费次数抽的那次**不给"继续招募"**（白拿的那一下不该顺手再花钱）
     · SSR 自选券（有券才出现）
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;
  let last = null;                 // 上一次抽的结果（继续招募用）

  const mmss = (sec) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(Math.max(0, sec % 60)).padStart(2, '0');
  const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };

  /* 返回到上一步（从首页 tile 进来时 CV.pop 回首页；从结果页返回时回招募页） */
  CV.on('rec_back', function () { CV.pop(); });
  CV.on('rec_close', function () { CV.pop(); });

  /* ---------- 招募页 ---------- */
  CV.register('recruit', function () {
    const S = Core.S;
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'rec_back');
    CV.text('招募伙伴', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    const iw = 34 * CV.SCALE;
    CV.round(U.pad() + U.cw() - iw, U.y + 3 * CV.SCALE, iw, iw, iw / 2, CV.C.panel, CV.C.line2);
    CV.text('i', U.pad() + U.cw() - iw / 2, U.y + 3 * CV.SCALE + iw / 2, { size: CV.FS.f1, bold: true, align: 'center', color: CV.C.text2 });
    CV.hit('rec_rates', U.pad() + U.cw() - iw, U.y + 3 * CV.SCALE, iw, iw);
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];

    Object.keys(D.RECRUIT_POOLS).forEach(function (pid) {
      const p = D.RECRUIT_POOLS[pid];
      const tk = Core.ticketOf(pid);
      const tkName = tk ? ((D.ITEMS[tk.id] || {}).name || tk.id) : '';
      const fst = Core.freeState(pid);
      const freeNow = fst.left > 0 && fst.ready;
      const costText = Object.keys(p.cost).map((k) => curIcon(k) + fmt(p.cost[k])).join('');
      const tenText = Object.keys(p.ten || p.cost).map((k) => curIcon(k) + fmt((p.ten || p.cost)[k])).join('');
      const payLabel = (tk && tk.n >= 1) ? ('抽 1 次（🎫 ' + tkName + '×1）') : ('抽 1 次（' + costText + '）');
      const oneLabel = fst.left > 0
        ? (fst.ready ? ('免费抽 1 次（今日还剩 ' + fst.left + ' 次）') : (payLabel + ' · 免费还差 ' + mmss(fst.waitSec)))
        : payLabel;
      const tenLabel = (tk && tk.n >= 10) ? ('十连（🎫 ' + tkName + '×10）') : ('十连（' + tenText + '）');
      U.card(function () {
        U.h3(p.name);
        /* 招募券行（网页版 .ticket-row）：有券 = 金色实线，没券 = 灰虚线 */
        const rowH = 26 * CV.SCALE;
        /* 网页版只在**有券**时才画这一行（`tk && tk.n > 0`）；没券什么都不显示 */
        if (tk && tk.n > 0) {
          const txt = '🎫 ' + tkName + ' ×' + tk.n;
          CV.round(U.ix(), U.y, U.iw(), rowH, CV.RADIUS_CHIP,  null, CV.a(CV.C.goldBright, .4));
          CV.text(CV.fit(txt, U.iw() - 16 * CV.SCALE, CV.FS.xs), U.ix() + 9 * CV.SCALE, U.y + rowH / 2,
            { size: CV.FS.xs, color: CV.C.text });
          U.y += rowH + 8 * CV.SCALE;
        }
        /* 概率行（网页版 .rate-row：11px、间距 8、稀有度色） */
        let rx = U.ix();
        Object.keys(p.rates).forEach(function (r) {
          const s = r + ' ' + (p.rates[r] * 100).toFixed(1) + '%';
          CV.text(s, rx, U.y + 8 * CV.SCALE, { size: CV.FS.xs, color: rarColor(r) });
          rx += CV.measure(s, CV.FS.xs) + 8 * CV.SCALE;
        });
        U.y += 16 * CV.SCALE + 6 * CV.SCALE;
        /* 限定池：本期 UP 条（金色左侧竖条 + 渐变底） */
        if (pid === 'limited') {
          const up = D.recruitUpChar();
          if (up) {
            const left = D.upTimeLeft ? D.upTimeLeft() : 0;
            const dL = Math.floor(left / 86400e3), hL = Math.floor(left % 86400e3 / 3600e3);
            const bh = 30 * CV.SCALE;
            CV.ctx.save();
            const grd = CV.ctx.createLinearGradient(U.ix(), 0, U.ix() + U.iw(), 0);
            grd.addColorStop(0, CV.a(CV.C.goldBright, .13)); grd.addColorStop(1, 'transparent');
            CV.round(U.ix(), U.y, U.iw(), bh, CV.RADIUS_CHIP,  grd);
            CV.round(U.ix(), U.y, 3 * CV.SCALE, bh, CV.RADIUS_CHIP,  CV.C.gold);
            CV.ctx.restore();
            CV.text('本期 UP：' + up.name + ' · 「' + up.faction + '」阵营', U.ix() + 10 * CV.SCALE, U.y + bh / 2,
              { size: CV.FS.xs, color: CV.C.text });
            CV.text('剩 ' + dL + ' 天 ' + hL + ' 小时', U.ix() + U.iw() - 8 * CV.SCALE, U.y + bh / 2,
              { size: CV.FS.xs, color: CV.C.dim, align: 'right' });
            U.y += bh + 8 * CV.SCALE;
          }
        }
        U.btnRow([
          { label: oneLabel, style: freeNow ? 'gold' : 'ghost', id: 'pull1:' + pid + (freeNow ? ':free' : '') },
          { label: tenLabel, style: 'gold', id: 'pull10:' + pid },
        ]);
      });
    });
    if (S.ssrTicket > 0) {
      U.btnRow([{ label: '🎫 使用SSR自选券（剩 ' + S.ssrTicket + '）', style: 'gold', id: 'ssr_ticket' }]);
    }
  });

  /* ---------- 抽卡结果（网页版 showResults：伙伴卡网格 + 继续招募 / 返回） ---------- */
  CV.register('recruit_result', function () {
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'rec_back');
    CV.text('招募结果', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    const res = (last && last.results) || [];
    const cols = 3, gap = CV.SP[2];
    const cw = (U.cw() - gap * (cols - 1)) / cols;
    /* V9.6.122（父亲大人："招募出来的卡片排版不行啊，之前不是有反馈过吗"）：
       上一版为了"10 连不出画"把卡片压到 104、头像缩到 38，**结果内容全挤在上半截**：
       卡片 104 里实际只用了 65（头像+名字+碎片），底下空 31 —— 看着就是排版散、不齐。
       现在**照网页版 .char-card 的量重排**（内边距 10 / 头像 46 / 头像下 6 / 名字 13px /
       小字 11px 且上间距 2），卡片高度由**内容算出来**（≈107），不再写死；
       10 连是 4 行 ≈ 4×107+3×10 = 458，加上标题与底部固定条仍在画内（854 的屏余量够）。 */
    const PAD = 10 * CV.SCALE, AV = 46 * CV.SCALE, AVGAP = 6 * CV.SCALE;
    const NAME_H = CV.FS.lg * 1.35, META_H = CV.FS.sm * 1.55;
    /* V1.1（基准 §4.2）：卡底再让出 16px 画品质框 v2 的**档色铭牌 ＋ 档码字**。 */
    const BAND = 16 * CV.SCALE;
    const ch = PAD * 2 + AV + AVGAP + NAME_H + 2 * CV.SCALE + META_H + BAND;
    const y0 = U.y;
    res.forEach(function (r, i) {
      const x = U.pad() + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const col = rarColor(r.rarity);
      /* 网页版：SSR/UR/MYTH 除了描边还有一圈柔光（box-shadow）—— 抽到好东西要看得出来 */
      if (['SSR', 'UR', 'MYTH'].indexOf(r.rarity) >= 0) {
        CV.round(x - 1.5 * CV.SCALE, y - 1.5 * CV.SCALE, cw + 3 * CV.SCALE, ch + 3 * CV.SCALE, CV.RADIUS,  null,
          r.rarity === 'UR' ? CV.a(CV.C.rur, .35) : (r.rarity === 'MYTH' ? CV.a(CV.C.goldBright, .4) : CV.a(CV.C.rssr, .28)), 3 * CV.SCALE);
      }
      CV.qframe(x, y, cw, ch, r.rarity, 12 * CV.SCALE, BAND);
      if (r.isUp) {
        const tw = CV.measure('UP', CV.FS.xs) + 10 * CV.SCALE;
        CV.round(x + cw - tw - 3 * CV.SCALE, y + 3 * CV.SCALE, tw, 16 * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
        CV.text('UP', x + cw - tw / 2 - 3 * CV.SCALE, y + 11 * CV.SCALE, { size: CV.FS.xs, align: 'center', color: CV.C.sel });
      }
      const acx = x + cw / 2, acTop = y + PAD;
      CV.ctx.beginPath(); CV.ctx.arc(acx, acTop + AV / 2, AV / 2 - CV.SCALE, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.C.panel3; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = col; CV.ctx.stroke();
      CV.text(String(r.name || '?').slice(0, 1), acx, acTop + AV / 2, { size: AV * 0.44, bold: true, align: 'center', color: col });
      const nameCy = acTop + AV + AVGAP + NAME_H / 2;
      CV.text(CV.fit(r.name, cw - PAD * 2, CV.FS.lg, true), acx, nameCy, { size: CV.FS.lg, bold: true, align: 'center' });
      /* V9.6.129：重复抽到进的是**该稀有度的通用池**，标注清楚（省得玩家以为还是各攒各的） */
      CV.text(r.isNew ? 'NEW' : (r.rarity + '碎片+' + (r.shards || 0)), acx, nameCy + NAME_H / 2 + 2 * CV.SCALE + META_H / 2,
        { size: CV.FS.sm, align: 'center', color: r.isNew ? CV.C.green : CV.C.dim });
    });
    U.y = y0 + Math.ceil(res.length / cols) * (ch + gap);
    /* 继续招募 / 返回（用免费次数抽的那次不给"继续招募"）
       V9.6.18（父亲大人）：这两个按钮**必须永远在画内** —— 不然连抽还要先下滑，
       完全不合理。改成**底部固定条**（页面级覆盖层，不跟内容滚），
       内容底部再让出一条它的高度，牌就不会被压在它下面。 */
    const again = last && !last.free;
    const acts = again
      ? [{ label: '继续招募', style: 'primary', id: 'again' }, { label: '返回', style: 'ghost', id: 'rec_back' }]
      : [{ label: '返回', style: 'ghost', id: 'rec_back' }];
    const barH = U.BTN_H * CV.SCALE + 16 * CV.SCALE;
    U.y += barH;                       // 让出底部条的高度
    CV.pageOverlay = function () {
      const c = CV.ctx, y = CV.H - CV.safeBottom - CV.NAV_H - barH;
      /* 和页面同一条渐变铺底，滚过去的内容不会透出来（也不会切出一条缝） */
      const g = c.createLinearGradient(0, 0, 0, CV.H);
      g.addColorStop(0, CV.C.bg2); g.addColorStop(1, CV.C.bg);
      c.fillStyle = g; c.fillRect(0, y, CV.W, barH);
      CV.hitMode = 'screen';
      const keep = U.y, keepIn = U.inCard;
      U.inCard = false; U.y = y + 8 * CV.SCALE;
      U.btnRow(acts);
      U.y = keep; U.inCard = keepIn;
      CV.hitMode = 'content';
    };
  });

  /* ---------- 概率公示（网页版 recruitRatesModal：**纯文字排版**，不是卡片） ----------
     V9.6.4（父亲大人："概率公式不是说用文字排版去排吗，现在还是卡片、还有字被截掉"）：
     网页版这里是 section-title（池名）+ .rate-block（一段文字）——
       .rate-block：11px、行高 1.9、左右内边距 2
       .rate-line ：标签列固定 3.25rem(52px) 灰字 + 值列（可换行，不许裁字）
       .rate-note ：11px 灰字、行高 1.85（保底说明 / 当前进度）
     照它重做，别再套 U.card / U.kv（那两个会裁字）。 */
  function rateBlock(rows, notes) {
    const size = CV.FS.sm, lh = size * 1.9, gap = 8 * CV.SCALE, labelW = 52 * CV.SCALE;
    rows.forEach(function (r) {
      const valW = U.iw() - labelW - gap;
      const lines = CV.wrap(r[1], valW, size, 4);
      const top = U.y;
      CV.text(r[0], U.ix() + 2 * CV.SCALE, top + lh / 2, { size, color: CV.C.dim });
      lines.forEach(function (ln, i) {
        CV.text(ln, U.ix() + labelW + gap, top + lh * (i + 0.5), { size, color: CV.C.text2 });
      });
      U.y = top + lh * lines.length;
    });
    (notes || []).forEach(function (n) {
      const noteSize = CV.FS.xs, nlh = noteSize * 1.85;
      const lines = CV.wrap(n.t, U.iw() - 4 * CV.SCALE, noteSize, 6);
      const top = U.y + 2 * CV.SCALE;
      lines.forEach(function (ln, i) {
        CV.text(ln, U.ix() + 2 * CV.SCALE, top + nlh * (i + 0.5), { size: noteSize, color: n.color || CV.C.dim });
      });
      U.y = top + nlh * lines.length;
    });
    U.y += 4 * CV.SCALE;
    U.lastBottom = 0;
  }
  CV.register('recruit_rates', function () {
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'rec_back');
    CV.text('概率公示', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    Object.keys(D.RECRUIT_POOLS).forEach(function (pid) {
      const p = D.RECRUIT_POOLS[pid];
      const pv = Core.pityView(pid);
      const tk = Core.ticketOf(pid);
      const tkName = tk ? ((D.ITEMS[tk.id] || {}).name || tk.id) : '';
      const rate = Object.keys(p.rates).map((r) => r + ' ' + (p.rates[r] * 100).toFixed(1) + '%').join('　');
      const cost = Object.keys(p.cost).map((k) => curIcon(k) + fmt(p.cost[k])).join(' + ');
      const ten = Object.keys(p.ten || p.cost).map((k) => curIcon(k) + fmt((p.ten || p.cost)[k])).join(' + ');
      U.sectionTitle(p.name);
      rateBlock([
        ['概率', rate],                     // 标签列别空着（父亲大人：看着像漏写了一个词）
        ['单抽', cost + (tk ? ' · 或 🎫 ' + tkName + '×1（现有 ' + tk.n + ' 张）' : '')],
        ['十连', ten + (tk ? ' · 或 🎫 ' + tkName + '×10' : '') + ' · 保底至少 1 个 SR'],
      ], [
        { t: D.pityText(pid) },
        pv ? { t: 'SSR 还差 ' + Math.max(0, pv.ssr.cap - pv.ssr.n) + ' 抽 · UR 还差 ' + Math.max(0, pv.ur.cap - pv.ur.n) + ' 抽'
          + (pv.up ? ' · UP 还差 ' + Math.max(0, pv.up.cap - pv.up.n) + ' 抽' : ''), color: CV.C.gold } : null,
      ].filter(Boolean));
    });
  });

  /* ---------- 事件 ---------- */
  CV.on('rec_rates', function () { CV.push('recruit_rates'); });
  /* 单抽：id 形如 pull1:normal 或 pull1:normal:free（有免费次数且已就绪） */
  CV.on('pull1:*', function (arg) {
    const parts = String(arg).split(':');
    const pid = parts[0], isFree = parts[1] === 'free';
    const r = isFree ? Core.freeRecruit(pid) : Core.recruitOnce(pid);
    if (r.error) { CV.toast(r.error); return; }
    last = { results: isFree ? [r] : [r], pid: pid, n: 1, free: isFree };
    if (!isFree) { /* 单抽结果也给返回 */ }
    CV.push('recruit_result');
  });
  CV.on('pull10:*', function (arg) {
    const pid = String(arg).split(':')[0];
    const r = Core.recruitTen(pid);
    if (r.error) { CV.toast(r.error); return; }
    last = { results: r.results, pid: pid, n: 10, free: false };
    CV.push('recruit_result');
  });
  CV.on('again', function () {
    if (!last) { CV.toast('没有可继续的招募'); return; }
    const pid = last.pid, n = last.n;
    const r = n >= 10 ? Core.recruitTen(pid) : Core.recruitOnce(pid);
    if (r.error) { CV.toast(r.error); return; }
    last = { results: n >= 10 ? r.results : [r], pid: pid, n: n, free: false };
    CV.render();
  });
  /* ---------- SSR 自选券（网页版 ssrPickModal） ----------
     选一名 SSR 入队；已拥有的转成碎片。选完原地换成"结果 + 剩 N 张 + 返回招募"。 */
  let ssrDone = null;
  CV.register('ssr_pick', function () {
    const S = Core.S;
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'ssr_back');
    CV.text('SSR 自选（剩 ' + (S.ssrTicket || 0) + ' 张）', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2,
      { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    if (ssrDone) {
      U.card(function () {
        U.h3('自选结果');
        U.space(CV.SP[1]);
        U.note(ssrDone, 0);
        U.space(CV.SP[1]);
        U.kv('剩余自选券', (S.ssrTicket || 0) + ' 张');
      });
      U.btnRow([{ label: '返回招募', style: 'primary', id: 'ssr_back' }]);
      return;
    }
    U.note('选一名 SSR 伙伴入队；已拥有的伙伴会转成碎片。', 0);
    U.space(CV.SP[2]);
    const ssrs = D.characters.filter(function (c) { return c.rarity === 'SSR' && !c.hidden; });
    const cols = 3, gap = CV.SP[2];
    /* V1.1（基准 §4.2）：让出 16px 给品质框 v2 的铭牌。 */
    const SSBAND = 16 * CV.SCALE;
    const cw = (U.cw() - gap * (cols - 1)) / cols, ch = 132 * CV.SCALE + SSBAND, y0 = U.y;
    ssrs.forEach(function (c, i) {
      const x = U.pad() + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const col = rarColor(c.rarity);
      CV.qframe(x, y, cw, ch, c.rarity, 12 * CV.SCALE, SSBAND);
      const asz = 46 * CV.SCALE, acx = x + cw / 2;
      CV.ctx.beginPath(); CV.ctx.arc(acx, y + 10 * CV.SCALE + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.C.panel3; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = col; CV.ctx.stroke();
      CV.text(String(c.name || '?').slice(0, 1), acx, y + 10 * CV.SCALE + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: col });
      CV.text(CV.fit(c.name, cw - 10 * CV.SCALE, CV.FS.lg, true), acx, y + 10 * CV.SCALE + asz + 12 * CV.SCALE, { size: CV.FS.lg, bold: true, align: 'center' });
      CV.text(CV.fit(c.bloodline + ' · ' + c.faction, cw - 10 * CV.SCALE, CV.FS.sm), acx, y + 10 * CV.SCALE + asz + 30 * CV.SCALE,
        { size: CV.FS.sm, align: 'center', color: CV.C.dim });
      CV.hit('ssrpick:' + c.id, x, y, cw, ch);
    });
    U.y = y0 + Math.ceil(ssrs.length / cols) * (ch + gap);
    U.btnRow([{ label: '‹ 返回招募', style: 'ghost', id: 'ssr_back' }]);
  });
  CV.on('ssr_ticket', function () {
    if ((Core.S.ssrTicket || 0) <= 0) { CV.toast('没有自选券了'); return; }
    ssrDone = null; CV.push('ssr_pick');
  });
  CV.on('ssrpick:*', function (id) {
    const r = Core.ssrTicketUse(id);
    if (!r.ok) { CV.toast(r.msg || '无法选择'); return; }
    ssrDone = r.msg || '已获得';
    CV.toast('🎫 ' + ssrDone);
    CV.render();
  });
  CV.on('ssr_back', function () { CV.pop(); });
})();
