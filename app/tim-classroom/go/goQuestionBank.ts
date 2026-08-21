import { boardHash, createBoard, playMove } from "./goEngine";
import type { GoPoint } from "./goEngine";
import type {
  GoBoardQuestion,
  GoCandidatePoint,
  GoChoiceQuestion,
  GoPuzzleObjective,
  GoPuzzleTask,
  GoQuestion,
  GoSetupStone,
} from "./goTypes";

type StoneTuple = [number, number, 1 | 2];
type PointTuple = [number, number];

type KnowledgeSeed = {
  kind: "knowledge";
  family: string;
  category: string;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
};

type CandidateSeed = {
  kind: "candidate";
  family: string;
  category: string;
  prompt: string;
  explanation: string;
  task: GoPuzzleTask;
  boardSize: number;
  stones: StoneTuple[];
  toPlay: 1 | 2;
  candidates: PointTuple[];
  correct: number[];
  hint: string;
};

type ObjectiveSeed = {
  kind: "objective";
  family: string;
  category: string;
  prompt: string;
  explanation: string;
  task: GoPuzzleTask;
  boardSize: number;
  stones: StoneTuple[];
  toPlay: 1 | 2;
  knownStarts: PointTuple[];
  objective: Omit<GoPuzzleObjective, "anchors" | "goalPoints"> & {
    anchors: PointTuple[];
    goalPoints?: PointTuple[];
  };
  hint: string;
};

type Seed = KnowledgeSeed | CandidateSeed | ObjectiveSeed;

const K = (family: string, category: string, prompt: string, options: string[], correct: number, explanation: string): KnowledgeSeed => ({
  kind: "knowledge", family, category, prompt, options, correct, explanation,
});

const C = (
  family: string,
  category: string,
  prompt: string,
  explanation: string,
  task: GoPuzzleTask,
  stones: StoneTuple[],
  candidates: PointTuple[],
  correct: number[],
  hint: string,
  boardSize = 7,
  toPlay: 1 | 2 = 1,
): CandidateSeed => ({ kind: "candidate", family, category, prompt, explanation, task, boardSize, stones, candidates, correct, hint, toPlay });

const O = (
  family: string,
  category: string,
  prompt: string,
  explanation: string,
  task: GoPuzzleTask,
  stones: StoneTuple[],
  knownStarts: PointTuple[],
  objective: ObjectiveSeed["objective"],
  hint: string,
  boardSize = 7,
  toPlay: 1 | 2 = 1,
): ObjectiveSeed => ({ kind: "objective", family, category, prompt, explanation, task, boardSize, stones, knownStarts, objective, hint, toPlay });

const captureShape: StoneTuple[] = [[3, 3, 2], [2, 3, 1], [3, 2, 1], [4, 3, 1]];
const saveShape: StoneTuple[] = [[3, 3, 1], [2, 3, 2], [3, 2, 2], [4, 3, 2]];
const twoLibertyShape: StoneTuple[] = [[3, 3, 1], [2, 3, 2], [3, 2, 2]];
const atariShape: StoneTuple[] = [[3, 3, 2], [2, 3, 1], [3, 2, 1]];
const connectionShape: StoneTuple[] = [[3, 2, 1], [3, 4, 1], [2, 3, 2], [4, 3, 2]];
const eyeShape: StoneTuple[] = [[0, 0, 1], [0, 1, 1], [0, 2, 1], [1, 0, 1], [2, 0, 1], [2, 1, 1], [2, 2, 1]];
const twoStepCaptureShape: StoneTuple[] = [
  [2, 2, 2], [1, 2, 1], [2, 1, 1], [1, 3, 1], [2, 4, 1], [3, 3, 1], [3, 1, 1], [4, 2, 1],
];
const sharedCandidates: PointTuple[] = [[3, 4], [2, 2], [4, 4], [1, 1]];
const doubleAtariShape: StoneTuple[] = [
  [3, 2, 2], [3, 4, 2], [2, 2, 1], [4, 2, 1], [2, 4, 1], [4, 4, 1],
];
const netShape: StoneTuple[] = [[3, 3, 2], [3, 4, 1], [4, 3, 1], [4, 2, 1], [2, 4, 1]];
const shortageShape: StoneTuple[] = [
  [3, 2, 2], [3, 4, 2],
  [2, 2, 1], [4, 2, 1], [2, 3, 1], [4, 3, 1], [2, 4, 1], [4, 4, 1],
];
const shortageConnectedShape: StoneTuple[] = [...shortageShape, [3, 1, 1], [3, 3, 2]];
const snapbackShape: StoneTuple[] = [
  [2, 2, 2], [2, 3, 2], [2, 4, 2], [3, 4, 2], [4, 4, 2], [4, 3, 2], [4, 2, 2],
  [1, 2, 1], [1, 3, 1], [1, 4, 1], [2, 1, 1], [2, 5, 1], [3, 1, 1], [3, 5, 1],
  [4, 1, 1], [4, 5, 1], [5, 2, 1], [5, 3, 1], [5, 4, 1],
];
const capturingRaceShape: StoneTuple[] = [
  [3, 2, 1], [2, 3, 1], [4, 3, 1], [2, 4, 1], [4, 4, 1],
  [2, 2, 2], [4, 2, 2], [3, 4, 2],
];

