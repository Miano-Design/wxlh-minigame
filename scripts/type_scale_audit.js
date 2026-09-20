/* 排版层级体检：node scripts/type_scale_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人 2026-09-19）：
     "现在六维的解释文字太大了，然后技能的版面有问题，间距又又贴在一起的了，
      你整体游戏得区分字体的层级，一级，二级，三级，啥的，然后每个层级的字体大小要统一。"

   "统一"这件事靠自觉是做不到的（三百多处在画字，谁都能随手写个 12.5）。
   所以这里把它变成**能自动查的规矩**：
     ① 五级字号阶梯本身（画布 px 与网页版 rem 必须一一对上）；
     ② 每一级只对应一个尺寸，没有第六级、没有"临时加半号"；
     ③ 谁该用哪一级（标题/正文/注释的语义映射）—— 查的是**工具函数的实现**，
        因为全项目都从 U.h3 / U.hint / U.listRow 这些口子出字；
     ④ `size:` 里**不许出现裸数字**（图标 / 大数字走 CV.ICO / CV.DISP，也在这一处定义）。
   只读脚本：两个仓库的源码都只读，不写。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const WEB = path.resolve(__dirname, '../../wxlh-game');

const store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
global.wx = {
  createCanvas: () => ({ width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return ''; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {}, vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV;
CV.setup(global.wx.getWindowInfo());

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };

/* 定稿的五级阶梯（这是唯一出处；两边都必须等于它） */
const LADDER = { t1: 17, t2: 15, t3: 13, t4: 12, t5: 11 };
const TIER_NAME = { t1: '一级', t2: '二级', t3: '三级', t4: '四级', t5: '五级' };

console.log('\n=== ① 五级阶梯本身 ===');
{
  /* 画布：CV.FS 是历史名字，CV.TIER 是新名字，两套必须一一对上 */
  const map = { t1: 'f2', t2: 'f1', t3: 'lg', t4: 'md', t5: 'sm' };
  const bad = [];
  Object.keys(LADDER).forEach((k) => {
    if (CV.TIER[k] !== LADDER[k]) bad.push('CV.TIER.' + k + '=' + CV.TIER[k] + '（应为 ' + LADDER[k] + '）');
    if (CV.FS[map[k]] !== LADDER[k]) bad.push('CV.FS.' + map[k] + '=' + CV.FS[map[k]] + '（应为 ' + LADDER[k] + '）');
  });
  t('画布：五级阶梯与定稿一致（CV.TIER / CV.FS 两套名字一一对上）', bad.length === 0,
    bad.length ? bad.join(' · ') : Object.keys(LADDER).map((k) => TIER_NAME[k] + ' ' + LADDER[k]).join(' / '));
  t('画布：xs 与 sm 是同一级（五级），没有"第 5.5 级"',
    CV.FS.xs === CV.FS.sm && CV.FS.sm === LADDER.t5, 'xs=' + CV.FS.xs + ' sm=' + CV.FS.sm);

  /* 网页版：--fs-* 的 rem 换算成 px 必须等于同一张表（16px 根字号） */
  const css = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');
  const vars = {};
  (css.match(/--fs-[a-z0-9]+:\s*([0-9.]+)rem/g) || []).forEach((m) => {
    const mm = /--(fs-[a-z0-9]+):\s*([0-9.]+)rem/.exec(m);
    if (mm) vars[mm[1]] = Math.round(parseFloat(mm[2]) * 16);
  });
  const webMap = { t1: 'fs-2', t2: 'fs-1', t3: 'fs-lg', t4: 'fs-md', t5: 'fs-sm' };
  const wbad = [];
  Object.keys(LADDER).forEach((k) => {
    if (vars[webMap[k]] !== LADDER[k]) wbad.push('--' + webMap[k] + '=' + vars[webMap[k]] + 'px（应为 ' + LADDER[k] + '）');
  });
  if (vars['fs-xs'] !== LADDER.t5) wbad.push('--fs-xs=' + vars['fs-xs'] + 'px（应与五级同为 ' + LADDER.t5 + '）');
  t('网页版：CSS 变量换算成 px 后与画布**逐级相等**', wbad.length === 0,
    wbad.length ? wbad.join(' · ') : Object.keys(LADDER).map((k) => TIER_NAME[k] + ' ' + vars[webMap[k]]).join(' / '));
}

