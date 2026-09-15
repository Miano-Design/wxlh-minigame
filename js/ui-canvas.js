/* 小游戏入口层：初始化画布、绑定触摸、注册全部按钮行为、跑主循环。
   界面在 screens.js，框架在 cv.js。

   动态 id（装备 uid / 角色 id / 关卡坐标…）统一走 CV.onPrefix，不用为每条数据单独注册。
*/
const CV = require('./cv.js');
const Scr = require('./screens.js');
const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
const Core = window.Core;
const D = window.DATA;
const L = CV.L;
const fmt = CV.fmt;

function S() { return Core.S; }

/* ---------- 选择器面板 ---------- */
CV.register('picker', function (p) {
  L.text(p.text || '选一个', { size: 12, color: CV.C.dim });
  (p.items || []).forEach(it => L.row(it.label, it.sub || '', { id: it.id, value: it.value || '' }));
  if (!(p.items || []).length) L.text('没有可选项', { color: CV.C.dim });
});
function picker(title, items, text) { CV.open('picker', { title, items, text }); }

CV.panels.titleOf = function (panel) {
  if (!panel) return '';
  const map = {
    world: '关卡选择', battle: '战斗中', stageresult: '结算', stagefail: '队伍重伤',
    party: '队伍', chars: '伙伴', char: '伙伴详情', protagonist: '主角', bag: '背包',
    item: '道具', equip: '装备', recruit: '招募', grow: '养成', sect: '灯阁评级',
    keji: '秘术阁', fabao: '法宝', mount: '坐骑', garden: '药园', arena: '斗法台', sign: '求签',
    authority: '灯阁权限', buildings: '基地建设', genelock: '铭刻', beast: '伴生体',
    reincarn: '转生天赋', codex: '灯录', refine: '炼化台', idlelines: '挂机分工',
    tasks: '任务与成就', bounty: '限时悬赏', shop: '兑换大厅', guide: '玩法指南',
    settings: '设置', create: '创建执灯者', bloodline: '选择血统',
    login: '七日登录',
    curdoc: '货币图鉴', alts: '多主角', welcome: '欢迎来到灯阁', pullresult: '十连结果',
  };
  if (panel.name === 'picker') return (panel.params && panel.params.title) || '选择';
  return map[panel.name] || '';
};

/* ---------- 首次进入：起名 + 选血统 ---------- */
const NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];
let nameIdx = Math.floor(Math.random() * NAMES.length);
CV.register('create', function () {
  L.text('你被神秘存在选中，成为「执灯者」', { size: 15, bold: true });
  L.text('灯阁需要一个名字来记录你的行程。', { size: 12, color: CV.C.dim });
  L.spacer(12);
  L.text(NAMES[nameIdx], { size: 22, bold: true, align: 'center', color: CV.C.gold });
  L.spacer(8);
  L.btnRow([
    { label: '🎲 换一个', id: 'name_roll' },
    { label: '就用这个', id: 'name_ok', primary: true },
  ]);
  L.text('新手上手三件事：① 选血统；② 点「一键收取」领挂机与任务；③ 去残域打第 1 关解锁招募。', { size: 11, color: CV.C.dim });
});
CV.register('bloodline', function () {
  L.text('选一条血统：境界线跟着血统走，选定不能改', { size: 13, bold: true });
  Object.keys(D.BLOODLINES).forEach(k => {
    L.row(k, D.BLOODLINES[k].desc, { id: 'blood_' + k, value: '选择' });
  });
});

/* ---------- 七日登录（网页版是开游戏自动弹，小游戏版做成一个常驻入口） ---------- */
function rewardText(r) {
  const parts = [];
  Object.entries(r || {}).forEach(([k, v]) => {
    if (k === 'item') [].concat(v).forEach(id => parts.push((D.ITEMS[id] || {}).name || id));
    else if (k === 'ssrTicket') parts.push('SSR 自选券');
    else if (v) { const c = D.CURRENCIES.find(x => x.id === k); parts.push(`${c ? c.icon : ''}${fmt(v)}`); }
  });
  return parts.join(' · ') || '—';
}
CV.register('login', function () {
  const s = S();
  L.text(`七日登录 · 第 ${s.login.day || 0}/7 天（第 ${s.login.round || 1} 轮）`, { size: 16, bold: true });
  D.LOGIN_REWARDS.forEach((r, i) => {
    L.row(`第 ${i + 1} 天`, rewardText(r), { value: i < (s.login.day || 0) ? '已领' : (i === (s.login.day || 0) ? '今日' : '') });
  });
  L.text('每天开游戏自动发；看一次广告可以再拿一份（每天 1 次）', { size: 11, color: CV.C.dim });
  const b = adBtnLocal('login_double', '🎁 今日奖励翻倍', 'ad_login_double');
  L.btn(b.label, b.id, { primary: G.AD.left('login_double') > 0, disabled: G.AD.left('login_double') <= 0 });
});

/* ================= 行为注册 ================= */
const on = CV.on, onP = CV.onPrefix;

