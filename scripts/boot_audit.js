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
/* V1.1.19（2026-09-27 · 父亲大人："玩着玩着手机就黑屏了"）：防熄屏那次调用要能被数出来 */
const keepCalls = [];
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 }, platform: 'devtools' }),
  getSystemInfoSync: () => ({ platform: 'devtools', SDKVersion: '3.5.0' }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  onWindowResize(fn) { handlers.resize.push(fn); },
  onShow(fn) { handlers.show.push(fn); },
  onHide(fn) { handlers.hide.push(fn); },
  setKeepScreenOn(o) { keepCalls.push(o && o.keepScreenOn); },
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
  await wait(120);                              // 等开机流程落定（这时品牌首屏还盖着）
  t('开机第一页＝主画面（老档：弹窗背后就是它）', CV.top().name === 'gate', '当前页 ' + CV.top().name);
  await wait(1700);                             // 品牌首屏 1.5 秒过去 → 忠告弹窗
  const hOv = G.U && G.U.overlay;
  t('品牌首屏过去后先弹《' + ((G.DATA && G.DATA.COMPLIANCE && G.DATA.COMPLIANCE.healthTitle) || '健康游戏忠告') + '》',
    !!hOv && hOv.title === (G.DATA && G.DATA.COMPLIANCE && G.DATA.COMPLIANCE.healthTitle),
    hOv ? hOv.title : '（没有弹窗）');
  const hFull = (G.DATA && G.DATA.COMPLIANCE && G.DATA.COMPLIANCE.healthFull) || '';
  t('忠告弹窗里＝四句全文（一字不省，不是摘要）',
    !!hOv && String((hOv.lines || []).join('')) === hFull,
    hOv ? ((hOv.lines || []).join('').length + ' 字') : '—');
  t('忠告弹窗是单按钮（没有"取消"那条出路）', !!hOv && hOv.single === true);
  CV.dispatch('_cf_yes');                       // 玩家点「我知道了」
  t('关掉忠告才落到主画面（弹窗不再挡着）',
    CV.top().name === 'gate' && !(G.U && G.U.overlay), '当前页 ' + CV.top().name);
  /* 诊断行：开机那一刻的现场（红的时候一眼看出卡在哪） */
  console.log('   · 现场：页面 ' + CV.top().name
    + ' · coach ' + String(!!(G.U && G.U.coachActive && G.U.coachActive()))
    + ' · overlay ' + String(!!(G.U && G.U.overlay))
    + ' · pending ' + String(!!(G.bootModalPending && G.bootModalPending()))
    + ' · 离线龄 ' + ((Date.now() - Core.S.idle.lastTs) / 60000).toFixed(1) + ' 分'
    + ' · 速率 ' + JSON.stringify(Core.idleRates()));
  if (bootSaves.length) console.log('   · 开机期间谁存了盘（会把离线时钟归零）：' + bootSaves.join(' / '));

  /* V1.0.6（父亲大人 2026-09-23：「健康游戏是独立的弹窗，不要跟主画面做到一起」，时机选 C）：
     冷启动顺序＝**忠告弹窗 → 关掉 → 主画面 → 点【进入残域】→ 灯阁**（上面四条已经把前两步走过了）。
     与此同时，`copyright` 专门页（2.6.1 的著作权人信息）整页删掉了 —— 它不该还能进去。
     主画面的**内容**（有没有忠告 / 忠告在不在弹窗里 / 对比度 / 两端同源）由 page_text_audit 与
     visual_audit 钉，这一节只管它**挡没挡住、点不点得过去**。 */
  t('撤掉的 copyright 专门页真的没了（整页连注册一起删，点开不该进得去）',
    !(CV.panels && CV.panels.copyright), CV.panels && CV.panels.copyright ? 'copyright 页还在注册表里' : '注册表里没有 copyright');
  CV.dispatch('gate_enter');
  t('点【进入残域】才放行到游戏里（主画面不是装饰）', CV.top().name === 'home', '当前页 ' + CV.top().name);

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
  /* V1.1.9（续12 复核修的**尺子口径**，不是产品）：这条原来写死 `single === true`。
     但上一轮 B4（离线翻倍）已经把这个弹窗改成了"**收下** ＋ **看广告 · 收益 ×2**"两颗按钮
     （见 `uiw.js` 的 `paintOffline(2, …)`：能翻倍时刻意**不**设 `opt.cancel = false`），
     于是这条断言从那天起就一直是红的 —— 红的原因不是产品错了，是**尺子没跟上口径**。
     现在按两种合法形态判：没有广告可看时＝单按钮；有广告可看时＝第二颗必须是**带动作**的
     "看广告…"那颗（不是默认的「取消/确定」）。 */
  t('离线弹窗的按钮是「收下 / 看广告 · 收益 ×2」（不是默认的 取消/确定）',
    !!ov1 && ov1.okLabel === '收下'
      && (ov1.single === true || (!!ov1.onCancel && /广告/.test(String(ov1.cancelLabel)))),
    ov1 ? ('single=' + ov1.single + ' · ' + ov1.okLabel + ' / ' + ov1.cancelLabel) : '（没有弹窗）');
  CV.dispatch('_cf_yes');
  await wait(1400);
  const ov2 = G.U && G.U.overlay;
  t('关掉离线收益后，七日登录接上（不是抢在一起）',
    !!ov2 && /七日登录/.test(ov2.title), ov2 ? ov2.title : '（没有弹窗）');
  /* N1（留存环第一格 · 父亲大人「把留存环做了」）：七日登录是全游戏唯一"每天必定被看到"的留存件，
     它必须把 7 格梯度**一次画全**（含第 7 天的 🎫SSR自选券），而不是只画今天那一格。 */
  const lrList = (G.DATA && G.DATA.LOGIN_REWARDS) || [];
  const lrChips = ((ov2 && ov2.rows) || []).reduce((a, r) => a.concat(r.map((c) => c.t)), []);
  t('N1 七日登录把 7 格全列出来（不是只画今天那一格）',
    lrChips.length === lrList.length && /第1天/.test(lrChips[0] || '') && /第7天/.test(lrChips[lrList.length - 1] || ''),
    lrChips.length + ' 格 · ' + JSON.stringify(lrChips).slice(0, 150));
  t('N1 第 7 天的钩子看得见（🎫SSR自选券 就写在那一格上）',
    /SSR自选券/.test(lrChips[lrList.length - 1] || ''), lrChips[lrList.length - 1] || '（没有第 7 格）');
  t('N1 今天那一格带（今天）标记', /（今天）/.test(lrChips.join('|')), lrChips.filter((c) => /今天/.test(c))[0] || '（没有）');
  CV.dispatch('_cf_yes');
  await wait(100);
  t('七日登录当天只发一次', Core.loginReward() === null, '再调一次返回 null');
  /* N1：第 3 天那一屏 —— 前两格该打 ✓、今天那格带（今天）、后面的不许冒充已领 */
  G.U.loginReward({ day: 3, reward: G.DATA.LOGIN_REWARDS[2], round: 1, cycleDays: lrList.length });
  const lr3 = ((G.U.overlay && G.U.overlay.rows) || []).reduce((a, r) => a.concat(r.map((c) => c.t)), []);
  t('N1 第 3 天那一屏：前两格 ✓、今天带（今天）、后面的不冒充已领',
    /^✓第1天/.test(lr3[0] || '') && /^✓第2天/.test(lr3[1] || '') && /（今天）/.test(lr3[2] || '')
      && lr3.slice(3).every((c) => c.indexOf('✓') !== 0 && c.indexOf('今天') < 0),
    JSON.stringify(lr3).slice(0, 200));
  CV.dispatch('_cf_yes');
  await wait(100);
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
  /* V1.0.6：重新开机同样先弹忠告（1.5 秒后）→ 关掉 → 主画面 → 进残域 → 灯阁。
     不进残域就到不了灯阁，也就等不到开机弹窗（弹窗的排队闸是"站在灯阁上"才放行）。 */
  await wait(1700);
  CV.dispatch('_cf_yes');       // 关掉《健康游戏忠告》弹窗
  CV.dispatch('gate_enter');
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
  /* V1.1.19 · 防熄屏（父亲大人 09-27："玩着玩着手机就黑屏了"）：
     ① 开机调过一次 `setKeepScreenOn(true)`；
     ② **每次回前台再补一次** —— 这条 API 只在当前小游戏前台有效，切出去看广告回来就没了；
        （手上这次 onShow 是在上一条断言之前刚派发过的，所以这里数到的次数 ≥2。） */
  t('开机 + 回前台：防熄屏那条 API 被调过（且都是 keepScreenOn: true）',
    keepCalls.length >= 2 && keepCalls.every((v) => v === true),
    'setKeepScreenOn 调用 ' + keepCalls.length + ' 次 · 取值 [' + keepCalls.join(',') + ']');
  /* 老基础库 / 某些环境**根本没有这个函数** —— 那种情况下必须静默跳过，
     绝不能因为"屏幕亮不亮"这种事把开机弄崩（这正是提审驳回过的那个坑的同族）。 */
  {
    const rawKeep = global.wx.setKeepScreenOn;
    delete global.wx.setKeepScreenOn;
    let threw = null, ret = null;
    try { ret = (global.keepScreenOn ? global.keepScreenOn() : 'NO-FN'); } catch (e) { threw = e; }
    t('没有 setKeepScreenOn 的环境：静默跳过、不抛错（不拿开机冒险）',
      !threw && ret === false, threw ? String(threw.message) : ('返回 ' + ret));
    global.wx.setKeepScreenOn = rawKeep;
  }
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

  /* ---------- 场景 5：**首次安装**（没有存档，摆在最后）----------
     V1.0.5 在模拟器里实测揪出的 P0：无存档时 `Core.S` 是 null，而首屏 `CV.splash()` 会先渲染一帧
     "当前页"（默认 `home`）→ sc-home 读 `Core.realmState()` 抛 TypeError → 把 game.js 剩余整段打断，
     `CV.reset(...)` 永远跑不到 → 玩家看到"顶栏 + 一片空白"的死屏。
     每个新玩家都从这一步进来，所以它是**全员必经**的那一步 —— 旧尺子全绿是因为它只跑"有存档"的场景。

     ⚠️ 为什么摆在**最后**：本脚本每跑一次 `require(game.js)` 就多一个活着的实例（它的 setInterval 不会停），
     而每个实例各自有一份 `pendingBoot`；摆在前面时，旧实例的心跳会在下面的场景里抢先放行开机弹窗
     （实测：离线收益那条当场红，报出来的是七日登录先弹）。放最后＝我们只借它的"开机那一帧"。
     另外：`delete store[SAVE_KEY]` 与 `require(...)` 之间**不能有 await** —— 中间一旦让出线程，
     旧实例的自动存盘就可能把存档写回来，测出来的就不是"首次安装"了。 */
  delete store[SAVE_KEY];
  delete require.cache[require.resolve(path.join(ROOT, 'game.js'))];
  let freshErr = null;
  try { require(path.join(ROOT, 'game.js')); } catch (e) { freshErr = e; }
  t('首次安装（没有存档）开机不抛错 —— 抛了就白屏，新玩家一个都进不来',
    !freshErr, freshErr ? freshErr.message : '✓');
  await wait(120);
  t('首次安装第一帧不是空白（弹窗背后就是主画面，等忠告弹窗关掉才转「欢迎（签契约）」）',
    CV.top().name === 'gate', '当前页 ' + CV.top().name);
  /* V1.0.6：冷启动先弹忠告（品牌首屏 1.5 秒之后）——关掉它，新档才落到「欢迎（签契约）」。 */
  await wait(1700);
  CV.dispatch('_cf_yes');
  t('新档：关掉忠告后落在「欢迎（签契约）」那一页',
    CV.top().name === 'welcome', '当前页 ' + CV.top().name);
  if (CV.splashSkip) CV.splashSkip();

  /* ---------- 场景 6：**真机那样——`onShow` 在注册那一刻就回调**（V1.0.6 · P0 提审驳回） ----------
     真机现场（小米11 · HyperOS 2.0.2 · 微信 8.0.76）console 里三条栈全部落在
     `CV.render → realmState → S.player`，而 `S` 是 null：
       · `CV.splash`（开机首屏那一帧）
       · `relayoutNow ← at <api onLifeCycle:Show callback function>`（**onShow**）
       · `relayoutNow ←` 又一次重排
     差异就在这一条：**真机是在 `wx.onShow(...)` 这次调用里"同步"回调**（游戏当时就在前台）。
     ⚠️ 旧注释这里写的是"开发者工具不派这个事件"—— 2026-09-24 实测更正：
     开发者工具**也派**，只是**异步**（探针打点：注册 t=…739 / 回调 t=…762，差 23ms），
     于是它落在开机同步段**之后**，本地就不复现；而真机同步回调，当场打断顶层。
     这个"同步 vs 异步 23ms"才是差异的全部 —— 别再把"本地不复现"当成"平台不派事件"。
     于是 onShow 的处理器（`relayoutNow → CV.render`，没有 try/catch）跑在
     `Core.load()/newGame()` 之前 → TypeError → **game.js 顶层剩下的语句全被打断** → 审核员看到"卡住"。
     V1.0.5 只把 `newGame()` 提到 `CV.splash()` 之前，缝还在（splash 之前还有 setup/注册/重排）。
     这条尺子就是把那个时序钉住：**无存档 ＋ onShow 立刻回调**，开机也不许抛、且必须落到开局页。 */
  delete store[SAVE_KEY];
  delete require.cache[require.resolve(path.join(ROOT, 'game.js'))];
  const rawOnShow = global.wx.onShow;
  let showFiredAtRegister = 0;
  global.wx.onShow = function (cb) {
    rawOnShow(cb);                    // 仍然记进 handlers（其它场景照旧）
    showFiredAtRegister++;
    cb();                             // ← 真机行为：注册那一刻就把 Show 派下来
  };
  let onShowErr = null;
  try { require(path.join(ROOT, 'game.js')); } catch (e) { onShowErr = e; }
  global.wx.onShow = rawOnShow;
  t('场景6 · 真机时序（onShow 注册即回调）：无存档冷启动**不抛错**',
    !onShowErr, onShowErr ? (onShowErr.constructor.name + ': ' + onShowErr.message) : '回调 ' + showFiredAtRegister + ' 次，无异常');
  /* ⚠️ 场景 6 是**同进程版**，它只能证明"顺序不炸"；真正的"无存档"要新实例才成立
     （本脚本的 Core 复用，S 早就不是 null）—— 那条在场景 7（另起进程）。两条都留着。 */
  t('场景6 · ……而且状态真的建起来了（S 不是 null —— 抛错会把建档那几行一起打断）',
    !!(Core && Core.S), Core && Core.S ? 'S.player.level=' + Core.S.player.level : '**S 仍是 null**');
  await wait(120);
  t('场景6 · ……界面也没卡住（落在主画面/开局页，而不是"顶栏 + 空白"）',
    ['gate', 'welcome', 'create', 'bloodline', 'home'].indexOf(CV.top().name) >= 0, '当前页 ' + CV.top().name);
  if (CV.splashSkip) CV.splashSkip();

  /* ---------- 把"真机时序"那把尺子跑一遍（**另起进程**，同进程测不出来） ----------
     为什么必须另起进程：本脚本的 `Core` 只 require 一次，前面场景早把 `Core.S` 建好，
     "真机时序"跑起来也不会 null（那个坑就藏在这条缝里）。
     boot_onshow_audit.js 自带一份干净环境（core 也是新实例、S 真的是 null），
     所以这里 spawn 它、把红绿并进本脚本的总账。 */
  {
    const { execFileSync } = require('child_process');
    let ok = true, out = '';
    try {
      out = execFileSync(process.execPath, [path.join(__dirname, 'boot_onshow_audit.js')], { encoding: 'utf8' });
    } catch (e) {
      ok = false;
      out = String((e && (e.stdout || e.message)) || '');
    }
    const line = (out.match(/(\d+) passed, (\d+) failed/) || [])[0] || '（没拿到汇总行）';
    t('场景7 · 真机时序尺子（另起进程 · onShow 注册即回调 + 无存档）：全绿',
      ok && /0 failed/.test(line), line);
    if (!ok) console.log(out.split('\n').filter((l) => /✗/.test(l)).join('\n'));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
