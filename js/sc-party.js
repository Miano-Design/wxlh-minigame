/* 队伍 —— 照网页版 js/ui.js 的 partyScreen 复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     ① ⚔️ 灯阁小队（总战力 N（主角必上阵））：前排 2 格 / 后排 3 格
        · 空格子：居中一行「＋ 上阵」（点一下挑伙伴）
        · 主角格：左上角「主角」身份角标 + 头像 40 + 名字 + 「Lv.N · 战力 N」
        · 伙伴格：头像 40 + 名字 + 「Lv.N · 定位 · 阵营」（点一下进伙伴详情，底部可无损换将 / 下阵）
     ② 📌 编队预设：存预设 1/2/3 + 套用预设 1/2/3（两排各三格）+「当前预设：1— 2— 3—」
     ③ 🧩 阵型：主角可补位（阵容上满 5 人才成阵）→ 当前构成 / 成阵 / 加成 + 五个阵型行 + 克制环
   V9.6.111（父亲大人："小游戏队伍拖拽换位不了"）：
   这里原来写着"长按拖动在 canvas 上代价大，改用点格子选伙伴"—— 可引导和玩法说明
   一直教玩家"长按抓起、拖到别处松手"，玩家照着做拖不动，等于教了个假操作。
   现在长按拖拽真的做了（实现在 cv.js 的触摸管线里，页面只挂一份 CV.grabCfg）：
   长按 420ms 抓起 → 拖到别的格子松手＝换位 / 拖到「前排·后排」标签＝整排搬人 /
   拿着时点一下目标格也能放下（网页版同款备用路径）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;

  let pickSlot = null;        // 正在给哪一格挑人
  let detailFrom = null;      // 从队伍点进详情的格子号

  /* 队伍头像（V1.0.6 · 父亲大人 09-24 拍板：「**统一都用文字头像**」）：
     原来这里走 CV.avatar 的**组合剪影**，而战斗页画的是"名字首字"——同一支队伍在两屏里
     长相不一样（反馈图 03 就是这条）。
     现在统一成**文字头像**，并且直接沿用本室**已经有的那一套取法**
     （执灯者列表 / 伙伴详情头卡就是这么画的：圆盘 → 稀有度色环 → 名字首字，字号 = 直径×0.44；
      圈色规则也不新造：主角金圈、伙伴按稀有度）。
     一处收口，队伍页三处调用（上阵格 / 选伙伴上阵 / 无损换将）一起统一。 */
  function avatar(id, size, cx, cy) {
    const ch = D.charById[id] || {};
    const ring = id === '@player' ? CV.C.gold : rarColor(ch.rarity);
    const c = CV.ctx;
    c.beginPath(); c.arc(cx, cy, size / 2, 0, Math.PI * 2);
    c.fillStyle = CV.C.panel3; c.fill();
    c.lineWidth = 2; c.strokeStyle = ring; c.stroke();
    CV.text(String(Core.charName(id) || '?').slice(0, 1), cx, cy,
      { size: size * 0.44, bold: true, align: 'center', color: ring });
  }

  CV.register('party', function () {
    const S = Core.S;
    const fb = Core.factionBuffs(S.party);
    U.begin();
    U.pageHead('队伍', { backId: 'party_back' });    // 吸顶（父亲大人 09-27 深夜 · 派单 Z-B）

    /* ① 小队 */
    U.card(function () {
      U.h3('⚔️ 灯阁小队', '总战力 ' + fmt(Core.teamPower()) + '（主角必上阵）');
      /* V9.6.1（父亲大人："间距都太急了"）：这一整块按网页版实测重排 ——
         · 前排/后排标签：margin 8px 2px 6px（上 8、下 6），字号 12
         · 伙伴格：**高 115**（原来 92，太扁）、内边距 10、圆角 10
         · 格内：头像 40 上下各留 8 → 名字 13/行高 17.5 且下间距 4 → 小字 11/行高 15.4
         这一套行距是网页版 .pslot/.pname/.pmeta 的实测值，别再自己压。 */
      /* V9.6.142：格子里那行信息改成两行显示（等级 / 血统 / 阵营不再截断）→ 高 115 → 126。
         网页版 .pslot 是内容撑高的，所以两边都装得下。 */
      const gap = CV.SP[2], th = 126 * CV.SCALE;
      const PAD = 10 * CV.SCALE;
      const NAME_LH = 17.5 * CV.SCALE, META_LH = 15.4 * CV.SCALE;
      /* V9.6.69（父亲大人："第 5 步的高亮框只亮一小块，应该是整个上阵区域"）：
         阵型区登记一颗**整块**锚点（两排五格都在里面），引导要指"上阵区域"就指它。 */
      const boardTop = U.y;
      /* V9.6.111（父亲大人："队伍拖拽换位不了"）：挂上"长按抓起、拖到别处松手"。
         规则（与网页版一致）：
           from(id)   —— 这颗热区能不能抓起，能就给出它代表几号位
           targetAt(p) —— 手指现在压在几号位（用来画落点）
           drop(a,b)  —— 松手落定时换位（走核心的 swapPositions，含各种合法性判定）
         抓起/落点的高亮画在每格的 round 描边上（下面 drawRow 里读 CV.grab）。 */
      const slotRect = {};      // 下标 → {x,y,w,h}（本帧），给 targetAt 用
      /* 「前排 / 后排」那两条标签也是落点 —— 指过去＝整排搬人。
         这条是**引导文案里写着的**（data.js：「直接拖到「前排 / 后排」那行字上也能整排搬人」），
         canvas 原来只认格子，玩家照着文案拖到那行字上会"没反应"（＝无效操作）。 */
      const rowRect = {};       // 'front' / 'back' → {x,y,w,h}（标签那一条）
      CV.grabCfg = {
        /* 有人的格子登记的是 `poke:<i>`、空格是 `pslot:<i>` —— 两种都要能抓起
           （父亲大人要拖的正是"有伙伴的那一格"）。 */
        from: function (id) {
          const s = String(id);
          if (s.indexOf('pslot:') === 0) return Number(s.slice(6));
          if (s.indexOf('poke:') === 0) return Number(s.slice(5));
          return null;
        },
        targetAt: function (p) {
          const ly = p.y - (CV.TOP + 8) + (CV.scroll || 0);
          for (const k in slotRect) {
            const r = slotRect[k];
            if (p.x >= r.x && p.x <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return Number(k);
          }
          for (const k in rowRect) {
            const r = rowRect[k];
            if (p.x >= r.x && p.x <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return 'row:' + k;
          }
          return null;
        },
        drop: function (a, b) {
          const r = Core.swapPositions(a, b);
          /* F7 ②：拖拽换位的结果当场看得见（两格对调）→ 删成功语；"位置不对 / 这个位置是空的"留。 */
          if (!r || !r.ok) CV.toast((r && r.msg) || '换不了');
          CV.render();
        },
      };
      /* V9.6.111：抓起状态的提示条 —— 网页版是标题下面那条 .drag-bar
         「已抓起「XX」 · 拖到别的位置松手放下 ［取消］」。
         手机上一弹提示框就挡住半个屏幕，所以照网页版**画在页面上**：
         手里拿着谁、怎么放下、想放弃点哪 —— 一眼看得见，不用猜。 */
      if (CV.grab) {
        const gid = S.party[CV.grab.from];
        const gname = gid ? Core.charName(gid) : '';
        const bh = 30 * CV.SCALE, btop = U.y, bw = 56 * CV.SCALE;
        CV.round(U.ix(), btop, U.iw(), bh, CV.RADIUS_CHIP,  CV.a(CV.C.gold, .10), CV.a(CV.C.gold, .45));
        CV.text(CV.fit('已抓起「' + gname + '」 · 拖到别的位置松手放下', U.iw() - bw - 20 * CV.SCALE, CV.FS.xs),
          U.ix() + 8 * CV.SCALE, btop + bh / 2, { size: CV.FS.xs, color: CV.C.gold });
        U.btn(U.ix() + U.iw() - bw - 6 * CV.SCALE, btop + 4 * CV.SCALE, bw, bh - 8 * CV.SCALE, '取消', 'ghost', 'pgrab_cancel');
        U.y = btop + bh + CV.SP[2];
      }
      const drawRow = function (label, rowKey, slots) {
        const labelTop = U.y + 8 * CV.SCALE;
        CV.text(label, U.ix() + 2 * CV.SCALE, labelTop + 8 * CV.SCALE, { size: CV.FS.md, color: CV.C.dim });
        rowRect[rowKey] = { x: U.ix(), y: labelTop - 2 * CV.SCALE, w: U.iw(), h: 20 * CV.SCALE };
        const y = labelTop + 16.5 * CV.SCALE + 6 * CV.SCALE;
        const cw = label === '后排' ? (U.iw() - gap * 2) / 3 : (U.iw() - gap) / 2;
        /* V9.6.111：手里拿着东西时，**其他每一格**都描成金色虚线 —— 网页版是
           `.party-grid.grabbed .pslot { border-style: dashed }`，就是告诉玩家"这些地方都能放"。
           canvas 里没有 CSS，只能自己画虚线（没有 setLineDash 的机型当没这回事，不报错）。 */
        const dashRound = function (rx, ry, rw, rh) {
          const c = CV.ctx;
          if (!c.setLineDash) return;
          try {
            c.save();
            c.setLineDash([5 * CV.SCALE, 4 * CV.SCALE]);
            c.strokeStyle = CV.a(CV.C.gold, .55); c.lineWidth = 1;
            const r = CV.RADIUS;
            c.beginPath();
            c.moveTo(rx + r, ry);
            c.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
            c.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
            c.arcTo(rx, ry + rh, rx, ry, r);
            c.arcTo(rx, ry, rx + rw, ry, r);
            c.closePath(); c.stroke();
            c.restore();
          } catch (e) { }
        };
        slots.forEach(function (i, k) {
          const x = U.ix() + k * (cw + gap);
          slotRect[i] = { x: x, y: y, w: cw, h: th };
          const id = S.party[i];
          const grabbing = CV.grab && CV.grab.from === i;
          const aiming = CV.grab && CV.grab.over === i;
          const holding = !!CV.grab && !grabbing;   // 手里拿着东西，而且拿的不是这一格
          if (!id) {
            CV.round(x, y, cw, th, CV.RADIUS, null, CV.C.line2);
            /* 空格：拿着东西时它就是一个"可以放"的落点（网页版 pslot-ph 同款文案） */
            CV.text(holding ? '放这里' : '＋ 上阵', x + cw / 2, y + th / 2,
              { size: aiming ? CV.FS.lg : CV.FS.md, color: aiming ? CV.C.gold : CV.C.dim, align: 'center' });
            if (aiming) CV.round(x, y, cw, th, CV.RADIUS, null, CV.C.gold, 2);
            if (grabbing) CV.round(x, y, cw, th, CV.RADIUS, null, CV.C.gold, 3);
            else if (holding) dashRound(x, y, cw, th);
            CV.hit('pslot:' + i, x, y, cw, th);
            return;
          }
          CV.round(x, y, cw, th, CV.RADIUS, CV.C.panel2, id === '@player' ? CV.C.gold : rarColor((D.charById[id] || {}).rarity));
          /* 抓起那格描金边；手指压住的那格再画一圈金边 + 头顶写「放这里」 */
          if (grabbing) CV.round(x, y, cw, th, CV.RADIUS, null, CV.C.gold, 3);
          else if (holding) dashRound(x, y, cw, th);
          if (aiming && !grabbing) {
            CV.round(x, y, cw, th, CV.RADIUS, null, CV.C.gold, 2);
            CV.round(x + 2 * CV.SCALE, y - 18 * CV.SCALE, cw - 4 * CV.SCALE, 16 * CV.SCALE, CV.RADIUS_CHIP,  CV.C.gold);
            CV.text('放这里', x + cw / 2, y - 10 * CV.SCALE, { size: CV.FS.xs, color: CV.C.sel, align: 'center', bold: true });
          }
          if (id === '@player') {
            /* 队伍格左上角的「主角」标：网页版 .pslot .pos-tag 是**五级 11px**（原来画成 12px） */
            const tw = CV.measure('主角', CV.FS.tag) + 10 * CV.SCALE;
            CV.round(x + 4 * CV.SCALE, y + 4 * CV.SCALE, tw, 16 * CV.SCALE, CV.RADIUS_CHIP,  null, CV.a(CV.C.gold, .4));
            CV.text('主角', x + 4 * CV.SCALE + tw / 2, y + 12 * CV.SCALE, { size: CV.FS.tag, color: CV.C.gold, align: 'center' });
          }
          /* 头像 40（上留 8）、名字 13/行高 17.5、小字 11/行高 15.4 —— 全按网页版实测 */
          const avTop = y + PAD + 8 * CV.SCALE;
          avatar(id, 40 * CV.SCALE, x + cw / 2, avTop + 20 * CV.SCALE);
          const nameY = avTop + 40 * CV.SCALE + 8 * CV.SCALE + NAME_LH / 2;
          CV.text(CV.fit(Core.charName(id), cw - PAD * 2, CV.FS.lg, true), x + cw / 2, nameY,
            { size: CV.FS.lg, bold: true, align: 'center', color: grabbing ? CV.C.gold : undefined });   // 网页版 .pslot.grabbing .pname 是金色
          /* V9.6.142（父亲大人："伴生体的孵化那行字被省略了"→顺着全站扫）：格子里这行
             原来是单行 fit → 「Lv.0 · 泰坦 · 灰…」，血统和阵营全被砍掉。
             网页版那边同样是 ellipsis（两边都错）。现在**折到最多两行、居中**，
             格子高度跟着算 —— 上阵时该看的"等级 / 血统 / 阵营"一个不丢。 */
          const meta = id === '@player'
            ? ('Lv.' + S.player.level + ' · 战力 ' + fmt(Core.playerPower()))
            : ('Lv.' + S.chars[id].lv + ' · ' + (D.charById[id] || {}).bloodline + ' · ' + (D.charById[id] || {}).faction);
          const metaLines = CV.wrap(meta, cw - PAD * 2, CV.FS.xs, 2);
          const metaTop = nameY + NAME_LH / 2 + 4 * CV.SCALE;
          metaLines.forEach(function (ln, k) {
            CV.text(ln, x + cw / 2, metaTop + META_LH * (k + 0.5),
              { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
          });
          CV.hit('poke:' + i, x, y, cw, th);
        });
        U.y = y + th + CV.SP[2];
        /* 手指压在这一排的标签上＝要"整排搬过去"：那一条高亮 + 右侧写「放这里」 */
        if (CV.grab && CV.grab.over === 'row:' + rowKey) {
          const r = rowRect[rowKey];
          CV.round(r.x, r.y, r.w, r.h, CV.RADIUS_CHIP,  CV.a(CV.C.gold, .14), CV.C.gold, 2);
          CV.text('放这里', r.x + r.w - 6 * CV.SCALE, r.y + r.h / 2,
            { size: CV.FS.xs, color: CV.C.gold, align: 'right', bold: true });
        }
      };
      drawRow('前排', 'front', [0, 1]);
      drawRow('后排', 'back', [2, 3, 4]);
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
        if (on) CV.round(U.ix(), top, U.iw(), h, CV.RADIUS_CHIP,  CV.a(CV.C.gain, .08), CV.C.doneLine);
        else CV.round(U.ix(), top, U.iw(), h, CV.RADIUS_CHIP,  null, CV.C.line);
        CV.text(f.name, U.ix() + 8 * CV.SCALE, top + 13 * CV.SCALE, { size: CV.FS.lg, bold: true, color: on ? CV.C.green : CV.C.text });
        CV.text(f.reqText, U.ix() + 8 * CV.SCALE, top + 30 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (on) CV.text('已激活', U.ix() + U.iw() - 8 * CV.SCALE, top + 13 * CV.SCALE, { size: CV.FS.xs, color: CV.C.green, align: 'right' });
        const buff = Object.keys(f.buff).map((k) => ({ atkPct: '攻', hpPct: '命', skillPct: '技' }[k] || k) + '+' + Math.round(f.buff[k] * 100) + '%').join(' ');
        CV.text(buff, U.ix() + U.iw() - 8 * CV.SCALE, top + 30 * CV.SCALE, { size: CV.FS.xs, color: on ? CV.C.green : CV.C.dim, align: 'right' });
        U.y = top + h + 6 * CV.SCALE;
      });
      /* V9.6.89：这句原来**写死了旧阵营名**（先锋→策略→科技→异能），
         阵营改地名之后小游戏这边还挂着老名字。现在从 D.FACTIONS 现场拼，
         以后改阵营名不会再漏掉这一处。 */
      U.hint('克制环：' + D.FACTIONS.concat([D.FACTIONS[0]]).join('→') + '（克制伤害+15%）', 4 * CV.SCALE);
    });
  });

  /* 挑伙伴上阵（点空格子进来） */
  CV.register('pickparty', function () {
    const S = Core.S;
    U.begin();
    U.pageHead('选伙伴上阵', { backId: 'party_back' });   // 吸顶（父亲大人 09-27 深夜）
    /* V1.0.6（父亲大人 09-24 反馈图 10「顺序问题」）：
       这一页原来直接吃 `Object.keys(S.chars)` —— **没排序**，顺序就是存档里的键序
       （抽卡先后决定的插入序，读档后还会变），所以他看到的是"乱排序"。
       网页版同一屏（js/ui.js:2170 `const owned = charListSorted();`）走的是
       「上阵 → 稀有度 → 等级 → 星级 ＋ id 兜底」，**小游戏端本来就有一份同规则实现**
       （G.charSortDefault，执灯者列表与「无损换将」都在用）—— 只有这一页漏了调用。
       所以照 pickswap 的规矩补上（不留静默兜底：实现真丢了就当场抛错）。 */
    if (typeof G.charSortDefault !== 'function') throw new Error('排序实现缺失：G.charSortDefault');
    const own = G.charSortDefault(Object.keys(S.chars)).filter((id) => S.party.indexOf(id) < 0);
    if (!own.length) { U.hint('没有可上阵的伙伴（去招募）', 4 * CV.SCALE); return; }
    U.card(function () {
      U.h3('可选伙伴', own.length + ' 名');
      own.forEach(function (id) {
        const ch = D.charById[id] || {}, c = S.chars[id];
        const top = U.y, h = 56 * CV.SCALE;
        avatar(id, 38 * CV.SCALE, U.ix() + 19 * CV.SCALE, top + h / 2);
        CV.text(Core.charName(id), U.ix() + 46 * CV.SCALE, top + 20 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text('Lv.' + c.lv + ' · ' + ch.bloodline + ' · ' + ch.faction + ' · 战力 ' + fmt(Core.power(id)),
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
    U.pageHead('无损换将', { backId: 'party_back' });     // 吸顶（父亲大人 09-27 深夜）
    const from = G.__swapFrom;
    /* V9.6.19（父亲大人）：换将列表的排序要**跟执灯者那边一样** ——
       直接复用 G.charSortDefault（那边是唯一实现），不再各排各的。 */
    /* V1.0.1（父亲大人："队伍上阵选伙伴的列表排序规则丢了吗，现在又是乱排序"）：
       这里原来是 `G.charSortDefault ? 排好的 : Object.keys(S.chars)` ——
       一旦 G 上拿不到那个函数，**静默退化成"完全不排序"**（对象键顺序），
       症状正好就是"排序规则丢了"。而且它不报错，所以尺子和开发期都发现不了。
       改法：不留静默兜底 —— 共用实现真丢了就当场抛错（构建/冒烟立刻暴露），
       绝不出现"看起来能跑、其实是乱序"这种半成品状态。 */
    if (typeof G.charSortDefault !== 'function') throw new Error('排序实现缺失：G.charSortDefault');
    const own = G.charSortDefault(Object.keys(S.chars))
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
        CV.text('Lv.' + c.lv + ' · ' + ch.bloodline + ' · ' + ch.faction + ' · 战力 ' + fmt(Core.power(id)),
          U.ix() + 46 * CV.SCALE, top + 38 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        CV.hit('pickswap:' + id, U.ix(), top, U.iw(), h);
        U.y = top + h + 4 * CV.SCALE;
      });
    });
  });
  CV.on('party_back', function () { CV.pop(); });
  /* 抓起状态里点「取消」＝放回原位（提示条上那颗按钮；离开队伍页也会自动放下） */
  /* F7 ②（父亲大人点名的例子）：**删「已放回原位」** —— 抓起的那一张当场回到原位，看得见。 */
  CV.on('pgrab_cancel', function () { CV.grab = null; CV.grabCfg = null; CV.render(); });
  /* 无损换将：挑一个伙伴换到这一格（等级继承、装备能穿就跟着转 —— 走 core.swapPartyMember） */
  CV.on('pickswap:*', function (id) {
    const slot = G.__swapSlot;
    if (slot === undefined || slot === null || slot < 0) { CV.toast('这一格不能换'); return; }
    const r = Core.swapPartyMember(slot, id);
    /* F7 ②：换将结果当场看得见（那格换成谁了）→ 删成功语；"主角必上阵 / 他已经在这一格了"留。 */
    if (r && r.ok === false) CV.toast(r.msg || '换不了');
    /* V9.6.22（父亲大人："换完将都是回到队伍界面算了，这样比较合理"）：
       换将是从**队伍页 → 伙伴详情 → 选人**这么 push 上来的，换完直接把
       char / pickswap 这两层一起弹掉、回到队伍页 —— 换将本来就是在队伍页反复调阵，
       停在详情里还得先退出来。（上一版"停在新伙伴详情"撤掉） */
    while (CV.stack.length > 1 && ['pickswap', 'char'].indexOf(CV.top().name) >= 0) CV.stack.pop();
    CV.scroll = 0; CV.pageOverlay = null; CV.sticky = null;
    CV.render();
  });
  [0, 1, 2, 3, 4].forEach(function (i) {
    CV.on('pslot:' + i, function () {
      pickSlot = i;
      CV.push('pickparty');
      /* V9.6.112（父亲大人："上阵也得上两个"）：上阵是**两步** —— 点空格、再点一个人。
         第二步的说明写在 sc-home 的页面引导表里（['pickparty', …]）——
         引导的登记要交给"页面一渲染就查表"那条通路：在这一下里直接登记，
         会被引导引擎随后那次"推进队列"清掉（见 uiw.js 里 coachNext 那处修复）。 */
    });
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
    /* F7 ②：上阵后那格当场填上人（看得见 → 删）；不再念一遍名字。 */
  });
  [0, 1, 2].forEach(function (i) {
    CV.on('preset_save:' + i, function () {
      const r = Core.savePreset(i);
      /* F7 ②：存预设是**覆盖式**的（存的是当前的队伍，没有任何界面元素会变）——
         "存到第几号"这件事只有这句话说得出 → 留；失败留。 */
      CV.toast(r && r.msg ? r.msg : ('已存预设 ' + (i + 1)));
      CV.render();
    });
    CV.on('preset_use:' + i, function () {
      const r = Core.applyPreset(i);
      /* F7 ②：套预设后队伍整排当场变（看得见）→ 删成功语；"该预设还是空的"留。 */
      if (!r || !r.ok) CV.toast((r && r.msg) || '这套预设还用不了');
      CV.render();
    });
  });
})();
