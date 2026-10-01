/* 发布总门（R1.3 阶段二 ②）：node scripts/audit_release.js
   ==============================================================================
   真调前面五支（**各自的退出码就是判据**；起不来一律 BLOCKED，不当 PASS），
   再加：JS 语法检查 / 关键文件 / 关键页面与 handler / `packOptions.ignore` / 调试残留。
   全过（允许 WARN）→ 退出码 0；有 FAIL 或 BLOCKED → 1。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { boot, ROOT, JS } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('audit_release');

/* ---------- ① 前五支：真跑，拿它们的退出码与 RESULT 行 ---------- */
/* B 批（2026-10-01）新增 `audit_story`（剧情内容表）：内容"对不上"不会崩，
   但会在玩家那边变成空白页 —— 所以它和另外五支一样进发布总闸。 */
/* R1.4 数值轮新增五把（§五十 点名）：成长推进 / 经济模拟 / 掉落经济 / 命名世界观 / 揭示节奏。
   它们和前面几支一样进总闸 —— 数值轮改完必须整条链一起绿。 */
const SUBS = ['audit_balance', 'audit_routes', 'audit_pages', 'audit_text', 'audit_data',
  'audit_story', 'visual_story_audit', 'lore_timeline_audit', 'ad_text_audit',
  'progression_audit', 'economy_sim', 'drop_economy_audit', 'naming_lore_audit', 'lore_reveal_audit'];
SUBS.forEach((name) => {
  const file = path.join(__dirname, name + '.js');
  if (!fs.existsSync(file)) { R.blocked(name + ' 不存在', { expected: '能独立跑', actual: '缺文件' }); return; }
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [file], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  } catch (e) {
    out = String((e && (e.stdout || e.message)) || e);
    code = (e && typeof e.status === 'number') ? e.status : 1;
  }
  const line = (String(out).match(/RESULT: .*/) || ['RESULT: (没输出)'])[0];
  (code === 0 ? R.pass : R.fail)(name + ' 独立运行', { file: 'scripts/' + name + '.js', expected: '退出码 0', actual: '退出码 ' + code + ' · ' + line.trim() });
});

/* ---------- ② 语法检查：js/*.js + game.js（**真解析**，不是 grep） ---------- */
{
  const bad = [];
  const files = fs.readdirSync(JS).filter((f) => /\.js$/.test(f)).map((f) => 'js/' + f).concat(['game.js']);
  files.forEach((rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return;
    try { new Function(fs.readFileSync(p, 'utf8')); }
    catch (e) { bad.push(rel + ' → ' + e.message); }
  });
  (bad.length ? R.fail : R.pass)('全部源码语法可解析（' + files.length + ' 个 js）', {
    file: 'js/*.js', expected: '0 个语法错', actual: bad.length ? bad.slice(0, 4).join(' ; ') : '0 个',
  });
}

/* ---------- ③ 关键文件 / 关键页面 / 关键 handler ---------- */
{
  const need = ['game.js', 'game.json', 'project.config.json', 'js/core.js', 'js/data.js', 'js/cv.js', 'js/battle.js', 'js/dungeon.js'];
  const miss = need.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  (miss.length ? R.fail : R.pass)('关键文件都在', { expected: need.join(' , '), actual: miss.length ? ('缺 ' + miss.join(',')) : '齐' });
}
let E2 = null;
try { E2 = boot(); } catch (e) { R.blocked('加载游戏（页面/handler 检查要用）', { reason: String((e && e.message) || e) }); }
if (E2) {
  const CV = E2.CV;
  const pages = Object.keys(CV.panels || {});
  const needPages = ['home', 'dungeon', 'world', 'battle', 'corridor', 'arena', 'bag', 'roster', 'recruit', 'settings'];
  const missP = needPages.filter((p) => pages.indexOf(p) < 0);
  (missP.length ? R.fail : R.pass)('关键页面都已注册（' + pages.length + ' 页）', {
    file: 'js/cv.js', expected: needPages.join(' , '), actual: missP.length ? ('缺 ' + missP.join(',')) : '齐',
  });
  const needHandlers = ['battle_close', 'bag_batch', 'ball', 'bclear', 'bgo', 'bclose', 'open_settings', 'open_gameclub'];
  const missH = needHandlers.filter((h) => typeof (CV.onAct || {})[h] !== 'function');
  (missH.length ? R.fail : R.pass)('关键 handler 都注册了', {
    file: 'js/sc-*.js', expected: needHandlers.join(' , '), actual: missH.length ? ('缺 ' + missH.join(',')) : '齐',
  });
}

/* ---------- ④ 审计脚本不许进包（packOptions.ignore 里有 scripts/） ---------- */
{
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8')); } catch (e) {}
  const ig = ((cfg && cfg.packOptions && cfg.packOptions.ignore) || []);
  const ok = ig.some((x) => x && x.type === 'folder' && x.value === 'scripts');
  (ok ? R.pass : R.fail)('`scripts/` 已被 packOptions.ignore 排除（审计工具不进小游戏包）', {
    file: 'project.config.json', expected: "ignore 里有 {type:'folder',value:'scripts'}", actual: ok ? '有' : '没有',
  });
}

/* ---------- ⑤ 调试残留（**先认清项目自己的日志机制**，不是见 console.log 就红） ----------
   这个项目**故意**用 `console.log('[wxlh] …')` 做线上日志（`G.LOG` 那套环），所以：
     · `console.log` 只统计、最多 WARN；
     · `debugger` / `FIXME` / 明文 `TEST` 钩子才 FAIL。 */
{
  const files = fs.readdirSync(JS).filter((f) => /\.js$/.test(f)).map((f) => 'js/' + f).concat(['game.js']);
  let logs = 0; const hard = [];
  files.forEach((rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    logs += (src.match(/console\.log\(/g) || []).length;
    if (/\bdebugger\b/.test(src)) hard.push(rel + ' 有 debugger');
    if (/FIXME/.test(src)) hard.push(rel + ' 有 FIXME');
    if (/\bCE-SHOT\b/.test(src)) hard.push(rel + ' 有临时截图钩子（[CE-SHOT]）');
  });
  (hard.length ? R.fail : R.pass)('没有调试残留（debugger / FIXME / 临时截图钩子）', {
    file: 'js/*.js', expected: '0 处', actual: hard.length ? hard.slice(0, 4).join(' ; ') : '0 处',
  });
  if (logs > 0) R.warn('源码里有 ' + logs + ' 处 console.log（本项目用它做 `[wxlh]` 线上日志，**不计 FAIL**）', {
    file: 'js/*.js', expected: '与项目既有的日志机制一致', actual: logs + ' 处',
  });
}
R.finish();
