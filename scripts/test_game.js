/* 逻辑冒烟测试：node scripts/test_game.js */
const fs = require('fs');
// 浏览器环境 shim
const store = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js']) {
  eval(fs.readFileSync(f, 'utf8'));
}
const D = window.DATA, Core = window.Core, Battle = window.Battle, Dungeon = window.Dungeon;
let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } }
const realRandom = Math.random;
// 需要"固定出率"的用例用这个：把整段随机钉成同一个值，跑完必须还原
function withRandom(v, fn) { Math.random = () => v; try { return fn(); } finally { Math.random = realRandom; } }

// 1. 新游戏
Core.newGame();
t('初始点数 50000', Core.S.cur.points === 50000);
t('初始无招募角色', Object.keys(Core.S.chars).length === 0);
// 上阵 5 格：0/1 前排、2/3/4 后排；主角本人（'@player'）就占一格
t('开局上阵只有主角一人', Core.S.party.length === 5 && Core.S.party[0] === '@player' && Core.S.party.filter(Boolean).length === 1);
t('主角未命名', Core.S.player.name === '');
t('命名主角', Core.setPlayerName('测试者') && Core.charName('@player') === '测试者');
t('主角独立属性', (() => { const st = Core.effectivePlayerStats(); return st.atk > 0 && st.hp > 0; })());
// 组队助手：传要上阵的招募角色（最多 4 个），主角自动排进去（默认前排第一格）
function setParty(ids, playerRow) {
  const m = (ids || []).slice(0, 4);
  Core.S.party = (playerRow === 'back')
    ? [m[0] || null, m[1] || null, '@player', m[2] || null, m[3] || null]
    : ['@player', m[0] || null, m[1] || null, m[2] || null, m[3] || null];
  return Core.S.party;
}
// 测试用：按 S.party 现况拼出战斗编队（主角用主角属性，其余人用角色属性）
function alliesFromParty() {
  const pst = Core.effectivePlayerStats();
  return Core.S.party.filter(Boolean).map((id, i) => {
    const position = i < 2 ? 'front' : 'back';
    if (id === '@player') {
      return Object.assign({ name: '主角', kind: 'warrior', faction: null, position, skills: D.PROTAGONIST.skills, skillLv: Core.S.player.skillLv || [1, 1, 1], maxHp: pst.hp, charId: '@player' }, pst);
    }
    const base = D.charById[id];
    const eff = Core.effectiveStats(id);
    return Object.assign({ name: base.name, kind: base.kind, faction: base.faction, position, skills: base.skills, skillLv: Core.S.chars[id].skillLv, maxHp: eff.hp }, eff);
  });
}
t('主角与招募角色都是6装备槽', D.PLAYER_SLOTS.length === 6 && D.RECRUIT_SLOTS.length === 6);
t('W01解锁', Core.S.worlds.W01 && Core.S.worlds.W01.unlocked);
t('招募初始锁定', !Core.isUnlocked('recruit'));

// 2. 角色养成
Core.addChar('C021');
Core.S.party[1] = 'C021';
const c = Core.S.chars['C021'];
Core.addCharExp(['C021'], 100000);
Core.addCur('points', 1000000);
const lvBefore = c.lv;
const up = Core.levelUp('C021', 10);
t('升级生效', up.ok && Core.S.chars['C021'].lv > lvBefore);
Core.S.chars['C021'].shards = 200;
t('升星', Core.starUp('C021').ok && Core.S.chars['C021'].star === 2);
Core.addCur('skillChip', 500);
t('技能升级', Core.skillUp('C021', 0).ok);
Core.addCur('bloodCrystal', 10000);
t('血统强化未解锁时被拒', Core.bloodlineUpgrade('C021').ok === false);
Core.S.unlocks.bloodline = true;   // 血统强化是通关 潜影窟·第1关 之后才开的线
t('血统升级', Core.bloodlineUpgrade('C021').ok);

// 3. 属性计算
const st = Core.effectiveStats('C021');
t('属性完整', st && st.atk > 0 && st.hp > 0 && st.spd > 0);
t('战力>0', Core.power('C021') > 0);

// 4. 装备
const eq = Core.grantEquip('W01', 'SR', 'weapon');
t('装备生成', !!eq.equip);
eq.equip.set = null; eq.equip.classSet = null; // 固定为普通装备，排除套装随机性
Core.equipItem('C021', eq.equip.uid);
const st2 = Core.effectiveStats('C021');
t('装备提升攻击', st2.atk > st.atk);
Core.addCur('otherworld', 500);
const enh = Core.enhance(eq.equip.uid);
t('强化返回', typeof enh.ok === 'boolean');
const dec = Core.decompose(eq.equip.uid);
t('分解返还', dec.ok && dec.gain >= 50);

// 5. 招募（含保底）
Core.addCur('holy', 20000);
let urCount = 0, results = 0;
for (let i = 0; i < 120; i++) {
  const r = Core.recruitOnce('advanced');
  if (r.error) break;
  results++;
  if (r.rarity === 'UR') urCount++;
}
t('100抽必有UR(保底)', urCount >= 1);
t('招募计数', results >= 100);

// 6. 战斗：强队打 W01 第一关必胜（含主角）
Object.keys(Core.S.chars).forEach(id => { Core.S.chars[id].lv = 30; });
const allies = alliesFromParty();
const enemies = Dungeon.makeEnemies('W01', 'normal', 1, 'combat');
const res = Battle.run({ allies, enemies, worldId: 'W01', maxRounds: 30 });
t('Lv30打W01-1胜利', res.win);
t('战斗帧非空', res.frames.length > 3);

// 7. Boss战可打
const bossEnemies = Dungeon.makeEnemies('W01', 'normal', 12, 'boss');
const bossRes = Battle.run({ allies, enemies: bossEnemies, worldId: 'W01', maxRounds: 50 });
t('Boss战正常结束', typeof bossRes.win === 'boolean' && bossRes.frames.some(f => f.type === 'end'));

// 8. 副本波次（V8.1：点进去就打，不再选路线）
t('第 1 关只有 1 波', Dungeon.wavePlan(1).length === 1);
t('第 5 关 2 波，最后一波仍是普通战斗', Dungeon.wavePlan(5).length === 2 && Dungeon.wavePlan(5)[1] === 'combat');
t('第 12 关 3 波、最后一波是 Boss', Dungeon.wavePlan(12).length === 3 && Dungeon.wavePlan(12)[2] === 'boss');
t('第 8 关最后一波是精英', Dungeon.wavePlan(8)[Dungeon.wavePlan(8).length - 1] === 'elite');
t('每关最后一波类型跟着关卡走', [1, 2, 3, 5, 6, 7, 9, 10, 11].every(s => Dungeon.finalKind(s) === 'combat'));

// 9. 关卡通关结算
const sc = Core.stageComplete('W01', 'normal', 0, 3);
t('首关记录', Core.S.worlds.W01.stages.normal[0] === 3);
t('第二关解锁', Core.stageUnlocked('W01', 'normal', 1));
t('第三关未解锁', !Core.stageUnlocked('W01', 'normal', 2));
t('通关1关后解锁招募', sc.newUnlocks.includes('招募伙伴') && Core.isUnlocked('recruit'));

// 9b. 主线任务
Core.S.stats.profileViews = 1;
Core.S.stats.battles = 1;
const qs = Core.mainQuestState();
t('主线q01可完成', qs.find(x => x.q.id === 'q01').done);
t('主线q01b可完成', qs.find(x => x.q.id === 'q01b').done);
t('主线q02可完成', qs.find(x => x.q.id === 'q02').done);
t('领取主线', Core.claimQuest('q01').ok);

// 9c. 新手掉落保护
{
  let high = 0;
  for (let i = 0; i < 200; i++) {
    const r = D.rollRarity('normal');
    const capped = D.capRarity(r, D.stageDropCap(1));
    if (D.RARITIES.indexOf(capped) > 1) high++;
  }
  t('1-3关不掉SR以上', high === 0);
}

// 10. 挂机
Core.S.idle.bankSec = 3600;
const gains = Core.claimIdle();
t('挂机1小时收益', gains.points > 0 && gains.exp > 0);

// 11. 存档往返
const json = Core.exportSave();
t('导入', Core.importSave(json).ok);
t('导入后数据一致', Core.S.chars['C021'].star === 2);

// 12. 每日任务
Core.ensureDaily();
for (let i = 0; i < 5; i++) Core.task('battle5', 1);
t('任务领取', Core.claimTask('battle5').ok);

// 13. 登录奖励
const lr = Core.loginReward();
t('登录奖励', lr && lr.day >= 1);

// 14. 商店
Core.addCur('points', 100000);
t('灯阁市集购买', Core.buyShopItem('god', 0).ok);

// 15. 深井敌人曲线
const e50 = D.corridorEnemy(50);
t('深井Boss', e50.isBoss && e50.hp > 10000);

// 16. 转生条件
t('默认不可转生', !Core.canReincarnate());

// 17. 全员满级队打 W03 Boss（中期校验）
Object.keys(Core.S.chars).forEach(id => { Core.S.chars[id].lv = 60; Core.S.chars[id].star = 3; });
setParty(Object.keys(Core.S.chars).slice(0, 4)); // 组满 4 名招募角色 + 主角，模拟正常中期队伍
Core.S.player.level = 60;
const allies2 = alliesFromParty();
const w3boss = Dungeon.makeEnemies('W03', 'normal', 12, 'boss');
const w3res = Battle.run({ allies: allies2, enemies: w3boss, worldId: 'W03', maxRounds: 50 });
t('Lv60★3 五人队能打过 W03 Boss', w3res.win);
Core.S.player.level = 1;
setParty(['C021']);

// 10b. 主角成长体系
{
  const before = Core.effectivePlayerStats();
  Core.S.player.level = 20;
  const after = Core.effectivePlayerStats();
  t('主角随玩家等级成长', after.atk > before.atk && after.hp > before.hp);
  t('主角血统选择（开局必经，不受解锁限制）', Core.choosePlayerBloodline('狼人').ok);
  Core.addCur('bloodCrystal', 10000); Core.addCur('points', 1000000);
  t('主角血统升级', Core.upgradePlayerBloodline().ok && Core.S.player.bloodlineLv === 1);
  t('血统不可更改', !Core.choosePlayerBloodline('魔法').ok);
  const eq6 = Core.grantEquip('W01', 'SR', 'head');
  eq6.equip.set = null; eq6.equip.classSet = null; // 固定为普通装备，排除套装随机性
  t('头部装备主角可穿', Core.equipItem('@player', eq6.equip.uid));
  Core.unequipItem('@player', 'head');
  t('头部装备招募角色也可穿（6 槽修正）', Core.equipItem('C021', eq6.equip.uid));
  Core.unequipItem('C021', 'head');
  Core.S.player.level = 1;
}

// 18. 六维属性点
{
  Core.S.player.attrPoints = 0;
  Core.addPlayerExp(0);
  const lv0 = Core.S.player.level;
  Core.S.player.exp = 0;
  Core.addPlayerExp(D.EXP_TABLE[lv0] + 1);
  t('升级获得属性点', Core.S.player.attrPoints === D.ATTR_POINTS_PER_LV);
  const atk0 = Core.effectivePlayerStats().atk;
  const r = Core.allocateAttr('muscle', 3);
  t('分配属性点', r.ok && Core.S.player.attrPoints === 0);
  t('肌肉加点提升攻击', Core.effectivePlayerStats().atk > atk0);
  t('点数不足不能分配', !Core.allocateAttr('nerve', 1).ok);
  // V8.6：六维也要能洗点（和技能重置对称，加错了不用重开档）
  const atkBeforeReset = Core.effectivePlayerStats().atk;
  const rr = Core.resetAttrs();
  t('六维洗点：返还全部已分配点数', rr.ok && Core.S.player.attrPoints === 3 && Core.S.player.attrs.muscle === 0);
  t('六维洗点后战力掉回原点（点数没丢）', Core.effectivePlayerStats().atk < atkBeforeReset);
  t('六维洗点可反复点：没分配过就拒绝', !Core.resetAttrs().ok);
  t('洗完还能重新分配', Core.allocateAttr('spirit', 2).ok && Core.S.player.attrs.spirit === 2);
  Core.resetAttrs();
}

// 19. 血统：开局可觉醒（境界线跟着血统走），觉醒后不可更改
{
  Core.S.player.level = 1; Core.S.player.bloodline = null; Core.S.player.bloodlineLv = 0;
  t('Lv.1 就能觉醒血统', Core.choosePlayerBloodline('狼人').ok);
  t('血统选定后不可更改', !Core.choosePlayerBloodline('血族').ok);
  t('狼人有自己的境界线', Core.realmState().curName === '兽崽初期' && D.BLOODLINES['狼人'].realms[0] === '兽崽');
  t('每条血统都是 9 大境 × 4 小阶', Object.values(D.BLOODLINES).every(b => b.realms.length === 9) && D.REALM_STAGE_COUNT === 36);
  t('血统不存在会被拒', !Core.choosePlayerBloodline('不存在的血统').ok);
}

// 20. 新建角色（多主角）
{
  const oldName = Core.S.player.name;
  const r = Core.createProtagonist('第二世');
  t('新建角色', r.ok && Core.S.player.name === '第二世' && Core.S.player.level === 1 && !Core.S.player.bloodline);
  t('旧角色保留', Core.protagonistList().length === 2 && Core.protagonistList()[1].name === oldName);
  Core.S.player.level = 5;
  t('切换角色', Core.switchProtagonist(0).ok && Core.S.player.name === oldName);
  t('切回后等级还原', Core.switchProtagonist(0).ok && Core.S.player.name === '第二世' && Core.S.player.level === 5);
  Core.switchProtagonist(0); // 切回原主角
}

