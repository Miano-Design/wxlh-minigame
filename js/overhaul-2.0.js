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
      /* 红点**逐格挂**（不再把"任务/成就"并成一条）：下面首页那排格子是按 id 取红点的。 */
      if(t.dailyClaimable||t.weeklyClaimable) a.push(['open_tasks','任务可领']);
      if(t.achClaimable) a.push(['open_ach','成就有奖']);
      if(t.signReady) a.push(['open_sign','今日点灯']);
      if(t.freeRecruitReady) a.push(['open_recruit','免费招募']);   // ← 带解锁判定的那个
      if(t.codexClaimable) a.push(['open_codex','图鉴可领']);
    } catch(e){}
    return a;
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
    /* ================= ① 主角卡（R2.7 · 父亲大人："主角的角色卡按之前那样做，内容展示详细点"）==
       原来（老首页 `.card.text-rows`）是**四行【标签】值 + 行间虚线，整块可点进角色页**：
         【境界】当前境界 + 已突破 N/36 阶
         【等级】Lv.N + EXP x%
         【主角】六维待分 N · 技能待加 N      ← 有点数才高亮，没点数是灰的
         【转生】N 世 + 权限 Lv.N · 评级 Lv.N
       我上一版图省事压成了"头像 + 名字 + Lv + 战力 + 一颗按钮"，信息少了 —— 按原样铺回四行。
       四行**各自登记一颗热区**（`hero:0..3`）：开局引导要逐项讲，只有整卡一颗锚点没法只高亮某一行。 */
    {
      const st = Core.realmState(), au = Core.authorityInfo(), sect = Core.sectInfo();
      const prows = [
        ['【境界】', st.curName || '未定命格', st.hasBloodline ? ('已突破 ' + st.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶') : ''],
        ['【等级】', 'Lv.' + p.level, p.level >= D.PLAYER_MAX_LV ? 'EXP MAX'
          : 'EXP ' + Math.floor(((p.exp || 0) / (D.EXP_TABLE[p.level] || 1)) * 100) + '%'],
        ['【主角】', '六维待分 ' + (p.attrPoints || 0) + ' · 技能待加 ' + (p.skillPoints || 0), ''],
        ['【转生】', (p.reincarnations || 0) + ' 世', '权限 Lv.' + au.lv + ' · 评级 Lv.' + sect.lv],
      ];
      const cardH = U.card(function(){
        const rowH = 33.5 * CV.SCALE, top = U.y;
        prows.forEach(function(r, i){
          const cy = top + rowH * i + rowH / 2;
          CV.text(r[0], U.ix(), cy, { size: CV.FS.md, color: CV.C.dim });
          const vw = CV.measure(r[1], CV.FS.lg, true);
          const sw = r[2] ? CV.measure(r[2], CV.FS.sm) + 8 * CV.SCALE : 0;
          /* 有点数才金、没有就灰（父亲大人："没有待加的时候灰字就行，不用一直高亮"） */
          const vc = (i === 0 && st.hasBloodline) ? CV.C.gold
            : i === 2 ? ((p.attrPoints || p.skillPoints) ? CV.C.gold : CV.C.dim) : CV.C.text;
          CV.text(CV.fit(r[1], U.iw() - 28 * CV.SCALE - sw, CV.FS.lg, true), U.ix() + U.iw() - vw - sw, cy,
            { size: CV.FS.lg, bold: true, color: vc });
          if (r[2]) CV.text(r[2], U.ix() + U.iw(), cy, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
          CV.hit('hero:' + i, U.ix(), cy - rowH / 2, U.iw(), rowH);
          if (i < prows.length - 1) {
            CV.ctx.save();
            CV.ctx.strokeStyle = CV.C.lineSoft; CV.ctx.setLineDash([4, 4]); CV.ctx.lineWidth = 1;
            CV.ctx.beginPath(); CV.ctx.moveTo(U.ix(), top + rowH * (i + 1) - .5); CV.ctx.lineTo(U.ix() + U.iw(), top + rowH * (i + 1) - .5); CV.ctx.stroke();
            CV.ctx.restore();
          }
        });
        U.y = top + rowH * prows.length;
      });
      /* 整块可点 → 角色页（四行是引导锚点，真动作还是这一颗） */
      CV.hit('open_protag', U.pad(), U.y - cardH - CV.SP[2], U.cw(), cardH);
    }
    /* ② 当前旅程 */
    U.card(function(){
      /* R2.3（父亲大人截图点名：「当前旅程」和「灯阁王座」压在一起）——
         原稿是 `U.hint('当前旅程')` 之后**手画**一个大字：`U.hint` 只推进 11px 行高，
         而标题用的是 17px 字号、画在 `U.y + 2`，两者的字框直接叠上（截图就是那个样子）。
         现在改用全站统一的卡内标题通用件 `U.h3` —— 它自己管"标签行 → 标题"的间距与行高，
         和别的卡片（队伍/成长/法宝…）完全一致，不会再各写一套。 */
      U.hint('当前旅程');
      U.h3(w.name);
      U.note(stage>=0?'第 '+(stage+1)+'/12 关 · '+String(w.mechanic).split('：')[0]:'普通难度 12/12 已完成',4*CV.SCALE);
      const bw=U.iw(),by=U.y+8*CV.SCALE; CV.round(U.ix(),by,bw,5*CV.SCALE,3*CV.SCALE,CV.a(CV.C.line,.8),null);
      const pp=stage>=0?prog/12:1; CV.round(U.ix(),by,bw*Math.max(0,Math.min(1,pp)),5*CV.SCALE,3*CV.SCALE,CV.RADIUS_SM,CV.C.gold,null); U.y=by+14*CV.SCALE;
      U.space(CV.SP[1]);   /* R2.5：说明/进度条与按钮之间留一口气（父亲大人："这个也是"贴在一起） */
      U.btn(U.ix(),U.y,U.iw(),U.BTN_H*CV.SCALE,stage>=0?'继续探索':'查看新世界','primary','ov_continue'); U.y+=U.BTN_H*CV.SCALE;
    });
    /* ③ 挂机收益（2.0 那版丢了这块，底栏红点却照旧亮）
       ⚠️ R2.8（父亲大人 2026-10-02："把挂机收益放到常去的地方下面"）：
          这一段**搬到「常去的地方」那排格子之后**再画（函数里的内容一个字没改，
          只是调用位置从"当前旅程下面"移到了"常去的地方下面"）。 */
    const drawIdleCard = function(){
    let tk=null; try{ tk=Core.todayState&&Core.todayState(); }catch(e){}
    if(tk){
      const i=tk.idle||{}, mins=Math.floor((tk.idleSeconds||0)/60);
      const parts=[]; if(i.points)parts.push('◉'+fmt(i.points)); if(i.otherworld)parts.push('◆'+fmt(i.otherworld));
      if(i.exp)parts.push('EXP '+fmt(i.exp)); if(i.mat)parts.push('材料 '+fmt(i.mat));
      U.card(function(){
        U.h3('挂机收益', tk.idleReady?('已攒 '+mins+' 分钟'):'灯阁正在运转');
        U.note(parts.length?parts.join(' · '):'还没有攒到可收的收益（满 1 分钟就能收）',2*CV.SCALE);
        U.space(CV.SP[1]);
        /* ★ 两颗按钮（与原首页 `.btn-row` 同规格：左「派人分工」小、右「收取奖励」主）——
           2.0 换首页时**只剩了收取奖励**，于是「挂机分工 / 分配队长」整条路没有入口
           （父亲大人点名找不到的就是这个）。这里按原文搬回。 */
        const gap=10*CV.SCALE, bh=U.BTN_H*CV.SCALE, bw=(U.iw()-gap)*0.42;
        U.btn(U.ix(), U.y, bw, bh, '派人分工', 'ghost', 'open_idlelines');
        U.btn(U.ix()+bw+gap, U.y, U.iw()-bw-gap, bh,
          tk.claimable>0?('收取奖励（'+tk.claimable+' 项）'):'收取奖励',
          tk.claimable>0?'primary':'ghost','claim_all', tk.claimable<=0);
        U.y+=bh;
        /* ★ 挂机加速（看广告）—— 原首页挂机卡里就有这一颗（B5：每天 3 次 × 每次 2 小时产出）。
           2.0 换首页时丢了，父亲大人点名"快速挂机看广告的入口还是没有"。
           文案与禁用态**统一读 `AD.status('idle_boost')`**（点位配额 / 全局总闸 / 弱网一起看），
           所以不会出现"写着还剩 1 次、点下去说没了"（`ad_text_audit` 钉着这条）。 */
        const AD=G.AD;
        if(AD&&AD.show){
          const adSt=AD.status?AD.status('idle_boost'):{ok:(AD.left?AD.left('idle_boost'):0)>0,text:''};
          const adTail=AD.quotaText?AD.quotaText('idle_boost'):'';
          U.space(CV.SP[1]);
          U.hint('今日剩余 '+(adTail?adTail.replace(/^（|）$/g,''):'次数未知'), 4*CV.SCALE);
          U.btnRow([{ label:'广告加速', style:'ghost', id: adSt.ok?'ad_idle_boost':'', dis:!adSt.ok }]);
        }
      });
    }
    };
    /* ③b 游历（原首页一整张可点卡）：挂着"待领"就点它领，没有就点进游历页 —— 2.0 换首页时丢的入口 */
    try {
      const prog=Core.travelProgress(), pend=Core.pendingTravel();
      if(prog){
        U.card(function(){
          const h=33*CV.SCALE, top=U.y, cy=top+h/2;
          CV.text('【游历奇遇】',U.ix(),cy,{size:CV.FS.md,color:pend?CV.C.gold:CV.C.dim});
          if(pend){
            const rw=Core.rewardTextOf(pend.effect), rwW=CV.measure(rw,CV.FS.sm)+10*CV.SCALE;
            CV.text(CV.fit(pend.name,U.iw()-100*CV.SCALE-rwW,CV.FS.md),U.ix()+U.iw()-rwW,cy,{size:CV.FS.md,color:CV.C.gold,align:'right'});
            CV.text(CV.fit(rw,rwW,CV.FS.sm),U.ix()+U.iw(),cy,{size:CV.FS.sm,color:CV.C.dim,align:'right'});
            CV.hit('claim_travel',U.pad(),top,U.cw(),h);
          } else {
            CV.text('距下一次 '+D.fmtClock(Math.max(0,prog.every-prog.sec)),U.ix()+U.iw(),cy,{size:CV.FS.md,color:CV.C.dim,align:'right'});
            CV.hit('open_travel',U.pad(),top,U.cw(),h);
          }
          U.y=top+h;
        },{padY:2});
      }
    } catch(e){}
    /* ④ 刚刚发现：**只在没读过时出现**（读完进卷宗，不再长期占首页） */
    /* ⚠️ 判据要精确到"**打得出来**"：原稿是 `clueOf(post)||clueOf(in)` + 只看 `epilogueSeen`
       —— 于是**全新档**首页就顶着一条"刚刚发现"（那其实是进图剧情的线索，玩家还没去过那儿），
       正是父亲大人说的"看完剧情提示还长期挂着"的反面版本：还没发生就先挂着。
       现在只在 **这个世界已经通关（`cleared`）但战后那一拍还没读过** 时出现：
       打完守关 → 结算里给线索 → 首页提醒一次 → 读完（`epilogueSeen`）立刻消失，历史进卷宗。*/
    const clue=storyLine(w);
    const stW=(G.Story&&G.Story.stateOf)?G.Story.stateOf(w.id):{cleared:false,epilogueSeen:false};
    if(clue&&stW.cleared&&!stW.epilogueSeen){ U.card(function(){U.h3('刚刚发现','');U.note(clue,2*CV.SCALE);U.space(CV.SP[1]);U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'打开故事','ghost','ov_story');U.y+=U.BTN_SM*CV.SCALE;}); }
    /* ================= R2.5 · 首页宫格重排（父亲大人 2026-10-02）=================
       原话：「今日板块能不能多加些常用功能？现在只有一个任务按钮，要么就把任务按钮跟下面的放一起，别单独」。
       而且这一轮的反查发现 **8 个页面入口没人能点到**（2.0 换首页时把这几个入口弄丢了）：
         `open_corridor`（深井）· `open_idlelines`（挂机分工/分配队长）· `open_travel`（游历）·
         `open_authority`（灯阁权限）· `open_sect`（灯阁评级）· `open_ach`（成就）
       —— 父亲大人问的"快速领取挂机奖励""挂机分配队长"找不到，就是这条。

       现在分**两排**（不再单独做"今天"那一节）：
         · 上排「每天要做的」= 任务 / 点灯 / 招募 / 市集 / 成就 —— 红点逐格挂（只挂真能领的）
         · 下排「常去的地方」= 队伍 / 成长 / 深井 / 挂机分工 / 游历 / 灯阁权限 / 灯阁评级 / 设置
       ⚠️ 两排的**锚点 id 必须是 `grid:daily` / `grid:grow`**：新手指引第②③步指的就是这两个
          （`sc-home.js` 的 OPENING），原来写成 `grid:ov_*` 会让那两步**指空**。
         ②的文案是"养成线都在这排格子里"、③的文案是"任务、点灯、招募、市集、成就"——
          现在的两排内容与那两句**逐字对得上**。 */
    /* ⚠️ 两排宫格**读官方真源 `D.HOME_GROUPS`**（组名 + 成员顺序 + 常用度分，判据写在 data.js 表头）——
       原稿在这里手写了 12 格，于是**漏了 6 个入口**（评级/权限/图鉴/炼化台/基地建设… 与 `open_ach`）。
       手写一份就不可能跟表对齐（《定调与口径》§3.2：同一件事不许写两份），这里只负责"按表摆 + 挂红点"。 */
    /* ================= 首页宫格（**新逻辑**：常用优先，不铺按钮墙）=================
       父亲大人 2026-10-02 的两句话定死了这里：
         · "你现在是把主页回归到一开始的界面逻辑，我意思是按新的界面逻辑去补充优化" ——
           所以**不铺 `HOME_GROUPS` 那 20 格**（那是老首页的铺法），只留**最常用的**；
         · "今日板块能不能多加些常用功能 / 任务别单独放" —— 日常那排按表的成员补齐到 5 格，
           任务变成第一格，不再单独一节。
       被收起来的那几格**不是没入口**：成长页（`open_grow`）就是系统总览，
       本页也给一行「全部系统 ›」，所以 `entry_audit` 里不会出现孤儿。
       ⚠️ 锚点必须叫 `grid:daily` / `grid:grow`：新手指引第②③步指的就是这两个 id。 */
    const dots={}; dailySignals().forEach(function(s){ dots[s[0]]=true; });
    const dGroup=(D.HOME_GROUPS||[]).filter(function(g){return g.id==='daily';})[0]||{name:'每天要做的',members:[]};
    U.sectionTitle(dGroup.name||'每天要做的');
    U.tiles(dGroup.members.filter(function(m){return !m.unlock||Core.isUnlocked(m.unlock);})
      .map(function(m){ return [m.id, m.name, null, m.unlock||null, !!dots[m.id]]; }), 3, 'grid:daily');
    U.sectionTitle('常去的地方');
    U.tiles([
      ['open_party','队伍','',null,false],['open_grow','成长','',null,false],
      ['open_garden','药园','',null,false],['open_arena','斗法台','',null,false],
      ['open_keji','秘术阁','',null,false],['open_fabao','法宝','',null,false]
    ],3,'grid:grow');
    /* R2.8：挂机收益**在「常去的地方」下面**（父亲大人点名） */
    drawIdleCard();
    /* 其余系统（坐骑 / 炼化台 / 评级 / 权限 / 铭刻 / 伴生体 / 图鉴 / 转生…）收进成长页 */
    U.space(CV.SP[1]);
    const hAll=U.hint('全部系统（坐骑 · 炼化台 · 评级 · 权限 · 铭刻 · 伴生体 · 图鉴 · 转生）  ›', 0);
    CV.hit('open_grow', U.ix()-2, U.y-hAll, U.iw()+4, hAll);
    /* 未解锁的功能照样能查"怎么解锁"（这一行就是 `open_locked` 的入口） */
    {
      const lk=[];
      (D.HOME_GROUPS||[]).forEach(function(g){ g.members.forEach(function(m){ if(m.unlock&&!Core.isUnlocked(m.unlock)) lk.push(m); }); });
      if(lk.length){
        U.space(CV.SP[1]);
        const hh=U.hint('还没解锁：'+lk.map(function(x){return x.name;}).join(' / ')+'  ›', 0);
        CV.hit('open_locked', U.ix()-2, U.y-hh, U.iw()+4, hh);
      }
    }
    U.hint('先推进残域，再用奖励补强；剧情会在关键节点自己发生。',CV.SP[1]);
    /* 最后一行：**设置与存档**。原首页底部就是这一排（`[玩法指南][设置与存档]`）——
       父亲大人 §四 说"指南在设置里已有、别在一级入口重复摆"，所以这里**只留设置**。
       ⚠️ 特别注意：`D.HOME_GROUPS` 那张表里**没有**设置（它不是养成/日常线），
          所以换成读表之后必须单独补这一行，否则设置就又没有入口了。 */
    U.tiles([['open_settings','设置与存档']], 3, 'grid:sys');
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
    /* R2.4（父亲大人截图点名：说明文字跟「去看看」贴在一起）——
       实测：说明行（12px 字、行高 1.75）画完 U.y 就停在**它自己那一行的下沿**，
       紧接着按钮的顶边就压在那里 —— 字框下沿离按钮只剩 3px（窄屏上就是贴住）。
       按项目里别处同一口径（主页挂机卡、各类"说明 → 按钮"的卡）**先留一口气再放按钮**。 */
    rows.forEach(function(x){ U.card(function(){ U.h3(x[1]); U.note(x[2],1*CV.SCALE); U.space(CV.SP[1]); U.btn(U.ix(),U.y,U.iw(),U.BTN_SM*CV.SCALE,'去看看','ghost',x[0]);U.y+=U.BTN_SM*CV.SCALE;}); });
    U.sectionTitle('其他系统');
    U.tiles([
      ['open_keji','秘术阁','',null,false],['open_fabao','法宝','',null,false],['open_mount','坐骑','',null,false],
      ['open_garden','药园','',null,false],['open_arena','斗法台','',null,false],['open_sign','点灯','',null,false],
      ['open_genelock','铭刻','',null,false],['open_beast','伴生体','',null,false],['open_reincarn','转生','',null,false],
      ['open_codex','图鉴','',null,false],['open_shop','市集','',null,false],['open_refine','炼化台','',null,false],
      /* ★ R2.6：这两格**必须在这里**（父亲大人 2026-10-02 点名的"功能少了入口"）——
         首页那排只放常用的，评级/权限就收到"其他系统"里；缺了它们这俩就又成了没入口的功能。 */
      ['open_sect','灯阁评级','',null,false],['open_authority','灯阁权限','',null,false]
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
    /* ★ 深井：**自己单独一节**（父亲大人 2026-10-02：「深井要跟世界线分开，不要放在世界线里面」）——
       原 `sc-dungeon.js` 就是「深井挑战」这一节 + 一张 `worldCard('♾','深井',…)`，
       排在**世界线之前**；2.0 换掉残域面板时整节丢了，我上一版又把它塞进了世界线里（都不对）。
       ⚠️ 图标用**字形 '♾'**（`worldIco` 既吃 SVG op 也吃字形；原稿传的就是这个字符）——
          我上一版取的是 `iconOpsOf('nav','corridor')`，那个命名空间里没有它，所以图标画不出来。 */
    if (Core.isUnlocked && Core.isUnlocked('corridor')) {
      const corFloor = (S.corridor && S.corridor.floor) || 1;   // 有些状态里 corridor 还没建，兜底 1 层
      U.sectionTitle('深井挑战');
      U.card(function(){
        CV.text('♾', U.ix()+18*CV.SCALE, U.y+24*CV.SCALE, { size: CV.AICO.worldSm*CV.SCALE, align:'center', color: CV.C.gold });
        CV.text('深井',U.ix()+46*CV.SCALE,U.y+12*CV.SCALE,{size:CV.FS.f1,bold:true});
        CV.text('当前第 '+corFloor+' 层',U.ix()+U.iw(),U.y+12*CV.SCALE,{size:CV.FS.md,color:CV.C.gold,align:'right'});
        CV.text('一直往上打、没有重置',U.ix()+46*CV.SCALE,U.y+33*CV.SCALE,{size:CV.FS.sm,color:CV.C.dim});
        U.y+=46*CV.SCALE;
      });
      CV.hit('open_corridor',U.ix(),U.y-54*CV.SCALE,U.iw(),54*CV.SCALE);
    }
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
