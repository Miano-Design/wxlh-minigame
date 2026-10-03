/* 关卡结算页审计（2026-10-03 康康）：node scripts/settle_audit.js
   ==============================================================================
   父亲大人连着报了几轮同一件事：「结算页的奖励没了 / 结算数据不在了 / 连获得的道具都没了」。
   前几轮都在**加保险**（记住上一张面板 / 把这一场钉进闭包），保险越多越说不清哪一条在起作用。
   这把尺子换一个问法：**同一场战斗结算两次，会发生什么？**

   判据（两条，都是"玩家身上真正发生的事"，不是"代码里有没有那一行"）：
     ① **第二次结算必须原样还回第一张真面板** —— 不许退回兜底（"结算数据不在了"）。
     ② **第二次结算不许再发一次奖** —— 用 `Core.tallyCur(true)` 记进项（`addCur` 是全项目唯一的产出入口），
        结算前后比一次总收入；翻倍就是重复发奖。

   为什么"结算两次"是真会发生的：`onEnd` 是战斗页 `finish()` 的回调，而
   `settleRun` 跑完会把模块级的 `run` 置空；此后任何一次晚到的收尾再进来，
   读到的是"没有进行中的这一场"——上一版在这里恢复了 `run` 再走一遍全流程，
   于是**又结算了一遍**（这是本尺子盯的那个回归）。

   只读：用内存里的夹具存档，不碰真存档、不写盘。
   ========================================================================== */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('settle_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { CV, Core, D, G } = E;
const UI = G.BattleUI, St = G.Story;

/* 固定随机：掉落与暴击都不许每次跑出不同的数（不然"奖励胶囊有几颗"没法断言） */
let seed = 20261003;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 引导层是真模态：它会把 `stage:*` 这一类非高亮派发吃掉（不是战斗坏了）。
   这里量的不是引导，所以临时摘掉。 */
const savedCoachFor = G.coachFor;
G.coachFor = function () {};
if (St && 'autoPlay' in St) { try { St.autoPlay = false; } catch (e) {} }

(async function () {
  /* ---------- 夹具：一个能打 W01 第 1 关的号 ---------- */
  Core.newGame();
  Core.setPlayerName('结算体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  const S = Core.S;
  (D.UNLOCKS || []).forEach((u) => { S.unlocks[u.id] = true; });
  S.worlds.W01 = { unlocked: true, stages: { normal: Array(12).fill(0), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  S.settings.autoNext = false;              // 别让 5 秒倒计时抢走这一场，本尺子要自己控节奏
  const ids = D.characters.slice(0, 4).map((c) => { Core.addChar(c.id); S.chars[c.id].lv = 40; return c.id; });
  S.party = ['@player'].concat(ids);
  S.bag.eqCap = 400;
  for (let i = 0; i < 40; i++) { try { Core.grantEquip('W01', 'SR', null); } catch (e) {} }
  try { Core.autoEquipBest(); } catch (e) {}

  /* ---------- 抓住副本交给战斗页的那份 cfg（下面要手动再调一次它的 onEnd） ---------- */
  const cfgs = [];
  const realRun = UI.run;
  UI.run = function (cfg) { cfgs.push(cfg); return realRun.apply(this, arguments); };

  /* ---------- 真打一关：走世界页点关卡那条真路 ---------- */
  UI.clear();
  CV.reset('dungeon');
  CV.dispatch('w:W01');                       // 进世界页
  CV.dispatch('stage:0');                     // 点第 1 关（真入口，不是直接调 startStage）

  let panel = null;
  for (let i = 0; i < 120; i++) {             // 最多等 12 秒（真引擎逐帧打）
    if (UI.state.panel) { panel = UI.state.panel; break; }
    await wait(100);
  }
  if (!panel) {
    R.blocked('第一关打完能拿到结算面板', { file: 'js/sc-dungeon.js', expected: '有面板', actual: '等了 12 秒还是没有' });
    R.finish(); return;
  }

  const isFallback = (p) => /结算数据不在了/.test(String((p && p.sub) || ''));
  const chips = (p) => ((p && p.rewards) || []).length;

  R.pass('① 打完一关，结算面板是真面板（不是兜底）', {
    file: 'js/sc-dungeon.js', expected: '有奖励胶囊、不是"结算数据不在了"',
    actual: '标题「' + panel.title + '」· sub「' + (panel.sub || '') + '」· 胶囊 ' + chips(panel) + ' 颗',
  });
  if (isFallback(panel) || chips(panel) === 0) {
    R.fail('① 结算面板上有奖励（第一张面板就坏了，下面两条不用看）', {
      file: 'js/sc-dungeon.js', expected: '真面板 + 至少 1 颗胶囊', actual: '兜底=' + isFallback(panel) + ' · 胶囊=' + chips(panel),
    });
  } else {
    R.pass('① 结算面板上有奖励（至少 1 颗胶囊）', {
      file: 'js/sc-dungeon.js', expected: '≥1 颗', actual: chips(panel) + ' 颗：' + (panel.rewards || []).join(' / '),
    });
  }

  /* ---------- ② 晚到的收尾：同一场再结算一次 ---------- */
  const cfg = cfgs[cfgs.length - 1];
  if (!cfg || typeof cfg.onEnd !== 'function') {
    R.blocked('能抓到副本这一场的 onEnd', { file: 'js/sc-dungeon.js', expected: 'cfg.onEnd', actual: '没抓到' });
    R.finish(); return;
  }
  const res = UI.state.res || { win: true, rounds: 3 };

  Core.tallyCur(true);                        // 开始记进项（只记 d>0）
  const again = cfg.onEnd(true, res, {});
  const tally = Core.tallyCur() || {};
  Core.tallyCur(false);
  const gained = Object.keys(tally).filter((k) => tally[k] > 0);

  R.pass('② 晚到的第二次结算：还回的是同一张真面板（不退回兜底）', {
    file: 'js/sc-dungeon.js', expected: '与第一张同为真面板（有胶囊）',
    actual: '兜底=' + isFallback(again) + ' · 胶囊=' + chips(again),
  });
  if (isFallback(again) || chips(again) === 0) {
    R.fail('② 晚到的第二次结算把真面板换成了兜底（父亲大人看到的那张）', {
      file: 'js/sc-dungeon.js', expected: '原样还回真面板', actual: '返回了「' + (again && again.sub) + '」',
    });
  }
  R.pass('③ 晚到的第二次结算没有再发一次奖（进项为空）', {
    file: 'js/sc-dungeon.js', expected: '第二次结算的进项 0 笔',
    actual: gained.length ? ('**又发了 ' + gained.length + ' 笔：' + gained.map((k) => k + '+' + tally[k]).join(' / ') + '**') : '0 笔',
  });
  if (gained.length) {
    R.fail('③ 同一场结算了两次 → 奖励发了双份（重复发奖）', {
      file: 'js/sc-dungeon.js', expected: '结算幂等：同一场只发一次',
      actual: gained.map((k) => k + '+' + tally[k]).join(' / '),
    });
  }

  /* ---------- ④ 兜底只能留给"真的没有这一场 / 结算真抛了" ---------- */
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(E.JS, 'sc-dungeon.js'), 'utf8');
  /* 注释里提到它不算数（这份源码的注释里就引用了好几处）——剥掉注释再数。 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
  const calls = (code.match(/lastResortPanel\(/g) || []).length;
  /* 定义 1 处 + 调用点：允许出现在"这一场已经不在"与 catch 两处；
     出现第 3 个调用点就说明又有人拿兜底当正常分支用了。 */
  R.pass('④ 兜底面板只在两条真异常路径上被调用（定义 1 + 调用 2）', {
    file: 'js/sc-dungeon.js', expected: '出现 3 次（1 定义 + 2 调用）', actual: calls + ' 次',
  });
  if (calls > 3) {
    R.fail('④ 兜底被当成了正常分支（调用点多于 2 处）', {
      file: 'js/sc-dungeon.js', expected: '≤3 次', actual: calls + ' 次 —— 又在拿兜底盖真面板',
    });
  }

  UI.clear();
  await wait(60);

  /* ---------- ⑤ 守关 Boss：走了 `Story.markBoss` 的那一条分支 ---------- */
  /* 这一条是**元凶所在**的分支：`settleRun` 里那句 `win && …` 就在这儿（原来每关都在抛）。
     所以第 1 关绿了还不够 —— 必须真打一次守关 Boss。 */
  {
    /* ⚠️ 这一段量的是**结算路径**，不是战斗时长：守关 Boss 真要打到 50 回合 × 每帧 300ms，
       尺子得跑几分钟。所以把引擎换成"一帧就打赢"的假结果（`battle_flow_audit` 同一口径）——
       结算那边拿到的 win / res / hpLeft 与真打一模一样。①–③ 用的仍是**真引擎**。 */
    const REAL_RUN = G.Battle.run;
    G.Battle.run = function () {
      return { win: true, rounds: 1, frames: [{ type: 'start', allies: [], enemies: [] }, { type: 'end', win: true, rounds: 1 }] };
    };
    S.worlds.W01.stages.normal = Array(12).fill(3);
    UI.clear();
    CV.reset('dungeon');
    CV.dispatch('w:W01');
    CV.dispatch('stage:11');                 // 第 12 关 = 守关 Boss
    let pb = null;
    for (let i = 0; i < 80; i++) { if (UI.state.panel) { pb = UI.state.panel; break; } await wait(100); }
    if (!pb) {
      R.fail('⑤ 守关 Boss 打完能拿到结算面板', { file: 'js/sc-dungeon.js', expected: '有面板', actual: '等了 15 秒还是没有' });
    } else {
      (isFallback(pb) || chips(pb) === 0 ? R.fail : R.pass)('⑤ 守关 Boss 的结算面板是真面板、且带奖励', {
        file: 'js/sc-dungeon.js', expected: '真面板 + ≥1 颗胶囊',
        actual: '兜底=' + isFallback(pb) + ' · 胶囊=' + chips(pb) + ' 颗：' + (pb.rewards || []).join(' / '),
      });
      const acts = (pb && pb.acts) || [];
      (acts.some((a) => a.id === 'dun_next' || a.id === 'dun_again') ? R.fail : R.pass)(
        '⑤b 守关 Boss 那场照旧不给「下一关 / 再来一次」（第 12 关走到头了）', {
          file: 'js/sc-dungeon.js', expected: '两颗都没有',
          actual: acts.map((a) => a.label).join(' / ') || '（只有底部那颗「收下奖励并返回」）',
        });
      const seenBoss = !!(St && St.seenBoss && St.seenBoss('W01'));
      (seenBoss ? R.pass : R.fail)('⑤c 打赢守关 Boss → 卷宗 Boss 栏记下来（markBoss 真的跑到了）', {
        file: 'js/sc-dungeon.js', expected: 'seenBoss(W01) = true',
        actual: 'seenBoss(W01) = ' + seenBoss + '（`markBoss` 这一句就是原来抛 win is not defined 的地方）',
      });
    }
    UI.clear();
    await wait(60);
    G.Battle.run = REAL_RUN;
  }

  /* ---------- ⑥ 自动下一关的链路还在（父亲大人：「你改完结算的自动下一关没了」） ---------- */
  {
    S.worlds.W01.stages.normal = Array(12).fill(0);
    S.settings.autoNext = true;
    UI.clear();
    CV.reset('dungeon');
    CV.dispatch('w:W01');
    CV.dispatch('stage:0');
    let p1 = null;
    for (let i = 0; i < 120; i++) { if (UI.state.panel) { p1 = UI.state.panel; break; } await wait(100); }
    const hasNext = !!(p1 && p1.acts && p1.acts.some((a) => a.id === 'dun_next'));
    const left = UI.state.autoLeft;
    (hasNext ? R.pass : R.fail)('⑥ 第 1 关结算页有「下一关」主按钮（自动下一关的前提）', {
      file: 'js/sc-dungeon.js', expected: '有 dun_next', actual: (p1 && p1.acts || []).map((a) => a.label).join(' / ') || '（没有按钮）',
    });
    (hasNext && left > 0 ? R.pass : R.fail)('⑥b 结算页的「自动下一关」倒计时真的起来了', {
      file: 'js/sc-battle.js', expected: 'autoLeft > 0', actual: 'autoLeft = ' + left,
    });
    CV.dispatch('dun_next');                 // 等价于倒计时到点自己按下去
    await wait(400);
    (CV.top().name === 'battle' ? R.pass : R.fail)('⑥c 按「下一关」之后真的开打第 2 关（不是停在结算页）', {
      file: 'js/sc-dungeon.js', expected: '落回 battle 页并开打',
      actual: '当前页 ' + CV.top().name + ' · 面板还在吗 ' + !!UI.state.panel,
    });
    UI.clear();
    await wait(60);
  }

  G.coachFor = savedCoachFor;
  R.finish();
})();