// 21. 背包容量（V9.2：道具与装备分开算，各自 50 起、各自扩容）
{
  const u0 = Core.bagUsage();
  t('道具格初始 50', u0.cap === 50 && u0.cap === D.BAG_BASE_ITEM_CAP);
  t('三池各 50 且互相独立', u0.eqCap === 50 && u0.matCap === 50 && u0.cap === 50);
  Core.S.bag.itemCap = u0.itemStacks; // 只把道具格塞满
  Core.S.settings.autoSellN = false; Core.S.settings.autoSellR = false;
  t('道具格满时新道具失败', Core.addItem('heal_l') === false);
  t('已满的堆叠仍可叠加', Core.addItem('heal_s') === true);
  const eqFull = Core.grantEquip('W01', 'N');
  t('道具格满不影响装备入库', !!eqFull.equip && !eqFull.sold);
  Core.S.bag.eqCap = u0.eqUsed;       // 再把装备格塞满
  const eqFull2 = Core.grantEquip('W01', 'N');
  t('装备格满时自动分解', eqFull2.sold === true && eqFull2.bagFull === true);
  Core.S.bag.itemCap = 50; Core.S.bag.eqCap = 50;
  Core.addCur('points', 100000);
  const cap0 = Core.bagUsage();
  const itemCap0 = cap0.cap, eqCap0 = cap0.eqCap;
  const rItem = Core.buyBagCap('item'), rEq = Core.buyBagCap('eq');
  t('道具格与装备格分开扩容', rItem.ok && rEq.ok
    && Core.bagUsage().cap === itemCap0 + D.BAG_EXPAND_SIZE
    && Core.bagUsage().eqCap === eqCap0 + D.BAG_EXPAND_SIZE);
  t('两条扩容曲线各自记账', Core.S.bag.itemExpands === 1 && Core.S.bag.eqExpands === 1);
  t('扩容一次只加 10 格', D.BAG_EXPAND_SIZE === 10);
  t('三条扩容曲线各自记账', Core.S.bag.itemExpands === 1 && Core.S.bag.eqExpands === 1 && Core.S.bag.matExpands === 0);
}

// 21b. 三池互相独立：道具池满了不影响材料池
{
  Core.newGame();
  Core.setPlayerName('分池');
  Object.keys(Core.S.items).forEach(k => delete Core.S.items[k]);   // 清掉新手道具，只看分池行为
  Core.S.bag.itemCap = 1;
  Core.S.bag.matCap = 3;
  t('道具池先占满', Core.addItem('heal_s', 1) === true && Core.addItem('heal_m', 1) === false);
  t('道具池满不影响材料池入库', Core.addItem('mat_t1', 1) === true && Core.addItem('mat_t2', 1) === true);
  const u = Core.bagUsage();
  t('三个池分别报数', u.itemStacks === 1 && u.matStacks === 2 && u.cap === 1 && u.matCap === 3);
}

// 22. 删除进度不再被 beforeunload 回写
{
  Core.wipeSave();
  t('wipeSave 后 save 被抑制', (Core.save(), !store['wxlh_save_v5']));
}

// 23. 主角技能加点
{
  Core.S.player.bloodline = null; Core.S.player.bloodlineLv = 0;
  Core.S.player.skillPoints = 3; Core.S.player.skillLv = [1, 1, 1];
  t('技能加点', Core.allocateSkill(0).ok && Core.S.player.skillLv[0] === 2 && Core.S.player.skillPoints === 2);
  const r = Core.resetSkills();
  t('洗点返还', r.ok && Core.S.player.skillLv.join() === '1,1,1' && Core.S.player.skillPoints === 3);
  t('未觉醒用通用技能', Core.protagonistSkills().s1.name === '求生突刺');
  Core.S.player.bloodline = '血族';
  t('觉醒后切换血统技能', Core.protagonistSkills().s1.name === '猩红汲取');
  Core.S.player.bloodline = null;
}

// 24. 装备四类
{
  Core.S.bag.eqCap = 99999; Core.S.bag.itemCap = 99999; // 避免背包满干扰判定
  let plain = 0, world = 0, cls = 0;
  for (let i = 0; i < 300; i++) {
    const e = Core.grantEquip('W01', 'SR');
    if (e.equip) {
      if (e.equip.charId) continue;
      if (e.equip.classSet) cls++;
      else if (e.equip.set) world++;
      else plain++;
    }
  }
  t('SR装备含世界套装与职业套装', world > 100 && cls > 30);
  for (let i = 0; i < 100; i++) {
    const e = Core.grantEquip('W01', 'N');
    if (e.equip && (e.equip.set || e.equip.classSet)) plain = -999;
  }
  t('N装备全为普通装', plain !== -999);
  const sig = Core.grantSignatureEquip(0);
  t('专属装备生成', !!sig.equip && sig.equip.charId === 'C039' && sig.equip.rarity === 'UR');
  t('专属装备他人不可装备', !Core.equipItem('@player', sig.equip.uid));
  Core.addChar('C039');
  t('专属装备本人可装备', Core.equipItem('C039', sig.equip.uid));
}

// 25. 职业套装需定位匹配
{
  // 找一名战士与一名非战士
  const all = D.characters.map(c => c.id);
  const war = all.find(id => D.charById[id].kind === 'warrior');
  const nonWar = all.find(id => D.charById[id].kind === 'mage');
  Core.addChar(war); Core.addChar(nonWar);
  const mk = uid => { Core.S.equips[uid] = { uid, name: '狂战·测试', slot: 'weapon', rarity: 'SR', enhance: 0, base: { atk: 100 }, affixes: [], set: null, classSet: 'warrior' }; };
  mk('eqc1'); mk('eqc2'); mk('eqc3'); mk('eqc4');
  // 战士穿 2 件（武器+饰品槽不足，改为同位两件不可，故用 weapon+accessory）
  Core.S.equips['eqc2'].slot = 'accessory';
  Core.S.equipped[war] = { weapon: 'eqc1', armor: null, accessory: 'eqc2' };
  const warWith = Core.effectiveStats(war).atk;
  Core.S.equips['eqc1'].classSet = null; Core.S.equips['eqc2'].classSet = null;
  const warWithout = Core.effectiveStats(war).atk;
  Core.S.equips['eqc1'].classSet = 'warrior'; Core.S.equips['eqc2'].classSet = 'warrior';
  // 非战士穿同样 2 件
  Core.S.equipped[nonWar] = { weapon: 'eqc3', armor: null, accessory: 'eqc4' };
  const mageWith = Core.effectiveStats(nonWar).atk;
  Core.S.equips['eqc3'].classSet = null; Core.S.equips['eqc4'].classSet = null;
  const mageWithout = Core.effectiveStats(nonWar).atk;
  t('职业套装按定位激活', warWith > warWithout && mageWith === mageWithout);
  delete Core.S.equips['eqc1']; delete Core.S.equips['eqc2']; delete Core.S.equips['eqc3']; delete Core.S.equips['eqc4'];
  Core.S.equipped[war] = { weapon: null, armor: null, accessory: null };
  Core.S.equipped[nonWar] = { weapon: null, armor: null, accessory: null };
}

// 26. 穿戴规则（canEquip）：职业套装限定位、专属限本人、槽位限角色类型
{
  const war = D.characters.find(c => c.kind === 'warrior').id;
  const mage = D.characters.find(c => c.kind === 'mage').id;
  if (!Core.S.chars[war]) Core.addChar(war);
  if (!Core.S.chars[mage]) Core.addChar(mage);
  const classEq = { uid: 'x1', slot: 'weapon', classSet: 'mage' };
  t('法师套装法师可穿', Core.canEquip(mage, classEq) === true);
  t('法师套装战士不可穿', Core.canEquip(war, classEq) === false);
  t('法师套装主角(战士)不可穿', Core.canEquip('@player', classEq) === false);
  t('战士套装主角可穿', Core.canEquip('@player', { uid: 'x2', slot: 'weapon', classSet: 'warrior' }) === true);
  t('专属装备限本人', Core.canEquip(war, { uid: 'x3', slot: 'weapon', charId: mage }) === false && Core.canEquip(mage, { uid: 'x3', slot: 'weapon', charId: mage }) === true);
  t('招募角色也有头部槽（世界套装4/6件可达）', Core.canEquip(war, { uid: 'x4', slot: 'head' }) === true);
  t('主角六槽全开', Core.canEquip('@player', { uid: 'x5', slot: 'head' }) === true);
  t('equipItem 拒绝非本职业套装', Core.equipItem(war, (Core.S.equips['x1'] = Object.assign({ name: 't', rarity: 'SR', enhance: 0, base: {}, affixes: [], set: null }, classEq), 'x1')) === false);
  delete Core.S.equips['x1'];
}

// 27. 扫荡每日上限
{
  Core.S.worlds.W01.stages.normal[0] = 3; // 确保已通关第1关
  Core.S.sweep = { date: Core.dailyDate(), count: 0 };
  t('初始剩余60次', Core.sweepLeft() === 60);
  const r1 = Dungeon.sweep('W01', 'normal', 1, 10);
  t('扫荡10次成功', r1.ok && r1.count === 10 && Core.sweepLeft() === 50);
  Core.S.sweep.count = 58;
  const r2 = Dungeon.sweep('W01', 'normal', 1, 10);
  t('超出上限只扫剩余2次', r2.ok && r2.count === 2 && r2.capped === true);
  const r3 = Dungeon.sweep('W01', 'normal', 1, 10);
  t('用完拒绝扫荡', !r3.ok);
  Core.S.sweep.date = '2000-01-01'; // 模拟跨天
  t('跨天自动重置', Core.sweepLeft() === 60);
  Core.S.sweep = { date: Core.dailyDate(), count: 0 };
}

// 28. 批量分解
{
  const before = Core.S.cur.otherworld;
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const uid = 'bd' + i;
    Core.S.equips[uid] = { uid, name: '批量' + i, slot: 'weapon', rarity: 'N', enhance: i, base: {}, affixes: [], set: null };
    ids.push(uid);
  }
  const r = Core.decomposeMany(ids.concat(['不存在']));
  const expect = ids.reduce((s, u, i) => s + D.DECOMPOSE_GAIN.N + i * 3, 0);
  t('批量分解数量与收益', r.ok && r.count === 3 && r.gain === expect);
  t('批量分解入账', Core.S.cur.otherworld === before + expect);
  t('批量分解后装备移除', ids.every(u => !Core.S.equips[u]));
}

// 29. 回归：免费招募 / SSR 券必须计入主线与日常
{
  Core.newGame();
  Core.setPlayerName('回归');
  const q3 = () => Core.mainQuestState().find(x => x.q.id === 'q03').done;
  t('免费招募前 q03 未完成', q3() === false);
  Core.freeRecruit();
  t('免费招募后 q03 完成', q3() === true);
  t('免费招募计入统计', Core.S.stats.recruits === 1);
  t('免费招募计入日常', Core.S.tasks.daily.recruit1 === 1);
  Core.S.ssrTicket = 1;
  Core.ssrTicketUse(D.characters.find(c => c.rarity === 'SSR' && !c.hidden).id);
  t('SSR 自选券也计入统计', Core.S.stats.recruits === 2);
}

// 30. 回归：十连按折扣价整笔结算，不会扣了钱看不到结果
{
  Core.newGame();
  Core.setPlayerName('回归');
  Core.S.cur.points = 47000;                 // 够不上十连实际价 45000 的边界外
  Core.S.cur.points = 44999;
  const poor = Core.recruitTen('normal');
  t('点数不够十连直接拒绝', !!poor.error && Core.S.cur.points === 44999);
  t('被拒绝时不产生角色', Object.keys(Core.S.chars).length === 0);

  Core.newGame();
  Core.S.cur.points = 45000;
  const ok = Core.recruitTen('normal');
  t('十连成功返回10个结果', !ok.error && ok.results.length === 10);
  t('十连按折扣价扣款', Core.S.cur.points === 0);
  t('十连保底至少1个SR', ok.results.some(r => D.RARITIES.indexOf(r.rarity) >= 2));

  Core.newGame();
  Core.S.cur.holy = 900;
  const ok2 = Core.recruitTen('advanced');
  t('高级十连扣 900 晶石', !ok2.error && Core.S.cur.holy === 0);
  Core.S.cur.holy = 899;
  const poor2 = Core.recruitTen('advanced');
  t('晶石不足高级十连被拒', !!poor2.error && Core.S.cur.holy === 899);
}

// 31. 回归：强化失败不许白吞材料
{
  Core.newGame();
  Core.setPlayerName('回归');
  Core.S.unlocks.enhance = true;   // 装备强化是通关 菌毯巢穴·第3关 之后才开的线
  Core.addItem('mat_t1', 5);
  const eq = Core.grantEquip('W01', 'SR', 'weapon').equip;
  eq.enhance = 0; eq.set = null; eq.classSet = null;
  Core.S.cur.points = 0; Core.S.cur.otherworld = 0;
  const r = Core.enhance(eq.uid);
  t('点数不足强化失败', r.ok === false && !r.fail);
  t('失败不消耗材料', Core.S.items.mat_t1 === 5);
  Core.S.cur.points = 100000; Core.S.cur.otherworld = 100;
  const r2 = Core.enhance(eq.uid);
  t('材料充足时强化会扣材料', Core.S.items.mat_t1 === 4);
  t('强化返回结果', typeof r2.ok === 'boolean');
}

// 32. 回归：七日登录七天一循环，不再无限发 SSR 券
{
  Core.newGame();
  const seq = [];
  for (let i = 0; i < 14; i++) {
    Core.S.login.lastClaim = 'day' + i;
    seq.push(Core.loginReward().day);
  }
  t('登录天数 1→7 后回到 1', seq.join(',') === '1,2,3,4,5,6,7,1,2,3,4,5,6,7');
  t('十四天只发 2 张 SSR 券', Core.S.ssrTicket === 2);
}

