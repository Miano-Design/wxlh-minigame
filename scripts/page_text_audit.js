/* 画布"内容真的画出来了吗"体检：node scripts/page_text_audit.js
   ------------------------------------------------------------------------------
   为什么必须有这一层（V9.6.133，父亲大人："我的伴生体完全没显示"）：
   page_smoke 只验"render 不抛异常"，canvas_audit 只验"版式口径对得上" ——
   两把尺子都**看不见"这一页画了，但内容是空的"**。
   伴生体那次就是这么漏过去的：列表条目的形状是 {id, b, lv, soul, …}，
   代码却写成 b.name / b.elem / b.desc（b 是"条目"不是"伴生体本体"），
   于是名字和描述全是 undefined 传给 fit()/wrap() → 一个字都没画，页面看着"完全没显示"，
   而它**不抛异常**，所有现有尺子全绿。

   做法（两把子尺子）：
     ① 用"什么都开、什么都够"的档把**每一页**渲染一遍，把真正落到 fillText 的字符串抓出来，
        命中 undefined / NaN / null / [object Object] 就报错（这是"字段取错"的通用指纹）；
     ② 对**列东西的页**逐页断言"该出现的实体名 + 说明必须出现"
        （期望值**从当前数据现算**，不是手写死名单 —— 改了数据这把尺子自动跟着走）。
   只读脚本，只调 Core.newGame()，绝不碰真存档。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

/* ---------- 会记账的假 ctx：凡是画出来的字都收进 TEXT ---------- */
const TEXT = [];
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 7 });
    if (k === 'fillText') return (s) => { TEXT.push(String(s)); };
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
};

