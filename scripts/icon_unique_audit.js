/* 图标唯一性体检：node scripts/icon_unique_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人 2026-09-21）：
     "世界的图标好多重复的，你想办法解决，不要出现重复的图标，包括货币和道具各种各样的图标，
      就一样的东西图标可以一样，不一样的东西就不能一样，像你现在两种招募令也是一摸一样。"

   这条规矩很好自动化：**同一个图标不许被两个不同的东西用**。
   查三处命名空间（它们会同时出现在玩家眼前，所以必须放在一起比）：
     · 世界（data.js 每个世界的 ico）
     · 道具 / 材料 / 箱子（data.js 每件物品的 icon —— 以前没有这个字段，是按类型"猜"的，
       于是三张招募令全是 💉、五个经验模块全是 📘）
     · 货币（CURRENCIES 的 icon）
   🚫 唯一允许的"重复"是**同一个东西的多个写法**（比如货币图标后面那个空格），比对时先 trim。
   只读脚本。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.wx = {
  createCanvas: () => ({ width: 390, height: 844, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }), toDataURL: () => '' }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return ''; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {}, vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });
const D = global.DATA;

let pass = 0, fail = 0;
const _t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
/* V1.1.11（网页版归档）：名字以「网页版」开头的条目 —— 网页版本地已删 → ⏭ 跳过、不计失败。 */
const WB = require('./_web_basis');
const t = (name, ok, extra) => ((!WB.OK && /^网页版/.test(name)) ? WB.skip(name) : _t(name, ok, extra));

const bag = {};
const put = (icon, who) => {
  const k = String(icon == null ? '' : icon).trim();
  if (!k) return;
  (bag[k] = bag[k] || []).push(who);
};

console.log('\n=== 图标唯一性：不一样的东西不能用同一个图标 ===');

/* ① 世界：每个世界一个（父规则：按世界给，不是按主题给） */
const worldsNoIco = (D.WORLDS || []).filter((w) => !w.ico).map((w) => w.id);
t('每个世界都有自己的图标（data.js 的 ico，不是按主题共用）',
  worldsNoIco.length === 0, worldsNoIco.length ? '缺：' + worldsNoIco.join(',') : (D.WORLDS || []).length + ' 个世界都有');
(D.WORLDS || []).forEach((w) => put(w.ico, '世界:' + w.name));

/* ② 道具：每件一个（父规则：数据里显式写，不按类型猜） */
const items = Object.entries(D.ITEMS || {});
const itemsNoIco = items.filter(([, it]) => !it.icon).map(([id, it]) => (it.name || id));
t('每件道具都有自己的图标（data.js 的 icon，不再按类型猜）',
  itemsNoIco.length === 0, itemsNoIco.length ? '缺：' + itemsNoIco.join(' / ') : items.length + ' 件都有');
items.forEach(([, it]) => put(it.icon, '道具:' + it.name));

/* ③ 货币 */
(D.CURRENCIES || []).forEach((c) => put(c.icon, '货币:' + c.name));

/* ④ 撞车检查 */
const dup = Object.entries(bag).filter(([, v]) => v.length > 1);
t('没有两个不同的东西共用一个图标', dup.length === 0,
  dup.length ? dup.map(([k, v]) => k + ' ← ' + v.join(' / ')).slice(0, 6).join('；') : '共 ' + Object.keys(bag).length + ' 个图标，全部唯一');

/* ⑤ 三张招募令（父亲大人点名的那个例子）+ 五个经验模块：必须两两不同 */
const trio = ['ticket_normal', 'ticket_adv', 'ticket_lim'].map((id) => (D.ITEMS[id] || {}).icon);
t('三张招募令图标两两不同', new Set(trio).size === 3, trio.join(' / '));
const exps = ['exp_s', 'exp_m', 'exp_l', 'exp_xl', 'exp_xxl'].map((id) => (D.ITEMS[id] || {}).icon);
t('五档经验模块图标两两不同', new Set(exps).size === 5, exps.join(' '));
const mats = ['mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5'].map((id) => (D.ITEMS[id] || {}).icon);
t('五档强化材料图标两两不同', new Set(mats).size === 5, mats.join(' '));

