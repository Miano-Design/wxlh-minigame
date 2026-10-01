/* 小游戏通用件（照网页版 css/style.css 一块块抄）
   ------------------------------------------------------------------------------
   规矩（父亲大人 2026-09-17：从头复刻）：
     · 这里**只放通用块**，每个块注释里都写清它对应网页版哪个类；
     · 数值一律取 CV.SP / CV.FS / CV.RADIUS —— setup() 里按网页版根字号
       clamp(14.5px, 3.85vw, 16px) 缩放过，所以小游戏和网页一样大；
     · 每页只负责"按网页版的结构顺序把块摆出来"，不自己发明间距。

   用法：U.begin() 归零 → 依次调用块（U.card(...) / U.h3(...) / U.kv(...) …）
   每个块自己推进 U.y，并返回它占的高度。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  const U = {};
  G.U = U;

  /* ---------- 全局工具（逐字对齐网页版 js/ui.js 的同名函数） ---------- */
  /* fmt：数字显示（口径与网页版同一份，V9.6.140 起**一律不带小数点**）。
     父亲大人："有些都不需要小数点，像货币就不用，直接取整数就行了。"
       · 10 万以下原样显示精确整数（14,200 就写 14200 —— 缩写成"1万"会瞒掉 30% 的价钱）；
       · 10 万起才缩写且取整：100,000 → 10万、142,000 → 14万、9 亿还是 9 亿。
     小游戏以前没有这个函数，各页各自 `G.fmt || String` 兜底，于是首页显示成「55000」，
     和网页版完全不是一个观感（V9.5.93 修：补上同一个 fmt，并挂到全局给所有页用）。 */
  G.fmt = function (n) {
    n = Math.floor(n || 0);
    if (n >= 1e8) return Math.round(n / 1e8) + '亿';
    if (n >= 1e5) return Math.round(n / 1e4) + '万';
    return String(n);
  };
  U.fmt = G.fmt;
  /* 倍率显示（V9.6.140）：×2.00 → ×2、×2.35 → ×2.35（口径与网页版同） */
  G.fmtMul = function (x) { return String(Math.round((x || 0) * 100) / 100); };
  /* formatDuration：网页版同一段逻辑（小时/分/秒三档） */
  G.formatDuration = function (sec) {
    sec = Math.floor(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h) return h + '小时' + m + '分';
    if (m) return m + '分' + s + '秒';
    return s + '秒';
  };
  /* 分:秒（V9.6.142，父亲大人："游历怎么现在变成几千秒了，按分:秒，这样显示呀"）。
     倒计时一律用这个：3000 秒 → 50:00、65 → 01:05。
     以前直接写 `X 秒`，而游历的间隔会一路涨到 3600 秒 ——
     屏幕上就是"距下一次 3600 秒"，玩家还得自己心算除以 60。
     超过一小时才退化成"X小时Y分"（那种场合读分秒没意义）。 */
  /* 「分:秒」只有一份实现（数据层的 D.fmtClock）—— 这里只是给页面用的快捷方式。
     ⚠️ 不要在这里再抄一遍算法：抄两遍迟早分叉，这一整轮（货币图标、药园文案）
     都是栽在"同一件事写两份"上。 */
  G.fmtClock = function (sec) { return (G.DATA && G.DATA.fmtClock) ? G.DATA.fmtClock(sec) : String(sec); };

  U.y = 0;                 // 纵向游标（从内容区顶部算起）
  U.dry = false;           // true = 只量高度不画（U.card 用它先量后画底）
  U.begin = function () { U.y = 0; };
  U.pad = () => 12 * CV.SCALE;                        // 网页版 #view padding: 0.75rem（屏幕边距）
  U.cw = () => CV.W - U.pad() * 2;                    // 卡片/区块外宽
  /* V9.5.93（父亲大人："文字贴边"）：网页版 .card 有一圈 14px 内边距（padding: var(--sp3)），
     小游戏这边原来只画了卡片框、内容却按卡片边缘排 —— 所有卡片里的文字/按钮都贴着边框。
     现在卡片内统一走 U.ix()/U.iw()（内容左边界 / 内容宽），不在卡片里时等于屏幕内容区。 */
  /* 按钮尺寸（逐条对齐网页版 css）：.btn = min-height 2.75rem(44)・padding 0 18・字号 13；
     .btn.small = min-height 2.5rem(40)・padding 0 13・字号 12；.btn-row .btn 最小宽 5.375rem(86) 且**换行不截断**。 */
  /* V9.6.69（资料 §10：触控目标 ≥44×44 —— WCAG AAA / Apple HIG 同口径）：
     小按钮原来是 40（×SCALE≈1.04 也只有 41.6px），手机上容易点不准 → 抬到 44。 */
  /* V9.6.118（父亲大人："整体的间距、大小、对齐都检查一遍"）：按钮尺寸回到网页版的口径 ——
     .btn min-height 2.75rem = 44px、.btn.small 2.5rem = 40px、标题行按钮 .hbtn 2.125rem = 34px。
     原来画布写的是 46 / 44 —— 小按钮比网页版胖 4px，一屏里几十颗按钮都跟着胖，
     行距和卡片高度全被顶起来（"看着笨重、间距不对劲"的来源之一）。 */
  U.BTN_H = 44; U.BTN_SM = 40; U.BTN_TITLE = 34; U.BTN_MINW = 86;
  U.inCard = false;
  U.inPad = () => (U.inCard ? CV.SP[2] : 0);
  U.ix = () => U.pad() + U.inPad();
  U.iw = () => U.cw() - U.inPad() * 2;
  U.space = function (px) { U.y += px; };
  const draw = (fn) => { if (!U.dry) fn(); };
  /* 页面要自己排"两栏卡"（左文字 + 右按钮列）时用 U.draw —— 它认得 U.card 的先量后画，
    不会在量高度那一趟把东西画两遍。 */
  U.draw = (fn) => draw(fn);

  /* ================= V1.1.17（父亲大人 09-27 深夜 · 派单 Z-B）· 二级页顶栏（吸顶）=================
     原话：「每一屏的标题和返回键都固定在顶部吧，不然有时候要点返回又得滑回去」。
     这一段是**唯一**的二级页顶栏写法（原来 6 个文件各抄了一遍 `head(title)`：
     画一颗 40×40 的「‹」+ 标题，然后 `U.y += 40 + SP[2]`）——
     现在统一成"登记 + 让出高度"，**真正落笔由框架在屏幕坐标里画**（见 cv.js 的 CV.drawPageHead）：
       · 页面写法：`U.begin(); U.pageHead('秘术阁');` 之后照旧从 U.y 往下排正文；
       · 好处：标题与返回键固定不动，长页面（背包 / 灯录 / 秘术阁 / 伙伴…）滚到哪儿都点得到返回；
       · 正文从它**下面**滚过去（顶栏底下铺的是一条与整屏同源的渐变底，不透光）。
     可选：
       · backId  —— 返回键的热区 id（默认 'page_back'，与原来那批同名）；
       · right(x,y,h) —— 页头右端的额外件（现在只有招募页那颗「i」概率公示），
                        x/y 是**屏幕坐标**，里面自己登记热区时记得 `CV.hitMode='screen'`；
       · color  —— 标题色（默认正文色）。
     做坏试验：把本函数改成只登记不放高度（不推进 U.y）→ 正文会被顶栏压住，
     `scroll_fit_audit` ⑧ 的"顶栏底下不许有正文"当场红。 */
  U.pageHead = function (title, o) {
    o = o || {};
    const h = U.BTN_SM * CV.SCALE;                 // 与网页版 .page-head 的 40px 同高
    CV.pageHead = { title: String(title == null ? '' : title), backId: o.backId || 'page_back',
      h: h, right: o.right || null, color: o.color || null };
    /* F8 ②（父亲大人 09-28：「返回键下面留点空间…一上滑返回键都跟内容贴一起了」）：
       让位的高度里还得加上**呼吸带** `CV.HEAD_GAP` —— 顶栏底下多铺的那一条不留缝的底
       会盖住首屏正文，正文起点必须同步下移（值与 `CV.drawPageHead` 共用一个常量）。 */
    U.y = h + CV.SP[2] + (CV.HEAD_GAP || 0);        // 正文从这里往下（顶栏 + 呼吸带替它占掉这一段）
    return h;
  };

  /* ================= V1.1.15（2026-09-27 · 父亲大人："全都改了吧"）=================
     **dry 模式收口**。`U.card` 为了算卡片高度会先把内容跑一遍（"只量不画"），
     但那条规矩以前只在走 `U.draw()` 的 helper 里生效 —— 直接调 `CV.text / CV.round / CV.drawIcon`
     的地方**照样落笔**，于是**每张卡都白画一整遍**。
     尺子量到的证据：秘术阁 816 次文字绘制/帧 —— 它一屏也就十来张卡，一半是这个白画的。
     这里把三个绘制入口一起包住：dry 期间一律不画（**量的部分照旧**：宽度走 CV.measure，
     布局走各 helper 里的 `U.y +=`，都不受影响）。
     做坏试验：把这三行注掉 → `perf_audit` 的字数当场翻倍。 */
  const _cvText = CV.text, _cvRound = CV.round, _cvIcon = CV.drawIcon;
  CV.text = function () { if (U.dry) return undefined; return _cvText.apply(CV, arguments); };
  CV.round = function () { if (U.dry) return undefined; return _cvRound.apply(CV, arguments); };
  CV.drawIcon = function () { if (U.dry) return undefined; return _cvIcon.apply(CV, arguments); };
  /* ================= F2-7（抢修单 0928R3）· 卡内热区不再登记两遍 =================
     上一轮读代码抓到的病：`U.card` 为了算高度会先把内容跑一遍（"只量不画"，见上一条），
     而 `CV.hit` **没有 dry 闸** ⇒ 同一颗按钮被登记两遍；第二遍登记时**和自己的第一遍相撞**，
     于是 `CV.hit` 里那条"撞上就缩回原样"的保护自己把自己废掉 ——
     V1.1.12"所有热区长到 ≥88rpx"在卡内按钮上**只落地一半**
     （实测：法宝页 29 个唯一 id 登记成 49 条、其中 20 条是重复的）。

     ⚠️ 这个闸改了两版，两版都是**尺子当场否掉**的（记在这儿，别再退回去）：
       ① 第一版"dry 期间直接不登记" → `guide_audit` 红（主线 q13 的锚点 `pblup` 不存在）：
          因为**屏外那张卡只跑量那一遍**（`U.card` 见 `cardVis=false` 就不画第二遍），
          热区只可能由量那一遍登记，而引导（`U.drawCoach`）正是拿 `CV.hits` 里的锚点矩形找目标；
       ② 第二版"按 id 去重（同 id 就跳）" → `scroll_fit_audit` 红（点第六张命格卡不命中）：
          **同一个 id 故意登记两次、第二次是更大的那一份**是既有写法
          （选命格卡：右侧那颗「觉醒」小按钮 + 整张卡的落点，`sc-start.js:219`），
          按 id 去重会把那张**大卡**一起跳掉 ⇒ 点卡片正中不命中。
       ⇒ 最后的口径：**只在"实画这一遍登记的矩形被量那一份包住"时才跳**
          （＝被"防撞"缩回原样的那个重复件；放大后的那一份留下，
            而"第二次更大"的那种落点照旧登记）。
     ⚠️ `CV.hit` 在 js/cv.js 里，**不在本单可改范围** → 在这一层包住它（同一个出口、同一套语义）。
     做坏试验：把 `U.hitSkip` 那两行去掉 → 重复条数回到 20/29（见回单里的前后对照）。 */
  U.hitSkip = null;            // Map<id, rect>：量那一遍登记的热区（实画那一遍据此跳重复件）
  const _cvHit = CV.hit;
  CV.hit = function (id, x, y, w, h) {
    const m = U.hitSkip && U.hitSkip.get(String(id));
    if (m && x >= m.x - 0.5 && y >= m.y - 0.5 && x + w <= m.x + m.w + 0.5 && y + h <= m.y + m.h + 0.5) return undefined;
    return _cvHit.call(CV, id, x, y, w, h);
  };

  /* ================= F2-7（抢修单 0928R3）· `page_back` **只留这一份实现** =================
     这颗 id（每个二级页吸顶条上那颗「‹ 返回」）原来在四个文件里各注册了一份一字不差的
     `CV.on('page_back', () => CV.pop())`（sc-core-pages / sc-lines / sc-last / sc-guide）
     —— "同一件事写四份"就是"改一处漏一处"的种子。现在收在这儿一处（uiw.js 先于所有页面加载，
     `CV.on` 是覆盖语义，后面没人再注册它）。
     ⚠️ `js/sc-guide.js` 里还留着一份**一模一样**的注册（那个文件不在本单可改范围）：
        行为完全一致、不是 bug，但它也该跟着删 —— 记在回单的反对/待办里。 */
  CV.on('page_back', function () { CV.pop(); });

  /* ================= V1.1.15（2026-09-27 · 父亲大人："快速点击连点会很卡"）=================
     **连点合帧**：一次点击常常触发好几处 `CV.render()`（处理器自己一次、toast 一次、
     收尾的 setTimeout 再一次），狂点的时候**一帧里能画三四遍**，而每遍都是整页重画
     （重页面一帧上千次 native 调用）—— 这就是"连点很卡"的主因。
     这里给渲染加一道"同一帧只画一次"的闸：
       · **只在有 `requestAnimationFrame` 的真机环境生效** —— 尺子/自动化是假环境（没有 rAF），
         照旧**同步**渲染，167 处调用与所有断言的行为一个字节都不变（这也是为什么这把闸能安全加）；
       · 命中判定不受影响：`CV.hits` 是上一帧登记的那份，点击读的本来就是它；
       · 延迟最多一帧（16ms），肉眼无感。
     做坏试验：把 `if (typeof requestAnimationFrame !== 'function')` 那行删掉 → 尺子立刻红一片。 */
  const _cvRender = CV.render;
  let renderQueued = false, renderQueuedAt = 0;
  CV.render = function () {
    if (typeof requestAnimationFrame !== 'function') return _cvRender.apply(CV, arguments);
    /* ================= F6 #3（抢修单 0928 · 渲染闸加看门狗）=================
     这道闸只有"入口置位、rAF 回调复位"一条路。只要那一次 rAF 回调**没被平台派发**
     （切后台冻结渲染循环、画布被重建、低电量档把 rAF 节流到几乎不走），
     `renderQueued` 就永远是 true —— 此后**所有** CV.render() 被静默吞掉：
     画面冻在旧帧，而热区还在、点击还有反应、音效照响（最难查的一种"假死"）。
     现在加一条**看门狗**：置位超过 200ms 还没画成，就当那次 rAF 丢了 ——
     复位并**同步补画一帧**（同时把 `CV.resetRenderGate` 交给 onShow / relayout 兜底）。
     ⚠️ 用"时间戳比对"而不是 `setTimeout`：不打新计时器、不在尺子的计时器堆里留东西
        （`soak_audit` 的"计时器不越堆越多"那条判据本来就卡得很紧，别去动它）。 */
    if (renderQueued) {
      if (Date.now() - renderQueuedAt < 200) return undefined;
      renderQueued = false;
      return _cvRender.apply(CV, arguments);    // 上一次那帧没来：不再欠着，**同步补画一帧**
    }
    renderQueued = true;
    renderQueuedAt = Date.now();
    requestAnimationFrame(function () { renderQueued = false; return _cvRender(); });
    return undefined;
  };
  /* 强制复位渲染闸并立刻补画一帧（切回前台 / 窗口尺寸变化时用）；
     正常路径下它只是"把还可能欠着的那一帧立刻补上"，不改变任何既有行为。 */
  CV.resetRenderGate = function () {
    renderQueued = false;
    if (typeof requestAnimationFrame !== 'function') return undefined;
    return _cvRender.call(CV);
  };

  /* ================= V1.1.15（2026-09-27 · 父亲大人："全都改了吧"）=================
     **整张卡片在屏幕外 → 只量高度、不画**（`U.card` 里用）。
     为什么在这里做、而不是逐页改：长列表页（秘术阁 / 灯录 / 游历 / 任务 / 成长）都是
     "一页几十张卡"，而画布每帧只能显示一屏 —— 原来**屏外的卡也照样把每个字发一遍 fillText**。
     尺子（`perf_audit`）量到：秘术阁 816 次文字绘制/帧、灯录 691~713、游历 571……
     一帧上千次 native 调用，滑动就掉帧。
     口径：屏幕坐标 = 内容坐标 + 顶栏 + 8 − scroll；上下各留 80px 余量（半露的卡必须画，
     吸顶条、阴影、描边都要留活路）。**只跳过"画"，不跳过"量"** —— 布局与热区不受影响。 */
  const ONSCREEN_PAD = 80;
  U.onScreen = function (y, h) {
    const top = (CV.scroll || 0) - (CV.TOP + 8) - ONSCREEN_PAD;
    const bot = (CV.scroll || 0) - (CV.TOP + 8) + CV.H + ONSCREEN_PAD;
    return (y + (h || 0)) >= top && y <= bot;
  };

  /* ================= 品牌题字（V1.1.11 · 父亲大人自制）=================
     父亲大人 09-27：「这个是我做的主画面标题，你把它放到主画面上，**换掉电脑字**，记得适配不同手机的屏幕」。
     资源：`icons/logo-title.png`（原图 2953×1385 RGBA，**背景真透明**；已压到 1000×469 / 702KB ——
           原图 5.3MB 直接进包会把主包顶爆，主包上限 4MB）。
     ⚠️ **文件名必须是 ASCII**：`wx.createImage()` 加载中文名的资源一律 onerror（V1.0.5 实测，见 sc-splash.js 顶部）。

     两条口径：
       · **短屏不许把【进入残域】顶出去** → 高度再夹一道 `min(H×0.22, 132·SCALE)`，超了就等比缩宽；
       · **首帧绝不能空** → 图没到位（或加载失败）时**退回活字**「残域灯阁」，
         而且**两种情况下占的高度完全一样**（`brandTitleH` 就是那个槽高），所以按钮不会在图到位的那一帧跳一下。
     `U.brandTitleH(w)` 给槽高、`U.brandTitle(x, y, w)` 画并返回同一槽高 —— 一处算式，两处调用。 */
  const BRAND_SRC = 'icons/logo-title.png';
  const BRAND_ASPECT = 1000 / 469;                 // 落位资源就是 1000×469（宽高比与 2953×1385 一致）
  let _brandImg = null, _brandOk = false;
  try {
    if (G.wx && typeof G.wx.createImage === 'function') {
      _brandImg = G.wx.createImage();
      /* 图到位补重画一帧：主画面不是每秒重画的那种页（只有灯阁首页在跳秒）。 */
      _brandImg.onload = function () { _brandOk = true; try { CV.render(); } catch (e) {} };
      _brandImg.onerror = function () { _brandOk = false; };
      _brandImg.src = BRAND_SRC;
    }
  } catch (e) { _brandImg = null; }
  U.brandTitleH = function (w) {
    const byW = (w || CV.W * 0.86) / BRAND_ASPECT;
    return Math.min(byW, CV.H * 0.22, 132 * CV.SCALE);
  };
  U.brandTitle = function (x, y, w) {
    const h = U.brandTitleH(w);
    const dw = Math.min(w, h * BRAND_ASPECT);      // 被高度夹过就等比缩宽，不改比例
    const cx = x + w / 2;
    if (_brandOk && _brandImg && _brandImg.width) {
      CV.ctx.drawImage(_brandImg, cx - dw / 2, y + (h - dw / BRAND_ASPECT) / 2, dw, dw / BRAND_ASPECT);
      return h;
    }
    /* 兜底：活字（备案名一字不差），纵向落在同一个槽里 */
    CV.text('残域灯阁', cx, y + h * 0.5 + CV.DISP.d3 * 0.28,
      { size: CV.DISP.d3, bold: true, align: 'center', color: CV.C.gold, ls: 4 });
    return h;
  };

  /* ---------- 卡片 .card（bg --panel / 边 --line / 圆角 10 / 内边距 14 / 下边距 14）
     传一个画内容的函数：它按"内容游标"往下画，卡片底由这里先量后画。 ---------- */
  /* opt.padY：纵向内边距（默认 14，和网页版 .card 一致）。
     网页版有几张卡是"贴边卡"（比如首页游历条 padding: 2px 14px / 挂机卡 4px 14px 14px），
     纵向内边距明显更小 —— 用同一个 14 会让卡片白白高一截。 */
  U.card = function (content, opt) {
    const pad = CV.SP[2], padY = (opt && opt.padY !== undefined) ? opt.padY * CV.SCALE : pad;
    const top = U.y, outer = U.inCard;
    U.inCard = true;
    /* F2-7：记下"量这一遍"登记了哪些热区 —— 实画那一遍同一颗就不再登记（见 CV.hit 那段注释）。 */
    const hitFrom = (CV.hits || []).length;
    U.dry = true; U.y = top + padY; content(); const inner = U.y - top - padY;
    U.dry = false;
    /* 量这一遍登记了哪些热区（id → 矩形）：实画那一遍"被它包住的重复件"才跳（见 CV.hit 那段注释）。 */
    const measured = new Map();
    (CV.hits || []).slice(hitFrom).forEach(function (o) { measured.set(String(o.id), o); });
    /* V1.0.1（父亲大人："新的一波开始上一波的日志会清空，日志卡就缩上去重新拉长，
       你直接锁定卡片的高度"）：加一个 minH —— 内容变少时卡片也撑住固定高度，
       高度不再随内容涨缩。 */
    const minH = (opt && opt.minH) ? opt.minH * CV.SCALE : 0;
    const h = Math.max(inner + padY * 2, minH);
    /* V1.1.15：**整卡在屏外就不画第二遍**（第一遍的 dry 测量已经把高度算准 → `U.y` 照样推进）。
       跳过的是"画"（背景 + 里面每个字的 fillText）；`U.y = top + h + SP[2]` 在下面统一给，
       所以布局与滚动条长度一个像素都不会变。屏外的按钮不登记热区也没关系 ——
       滚到它的时候会重新渲染、那时就登记上了。 */
    const cardVis = U.onScreen(top, h);
    /* opt.line：卡片描边的颜色（V1.1.3 加）。
       用途是**命格卡**：网页版 `.bl-scope { border-color: var(--t-line2) }` ——
       六张命格卡的边框各走本命格的暗档。canvas 这端原来 CV.card 只吃默认描边，
       于是"选命格"页在小游戏里是六张一模一样的灰卡（网页版是六种颜色的卡）。 */
    if (h > 4 && cardVis) CV.card(U.pad(), top, U.cw(), h, (opt && opt.line) ? { line: opt.line } : null);
    if (cardVis) {
      const prevSkip = U.hitSkip;
      U.hitSkip = measured;
      U.y = top + padY; content();
      U.hitSkip = prevSkip;
    } else {
      /* ================= F6 #12（抢修单 0928 · 屏外卡的"幽灵热区"）=================
       `U.dry` 那一遍**照样登记热区**（那条规矩不能动：屏外卡只有这一遍登记，
       引导（`U.drawCoach`）就是拿 `CV.hits` 里的锚点矩形把目标滚进视野的 ——
       改成"dry 不登记"会让主线引导指不到目标，V1.1.15 已经栽过一次）。
       但"实画那一遍不跑"意味着这些矩形**永远不会被第二遍覆盖/校正**：
       实测 61 屏共 915 条热区里 **130 条落在内容坐标可达窗口之外**（最远超出 5409px）。
       它们打不着（坐标根本不在可视窗口里），却会：
         · 参与 `CV.hit` 里那条"撞上就缩回原样"的 `some()` 撞测（每帧 ~n²）；
         · 让 `CV.hits` 越滚越长，将来更容易真撞车。
       处置：**打标记 `ghost`**，命中层（`scanHit`）与撞测层（`CV.hit`）都跳过它，
       但**留在 CV.hits 里**给引导与尺子当锚点 —— 两边的要求同时满足。
       ⚠️ 不改成"直接 CV.hits.length = hitFrom"就是因为引导那条硬依赖（见上）；这是有依据的偏离。 */
      for (let i = hitFrom; i < CV.hits.length; i++) CV.hits[i].ghost = true;
    }
    U.inCard = outer;
    U.y = top + h + CV.SP[2];
    U.lastBottom = CV.SP[2];
    return h;
  };

  /* ---------- 卡片标题行 .card h3（V9.5.30：标题 / 右侧小字 / 右侧按钮三条同一中线）
     · 左边 3×13 金色竖条 + 标题 15px 粗体；右侧小字 11px 灰、贴右。 ---------- */
  U.h3 = function (title, sub, opt) {
    opt = opt || {};
    /* opt.btn = { label, id }：标题行右侧的小按钮（网页版 .card h3 .hbtn，和标题/小字同一中线） */
    /* opt.glyph = { bl, color, size }：标题**前面**挂一枚命格印记（V1.1.3 加）。
       网页版的命格卡标题是 `blGlyph(id,18) + 名字`，印记在名字左边；
       小游戏原来只能把印记画在标题行右端（主角页那几处就是这么画的，因为右边没有按钮），
       而"选命格"页右边是「觉醒」按钮 —— 挤不下，于是那一页干脆没有印记。
       现在按网页版的位置画：竖条 → 印记 → 名字，右边的按钮不动。 */
    const glyph = opt.glyph || null;
    const gs = glyph ? (glyph.size || CV.ICO) * CV.SCALE : 0;
    /* V1.0.6（父亲大人 09-24 反馈图 02）：**印记跟在标题文字后面**这种站位（网页版的
       `🧬 命格 ${blGlyph(...)} <span class="sub">Lv.…</span>` 就是这么排的）。
       以前没这个口子，主角 / 伙伴 / 精华三处的命格卡只能把印记甩到标题行**最右端**，
       正好压在右对齐的 `Lv.1 / 50` 上（截图里那个"50"就是这么没的）。
       opt.glyph.after = true → 画在标题文字之后；不给就是默认的"标题之前"（选命格页那种）。 */
    const gBefore = glyph && !glyph.after;
    /* V9.6.118（父亲大人："技能的重置和下面加点的框还是贴的很近"）：
       网页版的 .hbtn 是 **2.125rem = 34px** 高，而 h3 是 flex 行 —— 行高会被按钮撑到 34px，
       再吃 10px 下边距，下面第一块才起步。画布这边原来只画了 26px 的按钮、
       行高又按"标题行高 19.5px"算 —— 于是按钮比行高还高出 6.5px，
       直接压到下面第一行面板上（截图里"重置"和第一颗 +1 贴在一起就是这么来的）。
       现在：行高 = max(标题行高, 按钮高)，按钮居中在行内，再由下面 10px 收尾。 */
    const bar = 3, gap = 7, lh = CV.FS.f1 * 1.3;
    const btnH = U.BTN_TITLE * CV.SCALE;
    const rowH = opt.btn ? Math.max(lh, btnH) : lh;
    if (opt.btn) {
      const bw = CV.measure(opt.btn.label, CV.FS.sm) + 20 * CV.SCALE;
      /* V1.0.1（开发自审会诊）：标题行的小按钮也要能进禁用态 —— 原来只传 id，
         于是 `id: 条件 ? 'x' : ''` 那种写法在"条件不满足"时按钮**看着能点、却既没热区也没提示**。 */
      U.btn(U.ix() + U.iw() - bw, U.y + (rowH - btnH) / 2, bw, btnH, opt.btn.label, 'ghost', opt.btn.id, opt.btn.dis);
    }
    const top = U.y;
    draw(() => {
      const cy = top + rowH / 2;                     // 标题 / 小字 / 按钮共用这一条中线
      const g = CV.ctx.createLinearGradient(0, cy - 6.5, 0, cy + 6.5);
      g.addColorStop(0, CV.C.gold); g.addColorStop(1, CV.C.goldDeep);
      CV.round(U.ix(), cy - 6.5, bar, 13, CV.RADIUS_CHIP,  g);
      /* 印记：与左边的金色竖条同一中线（顶点表来自 data.js:BLOOD_GLYPH，两端共用一份） */
      if (gBefore) CV.blGlyph(glyph.bl, U.ix() + bar + gap + gs / 2, cy, gs, glyph.color || CV.C.text);
      /* opt.color：标题颜色（网页版是内联 color，比如"没激活的产线标题压灰、激活的走金色"） */
      /* V9.6.142：标题原来**一律**按 `iw - 120` 截断 —— 哪怕这一行既没有小字也没有按钮
         （玩法指南那些章标题就是这么被砍成「⑸ 血统与境界线：换了血统就换了…」的）。
         现在只有真的有右侧内容时才让位；只有标题时占满整行。 */
      const titleMax = ((opt.btn || sub) ? (U.iw() - 120) : (U.iw() - bar - gap - 4 * CV.SCALE))
        - (gs ? gs + 4 * CV.SCALE : 0);
      const titleX = U.ix() + bar + gap + (gBefore ? gs + 4 * CV.SCALE : 0);
      const shown = CV.fit(title, titleMax, CV.FS.f1, true);
      CV.text(shown, titleX, cy,
        { size: CV.FS.f1, bold: true, color: opt.color || CV.C.text, ls: 0.2 });   // .card h3 letter-spacing .2px
      /* 印记跟在标题文字之后（网页版 `名字 + blGlyph` 那种站位） */
      if (glyph && glyph.after) {
        CV.blGlyph(glyph.bl, titleX + CV.measure(shown, CV.FS.f1, true) + 4 * CV.SCALE + gs / 2, cy, gs, glyph.color || CV.C.text);
      }
      const subRight = opt.btn ? (CV.measure(opt.btn.label, CV.FS.sm) + 30 * CV.SCALE) : 0;   // 让开右侧按钮
      if (sub) CV.text(CV.fit(sub, U.iw() - 90 - subRight, CV.FS.sm), U.ix() + U.iw() - subRight, cy, { size: CV.FS.sm, color: opt.subColor || CV.C.dim, align: 'right' });
    });
    U.y = top + rowH + 10 * CV.SCALE;                 // 标题下边距 10（.card h3 margin-bottom）
    return rowH + 10 * CV.SCALE;
  };

  /* ---------- 键值行 .kv（左灰标签 / 右值，左右两端贴齐内容区） ---------- */
  U.kv = function (k, v, color) {
    const lh = CV.FS.lg * 1.35, pad = 5 * CV.SCALE, h = lh + pad * 2;
    const top = U.y;
    draw(() => {
      const cy = top + h / 2;
      /* V9.6.142（父亲大人："伴生体的孵化那行字被省略了……每10颗.…"）：
         原来这里**死板地**把左边按 55%、右边按 45% 去 fit —— 于是右边稍长一点就被砍成
         「兽魂石 0 颗 · 每 10 颗…」。这是通用缺陷，任何一个 kv 行只要值长一点都会中招。
         现在先量两边：**放得下就按自然宽度画，谁也不截**；真的放不下时，
         优先保住右边的数值（它是玩家真正要看的东西），只截左边那半。
         —— 于是"每 10 颗孵 1 只"这种完整的短句再也不会被无谓地砍掉。 */
      const gap = 10 * CV.SCALE, iw = U.iw();
      const kw = CV.measure(k, CV.FS.lg), vw = CV.measure(v, CV.FS.lg);
      let kMax, vMax;
      if (kw + gap + vw <= iw) { kMax = kw; vMax = vw; }              // 放得下：原样
      else if (vw <= iw * 0.62) { vMax = vw; kMax = iw - vw - gap; }   // 右边不长：先保右边
      else { vMax = iw * 0.62; kMax = iw - vMax - gap; }               // 两边都长：才各让一步
      CV.text(CV.fit(k, kMax, CV.FS.lg), U.ix(), cy, { size: CV.FS.lg, color: CV.C.dim });
      CV.text(CV.fit(v, vMax, CV.FS.lg), U.ix() + iw, cy, { size: CV.FS.lg, color: color || CV.C.text, align: 'right' });
      CV.ctx.save();
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + h - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + h - .5); CV.ctx.stroke();
      CV.ctx.restore();
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 提示小字 .hint（11px 灰，行高 1.7）/ 说明 .note（12px 灰，行高 1.75） ---------- */
  /* widthIn：给"左文字 + 右按钮列"这种两栏卡用（网页版左列 flex:1，右列按内容宽）。
     不传就是整块内容宽。 */
  function wrapBlock(text, size, lh, color, gapTop, widthIn) {
    const lhPx = size * lh;
    const W = widthIn || U.iw();
    /* V1.0.6：`.hint / .note` 这类说明行改成**词级折行** —— 网页版是 CSS 折行，
       它**永远不会**把 "1500" / "+150%" 这种数字从中间劈开；画布端原来逐字折，
       于是"四支天赋点满各需 ♾ 6200（10/20/…/1500/2500）"会被劈成「…/100」/「0/1500/2500）」。
       换成 CV.wrapTokens 后与网页版同一条规矩：只在 · / → / 空格 / 全角空格处断。 */
    const lines = CV.wrapTokens(text, W, size, 6);
    const top = U.y + (gapTop || 0);
    draw(() => lines.forEach((ln, i) => CV.text(ln, U.ix(), top + lhPx * (i + 0.5), { size, color })));
    U.y = top + lines.length * lhPx;
    return lines.length * lhPx;
  }
  /* V9.6.90：第 3 个参数以前叫 widthIn（两栏卡用的可用宽度），但全仓从来没人传过宽度，
     倒是有地方想传"颜色" —— 统一改成 color，别再让调用方猜。 */
  /* V9.6.143（版面尺子抓到的真 bug）：第三参数是**颜色**，可炼化台那两行把**宽度**传了进来 ——
     于是 `fillStyle` 被赋成一个数字（画布会忽略非法颜色，继续用上一次的颜色），
     而且宽度没生效 → 文字按整卡宽度折行、直接压到右边的按钮底下。
     现在补一个第四参数 widthIn：要限宽就传 `U.hint(文本, 间距, 颜色, 宽度)`，
     调用方不用再猜"这个位置到底是颜色还是宽度"。 */
  U.hint = function (text, gapTop, color, widthIn) { return wrapBlock(text, CV.FS.sm, 1.7, color || CV.C.dim, gapTop, widthIn); };
  U.note = function (text, gapTop, widthIn) { return wrapBlock(text, CV.FS.md, 1.75, CV.C.dim, gapTop, widthIn); };

  /* ---------- 技能行 .skill-row（V9.6.117：主角详情 / 伙伴详情**共用这一个**）----------
     网页版的规矩（css 里 .skill-row 那三条），画布照抄：
       · 每条技能是**自己的一个面板**：panel 底 / 圆角 10 / 内边距 10 / 条与条之间 8px
       · .sname 三级(13px)粗体 ＋ 紧跟一枚五级(11px)描边胶囊（Lv.N/M）＋ 可选 +1 按钮（同一中线）
       · .sdesc 五级(11px)灰字，**距名字 3px**，行高 1.55
     起因（父亲大人："技能的版面有问题，间距又又贴在一起的了"）：
     原来两个页面各写一套（一个把名字/胶囊/描述直接铺在卡片上、行高只有 22px，
     另一个把 +1 做成整行大按钮），胶囊和描述贴在一起、间距还和别处不一样。
     现在只有这一份实现，层级和间距都跟着 .skill-row 走。 */
  U.skillRow = function (o) {
    o = o || {};
    const PAD = 10 * CV.SCALE, GAP = 8 * CV.SCALE;
    const name = String(o.name || '');
    /* V9.6.120（父亲大人："技能名称的字体大小要跟六维的字体大小一样啊，他们不是属于一个层级的吗"）：
       技能名升到**二级（15px）** —— 和六维那一行的名字（.list-row .t1）同一级。
       网页版 .skill-row .sname 同步从 0.8125rem(13px) 改成 var(--fs-1)(15px)，两边一起动。 */
    const nameH = CV.FS.f1 * 1.35;
    const btnH = o.btnId === undefined ? 0 : U.BTN_SM * CV.SCALE;
    const bw = o.btnId === undefined ? 0 : 52 * CV.SCALE;
    const tagW = o.tag ? (CV.measure(o.tag, CV.FS.sm) + 12 * CV.SCALE) : 0;
    const tagH = o.tag ? (CV.FS.sm * 1.4 + 2 * CV.SCALE) : 0;
    /* ⚠️ V1.0.6（父亲大人 09-24 反馈图 01：「必杀·永夜排宴那一行的按钮跟上面两行没对齐」）——
       真因不是"按钮没对齐"，是**描述文字从 +1 按钮底下穿过去了**：
       描述原来按"整幅内宽"折行（`U.iw() - PAD*2`），而按钮占着右边 ~52px，
       于是最长那条描述（必杀那行）第一行的尾巴正好压在按钮上 —— 看着就像"按钮挪了位置"。
       网页版 .skill-row 是 flex 两列（.sbody 只占左边那列），描述永远不许压按钮；
       这里按网页版把按钮的宽度留出来（没按钮的行不受影响）。 */
    const descW = U.iw() - PAD * 2 - (o.btnId === undefined ? 0 : bw + 6 * CV.SCALE);
    const descLines = o.desc ? CV.wrap(o.desc, descW, CV.FS.sm) : [];
    const descH = descLines.length ? (3 * CV.SCALE + descLines.length * CV.FS.sm * 1.55) : 0;
    /* V9.6.120（父亲大人："你得对齐这两者的组合，把左边当成一个整体去对齐，
       你现在只对齐上面的名称"）：
       左边的**技能名 + 小字注释是一整个组合**，按钮要对齐这个组合的中线 ——
       不是只跟名称那一行对齐（那样注释一长，整块看着就偏上）。
       所以：左边整块高 = 名字行 + 注释块；`cy` 取这块的中点，按钮挂在 cy 上，
       名字与注释这一整块也以 cy 为中心上下摊开。按钮高再与整块取大者，保证不戳出面板。 */
    const leftH = nameH + descH;
    const contentH = Math.max(leftH, btnH);
    const rowH = PAD * 2 + contentH;
    const top = U.y;
    CV.round(U.ix(), top, U.iw(), rowH, CV.RADIUS, CV.C.panel);   // 参数：圆角 10 / 底色 panel（少一个参数会整块没底）
    const cy = top + PAD + contentH / 2;
    const leftTop = cy - leftH / 2;              // 左边整块的顶（整块绕 cy 居中）
    CV.ctx.save();
    if (o.dim) CV.ctx.globalAlpha = 0.5;
    const nameMax = U.iw() - PAD * 2 - bw - tagW - 12 * CV.SCALE;
    const shown = CV.fit(name, nameMax, CV.FS.f1, true);
    CV.text(shown, U.ix() + PAD, leftTop + nameH / 2,
      { size: CV.FS.f1, bold: true, color: o.color || CV.C.text });
    const nw = CV.measure(shown, CV.FS.f1, true);
    if (o.tag) {
      const tx = U.ix() + PAD + nw + 6 * CV.SCALE, ty = leftTop + nameH / 2;
      CV.round(tx, ty - tagH / 2, tagW, tagH, CV.RADIUS_SM, null, CV.C.line2);
      CV.text(o.tag, tx + tagW / 2, ty, { size: CV.FS.sm, color: CV.C.text2, align: 'center' });
    }
    descLines.forEach(function (ln, k) {
      CV.text(ln, U.ix() + PAD, leftTop + nameH + 3 * CV.SCALE + CV.FS.sm * 1.55 * (k + 0.5),
        { size: CV.FS.sm, color: CV.C.dim });
    });
    CV.ctx.restore();
    if (o.btnId !== undefined) {
      /* 不能点的时候画成**禁用态**（网页版 .btn[disabled]{opacity:.34}），
         不留"看着能点、点了没反应"的假按钮。 */
      U.btn(U.ix() + U.iw() - PAD - bw, cy - btnH / 2, bw, btnH, o.btnLabel || '+1',
        o.btnStyle || 'ghost', o.btnId, !!o.btnDis);
    }
    U.y = top + rowH + (o.last ? 0 : GAP);
    return rowH;
  };

  /* ---------- 说明框 .event-desc（网页版：bg --panel / 圆角 10 / 内边距 12 / 13px 灰字 1.7 行高）
     开局契约、起名提示这类"成段说明"都用它，别再直接铺在卡片上。 ---------- */
  U.eventDesc = function (lines, gapIn) {
    const pad = 12 * CV.SCALE, size = CV.FS.lg, lh = size * 1.7;
    const src = [].concat(lines || []);
    // 先按宽度把所有行折出来（每行可以是纯文本，也可以是 { t, color, bold }）
    const out = [];
    src.forEach((raw) => {
      const obj = (typeof raw === 'string') ? { t: raw } : raw;
      if (!obj || !obj.t) { out.push({ t: '', blank: true }); return; }
      /* 行尾可以接一段不同颜色的字（网页版是 <b style="color:var(--accent)">执灯者</b> 这种内联强调） */
      const full = obj.tail ? (obj.t + obj.tail.t) : obj.t;
      const ws = CV.wrap(full, U.iw() - pad * 2, size, 8);
      ws.forEach((ln, i) => {
        const last = i === ws.length - 1;
        // 末尾那段如果整段都在这一行里，就拆成"前半 + 强调后半"两截画
        let head = ln, tail = null;
        if (last && obj.tail && ln.length > obj.tail.t.length && ln.slice(-obj.tail.t.length) === obj.tail.t) {
          head = ln.slice(0, ln.length - obj.tail.t.length);
          tail = obj.tail;
        }
        out.push({ t: head, color: obj.color, bold: obj.bold && last, tail });
      });
    });
    const h = pad * 2 + out.length * lh;
    const top = U.y + (gapIn || 0);
    draw(() => {
      CV.round(U.ix(), top, U.iw(), h, CV.RADIUS, CV.C.panel);
      out.forEach((o, i) => {
        if (!o.t) return;
        const x0 = U.ix() + pad, cy = top + pad + lh * (i + 0.5);
        CV.text(o.t, x0, cy, { size, color: o.color || CV.C.dim, bold: o.bold });
        if (o.tail) {
          const w1 = CV.measure(o.t, size, o.bold);
          CV.text(o.tail.t, x0 + w1, cy, { size, color: o.tail.color || CV.C.dim, bold: o.tail.bold });
        }
      });
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 区块小标题 .section-title（12px 字距 1px，右边一条线） ---------- */
  U.sectionTitle = function (text) {
    /* V9.6.1（父亲大人："上面的间距太大了，要和下面一样"）：小节标题上下间距必须相等 ——
       上面那块卡片自己已经留了 14px 下边距，这里只补差额，两边都是 14px。 */
    const WANT = CV.SP[2];
    const extraTop = Math.max(0, WANT - (U.lastBottom || 0));
    const top = U.y + extraTop, lh = CV.FS.md * 1.3;
    draw(() => {
      const cy = top + lh / 2;
      CV.text(text, U.ix() + 4, cy, { size: CV.FS.md, color: CV.C.text2, bold: true, ls: 1 });   // .section-title letter-spacing 1px
      const w = CV.measure(text, CV.FS.md, true);
      CV.ctx.strokeStyle = CV.C.line; CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.ix() + 4 + w + 10, cy); CV.ctx.lineTo(U.ix() + U.iw() - 4, cy); CV.ctx.stroke();
    });
    U.y = top + lh + WANT;
    U.lastBottom = WANT;
    return lh + extraTop + WANT;
  };

  /* ---------- 三列文字宫格 .text-menu + .tile（名字 13 粗体 / 状态 11 灰，居中） ---------- */
  /* groupId：给**整片宫格**登记一个锚点（引导要整片高亮，不能只框第一个格子）。
     它登记在最后 → 派发时先命中它（引导只放行它，格子本身的热区被挡住）。 */
  U.tiles = function (list, cols, groupId) {
    cols = cols || 3;
    /* V9.6.7：网页版 .text-menu 的 gap 是 var(--sp2)=10px（不是 sp3=14）。
       第 0 版这里写成 CV.SP[2] 了 —— 格子因此窄 3px、缝宽 4px，整块宫格跟网页版对不上。 */
    const gap = CV.SP[1], cellW = (U.iw() - gap * (cols - 1)) / cols;
    const th = 54 * CV.SCALE;
    const startY = U.y;
    list.forEach((t, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = U.ix() + c * (cellW + gap), y = startY + r * (th + gap);
      /* t = [动作, 名字, 小字(可空), 解锁(可空), 红点] —— 和网页版 tile(x) 同一份结构。
         V9.5.68（父亲大人）：主页格子里**只留功能名**；"有东西可领"改用红点表达。 */
      const dot = t[4];
      draw(() => {
        CV.round(x, y, cellW, th, CV.RADIUS_CHIP,  CV.C.panel, CV.C.line2);
        const inner = cellW - 12 * CV.SCALE;
        const hasSub = !!(t[2]);
        const cy = hasSub ? y + th / 2 - 7 * CV.SCALE : y + th / 2;
        const nameW = CV.measure(t[1], CV.FS.lg, true);
        const dotW = dot ? 10 * CV.SCALE : 0;
        const tx = x + cellW / 2 - (nameW + dotW) / 2;
        CV.text(CV.fit(t[1], inner - dotW, CV.FS.lg, true), tx, cy, { size: CV.FS.lg, bold: true });
        if (dot) {                                    // 网页版 .tt-dot：6px 红点，跟在名字右边 4px
          CV.ctx.beginPath();
          CV.ctx.arc(tx + nameW + 4 * CV.SCALE + 3 * CV.SCALE, cy - 5 * CV.SCALE, 3 * CV.SCALE, 0, Math.PI * 2);
          CV.ctx.fillStyle = CV.C.accent; CV.ctx.fill();
        }
        if (hasSub) CV.text(CV.fit(t[2], inner, CV.FS.xs), x + cellW / 2, cy + 15 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      });
      if (t[0]) CV.hit(t[0], x, y, cellW, th);
    });
    const rows = Math.ceil(list.length / cols);
    if (groupId) CV.hit(groupId, U.ix(), startY, U.iw(), rows * th + (rows - 1) * gap);
    U.y = startY + rows * th + (rows - 1) * gap;
    U.lastBottom = 0;
    return rows * th + (rows - 1) * gap;
  };

  /* ---------- 列表行 .list-row（左标题+说明、右按钮） ---------- */
  U.listRow = function (o) {
    const t1 = CV.FS.f1 * 1.35, t2 = CV.FS.sm * 1.55, pad = 10 * CV.SCALE;
    /* o.ico：行首一个大字符（网页版 .list-row 里那个 <span style="font-size:1.1875rem">）。
       o.rightText：行尾一段灰色小字（网页版 游历 / 秘术阁 那些行的右侧奖励）。 */
    const icoW = o.ico ? (CV.measure(o.ico, 19 * CV.SCALE) + 10 * CV.SCALE) : 0;
    const rightW = o.rightText ? (CV.measure(o.rightText, CV.FS.sm) + 10 * CV.SCALE) : 0;
    /* V9.6.7：网页版 .t1/.t2 是**换行**的（没有 line-clamp），原来这里用 CV.fit 单行截断，
       "开启后进入战斗立即结算，不再逐帧播放，适合挂机刷本"会被砍成"…适…"。
       现在按可用宽度折行，行高照 CSS 的 line-height（t1 1.35 / t2 1.55）。 */
    const availW = U.iw() - (o.rightW || 0) - rightW - icoW - 12 * CV.SCALE;
    /* o.tag：标题行右侧跟着一枚小标（网页版 .list-row .t1 > .tag，金色描边胶囊） */
    const tagW = o.tag ? (CV.measure(o.tag, CV.FS.xs) + 14 * CV.SCALE) : 0;
    /* V9.6.117（排版层级）：o.t1sub = 跟在标题后面的一段**五级**灰字
       （网页版六维那行就是 `<span style="color:var(--dim);font-size:0.6875rem">` 内联在标题里）。
       以前没有这个口子，只能把名字和解释拼成一个字符串整行画成**二级** —— 解释文字于是和名字一样大
       （父亲大人："六维的解释文字太大了"）。 */
    const subW = o.t1sub ? (CV.measure(' ' + o.t1sub, CV.FS.sm) + 4 * CV.SCALE) : 0;
    const l1 = CV.wrap(o.t1, availW - tagW - subW, CV.FS.f1);
    /* V1.0.6：列表行的第二行（任务条件 / 奖励这类带数字的话）同样走词级折行 ——
       "…奖励 ◆ 100 · ✦ 200" 原来会被劈成「…◆ 10」/「0 · ✦ 200」。 */
    const l2 = o.t2 ? CV.wrapTokens(o.t2, availW, CV.FS.sm) : [];
    /* ================= F7 ①b（0928）· 列表行的高度下限走**物理口径** =================
       这条下限原来是 `44 * CV.SCALE`：F7 ① 之后小屏上 CV.SCALE ≈ 0.82 → 行高只有 36.6，
       而行与行之间只隔几个像素 —— **热区怎么摆都挤不进 44**
       （实测 320×568 设置页 `toggle:savePower`：上面 36.6、下面 31，左边右边都是别人，五路皆撞）。
       现在下限固定 44（＝ `CV.minHitPx()`，WCAG/HIG 那条物理口径，**不跟屏宽缩**）：
       小屏上行的**视觉**（按钮高 33 / 内边距 / 圆角）照旧是缩过的，动的只是"这一行占多高" ——
       行内反而多出 11px 呼吸位，比原来"按钮几乎撑满行"更松。 */
    const h = Math.max(pad * 2 + l1.length * t1 + (l2.length ? 4 * CV.SCALE + l2.length * t2 : 0), CV.minHitPx());
    const top = U.y;
    draw(() => {
      if (o.dim) CV.ctx.save(), CV.ctx.globalAlpha = 0.45;   /* 网页版已领取行 opacity:.45/.5 */
      const y0 = top + pad;
      if (o.ico) CV.text(o.ico, U.ix() + 4, y0 + (l1.length * t1 + (l2.length ? 4 * CV.SCALE + l2.length * t2 : 0)) / 2, { size: CV.ICO * CV.SCALE });
      if (o.rightText) CV.text(o.rightText, U.ix() + U.iw(), y0 + (l1.length * t1) / 2, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      /* V1.1.6（A6）：标题行支持 `o.t1Color` —— 装备候选列表要按**品质色**画名字
         （网页版那一行是 `class="t1 rtext-<rarity>"`）。原来这个口子是"传了也没人读"
         （`sc-last` 的 coreRow / `sc-bag` 的 listBtn 都传过 t1Color），现在补上；
         不传时就是原来的默认字色，别的页面一个字都不变。 */
      l1.forEach((ln, i) => CV.text(ln, U.ix() + 4 + icoW, y0 + t1 * (i + 0.5), { size: CV.FS.f1, bold: true, color: o.t1Color || CV.C.text }));
      if (o.t1sub) {
        /* 解释文字跟在**最后一行**标题后面（和网页版同一行同一个基线） */
        const lastW = CV.measure(String(l1[l1.length - 1]), CV.FS.f1, true);
        CV.text(o.t1sub, U.ix() + 4 + icoW + lastW + 6 * CV.SCALE, y0 + t1 * (l1.length - 0.5),
          { size: CV.FS.sm, color: CV.C.dim });
      }
      if (o.tag) {
        const tw = CV.measure(l1[l1.length - 1], CV.FS.f1, true), th = CV.FS.xs * 1.5;
        const tx = U.ix() + 4 + icoW + Math.min(tw, availW - tagW) + 6 * CV.SCALE, ty = y0 + t1 * (l1.length - 0.5) - th / 2;
        CV.round(tx, ty, tagW, th, CV.PILL,  null, CV.C.gold);
        CV.text(o.tag, tx + tagW / 2, ty + th / 2, { size: CV.FS.xs, align: 'center', color: CV.C.gold });
      }
      l2.forEach((ln, i) => CV.text(ln, U.ix() + 4 + icoW, y0 + l1.length * t1 + 4 * CV.SCALE + t2 * (i + 0.5),
        { size: CV.FS.sm, color: CV.C.dim }));
      CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.lineWidth = 1;
      CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + h - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + h - .5); CV.ctx.stroke();
      if (o.dim) CV.ctx.restore();
    });
    U.y = top + h;
    return h;
  };

  /* ---------- 按钮 .btn（**金底只有一套**：primary 与 gold 同底同字 / ghost；高度 44） ---------- */
  /* dis=true：网页版 `.btn[disabled] { opacity:.34; pointer-events:none }` —— 变灰、且不登记热区 */
  U.btn = function (x, y, w, h, label, style, id, dis) {
    h = h || U.BTN_H * CV.SCALE;
    const goldBtn2 = style === 'primary' || style === 'gold';
    /* V1.1.x（0927-P · 父亲大人：「最下面就一个**红色边框**按钮写删除当前进度重新开始…
       红不要用纯 #FF0000 那种刺目的」）：
       danger ＝ **只描边不填底**的危险按钮（与 ghost 同一套形，只换颜色）——
       描边取色板里的 `danger`（#d43a4f，面/线用），**字取 `dangerText`**（#e8626f，
       项目里"深底上写红字"的那一档，12px 上对比度 5.15 达标；直接用 danger 写小字不过 AA）。
       新增这一档是往通用件上加，不是给某一颗按钮开小灶 —— 以后别处要危险按钮照样用 'danger'。 */
    const danger = style === 'danger';
    const g = goldBtn2 ? CV.ctx.createLinearGradient(0, y, 0, y + h) : null;
    /* 金底按钮**只有一套**（V1.1.2 父亲大人：「金底的按钮都改成白色字」）——
       深金渐变 ＋ 白字，与网页版 .btn.primary / .btn.gold 同一套令牌（--gold-btn / --gold-btn-deep / --on-gold）。
       原来两边不同底也不同字：primary 亮金配深墨字（**最深端只有 3.82**，照样不过 AA）、
       gold 深金配奶白字（**上端只有 2.76**）。字色一动底色就得跟着压深（「改颜色不许只改颜色」）：
       白字对渐变上下两端 4.85 / 6.91，两段都过 AA。 */
    if (goldBtn2) { g.addColorStop(0, CV.C.goldBtn); g.addColorStop(1, CV.C.goldBtnDeep); }
    const fill = g || (style === 'ghost' || danger ? null : CV.C.panel2);
    /* V9.6.90：颜色一律 rgba()，**不许用 8 位 hex**（#RRGGBBAA）——
       微信画布对这个格式"部分支持/不稳定"，赋值失败时画布会**保持上一次的填充色**，
       表现就是"黑底黑字"（父亲大人最早报的那个毛病）。见 canvas_audit 的同名规则。 */
    const line = danger ? CV.C.danger : (style === 'ghost' ? CV.C.line : (goldBtn2 ? CV.a(CV.C.gold, .33) : CV.C.line2));
    draw(() => {
      if (dis) { CV.ctx.save(); CV.ctx.globalAlpha = 0.34; }
      /* 按下态：网页版 .btn:active 是 scale(.97) + 背景压暗一档。
         画布里做等价的两件事 —— 四周缩进 1px + 叠一层半透明黑。 */
      const down = CV.pressed && id && CV.pressed === id;
      if (down) { x += 1; y += 1; w -= 2; h -= 2; }
      CV.round(x, y, w, h, CV.RADIUS_SM, fill, line);
      if (down) CV.round(x, y, w, h, CV.RADIUS_SM, CV.a(CV.C.shade, .22), null);
      /* 长标签换行，不截断 —— 网页版 .btn-row .btn { white-space: normal; line-height: 1.25 } */
      const size = h <= U.BTN_SM * CV.SCALE ? CV.FS.md : CV.FS.lg;
      const lines = CV.wrap(label, w - 16 * CV.SCALE, size, 2);
      const lh = size * 1.25;
      lines.forEach(function (ln, i) {
        CV.text(ln, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh,
          { size, bold: goldBtn2, align: 'center', color: goldBtn2 ? CV.C.onGold : (danger ? CV.C.dangerText : CV.C.text) });
      });
      if (dis) CV.ctx.restore();
    });
    /* ================= F2-5（抢修单 0928R3）· 假按钮的**运行时**告警 =================
     "空 id 且没给 `dis`" ＝ 一颗画成正常样子、却没有热区的按钮（看着能点、点了没反应）。
     全项目一批 14 处就是这么来的（`id: 条件 ? 'x' : ''` 漏了 `dis`）。静态那条尺子
     （`tap_audit` 的⓪）只认一种写法、还可能被新的写法绕过去；这条谁写都躲不掉。
     ⚠️ 只**出声**、不抛不拦 —— 玩家不该为开发者的一行疏忽买单（线上多一条崩点更糟）。 */
    if (!id && !dis) {
      try { if (typeof console !== 'undefined' && console.warn) console.warn('[tap-guard] 空 id 且未禁用（看着能点、点了没反应）：' + label); } catch (e) {}
    }
    if (id && !dis) CV.hit(id, x, y, w, h);
    return h;
  };
  /* 一行按钮（等分；网页版 .btn-row） */
  U.btnRow = function (list, gapIn, hIn) {
    const gap = gapIn === undefined ? 10 * CV.SCALE : gapIn, h = (hIn || U.BTN_H) * CV.SCALE;
    const top = U.y;
    /* 宽度按"文字自然宽"比例分（网页版 .btn-row .btn 是 flex: 1 1 auto + min-width 5.375rem）：
       字多的按钮拿更多宽度，所以"免费抽 1 次（今日还剩 3 次）"这类长标签在网页版是一行，
       等分宽度会把它们挤成两行。 */
    const nat = list.map((b) => Math.max(U.BTN_MINW * CV.SCALE, CV.measure(b.label, CV.FS.lg) + 24 * CV.SCALE));
    const minw = U.BTN_MINW * CV.SCALE;
    /* ================= V1.1.11（康康 09-27 · 父亲大人报"小屏幕背包显示有问题"的同一次排查）==========
       上面那句注释说"网页版 .btn-row 是 flex-wrap"—— **可这段实现从来没换过行**：
       它把每颗按 `max(minw, 自然宽×比例)` 算完就横着排下去，窄屏上总数超过可用宽就**直接出画**。
       实测：扫荡页那 4 颗（扫荡×1/×5/×10/全部剩余）在 320×568 上，第 4 颗从 x=319 开始画
       （画布只有 320 宽）——而当时**所有尺子全绿**（页面级排版只在 390 宽上检过，见 layout_audit）。
       ⇒ 现在真的换行：先试一行，放不下就按"一行能塞几颗"分行（高度按行数往上加）。 */
    const avail1 = U.iw() - gap * (list.length - 1);
    const sum = nat.reduce((a, b) => a + b, 0) || 1;
    const oneRow = nat.map((w) => Math.max(minw, w * avail1 / sum));
    const total1 = oneRow.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
    const rows = [];
    if (total1 <= U.iw() + 0.5 || list.length <= 1) {
      rows.push(oneRow);
    } else {
      let cur = [], curW = 0;
      nat.forEach((w) => {
        const add = cur.length ? gap + w : w;
        if (cur.length && curW + add > U.iw() + 0.5) { rows.push(cur); cur = [w]; curW = w; }
        else { cur.push(w); curW += add; }
      });
      if (cur.length) rows.push(cur);
    }
    let y = top, idx = 0;
    rows.forEach((ws) => {
      const avail = U.iw() - gap * (ws.length - 1);
      const s = ws.reduce((a, b) => a + b, 0) || 1;
      const widths = ws.map((w) => Math.max(minw, w * avail / s));
      let x = U.ix();
      ws.forEach((w, k) => {
        const b = list[idx] || {};
        /* ================= V1.0.4 · R10（父亲大人 09-27 点单：原生按钮那一排）=================
           `b.native(x, y, w, h)` —— "这一格由**原生组件**占着"的钩子（现在是意见反馈那颗）。
           它返回 true ＝ 原生已经摆在这一格上，画布**不要再画**（画了就是两层叠着、字重影）；
           返回 false ＝ 原生这会儿不在位（开发者工具 / 老基础库 / 正在滑动），
           由下面的 `U.btn` 画兜底那颗顶上 —— 这正是 gameclub 那套"原生在位才交给它"。
           ⚠️ F3 · 0930L：钩子也可以返回**一个矩形**（`{x,y,w,h}`，见 `N.canvasRect`）——
              那就是"画布兜底这颗请画在这个**整数屏幕框**里"（与原生那颗逐像素对齐，
              免得两层换手时描边差半个像素 / 长得不一样 = 父亲大人说的"闪")。
           ⚠️ 宽度与排布**照旧按 `b.label` 算**（原生那颗就是盖在这颗的位置上的），
              所以这一格不会被挤窄、也不会跟旁边那颗错位；也没有第二份排版算式。 */
        const nv = (typeof b.native === 'function') ? b.native(x, y, widths[k], h) : null;
        if (nv === true) { idx++; x += widths[k] + gap; return; }
        const nr = (nv && typeof nv === 'object') ? nv : null;
        U.btn(nr ? nr.x : x, nr ? nr.y : y, nr ? nr.w : widths[k], nr ? nr.h : h,
          b.label, b.style, b.id, b.dis); idx++; x += widths[k] + gap;
      });
      y += h + gap;
    });
    U.y = top + rows.length * h + (rows.length - 1) * gap;
    return U.y - top;
  };

  /* ---------- 进度条 .bar（高 8 / 圆角 6） ---------- */
  U.bar = function (pct, color) {
    const h = 8 * CV.SCALE, top = U.y;
    draw(() => {
      CV.round(U.ix(), top, U.iw(), h, CV.RADIUS_CHIP,  CV.C.bar);
      const w2 = Math.max(0, Math.min(1, pct)) * U.iw();
      if (w2 > 1) CV.round(U.ix(), top, w2, h, CV.RADIUS_CHIP,  color || CV.C.gold);
    });
    U.y = top + h;
    return h;
  };

  /* V9.6.90：「固定底部动作条」U.actionBar 已删 —— 全仓没人调用（真正在用的两条底条
     是"页面级覆盖层"：背包的批量分解条 CV.pageOverlay、招募的抽卡条），
     而它按**屏幕坐标**算 y 却是在**内容层**里画的：谁哪天顺手用了它，
     按钮就会整体下移一整个顶栏、贴着底栏甚至出画。留着就是一颗雷。 */

  /* ---------- 确认弹窗（网页版 confirmBox：居中、两个按钮） ----------
     V9.6.90：加了 opt —— 网页版好几处弹窗是"一串奖励胶囊 + 下面一个按钮"
     （离线收益 / 七日登录），canvas 原来只有"两行字 + 取消/确定"，
     所以那两个弹窗在小游戏里根本没法照着做。现在支持：
       opt.chips   奖励胶囊文案数组（自动居中折行）
       opt.blocks  方块阵：[{ title, body, state }]（V1.1.21 · 七日登录"一天一个方块"）；
                   state ∈ 'today'|'done'|'future' —— **判定由调用方给**（`U.loginDayState`），
                   这里只按 state 取色（`BLK_TONE`），不传就退化成 future 那一档。
       opt.blockCols 方块阵列数（**一般不传**：默认 3 列，单格窄于 BLK_MIN_W 时自动退 2 列；
                   七日登录 7 格 ⇒ 390 上 3+3+1、320 上 2+2+2+1，末行不满时居中）
       opt.note    按钮上方的一行灰色小字
       opt.cancel  false = 只有一个按钮（offline / 公告这类）
       opt.okLabel 那个按钮的字（默认"确定"） */
  const CHIP_H = 26, CHIP_GAP = 6 * CV.SCALE;
  /* ================= V1.1.21（F10 · 2026-09-29）· 七日登录"一天一个方块" =================
     父亲大人原话：「7日登陆换成一天一个方块那样显示么，然后能领的才高亮，不能领的就灰色，
                   你现在全都高亮我以为都能领呢」。
     起因：N1 那版把 7 格全塞进 `U.confirm` 的胶囊，而胶囊**只有一种样式**（金框 ＋ 金字），
     于是七天看着"全都能领"。这一单的重点不是排版，是**状态要一眼分得清**。

     `BLK_TONE` ＝ 方块阵三档状态的**唯一一套配色**（画布只按 state 取色，不自己算）：
       · today  ＝ 金框 ＋ 金字 ＋ 「今天」标记 —— 整屏**唯一**亮的那一格；
       · done   ＝ 灰底 ＋ ✓ —— 领过了（看得见"拿过了"，但不再抢眼）；
       · future ＝ 更暗一档的灰底、**没有标记**、整格再压一档透明度（还没到）。
     `done` 与 `future` 的区别不只靠颜色（✓ 是硬标记 ＋ 低一档的对比度），这是"两档必须能分开"的兜底。 */
  const BLK_TONE = {
    today: { fill: CV.C.sel, line: CV.C.gold, text: CV.C.gold, mark: '今天', markCol: CV.C.goldBright, alpha: 1, bold: true, lw: 2 },
    done: { fill: CV.C.panel2, line: CV.C.line2, text: CV.C.text2, mark: '✓', markCol: CV.C.text2, alpha: 1, bold: false, lw: 1 },
    future: { fill: CV.C.panel, line: CV.C.line, text: CV.C.dim, mark: '', markCol: CV.C.dim, alpha: .62, bold: false, lw: 1 },
  };
  /* 只读出口：尺子（overlay_audit / retention_audit / boot_audit）拿它当"三档互不相同"的判据 */
  U.blkTone = function (state) { return BLK_TONE[state] || BLK_TONE.future; };
  /* 方块阵的度量基数（列数 / 间距 / 内距；行高在 U.confirm 里按当次的 CV.FS 算）
     列数＝3：七格摆成 3+3+1（末行居中）。**为什么不是 4+3 或一行 7 格**——
     见回单：4 列时格子只有 ~74px（320 上 ~59px），"引灯招募券×1" 这种串会被迫逐字断，
     真机折出 `SS / R装备箱`、`× / 1`（看着像错字）；3 列时 390 上每格 ~102px、
     第 7 天那格正好两行摆下"🎫 SSR 自选券 · ／圣契招募令×1"，钩子一个字不省。 */
  /* 列数：**按"单格装不装得下一整串奖励"定**，不按机型写死 —— 最长的尾串是「引灯招募券×1」
     （≈73px）＋ 两侧内距 12px ⇒ 单格 <88px 时退成 2 列（390 是 3 列 / 320 退 2 列）。
     实测依据（真 Chrome，见回单）：4 列时 390 上每格 75px、320 上 59px，折出 `SS / R装备箱`、
     `× / 1` 这种像错字的断行；3 列在 390 上两行摆平、2 列在 320 上两行摆平。 */
  const BLK_COLS = 3, BLK_MIN_W = 88, BLK_PAD = 6, BLK_GAP = 8;
  /* ================= V1.1.21（F10）· 方块里的折行（与 CV.wrap 不同的那一件事）=================
     `CV.wrap` 是**逐字断**（页面文案用它，快、够用）。方块格子窄，逐字断会把
     "SSR装备箱" 折成 `SS / R装备箱`、"×1" 折成 `× / 1` —— 那不是排版，是错字。
     这里只做两件小事：① **优先在空格处断**（"◉ 7000 · 引灯招募券×1" 先断在中点）；
     ② 一段自己就超宽时才逐字断，且**尾巴上的 ×N 保成一体**。
     ⚠️ 只服务方块阵（`opt.blocks`），**不碰** `chipRows` / `CV.wrap` —— 老弹窗的胶囊像素级不变。 */
  function blkWrap(text, maxW, size) {
    const parts = String(text == null ? '' : text).split(' ');
    const toks = [];
    parts.forEach(function (p, i) {
      const t = i < parts.length - 1 ? p + ' ' : p;
      if (t === '') return;
      /* " · " 这种分隔符跟着**前一段**走（否则折到下一行会变成行首一个孤零零的"·"） */
      if (/^·\s*$/.test(t) && toks.length) { toks[toks.length - 1] += t; return; }
      toks.push(t);
    });
    const lines = [];
    let cur = '';
    const push = function (s) { if (s !== '') lines.push(s.replace(/\s+$/, '')); };
    toks.forEach(function (t0) {
      if (CV.measure(cur + t0, size) <= maxW) { cur += t0; return; }
      if (cur) { push(cur); cur = ''; }
      if (CV.measure(t0, size) <= maxW) { cur = t0; return; }
      /* 这一段自己就超宽：逐字断，但把尾巴的 ×N 摘出来保成一体 */
      const t = t0.replace(/\s+$/, '');
      const m = /^(.*?)(×\d+)$/.exec(t);
      const head = m ? m[1] : t, tail = m ? m[2] : '';
      let rest = head;
      while (rest) {
        let acc = '', k = 0;
        for (; k < rest.length; k++) { if (acc && CV.measure(acc + rest[k], size) > maxW) break; acc += rest[k]; }
        rest = rest.slice(Math.max(1, k));
        if (rest) push(acc); else cur = acc;
      }
      if (tail) { if (CV.measure(cur + tail, size) <= maxW) cur += tail; else { push(cur); cur = tail; } }
    });
    push(cur);
    return lines.length ? lines : [''];
  }
  /* 输入格（opt.inputBox）：高度照购买弹窗那颗数字格（46）——同一套控件口径。 */
  const INP_H = 46 * CV.SCALE;
  /* 胶囊居中折行：返回 [[{t,w},…], …] */
  function chipRows(list, maxW) {
    const rows = [[]];
    let used = 0;
    list.forEach(function (t) {
      const w = CV.measure(t, CV.FS.sm) + 22 * CV.SCALE;
      const row = rows[rows.length - 1];
      if (row.length && used + w + CHIP_GAP > maxW) { rows.push([]); used = 0; }
      rows[rows.length - 1].push({ t: t, w: w });
      used += w + CHIP_GAP;
    });
    return rows.filter((r) => r.length);
  }
  U.confirm = function (title, text, onOk, opt) {
    opt = opt || {};
    /* V9.6.94（父亲大人："离线后开启游戏的弹窗字也贴一起了"）：
       以前弹窗高度是一套公式、drawOverlay 又是另一套坐标 —— 两边必然漂移。
       带奖励胶囊的离线收益弹窗里，"离线期间…"那行小字就压到了按钮上。
       现在**只在这里排一次版**：每一块的 y 都在这个循环里定下来，
       drawOverlay 只负责照着这些坐标画，不可能再对不上。 */
    const PAD = 14 * CV.SCALE;
    const bw = Math.min(CV.W - 40, 420), x = (CV.W - bw) / 2;
    const inner = bw - PAD * 2;
    const LH_T = CV.FS.f1 * 1.35;      // 标题行盒 20.25
    const LH_L = CV.FS.lg * 1.7;       // 正文行盒 22.1
    const LH_N = CV.FS.xs * 1.7;       // 小字行盒 18.7
    const lines = CV.wrap(text, inner, CV.FS.lg, 9);
    const rows = (opt.chips && opt.chips.length) ? chipRows(opt.chips.filter(Boolean), inner) : [];
    const note = opt.note ? CV.wrap(opt.note, inner, CV.FS.xs, 3) : [];
    /* ================= V1.1.21（F10）· 方块阵（`opt.blocks`）=================
       `opt.blocks` ＝ [{ title, body, state }]：一天一个方块。
       分工是死的：**state 由调用方判定**（七日登录走 `U.loginDayState`，全项目唯一一处），
       这里只按 state 取 `BLK_TONE` 的配色 ＋ 按格宽把 body 折行 ＋ 排坐标；
       绘制那一侧（`U.drawOverlay`）只读排好的方块，不再自己算"今天 / 领过"。
       行内等高（同一行取最高的那一格，像 grid 的 `stretch`），行与行之间再留 BLK_GAP。 */
    const blk = [];
    let blkH = 0;
    const blkT = CV.FS.sm * 1.4, blkB = CV.FS.xs * 1.4, blkM = CV.FS.tag * 1.4;
    const blkPad = BLK_PAD * CV.SCALE, blkGap = BLK_GAP * CV.SCALE;
    if (opt.blocks && opt.blocks.length) {
      let cols = Math.max(1, Math.min(opt.blockCols || BLK_COLS, opt.blocks.length));
      /* 没点名列数时按"单格装不装得下一整串奖励"退档（见 BLK_COLS 那段注释） */
      if (!opt.blockCols && cols === 3 && (inner - blkGap * 2) / 3 < BLK_MIN_W) cols = 2;
      const cw = (inner - blkGap * (cols - 1)) / cols;
      opt.blocks.forEach(function (b, i) {
        const state = b.state || 'future';
        const tone = BLK_TONE[state] || BLK_TONE.future;
        const body = String(b.body == null ? '' : b.body);
        /* 奖励文案**不截断**：第 7 天的钩子（🎫 SSR 自选券 ＋ 圣契招募令）宁可让格子长高一行，
           也不许折出省略号把钩子吃掉 —— 那正是本单要保住的东西（`blkWrap` 不会加省略号）。 */
        const bl = blkWrap(body, cw - blkPad * 2, CV.FS.xs);
        blk.push({
          title: String(b.title == null ? '' : b.title), body: body, state: state, tone: tone,
          mark: tone.mark, lines: bl, col: i % cols, row: Math.floor(i / cols), w: cw,
          /* 格子内部各行的中心 y（相对格子左上角）—— 排一次，绘制只照着画 */
          ty: blkPad + blkT / 2, b0: blkPad + blkT + blkB / 2, bStep: blkB,
          my: blkPad + blkT + bl.length * blkB + blkM / 2,
          h: blkPad * 2 + blkT + bl.length * blkB + (tone.mark ? blkM : 0),
        });
      });
      let ay = 0;
      for (let r = 0; r * cols < blk.length; r++) {
        const row = blk.slice(r * cols, r * cols + cols);
        const rh = row.reduce(function (m, b) { return Math.max(m, b.h); }, 0);
        /* 末行不满时**居中**（七格 3+3+1：最后一格落在中间，不然左边吊着一格很怪） */
        const off = (cols - row.length) * (cw + blkGap) / 2;
        row.forEach(function (b, j) { b.rh = rh; b.x = off + j * (cw + blkGap); b.y = ay; });
        ay += rh + blkGap;
      }
      blkH = Math.max(0, ay - blkGap);
    }
    let cy = PAD;
    const titleY = cy + LH_T / 2; cy += LH_T;
    const lineY = [];
    if (lines.length) cy += 8 * CV.SCALE;
    lines.forEach(function () { cy += LH_L; lineY.push(cy - LH_L / 2); });
    /* 方块阵整块占位（方块的 x/y 都是**相对这张卡片**的，绘制时才加 o.y） */
    if (blk.length) { cy += 10 * CV.SCALE; blk.forEach(function (b) { b.y += cy; }); cy += blkH; }
    const chipY = [];
    if (rows.length) {
      cy += 10 * CV.SCALE;
      rows.forEach(function (row, i) { chipY.push(cy + CHIP_H / 2); cy += CHIP_H + (i < rows.length - 1 ? CHIP_GAP : 0); });
    }
    /* 输入格（opt.inputBox）：一块与购买弹窗"数字格"同口径的输入位 ——
       玩家点它调起系统数字键盘（`wx.showKeyboard`），这里只显示他敲了什么。
       见下面 drawOverlay 里登记的那颗热区（id ＝ opt.inputId）。 */
    let inputY = null;
    if (opt.inputBox) { cy += 10 * CV.SCALE; inputY = cy; cy += INP_H; }
    const noteY = [];
    if (note.length) {
      cy += 8 * CV.SCALE;
      note.forEach(function () { cy += LH_N; noteY.push(cy - LH_N / 2); });
    }
    cy += 16 * CV.SCALE;               // 按钮与上面内容的间距
    const btnY = cy; cy += 44 * CV.SCALE;
    const h = cy + PAD;
    const y = (CV.H - h) / 2;
    U.overlay = {
      x: x, y: y, w: bw, h: h, title: title, lines: lines, text: text, onOk: onOk,
      rows: rows, note: note, single: opt.cancel === false, okLabel: opt.okLabel || '确定',
      /* 方块阵（V1.1.21 · F10）：排好的格子（含 state / tone / 折行 / 相对坐标）——
         绘制与尺子都读这一份，谁都不许再自己算"今天 / 领过"。 */
      blocks: blk,
      /* V1.1.x（0927-P · 父亲大人：「设置界面的内容和顺序应该是…最下面就一个红色边框按钮写
         删除当前进度重新开始，点击删档跳出来一个确认弹窗随机生成 4 个数字」）：
         通用弹窗这一轮多了三样**可选**能力，都是给"删档二次确认"和"挂机结算"用的 ——
           opt.inputBox / opt.inputId  玩家要照着敲的那一格（点它调系统数字键盘）；
           opt.blankClose              点空白处＝关掉弹窗返回（**只给收益类面板开**，
                                       确认弹窗一律不许开 —— 那种必须点按钮）；
           opt.okId / opt.okStyle      按钮的 id 与样式（默认 _cf_yes / primary）。 */
      input: opt.inputBox ? {
        y: inputY, h: INP_H, id: opt.inputId || '',
        value: String((opt.inputBox && opt.inputBox.value) || ''),
        placeholder: String((opt.inputBox && opt.inputBox.placeholder) || ''),
      } : null,
      blankClose: !!opt.blankClose,
      okId: opt.okId || '_cf_yes', okStyle: opt.okStyle || 'primary',
      /* V1.1.8（乙组 B4/B8）：非单按钮形态的第二颗**可以改文案、也可以带自己的动作** ——
         离线收益那颗「看广告 · 收益 ×2」、签到那颗「看广告 · 今日双倍」都是"第二颗按钮"，
         而它原来只会关闭弹窗（文案写死"取消"）。现在：`cancelLabel` 改字、`onCancel` 挂动作。 */
      cancelLabel: opt.cancelLabel || '取消', onCancel: opt.onCancel || null,
      cancelId: opt.cancelId || '_cf_no',
      pad: PAD, titleY: titleY, lineY: lineY, chipY: chipY, noteY: noteY, btnY: btnY,
      /* V1.0.6：正文色分档 —— 默认 --dim；《健康游戏忠告》用 'text2'（法规原文要读得清）。 */
      tone: opt.tone || 'dim',
    };
    CV.render();
  };
  /* 《健康游戏忠告》独立弹窗（V1.0.6 · 设计师 · 父亲大人 2026-09-23：「健康游戏是独立的弹窗，
     不要跟主画面做到一起」，时机选 **C＝冷启动先弹、关掉才看到主画面**；game.js 开机调它）。
     · 四句**逐句一行、一字不省**（特别规范 2.6.2 要的是"全文登载"：摘要＋点开会被判不合格）；
     · 走 U.confirm 的**单按钮**形态（cancel:false）—— 没有 ×、遮罩点不掉，只有这一条出路；
     · 正文走 --text2（与网页版 .notice-advice 同一档，"读得清"是基准）；
     · 文案只有 data.js 的 `D.COMPLIANCE` 一份来源（本文件零手抄，与网页版同一份）。
     按钮「我知道了」：这一颗只是"读到了"，真正的出口是主画面上的【进入残域】。 */
  U.healthNotice = function (onOk) {
    const CO = (G.DATA && G.DATA.COMPLIANCE) || {};
    U.confirm(CO.healthTitle, (CO.healthAdvice || []).join('\n'), function () {
      if (onOk) onOk(); else CV.render();
    }, { cancel: false, okLabel: '我知道了', tone: 'text2' });
  };
  /* ================= V1.0.4 · R5 版本更新提示（父亲大人 09-27 点单）=================
     `wx.getUpdateManager().onUpdateReady` 之后由 `js/wx-cap.js` 排队到这里（它排在开机弹窗队列里，
     不会抢离线收益 / 七日登录 / 忠告那几层）。单按钮形态：**没有"取消"** ——
     点一下＝立即重启进新代码，正是这一条要的效果（"让玩家真的走到新代码"）。
     为什么不是"点×先玩着"：这一类更新一旦就绪，玩家继续玩的还是旧代码，
     今晚改的东西明天他看不见 —— 而存档兼容那套（密钥表＋迁移＋备份）已经做好了，重启是安全的。 */
  U.updateReady = function () {
    U.confirm('新版本已就绪', '重启一下就能用上新版本。', function () {
      if (G.CAP && G.CAP.applyUpdate) G.CAP.applyUpdate();
      CV.render();
    }, { cancel: false, okLabel: '立即重启' });
  };
  /* 离线收益 / 时间异常（与网页版 showOfflineGains 同一份文案，V9.6.90） */
  U.offlineGains = function (g) {
    if (!g) return;
    if (g.cheat) {
      U.confirm('⚠ 时间异常', '检测到系统时间被修改，本次离线收益已取消。',
        function () { CV.render(); }, { cancel: false, okLabel: '知道了' });
      return;
    }
    const D = G.DATA || {};
    const fmt = G.fmt || ((n) => String(n));
    const dur = G.formatDuration ? G.formatDuration(g.seconds) : (g.seconds + ' 秒');
    const chips = [];
    chips.push('◉ +' + fmt(g.gains.points));
    chips.push('EXP +' + fmt(g.gains.exp));
    if (g.gains.otherworld) chips.push('◆ +' + g.gains.otherworld);
    
    if (g.gains.matCount && g.gains.matItem) {
      const it = (D.ITEMS || {})[g.gains.matItem];
      /* V1.0.6（与结算胶囊同一处口径）：材料胶囊用**它自己的 icon**（基础金属 ⛏ / 灯阁残片 🏮），
         不再一律 ⚙️。 */
      chips.push(((it && it.icon) || '🎒') + ' ' + ((it && it.name) || g.gains.matItem) + '×' + g.gains.matCount);
    }
    if (g.gains.matStashed) chips.push('📮 待领箱 +' + g.gains.matStashed);
    /* ================= V1.1.8（乙组 B4 · 离线翻倍）=================
       父亲大人的口径：**全额 ×2、不限次数**；【定】**每个离线结算窗口只能翻一次**（翻过的记在
       `S.idle.lastSettle.doubled`，回主页再点也翻不了第二次）。
       这里是**第二颗按钮**（`cancelLabel` ＋ `onCancel`，见 U.confirm 那一段）：
         · 左侧「📺 看广告 · 收益 ×2」——演练期点了直接发（wx-adapter 的 drill 分支），
           上线后换成真广告；额度：不限次数、不计总闸（时间权益类）。
         · 翻倍成功后**原地再画一遍**这个弹窗，胶囊换成翻倍后的数字 —— 让玩家看见"×2"到底给了多少。 */
    const paintOffline = function (mult, usable) {
      const line = usable ? ('离线 ' + dur + '（效率 ' + Math.round(g.efficiency * 100) + '%）· 收益 ×' + mult + ')')
        : ('离线 ' + dur + '（效率 ' + Math.round(g.efficiency * 100) + '%）');
      const opt = { okLabel: '收下', chips: chips, note: '离线期间挂机分工的产线一样在跑。' };
      if (usable) {
        /* V1.0.4 · R3：弱网变脸（判定只在 G.ADWEAK）；点了给一句人话、不白等 */
        opt.cancelLabel = G.ADWEAK ? G.ADWEAK.label('📺 看广告 · 收益 ×2') : '📺 看广告 · 收益 ×2';
        opt.onCancel = function () {
          if (G.ADWEAK && G.ADWEAK.block()) return;
          const AD = G.AD;
          if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); CV.render(); return; }
          AD.show('offline_double').then(function (r) {
            /* 没拿到一律**不给双倍**（父亲大人：「弱网拉不到广告时不给双倍」）——
               弱网不走补偿（`wx-adapter` 的 `NO_COMP_SLOTS`），离线这份原额还在，
               这一屏留着，网络缓过来还能再点；玩家自己关掉的才说"没看完"。 */
            if (!r || !r.granted) {
              CV.toast(r && r.reason === 'skipped' ? '广告没看完，奖励没发'
                : (r && r.reason === 'quota' ? '今天没得翻了' : '广告暂时拉不到，稍后再试'), 2400);
              CV.render(); return;
            }
            const d = (G.Core && G.Core.claimOfflineDouble) ? G.Core.claimOfflineDouble() : null;
            if (!d || !d.ok) { CV.toast((d && d.msg) || '这次已经翻过倍了'); CV.render(); return; }
            /* 胶囊换成"翻倍之后一共拿到多少"（原收益 ＋ 翻倍那一份） */
            const g2 = g.gains, a2 = d.gains || {};
            const cs = [
              '◉ +' + fmt((g2.points || 0) + (a2.points || 0)),
              'EXP +' + fmt((g2.exp || 0) + (a2.exp || 0)),
            ];
            if ((g2.otherworld || 0) + (a2.otherworld || 0)) cs.push('◆ +' + ((g2.otherworld || 0) + (a2.otherworld || 0)));
            if (g2.matCount && g2.matItem) cs.push(((G.DATA.ITEMS[g2.matItem] || {}).icon || '🎒') + ' ' + ((G.DATA.ITEMS[g2.matItem] || {}).name || g2.matItem) + '×' + g2.matCount);
            /* F7 ②：一次性奖励类（看完广告拿到的双倍）→ 留，缩到最短。 */
            CV.toast('📺 离线收益 ×2', 1600);
            U.confirm('欢迎回来，执灯者', line + '（已翻倍）', function () { CV.render(); },
              { cancel: false, okLabel: '收下', chips: cs, note: '下一次离线结算会重新给一次翻倍机会。' });
          });
        };
      } else { opt.cancel = false; }
      U.confirm('欢迎回来，执灯者', line, function () { CV.render(); }, opt);
    };
    /* 能不能翻：这次结算存在、还没翻过、广告模块在（演练期也算"在"） */
    const ls = (G.Core && G.Core.lastOfflineSettle) ? G.Core.lastOfflineSettle() : null;
    paintOffline(2, !!(ls && !ls.doubled && G.AD && G.AD.show));
  };
  /* ================= V1.1.16（M 轮 · 挂机结算面板 ＋ 看广告双倍领取）=================
     父亲大人的原话：「现在这个领取奖励也可以像战斗的结算那样把有什么奖励列举出来，
     然后两个选项，一个领取奖励，一个看广告双倍领取奖励，**这个看广告双倍领取的次数也是不限次数**」。

     ⚠️ 2026-09-27（0927-P · 父亲大人原话）：「**这个不用单开一页吧，就半透明弹窗叠加就行啦，
        然后支持点击空白处返回**」——他配的那张图就是**挂机收益那一屏**：
        原来这里走的是 `G.BattleUI.showResult`（战斗/扫荡那条**整屏黑底**的结算层），
        所以他看到的是"单开了一页"。现在**改走离线收益那一套通用弹窗**：
          U.confirm ＋ opt.chips 奖励胶囊 ＋ 两颗按钮 —— 本来就是"半透明遮罩 ＋ 居中卡片"，
          全项目已经在用，**不新造样式**（离线收益 / 七日登录 / 今日汇总都是它）。
        · 点空白处返回 ＝ `opt.blankClose`（见 U.confirm / drawOverlay）：关掉弹窗、原地回灯阁，
          **不发奖、也不走 onCancel 那条广告路**；
        · 一颗都是"能点空白返回"的收益面板；**确认弹窗（删档那种）不许开**。
       奖励那几行与 `U.offlineGains` **同一套胶囊写法**（同一个 ◉/EXP/◆/材料 icon 口径）。
     与「离线收益」的分工（父亲大人点名要分清）：
       · 离线收益 ＝ `U.offlineGains`：结算"**没开游戏那段时间**"，标题「欢迎回来，执灯者」；
       · 挂机收益 ＝ 这里：结算"**开着游戏攒进挂机银行的那一份**"，标题「挂机结算」。

     returns true ＝ 面板已开；false ＝ 这次没有"挂机收益"可列（银行不足 1 分钟），
     调用方照旧走既有的"一键收"。 */
  /* 把"挂机银行快照"折成**与真领取同口径**的展示用数字：材料按档位折算、带上它自己的 icon。
     ⚠️ 档位与数量都问逻辑层（`Core.idleMatItem`）—— 不在这里另写一套折算公式。
     ⚠️ 这一串是**预演**：真领取时若背包正好满载，材料会整批进「📮 待领箱」（那边有提示），
        这里不为它开分支（开分支＝在这里抄第二份背包容量判断）。 */
  U.idleBankPreview = function (bank) {
    const out = { points: bank.points || 0, exp: bank.exp || 0, otherworld: bank.otherworld || 0, matItem: null, matCount: 0, matStashed: 0 };
    if (bank.mat > 0 && G.Core && G.Core.idleMatItem) {
      const mi = G.Core.idleMatItem();
      const n = Math.floor(bank.mat / Math.pow(2, mi.tier - 1));
      if (n > 0) { out.matItem = mi.item; out.matCount = n; }
    }
    return out;
  };
  /* 奖励胶囊那一行：与 `U.offlineGains` **逐句同源**（◉ / EXP / ◆ / 材料自己的 icon）。 */
  U.idleChips = function (g) {
    const D = G.DATA || {};
    const fmt = G.fmt || ((n) => String(n));
    const chips = [];
    chips.push('◉ +' + fmt(g.points));
    chips.push('EXP +' + fmt(g.exp));
    if (g.otherworld) chips.push('◆ +' + g.otherworld);
    if (g.matCount && g.matItem) {
      const it = (D.ITEMS || {})[g.matItem] || {};
      chips.push(((it.icon) || '🎒') + ' ' + ((it.name) || g.matItem) + '×' + g.matCount);
    }
    if (g.matStashed) chips.push('📮 待领箱 +' + g.matStashed);
    return chips;
  };
  U.idleSettle = function () {
    const Core = G.Core;
    if (!Core || !Core.idleBankGains) return false;
    const bank = Core.idleBankGains();
    /* 不足 1 分钟 ＝ 这一轮没有"挂机收益"（列出来就是一行「◉ +0」）：不弹面板。
       今日 / 周常那些照样收得到 —— 走调用方原来那条一键收。 */
    if (!(bank.seconds >= 60)) return false;
    const dur = G.formatDuration ? G.formatDuration(bank.seconds) : (bank.seconds + ' 秒');
    const opt = {
      chips: U.idleChips(U.idleBankPreview(bank)),
      okLabel: '领取',
      /* 两颗按钮的 id 直接用既有的两个处理器 —— 它们各自负责"发奖之后怎么收场"
         （见 js/sc-home.js 的 idle_claim / idle_double）：走 U.confirm 的自定义按钮 id，
         **点下去不会顺手把弹窗关掉**，于是"广告拉不到 → 自动那条路不发奖"时
         面板可以原地留着（那颗「领取」照常领原额）。 */
      okId: 'idle_claim',
      blankClose: true,               // ← 父亲大人 09-27：「支持点击空白处返回」
    };
    /* 有广告模块才给第二颗按钮 —— 没有模块时留一颗"点不动的广告键"就是死键。 */
    if (G.AD && G.AD.show) {
      /* V1.0.4 · R3：弱网时这颗也写「网络不太好」（判定只在 G.ADWEAK 一处） */
      opt.cancelLabel = G.ADWEAK ? G.ADWEAK.label('📺 看广告 · 双倍领取') : '📺 看广告 · 双倍领取';
      opt.cancelId = 'idle_double';
    }
    else opt.cancel = false;
    U.confirm('挂机结算', '已挂 ' + dur + (Core.idleFull && Core.idleFull() ? '（已满）' : ''), null, opt);
    return true;
  };
  /* 七日登录（与网页版 showLoginReward 同一份文案） */
  /* ================= V1.1.18（N5 · 留存环：回归礼）=================
     父亲大人拍板「把留存环做了」；策划总监 N 单的 N5：断了一阵子再回来给一份"回来的理由"。
     这一屏**只报账**（奖在 `game.js` 开机那一刻就由 `Core.grantComeback()` 发到手了，
     进程被杀在弹窗前也不会丢）；胶囊直接用 `Core.rewardTextOf` 拆 —— 全项目唯一那份"奖励怎么写"
     的口径，不在这里手抄第二份。 */
  U.comebackGift = function (g) {
    if (!g) return;
    const txt = (G.Core && G.Core.rewardTextOf) ? G.Core.rewardTextOf(g.reward) : '';
    const chips = String(txt || '回归礼').split(' · ').filter(Boolean);
    U.confirm('欢迎回来，执灯者', '好一阵子没见了 —— 这份是给你留着的。', function () { CV.render(); },
      { cancel: false, okLabel: '收下', chips: chips,
        note: '离线挂机的收益另有结算；这条只在隔了一天以上没上线时给一次。' });
  };
  /* ================= V1.1.21（F10 · 2026-09-29 · 父亲大人）=================
     「7日登陆换成一天一个方块那样显示么，然后能领的才高亮，不能领的就灰色，
      你现在全都高亮我以为都能领呢」。
     N1 那版把 7 格全塞进 `U.confirm` 的胶囊，而胶囊**只有一种样式**（金框 ＋ 金字）⇒
     七天看着"全都能领"（父亲大人自己也这么误读了）。这一单不是排版，是**状态要一眼分得清**：
       · **一天一个方块**（`opt.blocks`，4 列 → 4+3 两行，列数理由见回单）；
       · **三档**：今天＝金框金字的唯一亮格 / 已领＝灰底 ＋ ✓ / 还没到＝更低一档的灰、无标记；
       · 判定**只写一处**（`U.loginDayState`），绘制只读 state（画布代码里不再算第二遍）。
     ⚠️ 数值一个字没动（`D.LOGIN_REWARDS` 与 `core.js` 的发奖照旧），只是把本来就发的东西画清楚；
       第 7 天那颗仍是这一屏的主角（🎫 SSR 自选券 ＋ 圣契招募令**写全**，一个字不省）。 */
  U.loginDayState = function (day, curDay) {
    if (day === curDay) return 'today';
    return day < curDay ? 'done' : 'future';
  };
  U.loginReward = function (r) {
    if (!r) return;
    const D = G.DATA || {};
    const bodyOf = function (rw) {
      const it = (D.ITEMS || {})[rw.item] || null;
      const itemTxt = rw.item ? (((it && it.name) || rw.item) + '×1') : '';
      if (rw.ssrTicket) return ['🎫 SSR 自选券', itemTxt].filter(Boolean).join(' · ');
      return (G.Core && G.Core.rewardTextOf) ? G.Core.rewardTextOf(rw) : (itemTxt || '奖励');
    };
    /* 七天 → 七个方块（`title` 第 N 天 ／ `body` 当天奖励 ／ `state` 三档）——
       **状态判定只在这一处**（`U.loginDayState`），页面与绘制都不许再算一遍。 */
    const blocksOf = function (curDay) {
      /* V1.1.16（0927-Y 数值轮 · 报告 §6-6 N2）：表挂在**轮次**上（第 8 天起是常规轮）——
         这里必须走 `D.loginTableOf` 那同一个出口，否则第 8 天以后玩家看到的还是首轮那 7 格，
         "今天这一格"会对不上真正发到手的东西（画出来的和发出去的不是同一个东西 = 静默错）。 */
      const list = (D.loginTableOf ? D.loginTableOf(r.round || 1) : D.LOGIN_REWARDS) || [];
      return list.map(function (rw, i) {
        const n = i + 1;
        return { title: '第' + n + '天', body: bodyOf(rw), state: U.loginDayState(n, curDay) };
      });
    };
    /* ================= V1.1.8（乙组 B8 · 签到全双倍）=================
       口径（终版 §3.1 第 8 步）：**1 次/天**、**只翻当天那一格**、**不补历史**；
       翻倍 = 当天那一格**原样再发一份**（含 ✦ 与招募券 —— 走的是同一个 `applyRewardObj`）。
       这里同样是**第二颗按钮**；翻过之后弹窗重画成"已翻倍"的样子（不再给第二颗）。 */
    const paintLogin = function (doubled) {
      /* 列数交给 `U.confirm` 按单格宽度定（390 → 3 列，320 退 2 列；理由见 BLK_COLS 那段） */
      const opt = { okLabel: '收下', blocks: blocksOf(r.day) };
      if (doubled) opt.chips = ['📺 今日已翻倍'];
      if (doubled) {
        opt.cancel = false;
        opt.note = '今天这一格已经翻倍领过了。';
      } else {
        /* V1.0.4 · R3：弱网变脸（同一处判定）；点了给一句人话、不发奖（见下面 onCancel） */
        opt.cancelLabel = G.ADWEAK ? G.ADWEAK.label('📺 看广告 · 双倍') : '📺 看广告 · 双倍';
        opt.onCancel = function () {
          if (G.ADWEAK && G.ADWEAK.block()) return;      // 弱网：不白等，弹窗原地留着
          const AD = G.AD;
          if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); CV.render(); return; }
          AD.show('login_double').then(function (res) {
            if (!res || !res.granted) { CV.toast('广告没看完，奖励没发'); CV.render(); return; }
            const d = (G.Core && G.Core.claimLoginDouble) ? G.Core.claimLoginDouble() : null;
            if (!d || !d.ok) { CV.toast((d && d.msg) || '今天已经翻过倍了'); CV.render(); return; }
            /* F7 ②：同上（看完广告拿到的签到双倍）。 */
            CV.toast('📺 签到奖励 ×2', 1600);
            U.confirm('七日登录 · 第 ' + r.day + ' 天', '今日奖励 ×2 已到手', function () { CV.render(); },
              { cancel: false, okLabel: '收下', blocks: blocksOf(r.day),
                chips: ['📺 今日已翻倍'], note: '明天还有一次翻倍机会。' });
          });
        };
      }
      U.confirm('七日登录 · 第 ' + r.day + ' 天', '今日奖励', function () { CV.render(); }, opt);
    };
    paintLogin(false);
  };
  CV.on('_cf_no', () => {
    const o = U.overlay; U.overlay = null;
    if (o && typeof o.onCancel === 'function') { try { o.onCancel(); } catch (e) { CV.render(); } }
    else CV.render();
  });
  CV.on('_cf_yes', () => { const o = U.overlay; U.overlay = null; if (o && o.onOk) o.onOk(); else CV.render(); });
  /* ================= V1.1.x（0927-P · 父亲大人：「支持点击空白处返回」）=================
     点空白＝**只是关掉这一层、原地回到下面那一页**：不发奖、也**不走 onCancel 那条广告路**
     （挂机结算面板点空白 ＝ 这次不领，银行里那笔一分不少，下次点「收取奖励」还在）。
     登记这颗热区的只有 `opt.blankClose` 的弹窗（见 drawOverlay；确认弹窗一律不开）。 */
  CV.on('_cf_blank', () => { U.overlay = null; CV.render(); });
  /* ---------- 引导气泡（照网页版 coachmark）----------
     V9.6.27（父亲大人）：网页版有二十来处"首次操作引导"，小游戏一处都没有 —— 这是目前最大的功能缺口。
     画布版的做法：**不另存坐标**，直接拿 CV.hits 里那颗热区的矩形当锚点
     （所以页面怎么写都不用管引导），外面套一圈金色高亮框 + 一张提示卡；点任意位置关掉。
     只弹一次：看过记进 S.coachSeen。 */
  let coachState = null;
  const coachQueue = [];
  /* V9.6.66（与网页版 V9.6.65 同步）：**玩家自己点「去完成」= 主动求引导**，这种必须每次都给。
     原来小游戏的引导是"看过就永不再弹"，于是第二次点前往只会把人送到页面、什么都不说
     （网页版同一个毛病，父亲大人："又没说要干嘛"）。用一个短窗口的开关把"主动要的"和
     "路过顺手讲的"分开。 */
  let coachForceUntil = 0;
  /* 这次"主动求引导"是为**哪一条**破例（null = 不限定，老口径） */
  let coachForceKey = null;
  /* V9.6.112（父亲大人："第一关的指引打完之后出来还是第一关的指引"）：
     「去完成」开的那 2.5 秒强制窗口，原来对**所有**引导都有效 ——
     玩家做完这一步、再回到那一页，同一条卡片又冒出来讲一遍（看着就是没更新）。
     现在这个窗口**每条只破例一次**：主动求一次就讲一次，之后照常按"已看过"收敛。 */
  const coachForcedUsed = {};
  /* V1.1.12：每条引导"同一页被登记了几次"—— 用来抓"这条引导永远收不掉"的死锁（见 U.coach 里那段）。 */
  const coachRetry = {};
  /* V9.6.68（资料 §5「引导每一步都要能测」）：本地引导漏斗 —— 形状与网页版一致，
     记 看过/点过/跳过/没指到 + 累计毫秒；GM 面板里能看（sc-last 的调试页）。 */
  function coachFunnel(key, what, ms) {
    if (!key || !(G.Core && G.Core.S)) return;
    const S = G.Core.S;
    S.coachStats = S.coachStats || {};
    const st = S.coachStats[key] = S.coachStats[key] || { view: 0, tap: 0, skip: 0, miss: 0, ms: 0, msN: 0 };
    st[what] = (st[what] || 0) + 1;
    if (what === 'tap' || what === 'skip') { st.ms = (st.ms || 0) + Math.max(0, ms || 0); st.msN = (st.msN || 0) + 1; }
    G.Core.save();
  }
  U.coachFunnel = coachFunnel;
  U.coachForce = function (ms, onlyKey) {
    coachForceUntil = Date.now() + (ms || 2500);
    /* V9.6.112（父亲大人："招募的指引得点好几下才能换"／"第一关的指引打完之后出来还是它"）：
       「去完成」开的那 2.5 秒窗口，原来对**所有**引导都有效 ——
       于是玩家点完这一步、只要这 2.5 秒里又渲染了别的页，那一页的基础引导也会跳出来。
       现在窗口**只对玩家点的那一步破例**（onlyKey 传进来是谁，就只有谁能再讲一遍），
       而且每条只破例一次：同一条不会因为换页回来又讲第二遍。 */
    coachForceKey = onlyKey || null;
    for (const k in coachForcedUsed) delete coachForcedUsed[k];
  };
  U.coachForced = function () { return Date.now() < coachForceUntil; };
  /* 这一次"主动求引导"还能不能为**这一条**破例 */
  const forcedNow = function (key) {
    if (Date.now() >= coachForceUntil) return false;
    if (coachForceKey && String(coachForceKey) !== String(key)) return false;
    return !coachForcedUsed[key];
  };
  /* V9.6.67（查漏补缺）：**战斗页整屏接管，引导在那一页既不画也不挡**。
     起因：主线 q01b 那类"点第 1 关就开打"的步骤带 waitFor（打完才算过），
     玩家一点高亮就进了战斗 —— 引导还在，于是把战斗页的撤离 / 加速 / 结算按钮全挡死，
     只能等打完（或者点"跳过这一步"，可那行小字在战斗画面上根本看不到）。
     现在战斗期间引导自动让路，打完回到世界页它再接着算。 */
  function coachSuspended() {
    try { const t = CV.top && CV.top(); return !!(t && t.name === 'battle'); } catch (e) { return false; }
  }
  /* V9.6.35（父亲大人定的需求）：引导是**强制、逐项、必须真点到那颗按钮**才放行。
     用法：U.coach(targetId, text, opts)
       opts.key      —— 记进存档的键（默认用 targetId 拼）；老号第一次进某模块时补一次靠它
       opts.mustTap  —— true：必须**点中目标本身**才推进（点别处不生效）
       opts.queue    —— true：当前有引导时不丢弃，排队等这条播完（逐项介绍就是排一串）
     U.coachSkipAll() 给"跳过整条"，U.coachSeen(key) 查这条看过没有。 */
  U.coach = function (targetId, text, opts) {
    opts = opts || {};
    const S = G.Core && G.Core.S;
    if (!S) return;
    S.coachSeen = S.coachSeen || {};
    const key = opts.key || [].concat(targetId).join('|');
    if (S.coachSeen[key] && !forcedNow(key)) return;   // 看过就不再弹（玩家主动又要了，才再讲一次）
    if (forcedNow(key)) coachForcedUsed[key] = true;   // 破例只给一次
    /* ⚠️ V1.1.12 第一版把"死锁自愈"写在这里（数**登记次数**）—— **写错了**：
       主页每秒重画一次 → 3 秒就把引导自动标已读，`guide_walk_audit` 当场报 4 步"没讲"。
       自愈必须只在**"这条引导真被拿起来过、又被丢掉"**时计数 ——
       见 `U.drawCoach` 里那条"换页就放下"的分支（那才是死循环真正发生的地方）。 */
    /* V9.6.66（父亲大人："引导时只能点高亮区域，不能点其他区域或滑动界面"）：
       mustTap 改成**默认开** —— 所有引导都只有两条出路：点高亮的那颗，或者点右下角「跳过这一步」。
       以前非强制的那些给了一颗全屏热区（点哪都算过），玩家一边看引导一边还能操作别的东西。 */
    const item = { targetId: targetId, key: key, text: text, mustTap: opts.mustTap !== false, swallow: opts.swallow !== false, onDone: opts.onDone,
      /* V9.6.67（查漏补缺）：记住它是**在哪一页**登记的。引导是页面在 render 里登记的，
         而"讲完这一步自动退上一层"（CV.pop）会让那一次 render 的引导挂到上一层去
         —— 实测：讲完六维回首页，屏幕上飘着一条"血统升级"的卡，指的却是首页上没有的东西。
         现在换页了就先放下（**不标已读**，等玩家回到那一页再讲）。 */
      bornPage: (CV.top && CV.top()) ? CV.top().name : null,
      waitFor: opts.waitFor,   // waitFor：**这件事真的做完了**才算过（父亲大人拍板的第 2 条）
      where: opts.where };     // where：这一步要在哪一页做（目标不在本页时告诉玩家去哪）
    /* V9.6.43 自审：同一个 key 不能重复入队 —— 链式引导每帧都会问一次，
       不拦的话队列会**无限堆积**（每渲染一帧塞一条）。 */
    if (coachState && coachState.key === key) return;
    for (let i = 0; i < coachQueue.length; i++) if (coachQueue[i].key === key) return;
    if (coachState) {
      if (opts.queue) coachQueue.push(item);
      return;
    }
    coachState = item;
  };
  U.coachSeen = function (key) { return !!(G.Core && G.Core.S && (G.Core.S.coachSeen || {})[key]); };
  U.coachMark = function (item) {
    const S = G.Core.S; S.coachSeen = S.coachSeen || {};
    if (item && item.key) S.coachSeen[item.key] = true;
    G.Core.save();
  };
  U.coachNext = function () {
    const done = coachState && coachState.onDone;
    coachState = null;
    while (coachQueue.length) {
      const it = coachQueue.shift();
      const S = G.Core.S;
      if (!(S.coachSeen || {})[it.key]) { coachState = it; break; }
    }
    /* V9.6.43：这一组播完了 → 交给链式引导的下一步（"带着走"靠它；
       注意**先渲染再回调**，否则回调里换页会在没有引导的状态下多画一帧）。 */
    if (!coachState && done) { CV.render(); setTimeout(done, 0); return; }
    CV.render();
  };
  U.coachCount = function () { return (coachState ? 1 : 0) + coachQueue.length; };
  /* V9.6.133：这一颗**注释里承诺过、实际没写**（V9.6.35 的说明白纸黑字写着
     "U.coachSkipAll() 给「跳过整条」"，但全文只有那一句注释，没有实现）。
     现在补上：把当前这条 + 队列里剩下的**全部标成已读**并清空 ——
     给"体检脚本 / 跳过整段教学"用。注意它只清"已经登记进来"的，
     后面新页面自己登记的引导照旧会弹（这是对的，别指望它一次关掉全局）。 */
  U.coachSkipAll = function () {
    const S = G.Core && G.Core.S;
    if (!S) return 0;
    S.coachSeen = S.coachSeen || {};
    let n = 0;
    if (coachState) { S.coachSeen[coachState.key] = true; coachState = null; n++; }
    while (coachQueue.length) { const it = coachQueue.shift(); if (it && it.key) { S.coachSeen[it.key] = true; n++; } }
    return n;
  };
  U.coachActive = function () { return !!coachState; };   // 触摸层用它挡滚动（引导期间不许滑屏）
  /* V9.6.67：给"开场链"用的两颗 —— 看当前在讲哪一条 / 把插队的放下来（**不标已读**，
     它下次进那一页还会补讲）。开场链要一路走完，中途被别的引导插进来会挑错下一步。 */
  U.coachCurrent = function () { return coachState; };
  /* V9.6.105（自审抓到的）：**队列里排着的下一条要顶上来** ——
     引导因为换页被丢弃时（bornPage 对不上），原来只把当前这条清掉，
     队列里的下一条就永远不冒出来了（玩家感受："引导没了 / 卡住 / 走错乱"）。
     这里统一成一个 promote：没有当前条时，把队列里第一条没看过的顶上来。 */
  function promoteCoach() {
    if (coachState) return;
    const S = G.Core && G.Core.S;
    while (coachQueue.length) {
      const it = coachQueue.shift();
      if (S && S.coachSeen && S.coachSeen[it.key]) continue;
      coachState = it; return;
    }
  }
  U.coachDrop = function () { coachState = null; promoteCoach(); };
  /* V9.6.102：玩家点「去完成」＝ 换一件事讲 —— 把当前这条和**排队等着的**一起清掉。
     只清当前那条（coachDrop）是不够的：上一条引导常常正排在队列里，
     换页之后它会接着冒出来，看着就像"引导讲的是上一件事"（父亲大人："任务引导走错乱了"）。 */
  U.coachClearAll = function () { coachState = null; coachQueue.length = 0; };
  /* V9.6.45（父亲大人："小游戏指引一半还是能点到别的窗口"）：
     引导画在最上层只是**视觉**上盖住了，底下那些按钮的热区仍然在 CV.hits 里、照样能派发 ——
     看着被挡住，其实还能点到别的。这里给派发加一道闸：引导在的时候，
     只放行「引导自己的那颗（跳过这一步）」和「高亮的目标」，其余一律吃掉。 */
  U.coachAllows = function (h) {
    if (!coachState) return true;
    /* V9.6.95（自审：弹窗按钮点不动）：引导在的时候只放行"高亮那颗"，
       但**弹窗是更高一层的模态** —— 弹窗打开期间，引导一律不拦，
       由触摸层的"只放行弹窗按钮"那条规则统一把关。
       否则会出现：引导还挂着 → 弹窗弹出来 → 点「确定」被引导吃掉，玩家卡住。 */
    if (G.U && G.U.overlay) return true;
    if (coachSuspended()) return true;              // 战斗页：引导让路（见上）
    if (h.id === '_coach_ok') return true;
    const want = [].concat(coachState.targetId);
    for (let i = 0; i < want.length; i++) {
      const w = want[i];
      if (w.slice(-1) === '*') { if (h.id.indexOf(w.slice(0, -1)) === 0) return true; }
      else if (h.id === w) return true;
    }
    return false;
  };
  /* V9.6.108（父亲大人："队伍上阵又上不了了，其他东西也都点不了了"）：
     判断一颗热区是不是**当前引导要你点的那一片**。
     用途：有些热区是"给引导当锚点"的整块区域（队伍阵型 party_board、六维卡 attr_card、
     关卡格 stage_grid…），它们**没有动作**却盖在真按钮上面 ——
     以前触摸层会把点击派发给它们（因为它们在有引导时"被放行"），于是
     点队伍空位派发的是 party_board → 什么都不发生 → 上不了阵、整页像死了。
     现在这类"没有处理器的锚点"只有在"引导正开着、且它就是引导目标"时才吃点击
     （那时点它＝关掉引导），其余情况一律让下面的真按钮拿到点击。 */
  U.coachIsTarget = function (h) {
    if (!coachState) return false;
    const want = [].concat(coachState.targetId);
    for (let i = 0; i < want.length; i++) {
      const w = String(want[i]);
      if (w.slice(-1) === '*') { if (String(h.id).indexOf(w.slice(0, -1)) === 0) return true; }
      else if (String(h.id) === w) return true;
    }
    return false;
  };
  /* 点中"高亮的那颗"才算过。swallow=true 时这一下**只推进引导、不执行原动作**
     （逐项介绍用：点一下"【境界】"只是听下一项，不该顺手把页面跳走）。 */
  const _dispatch = CV.dispatch;
  CV.dispatch = function (id) {
    const st = coachState;
    /* V9.6.95（自审：弹窗按钮点不动）：**弹窗比引导高一层**。
       引导在的时候这条派发会把"非高亮"的动作全吃掉 —— 弹窗自己的「确定 / 收下」
       也被一起吃了，于是"引导还挂着 + 弹窗弹出来"时玩家点不动弹窗，卡住。
       弹窗打开期间一律按原样派发：能不能点由触摸层那条"只放行弹窗按钮"把关。 */
    if (G.U && G.U.overlay) return _dispatch(id);
    /* V9.6.102（父亲大人："新手指引和任务引导又走错乱了"）：
       「去完成 / 领取奖励」是**玩家明确要求做这一步**，不是"路过顺手点了一下"。
       引导期间那条"点高亮那颗只推进引导、不执行动作"的规矩会把它们吃掉 ——
       于是点了没反应、页面没跳，屏幕上还挂着上一条引导（看着就是"引导讲的是上一件事"）。
       这两颗按钮一律直接执行：执行完 goQuest 会清掉旧引导、按新一步重新讲。 */
    /* V1.1.12（康康 09-27 · 父亲大人报的**死循环**：「重跑新手指引 → 主线第 27 步是转生 →
       转生做不了 → 一进主页就进引导，引导到转生，无限循环」）：
       ⚠️ 下面这条旁路（V9.6.102 为修"点了没反应"加的）**当年漏了最要紧的一步 —— 没把当前引导收掉**：
         点「去完成」→ 直接派发 → `goQuest` 把玩家带到那一步的页面 → **换页** →
         `drawCoach` 见"换页了"就把这条放下、**不标已读**（那条规矩本身是对的，防串台）
         ⇒ 这条引导**永远收不掉** → 回主页又登记一遍 → 再点又带走 …… 死循环。
       实测复现（`/tmp/coach_loop_probe.js`）：`coachSeen` 卡在 3 条、`tourForce` 永远 true，
       每轮都在「登记 tut_blk4（目标=去完成）→ 点 goto_quest → 落到 world/reincarn → 回主页」之间打转。
       修法：**旁路照样要"执行 ＋ 收掉"**（与"点高亮那颗"同一条口径，V9.6.107 那套）。 */
    /* F2-3（抢修单 0928R3）：悬赏那颗「去完成」（`bounty_go:*`）与这两颗同性质 ——
       玩家明确要求"带我去做这一步"，不是路过顺手点了一下。引导挂着的时候把它吃掉，
       就又变成一颗"点了没反应"的死键（那正是这一单要修的毛病）。 */
    if (id === 'goto_quest' || id === 'claim_quest' || id.indexOf('bounty_go:') === 0) {
      if (st) {
        coachFunnel(st.key, 'tap', st._t0 ? (Date.now() - st._t0) : 0);
        U.coachMark(st);
        coachState = null;
        promoteCoach();
      }
      return _dispatch(id);
    }
    if (!st || coachSuspended()) return _dispatch(id);   // 战斗页：按原样派发，不拦
    /* V9.6.66（父亲大人："引导时只能点高亮区域，不能点其他区域或滑动界面"）：
       这里原来是**漏的** —— 只有按下判定（hitAt）过滤了，真正执行动作的这条派发路
       直接 `return _dispatch(id)`，所以高亮期间点别处照样跳页（实测点到了"查看境界·渡劫"）。
       现在引导在 = 真模态：只有「高亮的那颗」和「跳过这一步」能派发，其余一律吃掉。 */
    if (id === '_coach_ok') return _dispatch(id);
    const want = [].concat(st.targetId);
    /* 锚点支持**前缀**（'eqd:*' / 'bup:*'）：动态 id 不可能写死，
       原来只认全等 → 这类锚点怎么点都不过，只能靠"跳过这一步"。 */
    const hit = want.some(function (w) {
      return (w.slice(-1) === '*') ? (id.indexOf(w.slice(0, -1)) === 0) : (id === w);
    });
    if (!hit) return true;                       // 点别处：吃掉，什么都不做
    /* V9.6.107（父亲大人："直接点高亮区域取消就行了"）：
       点中高亮那颗 = ①**执行它的动作**（点关卡就开打、点空格就上阵…）
                    + ②**把这条引导收掉**（不再留着把整页锁死）。
       以前分成"只推进"（swallow:true）和"等做完才放行"（waitFor）两条路，
       后者会把玩家锁在那一步上（高亮指错地方时就是死锁）。 */
    coachFunnel(st.key, 'tap', st._t0 ? (Date.now() - st._t0) : 0);
    U.coachMark(st);
    coachState = null;
    promoteCoach();
    const r = _dispatch(id);
    setTimeout(function () {
      /* V9.6.112（父亲大人："上阵也得上两个"）：这一下**可能已经把玩家带到下一页**，
         而那一页会在自己的 render 里登记一条新引导（比如挑人页的"点一个伙伴，他就上阵了"）。
         原来这里无条件 `U.coachNext()` —— 它会把**刚登记的那条**当成"当前这条"清掉，
         于是新页面上一条提示都没有，玩家看着一列名字不知道还要再点一下。
         现在：只有"没有新引导顶上来"时才推进队列。 */
      if (typeof st.onDone === 'function') st.onDone();
      else if (!coachState) U.coachNext();
      CV.render();                                   // 让新一步立刻画出来
    }, 0);
    return r;
  };
  U.drawCoach = function () {
    if (!coachState) return;
    if (coachSuspended()) return;                   // 战斗页不画引导（战斗自己的界面优先）
    /* 换页了就别再画（见 bornPage 的说明）：直接放下，**不标已读、也不跑 onDone**
       （跑 onDone 会误触发"退回上一层"，把玩家拽到更乱的地方）。 */
    if (coachState.bornPage && coachState.bornPage !== ((CV.top() || {}).name)) {
      coachFunnel(coachState.key, 'miss');     // 换页了：这一步这次没讲成
      /* ================= V1.1.12（康康 09-27 · **死锁自愈**，就写在这条真出事的路上）==========
         父亲大人报的那次死循环，机理就是"**这条引导每次被拿起来、点一下就被换页丢掉**"：
         丢掉时**不标已读**（那条规矩是对的，防串台）→ 回到原页又登记 → 再点又被丢掉 …… ∞。
         根因（`goto_quest` 那条旁路没标已读）已经单独修了；这里再加一道兜底：
         **同一条引导连续 3 次"被拿起来又被换页丢掉"** → 认定它这辈子收不掉
         （目标当前做不到 / 指错地方），**自动标已读放行**，并记一笔 `auto-unlock`
         （GM 的引导漏斗里看得见）。宁可少讲一条，也不能把玩家钉死在主页上 —— 这是本文件 V9.6.38 立的规矩。 */
      coachRetry[coachState.key] = (coachRetry[coachState.key] || 0) + 1;
      if (coachRetry[coachState.key] >= 3) {
        coachFunnel(coachState.key, 'auto-unlock');
        const S2 = G.Core && G.Core.S;
        if (S2) { S2.coachSeen = S2.coachSeen || {}; S2.coachSeen[coachState.key] = true; try { G.Core.save(); } catch (e) {} }
        coachRetry[coachState.key] = 0;
      }
      coachState = null;
      promoteCoach();                          // V9.6.105：换页丢掉的这条之后，队列里的下一条要顶上来
      if (coachState) { setTimeout(function () { CV.render(); }, 0); }
      return;
    }
    /* V9.6.61（父亲大人拍板第 2 条：**做完才放行**）：
       带 waitFor 的引导，先问"这件事真做完了吗" —— 做完了就直接过、连提示都不留；
       没做完才继续挡着（并且每帧都在问，所以玩家一做完立刻放行，不用再点一次）。 */
    if (coachState.waitFor) {
      let done = false;
      try { done = !!coachState.waitFor(); } catch (e) { done = true; }   // 判定出错就别卡人
      if (done) { U.coachMark(coachState); U.coachNext(); return; }
    }
    const S = G.Core.S;
    const c = CV.ctx;
    /* 锚点：优先找非屏幕坐标（内容区）的那一颗，换算到屏幕 y */
    let r = null;
    const want = [].concat(coachState.targetId);
    /* 锚点支持"前缀"（写成 'bup:*'）：建筑升级、装备格这类 id 带后缀（bup:core / eqd:eq123），
       不可能写死，用前缀就能锚到"这一类"里的第一颗（V9.6.37）。 */
    /* V9.6.106（父亲大人："队伍上阵又上不了了"）：
       一条引导可以写**一串**锚点（'pslot:*, party_board'），以前是"按热区注册顺序取第一个命中的"——
       后注册的整块区域（party_board）会盖过前面的空格锚点，于是高亮指向一块**点不动的区域**，
       配"做完才放行"就把玩家卡死。
       现在**锚点列表的顺序说了算**：先拿第一个锚点去找热区，找不到才看第二个 ——
       写在前面的就是优先。 */
    const rectOf = function (h) {
      return h.screen ? { x: h.x, y: h.y, w: h.w, h: h.h }
        : { x: h.x, y: h.y - (CV.scroll || 0) + CV.TOP + 8, w: h.w, h: h.h };
    };
    for (let wi = 0; wi < want.length && !r; wi++) {
      const w = String(want[wi]);
      const hits = CV.hits || [];
      /* V9.6.112（真流程审计）：**前缀锚点取"登记顺序里的第一颗"**，不是最后一颗。
         热区是按绘制顺序登记的（第一行先登记），而"最后一颗"在列表尾部 ——
         于是 `fabao_buy:*` 高亮指向**最贵的那件法宝**、`garden_plant:*` 指向最后一垄地
         （种子最贵的那垄）：玩家点下去买不起，引导还赖着不走，
         看着就是"点了没反应、要连点好几下"。取第一颗＝最便宜/最前面那颗，才是玩家会先点的。 */
      for (let i = 0; i < hits.length; i++) {
        const id = String(hits[i].id);
        const ok = w.slice(-1) === '*' ? id.indexOf(w.slice(0, -1)) === 0 : id === w;
        if (ok) { r = rectOf(hits[i]); break; }
      }
    }
    /* V9.6.34（父亲大人："你这个提示也没有让画面跟着滚动到对应位置啊"）：
       目标可能在本屏之外（比如挂机的"收取奖励"在首页下方）——
       先把它滚进可视区再画引导，否则高亮框和提示都指着屏幕外，等于没引导。
       做法：算一下目标中心离可视区中心差多少 → 改 CV.scroll → 重画一帧（下一次进来就在视野里了）。 */
    const viewTop = CV.TOP + 8, viewBot = CV.H - CV.NAV_H - CV.safeBottom - 8;
    /* V1.1.5（A1）· 父亲大人：「进去二级界面和退出二级界面的位置感觉还是不太对，像任务那里，
       **每次领取完他就会回到最上面**，得再次下滑…」
       真因就在这一块：领取之后页面**原地重画**，而这段"把目标滚进视野"又跑了一遍 ——
       它要找的锚点（第一颗能领的按钮）在列表上方，于是把玩家从当前看到的位置**拽回上边**。
       现在改成：**每条引导只在它第一次出现时滚一次**（"带玩家看见它"正是引导的职责），
       之后玩家自己滑到哪就停在哪 —— 人手动滑走是明确的意图，不该被引导掰回去。
       （顺带把背包 / 世界列表 / 商店这些"点一下就重画"的页面一起治了：同一个毛病。） */
    if (r && !coachState.scrolled) {
      coachState.scrolled = true;                      // 只滚一次（无论这一帧滚没滚）
      if (r.y < viewTop + 6 || r.y + r.h > viewBot - 6) {
        const mid = (viewTop + viewBot) / 2;
        const want = Math.max(0, Math.min(CV.maxScroll || 0, (CV.scroll || 0) + (r.y + r.h / 2 - mid)));
        if (Math.abs(want - (CV.scroll || 0)) > 1) {
          CV.scroll = want;
          setTimeout(function () { CV.render(); }, 0);   // 滚到位后再画（这一帧先放行）
          return;
        }
      }
    }
    c.save();
    c.fillStyle = CV.a(CV.C.shade, .55); c.fillRect(0, 0, CV.W, CV.H);
    const pad = 6;
    if (r) {
      /* 高亮框：把锚点"挖"出来（先清一块、再描金框） */
      c.fillStyle = CV.a(CV.C.shade, 0);
      c.clearRect ? null : null;
      CV.round(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, CV.RADIUS,  CV.a(CV.C.shade, 0), CV.C.gold, 2);
    }
    /* V9.6.63（父亲大人："高亮没了、去别的界面又跳回来、回来也没高亮、不知道要干嘛"）：
       高亮只画在"目标就在本页"时；如果这一步的目标在**别的页**，就必须在提示卡里
       写清"去「XX」做这一步" —— 否则玩家只看到一张没有指向的卡。
       如果那一步的按钮**当前不可用**（比如资源不够），也照样写明，别让人对着一个不亮的按钮发呆。 */
    const textAll = coachState.text + ((!r && coachState.where) ? ('  → 去「' + coachState.where + '」完成这一步。') : '');
    const lines = CV.wrap(textAll, CV.W - 60 * CV.SCALE, CV.FS.lg, 6);
    /* V9.6.108（父亲大人："去了那个小字后框也没跟着缩上去"）：
       卡片高度原来按"上下各 22"算（44），其中下面那 22 是留给「跳过这一步」那行小字的。
       小字去掉之后，底部就多出一整条空白。现在按内容算：
         有高亮 → 底部只留 10；
         没高亮 → 底部留 20（那里还要写一行「点任意处继续 ›」）。 */
    const padBottom = r ? 10 : 20;
    const th = 22 * CV.SCALE + lines.length * CV.FS.lg * 1.7 + padBottom * CV.SCALE;
    const tw = CV.W - 40 * CV.SCALE;
    const tx = 20 * CV.SCALE;
    const ty = r ? Math.min(CV.H - th - 40 * CV.SCALE, r.y + r.h + 16 * CV.SCALE) : (CV.H - th) / 2;
    CV.round(tx, ty, tw, th, CV.RADIUS,  CV.C.panel, CV.C.gold);
    lines.forEach(function (ln, i) {
      CV.text(ln, tx + 14 * CV.SCALE, ty + 22 * CV.SCALE + CV.FS.lg * 1.7 * i, { size: CV.FS.lg });
    });
    /* V9.6.38（自审）：mustTap 但这次**没找到锚点**（目标按钮是条件出现的，比如
       "突破铭刻"只在能突破时才有）→ 必须退回"点一下继续"，否则玩家找不到可点的高亮、直接卡死。
       引导的第一原则是"不能把人卡住"，其次才是强制。 */
    /* V9.6.107（父亲大人："把引导的跳过这一步去掉，就直接点高亮区域取消就行了"）：
       · 不再有「跳过这一步」那颗按钮；
       · **点高亮区域本身就既执行动作、又把这个引导收掉**（见 CV.dispatch 里那条）；
       · 万一这一页连高亮都找不到（目标按钮是条件出现的，比如"突破铭刻"只在能突破时才有），
         就点**任意处继续** —— 绝不把玩家锁死（上一版就是"找不到高亮 + 那行小字在屏幕上很难看见"
         导致整页点不动）。 */
    c.restore();
    CV.hitMode = 'screen';
    if (!r) {
      CV.text('点任意处继续 ›', tx + tw - 14 * CV.SCALE, ty + th - 11 * CV.SCALE,
        { size: CV.FS.sm, color: CV.C.gold, align: 'right' });
      CV.hit('_coach_ok', 0, 0, CV.W, CV.H);
    }
    /* V9.6.68（资料 §5）：卡片真的画出来了 → 记一次「看过」并开始计时；
       没找到锚点（指不到那颗）另记一笔「没指到」，这是最该修的一种。 */
    coachState._t0 = Date.now();
    coachFunnel(coachState.key, 'view');
    if (!r) coachFunnel(coachState.key, 'miss');
    CV.hitMode = 'content';
  };
  /* 「跳过这一步」：标记已看并播下一条（**没有"整条跳过"** —— 父亲大人要的是完全强制） */
  CV.on('_coach_ok', function () {
    if (!coachState) return;
    coachFunnel(coachState.key, 'skip', coachState._t0 ? (Date.now() - coachState._t0) : 0);
    U.coachMark(coachState);
    U.coachNext();
  });

  U.drawOverlay = function () {
    const o = U.overlay;
    if (!o) return;
    const c = CV.ctx;
    c.fillStyle = CV.a(CV.C.shade, .62); c.fillRect(0, 0, CV.W, CV.H);
    /* V9.6.10（自审：整体偏"笨重"）：网页版的浮层 / 底部条都带投影
       （box-shadow: 0 -4px 1.25rem rgba(0,0,0,.45)），小游戏原来是一块贴死的平色，
       所以弹窗像"糊"在页面上。这里补一层柔和外投影。 */
    c.save();
    c.shadowColor = CV.a(CV.C.shade, .55); c.shadowBlur = 22 * CV.SCALE; c.shadowOffsetY = 6 * CV.SCALE;
    CV.round(o.x, o.y, o.w, o.h, CV.RADIUS,  CV.C.bg2, CV.C.line);
    c.restore();
    /* 所有 y 都由 U.confirm 排好版（o.titleY / o.lineY / o.chipY / o.noteY / o.btnY），
       这里只负责照着画 —— V9.6.94 起不再各算各的。 */
    const PAD = o.pad || 14 * CV.SCALE;
    CV.text(o.title, o.x + PAD, o.y + o.titleY, { size: CV.FS.f1, bold: true });
    /* 正文色：默认 --dim；`tone:'text2'` 的弹窗（《健康游戏忠告》）走 --text2 —— 法规原文要的是
       "读得清"，与网页版 .notice-advice 同一档（两端各钉一次对比度）。 */
    o.lines.forEach((ln, i) => CV.text(ln, o.x + PAD, o.y + o.lineY[i],
      { size: CV.FS.lg, color: o.tone === 'text2' ? CV.C.text2 : CV.C.dim }));
    /* ================= V1.1.21（F10）· 方块阵：一天一个方块 =================
       **只按 state 取色**（`BLK_TONE`，帧里不再算"今天 / 领过"）。
       三档的样子：今天＝金框金字 ＋「今天」；已领＝灰底 ＋ ✓；还没到＝更暗的灰底、连标记都没有。 */
    (o.blocks || []).forEach(function (b) {
      const bx = o.x + b.x, by = o.y + b.y;
      const t = b.tone || BLK_TONE.future;
      CV.ctx.globalAlpha = t.alpha;
      CV.round(bx, by, b.w, b.rh, CV.RADIUS_SM, t.fill, t.line, t.lw);
      CV.text(b.title, bx + b.w / 2, by + b.ty,
        { size: CV.FS.sm, bold: t.bold, align: 'center', color: t.text });
      b.lines.forEach(function (ln, i) {
        CV.text(ln, bx + b.w / 2, by + b.b0 + i * b.bStep,
          { size: CV.FS.xs, align: 'center', color: t.text });
      });
      if (b.mark) CV.text(b.mark, bx + b.w / 2, by + b.my,
        { size: CV.FS.tag, align: 'center', color: t.markCol });
      CV.ctx.globalAlpha = 1;
    });
    /* 奖励胶囊（居中折行）——网页版 .reward-chips */
    (o.rows || []).forEach(function (row, ri) {
      const cy = o.y + o.chipY[ri];
      const total = row.reduce((s, c) => s + c.w, 0) + CHIP_GAP * (row.length - 1);
      let cx = o.x + (o.w - total) / 2;
      row.forEach(function (c) {
        CV.round(cx, cy - CHIP_H / 2, c.w, CHIP_H, CV.PILL,  CV.C.panel2, CV.C.line);
        CV.text(c.t, cx + c.w / 2, cy, { size: CV.FS.sm, align: 'center', color: CV.C.gold });
        cx += c.w + CHIP_GAP;
      });
    });
    /* 说明小字 */
    (o.note || []).forEach(function (ln, i) {
      CV.text(ln, o.x + o.w / 2, o.y + o.noteY[i], { size: CV.FS.xs, align: 'center', color: CV.C.dim });
    });
    /* 输入格（opt.inputBox）：购买弹窗那颗"数字格"的同款 —— 底色 panel2 ＋ 金色粗体数字居中，
       没有内容时显示灰底提示语（别留一块空白的、看不出要干什么的方框）。 */
    if (o.input) {
      const iy = o.y + o.input.y;
      CV.round(o.x + PAD, iy, o.w - PAD * 2, o.input.h, CV.RADIUS_SM, CV.C.panel2, CV.C.line2);
      const shown = o.input.value || o.input.placeholder;
      CV.text(shown, o.x + o.w / 2, iy + o.input.h / 2, {
        size: o.input.value ? CV.FS.f2 : CV.FS.md, bold: !!o.input.value, align: 'center',
        color: o.input.value ? CV.C.gold : CV.C.dim,
      });
    }
    const by = o.y + o.btnY;
    const gapBtn = 10 * CV.SCALE;
    const avail = o.w - PAD * 2;
    /* ================= V1.1.x（0927-P · 挂机结算搬进弹窗时抓到的一条老账）=================
       两颗按钮原来是**死等分**的：卡片 350 − 内距 28 − 缝 10 ⇒ 每颗 156，字号 13 时可用宽 140。
       而「📺 看广告 · 双倍领取」量出来 141 —— **差一个字**，`U.btn` 于是折成两行、
       末行只剩一个孤零零的「取」（真机上 emoji 更宽，只会更早折）。
       改成照**文字自然宽**分（与 `U.btnRow` / 网页版 `.btn-row{flex:1 1 auto; min-width:5.375rem}` 同一条规矩）：
         · 两行一样长（取消 / 确定，都是 2 字）⇒ 分下来仍然**逐像素等于从前的等分**；
         · 一行长一行短（看广告 / 领取）⇒ 长的那颗拿到它需要的宽度，消灭孤字；
         · 自然宽总和超过可用宽（超窄屏 + 双长文案）⇒ 退回等分（照旧靠 `U.btn` 折行兜底）。 */
    const minw = U.BTN_MINW * CV.SCALE;
    const natOf = (t) => Math.max(minw, CV.measure(t, CV.FS.lg) + 24 * CV.SCALE);
    const natNo = natOf(o.cancelLabel || '取消'), natYes = natOf(o.okLabel || '确定');
    const useNat = (natNo + natYes + gapBtn <= avail);
    const bw = useNat ? Math.max(minw, (avail - gapBtn) * natNo / (natNo + natYes)) : (avail - gapBtn) / 2;
    const bwYes = useNat ? (avail - gapBtn - bw) : (avail - gapBtn) / 2;
    /* 确认弹窗画在**屏幕坐标**里（内容区已经 restore），命中区也要按屏幕坐标登记。
       V9.6.95：这里是**真模态** —— 用 'overlay' 模式登记，触摸层会只放行这两颗按钮，
       底栏/顶栏/吸顶条在弹窗打开期间一律不吃点击（以前弹窗开着还能点底栏换页）。 */
    CV.hitMode = 'overlay';
    /* ================= V1.1.x（0927-P · 父亲大人：「支持点击空白处返回」）=================
       整屏一颗**模态**热区＝"点空白 = 关掉弹窗、原地返回"（不发奖、也不走 onCancel 那条广告路）。
       ⚠️ 顺序是死的：**它必须先登记**，下面两颗按钮的热区登记在它之后 ——
          `hitAt` 是从数组**末尾往前扫**，后登记的先命中；反过来点按钮会先撞上这块整屏的。
       ⚠️ 只对 opt.blankClose 的弹窗开（挂机结算 / 离线收益这类收益面板）；
          确认弹窗（删档那种）**不许开** —— 那种必须点按钮，点空白什么都不该发生。
       ⚠️ 输入格的热区也登记在它之后（点输入格＝调键盘，不能顺手把弹窗关掉）。 */
    if (o.blankClose) CV.hit('_cf_blank', 0, 0, CV.W, CV.H);
    if (o.input && o.input.id) CV.hit(o.input.id, o.x + PAD, o.y + o.input.y, o.w - PAD * 2, o.input.h);
    if (o.single) {
      U.btn(o.x + PAD, by, avail, 44 * CV.SCALE, o.okLabel || '确定', o.okStyle, o.okId);
    } else {
      /* 左侧那颗的文案可改（`cancelLabel`）—— 广告点位用它当"看广告"那颗，视觉上仍是次要按钮（ghost） */
      U.btn(o.x + PAD, by, bw, 44 * CV.SCALE, o.cancelLabel || '取消', 'ghost', o.cancelId);
      U.btn(o.x + PAD + bw + gapBtn, by, bwYes, 44 * CV.SCALE, o.okLabel || '确定', o.okStyle, o.okId);
    }
    CV.hitMode = 'content';
  };
})();
