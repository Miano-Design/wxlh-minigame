/* 命格印记体检（小游戏端）：node scripts/glyph_audit.js
   ==============================================================================
   起因（V1.1.4 · 父亲大人："开屏的主画面和各个血统的图标看着都好劣质，画得精美一点"）：
   六枚印记原来**各是一个多边形、单色实心** —— 18px 下就是六个色块、细部为 0。
   现在每枚 = 若干块（t=0 主体 / 1 内芯 .55 / 2 刻痕 .30）。可"画得精美一点"这句话
   本身没法验收，所以这里把它拆成**能数出来的四件事**（都是 32px / 14px 上量出来的）：
     ① 各具其形：32px 缩略图上六枚两两 IoU ≤ 0.5（旧表最像的一对是 0.73 —— 一枚"圆"一枚"盾"）
     ② 不是一块实心：每枚都"有镂空、或有分离的块"（单连通一块 = 退回旧版那种色块）
     ③ 细节没糊：32px 上"内芯 + 刻痕"在本枚墨迹里占到 ≥ 8%（否则等于白加了一层）
     ④ 不出框 + 两端同源：每块顶点都在 0~1 内，且两端渲染都从 D.BLOOD_GLYPH 取（没各写一套）
   另加一条**不许动**的钉子：六套锚色（BLOOD_THEME[x].lamp）与相邻间隔 —— 本轮只改形状，
   色值一个都不许动（表里写死的是"改之前的实测值"，改了这里就红）。
   只读脚本：自己解析 data.js 的顶点表 + 自己栅格化（不依赖画布）。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
/* V1.1.11（网页版归档）：⑤ 那两条是"两端同源"对表 —— 网页版没了就 ⏭ 跳过，其余照评。 */
const WB = require('./_web_basis');

/* ---------- 把 data.js 里的 BLOOD_GLYPH / BLOOD_THEME 取出来 ---------- */
const src = fs.readFileSync(path.join(JS, 'data.js'), 'utf8');
const grab = (name) => {
  const i = src.indexOf('const ' + name + ' = {');
  if (i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(j, k + 1);
};
const GLYPH = eval('(' + grab('BLOOD_GLYPH') + ')');
const THEME = eval('(' + grab('BLOOD_THEME') + ')');
const NAMES = eval('(' + grab('BLOOD_GLYPH_NAME') + ')');
const IDS = Object.keys(THEME);

/* ---------- 自己栅格化（多边形覆盖率，超采样抗锯齿） ---------- */
function coverage(poly, size) {
  const SS = 6, g = size * SS;
  const cov = new Float64Array(size * size);
  const grid = new Float64Array(g * g);
  const xs = new Float64Array(poly.length), ys = new Float64Array(poly.length);
  poly.forEach((p, i) => { xs[i] = p[0]; ys[i] = p[1]; });
  for (let py = 0; py < g; py++) {
    const fy = (py + 0.5) / g;
    for (let px = 0; px < g; px++) {
      const fx = (px + 0.5) / g;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = xs[i], yi = ys[i], xj = xs[j], yj = ys[j];
        if (((yi > fy) !== (yj > fy)) && (fx < (xj - xi) * (fy - yi) / (yj - yi) + xi)) inside = !inside;
      }
      grid[py * g + px] = inside ? 1 : 0;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) s += grid[(y * SS + dy) * g + (x * SS + dx)];
      }
      cov[y * size + x] = s / (SS * SS);
    }
  }
  return cov;
}

function maskOf(parts, size) {
  const m = new Uint8Array(size * size);
  parts.forEach((part) => {
    const cov = coverage(part.p, size);
    for (let i = 0; i < m.length; i++) if (cov[i] >= 0.5) m[i] = 1;
  });
  return m;
}
function detailMaskOf(parts, size) {
  const m = new Uint8Array(size * size), ink = new Uint8Array(size * size);
  parts.forEach((part) => {
    const cov = coverage(part.p, size);
    for (let i = 0; i < m.length; i++) {
      if (cov[i] >= 0.5) ink[i] = 1;
      if (part.t >= 1 && cov[i] >= 0.35) m[i] = 1;
    }
  });
  let inkN = 0, detN = 0;
  for (let i = 0; i < m.length; i++) { if (ink[i]) inkN++; if (ink[i] && m[i]) detN++; }
  return inkN ? detN / inkN : 0;
}
/* 4 连通分量 + 被围住的背景块（镂空）。先对墨迹做一次 3×3 闭运算补掉 1px 缝
   —— 环是"一个带细缝的多边形"画的，那条缝肉眼不存在，却会让背景漏出去。 */
function compsHoles(m, size) {
  const at = (a, x, y) => (x < 0 || y < 0 || x >= size || y >= size) ? 0 : a[y * size + x];
  const closed = new Uint8Array(m.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let all = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) all |= at(m, x + dx, y + dy);
      closed[y * size + x] = all;
    }
  }
  const label = (arr, want) => {
    const lab = new Int16Array(size * size); let n = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== want || lab[i]) continue;
      n++;
      const st = [i]; lab[i] = n;
      while (st.length) {
        const p = st.pop(), x = p % size, y = (p - x) / size;
        const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        nb.forEach(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
          const q = ny * size + nx;
          if (arr[q] === want && !lab[q]) { lab[q] = n; st.push(q); }
        });
      }
    }
    return { lab, n };
  };
  const comps = label(m, 1).n;
  const bg = new Uint8Array(size * size);
  for (let i = 0; i < bg.length; i++) bg[i] = closed[i] ? 0 : 1;
  const { lab, n } = label(bg, 1);
  const border = new Set();
  for (let x = 0; x < size; x++) { border.add(lab[x]); border.add(lab[(size - 1) * size + x]); }
  for (let y = 0; y < size; y++) { border.add(lab[y * size]); border.add(lab[y * size + size - 1]); }
  border.delete(0);
  return { comps, holes: n - border.size };
}
const iou = (a, b) => {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] && b[i]; const u = a[i] || b[i]; if (x) inter++; if (u) uni++; }
  return uni ? inter / uni : 1;
};

