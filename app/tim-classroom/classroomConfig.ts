import type { DifficultyKey, Question, QuestionBank } from "./quizTypes";
import { convexQuestions } from "./convexQuestions";
import { graphQuestions } from "./graphQuestions";
import { loveQuestions } from "./loveQuestions";
import { sportsQuestions } from "./sportsQuestions";

export type CourseKey = "sports" | "graph" | "convex" | "love";

export type DifficultyProfile = {
  label: string;
  english: string;
  level: string;
  description: string;
  focus: string;
};

export type ReportDimension = {
  key: string;
  label: string;
  description: string;
  color: string;
  tip: string;
};

export type ReportProfile = {
  title: string;
  english: string;
  scoreLabel: string;
  disclaimer: string;
  dimensions: ReportDimension[];
  grades: Array<{ min: number; label: string; note: string }>;
};

export type CourseImages = {
  home: string;
  card: string;
  difficulty: string;
  quiz: [string, string, string, string, string, string, string, string, string, string];
  result: string;
};

export type Course = {
  key: CourseKey;
  eyebrow: string;
  title: string;
  shortTitle: string;
  description: string;
  detail: string;
  images: CourseImages;
  greetings: Record<DifficultyKey, string>;
  difficulties: Record<DifficultyKey, DifficultyProfile>;
  report: ReportProfile;
  questionBank: QuestionBank;
};

export type QuizQuestion = Question & {
  sourceIndex: number;
  dimensionKey: string;
};

export const difficultyOrder: DifficultyKey[] = ["middle", "university", "phd"];

