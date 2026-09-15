/* 全部界面（Canvas）。业务逻辑一律调核心层，这一层只管"画 + 点"。
   ------------------------------------------------------------------------
   排布顺序：灯阁(首页) / 残域 / 执灯者 / 背包 四个一级页，
   二级页统一走 CV.open('xxx', params)，返回靠框架的返回条。
*/
const CV = require('./cv.js');
const G = GameGlobal;
const Core = window.Core;
const D = window.DATA;
const Battle = window.Battle;
const Dungeon = window.Dungeon;
const L = CV.L;
const fmt = CV.fmt;

/* ---------- 小工具 ---------- */
function S() { return Core.S; }
function settle() { Core.save(); }
function canPay(cost) { return Core.canAfford(cost); }
function curRow() {
  const s = S();
  return `◈${fmt(s.cur.points)}  ✦${fmt(s.cur.holy)}  ◆${fmt(s.cur.otherworld)}`;
}
function doAd(slot) {
  return G.AD.show(slot);
}
/* 通用"条目列表"：养成/日常那一堆入口都是这个形状 */
function tileList(items) {
  items.forEach(it => {
    L.row(it[1], it[2] || '', { id: it[0], value: it[3] || '' });
  });
}
/* 广告按钮的统一拼法：把"今天还剩几次"直接写在按钮上，玩家一眼知道还能薅几次 */
function adBtn(slot, label, id, primary) {
  const left = G.AD.left(slot);
  return { label: left > 0 ? `${label}（${left}）` : `${label}·今日已完`, id, primary: !!primary, disabled: left <= 0, size: 12 };
}
let preBuff = 0;   // 战前增益：看一次广告，下一关全队攻击 +25%
function takePreBuff() { const v = preBuff; preBuff = 0; return v; }

/* ================= 灯阁（首页） ================= */
CV.register('home', function () {
  const s = S(), pst = Core.effectivePlayerStats();
  CV.fillPanel(12, L.y, CV.W - 24, 104);
  CV.drawText(`${s.player.name || '执灯者'}  Lv.${s.player.level}`, 26, L.y + 26, { size: 17, bold: true });
  CV.drawText(`战力 ${fmt(Core.teamPower())}`, CV.W - 26, L.y + 26, { size: 12, align: 'right', color: CV.C.gold });
  CV.drawText(curRow(), 26, L.y + 54, { size: 13, color: CV.C.gold });
  CV.drawText(`攻 ${fmt(pst.atk)} · 生 ${fmt(pst.hp)} · 速 ${fmt(pst.spd)}`, 26, L.y + 78, { size: 12, color: CV.C.dim });
  CV.drawText('▸ 主角详情', CV.W - 26, L.y + 78, { size: 11, align: 'right', color: CV.C.gold });
  CV.addHit('open_protagonist', 12, L.y, CV.W - 24, 104);
  L.y += 112;

  // 主线
  const mq = Core.mainQuestState();
  const q = mq.find(x => !x.claimed);
  L.title('主线');
  if (q) {
    L.row(q.q.name, `第 ${mq.indexOf(q) + 1}/${mq.length} 步 · ${q.q.desc}`, { id: q.done ? 'claim_quest' : null, value: q.done ? '领取' : '' });
  } else L.text('主线已走完，去挑战更高难度与深井', { color: CV.C.dim });

  // 养成（与网页版同一批入口、同一套名字）
  const sect = Core.sectInfo();
  const bLv = Object.values(s.buildings).reduce((a, b) => a + b, 0);
  L.title('养成');
  tileList([
    ['open_grow', '灯阁评级', `Lv.${sect.lv} · 全队 +${(sect.pct * 100).toFixed(1)}%`],
    ['open_keji', '秘术阁', `已修 ${D.KEJI.reduce((a, k) => a + Core.kejiLv(k.id), 0)} 级`],
    ['open_fabao', '法宝', `${Core.fabaoState().own.length}/${D.FABAO.length} 件`],
    ['open_garden', '药园', `${Core.gardenState().filter(x => x.plot).length} 块在用`],
    ['open_arena', '斗法台', `第 ${Core.arenaState().floor} 台 · 剩 ${Core.arenaState().left} 次`],
    ['open_mount', '坐骑', `${Core.mountState().own.length}/${D.MOUNTS.length} 匹`],
    ['open_refine', '炼化台', '材料 → 血清'],
    ['open_authority', '灯阁权限', `Lv.${Core.authorityInfo().lv}/${Core.authorityInfo().max}`],
    ['open_buildings', '基地建设', `合计 Lv.${bLv}`],
    ['open_genelock', '铭刻', s.player.geneLock ? `${s.player.geneLock} 阶` : '未解锁'],
    ['open_beast', '伴生体', Object.keys(s.beast.owned || {}).length + ' 只'],
    ['open_reincarn', '转生天赋', `${s.player.reincarnations} 世`],
    ['open_codex', '灯录', `${Core.codexState().owned}/${Core.codexState().total} 名`],
  ]);

  // 游历（网页版这一段在「养成」与「挂机」之间）
  const tv = Core.travelProgress();
  L.title('游历', `每 ${Math.round(D.TRAVEL_EVERY_SEC / 60)} 分钟一次奇遇`);
  if (tv.pending) {
    const item = D.TRAVELS.find(x => x.id === tv.pending);
    L.row(item ? item.name : '游历奇遇', '有一桩奇遇在等你收下', { id: 'claim_travel', value: '收下' });
  } else {
    L.text(`已走 ${Math.round(tv.pct * 100)}%`, { size: 12, color: CV.C.dim });
    L.meter(tv.pct);
  }

  // 挂机
  const bank = Core.idleBankGains();
  L.title('挂机', `离线效率 ${Math.round(Core.offlineEfficiency() * 100)}% · 上限 ${Core.offlineCapHours().toFixed(0)} 小时`);
  L.fillPanel(12, L.y, CV.W - 24, 96);
  CV.drawText(hhmmssLocal(bank.seconds), 26, L.y + 24, { size: 14, bold: true });
  CV.drawText(`◈${fmt(bank.points)} · EXP ${fmt(bank.exp)}${bank.otherworld ? ' · ◆' + bank.otherworld : ''}${bank.mat ? ' · ⚙️' + bank.mat : ''}`, 26, L.y + 50, { size: 12, color: CV.C.dim });
  const ready = bank.seconds >= 60;
  CV.fillPanel(24, L.y + 62, CV.W - 48, 26, { fill: ready ? CV.C.accent : CV.C.panel2 });
  CV.drawText(ready ? '一键收取' : '再攒一会儿', CV.W / 2, L.y + 75, { size: 13, bold: true, align: 'center', color: ready ? CV.C.text : CV.C.dim });
  if (ready) CV.addHit('claim_idle', 24, L.y + 62, CV.W - 48, 26);
  L.y += 104;
  L.btn('🧭 挂机分工（4 条产线派领队）', 'open_idlelines', { size: 12 });

  // 看广告：集中区 + 分散在各自玩法里的入口，两条都保留（同行也是这么叠的）
  L.title('看广告拿好处', '每日限次，用完就没了');
  L.btnRow([adBtn('idle_boost', '⏩ 挂机加速2h', 'ad_idle'), adBtn('offline_double', '🕒 离线翻倍', 'ad_offline')]);
  L.btnRow([adBtn('holy_pack', '✦晶石×30', 'ad_holy'), adBtn('otherworld_pack', '◆结晶×50', 'ad_other')]);
  L.btnRow([adBtn('free_recruit', '🎴 普通池抽1次', 'ad_recruit'), adBtn('sweep_plus', '⏩ 扫荡+3', 'ad_sweep')]);
  L.text('同样的奖励在对应玩法里也能点：招募页 / 扫荡面板 / 开打前 / 失败结算页。', { size: 11, color: CV.C.dim });

  const t = Core.todayState();
  L.title('日常');
  tileList([
    ['open_login', '今日签到', `七日登录 · 第 ${s.login.day || 0}/7 天`],
    ['open_bounty', '限时悬赏', '按进度生成 · 到点作废'],
    ['open_tasks', '每日任务', `今日 ${t.dailyDone}/${t.dailyTotal}`],
    ['open_achievements', '成就', `${t.achClaimable} 项可领`],
    ['open_sign', '求签', Core.signState().canDraw ? '今日还没求' : `今日【${Core.signState().tier}】`],
    ['open_recruit', '招募伙伴', Core.freeRecruitAvailable() ? '今日免费 1 抽' : '攒碎片升星'],
    ['open_shop', '兑换大厅', '三档商店'],
  ]);
  L.title('其他');
  tileList([
    ['open_chars', '伙伴一览', `${Object.keys(s.chars).length} 名`],
    ['open_settings', '设置与存档', ''],
    ['open_guide', '玩法指南', ''],
  ]);
});

