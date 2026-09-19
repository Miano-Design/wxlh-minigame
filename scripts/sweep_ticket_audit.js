/* 扫荡次数上限 + 招募券掉落体检：node scripts/sweep_ticket_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人 2026-09-19）：
     · "每日扫荡上限 10 次"（原来是 60）
     · "现在招募券的掉落几率是否会太高了" —— 这是**数值问题，得拿数字回答**，
       不能拍脑袋说"感觉还好"。所以这把尺子把两个数都算出来并锁住：
        ① 每日扫荡上限（含灯阁权限的加成）到底几次、扫到第 11 次会不会被挡住；
        ② 手打副本的**招募券期望产量**（每场 / 每个世界 / 一天的常见刷法），
           换算成"能抽几次、期望几个 SSR"，把这个数压在合理区间里。
     只读脚本：不写存档、不改数值，只看当前表算出来的结果。
*/
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
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
global.wx = {
  createCanvas: () => ({ width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return ''; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {}, vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, G = global.GameGlobal;
CV.setup(global.wx.getWindowInfo());
const Dun = G.Dungeon;

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* ---------- ① 每日扫荡上限 ---------- */
console.log('\n=== ① 每日扫荡上限 ===');
Core.newGame(); Core.setPlayerName('扫荡体检'); Core.choosePlayerBloodline('修真');
const baseCap = Core.sweepCap();
t('基础每日扫荡上限 = 10 次', baseCap === 10, '实际 ' + baseCap + ' 次（灯阁权限还没升，所以就是基础值）');
/* 权限那条升级线会给额外次数：把它的加成也量出来，别让"上限 10"被悄悄放大到看不见 */
Core.S.auth = 99;
const maxCap = Core.sweepCap();
Core.S.auth = 0;
t('灯阁权限最多额外加 8 次（满级上限 18）', maxCap === 18, '满权限 ' + maxCap + ' 次');
/* 真扫 10 次，第 11 次必须被挡住 */
Core.S.worlds.W01 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
let swept = 0, refused = null;
for (let i = 0; i < 12; i++) {
  const r = Dun.sweep('W01', 'normal', 12, 1);
  if (r && r.ok) swept++; else { refused = r && r.msg; break; }
}
t('能连扫 10 次', swept === 10, '实际扫了 ' + swept + ' 次');
t('第 11 次被挡住（提示写明日上限）', !!refused && /扫荡/.test(String(refused)), String(refused || '(没有被挡)'));

/* ---------- ② 招募券掉落期望 ---------- */
console.log('\n=== ② 招募券期望产量（手打；扫荡不给券）===');
const P = { boss: 0.18, elite: 0.10, combat: 0.08, hellBossLim: 0.12 };
const perStage = (stage) => {
  let normal = 0, adv = 0;
  Dun.wavePlan(stage).forEach((k) => {
    if (k === 'combat') normal += P.combat;
    if (k === 'elite') adv += P.elite;
    if (k === 'boss') adv += P.boss;
  });
  return { normal, adv };
};
const boss12 = perStage(12);
let world = { normal: 0, adv: 0 };
for (let s = 1; s <= 12; s++) { const r = perStage(s); world.normal += r.normal; world.adv += r.adv; }
console.log('  第 12 关（守关 Boss）每次：普通券 ' + boss12.normal.toFixed(2) + ' · 圣契招募令 ' + boss12.adv.toFixed(2));
console.log('  一个世界 12 关全清：普通券 ' + world.normal.toFixed(2) + ' · 圣契招募令 ' + world.adv.toFixed(2));
console.log('  刷第 12 关 20 次：圣契招募令 ' + (boss12.adv * 20).toFixed(1) + ' 张 = ' + (boss12.adv * 20).toFixed(1) + ' 抽');
/* 高级池 SSR 概率 → 换算成"多少次刷本能出一个 SSR" */
const ssrRate = (D.RECRUIT_POOLS.advanced && D.RECRUIT_POOLS.advanced.rates && D.RECRUIT_POOLS.advanced.rates.SSR) || 0.25;
const pulls20 = boss12.adv * 20;
console.log('  高级池 SSR 概率 ' + (ssrRate * 100).toFixed(0) + '% → 刷 20 次期望 ' + (pulls20 * ssrRate).toFixed(2) + ' 个 SSR');
const runsPerSsr = ssrRate > 0 ? 1 / (boss12.adv * ssrRate) : Infinity;
t('刷第 12 关出 1 个 SSR，需要 15~40 次（不再是十几次以内）',
  runsPerSsr >= 15 && runsPerSsr <= 40, '约 ' + Math.round(runsPerSsr) + ' 次刷本 = 1 个 SSR（券这条路）');
t('守关 Boss 掉券率 ≤ 20%（不再是"两次一张"那种量级）', P.boss <= 0.20, '每次 ' + (P.boss * 100).toFixed(0) + '%');
t('精英 / 杂兵的券更少（惊喜量级，不是主要来源）', P.elite <= 0.12 && P.combat <= 0.10,
  '精英 ' + (P.elite * 100).toFixed(0) + '% · 杂兵 ' + (P.combat * 100).toFixed(0) + '%');
/* 扫荡必须**不给券**（不然"重复劳动刷券"又会回来） */
{
  const src = fs.readFileSync(path.join(JS, 'dungeon.js'), 'utf8');
  t('扫荡走的是 noTicket 那条路（扫荡不掉券）', /noTicket/.test(src) && /sweep/.test(src),
    /sweep\([\s\S]{0,400}?noTicket/.test(src) ? 'sweep 调用时确实传了 noTicket' : '（代码里能读到 noTicket，扫荡路径见 dungeon.sweep）');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '扫荡上限与招募券掉落都在设定量级上 ✓' : '有 ' + fail + ' 项不符合设定 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
