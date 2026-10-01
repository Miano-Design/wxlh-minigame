/* 页面系统审计（R1.3 阶段二 ②）：node scripts/audit_pages.js
   逐页真渲染 → 收热区 id → 对 `CV.on(...)` 的处理器（**含 `前缀:*` 动态处理器**，不误报）；
   同时查"注册了但进不去 / 有按钮没人接"。 */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('audit_pages');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D, U } = E;

/* 项目既有的"故意没有动作"的热区（引导锚点 / 调试暗门）——与 hit_handler_audit 同一份口径 */
const INERT = ['attr_card', 'party_board', 'stage_grid', 'gm_tap', 'hero:', 'grid:'];
/* ⚠️ 底栏四颗 `tab:*` 的处理器是 **`game.js` 在开机时注册的**，而本审计**不加载 game.js**
   （那会把整个开机流程跑一遍、还会去连云）。这里照 `hit_handler_audit` 的同一套办法补上那一行，
   否则 204 个"死按钮"全是假账 —— 审计自己先按项目既有的口径理解机制。 */
if (CV.NAV_TABS) CV.NAV_TABS.forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });
const hasH = (id) => {
  if ((CV.onAct || {})[id]) return 'exact';
  const i = String(id).indexOf(':');
  if (i > 0 && (CV.onAct || {})[String(id).slice(0, i + 1) + '*']) return 'prefix';
  return null;
};
Core.newGame(); Core.setPlayerName('页面体检');
(D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
if (D.characters && D.characters.length) { const c = D.characters[0].id; Core.S.chars[c] = { lv: 20, star: 3, exp: 0, attrs: {}, skillLv: [1, 1, 1], bloodlineLv: 1, equips: {} }; Core.S.party[1] = c; }
try { Core.addCur('points', 999999); Core.addCur('otherworld', 999999); Core.addCur('holy', 999999); } catch (e) {}

const pages = Object.keys(CV.panels || {});
const dead = [], unreachable = [];
const seenPages = new Set();
pages.forEach((p) => {
  if (U) { U.overlay = null; if (U.coachClearAll) U.coachClearAll(); }
  let err = null;
  try { CV.reset(p); } catch (e) { err = e; }
  if (err) { R.fail('页面渲染抛错：' + p, { file: 'js/sc-*.js', expected: '能渲染', actual: String(err.message) }); return; }
  seenPages.add(p);
  (CV.hits || []).forEach((h) => {
    const id = String(h.id);
    if (hasH(id) || INERT.some((x) => id.indexOf(x) === 0)) return;
    dead.push(p + ' → ' + id);
  });
});
(dead.length ? R.fail : R.pass)('没有"有热区没人接"的按钮（' + pages.length + ' 页全扫）', {
  file: 'js/sc-*.js', expected: '0 个死按钮', actual: dead.length ? (dead.length + ' 个：' + dead.slice(0, 6).join(' , ')) : '0 个',
});

/* 注册了、但**没有任何入口**能到的页面（靠 `CV.push/reset('<page>')` 的调用点判断） */
const fs = require('fs'), path = require('path');
const srcAll = fs.readdirSync(E.JS).filter((f) => /\.js$/.test(f))
  .map((f) => fs.readFileSync(path.join(E.JS, f), 'utf8')).join('\n');
pages.forEach((p) => {
  const re = new RegExp("(push|reset)\\('\" + p + \"'");
  const dynamicEntry = !!((CV.onAct || {})['open_' + p] || (CV.onAct || {})['tab:' + p]);
  const intentional = new Set(['item','eqdetail','serum_pick','equip_pick','battle','beast_detail','world','sweep','gm','pickleader','fabao_detail','mount_detail','pickparty','pickswap','recruit_result','recruit_rates','ssr_pick','char','gate','welcome','create','bloodline','story','story_archive']);
  if (!re.test(srcAll) && !dynamicEntry && !intentional.has(p) && p !== 'home') unreachable.push(p);
});
(unreachable.length ? R.warn : R.pass)('每个注册页面都有入口（reset/push 至少一处）', {
  file: 'js/sc-*.js', expected: '无孤岛页', actual: unreachable.length ? ('可能进不去：' + unreachable.join(', ')) : pages.length + ' 页都有入口',
});
R.finish();