function hhmmssLocal(sec) { return CV.hhmmss(sec); }

/* ================= 残域 ================= */
CV.register('worlds', function () {
  const s = S();
  const pr = s.pendingRun;
  if (pr && pr.worldId) {
    const w = D.WORLDS.find(x => x.id === pr.worldId);
    L.row('继续上次副本', `${w ? w.name : pr.worldId} · 第 ${pr.stage}/12 关 · 第 ${(pr.wave || 0) + 1}/${(pr.waves || [1]).length} 波`, { id: 'resume_run', value: '继续' });
  }
  L.title('深井', `当前第 ${s.corridor.floor} 层 · 最高 ${s.corridor.best}`);
  L.btn('♾ 挑战深井第 ' + s.corridor.floor + ' 层', 'corridor_fight', { primary: true });
  L.title(`残域（${D.WORLDS.length} 个世界）`);
  D.WORLDS.forEach(w => {
    const st = s.worlds[w.id];
    const unlocked = st && st.unlocked;
    const prog = unlocked ? st.stages.normal.filter(x => x > 0).length : 0;
    L.row(w.name, unlocked ? `进度 ${prog}/12 · ${w.mechanic}` : '🔒 通关上一世界解锁', {
      id: unlocked ? 'open_world_' + w.id : null, value: unlocked ? '›' : '',
    });
  });
});

CV.register('world', function (p) {
  const s = S(), wid = p.worldId, w = D.WORLDS.find(x => x.id === wid);
  const diff = p.diff || 'normal';
  const st = s.worlds[wid];
  L.text(`${w.name}`, { size: 17, bold: true });
  L.text(`${w.desc}\n世界机制：${w.mechanic}　守关：${w.boss}`, { size: 12, color: CV.C.dim });
  L.btnRow(D.DIFFICULTY.map(d => ({
    label: d.name + (d.id !== 'normal' ? ` ×${d.mult}` : ''), size: 12,
    primary: diff === d.id, id: 'wdiff_' + d.id,
    disabled: d.id !== 'normal' && !Core.worldCleared(wid, d.id === 'hard' ? 'normal' : 'hard'),
  })));
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const unlocked = Core.stageUnlocked(wid, diff, i);
    const stars = st ? st.stages[diff][i] : 0;
    cells.push({
      label: i === 11 ? '👹' : String(i + 1), sub: stars ? '★'.repeat(stars) : '',
      done: !!stars, boss: i === 11, disabled: !unlocked,
      id: unlocked ? `stage_${wid}_${diff}_${i}` : null,
      color: unlocked ? CV.C.text : CV.C.dim,
    });
  }
  L.grid(4, cells);
  L.title('开打前', '战前增益只作用于下一关');
  L.btnRow([adBtn('pre_buff', '⚔ 攻击+25%', 'ad_prebuff', true), adBtn('sweep_plus', '⏩ 扫荡+3', 'ad_sweep')]);
  if (preBuff) L.text('✔ 已就绪：下一关全队攻击 +25%', { size: 12, color: CV.C.green });
  if (st && st.stages[diff].some(x => x > 0)) {
    L.btn(`⏩ 扫荡（今日剩余 ${Core.sweepLeft()}/${D.SWEEP_DAILY_CAP} 次）`, 'open_sweep', { disabled: Core.sweepLeft() <= 0 });
  }
});

/* ================= 战斗 ================= */
let battle = null;
CV.register('battle', function () {
  if (!battle) { L.text('战斗数据丢失，返回重进'); return; }
  const s = battle.spec;
  L.text(s.title, { size: 15, bold: true });
  L.text(battle.res.win === null ? '战斗中…' : (battle.res.win ? '✔ 胜利' : '✘ 失败'), { size: 13, color: battle.res.win === null ? CV.C.dim : (battle.res.win ? CV.C.green : CV.C.red) });
  L.title('战报');
  battle.log.slice(Math.max(0, battle.shown - 12), Math.max(1, battle.shown)).forEach(line => L.text(line, { size: 12, color: CV.C.dim }));
  L.spacer(10);
  if (!battle.done) L.btn('⏩ 跳过动画', 'battle_skip', { primary: true });
  else if (battle.outcome) L.btn(battle.outcome.label, 'battle_after', { primary: true });
});

