"use client";

import { useMemo, useState } from "react";

type CourseKey = "sports" | "graph" | "love";
type Screen = "home" | "quiz" | "result";

type Question = {
  category: string;
  prompt: string;
  options: string[];
  correct: number;
  insight: string;
};

type Course = {
  key: CourseKey;
  eyebrow: string;
  title: string;
  shortTitle: string;
  description: string;
  detail: string;
  image: string;
  greeting: string;
  questions: Question[];
};

const courses: Course[] = [
  {
    key: "sports",
    eyebrow: "SPORT 101",
    title: "运动小课堂",
    shortTitle: "运动",
    description: "测试体育知识",
    detail: "规则 · 体能 · 赛场常识",
    image: "/tim-classroom/tim-sports.png",
    greeting: "热身完毕！这轮既考赛场常识，也考科学运动。",
    questions: [
      {
        category: "田径常识",
        prompt: "标准马拉松的比赛距离是多少？",
        options: ["40 公里", "41.5 公里", "42.195 公里", "45 公里"],
        correct: 2,
        insight: "标准马拉松全程为 42.195 公里，半程则是 21.0975 公里。",
      },
      {
        category: "篮球规则",
        prompt: "常见正式篮球比赛中，一次进攻通常要在多少秒内完成出手？",
        options: ["12 秒", "18 秒", "24 秒", "30 秒"],
        correct: 2,
        insight: "24 秒进攻时限让比赛保持节奏；球必须在计时结束前离手。",
      },
      {
        category: "科学训练",
        prompt: "短跑前进行动态热身，最主要的目的是什么？",
        options: ["提前把体力耗尽", "提高体温并激活肌群", "让心率尽量降低", "完全替代专项练习"],
        correct: 1,
        insight: "动态热身会逐步提升体温、活动度与神经肌肉状态，为高强度动作做准备。",
      },
      {
        category: "排球规则",
        prompt: "室内排球比赛中，每队同时在场的球员通常有几名？",
        options: ["5 名", "6 名", "7 名", "8 名"],
        correct: 1,
        insight: "室内排球每队 6 人在场，位置会随着发球权轮转。",
      },
      {
        category: "网球术语",
        prompt: "网球计分里的 “Love” 表示什么？",
        options: ["平分", "零分", "赛点", "发球得分"],
        correct: 1,
        insight: "在网球计分中，Love 表示零分。恭喜你顺便预习了恋爱小课堂。",
      },
    ],
  },
  {
    key: "graph",
    eyebrow: "GRAPH 201",
    title: "图论小课堂",
    shortTitle: "图论",
    description: "测试图神经网络知识",
    detail: "节点 · 消息传递 · GNN",
    image: "/tim-classroom/tim-study.png",
    greeting: "把知识连成图。别怕公式，先抓住节点之间如何交流。",
    questions: [
      {
        category: "图的组成",
        prompt: "在一张社交网络图中，“用户”最自然地对应什么？",
        options: ["节点", "边", "损失函数", "学习率"],
        correct: 0,
        insight: "用户通常建模为节点，关注、好友或互动关系则可以建模为边。",
      },
      {
        category: "消息传递",
        prompt: "GNN 的消息传递层，核心在做哪件事？",
        options: ["只读取节点自己的编号", "聚合邻居信息来更新节点表示", "随机删除全部边", "把图强制变成图片"],
        correct: 1,
        insight: "典型 GNN 会收集邻居消息、进行聚合，再结合自身状态更新节点表示。",
      },
      {
        category: "聚合函数",
        prompt: "为什么邻居聚合通常要对输入顺序保持不变？",
        options: ["因为邻居集合本身没有天然顺序", "为了让节点数量永远相同", "为了取消训练过程", "因为边不能有特征"],
        correct: 0,
        insight: "同一组邻居不应因为枚举顺序变化而产生不同结果，因此常用求和、均值或最大值等聚合。",
      },
      {
        category: "图级任务",
        prompt: "要预测整张分子图的性质，节点表示之后通常还需要什么？",
        options: ["图级池化或 Readout", "把所有节点删掉", "只保留节点名称", "固定随机答案"],
        correct: 0,
        insight: "图级池化会把多个节点表示汇总成整张图的向量，再用于分类或回归。",
      },
      {
        category: "模型现象",
        prompt: "GNN 层数过深时，“过平滑”通常指什么？",
        options: ["节点表示变得越来越相似", "损失函数无法计算", "图里自动增加新节点", "所有边都变成有向边"],
        correct: 0,
        insight: "反复聚合会让节点表示趋同，原本可区分的局部信息可能被冲淡。",
      },
    ],
  },
  {
    key: "love",
    eyebrow: "LOVE 301",
    title: "恋爱小课堂",
    shortTitle: "恋爱",
    description: "测试健康关系判断力",
    detail: "沟通 · 边界 · 同理心",
    image: "/tim-classroom/tim-love.png",
    greeting: "这门课没有套路题：尊重、沟通和边界感才是高分答案。",
    questions: [
      {
        category: "同意与尊重",
        prompt: "关于亲密关系中的“同意”，下面哪种理解更恰当？",
        options: ["答应过一次就永远有效", "沉默就等于同意", "任何时候都可以改变决定", "恋人之间不需要询问"],
        correct: 2,
        insight: "同意应当明确、自愿且持续；任何人都可以随时改变决定。",
      },
      {
        category: "冲突沟通",
        prompt: "发生分歧时，哪一种表达更有利于解决问题？",
        options: ["你总是这么自私", "算了，永远不说了", "我感到被忽略，希望我们约个时间聊聊", "马上翻旧账证明对方错"],
        correct: 2,
        insight: "描述自己的感受与具体需要，比贴标签或指责更容易开启有效沟通。",
      },
      {
        category: "个人边界",
        prompt: "健康关系中的个人边界，更接近下面哪一项？",
        options: ["彼此不能有任何独处时间", "双方表达需要并协商可接受范围", "用查手机来证明信任", "一方决定，另一方服从"],
        correct: 1,
        insight: "边界不是疏远，而是让双方清楚哪些行为舒适、尊重且可持续。",
      },
      {
        category: "理解情境",
        prompt: "对方一段时间没有及时回复消息，最稳妥的判断是什么？",
        options: ["一定是不在乎了", "先结合情境，必要时直接沟通", "马上连续追问十次", "故意消失更久来报复"],
        correct: 1,
        insight: "单个信号往往无法说明全部情况。先了解情境，再坦诚沟通，比猜测更可靠。",
      },
      {
        category: "关系信号",
        prompt: "下面哪一项更像需要警惕的关系信号？",
        options: ["尊重彼此的朋友和兴趣", "可以平静讨论不同意见", "以爱为名强迫共享密码和定位", "为彼此的进步感到高兴"],
        correct: 2,
        insight: "控制、监视与强迫不是爱的证明。健康关系会尊重隐私、选择与安全感。",
      },
    ],
  },
];

