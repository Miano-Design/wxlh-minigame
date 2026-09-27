/* 挂机结算 ＋ 看广告双倍领取（M 轮 → **0927-P 改成半透明弹窗**）：node scripts/idle_double_audit.js
   ==============================================================================
   父亲大人的原话（M 轮）：「现在这个领取奖励也可以像战斗的结算那样把有什么奖励列举出来，然后两个选项，
   一个领取奖励，一个看广告双倍领取奖励，**这个看广告双倍领取的次数也是不限次数**」。
   父亲大人的原话（0927-P，**改了面板的形态**）：「**这个不用单开一页吧，就半透明弹窗叠加就行啦，
   然后支持点击空白处返回**」——所以 ②/④/⑤/⑥ 这几段的判据从"战斗结算那一层
   （`BattleUI.state.panel` / `CV.top()==='battle'`）"改成"`U.confirm` 那一层半透明弹窗
   （`U.overlay` / 页面还停在灯阁）"；⑦ 段是这一轮新加的"点空白返回"。

   为什么要有这一把：这一整套里全是"错了也不报错"的坑 ——
     · `offline_double` 被谁顺手加进 LIMITS / 总闸 → **玩家点第二次就点不动了**（界面一点变化都没有）；
     · 面板只画了"已领取"，奖励根本没有逐项列出来 → 看着像做完了，其实没做；
     · 双倍那条路只发了**一份**（把 doubler 写成 1 倍）→ 玩家看广告白看，账面上也看不出来。

   量五件事：
     ① `offline_double` 仍在 `wx-adapter` 的 FREE_SLOTS 里：**不限次数、不计总闸**（源码 ＋ 行为两条）；
     ② 点「收取奖励」弹的是**半透明弹窗**（不单开一页），奖励**逐项列出**（点数 / 经验 / ◆ / 材料各一项）；
     ③ 面板有**两颗按钮**（领取 / 看广告·双倍领取），且"看广告"那条路**真的调了** `AD.show('offline_double')`；
     ④ 双倍路径**真的发两份**：与"只领取"那一次对照，多出来的**正好是一份**挂机收益；
     ⑤ 真广告拉不到（弱网）时**不给双倍**、**也不吃补偿**（父亲大人 09-27 拍板：「弱网拉不到广告时
        不给双倍」）—— 原额还在银行里，面板留着，稍后再试；"拔网线白刷双倍"这条路直接堵死。
     ⑦ 0927-P 新增：**点空白处＝关掉弹窗、原地回灯阁**（不发奖、也不走"看广告"那条路）。
   只读脚本：跑在假环境里，不碰真存档、不碰微信。
   ============================================================================== */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
/* 把微任务队列跑干净（广告回调 → then 链 → 渲染，一连串都在微任务里）——
   只 await 一个 tick 是不够的：第二段 then 会排在下一轮，断言就会在"还没发奖"时先跑（本文件第一版就是这么红的）。 */
const tick = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

/* ---------- 假环境（记字 ＋ 记热区 ＋ 可给/不给真广告） ---------- */
const store = {};
/* 画出来的字（V9.6.139 起，含货币符号的句子会**逐字画** —— 所以断言一律看"整串拼起来"的流，
   与 page_text_audit 同一套做法，不能只看单次 fillText）。 */