/* ---------- 简单入口 ---------- */
on('to_worlds', () => CV.reset('worlds'));
on('open_protagonist', () => CV.open('protagonist'));
on('open_grow', () => CV.open('grow'));
on('open_settings', () => CV.open('settings'));
on('open_guide', () => CV.open('guide'));
on('open_recruit', () => CV.open('recruit'));
on('open_chars', () => CV.open('chars'));
on('open_achievements', () => CV.open('tasks'));
on('open_login', () => CV.open('login'));
on('open_curdoc', () => CV.open('curdoc'));
on('open_alts', () => CV.open('alts'));
on('welcome_ok', () => CV.reset('create'));
CV.onPrefix('switch_protag_', id => {
  const r = Core.switchProtagonist(+id.slice(14));
  CV.toast(r.msg || (r.ok ? '已切换' : '切换失败'));
  CV.reset('home');
});
on('new_protag', () => {
  const nm = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常'][Math.floor(Math.random() * 8)];
  const r = Core.createProtagonist(nm);
  CV.toast(r.ok ? `新主角「${nm}」已创建，去选血统` : (r.msg || '创建失败'));
  if (r.ok) CV.reset('bloodline');
});
on('nav_more', () => CV.open('grow'));
['sect', 'keji', 'fabao', 'mount', 'garden', 'arena', 'sign', 'authority', 'buildings',
  'genelock', 'beast', 'reincarn', 'codex', 'refine', 'idlelines', 'tasks', 'bounty', 'shop']
  .forEach(n => on('open_' + n, () => CV.open(n)));

/* ---------- 首页 ---------- */
CV.lastOffline = null;      // 记住"这次开游戏补了多少离线收益"，给"离线翻倍"用
on('claim_idle', () => {
  const g = Core.claimIdle();
  CV.toast(`收了 ◈${fmt(g.points)} · EXP ${fmt(g.exp)}${g.matCount ? ' · 材料×' + g.matCount : ''}`);
});
on('claim_quest', () => {
  const q = Core.mainQuestState().find(x => !x.claimed && x.done);
  if (!q) { CV.toast('还没有可领的主线奖励'); return; }
  const r = Core.claimQuest(q.q.id);
  CV.toast(r.ok ? `主线奖励已领${r.unlocked && r.unlocked.length ? '，解锁 ' + r.unlocked.join('、') : ''}` : (r.msg || '领取失败'));
});
on('ad_idle', () => G.AD.show('idle_boost').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  S().idle.bankSec += 7200;
  const g = Core.claimIdle();
  CV.toast(`+◈${fmt(g.points)} · +EXP ${fmt(g.exp)}${r.reason.indexOf('compensated') === 0 ? '（广告不可用，已补偿）' : ''}`);
}));
on('ad_holy', () => G.AD.show('holy_pack').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  Core.addCur('holy', 30);
  Core.save();
  CV.toast('✦ 圣洁晶石 +30');
}));
on('ad_recruit', () => G.AD.show('free_recruit').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  const p = Core.recruitOnce('normal', { noCost: true });     // 广告出资的免费一抽（普通池）
  CV.toast(p && p.error ? '抽卡失败' : `抽到 ${p.name}（${p.rarity}）${p.isNew ? ' · 新伙伴！' : ` · 碎片 +${p.shards}`}`);
}));
on('ad_recruit_adv', () => G.AD.show('recruit_adv').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  const p = Core.recruitOnce('advanced', { noCost: true });   // 高级池免费 1 抽（保底照常计数）
  CV.toast(p && p.error ? '抽卡失败' : `抽到 ${p.name}（${p.rarity}）${p.isNew ? ' · 新伙伴！' : ` · 碎片 +${p.shards}`}`);
}));
/* 离线收益翻倍：把这次开游戏补的离线收益再补一份；没有离线记录时按 2 小时挂机结算 */
on('ad_offline', () => G.AD.show('offline_double').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  const off = CV.lastOffline;
  if (off && off.seconds >= 60) {
    Core.addCur('points', off.gains.points);
    Core.addCur('otherworld', off.gains.otherworld);
    Core.addPlayerExp(off.gains.exp);
    Core.save();
    CV.toast(`离线收益翻倍：再 +◈${fmt(off.gains.points)} · +EXP ${fmt(off.gains.exp)}`);
    CV.lastOffline = null;                      // 一份离线只翻一次
  } else {
    S().idle.bankSec += 7200;
    const g = Core.claimIdle();
    CV.toast(`这次没有离线记录，按 2 小时挂机补：+◈${fmt(g.points)} · +EXP ${fmt(g.exp)}`);
  }
}));
on('ad_other', () => G.AD.show('otherworld_pack').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  Core.addCur('otherworld', 50);
  Core.save();
  CV.toast('◆ 异界结晶 +50');
}));
on('ad_sweep', () => G.AD.show('sweep_plus').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  Core.addSweepBonus(3);              // 独立额度，新的那天也照给
  CV.toast(`今日扫荡次数 +3（剩 ${Core.sweepLeft()} 次）`);
}));
on('ad_prebuff', () => G.AD.show('pre_buff').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  Scr.armPreBuff();
  CV.toast('⚔ 已就绪：下一关全队攻击 +25%');
}));
on('claim_travel', () => { const r = Core.claimTravel(); CV.toast(r.msg || '收下了'); });
on('ad_login_double', () => G.AD.show('login_double').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日次数已用完' : '广告没看完，奖励没发'); return; }
  const s = S();
  const rw = D.LOGIN_REWARDS[Math.max(0, (s.login.day || 1) - 1)];
  if (rw) { Core.applyRewardObj(rw); Core.save(); CV.toast('今日签到奖励翻倍到手'); }
}));
on('nav_more', () => CV.open('grow'));

