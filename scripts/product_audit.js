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
console.log('\n=== ⑥ 样式表里没人用的类（改版删界面后的残留）===');
/* 起因（V9.5.71 自审）：删掉战斗界面的「我方前排 / 我方后排」字条之后，
   它的 .b-line-label 规则也跟着删了；但同类残留（比如 .pos-hint）就一直躺在那儿没人管。
   这里把 style.css 里的选择器抠出来，去 js/ 与 index.html 里找引用，找不到就报。 */
/* 先剥注释：style.css 里有一段"V8.6 删掉了没人再用的类：.plaque / .hero-num …"的留档说明，
   不剥的话这些名字会被当成"还在用的类"（或者反过来被报成孤立类），两头都是假警报。 */
const cssSrc = fs.readFileSync('css/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const jsAll = fs.readFileSync('js/ui.js', 'utf8') + fs.readFileSync('js/main.js', 'utf8') + fs.readFileSync('index.html', 'utf8');
const classNames = [...new Set((cssSrc.match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) || []).map(s => s.slice(1)))];
const deadCss = classNames.filter(c => {
  if (/^(pslot|party|b-|u-|char|skill|reward|step|list|kv|btn|bar|stage|world|bag|bg-|tab|pill|eq|fm|idle|float|coach|drag|empty|tag|dot|tt|pos|rarity|stat|travel|ast|cname|cmeta|sheet|page|modal|toast|overlay|climb|loot|inparty|shine|gold|green|low|dead|hit|acting|on|off|done|cur|sel|filled|locked|boss|enemy|ally|rtext|sub|k|t1|t2|grow|hint|note|stars|key|val|row|sec|run|arm|aut|sw|fp|sig|sel-|no-sel)/.test(c)) return false;
  return jsAll.indexOf(c) < 0;
});
console.log(deadCss.length ? '  ⚠ 样式表里没人用的类：' + deadCss.join(' ') : '  样式表没有孤立类 ✓');

