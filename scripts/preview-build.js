/* 临时脚本（截图预览用，看完删）：
   小游戏里每个 js 都是独立模块，但浏览器 <script> 共享全局作用域，const 会撞名。
   这里把 8 个文件按 CommonJS 语义包成一个个函数作用域，打成一个包给预览页用。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const FILES = [
  ['wx-adapter', 'js/wx-adapter.js'],
  ['data', 'js/data.js'], ['core', 'js/core.js'], ['battle', 'js/battle.js'], ['dungeon', 'js/dungeon.js'],
  ['cv', 'js/cv.js'], ['screens', 'js/screens.js'], ['ui-canvas', 'js/ui-canvas.js'],
];
const parts = [`(function(){var reg={};function req(from){return function(p){var k=String(p).replace(/^\\.\\//,'').replace(/\\.js$/,'');if(!reg[k])throw new Error('module not found: '+k);return reg[k].exports;};}function def(name,f){reg[name]={exports:{}};f(reg[name],reg[name].exports,req(name));}`];
FILES.forEach(([name, file]) => {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  parts.push(`def(${JSON.stringify(name)},function(module,exports,require){\n${src}\n});`);
});
// 小游戏里入口是 require('./js/ui-canvas.js')，这里把它的导出挂到全局，预览页才拿得到
parts.push("window.UI = reg['ui-canvas'].exports; window.CV = reg['cv'].exports;");
parts.push('})();');
const out = path.join(ROOT, '_preview_bundle.js');
fs.writeFileSync(out, parts.join('\n'));
console.log('已生成 _preview_bundle.js（' + Math.round(fs.statSync(out).size / 1024) + 'KB）');
