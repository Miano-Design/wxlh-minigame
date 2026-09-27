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
  /* V1.1.x（2026-09-27 · 音频系统）：秘术阁「升 1 级」的成功 / 被拒音（G.AUD 缺失时静默跳过） */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }
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
    dmgReduce: '减伤', lifesteal: '汲取', spiritPct: '精神', initEnergy: '开场能量',
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
      /* V1.1.4（A12-F · 秘术阁接「秘卷残章」）：这一句原来写"**升级只花** ◆ 异界结晶" ——
         接了材料之后它就是假话了（文案与实现必须同源，这个项目最忌讳"写了没做/没说做了"）。 */
      U.note('升级花 ◆ 异界结晶 · 每 5 级另需 1 张秘卷残章', 2 * CV.SCALE);
      U.kv('◆ 异界结晶', fmt(coin), CV.C.gold);
      U.kv('📃 秘卷残章', String(S.items[D.KEJI_MAT] || 0));
    });
    U.card(function () {
      D.KEJI.forEach(function (k) {
        const lv = Core.kejiLv(k.id);
        const cost = Core.kejiCostOf(k.id);
        const matNeed = cost === null ? 0 : D.kejiMatNeed(lv);
        const matHave = S.items[D.KEJI_MAT] || 0;
        const cur = lv ? (k.rate * lv * 100) : 0;
        const next = cost === null ? cur : (k.rate * (lv + 1) * 100);
        const top = U.y;
        const sub0 = k.info + ' 当前 +' + cur.toFixed(1) + '%'
          + (cost === null ? ' · 已满级' : (' → 下一级 +' + next.toFixed(1) + '%（需 ◆ ' + fmt(cost) + (matNeed ? ' · 秘卷×' + matNeed : '') + '）'));
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
        /* 材料进"能不能点"的判定（与逻辑层 kejiUp 的判据同一条：每 5 级 1 张）。 */
        const can = cost !== null && coin >= cost && matHave >= matNeed;
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          cost === null ? '满级' : '升 1 级', 'ghost',
          cost === null ? '' : (can ? 'keji_up:' + k.id : 'noop'), cost !== null && !can);
        U.y = top + h;
      });
    });
  });
  D.KEJI.forEach(function (k) {
    CV.on('keji_up:' + k.id, function () {
      const r = Core.kejiUp(k.id);
      snd(r.ok ? 'levelup' : 'error');
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
        id: 'fabao_refine_now', dis: !(haveMat >= c.matN && haveOw >= c.otherworld) }]);
    });
    U.card(function () {
      U.h3('佩戴');
      U.hint('主角同时只带 1 件，随时能换。', 4 * CV.SCALE);
      /* V1.0.6（父亲大人 09-24 反馈图 05「贴了」）：
         网页版那一行是 `<div class="note mb2">` —— 说明下面还留着 10px 才挨到按钮。
         画布这边 U.hint 走完直接把 U.y 交出去，按钮顶上只剩 1.2px，字看上去是**粘在按钮上**的。
         按网页版补回那 10px（.mb2 = --sp2）。 */
      U.space(CV.SP[2]);
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
        /* V1.0.6：同法宝 —— 这里带着"驯服需要 ◉ 15万 + ◆ 1240 + 异界合金×15"，逐字折行会把 ×15 劈开 */
        const dLines = CV.wrapTokens(m.desc + (own ? (' · 喂养 ' + lv + '/' + mx) : (' · 驯服需要 ' + costTxt)), textW, CV.FS.sm, 3);
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
        id: 'mount_feed_now', dis: !(haveMat >= c.matN && havePt >= c.points) }]);
    });
    U.card(function () {
      U.h3('乘骑');
      U.hint('同时只骑 1 匹，随时能换。', 4 * CV.SCALE);
      U.space(CV.SP[2]);          // 同「佩戴」：网页版是 .note mb2，说明与按钮之间留 10px
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
    /* V1.1.4（A12-F · 药园接「灵植种」）：种子数在**卡片顶**报一次，行里的"播种"按钮要用它判禁用态。
       必须提在 register 作用域里（放进上面那个 U.card 的回调里，下面的 U.draw 闭包就取不到）。 */
    const seedItem = D.ITEMS[D.GARDEN_SEED] || {};
    const seedHave = Core.S.items[D.GARDEN_SEED] || 0;
    U.begin();
    head('药园');
    U.card(function () {
      /* V9.6.137：地按进度开（基础 4 块，每通关 9 张图多 1 块，最多 8 块）。
         没开的地也画出来、灰着并写清"通关哪张图开"，玩家才知道药园还能扩。 */
      U.h3('药园', busy + ' 块在用 · 已开 ' + Core.gardenPlots() + ' / ' + D.GARDEN_MAX + ' 块');
      U.note('有几率出稀有物（兽魂石 / 装备箱）', 2 * CV.SCALE);
      /* V1.1.4（A12-F · 药园接「灵植种」）：播种要 1 颗种子、收成回收 70% ——
         颗数写在卡片顶上（每一行都再报一遍会刷屏），来源也写出来，
         不然"一颗种子都没有"的玩家只会看到一颗点不动的按钮。 */
      U.kv((seedItem.icon || '') + ' ' + (seedItem.name || '灵植种'), String(seedHave), seedHave > 0 ? CV.C.text : CV.C.dangerText);
      U.hint('每通关 9 张图多开 1 块，同一种灵田可以多种一块。', 2 * CV.SCALE);
      if (seedHave <= 0) U.hint('没有种子：副本有概率掉、市集可买（◉）。', 2 * CV.SCALE);
    });
    U.card(function () {
      /* V1.0.6（父亲大人 09-24 反馈图 06「版式不行，没对齐且间距也不行」）：
         根因是这两行**两套骨架** ——
           · 已开的地：标题一行 + 说明两行，行**高 72**；
           · 未开垦的地：状态和要求**挤成一行**，行**高 62**；
         于是同一张卡里行距一紧一松、状态字也没落在同一条基线上（他圈的就是那三行）。
         现在逐条照网页版 `.list-row` 重排（这一段就是它的画布实现）：
           [第 N 块 胶囊] + [状态标题 / 说明两行] + [右侧按钮]，整行 `align-items:center`，
           `padding: 0.625rem 0`、行间一条 --line-soft 分隔线、说明行高 1.55（原来只有 1.33）。
         未开垦的两种行随之变成同一套骨架：标题「🔒 未开垦」+ 说明「通关 XX 后开放」，
           整行 opacity .55（网页版 `.list-row` 的内联 opacity）。 */
      plots.forEach(function (p, i) {
        const top = U.y;
        const padY = 10 * CV.SCALE, gapX = 14 * CV.SCALE;      // .list-row: padding .625rem / gap --sp3
        const ready = p.plot && p.leftMs <= 0;
        const btnLabel = p.locked ? '' : (ready ? '收获' : (p.plot ? '未熟' : '播种'));
        /* 右列按钮宽度照网页版 `.btn.small`（min-width 2.75rem + padding 0 0.8125rem）——
           原来写死 84，比网页版宽 20px，说明那一列被无谓地挤窄了。 */
        const bw = p.locked ? 0 : Math.max(64 * CV.SCALE, CV.measure(btnLabel, CV.FS.lg) + 26 * CV.SCALE);
        /* V1.0.6（康康按本室热区基准定的 09-24）：药园这四颗按钮原来走 U.BTN_SM＝40，
           够不到"热区 ≥88rpx（44pt）"。**只抬小游戏端**这一处到 U.BTN_H＝44
           （网页版 `.btn.small` 仍是 40，两端此处会不一致，已在回单里记明）。 */
        const bh = U.BTN_H * CV.SCALE;
        const chipW = CV.measure('第 ' + (i + 1) + ' 块', CV.FS.xs) + 12 * CV.SCALE;  // .tag: padding 1px 0.375rem
        const chipH = CV.FS.xs * 1.4 + 2 * CV.SCALE;
        const state = p.locked ? '🔒 未开垦' : (p.plot ? p.kind.name : '空地');
        /* ⚠️ 必须用 p.kind，不能写 D.GARDEN[i] —— 地和灵田是"循环对应"，扩到 8 块后 D.GARDEN[4] 是 undefined */
        const desc = p.locked
          ? (p.req ? (p.req + ' 后开放') : '继续推图后开放')
          : D.gardenRowText(p.kind || {}, !p.plot ? 'empty' : (ready ? 'ready' : 'growing'), p.leftMs / 1000);
        /* 说明那一列要**让开右边的按钮**（网页版是 flex 兄弟节点，天然不许叠）——
           这也是"文字从按钮底下穿过去"这一类缺陷的根治写法。 */
        const colW = U.iw() - chipW - gapX - (p.locked ? 0 : bw + gapX);
        const t1H = CV.FS.f1 * 1.35, t2H = CV.FS.sm * 1.55;     // .list-row .t1 / .t2 line-height
        const l1 = CV.wrapTokens(state, colW, CV.FS.f1, 1);
        const l2 = CV.wrapTokens(desc, colW, CV.FS.sm);
        const h = padY * 2 + l1.length * t1H + 4 * CV.SCALE + l2.length * t2H;
        U.draw(function () {
          if (p.locked) { CV.ctx.save(); CV.ctx.globalAlpha = 0.55; }
          const cy = top + h / 2, cx = U.ix() + chipW + gapX, y0 = top + padY;
          CV.round(U.ix(), cy - chipH / 2, chipW, chipH, CV.RADIUS_SM, null, p.locked ? CV.C.line : CV.C.line2);
          CV.text('第 ' + (i + 1) + ' 块', U.ix() + chipW / 2, cy, { size: CV.FS.xs, align: 'center', color: CV.C.text2 });
          l1.forEach(function (ln, k) {
            CV.text(ln, cx, y0 + t1H * (k + 0.5), { size: CV.FS.f1, bold: true, color: p.locked ? CV.C.text2 : CV.C.text });
          });
          l2.forEach(function (ln, k) {
            CV.text(ln, cx, y0 + l1.length * t1H + 4 * CV.SCALE + t2H * (k + 0.5),
              { size: CV.FS.sm, color: ready ? CV.C.green : CV.C.dim });
          });
          if (!p.locked) {
            /* 空地且种子不够 → 按钮进禁用态（`dis`：压暗 + 不给热区），
               与「背包满了不该让玩家白点」是同一套处理。种子来源写在卡片顶上那条 hint。 */
            const noSeed = !p.plot && seedHave < (D.GARDEN_SEED_N || 1);
            U.btn(U.ix() + U.iw() - bw, cy - bh / 2, bw, bh,
              btnLabel, ready ? 'primary' : 'ghost',
              ready ? 'garden_get:' + i : (p.plot || noSeed ? 'noop' : 'garden_plant:' + i), noSeed);
          }
          /* .list-row 的行分隔线（最后一行由 :last-child 去掉那一笔） */
          if (i < plots.length - 1) {
            CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.lineWidth = 1;
            CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + h - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + h - .5); CV.ctx.stroke();
          }
          if (p.locked) CV.ctx.restore();
        });
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
      /* V1.0.1（开发自审会诊）：这句原来写「拿 ◆ 异界结晶 + ◆ 异界结晶」——
         同一种货币写两遍（原句是 ♜ 深井徽记，V9.6.134 并入结晶时**整段替换**换重了）。
         网页版 `ui.js:2945` 只写一种，这里照它。 */
      U.note('每天 ' + st.cap + ' 次机会，赢了升一台并拿 ◆ 异界结晶，输了退一台。', 2 * CV.SCALE);
      U.kv('今日剩余', st.left + ' / ' + st.cap);
      U.kv('本台奖励', '◆ ' + fmt(st.reward.otherworld), CV.C.gold);
      U.space(CV.SP[1]);
      /* V1.0.1（开发自审会诊）：原来是 `id: st.left > 0 ? 'arena_fight' : ''` ——
         次数用完时按钮**照样是能点的样子，却既没热区也没提示**（看着能点、点了没反应）。
         网页版 `ui.js:2948` 是 `disabled` + 文案改成「今日次数已用完」，这里照它。 */
      U.btnRow([{
        label: st.left > 0 ? '挑战第 ' + st.floor + ' 台' : '今日次数已用完',
        style: 'primary', id: 'arena_fight', dis: st.left <= 0,
      }]);
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
  /* V1.0.6（父亲大人 09-24：「斗法台打完没有继续的选择，**还有次数的情况下应该能选择继续**」）：
     开一台这件事原来只写在 `arena_fight` 的处理器里，结算页摸不到 —— 现在抽成 arenaStart()，
     主按钮与结算里那颗「继续」**走同一条入口**（次数在 arenaStart 里再查一次，不会绕过限制）。 */
  function arenaStart() {
    const st = Core.arenaState();
    if (st.left <= 0) { CV.toast('今日斗法次数已用完'); return; }
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
        /* V1.0.6 · 继续打下一台（结算面板的 acts 机制，副本 / 深井早就在用这一套，不新增代码路径）。
           两条口径（派单授权我定，理由写在回单里）：
             · **不自动续打**：`style: 'gold'` 而不是 `'primary'` —— 自动倒计时那条路的触发键是
               `a.primary || a.style === 'primary'`（sc-battle.js:243）。斗法台每天 5 次是**有限资源**，
               替玩家自动开下一台＝替他花次数；副本自动下一关没这问题才敢自动。
             · **次数用完（r.left <= 0）不给这一颗**，只剩底部「收下奖励」/「返回」。
           文案把"第几台 / 今日还剩几次"写在按钮上，点之前就知道这一下要花掉一次。 */
        const acts = (r.ok && r.left > 0) ? [{
          label: (win ? '继续第 ' : '再挑战第 ') + r.floor + ' 台（今日还剩 ' + r.left + ' 次）',
          style: 'gold', id: 'arena_next',
        }] : [];
        return { title: win ? '守擂成功' : '守擂失败', sub: r.msg || '', rewards: [], acts: acts };
      },
    });
  }
  CV.on('arena_fight', arenaStart);
  /* 结算里那颗「继续」：先收掉上一场的战斗状态，再从同一个入口开下一台 */
  CV.on('arena_next', function () {
    if (G.BattleUI.clear) G.BattleUI.clear();
    arenaStart();
  });
  CV.on('arena_back', function () { G.BattleUI.clear && G.BattleUI.clear(); CV.reset('arena'); });

  /* ---------- 点灯（原「求签」，V1.0.1 改壳） ----------
     壳换成灯阁的语义，**权重 / 奖励 / 挂机加成 / 每日免费一个字没动**（创意总监 H1，父亲大人在案）。 */
  CV.register('sign', function () {
    const st = Core.signState();
    const pick = st.pick;
    U.begin();
    head('点灯');
    U.card(function () {
      U.h3('点灯', '每天免费 1 次');
      U.note('灯焰分五档（长明 → 微光），给当天的挂机加成，只算当天，隔天自动熄灭——上线先点一次灯，再看今天要打哪儿。', 2 * CV.SCALE);
      U.space(CV.SP[1]);
      if (st.canDraw) U.btnRow([{ label: '🔆 点亮今日灯芯', style: 'gold', id: 'sign_draw' }]);
      else {
        U.note('今日灯焰：【' + (pick ? pick.tier : st.tier) + '】' + (pick ? ' ' + pick.text : ''), 2 * CV.SCALE);
        U.hint('今日挂机产出 +' + Math.round(st.idlePct * 100) + '%', 4 * CV.SCALE);
      }
      U.hint('累计点灯 ' + st.total + ' 次 · 每天 0 点重置', 6 * CV.SCALE);
    });
    U.card(function () {
      U.h3('五档灯焰', '能点到哪一档，点之前就知道');
      D.SIGNS.forEach(function (s) {
        const top = U.y, h = 52 * CV.SCALE;
        const tw = CV.measure(s.tier, CV.FS.xs) + 12 * CV.SCALE;
        CV.round(U.ix(), top + 16 * CV.SCALE, tw, 17 * CV.SCALE, CV.RADIUS_SM, null, CV.a(CV.C.gold, .4));
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
    CV.toast(r.msg || '已点灯');
    CV.render();
  });
})();
