
/* ================= 《残域》内存数值加解密（自实现 · V1.1.0） =================
   目的：让 Cheat Engine 那类"按数值精确搜索"的工具在 JS 堆里**搜不到**货币 / 等级 / 属性，
   把改内存的成本从"搜到就改"抬到"先逆出算法"。

   【为什么走比特级，不走加减乘除】
     · 四则运算会溢出 / 掉精度：金币能上 1e12 以上，乘一个大常数就丢低位；命中率、倍率
       这类浮点更脆。而 `decode(encode(v)) === v` 是本项目的硬指标 —— 经济、战斗结算、存档
       全靠它，差一个 ULP 都会让玩家对不上账。
     · 改 IEEE754 的位型是**双射**：任意有限双精度进去、原样回来，一位不差，也不可能溢出。

   【做什么（三块互不重叠的位域，各做一次可逆变换）】
     ① 尾数低 32 位：异或 _MP_K_LO；
     ② 尾数高 20 位：异或 _MP_K_MHI；符号位：翻转（正负号变反）；
     ③ 指数域（11 位）：在 0..2046 上做**模 2047 的旋转**（加上 _MP_E_ROT 再取模）。
        为什么不直接异或指数：异或有可能把指数打成全 1（0x7ff），那在 IEEE754 里就是
        NaN / Infinity。堆里躺着一个"看着是数字、一算就是 NaN"的值，是最难查的一类线上事故
        （JSON.stringify 会把它写成 null → 直接毁档）。模 2047 的旋转把像**限制在 0..0x7fe**，
        从根上排掉这种可能。

   【数值安全】
     · 有限数：encode / decode 严格互逆（含 ±0、次正规数、1e308 级别的极值）。
     · NaN / ±Infinity：不进变换、原样返回 —— 它们不参与作弊，硬编码进去反而污染位型。
     · 编出来的值一律是有限数（指数像 ≠ 0x7ff），不会在堆里制造 NaN。

   ⚠️ 换 key 时三处（_MP_K_LO / _MP_K_MHI / _MP_E_ROT）要一起换；
      _MP_E_ROT 必须是 1..2046 之间、且 3 个位域互不重叠，否则上面两条保证就不成立了。
   ⚠️ 这份算法与运行时**不设第二个副本**：它由《小游戏内存风险检测与辅助加固工具》注入到
      js/core.js，改动只在这里做（脚本会覆盖式重生成，别手改注出来的那段运行时代码）。 */
const _MP_K_LO = 0x9e3779b9 | 0;      // 尾数低 32 位异或键
const _MP_K_MHI = 0x000bf035;         // 尾数高 20 位异或键（只占 20 位，不许越到指数域）
const _MP_SIGN = 0x80000000 | 0;      // 符号位翻转掩码
const _MP_E_ROT = 0x240;              // 指数域的模 2047 旋转量
const _MP_E_MOD = 0x7ff;              // 指数域取值个数（0..2046 有效，2047 = NaN/Inf 标志）
const _MP_BUF = new ArrayBuffer(8);
const _MP_F64 = new Float64Array(_MP_BUF);
const _MP_U32 = new Uint32Array(_MP_BUF);
/* 双视图按字节序取字：x86 / ARM（含微信小游戏运行时、本机 Node）都是小端。
   这里冷启动断言一次，万一跑到大端环境就自动换下标，免得悄悄编错。 */
const _MP_LO_IDX = (function () { _MP_F64[0] = 1; return _MP_U32[0] === 0 ? 0 : 1; })();
const _MP_HI_IDX = 1 - _MP_LO_IDX;

