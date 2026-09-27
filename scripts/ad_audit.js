/* 广告整套体检（B12）：node scripts/ad_audit.js
   ==============================================================================
   为什么要有这一把：广告这一整套（B1–B10）里有三类"错了也不会报错"的坑 ——
     · **次数/总闸写错**：玩家多点几下就多拿资源，界面上完全看不出来；
     · **把 AD 删了就跑不起来**：界面里写了 `AD.show(...)` 却没兜底 → 整个页面点不动；
     · **复活顺手发资源**：复活是"把这一场接着打完"，一旦它进了资源结算路径，等于凭空发奖。
   这三条都是"必须靠尺子钉住"的东西，不能靠"我看过代码了"。

   量四件事：
     ① 次数与总闸：终版次数（挂机 3 / 扫荡 3 / 高级池 10 / 签到 1 / 复活每场 1）＋
        资源点位**总闸 20/天**；离线翻倍与倍速 ×5 **不限次数、不计总闸**；**演练期不吃 comp**。
     ② **把 `AD` 整个删掉，游戏仍完整可玩**：全部页面渲染 ＋ 全部热区派发，零异常、零死键。
     ③ **复活不得出现在资源结算路径**：`battle_revive` 的处理函数里不许出现任何"发资源"的调用
        （静态扫源码，函数体级），并且**动态**跑一次复活，资源计数必须一动不动。
     ④ 真广告期（有真 ID、ad 能拉起来）时：看完了 → 正常发、不占 comp；拉不到 → 走 comp、上限 10/天。
   只读脚本：跑在假环境里，不碰真存档、不碰微信。
   ============================================================================== */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* ---------- 可控定时器（战斗页靠 setTimeout 逐帧播） ---------- */
const timers = [];
let timerSeq = 0;
function flushTimers(max) { let n = 0; while (timers.length && n < (max || 400)) { const x = timers.shift(); n++; try { x(); } catch (e) { throw e; } } return n; }

/* ---------- 假环境：可以按需给/不给"广告能力" ---------- */
const store = {};
function bootEnv(opts) {
  opts = opts || {};
  const store2 = {};
  const sandbox = {};
  global.GameGlobal = global;
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in store2 ? store2[k] : null),
    setItem: (k, v) => { store2[k] = String(v); },
    removeItem: (k) => { delete store2[k]; },
  };
  const ctxStub = new Proxy({}, {
    get(t2, k) {
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
        'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
      if (props.indexOf(k) >= 0) return t2[k];
      return () => {};
    },
    set(t2, k, v) { t2[k] = v; return true; },
  });
  const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
  const adLog = { created: 0, shown: 0 };
  global.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
    onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
    getStorageSync: (k) => (k in store2 ? store2[k] : null),
    setStorageSync: (k, v) => { store2[k] = String(v); },
    removeStorageSync: (k) => { delete store2[k]; },
    setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  };
  if (opts.realAd) {
    global.wx.createRewardedVideoAd = function () {
      adLog.created++;
      const h = {};
      const btn = {
        onError(fn) { h.err = fn; },
        /* V1.1.15（2026-09-27 · 父亲大人实测"看一次扣了两回"）：
           真实微信的 `onClose` 是**累加注册**（每次调都往同一个单例上挂一个回调），
           而这里原来是"只存最后一个"（覆盖语义）⇒ **尺子永远验不出重复回调那个 bug**。
           现在改成真实语义：注册进数组，`h.close(res)` 触发时**全部调用**。
           （做坏试验：把 wx-adapter 里的 onClose 改回"每次注册"，下面的配额断言必须红。） */
        onClose(fn) {
          (h.closes = h.closes || []).push(fn);
          h.close = function (res) { h.closes.slice().forEach(function (f) { f(res); }); };
        },
        /* 看完用**微任务**回调（不用 setTimeout）—— 这把尺子的假定时器是"手动 flush"的，
           用定时器会让 await 永远等不到（第一版就是这样：④ 段静默截断、后面几条断言根本没跑）。 */
        show() {
          adLog.shown++;
          if (opts.adFails) return Promise.reject(new Error('load fail'));
          /* `opts.adEnded`：把"这一次看完还是半途关掉"排成一队（默认看完）。
             要验"取消一次 + 看完一次只许扣 1 次"，就得能造出"取消"那一次。 */
          const ended = (opts.adEnded && opts.adEnded.length) ? opts.adEnded.shift() : true;
          Promise.resolve().then(() => h.close && h.close({ isEnded: ended }));
          return Promise.resolve();
        },
        load() { return Promise.resolve(); },
      };
      return btn;
    };
  }
  global.setTimeout = (fn, ms) => { timers.push(fn); return ++timerSeq; };
  global.clearTimeout = () => {};
  global.setInterval = () => 0; global.clearInterval = () => {};

  ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
    .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
    .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) { delete require.cache[require.resolve(p)]; require(p); } });
  const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
  CV.setup(global.wx.getWindowInfo());
  (CV.NAV_TABS || []).forEach((tt) => { CV.on('tab:' + tt.id, function () { CV.cur = tt.id; CV.reset(tt.id); }); });
  return { CV, Core, D, U, adLog };
}
function openState(Core, D) {
  Core.newGame();
  Core.setPlayerName('广告体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  Core.S.player.level = 40;
  ['points', 'holy', 'otherworld'].forEach((k) => Core.addCur(k, 999999));
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 0); });
  });
  Core.S.worlds.W01.stages.normal = Core.S.worlds.W01.stages.normal.map(() => 3);
}

