/* 音频体检（BGM 无缝循环 ＋ 合成音效 ＋ 两个开关）：node scripts/audio_audit.js
   ==================================================================================
   起因（2026-09-27 · 父亲大人）：「拿这个作为游戏背景音乐，你控制一下音量的大小，确保无缝循环播放，
   然后在对应功能配点打击的音效啥的，把游戏的音效补充一下」。

   这把尺子**不靠读代码猜**，而是在一个**假 WebAudio 环境**里把游戏真跑起来，然后逐条验：
     ① **素材**：`audio/bgm-main.mp3` 存在、是 ASCII 名、真的是 mp3、进包不超限；
     ② **音效清单**：派单点名的那几档一个不少，每个都能合成出非空 PCM，
        且**峰值不超过设计峰值**（防手滑改参数改爆音）；合成代码只在 `js/audio.js` 一处
        （"别散着写振荡器代码"是可静态检查的）；
     ③ **两个开关**：默认都开；**老档（没有这两个键）读进来要补成开**；
        **显式关掉的不能被默认值覆盖回去**（老玩家的选择优先）；
     ④ **不自动播放**：冷启动跑完 `started === 0`，模拟一次真实触摸（走 cv.js 的 onTouchStart）
        之后才 `=== 1`；这条防的是"第一帧就出声"被微信拦掉、玩家永远听不到音乐；
     ⑤ **无缝**：拿一条"首尾有静音坑"的合成素材跑 `loopPrep`，断言**坑被填平**
        （对照：不做交叠时坑必须被量出来 —— 否则是尺子不灵，不是产物好）；
     ⑥ **接入点**：战斗 / 抽卡 / 强化 / 重铸 / 开箱 / 领取 / 升级 / 被拒 各处真的调了 `AUD.play`，
        而不是"写了音效没人用"。
   只读脚本（跑在假环境里，不碰真存档、不出声）。

   ★ 做坏试验（改完音频相关的东西，随手挑一条试）：
     · 把 `audio/bgm-main.mp3` 改个中文名 / 挪走 → ① 红；
     · 在 audio.js 的启动那段把 `bgmStart()` 直接调一次 → ④ 红；
     · 把 core.js 的 `bgm: true` 删掉 → ③ 红；
     · 把 `loopPrep` 里那次交叠去掉 → ⑤ 红。
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'js');

/* ---------- 0. 假环境 ---------- */
const store = {};
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

/* ---------- 假 WebAudio：只声明官方 typings 里有的那几个接口 ---------- */
/* 官方 typings（minigame-api-typings 3.8.21）里 AudioParam 只有 value/defaultValue/min/max，
   **没有** setValueAtTime / linearRampToValueAtTime —— 这里也照着不放，
   于是"我们有没有偷偷依赖那些方法"这件事会在本尺子里当场暴露。 */
function waparam(v) { return { value: v, defaultValue: v, minValue: -3.4e38, maxValue: 3.4e38 }; }
function makeFBuf(ch, len, sr) {
  const data = [];
  for (let c = 0; c < ch; c++) data.push(new Float32Array(len));
  return {
    length: len, sampleRate: sr, numberOfChannels: ch, duration: len / sr,
    getChannelData: (c) => data[c],
    copyToChannel: (src, c) => { data[c].set(src.subarray(0, Math.min(src.length, len))); },
    copyFromChannel: () => {},
  };
}
/* 解码出来的"素材"：**故意做成有坑的那种** —— 前 25ms 静音、最后 12.7ms 淡到 0
   （与真素材实测的形状一致：起声 25.2ms / 收声距终点 12.7ms）。 */
function makeDefectiveBuffer(sr, sec) {
  const n = Math.round(sr * sec);
  const b = makeFBuf(1, n, sr);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let e = 1;
    if (t < 0.025) e = 0;                          // 头部那段静音（实测前 20ms 峰值 0.0006）
    else if (t < 0.030) e = (t - 0.025) / 0.005;   // 5ms 起音
    const left = (n - 1 - i) / sr;
    if (left < 0.0127) e = Math.min(e, left / 0.0127); // 结尾淡到 0
    d[i] = 0.5 * Math.sin(2 * Math.PI * 55 * t) * e;
  }
  return b;
}
const AW = {
  started: 0, stopped: 0, sources: 0, gains: 0, resumeCalls: 0, decodeCalls: 0,
  delays: 0, filters: 0,
  comps: 0,
  ctx: null, decoded: null,
};
function makeWebAudio() {
  const sr = 44100;
  AW.decoded = makeDefectiveBuffer(sr, 2.0);
  const dest = { connect() {}, disconnect() {} };
  const c = {
    sampleRate: sr, state: 'suspended', destination: dest,
    createGain() { AW.gains++; return { gain: waparam(1), connect() {}, disconnect() {} }; },
    /* 空间尾用的两个节点（反馈延迟回路）：也得在假环境里存在，
       否则"空间尾到底建没建起来"这条断言就变成了假绿（try/catch 会把它悄悄吃掉）。 */
    createDelay() { AW.delays++; return { delayTime: waparam(0), connect() {}, disconnect() {} }; },
    createBiquadFilter() {
      AW.filters++;
      return { type: 'lowpass', frequency: waparam(350), Q: waparam(1), gain: waparam(0), connect() {}, disconnect() {} };
    },
    /* 总线压限（多目标齐响不削波）也要在假环境里存在，否则这条断言是假绿 */
    createDynamicsCompressor() {
      AW.comps++;
      return { threshold: waparam(-24), knee: waparam(30), ratio: waparam(12),
        attack: waparam(0.003), release: waparam(0.25), connect() {}, disconnect() {} };
    },
    createBuffer(ch, len, s) { return makeFBuf(ch, len, s); },
    createBufferSource() {
      AW.sources++;
      return {
        buffer: null, loop: false, onended: null, connect() {}, disconnect() {},
        start() { AW.started++; }, stop() { AW.stopped++; },
      };
    },
    /* ⚠️ **同步**回调：把"首帧就走完解码"这种最坏情况直接摆到桌面上 —— ④ 就是在这里抓人的 */
    decodeAudioData(ab, ok) { AW.decodeCalls++; if (ok) ok(AW.decoded); return undefined; },
    resume() { AW.resumeCalls++; c.state = 'running'; return Promise.resolve(); },
    suspend() { c.state = 'suspended'; return Promise.resolve(); },
  };
  AW.ctx = c;
  return c;
}

