/* 界面 API 尺子：node scripts/api_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.98 自审）：
   canvas 界面是**手写调用** Core.* 与 D.* 的。写错一个名字（或者数据表被改名/删掉）**不会报错**：
     · `D.FOO` 取到 undefined → 画面上就写一个 "undefined"（父亲大人报过"乱码/漏字"这类）
     · `Core.foo()` 不存在 → 那一颗按钮点了直接抛错（看着像"死键"）
   现有的 page_smoke / tap_audit 只能发现"抛错"和"没登记处理器"，发现不了"读了一个不存在的表"。
   这把尺子把界面里出现过的每个 `Core.X` / `D.X` 拿出来，跟真实的导出表对一遍，缺了就报。
   只读脚本：data.js / core.js 只加载不写。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

/* 加载 data.js + core.js，拿到真实的导出表 */
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
if (!global.GameGlobal) global.GameGlobal = global;
['data.js', 'core.js'].forEach((f) => eval(fs.readFileSync(path.join(JS, f), 'utf8')));
const DATA = global.DATA, CORE = global.Core;
const dataKeys = new Set(Object.keys(DATA || {}));
const coreKeys = new Set(Object.keys(CORE || {}));

/* 只去注释：界面里 `${D.xxx}` 这类模板串是**真引用**，不能连字符串一起删 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');

const UI = ['uiw.js', 'cv.js'].concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)));
const ROOT = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(ROOT, 'game.js'))) UI.push('../game.js');   // 入口也算界面层
const badCore = [], badData = [];
UI.forEach((f) => {
  const p = f.indexOf('../') === 0 ? path.join(__dirname, f) : path.join(JS, f);
  const src = stripComments(fs.readFileSync(p, 'utf8'));
  const label = f.replace('../', '');
  /* Core.X / D.X —— 注意排除注释里提到的写法（已经去掉了）与局部同名变量（本仓没有这种情况） */
  const reCore = /\bCore\.([A-Za-z_$][\w$]*)/g, reData = /\bD\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reCore.exec(src))) if (!coreKeys.has(m[1])) badCore.push(label + ' → Core.' + m[1]);
  while ((m = reData.exec(src))) if (!dataKeys.has(m[1])) badData.push(label + ' → D.' + m[1]);
});

/* 网页版也一起查：它的界面层是 js/ui.js，读错字段同样只会静默显示 "undefined"
   （test_ui 能抓抛错，抓不到"读了一个不存在的表"）。它那边的写法是 D.x 与 C().x。 */
const WEB = path.resolve(ROOT, '../wxlh-game/js/ui.js');
if (fs.existsSync(WEB)) {
  const src = stripComments(fs.readFileSync(WEB, 'utf8'));
  const reC = /\bC\(\)\.([A-Za-z_$][\w$]*)/g, reD = /\bD\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reC.exec(src))) if (!coreKeys.has(m[1])) badCore.push('网页版 ui.js → C().' + m[1]);
  while ((m = reD.exec(src))) if (!dataKeys.has(m[1])) badData.push('网页版 ui.js → D.' + m[1]);
  UI.push('(网页版 ui.js)');
}

const uniq = (a) => [...new Set(a)];
const bc = uniq(badCore), bd = uniq(badData);
console.log('\n=== 界面 API 尺子（界面调用的 Core.* / D.* 必须真的存在）===');
console.log('扫了 ' + UI.length + ' 个界面文件 · 真实导出：Core ' + coreKeys.size + ' 项 / DATA ' + dataKeys.size + ' 项');
if (!bc.length) console.log('  ✓ Core.*：界面调用的函数全都存在');
else { console.log('  ✗ 这些 Core.* 不存在（点了会抛错）：'); bc.forEach((x) => console.log('      ' + x)); }
if (!bd.length) console.log('  ✓ D.*：界面读的数据表全都存在');
else { console.log('  ✗ 这些 D.* 不存在（画面上会写 undefined）：'); bd.forEach((x) => console.log('      ' + x)); }
console.log('\n结论：' + ((bc.length + bd.length) === 0 ? '界面与核心/数据层接口对得上 ✓' : '有 ' + (bc.length + bd.length) + ' 处对不上') + '\n');
process.exitCode = (bc.length + bd.length) ? 1 : 0;
