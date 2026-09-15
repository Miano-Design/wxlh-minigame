/* 新版小游戏的无头测试：node scripts/test-ce.js
   这一版没有旧界面，所以测的重点是"每一页都用引擎画得出来、且每个元素都查得到样式"。
   查不到样式 = 那个元素整套样式都没有（引擎按默认值画 → 黑底黑字、边距全丢）。 */
const path = require('path');
const env = require(path.resolve(__dirname, 'ce-env.js'));
env.install();
const CEApp = require(path.resolve(__dirname, '../js/ce-app.js'));
const CEEngine = require(path.resolve(__dirname, '../js/ce-engine.js'));

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? ' → ' + extra : '')); } };

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

/* 逻辑层与界面层必须与网页版逐字节一致（改网页版后跑 sync-logic.js 再测） */
const fs = require('fs');
const SRC = path.resolve(__dirname, '../../wxlh-game/js');
t('逻辑层 4 份 + 界面层 ui-web.js 与网页版逐字节一致', ['data.js', 'core.js', 'battle.js', 'dungeon.js']
  .every((f) => fs.readFileSync(path.join(SRC, f)).equals(fs.readFileSync(path.resolve(__dirname, '../js', f))))
  && fs.readFileSync(path.join(SRC, 'ui.js')).equals(fs.readFileSync(path.resolve(__dirname, '../js/ui-web.js'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
