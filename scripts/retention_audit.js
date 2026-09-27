/* 留存环体检（N 轮）：node scripts/retention_audit.js
   ==============================================================================
   起因（父亲大人 2026-09-27 拍板「把留存环做了」）：策划总监 N 单的结论是
   **钩子从来不缺（17 类）、缺的是"看得见"** —— 所以这一轮两条都是"把已有的东西画出来"：

     N1 · 七日登录弹窗把 **7 格梯度全列**（含第 7 天的 🎫SSR自选券）——
          它是全游戏唯一一处"每天都必定被玩家看到"的留存件（`game.js` 无条件入队、一天一次）。
     N3 · 主页「日常」标题下一条**可点的汇总**「今日 · …」，点开是**只读**清单 ——
          原来只有 2 个红点 ＋ 一个「+N」，玩家想知道"到底还剩什么"得一格一格翻。

   两条最怕的坏法都是"看着像做了、其实没有"：
     · 弹窗又退回只画当天那一格 → 玩家永远不知道第 7 天有券（N1 红）；
     · 汇总条点开只弹一句"请自行查看" → 等于没做（N3 红）；
     · 汇总条顺手把奖励领了 / 改了存档 → 那就不是"只读出口"了（N3 的只读断言红）。
   只读脚本：跑在假环境里，不碰真存档、不碰微信。
   ============================================================================== */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* ---------- 假环境（记字 ＋ 记热区；宽度模型与 page_text_audit 同一套） ---------- */
let TEXT = [], TXY = [];
const stream = () => TEXT.join('');
const lines = () => {
  const byY = {};
  TEXT.forEach((s, i) => {
    const p = TXY[i] || { x: 0, y: 0 };
    const k = Math.round(p.y);
    (byY[k] = byY[k] || []).push({ s, x: p.x });
  });
  return Object.keys(byY).map((k) => byY[k].sort((a, b) => a.x - b.x).map((o) => o.s).join('')).filter((x) => x.trim());
};
function bootEnv() {
  const store2 = {};
  let writes = 0;                       // 写盘次数（"只读出口"那条要拿它当证据）
  global.GameGlobal = global;
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in store2 ? store2[k] : null),
    setItem: (k, v) => { writes++; store2[k] = String(v); },
    removeItem: (k) => { delete store2[k]; },
  };
  TEXT = []; TXY = [];
  const ctxStub = new Proxy({}, {
    get(t2, k) {
      if (k === 'measureText') return (s) => {
        const m = /(\d+(?:\.\d+)?)px/.exec(String(t2.font || ''));
        const size = m ? +m[1] : 11;
        return { width: Array.from(String(s == null ? '' : s)).reduce((a, c) => {
          const n = c.codePointAt(0);
          return a + (n > 0x1F000 ? size * 1.1 : (n > 127 ? size : size * 0.55));
        }, 0) };
      };
      if (k === 'fillText') return (s, x, y) => { TEXT.push(String(s)); TXY.push({ x: Number(x) || 0, y: Number(y) || 0 }); };
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
        'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
      if (props.indexOf(k) >= 0) return t2[k];
      return () => {};
    },
    set(t2, k, v) { t2[k] = v; return true; },
  });
  const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
  const touch = {};
  global.wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
    onTouchStart(fn) { touch.start = fn; }, onTouchMove(fn) { touch.move = fn; }, onTouchEnd(fn) { touch.end = fn; },
    onWindowResize() {}, onShow() {}, onHide() {},
    getStorageSync: (k) => (k in store2 ? store2[k] : null),
    setStorageSync: (k, v) => { writes++; store2[k] = String(v); },
    removeStorageSync: (k) => { delete store2[k]; },
    setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  };
  global.setTimeout = () => 1;
  global.clearTimeout = () => {};
  global.setInterval = () => 0; global.clearInterval = () => {};
  ['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
    .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
    .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) { delete require.cache[require.resolve(p)]; require(p); } });
  const CV = global.CV, Core = global.Core, D = global.DATA, U = global.GameGlobal.U;
  CV.setup(global.wx.getWindowInfo());
  CV.bindTouch();
  (CV.NAV_TABS || []).forEach((tt) => { CV.on('tab:' + tt.id, function () { CV.cur = tt.id; CV.reset(tt.id); }); });
  const tapAt = (x, y) => {
    const off = Math.round(((CV.pxW || CV.W) - CV.W) / 2);
    const px = x + off;
    if (touch.start) touch.start({ touches: [{ clientX: px, clientY: y }] });
    if (touch.end) touch.end({ changedTouches: [{ clientX: px, clientY: y }] });
  };
  return { CV, Core, D, U, tapAt, writes: () => writes };
}
const hitIds = (CV) => (CV.hits || []).map((h) => String(h.id));
const hasText = (s) => stream().indexOf(s) >= 0;
const chipsOf = (o) => ((o && o.rows) || []).reduce((a, r) => a.concat(r.map((c) => c.t)), []);
const snap = (env) => ({
  points: env.Core.S.cur.points || 0,
  otherworld: env.Core.S.cur.otherworld || 0,
  holy: env.Core.S.cur.holy || 0,
  items: JSON.stringify(env.Core.S.items || {}),
  stash: env.Core.stashCount ? env.Core.stashCount() : 0,
  writes: env.writes(),
});

