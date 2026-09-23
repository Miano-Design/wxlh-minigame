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
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

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
  const web = fs.readFileSync(path.resolve(JS, '../../wxlh-game/js/ui.js'), 'utf8');
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
  const web = fs.readFileSync(path.resolve(JS, '../../wxlh-game/js/ui.js'), 'utf8');
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
  t('两端的世界格角标都把 worldId 传下去（只传 theme 会退回旧亮度，浅格底上又糊）',
    /worldGlyphColor\(theme, worldId\)/.test(web) && /glyphSvg\(w\.theme, w\.id\)/.test(web)
    && /worldGlyphColor\(w\.theme, w\.id\)/.test(mini));
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
  const css = fs.readFileSync(path.resolve(JS, '../../wxlh-game/css/style.css'), 'utf8');
  t('小游戏战斗几何从 D.BATTLE_GEOM 取（头像 / 血条 / 能量条 / 飘字字号·上升·时长 六项都在）',
    ['av', 'barHp', 'barEn', 'floatBase', 'floatRise', 'floatMs'].every((k) => mini.includes('D.BATTLE_GEOM.' + k)));
  t('网页版暴击飘字不再用编外第七档（19px / 1.1875rem → 已收回一级 17px）',
    !/\.floater\.crit[^}]*1\.1875rem/.test(css));
  t('小游戏飘字不再写死 14（编外第六档）',
    !/const size = 14 \* CV\.SCALE/.test(mini));
}

/* ⑨ 「图标的时代」白名单（V1.1.2）
   每个 emoji 都是**某一年**才进 Unicode 的 —— 系统 emoji 字体里没有它，画出来就是豆腐块。
   版本越新，画得出来的系统越少：Emoji 12（2019）要 Android 10 / iOS 13.2，
   Emoji 13（2020）要 Android 11 / iOS 14.2，Emoji 14（2021）要 Android 12 / iOS 15.4。
   规矩：**新字符一律登记**（登记＝写明它出现在哪、备选是什么、换机验证过没有），没登记的当场报红 ——
   免得下一次又有人随手加一个 🪷 进去。
   ⚠️ 登记 ≠ 免除：这 5 个（E12 ×2 · E13 ×3）提审前都要拿一台老安卓 / 老 iPhone 看一眼，
   出豆腐块就按"备选"一栏换（备选都是 Emoji 1.0 时代的字符，2015 年前的机器也有）。 */
{
  const REG = {
    '\u{1FA90}': 'Emoji 12 · W12 蚀环远征（行星环）',
    '\u{1FA94}': 'Emoji 12 · W27 长明夜行（油灯）',
    '\u{1FAB6}': 'Emoji 13 · W22 锈蚀方舟 + tv34 仙禽遗羽（羽毛）｜备选 🕊️ / 🛶',
    '\u{1FAA8}': 'Emoji 13 · tv20 灵石碎块（石头）｜备选 ⛰️ / 🔹',
    '\u{1FA9E}': 'Emoji 13 · tv33 古镜照心（镜子）｜备选 📀 / 🎐',
  };
  const src = fs.readFileSync(path.join(JS, 'data.js'), 'utf8');
  const used = new Map();
  for (const m of src.matchAll(/(?:ico|icon):\s*['"]([^'"]*)['"]/gu)) {
    for (const ch of m[1]) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x1FA70 && cp <= 0x1FAFF) used.set(ch, (used.get(ch) || 0) + 1);
    }
  }
  const unknown = [...used.keys()].filter((ch) => !(ch in REG));
  t('没有"未登记的新时代图标"（Emoji 12+ 一律登记在册，免得又混进一个豆腐块）',
    unknown.length === 0,
    unknown.length ? '未登记：' + unknown.map((c) => c + ' U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' · ')
      : [...used.entries()].map(([c, n]) => c + '×' + n).join(' ') + ' —— 全部登记在册');
  const stale = Object.keys(REG).filter((ch) => !used.has(ch));
  t('登记表没有"已经换掉的陈旧登记"', stale.length === 0,
    stale.length ? '可删：' + stale.join(' ') : '登记表和实际用法对得上');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '图标一对一，没有重复 ✓' : '有 ' + fail + ' 处重复/缺失 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
