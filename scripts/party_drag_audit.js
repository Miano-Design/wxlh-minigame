/* 队伍长按拖拽换位体检（真触摸）：node scripts/party_drag_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人："小游戏队伍拖拽换位不了" ＋ "灯阁小队前面有一个乱码"）：
   这两件事都是**看得见的手感问题**，靠"看代码觉得对"是会翻车的 ——
   上一版就是注释写着"长按拖动在 canvas 上代价大，改成点格子选伙伴"，
   结果引导和文案还在教玩家"长按抓起拖过去"，玩家一拖不动就卡死在这。
   所以这把尺子不直接调 CV.grabCfg，而是**走 CV.bindTouch 绑的真触摸回调**
   （touchstart / touchmove / touchend），一路走真实的坐标换算和命中判定，
   断言最后 Core.S.party 真的变了（或者真的没变）。

   覆盖的"事"：
     ① 长按 420ms 抓起 → 拖到别格松手 → 换位
     ② 抓起后松在空白处 → 手里还拿着（网页版同款）→ 再点目标格 → 换位
     ③ 抓起后点自己那格     → 放回原位，队伍不变
     ④ 抓起后点提示条的「取消」→ 放回原位，队伍不变
     ⑤ 按下就滑走（在翻页）  → 不抓（否则一滚列表就误抓）
     ⑥ 手里拿着人时点「返回」→ 照样退得出去（抓取不能吞掉别的点击）
     ⑦ 长按空格也能拿起 → 拖到有人格 = 把那个人换到空位
     ⑧ 主角格也是一格占用者 → 能和空位互换
     ⑨ 拖到「前排 / 后排」标签上 → 整排搬人（引导文案里明写着这条）
     ⑩ 乱码：⚔ 必须走"自绘字形"这条路（画布字体没有这个字 = 豆腐块）
   只读脚本，跑在假环境里。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
const touch = { start: [], move: [], end: [], cancel: [] };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart(fn) { touch.start.push(fn); }, onTouchMove(fn) { touch.move.push(fn); }, onTouchEnd(fn) { touch.end.push(fn); },
  onTouchCancel(fn) { touch.cancel.push(fn); },
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, U = global.GameGlobal.U, D = global.DATA;
CV.setup(global.wx.getWindowInfo());
CV.bindTouch();
(CV.NAV_TABS || []).forEach((t) => { CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); }); });

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* —— 起步：一个上满 4 人的队伍（主角 + 3 名伙伴，后排留一个空位）—— */
function fresh() {
  Core.newGame(); Core.setPlayerName('尺子'); Core.choosePlayerBloodline('修真');
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  ['C021', 'C022', 'C023'].forEach((id) => { Core.addChar(id); Core.S.chars[id].lv = 20; });
  Core.S.party = ['@player', 'C021', 'C022', 'C023', null];
  /* 引导会拦住别的点击 —— 这是设计；这把尺子测的是"没引导时能不能拖"，所以先标记看过。 */
  Core.S.coachSeen = {};
  ['tut_blk1', 'tut_blk1x', 'tut_blk2', 'tut_blk3', 'tut_blk4'].forEach((k) => { Core.S.coachSeen[k] = true; });
  U.coachClearAll();
  CV.cur = 'party';
  /* 队伍页在真实游戏里是"从首页 push 上来的"，不是栈底 —— 栈底是首页。
     不这么摆，点「返回」时 CV.pop() 会因为"栈里只有一页"而不动，
     测出来就像"返回键坏了"（第一版就是这么误报的）。 */
  CV.reset('home');
  CV.push('party');
}
const page = () => (CV.top() || {}).name;
const party = () => JSON.stringify(Core.S.party);
/* 内容坐标 → 屏幕坐标（和派发时同一套换算，别自己另发明一套） */
function scr(h) {
  return { x: h.x + h.w / 2, y: h.screen ? (h.y + h.h / 2) : (h.y - (CV.scroll || 0) + CV.TOP + 8 + h.h / 2) };
}
function slot(i) {
  return (CV.hits || []).slice().reverse().find((h) => h.id === 'poke:' + i || h.id === 'pslot:' + i) || null;
}
function hitOf(id) { return (CV.hits || []).slice().reverse().find((h) => h.id === id) || null; }
const evOf = (p) => ({ touches: [{ clientX: p.x, clientY: p.y }], changedTouches: [{ clientX: p.x, clientY: p.y }] });
/* 已知"内容坐标"的 y，换算成屏幕坐标（和 scr 同一套换算） */
const pointOf = (x, cy) => ({ x: x, y: cy - (CV.scroll || 0) + CV.TOP + 8 });
/* 「前排 / 后排」那两条标签的中点：标签条就在每排**第一格上方**一点点，
   格子顶边往上 24.5→4.5 个 SCALE 就是标签条，取中点 14.5 处。 */