function startBattle(spec) {
  const allies = buildAllies(spec.hpPct) || [];
  if (!allies.length) { CV.toast('全队重伤，先恢复再战'); return; }
  const enemies = spec.enemies || Dungeon.makeEnemies(spec.worldId, spec.diff, spec.stage, spec.kind);
  const res = Battle.run({
    allies, enemies, worldId: spec.worldId,
    maxRounds: spec.maxRounds || (spec.kind === 'boss' ? 50 : 30),
    allyHitMod: (Battle.MECHANICS[spec.worldId] || {}).allyHitMod || 0,
  });
  const nameOf = {};
  res.frames[0].allies.concat(res.frames[0].enemies).forEach(u => { nameOf[u.uid] = u.name; });
  const log = [];
  res.frames.forEach(f => {
    if (f.type === 'attack') log.push(`${nameOf[f.actor] || '?'} 出手`);
    else if (f.type === 'skill') log.push(`✨ ${nameOf[f.actor] || '?'} 使用【${f.name}】`);
    else if (f.type === 'damage') log.push(`${nameOf[f.target] || '?'} 受到 ${f.dmg}${f.crit ? '（暴击）' : ''}${f.killed ? ' —— 倒下' : ''}`);
    else if (f.type === 'heal') log.push(`${nameOf[f.target] || '?'} 回复 ${f.amount}`);
    else if (f.type === 'dodge') log.push(`${nameOf[f.target] || '?'} 闪避`);
    else if (f.type === 'skip') log.push(`😵 ${nameOf[f.actor] || '?'} 无法行动`);
    else if (f.type === 'dot') log.push(`${nameOf[f.target] || '?'} 持续伤害 ${f.dmg}`);
    else if (f.type === 'rule') log.push(`👁 ${f.text}`);
    else if (f.type === 'phase') log.push(`🔥 ${f.text}`);
    else if (f.type === 'revive') log.push(`♻ ${f.text}`);
    else if (f.type === 'summon') log.push(`🕯 ${f.text}`);
  });
  battle = {
    spec, res, nameOf, log, shown: 0, done: false, outcome: null,
    units: res.frames[0].allies.concat(res.frames[0].enemies).map(u => Object.assign({}, u)),
  };
  CV.reset('battle');
}
CV.on('battle_skip', () => { if (battle) { battle.shown = battle.log.length; finishBattle(); } });
CV.on('battle_after', () => { const f = battle && battle.outcome && battle.outcome.run; battle = null; if (f) f(); });

function finishBattle() {
  if (!battle || battle.done) return;
  battle.done = true;
  const spec = battle.spec;
  if (!battle.res.win) {
    battle.outcome = {
      label: '返回',
      run: () => CV.reset(spec.back || 'worlds'),
    };
    // 失败：如果是副本，清掉这一轮
    if (spec.onLose) spec.onLose();
    return;
  }
  if (spec.onWin) { battle.outcome = spec.onWin(battle); return; }
  battle.outcome = { label: '返回', run: () => CV.reset('worlds') };
}

/* 队伍编成（网页版在 ui.js，这里给小游戏版一份；建议后续搬进 core.js 共用） */
function buildAllies(hpPctMap, extraAtk) {
  const pb = extraAtk || 0;
  const s = S();
  const fb = Core.factionBuffs(s.party);
  const out = [];
  s.party.forEach((id, idx) => {
    if (!id) return;
    if (hpPctMap && hpPctMap[id] !== undefined && hpPctMap[id] <= 0.01) return;
    const position = idx < 2 ? 'front' : 'back';
    const ratio = hpPctMap && hpPctMap[id] !== undefined ? hpPctMap[id] : 1;
    if (id === '@player') {
      const st = Core.effectivePlayerStats();
      const full = Math.round(st.hp * (1 + fb.hpPct));
      out.push(Object.assign({}, st, {
        name: s.player.name || '主角', kind: 'warrior', faction: null, position,
        skills: Core.protagonistSkills(), skillLv: s.player.skillLv || [1, 1, 1],
        atk: Math.round(st.atk * (1 + fb.atkPct + pb)), spd: st.spd,
        maxHp: full, hp: Math.max(1, Math.round(full * ratio)),
        skillMult: (st.skillMult || 1) + fb.skillPct, charId: '@player',
      }));
      return;
    }
    const base = D.charById[id];
    const eff = Core.effectiveStats(id);
    if (!base || !eff) return;
    const full = Math.round(eff.hp * (1 + fb.hpPct));
    out.push(Object.assign({}, eff, {
      name: base.name, kind: base.kind, faction: base.faction, position,
      skills: base.skills, skillLv: s.chars[id].skillLv,
      atk: Math.round(eff.atk * (1 + fb.atkPct + pb)), maxHp: full, hp: Math.max(1, Math.round(full * ratio)),
      skillMult: eff.skillMult + fb.skillPct, charId: id,
    }));
  });
  return out;
}

/* 打一关（副本：一次性打完所有波次，和网页版"点进去就打"一致） */
function startStage(worldId, diff, stageIdx) {
  const s = S();
  const stage = stageIdx + 1;
  const waves = Dungeon.wavePlan(stage);
  const pb = takePreBuff();                     // 战前增益（看广告来的）只吃这一关
  let hp = {};
  s.party.filter(Boolean).forEach(id => { hp[id] = 1; });
  const gotAll = [];
  let won = true, rounds = 0;
  for (let i = 0; i < waves.length; i++) {
    const kind = waves[i];
    const allies = buildAllies(hp, pb);
    if (!allies.length) { won = false; break; }
    const res = Battle.run({ allies, enemies: Dungeon.makeEnemies(worldId, diff, stage, kind), worldId, maxRounds: kind === 'boss' ? 50 : 30 });
    rounds += res.rounds;
    if (!res.win) { won = false; break; }
    // 写回血量
    res.frames[0].allies.forEach(u => { if (u.charId !== undefined) hp[u.charId] = 1; });
    const end = res.frames[res.frames.length - 1];
    const g = Dungeon.grantRewards(worldId, diff, stage, kind);
    Core.addCharExp(s.party.filter(Boolean), g.rewards.exp);
    Core.addPlayerBattleExp(Math.round(g.rewards.exp * 0.5));
    Core.battleSettle({}, true, kind === 'boss');
    g.got.forEach(x => gotAll.push(x));
  }
  if (!won) {
    Core.save();
    CV.reset('stagefail');
    return { worldId, diff, stageIdx, won };
  }
  const comp = Core.stageComplete(worldId, diff, stageIdx, 3);
  const got = { worldId, diff, stageIdx, won, rounds, gotAll, first: comp.firstClearReward, unlocks: comp.newUnlocks };
  Core.save();
  G.AD.interstitial();
  battle = { spec: { title: `${worldId} 第 ${stage} 关` }, res: { win: true }, log: [], done: true };
  CV.reset('stageresult', got);
  return got;
}

CV.register('stageresult', function (g) {
  L.text('★ 通关', { size: 22, bold: true, color: CV.C.gold, align: 'center' });
  L.spacer(6);
  L.text(`${D.WORLDS.find(x => x.id === g.worldId).name} 第 ${g.stageIdx + 1} 关 · ${g.rounds} 回合`, { size: 12, color: CV.C.dim, align: 'center' });
  L.title('收获');
  const lines = [];
  g.gotAll.forEach(x => {
    if (x.k === 'equip') lines.push(`🗡 ${x.v.name}`);
    else if (x.k === 'item') lines.push(`${(D.ITEMS[x.v] || {}).name || x.v}×${x.n || 1}`);
    else if (x.k === 'exp') lines.push(`EXP +${fmt(x.v)}`);
    else lines.push(`${curIconLocal(x.k)}+${fmt(x.v)}`);
  });
  if (!lines.length) L.text('（这一关没掉东西）', { color: CV.C.dim });
  lines.forEach(t => L.text(t, { size: 12 }));
  if (g.first) L.text('首通奖励已发放', { size: 12, color: CV.C.gold });
  (g.unlocks || []).forEach(n => L.text('🔓 解锁【' + n + '】', { size: 12, color: CV.C.green }));
  L.spacer(8);
  const nx = Core.nextStage(g.worldId, g.diff, g.stageIdx);
  if (nx) L.btn(`› 下一关（第 ${nx.stageIdx + 1} 关）`, 'next_stage', { primary: true });
  L.btn('↻ 再来一次', 'retry_stage');
  L.btn('返回世界列表', 'to_worlds');
});
CV.register('stagefail', function () {
  L.text('✘ 队伍全员重伤', { size: 20, bold: true, color: CV.C.red, align: 'center' });
  L.spacer(10);
  L.text('打不过就是养成还没跟上：先强化装备、升评级、换克制属性的伴生体。', { size: 12, color: CV.C.dim });
  L.spacer(10);
  L.btn('↻ 复活再战（看广告，全队回 50%）', 'ad_revive', { primary: true });
  L.btn('返回', 'to_worlds');
});

