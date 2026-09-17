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
          CV.round(U.ix(), U.y, U.iw(), rowH, 8 * CV.SCALE, null, '#ffd76a66');
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
            grd.addColorStop(0, '#ffd76a22'); grd.addColorStop(1, 'transparent');
            CV.round(U.ix(), U.y, U.iw(), bh, 6 * CV.SCALE, grd);
            CV.round(U.ix(), U.y, 3 * CV.SCALE, bh, 2 * CV.SCALE, CV.C.gold);
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
    const ch = 132 * CV.SCALE;
    const y0 = U.y;
    res.forEach(function (r, i) {
      const x = U.pad() + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const col = rarColor(r.rarity);
      CV.round(x, y, cw, ch, 12 * CV.SCALE, CV.C.panel2, col);
      if (r.isUp) {
        const tw = CV.measure('UP', CV.FS.xs) + 10 * CV.SCALE;
        CV.round(x + cw - tw - 3 * CV.SCALE, y + 3 * CV.SCALE, tw, 16 * CV.SCALE, 6 * CV.SCALE, CV.C.gold);
        CV.text('UP', x + cw - tw / 2 - 3 * CV.SCALE, y + 11 * CV.SCALE, { size: CV.FS.xs, align: 'center', color: '#241c08' });
      }
      const asz = 46 * CV.SCALE, acx = x + cw / 2;
      CV.ctx.beginPath(); CV.ctx.arc(acx, y + 10 * CV.SCALE + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = '#232c42'; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = col; CV.ctx.stroke();
      CV.text(String(r.name || '?').slice(0, 1), acx, y + 10 * CV.SCALE + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: col });
      CV.text(CV.fit(r.name, cw - 10 * CV.SCALE, CV.FS.lg, true), acx, y + 10 * CV.SCALE + asz + 12 * CV.SCALE, { size: CV.FS.lg, bold: true, align: 'center' });
      CV.text(r.isNew ? 'NEW' : ('碎片+' + (r.shards || 0)), acx, y + 10 * CV.SCALE + asz + 30 * CV.SCALE,
        { size: CV.FS.sm, align: 'center', color: r.isNew ? CV.C.green : CV.C.dim });
    });
    U.y = y0 + Math.ceil(res.length / cols) * (ch + gap);
    /* 继续招募 / 返回（用免费次数抽的那次不给"继续招募"） */
    const again = last && !last.free;
    U.btnRow(again
      ? [{ label: '继续招募', style: 'primary', id: 'again' }, { label: '返回', style: 'ghost', id: 'rec_back' }]
      : [{ label: '返回', style: 'ghost', id: 'rec_back' }]);
  });

  /* ---------- 概率公示（网页版 recruitRatesModal：纯文字排版） ---------- */
  CV.register('recruit_rates', function () {
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'rec_back');
    CV.text('概率公示', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    Object.keys(D.RECRUIT_POOLS).forEach(function (pid) {
      const p = D.RECRUIT_POOLS[pid];
      const pv = Core.pityView(pid);
      U.card(function () {
        U.h3(p.name);
        let rx = U.ix();
        Object.keys(p.rates).forEach(function (r) {
          const s = r + ' ' + (p.rates[r] * 100).toFixed(1) + '%';
          CV.text(s, rx, U.y + 8 * CV.SCALE, { size: CV.FS.lg, bold: true, color: rarColor(r) });
          rx += CV.measure(s, CV.FS.lg, true) + 12 * CV.SCALE;
        });
        U.y += 20 * CV.SCALE;
        const cost = Object.keys(p.cost).map((k) => curIcon(k) + fmt(p.cost[k])).join(' + ');
        const ten = Object.keys(p.ten || p.cost).map((k) => curIcon(k) + fmt((p.ten || p.cost)[k])).join(' + ');
        U.kv('单抽', cost);
        U.kv('十连', ten + ' · 保底至少 1 个 SR');
        U.hint(D.pityText(pid), 4 * CV.SCALE);
        if (pv) {
          U.hint('SSR 还差 ' + Math.max(0, pv.ssr.cap - pv.ssr.n) + ' 抽 · UR 还差 ' + Math.max(0, pv.ur.cap - pv.ur.n) + ' 抽'
            + (pv.up ? (' · UP 还差 ' + Math.max(0, pv.up.cap - pv.up.n) + ' 抽') : ''), 2 * CV.SCALE);
        }
      });
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
  CV.on('ssr_ticket', function () { CV.toast('SSR 自选券的选择页在下一步复刻里'); });
})();
