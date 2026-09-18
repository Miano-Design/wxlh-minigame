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
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, G = global.GameGlobal;
CV.setup(global.wx.getWindowInfo());
const U = G.U;
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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
