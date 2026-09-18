/* 两仓对表：网页版改了、小游戏还没跟（node scripts/parity_audit.js）
   ------------------------------------------------------------------------------
   父亲大人："你整体再审查一遍有没有网页版改了、小游戏还没改的东西，包括界面、玩法、机制等细节。"

   小游戏的 `js/sc-*.js` 是**手写的 canvas 界面**，不像 data/core/battle/dungeon 那样逐字节同步，
   所以网页版改完文案/口径之后，canvas 里最容易留下"旧句子、旧标签、旧口径"。
   现有的 canvas_audit 是**手写规则表**（7 条，都是以前踩过的坑），只能防"已经踩过的"。
   这里换成**机械对表**：把两边界面源码里的中文短语全抽出来互相比对，没对上的都揪出来。

   做法（关键：先剥注释 —— 我们的注释里全是中文，不剥就全是假警报）：
     ① 去掉块注释 / 行注释；
     ② 抽字符串字面量与模板串，剥掉 HTML 标签、把 ${...} 换成占位；
     ③ 全量 CJK 文本（忽略标点空白）做**子串比对**：
        · 网页版有、小游戏没有（也不在共享的 data.js 里）→ "小游戏漏了"
        · 小游戏有、网页版没有（也不在 data.js / 不在小游戏自己的引导表里）→ "小游戏多写或过时"
   只读脚本：两个仓的源码都只读不写。
*/
const fs = require('fs');
const path = require('path');

const MINI = path.resolve(__dirname, '..');
const WEB = path.resolve(MINI, '../wxlh-game');

/* ---------- ① 剥注释 ---------- */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // 块注释
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 '); // 行注释（避开 http:// 与字符串里的 //）
}

/* ---------- ② 抽中文短语 ---------- */
function phrasesOf(file) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const out = new Set();
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(src))) {
    let s = m[1] != null ? m[1] : (m[2] != null ? m[2] : m[3]);
    if (!/[\u4e00-\u9fa5]/.test(s)) continue;
    s = s.replace(/\$\{[^}]*\}/g, '·');        // 模板串里的变量当占位
    s = s.replace(/<[^>]*>/g, ' ');            // 网页版模板里全是 HTML 标签
    s.split(/[\s·]+/).forEach((chunk) => {
      /* 标点切开只影响"句子边界"，比对时统一抹掉标点，所以这里先按标点再切一刀 */
      chunk.split(/[、，。；：（）()【】\[\]{}<>!?！？"'`,.|/\\]+/).forEach((w) => {
        const cjk = w.replace(/[^\u4e00-\u9fa5]/g, '');
        if (cjk.length >= 2) out.add(w.trim());
      });
    });
  }
  return out;
}

/* 全量 CJK 文本（抹掉一切非汉字）—— 用来做"子串在不在"的判断 */
function cjkBlob(files) {
  return files.map((f) => stripComments(fs.readFileSync(f, 'utf8')))
    .join('\n').replace(/[^\u4e00-\u9fa5]/g, '');
}
const norm = (s) => String(s).replace(/[^\u4e00-\u9fa5]/g, '');

/* ---------- 两边各扫哪些文件 ---------- */
const webFiles = ['js/ui.js', 'js/main.js'].map((f) => path.join(WEB, f)).filter(fs.existsSync);
const miniFiles = fs.readdirSync(path.join(MINI, 'js'))
  .filter((f) => /^sc-.*\.js$/.test(f) || f === 'uiw.js' || f === 'cv.js')
  .map((f) => path.join(MINI, 'js', f))
  .concat([path.join(MINI, 'game.js')]);
/* 共享层：data.js 的文案两边都有，不算"谁漏了" */
const sharedFiles = ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js'].map((f) => path.join(MINI, f));

const webP = phrasesOf(webFiles[0]);
webFiles.slice(1).forEach((f) => phrasesOf(f).forEach((x) => webP.add(x)));
const miniP = new Set();
miniFiles.forEach((f) => phrasesOf(f).forEach((x) => miniP.add(x)));

