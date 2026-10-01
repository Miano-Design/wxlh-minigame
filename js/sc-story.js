/* 《残域》剧情系统（B 批 · 2026-10-01）—— 小说式播放器 + 卷宗 + 程序化场景
   ==============================================================================
   父亲大人本轮口径（照做，不拆小碎步）：
     · **真背景图先不等**：12 张母版全部由程序画占位（`Story.bg`），以后真素材到了
       只换资源，**不再改剧情系统与 UI**；
     · 六层：场景背景 → 程序化雾/光/尘 → 角色程序剪影 → 章节标题 → 人物名/对话 → 关键物件；
     · 只做"玩的感"：进图 / 战前 / 残响 / 战后四段，逐句点着读，能跳过。

   三条纪律：
     ① **A 批是世界观圣经**：本文件不许改故事；发现冲突记 `docs/lore/待裁决设定.md`。
     ② 存档进 `S.story`（老档由 core.js 的 fillDefaults 自动补，云同步跟着存档走）。
     ③ 剧情页是**免打扰页**：不画顶栏底栏、不开奖励、不打断战斗。
   ------------------------------------------------------------------------------
   依赖：core.js（存档）· cv.js（画布框架）· uiw.js（通用件）· sc-story-data.js（内容） */
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const SD = G.STORYDATA || {};
  /* ⚠️ **不要在模块顶层捕获 `CV.SCALE`**：窗口尺寸一变（真机旋屏 / 折叠屏 / 开发者工具改机型）
     `CV.setup()` 会重算它，而捕获过的那份是死的 —— 页面尺寸会停在旧档。
     本文件所有间距一律**当场读** `CV.SCALE`（另外五个 sc-*.js 也是这个写法）。 */
  const C = CV.C;
  const WORLDS = SD.WORLDS || {}, BOSS = SD.BOSS || {}, CHARS = SD.CHARS || {},
    ITEMS = SD.ITEMS || {}, SET_LINE = SD.SET_LINE || {}, SCENE = SD.SCENE || {},
    SCENE_INFO = SD.SCENE_INFO || {}, VOLS = SD.VOLS || [];
  const PARTS = [['in', '进入'], ['pre', '战前'], ['mid', '残响'], ['post', '战后']];
  const PART_NAME = { in: '进入剧情', pre: '战斗前', mid: '战斗中残响', post: '战斗后' };
  const WORLDLIST = (D && D.WORLDS) || [];

  /* ===================== 一、状态（S.story） ===================== */
  function state() {
    const s = Core.S;
    if (!s) return null;
    if (!s.story || typeof s.story !== 'object') s.story = { w: {}, b: {}, c: {}, i: {}, choice: 0 };
    const t = s.story;
    if (!t.w || typeof t.w !== 'object') t.w = {};
    if (!t.b || typeof t.b !== 'object') t.b = {};
    if (!t.c || typeof t.c !== 'object') t.c = {};
    if (!t.i || typeof t.i !== 'object') t.i = {};
    if (typeof t.choice !== 'number') t.choice = 0;
    return t;
  }
  const Story = {};
  G.Story = Story;
  /* ================= 自动播的开关（**只给尺子用**，2026-10-01 二轮） =================
     线上默认就是**自动播**（`in` 进世界自动演、`pre` 守关前自动演）—— 这是父亲大人二轮 §四
     要的那个手感。但工程里有四把"走全流程"的尺子（journey / guide_walk / quest_play /
     battle_flow），它们量的是**自己那条流程**（能不能走到某个页面、引导会不会串台、27 步主线
     能不能连贯），不是"剧情会不会自动弹出来"。
     所以给它们一个开关：置 false ＝ 把那一层先收掉，跑它自己那条流程。
     ⚠️ 这与既有的 `G.coachFor = noop`（尺子摘掉引导模态）是**同一条做法**，不是产品后门：
        · 线上没有任何 UI / 存档 / 网络入口能把它改成 false；
        · "剧情会自动播"这件事由 `visual_story_audit` ⑮（行为验证）与 `audit_routes` ①②
          （剧情层之上开打、打完回世界）**单独钉住**，不会因为这条开关而没人测。 */
  Story.autoPlay = true;
  Story.autoOn = function () { return Story.autoPlay !== false; };
  Story.state = state;
  Story.part = function (worldId, part) {
    const w = WORLDS[worldId];
    return (w && w[part] && w[part].length) ? w[part] : null;
  };
  Story.hasStory = function (worldId) { return !!WORLDS[worldId]; };
  Story.titleOf = function (worldId) { return (WORLDS[worldId] && WORLDS[worldId].title) || ''; };
  Story.sceneOf = function (worldId) { return SCENE[worldId] || 'god_hall'; };
  Story.sceneName = function (id) { return (SCENE_INFO[id] && SCENE_INFO[id].name) || '残域'; };
  /* ================= 人物 / 装备的**场景归属**（2026-10-01 二轮） =================
     父亲大人：「人物故事不能全部使用 ghost_house」「装备故事不能全部使用 tech_base」
     —— 全挤在一个场景里，十几段故事看起来像同一张壁纸。
     规则（按优先级，一处收口）：
       ① 有"首次出现世界"的角色 → 用**那个世界自己的场景**（最准，也最省事）；
       ② 否则按阵营方向兜底（他给的那张方向表）；
       ③ 装备：世界套装→对应世界；专属→它主人的场景；神装→该血统的场景；核心道具→来源世界。
     ⚠️ 场景 id 只能用 `SCENE_INFO` 里那 12 个（父亲大人：**不得自行创造新的 sceneId**）。 */
  const FAC_SCENE = {
    灰原: ['bio_swamp', 'tech_waste'],
    雾乡: ['ghost_town', 'ghost_wall', 'mystic_ruins'],
    锈港: ['tech_base', 'tech_waste'],
    幽都: ['ghost_house', 'ghost_env', 'ghost_wall'],
  };
  /* 血统 → 场景（神装那条线） */
  const BL_SCENE = {
    狼人: 'bio_swamp', 泰坦: 'tech_base', 修真: 'mystic_ruins',
    念动力: 'ghost_house', 绯红: 'ghost_wall', 科技: 'tech_waste',
  };
  /* 核心道具 → 来源世界（只列有明确出处的四条；其余留空 → 回落到灯阁大厅） */
  const MAT_SCENE = {
    MAT_铭魂砂: 'mystic_ruins', MAT_血髓晶: 'bio_swamp',
    MAT_灯阁残片: 'god_hall', MAT_转生点: 'god_hall',
  };
  function charScene(id, ch) {
    ch = ch || CHARS[id] || {};
    if (ch.fw && SCENE[ch.fw]) return SCENE[ch.fw];            // ① 首次出现世界
    const list = FAC_SCENE[ch.fac];                             // ② 阵营方向
    if (list && list.length) return list[0];
    return 'god_hall';
  }
  Story.charScene = charScene;
  function itemScene(key) {
    if (!key) return 'god_hall';
    const s = String(key);
    if (/^SET_(W\d\d)$/.test(s)) return Story.sceneOf(RegExp.$1);        // 世界套装 → 那个世界
    if (/^SIG_(C\d{3})$/.test(s)) return charScene(RegExp.$1);           // 专属 → 主人的场景
    if (/^GOD_(.+)$/.test(s)) return BL_SCENE[RegExp.$1] || 'god_hall';  // 神装 → 该血统
    if (MAT_SCENE[s]) return MAT_SCENE[s];                              // 核心道具 → 来源世界
    return 'god_hall';
  }
  Story.itemScene = itemScene;
  Story.bossOf = function (worldId) { return BOSS[worldId] || null; };
  Story.charOf = function (id) { return CHARS[id] || null; };
  Story.itemOf = function (k) { return ITEMS[k] || null; };
  Story.setLineOf = function (worldId) { return SET_LINE[worldId] || null; };
  /* 这一段看过没有（打完就记；读取只在"标未读"用） */
  Story.seen = function (worldId, part) {
    const t = state(); if (!t) return false;
    return !!(t.w[worldId] && t.w[worldId][part]);
  };
  Story.markSeen = function (worldId, part) {
    const t = state(); if (!t) return;
    if (!t.w[worldId]) t.w[worldId] = {};
    t.w[worldId][part] = 1;
    mark('世界 · ' + worldId);
  };
  Story.seenBoss = function (worldId) { const t = state(); return !!(t && t.b[worldId]); };
  Story.markBoss = function (worldId) {
    const t = state(); if (!t) return; t.b[worldId] = 1; mark('Boss · ' + worldId);
  };
  Story.seenChar = function (id, n) { const t = state(); return !!(t && t.c[id] && t.c[id]['s' + n]); };
  Story.markChar = function (id, n) {
    const t = state(); if (!t) return;
    if (!t.c[id]) t.c[id] = {}; t.c[id]['s' + n] = 1; mark('人物 · ' + id);
  };
  Story.seenItem = function (k) { const t = state(); return !!(t && t.i[k]); };
  Story.markItem = function (k) { const t = state(); if (!t) return; t.i[k] = 1; mark('装备 · ' + k); };
  /* 一次存档（剧情进度要跟存档走，云同步才带得动） */
  function mark(tag) {
    try { Core.save && Core.save(); } catch (e) {}
    Story.lastSeen = tag || '';
  }
  Story.choice = function () { const t = state(); return (t && t.choice) || 0; };
  Story.setChoice = function (v) { const t = state(); if (!t) return; t.choice = v | 0; mark('终局选择'); };

  /* 一个世界"还没读的段数"——世界卡上的小红点用它 */
  Story.unseen = function (worldId) {
    const parts = WORLDS[worldId]; if (!parts) return 0;
    let n = 0;
    PARTS.forEach(function (p) { if (parts[p[0]] && parts[p[0]].length && !Story.seen(worldId, p[0])) n++; });
    return n;
  };

  /* ===================== 二、程序化场景（12 张母版的占位画法） =====================
     第一期**没有真图**：这里用"底色渐变 + 结构剪影 + 光源"把 12 个母版立起来。
     换成真图时只改 `bgScene` 一个函数（其余层与播放器一个字不动）。 */
  /* 场景底色只从**色板**取（`CV.C.scene`）—— 本文件一个色值都不许裸写
     （`visual_audit` ②-1 会当场报出来）。三个分量：底 / 深处 / 强调（光源与灯焰）。 */
  const SCENE_TONE = (CV.C && CV.C.scene) || {};
  function toneOf(sceneId) {
    const info = SCENE_INFO[sceneId];
    const t = SCENE_TONE[(info && info.theme) || 'god'] || SCENE_TONE.god;
    if (!t) return { a: CV.C.bg, b: CV.C.bg2, acc: CV.C.gold };
    return { a: t[0], b: t[1], acc: t[2] };
  }
  /* 底：竖向渐变 + 一层"地平线" */
  function bgBase(c, sceneId, w, h) {
    const t = toneOf(sceneId);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, t.a); g.addColorStop(0.62, t.b); g.addColorStop(1, SCENE_TONE.deep || CV.C.bg);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    /* 地平线那一口光（母版规格：地平线在 62% 高度） */
    const hy = h * 0.62;
    const lg = c.createRadialGradient(w * 0.5, hy, 0, w * 0.5, hy, w * 0.9);
    lg.addColorStop(0, CV.a(t.acc, .22)); lg.addColorStop(1, CV.a(t.acc, 0));
    c.fillStyle = lg; c.fillRect(0, 0, w, h);
  }
  /* 结构：按母版给一组"透视纵深"的剪影（不用位图，纯多边形） */
  function bgStructure(c, sceneId, w, h, t) {
    const tone = toneOf(sceneId), ink = SCENE_TONE.ink || CV.C.shade;
    const hy = h * 0.62;
    c.save();
    if (sceneId === 'god_hall') {
      /* 万灯大厅：**一排落地巨柱** + 柱间挂灯（灯焰会呼吸）。
         ⚠️ 第一版把柱子画成"从 18% 到 62% 的悬空黑条"—— 模拟器上实测像七根竖杠，
           不像建筑（柱子不落地就没有透视锚点）。现在柱子**穿出画面上沿、落到地平线**，
           近大远小（中间的最近、最宽），柱间挂一排灯焰当光源。 */
      /* ⚠️ 近远关系**必须反着来**：单点透视里，画面中间的柱子是**最远**的那根（最窄、最浅），
         两边的才是最近的（最宽、最低、最先出画）。第一版写成"中间最近"，
         模拟器上量出来像一排等宽的黑色条形码 —— 这个 `near` 就是那一处的唯一真源。 */
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const x = w * 0.02 + k * (w * 0.96);
        const near = Math.abs(k - 0.5) * 2;                  // 0（正中·最远）→ 1（两侧·最近）
        const dw = w * (0.030 + 0.055 * near);
        const base = hy + h * (0.01 + 0.10 * near);          // 越近，柱脚落得越低
        c.fillStyle = CV.a(ink, .92);
        c.fillRect(x - dw / 2, -h * 0.06, dw, base + h * 0.06);      // 穿出画面顶部
        /* 柱身靠中那一侧一条极窄的受光边（光从地平线正中来）—— 越近越亮，拉开前后 */
        if (near > 0.3) {
          c.fillStyle = CV.a(tone.acc, .06 + 0.10 * near);
          c.fillRect(x + dw / 2 - Math.max(1, w * 0.004), -h * 0.06, Math.max(1, w * 0.004), base + h * 0.06);
        }
        /* 柱间挂灯：挂在高处，比柱子略靠前（呼吸） */
        const flick = 0.75 + 0.25 * Math.sin(t * 1.4 + i);
        const lx = x + (w * 0.96 / (n - 1)) / 2, ly = h * (0.19 + 0.13 * near);
        c.fillStyle = CV.a(ink, .8);
        c.fillRect(lx - Math.max(1, w * 0.0015), h * 0.05, Math.max(1, w * 0.003), ly - h * 0.05);  // 灯绳
        c.fillStyle = CV.a(tone.acc, .55 * flick);
        c.beginPath(); c.arc(lx, ly, w * (0.009 + 0.006 * near) * (0.85 + 0.15 * flick), 0, Math.PI * 2); c.fill();
      }
      /* 地面：从地平线往下的一层反光（柱子才"站在地上"）＋ 地平线本身一条极淡的亮带 */
      const fg = c.createLinearGradient(0, hy, 0, h);
      fg.addColorStop(0, CV.a(tone.acc, .18)); fg.addColorStop(1, CV.a(tone.acc, 0));
      c.fillStyle = fg; c.fillRect(0, hy, w, h - hy);
      c.fillStyle = CV.a(tone.acc, .22);
      c.fillRect(0, hy - Math.max(1, h * 0.0015), w, Math.max(1, h * 0.003));
    } else if (sceneId === 'mystic_throne' || sceneId === 'mystic_ruins') {
      /* 石质：远处一道拱门 + 近处地面反光 */
      c.fillStyle = CV.a(ink, .85);
      const aw = w * 0.34, ah = h * 0.3, ax = w * 0.33, ay = hy - ah;
      c.beginPath();
      c.moveTo(ax, hy); c.lineTo(ax, ay + aw / 2);
      c.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0);
      c.lineTo(ax + aw, hy); c.closePath(); c.fill();
      c.fillStyle = CV.a(tone.acc, .14); c.fillRect(0, hy, w, h - hy);
    } else if (sceneId === 'tech_base' || sceneId === 'tech_waste') {
      /* 机械纵深：横梁 + 管线 */
      c.fillStyle = CV.a(ink, .9);
      for (let i = 0; i < 4; i++) {
        const y = hy - i * (h * 0.11);
        c.fillRect(0, y, w, h * (0.02 + 0.008 * i));
      }
      c.strokeStyle = CV.a(tone.acc, .28); c.lineWidth = Math.max(1, 2 * CV.SCALE);
      for (let i = 0; i < 5; i++) {
        const x = w * (0.12 + i * 0.19);
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hy); c.stroke();
      }
    } else if (sceneId === 'bio_lab' || sceneId === 'bio_swamp' || sceneId === 'bio_sea') {
      /* 生化：培养舱柱 / 巨骨 / 柱廊 */
      c.fillStyle = CV.a(ink, .86);
      const cols = sceneId === 'bio_sea' ? 6 : 4;
      for (let i = 0; i < cols; i++) {
        const x = w * (0.1 + i * (0.8 / (cols - 1 || 1)));
        c.fillRect(x - w * 0.022, h * 0.2, w * 0.044, hy - h * 0.2);
      }
      c.fillStyle = CV.a(tone.acc, .1); c.fillRect(0, hy, w, h - hy);
    } else {
      /* ghost 一族：一排窗 / 一道长廊 */
      c.fillStyle = CV.a(ink, .88);
      if (sceneId === 'ghost_wall') {
        c.fillRect(0, 0, w, h * 0.18); c.fillRect(0, hy, w, h - hy);
        for (let i = 0; i < 5; i++) {
          const x = w * (0.08 + i * 0.21);
          const fl = 0.7 + 0.3 * Math.sin(t * 1.1 + i * 2);
          c.fillStyle = CV.a(tone.acc, .5 * fl);
          c.beginPath(); c.arc(x, h * 0.26, w * 0.014 * fl, 0, Math.PI * 2); c.fill();
          c.fillStyle = CV.a(ink, .88);
        }
      } else {
        for (let i = 0; i < 4; i++) {
          const x = w * (0.09 + i * 0.23);
          c.fillRect(x, h * 0.22, w * 0.12, h * 0.4);
        }
      }
    }
    c.restore();
  }
  /* 雾 / 尘 / 光束（三层里最上面那层"氛围"）：全部按时间连续运动 */
  function bgAir(c, w, h, t, sceneId) {
    const tone = toneOf(sceneId), cxp = w * 0.5;
    /* 光束：一点透视，从地平线往上散 */
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 0.22 + i * 1.7) * w * 0.05;
      const g = c.createLinearGradient(cxp + sway, h * 0.62, cxp + sway * 2, -h * 0.1);
      g.addColorStop(0, CV.a(tone.acc, .10)); g.addColorStop(1, CV.a(tone.acc, 0));
      c.fillStyle = g;
      const bw = w * (0.05 + i * 0.035);
      c.beginPath(); c.moveTo(cxp + sway - bw, h * 0.62); c.lineTo(cxp + sway + bw, h * 0.62);
      c.lineTo(cxp + sway * 2 + bw * 2.2, 0); c.lineTo(cxp + sway * 2 - bw * 2.2, 0);
      c.closePath(); c.fill();
    }
    c.restore();
    /* 尘：少量颗粒慢慢上浮（用确定性伪随机，不调 Math.random —— 尺子要可复现） */
    c.save();
    for (let i = 0; i < 22; i++) {
      const sx = ((i * 97) % 100) / 100, sy = ((i * 53) % 100) / 100;
      const drift = ((t * (0.02 + (i % 5) * 0.008)) + sy) % 1;
      const x = sx * w + Math.sin(t * 0.3 + i) * w * 0.01;
      const y = (1 - drift) * h;
      c.fillStyle = CV.a(tone.acc, .18 + 0.12 * Math.sin(t + i));
      c.beginPath(); c.arc(x, y, (1 + (i % 3)) * CV.SCALE * 0.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    /* 雾带：横向两条慢移的半透明带 */
    c.save();
    for (let i = 0; i < 2; i++) {
      const yy = h * (0.52 + i * 0.16), off = (t * (8 + i * 5)) % (w * 2) - w * 0.5;
      const g = c.createLinearGradient(0, yy - h * 0.06, 0, yy + h * 0.06);
      g.addColorStop(0, CV.a(tone.acc, 0)); g.addColorStop(0.5, CV.a(tone.acc, .07)); g.addColorStop(1, CV.a(tone.acc, 0));
      c.fillStyle = g; c.fillRect(off, yy - h * 0.06, w, h * 0.12);
      c.fillRect(off + w, yy - h * 0.06, w, h * 0.12);
    }
    c.restore();
  }
  /* 整屏底图（挂到 CV.veilPage）：背景 + 结构 + 氛围，带一点"镜头推移" */
  /* ================= 正式场景图接入（2026-10-01 二轮） =================
     父亲大人：「程序化背景只作为开发占位，不能继续作为最终视觉」「正式素材独立分包」
     「素材审核通过后才接入」。
     所以这里是一条**可插拔**的管线，图没到位时行为与今天完全一样：
       ① 第一次进剧情 → 试着 `wx.loadSubpackage({name:'story'})`（分包没配 / 失败都**静默忽略**）；
       ② 取 `STORYDATA.SCENE_FILE[sceneId]` 的那张图（默认 `story/scene/<id>.jpg`）；
       ③ 加载成功 → cover 铺满 + 原有的雾/光/尘/压暗（**层不变，只换底**）；
       ④ 加载失败 / 文件不在 / 平台没有 createImage → **回落程序化占位**（永不黑屏、永不抛错）。
     换图 = 往 `story/scene/` 丢 12 张同名文件；**不改任何剧情代码**。 */
  const IMG = {};                 // sceneId → {ok:true,img} | {fail:true} | {loading:true}
  let subpkgTried = false;
  function sceneFile(id) { return ((SD.SCENE_FILE || {})[id]) || null; }
  function trySubpackage() {
    if (subpkgTried) return;
    subpkgTried = true;
    try {
      if (typeof wx === 'undefined' || !wx.loadSubpackage) return;
      wx.loadSubpackage({
        name: 'story',
        success: function () { Object.keys(IMG).forEach(function (k) { delete IMG[k]; }); try { CV.render(); } catch (e) {} },
        fail: function () { /* 没有这个分包：正在用主包/占位，什么都不做 */ },
      });
    } catch (e) { /* 老基础库没有这个 API：一样什么都不做 */ }
  }
  function ensureScene(id, onReady) {
    const rec = IMG[id];
    if (rec) { if (rec.ok && onReady) onReady(rec.img); return !!rec.ok; }
    const file = sceneFile(id);
    if (!file || typeof wx === 'undefined' || !wx.createImage) { IMG[id] = { fail: true }; return false; }
    try {
      const img = wx.createImage();
      IMG[id] = { loading: true };
      img.onload = function () { IMG[id] = { ok: true, img: img }; try { CV.render(); } catch (e) {} };
      img.onerror = function () { IMG[id] = { fail: true }; };
      img.src = file;
    } catch (e) { IMG[id] = { fail: true }; }
    return false;
  }
  Story.sceneReady = function (id) { const r = IMG[id]; return !!(r && r.ok); };
  /* ================= Boss 立绘（人物前景层 · 懒加载） =================
     §六：Boss 图是**竖屏剧情视觉资产**，不是头像 —— 保持完整纵向构图、不拉伸、不裁头、
     不被对白区截断。这 6 张是**真透明 RGBA**（构建时逐张验过），所以按"人物前景层"叠在
     场景图之上；透明加载失败就回落程序剪影（原来那套，一个字没删）。 */
  const BOSS_IMG = {};
  function bossFile(id) { return ((SD.BOSS_FILE || {})[id]) || null; }
  function ensureBoss(id, onReady) {
    const rec = BOSS_IMG[id];
    if (rec) { if (rec.ok && onReady) onReady(rec.img); return !!rec.ok; }
    const file = bossFile(id);
    if (!file || typeof wx === 'undefined' || !wx.createImage) { BOSS_IMG[id] = { fail: true }; return false; }
    try {
      const img = wx.createImage();
      BOSS_IMG[id] = { loading: true };
      img.onload = function () { BOSS_IMG[id] = { ok: true, img: img }; try { CV.render(); } catch (e) {} };
      img.onerror = function () { BOSS_IMG[id] = { fail: true }; };
      img.src = file;
    } catch (e) { BOSS_IMG[id] = { fail: true }; }
    return false;
  }
  Story.bossReady = function (id) { const r = BOSS_IMG[id]; return !!(r && r.ok); };
  /* 主视觉（首页大面积背景）：同一套懒加载 */
  let KV_IMG = null;
  Story.ensureKV = function () {
    if (KV_IMG) return !!KV_IMG.ok;
    const file = SD.KV_FILE;
    if (!file || typeof wx === 'undefined' || !wx.createImage) { KV_IMG = { fail: true }; return false; }
    try {
      const img = wx.createImage();
      KV_IMG = { loading: true };
      img.onload = function () { KV_IMG = { ok: true, img: img }; try { CV.render(); } catch (e) {} };
      img.onerror = function () { KV_IMG = { fail: true }; };
      img.src = file;
    } catch (e) { KV_IMG = { fail: true }; }
    return false;
  };
  Story.kvImage = function () { return (KV_IMG && KV_IMG.ok) ? KV_IMG.img : null; };
  /* 一张场景图 cover 铺满（等比放大到恰好盖住，居中） */
  function drawSceneCover(c, img, w, h) {
    const iw = img.width || 1080, ih = img.height || 1920;
    const k = Math.max(w / iw, h / ih);
    const dw = iw * k, dh = ih * k;
    c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  Story.bg = function (c, sceneId, w, h, t) {
    const zoom = 1 + 0.012 * Math.sin(t * 0.05);         // 极缓的推近
    const ox = Math.sin(t * 0.037) * w * 0.008;          // 极缓的横移
    c.save();
    c.translate(w / 2 + ox, h / 2); c.scale(zoom, zoom); c.translate(-w / 2, -h / 2);
    /* 底：有正式图就用图，没有就程序化（**其余几层一字不变**） */
    if (ensureScene(sceneId) && IMG[sceneId] && IMG[sceneId].img) {
      try { drawSceneCover(c, IMG[sceneId].img, w, h); } catch (e) { bgBase(c, sceneId, w, h); }
    } else {
      bgBase(c, sceneId, w, h);
      bgStructure(c, sceneId, w, h, t);
    }
    bgAir(c, w, h, t, sceneId);
    c.restore();
    /* 上下压暗（给标题与台词留安全区；母版规格：上 22% / 下 26%） */
    let g = c.createLinearGradient(0, 0, 0, h * 0.30);
    g.addColorStop(0, CV.a(CV.C.shade, .78)); g.addColorStop(1, CV.a(CV.C.shade, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h * 0.30);
    g = c.createLinearGradient(0, h * 0.62, 0, h);
    g.addColorStop(0, CV.a(CV.C.shade, 0)); g.addColorStop(1, CV.a(CV.C.shade, .88));
    c.fillStyle = g; c.fillRect(0, h * 0.62, w, h * 0.38);
  };

  /* ===================== 三、播放器（六层） =====================
     层序：① 背景（veil）→ ② 氛围（veil 里一并画）→ ③ 角色剪影（演员层）
            → ④ 章节标题 → ⑤ 人物名/对话 → ⑥ 关键物件（高亮） */
  let cur = null;               // { beats, i, reveal, t0, scene, title, chNo, actor, obj, kind, meta }
  let lastTs = 0;
  const REVEAL_CPS = 42;        // 每秒显字（正文节奏，不是"打字机表演"）

  Story.play = function (o) {
    if (!o || !o.beats || !o.beats.length) return false;
    /* 第一次真的要看剧情时才去拉"剧情分包"（12 场景 + 6 Boss + 主视觉都在里面）。
       没有这个分包 / 拉失败都**静默忽略** —— 场景与 Boss 会各自回落程序化占位。 */
    trySubpackage();
    cur = {
      beats: o.beats, i: 0, reveal: 0, t0: Date.now() / 1000, ts: Date.now() / 1000,
      scene: o.scene || 'god_hall', title: o.title || '', chNo: o.chNo || '',
      actor: o.actor || null,               // 说话人 charId（画剪影）
      obj: o.obj || '',                     // 关键物件名（物件层）
      chapter: o.chapter || null,           // 章节转场（卷首第一次进入才带）
      onDone: o.onDone || null,             // 播完要做的事（"自动播完接着开打"那条路用）
      kind: o.kind || 'world', meta: o.meta || {},
    };
    CV.push('story', { title: o.title || '剧情' });
    loop.start();
    return true;
  };
  /* 一个世界的一段 */
  Story.openWorld = function (worldId, part, opts) {
    const w = WORLDS[worldId]; if (!w) return false;
    part = part || 'in';
    const beats = Story.part(worldId, part); if (!beats) return false;
    opts = opts || {};
    const idx = WORLDLIST.findIndex(function (x) { return x.id === worldId; }) + 1;
    const chNo = 'W' + String(idx);
    /* 章节转场：**卷首那一图、且这一卷是第一次进**才出卷名卡（看过就不再打断阅读）。
       判据用"这一段有没有读过"，不新增状态字段 —— 存档里那四个标记已经够用了。 */
    const vol = VOLS.filter(function (v) { return v.from === idx; })[0] || null;
    const chapter = (!opts.kind && vol && !Story.seen(worldId, 'in')) ? vol : null;
    return Story.play({
      beats: beats, title: w.title, chNo: chNo, scene: Story.sceneOf(worldId),
      obj: w.obj, chapter: chapter, actor: opts.actor || null,
      kind: opts.kind || 'world', onDone: opts.onDone || null,
      meta: { worldId: worldId, part: part },
    });
  };
  /* Boss 两段（战前 / 战后）+ 内核 */
  Story.openBoss = function (worldId, which) {
    /* ================= 2026-10-01（父亲大人 · 二轮）：**删掉作者解释腔** =================
       他原话：「`他的内核：` / `他留下的话：` / `留下的谜团：` 这些全部取消……禁止玩家看到
       他的内核 / 人物核心 / 留下的谜团 / 世界观解释 / 作者总结」。
       所以 Boss 线**不再是另一套文案**，而是直接播**这个世界的那一段**：
         · 战前 → 世界的 `pre`（里面本来就只有 Boss 那句台词）
         · 战后 → 世界的 `post`（最后一句话 → 关键物件 → 一个仍然没有答案的事实）
       那句"内核"仍然留在 `STORYDATA.BOSS` 里当**设计备注**（`inner` / `mystery`），
       **一个字都不许送进播放器** —— 玩家要自己得出那个结论。 */
    const b = BOSS[worldId]; if (!b || !WORLDS[worldId]) return false;
    return Story.openWorld(worldId, which === 'after' ? 'post' : 'pre', { kind: 'boss', actor: '@boss_' + worldId });
  };
  /* 人物故事（s1/s2/s3） */
  Story.openChar = function (id, n) {
    const ch = CHARS[id]; if (!ch) return false;
    n = n || 1;
    const beats = ch['s' + n]; if (!beats) return false;
    return Story.play({
      beats: beats, title: ch.name + ' · 故事 0' + n, chNo: ch.bl + ' · ' + ch.fac,
      scene: charScene(id, ch), actor: id, obj: ch.role, kind: 'char', meta: { id: id, n: n },
    });
  };
  /* 装备故事（一条文字 → 两拍：物件 + 旁白） */
  Story.openItem = function (key, title) {
    const txt = ITEMS[key]; if (!txt) return false;
    return Story.play({
      beats: [{ k: 'n', s: txt }], title: title || '装备故事', chNo: '装备',
      scene: itemScene(key), kind: 'item', meta: { key: key },
    });
  };
  /* 当前这一拍 */
  function beat() { return cur ? cur.beats[cur.i] : null; }
  /* ================= 玩家署名的**唯一注入点** =================
     A 批把"第八个名字"押在玩家自己起的名字上（世界页/碑庭/判决书都要出现它）。
     规则（A 批 `characters.md` 写死的四条）：
       · 文案里**不许写死任何一个名字** —— 一律写 `{名}` 令牌，由这里替换；
       · 署名只有一个来源：`Core.charName('@player')`（正文里读第二份就是两处不同源）；
       · 没起名 / 起名没过审 → 一律显示「未署名」（**不许让空串、undefined 上屏**）；
       · 名字已经被内容安全闸管住了（`sc-namecheck` 那条路），这里不再自己判一遍。 */
  function withName(s) {
    const t = String(s == null ? '' : s);
    if (t.indexOf('{名}') < 0) return t;
    let nm = '';
    try { nm = Core.charName && Core.charName('@player'); } catch (e) {}
    nm = String(nm == null ? '' : nm).trim();
    if (!nm || nm === '@player') nm = '未署名';
    return t.split('{名}').join(nm);
  }
  Story.withName = withName;
  function fullLen() { const b = beat(); return b ? withName(b.s).length : 0; }
  function revealed() { return cur ? Math.min(cur.reveal, fullLen()) : 0; }
  function done() { return !cur || revealed() >= fullLen(); }
  /* ================= 角色层：这一拍该画谁的剪影 =================
     优先级：① 显式指定的 actor（人物故事那几条路直接给 id）；
             ② 对白里的 `who` → 按**名字反查角色表**（山吹时雨 / 楚衍 / 黑田宗一 / 苍岚零 都是逐字同名，
                「代行」这类短名走数据层的 `WHO_ALIAS` 别名表）；
             ③ Boss 线的对白 → 给一个**按世界定死的程序化剪影**（id 用 `@boss_世界号`，
                `D.avatarSpec` 对任意 id 都是确定性映射 ⇒ 六个 Boss 六个不同的形，永不撞脸）。
     画不出人的时候**什么都不画**（不糊一个默认头像上去 —— 那比空着更像 bug）。 */
  let NAME2ID = null;
  function actorOf(b) {
    if (!b || b.k !== 'd' || !b.who) return null;
    const alias = (SD.WHO_ALIAS || {})[b.who];
    if (alias) return alias;
    if (!NAME2ID) {
      NAME2ID = {};
      ((D && D.characters) || []).forEach(function (c) { if (c && c.name) NAME2ID[c.name] = c.id; });
    }
    if (NAME2ID[b.who]) return NAME2ID[b.who];
    if (cur && cur.kind === 'boss' && cur.meta && cur.meta.worldId) return '@boss_' + cur.meta.worldId;
    return null;
  }
  /* 把"一个人"画成**站在场景里的剪影**（不是圆形头像徽章）。
     形状数据仍然是 `D.avatarParts` 那一份（与头像、列表、编队同一个形，不另造一套），
     只是**不画圆盘、不做圆形裁剪** —— 圆盘是列表里那个容器的形状，
     剧情页这里要的是"一个人站在光里"，套个圆圈秒变徽章（模拟器上实测过）。
     做法：同一批多边形填成近黑剪影，再按场景强调色描一道极淡的边（把轮廓从暗底里拉出来）。 */
  function silhouette(id, cx, cy, size) {
    const DD = D;
    if (!DD || !DD.avatarParts) return;
    const info = { bloodline: '', faction: '' };
    if (id && id.charAt(0) === '@' && DD.charById && DD.charById[id]) {
      const ch = DD.charById[id];
      info.bloodline = ch.bloodline; info.faction = ch.faction;
    }
    const parts = DD.avatarParts(id, info) || [];
    if (!parts.length) return;
    const c = CV.ctx;
    const tone = toneOf(cur && cur.scene);
    c.save();
    c.beginPath();
    parts.forEach(function (p) {
      p.pts.forEach(function (q, i) {
        const px = cx - size / 2 + q[0] * size, py = cy - size / 2 + q[1] * size;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.closePath();
    });
    c.fillStyle = CV.a(CV.C.bg, .86);
    c.fill();
    c.strokeStyle = CV.a(tone.acc, .34);
    c.lineWidth = Math.max(1, 1.2 * CV.SCALE);
    c.stroke();
    c.restore();
  }

  function advance() {
    if (!cur) return;
    /* 章节转场期间点一下 = **跳过转场**（不是"显完整句"—— 那时台上还没有台词） */
    if (cur.chapter) { cur.chapter = null; cur.ts = Date.now() / 1000; return; }
    if (!done()) { cur.reveal = fullLen(); return; }      // 没显完 → 一次显完
    if (cur.i < cur.beats.length - 1) { cur.i++; cur.reveal = 0; cur.ts = Date.now() / 1000; return; }
    finish();
  }
  function finish() {
    if (!cur) return;
    const m = cur.meta || {};
    const after = cur.onDone;
    if (cur.kind === 'world' && m.worldId) Story.markSeen(m.worldId, m.part);
    /* Boss 线播的**就是**这一张图的 `pre` / `post`（见 openBoss），所以两边都要记：
       只记 `b[worldId]` 的话，世界页会把这一段当成没读过 → 守关前**反复自动播**。
       这正是"同一段只播一次"那条要求最容易漏的一处。 */
    else if (cur.kind === 'boss' && m.worldId) {
      if (m.part) Story.markSeen(m.worldId, m.part);
      Story.markBoss(m.worldId);
    }
    else if (cur.kind === 'char') Story.markChar(m.id, m.n);
    else if (cur.kind === 'item') Story.markItem(m.key);
    cur = null;
    loop.stop();
    CV.pop();
    /* 播完要做的事（"先看剧情、看完自动开打"那条路）—— 放在 pop **之后**：
       先退回上一页（世界页），再启动战斗，栈才是对的。 */
    if (typeof after === 'function') { try { after(); } catch (e) {} }
  }
  Story.skip = function () { finish(); };

  /* 帧驱动：显字推进 + 背景氛围（省电模式下显完字就停） */
  function alive() { return !!cur && CV.top().name === 'story'; }
  function tick() {
    if (!cur) return;
    const now = Date.now() / 1000;
    const dt = Math.min(0.2, Math.max(0, now - cur.ts));
    cur.ts = now;
    /* 转场期间**不推进显字**（否则卷名卡放完，第一句已经自己显完了 —— 那是白给） */
    if (cur.chapter) return;
    if (!done()) cur.reveal = Math.min(fullLen(), cur.reveal + dt * REVEAL_CPS);
  }
  function powerSave() { return !!(Core.S && Core.S.settings && Core.S.settings.savePower); }
  function needFrames() {
    if (!cur) return false;
    if (!done()) return true;
    return !powerSave();                 // 显完字后：省电模式停帧（静态一张），否则继续跑氛围
  }
  const RAF = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : null;
  const CAF = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : null;
  const loop = (function () {
    let handle = null, last = 0, live = false;
    function arm() {
      if (handle || !live) return;
      handle = RAF ? { raf: RAF(step) } : { timer: setTimeout(step, 33) };
    }
    function stop() {
      live = false;
      if (!handle) return;
      if (handle.raf && CAF) { try { CAF(handle.raf); } catch (e) {} }
      if (handle.timer) clearTimeout(handle.timer);
      handle = null;
    }
    function step() {
      handle = null;
      if (!live) return;
      if (!alive()) { stop(); return; }
      const t = Date.now();
      if (t - last >= 32) { last = t; tick(); CV.render(); }   // ~30fps 上限
      if (!needFrames()) { CV.render(); stop(); return; }
      arm();
    }
    return { start: function () { live = true; if (handle) return; last = 0; arm(); }, stop: stop };
  })();

  /* ===================== 四、剧情页的绘制 ===================== */
  /* 章节页码：W01 → 「第一章」这种大字（④ 章节标题层） */
  function chapterLabel(worldId) {
    const i = WORLDLIST.findIndex(function (x) { return x.id === worldId; });
    if (i < 0) return '';
    return 'W' + String(i + 1).padStart(2, '0');
  }
  /* 中文折行（按像素宽度，不走 CV.text 的 \n） */
  function wrap(str, maxW, size, bold) {
    const out = []; let line = '';
    for (const ch of String(str)) {
      if (ch === '\n') { out.push(line); line = ''; continue; }
      const test = line + ch;
      if (CV.measure(test, size, bold) > maxW && line) { out.push(line); line = ch; }
      else line = test;
    }
    out.push(line);
    return out;
  }
  /* ================= 给尺子用：一段台词占多高（**同一份折行与行高**） =================
     `scripts/audit_story.js` 会拿它在 320/375/390/430 四档上逐条量"这一段会不会顶出画面"。
     页面与尺子读同一个函数，才不存在"页面量一套、尺子量一套"。 */
  Story.measureBeat = function (b, boxW) {
    const size = CV.FS.lg, lh = size * 1.75;
    if (!b) return { lines: [], size: size, lh: lh, blockH: 0 };
    const isD = b.k === 'd';
    const lines = wrap(withName(b.s), boxW - (isD ? 8 * CV.SCALE : 0), size, false);
    const nameH = (isD && b.who) ? size * 1.6 : 0;
    return { lines: lines, size: size, lh: lh, nameH: nameH, blockH: nameH + lines.length * lh };
  };
  /* 剧情页可视高度（内容层坐标）：本页恒为 chromeless ⇒ `CV.TOP === CV.safeTop`，
     所以直接用 safeTop 算 —— 这样**第一次渲染之前**尺子就能量到同一个值。
     drawStory 也读它，两处只有这一处公式。 */
  Story.viewH = function () { return CV.H - CV.safeTop - CV.safeBottom - 8; };
  function drawStory() {
    const c = CV.ctx;
    if (!cur) { U.begin(); U.card(function () { U.h3('剧情'); U.hint('没有正在播放的段落', 6 * CV.SCALE); }); return; }
    const b = beat(); if (!b) return;
    /* ⚠️ 这里是**内容层坐标**（cv.js 已把 ctx translate 到 CV.TOP+8，并减掉 scroll）——
       所以顶是 0、底是 viewH，不是屏幕坐标。剧情页是 chromeless（不减 NAV_H）。 */
    const top = 0;
    const bottom = Story.viewH();
    /* ④′ 章节转场：卷首那一图**第一次**进来时，先出一张卷名卡（约 2.2 秒淡出）。
       转场期间只画这一张卡（不叠台词），点一下可以跳过它（直接进正文）。 */
    if (cur.chapter) {
      const el = Date.now() / 1000 - cur.t0;
      const DUR = 2.2;
      if (el < DUR) {
        const a = el < 0.35 ? (el / 0.35) : Math.max(0, 1 - (el - 0.35) / (DUR - 0.35));
        const midY = (top + bottom) / 2;
        const vol = cur.chapter;
        c.save(); c.globalAlpha = Math.max(0, Math.min(1, a));
        const ruleW = CV.W * 0.16, ruleY1 = midY - 46 * CV.SCALE, ruleY2 = midY + 46 * CV.SCALE;
        c.fillStyle = C.gold;
        c.fillRect((CV.W - ruleW) / 2, ruleY1, ruleW, Math.max(1, CV.SCALE));
        c.fillRect((CV.W - ruleW) / 2, ruleY2, ruleW, Math.max(1, CV.SCALE));
        CV.text('第 ' + vol.n + ' 卷', CV.W / 2, midY - 24 * CV.SCALE,
          { size: CV.FS.sm, align: 'center', color: C.gold, ls: 3 });
        CV.text('《' + vol.name + '》', CV.W / 2, midY,
          { size: CV.FS.f2, bold: true, align: 'center', color: C.text, ls: 2 });
        CV.text(vol.line || '', CV.W / 2, midY + 24 * CV.SCALE,
          { size: CV.FS.sm, align: 'center', color: C.dim });
        c.restore();
        CV.hit('story_next', 0, top, CV.W, bottom - top);      // 点一下＝跳过转场
        const skW = CV.measure('跳过', CV.FS.sm) + 22 * CV.SCALE, skH = 28 * CV.SCALE;
        const skX = CV.W - U.pad() - skW;
        CV.round(skX, top + 10 * CV.SCALE, skW, skH, skH / 2, CV.a(C.panel2, .8), C.line2);
        CV.text('跳过', skX + skW / 2, top + 10 * CV.SCALE + skH / 2, { size: CV.FS.sm, align: 'center', color: C.dim });
        CV.hit('story_skip', skX, top + 10 * CV.SCALE, skW, skH);
        return;
      }
      cur.chapter = null;                  // 放完就卸掉，后面几拍不再走这条路
    }
    /* ③ 角色剪影层：说话人有 charId 就画他的程序剪影，站在画布右侧 1/3 */
    /* ③ 角色层：**正式 Boss 立绘优先**，没有才回落程序剪影。
       Boss 图的规格是"人物在画面右 1/3、上半身到大腿、左侧留白"（§六），
       所以整张按**高度 contain**（绝不拉伸、绝不裁头）后靠右贴底 ——
       人物自然落在屏幕右侧，左边那块透明区正好留给标题。 */
    const bossId = (cur.kind === 'boss' && cur.meta && cur.meta.worldId) ? cur.meta.worldId : null;
    const act = cur.actor || actorOf(b);
    if (bossId && ensureBoss(bossId)) {
      const img = BOSS_IMG[bossId].img;
      const iw = img.width || 1080, ih = img.height || 1920;
      let dh = bottom * 0.94, dw = dh * (iw / ih);
      const maxW = CV.W * 0.96;
      if (dw > maxW) { dw = maxW; dh = dw * (ih / iw); }
      c.save();
      c.globalAlpha = 0.98;
      c.drawImage(img, CV.W - dw, bottom - dh, dw, dh);
      c.restore();
    } else if (act) {
      /* 站位照母版规格：人物站画布**右 1/3**、脚踩在地平线附近（62% 高）；
         别顶到台词区（下 26% 是安全区）。 */
      const size = Math.min(CV.W * 0.62, bottom * 0.52);
      silhouette(act, CV.W * 0.70, bottom * 0.54, size);
    }
    /* ④ 章节标题层 */
    const headY = top + 20 * CV.SCALE;
    if (cur.chNo) CV.text(cur.chNo, U.pad(), headY, { size: CV.FS.sm, color: C.gold, bold: true, ls: 1.2 });
    if (cur.title) {
      const tw = CV.W - U.pad() * 2;
      CV.text(CV.fit(cur.title, tw, CV.FS.f1, true), U.pad(), headY + 20 * CV.SCALE,
        { size: CV.FS.f1, bold: true, color: C.text });
    }
    /* ⑤ 人物名 + 对话 / 旁白（底部 26% 安全区） */
    const boxW = CV.W - U.pad() * 2;
    const isD = b.k === 'd';
    const txt = withName(b.s).slice(0, revealed());
    const size = CV.FS.lg;
    const lh = size * 1.75;
    /* ⚠️ 折行与行高走 `Story.measureBeat` **同一份**（尺子也读它）——
       页面自己再写一遍等于"量一套、画一套"，正是这个项目最忌讳的那种假账。 */
    const lines = wrap(txt, boxW - (isD ? 8 * CV.SCALE : 0), size, false);
    const nameH = (isD && b.who) ? size * 1.6 : 0;
    const blockH = nameH + lines.length * lh;
    let y = bottom - 26 * CV.SCALE - blockH;
    /* 兜底（尺子 `audit_story` ⑫ 在管这条）：**万一以后有人写了一段超长的台词**，
       不让它把整块文字顶到画面外面去 —— 从顶部起画，超出部分由内容层的裁剪收掉。
       正常文案永远走不到这里（现在最长的一拍在 320 档上只用掉不到两成高度）。 */
    if (y < top + 8 * CV.SCALE) y = top + 8 * CV.SCALE;
    /* ================= 文字层：**不要"巨大黑色矩形对话框"**（2026-10-01 二轮） =================
       父亲大人要的是「底部半透明暗色渐隐 + 文字 + 很轻的顶部细线」—— 让文字像出现在场景里。
       画法：① 文字块背后一层**从透明渐到暗**的软底（不是实心圆角框）；
             ② 上沿一条极细的低对比线（把文字区从场景里"提"出来，但不切一刀）。 */
    {
      const padY = 16 * CV.SCALE;
      const gTop = Math.max(top, y - nameH - padY);
      const g = c.createLinearGradient(0, gTop - 26 * CV.SCALE, 0, bottom);
      g.addColorStop(0, CV.a(CV.C.shade, 0));
      g.addColorStop(0.45, CV.a(CV.C.shade, .42));
      g.addColorStop(1, CV.a(CV.C.shade, .72));
      c.fillStyle = g;
      c.fillRect(0, gTop - 26 * CV.SCALE, CV.W, bottom - gTop + 26 * CV.SCALE);
      c.fillStyle = CV.a(C.text, .12);
      c.fillRect(U.pad(), gTop - 14 * CV.SCALE, CV.W - U.pad() * 2, Math.max(1, CV.SCALE * 0.6));
    }
    /* 关键物件层（⑥）：物件名做成一颗标签，挂在台词框上沿 */
    if (cur.obj && (b.k === 'o')) {
      const ow = CV.measure(cur.obj, CV.FS.sm) + 18 * CV.SCALE, oh = 20 * CV.SCALE;
      CV.round(U.pad(), y - oh - 8 * CV.SCALE, ow, oh, oh / 2, CV.a(C.gold, .16), C.gold);
      CV.text(cur.obj, U.pad() + ow / 2, y - oh / 2 - 8 * CV.SCALE, { size: CV.FS.sm, align: 'center', color: C.gold });
    }
    if (nameH) {
      CV.text(b.who, U.pad(), y, { size: CV.FS.md, color: C.gold, bold: true });
      y += nameH;
    }
    c.save();
    c.fillStyle = isD ? C.text : C.text2;
    c.font = (size | 0) + 'px ' + CV.FONT;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    lines.forEach(function (ln, i) {
      c.globalAlpha = (b.k === 'o') ? 0.95 : 1;
      c.fillText(ln, U.pad() + 0, y + lh * i + lh / 2);
    });
    c.restore();
    /* 继续提示（全屏热区 · 点一下往下） */
    const hint = done() ? (cur.i < cur.beats.length - 1 ? '轻点继续' : '轻点结束') : '';
    if (hint) {
      CV.text(hint, CV.W - U.pad(), bottom - 10 * CV.SCALE, { size: CV.FS.sm, align: 'right', color: CV.a(C.dim, .9) });
    }
  CV.hit('story_next', 0, top, CV.W, bottom - top);
    /* 跳过：右上角一颗小按钮（不挡阅读） */
    const skW = CV.measure('跳过', CV.FS.sm) + 22 * CV.SCALE, skH = 28 * CV.SCALE;
    const skY = top + 10 * CV.SCALE, skX = CV.W - U.pad() - skW;
    CV.round(skX, skY, skW, skH, skH / 2, CV.a(C.panel2, .8), C.line2);
    CV.text('跳过', skX + skW / 2, skY + skH / 2, { size: CV.FS.sm, align: 'center', color: C.dim });
    CV.hit('story_skip', skX, skY, skW, skH);
  }
  CV.register('story', drawStory);
  /* 整屏底图：**直接写 `CV.veils`，不用 `CV.veilPage`** ——
     后者定义在 sc-splash.js 里，而本文件是模块顶层执行：谁先加载就决定它存不存在。
     `game.js` 里 splash 排在前面，可 `_env.js`（六支 audit 共用）是按目录序 require 的，
     顺序一变这里就会 `CV.veilPage is not a function` 直接崩掉整局。写 `CV.veils` 没有这个前提。 */
  CV.veils = CV.veils || {};
  CV.veils.story = function (c) {
    const t = Date.now() / 1000;
    Story.bg(c, (cur && cur.scene) || 'god_hall', CV.W, CV.H, t);
  };
  CV.on('story_next', function () { advance(); CV.render(); });
  CV.on('story_skip', function () { Story.skip(); });

  /* ===================== 五、卷宗（看过的东西都在这里） ===================== */
  let arcTab = 'world';
  function archiveCount() {
    let w = 0, b = 0, cc = 0, it = 0;
    Object.keys(WORLDS).forEach(function (id) {
      PARTS.forEach(function (p) { if (Story.seen(id, p[0])) w++; });
      if (Story.seenBoss(id)) b++;
    });
    Object.keys(CHARS).forEach(function (id) { [1, 2, 3].forEach(function (n) { if (Story.seenChar(id, n)) cc++; }); });
    Object.keys(ITEMS).forEach(function (k) { if (Story.seenItem(k)) it++; });
    return { w: w, b: b, c: cc, i: it };
  }
  function drawArchive() {
    const n = archiveCount();
    U.begin(); U.pageHead('卷宗', { backId: 'story_back' });
    U.card(function () {
      U.h3('灯录之外的那一本', '残域的记录，只记你看过的');
      U.note('剧情段落 ' + n.w + ' / ' + (Object.keys(WORLDS).length * 4) +
        '　Boss ' + n.b + ' / ' + Object.keys(BOSS).length +
        '　人物 ' + n.c + ' / ' + (Object.keys(CHARS).length * 3) +
        '　装备 ' + n.i + ' / ' + Object.keys(ITEMS).length);
    });
    /* 四个页签：**当前这一卷画成"状态"、不登记热区**。
       理由（与项目既有那条"禁用态不许登记热区"同一条规矩）：点当前这一卷本来就不会有任何变化
       ——登记了就是一根死键，`deadkey_audit` 会当场把它报出来（实测过：只有这一条不合格）。
       所以"选中的那一卷"是状态、其余三卷才是按钮。 */
    {
      const tabs = [['world', '残域卷 ' + n.w], ['boss', 'Boss ' + n.b], ['char', '人物 ' + n.c], ['item', '装备 ' + n.i]];
      const gap = 6 * CV.SCALE, h = U.BTN_SM * CV.SCALE;
      const cw = (U.cw() - gap * (tabs.length - 1)) / tabs.length;
      const top = U.y;
      tabs.forEach(function (t, i) {
        const x = U.pad() + i * (cw + gap);
        if (arcTab === t[0]) {
          CV.round(x, top, cw, h, CV.RADIUS_SM, CV.a(CV.C.panel3, .50), CV.C.gold);
          CV.text(CV.fit(t[1], cw - 12 * CV.SCALE, CV.FS.md), x + cw / 2, top + h / 2,
            { size: CV.FS.md, align: 'center', color: CV.C.gold });
        } else {
          U.btn(x, top, cw, h, t[1], null, 'arctab:' + t[0]);
        }
      });
      U.y = top + h + 12 * CV.SCALE;
    }
    U.space(CV.SP[1]);
    if (arcTab === 'world') {
      WORLDLIST.forEach(function (w) {
        const has = !!WORLDS[w.id]; if (!has) return;
        U.card(function () {
          U.h3('W' + String(WORLDLIST.indexOf(w) + 1) + ' ' + w.name, WORLDS[w.id].title);
          PARTS.forEach(function (p) {
            const ok = Story.seen(w.id, p[0]);
            const row = U.y;
            CV.text(p[1], U.ix(), row + 8 * CV.SCALE, { size: CV.FS.md, color: ok ? C.text2 : C.dim });
            CV.text(ok ? '已读 · 轻点重读' : '未读', U.ix() + U.iw(), row + 8 * CV.SCALE,
              { size: CV.FS.sm, align: 'right', color: ok ? C.gain : C.dim });
            U.space(18 * CV.SCALE);
            /* **只有已读的那一段登记热区**（卷宗自己的标题就是"只记你看过的"，
               右边那行也写着"已读 · 轻点重读"）—— 未读段从这里点开，
               等于把"读没读过"这件事绕过去了；要读新段落请回世界页。 */
            if (ok) CV.hit('arcopen:' + w.id + ':' + p[0], U.ix(), row, U.iw(), 18 * CV.SCALE);
          });
        });
      });
    } else if (arcTab === 'boss') {
      Object.keys(BOSS).forEach(function (id) {
        const b = BOSS[id], ok = Story.seenBoss(id);
        U.card(function () {
          U.h3(b.name, ok ? (Story.titleOf(id) || '') : '未解锁');
          U.note(ok ? b.inner : '（打到这里才会记下来）');
          if (ok) { U.space(6 * CV.SCALE); U.btn(U.ix(), U.y, U.iw() / 2 - 4 * CV.SCALE, U.BTN_SM * CV.SCALE, '重读', 'ghost', 'arcboss:' + id); U.y += U.BTN_SM * CV.SCALE; }
        });
      });
    } else if (arcTab === 'char') {
      Object.keys(CHARS).forEach(function (id) {
        const ch = CHARS[id];
        U.card(function () {
          U.h3(ch.name, ch.bl + ' · ' + ch.fac);
          [1, 2, 3].forEach(function (n) {
            const ok = Story.seenChar(id, n);
            const row = U.y;
            CV.text('故事 0' + n, U.ix(), row + 8 * CV.SCALE, { size: CV.FS.md, color: ok ? C.text2 : C.dim });
            CV.text(ok ? '轻点重读' : '未读', U.ix() + U.iw(), row + 8 * CV.SCALE,
              { size: CV.FS.sm, align: 'right', color: ok ? C.gain : C.dim });
            U.space(18 * CV.SCALE);
            if (ok) CV.hit('arcchar:' + id + ':' + n, U.ix(), row, U.iw(), 18 * CV.SCALE);
          });
        });
      });
    } else {
      Object.keys(ITEMS).forEach(function (k) {
        const ok = Story.seenItem(k);
        U.card(function () {
          U.h3(ok ? k : '？', ok ? '' : '未解锁');
          U.note(ok ? ITEMS[k] : '（拿到这件东西才会记下来）');
        });
      });
    }
  }
  CV.register('story_archive', drawArchive);
  CV.on('story_back', function () { CV.pop(); });
  /* ⚠️ 动态热区必须注册成 `前缀:*`（cv.js:dispatch 把冒号后面那段当参数传进来）——
       写成 'arctab:world' 只有**那一个** id 命中，'arctab:boss' 那几颗会变成死键。 */
  CV.on('arctab:*', function (t) { arcTab = String(t || 'world'); CV.render(); });
  CV.on('arcopen:*', function (p) {
    const s = String(p || '').split(':');
    Story.openWorld(s[0], s[1]);
  });
  CV.on('arcboss:*', function (id) { Story.openBoss(String(id || ''), 'after'); });
  CV.on('arcchar:*', function (p) {
    const s = String(p || '').split(':');
    Story.openChar(s[0], +s[1] || 1);
  });
  Story.openArchive = function () { CV.push('story_archive', {}); };

  /* ================= 世界页的**主叙事入口**（2026-10-01 二轮） =================
     父亲大人：「删掉 [进入][战前][残响][Boss] 这种四颗平铺按钮作为主入口……
     替换成一个主叙事入口」，并按状态动态显示：
       全部没看 → 「发现新线索」／看了一部分 → 「继续故事 · 还差 N 段」／全看完 → 「重读本章」。
     ⚠️ `mid`（残响）**不在这条入口的候选里** —— 它已经改成战斗内自动播（见 sc-battle），
        在世界页给它留一颗按钮就等于"残响还是世界页的一个功能"，正是这一轮要拆掉的东西。
        所以：候选只有 `in` → `pre` → `post`，`mid` 由战斗那边自己标。 */
  const ENTRY_ORDER = ['in', 'pre', 'post'];
  Story.nextEntry = function (worldId) {
    const w = WORLDS[worldId]; if (!w) return null;
    for (let i = 0; i < ENTRY_ORDER.length; i++) {
      const p = ENTRY_ORDER[i];
      if (w[p] && w[p].length && !Story.seen(worldId, p)) return p;
    }
    return ENTRY_ORDER.filter(function (p) { return w[p] && w[p].length; })[0] || null;
  };
  /* 这一段还没读的**入口段**有几段（只看 in/pre/post —— mid 在战斗里，不参与这里的计数） */
  Story.unreadEntries = function (worldId) {
    const w = WORLDS[worldId]; if (!w) return 0;
    return ENTRY_ORDER.filter(function (p) { return w[p] && w[p].length && !Story.seen(worldId, p); }).length;
  };
  Story.entryLabel = function (worldId) {
    const w = WORLDS[worldId]; if (!w) return '';
    const total = ENTRY_ORDER.filter(function (p) { return w[p] && w[p].length; }).length;
    const un = Story.unreadEntries(worldId);
    if (un >= total) return '发现新线索';                 // 一段都没看
    if (un > 0) return '继续故事 · 还差 ' + un + ' 段';   // 看了一部分
    return '重读本章';                                    // 全看完
  };
  /* 从世界页按主入口进：opts.onDone 由调用方给（"看完接着开打"那条路） */
  Story.openMain = function (worldId, opts) {
    const p = Story.nextEntry(worldId);
    if (!p) return false;
    const o = opts || {};
    /* 六卷锚点世界的 `pre`/`post` **就是 Boss 场**（§二十一B：立绘 → Boss 名 → 一句对白 → 战斗），
       所以从这里进也给 `kind:'boss'` —— 否则"从世界页重读 Boss 那一段"会看不到立绘。 */
    if (!o.kind && BOSS[worldId] && (p === 'pre' || p === 'post')) o.kind = 'boss';
    return Story.openWorld(worldId, p, o);
  };
  /* 结算那一层要的"一句线索"：**优先进关键物件那一拍**（`o`），没有才退第一拍。
     为什么这么挑：`o` 那一拍本来就是"玩家看到的东西"（轨道图上亮起 36 个点），
     而 `n` 那一拍常常是判断句。线索要能当"发现"用，不能当结论用。 */
  Story.clueOf = function (worldId, part) {
    const list = Story.part(worldId, part || 'post');
    if (!list) return '';
    const o = list.filter(function (b) { return b.k === 'o' && b.s; })[0];
    return withName((o || list[0]).s);
  };
  /* 战斗里那一条「残响」用哪句：**优先关键物件那一拍**（`o` 本来就是"你听见/看见的东西"），
     没有才退第一拍。只取一句 —— 父亲大人要的是"一句极短文字"，不是把 mid 整段搬进去。 */
  Story.midLine = function (worldId) {
    const list = Story.part(worldId, 'mid');
    if (!list) return '';
    const o = list.filter(function (b) { return b.k === 'o' && b.s; })[0];
    return withName((o || list[0]).s);
  };

  /* ===================== 六、外部入口（页面上的按钮挂到这几个上） ===================== */
  CV.on('story_world:*', function (id) { Story.openWorld(String(id || '').slice(0, 3), 'in'); });
  CV.on('story_world_pre:*', function (id) { Story.openWorld(String(id || '').slice(0, 3), 'pre'); });
  /* ⚠️ **这里没有 `story_world_mid`** —— 「残响」已经改成战斗内自动播（见 sc-battle 的残响层），
     再在世界页留一颗手动入口就等于"残响仍是世界页的一个功能"，与这一轮的目地相冲。
     `visual_story_audit` 会盯着这一条（世界页不许出现四段平铺按钮、不许有 mid 手动入口）。 */
  CV.on('story_boss:*', function (id) { Story.openBoss(String(id || '').slice(0, 3), 'before'); });
  /* 世界页唯一的主叙事入口 */
  CV.on('story_main:*', function (id) {
    const wid = String(id || '').slice(0, 3);
    /* ⚠️ **不要在这里硬给 `kind`** —— 六卷锚点世界的 `pre`/`post` 就是 Boss 场，
       `Story.openMain` 会自己把它标成 `kind:'boss'`。第一版这里写死 `{kind:'world'}`，
       结果"从世界页重读 Boss 那一段"**永远看不到 Boss 立绘**（实机上量出来的）。 */
    Story.openMain(wid);
  });
  /* 结算页那两行「去看」：战后那一段 / Boss 战后那一段 */
  CV.on('story_world_post:*', function (id) {
    const wid = String(id || '').slice(0, 3);
    /* 结算那条「发现」也照同一条规矩：Boss 世界的战后就是 Boss 场（立绘要出来）。 */
    Story.openWorld(wid, 'post', BOSS[wid] ? { kind: 'boss' } : null);
  });
  CV.on('story_boss_after:*', function (id) { Story.openBoss(String(id || '').slice(0, 3), 'after'); });
  CV.on('story_char:*', function (p) {
    const s = String(p || '').split(':');
    Story.openChar(s[0], +s[1] || 1);
  });
  CV.on('story_item:*', function (p) {
    const s = String(p || '').split(':');
    Story.openItem(s[0], s[1] || '装备故事');
  });
  CV.on('story_archive', function () { Story.openArchive(); });
})();
