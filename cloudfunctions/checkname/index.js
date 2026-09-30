/* 名字内容安全 · 云函数 `checkname`（V1.0.4 · V 轮 · 父亲大人 09-27）
   ==========================================================================================
   只干一件事：把玩家敲的名字送去**小游戏专用的内容安全接口**，回一句"能不能用"。
   客户端（`js/sc-namecheck.js`）只在拿到 `ok:true` 时才签发落盘凭据 —— 这里是**唯一判据**，
   所以**失败一律当"没过"**（宁可让玩家换个名字，也别放一个没审过的名字进来）。

   用哪条接口（**官方文档核过 · 2026-09-27**）：
     · 云调用方法：`wxa.game.contentSpam.msgSecCheck`
       （即小游戏版「文本内容安全识别 · 游戏专用场景」；HTTPS 版是
        `POST /wxa/game/content_spam/msg_sec_check`）。
       ⚠️ 别退回 `cloud.openapi.security.msgSecCheck` —— 那是**小程序通用场景**那一版；
          游戏专用版增强的正是我们需要的几项：谩骂隐晦低俗、文本变种对抗叠楼、游戏营销引流、
          小语种、灌水无意义文本。两条的出入参一样，所以下面是"专用优先、通用兜底"。
     · 参数：`openid`（必填，云函数里从 `cloud.getWXContext().OPENID` 取）、`version: 2`（必填）、
       `scene`（必填；枚举 **1 资料 / 2 评论 / 3 论坛 / 4 社交日志 / 5 聊天**）、`content`。
       ⚠️ `scene` 取 **1（资料）**：官方这一版列的"应用场景"里就有「用户昵称检测」与「资料类文本检测」。
          派单里写的「scene: 2（当它是游戏场景）」**两处都不准** —— scene 枚举里没有"游戏场景"这个值
          （2 是"评论"），"游戏专用"指的是**接口本身**。详见回单《一、规则复核》。
     · 返回：`result.suggest` = `pass` / `risky`（另有 `review` 待人工复核）、`result.label` 命中标签：
       100 正常 · 10001 营销广告 · 20001 时政 · 20002 色情 · 20003 辱骂 · 20006 违法犯罪 ·
       20012 低俗 · 21000 其他。
     · 只有 `pass` 放行；`risky` / `review` / 认不出的值一律拦（`review`＝待人工复核，没复核就是没过）。
     · 官方口径：同步返回、一般 <500ms；频率 单个 AppID 1 万次/分钟、1000 万次/天。
     · 错误码里两条要认得：`40129` 场景值错误、`750031` 该游戏不支持（要小游戏侧配置）、
       `750030` 版本号错误。

   ⚠️ 云调用要**在云开发控制台给云函数开通 `wxa.game.contentSpam.msgSecCheck` 的云调用权限**
     （跟订阅消息那次同一类操作）。没开通的话这里会抛错 → 一律返回"没过"（fail-closed），
     玩家的表现是"名字审不过"而不是白屏。 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/* ================= V1.0.4（2026-09-27 · 父亲大人："12个字是中文字符，不是英文，我刚打拼音都超了"）===
   上限**按"中文字符"算，不按"字符个数"算**：汉字（含全角标点）＝2 个宽度单位，字母/数字＝1，
   上限 **24 个宽度单位**（＝12 个汉字 或 24 个字母）。
   ⚠️ 这个判据在**三处**必须一模一样：`js/core.js`、`js/sc-namecheck.js`、以及本文件
      （不同运行时，没法 require 同一份，所以三处都带这段注释）。 */
const MAX_W = 24;          // ＝ 12 个汉字 / 24 个字母（前端先卡，这里再卡一道 —— 服务端不信前端）
function charW(ch) {
  const c = ch.codePointAt(0);
  return ((c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF)
    || (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFF60)) ? 2 : 1;
}
function clipByWidth(s, maxW) {
  let w = 0, out = '';
  for (const ch of String(s == null ? '' : s)) {
    const cw = charW(ch);
    if (w + cw > maxW) break;
    out += ch; w += cw;
  }
  return out;
}
const SCENE = 1;           // 1 资料（用户昵称检测是官方点名的应用场景）
const LABELS = {
  100: '正常', 10001: '营销广告', 20001: '时政', 20002: '色情',
  20003: '辱骂', 20006: '违法犯罪', 20012: '低俗', 21000: '其他',
};

function norm(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 专用优先、通用兜底；两条都没有就抛出去（上层 catch 成"接口失败"）。 */
async function msgSecCheck(payload) {
  const openapi = cloud.openapi || {};
  const game = openapi.wxa && openapi.wxa.game && openapi.wxa.game.contentSpam;
  if (game && typeof game.msgSecCheck === 'function') return game.msgSecCheck(payload);
  if (openapi.security && typeof openapi.security.msgSecCheck === 'function') return openapi.security.msgSecCheck(payload);
  const e = new Error('cloud.openapi 上没有 msgSecCheck（wx-server-sdk 太旧？）');
  e.errCode = 'no_api';
  throw e;
}

exports.main = async (event) => {
  const openid = String((cloud.getWXContext() || {}).OPENID || '');
  /* ================= V1.1.20（F1-7）：超长**直接拒**，不许"静默截断再过审" =================
     原来这里是 `clipByWidth(norm(...), MAX_W)` —— 超长会被**截断**再送去机审。
     两个问题：① 与文件头那句"服务端不信前端"打折扣（客户端 local() 先拒，所以正常路走不到；
     但直接调接口能拿到"截断后 pass"）；② 审的对象和玩家真敲的那个名字**不是一个东西**
     （审的是一半）。现在：截断前后不一致就当场拒（`why:'本地'` —— 客户端把它归到"结构不过"那一档，
     演练期也不会被放行，见 js/sc-namecheck.js 的 drillPass 判据）。 */
  const raw = norm(event && event.text);
  const text = clipByWidth(raw, MAX_W);
  /* 空文本 / 没有 openid 都是**我们自己的问题**，不是玩家的问题 —— 但对外一律"没过"。 */
  if (!text) return { ok: false, why: '接口失败', err: 'empty_text' };
  if (text !== raw) return { ok: false, why: '本地', err: 'too_long' };
  if (!openid) return { ok: false, why: '接口失败', err: 'no_openid' };

  let r = null;
  try {
    r = await msgSecCheck({ openid: openid, version: 2, scene: SCENE, content: text });
  } catch (e) {
    return { ok: false, why: '接口失败', err: String((e && (e.errCode || e.errMsg || e.message)) || 'throw').slice(0, 80) };
  }
  const res = (r && r.result) || {};
  const suggest = String(res.suggest || '');
  const label = Number(res.label || 0);
  if (suggest === 'pass') return { ok: true };
  /* 命中/待复核：给回单与排查留个标签（客户端只读 ok / why，玩家看到的是固定那句人话）。 */
  return {
    ok: false,
    why: (suggest === 'risky' || suggest === 'review') ? '敏感' : '接口失败',
    label: label, labelText: LABELS[label] || '', suggest: suggest,
    err: suggest ? '' : 'no_suggest',
  };
};
