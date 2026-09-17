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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