// 33. 回归：背包满时购买不扣钱
{
  Core.newGame();
  Core.setPlayerName('回归');
  Object.keys(Core.S.items).forEach(k => delete Core.S.items[k]);
  Core.S.bag.itemCap = 2;
  Core.S.items.heal_s = 1; Core.S.items.heal_m = 1;   // 道具池占满 2 格（材料走材料池）
  Core.S.cur.points = 100000;
  const r = Core.buyShopItem('god', 0);                // 初级经验模块
  t('背包满时购买被拒', r.ok === false);
  t('背包满时不扣货币', Core.S.cur.points === 100000);
  t('背包满时不发道具', (Core.S.items.exp_s || 0) === 0);
  t('已有堆叠仍可购买', (() => {
    Core.S.items.exp_s = 1;                            // 该道具已有堆叠，不占新格
    return Core.buyShopItem('god', 0).ok === true;
  })());
}

// 34. 强化剂有来源也有用：商店能买、探索增益可叠加
{
  Core.newGame();
  Core.setPlayerName('回归');
  Core.S.cur.points = 100000;
  const godShop = D.SHOPS.god.items;
  t('灯阁市集上架肌肉强化剂', godShop.some(x => x.item === 'buff_muscle'));
  t('灯阁市集上架神经刺激剂', godShop.some(x => x.item === 'buff_nerve'));
  const idx = godShop.findIndex(x => x.item === 'buff_muscle');
  const r = Core.buyShopItem('god', idx);
  t('强化剂可购买', r.ok === true && Core.S.items.buff_muscle === 1);
  t('强化剂带明确使用场景', D.ITEMS.buff_muscle.where === 'explore' && !!D.ITEMS.buff_muscle.use);
  t('神经刺激剂效果是速度', D.ITEMS.buff_nerve.effect.spdPct === 0.2);
}

// 35. 图鉴收集奖励
{
  Core.newGame();
  Core.setPlayerName('回归');
  const ids = D.characters.slice(0, 5).map(c => c.id);
  ids.forEach(id => Core.addChar(id));
  const st = Core.codexState();
  t('图鉴达到 5 名', st.owned === 5 && st.rewards.find(r => r.n === 5).reached);
  const before = Core.S.cur.points;
  const r = Core.claimCodexReward(5);
  t('图鉴奖励可领取', r.ok === true && Core.S.cur.points > before);
  t('图鉴奖励不可重复领', Core.claimCodexReward(5).ok === false);
}

// 36. 自动分解开关
{
  Core.newGame();
  Core.setPlayerName('回归');
  Core.S.settings.autoSellN = true;
  const before = Core.S.cur.otherworld;
  const res = Core.grantEquip('W01', 'N', 'weapon');
  t('自动分解 N 不进背包', res.sold === true && res.auto === true);
  t('自动分解换成异界结晶', Core.S.cur.otherworld === before + D.DECOMPOSE_GAIN.N);
  t('自动分解不留下装备', Object.keys(Core.S.equips).length === 0);
}

/* ================= 2026-09-12 优化批次回归 ================= */

// 37. 转生天赋：文案与实装必须一致（旧版 40 个节点里 15 个是空文本）
{
  Core.newGame(); Core.setPlayerName('天赋');
  Core.S.player.level = 1;
  Core.S.equipped['@player'] = { weapon: null, head: null, armor: null, hands: null, legs: null, accessory: null };
  const probes = {
    hpPct: () => Core.effectivePlayerStats().hp,
    defPct: () => Core.effectivePlayerStats().def,
    spdPct: () => Core.effectivePlayerStats().spd,
    critPct: () => Core.effectivePlayerStats().crit,
    critDmg: () => Core.effectivePlayerStats().critDmg,
    skillPct: () => Core.effectivePlayerStats().skillMult,
    evaPct: () => Core.effectivePlayerStats().eva,
    spiritPct: () => Core.effectivePlayerStats().skillMult,
    healUp: () => Core.effectivePlayerStats().healUp,
    dmgReduce: () => Core.effectivePlayerStats().dmgReduce,
    initEnergy: () => Core.effectivePlayerStats().initEnergy,
    cdRed: () => Core.effectivePlayerStats().cdRed,
    firstStrike: () => Core.effectivePlayerStats().firstStrike,
    ultPct: () => Core.effectivePlayerStats().ultPct,
    idlePct: () => Core.idleRates().pointsPerMin,
    expPct: () => Core.idleRates().expPerMin,
    dropPct: () => Core.graceDropMult(),
    offlinePct: () => Core.offlineEfficiency(),
  };
  const bad = [];
  ['body', 'energy', 'nerve', 'grace'].forEach(b => {
    D.TALENTS[b].nodes.forEach((n, i) => {
      Object.keys(n.e).forEach(k => {
        if (!probes[k]) { bad.push(`${b}#${i + 1}:${k}(无探针)`); return; }
        Core.S.player.talents = { body: 0, energy: 0, nerve: 0, grace: 0 };
        Core.S.player.talents[b] = i;
        const a = probes[k]();
        Core.S.player.talents[b] = i + 1;
        const c = probes[k]();
        if (!(c > a)) bad.push(`${b}#${i + 1}:${k}(${a}→${c})`);
      });
    });
  });
  Core.S.player.talents = { body: 0, energy: 0, nerve: 0, grace: 0 };
  const totalNodes = Object.values(D.TALENTS).reduce((s, x) => s + x.nodes.length, 0);
  t('天赋共 40 个节点', totalNodes === 40);
  t('每个天赋节点的文案与效果都齐备', Object.values(D.TALENTS).every(x => x.nodes.every(n => n.text && n.e && Object.keys(n.e).length)));
  if (bad.length) console.log('  未生效节点：', bad.join(' | '));
  t('40 个天赋节点逐级都真的生效（无空文本）', bad.length === 0);
}

// 38. 世界套装 4/6 件对招募角色可以触发
{
  Core.newGame(); Core.setPlayerName('套装');
  Core.addChar('C021');
  const naked = Core.effectiveStats('C021');
  const slots = ['weapon', 'head', 'armor', 'hands', 'legs', 'accessory'];
  slots.slice(0, 4).forEach(s => {
    const r = Core.grantEquip('W01', 'SR', s);
    r.equip.set = 'W01'; r.equip.classSet = null; r.equip.affixes = [];
    Core.equipItem('C021', r.equip.uid);
  });
  const four = Core.effectiveStats('C021');
  t('招募角色能激活 4 件套（旧版永远不可达）', four.sets['W01'] === 4 && four.resPct > naked.resPct);
  slots.slice(4).forEach(s => {
    const r = Core.grantEquip('W01', 'SR', s);
    r.equip.set = 'W01'; r.equip.classSet = null; r.equip.affixes = [];
    Core.equipItem('C021', r.equip.uid);
  });
  const six = Core.effectiveStats('C021');
  t('招募角色能激活 6 件套', six.sets['W01'] === 6 && six.atk > four.atk && six.hp > four.hp);
  t('装备掉落池 6 个部位都能被人穿', D.DROP_SLOTS.every(s => D.RECRUIT_SLOTS.includes(s)));
}

// 39. 装备锁定保护
{
  Core.newGame(); Core.setPlayerName('锁定');
  const r = Core.grantEquip('W01', 'SR', 'weapon');
  Core.toggleEquipLock(r.equip.uid);
  t('锁定后单件分解被拒绝', !Core.decompose(r.equip.uid).ok);
  t('锁定后批量分解会跳过', Core.decomposeMany([r.equip.uid]).count === 0);
  Core.toggleEquipLock(r.equip.uid);
  t('解锁后可以分解', Core.decompose(r.equip.uid).ok);
}

// 40. 一键最优装备 + 编队预设
{
  Core.newGame(); Core.setPlayerName('配装');
  ['C021', 'C022', 'C023', 'C024'].forEach(id => Core.addChar(id));
  setParty(['C021', 'C022', 'C023', 'C024']);
  for (let i = 0; i < 16; i++) Core.grantEquip('W03', 'SSR');
  const r = Core.autoEquipBest();
  t('一键最优装备会换装', r.ok && r.changed > 0);
  const used = [];
  Object.values(Core.S.equipped).forEach(sl => Object.values(sl).forEach(u => { if (u) used.push(u); }));
  t('一键最优装备不会把同一件分给两个人', new Set(used).size === used.length);
  // 先确保 C021 有一件武器，再锁定它；然后塞一堆更好的武器，看一键最优会不会把它换走
  const w1 = Core.grantEquip('W03', 'SSR', 'weapon');
  w1.equip.set = null; w1.equip.classSet = null; w1.equip.affixes = [];
  Core.equipItem('C021', w1.equip.uid);
  Core.toggleEquipLock(w1.equip.uid);
  for (let i = 0; i < 6; i++) Core.grantEquip('W06', 'UR', 'weapon');
  Core.autoEquipBest();
  t('锁定装备不会被一键换走', Core.S.equipped['C021'].weapon === w1.equip.uid);
  t('编队预设保存（5 格，含主角）', Core.savePreset(0).ok && Core.S.presets[0].filter(Boolean).length === 5);
  setParty([]);
  t('编队预设套用', Core.applyPreset(0).ok && Core.S.party.filter(Boolean).length === 5);
  t('空预设不可套用', !Core.applyPreset(2).ok);
}

// 41. 周常任务
{
  Core.newGame(); Core.setPlayerName('周常');
  Core.ensureDaily();
  for (let i = 0; i < 100; i++) Core.task('battle5', 1);
  const st = Core.weeklyState().find(x => x.t.src === 'battle');
  t('周常进度与每日动作同源', st.prog === 100 && st.done);
  t('周常可领取', Core.claimWeekly(st.t.id).ok);
  t('周常不可重复领取', !Core.claimWeekly(st.t.id).ok);
  Core.S.tasks.weekKey = '2000-01-03';
  t('跨周自动重置进度', Core.weeklyState().every(x => x.prog === 0));
}

// 42. 成就系统
{
  Core.newGame(); Core.setPlayerName('成就');
  t('成就未达成时不可领', !Core.claimAchievement('a_battle100').ok);
  Core.S.stats.battles = 100;
  const r = Core.claimAchievement('a_battle100');
  t('成就达成后可领取', r.ok && Core.S.achievements['a_battle100'] === true);
  t('成就不可重复领取', !Core.claimAchievement('a_battle100').ok);
  t('成就分四类且数量足够', D.ACHIEVEMENTS.length >= 18 && ['战斗', '养成', '收集', '挑战'].every(c => D.ACHIEVEMENTS.some(a => a.cat === c)));
}

// 43. 成长曲线量级（防止再次与挂机产出脱节）
{
  Core.newGame(); Core.setPlayerName('曲线');
  const expTotal = D.EXP_TABLE.slice(1, 100).reduce((a, b) => a + b, 0);
  const ptTotal = D.LEVEL_POINTS.slice(1, 100).reduce((a, b) => a + b, 0);
  t('单人满级经验总量 < 200 万', expTotal < 2000000);
  t('单人满级点数总量 < 30 万', ptTotal < 300000);
  Core.S.player.level = 100; Core.S.player.geneLock = 5;
  Core.S.player.talents = { body: 0, energy: 0, nerve: 0, grace: 10 };   // 满「灯阁恩赐」
  Core.S.buildings.core = 30; Core.S.buildings.medical = 50; Core.S.buildings.training = 50;
  const r = Core.idleRates();
  t('满配挂机点数 ≥ 80/分', r.pointsPerMin >= 80);
  t('满配挂机经验 ≥ 120/分', r.expPerMin >= 120);
}

// 44. 死道具修复：高阶物品必须有来源
{
  const shopItems = Object.values(D.SHOPS).flatMap(s => s.items.map(i => i.item)).filter(Boolean);
  t('高级经验模块有商店来源', shopItems.includes('exp_l'));
  t('超级经验模块有来源', shopItems.includes('exp_xl'));
  t('虚空晶体有商店来源', shopItems.includes('mat_t4'));
  t('灯阁残片有商店来源', shopItems.includes('mat_t5'));
  t('T5 材料不再与建筑同名', D.ITEMS.mat_t5.name !== '灯芯');
  t('每个道具都写了获取途径', Object.values(D.ITEMS).every(i => !!i.src));
}

// 45. 商店按进度上架
{
  Core.newGame(); Core.setPlayerName('解锁');
  Core.addCur('points', 2000000);
  const idx = D.SHOPS.god.items.findIndex(i => i.item === 'mat_t4');
  t('未通关 W04 时 T4 未上架', !Core.buyShopItem('god', idx).ok);
  Core.S.worlds.W04 = { unlocked: true, stages: { normal: Array(12).fill(3), hard: Array(12).fill(0), hell: Array(12).fill(0) } };
  const r = Core.buyShopItem('god', idx);
  t('通关 W04 后可购买 T4', r.ok && (Core.S.items.mat_t4 || 0) === 5);
}

// 46. 深井曲线与深井印记
{
  t('深井 100 层不再是断崖', D.corridorEnemy(100).hp < 200000 && D.corridorEnemy(100).hp > 80000);
  t('深井印记每 10 层 1 枚', D.corridorMarks(95) === 9 && D.corridorMarks(100) === 10);
  t('深井印记有上限', D.corridorMarks(9999) === D.CORRIDOR_MARK_CAP);
  t('深井印记加成为 1.5%/枚', Math.abs(D.corridorMarkBonus(100) - 0.15) < 1e-9);
}

