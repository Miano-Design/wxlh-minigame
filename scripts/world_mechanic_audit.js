/* 世界机制审计（NARRATIVE-UX-FINAL-2026-10 §五十七 / §六十八）：node scripts/world_mechanic_audit.js
   ==============================================================================
   §六十八 原话：「不能只检查 `mechanic != null`，必须检查机制是否真的被战斗 / 探索 / 反馈
   至少一个实际系统调用」。

   所以这把尺子分三层，一层比一层硬：
     ① **有钩子**：`Battle.MECHANICS[wid]` 除了 `note` 之外，至少还有一个**引擎真读的字段**
        （`allyHitMod` / `enemyShield` / `bossRevive` …）。只有一句 note ＝ 只是个标签，FAIL。
     ② **引擎真读**：那个字段名必须在 `js/battle.js` 里**真的被读**（源码级：`m.字段名` 出现过）。
        字段存在于数据、而引擎从来不读 —— 这正是"写在文件里的假机制"。
     ③ **玩家看得见**：每个世界在战斗里至少要有 3 个**事件驱动的叙事反馈**
        （`ARC.battleEvents`：trigger + line），而且 trigger 必须是 `BattleStory.EVENTS` 里的合法事件名；
        否则玩家打这一场就是纯数值，机制只在数据里存在。

   ⚠️ 这三条一起看才成立：数据有、引擎读、玩家看得见。缺一条都算没落地。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('world_mechanic_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const G = E.G, D = E.D;
const M = (G.Battle && G.Battle.MECHANICS) || {};
const BS = G.BattleStory || {};
const EVENTS = BS.EVENTS || [];
const ARC = (G.STORYDATA && G.STORYDATA.ARC) || {};
const WORLDS = (D && D.WORLDS) || [];
const IDS = WORLDS.map((w) => w.id);
const t = (item, ok, expected, actual) => { if (ok) R.pass(item, { expected, actual }); else R.fail(item, { expected, actual }); };

let battleSrc = '', battleErr = '';
try { battleSrc = fs.readFileSync(path.join(E.ROOT, 'js', 'battle.js'), 'utf8'); } catch (e) { battleErr = String((e && e.message) || e); }
/* 读不到源码就**当场停**：这一把的第 ② 条全靠它，读不到就等于没测（不许当 PASS）。 */
if (!battleSrc) { R.blocked('战斗引擎源码读得出来', { file: 'js/battle.js', expected: '可读', actual: battleErr }); R.finish(); return; }

if (!IDS.length) { R.blocked('世界表读得出来', { file: 'js/data.js', expected: '36 个世界', actual: '0 个' }); R.finish(); return; }

/* ---------- ① 有真钩子（不只是 note） ---------- */
const noHook = [], onlyNote = [];
IDS.forEach((id) => {
  const m = M[id];
  if (!m) { noHook.push(id); return; }
  const keys = Object.keys(m).filter((k) => k !== 'note');
  if (!keys.length) onlyNote.push(id);
});
t('① 36/36 世界在 `Battle.MECHANICS` 里有**真钩子**（不是只有一句 note）',
  noHook.length === 0 && onlyNote.length === 0,
  '缺 0 · 只有 note 的 0',
  '缺 ' + (noHook.length ? noHook.join(',') : '0') + ' · 只有 note ' + (onlyNote.length ? onlyNote.join(',') : '0'));

/* ---------- ② 引擎真的读那个字段 ---------- */
const notRead = [];
IDS.forEach((id) => {
  const m = M[id] || {};
  const keys = Object.keys(m).filter((k) => k !== 'note');
  /* 至少要有一个字段在战斗引擎源码里被读过（`m.xxx` / `.xxx`）。 */
  const hit = keys.some((k) => new RegExp('\\.' + k + '\\b').test(battleSrc));
  if (!hit) notRead.push(id + ':' + keys.slice(0, 2).join('/'));
});
t('② 那些字段**真的被 `js/battle.js` 读过**（字段在数据里、引擎从来不读＝假机制）',
  notRead.length === 0, '引擎没读的 0 个',
  notRead.length ? notRead.slice(0, 6).join(' ') : '36 个都至少有一个字段被引擎读');

/* ---------- ③ 玩家在战斗里看得见（事件驱动的叙事反馈 ≥3） ---------- */
{
  const few = [], badEv = [];
  IDS.forEach((id) => {
    const evs = (ARC[id] || {}).battleEvents || [];
    if (evs.length < 3) few.push(id + ':' + evs.length);
    evs.forEach((e) => { if (!e || !e.line || EVENTS.indexOf(String(e.trigger)) < 0) badEv.push(id + ':' + ((e && e.trigger) || '?')); });
  });
  t('③-a 36/36 世界在战斗里至少 3 个事件驱动的叙事反馈（ARC.battleEvents ≥ 3）',
    few.length === 0, '少于 3 个的 0', few.length ? few.slice(0, 8).join(' ') : '都 ≥3');
  t('③-b 那些反馈挂的 trigger 都是**合法事件名**（`BattleStory.EVENTS` 里有）',
    badEv.length === 0, '非法 trigger 0 个', badEv.length ? badEv.slice(0, 8).join(' ') : '全部合法');
}

/* ---------- ④ 显示串与机制说明不许打架（§六十三：剧情说一套、游戏做一套） ---------- */
{
  const mismatch = [];
  WORLDS.forEach((w) => {
    const m = M[w.id] || {};
    if (!m.note || !w.mechanic) { mismatch.push(w.id + ':缺'); return; }
    const a = String(w.mechanic).split('：')[0].trim();
    const b = String(m.note).split('：')[0].trim();
    if (a !== b) mismatch.push(w.id + ':' + a + '≠' + b);
  });
  t('④ 世界卡上写的机制名与战斗里那句机制说明**同一个**（前缀逐字一致）',
    mismatch.length === 0, '不一致 0 个', mismatch.length ? mismatch.slice(0, 6).join(' ') : '36 个都一致');
}

/* ---------- ⑤ 机制真的会在战斗里被"说到"：跑一遍 BattleStory ---------- */
{
  const noTable = [];
  IDS.forEach((id) => {
    const tb = (BS.tableOf ? BS.tableOf(id) : {}) || {};
    if (!Object.keys(tb).length) noTable.push(id);
  });
  t('⑤ 36/36 世界都能从 `BattleStory.tableOf()` 取到"战斗事件 → 一句反馈"的表',
    noTable.length === 0, '取不到 0 个', noTable.length ? noTable.slice(0, 8).join(' ') : '36 个都有');
}

R.finish();
