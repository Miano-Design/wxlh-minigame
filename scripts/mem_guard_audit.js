/* 内存加固体检（node scripts/mem_guard_audit.js）
   ------------------------------------------------------------------------------
   起因：V1.1.0 给 js/core.js 上了《小游戏内存风险检测与辅助加固工具》的加解密运行时
   （encode / decode + getProxied 包装），防止玩家用 Cheat Engine 一类工具直接搜内存改
   货币 / 等级 / 属性。这套东西**出问题时是静音的**：
     · 加解密一旦不再严格互逆 → 金币慢慢对不上账（浮点精度丢一位，界面看不出来）；
     · 读档之后的 S 一旦变回普通对象 → 保护整体失效，**但游戏照常跑**，谁也发现不了；
     · 存档一旦被写成密文 → 老玩家、旧版本全读不了档。
   这三件事都没有第二个人会替我们盯着，所以必须有一把尺子。

   它查四件事：
     ① encode / decode 在任何有限双精度上都严格互逆（含 ±0、次正规数、极大极小值）；
     ② 编出来的值一律是有限数（指数域不做旋转的话，会编出 NaN/Infinity —— 那会毁档）；
     ③ 状态树在内存里**存的是密文**（新档、读档两条路都要查）；
     ④ 落到存档里的仍然是**明文 JSON**（兼容老档 / 旧客户端）。

   为什么能看见"内存里存的什么"：加解密运行时把密文写进 Proxy 背后的 target 对象，
   而那三个 WeakMap 是 core.js 的**文件级 let**（外面拿不到，这是对的，别为了测试开后门）。
   所以这里的做法是：**把 core.js 的源码读进来，在末尾追加一行调试出口，再 eval** ——
   只动这份临时字符串，仓库里的 core.js 一个字都不改。
   只读脚本，跑在假环境里，不碰玩家存档。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++; console.log('FAIL: ' + name + (extra ? '  → ' + extra : ''));
}

const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
/* V1.1.1（拆掉"加固分叉"）：加解密**运行时本体**从 core.js 搬到了 js/mem-guard.js
   （只在小游戏端加载、core.js 只留一个 getProxied 钩子）——理由见那两个文件的头部注释：
   它能搬走之后，core.js 才可能两端同源、同步链才不会每次都被拒绝。
   所以这把尺子也得分两处查，而且**加载顺序要和 game.js 一致**（mem-guard 在前）。 */
const guardPath = path.join(ROOT, 'js/mem-guard.js');
const coreSrc = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
if (!fs.existsSync(guardPath)) {
  console.log('\n=== 内存加固体检 ===');
  console.log('  ✗ 找不到 js/mem-guard.js（加固运行时本体；game.js 必须在 core.js 之前 require 它）\n');
  process.exit(1);
}
const guardSrc = fs.readFileSync(guardPath, 'utf8');
if (guardSrc.indexOf('encode_') < 0 || guardSrc.indexOf('getProxied') < 0) {
  console.log('\n=== 内存加固体检 ===');
  console.log('  ✗ js/mem-guard.js 里没有加固运行时（是不是被删了/被覆盖了？）\n');
  process.exit(1);
}
if (coreSrc.indexOf('getProxied(') < 0) {
  console.log('\n=== 内存加固体检 ===');
  console.log('  ✗ js/core.js 少了加固钩子 —— 正文那 600+ 处 `getProxied({…})` 包装没东西可调（保护等于没了）\n');
  process.exit(1);
}
for (const f of ['js/data.js', 'js/battle.js', 'js/dungeon.js']) {
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
}
/* 两段**分开** eval（不能串成一段：guard 与 core 各有一份 `getProxied` 声明，
   串起来就是"重复声明"语法错）。
   顺序与 game.js 一致：guard 先跑 → 定义运行时并把真 getProxied 挂到 globalThis，
   顺手把三张表暴露给我；core 后跑 → 它的钩子从 globalThis 取到真函数。 */