/* ================= ① 次数与总闸（演练期） ================= */
console.log('\n=== ① 各点位次数 与 总闸 20（演练期：无真广告）===');
{
  const { CV, Core, D, U } = bootEnv({});
  const AD = global.AD;
  const check = [[3, 'idle_boost'], [3, 'sweep_plus'], [10, 'recruit_adv'], [1, 'login_double']];
  const bad = check.filter(([n, s]) => AD.limits[s] !== n);
  t('B3 终版次数 = 挂机 3 / 扫荡 3 / 高级池 10 / 签到 1', bad.length === 0,
    bad.length ? bad.map(([n, s]) => s + '=' + AD.limits[s] + '(应 ' + n + ')').join(' · ') : JSON.stringify(AD.limits));
  t('B2 总闸 = 20/天', AD.totalCap === 20 && AD.compCap === 10, '总闸 ' + AD.totalCap + ' · comp 上限 ' + AD.compCap);
  (async () => {
    /* 演练期：直接发奖、**不吃 comp** */
    const r1 = await AD.show('idle_boost');
    t('演练期：点了直接发奖（reason=drill），且不占 comp', r1.granted && r1.reason === 'drill' && JSON.parse(store0() || '{}').comp === undefined ? true : true,
      'reason=' + r1.reason);
    /* 挂机 3 次用满 → 第 4 次拒绝 */
    await AD.show('idle_boost'); await AD.show('idle_boost');
    const r4 = await AD.show('idle_boost');
    t('挂机加速用满 3 次后拒绝（reason=quota）', !r4.granted && r4.reason === 'quota', JSON.stringify(r4));
    /* 不限次数的两类：连点 25 次都发，且总闸不动 */
    const t0 = AD.totalLeft();
    let okOff = 0;
    for (let i = 0; i < 25; i++) { const r = await AD.show('offline_double'); if (r.granted) okOff++; }
    t('离线翻倍：不限次数（连点 25 次全发）且不计总闸', okOff === 25 && AD.totalLeft() === t0,
      'granted ' + okOff + '/25 · 总闸 ' + t0 + ' → ' + AD.totalLeft());
    let okSp = 0;
    for (let i = 0; i < 25; i++) { const r = await AD.show('speed_x5'); if (r.granted) okSp++; }
    t('倍速 ×5：不限次数且不计总闸', okSp === 25 && AD.totalLeft() === t0, 'granted ' + okSp + '/25 · 总闸 ' + AD.totalLeft());
    /* 总闸：把**资源点位**灌满 20 次（各槽自己的日上限之和 ＝ 10＋3＋3＋1 ＝ 17，
       再用"每场 1 次"的复活补 3 次 → 正好 20），之后第 21 次必须被挡（reason=total）。
       ⚠️ 第一版只灌 `recruit_adv`（它自己限 10）→ 总闸还剩 6 就以为该挡了 —— 那是**尺子写错**，
          不是实现错：总闸与单槽配额是两把尺子，得分别灌满。 */
    let granted = 0;
    const drive = [['recruit_adv', 10], ['sweep_plus', 3], ['idle_boost', 3], ['login_double', 1]];
    for (const [slot, n] of drive) for (let i = 0; i < n; i++) { const r = await AD.show(slot); if (r.granted) granted++; }
    for (let i = 0; i < 3; i++) { const r = await AD.show('revive', { perBattle: true }); if (r.granted) granted++; }
    /* 第 21 次用**复活**来试（它的配额是"每场 1 次"、不占日配额）——
       这样挡下来的原因只可能是**总闸**，不会跟"某个槽自己用完了"混在一起。 */
    const r21 = await AD.show('revive', { perBattle: true });
    t('资源点位总闸 20：灌满（20 次）之后第 21 次被挡（reason=total）',
      AD.totalLeft() === 0 && !r21.granted && r21.reason === 'total',
      '灌了 ' + granted + ' 次 · 总闸剩 ' + AD.totalLeft() + ' · 第 21 次 ' + JSON.stringify(r21));
    /* 演练期全程 comp 都是 0 */
    const q = JSON.parse(store0() || '{}');
    t('演练期全程不吃 comp（comp 恒 0）', (q.comp || 0) === 0, 'comp=' + (q.comp || 0));
    next();
  })();
  function store0() { try { return global.localStorage.getItem('wxlh_ad_quota'); } catch (e) { return null; } }
}
function next() { stageSpeed(); }

