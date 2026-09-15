/* UI 冒烟测试：用 DOM 桩执行全部界面渲染，捕捉模板/空引用错误 */
const fs = require('fs');
const store = {};
global.window = global;
// window 上的监听要真的收下来，才能测"长按拖拽"这条走 window 指针事件的路径
const winListeners = {};
global.addEventListener = (n, fn) => { (winListeners[n] = winListeners[n] || []).push(fn); };
global.removeEventListener = (n, fn) => {
  const a = winListeners[n] || [];
  const i = a.indexOf(fn);
  if (i >= 0) a.splice(i, 1);
};
global.fireWindow = (n, ev) => (winListeners[n] || []).slice().forEach(fn => fn(ev || {}));
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
function El(tag) {
  const el = {
    tag, children: [], style: {}, dataset: {}, classList: {
      add() {}, remove() {}, toggle() {},
    },
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html || ''; },
    textContent: '',
    value: '',
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0,
    offsetWidth: 0,
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    // 同一个元素上按选择器缓存：这样"先绑 onclick、再取回来点一下"的用例才成立
    // （每次返回新对象的话，绑上去的 handler 就丢了，测试永远点不到）
    querySelector(sel) {
      this._qs = this._qs || {};
      return this._qs[sel] || (this._qs[sel] = El('stub:' + sel));
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    focus() {},
    click() {},
    get firstChild() { return this.children[0] || null; },
  };
  return el;
}
const byId = {};
global.document = {
  readyState: 'complete',
  getElementById(id) { return byId[id] || (byId[id] = El('div#' + id)); },
  createElement(t) { return El(t); },
  addEventListener() {},
  querySelector: () => null,      // 桩环境里"页面级查询"一律查不到（批量分解条之类会用到）
  hidden: false,
  elementFromPoint: () => null,     // 默认指针下面没东西；拖拽用例里再临时指到一个格子上
};
global.setTimeout = (fn) => 0;   // 不执行延时回调
global.setInterval = () => 0;
global.Blob = function () {};
global.URL = { createObjectURL: () => '' };
global.FileReader = function () {};

for (const f of ['js/data.js', 'js/core.js', 'js/battle.js', 'js/dungeon.js', 'js/ui.js', 'js/main.js']) {
  eval(fs.readFileSync(f, 'utf8'));
}
const UI = window.UI, Core = window.Core, D = window.DATA;
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL:', name, '→', e.message); }
}

/* 弹窗收尾：这一条来自父亲大人报的"打副本时途中补给箱按返回没反应"——
   根因是返回回调只 refresh() 了背后的页面，弹窗自己没被关掉。
   现在 lootPanel 有兜底：回调没重画也没关，就由面板自己关。 */
t('结算面板的「返回」一定会把这一层收掉（不会点了没反应）', () => {
  const n0 = UI._panels._modalCount();
  // ① 回调什么都不做（老写法就是只 refresh()）→ 兜底必须把面板关掉
  const w = UI._panels.lootPanel('测试结算', '<span class="reward-chip">◈+1</span>', () => {}, null);
  if (UI._panels._modalCount() !== n0 + 1) throw new Error('结算面板没开出来');
  w.querySelector('[data-back]').onclick();
  if (UI._panels._modalCount() !== n0) throw new Error('回调没收尾时，返回没把面板关掉（就是父亲大人报的那个 bug）');
  // ② 回调把同一层重画回上一层（扫荡结果→扫荡面板就是这种）→ 不该被兜底误关
  const w2 = UI._panels.lootPanel('测试结算2', '', self => UI._panels._updateModal(self, '上一层', '<div>x</div>'), null);
  const n1 = UI._panels._modalCount();
  w2.querySelector('[data-back]').onclick();
  if (UI._panels._modalCount() !== n1) throw new Error('回调已经重画了同一层，兜底不该再把它关掉');
  UI._panels._closeModal(w2);
  if (UI._panels._modalCount() !== n0) throw new Error('测试自己没收拾干净');
});
t('「无效按钮」守卫：data-act 的处理分支都必须真的有出处', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  const start = src.indexOf('switch (act) {');
  if (start < 0) throw new Error('找不到 data-act 的分发代码');
  const end = src.indexOf('\n      }', start);
  const block = src.slice(start, end < 0 ? src.length : end);
  const cases = [...block.matchAll(/case '([a-zA-Z-]+)':/g)].map(m => m[1]);
  // 出处：模板里明写的 data-act="xxx"，以及文字宫格那种 ['xxx', '名字', …] 数组项
  const emitted = new Set([...src.matchAll(/data-act="([a-zA-Z-]+)"/g)].map(m => m[1]));
  [...src.matchAll(/\['([a-z][a-zA-Z-]+)',\s*'/g)].forEach(m => emitted.add(m[1]));
  const orphan = [...new Set(cases)].filter(c => !emitted.has(c));
  if (orphan.length) throw new Error('这些动作有处理分支、却没有任何按钮发出：' + orphan.join(', '));
});
t('主线引导的高亮锚点必须真的存在（指错了会静默不显示）', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  // 挂机那条原来指向 claim-idle，而挂机卡上的按钮早就叫 claim-all 了 → 引导永远不出现
  ['claim-all', 'data-eqpage', 'data-card="blood"', 'data-eqd', 'data-stage', 'data-row', 'data-bup', 'data-free', 'text-rows'].forEach(k => {
    if (src.indexOf(k) < 0) throw new Error('引导锚点依赖的东西不存在：' + k);
  });
  ['case \'claim-idle\'', 'data-act="claim-idle"', "coachmark('[data-act=\"claim-idle\"]'"].forEach(k => {
    if (src.indexOf(k) >= 0) throw new Error('还有代码在引用已经不存在的 claim-idle：' + k);
  });
  const i = src.indexOf("coachmark('[data-act=");
  if (i < 0) throw new Error('找不到挂机那条引导');
  if (src.slice(i, i + 40).indexOf('claim-all') < 0) throw new Error('挂机引导没有指向真正的按钮');
});
t('副本一口气打到底：波间不插事件 / 补给箱，打完自动进下一波', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  const i = src.indexOf('function afterWave()');
  if (i < 0) throw new Error('找不到 afterWave');
  const seg = src.slice(i, src.indexOf('function doFinalBattle'));
  ['WAVE_EVENT_CHANCE', 'WAVE_CHEST_CHANCE', 'showEvent', 'lootPanel', 'Math.random'].forEach(k => {
    if (seg.indexOf(k) >= 0) throw new Error('afterWave 里还有波间插曲：' + k);
  });
  if (seg.indexOf('fightWave()') < 0) throw new Error('afterWave 没有自动接着打下一波');
  // 界面上不该再有"开打 · 第 N 波 / 最后一波"这种要按的按钮
  ['开打 · 第', '开打 · 最后一波', '开打 · 守关', '开打 · 精英伏击'].forEach(k => {
    if (src.indexOf(k) >= 0) throw new Error('副本界面还在写「' + k + '」');
  });
});
t('波间无缝衔接：不弹结算页，补血手段搬到战斗界面底部', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  const i = src.indexOf('seamless: true');
  if (i < 0) throw new Error('打完一波没有走无缝衔接');
  const seg = src.slice(i, i + 420);
  ['waveLogLines', 'afterWave()', 'sub:'].forEach(k => {
    if (seg.indexOf(k) < 0) throw new Error('无缝衔接缺：' + k);
  });
  // finish() 里要真的识别 seamless 并直接接下一波，不能又画一个结算面板
  const j = src.indexOf('if (outcome.seamless && res.win)');
  if (j < 0) throw new Error('finish() 没有处理无缝衔接（还会弹结算页）');
  if (src.slice(j, j + 400).indexOf('outcome.after') < 0) throw new Error('无缝衔接没有接上后续动作');
  // 药剂改成战斗界面底部那条战备补给
  if (src.indexOf('data-bpotions') < 0) throw new Error('战斗界面缺战备补给条');
  if (src.indexOf('function paintPotions') < 0 || src.indexOf('function bindPotionButtons') < 0) {
    throw new Error('缺药剂条的渲染 / 绑定');
  }
  if (src.indexOf('extraHtml: waveExtraHtml()') >= 0) throw new Error('波间结算页还在');
});
t('战斗快照带 charId（波间血量继承的前提，不然每波都满血开打）', () => {
  Core.addChar('C021');
  if (!Core.S.party[1]) Core.S.party[1] = 'C021';
  const allies = UI._panels.buildAllies({}, {});
  if (!allies.length) throw new Error('没造出上阵队伍');
  const res = window.Battle.run({
    allies, enemies: window.Dungeon.makeEnemies('W01', 'normal', 1, 'combat'), worldId: 'W01', maxRounds: 30,
  });
  const snap = res.frames[0];
  if (!snap.allies.every(u => u.charId !== undefined)) throw new Error('战斗快照丢了 charId，界面写不回 run.hpPct');
  if (!snap.enemies.every(u => u.charId === undefined)) throw new Error('敌方不该带 charId');
});