/* ---------- 残域 ---------- */
on('resume_run', () => {
  const pr = S().pendingRun;
  if (!pr) { CV.toast('没有可继续的副本'); return; }
  Scr.startStage(pr.worldId, pr.diff, pr.stageIdx);
});
on('corridor_fight', () => startCorridor());
on('next_stage', () => {
  const g = CV.top().params;
  const nx = Core.nextStage(g.worldId, g.diff, g.stageIdx);
  if (nx) Scr.startStage(nx.worldId, nx.diff, nx.stageIdx);
  else CV.toast('已经没有下一关了');
});
on('retry_stage', () => { const g = CV.top().params; Scr.startStage(g.worldId, g.diff, g.stageIdx); });
on('ad_revive', () => G.AD.show('revive').then(r => {
  if (!r.granted) { CV.toast(r.reason === 'quota' ? '今日复活次数已用完' : '广告没看完，没有复活'); return; }
  const g = CV.top().params || {};
  CV.toast('全队恢复 50%，再来一次');
  if (g.worldId !== undefined) Scr.startStage(g.worldId, g.diff, g.stageIdx); else CV.reset('worlds');
}));
on('open_sweep', () => {
  const p = CV.top().params;
  const s = S();
  const cleared = [];
  for (let i = 0; i < 12; i++) if (s.worlds[p.worldId].stages[p.diff][i] > 0) cleared.push(i + 1);
  if (!cleared.length) { CV.toast('通关后才能扫荡'); return; }
  const max = cleared[cleared.length - 1];
  picker('扫荡', [
    { label: `扫荡第 ${max} 关 ×1`, sub: `今日剩余 ${Core.sweepLeft()} 次`, id: `sweep_${p.worldId}_${p.diff}_${max}_1` },
    { label: `扫荡第 ${max} 关 ×5`, sub: '和真实战斗同样结算（含经验）', id: `sweep_${p.worldId}_${p.diff}_${max}_5` },
    { label: '全部剩余次数', sub: `今日还剩 ${Core.sweepLeft()} 次`, id: `sweep_${p.worldId}_${p.diff}_${max}_0` },
    adBtnLocal('sweep_plus', '⏩ 看广告：今日次数 +3', 'ad_sweep'),
  ], '扫荡 = 自动重打这一关，经验和战斗次数都照算');
});
function adBtnLocal(slot, label, id) {
  const left = G.AD.left(slot);
  return { label: left > 0 ? `${label}（还剩 ${left} 次）` : `${label}·今日已完`, id, sub: '看 15~30 秒视频' };
}

/* ---------- 队伍 ---------- */
[0, 1, 2, 3, 4].forEach(i => {
  on('slot_' + i, () => pickPartyMember(i));
  on('slotmenu_' + i, () => {
    const id = S().party[i];
    if (!id) { pickPartyMember(i); return; }
    const items = [{ label: id === '@player' ? '看主角详情' : '看伙伴详情', id: id === '@player' ? 'open_protagonist' : 'char_' + id }];
    if (id !== '@player') items.push({ label: '下阵', id: 'unset_' + i });
    if (!(i < 2 && S().party.filter((x, j) => x && j < 2).length === 1 && id !== '@player')) {
      items.push({ label: `换到${i < 2 ? '后排' : '前排'}`, id: 'swaprow_' + i });
    }
    picker(Core.charName(id), items, i < 2 ? '前排吃伤害，后排相对安全' : '主角也能站后排');
  });
  on('unset_' + i, () => { S().party[i] = null; Core.save(); CV.back(); CV.toast('已下阵'); });
  on('swaprow_' + i, () => {
    const id = S().party[i];
    const r = Core.moveMemberRow(id, i < 2 ? 'back' : 'front');
    CV.toast(r.msg || '已换位');
    CV.back();
  });
});
function pickPartyMember(idx) {
  const s = S();
  const items = Object.keys(s.chars).map(id => {
    const c = s.chars[id], b = D.charById[id];
    return {
      label: `${b.name} ${c.star}★`,
      sub: `Lv.${c.lv} · 战力 ${fmt(Core.power(id))}${s.party.includes(id) ? ' · 已上阵' : ''}`,
      id: `setpos_${idx}_${id}`,
    };
  });
  picker(`位置 ${idx + 1}（${idx < 2 ? '前排' : '后排'}）`, items, '上阵 5 格：前 2 后 3，主角占一格');
}
on('party_add', () => {
  const empty = S().party.indexOf(null);
  if (empty < 0) { CV.toast('队伍满了，先点一位换下来'); return; }
  pickPartyMember(empty);
});
on('auto_equip', () => { const r = Core.autoEquipBest(); CV.toast(`一键最优装备：调整了 ${r.changed} 处`); });
[0, 1, 2].forEach(i => {
  on('preset_save_' + i, () => { const r = Core.savePreset(i); CV.toast(r.msg); });
  on('preset_use_' + i, () => { const r = Core.applyPreset(i); CV.toast(r.msg); });
});

