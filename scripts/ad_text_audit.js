/* 广告文案与真实状态一致性（2026-10-01 · 父亲大人 §十六/§十七）：
   node scripts/ad_text_audit.js
   ==============================================================================
   为什么单开这一把：父亲大人实测到「扫荡那颗按钮写着*今日还剩 1 次*，点下去回
   *今天看广告的次数用完了*」——
   **页面自己算了一个数，而真正拦人的那一道闸在别处**。这类 bug 尺子不盯就永远重犯。

   两条断言：
     ① **静态**：全仓"今日还剩"这句话只能出现在**读了统一状态**的地方
        （`AD.status(` / `AD.quotaText(` / 兼容期的 `AD.left(`），不许页面自己写死数。
     ② **行为**：把某个点位的配额用光之后，`AD.status(slot)` 必须翻成 `ok:false`
        且 `AD.quotaText(slot)` 说出"用完了"；**全局总闸不限次数**（父亲大人 2026-10-01 裁定），
        所以总闸那一道永远不该成为拦人的理由。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeReport } = require('./_report');
const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'js');
const R = makeReport('ad_text_audit');
function t(item, ok, expected, actual) {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
  return ok;
}
function stripComments(s) {
  /* ⚠️ 块注释要**换成同数量的空白但保留换行** —— 直接换成一个空格会把行号整体前移，
     后面报出来的行号就全是错的（第一版就是这么错的，别改回去）。 */
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ---------- ① 静态：那句话只能跟统一状态绑在一起 ---------- */
{
  const files = fs.readdirSync(JS).filter((f) => /\.js$/.test(f));
  const bad = [];
  files.forEach((f) => {
    const lines = stripComments(fs.readFileSync(path.join(JS, f), 'utf8')).split('\n');
    lines.forEach((ln, i) => {
      if (ln.indexOf('今日还剩') < 0) return;
      /* ⚠️ 只管**广告**那一类。
         "今日还剩 N 次"这句话在别处也合法 —— 斗法台场次、免费抽次数都是**玩法配额**
         （`Core.arenaLeft` / 免费抽），跟广告无关、也不走 AD。所以判据是
         "这句话附近有『广告』字样"才算命中这一条。 */
      const near = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      if (near.indexOf('广告') < 0) return;
      /* 允许的真源：点位/总闸/统一状态。`totalLeft(` 也算 —— 它是全局总闸的唯一读法
         （GM 调试面板那一行读的就是它）。 */
      if (!/AD\.(status|quotaText|left|totalLeft)\s*\(/.test(near)) bad.push(f + ':' + (i + 1));
    });
  });
  t('① 全仓「今日还剩」只出现在读了统一状态的地方',
    bad.length === 0, '每处都在 AD.status / AD.quotaText / AD.left 旁边',
    bad.length ? bad.join(' ') : '全部合规');
  /* 页面不许自己拿 AD.left 当禁用判据（判据统一走 status） */
  const misuse = [];
  files.forEach((f) => {
    const s = stripComments(fs.readFileSync(path.join(JS, f), 'utf8'));
    if (/\bAD\.left\s*\(/.test(s) && !/AD\.status\s*\(/.test(s)) misuse.push(f);
  });
  t('①-b 页面不再单拿 `AD.left` 当判据（都改读 `AD.status`）',
    misuse.length === 0, '用 AD.left 的文件里同时有 AD.status',
    misuse.length ? misuse.join(' ') : '全部合规');
}

/* ---------- ② 行为：配额用光后状态真的翻脸 ---------- */
{
  let env = null;
  try { env = require('./_env').boot({ width: 390, height: 844 }); } catch (e) { env = null; }
  const AD = env && env.G && env.G.AD;
  if (!AD || !AD.status) {
    R.blocked('② 广告统一状态：`AD.status` 不存在（模块没加载起来）',
      { expected: '能 boot 出 G.AD.status', actual: String(typeof AD) });
  } else {
    t('② 全局总闸**不限次数**（父亲大人 2026-10-01 裁定）',
      AD.totalUnlimited === true && AD.totalLeft() === Infinity,
      'totalUnlimited=true · totalLeft()=Infinity',
      'totalUnlimited=' + AD.totalUnlimited + ' · totalLeft()=' + AD.totalLeft());

    /* 扫荡：把点位配额用光 → 状态必须翻成"今天次数已用完"，且**不许**说成总闸的问题 */
    if (!env.Core.S) env.Core.newGame({});
    const slot = 'sweep_plus';
    const before = AD.status(slot);
    let n = 0;
    while (AD.status(slot).ok && n < 50) { AD.show(slot).then(() => {}); n++; }
    const after = AD.status(slot);
    t('② 点位配额用光后 `AD.status` 翻成不可用、文案说"次数已用完"',
      before.ok === true && after.ok === false && after.reason === 'quota',
      '前 ok=true · 后 ok=false 且 reason=quota',
      '前 ok=' + before.ok + ' · 后 ok=' + after.ok + ' reason=' + after.reason + ' · 用了 ' + n + ' 次');
    t('②-b 用光之后 `AD.quotaText` 不再说"今日还剩 N 次"',
      AD.quotaText(slot).indexOf('今日还剩') < 0, '不含"今日还剩"',
      AD.quotaText(slot));
    /* 总闸那一档：不限次数时**永不**成为 reason */
    t('②-c 总闸不会成为拦人理由（reason 永不为 total）',
      after.reason !== 'total', 'reason ≠ total', 'reason=' + (after.reason || '（无）'));
  }
}

R.finish();
