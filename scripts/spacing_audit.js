/* 行距尺子：node scripts/spacing_audit.js
   ------------------------------------------------------------------------------
   起因（V9.6.93，父亲大人："主线任务那个板块大字和小字贴一起了，还是对齐间距的问题"）：
   小游戏的 canvas 文字是**一个个 CV.text 手写 y 坐标**，行距全靠人脑算；
   网页版是 CSS 行高（.t1 line-height 1.35 / .t2 1.55 + margin-top 4px）自动排的。
   于是同一块内容，网页版 20.25 / 21.05 一行，canvas 里写成 14 / 15 —— 大字小字就贴在一起。

   这把尺子不猜意图，只量"两行文字是否挤在一起"：
     ① 扫所有 CV.text(..., <前缀> + <数字> * CV.SCALE, { size: <字号> })
     ② 同一文件、同一前缀、同一列（x 表达式相同）的算**同一摞文字**，按 y 排序
     ③ 相邻两行的"推进量" < max(两行字号) × 1.15 → 判定为挤在一起
        （15px 标题后跟 11px 小字至少要 17.25px，网页版实际给 20.25，绰绰有余）
   阈值故意取得保守（1.15 是"再紧就该压字了"的底线），宁少报不误报。
   只读脚本。 */
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '../js');
const files = fs.readdirSync(DIR).filter((f) => /^sc-.*\.js$/.test(f)).concat(['uiw.js', 'cv.js']);

const SIZE = { 'CV.FS.xs': 11, 'CV.FS.sm': 11, 'CV.FS.md': 12, 'CV.FS.lg': 13, 'CV.FS.f1': 15, 'CV.FS.f2': 17 };

/* 把 CV.text( ... ) 的参数按顶层逗号切开 */
function argsOf(src, open) {
  let depth = 0, cur = '', out = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      if (depth === 1) continue;          // 最外层那个括号本身不算内容
      cur += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) break;             // 最外层闭合 = 这个调用结束
      cur += ch;
    } else if (ch === ',' && depth === 1) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* 这一处 CV.text 属于哪个"代码块"：最近的 CV.register('页') / CV.on('事件') / function 名。
   不加这一条，两个不同函数里恰好同前缀、同列的两行会被算成"上下摞在一起"（假警报）。 */
function blockOf(src, idx) {
  const head = src.slice(Math.max(0, idx - 4000), idx);
  const marks = [];
  const push = (re) => { let m; while ((m = re.exec(head))) marks.push({ at: m.index, name: m[1] || m[2] || '?' }); };
  push(/CV\.register\(\s*'([^']+)'/g);
  push(/CV\.on\(\s*'([^']+)'/g);
  push(/function\s+([A-Za-z_$][\w$]*)\s*\(/g);
  if (!marks.length) return '-';
  marks.sort((a, b) => a.at - b.at);
  return marks[marks.length - 1].name;
}

const found = [];   // { file, key, y, size, text, at }
files.forEach((f) => {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const re = /CV\.text\(/g;
  let m;
  while ((m = re.exec(src))) {
    const a = argsOf(src, m.index + 'CV.text'.length);
    if (a.length < 4) continue;
    const xExpr = a[1].trim().replace(/\s+/g, '');
    const yExpr = a[2].trim();
    const opt = a[3];
    /* y 必须是 "<前缀> + <数字> * CV.SCALE"（或 "<数字> * CV.SCALE"），否则量不了 */
    const ym = yExpr.match(/^(.*?)(?:\s*\+\s*)?(-?\d+(?:\.\d+)?)\s*\*\s*CV\.SCALE$/);
    if (!ym) continue;
    const prefix = (ym[1] || '').replace(/\s+/g, '');
    const y = parseFloat(ym[2]);
    const sm = opt.match(/size:\s*(CV\.FS\.[a-z0-9]+)/);
    const size = sm ? (SIZE[sm[1]] || 13) : 13;
    const txt = a[0].replace(/\s+/g, ' ').slice(0, 34);
    const block = blockOf(src, m.index);
    found.push({ file: f, key: f + '#' + block + '|' + prefix + '|' + xExpr, y: y, size: size, text: txt, at: m.index });
  }
});

const groups = {};
found.forEach((x) => { (groups[x.key] = groups[x.key] || []).push(x); });

let bad = 0, checked = 0;
const rows = [];
Object.keys(groups).forEach((k) => {
  const list = groups[k].sort((a, b) => a.y - b.y);
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const adv = b.y - a.y;
    if (adv <= 0) continue;
    /* 互斥分支（if / else if / else 各画各的）不算"上下两行" —— 同一时刻只会画其中一条。
       判断法：两处调用之间的源码里出现 else，就认为它们是互斥的。 */
    if (a.file === b.file && a.at != null && b.at != null) {
      /* 按**源码先后**取中间片段（y 的顺序和源码顺序不一定一致，反着切会得到空串） */
      const lo = Math.min(a.at, b.at), hi = Math.max(a.at, b.at);
      const between = fs.readFileSync(path.join(DIR, a.file), 'utf8').slice(lo, hi);
      if (/\belse\b/.test(between)) continue;
    }
    checked++;
    const need = Math.max(a.size, b.size) * 1.15;
    if (adv < need) rows.push({ k: k, adv: adv, need: need, a: a, b: b });
  }
});

console.log('\n=== 行距尺子（canvas 文字是否挤在一起）===');
console.log('扫了 ' + files.length + ' 个文件 · ' + found.length + ' 处绝对定位文字 · ' + Object.keys(groups).length + ' 摞 · 核了 ' + checked + ' 对相邻行');
if (!rows.length) {
  console.log('结论：没有"两行挤在一起"的地方 ✓\n');
} else {
  rows.sort((a, b) => (a.need - a.adv) - (b.need - b.adv));
  rows.forEach((r) => {
    bad++;
    console.log('  ✗ ' + r.a.file + '：' + r.a.text + '  与  ' + r.b.text);
    console.log('      推进 ' + r.adv.toFixed(2) + 'px < 底线 ' + r.need.toFixed(2) + 'px（字号 ' + r.a.size + '→' + r.b.size + '）');
  });
  console.log('\n结论：有 ' + bad + ' 处行距过窄（网页版同类结构请对齐 CSS 行高）\n');
}

process.exitCode = bad ? 1 : 0;