/* ---------- 主角 ---------- */
on('attr_add5', () => {
  const s = S();
  if (!s.player.attrPoints) { CV.toast('没有可用属性点'); return; }
  const ids = D.ATTR_META.map(x => x.id);
  let n = 0;
  while (s.player.attrPoints > 0 && n < 5) { Core.allocateAttr(ids[n % ids.length], 1); n++; }
  CV.toast('已分配 5 点');
});
on('reset_attrs', () => { const r = Core.resetAttrs(); CV.toast(r.msg); });
on('reset_skills', () => { const r = Core.resetSkills(); CV.toast(r.msg); });
on('realm_try', () => { const r = Core.attemptRealm(); CV.toast(r.msg); });
on('name_roll', () => { nameIdx = (nameIdx + 1) % NAMES.length; });
on('name_ok', () => { Core.setPlayerName(NAMES[nameIdx]); CV.reset('bloodline'); });

/* ---------- 背包 ---------- */
['item', 'mat', 'equip'].forEach(pool => on('bagpool_' + pool, () => { CV.top().params.pool = pool; }));
on('stash_claim', () => {
  const r = Core.claimStash();
  CV.toast(r.moved ? `领回 ${r.moved} 件${r.left ? `，还有 ${r.left} 件装不下` : ''}` : '背包还是满的，先扩容');
});

/* ---------- 设置 ---------- */
['sfx', 'autoBattle', 'autoNext', 'confirmBig', 'autoSellN', 'autoSellR'].forEach(k => on('toggle_' + k, () => {
  const s = S();
  const cur = (k === 'autoSellN' || k === 'autoSellR') ? !!s.settings[k] : s.settings[k] !== false;
  s.settings[k] = !cur;
  Core.save();
  CV.toast('已' + (s.settings[k] ? '开启' : '关闭'));
}));
on('save_export', () => {
  const json = Core.exportSave();
  if (wx.setClipboardData) wx.setClipboardData({ data: json, success: () => CV.toast('存档已复制到剪贴板'), fail: () => CV.toast('复制失败') });
  else CV.toast('当前环境不支持复制');
});
on('save_import', () => {
  if (!wx.getClipboardData) { CV.toast('当前环境不支持从剪贴板导入'); return; }
  wx.getClipboardData({
    success: res => {
      const txt = String((res && res.data) || '').trim();
      if (!txt || txt[0] !== '{') { CV.toast('剪贴板里没有存档内容（先去导出一次并复制）'); return; }
      const r = Core.importSave(txt);
      CV.toast(r.ok ? '导入成功，进度已覆盖' : (r.msg || '导入失败'));
      if (r.ok) CV.reset('home');
    },
    fail: () => CV.toast('读取剪贴板失败'),
  });
});
[1, 2, 3].forEach(v => on('speed_' + v, () => {
  S().settings.speed = v;
  Core.save();
  CV.toast(`战斗速度 ${v}×`);
}));
[1, 2, 3].forEach(v => {
  on('slot_save_' + v, () => { const ok = Core.saveSlot(v); CV.toast(ok ? `已保存到存档槽 ${v}` : '保存失败'); });
  on('slot_load_' + v, () => {
    const ok = Core.loadSlot(v);
    CV.toast(ok ? `已读取存档槽 ${v}` : '这个槽是空的');
    if (ok) CV.reset('home');
  });
});
on('save_wipe', () => {
  const doIt = () => { Core.wipeSave(); if (wx.reLaunch) wx.reLaunch({}); };
  if (!wx.showModal) { doIt(); return; }
  wx.showModal({
    title: '删除进度', content: '将永久删除当前游戏进度，确定？', confirmText: '删除',
    success: res => { if (res.confirm) doIt(); },
  });
});

