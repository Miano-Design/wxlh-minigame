/* 画布"内容真的画出来了吗"体检：node scripts/page_text_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.133，父亲大人："我的伴生体完全没显示"）：
   page_smoke 只验"render 不抛异常"，canvas_audit 只验"版式口径对得上" ——
   两把尺子都**看不见"这一页画了，但内容是空的"**。
   伴生体那次就是这么漏过去的：列表条目的形状是 {id, b, lv, soul, …}，
   代码却写成 b.name / b.elem / b.desc（b 是"条目"不是"伴生体本体"），
   于是名字和描述全是 undefined 传给 fit()/wrap() → 一个字都没画，页面看着"完全没显示"，
   而它**不抛异常**，所有现有尺子全绿。

   做法（两把子尺子）：
     ① 用"什么都开、什么都够"的档把**每一页**渲染一遍，把真正落到 fillText 的字符串抓出来，
        命中 undefined / NaN / null / [object Object] 就报错（这是"字段取错"的通用指纹）；
     ② 对**列东西的页**逐页断言"该出现的实体名 + 说明必须出现"
        （期望值**从当前数据现算**，不是手写死名单 —— 改了数据这把尺子自动跟着走）。
   只读脚本，只调 Core.newGame()，绝不碰真存档。 */
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

/* ---------- 会记账的假 ctx：凡是画出来的字都收进 TEXT ---------- */
const TEXT = [];
/* 同一次绘制的位置（V9.6.141）：V9.6.139 起，含货币符号的句子会**逐字画**，
   于是"行尾有没有挂一个 ·"这类判断不能只看单次 fillText —— 得按 y 把同一行的碎片拼回来。 */
const TXY = [];
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 7 });
    if (k === 'fillText') return (s, x, y) => { TEXT.push(String(s)); TXY.push({ x: Number(x) || 0, y: Number(y) || 0 }); };
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
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA;
CV.setup(global.wx.getWindowInfo());

/* ---------- 铺一个"什么都开、什么都够"的档 ---------- */
function openState() {
  Core.newGame();
  Core.setPlayerName('文检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  Core.S.player.level = 60;
  Core.S.player.geneLock = 3;
  Core.S.player.attrPoints = 20;
  Core.S.player.skillPoints = 20;
  ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'skillChip', 'corridor'].forEach((k) => Core.addCur(k, 9999999));
  // 伙伴：全图鉴 + 上阵 5 人（列名的地方才有东西可列）
  (D.characters || []).forEach((c) => { try { Core.addChar(c.id); } catch (e) {} });
  /* 小队：S.party 是**长度 5 的数组**（0/1 前排、2/3/4 后排），主角本人占其中一格
     —— 直接往后追加会被挤出布局（第一版这么写，"韩森"就没画出来，是尺子的错不是游戏的错）。 */
  const ids = (D.characters || []).slice(0, 4).map((c) => c.id);
  Core.S.party = ['@player'].concat(ids);
  // 伴生体：孵一批（走真接口，形状一定对）
  Core.addItem(D.BEAST_EGG_ITEM, 400);
  try { Core.hatchBeast(40); } catch (e) {}
  const owned = Object.keys(Core.S.beast.owned || {});
  if (owned.length) Core.setActiveBeast(owned[0]);
  // 法宝 / 坐骑：买几件并升几级
  ['fb01', 'fb07', 'fb17'].forEach((id) => { try { Core.buyFabao(id); } catch (e) {} });
  try { Core.wearFabao('fb01'); Core.refineFabao('fb01'); Core.refineFabao('fb01'); } catch (e) {}
  ['mt01', 'mt03'].forEach((id) => { try { Core.buyMount(id); } catch (e) {} });
  try { Core.wearMount('mt01'); Core.feedMount('mt01'); Core.feedMount('mt01'); } catch (e) {}
  // 装备 / 道具：够强化、够开箱、够看详情
  try { Core.grantEquip('W05', 'SSR'); Core.grantEquip('W05', 'SR'); Core.grantEquip('W09', 'SSR'); } catch (e) {}
  ['ticket_normal', 'ticket_adv', 'mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5', 'exp_m', 'exp_l'].forEach((k) => { try { Core.addItem(k, 50); } catch (e) {} });
  // 世界进度：全通普通（列世界 / 列关卡的页面才有内容）
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  });
}
openState();

