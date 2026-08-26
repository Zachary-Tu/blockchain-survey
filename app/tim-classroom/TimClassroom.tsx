"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";

import { buildQuizAttempt, courses, difficultyOrder } from "./classroomConfig";
import type { CourseKey, QuizQuestion, ReportProfile } from "./classroomConfig";
import { GoClassroom } from "./go/GoClassroom";
import { XiangqiClassroom } from "./xiangqi/XiangqiClassroom";
import type { DifficultyKey } from "./quizTypes";

type Screen = "home" | "difficulty" | "quiz" | "result" | "go" | "xiangqi";

type DimensionStat = {
  key: string;
  label: string;
  description: string;
  color: string;
  tip: string;
  correct: number;
  total: number;
  percent: number;
};

const sampleScores = [
  { label: "运动小课堂", rate: 82, color: "sports" },
  { label: "图论小课堂", rate: 68, color: "graph" },
  { label: "凸函数小课堂", rate: 76, color: "convex" },
  { label: "恋爱小课堂", rate: 88, color: "love" },
  { label: "围棋小课堂", rate: 74, color: "go" },
  { label: "象棋小课堂", rate: 79, color: "xiangqi" },
];

const optionLetters = ["A", "B", "C", "D"];
const totalQuestionCount = courses.reduce(
  (courseTotal, item) => courseTotal + difficultyOrder.reduce(
    (difficultyTotal, key) => difficultyTotal + item.questionBank[key].length,
    0,
  ),
  0,
);
const totalBankCount = courses.length * difficultyOrder.length;

function getGrade(report: ReportProfile, score: number) {
  return report.grades.find((grade) => score >= grade.min) ?? report.grades[report.grades.length - 1];
}

