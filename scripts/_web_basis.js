/* 网页版归档之后的"两端对表"公共件（康康 2026-09-27）
   ==================================================================================
   父亲大人 09-27 拍板：「把网页版的上传到 git 仓库，把本地的网页版文件夹删了，以后要用再说」。
   网页版工程**本地已经不在**（归档在 https://github.com/Miano-Design/wxlh-game ，末次 commit 589bebb）。
   于是十几把尺子里那些**必须拿网页版当基准**的断言（同一份色板 / 同一张字阶表 / 两端同源 / 对表）
   从此无从执行 —— 它们当年守的是"两端不许漂"，而**网页版已经不维护了**，这条约束自然作废。

   处置原则（不许一刀切把整把尺子砍掉）：
     · **只查小游戏端自己**的断言 → 照跑（那才是现在唯一在线的端）；
     · **需要网页版做基准**的断言 → 走 `skip()`，打印一行 ⏭ 并**不计入失败**；
     · 整把尺子**只为对表而生**的（`stale_audit` / `parity_audit`）→ 在脚本头上直接退役。
   `read()` 在网页版缺失时返回**空串**（不是抛错），这样即使某处漏了 skip，也只是断言不成立而不会崩。 */
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '../../wxlh-game');
const OK = fs.existsSync(WEB);
const read = (rel) => (OK ? fs.readFileSync(path.join(WEB, rel), 'utf8') : '');
const skip = (name) => console.log('  ⏭ ' + name + '（网页版已归档，本条退役）');

module.exports = { WEB, OK, read, skip };