function rowLabelPoint(i) {
  const s = slot(i);
  return pointOf(CV.W / 2, s.y - 14.5 * CV.SCALE);
}
const start = (p) => touch.start.forEach((fn) => fn(evOf(p)));
const move = (p) => touch.move.forEach((fn) => fn(evOf(p)));
const end = (p) => touch.end.forEach((fn) => fn(evOf(p)));
const tapAt = (p) => { start(p); end(p); };
const GRAB_WAIT = 480;      // 长按阈值 420ms + 余量
/* 抓起状态会在阵型上方多出一条提示条 —— 阵型整体往下挪，
   所以**落点的坐标必须在抓起之后再算**（第一版在抓起前算，算出来的点已经不在那一格上了）。 */
async function grabAt(i) { start(scr(slot(i))); await sleep(GRAB_WAIT); return !!CV.grab; }
const dropAt = (p) => { move(p); end(p); };

(async () => {
  /* ── ⑩ 乱码先查（和后面对齐/换位无关，但同属这一批"看得见的毛病"） ── */
  {
    const hasGlyph = typeof CV.hasGlyph === 'function' && CV.GLYPHS && !!CV.GLYPHS['⚔'];
    const stripped = (CV.plain ? CV.plain('⚔️ 灯阁小队') : '') === '⚔ 灯阁小队';
    /* 组合式 emoji（基础 emoji + 连接符 U+200D + 性别符）画布合成不了：
       不处理的话，连接符那一位就是个方块。降级成主体 emoji 才是对的。 */
    const zwj = (CV.plain ? CV.plain('🧙‍♂️') : '') === '🧙';
    t('⑩ 「⚔️」有自绘字形、变体选择符与连接符都会处理（否则画布上是豆腐块）',
      hasGlyph && stripped && zwj,
      (hasGlyph ? '自绘字形 ✓' : '✗ 没有 ⚔ 字形') + ' / ' +
      (stripped ? 'U+FE0F 已剥 ✓' : '✗ U+FE0F 没剥') + ' / ' +
      (zwj ? 'ZWJ 组合已降级 ✓' : '✗ 🧙‍♂️ 还留着连接符'));
  }

  /* ── ① 长按抓起 → 拖到别格松手 → 换位 ── */
  {
    fresh();
    const grabbed = await grabAt(1);
    const b = scr(slot(4));                 // 抓起之后才量落点（提示条把阵型推下去了）
    move(b);
    const over = CV.grab ? CV.grab.over : null;
    end(b);
    t('① 长按 1 号格 480ms 抓起，拖到 4 号格松手 → 两格换位',
      grabbed && over === 4 && Core.S.party[4] === 'C021' && Core.S.party[1] === null,
      'grab=' + (grabbed ? '1' : '无') + ' over=' + over + ' party=' + party());
  }

  /* ── ② 抓起后松在空白处：手里还拿着（网页版同款），再点目标格才放下 ── */
  {
    fresh();
    await grabAt(3);
    const a = scr(slot(3));
    const blank = { x: a.x, y: scr(hitOf('pgrab_cancel')).y };       // 提示条上＝不是任何一格
    end(blank);
    const stillHolding = !!CV.grab;
    const barShown = !!hitOf('pgrab_cancel');
    const target = scr(slot(4));            // 还拿着时，再点一下 4 号格才放下
    tapAt(target);
    t('② 抓起后松在空白处 → 手里还拿着（带提示条），再点 4 号格才放下',
      stillHolding && Core.S.party[4] === 'C023' && Core.S.party[3] === null,
      '松手后 grab=' + stillHolding + ' 提示条=' + barShown + ' party=' + party());
  }

  /* ── ③ 抓起后再点自己那格 = 放回原位 ── */
  {
    fresh();
    const before = party();
    await grabAt(2);
    end(scr(slot(2)));
    const held = !!CV.grab;
    tapAt(scr(slot(2)));
    t('③ 抓起后点自己那格 → 放回原位（队伍没被动过）',
      held && !CV.grab && party() === before, '抓起=' + held + ' party=' + party());
  }

  /* ── ④ 抓起后点提示条的「取消」= 放回原位 ── */
  {
    fresh();
    const before = party();
    await grabAt(1);
    end(scr(slot(1)));
    const btn = hitOf('pgrab_cancel');
    tapAt(btn ? scr(btn) : { x: -999, y: -999 });
    t('④ 抓起后点提示条「取消」→ 放回原位（队伍没被动过）',
      !!btn && !CV.grab && party() === before, (btn ? '' : '提示条上没找到「取消」 ') + 'party=' + party());
  }

  /* ── ⑤ 按下就滑走（在翻队伍页）= 不抓 ── */
  {
    fresh();
    const a = scr(slot(2));
    start(a);
    await sleep(120);
    move({ x: a.x, y: a.y + 60 });      // 先滑走：这是在滚页面
    await sleep(GRAB_WAIT);
    const notGrabbed = !CV.grab;
    end({ x: a.x, y: a.y + 60 });
    t('⑤ 按住后 120ms 就滑走 60px → 不算长按（不抓），也不会误换位',
      notGrabbed && party() === JSON.stringify(['@player', 'C021', 'C022', 'C023', null]),
      'grab=' + (notGrabbed ? 'null' : '误抓') + ' party=' + party());
  }

  /* ── ⑥ 手里拿着人时点「返回」：照样退得出去（抓取不能吞掉别的点击） ── */
  {
    fresh();
    await grabAt(1);
    end(scr(slot(1)));
    const held = !!CV.grab;
    const back = hitOf('party_back');
    tapAt(back ? scr(back) : { x: -999, y: -999 });
    t('⑥ 手里拿着人时点「返回」→ 照样退得出去，抓取状态被清干净',
      held && page() !== 'party' && !CV.grab, '拿着=' + held + ' 当前页=' + page());
  }

  /* ── ⑦ 长按空格也能拿起 → 拖到有人格＝把那人换到空位 ── */
  {
    fresh();
    const grabbed = await grabAt(4);
    const who = scr(slot(1));
    move(who); end(who);
    t('⑦ 长按空的 4 号格 → 拖到 1 号格：那名伙伴换到空位',
      grabbed && Core.S.party[4] === 'C021' && Core.S.party[1] === null,
      'grab=' + (grabbed ? '4' : '无') + ' party=' + party());
  }

  /* ── ⑧ 主角格也只是"一格占用者"：能和空位互换 ── */
  {
    fresh();
    const grabbed = await grabAt(0);
    const p4 = scr(slot(4));
    move(p4); end(p4);
    t('⑧ 长按主角格 → 拖到空位：主角也是一格占用者，换得过去',
      grabbed && Core.S.party[4] === '@player' && Core.S.party[0] === null,
      'grab=' + (grabbed ? '0' : '无') + ' party=' + party());
  }

  /* ── ⑨ 拖到「前排 / 后排」标签上 ＝ 整排搬人（引导文案里明写着这条） ── */
  {
    fresh();
    await grabAt(1);
    const rowBack = rowLabelPoint(2);       // 抓起之后再量那行字的位置
    move(rowBack);
    const over = CV.grab ? CV.grab.over : null;
    end(rowBack);
    t('⑨ 长按前排 1 号格 → 拖到「后排」那行字上松手＝整排搬人',
      over === 'row:back' && Core.S.party[4] === 'C021' && Core.S.party[1] === null,
      'over=' + over + ' party=' + party());
  }

  /* ── ⑨b 反向：本来就在后排的人拖到「后排」＝没得搬，队伍不变 ── */
  {
    fresh();
    await grabAt(2);
    const rowBack = rowLabelPoint(2);
    move(rowBack); end(rowBack);
    t('⑨b 后排的人拖到「后排」标签 → 提示"已经在后排了"，队伍不变',
      party() === JSON.stringify(['@player', 'C021', 'C022', 'C023', null]) && !CV.grab,
      'party=' + party());
  }

  /* ── ⑪ 引导开着的时候也必须能拖（父亲大人："还是拖拽不了"的真凶就在这里） ──
     上一版这把尺子把所有引导都标成"已看过"再测 —— 于是**恰好绕开了玩家真正所在的场景**：
     队伍页上正挂着"上阵就在这块…长按任意一格抓起、拖到别处松手"那条引导。
     引导在的时候 hitAt 只放行它自己那颗（队伍页放行的是 party_board 那块**没有动作**的锚点），
     长按拿到的是它 → from() 返回 null → 永远抓不起来。 */
  {
    fresh();
    /* 故意不清 coachSeen 之外的：这里反过来**挂上**那条队伍引导 */
    U.coach(['pslot:*', 'party_board'], '上阵就在这块：点空格把伙伴放进去。想换位置长按任意一格抓起、拖到别处松手。');
    CV.render();
    const guideOn = !!U.coachActive();
    const grabbed = await grabAt(1);
    const b = scr(slot(4));
    move(b); end(b);
    t('⑪ 挂着"长按抓起"引导时也拖得动（引导不能把拖拽一起挡掉）',
      guideOn && grabbed && Core.S.party[4] === 'C021' && Core.S.party[1] === null,
      '引导在=' + guideOn + ' 抓起=' + grabbed + ' party=' + party());
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exitCode = fail ? 1 : 0;
})();
