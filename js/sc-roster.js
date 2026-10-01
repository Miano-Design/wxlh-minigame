/* 执灯者 = 伙伴总览（照网页版 js/ui.js 的 rosterScreen→charsScreen / charDetail）
   ------------------------------------------------------------------------------
   网页版 V9.5.45 起：执灯者这一栏**直接就是伙伴总览**（队伍/成长搬去主页养成）。
   总览页结构：筛选胶囊行（右端是「📕 灯录」）→ 排序行 → 已收集提示 → 三列卡片网格。
   卡片照网页版 .char-card：上阵角标 + 头像 + 名字 + 星级 + Lv·战力 + 装备状态。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const nm = (id) => Core.charName(id);
  let cur = null;                                          // 详情页当前看的伙伴
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  /* 头像（V1.1.2 · 基准 §4.4）：组合剪影，配方在数据层，画法在 CV.avatar —— 与网页版同一个形。
     圈色仍按稀有度（网页版 charAvatar 也是这条：主角金圈、伙伴稀有度圈）。 */
  function avatar(id, size, y) {
    const ch = D.charById[id] || {};
    const cx = U.pad() + U.cw() / 2;
    CV.avatar(id, cx, y + size / 2, size, id === '@player' ? CV.C.gold : rarColor(ch.rarity));
  }
  /* 星级（网页版 .stars：金色，字距收紧） */
  function stars(n, max, x, y, size) {
    CV.text('★'.repeat(n) + '☆'.repeat(Math.max(0, max - n)), x, y, { size: size || CV.FS.sm, color: CV.C.gold, ls: -1 });
  }

  /* V9.6.8（父亲大人）：执灯者的**分类和排序两行都删了** —— 默认顺序已经够用。
     所以这里只留一条默认顺序（上阵 → 等级 → 稀有度 → 星级），
     filter / sort / FILTERS / SORTS 连同它们的点击处理器一起删。 */
  const rarIdx = (id) => D.RARITIES.indexOf(D.charById[id].rarity);
  /* 卡片右下角「未穿装备 / 可升级」要用它（V9.6.8 删排序时误删过一次，卡片只画出一张就抛异常了） */
  const eqCount = (id) => Object.keys(Core.S.equipped[id] || {}).filter((k) => Core.S.equipped[id][k]).length;
  /* 默认排序的**唯一实现**：上阵 → **稀有度** → 等级 → 星级（父亲大人 2026-09-22 亲口更正）。
     原来写的是"上阵 → 等级 → 稀有度"，**优先级记反了**，两端都反着跑了很久 ——
     低等级的 R 会把 SSR 压到后面，玩家找强力伙伴要找半天。
     V9.6.19：换将页（sc-party）也要用同一套顺序，所以挂到 G 上共用一份，
     不要各写一遍 —— 两处排序一旦分家，就会出现"这边和那边不一样"。 */
  G.charSortDefault = function (ids) {
    const S = Core.S;
    /* V1.1.15（2026-09-27 · 父亲大人："现在伙伴的默认排序少了一个战力啊"）：
       同一稀有度内按 **等级 → 战力 → 星级** 排。
       ⚠️ 战力先整表算一遍再排：排序里同一个 id 会被比较多次，`Core.power()` 不轻
       （它要把装备 / 血统 / 铭刻全都折进去），逐个比较现算会把一次排序拉成几百次重算。 */
    const pow = {};
    [].concat(ids).forEach(function (id) {
      try { pow[id] = (Core.power && S.chars[id]) ? Core.power(id) : 0; } catch (e) { pow[id] = 0; }
    });
    return [].concat(ids).sort((a, b) => {
      const pa = S.party.includes(a) ? 1 : 0, pb = S.party.includes(b) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (rarIdx(a) !== rarIdx(b)) return rarIdx(b) - rarIdx(a);
      if (S.chars[a].lv !== S.chars[b].lv) return S.chars[b].lv - S.chars[a].lv;
      /* 同等级 → 比战力（高的在前） */
      if ((pow[a] || 0) !== (pow[b] || 0)) return (pow[b] || 0) - (pow[a] || 0);
      /* V1.0.1：四档全平时要有个**唯一兜底键** —— 否则顺序取决于 `Object.keys` 的
         插入顺序，读档后会变，玩家看到的就是"排序又乱了"。详见网页版 ui.js 同一处。 */
      return (S.chars[b].star - S.chars[a].star) || String(a).localeCompare(String(b));
    });
  };
  function listSorted() {
    const S = Core.S;
    /* 网页版默认排序（父亲大人定的）：上阵 → 等级 → 稀有度 → 星级 */
    return G.charSortDefault(Object.keys(S.chars));
  }

  CV.register('roster', function () {
    U.begin();
    /* V9.6.8（父亲大人）：分类（全部/已上阵/SSR+/N/R/SR）和排序（默认/战力/…）两行都删了 ——
       "默认的排序顺序就已经能很好的区分这些了"。只留默认顺序 + 右端「📕 灯录」。 */
    /* V9.6.10（父亲大人："那个已收集的小字跟图鉴那个按钮水平对齐，现在不是很浪费空间吗"）：
       把「已收集…」搬到**灯录那一行**、左边，整块内容跟着往上提一行。 */
    const pillH = 36 * CV.SCALE;
    const codexW = CV.measure('灯录', CV.FS.sm) + 24 * CV.SCALE;
    const gy = U.y;
    const cs = Core.codexState();
    const infoTxt = '已收集 ' + cs.owned + '/' + cs.total + ' · 拥有 ' + Object.keys(Core.S.chars).length
      + ' · 当前显示 ' + listSorted().length;
    CV.text(CV.fit(infoTxt, U.cw() - codexW - 10 * CV.SCALE, CV.FS.sm), U.pad(), gy + pillH / 2,
      { size: CV.FS.sm, color: CV.C.dim });
    U.btn(U.pad() + U.cw() - codexW, gy, codexW, pillH, '灯录', 'ghost', 'open_codex');
    U.y = gy + pillH + 8 * CV.SCALE;
    /* 三列卡片网格（.char-grid + .char-card） */
    const list = listSorted();
    if (!list.length) {
      U.hint(Object.keys(Core.S.chars).length ? '没有符合条件的伙伴' : '还没有招募到任何伙伴');
      return;
    }
    /* V9.6.2（父亲大人："执灯者这一排的卡片里内容还是很拥挤"）：按网页版 .char-card 实测重排 ——
       卡片 **140 高**（原来 122）、内边距 10、头像 46 且下面留 6、名字 13 → 星级 11 → 两行小字 11，
       每一行紧接上一行（网页版实测：头像 46 + 6 + 名字 18.5 + 星级 15 + 2 + 小字 15 + 2 + 小字 15 = 119.5）。
       "上阵"角标也按网页版 .inparty：右上角 3/3、左右 5px、11 号字。 */
    const cols = 3, g2 = 10 * CV.SCALE;
    const cw = (U.cw() - g2 * (cols - 1)) / cols;
    const PAD = 10 * CV.SCALE, AV = 46 * CV.SCALE, AV_GAP = 6 * CV.SCALE;
    const NAME_H = 18.5 * CV.SCALE, SMALL_H = 15 * CV.SCALE;
    /* V1.0.5（UI 设计师 1.0.2 复审 · 两端对表第 5 条）：档色铭牌带高度照网页版
       `[class*="rarity-"]::after` 的 **1.375rem＝22px**（这里原来 18px，两端并排就看得出厚薄不同）。
       「改高度不许只改高度」：卡片要同时给铭牌让够位置 —— 网页版是
       `.char-card { padding-bottom: 1.75rem }`（28px）− 铭牌 22px = **末行小字离铭牌 6px**。
       所以高度不再写死 140，而是"内容实高 + 6 + 铭牌高"，内容改了高度自己跟着走。 */
    const BAND = 22 * CV.SCALE;
    const CONTENT_H = PAD + AV + AV_GAP + NAME_H + SMALL_H + 2 * CV.SCALE + SMALL_H + 2 * CV.SCALE + SMALL_H;
    const ch = CONTENT_H + 6 * CV.SCALE + BAND;
    const y0 = U.y;
    list.forEach((id, i) => {
      const cx = U.pad() + (i % cols) * (cw + g2), cy = y0 + Math.floor(i / cols) * (ch + g2);
      const isP = Core.S.party.includes(id);
      const ch0 = D.charById[id], c0 = Core.S.chars[id];
      CV.qframe(cx, cy, cw, ch, ch0.rarity, 12 * CV.SCALE, BAND);
      if (isP) {
        /* 「上阵」角标：网页版 .char-card .inparty 是**五级 11px**（小游戏原来画成 12px） */
        const tw = CV.measure('上阵', CV.FS.tag) + 10 * CV.SCALE;   // .inparty：padding 1px 5px
        CV.round(cx + cw - tw - 3 * CV.SCALE, cy + 3 * CV.SCALE, tw, 17 * CV.SCALE, CV.RADIUS_CHIP,  CV.C.accent);
        CV.text('上阵', cx + cw - tw / 2 - 3 * CV.SCALE, cy + 11.5 * CV.SCALE, { size: CV.FS.tag, align: 'center', color: CV.C.white });
      }
      /* 头像 → 名字 → 星级 → 两行小字：每一行的中心都按"上一行结束处"往下推（网页版顺序） */
      const acx = cx + cw / 2;
      let ly = cy + PAD;                                  // 内容区顶部
      const avCy = ly + AV / 2;
      CV.ctx.beginPath(); CV.ctx.arc(acx, avCy, AV / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.a(CV.C.panel3, .55); CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = rarColor(ch0.rarity); CV.ctx.stroke();
      CV.text(nm(id).slice(0, 1), acx, avCy, { size: AV * 0.44, bold: true, align: 'center', color: rarColor(ch0.rarity) });
      ly += AV + AV_GAP;
      CV.text(CV.fit(nm(id), cw - PAD * 2, CV.FS.lg, true), acx, ly + NAME_H / 2, { size: CV.FS.lg, bold: true, align: 'center' });
      ly += NAME_H;
      CV.text('★'.repeat(c0.star) + '☆'.repeat(Math.max(0, D.RARITY_MAXSTAR[ch0.rarity] - c0.star)), acx, ly + SMALL_H / 2,
        { size: CV.FS.tag, color: CV.C.gold, align: 'center', ls: -1 });   // 网页版 .char-card .stars：五级 11px、letter-spacing -1
      ly += SMALL_H + 2 * CV.SCALE;
      CV.text('Lv.' + c0.lv + ' · 战力 ' + fmt(Core.power(id)), acx, ly + SMALL_H / 2, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      ly += SMALL_H + 2 * CV.SCALE;
      const eqn = eqCount(id);
      const upable = !!Core.levelCost(id);
      CV.text((eqn ? '装备 ' + eqn + '/6' : '未穿装备') + (upable ? ' · 可升级' : ''), acx, ly + SMALL_H / 2,
        { size: CV.FS.xs, color: eqn ? CV.C.dim : CV.C.gold, align: 'center' });
      CV.hit('char:' + id, cx, cy, cw, ch);
      CV.on('char:' + id, function () { CV.push('char', { id: id }); });   // 点卡片进详情
    });
    U.y = y0 + Math.ceil(list.length / cols) * (ch + g2);
  });
  /* rf:* / rs:* 随分类+排序两行一起删掉了（V9.6.8） */
  Object.keys(D.characters).length;                        // 触发表初始化（保持与网页版一致的数据来源）
  /* V9.6.14（自审）：这一行把 sc-home 里"打开灯录页"的处理器**盖掉了**（同 id 是后注册的赢），
     所以点灯录 / 图鉴只弹一句"下一批复刻" —— 其实 codex 页在 sc-core-pages.js 里早就写好了。
     删掉这行占位，灯录就真能进去了。 */

  /* ================= 伙伴详情（照网页版 charDetail） ================= */
  CV.register('char', function (opts) {
    const id = (opts && opts.id) || Object.keys(Core.S.chars)[0];
    if (!id) { U.begin(); U.hint('还没有伙伴'); return; }
    const S = Core.S, ch = D.charById[id], c = S.chars[id];
    cur = id;
    const maxStar = D.RARITY_MAXSTAR[ch.rarity];
    const cost = Core.levelCost(id);
    /* V9.6.21 自审（幽灵接口）：原来写的是 starCostOf(c.star) —— 这个函数不存在，
       外面用 ? : 兜住 → starCost 恒为 null → **升星按钮永远是灰的**（功能等于没了）。
       正确来源是数据表 D.STAR_COST（core 的升星也是查它）。 */
    const starCost = c.star < maxStar ? D.STAR_COST[c.star] : null;
    U.begin();
    /* 返回条（二级页左上角返回，照网页版 .page-head）——**吸顶**（父亲大人 09-27 深夜：
       「每一屏的标题和返回键都固定在顶部吧，不然有时候要点返回又得滑回去」）。 */
    U.pageHead(nm(id), { backId: 'back' });

    /* ① 头部：头像 + 名字/稀有度/星级/Lv·碎片·血统 + 右侧战力 */
    U.card(function () {
      const h = 76 * CV.SCALE, top = U.y;
      const asz = 56 * CV.SCALE;
      const cx = U.ix() + asz / 2;
      CV.ctx.beginPath(); CV.ctx.arc(cx, top + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.a(CV.C.panel3, .55); CV.ctx.fill(); CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = rarColor(ch.rarity); CV.ctx.stroke();
      CV.text(nm(id).slice(0, 1), cx, top + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: rarColor(ch.rarity) });
      const tx = U.ix() + asz + 12 * CV.SCALE;
      CV.text(ch.rarity, tx, top + 16 * CV.SCALE, { size: CV.FS.f1, bold: true, color: rarColor(ch.rarity) });
      const rw = CV.measure(ch.rarity, CV.FS.f1, true);
      CV.text(CV.fit(nm(id), U.iw() - asz - rw - 60 * CV.SCALE, CV.FS.f1, true), tx + rw + 7 * CV.SCALE, top + 16 * CV.SCALE, { size: CV.FS.f1, bold: true });
      CV.text('★'.repeat(c.star) + '☆'.repeat(Math.max(0, maxStar - c.star)), tx, top + 34 * CV.SCALE, { size: CV.FS.sm, color: CV.C.gold, ls: -1 });
      /* 命格主题（V1.1）：这一行走本命格的灯色，行尾挂本命格的印记（与网页版同源） */
      const blLine = ch.bloodline + '命格 · ' + ch.faction;
      const blLamp = CV.blLamp(ch.bloodline, Core.realmState().realm);
      CV.text(blLine, tx, top + 50 * CV.SCALE, { size: CV.FS.sm, color: blLamp });
      U.draw(function () { CV.blGlyph(ch.bloodline, tx + CV.measure(blLine, CV.FS.sm) + 7 * CV.SCALE, top + 50 * CV.SCALE, 11 * CV.SCALE, blLamp); });
      /* V9.6.129：显示**该稀有度的通用碎片**（不再是他一个人攒的） */
      /* V1.1.14（0927-F）：碎片**从这一版起按人记账**（满星之后才转通用池）——
         列表这一行必须写清"**他自己**有几颗"，否则玩家在列表上看不出谁能升星。 */
      CV.text('Lv.' + c.lv + ' · 碎片 ' + Core.shardsOf(id) + '（' + ch.rarity + '池 ' + Core.shardPoolOf(ch.rarity) + '） · 命格 Lv.' + c.bloodlineLv, tx, top + 66 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text(fmt(Core.power(id)), U.ix() + U.iw(), top + 18 * CV.SCALE, { size: CV.FS.f2, bold: true, color: CV.C.gold, align: 'right' });
      CV.text('战力', U.ix() + U.iw(), top + 38 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      U.y = top + h;
    });

    /* ② 队伍操作（从队伍点进来才有）—— V9.6.19（父亲大人）：从"装备下面"挪到**等级上面**。
       「换将 / 下阵」是进这一页最想做的事，压在最底下得滑半天；现在跟身份信息挨着。 */
    if (opts && opts.fromSlot !== undefined && opts.fromSlot !== null) {
      U.card(function () {
        U.h3('队伍操作', '当前第 ' + (opts.fromSlot + 1) + ' 位');
        U.btnRow([
          { label: '无损换将', style: 'gold', id: 'swap' },
          { label: '下阵', style: 'ghost', id: 'off' },
        ]);
        U.hint('无损换将：新上阵的继承他的等级；身上的装备能穿就一起转过去，命格对不上、别人专属这类穿不了的会留在他身上。', 4 * CV.SCALE);
      });
    }

    /* ② 等级：共享的伙伴经验池 + 升 1 级 / 升 10 级 / 重生（V9.5.46/47） */
    U.card(function () {
      U.h3('等级', 'Lv.' + c.lv + ' / ' + D.PLAYER_MAX_LV);
      U.kv('伙伴经验', fmt(Core.partnerExp()), CV.C.gold);
      U.space(CV.SP[2]);
      U.btnRow([
        /* V1.1.17（父亲大人 09-27 深夜 · 派单 Z-A「无效按键普查」）：
           原来满级时这三颗绑的是 `'noop'`（一个空处理器），**画出来是正常按钮、点了一点反应都没有**
           —— 正是他说的"诸如此类的无效按键"。现在一律走 `dis`（压暗 + 不登记热区），
           而且为什么不能点写在下面那句 hint 里（满级 / 未重生过）。 */
        { label: '升 1 级', style: 'ghost', id: cost ? 'lv1' : '', dis: !cost },
        { label: '升 10 级', style: 'ghost', id: cost ? 'lv10' : '', dis: !cost },
        { label: '重生', style: 'ghost', id: c.lv > 1 ? 'reborn' : '', dis: !(c.lv > 1) },
      ]);
      U.space(CV.SP[1]);
      /* V9.6.90：与网页版同一句（网页版还带一句"经验模块在背包里用，直接进这个池子"） */
      /* V1.1.17（父亲大人 09-27 深夜）：三颗按钮的**禁用原因**都写在这一行里 ——
         以前满级只写"已满级"、而"重生"为什么灰着没人说，玩家只能猜"是不是有前置条件"。 */
      U.hint((cost ? '升下一级需要 ' + fmt(cost.exp) + ' 伙伴经验 + ◉ ' + fmt(cost.points)
        + ' · 经验模块在背包里用，直接进这个池子'
        : '已满级（Lv.' + D.PLAYER_MAX_LV + ' 封顶）：升 1 级 / 升 10 级不能再点；重生可以把投进去的经验全退回来重练')
        + (c.lv > 1 ? '' : ' · 重生要 Lv.2 起（现在还没投过经验）'), 4 * CV.SCALE);
    });

    /* ③ 星级（碎片升星） */
    U.card(function () {
      /* V9.6.130（父亲大人："我现在的 UR 升星级还是统一只需 6 碎片啊"）：
         原来是"星级 x / 6"——那个 6 是**星级上限**，不是碎片数，很容易看错。
         现在把三件事分行写清：当前星级 / 升下一星要多少碎片 / 池子里有多少。 */
      U.h3('⭐ 星级', Core.charName(id) + ' · ' + ch.rarity + ' 档');
      U.kv('当前星级', c.star + ' / ' + maxStar + ' ★');
      /* V1.1.14（0927-F · 父亲大人）：碎片**按人各算各的** —— 抽到谁就是谁的碎片，
         该伙伴满星之后再抽到才转成"同稀有度通用池"。升星**先吃他自己的，不够再用通用池补**。
         所以这一卡要**两行分开写**（他自己的 / 通用池），并说清这一星会从哪边扣。
         口径全走 `Core.starInfo(id)` 一处（成本走 `D.starCostOf`，UR 那条独立曲线也在这生效）。 */
      const si = Core.starInfo ? Core.starInfo(id) : null;
      const need = si ? si.need : (c.star >= maxStar ? 0 : D.STAR_COST[c.star]);
      U.kv('升下一星需要', si && si.full ? '已满星' : (need + ' 碎片'), CV.C.gold);
      U.kv('他自己的碎片', String(si ? si.own : 0), si && si.own > 0 ? CV.C.green : CV.C.dim);
      U.kv(ch.rarity + ' 通用碎片池', String(si ? si.pool : Core.shardPoolOf(ch.rarity)));
      if (si && !si.full) {
        /* V1.1.15（2026-09-27 · 父亲大人："那个转换的注释小字不要"）：
           讲"碎片怎么转通用"的那半句解释删掉 —— 规则本身在做法里（满星自动转、升星先吃自己的），
           卡上只留**操作性**的一句：够不够、这一星从哪扣。 */
        U.hint(si.can
          ? ('这一星会扣：他自己的 ' + si.fromOwn + ' 颗' + (si.fromPool > 0 ? ('，再从 ' + ch.rarity + ' 通用池补 ' + si.fromPool + ' 颗') : ''))
          : ('还差 ' + (need - si.total) + ' 颗'),
          3 * CV.SCALE);
      } else if (si && si.full) {
        U.hint('已满星', 3 * CV.SCALE);
      }
      /* V1.1.14：加了两行说明之后，按钮离上方小字只剩 1.2pt（inset_audit 当场报红）——
         补一个 SP[1] 的净距（别处按钮行前都是这个量级）。 */
      U.space(CV.SP[1]);
      /* V1.1.17（父亲大人 09-27 深夜）：满星那颗原来绑 'noop'（画成正常按钮、点了没反应），
         现在走 dis —— 变灰、不登记热区；为什么不能点就在上面那行「已满星」+ kv 里写着。 */
      U.btnRow([{ label: (si && si.full) ? '已满星' : '升星', style: 'ghost',
        id: (si && si.full) ? '' : 'starup', dis: !!(si && si.full) }]);
    });

    /* ④ 血统（等级 + 升级） */
    /* V1.1.4（A12-F · 命格接「血髓晶」）：
       ① 报价改走 `Core.bloodlineQuote(id)` —— 它才是**实际会扣的那一份**（含命格实验室最高 -40%）。
          这一页原来读的是 `D.bloodlineCost` 毛价，按钮写着 ◆120、真扣 ◆72，正是 core.js V9.5.89
          那条注释点名的"虚高价"问题在这一页的残留（主角页早就走 quote 了）。
       ② 材料（血髓晶）也挂在 quote 里（`mat`/`matN`），所以直接分行显示，不用另开一条数据通道。 */
    const blCost = c.bloodlineLv < D.BLOODLINE_MAX ? Core.bloodlineQuote(id) : null;
    const blMat = blCost ? (D.ITEMS[blCost.mat] || {}) : {};
    const blMatHave = blCost ? (S.items[blCost.mat] || 0) : 0;
    const blMatOk = !blCost || !blCost.matN || blMatHave >= blCost.matN;
    U.card(function () {
      U.h3('🧬 ' + ch.bloodline + '命格', 'Lv.' + c.bloodlineLv + ' / ' + D.BLOODLINE_MAX);
      if (blCost && blCost.matN) {
        U.kv(blMat.name || blCost.mat, blMatHave + ' / ' + blCost.matN, blMatOk ? CV.C.green : CV.C.dim);
        U.space(CV.SP[1]);
      }
      U.btnRow([{
        label: blCost ? '命格升级（◆ ' + blCost.otherworld + ' + ◉ ' + fmt(blCost.points) + '）' : '已满级',
        /* V1.1.17（父亲大人 09-27 深夜）：满级 / 材料不够都走 dis（不再用 'noop' 假按钮）——
           差什么写在卡片上方那行材料 kv 与「已满级」标签里。 */
        style: 'ghost', id: (blCost && blMatOk) ? 'blup' : '', dis: !(blCost && blMatOk),
      }]);
    });

    /* ⑤ 技能（芯片升级） */
    U.card(function () {
      U.h3('⚡ 技能', '◆ 异界结晶 ' + fmt(S.cur.otherworld || 0));
      [ch.skills.s1, ch.skills.s2, ch.skills.ult].forEach(function (sk, i) {
        if (!sk) return;
        const lv = (c.skillLv || [0, 0, 0])[i];   // V9.5.82：技能从 0 级起
        /* ================= V1.1.17（父亲大人 09-27 深夜 · 派单 Z-A，**他点名的第一处**）=================
           原话：「伙伴技能加到 10 点后加不了了，不知道是如果是有前置条件也没说明呀」。
           真因：**上限写死在界面上**了 —— 这里的判定是 `lv < 10`，而真实上限是
           `D.SKILL_MAX_BY_INDEX = [35, 35, 30]`（core.skillUp 查的就是它）。
           于是 Lv.10 一到，+1 就被压成禁用态、而胶囊上写着「Lv.10/35」——
           玩家只看到"点不动"，自然怀疑有前置条件（数据层从来没这道门）。
           现在判定改读**同一张上限表**，并顺带把"这一级要多少 ◆ 异界结晶"也纳进来
           （不够时同样走禁用态，价位就写在下面那行小字里，不再"看着能点、点了没反应"）。 */
        const maxLv = D.SKILL_MAX_BY_INDEX[i];
        const nextCost = lv < maxLv ? (Core.SKILL_CHIP_COST[lv] || 0) : 0;
        const canUp = lv < maxLv && (S.cur.otherworld || 0) >= nextCost;
        /* V9.6.117（排版层级 + 间距，父亲大人："技能版面…间距又贴在一起"）：
           这里原来是"名字挤在 20px 行高里 + 描述紧跟 + 一个整行大按钮"，
           和主角详情那套完全不一样。现在两个页面**共用 U.skillRow**（＝网页版 .skill-row）。 */
        U.skillRow({
          name: ['技能', '技能', '必杀'][i] + '·' + sk.name,
          tag: 'Lv.' + lv + '/' + maxLv,
          /* V1.0.6（父亲大人 09-24 反馈图 11「伙伴技能升级消耗没写」）：
             网页版这一行的 .sdesc 末尾带着「（每级 +X% 效果 · 下级需 ◆ N）」，画布这边只传了
             sk.desc —— 玩家看不到升下一级要多少异界结晶，只有一颗说不出价钱的按钮。
             ⚠️ 两个取值都**按游戏里的真数**取，没照抄网页版那句文案（那句子本身有两处旧的）：
               · 每级百分比 → D.SKILL_PCT_PER_LV（=2%）。网页版写死「+7%」是旧公式
                 （battle.js:434 的注释：`1+(lv-1)*0.07` 已改成 0 基 +2%）；
               · 下级价钱 → Core.SKILL_CHIP_COST[lv]（core.js:1096 升级时扣的就是这一格）。
                 网页版写的是 `[lv-1]`，在 Lv.0 上直接落到 undefined 显示成「—」、
                 其余等级显示的是**上一级**的价钱，都比真实扣费低一档。
             这两处属于"网页版也要跟着改"（单列在回单里），本单只动小游戏端。 */
          /* V1.1.15（2026-09-27 · `page_text_audit` 抓到的"话没说完"）：
             原来这句尾巴用的是「效果 · 下级需 ◆ N」—— **折行点正好落在 `·` 上**，
             于是那一行画出来以 `·` 结尾（尺子按"行尾挂着 · → + / ："判成半句话，父亲大人看着也像）。
             `U.skillRow` 本身是折行的（`CV.wrap`），所以只要**别让分隔符落在行尾**就行：
             句内改成顿号式连接、并把「下级需」收成「升下级」，整句短一截、断点不再挂在连接符上。 */
          /* 满级 / 缺结晶都把"差什么"写在这行小字里（派单 Z-A 要的就是"别让他猜"）。 */
          desc: (sk.desc || '') + (lv >= maxLv
            ? '（已满级：这一项封顶 Lv.' + maxLv + '，没有前置条件）'
            : '（每级 +' + Math.round((D.SKILL_PCT_PER_LV || 0.02) * 100) + '%；升下级 ◆ ' + nextCost
              + '，现有 ◆ ' + fmt(S.cur.otherworld || 0) + '）'),
          btnId: canUp ? 'sk' + i : '',
          btnDis: !canUp,          // 满级 / 结晶不够 → 禁用态（不再出现"看着能点、点了没反应"）
          last: false,
        });
      });
      U.y -= 8 * CV.SCALE;   // 最后一条不留行间距（和卡片底部对齐）
    });

    /* ⑥ 装备（照网页版 V9.5.41：卡片只写装备名 + 强化，点卡片看详情） */
    U.card(function () {
      const slots = D.RECRUIT_SLOTS;
      const eq = S.equipped[id] || {};
      U.h3('🗡 装备', slots.filter((s) => eq[s]).length + '/' + slots.length + ' 件');
      const cols = 3, gap = 10 * CV.SCALE;
      const tw = (U.iw() - gap * (cols - 1)) / cols, th = 62 * CV.SCALE;
      const y0 = U.y;
      slots.forEach(function (slot, i) {
        const e = eq[slot] && S.equips[eq[slot]];
        const x = U.ix() + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (th + gap);
        CV.round(x, y, tw, th, CV.RADIUS_CHIP,  CV.a(CV.C.panel, .55), e ? CV.C.line2 : CV.C.line);
        CV.text(D.EQUIP_SLOTS[slot], x + 8 * CV.SCALE, y + 14 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (e) {
          CV.text(CV.fit(e.name + ' +' + e.enhance, tw - 16 * CV.SCALE, CV.FS.md, true), x + tw / 2, y + th / 2 + 6 * CV.SCALE,
            { size: CV.FS.md, bold: true, align: 'center', color: rarColor(e.rarity) });
          CV.hit('eqd:' + eq[slot], x, y, tw, th);
        } else {
          CV.text('未装备', x + tw / 2, y + th / 2 + 6 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
          /* V9.6.7 自审：空槽以前**点了没反应** —— 网页版是"空格子进这个部位的候选列表" */
          CV.hit('eqslot:' + id + ':' + slot, x, y, tw, th);
        }
      });
      U.y = y0 + Math.ceil(slots.length / cols) * (th + gap) - gap;
      /* V1.1.6（A4 · 父亲大人原话见《定调与口径》§2 第 1 条）：「伙伴详情一键装备」。
         ① **调现成的 `Core.autoEquipBest(id)`**，不新写排序（网页版那颗「⚡ 一键最优装备」用的就是它，
            规则：只从"没穿在任何别人身上"的装备里挑、锁着的不动、绝不抢别人的装备）；
         ② 主角详情早就有这颗（`autoeq_player`），**伙伴详情一直缺** —— 这一轮补上，两端文案一字不差。 */
      U.space(CV.SP[1]);
      U.btnRow([{ label: '⚡ 一键最优装备', style: 'ghost', id: 'autoeq:' + id }]);
    });

    /* ⑦ 属性面板（照网页版：装备/血统/星级都算进来） */
    const st = Core.effectiveStats(id);
    U.card(function () {
      U.h3('📊 属性面板', '装备 / 命格 / 星级都已算进来');
      [['攻击', st.atk], ['防御', st.def], ['生命', st.hp], ['速度', st.spd],
        ['暴击率', (st.crit * 100).toFixed(1) + '%'], ['暴击伤害', (G.fmtMul(st.critDmg)) + '×'],
        ['闪避', ((st.eva || 0) * 100).toFixed(1) + '%'], ['技能伤害', ((st.skillMult || 1) * 100).toFixed(0) + '%']]
        .forEach((r) => U.kv(r[0], String(r[1])));
    });
    /* ================= B 批（2026-10-01）· 人物故事（**放页尾**） =================
       父亲大人：「获得角色 → 获得人物故事」——故事是**用事件表现人物**，不是百科简介。
       只给 `sc-story-data.js` 里写过的人显示（那张表只收"推动过事件"的角色）。
       三则绑定：故事01 首次获得 / 故事02 成长 / 故事03 世界进度·星级·特殊事件。
       ⚠️ **必须排在页尾**：伙伴详情这一页的主动线是"升级 / 技能 / 装备 / 属性"，
         故事卡插在前面会把它们整片挤下去（eqdetail 上实测过一次，`uiw` 对屏外卡只量不画）。 */
    {
      const St = G.Story, chs = St && St.charOf && St.charOf(id);
      if (chs) {
        U.card(function () {
          U.h3('人物故事', chs.role);
          U.note('三则之间是这个人一路上的变化，不是简历。');
          U.space(CV.SP[1]);
          const row = [1, 2, 3].map(function (n) {
            const ok = St.seenChar(id, n);
            /* 标签只写"故事N" —— 320 那一档三颗并排只有 ~92px，带"· 未读"会被挤出画面
               （uiw.js 的 btnRow 按自然宽分配、不换行）；未读用 primary 底色区分即可。 */
            return { label: '故事' + n, style: ok ? 'ghost' : 'primary', id: 'story_char:' + id + ':' + n };
          });
          U.btnRow(row);
        });
      }
    }
  });
  CV.on('back', () => CV.pop());
  /* 队伍操作：无损换将（挑人，继承等级/装备）、下阵 */
  CV.on('swap', function () {
    const S = Core.S;
    G.__swapSlot = S.party.indexOf(cur);
    G.__swapFrom = cur;
    CV.push('pickswap');
  });
  CV.on('off', function () {
    U.confirm('下阵', '确定让「' + nm(cur) + '」下阵？等级与装备都保留在他的卡上，随时可以再上阵。', function () {
      const S = Core.S;
      const i = S.party.indexOf(cur);
      if (i >= 0) S.party[i] = null;
      Core.save();
      CV.pop();
      /* F7 ②：下阵后队伍页那一格当场空出来（看得见 → 删）；确认弹窗已经把话说过一遍了。 */
      CV.render();
    });
  });
  /* 详情页的动作：升级 / 重生 / 升星 / 血统升级 / 技能 +1 —— 都走 core，页内原地重画 */
  /* ================= F7 ②（0928 · 父亲大人：只留操作失败的提醒）=================
     这一整组的成功语全是"等级/星级当场变"（等级数字、星级、血统等级都在卡面上）——**删**；
     失败语（点数不够 / 伙伴经验不够（用经验模块补）/ 已满级）**一个字不改、照旧弹**。 */
  CV.on('lv1', () => { const r = Core.levelUp(cur, 1); if (!r.ok) CV.toast(r.msg || '升不了'); CV.render(); });
  CV.on('lv10', () => { const r = Core.levelUp(cur, 10); if (!r.ok) CV.toast(r.msg || '升不了'); CV.render(); });
  CV.on('reborn', function () {
    U.confirm('伙伴重生', '把「' + nm(cur) + '」重置回 Lv.0，返还 ' + fmt(Core.expSpentOn(cur)) + ' 伙伴经验（点数不返还）。星级 / 命格 / 装备 / 精华都不动。', function () {
      const r = Core.rebornChar(cur);
      /* F7 ②：重生后等级当场回 Lv.0（看得见 → 删）；失败（"已经是 Lv.0 了"）留。 */
      if (!r.ok) CV.toast(r.msg || '重生不了');
      CV.render();
    });
  });
  CV.on('starup', () => { const r = Core.starUp(cur); if (!r.ok) CV.toast(r.msg || '升不了星'); CV.render(); });
  /* V1.1.6（A4）：伙伴详情「一键最优装备」—— 与主角页那颗同一份实现与文案
     （`Core.autoEquipBest(id)` 只给这一个人配，绝不碰别人的装备）。 */
  CV.on('autoeq:*', function (id) {
    const r = Core.autoEquipBest(id);
    /* F7 ②：这**两**句都留 —— "已换上 N 件"是一次批量结果、"背包里没有更好的了"是失败，
       都不在界面上直接看得出（装备栏是好几格一起变的）。 */
    CV.toast(r.changed ? '已换上 ' + r.changed + ' 件（只从背包里没穿的装备挑）' : '背包里没有更好的了', 2400);
    CV.render();
  });
  CV.on('blup', () => { const r = Core.bloodlineUpgrade(cur); if (!r.ok) CV.toast(r.msg || '升不了'); CV.render(); });
  [0, 1, 2].forEach((i) => CV.on('sk' + i, () => { const r = Core.skillUp(cur, i); if (!r.ok) CV.toast(r.msg || '升不了'); CV.render(); }));
})();
