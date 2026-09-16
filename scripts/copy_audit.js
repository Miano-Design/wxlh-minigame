/* 文案体检（防"版本脱节"）：node scripts/copy_audit.js

   起因（2026-09-17 父亲大人）：「成就啊、任务啥的一些文字性的东西还是没有跟着版本更新……
   像第一个主线任务（写着"打开个人房间"，那个界面早就没有了）……你要有自主判断的能力，
   不能老等我去发现问题。」

   这个脚本专查"界面上写着、但游戏里已经不存在/对不上"的文字：
   ① 退役词：旧界面名、旧功能名（个人房间 / 凡体 / 药剂 / 跳过战斗 …）出现在任何用户可见文案里；
   ② 任务 / 成就 / 周常 / 悬赏里点名的**世界名与关卡号**必须真实存在；
   ③ 任务解锁字段（unlock）里的每个 key 必须在 UNLOCKS 里；
   ④ 奖励里的货币 / 道具 id 必须真实存在；
   ⑤ 任务"去完成"的落点（src）必须在 TASK_SRC 里有映射；
   ⑥ 主线任务 id 不能重复（重复会让"当前任务"永远卡在同一条）。

   只读，不改东西。改完文案跑一下，绿了就说明界面上的名字都还叫得应。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const D = window.DATA, Core = window.Core;
const uiSrc = fs.readFileSync('js/ui.js', 'utf8');
const coreSrc = fs.readFileSync('js/core.js', 'utf8');

let bad = 0;
const fail = (msg) => { bad++; console.log('  ✗ ' + msg); };

/* 只扫"玩家能读到的那层文案"。两道过滤缺一不可：
   ① 先剥注释——注释里**必须**能写"以前叫个人房间""药剂已经删了"这类留档说明
      （第一版没剥注释，把自己写的说明全报了一遍）；
   ② 再从剩下的代码里抠中文字符串字面量。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')            // JS 块注释
    .replace(/<!--[\s\S]*?-->/g, ' ')             // 模板里的 HTML 注释
    .replace(/^\s*\/\/.*$/gm, ' ')                // 整行 JS 注释
    .replace(/[ \t]\/\/[ \t][^\n'"`]*$/gm, ' ');   // 行尾 JS 注释
}
function userStrings(src) {
  const out = [];
  const re = /'([^'\\\n]{2,})'|"([^"\\\n]{2,})"|`([^`\\]{2,})`/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[1] || m[2] || m[3] || '';
    if (/[\u4e00-\u9fa5]/.test(s)) out.push(s);
  }
  return out;
}

console.log('=== ① 退役词：旧界面名 / 旧功能名还在文案里 ===');
/* 每条：正则 + 为什么算退役（写清楚，免得后人以为可以随手放宽） */
const RETIRED = [
  [/个人房间/, '旧界面名，主角属性面板已经并入"主页最上面的主角卡"'],
  [/凡体/, '旧占位境界，V8.1 起第 1 阶就是血统的第一境'],
  [/跳过战斗|跳过 ⏩/, 'V9.5.64 已删除该按钮（战斗界面改用"撤离"）'],
  /* 只按**已被删掉的那几件的具体名字**判，不能按"强化剂"这种泛称判——
     血清在炼化台里就叫"永久强化剂"，那是另一套还在用的系统。 */
  [/治疗剂|药剂条|肌肉强化剂|神经刺激剂|合金护盾剂|狂暴催化剂|超频注射剂/, 'V9.5.66 探索消耗品整条线下架'],
  [/去选血统|还没选血统|去挑一种血统/, '血统是开局必经的一步，任何界面都不该再引导玩家"去选血统"'],
  [/扫荡券|体力值|灵力值/, '游戏里没有这些资源'],
];
/* 允许"解释式"提及：为了说明"不再有这东西"而点到名字是正常的。
   例如「不存在"凡体"这种还没入门的占位」——这种出现不该判错。 */
