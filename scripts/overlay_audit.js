/* 弹窗布局尺子：node scripts/overlay_audit.js
   ------------------------------------------------------------------------------
   起因（V9.6.94，父亲大人："离线后开启游戏的弹窗字也贴一起了"）：
   弹窗的高度以前是**一套公式**算的，drawOverlay 里又是**另一套坐标**在画 ——
   两边一旦漂移，"离线期间…"那行小字就压到按钮上（离线收益弹窗真踩到了）。
   现在 U.confirm 只排一次版（titleY / lineY / chipY / noteY / btnY），这里就盯着那组坐标：
     · 相邻两块**不许重叠**，而且要留出最小间距
     · 按钮必须整块落在弹窗里，弹窗必须整块落在画布内
   把常见形态都过一遍：纯文字 / 带胶囊 / 带小字 / 三行以上 / 胶囊折成多行。
   只读脚本，跑在假环境里。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctxStub = new Proxy({}, {
  get(t, k) {
    /* 按字数算宽度（约 1 个汉字 12px）—— 别的审计里是恒返回 10，
       那会让 CV.wrap/CV.fit 以为"永远放得下"，折行相关的用例全变成 1 行（量不出东西）。 */
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
const touch = { start: [], move: [], end: [] };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { touch.start.push(fn); }, onTouchMove(fn) { touch.move.push(fn); }, onTouchEnd(fn) { touch.end.push(fn); },
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, G = global.GameGlobal;
CV.setup(global.wx.getWindowInfo());
const U = G.U;
/* 底栏页签的处理器是在**真实入口 game.js** 里注册的，这里补上（否则"恢复可用"那条测不出来） */
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });
/* U.confirm 会顺手重画一帧（当前页是首页）—— 先把存档铺好，否则页面渲染会取不到数据 */
global.Core.newGame();
global.Core.setPlayerName('弹窗体检');
try { global.Core.choosePlayerBloodline('修真'); } catch (e) {}
CV.reset('home');
const CHIP_H = 26, LH_T = CV.FS.f1 * 1.35, LH_L = CV.FS.lg * 1.7, LH_N = CV.FS.xs * 1.7;

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* 把弹窗折成"视觉块"：标题 / 正文(可多行) / 胶囊(可多行) / 小字(可多行) / 按钮。
   注意**同一段折出来的多行要合成一块** —— 行盒本来就紧挨着（那是行高，不是"贴一起"），
   只有**块与块之间**才要求留缝。 */
function blocks(o) {
  const b = [{ n: '标题', a: o.titleY - LH_T / 2, z: o.titleY + LH_T / 2 }];
  if (o.lineY.length) b.push({ n: '正文', a: o.lineY[0] - LH_L / 2, z: o.lineY[o.lineY.length - 1] + LH_L / 2 });
  if (o.chipY.length) b.push({ n: '胶囊', a: o.chipY[0] - CHIP_H / 2, z: o.chipY[o.chipY.length - 1] + CHIP_H / 2 });
  /* 输入格（0927-P：挂机结算/删档确认那套）—— 也当一块参与"块与块不许贴住"的量算 */
  if (o.input) b.push({ n: '输入', a: o.input.y, z: o.input.y + o.input.h });
  if (o.noteY.length) b.push({ n: '小字', a: o.noteY[0] - LH_N / 2, z: o.noteY[o.noteY.length - 1] + LH_N / 2 });
  b.push({ n: '按钮', a: o.btnY, z: o.btnY + 44 * CV.SCALE });
  return b;
}

function check(name, cfg, title, text) {
  U.confirm(title, text, function () {}, cfg);
  const o = U.overlay;
  const b = blocks(o);
  let worst = Infinity, who = '';
  for (let i = 1; i < b.length; i++) {
    const gap = b[i].a - b[i - 1].z;
    if (gap < worst) { worst = gap; who = b[i - 1].n + '→' + b[i].n; }
  }
  const fitsCanvas = o.y >= 0 && o.y + o.h <= CV.H;
  const btnInside = o.btnY >= 0 && o.btnY + 44 * CV.SCALE <= o.h;
  const ok = worst >= 4 && fitsCanvas && btnInside;
  t(name, ok, '最小间距 ' + worst.toFixed(1) + 'px（' + who + '）'
    + ' · 高 ' + o.h.toFixed(0) + (fitsCanvas ? '' : ' · **超出画布**') + (btnInside ? '' : ' · **按钮出界**'));
}