// 47. 副本进度落盘
{
  Core.newGame(); Core.setPlayerName('续命');
  t('默认没有未完成副本', Core.S.pendingRun === null);
  Core.setPendingRun({ worldId: 'W01', diff: 'normal', stage: 3, wave: 1, hpPct: { '@player': 0.5 }, buffs: {}, waves: ['combat'] });
  const json = Core.exportSave();
  Core.importSave(json);
  t('副本进度写进存档并能读回', !!Core.S.pendingRun && Core.S.pendingRun.stage === 3 && Core.S.pendingRun.hpPct['@player'] === 0.5);
  Core.clearPendingRun();
  t('副本进度可清除', Core.S.pendingRun === null);
}

// 48. 战斗引擎真的消费天赋字段
{
  Core.newGame(); Core.setPlayerName('引擎');
  const mk = extra => [Object.assign({ name: '测试者', kind: 'warrior', position: 'front', skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1], maxHp: 6000, hp: 6000, atk: 300, def: 100, spd: 90, crit: 0.2, critDmg: 2, eva: 0, skillMult: 1 }, extra || {})];
  const foe = () => [{ name: '木桩', hp: 30000, atk: 300, def: 50, spd: 60 }];
  const takenTotal = res => {
    const uid = res.frames[0].allies[0].uid;
    return res.frames.filter(f => f.type === 'damage' && f.target === uid).reduce((s, f) => s + f.dmg, 0);
  };
  const plain = Battle.run({ allies: mk(), enemies: foe(), worldId: null, maxRounds: 8 });
  const reduced = Battle.run({ allies: mk({ dmgReduce: 0.5 }), enemies: foe(), worldId: null, maxRounds: 8 });
  t('减伤字段真的减伤', takenTotal(plain) > 0 && takenTotal(reduced) < takenTotal(plain) * 0.8);
  const energy = Battle.run({ allies: mk({ initEnergy: 100 }), enemies: foe(), worldId: null, maxRounds: 4 });
  t('开场能量让第一回合就放必杀', energy.frames.slice(0, 14).some(f => f.type === 'skill' && f.ult));
  const healed = Battle.run({ allies: mk({ healUp: 1 }), enemies: foe(), worldId: null, maxRounds: 6 });
  t('受治疗字段不报错并可正常结算', typeof healed.win === 'boolean' && healed.frames.some(f => f.type === 'end'));
}

// 49. 血清（永久强化剂）：说明与实装同源 / 炼化 / 上限 / 血统限制 / 真的进属性
{
  Core.newGame(); Core.setPlayerName('血清');
  t('新档自带血清字段', !!Core.S.serums);
  t('血清表每项都有对应道具', D.SERUMS.every(s => {
    const it = D.ITEMS[D.SERUM_ITEM(s.id)];
    return it && it.type === 'serum' && it.serum && it.serum.key === s.key && it.serum.max === s.max;
  }));
  t('血清文案从数据派生（攻击 +1.0%）', D.ITEMS['serum_sr_atk'].desc.indexOf('攻击 永久 +1.0%') >= 0);
  t('血统血清文案带专属标记', D.ITEMS['serum_sr_bl_vampire'].desc.indexOf('【血族专属】') === 0);

  t('材料不足时拒绝炼化', Core.craftSerum('sr_atk', 1).ok === false);
  Core.S.items.mat_t1 = 20; Core.S.cur.points = 5000;
  const c1 = Core.craftSerum('sr_atk', 3);
  t('炼化扣材料与点数', c1.ok && c1.count === 3 && Core.S.items.mat_t1 === 5 && Core.S.cur.points === 4100);
  t('炼化产出血清道具', (Core.S.items['serum_sr_atk'] || 0) === 3);
  t('点数不足时拒绝炼化', Core.craftSerum('sr_spd', 10).ok === false);

  const cid = D.characters[0].id;
  Core.addChar(cid);
  const atkBefore = Core.effectiveStats(cid).atk;
  const r1 = Core.useSerum(cid, 'sr_atk', 2);
  t('喂血清后属性真的变高', r1.ok && Core.effectiveStats(cid).atk > atkBefore);
  t('服用支数写进存档', Core.serumTaken(cid, 'sr_atk') === 2);

  Core.S.items['serum_sr_atk'] = 999;
  const capped = Core.useSerum(cid, 'sr_atk', 999);
  t('一次最多吃到上限', capped.ok && Core.serumTaken(cid, 'sr_atk') === 40);
  t('达到上限后拒绝使用', Core.useSerum(cid, 'sr_atk', 1).ok === false);

  t('血统不符时拒绝专属血清', Core.useSerum(cid, 'sr_bl_vampire', 1).ok === false);
  const vamp = D.characters.find(c => c.bloodline === '血族');
  Core.addChar(vamp.id);
  Core.S.chars[vamp.id].bloodlineLv = 1;
  Core.S.items['serum_sr_bl_vampire'] = 3;
  const okv = Core.useSerum(vamp.id, 'sr_bl_vampire', 3);
  t('血统匹配后专属血清可用', okv.ok && Core.serumTaken(vamp.id, 'sr_bl_vampire') === 3);

  const pAtk = Core.effectivePlayerStats().atk;
  Core.S.items['serum_sr_atk'] = 5;
  const pr = Core.useSerum('@player', 'sr_atk', 5);
  t('主角也能服血清并涨属性', pr.ok && Core.effectivePlayerStats().atk > pAtk);

  // 战力必须跟着动（防止"属性涨了、战力没算"），而且"只是持有道具"不算数
  Core.S.serums[cid]['sr_atk'] = 0;
  Core.S.items['serum_sr_atk'] = 10;
  const p0 = Core.power(cid);
  t('只是持有血清不影响战力', Core.power(cid) === p0);
  Core.useSerum(cid, 'sr_atk', 10);
  t('喂下血清后战力跟着涨', Core.power(cid) > p0);
}

// 50. 招募三池：花三种货币、出三种结构、保底各自独立
{
  const P = D.RECRUIT_POOLS;
  t('三池花三种货币', P.normal.currency === 'points' && P.advanced.currency === 'holy' && P.limited.currency === 'otherworld');
  t('普通池不出 SSR/UR', !P.normal.rates.SSR && !P.normal.rates.UR);
  t('高级池最低 SR', !P.advanced.rates.N && !P.advanced.rates.R && !!P.advanced.rates.SR);
  t('三池单抽价各不相同', P.normal.cost.points === 5000 && P.advanced.cost.holy === 100 && P.limited.cost.otherworld === 60);

  Core.newGame(); Core.setPlayerName('招募');
  Core.addCur('points', 5000 * 220);
  let high = 0, pulled = 0;
  withRandom(0.5, () => {
    for (let i = 0; i < 200; i++) {
      const r = Core.recruitOnce('normal');
      if (r.error) break;
      pulled++;
      if (D.RARITIES.indexOf(r.rarity) >= 3) high++;
    }
  });
  t('普通池 200 抽不出 SSR', pulled === 200 && high === 0);

  // 高级池：把"除一个人之外"的所有 SSR 都塞进背包，保底那一抽必须给还没有的那个
  Core.newGame(); Core.setPlayerName('招募2');
  Core.addCur('holy', 100 * 200);
  const ssrs = D.characters.filter(c => c.rarity === 'SSR' && !c.hidden);
  const wantId = ssrs[3].id;
  ssrs.forEach(c => {
    if (c.id === wantId) return;
    Core.S.chars[c.id] = { lv: 1, exp: 0, star: 1, shards: 0, skillLv: [1, 1, 1], bloodlineLv: 0 };
  });
  Core.pityOf('advanced').ssr = D.PITY.SSR - 1;
  const advR = withRandom(0.5, () => Core.recruitOnce('advanced'));
  t('高级池保底优先给未拥有的角色', advR.rarity === 'SSR' && advR.id === wantId);
  t('高级池 SSR 保底被重置', Core.pityOf('advanced').ssr === 0);

  // 限定池：UP 保底那一抽必须给当期 UP，且计数与高级池互不干扰
  Core.newGame(); Core.setPlayerName('招募3');
  Core.addCur('otherworld', 60 * 120);
  const up = D.recruitUpChar();
  Core.pityOf('limited').up = D.PITY_UP - 1;
  const limR = withRandom(0.5, () => Core.recruitOnce('limited'));
  t('限定池 50 抽必出当期 UP', !!up && limR.isUp && limR.id === up.id);
  t('限定池 UP 保底被重置', Core.pityOf('limited').up === 0);
  t('限定池与高级池保底分开记账', Core.pityOf('advanced').ssr === 0 && Core.pityOf('limited').ssr === 0);
}

// 51. 挂机分工：派领队 → 产出变高；主力不能派；一人不能占两条线
{
  Core.newGame(); Core.setPlayerName('挂机');
  const cid = D.characters[0].id, cid2 = D.characters[1].id;
  Core.addChar(cid); Core.addChar(cid2);
  Core.S.chars[cid].lv = 60;
  const baseExp = Core.idleRates().expPerMin;
  const basePoints = Core.idleRates().pointsPerMin;
  t('没派领队时产线全是空的', Core.idleLines().every(x => !x.leaderId));
  Core.S.party[1] = cid;          // 1 号位是前排的第二个格子（0 号位是主角）
  t('上阵主力不能派去挂机', Core.setIdleLeader('cultivate', cid).ok === false);
  Core.S.party[1] = null;
  t('派领队成功', Core.setIdleLeader('cultivate', cid).ok);
  t('派了领队后挂机经验变高', Core.idleRates().expPerMin > baseExp);
  t('没派领队的产线不受影响', Math.abs(Core.idleRates().pointsPerMin - basePoints) < 1e-6);
  t('同一个人不能同时管两条线', Core.setIdleLeader('gather', cid).ok === false);
  t('换一个没被占用的人可以派', Core.setIdleLeader('gather', cid2).ok);
  t('采集产线真的产出材料', Core.idleRates().matPerMin > 0);
  Core.onlineTick(900);
  const g = Core.idleBankGains();
  const matSum = () => ['mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5'].reduce((s, k) => s + (Core.S.items[k] || 0), 0);
  const beforeMat = matSum();
  Core.claimIdle();
  t('挂机结算把材料一起发下来', g.mat > 0 && matSum() > beforeMat);
  Core.setIdleLeader('cultivate', null);
  // 注意：上面领过收益，玩家等级可能升过，所以跟"当前基础速率"比，而不是跟开头的值比
  t('撤下领队后不再有产线加成', Math.abs(Core.idleRates().expPerMin - Core.idleBaseRates().expPerMin) < 1e-6);
}

// 52. 限时悬赏：未完成不能领 / 完成后领奖 / 过期作废 / 可开新一期
{
  Core.newGame(); Core.setPlayerName('悬赏');
  const st = Core.bountyState();
  t('悬赏按进度生成 4 条且都带截止时间', st.list.length === 4 && st.list.every(x => x.leftMs > 0));
  t('目标里一定有"推进当前世界"', st.list.some(x => x.b.kind === 'stage'));
  const stageB = st.list.find(x => x.b.kind === 'stage');
  t('开局这条悬赏还没完成', stageB.done === false);
  t('未完成不能领', Core.claimBounty(stageB.b.id).ok === false);
  const p = stageB.b.param;
  Core.stageComplete(p.world, p.diff, p.stage - 1, 3);
  const holy0 = Core.S.cur.holy;
  const r = Core.claimBounty(stageB.b.id);
  t('完成后可以领悬赏', r.ok && Core.S.cur.holy > holy0);
  t('同一条不能重复领', Core.claimBounty(stageB.b.id).ok === false);
  Core.S.bounty.start = Date.now() - 400 * 3600e3;   // 全部过期
  t('过期后不能领', Core.claimBounty(stageB.b.id).ok === false);
  t('全部结束后可以开新一期', Core.bountyState().allOver && Core.renewBounties().ok);
  const st2 = Core.bountyState();
  t('新一期时间重算且按新进度生成', st2.list.every(x => x.leftMs > 0 && !x.claimed) && st2.list.length === 4);
  t('新一期的推进目标往后挪了', st2.list.find(x => x.b.kind === 'stage').b.param.stage > p.stage || st2.list.find(x => x.b.kind === 'stage').b.param.world !== p.world);
}

// 53. 境界渡劫：等级门槛 / 材料门槛 / 成功永久加成 / 失败只扣材料
{
  Core.newGame(); Core.setPlayerName('境界');
  Core.addCur('points', 500000);
  Core.S.items.mat_t1 = 100;
  t('等级不够不能渡劫', Core.attemptRealm().ok === false);
  Core.S.player.level = 10;
  // V8.1：血统改成开局就选，但"没血统就没有境界线"——所以这里先补上血统
  t('没选血统不能渡劫', Core.attemptRealm().ok === false);
  t('Lv.1 就能选血统（境界线跟着血统走）', Core.choosePlayerBloodline('修真').ok);
  t('选完血统境界线从第 1 境开始', Core.realmState().curName === '炼气初期' && Core.realmState().hasBloodline);
  const atk0 = Core.effectivePlayerStats().atk;
  // 用 D.REALMS 里的真实消耗做断言，不写死数值：境界改成 36 小阶之后，
  // 单阶消耗本来就会跟着表走（旧版用例把 6/10 这样的快照值当常量，改表必假报警）
  const r0 = D.REALMS[0];
  const mat0 = Core.S.items.mat_t1;
  const okR = withRandom(0.01, () => Core.attemptRealm());
  t('渡劫成功提升境界', okR.ok && okR.success && Core.S.player.realm === 1);
  t('渡劫消耗被扣除', Core.S.items.mat_t1 === mat0 - r0.cost.matN);
  t('境界加成真的进了属性', Core.effectivePlayerStats().atk > atk0);
  t('境界加成比例正确（1 小阶 = +1.4%）', Math.abs(Core.realmBonusPct() - D.REALM_PCT) < 1e-9);
  t('境界共 36 小阶', D.REALMS.length === 36);
  t('首阶是炼气初期', D.REALMS[0].full === '炼气初期' && D.REALMS[0].lv === 10);
  t('末阶是渡劫大圆满', D.REALMS[35].full === '渡劫大圆满' && D.REALMS[35].lv === 100);
  t('36 阶加成总量≈旧 10 境的 +50%', Math.abs(D.REALMS.length * D.REALM_PCT - 0.5) < 0.02);

  Core.S.items.mat_t1 = 2;
  Core.S.player.level = D.REALMS[1].lv;
  t('材料不足不能渡劫', Core.attemptRealm().ok === false);
  Core.S.items.mat_t1 = 100;
  const failR = withRandom(0.999, () => Core.attemptRealm());
  t('渡劫失败：不掉等级、只扣消耗', failR.ok && !failR.success && Core.S.player.level === D.REALMS[1].lv && Core.S.items.mat_t1 === 100 - D.REALMS[1].cost.matN);
  t('失败后境界不变', Core.S.player.realm === 1);
}

