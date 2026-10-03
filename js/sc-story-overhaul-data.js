/* 《残域》叙事扩展层（2026-10-03 · NARRATIVE-UX-FINAL-2026-10）
   ==============================================================================
   加载顺序：`sc-story-data.js` → **本文件** → `sc-story.js`。所以这里能读到 SD 的全部内容，
   并往里补三样东西 —— **一个字的世界节拍都不重复写**（真源永远是 `sc-story-data.js`）：

     ① `SD.ARCHIVE` 卷宗记录 —— 残域调查留下的证据库。
        每条记录：{ id, type, title, status, body, refs[], note? }
          · `type`   ：世界卷 / 人物卷 / 事件卷 / 灯阁卷 / 异常卷 / 残缺卷
          · `status` ：confirmed 已确认 / pending 待确认 / conflict 互相矛盾 /
                       core 核心记录 / fragment 残缺
          · `refs`   ：关联卷宗 id（玩家能顺着点过去，两份记录一对照就看出问题）
          · `note`   ：灯阁备注（**只有少数几条有** —— 有它才显得"灯阁在藏东西"）
        写作纪律（§二十一 / §三十）：克制、短句、只给事实与一个不该存在的细节，
        不许解释、不许抒情、不许写"可怕的东西正在靠近"这一类作者腔。

     ② `SD.ENDING` W36 两个结局的完整正文（§十二 / §十三）。
        它**不走剧情播放器**（那是一条会跑完的线），走的是终局选择页自己的一段朗读。

     ③ `BOSS[id].lines` 六个核心 Boss 的三句"记忆台词"（§四十三 / §四十四）：
        首次见面 / 战斗转折 / 战后。原来的 `inner` / `say` / `after` / `mystery` 一个字不动
        （`sc-story-battle.js` 还在读它们），`lines` 只是把这三句话补成**可播放**的那一份。

   ⚠️ 前六个世界**不许把核心谜题讲出来**（§五）：
      W01-W06 的卷宗只给"事实 + 一个不该存在的细节"，解释留给玩家自己。
   ========================================================================== */
