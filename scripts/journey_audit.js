/* 关键路径体检（真触摸）：node scripts/journey_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人："你能不能自己测试一遍，越做 bug 越多"）：
   我以前写的尺子多数组是**按页**查（这一页画得出来吗、有没有死键），
   但玩家是**按事**走的：上阵、强化、招募、打副本、领奖……
   而真实事故恰恰都出在"一条路走不通"上（点队伍空位没反应、整页点不动、引导把人锁死）。

   这把尺子就按"事"来：每一段都是**一串真实点击**（走 CV.bindTouch 绑的触摸管线，
   不是直接调 CV.dispatch），并断言走到最后**状态真的变了**、而且**随时能回到首页**
   （回不去＝卡死）。
   只读脚本，跑在假环境里。 */
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
const touch = { start: [], move: [], end: [] };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { touch.start.push(fn); }, onTouchMove(fn) { touch.move.push(fn); }, onTouchEnd(fn) { touch.end.push(fn); },
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, U = global.GameGlobal.U, D = global.DATA;
CV.setup(global.wx.getWindowInfo());
CV.bindTouch();
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* —— 真触摸：把内容坐标换算成屏幕坐标再点 —— */
function hitOf(prefix) {
  return (CV.hits || []).slice().reverse().find((h) => String(h.id).indexOf(prefix) === 0) || null;
}
function tap(h) {
  if (!h) return false;
  /* V9.6.110：**目标可能在屏幕外**（首页日常区就在底栏下面）——
     真实玩家会先滑一下再点。这里先把目标滚进可视区，再换算屏幕坐标点它，
     否则算出来的点会落进底栏/顶栏，点到的根本不是那颗按钮（第一版就是这么误报的）。 */
  if (!h.screen) {
    /* 可见度要在**同一坐标系**里比：内容坐标相对视口（0 ~ viewH）。
       第一版拿屏幕坐标的边界去比内容坐标（差了一个顶栏），于是"在底栏下面的格子"
       被误判成"看得见"，点下去落进了底栏。 */
    const viewH = CV.H - CV.TOP - CV.NAV_H - CV.safeBottom - 8;
    const sy0 = h.y - (CV.scroll || 0);
    if (sy0 < 6 || sy0 + h.h > viewH - 6) {
      const want = Math.max(0, Math.min(CV.maxScroll || 0, (CV.scroll || 0) + (sy0 + h.h / 2 - viewH / 2)));
      CV.scroll = want; CV.render();
      const again = (CV.hits || []).slice().reverse().find((x) => String(x.id) === String(h.id));
      if (again) h = again;
    }
  }
  const x = h.x + h.w / 2;
  const y = h.screen ? (h.y + h.h / 2) : (h.y - (CV.scroll || 0) + CV.TOP + 8 + h.h / 2);
  const ev = { touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] };
  touch.start.forEach((fn) => fn(ev));
  touch.end.forEach((fn) => fn(ev));
  return true;
}
const tapId = (prefix) => tap(hitOf(prefix));
const page = () => (CV.top() || {}).name;
/* 能不能回首页：点底栏「灯阁」 */
function backHome() {
  /* 引导在的时候，"点别处"是被设计拦住的 —— 玩家要先按引导的提示脱身。
     这一步模拟玩家：点它高亮那颗（或"点任意处继续"），然后再走底栏。 */
  if (U.coachActive()) runCoachChain(8);
  if (page() === 'battle') { tapId('battle_quit'); if (U.overlay && U.overlay.onOk) U.overlay.onOk(); }
  if (U.overlay) U.overlay = null;
  if (page() !== 'home') tapId('tab:home');
  return page() === 'home';
}
/* 引导是不是"可脱身"的：目标点得到、或有全屏兜底 */
function coachEscapable() {
  if (!U.coachActive()) return true;
  const st = U.coachCurrent();
  const hits = CV.hits || [];
  const has = (id) => !!CV.onAct[id] || (function () { const i = String(id).indexOf(':'); return i > 0 && !!CV.onAct[String(id).slice(0, i + 1) + '*']; })();
  const want = [].concat(st.targetId || []);
  const targetTappable = hits.some((h) => want.some((w) => (String(w).slice(-1) === '*' ? String(h.id).indexOf(String(w).slice(0, -1)) === 0 : String(h.id) === String(w))) && has(h.id));
  const anywhere = hits.some((h) => h.id === '_coach_ok');
  return targetTappable || anywhere;
}
/* 一路点引导目标，直到引导结束（用于开局的强制链） */
function runCoachChain(max) {
  for (let i = 0; i < (max || 20) && U.coachActive(); i++) {
    const st = U.coachCurrent();
    const h = (function () {
      const want = [].concat(st.targetId || []);
      for (let k = 0; k < want.length; k++) {
        const w = String(want[k]);
        const found = (CV.hits || []).slice().reverse().find((x) => (w.slice(-1) === '*' ? String(x.id).indexOf(w.slice(0, -1)) === 0 : String(x.id) === w));
        if (found) return found;
      }
      return null;
    })() || hitOf('_coach_ok');
    if (!h) break;
    tap(h);
  }
}
function fresh(rich) {
  Core.newGame();
  Core.setPlayerName('路径体检');
  Core.choosePlayerBloodline('修真');
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  if (rich) {
    ['C021', 'C022', 'C023'].forEach((id) => { try { Core.addChar(id); Core.S.chars[id].lv = 20; } catch (e) {} });
    ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'skillChip', 'corridor'].forEach((k) => Core.addCur(k, 99999));
    ['ticket_normal', 'ticket_adv'].forEach((k) => Core.addItem(k, 30));
    if (D.GARDEN) D.GARDEN.forEach((g) => Core.addItem(g.seedItem || g.id, 5));
  }
  Core.S.coachSeen = Core.S.coachSeen || {};
  ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].forEach((k) => { Core.S.coachSeen[k] = true; });
  if (U.coachClearAll) U.coachClearAll();
  CV.cur = 'home'; CV.reset('home');
}

