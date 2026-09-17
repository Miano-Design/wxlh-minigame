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
    CV.ctx.fillStyle = '#232c42'; CV.ctx.fill();
    CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = c; CV.ctx.stroke();
    CV.text(nm(id).slice(0, 1), cx, y + size / 2, { size: size * 0.44, bold: true, align: 'center', color: c });
  }
  /* 星级（网页版 .stars：金色，字距收紧） */
  function stars(n, max, x, y, size) {
    CV.text('★'.repeat(n) + '☆'.repeat(Math.max(0, max - n)), x, y, { size: size || CV.FS.sm, color: CV.C.gold });
  }

  /* ---------- 状态：筛选 / 排序（页面级，切页签不丢） ---------- */
  let filter = 'all', sort = 'default';
  const FILTERS = [['all', '全部'], ['party', '已上阵'], ['SSR', 'SSR+'], ['N', 'N'], ['R', 'R'], ['SR', 'SR']];
  const SORTS = [['default', '默认'], ['power', '战力'], ['level', '等级'], ['star', '星级'], ['notmax', '未满级'], ['noequip', '没穿装备']];
  const rarIdx = (id) => D.RARITIES.indexOf(D.charById[id].rarity);
  const eqCount = (id) => Object.keys(Core.S.equipped[id] || {}).filter((k) => Core.S.equipped[id][k]).length;
  function listSorted() {
    const S = Core.S;
    let list = Object.keys(S.chars);
    if (filter === 'party') list = list.filter((id) => S.party.includes(id));
    else if (filter === 'SSR') list = list.filter((id) => ['SSR', 'UR'].includes(D.charById[id].rarity));
    else if (filter !== 'all') list = list.filter((id) => D.charById[id].rarity === filter);
    const cmp = {
      /* 网页版默认排序（父亲大人定的）：上阵 → 等级 → 稀有度 → 星级 */
      default: (a, b) => {
        const pa = S.party.includes(a) ? 1 : 0, pb = S.party.includes(b) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        if (S.chars[a].lv !== S.chars[b].lv) return S.chars[b].lv - S.chars[a].lv;
        if (rarIdx(a) !== rarIdx(b)) return rarIdx(b) - rarIdx(a);
        return S.chars[b].star - S.chars[a].star;
      },
      power: (a, b) => Core.power(b) - Core.power(a),
      level: (a, b) => S.chars[b].lv - S.chars[a].lv,
      star: (a, b) => S.chars[b].star - S.chars[a].star,
      notmax: (a, b) => (Core.levelCost(a) ? 0 : 1) - (Core.levelCost(b) ? 0 : 1) || Core.power(b) - Core.power(a),
      noequip: (a, b) => eqCount(a) - eqCount(b) || Core.power(b) - Core.power(a),
    }[sort] || null;
    if (cmp) return list.sort(cmp);
    return list.sort((a, b) => cmp(a, b) || 0);
  }

  CV.register('roster', function () {
    U.begin();
    /* 筛选胶囊行：左边一排胶囊，右端「📕 图鉴」（网页版 V9.5.55） */
    const pillH = 34 * CV.SCALE, gap = 6 * CV.SCALE;
    let x = U.pad();
    const gy = U.y;
    FILTERS.forEach((f) => {
      const w = CV.measure(f[1], CV.FS.md) + 24 * CV.SCALE;
      CV.round(x, gy, w, pillH, pillH / 2, filter === f[0] ? '#3a1620' : CV.C.panel, filter === f[0] ? CV.C.accent : CV.C.line);
      CV.text(f[1], x + w / 2, gy + pillH / 2, { size: CV.FS.md, align: 'center', color: filter === f[0] ? CV.C.text : CV.C.text2 });
      CV.hit('rf:' + f[0], x, gy, w, pillH);
      x += w + gap;
    });
    const codexW = CV.measure('📕 图鉴', CV.FS.md) + 22 * CV.SCALE;
    U.btn(U.pad() + U.cw() - codexW, gy, codexW, pillH, '📕 图鉴', 'ghost', 'open_codex');
    U.y = gy + pillH + CV.SP[1];
    /* 排序行 */
    const sy = U.y;
    CV.text('排序', U.pad() + 2, sy + pillH / 2, { size: CV.FS.sm, color: CV.C.dim });
    let sx = U.pad() + 30 * CV.SCALE;
    SORTS.forEach((s) => {
      const w = CV.measure(s[1], CV.FS.sm) + 20 * CV.SCALE;
      if (sx + w > U.pad() + U.cw()) return;                  // 放不下的先不画（窄屏）
      CV.round(sx, sy, w, pillH, pillH / 2, sort === s[0] ? '#3a1620' : CV.C.panel, sort === s[0] ? CV.C.accent : CV.C.line);
      CV.text(s[1], sx + w / 2, sy + pillH / 2, { size: CV.FS.sm, align: 'center', color: sort === s[0] ? CV.C.text : CV.C.text2 });
      CV.hit('rs:' + s[0], sx, sy, w, pillH);
      sx += w + gap;
    });
    U.y = sy + pillH + CV.SP[1];
    /* 已收集提示（网页版那行小灰字） */
    const cs = Core.codexState();
    U.hint('已收集 ' + cs.owned + '/' + cs.total + ' · 拥有 ' + Object.keys(Core.S.chars).length + ' · 当前显示 ' + listSorted().length);
    U.space(CV.SP[1]);
    /* 三列卡片网格（.char-grid + .char-card） */
    const list = listSorted();
    if (!list.length) {
      U.hint(Object.keys(Core.S.chars).length ? '没有符合条件的伙伴' : '还没有招募到任何伙伴');
      return;
    }
    const cols = 3, g2 = 10 * CV.SCALE;
    const cw = (U.cw() - g2 * (cols - 1)) / cols;
    const ch = 122 * CV.SCALE;
    const y0 = U.y;
    list.forEach((id, i) => {
      const cx = U.pad() + (i % cols) * (cw + g2), cy = y0 + Math.floor(i / cols) * (ch + g2);
      const isP = Core.S.party.includes(id);
      const ch0 = D.charById[id], c0 = Core.S.chars[id];
      CV.round(cx, cy, cw, ch, 12 * CV.SCALE, CV.C.panel2, rarColor(ch0.rarity));
      if (isP) {
        const tw = CV.measure('上阵', CV.FS.xs) + 10 * CV.SCALE;
        CV.round(cx + cw - tw - 4 * CV.SCALE, cy + 4 * CV.SCALE, tw, 16 * CV.SCALE, 6 * CV.SCALE, CV.C.accent);
        CV.text('上阵', cx + cw - tw / 2 - 4 * CV.SCALE, cy + 12 * CV.SCALE, { size: CV.FS.xs, align: 'center', color: '#fff' });
      }
      // 头像
      const asz = 46 * CV.SCALE, acx = cx + cw / 2;
      CV.ctx.beginPath(); CV.ctx.arc(acx, cy + 10 * CV.SCALE + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = '#232c42'; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = rarColor(ch0.rarity); CV.ctx.stroke();
      CV.text(nm(id).slice(0, 1), acx, cy + 10 * CV.SCALE + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: rarColor(ch0.rarity) });
      // 名字 / 星级 / 两行状态
      CV.text(CV.fit(nm(id), cw - 12 * CV.SCALE, CV.FS.lg, true), acx, cy + 68 * CV.SCALE, { size: CV.FS.lg, bold: true, align: 'center' });
      CV.text('★'.repeat(c0.star) + '☆'.repeat(Math.max(0, D.RARITY_MAXSTAR[ch0.rarity] - c0.star)), acx, cy + 84 * CV.SCALE,
        { size: CV.FS.xs, color: CV.C.gold, align: 'center' });
      CV.text('Lv.' + c0.lv + ' · 战力 ' + fmt(Core.power(id)), acx, cy + 99 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
      const eqn = eqCount(id);
      CV.text(eqn ? '装备 ' + eqn + '/6' : '未穿装备', acx, cy + 113 * CV.SCALE, { size: CV.FS.xs, color: eqn ? CV.C.dim : CV.C.gold, align: 'center' });
      CV.hit('char:' + id, cx, cy, cw, ch);
      CV.on('char:' + id, function () { CV.push('char', { id: id }); });   // 点卡片进详情
    });
    U.y = y0 + Math.ceil(list.length / cols) * (ch + g2);
  });
  CV.on('rf:all', () => { filter = 'all'; CV.render(); });
  ['party', 'SSR', 'N', 'R', 'SR'].forEach((k) => CV.on('rf:' + k, () => { filter = k; CV.render(); }));
  SORTS.forEach((s) => CV.on('rs:' + s[0], () => { sort = s[0]; CV.render(); }));
  Object.keys(D.characters).length;                        // 触发表初始化（保持与网页版一致的数据来源）
  CV.on('open_codex', () => CV.toast('伙伴图鉴在下一批复刻'));

  /* ================= 伙伴详情（照网页版 charDetail） ================= */
  CV.register('char', function (opts) {
    const id = (opts && opts.id) || Object.keys(Core.S.chars)[0];
    if (!id) { U.begin(); U.hint('还没有伙伴'); return; }
    const S = Core.S, ch = D.charById[id], c = S.chars[id];
    cur = id;
    const maxStar = D.RARITY_MAXSTAR[ch.rarity];
    const cost = Core.levelCost(id);
    const starCost = c.star < maxStar ? D.starCostOf ? D.starCostOf(c.star) : null : null;
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
      CV.ctx.fillStyle = '#232c42'; CV.ctx.fill(); CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = rarColor(ch.rarity); CV.ctx.stroke();
      CV.text(nm(id).slice(0, 1), cx, top + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: rarColor(ch.rarity) });
      const tx = U.ix() + asz + 12 * CV.SCALE;
      CV.text(ch.rarity, tx, top + 16 * CV.SCALE, { size: CV.FS.f1, bold: true, color: rarColor(ch.rarity) });
      const rw = CV.measure(ch.rarity, CV.FS.f1, true);
      CV.text(CV.fit(nm(id), U.iw() - asz - rw - 60 * CV.SCALE, CV.FS.f1, true), tx + rw + 7 * CV.SCALE, top + 16 * CV.SCALE, { size: CV.FS.f1, bold: true });
      CV.text('★'.repeat(c.star) + '☆'.repeat(Math.max(0, maxStar - c.star)), tx, top + 34 * CV.SCALE, { size: CV.FS.sm, color: CV.C.gold });
      CV.text(ch.role + ' · ' + ch.faction + ' · ' + ch.bloodline + '血统', tx, top + 50 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text('Lv.' + c.lv + ' · 碎片 ' + c.shards + ' · 血统 Lv.' + c.bloodlineLv, tx, top + 66 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text(fmt(Core.power(id)), U.ix() + U.iw(), top + 18 * CV.SCALE, { size: CV.FS.f2, bold: true, color: CV.C.gold, align: 'right' });
      CV.text('战力', U.ix() + U.iw(), top + 38 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      U.y = top + h;
    });

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
      U.hint(cost ? '升下一级需要 ' + fmt(cost.exp) + ' 伙伴经验 + ◈ ' + fmt(cost.points)
        : '已满级', 4 * CV.SCALE);
    });

    /* ③ 星级（碎片升星） */
    U.card(function () {
      U.h3('⭐ 星级', c.star + ' / ' + maxStar + ' · 碎片 ' + c.shards);
      U.btnRow([{ label: c.star >= maxStar ? '已满星' : '升星', style: 'ghost', id: c.star >= maxStar ? 'noop' : 'starup' }]);
    });

    /* ④ 血统（等级 + 升级） */
    const blCost = c.bloodlineLv < D.BLOODLINE_MAX ? D.bloodlineCost(c.bloodlineLv) : null;
    U.card(function () {
      U.h3('🩸 ' + ch.bloodline + '血统', 'Lv.' + c.bloodlineLv + ' / ' + D.BLOODLINE_MAX);
      U.btnRow([{
        label: blCost ? '血统升级（❥ ' + blCost.bloodCrystal + ' + ◈ ' + fmt(blCost.points) + '）' : '已满级',
        style: 'ghost', id: blCost ? 'blup' : 'noop',
      }]);
    });

    /* ⑤ 技能（芯片升级） */
    U.card(function () {
      U.h3('⚡ 技能', '芯片 ▣ ' + fmt(S.cur.skillChip || 0));
      [ch.skills.s1, ch.skills.s2, ch.skills.ult].forEach(function (sk, i) {
        if (!sk) return;
        const lv = (c.skillLv || [0, 0, 0])[i];   // V9.5.82：技能从 0 级起
        CV.text(CV.fit(['技能', '技能', '必杀'][i] + '·' + sk.name + '（Lv.' + lv + '/' + D.SKILL_MAX_BY_INDEX[i] + '）', U.iw(), CV.FS.lg, true), U.ix(), U.y + 8 * CV.SCALE, { size: CV.FS.lg, bold: true });
        U.y += 20 * CV.SCALE;
        U.hint(sk.desc || '', 0);
        U.space(CV.SP[1]);
        U.btnRow([{ label: '+1', style: 'ghost', id: lv < 10 ? 'sk' + i : 'noop' }]);
        U.space(CV.SP[2]);
      });
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
        CV.round(x, y, tw, th, 6 * CV.SCALE, CV.C.panel, e ? CV.C.line2 : CV.C.line);
        CV.text(D.EQUIP_SLOTS[slot], x + 8 * CV.SCALE, y + 14 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (e) {
          CV.text(CV.fit(e.name + ' +' + e.enhance, tw - 16 * CV.SCALE, CV.FS.md, true), x + tw / 2, y + th / 2 + 6 * CV.SCALE,
            { size: CV.FS.md, bold: true, align: 'center', color: rarColor(e.rarity) });
          CV.hit('eqd:' + eq[slot], x, y, tw, th);
        } else {
          CV.text('未装备', x + tw / 2, y + th / 2 + 6 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
        }
      });
      U.y = y0 + Math.ceil(slots.length / cols) * (th + gap) - gap;
    });

    /* ⑦ 属性面板（照网页版：装备/血统/星级都算进来） */
    const st = Core.effectiveStats(id);
    U.card(function () {
      U.h3('📊 属性面板', '装备 / 血统 / 星级都已算进来');
      [['攻击', st.atk], ['防御', st.def], ['生命', st.hp], ['速度', st.spd],
        ['暴击率', (st.crit * 100).toFixed(1) + '%'], ['暴击伤害', st.critDmg.toFixed(2) + '×'],
        ['闪避', ((st.eva || 0) * 100).toFixed(1) + '%'], ['技能伤害', ((st.skillMult || 1) * 100).toFixed(0) + '%']]
        .forEach((r) => U.kv(r[0], String(r[1])));
    });
  });
  CV.on('back', () => CV.pop());
  CV.on('noop', () => {});
  /* 详情页的动作：升级 / 重生 / 升星 / 血统升级 / 技能 +1 —— 都走 core，页内原地重画 */
  CV.on('lv1', () => { const r = Core.levelUp(cur, 1); CV.toast(r.msg); CV.render(); });
  CV.on('lv10', () => { const r = Core.levelUp(cur, 10); CV.toast(r.msg); CV.render(); });
  CV.on('reborn', function () {
    U.confirm('伙伴重生', '把「' + nm(cur) + '」重置回 Lv.0，返还 ' + fmt(Core.expSpentOn(cur)) + ' 伙伴经验（点数不返还）。星级 / 血统 / 装备 / 血清都不动。', function () {
      const r = Core.rebornChar(cur);
      CV.toast(r.msg || '已重生');
      CV.render();
    });
  });
  CV.on('starup', () => { const r = Core.starUp(cur); CV.toast(r.msg); CV.render(); });
  CV.on('blup', () => { const r = Core.bloodlineUpgrade(cur); CV.toast(r.msg); CV.render(); });
  [0, 1, 2].forEach((i) => CV.on('sk' + i, () => { const r = Core.skillUp(cur, i); CV.toast(r.msg); CV.render(); }));
  CV.on('eqd:0', () => CV.toast('装备详情（弹窗）在下一批复刻'));
})();