t('boot 完成（newGame + init）', () => { if (!Core.S) throw new Error('no state'); });
t('首页渲染含主线任务', () => {
  const html = byId['view'].innerHTML;
  if (!html.includes('主线')) throw new Error('无主线卡');
});
for (const tab of ['dungeon', 'party', 'chars', 'equip', 'home']) {
  t('切换到 ' + tab, () => { UI._setTab(tab); });
}
t('世界详情渲染', () => {
  UI._setTab('dungeon');
  // 模拟点击进入世界详情
  Core.stageComplete('W01', 'normal', 0, 3);
  UI.render();
});
t('主线任务卡在首页出现领取', () => {
  Core.addChar('C021');
  Core.S.chars['C021'].lv = 6;
  UI._setTab('home');
  const html = byId['view'].innerHTML;
  if (!html.includes('领取奖励') && !html.includes('去完成')) throw new Error('主线卡异常');
});
t('招募流程', () => {
  Core.S.unlocks.recruit = true;
  const r = Core.recruitOnce('normal');
  if (r.error) throw new Error(r.error);
});
t('队伍页含主角', () => {
  UI._setTab('party');
  const html = byId['view'].innerHTML;
  if (!html.includes('主角')) throw new Error('缺少主角位');
});
t('没解锁的入口收成一行小字（不铺灰格子）', () => {
  UI._setTab('home');
  const html = byId['view'].innerHTML;
  if (!html.includes('还没解锁')) throw new Error('缺未解锁汇总行');
  if (html.includes('data-locked')) throw new Error('首页不该再铺灰格子入口');
});
t('GM 面板函数存在', () => {
  Core.addCur('holy', 100);
  Core.S.unlocks.corridor = true;
  UI._setTab('dungeon');
});
t('战斗播放可启动', () => {
  const eff = Core.effectivePlayerStats();
  const ally = Object.assign({ name: '测试', kind: 'warrior', faction: null, position: 'front', skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1] }, eff, { maxHp: eff.hp });
  const enemy = window.Dungeon.makeEnemies('W01', 'normal', 1, 'combat');
  const res = window.Battle.run({ allies: [ally], enemies: enemy, worldId: 'W01' });
  if (!res.frames.length) throw new Error('无战斗帧');
});

// ---- 面板冒烟：全部新面板都要能渲染出来，且模板里不许出现 undefined ----
function panel(name, fn) {
  t('面板渲染：' + name, () => {
    const w = fn();
    if (w === null || w === undefined) return;   // 允许"没有可扫荡关卡"这类提前返回
    const html = w.innerHTML || '';
    if (html.includes('undefined')) throw new Error('模板出现 undefined');
  });
}
Core.addItem('exp_s', 3);
Core.addItem('box_sr', 2);
Core.addItem('heal_m', 2);
Core.addItem('buff_nerve', 1);
Core.addItem('mat_t2', 5);
Core.stageComplete('W01', 'normal', 0, 3);
panel('背包', () => UI._panels.bagModal());
panel('道具详情-宝箱', () => UI._panels.itemDetail('box_sr'));
panel('道具详情-经验模块', () => UI._panels.itemDetail('exp_s'));
panel('道具详情-强化剂', () => UI._panels.itemDetail('buff_nerve'));
panel('道具详情-材料', () => UI._panels.itemDetail('mat_t2'));
panel('货币图鉴', () => UI._panels.currencyModal('holy'));
panel('玩法指南', () => UI._panels.guideModal());
panel('设置', () => UI._panels.settingsModal());
panel('商店-灯阁', () => UI._panels.shopModal('god'));
panel('商店-深井', () => UI._panels.shopModal('corridor'));
panel('任务-主线', () => UI._panels.tasksModal('main'));
panel('任务-日常', () => UI._panels.tasksModal('daily'));
panel('任务-周常', () => UI._panels.tasksModal('weekly'));
panel('任务-成就', () => UI._panels.tasksModal('ach'));
panel('角色图鉴', () => UI._panels.codexModal());
panel('招募', () => UI._panels.recruitModal());
panel('扫荡', () => UI._panels.sweepModal('W01', 'normal'));
panel('转生与天赋', () => UI._panels.reincarnModal());
panel('铭刻', () => UI._panels.geneLockModal());
panel('角色详情（6 装备槽）', () => UI._panels.charDetail('C021'));
const anyEquipUid = Object.keys(Core.S.equips)[0];
if (anyEquipUid) panel('装备详情', () => UI._panels.equipDetail(anyEquipUid));

// ---- 新玩法面板（挂机分工 / 限时悬赏 / 境界渡劫） ----
panel('挂机分工', () => UI._panels.idleLinesModal());
panel('派遣领队-没有可选人', () => UI._panels.pickIdleLeader('cultivate'));
panel('限时悬赏', () => UI._panels.bountyModal());
panel('境界渡劫', () => UI._panels.realmModal());
panel('招募-三池', () => UI._panels.recruitModal());
panel('招募-概率公示', () => UI._panels.recruitRatesModal());
panel('灯阁权限', () => UI._panels.authorityModal());
Core.addChar('C021');
Core.S.party[1] = 'C021';
Core.addItem('exp_s', 5);
Core.addItem('box_sr', 3);
panel('派遣领队-有人可选', () => UI._panels.pickIdleLeader('gather'));
panel('伴生体兽栏-空', () => UI._panels.beastModal());
Core.addItem('beast_egg', 30);
panel('伴生体兽栏-有兽魂石', () => UI._panels.beastModal());
// V7.2 起养成线（含伴生体）整体搬到「执灯者 → 成长」子页，首页不再摊平所有系统
t('伴生体入口在「执灯者 → 成长」子页', () => {
  const html = UI._panels._screens.growScreen();
  if (html.indexOf('伴生体') < 0) throw new Error('成长页没有伴生体入口');
});
t('首页指向成长子页', () => {
  const html = UI._panels._screens.homeScreen();
  if (html.indexOf('成长') < 0) throw new Error('首页没有指向成长');
});
t('今日卡的悬赏按进度生成（不是写死的名字）', () => {
  const html = UI._panels._screens.homeScreen();
  if (html.indexOf('限时悬赏') < 0) throw new Error('缺悬赏行');
});

// ---- 一级页面全部能渲染，且模板里不许出现 undefined ----
for (const s of ['homeScreen', 'dungeonScreen', 'rosterScreen', 'bagScreen', 'partyScreen', 'charsScreen', 'equipScreen']) {
  t('页面渲染：' + s, () => {
    const html = UI._panels._screens[s]();
    if (typeof html !== 'string' || !html.length) throw new Error('空页面');
    if (html.indexOf('undefined') >= 0) throw new Error('模板出现 undefined');
  });
}
for (const tab of ['bag', 'roster', 'party', 'chars', 'equip', 'home', 'dungeon']) {
  t('一级页签：' + tab, () => {
    UI._setTab(tab);
    const html = byId['view'].innerHTML;
    if (!html || !html.length) throw new Error('空页面');
  });
}
t('旧页签名映射到「执灯者」子页', () => {
  UI._setTab('chars');
  if (UI.tab !== 'roster') throw new Error('chars 没有落到 roster，实际是 ' + UI.tab);
});
t('V8.6：今日卡已撤，每天要做的事都摊在首页上', () => {
  const html = UI._panels._screens.homeScreen();
  ['一键收取', '限时悬赏', '每日任务', '招募伙伴'].forEach(k => {
    if (html.indexOf(k) < 0) throw new Error('首页缺少：' + k);
  });
  if (html.indexOf('open-today') >= 0) throw new Error('「今日」入口还留着');
});
// ---- V8.x：首页改「纯文字」（参考图风格）＋ 新增评级 / 秘术 / 游历 / 血统面板 ----
t('首页不再用大图标卡片（纯文字）', () => {
  const html = UI._panels._screens.homeScreen();
  if (html.indexOf('class="stage"') >= 0) throw new Error('大主视觉块还在');
  if (html.indexOf('stamp-grid') >= 0 || html.indexOf('feat-grid') >= 0) throw new Error('旧宫格还在');
  if (html.indexOf('s-ico') >= 0) throw new Error('入口还在用图标');
});
t('首页入口是纯文字方块菜单', () => {
  const html = UI._panels._screens.homeScreen();
  if (html.indexOf('text-menu') < 0) throw new Error('缺文字菜单');
  if (html.indexOf('tile') < 0) throw new Error('缺文字入口块');
});
t('首页功能入口一屏摊开（今天/养成都能直接找到）', () => {
  const html = UI._panels._screens.homeScreen();
  ['灯阁评级', '秘术阁', '基地建设', '伴生体', '转生天赋', '游历奇遇'].forEach(k => {
    if (html.indexOf(k) < 0) throw new Error('首页缺入口：' + k);
  });
});
t('血统 / 境界不在首页放入口（属于角色卡，避免功能重复）', () => {
  const html = UI._panels._screens.homeScreen();
  ['open-bloodline', 'open-realm', '境界渡劫'].forEach(k => {
    if (html.indexOf(k) >= 0) throw new Error('首页还留着重复入口：' + k);
  });
  if (html.indexOf('血统') < 0) throw new Error('首页应有一句话指引玩家去角色卡里找血统');
  // 角色卡里必须真的能设置（否则就是"入口没了、功能也没了"）
  const pd = UI._panels.protagonistDetail().innerHTML;
  if (pd.indexOf('data-realm-open') < 0) throw new Error('主角卡里缺境界入口');
  // 未选血统 → 选择按钮；已选 → 升级按钮。两者有一个就算有入口
  if (pd.indexOf('🩸') < 0 || (pd.indexOf('data-pbl') < 0 && pd.indexOf('data-pblup') < 0)) {
    throw new Error('主角卡里缺血统设置入口');
  }
});
t('首页主线是一条横条（不再是"主线 + 今日"两枚匾额）', () => {
  const html = UI._panels._screens.homeScreen();
  if (html.indexOf('data-sec="quest"') < 0) throw new Error('缺主线条');
  if (html.indexOf('主线') < 0) throw new Error('缺主线');
  if (html.indexOf('plaque') >= 0) throw new Error('旧匾额样式还在用');
});
t('首页有游历奇遇条', () => {
  const html = UI._panels._screens.homeScreen();
  if (html.indexOf('游历奇遇') < 0) throw new Error('缺游历条');
});
panel('灯阁评级', () => UI._panels.sectModal());
panel('秘术阁', () => UI._panels.kejiModal());
panel('游历奇遇', () => UI._panels.travelModal());
panel('血统（未选）', () => UI._panels.bloodlineModal());
panel('血统（已选）', () => {
  Core.S.player.bloodline = null;
  Core.choosePlayerBloodline('血族');
  return UI._panels.bloodlineModal();
});

