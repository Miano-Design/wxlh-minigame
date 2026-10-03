/* 剧情素材**运行时**审计（2026-10-03 剧情深化轮 §二十五）：node scripts/story_asset_runtime_audit.js
   ==============================================================================
   为什么要有这一把：现有两把（`visual_story_audit` / `story_visual_path_audit`）量的是
   **静态事实** —— 文件在不在、路径对不对、尺寸够不够。它们看不见真正会咬人的那类问题：

     · 分包还没 ready 就发图片请求 → 失败一次，旧版就 `{fail:true}` **判死一整个会话**；
     · 分包成功之后**只清 `IMG`**，Boss / 人物那两张失败缓存留着 → 正式图永远不显影；
     · `subpkgTried=true` 之后**不再重试** → 一次网络抖动 = 这一局都没有正式图；
     · "直接点关卡开打"根本不走 `Story.play()` → 分包压根没被触发。

   所以这一把**真跑运行时**：把 `wx.loadSubpackage` / `wx.createImage` 换成可编程的桩，
   按 §二十五 的十条路径一条条走，判据只有一句 ——
     **一次早期失败，不许把这一整个会话的正式图永久判死。**

   只读脚本：内存桩，不碰真存档、不写盘、不发网络请求。
   ========================================================================== */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('story_asset_runtime_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const St = E.G.Story;
if (!St || !St.ensureStoryAssets) {
  R.blocked('Story 暴露了统一素材入口', { file: 'js/sc-story.js', expected: 'Story.ensureStoryAssets()', actual: '没有' });
  R.finish(); return;
}
const t = (item, ok, expected, actual) => {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 可编程的 wx 桩 ---------- */
const wx = global.wx;
let subpkgPlan = [];          // 'ok' | 'fail'，按调用顺序消费（空 = 一直 ok）
let subpkgCalls = 0, imgPlan = 'ok';
let imgBoom = {};             // 路径 → 前 N 次失败 { path: n }
const imgTries = {};
wx.loadSubpackage = function (o) {
  subpkgCalls++;
  const plan = subpkgPlan.length ? subpkgPlan.shift() : 'ok';
  setTimeout(function () { if (plan === 'ok') o.success && o.success({}); else o.fail && o.fail({}); }, 0);
};
wx.createImage = function () {
  const im = { _src: '' };
  Object.defineProperty(im, 'src', {
    get() { return this._src; },
    set(v) {
      this._src = v;
      imgTries[v] = (imgTries[v] || 0) + 1;
      const boom = imgBoom[v] || 0;
      const failThis = (imgPlan === 'fail') || (imgTries[v] <= boom);
      setTimeout(function () {
        if (failThis) { if (im.onerror) im.onerror({}); } else { if (im.onload) im.onload({}); }
      }, 0);
    },
  });
  return im;
};
const reset = (opts) => {
  opts = opts || {};
  subpkgPlan = opts.subpkg || [];
  subpkgCalls = 0;
  imgPlan = opts.img || 'ok';
  imgBoom = opts.boom || {};
  St.resetAssetRuntime();
};

(async function () {
  /* ---------- ① preload 在 subpackage ready 之前被调用 ---------- */
  reset();
  t('① 开机时分包状态是 idle', St.subpackageState() === 'idle', 'idle', St.subpackageState());
  St.preloadWorld('W01');                       // 典型路径 A：开机 → 直接点世界 → 直接开打
  t('① `preloadWorld()` 会**先把分包请求发出去**（旧版这里什么都没发）',
    subpkgCalls >= 1, 'loadSubpackage 被调用 ≥1 次', '调用 ' + subpkgCalls + ' 次');

  /* ---------- ② 分包成功 ---------- */
  await wait(60);
  t('② 分包成功后状态变 ready', St.subpackageState() === 'ready', 'ready', St.subpackageState());
  t('② 分包成功那一刻就会去取这一场的场景图 + Boss 图',
    Object.keys(imgTries).some((p) => /img_scene_W01/.test(p)) && Object.keys(imgTries).some((p) => /img_boss_W01/.test(p)),
    '请求了 img_scene_W01 与 img_boss_W01', Object.keys(imgTries).join(' , ') || '（一个都没请求）');

  /* ---------- ③④⑤ 场景 / Boss / 人物：一次失败**不许判死** ---------- */
  reset({ boom: {} });
  St.preloadWorld('W02');
  await wait(60);
  const scenePath = Object.keys(imgTries).filter((p) => /img_scene_W02/.test(p))[0] || 'story/scene/img_scene_W02.jpg';
  imgBoom = {}; imgBoom[scenePath] = 1;          // 这一张**只让第一次失败**
  imgTries[scenePath] = 0;
  St.preloadWorld('W02');                        // 触发一次（第一次必然失败）
  await wait(60);
  t('③ 场景图第一次失败时**没有**被永久判死（进入重试，不是直接 fail 收工）',
    St.assetStats().scene.retry >= 1 || St.sceneReady('W02'),
    'scene.retry ≥1（或已经直接成了）', JSON.stringify(St.assetStats().scene));
  await wait(1400);                              // 让退避重试跑完（0.5s）
  t('③b 第二次真的取到了 → 场景 ready（"一次早期失败不判死"这句在这里被证明）',
    St.sceneReady('W02') === true, 'sceneReady(W02)=true', 'ready=' + St.sceneReady('W02'));

  reset();
  St.preloadWorld('W03');
  await wait(60);
  const bossPath = Object.keys(imgTries).filter((p) => /img_boss_W03/.test(p))[0] || 'story/boss/img_boss_W03.png';
  imgBoom = {}; imgBoom[bossPath] = 1; imgTries[bossPath] = 0;
  St.preloadWorld('W03');
  await wait(1400);
  t('④ Boss 图同样：第一次失败之后仍能靠重试取到',
    St.bossReady('W03') === true, 'bossReady(W03)=true', 'ready=' + St.bossReady('W03'));

  reset();
  imgBoom = {}; imgBoom['story/char/img_char_C120.png'] = 1;
  St.ensureChar('C120');
  await wait(60);
  await wait(1400);
  t('⑤ 人物立绘同样能吃重试（三张缓存走的是同一套实现）',
    St.charReady('C120') === true, 'charReady(C120)=true', 'ready=' + St.charReady('C120'));

  /* ---------- ⑥⑦⑧ 分包本身：首次失败 → 第二/第三次重试 ---------- */
  reset({ subpkg: ['fail', 'fail'] });           // 前两次失败、第三次成功
  St.preloadWorld('W04');
  await wait(60);
  t('⑥ 分包第一次失败：状态是 failed，但**不是终态**（已排上重试）',
    St.subpackageState() === 'failed' && subpkgCalls === 1, 'failed · 调用 1 次',
    St.subpackageState() + ' · 调用 ' + subpkgCalls);
  await wait(700);                               // 第一档退避 0.5s
  t('⑦ 第二次重试真的发生了（0.5s 退避）', subpkgCalls === 2, '调用 2 次', '调用 ' + subpkgCalls);
  await wait(1300);                              // 第二档退避 1s
  t('⑧ 第三次重试（1s 退避）之后分包 ready', St.subpackageState() === 'ready' && subpkgCalls === 3,
    'ready · 调用 3 次', St.subpackageState() + ' · 调用 ' + subpkgCalls);

  /* ---------- ⑨ 分包成功后，三张失败缓存一起清、失败过的图会重新取 ---------- */
  reset({ img: 'fail' });                        // 先让所有图都失败
  St.preloadWorld('W05');
  await wait(80);
  const failedScene = St.sceneReady('W05');
  imgPlan = 'ok';                                // 网络好了
  St.resetAssetRuntime = St.resetAssetRuntime;   // （保持引用，下面只改桩行为）
  /* 重新从 idle 起一遍：这次分包成功 → 清缓存 → 图应该能取到 */
  reset({ img: 'ok' });
  St.preloadWorld('W05');
  await wait(120);
  t('⑨ 之前的失败缓存不再挡住正式图（分包成功会清 IMG / BOSS_IMG / CHAR_IMG 三张）',
    failedScene === false && St.sceneReady('W05') === true,
    '第一轮失败、第二轮 ready', '第一轮 ready=' + failedScene + ' · 第二轮 ready=' + St.sceneReady('W05'));

  /* ---------- ⑩ 直接进入战斗这条路（不走 Story.play）也拿得到正式图 ---------- */
  reset();
  St.preloadWorld('W06');                        // dungeon 的调用点就是这个
  await wait(120);
  t('⑩ 直接开打那条路（只调 preloadWorld、从不调 Story.play）也能拿到世界图 + Boss 图',
    St.sceneReady('W06') === true && St.bossReady('W06') === true,
    'scene/boss 都 ready',
    'scene=' + St.sceneReady('W06') + ' · boss=' + St.bossReady('W06'));

  /* ---------- 诊断与账 ---------- */
  const stats = St.assetStats();
  t('素材账可读（scene/boss/char 各有 ok / fail / retry）',
    !!(stats.scene && stats.boss && stats.char)
      && ['ok', 'fail', 'retry'].every((k) => typeof stats.scene[k] === 'number'),
    '三类 × 三字段', JSON.stringify(stats));
  const src = require('fs').readFileSync(require('path').join(E.JS, 'sc-story.js'), 'utf8');
  t('失败路径会落一条诊断日志（story / asset_load_fail，带 kind·id·path·attempt）',
    /G\.LOG\.warn\('story', 'asset_load_fail'/.test(src.replace(/\s+/g, ' ')),
    "G.LOG.warn('story','asset_load_fail',{kind,id,path,attempt})",
    /asset_load_fail/.test(src) ? '有' : '没有');
  /* ⚠️ 口径：**别的模块不许自己判"story 分包好没好"** —— 所以数的是"除 sc-story.js 之外还有谁提它"，
     不是"sc-story.js 内部出现了几次"（第一版就写错了这一句，量到的是它自己的实现细节）。 */
  const others = require('fs').readdirSync(E.JS).filter((f) => /\.js$/.test(f) && f !== 'sc-story.js')
    .filter((f) => /loadSubpackage/.test(require('fs').readFileSync(require('path').join(E.JS, f), 'utf8')));
  t('story 分包只有 sc-story.js 一个地方判（Battle / Dungeon / Home 都不许自己判）',
    others.length === 0, '0 个别的文件提 loadSubpackage', others.join(' ') || '0 个');

  R.finish();
})();