export const courses: Course[] = [
  {
    key: "sports",
    eyebrow: "SPORT 101",
    title: "运动小课堂",
    shortTitle: "运动",
    description: "测试体育与训练判断力",
    detail: "规则 · 训练 · 运动科学",
    images: {
      home: "/tim-classroom/poses/sports-home.png",
      card: "/tim-classroom/tim-sports.png",
      difficulty: "/tim-classroom/poses/sports-level.png",
      quiz: [
        "/tim-classroom/poses/sports-q01.png",
        "/tim-classroom/poses/sports-q02.png",
        "/tim-classroom/poses/sports-q03.png",
        "/tim-classroom/poses/sports-q04.png",
        "/tim-classroom/poses/sports-q05.png",
        "/tim-classroom/poses/sports-q06.png",
        "/tim-classroom/poses/sports-q07.png",
        "/tim-classroom/poses/sports-q08.png",
        "/tim-classroom/poses/sports-q09.png",
        "/tim-classroom/poses/sports-q10.png",
      ],
      result: "/tim-classroom/poses/sports-result.png",
    },
    greetings: {
      middle: "普通人也能稳稳开局：先从赛场常识和运动安全开始。",
      university: "健身高手局：把训练原理放进具体情境里判断。",
      phd: "健身大师局：留意生理机制、测量和证据边界。",
    },
    difficulties: {
      middle: {
        label: "普通人",
        english: "EVERYDAY PLAYER",
        level: "日常体能",
        description: "从运动常识与安全判断出发",
        focus: "规则 · 习惯 · 基础体能",
      },
      university: {
        label: "健身高手",
        english: "FITNESS PRO",
        level: "训练进阶",
        description: "理解训练原理并迁移到情境",
        focus: "训练 · 恢复 · 运动生理",
      },
      phd: {
        label: "健身大师",
        english: "FITNESS MASTER",
        level: "运动科学",
        description: "挑战机制、测量与研究判断",
        focus: "机理 · 证据 · 方法论",
      },
    },
    report: {
      title: "运动能力报告",
      english: "ATHLETIC ABILITY PROFILE",
      scoreLabel: "运动能力指数",
      disclaimer: "本报告基于体育知识与训练判断题，仅反映本轮答题表现，不等同于体能测试、医疗评估或运动处方。",
      dimensions: [
        { key: "knowledge", label: "运动认知", description: "规则与运动概念理解", color: "#ff725c", tip: "多接触不同项目的基础规则，并尝试用自己的话复述。" },
        { key: "body", label: "身体机理", description: "生理与力学机制理解", color: "#ffb454", tip: "把肌肉、能量系统和力学概念放进具体动作中理解。" },
        { key: "training", label: "训练策略", description: "计划、强度与恢复判断", color: "#66d9b0", tip: "记录训练负荷和恢复感受，练习区分刺激与适应。" },
        { key: "judgment", label: "安全与证据", description: "风险识别与科学判断", color: "#7c86ff", tip: "看到绝对化结论时，先检查样本、误差与适用范围。" },
      ],
      grades: [
        { min: 90, label: "全能运动脑", note: "规则、训练和科学判断全部在线，Tim 认证你的运动知识很能打。" },
        { min: 70, label: "训练型选手", note: "你已经建立了可靠的运动认知，少数薄弱项补齐后会更全面。" },
        { min: 50, label: "潜力运动员", note: "基础已经热起来了，沿着报告中的弱项继续练会进步很快。" },
        { min: 0, label: "热身新秀", note: "这轮是能力热身。先看复盘，再抽一组新题就会更稳。" },
      ],
    },
    questionBank: sportsQuestions,
  },
  {
    key: "graph",
    eyebrow: "GRAPH 201",
    title: "图论小课堂",
    shortTitle: "图论",
    description: "测试图神经网络知识",
    detail: "图基础 · 消息传递 · GNN",
    images: {
      home: "/tim-classroom/poses/graph-home.png",
      card: "/tim-classroom/tim-study.png",
      difficulty: "/tim-classroom/poses/graph-level.png",
      quiz: [
        "/tim-classroom/poses/graph-q01.png",
        "/tim-classroom/poses/graph-q02.png",
        "/tim-classroom/poses/graph-q03.png",
        "/tim-classroom/poses/graph-q04.png",
        "/tim-classroom/poses/graph-q05.png",
        "/tim-classroom/poses/graph-q06.png",
        "/tim-classroom/poses/graph-q07.png",
        "/tim-classroom/poses/graph-q08.png",
        "/tim-classroom/poses/graph-q09.png",
        "/tim-classroom/poses/graph-q10.png",
      ],
      result: "/tim-classroom/poses/graph-result.png",
    },
    greetings: {
      middle: "小学生局也要认真连边：先抓住节点、路径和邻居。",
      university: "大学生局开始消息传递，想清楚信息如何聚合。",
      phd: "博士生局来到理论深水区：表达力、瓶颈与评估都要看清。",
    },
    difficulties: {
      middle: {
        label: "小学生",
        english: "PRIMARY",
        level: "逻辑启蒙",
        description: "从节点、边和基础图概念开始",
        focus: "识别 · 连接 · 基础推理",
      },
      university: {
        label: "大学生",
        english: "UNDERGRADUATE",
        level: "模型进阶",
        description: "理解消息传递、任务与训练机制",
        focus: "原理 · 应用 · 模型辨析",
      },
      phd: {
        label: "博士生",
        english: "DOCTORAL",
        level: "研究挑战",
        description: "深入表达力、图谱理论与评估",
        focus: "理论 · 研究 · 证据边界",
      },
    },
    report: {
      title: "IQ 思维能力报告",
      english: "IQ REASONING PROFILE",
      scoreLabel: "图论 IQ 指数",
      disclaimer: "这是基于图论与 GNN 题目的趣味思维画像，只反映本轮知识和推理表现，不等于标准化 IQ 测验。",
      dimensions: [
        { key: "structure", label: "结构理解", description: "识别节点、关系与整体结构", color: "#6d7eff", tip: "练习把真实问题画成图，并明确节点、边和特征。" },
        { key: "logic", label: "逻辑推演", description: "沿条件与关系链进行推理", color: "#9d6cff", tip: "做题时写出前提、变换和结论，避免跳过中间条件。" },
        { key: "model", label: "模型机制", description: "理解聚合、表示与模型行为", color: "#46cfe3", tip: "用一张小图手算一轮信息传播，机制会更直观。" },
        { key: "evidence", label: "证据判断", description: "评估实验、数据与结论边界", color: "#61d8a6", tip: "比较模型时同时检查划分、基线、随机种子和不确定性。" },
      ],
      grades: [
        { min: 90, label: "图论大脑", note: "你的结构感和推理链都很强，复杂图问题已经被你连成了一张清晰地图。" },
        { min: 70, label: "逻辑建模者", note: "核心机制掌握扎实，再补齐薄弱维度就能进入更深的理论区。" },
        { min: 50, label: "图思考学员", note: "你已经能抓住主要关系，复盘错误节点后会形成更稳定的推理链。" },
        { min: 0, label: "节点新手", note: "每个图论大脑都从第一个节点开始。先看解析，再随机抽一组继续连接。" },
      ],
    },
    questionBank: graphQuestions,
  },
  {
    key: "convex",
    eyebrow: "CONVEX 301",
    title: "凸函数小课堂",
    shortTitle: "凸函数",
    description: "测试凸优化课程知识",
    detail: "凸集 · 对偶 · 优化算法",
    images: {
      home: "/tim-classroom/poses/convex-home.png",
      card: "/tim-classroom/poses/convex-card.png",
      difficulty: "/tim-classroom/poses/convex-level.png",
      quiz: [
        "/tim-classroom/poses/convex-q01.png",
        "/tim-classroom/poses/convex-q02.png",
        "/tim-classroom/poses/convex-q03.png",
        "/tim-classroom/poses/convex-q04.png",
        "/tim-classroom/poses/convex-q05.png",
        "/tim-classroom/poses/convex-q06.png",
        "/tim-classroom/poses/convex-q07.png",
        "/tim-classroom/poses/convex-q08.png",
        "/tim-classroom/poses/convex-q09.png",
        "/tim-classroom/poses/convex-q10.png",
      ],
      result: "/tim-classroom/poses/convex-result.png",
    },
    greetings: {
      middle: "凸萌新局先看形状：抓住线段、曲率和全局最优的直觉。",
      university: "优化高手局开始建模：一阶条件、对偶与近端方法都要连起来。",
      phd: "优化大师局进入理论区：次梯度、锥对偶与收敛率逐项拆解。",
    },
    difficulties: {
      middle: {
        label: "凸萌新",
        english: "CONVEX STARTER",
        level: "几何入门",
        description: "从凸集、凸函数和全局最优出发",
        focus: "识别 · 直觉 · 基础算法",
      },
      university: {
        label: "优化高手",
        english: "OPTIMIZATION PRO",
        level: "建模进阶",
        description: "理解条件、对偶与标准问题形式",
        focus: "建模 · KKT · 近端方法",
      },
      phd: {
        label: "优化大师",
        english: "OPTIMIZATION MASTER",
        level: "理论挑战",
        description: "挑战凸分析、锥规划与收敛理论",
        focus: "对偶 · 算法 · 理论边界",
      },
    },
    report: {
      title: "凸优化能力报告",
      english: "CONVEX OPTIMIZATION PROFILE",
      scoreLabel: "凸优化指数",
      disclaimer: "本报告基于凸优化课程知识题，只反映本轮知识与推理表现，不等同于正式课程成绩、学位水平或科研能力评定。",
      dimensions: [
        { key: "geometry", label: "凸性几何", description: "凸集、锥与几何结构理解", color: "#41d9ca", tip: "把集合画出来，并逐次检查任意两点连线是否仍在集合内。" },
        { key: "functions", label: "函数判别", description: "曲率、保凸运算与最优性条件", color: "#73a7ff", tip: "交替使用定义、一阶条件与 Hessian 条件判断凸性。" },
        { key: "duality", label: "建模对偶", description: "标准形式、KKT 与对偶证书", color: "#a77bff", tip: "先统一约束符号，再逐项写出可行性、驻点性和互补松弛。" },
        { key: "algorithms", label: "算法收敛", description: "梯度、近端与内点方法理解", color: "#ffc857", tip: "比较每种算法的更新式、适用结构、步长条件和典型收敛率。" },
      ],
      grades: [
        { min: 90, label: "凸优化架构师", note: "从几何到对偶、从 KKT 到算法，你已经把整门课连成了一张清晰知识图。" },
        { min: 70, label: "KKT 解题高手", note: "核心框架掌握扎实，补齐报告中的薄弱维度后就能更稳定地处理复杂建模。" },
        { min: 50, label: "凸性探索者", note: "你已经抓住凸优化的主要直觉，沿着错题复盘定义与条件会提升很快。" },
        { min: 0, label: "可行域新手", note: "先从凸集和 Jensen 不等式起步。Tim 已把本轮需要补的知识点整理在报告里。" },
      ],
    },
    questionBank: convexQuestions,
  },
  {
    key: "love",
    eyebrow: "LOVE 401",
    title: "恋爱小课堂",
    shortTitle: "恋爱",
    description: "测试健康关系判断力",
    detail: "沟通 · 边界 · 关系洞察",
    images: {
      home: "/tim-classroom/poses/love-home.png",
      card: "/tim-classroom/tim-love.png",
      difficulty: "/tim-classroom/poses/love-level.png",
      quiz: [
        "/tim-classroom/poses/love-q01.png",
        "/tim-classroom/poses/love-q02.png",
        "/tim-classroom/poses/love-q03.png",
        "/tim-classroom/poses/love-q04.png",
        "/tim-classroom/poses/love-q05.png",
        "/tim-classroom/poses/love-q06.png",
        "/tim-classroom/poses/love-q07.png",
        "/tim-classroom/poses/love-q08.png",
        "/tim-classroom/poses/love-q09.png",
        "/tim-classroom/poses/love-q10.png",
      ],
      result: "/tim-classroom/poses/love-result.png",
    },
    greetings: {
      middle: "母单局不考套路：尊重、同意和边界才是起点。",
      university: "恋爱高手局别急着下结论，先分清感受、需要和行为。",
      phd: "恋爱大师局开启：既要理解关系，也要看见证据与情境。",
    },
    difficulties: {
      middle: {
        label: "母单",
        english: "FIRST LOVE",
        level: "关系启蒙",
        description: "从尊重、同意与边界开始",
        focus: "倾听 · 安全 · 基础判断",
      },
      university: {
        label: "恋爱高手",
        english: "RELATIONSHIP PRO",
        level: "情境进阶",
        description: "分析互动模式并练习沟通修复",
        focus: "沟通 · 协商 · 关系洞察",
      },
      phd: {
        label: "恋爱大师",
        english: "RELATIONSHIP MASTER",
        level: "关系科学",
        description: "深入双人互动、研究与伦理判断",
        focus: "系统 · 证据 · 复杂情境",
      },
    },
    report: {
      title: "情商能力报告",
      english: "EQ RELATIONSHIP PROFILE",
      scoreLabel: "关系情商指数",
      disclaimer: "本报告基于健康关系知识与情境判断，仅供学习和娱乐，不构成心理诊断、人格定型或针对具体关系的专业建议。",
      dimensions: [
        { key: "empathy", label: "同理理解", description: "识别感受、需要与不同视角", color: "#ff79aa", tip: "先复述对方的感受和需要，再表达自己的判断。" },
        { key: "communication", label: "沟通修复", description: "表达、倾听与冲突修复", color: "#ffae67", tip: "用具体事件、个人感受和清晰请求替代标签与指责。" },
        { key: "boundaries", label: "边界安全", description: "尊重同意、隐私与自主选择", color: "#8c7dff", tip: "把边界说成自己的选择和行动，而不是控制对方的命令。" },
        { key: "insight", label: "关系洞察", description: "辨认模式、情境与风险信号", color: "#56d6bd", tip: "不要用单一事件定义整段关系，观察持续模式并直接沟通。" },
      ],
      grades: [
        { min: 90, label: "高情商沟通者", note: "你能同时看见感受、边界和互动模式，温柔与清醒都在线。" },
        { min: 70, label: "关系洞察者", note: "你的关系判断整体可靠，补齐薄弱维度后会更从容。" },
        { min: 50, label: "真诚学习者", note: "你已经抓住健康关系的核心，复盘复杂情境会让判断更稳定。" },
        { min: 0, label: "边界萌新", note: "情商不是套路，而是可以练习的理解与尊重。先从本轮解析开始。" },
      ],
    },
    questionBank: loveQuestions,
  },
];