t('背包是三池格子制：格子里只写名字数量，末尾一格是「＋」扩容', () => {
  const screen = UI._panels._screens.bagScreen();
  if (screen.indexOf('bg-grid') < 0) throw new Error('背包不是格子制');
  ['item', 'mat', 'equip'].forEach(k => {
    if (screen.indexOf('data-bagview="' + k + '"') < 0) throw new Error('缺分栏：' + k);
  });
  if (screen.indexOf('class="bg-slot add"') < 0) throw new Error('网格末尾缺少「＋」扩容格');
  if (screen.indexOf('货币') >= 0) throw new Error('背包里还留着货币那一块（顶栏已经有「全部货币」了）');
  if (screen.indexOf('炼化台') >= 0) throw new Error('炼化台还留在背包（应该搬到主页养成段）');
  // 道具池那一栏（背包弹窗走的就是它）末尾必须是 data-expand="item"
  const body = UI._panels.bagModal().innerHTML;
  if (body.indexOf('data-expand="item"') < 0) throw new Error('道具池末尾缺少「＋」扩容格');
  if (body.indexOf('＋') < 0) throw new Error('扩容格没有加号');
});
// V9.3：装备页重排——三个主标签铺满在最上、分类与「批量分解」紧跟其下、内容只有格子
t('装备页层次：主标签 → 分类 / 批量分解 → 格子', () => {
  let html;
  try {
    UI._setTab('equip');
    html = byId['view'].innerHTML;
  } finally { UI._setTab('home'); }   // 用完还原，别把"背包默认子页"留给后面的用例
  const iTab = html.indexOf('data-bagview="equip"');
  const iCat = html.indexOf('data-ecat="all"');
  const iSlot = html.indexOf('data-efilter="all"');
  const iBatch = html.indexOf('data-batchon');
  const iGrid = html.indexOf('bg-grid');
  if ([iTab, iCat, iSlot, iBatch, iGrid].some(i => i < 0)) throw new Error('装备页缺件（标签/分类/批量/网格）');
  if (!(iTab < iCat && iCat < iSlot)) throw new Error('分类胶囊没排在主标签正下方');
  if (iBatch > iGrid) throw new Error('「批量分解」还压在内容下面（应该跟分类同层）');
  if (html.indexOf('data-eqpage') < 0) throw new Error('装备页的引导锚点 data-eqpage 丢了');
  if (html.indexOf('list-row') >= 0) throw new Error('装备页还留着"一行一件"的列表');
  // 分类按钮要比主标签小一号：主标签没有 sm，分类有
  if (html.indexOf('pill sm') < 0) throw new Error('分类按钮没有做小（缺 pill sm）');
  if (html.indexOf('tab-cards') < 0) throw new Error('三个主标签不是吸顶的矩形卡片（缺 tab-cards，V9.5.2 改的）');
  if (html.indexOf('tab-card ') < 0) throw new Error('三个主标签缺 tab-card 卡片样式');
});
t('穿在身上的装备不进背包格子、也不算背包格数', () => {
  const S = Core.S;
  const owner = '@player';
  S.equipped[owner] = S.equipped[owner] || {};
  const backup = S.equipped[owner].weapon || null;
  const uid = 'eqWearTest';
  S.equipped[owner].weapon = null;
  S.equips[uid] = D.makeEquip('W01', 'weapon', 'SR', uid, { setType: 'plain' });
  const unworn = Core.bagUsage().eqUsed;
  S.equipped[owner].weapon = uid;
  const worn = Core.bagUsage().eqUsed;
  let inBag;
  try {
    UI._setTab('equip');
    inBag = byId['view'].innerHTML.indexOf('data-eqd="' + uid + '"') >= 0;
  } finally {
    S.equipped[owner].weapon = backup;
    delete S.equips[uid];
    UI._setTab('home');
    UI.render();
  }
  if (worn !== unworn - 1) throw new Error('穿在身上的装备还占着背包格：' + unworn + ' → ' + worn);
  if (inBag) throw new Error('穿在身上的装备还显示在背包格子里');
});
t('批量分解改在格子上勾：批量态下装备格带 data-beq', () => {
  const S = Core.S;
  const uid = 'eqBatchTest';
  S.equips[uid] = D.makeEquip('W01', 'weapon', 'N', uid, { setType: 'plain' });
  UI._setTab('equip');
  UI._panels._setBagBatch(true);
  try {
    UI.render();
    const html = byId['view'].innerHTML;
    if (html.indexOf('data-beq="' + uid + '"') < 0) throw new Error('批量态下装备格子不能勾选');
    if (html.indexOf('data-batchon') >= 0) throw new Error('批量态下还显示着"批量分解"按钮');
    if (html.indexOf('data-bgo') < 0) throw new Error('批量态下缺"分解"确认按钮');
  } finally {
    UI._panels._setBagBatch(false);
    delete S.equips[uid];
    UI._setTab('home');
    UI.render();
  }
});
t('副本带血进场：新一波的血条画的是真实血线，不是满血', () => {
  const eff = Core.effectivePlayerStats();
  const ally = Object.assign({
    name: '测试', kind: 'warrior', faction: null, position: 'front',
    skills: D.PROTAGONIST.skills, skillLv: [1, 1, 1],
  }, eff, { maxHp: 1000, hp: 300 });          // 30% 血进场
  const enemy = window.Dungeon.makeEnemies('W01', 'normal', 1, 'combat');
  UI._panels._startBattle({ title: '带血进场', allies: [ally], enemies: enemy, worldId: 'W01', maxRounds: 3, onEnd: () => ({}) });
  const kids = byId['battle-root'].children;
  const ov = kids[kids.length - 1];
  const front = ov.querySelector('.allies.front').innerHTML;   // 前排那一行
  const foes = ov.querySelector('.enemies').innerHTML;
  if (front.indexOf('width:30%') < 0) throw new Error('血条还是按满血画的（新一波 = 血量被刷新）');
  if (front.indexOf('bar hp low') < 0) throw new Error('低血进场没有进"低血"样式');
  if (front.indexOf('>30%<') < 0) throw new Error('血条下面没有血线数字');
  if (foes.indexOf('width:100%') < 0) throw new Error('满血的敌人也被画成不满血了');
});
t('角色页带排序与搜索', () => {
  const html = UI._panels._screens.charsScreen();
  if (html.indexOf('data-charsort') < 0 || html.indexOf('char-search') < 0) throw new Error('缺排序或搜索');
});
t('悬赏面板写明"过期作废"', () => {
  const html = UI._panels.bountyModal().innerHTML;
  if (html.indexOf('作废') < 0) throw new Error('没写清过期规则');
});


