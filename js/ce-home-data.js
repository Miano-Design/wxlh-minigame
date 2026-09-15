/* 路线 B（引擎渲染）首页数据
   ------------------------------------------------------------------------------
   一份数据、两个来源：
     · sample()   —— 固定样例，给样式编译器（scripts/build-ce-style.js）和无头预览用，不依赖存档
     · fromCore() —— 小游戏里跑，从逻辑层（window.Core）现取，字段和 sample 一一对应
   两份数据的**字段必须一致**：模板（js/ce-tpl-home.js）只认字段名。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CEHomeData = api;
})(typeof window !== 'undefined' ? window : this, function () {
  /* ---------------------------- 固定样例 ---------------------------- */
  function sample() {
    return {
      player: { name: '执灯者', lv: 12, gene: '铭刻·玉衡' },
      currencies: [
        { icon: '◈', color: '#6ec6ff', value: '1.2万' },
        { icon: '✦', color: '#b06bff', value: '86' },
        { icon: '◆', color: '#e6b64c', value: '120' },
      ],
      hero: {
        realm: '练气中期', realmColor: 'var(--accent)', realmSub: '第 3 / 12 阶',
        level: 'Lv.12', levelSub: 'EXP 46%',
        protag: '六维待分 0 · 技能待加 2', protagSub: '点开：加点 / 洗点 / 血统 / 境界 ›',
        protagGold: true,
        reincarn: '0 世', reincarnSub: '权限 Lv.2 · 评级 Lv.3',
      },
      quest: { name: '熟悉身体', step: '第 1/16 步', reward: '◈500 · EXP 300', done: false },
      grow: [
        { name: '灯阁评级', sub: 'Lv.3 · +6.0%' },
        { name: '秘术阁', sub: '已修 7 级' },
        { name: '法宝', sub: '2/20 件' },
        { name: '药园', sub: '1 块在用' },
        { name: '斗法台', sub: '第 2 台 · 剩 3 次' },
        { name: '坐骑', sub: '0/7 匹' },
        { name: '炼化台', sub: '装备材料炼血清' },
      ],
      growLocked: '灯阁权限 / 基地建设 / 铭刻 / 伴生体 / 转生天赋 / 灯录',
      daily: [
        { name: '限时悬赏', sub: '按时重置' },
        { name: '每日任务', sub: '主线 / 日常 / 周常' },
        { name: '成就', sub: '长线目标' },
        { name: '求签', sub: '今日还没求' },
        { name: '招募伙伴', sub: '今日免费 1 抽' },
        { name: '兑换大厅', sub: '三档商店' },
      ],
      growHint: '血统与境界属于主角自身：点上面【主角】那张卡，在里面选血统 / 渡劫。这里与「执灯者 → 成长」是同一批养成线的总览。',
      travel: { pend: false, name: '', left: '8分12秒', sub: '挂机每 10 分钟出一次' },
      travelHint: '挂机每 10 分钟出一次，攒着不会丢。',
      idle: {
        rate: '◈12.4/分', rateSub: 'EXP 8.0/分 · 离线 60% · 上限 8.0h',
        banked: '2小时13分', gain: '◈1654 · EXP 1067 · 材料 3',
        lines: '闭关修炼 空 · 灵材采集 空 · 外围探索 空 · 灯阁守卫 空',
        claim: '一键收取（3）', canClaim: true,
      },
      settings: [
        { name: '玩法指南', sub: '分章图文' },
        { name: '货币图鉴', sub: '币的用途与来源' },
        { name: '设置与存档', sub: '存档 / 音效 / 导出' },
      ],
      nav: [
        { icon: '🏮', name: '灯阁', active: true },
        { icon: '⚔', name: '残域' },
        { icon: '👥', name: '执灯者' },
        { icon: '🎒', name: '背包' },
      ],
    };
  }

  /* ---------------------------- 真实数据 ---------------------------- */
  function fromCore() {
    const C = window.Core, D = window.DATA;
    const S = C.S;
    const f = window.fmt || ((x) => String(x));
    const dur = window.formatDuration || function (sec) {
      sec = Math.floor(sec);
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      if (h) return `${h}小时${m}分`;
      if (m) return `${m}分${s}秒`;
      return `${s}秒`;
    };
    const st = C.realmState();
    const expNeed = D.EXP_TABLE[S.player.level] || 1;
    const au = C.authorityInfo();
    const sect = C.sectInfo();
    const mq = C.mainQuestState();
    const qi = mq.findIndex((x) => !x.claimed);
    const q = qi < 0 ? null : mq[qi];
    const tv = C.travelProgress();
    const pend = C.pendingTravel();
    const bank = C.idleBankGains();
    const rates = C.idleRates();
    const lines = C.idleLines();
    const today = C.todayState();
    const main = D.CURRENCIES.filter((c) => ['points', 'holy', 'otherworld'].indexOf(c.id) >= 0);
    const tileOf = (x) => ({ name: x[1], sub: x[2] || '' });
    const open = (list) => list.filter((x) => !x[3] || C.isUnlocked(x[3])).map(tileOf);
    const locked = list => list.filter((x) => x[3] && !C.isUnlocked(x[3])).map((x) => x[1]);
    /* 奖励文案：和网页版 ui.js 的 rewardText 一个口径（Core 没有导出这个，页面自己的排版事） */
    const curIcon = (id) => { const c = D.CURRENCIES.filter((x) => x.id === id)[0]; return c ? c.icon : ''; };
    const rewardText = (o) => {
      const parts = Object.keys(o || {})
        .filter((k) => o[k] !== 0 && o[k] !== null && o[k] !== undefined)
        .map((k) => (k === 'item'
          ? [].concat(o[k]).map((id) => '🎁' + ((D.ITEMS[id] || {}).name || id)).join(' ')
          : curIcon(k) + f(o[k])));
      return parts.length ? parts.join(' · ') : '—';
    };

    const growAll = [
      [null, '灯阁评级', `Lv.${sect.lv} · +${(sect.pct * 100).toFixed(1)}%`],
      [null, '秘术阁', `已修 ${D.KEJI.reduce((a, k) => a + C.kejiLv(k.id), 0)} 级`],
      [null, '法宝', `${C.fabaoState().own.length}/${D.FABAO.length} 件`],
      [null, '药园', `${C.gardenState().filter((p) => p.plot).length} 块在用`],
      [null, '斗法台', `第 ${C.arenaState().floor} 台 · 剩 ${C.arenaState().left} 次`],
      [null, '坐骑', C.mountState().own.length ? `${C.mountState().own.length}/${D.MOUNTS.length} 匹` : '去驯一匹'],
      [null, '炼化台', '装备材料炼血清'],
      [null, '灯阁权限', `Lv.${au.lv}/${au.max}`, 'buildings'],
      [null, '基地建设', `合计 Lv.${Object.values(S.buildings).reduce((a, b) => a + b, 0)}`, 'buildings'],
      [null, '铭刻', S.player.geneLock > 0 ? `${S.player.geneLock} 阶` : '未解锁', 'geneLock'],
      [null, '伴生体', Object.keys(S.beast.owned || {}).length ? `${Object.keys(S.beast.owned || {}).length} 只` : '未孵化', 'beast'],
      [null, '转生天赋', `${S.player.reincarnations} 世`, 'reincarn'],
      [null, '灯录', `${C.codexState().owned}/${C.codexState().total} 名`, 'recruit'],
    ];
    const dailyAll = [
      [null, '限时悬赏', '按时重置'],
      [null, '每日任务', '主线 / 日常 / 周常', 'tasks'],
      [null, '成就', '长线目标'],
      [null, '求签', C.signState().canDraw ? '今日还没求' : `今日【${C.signState().tier}】`],
      [null, '招募伙伴', C.freeRecruitAvailable() ? '今日免费 1 抽' : '攒碎片升星', 'recruit'],
      [null, '兑换大厅', '三档商店', 'shop'],
    ];

    return {
      player: { name: S.player.name || '执灯者', lv: S.player.level, gene: S.player.geneLock > 0 ? `铭刻·${D.GENE_LOCKS[S.player.geneLock - 1].name}` : '' },
      currencies: main.map((c) => ({ icon: c.icon, color: c.color, value: f(S.cur[c.id]) })),
      hero: {
        realm: st.curName || '未定血统',
        realmColor: st.hasBloodline ? 'var(--gold)' : 'var(--accent)',
        realmSub: st.hasBloodline ? `第 ${Math.min(st.realm + 1, D.REALM_STAGE_COUNT)} / ${D.REALM_STAGE_COUNT} 阶` : '点【主角】卡里选血统',
        level: 'Lv.' + S.player.level,
        levelSub: 'EXP ' + Math.floor((S.player.exp / expNeed) * 100) + '%',
        protag: `六维待分 ${S.player.attrPoints || 0} · 技能待加 ${S.player.skillPoints || 0}`,
        protagSub: '点开：加点 / 洗点 / 血统 / 境界 ›',
        protagGold: !!(S.player.attrPoints || S.player.skillPoints),
        reincarn: `${S.player.reincarnations} 世`,
        reincarnSub: `权限 Lv.${au.lv} · 评级 Lv.${sect.lv}`,
      },
      quest: q ? { name: q.q.name, step: `第 ${qi + 1}/${mq.length} 步`, reward: rewardText(q.q.reward), done: !!q.done }
        : { name: '已走完', step: '', reward: '挑战更高难度与深井', done: false, empty: true },
      grow: open(growAll),
      growLocked: locked(growAll).join(' / '),
      daily: open(dailyAll),
      growHint: '血统与境界属于主角自身：点上面【主角】那张卡，在里面选血统 / 渡劫。这里与「执灯者 → 成长」是同一批养成线的总览。',
      travel: pend
        ? { pend: true, name: pend.name, left: '', sub: C.rewardTextOf(pend.effect) }
        : { pend: false, name: '', left: dur(Math.max(0, tv.every - tv.sec)), sub: '挂机每 10 分钟出一次' },
      travelHint: pend ? '已经有奇遇躺着等领了，点上面那条领走。' : '挂机每 10 分钟出一次，攒着不会丢。',
      idle: {
        rate: '◈' + rates.pointsPerMin.toFixed(1) + '/分',
        rateSub: `EXP ${rates.expPerMin.toFixed(1)}/分 · 离线 ${Math.round(C.offlineEfficiency() * 100)}% · 上限 ${C.offlineCapHours().toFixed(1)}h`,
        banked: dur(bank.seconds),
        gain: `◈${f(bank.points)} · EXP ${f(bank.exp)}${bank.otherworld ? ' · ◆' + bank.otherworld : ''}${bank.mat ? ' · 材料 ' + bank.mat : ''}`,
        lines: lines.map((l) => `${l.line.name} ${l.leaderId ? (window.cname ? window.cname(l.leaderId) : l.leaderId) : '空'}`).join(' · '),
        claim: today.claimable ? `一键收取（${today.claimable}）` : '一键收取',
        canClaim: !!today.claimable,
      },
      settings: [
        { name: '玩法指南', sub: '分章图文' },
        { name: '货币图鉴', sub: '币的用途与来源' },
        { name: '设置与存档', sub: '存档 / 音效 / 导出' },
      ],
      nav: [
        { icon: '🏮', name: '灯阁', active: true },
        { icon: '⚔', name: '残域' },
        { icon: '👥', name: '执灯者' },
        { icon: '🎒', name: '背包' },
      ],
    };
  }

  return { sample, fromCore };
});