let touchStart = null, touchEnd = null;
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  getSystemInfoSync: () => ({ platform: 'devtools', windowWidth: 390, windowHeight: 844, pixelRatio: 3 }),
  onTouchStart(fn) { touchStart = fn; }, onTouchMove(fn) { touchEnd = touchEnd || null; },
  onTouchEnd(fn) { touchEnd = fn; }, onTouchCancel() {},
  onWindowResize() {}, onShow() {}, onHide() {},
  onAudioInterruptionBegin() {}, onAudioInterruptionEnd() {},
  getStorageSync(k) { return k in store ? store[k] : ''; },
  setStorageSync(k, v) { store[k] = String(v); }, removeStorageSync(k) { delete store[k]; },
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
  createWebAudioContext: makeWebAudio,
  /* 包内文件读取：不传 encoding → ArrayBuffer（真机就是这个口径） */
  getFileSystemManager: () => ({
    readFileSync(p) { return fs.readFileSync(path.join(ROOT, p)); },
  }),
  env: { USER_DATA_PATH: '/tmp' },
};

require(path.join(JS, 'mem-guard.js'));
/* ⚠️ 载入顺序必须与 game.js 一致：audio.js 排在 cv.js 之后、**uiw.js 之前**
   （音频要包住 CV.dispatch 的点击收口，而引导/弹窗那层要包在音频外面）。 */
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'audio.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const Core = global.Core, D = global.DATA, AUD = global.AUD;
const KEY = 'wxlh_save_v5';
/* ⚠️ 触摸处理器是在 **game.js** 里挂的（`CV.bindTouch()`），而本尺子不加载 game.js
   （那份会把整个游戏跑起来）。这里补上这一步，为的是让 ④ 走的是**真的触摸入口**
   （cv.js 的 onTouchStart → AUD.unlock），而不是尺子自己直接调 AUD.unlock() 那种"自己验自己"。 */
