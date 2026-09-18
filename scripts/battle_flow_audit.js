/* 战斗页"生命周期"审计：node scripts/battle_flow_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.90）：小游戏的战斗页是**逐帧播 + 一串定时器**的状态机，
   它的正确性不在逻辑层（Battle.run 由 test_game 管），而在**页面的进场/交接/离场**：
     · 进场：`BattleUI.run()` 要防重入（连点两下只开一场 —— 父亲大人报过"斗法台连点跳层"）
     · 交接：副本第 5 关起是**多波**（2~3 波），一波打完要**无缝**接下一波 ——
             这一步必须先放开防重入闸门，否则第 2 波直接被自己挡掉，玩家"按啥都没用只能撤离"
     · 离场：结算页点返回 / 撤离，闸门要放开，页面栈要回到上层
   这三件事 page_smoke（只渲染）和 tap_audit（只看崩不崩）都看不见，只有真跑一遍状态机才查得出。
   只读脚本：战斗引擎被换成"一帧就结束"的假结果，不碰真存档、不打真战斗。
*/
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
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
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
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onWindowResize() {}, onShow() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal;
CV.setup(global.wx.getWindowInfo());
const UI = G.BattleUI;

/* 战斗引擎换成"一帧就打完"的假结果 —— 这里考的是页面状态机，不是数值 */
G.Battle.run = function () {
  return { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] };
};

let pass = 0, fail = 0;
/* 定时器记账（V9.6.98）：离开战斗页之后**不该还有战斗的定时器在跑** ——
   以前那个 55ms 的打击特效 interval 在"撤离"那条路上没清，会继续重画最多 0.9 秒。 */
const liveTimers = new Set();
const _setTimeout = global.setTimeout, _setInterval = global.setInterval;
const _clearTimeout = global.clearTimeout, _clearInterval = global.clearInterval;
global.setTimeout = function (fn, ms) { const h = _setTimeout(function () { liveTimers.delete(h); return fn.apply(this, arguments); }, ms); liveTimers.add(h); return h; };
global.setInterval = function (fn, ms) { const h = _setInterval(fn, ms); liveTimers.add(h); return h; };
global.clearTimeout = function (h) { liveTimers.delete(h); return _clearTimeout(h); };
global.clearInterval = function (h) { liveTimers.delete(h); return _clearInterval(h); };

const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

Core.newGame();
Core.setPlayerName('战斗体检');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}

const cfg = (extra) => Object.assign({
  title: '体检', allies: [], enemies: [], worldId: 'W01', maxRounds: 10,
  onEnd() { return { actions: [{ label: '返回', id: 'battle_close', style: 'ghost' }] }; },
}, extra || {});

console.log('\n=== 战斗页生命周期审计 ===');

(async function () {
  /* ① 防重入：连点两下只开一场 */
  UI.clear();
  const first = UI.run(cfg());
  const second = UI.run(cfg());
  t('连点两下只开一场（防重入闸门在）', first === undefined || first !== false, '第一下没被挡');
  t('第二下被挡（没有同时开两场）', second === false, '第二下返回 false');
  await wait(700);

  /* ② 无缝波次：第 5 关起是多波，交接时闸门必须先放开，否则第 2 波打不开 */
  UI.clear();
  let afterCalled = 0, busyAtHandoff = null, secondWaveOpened = null;
  UI.run(cfg({
    onEnd() {
      return {
        seamless: true, sub: '本波通过',
        after() {
          afterCalled++;
          busyAtHandoff = UI.busy();
          secondWaveOpened = UI.run(cfg());   // 下一波：这里必须打得开
        },
      };
    },
  }));
  await wait(1600);
  t('第一波打完会自动接下一波（after 被调用）', afterCalled === 1, 'after 调用 ' + afterCalled + ' 次');
  t('交接那一刻防重入闸门已放开（不然第 2 波被自己挡掉）', busyAtHandoff === false,
    '此时 busy() = ' + String(busyAtHandoff));
  t('第 2 波真的开得起来（不是卡在第 1 波）', secondWaveOpened !== false,
    '第 2 波 run() 返回 ' + String(secondWaveOpened));
  await wait(700);

  /* ③ 离场：结算页返回之后闸门要放开、页面栈要回到上层 */
  UI.clear();
  UI.run(cfg());
  await wait(700);
  CV.reset('dungeon');
  CV.dispatch('battle_close');
  t('结算页点返回后闸门放开（还能再打下一场）', UI.busy() === false, 'busy() = ' + String(UI.busy()));
  t('返回后停在副本页（不是战斗页）', CV.top().name === 'dungeon', '当前页 ' + CV.top().name);

  /* ④ 撤离同样要放开闸门 */
  UI.clear();
  UI.run(cfg());
  await wait(700);
  CV.dispatch('battle_quit');       // 打开确认弹窗
  if (G.U && G.U.overlay && G.U.overlay.onOk) G.U.overlay.onOk();
  t('撤离后闸门放开', UI.busy() === false, 'busy() = ' + String(UI.busy()));
  await wait(60);
  t('撤离后没有战斗定时器还在跑（不白耗电、不偷偷重画）', liveTimers.size === 0,
    liveTimers.size ? liveTimers.size + ' 个定时器还活着' : '全清');
  /* 源码级兜底：打击特效那个 55ms 的 interval（fxT）必须也在"离场清理"里被清掉。
     运行期这条不好造（假战斗只有一帧，特效早就自己停了）——所以补一条源码断言，
     免得以后有人把 clearTimer 里那行删回去。 */
  {
    const src = fs.readFileSync(path.join(JS, 'sc-battle.js'), 'utf8');
    const clearFn = (src.match(/function clearTimer\(\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
    t('离场清理 clearTimer 里包含打击特效定时器 fxT', /clearInterval\(fxT\)/.test(clearFn),
      clearFn ? '已包含' : '**没找到 clearTimer**');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;
})();
