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
  /* ================= R2.0 体验收口（2026-10-02 · 父亲大人终验单 §六）=================
     **红点只允许指向"真的能领到东西"的地方**。原稿这里各条自己判了一次（`claimable` 当布尔用、
     用 `freeRecruitAvailable()` 而不带 `isUnlocked`）—— 实测在**新档**上会出问题：
       · `freeRecruitAvailable()` 只看"免费次数还在"，**不看功能有没有解锁** →
         新玩家还没解锁招募，首页就亮「免费招募」，点进去是锁着的页面（正是"红点点进去没内容"）；
       · `t.claimable` 是**计数**，当布尔用碰巧没错，但可读性差、以后容易踩。
     现在**只读 `Core.todayState()` 这一个口径**（它内部已经 AND 了 `isUnlocked`，且都是"现算"）：
       `dailyClaimable / weeklyClaimable / achClaimable / codexClaimable / freeRecruitReady / signReady / idleReady`。 */
  function dailySignals(){
    const a=[];
    try {
      const t=Core.todayState&&Core.todayState();
      if(!t) return a;
      if(t.dailyClaimable||t.weeklyClaimable||t.achClaimable) a.push(['open_tasks','任务可领']);
      if(t.signReady) a.push(['open_sign','今日点灯']);
      if(t.freeRecruitReady) a.push(['open_recruit','免费招募']);   // ← 带解锁判定的那个
      if(t.codexClaimable) a.push(['open_codex','图鉴可领']);
    } catch(e){}
    return a.slice(0,3);
  }
  function storyLine(w){
    try { if(G.Story&&G.Story.clueOf) return G.Story.clueOf(w.id,'post')||G.Story.clueOf(w.id,'in')||''; } catch(e){} return '';
  }
  /* ⚠️ 原来这里还有一份 `renderHome()`（51~91 行）——**死代码**：真正挂上去的是下面的
     `CV.panels.home → renderHomeBody()`，那一份从来没被调用过。
     两套首页实现放在同一个文件里，改一处忘一处就分叉（任务书 §15「不允许两套实现」）。
     收口：**只留 renderHomeBody 一份**，`CV.panels.home` 直接指向它。 */
  CV.panels.home=function(){
    /* R2.1（父亲大人截图点名）：**一级页不摆"‹ 标题"那条顶栏** ——
       它是根页、返回键点了也没地方去，白占一条；灯阁顶部直接就是主角卡（见 renderHomeBody ①）。
       正文从货币栏下面开始（`U.begin()` 已经把 U.y 放在那儿）。 */
    U.begin();
    renderHomeBody();
  };
  /* ================= R2.0 体验收口 · 首页重排（父亲大人终验单 §三/§四/§五）=================
     信息优先级（从上到下，**屏幕上一个主按钮**）：
       ① **我是谁**  —— 主角卡（头像位 + 名字 + Lv + 命格 + 战力），点进 `open_protag`
       ② **现在该做什么** —— 当前旅程（世界 + 第 N/12 关 + 机制 + 进度条 + 「继续探索」）
       ③ **当前收益** —— 挂机收益 + 「收取奖励」（走后端既有的 `claim_all`，一次收完挂机/每日/周常/成就）
       ④ **刚刚发现** —— 只在**没读过**时出现；读完（`stateOf().epilogueSeen`）就消失，历史进卷宗
       ⑤ 今天 · 能领什么（只列真能领的，≤3 格）
       ⑥ 快速整理（**只留 队伍 / 成长 / 招募 / 设置** —— 背包在底栏、指南在设置里，不重复摆）
     为什么补 ①③：2.0 那一版的首页**丢了主角入口和挂机收取**，而底栏"挂机可领"的红点照旧会亮 ——
     玩家会看到"红点亮着、首页却找不到能收的东西"（这正是父亲大人点名的那类假红点）。 */
  function renderHomeBody(){
    const s=S(),w=currentWorld(),st=(s.worlds&&s.worlds[w.id])||{stages:{normal:[]}},stage=nextStage(w.id,'normal');
    const prog=(st.stages&&st.stages.normal||[]).filter(Boolean).length;
    const p=s.player||{};
    /* ① 主角卡 */
    U.card(function(){
      const top=U.y, r=17*CV.SCALE, cx=U.ix()+r, cy=top+r;
      CV.round(cx-r,cy-r,r*2,r*2,r,CV.a(CV.C.panel2,.55),CV.a(CV.C.gold,.35));
      CV.text(CV.fit(String(Core.charName('@player')||'执灯者').slice(0,1),r*1.4,CV.FS.f1,true),cx,cy+1*CV.SCALE,{size:CV.FS.f1,bold:true,align:'center',color:CV.C.gold});
      const tx=U.ix()+r*2+10*CV.SCALE;
      CV.text(CV.fit(String(Core.charName('@player')||'执灯者'),U.iw()-r*2-70*CV.SCALE,CV.FS.f1,true),tx,top+8*CV.SCALE,{size:CV.FS.f1,bold:true});
      CV.text('Lv.'+(p.level||0)+' · '+(p.bloodline||'未定命格'),tx,top+27*CV.SCALE,{size:CV.FS.sm,color:CV.C.dim});
      CV.text('战力 '+fmt(Core.playerPower?Core.playerPower():0),U.ix()+U.iw(),top+8*CV.SCALE,{size:CV.FS.sm,color:CV.C.gold,align:'right'});
      U.y=top+r*2+6*CV.SCALE;
      U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'主角详情','ghost','open_protag'); U.y+=U.BTN_SM*CV.SCALE;
    });
    /* ② 当前旅程 */
    U.card(function(){
      U.hint('当前旅程');
      CV.text(w.name,U.ix(),U.y+2*CV.SCALE,{size:CV.FS.f2,bold:true}); U.y+=24*CV.SCALE;
      U.note(stage>=0?'第 '+(stage+1)+'/12 关 · '+String(w.mechanic).split('：')[0]:'普通难度 12/12 已完成',4*CV.SCALE);
      const bw=U.iw(),by=U.y+8*CV.SCALE; CV.round(U.ix(),by,bw,5*CV.SCALE,3*CV.SCALE,CV.a(CV.C.line,.8),null);
      const pp=stage>=0?prog/12:1; CV.round(U.ix(),by,bw*Math.max(0,Math.min(1,pp)),5*CV.SCALE,3*CV.SCALE,CV.RADIUS_SM,CV.C.gold,null); U.y=by+14*CV.SCALE;
      U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,stage>=0?'继续探索':'查看新世界','primary','ov_continue'); U.y+=U.BTN_H*CV.SCALE;
    });
    /* ③ 挂机收益（2.0 那版丢了这块，底栏红点却照旧亮） */
    let tk=null; try{ tk=Core.todayState&&Core.todayState(); }catch(e){}
    if(tk){
      const i=tk.idle||{}, mins=Math.floor((tk.idleSeconds||0)/60);
      const parts=[]; if(i.points)parts.push('◉'+fmt(i.points)); if(i.otherworld)parts.push('◆'+fmt(i.otherworld));
      if(i.exp)parts.push('EXP '+fmt(i.exp)); if(i.mat)parts.push('材料 '+fmt(i.mat));
      U.card(function(){
        U.h3('挂机收益', tk.idleReady?('已攒 '+mins+' 分钟'):'灯阁正在运转');
        U.note(parts.length?parts.join(' · '):'还没有攒到可收的收益（满 1 分钟就能收）',2*CV.SCALE);
        U.space(CV.SP[1]);
        U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,
          tk.claimable>0?('收取奖励（'+tk.claimable+' 项）'):'收取奖励',
          tk.claimable>0?'primary':'ghost','claim_all',tk.claimable<=0);
        U.y+=U.BTN_SM*CV.SCALE;
      });
    }
    /* ④ 刚刚发现：**只在没读过时出现**（读完进卷宗，不再长期占首页） */
    /* ⚠️ 判据要精确到"**打得出来**"：原稿是 `clueOf(post)||clueOf(in)` + 只看 `epilogueSeen`
       —— 于是**全新档**首页就顶着一条"刚刚发现"（那其实是进图剧情的线索，玩家还没去过那儿），
       正是父亲大人说的"看完剧情提示还长期挂着"的反面版本：还没发生就先挂着。
       现在只在 **这个世界已经通关（`cleared`）但战后那一拍还没读过** 时出现：
       打完守关 → 结算里给线索 → 首页提醒一次 → 读完（`epilogueSeen`）立刻消失，历史进卷宗。*/
    const clue=storyLine(w);
    const stW=(G.Story&&G.Story.stateOf)?G.Story.stateOf(w.id):{cleared:false,epilogueSeen:false};
    if(clue&&stW.cleared&&!stW.epilogueSeen){ U.card(function(){U.h3('刚刚发现','');U.note(clue,2*CV.SCALE);U.space(CV.SP[1]);U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'打开故事','ghost','ov_story');U.y+=U.BTN_SM*CV.SCALE;}); }
    /* ⑤ 今天：只列**真能领**的（`dailySignals` 现在只读 `todayState`，带解锁判定）。
       一格都凑不出来时**不给红点**（`dot=false`）—— 空页面不该亮灯（§六）。 */
    U.sectionTitle('今天'); const ds=dailySignals();
    const todayTiles=(ds.length?ds:[['open_tasks','任务','','',false]]).map(x=>[x[0],x[1],'','',ds.length>0]);
    U.tiles(todayTiles,3,'grid:ov_today');
    /* ⑥ 快速整理：**只留没在别处重复的四个** ——
       背包在底栏第二格、指南在「设置」里（父亲大人 §四 点名的两条重复入口）。 */
    U.sectionTitle('快速整理'); U.tiles([
      ['open_party','队伍','',null,false],['open_grow','成长','',null,false],
      ['open_recruit','招募','',null,false],['open_settings','设置','',null,false]
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
    /* 残域也是**一级页**（底栏第 2 格）—— 同上：不摆标题+返回那条。
       页面自己的 H1「继续探索 / 世界线」已经说明了这是哪一页。 */
    const s=S(),w=currentWorld(),st=(s.worlds&&s.worlds[w.id])||{stages:{normal:[]}},stage=nextStage(w.id,'normal');U.begin();
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