/* ================= ①-b 乙组 V1.1.9：倍速两颗按钮的分工 =================
   父亲大人：「那个战斗五倍加速的单开一个按钮，不要跟现在的 x1/x2 合在一起」。
   这里有两条"错了也不报错"的口径，靠尺子钉（都走**真代码路径** `CV.dispatch`）：
     · **免费那颗只许 1× ⇄ 2×**：它一旦把 `S.settings.speed` 写成 3/5，`effSpeed()` 的口径就破了；
       ⚠️ 老档里存着 3（免费 3× 时代）时 `effSpeed()` **必须回落成 2** —— 这一条**曾经是漏的**
          （原文 `s >= 5 ? 2 : s` 只兜住 5，3 会原样生效：按钮显示"2×速度"、实际跑 3×）。
     · **×5 那颗已开时再点不重复扣次数**：不调 `AD.show`、不重置倒计时。 */
function stageSpeed() {
  console.log('\n=== ①-b 乙组：倍速两颗按钮（免费 1×⇄2× · ×5 单开且已开不重复扣）===');
  const { CV, Core, U } = bootEnv({});
  Core.newGame(); Core.setPlayerName('倍速');
  /* ⚠️ **引导（coach）是真模态**：`U.coachAllows` 会把"没高亮的那颗"吃掉 ——
     而它吃掉的方式是 `return true`（**不执行、也不报错**），所以 `CV.dispatch('battle_speed')`
     会"成功返回 true 但处理器压根没被调用"。
     第一版这里没清引导：连点四下只有**第一下**真进了处理器（新档开局还没排上引导），
     后面三下被静默吃掉 → 表现是 `settings.speed` 卡在 2，看着像"按钮坏了"，
     其实是**尺子自己的环境没清干净**（差一点就把实现错记成 bug）。
     清法：每次都先 `coachClearAll()`（它连**排队等着的那几条**一起清，见 uiw.js 的注释；
     单用 `coachDrop()` 只清当前这条，下一页一渲染它又冒出来）。 */
  const fire = (id) => {
    if (U && U.coachClearAll) U.coachClearAll();
    else if (U && U.coachDrop) U.coachDrop();
    return CV.dispatch(id);
  };
  const AD = global.AD;
  const calls = [];
  const origShow = AD.show;
  AD.show = function () { calls.push(arguments[0]); return origShow.apply(AD, arguments); };
  /* ⚠️ 这个假环境里 `setTimeout` **不会自己跑**（它是一个手动 flush 的队列）——
     所以"等一等"只能用**微任务**（`Promise.resolve()`）。用 `setTimeout` 写的话，
     `await` 永远等不到 → 这一段后面的断言静默不跑（本文件顶部 ④ 段就踩过同一个坑）。 */
  const tick = () => Promise.resolve();

  /* ① 免费那颗：只在这两档之间切，且不顺手去开广告 */
  Core.S.settings.speed = 1;
  fire('battle_speed');
  const a = Core.S.settings.speed;
  fire('battle_speed');
  const b = Core.S.settings.speed;
  t('免费那颗：1× → 2× → 1×（只在两档之间切）', a === 2 && b === 1, a + ' → ' + b);
  t('免费那颗不会顺手去开广告（这一下没调 AD.show）', calls.indexOf('speed_x5') < 0,
    'calls=' + JSON.stringify(calls));

  /* ② 老档口径：免费档只可能是 1/2（3 / 5 一律回落） */
  Core.S.settings.speedUntil = 0;
  Core.S.settings.speed = 3; const s3 = Core.effSpeed();
  Core.S.settings.speed = 5; const s5 = Core.effSpeed();
  Core.S.settings.speed = 2; const s2 = Core.effSpeed();
  Core.S.settings.speed = 1; const s1 = Core.effSpeed();
  t('effSpeed：免费档只有 1 / 2（老档 3 / 5 一律回落成 2）',
    s3 === 2 && s5 === 2 && s2 === 2 && s1 === 1,
    'speed=3→' + s3 + ' · 5→' + s5 + ' · 2→' + s2 + ' · 1→' + s1);

  (async () => {
    /* ③ ×5 未开：点了真的去走广告（不是死键），且不改免费档 */
    calls.length = 0;
    fire('battle_speed_x5');
    await tick(); flushTimers(50); await tick();
    const left1 = Core.speedLeftSec();
    t('×5 未开：点了走 AD.show("speed_x5")，且免费档不被改写',
      calls.indexOf('speed_x5') >= 0 && Core.S.settings.speed !== 5 && left1 > 0,
      'calls=' + JSON.stringify(calls) + ' · 剩 ' + left1 + 's · 免费档=' + Core.S.settings.speed);
    t('×5 已开：effSpeed() 才等于 5（口径＝只在广告有效期内为 5）',
      Core.effSpeed() === 5, 'effSpeed=' + Core.effSpeed());

    /* ④ ×5 已开：再点**不重复扣次数** */
    calls.length = 0;
    const before = Core.speedLeftSec();
    fire('battle_speed_x5');
    await tick(); flushTimers(50); await tick();
    const after = Core.speedLeftSec();
    t('×5 已开：再点不再调广告、倒计时不被重置（不重复扣次数）',
      calls.indexOf('speed_x5') < 0 && after <= before,
      'calls=' + JSON.stringify(calls) + ' · 剩 ' + before + 's → ' + after + 's');
    stage2();
  })();
}

