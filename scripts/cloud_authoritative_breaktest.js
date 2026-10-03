/* 云同步「反向破坏测试」（2026-10-03 任务书 §二十）：node scripts/cloud_authoritative_breaktest.js
   ==============================================================================
   一把尺子**绿了**不等于它**能盯住东西** —— 绿也可能是因为它压根没测到。
   所以这一把专门干一件事：**把任务书点名要消灭的 7 种旧行为，一个一个塞回源码**，
   每塞回一个就跑一次 `cloud_authoritative_regression`，**要求它变红**。
   塞回去还是绿的 ⇒ 说明那把尺子没盯住这条，当场判 FAIL。

   7 个破坏点（与任务书 §二十 一一对应）：
     ① 恢复 `cloudTs > localTs` 才允许自动 pull
     ② `onShow` 不拉（切回前台拿不到云端最新）
     ③ 被顶号设备**自动 reclaim**（抢回写权）
     ④ 把 `DB_ERROR` 当成"没有存档"
     ⑤ `busy` 直接吞掉待提交的 push
     ⑥ 手动「找回存档」另走一条路（与自动同步不同逻辑）
     ⑦ `onShow` 顺手 claim（把"回前台"当成一次重新登录）

   ⚠️ 做法是**就地改 js/sc-cloud.js → 跑回归 → 无论成败都还原**（还原写在 finally 里），
      并且开头先确认"没破坏时回归是绿的"（控制组）——不然"破坏后红了"可能只是本来就红。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeReport } = require('./_report');
const R = makeReport('cloud_authoritative_breaktest');
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'js', 'sc-cloud.js');
const AUDIT = path.join(__dirname, 'cloud_authoritative_regression.js');

function auditPasses() {
  try {
    execFileSync(process.execPath, [AUDIT], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    return true;
  } catch (e) { return false; }
}

const BREAKS = [
  { name: '① 恢复「cloudTs > localTs 才允许自动 pull」',
    /* ⚠️ 第一版把这个判据塞在 `sync` 里那条分支上 —— 结果回归**照旧是绿的**：
       那条分支只在"本机握着写权"时走到，而范本 1/2（云端更新）走的是**另一条**
       （被顶号 / 没有写权那一条，它直接调 `pullAuthoritativeCloud`）。
       旧 bug 的位置就在 `pullAuthoritativeCloud` 里那一下 apply —— 破坏测试要打在**那儿**才有意义。 */
    find: "      const r = applyCloudSave(String(doc.payload), Number(doc.ts) || 0, 'cloud');",
    repl: "      const r = ((Number(doc.ts) || 0) > localTs()) ? applyCloudSave(String(doc.payload), Number(doc.ts) || 0, 'cloud') : { ok: false, skip: 'stale' };" },
  { name: '② onShow 不拉（切回前台拿不到云端最新）',
    find: '    const opts2 = (raw === \'boot\') ? { claim: true }',
    repl: '    if (raw === \'show\') return Promise.resolve({ ok: true, skip: \'off\' });\n    const opts2 = (raw === \'boot\') ? { claim: true }' },
  { name: '③ 被顶号设备自动 reclaim（抢回写权）',
    /* ⚠️ 同样：这一版的实际结构里没有 `if (!leaseMine) {` 这个分支（那是早先一次没落上的改法）。
       现在"被顶号"走的是 `reallyBehind` 那条 —— 破坏就打在那儿。 */
    find: '        const reallyBehind = !!superseded;',
    repl: '        const reallyBehind = !!superseded; try { claimLease(doc); } catch (e0) {}' },
  { name: '④ 把 DB_ERROR 当成「没有存档」',
    find: "          resolve({ ok: false, why: why, code: String(r.code || ''), stage: String(r.stage || ''), lease: r.lease || null });",
    repl: '          resolve({ ok: true, doc: null });' },
  { name: '⑤ busy 直接吞掉待提交的 push',
    find: '      if (wantPush) pendingPush = true;                    // §十二：忙也不许把新进度吞掉',
    repl: '      /* 破坏：吞掉 */' },
  { name: '⑥ 手动「找回存档」另走一条路（与自动同步不同逻辑）',
    find: '    if (preDoc) return Promise.resolve(use(preDoc));       // 调用方已经拿到那份 doc（找回存档那个选择器）',
    repl: '    if (reason === \'manual\') return Promise.resolve({ ok: true, hasDoc: true, took: \'cloud\', ts: 0, bytes: 0 });\n    if (preDoc) return Promise.resolve(use(preDoc));' },
  { name: '⑦ onShow 顺手 claim（把"回前台"当成一次重新登录）',
    /* §七 点名：回了前台**不是**重新登录，只许拉。旧行为是"开机 / 回前台都占一次位"。
       破坏打在触发口那一句上 —— 回归第 4 条现在同时盯"拉到了没有"和"claim 有没有发生"。 */
    find: "    const opts2 = (raw === 'boot') ? { claim: true }",
    repl: "    const opts2 = (raw === 'boot' || raw === 'show') ? { claim: true }" },
];

const orig = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0;
const t = (item, ok, expected, actual) => {
  if (ok) { pass++; R.pass(item, { expected: expected, actual: actual }); }
  else { fail++; R.fail(item, { expected: expected, actual: actual }); }
};

try {
  /* ---------- 控制组：没破坏的时候，回归尺子必须是绿的 ---------- */
  t('控制组：源码原样时 cloud_authoritative_regression 是绿的',
    auditPasses() === true, '绿（退出码 0）', auditPasses() ? '绿' : '**红的 → 下面的破坏测试没有意义**');

  BREAKS.forEach((b) => {
    const patched = orig.replace(b.find, b.repl);
    if (patched === orig) {
      t(b.name + ' → 回归尺子必须变红', false, '破坏点生效且回归变红',
        '**破坏点没找到匹配的源码**（find 没命中）—— 尺子要跟着实现更新');
      return;
    }
    let passed;
    try {
      fs.writeFileSync(FILE, patched);
      passed = auditPasses();
    } finally {
      fs.writeFileSync(FILE, orig);            // ← 无论成败都还原
    }
    t(b.name + ' → 回归尺子必须变红', passed === false,
      '把这条旧行为塞回去 ⇒ 回归必须红',
      passed ? '**还是绿的 —— 回归尺子没盯住这条**' : '红了 ✓');
  });
} finally {
  try { fs.writeFileSync(FILE, orig); } catch (e) {}     // 双保险
}

/* 收尾自证：还原之后源码必须与开头**逐字节相同**（不然这一把会污染工作区） */
{
  const now = fs.readFileSync(FILE, 'utf8');
  t('收尾：源码逐字节还原（这一把不会污染工作区）', now === orig,
    '与开跑前完全一致', now === orig ? '一致（' + now.length + ' 字节）' : '**被改动了**');
}
R.finish();
