/* 玩法指南 / 货币图鉴 / 游历奇遇（照网页版 js/ui.js 的 guideModal / currencyModal / travelModal 逐块抄）
   ------------------------------------------------------------------------------
   这三页原来在小游戏里是"占位 toast"（点开只弹一句"还在复刻队列里"），
   以及顶栏那颗「全部货币」——网页版点了会开货币图鉴，这边以前**连热区都没登记**，
   看着像按钮、点了一点反应都没有（父亲大人最不能忍的那类）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const pad = () => U.pad();

  /* 指标题行用（网页版那些页是 showPanel 的标题，这边统一用返回键 + 居中标题那一行） */
  function head(title) {
    U.btn(pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'page_back');
    CV.text(title, pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
  }

  /* 指南正文里的 **加粗**（数据表里就这个约定）：拆成"普通 / 粗体"两截分别画，
     不能像网页版那样交给 HTML —— 画布上得自己分段。 */
  function richLine(text, size, color, gapTop) {
    const lh = size * 1.85, top = U.y + (gapTop || 0);
    const parts = String(text).split('**');
    const segs = parts.map((t, i) => ({ t, bold: i % 2 === 1 })).filter((s) => s.t);
    /* 逐字折行：一小段一小段地量，超宽就换行 */
    const lines = [];
    let cur = [];
    segs.forEach(function (s) {
      s.t.split('').forEach(function (ch) {
        const w = cur.reduce((a, c) => a + (c.w || 0), 0) + CV.measure(ch, size, s.bold);
        if (w > U.iw() - 8 && cur.length) { lines.push(cur); cur = []; }
        cur.push({ ch, bold: s.bold, w: CV.measure(ch, size, s.bold) });
      });
    });
    if (cur.length) lines.push(cur);
    U.draw(function () {
      lines.forEach(function (ln, i) {
        let x = U.ix() + 4, cy = top + lh * (i + 0.5);
        ln.forEach(function (c) { CV.text(c.ch, x, cy, { size, color: color || CV.C.text, bold: c.bold }); x += c.w; });
      });
    });
    U.y = top + lines.length * lh;
    return lines.length * lh;
  }

  /* ---------- 玩法指南（网页版 guideModal） ---------- */
  CV.register('guide', function () {
    U.begin(); head('玩法指南');
    D.GUIDE_CHAPTERS.forEach(function (ch) {
      U.card(function () {
        U.h3(ch.title);
        (ch.body || []).forEach(function (line) { richLine('· ' + line, CV.FS.md); });
      });
    });
    U.card(function () {
      U.h3('📖 看不懂就点这里');
      U.note('任何一屏里有「?」或小字说明的地方，都可以点开看解释；货币、道具也都能点开看用途。', 0);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '▤ 打开货币图鉴', style: 'ghost', id: 'open_currency' }], undefined, U.BTN_SM);
    });
  });

  /* ---------- 货币图鉴（网页版 currencyModal） ---------- */
  CV.register('currency', function () {
    const S = Core.S;
    U.begin(); head('货币图鉴');
    U.hint('每种货币只干一件事。拿不准该花哪个，就看下面这张表——「用途」写的是它能买什么，「来源」写的是去哪刷。', 0);
    U.space(CV.SP[1]);
    D.CURRENCIES.forEach(function (c) {
      const info = D.CURRENCY_INFO[c.id] || {};
      U.card(function () {
        U.h3(c.icon + ' ' + c.name, '持有 ' + fmt(S.cur[c.id] || 0));
        /* 网页版这两个标签是 <b style="color:var(--gold)">用途</b> —— 加粗是为了让"用途/来源"两层一眼分开 */
        richLine('**用途**：' + (info.use || '—'), CV.FS.md);
        richLine('**来源**：' + (info.gain || '—'), CV.FS.md, CV.C.dim);
      });
    });
  });
  CV.on('open_currency', function () { CV.push('currency'); });
  CV.on('open_guide', function () { CV.push('guide'); });

  /* ---------- 游历奇遇（网页版 travelModal） ---------- */
  CV.register('travel', function () {
    const st = Core.S.travel || {};
    const prog = Core.travelProgress();
    const pend = Core.pendingTravel();
    U.begin(); head('游历奇遇');
    U.card(function () {
      U.h3('游历奇遇', '已遇 ' + (st.got || 0) + ' 次');
      if (pend) {
        U.eventDesc([{ t: pend.ico + ' ' + pend.name, bold: true }, { t: '' }, { t: pend.desc }], 2 * CV.SCALE);
        U.space(CV.SP[2]);
        U.btnRow([{ label: '领取：' + Core.rewardTextOf(pend.effect), style: 'primary', id: 'travel_claim' }]);
      } else {
        U.space(CV.SP[1]);
        U.bar(prog.pct);
        U.space(CV.SP[1]);
        U.kv('距离下一次', Math.max(0, Math.round(prog.every - prog.sec)) + ' 秒');
      }
    });
    U.sectionTitle('可能遇到什么（' + D.TRAVELS.length + ' 种）');
    U.card(function () {
      D.TRAVELS.forEach(function (t) {
        U.listRow({
          ico: t.ico, t1: t.name, t2: t.desc,
          rightText: Core.rewardTextOf(t.effect),
        });
      });
    });
  });
  CV.on('travel_claim', function () {
    const r = Core.claimTravel();
    if (!r.ok) { CV.toast(r.msg || '还不能领'); return; }
    CV.toast('🎁 ' + r.msg, 2600);
    CV.render();                     // 原地刷新：页面不动、不闪屏
  });
  CV.on('open_travel', function () { CV.push('travel'); });
  CV.on('page_back', () => CV.pop());
})();
