/* 战斗页"生命周期"审计：node scripts/battle_flow_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.90）：小游戏的战斗页是**逐帧播 + 一串定时器**的状态机，
   它的正确性不在逻辑层（Battle.run 由 test_game 管），而在**页面的进场/交接/离场**：
     · 进场：`BattleUI.run()` 要防重入（连点两下只开一场 —— 父亲大人报过"斗法台连点跳层"）
     · 交接：副本第 5 关起是**多波**（2~3 波），一波打完要**无缝**接下一波 ——
             这一步必须先放开防重入闸门，否则第 2 波直接被自己挡掉，玩家"按啥都没用只能撤离"
     · 离场：结算页点返回 / 撤离，闸门要放开，页面栈要回到上层
   这三件事 page_smoke（只渲染）和 tap_audit（只看崩不崩）都看不见，只有真跑一遍状态机才查得出。
   只读脚本：战斗引擎被换成"一帧就结束"的假结果，不碰真存档、不打真战斗。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onWindowResize() {}, onShow() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, G = global.GameGlobal, D = global.DATA;
CV.setup(global.wx.getWindowInfo());
const UI = G.BattleUI;

/* 战斗引擎换成"一帧就打完"的假结果 —— 这里考的是页面状态机，不是数值 */
G.Battle.run = function () {
  return { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] };
};

let pass = 0, fail = 0;
/* 定时器记账（V9.6.98）：离开战斗页之后**不该还有战斗的定时器在跑** ——
   以前那个 55ms 的打击特效 interval 在"撤离"那条路上没清，会继续重画最多 0.9 秒。 */
const liveTimers = new Set();
const _setTimeout = global.setTimeout, _setInterval = global.setInterval;
const _clearTimeout = global.clearTimeout, _clearInterval = global.clearInterval;
global.setTimeout = function (fn, ms) { const h = _setTimeout(function () { liveTimers.delete(h); return fn.apply(this, arguments); }, ms); liveTimers.add(h); return h; };
global.setInterval = function (fn, ms) { const h = _setInterval(fn, ms); liveTimers.add(h); return h; };
global.clearTimeout = function (h) { liveTimers.delete(h); return _clearTimeout(h); };
global.clearInterval = function (h) { liveTimers.delete(h); return _clearInterval(h); };

const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

Core.newGame();
Core.setPlayerName('战斗体检');
try { Core.choosePlayerBloodline('修真'); } catch (e) {}

const cfg = (extra) => Object.assign({
  title: '体检', allies: [], enemies: [], worldId: 'W01', maxRounds: 10,
  /* V9.6.115：这里原来写的是 `actions`（网页版的键名），小游戏的结算面板读的是 **acts** ——
     键名不对 → 面板退回默认那颗「返回」（没有 primary）→ "结算自动进下一关的倒计时"
     这条链路在尺子里根本没被走到。真调用方（sc-dungeon / sc-last）用的就是 acts。 */
  onEnd() { return { acts: [{ label: '返回', id: 'battle_close', style: 'ghost' }] }; },
}, extra || {});

console.log('\n=== 战斗页生命周期审计 ===');

