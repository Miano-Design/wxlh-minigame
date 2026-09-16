/* 产品体检（可用性 / 死路 / 假按钮）：node scripts/product_audit.js

   它把一个玩家真会遇到的坑当成测试项：
   ① 每个界面画出来的字里有没有 undefined / NaN / [object Object]（模板漏字段的第一现场）；
   ② 每个 data-* 开关（按钮）到底有没有人接——没人接的就是"按了没反应"；
   ③ 每个 data-act 动作名在 runAct 里有没有分支；
   ④ 空按钮（没有文字也没有图标的按钮 = 玩家不知道该点什么）。

   只读，不改东西。改完界面跑一下，绿了就说明没有假按钮。 */
const fs = require('fs');
const store = {};
global.window = global;
const winListeners = {};
global.addEventListener = (n, fn) => { (winListeners[n] = winListeners[n] || []).push(fn); };
global.removeEventListener = () => {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
function El(tag) {
  const el = {
    tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html || ''; },
    textContent: '', value: '', disabled: false, scrollTop: 0, scrollHeight: 0, offsetWidth: 0,
    appendChild(c) { this.children.push(c); return c; }, remove() {},
    querySelector(sel) { this._qs = this._qs || {}; return this._qs[sel] || (this._qs[sel] = El('stub:' + sel)); },
    querySelectorAll() { return []; }, addEventListener() {}, focus() {}, click() {},
    get firstChild() { return this.children[0] || null; },
  };
  return el;
}
const byId = {};
global.document = {
  readyState: 'complete',
  getElementById(id) { return byId[id] || (byId[id] = El('div#' + id)); },
  createElement(t) { return El(t); },
  addEventListener() {}, querySelector: () => null, hidden: false, elementFromPoint: () => null,
};
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js', 'js/main.js']) eval(fs.readFileSync(f, 'utf8'));
const UI = window.UI, Core = window.Core, D = window.DATA;
const uiSrc = fs.readFileSync('js/ui.js', 'utf8');

/* 一份"什么都解锁了"的存档：这样每个面板都会真的画出内容，而不是空壳 */
Core.newGame(); Core.setPlayerName('产品体检'); Core.choosePlayerBloodline('修真');
Core.S.player.level = 30; Core.S.player.geneLock = 3; Core.S.player.reincarnations = 2;
Core.S.player.attrPoints = 8; Core.S.player.skillPoints = 4;
Core.S.auth = 4;
['C021', 'C022', 'C023', 'C024', 'C025'].forEach(id => { try { Core.addChar(id); } catch (e) {} });
try { Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024']; } catch (e) {}
Object.keys(Core.S.unlocks).forEach(k => { Core.S.unlocks[k] = true; });
D.UNLOCKS.forEach(u => { Core.S.unlocks[u.id] = true; });
// 给一份"已经打到 W03 全通"的进度：扫荡、深井、世界详情这些面板才有内容可画
['W01', 'W02', 'W03'].forEach(w => {
  Core.S.worlds[w] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(2), hell: Array(12).fill(0) } };
});
Core.S.corridor = { floor: 12, best: 12 };
Core.S.arena = { floor: 8, best: 8, date: '', used: 1 };
Core.S.quests = { claimed: [], progress: {} };
Core.S.cur = { points: 500000, story: 5000, otherworld: 5000, holy: 500, skillChip: 5000, bloodCrystal: 500, corridor: 500, rp: 300 };
['exp_s', 'box_r', 'ticket_normal', 'serum_sr_atk'].forEach(k => { Core.S.items[k] = 5; });
try { Core.grantEquip('W05', 'SR'); } catch (e) {}

// 注意：`\b` 在 `[object Object]` 前面永远不成立（`[` 不是词字符），
// 所以这里不能只写 \b(...)——那样会漏掉最常见的那个洞（V9.5.66 修）。
const HOLE = /(undefined|NaN|\[object Object\])/g;
let bad = 0;
const problems = [];
const htmls = [];
function render(label, fn) {
  let html = '';
  try {
    /* 面板函数有两种返回：主界面返回 HTML 字符串，弹窗把 HTML 画进一个容器再返回那个容器。
       以前直接 .toString() 容器对象，于是每个弹窗都被判成"[object Object]"——
       是**体检脚本自己的**假警报（真要是这样，界面早就白屏了）。 */
    const out = fn();
    html = typeof out === 'string' ? out : (out && typeof out.innerHTML === 'string' ? out.innerHTML : '');
  } catch (e) { problems.push(`✗ ${label} 抛异常：${e.message}`); return; }
  if (typeof html !== 'string' || !html) { problems.push(`✗ ${label} 画出来是空的`); return; }
  htmls.push([label, html]);
  const hit = html.match(HOLE);
  if (hit) {
    const i = html.search(HOLE);
    const ctx = html.slice(Math.max(0, i - 80), i + 40).replace(/\s+/g, ' ').trim();
    problems.push(`✗ ${label} 里有 ${[...new Set(hit)].join(' / ')} ×${hit.length}  …${ctx}…`);
    bad++;
  }
}

