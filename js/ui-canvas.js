/* Canvas 界面层（小游戏没有 DOM，所有界面都得自己画）
   ------------------------------------------------------------------------
   这一版是**骨架**：已经跑通"首页 + 世界列表 + 打一关 + 存档 + 广告按钮"的最小闭环，
   证明逻辑层可以原样复用。剩下的 30 多个界面按 README「二期」逐个补。

   写法：立即模式（immediate mode）——每次 draw() 重画一整屏，顺便把"可点区域"记进 hits[]，
   触摸时反查 hits 派发。好处是不用维护"控件树"，几百行就能撑起全部界面。
*/

const G = GameGlobal;

let canvas, ctx, W = 375, H = 667, DPR = 2, TOP = 24, NAV_H = 64;
let tab = 'home';
let hits = [];            // 本次绘制产生的可点区域 {x,y,w,h,id}
let toasts = [];          // 飘一句提示
let lastIdle = Date.now();
let screen = null;        // 战斗结果等临时界面

const COLOR = {
  bg: '#0a0d13', panel: '#141a24', panel2: '#1c2432', line: '#2a3446',
  text: '#e6edf7', dim: '#8b98ad', gold: '#ffd76a', accent: '#d43a4f', green: '#7ee0a3',
};

/* ---------- 绘制原语 ---------- */
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function panel(x, y, w, h) {
  ctx.fillStyle = COLOR.panel;
  roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}
function text(str, x, y, opt) {
  opt = opt || {};
  ctx.fillStyle = opt.color || COLOR.text;
  ctx.font = `${opt.bold ? 'bold ' : ''}${opt.size || 14}px sans-serif`;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = opt.baseline || 'middle';
  ctx.fillText(str, x, y);
}
// 按钮：画出来 + 登记可点区域
function button(id, label, x, y, w, h, opt) {
  opt = opt || {};
  const disabled = !!opt.disabled;
  ctx.fillStyle = disabled ? COLOR.panel : (opt.primary ? COLOR.accent : COLOR.panel2);
  roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = COLOR.line;
  ctx.stroke();
  text(label, x + w / 2, y + h / 2, { align: 'center', size: opt.size || 14, bold: true, color: disabled ? COLOR.dim : COLOR.text });
  if (!disabled) hits.push({ x, y, w, h, id });
}
function toast(msg) {
  toasts.push({ msg, at: Date.now() });
  if (toasts.length > 3) toasts.shift();
}
function fmt(n) {
  n = Math.floor(n || 0);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
}
function hhmmss(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (h) return `${h}小时${m}分`;
  if (m) return `${m}分${s}秒`;
  return `${s}秒`;
}

/* ---------- 队伍编成（网页版在 ui.js 里，小游戏版先放在这；后续建议把它搬进 core.js 共用） ---------- */
function buildAllies() {
  const S = Core.S;
  const fb = Core.factionBuffs(S.party);
  const allies = [];
  S.party.forEach((id, idx) => {
    if (!id) return;
    const position = idx < 2 ? 'front' : 'back';
    if (id === '@player') {
      const st = Core.effectivePlayerStats();
      allies.push(Object.assign({}, st, {
        name: Core.S.player.name || '主角', kind: 'warrior', faction: null, position,
        skills: Core.protagonistSkills(), skillLv: S.player.skillLv || [1, 1, 1],
        atk: Math.round(st.atk * (1 + fb.atkPct)), maxHp: Math.round(st.hp * (1 + fb.hpPct)),
        hp: Math.round(st.hp * (1 + fb.hpPct)), skillMult: (st.skillMult || 1) + fb.skillPct, charId: '@player',
      }));
      return;
    }
    const base = DATA.charById[id];
    if (!base) return;
    const eff = Core.effectiveStats(id);
    const fullHp = Math.round(eff.hp * (1 + fb.hpPct));
    allies.push(Object.assign({}, eff, {
      name: base.name, kind: base.kind, faction: base.faction, position,
      skills: base.skills, skillLv: S.chars[id].skillLv,
      atk: Math.round(eff.atk * (1 + fb.atkPct)), maxHp: fullHp, hp: fullHp,
      skillMult: eff.skillMult + fb.skillPct, charId: id,
    }));
  });
  return allies;
}