let TEXT = [], TXY = [];
const stream = () => TEXT.join('');
const lines = () => {
  const byY = {};
  TEXT.forEach((s, i) => {
    const p = TXY[i] || { x: 0, y: 0 };
    const k = Math.round(p.y);
    (byY[k] = byY[k] || []).push({ s, x: p.x });
  });
  return Object.keys(byY).map((k) => byY[k].sort((a, b) => a.x - b.x).map((o) => o.s).join('')).filter((x) => x.trim());
};
function bootEnv(opts) {
  opts = opts || {};
  const store2 = {};
  global.GameGlobal = global;
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in store2 ? store2[k] : null),
    setItem: (k, v) => { store2[k] = String(v); },
    removeItem: (k) => { delete store2[k]; },
  };
  TEXT = []; TXY = [];
  const ctxStub = new Proxy({}, {
    get(t2, k) {
      /* 宽度模型与 page_text_audit / layout_audit 同一套（中文≈字号、西文≈0.55 倍）——
         三把尺子对同一句话量出同一个宽度，折行位置才不会各算各的。 */
      if (k === 'measureText') return (s) => {
        const m = /(\d+(?:\.\d+)?)px/.exec(String(t2.font || ''));
        const size = m ? +m[1] : 11;
        return { width: Array.from(String(s == null ? '' : s)).reduce((a, c) => {
          const n = c.codePointAt(0);
          return a + (n > 0x1F000 ? size * 1.1 : (n > 127 ? size : size * 0.55));
        }, 0) };
      };
      if (k === 'fillText') return (s, x, y) => { TEXT.push(String(s)); TXY.push({ x: Number(x) || 0, y: Number(y) || 0 }); };
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
        'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
      if (props.indexOf(k) >= 0) return t2[k];
      return () => {};
    },
    set(t2, k, v) { t2[k] = v; return true; },
  });
  const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
  /* 触摸回调要**真的收下来**：`CV.dispatch(id)` 是"直呼处理器"，会绕开
     `hitAt`（谁在最上面）+ 引导那道闸 —— 而"两颗按钮点得动"必须走真那条路才算数。 */
  const touch = {};
  global.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
    onTouchStart(fn) { touch.start = fn; }, onTouchMove(fn) { touch.move = fn; }, onTouchEnd(fn) { touch.end = fn; },
    getStorageSync: (k) => (k in store2 ? store2[k] : null),
    setStorageSync: (k, v) => { store2[k] = String(v); },
    removeStorageSync: (k) => { delete store2[k]; },
    setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  };
  if (opts.realAd) {
    global.wx.createRewardedVideoAd = function () {
      const h = {};
      return {
        onError(fn) { h.err = fn; },
        onClose(fn) { h.close = (res) => fn(res); },
        /* 看完用**微任务**回调（与本文件的手搓定时器无关，await 一定拿得到） */
        show() {
          if (opts.adFails) return Promise.reject(new Error('load fail'));
          Promise.resolve().then(() => h.close && h.close({ isEnded: true }));
          return Promise.resolve();
        },
        load() { return Promise.resolve(); },
      };
    };
  }
  /* 手搓定时器：**一律不跑**（toast 的"过一会儿自己消失"在这里不需要，
     不跑反而更稳 —— 它一跑就会在本脚本的重入调用里插一脚，见 ad_audit 顶部同一段说明）。 */
  global.setTimeout = () => 1;
  global.clearTimeout = () => {};
  global.setInterval = () => 0; global.clearInterval = () => {};

  ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
    .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
    .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) { delete require.cache[require.resolve(p)]; require(p); } });
  const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
  CV.setup(global.wx.getWindowInfo());
  CV.bindTouch();
  (CV.NAV_TABS || []).forEach((tt) => { CV.on('tab:' + tt.id, function () { CV.cur = tt.id; CV.reset(tt.id); }); });
  const AD = global.AD;
  /* 记录 AD.show 被点了哪几个槽（"看广告"那条路**真的走了广告**是可验证的） */
  const calls = [];
  const origShow = AD.show;
  AD.show = function () { calls.push(String(arguments[0])); return origShow.apply(AD, arguments); };
  /* 真手指那一下：坐标换算与 cv.js 的 toW 完全一致（横向要补上 DPR 居中那一段偏移） */
  const tapAt = (x, y) => {
    const off = Math.round(((CV.pxW || CV.W) - CV.W) / 2);
    const px = x + off;
    if (touch.start) touch.start({ touches: [{ clientX: px, clientY: y }] });
    if (touch.end) touch.end({ changedTouches: [{ clientX: px, clientY: y }] });
  };
  return { CV, Core, D, U, AD, calls, tapAt };
}
/* 铺一个"挂机攒了 30 分钟、产线也派了领队"的档（材料那一项才有数） */
/* ⚠️ 默认把引导清掉：**引导是真模态**（新号主页挂着引导时，那颗「收取奖励」本来就该被引导吃掉，
   这是引导的设计、不是本单的 bug）。本尺子量的是"面板与两颗按钮"，所以先把引导摘掉 ——
   只有 ⑥-3 特意留着它，专门验"结算页上引导让路"那一档。 */
