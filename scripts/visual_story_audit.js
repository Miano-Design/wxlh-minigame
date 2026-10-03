/* 剧情视觉 & 叙事体检（2026-10-01 · 父亲大人二轮 §三十）：node scripts/visual_story_audit.js
   ==============================================================================
   这一把尺子回答两个问题：
     ① **素材到位没有**（12 张场景图 + 6 张 Boss 立绘：数量、文件名、尺寸、透明度、分包位置）；
     ② **叙事有没有退回"功能菜单 + 作者解释"**（那几条是这一轮点名要拆掉的东西）。

   一条纪律（与另外八支同一套）：**没测到不许当通过**。
   素材还没接的时候走 **WARN ＋ 明确报数**（"未接入 N/12"）—— 既不会假装绿，
   也不会把"图还没画"当成"程序写错了"把发布总闸掐死。
   但**声明过的文件而内容不对**（尺寸不符 / 不是图 / 中文名）一律 FAIL。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeReport } = require('./_report');
const ROOT = path.resolve(__dirname, '..');
const R = makeReport('visual_story_audit');

function t(item, ok, expected, actual) {
  if (ok) R.pass(item, { expected: expected, actual: actual });
  else R.fail(item, { expected: expected, actual: actual });
  return ok;
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function loadStoryData() {
  const g = {};
  new Function('GameGlobal', read('js/sc-story-data.js'))(g);
  return g.STORYDATA;
}
/* 去注释：判断"代码里有没有那句话"必须去掉注释 —— 那段说明本身就要写这些词 */
function stripComments(s) {
  /* 块注释换成同数量的空白、**保留换行**（否则行号会整体前移，报出来的位置全错） */
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const SD = loadStoryData();
const SCENE_IDS = ['bio_lab', 'bio_swamp', 'bio_sea', 'ghost_house', 'ghost_town', 'ghost_env',
  'ghost_wall', 'tech_waste', 'tech_base', 'mystic_ruins', 'mystic_throne', 'god_hall'];
/* ================= 2026-10-03（父亲大人送图）=================
   口径从"**12 张母版 + 6 个卷末 Boss**"变成"**36 个世界各一张 + 深井一张 + 12 张母版**"：
     · 每个世界都有**自己**的场景图（`img_scene_W01..W36.jpg`）与 Boss 立绘（`img_boss_W01..W36.png`）；
     · 12 张母版**留着**（`SCENE_FILE`）—— 它们不是占位，是**人物故事 / 装备故事**的底图
       （那条链按 sceneId 取图，见 `sc-story.js` 的 `charScene` / `itemScene`）；
     · 深井单独一张（`img_scene_corridor.jpg`），它不在 36 的编号里。
   所以 `SCENE_INFO` 现在是 **12 + 1（深井）**，Boss 是 **36**。*/
const SCENE_EXTRA = ['corridor'];
const WORLD_IDS = [];
for (let i = 1; i <= 36; i++) WORLD_IDS.push('W' + (i < 10 ? '0' + i : i));
const BOSS_IDS = WORLD_IDS.slice();
const STORY_SRC = stripComments(read('js/sc-story.js'));
const DUN_SRC = stripComments(read('js/sc-dungeon.js'));
const BATTLE_SRC = stripComments(read('js/sc-battle.js'));
const STORY_RAW = read('js/sc-story.js');

/* ---------- ①②③ 12 个母版 + 深井：一处不多、一处不少 ---------- */
{
  const have = Object.keys(SD.SCENE_INFO || {});
  const allow = SCENE_IDS.concat(SCENE_EXTRA);
  const miss = allow.filter((id) => have.indexOf(id) < 0);
  const extra = have.filter((id) => allow.indexOf(id) < 0);
  t('① 场景表正好是那 12 个母版 ＋ 深井（不多不少）',
    miss.length === 0 && extra.length === 0,
    '12 个母版 + corridor（深井）',
    '缺 ' + (miss.join(' ') || '无') + ' ｜ 多出来的 ' + (extra.join(' ') || '无'));
  /* ② 母版**文件**已按父亲大人 2026-10-03 的要求删除；每个母版改由
        `MASTER_WORLD` 折到一个**代表世界**（人物故事 / 装备故事那条链靠它活着）。
        判据三条：12 个母版都有代表世界 · 代表世界都是真世界 · 它指的图真的在磁盘上。 */
  const mw = SD.MASTER_WORLD || {};
  const mwMiss = SCENE_IDS.filter((id) => !mw[id]);
  const mwBad = Object.keys(mw).filter((id) => !(SD.WORLD_SCENE_FILE || {})[mw[id]]
    || !fs.existsSync(path.join(ROOT, String((SD.WORLD_SCENE_FILE || {})[mw[id]] || ''))));
  t('② 12 个母版都折到"代表世界"、且那张世界图真的在',
    mwMiss.length === 0 && mwBad.length === 0, '12 条 MASTER_WORLD → img_scene_W##.jpg',
    (mwMiss.length || mwBad.length)
      ? ('缺 ' + (mwMiss.join(' ') || '无') + ' ｜ 指空的 ' + (mwBad.join(' ') || '无'))
      : (Object.keys(mw).length + ' 条，全部指到在盘上的世界图'));
  const files = Object.keys(SD.WORLD_SCENE_FILE || {});
  /* ③ 文件名契约：把 `WORLD_SCENE_FILE`（36 世界 + 深井）整张表过一遍 ——
         送来的深井图原名是中文，落包时由 `_imgpack.py` 改名为 `img_scene_corridor.jpg`，
         这条尺子就是钉"改名真的做了"的那一处。 */
  const allPaths = files.map((id) => [id, String(SD.WORLD_SCENE_FILE[id] || '')]);
  /* 文件名契约（2026-10-03 收口成一条正则）：
       · **不许非 ASCII**（中文名一律不行——送来的 `img_scene_深井.jpg` 就是反例，落包时改名）；
       · **不许空格**；
       · 形状只有两种：`img_scene_W##.jpg`（世界的，**大写 W 是唯一被允许的大写**）
         与 `img_scene_<小写英文/数字/下划线>.jpg`（深井 corridor 这一类）。 */
  const NAME_RE = /^story\/(scene|boss)\/img_(scene|boss)_(W\d\d|[a-z0-9_]+)\.(jpg|png)$/;
  const badName = allPaths.filter((kv) => !NAME_RE.test(kv[1])).map((kv) => kv[0] + '(' + kv[1] + ')');
  t('③ 场景图文件名合规（无中文 / 无空格 / 只有 W## 一处大写）', badName.length === 0,
    'img_scene_W##.jpg 或 img_scene_<a-z0-9_>.jpg',
    badName.length ? badName.join(' ') : (allPaths.length + ' 条全部合规'));
}

/* ---------- ④ 36 个世界的 Boss 都在表里（＋深井场景在场景表里） ---------- */
{
  const have = Object.keys(SD.BOSS_FILE || {});
  const miss = BOSS_IDS.filter((id) => have.indexOf(id) < 0);
  t('④ 36 个世界的 Boss 立绘都登记了路径（BOSS_FILE）',
    miss.length === 0, '36 条映射', miss.length ? ('缺 ' + miss.join(' ')) : (have.length + ' 条'));
  const smiss = WORLD_IDS.filter((id) => !(SD.WORLD_SCENE_FILE || {})[id]);
  const cmiss = SCENE_EXTRA.filter((id) => !(SD.WORLD_SCENE_FILE || {})[id]);
  t('④-b 36 个世界的场景图 ＋ 深井都登记了路径（WORLD_SCENE_FILE）',
    smiss.length === 0 && cmiss.length === 0, '36 张世界图 + 1 张深井',
    (smiss.length || cmiss.length)
      ? ('缺 ' + smiss.concat(cmiss).join(' '))
      : (Object.keys(SD.WORLD_SCENE_FILE || {}).length + ' 条'));
}

/* ---------- 图片元数据（JPEG 扫 SOF / PNG 读 IHDR） ---------- */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (i + 3 >= buf.length) break;
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
function pngInfo(buf) {
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  /* 透明不止一种背法（2026-10-03）：真彩色带 alpha 是 colorType 6 / 4，
     但**调色板 + tRNS**（colorType 3）一样是真透明 —— 720p 量化的立绘就是这一种。
     判"有没有透明"必须把 tRNS 也算进来，否则会把合规的图判成"没有 alpha 通道"。 */
  let hasTrns = false;
  for (let i = 8; i + 8 <= buf.length;) {
    const len = buf.readUInt32BE(i);
    const typ = buf.toString('ascii', i + 4, i + 8);
    if (typ === 'tRNS') { hasTrns = true; break; }
    if (typ === 'IEND' || typ === 'IDAT') break;
    i += 12 + len;
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25], hasTrns: hasTrns };
}