const total2 = total + deadCss.length;
let bound = 0;
console.log('\n=== ⑦ 边界状态：同一批界面在极端档位下是否还站得住 ===');
/* 起因（V9.5.81 自审）：前面所有检查都只在一个"中间档"上跑。但真实玩家会经过
     全新档（没伙伴没道具）、没钱、背包满、满配毕业 这些状态——
     那些状态下最容易出现"空白页 / undefined / 全 disabled 的死界面"。
   这里把 6 种极端档位 × 全部界面各渲染一遍。 */
{
  const STATES = [
    ['全新档（Lv.0，没有伙伴/道具/装备）', () => {
      Core.newGame(); Core.setPlayerName('新号'); Core.choosePlayerBloodline('修真');
      Core.S.cur = { points: 0, story: 0, otherworld: 0, holy: 0, skillChip: 0, bloodCrystal: 0, corridor: 0, rp: 0 };
      Core.S.items = {}; Core.S.equips = {}; Core.S.chars = {}; Core.S.party = ['@player', null, null, null, null];
    }],
    ['一分钱没有（全解锁但货币为 0）', () => {
      Core.newGame(); Core.setPlayerName('穷'); Core.choosePlayerBloodline('修真');
      D.UNLOCKS.forEach(u => { Core.S.unlocks[u.id] = true; });
      Core.addChar('C021'); Core.S.party[1] = 'C021';
      Core.S.cur = { points: 0, story: 0, otherworld: 0, holy: 0, skillChip: 0, bloodCrystal: 0, corridor: 0, rp: 0 };
    }],
    ['背包全满', () => {
      Core.newGame(); Core.setPlayerName('满'); Core.choosePlayerBloodline('修真');
      Object.keys(D.ITEMS).forEach(k => { Core.S.items[k] = 999; });
      Core.S.stash = [{ id: 'exp_s', n: 5 }, { id: 'ticket_normal', n: 2 }];
      for (let i = 0; i < 60; i++) Core.grantEquip('W05', 'SR');
    }],
    ['中期末（有伙伴有资源）', () => {
      Core.newGame(); Core.setPlayerName('中期'); Core.choosePlayerBloodline('修真');
      Core.addPlayerExp(200000); D.UNLOCKS.forEach(u => { Core.S.unlocks[u.id] = true; });
      ['C021', 'C022', 'C023'].forEach(id => Core.addChar(id));
      Core.S.party = ['@player', 'C021', 'C022', 'C023', null];
      Core.S.cur = { points: 99999, story: 9999, otherworld: 9999, holy: 999, skillChip: 9999, bloodCrystal: 999, corridor: 999, rp: 99 };
      ['W01', 'W02', 'W03'].forEach(w => { Core.S.worlds[w] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(2), hell: Array(12).fill(0) } }; });
      Core.S.corridor = { floor: 12, best: 12 }; Core.S.arena = { floor: 8, best: 8, date: '', used: 1 };
    }],
    ['满配毕业（全满级满阶）', () => {
      Core.newGame(); Core.setPlayerName('毕业'); Core.choosePlayerBloodline('修真');
      D.UNLOCKS.forEach(u => { Core.S.unlocks[u.id] = true; });
      Core.S.player.level = D.PLAYER_MAX_LV; Core.S.player.geneLock = D.GENE_LOCKS.length;
      Core.S.player.bloodlineLv = D.BLOODLINE_MAX; Core.S.player.realm = D.REALM_STAGE_COUNT;
      Core.S.player.skillLv = D.SKILL_MAX_BY_INDEX.slice(); Core.S.player.reincarnations = 3;
      D.BUILDINGS.forEach(b => { Core.S.buildings[b.id] = 50; });
      Core.S.auth = D.AUTHORITY_MAX; Core.S.sect = { lv: D.SECT_MAX, exp: 0 };
      D.KEJI.forEach(k => { Core.S.keji[k.id] = k.max; });
      Object.keys(D.ITEMS).forEach(k => { Core.S.items[k] = 99; });
      Core.S.cur = { points: 1e7, story: 1e6, otherworld: 1e6, holy: 1e5, skillChip: 1e6, bloodCrystal: 1e6, corridor: 1e5, rp: 1e5 };
      D.WORLDS.forEach(w => { Core.S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(3), hell: Array(12).fill(3) } }; });
      Core.S.corridor = { floor: 200, best: 200 }; Core.S.arena = { floor: 60, best: 60, date: '', used: 0 };
    }],
    ['全锁（什么都没解锁）', () => {
      Core.newGame(); Core.setPlayerName('锁'); Core.choosePlayerBloodline('修真');
      Core.S.unlocks = {};
      Core.S.worlds = { W01: { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } } };
    }],
    ['脏存档（未知 id / NaN / 脏名字 —— 导入被改过的档）', () => {
      Core.newGame(); Core.setPlayerName('脏'); Core.choosePlayerBloodline('修真');
      Core.S.player.name = '<b>超长名字超长名字超长名字超长名字</b>';
      Core.S.items = { 不存在的道具: 5, exp_s: 3 };
      Core.S.chars = { 不存在的人: { lv: 1, skillLv: [0, 0, 0] }, C021: { lv: NaN, skillLv: [90, 0, 0], bloodlineLv: NaN, star: NaN, shards: NaN } };
      Core.S.party = ['@player', '不存在的人', 'C021', null, null];
      Core.S.cur.points = NaN; Core.S.cur.holy = -5;
      Core.S.equips = { bad: { uid: 'bad', name: '?', rarity: 'ZZ', slot: 'weapon', enhance: -5, base: {}, affixes: [] } };
      Core.S.equipped['@player'].weapon = 'bad';
      Core.S.beast.owned.B001 = { lv: NaN, soul: NaN };
      Core.S.sect = { lv: NaN, exp: NaN };
      Core.migrate();      // 导入存档走的就是这条路径
    }],
  ];
  const P2 = UI._panels;
  /* 扫荡面板在"一关都没通关"时会**故意**返回空并弹一句提示（不是 bug），
     所以它单独放宽：允许空返回。 */
  const ALLOW_EMPTY = ['扫荡'];
  const PANELS = [
    ['主角详情', () => P2.protagonistDetail()],
    /* 伙伴详情要传"自己拥有的伙伴"；一个都没有的档位就跳过这一项
       （传未拥有的 id 会被 V9.5.81 加的守卫挡住并返回 null，那是预期行为）。 */
    ['伙伴详情', () => { const id = Object.keys(Core.S.chars)[0]; return id ? P2.charDetail(id) : '<无伙伴，跳过>'; }],
    ['背包', () => P2.bagModal()],
    ['货币图鉴', () => P2.currencyModal('holy')],
    ['玩法指南', () => P2.guideModal()],
    ['设置', () => P2.settingsModal()],
    ['商店-灯阁', () => P2.shopModal('god')],
    ['商店-深井', () => P2.shopModal('corridor')],
    ['任务', () => P2.tasksModal('daily')],
    ['扫荡', () => P2.sweepModal('W01', 'normal')],
    ['招募', () => P2.recruitModal()],
    ['转生', () => P2.reincarnModal()],
    ['铭刻', () => P2.geneLockModal()],
    ['挂机分工', () => P2.idleLinesModal()],
    ['限时悬赏', () => P2.bountyModal()],
    ['境界', () => P2.realmModal()],
    ['伴生体', () => P2.beastModal()],
    ['灯阁权限', () => P2.authorityModal()],
    ['灯阁评级', () => P2.sectModal()],
    ['秘术阁', () => P2.kejiModal()],
    ['游历', () => P2.travelModal()],
    ['药园', () => P2.gardenModal()],
    ['斗法台', () => P2.arenaModal()],
    ['法宝', () => P2.fabaoModal()],
    ['坐骑', () => P2.mountModal()],
    ['求签', () => P2.signModal()],
    ['灯录', () => P2.codexModal()],
    ['概率公示', () => P2.recruitRatesModal()],
  ];
  STATES.forEach(([label, setup]) => {
    setup();
    const bad = [];
    Object.entries(P2._screens).forEach(([n, fn]) => {
      try {
        const h = fn();
        if (!h || typeof h !== 'string') return bad.push(`${n} 空`);
        if (/undefined|NaN|\[object Object\]/.test(h)) bad.push(`${n} 有洞`);
      } catch (e) { bad.push(`${n} 抛异常(${e.message})`); }
    });
    PANELS.forEach(([n, fn]) => {
      try {
        const out = fn();
        const h = typeof out === 'string' ? out : (out && out.innerHTML) || '';
        if (!h.length) { if (!ALLOW_EMPTY.includes(n)) bad.push(`${n} 空`); return; }
        if (/undefined|NaN/.test(h)) bad.push(`${n} 有洞`);
      } catch (e) { bad.push(`${n} 抛异常(${e.message})`); }
    });
    if (bad.length) { console.log(`  ✗ ${label}：${[...new Set(bad)].join(' / ')}`); bound += bad.length; }
    else console.log(`  ✓ ${label}`);
  });
  if (!bound) console.log('  6 种极端档位 × 全部界面：没有空白页、没有 undefined、没有崩溃 ✓');
}

const total3 = total2 + bound;
console.log(`\n结论：${total3 === 0 ? '全绿 ✓' : '有 ' + total3 + ' 项要看'}`);