console.log('\n=== 弹窗布局尺子 ===');
check('离线收益（1 行正文 + 4 个胶囊 + 1 行小字，单按钮）',
  { chips: ['◈ +12,345', 'EXP +6,789', '◆ +12', '❖ +3'], note: '离线期间挂机分工的产线一样在跑。', cancel: false, okLabel: '收下' },
  '欢迎回来，执灯者', '离线 3 小时 20 分（效率 85%）');
check('离线收益 · 胶囊多到折两行', 
  { chips: ['◈ +12,345', 'EXP +6,789', '◆ +12', '❖ +3', '⚙️ 强化材料×42', '📮 待领箱 +7'], note: '离线期间挂机分工的产线一样在跑。', cancel: false, okLabel: '收下' },
  '欢迎回来，执灯者', '离线 11 小时 59 分（效率 100%）');
check('七日登录（1 行正文 + 1 个胶囊，单按钮）',
  { chips: ['🌕 🎫 SSR自选券'], cancel: false, okLabel: '收下' }, '七日登录 · 第 7 天', '今日奖励');
check('时间异常（1 行正文，单按钮）',
  { cancel: false, okLabel: '知道了' }, '⚠ 时间异常', '检测到系统时间被修改，本次离线收益已取消。');
check('普通确认（短句，双按钮）', {}, '撤离', '确定撤离？这场战斗不算数（不给奖励）。');
check('普通确认（长句折到 3~4 行）', {},
  '确定撤离？',
  '确定撤离？这场战斗不算数（不给奖励），本次探索进度会清空，已经拿到的奖励保留。撤离之后这一关要重新打，队伍血量按当前状态保留。');
/* 0927-P 新增的那一档：**输入格**（删档二次确认那颗弹窗：标题带随机 4 位数字 ＋ 一个输入格）。 */
check('删档二次确认（标题带 4 位数字 + 输入格 + 小字 + 单按钮）',
  { inputBox: { value: '', placeholder: '点这里输入这四个数字' }, inputId: 'wipe_input',
    cancel: false, okLabel: '取消', okStyle: 'ghost',
    note: '删档前会先把现在这份进度留一手，真删错了能在【找回存档】里拿回来一份。' },
  '删除当前进度　7 3 0 5',
  '会清掉这台设备上的全部进度，重新从开局契约开始。\n照着上面这四个数字输入一遍才会删档。');

/* ---------- N1（留存环第一格）：上面那些是手写样例，这一条量**真实的**七日登录那一屏 ----------
   起因：七日登录是全游戏唯一"每天必定被看到"的留存件，可它原来只画当天那一格 ——
   玩家不知道第 7 天有 🎫SSR自选券（见 `岗位回单/游戏策划总监-0927N留存环.md` 的 N1）。
   做坏试验：把 `U.loginReward` 里的 `ladder()` 改回"只画当天那一格" → 下面第 1 条当场红。 */
