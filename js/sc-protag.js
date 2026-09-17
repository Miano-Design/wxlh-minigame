/* 主角详情（角色页）—— 照网页版 js/ui.js 的 protagonistDetail 一段一段复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     ① 头部卡：头像 56 + 名字 +「执灯者本人」+ Lv·血统 + 铭刻/六维待分 + 右侧战力
        （下面还有一条 EXP 进度条 + 「EXP x% · 当前挂机 y EXP/分」）
     ② 六维属性：标题右侧"可用点数"+ 重置；每维一行（名字/说明、已分配 N 点 → +M、+1/+10）
     ③ 技能：标题右侧"可用技能点"+ 重置；三个技能行（等级标签 + +1 + 说明）+ 被动
     ④ 装备：六个槽（点格子看详情）
     ⑤ 血统：等级 / 升级（显示打完折的实价）/ 未觉醒时的选择
     ⑥ 境界：已突破 N/36、当前境界、加成、查看境界·渡劫
     ⑦ 属性面板：装备/血统/境界/铭刻都算进来的最终数值
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  /* 属性面板（网页版 statGrid 的同口径：攻击/防御/生命/速度/暴击/暴伤/闪避/吸血/减伤/技能倍率） */
  function statRows(st) {
    if (!st) return [];
    const pc = (v) => Math.round((v || 0) * 100) + '%';
    const rows = [
      ['攻击', fmt(st.atk)], ['防御', fmt(st.def)], ['生命', fmt(st.hp)], ['速度', fmt(st.spd)],
      ['暴击', pc(st.crit)], ['暴击伤害', '×' + (st.critDmg || 2).toFixed(2)], ['闪避', pc(st.eva)],
      ['吸血', pc(st.lifesteal)],
    ];
    const red = Math.min(0.6, (st.resPct || 0) + (st.dmgReduce || 0));
    if (red > 0) rows.push(['减伤', pc(red)]);
    rows.push(['技能倍率', '×' + (st.skillMult || 1).toFixed(2)]);
    return rows;
  }

  CV.register('protag', function () {
    const S = Core.S;
    U.begin();
    /* 返回条（二级页左上角，照网页版 .page-head） */
    const bh = 40 * CV.SCALE;
    U.btn(U.pad(), U.y, 40 * CV.SCALE, bh, '‹', 'ghost', 'back_home');
    CV.text(Core.charName('@player') + '（主角）', U.pad() + U.cw() / 2, U.y + bh / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += bh + CV.SP[2];

    const P = Core.protagonistSkills();
    const st = Core.effectivePlayerStats();
    const spentAttr = D.ATTR_META.reduce((s, a) => s + ((S.player.attrs && S.player.attrs[a.id]) || 0), 0);
    const spentSkill = (S.player.skillLv || [0, 0, 0]).reduce((s, x) => s + x, 0);
    const gl = S.player.geneLock;
    const blCost = S.player.bloodline ? Core.bloodlineQuote('@player') : null;
    const lvlPct = Math.min(100, S.player.exp / (D.EXP_TABLE[S.player.level] || 1) * 100);

    /* ① 头部 */
    U.card(function () {
      const h = 76 * CV.SCALE, top = U.y, asz = 56 * CV.SCALE;
      const cx = U.ix() + asz / 2;
      CV.ctx.beginPath(); CV.ctx.arc(cx, top + asz / 2, asz / 2, 0, Math.PI * 2);
      CV.ctx.fillStyle = '#232c42'; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = CV.C.gold; CV.ctx.stroke();
      CV.text(Core.charName('@player').slice(0, 1), cx, top + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: CV.C.gold });
      const tx = U.ix() + asz + 12 * CV.SCALE;
      CV.text(Core.charName('@player'), tx, top + 14 * CV.SCALE, { size: CV.FS.f1, bold: true });
      const nw = CV.measure(Core.charName('@player'), CV.FS.f1, true);
      const tag = '执灯者本人';
      const tw = CV.measure(tag, CV.FS.sm) + 12 * CV.SCALE;
      CV.round(tx + nw + 8 * CV.SCALE, top + 6 * CV.SCALE, tw, 18 * CV.SCALE, CV.RADIUS_SM, null, '#e6b64c66');
      CV.text(tag, tx + nw + 8 * CV.SCALE + tw / 2, top + 15 * CV.SCALE, { size: CV.FS.sm, color: CV.C.gold, align: 'center' });
      CV.text('Lv.' + S.player.level + '（玩家等级）· ' + (S.player.bloodline ? S.player.bloodline + '血统 Lv.' + S.player.bloodlineLv : '未选血统'),
        tx, top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text('铭刻 ' + (gl > 0 ? D.GENE_LOCKS[gl - 1].name : '未解锁') + ' · 六维待分 ' + (S.player.attrPoints || 0) + ' 点',
        tx, top + 52 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text(fmt(Core.playerPower()), U.ix() + U.iw(), top + 18 * CV.SCALE, { size: 20 * CV.SCALE, bold: true, color: CV.C.gold, align: 'right' });
      CV.text('战力', U.ix() + U.iw(), top + 38 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      U.y = top + h;
      /* EXP 进度条 + 挂机经验（网页版这两行就在头部卡里） */
      U.bar(lvlPct / 100, CV.C.gold);
      U.y += 4 * CV.SCALE;
      U.hint('EXP ' + Math.floor(lvlPct) + '% · 当前挂机 ' + Core.idleRates().expPerMin.toFixed(1) + ' EXP/分', 4 * CV.SCALE);
    });

    /* ② 六维属性 */
    U.card(function () {
      U.h3('🎯 六维属性', '可用点数 ' + (S.player.attrPoints || 0),
        { btn: { label: '↺ 重置', id: spentAttr > 0 ? 'attr_reset' : '' } });
      const has = (S.player.attrPoints || 0) > 0;
      D.ATTR_META.forEach(function (a) {
        const n = (S.player.attrs && S.player.attrs[a.id]) || 0;
        const top = U.y;
        U.listRow({ t1: a.name + '  ' + a.desc, t2: '已分配 ' + n + ' 点 → +' + n * D.ATTR_POINT_VALUE, rightW: 110 * CV.SCALE });
        const bw = 46 * CV.SCALE, bw2 = 52 * CV.SCALE, gap = 6 * CV.SCALE;
        const by = top + (U.y - top) / 2 - 17 * CV.SCALE;
        U.btn(U.ix() + U.iw() - bw - bw2 - gap, by, bw, 34 * CV.SCALE, '+1', 'ghost', has ? 'attr:' + a.id + ':1' : '');
        U.btn(U.ix() + U.iw() - bw2, by, bw2, 34 * CV.SCALE, '+10', 'ghost', has ? 'attr:' + a.id + ':10' : '');
      });
    });

    /* ③ 技能 */
    U.card(function () {
      U.h3('⚡ ' + (S.player.bloodline ? S.player.bloodline + '血统技能' : '技能'), '可用技能点 ' + (S.player.skillPoints || 0),
        { btn: { label: '↺ 重置', id: spentSkill > 0 ? 'pskill_reset' : '' } });
      [P.s1, P.s2, P.ult].forEach(function (sk, i) {
        if (!sk) return;
        const lv = (S.player.skillLv || [0, 0, 0])[i];
        const max = D.SKILL_MAX_BY_INDEX[i];
        const top = U.y;
        CV.text(['技能', '技能', '必杀'][i] + '·' + sk.name, U.ix(), top + 9 * CV.SCALE, { size: CV.FS.lg, bold: true });
        const nw = CV.measure(['技能', '技能', '必杀'][i] + '·' + sk.name, CV.FS.lg, true);
        const tag = 'Lv.' + lv + '/' + max;
        const tw = CV.measure(tag, CV.FS.xs) + 12 * CV.SCALE;
        CV.round(U.ix() + nw + 6 * CV.SCALE, top + 1 * CV.SCALE, tw, 17 * CV.SCALE, CV.RADIUS_SM, null, CV.C.line2);
        CV.text(tag, U.ix() + nw + 6 * CV.SCALE + tw / 2, top + 9 * CV.SCALE, { size: CV.FS.xs, color: CV.C.text2, align: 'center' });
        const bw = 40 * CV.SCALE;
        const canUp = (S.player.skillPoints || 0) > 0 && lv < max;
        U.btn(U.ix() + U.iw() - bw, top - 4 * CV.SCALE, bw, 30 * CV.SCALE, '+1', 'ghost', canUp ? 'pskill:' + i : '');
        U.y = top + 22 * CV.SCALE;
        U.hint(sk.desc || '', 0);
        U.space(CV.SP[1]);
      });
      U.hint('被动·' + P.passive.name, 2 * CV.SCALE);
      U.hint(P.passive.desc || '', 0);
    });

    /* ④ 装备（六槽，点格子看详情） */
    U.card(function () {
      const slots = D.PLAYER_SLOTS, eq = S.equipped['@player'] || {};
      U.h3('🗡 装备', slots.filter((s) => eq[s]).length + '/' + slots.length + ' 件');
      const cols = 3, gap = 10 * CV.SCALE;
      const tw2 = (U.iw() - gap * (cols - 1)) / cols, th = 62 * CV.SCALE;
      const y0 = U.y;
      slots.forEach(function (slot, i) {
        const e = eq[slot] && S.equips[eq[slot]];
        const x = U.ix() + (i % cols) * (tw2 + gap), y = y0 + Math.floor(i / cols) * (th + gap);
        CV.round(x, y, tw2, th, 6 * CV.SCALE, CV.C.panel2, e ? CV.C.line2 : CV.C.line);
        CV.text(D.EQUIP_SLOTS[slot], x + 8 * CV.SCALE, y + 14 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (e) {
          CV.text(CV.fit(e.name + ' +' + e.enhance, tw2 - 16 * CV.SCALE, CV.FS.md, true), x + tw2 / 2, y + th / 2 + 6 * CV.SCALE,
            { size: CV.FS.md, bold: true, align: 'center', color: rarColor(e.rarity) });
          CV.hit('eqd:' + eq[slot], x, y, tw2, th);
        } else {
          CV.text('未装备', x + tw2 / 2, y + th / 2 + 6 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
        }
      });
      U.y = y0 + Math.ceil(slots.length / cols) * (th + gap) - gap;
      U.space(CV.SP[1]);
      U.btnRow([{ label: '⚡ 一键最优装备', style: 'ghost', id: 'autoeq_player' }]);
    });

    /* ⑤ 血统 */
    U.card(function () {
      U.h3('🩸 血统', S.player.bloodline ? 'Lv.' + S.player.bloodlineLv + ' / ' + D.BLOODLINE_MAX : '未觉醒');
      if (S.player.bloodline) {
        U.hint(S.player.bloodline + '：' + (D.BLOODLINES[S.player.bloodline] || {}).desc, 2 * CV.SCALE);
        U.space(CV.SP[1]);
        if (blCost) {
          U.btnRow([{ label: '血统升级（❥ ' + blCost.bloodCrystal + ' + ◈ ' + fmt(blCost.points) + '）', style: 'ghost', id: 'pblup' }]);
        } else {
          U.hint('已满级', 2 * CV.SCALE);
        }
      } else if (S.player.level < D.BLOODLINE_UNLOCK_LV) {
        U.note('🔒 主角 Lv.' + D.BLOODLINE_UNLOCK_LV + ' 觉醒血统（当前 Lv.' + S.player.level + '）', 2 * CV.SCALE);
      } else {
        Object.keys(D.BLOODLINES).forEach(function (id) {
          const bl = D.BLOODLINES[id];
          U.btnRow([{ label: id + '　' + String(bl.desc).split('。')[0], style: 'ghost', id: 'pbl:' + id }]);
          U.space(6 * CV.SCALE);
        });
      }
    });

    /* ⑥ 境界 */
    const rs = Core.realmState();
    U.card(function () {
      U.h3('🌌 境界', '已突破 ' + rs.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶');
      U.kv('当前境界', S.player.realm ? rs.curName : '未突破');
      U.kv('境界加成', '全属性 +' + Math.round(Core.realmBonusPct() * 100) + '%', CV.C.green);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '查看境界 · 渡劫 ›', style: 'ghost', id: 'open_realm' }]);
    });

    /* ⑦ 属性面板 */
    U.card(function () {
      U.h3('📊 属性面板', '装备 / 血统 / 境界 / 铭刻都已算进来');
      statRows(st).forEach(function (r) { U.kv(r[0], r[1]); });
    });
  });

  /* ---------- 事件 ---------- */
  CV.on('open_protag', function () {
    Core.S.stats.profileViews = (Core.S.stats.profileViews || 0) + 1;   // 主线 q01「熟悉身体」
    Core.save();
    CV.push('protag');
  });
  CV.on('back_home', function () { CV.pop(); });
  D.ATTR_META.forEach(function (a) {
    [1, 10].forEach(function (n) {
      CV.on('attr:' + a.id + ':' + n, function () {
        const r = Core.allocateAttr(a.id, n);
        CV.toast(r.msg || '已加点');
        CV.render();
      });
    });
  });
  CV.on('attr_reset', function () {
    U.confirm('六维洗点', '把已经分出去的属性点全部退回来重新分配？六维总值不会掉，只是重新点一次。', function () {
      const r = Core.resetAttrs();
      CV.toast(r.msg || '已重置');
      CV.render();
    });
  });
  [0, 1, 2].forEach(function (i) {
    CV.on('pskill:' + i, function () {
      const r = Core.allocateSkill(i);
      CV.toast(r.msg || '已升级');
      CV.render();
    });
  });
  CV.on('pskill_reset', function () {
    U.confirm('技能重置', '把投进去的技能点全部退回，技能回到 Lv.0 重新点？点数一点不少。', function () {
      const r = Core.resetSkills();
      CV.toast(r.msg || '已重置');
      CV.render();
    });
  });
  CV.on('pblup', function () {
    const r = Core.upgradePlayerBloodline();
    CV.toast(r.msg || '已升级');
    CV.render();
  });
  Object.keys(D.BLOODLINES).forEach(function (id) {
    CV.on('pbl:' + id, function () {
      const r = Core.choosePlayerBloodline(id);
      CV.toast(r.msg || '已觉醒');
      CV.render();
    });
  });
  CV.on('autoeq_player', function () {
    const r = Core.autoEquipBest('@player');
    CV.toast(r.changed ? '已换上 ' + r.changed + ' 件（只从背包里没穿的装备挑）' : '背包里没有更好的了', 2400);
    CV.render();
  });
})();
