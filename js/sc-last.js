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
  const fmt = G.fmt || ((n) => String(n));
  const dur = (sec) => (G.formatDuration ? G.formatDuration(sec) : (sec + '秒'));
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
    U.hint('血清是永久强化剂：喂给某名伙伴后永久加属性，每人每种有上限。血统血清只有对应血统能用——先觉醒血统，再决定喂给谁。', 0);
    U.space(CV.SP[1]);
    D.SERUMS.forEach(function (s) {
      const itemId = D.SERUM_ITEM(s.id);
      const own = S.items[itemId] || 0;
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
        U.draw(function () {
          const cy = top + nameLh / 2;
          CV.text('💊 ' + s.name, U.ix(), cy, { size: nameSize });
          if (s.bloodline) {
            const w0 = CV.measure('💊 ' + s.name, nameSize);
            CV.text(s.bloodline + '专属', U.ix() + w0 + 4 * CV.SCALE, cy,
              { size: CV.FS.xs, color: CV.C.gold });
          }
        });
        U.y = top + nameLh + 4 * CV.SCALE;
        U.hint(String(((D.ITEMS[itemId] || {}).desc) || '').replace(/^【[^】]*】/, ''), 0, lw);
        U.hint('配方：' + matName + ' ×' + s.matN + ' + ◈ ' + fmt(s.points)
          + '　（现有 ' + matName + ' ' + haveMat + ' · ◈ ' + fmt(S.cur.points || 0) + '）', 4 * CV.SCALE, lw);
        const ownTop = U.y + 4 * CV.SCALE;
        U.draw(function () {
          CV.text('已有血清 ×' + own, U.ix(), ownTop + CV.FS.xs * 0.8,
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
        CV.text(CV.fit('剩余时间 ' + (x.expired ? '已结束' : dur(Math.ceil(x.leftMs / 1000)))
          + '　奖励 ' + Core.rewardTextOf(b.reward), textW, CV.FS.sm), U.ix(), top + 56 * CV.SCALE,
          { size: CV.FS.sm, color: CV.C.dim });
        const claimable = x.done && !x.claimed && !x.expired;
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          claimable ? '领取奖励' : (x.claimed ? '已领取' : '去完成'), claimable ? 'primary' : 'ghost',
          claimable ? 'bounty_claim:' + b.id : '');
        U.y = top + h;
      });
    });
    if (st.allOver) {
      U.btnRow([{ label: '开新一期悬赏', style: 'primary', id: 'bounty_renew' }]);
    }
  });
  CV.on('bounty_claim:*', function (id) {
    const r = Core.claimBounty(id);
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('bounty_renew', function () {
    const r = Core.renewBounties();
    CV.toast(r.msg || '已开新一期');
    CV.render();
  });

  /* ---------- 任务 / 成就（四个标签） ---------- */
  let taskTab = 'main';
  /* 「前往 ›」的落点（逐条照网页版 gotoQuest / gotoDaily 的映射） */
  function goQuest(qid) {
    /* 点「去完成」= 换一件事讲：先把当前这条和排队的都清掉，
       否则上一条（常常就是首页那条"主线每一步做完都能领奖励"）会接着冒出来。 */
    if (U.coachClearAll) U.coachClearAll();
    U.coachForce(2500);          // 主动求引导：这一步的说明这次一定再讲一遍（与网页版同步）
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
    const dest = (G.questTarget && G.questTarget(qid)) || null;
    /* 战斗类主线步（在「残域」里）：直达对应世界的关卡页，由 world 页的引导指到那一关 */
    const WORLD_STEPS = { q01b: 1, q02: 1, q05: 1, q10: 1, q12: 1, q14: 1, q15: 1 };
    if (WORLD_STEPS[qid] || dest === 'world') {
      CV.cur = 'dungeon'; CV.reset('dungeon'); CV.dispatch('w:' + worldOf); return;
    }
    if (dest) { CV.cur = 'home'; CV.jump(dest); return; }   // 直接跳过去，别在中间渲染首页（V9.6.102）
    /* 兜底：引导表里没写落点的，仍然送去残域（不该发生 —— 有 guide_audit 盯着） */
    CV.cur = 'dungeon'; CV.reset('dungeon'); CV.dispatch('w:' + worldOf);
  }
  /* 首页的「去完成」也要用它 —— 挂到 G 上共用（sc-home 比 sc-last 先加载，但按钮是点击时才跑，拿得到） */
  G.goQuest = goQuest;

  function goDaily(key) {
    U.coachForce(2500);
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
  /* 顶部四枚 .pill 标签（网页版 .pill-tabs > .pill） */
  function tabPills(tabs) {
    const gap = 6 * CV.SCALE, h = U.BTN_H * CV.SCALE, top = U.y;
    let x = U.ix();
    tabs.forEach(function (t) {
      const on = taskTab === t[0];
      const w = Math.max(72 * CV.SCALE, CV.measure(t[1], CV.FS.md) + 28 * CV.SCALE);
      CV.round(x, top, w, h, 999, on ? 'rgba(212,58,79,.13)' : CV.C.panel, on ? CV.C.accent : CV.C.line);
      CV.text(t[1], x + w / 2, top + h / 2, { size: CV.FS.md, align: 'center', color: on ? '#fff' : CV.C.dim });
      CV.hit('tasktab:' + t[0], x, top, w, h);
      x += w + gap;
    });
    U.y = top + h + CV.SP[2];
  }
  CV.register('tasks', function () {
    U.begin(); head('任务');
    const tabs = [['main', '📜 主线'], ['daily', '📋 日常'], ['weekly', '🗓 周常'], ['ach', '🏅 成就']];
    tabPills(tabs);
    if (taskTab === 'main') {
      const list = Core.mainQuestState();
      const curIdx = list.findIndex(function (x) { return !x.claimed; });
      U.card(function () {
        U.h3('主线进度', list.filter((x) => x.claimed).length + ' / ' + list.length + ' 步');
        list.forEach(function (x, i) {
          const isCur = i === curIdx && !x.claimed;
          coreRow({
            /* 网页版当前这一步带一枚金色「当前」小标 —— canvas 里用金色实心块 + 白字复刻 */
            t1: '第 ' + (i + 1) + '/' + list.length + ' 步 · ' + x.q.name,
            t2: x.q.desc + ' · 奖励 ' + Core.rewardTextOf(x.q.reward),
            dim: x.claimed,
            tag: isCur ? '当前' : null,
            btn: x.claimed ? ['已完成', 'ghost', '', true] : (x.done ? ['领取', 'primary', 'quest_claim:' + x.q.id] : ['前往 ›', 'ghost', 'quest_go:' + x.q.id]),
          });
        });
      });
    } else if (taskTab === 'daily') {
      const allDone = D.DAILY_TASKS.every((t) => ((Core.S.tasks.daily || {})[t.id] || 0) >= t.target);
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
        U.btnRow([{ label: got ? '已领取' : '领取', style: 'gold', id: (!got && allDone) ? 'all_daily' : '', dis: got || !allDone }]);
      });
    } else if (taskTab === 'weekly') {
      /* Core.weeklyState() 返回的是**数组**（[{t, prog, done, claimed}]），不是 {list}。 */
      const ws = Core.weeklyState() || [];
      const allDone = ws.every((x) => x.done);
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
        U.btnRow([{ label: got ? '已领取' : '领取', style: 'gold', id: (!got && allDone) ? 'all_weekly' : '', dis: got || !allDone }]);
      });
    } else {
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
    }
  });
  ['main', 'daily', 'weekly', 'ach'].forEach(function (k) {
    CV.on('tasktab:' + k, function () { taskTab = k; CV.render(); });
  });
  /* 首页「成就」那颗格子直接落到成就标签 */
  CV.on('open_ach', function () { taskTab = 'ach'; CV.push('tasks'); });
  CV.on('quest_claim:*', function (id) {
    const r = Core.claimQuest(id);
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  /* quest_go:* / godaily:* 的真处理在下面（goQuest / goDaily）——这里不再登记占位 toast，
     否则"前往 ›"点了只弹一句话，玩家还是得自己找路。 */
  CV.on('task_claim:*', function (id) {
    const r = Core.claimTask(id);
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('week_claim:*', function (id) {
    const r = Core.claimWeekly(id);
    CV.toast(r.msg || '已领取');
    CV.render();
  });
  CV.on('ach_claim:*', function (id) {
    const r = Core.claimAchievement(id);
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
    U.card(function () {
      U.h3('玩法说明');
      U.btnRow([{ label: '❓ 玩法指南', style: 'ghost', id: 'open_guide' }], undefined, U.BTN_SM);
    });
    U.card(function () {
      U.h3('战斗速度');
      U.btnRow([1, 2, 3].map(function (v) {
        return { label: v + '×', style: (set.speed || 1) === v ? 'primary' : 'ghost', id: 'speed_set:' + v };
      }), undefined, U.BTN_SM);
    });
    U.card(function () {
      U.h3('战斗与音效');
      [['autoBattle', '自动战斗（直接出结果）', '开启后进入战斗立即结算，不再逐帧播放，适合挂机刷本'],
        ['sfx', '音效', '点击 / 强化 / 开箱 / 战斗胜负的提示音，可随时关闭'],
        ['autoNext', '通关结算自动进下一关', '胜利结算 8 秒内没做选择，就自动接着打下一关；关掉之后结算页会一直等你点'],
      ].forEach(function (r) {
        const on = set[r[0]] !== false;
        setRow(r[1], r[2], on ? '已开启' : '已关闭', on ? 'primary' : 'ghost', 'toggle:' + r[0]);
      });
    });
    U.card(function () {
      U.h3('自动分解');
      [['autoSellN', '自动分解 N 装备', '掉到 N 品质直接换成 ◆ 异界结晶'],
        ['autoSellR', '自动分解 R 装备', '掉到 R 品质直接换成 ◆ 异界结晶']].forEach(function (r) {
        const on = !!set[r[0]];
        setRow(r[1], r[2], on ? '已开启' : '已关闭', on ? 'primary' : 'ghost', 'toggle:' + r[0]);
      });
    });
    U.card(function () {
      U.h3('存档与备份');
      U.hint('进度只存在这台设备里', 0);
      U.space(CV.SP[1]);
      U.btnRow([
        { label: '📤 导出存档', style: 'ghost', id: 'save_export' },
        { label: '📥 导入存档', style: 'ghost', id: 'save_import' },
      ], undefined, U.BTN_SM);
      U.hint('手动存档槽（三格）：', CV.SP[3]);
      U.space(CV.SP[1]);
      const info = Core.slotInfo();
      info.forEach(function (s) {
        /* slotInfo() 的字段是 { slot, exists, meta:{ level, floor, time } } —— 等级在 meta 里，
           原来读 s.level 恒为 undefined，三个槽全显示"Lv.0"。 */
        const m = s.meta || {};
        const bw = 62 * CV.SCALE, bh = U.BTN_SM * CV.SCALE, gap = 8 * CV.SCALE;
        const rowTop = U.y;
        const h = U.listRow({
          t1: '存档槽 ' + s.slot,
          t2: (s.exists && s.meta) ? ('Lv.' + (m.level || 0) + ' · 深井 ' + (m.floor || 0) + ' 层') : '空',
          rightW: bw * 2 + gap + 10 * CV.SCALE,
        });
        const by = rowTop + (h - bh) / 2;
        U.btn(U.ix() + U.iw() - bw * 2 - gap, by, bw, bh, '存入', 'ghost', 'slot_save:' + s.slot);
        U.btn(U.ix() + U.iw() - bw, by, bw, bh, '读取', 'ghost', s.exists ? 'slot_load:' + s.slot : '', !s.exists);
      });
    });
    U.card(function () {
      U.h3('主角列表');
      Core.protagonistList().forEach(function (p, i) {
        const bw = 62 * CV.SCALE, bh = U.BTN_SM * CV.SCALE;
        const rowTop = U.y;
        const h = U.listRow({
          t1: p.name + (p.current ? '（当前）' : ''),
          t2: 'Lv.' + p.level + ' · ' + (p.bloodline ? (p.bloodline + '血统 Lv.' + p.bloodlineLv) : '未觉醒血统'),
          rightW: p.current ? 0 : (bw + 10 * CV.SCALE),
        });
        if (!p.current) U.btn(U.ix() + U.iw() - bw, rowTop + (h - bh) / 2, bw, bh, '切换', 'ghost', 'switch_alt:' + p.altIndex);
      });
      U.hint('新建主角从 Lv.0 开始，可体验不同血统路线；世界进度、货币、队伍不受影响', CV.SP[1]);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '➕ 新建主角', style: 'ghost', id: 'new_protag' }], undefined, U.BTN_SM);
    });
    U.card(function () {
      /* V9.6.36：重跑新手引导 —— 清掉"这一课看过"的记录，下次进对应页面会重新逐项讲一遍。
         父亲大人 8 问里第 8 条：只在设置里放这一个入口。 */
      U.h3('新手引导');
      U.hint('已经把引导跳过的部分，可以在这里重新跑一遍 —— 进入对应页面时会重新逐项讲解。', 2 * CV.SCALE);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '重跑新手引导', style: 'ghost', id: 'reset_coach' }]);
    });
    U.card(function () {
      U.h3('危险区');
      U.btnRow([{ label: '删除当前进度，重新开始', style: 'ghost', id: 'wipe_save' }], undefined, U.BTN_SM);
    });
    U.space(CV.SP[2]);
    U.draw(function () {
      CV.text('残域 V' + (G.GAME_VER || ''), CV.W / 2, U.y + 8 * CV.SCALE,
        { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
    });
    /* 版本号连点 7 下进调试面板（和网页版同一个暗门，父亲大人要的"GM 后门"） */
    CV.hit('gm_tap', CV.W / 2 - 70 * CV.SCALE, U.y, 140 * CV.SCALE, 18 * CV.SCALE);
    U.space(18 * CV.SCALE);
  }
  CV.register('settings', settingsPage);
  CV.on('toggle:*', function (k) {
    const set = Core.S.settings;
    set[k] = !(set[k] !== false);
    Core.save();
    CV.toast(({ autoBattle: '自动战斗', sfx: '音效', autoNext: '结算自动进下一关', autoSellN: '自动分解 N', autoSellR: '自动分解 R' }[k] || k) + '：' + (set[k] === false || set[k] === true && k.indexOf('auto') === 0 && k !== 'autoNext' ? (set[k] ? '已开启' : '已关闭') : (set[k] ? '已开启' : '已关闭')));
    CV.render();
  });
  CV.on('speed_set:*', function (v) {
    Core.S.settings.speed = +v; Core.save();
    CV.toast('战斗速度 ' + v + '×');
    CV.render();
  });
  /* ---------- 存档导出 / 导入 ----------
     网页版是弹一个文本框让你全选复制 / 粘贴；画布里没有输入框也没有"全选"，
     小游戏就用**剪贴板**当那个文本框 —— 语义一样（一段可搬走的存档文本），
     而且是这台设备上唯一能跨设备搬档的路子。 */
  CV.on('save_export', function () {
    const json = Core.exportSave();
    if (!(G.wx && G.wx.setClipboardData)) { CV.toast('这台设备不支持剪贴板'); return; }
    try {
      G.wx.setClipboardData({
        data: json,
        success: function () { CV.toast('存档已复制到剪贴板（' + json.length + ' 字符），发给别的设备粘贴导入即可', 3200); },
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
          if (txt.charAt(0) !== '{') { CV.toast('剪贴板里不是存档内容（要以 { 开头）'); return; }
          U.confirm('导入存档', '剪贴板里这段存档会**覆盖当前进度**（共 ' + txt.length + ' 字符），确定吗？', function () {
            const r = Core.importSave(txt);
            CV.toast(r.ok ? '存档已导入' : (r.msg || '导入失败'));
            if (r.ok) CV.reset('home'); else CV.render();
          });
        },
        fail: function () { CV.toast('读取剪贴板失败'); },
      });
    } catch (e) { CV.toast('读取剪贴板失败'); }
  });
  [1, 2, 3].forEach(function (n) {
    CV.on('slot_save:' + n, function () {
      /* V9.6.90：网页版这里会看返回值 ——「存不进去」必须说出来（配额满 / 隐私模式），
         原来无条件报"已存入"，玩家以为存上了，其实一个字都没落盘。 */
      const ok = Core.saveSlot(n);
      CV.toast(ok ? '已存入存档槽 ' + n : '保存失败（存储空间不足？）');
      CV.render();
    });
    CV.on('slot_load:' + n, function () {
      U.confirm('读取存档', '读取存档槽 ' + n + ' 会覆盖当前进度，确定吗？', function () {
        const ok = Core.loadSlot(n);
        CV.toast(ok ? '已读取存档槽 ' + n : '这个槽是空的');
        if (ok) CV.reset('home'); else CV.render();
      });
    });
  });
  /* 主角列表三个动作（照网页版 settingsModal 的 data-switchprotag / data-newprotag / data-reset） */
  CV.on('switch_alt:*', function (i) {
    const r = Core.switchProtagonist(+i);
    CV.toast(r.msg || '已切换主角');
    CV.render();
  });
  CV.on('new_protag', function () {
    if (!(G.wx && G.wx.showKeyboard)) { CV.toast('这台设备不支持键盘输入'); return; }
    try {
      if (G.wx.offKeyboardConfirm) G.wx.offKeyboardConfirm();
      G.wx.onKeyboardConfirm(function (res) {
        const nm = String((res && res.value) || '').trim();
        if (!nm) { CV.toast('请输入名字'); return; }   // V9.6.90：与网页版同一句
        const r = Core.createProtagonist(nm);
        CV.toast(r.msg || (r.ok ? '已创建' : '创建失败'));
        CV.render();
      });
      G.wx.showKeyboard({ defaultValue: '', maxLength: 12, multiple: false, confirmType: 'done', fail: function () { CV.toast('键盘没打开，再点一次'); } });
    } catch (e) { CV.toast('键盘没打开，再点一次'); }
  });
  CV.on('reset_coach', function () {
    Core.S.coachSeen = {};
    Core.save();
    /* V9.6.66（与网页版同步）：点完直接**把人带回首页并把开场引导接上**，
       不用再让玩家自己摸回首页才看见效果（网页版也是这个行为）。 */
    CV.cur = 'home';
    CV.reset('home');
    CV.toast('新手引导已重置 —— 从首页重新开始讲');
  });
  CV.on('wipe_save', function () {
    U.confirm('删除当前进度', '会清掉这台设备上的全部进度，重新从开局契约开始。确定吗？', function () {
      Core.wipeSave();
      /* V9.6.100：删档 = 内存也回到全新档，所以这里必须补一次 newGame() ——
         defaultState() 是"零资源"的空壳（点数 0），newGame() 才会发开局资源、
         并**恢复存盘开关**（wipeSave 会把它关上，防旧档被写回）。 */
      Core.newGame();
      Core.ensureDaily && Core.ensureDaily();
      CV.reset('welcome');
    });
  });

  /* ---------- GM 调试页（V9.6.12，父亲大人："小程序的 GM 后门先给我开开"）----------
     小游戏原来**没有** GM 面板，导致很多界面（没解锁的 / 需要资源的）根本进不去。
     这里补一个：设置与存档 → 连点版本号 7 次进入。能 ① 直接跳任意页面 ② 一键发资源。 */
  let gmTaps = 0, gmTimer = null;
  CV.on('gm_tap', function () {
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
    });
    U.card(function () {
      U.h3('跳转到任意页面', Object.keys(CV.panels).length + ' 页');
      /* 每页一颗小按钮。CV.panels 里注册过的都能进，包括平时解锁不了的那些。 */
      const keys = Object.keys(CV.panels).sort();
      const cols = 3, gap = 8 * CV.SCALE;
      const w = (U.iw() - gap * (cols - 1)) / cols, h = 32 * CV.SCALE;
      const y0 = U.y;
      keys.forEach(function (k, i) {
        const x = U.ix() + (i % cols) * (w + gap);
        const y = y0 + Math.floor(i / cols) * (h + gap);
        U.btn(x, y, w, h, k, 'ghost', 'gm_go:' + k);
      });
      U.y = y0 + Math.ceil(keys.length / cols) * (h + gap);
    });
    /* V9.6.68（资料 §5「引导每一步都要能测」）：本地引导漏斗 ——
       和网页版同一套数据（S.coachStats），按"被跳过率"排序，越高越该改。 */
    U.card(function () {
      const st = S.coachStats || {};
      const keys = Object.keys(st);
      U.h3('引导漏斗', '本地统计 · ' + keys.length + ' 步');
      if (!keys.length) {
        U.hint('还没有数据 —— 跑一遍新手引导就会出现（每步记：看过 / 点过 / 跳过 / 停留）。', 3 * CV.SCALE);
        return;
      }
      const rows = keys.map(function (k) {
        const s = st[k];
        const total = (s.tap || 0) + (s.skip || 0);
        return { k: k, s: s, total: total, rate: total ? Math.round((s.skip || 0) / total * 100) : 0,
          avg: s.msN ? Math.round(s.ms / s.msN / 100) / 10 : 0 };
      }).sort(function (a, b) { return b.rate - a.rate || b.total - a.total; });
      U.hint('按被跳过率排序 —— 越高＝这一步越没人看，优先改它。', 3 * CV.SCALE);
      rows.slice(0, 14).forEach(function (r) {
        U.listRow({
          t1: r.k,
          t2: '看过 ' + (r.s.view || 0) + ' · 点过 ' + (r.s.tap || 0) + ' · 跳过 ' + (r.s.skip || 0)
            + (r.s.miss ? (' · 没指到 ' + r.s.miss) : '') + ' · 平均 ' + r.avg + 's',
          rightText: r.rate + '%',
        });
      });
      if (rows.length > 14) U.hint('（只列前 14 条）', 3 * CV.SCALE);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '清空漏斗统计', style: 'ghost', id: 'gm_funnel_reset' }], undefined, U.BTN_SM);
    });
    U.hint('当前：' + CV.top().name + ' · 存档 v' + (S.v || '?') + ' · 点页面名直接跳过去', 4 * CV.SCALE);
  });
  CV.on('gm_go:*', function (k) { CV.reset(k); });
  CV.on('gm_funnel_reset', function () { Core.S.coachStats = {}; Core.save(); CV.toast('引导漏斗统计已清空'); CV.render(); });
  /* V9.6.77（父亲大人："GM 后门的货币都改成给我 9 亿，现在给的太少了"）：
     与网页版同一口径 —— 读 D.CURRENCIES，一次把每种货币（含转生点 ♾、深井徽记 ♜）拉满 9 亿。
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
          CV.round(U.pad(), top, U.cw(), h, CV.RADIUS, CV.C.panel, 'rgba(230,182,76,.4)');
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
        CV.round(U.ix(), top, ah, ah, 999, CV.C.panel2, CV.C.line);
        CV.text(CV.fit(Core.charName(cur), ah - 6, CV.FS.sm), U.ix() + ah / 2, top + ah / 2, { size: CV.FS.sm, align: 'center', bold: true });
        const tx = U.ix() + ah + 8 * CV.SCALE;
        CV.text(CV.fit(Core.charName(cur), U.iw() - ah - bw - 16 * CV.SCALE, CV.FS.f1, true), tx, top + ah / 2 - 8 * CV.SCALE, { size: CV.FS.f1, bold: true });
        CV.text(CV.fit('Lv.' + (S.chars[cur] || {}).lv + ' · ' + (line.attrName || '') + ' ' + (row.attrValue || 0) + ' · 战力 ' + fmt(Core.power(cur)),
          U.iw() - ah - bw - 16 * CV.SCALE, CV.FS.sm), tx, top + ah / 2 + 8 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        U.btn(U.ix() + U.iw() - bw, top + (ah - bh) / 2, bw, bh, '撤下', 'ghost', 'idleclear:' + leaderLine);
        U.y = top + ah;
      });
    }
    const own = Object.keys(S.chars).filter((id) => S.party.indexOf(id) < 0);
    U.card(function () {
      if (!own.length) { U.hint('没有可派的伙伴（先去招募）', 4 * CV.SCALE); return; }
      own.forEach(function (id) {
        const ch = D.charById[id] || {}, c = S.chars[id];
        const top = U.y, h = 52 * CV.SCALE;
        CV.text(Core.charName(id), U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        /* 和网页版同一行：Lv. · 这条线看的那项属性值 · 战力（派谁划算一眼能比） */
        CV.text('Lv.' + c.lv + ' · ' + (line.attrName || '') + ' '
          + Math.round((((Core.effectiveStats(id) || {}).attrs || {})[line.attr] || 0)) + ' · 战力 ' + fmt(Core.power(id)),
          U.ix(), top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
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
      CV.text(String(floor), CV.W / 2, top + 52 * CV.SCALE, { size: 40 * CV.SCALE, bold: true, align: 'center', color: CV.C.gold });
      U.y = top + 100 * CV.SCALE;
    });
    U.card(function () {
      U.h3('♜ 深井印记', Core.corridorMarks() + '/' + D.CORRIDOR_MARK_CAP + ' 枚');
      U.note('当前深井内加成：+' + (Core.corridorMarkBonus() * 100).toFixed(1) + '%', 2 * CV.SCALE);
    });
    U.card(function () {
      U.h3('本层守卫');
      U.kv(e.name, e.isBoss ? '👹 Boss' : e.isElite ? '精英' : '普通');
      U.kv('HP', fmt(e.hp));
      U.kv('攻击', fmt(e.atk));
      U.kv('防御', fmt(e.def));
      U.space(CV.SP[1]);
      U.kv('通关奖励', '◈ ' + fmt(rw.points) + ' · ❖ ' + rw.story + ' · ♜ ' + rw.corridor + (rw.bloodCrystal ? (' · ❥ ' + rw.bloodCrystal) : ''), CV.C.gold);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '⚔️ 挑战本层', style: 'primary', id: 'corridor_fight' }]);
    });
    U.btnRow([{ label: '🏪 深井商店（♜ ' + fmt(S.cur.corridor || 0) + '）', style: 'ghost', id: 'corridor_shop' }]);
  });
  CV.on('corridor_fight', function () {
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
      onEnd: function (win, res) {
        if (!win) {
          return {
            title: '止步于第 ' + floor + ' 层', sub: '',
            rewards: [], acts: [{ label: '↻ 再挑第 ' + floor + ' 层', style: 'primary', id: 'corridor_fight' }, { label: '返回深井', style: 'ghost', id: 'corridor_back' }],
          };
        }
        const rw = D.corridorReward(floor);
        Core.addCur('points', rw.points); Core.addCur('story', rw.story); Core.addCur('corridor', rw.corridor);
        if (rw.bloodCrystal) Core.addCur('bloodCrystal', rw.bloodCrystal);
        const gotMark = floor % D.CORRIDOR_MARK_STEP === 0;
        S.corridor.best = Math.max(S.corridor.best, floor);
        S.corridor.floor = floor + 1;
        Core.save();
        const rewards = ['◈+' + fmt(rw.points), '❖+' + rw.story, '♜+' + rw.corridor]
          .concat(rw.bloodCrystal ? ['❥+' + rw.bloodCrystal] : [])
          .concat(gotMark ? ['♜ 获得深井印记（' + Core.corridorMarks() + ' 枚 · 深井内 +' + Math.round(Core.corridorMarkBonus() * 100) + '%）'] : []);
        return {
          title: '第 ' + floor + ' 层通过', sub: '', rewards: rewards,
          acts: [{ label: '› 继续第 ' + S.corridor.floor + ' 层', style: 'primary', id: 'corridor_fight' }, { label: '返回深井', style: 'ghost', id: 'corridor_back' }],
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