const dimensionLayouts: Record<CourseKey, Record<DifficultyKey, string[]>> = {
  sports: {
    middle: "knowledge knowledge training knowledge knowledge knowledge knowledge knowledge knowledge knowledge knowledge knowledge judgment body body body knowledge judgment training judgment".split(" "),
    university: "knowledge training training knowledge knowledge body judgment body body training training body training body judgment training judgment judgment judgment training".split(" "),
    phd: "body knowledge body body judgment judgment judgment judgment training judgment body body knowledge knowledge judgment judgment judgment judgment training training".split(" "),
  },
  graph: {
    middle: "structure structure logic structure logic logic logic structure structure structure structure model logic model model model model model evidence evidence".split(" "),
    university: "model model model logic logic logic structure logic model evidence structure evidence model model model logic model logic evidence evidence".split(" "),
    phd: "model model model logic structure structure evidence evidence evidence model logic model logic logic structure model evidence evidence evidence evidence".split(" "),
  },
  convex: {
    middle: "duality geometry geometry geometry functions functions functions functions geometry functions geometry geometry duality duality functions functions algorithms algorithms algorithms duality".split(" "),
    university: "functions functions functions functions functions functions functions functions duality duality duality duality duality duality functions algorithms algorithms algorithms duality geometry".split(" "),
    phd: "functions functions geometry duality duality geometry duality duality duality duality algorithms algorithms algorithms algorithms algorithms algorithms algorithms algorithms algorithms functions".split(" "),
  },
  love: {
    middle: "boundaries communication boundaries empathy insight communication empathy boundaries boundaries boundaries empathy boundaries empathy boundaries boundaries insight insight communication boundaries insight".split(" "),
    university: "insight communication empathy boundaries boundaries communication communication empathy insight communication insight insight insight boundaries boundaries boundaries empathy communication boundaries communication".split(" "),
    phd: "communication empathy empathy communication insight empathy insight empathy insight insight empathy communication insight boundaries communication empathy insight insight insight boundaries".split(" "),
  },
};

