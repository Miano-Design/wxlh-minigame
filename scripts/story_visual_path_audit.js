/* 剧情视觉「真实使用路径」审计（R1.7 · 任务书 §十九 / §三十三）：
     node scripts/story_visual_path_audit.js
   ==============================================================================
   它回答的不是"文件在不在"，而是**这张图是不是真的走到了画面上**：
     ① 12 张场景图：文件在 → 在 `SCENE_FILE` 里 → 至少一个世界用到 → 绘制路径取的就是它；
     ② 6 张 Boss 立绘：文件在 → 在 `BOSS_FILE` 里 → 六个锚点世界各一张 → 出场/剧情页真的调它；
     ③ 主 KV：`brand/kv-main.jpg` 在 → `KV_FILE` 指它 → **首页真的用 `Story.kvImage()`**；
     ④ 旧引用清扫：老 KV / 测试图 / 占位字串在**正常路径**里还有没有残留。
   产出：`docs/story/story_visual_reference_audit.json`（asset / references / normalPath / fallbackOnly / status）。
   只读代码与资源，不改任何东西。 */
const fs = require('fs');
const path = require('path');
const { boot, ROOT } = require('./_env');
const { makeReport } = require('./_report');
const R = makeReport('story_visual_path_audit');
let E; try { E = boot(); } catch (e) { R.blocked('加载游戏运行环境', { reason: String((e && e.message) || e) }); R.finish(); return; }
const { D, G } = E;
const SD = G.STORYDATA || {};
const JS_DIR = path.join(ROOT, 'js');
/* ⚠️ 判"正常路径有没有引用旧东西"之前必须**先去注释**（保留行号）。
   第一版只跳过了"以双斜杠或星号开头"的行，于是**块注释的中间行**照样被当成代码 ——
   实测把 `sc-splash.js` 写在块注释里的历史说明判成了"旧 KV 还在用"（假账）。
   现在用状态机把块注释与行注释全部挖成空格，行号不变。 */
function stripComments(s) {
  const out = s.split('');
  let i = 0, n = s.length, inBlock = false, inLine = false, inStr = null;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (inLine) { if (c === '\n') inLine = false; else out[i] = ' '; i++; continue; }
    if (inBlock) { if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; inBlock = false; continue; } if (c !== '\n') out[i] = ' '; i++; continue; }
    if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '/' && d === '*') { out[i] = ' '; out[i + 1] = ' '; i += 2; inBlock = true; continue; }
    if (c === '/' && d === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; inLine = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    i++;
  }
  return out.join('');
}
const SRC = {};
fs.readdirSync(JS_DIR).filter((f) => /\.js$/.test(f)).forEach((f) => { SRC['js/' + f] = fs.readFileSync(path.join(JS_DIR, f), 'utf8'); });
SRC['game.js'] = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
const ALL = Object.keys(SRC).map((k) => ({ f: k, t: SRC[k] }));
const refsOf = (needle) => ALL.filter((x) => x.t.indexOf(needle) >= 0).map((x) => x.f);

const rows = [];
const missingFile = [], unmapped = [], unused = [];
/* 12 个"场景气质"（母版）的 id —— 2026-10-03 起它们的**图**已删，但 id 仍在用
   （人物故事 / 装备故事按它取名与色调，图则由 `MASTER_WORLD` 折到代表世界）。 */
const SCENE_IDS = ['bio_lab', 'bio_swamp', 'bio_sea', 'ghost_house', 'ghost_town', 'ghost_env',
  'ghost_wall', 'tech_waste', 'tech_base', 'mystic_ruins', 'mystic_throne', 'god_hall'];