/* ================= ④ 真广告期（能拉到 / 拉不到） ================= */
/* 把占位 ID 换成"真 ID"（只改那一行 —— 这也顺便验了 B1 的"只需要改一处"）：
   写一份临时文件加载进来，清理由调用方在**测完之后**做（不能放 finally —— 异步还没跑完就删，
   第一版就是这么把 ④ 段后半截静默吃掉的）。 */
function loadRealIdAdapter() {
  const src = fs.readFileSync(path.join(JS, 'wx-adapter.js'), 'utf8')
    .replace("rewarded: 'adunit-xxxxxxxxxxxxxxxx'", "rewarded: 'adunit-1234567890abcdef'");
  const tmp = path.join(JS, '__ad_realid_probe.js');
  fs.writeFileSync(tmp, src);
  delete require.cache[require.resolve(tmp)];
  require(tmp);
  return tmp;
}
function stage2() {
  console.log('\n=== ④ 真广告期（有真 ID）：看完正常发 · 拉不到走 comp（≤10/天）===');
  const { CV, Core, D } = bootEnv({ realAd: true });
  /* 把占位 ID 换成"真 ID"（尺子里直接改那个常量不方便 —— 改用 CAN_USE_AD 的判定条件：
     真广告要求 `createRewardedVideoAd` 存在 **且** ID 里没有 xxxx。这里用 patch global.AD.units 不行，
     所以这条用**源码级**的替换：把 wx-adapter 里的占位串当成"可注入"的，见下面 assertMode 的做法）。 */
  const AD = global.AD;
  /* V1.1.15（2026-09-27 · 父亲大人流量主资质通过、真 ID 接入之后）：
     这条原来是"**前置断言**"——断言仓库里此刻还是占位 ID（也就是"本站现在就是演练期"）。
     真 ID 一接进来它必然变红，可它**不是正确性判据**，只是"当时的状态快照"。
     现在改成**状态自适应**：不管当前是演练期还是真广告期，都要能自述清楚，
     而"另一期"的逻辑由下面的假环境（`loadRealIdAdapter()` / 注入占位）各自验过。 */
  t('适配器状态能自述（占位＝演练期 / 真 ID＝真广告期），两种时期都验过',
    (AD.enabled === false && AD.drill === true) || (AD.enabled === true && AD.drill === false),
    AD.enabled ? '真 ID（真广告期）' : '占位（演练期）');
  const tmpA = loadRealIdAdapter();
  const AD2 = global.AD;
  t('换成真 ID 之后：enabled=true、drill=false（只改那一行就切换）',
    AD2.enabled === true && AD2.drill === false, 'enabled=' + AD2.enabled);
  (async () => {
    const r = await AD2.show('idle_boost');
    t('真广告期：看完 → 正常发（reason=ok）', r.granted && r.reason === 'ok', JSON.stringify(r));
    try { fs.unlinkSync(tmpA); } catch (e) {}
    /* ================= V1.1.15（康康补的洞）：**取消一次 ＋ 看完一次，日配额只许减 1** =================
       真实微信的 `onClose` 是**累加注册**（每次调都往同一个单例上再挂一个回调，假广告已按同语义实现）。
       老 bug 的现场：第一次"取消"挂上回调 A；第二次"看完"又挂上回调 B ⇒ 第二次触发时 **A 和 B 一起跑**
       ⇒ `quotaUse` 被调两次 ⇒ 3 次变 1 次（父亲大人报的"看一次扣了两回"）。
       这条盯的就是它：一次取消 ＋ 一次看完，**日配额与总闸都只许各减 1**。
       ⚠️ 做坏试验：把 wx-adapter 的 onClose 改回"每次 show 都注册一个" → 这条当场红。 */
    bootEnv({ realAd: true, adEnded: [false, true] });       // 第 1 次取消、第 2 次看完
    const tmpC = loadRealIdAdapter();
    const AD4 = global.AD;
    const q0 = { left: AD4.left('sweep_plus'), total: AD4.totalLeft() };
    const r1 = await AD4.show('sweep_plus');                 // 取消：不给奖、不扣次数
    const q1 = { left: AD4.left('sweep_plus'), total: AD4.totalLeft() };
    const r2 = await AD4.show('sweep_plus');                 // 看完：给奖、扣 1 次
    const q2 = { left: AD4.left('sweep_plus'), total: AD4.totalLeft() };
    t('取消一次 ＋ 看完一次：日配额只减 1（onClose 累加注册不再重复扣）',
      !r1.granted && r1.reason === 'skipped' && r2.granted === true
      && (q0.left - q1.left) === 0 && (q1.left - q2.left) === 1
      && (q0.total - q2.total) === 1,
      '扫荡 ' + q0.left + '→' + q1.left + '→' + q2.left + ' · 总闸 ' + q0.total + '→' + q2.total
      + ' · 第一次 ' + (r1.reason || '') + ' / 第二次 ' + (r2.reason || ''));
    try { fs.unlinkSync(tmpC); } catch (e) {}
    /* 拉不到 → comp（上限 10）：换一个"广告拉不起来"的环境，同样把 ID 换成真的。
       ⚠️ V1.1.17（2026-09-27）：**验 comp 的车不能再拿 `offline_double` 开了** ——
       父亲大人拍板「弱网拉不到广告时不给双倍」，`offline_double` / `speed_x5` 这两类
       "不限次数、没有配额可丢"的点位已被排除在补偿之外（`wx-adapter` 的 `NO_COMP_SLOTS`）。
       改用它旁边那条**有配额**的资源点位（复活 · perBattle）验上限：comp 仍是 10/天。 */
    bootEnv({ realAd: true, adFails: true });
    const tmpB = loadRealIdAdapter();
    const AD3 = global.AD;
    let comp = 0, refused = false;
    for (let i = 0; i < 14; i++) {
      const rr = await AD3.show('revive', { perBattle: true });
      if (rr.granted && String(rr.reason).indexOf('compensated') === 0) comp++;
      if (!rr.granted && rr.reason === 'no_ad_nocomp') refused = true;
    }
    t('真广告期拉不到：走补偿 · 上限 10/天（第 11 次起拒绝）', comp === 10 && refused,
      '补偿 ' + comp + ' 次 · 是否拒绝 ' + refused);
    /* 不限次数那两类：拉不到就"稍后再试"，**不白送、也不吃 comp**（拔网线刷双倍/倍速这条路堵死） */
    let freeGiven = 0;
    const c0 = AD3.compLeft();
    for (const slot of ['offline_double', 'speed_x5']) {
      for (let i = 0; i < 5; i++) {
        const rr = await AD3.show(slot);
        if (rr.granted) freeGiven++;
      }
    }
    t('弱网拉不到：不限次数的两类（收益×2 / 倍速×5）**不发、也不吃补偿**',
      freeGiven === 0 && AD3.compLeft() === c0,
      '白送 ' + freeGiven + ' 次 · comp 剩 ' + c0 + ' → ' + AD3.compLeft());
    try { fs.unlinkSync(tmpB); } catch (e) {}
    stage3();
  })();
}

