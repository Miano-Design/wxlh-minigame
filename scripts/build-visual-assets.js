/* 正式视觉资产接入 · 构建脚本（2026-10-01）
   ==============================================================================
   用法：node scripts/build-visual-assets.js [素材目录]
        （默认读 `../../游戏素材/RESYU_VISUAL_ASSETS`，由 `ASSETS` 环境变量可覆盖）

   它做两件事：
     ① **图片**（12 场景 / 6 Boss / 1 主视觉）——把素材按正式文件名复制进工程：
          · 12 场景  → `story/scene/`（剧情**独立分包**，主包不涨）
          · 6 Boss   → `story/boss/`
          · 主视觉/题字 → **不进本脚本**：成品是 `brand/kv-main.jpg`（主包，压过再进），
                         原图只落 `story-inbox/kv-raw/`；旧的 `icons/` 已归档到
                         `story-inbox/legacy-icons/`，**正常路径不再引用**
     ② **SVG 图标**（36 世界 + 24 全局）——编译成 `js/assets-icons.js`：
        小游戏 Canvas **不能可靠地直接画 SVG 文件**（`createImage` 不带 SVG 解码器，
        iOS/Android 表现还不一致）。而这个项目本来就有一套"矢量 op + 运行时着色"的图标体系
        （`CV.drawIcon` / `CV.GLYPHS`）。所以这里做的是**编译**，不是贴图：
          SVG（源，保持矢量可改色）→ 归一化到 24×24 的路径 op → 运行时 `ctx` 重放 + `fill`
        好处：矢量、可改色、无位图、不依赖字体、包体最小、与小游戏 Canvas 完全兼容。

   ⚠️ 三条纪律：
     · **不删 fallback**：老 op 表（NAV_ICONS / CUR_ICONS / WORLD_ICONS / BLOOD_GLYPH /
       FACTION_GLYPH）一个都不动，新表只是"优先命中"。
     · **不动文件名**：素材文件名就是契约（`icon_ico_world_W01.svg` → id `ico_world_W01`）。
     · 编译产物是**生成物**：改素材后重跑本脚本，不要手改 `js/assets-icons.js`。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* ================= 素材来源（2026-10-01 · 父亲大人 §三十一） =================
   **优先读仓库里的 `story/icons-src/`**（60 个 SVG 源文件已经收进来了）——
   这样 clone 仓库就能**直接重跑本脚本**重新生成 `js/assets-icons.js`，链路自洽。
   开发机上那份 `游戏素材/RESYU_VISUAL_ASSETS/`（含 19 张图片）只作 **fallback**：
   图片不在仓库里（22MB，且它们已经在 story/ 各就各位），要重跑图片那一段时才需要它。
   ⚠️ `story/icons-src/` 在 `project.config.json` 的 `packOptions.ignore` 里 —— 它是**设计源**，
     不进小游戏包（分包根目录里放什么都算分包内容，得显式排除）。 */
const ARG = process.argv[2] || process.env.ASSETS || '';
const SVG_DIR = path.resolve(ROOT, 'story/icons-src');
const SRC = ARG || (fs.existsSync(SVG_DIR) && fs.readdirSync(SVG_DIR).some((f) => /\.svg$/i.test(f))
  ? SVG_DIR
  : path.resolve(ROOT, '../游戏素材/RESYU_VISUAL_ASSETS'));

/* ===================== ① 路径解析（M/L/H/V/C/S/Q/T/Z，绝对+相对） ===================== */
function tokenize(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) out.push(m[1] !== undefined ? { c: m[1] } : { n: parseFloat(m[2]) });
  return out;
}
/* 出参统一成 0~24 网格的 op：
     ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Q',x1,y1,x,y] ['Z']
     ['R',x,y,w,h] 矩形   ['E',cx,cy,rx,ry] 椭圆/圆 */
