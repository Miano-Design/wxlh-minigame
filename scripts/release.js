/* 一条命令发布：上传体验版 + **推手机预览**（父亲大人每次都要能在手机上看效果）
   ------------------------------------------------------------------------------
   用法：
     node scripts/release.js --desc "这次改了什么"     # 上传体验版（版本号取 game.js 的 GAME_VER）＋ 推手机预览
     node scripts/release.js --preview-only            # 只推预览（界面微调时用，不占体验版号）

   为什么要有这个脚本（父亲大人 2026-09-20："你以后每次修改都要上传手机端预览，不然我看不到效果"）：
   以前我只上传体验版、忘了推预览，父亲大人就得自己去点"编译并预览"。
   现在把"上传 + 推预览"绑成一条命令，并且在项目 AGENTS.md 里写成硬规矩 —— 漏一步就会在代码评审里被看见。

   注意：wechatide 需要在**非沙箱**环境里跑（本脚本会直接调用它，权限由调用方给）。
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const previewOnly = args.includes('--preview-only');
const descIdx = args.indexOf('--desc');
const desc = descIdx >= 0 ? (args[descIdx + 1] || '') : '';

/* 版本号从 game.js 读 —— 只认一处，避免"代码改了版本号没改" */
const ver = (/globalThis\.GAME_VER\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(PROJECT, 'game.js'), 'utf8')) || [])[1];
if (!ver) { console.error('✗ game.js 里找不到 GAME_VER'); process.exit(1); }

function run(label, cmdArgs) {
  process.stdout.write('▶ ' + label + ' … ');
  try {
    const out = execFileSync('wechatide', cmdArgs, { encoding: 'utf8' });
    const ok = /"success":\s*true|"ok":\s*true/.test(out);
    console.log(ok ? '成功' : '返回里没有 success（原样输出见下）');
    if (!ok) console.log(out.slice(-600));
    return ok;
  } catch (e) {
    console.log('失败');
    console.log(String((e.stdout || '') + (e.stderr || '')).slice(-800));
    return false;
  }
}

console.log('残域 · 小游戏发布（版本 ' + ver + '）');
let ok = true;
if (!previewOnly) {
  ok = run('上传体验版 ' + ver + (desc ? '（' + desc + '）' : ''),
    ['-c', 'Codex', 'upload', '--project', PROJECT, '--upload-version', ver].concat(desc ? ['--desc', desc] : [])) && ok;
} else {
  console.log('（--preview-only：跳过上传，只推预览）');
}
/* ★ 这一步是父亲大人要的"每次都要有"：推手机预览 */
ok = run('推手机预览 auto_preview', ['-c', 'Codex', 'auto_preview', '--project', PROJECT]) && ok;
console.log(ok ? '\n✓ 完成：手机微信里应该已经收到预览（开发者工具 → 预览 → 编译并预览）' : '\n✗ 有步骤失败，看上面的原始输出');
process.exitCode = ok ? 0 : 1;