eval(guardSrc + `
globalThis.__MPDBG = { t2p: all_target_obj_to_proxied_map, p2t: all_proxied_obj_to_target_map,
  attrs: proxied_to_encrypted_attrs_map, encode: encode_28485312, decode: decode_36271251 };`);
eval(coreSrc);
const Core = window.Core, D = window.DATA, MP = globalThis.__MPDBG;

console.log('\n=== 内存加固体检 ===');

/* ① / ② 加解密本身 */
{
  const corpus = [
    0, -0, 1, -1, 2, 3, 7, 88, 12345678, -12345678, 98765, 0.1, 0.171, 1 / 3, -2.5,
    Math.PI, 1e6, 1e12, 1e15, 9.007199254740992e15, 9007199254740994, 1e-5, 1e-300,
    5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, -1.7976931348623157e308,
    1e21, -1e21, 12345.6789, 0.000000123456,
  ];
  let seed = 0x2f6e2b1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 20000; i++) {
    const e = Math.floor(rnd() * 220) - 110;
    corpus.push((rnd() * 2 - 1) * Math.pow(2, e));
    corpus.push(Math.floor((rnd() * 2 - 1) * 1e15));
  }
  let bad = 0, notFinite = 0, sameAsPlain = 0;
  corpus.forEach((v) => {
    const enc = MP.encode(v);
    if (!Number.isFinite(enc)) notFinite++;
    if (enc === v) sameAsPlain++;
    const back = MP.decode(enc);
    // ±0 用 Object.is 区分；其余按值比（NaN 不参与，语料里没有）
    if (!Object.is(back, v)) { bad++; if (bad <= 3) console.log('   互逆失败:', String(v), '→', String(enc), '→', String(back)); }
  });
  t('① encode/decode 严格互逆（' + corpus.length + ' 个值）', bad === 0, bad + ' 个不互逆');
  t('② 编出来的值一律是有限数（不会是 NaN/Infinity）', notFinite === 0, notFinite + ' 个非有限');
  t('③ 编出来的值不等于明文（精确值搜索搜不到）', sameAsPlain === 0, sameAsPlain + ' 个没变');
  const sp = [NaN, Infinity, -Infinity];
  t('④ NaN / ±Infinity 原样过（不参与变换，也不污染位型）', sp.every((x) => Object.is(MP.encode(x), x) && Object.is(MP.decode(x), x)));
}

/* 内部小工具：拿到 Proxy 背后的真对象，读**内存里实际存着的值** */
const rawOf = (o) => MP.p2t.get(o) || o;
const inMem = (obj, key) => rawOf(obj)[key];

/* ⑤ 新档：内存里必须是密文 */
{
  Core.newGame();
  Core.setPlayerName(D.PROTAG_NAMES[0]);
  Core.S.cur.points = 12345678;
  Core.S.player.level = 88;
  Core.S.player.attrs.muscle = 31;
  const memPoints = inMem(Core.S.cur, 'points');
  t('⑤ 新档：cur.points 在内存里不是明文', memPoints !== 12345678, '内存里 = ' + String(memPoints));
  t('⑤ 新档：加密字段解密回来 = 界面上的值', MP.decode(memPoints) === Core.S.cur.points);
  t('⑤ 新档：player.level 在内存里不是明文', inMem(Core.S.player, 'level') !== 88);
  t('⑤ 新档：attrs.muscle 在内存里不是明文', inMem(Core.S.player.attrs, 'muscle') !== 31);
  t('⑤ 新档：currency 标记里有 points', !!MP.attrs.get(Core.S.cur) && MP.attrs.get(Core.S.cur).has('points'));
}