console.log('\n=== 命格印记（六枚徽记）· 可数出来的四条 ===');
{
  const masks32 = {}, masks14 = {};
  IDS.forEach((k) => {
    const g = GLYPH[k];
    t('「' + k + '」的印记表在（块数 ≥ 2，且每块都有顶点表）',
      !!g && Array.isArray(g.parts) && g.parts.length >= 2 && g.parts.every((p) => Array.isArray(p.p) && p.p.length >= 3),
      g ? g.parts.length + ' 块（' + NAMES[k] + '）' : '缺表');
    masks32[k] = maskOf(g.parts, 32);
    masks14[k] = maskOf(g.parts, 14);
  });

  /* ① 各具其形 */
  let worst = { pair: '', v: 0 }, worst14 = { pair: '', v: 0 };
  for (let i = 0; i < IDS.length; i++) {
    for (let j = i + 1; j < IDS.length; j++) {
      const v = iou(masks32[IDS[i]], masks32[IDS[j]]);
      if (v > worst.v) worst = { pair: IDS[i] + '×' + IDS[j], v };
      const v14 = iou(masks14[IDS[i]], masks14[IDS[j]]);
      if (v14 > worst14.v) worst14 = { pair: IDS[i] + '×' + IDS[j], v: v14 };
    }
  }
  t('① 32px 缩略图上"各具其形"：两两 IoU ≤ 0.5', worst.v <= 0.5,
    '最像的一对 ' + worst.pair + ' = ' + worst.v.toFixed(2) + '（旧表同一把尺子是 0.73）');
  t('① 14px（网页版最小的一档）也分得开：两两 IoU ≤ 0.6', worst14.v <= 0.6,
    '最像的一对 ' + worst14.pair + ' = ' + worst14.v.toFixed(2) + '（旧表 0.76）');

  /* ② 不是一块实心 */
  const flat = IDS.filter((k) => { const c = compsHoles(masks32[k], 32); return c.comps + c.holes < 2; });
  t('② 每枚都"有镂空、或有分离的块"（不是一块实心色块）', flat.length === 0,
    flat.length ? '还是色块的：' + flat.join(',') : IDS.map((k) => {
      const c = compsHoles(masks32[k], 32); return k + ' ' + c.comps + '块/' + c.holes + '镂空';
    }).join(' · '));

  /* ③ 细节没糊 */
  const thin = IDS.filter((k) => detailMaskOf(GLYPH[k].parts, 32) < 0.08);
  t('③ 32px 上"内芯 + 刻痕"占到本枚墨迹 ≥ 8%（细节没糊）', thin.length === 0,
    IDS.map((k) => k + ' ' + Math.round(detailMaskOf(GLYPH[k].parts, 32) * 100) + '%').join(' · '));

  /* ④ 不出框 */
  const out = [];
  IDS.forEach((k) => GLYPH[k].parts.forEach((part, i) => part.p.forEach(([x, y]) => {
    if (x < 0 || x > 1 || y < 0 || y > 1) out.push(k + ' 第' + (i + 1) + '块 (' + x + ',' + y + ')');
  })));
  t('④ 每块顶点都在 0~1 框内（两端的框就是这一个，不许出框）', out.length === 0,
    out.length ? out.slice(0, 4).join('；') : '6 × 若干块，全在框内');

  /* ⑤ 两端同源 */
  const web = WB.read('js/ui.js');
  const mini = fs.readFileSync(path.join(JS, 'cv.js'), 'utf8');
  WB.OK ? t('⑤ 顶点表只有一份：两端渲染都从 D.BLOOD_GLYPH 取（谁都没自己写一套形状）',
    /D\.BLOOD_GLYPH\[bl\]/.test(web) && /DATA\.BLOOD_GLYPH/.test(mini))
    : WB.skip('⑤ 顶点表只有一份（两端同源）');
  WB.OK ? t('⑤ 三档调子两端同一套（网页版 fill-opacity ／ 小游戏 CV.a）',
    /BL_TONE = \[1, 0\.55, 0\.3\]/.test(web) && /BL_TONE = \[1, \.55, \.30\]/.test(mini))
    : WB.skip('⑤ 三档调子两端同一套');

  /* ⑥ 锚色与相邻间隔：本轮一个都不许动（写死的是改之前的实测值） */
  const LAMP = { 狼人: '#6a9836', 修真: '#369b87', 绯红: '#cd6f7f', 科技: '#7b87d1', 念动力: '#b671cd', 泰坦: '#a8873b' };
  const moved = IDS.filter((k) => String(THEME[k].lamp).toLowerCase() !== LAMP[k]);
  t('⑥ 六套锚色一个都没动（本轮只改形状）', moved.length === 0,
    moved.length ? moved.map((k) => k + '：' + THEME[k].lamp + ' ≠ ' + LAMP[k]).join('；') : '6/6 与改动前一致');

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
}