// 需实现数据加解密逻辑
function encode_28485312(value){
	if (typeof value !== 'number' || !isFinite(value)) return value;
	_MP_F64[0] = value;
	const lo = _MP_U32[_MP_LO_IDX];
	const hi = _MP_U32[_MP_HI_IDX];
	const exp = (hi >>> 20) & 0x7ff;                       // 指数域 11 位
	const mantHi = hi & 0xfffff;                           // 尾数高 20 位
	_MP_U32[_MP_LO_IDX] = (lo ^ _MP_K_LO) >>> 0;
	_MP_U32[_MP_HI_IDX] = (((hi & _MP_SIGN) ^ _MP_SIGN)    // 符号位翻转
		| (((exp + _MP_E_ROT) % _MP_E_MOD) << 20)          // 指数域旋转（像永远 ≠ 0x7ff）
		| (mantHi ^ _MP_K_MHI)) >>> 0;
	return _MP_F64[0];
}
//end encode_28485312
function decode_36271251(value){
	if (typeof value !== 'number' || !isFinite(value)) return value;
	_MP_F64[0] = value;
	const lo = _MP_U32[_MP_LO_IDX];
	const hi = _MP_U32[_MP_HI_IDX];
	const exp = (hi >>> 20) & 0x7ff;
	const mantHi = hi & 0xfffff;
	_MP_U32[_MP_LO_IDX] = (lo ^ _MP_K_LO) >>> 0;           // 异或是自逆运算，原样再来一次
	_MP_U32[_MP_HI_IDX] = (((hi & _MP_SIGN) ^ _MP_SIGN)
		| (((exp - _MP_E_ROT + _MP_E_MOD) % _MP_E_MOD) << 20)   // 指数域转回去
		| (mantHi ^ _MP_K_MHI)) >>> 0;
	return _MP_F64[0];
}
//end decode_36271251
let all_target_obj_to_proxied_map = new WeakMap;	
let all_proxied_obj_to_target_map = new WeakMap;	
let proxied_to_encrypted_attrs_map = new WeakMap;	

let __inited_not_to_proxied_code = false
let not_proxied_types = new Set([Function, Date, RegExp, Error, Promise, Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Reflect]);
let not_proxied_objs = new Set()
	
!function(){
	if(__inited_not_to_proxied_code) return;
	__inited_not_to_proxied_code = true;
	
	
	if(typeof SharedArrayBuffer!== 'undefined'){
		not_proxied_types.add(SharedArrayBuffer)
	}
	
	if(typeof wx!=='undefined'){
		not_proxied_objs.add(wx)
	}
	if(typeof cc!=='undefined'){
		not_proxied_objs.add(cc)
	}
	if(typeof Laya!=='undefined'){
		not_proxied_objs.add(Laya)
	}
	if(typeof GameGlobal!=='undefined'){
		not_proxied_objs.add(GameGlobal)
	}
	if(typeof Reflect!=='undefined'){
		not_proxied_objs.add(Reflect)
	}
	
	for(let one of not_proxied_objs){
		one.__not_to_proxied = true;
	}
	for(let one of not_proxied_types){
		if(one.prototype && Object.isExtensible(one.prototype))
		Object.defineProperty(one.prototype, '__not_to_proxied', {
			enumerable: false,
			configurable: false,
			writable: false,
			value: true
		})
	}
}();
	
function markAttrDecrypted(attr, receiver){
	if(attr === 'length') return false
	let r_ = all_proxied_obj_to_target_map.has(receiver)? receiver : all_target_obj_to_proxied_map.get(receiver)
	if(r_){
		let cur_attrs_ = proxied_to_encrypted_attrs_map.get(r_)
		if(!cur_attrs_){
			cur_attrs_ = new Set
			proxied_to_encrypted_attrs_map.set(r_, cur_attrs_)
		}
		cur_attrs_.add(attr)
		return true
	}else{
		return false
	}
}

function isAttrDecrypted(attr, ofObj){
	let r_ = all_proxied_obj_to_target_map.has(ofObj)? ofObj : all_target_obj_to_proxied_map.get(ofObj)
	if(r_){
		let cur_attrs_ = proxied_to_encrypted_attrs_map.get(r_)
		return cur_attrs_ && cur_attrs_.has(attr)
	}
	return false
}	

