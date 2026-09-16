/* 小游戏截图（替代用不了的 simulator_screenshot）：node scripts/shot.js <输出名>
   原理：devtools 里 wx.createCanvas() 返回的是 HTMLCanvasElement → 游戏自己 toDataURL
   → 经 FileSystemManager 写成 PNG（在 devtools 的用户数据目录里）→ 本脚本把它拷出来。
   前置：game.js 里那段"开发期截图"（[CE-SHOT]）；跑之前会先刷一次模拟器。
   用法：node scripts/shot.js 首页A   → 输出 截图/首页A.png
*/
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const name = process.argv[2] || 'shot';
const PROJECT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROJECT, '截图');
const SIM_DIR = path.join(os.homedir(), 'Library/Application Support/微信开发者工具');

function sh(cmd) { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return ''; } }

console.log('① 刷新模拟器…');
sh(`wechatide -c Codex simulator_refresh --project "${PROJECT}"`);
console.log('② 等游戏写出画面（3 秒）…');
execSync('sleep 12');
console.log('③ 找最新 ce-shot.png…');
const found = sh(`find "${SIM_DIR}" -name ce-shot.png -newermt '-3 minutes' 2>/dev/null | head -1`).trim();
if (!found) { console.error('✗ 没找到画面文件：确认刷新成功、且 game.js 里那段截图代码在'); process.exit(1); }
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, name + '.png');
fs.copyFileSync(found, out);
console.log('✓ 已保存：' + out + '（' + Math.round(fs.statSync(out).size / 1024) + 'KB）');