// ---- V7.0 世界观移植：券 / 概率公示 / 灯阁权限 / 阵型 / 顶部状态区 ----
t('首页顶部是【标签】值 文字行（境界/等级/转生）', () => {
  const html = UI._panels._screens.homeScreen();
  if (!/境界/.test(html) || !/等级/.test(html) || !/转生/.test(html)) throw new Error('缺状态行');
  if (!html.includes('text-rows')) throw new Error('缺文字行容器');
  // V9.5.3：整块主角卡都可点进角色界面（data-protag 挂在卡片上，不是挂在某一行）
  {
    const hero = UI._panels._screens.homeScreen();
    const cardAt = hero.indexOf('data-sec="hero"');
    const tagEnd = hero.indexOf('>', cardAt);
    if (cardAt < 0 || hero.slice(cardAt, tagEnd).indexOf('data-protag="1"') < 0) {
      throw new Error('主角卡整块不可点（data-protag 没挂在卡片上）');
    }
  }
});
t('灯阁权限入口在「执灯者 → 成长」子页', () => {
  const html = UI._panels._screens.growScreen();
  if (!html.includes('灯阁权限')) throw new Error('缺入口');
});
t('招募页显示券数量与"有券先用券"', () => {
  Core.addItem('ticket_normal', 3);
  const html = UI._panels.recruitModal().innerHTML;
  if (!html.includes('引灯招募券')) throw new Error('没显示券名');
  if (!html.includes('有券先用券')) throw new Error('没说明扣券规则');
});
t('招募页有概率公示入口', () => {
  const html = UI._panels.recruitModal().innerHTML;
  if (!html.includes('概率公示')) throw new Error('缺公示入口');
});
t('概率公示列出每一档出率', () => {
  const html = UI._panels.recruitRatesModal().innerHTML;
  ['普通招募', '高级招募', '限定招募'].forEach(n => { if (!html.includes(n)) throw new Error('缺 ' + n); });
  if (!html.includes('还差')) throw new Error('缺"还差几抽"');
});
t('灯阁权限面板列出 10 级与当前加成', () => {
  const html = UI._panels.authorityModal().innerHTML;
  if (!/Lv\.[0-9]+ \/ 10/.test(html)) throw new Error('缺等级');
  if (!html.includes('挂机产出')) throw new Error('缺效果说明');
  if (!html.includes('每日扫荡次数')) throw new Error('缺扫荡说明');
});
t('队伍页显示阵型与具名阵列表', () => {
  const html = UI._panels._screens.partyScreen();
  if (!html.includes('阵型')) throw new Error('缺阵型区');
  if (!html.includes('五行归元阵')) throw new Error('缺具名阵');
  // V9.5.8：那句『主角是万能补位』属于过度解释，按父亲大人要求删了；
  // 这里改成断行为：阵型列表在、且带激活条件（不再拿被删的文案当锚点）
  if (!html.includes('fm-row') || !html.includes('五行归元阵')) throw new Error('阵型列表不在');
});
t('境界面板显示大境 × 小阶（跟着当前血统）', () => {
  const html = UI._panels.realmModal().innerHTML;
  const major = D.BLOODLINES[Core.S.player.bloodline].realms[0];
  if (!html.includes(major)) throw new Error('缺当前血统的大境名：' + major);
  if (!html.includes('大圆满')) throw new Error('缺小阶名');
  if (!html.includes('36')) throw new Error('缺总阶数');
});
t('招募券在背包格子里能看见，点进详情有「去招募」', () => {
  Core.addItem('ticket_adv', 2);
  const bag = UI._panels.bagModal().innerHTML;
  if (!bag.includes('圣契招募令')) throw new Error('券不在背包格子里');
  const det = UI._panels.itemDetail('ticket_adv').innerHTML;
  if (!det.includes('去「高级招募」使用')) throw new Error('详情里缺去招募的入口');
});
t('道具详情-招募券', () => UI._panels.itemDetail('ticket_lim'));

// ---- V8.2：胜利结算自动进下一关（5 秒倒计时） ----
t('战斗界面按站位分前后两行（队伍页排的位在战斗里看得见）', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  ['b-row allies back', 'b-row allies front', 'b-line-label'].forEach(k => {
    if (src.indexOf(k) < 0) throw new Error('战斗界面缺站位行：' + k);
  });
  if (src.indexOf("u.position === 'front'") < 0) throw new Error('没有按 position 分行的代码');
  const css = fs.readFileSync('css/style.css', 'utf8');
  if (css.indexOf('.b-line-label') < 0) throw new Error('缺站位行的样式');
});
t('倒计时 8 秒（V9.5：5 秒看掉落偏赶，放宽到 8 秒）', () => { if (UI.AUTO_NEXT_SEC !== 8) throw new Error('不是 8 秒：' + UI.AUTO_NEXT_SEC); });
t('胜利时自动目标＝主按钮（下一关）', () => {
  const acts = [{ label: '↻ 再来一次' }, { label: '› 下一关', primary: true }];
  if (UI._panels.autoNextIndex(true, acts) !== 1) throw new Error('没选中下一关');
});
t('失败时不动（不自动跳）', () => {
  const acts = [{ label: '› 下一关', primary: true }];
  if (UI._panels.autoNextIndex(false, acts) !== -1) throw new Error('失败页不该自动跳');
});
t('没有下一关时不动', () => {
  if (UI._panels.autoNextIndex(true, [{ label: '↻ 再来一次' }]) !== -1) throw new Error('无主按钮时不该自动跳');
});
t('倒计时按钮文案带秒数', () => {
  const html = UI._panels.autoNextBtnHtml('› 下一关（菌毯巢穴 5/12）', 5);
  if (!html.includes('下一关')) throw new Error('缺按钮文字');
  if (!html.includes('5s')) throw new Error('缺秒数');
  if (!html.includes('auto-cd')) throw new Error('缺倒计时样式钩子');
});
t('设置里能关掉自动进下一关', () => {
  const html = UI._panels.settingsModal().innerHTML;
  if (!html.includes('通关结算自动进下一关')) throw new Error('缺设置项');
  if (!html.includes('data-toggle="autoNext"')) throw new Error('缺开关');
});
t('新档默认开启自动进下一关', () => { if (Core.S.settings.autoNext !== true) throw new Error('默认没开'); });

// ---- V8.2：药园 / 斗法台 / 法宝三个面板能正常渲染 ----
t('药园面板能渲染', () => {
  const html = UI._panels.gardenModal().innerHTML;
  if (!html.includes('灵田')) throw new Error('缺灵田');
  if (!html.includes('收获') && !html.includes('收')) throw new Error('缺收获入口');
});
t('药园面板把"花多少 / 收什么"都写出来（不能只写价格）', () => {
  const html = UI._panels.gardenModal().innerHTML;
  // 四块地的产物与稀有掉落都要在界面上看得见，否则玩家不知道种下去能拿到什么
  (D.GARDEN || []).forEach(g => {
    const name = (D.ITEMS[g.out.item] || {}).name || g.out.item;
    if (!html.includes(`${name}×${g.out.n}`)) throw new Error(`没写清「${g.name}」收什么：${name}`);
    if (g.extra) {
      const en = (D.ITEMS[g.extra.item] || {}).name || g.extra.item;
      if (!html.includes(`${Math.round(g.extra.p * 100)}% 出 ${en}`)) throw new Error(`没写清稀有掉落：${en}`);
    }
  });
});
t('斗法台面板能渲染', () => {
  const html = UI._panels.arenaModal().innerHTML;
  if (!html.includes('斗法台')) throw new Error('缺标题');
  if (!html.includes('台')) throw new Error('缺台数');
});
t('法宝面板能渲染', () => {
  const html = UI._panels.fabaoModal().innerHTML;
  if (!html.includes('噬魂珠')) throw new Error('缺法宝');
  if (!html.includes('异界结晶')) throw new Error('缺价格说明');
});
t('首页能进药园/斗法台/法宝', () => {
  const html = UI._panels._screens.homeScreen();
  if (!html.includes('open-garden')) throw new Error('缺药园入口');
  if (!html.includes('open-arena')) throw new Error('缺斗法台入口');
  if (!html.includes('open-fabao')) throw new Error('缺法宝入口');
});

// ---- V8.2：坐骑 / 求签两个面板 ----
t('坐骑面板能渲染', () => {
  const html = UI._panels.mountModal().innerHTML;
  if (!html.includes('坐骑')) throw new Error('缺标题');
  if (!html.includes('铁甲蜥')) throw new Error('缺坐骑');
  if (!html.includes('全队')) throw new Error('缺"全队生效"说明');
});
t('求签面板能渲染', () => {
  const html = UI._panels.signModal().innerHTML;
  if (!html.includes('求签')) throw new Error('缺标题');
  if (!html.includes('大吉')) throw new Error('缺签档');
  if (!html.includes('摇')) throw new Error('缺摇签按钮');
});
t('首页能进坐骑/求签', () => {
  const html = UI._panels._screens.homeScreen();
  if (!html.includes('open-mount')) throw new Error('缺坐骑入口');
  if (!html.includes('open-sign')) throw new Error('缺求签入口');
});
t('成长页把新线也列出来了', () => {
  const html = UI._panels._screens.growScreen();
  if (!html.includes('坐骑')) throw new Error('成长页缺坐骑');
  if (!html.includes('求签')) throw new Error('成长页缺求签');
  if (!html.includes('药园')) throw new Error('成长页缺药园');
});
t('玩法指南收录新章节', () => {
  const html = UI._panels.guideModal().innerHTML;
  if (!html.includes('药园')) throw new Error('指南缺药园');
  if (!html.includes('斗法台')) throw new Error('指南缺斗法台');
  if (!html.includes('法宝')) throw new Error('指南缺法宝');
});
t('指南正文的重点是加粗，不是星号', () => {
  const html = UI._panels.guideModal().innerHTML;
  if (html.includes('**')) throw new Error('指南里还残留 markdown 星号');
});