/* ---------- 渲染一页，把画出来的字收下来 ---------- */
let LAST_POS = [];
function drawPage(name) {
  TEXT.length = 0; TXY.length = 0;
  try { CV.reset(name); } catch (e) { console.log('  [渲染报错] ' + name + ' → ' + e.message); return null; }
  LAST_POS = TXY.slice();          // 留给"按行判断"的检查用
  return TEXT.slice();
}
/* 把"逐字画"的碎片按 y 合成一行（同 y 的按 x 排好拼起来） */
function linesOf(textArr, posArr) {
  const byY = {};
  textArr.forEach((s, i) => {
    const p = posArr[i] || { x: 0, y: 0 };
    const k = Math.round(p.y);
    (byY[k] = byY[k] || []).push({ s, x: p.x });
  });
  return Object.keys(byY).map(k => byY[k].sort((a, b) => a.x - b.x).map(o => o.s).join(''))
    .filter(t => t.trim());
}
function drawWith(enterId, name) {
  /* 引导开着时 CV.dispatch 是**真模态**（只放行高亮那颗），进不去二级页。
     这里先把已登记的引导全部标成已读，再看页面内容 —— 测的是"页面对不对"，不是"引导让不让过"。 */
  for (let i = 0; i < 50 && U.coachCount && U.coachCount() > 0; i++) CV.dispatch('_coach_ok');
  try { CV.dispatch(enterId); } catch (e) {}
  return drawPage(name);
}
/* 画布上一条文字可能被"逐字画"（CV.GLYPHS 那条路，缺字形时一个码点一次 fillText），
   所以匹配要看**整页拼起来的字流**，不能只看单次 fillText。 */
const has = (arr, s) => arr.join('').indexOf(String(s)) >= 0;

console.log('\n=== ① 画出来的字里有没有"取错字段"的痕迹 ===');
const BAD = ['undefined', 'NaN', '[object Object]'];
let badText = 0;
Object.keys(CV.panels || {}).forEach((name) => {
  const got = drawPage(name);
  if (!got) { return; }
  const stream = got.join('');
  BAD.forEach((b) => {
    const hit = got.filter((t) => t.indexOf(b) >= 0);
    if (hit.length) { badText++; console.log(`  ✗ ${name} 页画出了「${b}」：${hit.slice(0, 3).join(' / ')}`); }
    else if (stream.indexOf(b) >= 0) { badText++; console.log(`  ✗ ${name} 页画出了「${b}」`); }
  });
});
if (!badText) console.log('  所有页面都没有 undefined / NaN / [object Object] ✓');

/* ①-b 残句：一行画完却"话没说完"（行尾挂着 · → + / ： 这种连接符）。
   这是"少写了半句"的通用指纹 —— V9.6.141 药园那行就是「可种「下品灵田」：◉ 800 · 」
   （产物、稀有掉落全没了）。它**不含 undefined**，所以上面那条抓不到；
   网页版那次是被"每块地必须写清收什么"那条专门验收挡住的，小游戏当时没这条。
   改成对**每一页**都扫一遍，以后任何页面少半句都会报。 */
{
  let dangling = 0;
  Object.keys(CV.panels || {}).forEach((name) => {
    /* 玩法指南 / 货币图鉴是**长段落逐字折行**的页面：折行断点会落在句子中间，
       刚好断在「执灯者 → 伙伴详情」这种箭头后面是正常的，不是"话没说完"。
       这两页排除（它们的内容是成段的说明文，没有"一行一条数据"的结构）。 */
    if (name === 'guide' || name === 'currency') return;
    const got = drawPage(name);
    if (!got) return;
    linesOf(got, LAST_POS).forEach((ln) => {
      const t = String(ln).trim();
      /* 只认「·」和「→」这两个**我们自己的连接符**：
         正文里合法折行可能刚好断在 " / " 或 "+" 后面（吉凶档位、配方写法），
         那不算残句 —— 报假警的尺子等于没有尺子。 */
      /* V1.0.1（实测确认是误报，不是画面错）：
         悬赏页那行「剩余时间 已结束　奖励 ◉ 9500 · ✦ 430 · 异界征召令×1」在**假环境里会折行**，
         于是行尾留着一个 `·` —— 而 `·` 正是我们奖励列表的合法分隔符，
         和"话没说完"的指纹（药园那次「…：◉ 800 · 」）长得一模一样，这条判据分不出。
         已用真截图确认画面完整（新的货币矢量图标也正常）。
         收紧办法：**行尾挂着 `·` 时，再看该行的 `·` 数量** ——
         奖励列表是"分隔符成对出现"（A · B）、残句是"孤零零一个"。
         孤立的 `·` 才算残句，成对的放过。 */
      const t2 = t;
      const dots = (t2.match(/·/g) || []).length;
      const isPair = dots >= 2;                      // 成对 = 奖励列表，不是残句
      if (/[·→]$/.test(t2) && !(isPair && t2.endsWith('·'))) {
        dangling++; console.log(`  ✗ ${name} 页有"话没说完"的行：${t2}`);
      }
    });
  });
  if (!dangling) console.log('  没有"行尾挂着连接符"的残句（每一页都话说完）✓');
  badText += dangling;
}

