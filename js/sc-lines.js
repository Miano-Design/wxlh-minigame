/* 六条养成线的小页面（照网页版 js/ui.js 逐个复刻）
   ------------------------------------------------------------------------------
   · 秘术阁 kejiModal   ：头部卡（已修 x/1505 级 + 结晶余额）+ 每条线一行（图标 / 名字 / Lv / 当前→下一级 / 升1级）
   · 法宝   fabaoModal  ：头部卡（已得 x/20 + 当前佩戴）+ 每件（品质 / 名称 / 效果 / 价格 / 购买或佩戴）
   · 坐骑   mountModal  ：头部卡（已驯服 x/7 + 当前乘骑）+ 每匹（品质 / 名称 / 效果 / 驯服价 / 驯服或乘骑）
   · 药园   gardenModal ：头部卡（x/4 块在用）+ 每块地（第 N 块 / 空地或作物 / 可种说明 / 播种或收获）+ 一键收成熟
   · 斗法台 arenaModal  ：头部卡（第 N 台 + 今日剩余 + 本台奖励）+ 挑战按钮 + 本台守擂者
   · 求签   signModal   ：头部卡（摇一签 / 今日已求 + 累计）+ 五档签文（档位 / 签文 / 奖励 / 权重）
   数值全部走 Core / D，界面只负责摆位置。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  /* 顶部返回条（二级页统一样式） */
  function head(title) {
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'page_back');
    CV.text(title, U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
  }
  CV.on('page_back', () => CV.pop());

  /* ---------- 秘术阁 ---------- */
  CV.register('keji', function () {
    const S = Core.S;
    const coin = S.cur[D.KEJI_COIN] || 0;
    const total = D.KEJI.reduce((s, k) => s + Core.kejiLv(k.id), 0);
    const maxTotal = D.KEJI.reduce((s, k) => s + k.max, 0);
    U.begin();
    head('秘术阁');
    U.card(function () {
      U.h3('秘术阁', '已修 ' + total + ' / ' + maxTotal + ' 级');
      U.note('升级只花 ◆ 异界结晶 · 前 8 条加战斗，后 4 条加挂机经济', 2 * CV.SCALE);
      U.kv('◆ 异界结晶', fmt(coin), CV.C.gold);
    });
    U.card(function () {
      D.KEJI.forEach(function (k) {
        const lv = Core.kejiLv(k.id);
        const cost = Core.kejiCostOf(k.id);
        const cur = lv ? (k.rate * lv * 100) : 0;
        const next = cost === null ? cur : (k.rate * (lv + 1) * 100);
        const top = U.y, h = 56 * CV.SCALE;
        CV.text(k.ico, U.ix(), top + h / 2, { size: CV.ICO * CV.SCALE, align: 'left' });
        const tx = U.ix() + 30 * CV.SCALE;
        const bw = 78 * CV.SCALE;
        const textW = U.iw() - 30 * CV.SCALE - bw - 8 * CV.SCALE;
        CV.text(CV.fit(k.name, textW, CV.FS.lg, true), tx, top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        const nw = CV.measure(k.name, CV.FS.lg, true);
        const tag = 'Lv.' + lv + ' / ' + k.max;
        const tw = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE;
        CV.round(tx + nw + 6 * CV.SCALE, top + 8 * CV.SCALE, tw, 16 * CV.SCALE, CV.RADIUS_SM, null, CV.C.line2);
        CV.text(tag, tx + nw + 6 * CV.SCALE + tw / 2, top + 16 * CV.SCALE, { size: CV.FS.xs, color: CV.C.text2, align: 'center' });
        const sub = k.info + ' 当前 +' + cur.toFixed(1) + '%'
          + (cost === null ? ' · 已满级' : (' → 下一级 +' + next.toFixed(1) + '%（需 ◆ ' + fmt(cost) + '）'));
        CV.text(CV.fit(sub, textW, CV.FS.sm), tx, top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        const can = cost !== null && coin >= cost;
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          cost === null ? '满级' : '升 1 级', 'ghost', can ? 'keji_up:' + k.id : '');
        U.y = top + h;
      });
    });
  });
  D.KEJI.forEach(function (k) {
    CV.on('keji_up:' + k.id, function () {
      const r = Core.kejiUp(k.id);
      CV.toast(r.msg || (r.ok ? '已升级' : '升不了'));
      CV.render();
    });
  });

  /* ---------- 法宝 ---------- */
  CV.register('fabao', function () {
    const st = Core.fabaoState();
    const on = st.on ? D.fabaoById(st.on) : null;
    U.begin();
    head('法宝');
    U.card(function () {
      U.h3('法宝', '已得 ' + st.own.length + ' / ' + D.FABAO.length + ' 件');
      U.note('主角同时只带 1 件 · 用 ◆ 异界结晶 购买', 2 * CV.SCALE);
      U.kv('当前佩戴', on ? (on.name + '（' + on.desc + '）') : '未佩戴', CV.C.gold);
    });
    U.card(function () {
      D.FABAO.forEach(function (f) {
        const own = st.own.indexOf(f.id) >= 0;
        const wearing = st.on === f.id;
        const top = U.y, h = 52 * CV.SCALE;
        CV.text(f.rarity, U.ix(), top + h / 2 - 8 * CV.SCALE, { size: CV.FS.sm, bold: true, color: rarColor(f.rarity) });
        const tx = U.ix() + 40 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        CV.text(CV.fit(f.name, U.iw() - 40 * CV.SCALE - bw - 8 * CV.SCALE, CV.FS.lg, true), tx, top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text(CV.fit(f.desc, U.iw() - 40 * CV.SCALE - bw - 8 * CV.SCALE, CV.FS.sm), tx, top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        if (!own) {
          /* V9.6.112：法宝改扣 **◈ 点数**（和网页版一致的修正）——原来的 ◆ 异界结晶
             最便宜也要 1000，新号根本买不起，主线"获得 1 件法宝"永远完不成。 */
          const can = (Core.S.cur.points || 0) >= f.cost;
          U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
            '◈ ' + fmt(f.cost), 'ghost', can ? 'fabao_buy:' + f.id : '');
        } else {
          const by2 = top + (h - U.BTN_SM * CV.SCALE) / 2;
          U.btn(U.ix() + U.iw() - bw, by2, bw, U.BTN_SM * CV.SCALE,
            wearing ? '佩戴中' : '佩戴', wearing ? 'primary' : 'ghost', wearing ? '' : 'fabao_wear:' + f.id);
          /* V9.6.130：法宝多一条"祭炼"线（每级把效果放大 5%，上限 15 级） */
          {
            const lv = Core.fabaoLv(f.id), mx = D.FABAO_MAX_LV;
            U.btn(U.ix() + U.iw() - bw * 2 - 6 * CV.SCALE, by2, bw, U.BTN_SM * CV.SCALE,
              lv >= mx ? '祭炼满' : ('祭炼 ' + lv + '→' + (lv + 1)), lv >= mx ? 'ghost' : 'gold',
              lv >= mx ? '' : 'fabao_refine:' + f.id);
          }
        }
        U.y = top + h;
      });
    });
  });
  D.FABAO.forEach(function (f) {
    CV.on('fabao_buy:' + f.id, function () {
      const r = Core.buyFabao(f.id);
      CV.toast(r.msg || (r.ok ? '已购入' : '买不了'));
      CV.render();
    });
    CV.on('fabao_wear:' + f.id, function () {
      const r = Core.wearFabao(f.id);
      CV.toast(r.msg || '已佩戴');
      CV.render();
    });
  });

  /* ---------- 坐骑 ---------- */
  CV.register('mount', function () {
    const st = Core.mountState();
    const on = st.on ? D.mountById(st.on) : null;
    U.begin();
    head('坐骑');
    U.card(function () {
      U.h3('坐骑', '已驯服 ' + st.own.length + ' / ' + D.MOUNTS.length + ' 匹');
      U.note('全队通用，伙伴也吃。同时只骑 1 匹，随时能换；花 ◈ 点数 + 强化材料驯服，高阶坐骑额外花 ◆ 异界结晶。', 2 * CV.SCALE);
      U.kv('当前乘骑', on ? (on.name + '（' + on.desc + '）') : '未乘骑', CV.C.gold);
    });
    U.card(function () {
      D.MOUNTS.forEach(function (m) {
        const own = st.own.indexOf(m.id) >= 0;
        const riding = st.on === m.id;
        const top = U.y, h = 52 * CV.SCALE;
        CV.text(m.rarity, U.ix(), top + h / 2 - 8 * CV.SCALE, { size: CV.FS.sm, bold: true, color: rarColor(m.rarity) });
        const tx = U.ix() + 40 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        CV.text(CV.fit(m.name, U.iw() - 40 * CV.SCALE - bw - 8 * CV.SCALE, CV.FS.lg, true), tx, top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        const costTxt = Object.keys(m.cost).filter((k) => k !== 'mat' && k !== 'matN')
          .map((k) => curIcon(k) + fmt(m.cost[k])).join(' + ')
          + (m.cost.mat ? (' + ' + ((D.ITEMS[m.cost.mat] || {}).name || m.cost.mat) + '×' + m.cost.matN) : '');
        CV.text(CV.fit(m.desc + (own ? '' : ' · 驯服需要 ' + costTxt), U.iw() - 40 * CV.SCALE - bw - 8 * CV.SCALE, CV.FS.sm),
          tx, top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        const by = top + (h - U.BTN_SM * CV.SCALE) / 2;
        if (!own) U.btn(U.ix() + U.iw() - bw, by, bw, U.BTN_SM * CV.SCALE, '驯服', 'ghost', 'mount_buy:' + m.id);
        else {
          /* V9.6.130：坐骑多一条喂养线（每级全属性 +0.4%，上限按稀有度）——
             买了就完事的话，后期这条功能就成摆设（父亲大人："各个功能都要跟着进度发展"）。 */
          const lv = Core.mountLv(m.id), mx = D.MOUNT_MAX_LV[m.rarity] || 10;
          const c = D.mountFeedCost(m, lv);
          U.btn(U.ix() + U.iw() - bw, by, bw, U.BTN_SM * CV.SCALE,
            riding ? '乘骑中' : '乘骑', riding ? 'primary' : 'ghost', riding ? '' : 'mount_wear:' + m.id);
          U.btn(U.ix() + U.iw() - bw * 2 - 6 * CV.SCALE, by, bw, U.BTN_SM * CV.SCALE,
            lv >= mx ? ('Lv.' + lv + ' 满') : ('喂养 Lv.' + lv + '→' + (lv + 1)), lv >= mx ? 'ghost' : 'gold',
            lv >= mx ? '' : 'mount_feed:' + m.id);
        }
        U.y = top + h;
      });
    });
  });
  D.MOUNTS.forEach(function (m) {
    CV.on('mount_buy:' + m.id, function () {
      const r = Core.buyMount(m.id);
      CV.toast(r.msg || (r.ok ? '已驯服' : '驯服不了'));
      CV.render();
    });
    CV.on('mount_wear:' + m.id, function () {
      const r = Core.wearMount(m.id);
      CV.toast(r.msg || '已乘骑');
      CV.render();
    });
  });

  /* ---------- 药园 ---------- */
  CV.register('garden', function () {
    const plots = Core.gardenState();
    const busy = plots.filter((p) => p.plot).length;
    U.begin();
    head('药园');
    U.card(function () {
      U.h3('药园', busy + ' / ' + D.GARDEN_PLOTS + ' 块在用');
      U.note('有几率出稀有物（兽魂石 / 装备箱）', 2 * CV.SCALE);
    });
    U.card(function () {
      plots.forEach(function (p, i) {
        const top = U.y, h = 62 * CV.SCALE;
        const ready = p.plot && p.leftMs <= 0;
        CV.text('第 ' + (i + 1) + ' 块', U.ix(), top + 12 * CV.SCALE, { size: CV.FS.lg, bold: true });
        const bw = 84 * CV.SCALE;
        const textW = U.iw() - bw - 8 * CV.SCALE;
        const state = !p.plot ? '空地'
          : (ready ? '已成熟，可以收了' : ('生长中 · 还需 ' + (G.formatDuration ? G.formatDuration(Math.ceil(p.leftMs / 1000)) : '')));
        CV.text(CV.fit(state, textW, CV.FS.sm), U.ix(), top + 32 * CV.SCALE, { size: CV.FS.sm, color: ready ? CV.C.green : CV.C.dim });
        const desc = !p.plot
          ? ('可种「' + (D.GARDEN[i] || {}).name + '」：' + ((D.GARDEN[i] || {}).desc || ''))
          : ('收 ' + ((D.GARDEN[i] || {}).desc || ''));
        CV.text(CV.fit(desc, textW, CV.FS.xs), U.ix(), top + 50 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (!p.plot) U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE, '播种', 'ghost', 'garden_plant:' + i);
        else U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          ready ? '收获' : '生长中', ready ? 'primary' : 'ghost', ready ? 'garden_get:' + i : '');
        U.y = top + h;
      });
      U.space(CV.SP[1]);
      U.btnRow([{ label: '一键收成熟的地', style: 'ghost', id: 'garden_all' }]);
    });
  });
  [0, 1, 2, 3].forEach(function (i) {
    CV.on('garden_plant:' + i, function () {
      const r = Core.plantGarden(i, (D.GARDEN[i] || {}).id);
      CV.toast(r.msg || '已播种');
      CV.render();
    });
    CV.on('garden_get:' + i, function () {
      const r = Core.harvestGarden(i);
      CV.toast(r.msg || '已收获');
      CV.render();
    });
  });
  CV.on('garden_all', function () {
    const r = Core.harvestAllGarden();
    CV.toast(r.msg || '有成熟的地就收了');
    CV.render();
  });

  /* ---------- 斗法台 ---------- */
  CV.register('arena', function () {
    const st = Core.arenaState();
    U.begin();
    head('斗法台');
    U.card(function () {
      U.h3('斗法台', '第 ' + st.floor + ' 台');   // V9.6.24：斗法台也是一直往上打，去掉历史最高
      U.note('每天 ' + st.cap + ' 次机会，赢了升一台并拿 ◆ 异界结晶 + ♜ 深井徽记，输了退一台。', 2 * CV.SCALE);
      U.kv('今日剩余', st.left + ' / ' + st.cap);
      U.kv('本台奖励', '◆ ' + fmt(st.reward.otherworld) + ' · ♜ ' + st.reward.corridor, CV.C.gold);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '挑战第 ' + st.floor + ' 台', style: 'primary', id: st.left > 0 ? 'arena_fight' : '' }]);
    });
    U.card(function () {
      U.h3('本台守擂者');
      st.enemies.forEach(function (e) {
        const top = U.y, h = 48 * CV.SCALE;
        CV.text(CV.fit(e.name, U.iw() * 0.5, CV.FS.lg, true), U.ix(), top + h / 2, { size: CV.FS.lg, bold: true });
        CV.text('HP ' + fmt(e.hp) + ' · 攻 ' + fmt(e.atk) + ' · 防 ' + fmt(e.def) + ' · 速 ' + e.spd,
          U.ix() + U.iw(), top + h / 2, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
        U.y = top + h;
      });
    });
  });
  CV.on('arena_fight', function () {
    const st = Core.arenaState();
    const allies = G.BattleUI.buildAllies(null, null);
    if (!allies.length) { CV.toast('没有可出战的成员'); return; }
    G.BattleUI.run({
      title: '斗法台 · 第 ' + st.floor + ' 台',
      allies: allies, enemies: st.enemies, worldId: null, maxRounds: 40,
      onQuit: function () { CV.reset('arena'); },
      onClose: function () { G.BattleUI.clear && G.BattleUI.clear(); CV.reset('arena'); },   // V9.6.124：收下奖励后回斗法台（原来靠兜底 → 被送到残域）
      onEnd: function (win) {
        const r = Core.arenaSettle(win);
        /* V9.6.128（父亲大人："斗法台改后两个按钮的功能不是一摸一样吗，那还有必要留着两个吗"）：
           补了 onClose 之后，底部那颗「收下奖励并返回」已经回斗法台了 ——
           这里再挂一颗「返回斗法台」就是同一件事两颗按钮。**去掉**，只留底部那颗。
           （失败时也一样：底部的文案会变成「返回」。） */
        return { title: win ? '守擂成功' : '守擂失败', sub: r.msg || '', rewards: [], acts: [] };
      },
    });
  });
  CV.on('mount_feed:*', function (id) {
    const r = Core.feedMount(id);
    CV.toast(r.msg || '喂过了');
    CV.render();
  });
  CV.on('fabao_refine:*', function (id) {
    const r = Core.refineFabao(id);
    CV.toast(r.msg || '祭炼过了');
    CV.render();
  });

  CV.on('arena_back', function () { G.BattleUI.clear && G.BattleUI.clear(); CV.reset('arena'); });

  /* ---------- 求签 ---------- */
  CV.register('sign', function () {
    const st = Core.signState();
    const pick = st.pick;
    U.begin();
    head('求签');
    U.card(function () {
      U.h3('求签', '每天免费 1 次');
      U.note('签文分五档（大吉 → 末吉），给当天的挂机加成，只算当天，隔天自动失效——上线先求一签，再看今天要打哪儿。', 2 * CV.SCALE);
      U.space(CV.SP[1]);
      if (st.canDraw) U.btnRow([{ label: '🎋 摇 一 签', style: 'gold', id: 'sign_draw' }]);
      else {
        U.note('今日已求：【' + (pick ? pick.tier : st.tier) + '】' + (pick ? ' ' + pick.text : ''), 2 * CV.SCALE);
        U.hint('今日挂机产出 +' + Math.round(st.idlePct * 100) + '%', 4 * CV.SCALE);
      }
      U.hint('累计求签 ' + st.total + ' 次 · 每天 0 点重置', 6 * CV.SCALE);
    });
    U.card(function () {
      U.h3('五档签文', '能摇到哪一档在摇之前就知道');
      D.SIGNS.forEach(function (s) {
        const top = U.y, h = 52 * CV.SCALE;
        const tw = CV.measure(s.tier, CV.FS.xs) + 12 * CV.SCALE;
        CV.round(U.ix(), top + 16 * CV.SCALE, tw, 17 * CV.SCALE, CV.RADIUS_SM, null, 'rgba(230,182,76,.4)');
        CV.text(s.tier, U.ix() + tw / 2, top + 24.5 * CV.SCALE, { size: CV.FS.xs, color: CV.C.gold, align: 'center' });
        const tx = U.ix() + tw + 10 * CV.SCALE;
        const pw = CV.measure(Math.round(s.weight) + '%', CV.FS.sm) + 4 * CV.SCALE;
        CV.text(CV.fit(s.text, U.iw() - (tx - U.ix()) - pw, CV.FS.lg), tx, top + 18 * CV.SCALE, { size: CV.FS.lg });
        CV.text(CV.fit('挂机 +' + Math.round(s.idlePct * 100) + '% · ' + Core.rewardTextOf(s.gain), U.iw() - (tx - U.ix()) - pw, CV.FS.sm),
          tx, top + 38 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        CV.text(Math.round(s.weight) + '%', U.ix() + U.iw(), top + h / 2, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
        U.y = top + h;
      });
      U.hint('权重合计 ' + D.SIGNS.reduce((a, s) => a + s.weight, 0) + '%', 4 * CV.SCALE);
    });
  });
  CV.on('sign_draw', function () {
    const r = Core.drawSign();
    CV.toast(r.msg || '已求签');
    CV.render();
  });
})();