(function loginLadder() {
  const D = global.DATA, LIST = D.LOGIN_REWARDS;
  const day = LIST.length;                       // 第 7 天：钩子最厚、字最长的那一屏
  U.loginReward({ day: day, reward: LIST[day - 1], round: 1, cycleDays: LIST.length });
  const o = U.overlay;
  const chips = ((o && o.rows) || []).reduce((a, r) => a.concat(r.map((c) => c.t)), []);
  const b = blocks(o);
  let worst = Infinity, who = '';
  for (let i = 1; i < b.length; i++) { const gap = b[i].a - b[i - 1].z; if (gap < worst) { worst = gap; who = b[i - 1].n + '→' + b[i].n; } }
  t('N1 七日登录：**真实**那一屏 7 格全在，且在 390×844 上排得下、按钮在框内',
    !!o && chips.length === LIST.length && o.y >= 0 && o.y + o.h <= CV.H
      && o.btnY + 44 * CV.SCALE <= o.h && worst >= 4,
    chips.length + ' 格 · 高 ' + (o ? o.h.toFixed(0) : '—') + ' · 最小间距 ' + worst.toFixed(1) + '（' + who + '）');
  t('N1 第 7 天的钩子看得见（🎫SSR自选券 写在「第7天」那一格上）',
    !!chips[6] && /第7天/.test(chips[6]) && /SSR自选券/.test(chips[6]), chips[6] || '（没有第 7 格）');
  t('N1 今天那一格带（今天）、没到的那些不冒充已领',
    /（今天）/.test(chips[6] || '') && chips.slice(0, 6).every((c) => c.indexOf('今天') < 0),
    JSON.stringify(chips).slice(0, 200));
  /* 短屏（机型适配的老账）：320×568 上同一个弹窗也得整块在画布里 */
  CV.setup({ windowWidth: 320, windowHeight: 568, pixelRatio: 2, safeArea: { top: 20, bottom: 548 } });
  U.loginReward({ day: day, reward: LIST[day - 1], round: 1, cycleDays: LIST.length });
  const o2 = U.overlay;
  t('N1 短屏 320×568：同一个弹窗也在画布里（不出屏、按钮不出框）',
    !!o2 && o2.y >= 0 && o2.y + o2.h <= CV.H && o2.btnY + 44 * CV.SCALE <= o2.h,
    o2 ? ('高 ' + o2.h.toFixed(0) + ' @ y=' + o2.y.toFixed(0) + ' / 画布 ' + CV.H) : '（没有弹窗）');
  CV.setup({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } });
  U.overlay = null;
})();

/* ---------- 模态是不是"真挡住"：弹窗开着的时候，底栏不许被点到 ----------
   起因（V9.6.95 自审实测）：弹窗开着时点底栏居然真的换页了 ——
   `overlayOnly` 只挡了内容层热区，顶栏/底栏是 screen 标记，照样放行。
   这里走**真触摸管线**（CV.bindTouch 绑的 wx.onTouch* ）验一遍。 */
CV.bindTouch();
function tapAt(x, y) {
  const ev = { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] };
  touch.start.forEach((fn) => fn(ev));
  touch.end.forEach((fn) => fn(ev));
}
(function modalBlocksNav() {
  CV.reset('home');
  const bagHit = (CV.hits || []).find((h) => h.id === 'tab:bag');
  if (!bagHit) { t('底栏页签热区能找到（前置条件）', false, '没找到 tab:bag'); return; }
  const cx = bagHit.x + bagHit.w / 2, cy = bagHit.y + bagHit.h / 2;
  U.confirm('测试弹窗', '弹窗打开时点底栏不应该换页。', function () {});
  const before = CV.top().name;
  tapAt(cx, cy);                       // 点"背包"页签
  t('弹窗打开时点底栏不换页（模态真挡住）', CV.top().name === before,
    before + ' → ' + CV.top().name);
  t('弹窗自己那颗按钮仍然能点', !!(U.overlay), '弹窗还开着（刚才那下没被它吃掉）');
  const okHit = (CV.hits || []).find((h) => h.id === '_cf_yes');
  if (okHit) tapAt(okHit.x + okHit.w / 2, okHit.y + okHit.h / 2);
  t('点弹窗按钮能关掉它', !U.overlay, U.overlay ? '还开着' : '已关闭');
  /* 关掉之后再点底栏应该恢复正常。
     注意：引导如果还挂着，"点别处一律吃掉"**是它的正常职责**（父亲大人要的强制引导），
     所以这里先把它放下再测底栏 —— 否则测的就不是"弹窗关了没"，而是"引导在不在"。 */
  /* 换到一个**没有引导会冒出来**的页面再测底栏（首页一渲染，开场链就会重新武装自己 ——
     那是它该干的活，不是这条用例要测的东西）。 */
  if (U.coachDrop) U.coachDrop();
  CV.reset('gm');
  const b2 = (CV.hits || []).find((h) => h.id === 'tab:bag');
  if (b2) tapAt(b2.x + b2.w / 2, b2.y + b2.h / 2);
  t('弹窗关掉后底栏恢复可用', CV.top().name === 'bag',
    '当前页 ' + CV.top().name + ' · 页签热区' + (b2 ? '找到' : '**没找到**') + ' · 引导' + (U.coachActive && U.coachActive() ? '还在' : '已放'));
})();

