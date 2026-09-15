/* 路线 B · 浏览器预览打包：node scripts/ce-preview-build.js
   ------------------------------------------------------------------------------
   小游戏运行时有 require（CommonJS），浏览器没有；而且引擎/逻辑层/界面层都得按顺序装。
   这里把 ce-*.js 这几个 CommonJS 模块包成一份 `_ce_bundle.js`（极简 require），
   预览页只要：逻辑层 → ui-web.js → 引擎 → _ce_bundle.js，就能跑同一套代码。
   改完 ce-*.js 记得重跑本脚本（只是给预览用，不影响小游戏本体）。
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'js/ce-context.js',
  'js/ce-fit.js',
  'js/ce-html.js',
  'js/ce-home-data.js',
  'js/ce-shell.js',
  'js/ce-engine.js',
  'js/ce-app.js',
];

let out = '/* 自动生成，不要手改：node scripts/ce-preview-build.js（只给浏览器预览用） */\n';
out += '(function () {\nvar __mods = {}, __cache = {};\n';
out += 'function require(id) {\n'
  + '  if (__cache[id]) return __cache[id].exports;\n'
  + '  var m = { exports: {} }; __cache[id] = m;\n'
  + '  if (!__mods[id]) throw new Error("预览里没映射的 require: " + id);\n'
  + '  __mods[id](m, m.exports, require);\n  return m.exports;\n}\n';
out += '__mods["./lib/canvas-engine.js"] = function (module) { module.exports = window.__ENGINE; };\n';
out += '__mods["./ce-style.js"] = function (module) { module.exports = window.__STYLE; };\n';

FILES.forEach((f) => {
  const id = './' + path.basename(f);
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  out += `__mods[${JSON.stringify(id)}] = function (module, exports, require) {\n${src}\n};\n`;
});
out += 'window.CEApp = require("./ce-app.js");\n';
out += 'window.__CEENGINE = require("./ce-engine.js");\n';
out += '})();\n';

const target = path.join(ROOT, '_ce_bundle.js');
fs.writeFileSync(target, out, 'utf8');
console.log(`预览包已生成：_ce_bundle.js（${(fs.statSync(target).size / 1024).toFixed(1)}KB，${FILES.length} 个模块）`);
