/* 2.1 叙事连续流验收：用项目自己的 CV/Core/Story 做 36 世界流程烟测。 */
const { boot } = require('./_env');
const R = (()=>{let p=0,f=0;return{ok(b,m){if(b){p++;console.log('[PASS]',m)}else{f++;console.log('[FAIL]',m)}},done(){console.log(`RESULT: ${p} PASS / ${f} FAIL`);process.exit(f?1:0)}}})();
let E;
try { E=boot(); } catch(e) { console.error(e); process.exit(1); }
const { G, Core } = E; const Story=G.Story; const D=E.D;
const ids=(D.WORLDS||[]).map(w=>w.id);
R.ok(ids.length===36,'36 worlds loaded into runtime');
let errors=[];
ids.forEach((wid,idx)=>{
  try {
    Core.newGame();
    Story.openWorld(wid,'in'); Story.skip();
    Story.openInterlude(wid); Story.skip();
    Story.openWorld(wid,'pre',{kind:'boss'}); Story.skip();
    Story.openWorld(wid,'post',{kind:'boss'});
    if(wid==='W36') {
      Story.skip();
      if(!Core.S.story.choice) E.CV.dispatch('story_choice:1');
      Story.skip();
    } else Story.skip();
  } catch(e) { errors.push(wid+':'+((e&&e.message)||e)); }
});
R.ok(!errors.length,'W01-W36 complete in→mid→pre→post flow has no runtime exception'+(errors.length?' ['+errors.join(' | ')+']':''));
R.ok(!!Core.S.story.choice,'W36 ending choice persists in story state');
R.done();
