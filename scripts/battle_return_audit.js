/* 战斗"从哪来就回哪去"体检：node scripts/battle_return_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人 2026-09-21）："斗法台战斗完点击收下奖励并返回，他会返回到残域那边去，
   跳转错误啊，你在整体检查一下有没有类似的跳转错误，或者无效按键。"

   真因：结算面板底部那颗「收下奖励并返回」固定用 `battle_close`，
   而它的兜底写死成 `CV.reset('dungeon')` —— 副本传了 onClose 所以看不出来，
   斗法台 / 深井没传，于是打完一律被送到残域。

   这把尺子按**入口**逐个走一遍真流程：从那一页开打 → 打完（假引擎一帧就赢）→
   点结算页上的每一颗按钮 → 断言"回到的是它自己那一页"，并且**每颗按钮都得有反应**。
   只读脚本，跑在假环境里，不碰真存档。 */
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
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {}, vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal, D = global.DATA, U = G.U;
CV.setup(global.wx.getWindowInfo());
/* 战斗引擎换成一帧就赢：这里考的是"打完回哪儿"，不是数值 */
G.Battle.run = function () {
  return { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = () => ((CV.top() || {}).name || '?');
let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

function fresh() {
  Core.newGame(); Core.setPlayerName('回归体检'); Core.choosePlayerBloodline('修真');
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  ['C021', 'C022'].forEach((id) => { Core.addChar(id); Core.S.chars[id].lv = 20; });
  Core.S.party = ['@player', 'C021', 'C022', null, null];
  Core.S.worlds.W01 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  Core.S.worlds.W02 = { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  Core.S.coachSeen = {};
  ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].forEach((k) => { Core.S.coachSeen[k] = true; });
  U.coachClearAll();
  /* 引导是"真模态"，会把别的点击吃掉；这里只量跳转，所以把它摘掉 */
  G.coachFor = function () {};
}
async function waitPanel(maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (maxMs || 8000)) {
    if (G.BattleUI.state.panel) return G.BattleUI.state.panel;
    await wait(100);
  }
  return G.BattleUI.state.panel;
}

console.log('\n=== 战斗"从哪来就回哪去" ===');
(async () => {
  /* ① 副本：进世界页开打 → 打完 → 收下奖励并返回 → 应该回世界页（不是残域列表） */
  {
    fresh();
    CV.reset('dungeon'); CV.dispatch('w:W01'); CV.dispatch('stage:0');
    const panel = await waitPanel();
    const acts = (panel && panel.acts) || [];
    t('① 副本打完有结算面板', !!panel, acts.map((a) => a.label).join(' / ') || '(没有)');
    CV.dispatch('battle_close');                     // 面板底部那颗「收下奖励并返回」
    await wait(80);
    t('① 副本「收下奖励并返回」→ 回到世界页', page() === 'world', '落在了 ' + page());
  }

  /* ② 斗法台：这是父亲大人报的那一处 */
  {
    fresh();
    CV.reset('arena'); CV.dispatch('arena_fight');
    const panel = await waitPanel();
    t('② 斗法台打完有结算面板', !!panel, (panel && (panel.acts || []).map((a) => a.label).join(' / ')) || '(没有)');
    CV.dispatch('battle_close');
    await wait(80);
    t('② 斗法台「收下奖励并返回」→ 回斗法台', page() === 'arena', '落在了 ' + page());
    /* 面板上那颗「返回斗法台」也得真的管用（不是无效按键） */
    CV.dispatch('arena_fight');
    await waitPanel();
    CV.dispatch('arena_back');
    await wait(80);
    t('② 结算面板上的「返回斗法台」也有反应', page() === 'arena', '落在了 ' + page());
  }

  /* ③ 深井 */
  {
    fresh();
    CV.reset('corridor'); CV.dispatch('corridor_fight');
    const panel = await waitPanel();
    t('③ 深井打完有结算面板', !!panel, (panel && (panel.acts || []).map((a) => a.label).join(' / ')) || '(没有)');
    CV.dispatch('battle_close');
    await wait(80);
    t('③ 深井「收下奖励并返回」→ 回深井', page() === 'corridor', '落在了 ' + page());
  }

  /* ④ 兜底本身：就算某个入口什么回调都没给，也不许跳到别的页面去 */
  {
    fresh();
    CV.reset('home'); CV.push('bag');               // 从"背包"这种跟战斗无关的页面开一场
    const before = page();
    G.BattleUI.run({
      title: '兜底体检', allies: G.BattleUI.buildAllies(null, null), enemies: D.characters.slice(0, 2).map((c) => ({ uid: c.id, name: c.name, hp: 100, maxHp: 100, atk: 1, def: 0, spd: 1, side: 'enemy' })),
      worldId: 'W01', maxRounds: 5,
      onEnd() { return { rewards: [], acts: [] }; },   // 故意**不给** onClose / onQuit
    });
    await waitPanel();
    CV.dispatch('battle_close');
    await wait(80);
    t('④ 没给回调时，战斗页自己还原"从哪来"（' + before + '）', page() === before, '落在了 ' + page());
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  console.log('结论：' + (fail === 0 ? '每个战斗入口都回得去，结算按钮也都有反应 ✓' : '有 ' + fail + ' 处跳转错/无效按键 ✗') + '\n');
  process.exitCode = fail ? 1 : 0;
})();
