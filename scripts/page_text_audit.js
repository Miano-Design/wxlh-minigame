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
    /* V1.0.6：字宽模型以前是 `字数 × 7` —— 对中文**严重低估**（12px 汉字实宽 12），
       于是"假环境里的折行位置"和真机差得远：炼化台那行「配方：…（现有 基础金属 50 ·」
       在假环境里被算成"行尾挂着一个 ·"，真机上那个 `·` 明明在下一行的中间（我用真宽模型量过）。
       现在与 layout_audit / detail_audit 用**同一套模型**（中文≈字号 / 西文≈0.55 / emoji≈1.1），
       三把尺子对同一句话量出同一个宽度，不再各算各的。 */
    if (k === 'measureText') return (s) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(String(t.font || ''));
      const size = m ? +m[1] : 11;
      return { width: Array.from(String(s == null ? '' : s)).reduce((a, c) => {
        const n = c.codePointAt(0);
        return a + (n > 0x1F000 ? size * 1.1 : (n > 127 ? size : size * 0.55));
      }, 0) };
    };
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

/* ①-d V1.1.9（丙组"顺手全库扫一遍"）：**别处还有没有把内部字段名直接拼进给玩家看的字符串**。
   判据（可复核、可做坏试验）：给玩家看的字符串里出现"裸的键名拼加号"这种形状 ——
   最典型的就是旧扫荡那条 `parts.push(k + '+' + agg[k])`（`k` 是 `points`/`otherworld` 这类内部键）。
   这里扫的是**界面层源码**里的那几种形状，命中就报出来（要人工判是不是真漏给玩家看）。 */
{
  const uiFiles = fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)).concat(['uiw.js']);
  const SHAPES = [
    [/\bObject\.keys\(agg\)\.forEach/, 'Object.keys(agg) 直接拼串（旧扫荡那种）'],
    [/\bparts\.push\(k\s*\+\s*'\+'/, "parts.push(k + '+') —— 内部键名直接上屏"],
    [/\bkey\s*\+\s*'\+'\s*\+\s*/, "key + '+' + 值 —— 内部键名直接上屏"],
    /* V1.1.9（丙组 · 改坏试验补的盲区）：上面三条认的是**旧代码的变量名**（`agg` / `key` / `parts.push`）——
       把变量名一换（`byCur` / `k`）就整条溜过去了（实测：改坏版就是这么绕过静态那条、只剩动态那条红）。
       所以补一条**认形状不认名字**的：`Object.keys(X).forEach(function (k) { … k + '+' … })`
       —— 即"**拿循环变量本身当文案**"。这是内部键名漏上屏的充分指纹。
       ⚠️ 别把它放宽成 `任意名 + '+'`：`sc-bag.js` 的 `eqBrief` 就在 `.name + '+' + 数值`
       （那是**查过名的合法用法**），放宽了当场报假警。 */
    [/\bObject\s*\.\s*keys\s*\([^()]*\)\s*\.\s*forEach\s*\(\s*function\s*\(\s*([A-Za-z_$][\w$]*)\s*\)[\s\S]{0,300}?\b\1\s*\+\s*'\+'/,
      "拿循环变量本身当文案（Object.keys(X).forEach(k){ … k + '+' … }）—— 内部键名直接上屏"],
  ];
  const found = [];
  uiFiles.forEach((f) => {
    const src = fs.readFileSync(path.join(JS, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (t) => t.replace(/[^\n]/g, ' '));
    SHAPES.forEach(([re, why]) => {
      const m = re.exec(src);
      if (m) found.push(f + ':' + src.slice(0, m.index).split('\n').length + '  ' + why);
    });
  });
  if (found.length) { badText++; console.log('  ✗ 还有"内部字段名拼进屏幕文案"的形状：\n      ' + found.join('\n      ')); }
  else console.log('  全库扫一遍：没有"内部字段名直接拼进屏幕文案"的形状 ✓');
}

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
    ['codex', () => '收集进度 ' + (Core.S.codex.chars || []).length + ' / ' + D.characters.length],
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
  const ids = D.characters.slice(0, 12).map(c => c.id);          // 2026-09-27：没有 hidden 概念了
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
  /* V1.1.9（甲组 · 文案正名）：把这一轮改掉的名字**钉在尺子上**，
     免得以后哪一屏/哪段引导又写回旧口径（这三条都是"玩家一眼就看出没过脑子"的那类）。 */
  [/灯阁市集|兑换大厅/, 'V1.1.9 甲组：入口 / 屏标题 / 来源 / 引导 / 指南 / 任务里一律叫「市集」'],
  [/材料档/, 'V1.1.9 甲组：黑话，玩家可见文案改成"副本有概率掉落"'],
  [/\bT[1-5]\s*档/, 'V1.1.9 甲组：T 档是内部编号，文案改成"低阶 / 中阶 / 高阶（点名材料名）"'],
  [/W0\d\s*[~\-—]\s*W0\d/, 'V1.1.9 甲组：W 代号是内部编号，文案改成"第 1~5 张图"'],
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
     「幽都 / 魂 / 灵 / 祭司」（玄幻类型词，暂留；「幽都」与「九幽渡口 / 九幽幡」已进
     `data.js` 注释里的"待父亲大人拍板"清单，见网页版 `copy_audit` 同一张表）。 */
  [/求签|抽签|签文|占卜|算命|测字|卜卦|卦象|风水|吉凶|大吉|上吉|中吉|小吉|末吉|镇魂|缚灵|驱邪|镇宅|往生|符咒|符纸|符箓|灵符|玉符|佛珠|道袍|道冠|道衣|道观|道士|法事|香火|开光|超度|辟邪|驱魔|转世|投胎/,
    '封建迷信：求签 / 占卜 / 吉凶档位，以及宗教器物与科仪词（符咒 · 佛珠 · 道袍 · 镇魂 · 缚灵 · 驱邪 · 镇宅 · 往生）'],

  /* 2026-09-23 三轮（合规岗体检报告 R6 · 文案策划落地；父亲大人已同意）：
     **「陵墓 / 碑陵 / 碑灵 / 亡灵 / 亡魂 / 残魂 / 渡魂 / 黄泉 / 冥界 / 忘川」不再"保留"** ——
     依据是微信小游戏特别规范 **2.4.1（不得表现出恐怖的环境或场景）＋ 6.1.3（封建迷信）**，
     是明文基准条款，不依赖父亲大人的偏好。上一轮「W04/W05/W22/W29/W35 属玄幻类型词、保留不改」
     的判据**已被推翻** —— 下一轮别再翻回去（沿革见 `data.js` W04 上的注释）。
     锁的是**成词形态**（照「咒 / 符」那条的老规矩，不锁单字碎词，免得变成天天误报的尺子）。 */
  [/陵墓|碑陵|碑灵|亡灵|亡魂|残魂|渡魂|黄泉|冥界|忘川/,
    '冥界 / 陵墓语汇：小游戏特别规范 2.4.1（恐怖环境）＋ 6.1.3（封建迷信）—— 2026-09-23 合规岗体检 R6 起不再保留'],
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
    /* V1.1.1（这一条修的是**尺子自己**，不是文案）：原来的正则只认"**单行**对象"
       （`[^}]*` 不含换行），而 09-23 合规整改加的那张 `EQUIP_NAME_RENAME` 是**多行**写法，
       于是它整段没被摘掉 → 26 条"备案禁词"假警报（镇魂/驱邪/缚灵/符咒/道袍/镇宅/佛珠/往生、
       以及求签档位 大吉/上吉/中吉/小吉/末吉）。
       证据：这些词全在**迁移映射表的键**里（`'镇魂铃': '沉铃'` 这种），
       键是玩家老存档里的旧值、只在比较时用，**永远不进玩家眼睛**，而且是老档能迁过来的前提。
       现在放宽成"`*RENAME*` 常量 + 花括号配平（含多行）"，并且要求 `const` 开头 ——
       不会给真正的文案开后门（真要写禁词当显示文案，它不会长成 `const X_RENAME = {…}`）。 */
    /* 两种真实形状都要认（09-26 实测）：
       · 单行：`const SIGN_RENAME = getProxied({ '大吉': '长明', … });`
       · 多行：`const EQUIP_NAME_RENAME = getProxied({\n '镇魂铃': '沉铃', …\n });`
       —— 也就是"等号后面可能还包一层 `getProxied(`"。 */
    .replace(/\bconst\s+\w*RENAME\w*\s*=[^;]*?\{[\s\S]*?\n\s*\}[\s)]*;/g, ' ')
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
/* 背包：V1.1.2（A11 并池）之后**只剩两个标签**（道具＋材料并成一个池、装备独立），
   所以这把尺子跟着改：① 两个标签各切一次都要画出来；② **并池那一页要同时看得到
   道具与材料的名字**（这正是"并池"那条要证的事——材料不再住在自己的标签里）。 */
{
  const tabs = [['item', '道具'], ['eq', '装备']];
  tabs.forEach(([v, label]) => {
    try { CV.dispatch('bagview:' + v); } catch (e) {}
    const g = drawPage('bag');
    if (!g || !has(g, label)) { fails++; console.log('  ✗ 背包切到「' + label + '」页没画出来'); }
  });
  try { CV.dispatch('bagview:item'); } catch (e) {}
  const gm = drawPage('bag');
  if (!gm || !has(gm, (D.ITEMS.mat_t1 || {}).name)) { fails++; console.log('  ✗ 并池后「道具」页里看不到材料名（材料没并进同一个池）'); }
  try { CV.dispatch('bagview:item'); } catch (e) {}
}
expect('keji', D.KEJI.map((k) => k.name), '秘术阁（每条线）');
expect('garden', ['第 1 块'], '药园（地块）');
expect('sign', D.SIGNS.map((s) => s.tier), '点灯（灯焰档位）');

/* ---------- ③ 开机合规（2026-09-23 · 提审硬要求；V1.0.3 重写 · V1.0.6 忠告独立成弹窗） ----------
   依据《微信小游戏平台运营规范》特别规范 **2.6.2**：
     ·《健康游戏忠告》—— 游戏开始前、显著位置**全文登载**。
   上一版这一段只钉了两条：设置页有「适龄提示」、开机首屏有一行短标识。
   V1.0.3 把首屏那行主动删掉（1.5 秒一闪而过不叫显著），改成两页"必须点才放行"的合规闸；
   V1.0.5 按父亲大人的原话（"开局的适龄和版权两个弹窗可以不要，主画面可以在初次登陆选完血统
   出现，上面有个按钮写进入残域"）压成**主画面一页 ＋ 一个可点开的 2.6.1 专门页**
   （js/sc-start.js 的 gate）。V1.0.6（父亲大人 2026-09-23：「著作权不要啊，个人的没有这个，
   适龄好像到时上线小程序会自己打，这些等审核通过再说吧」，随后又改「健康游戏是独立的弹窗，
   不要跟主画面做到一起」，时机选 **C＝冷启动先弹**）：
     · 主画面只剩**两块**：品牌 ＋【进入残域】——**忠告不在这一屏上**；
     · 《健康游戏忠告》四句全文搬进 `U.healthNotice` 弹窗（uiw.js），game.js 冷启动先弹它。
   这一节是**双向**的：
     缺了就红 —— 弹窗里的忠告标题 / 四句少一句 /【进入残域】不在；
     多了也红 —— 主画面里又长出忠告、适龄徽标、著作权人那一行 / 入口、`copyright` 专门页。
   ⚠️ 保留项只有一个：设置页那张**适龄卡**（父亲大人点名留的），它的全文必须在。
   ⚠️ 空值字段**不许画出来**（本项目无版号，画「待填」比缺页更致命 —— 合规岗点名的最大风险）。
  两端同源依旧钉住：文案住在 data.js 的 COMPLIANCE 里，网页版与小游戏都从它取（谁手抄谁红）。 */
{
  const CO = D.COMPLIANCE || {};
  const AGE_FULL = CO.ageFull;
  let ageBad = 0;
  /* ① 主画面（gate）：**只有**品牌 ＋【进入残域】——忠告、适龄、著作权一个都不该在这一屏上 */
  const gGate = drawPage('gate');
  if (!gGate) { ageBad++; console.log('  ✗ 主画面（gate）渲染失败'); }
  else {
    if (!has(gGate, CO.enterLabel)) { ageBad++; console.log('  ✗ 主画面没有「' + CO.enterLabel + '」按钮'); }
    /* 查的是**画在屏上的字**（drawPage 只收 fillText 的字，源码注释里写着这些名字不算）。 */
    const gateStream = gGate.join('');
    if (gateStream.indexOf(CO.healthTitle) >= 0 || gateStream.indexOf(CO.healthAdvice[0]) >= 0) {
      ageBad++; console.log('  ✗ 主画面里还画着《健康游戏忠告》—— 它已经搬进独立弹窗了（父亲大人：不要跟主画面做到一起）');
    }
    if (AGE_FULL && has(gGate, AGE_FULL)) {
      ageBad++; console.log('  ✗ 主画面又把适龄全文画出来了 —— 那颗徽标 2026-09-23 已撤（只留设置页那张卡）');
    }
    const dropped = ['适龄提示', '著作权人', '待填'];
    dropped.forEach((w) => {
      if (has(gGate, w)) { ageBad++; console.log('  ✗ 主画面又画出了「' + w + '」—— 这一块已按父亲大人的话撤掉'); }
    });
  }
  /* ②《健康游戏忠告》独立弹窗（U.healthNotice）：四句全文 ＋ 一颗按钮，必须真的画在屏上 */
  const U = global.U;
  if (!U || typeof U.healthNotice !== 'function') {
    ageBad++; console.log('  ✗ uiw.js 里没有 U.healthNotice（忠告独立弹窗没实现）');
  } else {
    U.healthNotice(null);
    const gNotice = drawPage(CV.top().name);      // 覆盖层也在这一帧里画出来
    if (!gNotice) { ageBad++; console.log('  ✗ 忠告弹窗渲染失败'); }
    else {
      if (!has(gNotice, CO.healthTitle)) { ageBad++; console.log('  ✗ 忠告弹窗缺《' + CO.healthTitle + '》标题'); }
      CO.healthAdvice.forEach((line) => {
        if (!has(gNotice, line)) { ageBad++; console.log('  ✗ 忠告弹窗里少了这一句：' + line); }
      });
      if (!has(gNotice, '我知道了')) { ageBad++; console.log('  ✗ 忠告弹窗没有确认按钮（「我知道了」）'); }
    }
    U.overlay = null; CV.render();
  }
  /* ③ 撤掉的 copyright 专门页不许留空壳（注册了就是审核员点开一片空白） */
  if (CV.panels && CV.panels.copyright) {
    ageBad++; console.log('  ✗ copyright（2.6.1 的著作权人信息专门页）还在注册表里 —— 整页已删，别留空壳');
  }
  /* ④ V1.1.6（父亲大人 09-26 原话）：「把设置里的…**适龄、健康游戏去掉**」。
     口径**改了**（这是他的决定，不是在放宽合规）：设置页那两张卡撤掉，
     所以这里改成断言"**设置页不再画这两段**"，并且把合规的落点钉回**冷启动那个独立弹窗**：
       · 《健康游戏忠告》**全文仍在**（② 那一段逐句验的就是它，游戏开始前先弹、看完才进去）；
       · 适龄提示改成"平台启动页自己打 + MP 后台那一栏自己设"，游戏内不再出现。
     ⚠️ 这条尺子以后**不许**再加回"设置页必须有全文"——那会跟父亲大人的决定打架；
        真要恢复入口，先问，再改这里。 */
  const gSet = drawPage('settings');
  if (gSet && has(gSet, AGE_FULL)) { ageBad++; console.log('  ✗ 设置页又画出了适龄提示全文 —— 父亲大人 09-26 已点名撤掉这张卡'); }
  if (gSet && has(gSet, CO.healthAdvice[0])) { ageBad++; console.log('  ✗ 设置页又画出了《健康游戏忠告》全文 —— 忠实落在冷启动弹窗那边，这里不该再有'); }
  /* ⑤ 同一条要求的另外两块（战斗速度 / 存档槽）—— 一并盯着，免得以后被"顺手加回来"。
     V1.1.6（父亲大人 09-26）：「把设置里的**战斗速度**、**存档槽（就导出导入就行了，不要三个槽）**…去掉」。 */
  ['战斗速度', '存档槽', '适龄提示', CO.healthTitle].forEach((w) => {
    if (gSet && w && has(gSet, w)) { ageBad++; console.log('  ✗ 设置页又画出了「' + w + '」—— 父亲大人 09-26 已点名撤掉'); }
  });
  if (gSet && has(gSet, '著作权人')) { ageBad++; console.log('  ✗ 设置页还画着著作权人信息 —— 那份随主画面那颗入口一起撤了'); }
  /* ⑤ 开机顺序（V1.0.6 · C 案）：**冷启动先弹忠告**，关掉才往下走 —— 页面先落在主画面
        （弹窗背后就是它），关掉之后老档落主画面、新档落「欢迎（签契约）」；
        首页只在点过【进入残域】之后才到得了。 */
  const gameSrc = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'game.js'), 'utf8');
  /* ⚠️ 先剥注释再找位置：game.js 里那段 P0 说明（"首次安装白屏"）引用了 `CV.splash()` 与
     `CV.reset(...)` 的**字面写法**，直接 indexOf 会命中注释 → 取到一段不是代码的"第一次 reset"，
     这条断言就凭空红（本单实测踩到）。 */
  const gameCode = gameSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const bootPart = gameCode.slice(gameCode.indexOf('CV.splash('));
  /* 第一页＝主画面（弹窗背后那一层）；关掉弹窗之后那一次 reset 才是"新档 welcome / 老档 gate" */
  const firstReset = bootPart.slice(bootPart.indexOf('CV.reset('), bootPart.indexOf('CV.reset(') + 200)
    .replace(/\s+/g, ' ');
  if (!/'gate'/.test(firstReset)) {
    ageBad++; console.log('  ✗ 开机第一页不是主画面（弹窗背后那一层）：' + firstReset.slice(0, 90));
  }
  if (!/G\.U\.healthNotice|U\.healthNotice/.test(bootPart)) {
    ageBad++; console.log('  ✗ 开机没有弹《健康游戏忠告》（game.js 里没调 healthNotice）');
  }
  const afterNotice = bootPart.slice(bootPart.indexOf('function afterHealthNotice'),
    bootPart.indexOf('function afterHealthNotice') + 260).replace(/\s+/g, ' ');
  if (!/'welcome'/.test(afterNotice) || !/'gate'/.test(afterNotice)) {
    ageBad++; console.log('  ✗ 关掉忠告之后没有"新档欢迎 / 老档主画面"的分支：' + afterNotice.slice(0, 90));
  }
  const startSrc2 = fs.readFileSync(path.join(JS, 'sc-start.js'), 'utf8');
  if (!/CV\.on\('gate_enter'[\s\S]{0,160}CV\.reset\('home'\)/.test(startSrc2)) {
    ageBad++; console.log('  ✗ 【进入残域】没有接上首页（gate_enter → home）');
  }
  const splashSrc = fs.readFileSync(path.join(JS, 'sc-splash.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* 品牌首屏（1.5 秒）里不许挂任何合规文案 —— 合规那块归主画面（常驻），首屏只留品牌。 */
  if (/适龄提示|健康游戏忠告/.test(splashSrc)) {
    ageBad++; console.log('  ✗ 品牌首屏又挂上合规文案了（1.5 秒一闪而过的那条老毛病）');
  }
  /* ⑤ 两端同源：两边都从 data.js 的 COMPLIANCE 取，谁也不许手抄原文 */
  const WEB = path.resolve(JS, '../../wxlh-game');
  const webUi = fs.existsSync(path.join(WEB, 'js/ui.js')) ? fs.readFileSync(path.join(WEB, 'js/ui.js'), 'utf8') : '';
  const webMain = fs.existsSync(path.join(WEB, 'js/main.js')) ? fs.readFileSync(path.join(WEB, 'js/main.js'), 'utf8') : '';
  /* 查"那套代码还在不在"要把注释剥掉 —— 网页版 main.js 的注释里就写着「hideBoot 已删」。 */
  const webMainCode = webMain.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const webHtml = fs.existsSync(path.join(WEB, 'index.html')) ? fs.readFileSync(path.join(WEB, 'index.html'), 'utf8') : '';
  /* V1.1.11（网页版归档）：下面六条**全是查网页版**的（"两端别各抄一份"那类）。
     网页版本地已删、归档在 GitHub（commit 589bebb）→ 没有基准可比，整段 ⏭ 跳过、不计失败；
     本端（小游戏）对应的合规断言在别处照常钉着。 */
  const WEB_OK = webUi !== '' || webMain !== '' || webHtml !== '';
  if (!WEB_OK) {
    console.log('  ⏭ 网页版合规对表 6 条（网页版已归档，本条退役）');
  } else {
    if (webUi.indexOf('D.COMPLIANCE') < 0) { ageBad++; console.log('  ✗ 网页版 ui.js 没有从 D.COMPLIANCE 取合规文案（两端会各抄一份）'); }
    if (webUi.indexOf('抵制不良游戏') >= 0) { ageBad++; console.log('  ✗ 网页版 ui.js 手抄了忠告原文 —— 必须从 data.js 取'); }
    if (webMain.indexOf('UI.showMainScreen') < 0) { ageBad++; console.log('  ✗ 网页版开机没画主画面（main.js 没调 showMainScreen）'); }
    if (/hideBoot|boot-out/.test(webMainCode)) { ageBad++; console.log('  ✗ 网页版 main.js 又有"主画面自己淡出"那套（一屏文案一闪而过不叫登载）'); }
    const webBoot = webHtml.slice(webHtml.indexOf('id="boot"'), webHtml.indexOf('id="app"')).replace(/<!--[\s\S]*?-->/g, ' ');
    if (/适龄提示|健康游戏忠告/.test(webBoot)) { ageBad++; console.log('  ✗ 网页版 index.html 又手抄了合规文案（那一块由 ui.js 从 D.COMPLIANCE 画）'); }
  }
  const miniStart = fs.readFileSync(path.join(JS, 'sc-start.js'), 'utf8');
  if (miniStart.indexOf('D.COMPLIANCE') < 0) { ageBad++; console.log('  ✗ 小游戏 sc-start.js 没有从 D.COMPLIANCE 取文案'); }
  else if (miniStart.indexOf('抵制不良游戏') >= 0) { ageBad++; console.log('  ✗ 小游戏 sc-start.js 手抄了忠告原文'); }
  /* 撤掉的字段不许在数据层留孤儿（两端都从同一份 data.js 取）。 */
  const droppedFields = ['ownerFields', 'ownerTitle', 'ownerNote', 'ownerEntry', 'ageBadge']
    .filter((k) => Object.prototype.hasOwnProperty.call(CO, k));
  if (droppedFields.length) { ageBad++; console.log('  ✗ COMPLIANCE 里还留着已撤掉的字段（孤儿）：' + droppedFields.join(' / ')); }
  if (!ageBad) console.log('  主画面两端同源：忠告四句在**独立弹窗**里、主画面只剩品牌 ＋【进入残域】'
    + '（V1.1.6：适龄 / 著作权人 / 设置页那两张卡都撤干净了 —— 忠告全文只走**冷启动弹窗**这一条路）✓');
  fails += ageBad;
}

/* ================= V1.1.9（丙组 · 扫荡结算页）=================
   父亲大人截图证据：`0 次:points+710 · otherworld+20 · 🗡装备×1 · EXP+480 ·`（还横着溢出屏幕）。
   ⚠️ 这一段**必须放在文件最后**：它要 `Core.newGame()` 造自己的档 ——
      第一版插在中间，把后面那些用例的状态洗了（"并池后看不到材料名"当场变红，其实是尺子自己的顺序问题）。 */
{
  const BAD_KEYS = ['points', 'otherworld', 'mat_t', 'box_', 'equip+', ':points', 'exp:'];
  let sweepText = null, sweepErr = null;
  try {
    Core.newGame(); Core.setPlayerName('扫荡');
    (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
    Core.S.worlds.W01.stages.normal = Core.S.worlds.W01.stages.normal.map(() => 3);
    Core.S.sweep = { date: Core.dailyDate(), count: 0, bonus: 0, adBonus: 0 };
    /* **走真路径**（不是验我自己抄的一份）：世界页 → 扫荡页 → 点「扫荡 ×1」——
       这一下跑的就是 `doSweep` 本体（它自己会调 `BattleUI.showResult` 挂结算页）。
       第一版这里是"照它的口径自己拼一遍胶囊"，那验的是抄件，改坏 `doSweep` 也验不出来。 */
    if (U && U.coachDrop) U.coachDrop();
    CV.dispatch('w:W01');            // 进世界详情
    CV.dispatch('sweep_open');       // 进扫荡页
    if (U && U.coachDrop) U.coachDrop();
    CV.dispatch('sweep_1');          // ← 真扫荡一次
    sweepText = drawPage('battle');  // 结算页挂在 battle 页的 pageOverlay 上
  } catch (e) { sweepErr = e.message; }
  if (sweepErr) { fails++; console.log('  ✗ 扫荡结算页渲染抛错：' + sweepErr); }
  else if (!sweepText) { fails++; console.log('  ✗ 扫荡结算页没画出来（BattleUI.showResult 没生效？）'); }
  else {
    /* 画布上一条文字可能被**逐字画**（缺字形时一个码点一次 fillText）→ 按 y 拼回整行再查 */
    const stream = linesOf(sweepText, LAST_POS).join('|');
    const leaked = BAD_KEYS.filter((k) => stream.indexOf(k) >= 0);
    const hasCount = /扫荡\s*\d+\s*次/.test(stream);
    /* ⚠️ "货币图标"**不能用抓字来验**：`◉ / ◆` 是走**图形路径**画的（V1.0.6 的图标形状系统），
       不落 fillText —— 所以改成"必须出现带 + 的数字"（证明资源是真列出来的，不是被静默丢掉）。 */
    const hasNum = /\+\s*\d/.test(stream);
    if (leaked.length) { fails++; console.log('  ✗ 扫荡结算页漏了内部字段名：' + leaked.join(' / ') + '　← 玩家会看到"乱码"'); }
    if (!hasCount) { fails++; console.log('  ✗ 扫荡结算页没写"扫荡 N 次"（他截图里那条开头就是它）'); }
    if (!hasNum) { fails++; console.log('  ✗ 扫荡结算页没有列出任何"数量"（资源被静默丢了？）'); }
    if (!leaked.length && hasCount && hasNum) console.log('  扫荡结算页：无内部键名 · 有"扫荡 N 次" · 数量都列出来了 ✓');
  }
}

const totalBad = fails + badText + retiredHits;
console.log(`\n${totalBad === 0 ? '结论：每一页画出来的内容都对得上数据、也没有退役的旧名字 ✓'
  : `结论：有 ${totalBad} 处要修（画了但内容对不上 / 还画着退役的旧名字）`}`);
process.exit(totalBad ? 1 : 0);
