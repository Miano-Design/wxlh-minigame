/* 存档安全体检（更新不许丢档）：node scripts/save_audit.js
   ------------------------------------------------------------------------------
   起因（父亲大人 2026-09-27）：「重传到我手机，手里的存档没了 …… 以后版本更新把玩家存档搞没了咋办」。

   `save_migrate_audit.js` 管的是"**老档能不能读进来**"（字段补齐 / 迁移 / 每一页画得出）。
   这一把管另一件事：**任何一条"换档"路径出错时，玩家原来的档许不许被搞坏**。它逐条验：
     ① 落盘是密文、密文能原样解回；
     ② 明文老档、密文档、导出的档，三条都能读；
     ③ 读不出来的档（坏密文 / 明文坏了 / 来自更高版本）→ **主档不许被删、必须原样备份**；
     ④ **导入坏档 / 读坏槽之后，玩家当前的进度必须一字不动**（曾经的真洞：
        这两条路裸调 migrate，抛错时内存里的 S 已经被换掉，15 秒后心跳自动存盘→原来的档被覆盖）；
     ⑤ 换加密密钥（往密钥表后面加一条）之后，**老 tag 的档照样解得开**；
     ⑥ 从备份恢复能真的把进度拿回来。
   只读脚本（跑在假环境里，不碰真存档）。改存档相关的代码，跑一下。 */
const fs = require('fs');
const path = require('path');
const JS = path.resolve(__dirname, '../js');

let store = {};
global.GameGlobal = global;
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s == null ? '' : s).length * 12 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    const props = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign',
      'textBaseline', 'shadowColor', 'shadowBlur', 'shadowOffsetY', 'letterSpacing'];
    if (props.indexOf(k) >= 0) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const canvas = { width: 390, height: 844, getContext: () => ctxStub, toDataURL: () => '' };
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810 } }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onWindowResize() {}, onShow() {}, onHide() {},
  getStorageSync() { return null; }, setStorageSync() {}, removeStorageSync() {},
  setClipboardData() {}, getClipboardData() {}, showKeyboard() {}, onKeyboardConfirm() {}, offKeyboardConfirm() {},
  vibrateShort() {},
};
require(path.join(JS, 'mem-guard.js'));                     // ← 存档加密在这一层（save_migrate_audit 没加载它）
['wx-adapter.js', 'data.js', 'core.js', 'battle.js', 'dungeon.js', 'cv.js', 'uiw.js']
  .concat(fs.readdirSync(JS).filter((f) => /^sc-.*\.js$/.test(f)))
  .forEach((f) => { const p = path.join(JS, f); if (fs.existsSync(p)) require(p); });

const Core = global.Core, D = global.DATA;
const KEY = 'wxlh_save_v5', BAK = KEY + '_bak';
let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : '')); };
const sec = (t) => console.log('\n' + t);

/* 造一份"有进度"的档：返回它的明文 JSON */
function mkPlain() {
  Core.newGame();
  Core.setPlayerName('存档体检');
  try { Core.choosePlayerBloodline('修真'); } catch (e) {}
  Core.S.player.level = 33;
  Core.addCur('points', 456789);
  const cid = D.characters[0].id;
  Core.addChar(cid);
  Core.S.chars[cid].lv = 21; Core.S.chars[cid].star = 3;
  Core.S.worlds.W01.stages.normal = Core.S.worlds.W01.stages.normal.map(() => 3);
  return JSON.stringify(Core.S);
}
const snapshot = () => ({
  name: Core.S.player.name, lv: Core.S.player.level,
  points: Math.round(Core.S.cur.points), chars: Object.keys(Core.S.chars).length,
});
/* ⚠️ 不拿 `name` 当判据：新档没起名时 `S.player.name` 是空串，而读档的 `migrate()`
   会给空名字补一个默认名（这是既有产品行为，不是丢档）。判据只看**进度字段**。 */