/* ①-b2 计数行：界面上写着的「N / M」必须**等于数据算出来的 N / M**
   （V9.6.145，父亲大人："再审一遍"）。
   这一条以前没人管：文案对得上、版面也不挤，但数字可能悄悄漂了 ——
   比如伴生体"已收集 3 / 12"、法宝"已得 5 / 20"、秘术阁"已修 0 / 1505"、
   图鉴"收集进度 N / 114"。这些 M 全都来自数据表，一旦表改了而界面写死，就会骗人。 */
{
  let cBad = 0;
  const KEJI_TOTAL = D.KEJI.reduce((a, k) => a + k.max, 0);
  const CASES = [
    ['beast', () => '已收集 ' + Core.beastState().count + ' / ' + D.BEASTS.length],
    ['beast', () => '我的伴生体', 0],
    ['fabao', () => '已得 ' + Core.fabaoState().own.length + ' / ' + D.FABAO.length + ' 件'],
    ['mount', () => '已驯服 ' + Core.mountState().own.length + ' / ' + D.MOUNTS.length + ' 匹'],
    ['garden', () => '已开 ' + Core.gardenPlots() + ' / ' + D.GARDEN_MAX + ' 块'],
    ['authority', () => 'Lv.' + (Core.S.auth || 0) + ' / ' + D.AUTHORITY_MAX],
    ['keji', () => '已修 ' + D.KEJI.reduce((a, k) => a + Core.kejiLv(k.id), 0) + ' / ' + KEJI_TOTAL + ' 级'],
    ['codex', () => '收集进度 ' + (Core.S.codex.chars || []).length + ' / ' + D.characters.filter(c => !c.hidden).length],
    ['realm', () => '已突破 ' + (Core.S.player.realm || 0) + ' / ' + D.REALM_STAGE_COUNT + ' 阶'],
  ];
  CASES.forEach(([page, fn]) => {
    const want = fn();
    if (want === undefined) return;
    const got = drawPage(page);
    if (!got) return;
    if (got.join('').indexOf(want) < 0) { cBad++; console.log(`  ✗ ${page} 页的计数对不上：应该有「${want}」`); }
  });
  if (!cBad) console.log('  各页的计数（N / M）都和当前数据一致 ✓');
  badText += cBad;
}

