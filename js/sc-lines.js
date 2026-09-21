/* 六条养成线的小页面（照网页版 js/ui.js 逐个复刻）
   ------------------------------------------------------------------------------
   · 秘术阁 kejiModal   ：头部卡（已修 x/1505 级 + 结晶余额）+ 每条线一行（图标 / 名字 / Lv / 当前→下一级 / 升1级）
   · 法宝   fabaoModal  ：头部卡（已得 x/20 + 当前佩戴）+ 每件（品质 / 名称 / 效果 / 价格 / 购买或佩戴）
                        └ fabao_detail：二级页（当前效果 / 祭炼 / 佩戴），V9.6.133 起祭炼搬出列表
   · 坐骑   mountModal  ：头部卡（已驯服 x/7 + 当前乘骑）+ 每匹（品质 / 名称 / 效果 / 驯服价 / 驯服或乘骑）
                        └ mount_detail：二级页（基础效果 / 喂养加成 / 合计效果 / 喂养 / 乘骑）
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
  /* 法宝 / 坐骑的二级详情页要记住"在看哪一件"（和伴生体 beastDetailId 同一个套路） */
  let fabaoDetailId = null, mountDetailId = null;

  /* 法宝 / 坐骑的养成线（祭炼 / 喂养）V9.6.133 起搬到**二级界面**。
     起因（父亲大人）：「法宝和坐骑做的养成系统挡到数值了，点名字进去看详细信息以及养成」——
     原来一行里挤两个按钮，名字和效果都没地方站。现在列表行只留一个按钮。 */
  const GEAR_EFF_LABEL = {
    atkPct: '攻击', hpPct: '生命', defPct: '防御', spdPct: '速度', critPct: '暴击率',
    critDmg: '暴击伤害', skillPct: '技能伤害', evaPct: '闪避', resPct: '减伤',
    dmgReduce: '减伤', lifesteal: '吸血', spiritPct: '精神', initEnergy: '开场能量',
  };
  /* 百分比留一位小数 —— 祭炼一级 +5%，4% 会点出 4.2% 这种数，取整就看不出差别了 */
  function gearEffText(o) {
    const parts = Object.keys(o || {}).map(function (k) {
      const t = GEAR_EFF_LABEL[k] || k;
      return (k === 'initEnergy') ? (t + ' +' + Math.round(o[k])) : (t + ' +' + (Math.round(o[k] * 1000) / 10) + '%');
    });
    return parts.length ? parts.join(' · ') : '—';
  }

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
        const top = U.y;
        const sub0 = k.info + ' 当前 +' + cur.toFixed(1) + '%'
          + (cost === null ? ' · 已满级' : (' → 下一级 +' + next.toFixed(1) + '%（需 ◆ ' + fmt(cost) + '）'));
        /* V9.6.142：这一行原来单行 fit → 尾巴「→ 下一级 +0.4%（需 ◆ 13）」被砍成「…」。
           现在折到最多两行，行高跟着算 —— 12 条线一条不漏地看得见升级收益和价钱。 */
        const bw = 78 * CV.SCALE;
        const textW0 = U.iw() - 30 * CV.SCALE - bw - 8 * CV.SCALE;
        const subLines = CV.wrap(sub0, textW0, CV.FS.sm, 2);
        const h = (subLines.length > 1 ? 74 : 56) * CV.SCALE;
        CV.text(k.ico, U.ix(), top + h / 2, { size: CV.ICO * CV.SCALE, align: 'left' });
        const tx = U.ix() + 30 * CV.SCALE;
        const textW = textW0;
        CV.text(CV.fit(k.name, textW, CV.FS.lg, true), tx, top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        const nw = CV.measure(k.name, CV.FS.lg, true);
        const tag = 'Lv.' + lv + ' / ' + k.max;
        const tw = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE;
        CV.round(tx + nw + 6 * CV.SCALE, top + 8 * CV.SCALE, tw, 16 * CV.SCALE, CV.RADIUS_SM, null, CV.C.line2);
        CV.text(tag, tx + nw + 6 * CV.SCALE + tw / 2, top + 16 * CV.SCALE, { size: CV.FS.xs, color: CV.C.text2, align: 'center' });
        subLines.forEach(function (ln, k2) {
          CV.text(ln, tx, top + (36 + k2 * 18) * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        });
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
        const lv = Core.fabaoLv(f.id);
        const top = U.y;
        const tx = U.ix() + 40 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        const textW = U.iw() - 40 * CV.SCALE - bw - 8 * CV.SCALE;
        /* V9.6.142：效果说明原来单行 fit → 尾巴「· 祭炼 3/15」被砍成「…」。
           折到最多两行，行高跟着算（稀有度标签仍按行高垂直居中）。 */
        const dLines = CV.wrap(f.desc + (own ? ' · 祭炼 ' + lv + '/' + D.FABAO_MAX_LV : ''), textW, CV.FS.sm, 3);
        const h = (52 + (dLines.length - 1) * 17) * CV.SCALE;
        CV.text(f.rarity, U.ix(), top + h / 2 - 8 * CV.SCALE, { size: CV.FS.sm, bold: true, color: rarColor(f.rarity) });
        CV.text(CV.fit(f.name, textW, CV.FS.lg, true), tx, top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        dLines.forEach(function (ln, k) {
          CV.text(ln, tx, top + (36 + k * 17) * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        });
        if (!own) {
          /* V9.6.112：法宝改扣 **◉ 点数**（和网页版一致的修正）——原来的 ◆ 异界结晶
             最便宜也要 1000，新号根本买不起，主线"获得 1 件法宝"永远完不成。 */
          const can = (Core.S.cur.points || 0) >= f.cost;
          U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
            '◉ ' + fmt(f.cost), 'ghost', can ? 'fabao_buy:' + f.id : '');
        } else {
          U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
            wearing ? '佩戴中' : '佩戴', wearing ? 'primary' : 'ghost', wearing ? '' : 'fabao_wear:' + f.id);
          /* V9.6.133：祭炼搬进二级页，这里只留一个"点名字进详情"的整块热区 */
          CV.hit('fabao_detail:' + f.id, U.ix(), top, U.iw() - bw - 6 * CV.SCALE, h);
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

  /* ---------- 法宝详情（二级）：当前效果 / 祭炼 / 佩戴 ---------- */
  CV.register('fabao_detail', function () {
    const f = D.fabaoById(fabaoDetailId) || null;
    const S = Core.S;
    U.begin(); head('法宝详情');
    if (!f || (S.fabao.own || []).indexOf(f.id) < 0) {
      U.card(function () { U.h3('法宝详情'); U.hint('这件法宝不在了（可能刚换过存档）', 4 * CV.SCALE); });
      return;
    }
    const lv = Core.fabaoLv(f.id), mx = D.FABAO_MAX_LV, maxed = lv >= mx;
    const wearing = S.fabao.on === f.id;
    const mul = Core.fabaoEffMul(f.id);
    const eff = {}; Object.keys(f.eff).forEach(function (k) { eff[k] = f.eff[k] * mul; });
    U.card(function () {
      U.h3(f.name, f.rarity + ' · 祭炼 ' + lv + ' / ' + mx);
      U.kv('基础效果', f.desc);
      U.kv('当前效果', gearEffText(eff), CV.C.gold);
      U.kv('状态', wearing ? '佩戴中' : '未佩戴', wearing ? CV.C.gold : CV.C.dim);
    });
    U.card(function () {
      U.h3('祭炼');
      U.note('每级把这条效果放大约 ' + Math.round(D.FABAO_LV_PCT * 100) + '%；祭炼满 = ×' + (1 + mx * D.FABAO_LV_PCT).toFixed(2), 2 * CV.SCALE);
      if (maxed) { U.hint('已经祭炼到顶。', 4 * CV.SCALE); return; }
      const c = D.fabaoRefineCost(f, lv);
      const haveMat = S.items[c.mat] || 0, haveOw = S.cur.otherworld || 0;
      U.kv((D.ITEMS[c.mat] || {}).name || c.mat, haveMat + ' / ' + c.matN, haveMat >= c.matN ? CV.C.green : CV.C.dim);
      U.kv('◆ 异界结晶', haveOw + ' / ' + c.otherworld, haveOw >= c.otherworld ? CV.C.green : CV.C.dim);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '🔥 祭炼到 Lv.' + (lv + 1), style: 'gold',
        id: (haveMat >= c.matN && haveOw >= c.otherworld) ? 'fabao_refine_now' : '' }]);
    });
    U.card(function () {
      U.h3('佩戴');
      U.hint('主角同时只带 1 件，随时能换。', 4 * CV.SCALE);
      U.btnRow([{ label: wearing ? '摘下' : '佩戴这件', style: wearing ? 'ghost' : 'primary', id: 'fabao_wear_now' }]);
    });
  });
  CV.on('fabao_detail:*', function (id) { fabaoDetailId = id; CV.push('fabao_detail'); });
  CV.on('fabao_refine_now', function () {
    const r = Core.refineFabao(fabaoDetailId);
    CV.toast(r.msg || '祭炼过了');
    CV.render();
  });
  CV.on('fabao_wear_now', function () {
    const on = Core.S.fabao.on === fabaoDetailId;
    const r = Core.wearFabao(on ? null : fabaoDetailId);
    CV.toast(r.msg || (on ? '已摘下' : '已佩戴'));
    CV.render();
  });

  /* ---------- 坐骑 ---------- */
  CV.register('mount', function () {
    const st = Core.mountState();
    const on = st.on ? D.mountById(st.on) : null;
    U.begin();
    head('坐骑');
    U.card(function () {
      U.h3('坐骑', '已驯服 ' + st.own.length + ' / ' + D.MOUNTS.length + ' 匹');
      U.note('全队通用，伙伴也吃。同时只骑 1 匹，随时能换；花 ◉ 点数 + 强化材料驯服，高阶坐骑额外花 ◆ 异界结晶。', 2 * CV.SCALE);
      U.kv('当前乘骑', on ? (on.name + '（' + on.desc + '）') : '未乘骑', CV.C.gold);
    });
    U.card(function () {
      D.MOUNTS.forEach(function (m) {
        const own = st.own.indexOf(m.id) >= 0;
        const riding = st.on === m.id;
        const lv = Core.mountLv(m.id), mx = D.MOUNT_MAX_LV[m.rarity] || 10;
        const top = U.y;
        const tx = U.ix() + 40 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        const textW = U.iw() - 40 * CV.SCALE - bw - 8 * CV.SCALE;
        const costTxt = Object.keys(m.cost).filter((k) => k !== 'mat' && k !== 'matN')
          .map((k) => curIcon(k) + fmt(m.cost[k])).join(' + ')
          + (m.cost.mat ? (' + ' + ((D.ITEMS[m.cost.mat] || {}).name || m.cost.mat) + '×' + m.cost.matN) : '');
        /* V9.6.142：同法宝 —— 单行 fit 会把「· 驯服需要 ◉ 5000…」砍掉，改成最多两行。 */
        /* 高阶坐骑的"驯服需要 …"要写三样（点数 + 结晶 + 材料），两行也不够 → 放到三行。 */
        const dLines = CV.wrap(m.desc + (own ? (' · 喂养 ' + lv + '/' + mx) : (' · 驯服需要 ' + costTxt)), textW, CV.FS.sm, 3);
        const h = (52 + (dLines.length - 1) * 17) * CV.SCALE;
        CV.text(m.rarity, U.ix(), top + h / 2 - 8 * CV.SCALE, { size: CV.FS.sm, bold: true, color: rarColor(m.rarity) });
        CV.text(CV.fit(m.name, textW, CV.FS.lg, true), tx, top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        dLines.forEach(function (ln, k) {
          CV.text(ln, tx, top + (36 + k * 17) * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        });
        const by = top + (h - U.BTN_SM * CV.SCALE) / 2;
        if (!own) U.btn(U.ix() + U.iw() - bw, by, bw, U.BTN_SM * CV.SCALE, '驯服', 'ghost', 'mount_buy:' + m.id);
        else {
          /* V9.6.133：喂养搬进二级页（原来两个按钮把名字和效果挤没了） */
          U.btn(U.ix() + U.iw() - bw, by, bw, U.BTN_SM * CV.SCALE,
            riding ? '乘骑中' : '乘骑', riding ? 'primary' : 'ghost', riding ? '' : 'mount_wear:' + m.id);
          CV.hit('mount_detail:' + m.id, U.ix(), top, U.iw() - bw - 6 * CV.SCALE, h);
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

  /* ---------- 坐骑详情（二级）：基础效果 / 喂养加成 / 合计效果 / 喂养线 ---------- */
  CV.register('mount_detail', function () {
    const m = D.mountById(mountDetailId) || null;
    const S = Core.S;
    U.begin(); head('坐骑详情');
    if (!m || (S.mount.own || []).indexOf(m.id) < 0) {
      U.card(function () { U.h3('坐骑详情'); U.hint('这匹坐骑不在了（可能刚换过存档）', 4 * CV.SCALE); });
      return;
    }
    const lv = Core.mountLv(m.id), mx = D.MOUNT_MAX_LV[m.rarity] || 10, maxed = lv >= mx;
    const riding = S.mount.on === m.id;
    const add = lv * D.MOUNT_LV_PCT;
    const total = Core.mountBonusPct(m.id);
    U.card(function () {
      U.h3(m.name, m.rarity + ' · 喂养 ' + lv + ' / ' + mx);
      U.kv('基础效果', m.desc);
      U.kv('喂养加成', '全属性 +' + (add * 100).toFixed(1) + '%（每级 +' + (D.MOUNT_LV_PCT * 100).toFixed(1) + '%）', CV.C.gold);
      U.kv('合计效果', gearEffText(total), CV.C.green);
      U.kv('状态', riding ? '乘骑中' : '未乘骑', riding ? CV.C.gold : CV.C.dim);
    });
    U.card(function () {
      U.h3('喂养');
      U.note('全队通用、伙伴也吃。上限按稀有度定：N 10 · R 12 · SR 15 · UR 20 级。', 2 * CV.SCALE);
      if (maxed) { U.hint('已经喂到顶。', 4 * CV.SCALE); return; }
      const c = D.mountFeedCost(m, lv);
      const haveMat = S.items[c.mat] || 0, havePt = S.cur.points || 0;
      U.kv((D.ITEMS[c.mat] || {}).name || c.mat, haveMat + ' / ' + c.matN, haveMat >= c.matN ? CV.C.green : CV.C.dim);
      U.kv('◉ 点数', havePt + ' / ' + c.points, havePt >= c.points ? CV.C.green : CV.C.dim);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '🍖 喂养到 Lv.' + (lv + 1), style: 'gold',
        id: (haveMat >= c.matN && havePt >= c.points) ? 'mount_feed_now' : '' }]);
    });
    U.card(function () {
      U.h3('乘骑');
      U.hint('同时只骑 1 匹，随时能换。', 4 * CV.SCALE);
      U.btnRow([{ label: riding ? '下坐骑' : '乘骑这匹', style: riding ? 'ghost' : 'primary', id: 'mount_ride_now' }]);
    });
  });
  CV.on('mount_detail:*', function (id) { mountDetailId = id; CV.push('mount_detail'); });
  CV.on('mount_feed_now', function () {
    const r = Core.feedMount(mountDetailId);
    CV.toast(r.msg || '喂养不了');
    CV.render();
  });
  CV.on('mount_ride_now', function () {
    const riding = Core.S.mount.on === mountDetailId;
    const r = Core.wearMount(riding ? null : mountDetailId);
    CV.toast(r.msg || (riding ? '已下坐骑' : '已乘骑'));
    CV.render();
  });

  /* ---------- 药园 ---------- */
  CV.register('garden', function () {
    const plots = Core.gardenState();
    const busy = plots.filter((p) => p.plot).length;
    U.begin();
    head('药园');
    U.card(function () {
      /* V9.6.137：地按进度开（基础 4 块，每通关 9 张图多 1 块，最多 8 块）。
         没开的地也画出来、灰着并写清"通关哪张图开"，玩家才知道药园还能扩。 */
      U.h3('药园', busy + ' 块在用 · 已开 ' + Core.gardenPlots() + ' / ' + D.GARDEN_MAX + ' 块');
      U.note('有几率出稀有物（兽魂石 / 装备箱）', 2 * CV.SCALE);
      U.hint('每通关 9 张图多开 1 块，同一种灵田可以多种一块。', 2 * CV.SCALE);
    });
    U.card(function () {
      plots.forEach(function (p, i) {
        const top = U.y;
        const bw = 84 * CV.SCALE;
        /* V9.6.142：说明改成**占满整行**（按钮挪到标题那一行的右边）。
           上一版把说明限制在"减去按钮宽"的 246px 里，第二行照样被砍成
           「→ 收 异界合金×12 · 20% 出 SR装…」—— 等于没修干净。 */
        const fullW = U.iw();
        /* V9.6.141/142：说明原来是一行 fit → 末尾被省略号切掉（"…出 兽魂石"整段没了）。
           现在按语义拆两行（状态 / 收什么），并且**占满整行宽度**，行高跟着算。 */
        const ready = p.plot && p.leftMs <= 0;
        const state2 = !p.plot ? 'empty' : (ready ? 'ready' : 'growing');
        const descLines = D.gardenRowLines(p.kind || {}, state2, p.leftMs / 1000)
          .map((t, k) => CV.fit(k === 0 ? t : ('→ ' + t), fullW, CV.FS.xs));
        /* 行内布局（按钮挪到**标题那一行的右边**，把下面的整行让给说明）：
             第 N 块            [播种]
             空地 · 可种「下品灵田」：◉ 800 · 10 分钟
             → 收 基础金属×5 · 15% 出 兽魂石×1 */
        const h = 72 * CV.SCALE;
        if (p.locked) {
          CV.text('第 ' + (i + 1) + ' 块', U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true, color: CV.C.dim });
          CV.text(CV.fit('🔒 未开垦 · ' + (p.req || '继续推图'), fullW, CV.FS.sm), U.ix(), top + 44 * CV.SCALE,
            { size: CV.FS.sm, color: CV.C.dim });
          U.y = top + 62 * CV.SCALE;
          return;
        }
        CV.text('第 ' + (i + 1) + ' 块', U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        const state = (p.plot ? '' : '空地 · ') + descLines[0];
        CV.text(CV.fit(state, fullW, CV.FS.sm), U.ix(), top + 44 * CV.SCALE, { size: CV.FS.sm, color: ready ? CV.C.green : CV.C.dim });
        /* V9.6.131（父亲大人："药园种植的消耗你也没写，我不知道是机制改了还是怎么"）：
           机制没改（播种照旧扣 ◉ 点数，core.plantGarden 一直在扣），是**这一行把花费漏写了**。
           现在把"种这一块要花多少"写回描述里，货币图标取货币表（不是手写符号）。 */
        /* ⚠️ 必须用 p.kind，不能写 D.GARDEN[i] —— 地和灵田是"循环对应"（第 i 块取第 i%4 种），
           扩到 8 块之后 D.GARDEN[4] 是 undefined，名字和花费都会画成空白。 */
        /* V9.6.141（父亲大人："药园的排版明显有问题"）：
           这一行原来拼的是 `seed.desc` —— 而灵田数据里**根本没有 desc 这个字段**，
           于是每行都只剩「可种「下品灵田」：◉ 800 · 」，结尾挂着一个孤零零的「· 」；
           种下去之后那行干脆是空的「收 」。产物、稀有掉落、成熟时间**全都没写出来**。
           现在改用数据层的 D.gardenRowText()（与网页版同一份文案）+ 两行折行。 */
        CV.text(descLines[1], U.ix(), top + 60 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        /* 按钮跟"第 N 块"那一行居中对齐，不再压在说明上 */
        const by = top + 16 * CV.SCALE - (U.BTN_SM * CV.SCALE) / 2;
        if (!p.plot) U.btn(U.ix() + U.iw() - bw, by, bw, U.BTN_SM * CV.SCALE, '播种', 'ghost', 'garden_plant:' + i);
        else U.btn(U.ix() + U.iw() - bw, by, bw, U.BTN_SM * CV.SCALE,
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
      U.note('每天 ' + st.cap + ' 次机会，赢了升一台并拿 ◆ 异界结晶 + ◆ 异界结晶，输了退一台。', 2 * CV.SCALE);
      U.kv('今日剩余', st.left + ' / ' + st.cap);
      U.kv('本台奖励', '◆ ' + fmt(st.reward.otherworld), CV.C.gold);
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