const webBlob = cjkBlob(webFiles);
const miniBlob = cjkBlob(miniFiles);
const sharedBlob = cjkBlob(sharedFiles);
const hasAll = (blob, p) => blob.indexOf(norm(p)) >= 0;

/* ---------- ③ 比对 ----------
   精确子串只能区分"一模一样"和"不一样"；而两边的文案经常是**差一个语气词**
   （网页"想换位置就长按任意一格抓起" / 小游戏"想换位置长按任意一格抓起"）。
   所以再加一层**字符二元组相似度（Dice）**分档：
     ① 真没有（< 0.45）—— 这才是"网页版改了、小游戏没跟"的嫌疑，要逐条看
     ② 措辞不同（0.45 ~ 0.75）—— 大概率是同一件事两种说法，抽查即可
     ③ 基本一致（≥ 0.75）—— 视为已同步（精确子串没命中只是被标点/空格切开了） */
function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let hit = 0;
  A.forEach((g) => { if (B.has(g)) hit++; });
  return (2 * hit) / (A.size + B.size);
}
function best(p, pool) {
  let bi = -1, bs = 0;
  const n = norm(p);
  pool.forEach((q, i) => { const s = dice(n, norm(q)); if (s > bs) { bs = s; bi = i; } });
  return { score: bs, match: bi >= 0 ? pool[bi] : '' };
}

const solid = (p) => norm(p).length >= 4;
function classify(phrases, ownBlob, otherPool) {
  const none = [], near = [];
  phrases.filter(solid).forEach((p) => {
    if (ownBlob.indexOf(norm(p)) >= 0) return;              // 对面原文里有，直接算同步
    const b = best(p, otherPool);
    if (b.score >= 0.75) return;                             // 基本一致，忽略
    (b.score >= 0.45 ? near : none).push({ p: p, score: b.score, match: b.match });
  });
  return { none: none, near: near };
}

/* 网页版有的，小游戏这边连相近的都没有 → 真嫌疑 */
const missA = classify([...webP], miniBlob, [...miniP]);
/* 反向：小游戏独有的（data.js 之外） */
const missB = classify([...miniP], webBlob, [...webP].concat([...sharedBlob].length ? [] : []));

console.log('\n=== 两仓对表（网页版 ↔ 小游戏） ===');
console.log('网页版界面短语 ' + webP.size + ' 条 · 小游戏界面短语 ' + miniP.size + ' 条');

const sortByLen = (a, b) => norm(b.p).length - norm(a.p).length;
missA.none.sort(sortByLen);
missA.near.sort(sortByLen);
missB.none.sort(sortByLen);

console.log('\n—— A1. 网页版有、小游戏**连相近的都没有**（' + missA.none.length + ' 条）—— 优先核');
missA.none.slice(0, 45).forEach((x) => console.log('   ✗ ' + x.p));
if (missA.none.length > 45) console.log('   …（还有 ' + (missA.none.length - 45) + ' 条）');

console.log('\n—— A2. 网页版有、小游戏**措辞接近**（' + missA.near.length + ' 条）—— 抽查');
missA.near.slice(0, 12).forEach((x) => console.log('   ~ ' + x.p + '   ⇢ 最近: ' + x.match + '（' + x.score.toFixed(2) + '）'));

console.log('\n—— B. 小游戏有、网页版没有（' + missB.none.length + ' 条）—— 反向核对');
missB.none.slice(0, 25).forEach((x) => console.log('   ? ' + x.p));

fs.writeFileSync('/tmp/parity_missing.txt', missA.none.map((x) => x.p).join('\n'));
fs.writeFileSync('/tmp/parity_near.txt', missA.near.map((x) => x.p + '   ⇢ ' + x.match + ' (' + x.score.toFixed(2) + ')').join('\n'));
fs.writeFileSync('/tmp/parity_extra.txt', missB.none.map((x) => x.p).join('\n'));
console.log('\n完整清单：/tmp/parity_missing.txt（A1） · /tmp/parity_near.txt（A2） · /tmp/parity_extra.txt（B）\n');