/* ①-b3 伙伴列表的**显示顺序**必须等于父亲大人定的那条规则：
   ① 上阵的排前面 ② 等级高的 ③ 稀有度高的 ④ 同稀有度看星级。
   V9.6.145：网页版有这条验收（test_ui 的"伙伴默认排序"），**小游戏没有** ——
   而"排序乱"正是父亲大人以前专门抱怨过的。这里验的是**真的画出来的顺序**
   （按 y、再按 x 读），不是"排序函数返回了什么"，所以连"排版时又被打乱"也能抓到。 */
{
  const S = Core.S;
  const ids = D.characters.filter(c => !c.hidden).slice(0, 12).map(c => c.id);
  ids.forEach(id => Core.addChar(id));
  // 造出"等级 / 星级 / 稀有度互相交错"的场面，否则排序错了也看不出来
  ids.forEach((id, i) => { const c = S.chars[id]; c.lv = (i * 7) % 40; c.star = 1 + (i % 5); });
  S.party = ['@player', ids[5], ids[10], null, null];
  /* V1.0.1：这里原来**自己又写了一套比较链** —— 而且写的是旧顺序（等级 → 稀有度）、还缺兜底键。
     父亲大人把顺序改成「上阵 → 稀有度 → 等级 → 星级」之后，代码对了、**尺子没跟上**，
     于是它报"伙伴列表的显示顺序和规则不一致" —— 那次**是尺子错了，不是页面错了**。
     排序这件事在本项目已经栽过一次（两端各写一套实现），尺子不许再当第三套：
     直接调代码里的唯一实现 G.charSortDefault。
     ⚠️ 不许写"拿不到就自己排"的静默兜底 —— 拿不到就该红，这正是下面这行的意义。 */
  const want = global.charSortDefault(ids).map(id => Core.charName(id));
  const got = drawPage('roster') || [];
  const nameAt = [];
  got.forEach((s, i) => { if (want.indexOf(String(s)) >= 0) nameAt.push({ s: String(s), p: LAST_POS[i] || { x: 0, y: 0 } }); });
  // 画布是网格：先按行（y）再按列（x）读，才是玩家眼中的顺序
  nameAt.sort((a, b) => (Math.abs(a.p.y - b.p.y) > 8 ? a.p.y - b.p.y : a.p.x - b.p.x));
  const seen = [];
  nameAt.forEach(o => { if (seen.indexOf(o.s) < 0) seen.push(o.s); });
  if (seen.length && seen.join() !== want.join()) {
    badText++;
    console.log('  ✗ 伙伴列表的显示顺序和规则不一致');
    console.log('     期望：' + want.slice(0, 6).join(' → '));
    console.log('     实际：' + seen.slice(0, 6).join(' → '));
  } else if (!seen.length) {
    badText++;
    console.log('  ✗ 伙伴列表页一个名字都没画出来（排序没法验）');
  } else {
    console.log('  伙伴列表的显示顺序 = 上阵 → 等级 → 稀有度 → 星级 ✓');
  }
}

/* ①-c 被省略号砍掉的文字（V9.6.142，父亲人："伴生体的孵化那行字被省略了……说了还没改"）。
   画布上没有 HTML 的自动折行，很多地方是 `CV.fit(text, 固定宽)` —— 文字一长就静默变成「…」，
   玩家看到的就是"话说到一半"。这次顺着这个线索把全站扫了一遍：**105 处**在丢信息
   （转生条件第三项、悬赏奖励、坐骑价格、法宝祭炼等级、建筑说明、药园收成…），已逐条改成折行。
   这条尺子从此盯着它：任何一页再出现「…」就报。
   唯一豁免：玩法指南 —— 它的正文是**成段的说明文**，里面本来就有作者写的省略号
   （"攻/生/防/速/暴击…"），而且它是逐字折行的，不算"被砍"。 */
{
  let cut = 0;
  Object.keys(CV.panels || {}).forEach((name) => {
    if (name === 'guide') return;                 // 说明文，正文自带省略号
    const got = drawPage(name);
    if (!got) return;
    linesOf(got, LAST_POS).forEach((ln) => {
      const t = String(ln);
      if (t.indexOf('…') >= 0) { cut++; console.log(`  ✗ ${name} 页有被省略号砍掉的文字：${t.slice(0, 44)}`); }
    });
  });
  if (!cut) console.log('  没有"被省略号砍掉"的文字（每一页都写全）✓');
  badText += cut;
}

