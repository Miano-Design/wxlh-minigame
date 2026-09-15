/* 《残域》UI 层 */
window.UI = (function () {
  const D = window.DATA;
  const C = () => window.Core;
  const $view = () => document.getElementById('view');
  /* 版本号只有这一处：设置页显示它、GM 门禁提示也用它（改版本号时和 index.html/sw.js 一起改，见 scripts/test_ui.js） */
  const GAME_VER = '9.5.10';
  /* GM 面板是内部工具，但它跟着正式包一起上线了（线上连点 7 次就能开，还能刷货币并导出存档）。
     线上要求 URL 带 ?gm=1 才认，本地开发照旧直接开（V9.5）。 */
  function gmAllowed() {
    const loc = (typeof location !== 'undefined' && location) || null;
    if (!loc) return true;
    const h = loc.hostname || '';
    if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    return /(^|[?&])gm=1(&|$)/.test(loc.search || '');
  }

  /* ================= 工具 ================= */
  function fmt(n) {
    n = Math.floor(n || 0);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return String(n);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
  function stars(n, max) { return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(Math.max(0, (max || 6) - n)) + '</span>'; }
  function rarityTag(r) { return `<span class="rtext-${r}" style="font-weight:700">${r}</span>`; }
  function cname(id) { return C().charName(id); }
  function charAvatar(id, size) {
    if (id === '@player') {
      const nm = cname(id);
      return `<div class="avatar" style="border-color:var(--gold);color:var(--gold);${size ? `width:${size}px;height:${size}px;font-size:${size * 0.44}px;` : ''}">${esc(nm[0])}</div>`;
    }
    const ch = D.charById[id];
    const nm = cname(id);
    return `<div class="avatar" style="border-color:${D.RARITY_COLOR[ch.rarity]};color:${D.RARITY_COLOR[ch.rarity]};${size ? `width:${size}px;height:${size}px;font-size:${size * 0.44}px;` : ''}">${esc(nm[0])}</div>`;
  }
  function curIcon(id) { const c = D.CURRENCIES.find(x => x.id === id); return c ? `<span style="color:${c.color}">${c.icon}</span>` : ''; }
  function curName(id) { const c = D.CURRENCIES.find(x => x.id === id); return c ? c.name : id; }
  // 奖励文案统一出口：货币走 curIcon，item 显示道具名。
  // 和 core.applyRewardObj 一一对应——凡是能发出来的奖励，界面都拼得出来，不会出现"发了但看不见"。
  function rewardText(o) {
    const parts = Object.entries(o || {}).filter(([, v]) => v !== 0 && v !== null && v !== undefined)
      .map(([k, v]) => (k === 'item'
        ? [].concat(v).map(id => `🎁${(D.ITEMS[id] || {}).name || id}`).join(' ')
        : `${curIcon(k)}${fmt(v)}`));
    return parts.length ? parts.join(' · ') : '—';
  }

  // 属性一屏：照参考产品的「【标签】值」纯文字行来做——一行一件事，右对齐，扫一眼看完。
  // 角色面板与主角面板共用，保证两边显示口径完全一致。
  /* 属性数值面板：两列一屏列全（装备 / 血统 / 境界 / 铭刻都已经算进来）。
     角色卡与主角卡共用同一个出口，保证两处显示的数值口径完全一致。 */
  function statGrid(st, foot) {
    if (!st) return '';
    const pc = v => Math.round((v || 0) * 100) + '%';
    const red = Math.min(0.6, (st.resPct || 0) + (st.dmgReduce || 0));
    const rows = [
      ['攻击', fmt(st.atk)],
      ['防御', fmt(st.def)],
      ['生命', fmt(st.hp)],
      ['速度', fmt(st.spd)],
      ['暴击', pc(st.crit)],
      ['暴击伤害', '×' + (st.critDmg || 2).toFixed(2)],
      ['闪避', pc(st.eva)],
      ['吸血', pc(st.lifesteal)],
      ['减伤', pc(red)],
      ['技能加成', '+' + Math.round(((st.skillMult || 1) - 1) * 100) + '%'],
    ];
    return `<div class="stat-grid">${rows.map(([k, v]) =>
      `<div class="srow"><span class="rk">${k}</span><b>${v}</b></div>`).join('')}</div>`
      + (foot ? `<div class="hint mt2">${foot}</div>` : '');
  }
  // 六维只读面板（招募角色用：他们的六维是固定成长，不需要加点）
  function attrGrid(attrs) {
    return `<div class="stat-grid">${D.ATTR_META.map(a => {
      const v = Math.round((attrs && attrs[a.id]) || 0);
      return `<div class="srow"><span class="rk">${a.name}</span><b>${v}</b></div>`;
    }).join('')}</div>`;
  }
  /* 装备卡：主角与招募角色共用（只有数据属性名不一样），6 个槽用方块呈现。
     点方块＝换装；方块右上角「卸下」＝脱掉（stopPropagation 写在外面的事件绑定里）。 */
  function equipCard(ownerId, slots, kind) {
    const S = C().S;
    const eq = S.equipped[ownerId] || {};
    const slotAttr = kind === 'player' ? 'data-peqslot' : 'data-eqslot';
    const unAttr = kind === 'player' ? 'data-punequip' : 'data-unequip';
    const tiles = slots.map(slot => {
      const e = eq[slot] && S.equips[eq[slot]];
      const brief = e ? equipBrief(e) : '';
      return `<div class="eq-tile${e ? '' : ' off'}" ${slotAttr}="${slot}">
        <div class="eq-slot">${D.EQUIP_SLOTS[slot]}</div>
        ${e
          ? `<button class="eq-un" ${unAttr}="${slot}">卸下</button>
             <div class="eq-name rtext-${e.rarity}">${e.name}</div>
             <div class="eq-brief">+${e.enhance}${brief ? ' · ' + brief : ''}</div>`
          : `<div class="eq-none">未装备</div>`}
      </div>`;
    }).join('');
    const filled = slots.filter(s => eq[s]).length;
    return `<div class="card">
      <h3>🗡 装备 <span class="sub">${filled}/${slots.length} 件</span></h3>
      <div class="eq-grid">${tiles}</div>
    </div>`;
  }

  function toast(msg, ms) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms || 1800);
  }

  /* ================= 音效（纯合成，不依赖任何音频素材） ================= */
  let actx = null;
  function sfxEnabled() { const S = C().S; return !S || S.settings.sfx !== false; }
  function sfx(kind) {
    if (!sfxEnabled()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === 'suspended' && actx.resume) actx.resume();
      const t0 = actx.currentTime;
      const note = (f, start, dur, g, type) => {
        const o = actx.createOscillator(), gn = actx.createGain();
        o.type = type || 'triangle';
        o.frequency.value = f;
        gn.gain.setValueAtTime(0.0001, t0 + start);
        gn.gain.linearRampToValueAtTime(g, t0 + start + 0.012);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(gn); gn.connect(actx.destination);
        o.start(t0 + start); o.stop(t0 + start + dur + 0.03);
      };
      if (kind === 'click') note(430, 0, 0.05, 0.04, 'square');
      else if (kind === 'success') { note(660, 0, 0.12, 0.06); note(990, 0.09, 0.18, 0.05); }
      else if (kind === 'fail') { note(300, 0, 0.12, 0.05, 'sawtooth'); note(180, 0.1, 0.2, 0.045, 'sawtooth'); }
      else if (kind === 'coin') { note(880, 0, 0.07, 0.045); note(1320, 0.06, 0.12, 0.04); }
      else if (kind === 'level') { [523, 659, 784, 1046].forEach((f, i) => note(f, i * 0.07, 0.18, 0.05)); }
      else if (kind === 'battle') { note(150, 0, 0.22, 0.05, 'sawtooth'); note(240, 0.08, 0.18, 0.035, 'square'); }
      else if (kind === 'win') { [523, 659, 784, 1046].forEach((f, i) => note(f, i * 0.1, 0.24, 0.05)); }
      else if (kind === 'lose') { [392, 349, 294, 220].forEach((f, i) => note(f, i * 0.12, 0.3, 0.045, 'sine')); }
      else if (kind === 'box') { note(700, 0, 0.06, 0.045); note(1050, 0.05, 0.1, 0.045); note(1400, 0.12, 0.14, 0.04); }
    } catch (e) { /* 浏览器不支持音频时静默跳过 */ }
  }

  /* ================= 全局交互规则（四条，所有页面统一） ================= */
  // 1) 失败回执：提示 + 失败音 + 按钮抖一下（只弹一句话不够"疼"）
  function shakeEl(el) {
    if (!el || !el.classList) return;
    el.classList.remove('shake');
    try { void el.offsetWidth; } catch (e) { /* 桩环境没有布局 */ }
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 280);
  }
  function failToast(msg, el) { toast(msg); sfx('fail'); shakeEl(el); }

  // 2) 数值跳动：货币一变就在顶栏对应位置冒一个 ±数字（600ms 淡出）。
  // 由 Core.setCurListener 广播驱动，所以"任何来源的收支"都有反馈，不用在每个按钮上重复写。
  function pulseCur(id, delta) {
    const bar = document.getElementById('curbar');
    if (!bar || !bar.querySelector || !bar.appendChild) return;
    const chip = bar.querySelector('[data-cur="' + id + '"]');
    if (!chip || !chip.appendChild) return;
    const f = document.createElement('span');
    f.className = 'float-cur ' + (delta > 0 ? 'up' : 'down');
    f.textContent = (delta > 0 ? '+' : '') + fmt(delta);
    chip.appendChild(f);
    chip.classList.add(delta > 0 ? 'cur-up' : 'cur-down');
    setTimeout(() => { f.remove(); chip.classList.remove('cur-up', 'cur-down'); }, 600);
  }

  // 3) 防连点：同一个小按钮 300ms 内只吃一次点击（连点会重复扣资源的那种）
  const GUARD_SEL = 'button, .nav-item, .pill, [data-act], [data-stage], [data-world],'
    + ' [data-char], [data-item], [data-pick], [data-target], [data-serumtarget], [data-eq], [data-eqd],'
    + ' [data-buy], [data-refine], [data-pull1], [data-pull10], [data-free], [data-sstage], [data-stimes], [data-potion],'
    + ' [data-attr], [data-lvup], [data-roster], [data-cur], [data-claim], [data-mclaim], [data-ach], [data-codex]';
  function installClickGuard() {
    if (!document.addEventListener) return;
    const last = new WeakMap();
    document.addEventListener('click', ev => {
      const el = ev.target && ev.target.closest ? ev.target.closest(GUARD_SEL) : null;
      if (!el) return;
      const now = Date.now();
      const prev = last.get(el);
      if (prev && now - prev < 300) { ev.stopPropagation(); ev.preventDefault(); return; }
      last.set(el, now);
    }, true);
  }

  // 4) 大额消费二次确认：单笔任一币种 ≥1000 就先报一次账（带数字），可在设置里关掉。
  // 目的不是拦人，是治"不知道自己花的是什么"——确认框里直接把货币名和余额摆出来。
  function confirmSpend(cost, title, text, onOk) {
    const S = C().S;
    const big = Object.values(cost).some(v => v >= 1000);
    if (!big || S.settings.confirmBig === false) { onOk(); return; }
    const detail = Object.entries(cost).map(([k, v]) => `${curIcon(k)}${fmt(v)} ${curName(k)}`).join(' + ');
    const mine = Object.keys(cost).map(k => `${curIcon(k)}${fmt(S.cur[k] || 0)}`).join(' · ');
    confirmBox(title, `<div style="margin-bottom:6px">将花费 <b style="color:var(--gold)">${detail}</b></div>
      <div style="font-size:12px">当前持有：${mine}</div>
      ${text ? `<div style="font-size:12px;margin-top:6px">${text}</div>` : ''}
      <div style="font-size:11px;color:var(--dim);margin-top:10px">设置存档 → 大额消费二次确认，可以关掉这个提示。</div>`, onOk);
  }

  /* ================= 返回键接管（手机手势/返回键先退面板、再退页面） ================= */
  // 做法：在历史里放一条"哨兵"记录。按返回时先被哨兵挡住 → 关掉最上面的弹窗/子页面 → 再补一条哨兵。
  // 什么都不用关的时候不再补哨兵，下一次返回就是真正退出游戏。
  // 注意：绝不能在关闭弹窗时自己调用 history.back()（会和用户按返回的动作互相打断，直接把页面顶出去）。
  let guardArmed = false;
  function armGuard() {
    guardArmed = false;
    try { history.pushState({ wxlh: 1 }, ''); guardArmed = true; } catch (e) { guardArmed = false; }
  }
  function onPopState() {
    const wasArmed = guardArmed;
    guardArmed = false;
    const overlay = document.getElementById('battle-overlay');
    if (overlay) {
      const skip = overlay.querySelector('[data-skip]');
      if (skip) skip.click();
      armGuard();
      return;
    }
    if (modalStack.length) {
      const w = modalStack[modalStack.length - 1];
      modalStack = modalStack.filter(x => x !== w);
      w.remove();
      if (w._onClose) w._onClose();
      armGuard();
      return;
    }
    if (curTab === 'dungeon' && dungeonView.page === 'run') {
      dungeonView = { page: 'world', worldId: (run && run.worldId) || 'W01', diff: (run && run.diff) || 'normal' };
      render();
      armGuard();
      return;
    }
    if (curTab === 'dungeon' && dungeonView.page !== 'worlds') { dungeonView = { page: 'worlds' }; render(); armGuard(); return; }
    if (curTab !== 'home') { setTab('home'); armGuard(); return; }
    // 已在首页：哨兵已被吃掉且不再补，下一次返回就是退出游戏
  }

  /* ================= 弹窗 ================= */
 let modalStack = [];
  // 每画一次面板 +1。用来判断"这一层到底有没有被收掉"：
  // 返回按钮的回调要么把同一个面板重画一层（updateModal）、要么关掉它；
  // 两样都没做，就说明回调漏了收尾——见 lootPanel 的兜底。
  let modalDrawSeq = 0;
  /* 图标一律用矢量（SVG）画，**不用字符、也不用多根 CSS 线拼**：
     字符会因字体不同而偏；CSS 拼的线在奇数尺寸 / 非整数像素比（手机常见 2.6x、3x）下，
     两条线会各自落在半个像素上，看起来就是"叉歪了"。
     SVG 的坐标是对称的（两个图形都以 12,12 为中心），任何机型任何缩放都在正中。 */
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7 17 17M17 7 7 17"/></svg>';
  const ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5 8.5 12l7 7"/></svg>';
  function modal(title, bodyHtml, opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    // V7.3：系统面板一律做成**独立整页**（左上角返回），只有确认/提示框还是居中弹窗。
    // 这是对标产品最明显的一条界面结构：二级内容各占一页，而不是从底部顶上来一叠抽屉。
    const isPage = !opts.center;
    wrap.innerHTML = isPage
      ? `<div class="page">
          <div class="page-head"><button class="back-x" aria-label="返回">${ICON_BACK}</button><h3>${title}</h3><span class="page-pad"></span></div>
          <div class="sheet-body">${bodyHtml}</div>
        </div>`
      : `<div class="modal-mask"></div>
        <div class="sheet center ${opts.sticky ? 'sticky' : ''}">
          <div class="sheet-head"><h3>${title}</h3><button class="close-x" aria-label="关闭">${ICON_CLOSE}</button></div>
          <div class="sheet-body">${bodyHtml}</div>
        </div>`;
    root.appendChild(wrap);
    modalStack.push(wrap);
    wrap._drawSeq = ++modalDrawSeq;
    wrap._onClose = opts.onClose || null;
    if (isPage) {
      wrap.querySelector('.back-x').onclick = () => closeModal(wrap);
      // 整页也支持安卓/浏览器的返回键：交给 closeModal 统一处理（见 main.js 的 popstate）
    } else {
      wrap.querySelector('.close-x').onclick = () => closeModal(wrap);
      wrap.querySelector('.modal-mask').onclick = () => { if (!opts.sticky) closeModal(wrap); };
    }
    return wrap;
  }
  function closeModal(wrap) {
    wrap = wrap || modalStack[modalStack.length - 1];
    if (!wrap) return;
    modalStack = modalStack.filter(w => w !== wrap);
    wrap.remove();
    if (wrap._onClose) wrap._onClose();
  }
  function closeAllModals() { modalStack.forEach(w => w.remove()); modalStack = []; }
  // 重开弹窗时保持滚动位置（加点/穿装备等连续操作不跳顶）
  function modalScroll(w) { const sb = w.querySelector('.sheet-body'); return sb ? sb.scrollTop : 0; }
  function restoreModalScroll(w, st) { if (st) { const sb = w.querySelector('.sheet-body'); if (sb) sb.scrollTop = st; } }
  // 原地刷新弹窗内容：不重建遮罩与面板，避免闪屏，保留滚动位置
  // 所有"操作后重新打开同一个弹窗"的地方都必须走这里，禁止 closeModal + 重新 modal()
  function updateModal(w, title, bodyHtml, keepScroll) {
    const sb = w.querySelector('.sheet-body');
    const st = keepScroll === false ? 0 : (sb ? sb.scrollTop : 0);
    // 标题在两种形态下位置不同：整页在 .page-head，居中弹窗在 .sheet-head
    if (title !== undefined) {
      const th = w.querySelector('.page-head h3') || w.querySelector('.sheet-head h3');
      if (th) th.textContent = title;
    }
    if (sb) { sb.innerHTML = bodyHtml; sb.scrollTop = st; }
    w._drawSeq = ++modalDrawSeq;
    return w;
  }
  // 有 wrap 就原地刷新，没有就新建弹窗；返回弹窗元素
  function showPanel(wrap, title, bodyHtml, keepScroll) {
    if (wrap) return updateModal(wrap, title, bodyHtml, keepScroll);
    return modal(title, bodyHtml);
  }
  function confirmBox(title, text, onOk) {
    const w = modal(title, `
      <div style="color:var(--dim);font-size:13px;line-height:1.7;margin-bottom:14px">${text}</div>
      <div class="btn-row"><button class="btn ghost" data-x>取消</button><button class="btn primary" data-ok>确定</button></div>
    `, { center: true });
    w.querySelector('[data-x]').onclick = () => closeModal(w);
    w.querySelector('[data-ok]').onclick = () => { closeModal(w); onOk(); };
  }

  /* ================= 货币图鉴 / 玩法指南 ================= */
  function currencyModal(focusId, wrap, backFn) {
    const S = C().S;
    const body = `
      <div style="font-size:12px;color:var(--dim);line-height:1.7;margin-bottom:10px">
        每种货币只干一件事。拿不准该花哪个，就看下面这张表——「用途」写的是它能买什么，「来源」写的是去哪刷。
      </div>
      ${D.CURRENCIES.map(c => {
        const info = D.CURRENCY_INFO[c.id] || {};
        return `<div class="card" id="cur-${c.id}" style="margin-bottom:8px;${focusId === c.id ? 'border-color:' + c.color : ''}">
          <h3><span style="color:${c.color}">${c.icon}</span> ${c.name}
            <span class="sub">持有 ${fmt(S.cur[c.id] || 0)}</span></h3>
          <div style="font-size:12px;line-height:1.75"><b style="color:var(--gold)">用途</b>：${info.use || '—'}</div>
          <div style="font-size:12px;line-height:1.75;color:var(--dim)"><b>来源</b>：${info.gain || '—'}</div>
        </div>`;
      }).join('')}`;
    const w = showPanel(wrap, '货币图鉴', body + `<button class="btn ghost block mt1" data-back>‹ 返回</button>`);
    w.querySelector('[data-back]').onclick = () => { if (backFn) backFn(w); else closeModal(w); };
    if (focusId) {
      const el = w.querySelector('#cur-' + focusId);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    }
    return w;
  }
  function guideModal(chapterId, wrap) {
    // 指南正文里用 **加粗** 标注重点（数据表里写的就是这个约定），这里统一翻成 <b> 再上屏，
    // 免得玩家看到一堆星号。
    const md = s => String(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const body = D.GUIDE_CHAPTERS.map(ch => `
      <div class="card" id="guide-${ch.id}" style="margin-bottom:8px">
        <h3>${ch.title}</h3>
        ${ch.body.map(line => `<div style="font-size:12px;line-height:1.85;color:var(--text)">· ${md(line)}</div>`).join('')}
      </div>`).join('')
      + `<div class="card" style="background:var(--panel2)"><h3>📖 看不懂就点这里</h3>
        <div class="note">任何一屏里有「?」或小字说明的地方，都可以点开看解释；货币、道具也都能点开看用途。</div>
        <button class="btn small block mt2" data-curdoc>▤ 打开货币图鉴</button></div>`;
    const w = showPanel(wrap, '玩法指南', body);
    w.querySelector('[data-curdoc]').onclick = () => currencyModal(null, w, w2 => guideModal(null, w2));
    if (chapterId) {
      const el = w.querySelector('#guide-' + chapterId);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80);
    }
    return w;
  }
  // 角色图鉴：收集进度 + 里程碑奖励 + 全角色一览
  function codexModal(wrap) {
    const S = C().S;
    const cs = C().codexState();
    const body = `
      <div class="card mb3">
        <h3>收集进度 <span class="sub">${cs.owned} / ${cs.total}</span></h3>
        <div class="bar exp" style="margin:6px 0 10px"><i style="width:${Math.min(100, cs.owned / cs.total * 100)}%"></i></div>
        ${cs.rewards.map(r => `<div class="list-row" style="${r.claimed ? 'opacity:.5' : ''}">
          <div class="grow"><div class="t1">收集 ${r.n} 名伙伴</div>
          <div class="t2">${rewardText(r.reward)}</div></div>
          ${r.claimed ? '<button class="btn small" disabled>已领</button>'
            : r.reached ? `<button class="btn small primary" data-codex="${r.n}">领取</button>`
            : `<button class="btn small" disabled>还差 ${r.n - cs.owned}</button>`}
        </div>`).join('')}
      </div>
      <div class="section-title">全部伙伴（${cs.total}）</div>
      <div class="char-grid">
        ${D.characters.map(ch => {
          const got = S.codex.chars.includes(ch.id);
          if (!got) return `<div class="char-card" style="opacity:.35;filter:grayscale(1)">
            <div class="avatar">？</div><div class="cname">未获得</div><div class="cmeta">${ch.rarity}</div>
          </div>`;
          return `<div class="char-card rarity-${ch.rarity}">
            ${charAvatar(ch.id)}
            <div class="cname">${esc(ch.name)}</div>
            <div class="cmeta">${ch.role} · ${ch.faction}</div>
          </div>`;
        }).join('')}
      </div>`;
    const w = showPanel(wrap, '伙伴图鉴', body);
    w.querySelectorAll('[data-codex]').forEach(b => b.onclick = () => {
      const r = C().claimCodexReward(+b.dataset.codex);
      toast(r.msg);
      codexModal(w); renderTopbar();
    });
    return w;
  }

  /* ================= 顶栏 / 导航 ================= */
  // 底部 4 格：灯阁 / 残域 / 执灯者 / 背包。
  // V9.2：「执灯者」页只放"人"（队伍 / 伙伴 / 成长），"物"（装备）挪进「背包」，
  // 背包自己再分 道具 / 材料 / 装备 三栏，道具与装备各占各的格子、各自扩容。
  const TABS = [
    { id: 'home', name: '灯阁' },
    { id: 'dungeon', name: '残域' },
    { id: 'roster', name: '执灯者' },
    { id: 'bag', name: '背包' },
  ];
  const ROSTER_TABS = [
    { id: 'party', name: '队伍' },
    { id: 'chars', name: '伙伴' },
    { id: 'grow', name: '成长' },
  ];
  const BAG_TABS = [
    { id: 'item', name: '道具' },
    { id: 'mat', name: '材料' },
    { id: 'equip', name: '装备' },
  ];
  // 旧页签名当子页处理（任务"前往"、每日跳转、引导高亮都靠这张表，不用改各处调用）
  const TAB_ALIAS = { party: 'roster', chars: 'roster', equip: 'bag' };
  let curTab = 'home';
  let rosterView = 'party';
  let bagView = 'item';
  const rosterScroll = {};   // 三个子页各自记住滚动位置，来回切不丢
  let pendingScroll = null;  // 渲染完要恢复到的位置（切子页用）
  function renderTopbar() {
    const S = C().S;
    document.getElementById('tb-name').textContent = S.player.name;
    document.getElementById('tb-lv').textContent = 'Lv.' + S.player.level;
    document.getElementById('tb-gene').textContent = S.player.geneLock > 0 ? `铭刻·${D.GENE_LOCKS[S.player.geneLock - 1].name}` : '';
    const bar = document.getElementById('curbar');
    const main = D.CURRENCIES.filter(c => ['points', 'holy', 'otherworld'].includes(c.id));
    // 只保留三种主力货币 + 一个入口；其余货币在图鉴里看（顶栏放太多会盖过正文）
    // 注意：**不写 title**——手机上没法悬停，写了等于没有；点一下直接开货币图鉴看用途。
    bar.innerHTML = main.map(c => `<button class="cur-chip" data-cur="${c.id}" aria-label="${c.name}：查看用途与来源"><span style="color:${c.color}">${c.icon}</span><b>${fmt(S.cur[c.id])}</b></button>`).join('')
      + `<button class="cur-chip more" data-cur="__all" aria-label="全部货币">▤ 全部货币</button>`;
    bar.querySelectorAll('[data-cur]').forEach(el => {
      el.onclick = () => currencyModal(el.dataset.cur === '__all' ? null : el.dataset.cur);
    });
    syncTopbarHeight();
  }
  /* 顶栏高度用 JS 量出来交给 CSS：不同机型的系统字号 / 刘海高度不一样，
     原来正文上边距写死 92px，遇到"系统字号调大"的机就会钻到顶栏底下。 */
  function syncTopbarHeight() {
    const root = (typeof document !== 'undefined' && document.documentElement) || null;
    const tb = document.getElementById ? document.getElementById('topbar') : null;
    if (!tb || !tb.getBoundingClientRect || !root || !root.style || !root.style.setProperty) return;
    const h = tb.getBoundingClientRect().height;
    if (h > 0) root.style.setProperty('--topbar-h', Math.round(h) + 'px');
  }
  function renderNavbar() {
    const nav = document.getElementById('navbar');
    nav.innerHTML = TABS.map(t => {
      let dot = false;
      if (t.id === 'home') dot = idleClaimable();
      else if (t.id === 'roster') dot = C().isUnlocked('recruit') && C().freeRecruitAvailable();
      return `<div class="nav-item ${curTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.name}${dot ? '<span class="dot"></span>' : ''}</div>`;
    }).join('');
    nav.querySelectorAll('.nav-item').forEach(el => { el.onclick = () => setTab(el.dataset.tab); });
  }
  function idleClaimable() {
    const g = C().idleBankGains();
    return g.seconds >= 300;
  }

  /* ================= 新手高亮引导 ================= */
  function coachmark(selector, text) {
    setTimeout(() => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => {
        const old = document.querySelector('.coach-overlay');
        if (old) old.remove();
        const r = el.getBoundingClientRect();
        const ov = document.createElement('div');
        ov.className = 'coach-overlay';
        const tipTop = r.bottom + 150 > innerHeight ? r.top - 130 : r.bottom + 14;
        ov.innerHTML = `
          <div class="coach-box" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
          <div class="coach-tip" style="left:${Math.max(12, Math.min(r.left, innerWidth - 292))}px;top:${Math.max(12, tipTop)}px">
            <div style="font-size:13px;line-height:1.6">${text}</div>
            <button class="btn small primary mt3">知道了</button>
          </div>`;
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
      }, 420);
    }, 280);
  }
  function refresh() { renderTopbar(); renderNavbar(); }
  function setTab(id) {
    // 旧页签名（party / chars 归「执灯者」，equip 归「背包」）顺手把子页切过去
    const sub = (id === 'party' || id === 'chars' || id === 'equip') ? id : null;
    curTab = TAB_ALIAS[id] || id;
    if (sub === 'equip') bagView = 'equip';
    else if (sub) rosterView = sub;
    dungeonView = { page: 'worlds' };
    batchMode = false; batchSel.clear();
    cancelGrab(true);                     // 换页时清掉"抓起"状态与拖动监听，别把上次的高亮带过去
    screenEnter = true;
    pendingScroll = null;
    refresh();
    render();
  }
  let screenEnter = false;
  function render() {
    const fn = { home: homeScreen, dungeon: dungeonScreen, roster: rosterScreen, bag: bagScreen }[curTab];
    // 切页签回到顶部；同一页内的操作保留滚动位置，避免"点一下跳回顶部"
    const keepScroll = !screenEnter && pendingScroll === null;
    const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
    $view().innerHTML = `<div class="screen${screenEnter ? ' enter' : ''}">${fn()}</div>`;
    screenEnter = false;
    // 副本探索中隐藏底部导航，防止误触丢失进度
    const inRun = curTab === 'dungeon' && dungeonView.page === 'run';
    document.getElementById('navbar').style.display = inRun ? 'none' : '';
    bindScreen();
    refresh();
    if (pendingScroll !== null) {
      const y = pendingScroll; pendingScroll = null;
      if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, y);
    } else if (keepScroll && scrollY > 0 && typeof window.scrollTo === 'function') window.scrollTo(0, scrollY);
  }
  // 「执灯者」= 队伍编成 / 伙伴图鉴 / 成长线，子页共用一条顶部胶囊
  function rosterScreen() {
    const sub = { party: partyScreen, chars: charsScreen, grow: growScreen }[rosterView] || partyScreen;
    return `<div class="tab-cards">
        ${ROSTER_TABS.map(t => `<div class="tab-card ${rosterView === t.id ? 'active' : ''}" data-roster="${t.id}">${t.name}</div>`).join('')}
      </div>
      ${sub()}`;
  }

  // 「成长」子页：把六条养成线集中在这里（原来全摊在首页）。
  // 每条都给一行"现在到哪了"，点进去才是完整面板——二级信息不占主界面。
  function growScreen() {
    const S = C().S;
    const r = C().realmState();
    const au = C().authorityInfo();
    const gl = D.GENE_LOCKS[S.player.geneLock - 1];
    const beasts = Object.keys(S.beast.owned || {}).length;
    const bLv = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const rows = [
      { act: 'open-buildings', unlock: 'buildings', ico: '🏗', name: '基地建设',
        cur: `五栋合计 Lv.${bLv}`, desc: '花 ◈点数，永久提升挂机产出 / 经验 / 离线上限 / 强化折扣' },
      { act: 'open-authority', unlock: 'buildings', ico: '🔑', name: '灯阁权限',
        cur: `Lv.${au.lv} / ${au.max}`, desc: '花 ✦圣洁晶石 + ◆异界结晶，永久提升挂机产出、离线效率、每日扫荡次数' },
      { act: 'open-sect', unlock: null, ico: '🏯', name: '灯阁评级',
        cur: `Lv.${C().sectInfo().lv} / ${D.SECT_MAX}`, desc: '打关卡自动涨的全局评级，每级全队全属性 +0.5%，不用手动点' },
      { act: 'open-keji', unlock: null, ico: '📜', name: '秘术阁',
        cur: `已修 ${D.KEJI.reduce((s, k) => s + C().kejiLv(k.id), 0)} 级`,
        desc: `${D.KEJI.length} 条百分比长线（战斗 + 挂机经济），花 ◆异界结晶，点一下立刻生效` },
      { act: 'open-fabao', unlock: null, ico: '🔮', name: '法宝',
        cur: `已得 ${C().fabaoState().own.length} / ${D.FABAO.length} 件`,
        desc: '装备给数值、法宝给效果（吸血 / 开场能量 / 减伤），主角同时带 1 件，花 ◆异界结晶买' },
      { act: 'open-garden', unlock: null, ico: '🌱', name: '药园',
        cur: `${C().gardenState().filter(p => p.plot).length} / ${D.GARDEN_PLOTS} 块在用`,
        desc: '花 ◈点数种灵田，到点收强化材料，另有几率出稀有物；离线也计时' },
      { act: 'open-arena', unlock: null, ico: '🥋', name: '斗法台',
        cur: `第 ${C().arenaState().floor} 台 · 剩 ${C().arenaState().left} 次`,
        desc: `每天 ${D.ARENA_DAILY} 次镜像擂台，守擂者按你的战力换算，赢一场升一台拿结晶与徽记` },
      { act: 'open-mount', unlock: null, ico: '🐎', name: '坐骑',
        cur: `已驯服 ${C().mountState().own.length} / ${D.MOUNTS.length} 匹`,
        desc: '花 ◈点数 + 材料驯服，全队（含伙伴）永久加数值；同时只骑 1 匹，随时换' },
      { act: 'open-sign', unlock: null, ico: '🎋', name: '求签',
        cur: C().signState().canDraw ? '今日还没求签' : `今日【${C().signState().tier}】`,
        desc: '每天免费摇一签，签文给当天的挂机加成 + 一笔硬通货，隔天自动失效' },
      { act: 'open-realm', unlock: null, ico: '🌌', name: '境界渡劫',
        cur: r.hasBloodline ? `${r.curName}（第 ${r.realm}/${D.REALM_STAGE_COUNT} 阶）` : '未定血统',
        desc: '36 小阶，每阶全属性永久 +1.4%；失败只扣材料，等级不掉' },
      { act: 'open-genelock', unlock: 'geneLock', ico: '🧬', name: '铭刻',
        cur: S.player.geneLock > 0 ? `${S.player.geneLock} 阶 · ${gl.name}` : '未解锁',
        desc: '五阶全队加成，靠通关进度 + 玩家等级 + 血统结晶解锁' },
      { act: 'open-beast', unlock: 'beast', ico: '🐾', name: '伴生体',
        cur: beasts ? `已孵化 ${beasts} 只` : '还没孵化', desc: '第二条养成线：随行 1 只给全队加成，带对五行进本全队伤害 +15%' },
      { act: 'open-reincarn', unlock: 'reincarn', ico: '♾', name: '转生天赋',
        cur: `${S.player.reincarnations} 世`, desc: '重置等级与世界，换永久天赋点；四支天赋树越点越强' },
    ];
    return `
      ${rows.map(x => {
      const ok = !x.unlock || C().isUnlocked(x.unlock);
      return `<div class="grow-row card plain${ok ? ' tap' : ''}" ${ok ? `data-act="${x.act}"` : `data-locked="${x.unlock}"`}>
        <span class="gr-ico">${ok ? x.ico : '🔒'}</span>
        <div class="gr-grow">
          <div class="gr-t1">${x.name}</div>
          <div class="gr-t2">${ok ? x.desc : C().unlockTip(x.unlock)}</div>
        </div>
        <div class="gr-cur">${ok ? x.cur : '未解锁'}</div>
      </div>`;
    }).join('')}`;
  }

  /* ================= 灯阁 ================= */
  /* 游历奇遇条（对标参考产品的游历事件）：挂满一段时间会亮起来，
     没有待领的奇遇时显示进度，有的时候就变成一条"点一下领走"的金条。
     它就是「游历奇遇」这一项**唯一**的入口——宫格里不再重复放第二个。 */
  function travelStrip() {
    const prog = C().travelProgress();
    const pend = C().pendingTravel();
    const left = Math.max(0, Math.round(prog.every - prog.sec));
    return `<div class="card text-rows" style="padding:2px var(--sp3)">
      <div class="row" data-act="open-travel">
        <span class="rk" style="${pend ? 'color:var(--gold)' : ''}">【游历奇遇】</span>
        <span class="rv">${pend ? pend.name + '（待领）' : `距下一次 ${formatDuration(left)}`}</span>
        <span class="rs">${pend ? C().rewardTextOf(pend.effect) : '挂机每 10 分钟出一次'}</span>
      </div>
    </div>`;
  }
  /* 首页「主线」条（V8.6）：只有这一条，原来的"今日"匾额已撤，
     每天要做的事分到下面「游历」那一段里，不再两处重复。 */
  function questStrip() {
    const list = C().mainQuestState();
    const idx = list.findIndex(x => !x.claimed);
    const q = idx < 0 ? null : list[idx];
    if (!q) return `<div class="card" data-sec="quest">
      <div class="list-row" style="border:none;padding:0">
        <div class="grow"><div class="t1">主线 · 已走完</div><div class="t2">挑战更高难度与深井</div></div>
      </div>
    </div>`;
    return `<div class="card" data-sec="quest">
      <div class="list-row" style="border:none;padding:0">
        <div class="grow">
          <div class="t1">主线 · ${esc(q.q.name)} <span class="tag">第 ${idx + 1}/${list.length} 步</span></div>
          <div class="t2">完成奖励：${rewardText(q.q.reward)}</div>
        </div>
        ${q.done
          ? '<button class="btn small primary" data-act="claim-quest">领取奖励</button>'
          : '<button class="btn small ghost" data-act="goto-quest">去完成 ›</button>'}
      </div>
    </div>`;
  }
  /* 首页五段固定顺序（V8.6，父亲大人定的）：主角 → 主线 → 养成 → 游历 → 挂机 → 设置。
     两条规矩：
     ① **同一个功能在首页只出现一次**——挂机分工只留在挂机卡里，顶栏也不再重复放"设置 / 指南"图标；
     ② **手机是主设备**：所有提示都写在界面上，不靠鼠标悬停、不靠 Esc 这类只有电脑才有的操作。 */
  function homeScreen() {
    return `
    ${heroBlock()}
    ${questStrip()}
    ${growBlock()}
    ${travelBlock()}
    ${idleBlock()}
    ${settingsBlock()}
    `;
  }
  /* 主角：对标参考产品主界面最上面那排文字行，一行一件事、不做卡片格子。
     整段只有【主角】那一行可点（进主角详情：加点 / 洗点 / 装备），
     别的入口统一收到下面的「养成」里，避免同一个功能出现两次。 */
  function heroBlock() {
    const S = C().S;
    const st = C().realmState();
    const expNeed = D.EXP_TABLE[S.player.level] || 1;
    const au = C().authorityInfo();
    const spentAttr = D.ATTR_META.reduce((s, a) => s + ((S.player.attrs && S.player.attrs[a.id]) || 0), 0);
    const spentSkill = (S.player.skillLv || [1, 1, 1]).reduce((s, x) => s + x - 1, 0);
    const sect = C().sectInfo();
    // 参考产品的主界面最上面就是这种【标签】值 的文字行，一行一件事，不做卡片格子
    /* V9.5.3：整块主角卡都可点（父亲大人要求）——以前只有【主角】那一行的黄字能点，
       现在把 data-protag 挂到卡片本身，四行随便点哪里都进角色界面。 */
    return `<div class="card text-rows" data-sec="hero" data-protag="1" style="cursor:pointer">
      <div class="row">
        <span class="rk">【境界】</span>
        <span class="rv" style="color:${st.hasBloodline ? 'var(--gold)' : 'var(--accent)'}">${st.curName || '未定血统'}</span>
        <span class="rs">${st.hasBloodline ? `第 ${Math.min(st.realm + 1, D.REALM_STAGE_COUNT)} / ${D.REALM_STAGE_COUNT} 阶` : '点【主角】卡里选血统'}</span>
      </div>
      <div class="row">
        <span class="rk">【等级】</span>
        <span class="rv">Lv.${S.player.level}</span>
        <span class="rs">EXP ${Math.floor(S.player.exp / expNeed * 100)}%</span>
      </div>
      <div class="row">
        <span class="rk">【主角】</span>
        <span class="rv" style="${(S.player.attrPoints || S.player.skillPoints) ? 'color:var(--gold)' : ''}">六维待分 ${S.player.attrPoints || 0} · 技能待加 ${S.player.skillPoints || 0}</span>
        <span class="rs">点开：加点 / 洗点 / 血统 / 境界 ›</span>
      </div>
      <div class="row">
        <span class="rk">【转生】</span>
        <span class="rv">${S.player.reincarnations} 世</span>
        <span class="rs">权限 Lv.${au.lv} · 评级 Lv.${sect.lv}</span>
      </div>
    </div>`;
  }
  /* 挂机：产出 / 已挂 / 待领 / 分工 + 两个动作。
     「派人分工」只在这一张卡里出现一次，首页别处不再重复放入口。 */
  function idleBlock() {
    const r = C().idleRates();
    const bank = C().idleBankGains();
    const lines = C().idleLines();
    const t0 = C().todayState();
    return `<div class="section-title" data-sec="idle">挂机</div>
    <div class="card idle-card">
      <div class="idle-line">
        <span class="il-k">【挂机】</span>
        <b class="il-v">◈${r.pointsPerMin.toFixed(1)}/分</b>
        <span class="il-s">EXP ${r.expPerMin.toFixed(1)}/分 · 离线 ${Math.round(C().offlineEfficiency() * 100)}% · 上限 ${C().offlineCapHours().toFixed(1)}h</span>
      </div>
      <div class="idle-line">
        <span class="il-k">【已挂】</span>
        <b id="idle-time">${formatDuration(bank.seconds)}</b>
        <span class="il-k" style="margin-left:auto">【待领】</span>
        <b class="il-r" id="idle-gains">◈${fmt(bank.points)} · EXP ${fmt(bank.exp)}${bank.otherworld ? ` · ◆${bank.otherworld}` : ''}${bank.story ? ` · ❖${bank.story}` : ''}${bank.mat ? ` · 材料 ${bank.mat}` : ''}</b>
      </div>
      <div class="idle-line idle-mini">
        <span class="il-k">【分工】</span>
        <span class="il-s">${lines.map(l => `${l.line.name} ${l.leaderId ? cname(l.leaderId) : '空'}`).join(' · ')}</span>
      </div>
      <div class="btn-row mt2">
        <button class="btn small ghost" data-act="open-idlelines">派人分工</button>
        <button class="btn primary" data-act="claim-all" ${t0.claimable ? '' : 'disabled'}>${t0.claimable ? `一键收取（${t0.claimable}）` : '一键收取'}</button>
      </div>
    </div>`;
  }
  /* 一块三列纯文字宫格：名字一行、状态一行，不用图标认路。
     没解锁的不铺成一片灰格子（一眼全是"未解锁"等于没信息），收成一行小字。 */
  function tileGrid(list) {
    const open = list.filter(x => !x[3] || C().isUnlocked(x[3]));
    const locked = [];
    list.filter(x => x[3] && !C().isUnlocked(x[3])).forEach(x => locked.push(x[1]));
    if (!open.length) return '';
    return `<div class="text-menu">${open.map(tile).join('')}</div>
      ${locked.length ? `<div class="hint mt2">还没解锁：${locked.join(' / ')}</div>` : ''}`;
  }
  function menuGroup(title, sec, list, before) {
    const grid = tileGrid(list);
    if (!grid) return '';
    return `<div class="section-title" data-sec="${sec}">${title}</div>${before || ''}${grid}`;
  }
  /* 养成：一条线一个入口（「执灯者 → 成长」子页里是同一批线的总览）。
     日常类的入口（悬赏 / 每日 / 成就 / 求签 / 招募 / 兑换）也收在这一段里，
     用一行小字「日常」隔开——首页的「游历」只放游历奇遇本身。 */
  function growBlock() {
    const S = C().S;
    const sect = C().sectInfo();
    const kejiTotal = D.KEJI.reduce((s, k) => s + C().kejiLv(k.id), 0);
    const bLv = Object.values(S.buildings).reduce((a, b) => a + b, 0);
    const au = C().authorityInfo();
    const gl = S.player.geneLock > 0 ? `${S.player.geneLock} 阶` : '未解锁';
    const beasts = Object.keys(S.beast.owned || {}).length;
    const fbOwn = C().fabaoState().own.length;
    const gardenBusy = C().gardenState().filter(p => p.plot).length;
    const arena = C().arenaState();
    const mountOwn = C().mountState().own.length;
    const achDot = C().achievementSummary().list.filter(x => x.done && !x.claimed).length > 0;
    const signSt = C().signState();
    const signToday = signSt.canDraw ? null : signSt;
    // 一条入口 = [动作, 名字, 状态文字, 解锁条件(可空), 是否亮红点]
    const lines = [
      ['open-sect', '灯阁评级', `Lv.${sect.lv}`],
      ['open-keji', '秘术阁', `${kejiTotal} 级`],
      ['open-fabao', '法宝', fbOwn ? `${fbOwn}/${D.FABAO.length} 件` : '去挑一件'],
      ['open-garden', '药园', `${gardenBusy} 块在用`],
      ['open-arena', '斗法台', `第 ${arena.floor} 台 · 剩 ${arena.left} 次`],
      ['open-mount', '坐骑', mountOwn ? `${mountOwn}/${D.MOUNTS.length} 匹` : '去驯一匹'],
      ['open-refine', '炼化台', '装备材料炼血清'],
      ['open-authority', '灯阁权限', `Lv.${au.lv}/${au.max}`, 'buildings'],
      ['open-buildings', '基地建设', `合计 Lv.${bLv}`, 'buildings'],
      ['open-genelock', '铭刻', gl, 'geneLock'],
      ['open-beast', '伴生体', beasts ? `${beasts} 只` : '未孵化', 'beast'],
      ['open-reincarn', '转生天赋', `${S.player.reincarnations} 世`, 'reincarn'],
      ['open-codex', '灯录', `${C().codexState().owned}/${C().codexState().total} 名`, 'recruit'],
    ];
    const daily = [
      ['open-bounty', '限时悬赏', '按时重置', null, C().bountyState().list.some(x => x.done && !x.claimed)],
      ['open-tasks', '每日任务', '主线 / 日常 / 周常', 'tasks'],
      ['open-ach', '成就', '长线目标', null, achDot],
      ['open-sign', '求签', signToday ? `今日【${signToday.tier}】` : '今日还没求'],
      ['open-recruit', '招募伙伴', C().freeRecruitAvailable() ? '今日免费 1 抽' : '攒碎片升星', 'recruit', C().isUnlocked('recruit') && C().freeRecruitAvailable()],
      ['open-shop', '兑换大厅', '三档商店', 'shop'],
    ];
    return `<div class="section-title" data-sec="grow">养成</div>
      ${tileGrid(lines)}
      <div class="grid-title">日常</div>
      ${tileGrid(daily)}`
      + '<div class="hint mt2">全部养成线的总览在「执灯者 → 成长」。</div>'
  }
  /* 游历：只放「游历奇遇」本身——挂机路上随机冒出来的奇遇，进度条就是它的唯一入口。 */
  function travelBlock() {
    const pend = C().pendingTravel();
    return `<div class="section-title" data-sec="travel">游历</div>
      ${travelStrip()}
`;
  }
  /* 设置：玩法指南 / 货币图鉴 / 设置与存档。
     这三样全站只在这里出现一次（顶栏原来那两个图标按钮已经撤掉）。 */
  function settingsBlock() {
    const list = [
      ['open-guide', '玩法指南', '分章图文'],
      ['open-curdoc', '货币图鉴', '币的用途与来源'],
      ['open-settings', '设置与存档', '存档 / 音效 / 导出'],
    ];
    return menuGroup('设置', 'settings', list);
  }
  // 纯文字入口块：名字一行、状态一行，不用图标
  function tile(x) {
    const [act, name, sub, , dot] = x;
    return `<button class="tile" data-act="${act}">
      <span class="tt-name">${name}${dot ? '<i class="tt-dot"></i>' : ''}</span>
      <span class="tt-sub">${sub || ''}</span></button>`;
  }
  function formatDuration(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h) return `${h}小时${m}分`;
    if (m) return `${m}分${s}秒`;
    return `${s}秒`;
  }

  /* ================= 残域 ================= */
  const WORLD_ICONS = { bio: '🧟', ghost: '👻', mystic: '🏺', tech: '🛰', god: '👁' };
  let dungeonView = { page: 'worlds' };
  let run = null;   // 进行中的关卡
  // 副本进度落盘：路线、血量、增益、已走步数都存进存档，刷新或被系统回收后可以接着打
  function persistRun() { if (run) C().setPendingRun(run); else C().clearPendingRun(); }

  function dungeonScreen() {
    if (dungeonView.page === 'world') return worldDetail();
    if (dungeonView.page === 'run') return runScreen();
    if (dungeonView.page === 'corridor') return corridorScreen();
    return worldsList();
  }
  function worldsList() {
    const S = C().S;
    const corridorLocked = !C().isUnlocked('corridor');
    const corridor = `
      <div class="card world-card ${corridorLocked ? 'locked' : ''}" data-act="open-corridor" style="cursor:pointer;border-color:#8be9e955;${corridorLocked ? 'opacity:.55' : ''}">
        <div class="world-ico">♾</div>
        <div class="grow">
          <div class="t1">深井 <span class="tag">终局挑战</span></div>
          <div class="t2">${corridorLocked ? '🔒 ' + C().unlockTip('corridor') : `当前第 ${S.corridor.floor} 层 · 历史最高 ${S.corridor.best} 层`}</div>
        </div>
        <span class="chev">›</span>
      </div>`;
    const worlds = D.WORLDS.map((w, i) => {
      const st = S.worlds[w.id];
      const unlocked = st && st.unlocked;
      const cleared = unlocked && st.stages.normal.every(s => s > 0);
      const prog = unlocked ? st.stages.normal.filter(s => s > 0).length : 0;
      return `
      <div class="card world-card" data-world="${w.id}" style="cursor:pointer;${unlocked ? '' : 'opacity:.45'}">
        <div class="world-ico">${WORLD_ICONS[w.theme]}</div>
        <div class="grow">
          <div class="t1">${w.name} ${cleared ? '<span class="tag" style="color:var(--green);border-color:#2f5b41">已通关</span>' : ''}</div>
          <div class="t2">${unlocked ? `进度 ${prog}/12 · ${w.mechanic.split('：')[0]}` : '🔒 通关上一世界解锁'}</div>
        </div>
        <span class="chev">›</span>
      </div>`;
    }).join('');
    const S0 = C().S;
    const pr = S0.pendingRun;
    const resume = pr && pr.worldId ? (() => {
      const w = D.WORLDS.find(x => x.id === pr.worldId);
      return `<div class="card" style="border-color:#ffd76a88;margin-bottom:10px">
        <h3>继续上次副本 <span class="sub">${w ? w.name : pr.worldId} · 第 ${pr.stage}/12 关 · 第 ${Math.min((pr.wave || 0) + 1, (pr.waves || [1]).length)}/${(pr.waves || [1]).length} 波</span></h3>
        <div class="btn-row">
          <button class="btn small primary" data-resume-run="1">继续探索</button>
          <button class="btn small ghost" data-drop-run="1">放弃这一轮</button>
        </div>
      </div>`;
    })() : '';
    return `${resume}<div class="section-title">深井挑战</div>${corridor}<div class="section-title">残域（${D.WORLDS.length}）</div>${worlds}`;
  }
  function worldDetail() {
    const S = C().S;
    const w = D.WORLDS.find(x => x.id === dungeonView.worldId);
    const diff = dungeonView.diff || 'normal';
    const st = S.worlds[w.id];
    const diffName = { normal: '普通', hard: '困难', hell: '地狱' };
    const cells = Array.from({ length: 12 }, (_, i) => {
      const unlocked = C().stageUnlocked(w.id, diff, i);
      const starsGot = st ? st.stages[diff][i] : 0;
      const isBoss = i === 11;
      return `<div class="stage-cell ${unlocked ? '' : 'locked'} ${starsGot ? 'done' : ''} ${isBoss ? 'boss' : ''}" data-stage="${i}">
        ${isBoss ? '👹' : i + 1}<span class="st">${starsGot ? '★'.repeat(starsGot) : ''}</span>
      </div>`;
    }).join('');
    const canSweep = st && st.stages[diff].some(s => s > 0);
    return `
      <button class="btn ghost small mb3" data-act="back-worlds">‹ 返回世界列表</button>
      <div class="card">
        <h3>${WORLD_ICONS[w.theme]} ${w.name}</h3>
        <div style="font-size:12px;color:var(--dim);line-height:1.6">${w.desc}</div>
        <div class="kv mt2"><span class="k">世界机制</span><span style="color:var(--accent)">${w.mechanic}</span></div>
        <div class="kv"><span class="k">守关Boss</span><span>${w.boss}</span></div>
      </div>
      <div class="diff-tabs">
        ${D.DIFFICULTY.map(d => `<button class="btn small ${diff === d.id ? 'active' : ''}" data-diff="${d.id}" ${d.id !== 'normal' && !C().worldCleared(w.id, d.id === 'hard' ? 'normal' : 'hard') ? 'disabled' : ''}>${d.name}${d.id !== 'normal' ? ` ×${d.mult}` : ''}</button>`).join('')}
      </div>
      <div class="stage-grid">${cells}</div>
      ${canSweep ? `<button class="btn block" style="margin-top:12px" data-act="open-sweep" ${C().sweepLeft() <= 0 ? 'disabled' : ''}>⏩ 扫荡（可选关卡 · 今日剩余 ${C().sweepLeft()}/${D.SWEEP_DAILY_CAP} 次）</button>` : ''}
    `;
  }
  // 扫荡：可选关卡 + 可选次数
  function sweepModal(worldId, diff, wrap) {
    const S = C().S;
    const st = S.worlds[worldId] && S.worlds[worldId].stages;
    const cleared = ((st && st[diff]) || []).map((s, i) => ({ s, i })).filter(x => x.s > 0);
    if (!cleared.length) { toast('通关后才能扫荡'); return null; }
    let sel = cleared[cleared.length - 1].i;
    const w = showPanel(wrap, '扫荡', '');
    const draw = () => {
      const left = C().sweepLeft();
      updateModal(w, '扫荡', `
        <div class="kv"><span class="k">今日剩余次数</span><span>${left} / ${D.SWEEP_DAILY_CAP}</span></div>
        <div class="section-title">选择扫荡关卡（已通关）</div>
        <div class="stage-grid">${cleared.map(x => `<div class="stage-cell done" data-sstage="${x.i}" style="${x.i === sel ? 'border-color:var(--gold);color:var(--gold)' : ''}">${x.i + 1}<span class="st">${'★'.repeat(x.s)}</span></div>`).join('')}</div>
        <div class="section-title">扫荡次数</div>
        <div class="btn-row">
          ${[1, 5, 10].map(k => `<button class="btn small" data-stimes="${k}" ${left <= 0 ? 'disabled' : ''}>扫荡 ×${k}</button>`).join('')}
          <button class="btn small gold" data-stimes="0" ${left <= 0 ? 'disabled' : ''}>全部剩余（${left}）</button>
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:8px">奖励按所选关卡结算：Boss 关按 Boss 掉落，精英关按精英掉落。</div>`);
      bind();
    };
    const bind = () => {
      w.querySelectorAll('[data-sstage]').forEach(el => el.onclick = () => { sel = +el.dataset.sstage; draw(); });
      w.querySelectorAll('[data-stimes]').forEach(el => el.onclick = () => {
        const raw = +el.dataset.stimes;
        const times = raw === 0 ? C().sweepLeft() : raw;
        if (times <= 0) { toast('今日扫荡次数已用完'); return; }
        const r = window.Dungeon.sweep(worldId, diff, sel + 1, times);
        if (!r.ok) { toast(r.msg); return; }
        const agg = {};
        r.total.forEach(t => t.got.forEach(g => {
          if (g.k === 'equip') agg._equips = (agg._equips || 0) + 1;
          else if (g.k === 'item') agg._items = (agg._items || 0) + (g.n || 1);
          else agg[g.k] = (agg[g.k] || 0) + g.v;
        }));
        const chips = Object.entries(agg).filter(([k]) => k !== '_equips' && k !== '_items')
          .map(([k, v]) => k === 'exp' ? `EXP+${fmt(v)}` : `${curIcon(k)}+${fmt(v)}`);
        if (agg._equips) chips.push(`🗡装备×${agg._equips}`);
        if (agg._items) chips.push(`🎒道具×${agg._items}`);
        refresh(); renderTopbar();
        lootPanel(`扫荡结果（×${r.count}${r.capped ? ' · 已达上限' : ''}）`, chips.map(c => `<span class="reward-chip">${c}</span>`).join(''), () => draw(), w);
      });
    };
    draw();
    return w;
  }

  /* ---------- 关卡探索 ---------- */
  function startRun(worldId, diff, stageIdx) {
    // 主角必上阵，无需检查
    const S = C().S;
    const stage = stageIdx + 1;
    run = {
      worldId, diff, stage, stageIdx,
      waves: window.Dungeon.wavePlan(stage),
      wave: 0,          // 当前打到第几波（0 起）
      hpPct: {},        // charId → 0~1
      buffs: {},
      kills: 0,
      deaths: 0,        // 整关累计阵亡波数：星级评价按"整关有没有人倒下"算，不只看最后一波
    };
    S.party.filter(Boolean).forEach(id => { run.hpPct[id] = 1; });   // 主角就在 S.party 里
    persistRun();
    dungeonView = { page: 'run' };
    render();
    // 点关卡就直接开打第一波——对标产品的副本没有"先选路线"这一层
    fightWave();
  }
  // 波次名（纯文字，不用图标）
  const WAVE_NAME = { combat: '遭遇战', elite: '精英伏击', boss: '守关之战' };
  // 队伍血条：探索界面与"波间结算页"共用（自动推进时玩家就靠它看血线）
  function partyHpHtml() {
    return C().S.party.filter(Boolean).map(id => {
      const pct = run && run.hpPct[id] !== undefined ? run.hpPct[id] : 1;
      return `<div style="flex:1;min-width:0"><div style="font-size:10px;color:var(--dim);text-align:center">${cname(id)}</div><div class="bar hp ${pct < 0.35 ? 'low' : ''}"><i style="width:${pct * 100}%"></i></div></div>`;
    }).join('');
  }
  // 探索中可用的消耗品：治疗剂（回血）与强化剂（本次探索增益）
  function potionBarHtml() {
    const items = C().S.items;
    const list = Object.keys(D.ITEMS).filter(k => {
      const it = D.ITEMS[k];
      return it.type === 'consumable' && it.where === 'explore' && (items[k] || 0) > 0;
    });
    if (!list.length) return '';
    const heal = list.filter(k => (D.ITEMS[k].effect || {}).healPct);
    const buff = list.filter(k => !(D.ITEMS[k].effect || {}).healPct);
    const btn = id => `<button class="btn small" data-potion="${id}">${(D.ITEMS[id].effect || {}).healPct ? '🧪' : '💉'} ${D.ITEMS[id].name} ×${items[id]}</button>`;
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">${heal.concat(buff).map(btn).join('')}</div>`;
  }
  // 用一支探索消耗品。返回是否真的用掉了（由调用方决定要不要重画）
  // 药剂回血只治"活着的人"（hpPct > 0.01），阵亡的成员不复活——
  // 否则一支药就能把全队从灭团捞回来，星级评价里的"无人阵亡"就没意义了（V9.5 定死）。
  // 抽成纯函数是为了能脱离 DOM 直接测（见 scripts/test_ui.js）。
  function applyPotionHp(hpPct, healPct) {
    const out = Object.assign({}, hpPct);
    let down = 0;
    Object.keys(out).forEach(cid => {
      if (out[cid] <= 0.01) { down++; return; }
      out[cid] = Math.min(1, out[cid] + healPct);
    });
    return { hpPct: out, down };
  }
  function usePotion(id) {
    if (!run) return false;
    const eff = (D.ITEMS[id] || {}).effect || {};
    if (!C().removeItem(id)) { toast('道具不足'); return false; }
    const parts = [];
    if (eff.healPct) {
      const r = applyPotionHp(run.hpPct, eff.healPct);
      run.hpPct = r.hpPct;
      parts.push(`全队恢复 ${Math.round(eff.healPct * 100)}% 生命${r.down ? `（${r.down} 名成员已阵亡，不复活）` : ''}`);
    }
    ['atkPct', 'spdPct', 'defPct'].forEach(k => {
      if (!eff[k]) return;
      run.buffs[k] = (run.buffs[k] || 0) + eff[k];
      parts.push(`${D.CONSUMABLE_TAG[k] || k}+${Math.round(eff[k] * 100)}%`);
    });
    C().task('item1', 1);
    C().save();
    toast(`${eff.healPct ? '🧪' : '💉'} ${D.ITEMS[id].name}：${parts.join(' · ')}`);
    persistRun();
    return true;
  }
  function bindPotionButtons(root, after) {
    root.querySelectorAll('[data-potion]').forEach(el => el.onclick = () => {
      if (usePotion(el.dataset.potion) && after) after();
    });
  }
  function runScreen() {
    if (!run) return worldsList();
    const w = D.WORLDS.find(x => x.id === run.worldId);
    const total = run.waves.length;
    const prog = Array.from({ length: total }, (_, i) => `<i class="${i < run.wave ? 'done' : ''}"></i>`).join('');
    const potionBar = potionBarHtml()
      ? `<div class="mt2">${potionBarHtml()}<div style="font-size:10px;color:var(--dim);margin-top:5px">副本内使用 · 本场探索全程有效</div></div>`
      : `<div style="font-size:10px;color:var(--dim);margin-top:8px">背包里还没有探索用道具（灯阁市集可买治疗剂 / 强化剂）</div>`;
    // 波次列表（纯文字）：打过的划掉，当前的高亮，后面的等着
    const waveList = run.waves.map((k, i) => {
      const done = i < run.wave, cur = i === run.wave;
      const nm = i === total - 1 && k === 'boss' ? `${w.boss}（守关）` : WAVE_NAME[k] || '遭遇战';
      return `<div class="list-row" style="${done ? 'opacity:.45' : cur ? '' : 'opacity:.6'}">
        <div class="grow"><div class="t1">第 ${i + 1} / ${total} 波 · ${nm}</div></div>
        <span class="hint">${done ? '已通过' : cur ? '当前' : '待打'}</span>
      </div>`;
    }).join('');
    return `
      <div class="card">
        <h3>${w.name} · ${{ normal: '普通', hard: '困难', hell: '地狱' }[run.diff]} · 第 ${run.stage}/12 关 <span class="sub">共 ${total} 波</span></h3>
        <div class="route-progress">${prog}</div>
        <div style="display:flex;gap:6px">${partyHpHtml()}</div>
        ${potionBar}
        ${Object.keys(run.buffs).length ? `<div style="margin-top:8px;font-size:11px;color:var(--green)">本关增益：${Object.entries(run.buffs).map(([k, v]) => `${D.CONSUMABLE_TAG[k] || k}+${Math.round(v * 100)}%`).join(' ')}</div>` : ''}
      </div>
      <div class="card"><h3>本关波次</h3>${waveList}</div>
      <div style="height:84px"></div>
      <div class="run-bar">
        <div class="btn-row">
          <button class="btn ghost small" data-act="abandon-run">撤离</button>
          <button class="btn primary" data-wave-fight="1">继续探索</button>
        </div>
      </div>`;
  }

  /* ---------- 深井 ---------- */
  function corridorScreen() {
    const S = C().S;
    const e = D.corridorEnemy(S.corridor.floor);
    const rw = D.corridorReward(S.corridor.floor);
    return `
      <button class="btn ghost small mb2" data-act="back-worlds">‹ 返回</button>
      <div class="corridor-hero">
        <div class="note">深井</div>
        <div class="floor-num">${S.corridor.floor}</div>
        <div class="note">历史最高 ${S.corridor.best} 层</div>
      </div>
      <div class="card">
        <h3>♜ 深井印记 <span class="sub">${C().corridorMarks()}/${D.CORRIDOR_MARK_CAP} 枚</span></h3>
  <div class="note">当前深井内加成：+${(C().corridorMarkBonus() * 100).toFixed(1)}%</div>
      </div>
      <div class="card">
        <h3>本层守卫</h3>
        <div class="kv"><span class="k">${e.name}</span><span>${e.isBoss ? '👹 Boss' : e.isElite ? '精英' : '普通'}</span></div>
        <div class="kv"><span class="k">HP</span><span>${fmt(e.hp)}</span></div>
        <div class="kv"><span class="k">通关奖励</span><span>◈${rw.points} · ❖${rw.story} · ♜${rw.corridor}${rw.bloodCrystal ? ` · ❥${rw.bloodCrystal}` : ''}</span></div>
      </div>
      <button class="btn primary block" data-act="fight-corridor">⚔️ 挑战本层</button>
      <button class="btn block mt2" data-act="open-corridor-shop">🏪 深井商店（♜${fmt(S.cur.corridor)}）</button>
    `;
  }

  /* ================= 队伍 ================= */
  /* 站位交互：**长按抓起 → 按住拖到目标站位，松手就放下**。
     （拖不动时，抓起后点一下目标站位也能放下，是备用路径。）
     所有提示都画在界面上，不弹 toast、不提 Esc——这是手机游戏，玩家手里只有一根手指。
     只在队伍页用；grabbedPos 是模块级状态，重画之后仍然保留。
     上阵固定 5 格：'0'~'4'（0/1 前排、2/3/4 后排）；'P' = 主角本身，指向他当前占的那一格
     （和 core.parsePos 是同一套标识）。 */
  const LONG_PRESS_MS = 420;
  let grabbedPos = null;    // 现在被抓起的那一格（null = 手里没东西）
  let hoverPos = null;      // 拖动中，手指/鼠标当前压在哪一格上
  let pressTimer = null;
  let suppressClick = false;
  let dragging = false;     // 长按已触发、正在拖（用来区分"滚动取消"和"拖动中"）
  function cancelPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
  // 拖动中指针底下的落点（鼠标与触摸都走指针坐标，不用各自写一套）：
  //   站在某一格上 → '0'~'4'；只压在"前排 / 后排"那行标题上 → 'row:front' / 'row:back'
  function targetAt(x, y) {
    if (typeof document === 'undefined' || !document.elementFromPoint) return null;
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest) return null;
    const tile = el.closest('[data-pos]');
    if (tile && tile.dataset) return tile.dataset.pos || null;
    const rowEl = el.closest('[data-row]');
    if (rowEl && rowEl.dataset && rowEl.dataset.row) return 'row:' + rowEl.dataset.row;
    return null;
  }
  // 拖动中给"指针底下那一格"加高亮：只改 class，不整页重画（重画会把手指底下的元素换掉）
  function paintHover() {
    const root = document.getElementById ? document.getElementById('view') : null;
    if (!root || !root.querySelectorAll) return;
    const hit = t => {
      if (!t.classList || !t.classList.toggle) return;
      const key = t.dataset && t.dataset.pos !== undefined ? t.dataset.pos : ('row:' + (t.dataset && t.dataset.row));
      t.classList.toggle('drop-target', hoverPos !== null && key === hoverPos);
    };
    root.querySelectorAll('.pslot').forEach(hit);
    root.querySelectorAll('.pos-row-label').forEach(hit);
  }
  function stopDragTrack() {
    if (!window.removeEventListener) return;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
  }
  function onDragMove(ev) {
    if (grabbedPos === null) return;
    if (ev && ev.preventDefault) ev.preventDefault();   // 拖动期间页面别跟着滚
    const p = targetAt(ev ? ev.clientX : 0, ev ? ev.clientY : 0);
    if (p !== hoverPos) { hoverPos = p; paintHover(); }
  }
  function onDragEnd(ev) {
    stopDragTrack();
    if (grabbedPos === null) return;
    const under = ev && ev.clientX !== undefined ? targetAt(ev.clientX, ev.clientY) : null;
    dropOn(under || hoverPos);
  }
  function startDragTrack() {
    if (!window.addEventListener) return;
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  }
  // 松手落地：落在别的站位＝换过去；落回自己身上或空白处＝保持"抓着"，等下一次拖动或点选
  function dropOn(to) {
    if (grabbedPos === null) return null;
    if (!to || to === grabbedPos) {
      hoverPos = null; dragging = false;
      render();
      return null;
    }
    const from = grabbedPos;
    grabbedPos = null; hoverPos = null; dragging = false;
    const r = C().swapPositions(from, to);
    toast(r.msg, r.ok ? 1800 : 2400);
    sfx(r.ok ? 'success' : 'fail');
    render();
    return r;
  }
  // 把手里那一格放回原位（提示条上的「取消」/ 再点一次自己 / 离开队伍页；电脑上 Esc 也能用）
  function cancelGrab(silent) {
    const had = grabbedPos !== null;
    grabbedPos = null; hoverPos = null; dragging = false;
    cancelPress();
    stopDragTrack();
    if (had && !silent) { render(); toast('已放回原位', 1600); }
    return had;
  }
  // 给一个站位元素挂上"长按抓起"的手势（触摸与鼠标都走指针事件；还没长按就滑走＝在滚列表，不算抓）
  function armLongPress(el, pos) {
    if (!el.addEventListener) return;
    const down = ev => {
      cancelPress();
      // 新的一次按下 = 全新手势：上一次长按留下的"吞点击"标记到此为止。
      // 否则抓起后立刻点目标格，那一下点击会被 700ms 的兜底计时器吞掉，表现就是"点了没反应"（V9.5 修）
      suppressClick = false;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 700);   // 兜底：万一点击事件没跟上，别把下一次点击吞掉
        grabbedPos = pos; hoverPos = pos; dragging = true;
        sfx('click');
        render();          // 重画一次，把"抓起"的高亮画出来；之后拖动只改 class，不再重画
        paintHover();
        startDragTrack();
        // 抓起**不弹提示框**：手机上一弹框挡住半个屏幕、还带着"Esc 取消"这种电脑说法。
        // 抓起的状态已经画在界面上（卡片高亮 + 顶部金色提示条 + 空位写"放这里"），
        // 手上再给一下震动反馈就够了。
        if (navigator && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { } }
      }, LONG_PRESS_MS);
    };
    const up = () => { if (!dragging) cancelPress(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('pointerup', up);
    el.addEventListener('touchend', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    // 长按还没触发就移动 = 在滚列表，取消这次长按；触发之后的拖动交给 window 上的监听
    el.addEventListener('pointermove', up);
    el.addEventListener('touchmove', up, { passive: true });
  }
  // 点一个站位：手里有东西＝放下换位；没抓着＝空位选人上阵 / 已上阵换人 / 主角看详情。
  // 单独抽出来是为了能脱离 DOM 直接测（见 scripts/test_ui.js 的"长按抓起 → 拖到另一格放下"）。
  function clickPosition(pos) {
    if (suppressClick) { suppressClick = false; return null; }   // 刚才是长按，不再当成点击
    if (grabbedPos !== null) {
      if (pos === grabbedPos) { cancelGrab(false); return null; }   // 点自己＝放回原位
      return dropOn(pos);
    }
    if (pos === 'P') { protagonistDetail(); return null; }
    pickPartyChar(+pos);
    return null;
  }
  // 测试用：读当前"抓起"状态（grabbedPos 是模块级私有变量，外部看不到）
  function grabState() { return { grabbed: grabbedPos, hover: hoverPos, suppress: suppressClick, dragging }; }
  function partyScreen() {
    const S = C().S;
    const fb = C().factionBuffs(S.party);
    const row = C().playerRow();
    const grabbed = grabbedPos;
    // 上阵格子**永远固定前 2 后 3（共 5 格）**：主角必上阵，他自己就占其中一格，
    // 所以主角站前排时前排是「主角 + 1 名队友」，站后排时后排是「主角 + 2 名队友」——不会多出一格。
    // 换位方式：**长按抓起 → 按住拖到目标位置松手就放下**（主角那张牌也照样能拖）。
    const gcls = grabbed ? ' grabbed' : '';
    const slotTile = i => {
      const id = S.party[i];
      const pos = i < 2 ? '前排' : '后排';
      const grabCls = grabbed === String(i) ? ' grabbing' : '';
      if (!id) {
        const freeHint = grabbed !== null && grabbed !== String(i) ? '放这里' : '＋ 上阵';
        return `<div class="pslot${grabCls}" data-pos="${i}"><span class="pos-tag">${pos}</span><div style="text-align:center;color:var(--dim);padding-top:34px;font-size:12px">${freeHint}</div></div>`;
      }
      if (id === '@player') {
        return `<div class="pslot filled protag-slot${grabCls}" data-pos="${i}" data-protag="1">
          <span class="pos-tag" style="color:var(--gold)">主角 · ${C().ROW_NAME[C().playerRow()]}</span>
          ${charAvatar('@player', 40)}
          <div class="pname">${cname('@player')}</div>
          <div class="pmeta">Lv.${S.player.level} · 战力${fmt(C().playerPower())}</div>
        </div>`;
      }
      const ch = D.charById[id];
      const c = S.chars[id];
      return `<div class="pslot filled rarity-${ch.rarity}${grabCls}" data-pos="${i}">
        <span class="pos-tag">${pos}</span>
        ${charAvatar(id, 40)}
        <div class="pname">${cname(id)}</div>
        <div class="pmeta">Lv.${c.lv} · ${ch.role} · ${ch.faction}</div>
      </div>`;
    };
    const gname = grabbed !== null && S.party[+grabbed] ? cname(S.party[+grabbed]) : '';
    const fbText = [];
    if (fb.atkPct) fbText.push(`攻击+${Math.round(fb.atkPct * 100)}%`);
    if (fb.hpPct) fbText.push(`生命+${Math.round(fb.hpPct * 100)}%`);
    if (fb.skillPct) fbText.push(`技能+${Math.round(fb.skillPct * 100)}%`);
    const fbCount = Object.entries(fb.count).map(([f, n]) => `${f}×${n}`).join(' ');
    return `
      <div class="card">
        <h3>⚔️ 灯阁小队 <span class="sub">总战力 ${fmt(C().teamPower())}（主角必上阵）</span></h3>
        ${grabbed !== null ? `<div class="drag-bar">已抓起「${gname}」 · 拖到别的位置松手放下
          <button class="btn small ghost" data-grab-cancel="1">取消</button></div>` : ''}
        <div class="party-grid${gcls}">
          <div class="pos-row-label" data-row="front">前排 <span>2 格 · 受击概率更高，适合坦度高的</span></div>
          <div class="party-slots">${slotTile(0)}${slotTile(1)}</div>
          <div class="pos-row-label" data-row="back">后排 <span>3 格 · 相对安全，适合输出与治疗</span></div>
          <div class="party-slots">${slotTile(2)}${slotTile(3)}${slotTile(4)}</div>
        </div>
        <button class="btn small block mt3" data-act="auto-equip">⚡ 一键最优装备</button>
        <div class="btn-grid3 mt2">
          <button class="btn small ghost" data-preset-save="0">存预设 1</button>
          <button class="btn small ghost" data-preset-save="1">存预设 2</button>
          <button class="btn small ghost" data-preset-save="2">存预设 3</button>
        </div>
        <div class="btn-grid3 mt1">
          <button class="btn small gold" data-preset-use="0">套用预设 1</button>
          <button class="btn small gold" data-preset-use="1">套用预设 2</button>
          <button class="btn small gold" data-preset-use="2">套用预设 3</button>
        </div>
        <div class="hint mt1">
          当前预设：${C().S.presets.map((p, i) => `${i + 1}${p && p.filter(Boolean).length ? '✓' : '—'}`).join(' ')}
        </div>
      </div>
      <div class="card">
        <h3>成员一览</h3>
        ${S.party.map((id, i) => {
          const inFront = i < 2;
          if (!id) return '';
          if (id === '@player') {
            return `<div class="list-row" data-protag-row="1" style="cursor:pointer;border-color:#e6b64c55">
              ${charAvatar('@player', 40)}
              <div class="grow"><div class="t1">${cname('@player')} <span class="tag" style="color:var(--gold);border-color:var(--gold)">主角</span> <span class="tag">${inFront ? '前排' : '后排'}</span></div>
                <div class="t2">Lv.${S.player.level} · 战力${fmt(C().playerPower())} · 必上阵，不能下阵</div></div>
            </div>`;
          }
          const ch = D.charById[id];
          const c = S.chars[id];
          const st = C().effectiveStats(id);
          return `<div class="list-row" data-char="${id}" style="cursor:pointer">
            ${charAvatar(id, 40)}
            <div class="grow"><div class="t1">${cname(id)} <span class="stars">${stars(c.star, D.RARITY_MAXSTAR[ch.rarity])}</span> <span class="tag">${inFront ? '前排' : '后排'}</span></div>
            <div class="t2">攻${fmt(st.atk)} · 防${fmt(st.def)} · 血${fmt(st.hp)} · 速${fmt(st.spd)}</div></div>
            <button class="btn small ghost" data-remove="${id}">下阵</button>
          </div>`;
        }).join('')}
        ${S.party.filter(id => id && id !== '@player').length ? '' : `<div class="empty">还没有伙伴上阵。</div>
          <button class="btn primary block mt3" data-act="open-recruit">✦ 去招募伙伴</button>`}
      </div>
      <div class="card">
        <h3>🧩 阵型</h3>
        <div class="kv"><span class="k">当前构成</span><span>${fbCount || '—'}</span></div>
        <div class="kv"><span class="k">成阵</span><span style="color:var(--green)">${fb.names.length ? fb.names.join(' · ') : '未成阵'}</span></div>
        <div class="kv"><span class="k">加成</span><span style="color:var(--green)">${fbText.join(' · ') || '无'}</span></div>
        <div class="formation-list">${D.FORMATIONS.map(f => {
        const on = fb.hit.includes(f.id);
        return `<div class="fm-row ${on ? 'on' : ''}">
          <span class="fm-name">${f.name}</span>
          <span class="fm-req">${f.reqText}</span>
          <span class="fm-buff">${Object.entries(f.buff).map(([k, v]) => `${({ atkPct: '攻', hpPct: '命', skillPct: '技' })[k] || k}+${Math.round(v * 100)}%`).join(' ')}</span>
          <span class="fm-on">${on ? '已激活' : ''}</span>
        </div>`;
      }).join('')}</div>
        <div class="hint mt1">克制环：先锋→策略→科技→异能→先锋（克制伤害+15%）</div>
      </div>
      `;
  }
  /* ================= 主角详情 ================= */
  function protagonistDetail(scrollTop, wrap) {
    const S = C().S;
    S.stats.profileViews = (S.stats.profileViews || 0) + 1; C().save(); // 主线 q01 熟悉身体
    const P = C().protagonistSkills();
    const st = C().effectivePlayerStats();
    // 洗点用的两个数：已经分出去的属性点 / 已经投进去的技能点（0 就说明没得洗）
    const spentAttr = D.ATTR_META.reduce((s, a) => s + ((S.player.attrs && S.player.attrs[a.id]) || 0), 0);
    const spentSkill = (S.player.skillLv || [1, 1, 1]).reduce((s, x) => s + x - 1, 0);
    const gl = S.player.geneLock;
    const blCost = S.player.bloodline && S.player.bloodlineLv < D.BLOODLINE_MAX ? D.bloodlineCost(S.player.bloodlineLv) : null;
    const lvlPct = Math.min(100, S.player.exp / (D.EXP_TABLE[S.player.level] || 1) * 100);
    const w = showPanel(wrap, `${cname('@player')}（主角）`, `
      <div class="card">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${charAvatar('@player', 56)}
          <div style="flex:1;min-width:0">
            <div><b>${cname('@player')}</b> <span class="tag" style="color:var(--gold);border-color:var(--gold)">执灯者本人</span></div>
            <div class="hint mt1">Lv.${S.player.level}（玩家等级）· ${S.player.bloodline ? S.player.bloodline + '血统 Lv.' + S.player.bloodlineLv : '未选血统'}</div>
            <div class="hint">铭刻 ${gl > 0 ? D.GENE_LOCKS[gl - 1].name : '未解锁'} · 六维待分 ${S.player.attrPoints || 0} 点</div>
          </div>
          <div style="text-align:right;flex:0 0 auto">
            <div style="font-size:20px;font-weight:700;color:var(--gold)">${fmt(C().playerPower())}</div>
            <div class="hint">战力</div>
          </div>
        </div>
        <div class="bar exp mt3"><i style="width:${lvlPct}%"></i></div>
        <div class="hint mt1">EXP ${Math.floor(lvlPct)}% · 当前挂机 ${C().idleRates().expPerMin.toFixed(1)} EXP/分</div>
      </div>
      <div class="card">
        <h3>🎯 六维属性 <span class="sub">可用点数 ${S.player.attrPoints || 0}</span>
          <button class="btn small ghost hbtn" data-attrreset="1" ${spentAttr > 0 ? '' : 'disabled'}>↺ 重置</button></h3>
        ${D.ATTR_META.map(a => `
          <div class="list-row">
            <div class="grow"><div class="t1">${a.name} <span style="color:var(--dim);font-size:11px">${a.desc}</span></div>
            <div class="t2">已分配 ${(S.player.attrs && S.player.attrs[a.id]) || 0} 点 → +${((S.player.attrs && S.player.attrs[a.id]) || 0) * D.ATTR_POINT_VALUE}</div></div>
            <button class="btn small" data-attr="${a.id}" data-n="1" ${(S.player.attrPoints || 0) > 0 ? '' : 'disabled'}>+1</button>
            <button class="btn small ghost" data-attr="${a.id}" data-n="10" ${(S.player.attrPoints || 0) >= 1 ? '' : 'disabled'}>+10</button>
          </div>`).join('')}
      </div>
      <div class="card">
        <h3>⚡ ${S.player.bloodline ? S.player.bloodline + '血统技能' : '技能'} <span class="sub">可用技能点 ${S.player.skillPoints || 0}</span>
          <button class="btn small ghost hbtn" data-pskillreset="1" ${spentSkill > 0 ? '' : 'disabled'}>↺ 重置</button></h3>
        ${[P.s1, P.s2, P.ult].map((sk, i) => `
          <div class="skill-row"><div class="sname">${['技能', '技能', '必杀'][i]}·${sk.name} <span class="tag">Lv.${(S.player.skillLv || [1, 1, 1])[i]}/10</span>
            <button class="btn small" data-pskill="${i}" style="margin-left:auto" ${(S.player.skillPoints || 0) > 0 && (S.player.skillLv || [1, 1, 1])[i] < 10 ? '' : 'disabled'}>+1</button></div>
          <div class="sdesc">${sk.desc}</div></div>`).join('')}
        <div class="skill-row"><div class="sname">被动·${P.passive.name}</div><div class="sdesc">${P.passive.desc}</div></div>
      </div>
      ${equipCard('@player', D.PLAYER_SLOTS, 'player')}
      <div class="card" data-card="blood">
        <h3>🩸 血统 <span class="sub">${S.player.bloodline ? 'Lv.' + S.player.bloodlineLv + ' / ' + D.BLOODLINE_MAX : '未觉醒'}</span></h3>
        ${S.player.bloodline ? `
          <div class="hint mb2">${S.player.bloodline}：${D.BLOODLINES[S.player.bloodline].desc}</div>
          ${blCost ? `<button class="btn small block" data-pblup="1">血统升级（❥${blCost.bloodCrystal} + ◈${fmt(blCost.points)}）</button>` : '<div class="gold" style="font-size:12px">已满级</div>'}
        ` : S.player.level < D.BLOODLINE_UNLOCK_LV ? `
          <div class="note">🔒 主角 Lv.${D.BLOODLINE_UNLOCK_LV} 觉醒血统（当前 Lv.${S.player.level}）</div>
        ` : `
          
          <div class="grid2">${Object.entries(D.BLOODLINES).map(([id, bl]) => `<button class="btn small" data-pbl="${id}">${id}<br><span style="font-size:10px;font-weight:400;color:var(--dim)">${bl.desc.split('。')[0]}</span></button>`).join('')}</div>
        `}
      </div>
      <div class="card">
        <h3>🌌 境界 <span class="sub">第 ${Math.min(C().realmState().realm + 1, D.REALM_STAGE_COUNT)} / ${D.REALM_STAGE_COUNT} 阶</span></h3>
        <div class="kv"><span class="k">当前境界</span><span>${S.player.realm ? C().realmState().curName : '未突破'}</span></div>
        <div class="kv"><span class="k">境界加成</span><span class="green">全属性 +${Math.round(C().realmBonusPct() * 100)}%</span></div>
        <button class="btn small block mt3" data-realm-open="1">查看境界 · 渡劫 ›</button>
      </div>
      <div class="card">
        <h3>📊 属性面板 <span class="sub">装备 / 血统 / 境界 / 铭刻都已算进来</span></h3>
        ${statGrid(st)}
        
      </div>
      <div class="card"><button class="btn small ghost block" data-rename="1">✏️ 修改名字</button></div>
    `);
    restoreModalScroll(w, scrollTop);
    const reopenSelf = () => { protagonistDetail(0, w); render(); };
    w.querySelectorAll('[data-attr]').forEach(b => b.onclick = () => {
      const r = C().allocateAttr(b.dataset.attr, +b.dataset.n);
      toast(r.msg);
      if (r.ok) reopenSelf();
    });
    w.querySelectorAll('[data-pskill]').forEach(b => b.onclick = () => {
      const r = C().allocateSkill(+b.dataset.pskill);
      toast(r.msg);
      if (r.ok) reopenSelf();
    });
    w.querySelector('[data-pskillreset]').onclick = () => {
      confirmBox('技能重置', `把 ${spentSkill} 点技能点全部退回，技能回到 Lv.1 重新点？战力只会短暂变化，点数一点不少。`, () => {
        const r = C().resetSkills();
        toast(r.msg);
        if (r.ok) reopenSelf();
      });
    };
    const attrResetBtn = w.querySelector('[data-attrreset]');
    if (attrResetBtn) attrResetBtn.onclick = () => {
      confirmBox('六维洗点', `把已经分出去的 ${spentAttr} 点属性全部退回来重新分配？六维总值不会掉，只是重新点一次。`, () => {
        const r = C().resetAttrs();
        toast(r.msg);
        if (r.ok) reopenSelf();
      });
    };
    const blBtn = w.querySelector('[data-pblup]');
    const realmBtn = w.querySelector('[data-realm-open]');
    if (realmBtn) realmBtn.onclick = () => realmModal();
    if (blBtn) blBtn.onclick = () => {
      const r = C().upgradePlayerBloodline();
      toast(r.msg);
      if (r.ok) reopenSelf();
      renderTopbar();
    };
    w.querySelectorAll('[data-pbl]').forEach(b => b.onclick = () => {
      const r = C().choosePlayerBloodline(b.dataset.pbl);
      toast(r.msg, 2200);
      if (r.ok) reopenSelf();
    });
    w.querySelectorAll('[data-peqslot]').forEach(el => el.onclick = () => {
      const st = modalScroll(w);
      pickEquipFor('@player', el.dataset.peqslot, w2 => protagonistDetail(st, w2), w);
    });
    w.querySelectorAll('[data-punequip]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      C().unequipItem('@player', b.dataset.punequip);
      reopenSelf();
    });
    w.querySelector('[data-rename]').onclick = () => {
      closeModal(w);
      const rw = modal('修改名字', `
        <input id="rn-input" maxlength="12" value="${esc(S.player.name)}" style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px;font-size:15px;outline:none;margin-bottom:12px" />
        <button class="btn primary block" data-ok>确认修改</button>`, { center: true });
      rw.querySelector('[data-ok]').onclick = () => {
        if (C().setPlayerName(rw.querySelector('#rn-input').value)) {
          toast('名字已修改');
          closeModal(rw);
          protagonistDetail(); refresh();
        } else toast('名字不能为空');
      };
    };
    return w;
  }
  function pickPartyChar(slotIdx) {
    const S = C().S;
    const owned = Object.keys(S.chars);
    const w = modal('选择上阵伙伴', owned.map(id => {
      const ch = D.charById[id];
      const c = S.chars[id];
      const inParty = S.party.includes(id);
      return `<div class="list-row" data-pick="${id}" style="cursor:pointer;${inParty ? 'opacity:.4' : ''}">
        ${charAvatar(id, 40)}
        <div class="grow"><div class="t1">${rarityTag(ch.rarity)} ${cname(id)}</div><div class="t2">Lv.${c.lv} · ${ch.role} · ${ch.faction} · 战力${fmt(C().power(id))}</div></div>
        ${inParty ? '<span class="tag">已上阵</span>' : ''}
      </div>`;
    }).join('') || '<div class="empty">还没有伙伴，去招募吧</div>');
    w.querySelectorAll('[data-pick]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.pick;
        if (S.party.includes(id)) return;
        const oldId = S.party[slotIdx];
        if (oldId === '@player') return;     // 主角那一格不能被顶掉
        S.party[slotIdx] = id;
        C().save();
        closeModal(w);
        render();
        toast(`${D.charById[id].name} 已上阵${oldId ? `（${D.charById[oldId].name} 已下阵）` : ''}`);
      };
    });
  }

  /* ================= 角色 ================= */
  let charFilter = 'all';
  let charSort = 'power';
  let charQuery = '';
  // 排序里最有用的两条是「未满级优先」和「没穿装备优先」——它们直接回答"我下一步该练谁"
  const CHAR_SORTS = [['power', '战力'], ['level', '等级'], ['star', '星级'], ['notmax', '未满级'], ['noequip', '没穿装备']];
  function equippedCount(id) {
    const sl = C().S.equipped[id] || {};
    return Object.keys(sl).filter(k => sl[k]).length;
  }
  function charListSorted() {
    const S = C().S;
    let list = Object.keys(S.chars);
    if (charFilter === 'party') list = list.filter(id => S.party.includes(id));
    else if (charFilter === 'SSR') list = list.filter(id => ['SSR', 'UR'].includes(D.charById[id].rarity));
    else if (charFilter !== 'all') list = list.filter(id => D.charById[id].rarity === charFilter);
    const q = charQuery.trim().toLowerCase();
    if (q) list = list.filter(id => cname(id).toLowerCase().indexOf(q) >= 0);
    const rar = id => D.RARITIES.indexOf(D.charById[id].rarity);
    const cmps = {
      power: (a, b) => C().power(b) - C().power(a),
      level: (a, b) => S.chars[b].lv - S.chars[a].lv,
      star: (a, b) => S.chars[b].star - S.chars[a].star,
      // "还能不能升级"直接问 levelCost（和实际养成逻辑同源，不另写一套判断）
      notmax: (a, b) => (C().levelCost(a) ? 0 : 1) - (C().levelCost(b) ? 0 : 1) || C().power(b) - C().power(a),
      noequip: (a, b) => equippedCount(a) - equippedCount(b) || C().power(b) - C().power(a),
    };
    const cmp = cmps[charSort] || cmps.power;
    return list.sort((a, b) => cmp(a, b) || rar(b) - rar(a));
  }
  function charGridHtml() {
    const S = C().S;
    const cards = charListSorted().map(id => {
      const ch = D.charById[id];
      const c = S.chars[id];
      const eq = equippedCount(id);
      return `<div class="char-card rarity-${ch.rarity}" data-char="${id}">
        ${S.party.includes(id) ? '<span class="inparty">上阵</span>' : ''}
        ${charAvatar(id)}
        <div class="cname">${cname(id)}</div>
        <div class="stars">${stars(c.star, D.RARITY_MAXSTAR[ch.rarity])}</div>
        <div class="cmeta">Lv.${c.lv} · 战力${fmt(C().power(id))}</div>
        <div class="cmeta">${eq ? `装备 ${eq}/6` : '<span style="color:var(--gold)">未穿装备</span>'}${C().levelCost(id) ? ' · 可升级' : ''}</div>
      </div>`;
    }).join('');
    if (cards) return cards;
    if (Object.keys(S.chars).length) return '<div class="empty" style="grid-column:1/-1">没有符合条件的伙伴</div>';
    return `<div class="empty" style="grid-column:1/-1">还没有招募到任何伙伴</div>
      <button class="btn primary block" style="grid-column:1/-1" data-act="open-recruit">✦ 去招募伙伴</button>`;
  }
  // 只重画网格：搜名字时输入框不会失焦，也不会整页闪
  function paintCharGrid(root) {
    const box = root.querySelector ? root.querySelector('#char-list') : null;
    if (!box || !box.querySelectorAll) return;
    box.innerHTML = charGridHtml();
    box.querySelectorAll('[data-char]').forEach(el => el.onclick = () => charDetail(el.dataset.char));
  }
  function charsScreen() {
    const S = C().S;
    const filters = [['all', '全部'], ['party', '已上阵'], ['SSR', 'SSR+'], ['N', 'N'], ['R', 'R'], ['SR', 'SR']];
    const cs = C().codexState();
    return `
      <div class="pill-tabs">${filters.map(([k, n]) => `<div class="pill ${charFilter === k ? 'active' : ''}" data-filter="${k}">${n}</div>`).join('')}</div>
      <div class="filter-bar">
        <span class="flabel">排序</span>
        <div class="pill-tabs grow-pills">${CHAR_SORTS.map(([k, n]) => `<div class="pill ${charSort === k ? 'active' : ''}" data-charsort="${k}">${n}</div>`).join('')}</div>
      </div>
      <div class="filter-bar">
        <input id="char-search" class="search-input" type="text" placeholder="🔍 搜名字" value="${esc(charQuery)}" />
        <button class="btn small ghost" data-act="open-codex">📕 图鉴</button>
      </div>
      <div style="font-size:11px;color:var(--dim);margin:0 2px 8px">已收集 ${cs.owned}/${cs.total} · 拥有 ${Object.keys(S.chars).length} · 当前显示 ${charListSorted().length}</div>
      <div class="char-grid" id="char-list">${charGridHtml()}</div>`;
  }
  function charDetail(id, scrollTop, wrap) {
    const S = C().S;
    const ch = D.charById[id];
    const c = S.chars[id];
    const st = C().effectiveStats(id);
    const cost = C().levelCost(id);
    const starCost = D.STAR_COST[c.star];
    const maxStar = D.RARITY_MAXSTAR[ch.rarity];
    const bl = D.BLOODLINES[ch.bloodline];
    const blCost = c.bloodlineLv < D.BLOODLINE_MAX ? D.bloodlineCost(c.bloodlineLv) : null;
    const skills = [ch.skills.s1, ch.skills.s2, ch.skills.ult];
    const skillNames = ['技能1', '技能2', '必杀技'];
    const expItems = Object.entries(S.items).filter(([k]) => D.ITEMS[k] && D.ITEMS[k].type === 'exp');
    const w = showPanel(wrap, `${cname(id)}`, `
      <div class="card">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${charAvatar(id, 56)}
          <div style="flex:1;min-width:0">
            <div>${rarityTag(ch.rarity)} <b>${cname(id)}</b> <span class="stars">${stars(c.star, maxStar)}</span></div>
            <div class="hint mt1">${ch.faction} · ${ch.role} · ${ch.bloodline}血统</div>
            <div class="hint">Lv.${c.lv} · 碎片 ${c.shards} · 血统 Lv.${c.bloodlineLv}</div>
          </div>
          <div style="text-align:right;flex:0 0 auto">
            <div style="font-size:20px;font-weight:700;color:var(--gold)">${fmt(C().power(id))}</div>
            <div class="hint">战力</div>
          </div>
        </div>
        <div class="btn-row mt3">
          <button class="btn small" data-lvup="1" ${!cost ? 'disabled' : ''}>升 1 级</button>
          <button class="btn small" data-lvup="10" ${!cost ? 'disabled' : ''}>升 10 级</button>
          <button class="btn small ghost" data-expitem="1" ${expItems.length ? '' : 'disabled'}>用经验道具</button>
        </div>
        <div class="hint mt2">${cost ? `升下一级需要 EXP ${fmt(cost.exp)} + ◈${fmt(cost.points)}` : '已满级'}</div>
      </div>
      <div class="card">
        <h3>⭐ 星级 <span class="sub">${c.star} / ${maxStar} · 碎片 ${c.shards}</span></h3>
        <div class="btn-row">
          <button class="btn small" data-starup="1" ${c.star >= maxStar ? 'disabled' : ''}>升星${starCost ? `（碎片 ${starCost}）` : ''}</button>
        </div>
      </div>
      <div class="card">
        <h3>🎯 六维属性 <span class="sub">固定成长 · 不用加点</span></h3>
        ${attrGrid(st.attrs)}
      </div>
      <div class="card">
        <h3>⚡ 技能 <span class="sub">芯片 ▣${fmt(S.cur.skillChip)}</span></h3>
        ${skills.map((sk, i) => `
          <div class="skill-row">
            <div class="sname">${skillNames[i]}·${sk.name} <span class="tag">Lv.${c.skillLv[i]}</span>
              <button class="btn small ghost" style="margin-left:auto" data-skillup="${i}" ${c.skillLv[i] >= 10 ? 'disabled' : ''}>升级</button></div>
            <div class="sdesc">${sk.desc}（每级 +7% 效果 · 下级需 ▣${C().SKILL_CHIP_COST[c.skillLv[i] - 1] || '—'}）</div>
          </div>`).join('')}
        <div class="skill-row">
          <div class="sname">被动·${ch.skills.passive.name}</div>
          <div class="sdesc">${ch.skills.passive.desc}</div>
        </div>
      </div>
      ${equipCard(id, D.RECRUIT_SLOTS, 'char')}
      <div class="card">
        <h3>🩸 ${ch.bloodline}血统 <span class="sub">Lv.${c.bloodlineLv} / ${D.BLOODLINE_MAX}</span></h3>
        <div class="hint mb2">${bl.desc}</div>
        <div class="btn-row">
          <button class="btn small" data-blup="1" ${!blCost ? 'disabled' : ''}>血统升级${blCost ? `（❥${blCost.bloodCrystal} + ◈${fmt(blCost.points)}）` : ''}</button>
        </div>
      </div>
      <div class="card">
        <h3>📊 属性面板 <span class="sub">装备 / 血统 / 星级都已算进来</span></h3>
        ${statGrid(st)}
      </div>
    `);
    restoreModalScroll(w, scrollTop);
    const reopenSelf = () => { charDetail(id, 0, w); };
    w.querySelectorAll('[data-lvup]').forEach(b => b.onclick = () => {
      const r = C().levelUp(id, +b.dataset.lvup);
      toast(r.msg);
      sfx(r.ok ? 'level' : 'fail');
      reopenSelf(); renderTopbar();
    });
    w.querySelector('[data-starup]').onclick = () => {
      const r = C().starUp(id);
      toast(r.msg);
      if (r.ok) reopenSelf();
      renderTopbar();
    };
    w.querySelectorAll('[data-skillup]').forEach(b => b.onclick = () => {
      const r = C().skillUp(id, +b.dataset.skillup);
      toast(r.msg);
      if (r.ok) reopenSelf();
      renderTopbar();
    });
    w.querySelector('[data-blup]').onclick = () => {
      const r = C().bloodlineUpgrade(id);
      toast(r.msg);
      if (r.ok) reopenSelf();
      renderTopbar();
    };
    const expBtn = w.querySelector('[data-expitem]');
    if (expBtn) expBtn.onclick = () => pickExpItem(id, w);
    w.querySelectorAll('[data-eqslot]').forEach(el => el.onclick = () => {
      const st = modalScroll(w);
      pickEquipFor(id, el.dataset.eqslot, w2 => charDetail(id, st, w2), w);
    });
    w.querySelectorAll('[data-unequip]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      C().unequipItem(id, b.dataset.unequip);
      reopenSelf();
    });
    return w;
  }
  function equipBrief(eq) {
    const st = C().equipStats(eq);
    const parts = [];
    if (st.flat.atk) parts.push(`攻+${Math.round(st.flat.atk)}`);
    if (st.flat.def) parts.push(`防+${Math.round(st.flat.def)}`);
    if (st.flat.hp) parts.push(`血+${Math.round(st.flat.hp)}`);
    if (st.flat.spd) parts.push(`速+${Math.round(st.flat.spd)}`);
    Object.entries(st.affix).forEach(([k, v]) => parts.push(`${D.AFFIX_POOL[k].name}+${(v * 100).toFixed(1)}%`));
    return parts.join(' ');
  }
  function pickExpItem(id, wrap) {
    const S = C().S;
    const items = Object.entries(S.items).filter(([k]) => D.ITEMS[k] && D.ITEMS[k].type === 'exp');
    const w = showPanel(wrap, '使用经验道具', `
      <div class="note mb3">喂给 <b>${cname(id)}</b></div>
      ${items.map(([k, n]) => `
      <div class="list-row">
        <div class="grow"><div class="t1">${D.ITEMS[k].name}</div><div class="t2">+${fmt(D.ITEMS[k].exp)} EXP · 拥有 ${n}</div></div>
        <button class="btn small" data-use="${k}" data-n="1">用 1</button>
        <button class="btn small" data-use="${k}" data-n="10" ${n >= 10 ? '' : 'disabled'}>用 10</button>
        <button class="btn small gold" data-use="${k}" data-n="0">全用</button>
      </div>`).join('') || '<div class="empty">没有经验道具</div>'}
      <button class="btn ghost block mt4" data-back>‹ 返回伙伴</button>`);
    w.querySelector('[data-back]').onclick = () => charDetail(id, 0, w);
    w.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
      const want = +b.dataset.n;
      const cnt = want === 0 ? (S.items[b.dataset.use] || 0) : want;
      const r = C().useExpItem(id, b.dataset.use, cnt);
      toast(r.msg);
      renderTopbar();
      pickExpItem(id, w);
    });
    return w;
  }
  // 与当前穿戴对比：新装备 - 旧装备，正数绿、负数红
  function equipDelta(curEq, newEq) {
    if (!curEq) return '';
    const a = C().equipStats(curEq), b = C().equipStats(newEq);
    const parts = [];
    [['atk', '攻'], ['def', '防'], ['hp', '血'], ['spd', '速']].forEach(([k, label]) => {
      const d = (b.flat[k] || 0) - (a.flat[k] || 0);
      if (Math.abs(d) < 0.5) return;
      parts.push(`<span style="color:${d > 0 ? 'var(--green)' : 'var(--accent)'}">${label}${d > 0 ? '+' : '-'}${Math.round(Math.abs(d))}</span>`);
    });
    Object.keys(Object.assign({}, a.affix, b.affix)).forEach(k => {
      const d = ((b.affix[k] || 0) - (a.affix[k] || 0)) * 100;
      if (Math.abs(d) < 0.05) return;
      const nm = (D.AFFIX_POOL[k] || {}).name || k;
      parts.push(`<span style="color:${d > 0 ? 'var(--green)' : 'var(--accent)'}">${nm}${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(1)}%</span>`);
    });
    return parts.length ? parts.join(' ') : '<span style="color:var(--dim)">与当前持平</span>';
  }
  function pickEquipFor(charId, slot, back, wrap) {
    const S = C().S;
    const allowed = charId === '@player' ? D.PLAYER_SLOTS : D.RECRUIT_SLOTS;
    // 只列出该角色能穿的：过滤他人专属与非本职业/血统的套装
    const list = C().inventoryEquips().filter(e => e.slot === slot && allowed.includes(e.slot) && C().canEquip(charId, e));
    const backFn = back || (w2 => charDetail(charId, 0, w2));
    const curUid = (S.equipped[charId] || {})[slot];
    const curEq = curUid && S.equips[curUid];
    const w = showPanel(wrap, `选择${D.EQUIP_SLOTS[slot]}（${cname(charId)}）`, `
      ${curEq ? `<div class="hint mb2">当前：<span class="rtext-${curEq.rarity}">${curEq.name} +${curEq.enhance}</span> · 下面是换成这件之后的属性变化</div>`
        : `<div class="hint mb2">该部位还没有装备，装上即为净收益</div>`}
      ${list.map(eq => {
      const equippedBy = Object.entries(S.equipped).find(([cid, slots]) => slots[slot] === eq.uid);
      return `<div class="list-row" data-eq="${eq.uid}" style="cursor:pointer">
        <div class="grow"><div class="t1 rtext-${eq.rarity}">${eq.name} +${eq.enhance} ${equipCatTag(eq)}</div>
        <div class="t2">${equipBrief(eq)}${equippedBy ? ` · ${cname(equippedBy[0])}装备中` : ''}</div>
        ${eq.uid === curUid ? '<div class="t2" style="color:var(--gold)">当前穿戴中</div>' : (list.length && curEq ? `<div class="t2">对比：${equipDelta(curEq, eq)}</div>` : '')}</div>
      </div>`;
    }).join('') || '<div class="empty">背包中没有该伙伴可穿戴的此部位装备</div>'}
      <button class="btn ghost block mt4" data-back>‹ 返回伙伴</button>`);
    w.querySelector('[data-back]').onclick = () => backFn(w);
    w.querySelectorAll('[data-eq]').forEach(el => el.onclick = () => {
      const from = C().equipWearer(el.dataset.eq);
      if (C().equipItem(charId, el.dataset.eq)) toast(from && from !== charId ? `已装备（从 ${cname(from)} 身上取下）` : '已装备');
      else toast('该伙伴无法穿戴此装备');
      backFn(w);
    });
    return w;
  }

  /* ================= 装备页 ================= */
  let equipFilter = 'all';
  let equipCatFilter = 'all';
  let batchMode = false;
  const batchSel = new Set();
  function equippedUidSet(S) {
    const s = new Set();
    Object.values(S.equipped).forEach(sl => Object.values(sl).forEach(u => u && s.add(u)));
    return s;
  }
  function batchGain() {
    const S = C().S;
    let gain = 0;
    batchSel.forEach(uid => { const e = S.equips[uid]; if (e) gain += D.DECOMPOSE_GAIN[e.rarity] + Math.floor(e.enhance * 3); });
    return gain;
  }
  function updateBatchBar() {
    const info = document.querySelector('[data-binfo]');
    if (info) info.innerHTML = `已选 <b style="color:var(--gold)">${batchSel.size}</b> 件 · 预计 ◆${fmt(batchGain())}`;
  }

  // 装备类别标签：普通 / 世界套装 / 职业套装 / 专属
  function equipCatTag(eq) {
    if (eq.charId) { const ch = D.charById[eq.charId]; return `<span class="tag" style="color:var(--gold);border-color:var(--gold)">专属·${ch ? ch.name : '?'}</span>`; }
    if (eq.classSet) return `<span class="tag" style="color:#c5a3ff;border-color:#c5a3ff">${D.CLASS_SETS[eq.classSet] ? D.CLASS_SETS[eq.classSet].name : '职业套装'}</span>`;
    if (eq.set) return `<span class="tag" style="color:#6ec6ff;border-color:#6ec6ff">${D.SETS[eq.set] ? D.SETS[eq.set].name : '世界套装'}</span>`;
    return '<span class="tag">普通</span>';
  }
  /* 装备页（住在「背包 → 装备」）。V9.3 重排成三层，让层次一眼看得出来：
     ① 三个主标签（道具 / 材料 / 装备）在最上面，横向铺满、平均分布；
     ② 分类胶囊紧贴在主标签正下方，按钮做小——"分类属于上层、内容属于下层"；
        「批量分解」也搬到这一层，跟分类挨着（原来压在最下面，还得往下找）。
     ③ 内容只有格子：原来那串"一行一件"的列表撤掉了，点格子进详情。
     穿在角色身上的装备不算背包物品——这里不出现、也不占格，卸下来才回得到格子。 */
  function bagEquipList() {
    const worn = equippedUidSet(C().S);
    let shown = C().inventoryEquips().filter(eq => !worn.has(eq.uid));
    if (equipFilter === 'SSR') shown = shown.filter(e => ['SSR', 'UR'].includes(e.rarity));
    else if (equipFilter !== 'all') shown = shown.filter(e => e.slot === equipFilter);
    if (equipCatFilter === 'normal') shown = shown.filter(e => !e.set && !e.classSet && !e.charId);
    else if (equipCatFilter === 'world') shown = shown.filter(e => !!e.set);
    else if (equipCatFilter === 'class') shown = shown.filter(e => !!e.classSet);
    else if (equipCatFilter === 'sig') shown = shown.filter(e => !!e.charId);
    return shown;
  }
  function equipFilterBar() {
    const filters = [['all', '全部'], ['weapon', '武器'], ['armor', '胸甲'], ['head', '头部'], ['hands', '手部'], ['legs', '腿部'], ['accessory', '饰品'], ['SSR', 'SSR+']];
    const catFilters = [['all', '全部'], ['normal', '普通'], ['world', '世界套装'], ['class', '职业套装'], ['sig', '专属']];
    const u = C().bagUsage();
    return `
      <div class="pill-tabs tight mb2">${catFilters.map(([k, n]) => `<div class="pill sm ${equipCatFilter === k ? 'active' : ''}" data-ecat="${k}">${n}</div>`).join('')}</div>
      <div class="pill-tabs tight mb2">${filters.map(([k, n]) => `<div class="pill sm ${equipFilter === k ? 'active' : ''}" data-efilter="${k}">${n}</div>`).join('')}</div>
      <div class="eq-bar" data-eqpage="1">
        <span>未穿戴 ${u.eqUsed} / ${u.eqCap} 格</span>
        ${batchMode
          ? '<span class="note push">批量分解中 · 点格子挑选</span>'
          : '<button class="btn small ghost push" data-batchon>🧹 批量分解</button>'}
      </div>`;
  }
  function equipBatchBar() {
    if (!batchMode) return '';
    return `
      <div style="height:104px"></div>
      <div class="batch-bar">
        <div class="bb-row mb2">
          <span class="note">快选：</span>
          ${['N', 'R', 'SR'].map(r => `<button class="btn small ghost" data-bsel="${r}">${r}</button>`).join('')}
          <button class="btn small ghost" data-bclear>清空</button>
        </div>
        <div class="bb-row">
          <span style="font-size:12px" data-binfo></span>
          <span style="margin-left:auto"></span>
          <button class="btn small primary" data-bgo>⚡ 分解</button>
          <button class="btn small ghost" data-batchoff>取消</button>
        </div>
      </div>`;
  }
  function equipScreen() {
    const shown = bagEquipList();
    return `${equipFilterBar()}
      <div class="card mb3">${bagPoolGrid('equip')}</div>
      <div class="hint">${shown.length ? `筛出 ${shown.length} 件` : ''}</div>
      ${equipBatchBar()}`;
  }
  function equipDetail(uid, wrap) {
    const S = C().S;
    const eq = S.equips[uid];
    if (!eq) return;
    const cost = C().enhanceCost(eq);
    const rate = eq.enhance < 20 ? Math.round(D.ENHANCE_RATE[eq.enhance] * 100) : 0;
    const set = D.SETS[eq.set];
    const cs = eq.classSet ? D.CLASS_SETS[eq.classSet] : null;
    const equippedBy = Object.entries(S.equipped).find(([cid, slots]) => Object.values(slots).includes(uid));
    const catLine = eq.charId
      ? `专属装备 · 仅限 ${cname(eq.charId)} 装备${eq.sigText ? ' · ' + eq.sigText : ''}`
      : cs ? `${cs.name}（${cs.text}）· 限${D.KIND_NAMES[eq.classSet]}定位激活`
      : set ? `${set.name}（${set.text}）`
      : '普通装备';
    const w = showPanel(wrap, `${eq.name}`, `
      <div class="mb3">
        <span class="rtext-${eq.rarity}" style="font-size:17px;font-weight:800">${eq.rarity}</span>
        <b style="font-size:17px"> ${eq.name} <span style="color:var(--gold)">+${eq.enhance}</span></b>
        <div class="hint mt1">${D.EQUIP_SLOTS[eq.slot]} · ${catLine}${equippedBy ? ` · ${cname(equippedBy[0])}装备中` : ''}</div>
      </div>
      <div class="skill-row"><div class="sdesc" style="font-size:12px;color:var(--text)">${equipBrief(eq)}</div></div>
      <div class="section-title">强化（+${eq.enhance}/20）</div>
      <div class="btn-row">
        <button class="btn small" data-enh="1" ${eq.enhance >= 20 ? 'disabled' : ''}>强化（◈${fmt(cost.points)} + ◆${cost.otherworld} · ${rate}%）</button>
      </div>
      <div class="section-title">操作</div>
      <div class="btn-row">
        <button class="btn small" data-equipto="1">装备给伙伴</button>
        <button class="btn small ${eq.lock ? 'primary' : 'ghost'}" data-lock="1">${eq.lock ? '🔒 已锁定' : '🔓 锁定保护'}</button>
        <button class="btn small ghost" data-decomp="1" ${eq.lock ? 'disabled' : ''}>分解（◆${D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3}）</button>
      </div>
    `);
    w.querySelector('[data-lock]').onclick = () => {
      const r = C().toggleEquipLock(uid);
      toast(r.lock ? '🔒 已锁定这件装备' : '🔓 已解锁');
      sfx('click');
      equipDetail(uid, w); render();
    };
    w.querySelector('[data-enh]').onclick = () => {
      const r = C().enhance(uid);
      toast(r.msg);
      sfx(r.ok ? 'success' : 'fail');
      equipDetail(uid, w); renderTopbar();
    };
    w.querySelector('[data-decomp]').onclick = () => {
      closeModal(w);
      confirmBox('分解装备', `确定分解 <b class="rtext-${eq.rarity}">${eq.name} +${eq.enhance}</b>？将获得 ◆${D.DECOMPOSE_GAIN[eq.rarity] + eq.enhance * 3}`, () => {
        const r = C().decompose(uid);
        if (r.ok) toast(`分解成功，获得 ◆${r.gain}`);
        render(); renderTopbar();
      });
    };
    w.querySelector('[data-equipto]').onclick = () => {
      closeModal(w);
      const wearer = C().equipWearer(uid);   // 现在这件穿在谁身上（一件装备只有一个人穿）
      const canPlayer = D.PLAYER_SLOTS.includes(eq.slot);
      const candidates = (eq.charId ? [eq.charId] : (canPlayer ? ['@player'] : []).concat(Object.keys(S.chars)))
        .filter(id => C().canEquip(id, eq));
      const w2 = modal('装备给…', (wearer ? `<div class="hint mb2">现在穿在 <b>${cname(wearer)}</b> 身上</div>` : '')
        + candidates.map(id => {
        if (id === '@player') {
          return `<div class="list-row tap" data-to="@player">
            ${charAvatar('@player', 36)}
            <div class="grow"><div class="t1">${cname('@player')}（主角）${wearer === '@player' ? ' <span class="tag" style="color:var(--gold)">当前穿戴</span>' : ''}</div><div class="t2">Lv.${S.player.level} · 战力${fmt(C().playerPower())}</div></div>
          </div>`;
        }
        const ch = D.charById[id];
        return `<div class="list-row" data-to="${id}" style="cursor:pointer">
          ${charAvatar(id, 36)}
          <div class="grow"><div class="t1">${cname(id)}${wearer === id ? ' <span class="tag" style="color:var(--gold)">当前穿戴</span>' : ''}</div><div class="t2">Lv.${S.chars[id].lv} · ${ch.role}</div></div>
        </div>`;
      }).join('') || '<div class="empty">没有可穿戴该装备的伙伴</div>');
      w2.querySelectorAll('[data-to]').forEach(el => el.onclick = () => {
        const from = C().equipWearer(uid);
        if (C().equipItem(el.dataset.to, uid)) toast(from && from !== el.dataset.to ? `已装备（从 ${cname(from)} 身上取下）` : '已装备');
        else toast('该伙伴无法穿戴此装备');
        closeModal(w2);
        render();
      });
    };
  }

  /* ================= 招募 ================= */
  // 所有入口统一走这里：没解锁就给提示，不许绕过解锁直接开招募
  function openRecruit(wrap) {
    if (!C().isUnlocked('recruit')) { toast('🔒 ' + C().unlockTip('recruit'), 2400); return null; }
    return recruitModal(wrap);
  }
  function recruitModal(wrap) {
    const S = C().S;
    const free = C().freeRecruitAvailable();
    const w = showPanel(wrap, '招募伙伴', `
      <div class="card mb3">
        <h3>每日免费 <span class="sub">${free ? '今日可领' : '明天再来'}</span></h3>
        
        <button class="btn primary block" data-free="1" ${free ? '' : 'disabled'}>免费招募 1 次</button>
      </div>
      ${Object.entries(D.RECRUIT_POOLS).map(([pid, p]) => {
      const costText = Object.entries(p.cost).map(([k, v]) => `${curIcon(k)}${fmt(v)}`).join('');
      const tenText = Object.entries(p.ten || p.cost).map(([k, v]) => `${curIcon(k)}${fmt(v)}`).join('');
      const pv = C().pityView(pid);
      const up = pid === 'limited' ? D.recruitUpChar() : null;
      const tk = C().ticketOf(pid);
      const tkName = tk ? (D.ITEMS[tk.id] || {}).name || tk.id : '';
      // 按钮文案如实反映"这次到底扣什么"：够券就写券，不够才写货币
      const oneLabel = tk && tk.n >= 1 ? `抽 1 次（🎫 ${tkName}×1）` : `抽 1 次（${costText}）`;
      const tenLabel = tk && tk.n >= 10 ? `十连（🎫 ${tkName}×10）` : `十连（${tenText}·保底SR）`;
      return `<div class="card pool-card mb3">
        <h3>${p.name} <span class="tag" style="color:var(--gold);border-color:var(--gold)">${p.tag}</span>
          <span class="sub">用 ${Object.keys(p.cost).map(curName).join(' / ')}</span></h3>
        <div style="font-size:11px;color:var(--dim);line-height:1.75;margin-bottom:8px">${p.desc}</div>
        ${tk ? `<div class="ticket-row ${tk.n > 0 ? 'has' : ''}">
          <span>🎫 ${tkName} ×<b>${tk.n}</b></span>
          <span class="ticket-hint">${tk.n > 0 ? '有券先用券，货币不动' : `没券了，本次会花 ${Object.keys(p.cost).map(curName).join(' / ')}`}</span>
        </div>` : ''}
        <div class="rate-row">${Object.entries(p.rates).map(([r, v]) => `<span class="rtext-${r}">${r} ${(v * 100).toFixed(1)}%</span>`).join('')}</div>
        ${up ? `<div class="up-banner">本期 UP：<b>${esc(up.name)}</b> · 本期只出「${up.faction}」阵营（SSR 里一半是他，50 抽必出）</div>` : ''}
        ${pv ? `<div class="pity-row">
          <span>SSR 保底 <b>${pv.ssr.n}</b>/${pv.ssr.cap}</span>
          <span>UR 保底 <b>${pv.ur.n}</b>/${pv.ur.cap}</span>
          ${pv.up ? `<span style="color:var(--gold)">UP 保底 <b>${pv.up.n}</b>/${pv.up.cap}</span>` : ''}
        </div>` : `<div class="pity-row"><span>没有保底，纯攒碎片</span></div>`}
        <div class="btn-row">
          <button class="btn small" data-pull1="${pid}">${oneLabel}</button>
          <button class="btn small gold" data-pull10="${pid}">${tenLabel}</button>
        </div>
      </div>`;
    }).join('')}
      <button class="btn ghost block mb3" data-rates="1">📊 招募概率公示（每一档出率与保底规则）</button>
      ${S.ssrTicket > 0 ? `<button class="btn gold block" data-ssrpick="1">🎫 使用SSR自选券（剩 ${S.ssrTicket}）</button>` : ''}
    `);
    const showResults = results => {
      sfx(results.some(x => ['SSR', 'UR'].includes(x.rarity)) ? 'level' : 'coin');
      // 就地换成结果页：不重建遮罩，避免每次抽卡整屏闪一下
      updateModal(w, '招募结果', `
        <div class="char-grid">${results.map(r => {
        const ch = D.charById[r.id];
        return `<div class="char-card rarity-${r.rarity} ${['SSR', 'UR'].includes(r.rarity) ? 'shine' : ''}">
          ${r.isUp ? '<span class="inparty" style="background:var(--gold);color:#241c08">UP</span>' : ''}
          ${charAvatar(r.id)}
          <div class="cname">${cname(r.id)}</div>
          <div class="cmeta">${r.isNew ? '<span style="color:var(--green)">NEW</span>' : `碎片+${r.shards}`}</div>
        </div>`;
      }).join('')}</div>
        <button class="btn primary block mt4" data-back>继续招募</button>`);
      w.querySelector('[data-back]').onclick = () => recruitModal(w);
      refresh();
    };
    w.querySelector('[data-free]').onclick = () => {
      const r = C().freeRecruit();
      if (r.error) { failToast(r.error); return; }
      showResults([r]);
    };
    w.querySelectorAll('[data-pull1]').forEach(b => b.onclick = () => {
      const pid = b.dataset.pull1;
      const cost = D.RECRUIT_POOLS[pid].cost;
      confirmSpend(cost, '确认招募', `卡池：${D.RECRUIT_POOLS[pid].name} · 1 次`, () => {
        const r = C().recruitOnce(pid);
        if (r.error) { failToast(r.error, b); return; }
        showResults([r]);
      });
    });
    w.querySelectorAll('[data-pull10]').forEach(b => b.onclick = () => {
      const pid = b.dataset.pull10;
      const cost = D.RECRUIT_POOLS[pid].ten || D.RECRUIT_POOLS[pid].cost;
      confirmSpend(cost, '确认十连', `${D.RECRUIT_POOLS[pid].name} · 10 次（保底 SR，必出更高稀有度）`, () => {
        const r = C().recruitTen(pid);
        if (r.error) { failToast(r.error, b); return; }
        showResults(r.results);
      });
    });
    const tk = w.querySelector('[data-ssrpick]');
    if (tk) tk.onclick = () => ssrPickModal(w);
    const rb = w.querySelector('[data-rates]');
    if (rb) rb.onclick = () => recruitRatesModal(w);
    return w;
  }
  // 概率公示（对标《道友修仙》：它在招募界面直接把"37% 血脉 5%、25% 血脉 15%…"写出来）。
  // 本页所有数字都从 D.RECRUIT_POOLS.rates / D.PITY 派生，和真正抽卡用的那份数据同源。
  function recruitRatesModal(wrap) {
    const rows = Object.entries(D.RECRUIT_POOLS).map(([pid, p]) => {
      const pv = C().pityView(pid);
      const tk = C().ticketOf(pid);
      const tkName = tk ? (D.ITEMS[tk.id] || {}).name || tk.id : '';
      const rate = D.RARITIES.filter(r => p.rates[r])
        .map(r => `<span class="rtext-${r}">${r} ${(p.rates[r] * 100).toFixed(1)}%</span>`).join('');
      const cost = Object.entries(p.cost).map(([k, v]) => `${curIcon(k)}${fmt(v)}`).join(' + ');
      const ten = Object.entries(p.ten || p.cost).map(([k, v]) => `${curIcon(k)}${fmt(v)}`).join(' + ');
      const left = pv ? `<div class="pity-row">
        <span>SSR 还差 <b>${Math.max(0, pv.ssr.cap - pv.ssr.n)}</b> 抽</span>
        <span>UR 还差 <b>${Math.max(0, pv.ur.cap - pv.ur.n)}</b> 抽</span>
        ${pv.up ? `<span style="color:var(--gold)">UP 还差 <b>${Math.max(0, pv.up.cap - pv.up.n)}</b> 抽</span>` : ''}
      </div>` : '';
      return `<div class="card mb3">
        <h3>${p.name} <span class="sub">${p.tag} · 用 ${Object.keys(p.cost).map(curName).join(' / ')}</span></h3>
        <div class="rate-row">${rate}</div>
        <div class="kv"><span class="k">单抽</span><span>${cost}${tk ? ` · 或 🎫${tkName}×1（现有 ${tk.n} 张）` : ''}</span></div>
        <div class="kv"><span class="k">十连</span><span>${ten}${tk ? ` · 或 🎫${tkName}×10` : ''} · 保底至少 1 个 SR</span></div>
        <div style="font-size:11px;color:var(--dim);line-height:1.7;margin-top:6px">${D.pityText(pid)}</div>
        ${left}
      </div>`;
    }).join('');
    const w = showPanel(wrap, '概率公示', `
      <div class="card" style="margin-bottom:10px;border-color:#ffd76a55">
      </div>
      ${rows}
      <button class="btn ghost block" style="margin-top:4px" data-back>‹ 返回招募</button>`);
    w.querySelector('[data-back]').onclick = () => recruitModal(w);
    return w;
  }
  function ssrPickModal(wrap) {
    const ssrs = D.characters.filter(c => c.rarity === 'SSR' && !c.hidden);
    const w = showPanel(wrap, 'SSR 自选（剩 ' + C().S.ssrTicket + ' 张）', `
      <div class="note mb3">选一名 SSR 伙伴入队；已拥有的伙伴会转成碎片。</div>
      <div class="char-grid">${ssrs.map(ch => `
      <div class="char-card rarity-SSR" data-pickssr="${ch.id}">${charAvatar(ch.id)}<div class="cname">${esc(ch.name)}</div><div class="cmeta">${ch.role} · ${ch.faction}</div></div>`).join('')}</div>
      <button class="btn ghost block mt4" data-back>‹ 返回招募</button>`);
    w.querySelector('[data-back]').onclick = () => recruitModal(w);
    w.querySelectorAll('[data-pickssr]').forEach(el => el.onclick = () => {
      const r = C().ssrTicketUse(el.dataset.pickssr);
      toast(r.msg);
      refresh(); renderTopbar();
      const left = C().S.ssrTicket;
      updateModal(w, 'SSR 自选', `
        <div class="reward-chips" style="margin:16px 0;justify-content:center"><span class="reward-chip" style="font-size:14px">${esc(r.msg)}</span></div>
        <div style="text-align:center;font-size:12px;color:var(--dim);margin-bottom:12px">剩余自选券 ${left} 张</div>
        <button class="btn primary block" data-back>返回招募</button>`);
      w.querySelector('[data-back]').onclick = () => recruitModal(w);
    });
    return w;
  }

  /* ================= 商店 ================= */
  let shopTab = 'god';
  function shopModal(tab, wrap) {
    shopTab = tab || shopTab;
    const S = C().S;
    const shop = D.SHOPS[shopTab];
    const info = D.CURRENCY_INFO[shop.currency] || {};
    const w = showPanel(wrap, '兑换大厅', `
      <div class="pill-tabs">${Object.entries(D.SHOPS).map(([k, s]) => `<div class="pill ${shopTab === k ? 'active' : ''}" data-shoptab="${k}">${s.name}（${curIcon(s.currency)}${fmt(S.cur[s.currency])}）</div>`).join('')}</div>
      <div style="font-size:11px;color:var(--dim);line-height:1.7;margin:2px 2px 8px">
        本店用 ${curIcon(shop.currency)}${curName(shop.currency)} 结算 · 用途：${info.use || '—'}
      </div>
      ${shop.items.map((it, i) => {
        const key = shopTab + '_' + i + '_' + C().dailyDate();
        const bought = S.shop.bought[key] || 0;
        const soldOut = it.stock > 0 && bought >= it.stock;
        const req = C().shopReq(it);
        return `<div class="list-row" style="${req.ok ? '' : 'opacity:.5'}">
          <div class="grow"><div class="t1">${it.name}</div>
          <div class="t2">${curIcon(shop.currency)} ${fmt(it.price)}${it.stock > 0 ? ` · 每日限${it.stock}（已购${bought}）` : ''}${req.ok ? '' : ` · 🔒 ${req.req}后上架`}</div></div>
          <button class="btn small" data-buy="${i}" ${soldOut || !req.ok ? 'disabled' : ''}>${req.ok ? '购买' : '未解锁'}</button>
        </div>`;
      }).join('')}
    `);
    w.querySelectorAll('[data-shoptab]').forEach(el => el.onclick = () => shopModal(el.dataset.shoptab, w));
    w.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const idx = +b.dataset.buy;
      const it = shop.items[idx];
      confirmSpend({ [shop.currency]: (it && it.price) || 0 }, '确认购买', it ? `商品：${it.name}` : '', () => {
        const r = C().buyShopItem(shopTab, idx);
        if (r.ok) toast(r.msg); else failToast(r.msg, b);
        shopModal(shopTab, w);
        renderTopbar();
      });
    });
    return w;
  }

  /* ================= 建筑 ================= */
  function buildingsModal(wrap) {
    const S = C().S;
    const w = showPanel(wrap, '基地建设', `<div class="hint mb2">全部消耗 ◈点数</div>` + D.BUILDINGS.map(b => {
      const lv = S.buildings[b.id];
      const cost = D.buildingCost(b.id, lv);
      return `<div class="card mb3">
        <h3>${b.name} <span class="sub">Lv.${lv}/50</span></h3>
        <div class="hint mb2">${b.desc}</div>
        <button class="btn small" data-bup="${b.id}" ${lv >= 50 ? 'disabled' : ''}>升级（◈${fmt(cost)}）</button>
      </div>`;
    }).join(''));
    w.querySelectorAll('[data-bup]').forEach(btn => btn.onclick = () => {
      const r = C().upgradeBuilding(btn.dataset.bup);
      toast(r.msg);
      buildingsModal(w);
      renderTopbar();
    });
    return w;
  }

  /* ================= 灯阁权限（对标《道友修仙》的"洞府"） ================= */
  /* ================= 药园（对标《道友修仙》洞府里的"药园"） ================= */
  // 一块地收什么：主产 + 稀有掉落概率，写成一行的文字（"说明与实装同源"：直接读 GARDEN 数据）
  function gardenYieldText(g) {
    const nm = id => (D.ITEMS[id] || {}).name || id;
    let s = `${nm(g.out.item)}×${g.out.n}`;
    if (g.extra) s += ` · ${Math.round(g.extra.p * 100)}% 出 ${nm(g.extra.item)}×${g.extra.n}`;
    return s;
  }
  function gardenModal(wrap) {
    const plots = C().gardenState();
    const busy = plots.filter(p => p.plot).length;
    const body = `
      <div class="card" style="border-color:#e6b64c44">
        <h3>药园 <span class="sub">${busy} / ${D.GARDEN_PLOTS} 块在用</span></h3>
  <div class="note">有几率出稀有物（兽魂石 / 装备箱）</div>
      </div>
      ${plots.map(p => `<div class="list-row">
        <span class="tag">第 ${p.idx + 1} 块</span>
        <div class="grow">
          <div class="t1">${p.plot ? p.kind.name : '空地'}</div>
          <div class="t2">${p.plot
            ? (p.ready ? `已成熟，可以收了 → 收 ${gardenYieldText(p.kind)}` : `成熟还需 ${formatDuration(Math.ceil(p.leftMs / 1000))} → 收 ${gardenYieldText(p.kind)}`)
            : `可种「${p.kind.name}」：◈${fmt(p.kind.points)} · ${Math.round(p.kind.sec / 60)} 分钟 → 收 ${gardenYieldText(p.kind)}`}</div>
        </div>
        ${p.plot
          ? `<button class="btn small ${p.ready ? 'gold' : ''}" data-harvest="${p.idx}" ${p.ready ? '' : 'disabled'}>${p.ready ? '收获' : '未熟'}</button>`
          : `<button class="btn small" data-plant="${p.kind.id}|${p.idx}">播种</button>`}
      </div>`).join('')}
      <div class="btn-row mt3">
        <button class="btn small ghost" data-harvestall="1">一键收成熟的地</button>
      </div>`;
    const w = showPanel(wrap, '药园', body);
    const redraw = () => { gardenModal(w); renderTopbar(); };
    w.querySelectorAll('[data-plant]').forEach(b => b.onclick = () => {
      const [gid, idx] = b.dataset.plant.split('|');
      const r = C().plantGarden(+idx, gid);
      toast(r.msg, 2400);
      if (r.ok) redraw();
    });
    w.querySelectorAll('[data-harvest]').forEach(b => b.onclick = () => {
      const r = C().harvestGarden(+b.dataset.harvest);
      toast(r.msg, 2600);
      if (r.ok) { sfx('coin'); redraw(); }
    });
    w.querySelector('[data-harvestall]').onclick = () => {
      const r = C().harvestAllGarden();
      toast(r.msg, 2600);
      if (r.ok) { sfx('coin'); redraw(); }
    };
    return w;
  }

  /* ================= 斗法台（对标《道友修仙》的斗法 / Arena） =================
     单机没有真 PVP，所以守擂者按你自己的队伍战力换算：永远打得动，也永远有压力。 */
  function arenaModal(wrap) {
    const st = C().arenaState();
    const body = `
      <div class="card" style="border-color:#e6b64c44">
        <h3>斗法台 <span class="sub">第 ${st.floor} 台 · 历史最高 ${st.best} 台</span></h3>
        <div class="note">每天 <b>${st.cap}</b> 次机会，
          赢了升一台并拿 ◆异界结晶 + ♜深井徽记，输了退一台（次数照常消耗，不会卡死在第 1 台）。</div>
        <div class="kv mt2"><span class="k">今日剩余</span><span>${st.left} / ${st.cap}</span></div>
        <div class="kv"><span class="k">本台奖励</span><span style="color:var(--gold)">◆${fmt(st.reward.otherworld)} · ♜${st.reward.corridor}</span></div>
        <button class="btn primary block mt3" data-arena="1" ${st.left > 0 ? '' : 'disabled'}>${st.left > 0 ? `挑战第 ${st.floor} 台` : '今日次数已用完'}</button>
      </div>
      <div class="card">
        <h3>本台守擂者</h3>
        ${st.enemies.map(e => `<div class="list-row">
          <div class="grow"><div class="t1">${esc(e.name)}${e.isBoss ? ' <span class="tag">擂主</span>' : ''}</div>
          <div class="t2">HP ${fmt(e.hp)} · 攻 ${fmt(e.atk)} · 防 ${fmt(e.def)} · 速 ${e.spd}</div></div>
        </div>`).join('')}
      </div>
      `;
    const w = showPanel(wrap, '斗法台', body);
    const btn = w.querySelector('[data-arena]');
    if (btn) btn.onclick = () => {
      const cur = C().arenaState();
      if (cur.left <= 0) { toast('今日斗法次数已用完'); return; }
      const allies = buildAllies(null, null);
      if (!allies.length) { toast('没有可出战的成员'); return; }
      startBattle({
        title: `斗法台 · 第 ${cur.floor} 台`,
        allies, enemies: cur.enemies, worldId: null, maxRounds: 40,
        onEnd(win) {
          const r = C().arenaSettle(win);
          refresh(); renderTopbar();
          return { rewards: [], sub: r.msg || '', after: () => { arenaModal(w); } };
        },
      });
    };
    return w;
  }

  /* ================= 法宝（对标《道友修仙》的法宝） ================= */
  function fabaoModal(wrap) {
    const st = C().fabaoState();
    const on = st.on ? D.fabaoById(st.on) : null;
    const body = `
      <div class="card" style="border-color:#e6b64c44">
        <h3>法宝 <span class="sub">已得 ${st.own.length} / ${D.FABAO.length} 件</span></h3>
  <div class="note">主角同时只带 1 件 · 用 ◆异界结晶 购买</div>
        <div class="kv mt2"><span class="k">当前佩戴</span><span style="color:var(--gold)">${on ? `${on.name}（${on.desc}）` : '未佩戴'}</span></div>
      </div>
      ${D.FABAO.map(f => {
        const owned = st.own.includes(f.id), active = st.on === f.id;
        return `<div class="list-row" style="${owned ? '' : 'opacity:.85'}">
          <span class="tag rtext-${f.rarity}">${f.rarity}</span>
          <div class="grow">
            <div class="t1">${f.name}${active ? ' <span class="tag" style="color:var(--gold);border-color:#e6b64c77">佩戴中</span>' : ''}</div>
            <div class="t2">${f.desc}</div>
          </div>
          ${active ? `<button class="btn small ghost" data-faceoff="1">摘下</button>`
            : owned ? `<button class="btn small gold" data-fwear="${f.id}">佩戴</button>`
            : `<button class="btn small" data-fbuy="${f.id}" ${(C().S.cur.otherworld || 0) >= f.cost ? '' : 'disabled'}>◈→◆${fmt(f.cost)}</button>`}
        </div>`;
      }).join('')}`;
    const w = showPanel(wrap, '法宝', body);
    const redraw = () => { fabaoModal(w); renderTopbar(); };
    w.querySelectorAll('[data-fbuy]').forEach(b => b.onclick = () => {
      const r = C().buyFabao(b.dataset.fbuy);
      toast(r.msg, 2600);
      if (r.ok) { sfx('coin'); redraw(); }
    });
    w.querySelectorAll('[data-fwear]').forEach(b => b.onclick = () => {
      const r = C().wearFabao(b.dataset.fwear);
      toast(r.msg);
      if (r.ok) redraw();
    });
    const off = w.querySelector('[data-faceoff]');
    if (off) off.onclick = () => { C().wearFabao(null); toast('已摘下法宝'); redraw(); };
    return w;
  }

  /* ================= 坐骑（对标《道友修仙》的坐骑） =================
     法宝给"效果"、坐骑给"基础数值"，两者不冲突：一个管机制，一个管面板。 */
  function mountModal(wrap) {
    const st = C().mountState();
    const on = st.on ? D.mountById(st.on) : null;
    // 消耗文案里带货币图标（是 HTML），所以只能放正文，不能塞进 title 这类属性
    const costText = m => {
      const parts = Object.entries(m.cost).filter(([k]) => k !== 'mat' && k !== 'matN')
        .map(([k, v]) => `${curIcon(k)}${fmt(v)}`);
      if (m.cost.mat) parts.push(`${(D.ITEMS[m.cost.mat] || {}).name || m.cost.mat}×${m.cost.matN}`);
      return parts.join(' + ');
    };
    const body = `
      <div class="card" style="border-color:#e6b64c44">
        <h3>坐骑 <span class="sub">已驯服 ${st.own.length} / ${D.MOUNTS.length} 匹</span></h3>
        <div class="note"><b>全队通用，伙伴也吃</b>。
          同时只骑 1 匹，随时能换；花 ◈点数 + 强化材料驯服，高阶坐骑额外花 ◆异界结晶。</div>
        <div class="kv mt2"><span class="k">当前乘骑</span><span style="color:var(--gold)">${on ? `${on.name}（${on.desc}）` : '未乘骑'}</span></div>
      </div>
      ${D.MOUNTS.map(m => {
        const owned = st.own.includes(m.id), active = st.on === m.id;
        const curCost = Object.assign({}, m.cost); delete curCost.mat; delete curCost.matN;
        const can = C().canAfford(curCost) && (!m.cost.mat || (C().S.items[m.cost.mat] || 0) >= m.cost.matN);
        return `<div class="list-row" style="${owned ? '' : 'opacity:.85'}">
          <span class="tag rtext-${m.rarity}">${m.rarity}</span>
          <div class="grow">
            <div class="t1">${m.name}${active ? ' <span class="tag" style="color:var(--gold);border-color:#e6b64c77">乘骑中</span>' : ''}</div>
            <div class="t2">${m.desc}</div>
            ${owned ? '' : `<div class="t2">驯服需要 ${costText(m)}</div>`}
          </div>
          ${active ? `<button class="btn small ghost" data-moff="1">下坐骑</button>`
            : owned ? `<button class="btn small gold" data-mwear="${m.id}">乘骑</button>`
            : `<button class="btn small" data-mbuy="${m.id}" ${can ? '' : 'disabled'}>驯服</button>`}
        </div>`;
      }).join('')}`;
    const w = showPanel(wrap, '坐骑', body);
    const redraw = () => { mountModal(w); renderTopbar(); render(); };
    w.querySelectorAll('[data-mbuy]').forEach(b => b.onclick = () => {
      const r = C().buyMount(b.dataset.mbuy);
      toast(r.msg, 2800);
      if (r.ok) { sfx('coin'); redraw(); }
    });
    w.querySelectorAll('[data-mwear]').forEach(b => b.onclick = () => {
      const r = C().wearMount(b.dataset.mwear);
      toast(r.msg);
      if (r.ok) redraw();
    });
    const off = w.querySelector('[data-moff]');
    if (off) off.onclick = () => { C().wearMount(null); toast('已下坐骑'); redraw(); };
    return w;
  }

  /* ================= 求签（对标《道友修仙》的求签） =================
     每天上线第一件事：摇一签，看今天的挂机加成与手气。签文当天有效。 */
  function signModal(wrap) {
    const st = C().signState();
    const pick = st.pick;
    const body = `
      <div class="card" style="border-color:#e6b64c66">
        <h3>求签 <span class="sub">每天免费 1 次</span></h3>
        <div class="note">签文分五档（大吉 → 末吉），给<b>当天的挂机加成</b>，只算当天，
          隔天自动失效——上线先求一签，再看今天要打哪儿。</div>
        ${st.canDraw
          ? `<button class="btn gold block mt3" data-sign-draw="1">🎋 摇 一 签</button>`
          : `<div class="note mt2" style="color:var(--gold)">今日已求：【${pick ? pick.tier : st.tier}】${pick ? ' ' + pick.text : ''}</div>
             <div class="hint mt1">今日挂机产出 +${Math.round(st.idlePct * 100)}%</div>`}
        <div class="hint mt2">累计求签 ${st.total} 次 · 每天 0 点重置</div>
      </div>
      <div class="card">
        <h3>五档签文 <span class="sub">能摇到哪一档在摇之前就知道</span></h3>
        ${D.SIGNS.map(s => `<div class="list-row static">
          <span class="tag" style="color:var(--gold)">${s.tier}</span>
          <div class="grow"><div class="t1">${s.text}</div>
            <div class="t2">挂机 +${Math.round(s.idlePct * 100)}% · ${rewardText(s.gain)}</div></div>
          <span class="t2">${Math.round(s.weight)}%</span>
        </div>`).join('')}
        <div class="hint mt1">权重合计 ${D.SIGNS.reduce((a, s) => a + s.weight, 0)}%</div>
      </div>`;
    const w = showPanel(wrap, '求签', body);
    const btn = w.querySelector('[data-sign-draw]');
    if (btn) btn.onclick = () => {
      const r = C().drawSign();
      if (!r.ok) { failToast(r.msg, btn); return; }
      sfx('level');
      toast(r.msg, 3200);
      signModal(w);
      renderTopbar(); render();
    };
    return w;
  }

  /* ================= 血统（境界线跟着血统走） =================
     对标《道友修仙》：境界不是人人相同的公共阶梯，而是跟着你选的路走。
     所以"选血统"被提到开局第一步——没血统就没有境界，也不再显示"凡体"这种占位。 */
  function bloodlineModal(wrap, opts) {
    opts = opts || {};
    const S = C().S;
    const cur = S.player.bloodline;
    if (!cur) {
      const body = `
        <div class="card" style="border-color:#e6b64c66">
          <h3>选择血统 <span class="sub">选定后不可更改</span></h3>
        </div>
        ${Object.entries(D.BLOODLINES).map(([id, bl]) => `
          <div class="card">
            <h3>${id} <span class="sub">${bl.desc}</span></h3>
            <div class="kv"><span class="k">境界线</span><span>${bl.realms.join(' → ')}</span></div>
            <div class="hint">每大境分初期 / 中期 / 后期 / 大圆满，共 ${D.REALM_STAGE_COUNT} 阶。</div>
            <button class="btn gold block mt3" data-pbl="${id}">觉醒 ${id} 血统</button>
          </div>`).join('')}`;
      const w = opts.first ? modal('选择血统', body, { center: true, sticky: true }) : modal('血统', body);
      w.querySelectorAll('[data-pbl]').forEach(b => b.onclick = () => {
        const id = b.dataset.pbl;
        confirmBox('确认血统', `选择「${id}」后不可更改，境界线将从「${D.realmName(id, 0)}」开始。确定吗？`, () => {
          const r = C().choosePlayerBloodline(id);
          toast(r.msg, 2800);
          if (!r.ok) return;
          closeModal(w);
          render(); renderTopbar();
        });
      });
      return w;
    }
    const st = C().realmState();
    const chain = C().realmChainOf();
    const groups = (D.BLOODLINES[cur].realms || []).map((mj, mi) => {
      const cells = chain.filter(c => c.major === mi).map(c => {
        const done = c.idx < st.realm, curS = c.idx === st.realm;
        // 成功率直接写在小字里：手机上没法悬停看 title（写了等于没有）
        const rate = Math.round(D.REALMS[c.idx].rate * 100);
        return `<span class="step-chip ${done ? 'done' : curS ? 'cur' : ''}" data-step="${c.idx}">
          <b>${D.REALM_TIERS[c.tier]}</b><i>${done ? '已成' : `Lv.${D.REALMS[c.idx].lv} · ${rate}%`}</i></span>`;
      }).join('');
      return `<div class="card" style="margin-bottom:8px">
        <h3>${mi + 1}. ${mj}</h3><div class="step-row">${cells}</div></div>`;
    }).join('');
    const body = `
      <div class="card" style="border-color:#e6b64c66">
        <h3>${cur}血统 <span class="sub">Lv.${S.player.bloodlineLv} / ${D.BLOODLINE_MAX}</span></h3>
        <div class="note">${D.BLOODLINES[cur].desc}</div>
        <div class="kv mt2"><span class="k">当前境界</span><span style="color:var(--gold)">${st.curName}（第 ${Math.min(st.realm + 1, D.REALM_STAGE_COUNT)} / ${D.REALM_STAGE_COUNT} 阶）</span></div>
        <div class="kv"><span class="k">境界加成</span><span style="color:var(--gold)">+${(st.bonusPct * 100).toFixed(1)}%</span></div>
      </div>
      <div class="card">
        <h3>血统升级</h3>
        <div class="kv"><span class="k">资源</span><span>血统结晶 ${fmt(S.cur.bloodCrystal || 0)} · ◈${fmt(S.cur.points)}</span></div>
        <div class="btn-row mt2">
          <button class="btn small" data-bloodup="1">升 1 级（${S.player.bloodlineLv >= D.BLOODLINE_MAX ? '已满' : '消耗随等级涨'}）</button>
          <button class="btn small ghost" data-act="open-realm">看境界 · 渡劫</button>
        </div>
      </div>
      <div class="section-title">境界线 · ${D.BLOODLINES[cur].realms.length} 大境 × ${D.REALM_TIERS.length} 小阶</div>
      ${groups}`;
    const w = showPanel(wrap, `${cur}血统 · 境界线`, body);
    const up = w.querySelector('[data-bloodup]');
    if (up) up.onclick = () => {
      const r = C().upgradePlayerBloodline();
      toast(r.msg, 2200);
      if (r.ok) { bloodlineModal(w); renderTopbar(); }
    };
    return w;
  }

  /* ================= 灯阁评级（对标《道友修仙》的“宗门等级”） =================
     它那条线是 321 级、随主线推进自动涨、每级抬全队属性。我们照机制做，
     强调一句：**不用手动点**——打关卡、打赢战斗、挂机都会涨，满了自动升。
     意义在于让"打关卡"除了掉装备之外，还有一条挡不住的长期回报。 */
  function sectModal(wrap) {
    const info = C().sectInfo();
    const g = info.gain;
    const body = `
      <div class="card" style="border-color:#ffd76a55">
        <h3>灯阁评级 <span class="sub">Lv.${info.lv} / ${info.max}</span></h3>
  <div class="note">每级 全队全属性 +${(C().realmBonusPct() * 100).toFixed(1)}%（转生保留）</div>
        <div class="bar exp mt3"><i style="width:${info.maxed ? 100 : Math.min(100, info.exp / info.need * 100)}%"></i></div>
        <div class="kv"><span class="k">${info.maxed ? '已到顶' : '距离下一级'}</span>
          <span>${info.maxed ? '满级' : `${fmt(info.exp)} / ${fmt(info.need)}`}</span></div>
      </div>
      <div class="card">
        <h3>当前生效</h3>
        <div class="kv"><span class="k">全队全属性</span><span style="color:var(--gold)">+${(info.pct * 100).toFixed(1)}%</span></div>
        <div class="kv"><span class="k">下一级变成</span><span>+${(info.nextPct * 100).toFixed(1)}%</span></div>
      </div>
      <div class="card">
        <h3>评级经验从哪来</h3>
        <div class="hint mb2">首通全额 · 重复刷一半</div>
        <div class="kv"><span class="k">通关 普通 / 困难 / 地狱</span><span style="white-space:nowrap">+${g.normal} / +${g.hard} / +${g.hell}</span></div>
        <div class="kv"><span class="k">每打赢一场战斗</span><span>+${g.win}</span></div>
        <div class="kv"><span class="k">挂机（在线 / 离线都算）</span><span>每分钟 +${g.perMin}</span></div>
      </div>`;
    return showPanel(wrap, '灯阁评级', body);
  }
  // 挂机游历奇遇（对标《道友修仙》的 YouLi）：挂满一段时间就出一条，点一下拿东西
  function travelModal(wrap) {
    const st = C().S.travel || {};
    const prog = C().travelProgress();
    const pend = C().pendingTravel();
    const body = `
      <div class="card" style="border-color:${pend ? '#ffd76a88' : 'var(--line)'}">
        <h3>游历奇遇 <span class="sub">已遇 ${st.got || 0} 次</span></h3>
        ${pend ? `
          <div class="event-desc">${pend.ico} <b>${pend.name}</b><br>${pend.desc}</div>
          <button class="btn primary block mt3" data-travel-claim>领取：${C().rewardTextOf(pend.effect)}</button>
        ` : `
  <div class="note">每累计 ${Math.round(prog.every / 60)} 分钟出一次奇遇</div>
          <div class="bar mt3"><i style="width:${Math.round(prog.pct * 100)}%"></i></div>
          <div class="kv"><span class="k">距离下一次</span><span>${Math.max(0, Math.round(prog.every - prog.sec))} 秒</span></div>
        `}
      </div>
      <div class="section-title">可能遇到什么（${D.TRAVELS.length} 种）</div>
      ${D.TRAVELS.map(t => `<div class="list-row">
        <span style="font-size:19px">${t.ico}</span>
        <div class="grow"><div class="t1">${t.name}</div><div class="t2">${t.desc}</div></div>
        <span class="hint">${C().rewardTextOf(t.effect)}</span>
      </div>`).join('')}`;
    const w = showPanel(wrap, '游历奇遇', body);
    const cb = w.querySelector('[data-travel-claim]');
    if (cb) cb.onclick = () => {
      const r = C().claimTravel();
      if (!r.ok) { toast(r.msg); return; }
      toast(`🎁 ${r.msg}`, 2600);
      sfx('coin');
      travelModal(w);   // 原地刷新：遮罩/页面不动，不闪屏
      renderTopbar();
    };
    return w;
  }
  /* ================= 秘术阁（对标《道友修仙》的 KeJi） =================
     对标它那套"每条线每级只加一点点、能一路修到顶"的长线，我们做成 42 条
     （战斗 33 条 + 挂机经济 9 条），消耗统一走 ◆异界结晶（它的 coinBase 那一路）。 */
  function kejiModal(wrap) {
    const S = C().S;
    const coin = S.cur[D.KEJI_COIN] || 0;
    const kb = C().kejiBonus();
    const total = D.KEJI.reduce((s, k) => s + C().kejiLv(k.id), 0);
    const maxTotal = D.KEJI.reduce((s, k) => s + k.max, 0);
    const body = `
      <div class="card" style="border-color:#ffd76a55">
        <h3>秘术阁 <span class="sub">已修 ${total} / ${maxTotal} 级</span></h3>
  <div class="note">升级只花 ◆异界结晶 · 前 8 条加战斗，后 4 条加挂机经济</div>
        <div class="kv mt2"><span class="k">◆异界结晶</span><span style="color:var(--gold)">${fmt(coin)}</span></div>
      </div>
      ${D.KEJI.map(k => {
        const lv = C().kejiLv(k.id);
        const cost = C().kejiCostOf(k.id);
        const cur = lv ? (k.rate * lv * 100) : 0;
        const next = cost === null ? cur : (k.rate * (lv + 1) * 100);
        const can = cost !== null && coin >= cost;
        return `<div class="list-row">
          <span style="font-size:19px">${k.ico}</span>
          <div class="grow">
            <div class="t1">${k.name} <span class="tag">Lv.${lv} / ${k.max}</span></div>
            <div class="t2">${k.info} 当前 <b style="color:var(--gold)">+${cur.toFixed(1)}%</b>
              ${cost === null ? '· 已满级' : `→ 下一级 +${next.toFixed(1)}%（需 ◆${fmt(cost)}）`}</div>
          </div>
          ${cost === null
            ? '<button class="btn small" disabled>满级</button>'
            : `<button class="btn small ${can ? 'gold' : ''}" data-keji="${k.id}" ${can ? '' : 'disabled'}>升 1 级</button>`}
        </div>`;
      }).join('')}
      <div class="card mt3">
        <h3>当前合计</h3>
        ${[['攻击', kb.combat.atkPct], ['生命', kb.combat.hpPct], ['防御', kb.combat.defPct], ['速度', kb.combat.spdPct],
           ['暴击率', kb.combat.critPct], ['暴击伤害', kb.combat.critDmg], ['技能伤害', kb.combat.skillPct], ['闪避', kb.combat.evaPct],
           ['挂机产出', kb.idlePct], ['经验获取', kb.expPct], ['掉落概率', kb.dropPct], ['离线效率', kb.offlinePct]]
          .filter(([, v]) => v)
          .map(([n, v]) => `<div class="kv"><span class="k">${n}</span><span style="color:var(--gold)">+${(v * 100).toFixed(1)}%</span></div>`)
          .join('') || '<div class="note">还没修任何秘术</div>'}
      </div>`;
    const w = showPanel(wrap, '秘术阁', body);
    w.querySelectorAll('[data-keji]').forEach(b => b.onclick = () => {
      const r = C().kejiUp(b.dataset.keji, 1);
      if (!r.ok) { toast(r.msg); return; }
      toast(r.msg, 2200);
      sfx('coin');
      kejiModal(w);          // 原地刷新，不闪屏
      renderTopbar();
    });
    return w;
  }

  // 洞府在那边是"一次性把高级货币投进去，永久抬高挂机倍率 / 任务数 / 副本次数"的滚雪球投资。
  // 我们把它落地成一条独立的 10 级线：花 ✦圣洁晶石 + ◆异界结晶，投入永久、转生保留。
  function authorityModal(wrap) {
    const S = C().S;
    const info = C().authorityInfo();
    const hl = S.cur.holy || 0, ow = S.cur.otherworld || 0;
    const cost = info.cost;
    const afford = cost ? (hl >= cost.holy && ow >= cost.otherworld) : false;
    const body = `
      <div class="card" style="border-color:#ffd76a55">
        <h3>灯阁权限 <span class="sub">Lv.${info.lv} / ${info.max}</span></h3>
  <div class="note">投入一次永久生效，转生不清空 · 花 ✦圣洁晶石 + ◆异界结晶</div>
      </div>
      <div class="card">
        <h3>当前生效</h3>
        <div class="kv"><span class="k">挂机产出</span><span style="color:var(--gold)">+${Math.round(info.now.idlePct * 100)}%</span></div>
        <div class="kv"><span class="k">挂机经验</span><span style="color:var(--gold)">+${Math.round(info.now.expPct * 100)}%</span></div>
        <div class="kv"><span class="k">离线上限</span><span>+${info.now.capHours.toFixed(1)} 小时</span></div>
        <div class="kv"><span class="k">离线效率</span><span>+${Math.round(info.now.offlinePct * 100)}%</span></div>
        <div class="kv"><span class="k">每日扫荡次数</span><span>+${info.now.sweep} 次（现在共 ${C().sweepCap()} 次）</span></div>
        ${info.now.allPct ? `<div class="kv"><span class="k">全队全属性</span><span style="color:var(--gold)">+${Math.round(info.now.allPct * 100)}%</span></div>` : ''}
      </div>
      ${info.maxed
        ? '<div class="card"><h3>已满级</h3></div>'
        : `<div class="card" style="border-color:#ffd76a66">
        <h3>下一级 · Lv.${info.lv + 1}</h3>
        <div class="note mb2">${info.nextDesc}</div>
        <div class="kv"><span class="k">✦圣洁晶石</span><span style="color:${hl >= cost.holy ? 'var(--green)' : 'var(--accent)'}">${fmt(hl)} / ${fmt(cost.holy)}</span></div>
        <div class="kv"><span class="k">◆异界结晶</span><span style="color:${ow >= cost.otherworld ? 'var(--green)' : 'var(--accent)'}">${fmt(ow)} / ${fmt(cost.otherworld)}</span></div>
        <button class="btn primary block" style="margin-top:10px" data-auth="1" ${afford ? '' : 'disabled'}>⚡ 提升灯阁权限</button>
      </div>`}
      <div class="section-title">权限一览（${info.max} 级）</div>
      ${info.rows.map(r => `<div class="list-row" style="${r.lv <= info.lv ? '' : 'opacity:.6'}">
        <div class="grow"><div class="t1">Lv.${r.lv}${r.lv <= info.lv ? ' <span class="tag" style="color:var(--green);border-color:var(--green)">已获得</span>' : ''}</div>
        <div class="t2">${r.desc}</div></div>
      </div>`).join('')}`;
    const w = showPanel(wrap, '灯阁权限', body);
    const btn = w.querySelector('[data-auth]');
    if (btn) btn.onclick = () => {
      const r = C().upgradeAuthority();
      if (!r.ok) { failToast(r.msg, btn); return; }
      sfx('level'); toast(r.msg, 2400);
      authorityModal(w); renderTopbar(); render();
    };
    return w;
  }

  /* ================= 任务（主线 / 日常） ================= */
  /* ================= 挂机分工 ================= */
  // 4 条产线各派 1 名领队：给板凳角色一个去处，也让挂机多一层"怎么排"的决定
  function idleLinesModal(wrap) {
    const S = C().S;
    const rows = C().idleLines();
    const bench = Object.keys(S.chars).filter(id => !S.party.includes(id));
    const body = `
      <div style="font-size:12px;color:var(--dim);line-height:1.75;margin-bottom:10px">
        4 条产线各派 <b>1 名领队</b>：领队战力越高，这条线产出越高（最高 +150%）。
        上阵主力不能派去挂机，「板凳上的伙伴」在这里发挥作用；没派领队的产线不产出。
      </div>
      ${rows.map(r => {
      const leader = r.leaderId;
      return `<div class="card" style="margin-bottom:8px;${leader ? '' : 'border-style:dashed'}">
        <h3>${r.line.ico} ${r.line.name} <span class="sub">${r.per}</span></h3>
        <div class="hint mb2">${r.line.desc}${leader ? ` · 领队【${r.line.attrName}】${r.attrValue} → 加成 +${Math.round(r.bonus * 100)}%` : ''}</div>
        ${leader
          ? `<div class="list-row" style="border:none;padding:4px 0">
               ${charAvatar(leader, 34)}
               <div class="grow"><div class="t1">${cname(leader)}</div><div class="t2">${r.line.attrName} ${r.attrValue} · 战力 ${fmt(C().power(leader))}</div></div>
               <button class="btn small ghost" data-idleclear="${r.line.id}">撤下</button>
             </div>`
          : `<button class="btn small block" data-idlepick="${r.line.id}" ${bench.length ? '' : 'disabled'}>${bench.length ? '＋ 派一名领队' : '没有可派的伙伴（先去招募）'}</button>`}
      </div>`;
    }).join('')}
      <div style="font-size:11px;color:var(--dim);line-height:1.7">可派伙伴：${bench.length} 名（未上阵的伙伴）。产出的收益和挂机收益一起，在首页「一键收取」里结算。</div>`;
    const w = showPanel(wrap, '挂机分工', body);
    w.querySelectorAll('[data-idlepick]').forEach(b => b.onclick = () => pickIdleLeader(b.dataset.idlepick, w));
    w.querySelectorAll('[data-idleclear]').forEach(b => b.onclick = () => {
      const r = C().setIdleLeader(b.dataset.idleclear, null);
      toast(r.msg);
      idleLinesModal(w);
      render();
    });
    return w;
  }
  function pickIdleLeader(lineId, wrap) {
    const S = C().S;
    const line = D.IDLE_LINES.find(l => l.id === lineId);
    const bench = Object.keys(S.chars).filter(id => !S.party.includes(id));
    const body = `
      <div class="note mb3">选一名伙伴派往「${line.name}」</div>
      ${bench.map(id => {
      const used = D.IDLE_LINES.find(l => l.id !== lineId && S.idle.lines[l.id] === id);
      return `<div class="list-row" data-idlelead="${id}" style="cursor:pointer${used ? ';opacity:.5' : ''}">
        ${charAvatar(id, 40)}
        <div class="grow"><div class="t1">${rarityTag(D.charById[id].rarity)} ${cname(id)}</div>
        <div class="t2">Lv.${S.chars[id].lv} · ${line.attrName} ${Math.round(((C().effectiveStats(id) || {}).attrs || {})[line.attr] || 0)} · 战力 ${fmt(C().power(id))}${used ? ` · 已在「${used.name}」` : ''}</div></div>
      </div>`;
    }).join('') || '<div class="empty">没有可派的伙伴</div>'}
      <button class="btn ghost block mt4" data-back>‹ 返回挂机分工</button>`;
    const w = showPanel(wrap, '派遣领队', body);
    w.querySelector('[data-back]').onclick = () => idleLinesModal(w);
    w.querySelectorAll('[data-idlelead]').forEach(el => el.onclick = () => {
      const r = C().setIdleLeader(lineId, el.dataset.idlelead);
      if (r.ok) toast(r.msg); else failToast(r.msg, el);
      sfx(r.ok ? 'success' : 'fail');
      idleLinesModal(w);
      render();
    });
    return w;
  }

  /* ================= 限时悬赏 ================= */
  function bountyModal(wrap) {
    const st = C().bountyState();
    const body = `
      <div style="font-size:12px;color:var(--dim);line-height:1.75;margin-bottom:10px">
        限时悬赏：<b>到点作废</b>，达成才有奖励。每条按自己的截止时间算，全部结束后可以开新一期。
      </div>
      ${st.list.map(({ b, leftMs, expired, done, claimed }) => {
      const state = claimed ? '已领取' : expired ? '已过期' : done ? '可领取' : '进行中';
      const color = claimed || expired ? 'var(--dim)' : done ? 'var(--green)' : 'var(--gold)';
      return `<div class="card" style="margin-bottom:8px;${done && !claimed && !expired ? 'border-color:var(--green)' : ''}">
        <h3>${b.name} <span class="sub" style="color:${color}">${state}</span></h3>
        <div class="note">${b.desc}</div>
        <div class="kv"><span class="k">剩余时间</span><span>${expired ? '已结束' : formatDuration(Math.max(0, Math.floor(leftMs / 1000)))}</span></div>
        <div class="kv"><span class="k">奖励</span><span>${rewardText(b.reward)}</span></div>
        ${claimed ? '<button class="btn small block" disabled>已领取</button>'
          : expired ? '<button class="btn small block" disabled>已过期</button>'
            : done ? `<button class="btn small primary block" data-bounty="${b.id}">领取奖励</button>`
              : '<button class="btn small block" disabled>目标未完成 · 去副本</button>'}
      </div>`;
    }).join('')}
      ${st.allOver ? '<button class="btn primary block" data-renew="1">🔄 开启新一期悬赏</button>' : ''}`;
    const w = showPanel(wrap, '限时悬赏', body);
    w.querySelectorAll('[data-bounty]').forEach(b => b.onclick = () => {
      const r = C().claimBounty(b.dataset.bounty);
      if (r.ok) toast(r.msg, 2400); else failToast(r.msg, b);
      sfx(r.ok ? 'level' : 'fail');
      bountyModal(w); renderTopbar(); render();
    });
    const rn = w.querySelector('[data-renew]');
    if (rn) rn.onclick = () => { const r = C().renewBounties(); toast(r.msg); bountyModal(w); render(); };
    return w;
  }

  /* ================= 伴生体（兽栏） ================= */
  function beastModal(wrap) {
    const st = C().beastState();
    const elemIcon = e => e ? (D.ELEMENT_ICON[e] || '') + e : '—';
    const activeRow = st.activeBeast ? (() => {
      const a = st.list.find(x => x.active);
      const ctr = D.ELEMENT_COUNTER[st.activeBeast.elem];
      return `<div class="card" style="border-color:var(--gold)">
        <h3>🐾 随行中 · ${st.activeBeast.name}
          <span class="sub">${st.activeBeast.rarity} · ${elemIcon(st.activeBeast.elem)} · Lv.${a ? a.lv : 1}</span></h3>
        <div style="font-size:11px;color:var(--dim);line-height:1.8">
          ${D.beastDesc(st.activeBeast)}（全队生效，主角也吃）<br>
          五行：<b style="color:var(--gold)">${st.activeBeast.elem}</b> 克 <b>${ctr}</b> —— 进「${ctr}」属性的世界，全队伤害 +${Math.round(D.ELEMENT_BONUS * 100)}%；
          遇到克你的世界则 -${Math.round(D.ELEMENT_PENALTY * 100)}%。
        </div>
        <button class="btn small ghost block mt2" data-beastoff="1">收回伴生体</button>
      </div>`;
    })() : `<div class="card" style="border-style:dashed">
      <h3>🐾 还没有随行伴生体</h3>
      <div style="font-size:11px;color:var(--dim)">孵化一只并让它随行，全队立刻吃到加成。</div>
    </div>`;
    const body = `
      <div style="font-size:12px;color:var(--dim);line-height:1.8;margin-bottom:10px">
        伴生体是<b>第二条养成线</b>：上阵 1 只，给<b>全队</b>加属性 + 五行克制。孵化花兽魂石，
        重复获得转<b>兽魂</b>，兽魂用来升阶。兽魂石从副本 Boss（必掉 1~3 颗）和精英怪出。
      </div>
      ${activeRow}
      <div class="card">
        <h3>孵化 <span class="sub">兽魂石 ${st.eggs} 颗 · 每 ${st.eggCost} 颗孵 1 只</span></h3>
        <div class="btn-row">
          <button class="btn small ${st.canHatch ? 'primary' : ''}" data-hatch="1" ${st.canHatch ? '' : 'disabled'}>孵 1 只（🥚${st.eggCost}）</button>
          <button class="btn small gold" data-hatch="10" ${st.eggs >= st.eggCost * 10 ? '' : 'disabled'}>孵 10 只（🥚${st.eggCost * 10}）</button>
        </div>
        <div class="rate-row mt2">${Object.entries(D.BEAST_RARITY_RATE).map(([r, v]) => `<span class="rtext-${r}">${r} ${(v * 100).toFixed(1)}%</span>`).join('')}</div>
      </div>
      <div class="section-title">我的伴生体（${st.count} / ${D.BEASTS.length}）</div>
      ${st.list.map(x => {
      const counter = D.ELEMENT_COUNTER[x.b.elem];
      const need = D.BEAST_SOUL_PER_LV * x.lv;
      return `<div class="card" style="margin-bottom:8px;${x.active ? 'border-color:var(--gold)' : ''}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div class="bico" style="font-size:24px">${elemIcon(x.b.elem)}</div>
          <div class="grow">
            <div><span class="rtext-${x.b.rarity}">${x.b.rarity}</span> <b>${x.b.name}</b>
              <span class="tag">Lv.${x.lv}/${D.BEAST_MAX_LV}</span>${x.active ? ' <span class="tag" style="color:var(--gold);border-color:var(--gold)">随行中</span>' : ''}</div>
            <div class="hint mt1">${D.beastDesc(x.b)}（全队）</div>
            <div style="font-size:11px;color:var(--dim);margin-top:2px">克 ${counter} · 兽魂 ${x.soul}${x.maxLv ? ' · 已满级' : ` / 升阶需 ${need}`}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${x.active ? '' : `<button class="btn small" data-beaston="${x.id}">随行</button>`}
            <button class="btn small ${x.soul >= need && !x.maxLv ? 'gold' : ''}" data-beastup="${x.id}" ${x.maxLv || x.soul < need ? 'disabled' : ''}>升阶</button>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="empty">还没有伴生体，去孵化一只</div>'}
      <div class="section-title">五行相克</div>
      <div class="card" style="font-size:11px;line-height:1.9;color:var(--dim)">
        ${D.ELEMENTS.map(e => `${D.ELEMENT_ICON[e]}${e} 克 ${D.ELEMENT_ICON[D.ELEMENT_COUNTER[e]]}${D.ELEMENT_COUNTER[e]}`).join('　')}
        <div class="mt2">各世界的属性：${D.WORLDS.map(w => { const e = D.worldElement(w.id); return `${w.name.slice(0, 2)}${D.ELEMENT_ICON[e]}${e}`; }).join(' · ')}</div>
      </div>`;
    const w = showPanel(wrap, '伴生体 · 兽栏', body);
    w.querySelectorAll('[data-hatch]').forEach(b => b.onclick = () => {
      const r = C().hatchBeast(+b.dataset.hatch);
      if (!r.ok) { failToast(r.msg, b); return; }
      sfx('box');
      const chips = r.got.map(g => `<span class="reward-chip rtext-${g.rarity}">${D.ELEMENT_ICON[g.elem]}${g.name}${g.dup ? `（转兽魂 ${g.soul}）` : ''}</span>`);
      renderTopbar();
      lootPanel(`孵化结果（×${r.count}）`, chips.join(''), w2 => { beastModal(w2); render(); }, w);
    });
    w.querySelectorAll('[data-beaston]').forEach(b => b.onclick = () => {
      const r = C().setActiveBeast(b.dataset.beaston);
      if (r.ok) toast(r.msg); else failToast(r.msg, b);
      sfx(r.ok ? 'success' : 'fail');
      beastModal(w); render();
    });
    w.querySelectorAll('[data-beastup]').forEach(b => b.onclick = () => {
      const r = C().beastLevelUp(b.dataset.beastup);
      if (r.ok) toast(r.msg); else failToast(r.msg, b);
      sfx(r.ok ? 'level' : 'fail');
      beastModal(w); render();
    });
    const off = w.querySelector('[data-beastoff]');
    if (off) off.onclick = () => { C().setActiveBeast(null); toast('已收回伴生体'); beastModal(w); render(); };
    return w;
  }

  /* ================= 境界 · 渡劫 ================= */
  function realmModal(wrap) {
    const S = C().S;
    const st = C().realmState();
    if (!st.hasBloodline) {
      return showPanel(wrap, '境界 · 渡劫', `
        <div class="card" style="border-color:#e6b64c66">
          <h3>还没有境界线</h3>
          <button class="btn gold block mt3" data-act="open-bloodline">去选血统</button>
        </div>`);
    }
    // 36 小阶按"大境界"分组展示：每个大境界一行，行内 4 个小阶（初期/中期/后期/大圆满）——
    // 大境界名取自当前血统（D.BLOODLINES[x].realms），不再是所有人共用一套名字。
    const majors = D.BLOODLINES[st.bloodline].realms;
    const groups = majors.map((mj, mi) => {
      const base = mi * D.REALM_TIERS.length;
      const cells = D.REALM_TIERS.map((tier, ti) => {
        const gi = base + ti;
        const r = D.REALMS[gi];
        const done = gi < st.realm, cur = gi === st.realm;
        // 成功率写在小字里（手机没有悬停）；花费写在下面「渡劫」按钮上，不重复
        return `<span class="step-chip ${done ? 'done' : cur ? 'cur' : ''}" data-step="${gi}">
          <b>${tier}</b><i>${done ? '已成' : `Lv.${r.lv} · ${Math.round(r.rate * 100)}%`}</i></span>`;
      }).join('');
      const doneN = D.REALM_TIERS.filter((t, ti) => base + ti < st.realm).length;
      return `<div class="card" style="margin-bottom:8px;${doneN === 4 ? '' : doneN ? 'border-color:#ffd76a77' : 'opacity:.62'}">
        <h3>${mi + 1}. ${mj} <span class="sub">${doneN}/4</span></h3>
        <div class="step-row">${cells}</div>
      </div>`;
    }).join('');
    const body = `
      <div class="card">
        <h3>${st.bloodline} · ${st.curName} <span class="sub">第 ${Math.min(st.realm + 1, D.REALM_STAGE_COUNT)} / ${D.REALM_STAGE_COUNT} 阶</span></h3>
  <div class="note">当前境界加成：+${(C().realmBonusPct() * 100).toFixed(1)}%</div>
      </div>
      ${st.next ? `<div class="card" style="border-color:#ffd76a66">
        <h3>下一阶 · ${st.nextName || '—'} <span class="sub">成功率 ${Math.round(st.rate * 100)}%</span></h3>
        <div class="kv"><span class="k">等级要求</span><span style="color:${st.levelOk ? 'var(--green)' : 'var(--accent)'}">Lv.${st.next.lv}（当前 Lv.${S.player.level}）</span></div>
        <div class="kv"><span class="k">渡劫材料</span><span style="color:${st.haveMat >= st.matN ? 'var(--green)' : 'var(--accent)'}">${D.ITEMS[st.matItem].name} ${st.haveMat} / ${st.matN}</span></div>
        <div class="kv"><span class="k">点数</span><span style="color:${(S.cur.points || 0) >= st.points ? 'var(--green)' : 'var(--accent)'}">◈${fmt(st.points)}</span></div>
        <button class="btn primary block" style="margin-top:10px" data-realm="1" ${st.levelOk && st.haveMat >= st.matN && (S.cur.points || 0) >= st.points ? '' : 'disabled'}>⚡ 渡劫（成功率 ${Math.round(st.rate * 100)}%）</button>
        <div class="hint mt1">失败也扣材料与点数（等级不掉）</div>
      </div>` : '<div class="card"><h3>已至大圆满</h3><div class="note">当前境界已是这条血统的终点。</div></div>'}
      <div class="section-title">${st.bloodline}境界线 · ${majors.length} 大境 × ${D.REALM_TIERS.length} 小阶</div>
      ${groups}`;
    const w = showPanel(wrap, '境界 · 渡劫', body);
    const go = w.querySelector('[data-realm]');
    if (go) go.onclick = () => confirmSpend({ points: st.points }, '确认渡劫',
      `目标「${st.nextName}」· 成功率 ${Math.round(st.rate * 100)}% · 另外消耗材料 ×${st.matN}（失败也扣）`, () => {
        const r = C().attemptRealm();
        if (!r.ok) { failToast(r.msg, go); return; }
        sfx(r.success ? 'level' : 'fail');
        toast(r.msg, 3200);
        realmModal(w); render(); renderTopbar();
      });
    // 点某一小阶：跳出这一阶的具体要求
    w.querySelectorAll('[data-step]').forEach(el => el.onclick = () => {
      const i = +el.dataset.step, r = D.REALMS[i];
      const nm = D.realmName(st.bloodline, i);
      if (i < st.realm) { toast(`「${nm}」已突破`, 1800); return; }
      toast(`「${nm}」需要 Lv.${r.lv} · 成功率 ${Math.round(r.rate * 100)}% · ◈${fmt(r.cost.points)} + 材料×${r.cost.matN}`, 3200);
    });
    return w;
  }

  /* ================= 任务（主线 / 日常） ================= */
  let taskTab = 'main';
  // 主线的"去完成"统一走这里：首页卡片与任务面板共用同一套跳转
  function gotoQuest(qid) {
    const worldOf = { q12: 'W02', q14: 'W02', q15: 'W03' }[qid] || 'W01';
    if (qid === 'q01') {
      setTab('home');
      setTimeout(() => {
        protagonistDetail();
        coachmark('.text-rows', '这是你的属性面板：升级得属性点和技能点，点 +1 分配；选定血统后技能栏会换成那条血统的技能。看完关掉面板，回首页领取奖励。');
      }, 250);
      return;
    }
    if (qid === 'q03') {
      setTab('home');
      setTimeout(() => {
        openRecruit();
        coachmark('[data-free="1"]', '每天有一次免费招募，先把它领了——免费抽也计入这条主线。想多抽就往下选池子：普通池花点数、高级池花圣洁晶石、限定池花异界结晶。');
      }, 250);
      return;
    }
    if (qid === 'q09') {
      setTab('home');
      setTimeout(() => {
        buildingsModal();
        coachmark('[data-bup]', '建筑每升一级都是永久加成：灯芯加挂机产出，训练室加经验，医疗室加离线效率。');
      }, 250);
      return;
    }
    if (qid === 'q13') {
      setTab('home');
      setTimeout(() => {
        protagonistDetail();
        // 三种形态都要能高亮到：还没选血统（[data-pbl] 一排选择按钮）/ 已选可升级（[data-pblup]）/ 等级不够（退回整张血统卡）
        coachmark('[data-pblup], [data-pbl], [data-card="blood"]', '血统升级消耗血统结晶 + 点数，是中期最猛的成长线；还没选就先在下面挑一种（不可更改）。主角 Lv.10 之后还能在「🌌 境界」里渡劫——每突破一小阶全属性永久 +1.4%，36 阶合计 +50.4%。');
      }, 250);
      return;
    }
    if (qid === 'q10') {
      setTab('dungeon');
      dungeonView = { page: 'world', worldId: 'W01', diff: 'normal' };
      render();
      coachmark('[data-stage="11"]', '第 12 关是守关 Boss。打之前可以先在首页「一键收取」把挂机收益吃掉，再补给一轮装备。');
      return;
    }
    if (qid === 'q08') {
      setTab('dungeon');
      dungeonView = { page: 'world', worldId: 'W01', diff: 'normal' };
      render();
      coachmark('[data-stage="3"]', '每通关一关解锁下一关；一关是一口气打到底的，一波打完自动接下一波，血量会继承、不会自动回满。血线低了就在结算页点治疗剂。');
      return;
    }
    if (qid === 'q04') {
      setTab('party');
      // 注意：主角默认就占着第 1 格，所以这里指向"前排"这一整排，别指向某个具体格子（可能正好是主角）
      coachmark('[data-row="front"]', '点空位把招募到的伙伴放进队伍。上阵共 5 格（前 2 后 3），主角占其中一格，还能再上 4 名队友；想换位置就长按任意一格抓起，按住拖到别的位置松手放下——主角也能拖到后排。');
      return;
    }
    if (qid === 'q07') {
      setTab('equip');
      coachmark('[data-eqd], [data-eqpage]', '点击一件装备即可强化，消耗材料提升数值。');
      return;
    }
    if (qid === 'q11') { setTab('dungeon'); setTimeout(() => { dungeonView = { page: 'corridor' }; render(); }, 250); return; }
    // 战斗类任务：直达对应世界的关卡页
    setTab('dungeon');
    dungeonView = { page: 'world', worldId: worldOf, diff: 'normal' };
    render();
    if (qid === 'q01b') coachmark('[data-stage="0"]', '点第 1 关就直接开打——通关会一场接一场地打，打完最后一波才算过关。');
  }
  // 日常任务的"去完成"
  function gotoDaily(key) {
    // 锚点必须指到"真存在的那颗按钮"：挂机卡上现在是 claim-all，claim-idle 早就没了。
    // 指错了 coachmark 会静默不显示——玩家看到的就是"点了去完成，什么也没发生"。
    if (key === 'idle1') { setTab('home'); coachmark('[data-act="claim-all"]', '挂机满 60 秒就能领，离线期间也会累积收益。'); return; }
    if (key === 'enhance1') { setTab('equip'); coachmark('[data-eqd], [data-eqpage]', '点一件装备进去强化，成功或失败都算完成一次。'); return; }
    if (key === 'recruit1') { setTab('home'); setTimeout(() => openRecruit(), 250); return; }
    if (key === 'item1') { setTab('bag'); return; }
    setTab('dungeon');
  }
  const DAILY_MAIN_GO = { battle5: '残域打一场', idle1: '灯阁领挂机', enhance1: '装备页强化', recruit1: '招募 1 次', dungeon1: '残域通关一关', item1: '背包用道具' };
  // 周常：与每日任务共用进度来源，每周一自动重置
  function weeklyHtml() {
    const st = C().weeklyState();
    const allDone = st.every(x => x.done);
    const claimedAll = C().S.tasks.weeklyAllClaimed;
    return `
      <div style="font-size:11px;color:var(--dim);margin:2px 2px 8px">本周 ${C().weekKey()} 起算 · 进度与每日任务通用，周一自动重置。</div>
      ${st.map(({ t, prog, done, claimed }) => `<div class="list-row">
        <div class="grow"><div class="t1">${t.name}</div>
        <div class="t2">${Math.min(prog, t.target)}/${t.target} · 奖励 ${rewardText(t.reward)}</div></div>
        ${claimed ? '<button class="btn small" disabled>已领</button>'
          : done ? `<button class="btn small primary" data-wclaim="${t.id}">领取</button>`
          : '<button class="btn small ghost" disabled>进行中</button>'}
      </div>`).join('')}
      <div class="card mt3">
        <h3>本周全清奖励</h3>
        <div class="note mb2">${rewardText(D.WEEKLY_ALL_REWARD)}</div>
        <button class="btn gold block" data-wclaimall="1" ${allDone && !claimedAll ? '' : 'disabled'}>${claimedAll ? '已领取' : '一键领取'}</button>
      </div>`;
  }
  // 成就：四条线（战斗 / 养成 / 收集 / 挑战），达成后手动领取
  function achHtml() {
    const st = C().achievementSummary();
    const cats = ['战斗', '养成', '收集', '挑战'];
    return `
      <div class="kv mb2"><span class="k">成就进度</span><span>已达成 ${st.claimed}/${st.total} · 可领取 ${st.list.filter(x => x.done && !x.claimed).length}</span></div>
      ${cats.map(cat => {
        const list = st.list.filter(x => x.a.cat === cat);
        if (!list.length) return '';
        return `<div class="section-title">${cat}</div>` + list.map(({ a, done, claimed }) => `<div class="list-row" style="${claimed ? 'opacity:.5' : ''}">
          <div class="grow"><div class="t1">${claimed ? '🏅' : done ? '✨' : '⬜'} ${a.name}</div>
          <div class="t2">${a.desc} · 奖励 ${rewardText(a.reward)}</div></div>
          ${claimed ? '<button class="btn small" disabled>已领</button>'
            : done ? `<button class="btn small primary" data-ach="${a.id}">领取</button>`
            : '<button class="btn small ghost" disabled>未达成</button>'}
        </div>`).join('');
      }).join('')}`;
  }
  function tasksModal(tab, wrap) {
    taskTab = tab || taskTab;
    const S = C().S;
    C().ensureDaily();
    const allDone = D.DAILY_TASKS.every(t => (S.tasks.daily[t.id] || 0) >= t.target);
    const mainList = C().mainQuestState();
    const curIdx = mainList.findIndex(x => !x.claimed);
    const mainHtml = mainList.map(({ q, done, claimed }, i) => {
      const isCur = i === curIdx;
      return `<div class="list-row" style="${claimed ? 'opacity:.45' : ''}${isCur ? ';border-color:#ffd76a88' : ''}">
        <div class="grow">
          <div class="t1">第 ${i + 1}/${mainList.length} 步 · ${q.name} ${isCur ? '<span class="tag" style="color:var(--gold);border-color:var(--gold)">当前</span>' : ''}</div>
          <div class="t2">${q.desc} · 奖励 ${rewardText(q.reward)}</div>
        </div>
        ${claimed
          ? '<button class="btn small" disabled>已完成</button>'
          : done
            ? `<button class="btn small primary" data-mclaim="${q.id}">领取</button>`
            : `<button class="btn small ghost" data-gotoq="${q.id}">前往 ›</button>`}
      </div>`;
    }).join('');
    const dailyHtml = `
      ${D.DAILY_TASKS.map(t => {
        const prog = S.tasks.daily[t.id] || 0;
        const done = prog >= t.target;
        const claimed = S.tasks.claimed[t.id];
        return `<div class="list-row">
          <div class="grow"><div class="t1">${t.name}</div>
          <div class="t2">${Math.min(prog, t.target)}/${t.target} · 奖励 ${rewardText(t.reward)}${done || claimed ? '' : ` · ${DAILY_MAIN_GO[t.id] || ''}`}</div></div>
          ${claimed
            ? '<button class="btn small" disabled>已领</button>'
            : done
              ? `<button class="btn small primary" data-claim="${t.id}">领取</button>`
              : `<button class="btn small ghost" data-godaily="${t.id}">前往 ›</button>`}
        </div>`;
      }).join('')}
      <div class="card mt3">
        <h3>全部完成奖励</h3>
        <div class="note mb2">${Object.entries(D.DAILY_ALL_REWARD).map(([k, v]) => `${curIcon(k)}${v}`).join(' · ')}</div>
        <button class="btn gold block" data-claimall="1" ${allDone && !S.tasks.allClaimed ? '' : 'disabled'}>${S.tasks.allClaimed ? '已领取' : '一键领取'}</button>
      </div>`;
    const w = showPanel(wrap, '任务', `
      <div class="pill-tabs">
        <div class="pill ${taskTab === 'main' ? 'active' : ''}" data-ttab="main">📜 主线</div>
        <div class="pill ${taskTab === 'daily' ? 'active' : ''}" data-ttab="daily">📋 日常</div>
        <div class="pill ${taskTab === 'weekly' ? 'active' : ''}" data-ttab="weekly">🗓 周常</div>
        <div class="pill ${taskTab === 'ach' ? 'active' : ''}" data-ttab="ach">🏅 成就</div>
      </div>
      ${taskTab === 'main' ? mainHtml : taskTab === 'daily' ? dailyHtml : taskTab === 'weekly' ? weeklyHtml() : achHtml()}
    `);
    w.querySelectorAll('[data-ttab]').forEach(el => el.onclick = () => tasksModal(el.dataset.ttab, w));
    w.querySelectorAll('[data-mclaim]').forEach(b => b.onclick = () => {
      const r = C().claimQuest(b.dataset.mclaim);
      if (r.ok) toast('主线奖励已领取');
      tasksModal(taskTab, w); renderTopbar();
    });
    w.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => {
      C().claimTask(b.dataset.claim);
      tasksModal(taskTab, w); renderTopbar();
    });
    w.querySelectorAll('[data-gotoq]').forEach(b => b.onclick = () => { closeModal(w); gotoQuest(b.dataset.gotoq); });
    w.querySelectorAll('[data-godaily]').forEach(b => b.onclick = () => { closeModal(w); gotoDaily(b.dataset.godaily); });
    w.querySelectorAll('[data-wclaim]').forEach(b => b.onclick = () => {
      const r = C().claimWeekly(b.dataset.wclaim);
      toast(r.msg);
      sfx(r.ok ? 'coin' : 'fail');
      tasksModal(taskTab, w); renderTopbar();
    });
    const wAll = w.querySelector('[data-wclaimall]');
    if (wAll) wAll.onclick = () => {
      const r = C().claimAllWeekly();
      toast(r.msg);
      sfx(r.ok ? 'success' : 'fail');
      tasksModal(taskTab, w); renderTopbar();
    };
    w.querySelectorAll('[data-ach]').forEach(b => b.onclick = () => {
      const r = C().claimAchievement(b.dataset.ach);
      toast(r.msg, 2400);
      sfx(r.ok ? 'level' : 'fail');
      tasksModal(taskTab, w); renderTopbar();
    });
    // 注意：只有"日常"页签才有一键领取按钮，其它页签下这里必须是 null 安全的
    const claimAllBtn = w.querySelector('[data-claimall]');
    if (claimAllBtn) claimAllBtn.onclick = () => {
      const r = C().claimAllTasks();
      toast(r.ok ? '领取成功' : r.msg);
      sfx(r.ok ? 'coin' : 'fail');
      tasksModal(taskTab, w); renderTopbar();
    };
    return w;
  }

  /* ================= 铭刻 / 转生 ================= */
  function geneLockModal(wrap) {
    const S = C().S;
    const info = C().geneLockInfo();
    const w = showPanel(wrap, '铭刻', `
      <div class="note mb3">当前：<b style="color:var(--accent)">${S.player.geneLock > 0 ? D.GENE_LOCKS[S.player.geneLock - 1].name : '未解锁'}</b></div>
      ${D.GENE_LOCKS.map((g, i) => {
        const unlocked = S.player.geneLock > i;
        const isNext = S.player.geneLock === i;
        return `<div class="card" style="margin-bottom:8px;${isNext ? 'border-color:var(--accent)' : ''}">
          <h3>${i + 1}阶 · ${g.name} ${unlocked ? '<span class="sub" style="color:var(--green)">已解锁</span>' : ''}</h3>
          <div class="note">${g.desc}</div>
          ${isNext && !info.max ? `
            <div style="font-size:11px;color:var(--gold);margin-top:6px">条件：${g.req} · ❥${g.cost.bloodCrystal}</div>
            ${info.reqs.length ? `<div style="font-size:11px;color:var(--accent);margin-top:4px">未满足：${info.reqs.join('；')}</div>` : ''}
            <button class="btn primary block" style="margin-top:8px" data-glunlock="1" ${info.can ? '' : 'disabled'}>突破铭刻</button>` : ''}
        </div>`;
      }).join('')}
    `);
    const btn = w.querySelector('[data-glunlock]');
    if (btn) btn.onclick = () => {
      const r = C().geneLockUnlock();
      toast(r.msg, 2500);
      geneLockModal(w);
      refresh();
    };
    return w;
  }
  function reincarnModal(wrap) {
    const S = C().S;
    const can = C().canReincarnate();
    const n = S.player.reincarnations + 1;
    const rpGain = Math.floor(100 * Math.pow(n, 1.15));
    const w = showPanel(wrap, '转生', `
      <div class="card">
        <h3>转生 <span class="sub">已转生 ${S.player.reincarnations} 次</span></h3>
  <div class="note">保留伙伴 / 装备 / 血统 / 铭刻 / 天赋</div>
        <div style="font-size:11px;margin-top:8px;color:${can ? 'var(--green)' : 'var(--accent)'}">
          条件：玩家Lv.${S.player.level}/100 · 铭刻${S.player.geneLock}/5 · 灯芯Lv.${S.buildings.core}/30
        </div>
        <button class="btn primary block" style="margin-top:10px" data-reinc="1" ${can ? '' : 'disabled'}>开始转生</button>
      </div>
      <div class="section-title">永久天赋（♾${fmt(S.cur.rp)}）</div>
      <div style="font-size:11px;color:var(--dim);line-height:1.7;margin:0 2px 8px">
        四支天赋点满各需 ♾6200（10/20/40/80/150/300/600/1000/1500/2500）。加成对全队生效，转生后保留。
      </div>
      ${Object.entries(D.TALENTS).map(([k, t]) => {
        const lv = S.player.talents[k];
        const cost = D.TALENT_COSTS[lv];
        const texts = D.talentTexts(k);
        return `<div class="card mb2">
          <h3>${t.name} <span class="sub">Lv.${lv}/10 · ${t.desc}</span></h3>
          ${lv > 0 ? `<div style="font-size:11px;color:var(--green);margin-bottom:6px">已激活：${texts.slice(0, lv).join('、')}</div>` : ''}
          ${lv < 10 ? `<button class="btn small" data-talent="${k}">下一级：${texts[lv]}（♾${cost}）</button>` : '<div style="color:var(--gold);font-size:12px">已满级</div>'}
          <div style="font-size:10px;color:var(--dim);margin-top:6px">${texts.map((x, i) => `${i < lv ? '✅' : '⬜'}${i + 1}.${x}`).join('　')}</div>
        </div>`;
      }).join('')}
    `);
    w.querySelector('[data-reinc]').onclick = () => {
      closeModal(w);
      confirmBox('确认转生', '转生将重置玩家等级与世界进度（伙伴、装备、血统、铭刻、天赋保留）。确定？', () => {
        const r = C().reincarnate();
        if (r.ok) { toast(`第 ${r.count} 次转生完成！获得 ♾${r.rp}`, 3000); }
        reincarnModal(); refresh(); render();
      });
    };
    w.querySelectorAll('[data-talent]').forEach(b => b.onclick = () => {
      const r = C().buyTalent(b.dataset.talent);
      toast(r.ok ? '天赋已激活' : r.msg);
      reincarnModal(w);
      renderTopbar();
    });
    return w;
  }

  /* ================= 背包 / 设置 ================= */
  function itemIcon(it, id) {
    if (id === D.BEAST_EGG_ITEM) return '🥚';
    if (it.type === 'box') return '🎁';
    if (it.type === 'exp') return '📘';
    if (it.type === 'serum') return '💊';
    if (it.type === 'material') return '⚙️';
    if ((it.effect || {}).healPct) return '🧪';
    return '💉';
  }
  // 结果面板：开箱 / 使用道具之后把拿到的东西摆出来
  /* 通用结算面板：标题 + 一排奖励 + 一个「返回」。
     ⚠️ backFn 负责"把这一层收掉"——两种合法写法：
       ① 用同一个 w 画回上一层（showPanel(w, …) / updateModal(w, …)，比如扫荡结果→扫荡面板）；
       ② 直接 closeModal(w)。
     只做 refresh()/render() 是**不够**的：那只重画了背后的页面，弹窗还盖在上面，
     玩家看到的就是"按了返回没反应"。所以这里加了兜底：回调要是没重画也没关掉，就由面板自己关。 */
  function lootPanel(title, chipsHtml, backFn, wrap) {
    const w = showPanel(wrap, title, `
      <div class="reward-chips" style="margin:10px 0">${chipsHtml || '<span class="reward-chip">没有变化</span>'}</div>
      <button class="btn block" data-back>‹ 返回</button>`);
    w.querySelector('[data-back]').onclick = () => {
      const seq = w._drawSeq;
      backFn(w);
      if (w._drawSeq === seq && modalStack.indexOf(w) >= 0) closeModal(w);
    };
    return w;
  }
  // 背包正文：页签与弹窗共用同一份模板，两处永远长一样（避免"页签版"和"弹窗版"漂移）。
  // V9.2：三池（道具 / 材料 / 装备），各 50 格起；格子排成网格，**最后一格是「＋」扩容按钮**，
  // 点一下 +10 格（于是扩到 60 格时，第 61 格就是新的「＋」）。格子只写名字和数量，点进去才是介绍与用法。
  const BAG_POOLS = {
    item: { label: '道具', capKey: 'itemCap', expKey: 'itemExpands' },
    mat: { label: '材料', capKey: 'matCap', expKey: 'matExpands' },
    equip: { label: '装备', capKey: 'eqCap', expKey: 'eqExpands' },
  };
  // 空格子（占位，保持网格整齐）
  const bagEmptyCell = () => '<div class="bg-slot"></div>';
  function bagPoolGrid(pool) {
    const S = C().S;
    const cfg = BAG_POOLS[pool];
    const cap = S.bag[cfg.capKey];
    const expands = S.bag[cfg.expKey] || 0;
    const cost = D.bagExpandCost(expands);
    let cells = [];
    if (pool === 'equip') {
      // 格子里只放"没穿在身上的"：穿在身上的装备不占背包格（要看就在角色的装备方块里看）
      const list = bagEquipList();
      cells = list.slice(0, cap).map(eq => {
        const inner = `<span class="bg-name rtext-${eq.rarity}">${eq.lock ? '🔒' : ''}${eq.name}</span><span class="bg-sub">+${eq.enhance}</span>`;
        // 批量分解时，格子本身就是勾选按钮（不再有下面那串列表可以勾）
        if (batchMode) {
          const canSel = !eq.lock;
          const cls = ['bg-slot', 'filled'];
          if (batchSel.has(eq.uid)) cls.push('sel');
          if (!canSel) cls.push('no-sel');
          return `<button class="${cls.join(' ')}" ${canSel ? `data-beq="${eq.uid}"` : ''}>${inner}</button>`;
        }
        return `<button class="bg-slot filled" data-eqd="${eq.uid}">${inner}</button>`;
      });
    } else {
      const isMat = k => (D.ITEMS[k] || {}).type === 'material';
      const stacks = Object.entries(S.items).filter(([k, n]) => n > 0 && (pool === 'mat' ? isMat(k) : !isMat(k)));
      cells = stacks.slice(0, cap).map(([k, n]) => `<button class="bg-slot filled" data-item="${k}">
        <span class="bg-name">${D.ITEMS[k].name}</span><span class="bg-count">×${n}</span></button>`);
    }
    // 空的补到 cap 个，再加上"第 cap+1 格：＋扩容"。
    // 筛选状态下**不补空格子**：筛出 3 件武器后面跟着 47 个空格，玩家会以为筛选没生效（V9.5）。
    const filtering = pool === 'equip' && (equipFilter !== 'all' || equipCatFilter !== 'all');
    if (!filtering) while (cells.length < cap) cells.push(bagEmptyCell());
    const used = pool === 'equip' ? C().bagUsage().eqUsed : (pool === 'mat' ? C().bagUsage().matUsed : C().bagUsage().itemStacks);
    const full = used >= cap;
    return `
      <div class="bg-head">
        <span>${cfg.label}格</span>
        <span class="sub">${used} / ${cap}${full ? ' · 满了' : ''}</span>
      </div>
      <div class="bg-grid">
        ${cells.join('')}
        <button class="bg-slot add" data-expand="${pool}">＋<i>+${D.BAG_EXPAND_SIZE}</i><u>◈${fmt(cost)}</u></button>
      </div>`;
  }
  function bagBody(which) {
    const view = which || (curTab === 'bag' ? bagView : 'item');
    if (view === 'equip') return equipScreen();
    return `<div class="card mb3">${bagPoolGrid(view === 'mat' ? 'mat' : 'item')}</div>
`;
  }
  /* 待领箱：背包满时收到的东西先存在这里，清出格子一键领回。
     以前这类道具是直接丢掉的（addItem 的返回值没人看），玩家根本不知道自己亏了什么（V9.5）。 */
  function stashBar() {
    const n = C().stashCount();
    if (!n) return '';
    const list = C().stashList();
    const txt = list.slice(0, 4).map(x => `${(D.ITEMS[x.id] || {}).name || x.id}×${x.n}`).join(' · ');
    return `<div class="card mb3" style="border-color:#ffd76a88">
      <h3>📮 待领箱 <span class="sub">${n} 件</span></h3>
      <div class="hint mb2">背包满时收到的道具先存这里</div>
      <div class="hint mb2" style="color:var(--text2)">${txt}${list.length > 4 ? ` … 还有 ${list.length - 4} 种` : ''}</div>
      <button class="btn small primary" data-stashclaim="1">全部领回</button>
    </div>`;
  }
  // 背包作为一级页签：三栏共用一条顶部胶囊
  function bagScreen() {
    /* V9.5.2：三个主标签从"圆角胶囊"改成"矩形卡片"，并吸在顶栏（货币条）下方——
       翻到下面挑装备时，这一排不动，随时能换栏、也随时知道自己在哪一栏。 */
    return `<div class="tab-cards">
        ${BAG_TABS.map(t => `<div class="tab-card ${bagView === t.id ? 'active' : ''}" data-bagview="${t.id}">${t.name}</div>`).join('')}
      </div>
      ${stashBar()}
      ${bagBody(bagView)}`;
  }
  // 背包绑定：asDrawer=true 时是"弹窗里的背包"，否则是页签里的背包（返回行为不同）
  function bindBag(root, asDrawer) {
    const refresh = () => { renderTopbar(); if (asDrawer) bagModal(root); else render(); };
    /* "返回背包"要分清两层：
       抽屉里开的子面板如果画在同一个抽屉元素上（w === root），原地画回背包就行；
       如果是另开的一层（经验道具选人、道具详情、炼化台…），**得先把那一层关掉**，
       否则它一直盖在背包上面，看着就是"返回没反应"（V8.9 修）。 */
    const backToBag = w => {
      if (asDrawer && w && w !== root) closeModal(w);
      if (asDrawer) bagModal(root);
      else { closeModal(w); render(); }
    };
    root.querySelectorAll('[data-expand]').forEach(b => b.onclick = () => {
      const r = C().buyBagCap(b.dataset.expand);
      if (r.ok) toast(r.msg); else failToast(r.msg, b);
      refresh();
    });
    root.querySelectorAll('[data-bagview]').forEach(el => el.onclick = () => {
      bagView = el.dataset.bagview;
      if (asDrawer) bagModal(root); else render();
    });
    root.querySelectorAll('[data-stashclaim]').forEach(b => b.onclick = () => {
      const r = C().claimStash();
      toast(r.moved ? `领回 ${r.moved} 件${r.left ? `，还有 ${r.left} 件装不下` : ''}` : '背包还是满的，先扩容或分解装备');
      sfx(r.ok ? 'success' : 'fail');
      refresh();
    });
    root.querySelectorAll('[data-cur]').forEach(el => el.onclick = () => {
      if (asDrawer) currencyModal(el.dataset.cur, root, w2 => bagModal(w2));
      else currencyModal(el.dataset.cur);
    });
    root.querySelectorAll('[data-item]').forEach(el => el.onclick = () => itemDetail(el.dataset.item, null, backToBag));
    // 招募券：直接从背包跳去招募（券本来就是在这里花掉的，别让玩家自己找入口）
    root.querySelectorAll('[data-gorecruit]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      setTab('home');
      setTimeout(() => openRecruit(), 250);
    });
  }
  // 卡片上的快捷键：宝箱直接开，经验模块/血清先选目标
  function bagModal(wrap) {
    // 抽屉形态也要有待领箱入口，否则从弹窗进来的玩家看不到"背包满时存下来的东西"
    const w = showPanel(wrap, '背包', `${stashBar()}${bagBody()}`);
    bindBag(w, true);
    return w;
  }
  // 道具详情卡：说明 + 在哪用 + 批量操作
  function itemDetail(itemId, wrap, backFn) {
    const S = C().S;
    const it = D.ITEMS[itemId];
    const goBack = backFn || (w2 => bagModal(w2));
    if (!it) return goBack(wrap);
    const n = S.items[itemId] || 0;
    const where = { explore: '副本探索中', character: '伙伴培养页', anywhere: '随时' }[it.where] || '—';
    let actions = '';
    if (it.type === 'box') {
      actions = `<div class="btn-row">
        <button class="btn small" data-open="1" ${n >= 1 ? '' : 'disabled'}>开 1 个</button>
        <button class="btn small" data-open="10" ${n >= 2 ? '' : 'disabled'}>开 10 个</button>
        <button class="btn small gold" data-open="0" ${n >= 1 ? '' : 'disabled'}>全部开（${n}）</button>
      </div>`;
    } else if (it.type === 'exp') {
      actions = `<div class="btn-row">
        <button class="btn small" data-exp="1" ${n >= 1 ? '' : 'disabled'}>用 1 个</button>
        <button class="btn small" data-exp="10" ${n >= 10 ? '' : 'disabled'}>用 10 个</button>
        <button class="btn small gold" data-exp="0" ${n >= 1 ? '' : 'disabled'}>全部用（${n}）</button>
      </div>
      `;
    } else if (it.type === 'serum') {
      const sd = it.serum || {};
      actions = `<div class="btn-row">
        <button class="btn small" data-serum="1" ${n >= 1 ? '' : 'disabled'}>用 1 支</button>
        <button class="btn small" data-serum="10" ${n >= 10 ? '' : 'disabled'}>用 10 支</button>
        <button class="btn small gold" data-serum="0" ${n >= 1 ? '' : 'disabled'}>全部用（${n}）</button>
      </div>
      <div style="font-size:11px;color:var(--dim);margin-top:6px;line-height:1.7">
        永久生效，不是临时增益。${sd.bloodline ? `只有「${sd.bloodline}」血统能用；` : '任何伙伴（含主角）都能用；'}每人每种上限 ${sd.max} 支。
      </div>`;
    } else if (it.type === 'consumable') {
      actions = run
        ? `<div class="btn-row"><button class="btn small gold" data-runuse="1">在本次探索中使用</button></div>`
        : `<div class="btn-row"><button class="btn small" data-gotoexplore="1">进副本后使用 ›</button></div>
           `;
    } else if (it.type === 'material') {
      actions = `<div class="note">强化装备时自动优先消耗</div>`;
    } else if (it.type === 'ticket') {
      const pool = D.RECRUIT_POOLS[it.pool] || {};
      const tk = C().ticketOf(it.pool);
      actions = `<div class="btn-row"><button class="btn small gold" data-gorecruit="1">去「${pool.name || '招募'}」使用（现有 ${tk ? tk.n : n} 张）</button></div>
        <div style="font-size:11px;color:var(--dim);margin-top:6px;line-height:1.7">
          招募时<b>自动优先扣券</b>，券不够才扣货币；十连要么 10 张券、要么给足货币。
        </div>`;
    }
    const body = `
      <div class="card mb3" style="display:flex;align-items:baseline;gap:10px">
        <b style="font-size:16px">${it.name}</b>
        <span style="margin-left:auto;color:var(--gold);font-weight:700">×${n}</span>
      </div>
      <div class="card mb3">
        <h3>说明</h3>
        <div class="note">${esc(it.desc || '')}</div>
      </div>
      <div class="card mb3">
        <h3>在哪用</h3>
        <div class="kv"><span class="k">使用场景</span><span>${where}</span></div>
        <div style="font-size:12px;color:var(--dim);line-height:1.8;margin-top:6px">${esc(it.use || '')}</div>
      </div>
      <div class="card mb3">
        <h3>去哪弄</h3>
        <div class="note">${esc(it.src || '副本掉落 / 商店兑换')}</div>
      </div>
      ${actions}
      <button class="btn ghost block mt4" data-back>‹ 返回背包</button>`;
    const w = showPanel(wrap, '道具详情', body);
    w.querySelector('[data-back]').onclick = () => goBack(w);
    const gr = w.querySelector('[data-gorecruit]');
    if (gr) gr.onclick = () => { closeModal(w); setTab('home'); setTimeout(() => openRecruit(), 220); };
    const afterChange = () => { renderTopbar(); if ((C().S.items[itemId] || 0) > 0) itemDetail(itemId, w, backFn); else goBack(w); };
    w.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      const want = +b.dataset.open;
      const cnt = want === 0 ? (C().S.items[itemId] || 0) : want;
      const doOpen = () => {
        const r = C().openBoxes(itemId, cnt);
        if (!r.ok) { toast(r.msg || '开箱失败'); return; }
        sfx('box');
        const chips = (r.equips || []).map(e => `<span class="reward-chip rtext-${e.rarity}">${itemIcon(it)} ${e.name} +${e.enhance}</span>`);
        if (r.sold) chips.push(`<span class="reward-chip">◆+${fmt(r.soldGain)}（自动分解 ${r.sold} 件）</span>`);
        refresh();
        lootPanel(`开箱结果（×${r.count}）`, chips.join(''), () => afterChange(), w);
      };
      if (cnt > 10) confirmBox('批量开箱', `确定一次开启 <b>${cnt}</b> 个「${it.name}」？`, doOpen);
      else doOpen();
    });
    w.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => {
      const want = +b.dataset.exp;
      pickExpTarget(itemId, want === 0 ? (C().S.items[itemId] || 0) : want, w, goBack);
    });
    w.querySelectorAll('[data-serum]').forEach(b => b.onclick = () => {
      const want = +b.dataset.serum;
      pickSerumTarget(itemId, want === 0 ? (C().S.items[itemId] || 0) : want, w, goBack);
    });
    const runUse = w.querySelector('[data-runuse]');
    if (runUse) runUse.onclick = () => {
      const eff = it.effect || {};
      if (!C().removeItem(itemId)) { toast('道具不足'); return; }
      const parts = [];
      if (eff.healPct) { Object.keys(run.hpPct).forEach(cid => { run.hpPct[cid] = Math.min(1, run.hpPct[cid] + eff.healPct); }); parts.push(`全队恢复 ${Math.round(eff.healPct * 100)}%`); }
      ['atkPct', 'spdPct', 'defPct'].forEach(k => { if (eff[k]) { run.buffs[k] = (run.buffs[k] || 0) + eff[k]; parts.push(`${D.CONSUMABLE_TAG[k]}+${Math.round(eff[k] * 100)}%`); } });
      persistRun();
      C().task('item1', 1); C().save();
      sfx(eff.healPct ? 'success' : 'coin');
      toast(`${it.name}：${parts.join(' · ')}`);
      render();
      afterChange();
    };
    const go = w.querySelector('[data-gotoexplore]');
    if (go) go.onclick = () => { closeModal(w); setTab('dungeon'); };
    return w;
  }
  // 经验道具：先选伙伴
  function pickExpTarget(itemId, count, wrap, backFn) {
    const S = C().S;
    const owned = Object.keys(S.chars);
    const goBack = backFn || (w2 => itemDetail(itemId, w2));
    if (!D.ITEMS[itemId] || (S.items[itemId] || 0) <= 0) { failToast('道具不足'); return goBack(wrap); }
    if (!owned.length) {
      setTab('home');
      if (wrap) closeModal(wrap);
      setTimeout(() => openRecruit(), 250);
      return;
    }
    const body = `
      <div class="note mb3">选择要吃「${D.ITEMS[itemId].name} ×${count}」的伙伴</div>
      ${owned.map(id => {
        const ch = D.charById[id], c = S.chars[id];
        return `<div class="list-row" data-target="${id}" style="cursor:pointer">
          ${charAvatar(id, 40)}
          <div class="grow"><div class="t1">${rarityTag(ch.rarity)} ${cname(id)}</div>
          <div class="t2">Lv.${c.lv} · ${ch.role} · EXP ${fmt(c.exp)}</div></div>
        </div>`;
      }).join('')}
      <button class="btn ghost block mt4" data-back>‹ 返回</button>`;
    const w = showPanel(wrap, '使用经验道具', body);
    w.querySelector('[data-back]').onclick = () => goBack(w);
    w.querySelectorAll('[data-target]').forEach(el => el.onclick = () => {
      const r = C().useExpItem(el.dataset.target, itemId, count);
      if (r.ok) toast(r.msg); else failToast(r.msg);
      sfx(r.ok ? 'level' : 'fail');
      renderTopbar();
      if ((C().S.items[itemId] || 0) > 0) pickExpTarget(itemId, Math.min(count, C().S.items[itemId]), w, backFn);
      else goBack(w);
    });
    return w;
  }
  // 血清：先选伙伴（血统血清只列对应血统的人）
  function pickSerumTarget(itemId, count, wrap, backFn) {
    const S = C().S;
    const it = D.ITEMS[itemId];
    const goBack = backFn || (w2 => itemDetail(itemId, w2));
    if (!it || (S.items[itemId] || 0) <= 0) { failToast('道具不足'); return goBack(wrap); }
    const sd = it.serum || {};
    const serumId = itemId.replace(/^serum_/, '');
    const rows = [];
    const pBl = S.player.bloodline;
    rows.push({ id: '@player', label: `🧍 ${S.player.name || '主角'}`, sub: pBl ? `主角 · ${pBl}` : '主角 · 未觉醒血统', bl: pBl });
    Object.keys(S.chars).forEach(id => {
      const ch = D.charById[id];
      if (!ch) return;
      const c = S.chars[id];
      rows.push({ id, label: `${rarityTag(ch.rarity)} ${cname(id)}`, sub: `Lv.${c.lv} · ${ch.role} · ${c.bloodlineLv > 0 ? ch.bloodline : '未觉醒'}`, bl: c.bloodlineLv > 0 ? ch.bloodline : null });
    });
    const usable = rows.filter(r => !sd.bloodline || r.bl === sd.bloodline);
    const body = `
      <div class="note mb3">
        选择要吃「${it.name} ×${count}」的伙伴 —— <b>永久生效</b>
      </div>
      ${usable.length ? usable.map(r => {
        const taken = C().serumTaken(r.id, serumId);
        const full = taken >= sd.max;
        return `<div class="list-row" data-serumtarget="${r.id}" style="cursor:pointer${full ? ';opacity:.5' : ''}">
          <div class="grow"><div class="t1">${r.label}</div>
          <div class="t2">${r.sub} · 已服 ${taken}/${sd.max}${full ? ' · 已满' : ''}</div></div>
        </div>`;
      }).join('') : `<div class="empty">没有可用对象：这支血清只有「${sd.bloodline}」血统能用（先去伙伴页觉醒血统）</div>`}
      <button class="btn ghost block mt4" data-back>‹ 返回</button>`;
    const w = showPanel(wrap, '使用血清', body);
    w.querySelector('[data-back]').onclick = () => goBack(w);
    w.querySelectorAll('[data-serumtarget]').forEach(el => el.onclick = () => {
      const r = C().useSerum(el.dataset.serumtarget, serumId, count);
      if (r.ok) toast(r.msg); else failToast(r.msg);
      sfx(r.ok ? 'success' : 'fail');
      renderTopbar();
      pickSerumTarget(itemId, count, w, backFn);
    });
    return w;
  }
  // 炼化台：强化材料 + 点数 → 血清
  function refineModal(wrap, onBack) {
    const S = C().S;
    const goBack = onBack || (w2 => bagModal(w2));
    const body = `
      <div style="font-size:12px;color:var(--dim);line-height:1.7;margin-bottom:10px">
        血清是<b>永久强化剂</b>：喂给某名伙伴后永久加属性，每人每种有上限。
        血统血清只有对应血统能用——先觉醒血统，再决定喂给谁。
      </div>
      ${D.SERUMS.map(s => {
        const itemId = D.SERUM_ITEM(s.id);
        const own = S.items[itemId] || 0;
        const matName = D.ITEMS[s.mat].name;
        const haveMat = S.items[s.mat] || 0;
        const can = Math.min(Math.floor(haveMat / s.matN), Math.floor(S.cur.points / s.points));
        return `<div class="card mb2">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div class="grow">
              <div style="font-size:13px">💊 <b>${s.name}</b>${s.bloodline ? ` <span style="color:var(--gold);font-size:11px">${s.bloodline}专属</span>` : ''}</div>
              <div class="hint mt1">${D.ITEMS[itemId].desc.replace(/^【[^】]*】/, '')}</div>
              <div class="hint mt1">配方：${matName} ×${s.matN} + ◈${s.points}　（现有 ${matName} ${haveMat} · ◈${fmt(S.cur.points)}）</div>
              <div style="font-size:11px;color:${own ? 'var(--green)' : 'var(--dim)'};margin-top:4px">已有血清 ×${own}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <button class="btn small" data-refine="1:${s.id}" ${can >= 1 ? '' : 'disabled'}>炼 ×1</button>
              <button class="btn small" data-refine="10:${s.id}" ${can >= 10 ? '' : 'disabled'}>炼 ×10</button>
            </div>
          </div>
        </div>`;
      }).join('')}
      <button class="btn ghost block mt1" data-back>‹ 返回背包</button>`;
    const w = showPanel(wrap, '⚗️ 炼化台', body);
    w.querySelector('[data-back]').onclick = () => goBack(w);
    w.querySelectorAll('[data-refine]').forEach(el => el.onclick = () => {
      const [n, id] = el.dataset.refine.split(':');
      const r = C().craftSerum(id, +n);
      if (r.ok) toast(r.msg); else failToast(r.msg, el);
      sfx(r.ok ? 'success' : 'fail');
      renderTopbar();
      refineModal(w, onBack);
    });
    return w;
  }
  function settingsModal(wrap) {
    const S = C().S;
    const body = `
      <div class="card">
        <h3>玩法说明</h3>
        
        <div class="btn-row">
          <button class="btn small" data-act="open-guide">❓ 玩法指南</button>
          <button class="btn small" data-act="open-curdoc">▤ 货币图鉴</button>
        </div>
      </div>
      <div class="card">
        <h3>战斗速度</h3>
        <div class="btn-row">${[1, 2, 3].map(s => `<button class="btn small ${S.settings.speed === s ? 'primary' : ''}" data-speed="${s}">${s}×</button>`).join('')}</div>
      </div>
      <div class="card">
        <h3>战斗与音效</h3>
        <div class="list-row">
          <div class="grow"><div class="t1">自动战斗（直接出结果）</div><div class="t2">开启后进入战斗立即结算，不再逐帧播放，适合挂机刷本</div></div>
          <button class="btn small ${S.settings.autoBattle ? 'primary' : ''}" data-toggle="autoBattle">${S.settings.autoBattle ? '已开启' : '已关闭'}</button>
        </div>
        <div class="list-row">
          <div class="grow"><div class="t1">音效</div><div class="t2">点击 / 强化 / 开箱 / 战斗胜负的提示音，可随时关闭</div></div>
          <button class="btn small ${S.settings.sfx !== false ? 'primary' : ''}" data-toggle="sfx">${S.settings.sfx !== false ? '已开启' : '已关闭'}</button>
        </div>
        <div class="list-row">
          <div class="grow"><div class="t1">大额消费二次确认</div><div class="t2">单笔花费达到 1000 时，先把"花的是哪种货币、还剩多少"报一遍再扣</div></div>
          <button class="btn small ${S.settings.confirmBig !== false ? 'primary' : ''}" data-toggle="confirmBig">${S.settings.confirmBig !== false ? '已开启' : '已关闭'}</button>
        </div>
        <div class="list-row">
          <div class="grow"><div class="t1">通关结算自动进下一关</div><div class="t2">胜利结算 ${AUTO_NEXT_SEC} 秒内没做选择，就自动接着打下一关；关掉之后结算页会一直等你点</div></div>
          <button class="btn small ${S.settings.autoNext !== false ? 'primary' : ''}" data-toggle="autoNext">${S.settings.autoNext !== false ? '已开启' : '已关闭'}</button>
        </div>
      </div>
      <div class="card">
        <h3>自动分解 <span class="sub">背包满之前就开始省格子</span></h3>
        <div class="list-row">
          <div class="grow"><div class="t1">自动分解 N 装备</div><div class="t2">掉到 N 品质直接换成 ◆异界结晶</div></div>
          <button class="btn small ${S.settings.autoSellN ? 'primary' : ''}" data-autosell="autoSellN">${S.settings.autoSellN ? '已开启' : '已关闭'}</button>
        </div>
        <div class="list-row">
          <div class="grow"><div class="t1">自动分解 R 装备</div><div class="t2">掉到 R 品质直接换成 ◆异界结晶</div></div>
          <button class="btn small ${S.settings.autoSellR ? 'primary' : ''}" data-autosell="autoSellR">${S.settings.autoSellR ? '已开启' : '已关闭'}</button>
        </div>
      </div>
      <div class="card">
        <h3>存档与备份</h3>
        <div class="hint mb2">进度只存在这台设备里</div>
        <div class="btn-row">
          <button class="btn small" data-save-export="1">📤 导出存档</button>
          <button class="btn small" data-save-import="1">📥 导入存档</button>
        </div>
        <div class="hint mt3 mb2">手动存档槽（三格）：</div>
        ${C().slotInfo().map(s => `
          <div class="list-row">
            <div class="grow"><div class="t1">存档槽 ${s.slot}</div>
            <div class="t2">${s.exists && s.meta ? `Lv.${s.meta.level} · 深井 ${s.meta.floor} 层 · ${s.meta.time ? new Date(s.meta.time).toLocaleString() : '—'}` : '空'}</div></div>
            <button class="btn small" data-slot-save="${s.slot}">存入</button>
            <button class="btn small ghost" data-slot-load="${s.slot}" ${s.exists ? '' : 'disabled'}>读取</button>
          </div>`).join('')}
      </div>
      <div class="card">
        <h3>主角列表</h3>
        ${C().protagonistList().map(p => `
          <div class="list-row" style="${p.current ? 'border-color:var(--gold)' : ''}">
            <div class="grow"><div class="t1">${esc(p.name)} ${p.current ? '<span class="tag" style="color:var(--gold);border-color:var(--gold)">当前</span>' : ''}</div>
            <div class="t2">Lv.${p.level} · ${p.bloodline ? p.bloodline + '血统 Lv.' + p.bloodlineLv : '未觉醒血统'}</div></div>
            ${p.current ? '' : `<button class="btn small" data-switchprotag="${p.altIndex}">切换</button>`}
          </div>`).join('')}
        <div style="font-size:11px;color:var(--dim);margin:8px 0">新建主角从 Lv.1 开始，可体验不同血统路线；世界进度、货币、队伍不受影响</div>
        <button class="btn small block" data-newprotag="1">➕ 新建主角</button>
      </div>
      <div class="card">
        <h3>危险区</h3>
        <button class="btn small ghost" data-reset="1" style="color:var(--accent)">删除当前进度，重新开始</button>
      </div>
      <div style="text-align:center;font-size:10px;color:var(--dim);padding:8px;opacity:.6" data-ver>残域 V${GAME_VER}</div>
    `;
    const w = showPanel(wrap, '设置与存档', body);
    let verTaps = 0, verTimer = null;
    w.querySelector('[data-ver]').onclick = () => {
      verTaps++;
      clearTimeout(verTimer);
      verTimer = setTimeout(() => { verTaps = 0; }, 2000);
      if (verTaps >= 7) {
        if (!gmAllowed()) { toast(`残域 V${GAME_VER}（内部调试入口已关闭）`); return; }
        closeModal(w); gmModal();
      }
    };
    w.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
      C().S.settings.speed = +b.dataset.speed; C().save();
      settingsModal(w);
    });
    w.querySelectorAll('[data-autosell]').forEach(b => b.onclick = () => {
      const k = b.dataset.autosell;
      C().S.settings[k] = !C().S.settings[k];
      C().save();
      toast(`${k === 'autoSellN' ? 'N' : 'R'} 装备自动分解已${C().S.settings[k] ? '开启' : '关闭'}`);
      settingsModal(w);
    });
    w.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      const k = b.dataset.toggle;
      const cur = C().S.settings[k] !== false;
      C().S.settings[k] = !cur;
      C().save();
      const toggleName = { sfx: '音效', autoBattle: '自动战斗', confirmBig: '大额消费二次确认', autoNext: '结算自动进下一关' }[k] || k;
      toast(`${toggleName}已${C().S.settings[k] !== false ? '开启' : '关闭'}`);
      if (k === 'sfx' && C().S.settings.sfx !== false) sfx('success');
      settingsModal(w);
    });
    /* ---------- 存档导出 / 导入 / 存档槽 ---------- */
    const saveExport = w.querySelector('[data-save-export]');
    if (saveExport) saveExport.onclick = () => {
      const json = C().exportSave();
      const m = modal('导出存档', `
        <div class="hint mb2">全选下面这段文字复制走</div>
        <textarea id="exp-ta" readonly style="width:100%;height:150px;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px;font-size:11px;line-height:1.5;outline:none;word-break:break-all">${esc(json)}</textarea>
        <div class="btn-row mt3"><button class="btn small primary" data-copy>📋 复制</button><button class="btn small ghost" data-close>关闭</button></div>`, { center: true });
      const ta = m.querySelector('#exp-ta');
      ta.onclick = () => ta.select();
      m.querySelector('[data-copy]').onclick = () => {
        ta.select();
        let done = false;
        try { done = document.execCommand && document.execCommand('copy'); } catch (e) { done = false; }
        if (navigator.clipboard && !done) { navigator.clipboard.writeText(json).then(() => toast('已复制')).catch(() => toast('复制失败，请手动全选')); }
        else toast(done ? '已复制' : '复制失败，请手动全选');
      };
      m.querySelector('[data-close]').onclick = () => closeModal(m);
    };
    const saveImport = w.querySelector('[data-save-import]');
    if (saveImport) saveImport.onclick = () => {
      const m = modal('导入存档', `
        <div class="hint mb2">粘到下面，确认后<b style="color:var(--accent)">当前进度会被覆盖</b></div>
        <textarea id="imp-ta" placeholder="在这里粘贴存档内容…" style="width:100%;height:150px;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px;font-size:11px;line-height:1.5;outline:none;word-break:break-all"></textarea>
        <div class="btn-row mt3"><button class="btn small primary" data-doimport>确认导入</button><button class="btn small ghost" data-close>取消</button></div>`, { center: true });
      m.querySelector('[data-close]').onclick = () => closeModal(m);
      m.querySelector('[data-doimport]').onclick = () => {
        const txt = (m.querySelector('#imp-ta').value || '').trim();
        if (!txt) { toast('先粘贴存档内容'); return; }
        confirmBox('确认导入', '当前进度将被这段存档覆盖，确定？', () => {
          const r = C().importSave(txt);
          closeModal(m);
          if (!r.ok) { toast(r.msg || '导入失败'); return; }
          toast('导入成功');
          setTab('home');
        });
      };
    };
    w.querySelectorAll('[data-slot-save]').forEach(b => b.onclick = () => {
      const n = +b.dataset.slotSave;
      confirmBox('存入存档槽', `把当前进度存进「存档槽 ${n}」？该槽原有的内容会被覆盖。`, () => {
        toast(C().saveSlot(n) ? `已存入存档槽 ${n}` : '保存失败（存储空间不足？）');
        settingsModal(w);
      });
    });
    w.querySelectorAll('[data-slot-load]').forEach(b => b.onclick = () => {
      const n = +b.dataset.slotLoad;
      confirmBox('读取存档槽', `用「存档槽 ${n}」覆盖当前进度？当前进度不会自动备份。`, () => {
        if (C().loadSlot(n)) { toast(`已读取存档槽 ${n}`); setTab('home'); }
        else toast('读取失败');
      });
    });
    w.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
      const a = el.dataset.act;
      if (a === 'open-guide') guideModal(null, w);
      else if (a === 'open-curdoc') currencyModal(null, w);
    });
    w.querySelectorAll('[data-switchprotag]').forEach(b => b.onclick = () => {
      const r = C().switchProtagonist(+b.dataset.switchprotag);
      toast(r.msg, 2200);
      closeModal(w); if (r.ok) { refresh(); render(); }
    });
    w.querySelector('[data-newprotag]').onclick = () => {
      closeModal(w);
      const nw = modal('新建主角', `
        <div class="note mb3">新主角从 Lv.1 开始（当前主角保留）</div>
        <input id="np-input" maxlength="12" placeholder="输入新主角名字（12字内）" style="width:100%;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px;font-size:15px;outline:none;margin-bottom:12px" />
        <button class="btn primary block" data-ok>创建并开始探索</button>`, { center: true });
      nw.querySelector('[data-ok]').onclick = () => {
        const r = C().createProtagonist(nw.querySelector('#np-input').value);
        toast(r.msg, 2400);
        if (r.ok) { closeModal(nw); refresh(); render(); }
      };
    };
    w.querySelector('[data-reset]').onclick = () => {
      closeModal(w);
      confirmBox('删除进度', '将永久删除当前游戏进度（不影响手动存档槽），确定重新开始？', () => {
        C().wipeSave();
        location.reload();
      });
    };
    return w;
  }

  /* ================= 战斗播放器 ================= */
  // 胜利结算的自动倒计时：5 秒内没点，就自动走"主按钮"那条（默认就是「下一关」）。
  // 只对胜利生效，失败页不自动跳；没有主按钮（最后一关打完）时也不自动，避免把人越推越远。
  // 结算页倒计时：原来 5 秒，看掉落清单偏赶（自动接了关就没法回头看了），放宽到 8 秒（V9.5）
  const AUTO_NEXT_SEC = 8;
  // 副本"波间结算"的倒计时：比整关结算短，副本是一路打到底的
  function autoNextIndex(win, acts) {
    if (!win || !acts || !acts.length) return -1;
    return acts.findIndex(a => a.primary);
  }
  // 倒计时文案与按钮拼在一处：测试与界面共用同一份（文案与行为同源）
  function autoNextBtnHtml(label, sec) { return `${label} <span class="auto-cd">${sec}s</span>`; }
  // opts.mult：整队倍率（深井印记用）；opts.extra 为额外属性百分比（预留）
  function buildAllies(hpPctMap, extraBuffs, opts) {
    const S = C().S;
    const mult = (opts && opts.mult) || 1;
    const fb = C().factionBuffs(S.party);
    const buffAtk = (extraBuffs && extraBuffs.atkPct) || 0;
    const buffSpd = (extraBuffs && extraBuffs.spdPct) || 0;
    const allies = [];
    // 上阵 5 格里就有主角本人（'@player'）：站哪一排完全看他占的是哪一格（0/1 前排、2/3/4 后排）
    S.party.forEach((id, idx) => {
      if (!id) return;
      if (hpPctMap && hpPctMap[id] !== undefined && hpPctMap[id] <= 0.01) return;   // 这一波他已经倒下了
      const position = idx < 2 ? 'front' : 'back';
      if (id === '@player') {
        const pst = C().effectivePlayerStats();
        // 阵型加成以前只加在招募角色身上（这支缺 fb.*），主角吃不到——
        // 而队伍页照常写着"攻击+X% 生命+X%"，主角还正是让五行归元阵成立的万能补位（V9.5 修）
        const pFullHp = Math.round(pst.hp * (1 + fb.hpPct));
        const pHp = hpPctMap && hpPctMap['@player'] !== undefined ? Math.max(1, Math.round(pFullHp * hpPctMap['@player'])) : pFullHp;
        allies.push(Object.assign({}, pst, {
          name: cname('@player'), kind: 'warrior', faction: null,
          position,
          skills: C().protagonistSkills(), skillLv: S.player.skillLv || [1, 1, 1],
          atk: Math.round(pst.atk * (1 + fb.atkPct + buffAtk) * mult),
          def: Math.round(pst.def * mult),
          spd: Math.round(pst.spd * (1 + buffSpd) * mult),
          hp: Math.round(pHp * mult), maxHp: Math.round(pFullHp * mult),
          skillMult: (pst.skillMult || 1) + fb.skillPct,
          charId: '@player',
        }));
        return;
      }
      const base = D.charById[id];
      const eff = C().effectiveStats(id);
      const fullHp = Math.round(eff.hp * (1 + fb.hpPct));
      const hp = hpPctMap && hpPctMap[id] !== undefined ? Math.max(1, Math.round(fullHp * hpPctMap[id])) : fullHp;
      allies.push(Object.assign({}, eff, {
        name: cname(id), kind: base.kind, faction: base.faction,
        position,
        skills: base.skills, skillLv: S.chars[id].skillLv,
        atk: Math.round(eff.atk * (1 + fb.atkPct + buffAtk) * mult),
        def: Math.round(eff.def * mult),
        spd: Math.round(eff.spd * (1 + buffSpd) * mult),
        hp: Math.round(hp * mult), maxHp: Math.round(fullHp * mult),
        skillMult: eff.skillMult + fb.skillPct,
        charId: id,
      }));
    });
    // 随行伴生体：全队五行属性（进本看世界属性算克制）+ 减伤类被动
    const beastElem = C().activeBeastElem();
    const bp = C().beastPct();
    allies.forEach(a => {
      a.beastElem = beastElem;
      if (bp.dmgReduce) a.dmgReduce = (a.dmgReduce || 0) + bp.dmgReduce;
    });
    return allies;
  }
  // 战斗配置：{ title, allies, enemies, worldId, maxRounds, onEnd(win, result, hpLeft) }
  function startBattle(cfg) {
    const S = C().S;
    // 敌人的五行属性跟着世界走（深井没有世界就不带属性）—— 五行克制在战斗引擎里结算
    const foeElem = cfg.worldId ? D.worldElement(cfg.worldId) : null;
    if (foeElem) (cfg.enemies || []).forEach(e => { if (!e.elem) e.elem = foeElem; });
    const res = window.Battle.run({
      allies: JSON.parse(JSON.stringify(cfg.allies)),
      enemies: cfg.enemies,
      worldId: cfg.worldId,
      maxRounds: cfg.maxRounds,
      allyHitMod: (window.Battle.MECHANICS[cfg.worldId] || {}).allyHitMod || 0,
    });
    const root = document.getElementById('battle-root');
    const overlay = document.createElement('div');
    overlay.id = 'battle-overlay';
    overlay.innerHTML = `
      <div class="b-head">
        <div class="b-title">${esc(cfg.title)}</div>
        <button class="btn small ghost" data-speedbtn>${S.settings.speed}×速度</button>
      </div>
      <div class="b-field">
        <div class="b-row enemies"></div>
        <div class="b-line-label" data-line="back">我方后排</div>
        <div class="b-row allies back"></div>
        <div class="b-line-label" data-line="front">我方前排 · 敌人优先打这里</div>
        <div class="b-row allies front"></div>
      </div>
      <div id="battle-log"></div>
      <div class="b-controls">
        <div class="b-potions" data-bpotions></div>
        <button class="btn block" data-skip>跳过 ⏩</button>
      </div>`;
    root.appendChild(overlay);
    // 单位状态
    const units = {};
    const start = res.frames[0];
    start.allies.concat(start.enemies).forEach(u => { units[u.uid] = Object.assign({}, u); });
    const eRow = overlay.querySelector('.enemies');
    // 我方按站位排成两行：上排后排、下排前排——和队伍页排的一模一样，
    // 这样"谁在挨打"一眼看得出来（之前是一整条平铺，站位等于看不见）。
    const aBackRow = overlay.querySelector('.allies.back');
    const aFrontRow = overlay.querySelector('.allies.front');
    function unitHtml(u) {
      // 这一波进场时的真实血线：副本是带血打下一波的，不能重画成满血
      const pct0 = Math.max(0, Math.min(100, Math.round((u.hp / u.maxHp) * 100)));
      return `<div class="unit ${u.side === 'enemy' ? 'enemy' : ''} ${u.isBoss ? 'boss' : ''}" id="u-${u.uid}">
        <div class="u-avatar">${esc(u.name[0])}</div>
        <div class="u-name">${esc(u.name)}</div>
        <div class="bar hp ${pct0 < 35 ? 'low' : ''}"><i style="width:${pct0}%"></i></div>
        <div class="u-hp">${pct0}%</div>
        ${u.side === 'ally' ? '<div class="bar energy"><i style="width:0%"></i></div>' : ''}
      </div>`;
    }
    eRow.innerHTML = start.enemies.map(unitHtml).join('');
    aFrontRow.innerHTML = start.allies.filter(u => u.position === 'front').map(unitHtml).join('');
    aBackRow.innerHTML = start.allies.filter(u => u.position !== 'front').map(unitHtml).join('');
    const logBox = overlay.querySelector('#battle-log');
    const nameOf = uid => (units[uid] || {}).name || '?';
    function log(text) {
      const d = document.createElement('div');
      d.textContent = text;
      logBox.appendChild(d);
      logBox.scrollTop = logBox.scrollHeight;
      while (logBox.children.length > 60) logBox.firstChild.remove();
    }
    function updateUnit(uid) {
      const u = units[uid];
      const el = overlay.querySelector('#u-' + uid);
      if (!el || !u) return;
      const pct = Math.max(0, u.hp / u.maxHp * 100);
      const bar = el.querySelector('.bar.hp');
      bar.classList.toggle('low', pct < 35);
      bar.querySelector('i').style.width = pct + '%';
      const txt = el.querySelector('.u-hp');
      if (txt) txt.textContent = Math.round(pct) + '%';
      el.classList.toggle('dead', u.hp <= 0);
    }
    function floater(uid, text, cls) {
      const el = overlay.querySelector('#u-' + uid);
      if (!el) return;
      const f = document.createElement('div');
      f.className = 'floater ' + (cls || 'dmg');
      f.textContent = text;
      el.appendChild(f);
      setTimeout(() => f.remove(), 850);
    }
    function flash(uid, cls) {
      const el = overlay.querySelector('#u-' + uid);
      if (!el) return;
      el.classList.remove('hit', 'acting');
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 300);
    }
    function setEnergy(uid, val) {
      const el = overlay.querySelector('#u-' + uid);
      if (!el) return;
      const bar = el.querySelector('.bar.energy i');
      if (bar) bar.style.width = Math.min(100, val) + '%';
    }
    const energyMap = {};
    let speed = S.settings.speed;
    /* 战备补给条：副本里随时能喝，但一场战斗的帧是"开打前一次算完"的，
       所以喝下去的药从**下一波**进场时生效（血线低就趁这波还没打完先喝）。 */
    const potBox = overlay.querySelector('[data-bpotions]');
    function paintPotions() {
      if (!potBox) return;
      const bar = run ? potionBarHtml() : '';
      if (!bar) { potBox.innerHTML = ''; return; }
      const lastWave = run.wave >= run.waves.length - 1;
      // 整场战斗是"开打前一次算完"的，药剂只能作用于**下一波进场**。
      // 最后一波后面没有下一波了（这一关打完 run 就清空），在这里喝药等于白扣道具，所以不给按。
      if (lastWave) {
        potBox.innerHTML = '<div class="b-potion-tip">收官战 · 药剂要到下一关才生效（每关开局满血），先留着吧</div>';
        return;
      }
      potBox.innerHTML = `<div class="b-potion-tip">战备补给 · 喝了从下一波进场生效</div>${bar}`;
      bindPotionButtons(overlay, paintPotions);
    }
    paintPotions();
    overlay.querySelector('[data-speedbtn]').onclick = ev => {
      speed = speed >= 3 ? 1 : speed + 1;
      S.settings.speed = speed; C().save();
      ev.target.textContent = speed + '×速度';
    };
    let idx = 0, skipped = false, finished = false;
    overlay.querySelector('[data-skip]').onclick = () => { skipped = true; };
    if (start.note) log(`⚠ 世界机制：${start.note}`);
    // 带血进场时把血线写出来：玩家才知道血是"继承"过来的，不是被刷新了
    const carried = start.allies.filter(u => u.hp < u.maxHp)
      .map(u => `${u.name} ${Math.round(u.hp / u.maxHp * 100)}%`);
    if (carried.length) log(`🩸 带血进场：${carried.join(' · ')}`);
    sfx('battle');
    // 自动战斗：设置里打开后直接出结果（刷材料时不用逐场看动画）
    if (S.settings.autoBattle) setTimeout(() => { skipped = true; }, 120);

    function applyFrame(f) {
      switch (f.type) {
        case 'round': if (f.n <= 5 || f.n % 5 === 0) log(`—— 第 ${f.n} 回合 ——`); break;
        case 'attack': flash(f.actor, 'acting'); energyMap[f.actor] = Math.min(100, (energyMap[f.actor] || 0) + 30); setEnergy(f.actor, energyMap[f.actor]); break;
        case 'skill':
          flash(f.actor, 'acting');
          log(`✨ ${nameOf(f.actor)} 使用【${f.name}】`);
          if (f.ult) { energyMap[f.actor] = 0; setEnergy(f.actor, 0); }
          break;
        case 'damage': {
          const u = units[f.target];
          if (u) { u.hp = Math.max(0, u.hp - f.dmg); updateUnit(f.target); }
          floater(f.target, (f.crit ? '暴击 ' : '-') + fmt(f.dmg), f.crit ? 'crit' : 'dmg');
          flash(f.target, 'hit');
          if (f.healed) { const s = units[f.source]; if (s) { s.hp = Math.min(s.maxHp, s.hp + f.healed); updateUnit(f.source); floater(f.source, '+' + fmt(f.healed), 'heal'); } }
          energyMap[f.target] = Math.min(100, (energyMap[f.target] || 0) + 15); setEnergy(f.target, energyMap[f.target]);
          if (f.killed) log(`💀 ${nameOf(f.target)} 倒下`);
          break;
        }
        case 'dot': {
          const u = units[f.target];
          if (u) { u.hp = Math.max(0, u.hp - f.dmg); updateUnit(f.target); }
          floater(f.target, `-${fmt(f.dmg)}`, 'dmg');
          if (f.killed) log(`💀 ${nameOf(f.target)} 倒下`);
          break;
        }
        case 'heal': {
          const u = units[f.target];
          if (u) { u.hp = Math.min(u.maxHp, u.hp + f.amount); updateUnit(f.target); }
          floater(f.target, '+' + fmt(f.amount), 'heal');
          break;
        }
        case 'shield': floater(f.target, '🛡+' + fmt(f.amount), 'heal'); break;
        case 'dodge': floater(f.target, '闪避', 'miss'); break;
        case 'skip': log(`😵 ${nameOf(f.actor)} 无法行动`); break;
        case 'buff': floater(f.target, '↑ ' + f.name, 'heal'); break;
        case 'phase': log(`🔥 ${f.text}`); break;
        case 'revive': {
          const u = units[f.boss];
          if (u) { u.hp = Math.round(u.maxHp * 0.3); updateUnit(f.boss); }
          log(`♻ ${f.text}`);
          break;
        }
        case 'summon': log(`🕯 ${f.text}`); break;
        case 'rule': log(`👁 ${f.text}`); break;
        case 'nearDeath': floater(f.target, '⚠ 濒死', 'crit'); break;
      }
    }
    function finish() {
      if (finished) return;
      finished = true;
      // 补算剩余帧（保证状态正确）
      for (; idx < res.frames.length; idx++) { const f = res.frames[idx]; if (['damage', 'dot', 'heal', 'revive'].includes(f.type)) applyFrame(f); }
      const endF = res.frames[res.frames.length - 1];
      sfx(res.win ? 'win' : 'lose');
      const hpLeft = {};
      start.allies.forEach(u => { const st = units[u.uid]; hpLeft[u.uid] = Math.max(0, st.hp / st.maxHp); });
      const outcome = cfg.onEnd(res.win, res, units) || {};
      const rewards = outcome.rewards || [];
      const acts = outcome.actions || [];
      /* 波与波之间**不弹结算页**：这一波打完直接接下一波（父亲大人 2026-09-15 定）。
         只在战斗画面上停一瞬，飘一行"第 N 波已通过"，然后自己接着打。
         用过的药剂已经在 run.hpPct / run.buffs 里，下一波进场时自然带上。 */
      if (outcome.seamless && res.win) {
        if (outcome.log && outcome.log.length) log('📦 本波收获：' + outcome.log.join(' · '));
        const tip = document.createElement('div');
        tip.className = 'b-seamless';
        tip.textContent = outcome.sub || '本波通过，继续推进…';
        overlay.appendChild(tip);
        setTimeout(() => {
          overlay.remove();
          if (outcome.after) outcome.after();
        }, outcome.seamlessMs || 900);
        return;
      }
      // 倒计时目标：胜利时优先"主按钮"（默认就是「下一关」）。
      // 关闭设置里的「结算自动进下一关」后，autoIdx 直接算作 -1，不显示倒计时。
      const autoIdx = C().S.settings.autoNext !== false ? autoNextIndex(res.win, acts) : -1;
      // 波间结算用更短的倒计时：副本是一路打到底的，不用等满 5 秒
      const autoSec = outcome.autoSec || AUTO_NEXT_SEC;
      const panel = document.createElement('div');
      panel.className = 'b-result';
      panel.innerHTML = `
        <h2 class="${res.win ? 'win' : 'lose'}">${res.win ? '胜 利' : '任务失败'}</h2>
        <div style="color:var(--dim);font-size:12px">${res.rounds} 回合${outcome.sub ? ' · ' + outcome.sub : ''}</div>
        ${rewards.length ? `<div class="reward-chips">${rewards.map(r => `<span class="reward-chip">${r}</span>`).join('')}</div>` : ''}
        ${outcome.extraHtml || ''}
        ${acts.length ? `<div class="btn-row" style="max-width:340px;width:100%">
          ${acts.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-bact="${i}">${i === autoIdx ? autoNextBtnHtml(a.label, autoSec) : a.label}</button>`).join('')}
        </div>` : ''}
        <button class="btn ${acts.length ? 'ghost' : 'primary'}" style="min-width:200px" data-close>${outcome.closeLabel || (res.win ? (acts.length ? '收下奖励并返回' : '收下奖励') : '返回')}</button>`;
      overlay.appendChild(panel);
      if (outcome.onExtra) outcome.onExtra(panel);
      let autoT = null, autoLeft = autoSec;
      const clearAuto = () => { if (autoT) { clearInterval(autoT); autoT = null; } };
      panel.querySelector('[data-close]').onclick = () => {
        clearAuto();
        overlay.remove();
        if (outcome.after) outcome.after();
      };
      // 结算页的快捷动作：不回到世界列表也能接着打（推图节奏不断）
      panel.querySelectorAll('[data-bact]').forEach(b => b.onclick = () => {
        clearAuto();
        const a = acts[+b.dataset.bact];
        overlay.remove();
        if (a && a.run) a.run();
      });
      // 倒计时：走完自动点一次主按钮（默认「下一关」）。手动点了任意按钮就取消。
      if (autoIdx >= 0) {
        const btn = panel.querySelector(`[data-bact="${autoIdx}"]`);
        autoT = setInterval(() => {
          autoLeft--;
          if (autoLeft <= 0) {
            clearAuto();
            const auto = acts[autoIdx];
            overlay.remove();
            if (auto && auto.run) auto.run();
            return;
          }
          if (btn) btn.innerHTML = autoNextBtnHtml(acts[autoIdx].label, autoLeft);
        }, 1000);
      }
    }
    function step() {
      if (finished) return;
      if (skipped) { finish(); return; }
      const f = res.frames[idx++];
      if (!f || f.type === 'end') { finish(); return; }
      applyFrame(f);
      const delay = f.type === 'round' ? 260 : ['skill', 'phase', 'revive', 'summon'].includes(f.type) ? 520 : 300;
      setTimeout(step, delay / speed);
    }
    setTimeout(step, 400);
  }

  /* ================= 副本战斗流程 ================= */
  function rewardChips(got) {
    return got.map(g => {
      if (g.k === 'equip') return `<span class="rtext-${g.v.rarity}">🗡${g.v.name}</span>`;
      if (g.k === 'exp') return `EXP+${fmt(g.v)}`;
      if (g.k === 'item') return `🎒${D.ITEMS[g.v].name}${g.n > 1 ? '×' + g.n : ''}`;
      return `${curIcon(g.k)}+${fmt(g.v)}${g.sold ? '(自动分解)' : ''}`;
    });
  }
  // 同一批掉落，换成一行纯文字（无缝连波时写进战斗日志用）
  function waveLogLines(got) {
    return (got || []).map(g => {
      if (g.k === 'equip') return `🗡${g.v.name}+${g.v.enhance}`;
      if (g.k === 'exp') return `EXP+${fmt(g.v)}`;
      if (g.k === 'item') return `${D.ITEMS[g.v].name}×${g.n || 1}`;
      return `${curName(g.k)}+${fmt(g.v)}`;
    });
  }
  function doNodeBattle(kind, onDone, premadeEnemies) {
    const Dun = window.Dungeon;
    const allies = buildAllies(run.hpPct, run.buffs);
    if (!allies.length) { toast('全队重伤，探索失败'); endRun(false); return; }
    const enemies = premadeEnemies || Dun.makeEnemies(run.worldId, run.diff, run.stage, kind);
    const w = D.WORLDS.find(x => x.id === run.worldId);
    startBattle({
      title: `${w.name} 第 ${run.stage}/12 关 · 第 ${run.wave + 1}/${run.waves.length} 波 · ${WAVE_NAME[kind] || '遭遇战'}`,
      allies, enemies, worldId: run.worldId,
      onEnd(win, res, units) {
        if (!win) {
          return { rewards: [], sub: '队伍全员重伤', after: () => endRun(false) };
        }
        const g = Dun.grantRewards(run.worldId, run.diff, run.stage, kind);
        window.Core.addCharExp(C().S.party.filter(Boolean), g.rewards.exp);
        C().addPlayerBattleExp(Math.round(g.rewards.exp * 0.5));
        C().battleSettle({}, true, kind === 'elite');
        // 中间波倒了人也算进本关战绩（否则前两波全灭、最后一波翻盘照样三星）
        if (Object.values(units).some(u => u.side === 'ally' && u.hp <= 0)) run.deaths = (run.deaths || 0) + 1;
        // 更新队伍血量
        start_allies(units);
        function start_allies(units) {
          Object.values(units).forEach(u => {
            if (u.side === 'ally' && u.charId !== undefined) run.hpPct[u.charId] = Math.max(0, u.hp / u.maxHp);
          });
        }
        persistRun();
        C().save();
        return {
          // 一刀不落地接着打：不弹结算页、不用按"下一波"，直接进下一波
          seamless: true,
          sub: `第 ${run.wave + 1}/${run.waves.length} 波已通过`,
          log: waveLogLines(g.got),
          after: () => afterWave(),
        };
      },
    });
  }
  // 打当前这一波：最后一波走结算波（精英 / 守关 Boss），中间波只给普通战斗掉落
  function fightWave() {
    if (!run) return;
    if (run.wave >= run.waves.length) return;
    if (run.wave === run.waves.length - 1) return doFinalBattle();
    return doNodeBattle(run.waves[run.wave], () => afterWave());
  }
  /* 一波打完：直接推进到下一波，一路打到底。
     父亲大人 2026-09-15 定：副本要"纯粹"、要**无缝**——既不要"开打第 N 波"这种要按的按钮，
     也不要每波停下来弹一次结算页。这一波结束直接在战斗画面上接下一波；
     补血 / 上增益走战斗界面底部那条"战备补给"，喝了从下一波进场生效。 */
  function afterWave() {
    if (!run) return;
    run.wave++;
    persistRun();
    refresh();
    render();
    // 一口气打到最后一波：不再插播随机事件 / 补给箱，也不用再按一次"开打"
    if (run.wave < run.waves.length) fightWave();
  }
  function doFinalBattle(premadeEnemies) {
    const Dun = window.Dungeon;
    // 先把这一轮的关卡坐标记下来：endRun 之后 run 会被清空
    const wid = run.worldId, df = run.diff, si = run.stageIdx;
    const kind = run.waves[run.waves.length - 1];
    const allies = buildAllies(run.hpPct, run.buffs);
    if (!allies.length) { toast('全队重伤，探索失败'); endRun(false); return; }
    const enemies = premadeEnemies || Dun.makeEnemies(run.worldId, run.diff, run.stage, kind);
    const w = D.WORLDS.find(x => x.id === run.worldId);
    const isBoss = kind === 'boss';
    startBattle({
      title: `${w.name} ${run.stage}/12 · ${isBoss ? w.boss : '区域决战'}`,
      allies, enemies, worldId: run.worldId,
      maxRounds: isBoss ? 50 : 30,
      onEnd(win, res, units) {
        if (!win) return { rewards: [], sub: '再接再厉', after: () => endRun(false) };
        const g = Dun.grantRewards(run.worldId, run.diff, run.stage, kind);
        window.Core.addCharExp(C().S.party.filter(Boolean), g.rewards.exp * 2);
        C().addPlayerBattleExp(g.rewards.exp);
        C().battleSettle({}, true, isBoss);
        // 星级：1星保底；整关无人阵亡+1；决战回合≤20 再+1
        const anyDead = (run.deaths || 0) > 0 || Object.values(units).some(u => u.side === 'ally' && u.hp <= 0);
        let stars = 1 + (anyDead ? 0 : 1) + (res.rounds <= 20 ? 1 : 0);
        const comp = C().stageComplete(run.worldId, run.diff, run.stageIdx, stars);
        // 这一关已经结算完成：把"继续上次副本"的落盘进度清掉，
        // 否则打完直接关掉 App，下次进来世界列表还挂着一张"继续上次副本"的卡片（V9.5）
        C().clearPendingRun();
        const chips = rewardChips(g.got);
        if (comp.firstClearReward) {
          Object.entries(comp.firstClearReward).forEach(([k, v]) => chips.push(`首通 ${curIcon(k)}+${v}`));
        }
        if (comp.newUnlocks && comp.newUnlocks.length) {
          comp.newUnlocks.forEach(n => chips.push(`🔓 解锁【${n}】`));
        }
        // 结算页直接给「再来一次 / 下一关」：不用回世界列表再点关，推图节奏不断
        // （每关开局都是满血，血量不跨关继承，所以"下一关"不需要血量门槛）
        const nx = C().nextStage(wid, df, si);
        const actions = [{ label: '↻ 再来一次', run: () => leaveRunAndStart(wid, df, si) }];
        if (nx) {
          const nw = D.WORLDS.find(x => x.id === nx.worldId);
          actions.push({
            label: `› 下一关（${nw ? nw.name : nx.worldId} ${nx.stageIdx + 1}/12）`, primary: true,
            run: () => leaveRunAndStart(nx.worldId, nx.diff, nx.stageIdx),
          });
        }
        return {
          rewards: chips,
          sub: '★'.repeat(stars) + ' 通关',
          actions,
          after: () => endRun(true),
        };
      },
    });
  }
  // 结算后直接开下一场：清掉这一轮的探索状态再开局（每关开局满血，不需要手动恢复）
  function leaveRunAndStart(worldId, diff, stageIdx) {
    run = null;
    C().clearPendingRun();
    startRun(worldId, diff, stageIdx);
  }
  function endRun(cleared) {
    const wid = run ? run.worldId : dungeonView.worldId;
    const diff = run ? run.diff : 'normal';
    run = null;
    C().clearPendingRun();
    dungeonView = { page: 'world', worldId: wid, diff };
    render();
    if (cleared) toast('关卡完成！', 2200);
  }
  function fightCorridor() {
    const S = C().S;
    // 主角必上阵，无需检查
    const floor = S.corridor.floor;
    const spec = D.corridorEnemy(floor);
    const allies = buildAllies(null, null, { mult: 1 + C().corridorMarkBonus() });
    const enemies = [spec];
    if (spec.isBoss) enemies.push({ name: '深井之影', hp: Math.round(spec.hp * 0.3), atk: Math.round(spec.atk * 0.5), def: Math.round(spec.def * 0.5), spd: 70, faction: null, eva: 0.05 });
    startBattle({
      title: `深井 · 第 ${floor} 层`,
      allies, enemies, worldId: null,
      maxRounds: spec.isBoss ? 50 : 30,
      onEnd(win, res) {
        if (!win) return { rewards: [], sub: `止步于第 ${floor} 层`, after: () => {} };
        const rw = D.corridorReward(floor);
        C().addCur('points', rw.points);
        C().addCur('story', rw.story);
        C().addCur('corridor', rw.corridor);
        if (rw.bloodCrystal) C().addCur('bloodCrystal', rw.bloodCrystal);
        window.Core.addCharExp(C().S.party.filter(Boolean), 50 + floor * 5);
        C().addPlayerBattleExp(30 + floor * 3);
        C().battleSettle({}, true, spec.isBoss);
        const before = C().corridorMarks();
        S.corridor.floor++;
        S.corridor.best = Math.max(S.corridor.best, floor);
        S.stats.bestFloor = S.corridor.best;
        C().save();
        const gotMark = C().corridorMarks() > before;
        return {
          rewards: [`◈+${rw.points}`, `❖+${rw.story}`, `♜+${rw.corridor}`].concat(rw.bloodCrystal ? [`❥+${rw.bloodCrystal}`] : [], gotMark ? [`♜ 获得深井印记（${C().corridorMarks()}枚 · 深井内 +${Math.round(C().corridorMarkBonus() * 100)}%）`] : []),
          sub: `进入第 ${floor + 1} 层`,
          after: () => render(),
        };
      },
    });
  }

  /* ================= 界面事件绑定 ================= */
  function bindScreen() {
    const root = $view();
    // 背包页签的按钮与弹窗共用一套绑定
    if (curTab === 'bag') bindBag(root, false);
    // 执灯者的三个子页：切换时各自保留滚动位置
    root.querySelectorAll('[data-roster]').forEach(el => el.onclick = () => {
      const next = el.dataset.roster;
      if (next === rosterView) return;
      rosterScroll[rosterView] = (typeof window !== 'undefined' && window.scrollY) || 0;
      rosterView = next;
      pendingScroll = rosterScroll[next] || 0;
      render();
    });
    root.querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
      const act = el.dataset.act;
      const S = C().S;
      switch (act) {
        /* 这里原来还有一个 'claim-idle' 分支，但全站没有任何元素发出过这个动作
           （挂机卡上的按钮早就统一成 claim-all 了）——分支留着也没人点得到，V8.9 删掉。
           同样的"有分支没出处"清单由测试 scripts/test_ui.js 守着。 */
        case 'open-recruit': openRecruit(); break;
        case 'claim-all': {
          const r = C().claimEverything();
          sfx(r.total ? 'coin' : 'fail');
          const chips = [];
          if (r.seconds) chips.push(`<span class="reward-chip">⏳ 挂机 ${formatDuration(r.seconds)}</span>`);
          Object.entries(r.gains.cur).forEach(([k, v]) => { if (v) chips.push(`<span class="reward-chip">${curIcon(k)}${v > 0 ? '+' : ''}${fmt(v)}</span>`); });
          Object.entries(r.gains.items).forEach(([k, v]) => { if (v) chips.push(`<span class="reward-chip">🎒 ${(D.ITEMS[k] || {}).name || k}×${v}</span>`); });
          modal('一键收取', `
            <div style="font-size:12px;color:var(--dim);text-align:center">本次共收取 ${r.total} 项</div>
            <div class="reward-chips" style="margin:12px 0">${chips.join('') || '<span class="reward-chip">暂时没有可领取的东西</span>'}</div>
            ${r.total ? '' : '<div style="font-size:12px;color:var(--dim);text-align:center">先去副本打一关，或等挂机满 60 秒再回来。</div>'}
          `, { center: true });
          render();
          break;
        }
        case 'open-shop': shopModal('god'); break;
        case 'open-buildings': buildingsModal(); break;
        case 'open-authority': authorityModal(); break;
        case 'open-sect': sectModal(); break;
        case 'open-keji': kejiModal(); break;
        case 'open-travel': travelModal(); break;
        case 'open-bloodline': bloodlineModal(); break;
        case 'open-garden': gardenModal(); break;
        case 'open-refine': refineModal(); break;
        case 'open-arena': arenaModal(); break;
        case 'open-fabao': fabaoModal(); break;
        case 'open-mount': mountModal(); break;
        case 'open-sign': signModal(); break;
        case 'open-tasks': tasksModal(); break;
        case 'open-genelock': geneLockModal(); break;
        case 'open-reincarn': reincarnModal(); break;
        case 'open-idlelines': idleLinesModal(); break;
        case 'open-bounty': bountyModal(); break;
        case 'open-realm': realmModal(); break;
        case 'open-beast': beastModal(); break;
        case 'open-settings': settingsModal(); break;
        case 'claim-quest': {
          const cur = C().currentQuest();
          if (cur) {
            const r = C().claimQuest(cur.q.id);
            if (r.ok) {
              toast(`完成主线【${cur.q.name}】`, 2200);
              // 弹的是"这条任务真正解锁了什么"（由 claimQuest 返回，不再去读下一条任务的字段）
              if (r.unlocked && r.unlocked.length) {
                setTimeout(() => modal('🔓 新功能解锁', `<div style="text-align:center;padding:10px;font-size:14px">${r.unlocked.join(' · ')} 已解锁！</div>`, { center: true }), 400);
              }
            }
          }
          render();
          break;
        }
        case 'goto-quest': {
          const cur = C().currentQuest();
          if (!cur) break;
          gotoQuest(cur.q.id);
          break;
        }
        case 'open-guide': guideModal(); break;
        case 'open-codex': codexModal(); break;
        case 'open-curdoc': currencyModal(); break;
        case 'open-ach': tasksModal('ach'); break;
        case 'auto-equip': {
          const r = C().autoEquipBest();
          toast(r.changed ? `已为 ${r.members} 名成员重新分配 ${r.changed} 处装备（含从没上阵的伙伴身上取下的）` : '当前已是最优配置', 2600);
          sfx('coin');
          render(); renderTopbar();
          break;
        }
        case 'open-corridor':
          if (!C().isUnlocked('corridor')) { toast('🔒 ' + C().unlockTip('corridor')); break; }
          dungeonView = { page: 'corridor' }; render(); break;
        case 'open-corridor-shop': shopModal('corridor'); break;
        case 'fight-corridor': fightCorridor(); break;
        case 'back-worlds': dungeonView = { page: 'worlds' }; run = null; C().clearPendingRun(); render(); break;
        case 'abandon-run':
          confirmBox('撤离副本', '确定撤离？本次探索进度将丢失，已获得的奖励会保留。', () => {
            const wid = run ? run.worldId : dungeonView.worldId;
            const df = run ? run.diff : (dungeonView.diff || 'normal');
            run = null;
            C().clearPendingRun();
            dungeonView = { page: 'world', worldId: wid, diff: df };
            render();
          });
          break;
        case 'open-sweep':
          sweepModal(dungeonView.worldId, dungeonView.diff);
          break;
      }
    });
    root.querySelectorAll('[data-locked]').forEach(el => el.onclick = () => {
      toast('🔒 ' + C().unlockTip(el.dataset.locked), 2200);
    });
    root.querySelectorAll('[data-world]').forEach(el => el.onclick = () => {
      const S = C().S;
      const w = S.worlds[el.dataset.world];
      if (!w || !w.unlocked) { toast('通关上一世界后解锁'); return; }
      dungeonView = { page: 'world', worldId: el.dataset.world, diff: 'normal' };
      render();
    });
    root.querySelectorAll('[data-diff]').forEach(el => el.onclick = () => {
      dungeonView.diff = el.dataset.diff;
      render();
    });
    root.querySelectorAll('[data-stage]').forEach(el => el.onclick = () => {
      startRun(dungeonView.worldId, dungeonView.diff, +el.dataset.stage);
    });
    root.querySelectorAll('[data-wave-fight]').forEach(el => el.onclick = () => {
      if (!run || el.disabled) return;
      fightWave();
    });
    bindPotionButtons(root, () => render());
    root.querySelectorAll('[data-resume-run]').forEach(el => el.onclick = () => {
      const pr = C().S.pendingRun;
      if (!pr || !pr.waves) { toast('没有可继续的副本'); return; }
      run = pr;
      dungeonView = { page: 'run' };
      toast('已继续上次的副本');
      render();
      fightWave();   // 接着上次的波次直接打，不用再按一次"继续"
    });
    root.querySelectorAll('[data-drop-run]').forEach(el => el.onclick = () => {
      confirmBox('放弃这一轮', '确定放弃上次没打完的副本？已获得的奖励保留。', () => {
        run = null;
        C().clearPendingRun();
        render();
      });
    });
    // 站位：长按抓起 → 拖到别的位置松手放下；没抓起时，点空位＝选人上阵，点已上阵＝换人，点主角＝看详情
    root.querySelectorAll('[data-pos]').forEach(el => {
      const pos = el.dataset.pos;
      armLongPress(el, pos);
      el.onclick = () => clickPosition(pos);
    });
    const grabCancel = root.querySelector('[data-grab-cancel]');
    if (grabCancel) grabCancel.onclick = () => { cancelGrab(false); };
    root.querySelectorAll('[data-preset-save]').forEach(el => el.onclick = () => {
      const r = C().savePreset(+el.dataset.presetSave);
      toast(r.msg || (r.ok ? '已保存编队预设' : '保存失败'));
      sfx('click');
      render();
    });
    root.querySelectorAll('[data-preset-use]').forEach(el => el.onclick = () => {
      const r = C().applyPreset(+el.dataset.presetUse);
      toast(r.msg);
      sfx(r.ok ? 'success' : 'fail');
      if (r.ok) render();
    });
    // 顶栏状态行的「轮回」那一格也开主角详情；队伍页的主角牌由 [data-pos] 接管（带长按换位）
    root.querySelectorAll('[data-protag]:not([data-pos])').forEach(el => el.onclick = () => protagonistDetail());
    // 成员一览里点主角那一行 = 打开主角详情
    root.querySelectorAll('[data-protag-row]').forEach(el => el.onclick = () => protagonistDetail());
    root.querySelectorAll('[data-remove]').forEach(el => el.onclick = ev => {
      ev.stopPropagation();
      const S = C().S;
      if (el.dataset.remove === '@player') { toast('主角必上阵，不能下阵'); return; }   // 主角占着一格，但拖不出去
      const idx = S.party.indexOf(el.dataset.remove);
      if (idx >= 0) { S.party[idx] = null; C().save(); render(); }
    });
    root.querySelectorAll('[data-char]').forEach(el => el.onclick = () => charDetail(el.dataset.char));
    root.querySelectorAll('[data-eqd]').forEach(el => el.onclick = () => equipDetail(el.dataset.eqd));
    root.querySelectorAll('[data-filter]').forEach(el => el.onclick = () => { charFilter = el.dataset.filter; render(); });
    root.querySelectorAll('[data-charsort]').forEach(el => el.onclick = () => { charSort = el.dataset.charsort; render(); });
    const charSearch = root.querySelector('#char-search');
    if (charSearch) charSearch.oninput = () => { charQuery = charSearch.value; paintCharGrid(root); };
    root.querySelectorAll('[data-efilter]').forEach(el => el.onclick = () => { equipFilter = el.dataset.efilter; render(); });
    root.querySelectorAll('[data-ecat]').forEach(el => el.onclick = () => { equipCatFilter = el.dataset.ecat; render(); });
    // 批量分解
    const batchOn = root.querySelector('[data-batchon]');
    if (batchOn) batchOn.onclick = () => { batchMode = true; batchSel.clear(); render(); };
    const batchOff = root.querySelector('[data-batchoff]');
    if (batchOff) batchOff.onclick = () => { batchMode = false; batchSel.clear(); render(); };
    root.querySelectorAll('[data-beq]').forEach(el => el.onclick = () => {
      const uid = el.dataset.beq;
      if (batchSel.has(uid)) batchSel.delete(uid); else batchSel.add(uid);
      el.classList.toggle('sel', batchSel.has(uid));
      updateBatchBar();
    });
    root.querySelectorAll('[data-bsel]').forEach(b => b.onclick = () => {
      const r = b.dataset.bsel;
      const eqd = equippedUidSet(C().S);
      const uids = C().inventoryEquips().filter(e => e.rarity === r && !eqd.has(e.uid) && !e.lock).map(e => e.uid);
      const allIn = uids.length > 0 && uids.every(u => batchSel.has(u));
      uids.forEach(u => { if (allIn) batchSel.delete(u); else batchSel.add(u); });
      root.querySelectorAll('[data-beq]').forEach(el => el.classList.toggle('sel', batchSel.has(el.dataset.beq)));
      updateBatchBar();
    });
    const bClear = root.querySelector('[data-bclear]');
    if (bClear) bClear.onclick = () => {
      batchSel.clear();
      root.querySelectorAll('[data-beq]').forEach(el => el.classList.remove('sel'));
      updateBatchBar();
    };
    const bGo = root.querySelector('[data-bgo]');
    if (bGo) bGo.onclick = () => {
      if (!batchSel.size) { toast('请先点选要分解的装备'); return; }
      const n = batchSel.size, gain = batchGain();
      confirmBox('批量分解', `确定分解选中的 <b>${n}</b> 件装备？将获得 ◆${fmt(gain)}（异界结晶）`, () => {
        const r = C().decomposeMany([...batchSel]);
        toast(`分解 ${r.count} 件装备，获得 ◆${fmt(r.gain)}`, 2400);
        batchMode = false; batchSel.clear();
        render(); renderTopbar();
      });
    };
    if (batchMode) updateBatchBar();
  }

  /* ================= 启动辅助 ================= */
  /* ================= GM 调试面板（隐藏入口：设置页连点版本号7次） ================= */
  function gmModal() {
    const S = C().S;
    const w = modal('🛠 GM 调试面板', `
      <div style="font-size:11px;color:var(--accent);margin-bottom:10px">仅用于开发测试，滥用会破坏游戏乐趣</div>
      <div class="grid2">
        <button class="btn small" data-gm="cur">货币 +10000（晶石+5000）</button>
        <button class="btn small" data-gm="unlocks">解锁全部功能</button>
        <button class="btn small" data-gm="worlds">解锁全部世界</button>
        <button class="btn small" data-gm="clearworld">当前世界普通全通</button>
        <button class="btn small" data-gm="plvup">主角(玩家) Lv+10</button>
        <button class="btn small" data-gm="lvup">全体伙伴 Lv+10</button>
        <button class="btn small" data-gm="skill">全体技能升满</button>
        <button class="btn small" data-gm="equip">获得 5 件 SSR 装备</button>
        <button class="btn small" data-gm="gene">铭刻 +1 阶</button>
        <button class="btn small" data-gm="floor">深井 +10 层</button>
        <button class="btn small" data-gm="recruit">✦ +900（十连）</button>
      </div>
      <div style="font-size:11px;color:var(--dim);margin-top:12px">玩家Lv.${S.player.level} · 铭刻${S.player.geneLock} · 深井${S.corridor.floor}层 · 伙伴${Object.keys(S.chars).length}</div>
    `);
    w.querySelectorAll('[data-gm]').forEach(b => b.onclick = () => {
      const act = b.dataset.gm;
      const Core = C();
      if (act === 'cur') {
        ['points', 'story', 'otherworld', 'skillChip', 'bloodCrystal', 'corridor'].forEach(k => Core.addCur(k, 10000));
        Core.addCur('holy', 5000);
      } else if (act === 'unlocks') {
        D.UNLOCKS.forEach(u => { S.unlocks[u.id] = true; });
      } else if (act === 'worlds') {
        D.WORLDS.forEach(x => Core.unlockWorld(x.id));
      } else if (act === 'clearworld') {
        const wid = (dungeonView && dungeonView.worldId) || 'W01';
        Core.unlockWorld(wid);
        S.worlds[wid].stages.normal = Array(12).fill(3);
        Core.refreshUnlocks();
      } else if (act === 'lvup') {
        Object.values(S.chars).forEach(c => { c.lv = Math.min(100, c.lv + 10); });
      } else if (act === 'plvup') {
        S.player.level = Math.min(100, S.player.level + 10);
      } else if (act === 'skill') {
        Object.values(S.chars).forEach(c => { c.skillLv = [10, 10, 10]; });
      } else if (act === 'equip') {
        for (let i = 0; i < 5; i++) Core.grantEquip('W01', 'SSR');
      } else if (act === 'gene') {
        if (S.player.geneLock < 5) S.player.geneLock++;
      } else if (act === 'floor') {
        S.corridor.floor += 10;
        S.corridor.best = Math.max(S.corridor.best, S.corridor.floor - 1);
      } else if (act === 'recruit') {
        Core.addCur('holy', 900);
      }
      Core.save();
      toast('GM: ' + b.textContent + ' 完成');
      refresh(); render();
    });
  }

  function showOfflineGains(g) {
    if (g.cheat) {
      modal('⚠ 时间异常', `<div class="event-desc">检测到系统时间被修改，本次离线收益已取消。</div>`, { center: true, sticky: true });
      return;
    }
    if (!g) return;
    /* 入账已经在 Core.settleOffline 里做完了——那里才是唯一正确的位置：
       这个弹窗只在"离线够久"时才弹，而入账不能跟弹窗绑定（否则离线 1~5 分钟的收益会被丢掉，V9.5 修）。
       这里只负责把"这次拿到了什么"讲清楚。 */
    const mat = g.gains.matCount ? { item: g.gains.matItem, count: g.gains.matCount } : null;
    modal('欢迎回来，执灯者', `
      <div style="text-align:center;padding:6px 0 12px">
        <div style="font-size:13px;color:var(--dim)">离线 ${formatDuration(g.seconds)}（效率 ${Math.round(g.efficiency * 100)}%）</div>
        <div class="reward-chips" style="margin-top:14px">
          <span class="reward-chip">◈+${fmt(g.gains.points)}</span>
          <span class="reward-chip">EXP+${fmt(g.gains.exp)}</span>
          ${g.gains.otherworld ? `<span class="reward-chip">◆+${g.gains.otherworld}</span>` : ''}
          ${g.gains.story ? `<span class="reward-chip">❖+${g.gains.story}</span>` : ''}
          ${mat && mat.count ? `<span class="reward-chip">⚙️ ${D.ITEMS[mat.item].name}×${mat.count}</span>` : ''}
          ${g.gains.matStashed ? `<span class="reward-chip">📮 待领箱 +${g.gains.matStashed}</span>` : ''}
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:10px">离线期间挂机分工的产线一样在跑。</div>
      </div>`, { center: true });
    refresh();
  }
  function showLoginReward(r) {
    if (!r) return;
    const rw = r.reward.ssrTicket ? '🎫 SSR自选券' : rewardText(r.reward);
    modal(`七日登录 · 第 ${r.day} 天`, `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:34px;margin-bottom:8px">${['🌑','🌒','🌓','🌔','🌕','🌖','🌗'][r.day - 1]}</div>
        <div style="font-size:14px">今日奖励</div>
        <div class="reward-chips mt3"><span class="reward-chip" style="font-size:14px">${rw}</span></div>
      </div>`, { center: true });
  }
  function showTutorial() {
    const w = modal('欢迎来到灯阁', `
      <div class="event-desc">
        你被神秘存在选中，成为了<b style="color:var(--accent)">执灯者</b>。<br><br>
        在这里，你将：<br>
        🌀 进入残域执行探索任务<br>
        👥 招募伙伴，组建五人小队（主角必上阵）<br>
        🧬 解锁血统与铭刻，突破极限<br>
        ♾ 挑战深井，寻找离开的方法<br><br>
        新手补给已发放：◈50,000 · ✦1,000 · 经验模块×20 · 治疗剂×10<br><br>
        <b style="color:var(--gold)">上手就三件事：</b><br>
        ① 先在「选择血统」里挑一条路——境界线跟着血统走，选定不能改；<br>
        ② 首页最下面「挂机」那块点「一键收取」，把挂机、任务、成就、悬赏能领的一次全领；<br>
        ③ 点「残域」选第 1 关，点进去就直接开打，通关后解锁招募；招募里每天有一次<b>免费</b>，别忘了领。<br><br>
        三张招募池花的是<b>三种不同的货币</b>：◈点数抽普通（攒碎片）、✦圣洁晶石抽高级（补图鉴）、◆异界结晶抽限定（定向出当期 UP）。<br>
        首页最下面「设置」里的「玩法指南」有完整说明（货币、套装、挂机分工、副本打法、血统与境界、限时悬赏、深井、周常都在里面）。<br><br>
        <b>如果下一场探索真的会死，你会带谁进去？</b>
      </div>
      <button class="btn primary block mt4" data-start>签订灯阁契约</button>
    `, { sticky: true, center: true });
    w.querySelector('[data-start]').onclick = () => { closeModal(w); showCharCreate(); };
  }
  const RANDOM_NAMES = ['夜行者', '渡鸦', '白泽', '北辰', '惊蛰', '拾荒者', '阿岚', '无常', '青槐', '孤鸿', '墨白', '临渊'];
  function showCharCreate() {
    const w = modal('创建你的执灯者', `
      <div class="event-desc" style="margin-bottom:12px">灯阁需要一个名字来记录你的行程。这个名字将伴随你进入每一个世界。</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input id="cc-name" maxlength="12" placeholder="输入你的名字（12字内）" style="flex:1;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px;font-size:15px;outline:none" />
        <button class="btn" data-dice style="flex:0 0 auto">🎲</button>
      </div>
      <button class="btn primary block" data-confirm>以这个名字进入残域</button>
    `, { sticky: true, center: true });
    const input = w.querySelector('#cc-name');
    const roll = () => { input.value = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]; };
    roll();
    w.querySelector('[data-dice]').onclick = roll;
    const confirmName = () => {
      if (!C().setPlayerName(input.value)) { toast('请输入名字'); return; }
      closeModal(w);
      refresh(); render();
      toast(`欢迎你，${C().S.player.name}`, 2500);
      // 名字定完紧接着选血统：境界线跟着血统走，所以这一步不能拖到 Lv.10
      if (!C().S.player.bloodline) setTimeout(() => bloodlineModal(null, { first: true }), 500);
    };
    w.querySelector('[data-confirm]').onclick = confirmName;
    input.onkeydown = ev => { if (ev.key === 'Enter') confirmName(); };
    setTimeout(() => input.focus(), 300);
  }

  return {
    init() {
      refresh(); render();
      // 手机返回键 / 手势：先关弹窗，再退子页面，最后才交给系统
      armGuard();   // 先放一条哨兵，保证"返回"优先被游戏接管
      if (window.addEventListener) window.addEventListener('popstate', onPopState);
      // Esc = 把"长按抓起"的那一格放回去（长按换位的撤销出口，和提示条上的「取消」等效）
      if (window.addEventListener) window.addEventListener('keydown', ev => {
        if (ev.key !== 'Escape') return;
        cancelGrab(false);
      });
      installClickGuard();                 // 防连点
      C().setCurListener(pulseCur);        // 货币变化 → ±数值跳动
      // 核心层要说给玩家听的话（背包满进待领箱 / 存档写不进去）走这一条，一条通道管到底
      C().setNoticeListener(msg => toast(msg, 3600));
      // 手机专属两件事（电脑上看不出问题，真机才有）：
      // ① 顶栏高度随系统字号 / 刘海变化，正文上边距跟着量出来的高度走；
      // ② 键盘弹出时，居中弹窗会被键盘盖住 —— 用 visualViewport 把弹窗往上抬。
      if (window.addEventListener) {
        window.addEventListener('resize', syncTopbarHeight);
        window.addEventListener('orientationchange', syncTopbarHeight);
      }
      const vv = window.visualViewport;
      if (vv && vv.addEventListener) {
        const syncKb = () => {
          const root = document.documentElement;
          if (!root || !root.style || !root.style.setProperty) return;
          const kb = Math.max(0, (window.innerHeight || 0) - vv.height - (vv.offsetTop || 0));
          root.style.setProperty('--kb', Math.round(kb) + 'px');
        };
        vv.addEventListener('resize', syncKb);
        vv.addEventListener('scroll', syncKb);
      }
      // 全局点击音效（按钮级）
      if (document.addEventListener) document.addEventListener('click', ev => {
        const t = ev.target;
        const btn = t && t.closest ? t.closest('button') : null;
        if (btn && !btn.disabled) sfx('click');
      });
    },
    render, refresh, toast, modal, closeModal,
    sfx,
    showOfflineGains, showLoginReward, showTutorial, showCharCreate,
    showBloodlinePick: () => bloodlineModal(null, { first: true }),
    tickIdle() {
      if (curTab !== 'home') return;
      const timeEl = document.getElementById('idle-time');
      if (!timeEl) return;
      const bank = C().idleBankGains();
      timeEl.textContent = formatDuration(bank.seconds);
      const gainsEl = document.getElementById('idle-gains');
      if (gainsEl) gainsEl.textContent = `◈${fmt(bank.points)} · EXP ${fmt(bank.exp)}${bank.otherworld ? ` · ◆${bank.otherworld}` : ''}${bank.mat ? ` · ⚙️${bank.mat}` : ''}`;
      // 「一键收取」的可用状态跟着可领取项实时变（挂机满 60 秒就会亮）
      if (document.querySelector) {
        const btn = document.querySelector('#view [data-act="claim-all"]');
        if (btn) {
          const t = C().todayState();
          btn.disabled = !t.claimable;
          btn.textContent = t.claimable ? `⚡ 一键收取（${t.claimable}）` : '⚡ 一键收取';
        }
      }
    },
    get tab() { return curTab; },
    _setTab: setTab,
    AUTO_NEXT_SEC,
    // 测试用：直接开面板，检查模板与空引用
    _panels: {
      bagModal, itemDetail, currencyModal, guideModal, codexModal, shopModal, tasksModal, settingsModal,
      sweepModal, recruitModal, gotoQuest, weeklyHtml, achHtml, reincarnModal, charDetail, equipDetail, geneLockModal,
      protagonistDetail,
      idleLinesModal, pickIdleLeader, bountyModal, realmModal,
      beastModal,
      recruitRatesModal, authorityModal, questStrip, travelStrip, menuGroup, sectModal, kejiModal, travelModal,
      heroBlock, growBlock, travelBlock, idleBlock, settingsBlock, syncTopbarHeight,
      bloodlineModal,
      autoNextIndex, autoNextBtnHtml,
      gardenModal, arenaModal, fabaoModal, mountModal, signModal,
      buildAllies,
      // 测试用：直接发一场战斗（验「带血进场时血条画的是真实血线」）
      _startBattle: startBattle,
      // 测试用：弹窗层数与"原地重画"，用来验"返回到底有没有把面板收掉"
      _modalCount: () => modalStack.length,
      _updateModal: updateModal,
      _closeModal: closeModal,
      lootPanel,
      armLongPress, clickPosition, dropOn, cancelGrab, grabState,
      // 测试用：装备池筛完的清单 / 批量分解开关（批量态下"格子"才是勾选框）
      bagEquipList, _setBagBatch: on => { batchMode = !!on; batchSel.clear(); },
      // 测试用：设置装备筛选（验"筛选后不再补空格子"）
      _setEquipFilter: (f, cat) => { equipFilter = f || 'all'; equipCatFilter = cat || 'all'; },
      // 测试用：药剂回血（纯函数：阵亡成员不复活）
      applyPotionHp,
      stashBar,
      _screens: { homeScreen, dungeonScreen, rosterScreen, bagScreen, partyScreen, charsScreen, equipScreen, growScreen },
    },
  };
})();
