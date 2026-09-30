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
  /* 从顶栏点某颗货币胶囊进来时记住是哪一种（给货币图鉴那张卡加个"你刚点的是这个"） */
  let currencyFocusId = null;

  /* 指标题行用（网页版那些页是 showPanel 的标题，这边统一用返回键 + 居中标题那一行）——
     **吸顶**（父亲大人 09-27 深夜：「每一屏的标题和返回键都固定在顶部吧」）：
     落笔由框架按屏幕坐标画一次，这里只登记 + 把正文让开，见 uiw.js 的 U.pageHead。 */
  function head(title) { return U.pageHead(title); }

  /* 指南正文里的 **加粗**（数据表里就这个约定）：拆成"普通 / 粗体"两截分别画，
     不能像网页版那样交给 HTML —— 画布上得自己分段。
     ================= V1.1.9（父亲大人：「玩法指南进去后会卡」）=================
     这一页正文 6200 多字，旧写法有三个"逐字"的坑，叠起来在真机上就是"卡"：
       ① 每个字量**两次**宽（算折行一次、存宽度又一次）；
       ② 折行用 `cur.reduce(...)` 把当前行**重新累加一遍** —— O(n²)；
       ③ 画的时候**每个字一次 fillText** → 一屏渲染要 6000+ 次文字绘制。
     现在三处一起改：**宽度查缓存**（同一个字只量一次）· 累加改**增量** ·
     画的时候**按"同粗细的连续片段"整段画**（6000 次 → 两三百次）·
     排版结果再按「文本 + 字号 + 可用宽」**缓存** —— 滚动时**只重画、不再重排**。 */
  const _wCache = Object.create(null);        // 字宽缓存：size|bold|字 → 宽
  const _layoutCache = Object.create(null);   // 排版缓存：size|宽|文本 → 行（含同粗细的片段）
  function charW(ch, size, bold) {
    const k = size + '|' + (bold ? 1 : 0) + '|' + ch;
    let w = _wCache[k];
    if (w === undefined) { w = _wCache[k] = CV.measure(ch, size, bold); }
    return w;
  }
  /* 把"逐字的一行"压成"同粗细的连续片段" —— 画的时候一段一次 fillText */
  function _runs(line) {
    const runs = [];
    line.forEach(function (c) {
      const last = runs[runs.length - 1];
      if (last && last.bold === c.bold) { last.t += c.ch; last.w += c.w; }
      else runs.push({ t: c.ch, bold: c.bold, w: c.w });
    });
    return runs;
  }
  function layoutRich(text, size, maxW) {
    const ck = size + '|' + Math.round(maxW) + '|' + text;
    const hit = _layoutCache[ck];
    if (hit) return hit;
    const out = [];
    let line = [], w = 0;
    String(text).split('**').forEach(function (t, i) {
      const bold = i % 2 === 1;
      for (let k = 0; k < t.length; k++) {
        const ch = t.charAt(k);
        const cw = charW(ch, size, bold);
        if (w + cw > maxW && line.length) { out.push({ runs: _runs(line), w: w }); line = []; w = 0; }
        line.push({ ch: ch, bold: bold, w: cw });
        w += cw;
      }
    });
    if (line.length) out.push({ runs: _runs(line), w: w });
    _layoutCache[ck] = out;
    return out;
  }
  function richLine(text, size, color, gapTop) {
    const lh = size * 1.85, top = U.y + (gapTop || 0);
    const lines = layoutRich(text, size, U.iw() - 8);
    U.draw(function () {
      lines.forEach(function (ln, i) {
        let x = U.ix() + 4;
        const cy = top + lh * (i + 0.5);
        /* V1.1.15（2026-09-27 · 父亲大人："界面滑动有点卡卡的，是我手机卡还是游戏卡"）：
           **视口外的行不画**。这一页正文 6200 字，原来整篇都在发 fillText（一帧 800+ 次），
           而屏幕只看得见十几行 —— 滚到哪画到哪，一帧的文字绘制直接砍掉一大半。
           尺子：`scripts/perf_audit.js`（guide 那一行）。 */
        if (!onScreen(cy, lh)) return;
        ln.runs.forEach(function (r) {
          CV.text(r.t, x, cy, { size: size, color: color || CV.C.text, bold: r.bold });
          x += r.w;
        });
      });
    });
    U.y = top + lines.length * lh;
    return lines.length * lh;
  }

  /* 内容坐标 → 屏幕：内容区在 render 里 translate 了 `CV.TOP + 8 - scroll`。
     上下各留 40px 余量（标题吸顶条、半行露头都不该被裁掉）。 */
  function onScreen(y, h) {
    const top = (CV.scroll || 0) - (CV.TOP + 8);
    return (y + (h || 0)) >= top - 40 && y <= top + CV.H + 40;
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
    U.hint('货币只有四种，按层级分：日常花 ◉、养成长线花 ◆、抽卡花 ✦、转生花 ♾。拿不准就看下面这张表。', 0);
    U.space(CV.SP[1]);
    D.CURRENCIES.forEach(function (c) {
      const info = D.CURRENCY_INFO[c.id] || {};
      /* 从顶栏某颗胶囊点进来时，那一张卡加一道同色描边（网页版 currencyModal(focusId) 同款），
         这样"我刚点的是哪个"一眼看得出来。 */
      if (currencyFocusId === c.id) U.note('← 你刚点的是这一种', 2 * CV.SCALE);
      U.card(function () {
        U.h3(c.icon + ' ' + c.name, '持有 ' + fmt(S.cur[c.id] || 0));
        /* 网页版这两个标签是 <b style="color:var(--gold)">用途</b> —— 加粗是为了让"用途/来源"两层一眼分开 */
        richLine('**用途**：' + (info.use || '—'), CV.FS.md);
        richLine('**来源**：' + (info.gain || '—'), CV.FS.md, CV.C.dim);
      });
    });
  });
  CV.on('open_currency', function () { CV.push('currency'); });
  /* V9.6.134：顶栏那四颗货币胶囊现在**都能点**，点了直接开货币图鉴（和网页版一致）。
     原来只有最后一颗「▤ 全部货币」能点，玩家点任意一颗货币都没反应。 */
  CV.on('cur:*', function (id) { currencyFocusId = id; CV.push('currency'); });
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
        U.kv('距离下一次', D.fmtClock(Math.max(0, prog.every - prog.sec)));
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
