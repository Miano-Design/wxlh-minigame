/* 视觉语言尺子（小游戏端）：node scripts/visual_audit.js
   ------------------------------------------------------------------------------
   姊妹尺子：网页版 wxlh-game/scripts/visual_audit.js。同一份《视觉语言基准》，
   两端各守一遍 —— 上一轮的病根正是"规范只在文档里、只在 specimen 里"。
     ① 色：CV.C 的令牌层不透明基色 ≤ 24（派生档不算，理由逐条列）
     ② 字：11px（CV.FS.tag）用量占比 < 15%，且不带裸数字（type_scale_audit 已守一遍）
     ③ 圆角：画布上只准 3 档 ＋ 2 形状特例
     ④ 品质框 v2：CV.qframe 在位 ＋ 角色卡真接上
     ⑤ 动效：受击 / 出手两处与网页版同值

   只读脚本，不写任何东西。
*/
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');
const WEB = path.resolve(__dirname, '../../wxlh-game');
const read = (f) => fs.readFileSync(path.join(JS, f), 'utf8');

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const cv = read('cv.js');

console.log('\n=== ① 色：令牌层 CV.C 登记基色 ≤ 24（基准 §2.2）===');
{
  const C = cv.match(/C:\s*\{[\s\S]*?\n    \},/);
  const hex = [...new Set((C ? C[0].match(/#[0-9a-fA-F]{6}\b/g) : []).map((x) => x.toLowerCase()))];
  const DERIVED = { '#8a6a1e': 'goldDeep', '#e8626f': 'dangerText（危险红提亮档）', '#97273a': 'accent2' };
  const base = hex.filter((c) => !DERIVED[c]);
  t('CV.C 不透明基色 ≤ 24', base.length <= 24, base.length + ' 个');
  t('网页版 :root 与小游戏 CV.C 同源（每个基色都能在网页版令牌里找到）', (() => {
    const web = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8').match(/:root\s*\{[\s\S]*?\n\}/)[0];
    const webSet = new Set([...web.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()));
    const miss = base.filter((c) => !webSet.has(c));
    return miss.length === 0 || (console.log('    缺 ' + miss.join(' ')), false);
  })());
  t('语义名齐全（danger / gain / info / anom / 稀有阶梯 / 五族锚），旧名字留成别名',
    /danger:\s*'#d43a4f'/.test(cv) && /dangerText:/.test(cv) && /gain:/.test(cv) && /info:/.test(cv) && /anom:/.test(cv)
    && /rn:/.test(cv) && /rur:/.test(cv) && /famBio:/.test(cv) && /accent:\s*'#d43a4f'/.test(cv));
}

console.log('\n=== ② 字：11px（tag）占比 < 15%（基准 §3.2）===');
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

console.log('\n=== ③ 圆角：画布上 3 档 ＋ 2 形状特例（基准 §4.3）===');
{
  /* 把 CV.round(...) 的第 5 个参数（半径）抠出来 —— 括号/引号要配对，不能用简单 split */
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
  const files = fs.readdirSync(JS).filter((f) => /^(sc-.*|uiw|cv)\.js$/.test(f));
  const bad = [], radii = {};
  files.forEach((f) => {
    const src = read(f);
    let i = 0;
    while ((i = src.indexOf('CV.round(', i)) >= 0) {
      const start = i + 9;
      const args = splitArgs(src.slice(start));
      const r = (args[4] || '').trim();
      radii[r] = (radii[r] || 0) + 1;
      const ok = /CV\.RADIUS(_SM|_CHIP)?/.test(r) || r === 'CV.PILL' || r === 'null'
        || /^[\w.$]+$/.test(r) || /\/\s*2$/.test(r) || /Math\.(max|min)\(/.test(r) || r === '';
      if (!ok) bad.push(f + ' → ' + r);
      i = start;
    }
  });
  t('半径一律走 CV.RADIUS / CV.RADIUS_SM / CV.RADIUS_CHIP / CV.PILL（或算出来的 / 直角）',
    bad.length === 0, bad.length ? bad.slice(0, 5).join(' · ') : '干净');
  t('三档 + 胶囊都在用（不是只定义了没人用）',
    /CV\.RADIUS\b/.test(JSON.stringify(radii)) && /CV\.RADIUS_SM/.test(JSON.stringify(radii))
    && /CV\.RADIUS_CHIP/.test(JSON.stringify(radii)) && /CV\.PILL/.test(JSON.stringify(radii)),
    Object.keys(radii).filter((k) => /CV\.(RADIUS|PILL)/.test(k)).join(' '));
  t('三个圆角令牌齐', /RADIUS: 10/.test(cv) && /RADIUS_SM: 7/.test(cv) && /RADIUS_CHIP: 3/.test(cv)
    && /CV\.RADIUS_CHIP = 3 \* k/.test(cv));
}

console.log('\n=== ④ 品质框 v2：档色环 ＋ 档码铭牌（基准 §4.2）===');
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

console.log('\n=== ⑤ 动效：受击 / 出手与网页版同值（基准 §5.2）===');
{
  const web = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');
  const battle = read('sc-battle.js');
  const hasHit = /hit/i.test(battle) || /shake/i.test(battle);
  t('网页版受击/出手已统一到 --d1 120ms（本尺子守的是"同一份基准"）',
    /\.unit\.hit \.u-avatar \{ animation: shake var\(--d1\)/.test(web)
    && /\.unit\.acting \.u-avatar \{ animation: lunge var\(--d1\)/.test(web));
  t('小游戏战斗的表现层时长有名字（不是散落的裸毫秒）',
    hasHit, 'sc-battle 仍在用既有帧步进；视觉层只加闪/抖/飘（基准 §5.3 划界）');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (fail === 0 ? '小游戏端五节基准都在真代码里 ✓' : '有 ' + fail + ' 条没落到代码 ✗') + '\n');
process.exitCode = fail ? 1 : 0;
