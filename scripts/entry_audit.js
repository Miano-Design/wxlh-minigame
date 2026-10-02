/* 入口反查审计（R2.5 · 父亲大人："看看是删了功能还是功能少了入口"）：
     node scripts/entry_audit.js
   ==============================================================================
   前面几把尺子查的是"**点了有没有反应**"（页面热区 → 有没有处理器）。
   这一把查**反方向**：**注册过的动作，有没有哪个页面能点到它** —— 查不出来的就是
   "有功能、没入口"（玩家永远用不到，等于被删了）。
   做法：真渲染全部页面（一份"玩到中期"的夹具）→ 收集所有热区 id → 和 `CV.onAct` 对照。
   ⚠️ 已知**允许存在**的孤儿（写在这里，免得下次又当新问题报）：
     · `open_bounty`：悬赏已经并进任务页（标签 `tasktab:bounty`），这个名字是**遗留别名**；
     · `open_bag` ：「背包」就是**底栏第 4 格**（`tab:bag`），页面级别名没人用是正常的
       （R3.1 把成长页"装备强度"那颗按钮去掉之后它才浮出来 —— 不是功能丢了）；
     · `open_locked`：要有"锁着的功能"才出现那一行，夹具全解锁时本来就不该有。
   只读：不改任何代码、不碰存档。 */
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('entry_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D } = E;

/* 夹具：一份"玩到中期"的档（与 ux_audit 同思路；全解锁，好让所有格子都铺出来） */
Core.newGame(); Core.setPlayerName('入口审计'); Core.choosePlayerBloodline('修真');
const S = Core.S;
S.player.level = 45; ['points', 'otherworld', 'holy', 'rp'].forEach((k) => Core.addCur(k, 5e5));
(D.UNLOCKS || []).forEach((u) => { S.unlocks[u.id] = true; });
D.WORLDS.forEach((w, i) => { S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(i < 12 ? 3 : 0), hard: Array(12).fill(0), hell: Array(12).fill(0) } }; });
D.characters.slice(0, 8).forEach((c) => { try { Core.addChar(c.id); S.chars[c.id].lv = 40; } catch (e) {} });
S.party = ['@player'].concat(D.characters.slice(0, 4).map((c) => c.id));
S.bag.eqCap = 400; for (let i = 0; i < 80; i++) Core.grantEquip('W06', 'SSR', null);
Core.autoEquipBest();
/* 引导一律按"已读"：引导层会吃掉非高亮点击，会污染这一轮的"有没有入口"测量 */
try { S.coachSeen = new Proxy({}, { get: () => true, set: () => true }); } catch (e) { S.coachSeen = {}; }

const PAGES = Object.keys(CV.panels);
const OPT = {
  char: () => ({ id: S.party[1] }), eqdetail: () => ({ uid: Object.keys(S.equips)[0] }),
  item: () => ({ id: 'mat_t1' }), fabao_detail: () => ({ id: D.FABAO[0].id }),
  mount_detail: () => ({ id: D.MOUNTS[0].id }), beast_detail: () => ({ id: D.BEASTS[0].id }),
  pickleader: () => ({ line: D.IDLE_LINES[0].id }), pickswap: () => ({ slot: 1 }),
  equip_pick: () => ({ cid: S.party[1], slot: 'weapon' }), serum_pick: () => ({ cid: S.party[1] }),
  ssr_pick: () => ({}),
};
const seen = new Set();
const TABS = CV.NAV_TABS.map((t) => t.id);
PAGES.forEach((p) => {
  try {
    CV.stack = [{ name: 'home', opts: {} }, { name: p, opts: OPT[p] ? OPT[p]() : {} }];
    CV.cur = TABS.indexOf(p) >= 0 ? p : CV.cur;
    CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null; CV.stickyH = 0; CV.bottomBarH = 0; CV.pageHead = null;
    CV.render();
    CV.hits.forEach((h) => seen.add(String(h.id)));
  } catch (e) {}
});
const hitIds = [...seen];
const matched = (act) => {
  if (act.slice(-2) === ':*') return hitIds.some((id) => id.indexOf(act.slice(0, -1)) === 0);
  return hitIds.indexOf(act) >= 0;
};
/* 页面入口类（`open_*`）才是"玩家点不到就永远见不到"的功能；其余（属性加点、对话选项…）
   由各自页面内部触发，不在这把尺子的判据里。 */
const ALLOW = ['open_bounty', 'open_bag', 'open_locked'];      // 见文件头那三条
const orphans = Object.keys(CV.onAct)
  .filter((a) => a.indexOf('open_') === 0 && !matched(a) && ALLOW.indexOf(a) < 0);
R.note('页面 ' + PAGES.length + ' 个 · 热区 id ' + hitIds.length + ' 个 · 注册动作 ' + Object.keys(CV.onAct).length + ' 个');
(orphans.length ? R.fail : R.pass)('每个页面入口都有地方能点到（没有"有功能没入口"）', {
  file: 'js/overhaul-2.0.js', expected: '0 个孤儿入口',
  actual: orphans.length ? orphans.join(' , ') : '0 个（允许清单里的 ' + ALLOW.length + ' 条不算：' + ALLOW.join(' / ') + '）',
});
/* 新手指引依赖的三个首页锚点必须真的存在（`sc-home.js` 的 OPENING 指的就是它们） */
{
  Core.newGame(); Core.setPlayerName('锚点'); Core.choosePlayerBloodline('修真');
  CV.reset('home'); CV.render();
  const ids = CV.hits.map((h) => String(h.id));
  const need = ['open_protag', 'grid:grow', 'grid:daily'];
  const miss = need.filter((t) => ids.indexOf(t) < 0);
  (miss.length ? R.fail : R.pass)('新手指引的三步锚点在首页真的存在（指位不会指空）', {
    file: 'js/sc-home.js', expected: need.join(' / '), actual: miss.length ? ('缺 ' + miss.join(',')) : '三步锚点齐',
  });
}
R.note('口径：真渲染全部页面取热区，与 `CV.onAct` 反查；只报事实。');
R.finish();