console.log('=== ① 每个界面画出来有没有洞（undefined / NaN / [object Object]）===');
const P = UI._panels;
const screens = P._screens;
Object.entries(screens).forEach(([k, fn]) => render('页签 ' + k, fn));
['protagonistDetail', 'charDetail', 'bagModal', 'currencyModal', 'guideModal', 'settingsModal', 'shopModal',
  'tasksModal', 'sweepModal', 'recruitModal', 'reincarnModal', 'geneLockModal', 'idleLinesModal', 'bountyModal',
  'realmModal', 'beastModal', 'recruitRatesModal', 'authorityModal', 'sectModal', 'kejiModal', 'travelModal',
  'gardenModal', 'arenaModal', 'fabaoModal', 'mountModal', 'signModal', 'stalkBar'].forEach(k => {
  const fn = P[k] || UI[k];
  if (typeof fn !== 'function') return;
  render('面板 ' + k, () => {
  const args = k === 'charDetail' ? ['C021'] : k === 'sweepModal' ? ['W01', 'normal'] : k === 'shopModal' ? ['god'] : k === 'tasksModal' ? ['daily'] : k === 'currencyModal' ? ['holy'] : [];
    return fn.apply(null, args);
  });
});
render('道具详情', () => P.itemDetail('exp_s'));
// 装备详情画在"传进来的那一层"上（弹窗形态），所以得给一个容器桩
render('装备详情', () => { const box = El('div'); P.equipDetail(Object.keys(Core.S.equips)[0] || 'x', box); return box.innerHTML || '<已画到容器>'; });
console.log(problems.length ? problems.join('\n') : '  全部界面无空洞 ✓');

console.log('\n=== ② 画出来的按钮有没有人接（没人接 = 按了没反应）===');
const allHtml = htmls.map(([, h]) => h).join('\n');
const attrs = [...new Set((allHtml.match(/data-[a-z][a-z0-9-]*/g) || []))];
/* 一个开关可以被三种写法消费，三种都要认，否则会把"其实接了线"的按钮报成假按钮：
   querySelector('[data-x]') / el.dataset.x / el.dataset.xY（data-x-y 的驼峰写法） */
const camel = s => s.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
// data-act/data-close/data-back 由通用分发器处理；
// data-sec 这类是"页面里的地标"（引导要高亮哪一段），不是按钮，不算假开关
const ALWAYS = ['data-act', 'data-close', 'data-back', 'data-sec', 'data-card', 'data-line'];
const orphans = [];
attrs.forEach(a => {
  if (ALWAYS.includes(a)) return;
  const key = a.replace(/^data-/, '');
  const has = uiSrc.includes('[' + a + ']')
    || uiSrc.includes('dataset.' + key) || uiSrc.includes('dataset.' + camel(key))
    || uiSrc.includes('dataset["' + camel(key) + '"]') || uiSrc.includes("dataset['" + camel(key) + "']");
  if (!has) orphans.push(a);
});
console.log(orphans.length ? '  ✗ 没人接的开关：' + orphans.join(' ') : '  所有开关都有接线 ✓');

console.log('\n=== ③ data-act 动作名有没有分支 ===');
const actsUsed = [...new Set((allHtml.match(/data-act="([a-z0-9-]+)"/g) || []).map(s => s.replace(/.*="/, '').replace('"', '')))];
const actsDone = new Set((uiSrc.match(/case '[a-z0-9-]+':/g) || []).map(s => s.replace(/case '|':/g, '')));
const missing = actsUsed.filter(a => !actsDone.has(a));
console.log(missing.length ? '  ✗ 没有分支的动作：' + missing.join(' ') : `  ${actsUsed.length} 个动作名全部有分支 ✓`);

console.log('\n=== ④ 空按钮（没有文字也没有图标）===');
const empties = [];
htmls.forEach(([label, h]) => {
  const btns = h.match(/<button[^>]*>([\s\S]*?)<\/button>/g) || [];
  btns.forEach(b => {
    const text = b.replace(/<[^>]*>/g, '').replace(/[‹›✓×+]/g, '').trim();
    // 图标按钮（内联 SVG / <i class>）没有文字是正常的，别当成空按钮
    const hasIcon = /[\u{1F300}-\u{1FAFF}🧪💉📕🥚]/u.test(b) || /<svg\b|<i class=|class="ico/.test(b);
    if (!text && !hasIcon) empties.push(label + ' → ' + b.slice(0, 90));
  });
});
console.log(empties.length ? '  ✗ ' + empties.join('\n  ✗ ') : '  没有空按钮 ✓');

console.log('\n=== ⑤ 界面上漏出来的内部字（变量名 / id / 英文单词）===');
/* 起因：主页「每日任务」那一格的副标题直接写着 `tasks`、「兑换大厅」写着 `shop`——
   元组的第 3 位是"解锁条件"，被写成了名字旁边的说明，于是内部 key 就画到脸上了。
   这类"漏字"只有把界面**真的画出来读一遍**才发现，所以在这里固化成检查。 */
const ALLOW_WORD = new Set(['exp', 'hp', 'atk', 'def', 'spd', 'crit', 'up', 'new', 'ssr', 'ur', 'sr', 'lv', 'pvp',
  'gm', 'id', 'qq', 'ios', 'android', 'web', 'ok', 'cd', 'afk']);
const leaks = [];
htmls.forEach(([label, h]) => {
  const text = h.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')                                   // 剥标签：只看玩家真能看到的那层字
    .replace(/&[a-z]+;/g, ' ');
  const words = text.match(/\b[a-z][a-z0-9_]{2,}\b/g) || [];
  [...new Set(words)].forEach(w => {
    if (ALLOW_WORD.has(w)) return;
    const i = text.search(new RegExp('\\b' + w + '\\b'));
    leaks.push(`${label} → 「${w}」  …${text.slice(Math.max(0, i - 40), i + w.length + 16).replace(/\s+/g, ' ').trim()}…`);
  });
});
console.log(leaks.length ? '  ✗ ' + leaks.join('\n  ✗ ') : '  没有漏出来的内部字 ✓');

const total = problems.length + orphans.length + missing.length + empties.length + leaks.length;
console.log(`\n结论：${total === 0 ? '全绿 ✓' : '有 ' + total + ' 项要看'}`);
