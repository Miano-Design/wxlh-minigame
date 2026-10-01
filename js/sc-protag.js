/* 主角详情（角色页）—— 照网页版 js/ui.js 的 protagonistDetail 一段一段复刻
   ------------------------------------------------------------------------------
   网页版结构（V9.5.x）：
     ① 头部卡：头像 56 + 名字 +「主角本人」+ Lv·血统 + 铭刻/六维待分 + 右侧战力
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
      ['暴击', pc(st.crit)], ['暴击伤害', '×' + G.fmtMul(st.critDmg || 2)], ['闪避', pc(st.eva)],
      ['汲取', pc(st.lifesteal)],
    ];
    /* ================= V1.1.21（2026-09-28 · F8「举一反三」类④ 唯一剩下的那条）=================
       原来这一行是 `resPct + dmgReduce` 一起报成「减伤」—— **把两个不同的东西加在一起了**：
         · `dmgReduce` 才是真减伤（battle.js 在受伤时乘它）；
         · `resPct` 是**异常状态抗性**（引擎只在"命中异常状态"时掷它，见 battle.js 的 isDebuff 分支）。
       于是玩家在主角面板看到的「减伤」比实际减伤**高一截**（带 resPct 的法宝/秘术最明显）。
       策划总监 0928 R1 已定口径：**resPct 是异常抗性、不是减伤**（只改字，不把它接成真减伤）。
       这里跟着把显示拆开：减伤只报 dmgReduce（0% 也显示，与网页版同）；异常抗性**有才单列一行**。 */
    rows.push(['减伤', pc(Math.min(0.6, st.dmgReduce || 0))]);
    if ((st.resPct || 0) > 0) rows.push(['异常抗性', pc(Math.min(0.6, st.resPct || 0))]);
    rows.push(['技能加成', '+' + Math.round(((st.skillMult || 1) - 1) * 100) + '%']);
    return rows;
  }

  CV.register('protag', function () {
    const S = Core.S;
    U.begin();
    /* 返回条（二级页左上角，照网页版 .page-head）——**吸顶**（父亲大人 09-27 深夜：
       「每一屏的标题和返回键都固定在顶部吧」）；原来那个 `bh` 常量由 U.pageHead 内部算。 */
    U.pageHead(Core.charName('@player') + '（主角）', { backId: 'back_home' });

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
      CV.ctx.fillStyle = CV.C.panel3; CV.ctx.fill();
      CV.ctx.lineWidth = 2; CV.ctx.strokeStyle = CV.C.gold; CV.ctx.stroke();
      CV.text(Core.charName('@player').slice(0, 1), cx, top + asz / 2, { size: asz * 0.44, bold: true, align: 'center', color: CV.C.gold });
      const tx = U.ix() + asz + 12 * CV.SCALE;
      CV.text(Core.charName('@player'), tx, top + 14 * CV.SCALE, { size: CV.FS.f1, bold: true });
      const nw = CV.measure(Core.charName('@player'), CV.FS.f1, true);
      const tag = '主角本人';
      const tw = CV.measure(tag, CV.FS.sm) + 12 * CV.SCALE;
      CV.round(tx + nw + 8 * CV.SCALE, top + 6 * CV.SCALE, tw, 18 * CV.SCALE, CV.RADIUS_SM, null, CV.a(CV.C.gold, .4));
      CV.text(tag, tx + nw + 8 * CV.SCALE + tw / 2, top + 15 * CV.SCALE, { size: CV.FS.sm, color: CV.C.gold, align: 'center' });
      CV.text('Lv.' + S.player.level + '（玩家等级）· ' + (S.player.bloodline ? S.player.bloodline + '命格 Lv.' + S.player.bloodlineLv : '未选命格'),
        tx, top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text('铭刻 ' + (gl > 0 ? D.GENE_LOCKS[gl - 1].name : '未解锁') + ' · 六维待分 ' + (S.player.attrPoints || 0) + ' 点',
        tx, top + 52 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
      CV.text(fmt(Core.playerPower()), U.ix() + U.iw(), top + 18 * CV.SCALE, { size: CV.DISP.d1 * CV.SCALE, bold: true, color: CV.C.gold, align: 'right' });
      CV.text('战力', U.ix() + U.iw(), top + 38 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim, align: 'right' });
      U.y = top + h;
      /* EXP 进度条 + 挂机经验（网页版这两行就在头部卡里） */
      U.bar(lvlPct / 100, CV.C.gold);
      U.y += 4 * CV.SCALE;
      U.hint('EXP ' + Math.floor(lvlPct) + '% · 当前挂机 ' + Core.idleRates().expPerMin.toFixed(1) + ' EXP/分', 4 * CV.SCALE);
    });

    /* ② 六维属性 */
    const attrTop = U.y;
    const attrH = U.card(function () {
      U.h3('🎯 六维属性', '可用点数 ' + (S.player.attrPoints || 0),
        { btn: { label: '↺ 重置', id: 'attr_reset', dis: spentAttr <= 0 } });
      const has = (S.player.attrPoints || 0) > 0;
      /* F2-5：没点数时那两颗「+1 / +10」以前是**画着能点的假按钮**（点下去什么都不发生）——
         现在走 `dis` 变灰，差什么这句话就写在这儿（标题右边那行「可用点数 0」也是同一个意思）。 */
      if (!has) U.hint('没有可用点数：升级 / 主线奖励会给 —— 想重新分配就点右上角「↺ 重置」', 2 * CV.SCALE);
      D.ATTR_META.forEach(function (a) {
        const n = (S.player.attrs && S.player.attrs[a.id]) || 0;
        const top = U.y;
        /* V9.6.117（排版层级，父亲大人："六维的解释文字太大了"）：
           原来 `a.name + '  ' + a.desc` 拼成**一个字符串**交给 t1 —— 于是"每点 +20 生命"这类
           解释和"肌肉"一样是二级（15px 粗体），整张卡看着又满又吵。
           网页版这里本来就是「二级名字 + 内联五级灰字」（<span style="font-size:0.6875rem;color:var(--dim)">），
           canvas 没有内联样式，所以给 listRow 加了 t1sub 这个口子来对齐它。 */
        U.listRow({ t1: a.name, t1sub: a.desc, t2: '已分配 ' + n + ' 点 → +' + n * D.ATTR_POINT_VALUE, rightW: 110 * CV.SCALE });
        const bw = 52 * CV.SCALE, bw2 = 58 * CV.SCALE, gap = 6 * CV.SCALE;   // .btn.small：min-width 2.75rem
        const by = top + (U.y - top) / 2 - 20 * CV.SCALE;
        U.btn(U.ix() + U.iw() - bw - bw2 - gap, by, bw, U.BTN_SM * CV.SCALE, '+1', 'ghost', 'attr:' + a.id + ':1', !has);
        U.btn(U.ix() + U.iw() - bw2, by, bw2, U.BTN_SM * CV.SCALE, '+10', 'ghost', 'attr:' + a.id + ':10', !has);
      });
    });
    /* V9.6.67（父亲大人：点开角色卡"顺便就介绍六维"）：整块六维卡登记一颗**没有动作**的锚点，
       专门给引导框定位用 —— 加点是"可选动作"，没点数时那两颗 +1 是不登记的，
       只锚 +1 会让这一步在空点数的新号上找不到位置。 */
    CV.hit('attr_card', U.pad(), attrTop, U.cw(), attrH);

    /* ③ 技能 */
    U.card(function () {
      U.h3('⚡ ' + (S.player.bloodline ? S.player.bloodline + '命格技能' : '技能'), '可用技能点 ' + (S.player.skillPoints || 0),
        { btn: { label: '↺ 重置', id: 'pskill_reset', dis: spentSkill <= 0 } });
      /* V9.6.117（排版层级 + 间距，父亲大人："技能的版面有问题，间距又贴在一起了"）：
         照网页版 `.skill-row` 一比一重排 —— 每条技能是**自己的一个面板**：
           · .skill-row：panel 底 / 圆角 10 / 内边距 10 / 条与条之间 8px
           · .sname：三级（13px）粗体，右边跟 Lv. 标签（五级 11px 描边胶囊），+1 按钮贴行尾同一中线
           · .sdesc：五级（11px）灰字，**距离名字 3px**，行高 1.55
         以前这里把名字、胶囊、描述直接铺在卡片上、行高只有 22px：胶囊（17px）和描述几乎贴在一起，
         +1 按钮还用 top-10 悬在上一行里 —— 这就是"贴在一起、排版有问题"的来源。 */
      /* V9.6.117：改用**共用组件** U.skillRow（网页版 .skill-row 的画布实现）——
         主角详情与伙伴详情从此是同一份排版，不会再"一个页面改了另一个没改"。 */
      const skRows = [];
      [P.s1, P.s2, P.ult].forEach(function (sk, i) { if (sk) skRows.push({ sk: sk, i: i }); });
      skRows.forEach(function (r, n) {
        const lv = (S.player.skillLv || [0, 0, 0])[r.i];
        const max = D.SKILL_MAX_BY_INDEX[r.i];
        const canUp = (S.player.skillPoints || 0) > 0 && lv < max;
        U.skillRow({
          name: ['技能', '技能', '必杀'][r.i] + '·' + r.sk.name,
          tag: 'Lv.' + lv + '/' + max,
          desc: r.sk.desc || '',
          btnId: canUp ? 'pskill:' + r.i : '',
          btnDis: !canUp,          // 没点数/满级 → 画成禁用态（不是"看着能点、点了没反应"）
          last: false,
        });
      });
      U.skillRow({ name: '被动·' + P.passive.name, desc: P.passive.desc || '', color: CV.C.text2, last: true });
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
        CV.round(x, y, tw2, th, CV.RADIUS_CHIP,  CV.C.panel2, e ? CV.C.line2 : CV.C.line);
        CV.text(D.EQUIP_SLOTS[slot], x + 8 * CV.SCALE, y + 14 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim });
        if (e) {
          CV.text(CV.fit(e.name + ' +' + e.enhance, tw2 - 16 * CV.SCALE, CV.FS.md, true), x + tw2 / 2, y + th / 2 + 6 * CV.SCALE,
            { size: CV.FS.md, bold: true, align: 'center', color: rarColor(e.rarity) });
          CV.hit('eqd:' + eq[slot], x, y, tw2, th);
          /* 每格右上角「卸下」（网页版 .eq-un，和装备卡同一套） */
          /* 网页版 .eq-un：30×30 的卸下键，贴右上角 */
          CV.hit('punequip:' + slot, x + tw2 - 34 * CV.SCALE, y, 34 * CV.SCALE, 30 * CV.SCALE);
          CV.text('卸下', x + tw2 - 17 * CV.SCALE, y + 15 * CV.SCALE, { size: CV.FS.xs, color: CV.C.dim, align: 'center' });
        } else {
          CV.text('未装备', x + tw2 / 2, y + th / 2 + 6 * CV.SCALE, { size: CV.FS.md, align: 'center', color: CV.C.dim });
          /* V9.6.7 自审：空槽以前点了没反应（网页版空格子进候选列表） */
          CV.hit('eqslot:@player:' + slot, x, y, tw2, th);
        }
      });
      U.y = y0 + Math.ceil(slots.length / cols) * (th + gap) - gap;
      U.space(CV.SP[1]);
      U.btnRow([{ label: '⚡ 一键最优装备', style: 'ghost', id: 'autoeq_player' }]);
    });

    /* ⑤ 血统 */
    U.card(function () {
      /* 命格主题（V1.1）：标题走本命格的灯色，标题行右端挂本命格的印记 —— 与网页版同一形、同一色。
         灯色跟的是**大境界**（第 5 大境封顶，之后交给光晕）。 */
      const pbl = S.player.bloodline;
      const lamp = pbl ? CV.blLamp(pbl, Core.realmState().realm) : null;
      /* V1.0.6（父亲大人 09-24 反馈图 02「那一颗压在 Lv.1 / 50 上」）：
         印记原来画在标题行**最右端**，正好盖住右对齐的等级数字（截图里 50 被吃掉了）。
         改成网页版的站位 —— `🧬 命格` 后面跟着印记，右边那串等级字留给数字。 */
      U.h3('🧬 命格', pbl ? 'Lv.' + S.player.bloodlineLv + ' / ' + D.BLOODLINE_MAX : '未觉醒',
        lamp ? { color: lamp, glyph: { bl: pbl, color: lamp, size: CV.ICO * 0.75, after: true } } : null);
      if (S.player.bloodline) {
        U.hint(S.player.bloodline + '（' + ((D.BLOOD_THEME[S.player.bloodline] || {}).name || '') + '）：' + (D.BLOODLINES[S.player.bloodline] || {}).desc, 2 * CV.SCALE);
        U.space(CV.SP[1]);
        if (blCost) {
          /* V1.1.4（A12-F · 主角命格也吃「血髓晶」）：与伙伴详情同一套 ——
             材料单独一行（`have / need`），货币那串留在按钮上。
             ⚠️ 两边必须同源：主角这条走 Core.bloodlineQuote 取料，逻辑层
             `upgradePlayerBloodline` 也走同一个 quote，改一处不会漏另一处。 */
          const blMat = (D.ITEMS[blCost.mat] || {}).name || blCost.mat;
          const blHave = S.items[blCost.mat] || 0;
          if (blCost.matN) {
            U.kv(blMat, blHave + ' / ' + blCost.matN, blHave >= blCost.matN ? CV.C.green : CV.C.dim);
            U.space(CV.SP[1]);
          }
          U.btnRow([{ label: '命格升级（◆ ' + blCost.otherworld + ' + ◉ ' + fmt(blCost.points) + '）', style: 'ghost', id: 'pblup' }]);
        } else {
          U.hint('已满级', 2 * CV.SCALE);
        }
      } else if (S.player.level < D.BLOODLINE_UNLOCK_LV) {
        U.note('🔒 主角 Lv.' + D.BLOODLINE_UNLOCK_LV + ' 觉醒命格（当前 Lv.' + S.player.level + '）', 2 * CV.SCALE);
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
      U.h3('📊 属性面板', '装备 / 命格 / 境界 / 铭刻都已算进来');
      statRows(st).forEach(function (r) { U.kv(r[0], r[1]); });
    });
    /* ⑧ 修改名字（网页版主角详情最后一张卡） */
    U.card(function () {
      /* V1.0.4 · V（父亲大人 09-27）：**能敲、也能换** ——
         左「✏️ 输入新名字」= 调系统键盘敲（过机审才落盘）；
         右「🎲 换一个」= 从名单里轮换（本地白名单，**不联网**，断网照用）。 */
      U.btnRow([
        { label: '✏️ 输入新名字', style: 'ghost', id: 'rename' },
        { label: '🎲 换一个', style: 'ghost', id: 'rename_roll' },
      ]);
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
        /* F7 ②（父亲大人点名的例子「已加号」）：六维数字当场变（看得见 → 删成功语）；
           失败（点数不够）留。 */
        if (!r.ok) CV.toast(r.msg || '加不了');
        CV.render();
      });
    });
  });
  CV.on('attr_reset', function () {
    U.confirm('六维洗点', '把已经分出去的属性点全部退回来重新分配？六维总值不会掉，只是重新点一次。', function () {
      const r = Core.resetAttrs();
      /* F7 ②：洗点后六维当场回到基础值（看得见 → 删）；失败（没点可洗）留。 */
      if (!r.ok) CV.toast(r.msg || '洗不了');
      CV.render();
    });
  });
  [0, 1, 2].forEach(function (i) {
    CV.on('pskill:' + i, function () {
      const r = Core.allocateSkill(i);
      /* F7 ②：技能等级当场变（看得见 → 删）；失败（技能点不够）留。 */
      if (!r.ok) CV.toast(r.msg || '点不了');
      CV.render();
    });
  });
  CV.on('pskill_reset', function () {
    U.confirm('技能重置', '把投进去的技能点全部退回，技能回到 Lv.0 重新点？点数一点不少。', function () {
      const r = Core.resetSkills();
      /* F7 ②：同上（技能当场回 Lv.0）。 */
      if (!r.ok) CV.toast(r.msg || '洗不了');
      CV.render();
    });
  });
  CV.on('pblup', function () {
    const r = Core.upgradePlayerBloodline();
    /* F7 ②：命格等级当场变（看得见 → 删）；材料不足这类失败留。 */
    if (!r.ok) CV.toast(r.msg || '升不了');
    CV.render();
  });
  Object.keys(D.BLOODLINES).forEach(function (id) {
    CV.on('pbl:' + id, function () {
      const r = Core.choosePlayerBloodline(id);
      /* F7 ②：觉醒后命格区整块换掉（看得见 → 删）；失败留。 */
      if (!r.ok) CV.toast(r.msg || '觉不了');
      CV.render();
    });
  });
  Object.keys(D.EQUIP_SLOTS).forEach(function (slot) {
    CV.on('punequip:' + slot, function () {
      Core.unequipItem('@player', slot);
      /* F7 ②：卸下后那一格当场空出来（看得见 → 删）。 */
      CV.render();
    });
  });
  /* ================= V1.0.4 · V（父亲大人 09-27：「自由命名可以接入 api 不……」）=================
     这一处是当年**第三处漏网**（V1.0.1 提审前靠 `grep showKeyboard` 数出来的）：前两处堵了、
     改名还在自由输入。当时的处置是"只能从灯阁名册里换"。
     现在两样都给：🎲 那条是**老路原样保留**（白名单、不联网），✏️ 那条走 **机审闸**
     （`G.NameCheck` → 云函数 `checkname`，过审才落盘）。
     ⚠️ 改名**必须联网**：这台设备没云能力时给"联网后再改"的说法，**不许假装成功**。 */
  let renameDraft = '';
  function renameDialog() {
    /* V1.0.4 · V2（父亲大人 09-27：「起名窗口不用有那么多小字注释」）：
       弹窗只留 **标题 ＋ 输入格 ＋ 确定/取消** —— 正文与小字注释都撤了（长度写在输入格的提示语里）。
       原来那句"会先送到微信内容安全那边审一下"属于解释性说明，现在**挪到该说话的时候再说**：
       真审不过说"这个名字过不了"，我们这头不通说"改名暂时用不了"（见 js/sc-namecheck.js 顶部）。 */
    U.confirm('改名字',
      '',
      /* 确定 → 机审 → 落盘；不过就不落盘，弹窗留着让他再改（与删档那套一个脾气）。 */
      function () {
        const nm = renameDraft;
        G.NameCheck.submit(nm, function (r) {
          if (!r.ok) {
            /* **两类话分开**（康康 09-27 复核）：
                 · 他的名字有问题（本地筛 / 命中敏感）→ 弹窗留着，让他接着改；
                 · 我们这头不通（无云 / 接口失败 / 超时）→ **关掉弹窗**、指回名单那条路，
                   而且**不许说成"你的名字没过审"**（父亲大人实测时正是被这句骗到，以为微信什么名字都不让起）。 */
            if (r.why === '敏感' || r.why === '本地') { CV.toast(r.msg); renameDialog(); return; }
            U.overlay = null;
            /* F1 · 0930L：**照 `submit` 自己那句说**（`r.msg` 已经分好档 ——
               "云服务未连上" 还是 "审核服务暂时异常"），别拿一句固定的兜底话盖掉真原因。 */
            CV.toast(r.msg || G.NameCheck.MSG_DOWN_RENAME);
            CV.render();
            return;
          }
          const ok = Core.setPlayerName(r.name || nm);
          /* F7 ②：改完名字在页面上就写着（看得见 → 删成功语）；失败那句留。
             ⚠️ F1 · 0930L：这句原来写的是"这个名字没通过" —— 而走到这儿失败时，
                名字**是过了机审的**（`submit` 已经签发了凭据），八成是**凭据过期/被别的入口用掉了**
                （一次性、60 秒）。把锅甩给名字正是父亲大人被误导过的那一类说法，改说真因。 */
          if (!ok) CV.toast('这次没审上（过审凭据是一次性的、60 秒过期）：再点一次「确定」重审一遍');
          CV.render();
        });
      },
      {
        inputBox: { value: renameDraft, placeholder: '点这里输入新名字' },
        inputId: 'rename_input',
        okLabel: '用这个名字',
      });
  }
  CV.on('rename_input', function () {
    G.NameCheck.ask(renameDraft, function (text, err) {
      if (err) { CV.toast(err); return; }
      const l = G.NameCheck.local(text);
      if (!l.ok) { CV.toast(l.msg); return; }
      renameDraft = l.name;
      renameDialog();
    });
  });
  CV.on('rename', function () {
    if (!G.NameCheck.available()) {
      /* 我们这头不通（连云能力都没有）：**不说"你的名字怎么样"**，直接指回名单那条路。 */
      CV.toast(G.NameCheck.MSG_DOWN_RENAME);
      return;
    }
    renameDraft = Core.isListName(Core.S.player.name) ? '' : Core.S.player.name;
    renameDialog();
  });
  /* 老路（一个字都没改口径）：只能从灯阁名册里换，点一下换下一个，不联网。 */
  CV.on('rename_roll', function () {
    const names = D.PROTAG_NAMES;
    let idx = Math.max(0, names.indexOf(Core.S.player.name));
    idx = (idx + 1) % names.length;
    const r = Core.setPlayerName(names[idx]);
    /* F7 ②：换名后名字当场变（看得见 → 删成功语）；"这个名字不合规"留。 */
    if (r === false) CV.toast('这个名字不合规，再点一次');
    CV.render();
  });
  CV.on('autoeq_player', function () {
    const r = Core.autoEquipBest('@player');
    CV.toast(r.changed ? '已换上 ' + r.changed + ' 件（只从背包里没穿的装备挑）' : '背包里没有更好的了', 2400);
    CV.render();
  });
})();
