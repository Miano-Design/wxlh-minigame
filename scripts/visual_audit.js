/* 视觉语言尺子（小游戏端）：node scripts/visual_audit.js
   ------------------------------------------------------------------------------
   姊妹尺子：网页版 wxlh-game/scripts/visual_audit.js。同一份《视觉语言基准》，两端各守一遍。

   第一版只查"新写的是不是用令牌"，**不查旧裸值还在不在** —— 所以网页版全绿、CSS 里却
   躺着 120+ 个裸色值。这一版两端把缺的那一半补上（V1.1.1）：

     ① 色      ：CV.C 登记基色 ≤ 24（基准 §2.2）＋ 与网页版 :root 同源
     ② 存量    ：**全库零裸值**（新增）
                  ②-1 色值：只准写在 CV.C 色板与 data.js 数据层色表里，别处一个都不许有
                  ②-2 α   ：只准 CV.a(CV.C.x, a) —— 不许手写 'rgba(230,182,76,.4)'
                  ②-3 圆角：半径一律走 CV.RADIUS / RADIUS_SM / RADIUS_CHIP / PILL
                  ②-4 字号：不许裸数字（CV.FS / CV.TIER / CV.DISP / CV.ICO 之外）
     ③ 字      ：11px（tag）占比 < 15%（基准 §3.2）
     ④ 圆角    ：三档 + 胶囊都在用
     ⑤ 品质框 v2：CV.qframe 在位 ＋ 角色卡真接上
     ⑥ 动效    ：受击 / 出手与网页版同值（基准 §5.2）
     ⑦ 命格主题：小游戏取的是数据层同一张表（锚色 + 现算灯梯）
     ⑧ 金底按钮：与网页版同一套令牌 ＋ 白字两端过 AA
                  ＋ **画布取色不许写成字符串**（V1.1.2 抓到的那类"不报不崩、颜色全错"）
     ⑨ 冷启动与主视觉（V1.1.3）：首屏在位（且**顺序**对：在开机弹窗入队之后、第一次 CV.reset 之前）
                  ＋ 首帧不可能是黑的 ＋ 选命格页的印记与灯色两端都在

   只读脚本，不写任何东西。要加色 → 先登记进 CV.C，再引用。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const WEB = path.resolve(__dirname, '../../wxlh-game');
const read = (f) => fs.readFileSync(path.join(JS, f), 'utf8');

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const cv = read('cv.js');
/* V1.1.11（网页版归档）：拿网页版当基准的那几条断言 → 走 ⏭ 跳过、**不计失败**；其余照跑。 */
const WB = require('./_web_basis');
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?<![a-zA-Z0-9_-])rgba?\([^)]*\)/g;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const cBlock = (cv.match(/C:\s*\{[\s\S]*?\n    \},/) || [''])[0];

