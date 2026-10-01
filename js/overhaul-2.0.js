/* 残域 2.0 · 全面重构运行层
   目标：把旧版“系统目录”收束成玩家旅程驱动的三个核心动作：探索 / 变强 / 发现。
   这不是并行 UI：本文件在全部旧页面加载之后执行，直接替换 CV.panels 中的首页/成长/残域，
   并补齐统一战斗 HUD 与返回现场恢复。旧 Core/Battle 数据接口继续作为唯一业务真相。 */
(function(){
  'use strict';
  const G=(typeof GameGlobal!=='undefined')?GameGlobal:globalThis;
  const CV=G.CV,U=G.U,Core=G.Core,D=G.DATA;
  if(!CV||!U||!Core||!D) return;
  const prev={home:CV.panels.home,grow:CV.panels.grow,dungeon:CV.panels.dungeon,battle:CV.panels.battle};
  const fmt=G.fmt||function(n){n=Math.floor(n||0);if(n>=1e8)return Math.round(n/1e8)+'亿';if(n>=1e4)return Math.round(n/1e4)+'万';return String(n);};
  function S(){return Core.S||{};}
  function unlockedWorlds(){
    const s=S(), out=[];
    (D.WORLDS||[]).forEach(function(w){ if(s.worlds&&s.worlds[w.id]&&s.worlds[w.id].unlocked) out.push(w); });
    return out;
  }
  function currentWorld(){
    const ws=unlockedWorlds(); if(!ws.length) return D.WORLDS[0];
    return ws[ws.length-1];
  }
  function nextStage(wid,diff){
    const st=(S().worlds&&S().worlds[wid])||{};
    const a=(st.stages&&st.stages[diff])||[];
    for(let i=0;i<a.length;i++) if(!a[i]) return i;
    return -1;
  }
  function dailySignals(){
    const s=S(), a=[];
    try { const t=Core.todayState&&Core.todayState(); if(t&&t.claimable) a.push(['open_tasks','任务可领']); } catch(e){}
    try { const sg=Core.signState&&Core.signState(); if(sg&&sg.canDraw) a.push(['open_sign','今日点灯']); } catch(e){}
    try { if(Core.freeRecruitAvailable&&Core.freeRecruitAvailable()) a.push(['open_recruit','免费招募']); } catch(e){}
    try { const cd=Core.codexState&&Core.codexState(); if(cd&&cd.claimable) a.push(['open_codex','图鉴可领']); } catch(e){}
    return a.slice(0,3);
  }
  function storyLine(w){
    try { if(G.Story&&G.Story.clueOf) return G.Story.clueOf(w.id,'post')||G.Story.clueOf(w.id,'in')||''; } catch(e){} return '';
  }
  function renderHome(){
    const s=S(), w=currentWorld(), st=(s.worlds&&s.worlds[w.id])||{stages:{normal:[]}}, stage=nextStage(w.id,'normal');
    const prog=(st.stages&&st.stages.normal||[]).filter(Boolean).length;
    U.begin();
    U.card(function(){
      U.pageHead('灯阁');
    },{padY:0});
    /* pageHead 在卡片 dry-pass 中不能画，所以把它移除：真实页头由后面重新登记 */
    /* 重新开始正文 */
    U.y=CV.headH()+CV.TOP+8;
    U.card(function(){
      U.hint('当前旅程',0,CV.C.dim);
      CV.text(w.name,U.ix(),U.y+2*CV.SCALE,{size:CV.FS.f2,bold:true});
      U.y+=24*CV.SCALE;
      U.note(stage>=0?'第 '+(stage+1)+'/12 关 · '+String(w.mechanic).split('：')[0]:'普通难度 12/12 已完成',4*CV.SCALE);
      const bw=U.iw(), by=U.y+8*CV.SCALE;
      CV.round(U.ix(),by,bw,5*CV.SCALE,3*CV.SCALE,CV.a(CV.C.line,.8),null);
      const p=stage>=0?prog/12:1;
      CV.round(U.ix(),by,bw*Math.max(0,Math.min(1,p)),5*CV.SCALE,3*CV.SCALE,CV.C.gold,null);
      U.y=by+14*CV.SCALE;
      if(stage>=0){ U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,'继续探索','primary','ov_continue'); U.y+=U.BTN_H*CV.SCALE; }
      else { U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,'进入下一世界','primary','ov_continue'); U.y+=U.BTN_H*CV.SCALE; }
    });
    const clue=storyLine(w);
    if(clue){ U.card(function(){ U.h3('刚刚发现', '不是必须现在看'); U.note(clue,2*CV.SCALE); U.space(CV.SP[1]); U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'打开故事','ghost','ov_story'); U.y+=U.BTN_SM*CV.SCALE; }); }
    U.sectionTitle('今天');
    const ds=dailySignals();
    const tiles=ds.map(function(x){return [x[0],x[1],'','',true];});
    if(!tiles.length) tiles.push(['open_tasks','任务','没有急事','',false]);
    /* R1.9 整合：`U.tiles` 的第三参是**整块引导锚点**（它会给这一块登记一个"无动作"的热区）。
       原稿用了 `ov_*` 前缀，而项目里这一类**统一叫 `grid:`**（`grid:grow` / `grid:daily`），
       `audit_pages` / `ux_audit` 的锚点白名单也是按 `grid:` 判的。
       同类东西必须同前缀 —— 否则机器只能把它当死按钮，玩家点这块空白也确实没反应。 */
    U.tiles(tiles,3,'grid:ov_today');
    U.sectionTitle('快速整理');
    U.tiles([
      ['open_party','队伍','',null,false],['open_grow','成长','',null,false],['open_recruit','招募','',null,false],
      ['open_bag','背包','',null,false],['open_settings','设置','',null,false],['open_guide','指南','',null,false]
    ],3,'grid:ov_quick');
    U.hint('规则很简单：先推进残域，再用奖励补强；故事会在关键节点自己发生。',CV.SP[1]);
  }
  /* 修复一个结构性问题：U.pageHead 必须在 begin 后登记，而不是放进卡片 */
  CV.panels.home=function(){
    const old=U.pageHead; U.begin(); U.pageHead('灯阁');
    renderHomeBody();
  };
  function renderHomeBody(){
    const s=S(),w=currentWorld(),st=(s.worlds&&s.worlds[w.id])||{stages:{normal:[]}},stage=nextStage(w.id,'normal');
    const prog=(st.stages&&st.stages.normal||[]).filter(Boolean).length;
    U.card(function(){
      U.hint('当前旅程');
      CV.text(w.name,U.ix(),U.y+2*CV.SCALE,{size:CV.FS.f2,bold:true}); U.y+=24*CV.SCALE;
      U.note(stage>=0?'第 '+(stage+1)+'/12 关 · '+String(w.mechanic).split('：')[0]:'普通难度 12/12 已完成',4*CV.SCALE);
      const bw=U.iw(),by=U.y+8*CV.SCALE; CV.round(U.ix(),by,bw,5*CV.SCALE,3*CV.SCALE,CV.a(CV.C.line,.8),null);
      const p=stage>=0?prog/12:1; CV.round(U.ix(),by,bw*Math.max(0,Math.min(1,p)),5*CV.SCALE,3*CV.SCALE,CV.RADIUS_SM,CV.C.gold,null); U.y=by+14*CV.SCALE;
      U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,stage>=0?'继续探索':'查看新世界','primary','ov_continue'); U.y+=U.BTN_H*CV.SCALE;
    });
    const clue=storyLine(w); if(clue){ U.card(function(){U.h3('刚刚发现','');U.note(clue,2*CV.SCALE);U.space(CV.SP[1]);U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'打开故事','ghost','ov_story');U.y+=U.BTN_SM*CV.SCALE;}); }
    U.sectionTitle('今天'); const ds=dailySignals(); U.tiles((ds.length?ds:[['open_tasks','任务','','',false]]).map(x=>[x[0],x[1],'','',true]),3,'grid:ov_today');
    U.sectionTitle('快速整理'); U.tiles([
      ['open_party','队伍','',null,false],['open_grow','成长','',null,false],['open_recruit','招募','',null,false],
      ['open_bag','背包','',null,false],['open_settings','设置','',null,false],['open_guide','指南','',null,false]
    ],3,'grid:ov_quick');
    U.hint('先推进残域，再用奖励补强；剧情会在关键节点自己发生。',CV.SP[1]);
  }
  CV.on('ov_continue',function(){ const w=currentWorld(); if(!w)return; CV.dispatch('w:'+w.id); });
  CV.on('ov_story',function(){ const w=currentWorld(); if(G.Story&&G.Story.openWorld) G.Story.openWorld(w.id,'post'); else CV.dispatch('w:'+w.id); });

  CV.panels.grow=function(){
    const s=S(), r=Core.realmState(), au=Core.authorityInfo(); U.begin(); U.pageHead('成长');
    U.card(function(){
      U.h3('变强路线','只看现在有用的');
      const pwr=Core.teamPower?Core.teamPower():0; U.kv('队伍战力',fmt(pwr));
      U.kv('当前境界',r&&r.curName?(''+r.curName):'未定命格');
      U.kv('权限', 'Lv.'+(au&&au.lv||0));
    });
    U.sectionTitle('四个重点');
    const rows=[
      ['open_party','战斗阵容','先把 5 个位置配完整'],
      ['open_bag','装备强度','优先强化当前上阵装备'],
      ['open_realm','长期成长','境界 / 铭刻跟着推进解锁'],
      ['open_buildings','基础收益','挂机、离线、强化效率一起涨'],
    ];
    rows.forEach(function(x){ U.card(function(){ U.h3(x[1]); U.note(x[2],1*CV.SCALE); U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'去看看','ghost',x[0]);U.y+=U.BTN_SM*CV.SCALE;}); });
    U.sectionTitle('其他系统');
    U.tiles([
      ['open_keji','秘术阁','',null,false],['open_fabao','法宝','',null,false],['open_mount','坐骑','',null,false],
      ['open_garden','药园','',null,false],['open_arena','斗法台','',null,false],['open_sign','点灯','',null,false],
      ['open_genelock','铭刻','',null,false],['open_beast','伴生体','',null,false],['open_reincarn','转生','',null,false],
      ['open_codex','图鉴','',null,false],['open_shop','市集','',null,false],['open_refine','炼化台','',null,false]
    ],3,'grid:ov_growth_more');
  };

  CV.panels.dungeon=function(){
    const s=S(),w=currentWorld(),st=(s.worlds&&s.worlds[w.id])||{stages:{normal:[]}},stage=nextStage(w.id,'normal');U.begin();U.pageHead('残域');
    U.card(function(){
      U.h3('继续探索',w.name);
      U.note(stage>=0?'下一关：'+(stage+1)+'/12 · '+String(w.mechanic).split('：')[0]:'本世界普通难度已清');
      if(stage>=0) U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,'进入当前世界','primary','ov_current_world');
      else U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,'查看当前世界','ghost','ov_current_world');
      U.y+=U.BTN_H*CV.SCALE;
    });
    U.sectionTitle('世界线');
    const ws=unlockedWorlds().slice().reverse();
    ws.forEach(function(x){ const q=(s.worlds[x.id].stages.normal||[]).filter(Boolean).length; U.card(function(){
      const ico=D.iconOpsOf&&D.iconOpsOf('world',x.id); if(ico) CV.drawIcon(ico,CV.ctx,U.ix()+18*CV.SCALE,U.y+24*CV.SCALE,CV.AICO.worldSm*CV.SCALE,CV.worldIconColor(x.theme,x.id===w.id?'current':'idle'));
      CV.text(x.name,U.ix()+46*CV.SCALE,U.y+12*CV.SCALE,{size:CV.FS.f1,bold:true});
      CV.text(q+'/12',U.ix()+U.iw(),U.y+12*CV.SCALE,{size:CV.FS.md,color:q>=12?CV.C.gain:CV.C.dim,align:'right'});
      CV.text(String(x.mechanic).split('：')[0],U.ix()+46*CV.SCALE,U.y+33*CV.SCALE,{size:CV.FS.sm,color:CV.C.dim});
      U.y+=46*CV.SCALE;
    }); CV.hit('w:'+x.id,U.ix(),U.y-54*CV.SCALE,U.iw(),54*CV.SCALE); });
    const locked=D.WORLDS.find(x=>!(s.worlds[x.id]&&s.worlds[x.id].unlocked));
    if(locked){U.card(function(){U.h3('下一世界已出现','但还没开放');U.note(locked.reincarn?'需要转生 '+locked.reincarn+' 次':'通关上一世界普通难度');});}
  };
  CV.on('ov_current_world',function(){const w=currentWorld();if(w)CV.dispatch('w:'+w.id);});

  /* battle HUD: unobtrusive, always tied to the actual current world mechanism */
  if(prev.battle){
    CV.panels.battle=function(){
      prev.battle();
      const st=Core.BattleUI&&Core.BattleUI.state;
      if(!st||!st.on||!st.cfg||st.panel)return;
      const wid=st.cfg.worldId,w=D.WORLDS.find(x=>x.id===wid); if(!w)return;
      const txt=String(w.mechanic||'');
      const c=CV.ctx, x=12*CV.SCALE, y=CV.TOP+10*CV.SCALE, bw=Math.min(CV.W-24*CV.SCALE,190*CV.SCALE), bh=24*CV.SCALE;
      c.save(); c.globalAlpha=.9; CV.round(x,y,bw,bh,CV.RADIUS_SM,CV.a(CV.C.panel,.68),CV.C.line2); CV.text('机制 · '+CV.fit(txt.split('：')[0],bw-16*CV.SCALE,CV.FS.sm),x+8*CV.SCALE,y+bh/2,{size:CV.FS.sm,color:CV.C.text2}); c.restore();
    };
  }

  /* ================= R1.9 整合裁定：**这一段不合并** =================
     2.0 完整工程在这里做了两件事：① 包一层 `BattleUI.run` 记"来路快照"；
     ② 覆盖 `battle_close`，落地后把 `CV.stack` 换成快照。

     为什么不合并（三条，都不是口味问题）：
       · **已有实现已覆盖同一需求**：战斗来路（页面栈 + 滚动）从 R1.2 起就是 `js/sc-battle.js` 的
         `B.back` 负责记、`sc-dungeon/sc-last/sc-lines` 的 `onClose` 负责还原，
         `battle_return_audit` 16/16 全绿；这里再接管一次 = **两套结算同时管返回**
         （任务书 §15 明令禁止），真机上会出现"退回到上一次的旧栈"这种鬼状态。
       · 它覆盖的是 `CV.onAct['battle_close']`（**一个全局动作名**）：斗法台 / 深井 / 挂机 / 扫荡
         四条路都在用这个名字，覆盖后四条的返回语义会被 2.0 的"恢复快照"统一改写。
       · 这一段的收益（返回时找回滚动位置）在 BASE 里已经由 `CV.pop()` 的 `scrollMemo` 实现。
     结论：**保留 battle HUD 的机制条（有价值），去掉这段重复的返回接管。** */
  /* safer secondary-page entry aliases */
  ['open_bag','open_protag'].forEach(function(id){ if(!CV.onAct[id]) CV.on(id,function(){CV.push(id==='open_bag'?'bag':'protag');}); });
  G.OVERHAUL_2_0={version:'2.0.0',ready:true,currentWorld:currentWorld,nextStage:nextStage};
})();