const levelSeeds: Record<number, Seed[]> = {
  1: [
    K("liberty-reading", "棋盘语言", "棋子所说的“气”具体指什么？", ["与棋子正交相邻的空点", "棋子斜对角的空点", "棋盘上的星位", "已经围住的目"], 0, "气只看上下左右相邻的空点，不计算斜线。数气是判断打吃、逃跑和提子的起点。"),
    K("atari-meaning", "棋盘语言", "一块棋只剩一口气时，通常称为什么？", ["打吃", "长", "双活", "收官"], 0, "只剩一气就是被打吃；若不处理，对方下一手通常可以提走。"),
    K("capture-condition", "提子", "什么时候应从棋盘上拿走一块棋？", ["最后一口气被占据时", "被对方斜着包围时", "落到边线时", "连续两手没移动时"], 0, "一整块相连棋的气全部消失才被提走；围棋棋子本身不会移动。"),
    K("connection-basics", "连接", "两枚同色棋在上下左右紧贴时，它们的气如何计算？", ["作为同一块棋共同计算", "仍各自独立", "自动变成两个眼", "必须先提掉一枚"], 0, "正交相邻的同色棋构成一块，内部接触点不算气，外部空点合并计算。"),
    C("capture-one", "提子", "黑先。请选择能立即提掉中央白子的候选点。", "白子只有一个未被占据的正交邻点；占住它就完成提子。", "capture", captureShape, sharedCandidates, [0], "先数白子的四个正交邻点。"),
    C("save-one", "逃跑", "黑先。黑子正被打吃，哪一个标记点能解除打吃？", "本题黑子只剩一口气；沿唯一气位长出，棋块重新获得多口气。", "save", saveShape, sharedCandidates, [0], "找出黑子唯一仍为空的正交邻点。"),
    C("two-valid-extensions", "长气", "黑先。目标只是把中央黑子的气增加到至少三口；本题哪些候选点都可以？", "中央黑子当前有两口气，两个正交空点都能完成目标，因此本题明确接受两个答案。", "save", twoLibertyShape, [[3, 4], [4, 3], [2, 2], [4, 4]], [0, 1], "这是一道多解题，别强行寻找唯一方向。"),
    C("solid-connect", "连接", "黑先。A、B 两块黑棋之间有断点；选择能把它们直接连成一块的候选点。", "占住两块棋之间的共同空点后，两边在正交方向接触，成为同一块棋。", "connect", connectionShape, [[3, 3], [2, 2], [2, 4], [5, 3]], [0], "寻找同时与两边黑棋正交相邻的空点。"),
    O("capture-goal", "目标练习", "黑先：不限定坐标，用合法着法把标记白子提掉即获胜。", "系统按目标棋是否真的离开棋盘判定，不要求背诵某个坐标。", "capture", captureShape, [[3, 4]], { kind: "capture-target", label: "提掉标记白子", targetColor: 2, anchors: [[3, 3]], maxPlayerMoves: 1, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "点击白子最后一口气。"),
    O("make-first-eye", "做眼", "黑先：补住缺口，让左上角形成一个真眼。", "补住外壁后，内部空点四周均为黑棋，且角部对角没有缺陷，因此形成真眼。", "life", eyeShape, [[1, 2]], { kind: "make-eye", label: "做出一个真眼", targetColor: 1, anchors: [[0, 0]], maxPlayerMoves: 1, region: { top: 0, left: 0, bottom: 2, right: 2 } }, "观察哪一处是外壁缺口，而不是把眼位本身填掉。"),
  ],
  2: [
    K("double-atari", "局部战术", "一手棋同时使对方两块不相连的棋都只剩一气，称为什么？", ["双打吃", "双活", "扭十字", "逆收"], 0, "双打吃同时攻击两块独立棋，对方通常只能先救一边。"),
    K("cut-purpose", "局部战术", "“切断”的核心收益是什么？", ["让对方分成不能共享气的棋块", "让自己的棋自动变成活棋", "立刻增加贴目", "跳过对方一手"], 0, "切断让对方各块分别处理气与联络，常制造攻击或先手。"),
    K("ladder-prerequisite", "征子", "读征子前最先要检查什么？", ["逃跑路线附近是否有接应子", "棋盘有多少星位", "双方年龄", "贴目是否为整数"], 0, "征子成败常由远处接应子改变，所以不能只看局部锯齿形。"),
    K("net-concept", "枷", "“枷”与连续打吃相比，最典型的特点是什么？", ["用较宽的包围限制逃路", "每手都必须紧贴", "一定发生在角上", "只能提一枚棋"], 0, "枷通常不逐手贴身追赶，而是预先罩住逃跑方向。"),
    C("double-atari-point", "双打吃", "黑先。两枚白棋目前各有两口气；选择一手同时把它们都压到一气。", "落在两块白棋的共同气后，不会立即提子，但左右白棋都会只剩各自外侧的一气，这才是严格的双打吃。", "tesuji", doubleAtariShape, [[3,3],[3,1],[3,5],[1,3]], [0], "正确着法落下后应满足：提子数为 0，两块白棋的气数都等于 1。"),
    C("cut-point", "切断", "黑先。白棋试图在中央联络，哪个候选点是双方的断点？", "占住中央共同接触点后，白棋两边不能直接连成一块。", "cut", [[3,2,2],[2,3,2],[3,4,2],[2,2,1],[2,4,1],[4,3,1]], [[3,3],[1,3],[4,2],[4,4]], [0], "找双方都最想占据的连接要点。"),
    C("ladder-first-hit", "征子", "黑先。白棋只有右、下两口气；局面沿主对角线完全对称，哪些打吃都能启动无接应征子？", "右侧与下方两手互为镜像，都会迫使白棋沿锯齿线逃跑；本题明确接受两种等价起手。", "ladder", [[3,3,2],[2,3,1],[3,2,1],[4,4,1]], [[3,4],[4,3],[2,2],[5,5]], [0,1], "先确认两手都落在白棋当前的气上，并注意右下黑子使两条变化互为镜像。"),
    C("net-vital", "枷", "黑先。若直接在白棋的上方或左侧打吃，白棋会沿另一侧逃跑；哪个候选是同时控制两条逃路的枷要点？", "黑棋先落在两条逃路的斜向交会处。白若向左长，黑封左后再封上；白若向上长，次序完全对称，最终都被收网。", "net", netShape, [[2,2],[2,3],[3,2],[1,1]], [0], "枷通常不是立即打吃；寻找能同时照顾两条逃路的斜向要点。"),
    O("two-step-capture", "动态提子", "黑先：白子有两口气。局部 AI 会寻找应手；请在两手内把目标白子提掉。", "先封一口气后，局部 AI 会尝试抵抗；系统按目标棋是否被真正提掉判定。", "capture", twoStepCaptureShape, [[2,3],[3,2]], { kind: "capture-target", label: "两手内提掉白子", targetColor: 2, anchors: [[2,2]], maxPlayerMoves: 2, region: { top: 0, left: 0, bottom: 4, right: 4 } }, "两口气都要封住；对称的两种次序都可行。"),
    O("save-to-three", "动态救棋", "黑先：救出被打吃的黑子；棋块达到至少三口气即获胜。", "成功标准是目标棋块的实际气数，不是固定答案坐标。", "save", saveShape, [[3,4]], { kind: "save-target", label: "救活并达到三气", targetColor: 1, anchors: [[3,3]], minLiberties: 3, maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "先占唯一气位，再留意 AI 的压迫方向。"),
  ],
  3: [
    K("kosumi-name", "棋形名称", "两枚同色棋斜对角紧邻的走法通常称为什么？", ["尖", "大飞", "拆边", "扭羊头"], 0, "“尖”是斜向一格的紧密棋形，联络坚实但速度较慢。"),
    K("keima-name", "棋形名称", "相对已有棋子横一格、纵两格（或旋转等价）的棋形叫什么？", ["小飞", "大飞", "长", "立"], 0, "小飞就是围棋中的小桂马步，兼顾速度和联络。"),
    K("ogeima-name", "棋形名称", "相对已有棋子横一格、纵三格（或旋转等价）的棋形叫什么？", ["大飞", "小飞", "尖", "扳"], 0, "大飞跨度比小飞更大，速度快但中间更容易被侵分。"),
    K("hane-name", "棋形名称", "贴着对方棋子，从其行进方向侧面绕头压住的手法通常称什么？", ["扳", "长", "粘", "虎"], 0, "“扳”是在接触战中绕到对方头上或侧面，常与长、断、粘一起阅读。"),
    C("choose-kosumi", "尖", "以中央黑子为基准，选择能形成“尖”的所有候选点。", "斜对角一格都是尖；本题两个标定方向棋理等价，所以同时接受。", "shape", [[3,3,1]], [[2,2],[2,4],[3,5],[0,0]], [0,1], "尖是斜向一格，不是横向跳。"),
    C("choose-keima", "小飞", "以中央黑子为基准，哪个候选点形成小飞？", "标定点与原棋构成一格加两格的桂马偏移。", "shape", [[3,3,1]], [[1,4],[0,4],[2,4],[3,5]], [0], "比较行、列坐标差的绝对值。"),
    C("choose-ogeima", "大飞", "以中央黑子为基准，哪个候选点形成大飞？", "标定点与原棋形成一格加三格的偏移，比小飞多跨一格。", "shape", [[3,3,1]], [[0,4],[1,4],[2,4],[3,5]], [0], "大飞的长边跨度为三格。"),
    C("tiger-mouth", "虎口", "黑先。选择能与现有黑棋构成完整虎口、保护中央连接的候选点。", "虎口由三枚棋围住一个内部空点；补齐外侧棋可形成强联络。", "shape", [[2,3,1],[3,2,1]], [[3,4],[2,4],[4,3],[1,2]], [0], "先找两枚黑棋共同围绕的内部空点，再补齐第三边。"),
    O("shape-connect", "棋形实战", "黑先：不限定手筋名称，把两枚标记黑棋实际连成同一块。", "判定依据是两枚锚点是否属于同一个连通棋块。", "connect", connectionShape, [[3,3]], { kind: "connect-targets", label: "连接两块黑棋", targetColor: 1, anchors: [[3,2],[3,4]], maxPlayerMoves: 1, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "直接连接比外侧漂亮棋形更优先。"),
    O("eye-shape", "眼形", "黑先：补好外壁，在角部做出一个真眼。", "本题按眼位四周和对角缺陷共同检查，不把外观像眼的假眼算成功。", "life", eyeShape, [[1,2]], { kind: "make-eye", label: "形成真眼", targetColor: 1, anchors: [[0,0]], maxPlayerMoves: 1, region: { top: 0, left: 0, bottom: 2, right: 2 } }, "不要把眼位本身填掉；要补外壁。"),
  ],
  4: [
    K("true-eye", "死活", "一个空点要成为真眼，最关键的条件是什么？", ["对方不能通过破坏连接或对角缺陷合法占住它", "周围必须正好四枚棋", "必须位于星位", "眼内必须先放一枚棋"], 0, "真眼不仅看上下左右，还要检查边界与对角缺陷；可被对方破坏的常是假眼。"),
    K("false-eye", "死活", "“假眼”最准确的理解是哪一项？", ["看似被围住，但连接有缺陷，对方可迫使其失去眼形", "所有边上的眼", "任何超过一目的空地", "双方都不能落子的点"], 0, "假眼的外形像眼，却不能稳定贡献眼位；常因对角断点或包围棋自身受打吃。"),
    K("two-eyes", "死活", "通常为什么两只彼此独立的真眼可以确保一块棋存活？", ["对方无法同时填掉两个眼而保持落子有气", "两眼自动多算贴目", "规则禁止在角上落子", "两眼会把对方棋变色"], 0, "要提整块棋必须填完所有气；面对两个独立真眼，最后一眼会构成自杀，因此无法强行提掉。"),
    K("knife-five", "死活术语", "“刀把五”通常指什么？", ["由五个空点构成、形似刀把的死活眼形", "五连星布局", "连续提五子", "五路棋盘"], 0, "刀把五是常见眼形名称，死活结论要结合要点、先后手与外气判断，不能只凭轮廓。"),
    C("false-eye-vital", "破假眼", "白先。黑棋角部看似有眼，但下方连接有缺陷；选择侵入要点。", "白棋进入要点后仍能通过下方缺口保持有气，说明这个外形并不是真眼。", "kill", [[0,1,1],[1,0,1],[1,2,1],[2,2,2]], [[1,1],[0,2],[2,0],[3,3]], [0], "检查内部空点能否通过缺口获得气。", 7, 2),
    C("vital-point-eye", "死活要点", "黑先。目标是在角部做活，哪个候选点是补全眼形的要点？", "补外壁而保留内部眼位，是本题做活的关键次序。", "life", eyeShape, [[1,2],[1,1],[3,1],[3,3]], [0], "区分“眼位”和“围成眼的外壁”。"),
    C("reduce-eye-space", "缩眼", "白先。黑棋眼位右侧尚未封闭，选择能最大限度压缩其眼形的候选点。", "从缺口进入眼形腹部要点，可同时影响多个成眼分支，比从外围碰撞更直接。", "kill", [[1,1,1],[1,2,1],[1,3,1],[2,1,1],[3,1,1],[3,2,1],[3,3,1]], [[2,2],[0,2],[2,4],[4,2]], [0], "从右侧缺口进入眼形内部。", 7, 2),
    C("life-multiple-routes", "做活多解", "黑先。只要求增加眼形空间；两个对称扩张点都可接受。", "局部完全对称时，两个扩张点棋理等价。本题明确保留多解。", "life", [[3,3,1],[2,3,1],[4,3,1],[3,2,2]], [[2,4],[4,4],[3,4],[1,1]], [0,1], "遇到对称局面，先确认题目是否允许等价答案。"),
    O("make-real-eye", "动态做眼", "黑先：系统将检查真实眼形；补成至少一个真眼即胜。", "成功由棋盘结构判断，不因落在某个预设点就机械判对。", "life", eyeShape, [[1,2]], { kind: "make-eye", label: "做出真眼", targetColor: 1, anchors: [[0,0]], maxPlayerMoves: 1, region: { top: 0, left: 0, bottom: 2, right: 2 } }, "补外壁，保留内部空点。"),
    O("break-false-eye", "动态破眼", "白先：利用下方缺口，占据黑棋假眼的要点即胜。", "本题按白棋是否实际合法占住标记要点判定。", "kill", [[0,1,1],[1,0,1],[1,2,1],[2,2,2]], [[1,1]], { kind: "occupy-vital", label: "占据假眼要点", targetColor: 2, anchors: [[2,2]], goalPoints: [[1,1]], maxPlayerMoves: 2, region: { top: 0, left: 0, bottom: 3, right: 3 } }, "要点在三枚黑棋围出的内部，下方仍有气。", 7, 2),
  ],
  5: [
    K("joseki-purpose", "定式", "学习定式最合理的目标是什么？", ["理解双方在特定角部接触下的平衡选择与后续方向", "背下后任何局面照抄", "保证角部一定获利", "避免计算局部变化"], 0, "定式是局部经验，不是脱离全盘的固定答案；外势、边空与征子关系都会改变选择。"),
    K("approach-move", "角部术语", "对方占据角部后，从附近施加压力并寻求发展通常称什么？", ["挂角", "收官", "停一手", "打劫材"], 0, "挂角是接近对方角部棋子，限制其守角并争取边部发展。"),
    K("pincer", "角部术语", "对挂角棋从另一侧限制其展开，通常称什么？", ["夹攻", "粘", "倒扑", "双活"], 0, "夹攻压缩挂角棋的根据，并把战斗引向边或中央。"),
    K("joseki-direction", "定式判断", "选择定式分支前，除局部手段外最该观察什么？", ["相邻两边的己方配置与全盘方向", "棋子颜色深浅", "计时器位置", "上一盘结果"], 0, "同一角部手法在不同边上可能价值相反，必须结合全盘配置。"),
    C("approach-choice", "挂角方向", "黑先。白棋占左上角，白方援军在上边，黑方援军在左下；应从哪一侧挂角，避免主动靠近白方援军？", "从左边下方挂角，背后有黑方援军，也远离白方上边配置；本题的方向由盘上援军明确限定。", "joseki", [[1,1,2],[1,5,2],[5,1,1]], [[3,1],[1,3],[0,6],[6,6]], [0], "先找白方援军所在边，再从另一侧接近。"),
    C("pincer-choice", "夹攻", "黑先。白棋已挂角，哪个候选点能从外侧夹住它的发展？", "夹攻点位于挂角棋外侧，限制其沿边展开。", "joseki", [[1,1,1],[1,3,2]], [[1,5],[3,3],[3,1],[5,5]], [0], "沿挂角棋准备展开的边寻找限制点。"),
    C("joseki-connect", "定式联络", "黑先。接触战后黑棋有明显断点；选择最直接的粘。", "定式变化首先要保证棋块联络；粘住断点后再谈外势与目数。", "joseki", connectionShape, [[3,3],[2,2],[2,4],[5,3]], [0], "对方下一手能切断的位置，就是优先粘的点。"),
    C("joseki-hane", "扳", "黑先。双方贴靠后，选择从白棋侧面绕头的“扳”。", "扳紧贴对方并改变其行进方向；本题其余点分别是长、跳或脱先。", "joseki", [[3,3,1],[3,4,2]], [[2,4],[3,2],[1,3],[5,5]], [0], "扳要与对方棋正交接触，并位于其侧前方。"),
    O("joseki-rescue", "定式后续", "黑先：局部 AI 会压迫断点；请把两块黑棋连成一块。", "定式不是背坐标，系统按实际连通关系判定。", "connect", connectionShape, [[3,3]], { kind: "connect-targets", label: "完成联络", targetColor: 1, anchors: [[3,2],[3,4]], maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "先处理最直接的断点。"),
    O("joseki-capture", "定式手筋", "黑先：在两手内提掉角部目标白子，局部 AI 会尝试应对。", "根据实际提子判胜，可以选择对称的封气次序。", "capture", twoStepCaptureShape, [[2,3],[3,2]], { kind: "capture-target", label: "提掉目标白子", targetColor: 2, anchors: [[2,2]], maxPlayerMoves: 2, region: { top: 0, left: 0, bottom: 4, right: 4 } }, "先封气，不要被外围花哨手段分散注意。"),
  ],
  6: [
    K("snapback", "手筋", "“倒扑”最典型的过程是什么？", ["故意送一子，让对方提后再回提更大一块", "连续在同一点停一手", "从角上直接大飞", "双方互不侵犯形成双活"], 0, "倒扑利用提子后出现的新气紧关系，以小牺牲换取更大的回提。"),
    K("connect-and-die", "手筋", "“接不归”描述的是哪类局面？", ["对方看似能连接，实际一接仍会整体被提", "两块棋永远不能相遇", "棋盘网络断线", "官子必须后手"], 0, "接不归是气紧手筋：连接反而把棋并成无气或少气的大块。"),
    K("twisting-sheep", "围棋俚语", "“扭羊头”通常形容什么？", ["用连续强制手追赶，使目标棋难以逃脱的吃子过程", "角部守地的固定手", "双方各做两眼", "终局数子方式"], 0, "扭羊头是形象化的追击说法，重点仍是逐手数气与检查远方接应。"),
    K("tesuji-definition", "手筋", "所谓“手筋”更接近哪种含义？", ["在局部达成目标的精妙高效着法", "任何第一手棋", "固定不能改变的规则", "只用于收官的点"], 0, "手筋强调局部效率，常结合弃子、紧气、先手与棋形弱点。"),
    C("snapback-point", "倒扑", "黑先。白棋大块只有 A 与中央两口气；哪个候选可以先自陷一气，诱使白从 A 提掉后再回到原点倒扑？", "黑在中央投入一子后，白若从左侧提掉它，整块白棋便只剩中央这一气；黑随即回提。白若不提，黑下一手也可直接收掉最后一气。", "tesuji", snapbackShape, [[3,3],[0,0],[0,6],[6,6]], [0], "正确点落下后，黑子自身与白棋大块都只剩左侧同一个气点。"),
    C("connect-and-die-point", "接不归", "黑先。左右两枚白棋之间可在中央连接；从哪些外侧先打吃，白即使连接也仍只剩另一侧一气？", "从左或右外侧打吃互为镜像。白在中央连接后，三枚白棋仍只有另一端一气，黑下一手即可整体提掉。", "tesuji", shortageShape, [[3,1],[3,5],[3,3],[0,0]], [0,1], "连接前分别数气，再计算中央连接后整块棋还剩几气。"),
    C("ladder-breaker", "征子接应", "白先。白棋正在被征，哪个候选点能作为远方征子接应？", "接应点进入未来逃跑路线，使追击方继续打吃时发生反打或连接。", "ladder", [[3,3,2],[2,3,1],[3,2,1],[4,4,1]], [[1,5],[5,1],[0,0],[6,6]], [0], "沿锯齿逃跑方向向前检查。", 7, 2),
    C("shortage-finish", "接不归后续", "黑先。白已经在中央连接，但整块仍只有右侧一口气；选择完成提子的候选点。", "连接并没有增加有效气：右端最后一气被占后，三枚白棋会一起离开棋盘。", "tesuji", shortageConnectedShape, [[3,5],[1,1],[5,5],[0,6]], [0], "不要被白棋已经连接的外观迷惑，直接重数整块棋的气。"),
    O("tesuji-capture", "动态倒扑", "黑先：先投入一子。Tim 会按最顽强方式应对；请在两手内用倒扑提掉标记白棋。", "Tim 通常会从左侧提掉投入子；此时回到中央即可一次提走整块白棋。系统按真实提子结果判断。", "tesuji", snapbackShape, [[3,3]], { kind: "capture-target", label: "两手内完成倒扑", targetColor: 2, anchors: [[2,2]], maxPlayerMoves: 2, region: { top: 0, left: 0, bottom: 6, right: 6 } }, "第一手中央投入；若 Tim 提掉它，就在同一点回提。"),
    O("tesuji-save", "动态接不归", "黑先：从一侧打吃。Tim 可以尝试连接或另寻应手；请在两手内提掉左侧标记白棋。", "白在中央连接后仍然只有另一端一气；若白不连接，中央本身就是左侧白棋的最后一气。", "capture", shortageShape, [[3,1],[3,5]], { kind: "capture-target", label: "两手内完成接不归", targetColor: 2, anchors: [[3,2]], maxPlayerMoves: 2, region: { top: 1, left: 0, bottom: 5, right: 6 } }, "先从任一外侧打吃，再根据 Tim 是否连接选择收气点。"),
  ],
  7: [
    K("ko-rule", "劫争", "单劫中为什么不能立即在原点回提？", ["会立刻重复上一局面，规则要求先在别处走一手", "因为回提永远是自杀", "因为劫只允许白棋提", "因为角上不能提子"], 0, "打劫方需先找劫材，迫使对方应手后才可能回来提劫。"),
    K("ko-threat", "劫材", "好的劫材至少应满足什么？", ["对方若不应，会遭受足够大的实际损失", "一定在棋盘中央", "必须能提十子", "只能由落后方使用"], 0, "劫材价值要与劫的价值匹配；虚假威胁可以被忽略。"),
    K("semeai", "对杀", "对杀判断最基础的比较对象是什么？", ["双方外气、公共气、眼与先后手", "双方棋子颜色数量", "谁先占星位", "棋盘边框宽度"], 0, "单纯总气数还不够，公共气和眼会改变收气顺序。"),
    K("seki", "双活", "双活通常为何双方都不能轻易填掉共享气？", ["先填的一方可能使自己的棋先无气", "规则禁止共享气", "双方自动各得两眼", "贴目相同"], 0, "双活依靠互相牵制存在；若一方先动破坏平衡，往往自己先被提。"),
    C("ko-capture", "劫形", "黑先。选择能提一子并形成单劫的候选点。", "落子只提一子且留下可回提的紧气形，形成单劫；随后禁止白立即回提。", "tesuji", [[3,3,2],[2,3,1],[4,3,1],[3,2,1],[2,4,2],[4,4,2],[3,5,2]], [[3,4],[1,1],[5,5],[0,6]], [0], "检查提后黑子是否也只剩一气。"),
    C("ko-threat-choice", "劫材", "白方正在打大劫；哪个候选能把两枚相连黑棋压到只剩一气，形成“不应就会被提”的真实威胁？", "白落在右侧后，黑棋不会立刻被提，但只剩下方一气；黑若无视，白下一手从下方可提两子。", "tesuji", [[3,3,1],[3,4,1],[2,3,2],[4,3,2],[3,2,2],[2,4,2]], [[3,5],[0,0],[6,6],[1,5]], [0], "劫材不是已经兑现的收益；正确点应先形成明确且足够大的后续威胁。", 7, 2),
    C("semeai-liberty", "对杀", "黑先。双方各有一口外气，并共享中央一气；应先收哪一个候选，才能在白收黑外气后占中央提白？", "先收白棋右侧外气。白若收黑棋左侧外气，黑再占中央共享气即可提白；若黑先填中央，白可向右长出逃走。", "capturing-race", capturingRaceShape, [[3,5],[3,3],[3,1],[1,1]], [0], "先收对方外气，公共气最后收。"),
    K("seki-status", "双活确认", "终局确认两块棋依靠共享气形成双活时，应如何处理？", ["双方都按活棋保留，不把其中一块当死子提走", "先手方必须填掉共享气", "两块棋全部移出棋盘", "共享气自动变成劫"], 0, "双活中的双方棋块都不能被单方面强行提净，因此都按活棋保留；共享空点如何计分取决于具体规则，但不能擅自把活棋当死子。"),
    O("semeai-kill", "动态对杀", "黑先：Tim 会抢你的左侧外气；请按“外气优先、公共气最后”的次序，两手内提掉标记白子。", "黑先收白外气，Tim 最强应手是收黑外气，随后黑占中央公共气完成提子。每一步都按真实气数判定。", "capturing-race", capturingRaceShape, [[3,5]], { kind: "capture-target", label: "对杀中先提白子", targetColor: 2, anchors: [[3,4]], maxPlayerMoves: 2, region: { top: 1, left: 0, bottom: 5, right: 6 } }, "右侧是白外气，中央是公共气；次序不能颠倒。"),
    O("ko-save-group", "劫后处理", "黑先：先不管劫形，把被打吃的目标棋救到三气以上。", "目标练习把必须处理的急所与复杂劫争分开，按实际气数判定。", "save", saveShape, [[3,4]], { kind: "save-target", label: "目标棋达到三气", targetColor: 1, anchors: [[3,3]], minLiberties: 3, maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "被打吃的棋通常比一般劫材更急。"),
  ],
  8: [
    K("gold-corner-silver-side", "布局俚语", "“金角银边草肚皮”主要表达什么？", ["围地效率通常角最高、边次之、中央最低", "角上的棋价值固定是三倍", "中央永远不能下", "只适用于九路棋盘"], 0, "角利用两条天然边界，围地最省子；边利用一条，中央需要更多棋形成边界。它是效率原则，不是禁令。"),
    K("urgent-before-big", "布局原则", "“急所先于大场”是什么意思？", ["影响棋块安危或攻防节奏的急手，常优先于单纯扩张的大点", "所有打吃都必须回应", "大场永远没有价值", "只下局部不看全盘"], 0, "大场价值高，但若弱棋将遭到严厉攻击，急所可能更优先。"),
    K("corner-side-center", "布局效率", "为何开局常先占角？", ["角部借两条边界更容易建立根据和实地", "角上棋子气更多", "规则要求前四手在角上", "角上不能被入侵"], 0, "先角后边是常见效率逻辑，但全盘配合与战斗需要仍可改变次序。"),
    K("thickness-direction", "厚势", "使用厚势时更合理的方向是什么？", ["把对方赶向自己的厚势，己方从厚势向开阔处发展", "紧贴厚势重复补棋", "用厚势围很小的目", "主动把弱棋赶向空旷处"], 0, "厚势的价值在影响力与攻击支援，避免低效地贴着厚势围小空。"),
    C("corner-first", "布局", "黑先。空棋盘上，本题目标是最高效建立根据；请选择角部候选。", "角部利用两条边界，围地与做活效率高于同等距离的边腹。", "opening", [], [[1,1],[1,3],[3,3],[5,5]], [0,3], "棋盘对称时，两个等价角点都接受。"),
    C("urgent-group", "急所", "黑先。中央黑棋被打吃，另有角部大场；本题应先处理哪个候选？", "弱棋只剩一气，先救棋是急所；抢角虽大，却会让整块棋立即被提。", "whole-board", saveShape, [[3,4],[0,0],[0,6],[6,6]], [0], "先检查是否存在下一手就会发生的损失。"),
    C("extend-from-corner", "拆边", "黑先。已有角部黑棋，本题目标是沿空旷边扩张；选择合理拆边点。", "沿边保持适当间隔可兼顾围地和联络；直接贴住角棋速度过慢。", "opening", [[1,1,1],[5,5,2]], [[1,4],[3,3],[5,1],[0,0]], [0], "从己方角部向较空的一边展开。"),
    C("approach-open-corner", "挂角", "黑先。白方只有一个角部根据；从没有白方援军的一侧挂角。", "从开阔侧挂角，减少被夹攻时落入对方厚势的风险。", "opening", [[1,1,2],[1,5,2],[5,5,1]], [[3,1],[1,3],[5,1],[3,5]], [0], "观察两个挂角方向背后的援军。"),
    O("opening-connect-weak", "布局急所", "黑先：全盘大场很多，但先把两块弱棋连成一块。", "系统按连通关系判定，训练急所先于大场的执行。", "whole-board", connectionShape, [[3,3]], { kind: "connect-targets", label: "连接两块弱棋", targetColor: 1, anchors: [[3,2],[3,4]], maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "先解决断点，再考虑空旷大场。"),
    O("opening-save-weak", "弱棋处理", "黑先：在局部 AI 压迫下，把弱棋扩展到三气以上。", "布局方向建立在棋块安全之上；按实际气数达标。", "save", saveShape, [[3,4]], { kind: "save-target", label: "弱棋达到三气", targetColor: 1, anchors: [[3,3]], minLiberties: 3, maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "唯一气位是当前最急点。"),
  ],
  9: [
    K("attack-for-profit", "中盘方向", "成熟的攻击通常追求什么？", ["借攻击获得外势、实地或先手，而非执着吃光目标", "每块弱棋都必须杀死", "只在中央追棋", "主动制造自己的弱棋"], 0, "攻击的收益可以是逼迫、封锁、筑厚或抢先手；盲目追杀常让目标轻松腾挪。"),
    K("light-vs-heavy", "轻重", "“弃轻救重”中的重棋通常具有什么特征？", ["投入子数多、牵连大且难以灵活舍弃", "棋子颜色更深", "位于棋盘下方", "已经有两眼"], 0, "轻棋可灵活舍弃或转换，重棋一旦被攻会拖累全局。"),
    K("sabaki", "腾挪", "腾挪的核心思路更接近哪一项？", ["在对方势力中用轻灵手段取得安定或交换", "把所有棋连成一条", "只用打吃追赶", "拒绝任何弃子"], 0, "腾挪常利用碰、靠、弃子和转换，不要求每枚棋都安全回家。"),
    K("direction-of-play", "大局观", "选择中盘进攻方向时，通常希望把对方弱棋赶向哪里？", ["己方厚势或援军方向", "对方最坚固的厚势", "完全空旷且无己方棋处", "任意方向都一样"], 0, "借己方厚势攻击更有支援，同时避免把对方赶向安全区。"),
    C("attack-toward-thickness", "攻击方向", "黑先。右侧有黑厚势；选择把白棋赶向该厚势的攻击点。", "从相反一侧施压，迫使白棋向黑方援军方向移动。", "middle-game", [[3,3,2],[2,5,1],[3,5,1],[4,5,1]], [[3,2],[2,3],[4,3],[1,1]], [0], "攻击落点通常位于目标逃跑方向的反侧。"),
    C("separate-groups", "分断", "黑先。两块白棋若会合将变强；选择中央分断点。", "占据会合点使两块白棋分别处理，黑方可保持攻击主动。", "cut", [[3,2,2],[3,4,2],[2,3,1],[4,3,1]], [[3,3],[1,1],[5,5],[0,6]], [0], "找双方连接路线最窄的交叉点。"),
    C("light-sacrifice", "轻重转换", "黑先。目标是救右侧重棋；哪手先连接主力，而非回头救孤立一子？", "连接投入更多的主力棋块，放弃轻子可避免全盘一起变重。", "middle-game", [[3,2,1],[3,4,1],[1,1,1],[2,3,2],[4,3,2]], [[3,3],[1,2],[0,1],[5,5]], [0], "比较各块投入子数和逃跑后的负担。"),
    C("reduce-moyo", "打入与浅消", "黑先。白方边上势力较厚；本题目标是低风险浅消，选择靠近外沿的候选。", "浅消保持退路，以限制模样规模为主；深入腹地会承受更强攻击。", "middle-game", [[1,1,2],[1,5,2],[3,1,2],[3,5,2]], [[4,3],[2,3],[1,3],[6,3]], [0], "浅消通常比打入更靠外、更容易撤退。"),
    O("middle-connect", "动态治孤", "黑先：局部 AI 会抢断点；请把两块主力黑棋连接起来。", "只要锚点真正成为同一块棋即可，允许不同合法次序。", "connect", connectionShape, [[3,3]], { kind: "connect-targets", label: "连接主力棋块", targetColor: 1, anchors: [[3,2],[3,4]], maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "优先处理最窄断点。"),
    O("middle-capture", "动态攻击", "黑先：局部 AI 会腾挪；在两手内提掉目标白子。", "系统按最终棋盘判定，不要求照抄唯一变化。", "kill", twoStepCaptureShape, [[2,3],[3,2]], { kind: "capture-target", label: "提掉目标白子", targetColor: 2, anchors: [[2,2]], maxPlayerMoves: 2, region: { top: 0, left: 0, bottom: 4, right: 4 } }, "先数气，再选择封锁次序。"),
  ],
  10: [
    K("sente-gote", "官子", "官子中的“先手”通常意味着什么？", ["走完后对方大多必须回应，自己仍有机会先走别处", "必须由黑棋先下", "这一手一定最大", "落子后立刻终局"], 0, "先手价值包含保持行动权，但仍需核实对方是否真的必须回应。"),
    K("reverse-sente", "官子", "“逆收”为什么常比普通后手官子更有价值？", ["既抢到当前目数，又阻止对方原本的先手收束", "可以取消贴目", "一定能提子", "只能在最后一手使用"], 0, "逆收剥夺对方先手官子，价值包含双方先走结果的差。"),
    K("count-endgame", "官子计算", "比较两个官子大小时，更可靠的方法是什么？", ["比较双方先走后的最终目数差，并考虑先后手", "只看落子离角多近", "只数吃掉几枚棋", "优先走看起来最大的空点"], 0, "官子价值来自局部最终结果差，先手、逆收与劫材价值还会进一步修正。"),
    K("review-turning-point", "复盘", "高效复盘最值得优先检查什么？", ["形势明显波动、目标判断改变或漏算强制手的转折处", "从第一手起逐字抄答案", "只看最后输赢", "只找对方失误"], 0, "记录当时判断，再对比更好选择，才能把复盘转化为下一盘可执行的改进。"),
    C("largest-endgame", "官子大小", "黑先。A 能净增四目，B 约两目，C 是单官，D 为无效自填；应选哪项？", "在没有更紧急先手的前提下，先走净收益最大的 A。", "endgame", [[1,1,1],[1,2,1],[2,1,1],[5,5,2],[5,4,2],[4,5,2]], [[1,3],[5,3],[3,3],[0,0]], [0], "先比较双方先走后的完整差值。"),
    C("reverse-sente-point", "逆收", "白方下一手可在 A 先手收束；黑先应选择哪个候选完成逆收？", "先占 A 同时获得当前利益并消除白方先手机会。", "endgame", [[2,2,1],[2,3,2],[3,2,1],[3,3,2]], [[1,3],[5,5],[0,0],[3,5]], [0], "找对方本来可以先手利用的位置。"),
    C("sente-check", "先手验证", "黑先。哪个候选落下后不会立即提子，却会让中央白棋只剩一气，形成必须回应的打吃？", "标定点只封掉白棋两口气中的一口，落子后提子数仍为零、白棋恰剩一气；这才是可验证的先手威胁。", "endgame", atariShape, sharedCandidates, [0], "区分“打吃”和“已经提子”：正确答案落下后白棋仍在盘上。"),
    C("whole-board-urgent", "全盘排序", "黑先。角部有大官子，但中央黑棋被打吃；本题最急候选是哪一项？", "若先抢官子，中央棋会立即被提；救棋的即时损失远大于普通目数。", "whole-board", saveShape, [[3,4],[0,0],[0,6],[6,6]], [0], "先排除下一手就会造成不可逆损失的局部。"),
    O("endgame-connect", "收官安全", "黑先：收官前先补断点，把两块黑棋连成一块。", "系统依据实际连通判定，避免只记补棋坐标。", "endgame", connectionShape, [[3,3]], { kind: "connect-targets", label: "补净断点", targetColor: 1, anchors: [[3,2],[3,4]], maxPlayerMoves: 2, region: { top: 1, left: 1, bottom: 5, right: 5 } }, "先确认对方能否切断。"),
    O("endgame-capture", "收官手筋", "黑先：局部 AI 会寻找抵抗；两手内完成提子。", "按实际提子结果判胜，用于检验收官阶段的气数阅读。", "endgame", twoStepCaptureShape, [[2,3],[3,2]], { kind: "capture-target", label: "两手内提子", targetColor: 2, anchors: [[2,2]], maxPlayerMoves: 2, region: { top: 0, left: 0, bottom: 4, right: 4 } }, "先紧外气，再看 AI 应手。"),
  ],
};

function transformPoint(point: GoPoint, size: number, variant: number): GoPoint {
  const max = size - 1;
  if (variant === 1) return { row: point.col, col: max - point.row };
  if (variant === 2) return { row: max - point.row, col: max - point.col };
  if (variant === 3) return { row: max - point.col, col: point.row };
  if (variant === 4) return { row: point.row, col: max - point.col };
  if (variant === 5) return { row: point.col, col: point.row };
  return point;
}

function transformRegion(region: GoPuzzleObjective["region"], size: number, variant: number) {
  const corners = [
    { row: region.top, col: region.left },
    { row: region.top, col: region.right },
    { row: region.bottom, col: region.left },
    { row: region.bottom, col: region.right },
  ].map((point) => transformPoint(point, size, variant));
  return {
    top: Math.min(...corners.map((point) => point.row)),
    left: Math.min(...corners.map((point) => point.col)),
    bottom: Math.max(...corners.map((point) => point.row)),
    right: Math.max(...corners.map((point) => point.col)),
  };
}

function buildKnowledge(seed: KnowledgeSeed, level: number, variant: number): GoChoiceQuestion {
  const offset = variant % seed.options.length;
  const options = [...seed.options.slice(offset), ...seed.options.slice(0, offset)];
  return {
    id: `go-l${level}-${seed.family}-v${variant + 1}`,
    family: seed.family,
    category: seed.category,
    prompt: seed.prompt,
    explanation: seed.explanation,
    type: "choice",
    options,
    correct: (seed.correct - offset + seed.options.length) % seed.options.length,
  };
}

function buildBoard(seed: CandidateSeed | ObjectiveSeed, level: number, variant: number): GoBoardQuestion {
  const transform = (tuple: PointTuple) => transformPoint({ row: tuple[0], col: tuple[1] }, seed.boardSize, variant);
  const stones: GoSetupStone[] = seed.stones.map(([row, col, color]) => ({ ...transform([row, col]), color }));
  const candidateMoves: GoCandidatePoint[] | undefined = seed.kind === "candidate"
    ? seed.candidates.map((tuple, index) => ({ ...transform(tuple), label: ["A", "B", "C", "D"][index] as GoCandidatePoint["label"] }))
    : undefined;
  const correctMoves = seed.kind === "candidate"
    ? seed.correct.map((index) => transform(seed.candidates[index]))
    : seed.knownStarts.map(transform);
  const objective: GoPuzzleObjective | undefined = seed.kind === "objective" ? {
    ...seed.objective,
    anchors: seed.objective.anchors.map(transform),
    goalPoints: seed.objective.goalPoints?.map(transform),
    region: transformRegion(seed.objective.region, seed.boardSize, variant),
  } : undefined;
  return {
    id: `go-l${level}-${seed.family}-v${variant + 1}`,
    family: seed.family,
    category: seed.category,
    prompt: seed.prompt,
    explanation: seed.explanation,
    type: "board",
    mode: seed.kind,
    task: seed.task,
    boardSize: seed.boardSize,
    stones,
    toPlay: seed.toPlay,
    solutionLines: correctMoves.map((move) => [move]),
    candidateMoves,
    objective,
    stepNotes: [seed.explanation],
    hint: seed.hint,
    success: seed.kind === "objective" ? `目标达成：${seed.objective.label}。${seed.explanation}` : `选择成立。${seed.explanation}`,
    failure: seed.kind === "objective" ? `本轮未能完成「${seed.objective.label}」。查看目标提示后可以换一种合法次序重练。` : "该候选不符合题目限定目标。绿色标记会显示全部可接受答案。",
    refutations: [],
  };
}

for (let level = 1; level <= 10; level += 1) {
  const seeds = levelSeeds[level];
  if (!seeds || seeds.length !== 10) throw new Error(`围棋第 ${level} 级必须正好包含 10 个独立教学主题。`);
  if (new Set(seeds.map((seed) => seed.family)).size !== seeds.length) throw new Error(`围棋第 ${level} 级存在重复主题。`);
}

export const goQuestionBanks: Record<number, GoQuestion[]> = Object.fromEntries(
  Object.entries(levelSeeds).map(([levelKey, seeds]) => {
    const level = Number(levelKey);
    const questions = seeds.flatMap((seed) => Array.from({ length: 6 }, (_, variant) => seed.kind === "knowledge"
      ? buildKnowledge(seed, level, variant)
      : buildBoard(seed, level, variant)));
    return [level, questions];
  }),
);

for (const questions of Object.values(goQuestionBanks)) {
  for (const question of questions) {
    if (question.type !== "board") continue;
    const board = createBoard(question.boardSize);
    const occupied = new Set<string>();
    for (const stone of question.stones) {
      const key = `${stone.row},${stone.col}`;
      if (occupied.has(key)) throw new Error(`${question.id} 有重复摆子。`);
      occupied.add(key);
      board[stone.row][stone.col] = stone.color;
    }
    for (const line of question.solutionLines) {
      const result = playMove(board, question.toPlay, line[0], [boardHash(board)]);
      if (!result.valid) throw new Error(`${question.id} 的已知可行起手非法：${result.reason ?? "未知原因"}`);
    }
    for (const candidate of question.candidateMoves ?? []) {
      if (board[candidate.row][candidate.col] !== 0) throw new Error(`${question.id} 的候选点压在已有棋子上。`);
    }
  }
}

export const goQuestionBankStats = {
  levels: 10,
  themesPerLevel: 10,
  variantsPerTheme: 6,
  total: Object.values(goQuestionBanks).reduce((sum, questions) => sum + questions.length, 0),
};

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function buildGoAttempt(level: number, familyFilter?: string[]) {
  const bank = goQuestionBanks[level] ?? goQuestionBanks[1];
  const availableFamilies = [...new Set(bank.map((question) => question.family))];
  const requestedFamilies = familyFilter?.length
    ? [...new Set(familyFilter)].filter((family) => availableFamilies.includes(family))
    : availableFamilies;
  return shuffle(requestedFamilies).flatMap((family) => {
    const variants = bank.filter((question) => question.family === family);
    return variants.length ? [variants[Math.floor(Math.random() * variants.length)]] : [];
  }).slice(0, 10);
}
