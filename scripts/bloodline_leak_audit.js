/* 血统串味尺子：node scripts/bloodline_leak_audit.js
   ------------------------------------------------------------------------------
   起因（V9.6.97，父亲大人："小游戏开局选血统选科技，进游戏变成修真了"）：
   六支血统各有自己的**境界名**（狼人=兽崽/幼狼… 科技=改造体/义体兵… 修真=炼气/筑基…），
   但全局渡劫表 D.REALMS 上的 `name`/`full` 是**当年只有一条境界线时写死的修真名字**。
   小游戏境界页那句「下一阶 · 」就取了它 —— 于是任何血统进来都看到「炼气」，
   看着就像"选的血统被换成了修真"。网页版用的是 `st.nextName`（血统感知），所以没这毛病。

   这把尺子直接盯症状：**给每支血统开一局，把"讲玩家自己"的那几页画一遍，
   把画布上写过的每一个字录下来，去查有没有别的血统的名字 / 别的血统的境界名。**
   （伙伴列表、图鉴、招募结果这些页**故意**会显示别的血统 —— 那是别人的血统，不算串味，
   所以不在本尺子范围内。）
   只读脚本。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctxStub = new Proxy({}, {
  get(t, k) {
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

const CV = global.CV, Core = global.Core, D = global.DATA;
CV.setup(global.wx.getWindowInfo());

/* 「讲玩家自己」的页面 —— 这些页里出现别的血统名一律算串味 */
const MY_PAGES = ['home', 'protag', 'realm', 'party', 'bag', 'bag_mat', 'bag_equip', 'gm', 'settings', 'grow', 'achievement'];
const ALL = Object.keys(D.BLOODLINES);
const REALMS = {}; ALL.forEach((b) => { REALMS[b] = D.BLOODLINES[b].realms; });
/* 「渡劫」既是修真那条线的第 9 个大境名，也是全站通用的**动作词**
   （"境界渡劫""渡劫材料""⚡ 渡劫"）—— 所以查串味时把它排除，
   否则每一页都会误报。其余 35 个境界名都是各血统独有的，照查。 */
const GENERIC = ['渡劫'];

const seen = [];
const orig = CV.text;
CV.text = function (s) { seen.push(String(s)); return orig.apply(CV, arguments); };

let pass = 0, fail = 0;
console.log('\n=== 血统串味尺子（讲玩家自己的页面里，不许出现别的血统）===');
ALL.forEach((mine) => {
  Core.newGame();
  Core.setPlayerName('血统体检');
  Core.choosePlayerBloodline(mine);
  Core.S.player.realm = 5;             // 走到中段，下一阶/境界线都会画出来
  const bad = [];
  MY_PAGES.forEach((pg) => {
    if (!CV.panels[pg]) return;
    seen.length = 0;
    try { CV.reset(pg); } catch (e) { return; }
    const txt = seen.join(' | ');
    ALL.filter((b) => b !== mine).forEach((b) => {
      if (txt.indexOf(b) >= 0) bad.push(pg + ' 页出现别的血统名「' + b + '」');
      REALMS[b].forEach((r) => {
        if (GENERIC.indexOf(r) >= 0) return;
        if (txt.indexOf(r) >= 0) bad.push(pg + ' 页出现别的血统境界名「' + r + '」');
      });
    });
  });
  if (bad.length) { fail++; console.log('  ✗ 选「' + mine + '」→ ' + bad.slice(0, 3).join(' / ')); }
  else { pass++; console.log('  ✓ 选「' + mine + '」→ 讲玩家的页面上只出现自己的血统与境界名'); }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
