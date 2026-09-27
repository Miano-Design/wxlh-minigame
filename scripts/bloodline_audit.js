/* 血统 / 阵营 联动体检：node scripts/bloodline_audit.js
 *
 * 起因（V9.6.86 那一轮）：血统从"出身"改成"定位"、阵营从职业词改成地名之后，
 * 一张表动了，**下游七八处跟着动**：境界线 / 血统技能 / 专属血清 / 套装模板 / 神装 /
 * 装备名词库 / 阵营成员 / 克制环 / 世界主题映射 / 阵型 / 限定池 UP。
 * 少接一处不会报错，只会"悄悄少一块"（那一轮就抓到过：泰坦套装没有、词条池缺精神）。
 * 这把尺子把这条链子整根量一遍，改血统或阵营之后跑一下就知道有没有漏接。
 *
 * 只读。纯逻辑层（data/core/battle/dungeon），两边通用。 */
const fs = require('fs');
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [] };
global.setTimeout = () => 0; global.setInterval = () => 0;
global.Blob = function () {}; global.URL = { createObjectURL: () => '' }; global.FileReader = function () {};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) eval(fs.readFileSync(f, 'utf8'));
const C = window.Core, D = window.DATA, B = window.Battle, Dun = window.Dungeon;

let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : '')); };
const BLS = Object.keys(D.BLOODLINES);

console.log('=== ① 血统 → 下游系统（每一支都要接到）===');
t('每支血统都有 9 大境界', BLS.every(bl => (D.BLOODLINES[bl].realms || []).length === 9));
t('每支血统都有 4 个血统技能', BLS.every(bl => { const s = D.BLOODLINE_SKILLS[bl]; return s && s.s1 && s.s2 && s.ult && s.passive; }));
t('每支血统都有专属血清', BLS.every(bl => D.SERUMS.some(x => x.bloodline === bl)),
  D.SERUMS.filter(x => x.bloodline).map(x => x.name).join(' '));
t('每支血统都有套装模板 + 神装', BLS.every(bl => !!D.BLOOD_SET_TEMPLATE[bl] && !!D.GOD_SETS[bl]));
t('每支血统都有装备名词库（射手出枪、肉盾出盾）',
  BLS.every(bl => D.BLOODLINE_EQUIP_NAMES[bl] && D.BLOODLINE_EQUIP_NAMES[bl].weapon && D.BLOODLINE_EQUIP_NAMES[bl].armor));
t('每支血统都有成员', BLS.every(bl => D.characters.some(c => c.bloodline === bl)));
t('每支血统的 role 都写清楚了（伙伴卡上只显示血统，得让人知道它是干什么的）',
  BLS.every(bl => !!D.BLOODLINES[bl].role));
t('血统与战斗模板一一对应', BLS.every(bl => D.characters.filter(c => c.bloodline === bl).every(c => c.kind === D.BLOODLINE_KIND[bl])));

console.log('\n=== ② 阵营 → 下游系统 ===');
t('四个阵营都有成员', D.FACTIONS.every(f => D.characters.some(c => c.faction === f)));
t('每个角色的阵营都在表里', D.characters.every(c => D.FACTIONS.indexOf(c.faction) >= 0),
  D.characters.filter(c => D.FACTIONS.indexOf(c.faction) < 0).map(c => c.name).join(',') || '✓');
t('克制环是完整的四元环（转四圈回自己）',
  (() => { let f = D.FACTIONS[0]; for (let i = 0; i < 4; i++) f = D.FACTION_COUNTER[f]; return f === D.FACTIONS[0]; })(),
  JSON.stringify(D.FACTION_COUNTER));
t('世界主题 → 敌人阵营 都是合法值',
  ['bio', 'ghost', 'mystic', 'tech', 'god'].every(k => { const f = Dun.THEME_FACTION[k]; return f === null || D.FACTIONS.indexOf(f) >= 0; }),
  JSON.stringify(Dun.THEME_FACTION));