console.log('\n=== ① 色：令牌层 CV.C 登记基色 ≤ 24（基准 §2.2）===');
{
  const BASE = ['bg', 'bg2', 'panel', 'panel2', 'panel3', 'line', 'line2', 'text', 'text2', 'dim',
    'gold', 'danger', 'gain', 'info', 'anom', 'rn', 'rr', 'rssr', 'rur',
    'famBio', 'famGhost', 'famMystic', 'famTech', 'famGod'];
  const pairs = [...cBlock.matchAll(/([a-zA-Z]+):\s*'(#[0-9a-fA-F]{3,8})'/g)].map((m) => [m[1], m[2].toLowerCase()]);
  const base = [...new Set(pairs.filter((p) => BASE.includes(p[0])).map((p) => p[1]))];
  const other = [...new Set(pairs.filter((p) => !BASE.includes(p[0]) && !['shade', 'white'].includes(p[0])).map((p) => p[1]))];
  t('CV.C 登记基色 ≤ 24', base.length <= 24, base.length + ' 个');
  t('派生／表面／通道分开记（不混进 24）', true,
    '派生+表面 ' + other.length + ' · 通道底色 2 · 别名 4（accent/red/green/blue，不再重复写值）');
  WB.OK ? t('网页版 :root 与小游戏 CV.C 同源（每个色值都能在网页版找到）', (() => {
    const web = WB.read('css/style.css');
    const webSet = new Set([...(web.match(/:root\s*\{[\s\S]*?\n\}/)[0]
      .matchAll(/#[0-9a-fA-F]{6}\b/g))].map((m) => m[0].toLowerCase()));
    /* 黑白两个通道底色在网页版写成 --shade-rgb / --white-rgb（通道令牌），值就是 #000/#fff */
    webSet.add('#000000'); webSet.add('#ffffff');
    const miss = [...base, ...other].filter((c) => !webSet.has(c));
    return miss.length === 0 || (console.log('    网页版没有：' + miss.join(' ')), false);
  })()) : WB.skip('网页版 :root 与小游戏 CV.C 同源');
  t('语义名齐全（danger / dangerText / gain / info / anom / 稀有阶梯 / 五族锚），旧名字留成别名',
    /danger: '#d43a4f'/.test(cv) && /dangerText:/.test(cv) && /gain:/.test(cv) && /info:/.test(cv) && /anom:/.test(cv)
    && /rn:/.test(cv) && /rur:/.test(cv) && /famBio:/.test(cv) && /CV\.C\.accent = CV\.C\.danger/.test(cv));
}

console.log('\n=== ② 存量：全库零裸值（V1.1.1 新增的那一半尺子）===');
{
  const dataSrc = stripComments(read('data.js'));
  const SCAN = { 'cv.js': cv, 'data.js': dataSrc };
  fs.readdirSync(JS).filter((f) => /^(sc-.*|uiw|wx-adapter)\.js$/.test(f)).forEach((f) => { SCAN[f] = read(f); });
  SCAN['game.js'] = fs.readFileSync(path.resolve(__dirname, '../game.js'), 'utf8');
  /* **准写字面量的地方**：CV.C 色板、CV.a 实现、data.js 的三张色表与两个兜底色 */
  const ZONES = [
    /C:\s*\{[\s\S]*?\n    \},/g,
    /CV\.a = function \(color, a\) \{[\s\S]*?\n  \};/g,
    /RARITY_COLOR\s*=\s*\{[^}]*\}/g,
    /color:\s*'#[0-9a-fA-F]{3,8}'/g,
    /lamp:\s*'#[0-9a-fA-F]{3,8}'/g,
    /AVATAR_FACTION_TINT\s*=\s*\{[^}]*\}/g,
    /'#(?:1d2534|8ea3c8)'/g,
  ];
  const blankZones = (s) => ZONES.reduce((a, re) => a.replace(re, (m) => m.replace(/[^\n]/g, ' ')), s);
  const spill = [];
  const total = new Set();
  for (const [f, src] of Object.entries(SCAN)) {
    const clean = stripComments(src);
    [...clean.matchAll(COLOR_RE)].forEach((m) => total.add(m[0].toLowerCase()));
    [...blankZones(clean).matchAll(COLOR_RE)].forEach((m) => spill.push(f + ' ' + m[0].toLowerCase()));
  }
  t('②-1 色值只准写在 CV.C / data.js 色表里（别处一个都不许有）', spill.length === 0,
    spill.length ? '裸写 ' + spill.length + ' 处：' + [...new Set(spill)].slice(0, 8).join(' · ')
      : '全库色值 ' + total.size + ' 个，全部写在登记过的色板里');
  const badA = [];
  for (const [f, src] of Object.entries(SCAN)) {
    [...blankZones(stripComments(src)).matchAll(/(?<![a-zA-Z0-9_-])rgba?\([^)]*\)/g)].forEach((m) => badA.push(f + ' ' + m[0]));
  }
  t('②-2 α 只走 CV.a(CV.C.x, a)', badA.length === 0,
    badA.length ? '手写 rgba 的 ' + badA.length + ' 处：' + [...new Set(badA)].slice(0, 6).join(' · ')
      : '全库 0 处手写 rgba —— 通道只认令牌本人，透明度只在调用点给');
  /* 圆角：CV.round 的第 5 个参数 */
  const splitArgs = (s) => {
    const out = []; let d = 0, q = null, cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
      if ('([{'.indexOf(ch) >= 0) { d++; cur += ch; continue; }
      if (')]}'.indexOf(ch) >= 0) { if (d === 0) { out.push(cur); return out; } d--; cur += ch; continue; }
      if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur); return out;
  };
  const radii = {}, bad = [];
  for (const [f, src] of Object.entries(SCAN)) {
    let i = 0;
    while ((i = src.indexOf('CV.round(', i)) >= 0) {
      const start = i + 9;
      const r = (splitArgs(src.slice(start))[4] || '').trim();
      radii[r] = (radii[r] || 0) + 1;
      const ok = /CV\.RADIUS(_SM|_CHIP)?/.test(r) || r === 'CV.PILL' || r === 'null'
        || /^[\w.$]+$/.test(r) || /\/\s*2$/.test(r) || /Math\.(max|min)\(/.test(r) || r === '';
      if (!ok) bad.push(f + ' → ' + r);
      i = start;
    }
  }
  t('②-3 半径一律走 CV.RADIUS / RADIUS_SM / RADIUS_CHIP / PILL（或算出来的 / 直角）', bad.length === 0,
    bad.length ? bad.slice(0, 5).join(' · ') : '干净');
  /* 字号：不许裸数字（font: { size: 13 } / size: 13 这种） */
  const bareSize = [];
  for (const [f, src] of Object.entries(SCAN)) {
    if (f === 'data.js') continue;
    /* 只认"选项对象里的字号"：`{ size: 12` / `, size: 12` / `{ font: 12`
       （三元表达式 `? size : 0` 不是字号，别误伤） */
    [...stripComments(src).matchAll(/(?:\{|,)\s*(?:font|size)\s*:\s*[0-9.]+/g)]
      .forEach((m) => bareSize.push(f + ' ' + m[0].trim()));
  }
  t('②-4 没有裸数字字号（CV.FS / CV.TIER / CV.DISP / CV.ICO / BATTLE_GEOM 之外）', bareSize.length === 0,
    bareSize.length ? bareSize.slice(0, 5).join(' · ') : '全走令牌（type_scale_audit 另有一遍）');
}

console.log('\n=== ③ 字：11px（tag）占比 < 15%（基准 §3.2）===');
{
  const files = fs.readdirSync(JS).filter((f) => /^(sc-.*|uiw|cv|wx-adapter)\.js$/.test(f));
  const use = {};
  let total = 0;
  files.forEach((f) => {
    (read(f).match(/CV\.(FS|TIER)\.[a-z0-9]+/g) || []).forEach((k) => {
      const name = k.split('.')[1];
      use[name] = (use[name] || 0) + 1; total++;
    });
  });
  const tag = (use.tag || 0) + (use.t5 || 0);
  const pct = total ? tag / total * 100 : 0;
  t('11px（tag）用量占比 < 15%', pct < 15,
    tag + '/' + total + ' = ' + pct.toFixed(1) + '% ｜ ' +
    Object.keys(use).sort((a, b) => use[b] - use[a]).map((k) => k + '×' + use[k]).join(' '));
  t('五级阶梯的数字没动（17 / 15 / 13 / 12 / 11）',
    /FS = \{ xs: 12 \* k, sm: 12 \* k, md: 12 \* k, lg: 13 \* k, f1: 15 \* k, f2: 17 \* k, tag: 11 \* k \}/.test(cv));
  t('11px 只留给"图形里的字"（tag 档）', /CV\.FS\.sm = 12|sm: 12 \* k/.test(cv));
}

console.log('\n=== ④ 圆角：画布上 3 档 ＋ 2 形状特例（基准 §4.3）===');
{
  const files = fs.readdirSync(JS).filter((f) => /^(sc-.*|uiw|cv)\.js$/.test(f));
  const radii = {};
  files.forEach((f) => { (read(f).match(/CV\.(RADIUS[A-Z_]*|PILL)\b/g) || []).forEach((k) => { radii[k] = (radii[k] || 0) + 1; }); });
  t('三档 + 胶囊都在用（不是只定义了没人用）',
    /CV\.RADIUS\b/.test(JSON.stringify(radii)) && /CV\.RADIUS_SM/.test(JSON.stringify(radii))
    && /CV\.RADIUS_CHIP/.test(JSON.stringify(radii)) && /CV\.PILL/.test(JSON.stringify(radii)),
    Object.keys(radii).join(' '));
  t('三个圆角令牌齐', /RADIUS: 10/.test(cv) && /RADIUS_SM: 7/.test(cv) && /RADIUS_CHIP: 3/.test(cv)
    && /CV\.RADIUS_CHIP = 3 \* k/.test(cv));
}

console.log('\n=== ⑤ 品质框 v2：档色环 ＋ 档码铭牌（基准 §4.2）===');
{
  t('CV.qframe 在位（画面 ＋ 环 ＋ 铭牌 ＋ 档码字）',
    /CV\.qframe = function/.test(cv) && /RAR_CODE/.test(cv) && /fillText\(CV\.RAR_CODE/.test(cv));
  t('MYTH 走反色铭牌（暗底金字）＋ 金内环',
    /myth \? CV\.C\.bg2 : col/.test(cv) && /if \(myth\) CV\.round\(x \+ 3/.test(cv));
  t('档码字号 = 五级（tag 11px），不是随手写的数', /CV\.FS\.tag \+ 'px/.test(cv));
  const roster = read('sc-roster.js'), recruit = read('sc-recruit.js');
  t('执灯者卡片真接上了品质框（不是只写了函数没人用）',
    /CV\.qframe\(cx, cy, cw, ch, ch0\.rarity/.test(roster));
  t('招募结果卡 / 自选结果卡也接上了',
    /CV\.qframe\(x, y, cw, ch, r\.rarity/.test(recruit) && /CV\.qframe\(x, y, cw, ch, c\.rarity/.test(recruit));
  t('UR 与危险红分开（CV.C.rur = #ff5fa2）', /rur: '#ff5fa2'/.test(cv));
}

console.log('\n=== ⑥ 动效：受击 / 出手与网页版同值（基准 §5.2）===');
{
  const web = WB.read('css/style.css');
  const battle = read('sc-battle.js');
  WB.OK ? t('网页版受击/出手已统一到 --d1 120ms（本尺子守的是"同一份基准"）',
    /\.unit\.hit \.u-avatar \{ animation: shake var\(--d1\)/.test(web)
    && /\.unit\.acting \.u-avatar \{ animation: lunge var\(--d1\)/.test(web))
    : WB.skip('网页版受击/出手已统一到 --d1 120ms');
  t('小游戏战斗的表现层时长有名字（不是散落的裸毫秒）',
    /hit/i.test(battle) || /shake/i.test(battle), 'sc-battle 仍在用既有帧步进；视觉层只加闪/抖/飘（基准 §5.3 划界）');
}

console.log('\n=== ⑦ 命格主题：取的是数据层同一张表（V1.1.1）===');
{
  const dataSrc = read('data.js');
  t('灯色走 D.BLOOD_THEME / 灯梯走 D.BLOOD_LAMP（画布这端不再自己写一套 hex）',
    /G\.DATA\.BLOOD_LAMP/.test(cv) && /D\.BLOOD_THEME|BLOOD_THEME/.test(cv + read('sc-recruit.js') + read('sc-roster.js')));
  t('灯梯由锚色现算（Lab +1/级，封顶 4 级），不是 54 个写死的色值',
    /function bloodLamp\(/.test(dataSrc) && /LAMP_LEVELS/.test(dataSrc) && !/#6d9b39|#399e8a/.test(dataSrc));
  t('六套锚色在数据层（data.js:BLOOD_THEME）齐全', (dataSrc.match(/lamp:\s*'#/g) || []).length === 6);
  /* 数据层是**两端共用**的：它只能放平台中立的字面量色值。
     写平台的取色写法（小游戏 CV.C / 网页 var(--)）在另一端会变成一个"认不出来的颜色字符串"——
     画布不吃 'CV.C.rn'，直接变成默认黑，而且**尺子不报、界面不崩**，最难查。
     这条是给"共享层串味"上的锁（V1.1.2 我自己的脚本差点这么干，靠两端逐字节比对才发现）。 */
  const leak = (stripComments(dataSrc).match(/CV\.C\.|var\(--/g) || []).length;
  t('共享逻辑层没有平台取色写法（CV.C / var(--) 都不许出现在 data.js）', leak === 0,
    leak ? '串味 ' + leak + ' 处' : 'data.js 里只有平台中立色值（两端逐字节一致）');
}

console.log('\n=== ⑧ 金底按钮：一套底 ＋ 白字，两端都过 AA（V1.1.2 父亲大人）===');
{
  const web = WB.read('css/style.css');
  const uiwSrc = read('uiw.js');
  const lum = (hex) => {
    const h = String(hex).replace('#', '');
    const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const cr = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const webVal = (name) => (web.match(new RegExp(name + '\\s*:\\s*(#[0-9a-fA-F]{3,8})')) || [])[1];
  const cVal = (name) => (cBlock.match(new RegExp('\\b' + name + ":\\s*'(#[0-9a-fA-F]{3,8})'")) || [])[1];
  /* ① 两端同一套值（网页版 :root ↔ 小游戏 CV.C） */
  const trio = [['gold-btn', 'goldBtn'], ['gold-btn-deep', 'goldBtnDeep'], ['on-gold', 'onGold']];
  const diffs = trio.filter(([w, c]) => !webVal('--' + w) || webVal('--' + w).toLowerCase() !== (cVal(c) || '').toLowerCase())
    .map(([w, c]) => w + ' ' + webVal('--' + w) + ' / ' + cVal(c));
  WB.OK ? t('金底按钮那一套令牌两端同源（--gold-btn / --gold-btn-deep / --on-gold）',
    diffs.length === 0, diffs.length ? diffs.join(' · ') : trio.map(([w, c]) => w + ' ' + cVal(c)).join(' · '))
    : WB.skip('金底按钮那一套令牌两端同源（--gold-btn / --gold-btn-deep / --on-gold）');
  /* ② 白字对渐变两端都 ≥4.5 */
  const ink = cVal('onGold'), top = cVal('goldBtn'), deep = cVal('goldBtnDeep');
  const c1 = ink && top ? cr(top, ink) : 0, c2 = ink && deep ? cr(deep, ink) : 0;
  t('白字对渐变**上下两端**都 ≥4.5',
    c1 >= 4.5 && c2 >= 4.5, '上端 ' + c1.toFixed(2) + ' · 下端 ' + c2.toFixed(2) + '（' + top + ' / ' + deep + ' 对 ' + ink + '）');
  /* ③ 画布上两个金底按钮真的走这一套（不是只登记了没人用） */
  /* ⚠️ 2026-09-27（0927-P · 康康改）：这一条原来写死 `goldBtn2 ? CV.C.onGold : CV.C.text` ——
     设计岗这一轮给 `U.btn` 加了第三档 `danger`（父亲大人要的"红边框删档按钮"），
     那一行变成 `goldBtn2 ? CV.C.onGold : (danger ? CV.C.dangerText : CV.C.text)`，
     于是**旧正则匹配不到**、尺子报红 —— 红的是尺子，不是产品（`primary/gold` 走的仍是 onGold）。
     判据一个字没放松：只把"金底那颗的字色 ＝ onGold"这一件事写成不依赖 else 分支的样子，
     另外把新加的 `danger` 档也钉上（它必须是 red 描边 ＋ dangerText 字，不许蹭金底那套）。 */
  t('U.btn 的 primary 与 gold 走同一套底与同一套字（画布上不再两副长相）',
    /style === 'primary' \|\| style === 'gold'/.test(uiwSrc)
    && /if \(goldBtn2\) \{ g\.addColorStop\(0, CV\.C\.goldBtn\)/.test(uiwSrc)
    && /goldBtn2 \? CV\.C\.onGold/.test(uiwSrc));
  t('新加的 danger 档（红边框）自成一套：字走 dangerText、**不许**蹭金底那套',
    /danger \? CV\.C\.dangerText/.test(uiwSrc) && /danger \? CV\.C\.danger/.test(uiwSrc));
  /* ④ 画布取色**不许写成字符串** —— 这一条是拿 62 处真事故换来的：
     canvas 拿到 'CV.C.goldBtn' 这种认不出来的颜色时**不报不崩**，直接保留上一次的填充/描边色，
     于是"尺子全绿、颜色全错"。上一轮的机械替换就是这么把 62 处引号一起写进去的。 */
  const files = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));
  const quoted = files.filter((f) => /'CV\.[^']*'/.test(fs.readFileSync(path.join(JS, f), 'utf8')));
  t('画布取色没有写成字符串（`\'CV.C.x\'` 一律不许有）', quoted.length === 0,
    quoted.length ? quoted.join(',') : '全库 ' + files.length + ' 个 js 文件，0 处带引号的令牌串');
}

console.log('\n=== ⑨ 冷启动与主视觉：首屏在位 ＋ 首帧不黑 ＋ 选命格的印记与灯色（V1.1.3）===');
{
  const gameSrc = fs.readFileSync(path.resolve(__dirname, '../game.js'), 'utf8');
  const splash = read('sc-splash.js');
  const start = read('sc-start.js');
  const uiwSrc = read('uiw.js');
  const webUi = WB.read('js/ui.js');
  const webCss = WB.read('css/style.css');

  /* ① 首屏在位，而且**顺序**对。
     顺序错过的坑本轮真踩了：把 CV.splash() 放在 `pendingBoot.push(...)` 之前，
     首屏自己那一帧渲染会让 coachFor 先跑 —— 开场引导占住屏幕，
     离线收益 / 七日登录永远排在队列里进不来（boot_audit 当场红 6 条）。
     这一条就是那次事故的锁。 */
  /* ⚠️ 位置一律在**剥掉注释的源码**上找：game.js 里那段 P0 说明（"首次安装白屏"）
     引用了 `CV.splash()` 与 `CV.reset(...)` 的**字面写法**（注释里讲坑），
     直接 indexOf 会命中注释里那两处 → 取到的"第一次 reset"根本不是代码，这条断言就凭空红
     （本单实测踩到：入队 @5690 · 首屏 @4984 明显倒挂，全是注释里的偏移量）。 */
  const gameCode = stripComments(gameSrc);
  const iPush = gameCode.indexOf("pendingBoot.push({ kind: 'login' })");
  const iSplash = gameCode.indexOf('CV.splash(');
  /* V1.0.3：第一次 reset 不再是 'create' —— 开机第一页换成了**合规闸**（notice）。
     这里改成"第一次 CV.reset( 出现的位置"，闸门本身的位置与内容由下面 ⑩ 节钉。 */
  /* 从首屏那一行往后找第一次 reset —— game.js 前面还有底栏页签的 CV.reset(t.id)（@2184），
     那不是开机路径，会让这条断言凭空红。 */
  const iReset = gameCode.indexOf('CV.reset(', iSplash);
  t('① 开机首屏在位，且排在"开机弹窗入队之后、第一次 CV.reset 之前"',
    iPush >= 0 && iSplash >= 0 && iReset >= 0 && iPush < iSplash && iSplash < iReset,
    '入队 @' + iPush + ' · 首屏 @' + iSplash + ' · 第一次 reset @' + iReset);
  /* ② 首帧不可能是黑的：天空渐变先铺、图没到还有灯晕兜底 */
  t('② 首帧不可能是黑的（先铺天空渐变；底图没到就画那盏灯的灯晕）',
    /const sky = c\.createLinearGradient/.test(splash) && /if \(!cover\(c, 1, 0\.5\)\)/.test(splash)
    && /createRadialGradient/.test(splash));
  /* ③ 底图只有一张（V1.1.5 起是**真图 jpg**）—— 不许在 canvas 里再手画一遍提灯者。
     换图同时把这条尺子也换了：原来它钉的是"由 SVG 母版栅格化出来的 PNG"，
     那一份已随本次换图删除（同一件美术不留两份定义）。 */
  /* V1.0.5：小游戏那一份改成了 **ASCII 文件名**（`mv-main-lamp.jpg`）——
     实测 `wx.createImage()` 加载中文名资源一律 onerror（见 sc-splash.js 的 SRC 注释），
     网页版仍是中文名（CSS 走 HTTP，不受影响）；"同一张"改由 ⑦ 的**字节比对**钉。 */
  const mv = path.resolve(JS, '../icons/mv-main-lamp.jpg');
  t('③ 首屏底图用的是那张真图 jpg（ASCII 文件名，能真加载）',
    fs.existsSync(mv) && /const SRC = 'icons\/mv-main-lamp\.jpg'/.test(splash),
    fs.existsSync(mv) ? 'JPG ' + Math.round(fs.statSync(mv).size / 1024) + 'KB' : '缺文件');
  t('③ 画布这端**没有第二份美术定义**（首屏里不许出现手写的顶点表）',
    !/\[\s*0\.\d+\s*,\s*0\.\d+\s*\]/.test(splash) && !/polygon/i.test(splash));
  /* ④ 选命格页：印记 ＋ 灯色，两端都在（这是创意总监 B3 那条的锁） */
  t('④ 小游戏"选命格"页有印记（CV.blGlyph）与本命格灯色（CV.blLamp）',
    /CV\.blGlyph\(id,/.test(start) && /CV\.blLamp\(id, 0\)/.test(start)
    && /color: lamp/.test(start) && /line: CV\.a\(lamp/.test(start));
  WB.OK ? t('④ 网页版"选命格"页同样有（blGlyph ＋ bl-scope）—— 两端同源，谁少了当场报',
    /blGlyph\(id, 18\)/.test(webUi) && /card bl-scope anim-mark-in/.test(webUi))
    : WB.skip('④ 网页版"选命格"页同样有（blGlyph ＋ bl-scope）');
  WB.OK ? t('④ 印记顶点表两端共用一份数据层（都从 D.BLOOD_GLYPH 取，谁都没自己写一套顶点）',
    /DATA\.BLOOD_GLYPH/.test(read('cv.js')) && /D\.BLOOD_GLYPH/.test(webUi)
    && !/\[\s*0\.\d+\s*,\s*0\.\d+\s*\]/.test(start))
    : WB.skip('④ 印记顶点表两端共用一份数据层');
  /* ⑤ 选命格的背影：两端都挂上了主视觉（网页版 .bl-veil / 画布 CV.veilPage） */
  WB.OK ? t('⑤ 选命格的背影两端都挂上了主视觉（网页 .bl-veil / 画布 CV.veilPage("bloodline")）',
    /bl-veil/.test(webCss) && /CV\.veilPage\('bloodline'/.test(splash))
    : WB.skip('⑤ 选命格的背影两端都挂上了主视觉');
  /* ⑥ 通用件真的支持这两件事（不然页面写了也不生效） */
  t('⑥ U.h3 支持标题前置印记（opt.glyph）、U.card 支持自定义描边（opt.line）',
    /opt\.glyph/.test(uiwSrc) && /opt\.line/.test(uiwSrc) && /glyph\.bl/.test(uiwSrc));
  /* ⑦ 两端**同一张图**（V1.1.5 父亲大人："两端用同一张"；V1.0.5 改成**比字节**）。
     为什么不再比文件名：小游戏那份必须用 ASCII 名（中文名 wx.createImage 加载不了，实测），
     而网页版 CSS 走 HTTP、中文名正常 —— 文件名不同是**必需的**，内容必须一模一样。
     比 sha256 比"名字逐字相同"更硬：换图只改一端、或改了名却没换内容，都当场红。
     这一条是"两端同源"那条纪律（小游戏开发纪律 §3）在主视觉上的具体化。 */
  const crypto = require('crypto');
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const mine = path.resolve(JS, '../icons/mv-main-lamp.jpg');
  const theirs = path.resolve(WEB, 'icons/主视觉-提灯入残域-暗调.jpg');
  WB.OK ? t('⑦ 两端底图是**同一张图**（sha256 逐字节相同；文件名允许不同）',
    fs.existsSync(mine) && fs.existsSync(theirs) && hash(mine) === hash(theirs),
    fs.existsSync(mine) && fs.existsSync(theirs)
      ? '画布 mv-main-lamp.jpg ＝ 网页 主视觉-提灯入残域-暗调.jpg · sha256 ' + hash(mine).slice(0, 12)
      : '有一端缺文件')
    : WB.skip('⑦ 两端底图是同一张图');
}

console.log('\n=== ⑩ 忠告独立弹窗：四句全文 ＋ 读得清 ＋ 主画面里没有它（V1.0.6 · 父亲大人改口径）===');
{
  /* 依据《微信小游戏平台运营规范》特别规范 2.6.2（忠告全文登载）。这一节钉四件事：
       ① 开机第一页是**主画面**（弹窗背后那一层），冷启动**先弹忠告**、关掉才往下走；
       ② 忠告四句在**弹窗**里（缺了就红），**主画面里没有它**，撤掉的两块也不许借壳回来；
       ③ 对比度：正文 --text2 对 --bg / --bg2（弹窗底）≥4.5；
       ④ 两端同源：文案来自 data.js 的 COMPLIANCE，本端不许手抄原文。 */
  /* V1.0.6（父亲大人 2026-09-23：「著作权不要啊，个人的没有这个，适龄好像到时上线小程序会自己打，
     这些等审核通过再说吧」，随后又改「健康游戏是独立的弹窗，不要跟主画面做到一起」，时机选 C）：
     主画面只剩品牌 ＋【进入残域】；忠告四句搬进 `U.healthNotice`（uiw.js），game.js 冷启动先弹。
     `copyright`（2.6.1 专门页）整页删、适龄徽标连样式一起撤，原来给它们的三条断言一并删掉
     （留着就是拿尺子量已经不存在的家具）。保留项只有设置页那张适龄卡。 */
  const gameSrc = fs.readFileSync(path.resolve(__dirname, '../game.js'), 'utf8');
  const splash = read('sc-splash.js');
  const startSrc = read('sc-start.js');
  const uiwSrc = read('uiw.js');
  /* 主画面那一段（gate 页）单独切出来 —— 忠告在不在这一屏上，只看这一段。 */
  const gateBlock = startSrc.slice(startSrc.indexOf("CV.register('gate'"),
    startSrc.indexOf("CV.register('welcome'"));
  /* 只看**开机那一段**（CV.splash 之后）的第一次 reset ——
     game.js 前面还有底栏页签的 `CV.reset(t.id)`，那不是开机路径。
     同 ⑨① ：先剥注释 —— 那段 P0 说明里引用了 `CV.reset(...)` 的字面写法，不剥就会命中注释。 */
  const bootCode = stripComments(gameSrc);
  const bootPart = bootCode.slice(bootCode.indexOf('CV.splash('));
  const iResetFirst = bootPart.indexOf('CV.reset(');
  const firstResetName = bootPart.slice(iResetFirst, iResetFirst + 200).replace(/\s+/g, ' ');
  t('① 开机第一页是主画面（弹窗背后那一层）—— 首页只能从【进入残域】进去',
    iResetFirst >= 0 && /'gate'/.test(firstResetName),
    '首屏之后的第一次 reset：' + firstResetName.slice(0, 80));
  t('① 冷启动**先弹忠告**（game.js 调 U.healthNotice），关掉才落到"新档欢迎 / 老档主画面"',
    /healthNotice/.test(bootCode) && /'welcome'/.test(bootCode.slice(bootCode.indexOf('afterHealthNotice')))
    && /'gate'/.test(bootCode.slice(bootCode.indexOf('afterHealthNotice'))));
  t('① 开局三步（欢迎 / 起名 / 选命格）走完落到**主画面**，不是直接进首页',
    /CV\.reset\('gate'\)/.test(startSrc) && /CV\.on\('gate_enter'[\s\S]{0,160}CV\.reset\('home'\)/.test(startSrc));
  t('① 主画面不画顶栏/底栏（游戏还没开始，那两样本身就是游戏界面）',
    /const chromeless = \['gate'/.test(cv), 'chromeless 名单');
  t('② 忠告四句在**独立弹窗**里画（U.healthNotice 取自 D.COMPLIANCE，逐句一行、不许手抄）',
    /U\.healthNotice = function/.test(uiwSrc) && /healthAdvice/.test(uiwSrc) && /join\('\\n'\)/.test(uiwSrc));
  t('② 弹窗是单按钮（没有"取消"那条出路）＋ 正文走 --text2（法规原文要读得清）',
    /cancel:\s*false/.test(uiwSrc) && /tone:\s*'text2'/.test(uiwSrc));
  t('② **主画面里没有忠告**（父亲大人：不要跟主画面做到一起）',
    !!gateBlock && gateBlock.indexOf('healthAdvice') < 0 && gateBlock.indexOf('healthTitle') < 0);
  t('② 主画面不许再出现著作权人那一行 / 入口（2026-09-23 已按父亲大人的话撤掉）',
    !/ownerFields|ownerEntry|data-owner/.test(startSrc));
  t('② 主画面那颗适龄徽标撤干净了（整页不许再有 ageBadge / age_more）',
    !/ageBadge|age_more/.test(startSrc));
  /* 撤掉的两块：整页 / 整块 / 字段都不许留在代码里（含设置页那份著作权人卡）。
     V1.0.6（父亲大人 2026-09-23：「著作权不要啊，个人的没有这个，适龄好像到时上线小程序会
     自己打，这些等审核通过再说吧」＋「忠告留着呗」）—— 原来这几条是"必须有"，现在翻成"不许有"。 */
  const noLineCmt = (s) => stripComments(s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'));
  const compSrc = noLineCmt(startSrc + fs.readFileSync(path.resolve(__dirname, '../js/data.js'), 'utf8')
    + fs.readFileSync(path.resolve(JS, 'sc-last.js'), 'utf8') + fs.readFileSync(path.resolve(JS, 'cv.js'), 'utf8'));
  t('② 著作权人信息撤得干净（字段 / 入口 / copyright 专门页 /「待填」全仓都没有）',
    !/ownerFields|ownerTitle|ownerNote|ownerEntry|ownerBlank|待填/.test(compSrc) && !/'copyright'/.test(compSrc));
  t('② 适龄全文还在设置页那张卡里（ageFull 不许跟着徽标一起被删掉）',
    /D\.COMPLIANCE\.ageFull/.test(read('sc-last.js')));
  t('② 品牌首屏里不再夹合规文案（那一行 1.5s 一闪而过，就是被点名的那条）',
    !/适龄提示/.test(stripComments(splash)));     // 注释里会写"适龄提示搬去哪了"，只查真画的文案
  /* ③ 对比度：算出来，不靠看 */
  const lum = (hex) => {
    const h = String(hex).replace('#', '');
    const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const tok = (name) => { const m = cv.match(new RegExp(name + ":\\s*'(#[0-9a-fA-F]{6})'")); return m ? m[1] : null; };
  const t2 = tok('text2'), bg = tok('bg'), panel = tok('panel'), bg2 = tok('bg2');
  t('③ 忠告正文（CV.C.text2）对页面底（CV.C.bg）≥4.5',
    !!t2 && !!bg && cr(t2, bg) >= 4.5, t2 && bg ? cr(t2, bg).toFixed(2) + ':1（' + t2 + ' on ' + bg + '）' : '取不到令牌');
  t('③ 忠告正文对**弹窗底**（CV.C.text2 对 CV.C.bg2）≥4.5',
    !!t2 && !!bg2 && cr(t2, bg2) >= 4.5, t2 && bg2 ? cr(t2, bg2).toFixed(2) + ':1（' + t2 + ' on ' + bg2 + '）' : '取不到令牌');
  t('③ 弹窗正文用的是 --text2 那一档（不是 dim —— 老首屏那行就是 dim）',
    /tone === 'text2' \? CV\.C\.text2 : CV\.C\.dim/.test(uiwSrc));
  /* ④ 两端同源 */
  t('④ 文案来自 data.js 的 COMPLIANCE（本端零手抄 —— 手抄＝改一处漏一处）',
    /D\.COMPLIANCE/.test(startSrc) && !/抵制不良游戏/.test(startSrc));
  /* ⑤ 设置页的两张合规卡 —— **口径 2026-09-26 反转过，这条尺子当时没跟上（一直红到现在）**。
     父亲大人 09-26 原话：「把设置里的**战斗速度、存档槽（就导出导入就行了）、适龄、健康游戏**去掉」
     → 所以现在的真相是"设置页**不许再画**这两段"，而不是"必须留"。
     **合规落点没有因此落空**：忠告全文仍在**冷启动那个独立弹窗**（`uiw.js` 的 `U.healthNotice`，
     文案取自 `D.COMPLIANCE.healthAdvice`）——"游戏开始前、显著位置全文登载"仍然成立；
     适龄由平台启动页统一打（MP 后台那一栏仍要自己设好），游戏内一处都不剩是**他的决定**。
     两件事仍然钉死：① 设置页不许再出现这两段；② 著作权人那份（个人主体没有）不许回来。 */
  const last = read('sc-last.js'), lastNoCmt = noLineCmt(last);
  t('⑤ 「设置与存档」**不许再画**忠告/适龄全文（09-26 他拍板撤的；合规落点在冷启动弹窗）',
    !/D\.COMPLIANCE\.healthAdvice/.test(lastNoCmt) && !/D\.COMPLIANCE\.ageFull/.test(lastNoCmt));
  t('⑤b 忠告全文仍在**冷启动独立弹窗**（`U.healthNotice` 取 `D.COMPLIANCE.healthAdvice`）',
    /U\.healthNotice\s*=/.test(uiwSrc) && /COMPLIANCE/.test(uiwSrc) && /healthAdvice/.test(uiwSrc)
    && !/抵制不良游戏/.test(uiwSrc));      // 文案不许在界面层手抄（取自 data.js）
  t('⑤c 著作权人那份（ownerFields/ownerTitle）仍然不许回来',
    !/ownerFields|ownerTitle/.test(lastNoCmt));

  /* ⑥ 道具图标（V1.0.6 · 父亲大人 2026-09-24：「结算掉落基础金属的时候配的就是背包图标」）：
     结算胶囊与离线材料胶囊原来一律写死 🎒 / ⚙️ —— 与网页版同一条规矩：**用道具自己的 icon**。
     这里钉两件事：① 两处都取 `it.icon`；② 全仓不许再出现"写死图标 ＋ D.ITEMS 名字"的写法。 */
  const chipFiles = { 'sc-dungeon.js': read('sc-dungeon.js'), 'uiw.js': read('uiw.js') };
  const withIcon = Object.keys(chipFiles).filter((f) => /it\.icon \|\| '🎒'|\(it && it\.icon\) \|\| '🎒'/.test(chipFiles[f]));
  const hardCodedMini = Object.keys(chipFiles).filter((f) => /['"]🎒 ['"]\s*\+\s*\(*\(?D\.ITEMS/.test(chipFiles[f]));
  t('⑥ 道具/材料胶囊用**道具自己的 icon**（结算 sc-dungeon ＋ 离线 uiw 两处都取 icon，且没有写死 🎒 拼名字的写法）',
    withIcon.length === 2 && hardCodedMini.length === 0,
    '取 icon 的文件：' + withIcon.join('/') + ' · 写死 🎒 的文件：' + (hardCodedMini.join('/') || '无'));

  /* ⑦ 底栏：**纯文字、两端一致**（V1.0.6 · 父亲大人 2026-09-24：「现在底部导航栏不对吧」）
     根因不是"图标画得丑"，是**两端不一致**：网页版 navbarHtml() 自 V8.1「界面改纯文字（照参考图）」
     起底栏就只有名字（`.nav-item .ico` 是那条改动留下的死 CSS），画布端却挂着 4 个 emoji
     （不成一套 / 压灰半灰半彩 / 「执灯者」用两个人）。按「网页版为准、canvas 逐条对齐」——
     画布端也纯文字。这条断言钉住：①画布 NAV_TABS 不许再有 ico 字段；②降饱和补丁不许回来；
     ③两端的四个页签 id ＋ 名字必须一模一样（不是"看起来差不多"）。 */
  const webUiNav = (() => {
    try { return fs.readFileSync(path.join(WEB, 'js/ui.js'), 'utf8'); } catch (e) { return ''; }
  })();
  const miniTabs = (cv.match(/NAV_TABS: \[([\s\S]*?)\]/) || [])[1] || '';
  const miniIds = [...miniTabs.matchAll(/id: '([a-z]+)',\s*name: '([^']+)'/g)].map((m) => m[1] + ':' + m[2]);
  const webTabs = (webUiNav.match(/const TABS = \[([\s\S]*?)\];/) || [])[1] || '';
  const webIds = [...webTabs.matchAll(/id: '([a-z]+)',\s*name: '([^']+)'/g)].map((m) => m[1] + ':' + m[2]);
  t('⑦ 底栏是**纯文字**（画布 NAV_TABS 里没有 ico、也没有 emoji 降饱和那套补丁）',
    !!miniTabs && !/ico:/.test(miniTabs) && !/navIconGray\s*\(/.test(stripComments(cv)),
    'NAV_TABS：' + (miniTabs.match(/name: '[^']+'/g) || []).join(' '));
  WB.OK ? t('⑦ 两端底栏四格**同源**（id ＋ 名字逐条相等，不许一边多一边少）',
    miniIds.length === 4 && miniIds.join('|') === webIds.join('|'),
    '画布 ' + miniIds.join(' ') + ' ／ 网页 ' + webIds.join(' '))
    : WB.skip('⑦ 两端底栏四格同源');

  /* ⑧ 图标**形状只有一处**（V1.0.6 · 父亲大人 2026-09-24 拍板「B，收口」）
     底栏四格 ＋ 四种货币：几何写在 data.js（NAV_ICONS / CUR_ICONS / ICON_STROKE），
     两端各渲染一次（网页版 iconSvg / 画布 CV.drawIcon）。这一节是**双向**的：
       ① 数据层必须两套 id 齐（nav 4 个、cur 4 个）；
       ② 画布端**不许自己写形状**：nav 只许调 CV.iconOps/drawIcon，货币那四行只许转发；
       ③ 网页端**不许自己写形状**：不许再有 CUR_SVG 那种手写 path，顶栏/图鉴/文案都走 curIcon。 */
  const dataSrc = read('data.js');
  const navIds = ['home', 'dungeon', 'roster', 'bag'];
  const curIds = (dataSrc.match(/const CURRENCIES = \[([\s\S]*?)\];/) || [])[1] || '';
  const curIdList = [...curIds.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  const navMissing = navIds.filter((id) => !new RegExp('^\\s{4}' + id + ': \\{', 'm').test(dataSrc));
  const curMissing = curIdList.filter((id) => !new RegExp('^\\s{4}' + id + ': \\[', 'm').test(dataSrc));
  t('⑧ 数据层：底栏 4 形 ＋ 货币 4 形都在（NAV_ICONS / CUR_ICONS）',
    navMissing.length === 0 && curMissing.length === 0 && curIdList.length === 4 && /ICON_STROKE/.test(dataSrc),
    '缺：' + (navMissing.concat(curMissing).join('/') || '无') + ' · 货币表 ' + curIdList.join('/'));
  const navBlock = stripComments(cv).slice(stripComments(cv).indexOf('CV.NAV_TABS.forEach'),
    stripComments(cv).indexOf('CV.NAV_TABS.forEach') + 1400);
  /* ⚠️ 底栏那段里 `c.arc(...)` 是**红点**的圆，不算"图标形状"——所以这里查的是
     "有没有把 op 形状内联进来"（['line' / ['rect' … 那种字面量），不是"有没有画圆"。 */
  t('⑧ 画布端不许自己写形状（底栏那段只许 drawIcon/iconOps，形状字面量一个都不许有）',
    /CV\.drawIcon\(\s*CV\.iconOps\('nav'/.test(navBlock)
    && !/\['(line|rect|arc|circle|poly|fpoly|frect|ring|mark)'/.test(navBlock));
  const curGlyphBlock = stripComments(cv).slice(stripComments(cv).indexOf("'◉': function"),
    stripComments(cv).indexOf("'♜': function"));
  t('⑧ 画布端四种货币只转发 data.js（四行都是 drawIcon(iconOps(cur …))，没有各写各的画法）',
    (curGlyphBlock.match(/CV\.drawIcon\(CV\.iconOps\('cur'/g) || []).length === 4
    && !/\.arc\(|\.lineTo\(|fillRect/.test(curGlyphBlock));
  const webUiCode2 = stripComments(webUiNav);
  WB.OK ? t('⑧ 网页端不许自己写形状（没有手写 path 的图标表；顶栏与图鉴都走 curIcon）',
    /function iconSvg\(/.test(webUiNav) && !/const CUR_SVG = \{/.test(webUiCode2)
    && /\$\{curIcon\(c\.id\)\}/.test(webUiCode2))
    : WB.skip('⑧ 网页端不许自己写形状');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '小游戏端十节基准都在真代码里 ✓' : '有 ' + fail + ' 条没落到代码 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
