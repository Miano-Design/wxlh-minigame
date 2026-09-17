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
  /* 装备页的两行分类（照网页版 equipFilterBar 的 .pill-tabs.tight）。
     V9.6.8（父亲大人）：分类保留，但去掉「普通」和「SSR+」——
     "普通"跟"全部"几乎重合；"SSR+"原来挂在部位那行末尾，七个部位 + 它挤到第三行、孤零零一个。 */
  const EQ_CATS = [['all', '全部'], ['world', '世界套装'], ['class', '职业套装'], ['sig', '专属']];
  const EQ_SLOTS = [['all', '全部'], ['weapon', '武器'], ['armor', '胸甲'], ['head', '头部'], ['hands', '手部'], ['legs', '腿部'], ['accessory', '饰品']];
  let eqCat = 'all', eqSlot = 'all';
  /* 一行小胶囊（.pill.sm：40 高、圆角兜住、选中红框红字） */
  function pillRow(list, cur, prefix) {
    const h = 40 * CV.SCALE, gap = 6 * CV.SCALE, top = U.y;
    let x = U.pad();
    list.forEach(function (t) {
      const on = cur === t[0];
      const w = CV.measure(t[1], CV.FS.sm) + 22 * CV.SCALE;
      CV.round(x, top, w, h, 999, on ? '#d43a4f22' : CV.C.panel, on ? CV.C.accent : CV.C.line);
      CV.text(t[1], x + w / 2, top + h / 2, { size: CV.FS.sm, align: 'center', color: on ? '#fff' : CV.C.dim });
      CV.hit(prefix + t[0], x, top, w, h);
      x += w + gap;
    });
    U.y = top + h + 8 * CV.SCALE;
  }
  /* .eq-bar：左边「未穿戴 x / y 格」，右边「🧹 批量分解」（开了批量就换成一行状态文字） */
  function eqBarRow() {
    const S = Core.S;
    const worn = new Set();
    Object.keys(S.equipped).forEach(function (cid) {
      Object.values(S.equipped[cid] || {}).forEach(function (u) { if (u) worn.add(u); });
    });
    const used = Object.keys(S.equips).filter(function (u) { return !worn.has(u); }).length;
    const cap = S.bag.eqCap;
    /* V9.6.9（父亲大人）：批量分解去掉 🧹 图标、做成小按钮（原来是 40 高、字还带图标，占地方） */
    const h = 34 * CV.SCALE, top = U.y;
    CV.text('未穿戴 ' + used + ' / ' + cap + ' 格', U.pad(), top + h / 2, { size: CV.FS.xs, color: CV.C.dim });
    if (batchMode) {
      CV.text('批量分解中 · 点格子挑选', U.pad() + U.cw(), top + h / 2, { size: CV.FS.xs, color: CV.C.dim, align: 'right' });
    } else {
      const lbl = '批量分解';
      const bw = CV.measure(lbl, CV.FS.sm) + 20 * CV.SCALE;
      U.btn(U.pad() + U.cw() - bw, top, bw, h, lbl, 'ghost', 'bag_batch');
    }
    U.y = top + h + 8 * CV.SCALE;
  }
  /* 一行「左文字 + 右按钮」（和 sc-last 的 coreRow 同一套写法；各文件各留一份，不跨文件依赖） */
  function listBtn(o) {
    const bw = 84 * CV.SCALE, bh = U.BTN_SM * CV.SCALE;
    const rowTop = U.y;
    const h = U.listRow({ t1: o.t1, t2: o.t2, rightW: o.btn ? (bw + 10 * CV.SCALE) : 0, dim: o.dim, tag: o.tag });
    if (o.btn) U.btn(U.ix() + U.iw() - bw, rowTop + (h - bh) / 2, bw, bh, o.btn[0], o.btn[1], o.btn[2], o.btn[3]);
    return h;
  }
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
  /* V9.6.9（父亲大人两件事一起）：
     ① "固定在面板上不跟着下滑这个你没做好" —— 网页版 .tab-cards 是 position:sticky、
        钉在货币条下面；小游戏原来是普通内容、跟着滚走了。现在标签**只在吸顶那一趟**
        按屏幕坐标画（cv.js 的 CV.sticky 钩子），内容区只负责让出它的高度。
        所以这里不再画，只推进游标 —— 位置由 CV.sticky 统一决定，不会出现两层错位。
     ② "离上面间隔太大" —— 吸顶条贴着顶栏下方 4px，内容从它下面接着排。 */
  const TAB_TOP_GAP = 4 * CV.SCALE;      // 标签离顶栏的距离（屏幕坐标）
  const TAB_BOTTOM_GAP = 6 * CV.SCALE;   // 标签与下面内容的间距
  function tabCards() {
    /* 只占位（标签本身由 CV.sticky 画）：让内容从标签下面开始。
       吸顶条贴在顶栏下方 4px，内容原点在顶栏下方 8px，所以这里按满高让位即可。 */
    U.y += U.BTN_H * CV.SCALE + TAB_BOTTOM_GAP;
  }
  /* 在给定 y（屏幕坐标）画三张标签卡 */
  function drawTabCards(y) {
    const gap = CV.SP[2], h = U.BTN_H * CV.SCALE;
    const w = (U.cw() - gap * (TABS.length - 1)) / TABS.length;
    const mode = CV.hitMode;
    TABS.forEach(function (t, i) {
      const x = U.pad() + i * (w + gap);
      const on = view === t[0];
      CV.round(x, y, w, h, CV.RADIUS_SM, on ? '#d43a4f22' : CV.C.panel, on ? CV.C.accent : CV.C.line);
      CV.text(t[1], x + w / 2, y + h / 2, { size: CV.FS.md, align: 'center', color: on ? '#fff' : CV.C.dim });
      CV.hit('bagview:' + t[0], x, y, w, h);
    });
    CV.hitMode = mode;
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
    /* 三大标签吸顶：内容先让出它的高度，标签本身在 CV.sticky 那一趟按屏幕坐标画 */
    tabCards();
    CV.sticky = function () {
      CV.hitMode = 'screen';
      /* 吸顶条自带一层不透明底：内容从它下面滚过去时不会透出来 */
      const h = U.BTN_H * CV.SCALE;
      CV.ctx.fillStyle = '#0b0e15f5';
      CV.ctx.fillRect(0, CV.TOP, CV.W, TAB_TOP_GAP + h + 2 * CV.SCALE);
      drawTabCards(CV.TOP + TAB_TOP_GAP);
      CV.hitMode = 'content';
    };
    stashBar();
    const pool = POOLS[view];
    const cap = S.bag[pool.capKey];
    /* 装备页：两行分类（套装 / 部位）+ 一行「未穿戴 x / y 格 · 批量分解」
       —— V9.6.8（父亲大人）：小游戏的装备页原来**没有这些分类标签**（网页版有），
       而且「🧹 批量分解」原来挤在格子卡的标题行里、贴着卡片上沿。现在照网页版
       拆成独立一行，跟分类同一层、上下留白一致。 */
    if (view === 'equip') {
      pillRow(EQ_CATS, eqCat, 'ecat:');
      pillRow(EQ_SLOTS, eqSlot, 'efilter:');
      eqBarRow();
    }
    const cost = D.bagExpandCost(S.bag[pool.expKey] || 0);
    const cells = [];
    let used = 0;
    if (view === 'equip') {
      /* 格子里只放**没穿在身上的**装备（网页版同口径：穿身上的不占格） */
      const worn = new Set();
      Object.keys(S.equipped).forEach((cid) => Object.values(S.equipped[cid] || {}).forEach((u) => { if (u) worn.add(u); }));
      let list = Object.values(S.equips).filter((e) => !worn.has(e.uid));
      /* 两行分类的筛选（网页版 bagEquipList 同款规则） */
      if (eqSlot !== 'all') list = list.filter((e) => e.slot === eqSlot);
      if (eqCat === 'world') list = list.filter((e) => !!e.set);
      else if (eqCat === 'class') list = list.filter((e) => !!e.classSet);
      else if (eqCat === 'sig') list = list.filter((e) => !!e.charId);
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
    /* 筛选状态下**不补空格子**（网页版同款）：筛出 3 件武器后面还跟着 47 个空格，
       玩家会以为筛选没生效。 */
    const filtering = view === 'equip' && (eqCat !== 'all' || eqSlot !== 'all');
    if (!filtering) while (cells.length < cap) cells.push({ empty: true });
    /* V9.6.4（父亲大人："背包的扩容格也没了"）：格子补满 cap 个之后，**必须再补最后一格**
       —— 网页版是"第 cap+1 格：灰色虚线框 + ＋"，点了问"是否支付 ◈x 扩容"。
       上一版排格子的循环只补了空格，把这一格漏掉了（grid() 里画 add 格的分支一直没被触发）。 */
    cells.push({ add: true });
    U.card(function () {
      const full = used >= cap;
      const top = U.y;
      CV.text(pool.label, U.ix(), top + 9 * CV.SCALE, { size: CV.FS.lg, bold: true });
      /* V9.6.8：「🧹 批量分解」搬去上面的 .eq-bar 行（原来挤在这一行、贴着卡片上沿），
         标题行就只剩「装备格」+ 数量，不再有两截数字叠在一起的问题。 */
      CV.text(used + ' / ' + cap + (full ? ' · 满了' : ''), U.ix() + U.iw(), top + 9 * CV.SCALE,
        { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
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
    } else if (it.type === 'serum') {
      /* V9.6.7 自审抓到：血清以前**只有"炼"没有"喂"** —— 炼化台能做出来，
         道具卡上却一个动作按钮都没有（说明里还写着"点这张卡选伙伴喂下"）。
         补齐网页版那三个按钮 → 「使用血清」选人页。 */
      U.btnRow([
        { label: '用 1 支', style: 'ghost', id: n >= 1 ? 'serum:1' : '' },
        { label: '用 10 支', style: 'ghost', id: n >= 10 ? 'serum:10' : '' },
        { label: '全部用（' + n + '）', style: 'gold', id: n >= 1 ? 'serum:0' : '' },
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
      /* V9.6.7 自审：伙伴身上的装备只能进详情、**没法卸下来**（主角那边才有「卸下」）。
         网页版两边都有，这里补上 —— 只有真穿在谁身上时才出现。 */
      if (wearer) {
        U.space(CV.SP[1]);
        U.btnRow([{ label: '卸下（从 ' + Core.charName(wearer) + ' 身上）', style: 'ghost', id: 'eq_unequip' }]);
      }
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
  CV.on('eq_unequip', function () {
    const S = Core.S;
    const who = Object.keys(S.equipped).find(function (cid) { return Object.values(S.equipped[cid] || {}).indexOf(eqUid) >= 0; });
    if (!who) { CV.toast('这件装备没穿在身上'); return; }
    Core.unequipItem(who, (S.equips[eqUid] || {}).slot);
    CV.toast('已卸下');
    CV.render();
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
  /* 装备页两行分类的点击 */
  EQ_CATS.forEach(function (t) { CV.on('ecat:' + t[0], function () { eqCat = t[0]; CV.render(); }); });
  EQ_SLOTS.forEach(function (t) { CV.on('efilter:' + t[0], function () { eqSlot = t[0]; CV.render(); }); });
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

  /* ---------- 使用血清：选人（网页版 pickSerumTarget）----------
     先选喂几支，再选喂给谁；血统血清只列对应血统的伙伴。已服满的不给点。 */
  let serumCount = 1;
  CV.register('serum_pick', function () {
    const S = Core.S;
    const it = D.ITEMS[curItem] || {};
    const sd = it.serum || {};
    const sid = String(curItem).replace(/^serum_/, '');
    const have = S.items[curItem] || 0;
    const cnt = Math.max(1, Math.min(serumCount || 1, have));
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'serum_back');
    CV.text('使用血清', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    U.note('选择要吃「' + (it.name || '') + ' ×' + cnt + '」的伙伴 —— 永久生效', 0);
    U.space(CV.SP[2]);
    /* 候选：主角 + 已拥有的伙伴，血统对得上才列出来 */
    const rows = [{ id: '@player', name: (S.player.name || '主角'), sub: '主角 · ' + (S.player.bloodline || '未觉醒血统'), bl: S.player.bloodline || null }];
    Object.keys(S.chars).forEach(function (id) {
      const ch = D.charById[id];
      if (!ch) return;
      const c = S.chars[id];
      const bl = (c.bloodlineLv || 0) > 0 ? ch.bloodline : null;
      rows.push({ id: id, name: ch.name, sub: 'Lv.' + c.lv + ' · ' + ch.role + ' · ' + (bl || '未觉醒血统'), bl: bl });
    });
    const usable = rows.filter(function (r) { return !sd.bloodline || r.bl === sd.bloodline; });
    if (!usable.length) {
      U.card(function () {
        U.hint('没有可用对象：这支血清只有「' + sd.bloodline + '」血统能用（先去伙伴页觉醒血统）', 4 * CV.SCALE);
      });
    } else {
      U.card(function () {
        usable.forEach(function (r) {
          const taken = Core.serumTaken(r.id, sid);
          const full = taken >= (sd.max || 0);
          listBtn({
            t1: r.name, t2: r.sub + ' · 已服 ' + taken + '/' + sd.max + (full ? ' · 已满' : ''),
            dim: full, tag: full ? '已满' : null,
            btn: full ? null : ['喂 ' + cnt + ' 支', 'primary', 'serumtarget:' + r.id],
          });
        });
      });
    }
    U.btnRow([{ label: '‹ 返回', style: 'ghost', id: 'serum_back' }]);
  });
  [1, 10, 0].forEach(function (v) {
    CV.on('serum:' + v, function () {
      const n = v === 0 ? (Core.S.items[curItem] || 0) : v;
      if (n < 1) { CV.toast('道具不足'); return; }
      serumCount = n; CV.push('serum_pick');
    });
  });
  CV.on('serumtarget:*', function (id) {
    const r = Core.useSerum(id, String(curItem).replace(/^serum_/, ''), serumCount);
    CV.toast(r.msg || (r.ok ? '已喂下' : '不能喂'));
    CV.render();
  });
  CV.on('serum_back', function () { CV.pop(); });

  /* ---------- 选择装备（网页版 pickEquipFor）----------
     V9.6.7 自审抓到：伙伴页 / 主角页的装备格，**空槽点了完全没反应**（只有装了装备的格子能点）。
     网页版是"空格子 → 进这个部位的候选列表"。这里补齐，伙伴和主角共用同一个页面。 */
  let pickChar = null, pickSlot = null;
  function eqBrief(e) {
    const st = Core.equipStats(e) || { flat: {}, affix: {} };
    const parts = [];
    const flat = st.flat || {};
    if (flat.atk) parts.push('攻+' + Math.round(flat.atk));
    if (flat.def) parts.push('防+' + Math.round(flat.def));
    if (flat.hp) parts.push('血+' + Math.round(flat.hp));
    if (flat.spd) parts.push('速+' + Math.round(flat.spd));
    Object.keys(st.affix || {}).forEach(function (k) {
      parts.push(((D.AFFIX_POOL || {})[k] || {}).name + '+' + (st.affix[k] * 100).toFixed(1) + '%');
    });
    return parts.join(' ');
  }
  function eqTag(e) {
    if (e.charId) return '专属·' + (((D.charById || {})[e.charId] || {}).name || '?');
    if (e.classSet) return ((D.CLASS_SETS || {})[e.classSet] || {}).name || '职业套装';
    if (e.set) return ((D.SETS || {})[e.set] || {}).name || '世界套装';
    return '普通';
  }
  CV.register('equip_pick', function () {
    const S = Core.S, cid = pickChar, slot = pickSlot;
    const allowed = (cid === '@player' ? D.PLAYER_SLOTS : D.RECRUIT_SLOTS) || [];
    const cur = (S.equipped[cid] || {})[slot];
    const curEq = cur && S.equips[cur];
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'equip_pick_back');
    CV.text('选择' + (D.EQUIP_SLOTS[slot] || '') + '（' + Core.charName(cid) + '）', U.pad() + U.cw() / 2,
      U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    U.note(curEq ? ('当前：' + curEq.name + ' +' + curEq.enhance + ' · 下面是换成这件之后的属性变化')
      : '该部位还没有装备，装上即为净收益', 0);
    U.space(CV.SP[2]);
    const list = Core.inventoryEquips().filter(function (e) {
      return e.slot === slot && allowed.indexOf(e.slot) >= 0 && Core.canEquip(cid, e);
    });
    if (!list.length) {
      U.card(function () { U.hint('背包中没有该伙伴可穿戴的此部位装备', 4 * CV.SCALE); });
    } else {
      U.card(function () {
        list.forEach(function (e) {
          const who = Core.equipWearer(e.uid);
          const isCur = e.uid === cur;
          listBtn({
            t1: e.name + ' +' + e.enhance + '　' + eqTag(e),
            t2: eqBrief(e) + (isCur ? ' · 当前穿戴中' : (who ? (' · ' + Core.charName(who) + '装备中') : '')),
            btn: isCur ? null : ['装备', 'primary', 'eqwear:' + e.uid],
          });
        });
      });
    }
    U.btnRow([{ label: '‹ 返回', style: 'ghost', id: 'equip_pick_back' }]);
  });
  CV.on('eqslot:*', function (arg) {
    const i = String(arg).indexOf(':');
    if (i < 0) return;
    pickChar = String(arg).slice(0, i);
    pickSlot = String(arg).slice(i + 1);
    CV.push('equip_pick');
  });
  CV.on('eqwear:*', function (uid) {
    const from = Core.equipWearer(uid);
    const ok = Core.equipItem(pickChar, uid);
    CV.toast(ok ? (from && from !== pickChar ? ('已装备（从 ' + Core.charName(from) + ' 身上取下）') : '已装备') : '该伙伴无法穿戴此装备');
    CV.render();
  });
  CV.on('equip_pick_back', function () { CV.pop(); });
})();
