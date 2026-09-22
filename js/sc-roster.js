/* 执灯者 = 伙伴总览（照网页版 js/ui.js 的 rosterScreen→charsScreen / charDetail）
   ------------------------------------------------------------------------------
   网页版 V9.5.45 起：执灯者这一栏**直接就是伙伴总览**（队伍/成长搬去主页养成）。
   总览页结构：筛选胶囊行（右端是「📕 图鉴」）→ 排序行 → 已收集提示 → 三列卡片网格。
   卡片照网页版 .char-card：上阵角标 + 头像 + 名字 + 星级 + Lv·战力 + 装备状态。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const nm = (id) => Core.charName(id);
  let cur = null;                                          // 详情页当前看的伙伴
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  /* 头像（网页版 charAvatar：圆形 + 首字 + 稀有度描边色） */
  function avatar(id, size, y) {
    const ch = D.charById[id] || {};
    const c = rarColor(ch.rarity);
    const cx = U.pad() + U.cw() / 2;
    CV.ctx.beginPath(); CV.ctx.arc(cx, y + size / 2, size / 2, 0, Math.PI * 2);
    CV.ctx.fillStyle = CV.C.panel3; CV.ctx.fill();
    CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = c; CV.ctx.stroke();
    CV.text(nm(id).slice(0, 1), cx, y + size / 2, { size: size * 0.44, bold: true, align: 'center', color: c });
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
    return [].concat(ids).sort((a, b) => {
      const pa = S.party.includes(a) ? 1 : 0, pb = S.party.includes(b) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (rarIdx(a) !== rarIdx(b)) return rarIdx(b) - rarIdx(a);
      if (S.chars[a].lv !== S.chars[b].lv) return S.chars[b].lv - S.chars[a].lv;
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
       "默认的排序顺序就已经能很好的区分这些了"。只留默认顺序 + 右端「📕 图鉴」。 */
    /* V9.6.10（父亲大人："那个已收集的小字跟图鉴那个按钮水平对齐，现在不是很浪费空间吗"）：
       把「已收集…」搬到**图鉴那一行**、左边，整块内容跟着往上提一行。 */
    const pillH = 36 * CV.SCALE;
    const codexW = CV.measure('图鉴', CV.FS.sm) + 24 * CV.SCALE;
    const gy = U.y;
    const cs = Core.codexState();
    const infoTxt = '已收集 ' + cs.owned + '/' + cs.total + ' · 拥有 ' + Object.keys(Core.S.chars).length
      + ' · 当前显示 ' + listSorted().length;
    CV.text(CV.fit(infoTxt, U.cw() - codexW - 10 * CV.SCALE, CV.FS.sm), U.pad(), gy + pillH / 2,
      { size: CV.FS.sm, color: CV.C.dim });
    U.btn(U.pad() + U.cw() - codexW, gy, codexW, pillH, '图鉴', 'ghost', 'open_codex');
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
    /* V1.1（视觉语言基准 §4.2）：卡片底部让出 18px 画**档色铭牌 ＋ 档码字**（品质框 v2）。 */
    const BAND = 18 * CV.SCALE;
    const ch = 140 * CV.SCALE + BAND;
    const PAD = 10 * CV.SCALE, AV = 46 * CV.SCALE, AV_GAP = 6 * CV.SCALE;
    const NAME_H = 18.5 * CV.SCALE, SMALL_H = 15 * CV.SCALE;
    const y0 = U.y;
    list.forEach((id, i) => {
      const cx = U.pad() + (i % cols) * (cw + g2), cy = y0 + Math.floor(i / cols) * (ch + g2);
      const isP = Core.S.party.includes(id);
      const ch0 = D.charById[id], c0 = Core.S.chars[id];
      CV.qframe(cx, cy, cw, ch, ch0.rarity, 12 * CV.SCALE, BAND);
      if (isP) {
        const tw = CV.measure('上阵', CV.FS.xs) + 10 * CV.SCALE;   // .inparty：padding 1px 5px
        CV.round(cx + cw - tw - 3 * CV.SCALE, cy + 3 * CV.SCALE, tw, 17 * CV.SCALE, CV.RADIUS_CHIP,  CV.C.accent);
        CV.text('上阵', cx + cw - tw / 2 - 3 * CV.SCALE, cy + 11.5 * CV.SCALE, { size: CV.FS.xs, align: 'center', color: '#fff' });
      }
      /* 头像 → 名字 → 星级 → 两行小字：每一行的中心都按"上一行结束处"往下推（网页版顺序） */
      const acx = cx + cw / 2;
      let ly = cy + PAD;                                  // 内容区顶部
      const avCy = ly + AV / 2;
      CV.ctx.beginPath(); CV.ctx.arc(acx, avCy, AV / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.C.panel3; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = rarColor(ch0.rarity); CV.ctx.stroke();
      CV.text(nm(id).slice(0, 1), acx, avCy, { size: AV * 0.44, bold: true, align: 'center', color: rarColor(ch0.rarity) });
      ly += AV + AV_GAP;
      CV.text(CV.fit(nm(id), cw - PAD * 2, CV.FS.lg, true), acx, ly + NAME_H / 2, { size: CV.FS.lg, bold: true, align: 'center' });
      ly += NAME_H;
      CV.text('★'.repeat(c0.star) + '☆'.repeat(Math.max(0, D.RARITY_MAXSTAR[ch0.rarity] - c0.star)), acx, ly + SMALL_H / 2,
        { size: CV.FS.xs, color: CV.C.gold, align: 'center', ls: -1 });   // 网页版 .char-card .stars：letter-spacing -1
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
    /* 返回条（二级页左上角返回，照网页版 .page-head） */
    const bh = 40 * CV.SCALE;
    U.btn(U.pad(), U.y, 40 * CV.SCALE, bh, '‹', 'ghost', 'back');
    CV.text(nm(id), U.pad() + U.cw() / 2, U.y + bh / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += bh + CV.SP[2];

    /* ① 头部：头像 + 名字/稀有度/星级/Lv·碎片·血统 + 右侧战力 */
    U.card(function () {
      const h = 76 * CV.SCALE, top = U.y;
      const asz = 56 * CV.SCALE;
      const cx = U.ix() + asz / 2;
      CV.ctx.beginPath(); CV.ctx.arc(cx, top + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = CV.C.panel3; CV.ctx.fill(); CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = rarColor(ch.rarity); CV.ctx.stroke();
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
      CV.text('Lv.' + c.lv + ' · ' + ch.rarity + ' 碎片 ' + Core.shardPoolOf(ch.rarity) + ' · 命格 Lv.' + c.bloodlineLv, tx, top + 66 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
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
        { label: '升 1 级', style: cost ? 'ghost' : 'ghost', id: cost ? 'lv1' : 'noop' },
        { label: '升 10 级', style: 'ghost', id: cost ? 'lv10' : 'noop' },
        { label: '重生', style: 'ghost', id: c.lv > 1 ? 'reborn' : 'noop' },
      ]);
      U.space(CV.SP[1]);
      /* V9.6.90：与网页版同一句（网页版还带一句"经验模块在背包里用，直接进这个池子"） */
      U.hint(cost ? '升下一级需要 ' + fmt(cost.exp) + ' 伙伴经验 + ◉ ' + fmt(cost.points)
        + ' · 经验模块在背包里用，直接进这个池子'
        : '已满级', 4 * CV.SCALE);
    });

    /* ③ 星级（碎片升星） */
    U.card(function () {
      /* V9.6.130（父亲大人："我现在的 UR 升星级还是统一只需 6 碎片啊"）：
         原来是"星级 x / 6"——那个 6 是**星级上限**，不是碎片数，很容易看错。
         现在把三件事分行写清：当前星级 / 升下一星要多少碎片 / 池子里有多少。 */
      U.h3('⭐ 星级', Core.charName(id) + ' · ' + ch.rarity + ' 档');
      U.kv('当前星级', c.star + ' / ' + maxStar + ' ★');
      U.kv('升下一星需要', c.star >= maxStar ? '已满星' : (D.STAR_COST[c.star] + ' 碎片'), CV.C.gold);
      U.kv(ch.rarity + ' 通用碎片池', String(Core.shardPoolOf(ch.rarity)));
      U.btnRow([{ label: c.star >= maxStar ? '已满星' : '升星', style: 'ghost', id: c.star >= maxStar ? 'noop' : 'starup' }]);
    });

    /* ④ 血统（等级 + 升级） */
    const blCost = c.bloodlineLv < D.BLOODLINE_MAX ? D.bloodlineCost(c.bloodlineLv) : null;
    U.card(function () {
      U.h3('🧬 ' + ch.bloodline + '命格', 'Lv.' + c.bloodlineLv + ' / ' + D.BLOODLINE_MAX);
      U.btnRow([{
        label: blCost ? '命格升级（◆ ' + blCost.otherworld + ' + ◉ ' + fmt(blCost.points) + '）' : '已满级',
        style: 'ghost', id: blCost ? 'blup' : 'noop',
      }]);
    });

    /* ⑤ 技能（芯片升级） */
    U.card(function () {
      U.h3('⚡ 技能', '◆ 异界结晶 ' + fmt(S.cur.otherworld || 0));
      [ch.skills.s1, ch.skills.s2, ch.skills.ult].forEach(function (sk, i) {
        if (!sk) return;
        const lv = (c.skillLv || [0, 0, 0])[i];   // V9.5.82：技能从 0 级起
        /* V9.6.117（排版层级 + 间距，父亲大人："技能版面…间距又贴在一起"）：
           这里原来是"名字挤在 20px 行高里 + 描述紧跟 + 一个整行大按钮"，
           和主角详情那套完全不一样。现在两个页面**共用 U.skillRow**（＝网页版 .skill-row）。 */
        U.skillRow({
          name: ['技能', '技能', '必杀'][i] + '·' + sk.name,
          tag: 'Lv.' + lv + '/' + D.SKILL_MAX_BY_INDEX[i],
          desc: sk.desc || '',
          btnId: lv < 10 ? 'sk' + i : '',
          btnDis: !(lv < 10),      // 满级 → 禁用态（原来绑的是 'noop'：看着能点、点了什么都不发生）
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
        CV.round(x, y, tw, th, CV.RADIUS_CHIP,  CV.C.panel, e ? CV.C.line2 : CV.C.line);
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
  });
  CV.on('back', () => CV.pop());
  CV.on('noop', () => {});
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
      CV.toast('已下阵');
      CV.render();
    });
  });
  /* 详情页的动作：升级 / 重生 / 升星 / 血统升级 / 技能 +1 —— 都走 core，页内原地重画 */
  CV.on('lv1', () => { const r = Core.levelUp(cur, 1); CV.toast(r.msg); CV.render(); });
  CV.on('lv10', () => { const r = Core.levelUp(cur, 10); CV.toast(r.msg); CV.render(); });
  CV.on('reborn', function () {
    U.confirm('伙伴重生', '把「' + nm(cur) + '」重置回 Lv.0，返还 ' + fmt(Core.expSpentOn(cur)) + ' 伙伴经验（点数不返还）。星级 / 命格 / 装备 / 精华都不动。', function () {
      const r = Core.rebornChar(cur);
      CV.toast(r.msg || '已重生');
      CV.render();
    });
  });
  CV.on('starup', () => { const r = Core.starUp(cur); CV.toast(r.msg); CV.render(); });
  CV.on('blup', () => { const r = Core.bloodlineUpgrade(cur); CV.toast(r.msg); CV.render(); });
  [0, 1, 2].forEach((i) => CV.on('sk' + i, () => { const r = Core.skillUp(cur, i); CV.toast(r.msg); CV.render(); }));
})();
