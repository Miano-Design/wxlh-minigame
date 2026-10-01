/* 用户可见文案审计（R1.3 阶段二 ②）：node scripts/audit_text.js
   **只认真画到屏幕上的字**（`CV.text` 的 fillText）——源码里的比较 / 日志 / 注释一律不算，
   所以不会把 `!== undefined`、`AUD.play('error')` 这类误杀。 */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('audit_text');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D, U, TEXT } = E;

Core.newGame(); Core.setPlayerName('文案体检');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}
const BAD = [
  { re: /\bundefined\b/, why: 'undefined 漏到界面上' },
  { re: /\bNaN\b/, why: 'NaN 漏到界面上' },
  { re: /\bnull\b/, why: 'null 漏到界面上' },
  { re: /claim_fail|document\.update|callFunction|errCode/, why: '内部错误码漏到界面上' },
  { re: /^error$/i, why: '裸 error' },
];
const pages = Object.keys(CV.panels || {});
const hits = [];
const longNotes = [];
pages.forEach((p) => {
  TEXT.length = 0;
  let err = null;
  try { CV.reset(p); CV.render(); } catch (e) { err = e; }
  if (err) { R.fail('页面渲染抛错：' + p, { file: 'js/sc-*.js', expected: '能渲染', actual: String(err.message) }); return; }
  TEXT.map((s) => String(s)).forEach((s) => {
    BAD.forEach((b) => { if (b.re.test(s)) hits.push(p + ' → 「' + s.slice(0, 40) + '」 (' + b.why + ')'); });
    if (/^[文案说明]/.test(s) === false && s.length > 64) longNotes.push(p + ' → ' + s.slice(0, 30) + '…（' + s.length + ' 字）');
  });
});
(hits.length ? R.fail : R.pass)('全部 ' + pages.length + ' 页：画到屏幕上的字里没有 undefined / NaN / null / 内部错误码', {
  file: 'js/sc-*.js', expected: '0 处', actual: hits.length ? (hits.length + ' 处：' + hits.slice(0, 5).join(' ; ')) : '0 处',
});
if (longNotes.length) R.warn('有 ' + longNotes.length + ' 行**很长的常驻文字**（任务书 §十七：常驻只留"是什么/多少钱/能不能"，细节移到详情与引导）', {
  file: 'js/sc-*.js', expected: '常驻说明尽量短', actual: longNotes.slice(0, 5).join(' ; '),
});
else R.pass('没有超长常驻文字（>64 字）');
R.finish();
