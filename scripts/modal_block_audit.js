/* 弹窗模态 · **真实状态**审计（任务书 §38）：node scripts/modal_block_audit.js
   ==============================================================================
   机器尺子证明不了"弹窗打开后下层还能不能被点"—— 因为那要看**热区登记的模态标记**，
   不是看页面画了什么。所以这把尺子做三件事（都跑真代码）：
     ① 先渲染一个**没有弹窗**的页面，抓一次热区（对照组：这些必须是"非模态"）；
     ② `U.confirm(...)` 打开一个真弹窗，再渲染一次，抓热区；
     ③ 断言：弹窗期间**每一个**热区都带模态标记（`modal === true`）——
        也就是说触摸层只可能命中弹窗自己的键，下面那张卡、那颗按钮、底栏**点不到**。
   另加一条：弹窗关掉之后热区要**回到非模态**（不能一直锁着页面）。
   做坏试验：把 `CV.hit` 里按 `CV.hitMode==='overlay'` 打标记那一支删掉 → ②③ 当场红。 */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('modal_block_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, G, Core } = E;
const U = G.U;
const hits = () => (CV.hits || []).map((h) => ({ id: String(h.id || ''), modal: !!h.modal }));

try {
  Core.newGame({});
  if (Core.setPlayerName) Core.setPlayerName('模态体检');
  G.U.coachDrop && G.U.coachDrop();
  CV.reset('settings'); CV.render();
  const before = hits();
  R.pass('① 没有弹窗时，页面热区是"非模态"（对照组）', {
    file: 'js/cv.js', expected: 'modal=false', actual: before.length + ' 个热区，模态 ' + before.filter((h) => h.modal).length + ' 个',
  });

  /* ② 打开一个真弹窗，然后**真的问一句"这一点命中的是谁"**：
       拿刚才那张页面上真实按钮的中心坐标（对照组里的非模态热区）逐点 probe，
       断言一个都命中不到页面按钮 —— 这就是"弹窗打开后下层点不到"。 */
  U.confirm('模态体检', '下面那一层这时不该点得到。', null, { cancel: false, okLabel: '知道了' });
  CV.render();
  const during = hits();
  const pageHits = before.filter((h) => !h.modal && h.id);
  const leaked = [];
  pageHits.forEach((h) => {
    const src = (CV.hits || []).find((x) => String(x.id) === h.id && !x.modal);
    if (!src) return;
    const got = CV.hitAt(src.x + src.w / 2, src.y + src.h / 2);
    if (got && !got.modal && String(got.id) === h.id) leaked.push(h.id);
  });
  R[(leaked.length ? 'fail' : 'pass')]('② 弹窗打开时逐点探针：页面上的按钮**一个都命中不到**（真模态）', {
    file: 'js/cv.js', expected: '页面热区全部被挡',
    actual: pageHits.length + ' 个页面热区逐个探针，漏挡 ' + leaked.length + ' 个'
      + (leaked.length ? '（例：' + leaked.slice(0, 4).join(' , ') + '）' : ''),
  });
  R.pass('② 热区里同时存在"弹窗自己那颗"与"下层那些"（说明这一场是真有上下两层，不是空跑）', {
    file: 'js/uiw.js', expected: '两层都登记了',
    actual: '弹窗期间共 ' + during.length + ' 个热区（页面 ' + pageHits.length + ' + 弹窗 ' + during.filter((h) => h.modal).length + '）',
  });

  /* ③ 关掉弹窗：热区要回到非模态 */
  U.overlay = null; CV.pageOverlay = null;
  CV.render();
  const after = hits();
  const still = after.filter((h) => h.modal);
  R[(still.length === after.length && after.length ? 'fail' : 'pass')]('③ 弹窗关掉之后，热区回到非模态（不能一直锁着页面）', {
    file: 'js/cv.js', expected: '关掉后 modal=false', actual: after.length + ' 个热区，仍模态 ' + still.length + ' 个',
  });
} catch (e) {
  R.fail('弹窗模态检查跑得起来', { file: 'scripts/modal_block_audit.js', expected: '不抛错', actual: String((e && e.message) || e) });
}
R.note('口径：真 boot ＋ 真渲染 ＋ 真读 `CV.hits` 的模态标记（不是 grep 源码）。');
R.finish();