function openState(Core, D, sec, keepCoach) {
  Core.newGame();
  Core.setPlayerName('挂机体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  Core.S.player.level = 30;
  ['points', 'otherworld'].forEach((k) => Core.addCur(k, 5000));
  const cid = (D.characters || [])[0] && (D.characters || [])[0].id;
  if (cid) { Core.addChar(cid); Core.setIdleLeader('gather', cid); }
  Core.S.idle.bankSec = (sec === undefined ? 1800 : sec);
  /* 真玩家是**站在首页**点那颗「收取奖励」的（不是凭空从空栈里点）——
     结算页要能把"从哪来"记下来才能退回首页，这一步不能省。 */
  global.CV.reset('home');
  if (!keepCoach && global.U && global.U.coachClearAll) global.U.coachClearAll();
}
const curSnap = (Core) => ({ points: Core.S.cur.points || 0, otherworld: Core.S.cur.otherworld || 0, exp: Core.S.player.exp || 0 });
const hitIds = (CV) => (CV.hits || []).map((h) => String(h.id));
const hasText = (s) => stream().indexOf(s) >= 0;
const onOneLine = (s) => lines().some((x) => x.indexOf(s) >= 0);

/* ================= ① offline_double 不限次数 · 不占总闸 ================= */
console.log('\n=== ① offline_double 仍在 FREE_SLOTS：不限次数 · 不计总闸 ===');
{
  const SRC = fs.readFileSync(path.join(JS, 'wx-adapter.js'), 'utf8');
  const freeSlot = /FREE_SLOTS\s*=\s*\[[^\]]*'offline_double'/.test(SRC);
  const limits = /const LIMITS\s*=\s*\{([\s\S]*?)\};/.exec(SRC);
  const inLimits = !!(limits && /\boffline_double\s*:/.test(limits[1]));
  t('①-1 源码：offline_double 在 FREE_SLOTS 里，且**不在 LIMITS 日配额表**里',
    freeSlot && !inLimits, 'FREE_SLOTS ' + (freeSlot ? '有' : '**没有**') + ' · LIMITS ' + (inLimits ? '**混进去了**' : '没有'));

  const { AD } = bootEnv({ realAd: true });
  (async () => {
    const t0 = AD.totalLeft();
    let ok = 0;
    for (let i = 0; i < 25; i++) { const r = await AD.show('offline_double'); if (r && r.granted) ok++; }
    t('①-2 行为：连点 25 次全发、总闸一动不动（不限次数、不占总闸）',
      ok === 25 && AD.totalLeft() === t0, 'granted ' + ok + '/25 · 总闸 ' + t0 + ' → ' + AD.totalLeft());
    stage2();
  })();
}

/* ================= ② 点「收取奖励」弹半透明弹窗，奖励逐项列出 ================= */
function stage2() {
  console.log('\n=== ② 挂机卡「收取奖励」→ 半透明弹窗（逐项列出，不是一句"已领取"，也不是单开一页）===');
  const { CV, Core, D, U, calls } = bootEnv({ realAd: true });
  openState(Core, D);
  const bank = Core.idleBankGains();
  const fmt = global.formatDuration;
  TEXT = []; TXY = [];
  CV.dispatch('claim_all');
  const ov = U.overlay;                                // ← 0927-P：面板就是 U.confirm 那一层
  const chips = ov ? (ov.rows || []).reduce((a, r) => a.concat(r.map((c) => c.t)), []) : [];
  /* `--trace`：把这一帧**真的画在哪儿**打出来（回单里的"弹窗长什么样"用它，
     不用另写一份渲染脚本 —— 那样验的就不是交付物了）。 */
  if (process.argv.indexOf('--trace') >= 0) {
    console.log('  ── 渲染轨迹（画布 ' + CV.W + '×' + CV.H + '，弹窗那一层走**屏幕坐标**）──');
    console.log('  弹窗卡片 = ' + JSON.stringify({ x: Math.round(ov.x), y: Math.round(ov.y), w: Math.round(ov.w), h: Math.round(ov.h) }));
    console.log('  标题 = ' + JSON.stringify(ov.title) + ' · 正文 = ' + JSON.stringify(ov.lines));
    console.log('  胶囊 = ' + JSON.stringify(chips));
    console.log('  按钮行 y = ' + Math.round(ov.y + ov.btnY) + ' · 高 44 · 单按钮 ' + ov.single);
    lines().forEach((ln, i) => { console.log('  文字行 ' + (i + 1) + '：' + ln); });
    (CV.hits || []).forEach((h) => {
      console.log('  热区 ' + h.id + '  x=' + Math.round(h.x) + ' y=' + Math.round(h.y)
        + ' ' + Math.round(h.w) + '×' + Math.round(h.h) + (h.screen ? '（屏幕坐标）' : ''));
    });
  }
  t('②-1 点「收取奖励」弹出的是**半透明弹窗**（不是直接收掉、也不是单开一页的结算层）',
    !!ov && ov.title === '挂机结算' && CV.top().name === 'home' && ov.blankClose === true,
    'top=' + CV.top().name + '（应 home）· overlay=' + (ov && ov.title) + ' · blankClose=' + (ov && ov.blankClose));
  t('②-2 没有走旧的"已领取 N 项"那条 toast 路（画面上不出现"已领取"）',
    !hasText('已领取'), '画出来的字 ' + TEXT.length + ' 个');

  /* 材料那一项：档位与数量都由逻辑层给（与真领取同口径），不是这里另算一遍 */
  const mi = Core.idleMatItem();
  const it = (D.ITEMS || {})[mi.item] || {};
  const matN = Math.floor(bank.mat / Math.pow(2, mi.tier - 1));
  const matChip = ((it.icon) || '🎒') + ' ' + ((it.name) || mi.item) + '×' + matN;
  /* 二段断言：**面板数据**（每一项自带图标与数量）＋ **真的落到画布上**。
     ⚠️ ◉ / ◆ 是**自绘图标（矢量路径）**，不进 fillText —— 所以"图标有没有"看弹窗的胶囊，
        "数有没有写出来"看画出来的字，两者都要过。 */
  const wantList = ['◉ +' + global.fmt(bank.points), 'EXP +' + global.fmt(bank.exp), '◆ +' + bank.otherworld].concat(matN > 0 ? [matChip] : []);
  t('②-3 奖励**逐项列出**：胶囊里每项各带自己的图标与数量（点数 / 经验 / ◆ / 材料）',
    chips.length === wantList.length && wantList.every((x, i) => chips[i] === x), JSON.stringify(chips));
  t('②-4 这些数真的落到画布上了（数字 ＋ 材料自己的名字 × 数量）',
    ['+' + global.fmt(bank.points), 'EXP +' + global.fmt(bank.exp), '+' + bank.otherworld]
      .concat(matN > 0 ? [((it.name) || mi.item) + '×' + matN] : [])
      .every((x) => hasText(x)), '画出来的行 ' + JSON.stringify(lines()));
  t('②-5 顶部写清挂机时长（"已挂 30分0秒"）',
    onOneLine('已挂 ' + fmt(bank.seconds)), '期望 "已挂 ' + fmt(bank.seconds) + '" · 实际 ' + JSON.stringify(lines()));
  t('②-6 这个弹窗叫「挂机结算」，与「离线收益」分得清（画面上不许出现"离线"）',
    hasText('挂机结算') && !hasText('离线'),
    '标题 ' + ['挂机结算'].filter(hasText).join('/'));
  t('②-7 画面上没有 undefined / NaN / [object Object]（字段取错的通用指纹）',
    !/undefined|NaN|\[object/.test(stream()));

  /* ================= ③ 两颗按钮 ＋ 真的走广告 ================= */
  const ids = hitIds(CV);
  t('③-1 面板底部**两颗按钮**：领取（idle_claim）／看广告·双倍领取（idle_double）',
    ids.indexOf('idle_claim') >= 0 && ids.indexOf('idle_double') >= 0, ids.join(' · '));
  t('③-2 两颗按钮的文案都真的画出来了（不是空按钮）',
    hasText('领取') && TEXT.some((x) => x.indexOf('看广告') >= 0 && x.indexOf('双倍') >= 0));
  /* 热区几何：整条落在画布里 ＋ 高度 ≥44px（≥88rpx 那条界面基准） */
  const hb = (CV.hits || []).filter((h) => h.id === 'idle_double' || h.id === 'idle_claim');
  t('③-2b 两颗按钮的热区：整条在画布内 ＋ 高度 ≥44（够 88rpx）',
    hb.length === 2 && hb.every((h) => h.x >= 0 && h.y >= 0 && h.x + h.w <= CV.W && h.y + h.h <= CV.H && h.h >= 44),
    hb.map((h) => h.id + ' ' + Math.round(h.w) + '×' + Math.round(h.h) + '@' + Math.round(h.y)).join(' · '));
  calls.length = 0;
  CV.dispatch('idle_double');
  t('③-3 点「看广告 · 双倍领取」真的调 `AD.show("offline_double")`',
    calls.length === 1 && calls[0] === 'offline_double', 'calls=' + JSON.stringify(calls));
  (async () => {
    await tick();
    /* 双倍成功后：弹窗原地换成"已翻倍"的样子（与离线那条同一口径），广告那颗收掉 */
    const p2 = U.overlay;
    const ids2 = hitIds(CV);
  t('③-4 看完广告：弹窗原地重画成"收益 ×2"，只剩一颗「收下」（不再重复发奖）',
      !!p2 && p2.single === true && p2.okLabel === '收下'
      && hasText('收益 ×2') && ids2.indexOf('idle_claim') < 0 && ids2.indexOf('idle_double') < 0
      && ids2.indexOf('_cf_yes') >= 0,
      '弹窗 ' + (p2 && p2.okLabel) + ' · 单按钮 ' + (p2 && p2.single) + ' · 热区 ' + ids2.join('+'));
    stage3();
  })();
}

/* ================= ④ 双倍真的发两份（与"只领取"对照） ================= */
/* "只领取"那一次的到账量 —— ⑤ 段（弱网兜底）要拿它当"原额"的基准 */
const CONTROL = { points: 0, otherworld: 0, exp: 0 };
function stage3() {
  console.log('\n=== ④ 双倍路径真的发两份（对照"只领取"那一次）===');
  const A = bootEnv({ realAd: true });
  openState(A.Core, A.D);
  const bankA = A.Core.idleBankGains();
  const beforeA = curSnap(A.Core);
  A.CV.dispatch('claim_all');
  A.CV.dispatch('idle_claim');                       // 只领取
  const afterA = curSnap(A.Core);

  const B = bootEnv({ realAd: true });
  openState(B.Core, B.D);
  const bankB = B.Core.idleBankGains();
  const beforeB = curSnap(B.Core);
  B.CV.dispatch('claim_all');
  B.CV.dispatch('idle_double');                      // 看广告双倍
  (async () => {
    await tick();
    const afterB = curSnap(B.Core);
    const dA = { points: afterA.points - beforeA.points, otherworld: afterA.otherworld - beforeA.otherworld, exp: afterA.exp - beforeA.exp };
    const dB = { points: afterB.points - beforeB.points, otherworld: afterB.otherworld - beforeB.otherworld, exp: afterB.exp - beforeB.exp };
    CONTROL.points = dA.points; CONTROL.otherworld = dA.otherworld; CONTROL.exp = dA.exp;
    t('④-1 两个假环境状态相同（挂机银行 / 其它可领都一致）',
      JSON.stringify(bankA) === JSON.stringify(bankB), JSON.stringify(bankA));
    t('④-2 「领取」发到的（至少）是挂机收益那一份',
      dA.points >= bankA.points && dA.otherworld >= bankA.otherworld,
      '领取 Δ◉' + dA.points + '（挂机 ' + bankA.points + '）· Δ◆' + dA.otherworld + '（挂机 ' + bankA.otherworld + '）');
    t('④-3 「看广告 · 双倍领取」**多出来的正好是一份挂机收益**（＝全额 ×2，不是 ×1 也不是 ×3）',
      dB.points - dA.points === bankA.points && dB.otherworld - dA.otherworld === bankA.otherworld,
      '双倍 Δ◉' + dB.points + ' vs 领取 Δ◉' + dA.points + '（差 ' + (dB.points - dA.points) + '，应为 ' + bankA.points + '）'
      + ' · Δ◆ 差 ' + (dB.otherworld - dA.otherworld) + '，应为 ' + bankA.otherworld);
    t('④-4 同一个窗口只许翻一次（再点一次不会凭空再发一份）',
      (function () { const d2 = B.Core.claimIdleDouble(); return !d2.ok; })(),
      '第二次翻倍 ' + JSON.stringify(B.Core.claimIdleDouble()));
    /* ④-5 跨档不许照旧记录发奖：翻倍记录只在内存里，换档 / 新档之后它就是"上一份档的账"。
       界面那条路已经是"先真领一次、才允许翻"（sc-home），这里再钉住"隔了一段时间也不许翻"。 */
    const K = bootEnv({ realAd: true });
    openState(K.Core, K.D);
    K.CV.dispatch('claim_all');
    K.CV.dispatch('idle_claim');                     // 领过一份，记录留下
    K.Core.newGame();                                // 换了一份新档（界面不会再开面板：银行是 0）
    const beforeK = curSnap(K.Core);
    const dK = K.Core.claimIdleDouble();
    const afterK = curSnap(K.Core);
    t('④-5 隔档 / 隔了太久：旧记录不许再翻一份（`claimIdleDouble` 自己兜底，不靠调用方记得）',
      (afterK.points - beforeK.points) === 0, '结果 ' + JSON.stringify(dK) + ' · Δ◉' + (afterK.points - beforeK.points));
    stage4();
  })();
}

/* ================= ⑤ 弱网（真广告拉不到）：不给双倍 · 不吃补偿 · 原额仍在 =================
   父亲大人 2026-09-27：「**弱网拉不到广告时不给双倍**，不用新造吧，就这样吧」——
   所以这一段的判据是"**一分都不发**"，而不是"照给双倍"。补偿（comp ≤10/天）只服务
   "**有配额可丢**"的资源点位（挂机加速 / 扫荡 / 高级池 / 签到 / 复活）；`offline_double`
   与 `speed_x5` 不限次数、拉不到也不损失任何机会，照给就是白送 → `wx-adapter` 的
   `NO_COMP_SLOTS` 把它们挡在补偿之外。做坏试验：把那条 guard 去掉 → ⑤-1／⑤-2 同时红。 */
function stage4() {
  console.log('\n=== ⑤ 弱网（真广告拉不到）：不给双倍 · 不吃补偿 · 面板留着 ===');
  /* ⑤-1 拉不到 → 一分不发 */
  const C = bootEnv({ realAd: true, adFails: true });
  openState(C.Core, C.D);
  const bankC = C.Core.idleBankGains();
  const comp0 = C.AD.compLeft();
  const beforeC = curSnap(C.Core);
  C.CV.dispatch('claim_all');
  C.CV.dispatch('idle_double');
  (async () => {
    await tick();
    const afterC = curSnap(C.Core);
    const r1 = await C.AD.show('offline_double');       // 这条只是把 reason 打出来给人看
    t('⑤-1 广告拉不到：**不发双倍**（Δ＝0），挂机那一份还在银行里（没被提前花掉）',
      (afterC.points - beforeC.points) === 0,
      'Δ◉' + (afterC.points - beforeC.points) + '（应＝0）· 银行那一份 ◉' + bankC.points
      + ' · reason=' + (r1 && r1.reason));

    /* ⑤-2 不吃补偿：这一下**一次 comp 都不许动** ——
       "不限次数"两类没有日配额可丢，照给就是把 comp 花在"本来就没损失"的人身上（拔网线白刷）。 */
    t('⑤-2 不吃补偿（comp 一次没动）：「不限次数」的点位拉不到就稍后再试，不白送',
      C.AD.compLeft() === comp0 && String(r1 && r1.reason).indexOf('compensated') !== 0,
      'comp 剩 ' + comp0 + ' → ' + C.AD.compLeft() + ' · reason=' + (r1 && r1.reason));

    /* ⑤-3 弱网最坏情况：连点 25 次，仍然一次都不发、comp 也不许被啃 */
    const b2 = curSnap(C.Core);
    for (let i = 0; i < 25; i++) { await C.AD.show('offline_double'); }
    const after2 = curSnap(C.Core);
    t('⑤-3 连点 25 次弱网：仍然一次都不发、comp 仍是满的',
      (after2.points - b2.points) === 0 && C.AD.compLeft() === comp0,
      'Δ◉' + (after2.points - b2.points) + ' · comp 剩 ' + C.AD.compLeft());

    /* ⑤-4 弹窗留着、两颗按钮都在：玩家当场就能领原额，网络好了还能再点这颗换双倍 */
    const idsC = hitIds(C.CV);
    t('⑤-4 弹窗留着、两颗按钮都还在（「领取」照常领原额，网络好了还能再点双倍）',
      !!C.U.overlay && C.CV.top().name === 'home' && idsC.indexOf('idle_claim') >= 0 && idsC.indexOf('idle_double') >= 0
      && hasText('稍后再试'),
      '弹窗还开着（' + (C.U.overlay && C.U.overlay.title) + '）· 页面 ' + C.CV.top().name
      + ' · 热区 ' + idsC.filter((x) => x.indexOf('idle') === 0).join('+')
      + ' · 提示"稍后再试" ' + (hasText('稍后再试') ? '✓' : '✗'));

    /* ⑤-5 边界：挂机不到 1 分钟 → 不弹空面板，仍走原来那条一键收 */
    const E = bootEnv({ realAd: true });
    openState(E.Core, E.D, 30);
    E.CV.dispatch('claim_all');
    t('⑤-5 挂机不足 1 分钟：不弹面板（不留一屏「◉ +0」），仍走原来那条一键收',
      E.CV.top().name === 'home' && !E.U.overlay, 'top=' + E.CV.top().name);

    /* ================= ⑥ 状态矩阵：没有广告模块 / 背包满 / 极端数字 ================= */
    /* ⑥-1 这一版没有广告模块（AD 整个不存在）→ 面板只留一颗「领取」，
       不许留一颗"点了只弹一句没有模块"的死键。 */
    const F = bootEnv({ realAd: true });
    openState(F.Core, F.D);
    delete global.AD;
    F.CV.dispatch('claim_all');
    const idsF = hitIds(F.CV);
    t('⑥-1 没有广告模块时：面板只剩一颗「领取」，不出现"看广告"（不留死键）',
      idsF.indexOf('idle_claim') >= 0 && idsF.indexOf('idle_double') < 0 && !hasText('看广告'),
      'idle_claim ' + (idsF.indexOf('idle_claim') >= 0) + ' · idle_double ' + (idsF.indexOf('idle_double') >= 0)
      + ' · 画面上有"看广告" ' + hasText('看广告'));

    /* ⑥-2 背包正好满载（最极端那一档）：挂机材料**原额 ＋ 翻倍两份都进「📮 待领箱」**，
       一份都不许吞（"宁可少收，也不吞玩家的东西"）。 */
    const H = bootEnv({ realAd: true });
    openState(H.Core, H.D);
    const miH = H.Core.idleMatItem();
    const keys = Object.keys(H.D.ITEMS).filter((k) => k !== miH.item).slice(0, H.Core.S.bag.itemCap || 50);
    H.Core.S.items = {};
    keys.forEach((k) => { H.Core.S.items[k] = 1; });          // 一格一件，正好塞满
    const matN2 = Math.floor(H.Core.idleBankGains().mat / Math.pow(2, miH.tier - 1));
    const stash0 = H.Core.stashCount();
    const mat0 = H.Core.S.items[miH.item] || 0;
    H.CV.dispatch('claim_all');
    H.CV.dispatch('idle_double');
    await tick();
    t('⑥-2 背包满载：挂机材料**两份（原额 ＋ 翻倍）都进待领箱**，一份都没吞',
      matN2 > 0 && H.Core.stashCount() === stash0 + matN2 * 2 && (H.Core.S.items[miH.item] || 0) === mat0,
      '材料 ' + miH.item + '×' + matN2 + '/份 · 待领箱 ' + stash0 + ' → ' + H.Core.stashCount()
      + '（应 +' + (matN2 * 2) + '）· 背包里那一项 ' + (H.Core.S.items[miH.item] || 0));

    /* ⑥-3 真手指那一下（走 `hitAt` ＋ 引导那道闸，不是 `CV.dispatch` 直呼处理器）：
       引导**故意留着**（`keepCoach`）—— 新号主页的引导是真模态，而结算页是战斗页 ⇒
       `coachSuspended()` 让引导让路。这一条钉的就是"引导不会把结算页那两颗按钮吃掉"。
       （面板本身用 `U.idleSettle()` 打开 —— 那正是那颗按钮做的事；引导挂着时 `CV.dispatch`
        会把首页那一下吃掉，那是引导的设计。） */
    const I = bootEnv({ realAd: true });
    openState(I.Core, I.D, 1800, true);           // 不清引导：让它真的挂着
    const coachOn = !!(I.U.coachActive && I.U.coachActive());
    I.U.idleSettle();
    const hI = (I.CV.hits || []).filter((h) => h.id === 'idle_double')[0];
    const drawn = hI && I.U.coachAllows && I.U.coachAllows(hI);
    I.calls.length = 0;
    if (hI) I.tapAt(hI.x + hI.w / 2, hI.y + hI.h / 2);
    t('⑥-3 真手指点在「看广告 · 双倍领取」上接得住（结算页让引导让路，不会被引导吃掉）',
      !!hI && drawn === true && I.calls.length === 1 && I.calls[0] === 'offline_double',
      '引导还挂着 ' + coachOn + ' · 热区 ' + (hI ? 'y=' + Math.round(hI.y) : '**没有**')
      + ' · 引导放行 ' + drawn + ' · calls=' + JSON.stringify(I.calls));

    /* ⑥-4 另一颗（金底「领取」）同样用真手指点：点完应当**发奖 ＋ 退回开面板那一页**。 */
    const J = bootEnv({ realAd: true });
    openState(J.Core, J.D);
    const beforeJ = curSnap(J.Core);
    J.CV.dispatch('claim_all');
    const hJ = (J.CV.hits || []).filter((h) => h.id === 'idle_claim')[0];
    if (hJ) J.tapAt(hJ.x + hJ.w / 2, hJ.y + hJ.h / 2);
    const afterJ = curSnap(J.Core);
    t('⑥-4 真手指点金底「领取」：发奖（Δ◉>0）＋ 结算页关掉、退回首页',
      !!hJ && (afterJ.points - beforeJ.points) > 0 && J.CV.top().name === 'home',
      'Δ◉' + (afterJ.points - beforeJ.points) + ' · 落在 ' + J.CV.top().name);

    /* ================= ⑦ 0927-P 新增：点空白处＝关掉弹窗、原地回灯阁 =================
       父亲大人 09-27：「**支持点击空白处返回**」。
       判据三件：① 弹窗上真的登记了那块整屏热区（`_cf_blank`，**登记在两颗按钮之前**）；
                 ② 点空白 → 弹窗关掉、页面原地不动、**一分钱不发**、**也没走广告那条路**；
                 ③ 原额还在银行里（下次点「收取奖励」照常能领）。
       做坏试验（必须能红）：把 `U.drawOverlay` 里 `if (o.blankClose) CV.hit('_cf_blank', …)` 那行删掉
       → ⑦-1/⑦-2 当场红（点空白变成什么都不发生）。 */
    console.log('\n=== ⑦ 点空白处返回：关弹窗 · 不发奖 · 不走广告 ===');
    const L = bootEnv({ realAd: true });
    openState(L.Core, L.D);
    const bankL = L.Core.idleBankGains();
    const beforeL = curSnap(L.Core);
    L.CV.dispatch('claim_all');
    const idsL = hitIds(L.CV);
    const blankHit = (L.CV.hits || []).filter((h) => h.id === '_cf_blank')[0];
    const btnHit = (L.CV.hits || []).filter((h) => h.id === 'idle_claim')[0];
    t('⑦-1 收益弹窗上登记了整屏那颗"空白"热区（只在 blankClose 的弹窗上）',
      !!blankHit && !!btnHit && blankHit.w >= L.CV.W && blankHit.h >= L.CV.H,
      '热区 ' + idsL.filter((x) => x.indexOf('_cf_') === 0 || x.indexOf('idle') === 0).join('+')
      + (blankHit ? (' · 空白 ' + Math.round(blankHit.w) + '×' + Math.round(blankHit.h)) : ' · **没有**'));
    L.calls.length = 0;
    /* 点真正的空白：画布左上角（弹窗卡片之外）——并且**必须走真手指那条路**（hitAt + 模态闸） */
    L.tapAt(4, 4);
    const afterL = curSnap(L.Core);
    t('⑦-2 点空白：弹窗关掉、原地回灯阁、**一分钱不发**、也没调广告',
      !L.U.overlay && L.CV.top().name === 'home' && (afterL.points - beforeL.points) === 0 && L.calls.length === 0,
      '弹窗 ' + (L.U.overlay ? '还开着' : '已关') + ' · 页面 ' + L.CV.top().name
      + ' · Δ◉' + (afterL.points - beforeL.points) + ' · 广告调用 ' + JSON.stringify(L.calls));
    t('⑦-3 那一份挂机收益**还在银行里**（点空白＝这次不领，不是把奖丢了）',
      (L.Core.idleBankGains().seconds || 0) >= 60 && L.Core.idleBankGains().points === bankL.points,
      '银行 ◉' + L.Core.idleBankGains().points + '（原 ' + bankL.points + '）· 秒 ' + L.Core.idleBankGains().seconds);
    /* 反面：**确认类**弹窗不许开这一档（父亲大人：确认弹窗必须点按钮）—— */
    const M = bootEnv({ realAd: true });
    openState(M.Core, M.D);
    M.CV.reset('home');
    M.U.confirm('普通确认', '这种弹窗不许点空白关掉。', function () {});
    t('⑦-4 普通确认弹窗**没有**那块空白热区（确认类必须点按钮，点空白什么都不该发生）',
      !M.U.overlay.blankClose && hitIds(M.CV).indexOf('_cf_blank') < 0,
      '热区 ' + hitIds(M.CV).filter((x) => x.indexOf('_cf') === 0).join('+'));
    M.U.overlay = null;

    console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 过 / ' + fail + ' 红\n');
    process.exit(fail ? 1 : 0);
  })();
}