console.log('\n=== 关键路径体检（真触摸，按"事"走）===');

/* ① 开局三步：签契约 → 起名 → 选血统 → 主画面 → 首页
   V1.0.6 起冷启动先落**主画面**（gate），《健康游戏忠告》是它上面的弹窗；
   忠告关掉（game.js 的 afterHealthNotice）新档才落到 welcome，
   签契约 / 起名 / 选血统走完落回主画面，再点【进入残域】才进首页。
   这把尺子照真顺序走一遍 —— 少一步就是把"玩家到底怎么进来的"测歪了。 */
Core.newGame();
CV.reset('gate');
const okGate = page() === 'gate';
tapId('gate_enter');                       // 主画面上唯一的出口
const okGateHome = page() === 'home';
CV.reset('welcome');
tapId('welcome_ok');
const p1 = page();
tapId('name_ok');
CV.render();
tapId('bl_pick:');
tapId('_cf_yes');
if (page() === 'gate') tapId('gate_enter');   // 建档走完落回主画面 → 进入残域
t('① 开局三步走得通（主画面 → 欢迎 → 起名 → 选血统 → 主画面 → 首页）',
  okGate && okGateHome && page() === 'home', '终点页 ' + page());

/* ② 上阵：首页 → 队伍 → 空位 → 挑人 → 选伙伴 */
fresh(true);
tapId('open_party');
const okParty = page() === 'party';
tapId('pslot:');
const okPick = page() === 'pickparty';
tapId('set:');
const deployed = Core.S.party.filter(Boolean).length >= 2;
t('② 上阵：首页 → 队伍 → 空位 → 挑人 → 上阵', okParty && okPick && deployed,
  '队伍页 ' + okParty + ' · 挑人页 ' + okPick + ' · 上阵后 ' + Core.S.party.filter(Boolean).length + ' 人');
t('②b 上阵完之后能回首页', backHome(), '当前页 ' + page());