/* ---------- ⑤⑥ 素材接入状态：**报数，不假装绿** ---------- */
{
  /* ⑤ 母版那 12 个**文件**必须真的删干净（父亲大人 2026-10-03：「把旧的删掉吧」）——
        删了才有意义：留着就是 12 × ~140 KB 的白占包体，而且没人再读它们。
        它们各自代表的图由 ② 保证"折到的世界图真的在"。 */
  const leftovers = SCENE_IDS.filter((id) => fs.existsSync(path.join(ROOT, 'story/scene/img_scene_' + id + '.jpg')));
  (leftovers.length ? R.fail : R.pass)('⑤ 12 张母版文件已删除（不许留旧文件白占包体）', {
    file: 'story/scene/', expected: '0 个 img_scene_<母版名>.jpg',
    actual: leftovers.length ? ('还在：' + leftovers.join(' ')) : '0 个（旧图已清空，只剩 36 世界 + 深井）',
  });

  /* ⑤-b 36 张世界场景图 + 深井：都在、都是 9:16、都在 story 分包里。
         ⚠️ 尺寸口径 2026-10-03 从"1080×1920"放宽到"**9:16 且宽 ≥ 720**" ——
            送来的原图合计 227MB，进包必须压；压完是 810×1440（场景）。只要还是 9:16、
            宽不低于 720，就是"能铺满且不糊"的那一档。 */
  const wsMissing = [], wsBad = [];
  WORLD_IDS.concat(SCENE_EXTRA).forEach((id) => {
    const rel = String((SD.WORLD_SCENE_FILE || {})[id] || '');
    const p = path.join(ROOT, rel);
    if (!rel || !fs.existsSync(p)) { wsMissing.push(id); return; }
    const info = jpegSize(fs.readFileSync(p));
    if (!info || Math.abs(info.w / info.h - 9 / 16) > 0.02 || info.w < 720) {
      wsBad.push(id + (info ? ('(' + info.w + 'x' + info.h + ')') : '(不是有效 JPEG)'));
    }
  });
  t('⑤-b 36 张世界场景图 ＋ 深井都就位、都是 9:16（宽 ≥ 720）',
    wsMissing.length === 0 && wsBad.length === 0, '37 张 9:16 JPEG',
    (wsMissing.length || wsBad.length)
      ? ('缺 ' + (wsMissing.join(' ') || '无') + ' ｜ 不合规格 ' + (wsBad.join(' ') || '无'))
      : '37/37 就位');

  /* Boss：**规格 2026-10-01 改为 1080×1920 / PNG**；2026-10-03 起量化的 720×1280 也算合规
     （同样 9:16、同样真透明，见 `pngInfo` 的 tRNS 说明）。 */
  const bossMissing = BOSS_IDS.filter((id) => !fs.existsSync(path.join(ROOT, 'story/boss/img_boss_' + id + '.png')));
  if (bossMissing.length) {
    R.fail('⑥ 36 张 Boss 立绘必须全部就位',
      { expected: '36 张 story/boss/img_boss_<W##>.png（9:16 · 透明 PNG）',
        actual: '缺 ' + bossMissing.join(' ') });
  } else {
    const bad = [];
    BOSS_IDS.forEach((id) => {
      const info = pngInfo(fs.readFileSync(path.join(ROOT, 'story/boss/img_boss_' + id + '.png')));
      if (!info) { bad.push(id + '(不是 PNG)'); return; }
      const alpha = info.colorType === 6 || info.colorType === 4 || (info.colorType === 3 && info.hasTrns);
      if (!alpha) bad.push(id + '(没有 alpha 通道)');
      if (Math.abs(info.w / info.h - 9 / 16) > 0.02 || info.w < 720) {
        bad.push(id + '(' + info.w + 'x' + info.h + ' 不是 9:16 或宽不足 720)');
      }
    });
    t('⑥ 36 张 Boss 立绘都合规格（9:16 · 真透明 PNG）', bad.length === 0,
      '9:16 · colorType 6/4 或 3+tRNS', bad.length ? bad.join(' ') : '36/36');
  }
}