console.log('\n=== ③ 真跑一遍：阵型 / 克制 / 限定池 ===');
{
  C.newGame(); C.setPlayerName('联动体检'); C.choosePlayerBloodline('狼人');
  const fac = '灰原';
  const same = D.characters.filter(c => c.faction === fac && c.bloodline === '狼人').slice(0, 4).map(c => c.id);
  same.forEach(id => { C.addChar(id); C.S.chars[id].lv = 30; });
  C.S.party = ['@player'].concat(same);
  const fst = C.formationState(C.S.party);
  t('同乡 5 人（' + fac + '）能成阵', !!(fst && fst.names && fst.names.length), fst ? fst.names.join('+') : '(没成阵)');

  const mk = (faction, uid) => ({ name: '木桩', kind: 'warrior', faction, position: 'front', skills: D.BLOODLINE_SKILLS['狼人'], skillLv: [0, 0, 0], atk: 1000, def: 100, hp: 99999, spd: 60, crit: 0, critDmg: 2, eva: 0, skillMult: 1, uid });
  const real = Math.random; Math.random = () => 0.5;      // 钉住随机：只看克制系数的差异
  /* 只统计**我方打出去**的伤害 —— 一开始把敌人回打的伤害也加进来了，
     两边一抵消，"克制 vs 被克"只看出来 4 点差距（假绿）。 */
  const hit = (fac2) => {
    const r = B.run({ allies: [mk('灰原', 'a')], enemies: [mk(fac2, 'b')], worldId: null, maxRounds: 3 });
    const myUid = r.frames[0].allies[0].uid;
    return r.frames.filter(f => f.type === 'damage' && f.source === myUid).reduce((a, b) => a + b.dmg, 0);
  };
  const win = hit('雾乡'), lose = hit('幽都');
  Math.random = real;
  t('克制环真的生效（打被克阵营 > 打克你的阵营）', win > lose, '克制 ' + win + ' vs 被克 ' + lose);

  const up = D.recruitUpChar ? D.recruitUpChar() : null;
  t('限定池的本期 UP 是一名合法伙伴（阵营拿得到）', !!(up && up.id && D.FACTIONS.indexOf(up.faction) >= 0), up ? up.name + '（' + up.faction + '）' : '(取不到)');
}

/* ==================================================================================
   ④ 机制按伙伴（V1.1.1 · 父亲大人 0926：「机制不是血统机制哦，是对应到不同的伙伴」）
   ----------------------------------------------------------------------------------
   这一节钉的是"同血统的人出手方式必须不一样"。判据来自材料《收口4》§1.3：
     ① 每个人三元组齐全、原子存在、s1/s2/ult/passive 一个不缺
     ② **同血统内两两不重复**（他那句"队伍组合才有可能性"的硬判据）
     ③ 池子里没有"形状一样、只差倍率"的两条原子（那种不算"不同机制"）
     ④ 技能/buff 字段全在战斗引擎白名单内（写了不生效＝静默 bug，这条一次堵死）
     ⑤ 必杀的目标形状必须跟血统基准一致（换形状＝白送/砍掉一个强度档，材料《定调》§4.4 算过账）
   改坏试验（跑过、都会红）：同血统两人改成同一三元组 → ②红；给原子塞一个 `critDmg`（引擎不认的键）→ ④红；
   把某条原子删成"只留倍率"（hits/status 去掉）→ ③红；把某人的必杀换成另一种形状 → ⑤红。
   ================================================================================== */