console.log('\n=== ② "列东西"的页面：该出现的名字和说明必须真的画出来 ===');
/* 计数器先声明（②-0 / ②-a / ②-b 三段都要往里加，声明放后面会踩 TDZ） */
let retiredHits = 0;
/* ②-0 数字显示口径（V9.6.140，父亲大人："有些都不需要小数点，像货币就不用，直接取整数"）：
   和网页版 test_ui 里那条同一个规矩 —— 一律不带小数点，10 万以下还是精确数。 */
{
  let fmtBad = 0;
  const F = global.fmt;          // uiw.js 把 G.fmt 挂在 GameGlobal（= global）上
  if (typeof F !== 'function') { fmtBad++; console.log('  ✗ 全局 fmt 不存在（顶栏和各页都靠它）'); }
  else {
    [[0, '0'], [999, '999'], [14200, '14200'], [99999, '99999'], [100000, '10万'],
      [142000, '14万'], [900000000, '9亿']].forEach(([n, want]) => {
      const got = F(n);
      if (got !== want || got.indexOf('.') >= 0) { fmtBad++; console.log(`  ✗ fmt(${n}) = ${got}，应该是 ${want}`); }
    });
  }
  if (!fmtBad) console.log('  数字显示一律不带小数点，10 万以下还是精确数 ✓');
  retiredHits += fmtBad;
}
/* ②-0b 药园每一块地都要写清"收什么"（V9.6.141，父亲大人："药园的排版明显有问题"）。
   起因：这一行原来拼的是灵田数据里**不存在**的 `seed.desc`，于是每行都只剩
   「可种「下品灵田」：◉ 800 · 」—— 结尾挂着一个孤零零的「· 」，产物和稀有掉落全没了；
   种下去之后那行干脆是空的「收 」。网页版有这条验收，小游戏没有 —— 现在补上。 */
{
  const got = drawPage('garden') || [];
  const stream = got.join('');
  let g = 0;
  (D.GARDEN || []).forEach(kind => {
    const y = D.gardenYieldText(kind);
    if (stream.indexOf(y) < 0) { g++; console.log('  ✗ 药园没写清「' + kind.name + '」收什么：' + y); }
  });
  // 按"合成后的整行"判断行尾 —— 逐字画的碎片不算（V9.6.139 起含货币符号的句子会逐字画）
  const dangling = linesOf(got, LAST_POS).filter(t => /·\s*$/.test(String(t).trim()));
  if (dangling.length) { g++; console.log('  ✗ 药园有"行尾挂一个 ·"的残句：' + dangling.slice(0, 2).join(' / ')); }
  if (!g) console.log('  药园每块地都写清了收什么，也没有"行尾挂 ·"的残句 ✓');
  retiredHits += g;
}
/* ②-a 退役词：界面上**画出来**的旧名字（网页版那套 copy_audit 只管 HTML，画布这边的字它看不见）。
   起因（V9.6.136）：货币 8→4 之后，成长页和三条引导里还写着"血统结晶""铭刻五阶"——
   玩家一眼就能看出这版本没过脑子。这里把退役币名也盯上，和网页版同一份口径。 */
const RETIRED_TEXT = [
  [/故事点|技能芯片|血统结晶|深井徽记/, 'V9.6.134 货币 8→4：已并入 ◉ 点数 / ◆ 异界结晶'],
  [/凡体/, 'V8.1 起的第 1 阶境界不再是"凡体"'],
  [/跳过战斗/, 'V9.5.64 已删掉该按钮（战斗界面用"撤离"）'],
  [/个人房间/, '旧界面名，主角面板已并进主页最上面的主角卡'],
];
{
  let ret = 0;
  Object.keys(CV.panels || {}).forEach((name) => {
    const got = drawPage(name);
    if (!got) return;
    const stream = got.join('');
    RETIRED_TEXT.forEach(([re, why]) => {
      const m = stream.match(re);
      if (!m) return;
      /* 允许"解释式"提及：为了说明"不再有这东西"而点到名字是正常的
         （网页版 copy_audit 里同一条规矩：不存在"凡体"这种占位）。 */
      const at = stream.indexOf(m[0]);
      const around = stream.slice(Math.max(0, at - 24), at + m[0].length + 24);
      if (/不再|不存在|没有这种|没有这种|早就|以前|过去|旧版|已删|下架|不该再/.test(around)) return;
      ret++;
      console.log(`  ✗ ${name} 页还画着退役词「${m[0]}」（${why}）`);
    });
  });
  if (!ret) console.log('  每一页画出来的文字里都没有退役的旧名字 ✓');
  retiredHits = ret;
}
/* ②-b 同一个规矩，但**直接扫源码**：引导表 / 弹窗文案这类"只在特定时机才画"的字，
   靠渲染是抓不全的（实测：往引导气泡里塞一个旧币名，光渲染抓不到）。 */
{
  const SRC_FILES = fs.readdirSync(JS).filter((f) => /^(sc-.*|cv|uiw|wx-adapter)\.js$/.test(f));
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  let ret2 = 0;
  SRC_FILES.forEach((f) => {
    let text = '';
    try { text = stripComments(fs.readFileSync(path.join(JS, f), 'utf8')); } catch (e) { return; }
    RETIRED_TEXT.forEach(([re, why]) => {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(text))) {
        const around = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
        if (/不再|不存在|没有这种|早就|以前|过去|旧版|已删|下架|不该再/.test(around)) continue;
        ret2++;
        console.log(`  ✗ ${f} 的文案里还写着退役词「${m[0]}」（${why}）`);
      }
    });
  });
  if (!ret2) console.log('  源码里也没有退役的旧名字（含引导表 / 弹窗文案）✓');
  retiredHits += ret2;
}
/* ②-c 备案合规禁词（2026-09-23 · 文案策划）：与网页版 `copy_audit` 第 ⑩ 节**同一张表、同一个口径**。
   为什么小游戏这边也要有：这套东西已经被驳回过两次（2026-09-15 点名「血腥 / 恐怖」，
   2026-09-23 抓到「赌坊手气」「巢母产房 + 每一声啼哭，都有三条舌头」）——
   而画布上的字**网页版那把尺子看不见**（它只读 HTML 与 data.js 的字符串，看不见 canvas 画出来的内容）。
   两处都扫：① **画出来的**（所有已注册页面 render 一遍，抓真的落到 fillText 的字，含 sc-guide 的游历列表）；
             ② **源码**（引导表 / 弹窗文案这类"只在特定时机才画"的字，光渲染抓不全）。
   故意不锁：血量 / 血条 / 掉血这类通用术语（父亲大人已拍板不动），以及魂 / 亡 / 骸 / 骨 / 恐惧 / 诅咒
   （玄幻通用词，属第二梯队，锁了只会天天误报）。详见网页版那把尺子的注释。 */