function customReflectGet(target, propertyKey, receiver = target) {
  if (typeof target !== 'object' || target === null) {
    throw new TypeError('Target must be an object');
  }
  /* 快路径（本工程实测改动）：原来这里不管什么属性都先
     Object.getOwnPropertyDescriptor(target, key) —— 每次取值都分配一个描述符对象，
     读一次字符串/函数也要付这笔钱。改成：先直接取值，**只有取到 number 才去查解密表**。
     状态树里绝大多数读取是对象/字符串/函数，省掉的正是这部分白付的开销。
     ⚠️ 代价：目标对象上若有取值器（accessor），this 会绑成 target 而不是 receiver。
        加固对象只有普通数据属性（getProxied 只包 getProxied({...}) 这类字面量），不涉及。 */
  const ret_ = target[propertyKey];
  if (typeof ret_ === 'number' && isAttrDecrypted(propertyKey, target)) {
    return decode_36271251(ret_);
  }
  return ret_;
}

function customReflectSet(target, propertyKey, value, receiver = target) {
  if (typeof target !== 'object' || target === null) {
    throw new TypeError('Target must be an object');
  }
  /* 快路径（本工程实测改动）：原来无论什么写都走
     `Object.defineProperty(receiver, key, {…, value: …})` —— defineProperty 是**属性语义变更**，
     重复写同一个键会把 V8 的隐藏类打散、甚至把对象降级成字典模式，越用越慢。
     数值该加密还是加密（这一步不能省），但落值改走 Reflect.set：语义与原来一致
     （不可写 / 只读属性照样返回 false），却保住了快属性。 */
  let v = value;
  if (typeof value === 'number' && markAttrDecrypted(propertyKey, receiver)) {
    v = encode_28485312(value);
  }
  return Reflect.set(target, propertyKey, v, target);
}

let _handler_59893437 ={
	/* 两个陷阱改成**内联**（本工程实测改动）：原来 get/set 各自再调一层
	   customReflectGet / customReflectSet，一次属性访问要付"Proxy 陷阱 + 普通函数调用"两层；
	   内联掉那一层，帧内的几千次访问立省一截。语义与那两个函数版一致。 */
	set: function (t_, key, value, reciver) {
		if (typeof t_ !== 'object' || t_ === null) throw new TypeError('Target must be an object')
		let v = value
		if (typeof value === 'number' && markAttrDecrypted(key, reciver)) v = encode_28485312(value)
		return Reflect.set(t_, key, v, t_)
	},

	get: function(t_, key, reciver){
		const v = t_[key]
		if (typeof v !== 'number') return v
		return isAttrDecrypted(key, t_) ? decode_36271251(v) : v
	},

	getOwnPropertyDescriptor(target, key) {
		let ret_ = Object.getOwnPropertyDescriptor(target, key);
		if(!ret_ || typeof ret_.value !== 'number') return ret_;
		let proxied_ = all_target_obj_to_proxied_map.get(target);
		if(isAttrDecrypted(key, proxied_)){
			ret_.value = decode_36271251(ret_.value)
		}
		return ret_
	},
}

function getProxied(all_obj){
	if(!all_obj) return all_obj
	if(all_obj && (all_obj.__not_to_proxied || all_proxied_obj_to_target_map.has(all_obj))) return all_obj
	if(typeof all_obj !== 'object' || !all_obj.__proto__){
		return all_obj
	}
	
	let info_ = all_target_obj_to_proxied_map.get(all_obj)
	let proxied_ = info_&&info_.proxied
	if(proxied_){
		return proxied_
	}else{
		let pro = new Proxy(all_obj, _handler_59893437)
		
		all_proxied_obj_to_target_map.set(pro, all_obj)
		
		all_target_obj_to_proxied_map.set(all_obj, pro)
		return pro
	}
}



class _extend_map_59893437 extends Map {
	set(key, value) {
        if (typeof value === 'number') {
            const transformedValue = encode_28485312(value);
            return super.set(key, transformedValue);
        } else {
            return super.set(key, value);
        }
    }

    get(key) {
        const value = super.get(key);
        if (typeof value === 'number') {
            return decode_36271251(value);
        } else {
            return value;
        }
    }

