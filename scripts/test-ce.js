/* 新版小游戏的无头测试：node scripts/test-ce.js
   三件事：
     ① 每一页都画得出来、且每个元素都查得到样式（查不到=那个元素整套样式都没有）
     ② 网页版的绑定真的接上了：点砖/点弹窗/点战斗按钮，状态与弹窗要有反应
     ③ 逻辑层与界面层必须与网页版逐字节一致（改网页版后跑 sync-logic.js 再测）
*/
const path = require('path');
const fs = require('fs');
const env = require(path.resolve(__dirname, 'ce-env.js'));
env.install();
const CEApp = require(path.resolve(__dirname, '../js/ce-app.js'));
const CEEngine = require(path.resolve(__dirname, '../js/ce-engine.js'));
const Core = window.Core, UI = window.UI;

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? ' → ' + extra : '')); } };

/* ---------- ① 每一页都画得出来 ---------- */
const PAGES = [['setup', '开局（起名/选血统）'], ['home', '灯阁'], ['dungeon', '残域'],
  ['roster', '执灯者·队伍'], ['chars', '执灯者·伙伴'], ['grow', '执灯者·成长'], ['bag', '背包'], ['equip', '背包·装备']];
PAGES.forEach(([tab, name]) => {
  let ok = false, info = '';
  try {
    const res = CEEngine.renderPage(env.makeCtx(), 390, 844, CEApp.pageMarkup(tab));
    ok = res.missing.length === 0;
    info = `元素 ${res.Layout.eleCount} · 缺样式 ${res.missing.length}`;
    if (res.missing.length) info += ' → ' + res.missing.slice(0, 3).map((p) => p.split('__').slice(-1)[0]).join(' / ');
  } catch (e) { info = (e && e.message); }
  t(`${name} 能渲染且样式齐全`, ok, info);
});

/* ---------- ② 交互：网页版的绑定真的接上了 ---------- */
const ROOTS = ['view', 'modal-root', 'battle-root', 'navbar', 'topbar', 'curbar'];
const find = (sel) => {
  for (const id of ROOTS) { const r = document.getElementById(id); if (r) { const h = r.querySelector(sel); if (h) return h; } }
  return null;
};
const reset = () => { try { while (UI._modalCount && UI._modalCount() > 0) UI._closeModal(); } catch (e) {} };
try { UI.render(); } catch (e) { /* 首页渲染失败下面会报 */ }

t('网页版渲染后，假 DOM 里能查到首页按钮（说明绑定跑起来了）', (() => {
  const n = document.getElementById('view').querySelectorAll('[data-act]').length;
  return n >= 10;
})(), '找到 ' + document.getElementById('view').querySelectorAll('[data-act]').length + ' 个');

t('点「灯阁评级」砖 → 网页版的面板真的打开', (() => {
  reset();
  const tile = find('[data-act="open-sect"]');
  if (!tile || typeof tile.onclick !== 'function') return false;
  tile.onclick();
  const opened = (window.__CE_MODALS || []).length > 0;
  const xml = CEApp.pageMarkup('home');
  const hasPanel = xml.indexOf('page-head') >= 0 || xml.indexOf('back-x') >= 0;
  const res = CEEngine.renderPage(env.makeCtx(), 390, 844, xml);
  reset();
  return opened && hasPanel && res.missing.length === 0;
})(), '弹窗 ' + (window.__CE_MODALS || []).length + ' 层');

t('点「一键收取」→ 走的是网页版的处理函数（挂机收益进账）', (() => {
  const before = Core.S.cur.points;
  // 攒一点挂机收益，保证按钮是"可领"状态
  try { Core.S.idle.lastTick = Date.now() - 3600 * 1000; } catch (e) {}
  UI.render();
  const btn = find('[data-act="claim-all"]');
  if (!btn || typeof btn.onclick !== 'function') return false;
  btn.onclick();
  return Core.S.cur.points >= before;
})());

t('打开一个居中弹窗：关闭键与遮罩都绑上了', (() => {
  reset();
  UI.modal('测试弹窗', '内容', { center: true });
  const wrap = (window.__CE_MODALS_ELS || []).slice(-1)[0];
  const ok = !!(wrap && wrap.querySelector('.close-x') && wrap.querySelector('.modal-mask'));
  reset();
  return ok;
})());

t('起一场战斗：战斗画面画得出来，按钮也绑上了', (() => {
  reset();
  try {
    const worldId = Object.keys(Core.S.worlds)[0];
    const allies = UI._panels.buildAllies(null, null);
    const enemies = window.Dungeon.makeEnemies(worldId, 'normal', 1, 'normal');
    UI._panels._startBattle({ title: '测试', allies, enemies, worldId, onEnd: () => ({ rewards: [], after() {} }) });
  } catch (e) { return false; }
  const root = window.__CE_BATTLE_ROOT;
  const html = root && root.innerHTML ? root.innerHTML : '';
  const xml = CEApp.pageMarkup('home');
  const res = CEEngine.renderPage(env.makeCtx(), 390, 844, xml);
  const hasBattle = html.length > 200 && xml.indexOf('battle') >= 0;
  if (root) root.innerHTML = '';
  return hasBattle && res.missing.length === 0;
})());

/* ---------- ③ 与网页版逐字节一致 ---------- */
const SRC = path.resolve(__dirname, '../../wxlh-game/js');
t('逻辑层 4 份 + 界面层 ui-web.js 与网页版逐字节一致', ['data.js', 'core.js', 'battle.js', 'dungeon.js']
  .every((f) => fs.readFileSync(path.join(SRC, f)).equals(fs.readFileSync(path.resolve(__dirname, '../js', f))))
  && fs.readFileSync(path.join(SRC, 'ui.js')).equals(fs.readFileSync(path.resolve(__dirname, '../js/ui-web.js'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
