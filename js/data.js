/* 《残域》静态数据库 —— 依据 V5.0《完整内容数据库》冻结版落地 */
window.DATA = (function () {
  // 确定性随机（保证每次加载生成的数据一致）
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20260909);
  const ri = (min, max) => min + Math.floor(rng() * (max - min + 1));

  /* ================= 基础常量 ================= */
  const ATTR_NAMES = { muscle: '肌肉', immune: '免疫', cell: '细胞', nerve: '神经', intelligence: '智力', spirit: '精神' };
  const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR'];
  const RARITY_COLOR = { N: '#9aa4b2', R: '#4da3ff', SR: '#b06bff', SSR: '#ffb03a', UR: '#ff4d6d' };
  const STAR_MULT = [1, 1.10, 1.22, 1.36, 1.52, 1.70];
  const RARITY_MAXSTAR = { N: 3, R: 4, SR: 5, SSR: 6, UR: 6 };
  const STAR_COST = [0, 50, 100, 180, 300, 500];            // 1→2…5→6 所需碎片
  const DUP_SHARDS = { N: 20, R: 40, SR: 80, SSR: 160, UR: 320 };
  const FACTIONS = ['先锋', '策略', '科技', '异能'];
  // 克制环：先锋→策略→科技→异能→先锋（克制方伤害+15%，被克-10%）
  const FACTION_COUNTER = { '先锋': '策略', '策略': '科技', '科技': '异能', '异能': '先锋' };

  /* ================= 阵型（对标《道友修仙》的"阵法"） ================= */
  // 它的做法是：不是笼统说"同门派有加成"，而是把组合写成具名阵法 + 具体人数要求（例如
  // 「阵法要求：3 个巨剑门和 3 个无极门道友组队」），玩家一眼知道自己现在站的是哪一阵、还差什么。
  // 这里照这个思路做：每一档都写清"需要几个人、加成是多少"，由 core.formationState 判定命中。
  // 主角不属于任何阵营，但在编阵时是"万能补位"——可以顶任意一个阵营的人数，凑不出 5 人同营时它就是那个第 5 人。
  const FORMATIONS = [
    { id: 'twin',   name: '双子阵',     reqText: '同一阵营 2 人',              buff: { atkPct: 0.03 } },
    { id: 'tri',    name: '三才阵',     reqText: '同一阵营 3 人',              buff: { atkPct: 0.06, hpPct: 0.06 } },
    { id: 'quad',   name: '四象阵',     reqText: '同一阵营 4 人',              buff: { atkPct: 0.10, hpPct: 0.10, skillPct: 0.05 } },
    { id: 'penta',  name: '五行归元阵', reqText: '同一阵营 5 人（主角可补位）', buff: { atkPct: 0.14, hpPct: 0.14, skillPct: 0.08 } },
    { id: 'pillar', name: '双柱阵',     reqText: '两个阵营各 2 人',            buff: { atkPct: 0.04, hpPct: 0.04 } },
    { id: 'allfour',name: '四海阵',     reqText: '四个阵营各 1 人',            buff: { atkPct: 0.04, hpPct: 0.04, skillPct: 0.04 } },
  ];

  // 经验表：Lv→Lv+1 所需 EXP = round(80 × Lv^1.32)；角色升级另耗点数 round(40 × 1.06^(Lv-1))
  // 2026-09-12 调整：旧曲线（100×Lv^1.55 / 50×1.075）单人满级需纯挂机 ~200 小时点数 + ~1600 小时经验，
  // 与挂机产出严重脱节；调整为 Lv1→100 累计 EXP 148.8 万 / 点数 21.3 万，纯挂机约 41 / 171 小时。
  const EXP_TABLE = [0];
  const LEVEL_POINTS = [0];
  for (let lv = 1; lv <= 100; lv++) {
    EXP_TABLE[lv] = Math.round(80 * Math.pow(lv, 1.32));
    LEVEL_POINTS[lv] = Math.round(40 * Math.pow(1.06, lv - 1));
  }

  /* ================= 主角六维（V5 §2.1） ================= */
  const ATTR_META = [
    { id: 'muscle',       name: '肌肉', desc: '物理攻击、生命' },
    { id: 'immune',       name: '免疫', desc: '防御、异常抗性' },
    { id: 'cell',         name: '细胞', desc: '生命、回复' },
    { id: 'nerve',        name: '神经', desc: '速度、闪避、暴击' },
    { id: 'intelligence', name: '智力', desc: '技能伤害、暴击率' },
    { id: 'spirit',       name: '精神', desc: '技能效果、治疗' },
  ];
  const ATTR_POINTS_PER_LV = 3;   // 每升 1 级获得的属性点
  const ATTR_POINT_VALUE = 2;     // 每点属性点增加的六维值
  const BLOODLINE_UNLOCK_LV = 1;  // 开局第一件事就是选血统（境界线跟着血统走，所以不能拖到 Lv.10）

  /* ================= 背包容量 ================= */
  // V9.2：背包分三池——道具 / 材料 / 装备，各 50 格起、各自扩容。
  // 每次扩容 +10 格（背包界面上就是"末尾多出一格＋号"）。
  const BAG_BASE_ITEM_CAP = 50;   // 道具（消耗品 / 宝箱 / 经验模块 / 血清 / 招募券）
  const BAG_BASE_MAT_CAP = 50;    // 材料（强化材料 + 兽魂石）
  const BAG_BASE_EQ_CAP = 50;     // 未穿戴的装备，每件 1 格
  const BAG_BASE_CAP = 100;       // 老档迁移用（旧的合并池基础值）
  const SWEEP_DAILY_CAP = 60;   // 每日扫荡上限（504 关体量下 30 次太少，2026-09-12 提到 60）
  const BAG_EXPAND_SIZE = 10;
  // 每次 +10 格，所以价格曲线比"一次 +50"平缓得多（第一条 1500 点，约挂机 2 小时）
  function bagExpandCost(expands) { return Math.round(1500 * Math.pow(1.3, expands)); }

  const CURRENCIES = [
    { id: 'points',     name: '点数',     icon: '◈', color: '#ffd76a' },
    { id: 'story',      name: '故事点',   icon: '❖', color: '#7ee0a3' },
    { id: 'otherworld', name: '异界结晶', icon: '◆', color: '#6ec6ff' },
    { id: 'holy',       name: '圣洁晶石', icon: '✦', color: '#ff9ecb' },
    { id: 'skillChip',  name: '技能芯片', icon: '▣', color: '#c5a3ff' },
    { id: 'bloodCrystal', name: '血统结晶', icon: '❥', color: '#ff6b6b' },
    { id: 'corridor',   name: '深井徽记', icon: '♜', color: '#8be9e9' },
    { id: 'rp',         name: '转生点',   icon: '♾', color: '#ffe08a' },
  ];

  /* ================= 角色 ================= */
  // 定位 → 战斗模板
  const ROLE_KIND = {
    '战士': 'warrior', '狂战': 'warrior', '近战输出': 'warrior', '全能战士': 'warrior', '终极狂战': 'warrior', '反击坦克': 'tank',
    '坦克': 'tank', '重装': 'tank',
    '射手': 'ranger', '狙击': 'ranger', '重火力': 'ranger', '能量炮': 'ranger', '星舰炮手': 'ranger', '无人机': 'ranger',
    '法师': 'mage', '爆发法师': 'mage', '冰法': 'mage', '火焰': 'mage', '元素大师': 'mage',
    '治疗': 'healer', '群体治疗': 'healer', '圣愈': 'healer', '终极治疗': 'healer',
    '控制': 'controller', '精神控制': 'controller', '控场': 'controller', '精神支配': 'controller', '终极控制': 'controller', '精神爆发': 'mage',
    '刺客': 'assassin', '暗杀': 'assassin', '终极刺客': 'assassin',
    '剑士': 'saber', '剑修': 'saber', '法剑': 'saber', '终极剑修': 'saber',
    '辅助': 'support', '全能辅助': 'support', '增益': 'support', '法阵': 'support', '法阵大师': 'support',
    '吸血': 'vampire', '吸血辅助': 'vampire',
  };
  const ROLE_WEIGHT = {
    warrior:    [1.5, 1.0, 1.1, 1.0, 0.5, 0.6],
    tank:       [1.1, 1.6, 1.5, 0.6, 0.4, 0.4],
    ranger:     [1.0, 0.7, 0.8, 1.6, 1.1, 0.5],
    mage:       [0.4, 0.7, 0.8, 1.0, 1.7, 1.4],
    healer:     [0.5, 0.9, 1.2, 0.9, 1.2, 1.7],
    controller: [0.4, 0.7, 0.8, 1.5, 1.4, 1.6],
    assassin:   [1.3, 0.6, 0.8, 1.8, 0.8, 0.7],
    support:    [0.5, 1.0, 1.0, 1.0, 1.3, 1.5],
    saber:      [1.2, 0.8, 0.9, 1.4, 1.1, 0.8],
    vampire:    [1.2, 0.8, 1.2, 1.3, 0.8, 0.9],
  };
  const ATK_ATTR = { mage: 'intelligence', controller: 'intelligence', healer: 'spirit', support: 'spirit' };

  // 技能模板（按战斗模板）：技能1(CD3) / 技能2(CD5) / 必杀(能量100) / 被动
  const SKILL_TPL = {
    warrior: {
      s1: { name: '重斩', desc: '对单体造成 180% 伤害', cd: 3, type: 'dmg', mult: 1.8, target: 'enemy' },
      s2: { name: '战意觉醒', desc: '自身攻击 +30%，持续 3 回合', cd: 5, type: 'buff', buff: { atkPct: 0.3, turns: 3 }, target: 'self' },
      ult: { name: '裂空斩', desc: '对单体造成 380% 伤害并附加破甲 2 回合', type: 'dmg', mult: 3.8, status: { id: 'sunder', turns: 2 }, target: 'enemy' },
      passive: { name: '嗜战', desc: '生命低于 50% 时攻击 +20%' },
    },
    tank: {
      s1: { name: '盾击', desc: '造成 120% 伤害并嘲讽 2 回合', cd: 3, type: 'dmg', mult: 1.2, status: { id: 'taunt', turns: 2, self: true }, target: 'enemy' },
      s2: { name: '铁壁', desc: '获得 25% 最大生命的护盾', cd: 5, type: 'shield', mult: 0.25, target: 'self' },
      ult: { name: '灯阁壁垒', desc: '全队获得 20% 最大生命护盾并减伤 20%（2 回合）', type: 'teamshield', mult: 0.20, buff: { defPct: 0.2, turns: 2 }, target: 'team' },
      passive: { name: '坚韧', desc: '受到伤害 -12%' },
    },
    ranger: {
      s1: { name: '连射', desc: '对随机敌人射击 2 次，每次 90% 伤害', cd: 3, type: 'dmg', mult: 0.9, hits: 2, target: 'random' },
      s2: { name: '瞄准', desc: '自身暴击率 +25%，持续 3 回合', cd: 5, type: 'buff', buff: { critPct: 0.25, turns: 3 }, target: 'self' },
      ult: { name: '毁灭狙击', desc: '对单体造成 420% 伤害，必定暴击', type: 'dmg', mult: 4.2, sureCrit: true, target: 'enemy' },
      passive: { name: '猎手直觉', desc: '暴击伤害 +25%' },
    },
    mage: {
      s1: { name: '元素冲击', desc: '对单体造成 190% 伤害并附加燃烧 2 回合', cd: 3, type: 'dmg', mult: 1.9, status: { id: 'burn', turns: 2 }, target: 'enemy' },
      s2: { name: '法力涌动', desc: '全队技能伤害 +15%，持续 3 回合', cd: 5, type: 'buff', buff: { skillPct: 0.15, turns: 3 }, target: 'team' },
      ult: { name: '陨星坠落', desc: '对敌方全体造成 260% 伤害', type: 'dmg', mult: 2.6, target: 'allEnemies' },
      passive: { name: '元素亲和', desc: '技能伤害 +12%' },
    },
    healer: {
      s1: { name: '治疗术', desc: '治疗生命最低的队友 220% 精神', cd: 3, type: 'heal', mult: 2.2, target: 'lowest' },
      s2: { name: '净化', desc: '清除全队 1 个异常状态并治疗 120% 精神', cd: 5, type: 'cleanseHeal', mult: 1.2, target: 'team' },
      ult: { name: '生命礼赞', desc: '全队治疗 300% 精神并附加持续恢复 2 回合', type: 'heal', mult: 3.0, status: { id: 'regen', turns: 2 }, target: 'team' },
      passive: { name: '仁心', desc: '治疗效果 +20%' },
    },
    controller: {
      s1: { name: '精神锁链', desc: '造成 130% 伤害并 40% 概率眩晕 1 回合', cd: 3, type: 'dmg', mult: 1.3, status: { id: 'stun', turns: 1, chance: 0.4 }, target: 'enemy' },
      s2: { name: '恐惧低语', desc: '敌方全体攻击 -20%，持续 2 回合', cd: 5, type: 'debuff', buff: { atkPct: -0.2, turns: 2 }, target: 'allEnemies' },
      ult: { name: '思维禁锢', desc: '对单体造成 300% 伤害并眩晕 1 回合', type: 'dmg', mult: 3.0, status: { id: 'stun', turns: 1 }, target: 'enemy' },
      passive: { name: '精神场', desc: '敌方全体速度 -5%' },
    },
    assassin: {
      s1: { name: '背刺', desc: '造成 200% 伤害，对生命低于 50% 的目标 +50%', cd: 3, type: 'dmg', mult: 2.0, execute: true, target: 'enemy' },
      s2: { name: '淬毒', desc: '普攻附加中毒 2 回合，持续 3 回合', cd: 5, type: 'buff', buff: { poisonOnHit: 2, turns: 3 }, target: 'self' },
      ult: { name: '影杀', desc: '对单体造成 400% 伤害并附加流血 3 回合', type: 'dmg', mult: 4.0, status: { id: 'bleed', turns: 3 }, target: 'enemy' },
      passive: { name: '致命节奏', desc: '暴击率 +10%' },
    },
    support: {
      s1: { name: '激励', desc: '攻击最高的队友攻击 +25%，持续 2 回合', cd: 3, type: 'buff', buff: { atkPct: 0.25, turns: 2 }, target: 'topAlly' },
      s2: { name: '能量灌注', desc: '为队友回复 30 点能量', cd: 5, type: 'energy', mult: 30, target: 'topAlly' },
      ult: { name: '灯阁祝福', desc: '全队攻击 +25%、防御 +25%，持续 3 回合', type: 'buff', buff: { atkPct: 0.25, defPct: 0.25, turns: 3 }, target: 'team' },
      passive: { name: '鼓舞', desc: '全队攻击 +6%' },
    },
    saber: {
      s1: { name: '御剑术', desc: '造成 170% 伤害并无视 30% 防御', cd: 3, type: 'dmg', mult: 1.7, pierce: 0.3, target: 'enemy' },
      s2: { name: '剑心', desc: '自身闪避 +20%，持续 3 回合', cd: 5, type: 'buff', buff: { evaPct: 0.20, turns: 3 }, target: 'self' },
      ult: { name: '万剑归宗', desc: '对敌方全体造成 220% 伤害', type: 'dmg', mult: 2.2, target: 'allEnemies' },
      passive: { name: '剑意', desc: '攻击 +10%' },
    },
    vampire: {
      s1: { name: '血之利爪', desc: '造成 160% 伤害并回复伤害 40% 的生命', cd: 3, type: 'dmg', mult: 1.6, lifesteal: 0.4, target: 'enemy' },
      s2: { name: '鲜血狂热', desc: '自身攻击 +20%、吸血 +15%，持续 3 回合', cd: 5, type: 'buff', buff: { atkPct: 0.2, lifesteal: 0.15, turns: 3 }, target: 'self' },
      ult: { name: '猩红盛宴', desc: '对敌方全体造成 200% 伤害并吸取伤害 30% 的生命', type: 'dmg', mult: 2.0, lifesteal: 0.3, target: 'allEnemies' },
      passive: { name: '血族本能', desc: '吸血 +10%' },
    },
  };

  // 60 名角色（前 20 名基础属性取自 V5.0 表格，其余按稀有度总属性区间 + 定位权重生成）
  const CHAR_TABLE = [
    ['C001', '林默', '先锋', '科技', '战士', 'N', 68, 58, 62, 52, 45, 40],
    ['C002', '周野', '先锋', '狼人', '坦克', 'N', 72, 65, 70, 45, 38, 35],
    ['C003', '唐宁', '策略', '魔法', '法师', 'N', 38, 42, 45, 55, 75, 70],
    ['C004', '叶青', '支援', '修真', '治疗', 'N', 42, 50, 65, 52, 58, 72],
    ['C005', '韩森', '科技', '科技', '射手', 'N', 58, 48, 50, 70, 62, 40],
    ['C006', '苏琪', '异能', '念动力', '控制', 'N', 35, 40, 48, 65, 70, 78],
    ['C007', '顾川', '先锋', '狼人', '狂战', 'R', 82, 60, 72, 60, 40, 35],
    ['C008', '沈岳', '先锋', '科技', '重装', 'R', 78, 80, 75, 38, 35, 30],
    ['C009', '白屿', '策略', '修真', '剑士', 'R', 70, 55, 60, 72, 58, 55],
    ['C010', '苏黎', '策略', '魔法', '法师', 'R', 35, 45, 48, 62, 82, 78],
    ['C011', '江寒', '异能', '念动力', '控制', 'R', 40, 45, 55, 75, 70, 85],
    ['C012', '陆沉', '科技', '科技', '射手', 'R', 65, 52, 58, 80, 68, 40],
    ['C013', '宁雪', '支援', '血族', '吸血', 'R', 60, 48, 70, 68, 55, 60],
    ['C014', '韩墨', '先锋', '狼人', '坦克', 'R', 85, 72, 80, 42, 38, 32],
    ['C015', '林晚', '支援', '魔法', '治疗', 'R', 38, 50, 72, 58, 70, 88],
    ['C016', '赵恒', '科技', '科技', '辅助', 'R', 50, 65, 62, 55, 75, 58],
    ['C017', '陈锋', '先锋', '科技', '战士', 'R', 75, 60, 65, 62, 48, 38],
    ['C018', '苏曼', '异能', '念动力', '控制', 'R', 38, 45, 52, 70, 75, 82],
    ['C019', '方哲', '策略', '修真', '法剑', 'R', 62, 52, 55, 65, 72, 68],
    ['C020', '唐岳', '先锋', '血族', '战士', 'R', 78, 58, 70, 68, 45, 55],
    ['C021', '叶沉舟', '先锋', '狼人', '狂战', 'SR'],
    ['C022', '洛辰', '先锋', '修真', '剑修', 'SR'],
    ['C023', '沈昭', '策略', '魔法', '爆发法师', 'SR'],
    ['C024', '林霜', '支援', '血族', '吸血辅助', 'SR'],
    ['C025', '顾言', '科技', '科技', '狙击', 'SR'],
    ['C026', '白璃', '异能', '念动力', '控制', 'SR'],
    ['C027', '周启', '先锋', '科技', '重装', 'SR'],
    ['C028', '宁川', '策略', '修真', '法阵', 'SR'],
    ['C029', '苏瑾', '支援', '魔法', '群体治疗', 'SR'],
    ['C030', '唐若', '异能', '念动力', '精神爆发', 'SR'],
    ['C031', '霍青', '先锋', '狼人', '反击坦克', 'SR'],
    ['C032', '江黎', '科技', '科技', '无人机', 'SR'],
    ['C033', '司空夜', '异能', '血族', '刺客', 'SR'],
    ['C034', '云深', '策略', '修真', '增益', 'SR'],
    ['C035', '白曜', '先锋', '科技', '近战输出', 'SR'],
    ['C036', '苏岚', '支援', '血族', '治疗', 'SR'],
    ['C037', '叶辰', '策略', '魔法', '火焰', 'SR'],
    ['C038', '顾宁', '异能', '念动力', '精神控制', 'SR'],
    ['C039', '沈夜', '先锋', '血族', '暗杀', 'SSR'],
    ['C040', '洛川', '先锋', '修真', '剑修', 'SSR'],
    ['C041', '顾寒', '策略', '魔法', '冰法', 'SSR'],
    ['C042', '林渊', '科技', '科技', '重火力', 'SSR'],
    ['C043', '苏月', '支援', '念动力', '全能辅助', 'SSR'],
    ['C044', '江玄', '异能', '念动力', '控场', 'SSR'],
    ['C045', '宁无尘', '策略', '修真', '法阵大师', 'SSR'],
    ['C046', '韩烬', '先锋', '狼人', '狂战', 'SSR'],
    ['C047', '白夜', '异能', '血族', '刺客', 'SSR'],
    ['C048', '唐星', '科技', '科技', '能量炮', 'SSR'],
    ['C049', '叶璃', '支援', '魔法', '圣愈', 'SSR'],
    ['C050', '顾长风', '先锋', '科技', '全能战士', 'SSR'],
    ['C051', '沈青', '策略', '魔法', '元素大师', 'SSR'],
    ['C052', '林昭', '异能', '念动力', '精神支配', 'SSR'],
    ['C053', '司夜', '异能', '血族', '终极刺客', 'UR'],
    ['C054', '洛神', '策略', '修真', '终极剑修', 'UR'],
    ['C055', '星尘', '科技', '科技', '星舰炮手', 'UR'],
    ['C056', '白昼', '支援', '魔法', '终极治疗', 'UR'],
    ['C057', '深渊', '先锋', '狼人', '终极狂战', 'UR'],
    ['C058', '零', '异能', '念动力', '终极控制', 'UR'],
    ['C059', '楚衍', '策略', '念动力', '精神支配', 'UR', 'hidden'],
    ['C060', '郑遥', '先锋', '狼人', '终极狂战', 'UR', 'hidden'],
    // ---- 第二梯队（对标 Hero 的 122 名）：到 120 名为止，稀有度按 R/SR/SSR/UR 铺开 ----
    ['C061', '骆青', '先锋', '狼人', '战士', 'R'],
    ['C062', '商羽', '策略', '修真', '剑士', 'R'],
    ['C063', '罗砚', '科技', '科技', '射手', 'R'],
    ['C064', '钟离夏', '异能', '念动力', '控制', 'R'],
    ['C065', '孟岐', '支援', '魔法', '治疗', 'R'],
    ['C066', '裴照', '先锋', '血族', '刺客', 'R'],
    ['C067', '常凛', '先锋', '科技', '重装', 'R'],
    ['C068', '费霖', '策略', '魔法', '法师', 'R'],
    ['C069', '闻笛', '异能', '念动力', '精神控制', 'R'],
    ['C070', '易川', '支援', '修真', '增益', 'R'],
    ['C071', '施白', '科技', '科技', '无人机', 'R'],
    ['C072', '邹玄', '先锋', '狼人', '反击坦克', 'R'],
    ['C073', '戚晚', '策略', '修真', '法剑', 'SR'],
    ['C074', '安岐', '先锋', '血族', '吸血', 'SR'],
    ['C075', '凌肃', '异能', '念动力', '控场', 'SR'],
    ['C076', '祁越', '科技', '科技', '狙击', 'SR'],
    ['C077', '席白露', '支援', '魔法', '群体治疗', 'SR'],
    ['C078', '严冬', '先锋', '狼人', '狂战', 'SR'],
    ['C079', '慕青梧', '策略', '魔法', '冰法', 'SR'],
    ['C080', '邵无咎', '异能', '血族', '暗杀', 'SR'],
    ['C081', '贺兰亭', '先锋', '科技', '近战输出', 'SR'],
    ['C082', '路蕤', '支援', '念动力', '全能辅助', 'SR'],
    ['C083', '封朗', '科技', '科技', '重火力', 'SR'],
    ['C084', '关风雪', '策略', '修真', '法阵', 'SR'],
    ['C085', '辛夷', '异能', '念动力', '精神爆发', 'SR'],
    ['C086', '尉迟岸', '先锋', '血族', '战士', 'SR'],
    ['C087', '卓岚', '支援', '血族', '治疗', 'SR'],
    ['C088', '郗夜白', '科技', '科技', '能量炮', 'SR'],
    ['C089', '慎行', '策略', '修真', '增益', 'SR'],
    ['C090', '席云舒', '异能', '念动力', '控制', 'SR'],
    ['C091', '楼观雪', '先锋', '修真', '剑修', 'SSR'],
    ['C092', '长孙烬', '策略', '魔法', '元素大师', 'SSR'],
    ['C093', '巫马遥', '科技', '科技', '星舰炮手', 'SSR'],
    ['C094', '公仪霜', '异能', '念动力', '精神支配', 'SSR'],
    ['C095', '独孤曜', '先锋', '血族', '终极刺客', 'SSR'],
    ['C096', '南宫霁', '支援', '魔法', '圣愈', 'SSR'],
    ['C097', '西门屠', '先锋', '狼人', '终极狂战', 'SSR'],
    ['C098', '夏侯岚', '策略', '修真', '法阵大师', 'SSR'],
    ['C099', '东方既白', '科技', '科技', '全能战士', 'SSR'],
    ['C100', '百里昭', '异能', '血族', '刺客', 'SSR'],
    ['C101', '呼延烈', '先锋', '狼人', '狂战', 'SSR'],
    ['C102', '慕容雪', '支援', '念动力', '全能辅助', 'SSR'],
    ['C103', '赫连霄', '策略', '魔法', '爆发法师', 'SSR'],
    ['C104', '宇文澈', '科技', '科技', '狙击', 'SSR'],
    ['C105', '完颜肃', '异能', '念动力', '控场', 'SSR'],
    ['C106', '拓跋雪', '先锋', '血族', '吸血', 'SSR'],
    ['C107', '令狐照', '策略', '修真', '剑修', 'SSR'],
    ['C108', '琴酒', '科技', '科技', '重火力', 'SSR'],
    ['C109', '柳生雪绪', '异能', '血族', '终极刺客', 'UR'],
    ['C110', '藤原千影', '策略', '修真', '终极剑修', 'UR'],
    ['C111', '黑田宗一', '先锋', '狼人', '终极狂战', 'UR'],
    ['C112', '苍井零', '科技', '科技', '星舰炮手', 'UR'],
    ['C113', '九条凉', '支援', '魔法', '终极治疗', 'UR'],
    ['C114', '山吹时雨', '异能', '念动力', '终极控制', 'UR'],
    ['C115', '白河愁', '先锋', '血族', '终极刺客', 'UR'],
    ['C116', '天草洋吾', '策略', '魔法', '元素大师', 'UR'],
    ['C117', '零式', '科技', '科技', '全能战士', 'UR', 'hidden'],
    ['C118', '无相', '异能', '念动力', '精神支配', 'UR', 'hidden'],
    ['C119', '终焉', '先锋', '狼人', '终极狂战', 'UR', 'hidden'],
    ['C120', '灯阁代行者', '策略', '修真', '终极剑修', 'UR', 'hidden'],
  ];
  // 六维总和区间：给了明确数值的老角色照旧（地图里直接写死），没写的按这里的区间 + 定位权重生成。
  // N/R 的区间是从老角色的实际数值反推的（N 约 325、R 约 350~380），保证新老角色强度连续。
  const RARITY_TOTAL = { N: [300, 335], R: [340, 385], SR: [330, 390], SSR: [440, 500], UR: [540, 610] };

  const characters = CHAR_TABLE.map(row => {
    const [id, name, faction, bloodline, role, rarity, hiddenOrA, b, c, d, e, f] = row;
    const kind = ROLE_KIND[role] || 'warrior';
    let attrs;
    if (typeof hiddenOrA === 'number') {
      attrs = [hiddenOrA, b, c, d, e, f];
    } else {
      const [lo, hi] = RARITY_TOTAL[rarity];
      const total = ri(lo, hi);
      const w = ROLE_WEIGHT[kind];
      const wSum = w.reduce((s, x) => s + x, 0);
      attrs = w.map(x => Math.round(total * x / wSum));
    }
    return {
      id, name, faction, bloodline, role, kind, rarity,
      hidden: hiddenOrA === 'hidden',
      attrs: { muscle: attrs[0], immune: attrs[1], cell: attrs[2], nerve: attrs[3], intelligence: attrs[4], spirit: attrs[5] },
      skills: SKILL_TPL[kind],
    };
  });
  const charById = {};
  characters.forEach(ch => { charById[ch.id] = ch; });

  /* ================= 14 个世界 ================= */
  // 敌人基准：普通怪 HP/ATK/DEF；精英 ×(2.4/1.5/1.4)；关卡倍率 1.16^(stage-1)；Hard ×1.8；Hell ×3.2
  const WORLDS = [
    { id: 'W01', name: '菌毯巢穴', theme: 'bio',    desc: 'T病毒泄露的地下研究所，感染者游荡在蜂巢深处。', hp: 900,  atk: 120, def: 70,  mechanic: '感染：敌人攻击附带中毒', boss: '菌毯母巢', bossHp: [92111, 165799, 294754],
      enemies: ['感染研究员', '裂舌兽', '猎杀体α'], elite: '变异猎杀体', unlock: null },
    { id: 'W02', name: '潜影窟', theme: 'bio',    desc: '废弃空间站被甲壳生物占据，黑暗里全是黏液与尾刺。', hp: 1100, atk: 150, def: 85,  mechanic: '突袭：敌人速度+20%；流血', boss: '潜影之后', bossHp: [112580, 202644, 360255],
      enemies: ['伏面虫', '工蜂甲虫', '战甲虫'], elite: '禁卫甲虫', unlock: 'W01' },
    { id: 'W03', name: '怨声旧宅', theme: 'ghost',  desc: '踏入这栋房子的人，都会被怨念缠上。', hp: 1250, atk: 135, def: 110, mechanic: '恐惧：降低攻击；诅咒', boss: '怨声核心', bossHp: [133049, 239488, 425756],
      enemies: ['怨念残影', '白衣怨灵', '黑猫怨灵'], elite: '阁楼厉鬼', unlock: 'W02' },
    { id: 'W04', name: '机关地宫', theme: 'mystic', desc: '黄沙之下的法老陵墓，亡灵守卫永不眠。', hp: 1500, atk: 180, def: 130, mechanic: '陷阱：随机眩晕；复活', boss: '地宫石卫', bossHp: [163752, 294754, 524008],
      enemies: '木乃伊战士|沙暴怨灵|圣甲虫群'.split('|'), elite: '祭司亡灵', unlock: 'W03' },
    { id: 'W05', name: '无归客轮', theme: 'ghost',  desc: '死亡名单上的游轮，意外接踵而至。', hp: 1750, atk: 205, def: 150, mechanic: '即死判定：低概率直接重伤', boss: '终结舵手', bossHp: [194456, 350021, 622259],
      enemies: '溺水亡魂|甲板幻影|船舱幽影'.split('|'), elite: '死亡使者', unlock: 'W04' },
    { id: 'W06', name: '轨道残骸带', theme: 'tech',   desc: '轨道战争白热化，机械军团碾压一切。', hp: 2200, atk: 260, def: 190, mechanic: '护盾：开场获得护盾；远程炮击', boss: '轨道主控', bossHp: [235394, 423710, 753261],
      enemies: '机械步兵|悬浮炮台|歼灭机甲'.split('|'), elite: '轨道毁灭者', unlock: 'W05' },
    { id: 'W07', name: '酣眠迷境', theme: 'ghost',  desc: '在梦里被杀死，现实中也会死去。', hp: 2500, atk: 240, def: 220, mechanic: '睡眠：概率无法行动；幻觉', boss: '酣眠之主', bossHp: [286567, 515820, 917014],
      enemies: '梦境傀儡|锈爪梦魔|呓语幽灵'.split('|'), elite: '噩梦编织者', unlock: 'W06' },
    { id: 'W08', name: '哑雾小镇', theme: 'ghost',  desc: '浓雾中的小镇，雾界随时降临。', hp: 2900, atk: 280, def: 250, mechanic: '浓雾：命中-15%', boss: '雾猎者', bossHp: [347974, 626353, 1113517],
      enemies: '雾中人影|钩索巨影|白面护工'.split('|'), elite: '雾界行刑者', unlock: 'W07' },
    { id: 'W09', name: '巨兽孤屿', theme: 'bio',  desc: '被唤醒的史前霸主，视人类为猎物。', hp: 3400, atk: 320, def: 270, mechanic: '撕裂：流血；群体攻击', boss: '暴君巨兽', bossHp: [419616, 755308, 1342770],
      enemies: '迅猛龙|双脊龙|翼龙'.split('|'), elite: '棘背龙', unlock: 'W08' },
    { id: 'W10', name: '毒沼深处', theme: 'bio',    desc: '沼泽深处的巨蟒已变异成灾厄。', hp: 3800, atk: 350, def: 300, mechanic: '中毒：持续掉血；缠绕', boss: '毒沼巨口', bossHp: [501492, 902685, 1604774],
      enemies: '毒沼蟒|沼泽鳄|吸血水蛭'.split('|'), elite: '变异森蚺', unlock: 'W09' },
    { id: 'W11', name: '骷帆船坞', theme: 'mystic', desc: '月光下的诅咒船员，永远无法安息。', hp: 4300, atk: 390, def: 330, mechanic: '召唤亡灵；吸血', boss: '骷帆船长', bossHp: [603837, 1086907, 1932279],
      enemies: '骷髅水手|诅咒炮手|腐尸船员'.split('|'), elite: '骷帆大副', unlock: 'W10' },
    { id: 'W12', name: '蚀环远征', theme: 'mystic', desc: '魔多大军压境，黑暗侵蚀中土。', hp: 5000, atk: 450, def: 380, mechanic: '腐化：降低防御；群体增益', boss: '蚀冠之王', bossHp: [742003, 1335606, 2374411],
      enemies: '蛮荒兵|巨狼骑士|蚀环侍从'.split('|'), elite: '蚀环幽灵', unlock: 'W11' },
    { id: 'W13', name: '寒冠王座', theme: 'mystic', desc: '白女巫的冰封王座，永冬笼罩王国。', hp: 5800, atk: 510, def: 430, mechanic: '冰冻：无法行动；王权强化', boss: '寒冠女王', bossHp: [910873, 1639572, 2914794],
      enemies: '冰狼|雪魔|霜冻武士'.split('|'), elite: '冰宫禁卫', unlock: 'W12' },
    { id: 'W14', name: '灯阁试炼场', theme: 'god', desc: '灯阁亲自设下的试炼，规则由它书写。', hp: 7000, atk: 600, def: 500, mechanic: '随机规则：每回合变化', boss: '试炼执刑者', bossHp: [1125798, 2026437, 3602554],
      enemies: '试炼傀儡|规则执行体|灯阁幻影'.split('|'), elite: '灯阁代行者', unlock: 'W13' },
    { id: 'W15', name: '血月旧堡', theme: 'ghost', desc: '每逢血月，古堡的宴会就会重新开始。', hp: 8500, atk: 680, def: 570, mechanic: '吸血：敌人攻击回复自身；血月强化', boss: '血月侯爵', bossHp: [1350958, 2431724, 4323065],
      enemies: '血仆|蝙蝠群|猎魔人残影'.split('|'), elite: '古堡管家', unlock: 'W14' },
    { id: 'W16', name: '沉海废墟', theme: 'bio', desc: '海底沉睡着不该被唤醒的东西。', hp: 10200, atk: 770, def: 650, mechanic: '水压：每回合全队掉血；触手缠绕', boss: '沉海之主', bossHp: [1621150, 2918069, 5187678],
      enemies: '深渊潜者|巨型章鱼|珊瑚傀儡'.split('|'), elite: '遗迹祭司', unlock: 'W15' },
    { id: 'W17', name: '蜂群主控', theme: 'tech', desc: '所有联网的东西，现在只听它一个。', hp: 12200, atk: 870, def: 740, mechanic: '无人机群：群体攻击；电磁干扰', boss: '蜂群主脑', bossHp: [1945380, 3501683, 6225214],
      enemies: '哨戒机兵|电磁猎犬|数据幽灵'.split('|'), elite: '核心守卫', unlock: 'W16' },
    { id: 'W18', name: '白墙疗养院', theme: 'ghost', desc: '这间医院的病历上，写满了你的名字。', hp: 14600, atk: 980, def: 840, mechanic: '幻觉：概率攻击队友；死亡复活', boss: '白衣院长', bossHp: [2334456, 4202019, 7470257],
      enemies: '无影护士|手术怨灵|病房幻影'.split('|'), elite: '重症监护者', unlock: 'W17' },
    { id: 'W19', name: '星骸坟场', theme: 'tech', desc: '无数文明在这里终结，残骸还在呼吸。', hp: 17500, atk: 1110, def: 960, mechanic: '星骸护盾；轨道扫射', boss: '星骸巨兽', bossHp: [2801347, 5042423, 8964308],
      enemies: '星舰残魂|虚空掠夺者|机械残骸'.split('|'), elite: '坟场拾荒者', unlock: 'W18' },
    { id: 'W20', name: '灯阁王座', theme: 'god', desc: '走到这里的人，才有资格问一句为什么。', hp: 21000, atk: 1250, def: 1090, mechanic: '规则改写：每 3 回合变换；全场压制', boss: '终焉·灯主', bossHp: [3361616, 6050908, 10757170],
      enemies: '王座侍者|终焉使者|另一个你'.split('|'), elite: '王座禁卫', unlock: 'W19' },
  ];
  const DIFFICULTY = [
    { id: 'normal', name: '普通', mult: 1.0, rewardMult: 1.0 },
    { id: 'hard',   name: '困难', mult: 1.8, rewardMult: 1.6 },
    { id: 'hell',   name: '地狱', mult: 3.2, rewardMult: 2.5 },
  ];
  const FIRST_CLEAR = { // 世界首通奖励
    normal: { holy: 100, story: 500, otherworld: 200, skillChip: 100 },
    hard:   { holy: 150, story: 800, otherworld: 400, skillChip: 200 },
    hell:   { holy: 250, story: 1200, otherworld: 800, skillChip: 400 },
  };

  /* ================= 装备 ================= */
  const EQUIP_SLOTS = { weapon: '武器', armor: '胸甲', accessory: '饰品', head: '头部', hands: '手部', legs: '腿部' };
  // 招募角色 6 槽（2026-09-12 修正）：世界套装是 2/4/6 件三档，掉落池也是 6 个部位——
  // 旧版招募角色只有 3 槽，导致 4 件/6 件套装效果永远无法触发，且一半掉落（头/手/腿）没人能穿。
  const RECRUIT_SLOTS = ['weapon', 'head', 'armor', 'hands', 'legs', 'accessory'];
  const PLAYER_SLOTS = ['weapon', 'head', 'armor', 'hands', 'legs', 'accessory']; // 主角 6 槽（V5 §22）
  const DROP_SLOTS = ['weapon', 'armor', 'accessory', 'head', 'hands', 'legs'];
  const EQUIP_RARITY_MULT = { N: 1.00, R: 1.15, SR: 1.35, SSR: 1.65, UR: 2.00 };
  const EQUIP_AFFIX_COUNT = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
  const DECOMPOSE_GAIN = { N: 5, R: 15, SR: 50, SSR: 180, UR: 600 };
  const ENHANCE_RATE = [1, 1, 1, 1, 1, 1, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.25]; // +0→+1…+19→+20
  // 世界套装：2 件 / 3 件加成
  const SETS = {};
  WORLDS.forEach((w, i) => {
    SETS[w.id] = {
      name: w.name + '套装',
      b2: i % 2 === 0 ? { hpPct: 0.08 } : { atkPct: 0.08 },
      b4: i % 2 === 0 ? { resPct: 0.15 } : { skillPct: 0.15 },
      b6: i % 2 === 0 ? { atkPct: 0.20, hpPct: 0.20 } : { atkPct: 0.20, defPct: 0.20 },
      text: i % 2 === 0 ? '2件:生命+8%　4件:异常抗性+15%　6件:攻击+20%·生命+20%' : '2件:攻击+8%　4件:技能伤害+15%　6件:攻击+20%·防御+20%',
    };
  });

  /* ================= 职业套装（2/3 件，需定位匹配） ================= */
  const KIND_NAMES = { warrior: '战士', tank: '坦克', mage: '法师', ranger: '射手', assassin: '刺客', support: '辅助', healer: '治疗', controller: '控制', vampire: '血族' };
  const CLASS_SETS = {
    warrior:    { name: '狂战套装', b2: { atkPct: 0.08 }, b3: { atkPct: 0.12, critPct: 0.05 }, text: '2件:攻击+8%　3件:攻击+12%·暴击+5%' },
    tank:       { name: '守护套装', b2: { hpPct: 0.08 }, b3: { defPct: 0.15 }, text: '2件:生命+8%　3件:防御+15%' },
    mage:       { name: '元素套装', b2: { skillPct: 0.08 }, b3: { skillPct: 0.15 }, text: '2件:技能伤害+8%　3件:技能伤害+15%' },
    ranger:     { name: '疾风套装', b2: { spdPct: 0.08 }, b3: { critPct: 0.08 }, text: '2件:速度+8%　3件:暴击+8%' },
    assassin:   { name: '影袭套装', b2: { critPct: 0.06 }, b3: { critDmg: 0.25 }, text: '2件:暴击+6%　3件:暴击伤害+25%' },
    support:    { name: '鼓舞套装', b2: { hpPct: 0.06 }, b3: { skillPct: 0.10 }, text: '2件:生命+6%　3件:技能伤害+10%' },
    healer:     { name: '圣愈套装', b2: { hpPct: 0.06 }, b3: { spiritPct: 0.15 }, text: '2件:生命+6%　3件:精神+15%' },
    controller: { name: '咒缚套装', b2: { spdPct: 0.06 }, b3: { skillPct: 0.12 }, text: '2件:速度+6%　3件:技能伤害+12%' },
    vampire:    { name: '猩红套装', b2: { lifesteal: 0.05 }, b3: { atkPct: 0.10 }, text: '2件:吸血+5%　3件:攻击+10%' },
  };

  /* ================= SSR 伙伴专属装备（UR，绑定角色） ================= */
  const SIGNATURE_EQUIPS = [
    { charId: 'C039', name: '猩红獠牙', slot: 'weapon', base: { atk: 320 }, affixes: [{ k: 'atkPct', v: 0.18 }, { k: 'lifesteal', v: 0.08 }], text: '沈夜专属：暗杀者的血之利刃' },
    { charId: 'C040', name: '青萍古剑', slot: 'weapon', base: { atk: 320 }, affixes: [{ k: 'atkPct', v: 0.18 }, { k: 'skillPct', v: 0.12 }], text: '洛川专属：剑修本命飞剑' },
    { charId: 'C041', name: '霜寒法杖', slot: 'weapon', base: { atk: 320 }, affixes: [{ k: 'skillPct', v: 0.22 }, { k: 'critPct', v: 0.05 }], text: '顾寒专属：极寒魔力凝聚' },
    { charId: 'C042', name: '毁灭者重炮', slot: 'weapon', base: { atk: 340 }, affixes: [{ k: 'atkPct', v: 0.22 }, { k: 'critDmg', v: 0.20 }], text: '林渊专属：重火力压制' },
    { charId: 'C046', name: '嗜血战斧', slot: 'weapon', base: { atk: 330 }, affixes: [{ k: 'atkPct', v: 0.20 }, { k: 'hpPct', v: 0.12 }], text: '韩烬专属：狂战不熄' },
    { charId: 'C047', name: '虚空刺匕', slot: 'weapon', base: { atk: 330 }, affixes: [{ k: 'critPct', v: 0.08 }, { k: 'critDmg', v: 0.28 }], text: '白夜专属：一击致命' },
  ];
  const EQUIP_NAMES = {
    weapon:   { bio: ['聚合物军刀', '脉冲步枪', '血脉切割者'], ghost: ['镇魂铃', '驱邪短刃', '缚灵符剑'], mystic: ['秘银法杖', '圣光权杖', '咒纹长剑'], tech: ['磁轨枪', '粒子刀', '湮灭炮'], god: ['灯阁之刃', '终焉权杖', '试炼圣枪'] },
    armor:    { bio: ['防化作战服', '蜂巢护甲', '再生殖装'], ghost: ['符咒道袍', '怨念披风', '镇宅法衣'], mystic: ['秘陵铠甲', '圣甲护胸', '咒缚长袍'], tech: ['纳米装甲', '反应外骨骼', '相位护盾'], god: ['灯阁战甲', '终焉之袍', '试炼圣铠'] },
    accessory:{ bio: ['血清注射器', '病毒样本', '血脉稳定环'], ghost: ['护身佛珠', '盐晶挂坠', '往生铜钱'], mystic: ['圣甲虫护符', '太阳金环', '安卡十字'], tech: ['战术目镜', '神经增幅器', '能量核心'], god: ['终焉徽记', '灯阁腕表', '试炼徽章'] },
    head:     { bio: ['防毒面具', '战术头盔', '密封护目镜'], ghost: ['镇魂冠', '驱邪头巾', '符纸额带'], mystic: ['秘银头环', '圣光头盔', '咒纹面甲'], tech: ['战术头盔', '全息面罩', '神经头环'], god: ['灯阁之冕', '终焉头盔', '试炼面甲'] },
    hands:    { bio: ['防化手套', '战术手套', '血脉臂铠'], ghost: ['缚灵手套', '符咒护腕', '镇魂臂甲'], mystic: ['秘银护手', '圣光手套', '咒纹臂环'], tech: ['磁力手套', '粒子臂铠', '能量护腕'], god: ['灯阁护手', '终焉臂铠', '试炼手套'] },
    legs:     { bio: ['防化护腿', '战术军靴', '聚合物腿甲'], ghost: ['疾行符靴', '镇魂护腿', '怨灵绑腿'], mystic: ['秘银护腿', '圣光战靴', '咒纹腿甲'], tech: ['磁力战靴', '喷射腿甲', '幻影护腿'], god: ['灯阁战靴', '终焉护腿', '试炼腿甲'] },
  };
  const AFFIX_POOL = {
    atkPct: { name: '攻击力', min: 0.02, max: 0.22, pct: true },
    critPct: { name: '暴击率', min: 0.01, max: 0.07, pct: true },
    critDmg: { name: '暴击伤害', min: 0.03, max: 0.28, pct: true },
    skillPct: { name: '技能伤害', min: 0.02, max: 0.22, pct: true },
    hpPct: { name: '生命', min: 0.03, max: 0.28, pct: true },
    defPct: { name: '防御', min: 0.02, max: 0.22, pct: true },
    resPct: { name: '异常抗性', min: 0.02, max: 0.16, pct: true },
    evaPct: { name: '闪避', min: 0.01, max: 0.07, pct: true },
  };
  const AFFIX_BY_RARITY = { N: 0.25, R: 0.4, SR: 0.6, SSR: 0.8, UR: 1.0 }; // 词条取值位置（区间内）

  // 装备实例生成：worldTier 1-14，rarity 指定，slot 指定
  // opts: { setType: 'plain'|'world'|'class', classKind }
  function makeEquip(worldId, slot, rarity, uid, opts) {
    opts = opts || {};
    const w = WORLDS.find(x => x.id === worldId) || WORLDS[0];
    const tier = WORLDS.indexOf(w) + 1;
    const mult = EQUIP_RARITY_MULT[rarity];
    const setType = opts.setType || (rarity === 'N' || rarity === 'R' ? 'plain' : 'world');
    let name;
    const names = EQUIP_NAMES[slot][w.theme];
    if (setType === 'class') name = KIND_NAMES[opts.classKind] + '·' + names[Math.floor(Math.random() * names.length)];
    else name = names[Math.floor(Math.random() * names.length)];
    const base = {};
    if (slot === 'weapon') base.atk = Math.round((22 + tier * 20) * mult);
    if (slot === 'armor') { base.def = Math.round((14 + tier * 13) * mult); base.hp = Math.round((220 + tier * 200) * mult); }
    if (slot === 'accessory') { base.spd = Math.round((8 + tier * 6) * mult); base.critPct = +(0.02 * mult).toFixed(3); }
    if (slot === 'head') { base.def = Math.round((8 + tier * 8) * mult); base.hp = Math.round((120 + tier * 110) * mult); }
    if (slot === 'hands') { base.atk = Math.round((10 + tier * 9) * mult); base.critPct = +(0.01 * mult).toFixed(3); }
    if (slot === 'legs') { base.spd = Math.round((6 + tier * 5) * mult); base.def = Math.round((6 + tier * 5) * mult); }
    const affixes = [];
    const keys = Object.keys(AFFIX_POOL);
    const n = EQUIP_AFFIX_COUNT[rarity];
    for (let i = 0; i < n; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      if (affixes.find(a => a.k === k)) continue;
      const pool = AFFIX_POOL[k];
      const pos = AFFIX_BY_RARITY[rarity] * (0.7 + Math.random() * 0.3);
      affixes.push({ k, v: +(pool.min + (pool.max - pool.min) * pos).toFixed(3) });
    }
    return {
      uid, name, slot, rarity, enhance: 0, base, affixes,
      set: setType === 'world' ? worldId : null,
      classSet: setType === 'class' ? opts.classKind : null,
    };
  }

  // SSR 专属装备实例
  function makeSignatureEquip(sigId, uid) {
    const sig = SIGNATURE_EQUIPS[sigId];
    if (!sig) return null;
    return { uid, name: sig.name, slot: sig.slot, rarity: 'UR', enhance: 0, base: Object.assign({}, sig.base), affixes: sig.affixes.map(a => Object.assign({}, a)), set: null, classSet: null, charId: sig.charId, sigText: sig.text };
  }

  /* ================= 道具 ================= */
  // where：使用场景（explore=副本探索中 / character=对招募角色 / anywhere=任意）
  // effect：消耗品在副本探索中的效果（healPct 全队回血 / atkPct 攻击 / spdPct 速度 / defPct 防御）
  // src：主要获取途径（背包详情卡直接展示，回答"这东西去哪弄"）
  const ITEMS = {
    /* ---- 招募券（对标《道友修仙》的"基础招徒卷 / 高级招徒卷"）----
       它的招募不是直接花货币，而是花"券"；券可以从商店买、也能从玩法里掉。
       好处是"打副本 → 掉券 → 去抽"自己成了一条循环，不用先攒够一大笔货币才敢点招募。
       我们三个池子各配一张券，抽的时候「有券先用券，没券才花货币」，规则只有这一条。 */
    ticket_normal: { name: '引灯招募券', type: 'ticket', where: 'recruit', pool: 'normal', use: '在「招募伙伴」点普通池招募时自动先用它', desc: '普通招募 1 次（没券时会自动改花 ◈点数）', src: '副本战斗、扫荡、挂机、每日任务' },
    ticket_adv:    { name: '圣契招募令', type: 'ticket', where: 'recruit', pool: 'advanced', use: '在「招募伙伴」点高级池招募时自动先用它', desc: '高级招募 1 次（没券时会自动改花 ✦圣洁晶石）', src: '精英/Boss 掉落、限时悬赏、每周任务、兑换大厅' },
    ticket_lim:    { name: '异界征召令', type: 'ticket', where: 'recruit', pool: 'limited', use: '在「招募伙伴」点限定池招募时自动先用它', desc: '限定招募 1 次（没券时会自动改花 ◆异界结晶）', src: '深井、地狱难度、周常全清、异界商店' },
    heal_s: { name: '小型治疗剂', type: 'consumable', where: 'explore', effect: { healPct: 0.2 }, use: '副本探索中，点探索界面的药剂按钮，全队回血', desc: '副本探索中使用：全队回复 20% 生命', src: '灯阁市集、副本战斗掉落' },
    heal_m: { name: '中型治疗剂', type: 'consumable', where: 'explore', effect: { healPct: 0.4 }, use: '副本探索中，点探索界面的药剂按钮，全队回血', desc: '副本探索中使用：全队回复 40% 生命', src: '灯阁市集、副本战斗掉落' },
    heal_l: { name: '大型治疗剂', type: 'consumable', where: 'explore', effect: { healPct: 0.7 }, use: '副本探索中，点探索界面的药剂按钮，全队回血', desc: '副本探索中使用：全队回复 70% 生命', src: '副本战斗掉落（第 5 关起）、周常奖励' },
    buff_muscle: { name: '肌肉强化剂', type: 'consumable', where: 'explore', effect: { atkPct: 0.15 }, use: '副本探索中，点探索界面的增益按钮，本次探索全队攻击 +15%', desc: '副本探索中使用：本次探索全队攻击 +15%', src: '灯阁市集、精英/Boss 掉落' },
    buff_nerve: { name: '神经刺激剂', type: 'consumable', where: 'explore', effect: { spdPct: 0.20 }, use: '副本探索中，点探索界面的增益按钮，本次探索全队速度 +20%', desc: '副本探索中使用：本次探索全队速度 +20%', src: '灯阁市集、精英/Boss 掉落' },
    exp_s: { name: '初级经验模块', type: 'exp', where: 'character', exp: 500, use: '背包里点这张道具卡，选一名伙伴使用', desc: '对伙伴使用：+500 EXP', src: '灯阁市集、副本战斗掉落、每日任务' },
    exp_m: { name: '中级经验模块', type: 'exp', where: 'character', exp: 2000, use: '背包里点这张道具卡，选一名伙伴使用', desc: '对伙伴使用：+2,000 EXP', src: '灯阁市集、副本战斗掉落、每日/周常奖励' },
    exp_l: { name: '高级经验模块', type: 'exp', where: 'character', exp: 10000, use: '背包里点这张道具卡，选一名伙伴使用', desc: '对伙伴使用：+10,000 EXP', src: '灯阁市集（通关 W04 后解锁）、精英/Boss 掉落、周常奖励' },
    exp_xl: { name: '超级经验模块', type: 'exp', where: 'character', exp: 50000, use: '背包里点这张道具卡，选一名伙伴使用', desc: '对伙伴使用：+50,000 EXP', src: '灯阁市集（通关 W07 后解锁）、地狱 Boss 掉落、周常全清奖励' },
    exp_xxl: { name: '究极经验模块', type: 'exp', where: 'character', exp: 200000, use: '背包里点这张道具卡，选一名伙伴使用', desc: '对伙伴使用：+200,000 EXP', src: '灯阁市集（通关 W15 后解锁）、W15+ 守关 Boss、周常全清、斗法台高阶' },
    /* 探索增益的"后三档"：治疗剂管回血，这三支管打出去（对标别人的"丹药"矩阵）。
       品质越高给得越多，但都只在一次探索里生效，不改变长期数值。 */
    heal_x: { name: '全效治疗剂', type: 'consumable', where: 'explore', effect: { healPct: 1.0 }, use: '副本探索中，点探索界面的药剂按钮，全队回血', desc: '副本探索中使用：全队完全恢复生命', src: '灯阁市集、W10+ 守关 Boss、斗法台、深井商店' },
    def_shield: { name: '合金护盾剂', type: 'consumable', where: 'explore', effect: { defPct: 0.20 }, use: '副本探索中，点探索界面的增益按钮，本次探索全队防御 +20%', desc: '副本探索中使用：本次探索全队防御 +20%', src: '灯阁市集、精英/Boss 掉落' },
    atk_surge: { name: '狂暴催化剂', type: 'consumable', where: 'explore', effect: { atkPct: 0.30 }, use: '副本探索中，点探索界面的增益按钮，本次探索全队攻击 +30%', desc: '副本探索中使用：本次探索全队攻击 +30%', src: '灯阁市集（通关 W06）、W06+ 精英/Boss' },
    spd_surge: { name: '超频注射剂', type: 'consumable', where: 'explore', effect: { spdPct: 0.35 }, use: '副本探索中，点探索界面的增益按钮，本次探索全队速度 +35%', desc: '副本探索中使用：本次探索全队速度 +35%', src: '异界商店（通关 W08）、W08+ 精英/Boss' },
    mat_t1: { name: '基础金属', type: 'material', tier: 1, use: '装备强化时自动优先消耗；不够时用点数代用', desc: '强化材料：装备 +0~+4 时消耗（不足可用点数代用）', src: 'W01~W05 精英/Boss、灯阁市集、故事商店' },
    mat_t2: { name: '强化合金', type: 'material', tier: 2, use: '装备强化时自动优先消耗；不够时用点数代用', desc: '强化材料：装备 +5~+9 时消耗（不足可用点数代用）', src: 'W02~W06 精英/Boss、异界商店' },
    mat_t3: { name: '异界合金', type: 'material', tier: 3, use: '装备强化时自动优先消耗；不够时用点数代用', desc: '强化材料：装备 +10~+14 时消耗（不足可用点数代用）', src: 'W03~W07 精英/Boss、异界商店' },
    mat_t4: { name: '虚空晶体', type: 'material', tier: 4, use: '装备强化时自动优先消耗；不够时用点数代用', desc: '强化材料：装备 +15~+19 时消耗（不足可用点数代用）', src: 'W04 起精英/Boss、异界商店（通关 W04 解锁）' },
    mat_t5: { name: '灯阁残片', type: 'material', tier: 5, use: '装备强化时自动优先消耗；不够时用点数代用', desc: '强化材料：冲击 +20 时消耗（不足可用点数代用）', src: 'W05 起精英/Boss、异界商店（通关 W06 解锁）' },
    box_r: { name: 'R装备箱', type: 'box', rarity: 'R', use: '背包里点这张道具卡即可开启，支持批量开箱', desc: '开出一件 R 品质装备', src: '灯阁市集、游历奇遇' },
    box_sr: { name: 'SR装备箱', type: 'box', rarity: 'SR', use: '背包里点这张道具卡即可开启，支持批量开箱', desc: '开出一件 SR 品质装备', src: '兑换大厅各店、每日任务、游历奇遇、药园' },
    box_ssr: { name: 'SSR装备箱', type: 'box', rarity: 'SSR', use: '背包里点这张道具卡即可开启，支持批量开箱', desc: '开出一件 SSR 品质装备', src: '异界/深井商店、七日登录第 6 天' },
    box_ur: { name: 'UR装备箱', type: 'box', rarity: 'UR', use: '背包里点这张道具卡即可开启，支持批量开箱', desc: '开出一件 UR 品质装备；10% 概率开出 SSR 专属装备', src: '异界/深井商店（高阶货币）' },
    beast_egg: { name: '兽魂石', type: 'material', tier: 1, use: '在灯阁「🐾 伴生体」里孵化：10 颗孵 1 只', desc: '伴生体孵化材料：10 颗可以在兽栏孵化 1 只伴生体', src: '副本 Boss（必掉）、精英（概率）、灯阁市集、限时悬赏' },
  };
  // 强化等级 → 材料 tier（+0~4:T1，+5~9:T2，+10~14:T3，+15~19:T4，+19→20:T5）
  const enhanceMatTier = lv => Math.min(5, Math.floor(lv / 4) + 1);
  // 材料不足时的点数代用价（每件）
  const MAT_SUBSTITUTE_POINTS = [0, 200, 500, 1200, 3000, 8000];
  // 消耗品在探索界面里的按钮文案
  const CONSUMABLE_TAG = { healPct: '回血', atkPct: '攻击', spdPct: '速度', defPct: '防御' };

  /* ================= 血清（永久强化剂） =================
     对标同类放置修仙游戏的"丹药矩阵"：把大块成长拆成很多次小成长，
     每喂一支都能立刻看见数字变化（档案 G-13：文案与效果必须同源）。 */
  const SERUM_KEYS = { atkPct: '攻击', defPct: '防御', hpPct: '生命', spdPct: '速度', critPct: '暴击率', skillPct: '技能伤害', evaPct: '闪避' };
  const SERUMS = [
    { id: 'sr_atk',   name: '力量血清', key: 'atkPct',   per: 0.010, max: 40, mat: 'mat_t1', matN: 5, points: 300,  bloodline: null, unlock: 1 },
    { id: 'sr_def',   name: '护壁血清', key: 'defPct',   per: 0.010, max: 40, mat: 'mat_t1', matN: 5, points: 300,  bloodline: null, unlock: 1 },
    { id: 'sr_hp',    name: '细胞血清', key: 'hpPct',    per: 0.010, max: 40, mat: 'mat_t1', matN: 5, points: 300,  bloodline: null, unlock: 1 },
    { id: 'sr_spd',   name: '神经血清', key: 'spdPct',   per: 0.010, max: 30, mat: 'mat_t2', matN: 4, points: 600,  bloodline: null, unlock: 3 },
    { id: 'sr_crit',  name: '感知血清', key: 'critPct',  per: 0.005, max: 30, mat: 'mat_t2', matN: 4, points: 700,  bloodline: null, unlock: 3 },
    { id: 'sr_skill', name: '灵能血清', key: 'skillPct', per: 0.010, max: 30, mat: 'mat_t2', matN: 4, points: 700,  bloodline: null, unlock: 4 },
    // 血统专属（对标同类的"门派专属丹"）：只有对应血统能用，单次更强、上限更低
    { id: 'sr_bl_vampire',  name: '血族·饕餮血清', key: 'atkPct',   per: 0.030, max: 20, mat: 'mat_t3', matN: 3, points: 1200, bloodline: '血族',   unlock: 5 },
    { id: 'sr_bl_werewolf', name: '狼人·狂化血清', key: 'hpPct',    per: 0.030, max: 20, mat: 'mat_t3', matN: 3, points: 1200, bloodline: '狼人',   unlock: 5 },
    { id: 'sr_bl_cultivator', name: '修真·剑心血清', key: 'skillPct', per: 0.030, max: 20, mat: 'mat_t3', matN: 3, points: 1200, bloodline: '修真', unlock: 5 },
    { id: 'sr_bl_magic',    name: '魔法·秘能血清', key: 'critPct',  per: 0.015, max: 20, mat: 'mat_t3', matN: 3, points: 1200, bloodline: '魔法',   unlock: 6 },
    { id: 'sr_bl_tech',     name: '科技·超频血清', key: 'spdPct',   per: 0.030, max: 20, mat: 'mat_t4', matN: 2, points: 1800, bloodline: '科技',   unlock: 6 },
    { id: 'sr_bl_psychic',  name: '念动·超感血清', key: 'evaPct',   per: 0.030, max: 20, mat: 'mat_t4', matN: 2, points: 1800, bloodline: '念动力', unlock: 7 },
  ];
  const serumById = {};
  SERUMS.forEach(s => {
    serumById[s.id] = s;
    // 文案从数据派生：改了效果，说明自动跟着变，不会各写一份
    const tag = s.bloodline ? `【${s.bloodline}专属】` : '';
    ITEMS['serum_' + s.id] = {
      name: s.name,
      type: 'serum',
      serum: { key: s.key, per: s.per, max: s.max, bloodline: s.bloodline },
      where: 'character',
      use: `背包里点这张卡，选一名${s.bloodline ? `「${s.bloodline}」血统的` : ''}伙伴喂下；支持 1 / 10 / 全部`,
      desc: `${tag}${SERUM_KEYS[s.key] || s.key} 永久 +${(s.per * 100).toFixed(1)}%（每人最多 ${s.max} 支）`,
      src: '炼化台：用装备强化材料 + 点数炼化',
    };
  });
  const SERUM_ITEM = id => 'serum_' + id;

  /* ================= 货币图鉴 ================= */
  const CURRENCY_INFO = {
    points:       { use: '强化装备、普通招募、背包扩容、灯阁市集、建筑升级、药园播种、驯服坐骑', gain: '挂机、副本战斗、扫荡、任务、分解装备外的主要产出' },
    story:        { use: '故事商店（伙伴碎片、材料、装备箱）', gain: '挂机每30分钟、通关奖励、每日/每周任务' },
    otherworld:   { use: '装备强化、异界商店（高阶装备箱）、限定招募（定向出当期 UP）、灯阁权限投资、秘术阁、法宝、高阶坐骑', gain: '分解装备、副本战斗、扫荡、悬赏、斗法台' },
    holy:         { use: '高级招募（SR 起抽、50 抽保底 SSR、优先给还没有的伙伴）、灯阁权限投资', gain: '主线任务、通关奖励、登录奖励、限时悬赏' },
    skillChip:    { use: '伙伴技能升级', gain: '副本战斗、扫荡、灯阁市集兑换' },
    bloodCrystal: { use: '血统选择与升级（主角与伙伴）', gain: 'Boss战、困难/地狱难度、深井' },
    corridor:     { use: '深井商店（稀有道具）', gain: '深井层数奖励、斗法台守擂成功' },
    rp:           { use: '转生天赋加点（永久属性）', gain: '转生时按当时的进度结算' },
  };

  /* ================= 图鉴收集奖励 ================= */
  const CODEX_REWARDS = [
    { n: 5,  reward: { points: 5000, holy: 100 } },
    { n: 10, reward: { points: 12000, holy: 200, skillChip: 100 } },
    { n: 20, reward: { points: 30000, holy: 400, bloodCrystal: 100 } },
    { n: 30, reward: { points: 60000, holy: 800, otherworld: 300 } },
    { n: 40, reward: { points: 120000, holy: 1500, bloodCrystal: 300 } },
  ];

  /* ================= 玩法指南（设置页 ❓ 入口） ================= */
  const GUIDE_CHAPTERS = [
    { id: 'flow', title: '① 一场探索怎么打', body: [
      '主线→推荐路线：灯阁领挂机 → 残域选世界 → 选关卡 → **直接开打** → 拿奖励回灯阁。没有"先选路线"这一层。',
      '每关是 1~3 波连续战斗：1~4 关 1 波、5~8 关 2 波、9~12 关 3 波；第 4/8 关最后一波是精英，第 12 关是守关 Boss。',
      '**一口气打到底**：点关卡就开打，一波打完自动接下一波，中间不插事件、不插补给箱，也不用你按"开打第 N 波"。',
      '队伍血量在波与波之间继承，不会自动回满：波间结算页上就有血条和药剂，觉得吃紧就点一瓶。全队重伤算失败，已经拿到的奖励不会丢。',
      '打不过就不要硬上：先回灯阁领挂机收益、用经验模块喂伙伴、强化装备，再回来。',
    ] },
    { id: 'party', title: '② 队伍与站位', body: [
      '上阵一共 5 格：**前排 2 格、后排 3 格**（固定不变）。主角必上阵，他自己占其中 1 格，另外 4 格给招募到的伙伴。',
      '站位决定被打概率：**敌人优先攻击前排**，前排没人了才会打后排。所以前排适合坦度高、能扛的，后排适合脆皮输出与治疗。',
      '**谁站哪一格由你说了算**：队伍页上 **长按**任意一格把他「抓起」，**按住拖到目标格子松手就放下**——落在谁身上就和谁换，落在空格就是搬过去，同排换顺序、跨排换前后都行；直接拖到「前排 / 后排」那行字上也能整排搬人（手指不方便拖动时，抓起后点一下目标位置也一样）。抓起来之后点顶部金色提示条上的「取消」就放回去。',
      '**主角也不例外**：主角那张牌长按起来一样能拖，拖到后排（第 3~5 格）他就站后排，拖回前排（第 1~2 格）就站前排。他够肉就放前排帮队伍挡刀，带的是输出装就放后排躲伤害。',
      '阵型（对标"阵法"）：队伍页会把你现在站的阵**叫出名字**——双子阵 / 三才阵 / 四象阵 / 五行归元阵 / 双柱阵 / 四海阵，每个都写清"要几个人、加成多少"。',
      '主角不属于任何阵营，但编阵时是**万能补位**：可以顶任意一个阵营的名额，所以 4 个同阵营 + 主角就能凑成 5 人五行归元阵。',
      '「同阵营」那一族只取命中的最高档，不会 2/3/4/5 人重复叠；双柱阵（2+2）和四海阵（四个阵营各 1 人）是另外两条独立路线。',
      '克制环：先锋 → 策略 → 科技 → 异能 → 先锋，克制伤害 +15%。',
    ] },
    { id: 'equip', title: '③ 装备与强化', body: [
      '装备 6 种品质：N / R / SR / SSR / UR，品质越高基础值和词条越多。',
      '主角和每名伙伴都是 6 个槽位：武器 / 头部 / 胸甲 / 手部 / 腿部 / 饰品，六个部位都能穿。',
      '强化最高 +20，消耗对应等级的强化材料（不够时用点数代用）+ 异界结晶；强化失败不会降级。',
      '材料按强化等级分 5 档：+0~4 基础金属、+5~9 强化合金、+10~14 异界合金、+15~19 虚空晶体、+20 灯阁残片。',
      'T4/T5 材料从 W04 / W05 之后的精英和 Boss 掉；通关 W04 / W06 后商店也会上架，不用死刷。',
      '同世界套装 2 / 4 / 6 件激活额外效果（6 件效果需要全身同世界套装）；职业套装限对应定位穿戴（主角算战士）。',
      '装备都在**背包 → 装备**那一栏（道具和装备分开占格子）：重复装备可以「批量分解」换成异界结晶；不想被分解的点详情里的 🔒 锁上。',
      '懒得一件件配装？队伍页有「一键最优装备」和 3 组编队预设。',
    ] },
    { id: 'currency', title: '④ 八种货币怎么花', body: [
      '每种货币只干一件事，记不住就点顶栏那一排货币里的「▤ 全部货币」看完整图鉴（用途 + 主要来源）。',
      '最常用的三种：◈点数（强化 / 招募 / 建筑 / 商店）、✦圣洁晶石（抽卡 / 灯阁权限）、◆异界结晶（强化 / 异界商店 / 灯阁权限）。',
      '高级货币除了抽卡，还有一条长线出口——「🔑 灯阁权限」（见第 ⑪ 章）：投进去就永久生效，转生也不清空。',
    ] },
    { id: 'gene', title: '⑤ 血统与铭刻', body: [
      '伙伴的血统是固定的；主角开局就选一次血统，选完不能改——因为**境界线跟着血统走**（见第 ⑬ 章）。',
      '血统升级消耗血统结晶 + 点数，提升幅度很大，是中期主要成长线。',
      '铭刻 5 阶，靠通关进度 + 玩家等级 + 血统结晶解锁，每阶全队属性加成。',
    ] },
    { id: 'corridor', title: '⑥ 深井与转生', body: [
      '深井：层数无限递增的终局玩法，奖励深井徽记，可以在深井商店换稀有道具。',
      '深井印记：历史最高层每 10 层积 1 枚（上限 30 枚），每枚在深井内给全队 +1.5% 属性——推不动了就靠它一点点往前啃。',
      '转生：玩家 Lv.100 + 铭刻 5 阶 + 灯芯 Lv.30 后开启，重置等级与世界进度，换成永久天赋点。',
      '转生天赋是永久加成，越早开始攒越划算——但不要为了转生硬堆，先把当前进度打穿。',
      '天赋分四支：永恒之躯（生命/防御/减伤）、无限能源（精神/技能/开场能量）、超维神经（速度/暴击/先制）、灯阁恩赐（挂机/经验/掉落）。每支点满 6200 转生点，量力而行。',
    ] },
    { id: 'daily', title: '⑦ 每天必做的五件事', body: [
      '1. 先求一签（首页「养成」→「日常」→「求签」）：签文给当天的挂机加成，先求再挂最划算。',
      '2. 领挂机收益（挂满越久收益越多，离线也有）。',
      '3. 领每日免费招募（招募页第一个按钮，一天一次）。',
      '4. 做完每日任务 + 全部完成奖励（任务面板）。',
      '5. 扫荡已通关的关卡拿材料（每天 60 次）＋ 斗法台 5 次（结晶与徽记最稳的来源）。',
      '懒得一项项点？点首页最下面「挂机」那块里的「一键收取」：挂机、任务、周常、成就、图鉴里所有已经达成、躺着等点的奖励，一次全收。',
    ] },
    { id: 'recruit', title: '⑧ 三张招募池，花的是三种钱', body: [
      '普通招募（◈点数）：日常池，只出 N / R / SR，重复伙伴转碎片。花的是挂机能刷的点数，定位是攒碎片升星。',
      '高级招募（✦圣洁晶石）：主力池，SR 起抽，50 抽内必出 SSR、100 抽内必出 UR，而且优先给「你还没有的伙伴」——缺图鉴就抽它。',
      '限定招募（◆异界结晶）：定向池，本期只出「当期 UP」所属阵营的伙伴，SSR 里一半是当期 UP，50 抽内必出当期 UP。想要某个特定的人，就盯着它抽。',
      '保底三个池分开关账：高级池和限定池各自数自己的 SSR / UR / UP 次数，换池不会清零，也不会串。',
      '**招募券**：每个池配一张券（引灯招募券 / 圣契招募令 / 异界征召令），从副本掉落、悬赏、每日与每周任务、登录、商店都能拿。抽的时候**有券先用券，券不够才扣货币**；十连要么给 10 张券、要么给足货币，不混着扣。',
      '想知道每一档到底多少概率？「招募伙伴」页最下面有「📊 招募概率公示」，逐池列清每一档出率、保底抽数、还差几抽触发保底。',
      '每天有一次免费招募，出率和普通池完全一样，同样计入主线与每日任务，别忘了领。',
    ] },
    { id: 'idle', title: '⑨ 挂机分工：让板凳伙伴去干活', body: [
      '首页「挂机」那块点「派人分工」，可以给 4 条产线各派 1 名领队：闭关修炼（经验）、灵材采集（强化材料）、外围探索（点数）、灯阁守卫（异界结晶）。',
      '每条线看领队的**对应那一维**（不是战力）：闭关看精神、采集看肌肉、探索看神经、守卫看免疫，对应维值越高产出越高（最高 +150%）；不派领队这条线就不产出。',
      '上阵主力不能派去挂机——所以这里正好是"板凳伙伴"的用处，练了的人不会白练。',
      '产线收益和挂机收益一起累计，在首页「一键收取」或挂机卡的领取按钮里结算。',
    ] },
    { id: 'bounty', title: '⑩ 限时悬赏与境界', body: [
      '限时悬赏有截止时间，到点作废：达成后手动领奖，奖励是圣洁晶石 / 异界结晶 / 血统结晶这类硬通货。',
      '目标是**按你的当前进度生成的**：推进当前世界、等级再高 5 级、强化次数翻一档，剩下的位置按你缺什么（深井层数 / SSR 数量 / 伴生体 / 渡劫）补。四条全部结束后开新一期，会重新按那时的进度生成。',
      '首页「养成」段里「日常」那一组的「限时悬赏」会显示最快到期的那条还剩多久，别让它白白过期。',
      '境界（渡劫）：9 个大境界 × 初/中/后/大圆满 = **36 小阶**，从炼气初期一路到渡劫大圆满。每突破一小阶，主角全属性永久 +1.4%（36 阶合计 +50.4%）。',
      '渡劫失败只扣材料与点数，等级不掉，可以反复挑战——但失败也照扣，所以别在材料不够的时候硬渡。',
      '境界面板按"大境界一行、行内四个小阶"排列，一眼看得到自己走到哪一格、离下一格还差多少。',
    ] },
    { id: 'authority', title: '⑪ 灯阁权限：高级货币的长线出路', body: [
      '对标别人的"洞府"：花 ✦圣洁晶石 + ◆异界结晶向灯阁换**永久授权**，10 级，投入一次永久生效，转生也不清空。',
      '和「基地建设」分工不同——建筑花的是挂机就能刷的 ◈点数，逐级堆到 50 级；灯阁权限花的是稀缺的高级货币，所以给的多是"倍率"：挂机产出、挂机经验、离线上限、离线效率、每日扫荡次数。',
      '满 10 级额外给全队全属性 +5%，是这条线的收尾奖励。',
      '入口：首页「养成」那一组里的「灯阁权限」（「👥 执灯者 → 🌱 成长」子页里也有同一项）。',
    ] },
    { id: 'sect', title: '⑫ 灯阁评级 · 秘术阁 · 游历奇遇', body: [
      '这三条是照着别人的「宗门等级 / 秘术 / 游历」做的，作用各不相同：',
      '**灯阁评级**（对标宗门等级）：不用你点。打关卡首通 +12/+26/+48（普通/困难/地狱），重复刷减半，每打赢一场 +2，挂机每分钟 +1.2。升一级全队（含主角）全属性 +0.5%，永久生效、转生保留。等价于"推图顺便变强"。',
      '**秘术阁**（对标 KeJi）：12 条线，每条每级只加 0.2%~0.5%，但可以一直修到顶（合 550 级）。前 8 条加战斗（攻/生/防/速/暴击/暴伤/技能/闪避），后 4 条加挂机经济（产出/经验/掉落/离线效率）。升级只花 ◆异界结晶——这是给高级货币的第二条长线出口，抽卡之外的钱有地方放。',
      '**游历奇遇**（对标 YouLi）：挂机每累计 10 分钟，路上就会冒一次随机奇遇（在线、离线都算），共 12 种，有捡材料、遇前辈、挖矿脉、得招募令等。攒满会挂在首页「游历」那一段的进度条上，**不会过期丢东西**，回来点一下就行。',
      '入口：首页「养成」那一组里的「灯阁评级」「秘术阁」，游历奇遇在首页「游历」那一组的进度条上，点名字就是完整面板。',
    ] },
    { id: 'bloodline', title: '⑬ 血统与境界线：换了血统就换了一套境界', body: [
      '境界不是一条所有人共用的阶梯，而是**跟着血统走**：选了血族，你就是血奴→血仆→血卫→血将→血侯→血王→血皇→血帝→血祖；选了修真，才是炼气→筑基→金丹→元婴→化神→炼虚→合体→大乘→渡劫。',
      '每条血统都是 9 大境 × 4 小阶（初期 / 中期 / 后期 / 大圆满），合计 36 阶。**第 1 阶就是这条线的第 1 境·初期**，不存在"凡体"这种还没入门的占位。',
      '血统在开局就选（不可更改），所以境界线从进游戏那一刻就确定；选完之后，境界页显示的就是你这条线的全部 36 格。',
      '突破要两样东西：等级到线（每阶要求不同等级）+ 渡劫材料与点数。成功后主角全属性永久 +1.4%，满 36 阶合计 +50.4%。',
      '渡劫可能失败：失败只扣材料与点数，**等级不掉**，所以永远有下一次。',
      '入口：首页「养成」组的「血统」和「境界渡劫」，点名字就是完整面板。',
    ] },
    { id: 'beast', title: '⑫ 伴生体与五行克制', body: [
      '伴生体是第二条养成线（对标灵兽驯宠）：上阵 1 只，给**全队**加属性，主角也吃。',
      '孵化花「兽魂石」——副本 Boss 必掉 1~3 颗、精英怪 30% 掉 1 颗，灯阁市集（通关 W03）也能买。10 颗孵 1 只，稀有度 N 50% / R 30% / SR 17% / SSR 3%。',
      '重复孵到同一只 → 转成**兽魂**；兽魂用来升阶，每升一阶在基础加成上再 +15%，满级 Lv.10。',
      '**五行克制**：每个残域有自己的属性，伴生体也有属性。金克木、木克土、土克水、水克火、火克金——带对了克制的伴生体进本，全队伤害 +15%，带反了 -8%。',
      '所以打不过某个世界时，先看一眼它的属性，换一只克它的伴生体再去，比硬堆战力便宜得多。',
    ] },
    { id: 'weekly', title: '⑧ 周常与成就', body: [
      '任务面板有四个页签：主线 / 日常 / 周常 / 成就。',
      '周常每周一自然重置：战斗 100 次、通关 10 次副本、强化 20 次、招募 10 次、领挂机 7 次，全清有额外奖励（含超级经验模块）。',
      '成就是长线目标，分战斗 / 养成 / 收集 / 挑战四类，达成后手动领取奖励；其中深井层数类成就奖励深井徽记。',
    ] },
    { id: 'garden', title: '⑯ 药园 · 斗法台 · 法宝', body: [
      '这三条是照着别人的「洞府药园 / 斗法 / 法宝」补的，都不占队伍位置、不用操作，是"等着收菜"型的成长线。',
      '**药园**：4 块地，花 ◈点数种下灵田，等时间到收强化材料（上品/极品还会额外掉装备箱）。种下去就能去干别的，回来点「一键全收」一次收完——这是点数除了强化、招募之外的第三个出口，也是强化材料不用死刷副本的一条路。',
      '**斗法台**：单机没有真 PVP，所以做成"镜像擂台"——守擂者按你自己的队伍战力换算，台数越高越强。每天 5 次，赢了升一台拿 ◆异界结晶 + ♜深井徽记，输了退一台（保底第 1 台，永远不会卡死）。推图推不动的时候，这里是最稳的异界结晶来源。',
      '**法宝**：装备给的是数值，法宝给的是「效果」——吸血、开场能量、减伤、闪避这类平时很难堆的东西。花 ◆异界结晶买，主角带 1 件，买了自动戴上，随时能换、能摘。它和装备、血统、铭刻互不冲突，是主角的第四条成长线。',
      '入口：首页「养成」那一组的「药园」「斗法台」「法宝」，点名字就是完整面板。',
    ] },
    { id: 'mount', title: '⑰ 坐骑与求签', body: [
      '**坐骑**和法宝是"一硬一软"的两条主角线：法宝给效果（吸血 / 开场能量 / 减伤），坐骑给**基础数值**（攻击 / 生命 / 防御 / 速度）。',
      '坐骑有一处和法宝不一样：**它是全队加成，伙伴也吃**。所以资源紧的时候先买坐骑，收益比只加主角一人的东西更划算。',
      '驯服坐骑要 ◈点数 + 强化材料，高阶坐骑另加 ◆异界结晶——这是点数、材料、结晶三条资源同时有出口的地方，也是背包里囤的材料不会变废的原因。',
      '同时只骑 1 匹，随时能换；换一匹数字立刻变，不用重练。',
      '**求签**是每天上线第一件事：摇一签看今天的手气。签文分大吉 / 上吉 / 中吉 / 小吉 / 末吉五档，给**当天的挂机加成**（+6% ~ +30%）和一笔硬通货。',
      '签文只算当天，隔天自动失效，所以"今天上线先求一签再挂机"是最划算的顺序。摇之前面板上就写着五档各多少概率，不用猜。',
      '入口：首页「养成」组的「坐骑」、首页「养成」→「日常」组的「求签」。',
    ] },
  ];


  /* ================= 血统 / 铭刻 ================= */
  /* ================= 主角（玩家）独立成长 ================= */
  // 主角 = 玩家本人，不消耗点数升级（玩家等级即主角等级），无星级/碎片，6 装备槽，可选血统
  const PROTAGONIST = {
    id: '@player',
    baseAttrs: { muscle: 65, immune: 60, cell: 62, nerve: 58, intelligence: 50, spirit: 55 },
    kind: 'warrior',
    // 技能随铭刻强化（每阶技能效果提升）
    skills: {
      s1: { name: '求生突刺', desc: '对单体造成 180% 伤害', cd: 3, type: 'dmg', mult: 1.8, target: 'enemy' },
      s2: { name: '潜能爆发', desc: '自身攻击+30%、暴击+15%，持续 3 回合', cd: 5, type: 'buff', buff: { atkPct: 0.3, critPct: 0.15, turns: 3 }, target: 'self' },
      ult: { name: '血脉解放', desc: '对单体造成 400% 伤害并回复伤害 30% 的生命', type: 'dmg', mult: 4.0, lifesteal: 0.3, target: 'enemy' },
      passive: { name: '执灯者直觉', desc: '闪避 +5%，铭刻每阶全属性额外 +3%' },
    },
  };

  /* 血统 = 主角的修炼路线，同时也是境界线的来源。
     对标《道友修仙》：境界不是一条人人相同的公共阶梯，而是跟着你的路走——
     练剑的是炼气→筑基→金丹…，血族走的是血奴→血仆→血卫…。
     所以每条血统自带 9 个大境，每大境 4 小阶（初期/中期/后期/大圆满），合计 36 阶。
     起点不再是"凡体"：第 1 阶就是这条血统的第 1 境·初期。 */
  const BLOODLINES = {
    '血族': {
      desc: '吸血、暴击。每级：攻击+1.2%、吸血+0.4%',
      atkPct: 0.012, lifesteal: 0.004,
      realms: ['血奴', '血仆', '血卫', '血将', '血侯', '血王', '血皇', '血帝', '血祖'],
    },
    '狼人': {
      desc: '生命、近战。每级：生命+1.5%、防御+0.8%',
      hpPct: 0.015, defPct: 0.008,
      realms: ['兽崽', '幼狼', '灰狼', '铁狼', '狼将', '狼王', '月狼', '天狼', '狼神'],
    },
    '修真': {
      desc: '增益、剑术。每级：全属性+0.6%',
      allPct: 0.006,
      realms: ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'],
    },
    '魔法': {
      desc: '元素、爆发。每级：技能伤害+1.5%',
      skillPct: 0.015,
      realms: ['学徒', '施法者', '大法师', '贤者', '贤主', '奥术师', '大奥术师', '圣贤', '秘神'],
    },
    '科技': {
      desc: '远程、炮台。每级：攻击+0.9%、暴击+0.5%',
      atkPct: 0.009, critPct: 0.005,
      realms: ['改造体', '义体兵', '战术体', '装甲体', '指挥官', '歼星体', '超维体', '主脑', '神机'],
    },
    '念动力': {
      desc: '控制、精神。每级：速度+1%、精神+1%',
      spdPct: 0.01, spiritPct: 0.01,
      realms: ['感应者', '念动者', '心灵使', '精神师', '念动师', '心灵主', '虚空者', '超感者', '念神'],
    },
  };
  const BLOODLINE_MAX = 30;
  const bloodlineCost = lv => ({ bloodCrystal: 10 + lv * 5, points: 2000 * (lv + 1) });

  /* ================= 主角血统技能（觉醒后技能栏替换） ================= */
  // 结构与普通角色技能一致，战斗引擎直接可用
  const BLOODLINE_SKILLS = {
    '血族': {
      s1: { name: '猩红汲取', desc: '对单体造成 170% 伤害，并吸取伤害 25% 的生命', cd: 3, type: 'dmg', mult: 1.7, lifesteal: 0.25, target: 'enemy' },
      s2: { name: '血怒', desc: '自身攻击+25%、吸血+15%，持续 3 回合', cd: 5, type: 'buff', buff: { atkPct: 0.25, lifesteal: 0.15, turns: 3 }, target: 'self' },
      ult: { name: '永夜血宴', desc: '对敌方全体造成 260% 伤害，并吸取伤害 20% 的生命', type: 'dmg', mult: 2.6, lifesteal: 0.2, target: 'allEnemies' },
      passive: { name: '血族本能', desc: '吸血效果随血统等级提升' },
    },
    '狼人': {
      s1: { name: '裂地爪击', desc: '对单体造成 190% 伤害', cd: 3, type: 'dmg', mult: 1.9, target: 'enemy' },
      s2: { name: '兽性咆哮', desc: '自身生命上限之外的坚韧：防御+40%、攻击+15%，持续 3 回合', cd: 5, type: 'buff', buff: { defPct: 0.4, atkPct: 0.15, turns: 3 }, target: 'self' },
      ult: { name: '满月变身', desc: '对单体造成 420% 伤害，并附加流血 2 回合', type: 'dmg', mult: 4.2, status: { id: 'bleed', turns: 2 }, target: 'enemy' },
      passive: { name: '狼人韧性', desc: '生命与防御随血统等级提升' },
    },
    '修真': {
      s1: { name: '御剑术', desc: '御剑伤敌，对单体造成 180% 伤害（无视 20% 防御）', cd: 3, type: 'dmg', mult: 1.8, pierce: 0.2, target: 'enemy' },
      s2: { name: '剑心通明', desc: '自身技能伤害+30%、速度+20%，持续 3 回合', cd: 5, type: 'buff', buff: { skillPct: 0.3, spdPct: 0.2, turns: 3 }, target: 'self' },
      ult: { name: '万剑归宗', desc: '万剑齐发，对敌方全体造成 300% 伤害', type: 'dmg', mult: 3.0, target: 'allEnemies' },
      passive: { name: '剑修根基', desc: '全属性随血统等级提升' },
    },
    '魔法': {
      s1: { name: '奥术冲击', desc: '对单体造成 200% 技能伤害', cd: 3, type: 'dmg', mult: 2.0, target: 'enemy' },
      s2: { name: '元素汇聚', desc: '自身技能伤害+45%，持续 3 回合', cd: 5, type: 'buff', buff: { skillPct: 0.45, turns: 3 }, target: 'self' },
      ult: { name: '陨星坠落', desc: '召唤陨星，对敌方全体造成 340% 技能伤害', type: 'dmg', mult: 3.4, target: 'allEnemies' },
      passive: { name: '魔力源泉', desc: '技能伤害随血统等级提升' },
    },
    '科技': {
      s1: { name: '磁轨狙击', desc: '对单体造成 185% 伤害（高暴击）', cd: 3, type: 'dmg', mult: 1.85, sureCrit: false, target: 'enemy' },
      s2: { name: '过载核心', desc: '自身攻击+30%、暴击+20%，持续 3 回合', cd: 5, type: 'buff', buff: { atkPct: 0.3, critPct: 0.2, turns: 3 }, target: 'self' },
      ult: { name: '湮灭炮击', desc: '对单体造成 450% 伤害（无视 30% 防御）', type: 'dmg', mult: 4.5, pierce: 0.3, target: 'enemy' },
      passive: { name: '机械专精', desc: '攻击与暴击随血统等级提升' },
    },
    '念动力': {
      s1: { name: '精神穿刺', desc: '对单体造成 175% 伤害，30% 概率眩晕 1 回合', cd: 3, type: 'dmg', mult: 1.75, status: { id: 'stun', turns: 1, chance: 0.3 }, target: 'enemy' },
      s2: { name: '念动屏障', desc: '自身速度+25%、闪避+15%，持续 3 回合', cd: 5, type: 'buff', buff: { spdPct: 0.25, evaPct: 0.15, turns: 3 }, target: 'self' },
      ult: { name: '心灵风暴', desc: '对敌方全体造成 280% 伤害，25% 概率眩晕 1 回合', type: 'dmg', mult: 2.8, status: { id: 'stun', turns: 1, chance: 0.25 }, target: 'allEnemies' },
      passive: { name: '念动掌控', desc: '速度与精神随血统等级提升' },
    },
  };
  const GENE_LOCKS = [
    { stage: 1, name: '初醒', desc: '全队全属性+5%，挂机收益+10%', req: '通关 菌毯巢穴·普通', cost: { bloodCrystal: 100 } },
    { stage: 2, name: '强化', desc: '全队技能伤害+15%', req: '玩家Lv20 + 通关 怨声旧宅·普通', cost: { bloodCrystal: 300 } },
    { stage: 3, name: '突破', desc: '必杀技伤害+30%', req: '玩家Lv40 + 通关 轨道残骸带·普通', cost: { bloodCrystal: 800 } },
    { stage: 4, name: '超越', desc: '血统效果+50%', req: '玩家Lv60 + 通关 巨兽孤屿·普通', cost: { bloodCrystal: 2000 } },
    { stage: 5, name: '完全解锁', desc: '全属性+15%，挂机上限+12小时', req: '玩家Lv80 + 通关 蚀环远征·普通', cost: { bloodCrystal: 5000 } },
  ];

  /* ================= 建筑 ================= */
  const BUILDINGS = [
    { id: 'core',     name: '灯芯',   base: 1000, desc: '每级：挂机收益 +2%' },
    { id: 'training', name: '训练室',     base: 800,  desc: '每级：挂机经验 +3%' },
    { id: 'medical',  name: '医疗室',     base: 700,  desc: '每级：离线效率 +1%、离线上限 +12分钟' },
    { id: 'workshop', name: '装备工坊',   base: 900,  desc: '每级：装备强化费用 -1%（最多-40%）' },
    { id: 'geneLab',  name: '血统实验室', base: 1200, desc: '每级：血统升级费用 -1%（最多-40%）' },
  ];
  const buildingCost = (id, lv) => {
    const b = BUILDINGS.find(x => x.id === id);
    return Math.round(b.base * Math.pow(1.12, lv - 1));
  };

  /* ================= 宗门等级（对标《道友修仙》的 ZongMenLevel · 321 级） =================
     它的"宗门等级"不是手动点的按钮，而是**随主线 / 副本推进自动涨**的一条全局长线：
     321 级，每级都在抬全队属性。意义在于：打关卡除了掉装备之外，还有一条看得见的长线回报。
     我们照这个机制做，名字沿用我们的世界观（"灯阁评级"），机制一模一样。 */
  const SECT_MAX = 120;
  const SECT_PCT_PER_LV = 0.005;                                   // 每级：全队全属性 +0.5%
  const sectExpNeed = lv => Math.round(300 * Math.pow(1.075, lv - 1));
  const sectBonusPct = lv => Math.max(0, lv - 1) * SECT_PCT_PER_LV;
  // 评级经验来源（写在一处，UI 直接读这张表，避免"说明和实装两处写"）
  const SECT_EXP = { normal: 12, hard: 26, hell: 48, win: 2, perMin: 1.2 };

  /* ================= 秘术阁（对标《道友修仙》的 KeJi · 41 条线，每级 +0.3%） =================
     它的秘术线是"用金币 + 仙石喂出来的百分比"，每条 40~60 级，每级加得很小。
     作用有两个：① 高级货币多一条出口（不只有抽卡）；② 长线目标一眼看得到头。
     rate 就是每级加多少（0.004 = +0.4%），消耗走 KEJI_COIN 这一种货币。 */
  const KEJI_COIN = 'otherworld';
  const KEJI = [
    { id: 'gongfa', name: '攻伐诀', ico: '⚔', key: 'atkPct',   rate: 0.004, max: 60, base: 10, step: 2, info: '全队攻击' },
    { id: 'tixiu',  name: '体修术', ico: '🛡', key: 'hpPct',    rate: 0.004, max: 60, base: 10, step: 2, info: '全队生命' },
    { id: 'hufa',   name: '护法咒', ico: '🧱', key: 'defPct',   rate: 0.004, max: 60, base: 10, step: 2, info: '全队防御' },
    { id: 'shenfa', name: '身法诀', ico: '💨', key: 'spdPct',   rate: 0.003, max: 50, base: 12, step: 3, info: '全队速度' },
    { id: 'huixin', name: '会心术', ico: '🎯', key: 'critPct',  rate: 0.002, max: 50, base: 15, step: 3, info: '暴击率' },
    { id: 'zhumo',  name: '破魔经', ico: '💥', key: 'critDmg',  rate: 0.005, max: 40, base: 18, step: 4, info: '暴击伤害' },
    { id: 'lingfa', name: '灵法诀', ico: '✨', key: 'skillPct', rate: 0.003, max: 50, base: 12, step: 3, info: '技能伤害' },
    { id: 'yufeng', name: '御风术', ico: '🌀', key: 'evaPct',   rate: 0.002, max: 40, base: 16, step: 3, info: '闪避' },
    { id: 'caiqi',  name: '采气术', ico: '⛏', key: 'idlePct',  rate: 0.004, max: 40, base: 14, step: 3, info: '挂机产出' },
    { id: 'wuxing', name: '悟性诀', ico: '📘', key: 'expPct',   rate: 0.004, max: 40, base: 14, step: 3, info: '经验获取' },
    { id: 'juyun',  name: '聚运术', ico: '🍀', key: 'dropPct',  rate: 0.003, max: 30, base: 20, step: 4, info: '掉落概率' },
    { id: 'jingxin', name: '静心诀', ico: '🌙', key: 'offlinePct', rate: 0.003, max: 30, base: 20, step: 4, info: '离线效率' },
    // 补齐到 41 条（对标 KeJi 的 41 条线）：数值都很小，靠"永远还有下一级"撑长线
    { id: 'xueqi',  name: '血气诀', ico: '🩸', key: 'lifesteal', rate: 0.001, max: 40, base: 22, step: 4, info: '吸血' },
    { id: 'shouyi', name: '守御术', ico: '⛰', key: 'resPct',    rate: 0.002, max: 40, base: 22, step: 4, info: '减伤' },
    { id: 'shendu', name: '神读咒', ico: '📖', key: 'spiritPct', rate: 0.004, max: 40, base: 16, step: 3, info: '精神（技能倍率）' },
    { id: 'tiegu',  name: '铁骨功', ico: '🦴', key: 'defPct',   rate: 0.005, max: 50, base: 12, step: 3, info: '全队防御' },
    { id: 'liehuo', name: '烈火诀', ico: '🔥', key: 'atkPct',   rate: 0.005, max: 50, base: 12, step: 3, info: '全队攻击' },
    { id: 'hanshui', name: '寒水诀', ico: '❄', key: 'hpPct',    rate: 0.005, max: 50, base: 12, step: 3, info: '全队生命' },
    { id: 'leiting', name: '雷霆诀', ico: '⚡', key: 'spdPct',   rate: 0.004, max: 40, base: 15, step: 3, info: '全队速度' },
    { id: 'wuxingtu', name: '五行图', ico: '☯', key: 'skillPct', rate: 0.004, max: 40, base: 15, step: 3, info: '技能伤害' },
    { id: 'mingmu', name: '明目术', ico: '👁', key: 'critPct',  rate: 0.002, max: 40, base: 18, step: 4, info: '暴击率' },
    { id: 'lifa',   name: '力煞诀', ico: '💪', key: 'critDmg',  rate: 0.006, max: 30, base: 24, step: 5, info: '暴击伤害' },
    { id: 'lingbo', name: '凌波步', ico: '🌊', key: 'evaPct',   rate: 0.002, max: 30, base: 24, step: 5, info: '闪避' },
    { id: 'bishou', name: '闭守诀', ico: '🛡', key: 'resPct',   rate: 0.003, max: 30, base: 24, step: 5, info: '减伤' },
    { id: 'xuelian', name: '血炼术', ico: '🧪', key: 'lifesteal', rate: 0.0015, max: 30, base: 26, step: 5, info: '吸血' },
    { id: 'tianyan', name: '天眼通', ico: '🔭', key: 'critPct', rate: 0.0015, max: 30, base: 26, step: 5, info: '暴击率' },
    { id: 'dilong', name: '地龙诀', ico: '🐉', key: 'hpPct',    rate: 0.006, max: 30, base: 26, step: 5, info: '全队生命' },
    { id: 'jinzhong', name: '金钟罩', ico: '🔔', key: 'defPct', rate: 0.006, max: 30, base: 26, step: 5, info: '全队防御' },
    { id: 'kuangfeng', name: '狂风诀', ico: '🌪', key: 'spdPct', rate: 0.005, max: 30, base: 26, step: 5, info: '全队速度' },
    { id: 'chixiao', name: '赤霄剑诀', ico: '🗡', key: 'atkPct', rate: 0.007, max: 30, base: 28, step: 6, info: '全队攻击' },
    { id: 'yuling', name: '御灵诀', ico: '🎋', key: 'skillPct', rate: 0.005, max: 30, base: 28, step: 6, info: '技能伤害' },
    { id: 'qiankun', name: '乾坤袋', ico: '🎒', key: 'dropPct',  rate: 0.003, max: 25, base: 30, step: 6, info: '掉落概率' },
    { id: 'julong', name: '聚龙术', ico: '🐲', key: 'idlePct',  rate: 0.005, max: 25, base: 30, step: 6, info: '挂机产出' },
    { id: 'wudao',  name: '悟道录', ico: '🧘', key: 'expPct',   rate: 0.005, max: 25, base: 30, step: 6, info: '经验获取' },
    { id: 'xingsu', name: '星宿诀', ico: '🌟', key: 'offlinePct', rate: 0.004, max: 25, base: 32, step: 6, info: '离线效率' },
    { id: 'shenji', name: '神机术', ico: '⚙', key: 'critDmg',  rate: 0.008, max: 25, base: 32, step: 6, info: '暴击伤害' },
    { id: 'taixu',  name: '太虚经', ico: '🌌', key: 'spiritPct', rate: 0.006, max: 25, base: 34, step: 7, info: '精神（技能倍率）' },
    { id: 'jiuzhuan', name: '九转功', ico: '🔄', key: 'hpPct',  rate: 0.008, max: 25, base: 34, step: 7, info: '全队生命' },
    { id: 'pojun',  name: '破军诀', ico: '⚔', key: 'atkPct',   rate: 0.008, max: 25, base: 34, step: 7, info: '全队攻击' },
    { id: 'zhenwu', name: '真武诀', ico: '🐢', key: 'defPct',   rate: 0.008, max: 25, base: 34, step: 7, info: '全队防御' },
    { id: 'daoyin', name: '导引术', ico: '🌬', key: 'idlePct',  rate: 0.006, max: 20, base: 38, step: 8, info: '挂机产出' },
    { id: 'canghai', name: '沧海诀', ico: '🌊', key: 'resPct',  rate: 0.004, max: 20, base: 38, step: 8, info: '减伤' },
  ];
  const kejiById = id => KEJI.find(k => k.id === id) || null;
  const kejiCost = (k, lv) => k.base + k.step * lv;

  /* ================= 挂机游历奇遇（对标《道友修仙》的 YouLi · 601 条） =================
     它的挂机不是"只涨数字"：挂机过程中会随机掉出"游历事件"，点一下拿东西。
     意义是让离线收益变成"有东西可看"，而不是回家只看到一条进度条。
     我们原来只有副本探索里的随机事件，挂机这边是空的，所以补上这一池。
     effect 的键与 applyRewardObj 完全一致，不再另造一套规格。 */
  const TRAVELS = [
    { id: 'tv01', ico: '🍃', name: '灵草偶得',   w: 16, desc: '挂机路上顺手采到一株灵草。', effect: { points: 800, item: 'mat_t1' } },
    { id: 'tv02', ico: '💧', name: '灵泉洗髓',   w: 12, desc: '一口灵泉，喝下去浑身通透。', effect: { story: 20 } },
    { id: 'tv03', ico: '📜', name: '残卷觅迹',   w: 10, desc: '捡到半卷功法残篇，勉强化进了修为里。', effect: { points: 2000, skillChip: 5 } },
    { id: 'tv04', ico: '🕳', name: '秘境裂隙',   w: 8,  desc: '空间裂开一道缝，里面的东西被你捞了出来。', effect: { otherworld: 40 } },
    { id: 'tv05', ico: '🦴', name: '妖兽伏击',   w: 9,  desc: '一头低阶妖兽扑上来，被你随手拍死。', effect: { points: 1200, item: 'mat_t2' } },
    { id: 'tv06', ico: '🧙', name: '前辈指点',   w: 7,  desc: '一位路过的老修士指点了两句，胜过苦修数日。', effect: { holy: 30 } },
    { id: 'tv07', ico: '💎', name: '晶石矿脉',   w: 5,  desc: '山壁里露出半截晶石矿脉。', effect: { otherworld: 90 } },
    { id: 'tv08', ico: '📦', name: '遗落行囊',   w: 9,  desc: '不知哪位同行者丢下的行囊。', effect: { item: 'exp_s' } },
    { id: 'tv09', ico: '🔥', name: '心魔考验',   w: 6,  desc: '心魔翻涌，你稳住了道心。', effect: { points: 3000, bloodCrystal: 10 } },
    { id: 'tv10', ico: '🐣', name: '兽魂残响',   w: 5,  desc: '一声兽鸣，你从残响里凝出一枚兽魂石。', effect: { item: 'beast_egg' } },
    { id: 'tv11', ico: '🌟', name: '天降机缘',   w: 3,  desc: '天光落下来，这一趟收获格外丰厚。', effect: { points: 8000, holy: 80, otherworld: 120 } },
    { id: 'tv12', ico: '🧧', name: '同道馈赠',   w: 6,  desc: '一位同门托人捎来份礼。', effect: { item: 'ticket_adv' } },
    // 补齐到 40 种（对标 YouLi 的 601 条池子）：越靠后越稀有，权重越低
    { id: 'tv13', ico: '🌾', name: '荒田拾穗',   w: 14, desc: '路边的荒田里还留着几株能用的灵植。', effect: { points: 600, item: 'mat_t1' } },
    { id: 'tv14', ico: '🍲', name: '野灶留食',   w: 12, desc: '有人在这儿生过火，锅里的东西还热着。', effect: { points: 900 } },
    { id: 'tv15', ico: '🕯', name: '残烛照壁',   w: 10, desc: '墙上的刻痕被烛光一照，是一段吐纳口诀。', effect: { points: 1400, exp: 0 } },
    { id: 'tv16', ico: '🐍', name: '灵蛇蜕皮',   w: 9,  desc: '一条灵蛇刚蜕完皮，旧皮里还含着灵气。', effect: { item: 'mat_t2' } },
    { id: 'tv17', ico: '🌫', name: '雾中问路',   w: 9,  desc: '雾气里有人替你指了条近路。', effect: { points: 1600 } },
    { id: 'tv18', ico: '🏚', name: '废屋搜查',   w: 8,  desc: '一间塌了半边的屋子，柜子还没被人翻过。', effect: { points: 1100, item: 'exp_s' } },
    { id: 'tv19', ico: '🧭', name: '指路罗盘',   w: 7,  desc: '捡到一只还能转的罗盘，顺手记住了几条矿脉走向。', effect: { points: 2200, item: 'mat_t2' } },
    { id: 'tv20', ico: '🪨', name: '灵石碎块',   w: 7,  desc: '山体裂缝里嵌着几块灵石碎块。', effect: { otherworld: 60 } },
    { id: 'tv21', ico: '🧙‍♂️', name: '隐士论道', w: 6,  desc: '一位隐士与你论了半日道。', effect: { points: 2600, skillChip: 8 } },
    { id: 'tv22', ico: '🌸', name: '花丛小憩',   w: 6,  desc: '在花丛里睡了一觉，醒来神清气爽。', effect: { exp: 0, points: 500, holy: 15 } },
    { id: 'tv23', ico: '🗡', name: '古战场拾遗', w: 5,  desc: '古战场上还能捡到没锈透的家伙。', effect: { item: 'mat_t3' } },
    { id: 'tv24', ico: '🧊', name: '寒潭淬体',   w: 5,  desc: '跳进寒潭泡了一炷香，皮肉更结实了。', effect: { points: 3200 } },
    { id: 'tv25', ico: '📕', name: '藏经残页',   w: 4,  desc: '藏经阁流出来的一页残纸。', effect: { skillChip: 30 } },
    { id: 'tv26', ico: '💠', name: '异宝微光',   w: 4,  desc: '土里透出一点微光，挖出来是块异宝碎料。', effect: { otherworld: 140 } },
    { id: 'tv27', ico: '🕊', name: '白鹤引路',   w: 4,  desc: '一只白鹤在前面慢慢飞，把你带到了一处福地。', effect: { holy: 60, points: 2000 } },
    { id: 'tv28', ico: '⚗️', name: '遗落丹炉', w: 3,  desc: '一尊没坏的丹炉，炉底还留着丹药。', effect: { item: 'exp_m' } },
    { id: 'tv29', ico: '🎴', name: '赌坊手气',   w: 3,  desc: '路过赌坊顺手玩了一把，居然赢了。', effect: { points: 5200 } },
    { id: 'tv30', ico: '🐺', name: '狼群围猎',   w: 3,  desc: '一群野狼围上来，被你反过来打了牙祭。', effect: { item: 'beast_egg', points: 1200 } },
    { id: 'tv31', ico: '🌠', name: '流星夜观',   w: 3,  desc: '一场流星雨，你对着星光把修为理顺了。', effect: { points: 6600, holy: 40 } },
    { id: 'tv32', ico: '🏯', name: '旧宗门遗址', w: 3,  desc: '一座废弃宗门，库房里还留着东西。', effect: { item: 'box_sr', points: 2400 } },
    { id: 'tv33', ico: '🧿', name: '古镜照心',   w: 3,  desc: '古镜里照出的是另一个自己，你和他对了一招。', effect: { bloodCrystal: 30, points: 1800 } },
    { id: 'tv34', ico: '🪶', name: '仙禽遗羽',   w: 2,  desc: '一根仙禽落羽，轻得像没有重量。', effect: { otherworld: 200, holy: 50 } },
    { id: 'tv35', ico: '🗝', name: '无名钥匙',   w: 2,  desc: '一把没有锁孔的钥匙，你收进了怀里。', effect: { item: 'ticket_lim' } },
    { id: 'tv36', ico: '🎣', name: '潭底钓宝',   w: 2,  desc: '潭底钓上来一个沉甸甸的箱子。', effect: { item: 'box_ssr', points: 3000 } },
    { id: 'tv37', ico: '🏔', name: '云顶吐纳',   w: 2,  desc: '在云顶吐纳一场，灵气灌顶。', effect: { holy: 120, points: 4000 } },
    { id: 'tv38', ico: '🧬', name: '血玉现世',   w: 2,  desc: '地里渗出一块血玉，握在手里发烫。', effect: { bloodCrystal: 80 } },
    { id: 'tv39', ico: '🌕', name: '月华灌体',   w: 1,  desc: '月华落下来，把你整个人洗了一遍。', effect: { holy: 200, otherworld: 260, points: 6000 } },
    { id: 'tv40', ico: '🎇', name: '大道显化',   w: 1,  desc: '你眼前晃过一线大道，抓不住，但确实抓到了一把东西。', effect: { item: 'box_ur', holy: 300 } },
  ];
  const TRAVEL_TOTAL_W = TRAVELS.reduce((s, t) => s + t.w, 0);
  // 挂机每满这么久，攒出一次游历（秒）。攒满就停在"待触发"，不会丢。
  const TRAVEL_EVERY_SEC = 600;   // 10 分钟一次

  /* ================= 药园（对标《道友修仙》洞府里的"药园"） =================
     它的药园是"种下去、等时间、回来收"的挂机副线，产的是炼丹用料。
     我们做成 4 块地：花 ◈点数播种 → 到点成熟 → 收获得强化材料，另有几率出稀有物。
     产量按"强化时用点数替代材料"的价（MAT_SUBSTITUTE_POINTS）算，**每块地收货价值约等于投入的 1.2 倍**：
     种地若是比直接买还亏，就等于给玩家挖坑（2026-09-15 体检时发现旧产量只有投入的 1 成~5 成，已调高）。 */
  const GARDEN_PLOTS = 4;
  const GARDEN = [
    { id: 'g1', name: '下品灵田', points: 800,   sec: 600,  out: { item: 'mat_t1', n: 5 },  extra: { item: 'beast_egg', n: 1, p: 0.15 } },
    { id: 'g2', name: '中品灵田', points: 3200,  sec: 1800, out: { item: 'mat_t2', n: 8 },  extra: { item: 'beast_egg', n: 1, p: 0.25 } },
    { id: 'g3', name: '上品灵田', points: 12000, sec: 3600, out: { item: 'mat_t3', n: 12 }, extra: { item: 'box_sr', n: 1, p: 0.20 } },
    { id: 'g4', name: '极品灵田', points: 40000, sec: 7200, out: { item: 'mat_t4', n: 16 }, extra: { item: 'box_ssr', n: 1, p: 0.15 } },
  ];

  /* ================= 斗法台（对标《道友修仙》的斗法 / Arena） =================
     单机做不了真 PVP，所以做成"镜像擂台"：守擂者按你自己的队伍战力换算出来，
     层数越高越强。每天 5 次，赢了升一层并拿 ◆异界结晶 + ♜深井徽记。 */
  const ARENA_DAILY = 5;
  function arenaReward(floor) {
    const m = Math.pow(1.14, floor - 1);
    return { otherworld: Math.round(20 * m), corridor: Math.max(1, Math.round(floor * 0.6)) };
  }
  // 守擂者：用参考战力反推，保证"永远打得动、也永远有压力"
  function arenaEnemy(floor, refPower) {
    const m = Math.pow(1.16, floor - 1);
    const p = Math.max(200, refPower) * 0.10 * m;         // 单个守擂者的战力基准
    const mk = (name, k, isBoss) => ({
      name, hp: Math.round(p * 9 * k), atk: Math.round(p * 0.55 * k),
      def: Math.round(p * 0.32 * k), spd: 58 + floor * 2 + (isBoss ? 18 : 0),
      faction: null, eva: 0.04, resPct: 0, isElite: !isBoss, isBoss: !!isBoss,
    });
    const list = [mk(`守擂者 ${floor} 号`, 1.0, false)];
    if (floor >= 3) list.push(mk(`副擂 ${floor} 号`, 0.8, false));
    if (floor % 5 === 0) list[0] = mk(`擂主 · 第 ${floor} 台`, 1.9, true);
    return list;
  }

  /* ================= 法宝（对标《道友修仙》的法宝） =================
     装备是"数值"，法宝是"效果"：每件法宝给一条特殊效果（开场能量、吸血、减伤…），
     主角带上 1 件。它对应参考图角色页右侧那排按钮里的"法宝"那一栏。 */
  const FABAO = [
    { id: 'fb01', name: '噬魂珠', rarity: 'R',   cost: 800,   eff: { lifesteal: 0.04 },                     desc: '吸血 +4%' },
    { id: 'fb02', name: '疾风符', rarity: 'R',   cost: 800,   eff: { spdPct: 0.06 },                        desc: '速度 +6%' },
    { id: 'fb03', name: '玄铁盾', rarity: 'SR',  cost: 3000,  eff: { defPct: 0.10, dmgReduce: 0.03 },       desc: '防御 +10%、减伤 +3%' },
    { id: 'fb04', name: '聚灵幡', rarity: 'SR',  cost: 3000,  eff: { initEnergy: 25 },                      desc: '开场能量 +25' },
    { id: 'fb05', name: '破军戟', rarity: 'SR',  cost: 3600,  eff: { atkPct: 0.10, critDmg: 0.15 },        desc: '攻击 +10%、暴击伤害 +15%' },
    { id: 'fb06', name: '太虚镜', rarity: 'SSR', cost: 12000, eff: { evaPct: 0.08, skillPct: 0.12 },       desc: '闪避 +8%、技能伤害 +12%' },
    { id: 'fb07', name: '天罡印', rarity: 'SSR', cost: 12000, eff: { atkPct: 0.14, dmgReduce: 0.05 },      desc: '攻击 +14%、减伤 +5%' },
    { id: 'fb08', name: '终焉之盘', rarity: 'UR',  cost: 40000, eff: { atkPct: 0.10, hpPct: 0.10, defPct: 0.10, spdPct: 0.10 }, desc: '全属性 +10%（主角专属）' },
    // 补齐到 20 件：R 是随手的，SR 是中期目标，SSR/UR 是结晶的主要出口
    { id: 'fb09', name: '铜镜',   rarity: 'R',   cost: 900,   eff: { defPct: 0.05 },                  desc: '防御 +5%' },
    { id: 'fb10', name: '木傀儡', rarity: 'R',   cost: 900,   eff: { hpPct: 0.06 },                   desc: '生命 +6%' },
    { id: 'fb11', name: '铁针囊', rarity: 'R',   cost: 950,   eff: { critPct: 0.02 },                 desc: '暴击率 +2%' },
    { id: 'fb12', name: '清风扇', rarity: 'R',   cost: 1000,  eff: { skillPct: 0.05 },                desc: '技能伤害 +5%' },
    { id: 'fb13', name: '镇魂铃', rarity: 'SR',  cost: 2800,  eff: { resPct: 0.04 },                  desc: '减伤 +4%' },
    { id: 'fb14', name: '离火轮', rarity: 'SR',  cost: 3400,  eff: { atkPct: 0.08, skillPct: 0.06 }, desc: '攻击 +8%、技能伤害 +6%' },
    { id: 'fb15', name: '冰髓瓶', rarity: 'SR',  cost: 3200,  eff: { hpPct: 0.12, resPct: 0.02 },    desc: '生命 +12%、减伤 +2%' },
    { id: 'fb16', name: '风雷靴', rarity: 'SR',  cost: 3300,  eff: { spdPct: 0.10, evaPct: 0.04 },   desc: '速度 +10%、闪避 +4%' },
    { id: 'fb17', name: '血玉环', rarity: 'SSR', cost: 11000, eff: { lifesteal: 0.06, atkPct: 0.06 }, desc: '吸血 +6%、攻击 +6%' },
    { id: 'fb18', name: '九幽幡', rarity: 'SSR', cost: 13000, eff: { skillPct: 0.16, critDmg: 0.20 }, desc: '技能伤害 +16%、暴击伤害 +20%' },
    { id: 'fb19', name: '金乌羽', rarity: 'SSR', cost: 13000, eff: { critPct: 0.06, critDmg: 0.25 },  desc: '暴击率 +6%、暴击伤害 +25%' },
    { id: 'fb20', name: '混沌钟', rarity: 'UR',  cost: 48000, eff: { defPct: 0.15, resPct: 0.08, hpPct: 0.15 }, desc: '防御 +15%、减伤 +8%、生命 +15%' },
  ];
  const fabaoById = id => FABAO.find(f => f.id === id) || null;

  /* ================= 坐骑（对标《道友修仙》的坐骑） =================
     法宝给"效果"，坐骑给"基础数值"：主角骑 1 匹，永久生效、随时能换。
     对标参考图角色页右侧那排按钮里的"坐骑"那一栏。 */
  const MOUNTS = [
    { id: 'mt01', name: '铁甲蜥', rarity: 'N',  cost: { points: 8000 },                                          pct: { hpPct: 0.04 },  desc: '生命 +4%' },
    { id: 'mt02', name: '疾风狼', rarity: 'N',  cost: { points: 8000 },                                          pct: { spdPct: 0.05 }, desc: '速度 +5%' },
    { id: 'mt03', name: '玄铁犀', rarity: 'R',  cost: { points: 40000, mat: 'mat_t2', matN: 20 },                 pct: { defPct: 0.08 },  desc: '防御 +8%' },
    { id: 'mt04', name: '赤焰虎', rarity: 'R',  cost: { points: 40000, mat: 'mat_t2', matN: 20 },                 pct: { atkPct: 0.08 },  desc: '攻击 +8%' },
    { id: 'mt05', name: '幽影豹', rarity: 'SR', cost: { points: 120000, otherworld: 800, mat: 'mat_t3', matN: 15 }, pct: { spdPct: 0.10, critPct: 0.03 }, desc: '速度 +10%、暴击率 +3%' },
    { id: 'mt06', name: '雷麟兽', rarity: 'SR', cost: { points: 120000, otherworld: 800, mat: 'mat_t3', matN: 15 }, pct: { atkPct: 0.10, skillPct: 0.08 }, desc: '攻击 +10%、技能伤害 +8%' },
    { id: 'mt07', name: '太古龙鲸', rarity: 'UR', cost: { points: 300000, otherworld: 6000, mat: 'mat_t5', matN: 10 }, pct: { atkPct: 0.12, hpPct: 0.12, defPct: 0.12, spdPct: 0.12 }, desc: '全属性 +12%' },
  ];
  const mountById = id => MOUNTS.find(m => m.id === id) || null;
  const MOUNT_PCT_NAME = { atkPct: '攻击', hpPct: '生命', defPct: '防御', spdPct: '速度', critPct: '暴击率', skillPct: '技能伤害' };

  /* ================= 求签（对标《道友修仙》的求签 / SignItem） =================
     每天免费摇一次签，签文分五档（大吉→末吉），给当日的挂机加成 + 一点硬通货。
     它解决的问题是"每天上线第一件事点哪里"——先求一签，再看今天要干嘛。 */
  const SIGNS = [
    { id: 'sg1', tier: '大吉', weight: 4,   text: '紫气东来，今日诸事皆宜。',   gain: { holy: 60, otherworld: 120, bloodCrystal: 6 },  idlePct: 0.30, days: 1 },
    { id: 'sg2', tier: '上吉', weight: 10,  text: '云开见月，所行皆顺。',       gain: { holy: 40, otherworld: 80, bloodCrystal: 4 },   idlePct: 0.22, days: 1 },
    { id: 'sg3', tier: '中吉', weight: 22,  text: '平顺之日，稳中有进。',       gain: { holy: 25, otherworld: 50, bloodCrystal: 2 },   idlePct: 0.15, days: 1 },
    { id: 'sg4', tier: '小吉', weight: 30,  text: '小有收获，宜守不宜攻。',     gain: { holy: 15, otherworld: 30, bloodCrystal: 1 },   idlePct: 0.10, days: 1 },
    { id: 'sg5', tier: '末吉', weight: 34,  text: '谋事在人，今日宜稳扎稳打。', gain: { holy: 8,  otherworld: 15 },                    idlePct: 0.06, days: 1 },
  ];
  function rollSign() {
    const total = SIGNS.reduce((a, s) => a + s.weight, 0);
    let r = Math.random() * total;
    for (const s of SIGNS) { r -= s.weight; if (r <= 0) return s; }
    return SIGNS[SIGNS.length - 1];
  }

  /* ================= 灯阁权限（对标《道友修仙》的"洞府"） ================= */
  // 它的洞府是"一次性把高级货币（钻石/灵石）投进去，永久抬高挂机倍率、任务数、副本次数"，
  // 也就是说：高级货币不只有"抽卡"一个出口，还有一条"投入之后一劳永逸"的长线。
  // 我们的高级货币（✦圣洁晶石 / ◆异界结晶）原本只能抽卡和买箱子，缺的正是这条长线，所以补上。
  // 每级都是永久效果，不退款、不重置，转生也保留（它是"灯阁对自己的授权"，不是角色的属性）。
  const AUTHORITY_MAX = 10;
  const authorityCost = lv => ({
    holy: Math.round(60 * Math.pow(1.38, lv)),
    otherworld: Math.round(40 * Math.pow(1.38, lv)),
  });
  const AUTHORITY = [
    { lv: 1,  desc: '挂机产出 +6%、挂机经验 +4%' },
    { lv: 2,  desc: '离线上限 +0.6 小时' },
    { lv: 3,  desc: '每日扫荡次数 +4' },
    { lv: 4,  desc: '挂机产出再 +6%（累计 +12%）' },
    { lv: 5,  desc: '离线效率 +5%（累计 +5%）' },
    { lv: 6,  desc: '挂机经验再 +4%（累计 +8%）' },
    { lv: 7,  desc: '离线上限再 +0.6 小时（累计 +1.2h）' },
    { lv: 8,  desc: '每日扫荡再 +4（累计 +8）' },
    { lv: 9,  desc: '挂机产出再 +6%（累计 +18%）' },
    { lv: 10, desc: '全队全属性 +5%、离线效率 +5%（累计 +10%）' },
  ];
  // 权限加成（按当前等级线性累加，界面与实装共用这一份数据，避免"写了没做"）
  const AUTHORITY_PER_LV = { idlePct: 0.06, expPct: 0.04, capHours: 0.6, sweep: 4, offlinePct: 0.05, allPct: 0.05 };
  const authorityBonus = lv => {
    lv = Math.max(0, Math.min(AUTHORITY_MAX, lv | 0));
    // 1/4/9 级给挂机产出，2/7 级给离线上限，3/8 级给扫荡次数，5/10 级给离线效率，10 级额外给全属性
    const idleSteps = [1, 4, 9].filter(x => lv >= x).length;
    const capSteps = [2, 7].filter(x => lv >= x).length;
    const sweepSteps = [3, 8].filter(x => lv >= x).length;
    const offSteps = [5, 10].filter(x => lv >= x).length;
    const expSteps = [1, 6].filter(x => lv >= x).length;
    return {
      idlePct: idleSteps * AUTHORITY_PER_LV.idlePct,
      expPct: expSteps * AUTHORITY_PER_LV.expPct,
      capHours: capSteps * AUTHORITY_PER_LV.capHours,
      sweep: sweepSteps * AUTHORITY_PER_LV.sweep,
      offlinePct: offSteps * AUTHORITY_PER_LV.offlinePct,
      allPct: lv >= 10 ? AUTHORITY_PER_LV.allPct : 0,
    };
  };

  /* ================= 招募 ================= */
  // 三个池子按「花什么货币 + 出什么结构」分工，而不是同一套出率换种货币卖两遍：
  //   普通池（点数·软货币）：日常补碎片，只出 N/R/SR，重复角色转碎片
  //   高级池（圣洁晶石）：主力池，SR 起抽，保底 SSR/UR，且优先给未拥有的角色
  //   限定池（异界结晶）：定向池，本期只出指定阵营，SSR 里一半是当期 UP，50 抽必出 UP
  const RECRUIT_POOLS = {
    normal: {
      name: '普通招募', short: '普通', currency: 'points',
      rates: { N: 0.46, R: 0.36, SR: 0.18 },
      cost: { points: 5000 }, ten: { points: 45000 },
      ticket: 'ticket_normal',
      desc: '日常池：只出 N / R / SR，重复伙伴转碎片。花的是挂机能刷的点数，用来攒碎片升星。有「引灯招募券」时先扣券。',
      tag: '攒碎片',
    },
    advanced: {
      name: '高级招募', short: '高级', currency: 'holy',
      rates: { SR: 0.72, SSR: 0.25, UR: 0.03 },
      cost: { holy: 100 }, ten: { holy: 900 },
      ticket: 'ticket_adv',
      desc: '主力池：SR 起抽，50 抽内必出 SSR、100 抽内必出 UR，并且优先给「你还没有的伙伴」。有「圣契招募令」时先扣券。',
      tag: '补图鉴',
      prioritizeNew: true,
    },
    limited: {
      name: '限定招募', short: '限定', currency: 'otherworld',
      rates: { SR: 0.62, SSR: 0.33, UR: 0.05 },
      cost: { otherworld: 60 }, ten: { otherworld: 540 },
      ticket: 'ticket_lim',
      desc: '定向池：本期只出「当期 UP」所属阵营的伙伴，SSR 里一半是当期 UP，50 抽内必出当期 UP。有「异界征召令」时先扣券。',
      tag: '定向 UP',
      upRatio: 0.5,
    },
  };
  // 概率公示：直接把"每一档到底多少概率、保底怎么算"写成给人看的文字，和 rates 同源。
  // 对标《道友修仙》——它在招募界面明写「招募到 37% 血脉修士的概率为 5%，25% 血脉的概率为 15%…」。
  const pityText = pool => {
    if (pool === 'normal') return '本池没有保底：出率固定，重复伙伴转碎片，用来攒升星材料。';
    if (pool === 'advanced') return `每抽累计 1 次保底：满 ${PITY.SSR} 抽必出 SSR、满 ${PITY.UR} 抽必出 UR；出更高稀有度会同时清空对应计数。SSR / UR 优先给「你还没有的伙伴」。`;
    return `每抽累计 1 次保底：满 ${PITY.SSR} 抽必出 SSR、满 ${PITY.UR} 抽必出 UR、满 ${PITY_UP} 抽必出当期 UP。SSR 档里有 ${Math.round(RECRUIT_POOLS.limited.upRatio * 100)}% 直接是当期 UP。`;
  };
  const PITY = { SSR: 50, UR: 100 };
  const PITY_UP = 50;
  // 当期 UP：按自然周轮换，不写死角色，以后加角色自动进入轮换
  const weekIndex = ts => Math.floor((ts || Date.now()) / (7 * 86400e3));
  const recruitUpChar = (ts) => {
    const pool = characters.filter(c => c.rarity === 'SSR' && !c.hidden);
    if (!pool.length) return null;
    return pool[weekIndex(ts) % pool.length];
  };

  /* ================= 挂机分工 ================= */
  // 4 条产线，各派 1 名领队（不能用已上阵的主力），领队战力越高产出越高。
  // 目的：给"多出来的角色"一个去处，让挂机多一层"怎么排"的决定，而不只是干等。
  const IDLE_LINES = [
    { id: 'cultivate', name: '闭关修炼', ico: '🧘', out: 'exp', attr: 'spirit', attrName: '精神', desc: '产出玩家经验（每分钟）· 看领队的【精神】', maxBonus: 1.5 },
    { id: 'gather', name: '灵材采集', ico: '⛏', out: 'mat', attr: 'muscle', attrName: '肌肉', desc: '产出装备强化材料（每分钟）· 看领队的【肌肉】', maxBonus: 1.5 },
    { id: 'explore', name: '外围探索', ico: '🧭', out: 'points', attr: 'nerve', attrName: '神经', desc: '产出点数（每分钟）· 看领队的【神经】', maxBonus: 1.5 },
    { id: 'guard', name: '灯阁守卫', ico: '🛡', out: 'otherworld', attr: 'immune', attrName: '免疫', desc: '产出异界结晶（每 10 分钟）· 看领队的【免疫】', maxBonus: 1.5 },
  ];
  const IDLE_LINE_ATTR_DIV = 260;      // 领队对应六维值 / 260 = 加成（封顶见 maxBonus）
  const IDLE_MAT_PER_MIN = 0.08;       // 采材产线基础：每分钟 0.08 个材料（约 5 个/小时，对齐商店 30 点/个的价）

  /* ================= 限时悬赏 ================= */
  // 带截止时间的目标：过期作废，完成后给高价值奖励（对标"次日中午前晋升领 5000 桃子"的紧迫感）
  // 悬赏按"你现在的进度"动态生成：目标永远是下一步本来就要做的事，不再是四条写死的。
  // 生成结果存进存档（S.bounty.list），所以刷新页面不会换目标；开新一期时重新生成。
  const makeBounties = function (S) {
    const out = [];
    const push = (kind, param, name, desc, hours, reward) => {
      if (out.length >= 4) return;
      out.push({ id: 'b' + (out.length + 1) + '_' + kind, kind, param, name, desc, hours, reward });
    };
    const lv = S.player.level || 1;
    // 1) 推进：当前已解锁世界里第一个没通关的关卡
    let target = null;
    WORLDS.forEach(w => {
      if (target) return;
      const st = S.worlds && S.worlds[w.id];
      if (!st || !st.unlocked) return;
      const idx = st.stages.normal.findIndex(s => !(s > 0));
      target = idx >= 0 ? { w, stage: idx + 1 } : { w, stage: 12 };
    });
    if (target) {
      push('stage', { world: target.w.id, diff: 'normal', stage: target.stage },
        `推进 · ${target.w.name}`,
        `通关「${target.w.name} · 普通」第 ${target.stage} 关`,
        72, { holy: 400 + target.stage * 30, points: 8000 + target.stage * 1500, item: 'ticket_adv' });
    }
    // 2) 等级：比当前高 5 级（每期都会往前推）
    const lvTarget = Math.max(10, lv + 5);
    push('level', { n: lvTarget }, '修炼有成', `玩家等级到达 Lv.${lvTarget}`, 96,
      { holy: 500, points: 20000 + lvTarget * 500, item: 'ticket_normal' });
    // 3) 强化：按已强化次数往上加
    const enhTarget = Math.max(10, Math.floor(((S.stats && S.stats.enhances) || 0) / 10) * 10 + 10);
    push('enhance', { n: enhTarget }, '强化达人', `累计强化装备 ${enhTarget} 次`, 120,
      { otherworld: 200 + enhTarget * 10, holy: 400, item: 'ticket_adv' });
    // 4) 剩下一个位置按进度挑：图鉴 / 深井 / 伴生体 / 境界
    const owned = Object.keys(S.chars || {}).length;
    const ssrN = Object.keys(S.chars || {}).filter(id => {
      const c = charById[id];
      return c && ['SSR', 'UR'].includes(c.rarity);
    }).length;
    const best = (S.corridor && S.corridor.best) || 0;
    const beasts = Object.keys((S.beast && S.beast.owned) || {}).length;
    const realm = (S.player && S.player.realm) || 0;
    if (best < 10) {
      push('corridor', { n: 10 }, '深井初探', '深井到达第 10 层', 168,
        { holy: 1200, bloodCrystal: 30 });
    } else if (ssrN < 3) {
      push('ssr', { n: 3 }, '强者如林', '拥有 3 名 SSR 及以上伙伴', 168,
        { holy: 1500, bloodCrystal: 40 });
    } else if (beasts < 3) {
      push('beast', { n: 3 }, '兽栏初成', '孵化 3 只伴生体', 168,
        { holy: 1000, points: 60000 });
    } else if (realm < 1) {
      push('realm', { n: 1 }, '初渡天劫', '完成第一次渡劫（突破到炼气）', 168,
        { holy: 1200, bloodCrystal: 30 });
    } else {
      const next = Math.min(60, owned + 3);
      push('chars', { n: next }, '广纳英才', `拥有 ${next} 名伙伴`, 168,
        { holy: 1500, points: 80000, item: 'ticket_lim' });
    }
    return out;
  };

  /* ================= 境界（渡劫） ================= */
  // 2026-09-14 重构：从「每 10 级一个大境界，共 10 境」改成「大境界 × 初/中/后/大圆满，共 36 小阶」。
  // 原因：旧写法两次突破之间隔 10 级，练级路上长时间没有任何正反馈（对标《道友修仙》的
  // 「凡体→练气初/中/后/大圆满→筑基…」写法，它的境界是被切成小阶的，每隔几级就能破一次）。
  // 单阶加成从 +5% 降到 +1.4%：36 阶 × 1.4% ≈ +50.4%，总量与旧的 10 境 × 5% 基本对齐，
  // 但"变强的出口"从 10 个变成 36 个。老存档按「旧第 N 境 = 新第 4N 阶」迁移（见 core.migrate）。
  const REALM_TIERS = ['初期', '中期', '后期', '大圆满'];
  // 大境名跟着血统走（见 BLOODLINES[x].realms）；这里保留"修真"那一套作为默认与旧档兼容
  const REALM_MAJORS = BLOODLINES['修真'].realms;
  const REALM_STAGE_COUNT = REALM_MAJORS.length * REALM_TIERS.length;   // 36 小阶
  // 主角在当前血统下的境界名：'血将后期' / '筑基初期' …
  // 没选血统时返回 null——调用处一律先让玩家选血统，不再有"凡体"这种占位写法。
  function realmName(bloodlineId, stageIdx) {
    const bl = BLOODLINES[bloodlineId];
    if (!bl || stageIdx < 0 || stageIdx >= REALM_STAGE_COUNT) return null;
    return bl.realms[Math.floor(stageIdx / REALM_TIERS.length)] + REALM_TIERS[stageIdx % REALM_TIERS.length];
  }
  // 某条血统的 36 阶全览（境界页用来整条展示）
  function realmChain(bloodlineId) {
    const out = [];
    for (let i = 0; i < REALM_STAGE_COUNT; i++) {
      out.push({ idx: i, major: Math.floor(i / REALM_TIERS.length), tier: i % REALM_TIERS.length, name: realmName(bloodlineId, i) });
    }
    return out;
  }
  const REALM_STEP = (100 - 10) / (REALM_MAJORS.length * REALM_TIERS.length - 1);   // ≈2.57 级一阶
  // 单阶消耗按等级平滑放大，保证 lv10→100 的累计消耗与旧表同量级（旧表累计 ≈388 万点 / 504 材料）
  const realmCost = lv => Math.round(1980 * Math.pow(lv / 10, 2.19));
  const REALMS = (() => {
    const out = [];
    REALM_MAJORS.forEach((mj, mi) => {
      REALM_TIERS.forEach((tier, ti) => {
        const i = mi * REALM_TIERS.length + ti;
        const lv = Math.round(10 + REALM_STEP * i);
        out.push({
          name: mj,
          step: tier,
          full: mj + tier,                       // 完整写法（默认为修真那条线；其余血统用 realmName()）
          major: mi, tierIdx: ti,
          lv,
          rate: +(0.95 - i * (0.95 - 0.52) / (REALM_MAJORS.length * REALM_TIERS.length - 1)).toFixed(3),
          cost: { points: realmCost(lv), matN: Math.round(1 + lv * 0.235) },
        });
      });
    });
    return out;
  })();
  const REALM_PCT = 0.014;   // 每突破一小阶：全属性 +1.4%（36 阶合计 +50.4%）

  /* ================= 五行 / 伴生体 ================= */
  // 五行相克：金克木、木克土、土克水、水克火、火克金。
  // 每个残域有自己的属性，伴生体带属性 —— 带对了克制的伴生体进本，全队伤害 +15%，带反了 -8%。
  const ELEMENTS = ['金', '木', '水', '火', '土'];
  const ELEMENT_ICON = { 金: '⚔️', 木: '🌿', 水: '💧', 火: '🔥', 土: '⛰️' };
  const ELEMENT_COUNTER = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };
  const ELEMENT_BONUS = 0.15;
  const ELEMENT_PENALTY = 0.08;
  const worldElement = id => {
    const i = WORLDS.findIndex(w => w.id === id);
    return i < 0 ? null : ELEMENTS[i % ELEMENTS.length];
  };

  // 伴生体：第二条养成线（对标灵兽驯宠）。上阵 1 只，给全队加属性 + 一个被动 + 五行克制。
  // pct 里的每一项都会真的进属性计算（见 core 的 beastPct），说明也由同一份数据派生。
  const BEAST_PCT_NAME = {
    atkPct: '攻击', defPct: '防御', hpPct: '生命', spdPct: '速度',
    critPct: '暴击率', skillPct: '技能伤害', lifesteal: '吸血', dmgReduce: '减伤',
  };
  const BEASTS = [
    { id: 'bs01', name: '铁脊狼',   rarity: 'N',   elem: '金', pct: { atkPct: 0.020 } },
    { id: 'bs02', name: '苔背龟',   rarity: 'N',   elem: '木', pct: { hpPct: 0.020 } },
    { id: 'bs03', name: '寒潭鲤',   rarity: 'N',   elem: '水', pct: { defPct: 0.020 } },
    { id: 'bs04', name: '灰烬枭',   rarity: 'R',   elem: '火', pct: { critPct: 0.010, atkPct: 0.010 } },
    { id: 'bs05', name: '磐岩犀',   rarity: 'R',   elem: '土', pct: { hpPct: 0.030, defPct: 0.015 } },
    { id: 'bs06', name: '裂风隼',   rarity: 'R',   elem: '金', pct: { spdPct: 0.040 } },
    { id: 'bs07', name: '青木藤',   rarity: 'SR',  elem: '木', pct: { hpPct: 0.040, lifesteal: 0.020 } },
    { id: 'bs08', name: '深渊魇',   rarity: 'SR',  elem: '水', pct: { skillPct: 0.060 } },
    { id: 'bs09', name: '燧石兽',   rarity: 'SR',  elem: '火', pct: { atkPct: 0.045, critPct: 0.015 } },
    { id: 'bs10', name: '山河巨灵', rarity: 'SR',  elem: '土', pct: { hpPct: 0.050, dmgReduce: 0.030 } },
    { id: 'bs11', name: '灯阁残影', rarity: 'SSR', elem: '金', pct: { atkPct: 0.070, skillPct: 0.050 } },
    { id: 'bs12', name: '不息之种', rarity: 'SSR', elem: '土', pct: { hpPct: 0.070, dmgReduce: 0.050, lifesteal: 0.030 } },
  ];
  const beastById = id => BEASTS.find(b => b.id === id) || null;
  const BEAST_RARITY_RATE = { N: 0.50, R: 0.30, SR: 0.17, SSR: 0.03 };
  const BEAST_EGG_ITEM = 'beast_egg';
  const BEAST_EGG_COST = 10;          // 孵一次：兽魂石 ×10
  const BEAST_MAX_LV = 10;
  const BEAST_SOUL_PER_LV = 10;       // 重复获得转兽魂，10 兽魂升 1 级
  const BEAST_LV_PCT = 0.15;          // 每级在基础加成上 +15%（相对值）
  // 说明文案由 pct 派生，避免"写了没实装"
  const beastDesc = b => Object.entries(b.pct)
    .map(([k, v]) => `${BEAST_PCT_NAME[k] || k} +${(v * 100).toFixed(1)}%`).join(' · ');
  // 满级时的最终加成
  const beastPctAt = (b, lv) => {
    const m = 1 + (Math.max(1, lv) - 1) * BEAST_LV_PCT;
    const out = {};
    Object.entries(b.pct).forEach(([k, v]) => { out[k] = v * m; });
    return out;
  };

  /* ================= 商店 ================= */
  // req.world：需要先通关该世界（普通难度）才会解锁这一格商品；
  // 2026-09-12 补齐：高阶经验模块与 T4/T5 强化材料此前没有任何稳定来源，属于"看得到拿不到"。
  const SHOPS = {
    god: { name: '灯阁市集', currency: 'points', items: [
      { item: 'exp_s', name: '初级经验模块', price: 500, stock: -1 },
      { item: 'exp_m', name: '中级经验模块', price: 2000, stock: -1 },
      { item: 'exp_l', name: '高级经验模块', price: 12000, stock: -1, req: { world: 'W04' } },
      { item: 'exp_xl', name: '超级经验模块', price: 45000, stock: -1, req: { world: 'W07' } },
      { item: 'heal_s', name: '小型治疗剂', price: 500, stock: -1 },
      { item: 'beast_egg', name: '兽魂石×5', price: 4000, count: 5, stock: -1, req: { world: 'W03' } },
      { item: 'heal_m', name: '中型治疗剂', price: 1200, stock: -1 },
      { item: 'heal_l', name: '大型治疗剂', price: 3000, stock: -1, req: { world: 'W03' } },
      { item: 'buff_muscle', name: '肌肉强化剂', price: 1500, stock: -1 },
      { item: 'buff_nerve', name: '神经刺激剂', price: 1500, stock: -1 },
      { item: 'def_shield', name: '合金护盾剂', price: 2400, stock: -1, req: { world: 'W02' } },
      { item: 'atk_surge', name: '狂暴催化剂', price: 3600, stock: -1, req: { world: 'W06' } },
      { item: 'heal_x', name: '全效治疗剂', price: 9000, stock: -1, req: { world: 'W10' } },
      { item: 'exp_xxl', name: '究极经验模块', price: 160000, stock: -1, req: { world: 'W15' } },
      { item: 'mat_t1', name: '基础金属×10', price: 300, count: 10, stock: -1 },
      { item: 'mat_t4', name: '虚空晶体×5', price: 6000, count: 5, stock: -1, req: { world: 'W04' } },
      { item: 'mat_t5', name: '灯阁残片×3', price: 15000, count: 3, stock: -1, req: { world: 'W06' } },
      { currencyGain: { skillChip: 10 }, name: '技能芯片×10', price: 2000, stock: -1 },
      { item: 'box_r', name: '随机R装备', price: 5000, stock: -1 },
      { item: 'box_sr', name: '随机SR装备', price: 30000, stock: -1 },
      { item: 'ticket_normal', name: '引灯招募券', price: 6000, stock: 3 },
    ] },
    otherworld: { name: '异界商店', currency: 'otherworld', items: [
      { item: 'box_sr', name: 'SR装备箱', price: 100, stock: -1 },
      { item: 'box_ssr', name: 'SSR装备箱', price: 500, stock: -1 },
      { item: 'box_ur', name: 'UR装备箱', price: 2000, stock: -1 },
      { item: 'mat_t2', name: '强化合金×10', price: 50, count: 10, stock: -1 },
      { item: 'mat_t3', name: '异界合金×5', price: 100, count: 5, stock: -1 },
      { item: 'mat_t4', name: '虚空晶体×5', price: 300, count: 5, stock: -1, req: { world: 'W04' } },
      { item: 'mat_t5', name: '灯阁残片×3', price: 900, count: 3, stock: -1, req: { world: 'W06' } },
      { item: 'exp_l', name: '高级经验模块', price: 150, stock: -1, req: { world: 'W04' } },
      { item: 'spd_surge', name: '超频注射剂', price: 260, stock: -1, req: { world: 'W08' } },
      { item: 'exp_xxl', name: '究极经验模块', price: 4200, stock: -1, req: { world: 'W15' } },
      { item: 'ticket_adv', name: '圣契招募令', price: 120, stock: 2 },
      { item: 'ticket_lim', name: '异界征召令', price: 180, stock: 2 },
    ] },
    story: { name: '故事商店', currency: 'story', items: [
      { shardRandom: 'R', shardCount: 10, name: '随机R伙伴碎片×10', price: 100, stock: -1 },
      { shardRandom: 'SR', shardCount: 10, name: '随机SR伙伴碎片×10', price: 300, stock: -1 },
      { item: 'box_sr', name: '世界装备箱', price: 200, stock: -1 },
      { item: 'mat_t1', name: '世界材料×50', price: 50, count: 50, stock: -1 },
      { item: 'exp_m', name: '中级经验模块×2', price: 150, count: 2, stock: -1 },
      { currencyGain: { skillChip: 100 }, name: '技能芯片×100', price: 200, stock: -1 },
      { currencyGain: { holy: 10 }, name: '圣洁晶石×10', price: 500, stock: 1 },
      { item: 'ticket_normal', name: '引灯招募券', price: 250, stock: 3 },
    ] },
    corridor: { name: '深井商店', currency: 'corridor', items: [
      { shardRandom: 'SR', shardCount: 10, name: 'SR伙伴碎片×10', price: 100, stock: -1 },
      { shardRandom: 'SSR', shardCount: 5, name: 'SSR伙伴碎片×5', price: 300, stock: -1 },
      { currencyGain: { skillChip: 100 }, name: '技能芯片×100', price: 150, stock: -1 },
      { currencyGain: { bloodCrystal: 100 }, name: '血统结晶×100', price: 200, stock: -1 },
      { item: 'exp_xl', name: '超级经验模块', price: 120, stock: -1 },
      { item: 'mat_t5', name: '灯阁残片×5', price: 150, count: 5, stock: -1 },
      { item: 'box_ssr', name: 'SSR装备箱', price: 500, stock: -1 },
      { item: 'box_ur', name: 'UR装备箱', price: 1500, stock: -1 },
      { item: 'ticket_adv', name: '圣契招募令', price: 150, stock: 3 },
      { item: 'ticket_lim', name: '异界征召令', price: 220, stock: 2 },
    ] },
  };

  /* ================= 任务 / 登录 / 成就 ================= */
  const DAILY_TASKS = [
    { id: 'battle5',  name: '战斗 5 次', target: 5, reward: { points: 1000 } },
    { id: 'idle1',    name: '领取挂机收益 1 次', target: 1, reward: { points: 800 } },
    { id: 'enhance1', name: '强化装备 1 次', target: 1, reward: { otherworld: 30 } },
    { id: 'recruit1', name: '招募 1 次', target: 1, reward: { holy: 20 } },
    { id: 'dungeon1', name: '完成 1 次副本', target: 1, reward: { story: 100 } },
    { id: 'item1',    name: '使用 1 个道具', target: 1, reward: { points: 500 } },
    { id: 'sign1',    name: '求签 1 次', target: 1, reward: { points: 600 } },
    { id: 'arena1',   name: '斗法台守擂 1 次', target: 1, reward: { otherworld: 40 } },
  ];
  const DAILY_ALL_REWARD = { points: 5000, skillChip: 50, holy: 20, item: 'ticket_normal' };
  // 周常任务：与每日任务共用同一套进度来源（战斗/强化/副本/招募/道具/挂机），按自然周重置
  const WEEKLY_TASKS = [
    { id: 'w_battle',  name: '本周战斗 100 次', target: 100, src: 'battle', reward: { points: 8000, holy: 60 } },
    { id: 'w_run',     name: '本周通关 10 次副本', target: 10,  src: 'dungeon', reward: { points: 10000, skillChip: 150 } },
    { id: 'w_enhance', name: '本周强化 20 次装备', target: 20,  src: 'enhance', reward: { otherworld: 300, points: 6000 } },
    { id: 'w_recruit', name: '本周招募 10 次', target: 10,      src: 'recruit', reward: { holy: 120, item: 'ticket_adv' } },
    { id: 'w_idle',    name: '本周领取挂机收益 7 次', target: 7, src: 'idle', reward: { story: 600, points: 5000 } },
  ];
  const WEEKLY_ALL_REWARD = { holy: 300, otherworld: 800, item: ['exp_xl', 'ticket_lim'] };
  // 成就：长线目标，覆盖战斗 / 养成 / 收集 / 挑战四条线
  const ACHIEVEMENTS = [
    { id: 'a_battle100', cat: '战斗', name: '百战之躯', desc: '累计战斗 100 场', check: S => S.stats.battles >= 100, reward: { points: 8000 } },
    { id: 'a_battle1000', cat: '战斗', name: '千锤百炼', desc: '累计战斗 1000 场', check: S => S.stats.battles >= 1000, reward: { points: 60000, holy: 200 } },
    { id: 'a_boss10', cat: '战斗', name: '屠龙者', desc: '击杀 10 次守关 Boss', check: S => S.stats.bosses >= 10, reward: { otherworld: 200 } },
    { id: 'a_boss50', cat: '战斗', name: 'Boss 猎人', desc: '击杀 50 次守关 Boss', check: S => S.stats.bosses >= 50, reward: { holy: 300, bloodCrystal: 200 } },
    { id: 'a_hell1', cat: '战斗', name: '地狱归来', desc: '通关任意关卡的地狱难度', check: S => Object.values(S.worlds).some(w => w.stages.hell.some(s => s > 0)), reward: { holy: 200, otherworld: 300 } },
    { id: 'a_run50', cat: '战斗', name: '残域老手', desc: '累计通关 50 次副本关卡', check: S => S.stats.runs >= 50, reward: { points: 30000 } },
    { id: 'a_lv100', cat: '养成', name: '登峰造极', desc: '玩家等级达到 Lv.100', check: S => S.player.level >= 100, reward: { holy: 500, otherworld: 500 } },
    { id: 'a_gene5', cat: '养成', name: '完全解锁', desc: '铭刻解锁到 5 阶', check: S => S.player.geneLock >= 5, reward: { holy: 500, bloodCrystal: 500 } },
    { id: 'a_enh50', cat: '养成', name: '铁匠', desc: '累计强化 50 次装备', check: S => S.stats.enhances >= 50, reward: { points: 20000, otherworld: 200 } },
    { id: 'a_enh20', cat: '养成', name: '完美强化', desc: '拥有一件 +20 装备', check: S => Object.values(S.equips).some(e => e.enhance >= 20), reward: { holy: 300, otherworld: 500 } },
    { id: 'a_char10', cat: '收集', name: '小队成形', desc: '拥有 10 名伙伴', check: S => Object.keys(S.chars).length >= 10, reward: { points: 15000 } },
    { id: 'a_char30', cat: '收集', name: '大型队伍', desc: '拥有 30 名伙伴', check: S => Object.keys(S.chars).length >= 30, reward: { holy: 400, points: 40000 } },
    { id: 'a_ssr1', cat: '收集', name: '命运相遇', desc: '获得第 1 名 SSR 伙伴', check: S => Object.keys(S.chars).some(id => (charById[id] || {}).rarity === 'SSR'), reward: { holy: 200 } },
    { id: 'a_ur1', cat: '收集', name: '超越者', desc: '获得第 1 名 UR 伙伴', check: S => Object.keys(S.chars).some(id => (charById[id] || {}).rarity === 'UR'), reward: { holy: 500, bloodCrystal: 300 } },
    { id: 'a_world3', cat: '挑战', name: '走出巢穴', desc: '通关 3 个世界的普通难度', check: S => WORLDS.filter(w => S.worlds[w.id] && S.worlds[w.id].stages.normal.every(s => s > 0)).length >= 3, reward: { holy: 300 } },
    { id: 'a_floor50', cat: '挑战', name: '深井 50 层', desc: '深井历史最高 50 层', check: S => S.corridor.best >= 50, reward: { corridor: 100, points: 20000 } },
    { id: 'a_floor100', cat: '挑战', name: '深井 100 层', desc: '深井历史最高 100 层', check: S => S.corridor.best >= 100, reward: { corridor: 300, holy: 400 } },
    { id: 'a_floor200', cat: '挑战', name: '深井守望者', desc: '深井历史最高 200 层', check: S => S.corridor.best >= 200, reward: { corridor: 800, holy: 800 } },
    { id: 'a_reincarn', cat: '挑战', name: '转生不止', desc: '完成 1 次转生', check: S => S.player.reincarnations >= 1, reward: { holy: 300, bloodCrystal: 300 } },
    { id: 'a_codex20', cat: '收集', name: '图鉴过半', desc: '图鉴收集 20 名伙伴', check: S => S.codex.chars.length >= 20, reward: { points: 30000, holy: 200 } },
  ];
  const LOGIN_REWARDS = [
    { holy: 100, item: 'ticket_normal' }, { points: 10000, item: 'ticket_normal' },
    { skillChip: 100, item: 'ticket_adv' }, { otherworld: 200 },
    { holy: 200, item: 'ticket_adv' }, { item: 'box_ssr' },
    { ssrTicket: true, item: 'ticket_lim' },
  ];
  const STARTER = {
    points: 50000, holy: 1000,
    items: { exp_s: 20, heal_s: 10 },
  };

  /* ================= 功能解锁（随关卡进度） ================= */
  const UNLOCKS = [
    { id: 'recruit',   name: '招募伙伴', world: 'W01', stage: 1,  tip: '通关 菌毯巢穴·第1关 解锁' },
    { id: 'shop',      name: '兑换大厅',   world: 'W01', stage: 2,  tip: '通关 菌毯巢穴·第2关 解锁' },
    { id: 'enhance',   name: '装备强化',   world: 'W01', stage: 3,  tip: '通关 菌毯巢穴·第3关 解锁' },
    { id: 'buildings', name: '基地建设',   world: 'W01', stage: 4,  tip: '通关 菌毯巢穴·第4关 解锁' },
    { id: 'tasks',     name: '每日任务',   world: 'W01', stage: 4,  tip: '通关 菌毯巢穴·第4关 解锁' },
    { id: 'geneLock',  name: '铭刻',     world: 'W01', stage: 12, tip: '通关 菌毯巢穴·第12关 解锁' },
    { id: 'corridor',  name: '深井',   world: 'W01', stage: 12, tip: '通关 菌毯巢穴·第12关 解锁' },
    { id: 'bloodline', name: '血统强化',   world: 'W02', stage: 1,  tip: '通关 潜影窟·第1关 解锁' },
    { id: 'reincarn',  name: '转生',       world: 'W03', stage: 12, tip: '通关 怨声旧宅·第12关 解锁' },
    { id: 'beast',     name: '伴生体',     world: 'W02', stage: 3,  tip: '通关 潜影窟·第3关 解锁' },
  ];

  /* ================= 主线任务 ================= */
  // check: (S, helpers) => bool；reward 自动结算，点击领取
  const MAIN_QUESTS = [
    { id: 'q01', name: '熟悉身体', desc: '打开个人房间，查看主角属性面板', reward: { points: 500 },
      check: S => (S.stats.profileViews || 0) >= 1 },
    { id: 'q01b', name: '熟悉战斗', desc: '完成 1 场战斗', reward: { points: 1000 },
      check: S => S.stats.battles >= 1 },
    { id: 'q02', name: '初临蜂巢', desc: '通关 菌毯巢穴·第1关', reward: { holy: 100 }, unlock: 'recruit',
      check: S => S.worlds.W01 && S.worlds.W01.stages.normal[0] > 0 },
    { id: 'q03', name: '第一位同伴', desc: '进行 1 次招募', reward: { points: 2000 },
      check: S => S.stats.recruits >= 1 },
    { id: 'q04', name: '并肩作战', desc: '在队伍中上阵 1 名伙伴', reward: { story: 50 },
      check: S => S.party.filter(id => id && id !== '@player').length >= 1 },
    { id: 'q05', name: '深入蜂巢', desc: '通关 菌毯巢穴·第2关', reward: { points: 2000 }, unlock: 'shop',
      check: S => S.worlds.W01 && S.worlds.W01.stages.normal[1] > 0 },
    { id: 'q06', name: '工欲善其事', desc: '通关 菌毯巢穴·第3关', reward: { otherworld: 50 }, unlock: 'enhance',
      check: S => S.worlds.W01 && S.worlds.W01.stages.normal[2] > 0 },
    { id: 'q07', name: '第一次强化', desc: '强化 1 次装备', reward: { points: 3000 },
      check: S => S.stats.enhances >= 1 },
    { id: 'q08', name: '安身立命', desc: '通关 菌毯巢穴·第4关', reward: { points: 3000 }, unlock: 'buildings,tasks',
      check: S => S.worlds.W01 && S.worlds.W01.stages.normal[3] > 0 },
    { id: 'q09', name: '大兴土木', desc: '升级 1 次建筑', reward: { points: 2000 },
      check: S => Object.values(S.buildings).some(lv => lv >= 2) },
    { id: 'q10', name: '蜂巢之主', desc: '击杀 菌毯母巢（第12关）', reward: { holy: 200, bloodCrystal: 100 }, unlock: 'geneLock,corridor',
      check: S => S.worlds.W01 && S.worlds.W01.stages.normal[11] > 0 },
    { id: 'q11', name: '深井的呼唤', desc: '通关 深井·第1层', reward: { story: 100 },
      check: S => S.corridor.floor >= 2 },
    { id: 'q12', name: '新的恐怖', desc: '通关 潜影窟·第1关', reward: { bloodCrystal: 50 }, unlock: 'bloodline',
      check: S => S.worlds.W02 && S.worlds.W02.stages.normal[0] > 0 },
    { id: 'q13', name: '血脉觉醒', desc: '升级 1 次血统（主角或伙伴）', reward: { points: 5000 },
      check: S => S.player.bloodlineLv >= 1 || Object.values(S.chars).some(c => c.bloodlineLv >= 1) },
    { id: 'q14', name: '潜影之后', desc: '通关 潜影窟·第12关', reward: { holy: 300, otherworld: 200 },
      check: S => S.worlds.W02 && S.worlds.W02.stages.normal[11] > 0 },
    { id: 'q15', name: '执灯者之路', desc: '通关 怨声旧宅·第12关', reward: { holy: 500, rp: 0 }, unlock: 'reincarn',
      check: S => S.worlds.W03 && S.worlds.W03.stages.normal[11] > 0 },
  ];

  // 新手掉落保护：按关卡限制掉落品质上限
  function stageDropCap(stage) {
    if (stage <= 3) return 'R';
    if (stage <= 6) return 'SR';
    return null;
  }

  /* ================= 转生天赋 ================= */
  // 2026-09-12 重构：每个节点写成「文案 + 效果」的对象，文案由效果派生，
  // 从结构上杜绝"说明写了、实际没实装"再次发生（旧版 40 个节点里 15 个是空文本）。
  // e 里的键与战斗/挂机系统一一对应：
  //   hpPct/defPct/spdPct/critPct/critDmg/skillPct/evaPct/spiritPct → 属性区（与装备同池加算）
  //   dmgReduce 减伤 / healUp 受治疗加成 / initEnergy 开场能量 / cdRed 技能CD减少
  //   firstStrike 首回合速度 / ultPct 必杀伤害 / idlePct 挂机增产 / expPct 经验加成
  //   dropPct 掉落加成 / offlinePct 离线效率
  const TALENTS = {
    body: { name: '永恒之躯', desc: '生命/防御/减伤', nodes: [
      { text: '生命+5%', e: { hpPct: 0.05 } },
      { text: '防御+5%', e: { defPct: 0.05 } },
      { text: '受治疗+8%', e: { healUp: 0.08 } },
      { text: '生命+8%', e: { hpPct: 0.08 } },
      { text: '减伤+3%', e: { dmgReduce: 0.03 } },
      { text: '生命+12%', e: { hpPct: 0.12 } },
      { text: '防御+8%', e: { defPct: 0.08 } },
      { text: '减伤+5%', e: { dmgReduce: 0.05 } },
      { text: '生命+20%', e: { hpPct: 0.20 } },
      { text: '不朽：减伤+8%·受治疗+20%', e: { dmgReduce: 0.08, healUp: 0.20 } },
    ] },
    energy: { name: '无限能源', desc: '技能/精神/能量', nodes: [
      { text: '精神+5%', e: { spiritPct: 0.05 } },
      { text: '技能伤害+5%', e: { skillPct: 0.05 } },
      { text: '开场能量+10', e: { initEnergy: 10 } },
      { text: '精神+8%', e: { spiritPct: 0.08 } },
      { text: '技能伤害+8%', e: { skillPct: 0.08 } },
      { text: '技能CD-1（必杀除外）', e: { cdRed: 1 } },
      { text: '精神+12%', e: { spiritPct: 0.12 } },
      { text: '技能伤害+12%', e: { skillPct: 0.12 } },
      { text: '开场能量+25', e: { initEnergy: 25 } },
      { text: '超载：必杀伤害+25%', e: { ultPct: 0.25 } },
    ] },
    nerve: { name: '超维神经', desc: '速度/暴击/闪避', nodes: [
      { text: '速度+5%', e: { spdPct: 0.05 } },
      { text: '暴击率+3%', e: { critPct: 0.03 } },
      { text: '闪避+2%', e: { evaPct: 0.02 } },
      { text: '速度+8%', e: { spdPct: 0.08 } },
      { text: '暴击伤害+10%', e: { critDmg: 0.10 } },
      { text: '速度+12%', e: { spdPct: 0.12 } },
      { text: '暴击率+5%', e: { critPct: 0.05 } },
      { text: '闪避+4%', e: { evaPct: 0.04 } },
      { text: '速度+20%', e: { spdPct: 0.20 } },
      { text: '先制：首回合速度+50%', e: { firstStrike: 0.50 } },
    ] },
    grace: { name: '灯阁恩赐', desc: '挂机/掉落/经验', nodes: [
      { text: '挂机+5%', e: { idlePct: 0.05 } },
      { text: '经验+5%', e: { expPct: 0.05 } },
      { text: '掉落+5%', e: { dropPct: 0.05 } },
      { text: '挂机+8%', e: { idlePct: 0.08 } },
      { text: '经验+8%', e: { expPct: 0.08 } },
      { text: '挂机+12%', e: { idlePct: 0.12 } },
      { text: '掉落+8%', e: { dropPct: 0.08 } },
      { text: '经验+12%', e: { expPct: 0.12 } },
      { text: '挂机+20%', e: { idlePct: 0.20 } },
      { text: '神眷：离线效率+15%', e: { offlinePct: 0.15 } },
    ] },
  };
  const TALENT_COSTS = [10, 20, 40, 80, 150, 300, 600, 1000, 1500, 2500];
  // 取某支天赋前 lv 级的累计效果（文案与数值同源，不会再对不上）
  function talentEffect(branch, lv) {
    const t = TALENTS[branch];
    const out = {};
    if (!t) return out;
    for (let i = 0; i < Math.min(lv, t.nodes.length); i++) {
      Object.entries(t.nodes[i].e || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
    }
    return out;
  }
  // 文案数组（UI 展示用），保证顺序与效果一一对应
  const talentTexts = branch => (TALENTS[branch] ? TALENTS[branch].nodes.map(n => n.text) : []);

  /* ================= 深井 ================= */
  // 2026-09-12 调整：旧曲线第 1~100 层 HP 按 1.045 指数暴涨（100 层 46.8 万 HP / 攻 13501），
  // 而玩家属性在 Lv100+铭刻5+血统30 就到顶 → 结果只有"碾压"和"断崖"两种状态。
  // 新曲线放缓（1.032 / 1.026 / 1.020），并新增「深井印记」：每通 10 层永久 +1.5% 属性（仅深井内，上限 30 枚 +45%）。
  function corridorEnemy(floor) {
    let gHp, gAtk, gDef;
    if (floor <= 100) { gHp = 1.032; gAtk = 1.026; gDef = 1.020; }
    else if (floor <= 300) { gHp = 1.028; gAtk = 1.024; gDef = 1.018; }
    else { gHp = 1.022; gAtk = 1.020; gDef = 1.015; }
    const hpM = Math.pow(gHp, floor - 1), atkM = Math.pow(gAtk, floor - 1), defM = Math.pow(gDef, floor - 1);
    const isBoss = floor % 50 === 0, isElite = floor % 10 === 0;
    const mult = isBoss ? 2.4 : isElite ? 1.7 : 1;
    return {
      name: isBoss ? `深井守望者·${floor}层` : isElite ? `深井精英·${floor}层` : `深井之影·${floor}层`,
      hp: Math.round(2500 * hpM * mult), atk: Math.round(320 * atkM * (isBoss ? 1.4 : 1)), def: Math.round(200 * defM * (isBoss ? 1.3 : 1)),
      isBoss, isElite,
    };
  }
  // 深井印记：历史最高层每 10 层 1 枚，每枚在深井内给全队 +1.5%（上限 30 枚 = +45%）
  const CORRIDOR_MARK_STEP = 10, CORRIDOR_MARK_CAP = 30, CORRIDOR_MARK_PCT = 0.015;
  const corridorMarks = best => Math.min(CORRIDOR_MARK_CAP, Math.floor((best || 0) / CORRIDOR_MARK_STEP));
  const corridorMarkBonus = best => corridorMarks(best) * CORRIDOR_MARK_PCT;
  const corridorReward = floor => ({
    points: Math.round(100 * Math.pow(1.04, Math.floor(floor / 10))),
    story: 5,
    corridor: floor % 10 === 0 ? 3 : 1,
    bloodCrystal: floor % 50 === 0 ? 50 : 0,
  });

  /* ================= 掉落稀有度 ================= */
  const DROP_RARITY = {
    normal: [['N', 0.45], ['R', 0.35], ['SR', 0.16], ['SSR', 0.035], ['UR', 0.005]],
    hard:   [['N', 0.20], ['R', 0.35], ['SR', 0.30], ['SSR', 0.12], ['UR', 0.03]],
    hell:   [['N', 0.05], ['R', 0.20], ['SR', 0.35], ['SSR', 0.30], ['UR', 0.10]],
  };
  function rollRarity(diff, minRarity) {
    const table = DROP_RARITY[diff] || DROP_RARITY.normal;
    let r = Math.random(), acc = 0, result = 'N';
    for (const [rar, p] of table) { acc += p; if (r <= acc) { result = rar; break; } }
    if (minRarity && RARITIES.indexOf(result) < RARITIES.indexOf(minRarity)) result = minRarity;
    return result;
  }
  function capRarity(rar, cap) {
    if (!cap) return rar;
    return RARITIES.indexOf(rar) > RARITIES.indexOf(cap) ? cap : rar;
  }

  return {
    ATTR_NAMES, RARITIES, RARITY_COLOR, STAR_MULT, RARITY_MAXSTAR, STAR_COST, DUP_SHARDS,
    FACTIONS, FACTION_COUNTER, EXP_TABLE, LEVEL_POINTS, CURRENCIES,
    ATTR_META, ATTR_POINTS_PER_LV, ATTR_POINT_VALUE, BLOODLINE_UNLOCK_LV,
    BAG_BASE_CAP, BAG_BASE_ITEM_CAP, BAG_BASE_MAT_CAP, BAG_BASE_EQ_CAP, BAG_EXPAND_SIZE, bagExpandCost, SWEEP_DAILY_CAP,
    BLOODLINE_SKILLS, KIND_NAMES, CLASS_SETS, SIGNATURE_EQUIPS, makeSignatureEquip,
    ROLE_KIND, ATK_ATTR, characters, charById,
    WORLDS, DIFFICULTY, FIRST_CLEAR,
    EQUIP_SLOTS, EQUIP_RARITY_MULT, DECOMPOSE_GAIN, ENHANCE_RATE, SETS, AFFIX_POOL, makeEquip,
    RECRUIT_SLOTS, PLAYER_SLOTS, DROP_SLOTS, PROTAGONIST,
    ITEMS,
    BLOODLINES, BLOODLINE_MAX, bloodlineCost, GENE_LOCKS,
    BUILDINGS, buildingCost,
    SECT_MAX, SECT_PCT_PER_LV, sectExpNeed, sectBonusPct, SECT_EXP,
    KEJI, KEJI_COIN, kejiById, kejiCost,
    TRAVELS, TRAVEL_TOTAL_W, TRAVEL_EVERY_SEC,
    GARDEN, GARDEN_PLOTS,
    ARENA_DAILY, arenaReward, arenaEnemy,
    FABAO, fabaoById,
    MOUNTS, mountById, MOUNT_PCT_NAME,
    SIGNS, rollSign,
    RECRUIT_POOLS, PITY, PITY_UP, recruitUpChar, weekIndex,
    FORMATIONS, pityText,
    AUTHORITY, AUTHORITY_MAX, authorityCost, authorityBonus, AUTHORITY_PER_LV,
    IDLE_LINES, IDLE_LINE_ATTR_DIV, IDLE_MAT_PER_MIN,
    makeBounties, REALMS, REALM_PCT, REALM_TIERS, REALM_MAJORS, REALM_STAGE_COUNT, realmName, realmChain,
    ELEMENTS, ELEMENT_ICON, ELEMENT_COUNTER, ELEMENT_BONUS, ELEMENT_PENALTY, worldElement,
    BEASTS, beastById, beastDesc, beastPctAt, BEAST_PCT_NAME, BEAST_RARITY_RATE,
    BEAST_EGG_ITEM, BEAST_EGG_COST, BEAST_MAX_LV, BEAST_SOUL_PER_LV, BEAST_LV_PCT,
    SHOPS, DAILY_TASKS, DAILY_ALL_REWARD, LOGIN_REWARDS, STARTER,
    WEEKLY_TASKS, WEEKLY_ALL_REWARD, ACHIEVEMENTS,
    TALENTS, TALENT_COSTS, talentEffect, talentTexts,
    corridorEnemy, corridorReward, corridorMarks, corridorMarkBonus,
    CORRIDOR_MARK_STEP, CORRIDOR_MARK_CAP, CORRIDOR_MARK_PCT,
    DROP_RARITY, rollRarity, capRarity,
    UNLOCKS, MAIN_QUESTS, stageDropCap,
    CURRENCY_INFO, CODEX_REWARDS, enhanceMatTier, MAT_SUBSTITUTE_POINTS,
    CONSUMABLE_TAG, GUIDE_CHAPTERS,
    SERUMS, serumById, SERUM_ITEM, SERUM_KEYS,
    _ri: ri,
  };
})();
