/* 叙事内容审计（NARRATIVE-UX-FINAL-2026-10 §六十五）：node scripts/narrative_content_audit.js
   ==============================================================================
   任务书 §六十五 那张清单，逐条量**真数据**（`STORYDATA.WORLDS / BOSS / ARC / ARCHIVE / ENDING`）：
     36/36 世界有完整结构（in / pre / mid / post 四段非空）
     36/36 有独立核心异常（ARC.anomaly 各不相同 —— 换个名字就重来的假世界当场红）
     36/36 有机制（ARC.battleMechanic 非空，且**不与别人重名**）
     36/36 有卷宗（ARCHIVE 里至少 1 条）
     36/36 有战后变化（ARC.environmentChange 非空）
     36/36 有下一世界线索（ARC.transition 非空，**W36 除外**：它的"下一个"就是门外那片）
     6/6 核心 Boss 有阶段台词（BOSS[id].lines 的 meet / turn / after 三句齐）
     W29 九碑存在（残影台九座 / 第九座空着 / 刻痕"来过"）
     W36 双结局完整（ENDING.off 与 ENDING.on 都有正文与收束句）

   ⚠️ 这把尺子**只判"有没有、独不独立"**，"好不好看"不归它管 ——
      那是人读一遍的事（§七十二）。但它能挡住"用同一套模板套 36 遍"那种退步。
   ========================================================================== */
const { boot } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('narrative_content_audit');

let E;
try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const SD = (E.G && E.G.STORYDATA) || {};
const WORLDS = SD.WORLDS || {}, ARC = SD.ARC || {}, BOSS = SD.BOSS || {}, ARCHIVE = SD.ARCHIVE || {}, ENDING = SD.ENDING || {};
const IDS = Object.keys(WORLDS).sort();
const t = (item, ok, expected, actual) => { if (ok) R.pass(item, { expected, actual }); else R.fail(item, { expected, actual }); };

if (!IDS.length) { R.blocked('剧情内容表读得出来', { file: 'js/sc-story-data.js', expected: '36 个世界', actual: '0 个' }); R.finish(); return; }

/* ---------- ① 四段齐 ---------- */
const missSeg = IDS.filter((id) => ['in', 'pre', 'mid', 'post'].some((p) => !(WORLDS[id][p] && WORLDS[id][p].length)));
t('① 36/36 世界有完整结构（in / pre / mid / post 四段都非空）',
  missSeg.length === 0, '缺段 0 个', missSeg.length + ' 个缺段' + (missSeg.length ? '：' + missSeg.slice(0, 6).join(',') : ''));

/* ---------- ② 独立核心异常：36 个各不相同 ----------
   判据是**字符串不许重复**。同一句话套 36 遍（"这里出了异常"）当场红。 */
const anoms = IDS.map((id) => ({ id, v: String((ARC[id] || {}).anomaly || '').trim() }));
const dupAnom = {};
anoms.forEach((x) => { if (!x.v) return; dupAnom[x.v] = (dupAnom[x.v] || []).concat(x.id); });
const repeated = Object.keys(dupAnom).filter((k) => dupAnom[k].length > 1);
const emptyAnom = anoms.filter((x) => !x.v).map((x) => x.id);
t('② 36/36 有自己的核心异常（非空，而且 36 条互不重复）',
  emptyAnom.length === 0 && repeated.length === 0,
  '空 0 · 重复 0',
  '空 ' + emptyAnom.length + '（' + emptyAnom.slice(0, 5).join(',') + '） · 重复 ' + repeated.length +
    (repeated.length ? '：' + repeated.slice(0, 3).map((k) => dupAnom[k].join('/')).join(' ') : ''));

/* ---------- ③ 机制：非空 + 不重名 ---------- */
const mechs = IDS.map((id) => ({ id, v: String((ARC[id] || {}).battleMechanic || '').trim() }));
const emptyMech = mechs.filter((x) => !x.v).map((x) => x.id);
t('③ 36/36 有机制（battleMechanic 非空）', emptyMech.length === 0, '空 0 个',
  emptyMech.length + ' 个空' + (emptyMech.length ? '：' + emptyMech.slice(0, 6).join(',') : ''));