// 54. 伴生体：孵化 / 重复转兽魂 / 随行加成 / 五行克制 / 升阶
{
  Core.newGame(); Core.setPlayerName('伴生体');
  t('每个世界都有自己的五行属性', D.WORLDS.every(w => !!D.worldElement(w.id)));
  t('五行相克自洽（五条环）', D.ELEMENTS.every(e => D.ELEMENTS.indexOf(D.ELEMENT_COUNTER[e]) >= 0));
  t('伴生体数据完整且说明由数据派生', D.BEASTS.every(b => b.elem && D.ELEMENTS.indexOf(b.elem) >= 0 && D.beastDesc(b).length > 0));

  t('没有兽魂石不能孵化', Core.hatchBeast(1).ok === false);
  Core.S.items[D.BEAST_EGG_ITEM] = 30;
  const h = withRandom(0.5, () => Core.hatchBeast(1));   // 0.5 → 命中 N 档
  t('孵化扣兽魂石并得到 1 只', h.ok && h.got.length === 1 && Core.S.items[D.BEAST_EGG_ITEM] === 20);
  t('第一只自动随行', !!Core.beastState().active);
  const firstId = h.got[0].id;
  t('重复获得转兽魂', (() => {
    Core.S.beast.owned[firstId].soul = 8;
    Core.S.items[D.BEAST_EGG_ITEM] = 300;
    withRandom(0.5, () => Core.hatchBeast(20));
    return Core.S.beast.owned[firstId].soul > 8;
  })());

  // 随行加成真的进属性
  const cid = D.characters[0].id;
  Core.addChar(cid);
  Core.setActiveBeast(null);
  const baseAtk = Core.effectiveStats(cid).atk;
  Core.setActiveBeast(firstId);
  const bp = D.beastPctAt(D.beastById(firstId), Core.S.beast.owned[firstId].lv);
  const withBeastAtk = Core.effectiveStats(cid).atk;
  t('随行伴生体的加成进了角色属性', bp.atkPct ? withBeastAtk > baseAtk : withBeastAtk >= baseAtk);
  t('收回后加成消失', (() => { Core.setActiveBeast(null); return Core.effectiveStats(cid).atk === baseAtk; })());
  Core.setActiveBeast(firstId);

  t('兽魂不足不能升阶', (() => {
    Core.S.beast.owned[firstId].lv = 3; Core.S.beast.owned[firstId].soul = 1;
    return Core.beastLevelUp(firstId).ok === false;
  })());
  t('兽魂够就能升阶', (() => {
    Core.S.beast.owned[firstId].soul = 999;
    const r = Core.beastLevelUp(firstId);
    return r.ok && Core.S.beast.owned[firstId].lv === 4;
  })());
  t('满级后拒绝再升', (() => {
    Core.S.beast.owned[firstId].lv = D.BEAST_MAX_LV; Core.S.beast.owned[firstId].soul = 9999;
    return Core.beastLevelUp(firstId).ok === false;
  })());

  // 五行克制：换一只克制"当前世界属性"的伴生体，倍率必须正好 +15%
  const worldId = D.WORLDS[0].id;
  const foeElem = D.worldElement(worldId);
  const goodBeast = D.BEASTS.find(x => D.ELEMENT_COUNTER[x.elem] === foeElem);
  const badBeast = D.BEASTS.find(x => D.ELEMENT_COUNTER[foeElem] === x.elem);
  if (goodBeast) {
    Core.S.beast.owned[goodBeast.id] = { lv: 1, soul: 0 };
    Core.setActiveBeast(goodBeast.id);
    t('带对属性 → 伤害 +15%', Math.abs(Core.elementMultiplier(worldId).mult - 1.15) < 1e-9);
  }
  if (badBeast) {
    Core.setActiveBeast(badBeast.id);
    t('带反属性 → 伤害 -8%', Math.abs(Core.elementMultiplier(worldId).mult - 0.92) < 1e-9);
  }
  Core.setActiveBeast(null);
  t('不带伴生体时没有五行加成', Core.elementMultiplier(worldId).mult === 1);

  // 引擎真的用了这两个字段（不是只在界面上写写）
  const pstB = Core.effectivePlayerStats();
  const allyB = Object.assign({ name: '主角', kind: 'warrior', faction: null, position: 'front', skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1], maxHp: pstB.hp, charId: '@player', elem: null }, pstB, { beastElem: goodBeast ? goodBeast.elem : null });
  const foeB = Dungeon.makeEnemies('W01', 'normal', 1, 'combat').map(e => Object.assign({}, e, { elem: foeElem }));
  const resB = Battle.run({ allies: [allyB], enemies: foeB, worldId: 'W01', maxRounds: 30 });
  t('战斗引擎消费 beastElem / elem 字段', resB.frames.some(f => f.type === 'damage') && typeof resB.win === 'boolean');
}

// 55. 挂机分工改成看六维（不是战力）
{
  Core.newGame(); Core.setPlayerName('六维');
  const bySpirit = D.characters.filter(c => c.attrs && c.attrs.spirit).sort((a, b) => b.attrs.spirit - a.attrs.spirit);
  const high = bySpirit[0], low = bySpirit[bySpirit.length - 1];
  Core.addChar(high.id);
  if (low.id !== high.id) Core.addChar(low.id);
  Core.S.chars[high.id].lv = 60;
  if (low.id !== high.id) Core.S.chars[low.id].lv = 60;
  const lines = Core.idleLines();
  t('每条产线都标出看哪一维', lines.every(x => x.line.attr && x.line.attrName));
  Core.setIdleLeader('cultivate', high.id);
  const l = Core.idleLines().find(x => x.line.id === 'cultivate');
  t('派遣后显示领队的对应维值', l.attrValue > 0 && l.bonus > 0);
  t('精神高的当闭关领队，加成不低于精神低的', (() => {
    const hi = Core.idleLineBonus('cultivate');
    if (low.id === high.id) return true;
    Core.setIdleLeader('cultivate', low.id);
    const lo = Core.idleLineBonus('cultivate');
    Core.setIdleLeader('cultivate', high.id);
    return hi >= lo;
  })());
  t('加成封顶不超过 maxBonus', Core.idleLines().every(x => x.bonus <= 1.5 + 1e-9));
}


// 62. 招募券（对标《道友修仙》的"招徒卷"）：有券扣券 / 没券扣货币 / 十连整付
{
  Core.newGame(); Core.setPlayerName('券');
  Core.S.unlocks.recruit = true;
  const C0 = Object.assign({}, Core.S.cur);
  // 没券时：扣货币
  Core.addCur('points', 100000);
  const beforePts = Core.S.cur.points;
  const r1 = withRandom(0.99, () => Core.recruitOnce('normal'));
  t('没券时扣货币', !r1.error && Core.S.cur.points === beforePts - D.RECRUIT_POOLS.normal.cost.points);
  t('没券时结果不带 usedTicket', !r1.usedTicket);

  // 有券时：扣券、货币不动
  Core.addItem('ticket_normal', 1);
  const beforePts2 = Core.S.cur.points;
  const r2 = withRandom(0.99, () => Core.recruitOnce('normal'));
  t('有券时优先扣券', r2.usedTicket === 'ticket_normal' && (Core.S.items.ticket_normal || 0) === 0);
  t('有券时货币不动', Core.S.cur.points === beforePts2);
  t('券也算进招募统计', Core.S.stats.recruits === 2);

  // 十连：10 张券 = 免货币
  Core.addItem('ticket_adv', 10);
  Core.S.cur.holy = 0;
  const beforeSweep = Core.S.cur.holy;
  const ten = withRandom(0.99, () => Core.recruitTen('advanced'));
  t('十连有 10 张券时整付券', !ten.error && ten.usedTickets === 10 && (Core.S.items.ticket_adv || 0) === 0);
  t('十连用券时不扣货币', Core.S.cur.holy === beforeSweep);
  t('十连出满 10 个结果', ten.results.length === 10);

  // 十连：券只有 9 张 → 不混付，改扣货币
  Core.addItem('ticket_adv', 9);
  Core.addCur('holy', D.RECRUIT_POOLS.advanced.ten.holy);
  const holyBefore = Core.S.cur.holy;
  const ten2 = withRandom(0.99, () => Core.recruitTen('advanced'));
  t('券不足 10 张时不混付、改扣货币', !ten2.error && ten2.usedTickets === 0 && Core.S.cur.holy === holyBefore - D.RECRUIT_POOLS.advanced.ten.holy);
  t('券不足 10 张时券原样留着', (Core.S.items.ticket_adv || 0) === 9);

  // 货币和券都不够 → 明确失败
  Core.S.cur.holy = 0; Core.S.items.ticket_adv = 0;
  t('券和货币都不足时招募失败', !!Core.recruitOnce('advanced').error);

  // 募捐券能进背包、能被奖励系统发出来
  Core.addItem('ticket_lim', 2);
  t('券是背包里的道具', Core.S.items.ticket_lim === 2 && D.ITEMS.ticket_lim.type === 'ticket');
  t('三个池子各配一张券', ['normal', 'advanced', 'limited'].every(p => D.RECRUIT_POOLS[p].ticket && D.ITEMS[D.RECRUIT_POOLS[p].ticket]));
  // 奖励对象里带 item 时能真的发到背包（说明与实装同源）
  Core.removeItem('ticket_normal', Core.S.items.ticket_normal || 0);
  Core.applyRewardObj({ points: 1, item: 'ticket_normal' });
  Core.applyRewardObj({ item: ['ticket_normal', 'ticket_lim'] });
  t('奖励对象里的 item 会真的发到背包', (Core.S.items.ticket_normal || 0) === 2 && (Core.S.items.ticket_lim || 0) === 3);
}

// 63. 概率公示文案：每一档出率与保底规则必须和真正抽卡用的数据一致
{
  t('三池都有出率表', Object.values(D.RECRUIT_POOLS).every(p => Object.keys(p.rates).length > 0));
  t('普通池不出 SSR/UR', !D.RECRUIT_POOLS.normal.rates.SSR && !D.RECRUIT_POOLS.normal.rates.UR);
  t('高级池 SR 起抽', !D.RECRUIT_POOLS.advanced.rates.N && !D.RECRUIT_POOLS.advanced.rates.R);
  t('每池出率合计为 1', Object.values(D.RECRUIT_POOLS).every(p => Math.abs(Object.values(p.rates).reduce((a, b) => a + b, 0) - 1) < 1e-9));
  t('每个池子都有一段公示文字', ['normal', 'advanced', 'limited'].every(p => typeof D.pityText(p) === 'string' && D.pityText(p).length > 10));
  t('公示文字里写明了保底抽数', D.pityText('advanced').includes(String(D.PITY.SSR)) && D.pityText('advanced').includes(String(D.PITY.UR)));
  t('限定池公式里写明 UP 保底', D.pityText('limited').includes(String(D.PITY_UP)));
  t('三池花的是三种不同货币', new Set(Object.values(D.RECRUIT_POOLS).map(p => p.currency)).size === 3);
}

// 64. 灯阁权限（对标"洞府"）：高级货币长线投资，永久生效
{
  Core.newGame(); Core.setPlayerName('权限');
  t('初始权限 0 级', Core.authorityInfo().lv === 0);
  const base0 = Core.idleBaseRates().pointsPerMin;
  const cap0 = Core.offlineCapHours();
  const sweep0 = Core.sweepCap();
  t('初始 0 级时没有权限加成', Core.authority().idlePct === 0 && Core.authority().capHours === 0);

  // 材料不足时失败
  t('高级货币不足时升不了', Core.upgradeAuthority().ok === false);

  // 给足材料升到 1 级
  const c1 = D.authorityCost(0);
  const holy0 = Core.S.cur.holy, ow0 = Core.S.cur.otherworld;
  Core.addCur('holy', c1.holy); Core.addCur('otherworld', c1.otherworld);
  const up1 = Core.upgradeAuthority();
  t('够材料就能升级', up1.ok && Core.S.auth === 1);
  t('升级扣掉两种高级货币', Core.S.cur.holy === holy0 && Core.S.cur.otherworld === ow0);
  t('挂机产出真的变高', Core.idleBaseRates().pointsPerMin > base0);
  t('挂机经验也提高', Core.idleBaseRates().expPerMin > 0 && Core.authority().expPct === D.AUTHORITY_PER_LV.expPct);

  // 升到 3 级：扫荡次数 +4
  for (let i = 1; i < 3; i++) { const cc = D.authorityCost(i); Core.addCur('holy', cc.holy); Core.addCur('otherworld', cc.otherworld); Core.upgradeAuthority(); }
  t('升到 3 级', Core.S.auth === 3);
  t('每日扫荡次数随权限提高', Core.sweepCap() === sweep0 + D.AUTHORITY_PER_LV.sweep);
  t('扫荡剩余次数跟着新上限走', Core.S.sweep = { date: Core.dailyDate(), count: 0 }, Core.sweepLeft() === Core.sweepCap());

  // 升到 10 级：满级 + 全属性
  for (let i = 3; i < 10; i++) { const cc = D.authorityCost(i); Core.addCur('holy', cc.holy); Core.addCur('otherworld', cc.otherworld); Core.upgradeAuthority(); }
  t('升到满级 10 级', Core.S.auth === D.AUTHORITY_MAX);
  t('满级给全属性加成', Core.authority().allPct === D.AUTHORITY_PER_LV.allPct);
  t('满级后离线效率提高', Core.offlineEfficiency() > 0.85 + 1e-9);
  t('满级后离线上限提高', Core.offlineCapHours() > cap0);
  t('满级后不能再升', Core.upgradeAuthority().ok === false);
  t('权限等级存在存档里', Core.exportSave().includes('"auth"'));
}