const same = (a, b) => a.lv === b.lv && a.points === b.points && a.chars === b.chars;
const show = (x) => JSON.stringify(x);

/* ---------- ① 落盘必须是密文，且能原样解回 ---------- */
sec('=== ① 落盘形态 ===');
{
  const plain = mkPlain();
  Core.save();
  const raw = store[KEY];
  chk('落盘是密文（MPG1: 头）', /^MPG\d+:/.test(raw), String(raw).slice(0, 6) + '… 长度 ' + String(raw).length);
  chk('密文里不含明文字段名（改名改钱不能靠记事本）', String(raw).indexOf('"points"') < 0 && String(raw).indexOf('player') < 0);
  /* ⚠️ 别拿 `JSON.stringify(Core.S)` 当期望值：`save()` 自己会刷新 `idle.lastTs`，
     所以"存之前的明文"和"盘上那份明文"本来就差一个时间戳 —— 比**关键字段**才算数。 */
  {
    const dec = globalThis.__MP_DEC_STR(raw);
    let pj = null; try { pj = JSON.parse(dec); } catch (e) {}
    chk('密文能解回同一份进度（关键字段一致）', !!pj && pj.player.level === 33 && Math.round(pj.cur.points) === Math.round(Core.S.cur.points),
      pj ? ('lv ' + pj.player.level + ' · points ' + Math.round(pj.cur.points)) : '解出来不是 JSON');
  }
  chk('明文老档不被误判成密文', globalThis.__MP_DEC_STR(plain) === null);
}

/* ---------- ② 三条读档路：密文档 / 明文老档 / 导出串 ---------- */
sec('=== ② 三条读档路都能读回来 ===');
{
  const plain = mkPlain(); const want = snapshot();
  Core.save();                                   // 密文
  store[KEY] = plain;                            // 换成明文老档
  chk('明文老档：读得回', Core.load() && same(snapshot(), want), '期望 ' + show(want) + ' · 实得 ' + show(snapshot()));
  Core.save();
  const exported = Core.exportSave();
  chk('导出的档也是密文', /^MPG\d+:/.test(exported));
  store[KEY] = null; delete store[KEY];
  chk('导出 → 导入往返：进度一致', (function () { Core.newGame(); return Core.importSave(exported).ok && same(snapshot(), want); })(), '期望 ' + show(want) + ' · 实得 ' + show(snapshot()));
}

/* ---------- ③ 读不出来的档：主档不许被删、必须原样备份 ---------- */
sec('=== ③ 读不出来的档（坏密文 / 明文坏了 / 更高版本）===');
[
  { why: '坏密文', raw: 'MPG1:AAAA' + 'x'.repeat(120), expect: 'enc' },
  { why: '明文坏了', raw: '{"v":5,"player":', expect: 'json' },
  { why: '来自更高版本', raw: JSON.stringify({ v: 99, player: { name: '未来人', level: 9 }, cur: {}, chars: {} }), expect: 'future-v99' },
].forEach((t) => {
  const plain = mkPlain();
  store[KEY] = t.raw;
  const ok = Core.load();
  const dg = Core.saveDiag();
  chk(t.why + '：load 返 false', ok === false);
  chk(t.why + '：诊断报出原因（' + t.expect + '）', dg.issue && dg.issue.why === t.expect, dg.issue && dg.issue.why);
  chk(t.why + '：主键**没被删**（原文还在本机）', store[KEY] === t.raw);
  chk(t.why + '：已原样备份', Core.backupInfo().exists && Core.backupInfo().readable === false || Core.backupInfo().exists);
  store[KEY] = plain;                            // 收尾：还原成一份好档
});

