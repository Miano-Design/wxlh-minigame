/* 原生按钮层（游戏圈 2.0.3 起 / 意见反馈 2.1.2 起 · V1.0.4 起由两台入口共用）
   ------------------------------------------------------------------------------
   为什么要有（① 游戏圈）：流量主开通条件之一 ——「用户从小游戏内进入游戏圈并产生互动」。
   游戏圈早就开通了、帖也发了，可游戏里**一个入口都没有**，玩家根本进不去。
   为什么加第二颗（② 意见反馈 · V1.0.4 · R10 · 父亲大人 09-27 点单）：见文件下半段 FB 那段。

   微信这两条能力只给了**原生按钮**这一条路（官方文档 wx.createGameClubButton /
   wx.createFeedbackButton，minigame/dev/api/open-api/…）：
   它们返回的是**原生组件** —— 画在 canvas **之上**，和 canvas 不是一个图层。
   两个硬约束（下面整套写法都是被它们逼出来的）：
     · 位置只在创建时给（style.left/top/width/height），**没有 setStyle**；
     · 原生组件不吃 canvas 的裁剪，滚动时**不跟着滚**。
   所以页面每帧用 N.placeContent(...) 登记"这一行按钮该在哪"（内容坐标即可），
   这里换算成屏幕坐标把原生按钮摆上去；位置一变（滚动中）先 hide，
   等停下来（160ms 没有新位置）再 destroy+重建 —— 滚动中每帧重建原生组件会把手机卡住。

   ⚠️ 原生按钮建得出来时，页面**不要再画按钮**（placeContent 返回 true）——
   画了就是两层叠在一起、字会重影；建不出来（基础库低／开发者工具／游戏圈没开通）时
   返回 false，页面用画布画一颗兜底按钮，点了给一句人话。

   ⚠️ **V1.0.4 重构（R10「别写第二套」）**：两颗原生按钮的摆位 / 防抖 / 重建逻辑**完全一样**，
      所以抽成下面这个 `makeNative` 工厂，GC（游戏圈）与 FB（意见反馈）各是一份实例；
      `G.NativeTick()` 由 `js/cv.js` 每帧调一次（重构前只调 `GC.tick` 一处）。
      两份实例的**字段与方法名与重构前一致**（`scripts/gameclub_audit.js` 直接读
      `GC.btn / GC.key / GC.available() / GC.placeContent` 这些），那套逐帧判据照旧有效。

   openlink（只关乎游戏圈）：**不需要**。不传 openlink 时点按钮就是进本游戏的**游戏圈首页** ——
   正好是流量主要求的那个行为。只有要跳"指定帖子 / 话题页"才需要在
   MP「游戏圈 → 基础设置 → 游戏圈首页链接 → 游戏内打开」生成 openlink 填到下面 OPENLINK。
   （开发者工具里模拟器**不支持**原生按钮，那条路走不通时会自动落到画布兜底那颗。）
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  const WX = (typeof wx !== 'undefined') ? wx : null;
  const LOG = G.LOG || null;

  /* 指定帖子 / 话题页才要；留空 ＝ 直接进游戏圈首页（当前口径，不需要去后台生成） */
  const OPENLINK = '';

  const keyOf = (r) => r.x + ',' + r.y + ',' + r.w + ',' + r.h;

  /* ================= 原生按钮实例工厂（V1.0.4 · R10「别写第二套」）=================
     cfg = {
       name            —— 日志里认得出的名字；
       has()           —— 这个环境支不支持这颗原生按钮（只看 wx 上有没有那个创建函数）；
       make(r, text)   —— 真去创建（各自的 style 在各自那一段给，形状与 U.btn 对齐）。
     }
     返回的 N 就是重构前 GC 的那个结构（`scripts/gameclub_audit.js` 逐帧读的那些字段）。 */
  function makeNative(cfg) {
    const N = { want: null, last: null, pending: null, label: '', btn: null, key: '', timer: null, failed: false, lastScroll: null };
    /* ================= F3 · 0930L（父亲大人 2026-09-30：「两个按钮还是会闪屏，改了几版了」）===
       **两层必须是同一张脸、同一个整数像素框** —— 这就是这一段的全部内容。
       ① `look`：原生那颗的底色 / 描边 / 字色**只在这一处定义**，画布兜底那颗读同一份
          （原来 意见反馈 是"原生填底 #161d2a ＋ 画布只描边"两颗长得不一样 ⇒
           滑动时"停稳换成原生"那一下，按钮从"空心"变"实心"，来回换手就是频闪）。
       ② `canvasRect`：原生那颗的位置是 `Math.round` 过的**整数屏幕像素**；画布那颗原来按内容坐标
          原样画 ⇒ 差半个像素，换手时描边/文字会跳一下。两处必须落在**同一个整数框**里。 */
    N.look = cfg.look || { fill: CV.a(CV.C.panel2, .55), line: CV.C.line2, color: CV.C.text };
    N.available = () => !!(WX && cfg.has() && !N.failed);
    function kill() {
      if (N.btn) { try { N.btn.destroy(); } catch (e) {} }
      N.btn = null; N.key = '';
    }
    function build() {
      const r = N.pending; N.pending = null;
      if (!r || !N.available()) return;
      kill();
      try {
        N.btn = cfg.make(r, N.label);
        N.key = keyOf(r);
        try { N.btn.show(); } catch (e) {}
        /* V1.1.6（同 B-2）：原生这颗是**刚盖上来的**，而上一帧画面里还留着画布兜底那颗
           （那一帧 placeContent 还返回 false、于是页面自己画了一颗）。两颗位置一模一样、
           底色描边字号也一模一样，所以肉眼看不出来；但"叠着"终究是状态脏了 ——
           这里补画一帧：这一帧 placeContent 会返回 true，页面不再画画布那颗，画面回到"只有一颗"。
           只跑一次（下一帧 tick 会看到 N.key 已经对上，直接返回）。 */
        setTimeout(function () { try { CV.render(); } catch (e) {} }, 0);
      } catch (e) {
        /* 真机上极少走到（基础库够就支持）；开发者工具里会走这里 → 页面改用画布兜底 */
        N.failed = true; kill();
        if (LOG) { try { LOG.warn('native', 'fail', { name: cfg.name }); } catch (e2) {} }
      }
    }

    /* 页面画这一行时调一次：传**内容坐标**（就是 U.ix()/U.y 那套）。
       返回 true ＝ 原生按钮会盖在这里（页面别再画按钮了）；false ＝ 让页面自己画兜底。 */
    /* 原生那颗**在屏幕上的整数框** —— `tick` 摆位与 `canvasRect` 共用这一份算法（不许写第二份）。 */
    function screenBox(x, y, w, h) {
      return {
        x: Math.round((CV.pxW - CV.W) / 2 + x),
        y: Math.round(y - (CV.scroll || 0) + CV.TOP + 8),
        w: Math.round(w), h: Math.round(h),
      };
    }
    /* ================= F3 · 0930L：画布兜底那颗回哪个矩形 =================
       原生那颗靠 `Math.round` 落在**整数屏幕像素**上；画布那颗原来按内容坐标原样画 ⇒
       两层换手时描边与文字差半个像素（真机上就是"闪一下"）。
       这里把同一份换算**反着用**：画布那颗也落在同一个整数框里。
       页面用法：`const r = GC.canvasRect(bx,by,bw,bh); U.btn(r.x,r.y,r.w,r.h,…)`。 */
    N.canvasRect = function (x, y, w, h) {
      const b = screenBox(x, y, w, h);
      return { x: b.x - (CV.pxW - CV.W) / 2, y: b.y + (CV.scroll || 0) - (CV.TOP + 8), w: b.w, h: b.h };
    };
    N.placeContent = function (x, y, w, h, label) {
      if (label) N.label = label;
      const box = screenBox(x, y, w, h);
      const sx = box.x, sy = box.y;
      const top = CV.TOP + 8;
      const bot = CV.H - (CV.NAV_H || 0) - (CV.safeBottom || 0);
      /* 原生组件不会被 canvas 裁掉 —— 只有整行都在可视区里才摆它，否则它会飘在顶栏/底栏上 */
      if (sy < top - 0.5 || sy + h > bot + 0.5) { N.want = null; return false; }
      N.want = box;
      N.last = N.want;                       // 记一份：兜底那颗被点到时要用它立刻催重建
      /* ================= V1.1.6（乙组 B-2 · 父亲大人：「设置里面我现在滑动页面，进入游戏圈的按钮会一闪一闪的」）=================
         返回 true 的**唯一条件**：原生那颗**此刻真的在屏上、而且就在这个位置**。
         原来看的是"这个环境支不支持原生按钮"（`N.available()`）—— 于是滚动的头一帧里：
           · tick() 已经把原生那颗 hide() 了（位置变了，要等 160ms 重建）；
           · 而页面这边仍然拿到 true → **不画画布那颗**；
           · 两头都空 → 玩家看到按钮"没了"，等 160ms 又冒出来 → **一闪一闪**。
         （`scripts/gameclub_audit.js` 把这 20 帧逐帧量出来过：改之前有 6 帧"整行在可视区里、
           却一颗都看不见"；这个函数就是那 6 帧的根因。）
        现在改成"**原生在位才交给它，不在位就由画布那颗顶上**"：
           · 滑动中 → 画布那颗一直画着（位置跟内容走，玩家看得见）；
           · 停稳 160ms → 原生重建在同一位置、同底色/同描边/同圆角/同字号 → 正好盖住画布那颗；
           · 下一帧 placeContent 返回 true → 画布那颗不再画 → **永远只有一颗可见**（不会重影）。 */
      /* ================= F3 · 0930L（父亲大人 2026-09-30：「两个按钮还是会闪屏，改了几版了」）===
         **这里就是"闪"的最后一条根因**（`scripts/gameclub_audit.js` ⑧ 段逐帧量出来的）：
         "原生在不在屏上"这件事，**画这一侧**（本函数）和**摆那一侧**（`N.tick`）原来用的是
         **两个不同的判据** ——
           · `tick`：`CV.dragging`（手指还按着）或**有覆盖层**开着 → 一律 `hide`；
           · 本函数：只看"建出来了 ＋ 位置对不对"。
         于是**手指按着、而这一帧画面又没动**（刚按下 / 拖到一半停一下）的那些帧：
           `tick` 把原生收走了，本函数却还回 true ⇒ 页面不画画布那颗 ⇒
           **这一帧两颗都不在屏上 = 按钮凭空消失**，下一帧手指一动又冒出来 ＝ 父亲大人说的"一闪一闪"。
         （⑧ 段实测：42 帧里有 21 帧是这种空洞；⑥ 段当年没抓到，是因为它每一帧都在改滚动量，
           位置一变 key 就对不上、于是兜底那颗照样画出来 —— 探针自己把洞填掉了。）
         现在**收口成一件事**：`hidden` 这一条与 `tick` 里的 hide 条件**逐字同源**。
         ⚠️ 以后要改"什么时候收起原生"，改这一处，`tick` 与 `placeContent` 同时生效。 */
      const hidden = !!CV.dragging
        || !!(G.U && G.U.overlay) || !!CV.pageOverlay;      // 与 N.tick 里那两个 hide 条件同一份
      /* ================= 康康 2026-10-01 · **彻底取消换手**（父亲大人：「两个按钮滑动屏幕还是会闪」）=====
         前三轮（V1.1.6 / A3 / F3）修的都是"**两层长得像不像**"（底色 / 描边 / 字色 / 圆角 / 字号、
         以及 `Math.round` 到同一个整数框）。可"闪"的根因不在像不像，在**换不换手**：
         这个返回值决定"**这一帧画布那颗画不画**"——
           · 手指一动 → `tick` 把原生收起 → 这里回 false → 画布那颗顶上；
           · 停稳 160ms → 原生重建 → 这里回 true → 画布那颗撤下。
         于是**每换一次手就有一个可见的变化点**；手指顿一下能来回换好几轮，看着就是"一闪一闪"。
         现在：**取消换手** —— 画布那颗**永远画**（当永久底），原生那颗由 `tick()` 照旧按位置建/收，
         盖在 F3 已经对齐好的同一个整数框上 ⇒ 无论原生在不在，玩家看到的都是同一张脸，**没有切换点**。
         ⚠️ 前提：两层的底色 / 描边 / 字色 / 圆角 / 字号必须始终一致（`N.look` 一处定义）；
            否则会露出"双层边"。`gameclub_audit` 的逐帧段 + `visual_audit` 一起盯这条。
         ⚠️ 返回 false 不等于"原生没建"：`tick()` 仍负责建/收原生（有覆盖层时收起来，弹窗关了一帧后重建）。 */
      return false;
    };

    /* CV.render 每帧末尾调一次（见 js/cv.js 的钩子）。 */
    N.tick = function () {
      const want = N.want; N.want = null;
      /* ================= V1.0.4 · A3（父亲大人 2026-09-27 深夜："设置里的进入游戏圈和意见反馈两个按钮
         还是有问题 —— 我点找回存档，这两个按钮会在找回存档的弹窗上方"）=================
         根因：**原生组件（游戏圈按钮 / 意见反馈按钮）永远画在 canvas 之上** ——
         canvas 里画的任何弹窗（`U.overlay` 的确认框、`CV.pageOverlay` 的整屏一幕）**都盖不住它们**。
         所以规则只有一条：**只要有覆盖层打开，原生按钮一律收起来（hide）**；
         弹窗关掉后的下一帧 tick 会自动按位置把它们重建回来（160ms 稳定那一套照旧）。
         ⚠️ 这条对**所有**原生按钮生效（游戏圈、意见反馈共用这一个 tick 工厂），
            以后再加原生按钮也自动受这条管 —— 不用各处记得单独处理。 */
      if ((G.U && G.U.overlay) || (CV && CV.pageOverlay)) {
        if (N.timer) { clearTimeout(N.timer); N.timer = null; }
        if (N.btn) { try { N.btn.hide(); } catch (e) {} N.key = ''; }
        N.pending = want;                     // 记着它该在哪 —— 弹窗一关就重建
        return;
      }
      if (!N.available()) { if (N.btn) kill(); return; }
      /* ================= V1.1.x（0927-P · 父亲大人：「进入游戏圈的按钮滑动的时候还是会频闪」）=================
         **手指还在屏幕上（`CV.dragging`）时，原生按钮一次都不许建。**
         原来这一层只看"滚动位置这一帧变没变"（moving）：手指滑得慢、或者中途顿了一下，
           160ms 那个计时器照样到点 → 原生那颗被**建在手指停住时的旧位置**上；
           手指接着一动，位置又变 → 又 hide 掉 → 原生出现／消失 = 真机上那种**频闪**。
         现在：拖动中只把最新位置记进 `pending`、并确保原生已经收起（画布兜底那颗照常画着，
           位置跟内容走、玩家看得见），**等这一次手势真的结束（抬手，见 cv.js 的 onTouchEnd）**
           才回到原来那套"停稳 160ms 再重建"。
         抓手（`scripts/gameclub_audit.js` ⑥ 段钉着）：整个拖动过程中原生创建次数 ＝ 0；
           抬手之后 160ms 内必须建到位。⚠️ 不许用"永远只画布兜底那颗"来糊弄 ——
           原生那条路是流量主的主要入口（点它才是真的进游戏圈），必须留着。 */
      if (CV.dragging) {
        if (N.timer) { clearTimeout(N.timer); N.timer = null; }
        if (N.btn) { try { N.btn.hide(); } catch (e) {} N.key = ''; }
        N.pending = want;
        N.lastScroll = CV.scroll || 0;
        return;
      }
      if ((want ? keyOf(want) : '') === N.key) return;      /* 已经在正确的位置（或已经收起来） */
      const sc = CV.scroll || 0;
      const moving = (N.lastScroll !== null && N.lastScroll !== sc);
      N.lastScroll = sc;
      if (N.btn) { try { N.btn.hide(); } catch (e) {} N.key = ''; }
      if (!want) { N.pending = null; kill(); return; }
      N.pending = want;
      if (N.timer) clearTimeout(N.timer);
      /* 滚动中：只记最新位置，等停下来再重建（每帧重建原生组件会卡） */
      if (moving) N.timer = setTimeout(function () { N.timer = null; build(); }, 160);
      else build();
    };

    /* 兜底那颗被点到时先走这里：原生**在位但刚被收起来**（滑动当口）→ 立刻催一次重建。
       返回 true ＝ 已经处理（别再说"请升级微信"，那句在滑动当口是误导）。 */
    N.nudge = function () {
      if (!(N.available() && N.last)) return false;
      if (N.timer) { clearTimeout(N.timer); N.timer = null; }
      N.pending = N.last;
      /* ================= R1.2 · P2（父亲大人 2026-10-01 任务书点名）：nudge 不许绕过拖动期保护 =========
         原来这里**直接 build()** —— 把 `N.tick` 里那条"手指按着时一次都不许建原生按钮"整个绕过去了：
           拖动当口点到画布兜底那颗 → 原生按钮被建在"手指停住时那个**旧位置**"上 →
           手指一动，`tick` 又把它 hide ⇒ 玩家看到的就是"按钮一闪一闪"（正是 F3 之前那条根因的复发形态）。
         现在与 tick **逐字同源**：拖动中只把位置记进 `pending`、并保持原生收起，
           等抬手（`cv.js` 的 onTouchEnd 会放开 `CV.dragging`）之后由 tick 那套 160ms settle 建——
           位置是抬手那一刻算出来的，不会建在旧位置上。 */
      if (CV.dragging) {
        N.lastScroll = CV.scroll || 0;
        CV.toast('按钮正在就位，抬手后就好', 1600);
        return true;
      }
      build();
      CV.toast('按钮正在就位，再点一下就行', 1600);
      return true;
    };
    return N;
  }

  /* ---------- ① 游戏圈（GC · 基础库 2.0.3 起）---------- */
  /* F3 · 0930L：原生那颗的"脸"**只在这里定义一次**，画布兜底那颗照它画（见文件头的 ① / ②）。 */
  const LOOK = { fill: CV.a(CV.C.panel2, .55), line: CV.C.line2, color: CV.C.text };
  const GC = makeNative({
    name: 'gameclub',
    look: LOOK,
    has: () => typeof WX.createGameClubButton === 'function',
    make: (r, label) => WX.createGameClubButton({
      type: 'text',
      text: label || '进入游戏圈',
      icon: 'light',                 /* type 为 text 时用不上；留着是因为文档把 icon 标成必填 */
      openlink: OPENLINK || undefined,
      style: {
        left: r.x, top: r.y, width: r.w, height: r.h,
        backgroundColor: LOOK.fill, borderColor: LOOK.line, borderWidth: 1,
        borderRadius: Math.round(CV.RADIUS_SM), color: LOOK.color,
        /* 字号/圆角/底色都跟 U.btn 的"小按钮"那套对齐 ——
           滚动中先露画布兜底那颗、停稳后换成原生这颗，两边必须长得一样才不会跳。 */
        textAlign: 'center', fontSize: Math.round(CV.FS.md), lineHeight: Math.round(r.h),
      },
    }),
  });
  G.GameClub = GC;

  /* 画布兜底那颗按钮的点击：原生按钮建不出来时才用得上 */
  GC.fallback = function () {
    /* V1.1.6：画布那颗在**两种**情况下会被点到，别混为一谈 ——
       ① 原生按钮建不出来（老基础库 / 开发者工具）：下面那两句人话是对的；
       ② **滑动当口**（原生刚被收起来、还在 160ms 重建窗口里）：这时说"请升级微信"是误导，
          玩家会以为自己的微信不支持。这里先**立刻催一次重建**，再让他点一下就行。 */
    if (GC.nudge()) return;
    if (!WX) { CV.toast('当前环境打不开游戏圈'); return; }
    if (OPENLINK && typeof WX.createPageManager === 'function') {
      try {
        const pm = WX.createPageManager();
        pm.load({ openlink: OPENLINK }).then(() => pm.show())
          .catch(() => CV.toast('游戏圈打开失败，请升级微信后重试', 2400));
        return;
      } catch (e) {}
    }
    CV.toast('这里要微信原生按钮才能进游戏圈，请把微信升级到最新版', 2600);
  };

  /* 画布兜底那颗按钮的 id（页面里 U.btn(..., 'open_gameclub')） */
  CV.on('open_gameclub', function () { GC.fallback(); });

  /* ================= ② 意见反馈 / 联系客服（R10 · 父亲大人 09-27 点单）=================
     两条都是"跟人打交道"的入口，放在设置页「游戏圈」那张卡里（**其它卡的顺序一个字不动**）：
       · 「意见反馈」`wx.createFeedbackButton`（基础库 **2.1.2**）—— 又一颗**原生按钮**，
         所以直接复用上面那套 `makeNative`（"**原生在位才交给它，不在位画布顶上**"）；
         点它 ＝ **微信自己打开意见反馈页**（我们不跳、不拦截、不接管）。
         ⚠️ **没挂 `onTap`**：挂上去只是为了多记一条日志，却有可能顶掉它自己的跳转 —— 不值当。
       · 「联系客服」`wx.openCustomerServiceConversation`（普通 API，画布按钮就够）。
     兜底：原生按钮建不出来（开发者工具 / 老基础库）→ 画布那颗顶上，点了给一句人话。 */
  const FB = makeNative({
    name: 'feedback',
    look: LOOK,
    has: () => typeof WX.createFeedbackButton === 'function',
    make: (r, label) => WX.createFeedbackButton({
      type: 'text',
      text: label || '意见反馈',
      style: {
        left: r.x, top: r.y, width: r.w, height: r.h,
        /* 与 GC 那颗、以及画布兜底的 U.btn **逐项对齐**（同一份 `LOOK`）——
           ⚠️ F3 · 0930L：原来这里是"原生填底、画布只描边"两颗长得不一样，
              滑动停稳那一下按钮会从空心变实心 ⇒ 正是父亲大人说的那种"一闪一闪"。 */
        backgroundColor: LOOK.fill, borderColor: LOOK.line, borderWidth: 1,
        borderRadius: Math.round(CV.RADIUS_SM), color: LOOK.color,
        textAlign: 'center', fontSize: Math.round(CV.FS.md), lineHeight: Math.round(r.h),
      },
    }),
  });
  G.Feedback = FB;

  FB.fallback = function () {
    if (FB.nudge()) return;                       // 滑动当口：先催重建（同 GC）
    CV.toast('这里要微信原生按钮才能提交意见反馈，请把微信升级到最新版', 2600);
  };
  CV.on('open_feedback', function () { FB.fallback(); });

  /* 联系客服：会话是微信自己弹的，我们只负责调这一下。
     没有这个 API（老基础库 / 开发者工具）→ 一句人话，**绝不当场抛错**。 */
  CV.on('open_customer_service', function () {
    if (!WX || typeof WX.openCustomerServiceConversation !== 'function') {
      CV.toast('这个版本打不开客服会话，请把微信升级到最新版', 2600);
      return;
    }
    try {
      WX.openCustomerServiceConversation({
        sessionFrom: '设置页 · 联系客服',
        showMessageCard: false,
        sendMessageTitle: '残域灯阁',
      });
      if (LOG) LOG.info('cs', 'open');
    } catch (e) {
      CV.toast('客服会话打开失败，请稍后再试', 2400);
    }
  });

  /* 每帧 tick 两份实例（`js/cv.js` 渲染末尾调这一处；原来只 tick GC 一份） */
  G.NativeBtns = [GC, FB];
  G.NativeTick = function () {
    for (let i = 0; i < G.NativeBtns.length; i++) {
      try { G.NativeBtns[i].tick(); } catch (e) {}
    }
  };
})();