function curIconLocal(k) {
  const c = D.CURRENCIES.find(x => x.id === k);
  return c ? c.icon : '';
}

/* ================= 执灯者 ================= */
CV.register('party', function () {
  const s = S();
  const fb = Core.factionBuffs(s.party);
  L.title('上阵队伍', `前 2 后 3 · 战力 ${fmt(Core.teamPower())}`);
  L.text(`阵型：${(fb.names && fb.names.join(' / ')) || '未成阵'}${fb.atkPct ? `（攻击+${Math.round(fb.atkPct * 100)}% 生命+${Math.round(fb.hpPct * 100)}%）` : ''}`, { size: 12, color: CV.C.gold });
  [0, 1, 2, 3, 4].forEach(i => {
    const id = s.party[i];
    const rowName = i < 2 ? '前排' : '后排';
    if (!id) L.row(`${rowName} ${i % 2 + 1} 号位`, '空位 · 点一下安排人手', { id: 'slot_' + i, value: '＋' });
    else {
      const nm = Core.charName(id);
      const pw = id === '@player' ? Core.playerPower() : Core.power(id);
      L.row(`${nm}${id === '@player' ? '（主角）' : ''}`, `${rowName} · 战力 ${fmt(pw)}`, {
        id: 'slotmenu_' + i, value: '›',
      });
    }
  });
  L.btnRow([
    { label: '＋ 上阵伙伴', id: 'party_add' },
    { label: '一键最优装备', id: 'auto_equip' },
  ]);
  L.title('编队预设');
  [0, 1, 2].forEach(i => {
    const p = s.presets[i];
    L.row(`预设 ${i + 1}`, p ? p.filter(Boolean).map(x => Core.charName(x)).join(' / ') : '空', {});
    L.btnRow([
      { label: '保存当前', id: 'preset_save_' + i, size: 12 },
      { label: '套用', id: 'preset_use_' + i, size: 12, disabled: !p },
    ]);
  });
});

CV.register('chars', function () {
  const s = S();
  L.title('伙伴', `${Object.keys(s.chars).length} 名 · 图鉴 ${Core.codexState().owned}/${Core.codexState().total}`);
  const ids = Object.keys(s.chars).sort((a, b) => Core.power(b) - Core.power(a));
  if (!ids.length) L.text('还没有伙伴，去「招募」抽一个', { color: CV.C.dim });
  ids.forEach(id => {
    const c = s.chars[id], b = D.charById[id];
    L.row(`${b.name}  ${c.star}★`, `${D.KIND_NAMES[b.kind] || b.kind} · ${b.faction} · Lv.${c.lv} · 战力 ${fmt(Core.power(id))}`, {
      id: 'char_' + id, value: b.rarity, valueColor: CV.rarityColor(b.rarity),
    });
  });
});

CV.register('char', function (p) {
  const s = S(), id = p.id, c = s.chars[id], b = D.charById[id];
  if (!c) { L.text('没有这名伙伴'); return; }
  const eff = Core.effectiveStats(id);
  L.text(`${b.name}  ${c.star}★  Lv.${c.lv}`, { size: 17, bold: true });
  L.text(`${b.rarity} · ${D.KIND_NAMES[b.kind] || b.kind} · ${b.faction} · 战力 ${fmt(Core.power(id))}`, { size: 12, color: CV.C.dim });
  L.text(`攻 ${fmt(eff.atk)}　防 ${fmt(eff.def)}　生 ${fmt(eff.hp)}　速 ${fmt(eff.spd)}`, { size: 12 });
  L.text(`暴击 ${(eff.crit * 100).toFixed(1)}%　闪避 ${(eff.eva * 100).toFixed(1)}%　技能倍率 ${eff.skillMult.toFixed(2)}`, { size: 12, color: CV.C.dim });
  const cost = Core.levelCost(id);
  L.title('等级', `经验 ${fmt(c.exp)}/${cost ? fmt(cost.exp) : '满级'}`);
  L.btnRow([
    { label: `升级（◈${cost ? fmt(cost.points) : '-'}）`, id: 'lvup_' + id, disabled: !cost },
    { label: '喂经验模块', id: 'feed_' + id },
  ]);
  L.title('星级', `碎片 ${c.shards}/${D.STAR_COST[c.star] || '满'}`);
  L.btn(`升星（碎片 ${D.STAR_COST[c.star] || '-'}）`, 'starup_' + id, { disabled: c.star >= D.RARITY_MAXSTAR[b.rarity] });
  L.title('技能');
  [0, 1, 2].forEach(i => {
    const sk = b.skills[i === 0 ? 's1' : i === 1 ? 's2' : 'ult'];
    L.row(`${sk.name} Lv.${c.skillLv[i]}`, sk.desc, { id: 'skillup_' + id + '_' + i, value: '升级', valueColor: CV.C.gold });
  });
  L.title('血统', `${b.bloodline} Lv.${c.bloodlineLv}/${D.BLOODLINE_MAX}`);
  L.text(D.BLOODLINES[b.bloodline].desc, { size: 12, color: CV.C.dim });
  L.btn('提升血统', 'blup_' + id);
  L.title('装备');
  D.RECRUIT_SLOTS.forEach(slot => {
    const uid = (s.equipped[id] || {})[slot];
    const eq = uid && s.equips[uid];
    L.row(D.EQUIP_SLOTS[slot], eq ? `${eq.name} +${eq.enhance}` : '空', {
      id: eq ? 'equip_' + uid : 'equipnew_' + id + '_' + slot,
      value: eq ? '查看' : '穿上',
      valueColor: eq ? CV.rarityColor(eq.rarity) : CV.C.gold,
    });
  });
});