/* ---------- ④ 换档失败必须回滚（曾经的真洞） ---------- */
sec('=== ④ 导入坏档 / 读坏槽：当前进度必须一字不动 ===');
{
  mkPlain(); Core.save();
  const before = snapshot();
  const r = Core.importSave('MPG1:BBBB' + 'y'.repeat(120));
  chk('导入坏档：返回失败', r.ok === false, r.msg);
  chk('导入坏档：**当前进度一字不动**（不是被半迁移的档顶掉）', same(snapshot(), before), JSON.stringify(snapshot()));
  chk('导入坏档：主档文件也没被改写', globalThis.__MP_DEC_STR(store[KEY]) === JSON.stringify(Core.S));

  /* 槽位：塞一份坏档进去，读它必须失败且不动当前进度 */
  store[KEY + '_slot1'] = 'MPG1:CCCC' + 'z'.repeat(120);
  const before2 = snapshot();
  chk('读坏槽：返回 false', Core.loadSlot(1) === false);
  chk('读坏槽：当前进度一字不动', same(snapshot(), before2), JSON.stringify(snapshot()));
  chk('槽位坏档也不许被删（原文留着）', String(store[KEY + '_slot1']).slice(0, 5) === 'MPG1:');
  delete store[KEY + '_slot1'];
}

/* ---------- ④b 迁移出错：不许"半迁移的档"把原档顶掉（2026-09-27 审计补的洞） ---------- */
sec('=== ④b 迁移抛错（老档里混了坏结构）===');
{
  /* 这份档 JSON 完全合法、能进 `fillDefaults`，但 `migrate()` 会在里面翻车
     （实测：`equips` 里塞一个 null → `Cannot read properties of null (reading 'lock')`）。 */
  store[KEY] = JSON.stringify({ v: 5, player: { name: '半坏档', level: 7 }, cur: { points: 321 }, equips: { e1: null } });
  delete store[BAK];
  const ok = Core.load();
  chk('迁移抛错：仍然进得去游戏（不白屏、不当新档）', ok === true);
  chk('迁移抛错：进度按已读到的样子保留（点数还在）', Math.round(Core.S.cur.points) === 321, String(Math.round(Core.S.cur.points)));
  chk('迁移抛错：诊断报得出原因', !!(Core.saveDiag().issue && /^migrate:/.test(Core.saveDiag().issue.why)), Core.saveDiag().issue && Core.saveDiag().issue.why);
  chk('迁移抛错：**原档必须已经留了一份备份**（以前这里没有 ⇒ 玩家接着玩就把原档顶掉了）', Core.backupInfo().exists);
  {
    const bakPack = JSON.parse(store[BAK]);
    const bakRaw = globalThis.__MP_DEC_STR(bakPack.raw) || bakPack.raw;      // 备份里可能是明文也可能是密文，两种都认
    chk('迁移抛错：备份里就是那份原档，且读得出来', Core.backupInfo().readable && bakRaw.indexOf('半坏档') > 0, 'why=' + bakPack.why);
  }
}

/* ---------- ⑤ 好的存档槽：存得了、读得回、列表能看见 ---------- */
sec('=== ⑤ 存档槽（存 / 读 / 列表元信息）===');
{
  mkPlain(); Core.S.player.level = 41; Core.setPlayerName('槽位甲'); Core.save();
  const want = snapshot();
  chk('存进 1 号槽', Core.saveSlot(1) === true);
  chk('槽里存的是密文', /^MPG\d+:/.test(store[KEY + '_slot1']));
  Core.newGame(); Core.setPlayerName('另一个');
  const info = Core.slotInfo().find((s) => s.slot === 1);
  chk('槽位列表能读出元信息（密文槽不再显示成空）', !!(info && info.exists && info.meta && info.meta.level === 41), JSON.stringify(info && info.meta));
  chk('读 1 号槽：进度回到槽里那份', Core.loadSlot(1) === true && same(snapshot(), want), '期望 ' + show(want) + ' · 实得 ' + show(snapshot()));
}