    forEach(callback, thisArg) {
        super.forEach((value, key, map) => {
            callback.call(thisArg, this.get(key), key, this);
        });
    }

    *entries() {
        for (let [key, value] of super.entries()) {
            yield [key, this.get(key)];
        }
    }

    *values() {
        for (let key of super.keys()) {
            yield this.get(key);
        }
    }

    [Symbol.iterator]() {
        return this.entries();
    }

	get size() {
        return super.size;
    }
}
Map = _extend_map_59893437;
/* ================= 挂到全局（V1.1.1 · 拆掉"加固分叉"）=================
   这套运行时原来被《小游戏内存风险检测与辅助加固工具》**注入在 core.js 头部**，
   于是 core.js 在小游戏端带加固、网页版不带 → 两端不同源、`sync-logic` 拒绝覆盖
   （加固一丢是"静默回归"：游戏照常跑、尺子照常绿，保护没了没人知道）。
   现在运行时本体住在本文件、**只在小游戏端加载**（game.js 在 core.js **之前** require），
   core.js 里只留一个钩子（`globalThis.getProxied` 有就用、没有就当恒等函数）——
   于是**两端 core.js 恢复同一份**，加固行为一点没变（同一套 encode/decode/Proxy）。
   ⚠️ 本文件是那个工具**生成**出来的：要改算法/换 key，改生成侧再重生成，
      别在这一份上手改（否则下次生成又对不上）。
   ⚠️ 依赖：只用到全局内置（Proxy / WeakMap / Map / Reflect / ArrayBuffer），
      不依赖 data.js / core.js —— 所以能安全地放在 core.js 之前加载。 */
if (typeof globalThis !== 'undefined') {
  globalThis.getProxied = getProxied;          // ← core.js 的钩子就找这个名字
  globalThis.__MP_ENCODE = encode_28485312;    // 给尺子/排查用（mem_guard_audit 会读）
  globalThis.__MP_DECODE = decode_36271251;
}

/* ================= 存档加密（V1.1.12 · 父亲大人 09-27「只要不被人改就行了」）=================
   为什么还要它：上面那套 encode/decode 保护的是**内存里的堆**（按数值精确搜索搜不到），
   但**存档本身是明文 JSON** —— PC 微信把小游戏的存档落在磁盘上，**直接改文件就能改钱**
   （实测：`"points":12365678` 明晃晃摆在那儿）。内存加固再厚，这一条也绕过去了。
   ⇒ 把整份存档字符串过一层加密再写盘。

   做法（三条硬要求）：
     ① **可逆且不丢进度**：按 **UTF-16 码元**逐位异或（不做 UTF-8，避免代理对在半路被弄坏），
        再 base64 —— 打印字符、任何存储都不会二次转义；满配档 13KB → 约 17KB（微信单 key 上限 1MB，很宽裕）。
     ② **老档照读**：密文带前缀 `MPG1:`；**没有前缀的当明文**（老档 / 老导出 / 手工备份全兼容）。
     ③ **密钥沿用同一份 key 材料**（`_MP_K_LO` / `_MP_E_ROT`），换 key 时与上面一起换。
   ⚠️ 这一层不是"军用级"——它挡的是**改文件白嫖**（成本从"记事本改个数"抬到"先逆出算法"），
      与内存那层同一个定位：不追求不可破，只追求"比不改贵得多"。 */
const _MP_S_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/* ================= V1.1.15（2026-09-27 存档审计）：**密钥表（keyring）** =================
   父亲大人："以后更新避免丢档"。存档加密这一层最容易埋的雷就是"哪天换了 key，
   老玩家手里的密文再也解不开"——表面上只是"读不出"，实际上等于把所有人的档废掉。
   所以密钥**不许覆盖，只许往后加**：
     · 每条 = { tag: 'MPG1:', lo, mhi, rot }，`tag` 就是密文开头那五个字符；
     · **写盘永远用表里最后一条**（＝最新）；
     · **解密按密文自己的 tag 找那一条** —— 老档用老 key 解，新档用新 key 解，互不干扰。
   换密钥的流程：往数组**末尾**追加一条（tag 递增 MPG2: / MPG3: …），旧的**一行都不删**。
   ⚠️ 数值那一层（encode_28485312 / decode_36271251）是**内存态**的，不在这张表里，
      它换 key 不影响存档（存档里存的是 JSON 文本，走的是下面这条字符串加密）。 */