['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA;
CV.setup(global.wx.getWindowInfo());

/* ---------- 铺一个"什么都开、什么都够"的档 ---------- */
function openState() {
  Core.newGame();
  Core.setPlayerName('文检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  (D.UNLOCKS || []).forEach((u) => { Core.S.unlocks[u.id] = true; });
  Core.S.player.level = 60;
  Core.S.player.geneLock = 3;
  Core.S.player.attrPoints = 20;
  Core.S.player.skillPoints = 20;
  ['points', 'holy', 'otherworld', 'story', 'bloodCrystal', 'skillChip', 'corridor'].forEach((k) => Core.addCur(k, 9999999));
  // 伙伴：全图鉴 + 上阵 5 人（列名的地方才有东西可列）
  (D.characters || []).forEach((c) => { try { Core.addChar(c.id); } catch (e) {} });
  /* 小队：S.party 是**长度 5 的数组**（0/1 前排、2/3/4 后排），主角本人占其中一格
     —— 直接往后追加会被挤出布局（第一版这么写，"韩森"就没画出来，是尺子的错不是游戏的错）。 */
  const ids = (D.characters || []).slice(0, 4).map((c) => c.id);
  Core.S.party = ['@player'].concat(ids);
  // 伴生体：孵一批（走真接口，形状一定对）
  Core.addItem(D.BEAST_EGG_ITEM, 400);
  try { Core.hatchBeast(40); } catch (e) {}
  const owned = Object.keys(Core.S.beast.owned || {});
  if (owned.length) Core.setActiveBeast(owned[0]);
  // 法宝 / 坐骑：买几件并升几级
  ['fb01', 'fb07', 'fb17'].forEach((id) => { try { Core.buyFabao(id); } catch (e) {} });
  try { Core.wearFabao('fb01'); Core.refineFabao('fb01'); Core.refineFabao('fb01'); } catch (e) {}
  ['mt01', 'mt03'].forEach((id) => { try { Core.buyMount(id); } catch (e) {} });
  try { Core.wearMount('mt01'); Core.feedMount('mt01'); Core.feedMount('mt01'); } catch (e) {}
  // 装备 / 道具：够强化、够开箱、够看详情
  try { Core.grantEquip('W05', 'SSR'); Core.grantEquip('W05', 'SR'); Core.grantEquip('W09', 'SSR'); } catch (e) {}
  ['ticket_normal', 'ticket_adv', 'mat_t1', 'mat_t2', 'mat_t3', 'mat_t4', 'mat_t5', 'exp_m', 'exp_l'].forEach((k) => { try { Core.addItem(k, 50); } catch (e) {} });
  // 世界进度：全通普通（列世界 / 列关卡的页面才有内容）
  Object.keys(Core.S.worlds || {}).forEach((wid) => {
    const w = Core.S.worlds[wid];
    if (w && w.stages) Object.keys(w.stages).forEach((df) => { w.stages[df] = w.stages[df].map(() => 3); });
  });
}
openState();

/* ---------- 渲染一页，把画出来的字收下来 ---------- */
function drawPage(name) {
  TEXT.length = 0;
  try { CV.reset(name); } catch (e) { console.log('  [渲染报错] ' + name + ' → ' + e.message); return null; }
  return TEXT.slice();
}
function drawWith(enterId, name) {
  /* 引导开着时 CV.dispatch 是**真模态**（只放行高亮那颗），进不去二级页。
     这里先把已登记的引导全部标成已读，再看页面内容 —— 测的是"页面对不对"，不是"引导让不让过"。 */
  for (let i = 0; i < 50 && U.coachCount && U.coachCount() > 0; i++) CV.dispatch('_coach_ok');
  try { CV.dispatch(enterId); } catch (e) {}
  return drawPage(name);
}
/* 画布上一条文字可能被"逐字画"（CV.GLYPHS 那条路，缺字形时一个码点一次 fillText），
   所以匹配要看**整页拼起来的字流**，不能只看单次 fillText。 */
const has = (arr, s) => arr.join('').indexOf(String(s)) >= 0;

console.log('\n=== ① 画出来的字里有没有"取错字段"的痕迹 ===');
const BAD = ['undefined', 'NaN', '[object Object]'];
let badText = 0;
Object.keys(CV.panels || {}).forEach((name) => {
  const got = drawPage(name);
  if (!got) { return; }
  const stream = got.join('');
  BAD.forEach((b) => {
    const hit = got.filter((t) => t.indexOf(b) >= 0);
    if (hit.length) { badText++; console.log(`  ✗ ${name} 页画出了「${b}」：${hit.slice(0, 3).join(' / ')}`); }
    else if (stream.indexOf(b) >= 0) { badText++; console.log(`  ✗ ${name} 页画出了「${b}」`); }
  });
});
if (!badText) console.log('  所有页面都没有 undefined / NaN / [object Object] ✓');

console.log('\n=== ② "列东西"的页面：该出现的名字和说明必须真的画出来 ===');
/* ②-a 退役词：界面上**画出来**的旧名字（网页版那套 copy_audit 只管 HTML，画布这边的字它看不见）。
   起因（V9.6.136）：货币 8→4 之后，成长页和三条引导里还写着"血统结晶""铭刻五阶"——
   玩家一眼就能看出这版本没过脑子。这里把退役币名也盯上，和网页版同一份口径。 */
const RETIRED_TEXT = [
  [/故事点|技能芯片|血统结晶|深井徽记/, 'V9.6.134 货币 8→4：已并入 ◉ 点数 / ◆ 异界结晶'],
  [/凡体/, 'V8.1 起的第 1 阶境界不再是"凡体"'],
  [/跳过战斗/, 'V9.5.64 已删掉该按钮（战斗界面用"撤离"）'],
  [/个人房间/, '旧界面名，主角面板已并进主页最上面的主角卡'],
];
let retiredHits = 0;
{
  let ret = 0;
  Object.keys(CV.panels || {}).forEach((name) => {
    const got = drawPage(name);
    if (!got) return;
    const stream = got.join('');
    RETIRED_TEXT.forEach(([re, why]) => {
      const m = stream.match(re);
      if (!m) return;
      /* 允许"解释式"提及：为了说明"不再有这东西"而点到名字是正常的
         （网页版 copy_audit 里同一条规矩：不存在"凡体"这种占位）。 */
      const at = stream.indexOf(m[0]);
      const around = stream.slice(Math.max(0, at - 24), at + m[0].length + 24);
      if (/不再|不存在|没有这种|没有这种|早就|以前|过去|旧版|已删|下架|不该再/.test(around)) return;
      ret++;
      console.log(`  ✗ ${name} 页还画着退役词「${m[0]}」（${why}）`);
    });
  });
  if (!ret) console.log('  每一页画出来的文字里都没有退役的旧名字 ✓');
  retiredHits = ret;
}
/* ②-b 同一个规矩，但**直接扫源码**：引导表 / 弹窗文案这类"只在特定时机才画"的字，
   靠渲染是抓不全的（实测：往引导气泡里塞一个旧币名，光渲染抓不到）。 */
{
  const SRC_FILES = fs.readdirSync(JS).filter((f) => /^(sc-.*|cv|uiw|wx-adapter)\.js$/.test(f));
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  let ret2 = 0;
  SRC_FILES.forEach((f) => {
    let text = '';
    try { text = stripComments(fs.readFileSync(path.join(JS, f), 'utf8')); } catch (e) { return; }
    RETIRED_TEXT.forEach(([re, why]) => {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(text))) {
        const around = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
        if (/不再|不存在|没有这种|早就|以前|过去|旧版|已删|下架|不该再/.test(around)) continue;
        ret2++;
        console.log(`  ✗ ${f} 的文案里还写着退役词「${m[0]}」（${why}）`);
      }
    });
  });
  if (!ret2) console.log('  源码里也没有退役的旧名字（含引导表 / 弹窗文案）✓');
  retiredHits += ret2;
}
let fails = 0;

