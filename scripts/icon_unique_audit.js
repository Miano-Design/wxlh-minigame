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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '图标一对一，没有重复 ✓' : '有 ' + fail + ' 处重复/缺失 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
