/* 成长 + 兑换大厅 —— 照网页版 js/ui.js 的 growScreen / shopModal 复刻
   ------------------------------------------------------------------------------
   成长：十三条养成线一条一行（网页版 .grow-row：图标 22 + 名称 + 说明 + 右侧当前值金色右对齐），
         未解锁的那几条也照样列出来（点进去给"通关X解锁"的提示）。
   商店：顶上一排店铺胶囊（名字 + 括号里"当前持有该货币"）→ 一行"本店用什么结算" →
         货架行（名称 + 价格/限购/解锁条件 + 右侧"购买/未解锁"按钮）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };
  const curName = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.name : k; };
  let shopTab = 'god';

  /* ---------- 成长 ---------- */
  CV.register('grow', function () {
    const S = Core.S;
    const r = Core.realmState(), au = Core.authorityInfo();
    const gl = D.GENE_LOCKS[S.player.geneLock - 1];
    const beasts = Object.keys((S.beast && S.beast.owned) || {}).length;
    const bLv = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const kejiLv = D.KEJI.reduce((s, k) => s + Core.kejiLv(k.id), 0);
    const rows = [
      { act: 'open_buildings', unlock: 'buildings', ico: '🏗', name: '基地建设', cur: 'Lv.' + bLv + ' / ' + Object.keys(S.buildings).length * 50,
        desc: '花 ◉ 点数，永久提升挂机产出 / 经验 / 离线上限 / 强化折扣' },
      { act: 'open_authority', unlock: 'buildings', ico: '🔑', name: '灯阁权限', cur: 'Lv.' + au.lv + ' / ' + au.max,
        desc: '花 ✦ 圣洁晶石 + ◆ 异界结晶，永久提升挂机产出、离线效率、每日扫荡次数' },
      { act: 'open_sect', unlock: null, ico: '🏯', name: '灯阁评级', cur: 'Lv.' + Core.sectInfo().lv + ' / ' + D.SECT_MAX,
        desc: '打关卡自动涨的全局评级，每级全队全属性 +0.5%，不用手动点' },
      { act: 'open_keji', unlock: null, ico: '📜', name: '秘术阁', cur: '已修 ' + kejiLv + ' / ' + D.KEJI.reduce(function (a, k) { return a + k.max; }, 0) + ' 级',
        desc: D.KEJI.length + ' 条百分比长线（战斗 + 挂机经济），花 ◆ 异界结晶，点一下立刻生效' },
      { act: 'open_fabao', unlock: null, ico: '🔮', name: '法宝', cur: '已得 ' + Core.fabaoState().own.length + ' / ' + D.FABAO.length + ' 件',
        desc: '装备给数值、法宝给效果（吸血 / 开场能量 / 减伤），主角同时带 1 件，花 ◆ 异界结晶买' },
      { act: 'open_garden', unlock: null, ico: '🌱', name: '药园', cur: Core.gardenState().filter((p) => p.plot).length + ' / ' + D.GARDEN_PLOTS + ' 块在用',
        desc: '花 ◉ 点数种灵田，到点收强化材料，另有几率出稀有物；离线也计时' },
      { act: 'open_arena', unlock: null, ico: '🥋', name: '斗法台',
        cur: '第 ' + Core.arenaState().floor + ' 台 · 剩 ' + Core.arenaState().left + ' 次',
        desc: '每天 ' + D.ARENA_DAILY + ' 次镜像擂台，守擂者按你的战力换算，赢一场升一台拿结晶与徽记' },
      { act: 'open_mount', unlock: null, ico: '🐎', name: '坐骑', cur: '已驯服 ' + Core.mountState().own.length + ' / ' + D.MOUNTS.length + ' 匹',
        desc: '花 ◉ 点数 + 材料驯服，全队（含伙伴）永久加数值；同时只骑 1 匹，随时换' },
      { act: 'open_sign', unlock: null, ico: '🎋', name: '求签',
        cur: Core.signState().canDraw ? '今日还没求签' : ('今日【' + Core.signState().tier + '】'),
        desc: '每天免费摇一签，签文给当天的挂机加成 + 一笔硬通货，隔天自动失效' },
      { act: 'open_realm', unlock: null, ico: '🌌', name: '境界渡劫',
        cur: r.hasBloodline ? (r.curName + '（第 ' + r.realm + '/' + D.REALM_STAGE_COUNT + ' 阶）') : '未定血统',
        desc: '36 小阶，每阶全属性永久 +1.4%；失败只扣材料，等级不掉' },
      { act: 'open_genelock', unlock: 'geneLock', ico: '🧬', name: '铭刻',
        cur: S.player.geneLock > 0 ? (S.player.geneLock + ' 阶 · ' + gl.name) : '未解锁',
        desc: '20 阶全队加成，靠通关进度 + 玩家等级 + 异界结晶解锁' },
      { act: 'open_beast', unlock: 'beast', ico: '🐾', name: '伴生体',
        cur: beasts ? ('已孵化 ' + beasts + ' 只') : '还没孵化',
        desc: '第二条养成线：随行 1 只给全队加成，带对五行进本全队伤害 +15%' },
      { act: 'open_reincarn', unlock: 'reincarn', ico: '♾', name: '转生天赋',
        cur: S.player.reincarnations > 0 ? (S.player.reincarnations + ' 世') : '未转生',
        desc: '满级后重置进度换永久天赋点，四支天赋各 10 级；越早开始攒越划算' },
    ];
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'grow_back');
    CV.text('成长', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    rows.forEach(function (x) {
      const ok = !x.unlock || Core.isUnlocked(x.unlock);
      const rowH = 62 * CV.SCALE;
      U.card(function () {
        const top = U.y;
        CV.text(x.ico, U.ix(), top + rowH / 2 - 6 * CV.SCALE, { size: CV.DISP.d2 * CV.SCALE, align: 'left' });
        const tx = U.ix() + 34 * CV.SCALE;
        CV.text(x.name, tx, top + 15 * CV.SCALE, { size: CV.FS.f1, bold: true });
        /* 未解锁的行：右边写「未解锁」，说明位置换成"怎么解锁"（网页版 growScreen 同口径） */
        const curTxt = ok ? x.cur : '未解锁';
        const descTxt = ok ? x.desc : Core.unlockTip(x.unlock);
        if (!ok) CV.ctx.globalAlpha = 0.55;
        /* V9.6.142：右边那格原来**封死在 42% 宽** → 境界那行「炼气初期（第 0/36 阶）」
           被砍成「炼气初期（第 0/36 …」。改成"至少 42%，文字长就给到够"，
           反正左边只有名字（短），右边又是右对齐，不会打架。 */
        const cw = Math.min(U.iw() * 0.72, Math.max(U.iw() * 0.42, CV.measure(curTxt, CV.FS.md) + 4 * CV.SCALE));
        CV.text(CV.fit(curTxt, cw, CV.FS.md), U.ix() + U.iw(), top + 15 * CV.SCALE,
          { size: CV.FS.md, color: CV.C.gold, align: 'right' });
        const descLines = CV.wrap(descTxt, U.iw() - 34 * CV.SCALE, CV.FS.sm, 2);
        descLines.forEach(function (ln, i) {
          CV.text(ln, tx, top + 36 * CV.SCALE + i * CV.FS.sm * 1.55, { size: CV.FS.sm, color: CV.C.dim });
        });
        U.y = top + rowH;
        CV.hit(x.act, U.ix(), top - 14 * CV.SCALE, U.iw(), rowH + 14 * CV.SCALE);
        if (!ok) CV.ctx.globalAlpha = 1;
      });
    });
  });
  CV.on('grow_back', function () { CV.pop(); });

  /* ---------- 兑换大厅 ---------- */
  CV.register('shop', function () {
    const S = Core.S;
    const shop = D.SHOPS[shopTab];
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'shop_back');
    CV.text('兑换大厅', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    /* 店铺胶囊（横排，放不下就先不画） */
    const keys = Object.keys(D.SHOPS);
    const pillH = 44 * CV.SCALE, gap = 6 * CV.SCALE;
    let x = U.pad();
    keys.forEach(function (k) {
      const s = D.SHOPS[k];
      const label = s.name + '（' + curIcon(s.currency) + fmt(S.cur[s.currency] || 0) + '）';
      const w = CV.measure(label, CV.FS.md) + 28 * CV.SCALE;
      if (x + w > U.pad() + U.cw()) return;
      const on = shopTab === k;
      CV.round(x, U.y, w, pillH, pillH / 2, on ? '#3a1620' : CV.C.panel, on ? CV.C.accent : CV.C.line);
      CV.text(label, x + w / 2, U.y + pillH / 2, { size: CV.FS.md, align: 'center', color: on ? CV.C.text : CV.C.dim });
      CV.hit('shoptab:' + k, x, U.y, w, pillH);
      x += w + gap;
    });
    U.y += pillH + CV.SP[1];
    U.hint('本店用 ' + curIcon(shop.currency) + curName(shop.currency) + ' 结算', 2 * CV.SCALE);
    U.space(CV.SP[1]);
    U.card(function () {
      shop.items.forEach(function (it, i) {
        const key = shopTab + '_' + i + '_' + Core.dailyDate();
        const bought = (S.shop.bought || {})[key] || 0;
        const req = Core.shopReq(it);
        const soldOut = it.stock > 0 && bought >= it.stock;
        const top = U.y;
        U.listRow({
          t1: it.name,
          t2: curIcon(shop.currency) + ' ' + fmt(it.price)
            + (it.stock > 0 ? (' · 每日限' + it.stock + '（已购' + bought + '）') : '')
            + (req.ok ? '' : (' · 🔒 ' + req.req + '后上架')),
          rightW: 90 * CV.SCALE,
        });
        const bw = 78 * CV.SCALE;
        const can = req.ok && !soldOut;
        U.btn(U.ix() + U.iw() - bw, top + (U.y - top) / 2 - U.BTN_SM * CV.SCALE / 2, bw, U.BTN_SM * CV.SCALE,
          req.ok ? (soldOut ? '已售罄' : '购买') : '未解锁', 'ghost', can ? 'buy:' + i : '');
      });
    });
  });
  CV.on('shop_back', function () { CV.pop(); });
  /* 供别的页面打开指定店铺（深井商店） */
  G.setShopTab = function (k) { if (D.SHOPS[k]) shopTab = k; };
  Object.keys(D.SHOPS || {}).forEach(function (k) {
    CV.on('shoptab:' + k, function () { shopTab = k; CV.render(); });
  });
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(function (i) {
    CV.on('buy:' + i, function () {
      const r = Core.buyShopItem(shopTab, i);
      CV.toast(r.msg || (r.ok ? '购买成功' : '买不了'));
      CV.render();
    });
  });
})();