const _MP_KEYRING = [
  { tag: 'MPG1:', lo: 0x9e3779b9 | 0, mhi: 0x000bf035, rot: 0x240 },
];
function _mpKeyOf(raw) {
  const s = String(raw == null ? '' : raw);
  for (let i = 0; i < _MP_KEYRING.length; i++) {
    const k = _MP_KEYRING[i];
    if (s.slice(0, k.tag.length) === k.tag) return k;
  }
  return null;                                                    // 不认识的版本 → 宁可解不出，也不乱解
}
function _mpKeyUnit(i, key) {
  /* 由同一份 key 材料派生的伪随机密钥流（每字符一个 16 位字）。 */
  const keyLo = key ? key.lo : _MP_K_LO, keyRot = key ? key.rot : _MP_E_ROT;
  let x = (keyLo ^ (keyRot * 2654435761)) >>> 0;
  x = (x + (i + 1) * 2246822519) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
  x ^= x >>> 16;
  return x & 0xFFFF;
}
function _mpB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += _MP_S_B64[b0 >> 2];
    out += _MP_S_B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : _MP_S_B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : _MP_S_B64[b2 & 63];
  }
  return out;
}
function _mpUnB64(s) {
  const map = {};
  for (let i = 0; i < _MP_S_B64.length; i++) map[_MP_S_B64[i]] = i;
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = map[s[i]], c1 = map[s[i + 1]], c2 = map[s[i + 2]], c3 = map[s[i + 3]];
    if (c0 === undefined || c1 === undefined) return null;
    out.push(((c0 << 2) | (c1 >> 4)) & 255);
    if (c2 !== undefined) out.push(((c1 & 15) << 4 | (c2 >> 2)) & 255);
    if (c3 !== undefined) out.push(((c2 & 3) << 6 | c3) & 255);
  }
  return out;
}
function __MP_ENC_STR(str) {
  const s = String(str == null ? '' : str);
  const key = _MP_KEYRING[_MP_KEYRING.length - 1];
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const u = (s.charCodeAt(i) ^ _mpKeyUnit(i, key)) & 0xFFFF;
    bytes.push(u >> 8, u & 255);
  }
  /* ⚠️ 头**必须**取自"实际加密用的那把 key"的 tag，不能用另一个常量 ——
     两者一旦不同步（换 key 时只改了一处），写出来的档头与密钥不匹配，
     将来解的时候按头选错钥匙 → **这份档永远解不开**。
     （康康 09-27 写第一版时就踩了：`_MP_S_TAG` 是加载时的常量，热加一条 keyring 后
      头还是 MPG1、密钥已经是新的 —— 自测当场抓到，所以改成这一行。） */
  return key.tag + _mpB64(bytes);
}
function __MP_DEC_STR(str) {
  const s = String(str == null ? '' : str);
  const key = _mpKeyOf(s);
  if (!key) return null;                                          // 没前缀 / 不认识的版本 = 当明文（老档 / 老导出）
  const bytes = _mpUnB64(s.slice(key.tag.length));
  if (!bytes) return null;
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(((bytes[i] << 8 | bytes[i + 1]) ^ _mpKeyUnit(i / 2, key)) & 0xFFFF);
  }
  return out;
}
if (typeof globalThis !== 'undefined') {
  globalThis.__MP_ENC_STR = __MP_ENC_STR;      // core.js 的存档口子读它（读不到就当没有 → 明文，向后兼容）
  globalThis.__MP_DEC_STR = __MP_DEC_STR;
  globalThis.__MP_KEYRING = _MP_KEYRING;       // 给尺子/排查用（`save_audit` 会读它验"老 tag 还能解"）
}
