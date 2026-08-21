"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { graphQuestions } from "./graphQuestions";
import { loveQuestions } from "./loveQuestions";
import { difficulties } from "./quizTypes";
import type { DifficultyKey, QuestionBank } from "./quizTypes";
import { sportsQuestions } from "./sportsQuestions";

type CourseKey = "sports" | "graph" | "love";
type Screen = "home" | "difficulty" | "quiz" | "result";

type Course = {
  key: CourseKey;
  eyebrow: string;
  title: string;
  shortTitle: string;
  description: string;
  detail: string;
  image: string;
  greetings: Record<DifficultyKey, string>;
  questionBank: QuestionBank;
};

const courses: Course[] = [
  {
    key: "sports",
    eyebrow: "SPORT 101",
    title: "运动小课堂",
    shortTitle: "运动",
    description: "测试体育知识",
    detail: "规则 · 训练 · 运动科学",
    image: "/tim-classroom/tim-sports.png",
    greetings: {
      middle: "热身完毕！先从赛场常识和科学运动基础开始。",
      university: "进入应用局：把训练原理放进具体运动情境里判断。",
      phd: "研究挑战开始。留意因果、测量和证据边界。",
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
    image: "/tim-classroom/tim-study.png",
    greetings: {
      middle: "把知识连成图：先抓住节点、边和邻居这几个核心概念。",
      university: "开始消息传递。想清楚信息从哪里来、如何聚合。",
      phd: "来到理论深水区：表达能力、瓶颈与评估都要看清。",
    },
    questionBank: graphQuestions,
  },
  {
    key: "love",
    eyebrow: "LOVE 301",
    title: "恋爱小课堂",
    shortTitle: "恋爱",
    description: "测试健康关系判断力",
    detail: "沟通 · 边界 · 关系研究",
    image: "/tim-classroom/tim-love.png",
    greetings: {
      middle: "这门课没有套路题：尊重、沟通和边界感才是基础。",
      university: "别急着下结论，试着区分感受、需求、行为和情境。",
      phd: "研究模式开启：相关不等于因果，量表也需要测量证据。",
    },
    questionBank: loveQuestions,
  },
];

const sampleScores = [
  { label: "运动小课堂", rate: 82, color: "sports" },
  { label: "图论小课堂", rate: 68, color: "graph" },
  { label: "恋爱小课堂", rate: 88, color: "love" },
];

const optionLetters = ["A", "B", "C", "D"];

function getResultCopy(score: number, total: number) {
  const rate = score / total;
  if (score === total) {
    return { rank: "满分课代表", note: "Tim 已经没什么能难倒你了。20 个知识点全部连上，状态拉满！" };
  }
  if (rate >= 0.85) {
    return { rank: "荣誉课代表", note: "表现非常稳。只剩少量细节需要复盘，再来一轮就有机会满分。" };
  }
  if (rate >= 0.65) {
    return { rank: "课堂高手", note: "核心概念已经站稳。把错题解析连起来，下一档难度也值得挑战。" };
  }
  if (rate >= 0.45) {
    return { rank: "扎实学员", note: "已经抓住不少关键点。跟着复盘补齐薄弱环节，进步会很明显。" };
  }
  return { rank: "勇敢新生", note: "答题就是最好的热身。Tim 已经把重点整理在下面，慢慢来。" };
}

export function TimClassroom() {
  const [screen, setScreen] = useState<Screen>("home");
  const [courseKey, setCourseKey] = useState<CourseKey>("sports");
  const [difficultyKey, setDifficultyKey] = useState<DifficultyKey>("middle");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [copied, setCopied] = useState(false);

  const course = useMemo(
    () => courses.find((item) => item.key === courseKey) ?? courses[0],
    [courseKey],
  );
  const difficulty = useMemo(
    () => difficulties.find((item) => item.key === difficultyKey) ?? difficulties[0],
    [difficultyKey],
  );
  const questions = course.questionBank[difficultyKey];
  const question = questions[questionIndex];
  const score = answers.reduce(
    (total, answer, index) => total + (answer === questions[index]?.correct ? 1 : 0),
    0,
  );
  const resultCopy = getResultCopy(score, questions.length);

  const resetAttempt = () => {
    setQuestionIndex(0);
    setSelectedOption(null);
    setAnswers([]);
    setCopied(false);
  };

  const selectCourse = (key: CourseKey) => {
    setCourseKey(key);
    resetAttempt();
    setScreen("difficulty");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startQuiz = (key: DifficultyKey) => {
    setDifficultyKey(key);
    resetAttempt();
    setScreen("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goHome = () => {
    resetAttempt();
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goDifficulty = () => {
    resetAttempt();
    setScreen("difficulty");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitAnswer = () => {
    if (selectedOption === null) return;
    const nextAnswers = [...answers, selectedOption];
    setAnswers(nextAnswers);
    setSelectedOption(null);

    if (questionIndex === questions.length - 1) {
      setScreen("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setQuestionIndex((current) => current + 1);
  };

  const copyResult = async () => {
    const text = `我在 Tim小课堂 · ${course.title}（${difficulty.label}难度）答对 ${score}/${questions.length} 题，获得「${resultCopy.rank}」！`;
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
      <section
        className="tim-phone"
        data-course={screen === "home" ? "home" : course.key}
        data-screen={screen}
      >
        <div className="tim-grid" aria-hidden="true" />

        {screen === "home" && (
          <>
            <header className="tim-topbar">
              <span className="tim-brand"><i /> TIM LAB</span>
              <span className="tim-online"><i /> TIM 在线</span>
            </header>

            <div className="tim-hero">
              <p className="tim-kicker">TIM CLASS · 180 QUESTION BANK</p>
              <h1 id="tim-classroom-title">Tim小课堂</h1>
              <p>三门课程、三档难度。今天想让 Tim 考考你哪一门？</p>

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
                  onClick={() => selectCourse(item.key)}
                  aria-label={`选择${item.title}：${item.description}`}
                >
                  <span className="tim-course-index">0{index + 1}</span>
                  <span className="tim-course-copy">
                    <small>{item.eyebrow}</small>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    <em>{item.detail}</em>
                  </span>
                  <span className="tim-course-count">3 档 · 60 题</span>
                  <img src={item.image} alt="" aria-hidden="true" />
                  <span className="tim-course-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>

            <button className="tim-scoreboard-link" type="button" onClick={() => setShowScoreboard(true)}>
              <span>🏆</span> 看看同学们的课堂成绩
            </button>

            <footer className="tim-footer">
              <span>9 套独立题库 · 每次 20 题</span>
              <span>知识不是天生的，是一题题练出来的。</span>
              <small>© TIM CLASSROOM · v2.0 · 共 180 题</small>
            </footer>
          </>
        )}

        {screen === "difficulty" && (
          <div className="tim-difficulty-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goHome}>← 课程</button>
              <span>{course.eyebrow}</span>
              <span>60 题</span>
            </header>

            <section className="tim-difficulty-hero" aria-labelledby="tim-difficulty-heading">
              <div className="tim-difficulty-mascot" aria-hidden="true"><img src={course.image} alt="" /></div>
              <p className="tim-kicker">CHOOSE YOUR LEVEL</p>
              <h1 id="tim-difficulty-heading">{course.title}</h1>
              <p>选择本轮难度。每一档都是独立的 20 道题。</p>
            </section>

            <div className="tim-difficulty-list" aria-label="选择答题难度">
              {difficulties.map((item, index) => (
                <button
                  type="button"
                  key={item.key}
                  className={`tim-difficulty-card tim-difficulty-${item.key}`}
                  onClick={() => startQuiz(item.key)}
                  aria-label={`开始${course.title}${item.label}难度，共20题`}
                >
                  <span className="tim-difficulty-number">0{index + 1}</span>
                  <span className="tim-difficulty-copy">
                    <small>{item.english} · {item.level}</small>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                    <em>{item.focus}</em>
                  </span>
                  <span className="tim-difficulty-total">20<small>题</small></span>
                  <span className="tim-difficulty-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>

            <p className="tim-difficulty-note">
              <span aria-hidden="true">✦</span>
              三档均为独立题目。难度越高，越重视机制、证据和方法判断。
            </p>
          </div>
        )}

        {screen === "quiz" && (
          <div className="tim-quiz-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goDifficulty} aria-label="退出答题并返回难度选择">← 退出</button>
              <span>{course.shortTitle} · {difficulty.label}</span>
              <span>{String(questionIndex + 1).padStart(2, "0")} / {questions.length}</span>
            </header>

            <div className="tim-progress" aria-label={`答题进度 ${questionIndex + 1} / ${questions.length}`}>
              <span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
            </div>

            <div className="tim-teacher">
              <div className="tim-teacher-image" aria-hidden="true"><img src={course.image} alt="" /></div>
              <div className="tim-speech">
                <small>TIM 老师说 · {difficulty.level}</small>
                <p>{questionIndex === 0 ? course.greetings[difficultyKey] : difficultyKey === "phd" ? "继续辨析：先确认假设、证据与结论是否真的对齐。" : "保持节奏，先想清楚再出手。"}</p>
              </div>
            </div>

            <section className="tim-question-card" aria-labelledby="tim-question-heading">
              <div className="tim-question-meta">
                <span>{question.category}</span>
                <span>{difficulty.label} · 单选题</span>
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
              <span>{questionIndex === questions.length - 1 ? "交卷看成绩" : "确认，下一题"}</span>
              <span aria-hidden="true">→</span>
            </button>
            <p className="tim-quiz-hint" aria-live="polite">
              {selectedOption === null ? `选择一个你认为最准确的答案 · ${difficulty.label}难度` : `已选择 ${optionLetters[selectedOption]}，确认后不可返回修改`}
            </p>
          </div>
        )}

        {screen === "result" && (
          <div className="tim-result-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goHome}>← 首页</button>
              <span>CLASS REPORT</span>
              <span>{difficulty.label} · 已交卷</span>
            </header>

            <section className="tim-result-hero" aria-labelledby="tim-result-heading">
              <p className="tim-kicker">TIM CERTIFIED · {course.shortTitle.toUpperCase()} · {difficulty.english}</p>
              <div className="tim-result-mascot" aria-hidden="true">
                <span className="tim-confetti">✦</span>
                <img src={course.image} alt="" />
                <span className="tim-confetti">✦</span>
              </div>
              <div
                className="tim-score-ring"
                style={{ "--score": `${(score / questions.length) * 100}%` } as CSSProperties}
              >
                <strong>{score}</strong><span>/ {questions.length}</span>
              </div>
              <p className="tim-result-label">{course.title} · {difficulty.label}难度</p>
              <h1 id="tim-result-heading">{resultCopy.rank}</h1>
              <p>{resultCopy.note}</p>
            </section>

            <div className="tim-result-actions">
              <button type="button" className="tim-next-button" onClick={() => startQuiz(difficultyKey)}>
                <span>同难度再测一次</span><span aria-hidden="true">↻</span>
              </button>
              <button type="button" className="tim-copy-button" onClick={copyResult}>
                {copied ? "成绩文案已复制 ✓" : "复制我的成绩文案"}
              </button>
              <button type="button" className="tim-change-level" onClick={goDifficulty}>切换难度</button>
            </div>

            <section className="tim-review" aria-labelledby="tim-review-heading">
              <div className="tim-review-heading">
                <div>
                  <small>AFTER CLASS · 20 QUESTIONS</small>
                  <h2 id="tim-review-heading">课后复盘</h2>
                </div>
                <span>{score === questions.length ? "全部掌握" : `${questions.length - score} 个知识点待复习`}</span>
              </div>

              <div className="tim-review-list">
                {questions.map((item, index) => {
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
          <div
            className="tim-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowScoreboard(false);
            }}
          >
            <section className="tim-scoreboard" role="dialog" aria-modal="true" aria-labelledby="tim-scoreboard-title">
              <div className="tim-scoreboard-handle" aria-hidden="true" />
              <header>
                <div>
                  <small>DEMO CLASS · 今日</small>
                  <h2 id="tim-scoreboard-title">示例班级榜</h2>
                </div>
                <button type="button" onClick={() => setShowScoreboard(false)} aria-label="关闭示例班级榜">×</button>
              </header>
              <p>这是用于展示 9 套题库页面逻辑的匿名示例数据，不代表真实用户成绩。</p>
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
                <p><strong>Tim 的观察</strong>三门课程都已开放中学、大学和博士三档挑战。</p>
              </div>
              <button className="tim-next-button" type="button" onClick={() => setShowScoreboard(false)}><span>知道了，去答题</span><span>→</span></button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
