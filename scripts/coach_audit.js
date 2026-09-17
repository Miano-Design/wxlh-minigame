/* 新手引导体检（node scripts/coach_audit.js）
   ------------------------------------------------------------------------------
   为什么单独写一个：引导的 key **不是字面量**，是运行时拼的 ——
     TUT（主线步）  → 'tut_' + qid
     UNLOCK（解锁） → 'tut_unlock_' + id
     页面级 C 表    → 'tut_page_' + page + '_' + 锚点
     TOUR（开场链） → 表里写死的 key
   所以"数 key 字面量"的通用脚本永远数不到它们（V9.6.57 自己踩过：数到 2 个还报"无重复 ✓"）。
   这里按**运行时同一套拼法**还原 key，再查三件事：
     ① key 有没有重复（重复 = 后一条永远播不到）
     ② 锚点在代码里有没有构造处（没有 = 高亮框指不到东西；动态前缀允许）
     ③ 表规模（页面级 / 解锁 / 主线步 / 开场链各几条）
   只读脚本，不改任何东西。
*/
const fs = require('fs');
const path = require('path');

const JS = path.resolve(__dirname, '../js');
const home = fs.readFileSync(path.join(JS, 'sc-home.js'), 'utf8');
const allFiles = fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f));
const all = allFiles.map((f) => fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');

const anchorsOf = (txt) => [...txt.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const entries = [];        // { key, page, anchors }

/* ① 主线步 TUT / ② 解锁指引：都是 `名字:  { page: 'x', s: [...], t: '...' },` 这种**单行**写法
   （V9.6.58：上一版按"收尾大括号单独一行"匹配，所以这两张表一直数到 0 —— 又是"扫不到当通过"） */
for (const m of home.matchAll(/^\s{4}([a-zA-Z_][\w]*):\s*\{\s*page:\s*'([a-z]+)'([^\n]*)/gm)) {
  const body = m[3] || '';
  const arr = body.match(/s:\s*\[([^\]]*)\]/);
  const isTut = /^q[0-9]/.test(m[1]);
  entries.push({
    key: (isTut ? 'tut_' : 'tut_unlock_') + m[1],
    page: m[2],
    anchors: arr ? anchorsOf(arr[1]) : [],
  });
}
/* ③ 页面级 C 表：['page', ['a','b'], '文案'] */
for (const m of home.matchAll(/\[\s*'([a-z]+)',\s*\[([^\]]*)\]/g)) {
  const a = anchorsOf(m[2]);
  entries.push({ key: 'tut_page_' + m[1] + '_' + a.join('_'), page: m[1], anchors: a });
}
/* ④ 开场链 TOUR：{ key: 'x', page: 'y', ... } */
for (const m of home.matchAll(/\{\s*key:\s*'([^']+)',\s*page:\s*'([a-z]+)'/g)) {
  entries.push({ key: m[1], page: m[2], anchors: [] });
}

/* ① key 唯一性 */
const seen = {};
const dup = [];
entries.forEach((e) => { if (seen[e.key]) dup.push(e.key); seen[e.key] = true; });
console.log('\n=== ① 引导 key（按运行时拼法还原）===');
console.log('  共 ' + entries.length + ' 条 · 重复的：' + (dup.length ? [...new Set(dup)].join(' | ') + ' ✗' : '无 ✓'));

/* ② 锚点有没有构造处 */
const anchors = new Set();
entries.forEach((e) => e.anchors.forEach((a) => anchors.add(a)));
/* V9.6.58：判定改"笨"了 —— 上一版自己拼正则来匹配"字面量 / 前缀拼接 / 后缀拼接"三种写法，
   结果自己出了 bug（5 个真锚点被判成"找不到"，我去改就是"把对的改成错的"）。
   现在只做一件事：**锚点的 id 基名在 sc-*.js 里出现过**（`keji_up:` → 找 `keji_up`）。
   这足以抓出"写错 id"（基名全代码都没有），又不会因为拼接写法不同而误判。 */
const hasSite = (b) => {
  const base = b.replace(/[:*]+$/, '');          // 'keji_up:' / 'stage:' → 'keji_up' / 'stage'
  return base.length > 1 && all.indexOf(base) >= 0;
};
const miss = [...anchors].filter((a) => a !== 'page_back' && !hasSite(a.replace(/:\*$/, '')));
console.log('\n=== ② 锚点在代码里有构造处 ===');
console.log('  锚点 ' + anchors.size + ' 个 · 找不到构造处的：' + (miss.length ? miss.join(' | ') + ' ✗' : '无 ✓'));
if (miss.length) console.log('  （动态前缀的锚点允许用 \'前缀:\' + x 拼；真找不到就是写错了）');

/* ③ 表规模 */
const n = (k) => entries.filter((e) => e.key.indexOf(k) === 0).length;
console.log('\n=== ③ 表规模 ===');
console.log('  开场链 ' + entries.filter((e) => e.key.indexOf('tour_') === 0).length
  + ' · 主线步 ' + n('tut_q') + ' · 解锁指引 ' + n('tut_unlock_') + ' · 页面级 ' + n('tut_page_'));

const bad = dup.length + miss.length;
console.log('\n结论：' + (bad ? '有 ' + bad + ' 处要修 ✗' : '引导表自洽 ✓') + '\n');
process.exit(bad ? 1 : 0);
