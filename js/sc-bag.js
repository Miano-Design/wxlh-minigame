/* 背包 —— 照网页版 js/ui.js 的 bagScreen / bagPoolGrid / itemDetail 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     ① 三个分类卡（道具 / 材料 / 装备，吸在货币条下面）：.tab-card = 44 高、圆角 7、字号 12、均分
     ② 待领箱（背包满时代收的，有才出现）
     ③ 格子区：标题行「道具格 5 / 50」+ 5 列网格（格子正方形、缝 6、圆角 10）
        · 已占格：物品名（13px 粗体，最多两行、居中在"数量以上"那块）+ 数量（12px 金色粗体，贴底 8）
        · 空格：一个空框
        · 最后一格：「＋」虚线框 —— 点了先问"是否支付 ◉x 扩容"
     ④ 装备栏：格子里只放**没穿在身上的**装备（名字带稀有度色 + 强化等级），标题行右侧有「批量分解」
     ⑤ 道具详情：点道具开二级页（名字+数量 / 说明 / 在哪用 / 去哪弄 / 使用类按钮 / 返回）
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  /* V1.1.x（2026-09-27 · 音频系统）：背包这一片的音效出口（强化 / 重铸 / 开箱 / 被拒）。
     一处定义，不散着写；G.AUD 不存在时静默跳过（尺子的假环境不加载音频模块）。 */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }
  const fmt = G.fmt || ((n) => String(n));
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;
  /* V1.1.9（续13 · 乙组）：稀有度排序权重（数字越小越靠前）。没有 rarity 的一律 9（垫底）。 */
  const RARITY_RANK = { MYTH: 0, UR: 1, SSR: 2, SR: 3, R: 4, N: 5 };
  const rarRank = (r) => (RARITY_RANK[r] === undefined ? 9 : RARITY_RANK[r]);

  /* ---------- 批量分解（网页版 equipBatchBar / equipFilterBar 的那颗按钮）----------
     父亲大人 2026-09-17：装备栏那颗「🧹 批量分解」原来点了只弹一句"下一步复刻"。
     照网页版做成选择模式：点格子选中 → 底栏显示"已选 N 件 · 预计 ◆ X" → 分解。 */
  let batchMode = false;
  const batchSel = new Set();
  /* F2-6（抢修单 0928R3）：上一次画背包用的是**哪一层页面对象**（`CV.top()` 的引用）。
     换页（reset / push / switchTab）每次都新建一层 → 判定为"进页第一帧"，把**模式类**
     状态复位；同一层原地重画（CV.render）还是同一个引用 → 状态保留（批量挑选不能丢）。
     真因（探针复现）：批量分解开着的时候从结算页点「📮 待领箱 · 去领回」进来
     （`goto_stash` → `CV.reset('bag')`），以前会**直接落在批量分解模式**、底下挂着那条分解条。 */
  let bagLevel = null;
  /* 装备页的两行分类（照网页版 equipFilterBar 的 .pill-tabs.tight）。
     V9.6.8（父亲大人）：分类保留，但去掉「普通」和「SSR+」——
     "普通"跟"全部"几乎重合；"SSR+"原来挂在部位那行末尾，七个部位 + 它挤到第三行、孤零零一个。 */
  // 血统神装（神话）单独一枚 —— 末段玩家会攒一整队，混在"全部"里翻不出来（V9.6.76，与网页版同口径）
  const EQ_CATS = [['all', '全部'], ['world', '世界套装'], ['blood', '命格套装'], ['god', '命格神装'], ['sig', '专属']];
  const EQ_SLOTS = [['all', '全部'], ['weapon', '武器'], ['armor', '胸甲'], ['head', '头部'], ['hands', '手部'], ['legs', '腿部'], ['accessory', '饰品']];
  let eqCat = 'all', eqSlot = 'all';
  /* 一行小胶囊（.pill.sm：40 高、圆角兜住、选中红框红字）
     ================= V1.1.15（2026-09-27 · 派单 I 第 3 条 · 视觉复审 P0-1）=================
     这一排原来是**平铺一行**：`x += w + gap`，没有换行、没有溢出保护、也不裁。
     窄屏上量出来（320×568 · iPhone 5/SE 档，`U.iw()` 只有 296）：

       分类行（全部/世界套装/命格套装/命格神装/专属）  需要 306  → 超 10px
       部位行（全部/武器/胸甲/头部/手部/腿部/饰品）     需要 330  → 超 34px（「饰品」只剩一个"饰"字）

     证据：岗位回单/验收截图-0927视觉复审/关键取证/320-背包-装备-筛选胶囊出画.png。
     这正是康康今天给 `U.btnRow` 补的那种洞（uiw.js V1.1.11 那段注释），**胶囊行是最后一份**。
     现在同款修法：**先试一行，放不下就按"一行能塞几颗"分行**，高度按行数往上加
     （胶囊按自然宽排，不做整行拉伸 —— 筛选标签拉满行宽反而看不出"哪几颗是同一组"）。 */
  function pillRow(list, cur, prefix) {
    /* V9.6.12（父亲大人）：这一排原来 40 高，在手机上显得很笨重 → 收到 28 */
    const h = 28 * CV.SCALE, gap = 6 * CV.SCALE, top = U.y;
    const avail = U.iw();
    const nat = list.map(function (t) { return CV.measure(t[1], CV.FS.xs) + 18 * CV.SCALE; });
    const rows = [];
    {
      let row = [], w = 0;
      nat.forEach(function (nw) {
        const add = row.length ? gap + nw : nw;
        if (row.length && w + add > avail + 0.5) { rows.push(row); row = [nw]; w = nw; }
        else { row.push(nw); w += add; }
      });
      if (row.length) rows.push(row);
    }
    let y = top, idx = 0;
    rows.forEach(function (ws) {
      let x = U.pad();
      ws.forEach(function (w) {
        const t = list[idx++];
        const on = cur === t[0];
        CV.round(x, y, w, h, CV.PILL,  on ? CV.a(CV.C.danger, .13) : CV.a(CV.C.panel, .50), on ? CV.C.accent : CV.C.line);
        CV.text(t[1], x + w / 2, y + h / 2, { size: CV.FS.xs, align: 'center', color: on ? CV.C.white : CV.C.dim });
        CV.hit(prefix + t[0], x, y, w, h);
        x += w + gap;
      });
      y += h + gap;
    });
    U.y = top + rows.length * h + (rows.length - 1) * gap + 6 * CV.SCALE;
  }
  /* .eq-bar：左边「未穿戴 x / y 格」，右边「🧹 批量分解」
     ================= F9 ①（父亲大人 09-29 ·「装备界面的标签和批量分解也固定在顶部吧」）=================
     这一行原来是正文、跟着滚走；现在与上面两行筛选一起**吸顶**（见 eqControls / CV.sticky）。
     批量分解模式下右端原来写「批量分解中 · 点格子挑选」，现在改成**选中状态**
     （「已选 N 件 · 预计 ◆ X」）—— 父亲大人点名的就是这一条要钉在顶上看得见；
     底栏那条批量条因此**不再重复画同一句**（分解 / 取消那两颗照旧贴底）。 */
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
      const txt = '已选 ' + batchSel.size + ' 件 · 预计 ◆ ' + fmt(batchGain());
      CV.text(CV.fit(txt, U.cw() - 110 * CV.SCALE, CV.FS.xs, true), U.pad() + U.cw(), top + h / 2,
        { size: CV.FS.xs, color: CV.C.gold, align: 'right', bold: true });
    } else {
      const lbl = '批量分解';
      const bw = CV.measure(lbl, CV.FS.sm) + 20 * CV.SCALE;
      U.btn(U.pad() + U.cw() - bw, top, bw, h, lbl, 'ghost', 'bag_batch');
    }
    U.y = top + h + 8 * CV.SCALE;
  }
  /* ================= F9 ① · 装备页那三行 = 一处定义 =================
     分类筛选 / 部位筛选 / 「未穿戴 x / y 格 · 批量分解」——**只在这里排一次**：
       · 正文那一遍只**量高度**（`U.dry`，见 register('bag')），量出来的那几条热区打 ghost；
       · 真正落笔在 `CV.sticky` 那一趟按**屏幕坐标**画（与背包三大标签同一条路，不另起一套）。
     返回这三行占的总高（含各自的下留白）。 */
  function eqControls() {
    const top = U.y;
    pillRow(EQ_CATS, eqCat, 'ecat:');
    pillRow(EQ_SLOTS, eqSlot, 'efilter:');
    eqBarRow();
    return U.y - top;
  }
  /* 一行「左文字 + 右按钮」（和 sc-last 的 coreRow 同一套写法；各文件各留一份，不跨文件依赖） */
  function listBtn(o) {
    const bw = 84 * CV.SCALE, bh = U.BTN_SM * CV.SCALE;
    const rowTop = U.y;
    /* V1.1.6（A6）：把 `t1Color` / `tag` 都透传给 U.listRow —— 装备候选列表要用
       "品质色标题 ＋ 稀有度小标"（见 equip_pick 那一段）。 */
    const h = U.listRow({ t1: o.t1, t2: o.t2, rightW: o.btn ? (bw + 10 * CV.SCALE) : 0, dim: o.dim, tag: o.tag, t1Color: o.t1Color });
    if (o.btn) U.btn(U.ix() + U.iw() - bw, rowTop + (h - bh) / 2, bw, bh, o.btn[0], o.btn[1], o.btn[2], o.btn[3]);
    return h;
  }
  function batchGain() {
    let gain = 0;
    batchSel.forEach(function (uid) {
      const e = Core.S.equips[uid];
      /* 锁定的不参与（`Core.decomposeMany` 也是这么跳过的）—— 预估与真发奖必须同一条判据，
         否则确认页会报出一个玩家拿不到的 ◆。 */
      if (e && !e.lock) gain += (D.DECOMPOSE_GAIN[e.rarity] || 0) + Math.floor((e.enhance || 0) * 3);
    });
    return gain;
  }
  /* ================= 装备页"**现在看得见的那批**" —— 一处定义 =================
     列表画出来的、批量快选/全选能选中的，必须是**同一批**：
       没穿在身上的 → 当前分类（全部/世界/血统/神装/本命）→ 当前部位 → 前 `bag.eqCap` 格（超出的格子不画）。
     以前"快选"自己又写了一遍判据（而且**没带分类/部位筛选**、也没算 cap），
     于是"快选选中的"与"你在屏幕上看得见的"可以不是一批 —— 现在两边都读这一个函数。 */
  function filtEquips() {
    const S = Core.S;
    const worn = new Set();
    Object.keys(S.equipped).forEach(function (cid) {
      Object.values(S.equipped[cid] || {}).forEach(function (u) { if (u) worn.add(u); });
    });
    /* 排序规则在 `core.sortEquips` 一处（强化 → 品质 → 部位 → 名称） */
    let list = Core.sortEquips(Object.values(S.equips).filter(function (e) { return !worn.has(e.uid); }));
    if (eqSlot !== 'all') list = list.filter(function (e) { return e.slot === eqSlot; });
    if (eqCat === 'world') list = list.filter(function (e) { return !!e.set; });
    else if (eqCat === 'blood') list = list.filter(function (e) { return !!e.bloodSet; });
    else if (eqCat === 'god') list = list.filter(function (e) { return !!e.godSet; });
    else if (eqCat === 'sig') list = list.filter(function (e) { return !!e.charId; });
    return list;
  }
  /** 画在屏幕上的那几格（＝列表真正铺出来的那批）。快选与全选都读它。 */
  function visibleEquips() { return filtEquips().slice(0, Core.S.bag.eqCap); }
  /* 底栏画成"页面级覆盖层"（CV.pageOverlay）：不跟着内容滚动、也不被顶栏/底栏裁掉 */
  /* 快选的六档（**顺序就是稀有度从低到高**，颜色直接取现成的 `rarColor`） */
  const RARITY_PICK = ['N', 'R', 'SR', 'SSR', 'UR', 'MYTH'];
  function batchBar() {
    if (!batchMode) return;
    const pad = U.pad();
    const bh = U.BTN_SM * CV.SCALE;
    const gap = 6 * CV.SCALE, lineGap = 8 * CV.SCALE, innerPad = 12 * CV.SCALE;
    /* ================= 先量再排（短屏要求）=================
       六档稀有度 ＋「全选」「清空」在 320 上**放不进一行**（实测：46/54 宽的八颗 ＋ 标签 ≈ 460 > 296）。
       所以这里**先按可用宽度算出行数**，底栏高度跟着行数长；不许硬塞、不许把字缩到看不清、
       更不许让最右边那颗被挤出屏幕。 */
    const items = RARITY_PICK.map(function (r) { return { label: r, id: 'bselr:' + r, w: 46 * CV.SCALE, rare: r }; })
      .concat([{ label: '全选', id: 'ball', w: 54 * CV.SCALE }, { label: '清空', id: 'bclear', w: 54 * CV.SCALE }]);
    const avail = CV.W - pad * 2 - innerPad * 2;
    const lead = CV.measure('快选：', CV.FS.sm) + gap;
    const rows = [];
    let row = [], usedW = lead;
    items.forEach(function (it) {
      if (row.length && usedW + it.w > avail) { rows.push(row); row = []; usedW = 0; }
      row.push(it); usedW += it.w + gap;
    });
    if (row.length) rows.push(row);
    const pickH = rows.length * bh + (rows.length - 1) * lineGap;
    const h = innerPad + pickH + lineGap + bh + innerPad;
    const y = CV.H - CV.NAV_H - CV.safeBottom - h - 8 * CV.SCALE;
    CV.hitMode = 'screen';
    /* 和网页版 .batch-bar 一样带一层上投影（原来贴死的平色块，看着很"重"） */
    CV.ctx.save();
    CV.ctx.shadowColor = CV.a(CV.C.shade, .45); CV.ctx.shadowBlur = 20 * CV.SCALE; CV.ctx.shadowOffsetY = -4 * CV.SCALE;
    CV.round(pad, y, CV.W - pad * 2, h, CV.RADIUS,  CV.a(CV.C.panel, .50), CV.C.line);
    CV.ctx.restore();
    /* 快选各档：按钮用现成的 ghost 形，字用**现成的稀有度色**（不另造一套颜色）。
       「已选 N 件 · 预计 ◆ X」那一句在顶部吸顶条（eqBarRow）上，这里不重复。 */
    let ry = y + innerPad;
    rows.forEach(function (r, ri) {
      let x = pad + innerPad;
      if (ri === 0) {
        CV.text('快选：', x, ry + bh / 2, { size: CV.FS.sm, color: CV.C.dim });
        x += lead;
      }
      r.forEach(function (it) {
        U.btn(x, ry, it.w, bh, '', 'ghost', it.id);
        CV.text(it.label, x + it.w / 2, ry + bh / 2,
          { size: CV.FS.sm, align: 'center', color: it.rare ? rarColor(it.rare) : CV.C.text, bold: true });
        x += it.w + gap;
      });
      ry += bh + lineGap;
    });
    /* 最后一行：说明 ＋ 分解 / 取消 */
    CV.text('点格子挑选', pad + innerPad, ry + bh / 2, { size: CV.FS.sm, color: CV.C.dim });
    const b2 = 76 * CV.SCALE, g2 = 8 * CV.SCALE;
    U.btn(CV.W - pad - b2 * 2 - g2 - innerPad, ry, b2, bh, '⚡ 分解', 'primary', 'bgo');
    U.btn(CV.W - pad - b2 - innerPad, ry, b2, bh, '取消', 'ghost', 'bclose');
    CV.hitMode = 'content';
  }

  /* V1.1.2（A11 并池）：**三个标签 → 两个** —— 道具与材料并成一个池（父亲大人拍板
     「并池容量还是 50，单格上限 100」），所以"材料"不再是独立标签；装备保持独立（不占池、每件 1 格）。
     老的 `view === 'mat'` 一律归到 'item'（玩家从旧版本进来时那个状态还留在内存里）。 */
  const TABS = [['item', '道具'], ['equip', '装备']];
  /* V1.1.7（丙组 1 · "一个按钮的 id 只在一处拼"）：那颗「＋（扩容）」的热区 id 原来是**现场拼**的
     （`'bag_expand:' + view` 在渲染处、`CV.on('bag_expand:eq')` 在注册处）—— 两套拼法不一样，
     装备那一格登记的是 `bag_expand:equip`、处理器只注册了 `:eq` → **真死键**（康康 09-26 抓到的那只）。
     现在把 id 写进池子表里：渲染与注册**都读 `POOLS[view].expandId`**，两处不可能再分叉。
     （做成字段而不是"再拼一次"：以后加第三个池，只要在这张表里补一行，两边自动跟上。） */
  const POOLS = {
    item: { label: '背包', capKey: 'itemCap', expKey: 'itemExpands', expandId: 'bag_expand:item' },
    mat: { label: '背包', capKey: 'itemCap', expKey: 'itemExpands', expandId: 'bag_expand:mat' },   // 并池：与 item 同一个池
    equip: { label: '装备格', capKey: 'eqCap', expKey: 'eqExpands', expandId: 'bag_expand:equip' },
  };
  let view = 'item';
  if (view === 'mat') view = 'item';
  let curItem = null;          // 道具详情页当前看的道具

  /* ---------- 分类卡（网页版 .tab-cards / .tab-card） ---------- */
  /* V9.6.9（父亲大人两件事一起）：
     ① "固定在面板上不跟着下滑这个你没做好" —— 网页版 .tab-cards 是 position:sticky、
        钉在货币条下面；小游戏原来是普通内容、跟着滚走了。现在标签**只在吸顶那一趟**
        按屏幕坐标画（cv.js 的 CV.sticky 钩子），内容区只负责让出它的高度。
        所以这里不再画，只推进游标 —— 位置由 CV.sticky 统一决定，不会出现两层错位。
     ② "离上面间隔太大" —— 吸顶条贴着顶栏下方 4px，内容从它下面接着排。 */
  /* V9.6.11（父亲大人）："三个标签上下间距又不一致了，不用画边框，把空间等分就行"。
     之前上面 4、下面 12 —— 上下不等，而且吸顶条铺的是一层**平色**底，
     页面改成渐变之后这块平色反而显出一条"边框/接缝"。现在：上下都是 10，等距；
     底不再用平色，改用**和页面同一条渐变**（颜色逐像素对上 → 完全看不见接缝）。 */
  const TAB_TOP_GAP = 10 * CV.SCALE;     // 标签上面留的空
  /* V9.6.121（父亲大人："背包装备里第一排标签跟顶部的三个标签太贴了，下来一点"）：
     标签下面的留白 10 → **16**（上面保持 10）—— 主标签下面还有一条金色下划线，
     10px 的留白在手机上看着就是"贴在筛选胶囊上"。吸顶条底与内容起点都从这条常量算，会自动跟着走。 */
  /* 2026-10-02（父亲大人：「这个**上下间距明显不一致**吧，明显下面太宽了」）：
     上面 10、下面 16，而标签是**居中**在 32 高的卡片里的 ⇒ 视觉上"标签中心到上沿 26px、
     到下沿 32px"，下面确实宽一截。V9.6.121 把下面从 10 抬到 16 是为了"下划线别贴在筛选胶囊上"，
     但那条只对**装备页**（下面紧跟筛选行）成立，道具/材料页下面是格子，就只剩"下面空一大块"。
     现在回到 **10**：上 10 / 下 10，配 32 的卡片 = 上下各 26px，与顶栏那条对齐。
     ⚠️ 吸顶条高度、内容起点、以及 `CV.stickyH`（给 cv.js 裁内容用的）全部由这条常量派生，
        改这一处三处自动跟着走 —— 不要只改其中一个。 */
  const TAB_SAFE_GAP = 10 * CV.SCALE;    // 标签下面留的空（与上面 TAB_TOP_GAP 对称）
  /* 2026-10-02（父亲大人：「装备这边也是一样的，下面的明显宽了」）：
     装备页在"未穿戴 x/y 格 · 批量分解"那一行下面还有一层呼吸带（CV.HEAD_GAP=8），
     叠上那行自己的内边距与网格的留白，视觉上就是"下面比上面宽一截"。
     收到 **2px**（不是取消 —— 一上滑，最后一行会贴在吸顶板下沿上，很难看）。
     ⚠️ 吸顶板高度 / 内容起点 / CV.stickyH 三处**必须用同一个值**，所以收在这一个常量里。 */
  const BAG_TAIL_GAP = Math.max(2 * CV.SCALE, Math.round((CV.HEAD_GAP || 0) * 0.25));
  function tabCards() {
    /* 只占位（标签本身由 CV.sticky 画）：让内容从"标签 + 下面那条空"之后开始。
       内容原点在顶栏下方 8px，标签从顶栏下方 TAB_TOP_GAP 起，所以减掉这 8px 的基准差。 */
    U.y += 32 * CV.SCALE + TAB_TOP_GAP + TAB_SAFE_GAP - 8 * CV.SCALE;   // 32 = 标签行高（跟 drawTabCards 一致）
  }
  /* 在给定 y（屏幕坐标）画三张标签卡 */
  function drawTabCards(y) {
    /* V9.6.12（父亲大人："直接用这样表示就行，不用画外框，选到那个就高亮、下面加一条线"）：
       三个词均分整行、中间用竖线分隔，选中的走金色 + 下面一条金色下划线。 */
    const h = 32 * CV.SCALE;
    const w = U.cw() / TABS.length;
    const mode = CV.hitMode;
    TABS.forEach(function (t, i) {
      const x = U.pad() + i * w;
      const on = view === t[0];
      if (i) {   // 竖线分隔（第一张左边不画）
        CV.ctx.strokeStyle = CV.C.line2; CV.ctx.lineWidth = 1;
        CV.ctx.beginPath();
        CV.ctx.moveTo(x - .5, y + h * 0.22); CV.ctx.lineTo(x - .5, y + h * 0.78);
        CV.ctx.stroke();
      }
      CV.text(t[1], x + w / 2, y + h / 2, { size: CV.FS.lg, bold: true, align: 'center', color: on ? CV.C.gold : CV.C.dim });
      if (on) {  // 选中：下面一条金色下划线（左右各留 26%）
        CV.round(x + w * 0.26, y + h - 5 * CV.SCALE, w * 0.48, 2 * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
      }
      CV.hit('bagview:' + t[0], x, y, w, h);
    });
    CV.hitMode = mode;
  }

  /* ---------- 待领箱（网页版 stashBar） ---------- */
  function stashBar() {
    /* ================= V1.1.15（2026-09-27 · 父亲大人："那我要是副本掉落的装备呢"）=================
       装备页显示的是**装备待领箱**（`S.stashEq`）：装备格满时掉的/开出来的装备先存这儿，
       扩容后一键领回 —— 以前是直接折现成 ◆，刷本出的 UR 就这么没了。 */
    if (view === 'equip') {
      const eqN = Core.stashEqCount ? Core.stashEqCount() : 0;
      if (!eqN) return;
      const ue = Core.bagUsage();
      const eqList = Core.stashEqList();
      U.card(function () {
        U.h3('📮 待领箱', eqN + ' 件装备');
        U.hint('装备格满时掉的、开出来的装备先存这里', 2 * CV.SCALE);
        U.hint(eqList.slice(0, 3).map((e) => e.name).join(' · ')
          + (eqList.length > 3 ? (' … 还有 ' + (eqList.length - 3) + ' 件') : ''), 2 * CV.SCALE);
        U.hint('装备格 ' + ue.eqUsed + ' / ' + ue.eqCap, 2 * CV.SCALE);
        U.space(CV.SP[1]);
        U.btnRow([
          { label: '全部领回', style: 'primary', id: 'stash_eq_claim' },
          { label: '扩容 +' + D.BAG_EXPAND_SIZE + ' 格（◉ ' + fmt(D.bagExpandCost(Core.S.bag.eqExpands || 0)) + '）',
            style: 'ghost', id: 'bag_expand:equip' },
        ]);
      });
      return;
    }
    const n = Core.stashCount();
    if (!n) return;
    const list = Core.stashList();
    /* V1.1.15（2026-09-27 · 父亲大人："待领箱的卡片显示和扩容后还是没东西"）：
       领回**要占格子**，背包满就一件都进不来 —— 可原来卡片只写"全部领回"，
       玩家（尤其用 GM 把背包塞满测的档）根本不知道为什么点了没反应。
       现在把占用写出来、把"还差几格"算出来，并且**扩容按钮直接放这张卡上**
       （不用再跑去装备页点那颗＋，那颗加的是装备格、救不了道具）。 */
    const u = Core.bagUsage();
    const need = Core.stashNeedCells ? Core.stashNeedCells() : 0;
    U.card(function () {
      U.h3('📮 待领箱', n + ' 件');
      U.hint('背包满时收到的道具先存这里', 2 * CV.SCALE);
      const txt = list.slice(0, 4).map((x) => ((D.ITEMS[x.id] || {}).name || x.id) + '×' + x.n).join(' · ');
      U.hint(txt + (list.length > 4 ? ' … 还有 ' + (list.length - 4) + ' 种' : ''), 2 * CV.SCALE);
      U.hint('背包 ' + u.used + ' / ' + u.cap + (need ? (' · 还差 ' + need + ' 格才能全领回') : ' · 空间够，可以全领回'),
        2 * CV.SCALE);
      U.space(CV.SP[1]);
      U.btnRow([
        { label: '全部领回', style: 'primary', id: 'stash_claim' },
        { label: '扩容 +' + D.BAG_EXPAND_SIZE + ' 格（◉ ' + fmt(D.bagExpandCost(Core.S.bag.itemExpands || 0)) + '）',
          style: 'ghost', id: 'bag_expand:item' },
      ]);
    });
  }

  /* ---------- 网格（网页版 .bg-grid：5 列、缝 6、格子正方形、圆角 10） ---------- */
  function grid(cells, used, cap, expandId, cost, filtering) {
    const gap = 6 * CV.SCALE, cols = 5;
    /* V1.1.11（父亲大人 09-27：「现在小屏幕的背包显示就有问题，一直没改」）：
       旧算式是 `Math.max(62 * SCALE, 可用宽/5)` —— 那个 **62 的下限**在窄屏上会赢，
       于是 5 列的总宽 = 5×62 ＋ 4×gap ＞ 屏宽，**第 5 列被切在屏幕外**（320×568 实测：4.5 列）。
       ⇒ 去掉下限，改成**按可用宽等分**；同时给一个"再窄也读得出来"的兜底：
         只有连 40pt 都不到时才夹到 40（那已经是 200pt 宽的极端屏了，本项目不会遇到）。 */
    const fit = (U.iw() - gap * (cols - 1)) / cols;
    const cw = Math.max(40 * CV.SCALE, fit);
    const top = U.y;
    cells.forEach(function (c, i) {
      const r = Math.floor(i / cols), col = i % cols;
      const x = U.ix() + col * (cw + gap), y = top + r * (cw + gap);
      if (c.empty) {
        CV.round(x, y, cw, cw, CV.RADIUS, CV.a(CV.C.shade, .13), CV.C.line);
        return;
      }
      if (c.add) {
        /* 「＋」扩容格：灰虚线框 + 中间一个 ＋（网页版 .bg-slot.add） */
        CV.ctx.save();
        CV.ctx.setLineDash([5, 4]);
        CV.round(x, y, cw, cw, CV.RADIUS, null, CV.C.line2);
        CV.ctx.restore();
        CV.text('＋', x + cw / 2, y + cw / 2, { size: CV.DISP.d1 * CV.SCALE, align: 'center', color: CV.C.dim });
        CV.hit(expandId, x, y, cw, cw);
        return;
      }
      if (c.sel) {
        /* 网页版 .bg-slot.sel：红框 + 红色淡底（批量分解时"这件选中了"） */
        CV.round(x, y, cw, cw, CV.RADIUS, CV.a(CV.C.danger, .2), CV.C.accent);
      } else if (c.rarity) {
        /* V1.0.1（P2 第三步，AI 视觉工程师："道具/材料 43 件走**品质底框＋图形族**，不精绘 43 张"）：
           有品质的道具（箱子、装备类）按品质色描边 —— 一眼看出档次，
           而不用给每一件单独画图标（43 张图既做不完也没必要）。材料没有品质，保持原样。 */
        CV.round(x, y, cw, cw, CV.RADIUS, CV.a(CV.C.panel2, .50), rarColor(c.rarity), 2 * CV.SCALE);
      } else {
        CV.round(x, y, cw, cw, CV.RADIUS, CV.a(CV.C.panel2, .50), CV.C.line);
      }
      /* 名字：13px 粗体，最多两行，居中在"数量以上"那块区域（网页版 .bg-name）。
         V1.1.11（窄屏）：320 宽的屏上 5 列只有 ~55pt 宽，按 13px ＋ 左右各 7pt 内边距
         会**截成省略号**（"异界征…"）。窄格子里降到四级字（CV.FS.md）并把内边距收到 8pt
         —— 字号仍取既有台阶，不新造字号；390 以上一切照旧。 */
      const tight = cw < 58 * CV.SCALE;
      const nameSize = tight ? CV.FS.md : CV.FS.lg;
      const namePad = (tight ? 8 : 14) * CV.SCALE;
      const lines = CV.wrap(c.name, cw - namePad, nameSize, 2);
      const areaH = cw - 22 * CV.SCALE;                 // 数量占底部 ~22
      const cy0 = y + areaH / 2;
      const lh = nameSize * 1.3;
      lines.forEach(function (ln, k) {
        CV.text(ln, x + cw / 2, cy0 + (k - (lines.length - 1) / 2) * lh,
          { size: nameSize, bold: true, align: 'center', color: c.color || CV.C.text });
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
    const lvl = CV.top();
    if (bagLevel !== lvl) {
      bagLevel = lvl;
      batchMode = false; batchSel.clear();     // 只复位"模式类"状态；分类 / 部位筛选（看哪一栏）不动
    }
    const S = Core.S;
    U.begin();
    /* 三大标签吸顶：内容先让出它的高度，标签本身在 CV.sticky 那一趟按屏幕坐标画 */
    tabCards();
    /* ================= F9 ①（父亲大人 09-29）=================
       「装备界面的标签和批量分解也固定在顶部吧」—— 装备页那三行（分类筛选 / 部位筛选 /
       「未穿戴 x / y 格 · 批量分解」）原来跟着内容滚走，现在并进同一条吸顶路（`CV.sticky`）：
       正文这一遍**只量高度、不落笔**，让出的高度由 U.y 推进。
       量高度那一遍走 `U.dry`（`CV.text` / `CV.round` 不画），但它顺手登记的几条热区
       打成 `ghost`（与 `U.card` 处理"屏外卡只量没画"同一条口径：留在 CV.hits 里当锚点、
       不参与派发与撞测）—— 真正生效的那几条由 sticky 那一趟按屏幕坐标登记。 */
    let eqH = 0;
    if (view === 'equip') {
      const hitFrom = CV.hits.length, prevDry = U.dry, prevY = U.y;
      U.dry = true; eqH = eqControls(); U.dry = prevDry;
      for (let i = hitFrom; i < CV.hits.length; i++) CV.hits[i].ghost = true;
      /* ================= 康康 2026-09-29 修 · 装备页"空出一大块"的真根因 =================
         父亲大人截图问「为啥现在装备页空出来这么多」——量出来正文多让了约 110px（390）：
         `eqControls()` 是**排布**函数，它内部跑一遍就已经把 `U.y` 推了 `eqH`；
         这里原来又写 `U.y += eqH` ⇒ **同一段高度被算了两次**，正文被推到吸顶板底下再往下 110px，
         中间那一截就是那块空白（320 上同样存在）。
         正确写法：从**进函数之前**的 y 起算，再加一条**呼吸带** —— 这样正文起点与
         `CV.sticky` 铺底的下沿**逐像素对齐**（`panelBottom = TOP + TAB_TOP_GAP + h + TAB_SAFE_GAP + eqH + HEAD_GAP`，
         `contentStart = TOP + 8 + (32 + TAB_TOP_GAP + TAB_SAFE_GAP − 8) + eqH + HEAD_GAP`，两式相等）。
         做坏试验：把这里改回 `U.y += eqH` → 真渲染上「未穿戴」行与格子卡之间会当场出现 ~110px 空白
         （`_probe_bag_gap.js` 的像素带断言＋`验收截图-0929I/out-bagtop/` 那张图当场变样）。 */
      U.y = prevY + eqH + BAG_TAIL_GAP;
    }
    CV.sticky = function () {
      /* F6 #11：整段都在屏幕坐标里画，中间任何一处抛错都不许把 hitMode / U.y 留在半路。 */
      const prevMode = CV.hitMode, prevY = U.y;
      CV.hitMode = 'screen';
      try {
        /* 吸顶条要盖住从下面滚上来的内容，所以得铺一层底；但**不能用平色** ——
           页面是竖向渐变，平色会显出一条接缝（父亲大人说的"边框"）。
           这里把**和页面完全同一条渐变**重画一遍、只填这一条带：
           颜色逐像素对上，等于没画底，却又能挡住内容。
           F9 ①：这条带的高度跟着装备页那三行一起长；下沿再往下多铺一条呼吸带
           （`CV.HEAD_GAP`）—— 正文从它下面滚上来时不贴在最后一行的下沿
           （F8 ② 那条 R3-a1，inset_audit 盯着）。 */
        const h = 32 * CV.SCALE;    // 标签行高（和 drawTabCards / 占位一致）
        /* 2026-10-02：同 CV.drawPageHead —— 吸顶条改**半透明**，底图透得出来（父亲大人：实色块）*/
        const bgGrad = CV.ctx.createLinearGradient(0, 0, 0, CV.H);
        bgGrad.addColorStop(0, CV.a(CV.C.bg2, .50)); bgGrad.addColorStop(1, CV.a(CV.C.bg, .50));
        CV.ctx.fillStyle = bgGrad;
        CV.ctx.fillRect(0, CV.TOP, CV.W,
          TAB_TOP_GAP + h + TAB_SAFE_GAP + eqH + BAG_TAIL_GAP);
        /* 报出这条吸顶条的高度（屏幕坐标）—— cv.js 用它把内容层裁在它下沿以下，
           滚上来的格子就不会从半透明的条后面透出来（父亲大人 2026-10-02）。 */
        CV.stickyH = TAB_TOP_GAP + h + TAB_SAFE_GAP + eqH + BAG_TAIL_GAP;
        drawTabCards(CV.TOP + TAB_TOP_GAP);
        /* 装备页那三行紧贴在标签下面（筛选在上、批量分解条紧贴其下 —— 派单给的顺序）。
           U.y 在这里临时当**屏幕坐标**用：这三行本来就只读 U.y 做纵向推进，
           折行 / 宽度全部自己按 U.iw() 算，换算过去一字不用改。 */
        if (eqH) { U.y = CV.TOP + TAB_TOP_GAP + h + TAB_SAFE_GAP; eqControls(); }
      } finally { CV.hitMode = prevMode; U.y = prevY; }
    };
    stashBar();
    const pool = POOLS[view];
    /* V1.1.1（父亲大人 0926 拍板）：容量口径 = **max(基数 50, 已扩容值, 实际理论占用)**，
       占用格数自带"单格上限 100、超了就占下一格"——两件事都只在 core.bagUsage() 里算一次，
       这一页只读结果（不许自己再算一遍，否则界面与逻辑迟早对不上）。 */
    const usage0 = Core.bagUsage();
    const cap = pool.capKey === 'matCap' ? usage0.matCap : pool.capKey === 'eqCap' ? usage0.eqCap : usage0.cap;
    /* 装备页：两行分类（套装 / 部位）+ 一行「未穿戴 x / y 格 · 批量分解」
       —— V9.6.8（父亲大人）：小游戏的装备页原来**没有这些分类标签**（网页版有），
       而且「🧹 批量分解」原来挤在格子卡的标题行里、贴着卡片上沿。现在照网页版
       拆成独立一行，跟分类同一层、上下留白一致。
       F9 ①：这三行已经搬进吸顶层 —— 正文这里**不再画**，高度上面的 `U.y += eqH` 已经让出来了。 */
    const cost = D.bagExpandCost(S.bag[pool.expKey] || 0);
    const cells = [];
    let used = 0;
    if (view === 'equip') {
      /* 格子里只放**没穿在身上的**装备（网页版同口径：穿身上的不占格） */
      const list = filtEquips();
      used = list.length;
      list.slice(0, cap).forEach((e) => {
        /* V9.6.7：批量分解模式下，点格子 = 选中/取消（不再进详情页）——网页版同一口径 */
        cells.push(batchMode
          /* V9.6.126（父亲大人："装备加个评分"）：格子副行 = 强化等级 · 评分（与排序同一个数） */
          ? { id: 'bselu:' + e.uid, name: (e.lock ? '🔒' : '') + e.name, color: rarColor(e.rarity), sub: '+' + e.enhance + ' · ' + Core.equipScore(e), sel: batchSel.has(e.uid) }
          : { id: 'eqd:' + e.uid, name: (e.lock ? '🔒' : '') + e.name, color: rarColor(e.rarity), sub: '+' + e.enhance + ' · ' + Core.equipScore(e) });
      });
    } else {
      /* V1.1.2（并池）：这一页只剩**一个池** —— 道具与材料一起列（材料不再单独一个标签）。
         排序表（V9.6.12 之前是"按拥有顺序"）：券 → 箱 → 经验 → 血清 → 材料 → 其它，
         同组内按名字——玩家"想找券/想找材料"一眼能定位（材料 2 §A11 的"排序表"）。 */
      const RANK = { ticket: 0, box: 1, exp: 2, serum: 3, material: 4 };
      const stacks = Object.entries(S.items).filter(([, n]) => n > 0)
        .sort((a, b) => {
          const ia = D.ITEMS[a[0]] || {}, ib = D.ITEMS[b[0]] || {};
          const ra = RANK[ia.type] === undefined ? 5 : RANK[ia.type];
          const rb = RANK[ib.type] === undefined ? 5 : RANK[ib.type];
          if (ra !== rb) return ra - rb;
          /* V1.1.9（续13 · 乙组 稀有度）：**组内**再加一级"稀有度降序"（报告 §10.3）——
             上面那张组顺序表（券→箱→经验→血清→材料→兜底）一个字没动，
             只是同一组里"更稀有"的排前面（玩家扫一眼先看到 UR/SSR 那些）。 */
          const qa = rarRank(ia.rarity), qb = rarRank(ib.rarity);
          if (qa !== qb) return qa - qb;
          return String(ia.name || a[0]).localeCompare(String(ib.name || b[0]));
        });
      used = usage0.used;
      /* V1.1.1（单格上限 100 · 父亲大人："超过 100 就会占两格，这样扩容也用的上了"）：
         同一件东西按 100/格 拆开画 —— **每格写 100，最后一格写余数**；
         点任意一格进的都是**同一个详情页**（id 一样）。这样"一件东西占两格"一眼看得出来，
         不会像"两格长得一样"那样让人以为重复了。 */
      const MAX = D.BAG_STACK_MAX || 100;
      stacks.forEach(([k, n]) => {
        const it = D.ITEMS[k] || {};
        const parts = Math.max(1, Math.ceil(n / MAX));
        for (let s = 0; s < parts; s++) {
          const inThis = s === parts - 1 ? n - MAX * (parts - 1) : MAX;
          cells.push({ id: 'item:' + k, name: it.name || k, count: '×' + inThis,
            /* V1.1.9（续13 · 乙组）：**名字也按稀有度上色**。
               以前这里只给箱子传 rarity（描边），名字留默认白 —— 那一版的原因是"材料没有品质"，
               而本轮正是**给每件材料/道具定品质**（报告 §十），所以口径跟着改：
               材料/道具与装备同一套"描边 ＋ 名字色"，这样他才看得出"这是普通货还是稀有货"。 */
            rarity: it.rarity || null, color: it.rarity ? rarColor(it.rarity) : null,
            sameStack: parts > 1 });
        }
      });
    }
    /* 筛选状态下**不补空格子**（网页版同款）：筛出 3 件武器后面还跟着 47 个空格，
       玩家会以为筛选没生效。 */
    const filtering = view === 'equip' && (eqCat !== 'all' || eqSlot !== 'all');
    /* V1.1.7（父亲大人 09-26 现场反馈：「背包扩容没有看到相应的空格子增加，感觉扩了没到位」）：
       V1.1.2 那次把"补到容量"改成了"按内容铺一整行"（`ceil((内容+1)/5)*5`），代价是
       **扩容变成了看不见的** —— 板子长度只跟**内容**有关，买 +10 格之后一格没变；
       而能说明"容量变了"的那行数字早在 V9.6.12 就按他的要求撤掉了 → 屏幕上零反馈。
       现在**改回网页版的基准**（ui.js 的 bagPool 注释：「空的补到 cap 个，再加上第 cap+1 格：＋扩容」）：
       空格补到 **cap**，扩容格就永远落在**第 cap+1 格** —— 扩容一次，十颗空格立刻出现、位置也对得上。 */
    if (!filtering) while (cells.length < cap) cells.push({ empty: true });
    /* V9.6.4（父亲大人："背包的扩容格也没了"）：格子补满 cap 个之后，**必须再补最后一格**
       —— 网页版是"第 cap+1 格：灰色虚线框 + ＋"，点了问"是否支付 ◉x 扩容"。
       上一版排格子的循环只补了空格，把这一格漏掉了（grid() 里画 add 格的分支一直没被触发）。 */
    cells.push({ add: true });
    /* ================= V1.1.15（2026-09-27 · 父亲大人："待领箱有时是完整的功能卡片、
       有时只显示几排红色小字"）=================
       那句"几排红色小字"就是这里原来画的（`U.hint(..., CV.C.accent)`）——
       同一页里"东西进箱了"是卡片、"背包满了"是红字，两种形态看着像两套东西。
       现在**统一成卡片**：有东西进箱 → 上面那张带「全部领回」的卡片负责说；
       只有"满了、但还没东西进箱"这一种情况才在这里补一张**同款式**的提示卡
       （带一键扩容，玩家不用滚到底去找那颗「＋」）。 */
    /* ⚠️ 只在**道具池**这一版显示：装备格满了跟待领箱没关系（待领箱收的是道具） */
    if (used >= cap && pool.capKey !== 'eqCap' && !Core.stashCount()) {
      U.card(function () {
        U.h3('📮 背包已满', '暂时还没东西溢出');
        U.hint('新到手的东西会先存进待领箱，一件都不会丢。', 2 * CV.SCALE);
        U.hint('背包 ' + used + ' / ' + cap, 2 * CV.SCALE);
        U.space(CV.SP[1]);
        U.btnRow([{ label: '扩容 +' + D.BAG_EXPAND_SIZE + ' 格（◉ ' + fmt(cost) + '）', style: 'ghost', id: pool.expandId }]);
      });
    }
    U.card(function () {
      /* V9.6.12（父亲大人："这些文字都去掉"）：格子上面那行「XX格 N / 50」撤掉 ——
         格子本身已经把内容说清楚了，多一行标题只是白占一条高度。 */
      /* 热区 id **只从池子表里读**（丙组 1）：两处拼法分叉就是那只真死键的成因，这里不再现场拼。 */
      grid(cells, used, cap, (pool.expandId || ('bag_expand:' + view)), cost, false);
    });
    if (view === 'equip' && batchMode) CV.pageOverlay = batchBar;
  });

  /* ---------- 道具详情（网页版 itemDetail：名字+数量 / 说明 / 在哪用 / 去哪弄 / 动作 / 返回） ---------- */
  CV.register('item', function () {
    const S = Core.S;
    const it = D.ITEMS[curItem] || {};
    const n = S.items[curItem] || 0;
    /* ================= V1.1.15（2026-09-27 · 派单 I 第 1 条「320 挤压」）=================
       320×568 上"用 1 个 / 用 10 个 / 全部用（20）"三颗按钮**掉在折叠线以下**：
       上面四张信息卡（名称 / 说明 / 在哪用 / 去哪弄）把首屏吃满了，主操作要滚一下才按得到
       （证据：…/三机型对照/15-物品详情.png 第一列）。
       复审给的路子是"把在哪用/去哪弄压成一行摘要"，我这里换了个**更小、且不丢内容**的改法：
       首屏放不下时，把**动作行提到名称卡之后**（动作优先），四张信息卡原样跟在后面。
       判据按**可用内容高**而不是屏宽 —— 375×667 这种"屏不窄、但内容区也不到 520"的档同样要吃这一条
       （它和 320 一样按 491px 的内容区算）。 */
    const firstScreen = CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8;
    const actFirst = firstScreen < 520 * CV.SCALE;
    /* 动作行（各类型一套，照网页版）——窄屏要提前画，所以提成一个函数 */
    const actionRow = function () {
      /* ================= F2-5（抢修单 0928R3）=================
         这一排（盒 / 经验 / 血清 / 材料 / 券 六型共 9 颗）原来写的是
         `id: n >= 1 ? 'box:1' : ''` —— **没给 `dis`**，`U.btn` 只在 `id && !dis` 时登记热区，
         于是"什么都没有"的时候按钮照常画成能点的样子、点下去既没反应也没提示（真死键）。
         现在：**id 照留 ＋ 用 `dis` 进禁用态**（变灰 + 不登记热区），
         并把"差什么"用一行小字写在旁边（正确写法见 sc-roster.js / sc-lines.js 那几处）。 */
      if (it.type === 'box') {
        const can1 = n >= 1;
        U.btnRow([
          { label: '开 1 个', style: 'ghost', id: 'box:1', dis: !can1 },
          { label: '开 10 个', style: 'ghost', id: 'box:10', dis: n < 2 },
          { label: '全部开（' + n + '）', style: 'gold', id: 'box:0', dis: !can1 },
        ]);
        if (!can1) U.hint('一个都没有，开不了 —— 从哪来见下面「去哪弄」', 2 * CV.SCALE);
        else if (n < 2) U.hint('只剩 ' + n + ' 个，凑不够 10 个', 2 * CV.SCALE);
        return true;
      } else if (it.type === 'exp') {
        const can1 = n >= 1;
        U.btnRow([
          { label: '用 1 个', style: 'ghost', id: 'exp:1', dis: !can1 },
          { label: '用 10 个', style: 'ghost', id: 'exp:10', dis: n < 10 },
          { label: '全部用（' + n + '）', style: 'gold', id: 'exp:0', dis: !can1 },
        ]);
        if (!can1) U.hint('一个都没有，用不了 —— 从哪来见下面「去哪弄」', 2 * CV.SCALE);
        else if (n < 10) U.hint('只剩 ' + n + ' 个，凑不够 10 个', 2 * CV.SCALE);
        return true;
      } else if (it.type === 'serum') {
        /* V9.6.7 自审抓到：血清以前**只有"炼"没有"喂"** —— 炼化台能做出来，
           道具卡上却一个动作按钮都没有（说明里还写着"点这张卡选伙伴喂下"）。
           补齐网页版那三个按钮 → 「使用血清」选人页。 */
        const can1 = n >= 1;
        U.btnRow([
          { label: '用 1 支', style: 'ghost', id: 'serum:1', dis: !can1 },
          { label: '用 10 支', style: 'ghost', id: 'serum:10', dis: n < 10 },
          { label: '全部用（' + n + '）', style: 'gold', id: 'serum:0', dis: !can1 },
        ]);
        if (!can1) U.hint('一支都没有 —— 先到「炼化台」炼一支（配方在上面那张卡里）', 2 * CV.SCALE);
        else if (n < 10) U.hint('只剩 ' + n + ' 支，凑不够 10 支', 2 * CV.SCALE);
        return true;
      } else if (it.type === 'ticket') {
        const pool = D.RECRUIT_POOLS[it.pool] || {};
        const tk = Core.ticketOf(it.pool);
        U.btnRow([{ label: '去「' + (pool.name || '招募') + '」使用（现有 ' + (tk ? tk.n : n) + ' 张）', style: 'gold', id: 'go_recruit' }]);
        return true;
      }
      return false;                        // 材料没有动作（强化时自动消耗），不进"动作优先"这一条
    };
    U.begin();
    /* 父亲大人 09-27 深夜（派单 Z-B）：标题 + 返回**吸顶**，长页面滚到哪儿都点得到返回 */
    U.pageHead('道具详情', { backId: 'back_bag' });
    U.card(function () {
      const top = U.y;
      CV.text(it.name || curItem, U.ix(), top + 10 * CV.SCALE, { size: CV.FS.f1, bold: true,
        color: it.rarity ? rarColor(it.rarity) : CV.C.text });
      CV.text('×' + n, U.ix() + U.iw(), top + 10 * CV.SCALE, { size: CV.FS.f1, bold: true, color: CV.C.gold, align: 'right' });
      U.y = top + 26 * CV.SCALE;
      /* V1.1.9（续13 · 乙组）：道具 / 材料也要**看得出稀有**（父亲大人："像装备那样分稀有度展示"）。
         写法与色阶跟装备详情（本文件 eqdetail 里的 `U.kv('品质', …)`）**同一套**：
         中文名 ＋ 代码 ＋ 品质色。报告 §十 给的那张 52 件分级表就是这里的取值来源。 */
      if (it.rarity) {
        U.kv('品质', (((D.RARITY_NAME || {})[it.rarity]) || it.rarity) + ' · ' + it.rarity, rarColor(it.rarity));
      }
    });
    /* 首屏放不下的档位：动作先上（画完留一格间距再排信息卡） */
    const hoisted = actFirst && actionRow();
    if (hoisted) U.space(CV.SP[1]);
    U.card(function () { U.h3('说明'); U.note(it.desc || '', 2 * CV.SCALE); });
    U.card(function () {
      U.h3('在哪用');
      U.kv('使用场景', ({ explore: '副本探索中', character: '伙伴培养页', anywhere: '随时' })[it.where] || '—');
      if (it.use) U.note(it.use, 4 * CV.SCALE);
    });
    U.card(function () { U.h3('去哪弄'); U.note(it.src || '副本掉落 / 商店兑换', 2 * CV.SCALE); });
    /* 动作：盒/经验/血清/材料/券，各按网页版同一套按钮（首屏放得下就仍在信息卡之后，V9.6.x 原口径） */
    if (!hoisted) {
      if (!actionRow()) U.card(function () { U.note('强化装备时自动优先消耗', 2 * CV.SCALE); });
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
    U.pageHead('装备详情', { backId: 'eq_back' });     // 同上：吸顶（父亲大人 09-27 深夜）
    if (!eq) { U.card(function () { U.h3('装备详情'); U.hint('这件装备不在了', 4 * CV.SCALE); }); return; }
    const q = Core.enhanceQuote(eqUid);
    const est = Core.equipStats(eq);
    const set = D.SETS[eq.set];
    const bloodKey = eq.bloodSet ? D.bloodlineSetKey(eq.bloodWorld, eq.bloodSet) : null;
    const cs = bloodKey ? D.BLOODLINE_SETS[bloodKey] : null;
    const gs = eq.godSet ? D.GOD_SETS[eq.godSet] : null;
    const wearer = Object.keys(S.equipped).find((cid) => Object.values(S.equipped[cid] || {}).indexOf(eqUid) >= 0);
    U.card(function () {
      U.h3(eq.name + ' +' + eq.enhance, wearer ? (Core.charName(wearer) + '装备中') : '未装备');
      U.kv('部位', D.EQUIP_SLOTS[eq.slot]);
      U.kv('品质', eq.rarity, rarColor(eq.rarity));
      /* V9.6.126（父亲大人："装备加个评分吧"）：世界/品质/强化一起折算的那份分，
         和背包排序、一键最优装备是同一个函数 —— 玩家看到的数和自动选择用的数是同一个。 */
      U.kv('评分', String(Core.equipScore(eq)), CV.C.gold);
      U.kv('强化', '+' + eq.enhance + ' / 20');
      if (eq.charId) U.kv('专属', '仅限 ' + Core.charName(eq.charId) + ' 装备');
      /* 2026-09-27（父亲大人：「每人一套本命」）：本命标 —— 六件（武器/头/胸甲/手/腿/饰品）同一行，
         走本命格的灯色（与上面两条命格行同一套色）。**不新增弹窗**，就是多一行。 */
      if (eq.charId) {
        const sigCh = ((D.charById || {})[eq.charId]) || {};
        U.kv('本命', Core.charName(eq.charId) + '（' + (sigCh.bloodline || '') + '·' + (sigCh.role || '') + '）',
          CV.blLamp(sigCh.bloodline, Core.realmState().realm));
      }
      /* 命格主题（V1.1）：命格套装与神装**不染色框**（框是稀有度的），名字走本命格的灯色 —— 与网页版同口径 */
      if (gs) U.kv('命格神装', '仅限' + eq.godSet + '命格装备（穿戴者命格要对得上）', CV.blLamp(eq.godSet, Core.realmState().realm));
      if (cs) U.kv('命格套装', '仅限' + eq.bloodSet + '命格 · 同一张图（' + (eq.bloodWorld || '?') + '）的件才算一套', CV.blLamp(eq.bloodSet, Core.realmState().realm));
      U.kv('分解可得', '◆ ' + (D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3));
    });
    /* 重铸报价（**要先算** —— V1.1.12 起重铸按钮就长在属性卡里，见下面） */
    const rq = Core.reforgeQuote ? Core.reforgeQuote(eqUid) : null;
    /* ================= V1.1.12（父亲大人 09-27）=================
       他原话：「**重铸的按钮离属性太远了，我每次重铸都得滑回去看哪里变了**，要不你直接把重铸
       并到属性卡片里；然后**重铸所有词条**吧（也不用两条了）；然后你可以在**属性的数值加一个区间**，
       就让人知道这条属性最少多少、最多多少，他才有一个**重铸的方向**」。
       三处一起改：
         · 重铸那一段**搬进属性卡**（原来它单独一张卡、在强化卡下面，跟属性隔着屏幕）；
         · 每条副词条的数值后面**挂上它在这个档位能摇出的区间**（`D.affixRange`，与生成/重铸同源）；
         · 重铸本来就是**全部重摇**（`core.reforgeEquip` 是 forEach 全量），
           所以标题不再写容易读成"只摇 2 条"的「N 条」——改说人话「重摇全部 N 条数值 · 种类不变」。 */
    U.card(function () {
      /* ================= V1.1.14（父亲大人 09-27：「那**基础属性就不要重铸**吧，**分开显示**，
         用**一条横线分割开就好**，不用做的太复杂」）=================
         为什么必须分开：**基础属性是算死的**（世界 × 部位 × 档位，两件同世界同档位的武器底子一模一样），
         **副词条才是能重摇的**。以前两张搅在一张卡里、又没有分界，
         他点完重铸看到"第一个数没变"，第一反应就是"漏了一条"。
         ⇒ 结构改成两段：**基础属性 →（实线）→ 副词条**。其余 kv 行本来就是**虚线**行分隔，
           所以这条用**实线**，一眼分得出"这是分组线、不是行分隔"。 */
      const flatRows = [];
      if (est.flat.atk) flatRows.push(['攻击', '+' + Math.round(est.flat.atk)]);
      if (est.flat.def) flatRows.push(['防御', '+' + Math.round(est.flat.def)]);
      if (est.flat.hp) flatRows.push(['生命', '+' + Math.round(est.flat.hp)]);
      if (est.flat.spd) flatRows.push(['速度', '+' + Math.round(est.flat.spd)]);
      const affixRows = [];
      /* V1.1.13（0927-E · 总监 §4.4）：属性卡标题挂**词条总评**（这批词条的 q 均值）。
         ⚠️ 只在**这件装备自己的词条**上算（`rq.perAffix`）——
            `est.affix` 是**聚合后**的（含套装/神装加成），拿聚合值去比"本件可达区间"是错的。
         V1.1.14（父亲大人 09-27：「**也没必要写级还是粗，反正有数字看，或者你用颜色去区分也行**」）：
         ⇒ 每条词条右边那枚 **[ 粗/良/优/极 ] 文字标**撤掉，**改成用颜色区分**
           （灰 → 白 → 绿 → 金，从差到好；都是既有色令牌，不新造色），标题也不再写档位词。 */
      const ownByKey = {};
      ((rq && rq.perAffix) || []).forEach((a) => { ownByKey[a.k] = a; });
      const TIER_COLOR = { '粗': CV.C.dim, '良': CV.C.text, '优': CV.C.gain, '极': CV.C.gold };
      Object.keys(est.affix || {}).forEach((k) => {
        const band = D.affixRange ? D.affixRange(k, eq.rarity) : null;
        const v = '+' + (est.affix[k] * 100).toFixed(1) + '%';
        const own = ownByKey[k];
        affixRows.push([(D.AFFIX_POOL[k] || {}).name || k,
          (band ? (v + '（' + (band.lo * 100).toFixed(1) + '~' + (band.hi * 100).toFixed(1) + '%）') : v),
          own ? TIER_COLOR[own.tier] : null]);
      });
      const allRows = flatRows.concat(affixRows);
      U.h3('📊 属性', (rq && rq.perAffix && rq.perAffix.length)
        ? ('共 ' + allRows.length + ' 条 · 词条总评 ' + Math.round(rq.meanQ * 100) + '%')
        : ('共 ' + allRows.length + ' 条'));
      if (!allRows.length) U.hint('这件装备没有附加属性', 4 * CV.SCALE);
      flatRows.forEach((r) => U.kv(r[0], r[1]));
      /* 分组实线：`U.kv` 每行底是虚线（行分隔），这里用**实线**画分组线，两者一眼分得开。 */
      if (flatRows.length && affixRows.length) {
        U.draw(function () {
          CV.ctx.save();
          CV.ctx.strokeStyle = CV.C.line; CV.ctx.lineWidth = 1;
          CV.ctx.beginPath();
          CV.ctx.moveTo(U.ix(), U.y + 3 * CV.SCALE - .5);
          CV.ctx.lineTo(U.ix() + U.iw(), U.y + 3 * CV.SCALE - .5);
          CV.ctx.stroke();
          CV.ctx.restore();
        });
        U.space(6 * CV.SCALE);
      }
      affixRows.forEach((r) => U.kv(r[0], r[1], r[2] || undefined));
      const nAff = (eq.affixes || []).length;
      U.space(CV.SP[1]);
      if (!nAff) { U.hint('这件装备没有副词条，重铸不了。', 3 * CV.SCALE); return; }
      if (!rq) return;
      U.space(CV.SP[1]);
      /* ================= V1.1.13（0927-E · 总监 §4.2/§4.4 S16）：重铸这一段 =================
         两档按钮（**价格写在按钮上**）＋ 每条词条一个**锁定开关**＋ 🔥 炉火进度 ＋
         `石头 0 颗`时直接写"去哪拿"（§4.4 第 4 条：买不到石头的兜底文案）。 */
      U.kv('现有', (D.ITEMS[rq.stone] || {}).name + ' ' + rq.stoneHave + ' · ' + ((D.ITEMS[rq.item] || {}).name || rq.item) + ' ' + rq.matHave
        + (rq.short > 0 ? ('（材料不够，差 ' + rq.short + ' 块 → 用 ◉' + fmt(rq.substitute) + ' 代用）') : ''));
      /* V1.1.14（父亲大人 09-27）：「**下面那个锁也不要了，就不让人锁定**，反正**留两条词条**，
         没必要锁了」→ **逐条锁定整段撤掉**（按钮、📌 标、每锁 +1 石的算法都从界面上消失，
         玩家再也锁不了）。同时撤掉两处**纯解释性注释**：炉火那行的"满 N 次后下一次必不倒退"
         与"一颗石头都没有去哪拿"那段 —— 他的口径是"有数字看就行"。
         ⚠️ **整件锁定保护（操作卡那颗 🔒）不动** —— 他说的是"下面那个锁"（词条锁），
            整件锁是另一件事（保护一件装备不被误分解/误重铸），继续有效；
            所以下面两颗按钮遇到 `rq.locked`（整件锁）时仍然禁用并提示"先解锁"。 */
      U.kv('🔥 炉火', rq.forgeN + '/' + rq.pityAt, rq.pityReady ? CV.C.gold : CV.C.dim);
      U.space(CV.SP[1]);
      if (rq.locked) U.hint('这件装备已锁定：先解锁才能重铸（锁＝别动它）。', 3 * CV.SCALE, CV.C.accent);
      U.space(CV.SP[1]);
      const nameOf = (id) => (D.ITEMS[id] || {}).name || id;
      const cA = Core.reforgeCost(eq, { mode: 'value' }), cC = Core.reforgeCost(eq, { mode: 'kind' });
      const canKind = rq.kindable && !rq.locked;
      U.btnRow([
        { label: rq.locked ? '🔒 先解锁再重铸' : ('🔨 重摇数值（石×' + cA.stoneN + '）'),
          style: 'ghost', id: rq.locked ? '' : 'eq_reforge', dis: rq.locked },
        { label: (canKind ? '🎲 重抽词条（石×' + cC.stoneN + '）' : (rq.kindable ? '🎲 重抽词条（先解锁）' : '🎲 专属不可重抽')),
          style: 'gold', id: canKind ? 'eq_reforge_kind' : '', dis: !canKind },
      ]);
    });
    /* V9.6.15（父亲大人："装备的套装属性好像都没写，就算没激活也得用灰字写出来几件能激活什么"）：
       原来这里读的是 `set.bonus` —— **数据里没有这个字段**（数据是 `text`："2件:…　4件:…" + b2/b4/b6），
       所以这一整张卡只画了一个标题，玩家根本不知道这套能干嘛。
       现在照网页版 equipDetail 的做法：把 text 按全角空格拆开，逐条列出
       「N件：效果」，**没到的走灰字、到了的高亮并标"已激活"**；
       标题右侧写清"已穿 N / 满配 M 件"。件数只算真穿在这个人身上的（没主人就是 0）。 */
    const owner = wearer || null;
    const wornOf = function (which, key) {
      if (!owner) return 0;
      return Object.keys(S.equipped[owner] || {}).filter(function (sl) {
        const u = S.equipped[owner][sl];
        return u && S.equips[u] && S.equips[u][key] === which;
      }).length;
    };
    const mkSetCard = function (title, name, text, cnt, max) {
      U.card(function () {
        U.h3('🧩 ' + title, (name || '') + ' · ' + cnt + '/' + max + ' 件');
        String(text || '').split('　').forEach(function (part) {
          const i = part.indexOf(':');
          if (i < 0) { U.hint(part, 2 * CV.SCALE); return; }
          const need = parseInt(part.slice(0, i), 10) || 0;
          const on = cnt >= need;
          U.space(4 * CV.SCALE);
          const y = U.y;
          CV.text(part.slice(0, i + 1), U.ix(), y + 8 * CV.SCALE,
            { size: CV.FS.lg, color: on ? CV.C.gold : CV.C.dim });
          const lw = CV.measure(part.slice(0, i + 1), CV.FS.lg);
          CV.text(CV.fit(part.slice(i + 1) + (on ? ' · 已激活' : ''), U.iw() - lw - 6 * CV.SCALE, CV.FS.lg),
            U.ix() + lw + 6 * CV.SCALE, y + 8 * CV.SCALE, { size: CV.FS.lg, color: on ? CV.C.gold : CV.C.dim });
          U.space(16 * CV.SCALE);
        });
        /* V9.6.16（父亲大人）：这行解释多余 —— 件数是 0/3、效果一条条都列着，不用再解释一遍。 */
      });
    };
    /* V1.1.15（2026-09-27 · 父亲大人："现在专属装备没有套装效果吗"）：
       **本命套装**（第 4 类）也要在这张卡里露面 —— 只算"这位伙伴自己穿上的专属件数"，
       与世界套/血统套/神装同款式（2/4/6 三档）。专属没穿上（放在背包里）就显示 0/6，
       玩家能一眼看出"再穿两件就触发下一档"。 */
    if (eq.sigSet) {
      const ss = D.SIGNATURE_SET;
      let sc = 0;
      Object.values((Core.S.equipped || {})[eq.charId] || {}).forEach(function (uid) {
        const e2 = uid && Core.S.equips[uid];
        if (e2 && e2.sigSet === eq.sigSet) sc++;
      });
      if (ss) mkSetCard('本命套装', ss.name, ss.text, sc, 6);
    }
    if (gs) mkSetCard('命格神装', gs.name, gs.text, wornOf(eq.godSet, 'godSet'), 6);
    else if (cs) {
      // 血统套装按「同一张图 + 同一支血统」计件（V9.6.83），不能再只比血统名
      const bcnt = owner ? Object.keys(S.equipped[owner] || {}).filter(function (sl) {
        const u = S.equipped[owner][sl];
        return u && S.equips[u] && S.equips[u].bloodSet === eq.bloodSet && S.equips[u].bloodWorld === eq.bloodWorld;
      }).length : 0;
      mkSetCard('命格套装', cs.name, cs.text, bcnt, 6);
    }
    else if (set) mkSetCard('套装', set.name, set.text, wornOf(eq.set, 'set'), 6);
    U.card(function () {
      U.h3('强化', '+' + eq.enhance + '/20');
      U.kv('强化材料', q.matHave ? (q.itemName + ' ×1（现有 ' + q.matOwned + '）') : ('无' + q.itemName + ' → 用 ◉ ' + fmt(q.substitute) + ' 代用'));
      U.space(CV.SP[1]);
      /* F2-5：+20 之后原来还写着「强化（◉10600 + ◆10 · 25%）」、还是一颗能点的样子
         —— 现在满级走 `dis`（变灰 + 不登记热区），并把"封顶了"这句话写在这行小字里。 */
      U.btnRow([{ label: q.maxed ? '强化（已满级）' : ('强化（◉ ' + fmt(q.points) + ' + ◆ ' + q.otherworld + ' · ' + Math.round(q.rate * 100) + '%）'), style: 'ghost', id: 'eq_enh', dis: !!q.maxed }]);
      if (q.maxed) U.hint('已经 +20 封顶，不能再强化了（想再涨就换一件更高品质的）', 2 * CV.SCALE);
    });
    /* V1.1.8 那张独立的「🔨 重铸副词条」卡**已并进属性卡**（V1.1.12 · 父亲大人：
       "重铸的按钮离属性太远了，我每次重铸都得滑回去看哪里变了"）—— 逻辑不变：
       只重摇数值、锁定过的不可重摇、消耗 ＝ 1 块当前档材料 ＋ ◉3,000（临时值）。
       判据④依然成立：没副词条的装备在属性卡里明说"重铸不了"，锁定的按钮禁用并写清"先解锁"。 */
    U.card(function () {
      U.h3('操作');
      U.btnRow([
        { label: eq.lock ? '🔒 已锁定' : '🔓 锁定保护', style: eq.lock ? 'primary' : 'ghost', id: 'eq_lock' },
        { label: '分解（◆ ' + (D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3) + '）', style: 'ghost', id: 'eq_decomp', dis: !!eq.lock },
      ]);
      /* F2-5：锁着的装备那颗「分解」以前是一颗画着能点、点了没反应的假按钮 ——
         现在走 `dis` 变灰，并把"差什么"（先解锁）写在这儿。 */
      if (eq.lock) U.hint('这件已锁定（锁＝别动它）：先点上面的「🔓 锁定保护」解锁，才能分解', 2 * CV.SCALE);
      /* V9.6.7 自审：伙伴身上的装备只能进详情、**没法卸下来**（主角那边才有「卸下」）。
         网页版两边都有，这里补上 —— 只有真穿在谁身上时才出现。 */
      if (wearer) {
        U.space(CV.SP[1]);
        U.btnRow([{ label: '卸下（从 ' + Core.charName(wearer) + ' 身上）', style: 'ghost', id: 'eq_unequip' }]);
      }
    });
    /* ================= B 批（2026-10-01）· 装备背景（**放页尾**） =================
       父亲大人：「重要装备：一句背景。世界套装：一段套装故事。专属装备：必须和角色历史有联系。」
       文案一律从 `sc-story-data.js` 取（**不在这里再抄一份**），本页只决定"怎么摆"：
         · 本命（专属）→ SIG_<charId>　· 命格神装 → GOD_<血统>
         · 六卷锚点世界套装 → SET_<worldId>（一段，可点开读）
         · 其余 30 套世界套装 → 只有一句，直接写在卡里
       查询顺序"越专属越优先"：本命 > 神装 > 套装。
       ⚠️ **必须排在页尾**：插在属性卡前面会把「命格神装」那张卡挤出首屏 ——
          `uiw` 对屏外卡**只量不画**，`equip_render_audit` 会当场判"神装卡没画出来"（已实测）。
          "多读一段"本来也不该顶掉"看属性和重铸"这条主动线。 */
    {
      const St = G.Story, SDd = G.STORYDATA;
      if (St && SDd && SDd.ITEMS) {
        const longKey = (eq.charId && SDd.ITEMS['SIG_' + eq.charId]) ? 'SIG_' + eq.charId
          : (eq.godSet && SDd.ITEMS['GOD_' + eq.godSet]) ? 'GOD_' + eq.godSet
            : (eq.set && SDd.ITEMS['SET_' + eq.set]) ? 'SET_' + eq.set : null;
        const shortLine = (eq.set && SDd.SET_LINE && SDd.SET_LINE[eq.set]) || null;
        if (longKey) {
          U.card(function () {
            U.h3('装备故事', '读完会记进卷宗');
            U.space(CV.SP[1]);
            const ok = St.seenItem(longKey);
            U.btn(U.ix(), U.y, U.iw(), U.BTN_SM * CV.SCALE,
              ok ? '重读（已记入卷宗）' : '读这一段', ok ? 'ghost' : 'primary', 'story_item:' + longKey);
            U.y += U.BTN_SM * CV.SCALE;
          });
        } else if (shortLine) {
          U.card(function () { U.h3('装备背景'); U.note(shortLine); });
        }
      }
    }
  });
  CV.on('eq_enh', function () {
    const r = Core.enhance(eqUid);
    /* 强化成功 / 失败：两种完全不同的音色（"叮" vs "嗡嗡"）—— 不看字也听得出成没成 */
    snd(r.ok ? 'enhanceOk' : 'enhanceFail');
    /* F7 ②：成功后卡片上"强化 +N"当场就变（看得见 → 删）；失败必须说（不够 / 失败率 / 已满）。
       声音不变：成没成照样听得出来。 */
    if (!r.ok) CV.toast(r.msg || '强化失败');
    CV.render();
  });
  CV.on('eq_lock', function () {
    /* F7 ②：锁定状态就在那颗按钮上写着（🔒 已锁定 / 🔓 锁定保护）＋列表里名字前带 🔒 —— 看得见，删 toast。 */
    Core.toggleEquipLock(eqUid);
    CV.render();
  });
  /* ================= V1.1.15（2026-09-27 · 父亲大人："重铸数值/词条都不用有弹窗了，直接替换就行了"）
     V1.1.13 那一版摇完会弹一张「旧 → 新」对比卡（U.confirm）——**撤掉**。
     现在摇完就地把属性卡重画一遍（数值已经是新的，不用点"收下"），
     只在顶部留一行 toast 报"总评变化"——想再摇一次不用先关弹窗。
     判据不变：数字是主角（区间已经在每条词条上写着，见 affixRange）。 */
  function afterReforge(r) {
    if (!r || !r.ok) { snd('error'); CV.toast((r && r.msg) || '重铸不了'); CV.render(); return; }
    snd('reforge');
    const dQ = Math.round((r.meanAfter - r.meanBefore) * 100);
    CV.toast((r.pityHit ? '🔥 炉火保底 · ' : (r.mode === 'kind' ? '🎲 重抽完成 · ' : '🔨 重铸完成 · '))
      + '词条总评 ' + Math.round(r.meanBefore * 100) + '% → ' + Math.round(r.meanAfter * 100) + '%'
      + (dQ ? '（' + (dQ > 0 ? '+' : '') + dQ + '）' : '（没变）')
      + (r.newBest ? ' · 🏆 刷新最好' : ''));
    CV.render();
  }
  CV.on('eq_reforge', function () { afterReforge(Core.reforgeEquip(eqUid, { mode: 'value' })); });
  CV.on('eq_reforge_kind', function () { afterReforge(Core.reforgeEquip(eqUid, { mode: 'kind' })); });
  /* 词条锁开关（档 B）：锁 = 这一条不参与重铸（每锁 1 条每档多花 1 颗石）。
     走 `Core.setAffixLock` 这一个入口 —— 界面不许自己去改 `eq.affixLock`。 */
  CV.on('eq_afflock:*', function (arg) {
    const eq = Core.S.equips[eqUid];
    const i = parseInt(arg, 10);
    const on = !((Core.affixLocksOf(eq) || []).indexOf(i) >= 0);
    const r = Core.setAffixLock(eqUid, i, on);
    if (!r.ok) CV.toast(r.msg || '锁不了');
    CV.render();
  });
  CV.on('eq_decomp', function () {
    const eq = Core.S.equips[eqUid];
    U.confirm('分解装备', '确定分解「' + eq.name + ' +' + eq.enhance + '」？将获得 ◆ ' + (D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3), function () {
      const r = Core.decompose(eqUid);
      /* F7 ②：保留"得了多少 ◆"（一次性奖励、别处看不到），去掉"分解成功"四个字。 */
      CV.toast(r.ok ? ('◆ +' + fmt(r.gain)) : (r.msg || '分解失败'));
      CV.pop();
    });
  });
  CV.on('eq_unequip', function () {
    const S = Core.S;
    const who = Object.keys(S.equipped).find(function (cid) { return Object.values(S.equipped[cid] || {}).indexOf(eqUid) >= 0; });
    if (!who) { CV.toast('这件装备没穿在身上'); return; }
    Core.unequipItem(who, (S.equips[eqUid] || {}).slot);
    /* F7 ②：卸下后装备栏当场空出来（看得见 → 删 toast）。 */
    CV.render();
  });

  /* ---------- 事件 ---------- */
  TABS.forEach(function (t) {
    CV.on('bagview:' + t[0], function () { view = t[0]; CV.render(); });
  });
  /* V1.1.7（丙组 1 · 把"这只死键的成因"结构上消掉）：
     格子的热区 id 以前是**渲染处现场拼** `'bag_expand:' + view`、**注册处手写** `bag_expand:eq` ——
     两套拼法不一样，装备那一格登记的是 `bag_expand:equip`、处理器只有 `:eq`
     → `hitHasHandler()` 判它"没有处理器"、被当**引导锚点**放行 → 「＋」画在屏上、点了没反应
     （康康 09-26 抓到的真死键：连点两次、截图逐字节相同）。
     现在**注册也从同一张表读**：`POOLS[k].expandId` —— 渲染与注册读的是同一个字段，
     两处不可能再分叉；以后加池子只在这张表里补一行。
     `bag_expand:eq` 作为**老拼法的别名**保留一条出口（老引导/老调用点里可能还写着它）。 */
  Object.keys(POOLS).forEach(function (k) {
    const id = POOLS[k].expandId;
    if (!id) return;
    CV.on(id, function () { expand(k); });
  });
  CV.on('bag_expand:eq', function () { expand('equip'); });
  function expand(kind) {
    /* 归一：POOLS 的键是 item / mat / equip，而 `Core.buyBagCap()` 只认 item / mat / eq ——
       两边各归一一次，避免又把两种拼法混在一起（这就是上面那只死键的成因）。 */
    const k = kind === 'eq' ? 'equip' : kind;
    const key = POOLS[k].expKey;
    const cost = D.bagExpandCost(Core.S.bag[key] || 0);
    const label = { equip: '装备', mat: '背包', item: '背包' }[k];
    U.confirm('扩容', '是否支付 ◉ ' + fmt(cost) + '，把' + label + '格再加 ' + D.BAG_EXPAND_SIZE + ' 格？', function () {
      const r = Core.buyBagCap(k === 'equip' ? 'eq' : k);
      /* F7 ②：扩容成功＝格子数当场变大（看得见 → 删）；失败要把"点数不足（需 ◉ N）"说出来。 */
      if (!r.ok) CV.toast(r.msg || '扩不了');
      CV.render();
    });
  }
  /* V1.1.15：**装备**待领箱的"全部领回"（装备页那张卡） */
  CV.on('stash_eq_claim', function () {
    const r = Core.claimStashEq();
    const ue = Core.bagUsage();
    if (r.moved) {
      CV.toast('领回 ' + r.moved + ' 件装备' + (r.left ? ('，还剩 ' + r.left + ' 件 · 装备格 ' + ue.eqUsed + '/' + ue.eqCap) : ''), 3200);
    } else {
      CV.toast('装备格还是满的（' + ue.eqUsed + '/' + ue.eqCap + '）—— 点上面「扩容」', 3600);
    }
    CV.render();
  });
  CV.on('stash_claim', function () {
    const r = Core.claimStash();
    /* V1.1.15：把"领回多少 / 还差几格"说清 —— 以前只报一句"背包还是满的"，
       玩家（用 GM 把背包塞满的档尤其明显）会以为是待领箱坏了。 */
    if (r.moved) {
      const u = Core.bagUsage();
      CV.toast('领回 ' + r.moved + ' 件' + (r.left ? ('，还剩 ' + r.left + ' 件 · 背包 ' + u.used + '/' + u.cap + '，还差 ' + (r.need || 0) + ' 格') : ''), 3200);
    } else {
      const u = Core.bagUsage();
      CV.toast('一件都装不下：背包 ' + u.used + '/' + u.cap + '，还差 ' + (r.need || 0) + ' 格 —— 点上面「扩容」', 3600);
    }
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
      /* 开箱：一声"咔"（开 10 个 / 全部开也只响一声 —— 这是"打开了"的反馈，不是每件一个音） */
      snd(r && r.ok === false ? 'error' : 'open');
      /* F7 ②：开箱"开出什么"是**一次性奖励**（别处看不到）→ 留；成功但没话可说＝纯确认 → 删。 */
      if (r && r.msg) CV.toast(r.msg);
      else if (!r || !r.ok) CV.toast('这次什么都没开出来');
      if ((Core.S.items[curItem] || 0) <= 0) CV.pop(); else CV.render();
    });
    CV.on('exp:' + v, function () {
      const cnt = v === 0 ? (Core.S.items[curItem] || 0) : v;
      const r = Core.useExpItem(curItem, cnt);
      /* F7 ②：成功那句是"+12,000 伙伴经验（×10）"（一次性奖励的**数额**，别处看不到）→ 留；
         纯确认（成功又没话说）删掉。 */
      if (r && r.msg) CV.toast(r.msg);
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
  /* ================= 批量选择：快选（六档）＋ 全选可分解 =================
     两条规则**一处收口**（`toggleMany`）：
       · 候选池 = `visibleEquips()` ＝ **你现在看得见的那批格子**（同一份判据，见上面）；
       · 已锁定的一律不进候选（`Core.decomposeMany` 本来就跳过它们，选择这一步也要一致）；
       · **再点一次同一条 = 取消这一条选中的那些**；手动点选的其它装备**不受影响**。 */
  function toggleMany(pick) {
    const uids = visibleEquips()
      .filter(function (e) { return !e.lock && pick(e); })
      .map(function (e) { return e.uid; });
    if (!uids.length) { CV.toast('这里现在没有可以分解的装备'); CV.render(); return; }
    const allIn = uids.every(function (u) { return batchSel.has(u); });
    uids.forEach(function (u) { if (allIn) batchSel.delete(u); else batchSel.add(u); });
    CV.render();
  }
  CV.on('bselr:*', function (rarity) { toggleMany(function (e) { return e.rarity === rarity; }); });
  CV.on('ball', function () { toggleMany(function () { return true; }); });     // 全选可分解（再点一次＝全取消）
  CV.on('bgo', function () {
    if (!batchSel.size) { CV.toast('先点选要分解的装备'); CV.render(); return; }
    /* 真正的候选 = 选中里**还存在且没锁**的那些（`batchGain` 用的是同一条判据）——
       确认页报的数与真发奖必须对得上，不许出现"说 18 件、实际 15 件"。 */
    const real = Array.from(batchSel).filter(function (u) { const e = Core.S.equips[u]; return e && !e.lock; });
    if (!real.length) { CV.toast('选中的这些现在都不能分解（已锁定的不参与）'); CV.render(); return; }
    const n = real.length, gain = batchGain();
    U.confirm('批量分解', '确定分解 ' + n + ' 件装备？\n预计获得 ◆ ' + fmt(gain) + '（异界结晶）', function () {
      const r = Core.decomposeMany(Array.from(batchSel));
      /* 成功提示一律用**真实返回值**：分解了几件、到手多少 ◆；
         万一中途有装备状态变了（被穿上 / 被锁），如实把那几件报出来，不假装全成功。 */
      const miss = n - (r.count || 0);
      CV.toast(r.count
        ? ('分解 ' + r.count + ' 件 · ◆ +' + fmt(r.gain) + (miss > 0 ? '（' + miss + ' 件状态变了，没分解）' : ''))
        : '没有可分解的装备');
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
    /* V9.6.101（换档审计抓到的）：curItem 是模块级变量，换档之后可能还停在上一次的血清上，
       这时 `sd.max` 是 undefined —— 页面会画出「已服 0/undefined」这种烂字。
       参数缺失就优雅退场，别照着上一局画。 */
    if (!it.serum) {
      U.begin();
      U.pageHead('使用精华', { backId: 'serum_back' });   // 吸顶（父亲大人 09-27 深夜）
      U.hint('这支精华的数据不在了（可能刚换过存档）—— 回背包重新点一次就好。', 0);
      return;
    }
    const serumMax = sd.max || 0;
    const sid = String(curItem).replace(/^serum_/, '');
    const have = S.items[curItem] || 0;
    const cnt = Math.max(1, Math.min(serumCount || 1, have));
    U.begin();
    /* 命格专属精华：这一屏走本命格的灯色 + 标题右端挂印记（与网页版同源）。
       V1.1.17（父亲大人 09-27 深夜）：标题与返回**吸顶** —— 印记挂在标题右端（屏幕坐标）。 */
    const serumLamp = sd.bloodline ? CV.blLamp(sd.bloodline, Core.realmState().realm) : null;
    U.pageHead('使用精华', { backId: 'serum_back', color: serumLamp || null,
      right: serumLamp ? function (x, y, h) {
        const prevMode = CV.hitMode;            // 框架整段是 screen 模式，这里只许还回去
        CV.hitMode = 'screen';
        U.draw(function () { CV.blGlyph(sd.bloodline, U.pad() + U.cw() - 8 * CV.SCALE, y + h / 2, 14 * CV.SCALE, serumLamp); });
        CV.hitMode = prevMode;
      } : null });
    U.note('选择要吃「' + (it.name || '') + ' ×' + cnt + '」的伙伴 —— 永久生效', 0);
    U.space(CV.SP[2]);
    /* 候选：主角 + 已拥有的伙伴，血统对得上才列出来 */
    /* V1.0.4 · V：这一行原来直接读 `S.player.name`（第二份来源）—— 统一走 `Core.charName('@player')`，
       以后真做榜单时，"显示出来的名字"只有一个口子，过没过审也在那一个口子上判。 */
    const rows = [{ id: '@player', name: Core.charName('@player'), sub: '主角 · ' + (S.player.bloodline || '未觉醒命格'), bl: S.player.bloodline || null }];
    Object.keys(S.chars).forEach(function (id) {
      const ch = D.charById[id];
      if (!ch) return;
      const c = S.chars[id];
      const bl = (c.bloodlineLv || 0) > 0 ? ch.bloodline : null;
      rows.push({ id: id, name: ch.name, sub: 'Lv.' + c.lv + ' · ' + (bl || '未觉醒命格'), bl: bl });
    });
    const usable = rows.filter(function (r) { return !sd.bloodline || r.bl === sd.bloodline; });
    if (!usable.length) {
      U.card(function () {
        U.hint('没有可用对象：这支精华只有「' + sd.bloodline + '」命格能用（先去伙伴页觉醒命格）', 4 * CV.SCALE);
      });
    } else {
      U.card(function () {
        usable.forEach(function (r) {
          const taken = Core.serumTaken(r.id, sid);
          const full = taken >= serumMax;
          listBtn({
            t1: r.name, t2: r.sub + ' · 已服 ' + taken + '/' + serumMax + (full ? ' · 已满' : ''),
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
      if (n < 1) { snd('error'); CV.toast('道具不足'); return; }
      serumCount = n; CV.push('serum_pick');
    });
  });
  CV.on('serumtarget:*', function (id) {
    /* F2-7（抢修单 0928R3 · 不可逆补二次确认）：精华是**永久喂掉**的（一人一种有上限，
       喂错了拿不回来）—— 以前点一下直接生效。数量与上限都用当前页面的那几个变量现算。 */
    const it = D.ITEMS[curItem] || {};
    const sid = String(curItem).replace(/^serum_/, '');
    const have = Core.S.items[curItem] || 0;
    const n = Math.max(1, Math.min(serumCount || 1, have));
    const taken = ((Core.S.serums || {})[id] || {})[sid] || 0;
    const max = (((D.serumById || {})[sid] || it.serum || {}).max) || 0;
    U.confirm('喂下精华', '把「' + (it.name || curItem) + '」×' + n + ' 喂给 ' + Core.charName(id)
      + '：永久生效、拿不回来（他这种精华 ' + taken + ' → ' + Math.min(max, taken + n) + ' / ' + max + '）。确定吗？',
    function () {
      const r = Core.useSerum(id, sid, serumCount);
      /* F7 ②：成功那句带"永久 +X%"（喂下去的**效果**，别处看不到）→ 留；失败原样留。 */
      CV.toast(r.msg || '不能喂');
      CV.render();
    }, { okLabel: '喂下' });
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
    if (e.godSet) return ((D.GOD_SETS || {})[e.godSet] || {}).name || '命格神装';
    if (e.bloodSet) { const bk = D.bloodlineSetKey ? D.bloodlineSetKey(e.bloodWorld, e.bloodSet) : null; return (bk && (D.BLOODLINE_SETS || {})[bk] ? D.BLOODLINE_SETS[bk].name : (e.bloodSet + '套装')); }
    if (e.set) return ((D.SETS || {})[e.set] || {}).name || '世界套装';
    return '普通';
  }
  CV.register('equip_pick', function () {
    const S = Core.S, cid = pickChar, slot = pickSlot;
    const allowed = (cid === '@player' ? D.PLAYER_SLOTS : D.RECRUIT_SLOTS) || [];
    const cur = (S.equipped[cid] || {})[slot];
    const curEq = cur && S.equips[cur];
    U.begin();
    /* F2-7（抢修单 0928R3）：这一页没有"参数不在了就优雅退场"的兜底 ——
       冷渲染 / 换档之后 `Core.charName(null)` 会把标题画成**「选择（null）」**。
       同类几页（血清 / 装备详情 / 精华…）都有这道兜底，照它们补一份。
       ⚠️ `Core.charName(null)` 本身回吐 null 是逻辑层的事（js/core.js 不在本单可改范围，
          归 F1 那单），这里先把**页面**挡住。 */
    if (!cid || !slot) {
      U.pageHead('选择装备', { backId: 'equip_pick_back' });
      U.hint('这一页要知道「给谁换哪个部位」—— 信息不在了（可能刚换过存档），回上一页重新点一次就好。', 0);
      return;
    }
    /* 吸顶（父亲大人 09-27 深夜）：标题 + 返回固定，正文从下面滚过去 */
    U.pageHead('选择' + (D.EQUIP_SLOTS[slot] || '') + '（' + Core.charName(cid) + '）', { backId: 'equip_pick_back' });
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
          /* V1.1.6（A6 · 《总落地清单》A6 行）：装备候选**带稀有度** ——
             ① 名字按**品质色**画（`rarityColor`，与背包格子 / 详情页同一套色阶）；
             ② 标题右侧挂一枚**稀有度文字**小标（普通 / 精良 / 稀有 / 史诗 / 传说 / 神话，
                取 `D.EQUIP_RARITY_NAME` 一处定义）。
             起因：这一屏原来只有"名字 + 强化 + 套装类别"，同名的两件（不同品质）看不出谁好，
             玩家只能点进去看详情再退出来比 —— 网页版那行是 `class="t1 rtext-<rarity>"`，
             小游戏这边**连颜色都没有**（`listBtn` 没透传 t1Color）。 */
          listBtn({
            t1: e.name + ' +' + e.enhance + '　' + eqTag(e),
            t2: eqBrief(e) + (isCur ? ' · 当前穿戴中' : (who ? (' · ' + Core.charName(who) + '装备中') : '')),
            t1Color: rarColor(e.rarity),
            tag: (D.EQUIP_RARITY_NAME || {})[e.rarity] || e.rarity,
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
    /* F7 ②：单纯"已装备"删（穿上后这位的装备格当场变）；但**从别人身上摘下来**这件事
       在伙伴详情页上看不到 —— 那句留。失败照旧留。 */
    if (!ok) CV.toast('该伙伴无法穿戴此装备');
    else if (from && from !== pickChar) CV.toast('已装备（从 ' + Core.charName(from) + ' 身上取下）');
    CV.render();
  });
  CV.on('equip_pick_back', function () { CV.pop(); });
})();