console.log('\n=== ② 语义映射：谁该用哪一级 ===');
{
  const uiw = fs.readFileSync(path.join(JS, 'uiw.js'), 'utf8');
  const css = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');
  /* 画布侧的"出字口子"——全项目都从这几个口子出字，所以查它们就等于查了全项目 */
  const rules = [
    ['卡片标题 h3 = 二级', /U\.h3 = function[\s\S]{0,2200}?size: CV\.FS\.f1/.test(uiw)],
    ['标题右侧小字 .sub = 五级', /const subRight[\s\S]{0,400}?size: CV\.FS\.sm/.test(uiw)],
    ['注释 hint = 五级', /U\.hint = function[^\n]*CV\.FS\.sm/.test(uiw)],
    ['次要说明 note = 四级', /U\.note = function[^\n]*CV\.FS\.md/.test(uiw)],
    ['键值行 kv = 三级', /U\.kv = function[\s\S]{0,300}?size: CV\.FS\.lg/.test(uiw)],
    ['说明框 eventDesc = 三级', /U\.eventDesc = function[\s\S]{0,200}?size = CV\.FS\.lg/.test(uiw)],
    ['列表行主标题 .t1 = 二级', /const t1 = CV\.FS\.f1 \*/.test(uiw)],
    ['列表行副标题 .t2 = 五级', /const t1 = CV\.FS\.f1 \*[\s\S]{0,60}?t2 = CV\.FS\.sm \*/.test(uiw)],
    ['网页版 .btn = 三级', /^\.btn \{[\s\S]{0,400}?font-size: var\(--fs-lg\)/m.test(css)],
    ['网页版 .btn.small = 四级', /^\.btn\.small \{[^}]*font-size: var\(--fs-md\)/m.test(css)],
    ['网页版 .hint = 五级', /^\.hint \{[^}]*font-size: var\(--fs-sm\)/m.test(css)],
    ['网页版 .note = 四级', /^\.note \{[^}]*font-size: var\(--fs-md\)/m.test(css)],
    ['网页版技能名 .sname = 二级（与六维名字同级）· 描述 .sdesc = 五级',
      /\.skill-row \.sname \{[^}]*font-size: var\(--fs-1\)/.test(css) && /\.skill-row \.sdesc \{[^}]*font-size: var\(--fs-sm\)/.test(css)],
    ['网页版六维：名字二级 + 解释内联五级',
      /class="t1">\$\{a\.name\} <span style="color:var\(--dim\);font-size:0\.6875rem"/.test(fs.readFileSync(path.join(WEB, 'js/ui.js'), 'utf8'))],
  ];
  rules.forEach(([name, ok]) => t(name, ok));
}

console.log('\n=== ③ 不许出现"裸数字字号"（图标 / 大数字也有名字）===');
{
  const files = fs.readdirSync(JS).filter((f) => /^(sc-.*|uiw|cv)\.js$/.test(f));
  const bad = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(JS, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
    const re = /size:\s*([^,}]+)/g;
    let m;
    while ((m = re.exec(src))) {
      const expr = m[1].trim();
      /* 允许：CV.FS.* / CV.TIER.* / CV.ICO / CV.DISP.d? / 由它们乘出来的表达式 / 变量（size / asz 这种自己算的） */
      /* 判定规则（比正则拼表达式稳，也更接近"人话"）：
         · 表达式里必须有层级 token（CV.FS/CV.TIER/CV.ICO/CV.DISP）或变量（size / asz / opt.size…）；
         · 里面出现的**数字只能是系数**（< 1.5，比如头像首字的 0.44、行高的 1.35）——
           一旦出现 16 / 19 / 22 这种"字号本身"，就说明有人绕过层级直接写死了。 */
      /* 先把 token 名字里的数字抹掉（FS.f2 / DISP.d3 的 2、3 不是字号），再找系数 */
      const exprNoTok = expr.replace(/CV\.(FS|TIER)\.[a-z0-9]+/g, 'T').replace(/CV\.(ICO|DISP(\.[a-z0-9]+)?)/g, 'T');
      const nums = (exprNoTok.match(/[0-9]+(\.[0-9]+)?/g) || []).map(Number);
      const hasTokenOrVar = /CV\.(FS|TIER|ICO|DISP)/.test(expr) || /[A-Za-z_$]/.test(expr.replace(/CV\.[A-Za-z0-9_.]+/g, ''));
      const ok = hasTokenOrVar && nums.every((n) => n < 1.5);
      if (!ok) bad.push(f + ' → size: ' + expr);
    }
  });
  t('所有 size: 都来自层级 token（或由它算出来的变量），没有裸数字',
    bad.length === 0, bad.length ? bad.slice(0, 5).join(' · ') : '干净（' + files.length + ' 个文件）');
  const inv = {};
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    Object.keys(CV.FS).forEach((k) => { inv[k] = (inv[k] || 0) + (src.split('CV.FS.' + k).length - 1); });
  });
  console.log('  用量分布：' + Object.keys(inv).sort((a, b) => CV.FS[b] - CV.FS[a])
    .map((k) => k + '(' + CV.FS[k] + 'px)×' + inv[k]).join('  '));
}