function parsePath(d, k) {
  const tk = tokenize(d), ops = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  let prev = '', prevC = null, prevQ = null;
  const P = (v) => Math.round(v * k * 10) / 10;
  const num = () => tk[i++].n;
  while (i < tk.length) {
    let cmd = tk[i].c;
    if (cmd) i++; else cmd = prev;
    const rel = cmd >= 'a';
    const C = cmd.toUpperCase();
    if (C === 'M' || C === 'L' || C === 'T') {
      const x = num(), y = num();
      const nx = rel ? cx + x : x, ny = rel ? cy + y : y;
      if (C === 'M') { ops.push(['M', P(nx), P(ny)]); sx = nx; sy = ny; }
      else if (C === 'L') ops.push(['L', P(nx), P(ny)]);
      else {   /* T：二次平滑 —— 反射上一个 Q 的控制点 */
        const qx = prevQ ? 2 * cx - prevQ[0] : cx, qy = prevQ ? 2 * cy - prevQ[1] : cy;
        ops.push(['Q', P(qx), P(qy), P(nx), P(ny)]);
        prevQ = [qx, qy];
      }
      cx = nx; cy = ny; prevC = null;
    } else if (C === 'H' || C === 'V') {
      const v = num();
      const nx = C === 'H' ? (rel ? cx + v : v) : cx;
      const ny = C === 'V' ? (rel ? cy + v : v) : cy;
      ops.push(['L', P(nx), P(ny)]);
      cx = nx; cy = ny; prevC = null;
    } else if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { const a = num(), b = num(); x1 = rel ? cx + a : a; y1 = rel ? cy + b : b; }
      else { x1 = prevC ? 2 * cx - prevC[0] : cx; y1 = prevC ? 2 * cy - prevC[1] : cy; }
      const a2 = num(), b2 = num(), a3 = num(), b3 = num();
      const x2 = rel ? cx + a2 : a2, y2 = rel ? cy + b2 : b2;
      const nx = rel ? cx + a3 : a3, ny = rel ? cy + b3 : b3;
      ops.push(['C', P(x1), P(y1), P(x2), P(y2), P(nx), P(ny)]);
      prevC = [x2, y2]; prevQ = null;
      cx = nx; cy = ny;
    } else if (C === 'Q') {
      const a = num(), b = num(), a2 = num(), b2 = num();
      const x1 = rel ? cx + a : a, y1 = rel ? cy + b : b;
      const nx = rel ? cx + a2 : a2, ny = rel ? cy + b2 : b2;
      ops.push(['Q', P(x1), P(y1), P(nx), P(ny)]);
      prevQ = [x1, y1]; prevC = null;
      cx = nx; cy = ny;
    } else if (C === 'Z') {
      ops.push(['Z']); cx = sx; cy = sy; prevC = null; prevQ = null;
    } else { i++; continue; }        /* 认不出来的指令就跳过（不让一个怪指令毁掉整张图） */
    prev = cmd;
  }
  return ops;
}
/* 圆角矩形 → 4 条直线 + 4 段二次曲线（比"拿方角顶替"忠实） */
function rectOps(x, y, w, h, rx, ry, k) {
  const P = (v) => Math.round(v * k * 10) / 10;
  if (!rx && !ry) return [['R', P(x), P(y), P(w), P(h)]];
  rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
  return [
    ['M', P(x + rx), P(y)], ['L', P(x + w - rx), P(y)],
    ['Q', P(x + w), P(y), P(x + w), P(y + ry)],
    ['L', P(x + w), P(y + h - ry)],
    ['Q', P(x + w), P(y + h), P(x + w - rx), P(y + h)],
    ['L', P(x + rx), P(y + h)],
    ['Q', P(x), P(y + h), P(x), P(y + h - ry)],
    ['L', P(x), P(y + ry)],
    ['Q', P(x), P(y), P(x + rx), P(y)], ['Z'],
  ];
}
function attr(tag, name) {
  const m = new RegExp(name + '\\s*=\\s*"([^"]*)"').exec(tag);
  return m ? m[1] : null;
}
/* 一张 SVG → op 表（viewBox 归一化到 24×24；`<defs>` 整段丢掉：渐变/裁剪不吃） */
function compileSvg(src) {
  const doc = String(src).replace(/<defs[\s\S]*?<\/defs>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const vb = attr(doc, 'viewBox') || '0 0 240 240';
  const p = vb.trim().split(/[\s,]+/).map(Number);
  const vw = p[2] || 240, vh = p[3] || 240;
  const k = 24 / vw, ky = 24 / vh;
  const ops = [];
  const re = /<(path|rect|circle|ellipse)\b[^>]*\/?>/g;
  let m;
  while ((m = re.exec(doc))) {
    const tag = m[0], kind = m[1];
    if (kind === 'path') {
      const d = attr(tag, 'd');
      if (d) parsePath(d, k).forEach((o) => ops.push(o));
    } else if (kind === 'rect') {
      const x = +(attr(tag, 'x') || 0), y = +(attr(tag, 'y') || 0);
      const w = +(attr(tag, 'width') || 0), h = +(attr(tag, 'height') || 0);
      const rx = +(attr(tag, 'rx') || 0), ry = +(attr(tag, 'ry') || 0);
      if (w > 0 && h > 0) rectOps(x, y, w, h, rx, ry, k).forEach((o) => ops.push(o));
    } else {
      const r = +(attr(tag, 'r') || 0);
      const rx = kind === 'circle' ? r : +(attr(tag, 'rx') || 0);
      const ry = kind === 'circle' ? r : +(attr(tag, 'ry') || 0);
      const cx = +(attr(tag, 'cx') || 0), cy = +(attr(tag, 'cy') || 0);
      if (rx > 0 && ry > 0) ops.push(['E', Math.round(cx * k * 10) / 10, Math.round(cy * ky * 10) / 10,
        Math.round(rx * k * 10) / 10, Math.round(ry * ky * 10) / 10]);
    }
  }
  return ops;
}

module.exports = { compileSvg, parsePath };

/* ===================== ② 只在直接运行时才真的写盘 ===================== */
if (require.main !== module) return;

if (!fs.existsSync(SRC)) {
  console.error('找不到素材目录：' + SRC);
  process.exit(1);
}
const files = fs.readdirSync(SRC).filter((f) => /\.(svg|jpg|png)$/i.test(f));
const svgFiles = files.filter((f) => /\.svg$/i.test(f));
const worldSvg = svgFiles.filter((f) => /^icon_ico_world_W\d\d\.svg$/.test(f));
const globalSvg = svgFiles.filter((f) => /^icon_ico_(nav|currency|blood|theme|element)_/.test(f));

/* ---------- 图片：按正式文件名复制到工程 ---------- */
const copies = [];
function cp(from, toRel) {
  const to = path.join(ROOT, toRel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(SRC, from), to);
  copies.push(toRel + '  (' + Math.round(fs.statSync(to).size / 1024) + ' KB)');
}
/* ================= 2026-10-03：图片**不再原样复制，一律先压再落包** =================
   父亲大人送来的 36 世界场景 + 36 Boss + 深井，原图合计 **227 MB** ——
   小游戏主包 4 MB、分包也有总上限，原样复制等于传不上去。
   压缩这一步收口在 `scripts/_imgpack.py`（尺寸/质量/为什么 Boss 必须留透明 PNG 都写在它的文件头），
   这里只负责**调它**：源目录就是本次的素材目录，产物落 `story/scene/` 与 `story/boss/`。
   ⚠️ 它按**文件名**认图（img_scene_W##.jpg / img_boss_W##.png / img_scene_深井.jpg），
      不认识的一律不动 —— 不会把不相干的东西塞进分包。 */
if (files.some((f) => /^img_(scene|boss)_/.test(f))) {
  const r = require('child_process').spawnSync('python3',
    [path.join(ROOT, 'scripts/_imgpack.py'), SRC], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('图片压缩入库失败（见上面 python 的报错）'); process.exit(1); }
}
/* 主视觉：现有 mv-main-lamp.jpg 留着当兜底，新图另存一个名字（页面自己挑） */
/* ================= 主视觉 + 题字（2026-10-02 · 父亲大人） =================
   「主画面和主题字**要放在主包**，该压就压……确保开机就能看到」。
   它们落在 `brand/`（主包），**不进 story 分包**：
     · `brand/kv-main.jpg`    1080×1920 · JPEG q70 · **265KB**
     · `brand/logo-title.png` 1000×475  · 256 色量化 PNG · **135KB**（透明无损）
   两张合计 400KB，主包仍在 4MB 之内。
   ⚠️ 本脚本**不直接覆盖**这两张 —— 它们是要压过才能进包的成品。
      原图只放到 `story-inbox/kv-raw/`（那份目录被 packOptions.ignore 排除，永远不进包），
      要重新压就照下面打印的两条命令跑一次。这样不会哪天一跑脚本把 4.89MB 的原图
      直接铺进主包（那会把主包顶爆）。 */
if (files.indexOf('img_main_kv.jpg') >= 0) cp('img_main_kv.jpg', 'story-inbox/kv-raw/img_main_kv.jpg');
if (files.indexOf('logo-title.png') >= 0) cp('logo-title.png', 'story-inbox/kv-raw/logo-title.png');

/* ---------- SVG：编译 ---------- */
const table = {};
const warn = [];
svgFiles.concat([]).forEach((f) => {
  const id = f.replace(/^icon_/, '').replace(/\.svg$/i, '');   // icon_ 前缀是投递约定，运行时去掉
  const ops = compileSvg(fs.readFileSync(path.join(SRC, f), 'utf8'));
  if (!ops.length) { warn.push(f + '（一条可画路径都没有）'); return; }
  table[id] = ops;
});

const head = '/* 自动生成，不要手改 —— 由 `node scripts/build-visual-assets.js` 从素材重新编译。\n'
  + '   源：RESYU_VISUAL_ASSETS/icon_*.svg（240×240 填充路径）→ 归一化到 24×24 的路径 op。\n'
  + '   为什么是编译而不是贴图：小游戏 Canvas 不能可靠地直接解码 SVG；本工程本来就有\n'
  + '   "矢量 op + 运行时着色"的图标体系，编译进来才既能改色、又不吃包体、也不怕平台差异。 */\n';
const body = '(function () {\n  const G = (typeof GameGlobal !== \'undefined\') ? GameGlobal : globalThis;\n'
  + '  G.ICON_ASSETS = ' + JSON.stringify(table) + ';\n})();\n';
/* ⚠️ 只在**真的有 SVG 源**时才重写图标表。2026-10-03：本脚本现在也会被拿图片当参数调用
   （`node scripts/build-visual-assets.js "…/游戏素材/新图"`，那里一张 SVG 都没有）——
   不设这道闸就会把 `js/assets-icons.js` 覆盖成一张**空表**，全站图标当场全没。 */
if (svgFiles.length) {
  fs.writeFileSync(path.join(ROOT, 'js/assets-icons.js'), head + body);
} else {
  console.log('⚠️ 素材目录里没有 SVG —— 跳过图标编译（js/assets-icons.js 保持原样，没被动过）');
}

console.log('素材目录：' + SRC);
console.log('复制图片 ' + copies.length + ' 个：');
copies.forEach((c) => console.log('  ' + c));
if (!copies.length) console.log('  （这个目录里没有图片 —— 只重建图标表；19 张图片已经在工程里了）');
console.log('编译 SVG ' + Object.keys(table).length + ' 个'
  + '（世界 ' + worldSvg.length + ' · 全局 ' + globalSvg.length + '）');
console.log('产物：js/assets-icons.js  ' + Math.round(fs.statSync(path.join(ROOT, 'js/assets-icons.js')).size / 1024) + ' KB');
console.log('主视觉 / 题字的压缩命令（成品在 brand/，要重压时手动跑这两条）：');
console.log('  sips -s format jpeg -s formatOptions 70 --resampleWidth 1080 story-inbox/kv-raw/img_main_kv.jpg --out brand/kv-main.jpg');
console.log('  python3 -c "from PIL import Image; im=Image.open(\'story-inbox/kv-raw/logo-title.png\').convert(\'RGBA\'); im=im.resize((1000, round(im.height*1000/im.width)), Image.LANCZOS); im.quantize(colors=256).save(\'brand/logo-title.png\', optimize=True)"');
if (warn.length) console.log('⚠️  ' + warn.join(' / '));