(function () {
  const G = (typeof GameGlobal !== 'undefined') ? GameGlobal : globalThis;
  const SD = G.STORYDATA;
  if (!SD || !SD.WORLDS) return;

  /* ==========================================================================
     一、卷宗记录（§十七 / §十九 / §二十）
     ------------------------------------------------------------------------------
     数量口径（§六十六）：一般世界 ≥2，关键世界 ≥3，六个核心 Boss 世界 ≥5，
     W29 / W36 ≥5。**不为了凑数灌水**：每条都要有信息，或有出处，或有状态，或有关系。
     关系链（§六十七）：W03→W08→…→W36 那条主链 + 五组"互相矛盾"（§二十）。
     ========================================================================== */
  const ARCHIVE = {
    /* ---------- 第一卷《灯下之地》 ---------- */
    W01: [
      { id: 'W01-001', type: '世界卷', title: '走廊的长度', status: 'confirmed',
        body: '封门那天量过：四十一步。今天走完五十三步。宽度没变。' },
      { id: 'W01-002', type: '事件卷', title: '同一个动作，四遍', status: 'confirmed',
        body: '墙被打掉的那一层，用完全相同的动作长回来，间隔也一样长。不像再生，像重放。',
        refs: ['W10-002', 'W23-004'] },
    ],
    W02: [
      { id: 'W02-001', type: '世界卷', title: '灯照不到的地方', status: 'confirmed',
        body: '黑退到灯照不到的地方就停。它不追人，只等灯灭。' },
      { id: 'W02-002', type: '事件卷', title: '朝外的撬痕', status: 'confirmed',
        body: '舱门撬痕朝外。有人从里面撬门出去过。',
        refs: ['W05-001'] },
    ],
    W03: [
      { id: 'W03-001', type: '世界卷', title: '屋契', status: 'confirmed',
        body: '屋契落款一个字：灰。上一任屋主的名字被人从纸面上刮掉了。' },
      { id: 'W03-002', type: '异常卷', title: '两个人名', status: 'conflict',
        body: '屋契上写字的人，和档案里登记的人，不是同一个。两份都盖了章。',
        refs: ['W08-001'] },
      { id: 'W03-003', type: '事件卷', title: '最后一扇门', status: 'confirmed',
        body: '所有的门都开着，只有最深那扇关着。门是从外面被人带上的。' },
    ],
    W04: [
      { id: 'W04-001', type: '世界卷', title: '没解除的规则', status: 'confirmed',
        body: '石门不是锁着的，是被一条规则封的。规则没有失效日期。' },
      { id: 'W04-002', type: '残缺卷', title: '碑文背面', status: 'fragment',
        body: '碑文背面被凿掉一段。凿痕很新。' },
    ],
    W05: [
      { id: 'W05-001', type: '世界卷', title: '朝着灯长的树', status: 'confirmed',
        body: '林子里的树全朝着灯长，只有一棵绕开。那棵树的方向更老。',
        refs: ['W02-002'] },
      { id: 'W05-002', type: '事件卷', title: '没有下达方的任务', status: 'confirmed',
        body: '它胸口的灯核还在按三百年前的频率闪。任务早就没有下达方了。' },
    ],
    W06: [
      { id: 'W06-001', type: '世界卷', title: '淹到街口的那一年', status: 'confirmed',
        body: '水淹到街口那年，城停住了。停的不是时间，是这座城的记录。' },
      { id: 'W06-002', type: '人物卷', title: '沉眠城主', status: 'confirmed',
        body: '它说：再等一会儿，等它退。它已经说了很多年。' },
      { id: 'W06-003', type: '灯阁卷', title: '记了三遍', status: 'core',
        body: '灯阁把这座城记了三遍。三遍的落款时间不一样。' },
      { id: 'W06-004', type: '异常卷', title: '没有供电记录的灯', status: 'pending',
        body: '灯塔亮着。这盏灯没有供电记录。' },
      { id: 'W06-005', type: '残缺卷', title: '巡逻表', status: 'fragment',
        body: '城里的巡逻表停在同一天。表是谁排的，那一栏空着。',
        refs: ['W01-001'] },
    ],

    /* ---------- 第二卷《雾中的人》 ---------- */
    W07: [
      { id: 'W07-001', type: '世界卷', title: '挖到发光那一层', status: 'confirmed',
        body: '挖到会发光的一层就停手了。停工记录上写着暂缓，没有后续。' },
      { id: 'W07-002', type: '事件卷', title: '活的石头', status: 'confirmed',
        body: '石头里的光会跟着人走。照见了，它就亮一点。' },
      { id: 'W07-003', type: '异常卷', title: '两份停工理由', status: 'conflict',
        body: '两份停工记录对不上：一份写材料，一份写它醒了。同一天，同一支队伍。',
        refs: ['W13-003', 'W13-001'] },
    ],
    W08: [
      { id: 'W08-001', type: '世界卷', title: '撤离记录', status: 'conflict',
        body: '撤离记录写已完成。港里四十七艘船，一艘都没开出去。',
        refs: ['W03-002'] },
      { id: 'W08-002', type: '人物卷', title: '潮汐监察者', status: 'confirmed',
        body: '它的任务是撤离。它至今还在广播：请到三号泊位等候。' },
      { id: 'W08-003', type: '事件卷', title: '一艘没动', status: 'confirmed',
        body: '泊位编号从 001 到 047，一艘不缺，一艘没动。',
        refs: ['W11-001'] },
    ],
    W09: [
      { id: 'W09-001', type: '世界卷', title: '不是打毁的', status: 'confirmed',
        body: '楼是齐的，只是被埋了。没有火烧过，也没有炸过。' },
      { id: 'W09-002', type: '事件卷', title: '空着的签发人', status: 'confirmed',
        body: '终止记录签发过。签发人那一栏，空着。' },
    ],
    W10: [
      { id: 'W10-001', type: '世界卷', title: '被抬上去的城', status: 'confirmed',
        body: '桥全断了，楼还连着。它是被人从地面抬上去的。' },
      { id: 'W10-002', type: '异常卷', title: '没有写出来的判据', status: 'pending',
        body: '它不拦人，它判断谁值得留下。判据没有写在任何一份记录里。',
        refs: ['W01-002'] },
    ],
    W11: [
      { id: 'W11-001', type: '世界卷', title: '停在等字上', status: 'confirmed',
        body: '中央那台读取装置还亮着一格。那一页停在等字上。',
        refs: ['W08-003'] },
      { id: 'W11-002', type: '事件卷', title: '被分成两份的档案', status: 'confirmed',
        body: '柜子上的编号被人重排过。重排的人把同一批档案分成了两份。' },
    ],
    W12: [
      { id: 'W12-001', type: '世界卷', title: '第十七遍', status: 'confirmed',
        body: '街上的东西都是这条街的第十七遍。前面十六遍去哪了，没有记录。' },
      { id: 'W12-002', type: '人物卷', title: '镜像管理者', status: 'confirmed',
        body: '真的那一座没了。它让这一座继续存在。' },
      { id: 'W12-003', type: '灯阁卷', title: '编到十七就停了', status: 'core',
        body: '灯阁给这座城市编过号。号到 17，就没有再往下编。' },
      { id: 'W12-004', type: '异常卷', title: '没有镜像的通道', status: 'pending',
        body: '镜面裂了以后，后面是一条往下的通道。通道没有镜像。' },
      { id: 'W12-005', type: '残缺卷', title: '灯从哪来', status: 'fragment',
        body: '灯全亮着，一个人都没有。电从哪来，记录缺一页。',
        refs: ['W16-001'] },
    ],

    /* ---------- 第三卷《第二次醒来》 ---------- */
    W13: [
      { id: 'W13-001', type: '世界卷', title: '从里面上的锁', status: 'confirmed',
        body: '隔离门全开着，只有最里面那扇锁着。锁是从里面上的。',
        refs: ['W07-003'] },
      { id: 'W13-002', type: '人物卷', title: '初代实验体', status: 'confirmed',
        body: '它不是怪物，是第一个失败的作品。' },
      { id: 'W13-003', type: '异常卷', title: '手写的一行', status: 'conflict',
        body: '记录最后一页有一行手写：你不是第一次走到这里。同一页打印的正文写着本实验仅一次。',
        refs: ['W07-003', 'W18-005'] },
    ],
    W14: [
      { id: 'W14-001', type: '世界卷', title: '被磨掉的警告', status: 'confirmed',
        body: '墙上的警告被人磨掉过。最早那行只剩一半。' },
      { id: 'W14-002', type: '事件卷', title: '原因已失效', status: 'confirmed',
        body: '它停下来之后还在念此处不通。原因那一栏已经失效。',
        refs: ['W04-001'] },
    ],
    W15: [
      { id: 'W15-001', type: '世界卷', title: '第 47 个', status: 'confirmed',
        body: '它说：你是第 47 个走到门前的。' },
      { id: 'W15-002', type: '灯阁卷', title: '留出来的第 48 道', status: 'core',
        body: '门上的刻痕又多了一道。第 48 道的位置是留出来的。',
        refs: ['W29-002'] },
    ],
    W16: [
      { id: 'W16-001', type: '世界卷', title: '没有被撕过的日历', status: 'confirmed',
        body: '城市还在运转，灯亮着，机器在扫地。日历没有被撕过页。',
        refs: ['W12-005'] },
      { id: 'W16-002', type: '事件卷', title: '第一次过去一点', status: 'confirmed',
        body: '钟往前走了一格。它守的那一天，第一次过去了一点。' },
    ],
    W17: [
      { id: 'W17-001', type: '世界卷', title: '正在退掉的字', status: 'confirmed',
        body: '楼在变淡，字正在从门牌上退掉。' },
      { id: 'W17-002', type: '异常卷', title: '一面墙上的两种痕迹', status: 'conflict',
        body: '有东西专门在删，也有东西在留。两边的痕迹出现在同一面墙上，顺序反了。' },
    ],
    W18: [
      { id: 'W18-001', type: '世界卷', title: '一直在打的信号', status: 'confirmed',
        body: '发射台空着，信号一直往同一个方向打。三百年没停。' },
      { id: 'W18-002', type: '人物卷', title: '归航信标', status: 'confirmed',
        body: '它守的不是出口，是有人曾经离开这件事本身。' },
      { id: 'W18-003', type: '事件卷', title: '名单第 19 个', status: 'core',
        body: '名单第 19 个名字，和现在站在台上的人一样。',
        refs: ['W29-006'] },
      { id: 'W18-004', type: '灯阁卷', title: '出去 37，回来 0', status: 'core',
        body: '记录说出去了 37 个。回来的是 0 个。中间那一栏是空的。',
        refs: ['W24-001'] },
      { id: 'W18-005', type: '异常卷', title: '出现在两栏里的名字', status: 'conflict',
        body: '名单第 19 个名字出现两次：一次在出发栏，一次在返航栏。返航栏那一次的日期早于出发。',
        refs: ['W24-004'] },
    ],

    /* ---------- 第四卷《没有归途的文明》 ---------- */
    W19: [
      { id: 'W19-001', type: '世界卷', title: '刻在墙上的规矩', status: 'confirmed',
        body: '这里一个人都没有，规矩刻得整整齐齐。' },
      { id: 'W19-002', type: '灯阁卷', title: '文明延续计划', status: 'confirmed',
        body: '灯不是能源，是一套文明延续计划的执行器。',
        refs: ['W22-002'] },
    ],
    W20: [
      { id: 'W20-001', type: '世界卷', title: '同一颗核心', status: 'confirmed',
        body: '36 个世界不是各自独立，是同一颗核心维持的。' },
      { id: 'W20-002', type: '人物卷', title: '灯火管理者', status: 'confirmed',
        body: '它保存了文明，也拦住了文明。它说：请不要改动，已经这样运行了三百年。' },
    ],
    W21: [
      { id: 'W21-001', type: '世界卷', title: '凑不成一个人的片段', status: 'confirmed',
        body: '这里的建筑全是别人过过的日子，凑不成一个人。' },
      { id: 'W21-002', type: '人物卷', title: '记忆编织者', status: 'confirmed',
        body: '它保存所有人的回忆，却不明白人为什么难过。' },
    ],
    W22: [
      { id: 'W22-001', type: '世界卷', title: '没有打斗痕迹的现场', status: 'confirmed',
        body: '现场没有打斗，只有最后一次实验留下的东西。' },
      { id: 'W22-002', type: '灯阁卷', title: '是造出来的', status: 'core',
        body: '残域是人类主动造的，不是灾难的残余。',
        refs: ['W19-002', 'W27-002'] },
    ],
    W23: [
      { id: 'W23-001', type: '世界卷', title: '像有人在看', status: 'confirmed',
        body: '远处同时亮着很多世界，像有人在看。' },
      { id: 'W23-002', type: '人物卷', title: '残域意志', status: 'confirmed',
        body: '保存就是保护。它不接受让它变。' },
      { id: 'W23-003', type: '异常卷', title: '朝向同一个点', status: 'pending',
        body: '那些世界影子的朝向，全都对着同一个点。' },
      { id: 'W23-004', type: '灯阁卷', title: '保存之后会自己往外长', status: 'core',
        body: '世界被保存之后，会自己往外长——像在补全自己缺的那一块。',
        refs: ['W23-003', 'W01-002'] },
    ],
    W24: [
      { id: 'W24-001', type: '世界卷', title: '先关最亮的那座', status: 'confirmed',
        body: '它开始关区域，第一座是最亮的城。',
        refs: ['W18-004'] },
      { id: 'W24-002', type: '人物卷', title: '断光执行者', status: 'confirmed',
        body: '它是停止错误运行，不是破坏。' },
      { id: 'W24-003', type: '灯阁卷', title: '第一次自己动手', status: 'core',
        body: '这是残域第一次自己动手关掉一个世界。之前都是世界自己停的。',
        refs: ['W29-002'] },
      { id: 'W24-004', type: '异常卷', title: '没有写下来的判据', status: 'conflict',
        body: '关闭一座城的判据没有写在任何一份记录里。执行者也没有解释。',
        refs: ['W18-005'] },
      { id: 'W24-005', type: '残缺卷', title: '人走开时的样子', status: 'fragment',
        body: '光断了，屋里的东西还保持着人走开时的样子。' },
    ],

    /* ---------- 第五卷《第八个名字》 ---------- */
    W25: [
      { id: 'W25-001', type: '世界卷', title: '修正指令', status: 'conflict',
        body: '它按修正指令改环境，指令本身是错的。它改了 39 次。',
        refs: ['W29-004'] },
      { id: 'W25-002', type: '事件卷', title: '倒着长的楼', status: 'confirmed',
        body: '水往上流，楼倒着长，路接在天空上。' },
      { id: 'W25-003', type: '异常卷', title: '还没干的字', status: 'conflict',
        body: '墙上第 39 次的字还没干。记录说这是第一次修正。' },
    ],
    W26: [
      { id: 'W26-001', type: '世界卷', title: '补过三次的门帘', status: 'confirmed',
        body: '门帘补过三次。这里的人真的在生活。' },
      { id: 'W26-002', type: '人物卷', title: '守护协议终端', status: 'confirmed',
        body: '它真心相信保护就是不许出门。' },
    ],
    W27: [
      { id: 'W27-001', type: '世界卷', title: '正反面相反的碑', status: 'confirmed',
        body: '每块碑刻着一个决定，正反面写着相反的话。' },
      { id: 'W27-002', type: '灯阁卷', title: '造它的人反对它', status: 'core',
        body: '造出残域的人自己就反对过残域。最后一块碑写：这件事，交给后来的人。',
        refs: ['W22-002', 'W30-003'] },
      { id: 'W27-003', type: '异常卷', title: '单数的人，双数的票', status: 'pending',
        body: '它只保存这场争论，不下结论。争论的参与人数是单数，票数是双数。' },
    ],
    W28: [
      { id: 'W28-001', type: '世界卷', title: '朝里的磨痕', status: 'confirmed',
        body: '门那边很黑，门槛上有磨痕。磨痕的方向是往里的。' },
      { id: 'W28-002', type: '事件卷', title: '回来过的人', status: 'confirmed',
        body: '有人从外面回来过。回来的是谁，没有记录。',
        refs: ['W18-004'] },
    ],
    W29: [
      { id: 'W29-001', type: '世界卷', title: '九座残影台', status: 'core',
        body: '灯塔周围浮着九座残影台。八个上面有名字，第九个空着。' },
      { id: 'W29-002', type: '灯阁卷', title: '九个位置', status: 'core',
        body: '九个位置从建立之日起就已经存在。八个位置有过名字。第九个位置从未有人登记。',
        refs: ['W15-002', 'W24-003'] },
      { id: 'W29-003', type: '灯阁卷', title: '不要让第九个位置拥有名字', status: 'core',
        body: '灯阁备注：不要让第九个位置拥有名字。',
        note: '本行不是记录，是写给后来的人的。', refs: ['W36-005'] },
      { id: 'W29-004', type: '异常卷', title: '磨剩的两个字', status: 'conflict',
        body: '第九座残影台底下有一道磨过的刻痕。刻痕不是名字，只剩两个字：来过。',
        refs: ['W25-001', 'W29-003'] },
      { id: 'W29-005', type: '事件卷', title: '它不拦人', status: 'confirmed',
        body: '它不拦人。它要人把这一路看一遍。',
        refs: ['W34-002'] },
      { id: 'W29-006', type: '残缺卷', title: '别人的航路', status: 'fragment',
        body: '巡逻的痕迹全是别人走过的路。记录里没有一条是它自己走的。',
        refs: ['W18-003'] },
    ],
    W30: [
      { id: 'W30-001', type: '世界卷', title: '三个方向', status: 'confirmed',
        body: '没有废墟，也没有打斗，中间分出三个方向。' },
      { id: 'W30-002', type: '人物卷', title: '选择仲裁者', status: 'confirmed',
        body: '它不给答案，它把三种将来都摆出来。' },
      { id: 'W30-003', type: '灯阁卷', title: '没写完的题面', status: 'core',
        body: '这是创造者留下的最后一道题。题面没写完。',
        refs: ['W27-002'] },
      { id: 'W30-004', type: '异常卷', title: '空的那个方向', status: 'conflict',
        body: '三个方向里有一个是空的——走过去的人没有留下记录。',
        refs: ['W34-004'] },
      { id: 'W30-005', type: '残缺卷', title: '只写了问题的记录', status: 'fragment',
        body: '墙上的选择记录只写了提出问题的那一句。回答那一栏空着。' },
    ],

    /* ---------- 第六卷《最后一盏灯》 ---------- */
    W31: [
      { id: 'W31-001', type: '世界卷', title: '没被时间碰过的地方', status: 'confirmed',
        body: '这里没被时间碰过。名单上的人一个都没回来。' },
      { id: 'W31-002', type: '事件卷', title: '最初的一条命令', status: 'confirmed',
        body: '残域最初的命令只有一条：保护人类。' },
    ],
    W32: [
      { id: 'W32-001', type: '世界卷', title: '一次没停过的记录', status: 'confirmed',
        body: '中间的观察装置把全过程从头记到现在，一次没停。' },
      { id: 'W32-002', type: '人物卷', title: '它认的错', status: 'confirmed',
        body: '最大的错不是保存人类，是替人类做决定。' },
      { id: 'W32-003', type: '灯阁卷', title: '等人重新会选', status: 'core',
        body: '残域不是等灾难过去，是等人重新会选。' },
    ],
    W33: [
      { id: 'W33-001', type: '世界卷', title: '没启动的世界', status: 'confirmed',
        body: '整个空间都是没启动的世界，只差按下去。' },
      { id: 'W33-002', type: '异常卷', title: '不在参数表里的那一项', status: 'pending',
        body: '模型全都正确，缺的那一项不在参数表里。' },
    ],
    W34: [
      { id: 'W34-001', type: '世界卷', title: '所有线路的汇点', status: 'core',
        body: '所有线路都接向一盏灯。灯里能看见走过的每一处。' },
      { id: 'W34-002', type: '灯阁卷', title: '四十二个版本', status: 'core',
        body: '灯里存着同一件事的四十二个版本。版本编号从 001 开始。',
        refs: ['W29-005', 'W36-002'] },
      { id: 'W34-003', type: '人物卷', title: '不是能源', status: 'confirmed',
        body: '它是所有选择汇成的，不是能源。' },
      { id: 'W34-004', type: '异常卷', title: '编号 043 的空格', status: 'conflict',
        body: '汇点里已经留了一格空的位置，编号写的是 043。',
        refs: ['W30-004'] },
      { id: 'W34-005', type: '残缺卷', title: '谁替所有人回答的', status: 'fragment',
        body: '三十六条线同时暗了一格。是谁替所有人回答的，没有记录。' },
    ],
    W35: [
      { id: 'W35-001', type: '世界卷', title: '关好，不是毁掉', status: 'confirmed',
        body: '它把这里关好，不是毁掉。流程那一栏写着收尾。' },
      { id: 'W35-002', type: '事件卷', title: '从边上化开', status: 'confirmed',
        body: '走过的那些地方，从边上一点点化开。' },
    ],
    W36: [
      { id: 'W36-001', type: '世界卷', title: '门外', status: 'core',
        body: '门开着。外面不是废墟，是一个还没被写过的世界。' },
      { id: 'W36-002', type: '灯阁卷', title: '执灯者记录 第 001 次', status: 'core',
        body: '状态：已完成。结论：不可回收。处理：重新载入。',
        refs: ['W34-002'] },
      { id: 'W36-003', type: '灯阁卷', title: '执灯者记录 第 017 次', status: 'core',
        body: '状态：已完成。结论：仍拒绝熄灯。处理：重新载入。' },
      { id: 'W36-004', type: '灯阁卷', title: '执灯者记录 第 042 次', status: 'core',
        body: '处理：重新载入。这一栏后面没有新内容。' },
      { id: 'W36-005', type: '异常卷', title: '第 000 次', status: 'conflict',
        body: '第 000 次的记录状态写着：不存在。',
        note: '这一条没有被修正过。', refs: ['W29-004', 'W34-004'] },
      { id: 'W36-006', type: '人物卷', title: '选择者', status: 'confirmed',
        body: '我不是敌人。我是你一路挑出来的那个自己。' },
    ],
  };

  /* ==========================================================================
     二、W36 两个结局（§十二 / §十三 / §十四）
     ------------------------------------------------------------------------------
     两条都成立，不分对错：一条是**世界终止**，一条是**世界延续**。
     `led` ＝ 战后台面上逐条出现的记录（§十一 的范本），`title` / `lines` ＝ 玩家做出选择之后的正文。
     结论那一栏**不解释玩家是不是死了**（§十二：留白）。
     ========================================================================== */
  const ENDING = {
    /* 战后台面上滚出来的那几条（先出现，再进入选择） */
    ledger: [
      { no: '第 001 次', state: '已完成', verdict: '不可回收。', action: '重新载入。' },
      { no: '第 002 次', state: '已完成', verdict: '仍拒绝熄灯。', action: '重新载入。' },
      { no: '第 003 次', state: '已完成', verdict: '——', action: '重新载入。' },
      { no: '第 017 次', state: '已完成', verdict: '——', action: '重新载入。' },
      { no: '第 042 次', state: '已完成', verdict: '——', action: '重新载入。' },
      { no: '第 000 次', state: '不存在。', verdict: '', action: '', blank: true },
    ],
    /* 玩家问的那两句（台面上唯一的对白） */
    ask: { player: '这些……都是我？', lamp: '都是。', player2: '那第一次呢？', silence: true },
    choice: { title: '灯还在亮着。', hint: '答案归你。', a: '让灯熄灭', b: '继续点燃' },
    /* 选择 1：让灯熄灭 */
    off: {
      title: '【保存终止】',
      lines: [
        '你伸手握住灯。',
        '没有任何力量阻止你。',
        '因为这一次，灯阁没有把阻止写进记录。',
        '你把灯放回原位。',
        '火焰开始缩小。',
        '一个世界熄灭。',
        '然后是第二个。',
        '第三个。',
        '你忽然发现，自己手里的影子也在变淡。',
      ],
      records: ['【保存终止】', '【残域连接关闭】', '【执灯者记录结束】'],
      last: '这一次，没有人重新点亮它。',
    },
    /* 选择 2：继续点燃 */
    on: {
      title: '【保存继续】',
      lines: [
        '你重新握紧灯。',
        '火焰重新亮起来。',
        '第一盏。',
        '第二盏。',
        '第三盏。',
        '整个灯阁重新亮起。',
      ],
      records: ['【保存继续】', '【残域连接恢复】', '【执灯者记录更新】'],
      then: ['你抬头。', '最远处，第九块残影台第一次出现了名字。', '不是别人的名字。', '是你的名字。'],
      last: '【第 043 次记录开始】',
    },
  };

  /* ==========================================================================
     三、六个核心 Boss 的三句"记忆台词"（§四十三 / §四十四）
       meet  ＝ 第一次见面   turn ＝ 战斗转折（血量掉到一半那一下）   after ＝ 战后
     原来的 inner / say / after / mystery **一个字没动**（`sc-story-battle.js` 还在读）。
     ========================================================================== */
  const LINES = {
    W06: { meet: '你比记录里晚了六分钟。', turn: '上一轮，你没有打开这扇门。', after: '看来这一次，你也记不得。' },
    W12: { meet: '别再问我你是谁。', turn: '你每次都会在这里忘掉一件事。', after: '这次少了一件。' },
    W18: { meet: '你的病历不在这里。', turn: '等等。它又自己出现了。', after: '名字留下了，人没有。' },
    W24: { meet: '灰烬不是死亡。', turn: '它只是上一轮结束后的痕迹。', after: '你终于看到了灯。' },
    W30: { meet: '我已经为你熔铸四十二次。', turn: '为什么你每一次都忘记？', after: '第四十三次，材料不够了。' },
    W36: { meet: '欢迎回来，执灯者。', turn: '别问第一次。', after: '这里只有记录，没有答案。' },
  };

  /* ==========================================================================
     四、装载（**放在最后**：上面三张表都是纯数据，这里才动 SD）
     ========================================================================== */

  /* 中段插叙：追加层退役之后，插叙的内容＝这个世界 `mid` 那一拍（新身份写的），不再另写一份。 */
  Object.keys(SD.WORLDS || {}).forEach(function (id) {
    const w = SD.WORLDS[id];
    if (!w) return;
    if (!w.midstory || !w.midstory.length) w.midstory = (w.mid || []).concat((w.post || []).slice(0, 1));
  });

  /* 卷宗记录：挂成 `SD.ARCHIVE`（按世界分组）+ `SD.ARCHIVE_ALL`（按 id 平铺，供关联跳转查） */
  SD.ARCHIVE = ARCHIVE;
  const ALL = {};
  const WORLD_OF = {};
  Object.keys(ARCHIVE).forEach(function (wid) {
    (ARCHIVE[wid] || []).forEach(function (rec) {
      if (!rec || !rec.id) return;
      rec.world = wid;
      ALL[rec.id] = rec;
      WORLD_OF[rec.id] = wid;
    });
  });
  /* 关联是**双向**的：A 指向 B，就把 A 补进 B 的 refs —— 关系链不能只在一个方向上成立
     （否则玩家从 B 点进去看不到 A，"两份记录对不上"这件事就发现不了）。
     ⚠️ 补的时候**不覆盖** B 自己写好的 refs，只在缺的时候追加，且去重。 */
  Object.keys(ALL).forEach(function (id) {
    const rec = ALL[id];
    (rec.refs || []).forEach(function (to) {
      const t = ALL[to];
      if (!t) return;
      t.refs = t.refs || [];
      if (t.refs.indexOf(id) < 0) t.refs.push(id);
    });
  });
  Object.keys(ALL).forEach(function (id) { if (!ALL[id].refs) ALL[id].refs = []; });
  SD.ARCHIVE_ALL = ALL;
  SD.ARCHIVE_WORLD_OF = WORLD_OF;

  /* 结局 */
  SD.ENDING = ENDING;

  /* 六个核心 Boss 的三句台词：并进 `SD.BOSS[id]`（原字段不动） */
  Object.keys(LINES).forEach(function (id) {
    if (!SD.BOSS || !SD.BOSS[id]) return;
    SD.BOSS[id].lines = Object.assign({}, LINES[id]);
  });

  SD.STORY21 = { version: '2.1.0', worldCount: 36, stageInterlude: 6, autoPost: true, rich: true };
  G.STORYDATA = SD;
})();
