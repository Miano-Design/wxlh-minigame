/* 《残域》微信小游戏入口（重做版 · 2026-09-16）
   ------------------------------------------------------------------------------
   网页版是唯一标准：逻辑层 4 份原样同步，界面层一页一页照网页版 js/ui.js 复刻（js/screens.js）。
   加载顺序：环境垫片 → 逻辑层 → canvas 界面框架 → 界面 → 开机。
*/
require('./js/wx-adapter.js');   // window / localStorage 垫片 + 广告封装
require('./js/data.js');
require('./js/core.js');
require('./js/battle.js');
require('./js/dungeon.js');
require('./js/cv.js');           // canvas 界面框架（配色/字号/圆角全部取网页版 :root，并按 clamp 缩放）
require('./js/uiw.js');          // 通用件（卡片/标题行/键值行/宫格/按钮…每块对应网页版一个 CSS 类）
require('./js/sc-start.js');     // 开局三步：欢迎 → 起名 → 选血统
require('./js/sc-guide.js');     // 玩法指南 / 货币图鉴 / 游历奇遇
require('./js/sc-home.js');      // 灯阁（首页）
require('./js/sc-roster.js');   // 执灯者：伙伴总览 + 伙伴详情
require('./js/sc-recruit.js'); // 招募（三池 + 结果页 + 概率公示）
require('./js/sc-last.js');  // 炼化台 / 悬赏 / 任务成就 / 设置 / 挂机分工 / 深井
require('./js/sc-core-pages.js'); // 评级 / 权限 / 建设 / 境界 / 铭刻 / 伴生体 / 转生 / 灯录
require('./js/sc-lines.js');   // 秘术阁 / 法宝 / 坐骑 / 药园 / 斗法台 / 求签
require('./js/sc-grow.js');    // 成长（十三条养成线）+ 兑换大厅（四家店）
require('./js/sc-party.js');   // 队伍（小队 / 编队预设 / 阵型 / 挑人上阵）
require('./js/sc-bag.js');     // 背包（道具 / 材料 / 装备 + 装备详情）
require('./js/sc-protag.js');  // 主角详情（角色页）
require('./js/sc-battle.js');   // 战斗页（副本 / 深井 / 斗法台共用）
require('./js/sc-dungeon.js');  // 残域：世界列表 → 世界详情 → 关卡 → 扫荡

const CV = globalThis.CV, Core = globalThis.Core;
/* 小游戏复刻的网页版版本号（设置页底部那行要跟网页版一字不差） */
globalThis.GAME_VER = '9.6.9';
const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
/* 底栏四个页签 → 对应页面（网页版 #navbar） */
CV.NAV_TABS.forEach(function (t) {
  CV.on('tab:' + t.id, function () { CV.cur = t.id; CV.reset(t.id); });
});
CV.setup(info);
CV.bindTouch();
/* 开机：没有存档 → 欢迎（网页版 main.js 的流程）；有存档 → 首页 */
if (!Core.load()) { Core.newGame(); Core.ensureDaily && Core.ensureDaily(); CV.reset('welcome'); }
else {
  Core.ensureDaily && Core.ensureDaily();
  if (!Core.S.player.name) CV.reset('create');
  else if (!Core.S.player.bloodline) CV.reset('bloodline');
  else CV.reset('home');
}

/* 开发期截图（devtools 里画布是 HTMLCanvasElement → 自己导出 PNG，康康好对比） */
try {
  const plat = (wx.getSystemInfoSync ? (wx.getSystemInfoSync().platform || '') : '');
  if (plat === 'devtools' || !plat || /devtools/i.test(String(info.platform || ''))) {   // getWindowInfo 的 platform 在模拟器里可能不是 devtools，这里放宽
    setTimeout(() => {
      const canvas = globalThis.CE_CANVAS;
      if (!canvas || !canvas.toDataURL) { console.log('[CE-SHOT-FAIL] 没有画布'); return; }
      const b64 = String(canvas.toDataURL('image/png')).split(',')[1] || '';
      const p = (wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : '/tmp') + '/ce-shot.png';
      const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
      if (fs && fs.writeFileSync) { fs.writeFileSync(p, b64, 'base64'); console.log('[CE-SHOT] ' + p); }
      else console.log('[CE-SHOT-FAIL] 不能写文件');
    }, 2500);
  }
} catch (e) {}