console.log('\n=== ④ 机制按伙伴（同血统两两不重复 · 只用引擎白名单字段）===');
{
  const POOL = D.MECH_POOL || {};
  const MECH = D.CHAR_MECH || {};
  const SKILL_FIELDS = ['name', 'tag', 'desc', 'cd', 'type', 'target', 'mult', 'hits', 'pierce', 'status', 'buff', 'lifesteal', 'execute'];
  const BUFF_KEYS = ['atkPct', 'defPct', 'spdPct', 'critPct', 'skillPct', 'evaPct', 'lifesteal', 'poisonOnHit', 'turns'];
  const TYPES = ['dmg', 'heal', 'cleanseHeal', 'shield', 'teamshield', 'buff', 'debuff', 'energy'];
  const TARGETS = ['enemy', 'allEnemies', 'self', 'team', 'lowest', 'topAlly', 'random'];

  const missing = [], badAtom = [], badSkill = [], badField = [], badBuff = [];
  D.characters.forEach(ch => {
    const m = MECH[ch.id];
    if (!m || m.length !== 3) { missing.push(ch.id); return; }
    m.forEach(id => { if (!POOL[id]) badAtom.push(ch.id + ':' + id); });
    const sk = ch.skills || {};
    ['s1', 's2', 'ult'].forEach(slot => {
      const s = sk[slot];
      if (!s) { badSkill.push(ch.id + '.' + slot); return; }
      if (TYPES.indexOf(s.type) < 0) badField.push(ch.id + '.' + slot + ' type=' + s.type);
      if (TARGETS.indexOf(s.target) < 0) badField.push(ch.id + '.' + slot + ' target=' + s.target);
      Object.keys(s).forEach(k => { if (SKILL_FIELDS.indexOf(k) < 0) badField.push(ch.id + '.' + slot + ' 多出字段 ' + k); });
      if (s.type !== 'buff' && s.type !== 'debuff' && !(s.mult >= 0)) badField.push(ch.id + '.' + slot + ' mult');
      if (s.buff) Object.keys(s.buff).forEach(k => { if (BUFF_KEYS.indexOf(k) < 0) badBuff.push(ch.id + '.' + slot + ' buff.' + k); });
    });
    if (!(sk.passive && sk.passive.name)) badSkill.push(ch.id + '.passive');
  });
  t('① 120 人都有三元组、原子都在池子里、s1/s2/ult/passive 都齐',
    !missing.length && !badAtom.length && !badSkill.length,
    ((missing.length ? '缺三元组 ' + missing.length + ' 人' : '') + (badAtom.length ? ' · 原子不存在 ' + badAtom.slice(0, 3).join(',') : '')
      + (badSkill.length ? ' · 技能缺槽 ' + badSkill.slice(0, 3).join(',') : '')) || '全齐');
  t('④-a 技能字段只用引擎认识的（type/target/mult/hits/pierce/status/buff/lifesteal/execute）',
    !badField.length, badField.length ? badField.slice(0, 4).join(' · ') : '干净');
  t('④-b buff 键全在引擎白名单内（写了不生效的一律报红）',
    !badBuff.length, badBuff.length ? badBuff.slice(0, 4).join(' · ') : '干净');

  const byBl = {};
  D.characters.forEach(ch => { (byBl[ch.bloodline] = byBl[ch.bloodline] || []).push(ch); });
  const dups = [];
  Object.keys(byBl).forEach(bl => {
    const seen = {};
    byBl[bl].forEach(ch => {
      const k = (MECH[ch.id] || []).join('|');
      if (seen[k]) dups.push(bl + '：' + seen[k] + ' 与 ' + ch.id + ' 同三元组');
      seen[k] = ch.id;
    });
  });
  t('② 同血统内任意两人的机制三元组都不同', !dups.length,
    dups.length ? dups.slice(0, 2).join(' · ') : Object.keys(byBl).map(bl => bl + byBl[bl].length + '人✓').join(' '));

  const shapeOf = a => [a.type, a.target, a.hits || 1, a.pierce ? 'P' : '', a.status ? a.status.id + (a.status.chance ? 'c' : '') : '',
    a.lifesteal ? 'L' : '', a.execute ? 'E' : '', a.buff ? Object.keys(a.buff).filter(k => k !== 'turns').sort().join('+') : ''].join('|');
  const fam = { 打击: D.MECH_HIT_IDS, 治疗: D.MECH_HEAL_IDS, 功能: D.MECH_FN_IDS, 必杀全体: D.MECH_ULT_DPS_ALL_IDS, 必杀单体: D.MECH_ULT_DPS_ONE_IDS, 必杀辅助: D.MECH_ULT_SUP_IDS };
  const sameShape = [];
  Object.keys(fam).forEach(f => {
    const ids = (fam[f] || []).filter(id => POOL[id]);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (shapeOf(POOL[ids[i]]) === shapeOf(POOL[ids[j]])) sameShape.push(f + '：' + ids[i] + ' 与 ' + ids[j]);
    }
  });
  t('③ 池子里没有"形状一样、只差倍率"的两条原子（那种不算"不同机制"）',
    !sameShape.length, sameShape.length ? sameShape.slice(0, 3).join(' · ') : '干净');
  const ultShapeBad = D.characters.filter(ch => {
    const base = D.BLOODLINE_SKILLS[ch.bloodline];
    if (!base) return false;
    return ch.skills.ult.target !== base.ult.target;
  });
  t('⑤ 必杀的目标形状与血统基准一致（全体/单体不许互换）', !ultShapeBad.length,
    ultShapeBad.length ? ultShapeBad.slice(0, 3).map(c => c.name + ' ' + c.skills.ult.target).join(' · ') : '一致');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