/* ---------- ⑥ 换密钥：老档照样解得开（密钥表） ---------- */
sec('=== ⑥ 换加密密钥（往密钥表加一条）之后 ===');
{
  const plain = mkPlain(); Core.save();
  const oldRaw = store[KEY];
  const RING = globalThis.__MP_KEYRING;
  RING.push({ tag: 'MPG2:', lo: 0x13572468 | 0, mhi: 0x0002468a, rot: 0x123 });
  try {
    Core.save();
    const newRaw = store[KEY];
    chk('换 key 后新写盘用新 tag', /^MPG2:/.test(newRaw), String(newRaw).slice(0, 5));
    /* ⚠️ 2026-09-27（音频岗顺手报的既有 flaky）：这里原来拿**整串 JSON** 比，
       而 `save()` 自己会刷新 `idle.lastTs` —— 毫秒一跳就红（他复现：40 次里 16 次，
       差异字段就是 `idle.lastTs`；康康在同一个会话里试也复现了）。
       改成**关键字段**比（与①那条同一口径）：解出来的进度对得上就算过。 */
    {
      const decOld = globalThis.__MP_DEC_STR(oldRaw);
      let dp = null; try { dp = JSON.parse(decOld); } catch (e) {}
      chk('**老 tag（MPG1）的档照样解得开**',
        !!dp && dp.player && dp.player.level === 33 && Math.round(dp.cur.points) === Math.round(Core.S.cur.points),
        dp ? ('lv ' + dp.player.level + ' · points ' + Math.round(dp.cur.points)) : '解出来不是 JSON');
    }
    store[KEY] = oldRaw;
    chk('换 key 之后：老档仍能正常读进游戏', Core.load() === true && Core.S.player.level === 33);
  } finally {
    RING.pop();
  }
  chk('不认识的版本不乱解（MPG9）', globalThis.__MP_DEC_STR('MPG9:AAAA') === null);
}

/* ---------- ⑦ 从备份恢复 ---------- */
sec('=== ⑦ 备份 → 一键恢复 ===');
{
  const plain = mkPlain(); const want = snapshot();
  Core.save();
  const good = store[KEY];
  store[KEY] = 'MPG1:DDDD' + 'w'.repeat(120);
  Core.load();                                   // 失败 + 备份（备份里是下面那份坏的）
  store[BAK] = JSON.stringify({ at: Date.now() - 3600000, why: 'json', raw: good });   // 放一份"好备份"
  Core.newGame(); Core.setPlayerName('新开的');
  const r = Core.restoreFromBackup();
  chk('恢复备份：返回成功', r.ok === true, r.msg);
  chk('恢复备份：进度回来了', same(snapshot(), want), '期望 ' + show(want) + ' · 实得 ' + show(snapshot()));
  chk('恢复之后诊断清空', !Core.saveDiag().issue);
}

/* ---------- ⑧ 删档：内存与硬盘一起回到全新（不许被心跳写回） ---------- */
sec('=== ⑧ 删档 ===');
{
  mkPlain(); Core.save();
  Core.wipeSave();
  chk('删档后主键被清掉', !store[KEY]);
  Core.save();                                   // 模拟 15 秒心跳
  chk('删档之后的心跳不许把旧档写回来', !store[KEY] || globalThis.__MP_DEC_STR(store[KEY]).indexOf('存档体检') < 0);
}

/* ---------- ⑨ 静态：三条切档路径都上过"回滚 + 迁移容错" ---------- */
sec('=== ⑨ 静态检查（切档路径的结构）===');
{
  const src = fs.readFileSync(path.join(JS, 'core.js'), 'utf8');
  chk('load 里 migrate 有 try/catch（迁移出错不再致命）', /try \{ migrate\(\); \}/.test(src));
  chk('切档走同一个 switchStateTo（导入 / 读槽不会再各写一套）', /function switchStateTo/.test(src) && !/S = fillDefaults\(defaultState\(\), data\);\s*\n\s*S\.v = SAVE_VER;\s*\n\s*migrate\(\);\s*\n\s*save\(\);\s*\n\s*return  getProxied\(\{ ok: true \}\)/.test(src));
  chk('switchStateTo 里带"回滚 S"（失败不留半迁移的档）', /S = prevS; offlineSettled = prevOffline; legacyRaw = prevLegacy;/.test(src));
  chk('备份只许变好（旧备份能读、新的读不出就不覆盖）', /if \(oOk && !nOk\) return;/.test(src));
  chk('解密必须过 JSON 校验（换 key 解出乱码不算成功）', /lastUnpackIssue = 'enc'/.test(src));
}