/* ---------- N2（0927-P · 父亲大人：「支持点击空白处返回」）：热区登记顺序是死的 ----------
   判据（`uiw.js` 的 drawOverlay 就是照这条写的）：
     · `opt.blankClose` 的弹窗上有一颗**整屏**的模态热区（点它＝关弹窗、原地返回）；
     · 它**必须先登记**，两颗按钮（以及输入格）登记在它**之后** —— `hitAt` 从数组末尾往前扫，
       后登记的先命中；顺序反了，点按钮会先撞上那块整屏的（按钮就"点不动"了）；
     · 真手指点空白 → 弹窗关掉（**不调 onOk / onCancel**，这是"返回"不是"确定"）。
   做坏试验（必须能红）：把 `if (o.blankClose) CV.hit('_cf_blank', …)` 那行挪到两颗按钮**之后**
   → 这条当场红（顺序断言）。 */
(function blankCloseOrder() {
  CV.reset('home');
  if (U.coachDrop) U.coachDrop();
  let okCalled = false, cancelCalled = false;
  U.confirm('点空白返回（探针）', '正文一行。', function () { okCalled = true; },
    { blankClose: true, inputBox: { value: '', placeholder: '点这里输入' }, inputId: 'probe_input',
      cancelLabel: '取消', okLabel: '确定', onCancel: function () { cancelCalled = true; },
      note: '这一条只在尺子里用。' });
  const ids = (CV.hits || []).map((h) => String(h.id));
  const iBlank = ids.indexOf('_cf_blank'), iInput = ids.indexOf('probe_input');
  const iNo = ids.indexOf('_cf_no'), iYes = ids.indexOf('_cf_yes');
  t('N2 空白那颗热区**登记在按钮与输入格之前**（后登记优先 ⇒ 点按钮先命中按钮）',
    iBlank >= 0 && iInput > iBlank && iNo > iBlank && iYes > iBlank,
    '登记顺序 ' + JSON.stringify(ids.filter((x) => /^(_cf_|probe_)/.test(x))));
  const o = U.overlay;
  const b = blocks(o);
  const iy = o.y + o.input.y;
  t('N2 输入格整块落在弹窗卡片里（不与按钮行重叠）',
    iy > o.y && iy + o.input.h < o.y + o.btnY, '输入格 y=' + Math.round(iy) + '~' + Math.round(iy + o.input.h)
    + ' · 按钮行 y=' + Math.round(o.y + o.btnY) + ' · 卡片 ' + Math.round(o.y) + '~' + Math.round(o.y + o.h));
  const blanks = b.filter((x) => x.n === '输入')[0];
  const btns = b.filter((x) => x.n === '按钮')[0];
  t('N2 输入格与按钮之间留了量（块与块 ≥4px）', !!blanks && !!btns && (btns.a - blanks.z) >= 4,
    '净距 ' + (blanks ? (btns.a - blanks.z).toFixed(1) : '—') + 'px');
  /* 真手指点真正的空白（画布左上角）：应当"只是返回" —— 两个回调都不许被调 */
  tapAt(4, 4);
  t('N2 点空白：弹窗关掉，而且**没有**触发"确定 / 取消"任何一个回调（返回 ≠ 确认）',
    !U.overlay && !okCalled && !cancelCalled,
    '弹窗 ' + (U.overlay ? '还开着' : '已关') + ' · onOk ' + okCalled + ' · onCancel ' + cancelCalled);
  /* 反面：不许给确认类弹窗开这一档（父亲大人：确认弹窗必须点按钮） */
  U.confirm('确认类（探针）', '这种弹窗不该能点空白关掉。', function () {});
  t('N2 普通确认弹窗**没有**那块空白热区（确认类必须点按钮）',
    !U.overlay.blankClose && (CV.hits || []).every((h) => String(h.id) !== '_cf_blank'));
  U.overlay = null;
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
