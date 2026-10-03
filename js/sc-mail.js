/* 信匣（2026-10-02 · 父亲大人提案；同日按他的口述改版）
   ==============================================================================
   父亲大人：「在主页设置那一排加多一个信匣，顺序 成就 / 信匣 / 设置；
   以后礼包码发的东西都进信匣，游戏公告和更新补偿也发到信匣里 —— 有个礼品发放和更新通知的收口」。
   随后定的四条（**判据全在 `Core` 里，这一层只管画**）：
     · 名字叫「信匣」；
     · 信永不过期，处理完 30 天后自动清除；
     · 红点「有的领就亮，没得领就不亮」；
     · **列表 + 点进去看详情**：「邮箱点开就类似这样的展示就行了，然后点进去对应的信件再显示详情，
       你现在这样的表现太浪费空间了」——
       所以这一页是**一行一封信**（图标 · 标题 · 状态 · 日期），正文与附件**收在详情弹窗里**。
       第一版把每封信的正文全铺在列表上（一封一张大卡），一屏放不下两封 —— 那是浪费，已推翻。

   三种来源在这里合流（存储位置不同、界面上长得一样）：
     ① 随版本走的信 `D.MAIL`（公告 / 更新补偿）；② 平台礼包发货单（云函数 `giftbox` 拉回来的）。
   ⚠️ 进这一页时**顺手拉一次云端**，拉取失败**一个字都不弹**（静默降级，与云同步同一口径）——
     玩家看到的是"信匣里现在这些"，而不是一个"网络错误"。 */
(function () {
  const G = window;
  const U = G.U, CV = window.CV, Core = window.Core;

  /** 行首那枚图标：带奖未领 = 礼盒；处理过 = 拆开的信封；没动过 = 封口的信封。 */
  function icoOf(m) {
    if (m.hasReward && !m.claimed) return '🎁';
    if (m.claimed || m.read) return '📭';
    return '📩';
  }
  /** 行尾日期（本地信没有 `at` 就不显示 —— 宁可少一格，也不编一个日期出来）。 */
  function dateOf(ts) {
    const n = Number(ts) || 0;
    if (!n) return '';
    const d = new Date(n), p2 = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  /** 标题后面那枚小字：**如实说这封现在什么状态**。 */
  function stateOf(m) {
    if (m.hasReward) return m.claimed ? '已领取' : '可领取';
    return m.read ? '已读' : '未读';
  }

  let pulling = false;
  function pullQuietly() {
    const CS = G.CloudSync;
    if (pulling || !CS || !CS.pullGiftbox) return;
    pulling = true;
    CS.pullGiftbox().then(function (r) {
      pulling = false;
      if (r && r.ok && r.pending && r.pending.length && Core.mailMergeCloud(r.pending)) CV.render();
    }).catch(function () { pulling = false; });
  }

  function pick(id) { return Core.mailList().filter(function (x) { return x.id === id; })[0]; }
  function ackCloud(ids) {
    const CS = G.CloudSync;
    if (!CS || !CS.ackGiftbox) return;
    const cloud = (Core.S.mail && Core.S.mail.cloud) || [];
    const only = ids.filter(function (id) { return cloud.some(function (c) { return c && c.od === id; }); });
    if (only.length) { try { CS.ackGiftbox(only); } catch (e) {} }
  }
  /** 详情弹窗那颗按钮的动作：有奖的领、没奖的读。动作跑完自己重画。 */
  function act(id) {
    const m = pick(id);
    if (!m) { CV.render(); return; }
    if (m.hasReward && !m.claimed) {
      const r = Core.mailClaim(id);
      if (!r.ok) { CV.toast(r.why === 'used' ? '这封已经领过了' : '领不了，再点一次试试'); CV.render(); return; }
      ackCloud([id]);                    // 平台礼包：领了要回报服务端，微信重试时才不会重复发
      CV.toast('已领取：' + Core.rewardTextOf(r.goods) + ((r.stashed && r.stashed.length) ? '（背包满了，先收进待领箱）' : ''), 3000);
    } else if (!m.hasReward && !m.read) {
      if (!Core.mailRead(id).ok) CV.toast('读不了，再点一次试试');
    }
    CV.render();
  }

  CV.register('mail', function () {
    U.begin();
    U.pageHead('信匣', { backId: 'page_back' });
    pullQuietly();                                        // 进页面顺手拉一次（静默）
    const list = Core.mailList();
    if (!list.length) {
      U.card(function () { U.hint('信匣是空的。官方发了东西、有公告或更新补偿，都会送到这里。', CV.SP[1]); });
      return;
    }
    /* 一行一封信：图标 · 标题 · 状态 · 日期。**整行可点**，点开才是详情。
       热区用 `CV.hit` 登记在整行上 —— 与成就页那颗「还没解锁」的行同一个做法。 */
    U.card(function () {
      list.forEach(function (m) {
        const top = U.y;
        const h = U.listRow({ ico: icoOf(m), t1: m.title, t1sub: stateOf(m), rightText: dateOf(m.at) });
        CV.hit('mail_open:' + m.id, U.ix(), top, U.iw(), h);
      });
    });
    /* 一键领取：**只有真有可领的才出现**（没得领就不给这颗按钮 —— 与红点同一条口径）。 */
    if (list.some(function (m) { return m.hasReward && !m.claimed; })) {
      U.space(CV.SP[1]);
      U.btn(U.ix(), U.y, U.iw(), U.BTN_H * CV.SCALE, '一键领取', 'primary', 'mail_claim_all');
      U.y += U.BTN_H * CV.SCALE;
    }
    U.space(CV.SP[1]);
    U.hint('信不会过期；领完或读完 30 天后会自己清掉。', CV.SP[1]);
  });

  CV.on('open_mail', function () { CV.push('mail'); });

  /* 点一行 → 详情弹窗（正文 + 附件胶囊 + 一颗按钮）。正文在这里才铺开，列表上只留标题。 */
  CV.on('mail_open:*', function (id) {
    const m = pick(String(id || ''));
    if (!m) return;
    const open = (label, style, fn) => U.confirm(m.title, (m.body || []).join('\n'), fn,
      Object.assign({ cancel: false, okLabel: label, okStyle: style, note: dateOf(m.at) || '' },
        m.hasReward ? { chips: String(Core.rewardTextOf(m.reward)).split(' · ').filter(Boolean) } : {}));
    if (m.hasReward && !m.claimed) return open('领取', 'primary', function () { act(m.id); });
    if (!m.hasReward && !m.read) return open('知道了', 'primary', function () { act(m.id); });
    /* 已经处理过的：还能看，但**不再给"领"的按钮**（不给玩家一个点了没用的键）。 */
    open('关闭', 'ghost', null);
  });

  CV.on('mail_claim_all', function () {
    const ready = Core.mailList().filter(function (m) { return m.hasReward && !m.claimed; });
    let n = 0, stashed = 0;
    const oks = [];
    ready.forEach(function (m) {
      const r = Core.mailClaim(m.id);
      if (r.ok) { n++; oks.push(m.id); if (r.stashed && r.stashed.length) stashed += r.stashed.length; }
    });
    if (!n) { CV.toast('暂时没有可领的'); CV.render(); return; }
    ackCloud(oks);
    CV.toast('一键领取：' + n + ' 封' + (stashed ? '（' + stashed + ' 件进了待领箱）' : ''), 2800);
    CV.render();
  });

  /* 红点（主页那排的角标）：**只数"真有事可做"的信** —— 有的领就亮，没得领就不亮。 */
  CV.mailDot = function () { try { return Core.mailNewCount() > 0; } catch (e) { return false; } };
})();