/* ⑥ 界面侧不许再"按类型猜图标"（网页版 itemIcon 必须优先用数据里的 icon） */
{
  const web = WB.read('js/ui.js');
  t('网页版道具图标优先用数据里的 icon（按类型猜只作兜底）', /function itemIcon\(it, id\) \{\s*\n?\s*\/\*[\s\S]{0,400}?\*\/\s*\n\s*if \(it && it\.icon\) return it\.icon;/.test(web));
  t('网页版世界图标按世界取（worldIcon(w)），不再共用主题图标',
    /const worldIcon = \(w\) => \(w && w\.ico\)/.test(web) && /worldIcon\(w\)/.test(web));
}

/* ⑦ 五族形状语言（V1.0.1）——色 + 形双重编码，两边必须用同一份顶点表
   起因（AI 视觉工程师会诊）：阵营 / 世界主题只有字符串，界面只写文字，形状语言 0/5。
   这条钉住三件事：顶点表存在且 5 族齐全 / 5 个形状互不重复 / 两端都从 D.FACTION_GLYPH 取。 */
{
  const G = D.FACTION_GLYPH || {};
  const themes = ['bio', 'ghost', 'mystic', 'tech', 'god'];
  t('五族形状表齐全（bio/ghost/mystic/tech/god）', themes.every((x) => Array.isArray(G[x]) && G[x].length >= 3));
  const sig = (k) => G[k].map((p) => p.map((v) => (+v).toFixed(3)).join(',')).join(';');
  t('五个族的形状互不重复（按顶点串比对）', new Set(themes.map(sig)).size === 5);
  t('每个世界的 theme 都取得到形状', D.WORLDS.every((w) => Array.isArray(G[w.theme])));
  t('五族的形状颜色互不相同', new Set(themes.map((x) => D.worldGlyphColor(x))).size === 5);
  const web = WB.read('js/ui.js');
  const mini = fs.readFileSync(path.resolve(JS, 'sc-dungeon.js'), 'utf8');
  t('网页版族形从 D.FACTION_GLYPH 取（没另写一套形状）', /D\.FACTION_GLYPH\[theme\]/.test(web));
  t('小游戏族形从 D.FACTION_GLYPH 取（没另写一套形状）', /D\.FACTION_GLYPH\[theme\]/.test(mini));
  /* ⑧（V1.1.2 新增）角标的"看得见"这一半：
     角标亮度是按**本格格底**现算的（data.js:worldGlyphColor），所以 ①调用点必须把 worldId 传下去，
     ②36 格全量算一遍，都得 ≥3:1（WCAG 2.1 非文本对比度下限 = 基准）。
     旧口径固定 L=66%，与格底 18→50 的阶梯交叉后 **13 格不过**（最差 W31 = 1.58）——
     族形糊在格底上，"色 + 形"的双重编码只剩"色"。 */
  const lum = (hex) => {
    const h = String(hex).replace('#', '');
    const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  WB.OK ? t('两端的世界格角标都把 worldId 传下去（只传 theme 会退回旧亮度，浅格底上又糊）',
    /worldGlyphColor\(theme, worldId\)/.test(web) && /glyphSvg\(w\.theme, w\.id\)/.test(web)
    && /worldGlyphColor\(w\.theme, w\.id\)/.test(mini))
    : WB.skip('两端的世界格角标都把 worldId 传下去');
  const lowContrast = (D.WORLDS || []).filter((w) => cr(D.worldTint(w.id), D.worldGlyphColor(w.theme, w.id)) < 3);
  t('36 个世界的角标对本格底都 ≥3:1（旧口径 13 格不过）', lowContrast.length === 0,
    lowContrast.length ? lowContrast.map((w) => w.id + ' ' + cr(D.worldTint(w.id), D.worldGlyphColor(w.theme, w.id)).toFixed(2)).join(' · ')
      : '36/36 过；最差 ' + (D.WORLDS || []).map((w) => [w.id, cr(D.worldTint(w.id), D.worldGlyphColor(w.theme, w.id))])
        .sort((a, b) => a[1] - b[1])[0].map((x, i) => (i ? (+x).toFixed(2) : x)).join(' '));
}

/* ⑧ 「文本呈现型」符号必须自绘（V1.0.1 · 用血换的判据）
   起因：画布的中文字体里**没有 ⚔ / ♜**，写进去就是豆腐块（父亲大人报过两次"乱码"）。
   真判据不是"长得像不像 emoji"，而是 Unicode 的 **Emoji_Presentation**：
     · 默认 **emoji 呈现**（⭐ ⏩ ❓ ⛵ ➕ ⚡ ✨ 以及所有 🌌🌊 之类）——
       系统 emoji 字体里有它，画得出来（各平台可能彩色/黑白，但不缺字）。
     · 默认 **文本呈现**（⚔ ♜ ★ ☆ ✓ ✗ ⬆ ❖ ♂ ♀ ❥ ⚠ 🛡 🗡 ⛰ ⚗ ⛏ ⚙ ♻ ☯ ❄）——
       走**文本字体**，中文字体不覆盖 → **豆腐块**。
   所以规矩是：这一批要么在 CV.GLYPHS 里自绘，要么紧跟一个 VS16（U+FE0F）强制转成 emoji 呈现。
   两边都不是 → 报红。（这条尺子能抓住"以后往文案里随手加一个符号"的那类事故。） */
{
  const EPI = /\p{Extended_Pictographic}/u, EPR = /\p{Emoji_Presentation}/u, VS = '\uFE0F';
  /* 中文字体一定覆盖的普通符号，不是 emoji 家族的"图形"——不该逼着自绘 */
  const SAFE = new Set('↔←→↑↓↕×÷±≈≠≤≥∞※‰§¶†‡•·°′″'.split(''));
  const cvSrc = fs.readFileSync(path.join(JS, 'cv.js'), 'utf8');
  const gm = cvSrc.match(/CV\.GLYPHS = \{([\s\S]*?)\n  \};/);
  const HAVE = new Set([...(gm ? gm[1] : '').matchAll(/^    '(.+?)':/gm)].map((x) => x[1]));
  const bad = {};
  for (const f of fs.readdirSync(JS).filter((x) => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(JS, f), 'utf8');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (!EPI.test(ch) || EPR.test(ch)) continue;     // emoji 呈现型：有 emoji 字体就出
      if (HAVE.has(ch) || SAFE.has(ch)) continue;      // 已自绘 / 字体覆盖的普通符号
      if (s[i + 1] === VS) continue;                   // 已补 VS16：被强制转成 emoji 呈现
      (bad[ch] = bad[ch] || new Set()).add(f);
    }
  }
  const list = Object.entries(bad);
  t('没有"会出豆腐块的文本呈现型符号"漏网（要把它们自绘，或者补 VS16）',
    list.length === 0,
    list.map(([ch, fs2]) => ch + ' U+' + ch.codePointAt(0).toString(16).toUpperCase() + '（在 ' + [...fs2].join(',') + '）').join(' · '));
  t('自绘图标表非空且数量对得上（当前 24 个）', HAVE.size >= 24, '共 ' + HAVE.size + ' 个');
}

/* ⑨ 战斗几何两端同源（V1.0.1 · 父亲大人拍板的口径）
   起因（UI 设计师会诊）：同一样东西两端各写各的数，而且**两端各有自己的编外字号**——
   网页暴击飘字 19px（五级阶梯外第七档）、小游戏飘字一律 14px（第六档）。
   口径：**「五级阶梯唯一」优先于「以网页版为准」** → 字号收进五级，纯尺寸以网页版为准。
   落法：两端都从 `D.BATTLE_GEOM` 取（数据层一张表），这两条断言钉住"别再各写各的"。 */
{
  const mini = fs.readFileSync(path.resolve(JS, 'sc-battle.js'), 'utf8');
  const css = WB.read('css/style.css');
  t('小游戏战斗几何从 D.BATTLE_GEOM 取（头像 / 血条 / 能量条 / 飘字字号·上升·时长 六项都在）',
    ['av', 'barHp', 'barEn', 'floatBase', 'floatRise', 'floatMs'].every((k) => mini.includes('D.BATTLE_GEOM.' + k)));
  t('网页版暴击飘字不再用编外第七档（19px / 1.1875rem → 已收回一级 17px）',
    !/\.floater\.crit[^}]*1\.1875rem/.test(css));
  t('小游戏飘字不再写死 14（编外第六档）',
    !/const size = 14 \* CV\.SCALE/.test(mini));
}