/* ---------- 界面 ---------- */
function drawHome() {
  const S = Core.S;
  let y = TOP + 10;
  panel(12, y, W - 24, 96);
  text(`${S.player.name || '执灯者'}  Lv.${S.player.level}`, 24, y + 26, { size: 16, bold: true });
  const st = Core.effectivePlayerStats();
  text(`战力 ${fmt(Core.teamPower())}`, W - 24, y + 26, { align: 'right', size: 12, color: COLOR.gold });
  text(`◈${fmt(S.cur.points)}   ✦${fmt(S.cur.holy)}   ◆${fmt(S.cur.otherworld)}`, 24, y + 52, { size: 13, color: COLOR.gold });
  text(`身上：攻击 ${fmt(st.atk)} · 生命 ${fmt(st.hp)}`, 24, y + 74, { size: 12, color: COLOR.dim });
  y += 110;

  // 挂机卡
  const bank = Core.idleBankGains();
  panel(12, y, W - 24, 120);
  text('挂机中', 24, y + 24, { size: 14, bold: true });
  text(hhmmss(bank.seconds), W - 24, y + 24, { align: 'right', size: 13, color: COLOR.gold });
  text(`◈${fmt(bank.points)} · EXP ${fmt(bank.exp)}${bank.otherworld ? ' · ◆' + bank.otherworld : ''}`, 24, y + 50, { size: 13 });
  const canClaim = bank.seconds >= 60;
  button('claim', canClaim ? '一键收取' : '再攒一会儿', 24, y + 68, W - 48, 40, { primary: canClaim, disabled: !canClaim });
  y += 132;

  // 广告点位示范（真实项目里这块会铺满 AD_SLOTS.md 的八个点）
  panel(12, y, W - 24, 116);
  text('📺 看广告拿好处（每日限次）', 24, y + 22, { size: 13, bold: true, color: COLOR.green });
  const l1 = G.AD.left('idle_boost');
  button('ad_idle', `⏩ 挂机加速 2 小时（${l1}）`, 24, y + 40, W - 48, 36, { disabled: l1 <= 0 });
  const l2 = G.AD.left('holy_pack');
  button('ad_holy', `✦ 圣洁晶石 ×30（${l2}）`, 24, y + 82, W - 48, 30, { disabled: l2 <= 0, size: 13 });
  if (!G.AD.enabled) text('（开发者工具里没有真广告，按下去走"补偿发放"分支）', W / 2, y + 118, { align: 'center', size: 10, color: COLOR.dim });
  y += 128;

  text('主线：推进「菌毯巢穴」，把招募和商店解锁出来', 24, y, { size: 12, color: COLOR.dim });
}

function drawDungeon() {
  const S = Core.S;
  let y = TOP + 10;
  text('残域 · 世界列表', 24, y, { size: 16, bold: true });
  y += 26;
  DATA.WORLDS.slice(0, 6).forEach(w => {
    const unlocked = S.worlds[w.id] && S.worlds[w.id].unlocked;
    panel(12, y, W - 24, 56);
    text(`${w.name}${unlocked ? '' : ' 🔒'}`, 24, y + 20, { size: 14, bold: true, color: unlocked ? COLOR.text : COLOR.dim });
    text(w.mechanic, 24, y + 40, { size: 11, color: COLOR.dim });
    if (unlocked) button('enter_' + w.id, '进入', W - 92, y + 10, 64, 36, { primary: true, size: 13 });
    y += 64;
  });
  y += 4;
  panel(12, y, W - 24, 74);
  text('深井（无限爬塔）', 24, y + 22, { size: 13, bold: true });
  text(`当前第 ${S.corridor.floor} 层 · 历史最高 ${S.corridor.best} 层`, 24, y + 44, { size: 11, color: COLOR.dim });
}