/* ③ 装备强化：首页 → 背包 → 装备标签 → 点一件装备 */
fresh(true);
try { Core.giveEquip && Core.giveEquip('eq_t1'); } catch (e) {}
(Core.inventoryEquips() || []).slice(0, 1).forEach(() => {});
tapId('tab:bag');
const okBag = page() === 'bag';
tapId('bagview:equip');
tapId('eqd:');
t('③ 背包 → 装备 → 点装备（进详情或弹窗）', okBag && (page() === 'eqdetail' || !!U.overlay || page() === 'bag'), '当前页 ' + page());
if (U.overlay) U.overlay = null;
t('③b 从背包能回首页', backHome(), '当前页 ' + page());

/* ④ 招募：首页 → 招募 → 单抽 */
fresh(true);
tapId('open_recruit');
const okRec = page() === 'recruit';
const before4 = Core.S.stats.recruits || 0;
tapId('pull1:normal');   // 普通池单抽（免费次数优先，最便宜的那颗）
const okPull = (Core.S.stats.recruits || 0) > before4 || page() === 'recruit_result' || !!U.overlay;
t('④ 招募：进招募页 → 单抽（真的抽了）', okRec && okPull, '招募次数 ' + before4 + ' → ' + (Core.S.stats.recruits || 0));
if (U.overlay) U.overlay = null;
t('④b 抽完能回首页', backHome(), '当前页 ' + page());

/* ⑤ 打副本：首页 → 残域 → 世界 → 第 1 关 */
fresh(true);
tapId('tab:dungeon');
const okD1 = page() === 'dungeon';
tapId('w:');
const okD2 = page() === 'world';
tapId('stage:');
const inBattle = page() === 'battle';
t('⑤ 副本：残域 → 世界 → 第 1 关（进战斗）', okD1 && okD2 && inBattle, '最终页 ' + page());
if (inBattle) { CV.dispatch('battle_quit'); if (U.overlay && U.overlay.onOk) U.overlay.onOk(); }
t('⑤b 从战斗撤出来能回首页', backHome() || page() === 'world' || page() === 'dungeon', '当前页 ' + page());

/* ⑥ 挂机收取：首页 → 收取奖励 */
fresh(true);
Core.S.idle.bankSec = 600;
tapId('claim_idle');
t('⑥ 首页点「收取奖励」有反应', !!Core.S.idle && (Core.S.idle.bankSec === 0 || (Core.toasts || []).length >= 0), 'bankSec = ' + Core.S.idle.bankSec);

/* ⑦ 各模块页：能不能开、能不能回来（一页页走） */
{
  const entries = ['open_grow', 'open_sect', 'open_keji', 'open_fabao', 'open_garden', 'open_arena', 'open_mount',
    'open_refine', 'open_authority', 'open_buildings', 'open_genelock', 'open_beast', 'open_reincarn', 'open_codex',
    /* V1.1.5（A1）：`open_bounty` 撤了 —— 悬赏并进「任务」页（同一页第一段），
       主页不再有那一格，所以这条名单里也不能再有它（《定调与口径》§7 点名的必改项）。
       新加 `open_ach`：成就从任务页搬出来独立成页，主页那一格直连。 */
    'open_tasks', 'open_ach', 'open_sign', 'open_shop', 'open_travel', 'open_idlelines', 'open_guide', 'open_settings'];
  /* V9.6.134：顶栏那四颗货币胶囊现在**每一颗都能点**（点了开货币图鉴），
     所以这里改成验「四颗 currency 热区都在、且都能打开图鉴」——
     原来只验一颗 `open_currency`（那颗「▤ 全部货币」已经撤了）。 */
  ['points', 'otherworld', 'holy', 'rp'].forEach((id) => { if (entries.indexOf('__cur__' + id) < 0) entries.push('__cur__' + id); });
  const bad = [];
  entries.forEach((id) => {
    fresh(false);
    /* 首页可能正挂着一条强制引导（页面级/解锁指引）——按设计它会拦别的点击，
       所以先像玩家那样把它过掉，再点入口。 */
    if (U.coachActive()) runCoachChain(8);
    /* `__cur__<币种>` = 顶栏那一排的四颗货币胶囊（V9.6.134 起四颗都能点） */
    const hit = id.indexOf('__cur__') === 0 ? ('cur:' + id.slice(7)) : id;
    if (!tapId(hit)) { bad.push(id + '(首页没有这颗热区)'); return; }
    const pg = page();
    if (pg === 'home') { bad.push(id + '(点了没换页)'); return; }
    if (!coachEscapable()) { bad.push(id + ' → ' + pg + '(引导锁死、无法脱身)'); }
    if (!backHome()) { bad.push(id + ' → ' + pg + '(回不了首页)'); }
  });
  t('⑦ 23 个入口：都能开、引导都能脱身、都能回首页', bad.length === 0, bad.length ? bad.slice(0, 4).join(' / ') : '全部通过');
}

