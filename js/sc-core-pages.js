/* 剩下几条养成线的小页面（照网页版 js/ui.js 逐个复刻）
   ------------------------------------------------------------------------------
   · 灯阁评级 sectModal     · 灯阁权限 authorityModal · 基地建设 buildingsModal
   · 境界渡劫 realmModal    · 铭刻 geneLockModal      · 伴生体 beastModal
   · 转生天赋 reincarnModal · 灯录 codexModal
   文案与数值全部从 Core / DATA 取，界面只管摆位置（和网页版同一份数据源）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  let beastDetailId = null;      // 正在看哪一只伴生体（V9.6.132）
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  /* V1.1.x（2026-09-27 · 音频系统）：升级 / 解锁类动作的音效出口（建筑升级、伴生体升阶…）。
     G.AUD 不存在时静默跳过。 */
  function snd(name) { if (G.AUD && G.AUD.play) G.AUD.play(name); }
  const fmt = G.fmt || ((n) => String(n));
  const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;
  /* 二级页顶栏（标题 + 返回）——**唯一实现是 U.pageHead**（吸顶，见 uiw.js）；
     父亲大人 09-27 深夜：「每一屏的标题和返回键都固定在顶部吧，不然有时候要点返回又得滑回去」。 */
  function head(title) { return U.pageHead(title); }
  /* 二级页返回：实现**收口在 uiw.js 一处**（F2-7）—— 这里原来那份、sc-lines / sc-last 各一份，
     四份一字不差；本单把可改范围内的三份删掉（sc-guide 那份不在本单范围，见回单）。 */
  /* 一行"左标题 / 右小字"（网页版 .list-row 的 t1 + t2 两行） */
  /* 两行式列表行（灯阁权限 / 铭刻 / 境界 / 图鉴收集…都用它）
     V9.6.142（父亲大人："伴生体的孵化那行字被省略了" → 顺着全站扫了一遍）：**
     原来 t1 固定按 62% 宽、t2 固定按 72% 宽去 fit** —— 于是只要描述长一点就被砍成「…」。
     全站扫出 105 处这种"被省略"，光这个函数就占了一大半（灯阁权限那 20 行连
     「还差哪张图解锁」都被砍没了）。现在：
       · t1 / right 先量宽度，放得下就原样，放不下才让；
       · t2 **折成最多两行**画（行高跟着算），所以描述不会再丢半句。 */
  function row2(t1, t2, right, rightColor) {
    const iw = U.iw();
    const rw = right ? CV.measure(right, CV.FS.sm) : 0;
    const t1Max = iw - rw - (right ? 8 * CV.SCALE : 0);
    const t1Shown = CV.fit(t1, t1Max, CV.FS.lg, true);
    /* V1.0.6（新尺子 detail_audit ④ 抓到的**同类旧账**）：这一行走的是逐字折行，
       境界线那条「初期 Lv.3 · 10%　中期 Lv.6 · 20%…」正好被劈成「…· 9」/「3%　中期…」——
       跟父亲大人 09-24 报的悬赏「✦ 43 / 0」是**同一个病**（数字被折行劈开）。
       换成词级折行（只在 · / → / 空格 / 全角空格处断），数字不再被切开；
       一行里没有分隔符时它会自动退回逐字折行，行为与以前一致。 */
    const lines = t2 ? CV.wrapTokens(t2, iw, CV.FS.sm, 2) : [];
    const nameH = CV.FS.lg * 1.35, dH = CV.FS.sm * 1.55;
    const h = (t2 ? (10 * CV.SCALE + nameH + 3 * CV.SCALE + lines.length * dH + 8 * CV.SCALE)
      : 34 * CV.SCALE);
    const top = U.y, cy = top + (t2 ? 10 * CV.SCALE + nameH / 2 : h / 2);
    CV.text(t1Shown, U.ix(), cy, { size: CV.FS.lg, bold: true });
    if (right) CV.text(CV.fit(right, iw - CV.measure(t1Shown, CV.FS.lg, true) - 6 * CV.SCALE, CV.FS.sm), U.ix() + iw, cy,
      { size: CV.FS.sm, color: rightColor || CV.C.dim, align: 'right' });
    lines.forEach(function (ln, k) {
      CV.text(ln, U.ix(), top + 10 * CV.SCALE + nameH + 3 * CV.SCALE + dH * (k + 0.5), { size: CV.FS.sm, color: CV.C.dim });
    });
    U.y = top + h;
    return h;
  }

  /* ---------- 灯阁评级 ---------- */
  CV.register('sect', function () {
    const st = Core.sectInfo();
    U.begin(); head('灯阁评级');
    U.card(function () {
      U.h3('灯阁评级', 'Lv.' + st.lv + ' / ' + D.SECT_MAX);
      U.note('每级 全队全属性 +' + (st.rate * 100).toFixed(1) + '%（转生保留）', 2 * CV.SCALE);
      U.kv('距离下一级', st.exp + ' / ' + st.need);
      U.kv('当前生效', '全队全属性 +' + (st.pct * 100).toFixed(1) + '%', CV.C.gold);
      U.kv('下一级变成', '+' + (st.nextPct * 100).toFixed(1) + '%');
    });
    U.card(function () {
      U.h3('评级经验从哪来', '首通全额 · 重复刷一半');
      /* V1.1.12（0927-B · 三机型复审）：原来左边写「通关 普通 / 困难 / 地狱」（13 个汉字 ≈195pt）、
         右边一串「+3 / +5 / +8」—— 在 **320×568** 上两边加起来 309pt > 可用宽 296pt，
         `U.kv` 的"保右边"分支就把**左边砍成「通关 普通 / 困难 / …」**（320 上实测）。
         改法：把三个难度挪到**值**那一侧、左边只留 4 个字的类目 —— 两边加起来 238pt，320 也放得下，
         而且读起来更像"一类加成照三个难度各给多少"。 */
      U.kv('通关加成', '普通+' + st.gain.normal + '·困难+' + st.gain.hard + '·地狱+' + st.gain.hell);
      U.kv('每打赢一场战斗', '+' + st.gain.win);
      U.kv('挂机（在线 / 离线都算）', '每分钟 +' + st.gain.perMin);
    });
  });

  /* ---------- 灯阁权限 ---------- */
  CV.register('authority', function () {
    const au = Core.authorityInfo();
    U.begin(); head('灯阁权限');
    U.card(function () {
      U.h3('灯阁权限', 'Lv.' + au.lv + ' / ' + au.max);
      U.note('投入一次永久生效，转生不清空 · 花 ✦ 圣洁晶石 + ◆ 异界结晶', 2 * CV.SCALE);
      U.kv('挂机产出', '+' + Math.round((au.now.idlePct || 0) * 100) + '%');
      U.kv('挂机经验', '+' + Math.round((au.now.expPct || 0) * 100) + '%');
      U.kv('离线上限', '+' + (au.now.capHours || 0).toFixed(1) + ' 小时');
      U.kv('离线效率', '+' + Math.round((au.now.offlinePct || 0) * 100) + '%');
      const sw = D.SWEEP_DAILY_CAP + (au.now.sweep || 0);
      U.kv('每日扫荡次数', '+' + (au.now.sweep || 0) + ' 次（现在共 ' + sw + ' 次）');
    });
    /* V1.1.4（A12-F · 灯阁权限接「灯油」）：材料进"能不能点"的判定，也必须**单独一行显示** ——
       《收口2》§3.1 的三种新料都走这一套（材料与货币分开报，玩家才知道缺的是哪一样）。 */
    const auMat = au.cost ? (D.ITEMS[au.cost.mat] || {}) : {};
    const auMatHave = au.cost ? (Core.S.items[au.cost.mat] || 0) : 0;
    const can = !au.maxed && au.cost &&
      (Core.S.cur.holy || 0) >= au.cost.holy && (Core.S.cur.otherworld || 0) >= au.cost.otherworld
      && auMatHave >= (au.cost.matN || 0);
    /* V9.6.133：权限 20 级 → 每一级跟着进度解锁，所以界面上必须写清"还差哪张图"，
       否则玩家只看到一个灰按钮，不知道缺什么。 */
    const nextLv = au.lv + 1;
    const reqText = au.maxed ? '' : (((D.AUTHORITY[nextLv - 1] || {}).req) || '');
    const reqMet = au.maxed ? true : Core.authorityReqMet(nextLv);
    U.card(function () {
      U.h3('下一级 · Lv.' + nextLv, au.nextDesc || '已满级');
      if (au.cost) {
        U.kv('解锁条件', reqMet ? '✓ ' + reqText : reqText, reqMet ? CV.C.green : CV.C.dim);
        U.kv('✦ 圣洁晶石', (Core.S.cur.holy || 0) + ' / ' + au.cost.holy, (Core.S.cur.holy || 0) >= au.cost.holy ? CV.C.green : CV.C.dim);
        U.kv('◆ 异界结晶', (Core.S.cur.otherworld || 0) + ' / ' + au.cost.otherworld, (Core.S.cur.otherworld || 0) >= au.cost.otherworld ? CV.C.green : CV.C.dim);
        U.kv(auMat.name || '灯油', auMatHave + ' / ' + (au.cost.matN || 0), auMatHave >= (au.cost.matN || 0) ? CV.C.green : CV.C.dim);
        U.space(CV.SP[1]);
        /* V1.0.1（开发自审会诊）：`id: 条件 ? 'x' : ''` 会让按钮在条件不满足时
           **保持可点的样子、却没有热区**（点了没反应、也没提示）。网页版这一颗是 `disabled`。
           全项目同一批共 11 处，统一改成"id 照留、用 dis 进禁用态"。 */
        U.btnRow([{ label: '⚡ 提升灯阁权限', style: 'primary', id: 'auth_up', dis: !(can && reqMet) }]);
      }
    });
    U.card(function () {
      U.h3('权限一览（' + au.max + ' 级）');
      au.rows.forEach(function (a) {
        const got = a.lv <= au.lv;
        const ok = got || Core.authorityReqMet(a.lv);
        row2('Lv.' + a.lv, a.desc + (got ? '' : ' · ' + (ok ? '✓ 已解锁' : '🔒 ' + a.req)),
          got ? '已生效' : '', got ? CV.C.green : CV.C.dim);
      });
    });
  });
  CV.on('auth_up', function () {
    const r = Core.upgradeAuthority();
    /* F7 ②：成功＝权限等级当场变（看得见 → 删 toast）；失败要把理由说出来。 */
    if (!r.ok) CV.toast(r.msg || '提升不了');
    CV.render();
  });

  /* ---------- 基地建设 ---------- */
  CV.register('buildings', function () {
    const S = Core.S;
    U.begin(); head('基地建设');
    U.card(function () {
      U.h3('基地建设', '全部消耗 ◉ 点数');
      D.BUILDINGS.forEach(function (b) {
        const lv = S.buildings[b.id] || 0;
        const cost = D.buildingCost(b.id, lv);
        const top = U.y;
        const bw = 112 * CV.SCALE;
        const textW = U.iw() - bw - 8 * CV.SCALE;
        /* V9.6.142：建筑说明原来单行 fit → 「每级：装备强化费用 -1%（最多-40…」被砍。
           这些说明本身就是两句话，改成折到最多两行（行高跟着算），一字不丢。 */
        /* V1.1.12（0927-B · 三机型复审）：**最多两行**这个上限在 320 上不够 ——
           医疗室那句「每级：离线效率 +1%；每 10 级：离线上限 +0.2 小时」在窄屏正好要三行，
           而折行器第 2 行末尾会补「…」把它砍成「…离线上限 +0.2 …」（实测 320 上）。
           放到三行；行高**只在真的用了第三行时才加**（两行仍是 62，不动既有密度）。 */
        /* F2-5（抢修单 0928R3）：这颗「升级」原来写的是 `id: can ? 'bup:'+id : ''` 且**没给 `dis`**
           —— 点数不够时它照样画成能点的样子，点下去既没反应也没提示（真死键）。
           现在 `dis` 变灰 + 把"差什么"当一行小字写进卡片（行高跟着一起算，别压住下一行）。 */
        const can = (S.cur.points || 0) >= cost && lv < 50;
        const lack = can ? [] : [lv >= 50 ? '已到 50 级封顶'
          : ('点数不够：还差 ◉ ' + fmt(Math.max(0, cost - (S.cur.points || 0))) + '（当前 ◉ ' + fmt(S.cur.points || 0) + '）')];
        const dLines = CV.wrap(b.desc, textW, CV.FS.sm, 3).concat(
          lv >= 50 ? ['已到 50 级封顶'] : ['升级消耗：◉ ' + fmt(cost)].concat(lack)
        );
        const rowH = (dLines.length >= 3 ? (56 + (dLines.length - 1) * 17) : dLines.length === 2 ? 62 : 56) * CV.SCALE;
        const h = rowH;
        CV.text(CV.fit(b.name + '  Lv.' + lv + '/50', textW, CV.FS.lg, true), U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        dLines.forEach(function (ln, k2) {
          CV.text(ln, U.ix(), top + (36 + k2 * 17) * CV.SCALE,
            { size: CV.FS.sm, color: (k2 >= dLines.length - lack.length && lack.length) ? CV.C.accent : CV.C.dim });
        });
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          lv >= 50 ? '已满级' : '升级', 'ghost', 'bup:' + b.id, !can);
        U.y = top + h;
      });
    });
  });
  D.BUILDINGS.forEach(function (b) {
    CV.on('bup:' + b.id, function () {
      const r = Core.upgradeBuilding(b.id);
      snd(r.ok ? 'levelup' : 'error');
      /* F7 ②：建筑等级当场变（看得见 → 删）；失败留（材料 / 点数不够这类要读得到）。 */
      if (!r.ok) CV.toast(r.msg || '升级不了');
      CV.render();
    });
  });

  /* ---------- 境界渡劫 ---------- */
  CV.register('realm', function () {
    const st = Core.realmState();
    U.begin(); head('境界渡劫');
    U.card(function () {
      /* 命格主题（V1.1）：这一屏就是"灯"的落点之一 —— 标题 + 标题行右端的印记 + 境界条
         三处都走本命格的灯色（与网页版同一形、同一色、同一条进度）。 */
      const lamp = st.hasBloodline ? CV.blLamp(st.bloodline, st.realm) : null;
      /* 印记站位同主角详情（V1.0.6）：挂在标题文字后面，不再甩到最右端压住等级数字 */
      U.h3(st.curName || '未定命格', '已突破 ' + st.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶',
        lamp ? { color: lamp, glyph: { bl: st.bloodline, color: lamp, size: CV.ICO * 0.75, after: true } } : null);
      if (lamp) {
        const bh = 4 * CV.SCALE, by = U.y;
        const pct = Math.max(0, Math.min(1, st.realm / D.REALM_STAGE_COUNT));
        U.draw(function () {
          CV.round(U.ix(), by, U.iw(), bh, bh / 2, CV.C.line);
          if (pct > 0) CV.round(U.ix(), by, Math.max(bh, U.iw() * pct), bh, bh / 2, lamp);
        });
        U.y = by + bh + CV.SP[1];
      }
      U.kv('当前境界加成', '+' + (Core.realmBonusPct() * 100).toFixed(1) + '%', CV.C.gold);
      if (!st.hasBloodline) { U.note('先去选一条命格（境界线跟着命格走）', 2 * CV.SCALE); return; }
      const nx = st.next;
      if (nx) {
        U.space(CV.SP[1]);
        /* V9.6.97（父亲大人："选科技，进游戏变成修真了"）——**就是这一行**：
           `nx` 是全局渡劫表 D.REALMS（等级 / 消耗 / 成功率），它上面的 `name`/`full`
           是**修真那条线**的名字（炼气 / 筑基 / 金丹…），当初只有一个境界线时写死的。
           血统=定位之后，每支血统有自己的境界名，网页版早就改成 `st.nextName`（血统感知），
           小游戏这行漏了 —— 于是任何血统进来都会看到「下一阶 · 炼气」，
           看着就像"血统被换成修真了"。 */
        /* 回退一律用 '—'，**不许再退回渡劫表的旧名字**（那正是当初串味的来源） */
        U.h3('下一阶 · ' + (st.nextName || '—'), '成功率 ' + Math.round(nx.rate * 100) + '%');
        U.kv('等级要求', 'Lv.' + nx.lv + '（当前 Lv.' + Core.S.player.level + '）', Core.S.player.level >= nx.lv ? CV.C.green : CV.C.dim);
        U.kv('渡劫材料', ((D.ITEMS[st.matItem] || {}).name || st.matItem) + ' ' + st.haveMat + ' / ' + st.matN);
        U.kv('点数', '◉ ' + fmt(st.points));
        U.space(CV.SP[1]);
        U.btnRow([{ label: '渡劫', style: 'primary', id: 'realm_try' }]);
        U.hint('失败也扣材料与点数（等级不掉）', 4 * CV.SCALE);
      } else {
        /* V9.6.90：网页版走到大圆满时是**一张明确的卡**（"已至大圆满 / 当前境界已是这条血统的终点"）。
           小游戏原来这里什么都不画 —— 玩家看到一张空卡，只能猜"是不是卡了"。 */
        U.space(CV.SP[1]);
        U.h3('已至大圆满');
        U.note('当前境界已是这条命格的终点。', 2 * CV.SCALE);
      }
    });
    /* 境界线：9 大境 × 4 小阶（网页版把整条线都列出来） */
    {
      const bl = D.BLOODLINES[st.bloodline] || { realms: D.REALM_MAJORS };
      const majors = bl.realms || D.REALM_MAJORS;
      U.card(function () {
        U.h3((st.bloodline || '') + '境界线', '9 大境 × 4 小阶');
        majors.forEach(function (mj, mi) {
          const base = mi * D.REALM_TIERS.length;
          const steps = D.REALM_TIERS.map(function (tier, ti) {
            const r = D.REALMS[base + ti] || {};
            return tier + ' Lv.' + r.lv + ' · ' + Math.round((r.rate || 0) * 100) + '%';
          });
          const done = Math.max(0, Math.min(4, st.realm - base));
          row2((mi + 1) + '. ' + mj, steps.join('　'), done + '/4', done > 0 ? CV.C.green : CV.C.dim);
        });
      });
    }
  });
  CV.on('realm_try', function () {
    /* F2-7（抢修单 0928R3 · 大额 / 不可逆补二次确认）：渡劫是"会失败、失败也照扣材料与点数"
       的动作 —— 消耗由 `Core.realmState()` 现算（不手抄），先问一句再打。
       口径与"转生 / 分解 / 删档"那几颗一致（它们本来就问）。 */
    const st = Core.realmState();
    const nx = st.next;
    U.confirm('渡劫', nx
      ? ('突破「' + (st.nextName || '下一阶') + '」：消耗 ' + ((D.ITEMS[st.matItem] || {}).name || st.matItem)
        + ' ×' + st.matN + ' ＋ ◉ ' + fmt(st.points) + '，成功率 ' + Math.round(nx.rate * 100)
        + '%。失败也扣（等级不掉）。确定吗？')
      : '现在这一步渡不了（条件没满足）。', function () {
      const r = Core.attemptRealm();
      /* F7 ②：渡劫成功＝境界当场变（看得见 → 删）；失败**必须留**（失败也扣，得让人知道）。 */
      if (!r.ok || !r.success) CV.toast(r.msg || '渡劫失败');
      CV.render();
    }, { okLabel: '渡劫' });
  });

  /* ---------- 铭刻 ---------- */
  CV.register('genelock', function () {
    const S = Core.S;
    const info = Core.geneLockInfo();
    U.begin(); head('铭刻');
    U.card(function () {
      U.h3('铭刻', '当前：' + (info.max ? '已完全解锁' : (S.player.geneLock > 0 ? S.player.geneLock + ' 阶' : '未解锁')));
      if (!info.max) {
        const n = info.next;
        row2(n.stage + '阶 · ' + n.name, n.desc, '');
        U.space(CV.SP[1]);
        U.kv('条件', n.req);
        if (info.matN) U.kv((D.ITEMS[info.mat] || {}).name || info.mat, info.matHave + ' / ' + info.matN, info.matHave >= info.matN ? CV.C.green : CV.C.dim);
        if (!info.can && info.reqs && info.reqs.length) U.hint('未满足：' + info.reqs.join(' · '), 4 * CV.SCALE);
        U.space(CV.SP[1]);
        U.btnRow([{ label: '突破铭刻', style: 'primary', id: 'gl_unlock', dis: !info.can }]);
      }
    });
    U.card(function () {
      /* V1.1.4：这一页的标题还是「五阶一览」—— 那是 V9.6.130 把铭刻从 5 阶扩到 20 阶之前的话，
         下面的循环早就 20 行了（列表比标题多 15 行，玩家会以为显示错了）。
         同一张卡里的「五阶」二字改成「铭刻一览」（1~20 阶都在下面）。 */
      U.h3('铭刻一览');
      D.GENE_LOCKS.forEach(function (g, i) {
        const on = S.player.geneLock >= g.stage;
        row2(g.stage + '阶 · ' + g.name, g.desc, on ? '已解锁' : (i === S.player.geneLock ? '下一个' : ''), on ? CV.C.green : CV.C.dim);
      });
    });
  });
  CV.on('gl_unlock', function () {
    const r = Core.geneLockUnlock();
    /* F7 ②：铭刻状态当场变（看得见 → 删）；"条件未满足"这类失败留。 */
    if (!r.ok) CV.toast(r.msg || '条件未满足');
    CV.render();
  });

  /* ---------- 伴生体 ---------- */
  CV.register('beast', function () {
    const st = Core.beastState();
    U.begin(); head('伴生体');
    U.card(function () {
      U.h3('伴生体', '已收集 ' + st.count + ' / ' + D.BEASTS.length);
      /* V1.0.1（文案策划会诊）：旧数字"Boss 必掉 1~3 颗"（承诺比实际好）；
         实际守关 Boss 10% / 精英 5%，另有药园、游历奇遇、灯阁市集三个来源。 */
      U.note('伴生体是第二条养成线：上阵 1 只，给全队加属性 + 五行克制。孵化花兽魂石，重复获得转兽魂，兽魂用来升阶。兽魂石由守关 Boss、精英怪概率掉落，药园收成、游历奇遇、市集也能拿到。', 2 * CV.SCALE);
      U.space(CV.SP[1]);
      U.kv('当前随行', st.activeBeast ? st.activeBeast.name : '还没有随行伴生体', CV.C.gold);
      U.kv('孵化', '兽魂石 ' + st.eggs + ' 颗 · 每 ' + st.eggCost + ' 颗孵 1 只');
      U.space(CV.SP[1]);
      U.btnRow([
        { label: '孵化×1', style: 'ghost', id: 'beast_hatch1', dis: st.eggs < st.eggCost },
        { label: '孵化×10', style: 'gold', id: 'beast_hatch10', dis: st.eggs < st.eggCost * 10 },
      ]);
    });
    U.card(function () {
      U.h3('我的伴生体', st.count + ' / ' + D.BEASTS.length);
      if (!st.list.length) { U.hint('还没有伴生体，去孵化一只', 4 * CV.SCALE); return; }
      /* ⚠️ V9.6.133 修（父亲大人："我的伴生体完全没显示"）——
         这里原来把**列表条目**当成了伴生体数据：条目是 {id, b, lv, soul, active, pct, maxLv}，
         伴生体本体在 `b` 里面。于是 b.name / b.elem / b.desc 全是 undefined，
         fit()/wrap() 拿到 undefined 就什么都不画 —— 整块列表只剩「随行中」三个字。 */
      st.list.forEach(function (x) {
        const b = x.b;
        const active = x.active;
        /* V9.6.129（父亲大人："伴生体的界面里面的文字被省略了"）：
           原来第二行走 row2 → **单行 fit 截断**，描述全被砍成"…"。
           现在自己画两行：名字一行 + 描述**折行到两行**（rowH 跟着算），不再省略。 */
        const tx = U.ix() + 34 * CV.SCALE;          // 稀有度占左边一小列（和法宝 / 坐骑同一套版式）
        const textW = U.iw() - 34 * CV.SCALE;
        const nameH = CV.FS.lg * 1.35, dH = CV.FS.sm * 1.55;
        const nameW = textW - CV.measure('点一下随行', CV.FS.sm) - 8 * CV.SCALE;
        const lines = CV.wrap((b.elem ? D.ELEMENT_ICON[b.elem] + ' ' + b.elem + ' · ' : '') + (D.beastDesc(b) || ''), textW, CV.FS.sm, 2);
        const rh = 6 * CV.SCALE + nameH + 3 * CV.SCALE + lines.length * dH + 6 * CV.SCALE;
        const top = U.y;
        CV.text(b.rarity || 'N', U.ix(), top + 6 * CV.SCALE + nameH / 2, { size: CV.FS.sm, bold: true, color: rarColor(b.rarity) });
        CV.text(CV.fit(b.name + '  Lv.' + x.lv + '/' + D.BEAST_MAX_LV, nameW, CV.FS.lg, true),
          tx, top + 6 * CV.SCALE + nameH / 2, { size: CV.FS.lg, bold: true });
        CV.text(CV.fit(active ? '随行中' : '点一下随行', U.iw() * 0.32, CV.FS.sm), U.ix() + U.iw(), top + 6 * CV.SCALE + nameH / 2,
          { size: CV.FS.sm, color: active ? CV.C.green : CV.C.dim, align: 'right' });
        lines.forEach(function (ln, k) {
          CV.text(ln, tx, top + 6 * CV.SCALE + nameH + 3 * CV.SCALE + dH * (k + 0.5), { size: CV.FS.sm, color: CV.C.dim });
        });
        /* 点名字那一列 → 二级详情；右边那半 → 随行/收回（V9.6.132） */
        CV.hit('beast_detail:' + x.id, U.ix(), top, U.iw() * 0.68, rh);
        CV.hit('beast_on:' + x.id, U.ix() + U.iw() * 0.68, top, U.iw() * 0.32, rh);
        U.y = top + rh;
      });
    });
    U.card(function () {
      U.h3('五行相克');
      /* V9.6.129（父亲大人："又有五行相克、又有各世界的属性，这一块我没太懂"）：
         原来把**36 个世界各自的属性**铺了一大行 —— 那是"数据罗列"，不是"机制说明"。
         现在只说清三件事：怎么相克 / 克制有什么好处 / 你现在打的那张图是什么属性。 */
      U.hint('⚔️金 克 🌿木　🌿木 克 ⛰️土　💧水 克 🔥火　🔥火 克 ⚔️金　⛰️土 克 💧水', 2 * CV.SCALE);
      /* V9.6.21 自审：`D.worldElementIcon` 不存在（外面 ? : 兜住了，图标一直是空的）
         正确写法是 ELEMENT_ICON[worldElement(id)]。 */
      /* 每张图有自己的五行：随行伴生体若**克制**这张图 → 全队伤害 +15%；被克则 −8%。
         只显示"你现在这张图"，不再罗列 36 张。 */
      {
        const wid = (Core.boxSourceWorld ? Core.boxSourceWorld() : null) || 'W01';   // 当前进度那张图
        const we = D.worldElement(wid);
        const mine = st.activeBeast && st.activeBeast.elem;
        const bonus = mine ? (D.ELEMENT_COUNTER[mine] === we ? '克制 +' + Math.round(D.ELEMENT_BONUS * 100) + '% 伤害'
          : (D.ELEMENT_COUNTER[we] === mine ? '被克 −' + Math.round(D.ELEMENT_PENALTY * 100) + '% 伤害' : '无克制关系')) : '（先带一只随行才有效果）';
        U.hint('随行伴生体的五行 × 这张图的属性 才算克制：克制 +' + Math.round(D.ELEMENT_BONUS * 100) + '% 伤害，被克 −' + Math.round(D.ELEMENT_PENALTY * 100) + '% 伤害。', 4 * CV.SCALE);
        U.hint('当前进度「' + ((D.WORLDS.find((x) => x.id === wid) || {}).name || wid) + '」是' + (D.ELEMENT_ICON[we] || '') + we +
          ' · 你的随行是' + (mine ? (D.ELEMENT_ICON[mine] || '') + mine + ' → ' + bonus : '（无）'), 2 * CV.SCALE,
          mine ? (D.ELEMENT_COUNTER[mine] === we ? CV.C.green : CV.C.dim) : CV.C.dim);
      }
    });
  });
  /* V9.6.132（父亲大人："伴生体孵完蛋后没有看到伴生体的名字"）：
     Core.hatchBeast 一直**返回了**孵出谁，但界面只 toast 一句"孵化 N 只"——名字全丢了。
     V9.6.133（父亲大人："最近孵出可以不要"）：改名卡撤掉，只在 toast 里**把名字念全**
     （最多念 3 个），剩下靠下面「我的伴生体」列表自己看 —— 同一批信息不占两处。 */
  function hatchThen(n) {
    const r = Core.hatchBeast(n);
    if (r && r.got && r.got.length) {
      const names = r.got.slice(0, 3).map(function (g) {
        const b = D.beastById(g.id) || {};
        return b.name || g.id;
      });
      CV.toast('孵出「' + names.join('、') + '」' +
        (r.got.length > names.length ? ' 等 ' + r.got.length + ' 只' : ''));
    } else {
      CV.toast((r && r.msg) || '孵化失败');
    }
    CV.render();
  }
  CV.on('beast_hatch1', function () { hatchThen(1); });
  CV.on('beast_hatch10', function () { hatchThen(10); });
  CV.on('beast_on:*', function (id) {
    const r = Core.setActiveBeast(id);
    /* F7 ②：随行状态在那张卡上写着（"随行中" → 看得见，删）；失败留。 */
    if (!r.ok) CV.toast(r.msg || '换不了随行');
    CV.render();
  });

  /* ---------- 伴生体详情（V9.6.132 父亲大人："没有对应的养成系统"）----------
     原来这一页只有"12 个上限 + 选择随行" —— 兽魂 / 升阶 / 五行加成对比全看不到。
     这一页把 core 里已经有的东西**摆出来**：等级、兽魂进度、升阶（消耗兽魂）、随行加成。 */
  CV.register('beast_detail', function () {
    const bd = D.beastById(beastDetailId) || null;
    const owned = (Core.S.beast.owned || {})[beastDetailId] || null;
    U.begin();
    U.pageHead('伴生体详情', { backId: 'page_back' });   // 吸顶（父亲大人 09-27 深夜 · 派单 Z-B）
    if (!bd || !owned) { U.card(function () { U.h3('伴生体详情'); U.hint('这只伴生体不在了（可能刚换过存档）', 4 * CV.SCALE); }); return; }
    const lv = owned.lv || 0, soul = owned.soul || 0;
    const need = D.BEAST_SOUL_PER_LV * (lv + 1);
    const pct = D.beastPctAt(bd, lv);
    U.card(function () {
      U.h3((D.ELEMENT_ICON[bd.elem] || '') + bd.name, bd.rarity + (bd.elem ? ' · ' + bd.elem : ''));
      U.kv('等级', lv + ' / ' + D.BEAST_MAX_LV, lv >= D.BEAST_MAX_LV ? CV.C.gold : CV.C.text);
      U.kv('兽魂', soul + (lv >= D.BEAST_MAX_LV ? '' : '（升下一级需要 ' + need + '）'), soul >= need ? CV.C.green : CV.C.dim);
      const txt = Object.keys(pct || {}).map(function (k) {
        return ({ atkPct: '攻击', hpPct: '生命', defPct: '防御', spdPct: '速度', critPct: '暴击', skillPct: '技能', evaPct: '闪避', dmgReduce: '减伤', lifesteal: '汲取', initEnergy: '开场能量', spiritPct: '精神' }[k] || k) + ' +' + (pct[k] < 1 ? Math.round(pct[k] * 100) + '%' : pct[k]);
      }).join(' · ');
      U.kv('当前加成', txt || '—', CV.C.green);
      U.space(CV.SP[1]);
      U.hint(bd.desc || '', 0);
    });
    U.card(function () {
      U.h3('升阶', '消耗兽魂提升等级');
      U.space(CV.SP[1]);
      U.btnRow([
        { label: lv >= D.BEAST_MAX_LV ? '已满级' : ('升 1 级（兽魂 ' + need + '）'), style: 'gold',
          id: 'beast_up', dis: !(lv < D.BEAST_MAX_LV && soul >= need) },
        { label: Core.S.beast.active === beastDetailId ? '收回随行' : '设为随行', style: 'ghost', id: 'beast_setactive' },
      ]);
      U.hint('兽魂从哪来：重复孵到同一只就转成兽魂（越稀有给得越多）。', 4 * CV.SCALE);
    });
  });
  CV.on('beast_detail:*', function (id) { beastDetailId = id; CV.push('beast_detail'); });
  CV.on('beast_up', function () {
    const r = Core.beastLevelUp(beastDetailId);
    snd(r.ok ? 'levelup' : 'error');
    CV.toast(r.msg || '升阶失败');
    CV.render();
  });
  CV.on('beast_setactive', function () {
    const on = Core.S.beast.active === beastDetailId;
    const r = Core.setActiveBeast(on ? null : beastDetailId);
    /* F7 ②：同上 —— 卡上"随行中"当场变。 */
    if (!r.ok) CV.toast(r.msg || (on ? '收不回来' : '随行不了'));
    CV.render();
  });

  /* ---------- 转生天赋 ---------- */
  CV.register('reincarn', function () {
    const S = Core.S;
    /* V9.6.74（审计抓到的真 bug）：Core.canReincarnate() 返回的是**布尔**，
       这里却按对象用（can.ok / can.msg）—— 于是"条件"永远显灰、**「开始转生」按钮永远没有 id**
       （看着在、点不动，玩家根本转生不了）。 */
    const can = { ok: Core.canReincarnate() };
    /* V9.6.76：门槛改成**逐次抬高**（第 1 次铭刻 2+灯芯 20、之后 3/30、4/35、5/40）——
       页面上的数字必须跟着下一次转生走，不能再写死 "铭刻 x/5 · 灯芯 y/30"。 */
    const need = Core.reincarnNeed();
    can.msg = can.ok ? '' : ('条件未满足：玩家 Lv.' + S.player.level + '/' + need.lv + ' · 铭刻 ' + S.player.geneLock + '/' + need.geneLock + ' · 灯芯 Lv.' + (S.buildings.core || 0) + '/' + need.core);
    U.begin(); head('转生天赋');
    U.card(function () {
      U.h3('转生', '已转生 ' + (S.player.reincarnations || 0) + ' 次');
      /* 2026-09-27（父亲大人深夜拍板：**深井和世界进度都保留**）：这两行是**说明**，
         必须与 reincarnate() 的行为逐字对得上（尺子 = test_game 里的"转生说明＝行为"那组）。
         转生只动等级这一条线；六维已投的点数留着，只有"可用点"按等级重算。 */
      U.note('会重置：玩家等级回到 Lv.0（升级给的属性点、技能点按新等级重新计算，已经点上的六维与技能不受影响）。', 2 * CV.SCALE);
      U.note('会保留：残域世界进度与深井层数、伙伴（含等级与技能）、装备、主角技能与属性、命格、铭刻、天赋、全部货币。', 2 * CV.SCALE);
      /* V9.6.142：三个条件并排塞进 kv 的右半边 → 「… · 灯芯Lv.0/…」被砍掉，
         玩家看不到第三个门槛。改成**整行说明**（占满宽度），三项一条不漏。 */
      U.hint('第 ' + ((S.player.reincarnations || 0) + 1) + ' 次转生条件：玩家 Lv.' + S.player.level + '/' + need.lv
        + ' · 铭刻 ' + S.player.geneLock + '/' + need.geneLock + ' · 灯芯 Lv.' + (S.buildings.core || 0) + '/' + need.core,
        2 * CV.SCALE, can.ok ? CV.C.green : CV.C.gold);
      if (!can.ok && can.msg) U.hint(can.msg, 4 * CV.SCALE);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '开始转生', style: 'primary', id: 'do_reincarn', dis: !can.ok }]);
    });
    U.card(function () {
      U.h3('永久天赋', '♾ ' + fmt(S.cur.rp || 0));
      U.hint('四支天赋点满各需 ♾ 6200（10/20/40/80/150/300/600/1000/1500/2500）。加成对全队生效，转生后保留。', 2 * CV.SCALE);
      U.space(CV.SP[1]);
      Object.keys(D.TALENTS || {}).forEach(function (br) {
        const t = D.TALENTS[br];
        const lv = (S.player.talents && S.player.talents[br]) || 0;
        const cost = (D.TALENT_COSTS || [])[lv];
        const top = U.y, h = 56 * CV.SCALE;
        const bw = 84 * CV.SCALE;
        const textW = U.iw() - bw - 8 * CV.SCALE;
        CV.text(t.name + '  Lv.' + lv + '/10', U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text(CV.fit(t.desc, textW, CV.FS.sm), U.ix(), top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        /* F2-5：♾ 不够时那颗「升级 ♾N」原来是一颗画着能点、点了没反应的假按钮
           —— 现在走 `dis` 变灰，并把"差多少"写在同一行的说明后面（满级就写满级）。 */
        const canUp = cost !== undefined && (S.cur.rp || 0) >= cost;
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          cost === undefined ? '已满' : ('升级 ♾' + cost), 'ghost',
          'talent_up:' + br, !canUp);
        if (!canUp) {
          CV.text(CV.fit(cost === undefined ? '这支天赋已满级' : ('♾ 不够：还差 ' + fmt(Math.max(0, cost - (S.cur.rp || 0)))), textW, CV.FS.xs),
            U.ix(), top + 50 * CV.SCALE, { size: CV.FS.xs, color: CV.C.accent });
        }
        /* 行高不够时补一点（那一行小字不能压到下一支天赋上） */
        U.y = top + Math.max(h, ((!canUp ? 66 : 56)) * CV.SCALE);
      });
    });
  });
  CV.on('do_reincarn', function () {
    U.confirm('转生', '确定转生？等级回到 Lv.0（升级给的属性点、技能点按新等级重算，已经点上的六维与技能不受影响），换来永久天赋点；残域进度、深井层数、伙伴 / 装备 / 命格 / 铭刻 / 货币全部保留。', function () {
      const r = Core.reincarnate();
      /* V1.0.4 · R9（父亲大人 09-27 点单）：`reincarn`（转生）—— 只报"这是第几次转生"，
         不带名字、不带账号。转生是小游戏里最贵的一个动作，后台要能看出"谁走到这儿了"。 */
      try {
        if (G.LOG && (!r || r.ok !== false)) G.LOG.event('reincarn', { count: ((Core.S.player.reincarnations || 0)) });
      } catch (e) {}
      /* F7 ②：转生成功后落到主画面、等级当场变 Lv.0（看得见 → 删）；失败留。 */
      if (r && r.ok === false) CV.toast(r.msg || '转不了');
      CV.reset('home');
    });
  });
  Object.keys(D.TALENTS || {}).forEach(function (br) {
    CV.on('talent_up:' + br, function () {
      /* F2-7（大额补二次确认）：一支天赋一路点到头要 ♾6200，单点最贵的一档就是 ♾2500 ——
         以前点一下直接扣，一句都不问。消耗按**当前这一级**现算（`D.TALENT_COSTS[lv]`）。 */
      const t = (D.TALENTS || {})[br] || {};
      const lv = (Core.S.player.talents && Core.S.player.talents[br]) || 0;
      const cost = (D.TALENT_COSTS || [])[lv];
      U.confirm('升级天赋', '把「' + (t.name || br) + '」从 Lv.' + lv + ' 升到 Lv.' + (lv + 1)
        + '：消耗 ♾ ' + fmt(cost || 0) + '（现有 ♾ ' + fmt(Core.S.cur.rp || 0) + '）。'
        + '永久天赋转生后保留，确定吗？', function () {
        const r = Core.buyTalent(br);
        /* F7 ②：天赋等级当场变（看得见 → 删）；失败留（♾ 不够这类）。 */
        if (!r.ok) CV.toast(r.msg || '升不了');
        CV.render();
      }, { okLabel: '升级' });
    });
  });

  /* ---------- 灯录（图鉴） ---------- */
  /* V1.1.3（A10 图鉴两卷）：**灯录页两个标签**（伙伴卷 / 装备卷）——
     卷表在 data.js（`D.CODEX_VOLUMES`，现场枚举、以后加卷不用改这一页）；
     装备卷的格子画的是**名字**（已收集的写名字、没收集的写「？」，颜色跟稀有度无关时用名字色）。 */
  let codexVol = 'chars';
  CV.register('codex', function () {
    const cs = Core.codexState();
    U.begin(); head('灯录');
    /* 两个标签（用与背包同一套按钮语汇，不新增组件） */
    U.btnRow(Core.codexState().volumes.map(function (v) {
      return { label: v.name.replace('伙伴卷','伙伴').replace('装备卷','装备'), style: codexVol === v.id ? 'primary' : 'ghost', id: 'codexvol:' + v.id };
    }));
    U.space(CV.SP[1]);
    /* ================= B 批（2026-10-01）· 卷宗入口 =================
       父亲大人：「卷宗」＝剧情自己的记录本。放这里是因为**灯录就是"灯阁的记录册"**，
       卷宗是它旁边那一本（只记你看过的：世界段落 / Boss / 人物 / 装备）。
       一行按钮，不动本页既有的两卷结构与顺序。 */
    if (G.Story) {
      U.btn(U.ix(), U.y, U.iw(), U.BTN_SM * CV.SCALE, '剧情卷宗', 'ghost', 'story_archive');
      U.y += U.BTN_SM * CV.SCALE;
      U.space(CV.SP[1]);
    }
    const vol = cs.volumes.filter(function (v) { return v.id === codexVol; })[0] || cs.volumes[0];
    U.card(function () {
      U.h3(vol.name, '收集进度 ' + vol.owned + ' / ' + vol.total);
      vol.rewards.forEach(function (r) {
        row2('收集 ' + r.n + ' ' + vol.name, Core.rewardTextOf(r.reward),
          r.claimed ? '已领取' : (r.reached ? '点一下领取' : ('还差 ' + (r.n - vol.owned))),
          r.claimed ? CV.C.dim : (r.reached ? CV.C.gold : CV.C.dim));
        if (r.reached && !r.claimed) CV.hit('codex_claim:' + vol.id + ':' + r.n, U.ix(), U.y - 52 * CV.SCALE, U.iw(), 52 * CV.SCALE);
      });
    });
    if (vol.id === 'equips') {
      /* 装备卷：按**名字表**的天然顺序（世界 → 部位）铺，收集到的写名字、没收集的画「？」 */
      const all = D.codexEquipNameList();
      const have = Core.S.codex.equipNames || [];
      U.card(function () {
        U.h3('装备名册', have.length + ' / ' + all.length);
        const cols = 3, gap = 8 * CV.SCALE;
        const cw = (U.iw() - gap * (cols - 1)) / cols, ch = 46 * CV.SCALE;
        const y0 = U.y;
        all.forEach(function (nm, i) {
          const mine = have.indexOf(nm) >= 0;
          const x = U.ix() + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
          CV.round(x, y, cw, ch, CV.RADIUS_CHIP,  mine ? CV.a(CV.C.panel2, .50) : CV.a(CV.C.shade, .13), mine ? CV.C.line2 : CV.C.line);
          CV.text(CV.fit(mine ? nm : '？', cw - 12 * CV.SCALE, CV.FS.xs), x + cw / 2, y + ch / 2,
            { size: CV.FS.xs, align: 'center', color: mine ? CV.C.text2 : CV.C.dim });
        });
        U.y = y0 + Math.ceil(all.length / cols) * (ch + gap) - gap;
      });
      return;      // 装备卷不画伙伴格子
    }
    /* 按阵营分组、组内从低稀有度到高稀有度（父亲大人定的排序） */
    const order = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
    const byFaction = {};
    D.characters.forEach(function (c) {
      const f = c.faction || '其他';
      (byFaction[f] = byFaction[f] || []).push(c);
    });
    Object.keys(byFaction).forEach(function (f) {
      const list = byFaction[f].slice().sort((a, b) => (order[a.rarity] || 0) - (order[b.rarity] || 0));
      const owned = list.filter((c) => Core.S.chars[c.id]).length;
      U.card(function () {
        U.h3(f, owned + '/' + list.length);
        const cols = 4, gap = 8 * CV.SCALE;
        const cw = (U.iw() - gap * (cols - 1)) / cols;
        const ch = 58 * CV.SCALE;
        const y0 = U.y;
        list.forEach(function (c, i) {
          const mine = !!Core.S.chars[c.id];
          const x = U.ix() + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
          CV.round(x, y, cw, ch, CV.RADIUS_CHIP,  mine ? CV.a(CV.C.panel2, .50) : CV.a(CV.C.shade, .13), mine ? rarColor(c.rarity) : CV.C.line);
          CV.text(mine ? c.name.slice(0, 2) : '？', x + cw / 2, y + 22 * CV.SCALE,
            { size: CV.FS.sm, align: 'center', color: mine ? rarColor(c.rarity) : CV.C.dim });
          CV.text(mine ? c.bloodline : c.rarity, x + cw / 2, y + 42 * CV.SCALE,
            { size: CV.FS.xs, align: 'center', color: CV.C.dim });
          /* V9.6.93（行距尺子查出来的）：未获得的格子原来把稀有度**画了两遍** ——
             一条在 y+12（正好压在「？」上，两行只差 10px 就叠一起了），一条在 y+42。
             删掉 y+12 那条：未获得的格子 = 「？」+ 稀有度两行，和已获得的两行版式一致。 */
        });
        U.y = y0 + Math.ceil(list.length / cols) * (ch + gap) - gap;
      });
    });
  });
  /* 标签切换 + 两卷各自那一串领取入口（卷表驱动，加卷不用改这里） */
  D.CODEX_VOLUMES.forEach(function (v) {
    CV.on('codexvol:' + v.id, function () { codexVol = v.id; CV.render(); });
    v.rewards.forEach(function (r) {
      CV.on('codex_claim:' + v.id + ':' + r.n, function () {
        const res = Core.claimCodexReward(v.id, r.n);
        /* F7 ②：领完那一档当场变灰 / 打勾（看得见 → 删成功）；失败留（"还差 N 个…"）。 */
        if (!res.ok) CV.toast(res.msg || '领不了');
        CV.render();
      });
    });
  });
  /* 老入口（`codex_claim:20` 这种裸数字）——玩家可能正停在旧版本的内存状态上，保留兼容 */
  D.CODEX_REWARDS.forEach(function (r) {
    CV.on('codex_claim:' + r.n, function () {
      const res = Core.claimCodexReward('chars', r.n);
      /* F7 ②：同上（老入口）。 */
      if (!res.ok) CV.toast(res.msg || '领不了');
      CV.render();
    });
  });
})();
