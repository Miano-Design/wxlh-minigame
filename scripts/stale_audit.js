/* 旧东西残留体检：node scripts/stale_audit.js
   ------------------------------------------------------------------------------
   父亲大人（V9.6.144）："除了这些还有游戏整体的玩法、机制、数值、功能啥的都查一遍，
   特别是有没有旧的东西残留"。
   已经有的尺子管的是"这一版对不对"（数值联动 / 掉落 / 文案 / 版面），
   没人管**"上一版留下的东西还在不在"**。这个脚本专查四类残留：
     ① 存档字段：defaultState() 里声明了、但全仓没人读（旧系统的遗骸）
     ② 数据表字段：某张表**每个条目都写了**、但全仓没人读（写的时候想用，后来忘了）
     ③ 死页面：注册了渲染函数、但没有任何地方 push/reset 进得去
     ④ 死导出：data.js 导出了、但两边界面层都没用过
   只读脚本。两边源码一起扫（网页版是唯一标准，只用一边会误判）。 */
const fs = require('fs');
const path = require('path');
const MG = path.resolve(__dirname, '../js');
const WEB = path.resolve(__dirname, '../../wxlh-game/js');
/* ⛔ V1.1.11（2026-09-27）：**本尺子整体退役**。它自己的注释就写着"两边源码一起扫
   （网页版是唯一标准，只用一边会误判）"—— 网页版已归档到 GitHub、本地删掉，
   只剩一边扫必然把"只被网页版读过的字段/导出"全报成残留（假警报比真问题多）。
   ⇒ 与 parity_audit 同批退役；网页版哪天复活再恢复。 */
if (!fs.existsSync(WEB)) {
  console.log('⏭ stale_audit 已退役：网页版归档到 GitHub、本地已删 —— "两边一起扫"的前提没了。');
  process.exit(0);
}

function readAll(dir) {
  const out = {};
  fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).forEach((f) => { out[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
  return out;
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}
const mgFiles = readAll(MG), webFiles = readAll(WEB);
const both = Object.keys(mgFiles).map((f) => stripComments(mgFiles[f]))
  .concat(Object.keys(webFiles).map((f) => stripComments(webFiles[f]))).join('\n');

let bad = 0;

console.log('=== ① 存档字段：声明了但全仓没人读 ===');
{
  const core = mgFiles['core.js'] || '';
  const m = /function defaultState\(\)[\s\S]*?\n  \}/.exec(core);
  const body = m ? m[0] : '';
  const keys = [...body.matchAll(/^ {6}([a-zA-Z_][\w]*)\s*:/gm)].map((x) => x[1]);
  const dead = keys.filter((k) => (both.match(new RegExp('S\\.' + k + '\\b', 'g')) || []).length === 0);
  dead.forEach((k) => { bad++; console.log(`  ✗ 存档字段 S.${k} 全仓没人读（旧系统的遗骸）`); });
  if (!dead.length) console.log(`  ${keys.length} 个存档字段都在用 ✓`);
}

console.log('\n=== ② 数据表字段：每个条目都写了、但没人读 ===');
/* 表名 → 从 data.js 里的 `const NAME = [...]` 抓出所有条目的字段名。
   只报"**这张表里 ≥80% 的条目都写了**"的字段 —— 个别条目独有的字段（比如某件法宝多一个 eff）
   不算残留。 */
{
  const data = stripComments(mgFiles['data.js'] || '');
  const TABLES = ['CURRENCIES', 'SERUMS', 'GARDEN', 'MONUMENTS', 'MOUNTS', 'FABAO', 'REALMS', 'BEASTS',
    'BUILDINGS', 'UNLOCKS', 'IDLE_LINES', 'KEJI', 'SIGNS', 'TRAVELS', 'MAIN_QUESTS', 'ACHIEVEMENTS', 'DAILY_TASKS'];
  TABLES.forEach((tn) => {
    const re = new RegExp('const ' + tn + ' = \\[([\\s\\S]*?)\\n  \\];');
    const m = re.exec(data);
    if (!m) return;
    const rows = m[1].split(/\n\s*\{/).slice(1);
    if (rows.length < 3) return;
    const counts = {};
    rows.forEach((r) => {
      const keys = new Set([...r.matchAll(/([a-zA-Z_][\w]*)\s*:/g)].map((x) => x[1]));
      keys.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    });
    Object.keys(counts).forEach((k) => {
      if (counts[k] / rows.length < 0.8) return;
      // 读法：全仓出现过 `.字段名`（数据表字段都是这样被读的）
      const used = new RegExp('\\.' + k + '\\b').test(both);
      if (!used) { bad++; console.log(`  ✗ ${tn} 的字段「${k}」(${counts[k]}/${rows.length} 条都写了) 全仓没人读`); }
    });
  });
  if (!bad) console.log('  数据表字段都在被读 ✓');
}

console.log('\n=== ③ 死页面：注册了但进不去 ===');
{
  const src = Object.keys(mgFiles).map((f) => mgFiles[f]).join('\n');
  const registered = [...src.matchAll(/CV\.register\(\s*'([^']+)'/g)].map((x) => x[1]);
  const entered = new Set([...src.matchAll(/CV\.(?:push|reset|jump)\(\s*'([^']+)'/g)].map((x) => x[1]));
  /* ⚠️ 不能只看 `CV.push('名字')`：玩法指南 / 主线引导是**用表里的 page 字段**跳过去的
     （`CV.jump(it.page)`），页面名字面量只出现在那张表里。
     所以判据放宽成：这个名字在**除了 register 那一处之外**还有没有出现过。 */
  const countOf = (p) => (src.match(new RegExp("'" + p + "'", 'g')) || []).length;
  const dead = registered.filter((p) => !entered.has(p) && countOf(p) <= 1);
  dead.forEach((p) => { bad++; console.log(`  ✗ 页面「${p}」注册了渲染函数，但没有任何 CV.push/reset/jump 进得去`); });
  if (!dead.length) console.log(`  ${registered.length} 个页面都进得去 ✓`);
}

console.log('\n=== ④ 死导出：data.js 导出了但没人用 ===');
{
  const data = mgFiles['data.js'] || '';
  const m = /return \{([\s\S]*?)\};\s*\}\)\(\);\s*$/.exec(data) || /return \{([\s\S]*?)\};/.exec(data);
  const exported = m ? m[1].split(/[,\n]/).map((s) => s.trim()).filter((s) => /^[A-Za-z_]\w*$/.test(s)) : [];
  /* 只报"大写常量"这一种最容易堆死货的（函数被界面调用很分散，误判率高）。
     ⚠️ 判据不能只看 `D.名字` —— 常量常常是**在 data.js 内部**被读的（比如 EQUIP_RARITIES
     在背包/掉落/套装里用了十几次），那样完全正常。
     所以：这个名字**除了"定义那一行 + 导出清单那一行"之外**，还有没有出现过。 */
  const dead = exported.filter((k) => {
    if (!/^[A-Z][A-Z0-9_]+$/.test(k)) return false;
    const hits = (both.match(new RegExp('\\b' + k + '\\b', 'g')) || []).length;
    return hits <= 2;                       // 只剩"const X = ..."这一处 + 导出清单这一处
  });
  dead.forEach((k) => { bad++; console.log(`  ✗ data.js 导出的常量 ${k} 全仓没人用`); });
  if (!dead.length) console.log('  导出的常量都在用 ✓');
}

console.log('\n' + (bad ? `结论：有 ${bad} 处旧东西残留，要清` : '结论：没有旧东西残留（存档字段 / 数据表字段 / 页面 / 导出都干净）✓'));
process.exit(bad ? 1 : 0);