/* ---------- 前缀型（动态 id） ---------- */
onP('nav_', () => {});                       // 框架已处理，这里占位避免落到"还没接上"
onP('open_world_', id => CV.open('world', { worldId: id.slice(11), diff: 'normal' }));
onP('wdiff_', id => { CV.top().params = { worldId: CV.top().params.worldId, diff: id.slice(6) }; });
onP('stage_', id => {
  const [, wid, diff, idx] = id.split('_');
  Scr.startStage(wid, diff, +idx);
});
onP('sweep_', id => {
  const [, wid, diff, stage, times] = id.split('_');
  const n = times === '0' ? Core.sweepLeft() : +times;
  const r = Dungeon.sweep(wid, diff, +stage, n);
  if (!r.ok) { CV.toast(r.msg); return; }
  const agg = { equips: 0, items: 0, exp: 0 };
  r.total.forEach(t => t.got.forEach(g => {
    if (g.k === 'equip') agg.equips++;
    else if (g.k === 'item') agg.items += (g.n || 1);
    else if (g.k === 'exp') agg.exp += g.v;
    else agg[g.k] = (agg[g.k] || 0) + g.v;
  }));
  CV.back();
  const parts = [`EXP+${fmt(agg.exp)}`];
  ['points', 'otherworld', 'story', 'skillChip'].forEach(k => { if (agg[k]) parts.push(`${curIconLocal(k)}+${fmt(agg[k])}`); });
  if (agg.equips) parts.push(`装备×${agg.equips}`);
  if (agg.items) parts.push(`道具×${agg.items}`);
  CV.toast(`扫荡 ×${r.count}：` + parts.join(' '));
});
onP('setpos_', id => {
  const [, idx, charId] = id.split('_');
  const s = S();
  const i = +idx;
  s.party[i] = charId;
  s.party = s.party.map((x, j) => (j !== i && x === charId ? null : x));
  Core.save();
  CV.back();
  CV.toast(`${Core.charName(charId)} 已上阵`);
});
onP('char_', id => CV.open('char', { id: id.slice(5) }));
onP('lvup_', id => { const r = Core.levelUp(id.slice(5), 1); CV.toast(r.msg); });
onP('starup_', id => { const r = Core.starUp(id.slice(7)); CV.toast(r.msg); });
onP('blup_', id => { const r = Core.bloodlineUpgrade(id.slice(5)); CV.toast(r.msg); });
onP('skillup_', id => { const [, cid, i] = id.split('_'); const r = Core.skillUp(cid, +i); CV.toast(r.msg); });
onP('feed_', id => {
  const cid = id.slice(5), s = S();
  const items = Object.keys(s.items).filter(k => (D.ITEMS[k] || {}).type === 'exp').map(k => ({
    label: D.ITEMS[k].name, sub: `现有 ${s.items[k]} · 每个 +${fmt(D.ITEMS[k].exp)} EXP · 点一下全部喂掉`, id: `useexp_${cid}_${k}`,
  }));
  picker('喂经验模块', items, '经验模块也能在背包 → 道具里点开看来源');
});
onP('useexp_', id => { const [, cid, k] = id.split('_'); const r = Core.useExpItem(cid, k, 999); CV.toast(r.msg); CV.back(); });
onP('attr_', id => { const r = Core.allocateAttr(id.slice(5), 1); CV.toast(r.msg); });
onP('pskill_', id => { const r = Core.allocateSkill(+id.slice(7)); CV.toast(r.msg); });
onP('blood_', id => { const r = Core.choosePlayerBloodline(id.slice(6)); CV.toast(r.msg); if (r.ok) CV.reset('home'); });
onP('item_', id => CV.open('item', { id: id.slice(5) }));
onP('box_', id => {
  const [, k, n] = id.split('_');
  const have = S().items[k] || 0;
  const r = Core.openBoxes(k, n === '0' ? have : +n);
  CV.toast(r.ok ? `开出 ${r.count} 件${r.sold ? `（自动分解 ${r.sold} 件）` : ''}` : '没有可开的箱子');
});
onP('feedpick_', id => {
  const k = id.slice(9);
  const items = Object.keys(S().chars).map(cid => ({ label: Core.charName(cid), sub: `Lv.${S().chars[cid].lv}`, id: `useexp2_${cid}_${k}` }));
  picker('喂给谁', items, `把 ${D.ITEMS[k].name} 喂给某位伙伴`);
});
onP('useexp2_', id => { const [, cid, k] = id.split('_'); const r = Core.useExpItem(cid, k, 999); CV.toast(r.msg); CV.back(); });
onP('expand_', id => { const r = Core.buyBagCap(id.slice(7) === 'equip' ? 'eq' : id.slice(7)); CV.toast(r.msg); });
onP('equipnew_', id => {
  const rest = id.slice(9);                       // charId_slot
  const i = rest.lastIndexOf('_');
  pickEquipFor(rest.slice(0, i), rest.slice(i + 1));
});
onP('pequipnew_', id => pickEquipFor('@player', id.slice(10)));
onP('equip_', id => CV.open('equip', { uid: id.slice(6) }));
onP('doequip_', id => {
  const rest = id.slice(8);
  const i = rest.indexOf('_');
  const cid = rest.slice(0, i), uid = rest.slice(i + 1);
  const r = Core.equipItem(cid, uid);
  CV.toast(r ? `${Core.charName(cid)} 换上了装备` : '穿不上（部位或定位不符）');
  CV.back();
});
onP('enh_', id => { const r = Core.enhance(id.slice(4)); CV.toast(r.msg); });
onP('lock_', id => { const r = Core.toggleEquipLock(id.slice(5)); CV.toast(r.lock ? '🔒 已锁定' : '🔓 已解锁'); });
onP('decomp_', id => {
  const r = Core.decompose(id.slice(7));
  if (r.ok) { CV.toast(`分解成功，获得 ◆${r.gain}`); CV.back(); } else CV.toast(r.msg || '分解失败');
});
onP('equipto_', id => {
  const uid = id.slice(8), e = S().equips[uid];
  if (!e) return;
  const items = ['@player'].concat(Object.keys(S().chars))
    .filter(cid => Core.canEquip(cid, e))
    .map(cid => ({ label: Core.charName(cid), sub: cid === '@player' ? '主角' : `Lv.${S().chars[cid].lv}`, id: `doequip_${cid}_${uid}` }));
  picker('装备给…', items, '一件装备只能有一个人穿');
});
function pickEquipFor(charId, slot) {
  const s = S();
  const worn = {};
  Object.values(s.equipped || {}).forEach(sl => Object.values(sl || {}).forEach(u => { if (u) worn[u] = 1; }));
  const items = Object.values(s.equips)
    .filter(e => e.slot === slot && !worn[e.uid] && Core.canEquip(charId, e))
    .sort((a, b) => Core.equipScore(b) - Core.equipScore(a))
    .slice(0, 40)
    .map(e => ({ label: `${e.name} +${e.enhance}`, sub: `${e.rarity} · 评分 ${Math.round(Core.equipScore(e))}`, id: `doequip_${charId}_${e.uid}` }));
  picker(`给 ${Core.charName(charId)} 换${D.EQUIP_SLOTS[slot]}`, items, '只列能穿的（部位 / 定位 / 专属限制都算过）');
}
onP('pull_', id => {
  const [, pool, n] = id.split('_');
  if (n === '1') {
    const r = Core.recruitOnce(pool);
    CV.toast(r.error ? r.error : `抽到 ${r.name}（${r.rarity}）${r.isNew ? ' · 新伙伴！' : ` · 碎片 +${r.shards}`}`);
  } else {
    const r = Core.recruitTen(pool);
    if (r.error) { CV.toast(r.error); return; }
    const best = r.results.reduce((a, b) => (D.RARITIES.indexOf(b.rarity) > D.RARITIES.indexOf(a.rarity) ? b : a), r.results[0]);
    CV.toast(`十连完成：最高 ${best.rarity} ${best.name}${best.isNew ? '（新）' : ''}`);
    lastPulls = r.results;
    CV.open('pullresult');
  }
});