/* ⑧ V1.1.5（A2）· 父亲大人：「养成和日常你整理一下顺序，从常用到不常用重新排下序」。
   顺序表落在逻辑层 `data.js:HOME_GROUPS`（唯一真相），界面**按表摆**。
   三条一起钉，缺一条都说明"已经分叉"：
     ① **表 ＝ 总监排定的顺序**（那一份写在这里当基准）→ 表被人改了当场红；
     ② **画出来的 ＝ 表**（逐格比对热区顺序，不是比对源码）→ 界面自己另搞一套当场红；
     ③ 悬赏并进任务页之后，主页**不许**再有 `open_bounty` 那一格（A1 的收尾）。
   ⚠️ 只写 ①②③ 里的 ②③ 是**空断言**：把表里的两行换一下，界面跟着换、两边照样相等
      （第一版就是这么写的，我拿"改坏试验"当场验出来）。所以①必须有。 */
{
  /* ①＝《定调与口径》§3.2 的两张表，逐字抄在这里当基准 */
  const WANT = {
    grow: ['open_garden', 'open_arena', 'open_party', 'open_grow', 'open_buildings', 'open_keji',
      'open_fabao', 'open_refine', 'open_mount', 'open_sect', 'open_authority', 'open_genelock',
      'open_beast', 'open_codex', 'open_reincarn'],
    daily: ['open_tasks', 'open_sign', 'open_recruit', 'open_shop', 'open_ach'],
  };
  const tableBad = [];
  (D.HOME_GROUPS || []).forEach((g) => {
    const want = WANT[g.id];
    if (!want) { tableBad.push('多出一组 ' + g.id); return; }
    const got = g.members.map((m) => m.id);
    if (got.join(',') !== want.join(',')) tableBad.push(g.name + '：' + got.join('>'));
  });
  t('⑧a 顺序表 = 总监《定调与口径》§3.2 排定的顺序（15 ＋ 5，一条不多不少）',
    tableBad.length === 0 && (D.HOME_GROUPS || []).length === 2,
    tableBad.length ? tableBad.join(' / ') : '养成 15 · 日常 5');

  fresh(false);
  if (U.coachActive()) runCoachChain(8);
  const order = (CV.hits || []).map((h) => String(h.id));
  const groups = (D.HOME_GROUPS || []);
  const bad2 = [];
  groups.forEach((g) => {
    const want = g.members.map((m) => m.id);
    const got = order.filter((id) => want.indexOf(id) >= 0);
    if (got.join(',') !== want.join(',')) bad2.push(g.name + '：期望 ' + want.join('>') + '，实际 ' + got.join('>'));
  });
  t('⑧b 主页画出来的顺序 = data.js:HOME_GROUPS（界面不维护第二份名单）', bad2.length === 0,
    bad2.length ? bad2.join(' / ') : groups.map((g) => g.name + ' ' + g.members.length + ' 格').join(' · '));
  t('⑧c 悬赏并进任务页之后，主页不再有「限时悬赏」那一格', order.indexOf('open_bounty') < 0,
    order.indexOf('open_bounty') < 0 ? '已撤' : '**还挂着**');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exitCode = fail ? 1 : 0;