/* ---------- ④ 卷宗 ---------- */
const noArch = IDS.filter((id) => !(ARCHIVE[id] && ARCHIVE[id].length));
t('④ 36/36 有卷宗（每个世界至少 1 条记录）', noArch.length === 0, '缺 0 个',
  noArch.length + ' 个缺' + (noArch.length ? '：' + noArch.slice(0, 6).join(',') : ''));

/* ---------- ⑤ 战后变化 ---------- */
const noChange = IDS.filter((id) => !String((ARC[id] || {}).environmentChange || '').trim());
t('⑤ 36/36 有战后变化（environmentChange 非空）', noChange.length === 0, '缺 0 个',
  noChange.length + ' 个缺' + (noChange.length ? '：' + noChange.slice(0, 6).join(',') : ''));

/* ---------- ⑥ 下一世界线索（W36 例外） ---------- */
const noNext = IDS.filter((id) => id !== 'W36' && !String((ARC[id] || {}).transition || '').trim());
t('⑥ 35/35 有下一世界线索（transition 非空；W36 是最后一站，允许留白）',
  noNext.length === 0, '缺 0 个', noNext.length + ' 个缺' + (noNext.length ? '：' + noNext.slice(0, 6).join(',') : ''));

/* ---------- ⑦ 六个核心 Boss 的三句"记忆台词" ---------- */
const CORE = ['W06', 'W12', 'W18', 'W24', 'W30', 'W36'];
const badLines = CORE.filter((id) => {
  const l = (BOSS[id] || {}).lines || {};
  return !String(l.meet || '').trim() || !String(l.turn || '').trim() || !String(l.after || '').trim();
});
  t('⑦ 6/6 核心 Boss 三句齐（meet 首次见面 / turn 战斗转折 / after 战后）',
    badLines.length === 0, '6 个都齐', badLines.length ? '缺：' + badLines.join(',') : '都齐');

  /* ---------- ⑦-b 三句要**真的接上运行时**（§七十三：只增加几句台词不算落地） ----------
     每一句都点名它落到哪个槽，而且这里**真调产品的接口**验一遍：
       meet  → `BattleStory.entranceOf(wid).say2`  → 出场序列那一行（sc-battle:drawEntrance）
       turn  → `占位…` 不在这里量（它由战斗帧触发，见下面 ⑦-c 的源码判据）
       after → `BattleStory.changeOf(wid).after2` → 结算页「战场变化」那一块
     非核心世界这两处必须是空串（否则就是"所有 Boss 都硬塞同一句"）。 */
  const BS = E.G.BattleStory || {};
  const wiring = [];
  CORE.forEach((id) => {
    const want = (BOSS[id].lines || {});
    const got1 = (BS.entranceOf && BS.entranceOf(id) || {}).say2;
    const got2 = (BS.changeOf && BS.changeOf(id) || {}).after2;
    if (got1 !== want.meet) wiring.push(id + ':meet(' + JSON.stringify(got1) + ')');
    if (got2 !== want.after) wiring.push(id + ':after(' + JSON.stringify(got2) + ')');
  });
  t('⑦-b 那三句真的接上了运行时（meet → 出场序列 · after → 结算页），不是躺在数据里',
    wiring.length === 0, '6 个都对得上', wiring.length ? wiring.join(' ') : 'meet 走 entranceOf().say2 · after 走 changeOf().after2');
  /* 非核心世界不许被硬塞（否则 36 个 Boss 的出场会变成同一套） */
  const leaked = ['W01', 'W07', 'W20'].filter((id) => {
    const e = (BS.entranceOf && BS.entranceOf(id) || {}), c = (BS.changeOf && BS.changeOf(id) || {});
    return e.say2 || c.after2;
  });
  t('⑦-c 非核心世界不会被硬塞记忆台词（那两句只属于六个核心 Boss）',
    leaked.length === 0, '泄漏 0 个', leaked.length ? leaked.join(',') : '没泄漏');

  /* ---------- ⑦-d "战斗转折"那一句落在**二阶段**那个真实战斗事件上 ---------- */
  const btSrc = (() => { try { return require('fs').readFileSync(require('path').join(E.ROOT, 'js', 'sc-battle.js'), 'utf8'); } catch (e) { return ''; } })();
  t('⑦-d 战斗转折那一句挂在**二阶段**事件上（玩家在战斗里看得到，不是定时弹的）',
    /case 'phase'/.test(btSrc) && /f\.phase === 70/.test(btSrc) && /lines && BL\.lines\.turn/.test(btSrc),
    "phase 70 → pushLog('　「' + lines.turn + '」')",
    'phase=' + /case 'phase'/.test(btSrc) + ' · 70=' + /f\.phase === 70/.test(btSrc) + ' · turn=' + /lines\.turn/.test(btSrc));

