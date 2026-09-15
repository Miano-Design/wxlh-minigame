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
/* 网页版那套三列文字宫格（养成 / 日常 / 其他都是它）；items 是 [id, 名字, 状态, 是否红点] */
function tileGrid3(items) {
  L.tiles(items.map(([id, name, sub, dot]) => ({ id, label: name, sub: sub || '', dot: !!dot })), 3);
}
/* 广告按钮的统一拼法：把"今天还剩几次"直接写在按钮上，玩家一眼知道还能薅几次 */
function adBtn(slot, label, id, primary) {
  const left = G.AD.left(slot);
  return { label: left > 0 ? `${label}（${left}）` : `${label}·今日已完`, id, primary: !!primary, disabled: left <= 0, size: 12 };
}
let preBuff = 0;   // 战前增益：看一次广告，下一关全队攻击 +25%
function takePreBuff() { const v = preBuff; preBuff = 0; return v; }

/* ================= 灯阁（首页） ================= */
/* 新手引导：照网页版那套"上手三件事"讲清楚（网页版是弹窗，这里做成第一屏） */
CV.register('welcome', function () {
  L.spacer(10);
  L.text('欢迎来到灯阁', { size: 22, bold: true, align: 'center', color: CV.C.gold });
  L.spacer(8);
  L.text('你被神秘存在选中，成为了「执灯者」。\n在这里，你要进残域执行探索、招募伙伴、绕着灯阁一层层往上爬。', { size: 12, color: CV.C.dim, align: 'center' });
  L.spacer(10);
  L.title('上手就三件事');
  L.row('① 选一条血统', '境界线跟着血统走，选定不能改', {});
  L.row('② 点「一键收取」', '把挂机、任务、成就、悬赏一次领完', {});
  L.row('③ 进残域打第 1 关', '通关后解锁招募，招募每天有一次免费', {});
  L.spacer(6);
  L.title('三张招募池花三种货币');
  L.text('◈点数抽普通（攒碎片） · ✦圣洁晶石抽高级（补图鉴） · ◆异界结晶抽限定（定向出当期 UP）', { size: 11, color: CV.C.dim });
  L.spacer(8);
  L.btn('签订灯阁契约', 'welcome_ok', { primary: true });
});

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
  tileGrid3([
    ['open_grow', '灯阁评级', `Lv.${sect.lv} · +${(sect.pct * 100).toFixed(1)}%`],
    ['open_keji', '秘术阁', `已修 ${D.KEJI.reduce((a, k) => a + Core.kejiLv(k.id), 0)} 级`],
    ['open_fabao', '法宝', `${Core.fabaoState().own.length}/${D.FABAO.length} 件`],
    ['open_garden', '药园', `${Core.gardenState().filter(x => x.plot).length} 块在用`],
    ['open_arena', '斗法台', `第 ${Core.arenaState().floor} 台 · 剩 ${Core.arenaState().left}`],
    ['open_mount', '坐骑', `${Core.mountState().own.length}/${D.MOUNTS.length} 匹`],
    ['open_refine', '炼化台', '材料 → 血清'],
    ['open_authority', '灯阁权限', `Lv.${Core.authorityInfo().lv}/${Core.authorityInfo().max}`],
    ['open_buildings', '基地建设', `合计 Lv.${bLv}`],
    ['open_genelock', '铭刻', s.player.geneLock ? `${s.player.geneLock} 阶` : '未解锁'],
    ['open_beast', '伴生体', Object.keys(s.beast.owned || {}).length + ' 只'],
    ['open_reincarn', '转生天赋', `${s.player.reincarnations} 世`],
    ['open_codex', '灯录', `${Core.codexState().owned}/${Core.codexState().total}`],
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
  CV.fillPanel(12, L.y, CV.W - 24, 96);
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
  tileGrid3([
    ['open_login', '今日签到', `七日登录 · 第 ${s.login.day || 0}/7 天`],
    ['open_bounty', '限时悬赏', '按进度生成 · 到点作废'],
    ['open_tasks', '每日任务', `今日 ${t.dailyDone}/${t.dailyTotal}`],
    ['open_achievements', '成就', `${t.achClaimable} 项可领`],
    ['open_sign', '求签', Core.signState().canDraw ? '今日还没求' : `今日【${Core.signState().tier}】`],
    ['open_recruit', '招募伙伴', Core.freeRecruitAvailable() ? '今日免费 1 抽' : '攒碎片升星'],
    ['open_shop', '兑换大厅', '三档商店'],
  ]);
  L.title('其他');
  tileGrid3([
    ['open_chars', '伙伴一览', `${Object.keys(s.chars).length} 名`],
    ['open_curdoc', '货币图鉴', `${D.CURRENCIES.length} 种货币`],
    ['open_alts', '多主角', `${Core.protagonistList().length} 个角色`],
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
let battle = null;        // 当前这一波的播放状态
let stageRun = null;      // 一整关（1~3 波）的进度：血量继承、累计掉落、阵亡次数

/* 单位卡片：名字 + 血条 + 百分比（和网页版的战场格子一个意思） */
function battleUnit(u, x, y, w) {
  const h = 78;
  const dead = u.hp <= 0;
  // 出手 / 挨打的高亮：让"这一下是谁打的、打在谁身上"在画面上一眼看得出
  const now = Date.now();
  const acting = battle && battle.actingUid === u.uid && now - (battle.actingAt || 0) < 420;
  const hit = battle && battle.hitUid === u.uid && now - (battle.hitAt || 0) < 260;
  const line = hit ? CV.C.red : acting ? CV.C.gold : (u.isBoss ? CV.C.accent : CV.C.line);
  CV.fillPanel(x, y, w, h, { fill: hit ? '#2a1a20' : (dead ? '#12161d' : CV.C.panel2), line, r: 10 });
  if (acting) { CV.ctx.strokeStyle = CV.C.gold; CV.ctx.lineWidth = 2; rrectL(x, y, w, h, 10); CV.ctx.stroke(); }
  const nm = u.name.length > 4 ? u.name.slice(0, 4) : u.name;
  CV.drawText(nm, x + w / 2, y + 14, { size: 11, align: 'center', color: dead ? CV.C.dim : (u.isBoss ? CV.C.accent : CV.C.text), bold: !!u.isBoss });
  const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
  const bw = w - 12, bh = 8;
  CV.ctx.fillStyle = '#0f141d';
  rrectL(x + 6, y + 26, bw, bh, 4); CV.ctx.fill();
  CV.ctx.fillStyle = dead ? '#3a2027' : (pct < 0.35 ? CV.C.red : (u.side === 'enemy' ? '#e06666' : CV.C.green));
  if (pct > 0) { rrectL(x + 6, y + 26, Math.max(2, bw * pct), bh, 4); CV.ctx.fill(); }
  CV.drawText(`${Math.round(pct * 100)}%`, x + w / 2, y + 44, { size: 10, align: 'center', color: dead ? CV.C.dim : CV.C.dim });
  if (dead) CV.drawText('倒下', x + w / 2, y + 62, { size: 10, align: 'center', color: CV.C.dim });
  else if (u.side === 'ally') CV.drawText(u.position === 'front' ? '前排' : '后排', x + w / 2, y + 62, { size: 10, align: 'center', color: CV.C.dim });
  if (battle) battle.rects[u.uid] = { x, y, w, h };      // 记下位置，飘字才知道往哪飘
}
function rrectL(x, y, w, h, r) {
  const c = CV.ctx;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

CV.register('battle', function () {
  if (!battle) { L.text('战斗数据丢失，返回重进'); return; }
  const b = battle;
  const allies = b.order.filter(uid => b.units[uid].side === 'ally');
  const foes = b.order.filter(uid => b.units[uid].side === 'enemy');
  // 标题行
  CV.drawText(b.spec.title, 16, L.y + 10, { size: 14, bold: true });
  CV.drawText(`第 ${b.round || 1} 回合`, CV.W - 16, L.y + 10, { size: 12, align: 'right', color: CV.C.dim });
  L.y += 26;
  // 敌方
  CV.drawText('敌方', 16, L.y + 8, { size: 11, color: CV.C.dim });
  L.y += 18;
  const fw = Math.min(64, Math.floor((CV.W - 32 - (foes.length - 1) * 6) / Math.max(1, foes.length)));
  foes.forEach((uid, i) => battleUnit(b.units[uid], 16 + i * (fw + 6), L.y, fw));
  L.y += 86;
  // 我方：后排在上、前排在下（和战场的视觉一致）
  const aw = Math.min(64, Math.floor((CV.W - 32 - (allies.length - 1) * 6) / Math.max(1, allies.length)));
  ['back', 'front'].forEach(row => {
    const list = allies.filter(uid => (b.units[uid].position === 'front' ? 'front' : 'back') === row);
    if (!list.length) return;
    CV.drawText(row === 'front' ? '我方前排 · 挨打优先' : '我方后排', 16, L.y + 8, { size: 11, color: CV.C.dim });
    L.y += 18;
    list.forEach((uid, i) => battleUnit(b.units[uid], 16 + i * (aw + 6), L.y, aw));
    L.y += 86;
  });
  // 飘字（在对应单位上方浮一会儿）
  const now = Date.now();
  b.floaters = b.floaters.filter(f => now - f.at < 900);
  b.rects = b.rects || {};
  // 技能名：顶在出手单位头上（配合金边，看清「他放了什么」）
  if (b.skillUid && now - (b.skillAt || 0) < 900) {
    const rc = b.rects[b.skillUid];
    if (rc) CV.drawText(`【${b.skillName}】`, rc.x + rc.w / 2, rc.y - 28, { size: 12, align: 'center', color: CV.C.gold, bold: true });
  }
  // Boss 阶段 / 复活：中间一条横幅
  if (b.banner && now - (b.bannerAt || 0) < 2000) {
    const bw = CV.W - 60, by = CV.TOP + 148;
    CV.ctx.fillStyle = 'rgba(20,26,36,.92)';
    rrectL(30, by, bw, 34, 10); CV.ctx.fill();
    CV.ctx.strokeStyle = CV.C.accent; CV.ctx.stroke();
    CV.drawText(b.banner, CV.W / 2, by + 17, { size: 13, align: 'center', color: CV.C.accent, bold: true });
  }
  b.floaters.forEach(f => {
    const rc = b.rects[f.uid];
    if (!rc) return;
    const k = (now - f.at) / 900;
    const color = f.cls === 'crit' ? CV.C.gold : f.cls === 'heal' ? CV.C.green : f.cls === 'miss' ? CV.C.dim : CV.C.red;
    CV.drawText(f.text, rc.x + rc.w / 2, rc.y - 8 - k * 18, { size: f.cls === 'crit' ? 13 : 11, align: 'center', color, bold: true });
  });
  // 控制条
  L.btnRow([
    { label: `${b.speed}× 速度`, id: 'battle_speed', size: 12 },
    { label: b.done ? '已结束' : '⏩ 跳过', id: b.done ? null : 'battle_skip', disabled: b.done, size: 12 },
  ]);
  // 战备补给（只在"整关连打"时有意义：药剂作用于下一波进场）
  if (stageRun && !b.done) {
    const lastWave = stageRun.wave >= stageRun.waves.length - 1;
    if (lastWave) CV.drawText('收官战 · 药剂要到下一关才生效（每关开局满血）', 16, L.y + 10, { size: 11, color: CV.C.dim });
    else CV.drawText('战备补给 · 喝了从下一波进场生效', 16, L.y + 10, { size: 11, color: CV.C.dim });
    L.y += 24;
    if (!lastWave) {
      const pots = Object.keys(D.ITEMS).filter(k => D.ITEMS[k].type === 'consumable' && D.ITEMS[k].where === 'explore' && (S().items[k] || 0) > 0);
      if (pots.length) {
        const row = pots.slice(0, 3).map(k => ({ label: `${(D.ITEMS[k].effect || {}).healPct ? '🧪' : '💉'}${D.ITEMS[k].name}×${S().items[k]}`, id: 'bpotion_' + k, size: 11 }));
        L.btnRow(row);
      } else CV.drawText('（背包里没有探索消耗品）', 16, L.y + 8, { size: 11, color: CV.C.dim });
    }
  }
  // 战报
  L.title('战报');
  b.log.slice(-6).forEach(line => L.text(line, { size: 11, color: CV.C.dim }));
  // 结果
  if (b.done) {
    L.spacer(6);
    L.text(b.res.win ? '✔ 本波胜利' : '✘ 本波失败', { size: 16, bold: true, align: 'center', color: b.res.win ? CV.C.green : CV.C.red });
    const acts = (b.outcome && (b.outcome.actions || [b.outcome])) || [];
    acts.filter(Boolean).forEach((a, i) => {
      L.btn(a.label, a.id || ('battle_act_' + i), { primary: !!a.primary, disabled: !!a.disabled });
    });
    if (b.outcome && b.outcome.note) L.text(b.outcome.note, { size: 11, color: CV.C.dim, align: 'center' });
  }
});

function startBattle(spec) {
  const allies = spec.allies || buildAllies(spec.hpMap, spec.extraAtk) || [];
  if (!allies.length) { CV.toast('全队重伤，先恢复再战'); return; }
  const enemies = spec.enemies || Dungeon.makeEnemies(spec.worldId, spec.diff, spec.stage, spec.kind);
  const res = Battle.run({
    allies, enemies, worldId: spec.worldId,
    maxRounds: spec.maxRounds || (spec.kind === 'boss' ? 50 : 30),
    allyHitMod: (Battle.MECHANICS[spec.worldId] || {}).allyHitMod || 0,
  });
  const units = {}, order = [];
  res.frames[0].allies.concat(res.frames[0].enemies).forEach(u => { units[u.uid] = Object.assign({}, u); order.push(u.uid); });
  battle = {
    spec, res, units, order, idx: 0, round: 0, log: [], floaters: [], rects: {},
    speed: S().settings.speed || 1, done: false, outcome: null, doneAt: 0,
  };
  pushLog(battle, `⚔ ${spec.title}`);
  CV.reset('battle');
}

function pushLog(b, line) { b.log.push(line); if (b.log.length > 200) b.log.shift(); }
function nmOf(b, uid) { return (b.units[uid] && b.units[uid].name) || '?'; }
function addFloater(b, uid, text, cls) { b.floaters.push({ uid, text, cls, at: Date.now() }); if (b.floaters.length > 12) b.floaters.shift(); }

/* 把一帧结算到界面上（和网页版 applyFrame 同一套口径） */
function applyFrame(b, f) {
  const U = b.units;
  switch (f.type) {
    case 'round': b.round = f.n; if (f.n <= 3 || f.n % 5 === 0) pushLog(b, `—— 第 ${f.n} 回合 ——`); break;
    case 'attack': break;
    case 'skill':
      b.actingUid = f.actor; b.actingAt = Date.now();
      b.skillUid = f.actor; b.skillName = f.name; b.skillAt = Date.now();
      pushLog(b, `✨ ${nmOf(b, f.actor)} 使用【${f.name}】`);
      break;
    case 'damage': {
      const u = U[f.target];
      b.hitUid = f.target; b.hitAt = Date.now();
      b.actingUid = f.source; b.actingAt = Date.now();
      if (u) u.hp = Math.max(0, u.hp - f.dmg);
      addFloater(b, f.target, (f.crit ? '暴击 ' : '-') + fmt(f.dmg), f.crit ? 'crit' : 'dmg');
      if (f.healed) { const s = U[f.source]; if (s) { s.hp = Math.min(s.maxHp, s.hp + f.healed); addFloater(b, f.source, '+' + fmt(f.healed), 'heal'); } }
      if (f.killed) pushLog(b, `💀 ${nmOf(b, f.target)} 倒下`);
      break;
    }
    case 'dot': { const u = U[f.target]; if (u) u.hp = Math.max(0, u.hp - f.dmg); addFloater(b, f.target, '-' + fmt(f.dmg), 'dmg'); if (f.killed) pushLog(b, `💀 ${nmOf(b, f.target)} 倒下`); break; }
    case 'heal': { const u = U[f.target]; if (u) u.hp = Math.min(u.maxHp, u.hp + f.amount); addFloater(b, f.target, '+' + fmt(f.amount), 'heal'); break; }
    case 'shield': addFloater(b, f.target, '🛡+' + fmt(f.amount), 'heal'); break;
    case 'dodge': addFloater(b, f.target, '闪避', 'miss'); break;
    case 'skip': pushLog(b, `😵 ${nmOf(b, f.actor)} 无法行动`); break;
    case 'buff': addFloater(b, f.target, '↑ ' + f.name, 'heal'); break;
    case 'revive': { const u = U[f.boss]; if (u) u.hp = Math.round(u.maxHp * 0.3); pushLog(b, `♻ ${f.text}`); break; }
    case 'summon': if (f.enemy) { U[f.enemy.uid] = Object.assign({}, f.enemy); b.order.push(f.enemy.uid); } pushLog(b, `🕯 ${f.text}`); break;
    case 'phase': b.banner = f.text; b.bannerAt = Date.now(); pushLog(b, `🔥 ${f.text}`); break;
    case 'rule': pushLog(b, `👁 ${f.text}`); break;
    case 'nearDeath': addFloater(b, f.target, '⚠ 濒死', 'crit'); break;
    default: break;
  }
}

/* 主循环每 120ms 调一次：按倍速推进若干帧 */
function tickBattle() {
  const b = battle;
  if (!b) return null;
  if (b.done) {
    const o = b.outcome;
    if (o && o.auto && Date.now() - b.doneAt >= (o.autoMs || 900)) { const fn = o.auto; b.outcome = null; fn(); }
    return b;
  }
  const n = Math.max(1, Math.round(2.5 * (b.speed || 1)));
  for (let i = 0; i < n && b.idx < b.res.frames.length; i++) applyFrame(b, b.res.frames[b.idx++]);
  if (b.idx >= b.res.frames.length) finishBattle();
  return b;
}

CV.on('battle_speed', () => {
  if (!battle) return;
  battle.speed = battle.speed >= 3 ? 1 : battle.speed + 1;
  S().settings.speed = battle.speed;
  Core.save();
  CV.toast(`${battle.speed}× 速度`);
});
CV.on('battle_skip', () => {
  if (!battle) return;
  while (battle.idx < battle.res.frames.length) applyFrame(battle, battle.res.frames[battle.idx++]);
  finishBattle();
});
CV.on('battle_after', () => {
  const b = battle;
  if (!b || !b.outcome) return;
  const a = (b.outcome.actions || [b.outcome])[0];
  if (a && a.run) { b.outcome = null; a.run(); }
});
CV.on('battle_next', () => { const b = battle; if (b && b.outcome && b.outcome.auto) { const fn = b.outcome.auto; b.outcome = null; fn(); } });
CV.onPrefix('bpotion_', id => {
  const key = id.slice(8);
  if (!stageRun || !battle) return;
  if (!Core.removeItem(key)) { CV.toast('道具不足'); return; }
  const eff = (D.ITEMS[key] || {}).effect || {};
  const parts = [];
  if (eff.healPct) {
    let down = 0;
    Object.keys(stageRun.hp).forEach(cid => {
      if (stageRun.hp[cid] <= 0.01) { down++; return; }
      stageRun.hp[cid] = Math.min(1, stageRun.hp[cid] + eff.healPct);
    });
    parts.push(`全队恢复 ${Math.round(eff.healPct * 100)}% 生命${down ? `（${down} 名已阵亡，不复活）` : ''}`);
  }
  ['atkPct', 'spdPct', 'defPct'].forEach(k => {
    if (!eff[k]) return;
    stageRun.buffs = stageRun.buffs || {};
    stageRun.buffs[k] = (stageRun.buffs[k] || 0) + eff[k];
    parts.push(`${D.CONSUMABLE_TAG[k] || k} +${Math.round(eff[k] * 100)}%`);
  });
  Core.task('item1', 1);
  Core.save();
  CV.toast(`${D.ITEMS[key].name}：${parts.join(' · ')}（下一波进场生效）`);
});

function finishBattle() {
  if (!battle || battle.done) return;
  battle.done = true;
  battle.doneAt = Date.now();
  const spec = battle.spec;
  if (!battle.res.win) {
    pushLog(battle, '✘ 本波失败');
    if (spec.onLose) { battle.outcome = spec.onLose(battle); return; }
    battle.outcome = { actions: [{ label: '返回', id: 'battle_after', run: () => CV.reset(spec.back || 'worlds') }] };
    return;
  }
  pushLog(battle, '✔ 本波胜利');
  if (spec.onWin) { battle.outcome = spec.onWin(battle.res, battle.units); return; }
  battle.outcome = { actions: [{ label: '返回', id: 'battle_after', run: () => CV.reset('worlds') }] };
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
  const hp = {};
  s.party.filter(Boolean).forEach(id => { hp[id] = 1; });
  stageRun = {
    worldId, diff, stageIdx, stage,
    waves: Dungeon.wavePlan(stage),   // 1~4 关 1 波、5~8 关 2 波、9~12 关 3 波
    wave: 0, hp, got: [], rounds: 0, deaths: 0,
    extraAtk: takePreBuff(),          // 战前增益（看广告来的）只吃这一关
    buffs: null,
  };
  runWave();
}

/* 打当前这一波（网页版是"点进去就打、波间无缝连打"，这里同一套） */
function runWave() {
  const r = stageRun;
  if (!r) return;
  const kind = r.waves[r.wave];
  const w = D.WORLDS.find(x => x.id === r.worldId);
  const label = { combat: '遭遇战', elite: '精英伏击', boss: '守关之战' }[kind] || '';
  startBattle({
    title: `${w ? w.name : r.worldId} 第 ${r.stage}/12 关 · 第 ${r.wave + 1}/${r.waves.length} 波 · ${label}`,
    worldId: r.worldId, kind, hpMap: r.hp, extraAtk: r.extraAtk,
    enemies: Dungeon.makeEnemies(r.worldId, r.diff, r.stage, kind),
    maxRounds: kind === 'boss' ? 50 : 30,
    back: 'world',
    onWin: (res, units) => afterWave(res, units),
    onLose: () => ({
      actions: [
        { label: '📺 复活再战（全队回 50%）', primary: true, run: reviveStage },
        { label: '放弃这一关', run: () => { stageRun = null; battle = null; CV.reset('world'); } },
      ],
      note: '复活后从这一波重打；已经拿到的奖励不会丢',
    }),
  });
}

/* 一波打完：写回血量、结算掉落、无缝接下一波 */
function afterWave(res, units) {
  const r = stageRun;
  if (!r) return { actions: [{ label: '返回', run: () => CV.reset('worlds') }] };
  Object.values(units).forEach(u => {
    if (u.side === 'ally' && u.charId !== undefined) r.hp[u.charId] = Math.max(0, u.hp / u.maxHp);
  });
  if (Object.values(units).some(u => u.side === 'ally' && u.hp <= 0)) r.deaths++;
  const kind = r.waves[r.wave];
  const g = Dungeon.grantRewards(r.worldId, r.diff, r.stage, kind);
  Core.addCharExp(S().party.filter(Boolean), g.rewards.exp);
  Core.addPlayerBattleExp(Math.round(g.rewards.exp * 0.5));
  Core.battleSettle({}, true, kind === 'boss');
  g.got.forEach(x => r.got.push(x));
  r.rounds += res.rounds;
  Core.save();
  r.wave++;
  if (r.wave < r.waves.length) {
    // 还有下一波：停一下直接接上，不用再点一次"开打"
    return { auto: runWave, autoMs: 1100, note: `第 ${r.wave}/${r.waves.length} 波通过，接着打下一波…` };
  }
  // 最后一波：结算整关
  const stars = 1 + (r.deaths ? 0 : 1) + (r.rounds <= 20 ? 1 : 0);
  const comp = Core.stageComplete(r.worldId, r.diff, r.stageIdx, stars);
  Core.clearPendingRun();
  Core.save();
  G.AD.interstitial();
  const data = {
    worldId: r.worldId, diff: r.diff, stageIdx: r.stageIdx, stars,
    rounds: r.rounds, gotAll: r.got, first: comp.firstClearReward, unlocks: comp.newUnlocks,
  };
  stageRun = null;
  return { auto: () => { battle = null; CV.reset('stageresult', data); }, autoMs: 1200, note: '通关！正在结算…' };
}

/* 看广告复活：全队至少 50% 血，从当前这一波重打 */
function reviveStage() {
  if (!stageRun) { battle = null; CV.reset('worlds'); return; }
  Object.keys(stageRun.hp).forEach(cid => { stageRun.hp[cid] = Math.max(stageRun.hp[cid], 0.5); });
  battle = null;
  runWave();
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
  attributePanel(eff, '伙伴');
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
  L.btnRow([
    { label: '🔒 铭刻', id: 'open_genelock', size: 12 },
    { label: '⚗️ 炼化台（血清）', id: 'open_refine', size: 12 },
  ]);
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

/* 十项属性面板（网页版那一屏总览，角色卡与主角卡共用） */
function attributePanel(st, who) {
  L.title('属性面板', who + '当前生效值');
  const rows = [
    ['攻击', fmt(st.atk)], ['防御', fmt(st.def)], ['生命', fmt(st.hp)], ['速度', fmt(st.spd)],
    ['暴击率', (st.crit * 100).toFixed(1) + '%'], ['暴击伤害', (st.critDmg || 2).toFixed(2) + '×'],
    ['闪避', (st.eva * 100).toFixed(1) + '%'], ['技能倍率', (st.skillMult || 1).toFixed(2)],
    ['吸血', ((st.lifesteal || 0) * 100).toFixed(1) + '%'], ['异常抗性', ((st.resPct || 0) * 100).toFixed(1) + '%'],
  ];
  rows.forEach(([k, v]) => L.row(k, '', { value: v }));
  if (st.attrs) {
    L.title('六维');
    const A = st.attrs;
    L.text(D.ATTR_META.map(a => `${a.name} ${Math.round(A[a.id] || 0)}`).join('　'), { size: 12, color: CV.C.dim });
  }
}

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

  /* 三池都是格子制（与网页版一致）：5 列格子，最后一格是「＋扩容」。
     装备在批量分解态下，格子本身就是勾选框。 */
  if (pool === 'equip') {
    const worn = {};
    Object.values(s.equipped || {}).forEach(sl => Object.values(sl || {}).forEach(uid => { if (uid) worn[uid] = 1; }));
    const list = equipListFiltered(worn);
    L.btnRow([
      { label: `部位：${equipFilterLabel()}`, id: 'filter_slot', size: 11 },
      { label: `类型：${equipCatLabel()}`, id: 'filter_cat', size: 11 },
    ]);
    if (batchMode) {
      L.btnRow([
        { label: `全选 ${list.length} 件`, id: 'batch_all', size: 11 },
        { label: '清空', id: 'batch_clear', size: 11 },
        { label: `分解已选 ${batchSel.size} 件`, id: 'batch_go', size: 11, primary: batchSel.size > 0, disabled: batchSel.size === 0 },
        { label: '退出批量', id: 'batch_off', size: 11 },
      ]);
    } else {
      L.btnRow([
        { label: '🧹 批量分解', id: 'batch_on', size: 12 },
        { label: '⚡ 一键最优装备', id: 'auto_equip', size: 12 },
      ]);
    }
    if (!list.length) L.text('这个筛选下没有未穿戴的装备', { color: CV.C.dim });
    const cells = list.slice(0, D.BAG_BASE_EQ_CAP + s.bag.eqExpands * D.BAG_EXPAND_SIZE).map(eq => {
      const sel = batchSel.has(eq.uid);
      return {
        label: (eq.lock ? '🔒' : '') + eq.name.slice(0, 4),
        sub: '+' + eq.enhance + (sel ? ' ✓' : ''),
        color: sel ? CV.C.gold : CV.rarityColor(eq.rarity),
        bg: sel ? '#2a2233' : (eq.lock ? '#1a1f28' : CV.C.panel2),
        disabled: batchMode && eq.lock,
        id: batchMode ? (eq.lock ? null : 'bq_' + eq.uid) : 'equip_' + eq.uid,
      };
    });
    while (cells.length < Math.min(u.eqCap, 30)) cells.push(null);
    L.grid(5, cells, { h: 58 });
    L.btn(`＋ 扩容 ${D.BAG_EXPAND_SIZE} 格（◈${fmt(D.bagExpandCost(s.bag.eqExpands))}）`, 'expand_equip');
    return;
  }
  const isMat = k => (D.ITEMS[k] || {}).type === 'material';
  const list = Object.keys(s.items).filter(k => s.items[k] > 0 && (pool === 'mat' ? isMat(k) : !isMat(k)));
  if (!list.length) L.text('（这一池还是空的）', { color: CV.C.dim });
  const cells = list.map(k => {
    const it = D.ITEMS[k];
    return {
      label: it.name.length > 5 ? it.name.slice(0, 5) + '\n' + it.name.slice(5, 10) : it.name,
      sub: '×' + s.items[k],
      id: 'item_' + k,
      size: 11,
    };
  });
  while (cells.length < Math.min(pool === 'mat' ? u.matCap : u.cap, 30)) cells.push(null);
  L.grid(5, cells, { h: 58 });
  L.btn(`＋ 扩容 ${D.BAG_EXPAND_SIZE} 格（◈${fmt(D.bagExpandCost(pool === 'mat' ? s.bag.matExpands : s.bag.itemExpands))}）`, 'expand_' + pool);
  L.text('点格子看用途与用法（1 / 10 / 全部）', { size: 11, color: CV.C.dim });
});

/* 装备池的筛选与批量分解（与网页版的分类口径一致） */
let bagSlotFilter = 'all', bagCatFilter = 'all', batchMode = false, batchSel = new Set();
const SLOT_FILTERS = [['all', '全部'], ['weapon', '武器'], ['armor', '胸甲'], ['head', '头部'], ['hands', '手部'], ['legs', '腿部'], ['accessory', '饰品'], ['SSR', 'SSR+']];
const CAT_FILTERS = [['all', '全部'], ['normal', '普通'], ['world', '世界套装'], ['class', '职业套装'], ['sig', '专属']];
function equipFilterLabel() { return (SLOT_FILTERS.find(x => x[0] === bagSlotFilter) || [])[1] || '全部'; }
function equipCatLabel() { return (CAT_FILTERS.find(x => x[0] === bagCatFilter) || [])[1] || '全部'; }
function equipListFiltered(worn) {
  let list = Core.inventoryEquips().filter(e => !worn[e.uid]);
  if (bagSlotFilter === 'SSR') list = list.filter(e => ['SSR', 'UR'].includes(e.rarity));
  else if (bagSlotFilter !== 'all') list = list.filter(e => e.slot === bagSlotFilter);
  if (bagCatFilter === 'normal') list = list.filter(e => !e.set && !e.classSet && !e.charId);
  else if (bagCatFilter === 'world') list = list.filter(e => !!e.set);
  else if (bagCatFilter === 'class') list = list.filter(e => !!e.classSet);
  else if (bagCatFilter === 'sig') list = list.filter(e => !!e.charId);
  return list;
}
CV.on('filter_slot', () => picker('按部位筛选', SLOT_FILTERS.map(([k, n]) => ({ label: n, id: 'set_slot_' + k, value: bagSlotFilter === k ? '✔' : '' }))));
CV.on('filter_cat', () => picker('按类型筛选', CAT_FILTERS.map(([k, n]) => ({ label: n, id: 'set_cat_' + k, value: bagCatFilter === k ? '✔' : '' }))));
onPrefixLocal('set_slot_', id => { bagSlotFilter = id.slice(9); CV.back(); });
onPrefixLocal('set_cat_', id => { bagCatFilter = id.slice(8); CV.back(); });
CV.on('batch_on', () => { batchMode = true; batchSel.clear(); });
CV.on('batch_off', () => { batchMode = false; batchSel.clear(); });
CV.on('batch_clear', () => { batchSel.clear(); });
CV.on('batch_all', () => {
  const worn = {};
  Object.values(S().equipped || {}).forEach(sl => Object.values(sl || {}).forEach(u => { if (u) worn[u] = 1; }));
  equipListFiltered(worn).forEach(e => { if (!e.lock) batchSel.add(e.uid); });
});
CV.on('batch_go', () => {
  const r = Core.decomposeMany(Array.from(batchSel));
  CV.toast(r.ok ? `分解 ${r.count} 件，获得 ◆${r.gain}` : '没有可分解的装备');
  batchSel.clear();
  batchMode = false;
});
CV.onPrefix('bq_', id => {
  const uid = id.slice(3);
  if (batchSel.has(uid)) batchSel.delete(uid); else batchSel.add(uid);
});
function onPrefixLocal(prefix, fn) { CV.onPrefix(prefix, fn); }

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
  // 与"这个部位现在穿在谁身上"的对比：换不换，看这一行就够
  const cmpOwner = wearer || '@player';
  const curUid = ((S().equipped[cmpOwner] || {})[eq.slot]) || null;
  const curEq = curUid && S().equips[curUid];
  if (curEq && curEq.uid !== eq.uid) {
    const d = Math.round(Core.equipScore(eq) - Core.equipScore(curEq));
    L.row(`对比 ${Core.charName(cmpOwner)} 的 ${curEq.name} +${curEq.enhance}`,
      `对方 ${Math.round(Core.equipScore(curEq))} 分 · 这件 ${Math.round(Core.equipScore(eq))} 分`,
      { value: (d >= 0 ? '+' : '') + d + ' 分', valueColor: d >= 0 ? CV.C.green : CV.C.red });
  }
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
  L.title('保底进度');
  const pN = Core.pityView('advanced'), pL = Core.pityView('limited');
  L.text('普通池没有保底：出率固定，重复伙伴转碎片', { size: 11, color: CV.C.dim });
  if (pN) { L.text(`高级池：SSR ${pN.ssr.n}/${pN.ssr.cap} · UR ${pN.ur.n}/${pN.ur.cap}（出更高稀有度会清空对应计数）`, { size: 11, color: CV.C.dim }); L.meter(pN.ssr.n / pN.ssr.cap, `SSR 保底 ${pN.ssr.n}/${pN.ssr.cap}`); }
  if (pL) { L.text(`限定池：当期 UP ${pL.up.n}/${pL.up.cap}`, { size: 11, color: CV.C.dim }); L.meter(pL.up.n / pL.up.cap, `UP ${pL.up.n}/${pL.up.cap}`); }
  L.title('概率公示');
  Object.keys(D.RECRUIT_POOLS).forEach(pool => {
    const P = D.RECRUIT_POOLS[pool];
    L.text(`${P.name}：` + Object.entries(P.rates).map(([r, v]) => `${r} ${(v * 100).toFixed(1)}%`).join('　'), { size: 11, color: CV.C.dim });
  });
});

/* ================= 通用小面板 ================= */
CV.register('grow', function () {
  L.text('养成总览：一个功能一个入口', { size: 12, color: CV.C.dim });
  tileGrid3([
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
  L.text('这一页讲清游戏怎么玩；看广告的规则也写在里面。', { size: 11, color: CV.C.dim });
  D.GUIDE_CHAPTERS.forEach(ch => {
    L.title(ch.t || ch.title || '章节');
    L.text(ch.body || ch.desc || '', { size: 12, color: CV.C.dim });
  });
  L.title('看广告说明');
  L.text('本游戏的广告都是「激励视频」：你主动点、看完 15~30 秒才拿到奖励；不看也不影响正常玩。\n' +
    '每个点位每天有次数上限（按钮上直接写着还剩几次），用完就变灰。\n' +
    '如果广告暂时拉不到（网络或广告库存原因），我们照发奖励，每天最多补偿 2 次。\n' +
    '广告不会打断战斗、不会强制弹出，也不会出现在加载和新手引导里。', { size: 11, color: CV.C.dim });
  L.title('当前广告额度');
  const AD_NAME = {
    offline_double: '离线收益翻倍', idle_boost: '挂机加速 2 小时', sweep_plus: '扫荡次数 +3',
    pre_buff: '战前增益 攻击 +25%', free_recruit: '普通池免费抽 1 次', recruit_adv: '高级池免费抽 1 次',
    holy_pack: '✦圣洁晶石 ×30', otherworld_pack: '◆异界结晶 ×50', login_double: '签到奖励翻倍', revive: '阵亡复活（每关 1 次）',
  };
  Object.keys(G.AD.limits).forEach(k => {
    L.row(AD_NAME[k] || k, '', { value: `${G.AD.left(k)}/${G.AD.limits[k]} 次` });
  });
  L.btn('💠 货币图鉴（每种货币干什么用）', 'open_curdoc');
});

/* 货币图鉴：顶栏点货币也是开这个 */
const CUR_DOC = {
  points: ['挂机、副本、扫荡、每日任务、悬赏、药园收获', '抽普通池、升伙伴等级、买商店、装备强化、扩背包、种药园、驯坐骑'],
  story: ['深层副本、深井、故事商店相关产出', '故事商店（碎片、材料、技能芯片）'],
  otherworld: ['分解装备、精英/Boss 掉落、斗法台、深井、悬赏', '抽限定池、买法宝、秘术阁、灯阁权限、异界商店'],
  holy: ['高级招募、商店兑换、悬赏、周常、灯阁权限奖励', '抽高级池、灯阁权限（长线投资）'],
  skillChip: ['副本掉落、商店、每日/周常、成就', '伙伴技能升级、主角技能升级'],
  bloodCrystal: ['Boss 掉落、深井、悬赏、图鉴奖励', '血统强化、铭刻解锁'],
  corridor: ['深井每层产出、斗法台', '深井商店、深井印记（每 10 层 +1.5% 深井内属性）'],
  rp: ['转生获得（第 n 世给 100×n^1.15）', '四支转生天赋树（40 个节点）'],
};
CV.register('curdoc', function () {
  L.text('顶栏点货币也能开这一个页面', { size: 11, color: CV.C.dim });
  D.CURRENCIES.forEach(c => {
    const doc = CUR_DOC[c.id] || ['—', '—'];
    // 来源 / 用途分两行，别挤在一行被截断
    L.row(`${c.icon} ${c.name}`, `来源：${doc[0]}`, { value: fmt(S().cur[c.id] || 0), valueColor: CV.C.gold });
    L.text(`用途：${doc[1]}`, { size: 11, color: CV.C.dim });
  });
});

/* 多主角：一个人可以养几条不同的血统线，随时切换 */
CV.register('alts', function () {
  const list = Core.protagonistList();
  L.text(`当前操盘的角色：${list.map(p => (p.current ? '【' + p.name + '】' : p.name)).join(' · ')}`, { size: 12, color: CV.C.dim });
  L.text('换主角只换"主角本人"（等级/血统/境界/加点），货币、伙伴、装备都是同一个存档。', { size: 11, color: CV.C.dim });
  list.forEach((p, i) => {
    L.row(`${p.name}  Lv.${p.level}`, `${p.bloodline ? p.bloodline + ' · ' + (D.realmName ? '' : '') : '未选血统'}技能 Lv.${(p.skillLv || [1,1,1]).join('/')}`, {
      id: p.current ? null : 'switch_protag_' + p.altIndex,
      value: p.current ? '当前' : '切换',
    });
  });
  L.btn('＋ 新建一个主角（不同血统重新练）', 'new_protag', { primary: true });
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
  L.title('战斗速度', '和战斗界面右上角那个按钮同步');
  L.btnRow([1, 2, 3].map(v => ({ label: v + '× 速度', id: 'speed_' + v, primary: (s.settings.speed || 1) === v, size: 12 })));
  L.title('存档槽', '本地 3 个槽，互不覆盖');
  Core.slotInfo().forEach(slot => {
    const m = slot.meta;
    L.row(`存档槽 ${slot.slot}`, m ? `Lv.${m.level} · 深井最高 ${m.floor} · ${new Date(m.time || Date.now()).toLocaleString('zh-CN')}` : '空槽',
      { value: m ? '有存档' : '' });
    L.btnRow([
      { label: '保存到这一槽', id: 'slot_save_' + slot.slot, size: 11 },
      { label: '读取', id: 'slot_load_' + slot.slot, size: 11, disabled: !slot.exists },
    ]);
  });
  L.title('导出 / 导入');
  L.btn('📤 导出存档到剪贴板', 'save_export', { size: 13 });
  L.btn('📥 从剪贴板导入（会覆盖当前进度）', 'save_import', { size: 13 });
  L.btn('🗑 删除进度并重开', 'save_wipe', { size: 13 });
  L.title('关于');
  L.text('残域（微信小游戏版）', { size: 12, color: CV.C.dim });
  L.text('个人开发 · 广告变现版 · 数据全部存在本机', { size: 11, color: CV.C.dim });
});

module.exports = {
  startStage, startBattle, buildAllies, finishBattle,
  battle: () => battle,
  stageRun: () => stageRun,
  tickBattle,
  reviveStage,
  armPreBuff: () => { preBuff = 0.25; },
  hasPreBuff: () => preBuff > 0,
};
