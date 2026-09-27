/* 游戏圈入口（微信生态原能力 · 基础库 2.0.3 起）
   ------------------------------------------------------------------------------
   为什么要有：流量主开通条件之一 ——「用户从小游戏内进入游戏圈并产生互动」。
   游戏圈早就开通了、帖也发了，可游戏里**一个入口都没有**，玩家根本进不去。

   微信只给了这一条路（官方文档 wx.createGameClubButton，minigame/dev/api/open-api/game-club）：
   它返回的是一颗**原生按钮** —— 画在 canvas **之上**，和 canvas 不是一个图层。
   两个硬约束（下面整套写法都是被它们逼出来的）：
     · 位置只在创建时给（style.left/top/width/height），**没有 setStyle**；
     · 原生组件不吃 canvas 的裁剪，滚动时**不跟着滚**。
   所以页面每帧用 GC.placeContent(...) 登记"这一行按钮该在哪"（内容坐标即可），
   这里换算成屏幕坐标把原生按钮摆上去；位置一变（滚动中）先 hide，
   等停下来（160ms 没有新位置）再 destroy+重建 —— 滚动中每帧重建原生组件会把手机卡住。

   ⚠️ 原生按钮建得出来时，页面**不要再画按钮**（placeContent 返回 true）——
   画了就是两层叠在一起、字会重影；建不出来（基础库低／开发者工具／游戏圈没开通）时
   返回 false，页面用画布画一颗兜底按钮，点了给一句人话。

   openlink：**不需要**。不传 openlink 时点按钮就是进本游戏的**游戏圈首页** ——
   正好是流量主要求的那个行为。只有要跳"指定帖子 / 话题页"才需要在
   MP「游戏圈 → 基础设置 → 游戏圈首页链接 → 游戏内打开」生成 openlink 填到下面 OPENLINK。
   （开发者工具里模拟器**不支持**原生按钮，那条路走不通时会自动落到画布兜底那颗。）
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV;
  const WX = (typeof wx !== 'undefined') ? wx : null;

  /* 指定帖子 / 话题页才要；留空 ＝ 直接进游戏圈首页（当前口径，不需要去后台生成） */
  const OPENLINK = '';

  const GC = { want: null, last: null, pending: null, label: '', btn: null, key: '', timer: null, failed: false, lastScroll: null };
  G.GameClub = GC;

  const keyOf = (r) => r.x + ',' + r.y + ',' + r.w + ',' + r.h;
  GC.available = () => !!(WX && typeof WX.createGameClubButton === 'function' && !GC.failed);

  function kill() {
    if (GC.btn) { try { GC.btn.destroy(); } catch (e) {} }
    GC.btn = null; GC.key = '';
  }

  function build() {
    const r = GC.pending; GC.pending = null;
    if (!r || !GC.available()) return;
    kill();
    try {
      GC.btn = WX.createGameClubButton({
        type: 'text',
        text: GC.label || '进入游戏圈',
        icon: 'light',                 /* type 为 text 时用不上；留着是因为文档把 icon 标成必填 */
        openlink: OPENLINK || undefined,
        style: {
          left: r.x, top: r.y, width: r.w, height: r.h,
          backgroundColor: CV.C.panel2, borderColor: CV.C.line2, borderWidth: 1,
          borderRadius: Math.round(CV.RADIUS_SM), color: CV.C.text,
          /* 字号/圆角/底色都跟 U.btn 的"小按钮"那套对齐 ——
             滚动中先露画布兜底那颗、停稳后换成原生这颗，两边必须长得一样才不会跳。 */
          textAlign: 'center', fontSize: Math.round(CV.FS.md), lineHeight: Math.round(r.h),
        },
      });
      GC.key = keyOf(r);
      try { GC.btn.show(); } catch (e) {}
      /* V1.1.6（同 B-2）：原生这颗是**刚盖上来的**，而上一帧画面里还留着画布兜底那颗
         （那一帧 placeContent 还返回 false、于是页面自己画了一颗）。两颗位置一模一样、
         底色描边字号也一模一样，所以肉眼看不出来；但"叠着"终究是状态脏了 ——
         这里补画一帧：这一帧 placeContent 会返回 true，页面不再画画布那颗，画面回到"只有一颗"。
         只跑一次（下一帧 tick 会看到 GC.key 已经对上，直接返回）。 */
      setTimeout(function () { try { CV.render(); } catch (e) {} }, 0);
    } catch (e) {
      /* 真机上极少走到（基础库 2.0.3 就支持）；开发者工具里会走这里 → 页面改用画布兜底 */
      GC.failed = true; kill();
    }
  }

  /* 页面画这一行时调一次：传**内容坐标**（就是 U.ix()/U.y 那套）。
     返回 true ＝ 原生按钮会盖在这里（页面别再画按钮了）；false ＝ 让页面自己画兜底。 */
  GC.placeContent = function (x, y, w, h, label) {
    if (label) GC.label = label;
    const sx = (CV.pxW - CV.W) / 2 + x;
    const sy = y - (CV.scroll || 0) + CV.TOP + 8;
    const top = CV.TOP + 8;
    const bot = CV.H - (CV.NAV_H || 0) - (CV.safeBottom || 0);
    /* 原生组件不会被 canvas 裁掉 —— 只有整行都在可视区里才摆它，否则它会飘在顶栏/底栏上 */
    if (sy < top - 0.5 || sy + h > bot + 0.5) { GC.want = null; return false; }
    GC.want = { x: Math.round(sx), y: Math.round(sy), w: Math.round(w), h: Math.round(h) };
    GC.last = GC.want;                       // 记一份：兜底那颗被点到时要用它立刻催重建
    /* ================= V1.1.6（乙组 B-2 · 父亲大人：「设置里面我现在滑动页面，进入游戏圈的按钮会一闪一闪的」）=================
       返回 true 的**唯一条件**：原生那颗**此刻真的在屏上、而且就在这个位置**。
       原来看的是"这个环境支不支持原生按钮"（`GC.available()`）—— 于是滚动的头一帧里：
         · tick() 已经把原生那颗 hide() 了（位置变了，要等 160ms 重建）；
         · 而页面这边仍然拿到 true → **不画画布那颗**；
         · 两头都空 → 玩家看到按钮"没了"，等 160ms 又冒出来 → **一闪一闪**。
       （`scripts/gameclub_audit.js` 把这 20 帧逐帧量出来过：改之前有 6 帧"整行在可视区里、
         却一颗都看不见"；这个函数就是那 6 帧的根因。）
       现在改成"**原生在位才交给它，不在位就由画布那颗顶上**"：
         · 滑动中 → 画布那颗一直画着（位置跟内容走，玩家看得见）；
         · 停稳 160ms → 原生重建在同一位置、同底色/同描边/同圆角/同字号 → 正好盖住画布那颗；
         · 下一帧 placeContent 返回 true → 画布那颗不再画 → **永远只有一颗可见**（不会重影）。 */
    return GC.available() && !!(GC.btn && GC.key === keyOf(GC.want));
  };

  /* CV.render 每帧末尾调一次（见 js/cv.js 的钩子）。 */
  GC.tick = function () {
    const want = GC.want; GC.want = null;
    if (!GC.available()) { if (GC.btn) kill(); return; }
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
      if (GC.timer) { clearTimeout(GC.timer); GC.timer = null; }
      if (GC.btn) { try { GC.btn.hide(); } catch (e) {} GC.key = ''; }
      GC.pending = want;
      GC.lastScroll = CV.scroll || 0;
      return;
    }
    if ((want ? keyOf(want) : '') === GC.key) return;      /* 已经在正确的位置（或已经收起来） */
    const sc = CV.scroll || 0;
    const moving = (GC.lastScroll !== null && GC.lastScroll !== sc);
    GC.lastScroll = sc;
    if (GC.btn) { try { GC.btn.hide(); } catch (e) {} GC.key = ''; }
    if (!want) { GC.pending = null; kill(); return; }
    GC.pending = want;
    if (GC.timer) clearTimeout(GC.timer);
    /* 滚动中：只记最新位置，等停下来再重建（每帧重建原生组件会卡） */
    if (moving) GC.timer = setTimeout(function () { GC.timer = null; build(); }, 160);
    else build();
  };

  /* 画布兜底那颗按钮的点击：原生按钮建不出来时才用得上 */
  GC.fallback = function () {
    /* V1.1.6：画布那颗在**两种**情况下会被点到，别混为一谈 ——
       ① 原生按钮建不出来（老基础库 / 开发者工具）：下面那两句人话是对的；
       ② **滑动当口**（原生刚被收起来、还在 160ms 重建窗口里）：这时说"请升级微信"是误导，
          玩家会以为自己的微信不支持。这里先**立刻催一次重建**，再让他点一下就行。 */
    if (GC.available() && GC.last) {
      if (GC.timer) { clearTimeout(GC.timer); GC.timer = null; }
      GC.pending = GC.last;
      build();
      CV.toast('按钮正在就位，再点一下就行', 1600);
      return;
    }
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
})();