const COMPLIANCE_TEXT = [
  [/赌|手气|押注|下注|梭哈|荷官|筹码|赔率|抽水|老虎机|博彩|彩票|翻本|庄家/,
    '赌博 / 赌场：微信小游戏明令禁止，本项目提审被点名的类目'],
  [/鬼|尸|骷髅|殡|灵异|啼哭|产房|舌头|恐怖|惊悚|吊死|自缢|绞死/,
    '恐怖：平台点名的六类之一（身体恐怖 / 灵异 / 惊悚意象都算）'],
  [/血腥|鲜血|血迹|血肉|血泊|割喉|斩首|屠戮/,
    '血腥：血字头的**画面**词（血量 / 血条这类术语不在此列）'],
  [/抽烟|香烟|吸烟|喝酒|酗酒|烈酒|毒品|吸毒|鸦片|大麻/,
    '不良诱导：烟 / 酒 / 毒'],
  [/T病毒|魔多|中土|白女巫|哭墙|猎魔人|生化危机|纳尼亚/,
   '侵权 IP / 真实场所专名：拿别人的作品名或真实宗教场所当自己的设定'],
  /* V1.0.1（文案策划 · 提审合规；创意总监《三维度审核》H1 点名"审核隐患里最硬的一条"）：
     求签 / 五档吉凶 / 占卜式签文 —— 国版游戏审核反复点名的**封建迷信**类目。
     原「求签」系统已改壳为「点灯」（权重与奖励一个字没动），这里钉住旧壳不许回来。
     ⚠️ 只锁"求签 / 签文 / 吉凶档位 / 占卜词"，**不锁「签」这个单字** ——
     「签订灯阁契约」「标签」都在正常用，按单字锁只会得到一把天天报假警的尺子。 */
  /* V1.0.1 二轮（2026-09-23 · 48 小时整改期）：**幽都（ghost）装备名那一批的词根**（与网页版
     `copy_audit` 第 ⑩ 节同一张表）。新锁的是**现实宗教 / 民俗法术的器物与科仪词** ——
     镇魂 · 缚灵 · 驱邪 · 镇宅 · 往生 · 符咒 / 符纸 / 符箓 / 灵符 / 玉符 · 佛珠 · 道袍 / 道冠 / 道衣 ·
     香火 · 开光 · 超度 · 辟邪 · 驱魔 · 转世 · 投胎。整批已换成"冷 / 旧 / 静"的中性词表
     （沉 · 静默 · 净尘 · 束纹 · 沉纹 · 旧纹 · 灰纹 · 守宅 · 轻行 · 霜晶），见 data.js 的 EQUIP_NAMES。
     ⚠️ 故意不锁：「咒 / 符」单字（诅咒 / 咒纹 / 字符串会误报）、「香」（灯烛意象与"一炷香"量词）、
     「幽都 / 黄泉 / 亡灵 / 魂 / 灵 / 祭司」（玄幻类型词，总监定案保留）。 */
  [/求签|抽签|签文|占卜|算命|测字|卜卦|卦象|风水|吉凶|大吉|上吉|中吉|小吉|末吉|镇魂|缚灵|驱邪|镇宅|往生|符咒|符纸|符箓|灵符|玉符|佛珠|道袍|道冠|道衣|道观|道士|法事|香火|开光|超度|辟邪|驱魔|转世|投胎/,
    '封建迷信：求签 / 占卜 / 吉凶档位，以及宗教器物与科仪词（符咒 · 佛珠 · 道袍 · 镇魂 · 缚灵 · 驱邪 · 镇宅 · 往生）'],
];
{
  const EXPLAIN = /不再|不存在|没有这种|早就|以前|过去|旧版|已删|下架|不该再/;
  let cmp = 0;
  /* ① 画出来的字 */
  Object.keys(CV.panels || {}).forEach((name) => {
    const got = drawPage(name);
    if (!got) return;
    const stream = got.join('');
    COMPLIANCE_TEXT.forEach(([re, why]) => {
      const m = stream.match(re);
      if (!m) return;
      const at = stream.indexOf(m[0]);
      if (EXPLAIN.test(stream.slice(Math.max(0, at - 24), at + m[0].length + 24))) return;
      cmp++;
      console.log(`  ✗ ${name} 页画着备案禁词「${m[0]}」（${why}）`);
    });
  });
  /* ② 源码（剥注释 —— 注释里必须能写"以前叫赌坊""产房那条已经改掉"这类留档说明） */
  const strip2 = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
    /* V1.0.1（文案策划 · 提审合规）：**旧值映射表**（存档迁移键）整段摘掉再扫 ——
       形如 `const SIGN_RENAME = { '大吉': '长明', … };` 的键是"玩家老存档里的旧值"，
       只在 `if (X[old]) X = 新值` 里做比较用，**永远不进玩家眼睛**；而它们必须原样留着，
       不然老档迁不过来（见 save_migrate_audit 的 old_sign_words 那条）。
       摘的只有这一种形状（`*_RENAME` / `*RENAME*` 的单行对象），别当成"给文案开后门"。 */
    .replace(/\bconst\s+\w*RENAME\w*\s*=\s*\{[^}]*\}\s*;/g, ' ');
  let cmpSrc = 0;
  fs.readdirSync(JS).filter((f) => f.endsWith('.js')).forEach((f) => {
    let text = '';
    try { text = strip2(fs.readFileSync(path.join(JS, f), 'utf8')); } catch (e) { return; }
    COMPLIANCE_TEXT.forEach(([re, why]) => {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(text))) {
        const around = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
        if (EXPLAIN.test(around)) continue;
        cmpSrc++; cmp++;
        console.log(`  ✗ ${f} 的文案里还写着备案禁词「${m[0]}」（${why}）`);
      }
    });
  });
  if (!cmp) console.log('  画出来的字与源码里都没有平台点名的禁词 ✓（赌 / 恐怖 / 血腥画面词 / 烟酒毒 / 侵权 IP / 封建迷信）');
  retiredHits += cmp;
}