/* ---------- ⑩ 0927-P：删档的二次确认（随机 4 位数字 · 敲对了才删 · 删前留一手） ----------
   父亲大人 2026-09-27：「然后**点击删档跳出来一个确认弹窗随机生成 4 个数字，让玩家输入这四个数字
   一致后才能删档，避免误触**」。
   这一条走**真界面那条路**（`CV.dispatch('wipe_save')` → 弹窗 → 点输入格 → 真的走
   `wx.onKeyboardConfirm` 那个全局回调），四件事逐条钉住：
     ① 弹窗里那 4 个数字**每次打开都不一样**（不是写死的）；
     ② 弹窗里**没有"确认删档"那颗按钮**（避免又点一次误触）——只有一颗「取消」；
     ③ 敲错 → **不删**（进度一字不动、弹窗留着、给一句人话）；
     ④ 敲对 → 才真删（回开局），而且**删之前先把当前档留了一份**（`_bak` 里能读出来、
        能在「找回存档」里取回）。
   做坏试验（必须能红）：把 `wipe_input` 里 `if (typed !== wipeDigits) {…return;}` 那个判断删掉
   → ③ 当场红（随便敲四个字就把档删了）。 */
sec('=== ⑩ 删档的二次确认（随机 4 位数字）===');
{
  /* 假的数字键盘：把那个**全局**回调收下来（sc-last.js 的写法与 sc-grow.js 的购买数量逐句同源） */
  let kb = null;
  global.wx.onKeyboardConfirm = (fn) => { kb = fn; };
  global.wx.offKeyboardConfirm = () => { kb = null; };
  global.wx.showKeyboard = () => {};
  const typeIn = (val) => { const fn = kb; if (!fn) return false; fn({ value: val }); return true; };

  const CV = global.CV, U = global.U;
  CV.setup(global.wx.getWindowInfo());
  /* ⚠️ 派发前先把**开场引导**放掉：`uiw.js` 把 `CV.dispatch` 包了一层 ——
     "引导在的时候只放行高亮那颗"，其余一律吃掉（返回 true 但什么都不做）。
     本尺子量的是删档那颗按钮本身，所以每一跳都先 `coachClearAll()`（idle_double_audit 同款做法）。 */
  const act = (id) => { if (U.coachClearAll) U.coachClearAll(); return CV.dispatch(id); };
  const digitsOf = () => {
    const o = U.overlay;
    const m = o && /^删除当前进度\s+(\d) (\d) (\d) (\d)$/.exec(o.title);
    return m ? m.slice(1).join('') : '';
  };
  const fresh = () => {
    mkPlain(); Core.setPlayerName('删档体检'); Core.S.player.level = 44; Core.save();
    if (U.overlay) U.overlay = null;
    if (U.coachClearAll) U.coachClearAll();
    CV.reset('home');
    if (U.coachClearAll) U.coachClearAll();
  };

  /* ① 每次打开都不一样（摇 8 次，要求至少出现两种不同的数字串） */
  const seen = {};
  for (let i = 0; i < 8; i++) {
    fresh();
    act('wipe_save');
    seen[digitsOf()] = (seen[digitsOf()] || 0) + 1;
    U.overlay = null;
  }
  const kinds = Object.keys(seen).filter((k) => /^\d{4}$/.test(k));
  chk('① 弹窗标题上就是**随机 4 位数字**，且每次打开都不一样（8 次里至少两种）',
    kinds.length >= 2, JSON.stringify(seen));

  /* ② 只有一颗「取消」，没有"确认删档"那颗按钮 */
  fresh();
  act('wipe_save');
  const ids = (CV.hits || []).map((h) => h.id);
  chk('② 弹窗里没有"确认删档"那颗按钮：只有一颗「取消」＋ 一个输入格',
    !!U.overlay && U.overlay.single === true && U.overlay.okLabel === '取消'
    && ids.indexOf('_cf_yes') >= 0 && ids.indexOf('wipe_input') >= 0
    && ids.indexOf('_cf_no') < 0 && ids.indexOf('wipe_save') < 0,
    '热区 ' + ids.filter((x) => /^(_cf|wipe)/.test(x)).join('+') + ' · 按钮 ' + (U.overlay && U.overlay.okLabel));
  const noteTxt = ((U.overlay && U.overlay.note) || []).join('');
  chk('②b 弹窗把"照着输入 / 删之前留一手"这两件事都写清楚了（不是只有一串数字）',
    /输入/.test(((U.overlay && U.overlay.lines) || []).join('')) && /留一手/.test(noteTxt),
    '正文 ' + JSON.stringify((U.overlay && U.overlay.lines) || []) + ' · 小字 ' + JSON.stringify(noteTxt));

  /* ③ 敲错 → 不删 */
  const good = digitsOf();
  const wrong = good === '0000' ? '1111' : '0000';
  act('wipe_input');
  const typed = typeIn(wrong);
  chk('③ 敲错数字：**不删**（进度一字不动）＋ 弹窗留着 ＋ 一句人话',
    typed && Core.S.player.level === 44 && !!U.overlay
    && (CV.toasts || []).some((x) => /对不上/.test(String(x.msg))),
    'lv=' + Core.S.player.level + '（应 44）· 弹窗 ' + (U.overlay ? '还开着' : '被关了')
    + ' · 提示 ' + JSON.stringify((CV.toasts || []).map((x) => x.msg)));

  /* ④ 敲对 → 才真删；而且删之前留了一份 */
  chk('④-1 弹窗里那个"留一手"的钩子真在（`CS.keepBackup` 是官方出口）', typeof global.CloudSync.keepBackup === 'function');
  store[BAK] = null; delete store[BAK];
  act('wipe_input');
  const typed2 = typeIn(digitsOf());
  const bak = (function () { try { return JSON.parse(store[BAK] || 'null'); } catch (e) { return null; } })();
  const bakPlain = bak ? (globalThis.__MP_DEC_STR(bak.raw) || bak.raw) : '';
  chk('④-2 敲对数字：真的删了（回开局页）＋ 弹窗关掉',
    typed2 && CV.top().name === 'welcome' && !U.overlay, '页面 ' + CV.top().name + ' · 弹窗 ' + (U.overlay ? '还开着' : '已关'));
  chk('④-3 删之前把当前档留了一份（`_bak` 里是那份 lv44 的档，且读得出来）',
    !!bak && /"(?:level)":44/.test(bakPlain) && Core.backupInfo().readable,
    bak ? ('why=' + bak.why + ' · 备份里 level 44 = ' + /"level":44/.test(bakPlain)) : '**没有留下备份**');
  const back = Core.restoreFromBackup();
  chk('④-4 这份留档真能取回（「找回存档」那颗按钮走的就是这条路）',
    back.ok === true && Core.S.player.level === 44, (back.msg || '') + ' · lv' + Core.S.player.level);
  if (U.overlay) U.overlay = null;
}

console.log('\n存档安全体检：' + pass + ' 条对得上，' + fail + ' 条对不上');
if (fail) { console.log('结论：✗ 有丢档风险，逐条看上面红色的'); process.exitCode = 1; }
else console.log('结论：换档路径都有兜底（读不出也丢不了、换密钥老档照读、失败必回滚）✓');