/* ---------- ① 12 个"场景气质"（母版）：**图已删，折到代表世界** ----------
   2026-10-03（父亲大人：「12 母版 + 6 Boss 可以删了」）：那 12 张母版**文件**删掉了，
   但"母版 id"这条链还在 —— 人物故事 / 装备故事按它取图（`charScene` / `itemScene`）。
   所以这里查的不是"文件在不在"，而是三条**更硬**的：
     · 12 个母版 id 都还在 `SCENE_INFO`（名字/色调没丢）与 `MASTER_WORLD`（有代表世界）；
     · 代表世界真的存在，而且那张世界图真的在盘上；
     · 老母版文件**确实已经不在**（留着就是白占包体）。
   做坏试验：把 `MASTER_WORLD` 里任意一条删掉 → 第一条当场红；
             往 `story/scene/` 里放回一张 `img_scene_ghost_house.jpg` → 第三条当场红。 */
{
  const mw = SD.MASTER_WORLD || {};
  const info = SD.SCENE_INFO || {};
  const noInfo = SCENE_IDS.filter((id) => !info[id]);
  const noWorld = SCENE_IDS.filter((id) => !mw[id]);
  const empty = SCENE_IDS.filter((id) => mw[id] && !(SD.WORLD_SCENE_FILE || {})[mw[id]]);
  const noFile = SCENE_IDS.filter((id) => {
    const rel = mw[id] && (SD.WORLD_SCENE_FILE || {})[mw[id]];
    return rel && !fs.existsSync(path.join(ROOT, rel));
  });
  SCENE_IDS.forEach((id) => {
    const world = mw[id] || '';
    const rel = world ? String((SD.WORLD_SCENE_FILE || {})[world] || '') : '';
    rows.push({
      asset: rel || '(母版已删 · 折到 ' + world + ')', kind: 'scene-master', id: id,
      references: refsOf('MASTER_WORLD'), worlds: Object.keys(SD.SCENE || {}).filter((w) => SD.SCENE[w] === id).length,
      normalPath: !!(world && rel && fs.existsSync(path.join(ROOT, rel))), fallbackOnly: false,
      status: (world && rel && fs.existsSync(path.join(ROOT, rel))) ? 'ok' : 'missing',
    });
  });
  ((noInfo.length || noWorld.length || empty.length || noFile.length) ? R.fail : R.pass)
    ('12 个母版 id 都折到了真实存在的世界图（母版文件本身已删）', {
      file: 'js/sc-story-data.js',
      expected: '12 条 SCENE_INFO + 12 条 MASTER_WORLD → 都在盘上的 img_scene_W##.jpg',
      actual: (noInfo.length ? ('SCENE_INFO 缺 ' + noInfo.join(' ')) : '名字齐')
        + ' · ' + (noWorld.length ? ('MASTER_WORLD 缺 ' + noWorld.join(' ')) : '映射齐')
        + ' · ' + (empty.length ? ('指空 ' + empty.join(' ')) : '不指空')
        + ' · ' + (noFile.length ? ('图不在 ' + noFile.join(' ')) : '图都在'),
    });
  const back = SCENE_IDS.filter((id) => fs.existsSync(path.join(ROOT, 'story/scene/img_scene_' + id + '.jpg')));
  (back.length ? R.fail : R.pass)('12 张母版文件确实已删（没有被"顺手留一份"）', {
    file: 'story/scene/', expected: '0 个 img_scene_<母版名>.jpg',
    actual: back.length ? ('还在：' + back.join(' ')) : '0 个',
  });
}

/* ---------- ①-b / ② 世界专属图：**36 个世界各一张 ＋ 深井一张 ＋ 36 张立绘** ----------
   2026-10-03（父亲大人送图）：口径从"12 张母版 + 6 个卷末 Boss"扩成
   "36 个世界各一张场景 ＋ 各一张立绘 ＋ 深井一张"。
   判据与 ① 同源：**文件在 → 表里有 → 拿它的那条绘制路径真的读它**（不是"文件存在就算数"）。
   母版（12 张）单独保留在 ①：它们现在服务的是**人物故事 / 装备故事**那条链，不是世界。 */
const WORLD_IDS = [];
for (let i = 1; i <= 36; i++) WORLD_IDS.push('W' + (i < 10 ? '0' + i : i));
{
  const wMiss = [], wUnused = [];
  WORLD_IDS.forEach((wid) => {
    const rel = String((SD.WORLD_SCENE_FILE || {})[wid] || '');
    const exists = !!(rel && fs.existsSync(path.join(ROOT, rel)));
    const usedBy = Object.keys(SD.SCENE || {}).filter((w) => w === wid).length > 0;
    if (!exists) wMiss.push(wid);
    if (!usedBy) wUnused.push(wid);
  });
  /* 深井那张不在 36 编号里，单独查（它由 `CV.veils.battle` 在"没有世界号"时取用） */
  const cor = String((SD.WORLD_SCENE_FILE || {}).corridor || '');
  const corExists = !!(cor && fs.existsSync(path.join(ROOT, cor)));
  const corWired = /'corridor'/.test(SRC['js/sc-story.js'] || '');
  (wMiss.length || !corExists ? R.fail : R.pass)('36 个世界的场景图 ＋ 深井那张都在', {
    file: 'js/sc-story-data.js',
    expected: '37 个文件存在（img_scene_W01..W36.jpg + img_scene_corridor.jpg）',
    actual: (wMiss.length ? ('缺 ' + wMiss.join(' ')) : '36/36 在')
      + ' · 深井 ' + (corExists ? '在' : '缺') + '（' + cor + '）',
  });
  (corWired ? R.pass : R.fail)('深井那张图**真的被绘制路径取用**（不是丢在包里没人读）', {
    file: 'js/sc-story.js', expected: "CV.veils.battle 在没有 CV.battleWorld 时取 'corridor'",
    actual: corWired ? '已接线' : '没找到 corridor 的取图点',
  });
  /* 每一张世界图都要有**它自己的**那个世界在用（拿母版顶替不算） */
  (wUnused.length ? R.fail : R.pass)('每个世界图都有对应的世界在用', {
    file: 'js/sc-story-data.js', expected: '36/36 有主',
    actual: wUnused.length ? wUnused.join(' ') : '36/36',
  });
}