// ---- V8.3：队伍页（主角可换排 · 成员一览排到阵型前面） ----
t('队伍页：成员一览排在阵型前面', () => {
  const html = UI._panels._screens.partyScreen();
  const iTeam = html.indexOf('成员一览');
  const iForm = html.indexOf('阵型');
  if (iTeam < 0) throw new Error('缺成员一览');
  if (iForm < 0) throw new Error('缺阵型');
  if (iTeam > iForm) throw new Error('成员一览还在阵型后面');
});
t('队伍页：站位可长按换位（不再有单独按钮）', () => {
  const html = UI._panels._screens.partyScreen();
  if (!html.includes('data-protag="1"')) throw new Error('主角那一格缺少标记');
  if (!html.includes('data-pos="0"')) throw new Error('上阵位缺少可抓取标记');
  if (!html.includes('data-pos="4"')) throw new Error('后排应该有 3 格（0/1 前排、2/3/4 后排）');
  if (typeof UI._panels.armLongPress !== 'function') throw new Error('长按换位没接线（armLongPress 不在）');
  if (html.includes('data-prow') || html.includes('data-mrow')) throw new Error('换排按钮应该已经撤掉');
});
t('队伍页：上阵固定前 2 后 3（不再多出一格）', () => {
  Core.newGame();
  Core.addChar('C021'); Core.addChar('C022'); Core.addChar('C023'); Core.addChar('C024');
  Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024'];
  const html = UI._panels._screens.partyScreen();
  const front = (html.match(/data-row="front"/g) || []).length;
  if (front !== 1) throw new Error('前排标题数量不对');
  // 前排 2 格、后排 3 格：按 data-pos 数一遍（主角也算一格）
  const slots = (html.match(/data-pos="[0-4]"/g) || []).length;
  if (slots !== 5) throw new Error('上阵格子数不对：' + slots);
  if (!html.includes('2 格 · 受击概率更高') || !html.includes('3 格 · 相对安全')) throw new Error('缺前后排格数说明');
  // 主角站在前排时，前排是「主角 + 1 名队友」，不会变成 3 个
  const frontRow = html.slice(html.indexOf('data-row="front"'), html.indexOf('data-row="back"'));
  const frontSlots = (frontRow.match(/data-pos="[0-4]"/g) || []).length;
  if (frontSlots !== 2) throw new Error('前排格子数不是 2：' + frontSlots);
  const backRow = html.slice(html.indexOf('data-row="back"'));
  const backSlots = (backRow.match(/data-pos="[0-4]"/g) || []).length;
  if (backSlots !== 3) throw new Error('后排格子数不是 3：' + backSlots);
});
t('队伍页：前后排分开显示', () => {
  const html = UI._panels._screens.partyScreen();
  if (!html.includes('pos-row-label')) throw new Error('缺前后排分组标题');
  if (!html.includes('受击概率更高')) throw new Error('缺前排说明');
});
t('战斗编队：主角站位跟着玩家选择走', () => {
  Core.addChar('C021');
  Core.S.party = ['@player', 'C021', null, null, null];
  Core.setPlayerRow('back');
  const allies = UI._panels.buildAllies();
  const me = allies.find(a => a.charId === '@player');
  if (!me) throw new Error('主角不在编队里');
  if (me.position !== 'back') throw new Error('主角没站到后排：' + me.position);
  Core.setPlayerRow('front');
  const me2 = UI._panels.buildAllies().find(a => a.charId === '@player');
  if (me2.position !== 'front') throw new Error('主角没站回前排：' + me2.position);
});
t('战斗编队：满编 5 人（含主角）都进战斗，不重不漏', () => {
  Core.addChar('C022'); Core.addChar('C023'); Core.addChar('C024');
  Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024'];
  const allies = UI._panels.buildAllies();
  if (allies.length !== 5) throw new Error('编队人数不对：' + allies.length);
  if (new Set(allies.map(a => a.charId)).size !== 5) throw new Error('编队里有人重复');
  const me = allies.find(a => a.charId === '@player');
  if (!me || me.name !== Core.charName('@player')) throw new Error('主角没进编队或名字不对');
});
t('战斗编队：后排队友标记为 back', () => {
  Core.addChar('C022'); Core.addChar('C023');
  Core.S.party = ['@player', 'C021', 'C022', 'C023', null];
  const allies = UI._panels.buildAllies();
  const c23 = allies.find(a => a.charId === 'C023');
  if (!c23 || c23.position !== 'back') throw new Error('第 4 格应当在后排');
  const c21 = allies.find(a => a.charId === 'C021');
  if (!c21 || c21.position !== 'front') throw new Error('第 2 格应当在前排');
});

// ---- V8.3：长按拖拽换位的交互路径 ----
// DOM 桩的 addEventListener 是空函数，所以这里自己造一个能收集监听器的假元素，
// 并把 setTimeout 换成"把回调收起来、由测试手动触发"，好把 420ms 的长按计时器握在手里。
function pressHarness() {
  const handlers = {}, timers = [], cleared = [];
  const el = {
    addEventListener(n, fn) { (handlers[n] = handlers[n] || []).push(fn); },
    fire(n, ev) { (handlers[n] || []).forEach(fn => fn(ev || {})); },
  };
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  global.clearTimeout = (id) => { cleared.push(id); };
  return {
    el, timers, cleared,
    down(ev) { el.fire('pointerdown', ev); return timers[timers.length - 1]; },   // 返回 420ms 后的长按回调
    up() { el.fire('pointerup'); },
    restore() { global.setTimeout = realSet; global.clearTimeout = realClear; },
  };
}
// 每个用例收尾：把手里的格子放回去，并吞掉长按留下的那一下"收尾点击"（清 suppressClick）
function settleGrab() { UI._panels.cancelGrab(true); UI._panels.clickPosition('9'); }
t('站位：长按抓起 → 手上有东西 + 出现"已抓起"提示条', () => {
  UI._setTab('party');
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '0');
    const fire = h.down({ clientX: 10, clientY: 10 });
    if (typeof fire !== 'function') throw new Error('按下之后没有排长按计时器');
    fire();                                     // 420ms 到点 = 抓起
    const g = UI._panels.grabState();
    if (g.grabbed !== '0') throw new Error('长按之后没抓起：' + g.grabbed);
    if (!g.dragging) throw new Error('没有进入拖动状态');
    if (!g.suppress) throw new Error('长按之后没抑制随后那一下点击（会立刻把抓起状态点掉）');
    if (!UI._panels._screens.partyScreen().includes('drag-bar')) throw new Error('没显示"已抓起"提示条');
    if (!UI._panels._screens.partyScreen().includes('放这里')) throw new Error('空位没有出现"放这里"的落点提示');
  } finally {
    h.restore();
    settleGrab();                         // 放回原位 + 清掉模块里的抓起状态
  }
  if (UI._panels.grabState().grabbed !== null) throw new Error('测试收尾没清掉抓起状态');
});
t('站位：长按之后松开手指会取消计时（不会误抓）', () => {
  UI._setTab('party');
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '1');
    const id = h.down({ clientX: 10, clientY: 10 }) && h.timers.length;   // 计时器编号
    h.up();
    if (!h.cleared.includes(id)) throw new Error('抬起手指没有取消长按计时器');
    if (UI._panels.grabState().grabbed !== null) throw new Error('没到 420ms 就抓起来了');
  } finally { h.restore(); }
});
t('站位：抓起之后拖到另一格松手＝直接换位', () => {
  Core.addChar('C024');
  Core.setPlayerRow('front');
  Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024'];
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '1');
    h.down({ clientX: 10, clientY: 10 })();     // 抓起第 2 位
    if (UI._panels.grabState().grabbed !== '1') throw new Error('没抓起第 2 位');
    const r = UI._panels.dropOn('4');           // 拖到第 5 格松手
    if (!r || !r.ok) throw new Error('拖动换位失败：' + (r && r.msg));
    if (Core.S.party[1] !== 'C024' || Core.S.party[4] !== 'C021') {
      throw new Error('站位没换过去：' + Core.S.party.join(','));
    }
    if (UI._panels.grabState().grabbed !== null) throw new Error('换完位还留着"抓起"状态');
  } finally { h.restore(); settleGrab(); }
});
t('站位：拖回自己身上不换位，仍保持抓起', () => {
  Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024'];
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '2');
    h.down({ clientX: 10, clientY: 10 })();     // 抓起第 3 位
    const before = Core.S.party.slice();
    const r = UI._panels.dropOn('2');           // 拖回自己身上松手
    if (r !== null) throw new Error('拖回自己身上不该产生换位');
    if (Core.S.party.join(',') !== before.join(',')) throw new Error('队伍被改动了');
    if (UI._panels.grabState().grabbed !== '2') throw new Error('拖回自己身上不该把抓起状态清掉');
    settleGrab();
  } finally { h.restore(); }
});
t('站位：按住拖到另一格，松手就落在那里（走真实指针事件）', () => {
  Core.addChar('C024');
  Core.setPlayerRow('front');
  Core.S.party = ['@player', 'C021', 'C022', 'C023', 'C024'];
  const h = pressHarness();
  let under = null;
  global.document.elementFromPoint = () => under;
  try {
    UI._panels.armLongPress(h.el, '0');
    h.down({ clientX: 10, clientY: 10 })();     // 长按抓起第 1 位
    under = { dataset: { pos: '4' }, closest: () => under };   // 指针现在压在第 5 格上
    global.fireWindow('pointermove', { clientX: 50, clientY: 120, preventDefault() {} });
    if (UI._panels.grabState().hover !== '4') throw new Error('拖动中没有识别到落点：' + UI._panels.grabState().hover);
    global.fireWindow('pointerup', { clientX: 50, clientY: 120 });
    if (Core.S.party[0] !== 'C024' || Core.S.party[4] !== '@player') {
      throw new Error('拖放没落下去：' + Core.S.party.join(','));
    }
    if (UI._panels.grabState().grabbed !== null) throw new Error('放下之后手里还留着东西');
  } finally {
    global.document.elementFromPoint = () => null;
    h.restore();
    settleGrab();
  }
});
t('站位：长按之后紧接着那一下点击会被吞掉', () => {
  UI._setTab('party');
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '0');
    h.down({ clientX: 10, clientY: 10 })();
    const before = Core.S.party.slice();
    const r = UI._panels.clickPosition('1');    // 这一下是长按的收尾，不算点击
    if (r !== null) throw new Error('长按后的第一下点击不该执行换位');
    if (Core.S.party.join(',') !== before.join(',')) throw new Error('队伍被误改了');
    if (UI._panels.grabState().grabbed !== '0') throw new Error('抓起状态被误清');
  } finally { h.restore(); settleGrab(); }
});
t('站位：Esc / 取消按钮能把手里的格子放回去', () => {
  UI._setTab('party');
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '3');
    h.down({ clientX: 10, clientY: 10 })();
    if (!UI._panels.cancelGrab(true)) throw new Error('取消没有生效');
    if (UI._panels.grabState().grabbed !== null) throw new Error('取消之后还留着抓起状态');
  } finally { h.restore(); UI._panels.clickPosition('9'); }
});

