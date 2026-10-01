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
  /* V1.1.x（2026-09-27 · 音频系统）：抽卡出声 —— **出货（SSR/UR）给一声亮的**，
     其余给一声柔和的落定音。放在"拿到结果之后"，与结果页同一拍。 */
  function sndResults(list) {
    if (!(G.AUD && G.AUD.play)) return;
    const rare = (list || []).some(function (r) { return r && (r.rarity === 'SSR' || r.rarity === 'UR'); });
    G.AUD.play(rare ? 'recruitRare' : 'recruit');
  }

  const mmss = (sec) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(Math.max(0, sec % 60)).padStart(2, '0');
  const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };

  /* 返回到上一步（从首页 tile 进来时 CV.pop 回首页；从结果页返回时回招募页） */
  CV.on('rec_back', function () { CV.pop(); });
  /* F2-7（抢修单 0928R3 · 删没有入口的死处理器）：`rec_close` 全仓没有一处 `CV.hit` / 按钮引用
     （招募页与招募结果页的返回都走 `rec_back`）—— 删掉，别让下一个人以为它是活的。 */

  /* ---------- 招募页 ---------- */
  CV.register('recruit', function () {
    const S = Core.S;
    U.begin();
    /* V1.0.5（UI 设计师 1.0.2 复审 · 两端对表第 5 条）：页头那个 ⓘ 照网页版
       `.page-head .info-i`（占位 **2.5rem＝40px**，与左边返回键等宽）＋ `.info-i::after`
       （里面那颗圆只有 **1.25rem＝20px**、边框 line2、底 panel2、`--fs-md` 12px 斜体 Georgia、色 --dim）。
       小游戏原来是"40px 热区配 34px 圆圈 + 15px 粗白字"——圆圈比网页版大 70%、
       字比网页版大一档还改成白色，页头一眼就不一样。 */
    /* ⚠️ 父亲大人 09-27 深夜（派单 Z-B）：标题 + 返回**吸顶**。
       那颗「i」原来画在正文顶上（跟着一起滚），现在挂到吸顶顶栏的右端 ——
       坐标由框架按**屏幕坐标**给（U.pageHead 的 right 回调），热区照旧登记 rec_rates。 */
    const ibox = 40 * CV.SCALE, icir = 20 * CV.SCALE;      // 2.5rem 占位 / 1.25rem 圆圈
    U.pageHead('招募伙伴', { backId: 'rec_back', right: function (rx, y0, h) {
      const ibx = rx, iby = y0 + (h - ibox) / 2;
      const prevMode = CV.hitMode;                 // 框架整段就是 screen 模式：这里只许还回去
      CV.hitMode = 'screen';
      CV.round(ibx + (ibox - icir) / 2, iby + (ibox - icir) / 2, icir, icir, icir / 2, CV.a(CV.C.panel2, .50), CV.C.line2);
      CV.text('i', ibx + ibox / 2, iby + ibox / 2, { size: CV.FS.md, align: 'center', color: CV.C.dim });
      CV.hit('rec_rates', ibx, iby, ibox, ibox);
      CV.hitMode = prevMode;
    } });

    Object.keys(D.RECRUIT_POOLS).forEach(function (pid) {
      const p = D.RECRUIT_POOLS[pid];
      const tk = Core.ticketOf(pid);
      const tkName = tk ? ((D.ITEMS[tk.id] || {}).name || tk.id) : '';
      /* V1.0.6（与结算胶囊同一处口径 · 父亲大人 2026-09-24：「配的就是背包图标」）：
         券的图标也要取**它自己那张券的 icon** —— 三张券 🎫 / 🎋 / 🎴 各不相同，
         写死一个 🎫 就等于"不一样的东西做成一样"。 */
      const tkIco = tk ? (((D.ITEMS[tk.id] || {}).icon) || '🎫') : '🎫';
      const fst = Core.freeState(pid);
      const freeNow = fst.left > 0 && fst.ready;
      const costText = Object.keys(p.cost).map((k) => curIcon(k) + fmt(p.cost[k])).join('');
      const tenText = Object.keys(p.ten || p.cost).map((k) => curIcon(k) + fmt((p.ten || p.cost)[k])).join('');
      const payLabel = (tk && tk.n >= 1) ? ('抽 1 次（' + tkIco + ' ' + tkName + '×1）') : ('抽 1 次（' + costText + '）');
      /* ================= V1.1.15（2026-09-27 · 派单 I 第 1 条 · 视觉复审 P0-2）=================
         320 上两颗按钮的标签都被压成两行，而且**从金额中间断**：
         「十连（◉ 4500）」→「十连（◉ 450」＋「0）」（父亲大人最常读的就是"花多少"，读错数）。
         根因在 `U.btnRow`：它把每颗按"自然宽 × 可用宽/总自然宽"**等比缩到刚好铺满一行**，
         缩完再交给 `U.btn` 按 `w − 16` 折行 —— 自然宽本来就不够，于是必折。
         修法（**本页这几颗按钮的活**，不动 uiw.js 的通用件）：
           ① 窄屏先把免费那串长标签收短（"今日还剩 N 次"→"剩 N"）；
           ② 两颗的**自然宽**排不下就改竖排（一列一颗、整宽）—— 整宽时标签一定放得下，
              宁可让卡长一点，也不许把数字劈开。
         判据：`自然宽 a ＋ 自然宽 b ＋ 间距 ≤ U.iw()` 时一行必不折行
         （U.btnRow 只会把宽度**放大**到铺满，放大不会造成折行）。 */
      const near = CV.W < 360 * CV.SCALE;
      const oneLabel = fst.left > 0
        ? (fst.ready ? (near ? ('免费抽 1 次（剩 ' + fst.left + '）') : ('免费抽 1 次（今日还剩 ' + fst.left + ' 次）'))
          : (payLabel + ' · 免费还差 ' + mmss(fst.waitSec)))
        : payLabel;
      const tenLabel = (tk && tk.n >= 10) ? ('十连（' + tkIco + ' ' + tkName + '×10）') : ('十连（' + tenText + '）');
      U.card(function () {
        U.h3(p.name);
        /* 招募券行（网页版 .ticket-row）：有券 = 金色实线，没券 = 灰虚线 */
        const rowH = 26 * CV.SCALE;
        /* 网页版只在**有券**时才画这一行（`tk && tk.n > 0`）；没券什么都不显示 */
        if (tk && tk.n > 0) {
          const txt = tkIco + ' ' + tkName + ' ×' + tk.n;
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
        {
          const one = { label: oneLabel, style: freeNow ? 'gold' : 'ghost', id: 'pull1:' + pid + (freeNow ? ':free' : '') };
          /* R1.5 UX 轮（§三十三）：每张池卡里原来**两颗都是金底**（免费抽 ＋ 十连），
             页面上一共五颗金按钮 —— 分不出主次。口径：**免费/单抽＝主按钮**（不花钱那一下），
             十连降成中性实底（default）；"免费次数用完了"时单抽自动变 ghost，
             那时十连才是这张卡唯一的主按钮。 */
          const ten = { label: tenLabel, style: freeNow ? 'default' : 'gold', id: 'pull10:' + pid };
          /* ================= V1.1.16（0927-Y 数值轮 · 报告 §6-8①）：普通池多一颗「连抽 ×10」 =================
             点数到了中后期没有出口（建筑点满后 90 天剩 **727 万 ◉**，报告 §四/§6-8），
             而普通池单抽 ◉500 就是现成出口 —— 缺的只是"一次点 100 下"。
             口径（**不动任何既有排序/结构**）：只在**普通池**那张卡上，在「十连」**下面**加一颗
             「连抽 ×10（◉45,000）」（＝10 次十连 ＝ 100 抽），点了先出一个确认弹窗报价。
             别的池不加（限定池/高级池的货币本来就紧，给它们开口子等于改那条线的定价）。 */
          const bulk = pid === 'normal'
            ? { label: '连抽 ×10（' + Object.keys((p.ten || p.cost)).map((k) => curIcon(k) + fmt(((p.ten || p.cost)[k]) * 10)).join('') + ' · 共 100 抽）', style: 'ghost', id: 'pull100:' + pid }
            : null;
          /* 「一行放不放得下」必须**在卡片里量**（`U.iw()` 在卡内是卡内宽 268，在卡外是页宽 296）——
             第一版把这段算在 `U.card` 外面，于是拿 296 去判、实际只有 268，
             320 上「免费抽 1 次（剩 3）」被挤到只剩 141 宽，0.9px 之差把末尾的「）」折到第二行。
             判法照抄 `U.btnRow` 那三行（自然宽 → 等比缩到铺满 → `U.btn` 按 `w − 16` 折行），
             两颗都不折才走一行；只要有一颗要折就竖排（整宽时一定放得下）。 */
          const oneRowFits = (function () {
            const gap = 10 * CV.SCALE, minw = U.BTN_MINW * CV.SCALE;
            const nat = [oneLabel, tenLabel].map((s) => Math.max(minw, CV.measure(s, CV.FS.lg) + 24 * CV.SCALE));
            const avail1 = U.iw() - gap, sum = nat[0] + nat[1];
            return [oneLabel, tenLabel].every(function (s, i) {
              return Math.max(minw, nat[i] * avail1 / sum) - 16 * CV.SCALE >= CV.measure(s, CV.FS.lg) - 0.5;
            });
          })();
          if (oneRowFits) U.btnRow([one, ten]);
          else { U.btnRow([one]); U.space(CV.SP[1]); U.btnRow([ten]); }   // 排不下 → 竖排（一颗一行、整宽）
          if (bulk) { U.space(CV.SP[1]); U.btnRow([bulk]); }
        }
        /* ================= V1.1.8（乙组 B7 · 高级池看广告免费 1 抽）=================
           父亲大人的口径：**10 次/天**，每次免 1 抽（等价 ◆200）。
           **只在高级池那一屏出现**（`pid === 'advanced'`）—— 别的池没有这个点位。
           "未解锁不显示"这条**位置保证**：这一段在 `CV.isUnlocked('recruit')` 之后、且池子本身要已解锁
           （`recruit` 页的整体入口就在解锁门后，见 sc-home 的 open_recruit）。
           抽卡走 `Core.adRecruitAdv()`（内部复用 `recruitOnce(noCost)`，与付费抽同一段出率/保底）。 */
        if (pid === 'advanced' && G.AD && G.AD.show) {
          /* 2026-10-01（§十六）：文案与禁用态统一读 `AD.status('recruit_adv')` */
          const adLeft = G.AD.status ? G.AD.status('recruit_adv') : { ok: (G.AD.left ? G.AD.left('recruit_adv') : 0) > 0 };
          const adTail = G.AD.quotaText ? G.AD.quotaText('recruit_adv') : '';
          U.space(CV.SP[1]);
          U.btnRow([{
            label: '📺 看广告 · 免费 1 抽' + adTail,
            style: 'ghost', id: adLeft.ok ? ('ad_pull1:' + pid) : '', dis: !adLeft.ok,
          }]);
        }
      });
    });
    if (S.ssrTicket > 0) {
      U.btnRow([{ label: '🎫 使用 SSR 自选券（剩 ' + S.ssrTicket + '）', style: 'gold', id: 'ssr_ticket' }]);
    }
  });

  /* ---------- 抽卡结果（网页版 showResults：伙伴卡网格 + 继续招募 / 返回） ---------- */
  CV.register('recruit_result', function () {
    U.begin();
    U.pageHead('招募结果', { backId: 'rec_back' });    // 吸顶（父亲大人 09-27 深夜 · 派单 Z-B）
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
    /* V1.1（基准 §4.2）：卡底让出铭牌带画品质框 v2 的**档色铭牌 ＋ 档码字**。
       V1.0.5（UI 设计师 1.0.2 复审 · 两端对表第 5 条）：带高照网页版
       `[class*="rarity-"]::after` 的 **22px**（这里原来 16px）。
       同时补上末行小字到铭牌之间的 **6px** —— 原式 `PAD*2 + …` 把下内边距也算成了 10px，
       而铭牌一翻到 22px 就会直接压到最后一行小字上（复审实测只剩 0.5px 间距）。
       网页版口径：.char-card padding-bottom 1.75rem(28) − 铭牌 1.375rem(22) = 6。 */
    const BAND = 22 * CV.SCALE;                       // 铭牌高（网页版 1.375rem）
    const BAND_PAD = 28 * CV.SCALE;                   // 卡片下内边距（网页版 1.75rem）＝铭牌 22 + 净空 6
    /* 上内边距 10 + 内容 + 下内边距 28；算式沿用"内容从 PAD*2 起算"的老写法，
       把 28 与 20 的差（18）补回来 —— 高度仍然完全由内容算出来，一个数都没写死。 */
    const ch = PAD * 2 + AV + AVGAP + NAME_H + 2 * CV.SCALE + META_H + (BAND_PAD - PAD);
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
        /* 「UP」角标：网页版 .char-card .inparty 是**五级 11px**（原来画成 12px） */
        const tw = CV.measure('UP', CV.FS.tag) + 10 * CV.SCALE;
        CV.round(x + cw - tw - 3 * CV.SCALE, y + 3 * CV.SCALE, tw, 16 * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
        CV.text('UP', x + cw - tw / 2 - 3 * CV.SCALE, y + 11 * CV.SCALE, { size: CV.FS.tag, align: 'center', color: CV.C.sel });
      }
      const acx = x + cw / 2, acTop = y + PAD;
      CV.ctx.beginPath(); CV.ctx.arc(acx, acTop + AV / 2, AV / 2 - CV.SCALE, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.a(CV.C.panel3, .50); CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = col; CV.ctx.stroke();
      CV.text(String(r.name || '?').slice(0, 1), acx, acTop + AV / 2, { size: AV * 0.44, bold: true, align: 'center', color: col });
      const nameCy = acTop + AV + AVGAP + NAME_H / 2;
      CV.text(CV.fit(r.name, cw - PAD * 2, CV.FS.lg, true), acx, nameCy, { size: CV.FS.lg, bold: true, align: 'center' });
      /* V1.1.14（0927-F · 父亲大人）：碎片**按抽到谁就是谁的** ——
         没满星进**他自己**那份；**满星之后**才转成该稀有度的通用碎片（`r.to` 由 Core 给出）。
         所以这行要**说清进的是谁的**（老文案写"UR碎片+10"，玩家会以为直接进通用池）。 */
      const shardTxt = (r.to === 'pool')
        ? (r.rarity + ' 通用 +' + (r.shards || 0))
        : ('碎片 +' + (r.shards || 0));      /* 名字就在卡片正上方，行里不再重复写 ——
                                                 写了会挤爆（实测「叶沉舟 碎片 +…」当场被砍） */
      CV.text(r.isNew ? 'NEW' : CV.fit(shardTxt, cw - PAD * 2, CV.FS.sm), acx, nameCy + NAME_H / 2 + 2 * CV.SCALE + META_H / 2,
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
    /* 2026-10-02（父亲大人：「二级界面这些可以滑动的你都得考虑到类似背包的容器问题」）：
       这条底部固定条是**半透明**的（他要的 50%），所以滚过去的内容会从它后面透出来 ——
       和背包那条一样的毛病。把它报给 cv.js，让**内容层的下沿停在它上面**：
       滚的内容到这条线上就被切掉，不会从半透明的条后面透出来影响阅读。 */
    CV.bottomBarH = barH;
    CV.pageOverlay = function () {
      const c = CV.ctx, y = CV.H - CV.safeBottom - CV.NAV_H - barH;
      /* 和页面同一条渐变铺底，滚过去的内容不会透出来（也不会切出一条缝） */
      const g = c.createLinearGradient(0, 0, 0, CV.H);
      g.addColorStop(0, CV.a(CV.C.bg2, .50)); g.addColorStop(1, CV.a(CV.C.bg, .50));   // 2026-10-02 父亲大人：底部固定条也半透明
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
    U.pageHead('概率公示', { backId: 'rec_back' });    // 吸顶（父亲大人 09-27 深夜 · 派单 Z-B）
    Object.keys(D.RECRUIT_POOLS).forEach(function (pid) {
      const p = D.RECRUIT_POOLS[pid];
      const pv = Core.pityView(pid);
      const tk = Core.ticketOf(pid);
      const tkName = tk ? ((D.ITEMS[tk.id] || {}).name || tk.id) : '';
      const tkIco = tk ? (((D.ITEMS[tk.id] || {}).icon) || '🎫') : '🎫';   // 券自己的图标（V1.0.6）
      const rate = Object.keys(p.rates).map((r) => r + ' ' + (p.rates[r] * 100).toFixed(1) + '%').join('　');
      const cost = Object.keys(p.cost).map((k) => curIcon(k) + fmt(p.cost[k])).join(' + ');
      const ten = Object.keys(p.ten || p.cost).map((k) => curIcon(k) + fmt((p.ten || p.cost)[k])).join(' + ');
      U.sectionTitle(p.name);
      rateBlock([
        ['概率', rate],                     // 标签列别空着（父亲大人：看着像漏写了一个词）
        ['单抽', cost + (tk ? ' · 或 ' + tkIco + ' ' + tkName + '×1（现有 ' + tk.n + ' 张）' : '')],
        ['十连', ten + (tk ? ' · 或 ' + tkIco + ' ' + tkName + '×10' : '') + ' · 保底至少 1 个 SR'],
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
    if (r.error) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast(r.error); return; }
    last = { results: isFree ? [r] : [r], pid: pid, n: 1, free: isFree };
    sndResults(last.results);
    if (!isFree) { /* 单抽结果也给返回 */ }
    CV.push('recruit_result');
  });
  CV.on('pull10:*', function (arg) {
    const pid = String(arg).split(':')[0];
    const r = Core.recruitTen(pid);
    if (r.error) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast(r.error); return; }
    /* V1.0.4 · R9（父亲大人 09-27 点单）：十连 —— 只报"哪个池、出了几张"，
       不报任何具体角色 / 账号（后台要的是漏斗，不是玩家抽到了谁）。 */
    try { if (G.LOG) G.LOG.event('gacha_ten', { pool: String(pid), count: (r.results || []).length }); } catch (e) {}
    last = { results: r.results, pid: pid, n: 10, free: false };
    sndResults(last.results);
    CV.push('recruit_result');
  });
  /* ================= V1.1.16（0927-Y 数值轮 · 报告 §6-8①）：普通池「连抽 ×10」＝一次 100 抽 =================
     点数出口（报告 §四：建筑点满后 90 天剩 727 万 ◉）。
     口径：**先报价再抽**（确认弹窗把"抽几组、花多少、有券先用券"写清），
           抽卡本体走 `Core.recruitBulk`（内部就是 `recruitTen` 连环调用，出率/保底/记账同源）。
     ⚠️ 钱不够时会**抽到一半停**：返回里带 `done` / `stops`，弹窗按实际组数报账 ——
        不许把"以为 100 抽"写进结果页（那是骗玩家的账）。 */
  CV.on('pull100:*', function (arg) {
    const pid = String(arg).split(':')[0];
    const p = D.RECRUIT_POOLS[pid];
    if (!p) return;
    const cost = p.ten || p.cost;
    const price = Object.keys(cost).map(function (k) { return curIcon(k) + fmt(cost[k] * 10); }).join('');
    const tk = Core.ticketOf(pid);
    const byTicket = !!(tk && tk.n >= 100);
    U.confirm('连抽 ×10（共 100 抽）',
      byTicket
        ? ('这一次会用掉 100 张' + (((D.ITEMS[tk.id] || {}).name) || tk.id) + '（现有 ' + tk.n + ' 张），不花货币。')
        : ('费用 ' + price + '（＝10 次十连），有对应招募券时会先用券。'),
      function () {
        const r = Core.recruitBulk(pid, 10);
        if (r.error) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast(r.error); return; }
        try { if (G.LOG) G.LOG.event('gacha_ten', { pool: String(pid), count: (r.results || []).length }); } catch (e) {}
        last = { results: r.results, pid: pid, n: (r.results || []).length, free: false, bulk: true };
        sndResults(last.results);
        CV.push('recruit_result');
        if (r.stops) CV.toast('抽到第 ' + r.done + ' 组停了：' + r.stops);
      },
      { chips: [byTicket ? ('用券 ' + (((D.ITEMS[tk.id] || {}).name) || tk.id) + ' ×100') : ('花费 ' + price),
        '共 100 抽（10 组十连）', byTicket ? '不动货币' : '有券先用券'],
        note: '点下去就按 10 次十连依次抽完；中途不够会停在那一组，结果页只列真抽到的。' });
  });
  /* B7 · 高级池：看广告免费 1 抽（配额在 wx-adapter 的 LIMITS.recruit_adv ＝ 10/天） */
  CV.on('ad_pull1:*', function (arg) {
    /* 弱网：先给一句人话，别让玩家白等（R3） */
    if (G.ADWEAK && G.ADWEAK.block()) return;
    const pid = String(arg).split(':')[0];
    const AD = G.AD;
    if (!AD || !AD.show) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast('这个版本没有广告模块'); return; }
    AD.show('recruit_adv').then(function (r) {
      if (!r || !r.granted) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast(r && r.reason === 'total' ? '今天看广告的次数用完了' : '今天这个免费次数用完了'); CV.render(); return; }
      const got = Core.adRecruitAdv ? Core.adRecruitAdv() : null;
      if (!got || got.error) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast((got && got.error) || '抽不了'); return; }
      last = { results: [got], pid: pid, n: 1, free: true };
      sndResults(last.results);
      CV.push('recruit_result');
    });
  });
  CV.on('again', function () {
    if (!last) { CV.toast('没有可继续的招募'); return; }
    const pid = last.pid, n = last.n;
    const r = n >= 10 ? Core.recruitTen(pid) : Core.recruitOnce(pid);
    if (r.error) { if (G.AUD && G.AUD.play) G.AUD.play('error'); CV.toast(r.error); return; }
    /* 「再来一次」也是十连的一条腿（结果页那颗）—— 同一口径记账，别只记第一次 */
    if (n >= 10) { try { if (G.LOG) G.LOG.event('gacha_ten', { pool: String(pid), count: (r.results || []).length }); } catch (e) {} }
    last = { results: n >= 10 ? r.results : [r], pid: pid, n: n, free: false };
    sndResults(last.results);
    CV.render();
  });
  /* ---------- SSR 自选券（网页版 ssrPickModal） ----------
     选一名 SSR 入队；已拥有的转成碎片。选完原地换成"结果 + 剩 N 张 + 返回招募"。 */
  let ssrDone = null;
  CV.register('ssr_pick', function () {
    const S = Core.S;
    U.begin();
    U.pageHead('SSR 自选券（剩 ' + (S.ssrTicket || 0) + ' 张）', { backId: 'ssr_back' });   // 吸顶（同上）
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
    /* V1.1.14（0927-F）：碎片改成"抽到谁就是谁的" —— 已拥有的进**他自己**那份；
       他已经满星才会转成 SSR 通用碎片（可给同档别人用）。文案跟着说清。 */
    U.note('选一名 SSR 伙伴入队；已拥有的伙伴会进他自己的碎片（他满星之后才转成 SSR 通用碎片，同档别人可以用）。', 0);
    U.space(CV.SP[2]);
    /* 2026-09-27（父亲大人："就没有隐藏角色这种概念"）：自选池不再排除任何人 */
    const ssrs = D.characters.filter(function (c) { return c.rarity === 'SSR'; });
    const cols = 3, gap = CV.SP[2];
    /* V1.1（基准 §4.2）：让出铭牌带。V1.0.5：带高与结果卡/伙伴卡统一成网页版的 **22px**
       —— 同一个品质框组件在三处卡片上厚薄必须一样（原来是 16 / 16 / 18 三个数）。 */
    const SSBAND = 22 * CV.SCALE;
    const cw = (U.cw() - gap * (cols - 1)) / cols, ch = 132 * CV.SCALE + SSBAND, y0 = U.y;
    ssrs.forEach(function (c, i) {
      const x = U.pad() + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const col = rarColor(c.rarity);
      CV.qframe(x, y, cw, ch, c.rarity, 12 * CV.SCALE, SSBAND);
      const asz = 46 * CV.SCALE, acx = x + cw / 2;
      CV.ctx.beginPath(); CV.ctx.arc(acx, y + 10 * CV.SCALE + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.a(CV.C.panel3, .50); CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = col; CV.ctx.stroke();
      CV.text(String(c.name || '?').slice(0, 1), acx, y + 10 * CV.SCALE + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: col });
      CV.text(CV.fit(c.name, cw - 10 * CV.SCALE, CV.FS.lg, true), acx, y + 10 * CV.SCALE + asz + 12 * CV.SCALE, { size: CV.FS.lg, bold: true, align: 'center' });
      /* V1.1.12（0927-B · 三机型复审）：这行是"命格 · 阵营"，3 列网格在 320 上每格只有 ~93pt，
         单行 `CV.fit` 把「念动力 · 仙界」砍成「念动力 · …」（320 上实测 6 张卡全中）。
         卡片下方本来就有 ~46pt 空档（头像 46 ＋ 名字 ＋ 这行，卡片高 154）→ **折到两行**即可，
         信息一个字不丢、也不动卡片高度与网格。 */
      const subLines = CV.wrap(c.bloodline + ' · ' + c.faction, cw - 10 * CV.SCALE, CV.FS.sm, 2);
      subLines.forEach(function (ln, k2) {
        CV.text(ln, acx, y + 10 * CV.SCALE + asz + 30 * CV.SCALE + (k2 - (subLines.length - 1) / 2) * CV.FS.sm * 1.3,
          { size: CV.FS.sm, align: 'center', color: CV.C.dim });
      });
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
    /* F2-7（抢修单 0928R3 · 大额 / 不可逆补二次确认）：SSR 自选券是**一张券换一个人**，
       点了就没了（券本来就稀）—— 以前这一下直接生效、一句都不问。
       名字取的是玩家点的那张卡，不再靠 Core 回话里的文案。 */
    const c = (D.characters || []).filter(function (x) { return x.id === id; })[0] || {};
    U.confirm('使用自选券', '用掉 1 张 SSR 自选券，把「' + (c.name || id) + '」收到队里'
      + '（现有券 ' + (Core.S.ssrTicket || 0) + ' 张）。这张券用掉就没了，确定吗？', function () {
      const r = Core.ssrTicketUse(id);
      if (!r.ok) { CV.toast(r.msg || '无法选择'); return; }
      ssrDone = r.msg || '已获得';
      CV.toast('🎫 ' + ssrDone);
      CV.render();
    }, { okLabel: '用券' });
  });
  CV.on('ssr_back', function () { CV.pop(); });
})();
