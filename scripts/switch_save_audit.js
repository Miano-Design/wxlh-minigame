/* 换档审计：node scripts/switch_save_audit.js
   ------------------------------------------------------------------------------
   起因（V9.6.101 自审）：上一轮抓到"删档重开没清内存，第二局血统被上一局锁死"。
   那把根因抽出来就是一条线：**换档之后（删档 / 导入存档 / 读存档槽），
   内存里的零散状态、以及各个界面模块里缓存的变量，是不是还指着上一局。**
   这类问题平时看不出来 —— 它不会抛错，只会**把上一局的数据画到这一局**，
   或者画出 "undefined" / "NaN" / "[object Object]" 这种烂字。

   做法：造几种"换档"场景（富档 → 删档、富档 → 导入空档、空档 → 读富档…），
   每换一次就把**全部 51 页**都画一遍，把画布上写过的每一个字录下来，
   搜烂字；同时看每页有没有抛错。只读脚本。 */
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

/* 把每个页面画一遍，录下所有画上去的文字 */
const seen = [];
const origText = CV.text;
CV.text = function (s) { seen.push(String(s)); return origText.apply(CV, arguments); };

const PAGES = Object.keys(CV.panels);
const JUNK = /undefined|NaN|\[object |%s|Infinity/;

let pass = 0, fail = 0;
const bad = [];
function sweep(label) {
  PAGES.forEach((pg) => {
    seen.length = 0;
    let err = null;
    try { CV.reset(pg); } catch (e) { err = e.message; }
    if (err) { bad.push(label + ' · ' + pg + ' 页渲染抛错：' + err); return; }
    const junk = seen.filter((s) => JUNK.test(s));
    if (junk.length) bad.push(label + ' · ' + pg + ' 页画出烂字：' + junk.slice(0, 2).join(' / '));
  });
}
/* 残留检查：换档之后，"讲玩家自己"的那几页上**不许再出现上一局的名字**
   （伙伴列表/图鉴这类会显示别人的名字，不算残留，所以只查这几页）。 */
const IDENT_PAGES = ['home', 'protag', 'realm', 'party'];
function sweepIdentity(label, oldName) {
  IDENT_PAGES.forEach((pg) => {
    if (!CV.panels[pg]) return;
    seen.length = 0;
    try { CV.reset(pg); } catch (e) { return; }
    if (seen.join(' | ').indexOf(oldName) >= 0) {
      bad.push(label + ' · ' + pg + ' 页还写着上一局的名字「' + oldName + '」');
    }
  });
}

/* ---------- 造档 ---------- */
function richSave() {
  Core.newGame();
  Core.setPlayerName('富档');
  Core.choosePlayerBloodline('科技');
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  const ids = (D.characters || []).slice(0, 6).map((c) => c.id);
  ids.forEach((id) => { try { Core.addChar(id); Core.S.chars[id].lv = 30; } catch (e) {} });
  Core.S.party = ['@player'].concat(ids.slice(0, 4));
  while (Core.S.party.length < 5) Core.S.party.push(null);
  Core.S.player.level = 40; Core.S.player.attrPoints = 30; Core.S.player.skillPoints = 12;
  ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'skillChip', 'corridor'].forEach((k) => Core.addCur(k, 88888));
  ['ticket_normal', 'ticket_adv'].forEach((k) => Core.addItem(k, 20));
  if (D.GARDEN) D.GARDEN.forEach((g) => Core.addItem(g.seedItem || g.id, 5));
  try { Object.keys(Core.S.worlds).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  }); } catch (e) {}
  Core.S.idle.lines = { cultivate: ids[0], gather: ids[1], explore: ids[2], guard: ids[3] };
  return Core.exportSave();
}
function leanSave() {
  Core.newGame();
  Core.setPlayerName('空档');
  Core.choosePlayerBloodline('修真');
  return Core.exportSave();
}

console.log('\n=== 换档审计（删档 / 导入 / 读档槽 之后，全页面上不许有上一局的残留与烂字）===');
try {
  /* ① 富档 → 删档 → 全新档（父亲大人报的那条路） */
  richSave();
  Core.wipeSave(); Core.newGame();
  sweep('删档后');
  sweepIdentity('删档后', '富档');
  /* ② 富档 → 导入空档（导入的是**另一份**存档） */
  const lean = leanSave();
  richSave();
  Core.importSave(lean);
  sweep('导入空档后');
  sweepIdentity('导入空档后', '富档');
  /* ③ 空档 → 读一个富档存档槽 */
  leanSave();
  const rich = richSave();
  Core.saveSlot(1);
  leanSave();
  Core.loadSlot(1);
  sweep('读存档槽后');
  sweepIdentity('读存档槽后', '空档');
} catch (e) {
  bad.push('换档流程本身抛错：' + e.message);
}

if (!bad.length) {
  pass++;
  console.log('  ✓ ' + PAGES.length + ' 页 × 3 种换档：没有残留、没有烂字、没有抛错');
} else {
  fail++;
  bad.slice(0, 12).forEach((x) => console.log('  ✗ ' + x));
  if (bad.length > 12) console.log('  …（还有 ' + (bad.length - 12) + ' 条）');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
