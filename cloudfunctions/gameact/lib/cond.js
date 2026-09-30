/* 活动条件判据（V1.0.4 · W 轮 · 游戏圈活跃任务）
   ==============================================================================
   微信来问"这个玩家达成条件没"，我们**只回三样**：
     `{ ErrCode: 0, IsConditionSatisfied: true/false, TemplateParamMap: { 参数名: 数字 } }`
   —— 绝不回存档内容（派单红线），也绝不回任何玩家自定义文本。

   判据从 `saves` 那条记录里**我们自己写的计数块**（字段 `act`）来，见 `js/sc-cloud.js` 的
   `data.act = ...` 与 `js/core.js` 的 `Core.actSnapshot()`。
   ⚠️ 为什么不去解 `payload`（那份密文）：解存档的算法在 `js/mem-guard.js`，**运行只有一份**，
      抄到云函数里就是"第二份真相"（派单点名不许）。所以客户端在推档时**另带一小块数字**，
      服务端只读数字 —— 既不需要解密，也不可能把存档内容漏给平台。

   ConditionId 命名（**后台就照这个配**，康康抄进 MP）：
     `login_days_5` · `play_minutes_10` · `dungeon_clears_10`
     —— `名字_阈值`：阈值写进 ID，**平台模板里的数字和这里的阈值必须一致**，
        否则玩家会看到"进度 7/5 却是未达成"这种自相矛盾。
     也认不带阈值的老 ID（`login_days`），那时用下面的 `defaultTarget`。

   TemplateParamMap 的**键名**＝平台模板里的 `${xxx}` 占位符名，默认：
     `login_days → day` · `play_minutes → duration` · `dungeon_clears → clear`
     （文档示例就是 `{"day": x, "duration": z}`）。要在后台换个名字，
     设环境变量 `ACT_PARAM_MAP='{"login_days":"days"}'` 即可，不用改代码。

   ⚠️ 认不出的 ConditionId / 读不到档 / 读档出错 —— 一律回 `IsConditionSatisfied: false`
      （ErrCode 仍是 0）：玩家最多看到"进度 0 / N"，活动不会因为一次配置错就整体报错。
      服务端日志里会打 `unknown_condition`，康康能在云开发控制台看到。 */

const COND_DAY_CAP = 8 * 3600;        // 客户端口径：一天最多记 8 小时在线（分钟数由它派生）
const MAX_LOGIN_DAYS = 10000;         // 累计登录天数的天花板（防脏数据）
const MAX_CLEARS = 1e7;               // 累计通关次数的天花板（防脏数据）

/** 支持的三个条件（键＝ConditionId 里的"名字"部分） */
const TABLE = {
  login_days: {
    param: 'day', target: 5,
    pick: (a) => a.loginDays,
  },
  play_minutes: {
    param: 'duration', target: 10,
    pick: (a) => a.playMinutes,
  },
  dungeon_clears: {
    param: 'clear', target: 10,
    pick: (a) => a.clears,
  },
};

/** 环境变量覆盖占位符名（可选）：ACT_PARAM_MAP='{"login_days":"days"}' */
function paramOverride(env) {
  const raw = (env || {}).ACT_PARAM_MAP;
  if (!raw) return {};
  try {
    const o = JSON.parse(String(raw));
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

/** `login_days_5` → `{ name:'login_days', target:5 }`；`login_days` → target 为 0（用默认档） */
function parseConditionId(rawId) {
  const id = String(rawId == null ? '' : rawId).trim().toLowerCase();
  const m = /^([a-z][a-z0-9_]*?)(?:_(\d{1,7}))?$/.exec(id);
  if (!m) return { id: id, name: '', target: 0 };
  return { id: id, name: m[1], target: m[2] ? Number(m[2]) : 0 };
}

function intOf(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * 把客户端那块数字**收成可信范围**（服务端不信前端）。
 * 客户端自己已经按"心跳累加 ＋ 每天封顶 8 小时"记过一遍，这里再做三道夹子：
 *   · 负数 / NaN / 非数 → 0；
 *   · 在线分钟 ≤ 登录天数 × 1440（"一天最多 24 小时"的硬上限，防改档把时长刷上天）；
 *   · 三个数各有一个绝对值天花板。
 */
function normalizeAct(raw) {
  const o = (raw && typeof raw === 'object') ? raw : {};
  let loginDays = intOf(o.loginDays);
  if (loginDays > MAX_LOGIN_DAYS) loginDays = MAX_LOGIN_DAYS;
  let playMinutes = intOf(o.playMinutes);
  /* ⚠️ 这条夹子的口径必须**和客户端那把尺子一模一样**：客户端 `actTick()` 一天最多记 8 小时
     （`ACT_DAY_CAP_SEC = 8 * 3600`），所以诚实玩家的累计上限就是"登录天数 × 480 分钟"。
     比"一天 24 小时"那种松夹子更紧、又不会冤枉任何正常玩法（客户端先卡过一次，这里再卡一次）。 */
  const ceiling = loginDays > 0 ? loginDays * Math.floor(COND_DAY_CAP / 60) : 0;
  if (playMinutes > ceiling) playMinutes = ceiling;
  let clears = intOf(o.clears);
  if (clears > MAX_CLEARS) clears = MAX_CLEARS;
  return { loginDays, playMinutes, clears };
}

/**
 * 算一个条件。
 * @param {string} conditionId 平台传来的 ConditionId
 * @param {object|null} act   客户端推上来的计数块（读不到档 = null）
 * @param {object} [env]      环境变量（只为 ACT_PARAM_MAP）
 * @returns {{ErrCode:number, IsConditionSatisfied:boolean, TemplateParamMap:object, unknown?:boolean, missing?:boolean}}
 */
function evaluate(conditionId, act, env) {
  const parsed = parseConditionId(conditionId);
  const def = TABLE[parsed.name];
  const known = !!def;
  /* 认不出的 ID：**只回"没达成"，连进度都不编** —— 不认识的条件下我们不知道
     模板里那几个占位符叫什么，回一个数字反而可能被渲染成驴唇不对马嘴的进度。
     服务端日志里有 `unknown_condition`，配错 ID 时能一眼看见（否则会永远 0/N 且毫无线索）。 */
  if (!known) {
    return { ErrCode: 0, IsConditionSatisfied: false, unknown: true };
  }
  const use = def || TABLE.login_days;
  const counters = normalizeAct(act);
  const value = use.pick(counters);
  const target = parsed.target > 0 ? parsed.target : use.target;
  const param = paramOverride(env)[parsed.name] || use.param;
  const map = {};
  map[param] = value;
  const out = {
    ErrCode: 0,
    IsConditionSatisfied: !!(act && value >= target),
    TemplateParamMap: map,
  };
  if (!act) out.missing = true;
  return out;
}

/** 客户端/尺子共用的三个计数名（写进回单与后台配置清单的就是这几个） */
const IDS = {
  login_days: 'login_days_5',
  play_minutes: 'play_minutes_10',
  dungeon_clears: 'dungeon_clears_10',
};

module.exports = { TABLE, IDS, parseConditionId, normalizeAct, evaluate, COND_DAY_CAP };