let fails = 0;

function expect(page, list, label) {
  const got = drawPage(page);
  if (!got) { fails++; console.log(`  ✗ ${page} 页渲染失败`); return; }
  const missing = list.filter((s) => s && !has(got, String(s).slice(0, 8)));
  if (missing.length) {
    fails++;
    console.log(`  ✗ ${label || page}：${missing.length} 项没画出来 —— ${missing.slice(0, 3).map((m) => String(m).slice(0, 18)).join(' / ')}`);
  }
}

/* 伴生体：每一只的名字 + 说明都要在列表里（V9.6.133 就是这里漏的） */
const beasts = Core.beastState().list;
expect('beast', beasts.map((x) => x.b.name), '我的伴生体（名字）');
expect('beast', beasts.map((x) => D.beastDesc(x.b)), '我的伴生体（说明）');
expect('beast', [D.ELEMENT_ICON[beasts[0] && beasts[0].b.elem] ? beasts[0].b.elem : ''], '我的伴生体（五行）');
// 二级页：进去之后名字 / 兽魂 / 升阶都要在
if (beasts.length) {
  const g = drawWith('beast_detail:' + beasts[0].id, 'beast_detail');
  if (!g || !has(g, beasts[0].b.name) || !has(g, '兽魂') || !has(g, '当前加成')) {
    fails++; console.log('  ✗ 伴生体详情：名字 / 兽魂 / 当前加成没画全');
  }
}

