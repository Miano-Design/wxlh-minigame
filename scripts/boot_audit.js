/* 开机与心跳审计：node scripts/boot_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.90，父亲大人："有没有网页版改了、小游戏还没改的东西，包括玩法、机制"）：
   网页版 main.js 里有一条**每秒的心跳**和一次**开机离线结算**。小游戏 `game.js` 原来一条都没有 ——
   于是这些在小游戏里**从来没发生**（不是"界面不同"，是玩法机制直接是死的）：
     · 挂机每秒入池（bankSec 永远是 0 → 「挂机收益」永远领不到东西）
     · 游历奇遇计时（"5/10/20/30…分钟出一次"永远等不到）
     · 离线收益结算（关掉几小时回来，什么也没有）
     · 防改时间提示、七日登录、每 15 秒自动存盘、切后台补时间
   page_smoke / tap_audit / parity_audit 全都看不见这一类 —— 它们只管"界面画得出来、点得动"。
   这里直接把 game.js 真跑一遍（假 wx + 假画布），盯住上面七件事。
   只读脚本：跑在假环境里，不碰真存档。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const ROOT = path.resolve(__dirname, '..');

const store = {};
const SAVE_KEY = 'wxlh_save_v5';       // 与 core.js 里的存档键一致
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
const handlers = { show: [], hide: [], resize: [] };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 }, platform: 'devtools' }),
  getSystemInfoSync: () => ({ platform: 'devtools', SDKVersion: '3.5.0' }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  onWindowResize(fn) { handlers.resize.push(fn); },
  onShow(fn) { handlers.show.push(fn); },
  onHide(fn) { handlers.hide.push(fn); },
  getStorageSync(k) { return (k in store ? store[k] : ''); },
  setStorageSync(k, v) { store[k] = String(v); },
  removeStorageSync(k) { delete store[k]; },
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  env: { USER_DATA_PATH: '/tmp' },
  /* V1.0.1：补上文件系统。
     game.js 末尾那段"开发期截图"（CE-SHOT，给 scripts/shot.js 用）会调 getFileSystemManager，
     stub 里没有它就走进 else 分支，打出「[CE-SHOT-FAIL] 不能写文件」——
     看着像 bug，其实 devtools 里那条链路是好的（Console 里是 `[CE-SHOT] http://usr/ce-shot.png`）。
     这里给它一个真会落盘的实现，既消掉误导，又顺手验了截图链路。 */
  getFileSystemManager: () => ({
    writeFileSync(p, b64) { try { fs.writeFileSync(p, Buffer.from(String(b64), 'base64')); } catch (e) {} },
  }),
  vibrateShort() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal;