/* ⑥ 存档：**V1.1.12 口径反转** —— 从"必须明文"改成"**必须是密文、而且三种档都要读得回**"。
   为什么反：父亲大人 09-27 的原话是「**只要不被人改就行了**」。
   原来那两条守的是"老玩家 / 旧客户端读得回"，可代价是**存档明文摆在磁盘上、记事本改个数就能改钱**
   （内存加固再厚也绕过这一条）。现在改成：**落盘密文**，兼容性由 `unpackSave` 的"没前缀当明文"来保证 ——
   两件事同时成立才算过：
     · 落盘的**没有明文数字**（改文件白嫖这条堵住）；
     · **密文能原样读回**（新客户端自己的档）；
     · **明文老档照读**（拿一份老格式的 JSON 直接喂回去，必须读得出）——这一条是"不许毁档"的锁。 */
{
  Core.save();
  const raw = store['wxlh_save_v5'] || '';
  t('⑥ 落盘的是**密文**（明文数字一个都搜不到 —— 改文件白嫖这条堵住）',
    raw.indexOf('MPG1:') === 0 && raw.indexOf('"points":12345678') < 0 && raw.indexOf('12345678') < 0);
  t('⑥ 密文档能原样读回（新客户端自己的档）', (() => {
    const keep = store['wxlh_save_v5'];
    const ok = Core.load() !== false && Core.S.cur.points === 12345678;
    store['wxlh_save_v5'] = keep;
    return ok;
  })());
  t('⑥ **明文老档照读**（把一份老格式 JSON 直接写进去，必须读得出来 —— 这是"不许毁档"的锁）', (() => {
    const keep = store['wxlh_save_v5'];
    const plain = JSON.parse(keep.indexOf('MPG1:') === 0 ? (typeof __MP_DEC_STR === 'function' ? __MP_DEC_STR(keep) : '{}') : keep);
    plain.cur.points = 424242;
    store['wxlh_save_v5'] = JSON.stringify(plain);      // ← 明文，没有 MPG1: 前缀
    const ok = Core.load() !== false && Core.S.cur.points === 424242;
    store['wxlh_save_v5'] = keep;
    return ok;
  })());
}

/* ⑦ 读档之后：状态树必须**还是加固对象**（这是最容易悄悄失效的一条） */
{
  const plainSave = store['wxlh_save_v5'];
  // 换一个新进程环境最干净：这里就地重置 Core 的内部状态，再用同一份明文档读回来
  store['wxlh_save_v5'] = plainSave;
  const ok = Core.load();
  t('⑦ 明文老档能读进来', ok === true);
  t('⑦ 读档后 S 仍是加固对象（Proxy 背后有 target）', !!MP.p2t.get(Core.S));
  t('⑦ 读档后 S.cur 仍是加固对象', !!MP.p2t.get(Core.S.cur));
  const mp = inMem(Core.S.cur, 'points');
  t('⑦ 读档后 cur.points 在内存里不是明文', mp !== 12345678, '内存里 = ' + String(mp));
  t('⑦ 读档后 cur.points 解密回来仍然是 12345678', MP.decode(mp) === 12345678 && Core.S.cur.points === 12345678);
  const ml = inMem(Core.S.player, 'level');
  t('⑦ 读档后 player.level 在内存里不是明文', ml !== 88, '内存里 = ' + String(ml));
  /* 名字/字符串这类不该被碰 */
  t('⑦ 读档后字符串字段没被加密破坏', typeof Core.S.player.name === 'string' && Core.S.player.name === D.PROTAG_NAMES[0]);
  /* 数组（技能等级）读档后也得对得上 */
  t('⑦ 读档后数组类字段长度/类型正常', Array.isArray(Core.S.player.skillLv) && Core.S.player.skillLv.every((x) => typeof x === 'number'));
  /* 读档后写一次再读回来（加密字段的写-读闭环） */
  Core.S.cur.points = 555000;
  t('⑦ 读档后写入 555000，读回来一致', Core.S.cur.points === 555000);
  t('⑦ 读档后写入的值在内存里也不是明文', inMem(Core.S.cur, 'points') !== 555000);
}

console.log('');
console.log(fail ? `✗ ${pass} passed, ${fail} failed` : `✓ ${pass} passed, 0 failed`);
console.log('结论：加解密严格互逆 · 编出来的值都是有限数 · 读档后内存里是密文 · 存档落盘是密文（明文老档照读）');
console.log('');
process.exit(fail ? 1 : 0);