/* 十连结果：一条条列出来（网页版也是这个做法），高稀有度用颜色挑出来 */
let lastPulls = [];
CV.register('pullresult', function () {
  const list = (lastPulls || []).slice().sort((a, b) => D.RARITIES.indexOf(b.rarity) - D.RARITIES.indexOf(a.rarity));
  const newN = list.filter(x => x.isNew).length;
  L.text(`这次十连：新伙伴 ${newN} 名`, { size: 15, bold: true, color: CV.C.gold });
  L.text('重复的伙伴会自动转成碎片，碎片用来升星', { size: 11, color: CV.C.dim });
  list.forEach((x, i) => {
    L.row(`${i + 1}. ${x.name}`, x.isNew ? '新伙伴 ✨' : `转碎片 +${x.shards || 0}${x.isUp ? ' · 当期 UP' : ''}`, {
      value: x.rarity, valueColor: D.RARITY_COLOR[x.rarity],
    });
  });
  L.btn('继续招募', 'back', { primary: true });
});
onP('keji_', id => { const r = Core.kejiUp(id.slice(5), 1); CV.toast(r.msg); });
onP('fabao_buy_', id => { const r = Core.buyFabao(id.slice(10)); CV.toast(r.msg); });
onP('fabao_on_', id => { const r = Core.wearFabao(id.slice(9)); CV.toast(r.msg); });
onP('mount_buy_', id => { const r = Core.buyMount(id.slice(10)); CV.toast(r.msg); });
onP('mount_on_', id => { const r = Core.wearMount(id.slice(9)); CV.toast(r.msg); });
onP('plant_', id => { const i = +id.slice(6); const r = Core.plantGarden(i, D.GARDEN[i].id); CV.toast(r.msg); });
onP('harvest_', id => { if (id === 'harvest_all') return; const r = Core.harvestGarden(+id.slice(8)); CV.toast(r.msg); });
on('harvest_all', () => { const r = Core.harvestAllGarden(); CV.toast(r.msg); });
on('arena_fight', () => {
  const st = Core.arenaState();
  Scr.startBattle({
    title: `斗法台 第 ${st.floor} 台`, worldId: null, kind: 'combat', enemies: st.enemies, back: 'arena',
    onWin: () => ({
      label: '返回', run: () => { const r = Core.arenaSettle(true); CV.reset('arena'); CV.toast(r.msg || ''); },
    }),
  });
});
on('sign_draw', () => { const r = Core.drawSign(); CV.toast(r.msg); });
onP('build_', id => { const r = Core.upgradeBuilding(id.slice(6)); CV.toast(r.msg); });
on('genelock_up', () => { const r = Core.geneLockUnlock(); CV.toast(r.msg); });
on('auth_up', () => { const r = Core.upgradeAuthority(); CV.toast(r.msg); });
onP('hatch_', id => { const n = +id.slice(6); const r = Core.hatchBeast(n); CV.toast(r.ok ? r.msg : r.msg); });
onP('beast_', id => {
  const bid = id.slice(6);
  const x = Core.beastState().list.find(v => v.id === bid);
  if (!x) { CV.toast('还没有这只伴生体'); return; }
  picker(x.b.name, [
    { label: x.active ? '已随行' : '设为随行', id: 'beastset_' + bid },
    { label: `升级（兽魂 ${D.BEAST_SOUL_PER_LV * x.lv}）`, sub: `Lv.${x.lv}/${D.BEAST_MAX_LV}`, id: 'beastlv_' + bid },
  ], x.b.desc || '随行一只，给全队加成 + 五行克制');
});
onP('beastset_', id => { const r = Core.setActiveBeast(id.slice(9)); CV.toast(r.msg); CV.back(); });
onP('beastlv_', id => { const r = Core.beastLevelUp(id.slice(8)); CV.toast(r.msg); });
onP('talent_', id => { const r = Core.buyTalent(id.slice(7)); CV.toast(r.ok ? '天赋提升成功' : r.msg); });
on('do_reincarn', () => { const r = Core.reincarnate(); CV.toast(r.ok ? `转生成功，获得 ♾${r.rp}` : r.msg); });
onP('codex_', id => { const r = Core.claimCodexReward(+id.slice(6)); CV.toast(r.msg); });
onP('craft_', id => { const r = Core.craftSerum(id.slice(6), 1); CV.toast(r.msg); });
onP('serum_p_', id => { const r = Core.useSerum('@player', id.slice(8), 1); CV.toast(r.msg); });
onP('line_', id => {
  const lid = id.slice(5);
  const line = D.IDLE_LINES.find(l => l.id === lid);
  const s = S();
  const items = [{ label: '撤下领队', id: `linepick_${lid}__none` }].concat(
    Object.keys(s.chars).filter(cid => !s.party.includes(cid)).map(cid => ({
      label: Core.charName(cid),
      sub: `${line.attrName} ${Math.round((Core.effectiveStats(cid).attrs[line.attr] || 0))}`,
      id: `linepick_${lid}_${cid}`,
    })));
  picker(line.name, items, `这条线看领队的【${line.attrName}】，上阵主力不能派`);
});
onP('linepick_', id => {
  const rest = id.slice(9);
  const i = rest.indexOf('_');
  const lid = rest.slice(0, i), cid = rest.slice(i + 1);
  const r = Core.setIdleLeader(lid, cid === '_none' ? null : cid);
  CV.toast(r.msg);
  CV.back();
});
onP('task_', id => { if (id === 'task_all') return; const r = Core.claimTask(id.slice(5)); CV.toast(r.ok ? '奖励已领' : (r.msg || '还没完成')); });
on('task_all', () => { const r = Core.claimAllTasks(); CV.toast(r.ok ? '全部日常奖励已领' : (r.msg || '还有没完成的')); });
onP('weekly_', id => { if (id === 'weekly_all') return; const r = Core.claimWeekly(id.slice(7)); CV.toast(r.msg || (r.ok ? '已领' : '没完成')); });
on('weekly_all', () => { const r = Core.claimAllWeekly(); CV.toast(r.msg || (r.ok ? '周常全清奖励已领' : '')); });
onP('ach_', id => { const r = Core.claimAchievement(id.slice(4)); CV.toast(r.msg); });
on('bounty_renew', () => { const r = Core.renewBounties(); CV.toast(r.msg); });
onP('bounty_', id => { const r = Core.claimBounty(id.slice(7)); CV.toast(r.msg); });
onP('buy_', id => {
  const rest = id.slice(4);                       // shopKey_idx
  const i = rest.lastIndexOf('_');
  const r = Core.buyShopItem(rest.slice(0, i), +rest.slice(i + 1));
  CV.toast(r.msg || (r.ok ? '购买成功' : '买不了'));
});

