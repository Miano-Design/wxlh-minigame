/* 《残域》音频系统（BGM 无缝循环 ＋ WebAudio 现场合成打击音效）
   ==================================================================================
   派单（2026-09-27 · 父亲大人原话）：「拿这个作为游戏背景音乐，你控制一下音量的大小，
   确保无缝循环播放，然后在对应功能配点打击的音效啥的，把游戏的音效补充一下」。

   ── ① 无缝循环 ────────────────────────────────────────────────────────────────
   `wx.createWebAudioContext()` → `decodeAudioData` → `AudioBuffer` → `AudioBufferSourceNode.loop = true`。
   **不用 `innerAudioContext.loop`**：mp3 解码器带编码延迟，接缝处会"咔"一下。
   ⚠️ 但**只设 `loop = true` 还不够** —— 这条素材实测**首尾各有一段静音**
   （起声在 25.2ms、收声在离终点 12.7ms 处归零，合起来一个 ≈38ms 的坑），
   直接回环每 22.28 秒会掉进这个坑。所以起播前先做一次**等功率交叠**（`loopPrep()`，
   交叠 `LOOP_XFADE = 0.35s`）：新缓冲长度 = 原长 − 0.35s，头部 0.35s = 原头部（静音）×sin
   ＋ 原尾部×cos。于是回环点落在**原素材内部连续的一对样本**之间
   （末样本 = 原 m−1、首样本 = 原 m），幅度连续、无坑、无跳变 —— 这才是"真无缝"。

   ── ② 音量受控 ────────────────────────────────────────────────────────────────
   素材实测（`ffmpeg -af ebur128 / loudnorm`）：**积分响度 −15.6 LUFS · 真峰 −3.2 dBFS · LRA 5.2 LU**。
   手游 BGM 要"垫在下面"，取 **BGM_GAIN = 0.40**（≈ −8 dB → 有效 ≈ −23.6 LUFS，
   峰值 ≈ −11.2 dBFS）；音效另走一条 gain（**SFX_GAIN = 0.90**）—— 音效峰值比音乐高约 8~9 dB，
   打击听得出、音乐不抢戏。**两个数是唯一口径，改音量只改这两行。**

   ── ③ 打击音效全部现场合成（不找素材、不加音频文件）────────────────────────────
   一张参数表 `SFX`（一个音效 = 几层"声部"），PCM 在 JS 里算好**连包络一起烘进去**，
   再塞进 `AudioBuffer` 播放。
   **为什么不趁播放时用 AudioParam 包络**：微信官方 typings（minigame-api-typings 3.8.21）里
   `AudioParam` 只声明了 `value / defaultValue / minValue / maxValue`，**没有**
   `setValueAtTime / linearRampToValueAtTime`。把包络烘进 PCM 就绕开了这个不确定性 ——
   全程只用官方声明过的那几个接口：`createBuffer / copyToChannel / createBufferSource / createGain`。
   （BGM 起播的淡入仍 feature-detect：有 ramp 用 ramp，没有就直接赋值。）

   ── 不许自动播放（微信限制 · 派单硬要求）──────────────────────────────────────
   首帧**一个 source 都不许 `start()`**：`bgmStart()` 第一道闸就是 `if (!unlocked) return`，
   而 `unlocked` 只能由**玩家的第一次触摸**打开（`cv.js` 的 onTouchStart → `AUD.unlock()`）。
   `scripts/audio_audit.js` 的第 ④ 条盯的就是这条：冷启动跑完 `started === 0`，
   模拟一次触摸后 `started === 1`。

   ── 设置开关 ─────────────────────────────────────────────────────────────────
   `S.settings.bgm` / `S.settings.sfx`（默认都开；老档由 core.js 的
   `Object.assign(def.settings, S.settings || {})` 补默认值 —— 老玩家进游戏照样有声音）。
   关掉是**真停**：`apply()` 把 gain 立刻压到 0 并 `stop()` 掉 source，不是只置个标志位。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof globalThis !== 'undefined') ? globalThis : this;
  const WX = (typeof wx !== 'undefined') ? wx : null;

  /* ================= 唯一口径（改音量/换素材只改这里） ================= */
  /* ⚠️ 必须 ASCII 名（本项目栽过：中文名加载不了）；路径写法也必须**从工程根目录开始**——
     《小游戏 · 文件系统》指南原文：「代码包文件的访问方式是从项目根目录开始写文件路径，
     不支持相对路径的写法。如：`/a/b/c`、`a/b/c` 都是合法的，`./a/b/c`、`../a/b/c` 则不合法」。
     所以这里写 `audio/bgm-main.mp3`，**不许**写成 `./audio/…`。 */
  const BGM_SRC = 'audio/bgm-main.mp3';
  const BGM_GAIN = 0.40;                  // 素材 −15.6 LUFS → 约 −23.6 LUFS（垫在音效下面）
  const SFX_GAIN = 0.90;                  // 音效总增益（单独一条，与 BGM 分开调）
  const LOOP_XFADE = 0.35;                // 循环交叠长度（秒）—— 见文件头 ①
  const MAX_VOICES = 16;                  // 同时最多几个音效（连击多段不许被掐掉，只防叠成糊）
  /* 空间尾（总线级"简易混响"）：**微信没有 ConvolverNode**（官方 typings 里只有
     Analyser/Biquad/Delay/Gain/… 没有 Convolver），所以走父亲大人点的第二条路 ——
     **反馈延迟**：sfxGain → DelayNode →（低通）→ 反馈增益 → 回灌 Delay，另一路取湿声输出。
     所有音效共享同一间"屋子"＝同一套空间语言；尾音被低通压暗（不产生"金属尖"）。 */
  const SPACE = { delay: 0.13, fb: 0.45, damp: 900, wet: 0.35 };
  /* 总线压限（DynamicsCompressorNode，官方 typings 里有）：
     ⚠️ **多目标/多段同帧齐响时会叠加** —— 6 个敌人各 0.98 的峰值同拍相加，不压限就是硬削波
     （听感是"啪"的数码爆音，比没声音更糟）。压限把峰值收在阈值附近，顺带把多个音效"粘"成一击。 */
  const COMP = { threshold: -10, knee: 4, ratio: 8, attack: 0.002, release: 0.15 };
  const SR_FALLBACK = 44100;

  /* ================= 一、音效参数表 =================
     声部字段：kind＝波形（sine / tri / saw / noise）· f0→f1＝扫频（Hz）· dur＝时长（秒）
               at＝起点（秒）· gain＝这一层增益 · a＝起音（秒）· k＝衰减指数（越大越快）
               lp / hp＝一阶低通 / 高通截止（Hz，可选）
     每个音效一份参数（一张表统一定义），不散着写振荡器代码。

     ★ 2026-09-27 续单（父亲大人真机听完）：**整套推翻重做**。
     原话：「音效太卡通，跟游戏不搭 …… 我们这个游戏是暗黑修仙 / 残域，要的是
     **低频为主、带空间感的尾音、少亮高频**」——
        · 打击 ＝ 远处闷鼓 / 石块崩裂（60~120Hz thump ＋ 短噪声 ＋ 一点尾音），不要"啪/叮"那种脆响；
        · 暴击 ＝ 更闷更重 ＋ 一层**低频轰鸣**；
        · 技能 / 大绝 ＝ **低频下坠** ＋ 空间尾；
        · 抽卡出货 ＝ **低音钟 / 钹**，不是卡通铃；
        · 全局点击 ＝ 更轻更暗。
     落地口径（三条，都可量）：
       ① **基频全部压在 500Hz 以下**（除少量做"金属/钟"质感的非谐波分音），
          噪声一律过一阶低通（1500~3200Hz），**没有一个 4kHz 以上的亮尖**；
       ② **下坠优先**：技能 / 大绝 / 失败 / 升级一律 f0→f1 向下扫（上行只留"上升感"很弱的一点点）；
       ③ **空间尾走总线**（`buildSpace()`：DelayNode ＋ 低通 ＋ 反馈 ＝ 简易混响，
          微信没有 ConvolverNode，父亲大人也点了"或反馈延迟"这条路）—— 所有音效共享同一间"屋子"，
          这就是"同一套空间语言"，而不是每个音效各加一条尾巴。
     量的判据写在尺子里（`scripts/audio_audit.js` ⑨：**频谱重心**，用一阶差分能量比估算）：
     全套 ≤1100Hz，打击类 ≤700Hz（旧版那套是 1.6k~2.6k 的"叮"，重心 2k 上下）。 */
  const SFX = {
    /* ================= 铁律（K2 续单 · 父亲大人点死的那条）=================
       **悦耳区（约 800Hz 以上）的干净短正弦/方波 ＝ 电子提示音"嘟"** —— 一律禁止。
       "敲击感"的骨头是 **60~300Hz 的闷响 ＋ 宽带噪声的糙**。
       所以下表里：① 没有任何 f0 > 800Hz 的正弦/方波声部（最高的一个是 `recruitRare`
       的非谐泛音 551Hz，仍是低频钟的一部分）；② **噪声声部一律走带通（300~800Hz）**，
       不再有 1k 以上的低通噪声；③ 打击类＝"低频 thump ＋ 带通噪声 ＋ 空腔尾"三层。
       量的判据在尺子里（FFT：点击/打击类**重心 <300Hz**、全部音效**主频 <800Hz**、
       打击类必须同时有低频与噪声成分）。 */

    /* ⚠️ **噪声层的 gain 不是同一量纲，别拿数字大小判断谁更响**：
       带通（Q≈0.8）之后的噪声，**峰值只有同增益正弦的 ~4%**（窄带 ⇒ 能量本来就少，实测），
       所以表里噪声层写成几十，听感和正弦层的 1~3 是一档。
       真正的判据不在这张表里，在尺子上：`audio_audit` ⑦ 的"中带(300-800)占总能量"
       与"外放可听带峰值"（都按 FFT / 滤波实测），改任何一个 gain 之后跑一遍就知道偏没偏。 */

    /* 全局点击（**B1 原文照做**）：白噪声 → BiquadFilter 带通 180~500Hz → 30~50ms 极快衰减
       ＋ 极轻的 80Hz thump ⇒ 听感＝"敲了一下石台/木面"，不是"嘟"。
       （`bp:[中心Hz, Q]`＝RBJ 带通；中心 300Hz、Q0.9 的带约 133~466Hz，落在 180~500 里。） */
    click: { peak: 0.22, gap: 25, layers: [
      { kind: 'noise', dur: 0.045, bp: [260, 1.0], gain: 1.2, a: 0.0008, k: 3.6 },
      { kind: 'noise', dur: 0.038, bp: [270, 1.8], gain: 0.9, a: 0.0008, k: 5.0 },
      { kind: 'sine', f0: 80, dur: 0.040, gain: 0.26, a: 0.001, k: 3.4 }] },

    /* 战斗命中（**B2 三层叠**）：60~120Hz thump（骨头）＋ 300~800Hz 噪声 burst（糙／崩裂）
       ＋ 60~100ms 空腔尾（残域的空腔感）。中频"咬合"那一层留在 150~250Hz，
       是给手机外放的（小喇叭 300Hz 以下推不出来，没有它真机上会"有数据没耳朵"）。 */
    hit: { peak: 0.74, gap: 0, combat: true, layers: [
      { kind: 'sine', f0: 96, f1: 58, dur: 0.22, gain: 1.0, a: 0.002, k: 1.9 },
      { kind: 'noise', dur: 0.09, bp: [480, 0.8], grains: [7, 3], gain: 23, a: 0.001, k: 3.0 },
      { kind: 'noise', dur: 0.10, bp: [260, 0.7], gain: 11, a: 0.004, k: 2.2 },
      { kind: 'tri', f0: 200, f1: 140, dur: 0.10, gain: 0.27, a: 0.002, k: 3.2 }] },

    /* 暴击（**B3**）：低频再下潜（66→35Hz）＋ 尾更长更重（1.4s 双低音轰鸣 ＋ 550ms 空腔尾），
       咬合层比命中更重（外放上"暴击必须压过命中"，这条尺子钉住）。 */
    crit: { peak: 1.00, gap: 0, combat: true, layers: [
      { kind: 'sine', f0: 66, f1: 35, dur: 0.45, gain: 1.0, a: 0.002, k: 1.7 },
      { kind: 'noise', dur: 0.14, bp: [460, 0.8], grains: [10, 3], gain: 72, a: 0.001, k: 2.6 },
      { kind: 'tri', f0: 240, f1: 150, dur: 0.26, gain: 2.9, a: 0.002, k: 2.6 },
      { kind: 'sine', f0: 44, dur: 1.40, gain: 0.42, a: 0.030, k: 1.4 },
      { kind: 'sine', f0: 47, dur: 1.40, gain: 0.32, a: 0.030, k: 1.4 },
      { kind: 'noise', dur: 0.55, bp: [240, 0.6], gain: 12, a: 0.020, k: 1.5 }] },

    /* 技能释放（**B4**）：低频**下坠**（420→92Hz）＋ 长空间尾，**没有亮的上扬扫频** */
    skill: { peak: 0.62, gap: 60, combat: true, layers: [
      { kind: 'sine', f0: 420, f1: 92, dur: 0.70, gain: 0.85, a: 0.025, k: 1.5 },
      { kind: 'tri', f0: 520, f1: 140, dur: 0.60, lp: 900, gain: 0.22, a: 0.030, k: 1.8 },
      { kind: 'noise', dur: 0.85, bp: [300, 0.6], gain: 0.26, a: 0.060, k: 1.5 },
      { kind: 'sine', f0: 58, dur: 1.10, gain: 0.35, a: 0.040, k: 1.7 }] },

    /* 大绝：更长的下坠（260→40Hz）＋ 双低音轰鸣 ＋ 更长的空腔尾 */
    ult: { peak: 0.98, gap: 80, combat: true, layers: [
      { kind: 'sine', f0: 260, f1: 40, dur: 1.10, gain: 1.0, a: 0.020, k: 1.4 },
      { kind: 'sine', f0: 50, dur: 1.80, gain: 0.65, a: 0.050, k: 1.3 },
      { kind: 'sine', f0: 54, dur: 1.80, gain: 0.50, a: 0.050, k: 1.3 },
      { kind: 'noise', dur: 0.90, bp: [280, 0.6], gain: 9, a: 0.010, k: 1.6 },
      { kind: 'tri', f0: 420, f1: 110, dur: 0.80, lp: 800, gain: 0.55, a: 0.030, k: 1.6 }] },

    /* 胜利结算：两声低音钟（G2 → D3，非谐泛音 2.4:1）＋ 底音（**没有** C6-G6 那种脆响） */
    win: { peak: 0.62, gap: 300, combat: true, layers: [
      { kind: 'sine', f0: 98, dur: 1.40, gain: 0.70, a: 0.004, k: 2.4 },
      { kind: 'sine', f0: 236, dur: 1.05, gain: 0.26, a: 0.004, k: 3.0 },
      { kind: 'sine', f0: 147, dur: 1.40, at: 0.18, gain: 0.55, a: 0.005, k: 2.4 },
      { kind: 'sine', f0: 49, dur: 1.90, gain: 0.40, a: 0.010, k: 2.2 }] },

    /* 失败结算：下坠 ＋ 沉底（110→52Hz ＋ 55Hz 长音 ＋ 一点空腔气） */
    lose: { peak: 0.55, gap: 300, combat: true, layers: [
      { kind: 'sine', f0: 110, f1: 52, dur: 1.30, gain: 0.75, a: 0.020, k: 1.5 },
      { kind: 'sine', f0: 55, dur: 1.50, gain: 0.50, a: 0.050, k: 1.5 },
      { kind: 'noise', dur: 0.40, bp: [280, 0.6], gain: 2.1, a: 0.030, k: 1.8 }] },

    /* 强化成功：一声闷的低音钟（D3 ＋ 2.4:1 非谐泛音）—— 不是"叮" */
    enhanceOk: { peak: 0.62, gap: 60, layers: [
      { kind: 'sine', f0: 147, dur: 1.00, gain: 0.70, a: 0.004, k: 2.5 },
      { kind: 'sine', f0: 352, dur: 0.70, gain: 0.20, a: 0.004, k: 3.2 },
      { kind: 'sine', f0: 73, dur: 1.10, gain: 0.35, a: 0.010, k: 2.4 }] },

    /* 强化失败：闷响 ＋ 下坠（锯齿过 420Hz 低通 ＋ 空腔噪声，音色是"锈住"） */
    enhanceFail: { peak: 0.55, gap: 60, layers: [
      { kind: 'saw', f0: 176, f1: 88, dur: 0.55, lp: 420, gain: 0.60, a: 0.004, k: 2.0 },
      { kind: 'sine', f0: 88, f1: 62, dur: 0.60, gain: 0.50, a: 0.006, k: 2.2 },
      { kind: 'noise', dur: 0.18, bp: [320, 0.8], gain: 0.26, a: 0.002, k: 3 }] },

    /* 重铸：石锤砸砧（110→62Hz 闷锤 ＋ 520Hz 带通颗粒崩裂 ＋ 空腔余韵 ＋ 闷尾）
       ——旧版那条 902Hz 的"叮"（>800 悦耳区）已删 */
    reforge: { peak: 0.82, gap: 70, layers: [
      { kind: 'sine', f0: 110, f1: 62, dur: 0.26, gain: 1.0, a: 0.002, k: 1.9 },
      { kind: 'noise', dur: 0.11, bp: [520, 0.75], grains: [8, 3], gain: 11, a: 0.001, k: 2.8 },
      { kind: 'noise', dur: 0.30, bp: [300, 0.6], gain: 4.5, a: 0.006, k: 1.8 },
      { kind: 'sine', f0: 300, dur: 0.50, gain: 0.26, a: 0.002, k: 4.0 },
      { kind: 'sine', f0: 62, dur: 0.70, gain: 0.34, a: 0.008, k: 2.5 }] },

    /* 抽卡（普通出货）：一声低音（F3 ＋ 底八度），像石壁回了一下 */
    recruit: { peak: 0.50, gap: 120, layers: [
      { kind: 'sine', f0: 174.61, dur: 0.60, gain: 0.55, a: 0.006, k: 2.8 },
      { kind: 'sine', f0: 87.31, dur: 0.70, gain: 0.35, a: 0.010, k: 2.6 }] },

    /* 抽卡（SSR/UR 出货 · **B5**）：**低音钟 / 钹** —— 低频基音（G2）＋ 非谐泛音（2.4:1 / 5.6:1）
       ＋ 49Hz 底音 ＋ 长衰减（2.6s）＋ 一点暗"钹气"（420Hz 带通噪声）。
       **没有清亮的铃铛高音**：最高的一个分音 551Hz 仍在 800Hz 以下。 */
    recruitRare: { peak: 0.90, gap: 200, layers: [
      { kind: 'sine', f0: 98, dur: 2.60, gain: 0.75, a: 0.004, k: 2.1 },
      { kind: 'sine', f0: 236, dur: 1.80, gain: 0.30, a: 0.004, k: 2.8 },
      { kind: 'sine', f0: 551, dur: 1.00, gain: 0.12, a: 0.004, k: 3.6 },
      { kind: 'sine', f0: 49, dur: 2.80, gain: 0.45, a: 0.020, k: 1.9 },
      { kind: 'noise', dur: 0.60, bp: [420, 0.6], gain: 0.12, a: 0.005, k: 2.6 }] },

    /* 开箱：闷"咔"（带通颗粒＝木/石盖）+ 低音取物（130→80Hz）—— 不用亮的上扬 */
    open: { peak: 0.76, gap: 80, layers: [
      { kind: 'noise', dur: 0.08, bp: [420, 0.9], grains: [6, 3], gain: 45, a: 0.001, k: 2.8 },
      { kind: 'sine', f0: 130, f1: 80, dur: 0.30, gain: 0.70, a: 0.002, k: 2.2 },
      { kind: 'sine', f0: 260, f1: 150, dur: 0.40, at: 0.05, gain: 0.32, a: 0.020, k: 2.6 },
      { kind: 'sine', f0: 78, dur: 0.60, at: 0.05, gain: 0.30, a: 0.020, k: 2.4 }] },

    /* 升级 / 解锁：低音上行两音（D3 → A3）＋ 底八度 ＋ 一点空腔（旧版那条 440Hz 三角已收小） */
    levelup: { peak: 0.66, gap: 120, layers: [
      { kind: 'sine', f0: 146.83, dur: 0.55, at: 0.00, gain: 0.60, a: 0.006, k: 2.6 },
      { kind: 'sine', f0: 220, dur: 0.80, at: 0.14, gain: 0.60, a: 0.006, k: 2.4 },
      { kind: 'sine', f0: 73.42, dur: 1.00, at: 0.14, gain: 0.35, a: 0.010, k: 2.4 },
      { kind: 'noise', dur: 0.30, bp: [300, 0.6], gain: 0.12, a: 0.020, k: 2.2 }] },

    /* 领取奖励：一声轻的低音（B♭3 ＋ 底八度），像放下东西 */
    claim: { peak: 0.50, gap: 120, layers: [
      { kind: 'sine', f0: 233.08, dur: 0.40, gain: 0.55, a: 0.004, k: 3.0 },
      { kind: 'sine', f0: 116.54, dur: 0.50, gain: 0.30, a: 0.006, k: 2.8 }] },

    /* 报错 / 被拒：两记更低伏的短音（重锯齿过 380Hz 低通 ＋ 82Hz 底音；不是"嘟"） */
    error: { peak: 0.48, gap: 140, layers: [
      { kind: 'saw', f0: 220, f1: 170, dur: 0.10, lp: 380, gain: 0.55, a: 0.002, k: 3 },
      { kind: 'saw', f0: 165, f1: 130, dur: 0.14, at: 0.12, lp: 340, gain: 0.55, a: 0.002, k: 3 },
      { kind: 'sine', f0: 82, dur: 0.20, gain: 0.35, a: 0.004, k: 2.6 }] },

    /* —— 战斗里的"特殊事件" ——
       `dodge`＝**空**：带通噪声（520Hz）扫过去、没有低频实心，"打了但没打中"的听感 */
    dodge: { peak: 0.34, gap: 0, combat: true, layers: [
      { kind: 'noise', dur: 0.24, bp: [420, 0.8], gain: 1.6, a: 0.030, k: 2.4 },
      { kind: 'tri', f0: 240, f1: 150, dur: 0.20, gain: 0.16, a: 0.010, k: 2.8 }] },

    /* `shield`＝闷的金属罩（110Hz 罩体 ＋ 带通噪声罩壁 ＋ 230Hz 罩底，圆钝不脆） */
    shield: { peak: 0.52, gap: 0, combat: true, layers: [
      { kind: 'sine', f0: 110, dur: 0.50, gain: 0.65, a: 0.008, k: 2.2 },
      { kind: 'noise', dur: 0.22, bp: [400, 0.7], gain: 1.6, a: 0.010, k: 2.2 },
      { kind: 'tri', f0: 230, dur: 0.30, gain: 0.18, a: 0.012, k: 3.0 }] },

    /* `revive`＝低频涌起（52→96Hz 慢慢起 ＋ 一层空腔气 ＋ 104Hz 承接） */
    revive: { peak: 0.72, gap: 0, combat: true, layers: [
      { kind: 'sine', f0: 52, f1: 96, dur: 1.00, gain: 0.70, a: 0.140, k: 1.7 },
      { kind: 'noise', dur: 0.80, bp: [380, 0.6], gain: 4.8, a: 0.220, k: 2.2 },
      { kind: 'sine', f0: 104, dur: 1.30, at: 0.22, gain: 0.50, a: 0.020, k: 2.1 }] },

    /* `dot`＝持续伤害的小闷扣（92→66Hz ＋ 400Hz 带通颗粒 ＋ 190→130Hz 咬合，比 hit 轻） */
    dot: { peak: 0.48, gap: 0, combat: true, layers: [
      { kind: 'sine', f0: 92, f1: 66, dur: 0.12, gain: 0.85, a: 0.002, k: 2.6 },
      { kind: 'noise', dur: 0.06, bp: [400, 0.9], grains: [4, 2.5], gain: 50, a: 0.001, k: 3.2 },
      { kind: 'tri', f0: 190, f1: 130, dur: 0.08, gain: 0.30, a: 0.002, k: 3.4 }] },
  };
  const SFX_NAMES = Object.keys(SFX);

  /* ================= 二、合成（纯函数：进参数出 PCM，不碰 ctx） ================= */
  /* 包络：起音线性升 → 指数衰减到 0（percussive 的统一口径） */
  function envAt(t, lay) {
    const a = lay.a || 0.002;
    if (t < a) return t / a;
    const u = (t - a) / Math.max(1e-4, lay.dur - a);
    return Math.pow(Math.max(0, 1 - u), lay.k || 2);
  }
  /* ================= RBJ 双二阶带通（B1 指定的"BiquadFilter 带通"）=================
     父亲大人 2026-09-27 第二次真机反馈把链路点死了：
     **白噪声 → BiquadFilter（带通 180~500Hz）→ 30~50ms 极快衰减**。
     微信的 `createBiquadFilter()` 得在**播放时**接节点、而它的 `frequency` 是 AudioParam
     （微信 typings 里 AudioParam 只有 `value`，没有 ramp/自动化），包络做不干净；
     所以这里把**同一条链路在离线 PCM 上实现**：同一套 RBJ 系数、同一段白噪声、包络精确到样本。
     产出与"节点图"等价，但**每次结果完全一致、可离线量（尺子能算 FFT）**，也不依赖平台差异。
     `bp: [f0Hz, Q]` —— Q 越小带越宽（Q=0.9 @300Hz ≈ 带 133~466Hz）。 */
  function biquadBP(f0, q, sr) {
    const w0 = 2 * Math.PI * f0 / sr;
    const alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
    const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
    const b0 = alpha / a0, b1 = 0, b2 = -alpha / a0;
    const na1 = a1 / a0, na2 = a2 / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return {
      step: function (x) {
        const y = b0 * x + b1 * x1 + b2 * x2 - na1 * y1 - na2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
      },
    };
  }
  /* 把若干"声部"混成一条 PCM（Float32Array） */
  function renderLayers(layers, sr) {
    let total = 0;
    layers.forEach(function (l) { total = Math.max(total, (l.at || 0) + l.dur); });
    const n = Math.max(1, Math.round(total * sr));
    const out = new Float32Array(n);
    layers.forEach(function (l, li) {
      const start = Math.round((l.at || 0) * sr);
      const len = Math.max(1, Math.round(l.dur * sr));
      /* 铁律：带通之后**一律再压一道 700Hz 低通**（该层自己写了 `lp` 就按它写的那条）。
         为什么必须有这一道：RBJ 带通只有 **6dB/oct 的裙边**，而白噪声在高频的能量极大 ——
         实测只做 520Hz 带通时，**47% 的能量仍在 800Hz 以上**（听感就是"嘶"，不是"闷"）。
         带通定形状、低通封顶，两道一起才有"敲石头"的听感，也才守得住 C2 那条口径。 */
      const lpCut = l.lp || (l.bp ? 700 : 0);
      const cLp = lpCut ? 1 - Math.exp(-2 * Math.PI * lpCut / sr) : 0;
      const cHp = l.hp ? 1 - Math.exp(-2 * Math.PI * l.hp / sr) : 0;
      const bq = l.bp ? biquadBP(l.bp[0], l.bp[1] || 1, sr) : null;
      /* **颗粒门**（`grains: [个数, 每颗毫秒]`）：把一整块噪声切成"一阵碎石"。
         真实的崩裂是颗粒状的 —— 一整块噪声听着是"嘶"，一阵颗粒才是"碎"。
         颗粒起点用固定种子撒（同一份参数 ⇒ 同一段噪声，尺子可复现）。 */
      let grainGate = null;
      if (l.grains) {
        const cnt = Math.max(1, l.grains[0] | 0);
        const glen = Math.max(1, Math.round((l.grains[1] || 3) * sr / 1000));
        const span = Math.max(1, len - glen);
        grainGate = new Uint8Array(len);
        let rg = (0x51ed270b + li * 104729) >>> 0;
        for (let k = 0; k < cnt; k++) {
          rg = (rg * 1103515245 + 12345) & 0x7fffffff;
          const at = Math.floor((rg / 0x7fffffff) * span);
          for (let j = 0; j < glen && at + j < len; j++) grainGate[at + j] = 1;
        }
      }
      /* 固定种子：同一份参数 => 同一段噪声（尺子可复现，不是每次听都不一样） */
      let rnd = (0x2f6e2b1 + li * 7919) >>> 0;
      let ph = 0, lpY = 0, hpY = 0, hpX = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const u = len > 1 ? i / (len - 1) : 0;
        const f = (l.f1 && l.f0) ? l.f0 * Math.pow(l.f1 / l.f0, u) : (l.f0 || 440);
        ph += 2 * Math.PI * f / sr;
        let s;
        if (l.kind === 'noise') { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; s = rnd / 0x3fffffff - 1; }
        else if (l.kind === 'saw') { const q = ph / (2 * Math.PI); s = 2 * (q - Math.floor(q + 0.5)); }
        else if (l.kind === 'tri') { const q = ph / (2 * Math.PI); s = 2 * Math.abs(2 * (q - Math.floor(q + 0.5))) - 1; }
        else s = Math.sin(ph);
        if (bq) s = bq.step(s);
        if (cLp) { lpY += (s - lpY) * cLp; s = lpY; }
        if (cHp) { hpY = cHp * (hpY + s - hpX); hpX = s; s = hpY; }
        if (grainGate) s *= grainGate[i];
        out[start + i > n - 1 ? n - 1 : start + i] += s * envAt(t, l) * (l.gain == null ? 1 : l.gain);
      }
    });
    return out;
  }
  /* 归一到设计峰值（不做压限：包络已经烘好，线性归一最可预测） */
  function normalize(pcm, peak) {
    let mx = 0;
    for (let i = 0; i < pcm.length; i++) { const v = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (v > mx) mx = v; }
    if (mx > 0) { const g = peak / mx; for (let i = 0; i < pcm.length; i++) pcm[i] *= g; }
    return pcm;
  }
  function synthOf(name, sr) {
    const spec = SFX[name];
    if (!spec) return null;
    return normalize(renderLayers(spec.layers, sr || SR_FALLBACK), spec.peak);
  }

  /* ================= 三、运行时（ctx / 两个 gain / BGM / 音效池） ================= */
  let ctx = null, bgmGain = null, sfxGain = null;
  let spDelay = null, spFb = null, spWet = null, spDry = null, spDamp = null, spComp = null, spaceFailed = '';
  let loopBuf = null, bgmSrc = null;
  let unlocked = false, started = 0;
  /* 正在响的声部（**按时间剪枝**，不靠 `onended`）。`combat` 的那一类**永不被上限掐**：
     父亲大人续单钉死"多段攻击每段一声（连击几段就响几下）" ——
     上限只该管"UI 音效被连点刷屏"，绝不能把战斗反馈吃掉。 */
  const live = [];
  /* `bgmDead` ＝"这个包里的 BGM 读不到 / 解不开"，**确凿失败、不再重试**（防每次触摸都重读一遍 mp3）；
     `bgmTries` 只给"解码卡死超时"那种不确定的情况限个次数。 */
  let bgmLoading = false, bgmFailed = '', failed = '', bgmDead = false, bgmTries = 0;
  const bufCache = {};
  const lastAt = {};
  const plays = {};

  function settings() {
    const S = G.Core && G.Core.S;
    return (S && S.settings) || {};
  }
  /* V1.0.4 · T（父亲大人 09-27 第 14 条 · 省电模式）：开了省电就**停 BGM**，
     音效一路照旧（他说"打击感不能丢"）。口径只写在**这一处** ——
     `bgmStart()`（起播）、`apply()`（翻开关那一刻收口）、`onInterruptEnd()`（被打断后恢复）
     三处都读它，于是"省电时不许自己响起来"和"翻开关真的 stop"自动一致，不会两处打架。 */
  function bgmOn() { const st = settings(); return st.bgm !== false && st.savePower !== true; }
  function sfxOn() { return settings().sfx !== false; }
  function sr() { return (ctx && ctx.sampleRate) || SR_FALLBACK; }

  /* 建上下文与两条 gain。**不启播任何东西** —— 启播只走 unlock()。 */
  function init() {
    if (ctx) return true;
    if (!WX || !WX.createWebAudioContext) { failed = 'no_web_audio'; return false; }
    try { ctx = WX.createWebAudioContext(); } catch (e) { ctx = null; failed = 'ctx:' + e; return false; }
    if (!ctx || !ctx.destination) { ctx = null; failed = 'no_destination'; return false; }
    try {
      bgmGain = ctx.createGain(); bgmGain.gain.value = 0; bgmGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn() ? SFX_GAIN : 0;
      buildSpace();                  // 音效总线 → 干声 ＋ 空间尾（两条都挂在 sfxGain 之后，静音一起静）
    } catch (e) { ctx = null; bgmGain = null; sfxGain = null; failed = 'gain:' + e; return false; }
    loadBgm();                       // 异步解码（解码 ≠ 播放，首帧仍然一点声音都没有）
    return true;
  }

  /* 总线级的空间尾：干声直通，湿声走"延迟 ＋ 低通 ＋ 反馈"。
     ⚠️ 建不出来（老基础库 / 平台差异）**不许把音频整条拖垮** —— 退回纯干声，
     并把原因记进 `spaceFailed`（`diag()` 里能看见）。 */
  function buildSpace() {
    /* 先过压限（建不出来就直连，绝不让音频整条哑掉） */
    try {
      spComp = ctx.createDynamicsCompressor();
      spComp.threshold.value = COMP.threshold;
      spComp.knee.value = COMP.knee;
      spComp.ratio.value = COMP.ratio;
      spComp.attack.value = COMP.attack;
      spComp.release.value = COMP.release;
      sfxGain.connect(spComp);
    } catch (ec) { spComp = null; }
    const out = spComp || sfxGain;
    spDry = ctx.createGain(); spDry.gain.value = 1;
    out.connect(spDry); spDry.connect(ctx.destination);
    try {
      spDelay = ctx.createDelay(1.0);
      spDelay.delayTime.value = SPACE.delay;
      spWet = ctx.createGain(); spWet.gain.value = SPACE.wet;
      out.connect(spDelay);
      spDelay.connect(spWet); spWet.connect(ctx.destination);
      /* 反馈环：delay → 低通 → 增益 → 回 delay（低通让每一圈更暗 ⇒ 自然的"远处衰减"） */
      try {
        spDamp = ctx.createBiquadFilter();
        spDamp.type = 'lowpass';
        spDamp.frequency.value = SPACE.damp;
      } catch (e2) { spDamp = null; }
      spFb = ctx.createGain(); spFb.gain.value = SPACE.fb;
      if (spDamp) { spDelay.connect(spDamp); spDamp.connect(spFb); } else { spDelay.connect(spFb); }
      spFb.connect(spDelay);
    } catch (e) { spaceFailed = 'space:' + e; spDelay = null; spFb = null; spWet = null; }
  }

  /* 读包内 mp3（ASCII 相对路径）→ decodeAudioData → 循环交叠 */
  function loadBgm() {
    if (bgmLoading || loopBuf || !ctx || bgmDead) return;
    bgmTries++;
    bgmLoading = true;
    let ab = null;
    try {
      const fs2 = WX.getFileSystemManager && WX.getFileSystemManager();
      if (fs2 && fs2.readFileSync) ab = fs2.readFileSync(BGM_SRC);
    } catch (e) { bgmFailed = 'read:' + e; }
    if (!ab || typeof ab.byteLength !== 'number') {
      bgmFailed = bgmFailed || 'read:not-arraybuffer';
      bgmLoading = false;
      bgmDead = true;                        // 文件读不到＝确凿失败：不再每次触摸重读一遍
      if (G.console && console.warn) console.warn('[AUD] BGM 读不到：' + BGM_SRC + ' → ' + bgmFailed);
      return;
    }
    let done = false;
    const ok = function (b) {
      if (done) return; done = true; bgmLoading = false;
      if (!b) { bgmFailed = 'decode:empty'; bgmDead = true; return; }
      try { loopBuf = loopPrep(b); } catch (e) { loopBuf = b; }
      if (unlocked) bgmStart();
    };
    const bad = function (e) {
      if (done) return; done = true; bgmLoading = false;
      bgmFailed = 'decode:' + e; bgmDead = true;   // 解不开＝确凿失败，不再重试
      if (G.console && console.warn) console.warn('[AUD] BGM 解码失败：' + e);
    };
    try {
      const r = ctx.decodeAudioData(ab, ok, bad);
      if (r && typeof r.then === 'function') r.then(ok, bad);      // 两种签名都认（Promise / 回调）
    } catch (e) { bad(e); }
    /* ================= F6 #10（抢修单 0928）· `decodeAudioData` 卡死兜底 =================
       老实现里有"既不回调、也不返回 Promise"的那一档（或 Promise 永远 pending）：
       那样 `done` 永远是 false、`bgmLoading` 一直是 true ⇒ 这一局**全程没 BGM**，
       而且因为 `loadBgm` 第一道闸就是 `bgmLoading`，**之后再也不会有第二次机会**：
       玩家点多少次屏幕都不会重试，只有一条 warn 留在日志里。
       现在给一次"超时未就绪就放开重试"的路：8 秒还没结果就把闸放掉（`bgmFailed` 写明原因），
       下一次 `unlock/apply` 会重新读 + 重解。真解出来的那一次照旧能起播（`ok` 里 `done` 会拦住重复）。 */
    try {
      setTimeout(function () {
        if (done) return;
        bgmLoading = false;                    // 放开闸：下一次 unlock/apply 可以重试
        if (!bgmFailed) bgmFailed = 'decode:timeout';
        if (bgmTries >= 3) bgmDead = true;     // 只给几次机会，别在后台无限重解
        if (G.console && console.warn) console.warn('[AUD] BGM 解码超时未回（8s）→ 放开重试');
      }, 8000);
    } catch (e5) {}
  }

  /* 等功率交叠：把首尾那段静音"填平"，回环点落在原素材内部连续的一对样本之间。
     结果长度 = 原长 − X；out[i] = in[i]（i ≥ X）；out[i] = in[i]·sin + in[m+i]·cos（i < X）。
     => 末样本 out[m−1] = in[m−1]、首样本 out[0] = in[m] —— 天然相接。 */
  function loopPrep(buf) {
    if (!buf || !ctx || !buf.getChannelData) return buf;
    const ch = buf.numberOfChannels || 1;
    const n = buf.length || 0;
    const x = Math.min(Math.floor(LOOP_XFADE * (buf.sampleRate || sr())), Math.floor(n / 4));
    if (!x || n - x < 1) return buf;
    const m = n - x;
    let out;
    try { out = ctx.createBuffer(ch, m, buf.sampleRate || sr()); } catch (e) { return buf; }
    for (let c = 0; c < ch; c++) {
      let srcData, dst;
      try { srcData = buf.getChannelData(c); dst = out.getChannelData(c); } catch (e) { return buf; }
      for (let i = 0; i < m; i++) dst[i] = srcData[i];
      for (let i = 0; i < x; i++) {
        const u = i / x;
        dst[i] = srcData[i] * Math.sin(u * Math.PI / 2) + srcData[m + i] * Math.cos(u * Math.PI / 2);
      }
    }
    return out;
  }

  /* 淡入：有 AudioParam 自动化就用它，没有就退化成一次直接赋值 */
  function fadeIn(node, to, sec) {
    if (!node) return;
    const p = node.gain;
    try {
      p.value = 0;
      if (p.cancelScheduledValues) p.cancelScheduledValues(0);
      if (p.setValueAtTime && p.linearRampToValueAtTime) {
        p.setValueAtTime(0, 0);
        p.linearRampToValueAtTime(to, sec);
        return;
      }
    } catch (e) {}
    try { p.value = to; } catch (e2) {}
  }

  /* ⚠️ 启播的唯一入口 —— 第一道闸就是 `unlocked`（首帧绝不可能出声） */
  function bgmStart() {
    if (!unlocked || !ctx || !bgmOn()) return false;
    /* ================= F6 #8（抢修单 0928）· BGM"非空但已死"的重建口子 =================
       原来只要 `bgmSrc` 非空，这里就永远拒绝新建；而没有任何监听、也没有看门狗：
       平台悄悄停了那个 source、或 ctx 变成 `closed`，音乐就**一直静音** ——
       `apply()` 与每次触摸的 `unlock()` 都救不回来，只能重启小游戏。
       现在两条判别：
         · `onended`（下面 start 之后挂）＝最精确的"这个源死了"（loop 源正常永不 ended）；
         · `ctx.state === 'closed'` ＝上下文没了，源也出不了声。
       ⚠️ **故意不用"state 不是 running 就重建"**：onHide 走的是 `suspend()`（state='suspended'），
          回前台 `resume()` 是异步的 —— 那一刻 state 往往还是 suspended，
          按那条口径会把还在放（只是被挂起）的源当死源重建，**每次切回前台音乐都从头开始**
          （还多一次 fade-in 的短静音）。专业判断：挂起中的源是活的，别动它。 */
    if (bgmSrc) {
      if (ctx.state !== 'closed') return false;      // 正在放 / 正被挂起：源还有效，一个字节不动
      bgmStop();                                    // ctx 已关闭：收干净，下面重建
    }
    /* 缓冲还没解出来（含解码卡死后超时放闸那一条路）：借这一次机会重试读 + 重解
       （`bgmDead`＝文件读不到/解不开，确凿失败，别每次触摸都重读一遍 mp3）。 */
    if (!loopBuf) { if (!bgmDead) loadBgm(); return false; }
    try {
      const s = ctx.createBufferSource();
      s.buffer = loopBuf;
      s.loop = true;                       // ← 无缝循环靠这一行（不是 innerAudioContext.loop）
      s.connect(bgmGain);
      s.start();
      /* F6 #8：loop 源正常永远不 ended —— 真收到它就是"平台把这个源停了"，
         清掉闸，下一次 bgmStart 才会重建（而不是永远静音）。 */
      try { s.onended = function () { if (bgmSrc === s) bgmSrc = null; }; } catch (e0) {}
      bgmSrc = s; started++;
      fadeIn(bgmGain, BGM_GAIN, 0.35);
      return true;
    } catch (e) { failed = 'bgm_start:' + e; bgmSrc = null; return false; }
  }
  /* 真停：先把 gain 压到 0 再 stop（同一拍生效，不留尾巴也不"咔"） */
  function bgmStop() {
    if (!bgmSrc) return;
    try { bgmGain.gain.value = 0; } catch (e) {}
    try { bgmSrc.stop(); } catch (e2) {}
    try { if (bgmSrc.disconnect) bgmSrc.disconnect(); } catch (e3) {}
    bgmSrc = null;
  }

  /* 玩家第一次触摸：resume + 启播（**只发生一次**，不会每次点击都重启） */
  function unlock() {
    /* V1.0.4 · T（父亲大人 09-27 第 1 条）：**屏幕变暗的恢复挂在这扇门上**。
       `js/cv.js` 的 onDown 每次触摸（PC 鼠标那一路也复用 onDown）都会调本函数 ——
       只加这一行就覆盖了"任何触摸 → 立刻恢复玩家自己的亮度"，不必再注册第二个 `wx.onTouchStart`
       （那会与既有假环境尺子打架：它们给 onTouchStart 只留一个槽）。
       放在 `init()` 之前：没有 WebAudio 的环境也要照常恢复亮度；CAP 不在时什么也不做。 */
    try { if (G.CAP && G.CAP.brightPing) G.CAP.brightPing(); } catch (e0) {}
    if (!init()) return false;
    if (!unlocked) {
      unlocked = true;
      if (G.LOG && G.LOG.info) G.LOG.info('audio', 'unlock', { status: bgmFailed || 'ok' });
    }
    /* F6 #5：**不等于 running 就 resume** —— iOS 的 WebAudio 有第三个状态 `interrupted`
       （被系统抢音频后就是它）。原来写死 `=== 'suspended'`，一旦平台把 state 置成它、
       而 `onAudioInterruptionEnd` 又没被派发（老基础库），BGM 就**永远哑**：再点屏幕也不认，
       只能重启小游戏。`ctx.resume()` 本身是幂等的（running 时调用无副作用），所以放开判据。
       ⚠️ 诚实标注：`interrupted` 这个具体取值**没有真机验证过**（本机查不到微信 typings），
          按"可能发生"处理 —— 放开判据的代价为零，收益是"多一种状态也能自愈"。 */
    try { if (ctx.state !== 'running' && ctx.resume) ctx.resume(); } catch (e) {}
    /* 收口到 apply()：存档里的两个开关（老档补过默认值）在这里落一次 ——
       玩家上次把音效关了，这一下就把 SFX gain 压回 0，不会"刚一解锁先响一声再静音"。 */
    apply();
    return true;
  }

  function bufferFor(name) {
    if (!ctx) return null;
    if (bufCache[name]) return bufCache[name];
    const spec = SFX[name];
    if (!spec) return null;
    let b = null;
    try {
      const pcm = synthOf(name, sr());
      b = ctx.createBuffer(1, pcm.length, sr());
      if (b.copyToChannel) b.copyToChannel(pcm, 0, 0);
      else { const d = b.getChannelData(0); for (let i = 0; i < pcm.length; i++) d[i] = pcm[i]; }
    } catch (e) { failed = 'sfx_buf:' + e; return null; }
    bufCache[name] = b;
    return b;
  }

  /* 播一个音效。名字不认识 / 开关关着 / 太密 / 声部满了 → 安静地不播（绝不抛错打断玩法） */
  function play(name) {
    if (!ctx || !unlocked || !sfxOn()) return false;
    const spec = SFX[name];
    if (!spec) return false;
    const now = Date.now();
    if (spec.gap && now - (lastAt[name] || 0) < spec.gap) return false;
    pruneLive(now);
    /* UI 音效有声部上限（防连点刷屏）；**战斗音效不受上限**（见上面 `live` 的注释） */
    if (!spec.combat) {
      let ui = 0;
      for (let i = 0; i < live.length; i++) if (!live[i].combat) ui++;
      if (ui >= MAX_VOICES) return false;
    }
    const b = bufferFor(name);
    if (!b) return false;
    let s = null;
    try {
      s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(sfxGain);
      s.start();
    } catch (e) {
      /* F6 #9：`start()` 抛错时，已经 connect 上的 source 会留在节点图上（不进 live 记账、
         也没人 disconnect）—— 属于泄漏。这里收干净再走。 */
      try { if (s && s.disconnect) s.disconnect(); } catch (e2) {}
      failed = 'sfx_play:' + e; return false;
    }
    lastAt[name] = now;
    plays[name] = (plays[name] || 0) + 1;
    /* 声部计数要**双保险**：`onended` 在部分实现上不一定回，只靠它会让计数只增不减、
       几场战斗之后上限就把声音全掐了。所以还有一条按缓冲时长的兜底释放 + `play()` 里的时间剪枝。 */
    const entry = { end: now + Math.ceil(((b.duration || 0.5) + 0.15) * 1000), combat: !!spec.combat, src: s };
    live.push(entry);
    let released = false;
    const release = function () {
      if (released) return;
      released = true;
      entry.src = null;
      const k = live.indexOf(entry);
      if (k >= 0) live.splice(k, 1);
      try { if (s.disconnect) s.disconnect(); } catch (e2) {}
    };
    try { s.onended = release; } catch (e3) {}
    try { setTimeout(release, Math.ceil(((b.duration || 0.5) + 0.15) * 1000)); } catch (e4) {}
    return true;
  }

  /* 把手边已经响完的声部剪掉（`Date.now()` 走的，不依赖任何回调） */
  function pruneLive(now) {
    const t = now || Date.now();
    for (let i = live.length - 1; i >= 0; i--) if (live[i].end <= t) live.splice(i, 1);
  }

  /* ================= V1.0.4 · R6（父亲大人 09-27 点单：「音频打断处理」）=================
     **一次性音效"立刻停"，不是"挂起后回来接着响"**。
     为什么单独写这一条：`ctx.suspend()` 只是把时间轴冻住 —— 来电那一下没播完的打击声，
     等挂了电话回到游戏会**接着响一半**，听着像穿帮；而 BGM 是循环，挂起后回来继续正合适。
     所以：音效 sources 停掉（真停）、BGM 走 suspend/resume。 */
  function stopVoices() {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      try { if (e && e.src && e.src.stop) e.src.stop(); } catch (e2) {}
      /* F6 #9：停掉之后**断开节点**——原来只靠 `setTimeout(release,…)` 间接 disconnect，
         那是隐式依赖（定时器没跑到就留在图上）。这里显式收干净。 */
      try { if (e && e.src && e.src.disconnect) e.src.disconnect(); } catch (e3) {}
      live.splice(i, 1);
    }
  }

  /* 内存告警时可回收的音频缓存（R2）：合成音效的 PCM 缓冲**完全可再生**，
     清了只是下一次现合成；BGM 的 loopBuf 是解码结果，重建要再解一次 mp3 —— 同样可再生，
     但它正播着的时候不能丢，所以只丢"音效"。**玩家数据一个字都不碰。** */
  function dropCaches() {
    let n = 0;
    Object.keys(bufCache).forEach(function (k) { delete bufCache[k]; n++; });
    stopVoices();
    return n;
  }

  /* 设置变了 / 首次解锁：一处收口把两个开关落到音频上（关＝真停） */
  function apply() {
    if (sfxGain) { try { sfxGain.gain.value = sfxOn() ? SFX_GAIN : 0; } catch (e) {} }
    if (!bgmOn()) bgmStop();
    else if (unlocked) bgmStart();
  }

  /* ================= 四、全局点击收口 =================
     **只在这一处**接 CV.dispatch，不在每个 handler 里各写一遍。
     ⚠️ 载入顺序有讲究：本文件排在 cv.js 之后、**uiw.js 之前** —— uiw.js 会再包一层
     （引导 / 弹窗的拦截），它内部调用的是**本层**，于是"被引导吃掉的那一下"不会出声。 */
  const _dispatch = G.CV && G.CV.dispatch;
  if (_dispatch) {
    G.CV.dispatch = function (id) {
      const r = _dispatch.apply(this, arguments);
      if (r) play('click');
      return r;
    };
  }

  /* ================= 五、前后台 / 来电打断 ================= */
  function suspend() { try { if (ctx && ctx.suspend) ctx.suspend(); } catch (e) {} }
  /* F6 #5：同 unlock 那条 —— `suspended` / `interrupted`（iOS 被系统抢音频）都要能唤醒；
     判据改成"不等于 running"，`resume()` 幂等，重复调不会出事。 */
  function resume() { try { if (ctx && unlocked && ctx.state !== 'running' && ctx.resume) ctx.resume(); } catch (e) {} }
  /* 来电 / 微信音乐 / 别的 App 抢音频（R6）：三件事按顺序做，一样都不许少 ——
       ① 正在响的音效**真停**（见 stopVoices 的说明）；
       ② 音频上下文挂起（BGM 挂起后能接着放，正是想要的）；
       ③ 结束回来：先 resume，再走 `apply()` 收口 —— **只在玩家没手动关音乐时**恢复
          （`bgmOn()` 是 `apply()` 里的既有判据；玩家关了音乐，这一下就不许自作主张响起来）。 */
  function onInterruptBegin() {
    try { if (G.LOG) G.LOG.info('audio', 'interrupt_begin'); } catch (e) {}
    stopVoices();
    suspend();
  }
  function onInterruptEnd() {
    let want = true;
    try { want = bgmOn(); } catch (e) {}
    try { if (G.LOG) G.LOG.info('audio', 'interrupt_end', { ok: want }); } catch (e2) {}
    resume();
    apply();
  }
  /* V1.1.15（2026-09-27 · `boot_onshow_audit` 抓到的时序破坏）：
     这 4 个注册原来写在**模块顶层** —— 也就是"**读档/建档之前**就注册了事件"。
     处理器本身有守卫（不碰 S，所以不会当场崩），但它**破坏了
     「事件注册必须排在读档/建档之后」这条时序不变量**：
     将来谁在 suspend/resume 里加一句碰 S 的代码，就复现上次提审驳回那种"真机冷启动卡死"。
     现在改成**显式安装**：`G.AUDInstallLifecycle()`，由 `game.js` 在**建档之后**那一串里调用。 */
  let lifeInstalled = false;
  function installLifecycle() {
    if (!WX || lifeInstalled) return;
    lifeInstalled = true;
    try {
      /* F6 #6（与 R6 立的口径对齐）：**普通切后台也要"音效真停"** ——
         原来只有 `onAudioInterruptionBegin` 那条路走了 `stopVoices()+suspend()`，
         而切后台/回前台走的是裸 `suspend/resume`：正在响的那一声打击会被冻住、
         回到游戏**接着响一半**（听着就是穿帮）。BGM 仍走挂起/恢复（循环音乐正合适）。 */
      if (WX.onHide) WX.onHide(function () { stopVoices(); suspend(); });
      if (WX.onShow) WX.onShow(resume);
      /* R6（09-27 点单）：来电/微信音乐打扰 —— 这两条**不是** suspend/resume 的别名，
         走的是上面 onInterruptBegin/End 那一套（音效真停 ＋ 结束时按开关决定要不要恢复）。 */
      if (WX.onAudioInterruptionBegin) WX.onAudioInterruptionBegin(onInterruptBegin);
      if (WX.onAudioInterruptionEnd) WX.onAudioInterruptionEnd(onInterruptEnd);
    } catch (e) {}
  }
  try { G.AUDInstallLifecycle = installLifecycle; } catch (e) {}

  /* 启动：只建上下文、只解码 —— **一个 source 都不 start**（自动播放红线在 bgmStart 里） */
  try { init(); } catch (e) { failed = 'boot:' + e; }

  G.AUD = {
    /* 对外（游戏侧只用这三个：unlock / play / apply） */
    unlock: unlock,
    play: play,
    apply: apply,
    click: function () { return play('click'); },
    /* 常量与清单（尺子读，别在别处再写一份） */
    BGM_SRC: BGM_SRC,
    BGM_GAIN: BGM_GAIN,
    SFX_GAIN: SFX_GAIN,
    LOOP_XFADE: LOOP_XFADE,
    SFX_NAMES: SFX_NAMES,
    /* 诊断（真机上父亲大人念一行就能定位） */
    diag: function () {
      return {
        api: !!(WX && WX.createWebAudioContext),
        ctx: !!ctx, state: ctx ? ctx.state : null,
        bgmLoaded: !!loopBuf, bgmPlaying: !!bgmSrc, bgmFailed: bgmFailed,
        bgmDead: bgmDead, bgmTries: bgmTries,   // F6 #8/#10：确凿失败 / 重试次数（真机排查用）
        gain: { bgm: bgmGain ? bgmGain.gain.value : null, sfx: sfxGain ? sfxGain.gain.value : null },
        /* 空间尾（反馈延迟）有没有建起来 —— 建不起来是"干声"，不是"没声音" */
        space: { ok: !!(spDelay && spWet), delay: spDelay ? spDelay.delayTime.value : null,
          fb: spFb ? spFb.gain.value : null, damp: spDamp ? spDamp.frequency.value : null,
          wet: spWet ? spWet.gain.value : null,
          comp: spComp ? spComp.threshold.value : null, why: spaceFailed },
        voices: live.length,
        unlocked: unlocked, started: started, plays: Object.assign({}, plays), failed: failed,
      };
    },
    /* 测试口（只有尺子用；不参与游戏逻辑） */
    _spec: function (n) { return SFX[n]; },
    _synth: function (n) { return synthOf(n, SR_FALLBACK); },
    /* V1.0.4 · R2/R6 的对外口子（`js/wx-cap.js` 用）：内存告警清缓存 / 打断时停音效 */
    dropCaches: dropCaches,
    stopVoices: stopVoices,
    /* ================= 康康 2026-09-29 · 看广告期间静音 =================
       激励视频是**盖在画面上的一层原生浮层**，它有自己的声音；游戏这边要是不停，
       同一时间两套声音一起响（父亲大人：「看广告的时候游戏进程没有暂停」）。
       这里走**与"切后台"完全相同的那条路**（`stopVoices()` ＋ `suspend()`，
       回来 `resume()`）：正在响的那一声打击真停、BGM 挂起，广告结束原样恢复。
       调用方只有一处：`js/wx-adapter.js` 的 `showRewarded`（真广告才调）。 */
    pauseForAd: function () { try { stopVoices(); suspend(); } catch (e) {} },
    resumeAfterAd: function () { try { resume(); } catch (e) {} },
    /* 渲染任意一组声部（**不归一**）—— 尺子用它把"噪声层"单独拉出来量占比：
       "打击音里到底有没有噪声成分"这件事，用混在一起的频谱是量不准的
       （窄带谐音的一个峰就能把频带能量比压没），拆开量 RMS 才作数。 */
    _render: function (layers) { return renderLayers(layers, SR_FALLBACK); },
    _loopPrep: loopPrep,
  };
})();
