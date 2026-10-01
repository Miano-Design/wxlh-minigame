/* 残域（副本）—— 照网页版 js/ui.js 的 worldsList / worldDetail / runScreen / sweepModal 复刻
   ------------------------------------------------------------------------------
   结构（V9.5.x）：
     ① 世界列表：继续上次探索（有存档才出现）→ 深井挑战 → 残域（36 个世界卡）
     ② 世界详情：返回 → 世界卡（描述 / 世界机制 / 守关 Boss）→ 难度页签 → 12 个关卡格 → 扫荡
     ③ 点关卡格直接开打（一关一口气打到底，波与波之间不弹结算页）
   数值与判定一律走网页版 Core / Dungeon —— 这里只负责摆位置与画。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA, Dun = G.Dungeon, BattleUI = G.BattleUI;
  /* 2026-09-23 备案自查：ghost 兜底原来是 🕸（蛛网）、god 兜底是 👁（悬空眼球）——
     两个都是"恐怖"同源意象，与网页版一起换成月亮 / 金牌。这五个只是兜底（36 个世界都有 ico）。
     同日 AI 视觉工程师：中间的 🪞 再换 🌚 —— 🪞 属 Emoji 13（老机型豆腐块），
     画布上的图标一律压到 Emoji 1.0（判据：码位 < U+1F900），与网页版 ui.js 同值。 */
  const ICON = { bio: '🦠', ghost: '🌚', mystic: '🏺', tech: '🛰', god: '🥇' };
  const DIFF_NAME = { normal: '普通', hard: '困难', hell: '地狱' };

  let view = { worldId: null, diff: 'normal' };
  let run = null;              // 进行中的关卡（与网页版同结构，落盘用）

  /* 世界图标：**能自绘的走矢量**（形状在 data.js 的 WORLD_ICONS 一处定义，本文件只负责画），
     没进表的退回这个世界自己的 emoji（`w.ico`）。V1.1.15 · 派单 I 第 2 条。
     颜色用默认字色（= #e9edf6）：格底是各族 tint，浅色描边在三档格底上都过对比度；
     族形角标那枚另有"按格底现算亮度"的取色（D.worldGlyphColor），两者分工不同、不要合并。 */
   /* 颜色由调用方按**状态**给（§九：普通＝偏冷灰白 / 选中与重要节点＝主题强调色 /
      已完成＝低饱和暖灰 / 锁定＝低亮度灰）。不传就退回正文色，老的观感不变。 */
   function worldIco(ico, cx, cy, size, color) {
     if (ico && typeof ico === 'object') { CV.drawIcon(ico, CV.ctx, cx, cy, size, color || CV.C.text); return; }
     CV.text(ico, cx, cy, { size: size, align: 'center', color: color || CV.C.text });
   }
  /* 一个世界该画什么：先问 WORLD_ICONS，没有才用它的 emoji / 主题兜底 */
  const icoOf = (w) => D.iconOpsOf('world', w.id) || w.ico || ICON[w.theme] || '⚔';

  /* ---------- 世界卡（网页版 .world-card：图标 52 / 标题 / 小字 / 右箭头） ---------- */
  /* ================= 派单 J（父亲大人 09-29）· 难度小标签（pill）=================
     世界卡名字后面挂「普通 / 困难 / 地狱」三枚 —— **有通关记录＝高亮，没有＝灰**。
     画法沿用这张卡原来那枚「已通关」标签的既有语言（描边圆角 ＋ tag 级字号），
     只换「边 ＋ 字」两色，**不新造第二套形状**（全仓九处 pill 都是这个写法）。 */
  const PILL = { h: 17, gap: 4, padH: 6 };
  const pillW = (label) => CV.measure(label, CV.FS.tag) + PILL.padH * 2 * CV.SCALE;
  function pill(x, cy, label, on) {
    const w = pillW(label);
    CV.round(x, cy - PILL.h * CV.SCALE / 2, w, PILL.h * CV.SCALE, CV.RADIUS_SM, null,
      on ? CV.C.doneLine : CV.C.line2);
    CV.text(label, x + w / 2, cy, { size: CV.FS.tag, align: 'center', color: on ? CV.C.gain : CV.C.dim });
    return w;
  }
  /* 本世界本难度**有没有通关记录**（`stages[diff]` 里存在 > 0 的关卡）。
     口径**只在这一个函数里**，两个消费方都读它：世界列表的三档标签、世界详情页的扫荡闸门。
     ⚠️ 它**不是** `Core.worldCleared`（那个是"12 关全清"，语义不同）—— 别拿它替换，也别在这里改判据。 */
  function diffReached(st, diff) {
    return !!(st && st.stages && st.stages[diff] && st.stages[diff].some((s) => s > 0));
  }
  /* 本世界本难度**是不是整档打穿**（12 关全通）—— 列表上那三枚难度标签的点亮判据。
     康康 2026-09-29（父亲大人纠正）：「我说的世界的三个难度标签，是**通关还难度 12 关才点亮**，
     你现在只要打了第一关就点亮了」⇒ 标签读这个（内部走逻辑层那一个出口 `Core.worldCleared`），
     **不是** `diffReached`（那个是"有通关记录"）。两者用途不同、都必须留着：
       · `diffReached`（任一关通过）→ 世界详情页的**扫荡闸门**（打过一关就该能扫）；
       · `diffAllCleared`（12 关全通）→ 列表三枚难度标签的**点亮**。 */
  function diffAllCleared(worldId, diff) {
    return !!(Core.worldCleared && Core.worldCleared(worldId, diff));
  }
  /* bg：格底色。V1.0.1 起由数据层的 D.worldTint(世界id) 给（五族色相 × 族内明度阶梯），
     网页版同一串颜色内联到 .world-ico 上；不传就退回旧底色（转生门那张、以及 ♾ 深井格）。 */
  /* tags：`[{ t: '普通', on: true }, …]`（不传 / 空数组＝这张卡没有标签，深井与转生门就是） */
  /* `state`：世界图标的**状态档**（2026-10-01 §九）——idle / current / done / locked。
     不传就按 `dim` 推（锁定 vs 普通），保证老调用点观感不变。 */
  function worldCard(icon, title, sub, tags, id, dim, bg, theme, state) {
    const top = U.y;                         // 网页版 .world-card 实测 82（图标 52 + 上下内边距 14）
    const x = U.pad(), w = U.cw();
    /* 2026-10-01（§六）：图标格 52 → 60、图标 24 → 36 —— 让**图标成为世界卡的视觉锚点**
       （`[大图标] [世界名/进度/难度] [箭头]`），而不是"一个小 icon + 一大段字"。 */
    const box = 60 * CV.SCALE;
    const tx = x + 12 * CV.SCALE + box + 12 * CV.SCALE;   // 文字块左沿（图标格右边 12）
    const tw = CV.measure(title, CV.FS.f1, true);
    const tgs = tags || [];
    /* 标签默认跟在**世界名后面**（父亲大人的原话）。
       装不下就**整排换到名字下面** —— 名字永远完整画出来，绝不为了塞标签把它截断（320 小屏的保底）。 */
    const tgsW = tgs.length
      ? tgs.reduce((a, t) => a + pillW(t.t), 0) + (tgs.length - 1) * PILL.gap * CV.SCALE : 0;
    const inline = !!tgsW && (tx + tw + 8 * CV.SCALE + tgsW <= x + w - 16 * CV.SCALE);
    /* V9.6.127（父亲大人："世界名和进度的小字得作为一个整体，去居中对齐前面的图标；
       你现在看文字是偏上的"）：
       网页版是 flex + align-items:center，标题与小字**作为一个整体**自动居中；
       画布这边原来把它们分别钉在 top+24 / top+46，整块的中心在 34 左右、而图标中心在 41 → 偏上 7px。
       现在先算整块高度（标题行 ＋ 标签行 ＋ 小字行），再以**卡片中线**为中心上下摊开。 */
    const T1 = CV.FS.f1 * 1.3, T2 = CV.FS.sm * 1.55, TG = PILL.h * CV.SCALE;
    const rows = [T1];
    if (tgsW && !inline) rows.push(TG);
    rows.push(T2);
    const gap = 2 * CV.SCALE;
    const blockH = rows.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
    const h = Math.max(82 * CV.SCALE, blockH + 20 * CV.SCALE);   // 82 是网页版 .world-card 的原高（上下各 15 净空）
    /* 未解锁的世界：整张卡压暗（网页版 .world-card 加了 opacity:.45），不只是标题变灰 */
    if (dim) CV.ctx.globalAlpha = 0.45;
    CV.card(x, top, w, h);
    /* §五：**不再按世界主题铺卡片底色**（36 种彩底像"彩色地图按钮"，与正式场景图不搭）。
       统一走中性表面色（深炭黑/冷灰黑），层级差只靠 `panel3` / `panel2` 那一档 ——
       主题色只留给**图标、选中、重要节点**用。 */
    CV.round(x + 12 * CV.SCALE, top + (h - box) / 2, box, box, CV.RADIUS,  bg || CV.a(CV.C.panel3, .50), CV.C.line);
    worldIco(icon, x + 12 * CV.SCALE + box / 2, top + h / 2, CV.AICO.world * CV.SCALE,
      CV.worldIconColor(theme, state || (dim ? 'locked' : 'idle')));
    /* 右上角的族形（五族形状语言）：与格底色相构成"色 + 形"双重编码。
       顶点表与网页版同一份（D.FACTION_GLYPH），别在这儿另画一套形状。 */
    const gs = 12 * CV.SCALE;
    if (theme && D.FACTION_GLYPH[theme]) {
      /* 形状换成正式资产（`CV.themeGlyph` 优先 `ico_theme_*`，缺图回落老顶点表）；
         **颜色仍走 `D.worldGlyphColor`** —— 那是"按当前格底现算亮度"的对比度色，
         是功能性的（V1.1.2 定的：对本格底 ≥3:1），不能拿主题色顶掉它。 */
      CV.themeGlyph(theme,
        x + 12 * CV.SCALE + box - 3 * CV.SCALE - gs, top + (h - box) / 2 + 3 * CV.SCALE,
        gs, D.worldGlyphColor(theme));
    }
    const blockTop = top + (h - blockH) / 2;
    const titleCy = blockTop + T1 / 2;
    CV.text(title, tx, titleCy, { size: CV.FS.f1, bold: true });
    if (tgsW) {
      /* 排在名字后面那一版：与标题**同一行**（cy ＝ titleCy）；
         换行那一版：单独占一行，落在标题行下面。 */
      const cy = inline ? titleCy : blockTop + T1 + gap + TG / 2;
      let px = inline ? tx + tw + 8 * CV.SCALE : tx;
      tgs.forEach((t) => { px += pill(px, cy, t.t, t.on) + PILL.gap * CV.SCALE; });
    }
    CV.text(CV.fit(sub, w - (tx - x) - 30 * CV.SCALE, CV.FS.sm), tx, blockTop + blockH - T2 / 2,
      { size: CV.FS.sm, color: CV.C.dim });
    CV.text('›', x + w - 14 * CV.SCALE, top + h / 2, { size: CV.FS.f1, color: CV.C.dim, align: 'right' });
    if (dim) CV.ctx.globalAlpha = 1;
    if (id) CV.hit(id, x, top, w, h);
    U.y = top + h + CV.SP[2];          // 网页版 .card 的 margin-bottom = sp3(14)
    return h;
  }

  /* ================= ① 世界列表 ================= */
  CV.register('dungeon', function () {
    const S = Core.S;
    U.begin();
    /* 继续上次探索（只有存档里有未打完的进度才画，和网页版一致） */
    const pr = S.pendingRun;
    if (pr && pr.worldId && pr.waves) {
      const w = D.WORLDS.find((x) => x.id === pr.worldId);
      U.card(function () {
        U.h3('继续上次探索', (w ? w.name : pr.worldId) + ' · 第 ' + pr.stage + '/12 关 · 第 ' +
          Math.min((pr.wave || 0) + 1, (pr.waves || [1]).length) + '/' + (pr.waves || [1]).length + ' 波');
        U.space(CV.SP[1]);
        U.btnRow([
          { label: '继续探索', style: 'primary', id: 'dun_resume' },
          { label: '放弃这一轮', style: 'ghost', id: 'dun_drop' },
        ]);
      });
    }
    /* 深井挑战：同样"没解锁就不显示"（父亲大人：还没解锁的地图先隐藏，解锁了再出现） */
    const corridorLocked = !Core.isUnlocked('corridor');
    if (!corridorLocked) {
      U.sectionTitle('深井挑战');
      /* V9.6.24（父亲大人）：去掉终局挑战标签与历史最高 —— 深井是一直往上打的、没有重置，
         所以历史最高这个概念本身就不成立。 */
      worldCard('♾', '深井', '当前第 ' + S.corridor.floor + ' 层', null, 'open_corridor', false);
    }
    /* 残域：**只列已解锁的世界**（V9.6.2 父亲大人："还没解锁的地图就别显示，等解锁了再显示"）——
       以前把 20 个全列出来、未解锁的压暗加锁，一屏全是"🔒 通关上一世界解锁"，既没用又碍眼。
       ---- 派单 J（父亲大人 09-29）：**列表倒序**，最新的排最上面（深井 → W03 → W02 → W01）----
       「倒序」**只在这一处定义**：世界详情页 / 关卡格 / 扫荡页一律按 `D.WORLDS` 的原序取世界，
       谁也不许再按 id 排一遍 —— 免得"列表倒序、点进去正序"两套口径打架。
       排序**显式按 id 比**（不靠 `D.WORLDS` 现在的排布）：数据层哪天重新排过也不会跟着乱。
       ⚠️ 深井是**独立页**（`corridor`，从灯阁进），它上面那张卡是"深井挑战"单独一节、
          **不属于这份列表**，所以这次排序不碰它（父亲大人那句是在举例说顺序，不是要求并进来）。 */
    const worldList = D.WORLDS.filter((w) => S.worlds[w.id] && S.worlds[w.id].unlocked)
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    U.sectionTitle('残域（' + worldList.length + '/' + D.WORLDS.length + '）');
    worldList.forEach((w) => {
      const st = S.worlds[w.id];
      const unlocked = true;
      const prog = st.stages.normal.filter((s) => s > 0).length;
      /* 三档难度标签（父亲大人 09-29，**09-29 二次纠正**）：
         **该难度 12 关全通＝高亮，没全通＝灰** —— 一眼看出哪张图把哪几档**打穿了**。
         （他原话：「我说的世界的三个难度标签，是**通关还难度 12 关才点亮**，
           你现在只要打了第一关就点亮了」——第一版按"有通关记录"点亮，是理解错了。）
         状态一律读 `diffAllCleared`（本文件里唯一的判定，内部走 `Core.worldCleared`），
         不在这儿再写一遍 `every(s > 0)`。
         「已通关」（普通 12/12）那枚独立标签**撤掉了** —— 它的信息在下面小字里本来就有
         （全清时小字正是「进度 12/12」），三枚标签的位子留给难度（320 上四个标签挤不下）。 */
      worldCard(icoOf(w), w.name,   // V9.6.127：每个世界自己的图标（data.js），主题图标只兜底
        unlocked ? ('进度 ' + prog + '/12 · ' + String(w.mechanic).split('：')[0]) : '🔒 通关上一世界解锁',
        D.DIFFICULTY.map((d) => ({ t: d.name, on: diffAllCleared(w.id, d.id) })),
        /* 底色：§五 —— 不再用 `D.worldTint(w.id)`（按主题生成的 36 种彩底），
           统一中性表面；主题色只在图标与族形上出现。 */
        'w:' + w.id, false, CV.a(CV.C.panel3, .50), w.theme,
        /* 世界图标的状态（§九）：这张图**普通档 12 关全通**＝已完成（低饱和暖灰），
           否则＝普通（偏冷灰白）。"选中/重要节点"这两档在世界详情页与 Boss 关用。 */
        diffAllCleared(w.id, 'normal') ? 'done' : 'idle');
    });
    /* 转生门：门后那一张要显示出来（跟网页版同一口径）。
       "没解锁的不显示"说的是**还没走到**的世界；转生门是"走到了、过不去"，
       藏起来玩家就不知道下一步在哪 —— 这是 V9.6.76 加的，两边保持一致。 */
    const nextLocked = D.WORLDS.find((w) => !(S.worlds[w.id] && S.worlds[w.id].unlocked));
    const gateNeed = nextLocked ? Core.worldReincarnNeed(nextLocked.id) : 0;
    if (gateNeed) {
      worldCard('🔒', nextLocked.name,
        '需要转生 ' + gateNeed + ' 次才能进入 · 当前 ' + (S.player.reincarnations || 0) + ' 次',
        null, 'w:' + nextLocked.id, true);
    }
  });

  /* ================= ② 世界详情 ================= */
  CV.register('world', function () {
    const S = Core.S;
    const w = D.WORLDS.find((x) => x.id === view.worldId);
    if (!w) { U.begin(); U.card(function () { U.h3('残域'); U.hint('这个世界不存在', 6 * CV.SCALE); }); return; }
    const st = S.worlds[w.id];
    const diff = view.diff;
    U.begin();
    /* 返回世界列表 —— 父亲大人 09-27 深夜（派单 Z-B）：标题 + 返回**吸顶**
       （原来只有一颗「‹ 返回世界列表」，滚到下面就得先滑回顶上才点得到）。 */
    U.pageHead(w.name, { backId: 'dun_back' });
    // 世界卡
    U.card(function () {
      /* V1.0.1：头部换成"族色图标格 + 世界名"（和列表页世界卡同一套视觉语言）。
         同一个世界在列表页和详情页必须看到**同一个色、同一个形** ——
         列表页上了色、点进去又变回纯文字，看着像两套界面。
         几何与 worldCard() 里那段一致（52 的格子在这里缩到 40，因为详情页头部比列表矮一档）。 */
      /* 详情页头同样中性底 + 更大的图标（§六：容器 40 → 50、图标 32） */
      const box = 50 * CV.SCALE, top = U.y, x = U.ix();
      CV.round(x, top, box, box, CV.RADIUS, CV.a(CV.C.panel3, .50), CV.C.line);
      /* 详情页这一格＝"你正在看的世界" ⇒ 状态 `current`（主题强调色） */
      worldIco(icoOf(w), x + box / 2, top + box / 2, CV.AICO.worldSm * CV.SCALE,
        CV.worldIconColor(w.theme, 'current'));
      const gs = 11 * CV.SCALE;
      if (D.FACTION_GLYPH[w.theme]) {
        /* 角标亮度按**本格格底**现算（对本格底 ≥3:1 · V1.1.2）—— worldId 一定要传 */
        CV.themeGlyph(w.theme, x + box - 3 * CV.SCALE - gs, top + 3 * CV.SCALE,
          gs, D.worldGlyphColor(w.theme, w.id));
      }
      CV.text(CV.fit(w.name, U.iw() - box - 12 * CV.SCALE, CV.FS.f1, true),
        x + box + 10 * CV.SCALE, top + box / 2, { size: CV.FS.f1, bold: true, ls: 0.2 });
      U.y = top + box + 10 * CV.SCALE;
      U.note(w.desc, 2 * CV.SCALE);                 // 网页版这一行是 0.75rem（12px）
      U.space(CV.SP[2]);                            // V9.6.122：网页版 .kv mt2 = 10（原来 4，太挤）
      U.kv('世界机制', w.mechanic, CV.C.accent);     // 整句照抄，别只留冒号前半截
      U.kv('守关 Boss', w.boss);
    });
    // 难度页签
    /* V1.0.5（UI 设计师 1.0.2 复审 · 两端对表第 4 条）：三态照网页版 .diff-tabs。
       网页版那颗按钮是 `class="btn small [active]"`，所以：
         · 未选中 = **.btn 默认底**（panel2 底 + line2 边），不是透明 ghost；
         · 选中   = .diff-tabs .btn.active（**panel3 暗底 + 金边 + 金字**）——
                    小游戏原来画成金底白字，那是"花资源/危险"那套按钮的样子（基准 §2.3）。
         · 禁用   = .btn[disabled]（**保住底和边**，整块压到 0.34），不是"透明只描一条线"。
       字号也一并对齐：.btn.small 是**四级 12px**，原来这里写的 lg(13px) 是编外的一档。 */
    const tabs = D.DIFFICULTY.map((d) => ({
      /* V1.1.6（A5 · 《总落地清单》A5 行）：**难度按钮去乘数** ——
         原来这里拼的是 `困难 ×1.8 / 地狱 ×3.2`，那个数是**敌人强度倍率**（`D.DIFFICULTY[].mult`），
         对玩家没有决策价值：他只需要知道"这一档更难、奖励更多"，不需要看引擎内部乘了几倍；
         而且那个数还会让人误以为"战力乘 1.8 就能打困难"（其实敌人 HP/攻击/防御各乘各的）。
         现在只留难度名（数值一个字没动，只改显示）。
         ⚠️ 网页版 `.diff-tabs` 那三颗**还带着** `×N`（`ui.js` 里那句模板没改，本轮"网页版界面一个字不动"）
            → 这一处成了**有意的两端差异**，与 A1/A2 那三处一起记进回单，下次动网页版时抹平。 */
      label: d.name,
      key: d.id,                                        // 选中判定用**难度键**；
      id: 'diff:' + d.id,
      disabled: d.id !== 'normal' && !Core.worldCleared(w.id, d.id === 'hard' ? 'normal' : 'hard'),
    }));
    {
      const gap = 6 * CV.SCALE, h = U.BTN_SM * CV.SCALE;
      const cw = (U.cw() - gap * (tabs.length - 1)) / tabs.length;
      const top = U.y;
      tabs.forEach((t, i) => {
        const x = U.pad() + i * (cw + gap);
        /* 选中判定必须比**难度键**：t.id 是热区号（'diff:normal'），拿它跟 diff（'normal'）比
           永远不相等 —— 那一版会让"选中态"整条消失（三颗都画成默认底），
           模拟器上已经照出来过（截图 08-残域-世界详情，普通那颗没有金边金字）。 */
        const on = diff === t.key;
        const label = CV.fit(t.label, cw - 16 * CV.SCALE, CV.FS.md);
        if (t.disabled) {
          CV.ctx.save();
          CV.ctx.globalAlpha = 0.34;                      // .btn[disabled] opacity:.34
          CV.round(x, top, cw, h, CV.RADIUS_SM, CV.a(CV.C.panel2, .50), CV.C.line2);
          CV.text(label, x + cw / 2, top + h / 2, { size: CV.FS.md, align: 'center', color: CV.C.text });
          CV.ctx.restore();
        } else if (on) {
          CV.round(x, top, cw, h, CV.RADIUS_SM, CV.a(CV.C.panel3, .50), CV.C.gold);
          CV.text(label, x + cw / 2, top + h / 2, { size: CV.FS.md, align: 'center', color: CV.C.gold });
          CV.hit(t.id, x, top, cw, h);
        } else {
          U.btn(x, top, cw, h, t.label, null, t.id);      // style=null → .btn 默认底（panel2 + line2）
        }
      });
      U.y = top + h + 12 * CV.SCALE;                // V9.6.122：网页版 .diff-tabs margin-bottom = 12（原来 4）
    }
    // 12 个关卡格（4 列）
    {
      const gap = 8 * CV.SCALE, cols = 4;
      const cw = (U.cw() - gap * (cols - 1)) / cols;
      const top = U.y;
      /* V9.6.70：整片关卡格登记一颗**组锚点** —— 引导要指"这一关"但那一关还没解锁时，
         退而指整片格子（总比弹一张"不知道指哪"的卡强）。 */
      CV.hit('stage_grid', U.pad(), top - 4 * CV.SCALE, U.cw(), cw * 3 + gap * 2 + 8 * CV.SCALE);
      for (let i = 0; i < 12; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const x = U.pad() + c * (cw + gap), y = top + r * (cw + gap);
        const unlocked = Core.stageUnlocked(w.id, diff, i);
        const stars = st ? st.stages[diff][i] : 0;
        const isBoss = i === 11;
        /* V9.6.122（父亲大人："残域的世界排版也有问题"）：照网页版补齐两件事 ——
           ① 精英关右上角要挂 ⚔ 角标（wg 用 wavePlan 判，和网页版同一份数据）；
           ② 格子里字号统一走层级：网页版 .stage-cell 是 **二级 15px**、整格粗体
              （我上一版把守关格写成 20px 反而更偏了）。 */
        const isElite = !isBoss && Dun.wavePlan(i + 1).indexOf('elite') >= 0;
        const done = stars > 0;
        /* ================= V1.1.15（2026-09-27 · 派单 I 第 1 条「320 挤压/顶格」）=================
           320 上格子是 68×68（(296−24)/4），而星标原来钉在 `y + cw − 14` ——
           「数字＋星标」这一组下沿只剩 5.75px、上沿却有 16px：复审里那条
           「★★★ 贴到格子下沿（顶格）」说的就是这个（格子矮、字号不变，只能从**站位**上还）。
           窄格（≤72）改成"数字与星标**作为一个整体在格子里居中**"；宽格一格不动
           —— 复审只点了 320，390/430 那两档的星级站位保持原样（父亲大人"别改没毛病的地方"）。
           证据：验收截图 …/三机型对照/06-世界详情-困难.png（三档并排）。 */
        const narrowCell = cw <= 72 * CV.SCALE;
        const numCy = narrowCell ? y + cw / 2 - (stars ? 8.25 * CV.SCALE : 0)     // 窄格：两组整体居中
          : y + cw / 2 - (stars ? 7 * CV.SCALE : 0);                              // 宽格：原口径
        const starCy = narrowCell ? numCy + 18.5 * CV.SCALE : y + cw - 14 * CV.SCALE;
        CV.ctx.globalAlpha = unlocked ? 1 : 0.3;
        CV.round(x, y, cw, cw, CV.RADIUS,  done ? CV.C.doneBg : CV.a(CV.C.panel2, .50),
          done ? CV.C.doneLine : (isBoss ? CV.C.accent : CV.C.line));
        CV.text(isBoss ? '🔱' : String(i + 1), x + cw / 2, numCy,
          { size: CV.FS.f1, bold: true, align: 'center', color: isBoss ? CV.C.accent : CV.C.text });
        if (isElite) CV.text('⚔', x + cw - 5 * CV.SCALE, y + 10 * CV.SCALE,
          { size: CV.FS.tag, align: 'right', color: CV.C.dim });   // .sc-mark：右上角、五级、85% 不透明度
        if (stars) CV.text('★'.repeat(stars), x + cw / 2, starCy, { size: CV.FS.tag, color: CV.C.gold, align: 'center', ls: -1 });
        CV.ctx.globalAlpha = 1;
        if (unlocked) CV.hit('stage:' + i, x, y, cw, cw);
      }
      U.y = top + 3 * cw + 2 * gap;
    }
    /* V9.6.122：网页版关卡格下面有一行图例（hint mt2）——小游戏这边原来**没有**，
       玩家看不出 ⚔ / 🔱 是什么意思。文案照网页版原样。 */
    U.hint('⚔ 精英关（更硬、掉得更好）· 🔱 守关 Boss（打完开下一个世界）', 10 * CV.SCALE);
    // 扫荡
    /* 扫荡闸门与列表里那三枚难度标签**同一个判据**（`diffReached`，本文件唯一一处）——
       原来这里是内联的 `st.stages[diff].some(s => s > 0)`，现在收口，别处不许再写一遍。 */
    const canSweep = diffReached(st, diff);
    if (canSweep) {
      U.space(CV.SP[1]);
      const left = Core.sweepLeft();
      U.btnRow([{
        label: '⏩ 扫荡（可选关卡 · 今日剩余 ' + left + '/' + Core.sweepCap() + ' 次）',
        style: 'ghost', id: 'sweep_open', dis: left <= 0,
      }]);
      /* ================= V1.1.8（乙组 B6 · 扫荡 +10）=================
         父亲大人的口径：**3 次/天**，每次 **+10 次扫荡、全额结算**（点数/结晶/装备/神话/材料一个不少）；
         【定】**只对已通关的关卡** —— 这一段本来就在 `if (canSweep)` 里（本世界本难度有通关记录才画），
         所以"只对已通关"是**位置保证**的，不需要再判一次。
         那 10 次记在 `S.sweep.adBonus`（**与日上限分开的一本账**，见 core.sweepLeft 的注释）：
         它不挤占"今日基础 10 次"，跨天清零 —— 否则"买来的次数用不掉"等于没给。 */
      const AD = G.AD;
      if (AD && AD.show) {
        /* ================= 2026-10-01（§十五/§十六）· 广告按钮**只读统一状态** =================
           原来这里自己算 `AD.left('sweep_plus')`，于是出现过"点位还剩 1 次、全局 20 次已用完"
           ⇒ UI 写「今日还剩 1 次」、点下去回「今天看广告的次数用完了」。
           现在文案与禁用态**都来自 `AD.status('sweep_plus')`**（它同时看点位、总闸、弱网）。
           （父亲大人本轮已把全局总闸改成不限次数，所以这条矛盾从根上没了；
             但状态口留着 —— 以后任何一处配额变化，UI 都自动跟着变，不会再各算一套。） */
        const adSt = AD.status ? AD.status('sweep_plus') : { ok: (AD.left ? AD.left('sweep_plus') : 0) > 0, text: '' };
        const adTail = AD.quotaText ? AD.quotaText('sweep_plus') : '';
        U.space(CV.SP[1]);
        U.btnRow([{
          label: '📺 看广告 · 扫荡 +10 次' + adTail,
          style: 'ghost', id: adSt.ok ? 'ad_sweep_plus' : '', dis: !adSt.ok,
        }]);
      }
    }
    /* ================= 本章剧情 · **主叙事入口**（2026-10-01 二轮重做） =================
       父亲大人原话：「世界页现在把剧情当功能菜单……[进入][战前][残响][Boss] 这种四颗平铺按钮
       会让玩家觉得"我要选择看哪一段剧情"，而不是"我正在经历一个事件"」，要求换成**一个主入口**，
       并按下头三档动态显示：全部没看→「发现新线索」／看了一部分→「继续故事 · 还差 N 段」／
       全看完→「重读本章」。
       · 四颗平铺按钮**已删**（`visual_story_audit` 会盯着这条）；
       · 「残响」**不再有入口** —— 它已经改成战斗内自动播（见 sc-battle 的残响层）；
       · `in` / `pre` 也都不靠这里：分别在"第一次进世界"和"Boss/精英开打前"自动触发（见下面两处）。
         所以这颗按钮的真实职责是"补看 + 重读"，不再承担"开剧情"这件事。
       ⚠️ 仍必须排在**页尾**：本页主动线是"选难度 → 点关卡 → 开打"，
         插在前面会把难度页签和关卡格整片挤下首屏（`uiw` 对屏外卡只量不画，eqdetail 上实测过）。 */
    {
      const St = G.Story;
      if (St && St.hasStory && St.hasStory(w.id)) {
        const SDw = (G.STORYDATA && G.STORYDATA.WORLDS && G.STORYDATA.WORLDS[w.id]) || {};
        U.card(function () {
          const un = St.unreadEntries(w.id);
          U.h3('本章', '《' + (SDw.title || '') + '》');
          U.note('场景：' + St.sceneName(St.sceneOf(w.id)));
          U.space(CV.SP[1]);
          U.btn(U.ix(), U.y, U.iw(), U.BTN_H * CV.SCALE, St.entryLabel(w.id),
            un > 0 ? 'primary' : 'ghost', 'story_main:' + w.id);
          U.y += U.BTN_H * CV.SCALE;
          U.hint('故事会自己发生：进图、开打、打完，都不用先来这里点。', 6 * CV.SCALE);
          U.space(CV.SP[1]);
          U.btn(U.ix(), U.y, U.iw(), U.BTN_SM * CV.SCALE, '打开卷宗', 'ghost', 'story_archive');
          U.y += U.BTN_SM * CV.SCALE;
        });
      }
    }
  });

  /* ================= ③ 扫荡（选关卡 + 选次数，照网页版 sweepModal） ================= */
  let sweepSel = 11;
  /* ================= V1.1.9（丙组 · 结算胶囊的唯一一处）=================
     把"结算拿到了什么"拼成胶囊文案 —— **战斗结算与扫荡结算共用这一个函数**（父亲大人：
     「现在扫荡的结算不行，里面还有乱码，**可以像战斗结算那样展示**」）。
     两条结构性保证（那串"乱码"就是从这里漏出去的）：
       · 货币一律查 `D.CURRENCIES` 拿**图标**（`◉/◆/✦/…`），**不拿内部键**（`points`/`otherworld` 拼不上屏）；
       · 道具一律查 `D.ITEMS` 拿**它自己的 icon 与名字**（V1.0.6 口径：不许一律画背包图标）。 */
  function rewardChips(got) {
    return (got || []).map(function (x) {
      /* V1.1.15：装备格满时装备会进「📮 待领箱」（不折现、不丢）——标出来，
         否则玩家看到"掉了这件"、回背包没有，又要当 bug 报。 */
      if (x.k === 'equip') return '🗡 ' + ((x.v && x.v.name) || ('装备×' + (x.n || 1))) + (x.stashed ? ' 📮' : '');
      if (x.k === 'exp') return 'EXP+' + x.v;
      if (x.k === 'item') {
        const it = D.ITEMS[x.v] || {};
        const n = x.n || 1;
        /* V1.1.15（2026-09-27 · 父亲大人："待领箱有 bug"）：
           背包满时掉落**进待领箱而不是蒸发**（dungeon.js 的 `dropItem` 统一出口）。
           结算页必须**说出来**——否则玩家看到"掉了 3 件"、回背包一件没多，还是会当成 bug 报。
           标一个 `📮`（待领箱那个符号）：既没进包也没丢，去背包页一键领回。 */
        return (it.icon || '🎒') + ' ' + (it.name || x.v) + (n > 1 ? '×' + n : '') + (x.stashed ? ' 📮' : '');
      }
      /* V1.1.15：装备格满导致的"强制折现"要说明原因（`bagFull` 由 dungeon 的掉落带过来）——
         不然玩家只看到一串 ◆，以为装备没掉。 */
      return curIcon(x.k) + '+' + x.v + (x.bagFull ? '（装备格满·已折现）' : '');
    });
  }
  function curIcon(k) { const m = (D.CURRENCIES || []).find((c) => c.id === k); return (m && m.icon) || '◈'; }
  /* V1.1.9（丙组）：把胶囊拼法**挂出去一份**（`G.rewardChips`）——
     尺子（`page_text_audit`）要拿"真代码"验"结算页不许漏内部键名"，
     不许自己再抄一份（抄一份就等于验的是抄件，不是交付物）。 */
  G.rewardChips = rewardChips;
  CV.register('sweep', function () {
    const S = Core.S;
    /* V9.6.70：这一页是从世界页推上来的（view.worldId 一定有值），但**代码不能假设**——
       page_smoke 单独渲染这一页时 view.worldId 是空的，原来直接读 w.id 就崩。
       真机上如果哪天从别处进来，同样会崩；这里给个兜底。 */
    const w = D.WORLDS.find((x) => x.id === view.worldId) || D.WORLDS[0];
    const diff = view.diff;
    const arr = (S.worlds[w.id] && S.worlds[w.id].stages[diff]) || [];
    const cleared = arr.map((s, i) => ({ s, i })).filter((x) => x.s > 0);
    U.begin();
    U.pageHead('扫荡', { backId: 'sweep_back' });   // 吸顶（父亲大人 09-27 深夜 · 派单 Z-B）
    U.card(function () {
      U.h3('扫荡', w.name + ' · ' + DIFF_NAME[diff]);
      U.kv('今日剩余次数', Core.sweepLeft() + ' / ' + Core.sweepCap());
      U.space(CV.SP[1]);
      U.hint('选择扫荡关卡（已通关的）', 2 * CV.SCALE);
      const gap = 8 * CV.SCALE, cols = 4;
      const cw = (U.cw() - gap * (cols - 1)) / cols;
      const top = U.y + 4 * CV.SCALE;
      cleared.forEach((x, k) => {
        const r = Math.floor(k / cols), c = k % cols;
        const bx = U.pad() + c * (cw + gap), by = top + r * (cw + gap);
        const sel = x.i === sweepSel;
        CV.ctx.globalAlpha = 1;
        CV.round(bx, by, cw, cw, CV.RADIUS,  sel ? CV.C.doneBg : CV.a(CV.C.panel2, .50), sel ? CV.C.gold : CV.C.line);
        CV.text(String(x.i + 1), bx + cw / 2, by + cw / 2 - 6 * CV.SCALE, { size: CV.FS.f1, bold: true, align: 'center', color: sel ? CV.C.gold : CV.C.text });
        /* 扫荡页用的也是网页版的 .stage-cell（星级 .st 是**五级 11px**）——
           和世界详情页同一处漂移，只是复审表格里没列到这一屏。 */
        CV.text('★'.repeat(x.s), bx + cw / 2, by + cw - 13 * CV.SCALE, { size: CV.FS.tag, color: CV.C.gold, align: 'center', ls: -1 });
        CV.hit('ssel:' + x.i, bx, by, cw, cw);
      });
      const rows = Math.ceil(cleared.length / cols);
      U.y = top + rows * cw + (rows - 1) * gap;
      U.space(CV.SP[1]);
      U.space(CV.SP[2]);
      U.btnRow([
        { label: '扫荡 ×1', style: 'ghost', id: 'sweep_1' },
        { label: '扫荡 ×5', style: 'ghost', id: 'sweep_5' },
        { label: '扫荡 ×10', style: 'ghost', id: 'sweep_10' },
        { label: '全部剩余', style: 'primary', id: 'sweep_all' },
      ], 6 * CV.SCALE);
    });
  });

  /* ================= ④ 一关一口气打到底（照网页版 startRun / fightWave） ================= */
  function startStage(worldId, diff, stageIdx) {
    const S = Core.S;
    const stage = stageIdx + 1;
    /* R1.7：开打前**再预热一次**这一场的场景（世界页那次可能还没好，或者玩家是从别处进来的） */
    if (G.Story && G.Story.preloadWorld) G.Story.preloadWorld(worldId);
    /* ================= 开打前：把**压在世界页上面的剧情层**收掉 =================
       战斗页的"由来路还原"记的是**入口那一刻的整条栈**（`B.back.stack`）。如果入口时
       世界页上面还压着一层剧情（`in` 是"第一次进世界自动播"、`pre` 是"Boss 战前自动播"），
       打完返回就会落回**剧情页**而不是世界页 —— audit_routes 的 ①②⑥ 当场四条报红（实测）。
       正常操作走不到这里（剧情页盖着时点不到关卡格），但"直接派发 stage:*"这一类路径会；
       两条路必须落到同一个结果上，所以在这里收口。
       ⚠️ 只收 `story` 这一层：其它页面（世界页本身 / 残域列表）一律不许动。 */
    while (CV.stack.length > 1 && CV.top().name === 'story') CV.stack.pop();
    run = {
      worldId, diff, stage, stageIdx,
      /* F6（R6 #10）：**worldId 必须传** —— `wavePlan(stage, worldId)` 按世界定波数
         （W01 一波 / W02 两波 / W03 起固定三波，V1.0.1 父亲大人的原话）。
         原来这里不传 → `wi = -1` → 永远走"兜底 3 波"，
         于是新手第 1 关也是 3 波（1 只怪 ×3），而奖励仍按"关"发一次：
         时长与阵亡风险 ×3、收益不变，与 EASE 注释里"第 1 关落在 2~3 回合"的定调相冲。 */
      waves: Dun.wavePlan(stage, worldId), wave: 0, hpPct: {}, kills: 0, deaths: 0,
    };
    S.party.filter(Boolean).forEach((id) => { run.hpPct[id] = 1; });
    Core.setPendingRun(run);
    fightWave();
  }

  /* F2-4（抢修单 0928R3）：结算后两颗按钮的目标**各记各的** ——
     原来只有一份 `afterSettle`，「再来一次」（重打本关）先写进去、紧接着被「下一关」覆盖，
     于是「↻ 再来一次」实际进的是下一关（想刷本关刷不到）。 */
  let againTarget = null, nextTarget = null;
  /* F2-1（抢修单 0928R3）：onEnd 的**兜底面板** —— 任何一条没走通的路径都必须返还一个
     能点、能退出的面板。onEnd 一抛，`finish()`（sc-battle.js）跟着抛 → 结算面板画不出来、
     busy 闸门不放 → 玩家卡死在战斗页上（上一轮探针抓到的 `reading 'wave'` 就是这么卡住的）。 */
  function lastResortPanel(win) {
    return {
      title: win ? '这一场已结束' : '战斗失败',
      sub: win ? '结算数据不在了 · 先回世界' : '先练一练，再来。',
      rewards: [],
      acts: [{ label: '返回世界', style: 'ghost', id: 'battle_close' }],
    };
  }
  function clearSettleTargets() { againTarget = null; nextTarget = null; }
  function settleRun(res, hpLeft) {
    const S = Core.S;
    const wid = run.worldId, df = run.diff, si = run.stageIdx, stage = run.stage;
    const kind = run.waves[run.waves.length - 1];
    const isBoss = kind === 'boss';
    /* 奖励与统计口径**逐条对齐网页版 doFinalBattle**（经验 ×2 进伙伴池、玩家吃一半、battleSettle 计一场） */
    const g = Dun.grantRewards(wid, df, stage, kind);
    Core.addCharExp(S.party.filter(Boolean), g.rewards.exp * 2);
    Core.addPlayerBattleExp(g.rewards.exp);
    Core.battleSettle({}, true, isBoss);
    /* 星级：1 星保底；**整关**无人阵亡 +1；决战回合 ≤20 再 +1
       F6（R6 #7）：`run.deaths` 原来**从没被写入过**（`deaths: 0` 是它唯一的赋值点），
       于是"无人阵亡"这一颗星只看**最后一波**的 hpLeft —— 第 1/2 波死掉的人不在最后那一波名单里，
       白送 1 星，而且 Math.max 写进档后**不会降**。现在 `deaths` 在波与波交界处累加
       （见下面 onEnd 的 win 分支），这里只看它。
       F8 ⓪-b（父亲大人 09-28：「**复活过的……不算无人阵亡**」）：这一场用过复活
       （账本 `run.revived`，由战斗页的 `battleRevive` 写）⇒ 已经有人倒地过，
       那一颗星不许再给 —— 否则"全队死光 → 看广告满血复活 → 通关"照样拿"无人阵亡"。
       ⚠️ `run` 在这条判完之前**不能**置空（下面 `run = null` 在它之后）。 */
    const revivedThisRun = !!(run && run.revived);
    const anyDead = revivedThisRun || (run.deaths || 0) > 0
      || Object.keys(hpLeft || {}).some((k) => hpLeft[k] <= 0);
    const stars = 1 + (anyDead ? 0 : 1) + (res.rounds <= 20 ? 1 : 0);
    const comp = Core.stageComplete(wid, df, si, stars);
    Core.clearPendingRun();
    /* ================= V1.0.4 · R1 / R9（父亲大人 09-27 点单）=================
       R1「战斗结算（关卡、胜负）」的**关卡那一半**在这里（世界 / 难度 / 第几关 / 是不是守关 Boss）；
       R9 的 `dungeon_clear`（通关）事件也在这一处发 —— 一个事件名、四个短字段，
       **没有账号、没有存档内容**。扫荡那次通关不经过这里（它走下面独立的结算路径），
       所以这一条的口径是"**手打到通关**"，后台看漏斗时就按这个读。 */
    try {
      if (G.LOG) {
        G.LOG.info('battle', 'clear', { world: wid, diff: df, stage: si + 1, kind: isBoss ? 'boss' : 'stage' });
        G.LOG.event('dungeon_clear', { world: wid, diff: df, stage: si + 1, tier: isBoss ? 'boss' : 'stage' });
      }
    } catch (e) {}
    /* 奖励胶囊文案：**只有这一处**（V1.1.9 起战斗结算与扫荡结算共用）
       —— 照网页版 rewardChips()：货币带图标（◉/◆…）、装备带名字、道具带**它自己的 icon**
       （V1.0.6 · 父亲大人 2026-09-24：「结算掉落基础金属的时候配的就是背包图标」）。 */
    const rewards = rewardChips(g.got);
    if (comp && comp.firstClearReward) Object.keys(comp.firstClearReward).forEach((k) => rewards.push('首通 ' + curIcon(k) + '+' + comp.firstClearReward[k]));
    if (comp && comp.newUnlocks && comp.newUnlocks.length) comp.newUnlocks.forEach((n) => rewards.push('🔓 解锁【' + n + '】'));
    /* 结算页直接给「再来一次 / 下一关」——不用回世界列表再点关，推图节奏不断。
       V9.6.116（父亲大人："每个世界推到第 12 关就不要有自动下一关了，只能返回，
       由玩家自己选择打下一个世界还是同一世界的下一个难度"）：
       第 12 关（守关 Boss）打完 = 这张图走到头了 —— 这里只留「返回世界」，
       连「再来一次」都不给（想重打可以从世界列表再点它）。
       顺带一个好处：结算页没有主按钮，**"自动进下一关"的倒计时也就不会启动**。 */
    const isWorldBoss = si >= 11;
    const nx = isWorldBoss ? null : Core.nextStage(wid, df, si);
    /* F2-4：**本关**与**下一关**分成两份状态（以前是一份、被后写的那句覆盖）。 */
    againTarget = isWorldBoss ? null : { worldId: wid, diff: df, stageIdx: si };
    nextTarget = null;
    /* V9.6.128（父亲大人："副本那边我还没试过，还是功能重复的按钮，你再查查"）：
       守关 Boss 那场原来挂了一颗「返回世界」—— 底部那颗「收下奖励并返回」做的就是这件事
       （onClose → CV.reset('world')），两颗按钮同一个功能 → 去掉，只留底部那颗。 */
    const acts = isWorldBoss ? [] : [{ label: '↻ 再来一次', style: 'ghost', id: 'dun_again' }];
    if (nx) {
      const nw = D.WORLDS.find((x) => x.id === nx.worldId);
      nextTarget = { worldId: nx.worldId, diff: nx.diff, stageIdx: nx.stageIdx };
      acts.push({ label: '› 下一关（' + (nw ? nw.name : nx.worldId) + ' ' + (nx.stageIdx + 1) + '/12）', style: 'primary', id: 'dun_next' });
    }
    /* V1.1.15（2026-09-27 · 父亲大人："待领箱有时是卡片、有时只剩几排字"）：
       结算里"装不下"的那部分（胶囊上标了 📮）在这里给一颗**可点的入口** ——
       不然玩家看到一行字、不知道去哪领，就又是"待领箱坏了"。
       只在真有东西进箱时出现（`stashCount() > 0`），不占常态版面。 */
    if (Core.stashCount && Core.stashCount() > 0) {
      acts.push({ label: '📮 待领箱 ' + Core.stashCount() + ' 件 · 去领回', style: 'ghost', id: 'goto_stash' });
    }
    run = null;
    /* V9.6.69（资料 §4「让玩家觉得自己成功」）：首通给一次**看得见**的庆祝 ——
       只加表现、不加资源；"人生第一次通关"那一次更明显，而且只放一次（落盘）。 */
    const firstClear = !!(comp && comp.firstClearReward);
    if (firstClear) {
      const firstEver = !S.celebratedFirst;
      if (firstEver) { S.celebratedFirst = true; Core.save(); }
      setTimeout(function () { CV.toast(firstEver ? '🎉 首通 —— 这一段路你走过去了' : '🎉 首通！'); }, 320);
    }
    /* ================= 结算第 3 层：**「发现：一句线索」**（2026-10-01 二轮重做） =================
       父亲大人原话：「『剧情线索』不要做成普通业务提示卡。改成 `发现：一句线索 [查看]`，
       让它更像战斗结束后玩家发现了一件东西」。
       所以这一层给的**不是段标题，是那句话本身**（`Story.clueOf` 取战后那一拍的**关键物件**：
       "轨道图上亮起 36 个点。"）—— 玩家读到的是"我发现了什么"，不是"这里有一段剧情"。
       不给奖励、不改流程；点「查看」才进剧情页。 */
    let lore = null, loreId = null;
    if (G.Story && G.Story.hasStory && G.Story.hasStory(wid)) {
      const unread = !G.Story.seen(wid, 'post');
      if (unread) { lore = G.Story.clueOf(wid, 'post'); loreId = 'story_world_post:' + wid; }
      else { lore = '这一段已经看过了'; loreId = 'story_world_post:' + wid; }
    }
    /* ================= R1.6 叙事轮（§十三 / §二十八）· **你改变了什么** =================
       父亲大人：「战斗结束后不要只告诉玩家"你赢了"，要告诉他**你改变了什么**」。
       只在**守关 Boss 首通**那一次给（`firstClear` 已经是"这一关第一次通关"的唯一判据，
       不新造条件）：一句战场变化（`BOSS[wid].after`）+ 已有的那条线索。
       为什么只给首通：§二十 明写"第二次快速进入战斗"——重刷不该再看一遍演出。 */
    let changed = null;
    /* R1.7（§三 的 ⑧⑨ 要每世界都成立）：**守关 Boss 首通**给完整的一行；
       另外**每张图第 1 关首通**也给一次「战场变化」——那是"你第一次动了这个地方"。
       中间那些关不给（§三十二：普通战斗就是"战斗→奖励"，别让结算页每关都长一截）。
       判据仍用现成的 `firstClear`，不新造条件。 */
    if (firstClear && (stage === 12 || stage === 1) && G.BattleStory && G.BattleStory.changeOf) {
      const ch = G.BattleStory.changeOf(wid);
      if (ch && ch.after) changed = ch.after;
    }
    return { title: '★'.repeat(stars) + ' 通关', sub: '第 ' + stage + ' 关已通过' + (firstClear ? ' · 🎉 首通' : ''),
      rewards, acts, worldId: wid, lore: lore, loreId: loreId, changed: changed };
  }

  function fightWave() {
    if (!run) return;
    const kind = run.waves[run.wave];
    const w = D.WORLDS.find((x) => x.id === run.worldId);
    const allies = BattleUI.buildAllies(run.hpPct, null);
    if (!allies.length) { Core.clearPendingRun(); run = null; CV.reset('dungeon'); CV.toast('全队重伤，探索失败'); return; }
    const enemies = Dun.makeEnemies(run.worldId, run.diff, run.stage, kind);
    const isBoss = kind === 'boss';
    const WAVE_NAME = { combat: '遭遇战', elite: '精英伏击', boss: '守关之战' };
    BattleUI.run({
      title: w.name + ' 第 ' + run.stage + '/12 关 · 第 ' + (run.wave + 1) + '/' + run.waves.length + ' 波 · ' + (WAVE_NAME[kind] || '遭遇战'),
      allies, enemies, worldId: run.worldId,
      maxRounds: isBoss ? 50 : 30,
      /* F2-2：**「本场已复活」记在这一场（run）上**，不随战斗页的 start() 复位 ——
         这一场＝这一趟副本（三波连着打完才算一场，与 `Core.battleSettle('计一场')` 同一口径），
         所以复活账本挂在 run 上；换一场（startStage 新建 run）自动清零。 */
      reviveState: run,
      onQuit() { Core.clearPendingRun(); run = null; CV.reset('dungeon'); },
      /* 离开这一场（收下奖励返回 / 失败后返回世界）：run 与结算目标一起收干净。
         胜利那条路在 settleRun 里已经清过一遍，这里再清一次是幂等的（clearPendingRun 允许空清）。 */
      onClose() { Core.clearPendingRun(); run = null; clearSettleTargets(); CV.reset('world'); },
      onEnd(win, res, hpLeft) {
        /* F2-1：整段兜底 —— 任何一条路径（含以后新加的）都不许把玩家卡在战斗页上。 */
        try {
          if (!run) return lastResortPanel(win);      // 已经在别处收掉的极端情况：不碰 run、只收尾
          /* F6（R6 #7）：**波与波交界处累加真实阵亡数** ——
             判据是"这一波结束时 hp<=0"，而且只记**这一波新倒下的**
             （上一波已经 0 血的人不算第二次，免得一颗星被扣两遍）。
             `hpLeft` 只覆盖"这一波真的上了场的人"，所以被排除在名单外的阵亡者天然不会重复计。 */
          Object.keys(hpLeft || {}).forEach((k) => {
            if (hpLeft[k] <= 0 && !((run.hpPct[k] || 0) <= 0)) run.deaths = (run.deaths || 0) + 1;
            run.hpPct[k] = hpLeft[k];
          });
          if (!win) {
            const wid = w.id;
            /* F2-1（关键）：失败**不再把 run 置空** ——「看广告复活」是复用同一份 cfg 再打一场，
               打赢回来还要读 run.wave / run.hpPct（上一轮就是这里置空之后抛 `reading 'wave'` 的）。
               持久化那份进度照旧清掉：这一场已经打输了，不该写成"可以继续"；
               内存里的 run 留到玩家在失败面板上做选择（复活续战 / 返回世界，由 onClose 收）。 */
            Core.clearPendingRun();
            view.worldId = wid;
          /* ================= V1.1.8（丙组 B10 · 战斗复活）=================
             父亲大人的口径：**每场 1 次**；复活续战（敌人带剩余血量、**全队按满血复活** ——
             09-28 F8 ⓪-a 由"只回阵亡者 50%"改成满血，见 sc-battle.js 的 `carryUnit`）。
             这颗按钮挂在**失败结算页**上；点了走 `battle_revive`（战斗页实现续战，见 sc-battle）。
             ⚠️ "复活**不得**进资源结算路径"（B12 的第③条尺子在盯）：这一条**只重开战斗**，
                不经过 `settleRun` / `grantRewards` —— 复活本身**不给任何资源**，只是把这一场接着打完。 */
            const AD0 = G.AD;
            const acts = [{ label: '返回世界', style: 'ghost', id: 'battle_close' }];
            /* F6 #1（后半 · R6 #1 原话「ledger.revived 为真时把复活按钮藏掉（每场 1 次要看得见）」）：
               这一场的账本就是 `run`（`reviveState: run`）。已经复活过还把这颗按钮画在那里，
               玩家点下去只会收到一句"这一场已经复活过了"——**看着能点、点了白等**，
               既费一次点击也看不出"每场 1 次"这条规矩。直接不画，那句 toast 也就不会再出现。 */
            const canRevive = !(run && run.revived);
            if (AD0 && AD0.show && canRevive) {
              /* V1.0.4 · R3：失败结算页这颗也随弱网变脸（判定只在 G.ADWEAK 一处） */
              acts.unshift({
                label: G.ADWEAK ? G.ADWEAK.label('📺 看广告 · 复活续战（本场 1 次）') : '📺 看广告 · 复活续战（本场 1 次）',
                style: 'primary', id: 'battle_revive',
              });
            }
            return { title: '战斗失败', sub: '先练一练，再来。', rewards: [], acts: acts };
          }
          const isLast = run.wave === run.waves.length - 1;
          if (!isLast) {
            run.wave++;
            Core.setPendingRun(run);
            return {
              /* V9.6.123（父亲大人："波间那个继续推进的提示，看着像要点击；
                 换成第几波的弹幕，飘过去然后消失"）：文案给"即将开始的第 N 波"。 */
              /* V9.6.125（父亲大人："直接试第 12 关，每一波都是第 3/3 波，第二波第三波要对应上"）：
                 这里 run.wave **已经 ++ 过**，它就是"即将打的那一波"（0 基）→ 显示要 +1。
                 上一版照抄了网页版的 +2（网页版的 ++ 发生在 afterWave 里、晚一拍），再被上限一夹 → 每波都 3/3。
                 两边公式**天生差 1**，注释写清别再互抄。两面都在 battle_flow_audit 里有断言。 */
              title: '本波通过', sub: '第 ' + (run.wave + 1) + '/' + run.waves.length + ' 波', rewards: [], acts: [], seamless: true,
              after() { fightWave(); },
            };
          }
          return settleRun(res, hpLeft);
        } catch (e) {
          /* 兜底不许再抛：出错了就记一笔日志、返一个"能退出"的面板（玩家永远不会卡死）。 */
          try { if (G.LOG) G.LOG.info('battle', 'end', { win: !!win, world: (w && w.id) || '', err: String((e && e.message) || e) }); } catch (e2) {}
          return lastResortPanel(win);
        }
      },
    });
  }

  /* ================= 事件 ================= */
  CV.on('w:W01', function () {});      // 具体世界在下面统一绑定
  D.WORLDS.forEach(function (w) {
    CV.on('w:' + w.id, function () {
      /* 转生门后的世界也会出现在列表里（V9.6.76，见世界列表那段）——点它要说清门槛，
         不能"点了跳进去"，也不能点了没反应（父亲大人对死键零容忍）。 */
      const st = Core.S.worlds[w.id];
      if (!st || !st.unlocked) {
        const need = Core.worldReincarnNeed(w.id);
        const has = Core.S.player.reincarnations || 0;
        CV.toast(need > 0 ? ('🔒 需要转生 ' + need + ' 次才能进入（当前 ' + has + ' 次）') : '🔒 通关上一世界后解锁');
        return;
      }
      view.worldId = w.id; view.diff = 'normal';
      /* R1.7：**进世界就把这一张场景图（和它的 Boss 立绘）挂上**——
         等玩家点关卡再加载，就会在战斗第一帧闪一下"主题平底"。
         这里预热只是把请求发出去，不阻塞、失败了也不影响（保险交给 bgFlat）。 */
      if (G.Story && G.Story.preloadWorld) G.Story.preloadWorld(w.id);
      CV.push('world');
      /* ================= 剧情「自己发生」之一：**第一次进这个世界** =================
         父亲大人 2026-10-01 二轮：「`in`——第一次进入世界时**自动进入**。玩家确认继续后
         进入世界页/关卡。**不要要求玩家先去剧情菜单**」。
         做法：先把世界页压上去，再把剧情压在世界页之上 —— 播完 pop 回来就是世界页，
         返回键与滚动位置都还是对的（没有新开一条栈）。看过就不再打断。 */
      const St = G.Story;
      if (St && St.autoOn && St.autoOn() && St.hasStory && St.hasStory(w.id) && !St.seen(w.id, 'in')) {
        St.openWorld(w.id, 'in');
      }
    });
  });
  CV.on('dun_back', function () { CV.pop(); });
  /* V1.1.15（2026-09-27）：结算页那颗「📮 待领箱 · 去领回」→ 直接切到背包那格
     （与底栏页签同一套动作：cur 归位 + reset），省得玩家自己找。 */
  CV.on('goto_stash', function () { CV.cur = 'bag'; CV.reset('bag'); });
  ['normal', 'hard', 'hell'].forEach(function (df) {
    CV.on('diff:' + df, function () { view.diff = df; CV.render(); });
  });
  for (let i = 0; i < 12; i++) {
    CV.on('stage:' + i, function () {
      if (!Core.stageUnlocked(view.worldId, view.diff, i)) { CV.toast('先通关前面的关卡'); return; }
      /* ================= 剧情「自己发生」之二：**重要战斗/Boss 战前** =================
         父亲大人 2026-10-01 二轮：「`pre`——重要战斗 / Boss 战前**自动触发**。不需要玩家手动点」。
         判据只有一条：这一关是不是**守关 Boss（第 12 关）或精英关** —— 与关卡格里那两枚
         ⚔/🔱 角标同一份数据（`Dun.wavePlan`），不另立一套"重要"标准。
         每一张图**只打断一次**（`pre` 一旦读过就不再插）；剧情页右上角有「跳过」，
         所以"自动"不会变成"逼着看"。播完 `onDone` 里接着开打 —— 玩家少点一次，流程一步不少。 */
      const St = G.Story;
      const isBoss = i === 11;
      const isElite = !isBoss && Dun.wavePlan(i + 1).indexOf('elite') >= 0;
      if (St && St.hasStory && St.hasStory(view.worldId) && (isBoss || isElite)
        && St.autoOn && St.autoOn()
        && St.part(view.worldId, 'pre') && !St.seen(view.worldId, 'pre')) {
        const wid = view.worldId, df = view.diff;
        St.openWorld(wid, 'pre', { onDone: function () { startStage(wid, df, i); } });
        return;
      }
      startStage(view.worldId, view.diff, i);
    });
  }
  CV.on('sweep_open', function () {
    const arr = (Core.S.worlds[view.worldId] && Core.S.worlds[view.worldId].stages[view.diff]) || [];
    const done = arr.map((s, i) => ({ s, i })).filter((x) => x.s > 0);
    sweepSel = done.length ? done[done.length - 1].i : 0;
    CV.push('sweep');
  });
  CV.on('sweep_back', function () { CV.pop(); });
  /* B6 · 扫荡 +10：广告 → 那 10 次记进 `S.sweep.adBonus`（与日上限分开的账），再原地重画。
     这里**不改** `S.sweep.count`（已用次数）—— 买的是"额度"，用不使用由玩家在扫荡页决定。 */
  CV.on('ad_sweep_plus', function () {
    /* 弱网：这一下直接给一句人话，不让玩家白等一条拉不起来的广告（R3） */
    if (G.ADWEAK && G.ADWEAK.block()) return;
    const AD = G.AD;
    if (!AD || !AD.show) { CV.toast('这个版本没有广告模块'); return; }
    AD.show('sweep_plus').then(function (r) {
      if (!r || !r.granted) { CV.toast(r && r.reason === 'total' ? '今天看广告的次数用完了' : '今天这个次数用完了'); CV.render(); return; }
      Core.addAdSweepBonus(10);
      /* F7 ②：一次性奖励类（看完广告拿到的 10 次）→ 留，缩到最短（"今天/现在"这种废话去掉）。 */
      CV.toast('📺 扫荡次数 +10（剩 ' + Core.sweepLeft() + '）', 2400);
      CV.render();
    });
  });
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(function (i) {
    CV.on('ssel:' + i, function () { sweepSel = i; CV.render(); });
  });
  function doSweep(times) {
    const n = times <= 0 ? Core.sweepLeft() : times;
    if (n <= 0) { CV.toast('今日扫荡次数已用完'); return; }
    const r = Dun.sweep(view.worldId, view.diff, sweepSel + 1, n);
    if (!r.ok) { CV.toast(r.msg || '扫荡失败'); return; }
    /* V1.0.4 · R1：扫荡这条腿也进日志（只有 info，**不发 `dungeon_clear` 事件** ——
       那个事件的口径是"手打到通关"，见 settleRun 那段的说明；口径若有变，康康那边再定）。 */
    try {
      if (G.LOG) G.LOG.info('battle', 'sweep', { world: view.worldId, diff: view.diff, stage: sweepSel + 1, count: r.count });
    } catch (e) {}
    /* ================= V1.1.9（丙组 · 扫荡结算重做）=================
       父亲大人：「**现在扫荡的结算不行，里面还有乱码，可以像战斗结算那样展示**」
       （截图证据：`0 次:points+710 · otherworld+20 · 🗡装备×1 · EXP+480 ·` 一条 toast 横着溢出屏幕）。
       旧版三个毛病一起改掉：
         ① **不再用 toast** —— 改成**同一个结算面板**（`BattleUI.showResult` → 战斗页的 drawSettle/drawChips）；
         ② **内部键名一个都不许漏**：聚合与拼字都走 `rewardChips`（货币查 `D.CURRENCIES` 拿图标）；
         ③ **"扫荡 N 次"要出现在结算页上**（写在第二行），他截图里那条开头就是它。
       聚合口径：货币按币种累加、道具按 id 累加、装备按件数计 —— 与旧版一致（只是不再漏键名）。 */
    const byCur = {}, byItem = {};
    let eqN = 0, expN = 0;
    (r.total || []).forEach(function (t) {
      (t.got || []).forEach(function (g) {
        if (g.k === 'equip') { eqN++; return; }
        if (g.k === 'item') { byItem[g.v] = (byItem[g.v] || 0) + (g.n || 1); return; }
        /* ⚠️ `exp` **不是货币**（`D.CURRENCIES` 里没有它）—— 第一版把它混进 `byCur`，
           结果胶囊上出现 `◈+144`（兜底图标＋一个裸数字），正是"半漏内部信息"那一类。
           经验就是"聚合要按**已经分类过**的种类走"，别拿 `else` 兜底当真。 */
        if (g.k === 'exp') { expN += (g.v || 0); return; }
        byCur[g.k] = (byCur[g.k] || 0) + (g.v || 0);
      });
    });
    /* 拼胶囊**完全走 `rewardChips` 那一套**（不另起一份）：先把聚合结果还原成 `got` 的形状，
       再交给同一个函数 —— 战斗结算与扫荡结算从此只有一处"怎么把掉落写成字"的实现。 */
    const merged = [];
    Object.keys(byCur).forEach(function (k) { if (byCur[k]) merged.push({ k: k, v: byCur[k] }); });
    if (expN) merged.push({ k: 'exp', v: expN });
    if (eqN) merged.push({ k: 'equip', n: eqN });
    Object.keys(byItem).forEach(function (id) { merged.push({ k: 'item', v: id, n: byItem[id] }); });
    const chips = rewardChips(merged);
    if (!chips.length) chips.push('这次没有掉落');
    const w = D.WORLDS.find(function (x) { return x.id === view.worldId; }) || {};
    G.BattleUI.showResult({
      title: '扫荡结算',
      bigTitle: '扫荡完成',
      bigTitleColor: CV.C.gold,
      line2: '扫荡 ' + r.count + ' 次 · ' + (w.name || view.worldId || '') + ' 第 ' + (sweepSel + 1) + ' 关（' + (DIFF_NAME[view.diff] || '') + '）',
      rewards: chips,
      maxChips: 14,
      closeLabel: '收下并返回',
    });
  }
  CV.on('sweep_1', function () { doSweep(1); });
  CV.on('sweep_5', function () { doSweep(5); });
  CV.on('sweep_10', function () { doSweep(10); });
  CV.on('sweep_all', function () { doSweep(0); });
  CV.on('dun_resume', function () {
    const pr = Core.S.pendingRun;
    if (!pr || !pr.waves) { CV.toast('没有可继续的副本'); return; }
    run = pr;
    view.worldId = pr.worldId; view.diff = pr.diff || 'normal';
    /* F7 ②：点下去当场进战斗页（看得见 → 删"已继续"这句确认语）。 */
    fightWave();
  });
  CV.on('dun_drop', function () {
    U.confirm('放弃这一轮', '确定放弃上次没打完的副本？已获得的奖励保留。', function () {
      Core.clearPendingRun(); run = null; CV.render();
    });
  });
  /* F2-4：两颗按钮（↻ 再来一次 / › 下一关）**收成一份实现，用参数区分目标** ——
     以前两个处理器一字不差、还共用同一个 afterSettle，这就是「再来一次进了下一关」的根因。 */
  function gotoAfterSettle(which) {
    const t = which === 'next' ? nextTarget : againTarget;
    clearSettleTargets();
    BattleUI.clear();
    if (t) { view.worldId = t.worldId; view.diff = t.diff; startStage(t.worldId, t.diff, t.stageIdx); }
    /* F8 ③（"回不去的落点" 同类）：原来这里 `CV.reset('world')` —— 世界页是个二级页，
       压成根之后它那颗吸顶 ‹（`dun_back` → `CV.pop()`）就没地方可回。
       落点跟战斗退出那条一个道理：**先把 tab 根摆好、再把世界页 push 上去**，
       于是 ‹ 回得到残域列表。（这条分支只在"两颗结算按钮都没目标"时才走，
       本来几乎点不到；但既然是一条"回不去"的写法，就一并收口。） */
    else { CV.reset('dungeon'); CV.push('world'); }
  }
  CV.on('dun_again', function () { gotoAfterSettle('again'); });
  CV.on('dun_next', function () { gotoAfterSettle('next'); });
  CV.on('open_corridor', function () { CV.push('corridor'); });   // 深井页（sc-last.js）
})();
