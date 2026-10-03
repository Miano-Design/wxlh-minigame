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
const story=fs.readFileSync('js/sc-story.js','utf8'); ok(story.includes('cur.meta.worldId === \'W36\''),'W36 end choice hook exists'); ok(story.includes('cur.autoAt = now + 0.72'),'auto advance delay exists'); ok(story.includes('cur.autoAt = now + 0.35'),'chapter auto advance exists'); ok(story.includes('if (cur.chapter) return Story.autoOn()'),'save-power mode cannot freeze auto story'); ok(story.includes('W36 终局不是普通剧情'),'W36 skip cannot bypass final choice'); ok(story.includes('const tail = n === 1'),'W36 choice has consequence epilogue');
const dun=fs.readFileSync('js/sc-dungeon.js','utf8'); ok(dun.includes("St.hasInterlude && St.hasInterlude(view.worldId)"),'stage-6 interlude trigger exists'); ok(dun.includes('postStoryAfterClose'),'boss-clear auto post hook exists');
console.log(JSON.stringify({pass,fail})); process.exit(fail?1:0);