(async function () {
  /* ① 防重入：连点两下只开一场 */
  UI.clear();
  const first = UI.run(cfg());
  const second = UI.run(cfg());
  t('连点两下只开一场（防重入闸门在）', first === undefined || first !== false, '第一下没被挡');
  t('第二下被挡（没有同时开两场）', second === false, '第二下返回 false');
  await wait(700);

  /* ② 无缝波次：第 5 关起是多波，交接时闸门必须先放开，否则第 2 波打不开 */
  UI.clear();
  let afterCalled = 0, busyAtHandoff = null, secondWaveOpened = null;
  UI.run(cfg({
    onEnd() {
      return {
        seamless: true, sub: '本波通过',
        after() {
          afterCalled++;
          busyAtHandoff = UI.busy();
          secondWaveOpened = UI.run(cfg());   // 下一波：这里必须打得开
        },
      };
    },
  }));
  await wait(1600);
  t('第一波打完会自动接下一波（after 被调用）', afterCalled === 1, 'after 调用 ' + afterCalled + ' 次');
  t('交接那一刻防重入闸门已放开（不然第 2 波被自己挡掉）', busyAtHandoff === false,
    '此时 busy() = ' + String(busyAtHandoff));
  t('第 2 波真的开得起来（不是卡在第 1 波）', secondWaveOpened !== false,
    '第 2 波 run() 返回 ' + String(secondWaveOpened));
  await wait(700);

  /* ③ 离场：结算页返回之后闸门要放开、页面栈要回到上层
     V9.6.125：**先把页面摆成"从副本页开打"**再开——战斗页现在会记住"从哪来"，
     不先摆好，量的就不是"回副本页"而是"回上一条用例留下的那一页"（尺子自己的前提错了）。 */
  UI.clear();
  CV.reset('dungeon');
  UI.run(cfg());
  await wait(700);
  CV.dispatch('battle_close');
  t('结算页点返回后闸门放开（还能再打下一场）', UI.busy() === false, 'busy() = ' + String(UI.busy()));
  t('返回后停在副本页（不是战斗页）', CV.top().name === 'dungeon', '当前页 ' + CV.top().name);

  /* ④ 撤离同样要放开闸门（同样先摆成"从副本页开打"） */
  UI.clear();
  CV.reset('dungeon');
  UI.run(cfg());
  await wait(700);
  CV.dispatch('battle_quit');       // 打开确认弹窗
  if (G.U && G.U.overlay && G.U.overlay.onOk) G.U.overlay.onOk();
  t('撤离后闸门放开', UI.busy() === false, 'busy() = ' + String(UI.busy()));
  await wait(60);
  t('撤离后没有战斗定时器还在跑（不白耗电、不偷偷重画）', liveTimers.size === 0,
    liveTimers.size ? liveTimers.size + ' 个定时器还活着' : '全清');
  /* ⑤ 自动战斗**已经下线**（父亲大人 2026-09-19："把自动战斗的功能去掉吧"）：
     这条尺子改成"防复活"——老存档里可能还留着 settings.autoBattle = true
     （以前开过的玩家），它**不许再对战斗产生任何影响**：有残留值时照样逐帧打。 */
  {
    const many = [{ type: 'start', allies: [], enemies: [] }];
    for (let i = 0; i < 30; i++) many.push({ type: 'round', n: i + 1 });
    many.push({ type: 'end', win: true, rounds: 30 });
    const cbg = (cb) => cfg({ onEnd() { cb(); return { acts: [{ label: '返回', id: 'battle_close' }] }; } });

    G.Battle.run = function () { return { win: true, rounds: 30, frames: many }; };
    /* 老存档的残留值：设成 true 也不该有任何"跳过战斗"的效果 */
    Core.S.settings.autoBattle = true;
    UI.clear();
    let ended = 0;
    UI.run(cbg(() => { ended++; }));
    await wait(200);
    t('⑤ 老存档残留的 autoBattle 不再能让战斗跳过（功能已下线）', ended === 0,
      '结算回调调用 ' + ended + ' 次');
    UI.clear();
    await wait(80);
    /* 源码级兜底：这两个文件里**不许再有活的 autoBattle 代码**（注释里提到可以，注释会被剥掉） */
    const strip = (rel) => fs.readFileSync(path.join(JS, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
    const live = ['sc-battle.js', 'sc-last.js'].filter((f) => /autoBattle/.test(strip(f)));
    t('⑤b 战斗页 / 设置页里已经没有「自动战斗」的活代码（只在注释里留了说明）',
      live.length === 0, live.length ? live.join(' / ') + ' 里还有' : '两处都干净');
    delete Core.S.settings.autoBattle;
    /* ⑤c 结算「自动进下一关」的倒计时起点必须是 **5 秒**（父亲人：8 → 5）。
       打一场一帧就赢的假战斗，结算面板起来之后立刻看倒计时的起手值。 */
    UI.clear();
    G.Battle.run = function () { return { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] }; };
    UI.run(cfg({ onEnd() { return { acts: [{ label: '下一关', style: 'primary', id: 'battle_close' }] }; } }));
    await wait(700);
    const st5 = UI.state;
    t('⑤c 结算自动进下一关的倒计时从 5 秒起', st5.autoIdx >= 0 && st5.autoLeft === 5,
      'autoLeft = ' + st5.autoLeft + '（8 秒时代这里是 8）');
    UI.clear();
    await wait(60);
  }
  /* ⑥ 世界守关（第 12 关）打完**不许再有"下一关"**
     （父亲大人 2026-09-19："每个世界推到第 12 关就不要有自动下一关了，只能返回，
      由玩家自己选择打下一个世界还是同一世界的下一难度"）
     这条必须走**真副本流程**才能验：从残域页 → 世界页 → 点第 12 关 → 结算面板上有什么按钮。
     顺带一个正面样本（第 11 关）确认"下一关没被一起砍掉"。 */
  {
    /* 这一段走真副本流程 —— 世界页上还挂着新手引导，而引导是"真模态"：
       它会把 `CV.dispatch('stage:11')` 吃掉（那不是它指的那颗）。
       这里只是**为了量结算按钮**，所以临时把引导系统摘掉（测完立刻装回去）。 */
    const savedCoachFor = G.coachFor;
    G.coachFor = function () {};
    const setupWorld = () => {
      Core.newGame(); Core.setPlayerName('守关体检'); Core.choosePlayerBloodline('修真');
      (D.UNLOCKS || []).forEach(u => { Core.S.unlocks[u.id] = true; });
      /* 第 1~12 关全部通关（这样第 12 关才点得动），第 2 个世界也解锁（便于看"会不会自动跳过去"） */
      Core.S.worlds.W01 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
      Core.S.worlds.W02 = { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
      Core.S.settings.autoNext = true;      // 自动进下一关是开着的 —— 更严格
    };
    /* 第 12 关是**多波**（杂兵→杂兵→守关），一波打完会自动接下一波 ——
       结算面板要等所有波次走完才出现，所以这里要**轮询等**，不能固定 sleep。 */
    const waitPanel = async (maxMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (maxMs || 9000)) {
        if (UI.state.panel) return UI.state.panel;
        await wait(120);
      }
      return UI.state.panel;
    };
    const fightStage = async (idx) => {
      UI.clear();
      CV.reset('dungeon');
      CV.dispatch('w:W01');            // 进世界页
      CV.dispatch('stage:' + idx);     // 点那一关
      return waitPanel(9000);
    };

    setupWorld();
    const p12 = await fightStage(11);  // 第 12 关（守关 Boss）
    const acts12 = (p12 && p12.acts) || [];
    /* V9.6.128：守关 Boss 那场**不再挂任何 act** —— 底部的「收下奖励并返回」已经会回世界页，
       再挂一颗「返回世界」就是同一件事两颗按钮（父亲大人："还是功能重复的按钮，你再查查"）。 */
    t('⑥ 打通第 12 关：结算页没有"下一关 / 再来一次 / 重复的返回"（只剩底部那颗）',
      acts12.length === 0 && !acts12.some(a => a.id === 'dun_next' || a.id === 'dun_again'),
      acts12.map(a => a.label).join(' / ') || '（只有底部那颗「收下奖励并返回」）');
    CV.dispatch('battle_close');
    await wait(80);
    t('⑥b 底部那颗「收下奖励并返回」把玩家送回世界页',
      ((CV.top() || {}).name || '?') === 'world', '落在了 ' + (((CV.top() || {}).name) || '?'));
    t('⑥c 结算页没有主按钮 → "自动进下一关"的倒计时不会启动',
      acts12.every(a => !a.primary && a.style !== 'primary'),
      acts12.some(a => a.primary || a.style === 'primary') ? '**还有主按钮**' : '无主按钮 ✓');
    t('⑥c 第 12 关不再自动接"下一个世界 / 下一个难度"（Core.nextStage 返回 null）',
      Core.nextStage('W01', 'normal', 11) === null,
      'nextStage(W01,normal,12关) = ' + JSON.stringify(Core.nextStage('W01', 'normal', 11)));

    setupWorld();
    const p11 = await fightStage(10);  // 第 11 关：正常流程必须**照旧**给下一关
    const acts11 = (p11 && p11.acts) || [];
    t('⑥d 第 11 关（普通关）照旧给「下一关」，没被一起砍掉',
      acts11.some(a => a.id === 'dun_next'),
      acts11.map(a => a.label).join(' / ') || '(没有按钮)');
    UI.clear();
    await wait(60);
    G.coachFor = savedCoachFor;
  }
  /* ⑦ 波次卡：**第几波要对应得上**（父亲大人 2026-09-21：
     "直接试第 12 关，每一波都是第 3/3 波，第二波第三波要对应上"）
     真因：这里 run.wave 已经 ++ 过（即将打的那一波），照抄网页版的 +2 再被上限一夹 → 每波都 3/3。
     量法：拿一段 3 波的假流程，逐波看结算回调给出的 sub；同时查"波次卡期间不画战场"。 */
  {
    const src = fs.readFileSync(path.join(JS, 'sc-dungeon.js'), 'utf8');
    t('⑦ 小游戏无缝衔接的波数用 run.wave + 1（不再照抄网页版的 +2）',
      /sub: '第 ' \+ \(run\.wave \+ 1\) \+ '\/' \+ run\.waves\.length \+ ' 波'/.test(src),
      /run\.wave \+ 2/.test(src) ? '**还写着 +2（会每波都显示最后一波）**' : '公式正确');
    const web = fs.readFileSync(path.resolve(JS, '../../wxlh-game/js/ui.js'), 'utf8');
    t('⑦b 网页版用 R.wave + 2（它的 ++ 在 afterWave 里，晚一拍）—— 两边公式天生差 1，别互抄',
      /第 \$\{Math\.min\(R\.wave \+ 2, R\.waves\.length\)\}\//.test(web), '网页版口径未变');
    const bsrc = fs.readFileSync(path.join(JS, 'sc-battle.js'), 'utf8');
    /* V9.6.128（父亲大人："波间的空屏只在上方的阵容区域中间显示就行，不要占用整个屏幕，
       下面的战斗日志和撤离加速两个按钮不要跟着闪"）：
       现在的规矩是"**只跳过阵容绘制**"——所以查两件事：
         · 阵容那一段被 `if (!B.tip) { … }` 包住（卡在时不画单位）；
         · 撤离/加速那两个按钮与战斗日志**在这个包裹之外**（照常画，不跟着闪）。 */
    const wrapAt = bsrc.indexOf('if (!B.tip) {');
    const cornerAt = bsrc.indexOf('battleCornerButtons(FIELD_BOTTOM');
    t('⑦c 波次卡期间只跳过阵容绘制（阵容那段被 if (!B.tip) 包住）',
      wrapAt > 0 && /if \(!B\.tip\) \{[\s\S]{0,40}V9\.6\.128/.test(bsrc));
    t('⑦d 撤离/加速与战斗日志在包裹之外（不跟着闪）',
      cornerAt > wrapAt && cornerAt > 0);
    t('⑦e 波次卡不再"飘过"（淡入停留淡出，位移为 0）',
      /const alpha = k < 0\.18/.test(bsrc) && !/26 \* CV\.SCALE \* k/.test(bsrc));
    t('⑦f 波次卡画在阵容区中间（用内容顶/日志上方那条复算中线）',
      /const cTop = CV\.TOP \+ 8 \* CV\.SCALE/.test(bsrc) && /const cBottom = CV\.H - CV\.safeBottom - CV\.NAV_H - LOG_H2/.test(bsrc));
  }

  /* 源码级兜底：打击特效那个 55ms 的 interval（fxT）必须也在"离场清理"里被清掉。
     运行期这条不好造（假战斗只有一帧，特效早就自己停了）——所以补一条源码断言，
     免得以后有人把 clearTimer 里那行删回去。 */
  {
    const src = fs.readFileSync(path.join(JS, 'sc-battle.js'), 'utf8');
    const clearFn = (src.match(/function clearTimer\(\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
    t('离场清理 clearTimer 里包含打击特效定时器 fxT', /clearInterval\(fxT\)/.test(clearFn),
      clearFn ? '已包含' : '**没找到 clearTimer**');
  }

  /* ⑨ 日志卡"每波往上弹"回归测试（V1.0.1 父亲大人）：
     报的是"结束一波整个日志卡往上跳，下一波又回来"。日志卡位置 = 常量反推，
     能整块顶动它的只有滚动量 —— 这里跑一场**无缝波次**，逐帧记录日志卡（每帧最后一个
     CV.card）的 top，全程必须一个像素都不动。 */
  UI.clear();
  const cardTops = [];
  const realCardFn = CV.card;
  CV.card = function (pad, top, w, h) {
    cardTops.push(Math.round(top));
    return realCardFn.apply(this, arguments);
  };
  UI.run(cfg({
    seamless: true, sub: '本波通过',
    onEnd() { return { seamless: true, sub: '本波通过', after() {} }; },
  }));
  let tickProbe = 0;
  await new Promise((res) => {
    const iv = setInterval(() => {
      CV.render();
      if (++tickProbe > 60) { clearInterval(iv); res(); }        // 覆盖整场（含波次卡那 1 秒）
    }, 25);
  });
  CV.card = realCardFn;
  const uniq = Array.from(new Set(cardTops));
  t('战斗日志卡全程不移动（每波不再往上弹）', uniq.length <= 1,
    '出现过的 top：' + uniq.slice(0, 6).join(' / ') + (uniq.length > 6 ? ' …' : '')
    + '（共 ' + cardTops.length + ' 帧）');

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;
})();