function curIconLocal(k) { const c = D.CURRENCIES.find(x => x.id === k); return c ? c.icon : ''; }

function startCorridor() {
  const s = S(), floor = s.corridor.floor;
  const spec = D.corridorEnemy(floor);
  const enemies = [spec];
  if (spec.isBoss) enemies.push({ name: '深井之影', hp: Math.round(spec.hp * 0.3), atk: Math.round(spec.atk * 0.5), def: Math.round(spec.def * 0.5), spd: 70, faction: null, eva: 0.05 });
  Scr.startBattle({
    title: `深井 · 第 ${floor} 层`, worldId: null, kind: spec.isBoss ? 'boss' : 'combat', enemies, back: 'worlds',
    onWin: () => {
      const rw = D.corridorReward(floor);
      Core.addCur('points', rw.points); Core.addCur('story', rw.story); Core.addCur('corridor', rw.corridor);
      if (rw.bloodCrystal) Core.addCur('bloodCrystal', rw.bloodCrystal);
      const before = Core.corridorMarks();
      s.corridor.floor++; s.corridor.best = Math.max(s.corridor.best, floor);
      Core.battleSettle({}, true, spec.isBoss);
      Core.save();
      const gotMark = Core.corridorMarks() > before;
      return { label: '继续下一层', run: () => { CV.reset('worlds'); CV.toast(`深井通过：◈+${fmt(rw.points)} · ♜+${rw.corridor}${gotMark ? ' · 获得深井印记' : ''}`); } };
    },
  });
}