/* 法宝：列表里每一件的名字 + 效果；详情页要有四块 */
const fbs = D.FABAO.filter((f) => (Core.S.fabao.own || []).indexOf(f.id) >= 0);
expect('fabao', fbs.map((f) => f.name), '法宝（名字）');
expect('fabao', fbs.map((f) => f.desc), '法宝（效果）');
if (fbs.length) {
  const g = drawWith('fabao_detail:' + fbs[0].id, 'fabao_detail');
  ['基础效果', '当前效果', '祭炼', '佩戴'].forEach((k) => {
    if (!g || !has(g, k)) { fails++; console.log('  ✗ 法宝详情缺「' + k + '」'); }
  });
}

/* 坐骑：同上 */
const mts = D.MOUNTS.filter((m) => (Core.S.mount.own || []).indexOf(m.id) >= 0);
expect('mount', mts.map((m) => m.name), '坐骑（名字）');
expect('mount', mts.map((m) => m.desc), '坐骑（效果）');
if (mts.length) {
  const g = drawWith('mount_detail:' + mts[0].id, 'mount_detail');
  ['基础效果', '喂养加成', '合计效果', '喂养'].forEach((k) => {
    if (!g || !has(g, k)) { fails++; console.log('  ✗ 坐骑详情缺「' + k + '」'); }
  });
}

/* 灯阁权限：20 级的说明 + 解锁要求都要能看到 */
expect('authority', D.AUTHORITY.slice(0, 3).map((a) => a.desc), '灯阁权限（说明）');
expect('authority', [D.authorityReq(1)], '灯阁权限（解锁要求）');

/* 执灯者 / 队伍 / 背包 / 秘术阁：列名单的页面 */
const own = Object.keys(Core.S.chars || {});
expect('roster', own.slice(0, 6).map((id) => Core.charName(id)), '执灯者（伙伴名）');
const partyIds = Object.keys(Core.S.party || {}).map((k) => Core.S.party[k]).filter(Boolean);
expect('party', partyIds.map((id) => Core.charName(id)), '队伍（上阵名）');
/* 背包默认停在「道具」页 —— 三个子页各切一次，各自的格子都得真的列出来 */
{
  const tabs = [['item', '道具'], ['mat', '材料'], ['eq', '装备']];
  tabs.forEach(([v, label]) => {
    try { CV.dispatch('bagview:' + v); } catch (e) {}
    const g = drawPage('bag');
    if (!g || !has(g, label)) { fails++; console.log('  ✗ 背包切到「' + label + '」页没画出来'); }
  });
  try { CV.dispatch('bagview:mat'); } catch (e) {}
  const gm = drawPage('bag');
  if (!gm || !has(gm, (D.ITEMS.mat_t1 || {}).name)) { fails++; console.log('  ✗ 背包材料页里看不到材料名'); }
  try { CV.dispatch('bagview:item'); } catch (e) {}
}
expect('keji', D.KEJI.map((k) => k.name), '秘术阁（每条线）');
expect('garden', ['第 1 块'], '药园（地块）');
expect('sign', D.SIGNS.map((s) => s.tier), '点灯（灯焰档位）');

const totalBad = fails + badText + retiredHits;
console.log(`\n${totalBad === 0 ? '结论：每一页画出来的内容都对得上数据、也没有退役的旧名字 ✓'
  : `结论：有 ${totalBad} 处要修（画了但内容对不上 / 还画着退役的旧名字）`}`);
process.exit(totalBad ? 1 : 0);
