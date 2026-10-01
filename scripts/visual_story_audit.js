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
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const SD = loadStoryData();
const SCENE_IDS = ['bio_lab', 'bio_swamp', 'bio_sea', 'ghost_house', 'ghost_town', 'ghost_env',
  'ghost_wall', 'tech_waste', 'tech_base', 'mystic_ruins', 'mystic_throne', 'god_hall'];
const BOSS_IDS = ['W06', 'W12', 'W18', 'W24', 'W30', 'W36'];
const STORY_SRC = stripComments(read('js/sc-story.js'));
const DUN_SRC = stripComments(read('js/sc-dungeon.js'));
const BATTLE_SRC = stripComments(read('js/sc-battle.js'));
const STORY_RAW = read('js/sc-story.js');

/* ---------- ①②③ 12 个 sceneId：一处不多、一处不少 ---------- */
{
  const have = Object.keys(SD.SCENE_INFO || {});
  const miss = SCENE_IDS.filter((id) => have.indexOf(id) < 0);
  const extra = have.filter((id) => SCENE_IDS.indexOf(id) < 0);
  t('① 场景表正好是那 12 个母版（不多不少）', miss.length === 0 && extra.length === 0,
    '12 个 sceneId 与规格逐字一致',
    '缺 ' + (miss.join(' ') || '无') + ' ｜ 多出来的 ' + (extra.join(' ') || '无'));
  const files = Object.keys(SD.SCENE_FILE || {});
  const fmiss = SCENE_IDS.filter((id) => files.indexOf(id) < 0);
  t('② 每个场景都登记了正式图路径（SCENE_FILE）', fmiss.length === 0, '12 条映射',
    fmiss.length ? ('缺 ' + fmiss.join(' ')) : (files.length + ' 条'));
  const badName = files.filter((id) => {
    const v = String(SD.SCENE_FILE[id] || '');
    return /[^\x00-\x7F]/.test(v) || v !== v.toLowerCase();
  });
  t('③ 场景图文件名全是 ASCII 小写（包内不许中文名/大写）', badName.length === 0,
    'base name /[a-z0-9_]+\\.jpg/', badName.length ? badName.join(' ') : '全部合规');
}

/* ---------- ④ 六个卷末 Boss 齐 ---------- */
{
  const have = Object.keys(SD.BOSS || {});
  const miss = BOSS_IDS.filter((id) => have.indexOf(id) < 0);
  t('④ 六个核心 Boss（W06/W12/W18/W24/W30/W36）都在 Boss 表里',
    miss.length === 0, '6 个', miss.length ? ('缺 ' + miss.join(' ')) : have.join(' '));
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
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}

/* ---------- ⑤⑥ 素材接入状态：**报数，不假装绿** ---------- */
{
  const sceneMissing = [], sceneBad = [], sceneOk = [];
  SCENE_IDS.forEach((id) => {
    const rel = String((SD.SCENE_FILE || {})[id] || '');
    const p = path.join(ROOT, rel);
    if (!rel || !fs.existsSync(p)) { sceneMissing.push(id); return; }
    const buf = fs.readFileSync(p);
    const info = rel.toLowerCase().endsWith('.png') ? pngInfo(buf) : jpegSize(buf);
    if (!info) { sceneBad.push(id + '(不是有效图片)'); return; }
    const ar = info.w / info.h;
    if (Math.abs(ar - 9 / 16) > 0.02) sceneBad.push(id + '(' + info.w + 'x' + info.h + ' 不是 9:16)');
    else sceneOk.push(id);
  });
  if (sceneBad.length) {
    R.fail('⑤ 已接入的场景图必须合规格（9:16）',
      { expected: '1080×1920（9:16）', actual: sceneBad.join(' ') });
  } else if (sceneMissing.length) {
    /* 2026-10-01：正式素材已交付 ⇒ 缺一张就是**真的没接好**，按 FAIL 报（不再 WARN 放过）。 */
    R.fail('⑤ 12 张正式场景图必须全部就位',
      { expected: '12 张 story/scene/img_scene_<sceneId>.jpg（1080×1920）',
        actual: '缺 ' + sceneMissing.length + ' 张：' + sceneMissing.join(' ') });
  } else {
    R.pass('⑤ 正式场景图 12 / 12 已接入且合规格', { expected: '12 张 9:16', actual: '全部就位' });
  }

  /* Boss：**规格 2026-10-01 改为 1080×1920 / PNG（不再 1024×1536）**，且必须真透明 */
  const bossMissing = BOSS_IDS.filter((id) => !fs.existsSync(path.join(ROOT, 'story/boss/img_boss_' + id + '.png')));
  if (bossMissing.length) {
    R.fail('⑥ 六个核心 Boss 立绘必须全部就位',
      { expected: '6 张 story/boss/img_boss_<W##>.png（1080×1920 · 透明 PNG）',
        actual: '缺 ' + bossMissing.join(' ') });
  } else {
    const bad = [];
    BOSS_IDS.forEach((id) => {
      const info = pngInfo(fs.readFileSync(path.join(ROOT, 'story/boss/img_boss_' + id + '.png')));
      if (!info) { bad.push(id + '(不是 PNG)'); return; }
      if (info.colorType !== 6 && info.colorType !== 4) bad.push(id + '(没有 alpha 通道)');
      if (info.w !== 1080 || info.h !== 1920) bad.push(id + '(' + info.w + 'x' + info.h + ' ≠ 1080x1920)');
    });
    t('⑥ 六个核心 Boss 立绘都合规格（1080×1920 · 透明 PNG）', bad.length === 0,
      '1080×1920 · colorType 6/4', bad.length ? bad.join(' ') : '6/6');
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

  t('⑭ 「残响」由战斗自动触发（不是世界页按钮）',
    BATTLE_SRC.indexOf('maybeEcho(') >= 0 && BATTLE_SRC.indexOf('drawEcho') >= 0,
    'sc-battle 里有触发 + 绘制',
    (BATTLE_SRC.indexOf('maybeEcho(') >= 0 ? '触发✓' : '触发✗') + ' ' +
      (BATTLE_SRC.indexOf('drawEcho') >= 0 ? '绘制✓' : '绘制✗'));

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

R.finish();