CV.register('protagonist', function () {
  const s = S(), st = Core.effectivePlayerStats();
  L.text(`${s.player.name}  Lv.${s.player.level}`, { size: 17, bold: true });
  L.text(`战力 ${fmt(Core.playerPower())} · 可用属性点 ${s.player.attrPoints} · 技能点 ${s.player.skillPoints}`, { size: 12, color: CV.C.dim });
  L.text(`攻 ${fmt(st.atk)}　防 ${fmt(st.def)}　生 ${fmt(st.hp)}　速 ${fmt(st.spd)}　暴击 ${(st.crit * 100).toFixed(1)}%　闪避 ${(st.eva * 100).toFixed(1)}%`, { size: 12 });
  L.text(`境界：${Core.realmState().curName || '未选血统'}（${Core.realmState().realm} 阶 · 全属性 +${(Core.realmBonusPct() * 100).toFixed(1)}%）`, { size: 12, color: CV.C.gold });
  L.title('六维', `可用 ${s.player.attrPoints} 点`);
  D.ATTR_META.forEach(a => {
    L.row(a.name, a.desc, { id: 'attr_' + a.id, value: `+${s.player.attrs[a.id] || 0}`, valueColor: CV.C.gold });
  });
  L.btnRow([{ label: '洗点（免费）', id: 'reset_attrs', size: 12 }, { label: '加 5 点', id: 'attr_add5', size: 12 }]);
  L.title('技能', `可用技能点 ${s.player.skillPoints}`);
  const sk = Core.protagonistSkills();
  ['s1', 's2', 'ult'].forEach((k, i) => {
    L.row(`${sk[k].name} Lv.${(s.player.skillLv || [1, 1, 1])[i]}`, sk[k].desc || '', { id: 'pskill_' + i, value: '升级' });
  });
  L.btn('重置技能（返还点数）', 'reset_skills');
  L.title('境界渡劫');
  const rs = Core.realmState();
  if (!rs.hasBloodline) {
    L.text('先选血统——境界线跟着血统走', { size: 12, color: CV.C.dim });
    D.BLOODLINES && Object.keys(D.BLOODLINES).forEach(k => {
      L.btn(`${k}：${D.BLOODLINES[k].desc}`, 'blood_' + k);
    });
  } else {
    L.text(`${rs.curName} → ${rs.nextName || '（已至顶）'}　成功率 ${rs.next ? Math.round(rs.rate * 100) + '%' : '-'}`, { size: 12 });
    L.text(`需要：Lv.${rs.next ? rs.next.lv : '-'} · ${(D.ITEMS[rs.matItem] || {}).name} ${rs.haveMat}/${rs.matN} · ◈${fmt(rs.points)}`, { size: 12, color: CV.C.dim });
    L.btn('渡劫（失败不掉级）', 'realm_try', { disabled: !rs.next });
  }
  L.title('装备');
  D.PLAYER_SLOTS.forEach(slot => {
    const uid = (s.equipped['@player'] || {})[slot];
    const eq = uid && s.equips[uid];
    L.row(D.EQUIP_SLOTS[slot], eq ? `${eq.name} +${eq.enhance}` : '空', { id: eq ? 'equip_' + uid : 'pequipnew_' + slot, value: eq ? '查看' : '穿上' });
  });
});

/* ================= 背包 ================= */
CV.register('bag', function (p) {
  const pool = p.pool || 'item';
  const s = S();
  const u = Core.bagUsage();
  L.btnRow([
    { label: `道具 ${u.itemStacks}/${u.cap}`, id: 'bagpool_item', primary: pool === 'item', size: 12 },
    { label: `材料 ${u.matUsed}/${u.matCap}`, id: 'bagpool_mat', primary: pool === 'mat', size: 12 },
    { label: `装备 ${u.eqUsed}/${u.eqCap}`, id: 'bagpool_equip', primary: pool === 'equip', size: 12 },
  ]);
  const stash = Core.stashCount();
  if (stash) L.row('📮 待领箱', `背包满时收到的 ${stash} 件，点一下领回`, { id: 'stash_claim', value: '领回' });

  if (pool === 'equip') {
    const worn = {};
    Object.values(s.equipped || {}).forEach(sl => Object.values(sl || {}).forEach(uid => { if (uid) worn[uid] = 1; }));
    const list = Core.inventoryEquips().filter(e => !worn[e.uid]).slice(0, 48);
    if (!list.length) L.text('没有未穿戴的装备', { color: CV.C.dim });
    list.forEach(eq => {
      L.row(`${eq.name} +${eq.enhance}`, `${D.EQUIP_SLOTS[eq.slot]}${eq.set ? ' · ' + (D.SETS[eq.set] || {}).name : (eq.classSet ? ' · ' + (D.CLASS_SETS[eq.classSet] || {}).name : '')}${eq.lock ? ' · 🔒' : ''}`, {
        id: 'equip_' + eq.uid, value: eq.rarity, valueColor: CV.rarityColor(eq.rarity),
      });
    });
    L.btn(`扩容 +${D.BAG_EXPAND_SIZE} 格（◈${fmt(D.bagExpandCost(s.bag.eqExpands))}）`, 'expand_equip');
    return;
  }
  const isMat = k => (D.ITEMS[k] || {}).type === 'material';
  const list = Object.keys(s.items).filter(k => s.items[k] > 0 && (pool === 'mat' ? isMat(k) : !isMat(k)));
  if (!list.length) L.text('（空）', { color: CV.C.dim });
  list.forEach(k => {
    const it = D.ITEMS[k];
    L.row(it.name, `${it.desc || ''}`, { id: 'item_' + k, value: '×' + s.items[k] });
  });
  L.btn(`扩容 +${D.BAG_EXPAND_SIZE} 格（◈${fmt(D.bagExpandCost(pool === 'mat' ? s.bag.matExpands : s.bag.itemExpands))}）`, 'expand_' + pool);
});

CV.register('item', function (p) {
  const s = S(), id = p.id, it = D.ITEMS[id];
  if (!it) { L.text('道具不存在'); return; }
  L.text(`${it.name} ×${s.items[id] || 0}`, { size: 17, bold: true });
  L.text(`说明：${it.desc || '-'}\n在哪用：${it.use || '-'}\n去哪弄：${it.src || '-'}`, { size: 12, color: CV.C.dim });
  if (it.type === 'box') {
    L.btnRow([
      { label: '开 1 个', id: 'box_' + id + '_1' },
      { label: '开 10 个', id: 'box_' + id + '_10' },
      { label: '全开', id: 'box_' + id + '_0' },
    ]);
  } else if (it.type === 'exp') {
    L.btn('喂给某位伙伴（＋经验）', 'feedpick_' + id);
  } else if (it.type === 'ticket') {
    L.btn('去招募用掉', 'open_recruit');
  }
});

