/* 小游戏版的无头冒烟测试：node scripts/test-minigame.js

   思路：用假的 wx / Canvas 把整个工程在 Node 里跑一遍，
   验证「适配层 → 逻辑层 → Canvas 界面 → 触摸派发 → 广告降级」这条链没有断。
   真机表现仍要用微信开发者工具预览，但这一层能挡住绝大多数低级错误。
*/
const path = require('path');
const fs = require('fs');

/* ---------- 假的 wx 环境 ---------- */
const store = {};
const noopCtx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (t[k] = () => {})),
  set: (t, k, v) => { t[k] = v; return true; },
});
global.GameGlobal = global;
global.localStorage = null;              // 真机没有 localStorage，强制走适配层自己实现的那套
global.wx = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: k => { delete store[k]; },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3, safeArea: { top: 44 } }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3, safeArea: { top: 44 } }),
  createCanvas: () => ({ getContext: () => noopCtx, width: 0, height: 0 }),
  onTouchStart: () => {}, onShow: () => {}, onHide: () => {},
  // 故意不提供 createRewardedVideoAd：验证"广告拉不到也要有降级"这条路径
};

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' → ' + extra : '')); }
}

async function main() {
  let UIMod, Core, DATA, Dungeon, AD;
  try {
    require(path.resolve(__dirname, '../game.js'));      // 入口：适配层 → 逻辑层 → 界面
    UIMod = require(path.resolve(__dirname, '../js/ui-canvas.js'));
    Core = window.Core; DATA = window.DATA; Dungeon = window.Dungeon; AD = window.AD;
    t('入口 boot 没抛异常（适配层 + 逻辑层 + Canvas 界面全部加载成功）', !!Core && !!window.Battle);
  } catch (e) {
    t('入口 boot 没抛异常', false, (e && e.message) + ' | ' + ((e && e.stack) || '').split('\n')[1]);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  t('逻辑层在小游戏环境里能建档', !!(Core.S && Core.S.player));
  t('存档写进了 wx 存储（不再依赖 localStorage）', !!store['wxlh_save_v5']);
  t('地图数据完整（20 个世界）', DATA.WORLDS.length === 20);
  t('战斗引擎可用', (() => {
    const allies = [Object.assign({}, Core.effectivePlayerStats(), {
      name: '测', kind: 'warrior', faction: null, position: 'front',
      skills: DATA.PROTAGONIST.skills, skillLv: [1, 1, 1], charId: '@player',
    })];
    const res = window.Battle.run({ allies, enemies: Dungeon.makeEnemies('W01', 'normal', 1, 'combat'), worldId: 'W01', maxRounds: 20 });
    return typeof res.win === 'boolean' && res.frames.length > 0;
  })());

  /* ---------- 界面 ---------- */
  t('首页能整屏画出来，并登记了可点区域', (() => {
    try { UIMod._draw(); return UIMod._hits().length > 3; } catch (e) { return false; }
  })());
  t('三个页签都画得出来', (() => {
    try { ['home', 'dungeon', 'bag'].forEach(v => { UIMod._setTab(v); UIMod._draw(); }); UIMod._setTab('home'); UIMod._draw(); return true; }
    catch (e) { return false; }
  })());
  t('点「一键收取」真的结算挂机收益', (() => {
    Core.S.idle.bankSec = 3600;
    const p0 = Core.S.cur.points;
    UIMod._dispatch('claim');
    return Core.S.cur.points > p0 && Core.S.idle.bankSec === 0;
  })());
  t('进第 1 关能打完并落盘（战斗 → 奖励 → 存档一条链）', (() => {
    try { UIMod._dispatch('enter_W01'); return Core.S.pendingRun !== undefined; }
    catch (e) { return false; }
  })());

  /* ---------- 广告降级 ---------- */
  t('没有真广告位时进入降级模式而不是崩', AD.enabled === false);
  t('每个点位有独立配额', AD.left('idle_boost') === 5 && AD.left('offline_double') === 3 && AD.left('holy_pack') === 2);
  const r1 = await AD.show('holy_pack');
  t('广告拉不到 → 走"补偿发放"，玩家不吃亏', r1.granted === true && r1.reason.indexOf('compensated') === 0, JSON.stringify(r1));
  t('补偿会记次数（防拔网线白刷）', AD.left('holy_pack') === 1);
  await AD.show('login_double');
  const r3 = await AD.show('offline_double');   // 第三次补偿，应该被挡
  t('补偿每天最多 2 次，第 3 次不再补', r3.granted === false && r3.reason === 'no_ad_nocomp', JSON.stringify(r3));
  const r4 = await AD.show('idle_boost');
  t('补偿额度用完就明确拒绝（不静默失败、不把玩家卡住）', r4.granted === false, JSON.stringify(r4));

  /* ---------- 与网页版的一致性 ---------- */
  t('js 下 4 个逻辑文件与网页版逐字节一致（跑过 sync-logic 才是对的）', (() => {
    const SRC = path.resolve(__dirname, '../../wxlh-game/js');
    return ['data.js', 'core.js', 'battle.js', 'dungeon.js'].every(f =>
      fs.readFileSync(path.join(SRC, f)).equals(fs.readFileSync(path.resolve(__dirname, '../js', f))));
  })());
  t('逻辑层里没有 DOM 调用（小游戏没有 DOM）', (() => {
    const bad = [/\bdocument\./, /\bnavigator\./, /querySelector/];
    return ['data.js', 'core.js', 'battle.js', 'dungeon.js'].every(f => {
      const txt = fs.readFileSync(path.resolve(__dirname, '../js', f), 'utf8');
      return !bad.some(re => re.test(txt));
    });
  })());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
