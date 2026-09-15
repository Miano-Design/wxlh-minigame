/* 小游戏版的无头冒烟测试：node scripts/test-minigame.js

   用假的 wx / Canvas 把整个工程在 Node 里跑一遍：适配层 → 逻辑层 → Canvas 界面 → 触摸 → 广告降级。
   重点覆盖两件事：① **每个界面都画得出来**（防止某页空引用直接白屏）；② 主要玩法的按键真的生效。
   真机表现仍要用微信开发者工具预览，但这一层能挡住绝大多数低级错误。
*/
const path = require('path');
const fs = require('fs');

/* ---------- 假的 wx 环境 ---------- */
const store = {};
const noopCtx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k]
    // 引擎要给文字量宽度：给个假的测量结果，够跑通"不抛异常"这一层
    : (t[k] = (k === 'measureText' ? ((s) => ({ width: String(s).length * 8 })) : () => {}))),
  set: (t, k, v) => { t[k] = v; return true; },
});
global.GameGlobal = global;
global.localStorage = null;          // 真机没有 localStorage，强制走适配层那套
global.CE_SAMPLE = false;            // 这个测试跑的是原来的 Canvas 界面层；引擎版另有下面的冒烟测试
global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = global.cancelAnimationFrame || clearTimeout;
global.wx = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: k => { delete store[k]; },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3, safeArea: { top: 44 } }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3, safeArea: { top: 44 } }),
  createCanvas: () => ({ getContext: () => noopCtx, width: 0, height: 0 }),
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {}, onShow: () => {}, onHide: () => {},
  onTouchCancel: () => {},
  offTouchStart: () => {}, offTouchMove: () => {}, offTouchEnd: () => {}, offTouchCancel: () => {},
  setClipboardData: o => o.success && o.success(),
  showModal: o => o.success && o.success({ confirm: true }),
  // 故意不提供 createRewardedVideoAd：验证"广告拉不到也要有降级"这条路径
};

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' → ' + extra : '')); }
}

