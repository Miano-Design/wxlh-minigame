/* 六支 audit 的统一输出与退出码（任务书 §二）：
     [PASS]/[WARN]/[FAIL]/[BLOCKED] 每条带 file / line / expected / actual
     RESULT: n PASS / n WARN / n FAIL / n BLOCKED
     STATUS: PASS | FAIL | INCOMPLETE
   退出码：全过（允许 WARN）→ 0；有 FAIL 或 BLOCKED → 1。**没测到不许当通过。** */
function makeReport(name) {
  const rows = [];
  const add = (kind, item, ev) => {
    ev = ev || {};
    rows.push({ kind, item, ev });
    console.log('[' + kind + '] ' + item);
    if (ev.file) console.log('  file: ' + ev.file + (ev.line ? ':' + ev.line : ''));
    if (ev.expected !== undefined) console.log('  expected: ' + ev.expected);
    if (ev.actual !== undefined) console.log('  actual: ' + ev.actual);
    if (ev.reason !== undefined) console.log('  reason: ' + ev.reason);
  };
  return {
    name,
    pass: (i, e) => add('PASS', i, e),
    warn: (i, e) => add('WARN', i, e),
    fail: (i, e) => add('FAIL', i, e),
    blocked: (i, e) => add('BLOCKED', i, e),
    note: (s) => console.log('  · ' + s),
    finish() {
      const c = (k) => rows.filter((r) => r.kind === k).length;
      const bad = c('FAIL') + c('BLOCKED');
      console.log('\n--------------------------------');
      console.log('[' + (bad ? 'FAIL' : 'PASS') + '] ' + name);
      console.log('RESULT: ' + c('PASS') + ' PASS / ' + c('WARN') + ' WARN / ' + c('FAIL') + ' FAIL / ' + c('BLOCKED') + ' BLOCKED');
      console.log('STATUS: ' + (c('BLOCKED') ? 'INCOMPLETE' : (bad ? 'FAIL' : 'PASS')));
      process.exitCode = bad ? 1 : 0;
      return bad === 0;
    },
  };
}
module.exports = { makeReport };
