const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.cwd();
let pass=0,fail=0; const ok=(b,m)=>{if(b){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const ctx={};ctx.globalThis=ctx;ctx.GameGlobal=ctx;vm.runInNewContext(fs.readFileSync('js/sc-story-data.js','utf8'),ctx);vm.runInNewContext(fs.readFileSync('js/sc-story-overhaul-data.js','utf8'),ctx);
const S=ctx.STORYDATA; const ids=Object.keys(S.WORLDS); ok(ids.length===36,'36 worlds present');
let bad=[]; ids.forEach(id=>{const w=S.WORLDS[id]; if(!w.midstory||!w.midstory.length) bad.push(id);}); ok(!bad.length,'all worlds have 1+ midstory beats'+(bad.length?' ['+bad.join(',')+']':''));
/* ================= 2026-10-03: 密度口径跟着"单源"改 =================
   原来这两条钉的是「每段 >= 2 拍」+「midstory >= 2 拍」—— 那是 2.1 的**叙事追加层**
   （sc-story-overhaul-data.js 的 RICH 表）负责补足的量。视觉资产驱动重构之后那张表退役了
   （它的台词全是为旧世界身份写的），每个世界的叙事改由 sc-story-data.js **一处承担**，
   每段 1~2 拍。所以判据改成"每段至少 1 拍、不许空"，并保留"36 个世界都得有"。
   ⚠️ 这是**内容量**的下调，不是判据失效：想让每段回到 2 拍，就在 sc-story-data.js 里补，
      不许把旧追加层接回来（那会把旧世界的句子重新送上屏）。 */
let richBad=[]; ids.forEach(id=>{const w=S.WORLDS[id]; for(const p of ['in','pre','post']) if(!w[p]||!w[p].length) richBad.push(id+':'+p)}); ok(!richBad.length,'all worlds have 1+ beats in each main segment'+(richBad.length?' ['+richBad.slice(0,8).join(',')+'...]':''));
const game=fs.readFileSync('game.js','utf8'); ok(game.includes("require('./js/sc-story-overhaul-data.js')"),'game loads 2.1 story extension'); ok(/GAME_VER\s*=\s*'2\.1\.0'/.test(game),'version 2.1.0');
const story=fs.readFileSync('js/sc-story.js','utf8'); ok(story.includes('cur.meta.worldId === \'W36\''),'W36 end choice hook exists'); /* ================= 2026-10-03（父亲大人：「战斗剧情跳的太快了，不符合正常阅读速度」）=================
   原来这两条钉的是写死的两个数（0.72 秒 / 0.35 秒）—— 那正是"跳太快"的根源。
   现在正文的停留**按这一拍自己的字数算**（`beatReadSec()`：5.5 字/秒 + 0.8 秒起步，
   下限 2.6 秒、上限 9 秒），卷名卡固定 1.6 秒。判据改成钉**这条口径**本身：
   只要有人把它改回"写死的常数"，这两条当场红。 */
ok(story.includes('cur.autoAt = now + beatReadSec()'),'auto advance delay is reading-speed based');
ok(story.includes('function beatReadSec()') && /READ_CPS\s*=\s*5\.5/.test(story),'reading speed constant exists (5.5 chars/s)');
ok(story.includes('cur.autoAt = now + 1.6'),'chapter card delay exists (1.6s)'); ok(story.includes('if (cur.chapter) return Story.autoOn()'),'save-power mode cannot freeze auto story'); ok(story.includes('W36 终局不是普通剧情'),'W36 skip cannot bypass final choice');
/* ================= 2026-10-03（NARRATIVE-UX-FINAL §十二 / §十三）· **判据过时，已改** =================
   原来这条钉的是播放器里的一个字面量（`const tail = n === 1`，旧世界身份写的那三句
   "王座后的九十六盏灯 / 转身走下王座"）。本轮两个结局的正文搬到**内容层**
   （`js/sc-story-overhaul-data.js` 的 `SD.ENDING.off` / `.on`），播放器只做搬运。
   判据跟着换成"这两件事必须同时成立"，钉的仍然是**结果**（两个结局都有正文、而且只有一个真源）：
     · 播放器确实从 `STORYDATA.ENDING` 取，而且两个分支都接了；
     · 内容层确实有 `off` / `on` 两套正文。 */
const over=fs.readFileSync('js/sc-story-overhaul-data.js','utf8');
ok(/STORYDATA\.ENDING/.test(story) && /E\.off\.lines/.test(story) && /E\.on\.lines/.test(story),'W36 choice epilogue reads the single-source ENDING data');
ok(/const ENDING = \{/.test(over) && /off: \{/.test(over) && /on: \{/.test(over),'ENDING data carries both endings (off / on)');
const dun=fs.readFileSync('js/sc-dungeon.js','utf8'); ok(dun.includes("St.hasInterlude && St.hasInterlude(view.worldId)"),'stage-6 interlude trigger exists'); ok(dun.includes('postStoryAfterClose'),'boss-clear auto post hook exists');
console.log(JSON.stringify({pass,fail})); process.exit(fail?1:0);