// ---- V8.3.1：手机端图标与热区（关闭 × / 返回 ‹ 都是 CSS 画的，不用字符） ----
t('图标按钮里的图形是矢量 SVG，不是 ✕ / ‹ 字符', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  if (!css.includes('.close-x svg path')) throw new Error('关闭按钮没有 SVG 的 X');
  if (!css.includes('.back-x svg')) throw new Error('返回按钮没有 SVG 的箭头');
  if (!/\.close-x[^{]*\{[^}]*appearance:\s*none/.test(css)) throw new Error('关闭按钮没有清掉系统默认外观');
  const w = UI.modal('测试', '<div>x</div>', { center: true });
  const page = UI.modal('测试页', '<div>x</div>');
  if (!w.innerHTML.includes('<button class="close-x"') || !w.innerHTML.includes('<svg')) throw new Error('居中弹窗的关闭按钮结构不对');
  if (!page.innerHTML.includes('<svg')) throw new Error('返回按钮没有 SVG');
  if (w.innerHTML.includes('✕')) throw new Error('关闭按钮还在用 ✕ 字符');
  if (page.innerHTML.includes('‹')) throw new Error('返回按钮还在用 ‹ 字符');
  UI.closeModal(w); UI.closeModal(page);
});
t('图标坐标是对称的（X 与箭头都以 12,12 为中心）', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  const close = src.match(/ICON_CLOSE = '([^']+)'/);
  const back = src.match(/ICON_BACK = '([^']+)'/);
  if (!close || !back) throw new Error('图标常量缺了');
  if (!close[1].includes('M7 7 17 17') || !close[1].includes('17 7 7 17')) throw new Error('X 的两个笔画不对称');
  if (!back[1].includes('M15.5 5 8.5 12l7 7')) throw new Error('返回箭头不是以 12 为中心');
});
t('移动端热区：图标按钮都补到 ≥44px', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  // 视觉尺寸可以小，但必须用伪元素把点击区域补到 44px，否则手机上很难点
  // V8.6：.tb-icon 已随顶栏图标一起去掉；.cur-chip 的热区从 -9px 收到 -2px
  //（补 9px 会盖到上一行名字和下面正文，手机上会点错）
  const pairs = [['.sheet .close-x::after', '-5px'], ['.back-x::after', '-2px'], ['.cur-chip::after', '-2px'], ['.drag-bar .btn::after', '-2px']];
  pairs.forEach(([sel, inset]) => {
    if (!css.includes(sel)) throw new Error('缺热区补齐规则：' + sel);
    const block = css.slice(css.indexOf(sel));
    if (!block.slice(0, 120).includes(inset)) throw new Error(sel + ' 的 inset 不对');
  });
});
t('移动端全局兜底：按钮去系统外观 + 去掉 300ms 点击延迟', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  if (!css.includes('touch-action: manipulation')) throw new Error('缺 touch-action: manipulation');
  if (!/button,\s*input,\s*select,\s*textarea\s*\{[^}]*appearance:\s*none/.test(css)) throw new Error('缺按钮外观重置');
});