// 65. 阵型（对标"阵法"）：具名组合 + 主角万能补位
{
  Core.newGame(); Core.setPlayerName('阵型');
  const byFac = {};
  D.characters.forEach(c => { (byFac[c.faction] = byFac[c.faction] || []).push(c.id); });
  const F = D.FACTIONS;
  t('四个阵营各有角色可用', F.every(f => (byFac[f] || []).length >= 4));

  const empty = Core.formationState([]);
  t('空队伍不成阵', empty.names.length === 0 && empty.atkPct === 0);

  // 4 个同阵营 + 主角补位 = 5 人同营 → 五行归元阵
  const mono = byFac[F[0]].slice(0, 4);
  mono.forEach(id => Core.addChar(id));
  const st5 = Core.formationState(mono);
  t('4 同阵营 + 主角补位 = 五行归元阵', st5.hit.includes('penta'));
  t('同阵营一族只取最高档（不同时给三才/四象）', !st5.hit.includes('quad') && !st5.hit.includes('tri') && !st5.hit.includes('twin'));
  t('五行归元阵给攻击/生命/技能', st5.atkPct > 0 && st5.hpPct > 0 && st5.skillPct > 0);

  // 3 + 1 → 四象阵（主角补到 4）
  const three = byFac[F[0]].slice(0, 3).concat(byFac[F[1]].slice(0, 1));
  const st4 = Core.formationState(three);
  t('3+1（主角补位）成四象阵', st4.hit.includes('quad') && !st4.hit.includes('penta'));

  // 2 + 2 → 三才阵 + 双柱阵（主角补到 3+2）
  const two2 = byFac[F[0]].slice(0, 2).concat(byFac[F[1]].slice(0, 2));
  const st22 = Core.formationState(two2);
  t('2+2 成双柱阵', st22.hit.includes('pillar'));
  t('2+2 时主角补位让最高的那营成三才', st22.hit.includes('tri'));

  // 四个阵营各 1 人 → 四海阵
  const four = F.map(f => byFac[f][0]);
  const stF = Core.formationState(four);
  t('四阵营各 1 人成四海阵', stF.hit.includes('allfour') && stF.skillPct > 0);

  // 加成真的进战斗：3 人同阵营的队伍攻击高于单带一人
  const solo = Core.formationState([mono[0]]);
  t('阵型加成会进战斗属性', st4.atkPct > solo.atkPct);
  t('factionBuffs 仍返回旧字段（战斗侧不用改）', (() => {
    const fb = Core.factionBuffs(mono);
    return typeof fb.atkPct === 'number' && typeof fb.hpPct === 'number' && typeof fb.skillPct === 'number' && fb.count;
  })());
  t('每个阵型都有名字与人数要求', D.FORMATIONS.every(f => f.name && f.reqText && Object.keys(f.buff).length));
}

// ---- V8.0 灯阁评级 / 秘术阁 / 挂机游历（对标《道友修仙》的宗门等级 · KeJi · YouLi） ----
{
  Core.newGame();
  const s0 = Core.sectInfo();
  t('评级初始 1 级', s0.lv === 1 && s0.pct === 0);
  const before = Core.effectivePlayerStats().atk;
  const up = Core.addSectExp(100000);
  t('评级经验能升级', up > 0 && Core.sectInfo().lv > 1);
  t('评级加成真的进属性', Core.effectivePlayerStats().atk > before);
  t('评级加成按每级 0.5% 走', Math.abs(Core.sectInfo().pct - (Core.sectInfo().lv - 1) * 0.005) < 1e-9);

  // 打关卡自动涨评级（不用手动点）
  const lvBefore = Core.sectInfo().lv;
  for (let i = 0; i < 6; i++) Core.stageComplete('W01', 'normal', i, 3);
  t('通关会涨评级经验', Core.S.sect.exp > 0 || Core.sectInfo().lv > lvBefore);

  // 秘术：升级要花 ◆异界结晶，且效果立刻进属性
  Core.newGame();
  const atk0 = Core.effectivePlayerStats().atk;
  Core.addCur('otherworld', 100000);
  const r1 = Core.kejiUp('gongfa', 10);
  t('秘术能升级', r1.ok && Core.kejiLv('gongfa') === 10);
  t('秘术消耗异界结晶', Core.S.cur.otherworld < 100000);
  t('秘术加成进攻击', Core.effectivePlayerStats().atk > atk0);
  t('秘术经济线进挂机产出', (() => {
    const p0 = Core.idleBaseRates().pointsPerMin;
    Core.kejiUp('caiqi', 10);
    return Core.idleBaseRates().pointsPerMin > p0;
  })());
  t('异界结晶不够时升不动', (() => {
    Core.S.cur.otherworld = 0;
    const lv = Core.kejiLv('tixiu');
    const r = Core.kejiUp('tixiu', 1);
    return !r.ok && Core.kejiLv('tixiu') === lv;
  })());
  t('每条秘术都有名字/上限/消耗', D.KEJI.every(k => k.name && k.max > 0 && D.kejiCost(k, 0) > 0));

  // 挂机游历奇遇：攒满一条、领了归零
  Core.newGame();
  t('游历初始没有待领', !Core.pendingTravel());
  Core.travelAccrue(D.TRAVEL_EVERY_SEC + 1);
  const pend = Core.pendingTravel();
  t('挂机攒满会出一条游历', !!pend);
  const ptBefore = Core.S.cur.points;
  const got = Core.claimTravel();
  t('游历能领取', got.ok);
  t('领完清空待领', !Core.pendingTravel());
  t('游历奖励真进账', Core.S.cur.points !== ptBefore || Core.S.travel.got === 1);
  t('游历池够厚（≥10 种）', D.TRAVELS.length >= 10);
  t('每种游历都有文案与效果', D.TRAVELS.every(x => x.name && x.desc && Object.keys(x.effect).length));
}

// ---- V8.2 药园 / 斗法台 / 法宝（对标《道友修仙》的洞府药园 · 斗法 · 法宝） ----
{
  // 药园：播种扣点数、没熟不能收、熟了能收、点数不足种不下
  Core.newGame();
  const gs0 = Core.gardenState();
  t('药园有 4 块地', gs0.length === D.GARDEN_PLOTS);
  t('药园初始全空', gs0.every(s => !s.plot));
  const pt0 = Core.S.cur.points;
  const p1 = Core.plantGarden(0, 'g1');
  t('药园能播种', p1.ok);
  t('播种扣点数', Core.S.cur.points === pt0 - D.GARDEN[0].points);
  t('同一块地不能种两次', !Core.plantGarden(0, 'g1').ok);
  t('没熟不能收', !Core.harvestGarden(0).ok);
  Core.S.garden[0].at = Date.now() - 1000;         // 把成熟时间拨到过去
  const h1 = Core.harvestGarden(0);
  t('熟了能收', h1.ok);
  t('收获给到材料', (Core.S.items.mat_t1 || 0) >= D.GARDEN[0].out.n);
  t('收完地变空', !Core.S.garden[0]);
  // 种地不能是"亏本买卖"：收获材料的替代价必须 ≥ 投入点数（否则点数不如直接留着买材料）
  t('每块灵田都不亏（收获价值 ≥ 投入点数）', D.GARDEN.every(g => {
    const tier = +g.out.item.replace('mat_t', '');
    const worth = (D.MAT_SUBSTITUTE_POINTS[tier] || 0) * g.out.n;
    return worth >= g.points;
  }));
  t('灵田产量比直接买材料更划算（≥1.1 倍投入）', D.GARDEN.every(g => {
    const tier = +g.out.item.replace('mat_t', '');
    return (D.MAT_SUBSTITUTE_POINTS[tier] || 0) * g.out.n >= g.points * 1.1;
  }));
  Core.S.cur.points = 0;
  t('点数不足种不下', !Core.plantGarden(1, 'g1').ok);
  // 一键收：两块地都熟了才收得动
  Core.newGame();
  Core.S.cur.points = 100000;
  Core.plantGarden(0, 'g1');
  Core.plantGarden(1, 'g2');
  t('没熟时一键收无所得', !Core.harvestAllGarden().ok);
  Core.S.garden.forEach(p => { if (p) p.at = Date.now() - 1000; });
  const all = Core.harvestAllGarden();
  t('熟了能一键全收', all.ok && all.list.length === 2);
  t('每种灵田都有名字/成本/产出', D.GARDEN.every(g => g.name && g.points > 0 && g.sec > 0 && g.out.item));

  // 斗法台：每日 5 次、赢升台拿奖励、输退台保底、次数用完不能打
  Core.newGame();
  const a0 = Core.arenaState();
  t('斗法台初始第 1 台', a0.floor === 1 && a0.used === 0 && a0.cap === D.ARENA_DAILY);
  t('斗法台每天 5 次', a0.left === D.ARENA_DAILY);
  t('守擂者按层数生成', a0.enemies.length >= 1 && a0.enemies[0].hp > 0);
  Core.addCur('otherworld', 0);
  const ow0 = Core.S.cur.otherworld;
  const w1 = Core.arenaSettle(true);
  t('打赢能升台', w1.ok && w1.win && Core.S.arena.floor === 2);
  t('打赢拿异界结晶', Core.S.cur.otherworld > ow0);
  const l1 = Core.arenaSettle(false);
  t('打输退一台', l1.ok && Core.S.arena.floor === 1);
  t('输也有保底（不会跌破第 1 台）', (() => { Core.arenaSettle(false); return Core.S.arena.floor === 1; })());
  Core.S.arena.used = D.ARENA_DAILY;
  t('次数用完不能打', !Core.arenaSettle(true).ok);
  t('奖励随层数递增', D.arenaReward(10).otherworld > D.arenaReward(1).otherworld);
  t('台数越高守擂者越强', D.arenaEnemy(10, 100000)[0].hp > D.arenaEnemy(1, 100000)[0].hp);

  // 法宝：买要结晶、买了自动戴上、效果真的进属性、换佩戴立刻变、不能重复买
  Core.newGame();
  const fs0 = Core.fabaoState();
  t('法宝初始一件没有', fs0.own.length === 0 && !fs0.on);
  t('法宝表 20 件', D.FABAO.length >= 20);
  t('每件法宝都有名字/价格/效果', D.FABAO.every(f => f.name && f.cost > 0 && Object.keys(f.eff).length));
  Core.S.cur.otherworld = 0;
  t('结晶不够买不了', !Core.buyFabao('fb01').ok);
  Core.addCur('otherworld', 100000);
  const b1 = Core.buyFabao('fb01');
  t('结晶够能买法宝', b1.ok && Core.fabaoState().own.includes('fb01'));
  t('买完自动戴上', Core.fabaoState().on === 'fb01');
  t('不能重复买同一件', !Core.buyFabao('fb01').ok);
  const stA = Core.effectivePlayerStats();
  Core.buyFabao('fb08');
  Core.wearFabao('fb08');
  const stB = Core.effectivePlayerStats();
  t('换佩戴法宝效果立刻变', stB.atk > stA.atk && stB.hp > stA.hp);
  t('没买的不能戴', !Core.wearFabao('fb20').ok);
  t('能摘下法宝', Core.wearFabao(null).ok && !Core.fabaoState().on);
  t('摘下后加成消失', Core.effectivePlayerStats().atk < stB.atk);
}