const EXPLAINING = /不再|不存在|没有这种|早就|以前|过去|旧版|已删|下架|不该再/;
const textSources = [['js/data.js', stripComments(fs.readFileSync('js/data.js', 'utf8'))], ['js/ui.js', stripComments(uiSrc)]];
const hits = [];
textSources.forEach(([file, src]) => {
  userStrings(src).forEach((s) => {
    RETIRED.forEach(([re, why]) => {
      if (re.test(s) && !EXPLAINING.test(s)) hits.push(`${file}：…${s.replace(/\s+/g, ' ').trim().slice(0, 60)}…  （${why}）`);
    });
  });
});
// 注释里提到旧名字是允许的（要写清"为什么删了"），所以只报字符串字面量，报完人工看一眼
[...new Set(hits)].forEach(h => fail(h));
if (!hits.length) console.log('  没有退役词 ✓');

console.log('\n=== ② 任务 / 成就 / 悬赏里点名的世界与关卡必须真实存在 ===');
const worldNames = D.WORLDS.map(w => w.name);
const allQuestText = []
  .concat(D.MAIN_QUESTS.map(q => `主线·${q.name}：${q.desc}`))
  .concat(D.ACHIEVEMENTS.map(a => `成就·${a.name}：${a.desc || ''}`))
  .concat(D.DAILY_TASKS.map(t => `日常·${t.name}`))
  .concat(D.WEEKLY_TASKS.map(t => `周常·${t.name}`));
// 形如 "菌毯巢穴·第 3 关" / "通关 潜影窟·第1关"
const refRe = /([\u4e00-\u9fa5A-Za-z]{2,8})\s*[·・]\s*第\s*(\d+)\s*关/g;
allQuestText.forEach(txt => {
  let m;
  while ((m = refRe.exec(txt))) {
    const [, wname, n] = m;
    if (!worldNames.includes(wname)) fail(`${txt} → 世界里没有叫「${wname}」的世界`);
    if (+n < 1 || +n > 12) fail(`${txt} → 关卡号 ${n} 不存在（每世界 12 关）`);
  }
});
console.log(`  扫了 ${allQuestText.length} 条任务/成就文案，世界名与关卡号引用都对得上 ✓`);

console.log('\n=== ③ 任务解锁字段里的 key 必须在 UNLOCKS 里 ===');
const unlockKeys = new Set(D.UNLOCKS.map(u => u.id));
D.MAIN_QUESTS.concat(D.DAILY_TASKS).forEach(q => {
  const raw = q.unlock || '';
  String(raw).split(',').filter(Boolean).forEach(k => {
    if (!unlockKeys.has(k.trim())) fail(`${q.id} 的 unlock 里写了不存在的解锁项「${k}」`);
  });
});
console.log(`  UNLOCKS 共 ${unlockKeys.size} 项：${[...unlockKeys].join(' / ')} ✓`);

console.log('\n=== ④ 奖励里的货币 / 道具 id 必须真实存在 ===');
const curKeys = new Set(D.CURRENCIES.map(c => c.id));
function checkReward(label, r) {
  if (!r || typeof r !== 'object') return;
  Object.entries(r).forEach(([k, v]) => {
    if (k === 'item') { if (!D.ITEMS[v]) fail(`${label} 奖励里的道具「${v}」不存在`); return; }
    if (k === 'ssrTicket' || k === 'exp') return;
    if (!curKeys.has(k)) fail(`${label} 奖励里的货币「${k}」不存在`);
  });
}
D.MAIN_QUESTS.forEach(q => checkReward('主线·' + q.id, q.reward));
D.DAILY_TASKS.forEach(t => checkReward('日常·' + t.id, t.reward));
D.WEEKLY_TASKS.forEach(t => checkReward('周常·' + t.id, t.reward));
D.ACHIEVEMENTS.forEach(a => checkReward('成就·' + a.id, a.reward));
D.CODEX_REWARDS.forEach((c, i) => checkReward('图鉴奖励#' + i, c.reward));
[1, 6, 12, 13, 40, 80, 100].forEach(lv => {
  Core.newGame(); Core.S.player.level = lv;
  (D.makeBounties(Core.S) || []).forEach(b => checkReward('悬赏·' + b.id, b.reward));
});
console.log('  主线 / 日常 / 周常 / 成就 / 图鉴 / 悬赏（7 档等级）奖励 id 全部有效 ✓');