// ---- V8.6：首页重排（主角 → 养成 → 游历 → 挂机 → 设置）· 去重 · 手机优先 ----
t('首页五段顺序：主角 → 主线 → 养成 → 游历 → 挂机 → 设置', () => {
  const html = UI._panels._screens.homeScreen();
  const order = ['data-sec="hero"', 'data-sec="quest"', 'data-sec="grow"', 'data-sec="travel"', 'data-sec="idle"', 'data-sec="settings"'];
  let last = -1;
  order.forEach(sec => {
    const i = html.indexOf(sec);
    if (i < 0) throw new Error('首页缺这一段：' + sec);
    if (i < last) throw new Error('这一段的位置不对（顺序错了）：' + sec);
    last = i;
  });
});
t('首页同一个功能只出现一次（挂机分工不再两处重复）', () => {
  const html = UI._panels._screens.homeScreen();
  const acts = [...html.matchAll(/data-act="([a-z-]+)"/g)].map(m => m[1]);
  const dup = acts.filter((a, i) => acts.indexOf(a) !== i);
  if (dup.length) throw new Error('首页有重复入口：' + [...new Set(dup)].join(', '));
  if (acts.indexOf('open-idlelines') < 0) throw new Error('缺"派人分工"入口');
  if ((html.match(/data-act="open-idlelines"/g) || []).length !== 1) throw new Error('"派人分工"出现了不止一次');
});
t('角色卡 / 主角卡：每个系统都是独立卡片（不再挤成一长列小标题）', () => {
  const ch = UI._panels.charDetail('C021').innerHTML;
  ['📊 属性面板', '🎯 六维属性', '⭐ 星级', '⚡ 技能', '🩸', '🗡 装备'].forEach(k => {
    if (ch.indexOf(k) < 0) throw new Error('角色卡缺独立卡片：' + k);
  });
  if (ch.indexOf('section-title') >= 0) throw new Error('角色卡还在用 section-title 分节（应该一卡一段）');
  if (ch.indexOf('stat-grid') < 0) throw new Error('角色卡缺属性数值面板');
  if (ch.indexOf('data-lvup') < 0 || ch.indexOf('data-starup') < 0 || ch.indexOf('data-skillup') < 0 || ch.indexOf('data-blup') < 0 || ch.indexOf('data-eqslot') < 0) {
    throw new Error('拆卡片时把按钮丢了');
  }
  const pd = UI._panels.protagonistDetail().innerHTML;
  ['📊 属性面板', '🌌 境界', '🎯 六维属性', '⚡', '🩸', '🗡 装备'].forEach(k => {
    if (pd.indexOf(k) < 0) throw new Error('主角卡缺独立卡片：' + k);
  });
  if (pd.indexOf('section-title') >= 0) throw new Error('主角卡还在用 section-title 分节');
  if (pd.indexOf('stat-grid') < 0) throw new Error('主角卡缺属性数值面板');
  ['data-attr', 'data-pskill', 'data-attrreset', 'data-pskillreset', 'data-peqslot', 'data-realm-open'].forEach(a => {
    if (pd.indexOf(a) < 0) throw new Error('拆卡片时把按钮丢了：' + a);
  });
  const cards = (pd.match(/class="card"/g) || []).length;
  if (cards < 8) throw new Error('主角卡的独立卡片数量不对：' + cards);
});
t('角色卡顺序：基础信息+等级 → 六维 → 技能 → 装备 → 血统 → 境界 → 属性面板', () => {
  const pd = UI._panels.protagonistDetail().innerHTML;
  // 「等级」不再是独立卡片，并入头像那张基础信息卡（进度条 + 说明都在这张里）
  if (pd.indexOf('📈 等级') >= 0) throw new Error('主角卡还留着独立的「等级」卡片');
  if (pd.indexOf('EXP ') < 0) throw new Error('基础信息卡里没有等级/经验');
  const order = ['🎯 六维属性', '⚡', '🗡 装备', '🩸 血统', '🌌 境界', '📊 属性面板'];
  let prev = -1;
  order.forEach(k => {
    const i = pd.indexOf(k);
    if (i < 0) throw new Error('主角卡缺卡片：' + k);
    if (i < prev) throw new Error('主角卡顺序不对：' + k + ' 应该排在更后面');
    prev = i;
  });
  const ch = UI._panels.charDetail('C021').innerHTML;
  if (ch.indexOf('📈 等级') >= 0) throw new Error('角色卡还留着独立的「等级」卡片');
  let prevC = -1;
  ['⭐ 星级', '🎯 六维属性', '⚡ 技能', '🗡 装备', '🩸', '📊 属性面板'].forEach(k => {
    const i = ch.indexOf(k);
    if (i < 0) throw new Error('角色卡缺卡片：' + k);
    if (i < prevC) throw new Error('角色卡顺序不对：' + k);
    prevC = i;
  });
});
t('洗点并进六维 / 技能两张卡（不再单开一张「洗点」卡）', () => {
  const pd = UI._panels.protagonistDetail().innerHTML;
  if (pd.indexOf('↺ 洗点') >= 0) throw new Error('「洗点」还单开着一张卡');
  const iAttrCard = pd.indexOf('🎯 六维属性');
  const iSkillCard = pd.indexOf('可用技能点');
  const iResetA = pd.indexOf('data-attrreset');
  const iResetS = pd.indexOf('data-pskillreset');
  const iEquip = pd.indexOf('🗡 装备');
  if (!(iAttrCard < iResetA && iResetA < iSkillCard)) throw new Error('六维重置按钮不在六维卡里');
  if (!(iSkillCard < iResetS && iResetS < iEquip)) throw new Error('技能重置按钮不在技能卡里');
  if ((pd.match(/data-attrreset/g) || []).length !== 1) throw new Error('六维重置按钮应该只有 1 个');
  if ((pd.match(/data-pskillreset/g) || []).length !== 1) throw new Error('技能重置按钮应该只有 1 个');
});
t('装备改成 6 个方块：主角与伙伴同一套，不再一行一件', () => {
  // 临时给两边各穿一件武器（直接写状态，避开随机掉落 / 背包上限），验完原样还原
  const owners = ['C021', '@player'];
  const backup = owners.map(o => ({ o, weapon: (Core.S.equipped[o] || {}).weapon || null, uids: [] }));
  backup.forEach(b => {
    const uid = 'eqTest_' + (b.o === '@player' ? 'p' : b.o) + '_weapon';
    Core.S.equips[uid] = D.makeEquip('W01', 'weapon', 'SR', uid, { setType: 'plain' });
    if (!Core.S.equipped[b.o]) Core.S.equipped[b.o] = {};
    Core.S.equipped[b.o].weapon = uid;
    b.uids.push(uid);
  });
  let cases;
  try {
    cases = [['伙伴', UI._panels.charDetail('C021').innerHTML], ['主角', UI._panels.protagonistDetail().innerHTML]];
  } finally {
    backup.forEach(b => { b.uids.forEach(u => { Core.S.equipped[b.o].weapon = b.weapon; delete Core.S.equips[u]; }); });
    UI.render();
  }
  cases.forEach(([who, html]) => {
    if (html.indexOf('eq-grid') < 0) throw new Error(who + '的装备还是老的行列表（缺 eq-grid）');
    const tiles = (html.match(/class="eq-tile/g) || []).length;
    if (tiles !== 6) throw new Error(who + '的装备方块数量不对：' + tiles + '（应为 6）');
    // 装备区（从"🗡 装备"标题往后）不许再出现 list-row
    const iEq = html.indexOf('🗡 装备');
    if (iEq < 0) throw new Error(who + '的装备卡片结构不对');
    if (html.slice(iEq).indexOf('list-row') >= 0) throw new Error(who + '的装备区里还混着 list-row');
    if (html.indexOf('点一行换装') >= 0) throw new Error(who + '的文案还写着"点一行换装"');
  });
  const ch = cases[0][1], pd = cases[1][1];
  if (ch.indexOf('data-eqslot') < 0 || pd.indexOf('data-peqslot') < 0) throw new Error('换装热区丢了');
  if (ch.indexOf('data-unequip') < 0 || pd.indexOf('data-punequip') < 0) throw new Error('卸下按钮丢了');
});
t('游历段只放游历奇遇；悬赏 / 每日 / 成就 / 求签 / 招募 / 兑换 都在「养成」段', () => {
  const html = UI._panels._screens.homeScreen();
  const iGrow = html.indexOf('data-sec="grow"');
  const iTravel = html.indexOf('data-sec="travel"');
  if (iGrow < 0 || iTravel < 0) throw new Error('缺养成段或游历段');
  if (iGrow > iTravel) throw new Error('养成段排在游历段后面了');
  ['限时悬赏', '每日任务', '成就', '求签', '招募伙伴', '兑换大厅', '炼化台'].forEach(k => {
    const i = html.indexOf(k);
    if (i < 0) throw new Error('首页缺入口：' + k);
    if (i > iTravel) throw new Error(k + ' 被放进「游历」段了（应该收在「养成」段的日常里）');
  });
  const travelSeg = html.slice(iTravel, html.indexOf('data-sec="idle"'));
  if (travelSeg.indexOf('text-menu') >= 0) throw new Error('「游历」段不该再铺宫格，只留游历奇遇那一条');
  if (travelSeg.indexOf('游历奇遇') < 0) throw new Error('「游历」段缺游历奇遇条');
});
t('顶栏不再重复放"设置 / 指南"图标（首页最后一段是唯一入口）', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  if (html.includes('tb-guide') || html.includes('tb-settings')) throw new Error('顶栏还有设置 / 指南按钮');
  const home = UI._panels._screens.homeScreen();
  ['open-guide', 'open-curdoc', 'open-settings'].forEach(a => {
    if ((home.match(new RegExp('data-act="' + a + '"', 'g')) || []).length !== 1) throw new Error('首页缺唯一入口：' + a);
  });
});
t('主角能洗点：六维 + 技能都能退回点数', () => {
  const html = UI._panels.protagonistDetail().innerHTML;
  if (html.indexOf('data-attrreset') < 0) throw new Error('缺六维洗点按钮');
  if (html.indexOf('data-pskillreset') < 0) throw new Error('缺技能重置按钮');
  // 按钮还在原位（六维 / 技能卡里）；V9.5.5 起那两句"怎么重置"的说明按父亲大人要求删掉了，
  // 所以这里改成断结构：两张卡里各有一个可用的重置按钮
  const resetBtns = (html.match(/↺ 重置/g) || []).length;
  if (resetBtns < 2) throw new Error('六维/技能卡里的重置按钮不齐（' + resetBtns + ' 个）');
});
t('长按抓起不弹提示框，也不再提 Esc（手机没有键盘）', () => {
  const ui = fs.readFileSync('js/ui.js', 'utf8');
  const data = fs.readFileSync('js/data.js', 'utf8');
  if (ui.includes('已抓起，拖到别的站位')) throw new Error('长按抓起还在弹 toast');
  // 只查"给玩家看的文案"：toast 里、以及指南正文里都不许出现 Esc 这类电脑说法
  if (/toast\([^)]*Esc/.test(ui)) throw new Error('还有 toast 在提示 Esc');
  if (data.includes('按 Esc') || data.includes('Esc 取消')) throw new Error('指南里还在说"按 Esc 取消"');
  if (ui.includes('用鼠标不方便')) throw new Error('还在写"鼠标"');
});
t('手机适配：有窄屏 / 超窄屏 / 横屏矮屏三档断点', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  if (!css.includes('@media (max-width: 375px)')) throw new Error('缺窄屏断点');
  if (!css.includes('@media (max-width: 340px)')) throw new Error('缺超窄屏断点（宫格改两列）');
  if (!css.includes('@media (max-height: 460px)')) throw new Error('缺横屏矮屏断点');
});
t('文字不出格：卡片与关键文字行都有断行 / 省略兜底', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  if (!/\.card,\s*\.panel\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css)) throw new Error('卡片没有断词兜底');
  ['.text-rows .row .rv', '.kv > span:last-child', '.pslot .pname', '.idle-line .il-r'].forEach(sel => {
    const i = css.indexOf(sel);
    if (i < 0) throw new Error('缺规则：' + sel);
    if (!css.slice(i, i + 220).includes('text-overflow: ellipsis')) throw new Error(sel + ' 没有省略号兜底');
  });
  if (!css.includes('flex-wrap: wrap')) throw new Error('按钮行没有换行兜底');
});
t('正文上边距跟着顶栏实际高度走（系统字号调大也不顶进顶栏）', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  if (!css.includes('calc(var(--topbar-h, 92px)')) throw new Error('#view 上边距还是写死的');
  const ui = fs.readFileSync('js/ui.js', 'utf8');
  if (!ui.includes('--topbar-h')) throw new Error('没有量顶栏高度写进 --topbar-h');
  if (!ui.includes('visualViewport')) throw new Error('没有处理键盘遮住弹窗的问题');
});

