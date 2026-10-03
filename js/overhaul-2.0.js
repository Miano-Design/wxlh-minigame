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
  /* ================= R3.5（父亲大人 2026-10-02："为啥现在世界线 W01 还没通关 W02 就出现了"）=================
     查清了，两件事要分开看：
       ① **W02 为什么会"已解锁"** —— 是 core.js 那段**"已转过生的老档补偿"**给的：
          `bestWorldIdx = k` 的档（= 第 k 张图当年 12/12 打穿过，这是**有凭据**的）如果 `S.worlds`
          被清过（旧转生规则 / 迁移），就把 W01…W(k+1) 恢复成"已解锁"——
          依据是"通关第 k 张本来就会解锁第 k+1 张"。**星数不补**（凭空造星＝编数据），
          所以恢复出来的世界显示 0/12。**这一列本身没错**，是老档的历史真相。
       ② **错的是"当前旅程"指到了 W02** —— 这里原来取"最后一个已解锁的世界"，
          于是 W01 一关没打，主页却写着「潜影窟 第 1/12 关」，看着就是"W01 没通就冒出 W02"。
     现在改成真正的进度前沿：**第一个还没打通的普通世界**；全部打通了才退回最后一个已解锁的。
     ⇒ 补偿恢复出来的"提前解锁"不再抢方向盘，玩家照旧从 W01 打起（列表里那一列也照样看得见）。
     ⚠️ 只改"指哪儿"，一个字节的存档都不动。 */
  function currentWorld(){
    const ws=unlockedWorlds(); if(!ws.length) return D.WORLDS[0];
    for(let i=0;i<ws.length;i++){
      const a=((S().worlds[ws[i].id]||{}).stages||{}).normal||[];
      if(a.filter(Boolean).length<12) return ws[i];
    }
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
      /* 信匣（2026-10-02）：父亲大人定的红点口径 ——「**有的领就亮，没得领就不亮**」。
         所以这里只问 `Core.mailNewCount()`（它数的是"真有奖没领 / 真有公告没读"），
         **不掺"有没有信"这种数量** —— 信匣里有几封读完的老信，不该让那颗格子亮着骗人点。 */
      if(Core.mailNewCount && Core.mailNewCount() > 0) a.push(['open_mail','信匣里有新的']);
      /* ⚠️ R3.0 自查：原来这里还给「图鉴可领」算过一条信号，可**首页没有图鉴那一格**
         （图鉴在成长页的"其他系统"里）—— 算了没人用，是死信号。老首页也没有图鉴红点
         （`HOME_GROUPS` 的格子不带 dot），所以这里删掉，与老口径一致。 */
    } catch(e){}
    return a;
  }
  function storyLine(w){
    try { if(G.Story&&G.Story.clueOf) return G.Story.clueOf(w.id,'post')||G.Story.clueOf(w.id,'in')||''; } catch(e){} return '';
  }
  /* ================= R3.7（父亲大人 2026-10-02：「这些还没解锁的就不显示了吧，等解锁了再显示」）=================
     主页那两排格子**只摆已经开放的**：没开的不占位，开一个冒一个。
     判据**不在本文件** —— 走 `G.homeVis.locked()`（sc-home.js 那一份，与开场引导的文案同源）：
        · R3.4 我曾经把没解锁的格子"标个 🔒 灰着摆出来"（那时父亲大人要"合理就行"），
          他看过之后定了口径：**干脆不摆**；
        · 没解锁的功能**不是消失**：页面底部还有一行「还没解锁：…」把它点出来
          （2026-10-03 父亲大人定稿：**那行只是注释、不给二级入口**）。 */
  function isLocked(id){ return G.homeVis ? G.homeVis.locked(id) : false; }
  /* 过滤一行格子：锁着的不画。`U.tiles` 的列数不变（剩几格就摆几格，从左往右排）。
     顺手把"这一排真画了哪几格"登记到 `G.homeRowNames[rowId]` —— 开场引导的文案读它，
     于是"引导说的"永远等于"屏幕上摆的"（这一条以前写死过两轮，每次都因为格子改动而对不上）。 */
  function visTiles(list, rowId){
    const out = list.filter(function (t) { return !isLocked(t[0]); });
    G.homeRowNames = G.homeRowNames || {};
    G.homeRowNames[rowId] = out.map(function (t) { return t[1]; });
    return out;
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
    /* ================= R3.2（父亲大人："现在好像没有主线任务了，主线任务的入口在哪"）=================
       主线卡排在**主角卡下面**（与旧首页同序：主角卡 → 主线卡 → 其余）。
       2.0 换首页时把这张卡一起换掉了，于是：
         · 主页没有主线入口 —— 27 步做完回来没地方领奖（任务页里**不放主线**，09-26 定的口径）；
         · 开场链第 ④ 步（`tut_blk4`）和主页页面引导的锚点 `claim_quest` / `goto_quest`
           在新首页上找不到目标 ⇒ 那一步永远 `miss`，既收不掉也不会亮。
       实现**不在这个文件里**：`G.homeQuestCard()`（sc-home.js，一份实现喂两处）；
       27 步全领完时它自己返回 0、整卡不画，这里也不用判。 */
    if (G.homeQuestCard) G.homeQuestCard();
    /* ② 当前旅程 */
    /* 「今天有什么可收」先算一次（当前旅程卡与下面的挂机卡都用它；算不动就当没有） */
    const homeTk = (function(){ try { return Core.todayState ? Core.todayState() : null; } catch(e){ return null; } })();
    U.card(function(){
      /* R2.3（父亲大人截图点名：「当前旅程」和「新世界入口」压在一起）——
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
      /* ================= R3.0 阶段五（GPT 复审建议 + 红点规则）=================
         「底栏'灯阁'那格的红点是按**挂机可领**亮的，可挂机卡在第 7 屏段 —— 玩家点了红点要往下翻才找得到」
         ⇒ 红点必须对应一个**立即能完成的动作**（点下去 5 秒内能收完）。
         所以：把挂机收益**提一行到当前旅程卡里**（优先级：继续探索 > 收取挂机）——
           · 有得收时才出现（`idleReady` 或 `claimable>0`），没有就整行不占空间；
           · 右边一颗**小**按钮（不是第二个大按钮），动作仍是后端既有的 `claim_all`；
           · 下面那张完整挂机卡**保留**（派人分工 / 广告加速都在那儿），两处不重复收费、只是入口更近。 */
      if (homeTk && (homeTk.idleReady || homeTk.claimable > 0)) {
        U.space(CV.SP[1]);
        const iw2 = homeTk.idle || {}, mins2 = Math.floor((homeTk.idleSeconds || 0) / 60);
        const sum = [];
        if (iw2.points) sum.push('◉' + fmt(iw2.points));
        if (iw2.otherworld) sum.push('◆' + fmt(iw2.otherworld));
        if (!sum.length) sum.push('可领 ' + homeTk.claimable + ' 项');
        const bw2 = 64 * CV.SCALE, bh2 = U.BTN_SM * CV.SCALE;
        const rowTop = U.y;
        CV.text(CV.fit('挂机收益 ' + sum.join(' · ') + (mins2 ? '（已攒 ' + mins2 + ' 分）' : ''),
          U.iw() - bw2 - 10 * CV.SCALE, CV.FS.sm), U.ix(), rowTop + bh2 / 2, { size: CV.FS.sm, color: CV.C.gold });
        U.btn(U.ix() + U.iw() - bw2, rowTop, bw2, bh2, '领取', 'ghost', 'claim_all');
        U.y = rowTop + bh2;
      }
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
          /* 2026-10-03（父亲大人截图点名）：按钮上**不要"（N 项）"** ——
             那是给开发者看的计数；玩家看到"有东西可领"就够了，具体几项进结算页自然清楚。 */
          '收取奖励',
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
    /* R2.9（父亲大人 2026-10-02 逐条点名）：
         · 「日常就保留任务、药园和招募三个」   → 日常 = 任务 / 药园 / 招募
         · 「把市集让到成长的矩阵里」           → 市集 移到「常去的地方」
         · 「点灯放到常去的板块」               → 点灯 移到「常去的地方」
         · 「把成就放到下面设置键的左边」       → 底排 = 成就 / 设置与存档
       顺序与内容照他念的来；`grid:daily` / `grid:grow` 两个**锚点 id 不变**（新手指引还指着它们）。 */
    const dots={}; dailySignals().forEach(function(s){ dots[s[0]]=true; });
    U.sectionTitle('日常');
    /* R3.7：锁着的不占位 —— 新档这一排只有「药园」（任务要 W01-4、招募要 W01-1），
       推图开一个冒一个。底排下面那行「还没解锁：…」仍然把它们的名字写出来（纯注释）。 */
    U.tiles(visTiles([
      ['open_tasks','任务','',null,!!dots.open_tasks],
      ['open_garden','药园','',null,false],
      ['open_recruit','招募','',null,!!dots.open_recruit]
    ], 'daily'),3,'grid:daily');
    U.sectionTitle('常去的地方');
    U.tiles(visTiles([
      ['open_party','队伍','',null,false],['open_grow','成长','',null,false],
      ['open_arena','斗法台','',null,false],['open_keji','秘术阁','',null,false],
      ['open_fabao','法宝','',null,false],['open_mount','坐骑','',null,false],
      ['open_beast','伴生体','',null,false],['open_shop','市集','',null,false],
      ['open_sign','点灯','',null,!!dots.open_sign]
    ], 'grow'),3,'grid:grow');
    /* R2.8：挂机收益**在「常去的地方」下面**（父亲大人点名）
       R2.9：它与上面那排格子**贴在一起了** —— `U.tiles` 画完不留下沿间距，卡片直接接着画。
       这里按全站口径补一道卡间距（`U.cardGap()` —— 与 `U.card` 用的是同一个派生值）。 */
    U.space(U.cardGap());
    drawIdleCard();
    /* R3.1（父亲大人："主页最下面的**更多成长**的小字去掉"）——
       整行撤掉。**不是删入口**：成长页仍从上面「常去的地方 · 成长」那一格进得去，
       而主页那一排已经涵盖了常用系统；剩下的（铭刻/转生/图鉴/炼化台/评级/权限）都在成长页里。 */
    /* 未解锁的功能照样能查"怎么解锁"（这一行就是 `open_locked` 的入口）。
       ⚠️ 2026-10-03（父亲大人）：「**这个还没解锁的小字放到设置那一排的下面**，注意间距」——
       原来它在**最下面那排宫格的上方**（夹在挂机卡与 成就/信匣/设置 之间），
       而那排宫格是"出口"，小字是"注解"；注解写在出口前面会让人先读到一串锁着的名字、
       再看到按钮。现在**挪到那排宫格之下**，顺序变成"出口 → 注解"，读起来顺。
       所以这里只**先把要写的名单算出来**，真正那一行等宫格画完再画（见下面）。 */
    const lk=[];
    (D.HOME_GROUPS||[]).forEach(function(g){ g.members.forEach(function(m){ if(m.unlock&&!Core.isUnlocked(m.unlock)) lk.push(m); }); });
    /* R2.9（父亲大人）："**下面的注释文字去掉**" ——
       原来这一行是 `先推进残域，再用奖励补强；剧情会在关键节点自己发生。`
       （一句引导性说明，占一屏底部还容易跟上面那排挤在一起）。**整句删掉**。 */
    /* 最后一行：**成就 + 设置与存档**（父亲大人 R2.9："把成就放到下面设置键的左边"）。
       原首页底部就是这一排（`[玩法指南][设置与存档]`）——指南在设置里已有、不再重复摆。
       ⚠️ `D.HOME_GROUPS` 里**没有**设置（它不是养成/日常线），所以必须单独摆一行；
         成就原来在「日常」那排，跟着这次调整挪到这里。 */
    /* 那排宫格与上面那张挂机卡之间的间距：**原来这口气是「还没解锁」那一行顺手占掉的**
       （`U.tiles` 画完不留下沿间距）。它按父亲大人 10-03 的说法挪到宫格下面之后，
       这里必须自己补一道卡间距 —— 不补，宫格就直接贴上挂机卡了。 */
    U.space(U.cardGap());
    U.tiles(visTiles([
      ['open_ach','成就','',null,!!dots.open_ach],
      /* 信匣（2026-10-02 · 父亲大人：「顺序 成就 / 信匣 / 设置」）——
         三个一排放得下（`U.tiles` 三列宫格），所以把原来那两颗挪成三颗，位置就是他念的顺序。
         它**永不"未开放"**（不传 isLocked）：信匣一开局就该能看，里面空着也是"空着"这个事实本身。 */
      ['open_mail','信匣','',null,!!dots.open_mail,false],
      ['open_settings','设置与存档']
    ], 'sys'),3,'grid:sys');
    /* 「还没解锁：…」——放在这一排宫格下面（父亲大人 2026-10-03 两次点名：
       ①「这个还没解锁的小字**放到设置那一排的下面**，注意间距」；
       ②「**下面的小字说未解锁的功能不需要有二级界面，就是纯一行字注释就行**」）。
       ⇒ 它现在**只是一行注释**：不再登记热区、不再能点进"怎么解锁"页。
       间距分两处管，别让它跟上面那排或底栏贴住：
         · 与宫格之间 `CV.SP[2]`（14）—— 比格间缝（10）略大一档：一眼看出"这是上面那排的注解"，
           又不至于断成两块；
         · 行尾再留 `CV.SP[1]` —— 底栏是浮层，页面滚到底时最容易被压住的就是最后这一行。
       ⚠️ 行尾那个 `›` 也一并去掉 —— 它是"可以点"的视觉暗示，留着就是在骗玩家去点。
       连带：`locked` 那个"怎么解锁"专页**从此没有任何入口**（`entry_audit` 的允许清单里
       一直记着 `open_locked`，所以闸门不会因此变红）；要不要把那一页整页删掉，等父亲大人一句话。 */
    if (lk.length) {
      U.space(CV.SP[2]);
      U.hint('还没解锁：' + lk.map(function (x) { return x.name; }).join(' / '), 0);
      U.space(CV.SP[1]);
    }
  }
  CV.on('ov_continue',function(){ const w=currentWorld(); if(!w)return; CV.dispatch('w:'+w.id); });
  CV.on('ov_story',function(){ const w=currentWorld(); if(G.Story&&G.Story.openWorld) G.Story.openWorld(w.id,'post'); else CV.dispatch('w:'+w.id); });

  CV.panels.grow=function(){
    const s=S(), r=Core.realmState(), au=Core.authorityInfo(); U.begin(); U.pageHead('成长');
    /* ① 当前进度（R3.3 · 父亲大人 2026-10-02："现在变强路线名字重复"）——
       这张卡的标题原来也叫「变强路线」，而下面那一节的小标题也是「变强路线」：
       一屏之内"变强路线"写两遍，玩家看到的是一个重复的词，不是两个东西。
       现在这张卡只管"我现在什么水平" → 叫「当前进度」；「变强路线」这个名字留给下面那一节。 */
    U.card(function(){
      U.h3('当前进度','只看现在有用的');
      const pwr=Core.teamPower?Core.teamPower():0; U.kv('队伍战力',fmt(pwr));
      U.kv('当前境界',r&&r.curName?(''+r.curName):'未定命格');
      U.kv('权限', 'Lv.'+(au&&au.lv||0));
    });
    /* ================= R3.3（父亲大人 2026-10-02）："这四张能做成按钮吗，有合适的出口吗" =================
       来龙去脉（三轮，别再翻烧饼）：
         · R3.0 每张卡挂一颗大「去看看」（R2.4 修过"说明贴按钮"）；
         · R3.1 父亲大人说"成长页把主页有的去掉、避免重复" → 我把按钮撤了、改成纯说明；
         · R3.3 他看到四张**点不动的卡**，问能不能做成按钮 —— 所以按钮回来，
           但**出口按"这张卡讲的事"逐条挑**，并且**不再跟同一页的宫格重复**：
             战斗阵容 → 队伍（`open_party`）
             装备强度 → 背包·**装备标签**（`open_bag_equip`：只 push 背包会停在道具页，
                         所以照 sc-last.js 里"强化类任务"的同一段落点，切到装备页）
             长期成长 → 境界渡劫（`open_realm`）
             基础收益 → 基地建设（`open_buildings`）
           下面「其他系统」那张宫格里原本也有**境界渡劫 / 基地建设** —— 那两格**撤掉**
           （同一页不摆两份），宫格剩 6 格。
       按钮长在**标题行右侧**（通用件 `U.h3` 的 `opt.btn`，与主线卡同一种按钮、34px）——
       卡片因此不再需要"说明行 ＋ 一颗大按钮"，也就不会再有"说明跟按钮贴住"那个老毛病。 */
    U.sectionTitle('变强路线');
    const rows=[
      /* ⚠️ 说明行跟着按钮一起排（`U.h3` 的 sub 是**右对齐单行**），
         320 小屏上一句话长过可用宽就会被 `CV.fit` 砍成「境界 / 铭刻跟着推…」——
         所以这里一律压到 **8 个字以内**（`layout_audit` 在 320×568 上逐页量"有没有被省略号砍"）。 */
      ['战斗阵容','配满 5 个位置','去队伍','open_party'],
      ['装备强度','强化上阵装备','去装备','open_bag_equip'],
      ['长期成长','境界 / 铭刻','去境界','open_realm'],
      ['基础收益','挂机 / 离线效率','去基地','open_buildings'],
    ];
    rows.forEach(function(x){ U.card(function(){ U.h3(x[0], x[1], { btn: { label: x[2], id: x[3] } }); }); });
    /* ================= R3.1（父亲大人："成长的二级页可以把主页有的去掉，避免重复"）=================
       这一页是**二级页**，只放主页那排**没有**的系统 —— 同一个入口不在两屏各摆一次。
       主页「常去的地方」现在有：队伍 / 成长 / 斗法台 / 秘术阁 / 法宝 / **坐骑 / 伴生体** / 市集 / 点灯，
       日常有：任务 / 药园 / 招募；底排：成就 / 设置。
       ⇒ 这里只留主页没有的：**铭刻 / 转生 / 图鉴 / 炼化台 / 灯阁评级 / 灯阁权限**（6 格）
         —— R3.3 又把**境界渡劫 / 基地建设**挪到了上面那两张路线卡上（同一页只摆一份）。
       ⚠️ 被去掉的都不是"没入口"：它们在主页那一排（`entry_audit` 会逐条反查，不会漏）。 */
    U.sectionTitle('其他系统');
    U.tiles([
      ['open_genelock','铭刻','',null,false],['open_reincarn','转生','',null,false],
      ['open_codex','图鉴','',null,false],['open_refine','炼化台','',null,false],
      ['open_sect','灯阁评级','',null,false],['open_authority','灯阁权限','',null,false],
    ],3,'grid:ov_growth_more');
  };

  CV.panels.dungeon=function(){
    /* 残域也是**一级页**（底栏第 2 格）—— 同上：不摆标题+返回那条。
       页面自己的 H1「继续探索 / 世界线」已经说明了这是哪一页。 */
    const s=S(),w=currentWorld(),st=(s.worlds&&s.worlds[w.id])||{stages:{normal:[]}},stage=nextStage(w.id,'normal');U.begin();
    U.card(function(){
      U.h3('继续探索',w.name);
      U.note(stage>=0?'下一关：'+(stage+1)+'/12 · '+String(w.mechanic).split('：')[0]:'本世界普通难度已清');
      /* R3.1（父亲大人截图点名：「残域界面的小字和按钮太贴了」）——
         说明行画完 U.y 就停在那一行的下沿，按钮顶边紧接在那里（实测只剩 3px）。
         与首页/成长页同一口径：按钮前留一口气。 */
      U.space(CV.SP[1]);
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
      /* ================= R3.4（父亲大人 2026-10-02：「4，加回来吧」）=================
         三枚难度小标签（普通 / 困难 / 地狱）**加回世界线卡片**：该难度 12 关全通＝点亮，没全通＝灰。
         · 画法与判据**不在这里实现** —— 读 `G.worldDiffPill` / `G.worldDiffAllCleared`
           （sc-dungeon.js 里那一份，原来是旧列表用的，正文删掉时保留并挂了出来）；
         · 排在**第二行右端**（第一行右端已经被 `N/12` 占了）：三枚一共约 110px，
           第二行有整行宽，320 小屏也放得下（`layout_audit` 逐页量"有没有出画/被砍"）。 */
      const pills=[['普通','normal'],['困难','hard'],['地狱','hell']];
      const pw=pills.reduce(function(a,pl){ return a+CV.measure(pl[0],CV.FS.tag)+12*CV.SCALE+4*CV.SCALE; },0)-4*CV.SCALE;
      let px=U.ix()+U.iw()-pw;
      const cy2=U.y+33*CV.SCALE;
      const mechW=CV.fit(String(x.mechanic).split('：')[0], U.iw()-46*CV.SCALE-pw-8*CV.SCALE, CV.FS.sm);
      CV.text(mechW,U.ix()+46*CV.SCALE,cy2,{size:CV.FS.sm,color:CV.C.dim});
      if(G.worldDiffPill&&G.worldDiffAllCleared){
        pills.forEach(function(pl){ px+=G.worldDiffPill(px,cy2,pl[0],G.worldDiffAllCleared(x.id,pl[1]))+4*CV.SCALE; });
      }
      U.y+=46*CV.SCALE;
    }); CV.hit('w:'+x.id,U.ix(),U.y-54*CV.SCALE,U.iw(),54*CV.SCALE); });
    const locked=D.WORLDS.find(x=>!(s.worlds[x.id]&&s.worlds[x.id].unlocked));
    if(locked){U.card(function(){U.h3('下一世界已出现','但还没开放');U.note(locked.reincarn?'需要转生 '+locked.reincarn+' 次':'通关上一世界普通难度');});}
  };
  CV.on('ov_current_world',function(){const w=currentWorld();if(w)CV.dispatch('w:'+w.id);});

  /* ================= 2026-10-03（父亲大人：「界面中的那条机制信息不要了吧」）=================
     这里原来在战斗页左上角挂一条「机制 · 感染」的小胶囊（`CV.panels.battle` 包了一层）。
     现在整个撤掉 —— 理由与实现无关，是**信息重复**：同一个机制在战斗页里已经说过两遍，
       ① 开打前 / 战斗日志第一行有完整的那句（「世界机制 · 感染：敌人攻击附带中毒」），
       ② 战场左上角这一条只截了冒号前两个字（「机制 · 感染」），既不完整、又正好压在
          Boss 血条那一片上（父亲大人圈出来的就是它）。
     删掉之后战斗页顶部**只剩关卡名那一行**，不再有第二块浮标跟它抢注意力。
     ⚠️ 这是**两轮之间的口径反转**（2026-10-02 那轮我按"有价值"留了它）—— 以父亲大人这次的为准。
     ⚠️ `prev.battle` 的包装一并去掉：它只为这一个 HUD 存在，留着就是一层空壳。 */

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
  /* ================= R3.3：装备强度那张卡的出口 =================
     「去装备」要落在**装备标签**上 —— 只 `push('bag')` 会停在道具页（背包默认那一页），
     玩家还得自己找一下标签。这里照 `sc-last.js` 里"强化类任务"的**同一段落点**写：
     先钉住底栏那一格、切到装备标签、再 reset 重画（那一段是既有的唯一写法，别另发明一套）。 */
  if (!CV.onAct['open_bag_equip']) CV.on('open_bag_equip', function () {
    CV.cur = 'bag';
    CV.dispatch('bagview:equip');
    CV.reset('bag');
  });
  G.OVERHAUL_2_0={version:'2.0.0',ready:true,currentWorld:currentWorld,nextStage:nextStage};
})();
