/* 成长 + 市集 —— 照网页版 js/ui.js 的 growScreen / shopModal 复刻
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
  /* F2-6：深井那条路会**先**调 `G.setShopTab('corridor')` 再 `CV.push('shop')` ——
     这里记下"下一次进店该用哪家店"，由市集页**第一帧**消费一次（消费完就清空）。
     其余任何路径进店都没有这个记号 → 一律回到默认的「灯阁市集」。 */
  let pendingShopTab = null;
  /* F2-6：上一次画市集用的是**哪一层页面对象**（`CV.top()` 的引用）——
     换页（reset / push / switchTab）每次都新建一层，同一层原地重画还是同一个引用，
     于是"进店第一帧复位、页内重画保状态"两件事同时成立（见市集页顶部那段注释）。 */
  let shopLevel = null;
  /* V1.1.15（2026-09-27 · 父亲大人口径）：购买数量弹窗的状态 —— 买哪一行、当前选几个。
     `buyDialog = null` 表示没弹窗；非 null 时市集页会**只画这张小弹窗**（暗底＋居中卡片，
     天然模态：底下的商品行连热区都不登记，点不穿）。 */
  let buyQty = 1, buyIdx = -1, buyDialog = null;

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
        desc: '花 ◉ 点数永久提升：挂机产出 / 挂机经验 / 离线效率 / 强化与命格升级折扣' },
      { act: 'open_authority', unlock: 'buildings', ico: '🔑', name: '灯阁权限', cur: 'Lv.' + au.lv + ' / ' + au.max,
        desc: '花 ✦ 圣洁晶石 + ◆ 异界结晶，永久提升挂机产出、离线效率、每日扫荡次数' },
      { act: 'open_sect', unlock: null, ico: '🏯', name: '灯阁评级', cur: 'Lv.' + Core.sectInfo().lv + ' / ' + D.SECT_MAX,
        desc: '打关卡自动涨的全局评级，每级全队全属性 +0.5%，不用手动点' },
      { act: 'open_keji', unlock: null, ico: '📜', name: '秘术阁', cur: '已修 ' + kejiLv + ' / ' + D.KEJI.reduce(function (a, k) { return a + k.max; }, 0) + ' 级',
        desc: D.KEJI.length + ' 条百分比长线（战斗 + 挂机经济），花 ◆ 异界结晶，点一下立刻生效' },
      { act: 'open_fabao', unlock: null, ico: '🔮', name: '法宝', cur: '已得 ' + Core.fabaoState().own.length + ' / ' + D.FABAO.length + ' 件',
        desc: '装备给数值、法宝给效果（汲取 / 开场能量 / 减伤），主角同时带 1 件，花 ◉ 点数买' },
      { act: 'open_garden', unlock: null, ico: '🌱', name: '药园', cur: Core.gardenState().filter((p) => p.plot).length + ' / ' + D.GARDEN_PLOTS + ' 块在用',
        desc: '花 ◉ 点数种灵田，到点收强化材料，另有几率出稀有物；离线也计时' },
      { act: 'open_arena', unlock: null, ico: '🥋', name: '斗法台',
        cur: '第 ' + Core.arenaState().floor + ' 台 · 剩 ' + Core.arenaState().left + ' 次',
        desc: '每天 ' + D.ARENA_DAILY + ' 次镜像擂台，守擂者按你的战力换算，赢一场升一台拿 ◆ 异界结晶' },
      { act: 'open_mount', unlock: null, ico: '🐎', name: '坐骑', cur: '已驯服 ' + Core.mountState().own.length + ' / ' + D.MOUNTS.length + ' 匹',
        desc: '花 ◉ 点数 + 材料驯服，全队（含伙伴）永久加数值；同时只骑 1 匹，随时换' },
      { act: 'open_sign', unlock: null, ico: '🔆', name: '点灯',
        cur: Core.signState().canDraw ? '今日还没点灯' : ('今日【' + Core.signState().tier + '】'),
        desc: '每天免费点一次灯，灯焰给当天的挂机加成 + 一笔硬通货，隔天自动失效' },
      { act: 'open_realm', unlock: null, ico: '🌌', name: '境界渡劫',
        cur: r.hasBloodline ? (r.curName + '（第 ' + r.realm + '/' + D.REALM_STAGE_COUNT + ' 阶）') : '未定命格',
        desc: '36 小阶，每阶全属性永久 +1.4%；失败只扣材料，等级不掉' },
      { act: 'open_genelock', unlock: 'geneLock', ico: '🧬', name: '铭刻',
        cur: S.player.geneLock > 0 ? (S.player.geneLock + ' 阶 · ' + gl.name) : '未解锁',
        desc: '20 阶全队加成，靠通关进度 + 玩家等级 + 异界结晶解锁' },
      { act: 'open_beast', unlock: 'beast', ico: '🐾', name: '伴生体',
        cur: beasts ? ('已孵化 ' + beasts + ' 只') : '还没孵化',
        desc: '第二条养成线：随行 1 只给全队加成，带对五行进本全队伤害 +15%' },
      { act: 'open_reincarn', unlock: 'reincarn', ico: '♾', name: '转生天赋',
        cur: S.player.reincarnations > 0 ? (S.player.reincarnations + ' 世') : '未转生',
        /* 2026-09-27：转生只收等级，残域与深井都留着（见 core.js reincarnate 的说明） */
        desc: '满级后把等级收回 Lv.0 换永久天赋点（残域与深井进度保留），四支天赋各 10 级；越早开始攒越划算' },
    ];
    U.begin();
    /* 标题 + 返回吸顶（父亲大人 09-27 深夜 · 派单 Z-B） */
    U.pageHead('成长', { backId: 'grow_back' });
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

  /* ---------- 市集（原「兑换大厅」· V1.1.9 正名：数据里一直叫「灯阁市集」，
     父亲大人找不到「兑换大厅」这个名字 —— 入口名、屏标题、来源文案统一成「市集」） ---------- */
  CV.register('shop', function () {
    /* ================= F2-6（抢修单 0928R3）· 进店第一帧把"模式类"状态复位 =================
       两个真状态残留（都探针复现过）：
         · `buyDialog`：点「购买」弹出选数量 → 点**吸顶返回**退页 → 再进市集，
           弹窗自己又跳出来（带着上次那一行、上次选的数量）；
         · `shopTab`：逛过深井商店之后，从**首页**点「市集」进去的是**深井商店**
           （货架与结算货币全换了，看着像"市集被换了"）。
       ⚠️ 判据只能是"这一层第一次被画到"，不能用 `onEnter`（cv.js 不在本单可改范围）。 */
    const lvl = CV.top();
    if (shopLevel !== lvl) {
      shopLevel = lvl;
      buyDialog = null; buyIdx = -1; buyQty = 1;
      shopTab = pendingShopTab || 'god';
      pendingShopTab = null;
    }
    const S = Core.S;
    const shop = D.SHOPS[shopTab];
    U.begin();
    U.pageHead('市集', { backId: 'shop_back' });     // 吸顶（父亲大人 09-27 深夜）
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
      /* 选中态底：原来是写死的深红 #3a1620，改成"危险红 16% 透明度"——
         与背包页同一套选中态写法（V1.1.1 存量收敛）。 */
      CV.round(x, U.y, w, pillH, pillH / 2, on ? CV.a(CV.C.danger, .16) : CV.a(CV.C.panel, .50), on ? CV.C.accent : CV.C.line);
      CV.text(label, x + w / 2, U.y + pillH / 2, { size: CV.FS.md, align: 'center', color: on ? CV.C.text : CV.C.dim });
      CV.hit('shoptab:' + k, x, U.y, w, pillH);
      x += w + gap;
    });
    U.y += pillH + CV.SP[1];
    /* ================= V1.1.15（2026-09-27 · 父亲大人："购物加多个购买数量"）=================
       这一行**先选数量**，再点下面各行的「购买」—— 一次买 N 个。
       为什么不做成"每行弹一个数量框"：四家店一屏十几行，每买一件都弹一次框会更烦；
       放成"顶部选一次、各行通用"最省手（也和扫荡页那排 ×1/×5/×10 的用法一致）。
       选中的数量会顺着 `Core.buyShopItem(shop, i, buyQty)` 下去，库存 / 钱 / 背包三道上限都在 core 里卡。 */
    /* V1.1.15（2026-09-27 · 父亲大人更正："我意思是购买的时候，选择物品购买后，再出来弹窗"）：
       原来那排固定档位（×1/×5/×10/×100/买满）**撤掉** —— 数量改成**点某一行购买后弹窗里选**：
       `−` / 数字 / `+` 三个位置，数字**点一下能手动输入**（只收数字），
       输入超过"你买得起的上限"就**自动压到上限**（例：输 99 但只买得起 50 → 变 50）。 */
    U.hint('本店用 ' + curIcon(shop.currency) + curName(shop.currency) + ' 结算 · 点下面的「购买」再选数量', 2 * CV.SCALE);
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
          /* V1.1.9（续13 · 乙组）：市集货架的名字也按**稀有度色**画（`U.listRow` 已支持 `t1Color`，见 uiw.js）——
             "想买的东西贵不贵"在货架上一眼看得出来，不用一件件点进详情。
             ⚠️ 货架行本身**不带 rarity**（`SHOPS[].items` 只有 `{item, name, price, stock}`）→
                要按 `it.item` 回查 `D.ITEMS`，查不到就退回默认色（深井商店那几行没走这个入口也一样安全）。 */
          t1Color: ((D.ITEMS[it.item] || {}).rarity ? ((D.RARITY_COLOR || {})[(D.ITEMS[it.item] || {}).rarity] || CV.C.text) : CV.C.text),
          t2: curIcon(shop.currency) + ' ' + fmt(it.price)
            + (it.stock > 0 ? (' · 每日限' + it.stock + '（已购' + bought + '）') : '')
            + (req.ok ? '' : (' · 🔒 ' + req.req + '后上架')),
          rightW: 90 * CV.SCALE,
        });
        const bw = 78 * CV.SCALE;
        const can = req.ok && !soldOut;
        /* F2-5（抢修单 0928R3）：售罄 / 未解锁时这颗原来写 `id: can ? 'buy:'+i : ''` 又没给 `dis`
           —— 画出来是颗能点的按钮、点下去什么都不发生。现在 `dis` 变灰 + 不登记热区；
           "差什么"（🔒 还差哪个条件 / 今日已购 N）本来就在同一行的 t2 里，一个字没动。 */
        U.btn(U.ix() + U.iw() - bw, top + (U.y - top) / 2 - U.BTN_SM * CV.SCALE / 2, bw, U.BTN_SM * CV.SCALE,
          req.ok ? (soldOut ? '已售罄' : '购买') : '未解锁', 'ghost', 'buy:' + i, !can);
      });
    });
    /* V1.1.15（2026-09-27 · 父亲大人："背景也不用遮罩，就正常的弹窗"）：
       内容**照常画**（弹窗浮在内容之上、不再整屏压暗）；画完这一页后
       **把本页登记的热区清掉**再画弹窗 —— 底下的商品行点不穿（模态成立），
       而底栏/顶栏是 `CV.render` 在内容层之外补登记的，照旧可用（想切页随时能切）。 */
    if (buyDialog) { CV.hits = []; drawBuyDialog(); }
  });
  CV.on('shop_back', function () { CV.pop(); });
  /* 供别的页面打开指定店铺（深井商店）：记成"下一次进店要用的店"（见 pendingShopTab） */
  G.setShopTab = function (k) { if (D.SHOPS[k]) { shopTab = k; pendingShopTab = k; } };
  Object.keys(D.SHOPS || {}).forEach(function (k) {
    CV.on('shoptab:' + k, function () { shopTab = k; CV.render(); });
  });
  /* V1.1.5（A12 补漏 · `tap_audit` 抓出来的真 bug）：这一排处理器原来**写死下标 [0…11]**。
     A12 往「灯阁市集」加了 3 件货（灯油 / 灵植种 / 材料包·下品，排在下标 9/10/11）之后，
     原来那三件（异界结晶×10 / 随机R装备 / 随机SR装备）就被挤到 12/13/14 —— **没有处理器**，
     界面上"看着能点、点了没反应"（tap_audit 的 3 个死键正是它们）。
     改成按**最长的那个店铺**算：以后加货、加店都不用再回来改这一行
     （同一条毛病在这个项目上犯过：凡"按数量写死的下标"都要改成按数据算）。 */
  const SHOP_ROWS = Object.keys(D.SHOPS || {}).reduce(function (a, k) {
    return Math.max(a, ((D.SHOPS[k] || {}).items || []).length);
  }, 0);
  for (let i = 0; i < SHOP_ROWS; i++) (function (i) {
    CV.on('buy:' + i, function () {
      /* V1.1.15：点「购买」→ 在当前页上**弹出小弹窗**选数量（不再直接买 1 个、也不进二级页） */
      const max = Core.shopMaxQty(shopTab, i);
      if (max <= 0) { CV.toast('买不了：钱不够 / 今日售罄 / 背包放不下'); CV.render(); return; }
      buyIdx = i; buyQty = 1; buyDialog = true;
      CV.render();
    });
  })(i);

  /* ================= 购买数量弹窗（V1.1.15 · 父亲大人口径）=================
     三个位置：`−` / 数字 / `+`。
       · `−` `+` 各加减 1（到 1 / 上限就停）；
       · **数字点一下 = 手动输入**（只收数字，走 `wx.showKeyboard({type:'number'})`）；
       · 输入超过上限 → **自动压到上限**（他举的例子：输 99、只买得起 50 → 变 50）；
       · 上限 = `Core.shopMaxQty(...)`（钱 / 今日库存 / 背包空间 / 单次 100，取最小）。
     ⚠️ 数字输入只收 0-9（会把其它字符统统剔掉）—— 这条是防"手滑输入奇怪字符"，
        与起名页那次 UGC 事故无关（那里是自由文本，这里是纯数字）。 */
  /* ================= 购买小弹窗（V1.1.15 · 父亲大人："购买一个小弹窗就行了，不用二级界面"）=================
     ⚠️ 三个毛病一个根因（2026-09-27 他报"不在画面中心 / 背景也不用遮罩 / 卡死了"）：
        我第一版**用屏幕坐标画、又用 `hitMode='screen'` 登记热区**，可这层画布早被内容层
        `translate(0, TOP+8-scroll)` 偏过了 —— 于是
          · 卡片位置整块偏掉（不在画面中心）；
          · 更要命的是**看到的位置 ≠ 能点的位置**，点上去没反应，看着就是"卡死"。
        现在统一成**内容坐标**（`CV.hit` 用默认的 content 模式会自己换算屏幕坐标），
        绘制与热区必然对齐；并按要求**去掉整屏遮罩**，只有一张居中卡片。
     · `−` `+` 到 1 或到上限即停（到界那颗不登记热区＝点不动）；
     · 数字点一下＝手动输入（系统数字键盘，只收数字），超上限自动压到上限。 */
  function drawBuyDialog() {
    const shop = D.SHOPS[shopTab], it = shop && shop.items[buyIdx];
    const max = Core.shopMaxQty(shopTab, buyIdx);
    /* V1.1.15（2026-09-27 · 父亲大人："弹窗不精致，太粗犷了"）：
       上一版是我**手搓坐标**画的（纯色面板 ＋ 平描边 ＋ 纯色按钮）—— 必然"平、粗"。
       现在**全部走项目自己的组件语言**（这也是两端一致的前提）：
         · 卡片 → `CV.card`：它自带**顶部 1px 白色高光**（网页版 `inset 0 1px 0 #ffffff08`），
           卡片"有没有厚度"就看这一下，手搓时漏掉就显平；
         · `−` `+` → `U.btn(..., 'ghost')`：描边按钮，**禁用态自带 0.34 透明**且不登记热区（点不动）；
         · 中间数字 → `CV.card({fill: panel2})` 底 ＋ 金色粗体（比两侧"高一档"，一眼看出是主输入位）；
         · 底部两颗 → `U.btn` 的 `ghost` / `primary`（primary 是**金色渐变 ＋ 白字**，
           与我手搓的"纯 accent 底 ＋ 深字"完全不是一套）；
         · 内距一律走 `CV.SP[]` 体系，标题照 `U.h3` 的"金色竖条 ＋ 粗体"。 */
    const oy = (CV.TOP + 8) - (CV.scroll || 0);        // 屏幕 → 内容坐标的偏移（内容层 translate 过）
    const bw = Math.min(CV.W - 40, 320), bx = (CV.W - bw) / 2;
    const pad = CV.SP[2], gap = CV.SP[1];
    const titleH = CV.FS.f1 * 1.35;
    const cellH = 46 * CV.SCALE, btnH = U.BTN_H * CV.SCALE;
    /* V1.1.15（2026-09-27 · 父亲大人："弹窗的小字注释不要，然后按钮写购买就行了"）：
       删掉「商品名 · 最多 N 个」那行小字（数量就显示在上面，`＋` 到上限即停，
       不再多一行解释）；按钮文案也从「买 N 个」收成「购买」。高度跟着减一行。 */
    const bh = pad + titleH + gap + cellH + gap + btnH + pad;
    const by = (CV.H - bh) / 2 - oy;                   // 真屏幕中心 → 内容坐标
    CV.card(bx, by, bw, bh, { radius: CV.RADIUS_LG || CV.RADIUS });   // ← 自带顶部高光
    const ix = bx + pad, iw = bw - pad * 2;
    /* 标题：金竖条 ＋ 粗体（照 U.h3） */
    const ty0 = by + pad;
    CV.round(ix, ty0 + 2 * CV.SCALE, 3, titleH - 4 * CV.SCALE, 1.5, CV.C.gold, null);
    CV.text('购买数量', ix + 10 * CV.SCALE, ty0 + titleH / 2, { size: CV.FS.f1, bold: true });
    /* − / 数字 / + */
    const ty2 = ty0 + titleH + gap, cw = (iw - gap * 2) / 3;
    U.btn(ix, ty2, cw, cellH, '−', 'ghost', 'buyminus', buyQty <= 1);
    CV.card(ix + cw + gap, ty2, cw, cellH, { fill: CV.a(CV.C.panel2, .50) });
    CV.text(String(buyQty), ix + cw + gap + cw / 2, ty2 + cellH / 2,
      { size: CV.FS.f2, bold: true, align: 'center', color: CV.C.gold });
    CV.hit('buynum', ix + cw + gap, ty2, cw, cellH);              // 点数字 → 手动输入
    U.btn(ix + (cw + gap) * 2, ty2, cw, cellH, '＋', 'ghost', 'buyplus', buyQty >= max);
    /* 取消 / 买 N 个 */
    const ty3 = ty2 + cellH + gap, half = (iw - gap) / 2;
    U.btn(ix, ty3, half, btnH, '取消', 'ghost', 'buycancel');
    U.btn(ix + half + gap, ty3, half, btnH, '购买', 'primary', 'buyok');
  }
  CV.on('buyminus', function () { buyQty = Math.max(1, buyQty - 1); CV.render(); });
  CV.on('buyplus', function () { buyQty = Math.min(Core.shopMaxQty(shopTab, buyIdx), buyQty + 1); CV.render(); });
  CV.on('buycancel', function () { buyDialog = null; CV.render(); });
  CV.on('buynum', function () {
    const W = G.wx;
    /* 2026-09-28：与起名那句同族 —— **别断言"设备不支持"**（手机电脑都有键盘），
       说的是"这个环境暂时调不起手动输入"，并给一条立刻能走的路。 */
    if (!W || !W.showKeyboard) { CV.toast('这个版本暂时调不起手动输入，用 − / + 调吧'); return; }
    try {
      if (W.offKeyboardConfirm) W.offKeyboardConfirm();
      if (W.offKeyboardComplete) W.offKeyboardComplete();
      /* V1.1.21（2026-09-28 · 父亲大人：「点空白区域要能退出输入框」）：
         输入态立 `CV.kbActive`（`cv.js` 的手势开头靠它实现"点空白＝收起键盘"），
         并且**同时听 confirm 与 complete** —— 玩家用键盘上的"完成"、或微信自己收掉键盘，
         两条路都要把数字落下来（原来只听了 confirm）。 */
      const apply = function (res) {
        CV.kbActive = false;
        const raw = String((res && (res.value !== undefined ? res.value : res.data)) || '');
        let v = parseInt(raw.replace(/[^0-9]/g, ''), 10);
        if (!isFinite(v) || v < 1) v = 1;
        const max = Core.shopMaxQty(shopTab, buyIdx);
        buyQty = Math.min(v, max);                      // ← 超上限自动压到上限（父亲大人的例子：99 → 50）
        if (v > max) CV.toast('超过能买的上限，已改成 ' + max + ' 个');
        CV.render();
      };
      W.onKeyboardConfirm(function (res) {
        if (!buyDialog) return;                        // 弹窗已经关掉：这一下不算（与删档那段同一条规矩）
        apply(res);
      });
      if (W.onKeyboardComplete) W.onKeyboardComplete(function (res) {
        if (!buyDialog) return;
        apply(res);
      });
      CV.kbActive = true;
      W.showKeyboard({ type: 'number', defaultValue: String(buyQty), maxLength: 4, success: function () {}, fail: function () { CV.toast('这个版本暂时调不起手动输入，用 − / + 调吧'); } });
    } catch (e) { CV.toast('这个版本暂时调不起手动输入，用 − / + 调吧'); }
  });
  CV.on('buyok', function () {
    const r = Core.buyShopItem(shopTab, buyIdx, buyQty);
    /* F7 ②：买成功后货架那行的"已有 ×N"和顶栏货币当场变（看得见 → 删成功语）；
       失败留（钱不够 / 今日售罄 / 背包放不下）。 */
    if (!r.ok) CV.toast(r.msg || '买不了', 2600);
    buyDialog = null;
    CV.render();
  });
})();