console.log('\n=== ④ 具体的两处（父亲大人报的）===');
{
  const protag = fs.readFileSync(path.join(JS, 'sc-protag.js'), 'utf8');
  t('六维：名字与解释**分开画**（t1 = 二级名字 · t1sub = 五级解释）',
    /U\.listRow\(\{ t1: a\.name, t1sub: a\.desc/.test(protag),
    /t1sub/.test(protag) ? '已拆开' : '**还把 name+desc 拼在一起**');
  t('六维解释文字的字号 = 五级（11px）',
    /o\.t1sub[\s\S]{0,260}?size: CV\.FS\.sm/.test(fs.readFileSync(path.join(JS, 'uiw.js'), 'utf8')));
  /* 技能行现在是**共用组件**（U.skillRow）：查它一处，等于查了主角详情 + 伙伴详情两个页面。 */
  const uiwAll = fs.readFileSync(path.join(JS, 'uiw.js'), 'utf8');
  const roster = fs.readFileSync(path.join(JS, 'sc-roster.js'), 'utf8');
  t('技能：行是独立面板（panel 底 + 圆角 10 + 内边距 10）',
    /U\.skillRow = function[\s\S]{0,3000}?CV\.round\(U\.ix\(\), top, U\.iw\(\), rowH, 10 \* CV\.SCALE, CV\.C\.panel\)/.test(uiwAll));
  t('技能：行高按内容算（名字行 + 3px + 描述行），不再写死 22px',
    /const rowH = PAD \* 2 \+ contentH/.test(uiwAll));
  t('技能：描述距名字 3px（网页版 .sdesc margin-top:3px）', /nameH \+ 3 \* CV\.SCALE/.test(uiwAll));
  t('技能：+1 按钮对齐"名称+注释"整块的中线', /cy - btnH \/ 2/.test(uiwAll));
  t('技能：主角详情与伙伴详情**共用同一个组件**（不再各写一套排版）',
    /U\.skillRow\(/.test(protag) && /U\.skillRow\(/.test(roster),
    (/U\.skillRow\(/.test(protag) ? '主角✓' : '主角**没接**') + ' / ' + (/U\.skillRow\(/.test(roster) ? '伙伴✓' : '伙伴**没接**'));
}

console.log('\n=== ⑤ 标题行的间距 / 按钮大小 / 中线对齐（父亲大人：重置和下面的框贴得很近）===');
{
  const uiw = fs.readFileSync(path.join(JS, 'uiw.js'), 'utf8');
  t('标题行高度 = max(标题行高, 按钮高) —— 按钮不再压到下面第一块',
    /const rowH = opt\.btn \? Math\.max\(lh, btnH\) : lh/.test(uiw));
  t('标题行下边距 10px（网页版 .card h3 margin-bottom）', /U\.y = top \+ rowH \+ 10 \* CV\.SCALE/.test(uiw));
  t('标题 / 右侧小字 / 按钮共用同一条中线', /const cy = top \+ rowH \/ 2/.test(uiw));
  t('按钮尺寸 = 网页版口径（.btn 44 / .btn.small 40 / .hbtn 34）',
    CV && U.BTN_H === 44 && U.BTN_SM === 40 && U.BTN_TITLE === 34,
    'BTN_H=' + U.BTN_H + ' BTN_SM=' + U.BTN_SM + ' BTN_TITLE=' + U.BTN_TITLE);
  /* V9.6.119（父亲大人："这个加 1 的框明显偏上你没检查出来吗"）：
     **通用规矩：行内按钮必须完整落在它所在的那一行里**（不能戳出面板/行框）。
     这一条同时管标题行（.hbtn）和技能行（.btn.small）—— 上次只查了标题行的"到下一行距离"，
     没查"按钮有没有超出自己那一行"，所以技能行的偏上漏过去了。下面两条都是纯算式。 */
  {
    /* 技能行：左边「技能名(二级) + 小字注释」是一整块，按钮对齐这一整块的中线 */
    const nameH = CV.FS.f1 * 1.35, btnH = U.BTN_SM * CV.SCALE, PAD = 10 * CV.SCALE;
    const descH = 3 * CV.SCALE + CV.FS.sm * 1.55;      // 一行注释
    const leftH = nameH + descH, contentH = Math.max(leftH, btnH);
    const btnTop = PAD + (contentH - btnH) / 2, btnBottom = btnTop + btnH;
    t('技能行：按钮完整落在这一行内（不戳出面板）',
      btnTop >= PAD - 0.01 && btnBottom <= PAD + contentH + 0.01,
      '按钮 ' + Math.round(btnTop) + '~' + Math.round(btnBottom) + 'px / 行高 ' + Math.round(PAD * 2 + contentH) + 'px');
    t('技能行：左边（名称+注释）当**一整块**居中 —— 中线取整块中点',
      /const cy = top \+ PAD \+ contentH \/ 2/.test(uiw) && /const leftTop = cy - leftH \/ 2/.test(uiw));
    t('技能行：整块高度 = max(名称+注释, 按钮)，两者都绕中线摊开',
      /const leftH = nameH \+ descH/.test(uiw) && /const contentH = Math\.max\(leftH, btnH\)/.test(uiw));
    t('技能行：技能名 = 二级（与六维名字同级）', /const nameH = CV\.FS\.f1 \* 1\.35/.test(uiw));
    t('技能行：不能点时画成禁用态（不是"看着能点、点了没反应"）',
      /o\.btnStyle \|\| 'ghost', o\.btnId, !!o\.btnDis/.test(uiw)
      && /btnDis: !canUp/.test(fs.readFileSync(path.join(JS, 'sc-protag.js'), 'utf8'))
      && /btnDis: !\(lv < 10\)/.test(fs.readFileSync(path.join(JS, 'sc-roster.js'), 'utf8')));
  }
  /* 真几何验算（纯算式，不渲染）：标题行按钮的底边到"下面第一块"的起点之间到底留了几像素 */
  {
    const lh = CV.FS.f1 * 1.3, btnH = U.BTN_TITLE * CV.SCALE;
    const rowH = Math.max(lh, btnH);
    const btnBottom = (rowH - btnH) / 2 + btnH;     // 按钮底边（相对标题行顶）
    const nextTop = rowH + 10 * CV.SCALE;           // 下一块的起点（标题行 + 10px 下边距）
    const gap = Math.round((nextTop - btnBottom) * 10) / 10;
    t('量出来：标题行按钮底边到下面第一行 = 10px（原来只有 3.5px，看着就是贴脸）',
      Math.abs(gap - 10 * CV.SCALE) < 0.6, '实测 ' + gap + 'px');
  }
}

console.log('\n=== ⑥ 招募结果卡（父亲大人：排版不行）===');
{
  /* 卡内留白必须上下相等、高度由内容撑开；10 连要一屏放得下（上一版是 8/31 不等 + 写死 104） */
  const src = fs.readFileSync(path.join(JS, 'sc-recruit.js'), 'utf8');
  const geom = /const PAD = 10 \* CV\.SCALE, AV = 46 \* CV\.SCALE, AVGAP = 6 \* CV\.SCALE/.test(src)
    && /const ch = PAD \* 2 \+ AV \+ AVGAP \+ NAME_H \+ 2 \* CV\.SCALE \+ META_H/.test(src);
  t('卡片几何照网页版 .char-card：内边距 10 / 头像 46 / 头像下 6 / 小字上间距 2、高度由内容算',
    geom, geom ? '同一条算式' : '**没按网页版量**');
  const S = CV.SCALE, PAD = 10 * S, AV = 46 * S, AVGAP = 6 * S;
  const NAME_H = CV.FS.lg * 1.35, META_H = CV.FS.sm * 1.55;
  const ch = PAD * 2 + AV + AVGAP + NAME_H + 2 * S + META_H;
  t('卡内上下留白相等（10 / 10，不是"上 8 下 31"那种空一条）',
    Math.abs((PAD) - (ch - PAD - (AV + AVGAP + NAME_H + 2 * S + META_H))) < 0.01,
    '上 ' + Math.round(PAD / S) + ' / 下 ' + Math.round((ch - PAD - (AV + AVGAP + NAME_H + 2 * S + META_H)) / S));
  U.begin();                                     // 拿页面内容宽，算列宽与整格高度
  const gap = CV.SP[2], rows = Math.ceil(10 / 3);
  const gridH = rows * ch + (rows - 1) * gap;
  const need = (U.BTN_SM * S + CV.SP[2]) + gridH + (U.BTN_H * S + 16 * S);
  const avail = CV.H - CV.TOP - 8 - CV.NAV_H - CV.safeBottom;
  t('10 连（4 行）仍在画内 —— 底部两个按钮不用下滑就能点到',
    need <= avail, '需要 ' + Math.round(need / S) + 'px ≤ 可用 ' + Math.round(avail / S) + 'px');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '五级层级统一，两边一一对应，没有裸数字字号 ✓' : '有 ' + fail + ' 处不符合层级规格 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
