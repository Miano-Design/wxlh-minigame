/* 小游戏 canvas 界面框架（重做版）
   ------------------------------------------------------------------------------
   规矩（父亲大人 2026-09-16 定）：
     · **网页版是唯一标准**：这里所有数值都从网页版 css/style.css 的 :root 与规则里抄，
       不允许自己设计颜色/字号/间距；
     · 布局用"游标 + 相对计算"（一律基于 CV.W），**不许写死 375 这类设计宽**；
     · 每个界面按网页版同一页的结构顺序画，一页一页对照。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;

  const CV = {
    /* 画布尺寸（逻辑像素）——运行时由 setup() 按真实窗口算出来 */
    W: 375, H: 812, TOP: 0, NAV_H: 62,
    ctx: null, DPR: 1, safeTop: 0, safeBottom: 0,
    stack: [], hits: [], toasts: [],
    pageHead: null,                        // 二级页那条吸顶顶栏（标题 + 返回），见 drawPageHead
    /* F8 ②（父亲大人 09-28：「返回键下面留点空间，全部页面都是，一上滑返回键都跟内容贴一起了」）：
       **呼吸带** —— 吸顶顶栏底下多铺这么高的一条不透光底，"正文滚上来"与顶栏之间永远留着它。
       ⚠️ 这是**唯一**的定义处：铺底在 `drawPageHead`、正文起点让位在 `uiw.js` 的 `U.pageHead`，
       两处都读这一个值（各写一份 8 是最容易改一处漏一处的写法）。 */
    HEAD_GAP: 8,
    panels: {},
    /* —— 设计令牌：逐条抄自网页版 css/style.css 的 :root（唯一标准）——
       V1.1（视觉语言基准 §2）：含义色按语义命名 —— 红从"主动作"退回，只管危险／消耗／不可行；
       主色金管主行动／关键／选中／品牌。下面的旧名字（accent/green/blue/red）留成别名，
       三百多处 `CV.C.accent` 调用点一个字都不用动，但新代码请写语义名。
       V1.1.1（存量收敛）：与网页版**同一张色板**，四大类一一对应
         A 类 登记基色 24 ／ B 类 派生档 ／ C 类 表面与状态底 ／ D 类 通道底色（给 CV.a 派生 α）
       **透明色只许写 `CV.a(CV.C.x, 0.4)`**，不许再手写 'rgba(230,182,76,.4)' ——
       `scripts/visual_audit.js` 第 ② 条会逐条扫，裸色值当场报红。 */
    C: {
      /* A 类 · 登记基色 24 */
      bg: '#07090e', bg2: '#0b0e15',
      panel: '#111621', panel2: '#161d2a', panel3: '#1d2534',
      line: '#232b3b', line2: '#333e55',
      text: '#e9edf6', text2: '#b6bfd0', dim: '#7a849b',
      gold: '#e6b64c',
      danger: '#d43a4f',                            /* 面／线 用 danger；文字用 dangerText（12px 上对比度 5.15，达标） */
      gain: '#56c894', info: '#6ec6ff', anom: '#b06bff',
      /* 稀有阶梯（与网页版 :root、data.js:RARITY_COLOR 同源） */
      rn: '#9aa4b2', rr: '#4da3ff', rsr: '#b06bff', rssr: '#ffb03a', rur: '#ff5fa2',
      /* 五族锚色（data.js:WORLD_THEME_HUE 取样；36 个世界格色是派生值） */
      famBio: '#53a26b', famGhost: '#765d98', famMystic: '#a26353', famTech: '#538aa2', famGod: '#a49951',
      /* B 类 · 派生档（与网页版逐条同名同值） */
      goldDeep: '#8a6a1e', dangerText: '#e8626f', accent2: '#97273a',
      /* 金底按钮**唯一的一套**（V1.1.2 父亲大人：「金底的按钮都改成白色字」）：
         渐变两端 ＋ 其上的字色，primary 与 gold 共用 —— 与网页版 --gold-btn / --gold-btn-deep / --on-gold 同值。 */
      goldBright: '#ffd76a', goldBtn: '#8f6c1f', goldBtnDeep: '#735517', onGold: '#ffffff',
      exp: '#b8860b', hp: '#37b26c', hpH: '#5dd39e', hpLow: '#b23737',
      en: '#6a5ae0', enH: '#9d8cff', dmg: '#ff8080', debuff: '#c8a2ff',
      holy: '#ff9ecb', rp: '#7ee0a3',
      /* C 类 · 表面／状态底 */
      bar: '#0d1120', doneBg: '#1d2b22', doneLine: '#2f5b41',
      enemy: '#2e1a24', overlay: '#1a1220', sel: '#241c08',
      /* D 类 · 通道底色（只为 CV.a 派生 α；值＝黑／白本人） */
      shade: '#000000', white: '#ffffff',
    },
    /* 下面这几组数值在 setup() 里按网页版的根字号等比缩放：
       网页版 css 里是 html { font-size: clamp(14.5px, 3.85vw, 16px) }，
       所有令牌都是 rem —— 这里用**同一条公式**算出系数 k，两边字距/间距才会一样大。 */
    SCALE: 1,
    SP: [4, 10, 14, 18, 24],       // --sp1..--sp5
    RADIUS: 10, RADIUS_SM: 7, RADIUS_CHIP: 3, PILL: 999,   // --r-card / --r-ctl / --r-chip / 形状特例
    /* ===== 排版层级（V9.6.117 定稿，父亲大人："整体游戏得区分字体的层级，一级二级三级…）=====
       全项目**只有这五级**，每一级只对应一个尺寸；任何"我就用 12.5 试试"的做法都是违例
       （type_scale_audit 会当场报出来）。两边必须一一对应（网页版是 rem，画布是 px）：

         一级 f2  17px  --fs-2   0.9375rem×…  页面标题（顶栏标题、结算大标题）
         二级 f1  15px  --fs-1   0.9375rem    卡片标题 h3、列表行主标题 .t1、名字
         三级 lg  13px  --fs-lg  0.8125rem    正文：正文说明、按钮 .btn、技能名 .sname、kv 行
         四级 md  12px  --fs-md  0.75rem      次要说明：.note、小节标题、小按钮 .btn.small
         五级 sm  11px  --fs-sm/xs 0.6875rem 注释：.hint、.sub、标签 tag、meta、时间

       说明两点，都是**故意**的：
         · xs 和 sm 是**同一级**（都是五级 11px）—— xs 是历史名字，留着是为了不动三百多处调用；
           新代码一律用 sm。两者永远相等，audit 会盯着。
         · 图标 / 大数字（战力、深井层数）不属于文字层级，走 CV.ICO / CV.DISP（见下），
           它们是"图形元素"，不参与正文排版。 */
    FS: { xs: 11, sm: 11, md: 12, lg: 13, f1: 15, f2: 17 },
    /* 层级别名：新代码推荐写 t1..t5（一眼看出是第几级，不用猜 f1/f2 是大是小） */
    TIER: { t1: 17, t2: 15, t3: 13, t4: 12, t5: 11 },
    /* 非文字元素（图标 / 展示数字）**不属于排版层级**，但也不能随手写 19、22、30 ——
       它们各有名字，改规格只改这里一处（type_scale_audit 会挡住裸数字）。 */
    ICO: 19,                                    // 行首图标（网页版 .list-row 的 1.1875rem）
    DISP: { d1: 20, d2: 24, d3: 30, d4: 40 },   // 展示数字：战力 20 / 关卡图标 24 / 胜负大字 30 / 深井层数 40
    FONT: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    /* V1.0.6（父亲大人 2026-09-24：「现在底部导航栏不对吧」）：
       底栏**只有文字**，与网页版一致 —— 这里原来给四格各挂一个 emoji（🏮 ⚔ 👥 🎒），
       放大就是三条毛病：①四个字形不成一套（灯笼 / 交叉剑 / 两个人 / 书包）；
       ②压灰之后**半灰半彩**（emoji 是字体字形，颜色不由我们管）；③「执灯者」用"两个人"语义不对。
       而网页版 navbarHtml() 自 V8.1「界面改纯文字（照参考图）」起**就只有 t.name**、没有图标
       （`css/style.css` 里那条 `.nav-item .ico` 是那时候留下的死规则）。
       按本室铁律「界面以网页版为准、canvas 逐条对齐」，这里把图标去掉、标签在格子里居中 ——
       不动页签数量 / 顺序 / 名字（父亲大人：不许大改导航结构）。
       ②的方案（两端同上一套矢量图标）与代价写在回单里，等一句话再动。 */
    NAV_TABS: [
      { id: 'home', name: '灯阁' },
      { id: 'dungeon', name: '残域' },
      { id: 'roster', name: '执灯者' },
      { id: 'bag', name: '背包' },
    ],
  };
  CV.cur = 'home';

  /* ---------- 派生 α 的唯一写法（V1.1.1 · 存量收敛）----------
     `CV.a(CV.C.gold, 0.4)` → 'rgba(230,182,76,0.4)'。
     由来：画布这边原来满天飞 'rgba(230,182,76,.4)' 这种手写值 —— 光金色一族就 12 种透明度、
     四个通道色的写法，改一次主色要全库搜一遍。现在通道只认令牌本人，透明度只认调用点那个数。
     尺子（scripts/visual_audit.js ②）扫到 'rgba(数字…' 这种裸通道就报红。 */
  CV.a = function (color, a) {
    const h = String(color).replace('#', '');
    const n = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
    return 'rgba(' + parseInt(n.slice(0, 2), 16) + ',' + parseInt(n.slice(2, 4), 16)
      + ',' + parseInt(n.slice(4, 6), 16) + ',' + a + ')';
  };
  /* 旧名字 = 别名（不再重复写一遍色值） */
  CV.C.accent = CV.C.danger; CV.C.red = CV.C.danger;
  CV.C.green = CV.C.gain; CV.C.blue = CV.C.info;
  CV.C.lineSoft = CV.a(CV.C.white, .05);

  /* ---------- 初始化：按真实窗口算尺寸（不再"375 设计 + 整体缩放"） ---------- */
  CV.setup = function (info) {
    const canvas = wx.createCanvas();
    CV.canvas = canvas;
    CV.ctx = canvas.getContext('2d');
    /* 货币符号→专属色：开机就把 data.js 那张表读进来缓存（V9.6.139）。
       放在 setup 里是因为它一定在 data.js 之后跑。 */
    try { CV.syncCurrencyColors(); } catch (e) {}
    CV.relayout(info || {});
    return CV;
  };

  /* ---------- 按窗口尺寸重算布局（开机 + 每次窗口变化都走这里） ----------
     V9.6.90（父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
     以前尺寸只在开机算一次，而且 **dpr 缩放只 scale() 了一次** ——
     只要主画布被平台重设过一次尺寸（微信在**窗口尺寸变化 / 键盘弹出 / 前后台切换**时会重设
     主画布，重设会**清空整个 ctx 状态**，包括我们那次 scale），
       ① 缩放没了 → 整块界面按 1/dpr 画，底栏整条跑到画面外；
       ② CV.H 还是老值 → 底栏按老高度摆，窗口一变矮就出画。
     现在：尺寸变化一律重算；并且**每帧都显式 setTransform**（见 CV.render），
     外部谁把变换洗掉了都不影响我们。 */
  CV.relayout = function (info) {
    info = info || {};
    const pxW = info.windowWidth || CV.pxW || 375;
    const pxH = info.windowHeight || CV.pxH || 812;
    const dpr = info.pixelRatio || CV.DPR || 1;
    const sa = info.safeArea || null;
    CV.safeTop = sa && sa.top ? sa.top : 0;
    CV.safeBottom = sa && sa.bottom != null ? Math.max(0, pxH - sa.bottom) : 0;
    CV.W = Math.min(520, pxW);            // 网页版 #app 的 max-width: 520
    CV.H = pxH;
    CV.DPR = dpr;
    CV.pxW = pxW; CV.pxH = pxH;
    const canvas = CV.canvas;
    if (canvas) {
      const bw = Math.round(pxW * dpr), bh = Math.round(pxH * dpr);
      /* 只在真的变了时才赋值（赋值会清空 ctx 状态） */
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      try { CV.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } catch (e) {}
    }
    /* —— 令牌缩放：与网页版保持一致（父亲大人要求"网页版是唯一标准"）——
       V9.5.84：网页版把根字号从 clamp(14.5px, 3.85vw, 16px) 改成**固定 16px**，
       原因是 375 及以下的手机上根字号只有 14.5px，最小那档字号 11×0.906 = **9.97px**，
       比定下的"字号下限 11px"还小（父亲大人一直说"字看不到"就是这个）。
       这里跟着把 k 固定成 1：字号恒为 11/11/12/13/15/17，间距/圆角/控件高也不再缩。
       代价是窄屏上内容大 10%（多滚一点），换来的是所有字都真的 ≥11px。 */
    /* ================= F7 ①（0928 · 父亲大人："小屏幕的界面能按照大屏的比例等比缩放吗？
       现在小屏的界面不好看啊，太臃肿了"）· 令牌缩放拆成**两条比例** =================
       原来 `const k = 1` 把整块令牌钉死（V9.5.84 的历史取舍：375 及以下的手机上根字号只有 14.5px，
       最小那档 11×0.906 = 9.97px，比定下的"字号下限 11px"还小）—— 代价就是今天这句"窄屏上内容大、显得臃肿"。
       现在拆开，**三条约束同时成立**：
         · k  ＝ **字号系数，恒为 1**：五级阶梯 17/15/13/12/11 在任何屏上都不缩，
                320 宽的屏上最小那档仍然是 11px（他当年为"字看不到"提过一次，不许再犯回去）；
         · kv ＝ **观感系数 = min(1, W/390)**：只缩"与辨读无关"的那批 —— 间距 CV.SP / 圆角 /
                控件高 U.BTN_* / 卡片内边距 / 头像与图标。320 上 ≈ 0.82，430 上封顶 1（大屏不再变胖）。
       ⚠️ **热区不在缩放里**：`CV.hit` 的 `minHitPx() = 44` 是物理口径（WCAG/HIG 那条他没撤）——
          视觉可以小、热区照样长到 44，两者解耦（见下面 CV.hit 那一段）。
       ⚠️ **字号一律走 CV.FS / CV.TIER 令牌，不许再写 `CV.FS.x * CV.SCALE`**（那会把字缩到 11 以下）。
          `type_scale_audit` ⑦ 有一条扫描专门盯这个写法。 */
    const k = 1;
    const kv = Math.min(1, CV.W / 390);
    CV.SCALE = kv;
    CV.SP = [4, 10, 14, 18, 24].map((v) => v * kv);
    /* V1.1（基准 §3.2 第 1 步）：sm / xs 从 11px 跟到四级 12px —— 它们原来是五级，
       结果 11px 占了全站 46% 的声明。第四级＝md/sm/xs（12px），
       11px 只留给"图形里的字"＝ tag。五级阶梯的数字没变（17/15/13/12/11）。 */
    CV.FS = { xs: 12 * k, sm: 12 * k, md: 12 * k, lg: 13 * k, f1: 15 * k, f2: 17 * k, tag: 11 * k };
    CV.RADIUS = 10 * kv; CV.RADIUS_SM = 7 * kv; CV.RADIUS_CHIP = 3 * kv;
    CV.NAV_H = 62 * kv;
    CV.NAV_BASE = 62 * kv;     // 底栏基准高：战斗页会把它清成 0（整屏接管），离开时必须恢复
    /* F6 #3：窗口尺寸变化 / 切回前台时把渲染闸复位并补画一帧 ——
       那一次 rAF 万一没被平台派发（画布被重建、后台冻结），画面也不许停在旧帧（"假死"）。
       开机时 `CV.resetRenderGate` 还没挂（uiw.js 后加载），这句自然跳过。 */
    try { if (CV.resetRenderGate) CV.resetRenderGate(); } catch (e) {}
    return CV;
  };

  /* ---------- 字体缺的符号：自己画（V9.6.26，父亲大人："缺少的图标都重新画进去"） ----------
     微信画布的中文字体里没有 ♜（象棋车），直接写会渲染成"豆腐块"。
     以前用 ◇ 顶替 —— 能看，但跟网页版/别处对不上（父亲大人："随便搞个替代既不好看、
     又容易跟别的界面联系不上"）。这里给这些符号配**矢量画法**，并挂在 CV.GLYPHS 上；
     CV.text / CV.measure 会自动识别：遇到这些字符就按图标宽（= 字号）走，其余照常排版。
     代价为零，调用点一行都不用改（页面里照旧写 '♜ 深井印记'）。 */
  /* ---------- 图标 op 渲染器（V1.0.6 · 父亲大人拍板「B，收口」） ----------
     **形状数据只有一处**：data.js 的 NAV_ICONS / CUR_ICONS / ICON_STROKE（与 FACTION_GLYPH
     同一个做法——数据层放几何，界面层只负责画）。两端各渲染一次：这里是画布端那一次，
     网页版那次在 ui.js 的 iconSvg()。同一份 op、同一线宽、同一圆角。
     坐标系 24×24、中心对齐 (cx,cy)；描边型统一线宽 ICON_STROKE（op 尾巴上可覆盖）。
     ⚠️ 本函数里**不许出现任何具体形状**（写了就等于又开一套），只认 data.js 那几个 op。 */
  CV.drawIcon = function (ops, c, cx, cy, size, color) {
    if (!ops || !ops.length) return;
    const k = size / 24;
    const sw = ((G.DATA && G.DATA.ICON_STROKE) || 1.9) * k;
    const P = (x, y) => [cx + (x - 12) * k, cy + (y - 12) * k];
    const lwAt = (op, n) => (op.length > n && typeof op[n] === 'number' ? op[n] * k : sw);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    ops.forEach(function (op) {
      const t = op[0];
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = sw;
      if (t === 'line') {
        const a = P(op[1], op[2]), b = P(op[3], op[4]);
        c.lineWidth = lwAt(op, 5);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      } else if (t === 'rect') {
        const a = P(op[1], op[2]), w = op[3] * k, h = op[4] * k, r = op[5] * k;
        c.lineWidth = lwAt(op, 6);
        c.beginPath();
        c.moveTo(a[0] + r, a[1]);
        c.arcTo(a[0] + w, a[1], a[0] + w, a[1] + h, r);
        c.arcTo(a[0] + w, a[1] + h, a[0], a[1] + h, r);
        c.arcTo(a[0], a[1] + h, a[0], a[1], r);
        c.arcTo(a[0], a[1], a[0] + w, a[1], r);
        c.closePath(); c.stroke();
      } else if (t === 'arc') {
        const a = P(op[1], op[2]);
        c.lineWidth = lwAt(op, 6);
        c.beginPath(); c.arc(a[0], a[1], op[3] * k, op[4] * Math.PI / 180, op[5] * Math.PI / 180); c.stroke();
      } else if (t === 'circle') {
        const a = P(op[1], op[2]);
        c.lineWidth = lwAt(op, 4);
        c.beginPath(); c.arc(a[0], a[1], op[3] * k, 0, Math.PI * 2); c.stroke();
      } else if (t === 'poly' || t === 'fpoly') {
        const pts = op[1] || [];
        c.lineWidth = lwAt(op, 2);
        c.beginPath();
        pts.forEach(function (p, i) { const q = P(p[0], p[1]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
        c.closePath();
        if (t === 'poly') c.stroke(); else c.fill();
      } else if (t === 'frect') {
        const a = P(op[1], op[2]);
        c.fillRect(a[0], a[1], op[3] * k, op[4] * k);
      } else if (t === 'ring') {
        const a = P(op[1], op[2]);
        c.beginPath();
        c.arc(a[0], a[1], op[3] * k, 0, Math.PI * 2);
        c.arc(a[0], a[1], op[4] * k, 0, Math.PI * 2);
        c.fill('evenodd');
      } else if (t === 'mark') {
        const a = P(op[1], op[2]), b = P(op[3], op[4]);
        c.globalAlpha = (op[6] === undefined ? 1 : op[6]);
        c.strokeStyle = op[5] || color;
        c.lineWidth = Math.max(1, sw * 0.5);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        c.globalAlpha = 1;
      }
    });
    c.restore();
  };
  /* 按 id 取形状（NAV_ICONS / CUR_ICONS 都在 data.js）：找不到就**什么都不画**——
     "找不到就退回 emoji" 正是上一版那类漂移的入口，这里不给它留口子。 */
  CV.iconOps = function (kind, id) {
    const D = G.DATA || {};
    /* 表结构由 data.js 的 iconOpsOf 自己解释（nav 是 {name,ops}、货币直接是 ops）——
       这里不许再猜一遍：猜错过一次，代价是顶栏四颗货币图标全没了。 */
    return (D.iconOpsOf ? D.iconOpsOf(kind, id) : null);
  };
  /* 五角星顶点（归一化 0~1，10 点内外半径交替）—— ★ 与 ☆ 共用一张表。
     放在 GLYPHS 外面是因为它只是**几何数据**，不是某个字的画法。 */
  const STAR5 = (function () {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? 0.2 : 0.5;
      p.push([0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d]);
    }
    return p;
  })();
  CV.GLYPHS = {
    /* ── 四种货币：从「文字字形」换成「矢量画法」（P2 素材立项第一步）────────────
       V1.0.1（AI 视觉工程师会诊：192 个字形全靠 emoji —— 两端字形不同、部分平台出黑白轮廓、
       不可着色、与暗色 UI 不同源；其中 ◉◆✦♾ 只是**装饰记号不是货币**，
       "货币稀有度看反"那次误判就是它们直接造成的）。
       按他的 ROI 建议：**只先做最高频的一批**（货币 4 个），不动其余 188 个。
       四个形状刻意做成**互不相似**：圆中方孔 / 菱形切面 / 四角星 / 双环轮回。 */
    /* 四种货币：几何**只有一处** —— data.js 的 CUR_ICONS（V1.0.6 · 父亲大人「B，收口」）。
       这里只是画布端的**渲染**：同一份 op 交给 CV.drawIcon()。形状一个字都不许写在本文件里。
       （原来这四段是各写各的：网页版那头还在打 ◉◆✦♾ 文字字符 —— 两端同形就是这么漂开的。） */
    '◉': function (c, x, y, s, color) { CV.drawIcon(CV.iconOps('cur', 'points'), c, x, y, s, color); },
    '◆': function (c, x, y, s, color) { CV.drawIcon(CV.iconOps('cur', 'otherworld'), c, x, y, s, color); },
    '✦': function (c, x, y, s, color) { CV.drawIcon(CV.iconOps('cur', 'holy'), c, x, y, s, color); },
    '♾': function (c, x, y, s, color) { CV.drawIcon(CV.iconOps('cur', 'rp'), c, x, y, s, color); },
    '♜': function (c, x, y, s, color) {           // x = 图标中心，y = 垂直中线
      const w = s * 0.86, h = s, L = x - w / 2, R = x + w / 2;
      const top = y - h * 0.42, bot = y + h * 0.42;
      const rr = function (rx, ry, rw, rh, rad) {
        const r2 = Math.min(rad, rw / 2, rh / 2);
        c.beginPath();
        c.moveTo(rx + r2, ry);
        c.arcTo(rx + rw, ry, rx + rw, ry + rh, r2);
        c.arcTo(rx + rw, ry + rh, rx, ry + rh, r2);
        c.arcTo(rx, ry + rh, rx, ry, r2);
        c.arcTo(rx, ry, rx + rw, ry, r2);
        c.closePath(); c.fill();
      };
      c.save(); c.fillStyle = color;
      rr(L, bot - h * 0.16, w, h * 0.16, h * 0.05);                 // 底座
      c.beginPath();                                                 // 塔身（上窄下宽）
      c.moveTo(L + w * 0.17, bot - h * 0.16);
      c.lineTo(L + w * 0.27, top + h * 0.30);
      c.lineTo(R - w * 0.27, top + h * 0.30);
      c.lineTo(R - w * 0.17, bot - h * 0.16);
      c.closePath(); c.fill();
      const mw = w * 0.21, gap = w * 0.115;                          // 顶冠三垛
      for (let i = 0; i < 3; i++) rr(L + i * (mw + gap), top, mw, h * 0.30, h * 0.04);
      c.restore();
    },
    /* V9.6.111（父亲大人："灯阁小队前面有一个乱码"）：
       画布的中文字体里**没有 ⚔**（DOM 有字体回退，canvas 是"豆腐块"）——
       网页版标题写的是「⚔️ 灯阁小队」，小游戏照抄就成了乱码。
       按父亲大人定的规矩（"缺少的图标都重新画进去"），这里自己画**交叉双剑**：
       两道长刃斜交叉、各自一段护手、一段短柄、一颗尾珠 —— 纯路径，任何设备都画得出来。
       （底栏「残域」那个图标也是它，一处画好两处都好看。） */
    '⚔': function (c, x, y, s, color) {
      const w = s * 0.96, h = s * 0.96;
      const x0 = x - w / 2, y0 = y - h / 2;
      const P = (nx, ny) => [x0 + nx * w, y0 + ny * h];
      const seg = (a, b, lw) => {
        c.lineWidth = Math.max(1, lw);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      };
      c.save();
      c.strokeStyle = color; c.fillStyle = color;
      c.lineCap = 'round'; c.lineJoin = 'round';
      /* 一把剑：tip（剑尖）→ guard（护手所在处）→ grip（柄尾） */
      const sword = (tip, guard, grip) => {
        seg(tip, guard, s * 0.115);                       // 刃
        const dx = guard[0] - tip[0], dy = guard[1] - tip[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len, py = dx / len;              // 刃的垂直方向
        const gl = s * 0.15;                              // 护手半长
        seg([guard[0] - px * gl, guard[1] - py * gl], [guard[0] + px * gl, guard[1] + py * gl], s * 0.075);
        seg(guard, grip, s * 0.085);                      // 柄
        c.beginPath(); c.arc(grip[0], grip[1], s * 0.055, 0, Math.PI * 2); c.fill();   // 尾珠
      };
      sword(P(0.13, 0.05), P(0.63, 0.60), P(0.75, 0.74));
      sword(P(0.87, 0.05), P(0.37, 0.60), P(0.25, 0.74));
      c.restore();
    },
    /* ── 第二批：**文本呈现型**符号（第三批与详情见下面的注释）─────────────────
       V1.0.1（AI 视觉工程师会诊："16 个符号在部分平台出黑白轮廓"）。
       技术判据不是"它长得像不像 emoji"，而是 Unicode 的 **Emoji_Presentation**：
         · 默认**文本呈现**（如 ⚔ ♜ ★ ☆ ✓ ✗ ➕ ⬆ ❖ ♂ ♀ ❥ ◉ ◆ ✦ ♾）——
           走的是**文本字体**，而画布用的中文字体里根本没这几个字 → **豆腐块**。
           （⚔ 和 ♜ 就是栽在这条上，前面两个版本已经补过。）
         · 默认 **emoji 呈现**（如 🛡 🗡 ⛰ ⚗ ⛏ ⚠ ⚙ ⚡）——
           系统有 emoji 字体就出彩色，没有就退成黑白轮廓甚至方块，**各平台不一致**。
       所以这一批先补"一定会出豆腐块"的 10 个（下面这批），
       下一批再补"各平台不一致"的 8 个。形状一律画成最简单的几何，
       14px 以下细节等于噪点，认得出是什么比画得好看重要。 */
    '★': function (c, x, y, s, color) {          // 实心五角星
      CV.poly(STAR5, x - s * 0.45, y - s * 0.45, s * 0.9, color);
    },
    '☆': function (c, x, y, s, color) {          // 空心五角星（同一张顶点表）
      const sp = s * 0.9, ox = x - sp / 2, oy = y - sp / 2;
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.2, s * 0.085); c.lineJoin = 'round';
      c.beginPath();
      STAR5.forEach(function (p, i) {
        const px = ox + p[0] * sp, py = oy + p[1] * sp;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.closePath(); c.stroke(); c.restore();
    },
    '✓': function (c, x, y, s, color) {          // 对勾
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.4, s * 0.12);
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.02);
      c.lineTo(x - s * 0.09, y + s * 0.24); c.lineTo(x + s * 0.32, y - s * 0.24);
      c.stroke(); c.restore();
    },
    '✗': function (c, x, y, s, color) {          // 叉（对勾的反义，成对出现）
      const d = s * 0.28;
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.4, s * 0.115); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - d, y - d); c.lineTo(x + d, y + d); c.stroke();
      c.beginPath(); c.moveTo(x + d, y - d); c.lineTo(x - d, y + d); c.stroke();
      c.restore();
    },
    '➕': function (c, x, y, s, color) {          // 加号（"再加一次"这类动作）
      const a = s * 0.34, b = s * 0.09;
      c.save(); c.fillStyle = color;
      c.fillRect(x - a, y - b, a * 2, b * 2);
      c.fillRect(x - b, y - a, b * 2, a * 2);
      c.restore();
    },
    '⬆': function (c, x, y, s, color) {          // 上箭头（升级 / 提升）
      const w = s * 0.32, h = s * 0.4;
      c.save(); c.fillStyle = color;
      c.beginPath();
      c.moveTo(x, y - h); c.lineTo(x + w, y + h * 0.1);
      c.lineTo(x + w * 0.42, y + h * 0.1); c.lineTo(x + w * 0.42, y + h);
      c.lineTo(x - w * 0.42, y + h); c.lineTo(x - w * 0.42, y + h * 0.1);
      c.lineTo(x - w, y + h * 0.1); c.closePath(); c.fill(); c.restore();
    },
    '❖': function (c, x, y, s, color) {          // 四瓣花（宝石 / 稀有标记）
      /* 刻意和 ✦（四角尖星）拉开：这个是**四个菱形花瓣**、中间留空，
         远看是"花"不是"星"—— 两个符号都当稀有标记用，长一样就白分了。 */
      const R = s * 0.42;
      c.save(); c.fillStyle = color;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
        c.beginPath();
        c.moveTo(x + dx * R, y + dy * R);
        c.lineTo(x - dy * R * 0.34, y + dx * R * 0.34);
        c.lineTo(x - dx * R * 0.2, y - dy * R * 0.2);
        c.lineTo(x + dy * R * 0.34, y - dx * R * 0.34);
        c.closePath(); c.fill();
      }
      c.restore();
    },
    '♂': function (c, x, y, s, color) {          // 男（性别筛选）
      const r = s * 0.24, cy = y + s * 0.1;
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.3, s * 0.1); c.lineCap = 'round';
      c.beginPath(); c.arc(x - s * 0.06, cy, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.06 + r * 0.7, cy - r * 0.7);
      c.lineTo(x + s * 0.34, y - s * 0.34); c.stroke();
      c.beginPath(); c.moveTo(x + s * 0.34, y - s * 0.34); c.lineTo(x + s * 0.34, y - s * 0.1); c.stroke();
      c.beginPath(); c.moveTo(x + s * 0.34, y - s * 0.34); c.lineTo(x + s * 0.1, y - s * 0.34); c.stroke();
      c.restore();
    },
    '♀': function (c, x, y, s, color) {          // 女（性别筛选）
      const r = s * 0.24;
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.3, s * 0.1); c.lineCap = 'round';
      c.beginPath(); c.arc(x, y - s * 0.1, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(x, y - s * 0.1 + r); c.lineTo(x, y + s * 0.4); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.16, y + s * 0.24); c.lineTo(x + s * 0.16, y + s * 0.24); c.stroke();
      c.restore();
    },
    '❥': function (c, x, y, s, color) {          // 心（好感 / 体力）
      const w = s * 0.42, h = s * 0.4;
      c.save(); c.fillStyle = color;
      c.beginPath(); c.moveTo(x, y + h);
      c.bezierCurveTo(x - w * 1.4, y - h * 0.2, x - w * 0.55, y - h, x, y - h * 0.34);
      c.bezierCurveTo(x + w * 0.55, y - h, x + w * 1.4, y - h * 0.2, x, y + h);
      c.closePath(); c.fill(); c.restore();
    },
    /* ── 第三批：**emoji 呈现型**符号（各平台字形不一致的那 8 个）─────────────
       它们和上一批的问题不同：不是"一定画不出来"，而是**各平台各画各的**——
       有 emoji 字体就出彩色（iOS），没有就退成黑白轮廓甚至方块（部分安卓 / 旧机型）。
       而它们全在**功能位**（警告 / 装备 / 关卡 / 设置 / 速度），不是一个平台一个样无所谓的花边，
       玩家看到的"图标坏了"就是这么来的。自绘成单色后，两端、所有机型完全同源。 */
    '⚠': function (c, x, y, s, color) {          // 警告（三角 + 叹号）
      const w = s * 0.44, h = s * 0.4;
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.2, s * 0.085);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w, y + h * 0.7);
      c.lineTo(x - w, y + h * 0.7); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(x, y - h * 0.32); c.lineTo(x, y + h * 0.18); c.stroke();
      c.beginPath(); c.arc(x, y + h * 0.46, Math.max(1, s * 0.05), 0, Math.PI * 2);
      c.fillStyle = color; c.fill();
      c.restore();
    },
    '🛡': function (c, x, y, s, color) {          // 盾（防御 / 减伤）
      const w = s * 0.38, h = s * 0.44;
      c.save(); c.fillStyle = color;
      c.beginPath();
      c.moveTo(x - w, y - h * 0.8); c.lineTo(x + w, y - h * 0.8);
      c.lineTo(x + w, y + h * 0.05);
      c.quadraticCurveTo(x + w, y + h * 0.75, x, y + h);
      c.quadraticCurveTo(x - w, y + h * 0.75, x - w, y + h * 0.05);
      c.closePath(); c.fill(); c.restore();
    },
    '🗡': function (c, x, y, s, color) {          // 匕首（装备位的武器）
      const H = s * 0.4;
      c.save(); c.fillStyle = color;
      c.beginPath();                                        // 剑身（上尖下宽）
      c.moveTo(x, y - H);
      c.lineTo(x + s * 0.075, y - H * 0.45); c.lineTo(x + s * 0.075, y + H * 0.1);
      c.lineTo(x - s * 0.075, y + H * 0.1); c.lineTo(x - s * 0.075, y - H * 0.45);
      c.closePath(); c.fill();
      c.fillRect(x - s * 0.2, y + H * 0.1, s * 0.4, s * 0.07);      // 护手
      c.fillRect(x - s * 0.045, y + H * 0.17, s * 0.09, s * 0.22);   // 柄
      c.restore();
    },
    '⛰': function (c, x, y, s, color) {          // 山（残域 / 世界）
      const B = y + s * 0.34;
      c.save(); c.fillStyle = color;
      c.beginPath(); c.moveTo(x - s * 0.46, B); c.lineTo(x - s * 0.1, y - s * 0.3);
      c.lineTo(x + s * 0.22, B); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - s * 0.02, B); c.lineTo(x + s * 0.24, y - s * 0.14);
      c.lineTo(x + s * 0.5, B); c.closePath(); c.fill();
      c.restore();
    },
    '⚗': function (c, x, y, s, color) {          // 蒸馏瓶（法宝 / 祭炼）
      const r = s * 0.25, cy = y + s * 0.13;
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.3, s * 0.09);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath(); c.arc(x, cy, r, 0, Math.PI * 2); c.stroke();          // 球部
      c.beginPath(); c.moveTo(x - r * 0.55, cy - r * 0.78);                // 瓶颈两竖
      c.lineTo(x - r * 0.55, y - s * 0.36); c.stroke();
      c.beginPath(); c.moveTo(x + r * 0.55, cy - r * 0.78);
      c.lineTo(x + r * 0.55, y - s * 0.36); c.stroke();
      c.beginPath(); c.moveTo(x - r * 0.8, y - s * 0.36);                  // 瓶口
      c.lineTo(x + r * 0.8, y - s * 0.36); c.stroke();
      c.beginPath(); c.moveTo(x + r * 0.55, y - s * 0.3);                  // 斜导管
      c.lineTo(x + s * 0.36, y - s * 0.42); c.stroke();
      c.restore();
    },
    '⛏': function (c, x, y, s, color) {          // 镐（强化材料）
      c.save(); c.strokeStyle = color; c.lineWidth = Math.max(1.3, s * 0.1); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.4);                   // 柄
      c.lineTo(x + s * 0.26, y - s * 0.26); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.28, y - s * 0.04);                 // 弯头
      c.quadraticCurveTo(x + s * 0.06, y - s * 0.44, x + s * 0.4, y - s * 0.12);
      c.stroke(); c.restore();
    },
    '⚙': function (c, x, y, s, color) {          // 齿轮（设置）
      const R = s * 0.44, r = s * 0.3;
      c.save(); c.fillStyle = color;
      c.beginPath();
      for (let i = 0; i < 16; i++) {                      // 16 点交替 → 8 个齿
        const a = i * Math.PI / 8, d = i % 2 ? R : r;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath(); c.fill();
      c.globalCompositeOperation = 'destination-out';     // 中心轴孔
      c.beginPath(); c.arc(x, y, s * 0.12, 0, Math.PI * 2); c.fill();
      c.restore();
    },
    '⚡': function (c, x, y, s, color) {          // 闪电（速度 / 能量）
      const w = s * 0.3, h = s * 0.42;
      c.save(); c.fillStyle = color;
      c.beginPath();
      c.moveTo(x + w * 0.25, y - h); c.lineTo(x - w, y + h * 0.12);
      c.lineTo(x - w * 0.05, y + h * 0.12); c.lineTo(x - w * 0.25, y + h);
      c.lineTo(x + w, y - h * 0.12); c.lineTo(x + w * 0.05, y - h * 0.12);
      c.closePath(); c.fill(); c.restore();
    },
  };
  CV.hasGlyph = function (str) {
    const t = String(str == null ? '' : str);
    for (const k in CV.GLYPHS) if (t.indexOf(k) >= 0) return true;
    return false;
  };
  /* ---------- 命格主题（V1.1 · 2026-09-23）----------
     六套锚色 / 六形印记 / 九级灯梯**全部从数据层取**（D.BLOOD_THEME / BLOOD_GLYPH / BLOOD_LAMP）——
     画布这端不许再写一套 hex，否则又是"改一边忘一边"。与网页版同一份表、同一套规则。
       · CV.blLamp(bl, realm)：这一境界上的灯色（**色只走 4 级**，第 5 大境封顶，之后交给光晕）
       · CV.blGlyph(bl, cx, cy, s, color)：命格印记（第六套形状语言，与五族族形同一套规则，
         归一化 0~1 顶点表直接乘尺寸，两端同一个形状）
     两个都**只画**，不改任何数值。 */
  CV.blLamp = function (bl, realm) {
    const row = (G.DATA && G.DATA.BLOOD_LAMP) ? G.DATA.BLOOD_LAMP[bl] : null;
    if (!row || !row.length) return CV.C.gold;
    const per = ((G.DATA.REALM_TIERS && G.DATA.REALM_TIERS.length) || 4);
    const k = Math.min(row.length - 1, Math.max(0, Math.floor((realm || 0) / per)));
    return row[k];
  };
  /* 印记 = 一枚徽记的**若干块**（V1.1.4）：t=0 主体（实心）· t=1 内芯（同色 .55）· t=2 刻痕（同色 .30）——
     与网页版 js/ui.js:blGlyph 的 `<polygon fill-opacity>` 是**同一套调子**（这里走 CV.a()）。
     顶点表只有一份（D.BLOOD_GLYPH），两端谁都不许自己写第二套形状。 */
  const BL_TONE = [1, .55, .30];
  CV.blGlyph = function (bl, cx, cy, s, color) {
    const g = (G.DATA && G.DATA.BLOOD_GLYPH) ? G.DATA.BLOOD_GLYPH[bl] : null;
    if (!g || !g.parts || !g.parts.length) return 0;
    const c = CV.ctx, base = color || CV.C.text;
    c.save();
    g.parts.forEach(function (part) {
      const a = BL_TONE[part.t] === undefined ? 1 : BL_TONE[part.t];
      c.fillStyle = a >= 1 ? base : CV.a(base, a);
      c.beginPath();
      part.p.forEach(function (p, i) {
        const px = cx - s / 2 + p[0] * s, py = cy - s / 2 + p[1] * s;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.closePath();
      c.fill();
    });
    c.restore();
    return s;
  };
  /* ---------- 头像（V1.1.2 · 基准 §4.4）----------
     与网页版**同一份配方**（数据层 D.avatarSpec / D.avatarParts）：
     圆盘（panel3）＋ 剪影（阵营色 55%）＋ 头饰（阵营色本人）＋ 阵营纹。
     旧版是"圆框 + 名字首字"——44px 下只有字、没有形；现在一个人一张形，两端同一个形。
     18 个部件 × 组合的完整表在 data.js（6 剪影 × 6 头饰 × 4 阵营纹 × 2 体型 ＝ 288 组合）。 */
  CV.avatar = function (id, cx, cy, size, ring) {
    const D = G.DATA;
    if (!D || !D.avatarParts) return;
    const c = CV.ctx;
    const isMe = id === '@player';
    const ch = isMe ? null : (D.charById[id] || null);
    const S = (G.Core && G.Core.S) || null;
    const info = {
      bloodline: isMe ? ((S && S.player && S.player.bloodline) || '') : (ch && ch.bloodline),
      faction: isMe ? (S && S.player && S.player.faction) : (ch && ch.faction),
    };
    const spec = D.avatarSpec(id, info);
    const r = size / 2, ink = CV.a(spec.tint, .55);
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = CV.C.panel3; c.fill();
    c.lineWidth = 2; c.strokeStyle = ring || CV.C.line2; c.stroke();
    c.beginPath(); c.arc(cx, cy, r - 1, 0, Math.PI * 2); c.clip();       // 剪影不许出圆盘
    D.avatarParts(id, info).forEach(function (p) {
      const col = p.role === 'ink' ? ink : spec.tint;
      c.beginPath();
      p.pts.forEach(function (q, i) {
        const px = cx - r + q[0] * size, py = cy - r + q[1] * size;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.closePath(); c.fillStyle = col; c.fill();
    });
    c.restore();
  };
  /* 货币符号 → 专属色（从货币表来，别处不许再手写颜色）。
     晚一点挂：data.js 先加载，这里只是把表读出来缓存一份。 */
  CV.CUR_COLOR = {};
  CV.currencyIn = function (str) {
    const t = str == null ? '' : String(str);
    for (const k in CV.CUR_COLOR) if (t.indexOf(k) >= 0) return true;
    return false;
  };
  CV.syncCurrencyColors = function () {
    const list = (G.DATA && G.DATA.CURRENCIES) || [];
    CV.CUR_COLOR = {};
    list.forEach(function (c) {
      const ch = String(c.icon || '').trim();
      if (ch) CV.CUR_COLOR[ch] = c.color;
    });
  };
  CV.glyphWidth = function (ch, size) { return CV.GLYPHS[ch] ? size : 0; };

  /* ---------- 绘制原语（数值都对齐网页版） ---------- */
  /* V9.6.66（父亲大人："字都画出来了"级别的小毛病）：引导文案里用 **粗体** 标重点，
     但画布不认 markdown —— 结果是**星号原样画在屏幕上**（截图里就是"① **角色卡**：…"）。
     统一在三个入口（画 / 量 / 折行）把这两顆星号去掉，宽度和绘制口径就永远一致。 */
  /* V9.6.111：顺手去掉**变体选择符 U+FE0F / U+FE0E** 和**连接符 U+200D**。
     这三个都是"零宽"的排版控制字符，网页版靠字体回退把它们吃掉；
     画布却会当成独立字符去量宽度、找字形 —— 找不到就是一个小方块（看着像乱码）。
     组合式 emoji（🧙‍♂️ 男法师这种"基础 emoji + 连接符 + 性别符"）画布合成不了，
     所以先按表降级成"它能显示的那个主体"，再兜底剥掉剩下的控制字符。 */
  const ZWJ_FALLBACK = {
    '🧙‍♂️': '🧙', '🧙‍♀️': '🧙',
    '🧑‍⚕️': '🧑', '👨‍👩‍👧': '👨', '🏳️‍🌈': '🏳️',
  };
  function _md(str) {
    let s = String(str == null ? '' : str);
    for (const k in ZWJ_FALLBACK) if (s.indexOf(k) >= 0) s = s.split(k).join(ZWJ_FALLBACK[k]);
    return s.replace(/\*\*/g, '').replace(/[\uFE0E\uFE0F\u200D]/g, '');
  }
  CV.plain = _md;
  CV.text = function (str, x, y, opt) {
    opt = opt || {};
    const c = CV.ctx;
    c.fillStyle = opt.color || CV.C.text;
    c.font = `${opt.bold ? '600 ' : ''}${opt.size || CV.FS.lg}px ${CV.FONT}`;
    /* opt.ls：字距（网页版那一堆 letter-spacing）。引擎不支持 letterSpacing 时
       设不上去、当没写，不会报错。 */
    const lsOk = ('letterSpacing' in c);
    if (lsOk && opt.ls) { try { c.letterSpacing = opt.ls + 'px'; } catch (e) {} }
    c.textAlign = opt.align || 'left';
    c.textBaseline = opt.baseline || 'middle';
    const raw = _md(str);
    /* V9.6.139（父亲大人："货币的图标还是没有统一，兑换大厅和法宝购买这些需要货币的
       都要对应到上方 4 种货币的图标，现在还是存在有白色块"）：
       顶栏那四颗是**带专属色**的，别处（兑换大厅 / 法宝购买 / 各处的价钱）一直是白字 ——
       同一种货币在两个地方长得不一样，看着就是"没统一"。
       这里做一次性收口：**只要一段文字里出现那四个货币符号，就自动按货币表的颜色画**，
       调用点一行都不用改（页面里照旧写 '◉ 500'）。没出现货币符号时这段判断只是一次 indexOf，
       开销可以忽略。 */
    const curHits = CV.currencyIn(raw);
    if (curHits || CV.hasGlyph(raw)) {
      /* ================= F6 #4（抢修单 0928 · 逐字 fillText）=================
       分段粒度 ＝ **"连续普通文字段"或"单个自绘字形"**，不是"逐码点"。
       以前只要一行里出现一个 ★ ◉ ⚠ ♾…，**整行**就被降级成"每个字一次 fillText + 一次 measure"：
       实测单行 11 个纯中文＝1 次 fillText，带一个 ◉ 的 14 字＝13 次、带 ⚠ 的 31 字长文案＝30 次；
       页面级（真代码整帧计数）**秘术阁 553 次里 335 次(61%)、游历 476 里 329(69%)、成长 260 里 219(84%)**
       都来自这一条。现在连续段一次画完、一次量宽 —— 帧成本砍一半以上。
       每一段的宽度口径与 `CV.measure` 完全同源（都按"段"量），所以排版位置不发生漂移。 */
      const size = opt.size || CV.FS.lg;
      /* 必须按**码点**切（Array.from），不能用逐码元切 —— emoji 是代理对，
         切开就变成两个半字符（🏪 会被劈成两半）。 */
      const chars = Array.from(raw);
      /* 要单独画的字符：自绘字形（走 GLYPHS）＋ 带专属色的货币符（换色必须独立成段） */
      const solo = (t) => !!CV.GLYPHS[t] || (curHits && !!CV.CUR_COLOR[t]);
      const segs = [];
      let buf = '';
      chars.forEach(function (t) {
        if (solo(t)) { if (buf) { segs.push({ t: buf, g: false }); buf = ''; } segs.push({ t: t, g: true }); }
        else buf += t;
      });
      if (buf) segs.push({ t: buf, g: false });
      let total = 0;
      segs.forEach(function (s) { total += s.g ? size : CV.measure(s.t, size, opt.bold); });
      let px = opt.align === 'center' ? x - total / 2 : (opt.align === 'right' ? x - total : x);
      segs.forEach(function (s) {
        const t = s.t;
        if (CV.GLYPHS[t]) {
          /* ⚠️ V1.0.6（父亲大人 09-24 反馈的原话：「消费的货币还是没有用现在的货币图标，
             **还是用的白色图标**」）——**根因就在这一行**：
             四个货币符号 V1.0.1 起走的是"自绘"这条支路，可这支的取色写死是**文字色**（--text 白），
             而"按货币专属色上色"那段逻辑只写在**下面 else 那一支**（fillText 那条路）——
             于是同一个符号：顶栏是彩色、**文案里永远是白的**（成长页 / 图鉴 / 商店 / 强化 / 结算…）。
             现在自绘这一支也先查货币色：是那四个货币就用自己的颜色，其余 GLYPHS 字（★ ♜ ⚔…）照旧用文字色。 */
          const gcol = (curHits && CV.CUR_COLOR[t]) ? CV.CUR_COLOR[t] : (opt.color || CV.C.text);
          CV.GLYPHS[t](c, px + size / 2, y, size, gcol); px += size;
        }
        else {
          const ta = c.textAlign; c.textAlign = 'left';
          const cc = (curHits && CV.CUR_COLOR[t]) ? CV.CUR_COLOR[t] : null;   // 货币符：用自己的颜色（单字成段时）
          if (cc) c.fillStyle = cc;
          c.fillText(t, px, y);
          if (cc) c.fillStyle = opt.color || CV.C.text;
          c.textAlign = ta; px += CV.measure(t, size, opt.bold);
        }
      });
      if (lsOk && opt.ls) { try { c.letterSpacing = '0px'; } catch (e) {} }
      return;
    }
    c.fillText(raw, x, y);
    if (lsOk && opt.ls) { try { c.letterSpacing = '0px'; } catch (e) {} }
  };
  CV.measure = function (str, size, bold) {
    /* V1.0.1（父亲大人："主页二级界面滑动很卡，成长、成就这些基本都很卡"）：
       `measureText` 是渲染里最贵的调用之一，而它**结果完全确定**（同字体同字号同文本 → 同宽度）。
       加一层缓存：滑动时同一页要重绘几十次，第二帧起就全是命中，几乎不再碰 measureText。
       上限 4000 条，超了整表清掉（不做 LRU —— 文本集合本来就有界，简单够用）。 */
    const _ck = (bold ? 'b' : '') + size + '|' + str;
    const _cv = _mwCache.get(_ck);
    if (_cv !== undefined) return _cv;
    const _ret = function (v) {
      if (_mwCache.size > 4000) _mwCache.clear();
      _mwCache.set(_ck, v);
      return v;
    };
    const c = CV.ctx;
    c.font = `${bold ? '600 ' : ''}${size}px ${CV.FONT}`;
    const raw = _md(str);
    if (CV.hasGlyph(raw)) {
      /* F6 #4：与 CV.text **同一套分段** —— 连续普通文字段整段量（一次 measureText），
         自绘字形按其字号宽走。两边口径一致，画出来的位置才不会和量出来的对不上。 */
      let w = 0;
      let buf = '';
      const flush = function () {
        if (!buf) return;
        const s = buf; buf = '';
        try { w += c.measureText(s).width || 0; } catch (e) { w += s.length * size * 0.9; }
      };
      Array.from(raw).forEach(function (t) {
        if (!t) return;
        if (CV.GLYPHS[t]) { flush(); w += size; return; }
        buf += t;
      });
      flush();
      return _ret(w);
    }
    try { return _ret(c.measureText(raw).width || 0); } catch (e) { return _ret(raw.length * size * 0.9); }
  };
  const _mwCache = new Map();
  /* V1.0.4 · R2（父亲大人 09-27 点单：「内存告警自救」）：
     文本测量缓存是**纯派生数据** —— 清了只是下一次多调几次 measureText，绝不丢玩家数据。
     告警时的清理入口收在这里（谁调见 `js/wx-cap.js`），别处不许直接动这张表。 */
  CV.dropTextCache = function () {
    /* V1.0.4 · S4：折行结果缓存与测量缓存同一性质（纯派生、可再生）—— 一起清，
       免得"内存告急清了测量表、折行表还涨着"（`wx-cap` 只调这一个口子）。 */
    const n = _mwCache.size + _wrapCache.size;
    _mwCache.clear();
    _wrapCache.clear();
    return n;
  };
  /* 圆角矩形（网页版 .card：bg #111621 / 边 #232b3b / 圆角 10） */
  CV.round = function (x, y, w, h, r, fill, stroke, lw) {
    const c = CV.ctx;
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  };
  /* 多边形填充：顶点是**归一化 0~1 坐标**（原点在左上角），传入框的左上角与边长。
     V1.0.1：五族形状语言（色 + 形双重编码）用 —— 顶点表在数据层 D.FACTION_GLYPH，
     网页版同一个表转成 <polygon points>。**别在这儿另写一套形状**，否则两端又会不一致。 */
  CV.poly = function (points, x, y, size, color) {
    if (!points || !points.length) return;
    const c = CV.ctx;
    c.beginPath();
    points.forEach(function (p, i) {
      const px = x + p[0] * size, py = y + p[1] * size;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    });
    c.closePath();
    c.fillStyle = color;
    c.fill();
  };
  CV.card = function (x, y, w, h, opt) {
    opt = opt || {};
    CV.round(x, y, w, h, opt.radius === undefined ? CV.RADIUS : opt.radius,
      opt.fill || CV.C.panel, opt.line === null ? null : (opt.line || CV.C.line));
    /* V9.6.10：网页版 .card 有一条 `inset 0 1px 0 #ffffff08` 的顶部高光 ——
       卡片"有厚度、不糊"的关键就是它；小游戏原来没画，所以整块看着是平的、笨的。 */
    if (opt.line !== null) {
      const r = Math.min(opt.radius === undefined ? CV.RADIUS : opt.radius, w / 2, h / 2);
      CV.ctx.save();
      CV.ctx.strokeStyle = CV.a(CV.C.white, .06); CV.ctx.lineWidth = 1;
      CV.round(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5), null, CV.a(CV.C.white, .06));
      CV.ctx.restore();
    }
  };
  /* ===== 品质框 v2（V1.1 · 视觉语言基准 §4.2）=====
     旧代码只有一道 round(...rarColor) 的描边；新方案把档位压在三个**不许数**的通道上：
       ① 整块档色（环 ＋ 铭牌底） ② 铭牌上直写档码（细读 / 色盲通道） ③ 亮牌 / 暗牌（MYTH 形差）
     铭牌画在画面下缘 24%（最矮 14px），上缘切平、下缘随框圆角，上唇 1px --line 把牌与画面切开。
     MYTH 反色（暗底金字）＋ 1px 金内环 —— 它与 SSR 橙 ΔE00 只有 7.5，只能靠"形"分家。 */
  CV.RAR_CODE = { N: 'N', R: 'R', SR: 'SR', SSR: 'SSR', UR: 'UR', MYTH: 'MYTH' };
  CV.qframe = function (x, y, w, h, rarity, radius, bandH) {
    const r = radius === undefined ? CV.RADIUS : radius;
    const rar = CV.RAR_CODE[rarity] ? rarity : 'N';
    const col = CV.C['r' + rar.toLowerCase()] || (rar === 'MYTH' ? CV.C.gold : CV.C.text2);
    const myth = (rar === 'MYTH');
    const bh = bandH === undefined ? Math.max(14 * CV.SCALE, Math.round(Math.min(w, h) * 0.24)) : bandH;
    const by = y + h - bh, br = Math.min(r, bh / 2, w / 2);
    CV.round(x, y, w, h, r, CV.C.panel2, col);                                  /* 画面 + 档色环 */
    if (myth) CV.round(x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 3), null, CV.C.gold);
    const c = CV.ctx;                                                           /* 铭牌：上缘切平 */
    c.beginPath();
    c.moveTo(x, by); c.lineTo(x + w, by);
    c.lineTo(x + w, y + h - br);
    c.arcTo(x + w, y + h, x + w - br, y + h, br);
    c.lineTo(x + br, y + h);
    c.arcTo(x, y + h, x, y + h - br, br);
    c.closePath();
    c.fillStyle = myth ? CV.C.bg2 : col; c.fill();
    c.strokeStyle = myth ? col : CV.C.line; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, by + 0.5); c.lineTo(x + w, by + 0.5); c.stroke();
    c.font = '700 ' + CV.FS.tag + 'px ' + CV.FONT;                              /* 档码字：唯一的可靠通道 */
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = myth ? col : CV.C.bg2;
    c.fillText(CV.RAR_CODE[rar], x + w / 2, by + bh / 2 + 0.5);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  };
  /* 文字截断：超宽加省略号（网页版的 text-overflow: ellipsis） */
  CV.fit = function (str, maxW, size, bold) {
    str = String(str == null ? '' : str);
    if (CV.measure(str, size, bold) <= maxW) return str;
    let out = str;
    while (out.length > 1 && CV.measure(out + '…', size, bold) > maxW) out = out.slice(0, -1);
    return out + '…';
  };
  /* 折行：按可用宽度断行（返回行数组，最多 maxLines 行，超出末行加省略号） */
  /* V1.0.4 · S4：折行结果缓存（key 见下；纯派生数据，内存告警时一起清 —— 见 dropTextCache）。
     返回的数组**冻结**：命中时是同一个对象，调用方只许读不许改（改了会污染后面所有人）。 */
  const _wrapCache = new Map();
  const _wrapStat = { hit: 0, miss: 0 };
  function wrapCached(k, v) {
    if (_wrapCache.size > 400) _wrapCache.clear();
    const f = Object.freeze(v);
    _wrapCache.set(k, f);
    return f;
  }
  /* 尺子读得到"命中了几次、真算了几次"（`soak_audit` 用它证明日志那一帧不再重折行） */
  CV.wrapStats = function () { return { hit: _wrapStat.hit, miss: _wrapStat.miss, size: _wrapCache.size }; };
  CV.wrap = function (str, maxW, size, maxLines) {
    /* V1.0.1（性能）：原来是"每加一个字就把**整行**重新测一遍" —— O(n²)，
       一段 50 字要 50 次 measureText，一页几十条就是几千次，而滑动时**每帧都重来**。
       改成逐字宽度**累加**（O(n)），配合 CV.measure 的缓存，滑动的开销基本归零。 */
    /* V1.0.4 · S4（父亲大人 09-27：「战斗时发烫」）：**折行结果也缓存**（key = 文本 + 宽度 + 字号 + 行数）。
        逐字累加仍是 O(字数)，而战斗日志卡**每帧**都要把那几行重折一遍 —— 同一段文本
        第二次起直接命中，只剩一次 Map 查找。文本有增删/换宽就自然换 key，不用手工失效。 */
    const _k = 'w' + size + '|' + maxW + '|' + (maxLines || 0) + '|' + str;
    const _hit = _wrapCache.get(_k);
    if (_hit !== undefined) { _wrapStat.hit++; return _hit; }
    _wrapStat.miss++;
    const chars = _md(str).split('');
    const lines = [];
    let line = '', w = 0;
    chars.forEach((ch) => {
      /* V1.0.6（忠告独立弹窗）：支持**硬换行** —— '\n' 处强制断行、不吃宽度。
         别的调用点传进来的串里没有 '\n'，行为与以前逐字一致。 */
      if (ch === '\n') { if (line) lines.push(line); line = ''; w = 0; return; }
      const cw = CV.measure(ch, size);
      if (w + cw > maxW && line) { lines.push(line); line = ch; w = cw; }
      else { line += ch; w += cw; }
    });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
      const keep = lines.slice(0, maxLines);
      keep[maxLines - 1] = CV.fit(keep[maxLines - 1] + (lines[maxLines] || ''), maxW, size);
      return wrapCached(_k, keep);
    }
    return wrapCached(_k, lines);
  };

  /* V1.0.6（父亲大人 09-24 反馈图 09）：**词级折行** —— CV.wrap 是逐字断的，
     「剩余时间 11小时51分　奖励 ◉ 9500 · ✦ 4300 · 异界征召令×1」这种串会在**数字中间**
     断开（截图里就是「✦ 43」/「0」），玩家读到的是两个错数。
     这里先在分隔符处切成词、按词贪心排；只有"整个词比一行还宽"才退回逐字断。
     断点字符（· / → / 空格 / 全角空格）**跟着前一个词走**，行尾不会只剩一个孤零零的「·」。 */
  CV.wrapTokens = function (str, maxW, size, maxLines) {
    const s = String(str == null ? '' : str);
    /* V1.0.4 · S4：与 CV.wrap 同一条缓存（战斗日志那一行每帧都要过这里） */
    const _tk = 't' + size + '|' + maxW + '|' + (maxLines || 0) + '|' + s;
    const _th = _wrapCache.get(_tk);
    if (_th !== undefined) { _wrapStat.hit++; return _th; }
    _wrapStat.miss++;
    const tokens = [];
    let tk = '', sepNext = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\n') { if (tk) tokens.push(tk); tokens.push('\n'); tk = ''; sepNext = false; continue; }
      /* 「→」「·」是**下一段的起头**：断点落在它们前面，并且**紧跟的那个空格跟着它们走** ——
         这样"分隔符 + 后面那一项"永远在同一个 token 里，行尾就不会挂着一个孤零零的
         「·」或「→」（page_text_audit 的"话没说完"那把尺子就是盯这个的）。 */
      if (ch === '→' || ch === '·') { if (tk) tokens.push(tk); tk = ch; sepNext = true; continue; }
      tk += ch;
      if (sepNext) { sepNext = false; continue; }      // 分隔符后面那个空格不再当断点
      if (ch === '\u3000' || ch === ' ') { tokens.push(tk); tk = ''; }
    }
    if (tk) tokens.push(tk);
    const lines = [];
    let line = '';
    tokens.forEach(function (t) {
      if (t === '\n') { if (line) lines.push(line); line = ''; return; }
      if (!line) { line = t; return; }
      if (CV.measure(line + t, size) <= maxW) line += t;
      else { lines.push(line); line = t; }
    });
    if (line) lines.push(line);
    /* 收尾：行尾不许挂着一个孤零零的「→」（"话没说完"那把尺子会报）——
       真有这种情况就把箭头挪到下一行去。 */
    for (let i = 0; i < lines.length - 1; i++) {
      const m = /→\s*$/.exec(lines[i]);
      if (m) { lines[i] = lines[i].slice(0, m.index); lines[i + 1] = '→ ' + lines[i + 1]; }
    }
    /* 兜底：某一行还是超宽（整段就是一个长词）→ 退回逐字折行，绝不画到框外 */
    const out = [];
    lines.forEach(function (ln) {
      if (!ln) return;
      if (CV.measure(ln, size) <= maxW) out.push(ln);
      else CV.wrap(ln, maxW, size).forEach(function (x) { out.push(x); });
    });
    if (maxLines && out.length > maxLines) {
      const keep = out.slice(0, maxLines);
      keep[maxLines - 1] = CV.fit(keep[maxLines - 1] + (out[maxLines] || ''), maxW, size);
      return wrapCached(_tk, keep);
    }
    return wrapCached(_tk, out);
  };

  /* ---------- 触摸命中区 ----------
     V9.5.93（父亲大人："小游戏功能点了没反应"）：命中区**分两套坐标系**，
     以前混在一起比，导致内容区的按钮判定整体偏移了一整条顶栏（点 A 触发 A 下面那个）。
       · 内容区（U.card / U.btn / 宫格…）：画在"内容游标"里，坐标从内容顶部算 → 'content'
       · 顶栏 / 底栏 / 确认弹窗：直接按屏幕坐标画 → 'screen'
     登记时带上坐标系，派发时各自换算，两边都不再错位。 */
  CV.hitMode = 'content';
  /* V9.6.95（自审：弹窗开着时点底栏居然能换页）：
     屏幕坐标的热区分两种 —— 顶栏 / 底栏 / 吸顶条是"平时就在那儿"的，
     而弹窗自己那两颗按钮是"模态"的。以前只有一个 screen 标记，于是弹窗打开时
     底栏照样能点（模态等于没挡住）。现在多一个 modal 标记，触摸层按它放行。 */
  /* ================= V1.1.12（0927-B · 交互复审）：**热区最小尺寸 ≥88rpx** =================
     父亲大人：「各个岗位整体再审查一遍，从数值到交互到UI都查一遍」——
     交互这一档《专业基准》写的硬指标就是 **热区 ≥88rpx（≈44pt）**。
     实测（三机型 × 全部 56 页）：**309 处热区一维不够、51 处两维都不够**
     （最典型：**每个页面的返回键 40×40**、选命格卡片 44×34、招募页「出率」40×40）——
     而在此之前**没有任何一把尺子量过热区尺寸**（尺子只看"有没有处理器"）。

     ⚠️ **不改画面**：那些按钮的视觉尺寸是排版定过的，动它会连带整页重排（320 短屏尤其危险）。
     做法＝**只把热区长到够**（视觉一个像素不动），并且加两道保护：
       ① 长完**夹进画布**（横向不越界；纵向屏幕坐标系不越底，内容坐标系允许在折线下方＝本来就要滚动才能点到）；
       ② **与已登记的热区撞上（两维都重叠 >2pt）就缩回原样** ——
          宁可这颗还是小的，也**绝不许造出"点 A 触发 B"**（那是历史上最难查的一类 bug，tap_audit 的
          "锚点覆盖"一节就是专门盯它的）。
     ⇒ 这条把**所有热区**都管住了：它们只有 `CV.hit` 这一个出口，以后新加的小按钮自动享受同一条。 */
  /* 88rpx ≙ 44pt（《专业基准》那条括注给的就是这个物理口径）。
     ⚠️ **不按屏宽重新换算**：画布端的按钮高度是**绝对 pt**（不随屏宽伸缩），
        而 88rpx 若按屏宽算，在 430 的屏上会变成 50.4pt —— 比物理基准更严，
        于是"同一颗按钮在大屏上反而不合格"这种荒唐结论会出现（实测：430 上多出 6 条假红）。 */
  function minHitPx() { return 44; }
  CV.minHitPx = minHitPx;
  /* ================= F7 ①b（0928 · 小屏配平的收尾）· 撑热区改成"往空的那一侧长" =================
     背景：F7 ① 把**视觉**按屏宽缩了（320 上 ≈0.82），控件高随之变矮（44→36 / 40→33）,
     热区仍要长到物理下限 44 —— 这是《专业基准》交互档那条，他没撤。
     原算法只会"**对称**往外撑"：撑完若与已登记的热区（两维都重叠 >2pt）撞上，就**整颗缩回原样**。
     小屏上同一列两行之间只隔 ~8px（39×0.82+8.2 ≈ 41 的节距），对称撑必然撞上一行 ——
     实测 320×568 上 **9 处**（设置页两个开关、炼化台三颗、队伍三颗预设、扫荡那颗）热区只剩 33/36 高，
     `layout_audit` ④ 当场报红；而它们**下面本来就有一大片空地**（下一行隔 70px 以上）。
     现在按"最小位移"依次试五个落位：居中 → 只往下长 → 只往上长 → 只往右长 → 只往左长，
     取第一个**不撞**的。撞的判据、夹进画布、幽灵热区豁免全部照旧 ——
     **"绝不造出『点 A 触发 B』"这条纪律不变**（兜底仍然是"缩回原样"）。
     做坏试验：把 cands 收成只剩第一条（只居中撑）→ layout_audit ④ 立刻回到 9 条红。 */
  /* ================= R1.2 · P1（父亲大人 2026-10-01 任务书点名）：热区碰撞的**空间索引** =========
     原来给小于 44px 的热区放大到 44 时，要在"五个候选落位"里找第一个不撞别人的：
       `free(nx, ny) = !CV.hits.some(o => …矩形相交 >2px…)`
     每个小热区最多试 5 个候选 ⇒ 一屏里 N 个小热区就是 O(5N) 次**全量扫描**（几百个热区时是几万次
     矩形相交，而且还会随"已登记数量"继续长）。
     现在按网格分桶，只查候选覆盖到的格子：
       · 这是**本轮登记的缓存**（跟着 `CV.hits` 换代重建），不是全局永久状态；
       · 两个矩形相交 ⇒ 必共享至少一个格子（轴对齐矩形 ＋ 规则网格的必然结论）⇒
         查到的集合是"可能相交的全部"的**超集**，判据仍旧照抄原来那一句 ⇒ 结果**逐条等价**。
     ⚠️ 只查**同一 screen 层**的桶（原来那句 `o.screen === screen` 就是只比同层）；
        `ghost`（屏外卡只量没画那一遍登记的锚点）照旧进索引、照旧被过滤掉。
     做坏试验：把 `hIdxNear()` 换回"直接返回整个 CV.hits" → 结果仍然对（超集变大），
     所以**等价性那一侧不做坏试验也稳**；真正会红的是"格子取错"（比如漏掉跨格的那个）——
     `hit_handler_audit` 里那份"索引版 vs 全量扫描版逐条比对"就是干这个的。 */
  const HIT_CELL = 48;
  let hIdx = null, hIdxChecks = 0, hIdxQueries = 0;
  /** 索引与 `CV.hits` 换代同步（换页会整支换掉数组；`.length = 0` 这种也认）。 */
  function hIdxSync() {
    const arr = CV.hits;
    if (!hIdx || hIdx.arr !== arr || hIdx.n > arr.length) {
      hIdx = { arr: arr, n: 0, cell: HIT_CELL, screen: new Map(), content: new Map() };
    }
    const c = hIdx.cell;
    while (hIdx.n < arr.length) {
      const o = arr[hIdx.n++];
      const m = o.screen ? hIdx.screen : hIdx.content;
      const xa = Math.min(o.x, o.x + o.w), xb = Math.max(o.x, o.x + o.w);
      const ya = Math.min(o.y, o.y + o.h), yb = Math.max(o.y, o.y + o.h);
      for (let gx = Math.floor(xa / c); gx <= Math.floor(xb / c); gx++) {
        for (let gy = Math.floor(ya / c); gy <= Math.floor(yb / c); gy++) {
          const k = gx + ',' + gy;
          let b = m.get(k);
          if (!b) { b = []; m.set(k, b); }
          b.push(o);
        }
      }
    }
    return hIdx;
  }
  /** 候选矩形可能相交的已登记热区（**超集**，去重）。 */
  function hIdxNear(nx, ny, nw, nh, screen) {
    const idx = hIdxSync();
    const m = screen ? idx.screen : idx.content, c = idx.cell;
    const seen = new Set();
    for (let gx = Math.floor(nx / c); gx <= Math.floor((nx + nw) / c); gx++) {
      for (let gy = Math.floor(ny / c); gy <= Math.floor((ny + nh) / c); gy++) {
        const b = m.get(gx + ',' + gy);
        if (!b) continue;
        for (let i = 0; i < b.length; i++) if (!seen.has(b[i])) seen.add(b[i]);
      }
    }
    hIdxChecks += seen.size;            // 给尺子读的：这一趟"看了几个矩形"（不短路计数）
    hIdxQueries++;                      // 给尺子读的：这一趟 = 一次候选碰撞检测
    return seen;
  }
  /** 尺子接口：本轮热区登记里，索引一共查过多少个矩形（与"全量扫描版"对照用）。 */
  CV.hitIndexStats = function () { hIdxSync(); return { hits: CV.hits.length, checks: hIdxChecks, queries: hIdxQueries, cell: HIT_CELL }; };
  CV.hitIndexReset = function () { hIdx = null; hIdxChecks = 0; hIdxQueries = 0; };
  CV.hit = function (id, x, y, w, h) {
    const screen = CV.hitMode === 'screen' || CV.hitMode === 'overlay';
    const modal = CV.hitMode === 'overlay';
    const min = minHitPx();
    const push = (nx, ny, nw, nh) => CV.hits.push({ id: id, x: nx, y: ny, w: nw, h: nh, screen: screen, modal: modal });
    if (w >= min - 0.5 && h >= min - 0.5) { push(x, y, w, h); return; }
    const dw = Math.max(0, min - w), dh = Math.max(0, min - h);
    const nw = w + dw, nh = h + dh;
    /* F6 #12：撞测跳过"幽灵热区"（屏外卡只量没画那一遍登记的）——
       它们不会被派发，就不该挡住别人的 44px 放大。 */
    /* 与原来那句**逐字同判据**（`>2` 的相交阈值、跳过 ghost、只比同层），
       只是候选集从"整个 CV.hits"换成"网格里可能相交的那几个"（见上面 hIdxNear 那段）。 */
    const free = (nx, ny) => {
      const near = hIdxNear(nx, ny, nw, nh, screen);
      let bad = false;
      near.forEach((o) => {
        if (bad || o.ghost || o.screen !== screen) return;
        if (Math.min(nx + nw, o.x + o.w) - Math.max(nx, o.x) > 2
          && Math.min(ny + nh, o.y + o.h) - Math.max(ny, o.y) > 2) bad = true;
      });
      return !bad;
    };
    const CAND = [[x - dw / 2, y - dh / 2], [x - dw / 2, y], [x - dw / 2, y - dh],
      [x, y - dh / 2], [x - dw, y - dh / 2]];
    for (let i = 0; i < CAND.length; i++) {
      const nx = Math.max(0, Math.min(CAND[i][0], CV.W - nw));
      let ny = Math.max(0, CAND[i][1]);
      if (screen) ny = Math.max(0, Math.min(ny, CV.H - nh));
      if (free(nx, ny)) { push(nx, ny, nw, nh); return; }
    }
    push(x, y, w, h);          /* 五个落位全撞：缩回原样（宁可这颗小，也不许造歧义） */
  };
  /* V9.6.108：这颗热区有没有处理器（精确 id 或前缀处理器）。
     "给引导当锚点"的整块区域（party_board / attr_card / stage_grid…）没有处理器 ——
     它们不该吃点击，否则会把手感全吃掉（点队伍空位却派发了 party_board → 上不了阵）。 */
  function hitHasHandler(h) {
    const id = String(h.id);
    if (CV.onAct[id]) return true;
    const i = id.indexOf(':');
    return i > 0 && !!CV.onAct[id.slice(0, i + 1) + '*'];
  }
  /* 屏幕坐标 → 内容坐标（含滚动） */
  CV.localY = function (py) { return py - (CV.TOP + 8) + (CV.scroll || 0); };
  CV.dispatch = function (id) {
    const fn = CV.onAct[id];
    if (fn) { fn(); return true; }
    /* 动态 id（装备 uid、道具 id 这类）：允许登记前缀处理器 'eqd:*'，
       命中时把冒号后面那段当参数传进去 —— 否则每画一件装备就得注册一个闭包。 */
    const i = String(id).indexOf(':');
    if (i > 0) {
      const pre = String(id).slice(0, i + 1) + '*';
      if (CV.onAct[pre]) { CV.onAct[pre](String(id).slice(i + 1)); return true; }
    }
    return false;
  };
  CV.onAct = {};
  CV.on = function (id, fn) { CV.onAct[id] = fn; };

  /* ---------- 页面栈（每次换页把滚动位置归零，和网页版换页一个手感） ---------- */
  CV.scroll = 0;
  CV.register = function (name, drawFn) { CV.panels[name] = drawFn; };
  /* 换页时把"页面级覆盖层"清掉 —— 否则结算层会跟着下一页一起被画出来（V9.6.1 修） */
  /* ================= V1.1.7（A7 · 滚动三态）=================
     父亲大人报过的两处现场（都在这一条上）：
       · 「进去二级界面和退出二级界面的位置感觉还是不太对，像**任务那里，每次领取完他就会回到最上面**，
          得再次下滑」→ **原地重画必须保位**（上一轮先把它治住了，这一轮收成规则）；
       · 「**从执灯者进去伙伴详情页是直接在最底下的**，得往上滑」→ **进新页必须归零**
          （真因：`char` 是**一个页名**、底下是 120 个伙伴，上一回从 A 的底部离开时记下 scroll=1200，
          再开 B 时那句"搬回这一页的记忆"把 1200 夹到 B 的 maxScroll → **一进去就在最底下**）。

     **三条规则（一处定义，所有列表页共享）**：
       ① **进新页 → 归零**：`reset`（换标签 / 重进）与 `push`（进二级页）一律 `scroll = 0`；
       ② **原地重画 → 保位**：`render()` **不碰** `CV.scroll`（只有"内容变短"时会夹回 `maxScroll`）；
       ③ **返回上一页 → 恢复**：`pop` 把当前页的位置记进 `scrollMemo`，再恢复上一层记下的位置。
     ⚠️ 与"引导把目标滚进视野"（V9.6.34 父亲大人要的）的接缝：**两者打架时以这三条为准** ——
        引导那只允许在"它自己第一次出现"时滚一次（见 uiw.js 的 `coachState.scrolled`），
        **不许在"进页那一帧"把刚归零的页面又拽走**。判据写在尺子里（`scroll_fit_audit` 的⑥⑦⑧）。 */
  /* ⚠️ 键是**栈深**（`CV.stack` 的下标），**不是页名** ——
     页名当键会漏一种真场景：**同一个页名连着压两层**（比如"背包 → 又进一次背包"、
     "伙伴详情 A → 伙伴详情 B"）。那时后压的那层"离开时位置 0"会把前一层的 121 覆盖掉，
     返回之后位置就丢了（`scroll_fit_audit` 的⑧就是拿这个 case 抓到的：bag>bag → pop 回来变 0）。
     键换成栈深之后，每一层各记各的，"返回恢复"才真的对得上"离开时那一层"。 */
  CV.scrollMemo = {};
  CV.reset = function (name, opts) {
    CV.stack = [{ name, opts: opts || {} }]; CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.pageHead = null; CV.grabCfg = null; CV.dropGrab();
    CV.scrollMemo = {};                      // 换标签＝从头看：整条栈的记忆一起清掉（键是栈深，清空才算干净）
    /* ================= F6 #2（抢修单 0928 · 底栏四格各记各的现场，原来**是死代码**）=================
     父亲大人 09-27 深夜（底栏切回来不丢位置）：「点下面的导航按钮又得重新进去界面重新找」。
     `CV.switchTab` 的写法是"切走时 saveTabMemo、切回来时还原"，可它兜底那一步**必定**调到这里 ——
     而这里原来写的是 `CV.tabMemo = {}`（**整表清空**）⇒ 还原分支永远为假 ⇒ 那条功能一次都没生效。
     实测（真代码 + 真触摸）：灯阁滑到底（scroll=741/741）→ 背包 → 灯阁 ＝ 回到 0/741；
     每次切完 `Object.keys(CV.tabMemo)` 都是空 `[]`。
     现在**只清自己这一格**：reset(name) 就是"把 name 这一格的路从新走"，
     别的三格各记各的现场（这正是 tabMemo 的语义）。"点当前那一格＝回这一格的家"不变 ——
     `switchTab` 里那条 `CV.cur === id → CV.reset(id)` 会把这个 tab 自己的记忆清掉。
     ⚠️ 与"每格 opts 可能已经对不上"的关系：作废由 `stackAlive()` 逐层查 `CV.panels` 把关
        （页面被改名/删掉就落回该 tab 首页），不靠"整表清空"这种一刀切。
     做坏试验（回单里有实测输出）：把这里改回 `CV.tabMemo = {};`
     → 证据探针里"灯阁滑到底 → 背包 → 灯阁"从 `760/760 ✓` 变成 `0/760 ✗`、`tabMemo` 键为空。 */
    if (name) CV.tabMemo[name] = null;
    CV.render();
  };
  /* ================= V1.1.17（父亲大人 09-27 深夜）· 底栏四格各记各的现场 =================
     原话：「点下面的导航按钮又得重新进去界面重新找，就交互上还是差点」。
     原来底栏那一格点下去走的是 `CV.reset(t.id)` —— 换页＝scroll 归零 + scrollMemo 清空，
     于是"在执灯者里翻到第 80 个伙伴 → 去背包 → 再切回执灯者"必然回到最上面。
     现在**每个 tab 记一份自己的现场**（整条栈 + 按栈深的滚动记忆 + 当前滚动量），
     切走时存、切回来时还原 —— 回到那个 tab ＝ 回到离开时的样子（含当时停在的二级页）。
     两条纪律（派单里点名的）：
       · **栈已经没有了就落回该 tab 首页**：还原前逐层查 `CV.panels[name]` —— 页面被改名/删掉
         （比如被"打扫"掉的那几页）就作废，宁可回首页，也不许画一个不存在的页；
       · **战斗 / 结算这种一次性页不许被记回来**（打完就结束）：存的时候把它们从栈里剔掉。
     ⚠️ 这里原来写着"注掉 `saveTabMemo(CV.cur)` → `scroll_fit_audit` ⑨ 立刻红" ——
        R7 复审实测**不成立**（⑨ 量的是"进更矮页不许被夹到底"，与 tabMemo 无关）。
        现在改挂到真能变红的那条：回单里的证据探针（注掉那行 → 切回来 scroll 从 760 变 0）。
     ⚠️ 键是**tab 名**（底栏四格），与 `CV.scrollMemo` 的键（栈深）是两回事，两份并存、各管一段。 */
  CV.tabMemo = {};
  /* 一次性页面：打完就结束，切 tab 时不许把它们记进"现场" */
  const ONESHOT_PAGES = ['battle', 'recruit_result'];
  function memoStack() {
    const out = [];
    CV.stack.forEach(function (lvl) {
      if (ONESHOT_PAGES.indexOf(lvl.name) >= 0) return;
      out.push({ name: lvl.name, opts: lvl.opts || {} });
    });
    return out;
  }
  function stackAlive(stk) {
    if (!stk || !stk.length) return false;
    return stk.every(function (lvl) { return !!CV.panels[lvl.name]; });
  }
  function saveTabMemo(tab) {
    if (!tab) return;
    CV.tabMemo[tab] = { stack: memoStack(), scrollMemo: Object.assign({}, CV.scrollMemo), scroll: CV.scroll || 0 };
  }
  CV.switchTab = function (id) {
    /* 点的是当前这一格＝"回到这一格的家"（与改前同一条行为）：清掉它的现场再走 reset。 */
    if (CV.cur === id) { CV.cur = id; CV.reset(id); return; }
    saveTabMemo(CV.cur);
    CV.cur = id;
    const m = CV.tabMemo[id];
    if (m && m.stack.length && m.stack[0].name === id && stackAlive(m.stack)) {
      CV.stack = m.stack.map(function (lvl) { return { name: lvl.name, opts: lvl.opts || {} }; });
      CV.scrollMemo = Object.assign({}, m.scrollMemo);
      CV.scroll = m.scroll || 0;             // 超出新内容高的部分由 render 里那一夹收回来
      CV.pageOverlay = null; CV.sticky = null; CV.pageHead = null; CV.grabCfg = null; CV.dropGrab();
      CV.render();
      return;
    }
    /* 这一格没有现场（第一次进来）／那条栈已经没有了 → 落回该 tab 首页 */
    CV.tabMemo[id] = null;
    CV.reset(id);
  };
  /* ---------- 长按抓起 · 拖动换位（V9.6.111） ----------
     父亲大人："小游戏队伍拖拽换位不了。"——以前这件事**根本没做**：
     sc-party 里写着"长按拖动在 canvas 上代价大，改成点格子选伙伴"，
     可引导和文案一直写着"长按抓起、拖到别处松手"，玩家照着做当然拖不动。
     现在补上，规则与网页版一致：
       · 长按 420ms 抓起（手指滑走＝在滚动，不算抓）；
       · 抓起后高亮那一格，手指压到哪一格就把它标成落点（写"放这里"）；
       · 松手落在别的格子＝换位（Core.swapPositions）；落回自己/空白＝原地放下；
       · 抓起状态下**也可以直接点目标格**（网页版同款：点一下即可换过去）。
     页面只要挂一份 CV.grabCfg：{ from(id)->下标, targetAt(p)->下标, drop(from,to) }。 */
  CV.grab = null;
  CV.grabCfg = null;
  CV.dropGrab = function () { CV.grab = null; };

  CV.push = function (name, opts) {
    CV.scrollMemo[CV.stack.length - 1] = CV.scroll || 0;      // 记住"当前这一层看到哪了"（键＝栈深）
    CV.stack.push({ name, opts: opts || {} });
    /* A7 ①（进新页归零）：这里原来读的是 `CV.scrollMemo[name] || 0` —— 那是"同一页名的上一次位置"，
       被不同内容复用时会跳到很远的地方（伙伴详情那一类：一进去就在最底下）。
       现在 push 一律归零；"恢复"只发生在 pop（退回上一页）那一条路。 */
    CV.scroll = 0;
    CV.pageOverlay = null; CV.sticky = null; CV.pageHead = null; CV.dropGrab(); CV.render();
  };
  CV.pop = function () {
    CV.scrollMemo[CV.stack.length - 1] = CV.scroll || 0;     // 离开这一层：记住它看到哪（键＝栈深）
    if (CV.stack.length > 1) CV.stack.pop();
    CV.scroll = CV.scrollMemo[CV.stack.length - 1] || 0;     // 回到上一层：**恢复它原来看到的位置**
    CV.pageOverlay = null; CV.sticky = null; CV.pageHead = null; CV.dropGrab(); CV.render();
  };
  /* V9.6.102（"新手指引和任务引导又走错乱了"）：从首页**直接跳**到某个子页 ——
     中间**不渲染首页**。goQuest 原来是 `CV.reset('home'); CV.push(dest)`，
     那一次首页渲染会把首页自己那条引导（"主线每一步做完都能领奖励"）登记下来，
     而玩家点「去完成」时正带着"这次必须再讲一遍"的开关 —— 于是抢在目标页前面冒出来，
     玩家看到的就是首页那句话，而不是这一步该讲的话（实测 27 步里 23 步串台）。 */
  CV.jump = function (name, opts) {
    CV.stack = [{ name: 'home', opts: {} }, { name: name, opts: opts || {} }];
    CV.scrollMemo = {};                      // 直接跳页＝新的一条路：按 A7① 归零，别带旧记忆
    CV.tabMemo = {};                         // 同上：这是一条全新的路，四格的旧现场一并作废
    CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.pageHead = null;
    CV.render();
  };
  CV.top = function () { return CV.stack[CV.stack.length - 1] || { name: 'home', opts: {} }; };

  /* ---------- 渲染一帧 ---------- */
  CV.render = function () {
    const c = CV.ctx;
    if (!c) return;
    /* ⚠️ V1.0.6（P0 · 提审驳回：真机"卡在此界面无法进一步游戏"）——渲染入口的最后一道闸。
       真机 console 的三条栈（`CV.splash` / `onShow → relayoutNow` / 又一次重排）**全部**落在这里：
       `CV.render → realmState → S.player`，而那时 `S` 还是 null
       （真机 `wx.onShow` 一注册就回调，跑在 game.js 的读档/建档之前；模拟器不会，所以本地不复现）。
       根因修法是把建档提到最前（game.js 顶部）；这一道是**兜底**：
       发现 null 就先读档/建档再画 —— 画面照常出来，**不是留一片空白**，
       并且 `ensureState()` 会 console.warn 出声（能自证：真机上看到那条 warn 就说明撞上了这条缝）。 */
    if (G.Core && G.Core.ensureState && !G.Core.S) G.Core.ensureState();
    CV.hits = [];
    if (CV.hitIndexReset) CV.hitIndexReset();      // R1.2 · P1：换页换的是数组，索引跟着换代
    /* ================= F6 #11（抢修单 0928 · `CV.hitMode` 帧首复位）=================
     `hitMode` 是**跨帧的全局状态**：登记热区的地方写着"设成 screen → 登记 → 还回 content"。
     那两句之间只要有一步抛错（页头右侧件 / 引导文案最容易犯），它就会**留在 screen**，
     下一帧起整页内容热区按屏幕坐标算 —— 表现就是"点哪儿都不对"，而且很难查。
     这里在**帧首无条件复位**：任何一帧都从 content 起画（下面各处照旧自己设、自己还）。
     ⚠️ 与各调用点的 try/finally 是两条互补的兜底（一个保证本帧之内还回去，一个保证下一帧干净）。 */
    CV.hitMode = 'content';
    CV.y = 0;
    /* 开局三步（欢迎 / 起名 / 选血统）时**不画顶栏和底栏**——
       网页版这时整块界面是隐藏的（没签契约看不到游戏界面，V9.5.23 定的），这里照做。 */
    /* 战斗页也是整屏接管：网页版战斗遮罩盖住了顶栏和底栏，这里同样不画标准顶栏/底栏，
       由战斗页自己画"标题 / 速度 / 撤离"那一条（V9.5.93）。 */
    /* V1.0.3：开机那几页（主画面 gate）都在名单里 ——
       它们排在**游戏开始前**，与开局三步同一档：不画顶栏/底栏
       （那两样本身就是"游戏界面"，游戏还没开始就不该出现）。
       V1.0.5：notice 那页已并进主画面 gate（父亲大人："两个弹窗可以不要，主画面…上面有个
       按钮写进入残域"）。
       V1.0.6：copyright（2.6.1 的著作权人专门页）整页删掉 —— 父亲大人 2026-09-23
       「著作权不要啊，个人的没有这个……等审核通过再说吧」；名单里一并去掉，不留空页名。 */
    const chromeless = ['gate', 'welcome', 'create', 'bloodline', 'battle'].indexOf(CV.top().name) >= 0;
    /* V1.1.4（2026-09-23 父亲大人："改完选血统那里滑动不了了" · P0）：
       `chromeless` 这一张名单只管一件事 —— **要不要画顶栏/底栏**（纯视觉）。
       可在下面算 `CV.maxScroll` 时，它被当成了第二件事用："一屏定版、不参与滚动"。
       两张名单**并不重合**，混用就把"选命格"一起锁死了：

         选命格页内容是**六张卡纵向排开**（V9.6.96 的注释写着"六张卡纵向排开要滚很远"），
         contentH 比可视高度高出 190~720px（随机型），这一页**本来就靠滚**。
         实测（探针：假 canvas + 真 CV.render）：
           390×844：内容 1081 · 可视 758 · 本该有 333px 可滚 → 实际 maxScroll ＝ **0**
           320×568：内容 1244 · 可视 526 → 实际 0；430×932：内容 1081 · 可视 890 → 实际 0
         表现就是父亲大人那句"滑动不了了"：**手指能拖，页面纹丝不动**，
         后四张命格永远点不到（每一张卡的「觉醒」还在卡里）。

       所以这里把两件事拆开：
         · `chromeless` ＝ 不画顶栏/底栏（**名单不动**，视觉口径保持原样）；
         · `SCROLL_LOCKED` ＝ 真正"一屏定版、位置按窗口高算死、不许滚"的那几页 ——
           目前**只有战斗页**（敌方两排 / 我方两排 / 撤离速度 / 战斗日志都是按 H 算死的，
           V1.0.1 父亲大人报"战斗界面能上下滑动"要的就是它不滚）。
       其余页面（含开局三步）一律按内容自然算：不到一屏 → 自然是 0（V9.6.7 那条不许
       "还能多拉一截"的口径不变），超过一屏 → 该滚就滚。

       尺子：scripts/scroll_fit_audit.js —— 「内容高过一屏 ⇒ maxScroll 必须 > 0」逐页断言，
       并且在选命格页真跑一遍触摸拖拽（滚得动、到得了底、第六张卡点得到）。 */
    const SCROLL_LOCKED = ['battle'];
    const scrollLocked = SCROLL_LOCKED.indexOf(CV.top().name) >= 0;
    /* V9.6.29（父亲大人："战斗撤离后出来的界面，下面的导航栏出画了"）：
       战斗页是整屏接管，会把 NAV_H 清成 0；但**以前只有清、没有恢复** ——
       于是打完/撤离回到普通页，底栏还按 H-0 画，整条掉到屏幕外。
       现在非 chromeless 一律恢复成基准值。 */
    if (chromeless) { CV.TOP = CV.safeTop; CV.NAV_H = 0; }
    else { CV.NAV_H = CV.NAV_BASE || (62 * CV.SCALE); }
    /* V9.6.90（父亲大人："底部导航栏出画，刚开始不会，点几下就出画了"）：
       画布变换**每帧显式归位**，不再依赖开机那一次 scale()。
       微信在窗口尺寸变化 / 键盘弹出 / 切前后台时会**重设主画布**，重设会清掉 ctx 的全部状态
       （变换、裁剪、线宽…）。那时候界面就会按 1/dpr 画，底栏整条被推出画面 ——
       而且"点几下才犯"（正好点了要弹键盘的输入框）。现在从根上不成立。 */
    try { c.setTransform(CV.DPR, 0, 0, CV.DPR, 0, 0); } catch (e) {}
    c.save();
    try {
    /* V9.6.10（父亲大人："整体画面笨重、没网页版精致"自审）：
       网页版 #app 是 `linear-gradient(180deg, --bg2, --bg)`（上略亮、下压暗），
       小游戏原来是一块平色 —— 平色在手机上会显得糊、重。照网页版铺一层竖向渐变。 */
    const bgGrad = c.createLinearGradient(0, 0, 0, CV.H);
    bgGrad.addColorStop(0, CV.C.bg2); bgGrad.addColorStop(1, CV.C.bg);
    c.fillStyle = bgGrad;
    c.fillRect(0, 0, CV.W, CV.H);
    /* 页面底图（V1.1.3）：有些页要一张**整屏的底**（现在只有"选命格"＝主视觉的背影）。
       画在背景色之后、内容与顶栏之前，而且是**屏幕坐标**（不受内容层的裁剪/滚动影响）。
       页面自己用 CV.veilPage('页面名', 画法) 登记一次，渲染时按当前页名取。 */
    {
      const veil = CV.veils && CV.veils[CV.top().name];
      if (veil) { try { veil(c); } catch (e) {} }
    }
    c.translate(Math.round((CV.pxW - CV.W) / 2), 0);
    c.beginPath(); c.rect(0, 0, CV.W, CV.H); c.clip();
    if (CV.top().name === 'battle') CV.battleHead((CV.top().opts && CV.top().opts.title) || '战斗');
    else if (!chromeless) CV.topbar();
    c.save();
    /* 内容层再包一层 try/finally：任何一页画到一半抛错（改文案、改数据最容易犯），
       也要把"裁剪 + 位移"还回去 —— 否则这一帧脏掉的坐标系会留在共享 ctx 上，
       下一帧从脏坐标起画，越点越偏、底栏整条跑出画面（V9.6.90）。 */
    try {
      c.beginPath(); c.rect(0, CV.TOP + 8, CV.W, CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8); c.clip();
      c.translate(0, CV.TOP + 8 - (CV.scroll || 0));
      CV.y = 0;
      /* 父亲大人 09-27 深夜：吸顶顶栏**每一帧由当前这一页自己登记** ——
         先清空再画内容，于是"有顶栏的页"和"没顶栏的页"互相不会串台
         （从二级页返回首页时，首页不调 U.pageHead，那条顶栏就不会留在屏幕上）。 */
      CV.pageHead = null;
      const fn = CV.panels[CV.top().name];
      if (fn) fn(CV.top().opts);
      /* V9.6.30：引导气泡集中在这里挂 —— 页面画完、CV.hits 已经齐了，查表就知道该给哪颗按钮做引导。 */
      if (G.coachFor) G.coachFor(CV.top().name);
    } finally {
      /* 内容总高：游标在通用件里（U.y），以前这里读的是 CV.y —— 那个变量在渲染时被归零后
         再没人写过，于是 contentH 恒等于 20、maxScroll 恒为 0，**滚动等于没有**（V9.5.93 修）。 */
      CV.contentH = ((G.U && G.U.y) || CV.y || 0) + 20;
      c.restore();
    }
    /* 内容画完才知道总高：把滚动量夹回合法范围（换页 / 状态变化后内容变短也要收回来）。
       V9.6.7（父亲大人："能一屏显示就一屏显示，不要还能上下拉一点的，很别扭"）：
       以前不管内容多高都额外加一段 CV.SP[1] 的下留白，于是**刚好铺满一屏**的页面
       （深井就是）也还能被拉动十来像素。现在只有内容真的超出一屏才给那点留白。 */
    /* V1.0.1（父亲大人："现在战斗界面可以上下滑动，你调整一下，不要上下滑动"）：
       真因 —— 战斗页（以及开局那几页）是 **chromeless、根本不画底栏**，
       可这里算"可视高度"时**照样减了一个 NAV_H**，于是凭空多出约 54px 的可滚空间，
       页面就能上下拉动。无底栏的页面不该减它。 */
    const viewH = CV.H - CV.TOP - (chromeless ? 0 : CV.NAV_H) - CV.safeBottom - 8;
    const bottom = CV.contentH - 20;        // contentH 里那 20 是给"滚到底"留的尾白，量的时候要减掉
    /* V1.0.1（父亲大人："现在战斗界面可以上下滑动，你调整一下，不要上下滑动"）：
       战斗页是**一屏固定版面** —— 里面每一个元素（敌方两排 / 我方两排 / 撤离速度 /
       战斗日志）的位置都是按窗口高度算死的，本来就不该参与滚动，可滚量恒 0。
       V1.1.4 更正：这里以前判的是 `chromeless`，而那张名单里还带着"选命格"（见上面 SCROLL_LOCKED
       那段）—— 于是**该滚的那一页被一起锁死了**。现在只锁真正的一屏定版页。 */
    CV.maxScroll = scrollLocked ? 0 : (bottom <= viewH ? 0 : (bottom - viewH + CV.SP[1]));
    /* A7 ②（原地重画保位）：**这是 `render()` 里唯一允许碰 `CV.scroll` 的地方，而且只"夹"不"重置"** ——
       内容变短了就把超出的部分夹回来，其余情况一律保持玩家当前看到的位置。
       任何"重画一次就跳回去"的毛病，根因都在别处（引导自动滚动见 uiw.js；换页见上面的三态）。 */
    if (CV.scroll > CV.maxScroll) { CV.scroll = CV.maxScroll; }
    /* 吸顶条（背包的三大标签）：画在**内容裁剪之外 + 屏幕坐标**里，所以不跟着滚动。
       页面自己负责把内容从它下面开始排（U.y 先让出它的高度）。
       位置在顶栏之下、底栏之上，画在内容之后 → 内容从它下面滚过去。 */
    /* 二级页顶栏（标题 + 返回）也走这一趟：先画它，页内自己的吸顶条（背包标签那种）再叠在下面。 */
    if (CV.pageHead) CV.drawPageHead();
    if (CV.sticky) CV.sticky();
    if (!chromeless) CV.navbar();
    if (G.U && G.U.drawOverlay) G.U.drawOverlay();     // 确认弹窗画在最上面（通用件 U）
    /* V9.6.95：弹窗开着的时候**不画引导气泡** ——
       以前顺序反了（引导画在弹窗上面），玩家看到的是"引导压在确认框上"，
       点确认又会被引导吃掉（同一个病根：没把弹窗当成更高一层的模态）。 */
    if (G.U && G.U.drawCoach && !G.U.overlay) G.U.drawCoach();   // 引导气泡（首次操作提示，V9.6.27）
    /* 页面级覆盖层（战斗结算这类"整屏一幕"）：**必须在内容裁剪之外**画 ——
       V9.6.1（父亲大人："结算内容也得在画面中间"）：以前结算画在内容层里，被顶栏下移、还跟着滚动，
       既不在正中、命中区也整体偏下（"收下奖励并返回"因此点不动）。 */
    if (CV.pageOverlay) CV.pageOverlay();
    /* 游戏圈入口（V1.0.4）：微信的原生游戏圈按钮不在 canvas 上，位置只能靠这里逐帧摆
       （谁登记的见 js/sc-gameclub.js）。放在内容画完之后 —— 它读的是这一帧刚登记好的位置。 */
    /* 原生按钮层（V1.0.4 起是**多颗**：游戏圈 ＋ 意见反馈）—— 统一走 G.NativeTick，
       它内部逐个 try（见 js/sc-gameclub.js）。没有这一层时退回旧的单颗入口，
       这样"只加载了 gameclub 模块"的旧链路（尺子的假环境）也照旧能跑。 */
    if (G.NativeTick) { try { G.NativeTick(); } catch (e) {} }
    else if (G.GameClub) { try { G.GameClub.tick(); } catch (e) {} }
    CV.drawToasts();
    /* 最顶层覆盖（V1.1.3）：开机首屏走这里 —— 它要盖住**一切**（包括 toast），
       因为它代表的是"游戏还没开机完成"。见 js/sc-splash.js。 */
    if (CV.topOverlay) { try { CV.topOverlay(); } catch (e) {} }
    } finally {
      /* 外层的还原也必须无条件执行（顶栏 / 吸顶条 / 覆盖层任何一处抛错都不能把坐标系留给下一帧） */
      c.restore();
    }
  };

  /* ================= V1.0.4 · S2（父亲大人 09-27：「主要还是战斗的时候」发烫）=================
     **局部重画**：只把屏幕上一块矩形按"整帧同一套口径"重画一遍。
     为什么要有它：战斗的飘字/受击那一帧**真正在动的只有战场那一片**（单位卡 + 飘字），
     可原来那一帧走的是 `CV.render()` —— 连日志折行、撤离/加速、顶栏、整屏渐变底都白画一遍
     （每秒 18 次）。这里把"只重画一块"这条路开出来，画法与整帧**共用同一套**变换：
       · DPR 归位 → 背景渐变（只铺这块矩形，不是整屏）→ pxW 居中 → 裁剪到这块矩形 → 内容位移；
       · 只调 `drawFn`，**不碰** CV.hits / 顶栏 / 底栏 / 吸顶条 / 弹窗 / toast。
     安全前提（调用方保证）：只在这块矩形里画东西、且不登记热区。目前唯一调用方是
     `js/sc-battle.js` 的 `fxPaint()`（战斗动效帧），它在开画前自己确认"战斗页在最上面、
     没有弹窗、没有结算层"。矩形用**屏幕坐标**（与命中区同一套，见 CV.hitMode 那段）。 */
  CV.renderPatch = function (rect, drawFn) {
    const c = CV.ctx;
    if (!c || !rect || !(rect.w > 0) || !(rect.h > 0)) return false;
    try { c.setTransform(CV.DPR, 0, 0, CV.DPR, 0, 0); } catch (e) {}
    c.save();
    try {
      /* 背景：与整帧那条竖向渐变**同一条**（只铺这块矩形；渐变对象在同一个 user space 里定义，
         所以这一块的颜色与整帧画出来的那块完全一致，接缝看不出来）。 */
      const bg = c.createLinearGradient(0, 0, 0, CV.H);
      bg.addColorStop(0, CV.C.bg2); bg.addColorStop(1, CV.C.bg);
      c.fillStyle = bg;
      c.fillRect(rect.x, rect.y, rect.w, rect.h);
      c.translate(Math.round((CV.pxW - CV.W) / 2), 0);
      c.beginPath(); c.rect(rect.x, rect.y, rect.w, rect.h); c.clip();
      c.translate(0, CV.TOP + 8 - (CV.scroll || 0));
      if (drawFn) drawFn(c);
    } finally {
      c.restore();
    }
    /* 尺子用：这一帧是"局部重画"（`soak_audit` 用它证明飘字帧不再整页重画） */
    CV.patches = (CV.patches || 0) + 1;
    return true;
  };

  /* ---------- 顶栏（照网页版 #topbar：玩家行 + 货币行） ----------
     网页版数值（css/style.css）：
       .player-row  padding: sp2(10) 12 sp1(4)，gap sp2(10)；.pname 15 粗体；.plv 11 金色 + 描边；
                    .genelock 11 红字（铭刻名）
       #curbar      padding: 2px 12px sp2(10)，gap 0.375rem(6)
       .cur-chip    min-height 2.5rem(**40px**)、padding 5px 11px、radius 7、字号 12、gap 5
     小游戏原来把胶囊画成 30px 高、左边距 14 —— 比网页版矮一截、还往外偏 2px（V9.5.93 修）。 */
  CV.topbar = function () {
    const c = CV.ctx, S = (G.Core && G.Core.S) || null, D = G.DATA;
    const top = CV.safeTop;
    const ROW_H = 34, CHIP_H = 40, BAR_TOP = 2, BAR_BOTTOM = 10;
    const h = top + ROW_H + BAR_TOP + CHIP_H + BAR_BOTTOM;
    CV.TOP = h;
    c.fillStyle = CV.a(CV.C.bg, .94);
    c.fillRect(0, 0, CV.W, h);
    c.strokeStyle = CV.C.line; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h - .5); c.lineTo(CV.W, h - .5); c.stroke();
    const PAD = 12 * CV.SCALE;                       // 网页版顶栏左右 0.75rem
    /* V9.6.90（技能《weixin-game》§布局：右上角是**系统胶囊按钮区**，约 87×44）：
       小游戏右上角永远压着微信那颗「···」胶囊，顶栏这一行的文字不能顶到它下面去。
       名字 + Lv + 铭刻名整行都按这个右边界收着写。 */
    const CAPSULE_W = 87 * CV.SCALE;
    const ROW_RIGHT = CV.W - PAD - CAPSULE_W;
    const lv = (S && S.player.level) || 0;
    const ny = top + 10 * CV.SCALE + 10 * CV.SCALE;   // 行内中线
    /* Lv. 胶囊：网页版 .plv（金色描边 + 圆角 7 + 左右 6px） */
    const lvTxt = 'Lv.' + lv;
    const lw = CV.measure(lvTxt, CV.FS.sm) + 12 * CV.SCALE;
    /* 名字最长 12 个字，得先按"胶囊让开后的可用宽度"截断（不然长名字会钻到系统胶囊底下）。
       V1.0.4 · V：名字**只从 `Core.charName('@player')` 取**（这里原来直接读 S.player.name，
       是第二份来源）—— 以后榜单 / 日志也走同一个口子，展示层只有一处认名字。 */
    const name = CV.fit((G.Core && G.Core.charName && G.Core.charName('@player')) || '执灯者',
      ROW_RIGHT - PAD - lw - 20 * CV.SCALE, CV.FS.f1, true);
    CV.text(name, PAD, ny, { size: CV.FS.f1, bold: true });
    const nw = CV.measure(name, CV.FS.f1, true);
    CV.round(PAD + nw + 10 * CV.SCALE, ny - 8 * CV.SCALE, lw, 16 * CV.SCALE, CV.RADIUS_SM, null, CV.a(CV.C.gold, .4));
    CV.text(lvTxt, PAD + nw + 10 * CV.SCALE + lw / 2, ny, { size: CV.FS.sm, color: CV.C.gold, align: 'center' });
    /* 铭刻名（网页版 .genelock：11px 红字，只在解锁后出现） */
    if (S && S.player.geneLock > 0 && D && D.GENE_LOCKS && D.GENE_LOCKS[S.player.geneLock - 1]) {
      const gt = '铭刻·' + D.GENE_LOCKS[S.player.geneLock - 1].name;
      CV.text(CV.fit(gt, ROW_RIGHT - (PAD + nw + 10 * CV.SCALE + lw + 10 * CV.SCALE), CV.FS.sm), PAD + nw + 10 * CV.SCALE + lw + 10 * CV.SCALE, ny,
        { size: CV.FS.sm, color: CV.C.accent });
    }
    /* 货币行（V9.6.134，父亲大人：「要不砍成 4 种？这样刚好顶部标签那里放得下」）：
       货币只剩四种 → **四种全放**，不再藏哪一种，一眼看完自己有什么。
       原来那颗「▤ 全部货币」一并去掉：点**任意**货币胶囊本来就会打开货币图鉴
       （含全部四种的用途与来源），那颗按钮跟它同一个功能，留着只是占位置。 */
    const cur = (S && S.cur) || {};
    const fmt = G.fmt || ((n) => String(n));
    const main = (D ? D.CURRENCIES : []).slice();
    let x = PAD;
    const cy = top + ROW_H + BAR_TOP;
    /* V1.0.5（UI 设计师 1.0.2 复审 · 两端对表第 2 条 "顶栏货币条"）：
       **四等分等宽**，与网页版 #curbar 同一套（grid-auto-columns: 1fr，gap 0.375rem）。
       原来是"按内容宽、只给一个上限"—— 四颗宽度各不相同、右端参差不齐，
       数值一长还会各自顶到上限，跟网页版那条整整齐齐的格子对不上。
       现在每颗先占死 1/4，内容（图标 + 数值）在格内**居中**（.cur-chip 是 justify-content:center），
       数值放不下就缩到四级、再放不下才省略号（点开货币图鉴看准确值，与网页版同口径）。 */
    const CHIP_GAP = 6 * CV.SCALE;                        // .curbar gap 0.375rem
    const CHIP_W = (CV.W - PAD * 2 - CHIP_GAP * 3) / 4;   // 四等分（PAD = .curbar 左右 0.75rem）
    const chip = function (label, icon, color, dim, dashed) {
      const ww = CHIP_W;
      CV.round(x, cy, ww, CHIP_H, CV.RADIUS_SM, CV.C.panel, dashed ? CV.C.line2 : CV.C.line);
      const pad = 8 * CV.SCALE;                           // .cur-chip padding 左右 0.5rem
      const iw = icon ? CV.measure(icon, CV.FS.md) : 0;
      const iGap = icon ? 5 * CV.SCALE : 0;               // .cur-chip gap 0.3125rem
      const room = ww - pad * 2 - iw - iGap;
      const numSize = CV.measure(label, CV.FS.md) <= room ? CV.FS.md : CV.FS.sm;
      const txt = CV.fit(label, room, numSize, true);
      /* 内容整块居中；格子再窄也至少留出左内边距，不会贴边 */
      let tx = x + Math.max(pad, (ww - (iw + iGap + CV.measure(txt, numSize, true))) / 2);
      /* V9.6.134：图标也用货币表里的**专属色**（以前统一是白字，四种币看着一模一样） */
      if (icon) { CV.text(icon, tx, cy + CHIP_H / 2, { size: CV.FS.md, color: color || CV.C.text }); tx += iw + iGap; }
      CV.text(txt, tx, cy + CHIP_H / 2, { size: numSize, color: dim ? CV.C.dim : CV.C.text, bold: true });
      x += ww + CHIP_GAP;
      return ww;
    };
    /* 每一颗胶囊都登记热区 → 点它打开货币图鉴（V9.6.7 补的那条规矩，
       现在从"只有最后一颗能点"扩到"四颗都能点"）。 */
    CV.hitMode = 'screen';
    /* F6 #11：设了再还的写法一律 try/finally（中间抛错也不许把 hitMode 留在 screen） */
    try {
      main.forEach((cc) => {
        const x0 = x;
        const w = chip(fmt(cur[cc.id] || 0), cc.icon, cc.color, false, false);
        CV.hit('cur:' + cc.id, x0, cy, w, CHIP_H);
      });
    } finally { CV.hitMode = 'content'; }
  };

  /* ---------- 底栏（V1.0.6：**纯文字**，与网页版一致） ----------
     这里原来有一套 navIconGray()：把四个页签 emoji 画到离屏画布上逐像素降饱和，
     好对齐网页版 .nav-item .ico 的 filter: grayscale(.55) opacity(.8)。
     V1.0.6（父亲大人 2026-09-24：「现在底部导航栏不对吧」）底栏改成纯文字之后，
     它连同缓存一起删掉：网页版 navbarHtml() 自 V8.1「界面改纯文字（照参考图）」起就没有图标，
     .nav-item .ico 那条 CSS 是那时候留下的死规则 —— 画布端照着做才叫两端一致。
     将来若真要两端同一套矢量图标，新图标是自绘的、颜色由我们给（选中金 / 未选 dim），
     也用不上这种降饱和补丁。 */

  /* ---------- 底栏（照网页版 #navbar：四格，选中金色） ---------- */
  /* ================= V1.1.17（父亲大人 09-27 深夜 · 派单 Z-B）· 二级页顶栏吸顶 =================
     原话：「每一屏的标题和返回键都固定在顶部吧，不然有时候要点返回又得滑回去」。
     做法**照背包三大标签那条吸顶条**（CV.sticky）——同一套，不另起炉灶：
       · 页面在正文开头调 `U.pageHead('标题')` 登记一次，并把正文从它下面开始排（U.y 先让出高度）；
       · 这里在**内容画完之后**、按**屏幕坐标**把它画一遍 —— 所以它不跟着滚动；
       · 底上必须铺一层**与整屏同一条的渐变**：正文从下面滚上来时要不透光
         （CV.sticky 那句注释："不能用平色，平色会显出一条接缝"）；
       · 返回键的热区用**屏幕坐标**登记（CV.hitMode='screen'）——
         它是固定不动的，不许像正文那样按 `CV.localY` 随滚动量换算。
     做坏试验：把 `if (CV.pageHead) CV.drawPageHead();` 注掉 → 二级页滚到底时返回键随内容滚走，
     `scroll_fit_audit` ⑧⑨ 报红。 */
  CV.headH = function () { return (CV.pageHead && CV.pageHead.h) || 0; };
  CV.drawPageHead = function () {
    const ph = CV.pageHead;
    if (!ph || !G.U) return;
    const c = CV.ctx, U = G.U;
    const y0 = CV.TOP + 8, h = ph.h;
    /* 整段（底 + 返回键 + 标题）都在**屏幕坐标**里画 —— `CV.hitMode='screen'` 一直保持到收尾，
       尺子（inset_audit / layout_audit）据此把这一层和"按内容坐标排的正文"分开比，不混算。 */
    const prevMode = CV.hitMode;
    CV.hitMode = 'screen';
    /* F6 #11：这一整段都在屏幕坐标里，中间任何一处抛错都不许把 hitMode 留在 screen。
       原来"设了再还"的两句之间夹着画底、画返回键、画标题 —— 已改成 try/finally 包住。 */
    try {
    const bgGrad = c.createLinearGradient(0, 0, 0, CV.H);
    bgGrad.addColorStop(0, CV.C.bg2); bgGrad.addColorStop(1, CV.C.bg);
    c.fillStyle = bgGrad;
    /* 连顶栏下那 8px 一起盖住，再往下多铺一条**呼吸带**（`CV.HEAD_GAP`）——
       F8 ②：正文滚上来时不该贴着返回键的下沿。正文起点也同步让位（uiw.js 的 `U.pageHead`）。 */
    c.fillRect(0, CV.TOP, CV.W, 8 + h + (CV.HEAD_GAP || 0));
    U.btn(U.pad(), y0, 40 * CV.SCALE, h, '‹', 'ghost', ph.backId);
    if (ph.right) { try { ph.right(U.pad() + U.cw() - 40 * CV.SCALE, y0, h); } catch (e) {} }
    CV.text(ph.title, U.pad() + U.cw() / 2, y0 + h / 2,
      { size: CV.FS.f2, bold: true, align: 'center', color: ph.color || CV.C.text });
    } finally { CV.hitMode = prevMode; }
  };

  CV.navbar = function () {
    const c = CV.ctx;
    const h = CV.NAV_H + CV.safeBottom;
    const y = CV.H - h;
    c.fillStyle = CV.a(CV.C.bg2, .98);
    c.fillRect(0, y, CV.W, h);
    const tabW = CV.W / CV.NAV_TABS.length;
    CV.NAV_TABS.forEach((t, i) => {
      const cx = tabW * i + tabW / 2;
      const active = CV.top().name === t.id || (CV.top().name === 'home' && t.id === 'home');
      /* V1.0.6（父亲大人 2026-09-24 拍板「B，收口」）：图标回来了，但**形状来自 data.js 一处**
         （NAV_ICONS）—— 自绘矢量、颜色由我们给，所以不需要 emoji 那套降饱和补丁：
         选中金 / 未选 dim，与网页版 `.nav-item{color:--dim} .active{color:--gold}` 同一条规则。
         版式照旧（图标在上、标签在下），热区/台阶/红点一行没动。 */
      CV.drawIcon(CV.iconOps('nav', t.id), c, cx, y + 22 * CV.SCALE, CV.ICO, active ? CV.C.gold : CV.C.dim);
      CV.text(t.name, cx, y + 42 * CV.SCALE, { size: CV.FS.sm, align: 'center', color: active ? CV.C.gold : CV.C.dim });
      /* V9.6.145（"再审一遍"抓到的两边不一致）：网页版底栏有**红点**（主页=挂机有待领、
         背包=待领箱里有东西），小游戏这边**一个点都没画** —— 玩家在小游戏里看不出
         "有东西等你处理"。这里照网页版 navbarHtml 的同一套规则补上（一处判定都不另写）：
           · 主页：挂机攒够 5 分钟（和网页版 idleClaimable() 同一个门槛）
           · 背包：待领箱里有东西（stashCount() > 0）
         执灯者那格**不点**——网页版 V9.5.67 专门删过（那格没有"待领"的东西，纯误报）。 */
      let dot = false;
      if (t.id === 'home') dot = ((G.Core.S && (G.Core.idleBankGains() || {}).seconds) || 0) >= 300;
      else if (t.id === 'bag') dot = ((G.Core.stashCount && G.Core.stashCount()) || 0) > 0;
      if (dot) {
        c.fillStyle = CV.C.accent;
        /* 位置照网页版 `.nav-item .dot`：**图标的右上角**（top 0.5rem、靠右 18px），
           直径 0.4375rem ≈ 7px；颜色是 var(--accent)（两边同一个红）。 */
        c.beginPath(); c.arc(cx + 16 * CV.SCALE, y + 13 * CV.SCALE, 3.5 * CV.SCALE, 0, Math.PI * 2); c.fill();
      }
      if (active) {
        c.fillStyle = CV.C.gold;
        c.fillRect(cx - 13, y, 26, 2);          // 网页版 .nav-item.active::before：1.625rem × 2px
      }
      CV.hitMode = 'screen';
      CV.hit('tab:' + t.id, tabW * i, y, tabW, h);
      CV.hitMode = 'content';
    });
  };

  CV.drawToasts = function () {
    if (!CV.toasts.length) return;
    const t = CV.toasts[0];
    const w = Math.min(CV.W - 40, CV.measure(t.msg, CV.FS.lg) + 32);
    const x = (CV.W - w) / 2, y = CV.TOP + 12;
    CV.round(x, y, w, 34, CV.PILL,  CV.a(CV.C.shade, .85), CV.C.line);
    CV.text(t.msg, CV.W / 2, y + 17, { size: CV.FS.lg, align: 'center' });
  };
  /* V9.6.90：加了时长参数（网页版 toast(msg, ms) 同款）——
     退款说明这类长句子 1.6 秒根本读不完。 */
  /* ================= F6 #7（抢修单 0928 · toast 定时器互踩）=================
     原来每个 toast 各起一个 setTimeout，超时回调**整段清空** CV.toasts ——
     于是短 toast 的定时器会把后来那条长 toast 提前擦掉。
     实测：toast(A,900) 之后 200ms 再 toast(B,3000) → t≈1.1s 时 toasts 已空，B 只活了 1 秒。
     现在：句柄存下来、新的进来先 clearTimeout；超时回调里再比对一次"当前这条是不是我这一条"，
     只清自己那条。 */
  CV._toastTimer = null;
  CV.toast = function (msg, ms) {
    const mine = { msg, t: Date.now() };
    CV.toasts = [mine];
    if (CV._toastTimer) { clearTimeout(CV._toastTimer); CV._toastTimer = null; }
    CV.render();
    CV._toastTimer = setTimeout(() => {
      CV._toastTimer = null;
      if (CV.toasts[0] !== mine) return;      // 期间又来了新的一条：这条已经不该清它了
      CV.toasts = []; CV.render();
    }, ms || 1600);
  };

  /* ---------- 触摸 ---------- */
  /* 手指是不是"正在拖动"（见 bindTouch 里的说明）—— 默认 false，
     没绑触摸时（尺子的假环境）读它也不会是 undefined。 */
  CV.dragging = false;
  CV.bindTouch = function () {
    const toW = (e) => {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      /* ⚠️ V1.0.4 · R7（PC 鼠标 / 滚轮）：**两种坐标口径都要认** ——
         触摸事件给的是 `clientX/pageX`，而 PC 的鼠标事件（`wx.onMouseDown/Move/Up`）
         给的是 `{x, y}`（滚轮同）。只认前者的话，电脑上点得动才怪（
         `wx-cap_audit` 里那条"鼠标点一下 ＝ 触摸点一下"就是钉它的）。
         优先级 clientX → pageX → x：触摸那条路一个字没变。 */
      return {
        x: (t.clientX || t.pageX || t.x || 0) - Math.round((CV.pxW - CV.W) / 2),
        y: (t.clientY || t.pageY || t.y || 0),
      };
    };
    const RAF = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : ((fn) => setTimeout(fn, 16));
    let downY = 0, moved = false, startScroll = 0, lastY = 0, lastT = 0, vel = 0, raf = null;
    /* ================= F1 · 0930L（父亲大人实测：「输入框弹出来两次、打了字没用」）=================
     真根因之一就在这一层：**PC 微信同一次鼠标操作会走两个通道派事件** ——
       `wx.onTouchStart/Move/End`（兼容那一套）＋ `wx.onMouseDown/Move/Up`（R7 我们接的那一套）。
     两个通道都接 ⇒ **一次点击被派发两次**：
       · 名字框 → `NameCheck.ask` 跑两遍 → 系统键盘弹两次、确认回调被顶掉 ⇒ 打得再对也回不来；
       · 开关类按钮 → 翻两下 ⇒ 看着像"点了没反应"（这正是"改了几版都没改好"里最难认的那半）。
     判据（只认**同一物理手势**，绝不吃两次真点击）：
       · 两个通道**不同** ＋ 两次按下相隔 < 400ms ＋ 落点相差 ≤ 12px ⇒ 后到的那一次整段丢掉；
       · 同一个通道连着来两次（**真双击**）**一个字都不动** —— 上面那条`kind`不同才成立。
     ⚠️ 手机端没有鼠标通道 ⇒ 这段在手机上永不成立（行为一个字不变）。 */
    const DUP_MS = 400, DUP_PX = 12;
    let ptrChan = null, ptrAt = 0, ptrPt = null, dupGest = false;
    const nearPt = (a, b) => !!a && !!b && Math.abs(a.x - b.x) <= DUP_PX && Math.abs(a.y - b.y) <= DUP_PX;
    const claimGesture = function (kind, p) {
      const now = Date.now();
      if (ptrChan && ptrChan !== kind && (now - ptrAt) < DUP_MS && nearPt(ptrPt, p)) { dupGest = true; return; }
      ptrChan = kind; ptrAt = now; ptrPt = p; dupGest = false;
    };
    /* V1.1.15（2026-09-27 · 父亲大人："现在我界面滑动有点卡卡的，是我手机卡还是游戏卡"）：
       touchmove 在高刷屏上 60~120Hz 派发，而原来**每个事件都整页重画一次**——
       重页面（科技阁 816 次 fillText / 灯录 700 次 / 玩法指南 842 次）一拖就是每秒上百帧重画，
       一半的帧预算白烧在"同一帧里画两遍"上。改成**每帧最多画一次**：
       `CV.scroll` 位置照旧实时更新（手指跟手感不变），只是画面用 RAF 合帧。
       松手那一帧仍是同步 render，惯性与落位衔接不受影响。 */
    let drawRaf = 0;
    const drawSoon = () => {
      if (drawRaf) return;
      drawRaf = RAF(() => { drawRaf = 0; CV.render(); });
    };
    /* V9.6.111：长按抓起用的计时器（和网页版同一个时长） */
    const GRAB_MS = 420;
    let grabTimer = null;
    /* 本次手势是不是"抓着东西的那一次"。区别对待很重要：
       · 长按刚触发 → 这次手势就是"拖"，松手落在别的格子＝换位、落回原处＝还原地拿着；
       · 拿着东西时**再点一下目标格** → 新的手势，松手＝就在那一格放下（网页版同款备用路径）；
       · 拿着东西时点的是别的东西（返回、预设…）→ 这一下手势照常执行，手里那格不动。 */
    let gestureGrab = false;
    function clearGrabTimer() { if (grabTimer) { clearTimeout(grabTimer); grabTimer = null; } }
    /* V9.6.66（父亲大人："引导时……不能滑动界面"）：引导期间**整屏锁死** ——
       手指滑动不再滚页，也不会触发惯性；点也只有"高亮的那颗 / 跳过这一步"能被 hitAt 认出来。 */
    let coachLock = false;
    const coachOn = () => !!(G.U && G.U.coachActive && G.U.coachActive());
    const stopMomentum = () => { if (raf) { try { cancelAnimationFrame(raf); } catch (e) {} raf = null; } };
    /* 滚动：以前框架里**只有读没有写**（CV.scroll 永远是 0），页面一长（首页、残域）下面的内容
       就永远看不到。这里补上拖拽滚动 + 松手惯性，和手机原生滚动手感一致。 */
    /* 手指这一点命中了哪颗热区（坐标换算规则和 touchend 完全一致 —— 一处写错就会"按下亮 A、抬手触发 B"） */
    /* ignoreCoach：**跳过引导那道闸**。
       只有"长按抓起"用它 —— 引导自己教的就是"长按任意一格抓起、拖到别处松手"，
       而引导在的时候 hitAt 只放行它自己那颗（队伍页放行的是 party_board 那块**没有动作**的锚点），
       于是长按拿到的是一块点不动的区域、CV.grabCfg.from() 返回 null → 抓不起来。
       玩家在引导里试拖 → 拖不动（父亲大人："还是拖拽不了"）。 */
    /* ================= F6 #1（抢修单 0928 · 顶栏四颗货币胶囊被抢点）=================
     扫描顺序 ＝ **层级优先**，不是"注册顺序倒着来"：
       modal（弹窗自己那两颗） → screen（顶栏 / 底栏 / 吸顶条 / 二级页头） → content（页面正文）。
     为什么必须分层：顶栏四颗胶囊在**内容之前**登记（`CV.topbar()` 在 render 里先画），
     而内容层几百颗热区在后 —— 原来"从数组尾部往前扫、先中者赢"，
     于是**已经滚出可视区**的内容热区只要矩形还压在顶栏那一条上，就永远赢顶栏。
     实测（真代码 + 真触摸处理器，逐颗点顶栏）：home@scroll371 点「◉」派发成 `open_arena`、
     keji@2754 点「♾」派发成 `keji_up:wudao`……684 次里 29 次被抢（约 4%）。
     ⚠️ 不给顶栏单独开"更高优先级"的白名单 —— 那只是把同一个毛病换到别处长出来；
        层级就是层级（弹窗 > 屏幕层 > 内容层），谁都不例外。
     同一层内部仍然"后画的先中"（数组从尾往前），与改前一致；V9.6.108 那条
     "没有处理器的锚点区域退成兜底"照旧（它只在整个三层都扫完、没有处理器可派发时才生效）。 */
    const hitLayer = (h) => (h.modal ? 2 : (h.screen ? 1 : 0));
    const scanHit = (p, ignoreCoach) => {
      const ly = CV.localY(p.y);
      const overlayOnly = !!(G.U && G.U.overlay);
      let fallback = null;          // 没有处理器的锚点区域 → 兜底候选
      for (let L = 2; L >= 0; L--) {
        for (let i = CV.hits.length - 1; i >= 0; i--) {
          const h = CV.hits[i];
          if (hitLayer(h) !== L) continue;
          /* F6 #12：屏外卡的"幽灵热区"（只由量那一遍登记）不参与命中 ——
             它们是引导的锚点，不是可点的东西（坐标本来就在可视窗口之外）。 */
          if (h.ghost) continue;
          /* 弹窗打开 = 真模态：只放行弹窗自己那两颗按钮，底栏/顶栏/吸顶条一律不吃（V9.6.95） */
          if (overlayOnly && !h.modal) continue;
          /* 引导是**真模态**：只放行引导自己要的那两颗，其余热区一律不吃（V9.6.45） */
          if (!ignoreCoach && G.U && G.U.coachAllows && !G.U.coachAllows(h)) continue;
          const wy = h.screen ? p.y : ly;
          if (!(p.x >= h.x && p.x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h)) continue;
          /* V9.6.108（父亲大人："队伍上阵又上不了了，其他东西也都点不了了"）：
             **优先给"有处理器"的热区**。没有处理器的是给引导当锚点的整块区域
             （队伍阵型 party_board、六维卡 attr_card、关卡格 stage_grid…），
             它们盖在真按钮上面，以前会把点击全吃掉 ——
             实测：点队伍空位，派发的却是 party_board（没有处理器）→ 什么都不发生 → 上不了阵。
             现在这类区域退成兜底：只有底下确实没有别的可点时才轮到它（那时点它＝关掉引导）。 */
          if (!hitHasHandler(h)) { if (!fallback) fallback = h; continue; }
          return h;
        }
      }
      return fallback;
    };
    const hitAt = (p, ignoreCoach) => scanHit(p, ignoreCoach);
    /* V9.6.111：手指这一点压在哪一格"能拿起的那格"上？不是就 null。
       （长按抓起与"拿着东西点目标格"都要用它，口径和 hitAt 完全一致） */
    const grabSlotAt = (p) => {
      if (!CV.grabCfg || !CV.grabCfg.from) return null;
      const h = hitAt(p, true);          // 抓起不看引导那道闸（见 hitAt 的 ignoreCoach）
      if (!h) return null;
      const idx = CV.grabCfg.from(h.id);
      return (idx === null || idx === undefined) ? null : idx;
    };
    /* ================= V1.0.4 · R7（父亲大人 09-27 点单：「PC 端鼠标 / 滚轮」）=================
       手势只有**一套**：触摸、鼠标按下/移动/抬起，走的都是下面这三个函数。
       为什么不是"给鼠标再写一遍"：这套手势里塞着长按抓起、引导模态、惯性、原生按钮的
       `CV.dragging` 时序 —— 抄一份出来等于以后每改一处都得改两遍，迟早两边不一致。
       PC 微信（基础库一侧）派的是 `wx.onMouseDown / onMouseMove / onMouseUp / onWheel`，
       **手机上没有这几个事件**；老基础库没有这几个函数 → 注册整段跳过（`typeof` 试一下）。
       注册点在 `CV.bindTouch()` 里（与触摸同一处，都由 game.js 在**读档之后**调用）。 */
    const onDown = function (e, kind) {
      const p = toW(e);
      /* F1 · 0930L：同一次物理点击被两个通道各派一遍时，后到的那一遍整段丢掉（见上面那段注释） */
      claimGesture(kind || 'touch', p);
      if (dupGest) return;
      /* ================= V1.1.21（2026-09-28 · 父亲大人：「输入文字的时候得支持点击空白区域退出输入框，
         现在输入框一直收不起来」）=================
         小游戏没有 `<input>`，输入是借 `wx.showKeyboard` 起一个**系统键盘**；而它一旦起来，
         画布照旧收得到触摸 —— 可原来**没有任何一处**会因为"点在空白处"把它收掉
         （全项目 `hideKeyboard()` 零调用，`onKeyboardComplete` 也没人听）。
         做法：输入态由输入口自己立 `CV.kbActive`（起名 / 改名的 `NameCheck.ask`、
         市集数量、删档确认三处），这里在**手势最开头**判一次 —— 点在**没有任何热区**的地方
         ＝"空白"（页面底、卡片之间的空隙），就收起键盘并**吞掉这一下**（不往下传，免得顺手点到别处）。
         点在按钮上照旧走原来的路（键盘留着，等他自己收）。 */
      if (CV.kbActive) {
        let hit = null;
        try { hit = CV.hitAt(p.x, p.y); } catch (e2) { hit = null; }
        if (!hit) {
          CV.kbActive = false;
          try { if (G.wx && G.wx.hideKeyboard) G.wx.hideKeyboard({}); } catch (e3) {}
          CV.pressed = null;
          return;
        }
      }
      /* V1.1.x（2026-09-27 · 音频系统）：微信不许自动播放 —— BGM 只能等**玩家的第一次触摸**。
         这里就是"第一次触摸"的唯一收口（含首屏那一下：首屏也是玩家点的）。
         AUD.unlock() 内部有"只解锁一次"的闸，每次都调不会重启音乐。 */
      if (G.AUD && G.AUD.unlock) G.AUD.unlock();
      /* 开机首屏（V1.1.3）：它盖在页面上，这一下**不往下传** ——
         不然玩家点一下首屏，底下那颗「签订灯阁契约」就被顺手点掉了。抬手时才结束首屏。 */
      if (CV.splashActive && CV.splashActive()) { CV.pressed = null; downY = p.y; lastY = p.y; moved = false; CV.dragging = false; return; }
      downY = p.y; lastY = p.y; lastT = Date.now(); vel = 0; moved = false;
      /* V1.1.x（0927-P · 父亲大人：「进入游戏圈的按钮滑动的时候还是会频闪」）：
         `CV.dragging` ＝ **这一次手势是不是真的在拖**（手指还在屏幕上、位移过了 8px 的阈值）。
         只读标志，给"原生组件不能在拖动中重建"这类地方用（见 js/sc-gameclub.js 的 GC.tick）——
         原来那边只能看"滚动位置有没有变"，于是"手指滑得慢 / 中途顿一下"时
         会被误判成"已经停稳了"而提前重建，手指再一动又收起来 = 频闪。
         手指抬起（onTouchEnd）或被打断（onTouchCancel）一律归位。 */
      CV.dragging = false;
      startScroll = CV.scroll || 0;
      stopMomentum();
      coachLock = coachOn();
      gestureGrab = false;
      /* 手里已经拿着一格（上一次长按的残留）：
         · 点的是"能拿起的那一格" → 这次手势就是"放下的手势"，松手在那一格放下；
         · 点的是别的东西 → 手里那格不动，这一下照常当普通点击走（返回/预设照样能点）。 */
      if (CV.grab) {
        const gIdx = grabSlotAt(p);
        if (CV.grab.fresh) {
          gestureGrab = true;                       // 还是"创造抓取"的那一次手势，继续拖着
        } else if (gIdx !== null) {
          gestureGrab = true;
          CV.grab.over = gIdx;
          CV.render();
        }
        if (gestureGrab) return;
      }
      /* V9.6.40（父亲大人：两侧一致 / 手感）：网页版按钮有 :active 缩放，画布原来点下去毫无反馈。
         按下先记住"按的是哪颗"，U.btn 会把它画成按下态；抬手或开始滚动就清掉。 */
      const h = hitAt(p);
      if (h) { CV.pressed = h.id; CV.render(); }
      /* V9.6.111：长按抓起（队伍换位）——按下这一格是"可抓起"的，就等 420ms（和网页版同一个值）。 */
      clearGrabTimer();
      if (CV.grabCfg && CV.grabCfg.from) {
        /* V9.6.112（父亲大人："还是拖拽不了"）：这里原来用的是**过了引导闸门**的那颗
           （引导在时是 party_board 那块没有动作的锚点）→ 永远抓不起来。
           抓起要单独查一次"这一格能不能拿起"（不看引导闸），战斗/其它页面不受影响。 */
        const idx = grabSlotAt(p);
        if (idx !== null && idx !== undefined) {
          grabTimer = setTimeout(function () {
            grabTimer = null;
            CV.grab = { from: idx, x: p.x, y: p.y, over: idx, fresh: true };
            gestureGrab = true;
            CV.pressed = null;
            try { if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' }); } catch (e2) {}
            CV.render();
          }, GRAB_MS);
        }
      }
    };
    const onMove = function (e) {
      if (dupGest) return;                       // F1 · 0930L：重复那一路的移动也不处理
      const p = toW(e);
      const dy = p.y - downY;
      if (Math.abs(dy) > 8) moved = true;
      if (moved) CV.dragging = true;
      /* 抓起中：不滚页面，只跟手 + 更新落点高亮 */
      if (CV.grab && gestureGrab) {
        CV.grab.x = p.x; CV.grab.y = p.y;
        if (CV.grabCfg && CV.grabCfg.targetAt) CV.grab.over = CV.grabCfg.targetAt(p);
        stopMomentum();
        drawSoon();
        return;
      }
      if (moved) clearGrabTimer();        // 手指滑走＝在滚页面，不算长按
      if (coachLock || coachOn()) { CV.pressed = null; return; }     // 引导在：不滚、不给按下态
      if (!moved) return;
      if (CV.pressed) { CV.pressed = null; CV.render(); }   // 一变成滚动就不算"按着按钮"了
      const now = Date.now(), dt = Math.max(1, now - lastT);
      vel = (p.y - lastY) / dt;                    // px/ms，向下拖为正
      lastY = p.y; lastT = now;
      const next = Math.max(0, Math.min(CV.maxScroll || 0, startScroll - dy));
      if (next !== CV.scroll) { CV.scroll = next; drawSoon(); }
    };
    const onUp = function (e) {
      /* F1 · 0930L：重复那一路的抬手只把状态清干净，**绝不派发**（这一下已经由先到的通道派过了） */
      if (dupGest) { dupGest = false; CV.pressed = null; CV.dragging = false; clearGrabTimer(); return; }
      const p = toW(e);
      clearGrabTimer();
      CV.dragging = false;                    // 抬手＝这一次手势结束（原生组件这才允许重建）
      if (CV.splashActive && CV.splashActive()) { if (CV.splashSkip) CV.splashSkip(); return; }
      /* 松手时"手里拿着东西"，且这一下就是抓着的手势：
         落点在哪一格 —— 换到那一格；落回自己或空白 —— 手里继续拿着（等下一下拖动或点选，
         网页版就是这套规矩：松在空白处不会掉出去，还能移到别处再放）。
         拿着东西时**再点自己那一格** = 放回原位。 */
      if (CV.grab && gestureGrab) {
        const g = CV.grab;
        const to = (g.over === undefined || g.over === null) ? null : g.over;
        const wasFresh = !!g.fresh;
        g.fresh = false;
        if (to !== null && to !== g.from && CV.grabCfg && CV.grabCfg.drop) {
          CV.grab = null;
          try { CV.grabCfg.drop(g.from, to); } catch (e3) {}
        } else if (!wasFresh && to === g.from) {
          CV.grab = null;                       // 再点一下自己＝放回原位（网页版同款）
          /* F7 ②（父亲大人点名的例子）：**删「已放回原位」** —— 手里那张当场回到原位、抓起态解除，
             看得见。这里连 toast 这一行都不留（队伍页那颗「取消」按钮的同一句也删了，见 sc-party）。 */
        } else {
          g.over = null;                        // 落在空白处：手里还拿着，落点高亮收掉
        }
        CV.pressed = null; CV.render();
        gestureGrab = false;
        return;
      }
      gestureGrab = false;
      if (coachLock && moved) { coachLock = false; return; }          // 引导期间的滑动：整下丢掉
      coachLock = false;
      if (moved) {                                 // 松手 → 惯性
        let sp = -vel * 14;
        if (Math.abs(sp) < 1) return;
        const step = () => {
          sp *= 0.92;
          const next = Math.max(0, Math.min(CV.maxScroll || 0, CV.scroll + sp));
          const edge = next === CV.scroll;
          CV.scroll = next; CV.render();
          if (Math.abs(sp) > 0.6 && !edge) raf = RAF(step); else raf = null;
        };
        raf = RAF(step);
        return;
      }
      /* 点击：内容区登记的是"内容坐标"，这里换算（− 顶栏 − 8 + 滚动）后再比 ——
         以前两边坐标系不同直接比，内容区所有按钮的判定都偏了一整条顶栏。 */
      if (CV.pressed) { CV.pressed = null; CV.render(); }
      /* 抬手派发与按下态走**同一个** scanHit —— "按下亮 A、抬手触发 B"这类毛病
         就是两处各写一遍扫描逻辑造出来的（F6 #1：两处都要按层级优先）。 */
      const hit = scanHit(p);
      /* 没有命中的那颗时什么都不做；命中的是"没有处理器的锚点"（fallback）
         时让它自己派发（那时点它＝关掉引导，见 hitAt 的兜底说明）。 */
      if (hit) CV.dispatch(hit.id);
    };
    /* 滚轮（R7）：只改 `CV.scroll`，**夹取规则与拖动完全同源**（同一个 `CV.maxScroll`），
       所以后面的拖动、惯性、边界都当它是"拖出来的位置"，不需要任何特判。
       步长按事件自带的两种编码各认一份：像素（大值）按 1，行数（小值）按 30 估 ——
       不这么做的话，行数编码的一格只能滚 3px，滚起来像卡住。 */
    const WHEEL_LINE = 30;
    const onWheel = function (e) {
      if (CV.splashActive && CV.splashActive()) return;
      if (coachLock || coachOn()) return;
      const raw = Number(e && (e.deltaY !== undefined ? e.deltaY : e.deltaX)) || 0;
      if (!raw) return;
      const d = (Math.abs(raw) <= 10 ? raw * WHEEL_LINE : raw);
      stopMomentum();
      const next = Math.max(0, Math.min(CV.maxScroll || 0, (CV.scroll || 0) + d));
      if (next !== CV.scroll) { CV.scroll = next; CV.render(); }
    };
    /* 触摸取消（V9.6.90）：来电、切前后台、系统手势打断时微信只发 onTouchCancel。
       鼠标没有对应事件（PC 上"按下时把指针移出窗口"这类罕见情况由 onMouseUp 兜）。 */
    const onCancel = function () {
      if (dupGest) { dupGest = false; CV.pressed = null; CV.dragging = false; return; }
      /* 手里拿着东西时被打断（来电/切后台/系统手势）：这一下不算"放下"，
         继续拿着，但**不能再算"刚抓起的那一次手势"**（否则下一次点按钮会被当成继续拖）。 */
      if (CV.grab) CV.grab.fresh = false;
      gestureGrab = false;
      CV.dragging = false;                    // 被打断也当成"手势结束"（否则原生按钮会一直不重建）
      CV.pressed = null; coachLock = false; stopMomentum(); CV.render();
    };
    wx.onTouchStart(function (e) { onDown(e, 'touch'); });
    wx.onTouchMove(function (e) { onMove(e, 'touch'); });
    wx.onTouchEnd(function (e) { onUp(e, 'touch'); });
    /* V9.6.90（技能《weixin-game》§触摸事件）：**触摸取消也要接**。
       来电、切前后台、系统手势打断时微信只发 onTouchCancel 不发 onTouchEnd ——
       原来没接，于是"按下态"和"滑动惯性"会卡在那里：按钮一直是按下样子，
       或者松手后还继续自己滚。取消 = 这一下不算点击，只把状态清干净。 */
    if (wx.onTouchCancel) wx.onTouchCancel(onCancel);
    /* PC 端（R7 · 父亲大人 09-27：「PC 微信里能点击与滚轮翻页」）：
       · `onMouseDown/onMouseMove/onMouseUp` 直接复用上面那一套（含点击派发与拖动滚动）；
       · 只有**按下期间**的 onMouseMove 才算拖动/滚动 —— 鼠标不用按钮在页面上划过不该滚；
       · `onWheel` 见上面 onWheel。
       ⚠️ 手机端这些函数不存在（或存在也不派事件）⇒ 手机行为一个字不变；
          老基础库没有它们 ⇒ 整段跳过，绝不影响开机。 */
    if (typeof wx.onMouseDown === 'function') {
      let mouseHeld = false;
      try {
        wx.onMouseDown(function (e) { mouseHeld = true; onDown(e, 'mouse'); });
        if (typeof wx.onMouseMove === 'function') {
          wx.onMouseMove(function (e) {
            if (!mouseHeld) return;             // 没按着 = 只是划过，不滚页
            /* 鼠标的"移动"在按住时就是拖：touch 那条路是靠 onTouchMove 自己来的，
               这里补一下"指针已经离开按下点"的判定（绝对值与触摸同一条 8px 阈值）。 */
            onMove(e, 'mouse');
          });
        }
        if (typeof wx.onMouseUp === 'function') {
          wx.onMouseUp(function (e) { if (!mouseHeld) return; mouseHeld = false; onUp(e, 'mouse'); });
        }
      } catch (e) {}
    }
    if (typeof wx.onWheel === 'function') { try { wx.onWheel(onWheel); } catch (e) {} }
  };

  G.CV = CV;
})();