for (const course of courses) {
  const validDimensionKeys = new Set(course.report.dimensions.map((dimension) => dimension.key));
  for (const difficulty of difficultyOrder) {
    const bank = course.questionBank[difficulty];
    const layout = dimensionLayouts[course.key][difficulty];
    if (layout.length !== bank.length) {
      throw new Error(`${course.title} · ${difficulty} 的能力维度配置与题库数量不一致。`);
    }
    if (layout.some((key) => !validDimensionKeys.has(key))) {
      throw new Error(`${course.title} · ${difficulty} 存在未定义的能力维度。`);
    }
    if (course.report.dimensions.some((dimension) => !layout.includes(dimension.key))) {
      throw new Error(`${course.title} · ${difficulty} 未覆盖全部报告维度。`);
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function buildQuizAttempt(course: Course, difficulty: DifficultyKey): QuizQuestion[] {
  const bank = course.questionBank[difficulty];
  const layout = dimensionLayouts[course.key][difficulty];
  if (layout.length !== bank.length) {
    throw new Error(`${course.title} · ${difficulty} 的能力维度配置与题库数量不一致。`);
  }

  const annotated = bank.map((question, sourceIndex) => ({
    ...question,
    sourceIndex,
    dimensionKey: layout[sourceIndex],
  }));

  const anchors = course.report.dimensions.flatMap((dimension) => {
    const bucket = annotated.filter((question) => question.dimensionKey === dimension.key);
    return shuffle(bucket).slice(0, 1);
  });
  const anchorIds = new Set(anchors.map((question) => question.sourceIndex));
  const remainder = shuffle(annotated.filter((question) => !anchorIds.has(question.sourceIndex)));

  const attempt = shuffle([...anchors, ...remainder.slice(0, Math.max(0, 10 - anchors.length))]);
  if (attempt.length !== 10 || new Set(attempt.map((question) => question.sourceIndex)).size !== 10) {
    throw new Error(`${course.title} · ${difficulty} 未能生成 10 道不重复随机题。`);
  }
  return attempt;
}
