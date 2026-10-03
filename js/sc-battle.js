/* 战斗页（canvas）—— 照网页版 js/ui.js 的 startBattle / battle-overlay 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：头部（标题 / 速度 / 撤离）→ 敌人一行 → 我方前排 → 我方后排
   → 战斗日志 → 结算面板（奖励 chip + 下一关 / 返回）。
   逻辑一律走网页版的 Battle.run（同一份引擎、同一份帧序列），这里只负责"把帧画出来"。

   对外只暴露 BattleUI.start(配置)：副本、深井、斗法台都用它，别再各写一套。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  /* V1.1.x（2026-09-27 · 音频系统）：战斗音效的统一出口。
     在这一层接（**不在 js/battle.js 里接**）：battle.js 是纯逻辑帧序列，
     视图层才是"这一帧玩家看到/听到什么"的地方；G.AUD 不存在时静默跳过（尺子的假环境不加载音频）。 */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }

  /* ---------- 我方出战单位（照网页版 buildAllies 抄，含站位/阵容加成/伴生体） ---------- */
  function buildAllies(hpPctMap, extraBuffs, opts) {
    const S = Core.S;
    const mult = (opts && opts.mult) || 1;
    const fb = Core.factionBuffs(S.party);
    const buffAtk = (extraBuffs && extraBuffs.atkPct) || 0;
    const buffSpd = (extraBuffs && extraBuffs.spdPct) || 0;
    const allies = [];
    S.party.forEach((id, idx) => {
      if (!id) return;
      if (hpPctMap && hpPctMap[id] !== undefined && hpPctMap[id] <= 0.01) return;   // 这一波他已经倒下了
      const position = idx < 2 ? 'front' : 'back';
      if (id === '@player') {
        const pst = Core.effectivePlayerStats();
        const pFullHp = Math.round(pst.hp * (1 + fb.hpPct));
        const pHp = hpPctMap && hpPctMap['@player'] !== undefined ? Math.max(1, Math.round(pFullHp * hpPctMap['@player'])) : pFullHp;
        allies.push(Object.assign({}, pst, {
          name: Core.charName('@player'), kind: 'warrior', faction: null, position,
          skills: Core.protagonistSkills(), skillLv: S.player.skillLv || [0, 0, 0],
          atk: Math.round(pst.atk * (1 + fb.atkPct + buffAtk) * mult),
          def: Math.round(pst.def * mult),
          spd: Math.round(pst.spd * (1 + buffSpd) * mult),
          hp: Math.round(pHp * mult), maxHp: Math.round(pFullHp * mult),
          skillMult: (pst.skillMult || 1) + fb.skillPct,
          charId: '@player',
        }));
        return;
      }
      const base = D.charById[id];
      const eff = Core.effectiveStats(id);
      const fullHp = Math.round(eff.hp * (1 + fb.hpPct));
      const hp = hpPctMap && hpPctMap[id] !== undefined ? Math.max(1, Math.round(fullHp * hpPctMap[id])) : fullHp;
      allies.push(Object.assign({}, eff, {
        name: Core.charName(id), kind: base.kind, faction: base.faction, position,
        skills: base.skills, skillLv: S.chars[id].skillLv,
        atk: Math.round(eff.atk * (1 + fb.atkPct + buffAtk) * mult),
        def: Math.round(eff.def * mult),
        spd: Math.round(eff.spd * (1 + buffSpd) * mult),
        hp: Math.round(hp * mult), maxHp: Math.round(fullHp * mult),
        skillMult: eff.skillMult + fb.skillPct,
        charId: id,
      }));
    });
    const beastElem = Core.activeBeastElem();
    const bp = Core.beastPct();
    allies.forEach((a) => {
      a.beastElem = beastElem;
      if (bp.dmgReduce) a.dmgReduce = (a.dmgReduce || 0) + bp.dmgReduce;
    });
    return allies;
  }

  /* ---------- 进行中的战斗状态 ---------- */
  const B = {
    on: false, cfg: null, res: null, idx: 0, units: {}, log: [], floaters: [],
    speed: 1, timer: null, done: false, panel: null, energy: {}, tip: null,
    autoT: null, autoLeft: 0,
    pausedByAd: false,      // 看广告期间挂起（见 pauseForAd / resumeAfterAd）
    tipAt: 0,                    // 波次卡：起始时间（V9.6.123；V1.0.4 起动画帧由 tipLoop 驱动，句柄不再存这儿）
    /* V9.6.90：防重入闸门**单独一个字段**。以前是拿 `B.on && B.res` 凑的 ——
       看着能用，其实"波与波之间"正好也满足这两个条件，于是无缝交接那一瞬间
       下一波会被自己挡掉（副本第 5 关起多波，第 2 波直接打不开）。
       闸门现在只在这三处变：开打时立起 / 结算或撤离或离开战斗页时放下 /
       无缝交接给下一波之前先放下。 */
    busy: false,
  };
  /* V9.6.115（父亲大人）：结算自动进下一关的倒计时 8 秒 → **5 秒**（与网页版同一个值） */
  const AUTO_NEXT_SEC = 5;
  let uidSeq = 0;
  const STATUS_TEXT = { poison: '中毒', burn: '灼烧', bleed: '裂伤', stun: '眩晕', freeze: '冰冻', weak: '虚弱', sunder: '破防', fear: '恐惧', taunt: '嘲讽', regen: '再生' };

  function clearTimer() {
    if (B.timer) { clearTimeout(B.timer); B.timer = null; }
    if (B.autoT) { clearInterval(B.autoT); B.autoT = null; }
    /* V9.6.98（自审：定时器泄漏）：打击特效那个 55ms 的 interval（fxT）原来只有 finish()
       和"自己发现没有特效了"两条路会清 —— **撤离**那条路不清，于是离开战斗页之后
       它还会以 18fps 重画最多 0.9 秒（白耗电、还会重画一个新页面）。
       撤离=离场，就该立刻全清。
       V1.0.4 · S1：这一条现在由 rAF（或退回的 setTimeout）驱动，停止走 `fxStop()` ——
       两条路都要断（rAF 的句柄 / 兜底的 timer），**离场后一帧都不许再画**。 */
    fxStop();
    tipStop();                                              // V9.6.123：波次卡的动画帧，离场一起清
  }
  function pushLog(line) { B.log.push(line); if (B.log.length > 60) B.log.shift(); }
  function nameOf(uid) { const u = B.units[uid]; return u ? u.name : ''; }

  function start(cfg) {
    clearTimer();
    /* V9.6.124（父亲大人："斗法台战斗完点收下奖励并返回，会返回到残域那边去，跳转错误"）：
       真因 —— 结算面板底部那颗「收下奖励并返回」用的是 `battle_close`，
       而它的兜底**写死成 CV.reset('dungeon')**：副本传了 onClose 所以看不出问题，
       斗法台 / 深井没传 → 一律被送到残域。
       修法不是给每个入口补一句（那还会漏），而是**战斗页自己记住"从哪来"**：
       开打那一刻把页面栈与滚动位置存下来，配置没给回调时就还原回去。 */
    /* ================= 康康 2026-09-29 · 连打第二场会把"来路"记成战斗页自己 =================
       父亲大人：「世界关卡和深井还是打了一关后返回键就失效了，没打就可以正常返回」。
       真因：`B.back`（战斗页记的"从哪来"）是**每次开打那一刻**抓的当前页面栈；
       而「下一关 / 再挑一层 / 继续第 N 层」是在**战斗页自己身上**再开一场 ——
       那一帧栈里只有 `battle`（`start()` 里那句 `CV.reset('battle')` 把栈压成了一层），
       于是 `B.back` 被记成 `['battle']`；等这一场收工、回调把页面 `reset('world'/'corridor')` 之后，
       `backToSource` 那句"落点得在来路上"（`back.stack.some(l => l.name === landed)`）判不过
       ⇒ **不还原** ⇒ 回来那一页成了**根**，它的吸顶 ‹ 没有地方可 pop
       ⇒ 表现就是"打了一关返回键就废了"（只打第一场时 `B.back` 还是真的来路，所以"没打/打一关就回"看着正常）。
       修法（一处收口，不逐页打补丁）：**只在"不是从战斗页自己再开一场"时才重记来路** ——
       连打多场时始终沿用最初那次的页面栈与滚动位置（`B.back` 也只在从未记过时兜底）。
       做坏试验：把这一句改回无条件 `B.back = {...}` → `_probe_return_after2.js` 的
       ③ 深井那条会当场变回"栈 corridor（根）· 点了没动"。 */
    const onBattlePage = CV.stack.length === 1 && CV.stack[0] && CV.stack[0].name === 'battle';
    if (!onBattlePage || !B.back) B.back = { stack: CV.stack.slice(), scroll: CV.scroll || 0 };
    B.on = true; B.busy = true; B.cfg = cfg; B.done = false; B.panel = null; B.log = []; B.floaters = []; B.energy = {}; B.hitAt = {}; B.atkAt = {};
    B._bsBossHit = 0;                       // R1.6：残响的 first_hit 每场只算一次
    /* 2026-10-02（父亲大人：「现在副本战斗的背景也没改啊」）：
       战斗页是**整屏接管**（chromeless），之前我一刀把它排除在铺底之外了 ——
       于是别处是一张画、进战斗就变回纯黑。
       现在把"这一场打的是哪个世界"报给 cv.js（`CV.battleWorld`），
       由 `CV.veils.battle` 拉那个世界的**正式场景图**当背景（压暗 62%，战场照样读得清）。 */
    CV.battleWorld = (cfg && cfg.worldId) || '';
    /* V1.1.8（丙组 B9）：开打时的档位读**唯一口径** `Core.effSpeed()` ——
       免费只有 1×/2×；广告窗口内才是 5。老档里存的 3× 会在那里被回落成 2×。 */
    B.speed = Core.effSpeed ? Core.effSpeed() : ((Core.S.settings && Core.S.settings.speed) || 1);
    CV.battleSpeed = B.speed;
    B.title = cfg.title || '战斗';
    /* ================= F2-2（抢修单 0928R3）=================
     "每场 1 次"的旧写法是 `B.revived = false` —— 可**复活自己就是靠再调一次 `run()`**
     重开的，于是那一次 `start()` 把闸门又清成 false ⇒ 一场里能无限复活
     （按钮上明明写着"本场 1 次"，探针也复现了"连点两次都 granted"）。
     现在账本**记在"这一场"上**（`cfg.reviveState`）：
       · 副本：传的是它自己的 `run`（一趟副本＝一场，三波连着打完才算一场 ——
         与 `Core.battleSettle('计一场')` 同一口径），换一关新建 run 才归零；
       · 斗法台 / 深井：没给账本 → 就记在 cfg 自己身上（一次挑战＝一场）。
     ⚠️ 账本只由 `battleRevive()` 写、只由这里读，**`start()` 不再复位它**。 */
    B.revived = !!(cfg && (cfg.reviveState || cfg).revived);
    /* ================= R1.6 叙事轮（2026-10-02）· 战斗属于当前事件 =================
       父亲大人：「一进战斗，场景 / Boss / 剧情全部消失，只剩 HP 和按钮，于是玩家感觉剧情结束了」。
       两件事在这一行接上：
         · `BattleStory.begin()` —— 把"这一场打的是哪个世界"报给叙事层，
           之后每条残响都由**战斗里真实发生的事**触发（见 applyFrame 里那几处 trigger）；
         · `B.entrance` —— **Boss 出场序列**（2.4 秒：场景 → Boss → 台词 → 机制 → 开打）。
           §二十：只放一次（`BattleStory` 用 BATTLE_SEEN 闸门管），重刷直接开打。 */
    B.entrance = null;
    if (G.BattleStory) {
      const isBossFight = !!(cfg.enemies || []).some(function (e) { return e && e.isBoss; });
      G.BattleStory.begin({ worldId: cfg.worldId, isBoss: isBossFight });
      const ent = isBossFight ? G.BattleStory.entranceOf(cfg.worldId) : null;
      if (ent) {
        ent.until = Date.now() + (ent.ms || 2400);
        B.entrance = ent;
        /* 立绘**先请求再演**：这 2.4 秒里图能到就画出来，到不了就只演文字（绝不空框、绝不阻塞） */
        if (G.Story && G.Story.ensureBoss) G.Story.ensureBoss(cfg.worldId);
        if (G.BattleStory.markBattleSeen) G.BattleStory.markBattleSeen(cfg.worldId);
        ensureFx();                       // 借动效帧循环走这 2.4 秒
      }
    }
    CV.reset('battle', { title: B.title });
  }

  /* 装一场战斗的帧序列（**只装不打**）—— `fight()` 用它，尺子也用它：
     尺子要"逐帧手推"来断言"伤害飘字与音效同帧"，不能靠 setTimeout 的节奏跑完整场。 */
  function loadRes(res) {
    B.res = res; B.idx = 0; B.units = {};
    /* 这一场的临时容器：真流程里由 `start()` 清好；尺子手推时由这里兜底（`||` 只补缺、不清空，
       所以真流程的行为一点没变）。没有这几行，"装一场但不打"就会在 hitFx 上撞 undefined。 */
    B.log = B.log || []; B.floaters = B.floaters || []; B.energy = B.energy || {};
    B.hitAt = B.hitAt || {}; B.atkAt = B.atkAt || {};
    const startFrame = res.frames[0];
    /* ================= F6 #1（阻塞 · 来自 R6 #1）· 复活续战把单位规格丢光 =================
       病根在这里：原来 `B.units` 只装 `res.frames[0]` 里那份**界面用**的单位 ——
       而它来自 `battle.js` 的 `publicUnit()`，只有 9 个字段
       （uid/name/side/maxHp/hp/isBoss/position/kind/charId），**没有 atk/def/spd/skills/skillLv/crit/skillMult**。
       复活续战（`carryUnit`）从 `B.units` 搬"这一场的规格"时就只能搬出个空壳：
       atk=undefined → 伤害 `Math.max(1,Math.round(NaN))=NaN` → hp 变 NaN → `alive()` 判全员阵亡
       → **一回合瞬判胜负**（实测 `{"type":"damage","dmg":null}` ＋ `end win:true rounds:1`）。
       从"最后一波失败点"点一次复活 ＝ 花一次广告直接通关＋发奖。
       修法：**两份合起来用** —— 界面字段以开始帧为准（`hp`/`maxHp` 是这一场开局值，
       后面由帧逐条更新），**规格字段从 `res.units`（引擎那份全字段，battle.js 的 `all`）补齐**。
       ⚠️ 反过来（拿 `res.units` 当基准）不行：那是**打完那一刻**的状态，开场就会显示残血/阵亡。 */
    const spec = {};
    (res.units || []).forEach(function (u) { if (u && u.uid != null) spec[u.uid] = u; });
    /* 开局那一份全字段规格的**只读快照**：复活续战的兜底基准（见 carryUnit 的非数保护）。 */
    B.spec0 = spec;
    (startFrame.allies || []).concat(startFrame.enemies || []).forEach((u) => {
      B.units[u.uid] = Object.assign({}, spec[u.uid] || {}, u);
    });
    if (startFrame.note) pushLog('⚠ 世界机制 · ' + startFrame.note);
  }

  function fight(res) {
    loadRes(res);
    step();
  }
  /* 结算页那颗"自动下一关"的倒计时 —— **一处定义**（原来只有建它那一处，
     广告暂停之后要能把它接着跑起来，所以抽成函数；行为与原来逐字相同）。 */
  function startAutoNext() {
    if (B.autoT) clearInterval(B.autoT);
    B.autoT = null;
    if (!(B.autoLeft > 0 && B.autoIdx >= 0)) return;
    B.autoT = setInterval(function () {
      B.autoLeft--;
      if (B.autoLeft <= 0) {
        clearInterval(B.autoT); B.autoT = null;
        const a = B.panel && B.panel.acts[B.autoIdx];
        if (a) CV.dispatch(a.id);
        return;
      }
      CV.render();
    }, 1000);
  }
  /* ================= 康康 2026-09-29 · 看广告时**暂停这一场** =================
     父亲大人：「我发现看广告的时候游戏进程没有暂停，等广告结束后再结算是否观看完成然后再继续」。
     微信的激励视频是**盖在整个画面上的一层原生浮层**，游戏自己的 JS 计时器照跑 ——
     所以战斗会继续推帧、结算页的"自动下一关"倒计时会继续走、特效循环还在画。
     这里给战斗页出口两个口子（`BattleUI.pauseForAd / resumeAfterAd`），由广告底座在
     **真广告**开演前后调用（`js/wx-adapter.js` 的 `showRewarded` 一处收口）：
       · 暂停＝清掉推帧计时器（`B.timer`，含特效循环 `fxStop`）与自动倒计时（`B.autoT`），
         但**不动 `B.on` / `B.res`** —— 这是"暂停"，不是撤离，回来接着打；
       · 继续＝`step()` 接着推（只有还在打时才推：打完那一刻 `B.on` 已经是 false），
         自动倒计时按**剩下的秒数**接着走（`B.autoLeft` 原样保留）。
     做坏试验：把 wx-adapter 里那两句 `adPause(true/false)` 去掉 →
     `ad_audit` 的"看广告期间这一场真的停了 / 回来真的接着打"两条当场红。 */
  /* 一帧要等多久 —— **一处定义**（`step()` 与"广告回来接着排"共用，别两处各算一份） */
  function frameDelay(f) {
    const delay = (f && f.type === 'round') ? 260
      : (f && (f.type === 'skill' || f.type === 'phase' || f.type === 'revive' || f.type === 'summon')) ? 520 : 300;
    const stop = (f && f.type === 'damage' && f.crit) ? 90 : 0;      // hitstop（暴击多停 ~90ms）
    return Math.max(40, (delay + stop) / B.speed);
  }
  function pauseForAd() {
    if (!B.on || B.pausedByAd) return;
    B.pausedByAd = true;
    /* 记下"下一帧本来还要等多久"，回来照这个节奏续上（别用固定值 —— 会跟 step() 分叉） */
    B.adRearmMs = (B.res && B.res.frames[B.idx - 1]) ? frameDelay(B.res.frames[B.idx - 1]) : 300;
    clearTimer();
  }
  /* ⚠️ 恢复**只把下一帧重新排上，不推进一帧**。
     第一版写的是"直接 `step()` 推一帧"，结果把 ③ 那条"点复活不发任何资源"的尺子踩红了：
     复活那条路的 Promise 结算之后会**重开一场**，而我这一帧是多推的 ——
     它可能把旧那一场推到 `finish()` ⇒ 结算发奖 ⇒ 看着像"复活顺手发了资源"。
     续排不推进，才是"暂停/继续"的语义（回来时那一帧本来也还没到）。 */
  function resumeAfterAd() {
    if (!B.on || !B.pausedByAd) return;
    B.pausedByAd = false;
    startAutoNext();
    if (B.timer) clearTimeout(B.timer);
    B.timer = setTimeout(step, B.adRearmMs || 300);
    CV.render();
  }

  function step() {
    if (!B.on) return;
    /* R1.6 叙事轮：**Boss 出场序列没走完，战斗不推进** ——
       「玩家先看见它出现、听见它说什么，然后才开打」。2.4 秒到点自动放行，
       期间不登记热区、不挡顶栏（撤离照样点得动）。 */
    if (B.entrance && Date.now() < (B.entrance.until || 0)) {
      if (B.timer) clearTimeout(B.timer);
      B.timer = setTimeout(step, 80);
      return;
    }
    if (B.entrance) B.entrance = null;
    /* B9：广告窗口到期要**自动回落**（`effSpeed` 是唯一口径）—— 每帧问一次最省事，
       也顺手把"免费档"的选择变化吃进来（不会出现"一场里两个档"的鬼状态）。 */
    if (Core.effSpeed) { const s = Core.effSpeed(); if (s !== B.speed) { B.speed = s; CV.battleSpeed = s; } }
    const f = B.res.frames[B.idx++];
    if (!f || f.type === 'end') { finish(); return; }
    applyFrame(f);
    /* 等待时长 **一处定义**（`frameDelay`）—— 广告暂停回来也照它续排，两处不会分叉。
       V9.6.68（资料 §8「hitstop」）：暴击多停 ~90ms —— 打击感主要来自这一下"顿"。 */
    B.timer = setTimeout(step, frameDelay(f));
    CV.render();
  }

  /* ================= V1.0.4 · S1/S2（父亲大人 09-27：「运行时间长手机会发烫，卡顿…主要还是战斗的时候」）===
     V9.6.28 当初立这条动画帧时，全场只有一条 `setInterval(…, 55)`（≈18fps）**整页重画**。
     它有两个结构性毛病（`scripts/soak_audit.js` 量出来的：战斗每秒 476 次文字绘制 ＝ 灯阁的 7 倍）：
       ① **不是 rAF 驱动** ⇒ `wx.setPreferredFramesPerSecond`（战斗 60 / 挂机 30）**对它完全无效**，
          而且切后台它照样烧；
       ② 那一帧真正在动的只有**单位区 + 飘字**，可它每次都把日志折行 / 按钮 / 顶栏 / 整屏渐变重画一遍。
     现在：
       · 驱动换成 **rAF 递归**（没有 rAF 的环境——尺子 / 老基础库——退回 `setTimeout(…, 16)`），
         并且**把档位当硬上限**：`档位`（CAP.fps.cur，战斗 60 / 灯阁 30）与"动效本身值多少帧"
         取小。平台按档位节流 rAF 时，我们这一层跟着慢下来 —— 那条"60/30 真的落到功耗上"就是它。
       · 动效只值 **12fps**：飘字是慢位移（18fps → 12fps 肉眼无差别，省 1/3）。
       · 帧内只重画**战场那一片**（`CV.renderPatch` + `drawField`），日志 / 按钮 / 顶栏整段跳过。
     ⚠️ "没有动效就彻底停"这条规矩一个字没改：飘字 / 受击 / 出手（含震屏）全没了就停，
        停之前补一张整页（把最后一点残留擦干净）。
     ⚠️ 数值与节奏一个字没动：每回合的 delay、暴击顿帧（hitstop）、音效挂点全在 `step()`/`applyFrame` 里。 */
  const FX_FPS = 12;                       // 慢位移动效的目标帧率（原 55ms≈18fps）
  const FX = { paints: 0, patch: 0, full: 0 };   // 尺子读这里（不对玩家生效）
  /* 档位 = `wx.setPreferredFramesPerSecond` 那一路（唯一口径在 js/wx-cap.js 的 CAP.fps.cur）；
     CAP 不在（老尺子的假环境）就按"战斗 60"兜底，绝不让它变成 0 帧。 */
  function fxTier() {
    const cur = (G.CAP && G.CAP.fps && G.CAP.fps.cur) || 0;
    if (cur > 0) return cur;
    return (G.CAP && G.CAP.fpsWant) ? G.CAP.fpsWant() : 60;
  }
  /* 一个极小的"rAF 递归 + 档位当上限 + 没动效就自己停"的帧循环（动效帧与波次卡共用这一份，
     免得两处各写一套、漏一条腿就变成"某个场景还在烧"）。
       · 有 rAF 就用 rAF（平台按档位节流它，我们跟着慢 —— 这是"档位真落到功耗上"的那根线）；
       · 没有（尺子 / 老基础库）退回 `setTimeout(…, 16)`，限频仍由下面那道 gap 把关；
       · 每一格都问 `aliveFn()`：不活了就彻底停（`finalFn` 只给动效那条用：补一张整页收尾）；
       · `stop()` 两条腿都断（rAF 的 cancel ＋ 兜底 timer 的 clear）。 */
  function fpsLoop(targetFps, aliveFn, paintFn, finalFn) {
    /* `dead` 的意思只是"这一条链别再往下走"（离场 / 停表），**不是**把这个循环报废 ——
       下一场战斗调 `start()` 照样能重新点着（写成一次性的话，第一场之后就没动效了）。 */
    let handle = null, last = 0, dead = true;
    const loop = { driver: '', running: function () { return !!handle; } };
    const stop = function () {
      dead = true;
      if (!handle) return;
      try { if (handle.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle.raf); } catch (e) {}
      if (handle.timer) clearTimeout(handle.timer);
      handle = null;
    };
    const arm = function () {
      if (handle || dead) return;
      if (typeof requestAnimationFrame === 'function') { handle = { raf: requestAnimationFrame(step) }; loop.driver = 'raf'; }
      else { handle = { timer: setTimeout(step, 16) }; loop.driver = 'timer'; }
    };
    function step() {
      handle = null;
      if (dead) return;                       // 已 stop（离场 / 换场景）→ 一帧都不再画
      if (!aliveFn()) { if (finalFn) finalFn(); return; }
      const now = Date.now();
      const gap = 1000 / Math.max(1, Math.min(fxTier(), targetFps));
      if (now - last >= gap - 1) { last = now; paintFn(); }   // 没到下一格：只重排，不画
      arm();
    }
    loop.start = function () { dead = false; if (handle) return; last = 0; arm(); };
    loop.stop = stop;
    return loop;
  }
  /* "还有没有活着的动效"（原来那三条判据一字不动；震屏也算一条 —— 它在飞的时候也得有帧） */
  function fxAlive() {
    const now = Date.now();
    return (B.floaters || []).some(function (f) { return now - f.t < (f.ttl || D.BATTLE_GEOM.floatMs); })
      || Object.keys(B.hitAt || {}).some(function (k) { return now - B.hitAt[k] < 320; })
      || Object.keys(B.atkAt || {}).some(function (k) { return now - B.atkAt[k] < 220; })
      || !!B.entrance                       // R1.6：Boss 出场那 2.4 秒也得有帧（否则它僵住不淡出）
      || (B.shakeUntil || 0) > now;
  }
  /* 动效帧画哪儿：能局部就局部，不能就退回整页（**绝不半块半块地画**）：
       · B.field 不在（波次卡那一段不画战场）→ 整页；
       · 页面上有结算层 / 撤离确认框 / 已经不是战斗页 → 整页（那几层是模态，局部重画会把它擦掉）。
       · 这一页要是登记了整屏底图（`CV.veilPage`，目前只有主画面/选命格）或吸顶条
         （`CV.sticky`，背包那类页）→ 也整页 —— 那两样画在内容层之上/之下，局部重画会露馅。
     局部重画那一趟只碰战场那一片的像素，命中区（CV.hits）由整页帧登记、这里一个字不改。 */
  function fxPaint() {
    FX.paints++;
    const page = CV.top().name;
    const canPatch = !!(B.field && !B.tip && page === 'battle'
      && !CV.pageOverlay && !CV.sticky && !(CV.veils && CV.veils[page])
      && !(G.U && G.U.overlay));
    if (canPatch) {
      FX.patch++;
      if (CV.renderPatch(B.field.rect, function () { drawField(B.field); })) return;
    }
    FX.full++;
    CV.render();
  }
  /* 收尾那一帧：整页（顺带把最后一点飘字 / 红闪擦干净）—— 只在"没动效了"的那一刻来一次 */
  const fxLoop = fpsLoop(FX_FPS, fxAlive, fxPaint, function () { CV.render(); });
  /* V9.6.28（父亲大人："战斗没有攻击、掉血的动效"）：飘字 / 受击 / 出手一出现就点着这条循环 */
  function ensureFx() { fxLoop.start(); }
  function fxStop() { fxLoop.stop(); }

  /* 波次卡（「第 N 波」淡入停留淡出那 1.05 秒）的动画帧：同一个驱动器，30fps 上限。
     它不算"动效残留"—— 只要 `B.tip` 还在就继续画；tip 一清（下一波开打 / 离场）就停，
     停之前补一张整页，免得那张卡留在屏幕上。 */
  const tipLoop = fpsLoop(30, function () { return !!B.tip; }, function () { CV.render(); },
    function () { CV.render(); });
  function tipStop() { tipLoop.stop(); }
  /* V1.0.1（UI 设计师会诊）：异常状态 / Boss 二阶段这类"要看清一句话"的提示 0.9 秒读不完，
     允许传 ttl（网页版 js/ui.js 的 floater(..., ms) 是同一套口径，两边一起改）。 */
  function floater(uid, text, color, ttl, size) {
    const u = B.units[uid];
    if (!u) return;
    /* V1.0.1（开发自审会诊）：原来一律取 floatBase，于是**暴击在画布上不变大**，
       而网页版 `.floater.crit` 是 17 —— 两端差一档，而且表里的 floatCrit 根本没被读过。
       现在按类型传 size，与网页版同源。 */
    B.floaters.push({ uid, text, color: color || CV.C.gold, t: Date.now(),
      ttl: ttl || D.BATTLE_GEOM.floatMs, size: size || D.BATTLE_GEOM.floatBase });
    ensureFx();
  }
  /* 受击 / 出手：记一个时间戳，unitCard 按它算抖动与红闪 */
  function hitFx(uid) { if (uid) { B.hitAt[uid] = Date.now(); ensureFx(); } }
  function atkFx(uid) { if (uid) { B.atkAt[uid] = Date.now(); ensureFx(); } }

  /* ================= 2026-10-03（父亲大人：「战斗过程的残响窗口……不要了」）=================
     这里原来有**一整套战斗内残响**：`ECHO_MS` / `echoPull` / `echoTrigger` / `drawEcho`
     —— 由真实战斗事件（first_hit / 血量阈值 / Boss 开盾 / 阶段 / 召唤 / 世界机制改写…）触发，
     在战场上沿弹一张【残响】小卡，1.8 秒淡出，播过就把这一拍的 `mid` 记成已读。
     父亲大人不要这个窗口，所以**整段撤掉**（连同所有触发点，一处没留）。
     ⚠️ 内容没删：`mid` 那一拍仍然写在世界数据里，也仍然能**在卷宗里逐句重读**
        （`sc-story.js` 的卷宗 `PARTS` 里那条「战斗中残响」就是它的读法）。
     ⚠️ `js/sc-story-battle.js` 的事件表也留着 —— 它是**内容**（哪个世界在什么时刻会说什么），
        不再有人播它，但 `story_battle_matrix` 仍按它核 36 个世界的覆盖面；将来要换一种呈现
        （比如战后一次性给）时，那张表就是现成的。
     连带删掉的还有 `fxAlive()` 里那条 `|| !!B.echo`（原来靠它保证残响淡出时有帧）。 */

  /* F6（R6 #11）：把引擎帧里的能量读成 0~100 的显示值；帧里没有那一项时返回 null
     （null ＝"这一帧没告诉我"，调用方退回界面自己的记账，见 applyFrame 里三处的用法）。 */
  function eFrom(v) { return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(100, v)) : null; }

  function applyFrame(f) {
    switch (f.type) {
      case 'round': if (f.n <= 5 || f.n % 5 === 0) pushLog('—— 第 ' + f.n + ' 回合 ——'); break;
      /* ================= F6（R6 #11）· 能量条改读引擎真值 =================
         界面原来自己记一本能量账（普攻 +30 / 挨打 +15），引擎那边还有一本（每次伤害 +30/+15、
         非伤害技能 +30、必杀清零）—— 两本必然对不上：技能涨的能量界面不记、
         被闪避的普攻界面照加 ⇒ 画面上"还没满就放大招 / 满了不放"。
         现在**引擎帧给什么就用什么**（`battle.js` 的普攻/技能帧带 `energy`、
         伤害帧带 `energy`（出手者）与 `targetEnergy`（被打者））；
         帧里没有这两个字段时（老帧 / 尺子手推的帧）才退回界面记账，尺子照旧跑得动。 */
      case 'attack': {
        const ea = eFrom(f.energy);
        if (ea !== null) B.energy[f.actor] = ea;
        else B.energy[f.actor] = Math.min(100, (B.energy[f.actor] || 0) + 30);
        break;
      }
      case 'skill':
        pushLog('✨ ' + nameOf(f.actor) + ' 使用【' + f.name + '】');
        { const es = eFrom(f.energy); if (es !== null) B.energy[f.actor] = es; else if (f.ult) B.energy[f.actor] = 0; }
        /* 技能释放 / 大绝：大绝那一档更重更亮（一帧一音，别一个技能叠好几下） */
        snd(f.ult ? 'ult' : 'skill');
        break;
      case 'damage': {
        const u = B.units[f.target];
        hitFx(f.target); atkFx(f.source || f.actor);      // 受击闪红 + 出手前冲
        /* 2026-10-03（父亲大人：「战斗过程的残响窗口……不要了」）：
           这里原来按"真实战斗事件"（first_hit / 三条血量阈值 / player_low_hp）往战斗里塞残响。
           残响那一层 UI 已经整个撤掉，所以这些触发点一并删干净 —— 保留一个"问了也没人接"的
           调用只会让人以为还有这条链。 */
        /* V9.6.68（资料 §8/§9）：轻击一点点震、暴击明显一点 + 一下 hitstop（见 step）；
           平时不震，免得整场都在抖（原文："如果普通攻击都在震屏，玩家很快就烦"。） */
        B.shakeUntil = Date.now() + (f.crit ? 160 : 90);
        B.shakePx = f.crit ? 3 * CV.SCALE : 1.5 * CV.SCALE;
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, (f.crit ? '暴击 ' : '-') + f.dmg, f.crit ? CV.C.gold : CV.C.dmg,
          0, f.crit ? D.BATTLE_GEOM.floatCrit : D.BATTLE_GEOM.floatBase);
        /* ================= V1.1.x（2026-09-27 续单 · 父亲大人钉死的技术口径）=================
           **音效挂点 ＝ 伤害飘字出现的那一刻** —— 就写在这条 `floater(...)` 的下一行，
           同一个 `applyFrame` 调用里同步出声（同一帧）。
           ⚠️ **不许**挪到 `case 'round'` / `case 'attack'`（那是回合/波次起点）—— 那样会让
           一整回合的伤害在开头"齐发"一下，听起来就是"随便响的"。
           ⚠️ **不许**在 `step()` / `fight()` 里按帧时间轴配乐：帧之间还有 speed 缩放与 hitstop，
           音画必然错位。
           判据写在尺子里（`scripts/audio_audit.js` ⑩：逐帧断言"有伤害飘字 ⇒ 同一次调用里有音效"，
           并且**多段＝多声**（几个伤害飘字就几声）；⑨ 静态断言 round/attack 里没有 snd）。 */
        snd(f.crit ? 'crit' : 'hit');
        /* 出手者那一格：伤害帧里引擎给的 `energy` 是**加完这一次伤害能量**之后的真值
           （多段技能每一段都会 +30）—— 界面原来只在普攻帧上 +30 一次，多段的能量必然少算。 */
        { const es = eFrom(f.energy); if (es !== null && f.source != null) B.energy[f.source] = es; }
        { const et = eFrom(f.targetEnergy); if (et !== null) B.energy[f.target] = et; else B.energy[f.target] = Math.min(100, (B.energy[f.target] || 0) + 15); }
        if (f.healed) { const s = B.units[f.source]; if (s) { s.hp = Math.min(s.maxHp, s.hp + f.healed); floater(f.source, '+' + f.healed, CV.C.green); } }
        if (f.killed) pushLog('✗ ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'dot': {
        const u = B.units[f.target];
        hitFx(f.target);
        if (u) u.hp = Math.max(0, u.hp - f.dmg);
        floater(f.target, '-' + f.dmg, CV.C.dmg);
        /* 持续伤害也是"伤害飘字"，也要有自己的一声（比命中轻、比命中短的小闷扣） */
        snd('dot');
        if (f.killed) pushLog('✗ ' + nameOf(f.target) + ' 倒下');
        break;
      }
      case 'heal': {
        const u = B.units[f.target];
        if (u) u.hp = Math.min(u.maxHp, u.hp + f.amount);
        floater(f.target, '+' + f.amount, CV.C.green);
        ensureFx();
        break;
      }
      /* 护盾 / 闪避：各自一声音色（续单要求"被闪避给一个弱的空音；护盾这类特殊事件各自有音"）。
         `heal`（回血 / 吸血）**故意不出声** —— 吸血几乎每次都触发，再叠一声就是糊；
         这是本岗的判断，不是漏（要加一句话就行）。 */
      case 'shield': floater(f.target, '🛡+' + f.amount, CV.C.green); snd('shield');
        break;
      case 'dodge': floater(f.target, '闪避', CV.C.dim); snd('dodge'); break;
      case 'skip': pushLog('😵 ' + nameOf(f.actor) + ' 无法行动'); break;
      case 'buff': floater(f.target, '↑ ' + f.name, CV.C.green); break;
      case 'status': floater(f.target, STATUS_TEXT[f.status] || '异常', CV.C.debuff, 1500);
        break;
      /* V1.0.1（UI 设计师会诊）：Boss 二阶段 / 狂暴以前**只有日志**（日志在下方、战斗在上方，
         等于没提示）。现在日志留全句、头上飘一行短标，当场就能看见。 */
      case 'phase': { floater(f.boss, f.phase === 70 ? '⚠ 二阶段' : '⚠ 狂暴', CV.C.gold, 1800); pushLog('🔥 ' + f.text);
        /* ================= 2026-10-03（NARRATIVE-UX-FINAL §四十四）=================
           "战斗转折"那一句（`BOSS[wid].lines.turn`）挂在**二阶段**这一刻：
           Boss 血量掉到 70% 时，先出引擎那句（进入第二阶段），紧跟着它自己说一句
           （"上一轮，你没有打开这扇门。"）。这是**战斗里真实发生的事**驱动的一句，
           不是定时弹的；重刷也照样会出现（它描述的是这一场，不是首通演出）。
           ⚠️ 只在六个核心 Boss 上有；其余世界没有 `lines`，这一行就不会出现。 */
        if (f.phase === 70) {
          const BL = (G.STORYDATA && G.STORYDATA.BOSS && B.cfg && G.STORYDATA.BOSS[B.cfg.worldId]);
          const tl = BL && BL.lines && BL.lines.turn;
          if (tl) pushLog('　「' + tl + '」');
        }
        break; }
        break;
      case 'revive': { const u = B.units[f.boss]; if (u) u.hp = Math.round(u.maxHp * 0.3); floater(f.boss, '♻️ 复活', CV.C.green, 1500); snd('revive'); pushLog('♻️ ' + f.text);
        break; }
      case 'summon': pushLog('🕯 ' + f.text); break;
      case 'rule': pushLog('👁 ' + f.text); break;
      case 'nearDeath': floater(f.target, '⚠ 濒死', CV.C.gold); break;
      default: break;
    }
    B.floaters = B.floaters.slice(-8);
  }

  /* 一场打完：把结果交给配置里的 onEnd（副本负责推进波次 / 结算） */
  function finish() {
    if (B.done) return;
    B.done = true;
    B.hitAt = {}; B.atkAt = {};                 // 结算页不需要残留的受击/出手状态
    fxStop();                                   // V1.0.4 · S1：动效循环（rAF）离场即停
    const cfg = B.cfg, res = B.res;
    // 补算剩余帧，保证血量/日志正确
    for (; B.idx < res.frames.length; B.idx++) {
      const f = res.frames[B.idx];
      if (['damage', 'dot', 'heal', 'revive'].indexOf(f.type) >= 0) applyFrame(f);
    }
    const hpLeft = {};
    Object.keys(B.units).forEach((uid) => { const u = B.units[uid]; if (u.side === 'ally' && u.charId) hpLeft[u.charId] = Math.max(0, u.hp / u.maxHp); });
    const gotPanel = cfg.onEnd(res.win, res, hpLeft) || {};
    /* ================= 2026-10-03（父亲大人：「兜底一定要有吗」）=================
     这里原来还有一道"晚到的那张更空就不认它"的保险（比 rewards / acts 的条数，存进 `B.lastPanel`）。
     立 `scripts/settle_audit.js` 时把它验掉了：`B.lastPanel` 只在 `finish()` 末尾写、
     只在 `start()` 里清，而 `B.done` 保证**一场只会走一次 finish()** ⇒
     走到这一行时 `B.lastPanel` 永远是 null、判据永远不成立 —— **它是死代码**。
     真正要收口的是"这一场结算过没有"，那件事归副本那边（`settledRun` 认对象身份），
     面板是**这一场**的产物，不该由战斗页拿一个"上一次的面板"去比大小。
     所以：`onEnd` 给什么就用什么。 */
    B.panel = gotPanel;
    /* V1.0.4 · R1（父亲大人 09-27 点单：「战斗结算（关卡、胜负）」要进线上日志）：
       胜负这一条**每一场都记**（含深井 / 斗法台 —— 它们走同一段 finish）；
       关卡号那一条在副本自己的 `settleRun` 里（那边才知道 world/diff/stage，
       见 js/sc-dungeon.js 的 `battle/clear`）。两处合起来才是"关卡 ＋ 胜负"。 */
    try { if (G.LOG) G.LOG.info('battle', 'end', { win: !!res.win, world: String((cfg && cfg.worldId) || '') }); } catch (e) {}
    B.panel.acts = B.panel.acts || [{ label: '返回', id: 'battle_close', style: 'ghost' }];
    /* 胜负结算音：**波与波之间不出声**（seamless 那一档不是"这一局结束了"，
       它只是"下一波马上来"，每波都来一声胜利音会吵成一锅粥）。 */
    if (!B.panel.seamless) snd(res.win ? 'win' : 'lose');
    /* 波与波之间**不弹结算页**（网页版 2026-09-15 定的规矩）：只在画面上飘一行提示，
       然后自己接着打下一波 —— 副本要"一口气打到底"。 */
    /* 胜利且有"主按钮"时开自动倒计时（网页版：8 秒内不点就自动进下一关；可在设置里关掉） */
    if (B.panel && B.panel.acts && B.panel.acts.length && Core.S.settings && Core.S.settings.autoNext !== false) {
      /* V9.6.115（自审抓到的第二个"开了没用"）：这里原来找的是 `a.primary`（布尔），
         可小游戏的调用方（副本 / 深井）给的是 `style: 'primary'` —— 两边键名对不上，
         `findIndex` 永远是 -1 → **"通关结算自动进下一关"的倒计时从来没启动过**。
         现在两种写法都认（谁写哪种都不会再让它哑掉）。 */
      const ai = B.panel.acts.findIndex(function (a) { return a.primary || a.style === 'primary'; });
      if (res.win && ai >= 0) {
        B.autoIdx = ai; B.autoLeft = AUTO_NEXT_SEC;
        startAutoNext();
      }
    }
    if (B.panel.seamless) {
      /* V9.6.123（父亲大人："波间那个提示看着像要点击 → 做成飘过去就消失的第几波弹幕"）：
         文案来自调用方（"第 N/M 波"），这里只管**怎么出现**：
         0.9 秒内往上飘 26px 并淡出，没有边框/底色，点不到（本来也不该点）。
         动画靠一个 33ms 的小计时器重画（停就自己清掉，不白烧电）。 */
      /* V9.6.125（父亲大人："要不不要飘过的感觉，直接就是空屏然后写第几波，然后再进去战斗"）：
         改成"波次卡"——这一段**不画战场**，整屏只留一行「第 N 波」，淡入停留淡出，然后下一波开打。 */
      B.tip = B.panel.sub || '本波通过…';
      B.tipAt = Date.now();
      /* V1.0.4 · S1：这一条原来是 30fps 的 `setInterval` 整页重画 —— 同样收进 rAF 驱动器
         （档位当上限，`B.tip` 一没就自己停）。淡入停留淡出共 1.05s，30fps 富余。 */
      tipLoop.start();
      const after = B.panel.after;
      B.panel = null;
      B.timer = setTimeout(function () {
        B.tip = null;
        /* V9.6.90：**交接前先把闸门放下**。网页版是 overlay.remove()（= 放闸）在前、
           afterWave() 在后；小游戏这版漏了，于是第 2 波 run() 被自己的防重入挡掉，
           表现就是"第 5 关开始，第一波打完卡住，按啥都没用，只能撤离"。 */
        B.busy = false;
        if (after) after();
      }, 1050);   // V9.6.125：波次卡显示 1.05 秒（和网页版 .b-wave-card 的动画时长一致）
    }
    CV.render();
  }

  /* ---------- 画一帧战斗 ---------- */
  /* opt（V1.1.15 · 短屏压缩档）：{ av：头像直径, compact：名字与血量% 并一行 }
     —— 不传就是原口径（头像 50 ＋ 名字/血条/百分比三行），390/430 一个像素不变。 */
  function unitCard(x, y, w, u, opt) {
    const dead = u.hp <= 0;
    const compact = !!(opt && opt.compact);
    /* V1.0.1（父亲大人："我方人员的大小也很敌方的不一样，统一做成敌方那样的大小标准"）：
       原来我方 small 走 42、敌方 50 —— 两边一大一小。统一成 50。 */
    const av = (opt && opt.av) || 50;
    /* V9.6.28：受击抖一下 + 闪红；出手时朝对面冲一小步（我方右冲、敌方左冲） */
    const now = Date.now();
    const hitP = B.hitAt[u.uid] ? Math.max(0, 1 - (now - B.hitAt[u.uid]) / 300) : 0;
    const atkP = B.atkAt[u.uid] ? Math.max(0, 1 - (now - B.atkAt[u.uid]) / 220) : 0;
    const shake = hitP ? Math.sin(now / 28) * 3 * hitP : 0;
    const lunge = atkP ? (u.side === 'ally' ? 1 : -1) * 7 * Math.sin(atkP * Math.PI) : 0;
    x += shake + lunge;
    const cx = x + w / 2;
    if (dead) CV.ctx.globalAlpha = 0.25;
    CV.ctx.beginPath();
    if (u.side === 'enemy') CV.ctx.arc(cx, y + av / 2, av / 2, 0, Math.PI * 2);
    else CV.round(cx - av / 2, y, av, av, CV.RADIUS,  CV.a(CV.C.panel3, .50), u.isBoss ? CV.C.accent : CV.C.line, u.isBoss ? 2 : 1.5);
    if (u.side === 'enemy') {
      CV.ctx.fillStyle = CV.C.enemy;
      CV.ctx.fill();
      CV.ctx.strokeStyle = u.isBoss ? CV.C.accent : CV.C.line; CV.ctx.lineWidth = u.isBoss ? 2 : 1.5; CV.ctx.stroke();
    } else CV.ctx.fillStyle = CV.a(CV.C.panel3, .50);
    u._cx = cx; u._top = y; u._av = av;   // 飘字要用：记住这一张卡画在哪
    /* ================= 康康 2026-10-01 · 头像框首字：敌我两侧**同一个算法、同一个字号** =================
       父亲大人：「现在小屏幕机型战斗时敌我阵营的**头像框字体大小是不一样的**」。
       真根因：这个函数的第 5 个参数 `small`，在调用处传的是 **`row.ally`** ——
       于是同一张卡两种字：**我方 `CV.FS.f1`(15px)、敌方 `CV.DISP.d1`(20px)**。
       V1.0.1 那次"统一成敌方那样的大小标准"只统一了**头像直径**（42/50→50）与**卡片宽度**（24%/30%→30%），
       **这一行漏了**（`git show fe8f9d7` 里两处都改了、就它没改）。
       而且它**在小屏上最显眼**：头像直径跟着 `kv` 缩（320 上 ≈0.82，压缩档还会再收一档），
       字号却是写死不缩的（`CV.FS` 的 k 恒为 1、`CV.DISP` 更是连 kv 都不乘）——
       头像越小，20 与 15 的**相对**差越大。
       现在改成**与头像直径同源**：一个系数、一处定义，谁把头像收小，字就跟着收 ——
       两侧永远相等，也不会在小头像里撑满。0.4 就是敌方原来那一档（50 × 0.4 = 20）
       ⇒ 390/430 标准档**敌方的观感一个像素不变**，我方跟上；压缩档（头像 34~44）首字跟着落到 14~18。
       做坏试验：把 `AV_LETTER` 那句换回 `small ? CV.FS.f1 : CV.DISP.d1` 式的分支 →
       `detail_audit` ⑥ 的「敌我同一个字号」当场红。 */
    const AV_LETTER = 0.4;
    CV.text(String(u.name || '?').slice(0, 1), cx, y + av / 2, { size: av * AV_LETTER, bold: true, align: 'center' });
    if (dead) CV.ctx.globalAlpha = 1;
    /* ---------- 短屏压缩档：名字与血量% 并成一行、血条紧跟其下 ----------
       每行省 8px，四行就是 32px —— 与"头像收一档、排距收一档"一起，才换来 320×568 上
       四行阵型＋角标＋日志卡全在自己的位置上（V1.1.15 · 见 drawBattle 顶部那段）。 */
    const fullW = w - 6 * CV.SCALE;
    const bw = fullW * 0.7;
    const bx = x + 3 * CV.SCALE + (fullW - bw) / 2;
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    const barH = D.BATTLE_GEOM.barHp * CV.SCALE;
    if (compact) {
      const pctTxt = Math.round(pct * 100) + '%';
      const pw = CV.measure(pctTxt, CV.FS.tag);
      const cy = y + av + 8 * CV.SCALE;
      CV.text(CV.fit(u.name, w - pw - 8 * CV.SCALE, CV.FS.tag), x + 3 * CV.SCALE, cy, { size: CV.FS.tag, color: CV.C.dim });
      CV.text(pctTxt, x + w - 3 * CV.SCALE, cy, { size: CV.FS.tag, color: CV.C.dim, align: 'right' });
      const by = y + av + 17 * CV.SCALE;
      CV.round(bx, by, bw, barH, CV.RADIUS_CHIP,  CV.C.bar);
      if (pct > 0) CV.round(bx, by, bw * pct, barH, CV.RADIUS_CHIP,  pct < 0.35 ? CV.C.accent : CV.C.green);
      if (u.side === 'ally') {
        const en = B.energy[u.uid] || 0;
        if (en > 0) CV.round(bx, by + barH + 6 * CV.SCALE, bw * (en / 100), D.BATTLE_GEOM.barEn * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
      }
      return av + 32 * CV.SCALE;
    }
    // 名字
    CV.text(CV.fit(u.name, w, CV.FS.sm), cx, y + av + 9 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'center' });
    /* V1.0.1（父亲大人："血条可以短一点（减长度不是减血量）"）：
       血条收成卡片内宽的 70% 并居中 —— 只动长度，血量与百分比都不变。 */
    const by = y + av + 20 * CV.SCALE, bh = barH;   // V1.0.1：与网页版同源（原 5）
    CV.round(bx, by, bw, bh, CV.RADIUS_CHIP,  CV.C.bar);
    if (pct > 0) CV.round(bx, by, bw * pct, bh, CV.RADIUS_CHIP,  pct < 0.35 ? CV.C.accent : CV.C.green);
    /* 血条百分比：网页版 .unit .u-hp 是**五级 11px**（小游戏原来画成 12px） */
    CV.text(Math.round(pct * 100) + '%', cx, by + bh + 7 * CV.SCALE, { size: CV.FS.tag, color: CV.C.dim, align: 'center' });
    if (u.side === 'ally') {
      const en = B.energy[u.uid] || 0;
      if (en > 0) CV.round(bx, by + bh + 13 * CV.SCALE, bw * (en / 100), D.BATTLE_GEOM.barEn * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
    }
    return av + 30 * CV.SCALE + 10 * CV.SCALE;
  }

  /* ================= V1.0.4 · S2（父亲大人 09-27：「运行时间长手机会发烫…主要还是战斗的时候」）===
     **战场那一片的画法只有这一份**：整页那一趟（drawBattle）与动效帧（fxPaint 的局部重画）
     都调它 —— 绝不复制第二份（"改了这处、那处忘了改"是这套代码过去最常见的病）。
     `lay` ＝ 布局快照 `{ rows, av, compact }`，由 drawBattle 算好一次存进 `B.field`：
     动效帧直接拿这份快照重画，既不重算几何，也保证两趟画出来的像素完全一致。
     这一片之外的东西（战斗日志卡 / 撤离·加速 / 顶栏）**一律不在这里画**。 */
  function drawField(lay) {
    const rows = lay.rows;
    /* V9.6.68（资料 §8：「震屏幅度要小、时间要短」）：命中时**只震战场这一片**
       （单位卡 / 飘字 / 红闪一起震），顶栏与日志不动 —— 用 canvas translate 做，
       画完立刻还原，热区不受影响。轻击 1.5px、暴击 3px，见 hitFx 里设的 B.shakePx。 */
    const shaking = (B.shakeUntil || 0) > Date.now();
    const shakePx = B.shakePx || 0;
    const sx = shaking ? (Math.random() < 0.5 ? -shakePx : shakePx) : 0;
    const sy = shaking ? (Math.random() < 0.5 ? -shakePx : shakePx) : 0;
    CV.ctx.save();
    CV.ctx.translate(sx, sy);
    rows.forEach((row) => {
      const list = row.list;
      if (!list.length) return;
      const n = Math.max(1, list.length);
      const g = 8 * CV.SCALE;
      /* V1.0.1（父亲大人："我方人员的大小也很敌方的不一样，统一做成敌方那样的大小标准"）：
         原来我方按 24% 宽、敌方按 30% —— 同一张卡两种尺寸。统一走 30%。 */
      const maxW = U.cw() * 0.3;
      const cw = Math.min(maxW, (U.cw() - g * (n - 1)) / n);
      const x0 = U.pad() + (U.cw() - (cw * n + g * (n - 1))) / 2;
      /* 标准档传 av: 0 → unitCard 走它原来的 50（390/430 一个像素不动）；
         压缩档才把反算出来的 av 传下去（同时也把"名字与血量% 并一行"打开）。 */
      /* ⚠️ 这里原来多传了一个 `row.ally` 当"small"（见 unitCard 顶部那段 —— 就是敌我字号不一致的根因）。
         首字的字号现在**只由头像直径决定**，不按阵营分档，所以这个参数整个撤掉。 */
      list.forEach((u, i) => unitCard(x0 + i * (cw + g), row.y, cw, u,
        { av: lay.av, compact: lay.compact }));
    });
    /* 伤害 / 回复飘字（V9.6.28）：上升 26px + 淡出，带深色描边保证在任何底色上都看得清。
       位置取自各卡刚才记下的 _cx/_top —— 所以先画完所有单位再画它。 */
    (B.floaters || []).forEach(function (f) {
      const u = B.units[f.uid];
      if (!u || u._cx == null) return;
      const p = Math.min(1, (Date.now() - f.t) / (f.ttl || D.BATTLE_GEOM.floatMs));
      if (p >= 1) return;
      const fy = u._top - 4 * CV.SCALE - D.BATTLE_GEOM.floatRise * CV.SCALE * p;
      const alpha = 1 - p * p;
      CV.ctx.save();
      CV.ctx.globalAlpha = alpha;
      const size = (f.size || D.BATTLE_GEOM.floatBase) * CV.SCALE;   // V1.0.1：原来写死 14（编外第六档）；现在按类型取（暴击走 floatCrit＝一级 17）
      CV.ctx.lineWidth = 3 * CV.SCALE; CV.ctx.strokeStyle = CV.a(CV.C.shade, .75);
      CV.ctx.font = '600 ' + size + 'px ' + CV.FONT;
      CV.ctx.textAlign = 'center'; CV.ctx.textBaseline = 'middle';
      CV.ctx.strokeText(f.text, u._cx, fy);
      CV.ctx.fillStyle = f.color || CV.C.gold;
      CV.ctx.fillText(f.text, u._cx, fy);
      CV.ctx.restore();
    });
    /* 受击红闪：在头像外再描一圈（画在飘字之前，所以不会被盖） */
    Object.keys(B.hitAt || {}).forEach(function (uid) {
      const u = B.units[uid];
      if (!u || u._cx == null) return;
      const p = Math.max(0, 1 - (Date.now() - B.hitAt[uid]) / 300);
      if (p <= 0) return;
      CV.ctx.save();
      CV.ctx.globalAlpha = 0.75 * p;
      CV.ctx.strokeStyle = CV.C.dangerText; CV.ctx.lineWidth = 2.5 * CV.SCALE;
      if (u.side === 'enemy') { CV.ctx.beginPath(); CV.ctx.arc(u._cx, u._top + u._av / 2, u._av / 2 + 2, 0, Math.PI * 2); CV.ctx.stroke(); }
      else CV.round(u._cx - u._av / 2 - 2, u._top - 2, u._av + 4, u._av + 4, CV.RADIUS,  null, CV.C.dangerText, 2.5 * CV.SCALE);
      CV.ctx.restore();
    });
    /* V1.0.1（父亲大人："波次卡的高度和战斗阵容的高度不一样，所以切到波次卡日志就向上补位"）：
       真凶 —— 这一句原来写在 `if (!B.tip)` **外面**，而与之配对的 ctx.save()
       在 if **里面**。战斗中两者配对；**一到波次卡，save 不执行、restore 照样执行**，
       每帧多弹出一层画布状态，把外层 `translate(0, 顶栏+8)` 的坐标系弹掉，
       整块内容（日志卡 + 撤离/速度按钮）就被顶偏；下一波 tip 变回假又恢复 ——
       正是"弹上去又回来"。这也解释了为什么"去掉波次卡就不弹"。
       修法：把它挪进 if，与 save 严格配对（现在 save/restore 都在这一个函数里，永远成对）。 */
    CV.ctx.restore();                       // 震屏结束：还原坐标系（必须与上面的 save 配对）
  }

  /* 战场那一片在**屏幕坐标**里的矩形（动效帧要在它上面"抹回底色 + 重画"）：
     上边界额外让出 32px —— 飘字要升到卡片上方（最多 26px）再加震屏的 3px；
     下边界正好到阵容区底 —— 再往下就是「撤离 / 速度」角标与日志卡，这一趟不碰它们。
     再与内容可视区求交（顶栏下沿 … 底栏上沿），保证局部重画**绝不会**画到裁剪区外面。 */
  function fieldRect(topContentY, bottomContentY) {
    const base = CV.TOP + 8 - (CV.scroll || 0);
    const top = Math.max(CV.TOP + 8, Math.round(base + topContentY - 32 * CV.SCALE));
    const bottom = Math.min(CV.H - CV.NAV_H - CV.safeBottom - 8, Math.round(base + bottomContentY));
    return { x: 0, y: top, w: CV.W, h: Math.max(0, bottom - top) };
  }

  /* 波次卡：空屏（底色已是战斗页底色）+ 居中一行「第 N 波」，淡入停留淡出 */
  function drawWaveCard(areaBottom) {
    if (!B.tip) return;
    const k = Math.max(0, Math.min(1, (Date.now() - (B.tipAt || 0)) / 1050));
    const alpha = k < 0.18 ? (k / 0.18) : (k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1);
    /* V1.0.1（父亲大人："波间的文字应该是居中在这个区域的，现在的位置不对"）：
       原来用写死的 `LOG_H2 = 92` 自己估下半边界（真实是 150），而且是在算出
       阵容区边界**之前**画 —— 只能靠估，于是字落在红框偏下。
       现在直接由调用方把**阵容区的真实下边界**（FIELD_BOTTOM）传进来：
       上边界 = 内容顶 0，字画在正中。 */
    CV.text(B.tip, CV.W / 2, areaBottom / 2,
      { size: CV.TIER.t1, bold: true, align: 'center', color: CV.a(CV.C.text, alpha.toFixed(2)) });   // V1.0.1：原来是死 token CV.FS.t1（不存在）→ 按兜底 13px 画，比网页版整整小两级
  }

  function drawBattle() {
    U.begin();
    const res = B.res;
    /* V1.0.1（**实证**，不是猜）：battle_flow_audit 的逐帧断言报过
       「出现过的 top：96 / 658」—— 96 就是这张占位卡的 top，
       说明换波 / 结算交接的空档里 B.res 短暂为空，这一帧会退回**没有日志卡的占位版**，
       下一帧日志卡又出现。战斗页还开着（B.on）时保留布局、不再退占位版。 */
    if (!res) {
      /* V1.1.9（丙组）：**没有战斗的结算页**（扫荡）走这里 —— `B.res` 为空但 `B.panel` 有值，
         也要把结算层挂上去（原来只 `return`，面板挂了却谁也不画）。 */
      if (B.panel) { CV.pageOverlay = function () { drawSettle(null, B.panel); }; return; }
      if (B.on) return;
      U.card(function () { U.h3('战斗'); U.hint('没有进行中的战斗', 6 * CV.SCALE); });
      return;
    }
    /* V9.6.128（父亲大人："波间的空屏只在上方的阵容区域中间显示就行，不要占用整个屏幕，
       下面的战斗日志和撤离加速两个按钮不要跟着闪"）：
       波次卡**只在阵容区**里显示 —— 日志、撤离、加速（以及底栏）照常画，不再整屏 return。 */
    const units = Object.keys(B.units).map((k) => B.units[k]).filter((u) => u && u.side);
    const enemies = units.filter((u) => u.side === 'enemy');
    const allies = units.filter((u) => u.side === 'ally');
    const front = allies.filter((u) => u.position === 'front');
    const back = allies.filter((u) => u.position === 'back');
    /* 波次卡：**只在阵容区**画一行「第 N 波」；日志与按钮不动（V9.6.128）。
       它的 y 需要阵容区的下边界，所以调用点挪到 FIELD_BOTTOM 算出来之后（见下）。 */
    /* 战场区：**和网页版同一套规则**（V9.6.0 父亲大人两条意见一起改）——
         · "敌我离得好近"：小游戏原来从战场顶按固定行高往下堆，满编时三行挤在上半屏；
         · "我方前后排离得太远"：网页版原来用 space-evenly 把三行摊满整屏，前后排隔了 185px。
       现在两边都是：**敌方占上方、我方前排+后排收成一组贴在日志上方**，
       我方两排之间只隔 14px（就是"一支部队"该有的距离），屏幕越高上下留白越多。 */
    const FIELD_TOP = U.y;
    /* ── 战场四行：**几何只定义一次** ──────────────────────────────────────
       V1.0.1（父亲大人："你每次修改都要代码级修改啊，别老是只改表面"）：
       这段以前是三处各写各的 —— 行高写死 92（而 unitCard 实际画出来是 90）、
       每一行的 y 手写、组间距又有两个互相打架的约束（space*2 / 固定值）。
       所以每次调间距都要重新算一遍，还算错过一次。
       现在：**行高、排内间距、组间距三个常量**摆在这儿，行的 y 一律由行号推出来，
       中间那道组间距只在这一个地方出现 —— 以后调间距就是改一个数。 */
    const AV = D.BATTLE_GEOM.av * CV.SCALE;       // 头像直径：与网页版同源（D.BATTLE_GEOM，V1.0.1）
    const LOG_H = 150 * CV.SCALE;                 // 战斗日志卡占的高度（含外边距，留够 4 行，别让底部被裁）
    /* V1.0.6（父亲大人 09-24 反馈图 12「上下都太贴了，中间间距小一点」）：
       中间那道组间距原是一个半头像（81px）—— 敌我两组之间空出一大片，而上下两头反而挤：
       上面敌人贴着头条、下面「撤离 / 速度」离日志卡只有 10px。
       这里把中间收成 0.9 个头像；四行是**在战场区里居中**的，中间省下来的高度会自动
       平分到上下两头 —— 一次改动同时满足他那两句话（上松下松、中间收紧）。 */
    /* V9.6.2（父亲大人："战斗日志还是出画了"）：这里是**内容坐标**（渲染时已经被顶栏整体下移），
       所以"画面底部"要减掉顶栏与安全区 —— 以前直接拿 CV.H 算，日志被推出去约一整个顶栏的高度。 */
    const CONTENT_H = CV.H - CV.safeBottom - (CV.TOP + 8) - 8;
    /* V9.6.8（父亲大人）：「撤离 / 速度」挪到右下角、战斗日志**上面** ——
       这一行要占位置，所以单位摆放的下边界要再往上让出它的高度，免得挤在一起。 */
    /* 右下角那两颗按钮与战斗日志之间的净距（原 10px：截图里看着像粘在日志卡上；现在 8+8 上下各让一点） */
    const CORNER_PAD = 8 * CV.SCALE;
    const CORNER_H = U.BTN_SM * CV.SCALE + CORNER_PAD;
    /* 四行：0 敌方后排 / 1 敌方前排 / 2 我方前排 / 3 我方后排（后排在上、前排朝对面，像象棋）。
       整组在战场区里竖直居中，屏幕越高留白越多。两处细节（V1.0.1，父亲大人："我方往上一点，
       现在跟两颗按钮太贴了"）：
         · **末行不该再算一次排间距**（needH 里那个 SIDE_GAP 是行"之间"的，最后一排后面没有行）；
         · 底部额外留 BOTTOM_PAD —— "撤离 / 速度"就在下面，居中的均分留白不够它们喘气。 */
    const PAD_TOP = 16 * CV.SCALE;                          // 上沿至少留 16：居中后没余量时也不贴头条
    /* ================= V1.1.15（2026-09-27 · 派单 I 第 4 条 · 视觉复审 P0-3）=================
       为什么要有这一段：320×568（iPhone 5 / SE 档）上"四行阵型 ＋ 角标行 ＋ 4 行日志卡"**根本放不下** ——
       实测需要 466.6px、可用只有 226px，于是「撤离 / 1×速度 / 5×」压在我方前两名头像上、
       我方后排直接画到日志卡上（证据：…/关键取证/320-战斗页-按钮压队友.png ＋ crop-320-b2.png）。
       旧算法只在"放得下"的档位成立：`rowTop` 被 `Math.max(16, 居中余量)` 夹在 16，
       剩下的 226px 缺口全部溢到下面的角标行与日志卡上 —— 而所有尺子全绿（detail_audit 只在 390 上量）。

       现在按**可用高度反算档位**，只影响放不下的机型（390/430 走标准档，一个像素不动）：
         标准档：4 行 ×（头像 54 ＋ 行内附加 40）＋ 两处排距 ＋ 角标行 48 ＋ 日志卡 150
         压缩档：① 头像降到"刚好放得下"的那一档（下限 34）；
                 ② 行内附加 40→32（名字与血量% 并成一行，见 unitCard 的 compact 分支）；
                 ③ 排距 14→8、组距 0.9av→0.65av、底垫 30→10；
                 ④ 日志只留最近 2 行，**三颗角标并进日志卡的表头行**（省掉单独那一行 48px）。
       ④ 这一条是给头像腾空间的关键：不做它，320 上头像只能收到 24px（比底栏图标还小）。
       判据仍是 detail_audit 那三条净距（敌排离头条 ≥16 / 我方末排底→角标 ≥20 / 角标→日志卡 ≥12）。 */
    const LOG_MIN_CARD = 100 * CV.SCALE;                    // 压缩档日志卡最小高（表头行 ＋ 2 行日志）
    /* minGap = 这一档"末排底 → 它下面那件东西"必须留出的净距（标准档＝detail_audit 那条 ≥20px；
       压缩档下面就是日志卡的表头行，留 8 就够）。**判"放得下"用的是它，不是 BOTTOM_PAD** ——
       BOTTOM_PAD 只是居中时想要的呼吸感（标准档 30）：390/430 上 need 比 avail 大 4.6px，
       老代码就是让它溢进 BOTTOM_PAD 那点余量里、照样过那三条净距 —— 所以这里也不能把它当硬线，
       否则 390 会被误判成"放不下"、跟着切压缩档（那 4.6px 的误判幅度真的踩到过）。 */
    function battleFit(o) {
      const fieldBottom = CONTENT_H - o.logBlock;           // 底部整块（日志卡、压缩档含角标行）的上沿
      const unitsBottom = fieldBottom - o.cornerH;          // 阵型的下边界
      return {
        av: o.av, extra: o.extra, side: o.side, group: o.av * o.groupK, groupK: o.groupK,
        bottomPad: o.bottomPad, logBlock: o.logBlock, cornerH: o.cornerH, cornerInLog: !!o.cornerInLog,
        fieldBottom: fieldBottom, unitsBottom: unitsBottom,
        avail: unitsBottom - o.minGap - PAD_TOP, centTop: unitsBottom - o.bottomPad,
        need: 4 * (o.av + o.extra) + 3 * o.side + o.av * o.groupK,
      };
    }
    const STD = battleFit({ av: AV, extra: 40 * CV.SCALE, side: 14 * CV.SCALE, groupK: 0.9,
      bottomPad: 30 * CV.SCALE, minGap: 20 * CV.SCALE, logBlock: LOG_H, cornerH: CORNER_H });
    const TIGHT = { extra: 32 * CV.SCALE, side: 8 * CV.SCALE, groupK: 0.65,
      bottomPad: 10 * CV.SCALE, minGap: 8 * CV.SCALE,
      logBlock: LOG_MIN_CARD + CORNER_PAD + 2 * CV.SCALE, cornerH: 0, cornerInLog: true };
    let M = STD;
    if (STD.need > STD.avail) {
      M = null;
      for (let av = AV; av >= 34 * CV.SCALE - 0.01; av -= 1 * CV.SCALE) {
        const m = battleFit(Object.assign({ av: av }, TIGHT));
        if (m.need <= m.avail) { M = m; break; }
      }
      /* 兜底：连下限都放不下（比 320 更短的屏）→ 取最低档，宁可略挤也不许溢出到角标/日志上 */
      if (!M) M = battleFit(Object.assign({ av: 34 * CV.SCALE }, TIGHT));
    }
    const compact = M.cornerInLog;
    const CARD_H = M.av + M.extra;                          // 一行占的高度 = 头像 + 名字/血条/百分比
    const SIDE_GAP = M.side, GROUP_GAP = M.group;
    const FIELD_BOTTOM = M.fieldBottom, FIELD_BOTTOM_UNITS = M.unitsBottom;
    const BOTTOM_PAD = M.bottomPad;
    const rowStep = CARD_H + SIDE_GAP;
    const needH = M.need;
    const areaH = M.centTop - FIELD_TOP;
    const rowTop = FIELD_TOP + Math.max(PAD_TOP, (areaH - needH) / 2);
    const rowY = (i) => rowTop + i * rowStep + (i >= 2 ? GROUP_GAP : 0);
    /* 尺子接口（V1.1.15）：把**这一帧真正用的档位**交出去 —— detail_audit ⑥ 要按它算三条净距。
       与 `G.rewardChips` 同一个做法：尺子量的是真代码算出来的几何，不是自己再猜一遍
       （旧版 ⑥ 把头像写死 50 去反推卡顶，压缩档一上场就会量错 —— 它已经量错过一次：
       320 上报"敌排顶 2px"，其实卡顶就在 16）。unitAv 是**画出来的**头像直径。 */
    G.battleGeom = { unitAv: compact ? M.av : 50, rowH: CARD_H, compact: compact, cornerInLog: compact };
    if (!B.tip) {   // V9.6.128：波次卡期间**只跳过阵容绘制**，日志与撤离/加速照常画
      const rows = [
        { list: enemies.filter((u) => u.position !== 'front'), y: rowY(0), ally: false },   // 敌方后排（最上）
        { list: enemies.filter((u) => u.position === 'front'), y: rowY(1), ally: false },   // 敌方前排（靠中）
        { list: front, y: rowY(2), ally: true },                                            // 我方前排（靠中）
        { list: back, y: rowY(3), ally: true },                                             // 我方后排（最下）
      ];
      /* 战场那一片：整页这一趟与动效帧共用同一个 drawField（见上）。
         布局快照顺手存进 B.field —— 动效帧就靠它"只重画这一块"（S2）。 */
      B.field = { rows: rows, av: compact ? M.av : 0, compact: compact,
        rect: fieldRect(FIELD_TOP, FIELD_BOTTOM_UNITS) };
      drawField(B.field);
    } else B.field = null;   // 波次卡那一段不画战场 → 动效帧也退回整页（见 fxPaint）
    /* 右下角三颗按钮：撤离 / N×速度 / ×5
       标准档：单独一行，压在日志卡上面（V9.6.8 父亲大人定的站位）；
       压缩档：并进日志卡的表头行（见下面那段注释）—— 卡先画，角标后画，才压得住卡底。 */
    if (!compact) battleCornerButtons(FIELD_BOTTOM - CORNER_PAD);
    /* 波次卡（居中在阵容区）—— 放在这里是因为它要用 FIELD_BOTTOM */
    if (B.tip) drawWaveCard(FIELD_BOTTOM);
    /* 战斗日志贴着内容底部（网页版 #battle-log） */
    U.y = FIELD_BOTTOM + CORNER_PAD;
    /* 战斗日志（最近 4 行，网页版 #battle-log）
       V1.0.1（父亲大人）：**高度锁死** —— 新一波开始时 B.log 会清空，
       不锁的话卡片先缩上去、再随日志变多重新拉长。minH 取 4 行时的自然高度（140）。 */
    U.card(function () {
      U.h3('战斗日志');
      const lines = B.log.slice(compact ? -2 : -4);
      if (!lines.length) U.hint('（战斗开始）', 4 * CV.SCALE);
      lines.forEach((ln) => U.hint(ln, 2 * CV.SCALE));
    }, { minH: compact ? LOG_MIN_CARD : 140 });
    /* 压缩档：三颗角标压在日志卡的表头行右侧（「战斗日志」在左、按钮在右，同一中线）。
       这一行是**省出来的** —— 标准档它在卡上面单独占 48px，那 48px 在 320 上正好是头像
       从 24px 长到 36px 的本钱。表头中线 ≈ 卡顶 ＋ padY(SP2) ＋ 半个按钮高。 */
    if (compact) battleCornerButtons(FIELD_BOTTOM + CORNER_PAD + 6 * CV.SCALE + U.BTN_SM * CV.SCALE);
    /* 结算：交给 CV.pageOverlay 画（整屏覆盖层，不在内容层里 —— 这样才是真居中、命中区也对） */
    /* R1.6 叙事轮：Boss 出场序列**叠在战场之上**（战场照样已经画好，出场淡出后直接就是战斗）——
       两件事共用一个 overlay 槽：先出场、后结算，永不同时。 */
    const settleOv = B.panel ? function () { drawSettle(res, B.panel); } : null;
    CV.pageOverlay = (B.entrance || settleOv) ? function () {
      if (B.entrance) drawEntrance();
      if (settleOv) settleOv();
    } : null;
    /* 波次卡已经在 drawBattle 开头接管了整屏（含这一行字），这里不再重复画 */

  }

  /* 网页版 .reward-chip：bg --panel2 / 边 --line / 胶囊 / 左右 12px / 12px 字 */
  /* ================= R1.2 · P2：**败因一行**（数据全部来自这一场的结算结果，不新增战报系统）=====
     · 先把开场那一帧的两队名单读出来 → uid 到阵营；
     · 再把这一场所有 `damage` 帧按"打给谁"分成"我方打出去的"与"对面打进来的"；
     · 四档判据（都是可以直接看懂的比值，不猜机制）：
         ① 三回合内就输            → 开局被压住（先补前排血量 / 减伤）
         ② 打出去 < 挨打的 1/1.4   → 输出不够
         ③ 打出去 > 挨打的 1.2 倍  → 输出够、收不掉（对面血厚 / 缺爆发节奏）
         ④ 其余                    → 五五开，差一点数值
     ⚠️ 拿不到数据（没有 start 帧 / 一次伤害都没有）就返回空串 —— **一个字都不显示**，
        绝不为了"看起来有反馈"编一句。 */
  function defeatHint(res) {
    const frames = (res && res.frames) || [];
    const start = frames.find(function (f) { return f && f.type === 'start'; });
    if (!start) return '';
    const side = {};
    (start.allies || []).forEach(function (u) { if (u && u.uid != null) side[u.uid] = 'ally'; });
    (start.enemies || []).forEach(function (u) { if (u && u.uid != null) side[u.uid] = 'enemy'; });
    let dealt = 0, taken = 0;
    frames.forEach(function (f) {
      if (!f || f.type !== 'damage' || f.target == null) return;
      const s = side[f.target], d = Number(f.dmg) || 0;
      if (s === 'enemy') dealt += d;
      else if (s === 'ally') taken += d;
    });
    const rounds = Number(res.rounds) || 0;
    const bossPhase = frames.some(function (f) { return f && f.type === 'phase'; });
    const summoned = frames.some(function (f) { return f && f.type === 'summon'; });
    const revived = frames.some(function (f) { return f && f.type === 'revive'; });
    const worldId = (B.cfg && B.cfg.worldId) || '';
    const world = D.WORLDS.find(function (w) { return w.id === worldId; });
    const mech = world ? String(world.mechanic || '').split('：')[0] : '';
    /* 先给“真发生过的战斗事件”更高优先级，再回落到伤害比。这样提示不会只告诉玩家
       “数值不够”，而是能告诉他这一场到底经历了什么。 */
    if (summoned && !bossPhase && rounds >= 8) {
      return '敌方已经进入召唤节奏：先解决小怪，再把爆发留给 Boss。' + (mech ? ' 本世界重点是「' + mech + '」。' : '');
    }
    if (revived) return 'Boss 已经触发复生：这场不是单纯拼面板，优先提高爆发与持续输出。';
    if (bossPhase && rounds >= 8) return '已经打进 Boss 狂暴阶段：输出基本够，但收尾太慢，优先补暴击 / 速度。' + (mech ? ' 注意「' + mech + '」阶段。' : '');
    if (!dealt && !taken) return '';
    if (rounds > 0 && rounds <= 3) return '前排承伤先稳住：这一场在成型前就倒了，优先补血量 / 减伤。';
    if (taken > dealt * 1.4) return '输出缺口明显：这一场承受伤害远高于你打出的伤害，先补主输出与队伍成型。';
    if (dealt > taken * 1.2) return '输出已经够了但收尾太慢：优先补速度 / 暴击，让关键回合尽快打完。';
    return mech
      ? '双方接近五五开：数值只差一点，下一次围绕「' + mech + '」调整阵容。'
      : '双方接近五五开：装备与伙伴补一档，再回来会更稳。';
  }
  /* 先算再画：结算层要**先知道胶囊占多高**才能把下面的按钮排开
     （V9.6.8 父亲大人真机截图：胶囊换行到第二排、下面的按钮却还按一排算，直接压上去）。 */
  function chipLayout(list) {
    const gap = 6 * CV.SCALE, h = 24 * CV.SCALE;
    const widths = list.map((t) => CV.measure(t, CV.FS.md) + 24 * CV.SCALE);
    // 先按一行排，超宽就换行（网页版是 flex-wrap）
    const lines = [[]];
    let w = 0;
    widths.forEach((wd, i) => {
      const cur = lines[lines.length - 1];
      const need = w + (cur.length ? gap : 0) + wd;
      if (need > U.cw() && cur.length) { lines.push([i]); w = wd; }
      else { cur.push(i); w = need; }
    });
    return { lines, widths, h, gap, height: lines.length * h + (lines.length - 1) * gap };
  }
  function drawChips(list, cx, y) {
    const L = chipLayout(list), gap = L.gap, h = L.h, widths = L.widths, lines = L.lines;
    let yy = y;
    lines.forEach((idx) => {
      const total = idx.reduce((a, i) => a + widths[i], 0) + gap * (idx.length - 1);
      let x = cx - total / 2;
      idx.forEach((i) => {
        CV.round(x, yy, widths[i], h, h / 2, CV.a(CV.C.panel2, .50), CV.C.line);
        CV.text(list[i], x + widths[i] / 2, yy + h / 2, { size: CV.FS.md, align: 'center' });
        x += widths[i] + gap;
      });
      yy += h + gap;
    });
    return L.height;
  }
  /* ================= R1.6 叙事轮 · Boss 出场序列（§三 / §四） =================
     父亲大人要的因果链：**场景 → Boss 出现 → 动作 → 台词 → 开打**，控制在 2~5 秒。
     这里画的是"已经在战场上"的那一层：战场（场景图 + 敌我阵型）就在下面，
     出场层只做三件事 —— 压暗、把 Boss 立绘推上台、给三行字（Boss 台词 / 它为什么挡在这里 / 本世界机制）。
     §五 的要求照办：**不铺大文字框**，只在底部淡入；不遮住 Boss 的画面。
     §七 的要求照办：不登记热区、不改战斗结果、到点自己走。 */
  function drawEntrance() {
    const e = B.entrance;
    if (!e) return;
    const ms = e.ms || 2400;
    const el = Date.now() - (e.until - ms);
    if (el > ms + 400) { B.entrance = null; return; }
    const k = Math.max(0, Math.min(1, el < 260 ? el / 260 : (ms - el) / 420));
    const c = CV.ctx;
    if (typeof c.globalAlpha === 'number') c.globalAlpha = k;
    /* ① 压暗（场景与阵型看得见，但退到后面去） */
    c.fillStyle = CV.a(CV.C.shade, .62);
    c.fillRect(0, 0, CV.W, CV.H);
    /* ② Boss 立绘：能拿到正式图就画（右 1/3、contain 不裁头），拿不到就不画 —— 绝不画空框 */
    const img = (G.Story && G.Story.bossImage) ? G.Story.bossImage(e.worldId) : null;
    const top = CV.TOP + 8, bottom = CV.H - CV.safeBottom;
    if (img) {
      const iw = img.width || 1080, ih = img.height || 1920;
      let dh = (bottom - top) * 0.72, dw = dh * (iw / ih);
      const maxW = CV.W * 0.92;
      if (dw > maxW) { dw = maxW; dh = dw * (ih / iw); }
      c.save();
      c.drawImage(img, CV.W - dw - 6 * CV.SCALE, top + 10 * CV.SCALE, dw, dh);
      c.restore();
    }
    /* ③ 几行字：Boss 名（最大）→ 台词 → **记忆台词** → 它为什么挡在这里
       ================= 2026-10-03（NARRATIVE-UX-FINAL §四十三 / §四十四）=================
       六个核心 Boss 多一句"记忆台词"（`BOSS[wid].lines.meet`，如"你比记录里晚了六分钟。"）——
       它就是"首次见面"那一句，挂在**出场序列**里给（不是塞进剧情段，也不是只在数据里躺着）。
       ⚠️ 行数从 3 行变 4 行，原来的写法是"从 `bottom-116` 往下推"——
          多一行就会把最后那行顶出画面（320×568 上实测）。所以这里改成
          **先把所有行折出来、算总高，再自下而上排**：行数怎么变都落得回画面里。 */
    const pad = U.pad();
    const w = CV.W - pad * 2;
    const rows = [];
    if (e.name) rows.push({ t: CV.fit(e.name, w, CV.FS.d3, true), s: CV.FS.d3, c: CV.C.gold, bold: true });
    if (e.say) CV.wrap(e.say, w, CV.FS.lg, 2).forEach(function (ln) { rows.push({ t: ln, s: CV.FS.lg, c: CV.C.text }); });
    if (e.say2) CV.wrap(e.say2, w, CV.FS.lg, 2).forEach(function (ln) { rows.push({ t: ln, s: CV.FS.lg, c: CV.C.text2 }); });
    if (e.inner) CV.wrap(e.inner, w, CV.FS.sm, 2).forEach(function (ln, i) { rows.push({ t: ln, s: CV.FS.sm, c: CV.C.dim, gap: i ? 0 : 2 * CV.SCALE }); });
    let th = 0;
    rows.forEach(function (r) { th += r.s * 1.5 + (r.gap || 0); });
    let y = Math.max(top + 44 * CV.SCALE, bottom - 22 * CV.SCALE - th);
    rows.forEach(function (r) {
      y += r.gap || 0;
      CV.text(r.t, pad, y, { size: r.s, color: r.c, bold: !!r.bold });
      y += r.s * 1.5;
    });
    /* ④ 世界机制那一行**走系统层**（§二十四：系统提示与角色台词彻底分开）：
         放在最上面、带方括号、颜色与台词不同。玩家第一眼看机制，再看人说话。 */
    if (e.mech) CV.text(CV.fit(e.mech, CV.W - pad * 2, CV.FS.sm), pad, top + 16 * CV.SCALE, { size: CV.FS.sm, color: CV.C.text2 });
    /* ⑤ 进度细线：让"这是 2 秒的过场、不是卡住"这件事一眼可见 */
    const pw = CV.W - pad * 2, ph = 2 * CV.SCALE;
    CV.round(pad, bottom - 8 * CV.SCALE, pw, ph, ph, CV.a(CV.C.line, .4), null);
    CV.round(pad, bottom - 8 * CV.SCALE, pw * Math.max(0, Math.min(1, el / ms)), ph, ph, CV.C.gold, null);
    if (typeof c.globalAlpha === 'number') c.globalAlpha = 1;
  }

  function drawSettle(res, p) {
    const c = CV.ctx;
    c.fillStyle = CV.a(CV.C.shade, .85);   // 2026-10-02 父亲大人：结算层压暗 = 85
    c.fillRect(0, 0, CV.W, CV.H);
    CV.hitMode = 'screen';                 // 这一层画在屏幕坐标里，命中区也要按屏幕坐标登记
    const prevOverlay = CV.pageOverlay;
    const cx = CV.W / 2;
    /* 胶囊上限：战斗结算 8 条（老口径）；扫荡那种"聚合后仍可能很多"的页面自己传 `maxChips` 放宽。 */
    const rewards = (p.rewards || []).slice(0, p.maxChips || 8);
    const acts = p.acts || [];
    // 竖直居中：按内容总高反推起始 y（网页版是 flex 居中）
    const CH = 40 * CV.SCALE, SUB = 18 * CV.SCALE;
    /* V9.6.8（父亲大人真机截图："结算界面乱的"）：奖励胶囊会换行，这里必须用**真实高度**，
       以前写死 28px —— 胶囊换到第二排时按钮就压在胶囊上。 */
    const chipsH = rewards.length ? chipLayout(rewards).height : 0;
    /* ================= 2026-10-03（父亲大人：「战斗失败的结算页面文字的行距有问题」）=================
       失败时多出来的那一行"为什么输"（`defeatHint`）原来**画在 `y - 12`**，
       而上一行（回合 + 副题）画在同一个 y 的 `y + 8` —— 两行只差 **10px**，
       长句子看上去就是贴着上一行；而且它**没有算进 `total`**（竖直居中的那个总高），
       内容比算出来的高，整块就会偏下、按钮上面的留白被吃掉。
       现在把它**提到这里先算**（算出要占几行），按与上一行同一套排版摆，再照实行高推进。
       ⚠️ `defeatHint` 只读 `res`，不依赖任何绘制状态，所以提前算没有副作用。 */
    /* ⚠️ 这里只能读 `res`，**不能读 `R`** —— `const R = res || {}` 在下面几行才声明，
       提前读会撞上 TDZ 直接抛错（结算页当场白屏）。`p.hintLine` 是原来就有的"抑制开关"，口径不变。 */
    const hint = (!(res && res.win) && !p.hintLine) ? (defeatHint(res || {}) || '') : '';
    const HINTW = Math.min(340 * CV.SCALE, U.iw());
    const hintLines = hint ? CV.wrap(hint, HINTW, CV.FS.md, 3) : [];
    const HINTLH = CV.FS.md * 1.6;                       // 行距：比字号宽一点，长句才不挤
    /* ================= 2026-10-03（NARRATIVE-UX-FINAL §三十三）· **新增记录那一行** =================
       结算页要说清"这一场留下了什么"：新增卷宗 ×N ＋ 编号。
       高度必须在 `total` 里先算（与败因那一行同一条纪律：不先算，按钮就会压上去）。
       ⚠️ 只列前两条编号，后面折成省略号 —— 320 小屏放不下六个 W##-NNN。 */
    const recIds = (p.records || []).slice(0, 6);
    const recText = recIds.length
      ? ('新增记录 ×' + recIds.length + '　' + recIds.slice(0, 2).join('、') + (recIds.length > 2 ? ' …' : ''))
      : '';
    const recLines = recText ? CV.wrap(recText, HINTW, CV.FS.md, 2) : [];
    const RECLH = CV.FS.md * 1.6;
    let total = 92 * CV.SCALE + SUB + 12 * CV.SCALE;
    if (hintLines.length) total += 10 * CV.SCALE + hintLines.length * HINTLH;   // 与下面真正推进的量一致
    if (recLines.length) total += 18 * CV.SCALE + recLines.length * RECLH;
    if (rewards.length) total += chipsH + 10 * CV.SCALE;
    /* 剧情线索那一层也要占高度，否则按钮会压在它上面（与胶囊同一条纪律）。 */
    /* 2026-10-03（父亲大人：「战斗结算不需要有这个看过的提示吧，想看剧情不是在本章卡片那里看吗」）：
       原来结算里有一行「发现：一句线索 [查看]」，现在**整行不再渲染**，高度也不再占。
       要看剧情走世界页那张「本章」卡（那是主入口）。去掉之后结算是：
       大标题 → 回合/副题 →（败因）→ 奖励胶囊 →（战场变化）→ 三颗按钮。 */
    /* R1.6：「战场变化」那一行（只在 Boss 首通出现）。
       2026-10-03（§四十四）：核心 Boss 会在它后面再接一句"记忆台词·战后" → 折行数变 2~3 行，
       所以**先按真实行数算高**（与下面画画用的是同一个 `wrap` 口径，不许两处各算一份 ——
       两处各算一次正是"按钮压上去"那类毛病的老根）。 */
    if (p.changed) {
      const cl = CV.wrap(p.changed + (p.changed2 ? ('　「' + p.changed2 + '」') : ''), U.iw() - 20 * CV.SCALE, CV.FS.md, 3);
      total += 16 * CV.SCALE + Math.max(1, cl.length) * CV.FS.md * 1.5 + 10 * CV.SCALE;
    }
    if (acts.length) total += acts.length * (44 * CV.SCALE + 10 * CV.SCALE);   // V9.6.128：动作按钮改成上下排列
    total += 44 * CV.SCALE;
    let y = Math.max(CV.TOP + 20 * CV.SCALE, (CV.H - total) / 2);
    /* V1.1.9（丙组）：这一层现在**也给扫荡结算用**（`BattleUI.showResult`）——
       扫荡没有"胜负/回合"，所以大标题与第二行都允许外面直接给（不给就还是老样子）。
       `res` 也允许为空（扫荡那条路传 `null`）。 */
    const R = res || {};
    /* ================= 2026-10-03（NARRATIVE-UX-FINAL §三十二 / §三十三）=================
       世界里的战斗**不是"打赢/打输"**，是"这次调查有没有查下去"：
         · 胜利 → 【记录完成】（这一场留下了记录）
         · 失败 → 【调查中止】（下一段见 `defeatHint`：为什么停、下一步怎么办）
       ⚠️ 只有**调查场次**（`p.survey`，由 `sc-dungeon.js` 的结算面板给）这么叫 ——
          深井 / 斗法台 / 扫荡那几路不传，仍说「胜 利 / 战 败」。
          （把打擂台也叫成"调查"是错的，§二十二 也要求功能按钮照样看得懂。） */
    const big = p.bigTitle || (R.win ? (p.survey ? '记录完成' : '胜 利') : (p.survey ? '调查中止' : '战 败'));
    CV.text(big, cx, y + 26 * CV.SCALE,
      { size: CV.DISP.d3 * CV.SCALE, bold: true, align: 'center', color: p.bigTitleColor || (R.win ? CV.C.gold : CV.C.accent) });
    y += 52 * CV.SCALE;
    // 第二行：战斗是"回合 + 星级"；扫荡直接给一整句（`line2`）
    const line2 = p.line2 || ((R.rounds ? (R.rounds + ' 回合') : '') + (p.sub ? ((R.rounds ? ' · ' : '') + p.sub) : ''));
    if (line2) CV.text(line2, cx, y + 8 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
    y += SUB + 12 * CV.SCALE;
    /* ================= R1.2 · P2（父亲大人 2026-10-01 任务书点名）：失败了要让玩家知道**为什么输** ====
       任务书：只用**已有的战斗结果数据**给一句短提示，不做战报系统。
       数据都在 `res.frames` 里（每一帧的 `type/target/dmg` ＋ 开场那一帧的两队名单），
       所以这里只做三件事：把"我方打出去的"和"对面打进来的"各自加总 → 按比值／回合数分四档
       → 失败时多画**一行灰字**。判断不了（没帧、没伤害）就一个字都不显示，绝不编。 */
    if (hintLines.length) {
      /* 上一行画在它的 `y + 8`，这里跟着空一格再画 —— 两行的**基线距离**从 10px 放到 ~1.6 行高。 */
      hintLines.forEach(function (ln, i) {
        CV.text(ln, cx, y + 8 * CV.SCALE + i * HINTLH, { size: CV.FS.md, align: 'center', color: CV.C.dim });
      });
      y += 10 * CV.SCALE + hintLines.length * HINTLH;
    }
    if (rewards.length) {
      drawChips(rewards, cx, y);
      y += chipsH + 10 * CV.SCALE;
    }
    /* ================= 结算第 3 层：**「发现：一句线索」**（2026-10-01 二轮重做） =================
       父亲大人原话：「『剧情线索』不要做成普通业务提示卡。改成 `发现：一句线索 [查看]`，
       让它更像**战斗结束后玩家发现了一件东西**」。
       所以这里不再是"一段剧情的入口"，而是**一行发现**：
         · `发现` 做成小标签（不是标题行）；
         · 正文是**那句话本身**（由调用方从战后那一拍的关键物件里取，见 `Story.clueOf`）；
         · 右侧一颗「查看」—— 想看全段才点它（不点也不影响任何流程）。
       位置仍夹在奖励胶囊与动作按钮之间：不抢按钮、不加奖励、不改流程。 */
    /* ================= R1.6 叙事轮 · 「战场变化」 =================
       §十四 要求的顺序：Boss 死亡 → **环境变化** → 线索 → 奖励 → 下一步。
       奖励胶囊在上面已经列完，所以这一层读起来是：
         （奖励）→ **战场变化：你改变了什么** → 发现：一条线索 → 下一步按钮。
       文本取自 `BOSS[wid].after`（例："整条轨道重新亮起"），**只在守关 Boss 首通**给一次
       （§二十：重刷不再演出）。不给按钮、不改流程。 */
    if (p.changed) {
      const cw2 = U.iw();
      CV.text('战场变化', cx - cw2 / 2 + 10 * CV.SCALE, y, { size: CV.FS.sm, color: CV.C.gold });
      /* §四十四：核心 Boss 的"记忆台词·战后"跟在那一句后面 —— **同一个标签块里的第二行**，
         不新起一节（结算页每多一节就多一次"这是什么"的犹豫）。 */
      const ls = CV.wrap(p.changed + (p.changed2 ? ('　「' + p.changed2 + '」') : ''), cw2 - 20 * CV.SCALE, CV.FS.md, 3);
      ls.forEach(function (ln, i) {
        CV.text(ln, cx - cw2 / 2 + 10 * CV.SCALE, y + 16 * CV.SCALE + i * CV.FS.md * 1.5, { size: CV.FS.md, color: CV.C.text2 });
      });
      y += 16 * CV.SCALE + Math.max(1, ls.length) * CV.FS.md * 1.5 + 10 * CV.SCALE;
    }
    /* 新增记录：紧跟在「战场变化」后面 —— 玩家读到的是"我改变了什么 + 我拿到了什么"。
       与「战场变化」同一个排版口径（小标签 + 折行的正文）。 */
    if (recLines.length) {
      const rw = U.iw();
      CV.text('卷宗', cx - rw / 2 + 10 * CV.SCALE, y, { size: CV.FS.sm, color: CV.C.gold });
      recLines.forEach(function (ln, i) {
        CV.text(ln, cx - rw / 2 + 10 * CV.SCALE, y + 16 * CV.SCALE + i * RECLH, { size: CV.FS.md, color: CV.C.text2 });
      });
      y += 18 * CV.SCALE + recLines.length * RECLH;
    }
    /* V9.6.128（父亲大人："把继续下一关的按钮放上面，收下奖励并返回放下面，
       上下排列、长度一致不就好了"）：
       动作按钮**上下排列、整宽、与底部那颗等长** —— 不再左右并排。
       这样"自动在左、深井跑右"这种不一致从排版上就不存在了；顺序也固定：
       先"接着打"（继续/下一关），最后才是"收下奖励并返回"。 */
    const BW = Math.min(320 * CV.SCALE, U.iw());
    const BH = 44 * CV.SCALE;
    U.inCard = false;
    acts.forEach(function (a, i) {
      const auto = (B.autoLeft > 0 && i === B.autoIdx);
      U.y = y;
      U.btn(cx - BW / 2, y, BW, BH,
        auto ? (a.label + '  ' + B.autoLeft + 's') : a.label, a.style || 'ghost', a.id);
      y += BH + 10 * CV.SCALE;
    });
    /* ================= V1.1.16（M 轮 · 挂机结算）=================
       底下那颗的**文案 / 样式 / 动作**现在允许外面指定 —— 挂机那条路要的是「领取」
       （金底主按钮；点了既发奖又关页），战斗 / 扫荡那条路不给就维持原样
       （ghost ＋ `battle_close`）。`closeId` 必须能换，否则「领取」会被当成"只关页不领奖"。 */
    // 最后一行：收起奖励并返回（与上面每一颗**同宽**）
    U.y = y;
    U.btn(cx - BW / 2, y, BW, BH,
      p.closeLabel || (R.win ? (acts.length ? '收下奖励并返回' : '收下奖励') : '返回'),
      p.closeStyle || (acts.length ? 'ghost' : 'primary'), p.closeId || 'battle_close');
    CV.hitMode = 'content';
    CV.pageOverlay = prevOverlay;
  }

  CV.register('battle', drawBattle);

  /* ================= V1.1.9（丙组 · 通用结算页）=================
     父亲大人：「**现在扫荡的结算不行，里面还有乱码，可以像战斗结算那样展示**」。
     扫荡不是战斗，但它要做的是同一件事：把"这一趟拿到了什么"用**同一套胶囊**摆出来。
     所以这里把战斗那条路**整个借出去**（同一个 `drawSettle` / `drawChips` / 同一个页面），
     而不是在扫荡那边另写一套（那正是"两套写法迟早分叉"的老坑）：
       · `panel.title`   → 顶栏标题（战斗页那条头）
       · `panel.bigTitle`→ 大字（战斗是"胜 利/战 败"，扫荡给"扫荡完成"）
       · `panel.line2`   → 第二行整句（扫荡写"扫荡 N 次 · 世界 第 X 关（难度）"）
       · `panel.rewards` → 胶囊（**只认 D.CURRENCIES/D.ITEMS 那套图标与名字**，内部键名漏不出来）
       · `panel.acts`    → 可选的动作按钮（扫荡传空 → 底下那颗变成主按钮）
     还要把"从哪儿来"记下来：底下那颗 `battle_close` 会按它退回（扫荡 → 回扫荡页/世界页）。
     ⚠️ 这个函数**必须挂在 `G.BattleUI` 已经建好之后**（放在文件末尾那个对象里）——
        第一版写在 `CV.register('battle')` 后面，那时 `G.BattleUI` 还不存在，
        加载就抛 `Cannot set properties of undefined`（七把尺子当场全红，page_smoke 直接指出行号）。 */
  function showResult(panel) {
    B.back = { stack: CV.stack.slice(), scroll: CV.scroll || 0 };
    B.on = false; B.res = null; B.done = true; B.busy = false; B.cfg = null;
    B.autoIdx = -1; B.autoLeft = 0;
    /* V1.0.4 · S1/S5：结算页是"画一次"的静态页（`CV.reset` 那一趟就画完了）——
       动效帧 / 波次卡这两条循环在这里一并停掉，免得结算页上还挂着战斗的帧循环。 */
    fxStop(); tipStop();
    if (B.autoT) { clearInterval(B.autoT); B.autoT = null; }
    B.panel = panel || {};
    B.panel.acts = B.panel.acts || [];
    CV.reset('battle', { title: B.panel.title || '结算' });
  }

  /* ---------- 顶部固定条（标题 / 速度 / 撤离）画在顶栏位置 ---------- */
  CV.battleHead = function (title) {
    const c = CV.ctx;
    const y = CV.safeTop;
    c.fillStyle = CV.a(CV.C.overlay, .85);   // 2026-10-02 父亲大人：结算页顶栏底 = 85
    c.fillRect(0, y, CV.W, 44 * CV.SCALE);
    /* V9.6.2（父亲大人："真机也按不了 / 被遮挡"）：
       ① 这一条画在**屏幕坐标**里（在内容裁剪之前），命中区也必须按屏幕坐标登记 ——
          以前默认按内容坐标登记，手指得往上偏一整个顶栏才点得到（真机同样点不动）。
       V9.6.8（父亲大人）：「撤离 / 3×速度」从这一条挪到**右下角、战斗日志上面** ——
       顶栏这一条现在只放战斗标题，不占按钮位。 */
    CV.hitMode = 'screen';
    CV.hitMode = 'content';
    const PAD = 12 * CV.SCALE;
    CV.text(CV.fit(title, CV.W - PAD * 2, CV.FS.f1, true), PAD, y + 22 * CV.SCALE, { size: CV.FS.f1, bold: true });
    CV.TOP = y + 44 * CV.SCALE;
  };

  /* 右下角「撤离 / N×速度」：贴在战斗日志上方，右对齐（V9.6.8 父亲大人） */
  function battleCornerButtons(bottomY) {
    const bh = U.BTN_SM * CV.SCALE, gap = 8 * CV.SCALE;
    const w1 = CV.measure('撤离', CV.FS.md) + 26 * CV.SCALE;
    /* ================= V1.1.9（乙组 · 父亲大人）=================
       「**那个战斗五倍加速的单开一个按钮，不要跟现在的 x1/x2 合在一起**」
       原来是一颗按钮循环 1×→2×→（第 3 下看广告）→5×。现在拆成两颗：
         · **免费档那颗**：**只在 1× / 2× 之间切**（不再有第 3 下，也不再显示 5×）；
         · **×5 那颗**：单开一颗。没开 → 点了走 `AD.show('speed_x5')`；开了 → 显示倒计时进"已开"态，
           **再点不再重复扣次数**（只报一句还剩多久）。
       ⚠️ `S.settings.speed` 的口径**一个字没改**：免费档仍存 1/2，×5 只体现在 `speedUntil` 上
          （`Core.effSpeed()` 是唯一入口，`ad_audit` 在盯这条）。 */
    const free = freeSpeed();
    const spd = free + '×速度';
    const w2 = CV.measure(spd, CV.FS.md) + 26 * CV.SCALE;
    const x5Left = (Core.speedLeftSec && Core.speedLeftSec()) || 0;
    const x5On = x5Left > 0;
    /* V1.0.4 · R3（父亲大人 09-27 点单）：未开时这颗走广告 ⇒ 弱网写「网络不太好」（同一处判定） */
    const x5Label = x5On ? ('5× · ' + Math.floor(x5Left / 60) + ':' + String(x5Left % 60).padStart(2, '0'))
      : (G.ADWEAK ? G.ADWEAK.label('📺 5×') : '📺 5×');
    const w3 = CV.measure(x5Label, CV.FS.md) + 26 * CV.SCALE;
    const x3 = U.pad() + U.cw() - w3, x2 = x3 - gap - w2, x1 = x2 - gap - w1;
    const y = bottomY - bh;
    U.btn(x1, y, w1, bh, '撤离', 'ghost', 'battle_quit');
    U.btn(x2, y, w2, bh, spd, 'ghost', 'battle_speed');
    /* ×5 那颗：已开时走"已开"态（金边金字），未开时也照常可点（走广告） */
    U.btn(x3, y, w3, bh, x5Label, x5On ? 'gold' : 'ghost', 'battle_speed_x5');
    return bh;
  }

  /* 免费档（1/2）—— 与 `Core.effSpeed()` 分开：那个是"当前生效档"（广告期内是 5），
     这个只回答"免费那颗按钮现在选的是几"。老档里的 3/5 一律回落成 2。 */
  function freeSpeed() {
    const s = (Core.S.settings && Core.S.settings.speed) || 1;
    return s >= 2 ? 2 : 1;
  }

  CV.on('battle_speed', function () {
    /* V1.1.9：这颗**只管免费档 1× ⇄ 2×**（原来点第 3 下会去开广告，现在那件事归旁边那颗 ×5）。 */
    const next = freeSpeed() === 1 ? 2 : 1;
    if (Core.S.settings) { Core.S.settings.speed = next; Core.save(); }
    if (Core.effSpeed) { B.speed = Core.effSpeed(); CV.battleSpeed = B.speed; }
    /* ================= F7 ②（0928 · 父亲大人："战斗倍速上面那个小字弹幕提示会一直闪好几次"）=================
       **删掉这条 `CV.toast(next + '× 速度')`** —— 点几次闪几次，而速度档位本来就写在那颗按钮上
       （`×1 / ×2` 会当场变字样）。判据用的是他自己给的那条：**玩家能从界面上自己看出这件事成功了 → 删**。
       下面 `×5` 那条不同：它报的是"还剩几分钟"（广告期倒计时，按钮上只写 ×5，看不到剩多久）→ 留。 */
    CV.render();
  });
  CV.on('battle_speed_x5', function () {
    const left = (Core.speedLeftSec && Core.speedLeftSec()) || 0;
    if (left > 0) {
      /* **已开**：再点不再扣次数（广告配额也不动），只报一句还剩多久 */
      CV.toast('×5 还剩 ' + Math.floor(left / 60) + ' 分 ' + (left % 60) + ' 秒', 1800);
      return;
    }
    if (G.ADWEAK && G.ADWEAK.block()) return;   // 弱网：一句人话，不白等（R3）
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块（免费档 1×/2×）', 2000); return; }
    AD.show('speed_x5').then(function (r) {
      if (!r || !r.granted) { CV.toast('广告没看完，倍速没开'); CV.render(); return; }
      if (Core.grantSpeedAd) Core.grantSpeedAd();
      if (Core.effSpeed) { B.speed = Core.effSpeed(); CV.battleSpeed = B.speed; }
      /* F7 ②：一次性奖励类（看完广告才拿到的那 30 分钟）→ 留，缩到最短。 */
      CV.toast('📺 ×5 已开 30 分钟（不限次数）', 2400);
      CV.render();
    });
  });
  /* ================= V1.1.8（丙组 B10 · 战斗复活）=================
     父亲大人的口径：**每场 1 次**；复活续战 —— **敌人带剩余血量进场**、**全队按满血复活**
       （F8 ⓪-a，09-28 由"只回阵亡者 50%"改成满血；代价见 `carryUnit` 那条注释）。
     做法：把这一场"打到一半的双方面板"原样搬进新一场（`B.units` 里每个单位的当前血量）：
       · **敌人**：`hp` 取当前值（不清空、不回满）——这就是"带剩余血量进场"；
       · **我方**：**一律回满**（阵亡的满血起来，活着的也从残血补满）；
       · 状态/护盾/能量这些**战斗期的临时态不带过去**（新一场从干净状态起，能量按当前值续）；
       · 用**同一份 cfg** 重开 → 对上层（波次推进 / 结算 / 斗法台 / 深井）完全透明。
     配额：`AD.show('revive', {perBattle:true})` —— 日配额由 `LIMITS.revive` 表达，
     但"每场 1 次"由**这一场的账本**把关（`cfg.reviveState`，F2-2 见 `start()` 的注释；
     换一场才归零），**并计入总闸**。 */
  function carryUnit(u, isAlly) {
    /* 界面层不用 `getProxied`（那是逻辑层给数据表用的包装，见 core.js 顶部）——
       这里就是一份临时规格对象，跟着本文件其它地方的写法用普通对象。 */
    const spec = {};
    Object.keys(u).forEach(function (k) {
      /* 不带过去：实例身份 / 战斗期临时态（状态、护盾、相位、召唤标记）/ 减伤类的"这一场的"快照 */
      if (['uid', 'side', 'statuses', 'shield', 'phase70', 'phase30', 'revived', 'summoned'].indexOf(k) >= 0) return;
      spec[k] = u[k];
    });
    /* ================= F6 #1 第二道闸 · 非数保护 =================
       `atk`/`def` 这类"该是数字"的字段一旦是 NaN/undefined，伤害算式
       `Math.max(1, Math.round(NaN))` = NaN → hp 变 NaN → `alive()` 判全灭 → 一回合瞬判胜负。
       兜底顺序：**本场的当前值 → 开局快照（B.spec0）→ 硬默认**。
       前面那条 loadRes 已经把"带全字段的规格"装进来了，这里是防"引擎那边以后再少给一个字段"
       的同一类回归（报错也好过 silently 变成 NaN 直接通关）。 */
    const base = (B.spec0 || {})[u.uid] || {};
    const numOr = function (k, dflt) {
      const v = (typeof spec[k] === 'number' && isFinite(spec[k])) ? spec[k]
        : ((typeof base[k] === 'number' && isFinite(base[k])) ? base[k] : dflt);
      return v;
    };
    spec.atk = numOr('atk', 10);          // 攻击：缺失时给一个"打得出伤害"的最小值
    spec.def = numOr('def', 0);
    spec.spd = numOr('spd', 60);
    spec.crit = numOr('crit', 0.05);
    spec.critDmg = numOr('critDmg', 2.0);
    spec.eva = numOr('eva', 0.02);
    spec.skillMult = numOr('skillMult', 1);
    spec.lifesteal = numOr('lifesteal', 0);
    spec.resPct = numOr('resPct', 0);
    spec.maxHp = u.maxHp;
    /* F8 ⓪-a（父亲大人 09-28 拍板：「**复活还是得满血复活**」）：
       原来阵亡者只回 `maxHp × 50%`、活着的保留残血；现在**全队按满血**开打。
       ⚠️ 代价（已在回单里如实报给父亲大人）：敌人**仍带着剩余血量**进场，而复活每场只准 1 次
       ⇒ 这一下等于"花一次广告换一场几乎必胜"（这是他要的，不是 bug）。 */
    spec.hp = isAlly ? Math.max(1, Math.round(u.maxHp)) : Math.max(1, Math.round(u.hp));
    spec.initEnergy = Math.max(0, Math.min(100, u.energy || 0));
    return spec;
  }
  function battleRevive() {
    const cfg = B.cfg;
    if (!cfg) { CV.toast('现在没有进行中的战斗'); return; }
    /* F2-2：账本＝`cfg.reviveState`（副本给的是它的 run）；没给就记在 cfg 自己身上。
       这一句必须**先于**任何重开动作 —— 重开走的是 `run()→start()`，而那正是老写法被复位的地方。 */
    const ledger = cfg.reviveState || cfg;
    if (ledger.revived) { CV.toast('这一场已经复活过了（每场 1 次）'); return; }
    if (G.ADWEAK && G.ADWEAK.block()) return;   // 弱网：一句人话，不白等（R3）
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); return; }
    AD.show('revive', { perBattle: true }).then(function (r) {
      if (!r || !r.granted) { CV.toast(r && r.reason === 'total' ? '今天看广告的次数用完了' : '广告没看完，没有复活'); CV.render(); return; }
      const units = Object.keys(B.units || {}).map(function (k) { return B.units[k]; });
      const allies = units.filter(function (u) { return u.side === 'ally'; }).map(function (u) { return carryUnit(u, true); });
      const enemies = units.filter(function (u) { return u.side === 'enemy'; }).map(function (u) { return carryUnit(u, false); });
      if (!allies.length || !enemies.length) { CV.toast('这一场没有可复活的对象'); CV.render(); return; }
      const revived = allies.filter(function (s, i) { return units.filter(function (u) { return u.side === 'ally'; })[i].hp <= 0; }).length;
      ledger.revived = true;                 // ← 先记账，再重开（账本随新 cfg 一起带过去）
      const next = Object.assign({}, cfg, { allies: allies, enemies: enemies, reviveState: ledger });
      G.BattleUI.clear();                    // 收掉这一场（含 busy 闸门），下面立刻重开
      G.BattleUI.run(next);
      /* F7 ②：一次性奖励类（看完广告拿到的那次复活）→ 留，缩到最短。
         F8 ⓪-a：口径从"回 50% 血"改成"全队满血" —— 时长也一并收到 2000（同一条提示不啰嗦）。 */
      CV.toast('♻️ 复活：全队满血（救回 ' + revived + ' 人）', 2000);
    });
  }
  CV.on('battle_revive', battleRevive);
  /* 打完/撤离之后回哪儿：优先用配置给的回调；没给就**还原开打时的页面栈**。
     只有连"从哪来"都没有（极端情况）才退到残域列表。 */
  function backToSource(kind) {
    const cfg = B.cfg; B.cfg = null;
    const back = B.back;
    /* ================= F8 ①（父亲大人 09-28：「副本 / 深井的返回键没用，
       就副本刚进去可以返回，打一关出来就不行了」）=================
       真因不在返回键身上：副本给的 `onClose/onQuit` 是 `CV.reset('world')`、
       深井给的是 `CV.reset('corridor')` —— 而 `CV.reset` 把页面栈**压成一层**，
       于是回来那一页成了"根"，它的吸顶 ‹（`page_back` / `dun_back` → `CV.pop()`）
       没地方可 pop ⇒ 看着就是"返回键没用"（"刚进去能返回"是因为那会儿它是 `CV.push`
       进来的、栈里还有父页）。
       修法**一处收口**（不逐页打补丁）：先照旧跑回调（该清的 State 照清，比如
       `Core.clearPendingRun()`），然后判一句 —— 只要这一页被压成了根（栈只剩一层）、
       而来路更深、且落点确实是来路上的那一页，就把 `B.back` 记下的栈与滚动位置还原回来。
       于是副本回到[残域列表 → 世界页]、深井回到[灯阁 → 深井页]，两页的 ‹ 都有地方可回，
       而且**回到的是来时那一页、滚动位置也在**（比原来"重置成根"更顺）。
       ⚠️ "落点是来路上的一页"这半句不能省：回调若是有意跳到别处（比如结算直接去背包），
          栈名对不上就不还原 —— 这条只治"被压成根"，不改别的跳转。 */
    if (cfg && cfg[kind]) {
      cfg[kind]();
      const landed = (CV.stack && CV.stack[0] && CV.stack[0].name) || '';
      const deeper = !!(back && back.stack && back.stack.length > 1);
      const onTheWay = deeper && back.stack.some(function (lvl) { return lvl.name === landed; });
      if (CV.stack.length <= 1 && onTheWay) {
        CV.stack = back.stack.slice();
        CV.scroll = back.scroll || 0;
        CV.pageOverlay = null; CV.sticky = null;
        CV.render();
      }
      return;
    }
    if (back && back.stack && back.stack.length) {
      CV.stack = back.stack.slice();
      CV.scroll = back.scroll || 0;
      CV.pageOverlay = null; CV.sticky = null;
      CV.render();
      return;
    }
    CV.reset('dungeon');
  }
  CV.on('battle_quit', function () {
    U.confirm('撤离', '确定撤离？这场战斗不算数（不给奖励），本次探索进度会清空，已经拿到的奖励保留。', function () {
      clearTimer(); B.on = false; B.res = null; B.panel = null; B.busy = false;
      backToSource('onQuit');
    });
  });
  CV.on('battle_close', function () {
    clearTimer(); B.on = false; B.res = null; B.panel = null; B.busy = false;
    backToSource('onClose');
  });
  G.BattleUI = {
    buildAllies,
    showResult,
    state: B,
    /* V9.6.89（父亲大人报的"网页版斗法台能连点跳层"）：小游戏这边同一套结构，
       也补上防重入 —— 连点两下挑战只会开一场，而不是两场各自结算。 */
    busy: function () { return !!B.busy; },
    /* R1.6 叙事轮：出场序列还在走吗（`BattleStory.entranceActive` 读它；
       战斗页每帧 `step()` 也读它来"先演完再打"）。 */
    entranceActive: function () { return !!(B.entrance && Date.now() < (B.entrance.until || 0)); },
    /* 打一场：cfg = { title, allies, enemies, worldId, maxRounds, onEnd(win,res,hpLeft), onQuit, onClose } */
    run(cfg) { if (this.busy()) { CV.toast('战斗进行中…'); return false; } start(cfg); fight(G.Battle.run({ allies: cfg.allies, enemies: cfg.enemies, worldId: cfg.worldId, maxRounds: cfg.maxRounds, allyHitMod: (G.Battle.MECHANICS[cfg.worldId] || {}).allyHitMod || 0 })); },
    fight,
    /* 看广告期间的暂停/继续（唯一调用方：`js/wx-adapter.js` 的 showRewarded） */
    pauseForAd: pauseForAd,
    resumeAfterAd: resumeAfterAd,
    clear: function () { clearTimer(); B.on = false; B.res = null; B.panel = null; B.cfg = null; B.busy = false; },
    /* ---------- 测试口（只有尺子用，不参与游戏逻辑）----------
       `audio_audit` 要能**逐帧手推** `applyFrame`，验证"每一次伤害飘字都有同帧音效、
       且多段＝多声"。没有这个口子，尺子就只能读源码猜挂点，那种尺子抓不到
       "音效被挪去了回合开始"这类改动（父亲大人续单点名要做坏试验能变红的那条）。 */
    _load: loadRes,
    _applyFrame: applyFrame,
    _battle: B,
    /* V1.0.4 · S2（`soak_audit` 用）：**单独画一帧动效帧**，不跑整页。
       尺子拿它跟"整页那一帧"里同一片的绘制序列逐条比对 —— 证明局部重画画的就是
       整页里那一块（同一份 drawField），而不是另写了一套画法。 */
    _paint: fxPaint,
    /* V1.0.4 · S1（`soak_audit` 用）：动效帧循环的账 ——
         · `driver`：'raf' / 'timer'（**必须是 raf**：不然档位管不到它、切后台也停不了）；
         · `paints` / `patch` / `full`：画了几帧、其中多少帧是"只重画战场那一片"；
         · `running`：循环还在不在跑（"没动效就停"那条就靠它证明）。
       做坏试验：把驱动换回 `setInterval(…, 55)` → driver 变 'timer'、paints 不再随档位变 → 尺子红。 */
    _fx: function () {
      return { driver: fxLoop.driver, running: fxLoop.running(),
        paints: FX.paints, patch: FX.patch, full: FX.full, tier: fxTier() };
    },
  };
})();
