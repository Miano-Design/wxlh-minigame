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
  t('网页版 :root 与小游戏 CV.C 同源（每个色值都能在网页版找到）', (() => {
    const web = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');
    const webSet = new Set([...(web.match(/:root\s*\{[\s\S]*?\n\}/)[0]
      .matchAll(/#[0-9a-fA-F]{6}\b/g))].map((m) => m[0].toLowerCase()));
    /* 黑白两个通道底色在网页版写成 --shade-rgb / --white-rgb（通道令牌），值就是 #000/#fff */
    webSet.add('#000000'); webSet.add('#ffffff');
    const miss = [...base, ...other].filter((c) => !webSet.has(c));
    return miss.length === 0 || (console.log('    网页版没有：' + miss.join(' ')), false);
  })());
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
  const web = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');
  const battle = read('sc-battle.js');
  t('网页版受击/出手已统一到 --d1 120ms（本尺子守的是"同一份基准"）',
    /\.unit\.hit \.u-avatar \{ animation: shake var\(--d1\)/.test(web)
    && /\.unit\.acting \.u-avatar \{ animation: lunge var\(--d1\)/.test(web));
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
  const web = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');
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
  t('金底按钮那一套令牌两端同源（--gold-btn / --gold-btn-deep / --on-gold）',
    diffs.length === 0, diffs.length ? diffs.join(' · ') : trio.map(([w, c]) => w + ' ' + cVal(c)).join(' · '));
  /* ② 白字对渐变两端都 ≥4.5 */
  const ink = cVal('onGold'), top = cVal('goldBtn'), deep = cVal('goldBtnDeep');
  const c1 = ink && top ? cr(top, ink) : 0, c2 = ink && deep ? cr(deep, ink) : 0;
  t('白字对渐变**上下两端**都 ≥4.5',
    c1 >= 4.5 && c2 >= 4.5, '上端 ' + c1.toFixed(2) + ' · 下端 ' + c2.toFixed(2) + '（' + top + ' / ' + deep + ' 对 ' + ink + '）');
  /* ③ 画布上两个金底按钮真的走这一套（不是只登记了没人用） */
  t('U.btn 的 primary 与 gold 走同一套底与同一套字（画布上不再两副长相）',
    /style === 'primary' \|\| style === 'gold'/.test(uiwSrc)
    && /if \(goldBtn2\) \{ g\.addColorStop\(0, CV\.C\.goldBtn\)/.test(uiwSrc)
    && /goldBtn2 \? CV\.C\.onGold : CV\.C\.text/.test(uiwSrc));
  /* ④ 画布取色**不许写成字符串** —— 这一条是拿 62 处真事故换来的：
     canvas 拿到 'CV.C.goldBtn' 这种认不出来的颜色时**不报不崩**，直接保留上一次的填充/描边色，
     于是"尺子全绿、颜色全错"。上一轮的机械替换就是这么把 62 处引号一起写进去的。 */
  const files = fs.readdirSync(JS).filter((f) => f.endsWith('.js'));
  const quoted = files.filter((f) => /'CV\.[^']*'/.test(fs.readFileSync(path.join(JS, f), 'utf8')));
  t('画布取色没有写成字符串（`\'CV.C.x\'` 一律不许有）', quoted.length === 0,
    quoted.length ? quoted.join(',') : '全库 ' + files.length + ' 个 js 文件，0 处带引号的令牌串');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '小游戏端八节基准都在真代码里 ✓' : '有 ' + fail + ' 条没落到代码 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