CV.register('equip', function (p) {
  const s = S(), eq = s.equips[p.uid];
  if (!eq) { L.text('装备不存在'); return; }
  const st = Core.equipStats(eq);
  const cost = Core.enhanceCost(eq);
  const mat = Core.enhanceMat(eq);
  const wearer = Core.equipWearer(eq.uid);
  L.text(`${eq.name} +${eq.enhance}`, { size: 17, bold: true, color: CV.rarityColor(eq.rarity) });
  L.text(`${eq.rarity} · ${D.EQUIP_SLOTS[eq.slot]}${wearer ? ' · ' + Core.charName(wearer) + ' 装备中' : ''}${eq.lock ? ' · 🔒 已锁定' : ''}`, { size: 12, color: CV.C.dim });
  const flat = st.flat;
  L.text(`攻 +${fmt(flat.atk)}　防 +${fmt(flat.def)}　生 +${fmt(flat.hp)}　速 +${fmt(flat.spd)}`, { size: 12 });
  const aff = Object.keys(st.affix);
  if (aff.length) L.text(aff.map(k => `${k} +${(st.affix[k] * (k.indexOf('Pct') >= 0 ? 100 : 1)).toFixed(1)}%`).join('　'), { size: 12, color: CV.C.gold });
  L.title('强化', `+${eq.enhance}/20 · 成功率 ${Math.round(D.ENHANCE_RATE[eq.enhance] * 100)}%`);
  L.text(`消耗：◈${fmt(cost.points)} + ◆${cost.otherworld}${mat.has ? '' : `（无${D.ITEMS[mat.itemId].name}，用 ◈${mat.subPoints} 代用）`}`, { size: 12, color: CV.C.dim });
  L.btn(eq.enhance >= 20 ? '已满强化' : '强化一次', 'enh_' + eq.uid, { disabled: eq.enhance >= 20 });
  L.title('操作');
  L.btnRow([
    { label: eq.lock ? '🔒 解锁' : '🔓 锁定', id: 'lock_' + eq.uid },
    { label: `分解（◆${D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3}）`, id: 'decomp_' + eq.uid, disabled: !!eq.lock },
  ]);
  L.btn('装备给…', 'equipto_' + eq.uid);
});

/* ================= 招募 ================= */
CV.register('recruit', function () {
  const s = S();
  L.text(`今日免费招募：${Core.freeRecruitAvailable() ? '可用' : '已用'}　✦${fmt(s.cur.holy)} ◆${fmt(s.cur.otherworld)} ◈${fmt(s.cur.points)}`, { size: 12, color: CV.C.gold });
  ['normal', 'advanced', 'limited'].forEach(pool => {
    const P = D.RECRUIT_POOLS[pool];
    const tk = Core.ticketOf(pool);
    const pity = Core.pityView(pool);
    L.title(P.name, P.tag);
    L.text(P.desc, { size: 11, color: CV.C.dim });
    L.text(`券：${tk ? `${(D.ITEMS[tk.id] || {}).name} ×${tk.n}` : '无'}${pity ? `　保底：SSR ${pity.ssr.n}/${pity.ssr.cap} · UR ${pity.ur.n}/${pity.ur.cap}${pity.up ? ` · UP ${pity.up.n}/${pity.up.cap}` : ''}` : ''}`, { size: 11, color: CV.C.dim });
    L.btnRow([
      { label: `单抽（${curIconLocal(P.currency)}${P.cost[P.currency]}）`, id: 'pull_' + pool + '_1' },
      { label: `十连（${curIconLocal(P.currency)}${P.ten[P.currency]}）`, id: 'pull_' + pool + '_10', primary: true },
    ]);
  });
  L.title('看广告免费抽', '每天都能薅几次');
  L.btnRow([adBtn('free_recruit', '🎴 普通池×1', 'ad_recruit'), adBtn('recruit_adv', '✦ 高级池×1', 'ad_recruit_adv', true)]);
  L.title('概率公示');
  Object.keys(D.RECRUIT_POOLS).forEach(pool => {
    const P = D.RECRUIT_POOLS[pool];
    L.text(`${P.name}：` + Object.entries(P.rates).map(([r, v]) => `${r} ${(v * 100).toFixed(1)}%`).join('　'), { size: 11, color: CV.C.dim });
  });
});