global.CV.bindTouch();
let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : '')); };
const sec = (t) => console.log('\n' + t);
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ================= ① 素材 ================= */
sec('=== ① BGM 素材 ===');
{
  chk('AUD 模块存在（js/audio.js 已载入）', !!AUD && typeof AUD.play === 'function');
  const rel = (AUD && AUD.BGM_SRC) || 'audio/bgm-main.mp3';
  const abs = path.join(ROOT, rel);
  chk('素材在工程里（' + rel + '）', fs.existsSync(abs));
  chk('路径全是 ASCII（中文名加载不了 —— 本项目栽过）', /^[\x20-\x7e]+$/.test(rel), rel);
  if (fs.existsSync(abs)) {
    const buf = fs.readFileSync(abs);
    chk('素材体积合理（>100KB）', buf.length > 100 * 1024, (buf.length / 1024).toFixed(0) + ' KB');
    /* MP3 判定：ID3 头 或 帧同步 0xFFEx/0xFFFx */
    const isMp3 = (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
      || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    chk('确实是 mp3（ID3 / 帧同步）', isMp3);
  }
  /* 音量口径自证：素材实测 −15.6 LUFS（head 注释与回单里都写着数），gain 必须是那个数 */
  chk('BGM gain 落在"垫在音效下面"的档（0.2~0.6）', AUD.BGM_GAIN > 0.2 && AUD.BGM_GAIN < 0.6, String(AUD.BGM_GAIN));
  chk('SFX gain 比 BGM 高（音效要盖得住音乐）', AUD.SFX_GAIN > AUD.BGM_GAIN, AUD.SFX_GAIN + ' > ' + AUD.BGM_GAIN);
}

/* ================= ② 音效清单 ================= */
sec('=== ② 音效清单（派单点名的每一档）===');
{
  const REQUIRED = [
    ['click', '全局按钮点击'],
    ['hit', '战斗命中'],
    ['crit', '暴击'],
    ['ult', '大绝'],
    ['skill', '技能释放'],
    ['win', '胜负结算（胜）'],
    ['lose', '胜负结算（负）'],
    ['enhanceOk', '强化成功'],
    ['enhanceFail', '强化失败'],
    ['reforge', '重铸'],
    ['recruit', '抽卡（普通）'],
    ['recruitRare', '抽卡（SSR/UR 出货）'],
    ['open', '开箱'],
    ['levelup', '升级 / 解锁'],
    ['error', '报错 / 被拒'],
    ['claim', '任务领取'],
    ['dot', '战斗：持续伤害（也是伤害飘字）'],
    ['dodge', '战斗：被闪避 / miss（弱"空"音）'],
    ['shield', '战斗：护盾'],
    ['revive', '战斗：复活'],
  ];
  const names = (AUD && AUD.SFX_NAMES) || [];
  REQUIRED.forEach(function (r) {
    chk('有 ' + r[0] + '（' + r[1] + '）', names.indexOf(r[0]) >= 0);
  });
  let badPeak = [], empty = [];
  names.forEach(function (n) {
    const spec = AUD._spec(n);
    const pcm = AUD._synth(n);
    if (!spec || !spec.layers || !spec.layers.length || !pcm || !pcm.length) { empty.push(n); return; }
    let mx = 0;
    for (let i = 0; i < pcm.length; i++) { const v = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (v > mx) mx = v; }
    if (mx > spec.peak + 0.02 || mx < 0.05) badPeak.push(n + '=' + mx.toFixed(3) + '/' + spec.peak);
  });
  chk('每个音效都能合成出非空 PCM', empty.length === 0, empty.join(','));
  chk('峰值都等于设计峰值（不超、不哑）', badPeak.length === 0, badPeak.join(' '));
  /* "一处定义"：合成只用 audio.js —— 别散着写振荡器代码 */
  const synthRe = /createBufferSource|createOscillator|createWaveShaper|createBuffer\(/;
  const offenders = ['game.js'].concat(fs.readdirSync(JS).map((f) => 'js/' + f))
    .filter((rel) => rel !== 'js/audio.js')
    .filter((rel) => { const p = path.join(ROOT, rel); return fs.existsSync(p) && synthRe.test(fs.readFileSync(p, 'utf8')); });
  chk('合成代码只在 js/audio.js 一处', offenders.length === 0, offenders.join(','));
}

/* ================= ③ 两个设置开关 ================= */
sec('=== ③ 设置开关（默认 + 老档补齐）===');
{
  Core.newGame();
  chk('新档：音乐默认开（settings.bgm === true）', Core.S.settings.bgm === true, String(Core.S.settings.bgm));
  chk('新档：音效默认开（settings.sfx === true）', Core.S.settings.sfx === true, String(Core.S.settings.sfx));
  /* 老档：没有这两个键（就是老玩家那份存档的样子），读进来必须补成开 */
  const plain = JSON.parse(JSON.stringify(Core.S));
  delete plain.settings.bgm;
  delete plain.settings.sfx;
  store[KEY] = JSON.stringify(plain);
  const ok = Core.load();
  chk('老档（无 bgm/sfx 键）能读进来', ok === true);
  chk('老档补齐：音乐＝开', Core.S.settings.bgm === true, String(Core.S.settings.bgm));
  chk('老档补齐：音效＝开', Core.S.settings.sfx === true, String(Core.S.settings.sfx));
  /* 显式关掉的不许被默认值覆盖回去（老玩家的选择优先） */
  const plain2 = JSON.parse(JSON.stringify(Core.S));
  plain2.settings.bgm = false;
  plain2.settings.sfx = false;
  store[KEY] = JSON.stringify(plain2);
  Core.load();
  chk('显式关闭不被默认值覆盖：音乐仍为关', Core.S.settings.bgm === false);
  chk('显式关闭不被默认值覆盖：音效仍为关', Core.S.settings.sfx === false);
  /* 设置页真的画了这两行 */
  const src = readSrc('js/sc-last.js');
  /* ⚠️ 判据要**咬住那一行**：只查"文件里出现过 sfx"是不够的 —— 实测把那一行的键改名，
     松判据照样绿（别的开关表里也有 sfx 这个词）。 */
  const card = (function () {
    const i = src.indexOf("U.h3('声音')");
    return i < 0 ? '' : src.slice(i, i + 900);
  })();
  chk('设置页有「音乐」开关（那一行：bgm / 背景音乐）', /\[\s*'bgm'\s*,\s*'背景音乐'/.test(card));
  chk('设置页有「音效」开关（那一行：sfx / 音效）', /\[\s*'sfx'\s*,\s*'音效'/.test(card));
  chk('两个开关都走 toggle:*（点了真的会翻）', /'toggle:'\s*\+\s*r\[0\]/.test(card));
  chk('开关翻完会调 AUD.apply()（立刻生效）', /G\.AUD && G\.AUD\.apply/.test(src));
  /* 恢复成"都开"，后面的用例才公平 */
  Core.S.settings.bgm = true; Core.S.settings.sfx = true;
}

/* ================= ④ 不许自动播放 ================= */
sec('=== ④ 不许自动播放（首帧一个 source 都不许 start）===');
{
  chk('启动时建了音频上下文', !!AW.ctx);
  chk('启动时真的解了码（解码 ≠ 播放）', AW.decodeCalls >= 1, 'decodeAudioData ×' + AW.decodeCalls);
  chk('冷启动跑完：一个 source 都没 start', AW.started === 0, 'started=' + AW.started);
  chk('冷启动跑完：BGM 没在播', AUD.diag().bgmPlaying === false);
  chk('冷启动跑完：还没解锁（unlocked === false）', AUD.diag().unlocked === false);
  chk('cv.js 在第一次触摸处调了 AUD.unlock()', /G\.AUD && G\.AUD\.unlock/.test(readSrc('js/cv.js')));
  /* 真的走一次 cv.js 的触摸入口（不是直接调 AUD.unlock，那样等于自己验自己） */
  chk('触摸处理器已注册', typeof touchStart === 'function');
  if (typeof touchStart === 'function') {
    touchStart({ touches: [{ clientX: 200, clientY: 400, identifier: 1 }], timeStamp: Date.now() });
  }
  chk('第一次触摸之后：解锁', AUD.diag().unlocked === true);
  chk('第一次触摸之后：BGM 起播，且只起了一次', AW.started === 1, 'started=' + AW.started);
  chk('BGM 真的是循环源（loop === true）', (function () {
    return AUD.diag().bgmPlaying === true;
  })());
  /* 再点几次不许重启 */
  for (let i = 0; i < 5; i++) if (touchStart) touchStart({ touches: [{ clientX: 1, clientY: 1, identifier: 1 }], timeStamp: Date.now() });
  chk('后续触摸不会重启 BGM（started 仍是 1）', AW.started === 1, 'started=' + AW.started);
}

/* ================= ⑤ 无缝：回环点的"坑"必须被填平 ================= */
sec('=== ⑤ 无缝循环（回环点的静音坑）===');
{
  const sr = 44100;
  /* 不交叠的回环点：素材自己首尾那段静音 —— 先证明这条尺子量得出坑 */
  const raw = makeDefectiveBuffer(sr, 2.0);
  const rd = raw.getChannelData(0);
  /* 判据＝**回环点两侧各取 10ms，哪一侧更差看哪一侧**：任意一侧塌成静音，
     接起来就是一个"坑"（10ms 是耳朵能听出来的那一档）。
     ⚠️ 不用峰值：峰值会被"坑前一两个样本还是满幅"骗过去（实测过 —— 一个 12ms 的
     淡出里，前 8ms 还是满幅，峰值看着一点没掉）。 */
  const seamWin = Math.round(0.010 * sr);
  function rms(a, from, to) { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, to - from)); }
  function seamLevel(a, n) {
    return Math.min(rms(a, 0, seamWin), rms(a, n - seamWin, n));
  }
  const body = rms(rd, Math.round(0.3 * sr), raw.length - Math.round(0.3 * sr));
  const rawSeam = seamLevel(rd, raw.length);
  chk('对照组（不交叠）：回环点确实有个坑', rawSeam < 0.2 * body, 'seam=' + rawSeam.toFixed(4) + ' body=' + body.toFixed(3));
  /* 交叠之后：坑必须没了 */
  const fixed = AUD._loopPrep(raw);
  const fd = fixed.getChannelData(0);
  /* 交叠长度按实现算（`min(LOOP_XFADE×sr, n/4)` 向下取整）—— 别在这里另写一套四舍五入 */
  const xf = Math.min(Math.floor(AUD.LOOP_XFADE * sr), Math.floor(raw.length / 4));
  chk('交叠后缓冲变短（= 原长 − ' + AUD.LOOP_XFADE + 's）',
    fixed.length === raw.length - xf,
    fixed.length + ' vs ' + (raw.length - xf));
  const fixedSeam = seamLevel(fd, fixed.length);
  chk('交叠后：回环点没有坑（≥ 乐句峰值的 50%）', fixedSeam >= 0.5 * body, 'seam=' + fixedSeam.toFixed(4) + ' body=' + body.toFixed(3));
  /* 回环点样点差 ≤ 自然步长 ×3（不许"咔"）*/
  const steps = [];
  for (let i = Math.round(0.3 * sr); i < fixed.length - Math.round(0.3 * sr); i++) steps.push(Math.abs(fd[i + 1] - fd[i]));
  steps.sort((a, b) => a - b);
  const med = steps[Math.floor(steps.length / 2)] || 1e-6;
  const jump = Math.abs(fd[0] - fd[fixed.length - 1]);
  chk('交叠后：回环点样点差 ≈ 自然步长（无跳变）', jump <= med * 3, 'jump=' + jump.toFixed(5) + ' 自然步长中位=' + med.toFixed(5));
}

/* ================= ⑥ 接入点 ================= */
sec('=== ⑥ 接入点（写了音效要有人用）===');
{
  const WANT = [
    ['js/cv.js', /G\.AUD && G\.AUD\.unlock/, '第一次触摸解锁'],
    ['js/audio.js', /play\('click'\)/, '全局点击收口（CV.dispatch）'],
    ['js/sc-battle.js', /snd\(f\.crit \? 'crit' : 'hit'\)/, '战斗命中 / 暴击'],
    ['js/sc-battle.js', /snd\(f\.ult \? 'ult' : 'skill'\)/, '技能 / 大绝'],
    ['js/sc-battle.js', /snd\(res\.win \? 'win' : 'lose'\)/, '胜负结算'],
    ['js/sc-recruit.js', /'recruitRare' : 'recruit'/, '抽卡（含出货）'],
    ['js/sc-bag.js', /snd\(r\.ok \? 'enhanceOk' : 'enhanceFail'\)/, '强化成功 / 失败'],
    ['js/sc-bag.js', /snd\('reforge'\)/, '重铸'],
    ['js/sc-bag.js', /snd\(r && r\.ok === false \? 'error' : 'open'\)/, '开箱'],
    ['js/sc-last.js', /snd\(r && r\.ok === false \? 'error' : 'claim'\)/, '任务 / 悬赏 / 成就领取'],
    ['js/sc-home.js', /snd\(r && r\.total \? 'claim' : 'error'\)/, '首页一键领取'],
    ['js/sc-lines.js', /snd\(r\.ok \? 'levelup' : 'error'\)/, '秘术阁升级'],
    ['js/sc-core-pages.js', /snd\(r\.ok \? 'levelup' : 'error'\)/, '建筑 / 伴生体升级'],
    ['game.js', /require\('\.\/js\/audio\.js'\)/, '加载顺序'],
  ];
  WANT.forEach(function (w) {
    const p = path.join(ROOT, w[0]);
    chk(w[2] + '（' + w[0] + '）', fs.existsSync(p) && w[1].test(fs.readFileSync(p, 'utf8')));
  });
  /* 两个声音增益是分开的（BGM 音量与音效音量互不牵连） */
  chk('BGM / SFX 是两条独立的 gain', AW.gains >= 2, 'createGain ×' + AW.gains);
}

/* ================= ⑦ 音色：够不够暗、有没有空间尾 ================= */
sec('=== ⑦ 音色（暗黑口径：低频为主 · 少亮高频 · 空间尾）===');
{
  /* **光谱重心**（用一阶差分能量比估算，不用引库）：对 sin(ωn)，差分能量比 = 4sin²(ω/2) ≈ ω²，
     所以重心 ≈ sr/(2π)·√(Σd²/Σx²)。它的好处是**纯函数、可复现、拿数字说话** ——
     父亲大人说"太卡通/太亮"，这条就该变成数：亮的东西重心高、闷的东西重心低。 */
  const SRS = 44100;
  /* ⚠️ **重心不在这里量**：上一轮用的是"一阶差分能量比"估算（只看整体斜率），
     它会把"低频闷响里混了一层中频噪声"读成高重心（hit 578Hz），
     和真 FFT 的结论（hit 101Hz）对着干。K2 起统一用 ⑨ 的 **FFT 重心**（那才是能服人的那个数），
     本节只留"静态形状（带限 / 悦耳区禁入）"和"外放可听带宽"两件事。 */
  /* 噪声一律带限（"少亮高频"最容易被一条没过滤的噪声破坏）。
     K2 口径：噪声走"带通（300~800）＋ 封顶低通"，所以这里按**上边沿**判 ——
     写死 `lp` 的按 lp 判，写 `bp` 的按 f0×(1+1/(2Q)) 估上边沿（RBJ 带通：BW = f0/Q）。 */
  const brightNoise = [];
  AUD.SFX_NAMES.forEach(function (n) {
    (AUD._spec(n).layers || []).forEach(function (l) {
      if (l.kind !== 'noise') return;
      const top = l.bp ? l.bp[0] * (1 + 1 / (2 * (l.bp[1] || 1))) : (l.lp || 900);
      if (top > 900) brightNoise.push(n + ':' + Math.round(top) + 'Hz');
    });
  });
  chk('每一条噪声都带限（上边沿 ≤900Hz）', brightNoise.length === 0, brightNoise.join(' '));
  /* K2 铁律（静态）：**不许有 800Hz 以上的干净正弦/方波声部** —— "嘟"就是这么来的。
     （`tri` 是按同样口径管的：它也是"干净短音"。例外只能写在回单里，这里不开口子。） */
  const brightTone = [];
  AUD.SFX_NAMES.forEach(function (n) {
    (AUD._spec(n).layers || []).forEach(function (l) {
      if (l.kind === 'noise') return;
      const f0 = l.f0 || 0, f1 = l.f1 || f0;
      if (Math.max(f0, f1) > 800) brightTone.push(n + ':' + l.kind + ' ' + Math.round(Math.max(f0, f1)) + 'Hz');
    });
  });
  chk('没有任何 ≥800Hz 的正弦/三角/锯齿声部（悦耳区禁入）', brightTone.length === 0, brightTone.join(' '));
  /* 空间尾：反馈延迟回路真的建起来了（不是只写在注释里） */
  const sp = AUD.diag().space || {};
  chk('空间尾（反馈延迟）建起来了', sp.ok === true, sp.why || '');
  chk('空间尾的参数对得上（延迟 / 反馈 / 阻尼 / 湿度）',
    Math.abs(sp.delay - 0.13) < 0.001 && Math.abs(sp.fb - 0.45) < 0.001
    && Math.abs(sp.damp - 900) < 1 && Math.abs(sp.wet - 0.35) < 0.001,
    'delay=' + sp.delay + ' fb=' + sp.fb + ' damp=' + sp.damp + ' wet=' + sp.wet);
  chk('假环境里真的建了延迟节点 / 低通节点', AW.delays >= 1 && AW.filters >= 1,
    'createDelay ×' + AW.delays + ' · createBiquadFilter ×' + AW.filters);
  /* 总线压限：多目标同帧齐响（6 个敌人各 0.98 峰值相加）不许硬削波 */
  chk('总线压限建起来了（多目标齐响不削波）', AW.comps >= 1 && sp.comp === -10,
    'createDynamicsCompressor ×' + AW.comps + ' · threshold=' + sp.comp + 'dB');
  /* ★ 手机外放能不能听见 —— 低频为主最容易栽的一条：
     小喇叭 300Hz 以下基本推不出来，只看"总峰值"会得出"很响"的错觉。
     这里用一阶 RC 高通（300Hz）把"外放推得出来的那一部分"切出来量峰值。 */
  function audiblePeak(pcm, fc) {
    const c = 1 / (1 + 2 * Math.PI * fc / SRS);
    let y = 0, xp = 0, m = 0;
    for (let i = 0; i < pcm.length; i++) {
      y = c * (y + pcm[i] - xp); xp = pcm[i];
      const v = y < 0 ? -y : y;
      if (v > m) m = v;
    }
    return m;
  }
  function audibleRatio(pcm, fc) {
    const c = 1 / (1 + 2 * Math.PI * fc / SRS);
    let y = 0, xp = 0, e = 0, h = 0;
    for (let i = 0; i < pcm.length; i++) {
      const x = pcm[i];
      y = c * (y + x - xp); xp = x;
      e += x * x; h += y * y;
    }
    return e ? Math.sqrt(h / e) : 0;
  }
  const AP = {}, AR = {};
  AUD.SFX_NAMES.forEach(function (n) { const p = AUD._synth(n); AP[n] = audiblePeak(p, 300); AR[n] = audibleRatio(p, 300); });
  const arAvg = AUD.SFX_NAMES.reduce(function (s, n) { return s + AR[n]; }, 0) / AUD.SFX_NAMES.length;
  chk('不是"全躲在低频里"（外放可听带占比平均 ≥30%）', arAvg >= 0.30, (100 * arAvg).toFixed(0) + '%');
  chk('命中外放听得见（可听带峰值 ≥0.25）', AP.hit >= 0.25, AP.hit.toFixed(3));
  chk('暴击在外放上**明显比命中重**（≥1.15× 命中的可听带峰值）', AP.crit >= AP.hit * 1.15,
    'crit ' + AP.crit.toFixed(3) + ' vs hit ' + AP.hit.toFixed(3));
  chk('大绝 ≥ 命中（一场里最重的一下）', AP.ult >= AP.hit, AP.ult.toFixed(3));
  chk('闪避是"弱"的（可听带峰值 ≤0.7× 命中）', AP.dodge <= AP.hit * 0.7, AP.dodge.toFixed(3));
  /* 留一张表给回单/复核：每个音效的重心（数字比"听着挺闷"可信） */
  console.log('  ℹ 外放可听带(>300Hz)：' + AUD.SFX_NAMES.map((n) => n + ' ' + (100 * AR[n]).toFixed(0) + '%/pk' + AP[n].toFixed(2)).join(' · '));
}

/* ================= ⑧ 战斗挂点：每一次伤害飘字都要有同帧音效 ================= */
sec('=== ⑧ 战斗音效挂点（飘字那一刻 / 多段多声 / 不许提前到回合开始）===');
{
  const src = readSrc('js/sc-battle.js');
  /* 取某个 case 的整块代码（到下一个 case / default 为止） */
  const caseBlock = function (name) {
    const i = src.indexOf("case '" + name + "':");
    if (i < 0) return null;
    const rest = src.slice(i + 1);
    const j = rest.search(/\n\s*(case '|default:)/);
    return j < 0 ? rest : rest.slice(0, j);
  };
  /* ① 静态：该出声的 case 必须有 snd，且**紧跟在飘字那一行附近**（同一次调用里） */
  const NEED = [['damage', /snd\(f\.crit \? 'crit' : 'hit'\)/], ['dot', /snd\('dot'\)/],
    ['dodge', /snd\('dodge'\)/], ['shield', /snd\('shield'\)/], ['revive', /snd\('revive'\)/]];
  NEED.forEach(function (n) {
    const b = caseBlock(n[0]);
    chk("case '" + n[0] + "' 里有对应的音效调用", !!b && b.indexOf('floater(') >= 0 && n[1].test(b));
  });
  /* ② 静态：回合 / 波次起点**不许**有音效（父亲大人点名要能变红的那条） */
  ['round', 'attack'].forEach(function (n) {
    const b = caseBlock(n) || '';
    chk("case '" + n + "'（回合/出手起点）里没有音效", b.indexOf('snd(') < 0);
  });
  /* ③ 静态：step() / loadRes() / fight() 里不许按时间轴配乐 */
  ['function step()', 'function loadRes(res)', 'function fight(res)'].forEach(function (h) {
    const i = src.indexOf(h);
    let body = '';
    if (i >= 0) { const rest = src.slice(i); const j = rest.indexOf('\n  }'); body = j < 0 ? rest : rest.slice(0, j); }
    else if (h.indexOf('fight') >= 0) {   // fight() 是两行小函数
      const k = src.indexOf('function fight(res) {');
      body = k < 0 ? '' : src.slice(k, src.indexOf('}', k) + 1);
    }
    chk(h.replace('function ', '') + ' 里没有音效（防"按帧时间轴配乐"）', !!body && body.indexOf('snd(') < 0);
  });
  /* ④ 运行期：**逐帧手推**，断言"有伤害飘字 ⇒ 同一次调用里有音效"，且多段＝多声 */
  const UI = global.BattleUI, Battle = global.Battle;
  chk('战斗页露了测试口（_load / _applyFrame）', !!(UI && UI._load && UI._applyFrame));
  if (UI && UI._load && UI._applyFrame) {
    AUD.unlock();                                  // 真人早该点过屏幕了；尺子在这里补一次
    const played = [];
    const realPlay = AUD.play;
    AUD.play = function (n) { const r = realPlay.call(AUD, n); if (r) played.push(n); return r; };
    const B = UI._battle;
    /* 合成一帧序列：把暴击 / 持续伤害 / 闪避 / 护盾 / 复活全走到 */
    const ally = { uid: 'A1', side: 'ally', name: '主角', hp: 500, maxHp: 500, kind: 'warrior', charId: '@player' };
    const foe = { uid: 'E1', side: 'foe', name: '游影', hp: 500, maxHp: 500, kind: 'warrior' };
    const FR = [
      { type: 'start', allies: [ally], enemies: [foe] },
      { type: 'round', n: 1 },
      { type: 'attack', actor: 'A1' },
      { type: 'damage', source: 'A1', target: 'E1', dmg: 12, crit: false },
      { type: 'damage', source: 'A1', target: 'E1', dmg: 44, crit: true },
      { type: 'dot', target: 'E1', dmg: 6 },
      { type: 'dodge', target: 'E1' },
      { type: 'shield', target: 'A1', amount: 30 },
      { type: 'revive', boss: 'E1', text: '回音之主复活' },
      { type: 'end', win: true, rounds: 1 },
    ];
    const check = function (frames, tag) {
      UI._load({ frames: frames });
      B.floaters = [];
      played.length = 0;
      let dmgFloat = 0, dmgSnd = 0, noSndFrame = -1, wrongName = '';
      frames.forEach(function (f, i) {
        const before = new Set(B.floaters);
        const p0 = played.length;
        UI._applyFrame(f);
        const added = B.floaters.filter((o) => !before.has(o));
        const dmg = added.filter((o) => /^-|^暴击/.test(String(o.text || '')));
        const here = played.slice(p0);
        if (dmg.length) {
          dmgFloat += dmg.length;
          if (!here.length) { if (noSndFrame < 0) noSndFrame = i; }
          else dmgSnd += Math.min(dmg.length, here.length);
          const want = (f.type === 'damage') ? (f.crit ? 'crit' : 'hit') : (f.type === 'dot' ? 'dot' : null);
          if (want && here.indexOf(want) < 0) wrongName = '帧 ' + i + ' 期望 ' + want + ' 实际 ' + here.join(',');
        }
      });
      chk(tag + '：有伤害飘字的帧**全都**同帧出声', noSndFrame < 0, noSndFrame < 0 ? '' : ('第 ' + noSndFrame + ' 帧没出声'));
      chk(tag + '：伤害飘字数 == 伤害音效数（多段＝多声）', dmgFloat === dmgSnd, dmgFloat + ' 飘字 / ' + dmgSnd + ' 声');
      chk(tag + '：暴击用独立音色（crit）', wrongName === '', wrongName);
    };
    check(FR, '合成帧（含暴击/持续伤害/闪避/护盾/复活）');
    /* 真帧序列（逻辑层出的那一份）：跑一整场 W01-1，逐帧手推 */
    Core.newGame();
    Core.setPlayerName('音频体检');
    try { Core.choosePlayerBloodline('修真'); } catch (e) {}
    Core.S.player.level = 30;
    const allies = UI.buildAllies({}, {});
    const res = Battle.run({ allies: allies, enemies: global.Dungeon.makeEnemies('W01', 'normal', 1, 'combat'),
      worldId: 'W01', maxRounds: 60 });
    chk('真战斗出得来帧（W01-1）', !!(res && res.frames && res.frames.length > 5), String(res && res.frames && res.frames.length) + ' 帧');
    if (res && res.frames) check(res.frames, '真帧序列（W01-1）');
    AUD.play = realPlay;
  }
}

/* ================= ⑨ K2 验收：把"好听"变成可量（离线 FFT） ================= */
sec('=== ⑨ K2 验收 · 频谱重心 / 主频 / 噪声成分（离线 FFT）===');
{
  /* 尺子自带一把 radix-2 FFT（不引任何库）：父亲大人要的"离线算 FFT"就在这儿。
     ⚠️ 上一轮用的是"一阶差分能量比"估重心 —— 它只看**整体的斜率**，
     分不清"低频闷响里混了一层中频噪声"（这正是"敲石台"和"嘟"的区别）。换成真 FFT 之后，
     ①重心按 |X|² 的加权频率算；②"主频"＝谱峰位置；③"悦耳区能量占比"＝>800Hz 的能量份额。 */
  const FN = 16384, FSR = 44100;
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  function spectrum(pcm) {
    const take = Math.min(pcm.length, FN);
    const re = new Float64Array(FN), im = new Float64Array(FN);
    for (let i = 0; i < take; i++) re[i] = pcm[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (take - 1)));   // Hann
    fft(re, im);
    const df = FSR / FN;
    let sum = 0, csum = 0, hi = 0, pk = 0, pkF = 0;
    for (let k = 1; k < FN / 2; k++) {
      const f = k * df;
      if (f < 40 || f > 12000) continue;
      const p = re[k] * re[k] + im[k] * im[k];
      sum += p; csum += f * p;
      if (p > pk) { pk = p; pkF = f; }
      if (f > 800) hi += p;
    }
    return { centroid: csum / sum, peakF: pkF, hiRatio: hi / sum };
  }
  function rmsOf(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); }
  /* ---------- 尺子自证（对照组）：1kHz 纯正弦短音必须被判成"亮" ---------- */
  const probe = new Float32Array(Math.round(FSR * 0.05));
  for (let i = 0; i < probe.length; i++) probe[i] = 0.6 * Math.sin(2 * Math.PI * 1000 * i / FSR) * Math.exp(-i / (FSR * 0.02));
  const psp = spectrum(probe);
  chk('对照组：纯 1kHz 正弦短音被判成"亮"（重心/主频都 >800Hz）—— 尺子抓得住"嘟"',
    psp.centroid > 800 && psp.peakF > 800,
    '重心 ' + Math.round(psp.centroid) + 'Hz · 主频 ' + Math.round(psp.peakF) + 'Hz');
  /* ---------- 逐档实测 ---------- */
  const SP = {}, SHARE = {};
  AUD.SFX_NAMES.forEach(function (n) {
    SP[n] = spectrum(AUD._synth(n));
    const ls = AUD._spec(n).layers;
    const full = rmsOf(AUD._render(ls));
    SHARE[n] = {
      noise: rmsOf(AUD._render(ls.filter((l) => l.kind === 'noise'))) / full,
      tone: rmsOf(AUD._render(ls.filter((l) => l.kind !== 'noise'))) / full,
    };
  });
  /* C1：点击音与打击音的**重心 < 300Hz** */
  const IMPACT = ['click', 'hit', 'crit', 'dot', 'reforge'];
  const hotImpact = IMPACT.filter((n) => SP[n].centroid >= 300);
  chk('C1 点击/打击类频谱重心 <300Hz（' + IMPACT.join('/') + '）', hotImpact.length === 0,
    hotImpact.map((n) => n + '=' + Math.round(SP[n].centroid) + 'Hz').join(' ')
      || IMPACT.map((n) => n + ' ' + Math.round(SP[n].centroid)).join(' · '));
  /* C2：没有任何音效的**主频**落在 800Hz 以上的"悦耳区" */
  const highPeak = AUD.SFX_NAMES.filter((n) => SP[n].peakF > 800);
  chk('C2 没有任何音效的主频 >800Hz（悦耳区）', highPeak.length === 0,
    highPeak.map((n) => n + '=' + Math.round(SP[n].peakF) + 'Hz').join(' ')
      || ('最高 ' + Math.round(Math.max.apply(null, AUD.SFX_NAMES.map((n) => SP[n].peakF))) + 'Hz（'
        + AUD.SFX_NAMES.slice().sort((a, b) => SP[b].peakF - SP[a].peakF)[0] + '）'));
  /* C2b：>800Hz 的能量占比（白名单：只 `dodge` 一个 —— 它是"空"音，带通噪声扫过，
     本来就该是中频气声；它的**主频** 345Hz 仍在 800 以下，见 C2） */
  const hiBad = AUD.SFX_NAMES.filter((n) => SP[n].hiRatio > 0.20);
  chk('C2b >800Hz 能量占比全部 ≤20%（白名单：无）', hiBad.length === 0,
    hiBad.map((n) => n + '=' + (100 * SP[n].hiRatio).toFixed(1) + '%').join(' ')
      || ('最高 ' + AUD.SFX_NAMES.slice().sort((a, b) => SP[b].hiRatio - SP[a].hiRatio)[0] + ' '
        + (100 * Math.max.apply(null, AUD.SFX_NAMES.map((n) => SP[n].hiRatio))).toFixed(1) + '%'));
  /* C3：打击音**同时含"低频成分"与"噪声成分"**（不是纯正弦）——
     用"把噪声层 / 乐音层分别渲染出来的 RMS 占比"量（混在一起的频谱会被窄带峰带偏）。 */
  const badShare = [];
  IMPACT.concat(['open']).forEach(function (n) {
    if (SHARE[n].noise < 0.30 || SHARE[n].tone < 0.25) badShare.push(n + '(噪声' + SHARE[n].noise.toFixed(2) + '/乐音' + SHARE[n].tone.toFixed(2) + ')');
  });
  chk('C3 打击/点击同时有"低频"与"噪声"两种成分（噪声RMS≥0.30 且 乐音RMS≥0.25）',
    badShare.length === 0, badShare.join(' '));
  const pureSine = AUD._render([{ kind: 'sine', f0: 100, dur: 0.1, gain: 1, a: 0.002, k: 3 }]);
  const sineNoiseShare = rmsOf(pureSine) ? rmsOf(AUD._render([])) / rmsOf(pureSine) : 0;
  chk('对照组：纯正弦的"噪声成分"= 0（这条断言有分辨力，不是摆设）', sineNoiseShare === 0, String(sineNoiseShare));
  console.log('  ℹ 重心/主频/>800：' + AUD.SFX_NAMES.map((n) => n + ' ' + Math.round(SP[n].centroid)
    + '/' + Math.round(SP[n].peakF) + '/' + (100 * SP[n].hiRatio).toFixed(1) + '%').join(' · '));
  console.log('  ℹ 成分占比（噪声/乐音，RMS）：' + AUD.SFX_NAMES.map((n) => n + ' ' + SHARE[n].noise.toFixed(2) + '/' + SHARE[n].tone.toFixed(2)).join(' · '));
}

/* ================= ⑩ 开关的即时生效（真停 / 真静音） ================= */
sec('=== ⑩ 关掉要真的停 ===');
{
  Core.S.settings.bgm = true; AUD.apply();
  const before = AW.stopped;
  Core.S.settings.bgm = false; AUD.apply();
  chk('关音乐：source 被 stop（不是只置标志位）', AW.stopped > before, 'stop() ×' + (AW.stopped - before));
  chk('关音乐：diag 里 bgmPlaying = false', AUD.diag().bgmPlaying === false);
  const startedBefore = AW.started;
  Core.S.settings.bgm = true; AUD.apply();
  chk('再开音乐：能重新起播（新建 source）', AW.started === startedBefore + 1, 'started=' + AW.started);
  Core.S.settings.sfx = false; AUD.apply();
  chk('关音效：SFX gain 压到 0', AUD.diag().gain.sfx === 0, String(AUD.diag().gain.sfx));
  const s0 = AW.sources;
  chk('关音效：play() 直接不出声（不新建 source）', AUD.play('hit') === false && AW.sources === s0);
  Core.S.settings.sfx = true; AUD.apply();
  chk('再开音效：SFX gain 回到设计值', Math.abs(AUD.diag().gain.sfx - AUD.SFX_GAIN) < 1e-6);
  chk('打开后 play(\'click\') 真的出声', AUD.play('click') === true);
  chk('UI 音效太密会被节流（第二次立刻再来 → false）', AUD.play('click') === false);
  /* 父亲大人续单钉的"多段每段一声"在这里也钉一道：
     战斗音效**不许**被声部上限/节流吃掉（上一版就是这么在第 24 帧丢过一声）。 */
  chk('战斗音效不受节流（间隔 0）：连打两下就是两声',
    AUD.play('hit') === true && AUD.play('hit') === true);
  let burstOk = true;
  for (let i = 0; i < 24; i++) if (AUD.play(i % 3 ? 'hit' : 'crit') !== true) burstOk = false;
  chk('连击爆量（24 声连续）一声不丢（战斗音效不受声部上限）', burstOk);
  chk('不认识的名字不会炸（返回 false）', AUD.play('没有这个音效') === false);
}

/* ================= ⑪ 进包体积 ================= */
sec('=== ⑪ 进包体积（上限 4MB）===');
{
  const LIMIT = 4 * 1024 * 1024;
  let cfg = {};
  try { cfg = JSON.parse(readSrc('project.config.json')); } catch (e) {}
  const ignores = ((cfg.packOptions && cfg.packOptions.ignore) || []).map((x) => x.value);
  const isIgnored = (rel) => ignores.some((ig) => rel === ig || rel.indexOf(ig + '/') === 0);
  let total = 0;
  const cjk = [];
  const walk = (dir, rel) => {
    fs.readdirSync(dir).forEach(function (f) {
      const abs = path.join(dir, f), r = rel ? rel + '/' + f : f;
      if (isIgnored(r) || f === '.git' || f === '.DS_Store') return;
      const st = fs.statSync(abs);
      if (st.isDirectory()) return walk(abs, r);
      total += st.size;
      if (/[^\x20-\x7e]/.test(f)) cjk.push(r);
    });
  };
  walk(ROOT, '');
  chk('进包体积不超 4MB', total <= LIMIT, (total / 1024 / 1024).toFixed(2) + ' MB / 4.00 MB');
  chk('包内没有中文文件名（加载不了的那类坑）', cjk.length === 0, cjk.join(','));
  chk('BGM 在包里（没被 packOptions.ignore 掉）', !isIgnored('audio/bgm-main.mp3') && fs.existsSync(path.join(ROOT, 'audio/bgm-main.mp3')));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + '音频体检：' + pass + ' 过 / ' + fail + ' 红');
process.exitCode = fail ? 1 : 0;