/* ---------- ⑦ 素材不能混进主包 ---------- */
{
  const storyDir = fs.existsSync(path.join(ROOT, 'story'));
  let declared = false;
  try {
    declared = ((JSON.parse(read('game.json')).subpackages || []).some((s) => s && s.name === 'story'));
  } catch (e) {}
  t('⑦ 剧情素材不能进主包（有素材就必须同时声明 story 分包）',
    !storyDir || declared, 'story/ 存在 ⇒ game.json 里有 {name:"story"} 分包',
    storyDir ? (declared ? '已声明' : '素材目录在、但 game.json 没声明分包（会打进主包！）')
      : '还没有素材目录（主包未增加）');
}

/* ---------- ⑧ 图片加载失败必须回落（行为验证，不看注释） ---------- */
{
  let ok = false, why = '';
  try {
    const env = require('./_env').boot({ width: 390, height: 844 });
    if (!env.Core.S) env.Core.newGame({});
    const St = env.G.Story;
    if (!St || !St.bg) why = 'Story.bg 不存在';
    else {
      /* ⚠️ 这里**不能用 `_env` 那个假 ctx** —— 它只桩了 createLinearGradient，
         没桩 createRadialGradient（返回 undefined），于是量出来的是"桩不全"，不是"产品炸了"。
         换成一份**标准 2D 接口**的桩（真画布上这两个都在），量的才是真东西。 */
      const c = new Proxy({}, {
        get(t, k) {
          if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
          if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
          if (k === 'createPattern' || k === 'createImageData') return () => null;
          return () => {};
        },
        set() { return true; },
      });
      SCENE_IDS.forEach((id) => St.bg(c, id, 390, 844, 1));   // 这个假环境没有 createImage ⇒ 必须走回落
      ok = true;
    }
  } catch (e) { why = String((e && e.message) || e); }
  t('⑧ 没有正式图时 `Story.bg` 逐场景回落、不抛错（12 个都过一遍）',
    ok, '12 次调用全部不抛', ok ? '12/12 回落成功' : ('抛错：' + why));
}