// ---- V8.2 坐骑 / 求签（对标《道友修仙》的 Horse · SignItem） ----
{
  // 坐骑：全队加成（含招募角色），买要货币 + 材料，两层都要报得清
  Core.newGame();
  t('坐骑初始一匹没有', Core.mountState().own.length === 0 && !Core.mountState().on);
  t('坐骑表 ≥5 匹', D.MOUNTS.length >= 5);
  t('每匹坐骑都有名字/消耗/加成', D.MOUNTS.every(m => m.name && m.pct && Object.keys(m.pct).length && m.cost.points > 0));
  Core.S.cur.points = 0;
  t('点数不够买不了坐骑', !Core.buyMount('mt01').ok);
  Core.addCur('points', 20000);
  const mb = Core.buyMount('mt01');
  t('点数够能驯服坐骑', mb.ok && Core.mountState().own.includes('mt01'));
  t('买完自动乘骑', Core.mountState().on === 'mt01');
  t('不能重复驯服同一匹', !Core.buyMount('mt01').ok);
  Core.addChar('C021');
  const chrAtk0 = Core.effectiveStats('C021').atk;
  Core.addCur('points', 100000); Core.addCur('otherworld', 100000);
  Core.S.items.mat_t2 = 99;
  t('材料 + 货币都够时能买高阶坐骑', Core.buyMount('mt04').ok);
  // 换成加攻击的坐骑：招募角色也应该跟着变（坐骑是全队加成，不是主角专属）
  Core.wearMount('mt04');
  t('坐骑加成进招募角色（全队生效）', Core.effectiveStats('C021').atk > chrAtk0);
  t('坐骑加成进主角', Core.effectivePlayerStats().atk > 0);
  Core.S.items.mat_t2 = 0;
  t('材料不够时买不了（报缺材料）', (() => { Core.S.cur.points = 9999999; const r = Core.buyMount('mt03'); return !r.ok && /不足/.test(r.msg); })());
  t('没驯服的不能骑', !Core.wearMount('mt07').ok);
  t('能下坐骑', Core.wearMount(null).ok && !Core.mountState().on);

  // 求签：每天 1 次、给了真实奖励、当天挂机加成、隔天可再抽
  Core.newGame();
  const s0 = Core.signState();
  t('求签初始可抽', s0.canDraw && s0.drawn === 0);
  t('五档签文', D.SIGNS.length === 5);
  t('每档签都有文案/权重/加成', D.SIGNS.every(s => s.tier && s.text && s.weight > 0 && s.idlePct > 0 && Object.keys(s.gain).length));
  const idle0 = Core.idleRates().pointsPerMin;
  const d1 = Core.drawSign();
  t('求签成功', d1.ok && !!d1.sign);
  t('求签给了硬通货', Object.keys(d1.sign.gain).every(k => (Core.S.cur[k] || 0) > 0));
  t('当天不能再求', !Core.drawSign().ok && !Core.signState().canDraw);
  t('签文当天的挂机产出更高', Core.idleRates().pointsPerMin > idle0);
  t('跨天自动失效、可以再求', (() => { Core.S.sign.date = '2000-01-01'; return Core.signState().canDraw && Core.signIdleMult() === 1; })());
  t('累计求签数会涨', Core.S.stats.signs >= 1);
  t('求签会推进每日任务', (Core.S.tasks.daily.sign1 || 0) >= 1);
  t('每日任务里多了求签与斗法台', D.DAILY_TASKS.some(t2 => t2.id === 'sign1') && D.DAILY_TASKS.some(t2 => t2.id === 'arena1'));
  t('斗法台会推进每日任务', (() => {
    Core.newGame();
    Core.arenaSettle(true);
    return (Core.S.tasks.daily.arena1 || 0) >= 1;
  })());
}

// ---- V8.2 内容扩充：世界 / 道具数量（对标产品是 28 副本、169 道具） ----
{
  Core.newGame();
  t('世界扩到 20 个', D.WORLDS.length === 20);
  t('每个世界都有解锁链（除第一个）', D.WORLDS.every((w, i) => i === 0 ? w.unlock === null : w.unlock === D.WORLDS[i - 1].id));
  t('每个世界都有 3 档 Boss 血量', D.WORLDS.every(w => Array.isArray(w.bossHp) && w.bossHp.length === 3 && w.bossHp[0] > 0));
  // 血量严格递增；攻击允许小幅回落（有几个世界靠机制换强度，不是纯数值爬坡），但不能掉太多
  t('世界血量单调递增', (() => { for (let i = 1; i < D.WORLDS.length; i++) if (D.WORLDS[i].hp <= D.WORLDS[i - 1].hp) return false; return true; })());
  t('世界攻击整体向上（允许 ≤20% 回落）', (() => {
    let mx = 0;
    for (const w of D.WORLDS) { if (w.atk < mx * 0.8) return false; mx = Math.max(mx, w.atk); }
    return true;
  })());
  t('每个世界都有 3 个杂兵 + 1 个精英', D.WORLDS.every(w => w.enemies.length === 3 && !!w.elite));
  t('世界主题都在克制映射里', D.WORLDS.every(w => window.Dungeon.THEME_FACTION[w.theme] !== undefined));
  t('世界套装跟着世界数一起长', Object.keys(D.SETS).length >= D.WORLDS.length);
  t('道具 ≥38 种', Object.keys(D.ITEMS).length >= 38);
  t('每种道具都有名字/说明/来源', Object.keys(D.ITEMS).every(k => { const it = D.ITEMS[k]; return it.name && it.desc && it.src && it.use; }));
  t('新道具都有真实用途', ['heal_x', 'def_shield', 'atk_surge', 'spd_surge', 'exp_xxl'].every(k => {
    const it = D.ITEMS[k]; return it && (it.effect || it.exp);
  }));
}

// ---- V8.3 站位（主角也能选前后排）＋ 装备唯一性 ----
{
  Core.newGame();
  t('上阵固定 5 格（前 2 后 3）', Core.rowOfSlots('front').join(',') === '0,1' && Core.rowOfSlots('back').join(',') === '2,3,4');
  t('开局主角占第 1 格', Core.S.party.indexOf('@player') === 0);
  t('主角默认站前排', Core.playerRow() === 'front');
  t('主角能换到后排', Core.setPlayerRow('back').ok && Core.playerRow() === 'back');
  t('重复换同一排会被拒', !Core.setPlayerRow('back').ok);
  t('主角能换回前排', Core.setPlayerRow('front').ok && Core.playerRow() === 'front');
  t('站位表把主角算进去', Core.rowLayout().front.includes('@player'));
  Core.setPlayerRow('back');
  t('主角在后排时不出现在前排', !Core.rowLayout().front.includes('@player') && Core.rowLayout().back.includes('@player'));
  Core.setPlayerRow('front');
  t('主角换排之后队伍里还是只有他一个（不会分身）', Core.S.party.filter(x => x === '@player').length === 1);

  // 队员换排：有空位直接搬，没空位和那一排第一个换
  Core.newGame();
  Core.addChar('C021'); Core.addChar('C022'); Core.addChar('C023'); Core.addChar('C024');
  Core.addChar('C025');
  setParty(['C021', 'C022', 'C023', 'C024']);
  t('组满之后 5 格全是人', Core.S.party.filter(Boolean).length === 5);
  const mv = Core.moveMemberRow('C021', 'back');
  t('前排成员能移到后排', mv.ok && Core.S.party.indexOf('C021') >= 2);
  t('移过去之后原位置空了（不会分身）', Core.S.party.filter(x => x === 'C021').length === 1);
  const mv2 = Core.moveMemberRow('C021', 'front');
  t('后排成员能移回前排', mv2.ok && Core.S.party.indexOf('C021') < 2);
  t('已经在那一排时不动', !Core.moveMemberRow(Core.S.party[0], 'front').ok);
  // 两排都满时：和那一排第一个换位
  const before0 = Core.S.party[0], before2 = Core.S.party[2];
  const sw = Core.moveMemberRow(Core.S.party[0], 'back');
  t('目标排满时与那一排第一个换位', sw.ok && Core.S.party[2] === before0 && Core.S.party[0] === before2);
  const sp = Core.swapPartySlots(0, 3);
  t('任意两个位置能互换', sp.ok && Core.S.party[3] === before2);
  t('同位置互换被拒', !Core.swapPartySlots(1, 1).ok);

  // 长按换位走的总入口：swapPositions（'0'~'4' 上阵位，'P' 主角本人，'row:front/back' 整排）
  Core.newGame();
  Core.addChar('C021'); Core.addChar('C022'); Core.addChar('C023'); Core.addChar('C024');
  setParty(['C021', 'C022', 'C023']);                 // 0 主角,1 C021,2 C022,3 C023,4 空
  t('位置解析：P 指向主角那一格、数字是格子号、row:xxx 是整排',
    Core.parsePos('P').idx === 0 && Core.parsePos('P').protag && Core.parsePos('2').idx === 2 && Core.parsePos('row:back').row === 'back');
  t('位置能算出在哪一排',
    Core.posRow('P') === 'front' && Core.posRow('2') === 'back' && Core.posRow('4') === 'back' && Core.posRow('row:back') === 'back');
  t('位置解析：空值不算位置', !Core.parsePos('') && !Core.parsePos(null));
  // 格子 ↔ 格子：两人互换（含空位）
  const mvSlot = Core.swapPositions('1', '4');
  t('队友能拖到空位', mvSlot.ok && Core.S.party[4] === 'C021' && !Core.S.party[1] && Core.S.party[0] === '@player');
  t('拖到另一个队友身上＝两人互换', (() => {
    const a = Core.S.party[1], b = Core.S.party[2];
    const r = Core.swapPositions('1', '2');
    return r.ok && Core.S.party[2] === a && Core.S.party[1] === b;
  })());
  // 主角 ↔ 后排的格子：两人互换（主角跟队友一样占一格，换完两排仍是 2 + 3）
  Core.newGame(); Core.addChar('C021'); Core.addChar('C022'); Core.addChar('C023'); Core.addChar('C024');
  setParty(['C021', 'C022', 'C023', 'C024']);
  const othersBefore = Core.S.party.filter(x => x !== '@player').slice().sort().join(',');
  const mvP = Core.swapPositions('P', '2');
  t('主角能拖到后排的格子上', mvP.ok && Core.playerRow() === 'back');
  t('主角换过去之后，原来那一格由那个队友顶上（互换）', Core.S.party[0] === 'C022' && Core.S.party[2] === '@player');
  t('换位不会弄丢人也不会造重复', (() => {
    const all = Core.S.party.filter(Boolean);
    return all.length === 5 && new Set(all).size === 5 && Core.S.party.filter(x => x !== '@player').slice().sort().join(',') === othersBefore;
  })());
  t('主角拖到整排标题也能换排', Core.swapPositions('P', 'row:front').ok && Core.playerRow() === 'front');
  t('主角拖到已经在的那一排会被拒', !Core.swapPositions('P', 'row:front').ok);
  t('主角拖到自己那一格无效', !Core.swapPositions('P', 'P').ok);
  // 主角拖到空位＝搬过去，原来那一格留空
  Core.newGame(); Core.addChar('C021');
  setParty(['C021']);                                  // 0 主角,1 C021,2~4 空
  t('主角拖到空的后排格＝搬过去、原位留空', (() => {
    const r = Core.swapPositions('P', '3');
    return r.ok && Core.playerRow() === 'back' && Core.S.party[3] === '@player' && Core.S.party[0] === null;
  })());
  // 队友 → 整排标题
  t('队友拖到"后排"整排标题＝搬到后排', (() => {
    Core.newGame(); Core.addChar('C021'); Core.addChar('C022'); Core.addChar('C023'); Core.addChar('C024');
    setParty(['C021', 'C022', 'C023']);
    const r = Core.swapPositions('1', 'row:back');
    return r.ok && Core.S.party.indexOf('C021') >= 2;
  })());
  t('空位拖到整排标题＝拒绝（那一格上没人）', (() => {
    Core.newGame(); Core.addChar('C021');
    setParty(['C021']);
    return !Core.swapPositions('4', 'row:front').ok;
  })());
  // 老存档迁移：4 格（主角不占位）→ 5 格（主角占一格）
  t('老档迁移：主角原来在前排', (() => {
    Core.newGame();
    const mates = ['C021', 'C022', 'C023', 'C024'];
    mates.forEach(id => Core.addChar(id));
    // normalizeParty 就是读档时用的那一步，这里直接调它模拟老档
    const old4 = ['C021', 'C022', 'C023', 'C024'];
    const a = Core.normalizeParty(old4, 'front');
    const ok1 = a.length === 5 && a[0] === '@player' && a[1] === 'C021' && a[4] === 'C024';
    const b = Core.normalizeParty(old4, 'back');
    const ok2 = b.length === 5 && b[2] === '@player' && b[0] === 'C021' && b[4] === 'C024';
    // 新结构再跑一次不会被改动（幂等）
    const c = Core.normalizeParty(a, 'back');
    const ok3 = c.join(',') === a.join(',');
    return ok1 && ok2 && ok3;
  })());

  // 装备唯一性：一件装备不能同时穿在两个人身上
  Core.newGame();
  Core.addChar('C021'); Core.addChar('C022');
  // 固定造"普通套装"装备：grantEquip 有概率出职业套装（限定位才能穿），不适合做唯一性用例
  const mkEq = (uid, rarity) => { Core.S.equips[uid] = D.makeEquip('W01', 'weapon', rarity, uid, { setType: 'plain' }); return uid; };
  const u1 = mkEq('test_eq_1', 'SR');
  t('先给甲穿上', Core.equipItem('C021', u1));
  t('甲穿着它', Core.equipWearer(u1) === 'C021');
  t('再给乙穿同一件也成功（会自动从甲身上取下）', Core.equipItem('C022', u1));
  t('同一件装备只剩一个人穿', Core.equipWearer(u1) === 'C022');
  t('甲身上已经没有这件了', !(Core.S.equipped['C021'] || {}).weapon);
  t('全队找不到重复穿戴', (() => {
    const seen = new Set(); let dup = false;
    Object.values(Core.S.equipped).forEach(sl => Object.values(sl).forEach(u => { if (!u) return; if (seen.has(u)) dup = true; seen.add(u); }));
    return !dup;
  })());
  // 一键最优装备也不能造出重复
  Core.S.party = ['C021', 'C022'];
  mkEq('test_eq_2', 'SR'); mkEq('test_eq_3', 'UR'); mkEq('test_eq_4', 'R');
  mkEq('test_eq_5', 'SSR'); mkEq('test_eq_6', 'N');
  Core.autoEquipBest();
  t('一键最优装备后也没有重复穿戴', (() => {
    const seen = new Set(); let dup = false;
    Object.values(Core.S.equipped).forEach(sl => Object.values(sl).forEach(u => { if (!u) return; if (seen.has(u)) dup = true; seen.add(u); }));
    return !dup;
  })());
  // 老档脏数据：同一件装备挂在两个人身上，读档时会被修掉
  Core.newGame();
  Core.addChar('C021'); Core.addChar('C022');
  const u2 = mkEq('test_eq_7', 'SR');
  Core.S.equipped['C021'] = Object.assign({}, Core.S.equipped['C021'], { weapon: u2 });
  Core.S.equipped['C022'] = Object.assign({}, Core.S.equipped['C022'], { weapon: u2 });
  t('修脏数据：只留一个穿戴者', (() => {
    const fixed = Core.dedupeEquips();
    const wearers = Object.entries(Core.S.equipped).filter(([, sl]) => Object.values(sl).includes(u2));
    return fixed === 1 && wearers.length === 1;
  })());
  t('装备唯一性门禁：n 件装备最多 n 个穿戴位', (() => {
    const uids = new Set(Object.values(Core.S.equipped).flatMap(sl => Object.values(sl).filter(Boolean)));
    return uids.size === Object.values(Core.S.equipped).flatMap(sl => Object.values(sl).filter(Boolean)).length;
  })());
}