// ---- 装机（PWA）：手机能加到主屏、断网能玩，且资源都带版本号 ----
t('index.html 引用的资源都带版本号（否则手机会一直用旧缓存）', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
  if (refs.length < 7) throw new Error('资源引用数量不对：' + refs.length);
  refs.forEach(u => { if (!u.includes('?v=')) throw new Error('这个资源没带版本号：' + u); });
});
t('index.html 挂了 manifest 与主屏图标', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  if (!html.includes('rel="manifest"')) throw new Error('缺 manifest');
  if (!html.includes('rel="apple-touch-icon"')) throw new Error('缺 iOS 主屏图标');
  if (!html.includes('rel="icon"')) throw new Error('缺 favicon');
  if (!html.includes('apple-mobile-web-app-title')) throw new Error('缺 iOS 主屏名称');
  if (!html.includes('serviceWorker')) throw new Error('没有注册 Service Worker');
});
t('manifest 合法且字段齐全', () => {
  const m = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  if (m.name !== '残域' || !m.short_name) throw new Error('名字不对');
  if (m.display !== 'standalone') throw new Error('不是独立窗口（加到主屏会带上浏览器地址栏）');
  if (!m.start_url || !m.scope) throw new Error('缺 start_url / scope');
  if (!Array.isArray(m.icons) || m.icons.length < 2) throw new Error('图标不够');
  m.icons.forEach(i => { if (!fs.existsSync(i.src)) throw new Error('图标文件不存在：' + i.src); });
  if (!fs.existsSync('icons/icon-180.png')) throw new Error('缺 iOS 用的 180 图标');
});
t('Service Worker 的预缓存清单＝index.html 真正引用的文件', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const sw = fs.readFileSync('sw.js', 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map(m => m[1]);
  // sw.js 里是 './路径?v=' + V 拼出来的，所以按同样的写法核对
  refs.forEach(u => {
    const path = u.split('?')[0];
    if (!sw.includes(`'./${path}?v='`)) throw new Error('SW 没缓存这个文件：' + path);
  });
  if (!sw.includes('./index.html')) throw new Error('SW 没缓存首页');
  if (!sw.includes("self.addEventListener('fetch'")) throw new Error('SW 没有 fetch 处理（断网打不开）');
  if (!sw.includes('skipWaiting')) throw new Error('SW 不会自动接管新版本');
});
t('sw.js 的版本号与 index.html 的资源版本号一致', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const sw = fs.readFileSync('sw.js', 'utf8');
  const htmlV = (html.match(/\?v=([\d.]+)/) || [])[1];
  const swV = (sw.match(/const V = '([\d.]+)'/) || [])[1];
  if (!htmlV || htmlV !== swV) throw new Error(`版本号不一致：index=${htmlV} sw=${swV}`);
});
t('设置页显示的版本号也跟着一起走（三处同源）', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const ui = fs.readFileSync('js/ui.js', 'utf8');
  const htmlV = (html.match(/\?v=([\d.]+)/) || [])[1];
  // V9.5 起版本号收成一处常量（设置页与 GM 门禁提示共用），两种写法都认：
  // 常量形式要求 data-ver 里真的引用了这个常量，防着"改了常量但设置页写死老版本号"
  const constV = (ui.match(/const GAME_VER = '([\d.]+)'/) || [])[1];
  const shown = (ui.match(/data-ver>残域 V([\d.]+)</) || [])[1]
    || (ui.includes('data-ver>残域 V${GAME_VER}<') ? constV : null);
  if (!shown) throw new Error('设置页没有版本号');
  if (!constV) throw new Error('ui.js 里没有 GAME_VER 常量（版本号要收成一处）');
  if (constV !== htmlV) throw new Error(`GAME_VER 写的是 V${constV}，资源版本是 V${htmlV}`);
  if (shown !== htmlV) throw new Error(`设置页写的是 V${shown}，资源版本是 V${htmlV}`);
});

/* ==================================================================
   V9.5 回归（界面侧）：阵型加成漏主角 / 药剂复活阵亡 / 抓起后吞点击 /
   装备筛选补空格 / 待领箱入口 / GM 门禁
   ================================================================== */

t('主角也吃阵型加成（以前只有招募角色吃得到，队伍页却照写"攻击+X%"）', () => {
  Core.newGame();
  Core.setPlayerName('阵型');
  // 找两个同阵营的伙伴（配合主角的万能补位，直接凑出三才阵：攻击+6%、生命+6%）
  const byFac = {};
  D.characters.filter(c => !c.hidden).forEach(c => { (byFac[c.faction] = byFac[c.faction] || []).push(c.id); });
  const pair = Object.values(byFac).find(list => list.length >= 2);
  if (!pair) throw new Error('找不到同阵营的两名伙伴');
  Core.addChar(pair[0]); Core.addChar(pair[1]);
  Core.S.party = ['@player', pair[0], pair[1], null, null];
  const fb = Core.factionBuffs(Core.S.party);
  if (!(fb.atkPct > 0)) throw new Error('这组队伍没成阵，用例前提不成立');
  const allies = UI._panels.buildAllies({}, {});
  const st = Core.effectivePlayerStats();
  const me = allies.find(u => u.charId === '@player');
  if (!me) throw new Error('主角没上阵');
  if (!(me.atk > st.atk)) throw new Error(`主角攻击没吃到阵型加成：${me.atk} vs ${st.atk}`);
  if (!(me.maxHp > st.hp)) throw new Error(`主角生命没吃到阵型加成：${me.maxHp} vs ${st.hp}`);
  // 招募角色那支一直是对的，顺带钉住它，别改坏
  const mate = allies.find(u => u.charId === pair[0]);
  const mateSt = Core.effectiveStats(pair[0]);
  if (!(mate.atk > mateSt.atk)) throw new Error('招募角色的阵型加成反而不见了');
});

t('药剂不复活阵亡成员（星级评价里的"无人阵亡"才有意义）', () => {
  const r = UI._panels.applyPotionHp({ '@player': 0, C021: 0.4, C022: 1 }, 0.2);
  if (r.hpPct['@player'] !== 0) throw new Error('阵亡成员被药剂复活了');
  if (Math.abs(r.hpPct.C021 - 0.6) > 1e-9) throw new Error('活着的成员没回血');
  if (r.hpPct.C022 !== 1) throw new Error('满血成员被治过头');
  if (r.down !== 1) throw new Error('没有回报"有几名成员已阵亡"');
});

t('最后一波不再给按药剂（战斗是一次算完的，喝了纯白扣）', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  if (src.indexOf('收官战 · 药剂要到下一关才生效') < 0) throw new Error('最后一波缺"不给喝药"的说明');
  const i = src.indexOf('function paintPotions');
  if (i < 0) throw new Error('找不到 paintPotions');
  const seg = src.slice(i, i + 900);
  const j = seg.indexOf('if (lastWave)');
  if (j < 0 || seg.slice(j, j + 220).indexOf('return') < 0) throw new Error('最后一波没有提前返回（还能按药剂）');
});

t('抓起之后立刻点别的格子不会被吞掉（新手势＝清掉上一次的"吞点击"）', () => {
  UI._setTab('party');
  const h = pressHarness();
  try {
    UI._panels.armLongPress(h.el, '0');
    const fire = h.down({ clientX: 10, clientY: 10 });
    fire();                                            // 长按到点：抓起
    if (!UI._panels.grabState().suppress) throw new Error('长按没有抑制紧接着的那一下点击');
    h.down({ clientX: 20, clientY: 20 });              // 玩家又按了一下（新手势）
    if (UI._panels.grabState().suppress) throw new Error('新手势还背着上一次的"吞点击"，会表现为点了没反应');
  } finally {
    h.restore();
    settleGrab();
  }
});

t('待领箱：背包满时的奖励能在背包页领回', () => {
  Core.newGame();
  Core.S.items = {};
  Core.S.bag.itemCap = 1;
  Core.S.items.ticket_normal = 1;                      // 占满唯一的道具格
  Core.applyRewardObj({ item: 'heal_s' });
  const html = UI._panels._screens.bagScreen();
  if (html.indexOf('待领箱') < 0) throw new Error('背包页没有待领箱入口');
  if (html.indexOf('data-stashclaim') < 0) throw new Error('待领箱缺"全部领回"按钮');
  Core.S.bag.itemCap = 10;
  const r = Core.claimStash();
  if (!r.ok || Core.stashCount() !== 0) throw new Error('扩容后领回失败');
  if (UI._panels._screens.bagScreen().indexOf('待领箱') >= 0) throw new Error('领回之后待领箱还在页面上');
});

t('装备页筛选后不再补一屏空格子（否则看着像筛选没生效）', () => {
  Core.newGame();
  UI._panels._setEquipFilter('all', 'all');
  Core.grantEquip('W05', 'SR', 'weapon');
  Core.grantEquip('W05', 'SR', 'armor');
  Core.grantEquip('W05', 'SR', 'weapon');
  const all = UI._panels._screens.equipScreen();
  const cap = Core.S.bag.eqCap;
  const slotsAll = (all.match(/class="bg-slot/g) || []).length;
  if (slotsAll < cap) throw new Error('未筛选时应当把格子补满到容量：' + slotsAll);
  UI._panels._setEquipFilter('weapon', 'all');
  const one = UI._panels._screens.equipScreen();
  const slotsOne = (one.match(/class="bg-slot/g) || []).length;
  if (slotsOne !== 3) throw new Error(`筛选"武器"应只剩 2 件 + 1 个扩容格，实际 ${slotsOne} 个`);
  UI._panels._setEquipFilter('all', 'all');            // 还原，别影响后面的用例
});

t('GM 面板在线上要带 ?gm=1 才认（不再跟正式包一起裸奔）', () => {
  const src = fs.readFileSync('js/ui.js', 'utf8');
  const i = src.indexOf('function gmAllowed');
  if (i < 0) throw new Error('缺 GM 门禁函数');
  const seg = src.slice(i, i + 500);
  if (seg.indexOf('gm=1') < 0) throw new Error('线上没有要求 ?gm=1');
  if (seg.indexOf('localhost') < 0) throw new Error('本地开发没有被放行');
  if (src.indexOf('if (!gmAllowed())') < 0) throw new Error('连点版本号那条路径没有走门禁');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