function drawBag() {
  const S = Core.S;
  let y = TOP + 10;
  text('背包', 24, y, { size: 16, bold: true });
  y += 26;
  const u = Core.bagUsage();
  text(`道具 ${u.itemStacks}/${u.cap} · 材料 ${u.matUsed}/${u.matCap} · 装备 ${u.eqUsed}/${u.eqCap}`, 24, y, { size: 12, color: COLOR.dim });
  y += 24;
  const items = Object.keys(S.items).filter(k => S.items[k] > 0).slice(0, 8);
  if (!items.length) text('（空）', 24, y, { size: 12, color: COLOR.dim });
  items.forEach(k => {
    panel(12, y, W - 24, 40);
    text(DATA.ITEMS[k].name, 24, y + 20, { size: 13 });
    text('×' + S.items[k], W - 24, y + 20, { align: 'right', size: 13, color: COLOR.gold });
    y += 46;
  });
}

function drawResult() {
  const r = screen.data;
  let y = TOP + 40;
  text(r.win ? '胜 利' : '任务失败', W / 2, y, { align: 'center', size: 26, bold: true, color: r.win ? COLOR.gold : COLOR.accent });
  y += 40;
  text(`${r.rounds} 回合`, W / 2, y, { align: 'center', size: 13, color: COLOR.dim });
  y += 30;
  r.log.forEach(line => {
    text(line, 24, y, { size: 12 });
    y += 20;
  });
  button('back_home', '返回', 24, H - NAV_H - 80, W - 48, 48, { primary: true });
}

/* ---------- 主绘制 ---------- */
function draw() {
  hits = [];
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);

  // 顶栏
  const S = Core.S;
  panel(0, 0, W, TOP + 4);
  text(`${S.player.name || '执灯者'} · Lv.${S.player.level}`, W / 2, TOP - 6, { align: 'center', size: 13, color: COLOR.text });

  if (screen && screen.name === 'result') drawResult();
  else if (tab === 'home') drawHome();
  else if (tab === 'dungeon') drawDungeon();
  else drawBag();

  // 底部导航
  const tabs = [['home', '灯阁'], ['dungeon', '残域'], ['bag', '背包'], ['more', '更多']];
  const tw = W / tabs.length;
  panel(0, H - NAV_H, W, NAV_H);
  tabs.forEach(([id, name], i) => {
    const x = i * tw;
    const active = tab === id;
    text(name, x + tw / 2, H - NAV_H / 2, { align: 'center', size: 14, bold: active, color: active ? COLOR.gold : COLOR.dim });
    hits.push({ x, y: H - NAV_H, w: tw, h: NAV_H, id: 'tab_' + id });
  });

  // 提示
  toasts.forEach((t, i) => {
    if (Date.now() - t.at > 2600) return;
    const y = H - NAV_H - 40 - i * 30;
    ctx.fillStyle = 'rgba(20,26,36,.95)';
    roundRect(24, y - 14, W - 48, 28, 14);
    ctx.fill();
    text(t.msg, W / 2, y, { align: 'center', size: 12, color: COLOR.gold });
  });
}

