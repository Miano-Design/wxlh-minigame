/* 队伍 —— 照网页版 js/ui.js 的 partyScreen 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     ① ⚔️ 灯阁小队（总战力 N（主角必上阵））：前排 2 格 / 后排 3 格
        · 空格子：居中一行「＋ 上阵」（点一下挑伙伴）
        · 主角格：左上角「主角」身份角标 + 头像 40 + 名字 + 「Lv.N · 战力 N」
        · 伙伴格：头像 40 + 名字 + 「Lv.N · 定位 · 阵营」（点一下进伙伴详情，底部可无损换将 / 下阵）
     ② 📌 编队预设：存预设 1/2/3 + 套用预设 1/2/3（两排各三格）+「当前预设：1— 2— 3—」
     ③ 🧩 阵型：主角可补位（阵容上满 5 人才成阵）→ 当前构成 / 成阵 / 加成 + 五个阵型行 + 克制环
   长按拖动换位的交互在 canvas 上代价大，这里用"点格子 → 选伙伴"达到同一目的（语义一致、不会点错）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  let pickSlot = null;        // 正在给哪一格挑人
  let detailFrom = null;      // 从队伍点进详情的格子号

  /* 伙伴头像（圆形 + 首字 + 稀有度描边） */
  function avatar(id, size, cx, cy) {
    const ch = D.charById[id] || {};
    const col = id === '@player' ? CV.C.gold : rarColor(ch.rarity);
    CV.ctx.beginPath(); CV.ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    CV.ctx.fillStyle = '#232c42'; CV.ctx.fill();
    CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = col; CV.ctx.stroke();
    CV.text(Core.charName(id).slice(0, 1), cx, cy, { size: size * 0.44, bold: true, align: 'center', color: col });
  }

  CV.register('party', function () {
    const S = Core.S;
    const fb = Core.factionBuffs(S.party);
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'party_back');
    CV.text('队伍', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];

    /* ① 小队 */
    U.card(function () {
      U.h3('⚔️ 灯阁小队', '总战力 ' + fmt(Core.teamPower()) + '（主角必上阵）');
      /* V9.6.1（父亲大人："间距都太急了"）：这一整块按网页版实测重排 ——
         · 前排/后排标签：margin 8px 2px 6px（上 8、下 6），字号 12
         · 伙伴格：**高 115**（原来 92，太扁）、内边距 10、圆角 10
         · 格内：头像 40 上下各留 8 → 名字 13/行高 17.5 且下间距 4 → 小字 11/行高 15.4
         这一套行距是网页版 .pslot/.pname/.pmeta 的实测值，别再自己压。 */
      const gap = CV.SP[2], th = 115 * CV.SCALE;
      const PAD = 10 * CV.SCALE;
      const NAME_LH = 17.5 * CV.SCALE, META_LH = 15.4 * CV.SCALE;
      /* V9.6.69（父亲大人："第 5 步的高亮框只亮一小块，应该是整个上阵区域"）：
         阵型区登记一颗**整块**锚点（两排五格都在里面），引导要指"上阵区域"就指它。 */
      const boardTop = U.y;
      const drawRow = function (label, slots) {
        const labelTop = U.y + 8 * CV.SCALE;
        CV.text(label, U.ix() + 2 * CV.SCALE, labelTop + 8 * CV.SCALE, { size: CV.FS.md, color: CV.C.dim });
        const y = labelTop + 16.5 * CV.SCALE + 6 * CV.SCALE;
        const cw = label === '后排' ? (U.iw() - gap * 2) / 3 : (U.iw() - gap) / 2;
        slots.forEach(function (i, k) {
          const x = U.ix() + k * (cw + gap);
          const id = S.party[i];
          if (!id) {
            CV.round(x, y, cw, th, CV.RADIUS, null, CV.C.line2);
            CV.text('＋ 上阵', x + cw / 2, y + th / 2, { size: CV.FS.lg, color: CV.C.dim, align: 'center' });
            CV.hit('pslot:' + i, x, y, cw, th);
            return;
          }
          CV.round(x, y, cw, th, CV.RADIUS, CV.C.panel2, id === '@player' ? CV.C.gold : rarColor((D.charById[id] || {}).rarity));
          if (id === '@player') {
            const tw = CV.measure('主角', CV.FS.xs) + 10 * CV.SCALE;
            CV.round(x + 4 * CV.SCALE, y + 4 * CV.SCALE, tw, 16 * CV.SCALE, 6 * CV.SCALE, null, '#e6b64c66');
            CV.text('主角', x + 4 * CV.SCALE + tw / 2, y + 12 * CV.SCALE, { size: CV.FS.xs, color: CV.C.gold, align: 'center' });
          }
          /* 头像 40（上留 8）、名字 13/行高 17.5、小字 11/行高 15.4 —— 全按网页版实测 */
          const avTop = y + PAD + 8 * CV.SCALE;
          avatar(id, 40 * CV.SCALE, x + cw / 2, avTop + 20 * CV.SCALE);
          const nameY = avTop + 40 * CV.SCALE + 8 * CV.SCALE + NAME_LH / 2;
          CV.text(CV.fit(Core.charName(id), cw - PAD * 2, CV.FS.lg, true), x + cw / 2, nameY, { size: CV.FS.lg, bold: true, align: 'center' });
          const meta = id === '@player'
            ? ('Lv.' + S.player.level + ' · 战力 ' + fmt(Core.playerPower()))
            : ('Lv.' + S.chars[id].lv + ' · ' + (D.charById[id] || {}).role + ' · ' + (D.charById[id] || {}).faction);
          CV.text(CV.fit(meta, cw - PAD * 2, CV.FS.xs), x + cw / 2, nameY + NAME_LH / 2 + 4 * CV.SCALE + META_LH / 2,
            { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
          CV.hit('poke:' + i, x, y, cw, th);
        });
        U.y = y + th + CV.SP[2];
      };
      drawRow('前排', [0, 1]);
      drawRow('后排', [2, 3, 4]);
      U.y -= CV.SP[2];
      CV.hit('party_board', U.pad(), boardTop - 8 * CV.SCALE, U.cw(), U.y - boardTop + 8 * CV.SCALE);
    });

    /* ② 编队预设（两排各三格，网页版 .btn-grid3） */
    U.card(function () {
      U.h3('📌 编队预设', '存下来一键换阵容');
      const grid3 = function (list) {
        const gap = CV.SP[2], h = U.BTN_SM * CV.SCALE;
        const w = (U.iw() - gap * 2) / 3;
        const top = U.y;
        list.forEach(function (b, i) { U.btn(U.ix() + i * (w + gap), top, w, h, b.label, b.style, b.id); });
        U.y = top + h + CV.SP[1];
      };
      grid3([0, 1, 2].map((i) => ({ label: '存预设 ' + (i + 1), style: 'ghost', id: 'preset_save:' + i })));
      grid3([0, 1, 2].map((i) => ({ label: '套用预设 ' + (i + 1), style: 'gold', id: 'preset_use:' + i })));
      const cur = S.presets.map((p, i) => (i + 1) + (p && p.filter(Boolean).length ? '✓' : '—')).join(' ');
      U.hint('当前预设：' + cur, 4 * CV.SCALE);
    });

    /* ③ 阵型（没成阵 / 没加成就灰字，成了才绿） */
    const fbText = [];
    if (fb.atkPct) fbText.push('攻击+' + Math.round(fb.atkPct * 100) + '%');
    if (fb.hpPct) fbText.push('生命+' + Math.round(fb.hpPct * 100) + '%');
    if (fb.skillPct) fbText.push('技能+' + Math.round(fb.skillPct * 100) + '%');
    const fbCount = Object.keys(fb.count).map((f) => f + '×' + fb.count[f]).join(' ');
    U.card(function () {
      U.h3('🧩 阵型', '主角可补位（阵容上满 5 人才成阵）');
      U.kv('当前构成', fbCount || '—');
      U.kv('成阵', fb.names.length ? fb.names.join(' · ') : '未成阵', fb.names.length ? CV.C.green : CV.C.dim);
      U.kv('加成', fbText.join(' · ') || '无', fbText.length ? CV.C.green : CV.C.dim);
      U.space(CV.SP[1]);
      D.FORMATIONS.forEach(function (f) {
        const on = fb.hit.indexOf(f.id) >= 0;
        const h = 40 * CV.SCALE, top = U.y;
        if (on) CV.round(U.ix(), top, U.iw(), h, 6 * CV.SCALE, '#56c89414', '#2f5b41');
        else CV.round(U.ix(), top, U.iw(), h, 6 * CV.SCALE, null, CV.C.line);
        CV.text(f.name, U.ix() + 8 * CV.SCALE, top + 13 * CV.SCALE, { size: CV.FS.lg, bold: true, color: on ? CV.C.green : CV.C.text });
        CV.text(f.reqText, U.ix() + 8 * CV.SCALE, top + 30 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (on) CV.text('已激活', U.ix() + U.iw() - 8 * CV.SCALE, top + 13 * CV.SCALE, { size: CV.FS.xs, color: CV.C.green, align: 'right' });
        const buff = Object.keys(f.buff).map((k) => ({ atkPct: '攻', hpPct: '命', skillPct: '技' }[k] || k) + '+' + Math.round(f.buff[k] * 100) + '%').join(' ');
        CV.text(buff, U.ix() + U.iw() - 8 * CV.SCALE, top + 30 * CV.SCALE, { size: CV.FS.xs, color: on ? CV.C.green : CV.C.dim, align: 'right' });
        U.y = top + h + 6 * CV.SCALE;
      });
      U.hint('克制环：先锋→策略→科技→异能→先锋（克制伤害+15%）', 4 * CV.SCALE);
    });
  });

  /* 挑伙伴上阵（点空格子进来） */
  CV.register('pickparty', function () {
    const S = Core.S;
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'party_back');
    CV.text('选伙伴上阵', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    const own = Object.keys(S.chars).filter((id) => S.party.indexOf(id) < 0);
    if (!own.length) { U.hint('没有可上阵的伙伴（去招募）', 4 * CV.SCALE); return; }
    U.card(function () {
      U.h3('可选伙伴', own.length + ' 名');
      own.forEach(function (id) {
        const ch = D.charById[id] || {}, c = S.chars[id];
        const top = U.y, h = 56 * CV.SCALE;
        avatar(id, 38 * CV.SCALE, U.ix() + 19 * CV.SCALE, top + h / 2);
        CV.text(Core.charName(id), U.ix() + 46 * CV.SCALE, top + 20 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text('Lv.' + c.lv + ' · ' + ch.role + ' · ' + ch.faction + ' · 战力 ' + fmt(Core.power(id)),
          U.ix() + 46 * CV.SCALE, top + 38 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        CV.hit('set:' + id, U.ix(), top, U.iw(), h);
        U.y = top + h + 4 * CV.SCALE;
      });
    });
  });

  /* ---------- 事件 ---------- */
  /* 无损换将：挑一个伙伴顶替这一格（列表排除当前这位） */
  CV.register('pickswap', function () {
    const S = Core.S;
    U.begin();
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'party_back');
    CV.text('无损换将', U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
    const from = G.__swapFrom;
    /* V9.6.19（父亲大人）：换将列表的排序要**跟执灯者那边一样** ——
       直接复用 G.charSortDefault（那边是唯一实现），不再各排各的。 */
    const own = (G.charSortDefault ? G.charSortDefault(Object.keys(S.chars)) : Object.keys(S.chars))
      .filter((id) => id !== from && S.party.indexOf(id) < 0);
    U.card(function () {
      U.h3('换谁上阵', own.length + ' 名可选');
      U.hint('新上阵的继承被换下那位的等级；装备能穿的一起转过去，穿不了的留在原伙伴身上。', 4 * CV.SCALE);
      U.space(CV.SP[1]);
      if (!own.length) { U.hint('没有其他伙伴可换', 2 * CV.SCALE); return; }
      own.forEach(function (id) {
        const ch = D.charById[id] || {}, c = S.chars[id];
        const top = U.y, h = 56 * CV.SCALE;
        avatar(id, 38 * CV.SCALE, U.ix() + 19 * CV.SCALE, top + h / 2);
        CV.text(Core.charName(id), U.ix() + 46 * CV.SCALE, top + 20 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text('Lv.' + c.lv + ' · ' + ch.role + ' · ' + ch.faction + ' · 战力 ' + fmt(Core.power(id)),
          U.ix() + 46 * CV.SCALE, top + 38 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        CV.hit('pickswap:' + id, U.ix(), top, U.iw(), h);
        U.y = top + h + 4 * CV.SCALE;
      });
    });
  });
  CV.on('party_back', function () { CV.pop(); });
  /* 无损换将：挑一个伙伴换到这一格（等级继承、装备能穿就跟着转 —— 走 core.swapPartyMember） */
  CV.on('pickswap:*', function (id) {
    const slot = G.__swapSlot;
    if (slot === undefined || slot === null || slot < 0) { CV.toast('这一格不能换'); return; }
    const r = Core.swapPartyMember(slot, id);
    CV.toast(r && r.msg ? r.msg : '已换将');
    /* V9.6.22（父亲大人："换完将都是回到队伍界面算了，这样比较合理"）：
       换将是从**队伍页 → 伙伴详情 → 选人**这么 push 上来的，换完直接把
       char / pickswap 这两层一起弹掉、回到队伍页 —— 换将本来就是在队伍页反复调阵，
       停在详情里还得先退出来。（上一版"停在新伙伴详情"撤掉） */
    while (CV.stack.length > 1 && ['pickswap', 'char'].indexOf(CV.top().name) >= 0) CV.stack.pop();
    CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null;
    CV.render();
  });
  [0, 1, 2, 3, 4].forEach(function (i) {
    CV.on('pslot:' + i, function () { pickSlot = i; CV.push('pickparty'); });
    CV.on('poke:' + i, function () {
      const id = Core.S.party[i];
      if (id === '@player') { CV.push('protag'); return; }
      detailFrom = i;
      CV.push('char', { id: id, fromSlot: i });   // 复用执灯者的伙伴详情（带上"从队伍进来"的标记）
    });
  });
  CV.on('set:*', function (id) {
    const S = Core.S;
    if (pickSlot === null) return;
    if (S.party.indexOf(id) >= 0) {
      // 已经在队伍里：换位（把那一格清空，再放到这一格）
      const from = S.party.indexOf(id);
      S.party[from] = null;
    }
    S.party[pickSlot] = id;
    Core.save();
    pickSlot = null;
    CV.pop();
    CV.toast(Core.charName(id) + ' 已上阵');
  });
  [0, 1, 2].forEach(function (i) {
    CV.on('preset_save:' + i, function () {
      const r = Core.savePreset(i);
      CV.toast(r && r.msg ? r.msg : ('已存预设 ' + (i + 1)));
      CV.render();
    });
    CV.on('preset_use:' + i, function () {
      const r = Core.applyPreset(i);
      CV.toast(r && r.msg ? r.msg : ('已套用预设 ' + (i + 1)));
      CV.render();
    });
  });
})();