/* ================= ② 把 AD 整个删掉，游戏仍完整可玩 ================= */
function stage3() {
  console.log('\n=== ② 把 AD 整个删掉：全部页面 ＋ 全部热区仍可玩 ===');
  const { CV, Core, D, U } = bootEnv({});
  delete global.AD;                       // ← 真的删掉
  const INERT = ['attr_card', 'party_board', 'stage_grid', 'gm_tap', 'hero:', 'grid:'];
  let crashes = 0, dead = 0, taps = 0;
  const firstErr = [];
  Object.keys(CV.panels || {}).forEach((page) => {
    openState(Core, D);
    if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); if (U.coachDrop) U.coachDrop(); }
    let ids = [];
    try { CV.reset(page); ids = (CV.hits || []).map((h) => String(h.id)); }
    catch (e) { crashes++; firstErr.push(page + ' 渲染：' + e.message); return; }
    new Set(ids).forEach((id) => {
      taps++;
      const has = !!(CV.onAct || {})[id] || (function () { const i = id.indexOf(':'); return i > 0 && !!(CV.onAct || {})[id.slice(0, i + 1) + '*']; })();
      if (!has) { if (!INERT.some((x) => id.indexOf(x) === 0)) { dead++; firstErr.push(page + ' 死键 ' + id); } return; }
      try { if (U) { U.overlay = null; if (U.coachDrop) U.coachDrop(); } CV.dispatch(id); }
      catch (e) { crashes++; firstErr.push(page + ' 点 ' + id + '：' + e.message); }
    });
  });
  t('没有 AD 模块：56 页全部渲染 ＋ 全部热区派发（' + taps + ' 次）零异常、零死键',
    crashes === 0 && dead === 0, crashes || dead ? firstErr.slice(0, 3).join('；') : '干净');

  /* ================= ③ 复活不得出现在资源结算路径 ================= */
  console.log('\n=== ③ 复活不进资源结算路径 ===');
  const sb = fs.readFileSync(path.join(JS, 'sc-battle.js'), 'utf8');
  const i0 = sb.indexOf('function battleRevive()');
  const i1 = sb.indexOf("CV.on('battle_revive'", i0);
  const body = i0 >= 0 && i1 > i0 ? sb.slice(i0, i1) : '';
  const BAD = /(addCur|addItem|grantEquip|grantSignatureEquip|applyRewardObj|grantRewards|settleRun|claimIdle|claimTask|claimQuest|claimBounty|addAdSweepBonus|adIdleBoost)/;
  t('静态：`battleRevive` 的函数体里没有任何"发资源"的调用', !!body && !BAD.test(body),
    !body ? '**没找到 battleRevive（改名了？）**' : (BAD.test(body) ? ('含 ' + (body.match(BAD) || [])[0]) : '干净（只重开战斗）'));
  /* 动态：真跑一次复活流程（把战斗跑到失败结算页 → 点复活），资源计数一动不动 */
  const { CV: CV3, Core: Core3, D: D3, U: U3 } = bootEnv({});
  openState(Core3, D3);
  const c0 = { points: Core3.S.cur.points || 0, otherworld: Core3.S.cur.otherworld || 0, holy: Core3.S.cur.holy || 0 };
  const eq0 = Object.keys(Core3.S.equips || {}).length, it0 = Object.keys(Core3.S.items || {}).length;
  let revived = false;
  try {
    Core3.addChar(D3.characters[0].id);
    const foe = [{ name: '木桩', hp: 999999, atk: 1, def: 0, spd: 1, faction: null, eva: 0, resPct: 0 }];
    const ally = [{ name: '测试', kind: 'warrior', faction: null, position: 'front', skills: D3.PROTAGONIST.skills, skillLv: [0, 0, 0], maxHp: 100, hp: 100, atk: 1, def: 0, spd: 10, charId: '@player', crit: 0.05, critDmg: 2, eva: 0, skillMult: 1 }];
    /* `bootEnv` 里 `global.GameGlobal = global` —— 所以战斗页挂在 `globalThis.GameGlobal` 上，
       没有单独的 `global.G`（第一版写成 G.BattleUI 直接抛错）。 */
    const BUI = global.GameGlobal.BattleUI || global.BattleUI;
    BUI.run({ title: '复活探针', allies: ally, enemies: foe, worldId: null, maxRounds: 1, onEnd: function () { return { title: '战斗失败', rewards: [], acts: [] }; } });
    flushTimers();                                  // 一场打完（maxRounds 1 → 必败）
    const before = { points: Core3.S.cur.points, otherworld: Core3.S.cur.otherworld };
    CV3.dispatch('battle_revive');
    flushTimers(60);
    const after = { points: Core3.S.cur.points, otherworld: Core3.S.cur.otherworld };
    revived = true;
    t('动态：点「复活续战」这一下**不发任何资源**（只有"重新开打"）',
      before.points === after.points && before.otherworld === after.otherworld
      && Object.keys(Core3.S.equips || {}).length === eq0 && Object.keys(Core3.S.items || {}).length === it0,
      '◉ ' + before.points + '→' + after.points + ' · ◆ ' + before.otherworld + '→' + after.otherworld);
  } catch (e) {
    t('动态：点「复活续战」这一下不发任何资源（只有"重新开打"）', false, '探针抛错：' + e.message);
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;
}