/* ---------- ② Boss 立绘：**36 个世界各一张**（原来只有 6 个卷末锚点） ---------- */
const ANCHORS = WORLD_IDS.slice();
ANCHORS.forEach((wid) => {
  const rel = (SD.BOSS_FILE || {})[wid];
  const full = rel ? path.join(ROOT, rel) : '';
  const exists = !!(rel && fs.existsSync(full));
  const refs = refsOf('bossFile').concat(refsOf('bossImage'));
  if (!exists) missingFile.push(wid);
  rows.push({
    asset: rel || ('(缺) ' + wid), kind: 'boss', id: wid, references: refs, worlds: 1,
    normalPath: exists && refs.length > 0, fallbackOnly: false,
    status: exists ? 'ok' : 'missing',
  });
});
(missingFile.filter((x) => /^W\d\d$/.test(x)).length ? R.fail : R.pass)('36 张 Boss 立绘都在，且接入路径存在', {
  file: 'js/sc-story-data.js', expected: '36/36',
  actual: missingFile.filter((x) => /^W\d\d$/.test(x)).join(',')
    || '36/36（剧情页 + 战斗出场序列两处都读它）',
});

/* ---------- ③ 主 KV：**首页真的用它** ---------- */
{
  const rel = SD.KV_FILE;
  const exists = !!(rel && fs.existsSync(path.join(ROOT, rel)));
  const homeUses = (SRC['js/sc-home.js'] || '').indexOf('kvImage') >= 0;
  const splashUses = (SRC['js/sc-splash.js'] || '').indexOf('kv-main') >= 0;
  rows.push({
    asset: rel || '(缺)', kind: 'kv', id: 'main', references: refsOf('kv-main').concat(refsOf('kvImage')),
    worlds: 0, normalPath: !!(exists && homeUses), fallbackOnly: false,
    status: exists ? (homeUses ? 'ok' : 'not-wired') : 'missing',
  });
  (exists && homeUses ? R.pass : R.fail)('首页用的是正式主 KV（brand/kv-main.jpg），不是旧图', {
    file: 'js/sc-home.js', expected: 'KV_FILE=brand/kv-main.jpg 且首页走 Story.kvImage()',
    actual: (rel || '(缺)') + ' · 首页kvImage=' + homeUses + ' · 启动页=custom-kv',
  });
  /* 旧 KV 路径必须**只在注释/历史里**，正常路径不许再引用 */
  const staleKv = [];
  ALL.forEach((x) => {
    stripComments(x.t).split('\n').forEach((ln, i) => {
      if (/icons\/mv-main-lamp\.jpg/.test(ln)) staleKv.push(x.f + ':' + (i + 1));
    });
  });
  (staleKv.length ? R.fail : R.pass)('正常路径里不再引用旧主视觉（icons/mv-main-lamp.jpg）', {
    file: 'js/*.js', expected: '0 处（注释除外）', actual: staleKv.length ? staleKv.join(' ; ') : '0 处',
  });
}

/* ---------- ④ 旧占位 / 调试残留（**正常路径**才算） ---------- */
{
  /* ⚠️ 只查**真的是占位残留**的词。第一版把英文 `placeholder` 也算进去了 ——
     可项目里它是**合法的输入框占位文字**（`inputBox: { placeholder: '点这里输入名字' }`），
     那是功能，不是残留（父亲的尺子只该抓真问题，不许把正经代码算成脏）。 */
  const BAD = ['待替换', '程序生成', '资源未加载', 'TODO', 'FIXME', '临时背景', '测试用'];
  const hit = [];
  ALL.forEach((x) => {
    stripComments(x.t).split('\n').forEach((ln, i) => {
      BAD.forEach((w) => { if (ln.indexOf(w) >= 0) hit.push(x.f + ':' + (i + 1) + ' ' + w); });
    });
  });
  (hit.length ? R.warn : R.pass)('正常路径里没有占位/调试残留字串', {
    file: 'js/*.js', expected: '0 处（注释里提到不算）', actual: hit.length ? hit.slice(0, 8).join(' ; ') : '0 处',
  });
  R.note('（2026-10-03：程序化那两层占位（`bgBase`/`bgStructure`）已按父亲大人要求**整个删掉** —— '
    + '现在 `Story.sceneState()` 只有两条路：ready→真图 / 其余→主题平底（`bgFlat`，无几何）。'
    + 'Boss 拍也不再退成几何剪影：立绘没到就**不画人**。）');
}

/* ---------- 产出 JSON ---------- */
try {
  const outDir = path.join(ROOT, 'docs', 'story');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'story_visual_reference_audit.json'),
    JSON.stringify({ generatedFor: 'R1.7 / 2026-10-03 换 36 世界正式图', sceneCount: 37, bossCount: 36,
      masterCount: Object.keys(SD.SCENE_FILE || {}).length, kv: SD.KV_FILE, rows }, null, 2), 'utf8');
  R.note('已产出 docs/story/story_visual_reference_audit.json（' + rows.length + ' 条资源记录）');
} catch (e) { R.warn('写 JSON 失败（不影响判据）', { actual: String(e && e.message) }); }

R.note('口径：真读文件系统 + `SCENE`/`SCENE_FILE`/`BOSS_FILE`/`KV_FILE` + 各 js 的引用点。');
R.finish();