/* 铺一个"站在首页、日常有几项能做"的档 */
function homeState(env, opts) {
  opts = opts || {};
  const Core = env.Core, D = env.D;
  Core.newGame();
  Core.setPlayerName('留存体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  Core.S.player.level = 30;
  ['points', 'otherworld'].forEach((k) => { Core.addCur(k, 5000); });
  const cid = (D.characters || [])[0] && (D.characters || [])[0].id;
  if (cid) { Core.addChar(cid); Core.setIdleLeader('gather', cid); }
  if (opts.idle !== false) Core.S.idle.bankSec = 1800;         // 挂机收益可收
  /* 引导是**真模态**（挂着的引导会把别的热区一律吃掉 —— 新号主页那颗「收取奖励」也是这样，
     那是引导的设计，不是 bug）。量"汇总条"得先让引导退场：
     ⚠️ **必须用 `coachSkipAll`（标已读）而不是 `coachDrop`/`coachClearAll`** ——
       首页**每渲染一帧都会重新武装开场引导**，而 `touchstart` 那一帧自己就会 `render()`，
       所以"只是放下"的引导会在手指抬起前又装回来，把这一下吃掉（本尺子第一版就卡在这）。
     （另外不要再补一次 `render`：reset 已经渲染过，多补一次文字与热区会各登记两遍。） */
  env.CV.reset('home');
  quietCoach(env);
}
/* 把开场链整条标成已读：`coachSkipAll` 只标"当前这一步"，
   而首页**每渲染一帧都会把下一步装回来** → 要"标一步、渲一帧"地循环到它彻底安静。
   （新号主页挂着引导时，「收取奖励」那颗也是点不动的 —— 引导是真模态，那是设计不是 bug。） */
function quietCoach(env) {
  for (let i = 0; i < 12; i++) {
    if (!(env.U.coachActive && env.U.coachActive())) break;
    if (env.U.coachSkipAll) env.U.coachSkipAll(); else if (env.U.coachClearAll) env.U.coachClearAll();
    env.CV.render();
  }
}
/* 内容坐标的热区要换成屏幕坐标才点得中（`hitAt` 内部走 `CV.localY`：减 TOP ＋ 加滚动）；
   在屏外的先滚到中间再点 —— 真玩家也是先滑下去才点得到。 */
function tapContent(env, id) {
  const h = (env.CV.hits || []).filter((x) => x.id === id)[0];
  if (!h) return null;
  if (h.screen) { env.tapAt(h.x + h.w / 2, h.y + h.h / 2); return h; }
  const top = env.CV.TOP + 8, bottom = env.CV.H - env.CV.safeBottom - 8;
  let sy = h.y + h.h / 2 + top - (env.CV.scroll || 0);
  if (sy > bottom || sy < top) {
    env.CV.scroll = Math.max(0, Math.min(env.CV.maxScroll || 0, h.y + h.h / 2 - (bottom - top) / 2));
    env.CV.render();
    quietCoach(env);
    sy = h.y + h.h / 2 + top - (env.CV.scroll || 0);
  }
  env.tapAt(h.x + h.w / 2, sy);
  return h;
}

console.log('\n=== ① N3 · 主页「今日」汇总条：在、能点、点开是只读清单 ===');
{
  const env = bootEnv();
  homeState(env);
  const ids = hitIds(env.CV);
  const rowLine = lines().filter((l) => l.indexOf('今日') >= 0);
  t('①-1 主页「日常」区有一条「今日 · …」汇总（画在画布上了）',
    rowLine.length > 0, rowLine[0] || '（没有这一行）');
  t('①-2 那条汇总**真的挂了热区**（不是一行死字）', ids.indexOf('open_today') >= 0, '热区 ' + ids.filter((x) => x.indexOf('open') === 0).join('+'));
  const hasHandler = !!env.CV._handlers && !!env.CV._handlers.open_today;
  /* 真手指那一下（走 hitAt + 引导闸，而不是直呼处理器）——"点得动"才算数 */
  const hit = (env.CV.hits || []).filter((h) => h.id === 'open_today')[0];
  t('①-3 「今日」那条的热区落在画布内、高度够按', !!hit && hit.h >= 24 && hit.y >= 0, hit ? (hit.w.toFixed(0) + '×' + hit.h.toFixed(0) + '@y' + hit.y.toFixed(0)) : '没找到热区');
  const before = snap(env);                       // ← 打开清单**之前**的全量快照
  tapContent(env, 'open_today');
  const o = env.U.overlay;
  t('①-4 真手指点一下 → 弹出「今天还能做什么」', !!o && /今天还能做什么/.test(o.title), o ? o.title : '（没弹）');
  const chips = chipsOf(o);
  /* 逐项列出：应当出现的东西由**只读函数自己报的状态**决定（这里独立算一遍，不调实现里的 helper） */
  const TDx = env.Core.todayState();
  const bnX = env.Core.bountyState().claimable;
  const gdX = env.Core.gardenState().filter((p) => p && p.ready).length;
  const want = [];
  if (TDx.idleReady) want.push('挂机');
  if (bnX) want.push('悬赏');
  if (TDx.dailyClaimable) want.push('任务');
  if (TDx.weeklyClaimable) want.push('周常');
  if (TDx.signReady) want.push('点灯');
  if (TDx.freeRecruitReady) want.push('免费招募');
  if (gdX) want.push('药园');
  t('①-5 清单**逐项列出**了今天还能做的事（该出现的每一项都在，且不止一句"请自行查看"）',
    chips.length >= 3 && want.every((k) => chips.some((c) => c.indexOf(k) >= 0)),
    '该有 ' + JSON.stringify(want) + ' · 实际 ' + JSON.stringify(chips));
  t('①-6 清单里有"点灯 / 免费招募 / 药园"这类**今天不做就浪费**的项（至少命中一条）',
    chips.some((c) => /点灯|免费招募|药园|周常|成就/.test(c)), JSON.stringify(chips));
  /* 只读：打开清单前后，货币/物品/待领箱/存档写入次数一个都不许变 */
  if (o) env.CV.dispatch('_cf_yes');
  const after = snap(env);
  t('①-7 清单是**只读**出口：关掉它，货币/背包/待领箱一点没动',
    after.points === before.points && after.otherworld === before.otherworld
      && after.items === before.items && after.stash === before.stash,
    '◉' + before.points + '→' + after.points + ' · ◆' + before.otherworld + '→' + after.otherworld
      + ' · 待领箱 ' + before.stash + '→' + after.stash + ' · 写盘 ' + before.writes + '→' + after.writes);
}

console.log('\n=== ② N3 · 全做完那一档：要能明确告诉玩家"今天可以下线了" ===');
{
  const env = bootEnv();
  homeState(env, { idle: false });
  /* 把三张"可领"的只读表都换成空表（**只换这一档的状态**，逻辑还是真代码）——
     这不是"测假东西"：要验的就是 todayTodoList 在"没得可领"时到底说什么。 */
  const raw = { t: env.Core.todayState, b: env.Core.bountyState, g: env.Core.gardenState };
  env.Core.todayState = () => ({ idleReady: false, dailyDone: 8, dailyTotal: 8, dailyClaimable: 0, weeklyClaimable: 0, achClaimable: 0, codexClaimable: 0, signReady: false, freeRecruitReady: false, claimable: 0 });
  env.Core.bountyState = () => ({ list: [], claimable: 0 });
  env.Core.gardenState = () => [];
  TEXT = []; TXY = [];                                        // 上面那几帧的字是历史，别混进来
  env.CV.reset('home');
  quietCoach(env);
  const rowLine = lines().filter((l) => l.indexOf('今日') >= 0);
  t('②-1 没有可领的 → 那条汇总写「今日 · 日常都做完了」',
    rowLine.length > 0 && /日常都做完了/.test(rowLine.join('')), rowLine.join(' | ') || '（没有这一行）');
  const hit = (env.CV.hits || []).filter((h) => h.id === 'open_today')[0];
  tapContent(env, 'open_today');
  const chips = chipsOf(env.U.overlay);
  t('②-2 点开也一样说清楚（不弹一张空清单）',
    chips.some((c) => /日常都做完了/.test(c)) && chips.some((c) => /每日任务/.test(c)), JSON.stringify(chips));
  env.Core.todayState = raw.t; env.Core.bountyState = raw.b; env.Core.gardenState = raw.g;
}

console.log('\n=== ③ N1 · 七日登录：7 格梯度 ＋ 第 7 天的钩子看得见 ===');
{
  const env = bootEnv();
  const D = env.D, U = env.U, LIST = D.LOGIN_REWARDS;
  homeState(env);
  U.loginReward({ day: LIST.length, reward: LIST[LIST.length - 1], round: 1, cycleDays: LIST.length });
  const chips = chipsOf(U.overlay);
  t('③-1 7 格**全列**（不是只画今天那一格）', chips.length === LIST.length, chips.length + ' 格 · ' + JSON.stringify(chips).slice(0, 120));
  t('③-2 第 7 天那颗写着 🎫SSR自选券（玩家这才知道"再撑几天有券"）',
    /第7天/.test(chips[LIST.length - 1] || '') && /SSR自选券/.test(chips[LIST.length - 1] || ''),
    chips[LIST.length - 1] || '（没有第 7 格）');
  t('③-3 今天那一格带（今天）；没到的那些不冒充已领',
    /（今天）/.test(chips[LIST.length - 1] || '') && chips.slice(0, LIST.length - 1).every((c) => c.indexOf('今天') < 0),
    JSON.stringify(chips).slice(0, 160));
  U.loginReward({ day: 3, reward: LIST[2], round: 1, cycleDays: LIST.length });
  const c3 = chipsOf(U.overlay);
  t('③-4 第 3 天那一屏：前两格打 ✓、今天带（今天）、后面的不冒充',
    /^✓第1天/.test(c3[0] || '') && /^✓第2天/.test(c3[1] || '') && /（今天）/.test(c3[2] || '')
      && c3.slice(3).every((c) => c.indexOf('✓') !== 0 && c.indexOf('今天') < 0),
    JSON.stringify(c3).slice(0, 160));
  t('③-5 奖励表一个字没动（这一轮只是"画出来"，不是"多给"）',
    LIST.length === 7 && JSON.stringify(LIST[6]) === JSON.stringify({ ssrTicket: true, item: 'ticket_lim' }),
    JSON.stringify(LIST[6]));
}

console.log('\n=== ④ N4 · 跨天：昨天"做完没领"的日常奖励不再蒸发 ===');
{
  const env = bootEnv();
  homeState(env);
  const D = env.D, Core = env.Core, LIST = D.DAILY_TASKS;
  /* 造"昨天"：前三条做完、一条没领，`date` 停在很久以前（＝跨天那一刻） */
  Core.S.tasks.daily = {}; Core.S.tasks.claimed = {}; Core.S.tasks.allClaimed = false;
  const pick = LIST.slice(0, 3);
  pick.forEach((tt) => { Core.S.tasks.daily[tt.id] = tt.target; });
  Core.S.tasks.date = '2000-01-01';
  const wantPts = pick.reduce((a, tt) => a + ((tt.reward && tt.reward.points) || 0), 0);
  const wantOther = pick.reduce((a, tt) => a + ((tt.reward && tt.reward.otherworld) || 0), 0);
  const wantHoly = pick.reduce((a, tt) => a + ((tt.reward && tt.reward.holy) || 0), 0);
  const b = snap(env);
  Core.ensureDaily();                                   // ← 跨天就发生在这里
  const a1 = snap(env);
  t('④-1 次日再进来：昨天做完没领的奖励**自动补发**（货币直接入账）',
    (a1.points - b.points) === wantPts && (a1.otherworld - b.otherworld) === wantOther,
    'Δ◉' + (a1.points - b.points) + '（应 ' + wantPts + '）· Δ◆' + (a1.otherworld - b.otherworld) + '（应 ' + wantOther + '）· Δ✦' + (a1.holy - b.holy) + '（应 ' + wantHoly + '）'
      + ' · 全是道具的那条（灵植种/招募券那类）走 addItem→装不下进待领箱');
  t('④-2 补发之后当日进度照常归零（不会把昨天的"已完成"带到今天）',
    Object.keys(Core.S.tasks.daily).length === 0 && Core.S.tasks.date !== '2000-01-01',
    'daily ' + JSON.stringify(Core.S.tasks.daily) + ' · date ' + Core.S.tasks.date);
  Core.ensureDaily();                                   // 再叫一次
  const a2 = snap(env);
  t('④-3 同一份**只补一次**（再调一次 ensureDaily 不会再发）',
    a2.points === a1.points && a2.otherworld === a1.otherworld && a2.stash === a1.stash,
    'Δ◉' + (a2.points - a1.points) + ' · Δ◆' + (a2.otherworld - a1.otherworld) + ' · 待领箱 ' + a1.stash + '→' + a2.stash);
  /* 领过的不许再补一遍：把三条标成已领，跨天时应当一分不发 */
  Core.S.tasks.daily = {}; Core.S.tasks.claimed = {}; Core.S.tasks.allClaimed = false;
  pick.forEach((tt) => { Core.S.tasks.daily[tt.id] = tt.target; Core.S.tasks.claimed[tt.id] = true; });
  Core.S.tasks.date = '2000-01-02';
  const b3 = snap(env);
  Core.ensureDaily();
  const a3 = snap(env);
  t('④-4 **已经领过**的那几条不重复补（不白送第二份）',
    a3.points === b3.points && a3.otherworld === b3.otherworld && a3.holy === b3.holy,
    'Δ◉' + (a3.points - b3.points) + ' · Δ◆' + (a3.otherworld - b3.otherworld) + ' · Δ✦' + (a3.holy - b3.holy));
}

console.log('\n=== ⑤ N5 · 回归礼：隔了 ≥2 天回来给一次（封顶、幂等、不打扰）===');
{
  const env = bootEnv();
  homeState(env);
  const Core = env.Core;
  const dstr = (off) => { const d = new Date(); d.setDate(d.getDate() - off); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const setLast = (off) => { Core.S.login.lastClaim = dstr(off); Core.S.login.comeback = ''; };

  /* ① 只隔一天 → 不发（不然天天有，就不叫"回归"了） */
  setLast(1);
  t('⑤-1 只隔 1 天：**不发**（"回归礼"只给隔了一整天以上没上线的）',
    Core.comebackState() === null && Core.grantComeback() === null, 'comebackState ' + JSON.stringify(Core.comebackState()));

  /* ② 隔 3 天 → 发最低档（◉30,000 ＋ ◆300） */
  setLast(3);
  const b2 = snap(env);
  const g2 = Core.grantComeback();
  const a2 = snap(env);
  t('⑤-2 隔 3 天：开机发一份（◉30,000 ＋ ◆300），奖**当场到手**（不等弹窗被点）',
    !!g2 && g2.days === 3 && (a2.points - b2.points) === 30000 && (a2.otherworld - b2.otherworld) === 300,
    JSON.stringify(g2 && g2.reward) + ' · Δ◉' + (a2.points - b2.points) + ' · Δ◆' + (a2.otherworld - b2.otherworld));
  const before3 = snap(env);
  t('⑤-3 同一天再叫一次：**不再发**（幂等 —— 装机被杀在弹窗前也不会重复发/漏发）',
    Core.grantComeback() === null && snap(env).points === before3.points, 'Δ◉' + (snap(env).points - before3.points));

  /* ④ 封顶：≥7 天与 30 天发的是同一份（不许"晾一周更划算"） */
  setLast(8);
  const g8 = Core.grantComeback();
  setLast(30);
  Core.S.login.comeback = '';
  const g30 = Core.grantComeback();
  t('⑤-4 **封顶**：隔 8 天与隔 30 天发的是同一份（不反向激励"晾一周再回来"）',
    JSON.stringify(g8 && g8.reward) === JSON.stringify(g30 && g30.reward),
    JSON.stringify(g8 && g8.reward) + ' vs ' + JSON.stringify(g30 && g30.reward));
  t('⑤-5 高档次比低档次厚（2~3 天 < 4~6 天 < ≥7 天）',
    Core.comebackRewardOf(7).points > Core.comebackRewardOf(5).points
      && Core.comebackRewardOf(5).points > Core.comebackRewardOf(2).points,
    Core.comebackRewardOf(2).points + ' / ' + Core.comebackRewardOf(5).points + ' / ' + Core.comebackRewardOf(7).points);

  /* ⑤ 报账弹窗：能画出来、胶囊是"逐项"的，且**不再发第二次** */
  const b5 = snap(env);
  env.U.comebackGift({ days: 3, reward: Core.comebackRewardOf(3) });
  const o = env.U.overlay;
  const chips = chipsOf(o);
  t('⑤-6 报账弹窗：标题＋逐项胶囊（不是一句"你收到了一份礼包"）',
    !!o && /欢迎回来/.test(o.title) && chips.length >= 2 && chips.some((c) => /◉|EXP/.test(c)),
    (o ? o.title : '（没弹）') + ' · ' + JSON.stringify(chips));
  if (o) env.CV.dispatch('_cf_yes');
  t('⑤-7 关掉弹窗**不会再发一份**（弹窗只报账，发奖只有开机那一处）',
    snap(env).points === b5.points && snap(env).otherworld === b5.otherworld,
    'Δ◉' + (snap(env).points - b5.points) + ' · Δ◆' + (snap(env).otherworld - b5.otherworld));
}

console.log('\n' + pass + ' 过 / ' + fail + ' 红\n');
process.exitCode = fail ? 1 : 0;