export function TimClassroom() {
  const [screen, setScreen] = useState<Screen>("home");
  const [courseKey, setCourseKey] = useState<CourseKey>("sports");
  const [difficultyKey, setDifficultyKey] = useState<DifficultyKey>("middle");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [copied, setCopied] = useState(false);
  const feedbackTimer = useRef<number | null>(null);
  const answerLock = useRef(false);

  const course = useMemo(
    () => courses.find((item) => item.key === courseKey) ?? courses[0],
    [courseKey],
  );
  const difficulty = course.difficulties[difficultyKey];
  const courseQuestionCount = difficultyOrder.reduce(
    (total, key) => total + course.questionBank[key].length,
    0,
  );
  const fallbackQuestion: QuizQuestion = {
    ...course.questionBank[difficultyKey][0],
    sourceIndex: 0,
    dimensionKey: course.report.dimensions[0].key,
  };
  const question = questions[questionIndex] ?? fallbackQuestion;
  const totalQuestions = questions.length || 10;
  const score = answers.reduce(
    (total, answer, index) => total + (answer === questions[index]?.correct ? 1 : 0),
    0,
  );
  const abilityScore = Math.round((score / totalQuestions) * 100);
  const grade = getGrade(course.report, abilityScore);

  const dimensionStats = useMemo<DimensionStat[]>(
    () => course.report.dimensions.map((dimension) => {
      const indexes = questions.flatMap((item, index) => item.dimensionKey === dimension.key ? [index] : []);
      const correct = indexes.reduce(
        (total, index) => total + (answers[index] === questions[index]?.correct ? 1 : 0),
        0,
      );
      const total = indexes.length;
      return {
        ...dimension,
        correct,
        total,
        percent: total ? Math.round((correct / total) * 100) : 0,
      };
    }),
    [answers, course.report.dimensions, questions],
  );

  const strongestDimension = [...dimensionStats].sort(
    (left, right) => right.percent - left.percent || right.correct - left.correct,
  )[0];
  const growthDimension = [...dimensionStats].sort(
    (left, right) => left.percent - right.percent || right.total - left.total,
  )[0];

  const clearFeedbackTimer = () => {
    if (feedbackTimer.current !== null) {
      window.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
  };

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);

  const resetAttempt = () => {
    clearFeedbackTimer();
    answerLock.current = false;
    setQuestions([]);
    setQuestionIndex(0);
    setSelectedOption(null);
    setAnswerRevealed(false);
    setAnswers([]);
    setCurrentStreak(0);
    setMaxStreak(0);
    setStartedAt(0);
    setElapsedSeconds(0);
    setCopied(false);
  };

  const selectCourse = (key: CourseKey) => {
    setCourseKey(key);
    resetAttempt();
    setScreen("difficulty");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startQuiz = (key: DifficultyKey, startTimestamp: number) => {
    clearFeedbackTimer();
    answerLock.current = false;
    setDifficultyKey(key);
    setQuestions(buildQuizAttempt(course, key));
    setQuestionIndex(0);
    setSelectedOption(null);
    setAnswerRevealed(false);
    setAnswers([]);
    setCurrentStreak(0);
    setMaxStreak(0);
    setStartedAt(startTimestamp);
    setElapsedSeconds(0);
    setCopied(false);
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

  const selectAnswer = (optionIndex: number, answerTimestamp: number) => {
    if (answerLock.current) return;
    answerLock.current = true;
    const isCorrect = optionIndex === question.correct;
    const nextStreak = isCorrect ? currentStreak + 1 : 0;

    setSelectedOption(optionIndex);
    setAnswerRevealed(true);
    setAnswers((current) => [...current, optionIndex]);
    setCurrentStreak(nextStreak);
    setMaxStreak((current) => Math.max(current, nextStreak));

    feedbackTimer.current = window.setTimeout(() => {
      feedbackTimer.current = null;
      if (questionIndex === questions.length - 1) {
        setElapsedSeconds(Math.max(1, Math.round((answerTimestamp - startedAt) / 1000)));
        setScreen("result");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      setQuestionIndex((current) => current + 1);
      setSelectedOption(null);
      setAnswerRevealed(false);
      answerLock.current = false;
    }, 1050);
  };

  const copyResult = async () => {
    const text = `我在 Tim小课堂完成了${course.title}（${difficulty.label}），${course.report.scoreLabel} ${abilityScore}，获得「${grade.label}」；本轮答对 ${score}/10 题。`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const optionClassName = (index: number) => {
    if (!answerRevealed) return selectedOption === index ? "selected" : "";
    if (index === question.correct) return "correct";
    if (index === selectedOption) return "wrong";
    return "dimmed";
  };

  const selectedWasCorrect = selectedOption === question.correct;

  if (screen === "go") {
    return <GoClassroom onExit={goHome} />;
  }
  if (screen === "xiangqi") {
    return <XiangqiClassroom onExit={goHome} />;
  }

  return (
    <main className="tim-classroom" data-screen={screen}>
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
              <p className="tim-kicker">TIM CLASS · RANDOM 10</p>
              <h1 id="tim-classroom-title">Tim小课堂</h1>
              <p>六门课程与一场校园冒险。随机答题、互动棋谱、人机对弈和像素人生三跃都在这里。</p>

              <div className="tim-avatar-row" aria-hidden="true">
                {courses.map((item) => (
                  <span className={`tim-avatar tim-avatar-${item.key}`} key={item.key}>
                    <img src={item.images.home} alt="" />
                  </span>
                ))}
              </div>
            </div>

            <div className="tim-course-list" aria-label="选择一门小课堂或校园游戏">
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
                  <span className="tim-course-count">3 档 · 随机 10 题</span>
                  <img src={item.images.card} alt="" aria-hidden="true" />
                  <span className="tim-course-arrow" aria-hidden="true">→</span>
                </button>
              ))}
              <button
                className="tim-course tim-course-go"
                type="button"
                onClick={() => {
                  resetAttempt();
                  setScreen("go");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label="选择围棋小课堂：从规则、定式、布局到死活和对弈练习"
              >
                <span className="tim-course-index">05</span>
                <span className="tim-course-copy">
                  <small>GO 501 · SPECIAL</small>
                  <strong>围棋小课堂</strong>
                  <span>规则、定式、布局与死活</span>
                  <em>10 级教学 · AI 对弈 · 趣味证书</em>
                </span>
                <span className="tim-course-count">双模式 · 中国规则</span>
                <Image src="/tim-classroom/go/opponents/normal-tim.png" alt="" aria-hidden="true" width={140} height={164} sizes="70px" />
                <span className="tim-course-arrow" aria-hidden="true">→</span>
              </button>
              <button
                className="tim-course tim-course-xiangqi"
                type="button"
                onClick={() => {
                  resetAttempt();
                  setScreen("xiangqi");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label="选择象棋小课堂：与少年、樵夫和仙人 Tim 进行中国象棋人机对弈"
              >
                <span className="tim-course-index">06</span>
                <span className="tim-course-copy">
                  <small>XIANGQI 601 · ARENA</small>
                  <strong>象棋小课堂</strong>
                  <span>完整规则与人机对弈</span>
                  <em>少年 · 樵夫 · NNUE 仙人</em>
                </span>
                <span className="tim-course-count">3 档 · 红方先行</span>
                <Image src="/tim-classroom/xiangqi/opponents/young-tim.png" alt="" aria-hidden="true" width={140} height={164} sizes="70px" />
                <span className="tim-course-arrow" aria-hidden="true">→</span>
              </button>
              <a
                className="tim-course tim-course-adventure"
                href="/tim-adventure"
                aria-label="进入李来历险记：蓄力跳过北大、普林斯顿与 MIT 三段学习轨迹"
              >
                <span className="tim-course-index">GAME</span>
                <span className="tim-course-copy">
                  <small>PIXEL CAMPUS QUEST</small>
                  <strong>李来历险记</strong>
                  <span>中学 → 北大 → 普林斯顿 → MIT</span>
                  <em>高速蓄力 · 极窄落点 · 失败重开</em>
                </span>
                <span className="tim-course-count">人生三跃 · 1–3 星</span>
                <Image src="/tim-adventure/tim-pku-basketball.png" alt="" aria-hidden="true" width={512} height={768} sizes="70px" />
                <span className="tim-course-arrow" aria-hidden="true">→</span>
              </a>
            </div>

            <button className="tim-scoreboard-link" type="button" onClick={() => setShowScoreboard(true)}>
              <span>🏆</span> 看看同学们的课堂成绩
            </button>

            <footer className="tim-footer">
              <span>{totalBankCount} 套能力题库 + 双棋竞技场 + 李来历险记</span>
              <span>答题、棋谱、AI 对弈与北大—普林斯顿—MIT 像素人生三跃。</span>
              <small>© TIM CLASSROOM · v7.0 · {totalQuestionCount + 600} 题池</small>
            </footer>
          </>
        )}

        {screen === "difficulty" && (
          <div className="tim-difficulty-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goHome}>← 课程</button>
              <span>{course.eyebrow}</span>
              <span>{courseQuestionCount} 题池</span>
            </header>

            <section className="tim-difficulty-hero" aria-labelledby="tim-difficulty-heading">
              <div className="tim-difficulty-mascot" aria-hidden="true"><img src={course.images.difficulty} alt="" /></div>
              <p className="tim-kicker">CHOOSE YOUR LEVEL</p>
              <h1 id="tim-difficulty-heading">{course.title}</h1>
              <p>每一档从独立的 20 题池中随机抽取 10 题。</p>
            </section>

            <div className="tim-difficulty-list" aria-label="选择答题难度">
              {difficultyOrder.map((key, index) => {
                const item = course.difficulties[key];
                return (
                  <button
                    type="button"
                    key={key}
                    className={`tim-difficulty-card tim-difficulty-${key}`}
                    onClick={(event) => startQuiz(key, event.timeStamp)}
                    aria-label={`开始${course.title}${item.label}难度，从20题库随机抽10题`}
                  >
                    <span className="tim-difficulty-number">0{index + 1}</span>
                    <span className="tim-difficulty-copy">
                      <small>{item.english} · {item.level}</small>
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                      <em>{item.focus}</em>
                    </span>
                    <span className="tim-difficulty-total">10<small>随机题</small></span>
                    <span className="tim-difficulty-arrow" aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>

            <p className="tim-difficulty-note">
              <span aria-hidden="true">✦</span>
              随机题会覆盖四项能力维度；同难度重测时重新抽取。
            </p>
          </div>
        )}

        {screen === "quiz" && (
          <div className="tim-quiz-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goDifficulty} aria-label="退出答题并返回难度选择">← 退出</button>
              <span>{course.shortTitle} · {difficulty.label}</span>
              <span>{String(questionIndex + 1).padStart(2, "0")} / {totalQuestions}</span>
            </header>

            <div className="tim-progress" aria-label={`答题进度 ${questionIndex + 1} / ${totalQuestions}`}>
              <span style={{ width: `${((questionIndex + 1) / totalQuestions) * 100}%` }} />
            </div>

            <div className="tim-teacher">
              <div className="tim-teacher-image" aria-hidden="true"><img src={course.images.quiz[questionIndex]} alt="" /></div>
              <div className="tim-speech">
                <small>TIM 老师说 · {difficulty.level}</small>
                <p>{questionIndex === 0 ? course.greetings[difficultyKey] : "点选即作答。看清条件，答案会马上告诉你。"}</p>
              </div>
            </div>

            <section className="tim-question-card" aria-labelledby="tim-question-heading">
              <div className="tim-question-meta">
                <span>{question.category}</span>
                <span>{difficulty.label} · 随机单选</span>
              </div>
              <h1 id="tim-question-heading">{question.prompt}</h1>

              <div className="tim-options" role="radiogroup" aria-label="答案选项">
                {question.options.map((option, index) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedOption === index}
                    className={optionClassName(index)}
                    onClick={(event) => selectAnswer(index, event.timeStamp)}
                    disabled={answerRevealed}
                    key={option}
                  >
                    <span>{optionLetters[index]}</span>
                    <strong>{option}</strong>
                    <i aria-hidden="true">
                      {answerRevealed && index === question.correct ? "✓" : answerRevealed && index === selectedOption ? "×" : ""}
                    </i>
                  </button>
                ))}
              </div>

              {answerRevealed && (
                <div
                  className={`tim-answer-feedback ${selectedWasCorrect ? "is-correct" : "is-wrong"}`}
                  role="status"
                  aria-live="assertive"
                >
                  <span aria-hidden="true">{selectedWasCorrect ? "✓" : "×"}</span>
                  <div>
                    <strong>{selectedWasCorrect ? "回答正确" : "回答错误"}</strong>
                    <small>
                      {selectedWasCorrect
                        ? "Tim +1，正在进入下一题"
                        : `正确答案 ${optionLetters[question.correct]} · ${question.options[question.correct]}`}
                    </small>
                  </div>
                </div>
              )}
            </section>

            <p className="tim-quiz-hint" aria-live="polite">
              {answerRevealed ? "已锁定答案，即将自动进入下一题" : `点击选项立即作答 · 当前最高连对 ${maxStreak}`}
            </p>
          </div>
        )}

        {screen === "result" && (
          <div className="tim-result-shell">
            <header className="tim-quiz-topbar">
              <button type="button" onClick={goHome}>← 首页</button>
              <span>ABILITY REPORT</span>
              <span>{difficulty.label} · 已完成</span>
            </header>

            <section className="tim-result-hero" aria-labelledby="tim-result-heading">
              <p className="tim-kicker">{course.report.english}</p>
              <div className="tim-result-mascot" aria-hidden="true">
                <span className="tim-confetti">✦</span>
                <img src={course.images.result} alt="" />
                <span className="tim-confetti">✦</span>
              </div>
              <div
                className="tim-score-ring"
                style={{ "--score": `${abilityScore}%` } as CSSProperties}
              >
                <strong>{abilityScore}</strong><span>/ 100</span>
              </div>
              <p className="tim-result-label">{course.report.scoreLabel} · {difficulty.label}</p>
              <h1 id="tim-result-heading">{grade.label}</h1>
              <p>{grade.note}</p>
            </section>

            <section className="tim-ability-report" aria-labelledby="tim-ability-report-title">
              <div className="tim-report-heading">
                <div>
                  <small>TIM PERSONAL REPORT</small>
                  <h2 id="tim-ability-report-title">{course.report.title}</h2>
                </div>
                <span>{difficulty.level}</span>
              </div>

              <div className="tim-report-total">
                <strong>{score}<small>/10</small></strong>
                <div>
                  <small>本轮答对题数</small>
                  <b>{grade.label}</b>
                  <p>从 20 题池分维度随机抽取，本报告仅对应本轮作答。</p>
                </div>
              </div>

              <div className="tim-report-stats" aria-label="本轮答题统计">
                <div><small>正确率</small><strong>{abilityScore}%</strong></div>
                <div><small>最高连对</small><strong>{maxStreak}</strong></div>
                <div><small>总用时</small><strong>{elapsedSeconds}s</strong></div>
              </div>

              <div className="tim-dimension-list" aria-label="能力维度表现">
                {dimensionStats.map((item) => (
                  <div className="tim-dimension" key={item.key}>
                    <div className="tim-dimension-head">
                      <span><i style={{ background: item.color }} />{item.label}<small>{item.description}</small></span>
                      <strong>{item.percent}% <small>{item.correct}/{item.total}</small></strong>
                    </div>
                    <div className="tim-dimension-bar"><i style={{ width: `${item.percent}%`, background: item.color }} /></div>
                  </div>
                ))}
              </div>

              <div className="tim-report-summary">
                <span>你的能力画像</span>
                <p><strong>优势项 · {strongestDimension.label}</strong>{strongestDimension.description}表现最突出，本轮正确率为 {strongestDimension.percent}%。</p>
                <p><strong>成长项 · {growthDimension.label}</strong>{growthDimension.description}还有提升空间，下一轮可以重点关注。</p>
              </div>

              <div className="tim-report-tips">
                <h3>Tim 的下一轮建议</h3>
                <ul>
                  <li>{growthDimension.tip}</li>
                  <li>同难度重测会重新随机抽取 10 题，可以观察能力画像是否稳定。</li>
                  <li>先看错题解析，再挑战更高档位，比只追求分数更有效。</li>
                </ul>
              </div>

              <p className="tim-report-disclaimer">{course.report.disclaimer}</p>
            </section>

            <div className="tim-result-actions">
              <button type="button" className="tim-next-button" onClick={(event) => startQuiz(difficultyKey, event.timeStamp)}>
                <span>随机再测 10 题</span><span aria-hidden="true">↻</span>
              </button>
              <button type="button" className="tim-copy-button" onClick={copyResult}>
                {copied ? "报告文案已复制 ✓" : "复制能力报告文案"}
              </button>
              <button type="button" className="tim-change-level" onClick={goDifficulty}>切换难度</button>
            </div>

            <section className="tim-review" aria-labelledby="tim-review-heading">
              <div className="tim-review-heading">
                <div>
                  <small>AFTER CLASS · RANDOM 10</small>
                  <h2 id="tim-review-heading">本轮题目复盘</h2>
                </div>
                <span>{score === totalQuestions ? "全部掌握" : `${totalQuestions - score} 个知识点待复习`}</span>
              </div>

              <div className="tim-review-list">
                {questions.map((item, index) => {
                  const isCorrect = answers[index] === item.correct;
                  return (
                    <details key={`${item.sourceIndex}-${item.prompt}`} className={isCorrect ? "correct" : "incorrect"} open={!isCorrect}>
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
              <p>这是用于展示页面逻辑的匿名示例数据，不代表真实用户成绩或能力。</p>
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
                <p><strong>Tim 的观察</strong>六门课堂都能即时反馈；围棋与象棋可人机对弈，李来历险记则用蓄力跳跃串起三段校园人生。</p>
              </div>
              <button className="tim-next-button" type="button" onClick={() => setShowScoreboard(false)}><span>知道了，去答题</span><span>→</span></button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