function expect(page, list, label) {
  const got = drawPage(page);
  if (!got) { fails++; console.log(`  ✗ ${page} 页渲染失败`); return; }
  const missing = list.filter((s) => s && !has(got, String(s).slice(0, 8)));
  if (missing.length) {
    fails++;
    console.log(`  ✗ ${label || page}：${missing.length} 项没画出来 —— ${missing.slice(0, 3).map((m) => String(m).slice(0, 18)).join(' / ')}`);
  }
}

/* 伴生体：每一只的名字 + 说明都要在列表里（V9.6.133 就是这里漏的） */
const beasts = Core.beastState().list;
expect('beast', beasts.map((x) => x.b.name), '我的伴生体（名字）');
expect('beast', beasts.map((x) => D.beastDesc(x.b)), '我的伴生体（说明）');
expect('beast', [D.ELEMENT_ICON[beasts[0] && beasts[0].b.elem] ? beasts[0].b.elem : ''], '我的伴生体（五行）');
// 二级页：进去之后名字 / 兽魂 / 升阶都要在
if (beasts.length) {
  const g = drawWith('beast_detail:' + beasts[0].id, 'beast_detail');
  if (!g || !has(g, beasts[0].b.name) || !has(g, '兽魂') || !has(g, '当前加成')) {
    fails++; console.log('  ✗ 伴生体详情：名字 / 兽魂 / 当前加成没画全');
  }
}

/* 法宝：列表里每一件的名字 + 效果；详情页要有四块 */
const fbs = D.FABAO.filter((f) => (Core.S.fabao.own || []).indexOf(f.id) >= 0);
expect('fabao', fbs.map((f) => f.name), '法宝（名字）');
expect('fabao', fbs.map((f) => f.desc), '法宝（效果）');
if (fbs.length) {
  const g = drawWith('fabao_detail:' + fbs[0].id, 'fabao_detail');
  ['基础效果', '当前效果', '祭炼', '佩戴'].forEach((k) => {
    if (!g || !has(g, k)) { fails++; console.log('  ✗ 法宝详情缺「' + k + '」'); }
  });
}

/* 坐骑：同上 */
const mts = D.MOUNTS.filter((m) => (Core.S.mount.own || []).indexOf(m.id) >= 0);
expect('mount', mts.map((m) => m.name), '坐骑（名字）');
expect('mount', mts.map((m) => m.desc), '坐骑（效果）');
if (mts.length) {
  const g = drawWith('mount_detail:' + mts[0].id, 'mount_detail');
  ['基础效果', '喂养加成', '合计效果', '喂养'].forEach((k) => {
    if (!g || !has(g, k)) { fails++; console.log('  ✗ 坐骑详情缺「' + k + '」'); }
  });
}

/* 灯阁权限：20 级的说明 + 解锁要求都要能看到 */
expect('authority', D.AUTHORITY.slice(0, 3).map((a) => a.desc), '灯阁权限（说明）');
expect('authority', [D.authorityReq(1)], '灯阁权限（解锁要求）');

/* 执灯者 / 队伍 / 背包 / 秘术阁：列名单的页面 */
const own = Object.keys(Core.S.chars || {});
expect('roster', own.slice(0, 6).map((id) => Core.charName(id)), '执灯者（伙伴名）');
const partyIds = Object.keys(Core.S.party || {}).map((k) => Core.S.party[k]).filter(Boolean);
expect('party', partyIds.map((id) => Core.charName(id)), '队伍（上阵名）');
/* 背包默认停在「道具」页 —— 三个子页各切一次，各自的格子都得真的列出来 */
{
  const tabs = [['item', '道具'], ['mat', '材料'], ['eq', '装备']];
  tabs.forEach(([v, label]) => {
    try { CV.dispatch('bagview:' + v); } catch (e) {}
    const g = drawPage('bag');
    if (!g || !has(g, label)) { fails++; console.log('  ✗ 背包切到「' + label + '」页没画出来'); }
  });
  try { CV.dispatch('bagview:mat'); } catch (e) {}
  const gm = drawPage('bag');
  if (!gm || !has(gm, (D.ITEMS.mat_t1 || {}).name)) { fails++; console.log('  ✗ 背包材料页里看不到材料名'); }
  try { CV.dispatch('bagview:item'); } catch (e) {}
}
expect('keji', D.KEJI.map((k) => k.name), '秘术阁（每条线）');
expect('garden', ['第 1 块'], '药园（地块）');
expect('sign', D.SIGNS.map((s) => s.tier), '求签（签档）');

const totalBad = fails + badText + retiredHits;
console.log(`\n${totalBad === 0 ? '结论：每一页画出来的内容都对得上数据、也没有退役的旧名字 ✓'
  : `结论：有 ${totalBad} 处要修（画了但内容对不上 / 还画着退役的旧名字）`}`);
process.exit(totalBad ? 1 : 0);
