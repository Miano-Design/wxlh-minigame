/* 存档兼容体检（更新不许要求玩家删档）：node scripts/save_migrate_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人："以后上线小程序有别的玩家，总不能也让人删档重开吧"）。

   上线之后**每一次更新**都会遇到同一件事：玩家手里是**旧版本的存档**，
   而代码里多了新系统（新货币、新面板、新计数）。这一条如果没兜住，
   玩家一更新就是"从头开始"——比任何数值问题都致命。

   这把尺子不讲道理，只做实验：造几种"真的会遇到的旧存档"，丢进 Core.load()，
   然后断言 —— ① 能读进来；② 进度（等级 / 货币 / 角色 / 关卡 / 已领任务）一点不丢；
   ③ 新字段被补齐（不是 undefined）；④ 每一页都能画出来（不是读进来就崩）；
   ⑤ 读不出来的那几种（损坏 / 来自更高版本）必须**原样备份**，绝不能悄悄覆盖。
   只读脚本，跑在假环境里。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
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
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const CV = global.CV, Core = global.Core, D = global.DATA, G = global.GameGlobal;
CV.setup(global.wx.getWindowInfo());
const SAVE_KEY = 'wxlh_save_v5';
const BAK_KEY = SAVE_KEY + '_bak';

let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra ? '  → ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
/* 每一个存档都全新开一个进程来跑（模块有缓存，同一进程里 load 两次会互相干扰） */
const { execFileSync } = require('child_process');
const SELF = __filename;
function runCase(name, build, checks) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [SELF, '--case', name], { encoding: 'utf8', env: Object.assign({}, process.env, { SAVE_CASE: name }) });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const ok = /__ALL_OK__/.test(out);
  console.log('\n【' + name + '】');
  out.split('\n').filter((l) => /✓|✗/.test(l)).forEach((l) => {
    if (/✓/.test(l)) pass++; else fail++;
    console.log('  ' + l.trim());
  });
  return ok;
}