/* ---------- 触摸派发 ---------- */
function onTap(x, y) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { dispatch(h.id); return; }
  }
}
function dispatch(id) {
  if (id.startsWith('tab_')) {
    tab = id.slice(4);
    screen = null;
    return;
  }
  if (id === 'claim') {
    const g = Core.claimIdle();
    toast(`收了 ◈${fmt(g.points)} · EXP ${fmt(g.exp)}`);
    Core.save();
    return;
  }
  if (id === 'ad_idle') {
    G.AD.show('idle_boost').then(r => {
      if (!r.granted) { toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
      Core.S.idle.bankSec += 7200;                 // 2 小时挂机
      const g = Core.claimIdle();
      Core.save();
      toast(`+◈${fmt(g.points)} · +EXP ${fmt(g.exp)}${r.reason !== 'ok' ? '（广告不可用，已补偿）' : ''}`);
    });
    return;
  }
  if (id === 'ad_holy') {
    G.AD.show('holy_pack').then(r => {
      if (!r.granted) { toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
      Core.addCur('holy', 30);
      Core.save();
      toast('✦ 圣洁晶石 +30');
    });
    return;
  }
  if (id.startsWith('enter_')) {
    fight(id.slice(6), 'normal', 0);
    return;
  }
  if (id === 'back_home') {
    screen = null;
    tab = 'home';
    return;
  }
}

/* ---------- 打一关（证明战斗引擎、副本生成、队伍编成都能原样跑） ---------- */
function fight(worldId, diff, stageIdx) {
  const stage = stageIdx + 1;
  const allies = buildAllies();
  if (!allies.length) { toast('没有可出战的成员'); return; }
  const kind = Dungeon.finalKind(stage);           // 第 1~4 关是遭遇战，第 4 关是精英…
  const enemies = Dungeon.makeEnemies(worldId, diff, stage, kind);
  const res = Battle.run({ allies, enemies, worldId, maxRounds: 30 });
  const log = [];
  log.push(`${res.win ? '打赢了' : '打输了'} · ${res.rounds} 回合`);
  if (res.win) {
    const g = Dungeon.grantRewards(worldId, diff, stage, kind);
    Core.addCharExp(Core.S.party.filter(Boolean), g.rewards.exp);
    Core.addPlayerBattleExp(Math.round(g.rewards.exp * 0.5));
    Core.battleSettle({}, true, kind === 'boss');
    const comp = Core.stageComplete(worldId, diff, stageIdx, 3);
    log.push('◈+' + fmt(g.rewards.points));
    g.got.filter(x => x.k === 'equip').forEach(x => log.push('🗡 ' + x.v.name));
    if (comp.firstClearReward) log.push('首通奖励已发');
    G.AD.interstitial();                            // 插屏：按 3 关 1 次 + 60 秒冷却的节奏自己控制
  }
  Core.save();
  screen = { name: 'result', data: { win: res.win, rounds: res.rounds, log } };
  draw();
}

/* ---------- 启动 ---------- */
function boot() {
  canvas = wx.createCanvas();                       // 第一次创建 = 上屏 canvas
  ctx = canvas.getContext('2d');
  let info = {};
  try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (e) { info = {}; }
  W = info.windowWidth || 375;
  H = info.windowHeight || 667;
  DPR = info.pixelRatio || 2;
  TOP = (info.safeArea && info.safeArea.top) ? info.safeArea.top + 22 : 30;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  // 存档：能读就读，读不到就是新档
  if (!Core.load()) { Core.newGame(); }
  Core.ensureDaily();
  const off = Core.settleOffline();                 // 离线收益已经由核心层入账（V9.5 起）
  if (off && off.seconds >= 300) toast(`离线 ${hhmmss(off.seconds)}，+◈${fmt(off.gains.points)}`);

  wx.onTouchStart && wx.onTouchStart(e => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    onTap(t.clientX !== undefined ? t.clientX : t.pageX, t.clientY !== undefined ? t.clientY : t.pageY);
    draw();
  });
  wx.onShow && wx.onShow(() => { Core.save(); draw(); });
  wx.onHide && wx.onHide(() => { Core.save(); });

  // 主循环：一秒一帧，驱动挂机累计与界面刷新
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(10, (now - lastIdle) / 1000);
    lastIdle = now;
    Core.onlineTick(dt);
    draw();
  }, 1000);
  setInterval(() => Core.save(), 15000);

  draw();
}

// 测试用出口（scripts/test-minigame.js 靠它验"画得出来、点得到"）
module.exports = { boot, _draw: draw, _dispatch: dispatch, _hits: () => hits, _setTab: v => { tab = v; screen = null; } };
