(function(){ const G=(typeof GameGlobal!=='undefined')?GameGlobal:globalThis; const SD=G.STORYDATA; if(!SD||!SD.WORLDS) return;
/* ================= 2026-10-03（视觉资产驱动剧情重构）· 追加层退役 =================
   这一份是 2.1 的**叙事追加层**：它把每个世界的 in / pre / post 再往后接一段、并把 `midstory`
   整段替换掉。问题是那些台词全是**为旧世界身份写的** —— 旧 W07 是"酣眠迷境"、旧 W18 是
   "白墙疗养院"、旧 W36 的 Boss 是"终焉·灯主"。新图到位之后，玩家会先读到新世界的句子，
   紧接着读到这些旧世界的句子（"图是森林，文案讲船"），正是任务书明令禁止的那一种。
   所以：**RICH 清空**（一句旧台词都不再上屏）。每个世界的完整叙事现在只由
   `js/sc-story-data.js` 的 in / pre / mid / post 承担 —— 一处真源。
   ⚠️ **功能没砍**：中段插叙（`midstory`）在下面退回该世界自己新写的 `mid` 那一拍，
      章节推进 / 自动播放 / STORY21 那些开关一个字没动（`story_2_1_audit` 仍绿）。
   ⚠️ 要恢复"追加层"这种写法可以，但内容必须按当前世界身份重写，不许把这张表原样接回来。 */
const RICH = {};
/* 中段插叙：追加层退役之后，插叙的内容＝这个世界 `mid` 那一拍（新身份写的），不再另写一份。 */
Object.keys(SD.WORLDS||{}).forEach(function(id){ const w=SD.WORLDS[id]; if(!w) return;
  if(!w.midstory || !w.midstory.length) w.midstory = (w.mid || []).concat((w.post || []).slice(0, 1)); });
SD.STORY21={version:'2.1.0',worldCount:36,stageInterlude:6,autoPost:true,rich:true}; G.STORYDATA=SD; })();