console.log('\n=== ⑤ 任务"去完成"的落点必须有映射 ===');
const srcMap = coreSrc.match(/const TASK_SRC = \{([^}]*)\}/);   // TASK_SRC 住在 core.js，不是 ui.js
const mapped = new Set(srcMap ? srcMap[1].match(/([a-z0-9_]+)\s*:/g).map(s => s.replace(/\s*:/, '')) : []);
D.DAILY_TASKS.forEach(t => { if (!mapped.has(t.id)) fail(`日常任务 ${t.id} 没有「去完成」的落点映射`); });
console.log(`  TASK_SRC 覆盖 ${mapped.size} 项 ✓`);

console.log('\n=== ⑥ 主线任务 id 不能重复 ===');
const ids = D.MAIN_QUESTS.map(q => q.id);
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dup.length) dup.forEach(id => fail(`主线任务 id 重复：${id}`));
else console.log(`  ${ids.length} 条主线任务 id 唯一 ✓`);

console.log('\n=== ⑦ 文案里写的"入口"必须真的存在 ===');
/* 起因：玩法指南里写着「入口：首页养成组的「血统」和「境界渡劫」」——
   而养成组里根本没有「血统」这一格（血统升级在主角卡 / 伙伴详情里）。
   这类"指着不存在的入口"只有把入口名和界面上的真实标签对一遍才发现。 */
const labelSet = new Set();
(uiSrc.match(/\['open-[a-z-]*', '([^']*)'/g) || []).forEach(s => labelSet.add(s.replace(/.*', '/, '').replace(/'$/, '')));
(uiSrc.match(/name: '([^']*)'/g) || []).forEach(s => labelSet.add(s.replace(/name: '|'/g, '')));
/* 主页上的"段标题"（养成 / 日常 / 游历 / 挂机 / 设置）也是玩家看得见的入口名，
   它们不是按钮，从上面两个正则里抠不出来，所以单独补一份。 */
['灯阁', '残域', '执灯者', '背包', '主角卡', '养成', '成长', '日常', '游历', '挂机', '设置',
  '详情', '主页', '面板', '招募', '深井', '灯阁市集'].forEach(w => labelSet.add(w));
const entryHits = [];
userStrings(stripComments(fs.readFileSync('js/data.js', 'utf8')))
  .concat(userStrings(stripComments(uiSrc)))
  .forEach(s => {
    if (!/入口/.test(s)) return;
    (s.match(/「([^」]{1,24})」/g) || []).forEach(raw => {
      const inner = raw.replace(/[「」]/g, '');
      // 允许写成链路（"主页 → 养成 → 成长 → 境界渡劫"）：每一节都得是真实标签或通用词
      const parts = inner.split(/\s*(?:→|>|·|・)\s*/).filter(Boolean);
      parts.forEach(p => {
        const ok = [...labelSet].some(l => p.includes(l));
        if (!ok) entryHits.push(`${s.slice(0, 30)}… → 「${p}」找不到对应的界面标签`);
      });
    });
  });
[...new Set(entryHits)].forEach(h => fail(h));
if (!entryHits.length) console.log(`  入口名与界面标签对得上（认识 ${labelSet.size} 个真实标签）✓`);

console.log(`\n结论：${bad === 0 ? '文案与当前版本对得上 ✓' : '有 ' + bad + ' 处文案要对一遍'}`);
process.exit(bad ? 1 : 0);