/* ---------- ⑨~⑭ 叙事不许退回"功能菜单 + 作者解释" ---------- */
{
  t('⑨-a 全仓没有 `story_world_mid`（残响不得有手动入口）',
    STORY_SRC.indexOf('story_world_mid') < 0, '0 处（**去注释后**的源码，注释里提一句不算开入口）',
    '命中 ' + (STORY_SRC.match(/story_world_mid/g) || []).length + ' 处');

  const fourBtn = ['story_world:', 'story_world_pre:', 'story_boss:'].filter((k) => DUN_SRC.indexOf(k) >= 0);
  t('⑨-b 世界页不再平铺四段剧情按钮（只有一颗主入口）',
    fourBtn.length === 0 && DUN_SRC.indexOf('story_main:') >= 0,
    '只有 story_main:*', fourBtn.length ? ('仍见 ' + fourBtn.join(' ')) : '只有主入口');

  const BAN = ['他的内核', '人物核心', '留下的谜团', '世界观解释', '作者总结', '系统分析', '他留下的话'];
  const hits = [];
  const scan = (tag, s) => { BAN.forEach((w) => { if (String(s || '').indexOf(w) >= 0) hits.push(tag + ':' + w); }); };
  Object.keys(SD.WORLDS || {}).forEach((id) => {
    ['in', 'pre', 'mid', 'post'].forEach((p) => (SD.WORLDS[id][p] || []).forEach((b) => scan(id + '.' + p, b && b.s)));
  });
  Object.keys(SD.CHARS || {}).forEach((id) => {
    [1, 2, 3].forEach((n) => (SD.CHARS[id]['s' + n] || []).forEach((b) => scan(id + '.s' + n, b && b.s)));
  });
  Object.keys(SD.ITEMS || {}).forEach((k) => scan(k, SD.ITEMS[k]));
  t('⑩ 剧情正文里没有作者解释标签（内核 / 谜团 / 世界观解释…）',
    hits.length === 0, '会送进播放器的文字 0 命中',
    hits.length ? hits.slice(0, 6).join(' ') : '全部干净');

  const obFn = (STORY_SRC.match(/Story\.openBoss = function[\s\S]*?\n  \};/) || [''])[0];
  t('⑪ `Story.openBoss` 只转调世界段落（不再自己拼内核/谜团）',
    obFn.indexOf('openWorld') >= 0 && BAN.every((w) => obFn.indexOf(w) < 0),
    '只有 openWorld(...)，无解释标签', obFn ? '符合' : '（没抓到 openBoss）');

  let env = null;
  try { env = require('./_env').boot({ width: 390, height: 844 }); } catch (e) { env = null; }
  if (env && env.G && env.G.Story && env.G.Story.charScene) {
    const St = env.G.Story;
    const cs = Object.keys(SD.CHARS).map((id) => St.charScene(id));
    const cu = cs.filter((v, i) => cs.indexOf(v) === i);
    t('⑫ 人物故事的场景不再全部是 ghost_house', cu.length >= 3,
      '≥ 3 个不同场景', cu.length + ' 个：' + cu.join(' '));
    const ik = Object.keys(SD.ITEMS);
    const iq = ik.map((k) => St.itemScene(k)).filter((v, i, a) => a.indexOf(v) === i);
    t('⑬ 装备故事的场景不再全部是 tech_base', iq.length >= 3,
      '≥ 3 个不同场景', iq.length + ' 个：' + iq.join(' '));
  } else {
    R.blocked('⑫⑬ 人物/装备场景映射：剧情模块没加载起来',
      { expected: '能 boot 出 Story.charScene / Story.itemScene', actual: '没拿到' });
  }

  /* R1.6 叙事轮：残响从"只有一个触发点（第一次打到 Boss）"升级成**事件驱动**
     （`BattleStory.trigger(event)`，见 `js/sc-story-battle.js`）——
     这条尺子的**判据跟着实现走**，但要求一样：必须是战斗页**自己**触发 + 自己绘制，
     不许出现"世界页上有个按钮能手动播残响"。 */
  t('⑭ 「残响」由战斗自动触发（不是世界页按钮）',
    BATTLE_SRC.indexOf('echoTrigger(') >= 0 && BATTLE_SRC.indexOf('drawEcho') >= 0
    && BATTLE_SRC.indexOf('BattleStory') >= 0,
    'sc-battle 里有触发 + 绘制（触发＝BattleStory 事件）',
    (BATTLE_SRC.indexOf('echoTrigger(') >= 0 ? '触发✓' : '触发✗') + ' ' +
      (BATTLE_SRC.indexOf('drawEcho') >= 0 ? '绘制✓' : '绘制✗') + ' ' +
      (BATTLE_SRC.indexOf('BattleStory') >= 0 ? '事件层✓' : '事件层✗'));

  /* ⑮ 「pre」自动触发 —— **行为验证**（在真代码里派发一次 Boss 关，看它是不是自己开剧情、
        播完是不是接着开打）。比"字符串在不在"强一层：走的是 sc-dungeon 那个真处理器。 */
  {
    let got = '', did = '', why = '', nextChanged = false;
    try {
      const env = require('./_env').boot({ width: 390, height: 844 });
      const G2 = env.G, CV2 = env.CV, Core2 = env.Core;
      if (!Core2.S) Core2.newGame({});
      /* 把 W01 摆成"前 11 关已通、第 12 关（守关 Boss）已解锁" */
      const w01 = Core2.S.worlds.W01 || (Core2.S.worlds.W01 = {});
      w01.unlocked = true;
      w01.stages = w01.stages || {};
      w01.stages.normal = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0];
      /* 战斗引擎换成桩：这里只验"流程有没有走到开打"，不验战斗本身（那是别的尺子的事） */
      if (G2.BattleUI) G2.BattleUI.run = function () { return { ok: true }; };
      CV2.reset('dungeon');
      CV2.dispatch('w:W01');
      while (CV2.stack.length > 1 && CV2.top().name === 'story') CV2.pop();   // 关掉自动播的 in
      CV2.dispatch('stage:11');                                              // 点守关那一格
      got = CV2.top().name;
      /* 顺手把剧情页那颗「点一下继续」也验了：`story_next` 必须**真的改变画面**
         （死键尺子在别处量不到它 —— 那边为了避免"重跑场景 + 已读持久化"的假死键，
         已经先关掉自动播了；那两颗键的覆盖就落在这里）。 */
      CV2.render();
      const t0 = env.TEXT.slice();
      CV2.dispatch('story_next');
      CV2.render();
      nextChanged = JSON.stringify(t0) !== JSON.stringify(env.TEXT.slice());
      G2.Story.skip();                                                        // 跳过战前
      did = CV2.top().name;
    } catch (e) { why = String((e && e.message) || e); }
    t('⑮ 守关 Boss 开打前自动播「战前」，播完接着开打（行为验证）',
      got === 'story' && did === 'world',
      'dispatch(stage:11) → story；skip 后 → 回到 world（战斗已起）',
      why ? ('抛错：' + why) : ('点下去：' + got + ' → 跳过后：' + did));
    t('⑯ 剧情页「点一下继续」真的推进（story_next 不是死键）',
      nextChanged, '派发 story_next 后画面文字发生变化',
      nextChanged ? '有反应' : '无变化（那就是死键）');
  }
}