/* ⑨ 「图标的时代」：最新那一档字符**一个都不许有** ＋ 老一档逐个登记（V1.1.3）
   ----------------------------------------------------------------------------------------------
   上一版（V1.1.2）是"**登记制**"：Emoji 12+ 只要在表里登记过就放行，提审前拿老机看一眼。
   登记制救不了它要救的那件事：
     · 不够新的机器上画出来是**豆腐块**（方框里一个问号），而且**尺子验不出、只有真机看得见**；
     · "提审前看一眼"是个**没有兜底的承诺** —— 通道一断（这一轮就是断的）就没人看，
       承诺过期、风险留下。这次那 5 个字符能活过一整轮，就是这么活下来的。

   本轮的判据分两档（**故意不搞成"一律 Emoji 1.0"** —— 那条线会把 🧬🧩🧪🥇 这二十几个
   2016–2018 年的常用字符一起判死，等于为了躲一个未验证的风险去删一堆在用的语义图标）：

     ① **硬线（报红）**：U+1FA70–U+1FAFF（Symbols and Pictographs Extended-A，Unicode 12.0 起）
        整个区**一处都不许有**。它的满编就是 2019 年之后新增的那一批：
        Emoji 12 要 Android 10 / iOS 13.2，Emoji 13 要 Android 11 / iOS 14.2，Emoji 14 要 Android 12 / iOS 15.4。
        上一轮那 6 个（🪐🪔🪶🪨🪞🪷）全落在这个区里 —— 所以这一条正好是它们的**归零锁**。
     ② **登记（软）**：U+1F900–U+1FA6F 里在用的字符逐个登记（Unicode 版本 ＋ 需要的系统）。
        这一档是 2016–2018 年的（Emoji 3.0–11.0），落地要求 Android 8 / iOS 11.1 上下；
        **我没有能力验证真实机型分布**（通道断，见本单回单"不确定"），所以它不进硬线，
        只登记在册、让人一眼看得到"还有哪些老字符"。

   本轮换掉的六处（数据层 6 ＋ 界面层 2）：
     W12 🪐→☄️ · W22 🪶→🚀 · W27 🪔→🌃 · tv20 🪨→🔹 · tv33 🪞→📀 · tv34 🪶→🐦
     · 点灯功能图标 🪔→🔆 · 幽魂兜底 🪞→🌚（数值 / id / 名称一个字没动）
   扫的是**两个仓的 js 全量、且先剥注释** —— 上一版的表只数了 data.js 的 `ico:` 字段，
   于是漏掉了写在界面代码里的 🪞（幽魂兜底）和 🪔（点灯）。 */
{
  const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
  const files = [];
  /* V1.1.11（网页版归档）：原来这里扫**两个仓**（网页版是当年 Emoji 12+ 的重灾区）。
     网页版本地已删 → 只扫本端；网页版若复活，把它那一份目录加回这个数组即可。 */
  [JS].concat(WB.OK ? [path.resolve(WB.WEB, 'js')] : []).forEach((dir) => {
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => files.push(path.join(dir, f)));
  });
  const banned = {}, regd = {};
  files.forEach((p) => {
    const s = stripC(fs.readFileSync(p, 'utf8'));
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (cp < 0x1F900 || cp > 0x1FAFF) continue;
      if (cp >= 0x1FA70) {
        const key = ch + ' U+' + cp.toString(16).toUpperCase();
        (banned[key] = banned[key] || new Set()).add(path.basename(p));
      } else {
        (regd[ch] = regd[ch] || new Set()).add(path.basename(p));
      }
    }
  });
  const list = Object.entries(banned);
  t('硬线：Emoji 12+ 那一档（U+1FA70–U+1FAFF）在两端一处都没有',
    list.length === 0,
    list.length ? list.map(([k, fs2]) => k + '（' + [...fs2].join(',') + '）').join(' · ')
      : '两个仓 ' + files.length + ' 个 js 文件扫完，0 处 Extended-A 字符（6 个全换掉了）');
  /* 登记表只列"确实在用的"，空登记会自己报出来 */
  const REG = {
    '🥇': 'Emoji 3.0（Unicode 9.0, 2016）· 神域兜底 · 需 Android 7 / iOS 10.2',
    '🥋': 'Emoji 3.0（Unicode 9.0, 2016）· 斗法台 · 需 Android 7 / iOS 10.2',
    '🥚': 'Emoji 3.0（Unicode 9.0, 2016）· 兽魂蛋 · 需 Android 7 / iOS 10.2',
    '🧙': 'Emoji 5.0（Unicode 10.0, 2017）· 隐士/道士 · 需 Android 8 / iOS 11.1',
    '🧘': 'Emoji 5.0（Unicode 10.0, 2017）· 闭关 · 同上',
    '🧩': 'Emoji 5.0（Unicode 10.0, 2017）· 铭刻 · 同上',
    '🧭': 'Emoji 5.0（Unicode 10.0, 2017）· 罗盘 · 同上',
    '🧪': 'Emoji 5.0（Unicode 10.0, 2017）· 实验舱 · 同上',
    '🧫': 'Emoji 5.0（Unicode 10.0, 2017）· 瘴沼 · 同上',
    '🧬': 'Emoji 5.0（Unicode 10.0, 2017）· 命格 / 铭刻（**用得最重的一个**）· 同上',
    '🧱': 'Emoji 5.0（Unicode 10.0, 2017）· 建设 · 同上',
    '🧊': 'Emoji 5.0（Unicode 10.0, 2017）· 寒潭 · 同上',
    '🧧': 'Emoji 5.0（Unicode 10.0, 2017）· 红包 · 同上',
    /* '🧍' 已随网页版一起下架（V1.1.11）：本端全仓扫不到它了 —— 登记表里留着它，
       下面那条"陈旧项"断言就会红。按事实删掉。 */
    '🧑': 'Emoji 5.0（Unicode 10.0, 2017）· 主角 · 同上',
    '🦠': 'Emoji 11（Unicode 11.0, 2018）· W01 黏液巢穴 · 需 Android 9 / iOS 12.1',
    '🦾': 'Emoji 11（Unicode 11.0, 2018）· 机械件 · 同上',
  };
  const unreg = Object.keys(regd).filter((ch) => !(ch in REG));
  const stale = Object.keys(REG).filter((ch) => !(ch in regd));
  t('软线：老一档（U+1F900–U+1FA6F）在用的字符全部登记在册（写明 Unicode 版本与需要的系统）',
    unreg.length === 0 && stale.length === 0,
    (unreg.length ? '未登记：' + unreg.join(' · ') : '')
    + (stale.length ? '｜登记表里的陈旧项：' + stale.join(' ') : (unreg.length ? '' : Object.keys(regd).length + ' 个全部在册')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '图标一对一，没有重复 ✓' : '有 ' + fail + ' 处重复/缺失 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
