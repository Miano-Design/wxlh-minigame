/* 《残域》入口：启动、主循环 */
(function () {
  const Core = window.Core, UI = window.UI;

  function boot() {
    const hasSave = Core.load();
    if (!hasSave) {
      Core.newGame();
      Core.ensureDaily();
      UI.init();
      UI.showTutorial();
    } else {
      Core.ensureDaily();
      UI.init();
      if (!Core.S.player.name) UI.showCharCreate();
      // 老档 / 中途退出的档：还没选血统的，进游戏先补这一步（境界线依赖血统）
      else if (!Core.S.player.bloodline) UI.showBloodlinePick();
      // 离线收益结算
      const gains = Core.settleOffline();
      // 收益已经在 settleOffline 里入账了，这里只管"要不要弹结算窗"（离线太短就不打扰）
      if (gains && (gains.cheat || gains.seconds >= 300)) UI.showOfflineGains(gains);
    }
    queueLoginReward();
    startLoop();
  }

  /* 每日登录奖励：新档和老档都要发（以前只有老档分支里调，新档第一天的登录奖励要等到第二次开游戏才出现）。
     但新档开局压着"欢迎 / 建角色 / 选血统"三层弹窗，直接弹会把它们盖住——
     所以等玩家把弹窗收干净再发，奖励本身一分不少（没发出去之前不写 lastClaim）。 */
  function queueLoginReward() {
    const busy = () => {
      const root = document.getElementById('modal-root');
      return !!(root && root.children && root.children.length);
    };
    const attempt = (left) => {
      if (busy() && left > 0) { setTimeout(() => attempt(left - 1), 1000); return; }
      const lr = Core.loginReward();
      if (lr) UI.showLoginReward(lr);
      UI.refresh();
    };
    setTimeout(() => attempt(30), 600);
  }

  let lastTick = Date.now();
  let saveCounter = 0;
  function startLoop() {
    setInterval(() => {
      const now = Date.now();
      const dt = Math.min(10, (now - lastTick) / 1000); // 单帧最多计10秒，防卡顿跳变
      lastTick = now;
      Core.onlineTick(dt);
      saveCounter += dt;
      if (saveCounter >= 15) {
        saveCounter = 0;
        Core.save();
        UI.refresh();
      }
      // 主界面挂机区实时刷新（不重渲染整页）
      UI.tickIdle();
    }, 1000);
    // 页面隐藏时立即保存
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Core.save(); return; }
      // 回到前台：把切后台期间被浏览器节流掉的时间补进挂机池（按离线规则封顶）
      const now = Date.now();
      const gap = (now - lastTick) / 1000;
      lastTick = now;
      if (gap > 10) {
        const cap = Core.offlineCapHours() * 3600;
        Core.onlineTick(Math.min(gap, cap) * Core.offlineEfficiency());
      }
    });
    window.addEventListener('beforeunload', () => Core.save());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
