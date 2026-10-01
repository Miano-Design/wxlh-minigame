/* 自由命名 · 内容安全闸（V1.0.4 · V 轮 · 父亲大人 09-27）
   ==========================================================================================
   父亲大人原话：「自由命名可以接入 api 不，可以的话我感觉还是可以开的，之前就是因为命名没有限制
   被警告了才关的，现在开了云开发能接吗」。当年那次：黑名单清洗拦不住政治敏感词 →
   平台判【UGC 模块存在政治敏感内容】、限 48 小时整改，处置是**整段撤掉自由输入**。
   要开回来，就得配**机审**（这也是平台对 UGC 的硬要求）。

   这一份是**唯一那道闸**，三个入口（起名 sc-start / 改名 sc-protag / 新建主角 sc-last）都走它：
     ① **本地筛**（成本 0）：空 / 超 12 字 / 危险字符 / 纯数字 / 纯符号 —— 一眼能看出的当场拒；
     ② **名单内直接放行**：白名单本来就是"可自证"的，不花那一次请求（断网也能起名）；
     ③ **名单外 → 云函数 `checkname` 机审**（微信小游戏专用内容安全接口，同步 <500ms）→
        **过了才签发那张一次性凭据**（`Core.grantNameTicket`），落盘才算数。

   ⚠️ 铁律：**接口失败 / 超时 / 没有云能力 → 一律当"没过"**（宁可让玩家换个名字，
   也别放一个没审过的名字进来）。这时**名单那条路照常** —— 那是唯一的降级路径。
   ⚠️ 本地这道筛子**故意不放敏感词库**（黑名单永远列不全，那正是当年翻车的原因；
   而且词库落进仓库本身也是风险）：本地只判"结构"，词面判据全交给官方机审。
   没有云能力时自由输入整段不可用 —— 所以"本地没词库"不会留出漏网的窗口。

   命名为什么叫 `sc-`（它其实不是一页）：本工程所有体检脚本都按 `js/sc-*.js` 通配加载界面层
   （见 `scripts/overlay_audit.js` 的 readdirSync 那一段）；叫 `name-check.js` 的话，
   那些假环境里这个模块**整个不会被加载** → 界面一读 `G.NameCheck` 就抛错。
   跟着这条既有约定走，别改名。 */
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof globalThis !== 'undefined') ? globalThis : this;
  const WX = (typeof wx !== 'undefined') ? wx : null;

  const FN = 'checkname';        // 云函数名（cloudfunctions/checkname）
  /* V1.1.21（2026-09-28 · 父亲大人：「现在起名还是起不了，老是提示需要联网」）：
     原来这里是 **1000ms** —— 官方文档建议 1s 是"接口**热**的时候"的往返（一般 <500ms）。
     但**云函数有冷启动**（第一次调用常见 1~3 秒），于是"今天第一次起名"几乎必超时 ⇒
     失败话术又只说「需要联网」，玩家看着明明有网、就以为功能坏了。
     现在两道改：① 超时放宽到 **4 秒**（界面会先弹「正在审这个名字…」，等待是有解释的）；
     ② 超时/接口失败的话术**说清"不影响玩、点 🎲 就能开始"**，不再一律喊"需要联网"。 */
  /* ================= F1 · 0930L（父亲大人 2026-09-30：改了几版一直没改好）=================
     4 秒还是会把**冷启动**误伤掉：云函数是 **Nodejs16 冷启动**，官方"同步 <500ms"说的是**热**的时候
     （云函数详情实测 timeout=3s，冷启动那一下把 3 秒的预算全吃掉是常态）。
     现在放宽到 **8 秒**，并且等待期间界面一直有解释（起名卡那颗会说「正在审这个名字…」、
     改名的弹窗原样留着），不会让玩家以为"点了没反应"。
     ⚠️ 真因不是"超时不够"——**后端那条云调用权限没生效**（见下面的 attach 与回单）才是
        "任何名字都过不了"的根；这一条只是把"冷启动偶发超时"这类抖动也一起兜住。 */
  const TIMEOUT_MS = 8000;
  /* ================= V1.0.4（2026-09-27 · 父亲大人："12个字是中文字符，不是英文，我刚打拼音都超了"）===
     上限**按"中文字符"算，不按"字符个数"算**：汉字（含全角标点）＝2 个宽度单位，字母/数字＝1，
     上限 **24 个宽度单位**（＝12 个汉字 或 24 个字母）。
     ⚠️ 这个判据在**三处**必须一模一样：`js/core.js` 的 `nameWidth/clipName`、本文件、以及
        云函数 `cloudfunctions/checkname`（不同运行时，没法 require 同一份，所以三处都带这段注释）。 */
  const MAX_W = 24;              // ＝ 12 个汉字 / 24 个字母
  function charW(ch) {
    const c = ch.codePointAt(0);
    return ((c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
      || (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFF60)) ? 2 : 1;
  }
  function nameWidth(s) {
    let w = 0;
    for (const ch of String(s == null ? '' : s)) w += charW(ch);
    return w;
  }
  const MAX_CHARS = MAX_W;       // 兼容旧引用（含义已变成"宽度单位"）

  /* ================= 两句话一定要分开（康康 09-27 复核 · 父亲大人实测：「起啥名都过不了审」）=================
     当时的现象不是"微信严格"，是**我们这条链路还没通**（云函数没部署 / 云调用权限没开）——
     而 fail-closed 的设计是"审不了就不放行"，于是**任何名字都过不了**。
     话术上必须把两种情形分开，否则玩家（和父亲大人）会以为"微信什么名字都不让起"：
       · **我们这头不通**（云函数没部署 / 云调用没开 / 断网 / 超时 / 返回认不出）→ 说"暂时用不了"，
         并且**指回名单那条路**；
       · **真的命中敏感标签**→ 才是"这个名字过不了"（这时才该让他换名字）。
     ⚠️ 判据一个字没放宽：两类都**不落盘**，只是**说的话不一样**。 */
  /* ⚠️ 2026-09-27 深夜（父亲大人实测）：「**提示改名要联网，哪来的这个要求**」——
     他说得对：**"联网"不是我们发明的规矩，是"内容安全审核"要联网**。
     所以话术改成把**原因**说清（过审才要联网），而不是甩一句"这个要联网"：
       · 自由输入（自己敲的字）＝ UGC ⇒ 平台要求先过机审（云端）⇒ 才需要联网；
       · 名册里换（🎲）＝ 白名单、可自证 ⇒ **永远离线可用**，一个字都不改。
     改名**不是不能改**，是"自己敲的那个门"要过审。 */
  /* ⚠️ 分工（2026-09-28 康康 · 09-30 重写）：`MSG_DOWN` 是"**云函数报错 / 超时**"那一档；
     `MSG_NOCLOUD` 是"**这台设备没有云能力**"那一档 —— 两档必须分开说（都不许甩锅给网络）。 */
  /* ================= F1 · 0930L（父亲大人 2026-09-30：「只有名字不符合规定之类的才有可能命名失败，
     哪来的没有网络，只能是后台代码出了问题」）=================================================
     **话术彻底重写（硬要求）**，三档一一对应**真原因**，再不许出现"需要联网 / 检查网络 / 连不上"这种
     "把平台侧故障糊成你的网不好"的说法：
       · 名字被机审**判不合规**（`why==='敏感'`）→ 只有这一档说名字不行（`MSG_RISKY`）；
       · `wx.cloud` 不可用（这台设备根本没有云开发能力）→ `MSG_NOCLOUD`：**云服务未连上**；
       · 云函数返回错误 / 超时 / 认不出（**后端/平台侧出问题**）→ `MSG_DOWN`：**审核服务暂时异常**。
     ⚠️ 措辞禁区（尺子 `blamesName` 卡着）：**链路问题那三档里不许出现「没过审 / 过不了 / 不合规」**
        —— 那句会把"我们这头不通"说成"你的名字不行"（09-27 那次就是这么把父亲大人误导了一晚上）。
     ⚠️ 判据一个字没放宽：三类都**不落盘**，只是**说的话不一样**。 */
  const MSG_DOWN = '审核服务暂时异常：再点一次「确定」重试，或点 🎲 从名册里挑一个名字（离线也能用）';
  /* `wx.cloud` 不可用（这台设备没有云开发能力）专用那一句 —— 与"云函数报错"分开说。 */
  const MSG_NOCLOUD = '云服务未连上：点 🎲 从名册里挑一个名字（离线也能用）';
  const MSG_DOWN_RENAME = '云服务未连上：点右边那颗 🎲 从名册换一个名字（离线也能用）';
  const MSG_DOWN_NEW = '云服务未连上：直接选名册里的名字建一位';
  /* 只有这一句是"你的名字不行"——它**只**在机审真判了不合规时才出现。 */
  const MSG_RISKY = '这个名字不合规，换一个';
  /* ================= F8 ⓪-c（父亲大人 09-28：「**哪有设备没键盘，手机也有、电脑也有**」）===
     那句"**这台设备不支持输入**，先从名单里挑一个"是**错的断言**：真机上键盘一定有，
     它只可能来自"这个版本没有键盘接口"（`wx.showKeyboard` 整个不存在）那一支。
     两条改：
       ① 措辞不再断言设备 —— 说"这个版本暂时用不了手动输入"，并指回名册那条路；
       ② 触发条件再收窄一遍：`MSG_NOKB` **只留给"接口不存在"**；注册回调抛错 / `showKeyboard`
          回调 fail 这些**真机也会偶发**的岔路另有说法（`MSG_KBFAIL`），别再把锅甩给设备。
     另外 `available()` 从"只看云能力"改成"云能力 ＋ 键盘接口"（见下面的 `canType`）——
     走不了手动输入就**一声不响走名册那条路**，玩家根本看不到这句提示。 */
  const MSG_NOKB = '这个版本暂时用不了手动输入，先从名册里挑一个';
  const MSG_KBFAIL = '没能打开输入框：再点一次试试，或从名册里挑一个';

  function core() { return G.Core || null; }
  /* ================= V1.0.4（09-27 深夜 · 父亲大人："小字还是改不了名啊…哪来的这个要求"）===
     **开发期演练通道（只在开发者工具生效）**：模拟器里拿不到 openid、云调用权限也常常没开，
     而我们是 fail-closed ⇒ 自由输入在模拟器里**必然用不了**，本地根本没法把这条链试通。
     所以：**platform === 'devtools'** 时，改走"本地筛过了就放行"，
     并在 console 里喊一声（`[NAMECHECK] 演练期放行`），让任何看到日志的人都知道**这一下没过机审**。
     ⚠️ 真机（platform 是 ios / android / …）**一个字都不许走这条** —— 尺子钉死这一条
        （`name_audit`：把 platform 换成 ios → 必须回到机审，且无云时拒绝）。
     ⚠️ 这不是"放宽判据"：判据（过审才落盘）在真机上原样成立；这只是**本地能试**的通道。 */
  const DRILL = (function () {
    try {
      const info = (WX && WX.getSystemInfoSync) ? (WX.getSystemInfoSync() || {}) : {};
      return String(info.platform || '') === 'devtools';
    } catch (e) { return false; }
  })();
  /* ================= 云能力 ＋ **一次性 init**（F1 · 0930L）=================
     原来这里只判"`wx.cloud.callFunction` 在不在"，**从不 `init`** —— 全靠 `js/sc-cloud.js`
     那条链"顺手替我们 init 过"。可是那条链是**懒**的（第一次用户交互之后才跑），
     加档/换档/首屏那些路径上完全可能"我们还一次网络都没发"。
     小游戏里 `wx.cloud.init({env})` 没跑过就 `callFunction` ⇒ 直接报错 ⇒ 我们 fail-closed
     ⇒ **任何名字都过不了**（父亲大人报的"起啥名都过不了"就有这一条在里面）。
     现在：本模块自己 init 一次（与 `js/sc-cloud.js` **同一个环境 ID**，不许写第二份别的值），
     init 抛错就当"没有云能力"（一句话说清：云服务未连上）。 */
  /* ⚠️ 环境 ID **不在这里写第二份** —— 唯一真源是 `js/sc-cloud.js` 的 `ENV_ID`
     （`scripts/cloud_sync_audit.js` ① 段钉着"客户端只写一处"，换环境只改那一个地方）。 */
  function envId() { return (G.CloudSync && G.CloudSync.ENV_ID) || ''; }
  let cloudInited = false;
  function cloud() {
    if (!WX || !WX.cloud || typeof WX.cloud.callFunction !== 'function') return null;
    if (!cloudInited) {
      const env = envId();
      if (!env) return null;               // 连真源都取不到 ⇒ 当"云服务未连上"，绝不猜一个环境
      try { if (typeof WX.cloud.init === 'function') WX.cloud.init({ env: env, traceUser: true }); }
      catch (e) { return null; }        // init 都抛错 = 这台设备用不了云（对外说"云服务未连上"）
      cloudInited = true;
    }
    return WX.cloud;
  }
  /* 键盘接口在不在 —— F8 ⓪-c：`wx.showKeyboard` 整个不存在才是"手动输入用不了"的唯一真因。 */
  function canType() {
    return !!(WX && typeof WX.showKeyboard === 'function' && typeof WX.onKeyboardConfirm === 'function');
  }
  /* 「手动输入这条路能不能走」＝ 云能力（机审）＋ 键盘接口。以前只判云能力：
     没有键盘接口的运行时照样把玩家送进输入流程，再拿一句"这台设备不支持输入"打发他。 */
  function available() { return !!cloud() && canType(); }

  /* ---------- ① 本地筛 ---------- */
  function local(raw) {
    const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!s) return { ok: false, msg: '名字不能是空的' };
    if (nameWidth(s) > MAX_W) return { ok: false, msg: '名字最多 12 个汉字（英文按宽度算，最多 24 个字母）' };
    if (/[<>&"'`\\]/.test(s)) return { ok: false, msg: '名字里不能带 < > & " \' \\ 这些符号' };
    if (/^[0-9０-９]+$/.test(s)) return { ok: false, msg: '名字不能全是数字' };
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(s)) return { ok: false, msg: '名字里要有汉字或字母' };
    return { ok: true, name: s };
  }

  /* ---------- ②③ 名单 → 机审 ---------- */
  /* cb({ ok, name?, why?, msg })；`why` 只在不过时说：本地 / 无云 / 敏感 / 接口失败 / 超时。 */
  function submit(text, cb) {
    const done = function (r) { try { cb(r); } catch (e) {} };
    const C = core();
    const l = local(text);
    if (!l.ok) { done({ ok: false, why: '本地', msg: l.msg }); return; }
    const s = l.name;
    if (C && C.isListName && C.isListName(s)) { done({ ok: true, name: s }); return; }
    const c = cloud();
    /* 演练期（只在开发者工具）：**先照常调机审** —— 能调通就以机审为准（这样在模拟器里也能
       真的验"敏感词会不会被拦"）；只有"调不通"（模拟器常见：没有 openid / 云调用没配好 / 断网）
       才放行，并在 console 里喊一声。真机永远走上面那条机审路（DRILL 为 false）。 */
    /* 演练期（只在开发者工具）的兜底：**先照常调机审**（能调通就以机审为准 —— 这样在模拟器里
       也能真的验"敏感词会不会被拦"）；只有"调不通"（模拟器常见：没有 openid / 云调用没配好 /
       断网）才放行，并在 console 里喊一声。真机 DRILL 为 false，永远走机审那条路。 */
    const drillPass = function (why) {
      try { if (console && console.warn) console.warn('[NAMECHECK] 演练期放行（只在开发者工具 / ' + why + '）：' + s); } catch (e) {}
      done({ ok: true, name: s });
    };
    if (!c) {
      if (DRILL) { drillPass('没有云能力'); return; }
      done({ ok: false, why: '无云', msg: MSG_NOCLOUD }); return;
    }

    let settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      done({ ok: false, why: '超时', msg: MSG_DOWN });
    }, TIMEOUT_MS);
    const finish = function (r) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      /* 演练期（只在开发者工具）兜底：机审**调不通**（超时 / 接口失败 / 没有 openid）才放行；
         **判成敏感照样拒** —— 不能因为"本地试试"就把违规的字放进来。 */
      if (DRILL && r && r.ok === false && r.why !== '敏感' && r.why !== '本地') {
        drillPass(r.why || '接口失败');
        return;
      }
      done(r);
    };
    let req = null;
    try { req = c.callFunction({ name: FN, data: { text: s } }); }
    catch (e) { finish({ ok: false, why: '接口失败', msg: MSG_DOWN }); return; }
    Promise.resolve(req).then(function (res) {
      const r = (res && res.result) || null;
      if (r && r.ok) {
        if (C && C.grantNameTicket) C.grantNameTicket(s);      // 过审 → 签发一次性凭据（成败由 core 判）
        finish({ ok: true, name: s });
        return;
      }
      const why = (r && r.why) || '接口失败';
      finish({ ok: false, why: why, msg: why === '敏感' ? MSG_RISKY : MSG_DOWN });
    }).catch(function () {
      finish({ ok: false, why: '接口失败', msg: MSG_DOWN });
    });
  }

  /* ================= 系统键盘：**全局只允许一个会话**（F1 · 0930L）=================
     小游戏没有 `<input>`，canvas 里只能借 `wx.showKeyboard`。

     ⚠️ **这一处就是「输入框弹出来两次、打了字没用」的收口点。**
     原来的写法是"每次 `ask()` 都先 `offKeyboardConfirm()` 再 `onKeyboardConfirm()` 再 `showKeyboard()`"——
     只要**同一个名字框在同一下里被派发两次**（PC 微信上触摸与鼠标两个通道都会派事件，见
     `js/cv.js` 的 `CV.bindTouch` 里那段 `claimGesture` 去重），第二次 `ask` 就会：
       ① 把第一次刚注册好的确认回调 `off` 掉；② 再 `showKeyboard` 一次（玩家看到"弹了两次"）；
       ③ 而第二次那次 `showKeyboard` 在真机上常被判 `fail`（键盘正被第一次占着）→ 第二次的会话
          当场 `settled` 收口；④ 玩家敲完按"完成"时，`onKeyboardConfirm` 打给的是**已经被注销的
          第一次回调**、而第二次那句已经被 `settled` 挡住 ⇒ **打得再对也回不来**（"打了字没用"）。
     现在两道一起上，任一道生效这一组症状都不会再出现：
       · `js/cv.js` 那天：同一次物理点击**只派发一次**（触摸 + 鼠标两个通道去重）；
       · 这一处：**会话是单例** —— 已经有一个输入口开着时，第二次 `ask` **不重开键盘**，
         只把回调换成这一次的（谁最后要这个名字，谁收得到）。
     ⚠️ 键盘事件本身是**全局**的：进新会话前照旧先注销上一个（`offKeyboardConfirm` /
        `offKeyboardComplete`），否则会和别的输入口抢那一次 confirm。 */
  let kbSession = null;              // { cb, done } —— 当前唯一那个输入会话
  function ask(draft, cb) {
    if (kbSession) {                 // ← 已经在输入了：**不重开键盘**，换回调就走
      kbSession.cb = cb;
      return;
    }
    let settled = false;
    const done = function (text, err) {
      if (settled) return;
      settled = true;
      kbSession = null;              // 会话结束：下一个 ask 才能重新开键盘
      /* V1.1.21（2026-09-28）：输入态收口 —— 键盘起来时把 `CV.kbActive` 立起来，
         `js/cv.js` 的 onDown 靠它实现"**点空白＝收起键盘**"（父亲大人：「输入框一直收不起来」）。 */
      try { if (G.CV) G.CV.kbActive = false; } catch (e) {}
      try { const fn = cb; if (fn) fn(text, err); } catch (e) {}
    };
    if (!WX || typeof WX.showKeyboard !== 'function' || typeof WX.onKeyboardConfirm !== 'function') {
      done(null, MSG_NOKB); return;          // ← 唯一该说"版本用不了手动输入"的地方
    }
    kbSession = { cb: cb, done: done };      // ← 会话先立起来，下面任何一条岔路都走 done 收口
    try { if (WX.offKeyboardConfirm) WX.offKeyboardConfirm(); } catch (e) {}
    try { if (WX.offKeyboardComplete) WX.offKeyboardComplete(); } catch (e) {}
    try {
      WX.onKeyboardConfirm(function (res) {
        const v = String((res && (res.value !== undefined ? res.value : res.text)) || '');
        done(v, null);                       // ← 唯一一处"取值"的地方
      });
    } catch (e) { done(null, MSG_KBFAIL); return; }   // 注册回调就抛：不是"没键盘"，是这一下没起来
    /* V1.1.21：**键盘被"收起"也要收口**。原来只注册了 onKeyboardConfirm（键盘上那颗"完成"），
       而微信自己在玩家点键盘外面的画布 / 按系统返回时**只发 onKeyboardComplete** ——
       没人听 ⇒ 那一次输入永远悬着，界面既不落草稿、也再不响应（"输入框一直收不起来"的根因之一）。
       ⚠️ 0930L 补一条：complete **不抢确认** —— 它只在"还没确认过"时收口；
          而且**空值不当成一次确认**（真机上偶发"键盘收起先派 complete、res.value 还没填"，
           原来那句会把空串当玩家敲的名字交上去 ⇒ 界面回一句"名字不能是空的"，
           玩家看到的就是"打了字没用"）。空值只做收口：把草稿原样留着，让他再点一次。 */
    try {
      if (WX.onKeyboardComplete) {
        WX.onKeyboardComplete(function (res) {
          const v = String((res && (res.value !== undefined ? res.value : res.text)) || '');
          if (!v) { done(null, null); return; }   // 收起、不落：草稿留着（不拿空串冒充名字）
          done(v, null);
        });
      }
    } catch (e) {}
    try { if (G.CV) G.CV.kbActive = true; } catch (e) {}
    try {
      WX.showKeyboard({
        type: 'text', defaultValue: String(draft || ''), maxLength: MAX_W,
        multiple: false, confirmType: 'done',
        success: function () {},
        /* ⚠️ 失败**不许**立刻把会话打掉（原来这里直接 `done(null, MSG_KBFAIL)`）：
           真机上"键盘正被另一个口占着"是偶发，而**这一下失败时键盘往往其实已经开着** ——
           立刻收口等于把这一次输入判了死刑。给 600ms 宽限：
             · 宽限期内玩家照样敲 → confirm / complete 一到就正常收口（他自己赢了）；
             · 宽限期满还是没人来 ⇒ 才是真失败，给一句人话（不赖设备），会话干净收口。 */
        fail: function () {
          setTimeout(function () {
            if (!kbSession || kbSession.done !== done) return;
            done(null, MSG_KBFAIL);
          }, 600);
        },
      });
    } catch (e) { done(null, MSG_KBFAIL); }
  }

  G.NameCheck = {
    available: available, local: local, submit: submit, ask: ask,
    /* 话术只在这一份里定义 —— 三处入口都读这几个常量（做坏试验才有唯一锚点：
       把这些话改回"你的名字没过审"，尺子里那一组断言必须当场红）。 */
    MSG_DOWN: MSG_DOWN, MSG_NOCLOUD: MSG_NOCLOUD,
    MSG_DOWN_RENAME: MSG_DOWN_RENAME, MSG_DOWN_NEW: MSG_DOWN_NEW,
    MSG_RISKY: MSG_RISKY, MSG_NOKB: MSG_NOKB,
    MSG_KBFAIL: MSG_KBFAIL, canType: canType,
    FN: FN, TIMEOUT_MS: TIMEOUT_MS, MAX_CHARS: MAX_CHARS, MAX_W: MAX_W,
    nameWidth: nameWidth,          // 尺子与界面共用同一口径
  };
})();