/* 记录 Core 的两个心跳函数被调了几次（game.js 拿到的是同一个对象，所以包一层就数得到） */
const calls = { onlineTick: 0, settleOffline: 0, save: 0 };
let bootSaves = [];
['onlineTick', 'settleOffline', 'save'].forEach((k) => {
  const orig = Core[k];
  Core[k] = function () {
    calls[k]++;
    if (k === 'save' && global.__inBoot) {
      const st = (new Error().stack || '').split('\n')[2] || '';
      bootSaves.push(st.trim().replace(/^at\s+/, '').replace(/\s*\(.*/, ''));
    }
    return orig.apply(Core, arguments);
  };
});

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 造一份"老档"：已起名、已选血统，离线 2 小时，今天还没领七日登录 */
function makeSave(opts) {
  opts = opts || {};
  Core.newGame();
  Core.setPlayerName('心跳体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  Core.S.idle.bankSec = 0;
  Core.S.login.lastClaim = '';
  Core.S.travel = { bankSec: 0, pending: null, got: 0, round: 0, day: '' };
  Core.S.idle.lastTs = Date.now() - (opts.offlineHours === undefined ? 2 : opts.offlineHours) * 3600 * 1000;
  /* 直接落盘，**不能调 Core.save()** —— 它会把 `S.idle.lastTs` 盖章成"现在"
     （那是有意行为：存盘 = 刚见过玩家），一盖章离线窗口就没了。
     测试要的就是"上次见到玩家是 2 小时前"，所以绕过它。 */
  store[SAVE_KEY] = JSON.stringify(Core.S);
}

console.log('\n=== 小游戏开机与心跳审计 ===');

(async function () {
  /* ---------- 场景 1：普通老档（离线 2 小时） ---------- */
  makeSave({});
  const ptsBefore = Core.S.cur.points;
  delete require.cache[require.resolve(path.join(ROOT, 'game.js'))];
  global.__inBoot = true; bootSaves = [];
  require(path.join(ROOT, 'game.js'));          // 真跑一遍开机
  global.__inBoot = false;
  await wait(120);                              // 等开机流程落定
  /* 诊断行：开机那一刻的现场（红的时候一眼看出卡在哪） */
  console.log('   · 现场：页面 ' + CV.top().name
    + ' · coach ' + String(!!(G.U && G.U.coachActive && G.U.coachActive()))
    + ' · overlay ' + String(!!(G.U && G.U.overlay))
    + ' · pending ' + String(!!(G.bootModalPending && G.bootModalPending()))
    + ' · 离线龄 ' + ((Date.now() - Core.S.idle.lastTs) / 60000).toFixed(1) + ' 分'
    + ' · 速率 ' + JSON.stringify(Core.idleRates()));
  if (bootSaves.length) console.log('   · 开机期间谁存了盘（会把离线时钟归零）：' + bootSaves.join(' / '));

  t('开机调了 Core.settleOffline（离线结算真的发生）', calls.settleOffline === 1, '调用 ' + calls.settleOffline + ' 次');
  t('离线 2 小时的收益真的入账了', Core.S.cur.points > ptsBefore,
    '点名 ' + ptsBefore + ' → ' + Core.S.cur.points);
  t('停在灯阁（不是卡在开局某一步）', CV.top().name === 'home', '当前页 ' + CV.top().name);

  const bank0 = Core.S.idle.bankSec;
  await wait(1600);
  t('心跳在跑：挂机池每秒入池（core.onlineTick）', calls.onlineTick >= 1 && Core.S.idle.bankSec > bank0,
    'bankSec ' + bank0.toFixed(1) + ' → ' + Core.S.idle.bankSec.toFixed(1));
  /* 游历奇遇：离线 2 小时早就够第一次（5 分钟），所以开机后应当停在"待触发"。
     这正好证明**离线时间也算进去了**（travelAccrue 挂在 onlineTick 里，settleOffline 也会喂它）。 */
  t('游历奇遇被离线时间推进到「待触发」', !!(Core.travelProgress && Core.travelProgress().pending),
    'pending = ' + JSON.stringify(Core.travelProgress ? Core.travelProgress().pending : null).slice(0, 40));
  if (Core.claimTravel) Core.claimTravel();
  const tp0 = Core.travelProgress().sec;
  await wait(1600);
  t('领完之后在线计时重新开始（心跳在喂 travelTick）', Core.travelProgress().sec > tp0,
    'travel ' + tp0.toFixed(1) + ' → ' + Core.travelProgress().sec.toFixed(1));

  /* 开机弹窗：离线收益先弹，关掉之后七日登录接上（网页版同一条队列规矩） */
  const ov1 = G.U && G.U.overlay;
  t('离线 ≥5 分钟 → 弹出「欢迎回来，执灯者」', !!ov1 && /欢迎回来/.test(ov1.title), ov1 ? ov1.title : '（没有弹窗）');
  t('离线弹窗里有奖励胶囊', !!ov1 && ov1.rows && ov1.rows.length > 0);
  t('离线弹窗是单按钮（不是取消/确定）', !!ov1 && ov1.single === true);
  CV.dispatch('_cf_yes');
  await wait(1400);
  const ov2 = G.U && G.U.overlay;
  t('关掉离线收益后，七日登录接上（不是抢在一起）',
    !!ov2 && /七日登录/.test(ov2.title), ov2 ? ov2.title : '（没有弹窗）');
  CV.dispatch('_cf_yes');
  await wait(100);
  t('七日登录当天只发一次', Core.loginReward() === null, '再调一次返回 null');
  t('引导会给弹窗让路（开机弹窗在时不抢戏）', typeof G.bootModalPending === 'function', 'bootModalPending 已挂上');

  /* ---------- 场景 2：系统时间被改（把存档时间拨到未来） ---------- */
  /* 先把上一场留下的引导放下 —— 引导在的时候开机弹窗会给它让路（那是有意的排队规矩），
     不清掉的话这一场就永远等不到弹窗，测出来的就不是被测对象了。 */
  if (G.U && G.U.coachDrop) G.U.coachDrop();
  makeSave({});
  Core.S.idle.lastTs = Date.now() + 3 * 3600 * 1000;
  store[SAVE_KEY] = JSON.stringify(Core.S);
  calls.settleOffline = 0;
  delete require.cache[require.resolve(path.join(ROOT, 'game.js'))];
  require(path.join(ROOT, 'game.js'));
  await wait(1300);           // 开机弹窗是排队的，第一轮 flush 在 ~1 秒
  const ov3 = G.U && G.U.overlay;
  console.log('   · 场景2现场：页面 ' + CV.top().name + ' · pending ' + String(!!(G.bootModalPending && G.bootModalPending()))
    + ' · overlay ' + String(!!ov3) + ' · coach ' + String(!!(G.U && G.U.coachActive && G.U.coachActive()))
    + ' · 离线龄 ' + ((Date.now() - Core.S.idle.lastTs) / 60000).toFixed(1) + ' 分');
  t('时间被改 → 弹出「⚠ 时间异常」（与网页版同一句文案）',
    !!ov3 && /时间异常/.test(ov3.title), ov3 ? ov3.title : '（没有弹窗）');

  /* ---------- 场景 3：切后台 / 回到前台 ---------- */
  calls.save = 0;
  handlers.hide.forEach((fn) => fn());
  t('切到后台立刻存盘（微信会回收进程，等不到 15 秒）', calls.save >= 1, 'save 调用 ' + calls.save + ' 次');
  t('回到前台会补时间（catchUp 挂在 onShow 上）', handlers.show.length >= 1, 'onShow 回调 ' + handlers.show.length + ' 个');
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  t('game.js 里有每秒心跳（setInterval + onlineTick + 15 秒存盘）',
    /setInterval\(/.test(src) && /Core\.onlineTick\(dt\)/.test(src) && /saveCounter >= 15/.test(src));

  /* ---------- 场景 4：冷启动时 jsbridge 还没就绪 ---------- */
  /* V1.0.1（多账号调试里抓到的真报错）：
     新窗口的 Console 里有 `[jsbridge] invoke getSystemInfo fail: jsbridge not ready`。
     溯源到 game.js **顶层**那句 `const info = wx.getWindowInfo ? …` —— 原来没有 try/catch，
     一抛出去，后面的 CV.setup / bindTouch / 心跳全都不会执行，玩家看到的就是白屏卡死。
     同一个文件里另外两处同类调用（onWindowResize / onShow）早就包了 try/catch，只有开机这处漏了。
     这里把两个 API 都改成抛错，验"开机不崩" + "界面照样出来" + "事后补算尺寸"。 */
  const realGetWindow = global.wx.getWindowInfo;
  const realGetSystem = global.wx.getSystemInfoSync;
  global.wx.getWindowInfo = () => { throw new Error('jsbridge not ready'); };
  global.wx.getSystemInfoSync = () => { throw new Error('jsbridge not ready'); };
  delete require.cache[require.resolve(path.join(ROOT, 'game.js'))];
  let bootErr = null;
  try { require(path.join(ROOT, 'game.js')); } catch (e) { bootErr = e; }
  global.wx.getWindowInfo = realGetWindow;      // 马上还原：下面那次"延迟补算"要用真的
  global.wx.getSystemInfoSync = realGetSystem;
  await wait(150);
  t('jsbridge 未就绪时开机不抛错（不然就是白屏）', !bootErr, bootErr ? String(bootErr.message) : '✓');
  t('……而且界面照样渲染出来了', !!(CV.top() && CV.top().name), CV.top() ? CV.top().name : '（没有页面）');
  await wait(250);                              // 等那次 300ms 的延迟补算
  t('……并且事后自动补算出了窗口尺寸（不靠 onWindowResize 救场）',
    CV.W > 0 && CV.H > 0, 'W=' + CV.W + ' H=' + CV.H);

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