/* ==================== 子进程：真的跑一次读档 ==================== */
if (process.argv[2] === '--case') {
  const name = process.argv[3];
  const mk = {};
  /* ① "上个版本"的存档：v5 但**缺了后来才加的那些块**（这是最常见的一种） */
  mk.old_missing_blocks = () => {
    return {
      v: 5, createdAt: Date.now() - 86400000,
      player: { name: '老玩家', level: 37, exp: 120, bloodline: '修真', bloodlineLv: 3, attrPoints: 5, attrs: { muscle: 2, immune: 1, cell: 0, nerve: 0, intelligence: 0, spirit: 0 }, skillPoints: 3, skillLv: [2, 1, 0], row: 'back' },
      /* V9.6.134：这份老档刻意保留**旧版 8 种货币**（含已下架的 故事点 / 技能芯片 /
         血统结晶 / 深井徽记）—— 迁移必须把它们按系数折进新币，一点不丢。 */
      cur: { points: 54321, holy: 88, otherworld: 7, story: 401, skillChip: 12, bloodCrystal: 20, corridor: 0, rp: 3 },
      chars: { C002: { lv: 41, star: 3, shards: 5, skillLv: [2, 2, 2], bloodlineLv: 1 } },
      party: ['@player', 'C002', null, null, null],
      worlds: { W01: { unlocked: true, stages: { normal: [3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hell: [] } } },
      quests: { claimed: ['q01', 'q01b', 'q02'] },
      /* 注意：**故意不给** travel / garden / arena / fabao / mount / sign / keji / beast / codex / presets… */
    };
  };
  /* ② 更老的版本号（v4）——以前这种会被直接"当成没存档" */
  mk.older_version = () => Object.assign(mk.old_missing_blocks(), { v: 4 });
  /* ③ 队伍还是 4 格、主角不占位的结构（很早的版本） */
  mk.old_party4 = () => {
    const s = mk.old_missing_blocks();
    s.party = ['C002', 'C999', null, null];     // C999 是已经不存在的角色
    s.player.row = 'back';
    return s;
  };
  /* ③b 真的很老的档：没有 c001Merged / altPlayers / fabao（那时还没有这些系统），
         C001 是"旧版主角占位" —— 这一段迁移必须**还能跑**，不能被新规则误伤。 */
  mk.ancient_save = () => {
    const s = mk.old_missing_blocks();
    delete s.fabao; delete s.altPlayers; delete s.c001Merged;
    s.chars = { C001: { lv: 30, star: 2, shards: 0, skillLv: [1, 1, 1], bloodlineLv: 0 } };
    s.party = ['C001', null, null, null, null];
    return s;
  };
  /* ③c V1.0.1 改壳（求签 → 点灯）：老档里存着**旧档位名**（大吉 / 上吉…）。
     档位名是**存进存档的值**，不迁移就会出现"面板写着【大吉】、灯焰文案却是空的"。
     这份档刻意把 sign 写成改壳前的样子（今天已点、档位＝大吉）。 */
  mk.old_sign_words = () => Object.assign(mk.old_missing_blocks(), {
    sign: { date: Core.dailyDate(), tier: '大吉', idlePct: 0.3, drawn: 1 },
  });
  /* ④ 存档损坏（手改坏 / 存盘写一半断电） */
  mk.broken_json = () => '{ "v": 5, "player": { "name": "断' ;
  /* ⑤ 来自**更高版本**的存档（玩家先装了新版，又回到旧版） */
  mk.future_version = () => Object.assign(mk.old_missing_blocks(), { v: 99 });

  const builder = mk[name];
  const raw = typeof builder() === 'string' ? builder() : JSON.stringify(builder());
  store = {};
  store[SAVE_KEY] = raw;
  const loaded = Core.load();
  const S = Core.S;
  const out = (msg) => console.log(msg);
  const say = (ok, what, extra) => out((ok ? '✓' : '✗') + ' ' + what + (extra ? '  → ' + extra : ''));
  const bak = store[BAK_KEY] || null;

  /* 很老的档（C001 是旧版主角占位）：这段迁移只该对老档跑 */
  if (name === 'ancient_save') {
    say(loaded === true, '很老的档也能读进来');
    say(!S.chars || !S.chars.C001, '旧版占位的 C001 被摘掉（这段老迁移还在跑）', JSON.stringify(Object.keys(S.chars || {})));
    say(S.c001Merged === true, '迁移标记补上了（下次不会再跑一遍）');
    say(S.player && S.player.level === 37, '主角进度没丢', 'Lv.' + (S.player && S.player.level));
    if (loaded && S.c001Merged && !(S.chars || {}).C001) out('__ALL_OK__');
    process.exit(0);
  }
  if (name === 'broken_json' || name === 'future_version') {
    /* 这两种**读不进来是对的**，但必须原样备份、而且不许动主存档 */
    say(loaded === false, '读不出来（预期）');
    say(!!bak, '原样备份到了 ' + BAK_KEY, bak ? String(JSON.parse(bak).why) : '(没有备份)');
    say(store[SAVE_KEY] === raw, '主存档**原样没动**（没被覆盖、没被删）');
    if (loaded === false && bak && store[SAVE_KEY] === raw) out('__ALL_OK__');
    process.exit(0);
  }

  say(loaded === true, '旧存档能读进来');
  if (!loaded) { process.exit(0); }
  /* 进度一点不丢 */
  say(S.player.level === 37 && S.player.name === '老玩家', '主角等级/名字没变', 'Lv.' + S.player.level + ' ' + S.player.name);
  /* V9.6.134：货币 8 → 4 —— 老档的「故事点 401」并进点数（×71）、
     「技能芯片 12 ×3.5 + 血统结晶 20 ×28 + 深井徽记 0 ×30」并进异界结晶。
     这里不是"数字不许变"，而是**折算规则必须对得上、且旧键要清干净**：
       points      = 54321 + 401×71 = 82792
       otherworld  = 7 + round(12×3.5 + 20×28 + 0×30) = 7 + 602 = 609
     旧的四个键必须一个都不剩（留着就是"改一半"）。 */
  const expPoints = 54321 + 401 * 71;
  const expOw = 7 + Math.round(12 * 3.5 + 20 * 28 + 0 * 30);
  say(S.cur.points === expPoints, '老档的故事点折进了点数（×71，一点没丢）', '◉' + S.cur.points + '（应为 ' + expPoints + '）');
  say(S.cur.otherworld === expOw, '老档的技能芯片/血统结晶/深井徽记折进了异界结晶', '◆' + S.cur.otherworld + '（应为 ' + expOw + '）');
  say(['story', 'skillChip', 'bloodCrystal', 'corridor'].every(k => !(k in S.cur)),
    '四个旧货币键全清干净了（没留"半新半旧"的档）', Object.keys(S.cur).join(','));
  say(S.cur.holy === 88 && S.cur.rp === 3, '没被合并的两种货币原样保留', '✦' + S.cur.holy + ' ♾' + S.cur.rp);
  const who = S.chars.C002 || S.chars.C001;
  say(!!who && who.lv === 41, '伙伴等级没变（没被迁移逻辑顺手删掉）', who ? 'Lv.' + who.lv : '(没了)');
  say(S.worlds.W01.stages.normal[2] === 2, '关卡进度没变');
  say((S.quests.claimed || []).length === 3, '已领任务没变');
  /* 主角站在哪一格由"他原来那一排"决定（老档 player.row）——这里只要求：长度 5、主角在里面、招募到的伙伴还在 */
  say(S.party.length === 5 && S.party.indexOf('@player') >= 0 && S.party.indexOf('C002') >= 0,
    '阵容被规整成 5 格、主角和伙伴都在里面', JSON.stringify(S.party));
  say(S.party.indexOf('C999') < 0, '已经不存在的伙伴被清掉（不然会崩）');
  /* 新字段被补齐（老档没有的那些） */
  const need = ['travel', 'garden', 'arena', 'fabao', 'mount', 'sign', 'keji', 'recruit', 'tasks', 'idle', 'bounty', 'beast', 'codex', 'presets', 'unlocks'];
  const miss = need.filter((k) => S[k] === undefined || S[k] === null);
  say(miss.length === 0, '新系统字段全部补齐（不再是 undefined）', miss.length ? '缺：' + miss.join(',') : need.length + ' 项齐全');
  say(S.recruit && S.recruit.pity && S.recruit.pity.advanced && typeof S.recruit.pity.advanced.ssr === 'number', '深层字段也补齐了（recruit.pity.advanced.ssr）');
  say(S.travel && typeof S.travel.bankSec === 'number', '挂机/游历的计时字段补齐');
  /* V1.0.1 改壳（求签 → 点灯）：档位名是**存进存档的值**，旧档必须被迁移。
     老档（改壳前）存的是大吉 / 上吉…，只改壳不迁移 = 面板显示【大吉】而文案是空的。 */
  if (name === 'old_sign_words') {
    say(S.sign.tier === '长明', '旧档位名（大吉）被迁移成新档位名（长明）', String(S.sign.tier));
    const st = Core.signState();
    say(!!st.pick && st.pick.tier === '长明', '面板还能取到对应的灯焰文案（不是空白）', st.pick ? st.pick.tier : '(取不到)');
    say(S.sign.idlePct === 0.3 && S.sign.drawn === 1 && Core.signIdleMult() > 1,
      '挂机加成与已点次数原样保留（改壳不许动数值）', '+' + Math.round(S.sign.idlePct * 100) + '% · 已点 ' + S.sign.drawn + ' 次');
  }
  say(S.v === 5, '版本号被写成当前版本', 'v=' + S.v);
  /* 读进来之后**每一页都要画得出来**（读档崩页面＝玩家进不去游戏） */
  const pages = (CV.panels ? Object.keys(CV.panels) : []);
  let bad = [];
  pages.forEach((p) => {
    if (['pickleader', 'pickswap', 'pickparty'].indexOf(p) >= 0) return;   // 需要先选目标的页，单独测
    try { CV.reset(p); } catch (e) { bad.push(p + '(' + e.message + ')'); }
  });
  say(bad.length === 0, '读档后每一页都能画出来（' + pages.length + ' 页）', bad.length ? bad.slice(0, 4).join(' / ') : '全过');
  /* 再存一次再读一次：来回一趟不丢东西 */
  Core.save();
  const again = Core.load();
  /* 存盘再读一遍：折算**只能发生一次**，第二次读档不许再加一遍（那就是白送货币） */
  say(again === true && Core.S.player.level === 37 && Core.S.cur.points === expPoints && Core.S.cur.otherworld === expOw,
    '存盘再读一遍，进度依旧、折算也没重复跑', '◉' + Core.S.cur.points + ' ◆' + Core.S.cur.otherworld);
  if (loaded && !bad.length) out('__ALL_OK__');
  process.exit(0);
}

/* ==================== 主进程：逐个跑 ==================== */
console.log('\n=== 存档兼容体检（更新不许要求玩家删档）===');
const cases = ['old_missing_blocks', 'older_version', 'old_party4', 'old_sign_words', 'ancient_save', 'broken_json', 'future_version'];
let okAll = true;
cases.forEach((c) => { if (!runCase(c)) okAll = false; });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('结论：' + (okAll ? '旧存档都能平滑升级，读不出来的也会原样备份 ✓' : '有存档会丢 / 会崩 ✗') + '\n');
process.exitCode = okAll ? 0 : 1;
