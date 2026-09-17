/* 背包 —— 照网页版 js/ui.js 的 bagScreen / bagPoolGrid / itemDetail 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     ① 三个分类卡（道具 / 材料 / 装备，吸在货币条下面）：.tab-card = 44 高、圆角 7、字号 12、均分
     ② 待领箱（背包满时代收的，有才出现）
     ③ 格子区：标题行「道具格 5 / 50」+ 5 列网格（格子正方形、缝 6、圆角 10）
        · 已占格：物品名（13px 粗体，最多两行、居中在"数量以上"那块）+ 数量（12px 金色粗体，贴底 8）
        · 空格：一个空框
        · 最后一格：「＋」虚线框 —— 点了先问"是否支付 ◈x 扩容"
     ④ 装备栏：格子里只放**没穿在身上的**装备（名字带稀有度色 + 强化等级），标题行右侧有「批量分解」
     ⑤ 道具详情：点道具开二级页（名字+数量 / 说明 / 在哪用 / 去哪弄 / 使用类按钮 / 返回）
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  /* ---------- 批量分解（网页版 equipBatchBar / equipFilterBar 的那颗按钮）----------
     父亲大人 2026-09-17：装备栏那颗「🧹 批量分解」原来点了只弹一句"下一步复刻"。
     照网页版做成选择模式：点格子选中 → 底栏显示"已选 N 件 · 预计 ◆ X" → 分解。 */
  let batchMode = false;
  const batchSel = new Set();
  function batchGain() {
    let gain = 0;
    batchSel.forEach(function (uid) {
      const e = Core.S.equips[uid];
      if (e) gain += (D.DECOMPOSE_GAIN[e.rarity] || 0) + Math.floor((e.enhance || 0) * 3);
    });
    return gain;
  }
  /* 底栏画成"页面级覆盖层"（CV.pageOverlay）：不跟着内容滚动、也不被顶栏/底栏裁掉 */
  function batchBar() {
    if (!batchMode) return;
    const pad = U.pad(), h = 106 * CV.SCALE;
    const y = CV.H - CV.NAV_H - CV.safeBottom - h - 8 * CV.SCALE;
    const bh = U.BTN_SM * CV.SCALE;
    CV.hitMode = 'screen';
    CV.round(pad, y, CV.W - pad * 2, h, 14 * CV.SCALE, 'rgba(18,22,34,.97)', CV.C.line);
    /* 第一行：快选 N / R / SR + 清空 */
    let x = pad + 12 * CV.SCALE;
    const ry = y + 12 * CV.SCALE;
    CV.text('快选：', x, ry + bh / 2, { size: CV.FS.sm, color: CV.C.dim });
    x += CV.measure('快选：', CV.FS.sm) + 6 * CV.SCALE;
    ['N', 'R', 'SR'].forEach(function (r) {
      const bw = 46 * CV.SCALE;
      U.btn(x, ry, bw, bh, r, 'ghost', 'bselr:' + r);
      x += bw + 6 * CV.SCALE;
    });
    U.btn(x, ry, 54 * CV.SCALE, bh, '清空', 'ghost', 'bclear');
    /* 第二行：已选 / 预计收益 + 分解 / 取消 */
    const ry2 = ry + bh + 8 * CV.SCALE;
    CV.text(CV.fit('已选 ' + batchSel.size + ' 件 · 预计 ◆ ' + fmt(batchGain()), CV.W - pad * 2 - 180 * CV.SCALE, CV.FS.md),
      pad + 12 * CV.SCALE, ry2 + bh / 2, { size: CV.FS.md });
    const b2 = 76 * CV.SCALE, g2 = 8 * CV.SCALE;
    U.btn(CV.W - pad - b2 * 2 - g2 - 12 * CV.SCALE, ry2, b2, bh, '⚡ 分解', 'primary', 'bgo');
    U.btn(CV.W - pad - b2 - 12 * CV.SCALE, ry2, b2, bh, '取消', 'ghost', 'bclose');
    CV.hitMode = 'content';
  }

  const TABS = [['item', '道具'], ['mat', '材料'], ['equip', '装备']];
  const POOLS = {
    item: { label: '道具格', capKey: 'itemCap', expKey: 'itemExpands' },
    mat: { label: '材料格', capKey: 'matCap', expKey: 'matExpands' },
    equip: { label: '装备格', capKey: 'eqCap', expKey: 'eqExpands' },
  };
  let view = 'item';
  let curItem = null;          // 道具详情页当前看的道具

  /* ---------- 分类卡（网页版 .tab-cards / .tab-card） ---------- */
  function tabCards() {
    const top = U.y, gap = CV.SP[2], h = U.BTN_H * CV.SCALE;
    U.space(CV.SP[2]);
    const y = U.y;
    const w = (U.cw() - gap * (TABS.length - 1)) / TABS.length;
    TABS.forEach(function (t, i) {
      const x = U.pad() + i * (w + gap);
      const on = view === t[0];
      CV.round(x, y, w, h, CV.RADIUS_SM, on ? '#d43a4f22' : CV.C.panel, on ? CV.C.accent : CV.C.line);
      CV.text(t[1], x + w / 2, y + h / 2, { size: CV.FS.md, align: 'center', color: on ? '#fff' : CV.C.dim });
      CV.hit('bagview:' + t[0], x, y, w, h);
    });
    U.y = y + h + CV.SP[2];
    return U.y - top;
  }

  /* ---------- 待领箱（网页版 stashBar） ---------- */
  function stashBar() {
    const n = Core.stashCount();
    if (!n) return;
    const list = Core.stashList();
    U.card(function () {
      U.h3('📮 待领箱', n + ' 件');
      U.hint('背包满时收到的道具先存这里', 2 * CV.SCALE);
      const txt = list.slice(0, 4).map((x) => ((D.ITEMS[x.id] || {}).name || x.id) + '×' + x.n).join(' · ');
      U.hint(txt + (list.length > 4 ? ' … 还有 ' + (list.length - 4) + ' 种' : ''), 2 * CV.SCALE);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '全部领回', style: 'primary', id: 'stash_claim' }]);
    });
  }

  /* ---------- 网格（网页版 .bg-grid：5 列、缝 6、格子正方形、圆角 10） ---------- */
  function grid(cells, used, cap, expandId, cost, filtering) {
    const gap = 6 * CV.SCALE, cols = 5;
    const cw = Math.max(62 * CV.SCALE, (U.iw() - gap * (cols - 1)) / cols);
    const top = U.y;
    cells.forEach(function (c, i) {
      const r = Math.floor(i / cols), col = i % cols;
      const x = U.ix() + col * (cw + gap), y = top + r * (cw + gap);
      if (c.empty) {
        CV.round(x, y, cw, cw, CV.RADIUS, '#00000022', CV.C.line);
        return;
      }
      if (c.add) {
        /* 「＋」扩容格：灰虚线框 + 中间一个 ＋（网页版 .bg-slot.add） */
        CV.ctx.save();
        CV.ctx.setLineDash([5, 4]);
        CV.round(x, y, cw, cw, CV.RADIUS, null, CV.C.line2);
        CV.ctx.restore();
        CV.text('＋', x + cw / 2, y + cw / 2, { size: 20 * CV.SCALE, align: 'center', color: CV.C.dim });
        CV.hit(expandId, x, y, cw, cw);
        return;
      }
      if (c.sel) {
        /* 网页版 .bg-slot.sel：红框 + 红色淡底（批量分解时"这件选中了"） */
        CV.round(x, y, cw, cw, CV.RADIUS, '#d43a4f33', CV.C.accent);
      } else {
        CV.round(x, y, cw, cw, CV.RADIUS, CV.C.panel2, CV.C.line);
      }
      /* 名字：13px 粗体，最多两行，居中在"数量以上"那块区域（网页版 .bg-name） */
      const lines = CV.wrap(c.name, cw - 14 * CV.SCALE, CV.FS.lg, 2);
      const areaH = cw - 22 * CV.SCALE;                 // 数量占底部 ~22
      const cy0 = y + areaH / 2;
      const lh = CV.FS.lg * 1.3;
      lines.forEach(function (ln, k) {
        CV.text(ln, x + cw / 2, cy0 + (k - (lines.length - 1) / 2) * lh,
          { size: CV.FS.lg, bold: true, align: 'center', color: c.color || CV.C.text });
      });
      /* 数量 / 强化等级：贴底 8px（.bg-count 金色粗体 12 / .bg-sub 灰 11） */
      if (c.count) CV.text(c.count, x + cw / 2, y + cw - 8 * CV.SCALE - 6 * CV.SCALE, { size: CV.FS.md, bold: true, color: CV.C.gold, align: 'center' });
      else if (c.sub) CV.text(c.sub, x + cw / 2, y + cw - 8 * CV.SCALE - 5 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      if (c.id) CV.hit(c.id, x, y, cw, cw);
    });
    const rows = Math.ceil((cells.length + 1) / cols);
    U.y = top + rows * cw + (rows - 1) * gap;
  }

  /* ---------- 背包页 ---------- */
  CV.register('bag', function () {
    const S = Core.S;
    U.begin();
    tabCards();
    stashBar();
    const pool = POOLS[view];
    const cap = S.bag[pool.capKey];
    const cost = D.bagExpandCost(S.bag[pool.expKey] || 0);
    const cells = [];
    let used = 0;
    if (view === 'equip') {
      /* 格子里只放**没穿在身上的**装备（网页版同口径：穿身上的不占格） */
      const worn = new Set();
      Object.keys(S.equipped).forEach((cid) => Object.values(S.equipped[cid] || {}).forEach((u) => { if (u) worn.add(u); }));
      const list = Object.values(S.equips).filter((e) => !worn.has(e.uid));
      used = list.length;
      list.slice(0, cap).forEach((e) => {
        /* V9.6.7：批量分解模式下，点格子 = 选中/取消（不再进详情页）——网页版同一口径 */
        cells.push(batchMode
          ? { id: 'bselu:' + e.uid, name: (e.lock ? '🔒' : '') + e.name, color: rarColor(e.rarity), sub: '+' + e.enhance, sel: batchSel.has(e.uid) }
          : { id: 'eqd:' + e.uid, name: (e.lock ? '🔒' : '') + e.name, color: rarColor(e.rarity), sub: '+' + e.enhance });
      });
    } else {
      const isMat = (k) => (D.ITEMS[k] || {}).type === 'material';
      const stacks = Object.entries(S.items).filter(([k, n]) => n > 0 && (view === 'mat' ? isMat(k) : !isMat(k)));
      used = stacks.length;
      stacks.slice(0, cap).forEach(([k, n]) => {
        cells.push({ id: 'item:' + k, name: (D.ITEMS[k] || {}).name || k, count: '×' + n });
      });
    }
    while (cells.length < cap) cells.push({ empty: true });
    /* V9.6.4（父亲大人："背包的扩容格也没了"）：格子补满 cap 个之后，**必须再补最后一格**
       —— 网页版是"第 cap+1 格：灰色虚线框 + ＋"，点了问"是否支付 ◈x 扩容"。
       上一版排格子的循环只补了空格，把这一格漏掉了（grid() 里画 add 格的分支一直没被触发）。 */
    cells.push({ add: true });
    U.card(function () {
      const full = used >= cap;
      const top = U.y;
      CV.text(pool.label, U.ix(), top + 9 * CV.SCALE, { size: CV.FS.lg, bold: true });
      /* V9.6.7：数量只在**一处**画。以前装备栏为了给「批量分解」让位又画了第二遍，
         第一遍（贴最右）被按钮压住，屏幕上就出现"2 / 50"两截叠在一起。 */
      const cntTxt = used + ' / ' + cap + (full ? ' · 满了' : '');
      let cntRight = U.ix() + U.iw();
      /* 装备栏的标题行右侧还有「批量分解」（网页版 .eq-bar） */
      if (view === 'equip') {
        /* 网页版 .eq-bar：没开批量时右边一颗「🧹 批量分解」；开了就换成一行提示（挑选动作在底栏） */
        /* 开了批量之后这颗按钮只是状态标签（挑选动作在底栏），写短一点免得在 34 高的按钮里折成两行 */
        const lbl = batchMode ? '批量分解中' : '🧹 批量分解';
        const bw = CV.measure(lbl, CV.FS.sm) + 22 * CV.SCALE;
        U.btn(U.ix() + U.iw() - bw, top - 14 * CV.SCALE, bw, 34 * CV.SCALE, lbl, batchMode ? 'ghost' : 'ghost',
          batchMode ? '' : 'bag_batch');
        cntRight = U.ix() + U.iw() - bw - 10 * CV.SCALE;
      }
      CV.text(cntTxt, cntRight, top + 9 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      U.y = top + 26 * CV.SCALE;
      grid(cells, used, cap, 'bag_expand:' + view, cost, false);
    });
    if (view === 'equip' && batchMode) CV.pageOverlay = batchBar;
  });

  /* ---------- 道具详情（网页版 itemDetail：名字+数量 / 说明 / 在哪用 / 去哪弄 / 动作 / 返回） ---------- */
  CV.register('item', function () {
    const S = Core.S;
    const it = D.ITEMS[curItem] || {};
    const n = S.items[curItem] || 0;
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'back_bag');
    CV.text('道具详情', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    U.card(function () {
      const top = U.y;
      CV.text(it.name || curItem, U.ix(), top + 10 * CV.SCALE, { size: 16 * CV.SCALE, bold: true });
      CV.text('×' + n, U.ix() + U.iw(), top + 10 * CV.SCALE, { size: 15 * CV.SCALE, bold: true, color: CV.C.gold, align: 'right' });
      U.y = top + 26 * CV.SCALE;
    });
    U.card(function () { U.h3('说明'); U.note(it.desc || '', 2 * CV.SCALE); });
    U.card(function () {
      U.h3('在哪用');
      U.kv('使用场景', ({ explore: '副本探索中', character: '伙伴培养页', anywhere: '随时' })[it.where] || '—');
      if (it.use) U.note(it.use, 4 * CV.SCALE);
    });
    U.card(function () { U.h3('去哪弄'); U.note(it.src || '副本掉落 / 商店兑换', 2 * CV.SCALE); });
    /* 动作：盒/经验/血清/材料/券，各按网页版同一套按钮 */
    if (it.type === 'box') {
      U.btnRow([
        { label: '开 1 个', style: 'ghost', id: n >= 1 ? 'box:1' : '' },
        { label: '开 10 个', style: 'ghost', id: n >= 2 ? 'box:10' : '' },
        { label: '全部开（' + n + '）', style: 'gold', id: n >= 1 ? 'box:0' : '' },
      ]);
    } else if (it.type === 'exp') {
      U.btnRow([
        { label: '用 1 个', style: 'ghost', id: n >= 1 ? 'exp:1' : '' },
        { label: '用 10 个', style: 'ghost', id: n >= 10 ? 'exp:10' : '' },
        { label: '全部用（' + n + '）', style: 'gold', id: n >= 1 ? 'exp:0' : '' },
      ]);
    } else if (it.type === 'material') {
      U.card(function () { U.note('强化装备时自动优先消耗', 2 * CV.SCALE); });
    } else if (it.type === 'ticket') {
      const pool = D.RECRUIT_POOLS[it.pool] || {};
      const tk = Core.ticketOf(it.pool);
      U.btnRow([{ label: '去「' + (pool.name || '招募') + '」使用（现有 ' + (tk ? tk.n : n) + ' 张）', style: 'gold', id: 'go_recruit' }]);
    }
    U.space(CV.SP[2]);
    U.btnRow([{ label: '‹ 返回', style: 'ghost', id: 'back_bag' }]);
  });

  /* ---------- 装备详情（网页版 equipDetail：属性 / 套装 / 强化 / 操作） ---------- */
  let eqUid = null;
  CV.register('eqdetail', function () {
    const S = Core.S;
    const eq = S.equips[eqUid];
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'eq_back');
    CV.text('装备详情', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    if (!eq) { U.card(function () { U.h3('装备详情'); U.hint('这件装备不在了', 4 * CV.SCALE); }); return; }
    const q = Core.enhanceQuote(eqUid);
    const est = Core.equipStats(eq);
    const set = D.SETS[eq.set];
    const cs = eq.classSet ? D.CLASS_SETS[eq.classSet] : null;
    const wearer = Object.keys(S.equipped).find((cid) => Object.values(S.equipped[cid] || {}).indexOf(eqUid) >= 0);
    U.card(function () {
      U.h3(eq.name + ' +' + eq.enhance, wearer ? (Core.charName(wearer) + '装备中') : '未装备');
      U.kv('部位', D.EQUIP_SLOTS[eq.slot]);
      U.kv('品质', eq.rarity, rarColor(eq.rarity));
      U.kv('强化', '+' + eq.enhance + ' / 20');
      if (eq.charId) U.kv('专属', '仅限 ' + Core.charName(eq.charId) + ' 装备');
      if (cs) U.kv('职业套装', '限' + (D.KIND_NAMES[eq.classSet] || '') + '定位激活');
      U.kv('分解可得', '◆ ' + (D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3));
    });
    U.card(function () {
      const rows = [];
      if (est.flat.atk) rows.push(['攻击', '+' + Math.round(est.flat.atk)]);
      if (est.flat.def) rows.push(['防御', '+' + Math.round(est.flat.def)]);
      if (est.flat.hp) rows.push(['生命', '+' + Math.round(est.flat.hp)]);
      if (est.flat.spd) rows.push(['速度', '+' + Math.round(est.flat.spd)]);
      Object.keys(est.affix || {}).forEach((k) => rows.push([(D.AFFIX_POOL[k] || {}).name || k, '+' + (est.affix[k] * 100).toFixed(1) + '%']));
      U.h3('📊 属性', '共 ' + rows.length + ' 条');
      if (!rows.length) U.hint('这件装备没有附加属性', 4 * CV.SCALE);
      rows.forEach((r) => U.kv(r[0], r[1]));
    });
    if (set) {
      U.card(function () {
        U.h3('🧩 ' + (set.name || '套装'), eq.set);
        Object.keys(set.bonus || {}).forEach((k) => U.hint(k + ' 件：' + Core.rewardTextOf(set.bonus[k]), 2 * CV.SCALE));
      });
    }
    U.card(function () {
      U.h3('强化', '+' + eq.enhance + '/20');
      U.kv('强化材料', q.matHave ? (q.itemName + ' ×1（现有 ' + q.matOwned + '）') : ('无' + q.itemName + ' → 用 ◈ ' + fmt(q.substitute) + ' 代用'));
      U.space(CV.SP[1]);
      U.btnRow([{ label: '强化（◈ ' + fmt(q.points) + ' + ◆ ' + q.otherworld + ' · ' + Math.round(q.rate * 100) + '%）', style: 'ghost', id: q.maxed ? '' : 'eq_enh' }]);
    });
    U.card(function () {
      U.h3('操作');
      U.btnRow([
        { label: eq.lock ? '🔒 已锁定' : '🔓 锁定保护', style: eq.lock ? 'primary' : 'ghost', id: 'eq_lock' },
        { label: '分解（◆ ' + (D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3) + '）', style: 'ghost', id: eq.lock ? '' : 'eq_decomp' },
      ]);
    });
  });
  CV.on('eq_enh', function () {
    const r = Core.enhance(eqUid);
    CV.toast(r.msg || (r.ok ? '强化成功' : '强化失败'));
    CV.render();
  });
  CV.on('eq_lock', function () {
    const r = Core.toggleEquipLock(eqUid);
    CV.toast(r.lock ? '🔒 已锁定这件装备' : '🔓 已解锁');
    CV.render();
  });
  CV.on('eq_decomp', function () {
    const eq = Core.S.equips[eqUid];
    U.confirm('分解装备', '确定分解「' + eq.name + ' +' + eq.enhance + '」？将获得 ◆ ' + (D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3), function () {
      const r = Core.decompose(eqUid);
      CV.toast(r.ok ? '分解成功，获得 ◆ ' + r.gain : (r.msg || '分解失败'));
      CV.pop();
    });
  });

  /* ---------- 事件 ---------- */
  TABS.forEach(function (t) {
    CV.on('bagview:' + t[0], function () { view = t[0]; CV.render(); });
  });
  CV.on('bag_expand:item', function () { expand('item'); });
  CV.on('bag_expand:mat', function () { expand('mat'); });
  CV.on('bag_expand:eq', function () { expand('eq'); });
  function expand(kind) {
    const key = POOLS[kind === 'eq' ? 'equip' : kind].expKey;
    const cost = D.bagExpandCost(Core.S.bag[key] || 0);
    const label = { eq: '装备', mat: '材料', item: '道具' }[kind];
    U.confirm('扩容', '是否支付 ◈ ' + fmt(cost) + '，把' + label + '格再加 ' + D.BAG_EXPAND_SIZE + ' 格？', function () {
      const r = Core.buyBagCap(kind);
      CV.toast(r.msg || '已扩容');
      CV.render();
    });
  }
  CV.on('stash_claim', function () {
    const r = Core.claimStash();
    CV.toast(r.moved ? '领回 ' + r.moved + ' 件' + (r.left ? '，还有 ' + r.left + ' 件装不下' : '') : '背包还是满的，先扩容或分解装备');
    CV.render();
  });
  CV.on('back_bag', function () { CV.pop(); });
  /* 背包空的时候那句「去招募伙伴」——以前只弹一句提示，点了等于没反应。 */
  CV.on('go_recruit', function () { CV.cur = 'home'; CV.reset('home'); CV.push('recruit'); });
  CV.on('item:*', function (id) { curItem = id; CV.push('item'); });   // 前缀处理器：任何道具 id 都走这里
  [1, 10, 0].forEach(function (v) {
    CV.on('box:' + v, function () {
      const cnt = v === 0 ? (Core.S.items[curItem] || 0) : v;
      const r = Core.openBoxes(curItem, cnt);
      CV.toast(r.msg || '已开启');
      if ((Core.S.items[curItem] || 0) <= 0) CV.pop(); else CV.render();
    });
    CV.on('exp:' + v, function () {
      const cnt = v === 0 ? (Core.S.items[curItem] || 0) : v;
      const r = Core.useExpItem(curItem, cnt);
      CV.toast(r.msg || '已使用');
      if ((Core.S.items[curItem] || 0) <= 0) CV.pop(); else CV.render();
    });
  });
  /* ---------- 批量分解：四个动作（网页版 data-batchon/off、data-beq、data-bsel、data-bgo） ---------- */
  CV.on('bag_batch', function () { batchMode = true; batchSel.clear(); CV.render(); });
  CV.on('bclose', function () { batchMode = false; batchSel.clear(); CV.render(); });
  CV.on('bselu:*', function (uid) {
    if (batchSel.has(uid)) batchSel.delete(uid); else batchSel.add(uid);
    CV.render();
  });
  CV.on('bclear', function () { batchSel.clear(); CV.render(); });
  /* 快选：把该稀有度里**没穿身上、没锁**的一键选上；再点一次取消 */
  CV.on('bselr:*', function (rarity) {
    const worn = new Set();
    Object.keys(Core.S.equipped).forEach(function (cid) {
      Object.values(Core.S.equipped[cid] || {}).forEach(function (u) { if (u) worn.add(u); });
    });
    const uids = Core.inventoryEquips()
      .filter(function (e) { return e.rarity === rarity && !worn.has(e.uid) && !e.lock; })
      .map(function (e) { return e.uid; });
    const allIn = uids.length > 0 && uids.every(function (u) { return batchSel.has(u); });
    uids.forEach(function (u) { if (allIn) batchSel.delete(u); else batchSel.add(u); });
    CV.render();
  });
  CV.on('bgo', function () {
    if (!batchSel.size) { CV.toast('请先点选要分解的装备'); return; }
    const n = batchSel.size, gain = batchGain();
    U.confirm('批量分解', '确定分解选中的 ' + n + ' 件装备？将获得 ◆ ' + fmt(gain) + '（异界结晶）', function () {
      const r = Core.decomposeMany(Array.from(batchSel));
      CV.toast(r.count ? ('分解 ' + r.count + ' 件 · ◆ +' + fmt(r.gain)) : '没有可分解的装备');
      batchMode = false; batchSel.clear();
      CV.render();
    });
  });
  /* 装备详情：背包 / 主角详情 / 伙伴详情三处共用同一个页面（前缀处理器） */
  CV.on('eqd:*', function (uid) { eqUid = uid; CV.push('eqdetail'); });
  CV.on('eq_back', function () { CV.pop(); });
})();
