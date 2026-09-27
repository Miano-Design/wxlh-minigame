/* 数值尺子用的"按当前编队出一队人"—— 从归档的网页版 ui.js 里**原样抽出**的那一个函数
   ==================================================================================
   （V1.1.11 · 康康 2026-09-27 · 由父亲大人"网页版归档、本地删掉"引出的抢修）

   为什么要有它：`world_curve` / `longrun_sim` / `balance_check` / `spec_audit` 这四把**数值尺子**
   都要"照当前编队出一队人"去打模拟战，而那段组队逻辑当年写在**网页版界面层**
   （`UI._panels.buildAllies`，见归档仓库 `wxlh-game/js/ui.js`）。网页版一删，`UI` 就没了，
   这四把尺子当场全崩 —— 这就是"删工程"的真正代价，不是少几个截图。

   处置：把那**一个函数**原样搬到这里（函数体一字未改，只在开头补了一行 `const D = G.DATA`，
   因为原文用的是它模块级的 `D`）。四把尺子改成 `require('./_sim_allies').buildAllies`。
   它只依赖逻辑层（`Core` / `DATA`），不碰 DOM —— 所以搬出来是安全的。

   ⚠️ 网页版哪天复活：本文件与 `ui.js` 里那一份应当**逐字相同**，改动要么同步、要么只留一份。 */
const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
const C = () => G.Core;
const cname = (id) => C().charName(id);

  function buildAllies(hpPctMap, extraBuffs, opts) {
    const D = G.DATA;                 // 原文用的是模块级 D；搬出来后在这里取
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
          skills: C().protagonistSkills(), skillLv: S.player.skillLv || [0, 0, 0],
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

module.exports = { buildAllies };