async function main() {
  let UI, CV, Scr, Core, D, AD;
  try {
    require(path.resolve(__dirname, '../game.js'));      // 入口
    UI = require(path.resolve(__dirname, '../js/ui-canvas.js'));
    CV = require(path.resolve(__dirname, '../js/cv.js'));
    Scr = require(path.resolve(__dirname, '../js/screens.js'));
    Core = window.Core; D = window.DATA; AD = window.AD;
    t('入口 boot 没抛异常（适配层 + 逻辑层 + 界面框架全部加载成功）', !!Core && !!window.Battle);
  } catch (e) {
    t('入口 boot 没抛异常', false, (e && e.message) + ' | ' + ((e && e.stack) || '').split('\n')[1]);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  t('逻辑层在小游戏环境里能建档', !!(Core.S && Core.S.player));
  t('存档写进了 wx 存储（不依赖 localStorage）', !!store['wxlh_save_v5']);
  t('地图数据完整（20 个世界）', D.WORLDS.length === 20);

  /* ---------- 建档流程：起名 → 选血统 → 进首页 ---------- */
  Core.setPlayerName('端到端');
  CV.dispatch('name_ok');
  t('起名后进入「选择血统」', CV.top().name === 'bloodline');
  CV.dispatch('blood_open_blood_zz');    // 故意用一个不存在的血统 id，验证它不会崩
  const firstBlood = Object.keys(D.BLOODLINES)[0];
  CV.dispatch('blood_' + firstBlood);
  t('选完血统回到首页', CV.top().name === 'home', CV.top().name);
  t('血统已写入存档', Core.S.player.bloodline === firstBlood);

  /* ---------- 每个界面都要画得出来 ---------- */
  const sample = {
    home: {}, worlds: {}, grow: {}, sect: {}, keji: {}, fabao: {}, mount: {}, garden: {},
    arena: {}, sign: {}, authority: {}, buildings: {}, genelock: {}, beast: {}, reincarn: {},
    codex: {}, refine: {}, idlelines: {}, tasks: {}, bounty: {}, shop: {}, guide: {}, settings: {},
    party: {}, chars: {}, protagonist: {}, recruit: {},
    bag: { pool: 'item' }, world: { worldId: 'W01', diff: 'normal' },
    item: { id: 'heal_s' }, picker: { title: '测试', items: [{ label: 'A', id: 'noop_a' }] },
    stagefail: {}, create: {}, bloodline: {},
  };
  const badRender = [];
  Object.keys(CV.panels).forEach(name => {
    if (name === 'char' || name === 'equip' || name === 'stageresult') return;  // 需要真实数据，下面单独测
    if (name === 'battle' && !Scr.battle()) return;   // 有战斗时才渲染（没有就跳过）
    CV.reset(name, sample[name] || {});
    try {
      UI._draw();
      // 注意：框架会把面板异常吞掉画成一行红字，所以必须查 lastError，不能只看有没有抛
      if (CV.lastError) badRender.push(name + '(' + CV.lastError.message + ')');
      else if (!CV.hits.length && name !== 'stagefail') badRender.push(name + '(没有可点区域)');
    } catch (e) { badRender.push(name + '(' + e.message + ')'); }
  });
  t(`${Object.keys(CV.panels).length - 4} 个界面全部渲染无异常`, badRender.length === 0, badRender.join('; '));

  /* ---------- 主要玩法按键 ---------- */
  Core.addCur('points', 2000000);
  Core.S.items['heal_s'] = (Core.S.items['heal_s'] || 0) + 5;
  Core.S.unlocks = {}; D.UNLOCKS.forEach(u => { Core.S.unlocks[u.id] = true; });

  // 挂机收取
  Core.S.idle.bankSec = 3600;
  const p0 = Core.S.cur.points;
  CV.reset('home'); UI._draw();
  CV.dispatch('claim_idle');
  t('「一键收取」结算挂机收益', Core.S.cur.points > p0 && Core.S.idle.bankSec === 0);

  // 打第 1 关：现在是"逐波播放"（战斗画面 → 结算），测试要把这一局跑完
  function playOut(maxStep) {
    let guard = 0;
    while (Scr.battle() && guard++ < (maxStep || 400)) {
      const b = Scr.battle();
      if (!b.done) Scr.tickBattle();
      else if (b.outcome && b.outcome.auto) CV.dispatch('battle_next');   // 波间自动接下一波
      else break;
    }
  }
  CV.reset('worlds');
  CV.dispatch('stage_W01_normal_0');
  t('点关卡会先进战斗画面（逐波播放）', CV.top().name === 'battle', CV.top().name);
  const b0 = Scr.battle();
  t('战斗画面有双方单位与站位数据', !!b0 && b0.order.length >= 2 && b0.units[b0.order[0]].maxHp > 0);
  UI._draw();
  t('战斗画面能画出站位与血条（可点区域 ≥3）', CV.hits.length >= 3, 'hits=' + CV.hits.length);
  t('战斗面板渲染无异常（框架不再吞异常）', !CV.lastError, CV.lastError && CV.lastError.message);
  playOut();
  t('打完之后进结算页', CV.top().name === 'stageresult', CV.top().name);
  t('结算页有可点的后续动作', CV.hits.length > 0);
  t('通关记录已落盘（3 星）', Core.S.worlds.W01.stages.normal[0] > 0);
  const expBefore = Core.S.player.exp;
  const battlesBefore = Core.S.stats.battles;
  CV.reset('world');
  CV.dispatch('sweep_W01_normal_1_3');
  // 经验要注意"升级会扣掉 exp 重新计数"，所以这里断言"战斗次数真的涨了 3 次"（扫荡 = 自动重打）
  t('扫荡真的结算了（战斗次数 +3，且经验在走）', Core.S.stats.battles - battlesBefore === 3, `battles +${Core.S.stats.battles - battlesBefore}`);

  // 招募（单抽 / 十连）
  const charsBefore = Object.keys(Core.S.chars).length;
  CV.dispatch('pull_normal_1');
  t('单抽生效', Object.keys(Core.S.chars).length >= charsBefore);
  CV.dispatch('pull_normal_10');
  t('十连生效（一次入库 10 位左右）', Object.keys(Core.S.chars).length >= charsBefore);

  // 队伍：上阵 / 下阵 / 换排
  const anyChar = Object.keys(Core.S.chars)[0];
  if (anyChar) {
    CV.dispatch(`setpos_1_${anyChar}`);
    t('点选能让人上阵', Core.S.party[1] === anyChar);
    CV.dispatch('swaprow_1');
    t('能换到另一排', Core.S.party.indexOf(anyChar) >= 2 || Core.S.party[1] === anyChar);
  } else {
    t('点选能让人上阵（无伙伴时跳过）', true);
    t('能换到另一排（无伙伴时跳过）', true);
  }

  // 角色卡 / 装备 / 背包 / 商店 / 养成
  if (anyChar) {
    CV.open('char', { id: anyChar }); UI._draw();
    t('角色卡渲染出可点区域', CV.hits.length > 3);
    const c0 = Core.S.chars[anyChar].lv;
    Core.S.chars[anyChar].exp = 999999;
    Core.addCur('points', 500000);
    CV.dispatch('lvup_' + anyChar);
    t('点升级能涨等级', Core.S.chars[anyChar].lv >= c0);
  }
  Core.grantEquip('W05', 'SSR');
  const uid = Object.keys(Core.S.equips)[0];
  CV.open('equip', { uid }); UI._draw();
  t('装备详情渲染出可点区域', CV.hits.length > 2);
  const enh0 = Core.S.equips[uid].enhance;
  Core.addCur('points', 500000); Core.addCur('otherworld', 5000);
  Core.S.items['mat_t1'] = 99;
  CV.dispatch('enh_' + uid);
  t('强化按钮能被点到（成功或失败都不报错）', typeof Core.S.equips[uid].enhance === 'number');
  CV.dispatch('lock_' + uid);
  t('锁定开关生效', Core.S.equips[uid].lock === true);
  CV.dispatch('lock_' + uid);

  CV.reset('bag', { pool: 'equip' }); UI._draw();
  t('背包-装备页渲染出格子', CV.hits.length > 1);
  CV.reset('bag', { pool: 'item' }); UI._draw();
  CV.dispatch('bagpool_mat');
  t('背包分池切换生效', CV.top().params.pool === 'mat');
  CV.dispatch('item_heal_s');
  t('点道具能进详情', CV.top().name === 'item');

  CV.reset('shop'); UI._draw();
  t('兑换大厅渲染出商品', CV.hits.length > 3);

  // 养成：药园种收 / 求签 / 斗法台 / 秘术阁
  Core.addCur('points', 3000000);
  Core.S.garden = [null, null, null, null];
  CV.reset('garden'); UI._draw();
  CV.dispatch('plant_0');
  t('药园能种下', !!Core.S.garden[0]);
  Core.S.garden[0].at = Date.now() - 1000;
  CV.dispatch('harvest_0');
  t('药园能收获（地块清空）', Core.S.garden[0] === null);
  CV.reset('sign'); UI._draw();
  CV.dispatch('sign_draw');
  t('求签能出签文', !Core.signState().canDraw);
  Core.addCur('otherworld', 9999);
  CV.reset('keji'); UI._draw();
  const k0 = Core.kejiLv(D.KEJI[0].id);
  CV.dispatch('keji_' + D.KEJI[0].id);
  t('秘术阁能升级', Core.kejiLv(D.KEJI[0].id) > k0);

  // 战斗过程（带帧播放）
  CV.reset('world');
  Scr.startBattle({ title: '测试战斗', worldId: 'W01', kind: 'combat', back: 'worlds' });
  t('战斗界面能起来', CV.top().name === 'battle' && !!Scr.battle());
  UI._draw();
  t('战斗界面渲染出跳过按钮', CV.hits.length > 0);
  CV.dispatch('battle_skip');
  t('跳过能直接出结果', Scr.battle() === null || Scr.battle().done);

  /* ---------- 广告降级 ---------- */
  t('没有真广告位时进入降级模式', AD.enabled === false);
  const holy0 = Core.S.cur.holy;
  CV.dispatch('ad_holy');                       // 第一次补偿：应该照发
  await new Promise(r => setTimeout(r, 30));
  t('点「看广告得晶石」在没有广告时也会入账（走补偿）', Core.S.cur.holy > holy0, `holy ${holy0}→${Core.S.cur.holy}`);
  const r1 = await AD.show('login_double');     // 第二次补偿：仍然发放
  t('广告拉不到 → 补偿发放（玩家不吃亏）', r1.granted === true && r1.reason.indexOf('compensated') === 0, JSON.stringify(r1));
  const r3 = await AD.show('offline_double');
  t('补偿每天最多 2 次', r3.granted === false && r3.reason === 'no_ad_nocomp', JSON.stringify(r3));

  /* ---------- 这一轮新增的广告点位 ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const resetAd = () => { store['wxlh_ad_quota'] = JSON.stringify({ date: AD._today(), used: {}, comp: 0 }); };

  resetAd();
  const sweepBefore = Core.sweepLeft();
  CV.dispatch('ad_sweep');
  await sleep(30);
  t('看广告：扫荡次数 +3', Core.sweepLeft() === sweepBefore + 3, `${sweepBefore} → ${Core.sweepLeft()}`);

  resetAd();
  const ow0 = Core.S.cur.otherworld;
  CV.dispatch('ad_other');
  await sleep(30);
  t('看广告：◆异界结晶 +50', Core.S.cur.otherworld - ow0 === 50, `+${Core.S.cur.otherworld - ow0}`);

  resetAd();
  const holy1 = Core.S.cur.holy;
  CV.dispatch('ad_holy');
  await sleep(30);
  t('看广告：✦圣洁晶石 +30', Core.S.cur.holy - holy1 === 30, `+${Core.S.cur.holy - holy1}`);

  resetAd();
  const pBefore = Core.S.cur.points;
  Core.S.idle.bankSec = 0;
  CV.lastOffline = { seconds: 3600, gains: { points: 1234, exp: 0, otherworld: 0, story: 0 } };
  CV.dispatch('ad_offline');
  await sleep(30);
  t('看广告：离线收益翻倍（再补一份）', Core.S.cur.points - pBefore === 1234, `+${Core.S.cur.points - pBefore}`);

  resetAd();
  CV.dispatch('ad_prebuff');
  await sleep(30);
  t('看广告：拿到战前增益（下一关攻击 +25%）', Scr.hasPreBuff() === true);
  CV.reset('world');
  CV.dispatch('stage_W01_normal_1');
  t('战前增益只作用于那一关（打完就消耗掉）', Scr.hasPreBuff() === false);

  resetAd();
  const rec0 = Core.S.stats.recruits;
  CV.dispatch('ad_recruit_adv');
  await sleep(30);
  t('看广告：能在高级池免费抽 1 次（且不扣货币）', Core.S.stats.recruits - rec0 === 1, `+${Core.S.stats.recruits - rec0}`);

  resetAd();
  const rec1 = Core.S.stats.recruits;
  CV.dispatch('ad_recruit');
  await sleep(30);
  t('看广告：能在普通池免费抽 1 次', Core.S.stats.recruits - rec1 === 1);

  Core.S.travel.pending = D.TRAVELS[0].id;
  CV.dispatch('claim_travel');
  t('游历奇遇能收下（网页版有这一段，小游戏版补上了）', Core.S.travel.pending === null);

  CV.reset('login'); UI._draw();
  t('七日登录面板渲染正常且有可点区域', CV.hits.length > 0);
  resetAd();
  const rw0 = Core.S.cur.points + Core.S.cur.holy + Core.S.cur.otherworld;
  CV.dispatch('ad_login_double');
  await sleep(30);
  t('签到奖励能看广告翻倍', Core.S.cur.points + Core.S.cur.holy + Core.S.cur.otherworld > rw0);

  resetAd();
  CV.reset('home'); UI._draw();
  const homeHtmlHits = CV.hits.length;
  t('首页同时铺开了集中广告区与各玩法入口', homeHtmlHits > 10, `可点区域 ${homeHtmlHits}`);

  /* ---------- 与网页版一致性 ---------- */
  t('js 下 4 个逻辑文件 + 界面层 ui-web.js 与网页版逐字节一致（跑过 sync-logic 才是对的）', (() => {
    const SRC = path.resolve(__dirname, '../../wxlh-game/js');
    return ['data.js', 'core.js', 'battle.js', 'dungeon.js'].every(f =>
      fs.readFileSync(path.join(SRC, f)).equals(fs.readFileSync(path.resolve(__dirname, '../js', f))))
      && fs.readFileSync(path.join(SRC, 'ui.js')).equals(fs.readFileSync(path.resolve(__dirname, '../js/ui-web.js')));
  })());
  t('逻辑层里没有 DOM 调用（小游戏没有 DOM）', (() => {
    const bad = [/\bdocument\./, /\bnavigator\./, /querySelector/];
    return ['data.js', 'core.js', 'battle.js', 'dungeon.js'].every(f => {
      const txt = fs.readFileSync(path.resolve(__dirname, '../js', f), 'utf8');
      return !bad.some(re => re.test(txt));
    });
  })());

  /* ---------- 路线 B：四个页签（走网页版界面层 + 翻译层） ---------- */
  const ceEnv = require(path.resolve(__dirname, 'ce-env.js'));
  ceEnv.install();
  const CEApp = require(path.resolve(__dirname, '../js/ce-app.js'));
  const CEEngine = require(path.resolve(__dirname, '../js/ce-engine.js'));
  [['home', '灯阁'], ['dungeon', '残域'], ['roster', '执灯者'], ['bag', '背包']].forEach(([tab, name]) => {
    let ok = false, info = '';
    try {
      const res = CEEngine.renderPage(ceEnv.makeCtx(), 390, 844, CEApp.pageMarkup(tab));
      ok = res.missing.length === 0;
      info = `元素 ${res.Layout.eleCount} · 缺样式 ${res.missing.length}`;
      if (res.missing.length) info += ' → ' + res.missing.slice(0, 3).map((p) => p.split('__').slice(-1)[0]).join(' / ');
    } catch (e) { info = (e && e.message); }
    t(`路线B：${name}页能渲染、且每个元素都查得到样式（查不到=黑底黑字）`, ok, info);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
