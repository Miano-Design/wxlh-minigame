/* 剩下几条养成线的小页面（照网页版 js/ui.js 逐个复刻）
   ------------------------------------------------------------------------------
   · 灯阁评级 sectModal     · 灯阁权限 authorityModal · 基地建设 buildingsModal
   · 境界渡劫 realmModal    · 铭刻 geneLockModal      · 伴生体 beastModal
   · 转生天赋 reincarnModal · 灯录 codexModal
   文案与数值全部从 Core / DATA 取，界面只管摆位置（和网页版同一份数据源）。
*/
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const CV = G.CV, U = G.U, Core = G.Core, D = G.DATA;
  const fmt = G.fmt || ((n) => String(n));
  const curIcon = (k) => { const m = (D.CURRENCIES || []).find((c) => c.id === k); return m ? m.icon : k; };
  const rarColor = (r) => (D.RARITY_COLOR && D.RARITY_COLOR[r]) || CV.C.text2;
  function head(title) {
    U.btn(U.pad(), U.y, 40 * CV.SCALE, U.BTN_SM * CV.SCALE, '‹', 'ghost', 'page_back');
    CV.text(title, U.pad() + U.cw() / 2, U.y + U.BTN_SM * CV.SCALE / 2, { size: CV.FS.f2, bold: true, align: 'center' });
    U.y += U.BTN_SM * CV.SCALE + CV.SP[2];
  }
  CV.on('page_back', () => CV.pop());
  /* 一行"左标题 / 右小字"（网页版 .list-row 的 t1 + t2 两行） */
  function row2(t1, t2, right, rightColor) {
    const top = U.y, h = t2 ? 52 * CV.SCALE : 34 * CV.SCALE;
    CV.text(CV.fit(t1, U.iw() * 0.62, CV.FS.lg, true), U.ix(), top + (t2 ? 17 : h / 2) * CV.SCALE, { size: CV.FS.lg, bold: true });
    if (t2) CV.text(CV.fit(t2, U.iw() * 0.72, CV.FS.sm), U.ix(), top + 37 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
    if (right) CV.text(CV.fit(right, U.iw() * 0.34, CV.FS.sm), U.ix() + U.iw(), top + (t2 ? 17 : h / 2) * CV.SCALE,
      { size: CV.FS.sm, color: rightColor || CV.C.dim, align: 'right' });
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
      U.kv('通关 普通 / 困难 / 地狱', '+' + st.gain.normal + ' / +' + st.gain.hard + ' / +' + st.gain.hell);
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
    const can = !au.maxed && au.cost &&
      (Core.S.cur.holy || 0) >= au.cost.holy && (Core.S.cur.otherworld || 0) >= au.cost.otherworld;
    U.card(function () {
      U.h3('下一级 · Lv.' + (au.lv + 1), au.nextDesc || '已满级');
      if (au.cost) {
        U.kv('✦ 圣洁晶石', (Core.S.cur.holy || 0) + ' / ' + au.cost.holy, (Core.S.cur.holy || 0) >= au.cost.holy ? CV.C.green : CV.C.dim);
        U.kv('◆ 异界结晶', (Core.S.cur.otherworld || 0) + ' / ' + au.cost.otherworld, (Core.S.cur.otherworld || 0) >= au.cost.otherworld ? CV.C.green : CV.C.dim);
        U.space(CV.SP[1]);
        U.btnRow([{ label: '⚡ 提升灯阁权限', style: 'primary', id: can ? 'auth_up' : '' }]);
      }
    });
    U.card(function () {
      U.h3('权限一览（' + au.max + ' 级）');
      au.rows.forEach(function (a) {
        row2('Lv.' + a.lv, a.desc, a.lv <= au.lv ? '已生效' : '', a.lv <= au.lv ? CV.C.green : CV.C.dim);
      });
    });
  });
  CV.on('auth_up', function () {
    const r = Core.upgradeAuthority();
    CV.toast(r.msg || (r.ok ? '已提升' : '提升不了'));
    CV.render();
  });

  /* ---------- 基地建设 ---------- */
  CV.register('buildings', function () {
    const S = Core.S;
    U.begin(); head('基地建设');
    U.card(function () {
      U.h3('基地建设', '全部消耗 ◈ 点数');
      D.BUILDINGS.forEach(function (b) {
        const lv = S.buildings[b.id] || 0;
        const cost = D.buildingCost(b.id, lv);
        const top = U.y, h = 56 * CV.SCALE;
        const bw = 112 * CV.SCALE;
        const textW = U.iw() - bw - 8 * CV.SCALE;
        CV.text(CV.fit(b.name + '  Lv.' + lv + '/50', textW, CV.FS.lg, true), U.ix(), top + 16 * CV.SCALE, { size: CV.FS.lg, bold: true });
        CV.text(CV.fit(b.desc, textW, CV.FS.sm), U.ix(), top + 36 * CV.SCALE, { size: CV.FS.sm, color: CV.C.dim });
        const can = (S.cur.points || 0) >= cost && lv < 50;
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          lv >= 50 ? '已满级' : ('升级（◈ ' + fmt(cost) + '）'), 'ghost', can ? 'bup:' + b.id : '');
        U.y = top + h;
      });
    });
  });
  D.BUILDINGS.forEach(function (b) {
    CV.on('bup:' + b.id, function () {
      const r = Core.upgradeBuilding(b.id);
      CV.toast(r.msg || (r.ok ? '已升级' : '升级不了'));
      CV.render();
    });
  });

  /* ---------- 境界渡劫 ---------- */
  CV.register('realm', function () {
    const st = Core.realmState();
    U.begin(); head('境界渡劫');
    U.card(function () {
      U.h3(st.curName || '未定血统', '已突破 ' + st.realm + ' / ' + D.REALM_STAGE_COUNT + ' 阶');
      U.kv('当前境界加成', '+' + (Core.realmBonusPct() * 100).toFixed(1) + '%', CV.C.gold);
      if (!st.hasBloodline) { U.note('先去选一条血统（境界线跟着血统走）', 2 * CV.SCALE); return; }
      const nx = st.next;
      if (nx) {
        U.space(CV.SP[1]);
        U.h3('下一阶 · ' + (nx.full || nx.name), '成功率 ' + Math.round(nx.rate * 100) + '%');
        U.kv('等级要求', 'Lv.' + nx.lv + '（当前 Lv.' + Core.S.player.level + '）', Core.S.player.level >= nx.lv ? CV.C.green : CV.C.dim);
        U.kv('渡劫材料', ((D.ITEMS[st.matItem] || {}).name || st.matItem) + ' ' + st.haveMat + ' / ' + st.matN);
        U.kv('点数', '◈ ' + fmt(st.points));
        U.space(CV.SP[1]);
        U.btnRow([{ label: '⚡ 渡劫（成功率 ' + Math.round(nx.rate * 100) + '%）', style: 'primary', id: 'realm_try' }]);
        U.hint('失败也扣材料与点数（等级不掉）', 4 * CV.SCALE);
      } else {
        /* V9.6.90：网页版走到大圆满时是**一张明确的卡**（"已至大圆满 / 当前境界已是这条血统的终点"）。
           小游戏原来这里什么都不画 —— 玩家看到一张空卡，只能猜"是不是卡了"。 */
        U.space(CV.SP[1]);
        U.h3('已至大圆满');
        U.note('当前境界已是这条血统的终点。', 2 * CV.SCALE);
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
    const r = Core.attemptRealm();
    CV.toast(r.msg || (r.success ? '渡劫成功' : '渡劫失败'));
    CV.render();
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
        if (!info.can && info.reqs && info.reqs.length) U.hint('未满足：' + info.reqs.join(' · '), 4 * CV.SCALE);
        U.space(CV.SP[1]);
        U.btnRow([{ label: '突破铭刻', style: 'primary', id: info.can ? 'gl_unlock' : '' }]);
      }
    });
    U.card(function () {
      U.h3('五阶一览');
      D.GENE_LOCKS.forEach(function (g, i) {
        const on = S.player.geneLock >= g.stage;
        row2(g.stage + '阶 · ' + g.name, g.desc, on ? '已解锁' : (i === S.player.geneLock ? '下一个' : ''), on ? CV.C.green : CV.C.dim);
      });
    });
  });
  CV.on('gl_unlock', function () {
    const r = Core.geneLockUnlock();
    CV.toast(r.msg || (r.ok ? '已突破' : '条件未满足'));
    CV.render();
  });

  /* ---------- 伴生体 ---------- */
  CV.register('beast', function () {
    const st = Core.beastState();
    U.begin(); head('伴生体');
    U.card(function () {
      U.h3('伴生体', '我的伴生体（' + st.count + ' / ' + D.BEASTS.length + '）');
      U.note('伴生体是第二条养成线：上阵 1 只，给全队加属性 + 五行克制。孵化花兽魂石，重复获得转兽魂，兽魂用来升阶。兽魂石从副本 Boss（必掉 1~3 颗）和精英怪出。', 2 * CV.SCALE);
      U.space(CV.SP[1]);
      U.kv('当前随行', st.activeBeast ? st.activeBeast.name : '还没有随行伴生体', CV.C.gold);
      U.kv('孵化', '兽魂石 ' + st.eggs + ' 颗 · 每 ' + st.eggCost + ' 颗孵 1 只');
      U.space(CV.SP[1]);
      U.btnRow([
        { label: '孵 1 只（🥚' + st.eggCost + '）', style: 'ghost', id: st.eggs >= st.eggCost ? 'beast_hatch1' : '' },
        { label: '孵 10 只（🥚' + st.eggCost * 10 + '）', style: 'gold', id: st.eggs >= st.eggCost * 10 ? 'beast_hatch10' : '' },
      ]);
    });
    U.card(function () {
      U.h3('我的伴生体', st.count + ' / ' + D.BEASTS.length);
      if (!st.list.length) { U.hint('还没有伴生体，去孵化一只', 4 * CV.SCALE); return; }
      st.list.forEach(function (b) {
        const active = st.active === b.id;
        row2(b.name, (b.elem || '') + ' · ' + (b.desc || ''), active ? '随行中' : '点一下随行', active ? CV.C.green : CV.C.dim);
        CV.hit('beast_on:' + b.id, U.ix(), U.y - 52 * CV.SCALE, U.iw(), 52 * CV.SCALE);
      });
    });
    U.card(function () {
      U.h3('五行相克');
      U.hint('⚔️金 克 🌿木　🌿木 克 ⛰️土　💧水 克 🔥火　🔥火 克 ⚔️金　⛰️土 克 💧水', 2 * CV.SCALE);
      /* V9.6.21 自审：`D.worldElementIcon` 不存在（外面 ? : 兜住了，图标一直是空的）
         正确写法是 ELEMENT_ICON[worldElement(id)]。 */
      U.hint('各世界的属性：' + D.WORLDS.map((w) => w.name.slice(0, 2) + (D.ELEMENT_ICON[D.worldElement(w.id)] || '')).join(' · '), 4 * CV.SCALE);
    });
  });
  CV.on('beast_hatch1', function () {
    const r = Core.hatchBeast(1);
    CV.toast(r.msg || ('孵化 ' + (r.count || 1) + ' 只'));
    CV.render();
  });
  CV.on('beast_hatch10', function () {
    const r = Core.hatchBeast(10);
    CV.toast(r.msg || ('孵化 ' + (r.count || 0) + ' 只'));
    CV.render();
  });
  CV.on('beast_on:*', function (id) {
    const r = Core.setActiveBeast(id);
    CV.toast(r.msg || '已随行');
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
      U.note('会重置：玩家等级（回到 Lv.0）、残域世界进度、深井层数。', 2 * CV.SCALE);
      U.note('会保留：伙伴（含等级与技能）、装备、主角技能与属性、血统、铭刻、天赋、全部货币。', 2 * CV.SCALE);
      U.kv('第 ' + ((S.player.reincarnations || 0) + 1) + ' 次转生条件',
        '玩家Lv.' + S.player.level + '/' + need.lv + ' · 铭刻' + S.player.geneLock + '/' + need.geneLock + ' · 灯芯Lv.' + (S.buildings.core || 0) + '/' + need.core,
        can.ok ? CV.C.green : CV.C.dim);
      if (!can.ok && can.msg) U.hint(can.msg, 4 * CV.SCALE);
      U.space(CV.SP[1]);
      U.btnRow([{ label: '开始转生', style: 'primary', id: can.ok ? 'do_reincarn' : '' }]);
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
        U.btn(U.ix() + U.iw() - bw, top + (h - U.BTN_SM * CV.SCALE) / 2, bw, U.BTN_SM * CV.SCALE,
          cost === undefined ? '已满' : ('升级 ♾' + cost), 'ghost',
          cost !== undefined && (S.cur.rp || 0) >= cost ? 'talent_up:' + br : '');
        U.y = top + h;
      });
    });
  });
  CV.on('do_reincarn', function () {
    U.confirm('转生', '确定转生？等级、残域进度、深井层数会重置，换来永久天赋点（伙伴 / 装备 / 血统 / 铭刻 / 货币都保留）。', function () {
      const r = Core.reincarnate();
      CV.toast(r.msg || '已转生');
      CV.reset('home');
    });
  });
  Object.keys(D.TALENTS || {}).forEach(function (br) {
    CV.on('talent_up:' + br, function () {
      const r = Core.buyTalent(br);
      CV.toast(r.msg || '已升级');
      CV.render();
    });
  });

  /* ---------- 灯录（图鉴） ---------- */
  CV.register('codex', function () {
    const cs = Core.codexState();
    U.begin(); head('灯录');
    U.card(function () {
      U.h3('灯录', '收集进度 ' + cs.owned + ' / ' + cs.total);
      cs.rewards.forEach(function (r) {
        row2('收集 ' + r.n + ' 名伙伴', Core.rewardTextOf(r.reward),
          r.claimed ? '已领取' : (r.reached ? '点一下领取' : ('还差 ' + (r.n - cs.owned))),
          r.claimed ? CV.C.dim : (r.reached ? CV.C.gold : CV.C.dim));
        if (r.reached && !r.claimed) CV.hit('codex_claim:' + r.n, U.ix(), U.y - 52 * CV.SCALE, U.iw(), 52 * CV.SCALE);
      });
    });
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
          CV.round(x, y, cw, ch, 6 * CV.SCALE, mine ? CV.C.panel2 : 'rgba(0,0,0,.13)', mine ? rarColor(c.rarity) : CV.C.line);
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
  D.CODEX_REWARDS.forEach(function (r) {
    CV.on('codex_claim:' + r.n, function () {
      const res = Core.claimCodexReward(r.n);
      CV.toast(res.msg || '已领取');
      CV.render();
    });
  });
})();