const sampleScores = [
  { label: "运动小课堂", rate: 82, color: "sports" },
  { label: "图论小课堂", rate: 68, color: "graph" },
  { label: "恋爱小课堂", rate: 88, color: "love" },
];

const optionLetters = ["A", "B", "C", "D"];

function getResultCopy(score: number) {
  if (score === 5) return { rank: "满分课代表", note: "Tim 已经没什么能难倒你了。知识点全连上，状态拉满！" };
  if (score === 4) return { rank: "课堂高手", note: "只差一个小细节。稳稳拿捏，再来一轮就有机会满分。" };
  if (score === 3) return { rank: "潜力同学", note: "核心概念已经站稳。看看解析，下一轮会进步得很快。" };
  return { rank: "勇敢新生", note: "答题就是最好的热身。Tim 已经把重点整理在下面，慢慢来。" };
}

export function TimClassroom() {
  const [screen, setScreen] = useState<Screen>("home");
  const [courseKey, setCourseKey] = useState<CourseKey>("sports");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [copied, setCopied] = useState(false);

  const course = useMemo(
    () => courses.find((item) => item.key === courseKey) ?? courses[0],
    [courseKey],
  );
  const question = course.questions[questionIndex];
  const score = answers.reduce(
    (total, answer, index) => total + (answer === course.questions[index].correct ? 1 : 0),
    0,
  );

  const startCourse = (key: CourseKey) => {
    setCourseKey(key);
    setQuestionIndex(0);
    setSelectedOption(null);
    setAnswers([]);
    setCopied(false);
    setScreen("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goHome = () => {
    setScreen("home");
    setQuestionIndex(0);
    setSelectedOption(null);
    setAnswers([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitAnswer = () => {
    if (selectedOption === null) return;
    const nextAnswers = [...answers, selectedOption];
    setAnswers(nextAnswers);
    setSelectedOption(null);

    if (questionIndex === course.questions.length - 1) {
      setScreen("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setQuestionIndex((current) => current + 1);
  };

  const copyResult = async () => {
    const finalScore = answers.reduce(
      (total, answer, index) => total + (answer === course.questions[index].correct ? 1 : 0),
      0,
    );
    const text = `我在 Tim小课堂 · ${course.title}答对 ${finalScore}/5 题，获得「${getResultCopy(finalScore).rank}」！`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="tim-classroom">
      <section className="tim-phone" data-course={screen === "home" ? "home" : course.key}>
        <div className="tim-grid" aria-hidden="true" />

        {screen === "home" && (
          <>
            <header className="tim-topbar">
              <span className="tim-brand"><i /> TIM LAB</span>
              <span className="tim-online"><i /> TIM 在线</span>
            </header>

            <div className="tim-hero">
              <p className="tim-kicker">TIM CLASS · POP QUIZ</p>
              <h1 id="tim-classroom-title">Tim小课堂</h1>
              <p>上课铃响了。今天想让 Tim 考考你哪一门？</p>

              <div className="tim-avatar-row" aria-hidden="true">
                <span className="tim-avatar tim-avatar-sports"><img src="/tim-classroom/tim-sports.png" alt="" /></span>
                <span className="tim-avatar tim-avatar-study"><img src="/tim-classroom/tim-study.png" alt="" /></span>
                <span className="tim-avatar tim-avatar-love"><img src="/tim-classroom/tim-love.png" alt="" /></span>
              </div>
            </div>

            <div className="tim-course-list" aria-label="选择一门小课堂">
              {courses.map((item, index) => (
                <button
                  className={`tim-course tim-course-${item.key}`}
                  type="button"
                  key={item.key}
                  onClick={() => startCourse(item.key)}
                  aria-label={`开始${item.title}：${item.description}`}
                >
                  <span className="tim-course-index">0{index + 1}</span>
                  <span className="tim-course-copy">
                    <small>{item.eyebrow}</small>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    <em>{item.detail}</em>
                  </span>
                  <img src={item.image} alt="" aria-hidden="true" />
                  <span className="tim-course-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>

            <button className="tim-scoreboard-link" type="button" onClick={() => setShowScoreboard(true)}>
              <span>🏆</span> 看看同学们的课堂成绩
            </button>

            <footer className="tim-footer">
              <span>每门 5 题 · 预计 3 分钟</span>
              <span>知识不是天生的，是一题题练出来的。</span>
              <small>© TIM CLASSROOM · v1.0</small>
            </footer>
          </>
        )}

        {screen === "quiz" && (
          <div className="tim-quiz-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goHome} aria-label="退出答题并返回首页">← 退出</button>
              <span>{course.eyebrow}</span>
              <span>{String(questionIndex + 1).padStart(2, "0")} / 05</span>
            </header>

            <div className="tim-progress" aria-label={`答题进度 ${questionIndex + 1} / 5`}>
              <span style={{ width: `${((questionIndex + 1) / course.questions.length) * 100}%` }} />
            </div>

            <div className="tim-teacher">
              <div className="tim-teacher-image" aria-hidden="true"><img src={course.image} alt="" /></div>
              <div className="tim-speech">
                <small>TIM 老师说</small>
                <p>{questionIndex === 0 ? course.greeting : "保持节奏，先想清楚再出手。"}</p>
              </div>
            </div>

            <section className="tim-question-card" aria-labelledby="tim-question-heading">
              <div className="tim-question-meta">
                <span>{question.category}</span>
                <span>单选题 · 1 分</span>
              </div>
              <h1 id="tim-question-heading">{question.prompt}</h1>

              <div className="tim-options" role="radiogroup" aria-label="答案选项">
                {question.options.map((option, index) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedOption === index}
                    className={selectedOption === index ? "selected" : ""}
                    onClick={() => setSelectedOption(index)}
                    key={option}
                  >
                    <span>{optionLetters[index]}</span>
                    <strong>{option}</strong>
                    <i aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>

            <button
              className="tim-next-button"
              type="button"
              disabled={selectedOption === null}
              onClick={submitAnswer}
            >
              <span>{questionIndex === course.questions.length - 1 ? "交卷看成绩" : "确认，下一题"}</span>
              <span aria-hidden="true">→</span>
            </button>
            <p className="tim-quiz-hint" aria-live="polite">
              {selectedOption === null ? "选择一个你认为最准确的答案" : `已选择 ${optionLetters[selectedOption]}，确认后不可返回修改`}
            </p>
          </div>
        )}

        {screen === "result" && (
          <div className="tim-result-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goHome}>← 首页</button>
              <span>CLASS REPORT</span>
              <span>已交卷</span>
            </header>

            <section className="tim-result-hero" aria-labelledby="tim-result-heading">
              <p className="tim-kicker">TIM CERTIFIED · {course.shortTitle.toUpperCase()}</p>
              <div className="tim-result-mascot" aria-hidden="true">
                <span className="tim-confetti">✦</span>
                <img src={course.image} alt="" />
                <span className="tim-confetti">✦</span>
              </div>
              <div className="tim-score-ring" style={{ "--score": `${score * 20}%` } as React.CSSProperties}>
                <strong>{score}</strong><span>/ 5</span>
              </div>
              <p className="tim-result-label">本次得分</p>
              <h1 id="tim-result-heading">{getResultCopy(score).rank}</h1>
              <p>{getResultCopy(score).note}</p>
            </section>

            <div className="tim-result-actions">
              <button type="button" className="tim-next-button" onClick={() => startCourse(course.key)}>
                <span>再测一次</span><span aria-hidden="true">↻</span>
              </button>
              <button type="button" className="tim-copy-button" onClick={copyResult}>
                {copied ? "成绩文案已复制 ✓" : "复制我的成绩文案"}
              </button>
            </div>

            <section className="tim-review" aria-labelledby="tim-review-heading">
              <div className="tim-review-heading">
                <div>
                  <small>AFTER CLASS</small>
                  <h2 id="tim-review-heading">课后复盘</h2>
                </div>
                <span>{score === 5 ? "全部掌握" : `${5 - score} 个知识点待复习`}</span>
              </div>

              <div className="tim-review-list">
                {course.questions.map((item, index) => {
                  const isCorrect = answers[index] === item.correct;
                  return (
                    <details key={item.prompt} className={isCorrect ? "correct" : "incorrect"} open={!isCorrect}>
                      <summary>
                        <span>{isCorrect ? "✓" : "!"}</span>
                        <strong>第 {index + 1} 题 · {item.category}</strong>
                        <em>{isCorrect ? "答对" : "再看看"}</em>
                      </summary>
                      <div>
                        <p>{item.prompt}</p>
                        <small>正确答案：{optionLetters[item.correct]} · {item.options[item.correct]}</small>
                        <p>{item.insight}</p>
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>

            <button className="tim-back-home" type="button" onClick={goHome}>选择另一门小课堂</button>
          </div>
        )}

        {showScoreboard && (
          <div className="tim-modal-backdrop" role="presentation" onClick={() => setShowScoreboard(false)}>
            <section className="tim-scoreboard" role="dialog" aria-modal="true" aria-labelledby="tim-scoreboard-title" onClick={(event) => event.stopPropagation()}>
              <div className="tim-scoreboard-handle" aria-hidden="true" />
              <header>
                <div>
                  <small>DEMO CLASS · 今日</small>
                  <h2 id="tim-scoreboard-title">示例班级榜</h2>
                </div>
                <button type="button" onClick={() => setShowScoreboard(false)} aria-label="关闭示例班级榜">×</button>
              </header>
              <p>这是用于展示页面逻辑的匿名示例数据，不代表真实用户成绩。</p>
              <div className="tim-rank-bars">
                {sampleScores.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span><strong>{item.rate}%</strong>
                    <i><b className={`bar-${item.color}`} style={{ width: `${item.rate}%` }} /></i>
                  </div>
                ))}
              </div>
              <div className="tim-class-fact">
                <img src="/tim-classroom/tim-smile.png" alt="微笑的 Tim" />
                <p><strong>Tim 的观察</strong>大家在“尊重边界”和“邻居聚合”两题上进步最快。</p>
              </div>
              <button className="tim-next-button" type="button" onClick={() => setShowScoreboard(false)}><span>知道了，去答题</span><span>→</span></button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