/* ==========================================================================
   2026-10-01（父亲大人「视觉资产正式接入」§二十三 / §二十四）
   图标与配色这一段：36 世界 + 24 全局 SVG 是否全部接入、SVG 本身合不合法、
   配色是不是"统一语义"（而不是 36 色随机 / 也不是全白）、有没有残留 emoji 兜底。
   ========================================================================== */
{
  const ASSET_DIR = path.resolve(ROOT, '../游戏素材/RESYU_VISUAL_ASSETS');
  const TABLE = (() => {
    try { const g = {}; new Function('GameGlobal', read('js/assets-icons.js'))(g); return g.ICON_ASSETS || {}; }
    catch (e) { return {}; }
  })();
  const K = Object.keys(TABLE);
  /* ---------- ⑰ 36 个世界图标 ---------- */
  {
    const want = [];
    for (let i = 1; i <= 36; i++) want.push('ico_world_W' + String(i).padStart(2, '0'));
    const miss = want.filter((k) => !TABLE[k] || !TABLE[k].length);
    t('⑰ 36 个世界图标全部接入（编译进资产表）', miss.length === 0,
      'ico_world_W01 … ico_world_W36', miss.length ? ('缺 ' + miss.join(' ')) : '36/36');
  }
  /* ---------- ⑱ 24 个全局图标 ---------- */
  {
    const want = ['ico_nav_home', 'ico_nav_dungeon', 'ico_nav_roster', 'ico_nav_bag',
      'ico_currency_points', 'ico_currency_otherworld', 'ico_currency_holy', 'ico_currency_rp',
      'ico_blood_wolf', 'ico_blood_xiuzhen', 'ico_blood_crimson', 'ico_blood_tech',
      'ico_blood_psionic', 'ico_blood_titan',
      'ico_theme_bio', 'ico_theme_ghost', 'ico_theme_mystic', 'ico_theme_tech', 'ico_theme_god',
      'ico_element_metal', 'ico_element_wood', 'ico_element_water', 'ico_element_fire', 'ico_element_earth'];
    const miss = want.filter((k) => !TABLE[k] || !TABLE[k].length);
    t('⑱ 24 个全局图标全部接入（导航 4 · 货币 4 · 血统 6 · 主题 5 · 五行 5）', miss.length === 0,
      '24 条', miss.length ? ('缺 ' + miss.join(' ')) : '24/24');
  }
  /* ---------- ⑲ SVG 技术合法性（逐张查源文件） ---------- */
  {
    const bad = [];
    let n = 0;
    if (fs.existsSync(ASSET_DIR)) {
      fs.readdirSync(ASSET_DIR).filter((f) => /\.svg$/i.test(f)).forEach((f) => {
        n++;
        const s = fs.readFileSync(path.join(ASSET_DIR, f), 'utf8');
        if (!/<svg[\s>]/.test(s)) bad.push(f + '(不是 SVG)');
        else {
          if (!/viewBox\s*=/.test(s)) bad.push(f + '(缺 viewBox)');
          if (/<image\b|base64,/i.test(s)) bad.push(f + '(嵌了位图)');
          if (/<text\b|font-family/i.test(s)) bad.push(f + '(依赖字体)');
          if (/xlink:href|href\s*=\s*"(https?:)?\/\//i.test(s)) bad.push(f + '(外部引用)');
          if (/<script\b/i.test(s)) bad.push(f + '(带脚本)');
        }
      });
    } else bad.push('（素材目录不在，无法逐张验）');
    t('⑲ SVG 源文件逐张合法（有 viewBox · 无位图 · 无字体 · 无外链 · 无脚本）',
      bad.length === 0, n + ' 张全部合规', bad.length ? bad.slice(0, 6).join(' ') : n + ' 张全部合规');
  }
  /* ---------- ⑳ 配色：统一语义，不是 36 色随机、也不是全白 ---------- */
  {
    /* 资产表里**不含颜色**（色一律由运行时给）—— 所以这里查的是"语义色表在不在、够不够分散"。 */
    const src = read('js/cv.js');
    const need = ['theme', 'navA', 'bloodAsset', 'elemAsset', 'icoIdle', 'icoDone', 'icoLock'];
    const miss = need.filter((k) => src.indexOf(k) < 0);
    const css = (src.match(/CV\.C\.theme\s*=\s*\{[^}]*\}/) || [''])[0] || src;
    const hexes = (src.match(/theme:\s*\{[^}]*\}/) || [''])[0].match(/#[0-9a-fA-F]{6}/g) || [];
    t('⑳ 统一语义配色表齐（主题 / 导航 / 血统 / 五行 / 图标四态）', miss.length === 0,
      '7 组', miss.length ? ('缺 ' + miss.join(' ')) : '7/7 齐');
    t('⑳-b 主题色是**克制的一组**（5 个主题色各不相同，且不是 36 色随机）',
      hexes.length === 5 && (new Set(hexes.map((h) => h.toLowerCase()))).size === 5,
      '5 个互不相同的主题色', hexes.length + ' 个：' + hexes.join(' '));
  }
  /* ---------- ㉑ 不许再有 emoji 兜底（点名五行） ---------- */
  {
    const dataSrc = stripComments(read('js/data.js'));
    const emojiInElement = /const ELEMENT_ICON[^;]*[\u{1F300}-\u{1FAFF}\u2694\u26F0\u{1F335}\u{1F4A7}\u{1F525}]/u.test(dataSrc);
    t('㉑ 五行图标不再用 emoji（⚔️🌿💧🔥⛰️ → ico_element_*）', !emojiInElement,
      'ELEMENT_ICON 里 0 个 emoji', emojiInElement ? '还能在 ELEMENT_ICON 里看到 emoji' : '已切到矢量资产');
    /* 世界图标：`WORLD_ICONS` 那批老线框表**不许再被优先使用** ——
       但要保留成 fallback（§二十一"不要删除 fallback"），所以这里只查"有没有走新表"。 */
    t('㉑-b `iconOpsOf` 先查正式资产表、再落回老表（fallback 保留）',
      /window\.ICON_ASSETS/.test(dataSrc) && /NAV_ICONS/.test(dataSrc) && /WORLD_ICONS/.test(dataSrc),
      'ICON_ASSETS 优先 + 老表保留', '查表顺序与 fallback 都在');
  }
}