/* ================= 通用小面板 ================= */
CV.register('grow', function () {
  L.text('养成总览：一个功能一个入口', { size: 12, color: CV.C.dim });
  tileList([
    ['open_keji', '秘术阁', '42 条百分比长线'],
    ['open_fabao', '法宝', '给效果：吸血 / 开场能量 / 减伤'],
    ['open_garden', '药园', '种材料，离线也计时'],
    ['open_arena', '斗法台', '每天 5 次镜像擂台'],
    ['open_mount', '坐骑', '全队基础数值'],
    ['open_refine', '炼化台', '材料 → 血清'],
    ['open_authority', '灯阁权限', '高级货币长线投资'],
    ['open_buildings', '基地建设', '挂机加成'],
    ['open_genelock', '铭刻', '五阶解锁'],
    ['open_beast', '伴生体', '第二条养成线'],
    ['open_reincarn', '转生天赋', '四支永久天赋树'],
    ['open_codex', '灯录', '收集进度与里程碑'],
  ]);
});
CV.register('sect', function () {
  const i = Core.sectInfo();
  L.text(`灯阁评级 Lv.${i.lv}/${i.max}`, { size: 17, bold: true });
  L.text(`打关卡与挂机都会涨（打关卡自动涨，不用手动点）`, { size: 12, color: CV.C.dim });
  L.meter(i.exp / i.need, `${fmt(i.exp)}/${fmt(i.need)}`);
  L.text(`每级全队全属性 +${(i.rate * 100).toFixed(1)}%，当前 +${(i.pct * 100).toFixed(1)}%，下一级 +${(i.nextPct * 100).toFixed(1)}%`, { size: 12, color: CV.C.gold });
});
CV.register('keji', function () {
  const s = S();
  L.text(`秘术阁：用 ◆异界结晶 修长线（现有 ◆${fmt(s.cur.otherworld)}）`, { size: 12, color: CV.C.dim });
  D.KEJI.forEach(k => {
    const lv = Core.kejiLv(k.id), cost = Core.kejiCostOf(k.id);
    L.row(`${k.ico || ''}${k.name} Lv.${lv}/${k.max}`, `${k.info} +${(k.rate * lv * 100).toFixed(1)}%`, {
      id: cost === null ? null : 'keji_' + k.id, value: cost === null ? '满级' : '◆' + fmt(cost),
    });
  });
});
CV.register('fabao', function () {
  const st = Core.fabaoState();
  L.text(`主角带 1 件，给的是效果（现有 ◆${fmt(S().cur.otherworld)}）`, { size: 12, color: CV.C.dim });
  st.list.forEach(f => {
    L.row(`${f.ico || ''}${f.name}${f.active ? ' · 佩戴中' : ''}`, f.desc, {
      id: f.owned ? 'fabao_on_' + f.id : 'fabao_buy_' + f.id,
      value: f.owned ? (f.active ? '已佩戴' : '佩戴') : '◆' + fmt(f.cost),
      valueColor: f.owned ? CV.C.green : CV.C.gold,
    });
  });
});
CV.register('mount', function () {
  const st = Core.mountState();
  L.text(`坐骑给基础数值，全队通用（现有 ◈${fmt(S().cur.points)}）`, { size: 12, color: CV.C.dim });
  st.list.forEach(m => {
    const cost = Object.entries(m.cost).filter(([k]) => k !== 'mat' && k !== 'matN').map(([k, v]) => curIconLocal(k) + fmt(v)).join(' ');
    L.row(`${m.ico || ''}${m.name}${m.active ? ' · 乘骑中' : ''}`, m.desc, {
      id: m.owned ? 'mount_on_' + m.id : 'mount_buy_' + m.id,
      value: m.owned ? (m.active ? '已乘骑' : '乘骑') : cost,
    });
  });
});
CV.register('garden', function () {
  const plots = Core.gardenState();
  L.text('种下 → 到点收材料（离线也计时）；收益约等于投入的 1.2 倍', { size: 12, color: CV.C.dim });
  plots.forEach(p => {
    if (!p.plot) {
      L.row(`第 ${p.idx + 1} 块地`, `空着 · ${p.kind.name}（◈${fmt(p.kind.points)} → ${(D.ITEMS[p.kind.out.item] || {}).name}×${p.kind.out.n}）`, { id: 'plant_' + p.idx, value: '种下' });
    } else if (p.ready) {
      L.row(`第 ${p.idx + 1} 块地`, `${p.kind.name} · 已成熟`, { id: 'harvest_' + p.idx, value: '收获' });
    } else {
      L.row(`第 ${p.idx + 1} 块地`, `${p.kind.name} · 还剩 ${CV.hhmmss(p.leftMs / 1000)}`, { value: '' });
    }
  });
  L.btn('一键全收', 'harvest_all');
});
CV.register('arena', function () {
  const st = Core.arenaState();
  L.text(`斗法台 第 ${st.floor} 台（最高 ${st.best}）`, { size: 17, bold: true });
  L.text(`每天 ${st.cap} 次，赢了升一台，输了退一台（次数照常消耗）`, { size: 12, color: CV.C.dim });
  L.text(`本台奖励：◆${fmt(st.reward.otherworld)} + ♜${st.reward.corridor}`, { size: 12, color: CV.C.gold });
  st.enemies.forEach(e => L.row(e.name, `HP ${fmt(e.hp)} · 攻 ${fmt(e.atk)} · 防 ${fmt(e.def)} · 速 ${e.spd}`, {}));
  L.btn(st.left > 0 ? `挑战第 ${st.floor} 台（剩 ${st.left} 次）` : '今日次数已用完', 'arena_fight', { disabled: st.left <= 0, primary: true });
});
CV.register('sign', function () {
  const st = Core.signState();
  L.text('每天免费摇一次，签文给当天挂机加成 + 一笔硬通货', { size: 12, color: CV.C.dim });
  if (!st.canDraw) L.text(`今日已求：【${st.tier}】${st.pick ? ' ' + st.pick.text : ''}　挂机 +${Math.round(st.idlePct * 100)}%`, { size: 13, color: CV.C.gold });
  L.btn(st.canDraw ? '求签' : '明日再来', 'sign_draw', { disabled: !st.canDraw, primary: true });
  L.title('概率公示');
  D.SIGNS.forEach(s => L.text(`${s.tier}　${(s.p * 100).toFixed(0)}%　${s.text}（挂机+${Math.round(s.idlePct * 100)}%）`, { size: 11, color: CV.C.dim }));
});
CV.register('authority', function () {
  const i = Core.authorityInfo();
  L.text(`灯阁权限 Lv.${i.lv}/${i.max}`, { size: 17, bold: true });
  L.text('用 ✦圣洁晶石 + ◆异界结晶 的长线投资，永久生效，转生不清空', { size: 12, color: CV.C.dim });
  if (!i.maxed) {
    L.text(`下一级：${i.nextDesc}`, { size: 12, color: CV.C.gold });
    L.text(`花费：✦${i.cost.holy} + ◆${i.cost.otherworld}`, { size: 12, color: CV.C.dim });
    L.btn('提升权限', 'auth_up', { primary: true });
  }
  L.title('全部等级');
  i.rows.forEach((r, idx) => L.text(`Lv.${idx + 1} ${r.desc}`, { size: 11, color: idx < i.lv ? CV.C.green : CV.C.dim }));
});
CV.register('buildings', function () {
  const s = S();
  D.BUILDINGS.forEach(b => {
    const lv = s.buildings[b.id];
    L.row(`${b.name} Lv.${lv}/50`, b.desc, { id: 'build_' + b.id, value: '◈' + fmt(D.buildingCost(b.id, lv)) });
  });
});
CV.register('genelock', function () {
  const s = S(), info = Core.geneLockInfo();
  L.text(`铭刻 ${s.player.geneLock}/5 阶`, { size: 17, bold: true });
  L.text('每一阶永久强化全队，转生保留', { size: 12, color: CV.C.dim });
  if (info.max) L.text('已完全解锁', { size: 13, color: CV.C.green });
  else {
    L.text(`下一阶：${info.next.name}　需要：${info.reqs.length ? info.reqs.join('；') : '条件已满足'}`, { size: 12, color: info.can ? CV.C.green : CV.C.gold });
    L.btn('解锁下一阶', 'genelock_up', { disabled: !info.can, primary: true });
  }
  [1, 2, 3, 4, 5].forEach(n => {
    const g = D.GENE_LOCKS[n - 1];
    if (g) L.text(`${n} 阶 ${g.name}：${g.desc}`, { size: 11, color: n <= s.player.geneLock ? CV.C.green : CV.C.dim });
  });
});
CV.register('beast', function () {
  const st = Core.beastState();
  L.text(`伴生体 已孵化 ${st.count} 只 · 兽魂石 ${st.eggs}（孵一次要 ${st.eggCost}）`, { size: 12, color: CV.C.gold });
  L.text('随行一只，全队加成 + 金木水火土克制（带对属性进本 +15% 伤害）', { size: 12, color: CV.C.dim });
  L.btnRow([
    { label: '孵化 1 只', id: 'hatch_1', disabled: !st.canHatch },
    { label: '孵化 10 只', id: 'hatch_10', disabled: st.eggs < st.eggCost * 10 },
  ]);
  st.list.forEach(x => {
    const pct = Object.entries(x.pct).map(([k, v]) => `${D.BEAST_PCT_NAME[k] || k}+${(v * 100).toFixed(1)}%`).join(' ');
    L.row(`${D.ELEMENT_ICON[x.b.elem] || ''}${x.b.name}（${x.b.rarity}）${x.active ? ' · 随行中' : ''} Lv.${x.lv}`, `${pct} · 兽魂 ${x.soul}`, {
      id: 'beast_' + x.id, value: x.active ? '已随行' : '随行',
    });
  });
});
CV.register('reincarn', function () {
  const s = S();
  L.text(`转生 ${s.player.reincarnations} 世 · 转生点 ♾${fmt(s.cur.rp)}`, { size: 17, bold: true });
  L.text('四支天赋树，40 个节点全部实装；转生点永久保留', { size: 12, color: CV.C.dim });
  if (Core.canReincarnate()) L.btn('♾ 立即转生（重来但更强）', 'do_reincarn', { primary: true });
  else L.text('转生条件：玩家 Lv.100 + 铭刻 5 阶 + 灯芯 Lv.30', { size: 12, color: CV.C.dim });
  Object.keys(D.TALENTS).forEach(branch => {
    const t = D.TALENTS[branch], lv = s.player.talents[branch];
    L.title(`${t.name}`, `${lv}/10 · ${t.desc}`);
    t.nodes.forEach((n, i) => {
      L.text(`${i + 1}. ${n.text}${i < lv ? ' ✔' : ''}`, { size: 11, color: i < lv ? CV.C.green : CV.C.dim });
    });
    const cost = D.TALENT_COSTS[lv];
    L.btn(lv >= 10 ? '已满级' : `升下一级（♾${cost}）`, 'talent_' + branch, { disabled: lv >= 10 });
  });
});
CV.register('codex', function () {
  const c = Core.codexState();
  L.text(`灯录 ${c.owned}/${c.total}`, { size: 17, bold: true });
  L.meter(c.owned / c.total);
  c.rewards.forEach(r => {
    L.row(`收集 ${r.n} 名`, '里程碑奖励', { id: r.reached && !r.claimed ? 'codex_' + r.n : null, value: r.claimed ? '已领' : (r.reached ? '领取' : '未达成') });
  });
});
CV.register('refine', function () {
  const s = S();
  L.text(`炼化台：材料 + 点数 → 血清（永久强化剂）　现有 ◈${fmt(s.cur.points)}`, { size: 12, color: CV.C.dim });
  D.SERUMS.forEach(sd => {
    const have = s.items[D.SERUM_ITEM(sd.id)] || 0;
    L.row(`${sd.name}${sd.bloodline ? '（限' + sd.bloodline + '）' : ''}`, `${sd.desc}　已有 ${have} 支 · 用 ${(D.ITEMS[sd.mat] || {}).name}×${sd.matN} + ◈${fmt(sd.points)}`, {
      id: 'craft_' + sd.id, value: '炼化',
    });
  });
  L.title('喂血清（给主角）');
  D.SERUMS.forEach(sd => {
    const id = D.SERUM_ITEM(sd.id);
    if ((s.items[id] || 0) > 0) L.row(sd.name, `给主角用（已服 ${Core.serumTaken('@player', sd.id)}/${sd.max}）`, { id: 'serum_p_' + sd.id, value: '使用' });
  });
});
CV.register('idlelines', function () {
  L.text('4 条产线各派 1 名领队（上阵主力不能派）', { size: 12, color: CV.C.dim });
  Core.idleLines().forEach(row => {
    const l = row.line;
    L.row(`${l.ico} ${l.name}`, row.leaderId ? `${Core.charName(row.leaderId)} · ${l.attrName} ${row.attrValue} · ${row.per}` : `未派领队 · ${l.desc}`, {
      id: 'line_' + l.id, value: row.leaderId ? '换人' : '派谁',
    });
  });
});
CV.register('tasks', function () {
  const s = S(), t = Core.todayState();
  L.title('每日任务', `${t.dailyDone}/${t.dailyTotal}`);
  D.DAILY_TASKS.forEach(dt => {
    const prog = s.tasks.daily[dt.id] || 0, done = prog >= dt.target, claimed = !!s.tasks.claimed[dt.id];
    L.row(dt.name, `进度 ${Math.min(prog, dt.target)}/${dt.target}`, {
      id: done && !claimed ? 'task_' + dt.id : null, value: claimed ? '已领' : (done ? '领取' : ''),
    });
  });
  L.btn('领取全部已完成', 'task_all');
  L.title('周常', `周一重置`);
  Core.weeklyState().forEach(w => {
    L.row(w.t.name, `进度 ${Math.min(w.prog, w.t.target)}/${w.t.target}`, {
      id: w.done && !w.claimed ? 'weekly_' + w.t.id : null, value: w.claimed ? '已领' : (w.done ? '领取' : ''),
    });
  });
  L.btn('领取周常全清奖励', 'weekly_all');
  L.title('成就');
  Core.achievementState().forEach(a => {
    L.row(a.a.name, `${a.a.cat} · ${a.a.desc}`, {
      id: a.done && !a.claimed ? 'ach_' + a.a.id : null, value: a.claimed ? '已领' : (a.done ? '领取' : ''),
    });
  });
});
CV.register('bounty', function () {
  const st = Core.bountyState();
  L.text('按你的当前进度生成，到点作废；过期后可开新一期', { size: 12, color: CV.C.dim });
  st.list.forEach(x => {
    const left = x.expired ? '已过期' : `剩 ${CV.hhmmss(x.leftMs / 1000)}`;
    L.row(x.b.name, `${x.b.desc || ''} · ${left}`, {
      id: x.done && !x.claimed && !x.expired ? 'bounty_' + x.b.id : null,
      value: x.claimed ? '已领' : (x.expired ? '作废' : (x.done ? '领取' : '进行中')),
    });
  });
  if (st.allOver) L.btn('开新一期悬赏', 'bounty_renew', { primary: true });
});
CV.register('shop', function () {
  const s = S();
  ['god', 'otherworld', 'story', 'corridor'].forEach(key => {
    const shop = D.SHOPS[key];
    if (!shop) return;
    L.title(shop.name, '◈/◆/❖/♜ 计价');
    shop.items.forEach((it, idx) => {
      const avail = Core.shopReq(it);
      const bought = s.shop.bought[`${key}_${idx}_${Core.dailyDate()}`] || 0;
      const soldout = it.stock > 0 && bought >= it.stock;
      const price = (D.CURRENCIES.find(c => c.id === shop.currency) || {}).icon || '';
      L.row(it.name, avail.ok ? (it.stock > 0 ? `今日剩 ${Math.max(0, it.stock - bought)}/${it.stock}` : '') : '🔒 ' + avail.req, {
        id: avail.ok && !soldout ? `buy_${key}_${idx}` : null,
        value: soldout ? '售罄' : price + fmt(it.price),
      });
    });
  });
});
CV.register('guide', function () {
  D.GUIDE_CHAPTERS.forEach(ch => {
    L.title(ch.t || ch.title || '章节');
    L.text(ch.body || ch.desc || '', { size: 12, color: CV.C.dim });
  });
});
CV.register('settings', function () {
  const s = S();
  L.title('设置');
  const sw = (k, name) => L.row(name, '', { id: 'toggle_' + k, value: s.settings[k] !== false ? '开' : '关' });
  sw('sfx', '音效');
  sw('autoBattle', '自动战斗（直接出结果）');
  sw('autoNext', '结算自动进下一关');
  sw('confirmBig', '大额消费二次确认');
  sw('autoSellN', 'N 装自动分解');
  sw('autoSellR', 'R 装自动分解');
  L.title('存档');
  L.btn('导出存档（复制到剪贴板）', 'save_export');
  L.btn('删除进度并重开', 'save_wipe');
  L.title('关于');
  L.text('残域（微信小游戏版）', { size: 12, color: CV.C.dim });
  L.text('个人开发 · 广告变现版 · 数据全部存在本机', { size: 11, color: CV.C.dim });
});

module.exports = {
  startStage, startBattle, buildAllies, finishBattle,
  battle: () => battle,
  armPreBuff: () => { preBuff = 0.25; },
  hasPreBuff: () => preBuff > 0,
};