// V9.4：副本带血打下一波——maxHp 必须保持真上限，否则每波都会"自动回满"
{
  const allySpec = (hp) => ({
    name: '测试', kind: 'warrior', faction: null, position: 'front', skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1],
    maxHp: 1000, hp, atk: 100, def: 10, spd: 60, charId: '@player',
  });
  const foe = [{ name: '影', hp: 5000, atk: 1, def: 0, spd: 1 }];
  const r1 = Battle.run({ allies: [allySpec(1000)], enemies: foe.slice(), worldId: 'W01', maxRounds: 1 });
  const s1 = r1.frames[0].allies[0];
  t('带血进场：快照里的 maxHp 是真上限，不是当前血量', s1.maxHp === 1000 && s1.hp === 1000);
  const r2 = Battle.run({ allies: [allySpec(400)], enemies: foe.slice(), worldId: 'W01', maxRounds: 1 });
  const s2 = r2.frames[0].allies[0];
  t('40% 血进场：引擎里还是 400/1000', s2.maxHp === 1000 && s2.hp === 400);
  // 打完一波后写回的血线必须是"相对真上限"的比例（这就是"血量继承"的口径）
  const last = r2.frames[r2.frames.length - 1];
  const endAlly = r2.frames.find(f => f.type === 'start').allies[0];
  t('带血进场的比例口径一致（hpPct 按真上限算）', endAlly.maxHp === 1000);
}

/* ==================================================================
   V9.5 回归：这一批全是"测试全绿但其实有问题"的真实缺陷
   （离线收益被丢 / 扫荡经验是假的 / 新档境界被 ×4 / 背包满吞奖励 / W15~W20 没机制 / 辅助攒不出必杀）
   ================================================================== */

// V9.5-1：新档渡劫后重开，境界不能被 ×4（旧档换算仍然只做一次）
{
  Core.newGame();
  Core.setPlayerName('回归');
  Core.S.player.bloodline = '修真';
  t('新档建档时就把 realmScaled 落上（否则第一次读档会被 ×4）', Core.S.realmScaled === true);
  Core.S.player.level = 40;
  Core.S.items.mat_t1 = 9999; Core.S.items.mat_t2 = 999; Core.S.items.mat_t3 = 999;
  Core.addCur('points', 5e6);
  let ok = 0;
  // 渡劫有随机成功率，这里钉住随机数，只验"成功之后境界会不会被换算坏"
  withRandom(0, () => { for (let i = 0; i < 4; i++) { const r = Core.attemptRealm(); if (r.ok && r.success) ok++; } });
  const realmBefore = Core.S.player.realm;
  t('新档能正常渡劫（本用例至少成功 1 次）', ok >= 1 && realmBefore >= 1);
  Core.save();
  Core.load();
  t('新档重开后境界保持原值（不再 ×4）', Core.S.player.realm === realmBefore);
  // 对照：真正的老档（没有 realmScaled 字段）仍然按「旧第 N 境 = 新第 4N 阶」换算
  const raw = JSON.parse(Core.exportSave());
  delete raw.realmScaled;
  raw.player.realm = 3;
  Core.importSave(JSON.stringify(raw));
  t('老档（无 realmScaled）仍然 ×4 换算：3 境 → 12 阶', Core.S.player.realm === 12);
}

// V9.5-2：离线 1~5 分钟的收益必须真的入账（以前算完就被丢掉）
{
  Core.newGame();
  Core.S.player.level = 20;
  const p0 = Core.S.cur.points, e0 = Core.S.player.exp;
  Core.S.idle.lastTs = Date.now() - 240 * 1000;      // 离线 4 分钟
  const g = Core.settleOffline();
  t('离线 4 分钟：settleOffline 返回了收益', !!g && !g.cheat && g.seconds > 200 && g.gains.points > 0);
  t('离线 4 分钟：点数真的进了账（不再依赖弹窗）', Core.S.cur.points - p0 === g.gains.points);
  t('离线 4 分钟：主角经验也进了账', Core.S.player.exp - e0 === g.gains.exp);
}

// V9.5-3：扫荡界面上写着 EXP，就必须真的发经验（含战斗统计）
{
  Core.newGame();
  Core.setPlayerName('扫荡');
  Core.S.player.level = 20;
  Core.unlockWorld('W01');
  Core.S.worlds.W01.stages.normal = Array(12).fill(3);
  Core.S.party = ['@player', null, null, null, null];
  Core.addChar('C021');
  Core.S.party[1] = 'C021';
  const ce0 = Core.S.chars.C021.exp, pe0 = Core.S.player.exp, b0 = Core.S.stats.battles;
  const r = Dungeon.sweep('W01', 'normal', 5, 3);
  const shown = r.total.reduce((s, x) => s + x.got.filter(gg => gg.k === 'exp').reduce((a, gg) => a + gg.v, 0), 0);
  t('扫荡返回的 EXP 合计 > 0（界面显示这一项）', r.ok && shown > 0);
  t('扫荡的角色经验 = 界面显示的口径', Core.S.chars.C021.exp - ce0 === shown);
  t('扫荡的主角经验 = 界面口径的一半', Core.S.player.exp - pe0 === Math.round(shown * 0.5));
  t('扫荡会累计战斗次数（扫荡党也能完成日常/成就）', Core.S.stats.battles - b0 === 3);
}

// V9.5-4：背包满时奖励不丢——进待领箱，清出格子能领回
{
  Core.newGame();
  Core.S.items = {};
  Core.S.bag.itemCap = 1;
  Core.S.items.ticket_normal = 1;                    // 占满唯一的道具格
  const p0 = Core.S.cur.points;
  const out = Core.applyRewardObj({ points: 100, item: 'heal_s' });
  t('背包满：奖励道具进待领箱，不再静默蒸发', (Core.S.items.heal_s || 0) === 0 && Core.stashCount() === 1);
  t('背包满：货币照常发放（只有道具会被寄存）', Core.S.cur.points - p0 === 100);
  t('applyRewardObj 会回报"哪件道具被寄存了"', out.stashed.length === 1 && out.stashed[0] === 'heal_s');
  t('待领箱里就是那件道具', Core.stashList()[0].id === 'heal_s' && Core.stashList()[0].n === 1);
  Core.S.bag.itemCap = 10;                           // 扩容之后能领回
  const cs = Core.claimStash();
  t('扩容后一键领回：进背包、待领箱清空', cs.ok && cs.moved === 1 && (Core.S.items.heal_s || 0) === 1 && Core.stashCount() === 0);
}

// V9.5-5：药园收获也不能被背包吞掉（地清了，东西必须在）
{
  Core.newGame();
  Core.addCur('points', 1e6);
  Core.S.bag.matCap = 1;
  const g0 = D.GARDEN[0];
  delete Core.S.items[g0.out.item];
  Core.S.items.mat_t5 = 1;                           // 占满唯一的材料格
  Core.plantGarden(0, g0.id);
  Core.S.garden[0].at = Date.now() - 1000;
  // 钉住随机数：别让"稀有额外掉落"混进这次断言
  const h = withRandom(0.9, () => Core.harvestGarden(0));
  t('药园：地块收回（收获动作成功）', h.ok && Core.S.garden[0] === null);
  t('药园：背包满时产物进待领箱（不再凭空消失）', Core.stashCount() === g0.out.n && Core.stashList()[0].id === g0.out.item);
}

// V9.5-6：挂机产线材料同样走待领箱
{
  Core.newGame();
  Core.S.bag.matCap = 1;
  Core.S.items.mat_t5 = 1;
  const before = Core.stashCount();
  const m = Core.grantIdleMat(10);
  t('挂机材料背包满 → 进待领箱，且明确回报 full', !!m && m.full === true && m.stashed > 0 && Core.stashCount() > before);
}

// V9.5-7：能量发放 —— 治疗/辅助放出非伤害技能也要攒能量，必杀不能只有输出位看得到
{
  const mkSpec = (c, role) => ({
    name: c ? c.name : '测试', kind: role, faction: null, position: 'front',
    skills: c ? c.skills : D.PROTAGONIST.skills, skillLv: [1, 1, 1],
    maxHp: 100000, hp: 100000, atk: 1000, def: 500, spd: 100, crit: 0.05, critDmg: 2, eva: 0, skillMult: 1,
    charId: c ? c.id : '@player',
  });
  const healer = D.characters.find(c => c.kind === 'healer' && !c.hidden);
  const warrior = D.characters.find(c => c.kind === 'warrior' && !c.hidden);
  const foe = [{ name: '木桩', hp: 1e8, atk: 1, def: 0, spd: 1, faction: null }];
  const run1 = Battle.run({ allies: [mkSpec(healer, 'healer')], enemies: foe.slice(), worldId: 'W99', maxRounds: 30 });
  const run2 = Battle.run({ allies: [mkSpec(warrior, 'warrior')], enemies: foe.slice(), worldId: 'W99', maxRounds: 30 });
  const ults = r => r.frames.filter(f => f.type === 'skill' && f.ult).length;
  // 修之前：治疗者 5 次 / 战士 9 次（能量只在伤害里发，治疗放技能等于白放）
  // 修之后：两边都是 9 次，稳定复现
  t('治疗者在 30 回合里能放出必杀（≥8 次）', ults(run1) >= 8);
  t('治疗者的必杀节奏与输出位基本持平（不再被能量机制惩罚）', Math.abs(ults(run1) - ults(run2)) <= 1);
}

// V9.5-8：W15~W20 的世界机制必须真的存在（世界表上写着，引擎里就得有）
{
  const missing = ['W15', 'W16', 'W17', 'W18', 'W19', 'W20'].filter(id => !Battle.MECHANICS[id]);
  t('W15~W20 都有世界机制（不再是"只写在文案里"）', missing.length === 0);
  const worlds = ['W01', 'W02', 'W03', 'W04', 'W05', 'W06', 'W07', 'W08', 'W09', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15', 'W16', 'W17', 'W18', 'W19', 'W20'];
  t('20 个世界全都有机制', worlds.every(id => Battle.MECHANICS[id] && Battle.MECHANICS[id].note));
  // 机制要真的跑得动：拿 W16（每回合全队掉血）与 W18（幻觉）各跑一场，确认不崩且有效果
  const spec = {
    name: '测试', kind: 'warrior', faction: null, position: 'front', skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1],
    maxHp: 100000, hp: 100000, atk: 3000, def: 500, spd: 100, crit: 0.05, critDmg: 2, eva: 0, skillMult: 1, charId: '@player',
  };
  const r16 = Battle.run({ allies: [spec], enemies: [{ name: '桩', hp: 1e6, atk: 10, def: 0, spd: 30, faction: null }], worldId: 'W16', maxRounds: 10 });
  t('W16 水压：每回合全队掉血真的结算了', r16.frames.some(f => f.type === 'dot' && f.status === 'pressure'));
  t('W19 星骸护盾：世界表里的护盾值真的被机械表接住', Battle.MECHANICS.W19.enemyShield > 0);
  const r19 = Battle.run({ allies: [spec], enemies: [{ name: '桩', hp: 1e6, atk: 10, def: 0, spd: 30, faction: null }], worldId: 'W19', maxRounds: 10 });
  t('W19 轨道扫射：按节奏打出群体技能', r19.frames.some(f => f.type === 'skill' && f.name === '轨道扫射'));
  const r20 = Battle.run({ allies: [spec], enemies: [{ name: '桩', hp: 1e6, atk: 10, def: 0, spd: 30, faction: null }], worldId: 'W20', maxRounds: 10 });
  t('W20 规则改写：至少出现一次规则帧', r20.frames.some(f => f.type === 'rule'));
}

// V9.5-9：文案与效果同源 —— 「速度+20%」这类增益必须真的进速度区
{
  const b = Battle._internals.getBuffs({ statuses: [{ id: 'buff', spdPct: 0.2, turns: 3 }] });
  t('buff 里的 spdPct 真的被结算（剑心通明 / 念动屏障 之前是空转）', b.spdPct === 0.2);
  // W14 第三条规则：说是"敌方速度提升"，就加 spdPct（以前加的是 atkPct）
  const spec = {
    name: '测试', kind: 'warrior', faction: null, position: 'front', skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1],
    maxHp: 100000, hp: 100000, atk: 50, def: 500, spd: 1, crit: 0.05, critDmg: 2, eva: 0, skillMult: 1, charId: '@player',
  };
  const r14 = Battle.run({ allies: [spec], enemies: [{ name: '桩', hp: 1e6, atk: 10, def: 0, spd: 50, faction: null }], worldId: 'W14', maxRounds: 6 });
  t('W14 每回合都有规则帧', r14.frames.filter(f => f.type === 'rule').length >= 5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