/* ================= 启动 ================= */
function boot() {
  const canvas = wx.createCanvas();               // 第一次创建 = 上屏 canvas
  CV.ctx = canvas.getContext('2d');
  let info = {};
  try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (e) { info = {}; }
  CV.DPR = info.pixelRatio || 2;
  CV.setup(info);                       // 自适应：算缩放 / 居中偏移 / 刘海与底部安全区
  canvas.width = CV.pxW * CV.DPR;
  canvas.height = CV.pxH * CV.DPR;
  // 浏览器预览时把 CSS 尺寸也同步（小游戏里 canvas.style 不存在，跳过）
  if (canvas.style) { canvas.style.width = CV.pxW + 'px'; canvas.style.height = CV.pxH + 'px'; }
  CV.ctx.scale(CV.DPR, CV.DPR);
  CV.statusText = () => {
    const s = S();
    if (!s) return '';
    // 前面带上游戏名：提审材料要求"截图内能看到小游戏名字"
    return `残域灯阁 · ${s.player.name || '执灯者'} Lv.${s.player.level}   ◈${fmt(s.cur.points)} ✦${fmt(s.cur.holy)} ◆${fmt(s.cur.otherworld)}`;
  };
  CV.tabs = [
    { panel: 'home', name: '灯阁' },
    { panel: 'worlds', name: '残域' },
    { panel: 'party', name: '执灯者' },
    { panel: 'bag', name: '背包' },
  ];

  if (!Core.load()) { Core.newGame(); }
  Core.ensureDaily();
  const off = Core.settleOffline();                // 离线收益由核心层入账
  // 新档：欢迎页 → 起名 → 选血统 → 首页（与网页版的新手流程一致）
  if (!S().player.name) CV.reset('welcome');
  else if (!S().player.bloodline) CV.reset('bloodline');
  else CV.reset('home');
  if (off && off.seconds >= 60) {
    CV.lastOffline = off;                          // 存下来给「离线翻倍」用
    CV.toast(`离线 ${CV.hhmmss(off.seconds)}：+◈${fmt(off.gains.points)}（首页可看广告翻倍）`);
  }
  // 七日登录：网页版是开游戏自动弹窗，小游戏版直接发 + 给一个常驻入口
  if (S().player.name) {
    const lr = Core.loginReward();
    if (lr) CV.toast(`◀ 七日登录第 ${lr.day} 天：${rewardText(lr.reward)}`);
  }

  const T = (e, fn) => { const t = e.touches && e.touches[0]; if (t) fn(t.clientX !== undefined ? t.clientX : t.pageX, t.clientY !== undefined ? t.clientY : t.pageY); };
  if (wx.onTouchStart) wx.onTouchStart(e => { T(e, CV.onTouchStart); CV.draw(); });
  if (wx.onTouchMove) wx.onTouchMove(e => { T(e, CV.onTouchMove); });
  if (wx.onTouchEnd) wx.onTouchEnd(e => {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (t) CV.onTouchEnd(t.clientX !== undefined ? t.clientX : t.pageX, t.clientY !== undefined ? t.clientY : t.pageY);
    CV.draw();
  });
  if (wx.onShow) wx.onShow(() => { Core.save(); CV.draw(); });
  if (wx.onHide) wx.onHide(() => { Core.save(); });

  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(10, (now - last) / 1000);
    last = now;
    Core.onlineTick(dt);
    CV.draw();
  }, 1000);
  // 战斗播放单独一条快循环：只有打仗的时候才跑，省电
  setInterval(() => {
    if (!Scr.battle()) return;
    Scr.tickBattle();
    CV.draw();
  }, 120);
  setInterval(() => Core.save(), 15000);
  CV.draw();
}

module.exports = {
  boot,
  _draw: CV.draw,
  _dispatch: CV.dispatch,
  _open: CV.open,
  _reset: CV.reset,
  _stack: () => CV.stack,
  _hits: () => CV.hits,
  _touch: (x0, y0, x1, y1) => { CV.onTouchStart(x0, y0); if (y1 !== undefined) CV.onTouchMove(x0, y1); CV.onTouchEnd(x1 === undefined ? x0 : x1, y1 === undefined ? y0 : y1); },
};
