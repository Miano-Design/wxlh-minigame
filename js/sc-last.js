/* 最后一批页面（照网页版 js/ui.js 逐个复刻）
   ------------------------------------------------------------------------------
   · 炼化台 refineModal  ：说明 + 每种血清（名称/专属标/说明/配方/已有/制作按钮）
   · 限时悬赏 bountyModal：说明 + 每条（标题/状态/目标/剩余时间/奖励/领取或去完成）
   · 任务 tasksModal     ：四个标签（主线 / 日常 / 周常 / 成就）+ 各自列表
   · 设置 settingsModal  ：战斗速度 / 自动战斗 / 音效 / 自动进下一关 / 自动分解 / 存档与备份 / 主角列表
   · 挂机分工 idleLinesModal：说明 + 4 条产线（派领队）
   · 深井 corridorScreen ：当前层 / 深井印记与加成 / 本层守卫 / 通关奖励 / 挑战本层 / 深井商店
   数值全部读 Core/DATA。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  /* 游戏圈入口（js/sc-gameclub.js）。它在 game.js 里先于本文件加载 ——
     万一哪天顺序变了，也别让整页炸掉，退回"没有原生按钮"这条兜底路。 */
  const GC = G.GameClub || { placeContent: () => false, fallback: () => {} };
  const fmt = G.fmt || ((n) => String(n));
  const dur = (sec) => (G.formatDuration ? G.formatDuration(sec) : (sec + '秒'));
  /* V1.1.x（2026-09-27 · 音频系统）：这一片（炼化台 / 悬赏 / 任务 / 成就 / 设置）的音效出口。
     G.AUD 不存在时静默跳过（尺子的假环境不加载音频模块，别让尺子红在"没有音效"上）。 */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }
  function head(title) {
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'page_back');
    CV.text(title, U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
  }
  CV.on('page_back', () => CV.pop());

  /* ---------- 炼化台（血清） ---------- */
  CV.register('refine', function () {
    const S = Core.S;
    U.begin(); head('⚗️ 炼化台');
    U.hint('精华是永久强化剂：喂给某名伙伴后永久加属性，每人每种有上限。命格精华只有对应命格能用——先觉醒命格，再决定喂给谁。', 0);
    U.space(CV.SP[1]);
    /* ================= V1.1.13（0927-E · 总监 §5.3 来源②）：重铸石配方 =================
       版式与下面那张血清卡**同一套**（名字 / 说明 / 配方 / 已有 ＋ 右侧 炼×1 · 炼×10）。
       炼化台吃的是合成材料 → **天然与强化抢料**，所以这条配方**不限次**（不用另设限购）。 */
    {
      const R = D.REFORGE_CRAFT || { mat: 'mat_t3', matN: 2, points: 4000, out: 1 };
      const matName = (D.ITEMS[R.mat] || {}).name || R.mat;
      const haveMat = S.items[R.mat] || 0;
      const own = S.items[D.REFORGE_ITEM || 'reforge_stone'] || 0;
      const can = Math.min(Math.floor(haveMat / R.matN), Math.floor((S.cur.points || 0) / R.points));
      U.card(function () {
        const bw = Math.max(58 * CV.SCALE, CV.measure('炼 ×10', CV.FS.md) + 26 * CV.SCALE);
        const colGap = 8 * CV.SCALE, bh = U.BTN_SM * CV.SCALE, bGap = 6 * CV.SCALE;
        const lw = U.iw() - bw - colGap;
        const top = U.y;
        const nameSize = CV.FS.lg, nameLh = nameSize * 1.35;
        U.draw(function () { CV.text('🔨 重铸石', U.ix(), top + nameLh / 2, { size: nameSize }); });
        U.y = top + nameLh + 4 * CV.SCALE;
        U.hint('装备详情页「重铸」用它：档 A 重摇数值 · 档 C 重抽词条（每锁 1 条多花 1 颗）。', 0, CV.C.dim, lw);
        U.hint('配方：' + matName + ' ×' + R.matN + ' + ◉ ' + fmt(R.points)
          + '　（现有 ' + matName + ' ' + haveMat + ' · ◉ ' + fmt(S.cur.points || 0) + '）', 4 * CV.SCALE, CV.C.dim, lw);
        const ownTop = U.y + 4 * CV.SCALE;
        U.draw(function () {
          CV.text('已有 ×' + own, U.ix(), ownTop + CV.FS.xs * 0.8, { size: CV.FS.xs, color: own ? CV.C.green : CV.C.dim });
        });
        U.y = ownTop + CV.FS.xs * 1.6;
        const bx = U.ix() + U.iw() - bw;
        U.btn(bx, top, bw, bh, '炼 ×1', 'ghost', 'craftStone:1', can < 1);
        U.btn(bx, top + bh + bGap, bw, bh, '炼 ×10', 'ghost', 'craftStone:10', can < 10);
        const rightH = bh * 2 + bGap;
        if (rightH > U.y - top) U.y = top + rightH;
      });
    }
    U.space(CV.SP[1]);
    D.SERUMS.forEach(function (s) {
      const itemId = D.SERUM_ITEM(s.id);
      const own = S.items[itemId] || 0;
      /* V9.6.138：配方按通关进度开（一档开局、二档 W03 起、血统专属 W05~W09、高阶 W15~W30）。
         没开的照样列出来并写清差哪张图，玩家才知道后面还有货 —— 跟网页版同一份口径。 */
      if (!Core.serumUnlocked(s)) {
        U.card(function () {
          U.h3('🔒 ' + s.name);
          U.hint(Core.serumUnlockTip(s), 2 * CV.SCALE);
        });
        return;
      }
      const matName = (D.ITEMS[s.mat] || {}).name || s.mat;
      const haveMat = S.items[s.mat] || 0;
      const can = Math.min(Math.floor(haveMat / s.matN), Math.floor((S.cur.points || 0) / s.points));
      U.card(function () {
        /* 网页版结构：一行 flex —— 左列 flex:1（名称 / 说明 / 配方 / 已有），
           右列 flex 竖排两个 .btn.small：炼 ×1、炼 ×10。 */
        const bw = Math.max(58 * CV.SCALE, CV.measure('炼 ×10', CV.FS.md) + 26 * CV.SCALE);
        const colGap = 8 * CV.SCALE, bh = U.BTN_SM * CV.SCALE, bGap = 6 * CV.SCALE;
        const lw = U.iw() - bw - colGap;
        const top = U.y;
        const nameSize = CV.FS.lg, nameLh = nameSize * 1.35;
        /* V1.1.9（续13 · 乙组）：精华（血清）也有稀有度 —— 名字按**品质色**画，
           右边那颗小标签从"只有血统专属"扩成"专属 ＋ 品质"（报告 §10.2：一档通用 SR / 一档专属 SSR /
           二档通用 SSR / 二档专属 UR）。取值一律回查 `D.ITEMS[serum_x].rarity`，不在这儿再抄一份表。 */
        const serumRar = (D.ITEMS[itemId] || {}).rarity;
        const serumTag = (s.bloodline ? s.bloodline + '专属 · ' : '') + ((D.RARITY_NAME || {})[serumRar] || '');
        U.draw(function () {
          const cy = top + nameLh / 2;
          CV.text('💊 ' + s.name, U.ix(), cy, { size: nameSize,
            color: serumRar ? ((D.RARITY_COLOR || {})[serumRar] || CV.C.text) : CV.C.text });
          if (serumTag) {
            const w0 = CV.measure('💊 ' + s.name, nameSize);
            CV.text(serumTag, U.ix() + w0 + 4 * CV.SCALE, cy,
              { size: CV.FS.xs, color: CV.C.gold });
          }
        });
        U.y = top + nameLh + 4 * CV.SCALE;
        /* ⚠️ 第三参数是颜色、第四才是宽度（V9.6.143 修：原来把 lw 当颜色传了，
           结果限宽失效、文字压到右边的按钮底下）。 */
        U.hint(String(((D.ITEMS[itemId] || {}).desc) || '').replace(/^【[^】]*】/, ''), 0, CV.C.dim, lw);
        U.hint('配方：' + matName + ' ×' + s.matN + ' + ◉ ' + fmt(s.points)
          + '　（现有 ' + matName + ' ' + haveMat + ' · ◉ ' + fmt(S.cur.points || 0) + '）', 4 * CV.SCALE, CV.C.dim, lw);
        const ownTop = U.y + 4 * CV.SCALE;
        U.draw(function () {
          CV.text('已有精华 ×' + own, U.ix(), ownTop + CV.FS.xs * 0.8,
            { size: CV.FS.xs, color: own ? CV.C.green : CV.C.dim });
        });
        U.y = ownTop + CV.FS.xs * 1.6;
        /* 右列按钮（和左列同一顶部对齐） */
        const bx = U.ix() + U.iw() - bw;
        U.btn(bx, top, bw, bh, '炼 ×1', 'ghost', 'craft:' + s.id, can < 1);
        U.btn(bx, top + bh + bGap, bw, bh, '炼 ×10', 'ghost', 'craft10:' + s.id, can < 10);
        const rightH = bh * 2 + bGap;
        if (rightH > U.y - top) U.y = top + rightH;
      });
    });
  });
  D.SERUMS.forEach(function (s) {
    [1, 10].forEach(function (n) {
      CV.on('craft' + (n === 10 ? '10' : '') + ':' + s.id, function () {
        const r = Core.craftSerum(s.id, n);
        CV.toast(r.msg || (r.ok ? '已炼制' : '材料不够'));
        CV.render();
      });
    });
  });
  [1, 10].forEach(function (n) {
    CV.on('craftStone:' + n, function () {
      const r = Core.craftReforgeStone(n);
      CV.toast(r.msg || (r.ok ? '已炼制' : '材料不够'));
      CV.render();
    });
  });

  /* ---------- 限时悬赏 ---------- */
  CV.register('bounty', function () {
    const st = Core.bountyState();
    U.begin(); head('限时悬赏');
    U.hint('限时悬赏：到点作废，达成才有奖励。每条按自己的截止时间算，全部结束后可以开新一期。', 0);
    U.space(CV.SP[1]);
    U.card(function () {
      st.list.forEach(function (x) {
        const b = x.b;
        const top = U.y, h = 74 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        /* V9.6.14（自审：父亲人截图里"已领取/进行中"压住了按钮）：
           右侧那一列只留按钮 —— 状态本来就是按钮自己在说（已领取 / 去完成），
           再飘一个状态字只会跟按钮叠在一起。左侧正文也要按按钮宽度让位。 */
        const textW = U.iw() - bw - 12 * CV.SCALE;
        CV.text(CV.fit(b.name, textW, CV.FS.lg, true), U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text(CV.fit(b.desc || '', textW, CV.FS.sm), U.ix(), top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        /* V9.6.142：这一行原来单行 fit → 「剩余时间 12小时00分　奖励 ◉ 9500 …」尾巴被砍，
           玩家看不到奖励是什么。改成折行、卡片高度跟着算。
           V1.0.6（父亲大人 09-24 反馈图 09「4300 被断成 43 / 0」）：折行原来是**逐字**断的，
           专挑数字中间下刀。现在两件一起改：
             · 「剩余时间」与「奖励」**各起一行**（网页版就是两条 kv 行，不是一句合起来的）；
             · 折行走 CV.wrapTokens（只在 · / → / 空格处断），数字永远不会被劈成两半。 */
        const bLines = CV.wrapTokens('剩余时间 ' + (x.expired ? '已结束' : dur(Math.ceil(x.leftMs / 1000))), textW, CV.FS.sm)
          .concat(CV.wrapTokens('奖励 ' + Core.rewardTextOf(b.reward), textW, CV.FS.sm));
        const cardH = Math.max(h, (56 + (bLines.length - 1) * 17 + 17 + 8) * CV.SCALE);
        bLines.forEach(function (ln, k) {
          CV.text(ln, U.ix(), top + (56 + k * 17) * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        });
        const claimable = x.done && !x.claimed && !x.expired;
        U.btn(U.ix() + U.iw() - bw, top + (cardH - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          claimable ? '领取奖励' : (x.claimed ? '已领取' : '去完成'), claimable ? 'primary' : 'ghost',
          claimable ? 'bounty_claim:' + b.id : '');
        U.y = top + cardH;
      });
    });
    if (st.allOver) {
      U.btnRow([{ label: '开新一期悬赏', style: 'primary', id: 'bounty_renew' }]);
    }
  });
  CV.on('bounty_claim:*', function (id) {
    const r = Core.claimBounty(id);
    snd(r && r.ok === false ? 'error' : 'claim');
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('bounty_renew', function () {
    const r = Core.renewBounties();
    CV.toast(r.msg || '已开新一期');
    CV.render();
  });

  /* ---------- 任务（悬赏 → 每日 → 周常，一页到底）＋ 成就（独立页） ----------
     V1.1.5（A1）· 父亲大人 09-26 原话：
       「任务那里可以加个**一键领取**的功能，就不用一个个点了」
       「**每日任务和悬赏任务可以合并到一起**，把**主线任务和成就从日常任务的二级界面去掉**，
         不然主线任务都可以提前完成了，**主线任务就直接放在主页按顺序完成**就行了，
         全都完成后就可以**直接把主线任务的卡片去掉**了，不要放在那占位」
       「养成和日常你整理一下顺序，从常用到不常用重新排下序」（→ A2，表在 data.js）
       「进去二级界面和退出二级界面的位置感觉还是不太对，像任务那里，**每次领取完他就会回到最上面**，
         得再次下滑…就整体的交互感觉还可以再优化优化」
     落地口径＝《定调与口径》§3.3 / §3.4：
       · 一页到底：**限时悬赏（按最早到期排最上）→ 每日（8 条 ＋ 全清奖）→ 周常（＋全清奖）**，没有页签；
       · 页头一颗「一键领取」＝悬赏＋每日＋周常（含两档全清）—— 走 `Core.claimEverything('task')`，不新写第二套；
       · **主线与成就都搬出本页**：主线只剩主页那张卡（一步一领）、成就独立成页；
       · 「领完停在原地」＝ uiw.js 的引导滚动改成"每条引导只滚一次"（见那个文件里的同名注释）。 */
  /* 「前往 ›」的落点（逐条照网页版 gotoQuest / gotoDaily 的映射） */
  function goQuest(qid) {
    /* 点「去完成」= 换一件事讲：先把当前这条和排队的都清掉，
       否则上一条（常常就是首页那条"主线每一步做完都能领奖励"）会接着冒出来。 */
    if (U.coachClearAll) U.coachClearAll();
    /* 主动求引导：**只让这一步那条**再讲一遍（父亲大人："第一关的指引打完之后出来还是它"
       —— 以前这个窗口对所有引导都生效，点完这一步别的页的卡片也会跳出来）。 */
    U.coachForce(2500, G.questGuideKey ? G.questGuideKey(qid) : null);
    /* V9.6.112（父亲大人："第一关的指引打完之后出来还是第一关的指引"）：
       这一步的判定**已经满足了** —— 最常见的就是"打完第 1 关"同时满足了下一步
       （q01b 打完一场战斗 ↔ q02 通关第 1 关），于是玩家刚回到世界页，
       「去完成」又把他送回世界页、高亮又指着**第 1 关**，讲一句"每通关一关解锁下一关"。
       玩家感受：做完出来还是同一条引导，像是没更新。

       已经做完的步骤，玩家唯一还剩的动作只有一个：**回首页领奖**。
       所以这里不再往"做那件事"的界面送，而是回首页高亮「领取奖励」并说清楚。 */
    const qDone = (D.MAIN_QUESTS || []).find(function (x) { return x.id === qid; });
    if (qDone && qDone.check(Core.S)) {
      U.coachForce(2500, 'tut_claim_' + qid);
      CV.cur = 'home'; CV.reset('home');
      U.coach(['claim_quest', 'goto_quest'],
        '这一步已经做完了 —— 点「领取奖励」收下，领完自动接下一步。',
        { key: 'tut_claim_' + qid, mustTap: true });
      return;
    }
    const worldOf = { q12: 'W02', q14: 'W02', q15: 'W03' }[qid] || 'W01';
    /* V9.6.99（新手引导"真走一遍"的脚本抓出来的）：
       原来这里**自己另写了一套落点**，只特判了 q01/q13/q03/q09/q04/q07/q11 七步，
       其余全部走最后那行 —— 也就是**统统丢进残域**。实测 27 步里有 19 步是错的：
       秘术阁 / 法宝 / 药园 / 求签 / 斗法台 / 坐骑 / 挂机分工 / 悬赏 / 境界 / 伴生体 /
       灯录 / 转生 / 日常任务…点「去完成」全被送到残域，屏幕上还飘一句
       "点第 1 关就直接开打" —— 父亲大人报的"点了它跳去别处、弹窗内容不对"就是这里。
       现在落点**只认引导表**（sc-home 的 TUT：每一步在哪一页、指哪颗，表里写着），
       这里不再维护第二份映射，以后加主线步也不会再漏。 */
    if (qid === 'q07') {
      /* 装备强化：不能只"送到背包"，得切到装备栏 + 给第一件装备打引导（网页版同款） */
      CV.cur = 'bag';
      CV.dispatch('bagview:equip');
      const first7 = (Core.inventoryEquips() || [])[0];
      U.coach(first7 ? ('eqd:' + first7.uid) : 'bagview:equip', '点一件装备进去强化 —— 消耗材料提升数值，成功或失败都算一次。');
      CV.reset('bag');
      return;
    }
    /* V9.6.105（父亲大人："现在第一个主线任务都完成不了了"）：
       q01「熟悉身体」的判定是 `stats.profileViews >= 1`，而这个计数**只在
       真实的 `open_protag`（点主页那张主角卡）里 +1**。
       以前「去完成」是 `CV.reset('home'); CV.push('protag')` —— 只是"把人送到那一页"，
       计数没动 → q01 永远不算完成 → 玩家在「去完成 ↔ 角色卡」之间来回出不来。
       现在这一步直接执行**真实入口动作**（open_protag）：它会记 profileViews、
       再把页面推到角色卡 —— 玩家点一次「去完成」这一步就真的完成了。
       （其它步骤的判定都是"真做一个动作"，跳页没问题；q13 是升级血统，也算动作。） */
    if (qid === 'q01') {
      CV.cur = 'home';
      CV.stack = [{ name: 'home', opts: {} }];     // 摆好"从首页出发"的栈，但**不渲染首页**
      CV.dispatch('open_protag');                  // 真实入口动作：记 profileViews + 进角色卡
      return;
    }
    const dest = (G.questTarget && G.questTarget(qid)) || null;
    /* 战斗类主线步（在「残域」里）：直达对应世界的关卡页，由 world 页的引导指到那一关 */
    const WORLD_STEPS = { q01b: 1, q02: 1, q05: 1, q10: 1, q12: 1, q14: 1, q15: 1 };
    if (WORLD_STEPS[qid] || dest === 'world') {
      CV.cur = 'dungeon'; CV.reset('dungeon'); CV.dispatch('w:' + worldOf); return;
    }
    if (dest) { CV.cur = 'home'; CV.jump(dest); return; }   // 直接跳过去，别在中间渲染首页（V9.6.102）
    /* 兜底：引导表里没写落点的（说明那张表漏了这一步）。
       V9.6.103：**不许再把人送进残域** —— 原来这里就是"送残域"，
       于是任何一步只要表里漏了，玩家看到的就是"点主线 4 被带去看副本"。
       现在停在首页并把话说清楚（同时 guide_walk_audit 会把这种漏作为失败报出来）。 */
    U.coachForce(0);
    CV.cur = 'home'; CV.reset('home');
    CV.toast('这一步的入口还没配好，先回首页（已记录）');
  }
  /* 首页的「去完成」也要用它 —— 挂到 G 上共用（sc-home 比 sc-last 先加载，但按钮是点击时才跑，拿得到） */
  G.goQuest = goQuest;

  function goDaily(key) {
    /* 每日任务的「前往」同理：只让这条每日引导再讲一遍（别把别的页的卡片带出来） */
    U.coachForce(2500, 'daily_' + key);
    if (key === 'recruit1') { CV.cur = 'home'; CV.reset('home'); CV.push('recruit'); return; }
    if (key === 'idle1') { CV.cur = 'home'; CV.reset('home'); return; }
    if (key === 'enhance1') {
      CV.cur = 'bag';
      CV.dispatch('bagview:equip');
      const firstE = (Core.inventoryEquips() || [])[0];
      U.coach(firstE ? ('eqd:' + firstE.uid) : 'bagview:equip', '点一件装备进去强化 —— 消耗材料提升数值，成功或失败都算一次。');
      CV.reset('bag');
      return;
    }
    if (key === 'item1') { CV.cur = 'bag'; CV.reset('bag'); return; }
    CV.cur = 'dungeon'; CV.reset('dungeon');
  }
  /* V9.6.70（静态审计查出来的）：这里原来写 `D.DAILY_MAIN_GO || {...}` —— data.js 里**没有**这个导出，
     一直靠右边那份兜底在跑。引用一个不存在的东西早晚出事，直接把兜底那份留成唯一真相。 */
  const DAILY_MAIN_GO = { battle5: '残域打一场', idle1: '灯阁领挂机', enhance1: '装备页强化', recruit1: '招募 1 次', dungeon1: '残域通关一关', item1: '背包用道具' };
  /* 任务列表的一行：左 .t1/.t2（自动折行）+ 右侧 .btn.small（按行中线对齐） */
  function coreRow(o) {
    const bw = 84 * CV.SCALE, bh = U.BTN_SM * CV.SCALE;
    const rowTop = U.y;
    const h = U.listRow({ t1: o.t1, t2: o.t2, rightW: bw + 10 * CV.SCALE, dim: o.dim, tag: o.tag });
    const b = o.btn;
    if (b) U.btn(U.ix() + U.iw() - bw, rowTop + (h - bh) / 2, bw, bh, b[0], b[1], b[2], b[3]);
  }
  /* ---------- 任务（一页到底：悬赏 → 每日 → 周常） ---------- */
  CV.register('tasks', function () {
    U.begin(); head('任务');
    /* 页头那颗「一键领取」：范围＝悬赏＋每日＋周常（含两档全清），**不含主线**。
       没得领时也照旧显示（灰着）—— 页头那颗按钮本身就是"这里能一键收"的说明。 */
    const bst = Core.bountyState();
    const ts = Core.todayState();
    const allDailyDone = D.DAILY_TASKS.every((t) => ((Core.S.tasks.daily || {})[t.id] || 0) >= t.target);
    const ws = Core.weeklyState() || [];
    const allWeeklyDone = ws.every((x) => x.done);
    const anyable = bst.claimable > 0 || ts.dailyClaimable > 0 || ts.weeklyClaimable > 0;
    U.btnRow([{ label: anyable ? ('⚡ 一键领取（' + (bst.claimable + ts.dailyClaimable + ts.weeklyClaimable) + ' 项可领）') : '⚡ 一键领取',
      style: 'gold', id: anyable ? 'claim_all_tasks' : 'noop', dis: !anyable }]);
    U.space(CV.SP[1]);

    /* ① 限时悬赏（最早到期的那条排最上 —— 《定调与口径》§3.3 的"按到期压力"） */
    U.sectionTitle('限时悬赏');
    U.card(function () {
      const sorted = bst.list.slice().sort(function (a, b) {
        /* 还能领的排最前（这是玩家唯一要做的事）；其余按"离到期还剩多久"升序 */
        const ka = (a.done && !a.claimed && !a.expired) ? 0 : (a.expired ? 2 : 1);
        const kb = (b.done && !b.claimed && !b.expired) ? 0 : (b.expired ? 2 : 1);
        return ka - kb || a.leftMs - b.leftMs;
      });
      sorted.forEach(function (x) {
        const b = x.b;
        const top = U.y, h = 74 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        const textW = U.iw() - bw - 12 * CV.SCALE;
        CV.text(CV.fit(b.name, textW, CV.FS.lg, true), U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text(CV.fit(b.desc || '', textW, CV.FS.sm), U.ix(), top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        const bLines = CV.wrapTokens('剩余时间 ' + (x.expired ? '已结束' : dur(Math.ceil(x.leftMs / 1000))), textW, CV.FS.sm)
          .concat(CV.wrapTokens('奖励 ' + Core.rewardTextOf(b.reward), textW, CV.FS.sm));
        const cardH = Math.max(h, (56 + (bLines.length - 1) * 17 + 17 + 8) * CV.SCALE);
        bLines.forEach(function (ln, k) {
          CV.text(ln, U.ix(), top + (56 + k * 17) * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        });
        const claimable = x.done && !x.claimed && !x.expired;
        U.btn(U.ix() + U.iw() - bw, top + (cardH - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          claimable ? '领取奖励' : (x.claimed ? '已领取' : '去完成'), claimable ? 'primary' : 'ghost',
          claimable ? 'bounty_claim:' + b.id : '');
        U.y = top + cardH;
      });
      U.space(CV.SP[1]);
      if (bst.allOver) U.btnRow([{ label: '开新一期悬赏', style: 'primary', id: 'bounty_renew' }]);
      else U.hint('到点作废、达成才有奖励；全部结束后可以开新一期。', 2 * CV.SCALE);
    });

    /* ② 每日（8 条 ＋ 全部完成奖励） */
    U.sectionTitle('每日');
    U.card(function () {
      U.h3('每日任务', '每天 0 点重置');
      D.DAILY_TASKS.forEach(function (t) {
        const cur = Math.min((Core.S.tasks.daily || {})[t.id] || 0, t.target);
        const done = cur >= t.target;
        const claimed = !!(Core.S.tasks.claimed || {})[t.id];
        coreRow({
          t1: t.name,
          t2: cur + '/' + t.target + ' · 奖励 ' + Core.rewardTextOf(t.reward)
            + ((done || claimed) ? '' : (' · ' + (DAILY_MAIN_GO[t.id] || ''))),
          dim: claimed,
          btn: claimed ? ['已领', 'ghost', '', true] : (done ? ['领取', 'primary', 'task_claim:' + t.id] : ['前往 ›', 'ghost', 'godaily:' + t.id]),
        });
      });
    });
    U.card(function () {
      U.h3('全部完成奖励');
      U.note(Core.rewardTextOf(D.DAILY_ALL_REWARD), 2 * CV.SCALE);
      U.space(CV.SP[1]);
      const got = !!Core.S.tasks.allClaimed;
      U.btnRow([{ label: got ? '已领取' : '领取', style: 'gold', id: (!got && allDailyDone) ? 'all_daily' : 'noop', dis: got || !allDailyDone }]);
    });

    /* ③ 周常（5 条 ＋ 本周全清奖励） */
    U.sectionTitle('周常');
    U.card(function () {
      U.h3('周常任务', '周一 0 点重置');
      U.hint('本周 ' + Core.weekKey() + ' 起算 · 进度与每日任务通用，周一自动重置。', 2 * CV.SCALE);
      ws.forEach(function (x) {
        const t = x.t || {}, done = !!x.done, claimed = !!x.claimed;
        coreRow({
          t1: t.name || '', t2: Math.min(x.prog || 0, t.target || 0) + '/' + (t.target || 0) + ' · 奖励 ' + Core.rewardTextOf(t.reward),
          dim: claimed,
          btn: claimed ? ['已领', 'ghost', '', true] : (done ? ['领取', 'primary', 'week_claim:' + t.id] : ['进行中', 'ghost', '', true]),
        });
      });
    });
    U.card(function () {
      U.h3('本周全清奖励');
      U.note(Core.rewardTextOf(D.WEEKLY_ALL_REWARD), 2 * CV.SCALE);
      U.space(CV.SP[1]);
      const got = !!Core.S.tasks.weeklyAllClaimed;
      U.btnRow([{ label: got ? '已领取' : '领取', style: 'gold', id: (!got && allWeeklyDone) ? 'all_weekly' : 'noop', dis: got || !allWeeklyDone }]);
    });
  });

  /* ---------- 成就（独立页，V1.1.5 · A1）----------
     父亲大人：「把主线任务和成就从日常任务的二级界面去掉」—— 成就从任务页搬出来**单独一页**，
     主页「成就」那一格直接进这里；四类与判定**一个字没动**（《定调与口径》§3.3）。 */
  CV.register('ach', function () {
    U.begin(); head('成就');
    const sum = Core.achievementSummary();
    U.card(function () {
      U.kv('成就进度', '已达成 ' + sum.claimed + '/' + sum.total + ' · 可领取 ' + sum.list.filter((x) => x.done && !x.claimed).length);
    });
    ['战斗', '养成', '收集', '挑战'].forEach(function (cat) {
      const list = sum.list.filter(function (x) { return x.a.cat === cat; });
      if (!list.length) return;
      U.sectionTitle(cat);
      U.card(function () {
        list.forEach(function (x) {
          coreRow({
            t1: (x.claimed ? '🏅 ' : x.done ? '✨ ' : '') + x.a.name,
            t2: x.a.desc + ' · 奖励 ' + Core.rewardTextOf(x.a.reward),
            t1Color: x.done ? null : CV.C.dim, dim: x.claimed,
            btn: x.claimed ? ['已领', 'ghost', '', true] : (x.done ? ['领取', 'primary', 'ach_claim:' + x.a.id] : ['未达成', 'ghost', '', true]),
          });
        });
      });
    });
  });
  /* 主页「成就」那颗格子 → 直接进成就页 */
  CV.on('open_ach', function () { CV.push('ach'); });
  /* 页头「一键领取」：底层是同一个 `Core.claimEverything`，只换 scope（不新写第二套）。 */
  CV.on('claim_all_tasks', function () {
    const r = Core.claimEverything('task');
    snd((r && r.total) ? 'claim' : 'error');
    CV.toast((r && r.total) ? taskClaimSummary(r) : '暂时没有可领的');
    CV.render();
  });
  /* 领完把"收了几项、收在哪"说清（《定调与口径》§2 第 7 条点名的那个代价：
     一键把悬赏也收掉，玩家看不到单条明细）—— 一句话报四段，没动的段不报。 */
  function taskClaimSummary(r) {
    const d = r.detail || {};
    const seg = [];
    if (d.bounty) seg.push('悬赏 ' + d.bounty);
    if (d.tasks) seg.push('每日 ' + d.tasks);
    if (d.allDaily) seg.push('每日全清');
    if (d.weekly) seg.push('周常 ' + d.weekly);
    if (d.allWeekly) seg.push('周常全清');
    return '一键领取：' + seg.join(' · ');
  }
  CV.on('quest_claim:*', function (id) {
    const r = Core.claimQuest(id);
    snd(r && r.ok === false ? 'error' : 'claim');
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  /* quest_go:* / godaily:* 的真处理在下面（goQuest / goDaily）——这里不再登记占位 toast，
     否则"前往 ›"点了只弹一句话，玩家还是得自己找路。 */
  CV.on('task_claim:*', function (id) {
    const r = Core.claimTask(id);
    snd(r && r.ok === false ? 'error' : 'claim');
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('week_claim:*', function (id) {
    const r = Core.claimWeekly(id);
    snd(r && r.ok === false ? 'error' : 'claim');
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('ach_claim:*', function (id) {
    const r = Core.claimAchievement(id);
    snd(r && r.ok === false ? 'error' : 'claim');
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('godaily:*', function (key) { goDaily(key); });
  CV.on('quest_go:*', function (id) { goQuest(id); });
  CV.on('all_daily', function () {
    const r = Core.claimAllTasks();
    CV.toast(r.msg || '已领取全部完成奖励');
    CV.render();
  });
  CV.on('all_weekly', function () {
    const r = Core.claimAllWeekly();
    CV.toast(r.msg || '已领取本周全清奖励');
    CV.render();
  });

  /* ---------- 设置与存档（逐块照网页版 settingsModal） ---------- */
  /* .list-row + 右侧 .btn.small 是网页版最常见的一行：这里把两者放一起，
     右边按钮按"行的竖直中线"对齐（以前是各自拍一个 y，两个永远差几个像素）。 */
  function setRow(t1, t2, btnLabel, btnStyle, actId, dis) {
    const bw = 78 * CV.SCALE, bh = U.BTN_SM * CV.SCALE;
    const rowTop = U.y;
    const h = U.listRow({ t1: t1, t2: t2, rightW: bw + 10 * CV.SCALE });
    U.btn(U.ix() + U.iw() - bw, rowTop + (h - bh) / 2, bw, bh, btnLabel, btnStyle, actId, dis);
  }
  function settingsPage() {
    const S = Core.S, set = S.settings;
    U.begin(); head('设置与存档');
    /* ================= V1.1.x（0927-P · 父亲大人 2026-09-27 原话）=================
       「最后设置界面的内容和顺序应该是：**主角列表、声音、自动分解、游戏圈、然后找回存档、
         新手指引、玩法指南**做成三个按钮在一排就行了，最下面就一个**红色边框**按钮写
         **删除当前进度重新开始**」。
       这一屏就照他念的那串排（下面每一块的位置都能对上）。同一条原话里**撤掉**的：
         · 「玩法说明」那张卡 —— 玩法指南挪进"三个按钮那一排"；
         · 「战斗」那张卡（＝自动进入下一关）—— 整卡撤掉，**只撤界面**（`S.settings.autoNext`
           字段与战斗页那条自动推进的读取处**一个字没动**，见下面那张卡的注释）；
         · 「存档与备份」整张卡 —— 只留一颗「找回存档」（导出/导入/存档码/说明小字/诊断小字全撤，
           **逻辑层一行没删**：`Core.exportSave/importSave`、云函数 `savecode` 都还在）；
         · 「云同步」整张卡（开关一并撤）—— 现在**默认开启、关不了**（在 js/sc-cloud.js 里钉死）；
         · 「新手引导」那张卡 —— 内容挪进「新手指引」那颗按钮（`reset_coach` 处理器照旧）；
         · 「危险区」那张卡 —— 换成最下面那颗**红色边框**按钮。 */
    /* ① 主角列表（原样：列表 ＋ 切换 ＋ ➕ 新建主角）—— 父亲大人点名排在最上面 */
    U.card(function () {
      U.h3('主角列表');
      Core.protagonistList().forEach(function (p, i) {
        const bw = 62 * CV.SCALE, bh = U.BTN_SM * CV.SCALE;
        const rowTop = U.y;
        const h = U.listRow({
          /* V1.0.5（两端对表第 6 条）：「当前」照网页版画成一枚**金色描边 tag**
             （`<span class="tag" style="color:var(--gold);border-color:var(--gold)">当前</span>`），
             不再拼成"（当前）"跟在名字后面 —— 那是纯文本，跟网页版那枚描边小标不是一个东西。
             U.listRow 的 o.tag 就是为这个口子准备的（金色描边胶囊、画在标题右侧）。 */
          t1: p.name,
          tag: p.current ? '当前' : '',
          t2: 'Lv.' + p.level + ' · ' + (p.bloodline ? (p.bloodline + '命格 Lv.' + p.bloodlineLv) : '未觉醒命格'),
          rightW: p.current ? 0 : (bw + 10 * CV.SCALE),
        });
        /* 「切换」网页版是 .btn.small **默认底**（不是 ghost） */
        if (!p.current) U.btn(U.ix() + U.iw() - bw, rowTop + (h - bh) / 2, bw, bh, '切换', null, 'switch_alt:' + p.altIndex);
      });
      U.hint('新建主角从 Lv.0 开始，可体验不同命格路线；世界进度、货币、队伍不受影响', CV.SP[1]);
      U.space(CV.SP[1]);
      /* 「新建主角」网页版是 `btn small block` —— **默认底 + 整宽**（小游戏原来是 ghost 一行、
         宽度只够文字，看着像个次要按钮，而它其实是这一块唯一的主动作）。 */
      U.btn(U.ix(), U.y, U.iw(), U.BTN_SM * CV.SCALE, '➕ 新建主角', null, 'new_protag');
      U.y += U.BTN_SM * CV.SCALE;
    });
    /* V1.1.6（乙组 B-3 · 父亲大人 09-26 原话）：「把设置里的**战斗速度**…去掉」。
       整张卡撤掉（含 `speed_set:*` 三颗按钮）。
        ⚠️ **只撤界面**：`S.settings.speed` 这个字段**保留**（战斗页自己那颗 `battle_speed`
           仍然读写它；B9 的"免费 1×/2× ＋ 看广告 30 分钟 ×5"还要用它）。
          所以下一棒做 B9 时**别去 core 里找"speed 怎么没了"——它一直都在**。 */
    /* ================= V1.1.x（2026-09-27 · 音频系统）=================
       两个开关＝音乐 / 音效。**默认都开**（core 的 settings 默认值）。
       ⚠️ 2026-09-27（父亲大人发来截图："这个小字不要"）：原来每行下面各挂一句说明小字
       （"灯阁里的环境音乐，首尾交叠过…" / "点击、战斗命中、抽卡…这些打击声"）——**整段撤掉**，
       只留「背景音乐 / 音效」两个标题 ＋ 右侧开关。开关本身就是自解释的，小字是多余的一行。
       真正开关音频的逻辑在 `js/audio.js`（本页只翻标志位 + 调 `AUD.apply()` 让它立刻生效 ——
       **关掉音乐是真的 stop 掉 source**，不是只置标志位）。 */
    U.card(function () {
      U.h3('声音');
      [['bgm', '背景音乐'], ['sfx', '音效']].forEach(function (r) {
        const on = set[r[0]] !== false;
        setRow(r[1], '', on ? '已开启' : '已关闭', on ? 'primary' : 'ghost', 'toggle:' + r[0]);
      });
    });
    /* ================= V1.1.x（0927-P · 父亲大人 09-27 原话）=================
       「**然后吧战斗自动进入下一关的设置卡片去点吧，没必要**」——
       「战斗」那张卡（就是 `autoNext` 那颗「通关结算自动进下一关」）**整张撤掉**。
       ⚠️ 与前面几轮同一条纪律：**只撤界面** ——
         `S.settings.autoNext` 这个字段与它的读取处（战斗页那条"胜利结算 5 秒内没做选择就自动接着打"）
         **照旧留着、一个字没动**；等他哪天说"连逻辑一起去掉"再动。
         （撤掉之后这一页没有任何 `toggle:*` 的 `autoNext` 入口，`CV.on('toggle:*')` 里
          那个名字表照旧保留，不碍事。） */
    U.card(function () {
      U.h3('自动分解');
      [['autoSellN', '自动分解 N 装备', '掉到 N 品质直接换成 ◆ 异界结晶'],
        ['autoSellR', '自动分解 R 装备', '掉到 R 品质直接换成 ◆ 异界结晶']].forEach(function (r) {
        const on = !!set[r[0]];
        setRow(r[1], r[2], on ? '已开启' : '已关闭', on ? 'primary' : 'ghost', 'toggle:' + r[0]);
      });
    });
    /* ================= ④ 游戏圈（原样那一块 —— 见 P3）=================
       2026-09-26（流量主「条件二」）：游戏圈入口。微信只给**原生按钮**这一条路 ——
       位置在这里登记，由 js/sc-gameclub.js 逐帧摆上去（那份注释写了为什么不能画个 canvas 按钮了事）。
       放这一屏是父亲大人的口径（设置页那一屏）。
       ⚠️ 2026-09-27（父亲大人）：「**进入游戏圈的按钮滑动的时候还是会频闪**」——
         这一块本身没变，修的是 `js/sc-gameclub.js` 的 `GC.tick`（拖动中一次都不许重建原生按钮，
         见那里与 `js/cv.js` 的 `CV.dragging`）；上下两个位置（页内区块顺序）也不用管它。 */
    U.card(function () {
      U.h3('游戏圈');
      U.hint('和别的执灯者聊玩法、发攻略、领礼包。在微信「发现 → 游戏」里也能看到这个圈子。', CV.SP[1]);
      U.space(CV.SP[1]);
      const bw = U.iw(), bh = U.BTN_SM * CV.SCALE, bx = U.ix(), by = U.y;
      /* 原生按钮能摆上去时这里**什么都不画** —— 画了就是两层叠在一起、字会重影。
         画布兜底那颗与原生那颗**同底色 / 同描边 / 同圆角 / 同字号**（`U.btn` 的小按钮那一档，
         与 `build()` 里给原生按钮的 style 逐项对齐）——`scripts/gameclub_audit.js` ⑥ 段钉着。 */
      if (!GC.placeContent(bx, by, bw, bh, '进入游戏圈')) {
        U.btn(bx, by, bw, bh, '进入游戏圈', null, 'open_gameclub');
      }
      U.y = by + bh;
    });
    /* ================= V1.1.x（0927-P · 父亲大人 09-27 原话的两条）=================
       ① 「**存档只用留一个找回存档**，以防丢档的时候可以回溯就行了，感觉也不用导出导入了，
          反正存档都在云」—— 原来那张「存档与备份」整张卡（导出 / 导入 / 生成存档码 /
          用存档码取回 / 三行说明小字 / 诊断小字 / 恢复上一份存档）**全部撤掉**，只留一颗
          「找回存档」（就是下面第 5 排三颗里最左边那颗，处理器 `save_recover`）。
          ⚠️ **逻辑层一行没删**：`Core.exportSave / importSave`、存档码的云函数入口
          （`js/sc-cloud.js` 的 `makeCode/claimCode`）与 `save_export / save_import /
          code_make / code_claim` 四个**处理器**都原样留着 —— 以后要把入口挂回来，贴一颗按钮就行。
       ② 「**默认开启云同步，关不了**」—— 原来那张「云同步」卡（开关 / 立即同步 /
          从云端下载存档 / 取回云端旧备份 / 上次同步那两行）**整张撤掉**；
          开关在 `js/sc-cloud.js` 里被钉成**常开**（`prefs().on` 恒 true、`info().on` 恒 true），
          界面上**没有任何入口**能把它关掉。静默同步那套口径（谁新听谁的、不弹窗、覆盖前两头留档、
          每天 20 次上限）**一个字没改**；云同步那四颗按钮的**界面胶水**（`cloud_toggle /
          cloud_push / cloud_pull / cloud_prev`）跟着卡一起删了 —— 手动取回云端那份的能力
          收口到了「找回存档」里（它自己调 `CS.pullCloud()` / `CS.takeCloudPrev()`）。 */
    /* ================= ⑤ 一排三颗：找回存档 · 新手指引 · 玩法指南 =================
       父亲大人 09-27：「然后**找回存档、新手指引、玩法指南**做成三个按钮在一排就行了」。
       走 `U.tiles`（网页版 .text-menu 那套**三列文字宫格**，本页与首页同一件通用件）：
       它的格宽是按可用宽度三等分算的，320 短屏上也是**实打实的一排三颗**
       （换成 U.btnRow 会撞上 .btn 的 86px 最小宽，窄屏被迫折成两行 —— 那不是他要的）。
       · 找回存档 → `save_recover`（下面那段处理器：列出来源、只给一颗「恢复」）；
       · 新手指引 → `reset_coach`（原「新手引导」那张卡的那颗处理器，一个字没改）；
       · 玩法指南 → `open_guide`（原「玩法说明」那张卡的那颗按钮，挪到这里）。 */
    U.card(function () {
      U.tiles([['save_recover', '找回存档'], ['reset_coach', '新手指引'], ['open_guide', '玩法指南']]);
    });
    /* V1.1.6（乙组 B-5 / B-6 · 父亲大人 09-26 原话）：「把设置里的…**适龄、健康游戏**去掉」。
       两张卡整段撤掉（适龄提示全文 / 《健康游戏忠告》全文）。**合规现状（照实记，别只写"删了"）**：
         · 忠告**没有从游戏里消失**：冷启动那个独立弹窗（`uiw.js` 的 `U.healthNotice`，
           由 game.js 开机调）**照旧**全文登载 —— 提审要的"游戏开始前显著位置全文"仍然成立；
           设置页这张只是"进游戏之后还能再查一遍"的那份副本。
         · 适龄提示**游戏内一处都不剩了**：平台启动页会自己打，MP 后台那一栏仍要自己设好。
         · `D.COMPLIANCE.ageFull / healthTitle / healthAdvice` 这些**数据字段保留**（别顺手删）：
           冷启动弹窗正在读 `healthTitle/healthAdvice`。
       （这是父亲大人的决定，照做；风险已在此写清。） */
    /* ================= ⑥ 最下面那一颗：红边框的删档按钮 =================
       父亲大人 09-27：「最下面就一个**红色边框**按钮写**删除当前进度重新开始**」。
       原来包在「危险区」那张卡里（ghost 小按钮）—— 现在卡撤掉、换成**整宽的红边框按钮**：
       `style: 'danger'` 是这一轮往通用件上新增的一档（U.btn，见 js/uiw.js）——
       只描边不填底，描边取色板 `danger`（#d43a4f），字取 `dangerText`（#e8626f）。
       **不用纯 #FF0000**：那在深色底上又刺眼又不过对比度（12px 红字要 4.5:1，
       `danger` 直接当字色只有 3.5 上下，项目里一直是"面用 danger、字用 dangerText"）。
       点它 → `wipe_save`（下面那段：随机 4 位数字的二次确认，敲对了才真删）。 */
    U.btn(U.ix(), U.y, U.iw(), U.BTN_H * CV.SCALE, '删除当前进度，重新开始', 'danger', 'wipe_save');
    U.y += U.BTN_H * CV.SCALE;
    U.space(CV.SP[2]);
    U.draw(function () {
      /* 2026-09-23（文案策划 · 提审合规）：外显名必须与备案名一致 ——
         备案名是「残域灯阁」，设置页原来写「残域」，属"名字对不上"（常见驳回理由）。
         注意「残域」在游戏里是**副本系统**的名字（底栏第 2 格），那个不动。 */
      CV.text('残域灯阁 V' + (G.GAME_VER || ''), CV.W / 2, U.y + 8 * CV.SCALE,
        { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
    });
    /* ================= V1.1.15（2026-09-27 · 父亲大人："把 GM 后门关了"）=================
       这个连点入口是开发期刷数据用的（版本号连点 7 下 → 调试面板：能跳任意页面、一键发资源）。
       游戏已经面向真实用户，**后门关掉**：
         · 热区不再登记（玩家连点不会有任何反应，也不会弹"再点 N 下"的提示）；
         · `CV.on('gm_tap')` 与 `CV.register('gm')` **都留着**（前者满足 `tap_audit` 那条
           "登记了热区就必须有处理器"，后者防"别处跳转过来找不到页面"直接崩）——
           只是从今往后**没有任何入口**通向它。
       以后还要调试：把下面 `GM_OPEN` 改成 true，仅此一处。 */
    if (GM_OPEN) CV.hit('gm_tap', CV.W / 2 - 70 * CV.SCALE, U.y, 140 * CV.SCALE, 18 * CV.SCALE);
    U.space(18 * CV.SCALE);
  }
  CV.register('settings', settingsPage);
  CV.on('toggle:*', function (k) {
    const set = Core.S.settings;
    set[k] = !(set[k] !== false);
    Core.save();
    /* 音频两个开关（bgm / sfx）：翻完标志位立刻落到音频上 —— 关音乐＝真 stop（见 js/audio.js）。
       G.AUD 不存在时（尺子的假环境没加载音频模块）什么也不做，不影响本页其它开关。 */
    if (G.AUD && G.AUD.apply) G.AUD.apply();
    /* V9.6.115：名字表里也去掉已下线的 autoBattle / sfx（开关本身已经不渲染了）。
       原来的三元表达式两个分支一模一样，等于白写 —— 顺手简化成一句。 */
    CV.toast(({ autoNext: '结算自动进下一关', autoSellN: '自动分解 N', autoSellR: '自动分解 R',
      bgm: '背景音乐', sfx: '音效' }[k] || k) + '：' + (set[k] ? '已开启' : '已关闭'));
    CV.render();
  });
  /* V1.1.6（B-3 的连带）：`speed_set:*` 的处理器删掉 —— 设置页那张卡已经撤了，
     留着一个没有入口的处理器就是"死代码"（`tap_audit` 的静态检查也在盯这一类）。
     ⚠️ `S.settings.speed` 字段与战斗页那颗 `battle_speed` **都不动**（B9 还要用）。 */
  /* ---------- 存档导出 / 导入 ----------
     网页版是弹一个文本框让你全选复制 / 粘贴；画布里没有输入框也没有"全选"，
     小游戏就用**剪贴板**当那个文本框 —— 语义一样（一段可搬走的存档文本），
     而且是这台设备上唯一能跨设备搬档的路子。 */
  /* ================= V1.1.x（0927-P · 「找回存档」＝存档那一块唯一的入口）=================
     父亲大人 09-27：「**存档只用留一个找回存档，以防丢档的时候可以回溯就行了**，
     感觉也不用导出导入了，反正存档都在云」。
     原来那三块（「恢复上一份存档」一颗、导出/导入、云同步那张卡）现在**收口成这一颗按钮**：
     点开＝一份**只读清单**（本机备份 / 云端上一份 / 云端当前那份，各带时间与大小）＋**一颗「恢复」**。
     · 「恢复」**自动取较新的那一份**（他 09-27 的既有口径：真冲突默认选最新，不要让玩家选）；
     · 恢复前**先把现在这份留档** —— 三条路各自都会留，**不另写一套**：
         本机备份 → `Core.restoreFromBackup()`（它把当前主档写进 `_pre_restore`）；
         云端当前 → `CS.applyCloudSave()`（它在覆盖前把当前主档写进 `_bak`）；
         云端上一份 → `CS.takeCloudPrev()`（同一条 `applyCloudSave` 路）。
     · 一个来源都没有 → 如实写「暂无可回溯的存档」，**不给一颗点了没反应的死键**（只留「知道了」）。
     ⚠️ 比时间用的三把尺子：本机备份 `at`（写备份那一刻）/ 云端当前 `ts`（那份档自己的时间戳，
       `CS.pullCloud()` 回来的那个）/ 云端上一份 `prevTs`（被换掉那份自己的时间戳）。
       都是"这一份是什么时候落的"，同一量纲；不比大小到字节级（差异只在秒级边角）。 */
  CV.on('save_recover', function () {
    const CS = G.CloudSync;
    const bak = (Core.backupInfo ? Core.backupInfo() : null) || { exists: false };

    /* 画清单：cloud ＝ { ok:false } / null（还没读到）或 { ok:true, doc:{ts,bytes,payload} } */
    const paint = function (cloud) {
      const ci = CS ? CS.info() : null;
      const rows = [];
      if (bak.exists) rows.push({ key: 'bak', name: '本机备份', at: Number(bak.at) || 0, bytes: bak.len || 0, bad: !bak.readable });
      if (cloud && cloud.ok && cloud.doc) rows.push({ key: 'cloud', name: '云端当前', at: Number(cloud.doc.ts) || 0, bytes: Number(cloud.doc.bytes) || 0 });
      if (ci && (ci.prevAt || ci.prevTs)) rows.push({ key: 'prev', name: '云端上一份', at: Number(ci.prevTs || ci.prevAt) || 0, bytes: Number(ci.prevBytes) || 0 });

      if (!rows.length) {
        U.confirm('找回存档', '暂无可回溯的存档。' + (CS && CS.info().available ? '' : '（这台设备没有云开发能力，云端那份读不到）'),
          function () { CV.render(); }, { cancel: false, okLabel: '知道了' });
        return;
      }
      const when = function (t) { return t ? new Date(t).toLocaleString() : '不知道什么时候'; };
      const list = rows.map(function (r) {
        return r.name + '　' + when(r.at) + '　' + cloudKB(r.bytes) + (r.bad ? '（可能读不出）' : '');
      }).join('\n');
      rows.sort(function (a, b) { return b.at - a.at; });
      const pick = rows[0];
      U.confirm('找回存档', '能回溯的就这几份：\n' + list
        + '\n点「恢复」会自动取**最新**的那一份（' + pick.name + '），现在这份会先留一手。',
      function () {
        const done = function (ok, msg) {
          CV.toast(ok ? msg : (msg || '没恢复成，你的进度没动'), 3600);
          if (ok) CV.reset('home'); else CV.render();
        };
        if (pick.key === 'bak') {
          const r = Core.restoreFromBackup();
          done(!!(r && r.ok), (r && r.msg) || '恢复失败');
          return;
        }
        if (pick.key === 'cloud') {
          const r = CS.applyCloudSave(cloud.doc.payload, cloud.doc.ts, 'recover');
          done(!!(r && r.ok),
            (r && !r.ok) ? (r.msg || '没恢复成') : (r && r.same ? '本机就是最新的这份，没有改动' : '已恢复到云端那份'));
          return;
        }
        CS.takeCloudPrev().then(function (r) {
          done(!!(r && r.ok), (r && r.msg) || (r && r.ok ? '已恢复到云端上一份' : '没恢复成'));
        });
      }, { okLabel: '恢复' });
    };

    /* 先把云端那份读回来（只读一次，不写任何东西）；读的过程给一句实话，
       读不到就照实只列本机那份（绝不假装"云端没有"）。 */
    if (!CS || !CS.info().available) { paint({ ok: false }); return; }
    CV.toast('正在读云端…', 1200);
    CS.pullCloud().then(paint, function () { paint({ ok: false }); });
  });
  CV.on('save_export', function () {
    /* V1.1.x（0927-L · 云同步）：导出档外面**套一层信封**，信封上写微信账号指纹
       （openid 的哈希，不是 openid 本身）—— 导入时凭它拒收"别的账号导出的档"。
       ⚠️ 存档本体一个字没变，还是 `Core.exportSave()` 那串密文；
          老玩家手里那些**没有信封**的旧导出串也照样能导进来（见下面的导入那一段）。 */
    const CS = G.CloudSync;
    const raw = Core.exportSave();
    const json = CS ? CS.wrapExport(raw) : raw;
    const bound = CS ? CS.info().bound : false;
    if (!(G.wx && G.wx.setClipboardData)) { CV.toast('这台设备不支持剪贴板'); return; }
    try {
      G.wx.setClipboardData({
        data: json,
        success: function () {
          CV.toast('存档已复制到剪贴板（' + json.length + ' 字符），发给别的设备粘贴导入即可'
            + (bound ? '' : '；这次还没绑上微信账号，导入时不做账号校验'), 3600);
        },
        fail: function () { CV.toast('复制失败，请重试'); },
      });
    } catch (e) { CV.toast('复制失败，请重试'); }
  });
  CV.on('save_import', function () {
    if (!(G.wx && G.wx.getClipboardData)) { CV.toast('这台设备不支持剪贴板'); return; }
    try {
      G.wx.getClipboardData({
        success: function (res) {
          const txt = String((res && res.data) || '').trim();
          if (!txt) { CV.toast('剪贴板是空的：先把存档内容复制下来'); return; }
          /* ① 账号指纹这一关（云同步模块在：信封带指纹就比对，不带就放行但标注）；
             ② 存档本体的形状这一关 —— 明文/信封都是 `{` 开头，**密文是 `MPG1:` 开头**
                （存档从 V1.1.12 起默认是密文，所以"必须以 { 开头"这句老话会把自家导出的档挡在门外）。 */
          const CS = G.CloudSync;
          const chk = CS ? CS.checkImport(txt) : { ok: true, data: txt, note: '' };
          if (!chk.ok) { CV.toast(chk.msg || '这份存档不能导入', 4000); return; }
          const body = chk.data;
          if (body.charAt(0) !== '{' && !/^MPG\d+:/.test(body)) { CV.toast('剪贴板里不是存档内容'); return; }
          U.confirm('导入存档', '剪贴板里这段存档会**覆盖当前进度**（共 ' + body.length + ' 字符）'
            + (chk.note ? '。' + chk.note : '') + '，确定吗？', function () {
            const r = Core.importSave(body);
            CV.toast(r.ok ? '存档已导入' : (r.msg || '导入失败'));
            if (r.ok) CV.reset('home'); else CV.render();
          });
        },
        fail: function () { CV.toast('读取剪贴板失败'); },
      });
    } catch (e) { CV.toast('读取剪贴板失败'); }
  });
  /* ---------- 云同步：界面上**一颗按钮都不留**（判断与联网全在 js/sc-cloud.js） ----------
     父亲大人 09-27：「**默认开启云同步，关不了**」——原来那四颗（开关 / 立即同步 /
     从云端下载存档 / 取回云端旧备份）连同「云同步」那张卡一起撤掉。
     ⚠️ 这里删掉的只是**界面胶水**：`CS.toggle / manualPush / pullCloud / takeCloudPrev`
       与静默同步那套口径（谁新听谁的、不弹窗、覆盖前两头留档、每天 20 次上限）**一个字没改**；
       "从云端恢复"这条能力收口到了上面那颗「找回存档」里（它自己调 `CS.pullCloud()` /
      `CS.takeCloudPrev()` / `CS.applyCloudSave()`）。**开关本身在 sc-cloud.js 里被钉成常开。** */
  function cloudKB(n) { return (Number(n) / 1024).toFixed(1) + ' KB'; }
  /* ---------- 存档码（生成 / 取回）：8 位 · 24 小时 · 用一次即失效 ---------- */
  CV.on('code_make', function () {
    const CS = G.CloudSync;
    if (!CS) { CV.toast('这台设备没有云开发能力：可以用【导出存档】'); return; }
    CV.toast('正在生成存档码…', 1400);
    CS.makeCode().then(function (r) {
      if (!r.ok) { CV.toast(r.msg || '这次没生成出来，等会儿再试', 4000); CV.render(); return; }
      /* 生成完直接替他复制到剪贴板（这一步就是在"搬那份 17KB"，只是不用他看见）。 */
      let copied = false;
      try {
        if (G.wx && G.wx.setClipboardData) { G.wx.setClipboardData({ data: r.code }); copied = true; }
      } catch (e) {}
      const until = r.expireAt ? new Date(r.expireAt).toLocaleString() : '24 小时内';
      U.confirm('存档码' + (copied ? '（已复制）' : ''), r.code
        + '\n把这串码发到另一台设备，在那台设备点【用存档码取回】。'
        + '\n有效期到 ' + until + '，**用一次就失效**。',
      null, { cancel: false, okLabel: '知道了' });
    });
  });
  CV.on('code_claim', function () {
    const CS = G.CloudSync;
    if (!CS) { CV.toast('这台设备没有云开发能力：可以用【导入存档】'); return; }
    if (!(G.wx && G.wx.getClipboardData)) { CV.toast('这台设备不支持剪贴板'); return; }
    try {
      G.wx.getClipboardData({
        success: function (res) {
          const code = CS.normCode((res && res.data) || '');
          if (!code) { CV.toast('剪贴板里没有 8 位存档码：先在另一台设备上【生成存档码】，把码复制过来', 4200); return; }
          CV.toast('正在取回…', 1400);
          CS.claimCode(code).then(function (r) {
            if (!r.ok) { CV.toast(r.msg || '没取回来（这个码可能已经用过或过期）', 4200); CV.render(); return; }
            U.confirm('用存档码取回',
              '存档码 **' + r.code + '** 里那份存档会**覆盖本机现在的进度**'
              + (r.createdAt ? '（生成于 ' + new Date(r.createdAt).toLocaleString() + '）' : '')
              + '。本机这份会先留一手，能在设置里恢复。确定吗？',
              function () {
                const a = CS.applyExternal(r.data, 'code');
                CV.toast(a.ok ? '存档已取回' : (a.msg || '没取回来'), 3600);
                if (a.ok) CV.reset('home'); else CV.render();
              }, { okLabel: '取回' });
          });
        },
        fail: function () { CV.toast('读取剪贴板失败'); },
      });
    } catch (e) { CV.toast('读取剪贴板失败'); }
  });
  /* V1.1.6（B-4 的连带）：三格存档槽的 `slot_save:* / slot_load:*` 处理器删掉（界面已撤）。
     `Core.saveSlot / loadSlot / slotInfo` 三个**逻辑层函数原样保留**（老档里存过的槽、
     以及以后要把这个入口放回来时都用得上）—— 这一轮只撤界面。 */
  /* 主角列表三个动作（照网页版 settingsModal 的 data-switchprotag / data-newprotag / data-reset） */
  CV.on('switch_alt:*', function (i) {
    const r = Core.switchProtagonist(+i);
    CV.toast(r.msg || '已切换主角');
    CV.render();
  });
  CV.on('new_protag', function () {
    /* V1.0.1（微信平台审核驳回 · "用户自定义昵称"）：原来这里用 wx.showKeyboard 让玩家**自由输入**名字。
       平台判定这属于"用户产生内容"，要求接入内容安全 API（imgSecCheck / msgSecCheck）——
       而那两块要 access_token，**客户端调不了**，得养云函数或自建后端。
       本游戏是单机放置：名字不上传、不展示给他人、没有排行榜，为它养一套服务端不划算。
       所以改成**从数据层的预设名单里挑**（名单两端同源，见 wxlh-game/js/data.js 的 PROTAG_NAMES）：
       玩家仍然能"新建一个主角、换一个名字"，但**不再产生自由文本** → 从根上不是 UGC。
       以后真做排行榜 / 分享需要展示昵称时，再回来接内容安全 API。 */
    const nm = D.pickProtagName();
    const r = Core.createProtagonist(nm);
    CV.toast(r.msg || (r.ok ? ('已创建：' + nm) : '创建失败'));
    CV.render();
  });
  /* GM：一键补测试道具（V9.6.129） */
  CV.on('gm_eggs', function () {
    Core.addItem(D.BEAST_EGG_ITEM || 'beast_egg', 200);   // 兽魂石（孵化用）
    CV.toast('兽魂石 +200');
    CV.render();
  });
  CV.on('gm_mats', function () {
    ['mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5'].forEach(function (k) { Core.addItem(k, 200); });
    /* V1.1.4（A12）：GM 也要能一次补出**新料**，否则父亲大人验"铭刻 / 命格 / 权限 / 秘术 / 药园"
       这五条线还得先去刷副本（这不是"我加的东西"应当留下的门槛）。 */
    ['minghun_sha', 'xuesui_jing', 'dengyou', 'mijuan_canzhang', 'lingzhi_zhong'].forEach(function (k) { Core.addItem(k, 200); });
    CV.toast('各档强化材料 +200 · 五种新料 +200');
    CV.render();
  });
  CV.on('gm_exps', function () {
    ['exp_s', 'exp_m', 'exp_l', 'exp_xl', 'exp_xxl'].forEach(function (k) { Core.addItem(k, 50); });
    CV.toast('各档经验模块 +50');
    CV.render();
  });

  CV.on('reset_coach', function () {
    Core.S.coachSeen = {};
    /* V9.6.113（父亲大人："每次修改能不删档才能更新吗"）：**保留进度**重跑新手引导。
       光清 coachSeen 是不够的 —— 开场链有一条"只要领过任何主线奖励就整条作废"的规矩
       （防止老玩家被打断），于是有进度的存档点了它也不会重新走一遍。
       这里多打一个开关：这次是玩家**主动要**看的，那就完整走一遍；走完自动清掉。 */
    Core.S.tourForce = true;
    Core.save();
    /* V9.6.66（与网页版同步）：点完直接**把人带回首页并把开场引导接上**，
       不用再让玩家自己摸回首页才看见效果（网页版也是这个行为）。 */
    CV.cur = 'home';
    CV.reset('home');
    CV.toast('新手引导已重置 —— 从首页重新开始讲');
  });
  /* ================= V1.1.x（0927-P · 删档的二次确认：随机 4 位数字）=================
     父亲大人 09-27：「然后**点击删档跳出来一个确认弹窗随机生成 4 个数字，让玩家输入这四个数字
     一致后才能删档，避免误触**」。
     做法（**不新造一套**）：
       · 弹窗走通用件 `U.confirm` 的**输入格**（`opt.inputBox` / `opt.inputId`，见 js/uiw.js）——
         那块与"购买数量"那颗数字格同口径；
       · 收字照抄**项目里已有的那一套**（`js/sc-grow.js` 的购买数量：
         `wx.offKeyboardConfirm()` → `wx.onKeyboardConfirm()` → `wx.showKeyboard({type:'number'})`），
         **不新写一套输入**（起名那一步踩过的坑：小游戏的键盘事件是**全局**的，必须先注销上一个）；
       · 弹窗里**不给「确认删档」那颗按钮**（避免又点一次误触）——一致性只在键盘那一下判：
         对不上就**不删**、给一句人话、弹窗留着；对上了才真删。取消 / 关掉随时可以。
       · 删档是**最重的操作**：删之前先把当前档留一份（写进 `_bak`，与 core 的 `backupSave` 同一格式，
         也就是「找回存档」里那份"本机备份"）—— 父亲大人说的"不留备份"指的是别堆古董文件，
         **存档的救援副本要留**（`restoreFromBackup` 那套口径）。留不成就不许删（下面第 ③ 句）。 */
  let wipeDigits = '', wipeTyped = '';
  const wipeKeyOk = function () {
    const W = G.wx;
    return !!(W && W.showKeyboard && W.onKeyboardConfirm);
  };
  function wipeDialog() {
    /* 那 4 个数字放在**标题**上：弹窗里字最大、最亮的那一行就是它（正文是 --dim 灰的、
       胶囊小字是 11px，都压不住"必须看清并照着敲"这件事）。
       正文三句话各管一件事：会清掉什么 / 怎么才算数 / 删之前留了一手。 */
    U.confirm('删除当前进度　' + wipeDigits.split('').join(' '),
      '会清掉这台设备上的全部进度，重新从开局契约开始。\n照着上面这四个数字输入一遍才会删档。',
      null,
      {
        inputBox: { value: wipeTyped, placeholder: '点这里输入这四个数字' },
        inputId: 'wipe_input',
        cancel: false, okLabel: '取消', okStyle: 'ghost',   // ← 只有"取消"这一颗，没有"确认删档"
        note: '删档前会先把现在这份进度留一手，真删错了能在【找回存档】里拿回来一份。',
      });
  }
  CV.on('wipe_save', function () {
    if (!wipeKeyOk()) { CV.toast('这台设备不支持数字键盘，删档没开（免得误触）'); return; }
    /* 每次打开**重新摇** 4 个数字（1 位数 ×4，0 也可以是其中一位）。 */
    wipeDigits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    wipeTyped = '';
    wipeDialog();
  });
  CV.on('wipe_input', function () {
    const W = G.wx;
    if (!wipeKeyOk()) { CV.toast('这台设备不支持输入'); return; }
    try {
      /* 与 `js/sc-grow.js` 的 `buynum` **逐句同源**：先注销上一个全局处理器，再挂这一个。 */
      if (W.offKeyboardConfirm) W.offKeyboardConfirm();
      W.onKeyboardConfirm(function (res) {
        if (!U.overlay) return;                        // 弹窗已经关掉了（关掉之后敲键盘不算数）
        const raw = String((res && (res.value !== undefined ? res.value : res.data)) || '');
        const typed = raw.replace(/[^0-9]/g, '').slice(0, 4);
        if (typed !== wipeDigits) {
          /* 对不上 = **不删** ＋ 一句人话；弹窗留着（重新画一遍，把刚敲的显示出来）。 */
          wipeTyped = typed;
          wipeDialog();
          CV.toast('数字对不上，没有删', 2600);
          return;
        }
        /* 对上了 —— 删之前先留一手。留不成（这个版本没有留档口）就**不删**。 */
        const CS = G.CloudSync;
        if (!CS || !CS.keepBackup) { CV.toast('这个版本没法先把存档留一手，删档已取消'); return; }
        if (!CS.keepBackup(Core.exportSave(), 'wipe')) { CV.toast('存档没能先留一手，删档已取消'); return; }
        U.overlay = null;
        Core.wipeSave();
        /* V9.6.100：删档 = 内存也回到全新档，所以这里必须补一次 newGame() ——
           defaultState() 是"零资源"的空壳（点数 0），newGame() 才会发开局资源、
           并**恢复存盘开关**（wipeSave 会把它关上，防旧档被写回）。 */
        Core.newGame();
        Core.ensureDaily && Core.ensureDaily();
        CV.reset('welcome');
        CV.toast('已删除进度，重新开始（刚才那份在【找回存档】里还留着）', 3200);
      });
      W.showKeyboard({ type: 'number', defaultValue: wipeTyped, maxLength: 4, success: function () {}, fail: function () { CV.toast('这台设备不支持输入'); } });
    } catch (e) { CV.toast('这台设备不支持输入'); }
  });

  /* ---------- GM 调试页（V9.6.12，父亲大人："小程序的 GM 后门先给我开开"）----------
     小游戏原来**没有** GM 面板，导致很多界面（没解锁的 / 需要资源的）根本进不去。
     这里补一个：设置与存档 → 连点版本号 7 次进入。能 ① 直接跳任意页面 ② 一键发资源。 */
  const GM_OPEN = false;     // ← 调试后门总开关（父亲大人 2026-09-27：关）
  let gmTaps = 0, gmTimer = null;
  CV.on('gm_tap', function () {
    if (!GM_OPEN) return;
    gmTaps++;
    clearTimeout(gmTimer);
    gmTimer = setTimeout(function () { gmTaps = 0; }, 2000);
    if (gmTaps >= 7) { gmTaps = 0; CV.push('gm'); }
    else if (gmTaps >= 3) CV.toast('再点 ' + (7 - gmTaps) + ' 下打开调试面板');
  });
  CV.register('gm', function () {
    const S = Core.S;
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'page_back');
    CV.text('调试面板（GM）', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    /* V9.6.90：与网页版同一句警示（网页版 GM 面板顶部那行红字） */
    U.hint('仅用于开发测试，滥用会破坏游戏乐趣', 0, CV.C.accent);
    U.space(CV.SP[1]);
    U.card(function () {
      U.h3('一键发资源');
      U.btnRow([
        { label: '全部货币 +9 亿', style: 'primary', id: 'gm_all' },
        { label: '🎫 券各 ×100', style: 'ghost', id: 'gm_tk' },
      ]);
      U.space(CV.SP[1]);
      U.btnRow([
        { label: '🔓 全解锁', style: 'ghost', id: 'gm_unlock' },
        { label: '🌍 全世界解锁', style: 'ghost', id: 'gm_worlds' },
      ]);
      U.space(CV.SP[1]);
      /* V9.6.129（父亲大人："GM 面板里没有给我蛋，我测试不了"）：
         伴生体 / 强化 / 经验这几条线都要靠道具才测得了，一键补齐。 */
      U.btnRow([
        { label: '🥚 兽魂石 ×200', style: 'ghost', id: 'gm_eggs' },
        { label: '🧱 各档材料 ×200', style: 'ghost', id: 'gm_mats' },
        { label: '📘 各档经验 ×50', style: 'ghost', id: 'gm_exps' },
      ]);
      U.space(CV.SP[1]);
      /* V1.0.1（父亲大人："GM 里加多一个全员满级的"）：
         等级满了技能还锁着照样测不了后期内容，所以等级 + 三条技能一起拉满。 */
      U.btnRow([{ label: '⬆ 全员满级（Lv.100 + 技能满）', style: 'primary', id: 'gm_max' }]);
    });
  });
  CV.on('gm_max', function () {
    const S = Core.S;
    const maxSkill = [35, 35, 30];                 // 三条技能各自的上限
    S.player.level = 100; S.player.exp = 0; S.player.skillLv = maxSkill.slice();
    Object.keys(S.chars).forEach(function (id) {
      S.chars[id].lv = 100; S.chars[id].exp = 0;
      S.chars[id].skillLv = maxSkill.slice();
    });
    Core.save();
    CV.toast('全员满级：主角 + ' + Object.keys(S.chars).length + ' 名伙伴');
    CV.render();
  });
  /* V9.6.77（父亲大人："GM 后门的货币都改成给我 9 亿，现在给的太少了"）：
     与网页版同一口径 —— 读 D.CURRENCIES，一次把每种货币（含转生点 ♾）拉满 9 亿。
     以前是四个按钮各发一种、还都没给转生点，测转生天赋得来回点。 */
  CV.on('gm_all', function () {
    (D.CURRENCIES || []).forEach(function (c) { Core.addCur(c.id, 900000000); });
    CV.toast('全部货币 +9 亿');
    CV.render();
  });
  /* 旧按钮名保留成别名：有人习惯点它们，删了会变成死键 */
  ['gm_points', 'gm_holy', 'gm_other', 'gm_story'].forEach(function (k) {
    CV.on(k, function () {
      (D.CURRENCIES || []).forEach(function (c) { Core.addCur(c.id, 900000000); });
      CV.toast('全部货币 +9 亿');
      CV.render();
    });
  });
  CV.on('gm_worlds', function () {
    /* 和网页版同一处自审：GM 的"全世界解锁"必须**绕过转生门**，
       否则 36 张图只开出 12 张，按键等于没反应。 */
    const S = Core.S;
    (D.WORLDS || []).forEach(function (w) {
      if (!S.worlds[w.id]) S.worlds[w.id] = { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
      S.worlds[w.id].unlocked = true;
    });
    Core.refreshUnlocks && Core.refreshUnlocks();
    Core.save(); CV.toast('已解锁全部 ' + (D.WORLDS || []).length + ' 个世界'); CV.render();
  });
  CV.on('gm_tk', function () {
    Core.addItem('ticket_normal', 100); Core.addItem('ticket_adv', 100);
    CV.toast('招募券 +100'); CV.render();
  });
  CV.on('gm_unlock', function () {
    D.UNLOCKS.forEach(function (u) { Core.S.unlocks[u.id] = true; });
    Core.save(); CV.toast('功能全解锁'); CV.render();
  });

  /* ---------- 挂机分工 ---------- */
  let leaderLine = null;
  CV.register('idlelines', function () {
    const lines = Core.idleLines();
    const bench = Object.keys(Core.S.chars).filter((id) => Core.S.party.indexOf(id) < 0);
    U.begin(); head('挂机分工');
    U.hint('4 条产线各派 1 名领队：领队战力越高，这条线产出越高（最高 +150%）。上阵主力不能派去挂机，「板凳上的伙伴」在这里发挥作用；没派领队的产线不产出。', 0);
    /* V9.6.7（父亲大人："里面的界面现在也是乱的"）：原来四条产线挤在一张卡里、
       右侧小字跟按钮叠着。网页版 idleLinesModal 是**一条产线一张卡**：
         标题「图标 名字」+ 右侧产出小字 → 说明行 → 有人：头像 + 名字/属性行 + 「撤下」按钮
                                                   → 没人：整行「＋ 派一名领队」按钮（虚线边框）
       照这个结构重排。 */
    lines.forEach(function (l) {
      const led = l.leaderId;
      U.space(CV.SP[2]);
      const top = U.y;
      /* 用 dry 两趟量高度：卡片先用虚线框在 dry 趟里不画，这里直接手写结构 */
      const pad = CV.SP[2];
      U.inCard = true; U.dry = true; U.y = top + pad;
      U.h3(l.line.ico + ' ' + l.line.name, l.per, { color: led ? CV.C.gold : CV.C.dim, subColor: led ? CV.C.gold : CV.C.dim });
      /* V9.6.7（父亲大人）：卡上不写领队名字、也不写具体加成 —— 那两样点进「派遣领队」里看。 */
      U.hint(l.line.desc || '', 0);
      U.space(CV.SP[1]);
      if (led) U.space(34 * CV.SCALE); else U.space(U.BTN_SM * CV.SCALE);
      const innerH = U.y - top - pad;
      U.dry = false;
      const h = innerH + pad * 2;
      /* V9.6.7（父亲大人："没激活就灰色，激活就高亮" —— 和网页版同一套口径）：
         没派领队 = 没激活 → 边框虚线、标题/产出压灰；派了领队 = 激活 → 边框与文字一律金色。 */
      if (h > 4) {
        if (led) {
          CV.round(U.pad(), top, U.cw(), h, CV.RADIUS, CV.C.panel, CV.a(CV.C.gold, .4));
        } else {
          CV.round(U.pad(), top, U.cw(), h, CV.RADIUS, CV.C.panel, null);
          CV.ctx.save();
          CV.ctx.setLineDash([5, 4]); CV.ctx.lineWidth = 1;
          CV.round(U.pad(), top, U.cw(), h, CV.RADIUS, null, CV.C.line);
          CV.ctx.restore();
        }
      }
      U.y = top + pad;
      U.h3(l.line.ico + ' ' + l.line.name, l.per, { color: led ? CV.C.gold : CV.C.dim, subColor: led ? CV.C.gold : CV.C.dim });
      U.hint(l.line.desc || '', 0);
      U.space(CV.SP[1]);
      if (led) {
        U.btnRow([{ label: '查看领队 / 换人', style: 'ghost', id: 'pickleader:' + l.line.id }]);
      } else {
        const no = !bench.length;
        U.btnRow([{ label: no ? '没有可派的伙伴（先去招募）' : '＋ 派一名领队', style: 'ghost', id: no ? '' : 'pickleader:' + l.line.id, dis: no }]);
      }
      U.inCard = false;
      U.y = top + h + CV.SP[2];
    });
    U.hint('可派伙伴：' + bench.length + ' 名（未上阵的伙伴）。产出的收益和挂机收益一起，在首页「收取奖励」里结算。', 4 * CV.SCALE);
  });
  CV.on('idleclear:*', function (id) {
    const r = Core.setIdleLeader(id, null);
    CV.toast(r.msg || '已撤下领队');
    CV.render();
  });
  CV.register('pickleader', function () {
    const S = Core.S;
    const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;   // 稀有度色（和执灯者同一张表）
    const line = (D.IDLE_LINES || []).find((l) => l.id === leaderLine) || {};
    /* V9.6.101（换档审计抓到的）：`line` 可能找不到 —— leaderLine 是模块级变量，
       读存档槽 / 导入存档 / 删档之后它可能还停在上一次的产线上，
       而 `line.attrName` 没有保护 → **整页抛错**（Cannot read properties of undefined）。
       这类"参数过期"的页一律优雅退场，别把人崩在空白页上。 */
    if (!line.id) {
      U.begin(); head('派遣领队');
      U.hint('这条产线不存在（可能刚换过存档）—— 回上一页重新进一次就好。', 0);
      return;
    }
    const cur = (S.idle.lines || {})[leaderLine];
    const row = (Core.idleLines() || []).find((x) => x.line.id === leaderLine) || {};
    U.begin(); head('派遣领队');
    U.hint('选一名伙伴派往「' + ((line || {}).name || '') + '」', 0);
    U.space(CV.SP[1]);
    /* V9.6.7（父亲大人）：领队是谁、加多少，都在**这一层**看 —— 上面那张卡就不写了。
       所以这里先把自己当前的领队摆出来（含撤下），下面才是备选名单。 */
    if (cur) {
      U.card(function () {
        const ah = 40 * CV.SCALE, bh = U.BTN_SM * CV.SCALE, bw = 62 * CV.SCALE;
        U.h3('当前领队', '加成 +' + Math.round((row.bonus || 0) * 100) + '%', { color: CV.C.gold, subColor: CV.C.gold });
        const top = U.y;
        CV.round(U.ix(), top, ah, ah, CV.PILL,  CV.C.panel2, CV.C.line);
        CV.text(CV.fit(Core.charName(cur), ah - 6, CV.FS.sm), U.ix() + ah / 2, top + ah / 2, { size: CV.FS.sm, align: 'center', bold: true });
        const tx = U.ix() + ah + 8 * CV.SCALE;
        CV.text(CV.fit(Core.charName(cur), U.iw() - ah - bw - 16 * CV.SCALE, CV.FS.f1, true), tx, top + ah / 2 - 8 * CV.SCALE, { size: CV.FS.f1, bold: true });
        CV.text(CV.fit('Lv.' + (S.chars[cur] || {}).lv + ' · ' + (line.attrName || '') + ' ' + (row.attrValue || 0) + ' · 战力 ' + fmt(Core.power(cur)),
          U.iw() - ah - bw - 16 * CV.SCALE, CV.FS.sm), tx, top + ah / 2 + 8 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        U.btn(U.ix() + U.iw() - bw, top + (ah - bh) / 2, bw, bh, '撤下', 'ghost', 'idleclear:' + leaderLine);
        U.y = top + ah;
      });
    }
    /* V9.6.131（父亲大人三条）：
       ① 候选名单**按这条产线看的那项属性**从高到低排（派谁划算一眼看出，不用自己比）；
       ② 每行**显示稀有度**（原来只有 Lv/属性/战力，看不出品质）；
       ③ **已经在别的产线当领队的人要标出来**（否则会把人从别的线上挖走还不知道）。 */
    const attrOf = (id) => Math.round((((Core.effectiveStats(id) || {}).attrs || {})[line.attr] || 0));
    const leaderOfLine = (id) => {                    // 这个人现在在几条产线上当领队
      const out = [];
      D.IDLE_LINES.forEach(function (l) { if ((S.idle.lines || {})[l.id] === id) out.push(l.name); });
      return out;
    };
    const own = Object.keys(S.chars).filter((id) => S.party.indexOf(id) < 0)
      .sort(function (a, b) { return attrOf(b) - attrOf(a) || Core.power(b) - Core.power(a); });
    U.card(function () {
      U.h3('可选伙伴', own.length + ' 名 · 按' + (line.attrName || '属性') + '排序');
      if (!own.length) { U.hint('没有可派的伙伴（先去招募）', 4 * CV.SCALE); return; }
      U.space(CV.SP[1]);
      own.forEach(function (id) {
        const ch = D.charById[id] || {}, c = S.chars[id];
        const top = U.y, h = 56 * CV.SCALE;
        const elsewhere = leaderOfLine(id).filter(function (n) { return n !== line.name; });
        CV.text(Core.charName(id), U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        /* 稀有度角标（跟着品质色） */
        const rW = CV.measure(ch.rarity || '', CV.FS.xs) + 12 * CV.SCALE;
        CV.round(U.ix() + CV.measure(Core.charName(id), CV.FS.lg) + 8 * CV.SCALE, top + 8 * CV.SCALE, rW, 16 * CV.SCALE, CV.RADIUS_SM,
          null, rarColor(ch.rarity || 'N'));
        CV.text(ch.rarity || '', U.ix() + CV.measure(Core.charName(id), CV.FS.lg) + 8 * CV.SCALE + rW / 2, top + 16 * CV.SCALE,
          { size: CV.FS.xs, color: rarColor(ch.rarity || 'N'), align: 'center' });
        if (elsewhere.length) {
          const t = '已在「' + elsewhere[0] + '」任领队';
          CV.text(CV.fit(t, U.iw() * 0.42, CV.FS.xs), U.ix() + U.iw(), top + 16 * CV.SCALE,
            { size: CV.FS.xs, color: CV.C.accent, align: 'right' });
        }
        CV.text('Lv.' + c.lv + ' · ' + (line.attrName || '') + ' ' + attrOf(id) + ' · 战力 ' + fmt(Core.power(id)),
          U.ix(), top + 38 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        CV.hit('setleader:' + id, U.ix(), top, U.iw(), h);
        U.y = top + h;
      });
    });
  });
  CV.on('pickleader:*', function (lineId) { leaderLine = lineId; CV.push('pickleader'); });
  CV.on('setleader:*', function (id) {
    const r = Core.setIdleLeader(leaderLine, id);
    CV.toast(r.msg || '已派领队');
    CV.pop();
    CV.render();
  });

  /* ---------- 深井 ---------- */
  CV.register('corridor', function () {
    const S = Core.S;
    const floor = S.corridor.floor;
    const e = D.corridorEnemy(floor);
    const rw = D.corridorReward(floor);
    U.begin();
    U.btn(U.pad(), U.y, CV.measure('‹ 返回', CV.FS.md) + 26 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹ 返回', 'ghost', 'page_back');
    U.y += U.BTN_SM * CV.SCALE + CV.SP[1];
    /* 头部：深井 + 大层数 + 历史最高（网页版 .corridor-hero） */
    U.card(function () {
      const top = U.y;
      CV.text('深井', CV.W / 2, top + 14 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
      CV.text(String(floor), CV.W / 2, top + 52 * CV.SCALE, { size: CV.DISP.d4 * CV.SCALE, bold: true, align: 'center', color: CV.C.gold });
      U.y = top + 100 * CV.SCALE;
    });
    U.card(function () {
      U.h3('♜ 深井印记', Core.corridorMarks() + '/' + D.CORRIDOR_MARK_CAP + ' 枚');
      U.note('当前深井内加成：+' + (Core.corridorMarkBonus() * 100).toFixed(1) + '%', 2 * CV.SCALE);
    });
    U.card(function () {
      U.h3('本层守卫');
      U.kv(e.name, e.isBoss ? '🔱 Boss' : e.isElite ? '精英' : '普通');
      U.kv('HP', fmt(e.hp));
      U.kv('攻击', fmt(e.atk));
      U.kv('防御', fmt(e.def));
      U.space(CV.SP[1]);
      // V9.6.134：货币 8 → 4（故事点并入点数、深井徽记与血统结晶并入异界结晶）
      U.kv('通关奖励', '◉ ' + fmt(rw.points) + ' · ◆ ' + rw.otherworld, CV.C.gold);
      /* V1.1.4（A12-F · 深井每 10 层里程碑 2 颗新料）：这一层给不给料，**上一屏就要看得见**——
         不然玩家打完才发现背包里多了个不认识的图标（《收口2》§3.1 的"深井每 10 层 2 颗"）。 */
      if (rw.mat && rw.mat.length) {
        U.kv('里程碑额外', rw.mat.map(m => ((D.ITEMS[m.id] || {}).name || m.id) + '×' + m.n).join(' · '), CV.C.gain);
      }
      U.space(CV.SP[1]);
      U.btnRow([{ label: '⚔️ 挑战本层', style: 'primary', id: 'corridor_fight' }]);
    });
    U.btnRow([{ label: '🏪 深井商店（◆ ' + fmt(S.cur.otherworld || 0) + '）', style: 'ghost', id: 'corridor_shop' }]);
  });
  CV.on('corridor_fight', function () {
    /* V9.6.128（父亲大人："深井的自动下一关倒数和点击都无效，点完提示战斗进行中"）：
       结算页上点"继续第 N 层"时，上一场的 busy 闸门还立着 → BattleUI.run 被自己的防重入挡掉。
       副本那两颗（dun_again / dun_next）一直有 `BattleUI.clear()`，深井漏了 —— 补上。 */
    if (G.BattleUI && G.BattleUI.clear) G.BattleUI.clear();
    const S = Core.S;
    const floor = S.corridor.floor;
    const spec = D.corridorEnemy(floor);
    const allies = G.BattleUI.buildAllies(null, null, { mult: 1 + Core.corridorMarkBonus() });
    if (!allies.length) { CV.toast('没有可出战的成员'); return; }
    const enemies = [spec];
    if (spec.isBoss) enemies.push({ name: '深井之影', hp: Math.round(spec.hp * 0.3), atk: Math.round(spec.atk * 0.5), def: Math.round(spec.def * 0.5), spd: 70, faction: null, eva: 0.05 });
    G.BattleUI.run({
      title: '深井 · 第 ' + floor + ' 层',
      allies: allies, enemies: enemies, worldId: null,
      maxRounds: spec.isBoss ? 50 : 30,
      onQuit: function () { CV.reset('corridor'); },
      onClose: function () { G.BattleUI.clear && G.BattleUI.clear(); CV.reset('corridor'); },   // V9.6.124：收下奖励后回深井
      onEnd: function (win, res) {
        if (!win) {
          return {
            title: '止步于第 ' + floor + ' 层', sub: '',
            /* V9.6.128：只留"再挑一层"这颗（它做的事和底部那颗不同）；「返回深井」与底部
               「收下奖励并返回」是同一件事 → 去掉重复的。 */
            rewards: [], acts: [{ label: '↻ 再挑第 ' + floor + ' 层', style: 'primary', id: 'corridor_fight' }],
          };
        }
        const rw = D.corridorReward(floor);
        Core.addCur('points', rw.points); Core.addCur('otherworld', rw.otherworld || 0);
        /* V1.1.4（A12-F）：深井每 10 层里程碑 2 颗（《收口2》§3.1）——
           清单由 D.corridorReward(floor).mat 一处给出（含 2:1 分料与每 20 层的中品材料包），
           这里只负责入库 + 把它写进结算页（"什么时候给了什么"要当场说清）。 */
        const matGot = [];
        (rw.mat || []).forEach(function (m) {
          const nm = ((D.ITEMS[m.id] || {}).name || m.id) + '×' + m.n;
          if (Core.addItem(m.id, m.n)) matGot.push(nm);
          else { Core.stashItem(m.id, m.n); matGot.push(nm + '（背包满，已存待领箱）'); }
        });
        const gotMark = floor % D.CORRIDOR_MARK_STEP === 0;
        S.corridor.best = Math.max(S.corridor.best, floor);
        S.corridor.floor = floor + 1;
        Core.save();
        const rewards = ['◉+' + fmt(rw.points), '◆+' + rw.otherworld].concat(matGot)
          .concat(gotMark ? ['♜ 获得深井印记（' + Core.corridorMarks() + ' 枚 · 深井内 +' + Math.round(Core.corridorMarkBonus() * 100) + '%）'] : []);
        return {
          title: '第 ' + floor + ' 层通过', sub: '', rewards: rewards,
          /* V9.6.128：同上 —— 「继续第 N 层」保留，「返回深井」交给底部那颗，别挂两颗一样的 */
          acts: [{ label: '› 继续第 ' + S.corridor.floor + ' 层', style: 'primary', id: 'corridor_fight' }],
        };
      },
    });
  });
  CV.on('corridor_back', function () { G.BattleUI.clear && G.BattleUI.clear(); CV.reset('corridor'); });
  CV.on('corridor_shop', function () {
    if (G.setShopTab) G.setShopTab('corridor');
    CV.push('shop');
  });
})();
