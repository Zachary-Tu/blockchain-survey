import type { GoLevel, GoOpponent } from "./goTypes";

export const goLevels: GoLevel[] = [
  {
    id: 1, rank: "30级", title: "黑白初见", subtitle: "认识棋盘、落子和终局", focus: "规则启蒙", color: "#6ce0d1", image: "/tim-classroom/go/lessons/level-01.png",
    objectives: ["知道黑先白后与交叉点落子", "理解气、提子和禁入点", "会用中国规则完成一盘棋"],
    lessons: [
      { title: "先看交叉点", body: "棋子落在线的交叉点上，落下后一般不移动。黑棋先行，双方轮流一手。", tip: "找星位和中央天元，先建立棋盘坐标感。" },
      { title: "没有气就提走", body: "与棋子上下左右相邻的空点叫气。同色相连成为一块棋，共享全部气。", tip: "每次落子前先数自己和对手各有几口气。" },
      { title: "两次停一手终局", body: "双方连续停一手后可终局。中国规则按活棋子与围住的空点计分，并用贴子补偿白棋后手。", tip: "本课堂采用黑贴 3¾ 子，等价于白方加 7.5 目。" },
    ],
  },
  {
    id: 2, rank: "25级", title: "气与吃子", subtitle: "数气、打吃、逃跑与提子", focus: "基础攻防", color: "#6bbcff", image: "/tim-classroom/go/lessons/level-02.png",
    objectives: ["快速数清一块棋的气", "识别打吃并正确逃跑", "避免征子与枷的基础陷阱"],
    lessons: [
      { title: "一口气叫打吃", body: "一块棋只剩一口气时处于打吃。轮到对方占住最后一气，这块棋就被提走。", tip: "听见打吃，先找增加气或连接的办法。" },
      { title: "逃跑不只会长", body: "直接长出通常能增加气，连接友军也可能脱险；反打吃有时更主动。", tip: "比较每个候选点落下后实际增加了几口气。" },
      { title: "看清征子方向", body: "征子会沿斜线不断逼迫目标棋；远处友军若能接应，就可能成为征子引征。", tip: "征子至少向前读四到六手，不要只看眼前。" },
    ],
  },
  {
    id: 3, rank: "20级", title: "连接与切断", subtitle: "学会保护自己、分断对手", focus: "棋形基础", color: "#7f8cff", image: "/tim-classroom/go/lessons/level-03.png",
    objectives: ["理解实连接与间接连接", "发现断点和薄味", "认识虎口、跳与飞的效率"],
    lessons: [
      { title: "连接降低风险", body: "两块棋连成一块后共享气，但过度贴紧也可能效率低。要在安全与速度之间平衡。", tip: "先问能不能被断，再问有没有更轻快的连接。" },
      { title: "断开就要分别照顾", body: "切断能让对手的棋分成两块，产生两个需要处理的弱点，是攻击的起点。", tip: "好切断通常让双方都难兼顾，而不是只吃一颗小棋。" },
      { title: "棋形要有弹性", body: "尖最坚实，跳和小飞更轻快；虎口常能防断，但也要留意被利用的假眼。", tip: "根据周围敌我强弱选择棋形，不背孤立口诀。" },
    ],
  },
  {
    id: 4, rank: "15级", title: "常用着法", subtitle: "尖、小飞、大飞、扳与虎", focus: "定式语言", color: "#aa78ff", image: "/tim-classroom/go/lessons/level-04.png",
    objectives: ["看懂常用棋形名称", "理解扳、长、断的次序", "把定式当作局部选择而非死背"],
    lessons: [
      { title: "先学棋形语言", body: "尖是斜相邻，小飞像象棋马步，大飞再远一路；跳沿直线隔一路。名称帮助交流与复盘。", tip: "在空棋盘上摆出每种棋形，比只背定义更牢。" },
      { title: "扳要考虑反扳", body: "扳从侧面阻挡对手前进，常伴随长、断和打吃。次序错了，结果可能完全不同。", tip: "每次扳之前都检查对手能否断，断后谁的气更紧。" },
      { title: "定式服务全局", body: "定式是在特定局部条件下双方可接受的变化。外势、方向和附近配置变化时，选择也会变。", tip: "记住每手目的和适用条件，而不是背完固定手顺。" },
    ],
  },
  {
    id: 5, rank: "10级", title: "布局方向", subtitle: "角边中、拆边与守角", focus: "全局思维", color: "#dc70df", image: "/tim-classroom/go/lessons/level-05.png",
    objectives: ["理解角边中效率差异", "选择守角、挂角和拆边方向", "区分大场与急所"],
    lessons: [
      { title: "金角银边草肚皮", body: "角部借两条边围地效率最高，边次之，中央最难直接围成实地。", tip: "布局前期优先占角，再从角向边展开。" },
      { title: "高低配合", body: "低位着重实地，高位着重外势和发展。好布局会让棋子彼此呼应，而非各自为战。", tip: "看全盘弱棋与发展方向，再决定高还是低。" },
      { title: "急所常大于大场", body: "大场价值高，但关系到弱棋安危或先手攻防的急所通常更紧迫。", tip: "先处理不走就会受伤的地方，再抢最大的空处。" },
    ],
  },
  {
    id: 6, rank: "5级", title: "死活入门", subtitle: "真眼、假眼、做活与杀棋", focus: "局部计算", color: "#ff79af", image: "/tim-classroom/go/lessons/level-06.png",
    objectives: ["区分真眼与假眼", "理解两眼活棋", "寻找眼形的要点"],
    lessons: [
      { title: "两只真眼才能活", body: "对手不能同时填掉两个独立真眼，因为填最后一眼会先让自己没有气。", tip: "眼位不仅要空，还要检查边角和对角控制。" },
      { title: "眼形有共同要点", body: "直三、弯三、方四等眼形往往存在决定生死的中心要点，攻守双方都想先占。", tip: "先找能把一个大眼分成两个眼，或把两个眼合成一个的点。" },
      { title: "双活不是两眼活", body: "双活依靠双方共享的气，谁先填都会先死。它是活棋，但计分性质与独立两眼不同。", tip: "共享气不要急着填，先确认是否存在外气或劫材。" },
    ],
  },
  {
    id: 7, rank: "3级", title: "攻防判断", subtitle: "弱棋、厚势、侵消与腾挪", focus: "中盘策略", color: "#ff8a79", image: "/tim-classroom/go/lessons/level-07.png",
    objectives: ["识别全盘最弱的棋", "用攻击获取外势和实地", "选择侵入、侵消与腾挪"],
    lessons: [
      { title: "攻击不等于必须杀", body: "逼迫弱棋逃跑时，可以顺势围地、筑厚、抢先手；一味追杀反而可能让自己留下弱点。", tip: "每手攻击都问：除了追棋，我得到了什么？" },
      { title: "强处少靠近", body: "贴近对手厚势容易被攻击。处理模样时，侵入求活与浅消规模要按周围强弱选择。", tip: "对方越厚，自己的目标越应轻、快、可舍。" },
      { title: "腾挪允许弃子", body: "局部数子不利时，可用弃子交换外势、先手或别处利益，避免沉重地救每一颗棋。", tip: "区分重要棋筋和已经完成任务的残子。" },
    ],
  },
  {
    id: 8, rank: "1级", title: "中盘手筋", subtitle: "征子、枷、倒扑与弃子", focus: "战术阅读", color: "#ffad66", image: "/tim-classroom/go/lessons/level-08.png",
    objectives: ["掌握常见吃棋手筋", "能读紧气与倒扑", "用次序制造先手"],
    lessons: [
      { title: "先找强制手", body: "打吃、断、叫吃关键棋往往迫使对手回应。阅读时先列强制候选，再比较结果。", tip: "每一层都优先看将军式的强手，但别漏掉反击。" },
      { title: "倒扑先送后吃", body: "故意送一颗棋，让对手提后形成气紧，再回头提掉更大一块，是典型倒扑。", tip: "看到提子后的形状变化，不要只计算眼前得失。" },
      { title: "枷与征子互补", body: "征子需要方向与引征，枷则用较松的包围限制出路；两者选择取决于外围配置。", tip: "征子不利时先找枷，枷不严时再看征子。" },
    ],
  },
  {
    id: 9, rank: "准初段", title: "官子与形势", subtitle: "目数、先后手与收束", focus: "价值判断", color: "#ffd166", image: "/tim-classroom/go/lessons/level-09.png",
    objectives: ["估算双方地与厚薄", "比较官子目数", "识别先手、后手和逆收"],
    lessons: [
      { title: "先判断盘面", body: "进入官子前先估算实地、潜力与弱棋。领先时求简明，落后时保留变化和机会。", tip: "分块估算，宁可给区间，不要被一两目假精确误导。" },
      { title: "官子价值看双方差", body: "一手棋的价值不是只看自己增加多少，还要比较不走时对方能获得多少。", tip: "用“我先走的结果－对方先走的结果”比较。" },
      { title: "先手也有代价", body: "能迫使回应的是先手官子，但若收益过小或对方可以脱先，机械保先手会损失。", tip: "确认威胁是否真的大到对方必须应。" },
    ],
  },
  {
    id: 10, rank: "1段", title: "综合实战", subtitle: "方向、计算、转换与复盘", focus: "整盘决策", color: "#9be46b", image: "/tim-classroom/go/lessons/level-10.png",
    objectives: ["建立候选手与计算流程", "比较局部结果和全局转换", "形成可复用的复盘方法"],
    lessons: [
      { title: "先判断再计算", body: "确认形势、强弱和当前任务，再生成候选手。没有方向的深算，常是在错误问题上用力。", tip: "每回合用“形势—弱棋—急所—候选”四步检查。" },
      { title: "接受等价转换", body: "实战不必在每处都赢。牺牲局部换取外势、先手或大场，只要全局价值更高就是成功。", tip: "比较转换前后的总收益，不被被吃棋子的数量绑架。" },
      { title: "复盘找决策点", body: "复盘优先找判断改变、局势大幅波动和读秒失误处，记录当时想法，再验证替代方案。", tip: "每盘只提炼三条可执行结论，下一盘刻意练习。" },
    ],
  },
];

export const goOpponents: GoOpponent[] = [
  {
    id: "normal",
    name: "古风弈士 Tim",
    rank: "轻松 · 入门陪练",
    description: "沉着但会留出破绽，适合练习落子、吃子和做眼。",
    image: "/tim-classroom/go/opponents/normal-tim.png",
    color: "#ff8b6b",
  },
  {
    id: "hero",
    name: "暴衣好汉 Tim",
    rank: "稳健 · 基础棋力",
    description: "棋风豪爽、敢打敢冲，开始主动寻找打吃与切断。",
    image: "/tim-classroom/go/opponents/hero-tim.png",
    color: "#ffd166",
  },
  {
    id: "emperor",
    name: "皇帝 Tim",
    rank: "机敏 · 进阶挑战",
    description: "统筹全局、重视先手，会在攻守之间选择更大的一手。",
    image: "/tim-classroom/go/opponents/emperor-tim.png",
    color: "#ff645d",
  },
  {
    id: "saiyan",
    name: "赛亚人 Tim",
    rank: "从容 · 高阶挑战",
    description: "计算更深、出手更快，终极形态会惩罚松散棋形。",
    image: "/tim-classroom/go/opponents/saiyan-tim.png",
    color: "#72dfc6",
  },
];