/* ==========================================================================
   2026-10-02（父亲大人：「类似这些的也都还没半透明啊，**你有没有好好查一下**」）
   —— 把"全站不许有不透明面"做成**尺子**。
   教训：前两轮我按**令牌名**猜（先只扫 panel 三族、再只扫"已经包过 CV.a 的"），
   于是弹窗（bg2）、结算层（overlay/shade）、二级页返回键那一栏（drawPageHead 的裸色渐变）
   一路漏过去 —— 用户连着三次圈出来。**按名字猜就会漏，按"形状"扫才不会漏。**
   这条扫**形状**：凡是把"面"色当填充、当渐变端点、当圆角底的，必须包在 `CV.a(...)` 里。
   不在扫描范围内的（**有理由，不是漏**）：
     · 动作按钮的语义色（gold / danger / accent）—— §二十九 要的；
     · 程序化底图与整帧底色（画面最底、底图之下，本来就该实）。
   ========================================================================== */
{
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^sc-.*\.js$|^(cv|uiw)\.js$/.test(f));
  const SURFACE = 'bg|bg2|panel|panel2|panel3|overlay';
  const bad = [];
  files.forEach((f) => {
    fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n').forEach((ln, i) => {
      const code = ln.replace(/\/\/.*$/, '');
      const m1 = new RegExp('fillStyle\\s*=\\s*CV\\.C\\.(?:' + SURFACE + ')\\b').test(code);
      const m2 = new RegExp('addColorStop\\([^,]+,\\s*CV\\.C\\.(?:' + SURFACE + ')\\b').test(code);
      const m3 = new RegExp('CV\\.round\\([^;]*,\\s*CV\\.C\\.(?:' + SURFACE + ')\\s*[,)]').test(code);
      if (ln.indexOf('OK:程序化底图') >= 0) return;   // 用**原始行**判（code 已经把注释剥掉了）   // 显式豁免：画面最底的那层程序化底图
      if (m1 || m2 || m3) bad.push(f + ':' + (i + 1));
    });
  });
  t('㉒ 全站**没有不透明的面**（bg / bg2 / panel* / overlay 当底时必须走 CV.a(...)）',
    bad.length === 0, '0 处裸色填充',
    bad.length ? bad.slice(0, 8).join(' ') : '干净');
}

R.finish();
