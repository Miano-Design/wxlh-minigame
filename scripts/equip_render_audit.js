/* 装备详情页渲染体检：node scripts/equip_render_audit.js

   起因（V9.6.84 整体审查）：血统套装的表键从"血统名"改成"世界|血统"之后，
   小游戏的装备详情页还在按血统名查表 —— 查不到就**静默不画套装卡**（不报错、不崩）。
   page_smoke 只保证"页面能画完"，canvas_audit 只看"口径一致"，
   两者都**看不见"少了一张卡"**：那是画法没抛错、只是内容空了。

   这把尺子专门管这件事：造出四种装备（世界套装 / 血统套装 / 血统神装 / 专属），
   一件一件丢进详情页，**把画出来的字抓下来核对**（伪造 canvas 的 fillText）。
   少一张卡、名字取错表、件数算错，这里都会当场红。

   只读。改装备界面跑一下。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const TEXTS = [];
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'fillText') return (txt) => { TEXTS.push(String(txt)); };
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};
const loadErrors = [];
const files = ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)));
files.forEach((f) => {
  const p = path.join(JS, f);
  if (!fs.existsSync(p)) return;
  try { require(p); } catch (e) { loadErrors.push(f + ' → ' + e.message); }
});

const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
if (loadErrors.length) { console.log('**有文件加载失败**：'); loadErrors.forEach(x => console.log('  ' + x)); process.exit(1); }
CV.setup(wx.getWindowInfo());

let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : '')); };

/* 造一个"打到第 20 张图、主角血族"的存档，然后各造一件装备 */
Core.newGame(); Core.setPlayerName('装备体检'); Core.choosePlayerBloodline('绯红');
Core.S.bag.eqCap = 999999;
Core.S.worlds.W20 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
const vamp = D.characters.find((c) => c.bloodline === '绯红').id;
Core.addChar(vamp);
Core.S.party = ['@player', vamp, null, null, null];

function drawEq(uid) {
  TEXTS.length = 0;
  /* V9.6.112：装备详情页现在**第一次进来会挂一条引导**（"点「强化」花材料升一级"），
     而引导是真模态 —— 它会把 `CV.dispatch('eqd:其它件')` 吃掉（那不是它指的那颗）。
     这把尺子量的是**画法**，不是引导，所以先把引导清掉再画。 */
  if (U && U.coachClearAll) U.coachClearAll();
  CV.dispatch('eqd:' + uid);
  CV.reset('eqdetail');
  return TEXTS.join(' | ');
}
function pickItem(pred, rarity, n) {
  for (let i = 0; i < (n || 2000); i++) {
    const e = Core.grantEquip('W20', rarity).equip;
    if (e && pred(e)) return e;
  }
  return null;
}

console.log('=== 装备详情页：四种装备都要把该画的卡画出来 ===');
{
  const world = pickItem(e => !!e.set, 'SSR');
  const blood = pickItem(e => e.bloodSet === '绯红' && e.bloodWorld === 'W20', 'SSR');
  const myth = pickItem(e => !!e.godSet, 'MYTH');
  const sig = Core.grantSignatureEquip(0).equip;

  const tw = drawEq(world.uid);
  t('世界套装：画出了套装名与件数', /套装/.test(tw) && /\d\/6 件/.test(tw), (tw.match(/\S*套装 · \d\/6 件/) || ['(没有)'])[0]);

  /* 关键：血统套装 —— 这一条就是 V9.6.84 抓到的那个"静默不画" */
  const tb = drawEq(blood.uid);
  t('命格套装：套装卡画出来了（不是空白）', /命格套装/.test(tb) && /·/.test(tb));
  t('命格套装：名字取的是**这张图**的那一套', new RegExp(D.BLOODLINE_SETS[D.bloodlineSetKey('W20', '绯红')].name).test(tb),
    (tb.match(/\S*·\S*套装/) || ['(没有)'])[0]);
  t('命格套装：写了"同一张图"的计件规矩', /同一张图/.test(tb));
  t('命格套装：4 件 / 6 件两档都列出来了', /4件:/.test(tb) && /6件:/.test(tb));

  const tm = drawEq(myth.uid);
  t('命格神装：画出了神装套装卡', /命格神装/.test(tm) && /6件:/.test(tm), (tm.match(/命格神装/) || ['(没有)'])[0]);

  const ts = drawEq(sig.uid);
  t('专属装备：写明了限本人', /专属/.test(ts), (ts.match(/专属[^|]*/) || ['(没有)'])[0]);
  t('专属装备：基础值和当前进度同档（不是死数 320）', sig.base.atk > 900, '攻 ' + sig.base.atk);
  /* 2026-09-27（本命 36 件）：详情页要多一行"本命"标（父亲大人：「每人一套本命」），
     而且**六个部位都要画得出来** —— 旧版 6 件全是武器，头/胸甲/手/腿/饰品这条路从没走过。 */
  t('专属装备：写了本命标（本命 ＋ 角色名）', /本命/.test(ts) && ts.indexOf(Core.charName(sig.charId)) >= 0,
    ts.indexOf(Core.charName(sig.charId)) >= 0 ? '本命 · ' + Core.charName(sig.charId) : '(没有本命标)');
  const armorIdx = D.SIGNATURE_EQUIPS.findIndex((s) => s.slot === 'armor');
  const sigArmor = Core.grantSignatureEquip(armorIdx).equip;
  const ta = drawEq(sigArmor.uid);
  t('本命：非武器部位（胸甲）也画得出来', /专属/.test(ta) && /本命/.test(ta) && /胸甲/.test(ta),
    (ta.match(/胸甲/) || ['(没有)'])[0] + ' · ' + sigArmor.name);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