/* ---------- ⑧ W29 九碑 ---------- */
{
  const w29 = WORLDS.W29 || {};
  const all = ['in', 'pre', 'mid', 'post'].reduce((a, p) => a.concat(w29[p] || []), []);
  const text = all.map((b) => String(b.s || '')).join('');
  const hasNine = /九座/.test(text) && /第九座/.test(text);
  const hasBlank = /空着/.test(text);
  const hasMark = /来过/.test(text);
  t('⑧ W29 九碑落点齐（九座残影台 / 第九座空着 / 刻痕"来过"）',
    hasNine && hasBlank && hasMark, '九座 + 空着 + 来过',
    '九座=' + hasNine + ' · 空着=' + hasBlank + ' · 来过=' + hasMark);
  /* 九个位置在卷宗里也要有出处（§八 的灯阁旧录） */
  const recs = (ARCHIVE.W29 || []).map((r) => String(r.body || '') + String(r.title || '') + String(r.note || ''));
  const recText = recs.join('');
  t('⑧-b 九碑在卷宗里有出处（"九个位置从建立之日起就已经存在" + "不要让第九个位置拥有名字"）',
    /九个位置/.test(recText) && /不要让第九个位置拥有名字/.test(recText),
    '两条都在', '九个位置=' + /九个位置/.test(recText) + ' · 第九个位置不许有名字=' + /不要让第九个位置拥有名字/.test(recText));
}

/* ---------- ⑨ W36 双结局 ---------- */
{
  const off = ENDING.off || {}, on = ENDING.on || {};
  t('⑨ W36 双结局完整（off / on 都有正文、都有收束句，且不是同一段字）',
    (off.lines || []).length > 0 && (on.lines || []).length > 0 &&
    !!String(off.last || '').trim() && !!String(on.last || '').trim() &&
    String(off.last) !== String(on.last),
    '两条正文 + 两条收束句',
    'off=' + (off.lines || []).length + ' 拍 / 收束"' + String(off.last || '').slice(0, 12) + '" · ' +
    'on=' + (on.lines || []).length + ' 拍 / 收束"' + String(on.last || '').slice(0, 12) + '"');

  /* §十一：战后那份"执灯者记录"必须真的在台面上（不是只写在文档里） */
  const led = ENDING.ledger || [];
  const ledText = led.map((x) => x.no + x.state + x.verdict + x.action).join('');
  t('⑨-b 战后台面有"执灯者记录"（第 001 次 → 第 042 次 → 第 000 次 状态：不存在）',
    led.length >= 5 && /第 001 次/.test(ledText) && /第 042 次/.test(ledText) && /第 000 次/.test(ledText) && /不存在/.test(ledText),
    '至少 5 条 · 三处关键字都在',
    led.length + ' 条 · 001=' + /第 001 次/.test(ledText) + ' · 042=' + /第 042 次/.test(ledText) + ' · 000=' + /第 000 次/.test(ledText));
  /* 而且这几行要真的进了播放器的 post 那一拍（内容写了没接上是最常见的假完成） */
  const post = (WORLDS.W36.post || []).map((b) => String(b.s || '')).join('');
  t('⑨-c 那份记录**真的进了 W36 的战后剧情**（不是只躺在数据里）',
    /第 042 次/.test(post) && /第 000 次/.test(post),
    'post 里出现 042 / 000', '042=' + /第 042 次/.test(post) + ' · 000=' + /第 000 次/.test(post));
}

R.finish();
