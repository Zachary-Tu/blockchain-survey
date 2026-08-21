"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";

import { GoBoard } from "./GoBoard";
import { goLevels, goOpponents } from "./goCurriculum";
import {
  boardHash,
  createBoard,
  playMove,
  pointLabel,
  scoreChineseArea,
} from "./goEngine";
import type { AreaScore, GoBoardState, GoPoint } from "./goEngine";
import { getGoAiModelProfile, requestGoAiMove, warmupGoAiEngine } from "./goAiEngine";
import type { GoAiHistoryMove, GoAiResult } from "./goAiEngine";
import { buildGoAttempt, goQuestionBankStats } from "./goQuestionBank";
import type { GoLevel, GoMode, GoOpponent, GoQuestion } from "./goTypes";

type GoClassroomProps = {
  onExit: () => void;
};

type GoScreen = "landing" | "levels" | "lesson" | "quiz" | "result" | "opponents" | "game";

type LearnerProfile = {
  id: string;
  nickname: string;
  accessCode: string;
  createdAt?: string;
};

type ProgressEntry = {
  level: number;
  bestScore: number;
  attempts: number;
  stars: number;
  completedAt: string | null;
  lastAttemptAt?: string;
};

type AnswerRecord = {
  question: GoQuestion;
  correct: boolean;
  selectedOption?: number;
  selectedMove?: GoPoint;
};

type GameResult = {
  reason: "score" | "resign" | "move-limit";
  winner: 1 | 2;
  score: AreaScore;
};

const PROFILE_KEY = "tim-go-profile-v1";
const optionLetters = ["A", "B", "C", "D"];
const boardSizes = [9, 13, 19] as const;

function samePoint(left: GoPoint, right: GoPoint) {
  return left.row === right.row && left.col === right.col;
}

function lineMatchesPrefix(line: GoPoint[], prefix: GoPoint[]) {
  return prefix.every((move, index) => Boolean(line[index] && samePoint(line[index], move)));
}

function uniquePoints(points: GoPoint[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.row},${point.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function solutionLabel(question: Extract<GoQuestion, { type: "board" }>) {
  return question.solutionLines[0]
    .map((move, index) => `${index + 1}.${pointLabel(move, question.boardSize)}`)
    .join(" → ");
}

function setupQuestionBoard(question: GoQuestion): GoBoardState {
  if (question.type !== "board") return createBoard(5);
  const board = createBoard(question.boardSize);
  for (const stone of question.stones) board[stone.row][stone.col] = stone.color;
  return board;
}

function certificateLabel(score: number, total: number, rank: string) {
  const percent = Math.round((score / Math.max(1, total)) * 100);
  if (percent >= 90) return `三星 · ${rank}满星棋士`;
  if (percent >= 80) return `二星 · ${rank}进阶棋士`;
  if (percent >= 60) return `${rank}进步棋士`;
  return "勇气重练章";
}

function starsFor(score: number, total: number) {
  const percent = Math.round((score / Math.max(1, total)) * 100);
  return percent >= 90 ? 3 : percent >= 80 ? 2 : percent >= 60 ? 1 : 0;
}

function shortLearnerId(id: string) {
  return id ? `TIM-${id.slice(0, 4).toUpperCase()}-${id.slice(-4).toUpperCase()}` : "";
}

export function GoClassroom({ onExit }: GoClassroomProps) {
  const [screen, setScreen] = useState<GoScreen>("landing");
  const [, setMode] = useState<GoMode | null>(null);
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [profileReady, setProfileReady] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [pendingMode, setPendingMode] = useState<GoMode | null>(null);
  const [nickname, setNickname] = useState("");
  const [restoreId, setRestoreId] = useState("");
  const [restoreCode, setRestoreCode] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [selectedLevelId, setSelectedLevelId] = useState(1);
  const [questions, setQuestions] = useState<GoQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<AnswerRecord | null>(null);
  const [quizMode, setQuizMode] = useState<"quiz" | "retry">("quiz");
  const [quizStartedAt, setQuizStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [certificateId, setCertificateId] = useState("");
  const [recordStatus, setRecordStatus] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [puzzleBoard, setPuzzleBoard] = useState<GoBoardState>(() => createBoard(5));
  const [puzzlePrefix, setPuzzlePrefix] = useState<GoPoint[]>([]);
  const [puzzleCandidates, setPuzzleCandidates] = useState<GoPoint[][]>([]);
  const [puzzleBusy, setPuzzleBusy] = useState(false);
  const [puzzleMessage, setPuzzleMessage] = useState("在棋盘上落下你的第一手。");
  const [puzzleFirstMove, setPuzzleFirstMove] = useState<GoPoint | null>(null);
  const [hintVisible, setHintVisible] = useState(false);

  const [boardSize, setBoardSize] = useState<(typeof boardSizes)[number]>(9);
  const [selectedOpponentId, setSelectedOpponentId] = useState<GoOpponent["id"]>("normal");
  const [gameBoard, setGameBoard] = useState<GoBoardState>(() => createBoard(9));
  const [gameHistory, setGameHistory] = useState<string[]>(() => [boardHash(createBoard(9))]);
  const [lastMove, setLastMove] = useState<GoPoint | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [capturedBlack, setCapturedBlack] = useState(0);
  const [capturedWhite, setCapturedWhite] = useState(0);
  const [consecutivePasses, setConsecutivePasses] = useState(0);
  const [aiThinking, setAiThinking] = useState(false);
  const [gameMessage, setGameMessage] = useState("黑棋先行。点击交叉点落子。你执黑，Tim 执白。");
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [moveLog, setMoveLog] = useState<string[]>([]);
  const [gameBoards, setGameBoards] = useState<GoBoardState[]>(() => [createBoard(9)]);
  const [gameMoves, setGameMoves] = useState<GoAiHistoryMove[]>([]);
  const [engineStatus, setEngineStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [engineLabel, setEngineLabel] = useState("神经网络尚未加载");
  const [lastAiAnalysis, setLastAiAnalysis] = useState<GoAiResult | null>(null);
  const aiTimer = useRef<number | null>(null);
  const puzzleTimer = useRef<number | null>(null);
  const aiRequestId = useRef(0);
  const engineModelTarget = useRef<string | null>(null);

  const selectedLevel = goLevels.find((level) => level.id === selectedLevelId) ?? goLevels[0];
  const selectedOpponent = goOpponents.find((item) => item.id === selectedOpponentId) ?? goOpponents[0];
  const question = questions[questionIndex];
  const score = answers.filter((answer) => answer.correct).length;
  const resultPercent = Math.round((score / Math.max(1, answers.length)) * 100);
  const wrongAnswers = answers.filter((answer) => !answer.correct);

  useEffect(() => {
    let cancelled = false;
    const synchronizeProfile = async () => {
      await Promise.resolve();
      const saved = window.localStorage.getItem(PROFILE_KEY);
      if (!saved) {
        if (!cancelled) setProfileReady(true);
        return;
      }
      try {
        const parsed = JSON.parse(saved) as LearnerProfile;
        if (!cancelled) setProfile(parsed);
        const response = await fetch("/api/tim-go/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "load", learnerId: parsed.id, accessCode: parsed.accessCode }),
        });
        if (!response.ok) throw new Error("学习档案同步失败");
        const data = await response.json() as { learner: LearnerProfile; progress: ProgressEntry[] };
        if (cancelled) return;
        setProfile(data.learner);
        setProgress(data.progress);
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify(data.learner));
      } catch {
        if (!cancelled) setRecordStatus("offline");
      } finally {
        if (!cancelled) setProfileReady(true);
      }
    };
    void synchronizeProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
    if (puzzleTimer.current !== null) window.clearTimeout(puzzleTimer.current);
    aiRequestId.current += 1;
  }, []);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const preparePuzzle = (nextQuestion: GoQuestion | undefined) => {
    if (!nextQuestion || nextQuestion.type !== "board") return;
    if (puzzleTimer.current !== null) window.clearTimeout(puzzleTimer.current);
    setPuzzleBoard(setupQuestionBoard(nextQuestion));
    setPuzzlePrefix([]);
    setPuzzleCandidates(nextQuestion.solutionLines);
    setPuzzleBusy(false);
    setPuzzleMessage(nextQuestion.solutionLines.some((line) => line.length > 1)
      ? `这是连续阅读题：你需要下 ${Math.ceil(Math.max(...nextQuestion.solutionLines.map((line) => line.length)) / 2)} 手，Tim 会自动应手。`
      : "请在棋盘上落下推荐的一手。");
    setPuzzleFirstMove(null);
    setHintVisible(false);
  };

  const primeEngine = (opponentId: GoOpponent["id"]) => {
    const profile = getGoAiModelProfile(opponentId);
    if ((engineStatus === "loading" || engineStatus === "ready") && engineModelTarget.current === profile.tier) return;
    engineModelTarget.current = profile.tier;
    setEngineStatus("loading");
    setEngineLabel(`首次加载${profile.downloadLabel} ${profile.publicLabel}…`);
    void warmupGoAiEngine(opponentId).then((result) => {
      if (engineModelTarget.current !== profile.tier) return;
      if (result.ready) {
        setEngineStatus("ready");
        setEngineLabel(`${result.modelName} · ${result.backend}${result.degraded ? " · 已自动轻量降级" : ""}`);
      } else {
        setEngineStatus("fallback");
        setEngineLabel("神经网络不可用，将使用本地战术搜索");
      }
    });
  };

  const routeForMode = (nextMode: GoMode) => {
    setMode(nextMode);
    setScreen(nextMode === "learn" ? "levels" : "opponents");
    if (nextMode === "play") {
      setEngineStatus("idle");
      setEngineLabel("选择 Boss 后加载对应棋力模型");
      engineModelTarget.current = null;
    }
    scrollTop();
  };

  const chooseMode = (nextMode: GoMode) => {
    if (!profile) {
      setPendingMode(nextMode);
      setShowProfileSetup(true);
      setProfileError("");
      return;
    }
    routeForMode(nextMode);
  };

  const saveProfile = (learner: LearnerProfile, learnerProgress: ProgressEntry[]) => {
    setProfile(learner);
    setProgress(learnerProgress);
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(learner));
    setShowProfileSetup(false);
    setShowRecovery(false);
    setProfileError("");
    if (pendingMode) routeForMode(pendingMode);
    setPendingMode(null);
  };

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    try {
      const response = await fetch("/api/tim-go/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", nickname }),
      });
      const data = await response.json() as { learner?: LearnerProfile; progress?: ProgressEntry[]; error?: string };
      if (!response.ok || !data.learner) throw new Error(data.error ?? "创建档案失败");
      saveProfile(data.learner, data.progress ?? []);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "创建档案失败");
    } finally {
      setProfileBusy(false);
    }
  };

  const restoreProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    try {
      const response = await fetch("/api/tim-go/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "load", learnerId: restoreId.trim(), accessCode: restoreCode.trim() }),
      });
      const data = await response.json() as { learner?: LearnerProfile; progress?: ProgressEntry[]; error?: string };
      if (!response.ok || !data.learner) throw new Error(data.error ?? "恢复档案失败");
      saveProfile(data.learner, data.progress ?? []);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "恢复档案失败");
    } finally {
      setProfileBusy(false);
    }
  };

  const goBack = () => {
    if (screen === "landing") {
      onExit();
      return;
    }
    if (screen === "levels" || screen === "opponents") {
      setScreen("landing");
      setMode(null);
    } else if (screen === "lesson" || screen === "result") {
      setScreen("levels");
    } else if (screen === "quiz") {
      if (puzzleTimer.current !== null) window.clearTimeout(puzzleTimer.current);
      setPuzzleBusy(false);
      setScreen("lesson");
    } else if (screen === "game") {
      if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
      aiRequestId.current += 1;
      setAiThinking(false);
      setScreen("opponents");
    }
    scrollTop();
  };

  const openLevel = (level: GoLevel) => {
    setSelectedLevelId(level.id);
    setScreen("lesson");
    scrollTop();
  };

  const startQuiz = (families: string[] | undefined, nextMode: "quiz" | "retry", startTimestamp: number) => {
    const nextQuestions = buildGoAttempt(selectedLevel.id, families);
    setQuestions(nextQuestions);
    preparePuzzle(nextQuestions[0]);
    setQuestionIndex(0);
    setAnswers([]);
    setCurrentAnswer(null);
    setPuzzleBusy(false);
    setHintVisible(false);
    setQuizMode(nextMode);
    setQuizStartedAt(startTimestamp);
    setElapsedMs(0);
    setCertificateId("");
    setRecordStatus("idle");
    setScreen("quiz");
    scrollTop();
  };

  const answerChoice = (selectedOption: number) => {
    if (!question || question.type !== "choice" || currentAnswer) return;
    const answer: AnswerRecord = {
      question,
      selectedOption,
      correct: selectedOption === question.correct,
    };
    setCurrentAnswer(answer);
    setAnswers((current) => [...current, answer]);
  };

  const finishPuzzleAnswer = (activeQuestion: Extract<GoQuestion, { type: "board" }>, correct: boolean, selectedMove: GoPoint) => {
    const answer: AnswerRecord = { question: activeQuestion, selectedMove, correct };
    setCurrentAnswer(answer);
    setAnswers((current) => [...current, answer]);
    setPuzzleBusy(false);
    setPuzzleMessage(correct ? activeQuestion.success : activeQuestion.failure);
  };

  const answerBoard = (selectedMove: GoPoint) => {
    if (!question || question.type !== "board" || currentAnswer || puzzleBusy) return;
    const result = playMove(puzzleBoard, question.toPlay, selectedMove);
    if (!result.valid) {
      setPuzzleMessage(result.reason ?? "这一手不能下，请重新选择。");
      return;
    }

    const ply = puzzlePrefix.length;
    const nextPrefix = [...puzzlePrefix, selectedMove];
    const matching = puzzleCandidates.filter((line) => line[ply] && samePoint(line[ply], selectedMove));
    const firstMove = puzzleFirstMove ?? selectedMove;
    if (!puzzleFirstMove) setPuzzleFirstMove(selectedMove);

    if (!matching.length) {
      setPuzzlePrefix(nextPrefix);
      finishPuzzleAnswer(question, false, selectedMove);
      return;
    }

    setPuzzleBoard(result.board);
    setPuzzlePrefix(nextPrefix);
    setPuzzleCandidates(matching);
    const branch = matching[0];
    if (nextPrefix.length >= branch.length) {
      finishPuzzleAnswer(question, true, firstMove);
      return;
    }

    const reply = branch[nextPrefix.length];
    setPuzzleBusy(true);
    setPuzzleMessage(`这手方向正确。Tim 正在应在 ${pointLabel(reply, question.boardSize)}…`);
    puzzleTimer.current = window.setTimeout(() => {
      puzzleTimer.current = null;
      const replyColor = question.toPlay === 1 ? 2 : 1;
      const replyResult = playMove(result.board, replyColor, reply);
      if (!replyResult.valid) {
        finishPuzzleAnswer(question, false, firstMove);
        setPuzzleMessage(`题目变化加载失败：${replyResult.reason ?? "应手非法"}`);
        return;
      }
      const afterReplyPrefix = [...nextPrefix, reply];
      const afterReplyCandidates = matching.filter((line) => lineMatchesPrefix(line, afterReplyPrefix));
      setPuzzleBoard(replyResult.board);
      setPuzzlePrefix(afterReplyPrefix);
      setPuzzleCandidates(afterReplyCandidates.length ? afterReplyCandidates : [branch]);
      if (afterReplyPrefix.length >= branch.length) {
        finishPuzzleAnswer(question, true, firstMove);
      } else {
        const userMoveNumber = Math.floor(afterReplyPrefix.length / 2) + 1;
        setPuzzleBusy(false);
        setPuzzleMessage(`Tim 已应 ${pointLabel(reply, question.boardSize)}。请继续下你的第 ${userMoveNumber} 手。`);
      }
    }, 420);
  };

  const mergeProgress = (entry: ProgressEntry) => {
    setProgress((current) => {
      const existing = current.find((item) => item.level === entry.level);
      if (!existing) return [...current, entry].sort((left, right) => left.level - right.level);
      return current.map((item) => item.level === entry.level ? {
        ...item,
        bestScore: Math.max(item.bestScore, entry.bestScore),
        attempts: Math.max(item.attempts + 1, entry.attempts),
        stars: Math.max(item.stars, entry.stars),
        completedAt: item.completedAt ?? entry.completedAt,
      } : item);
    });
  };

  const saveAttempt = async (finalAnswers: AnswerRecord[], duration: number) => {
    const localCertificate = `TIM-GO-${String(selectedLevel.id).padStart(2, "0")}-${Math.max(0, Math.round(quizStartedAt)).toString(36).toUpperCase()}`;
    setCertificateId(localCertificate);
    if (!profile) {
      setRecordStatus("offline");
      return;
    }
    setRecordStatus("saving");
    const finalScore = finalAnswers.filter((answer) => answer.correct).length;
    try {
      const response = await fetch("/api/tim-go/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "attempt",
          learnerId: profile.id,
          accessCode: profile.accessCode,
          level: selectedLevel.id,
          mode: quizMode,
          score: finalScore,
          total: finalAnswers.length,
          durationMs: duration,
          answers: finalAnswers.map((answer) => ({
            questionId: answer.question.id,
            family: answer.question.family,
            correct: answer.correct,
            selectedOption: answer.selectedOption,
            selectedMove: answer.selectedMove,
          })),
        }),
      });
      const data = await response.json() as { certificateId?: string; progress?: ProgressEntry; error?: string };
      if (!response.ok) throw new Error(data.error ?? "保存失败");
      if (data.certificateId) setCertificateId(data.certificateId);
      if (data.progress) mergeProgress(data.progress);
      setRecordStatus("saved");
    } catch {
      setRecordStatus("offline");
    }
  };

  const nextQuestion = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!currentAnswer) return;
    if (puzzleTimer.current !== null) window.clearTimeout(puzzleTimer.current);
    if (questionIndex < questions.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      setCurrentAnswer(null);
      preparePuzzle(questions[nextIndex]);
      scrollTop();
      return;
    }
    const duration = Math.max(1000, event.timeStamp - quizStartedAt);
    setElapsedMs(duration);
    setScreen("result");
    setCurrentAnswer(null);
    void saveAttempt(answers, duration);
    scrollTop();
  };

  const retryWrong = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const families = wrongAnswers.map((answer) => answer.question.family);
    startQuiz(families.length ? families : undefined, families.length ? "retry" : "quiz", event.timeStamp);
  };

  const downloadCertificate = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#06101c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0c2630";
    for (let x = 0; x < canvas.width; x += 32) {
      context.fillRect(x, 0, 16, 16);
      context.fillRect(x, canvas.height - 16, 16, 16);
    }
    context.fillStyle = "#f5dfad";
    context.fillRect(55, 55, 1090, 690);
    context.fillStyle = "#17333a";
    context.fillRect(73, 73, 1054, 654);
    context.strokeStyle = "#62dec8";
    context.lineWidth = 6;
    context.strokeRect(96, 96, 1008, 608);
    context.fillStyle = "#f9f5e9";
    context.textAlign = "center";
    context.font = "700 34px sans-serif";
    context.fillText("TIM GO CLASS · 可爱像素证书", 600, 165);
    context.font = "900 68px sans-serif";
    context.fillText(certificateLabel(score, answers.length, selectedLevel.rank), 600, 270);
    context.fillStyle = "#7ce6d2";
    context.font = "700 42px sans-serif";
    context.fillText(profile?.nickname ?? "Tim 棋友", 600, 360);
    context.fillStyle = "#d5dee1";
    context.font = "30px sans-serif";
    context.fillText(`完成「${selectedLevel.title}」· 答对 ${score}/${answers.length} · ${resultPercent}分`, 600, 420);
    context.fillStyle = "#9eb1b8";
    context.font = "24px monospace";
    context.fillText(certificateId || "TIM-GO-PRACTICE", 600, 620);
    context.fillText(new Date().toLocaleDateString("zh-CN"), 600, 662);
    const drawStone = (x: number, y: number, color: string, highlight: string) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, 52, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = highlight;
      context.beginPath();
      context.arc(x - 15, y - 17, 10, 0, Math.PI * 2);
      context.fill();
    };
    drawStone(260, 515, "#070b0e", "#52616a");
    drawStone(940, 515, "#e9e4d8", "#ffffff");
    const link = document.createElement("a");
    link.download = `Tim围棋证书-${selectedLevel.rank}-${profile?.nickname ?? "棋友"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const saveGame = async (result: GameResult, finalMoveCount: number) => {
    if (!profile) return;
    try {
      await fetch("/api/tim-go/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "game",
          learnerId: profile.id,
          accessCode: profile.accessCode,
          opponentId: selectedOpponent.id,
          boardSize,
          result: result.reason === "resign" ? "player_resigned" : result.winner === 1 ? "player_win" : "ai_win",
          scoreData: result.score,
          moveCount: finalMoveCount,
          durationMs: Math.max(1000, finalMoveCount * 1200),
        }),
      });
    } catch {
      setRecordStatus("offline");
    }
  };

  const finishGame = (reason: GameResult["reason"], board: GoBoardState, forcedWinner?: 1 | 2, finalMoveCount = moveCount) => {
    if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
    aiRequestId.current += 1;
    const scoreData = scoreChineseArea(board);
    const result: GameResult = {
      reason,
      winner: forcedWinner ?? scoreData.winner,
      score: scoreData,
    };
    setAiThinking(false);
    setGameResult(result);
    setGameMessage(reason === "resign" ? "你选择了认输。这盘棋已经记入练习记录。" : "双方停一手，练习盘进入中国规则自动数子。");
    void saveGame(result, finalMoveCount);
  };

  const scheduleAi = (
    board: GoBoardState,
    history: string[],
    nextMoveCount: number,
    passes: number,
    boards: GoBoardState[],
    moves: GoAiHistoryMove[],
  ) => {
    const requestId = ++aiRequestId.current;
    setAiThinking(true);
    setGameMessage(`${selectedOpponent.name} 正在用神经网络评估候选，再进行 MCTS 搜索…`);
    aiTimer.current = window.setTimeout(() => {
      aiTimer.current = null;
      void requestGoAiMove({
        board,
        previousBoard: boards.at(-2),
        previousPreviousBoard: boards.at(-3),
        aiColor: 2,
        opponentId: selectedOpponent.id,
        positionHistory: history,
        moveHistory: moves,
        moveNumber: nextMoveCount,
      }).then((analysis) => {
        if (requestId !== aiRequestId.current) return;
        setLastAiAnalysis(analysis);
        setEngineStatus(analysis.engine === "neural-mcts" ? "ready" : "fallback");
        setEngineLabel(analysis.engine === "neural-mcts"
          ? `${analysis.modelName} · ${analysis.backend} · ${analysis.visits} visits`
          : `${analysis.modelName} · 本地降级`);
        const move = analysis.move;
      if (!move) {
        const nextPasses = passes + 1;
        const finalMoveCount = nextMoveCount + 1;
        const nextMoves = [...moves, { x: -1, y: -1, player: "white" as const }];
        const nextBoards = [...boards, board];
        setAiThinking(false);
        setConsecutivePasses(nextPasses);
        setMoveCount(finalMoveCount);
        setGameMoves(nextMoves);
        setGameBoards(nextBoards);
        setMoveLog((current) => [...current, `${selectedOpponent.name}：停一手`]);
        if (nextPasses >= 2) {
          finishGame("score", board, undefined, finalMoveCount);
        } else {
          setGameMessage(`${selectedOpponent.name} 搜索后选择停一手。轮到你执黑。`);
        }
        return;
      }
      const result = playMove(board, 2, move, history);
      if (!result.valid) {
        setAiThinking(false);
        setEngineStatus("fallback");
        setGameMessage(`AI 候选与本地规则校验冲突：${result.reason ?? "非法落子"}。本手按停一手处理。`);
        setConsecutivePasses(1);
        return;
      }
      const hash = boardHash(result.board);
      const finalMoveCount = nextMoveCount + 1;
      const nextMoves = [...moves, { x: move.col, y: move.row, player: "white" as const }];
      const nextBoards = [...boards, result.board];
      setGameBoard(result.board);
      setGameHistory([...history, hash]);
      setGameMoves(nextMoves);
      setGameBoards(nextBoards);
      setLastMove(move);
      setMoveCount(finalMoveCount);
      setCapturedBlack((current) => current + result.captured);
      setConsecutivePasses(0);
      setAiThinking(false);
      setGameMessage(`${selectedOpponent.name} 落在 ${pointLabel(move, board.length)} · ${analysis.engine === "neural-mcts" ? `${analysis.visits} 次搜索访问` : "本地战术搜索"}。轮到你执黑。`);
      setMoveLog((current) => [...current, `${selectedOpponent.name}：${pointLabel(move, board.length)}${result.captured ? `，提 ${result.captured} 子` : ""}`]);
      if (finalMoveCount >= board.length * board.length * 2) finishGame("move-limit", result.board, undefined, finalMoveCount);
      });
    }, 240);
  };

  const startGame = (opponent: GoOpponent) => {
    if (aiTimer.current !== null) window.clearTimeout(aiTimer.current);
    aiRequestId.current += 1;
    const board = createBoard(boardSize);
    setSelectedOpponentId(opponent.id);
    setGameBoard(board);
    setGameHistory([boardHash(board)]);
    setGameBoards([board]);
    setGameMoves([]);
    setLastMove(null);
    setMoveCount(0);
    setCapturedBlack(0);
    setCapturedWhite(0);
    setConsecutivePasses(0);
    setAiThinking(false);
    setGameResult(null);
    setLastAiAnalysis(null);
    setMoveLog([]);
    setGameMessage("黑棋先行。点击交叉点落子。你执黑，Tim 执白。");
    setScreen("game");
    primeEngine(opponent.id);
    scrollTop();
  };

  const playerMove = (point: GoPoint) => {
    if (aiThinking || gameResult) return;
    const result = playMove(gameBoard, 1, point, gameHistory);
    if (!result.valid) {
      setGameMessage(result.reason ?? "这一手不能下。");
      return;
    }
    const nextHistory = [...gameHistory, boardHash(result.board)];
    const nextCount = moveCount + 1;
    const nextBoards = [...gameBoards, result.board];
    const nextMoves = [...gameMoves, { x: point.col, y: point.row, player: "black" as const }];
    setGameBoard(result.board);
    setGameHistory(nextHistory);
    setGameBoards(nextBoards);
    setGameMoves(nextMoves);
    setLastMove(point);
    setMoveCount(nextCount);
    setCapturedWhite((current) => current + result.captured);
    setConsecutivePasses(0);
    setMoveLog((current) => [...current, `你：${pointLabel(point, gameBoard.length)}${result.captured ? `，提 ${result.captured} 子` : ""}`]);
    scheduleAi(result.board, nextHistory, nextCount, 0, nextBoards, nextMoves);
  };

  const playerPass = () => {
    if (aiThinking || gameResult) return;
    const nextPasses = consecutivePasses + 1;
    const nextCount = moveCount + 1;
    const nextMoves = [...gameMoves, { x: -1, y: -1, player: "black" as const }];
    const nextBoards = [...gameBoards, gameBoard];
    setConsecutivePasses(nextPasses);
    setMoveCount(nextCount);
    setGameMoves(nextMoves);
    setGameBoards(nextBoards);
    setMoveLog((current) => [...current, "你：停一手"]);
    if (nextPasses >= 2) {
      finishGame("score", gameBoard, undefined, nextCount);
      return;
    }
    scheduleAi(gameBoard, gameHistory, nextCount, nextPasses, nextBoards, nextMoves);
  };

  const topbarLabel = screen === "quiz"
    ? `${selectedLevel.rank} · ${questionIndex + 1}/${questions.length}`
    : screen === "game"
      ? `${boardSize}路 · 对弈中`
      : "中国规则";

  return (
    <main className="go-classroom" data-screen={screen}>
      <section className="go-phone">
        <div className="go-grid" aria-hidden="true" />
        <header className="go-topbar">
          <button type="button" onClick={goBack}>← {screen === "landing" ? "课程" : screen === "levels" || screen === "opponents" ? "模式" : "返回"}</button>
          <span><i /> 05 · GO CLASS</span>
          <span>{topbarLabel}</span>
        </header>

        {screen === "landing" && (
          <>
            <section className="go-hero">
              <div className="go-hero-mark" aria-hidden="true">
                <span className="go-stone go-stone-black" />
                <span className="go-stone go-stone-white" />
              </div>
              <p>LEARN · PLAY · REVIEW</p>
              <h1>围棋小课堂</h1>
              <span>从第一口气，到第一盘完整对局</span>
            </section>

            {profile && (
              <button className="go-profile-chip" type="button" onClick={() => setShowProfileSetup(true)}>
                <span>●</span><div><strong>{profile.nickname}</strong><small>{shortLearnerId(profile.id)} · {progress.length} 级有记录</small></div><b>档案 →</b>
              </button>
            )}

            <div className="go-mode-list" aria-label="选择围棋学习模式">
              <button type="button" className="go-mode-card go-mode-learn" onClick={() => chooseMode("learn")}>
                <small>01 · STEP BY STEP</small>
                <strong>答题学习</strong>
                <span>10 个级别 · 学习 → 练习 → 复盘</span>
                <em>全棋谱落子题 · 每级 60 个变式随机 10 题</em>
                <b aria-hidden="true">→</b>
              </button>
              <button type="button" className="go-mode-card go-mode-play" onClick={() => chooseMode("play")}>
                <small>02 · PLAY WITH TIM</small>
                <strong>对弈练习</strong>
                <span>9 / 13 / 19 路棋盘 · 四档棋力</span>
                <em>从古风弈士一路挑战到赛亚人 Tim</em>
                <b aria-hidden="true">→</b>
              </button>
            </div>

            <aside className="go-soft-rule">
              <span aria-hidden="true">✦</span>
              <p><strong>轻松晋级</strong>80% 可获得星级证书；没到 80% 也能复盘后继续，不把学习卡得太死。</p>
            </aside>
          </>
        )}

        {screen === "levels" && (
          <section className="go-selection" aria-labelledby="go-level-heading">
            <div className="go-section-heading">
              <small>10 LEVEL ROADMAP</small>
              <h1 id="go-level-heading">选择学习级别</h1>
              <p>所有级别都可直接进入；完成后保留最佳分数、练习次数和像素证书。</p>
            </div>
            <div className="go-level-list">
              {goLevels.map((level) => {
                const levelProgress = progress.find((item) => item.level === level.id);
                return (
                  <button type="button" key={level.id} style={{ "--go-level": level.color } as CSSProperties} onClick={() => openLevel(level)}>
                    <span>{String(level.id).padStart(2, "0")}</span>
                    <div>
                      <small>{level.rank} · {level.focus}</small>
                      <strong>{level.title}</strong>
                      <em>{levelProgress ? `最佳 ${levelProgress.bestScore}分 · ${"★".repeat(levelProgress.stars)}${"☆".repeat(3 - levelProgress.stars)} · ${levelProgress.attempts}次` : level.subtitle}</em>
                    </div>
                    <b aria-hidden="true">→</b>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {screen === "lesson" && (
          <section className="go-lesson" style={{ "--go-level": selectedLevel.color } as CSSProperties}>
            <div className="go-lesson-visual">
              <Image src={selectedLevel.image} alt={`${selectedLevel.title}的像素 Tim 围棋教学场景`} width={760} height={760} sizes="(max-width: 430px) 100vw, 390px" />
              <span>LEVEL {String(selectedLevel.id).padStart(2, "0")}</span>
            </div>
            <div className="go-lesson-heading">
              <small>{selectedLevel.rank} · {selectedLevel.focus}</small>
              <h1>{selectedLevel.title}</h1>
              <p>{selectedLevel.subtitle}</p>
            </div>
            <div className="go-objectives">
              <strong>本级学会</strong>
              {selectedLevel.objectives.map((objective, index) => <span key={objective}><i>{index + 1}</i>{objective}</span>)}
            </div>
            <div className="go-lesson-notes">
              {selectedLevel.lessons.map((lesson, index) => (
                <article key={lesson.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><h2>{lesson.title}</h2><p>{lesson.body}</p><small>Tim 提醒：{lesson.tip}</small></div>
                </article>
              ))}
            </div>
            <button className="go-primary-button" type="button" onClick={(event) => startQuiz(undefined, "quiz", event.timeStamp)}><span>随机抽取 10 题</span><b>开始练习 →</b></button>
            <p className="go-lesson-footnote">每级 {goQuestionBankStats.themesPerLevel} 个棋谱主题 × {goQuestionBankStats.variantsPerTheme} 种旋转镜像 · 本轮每主题 1 题</p>
          </section>
        )}

        {screen === "quiz" && question && (
          <section className="go-quiz" style={{ "--go-level": selectedLevel.color } as CSSProperties}>
            <div className="go-quiz-progress"><i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
            <div className="go-quiz-teacher">
              <Image src={selectedLevel.image} alt="" width={164} height={144} sizes="82px" />
              <div><small>TIM 老师 · {question.category}</small><p>{currentAnswer ? "按棋盘编号复盘推荐变化，再去下一题。" : question.type === "board" && question.solutionLines.some((line) => line.length > 1) ? "这是连续阅读题：你落子，Tim 自动应手，直到变化结束。" : "先判断局面任务，再在棋盘交叉点落子。"}</p></div>
            </div>
            <article className="go-question-card">
              <div className="go-question-meta"><span>{question.type === "board" ? `棋谱落子题 · ${question.category}` : "知识判断题"}</span><b>{questionIndex + 1} / {questions.length}</b></div>
              <h1>{question.prompt}</h1>

              {question.type === "choice" ? (
                <div className="go-choice-list" role="radiogroup" aria-label="围棋题目选项">
                  {question.options.map((option, index) => {
                    const className = !currentAnswer ? "" : index === question.correct ? "correct" : index === currentAnswer.selectedOption ? "wrong" : "dimmed";
                    return (
                      <button type="button" key={option} role="radio" aria-checked={currentAnswer?.selectedOption === index} className={className} disabled={Boolean(currentAnswer)} onClick={() => answerChoice(index)}>
                        <span>{optionLetters[index]}</span><strong>{option}</strong><i>{currentAnswer && index === question.correct ? "✓" : currentAnswer?.selectedOption === index ? "×" : ""}</i>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="go-quiz-board-wrap">
                  <div className="go-to-play"><span className={question.toPlay === 1 ? "black" : "white"} />{question.toPlay === 1 ? "黑" : "白"}先</div>
                  <GoBoard
                    board={puzzleBoard}
                    onPlay={answerBoard}
                    disabled={Boolean(currentAnswer) || puzzleBusy}
                    lastMove={puzzlePrefix.at(-1)}
                    selectedMove={currentAnswer?.selectedMove}
                    correctMoves={currentAnswer ? uniquePoints(question.solutionLines.map((line) => line[0])) : []}
                    variation={currentAnswer ? question.solutionLines[0] : []}
                    label={`${selectedLevel.title}互动落子题`}
                    compact
                  />
                  <div className={`go-puzzle-status ${puzzleBusy ? "is-thinking" : ""}`} aria-live="polite">
                    <span>{puzzleBusy ? "···" : puzzlePrefix.length ? `${puzzlePrefix.length} 手` : "读"}</span>
                    <p>{puzzleMessage}</p>
                  </div>
                  {!currentAnswer && (
                    <div className="go-puzzle-hint">
                      <button type="button" onClick={() => setHintVisible((visible) => !visible)}>{hintVisible ? "收起提示" : "给我一点提示"}</button>
                      {hintVisible && <p>{question.hint}</p>}
                    </div>
                  )}
                </div>
              )}

              {currentAnswer && (
                <div className={`go-answer-panel ${currentAnswer.correct ? "correct" : "wrong"}`} role="status">
                  <span>{currentAnswer.correct ? "✓" : "!"}</span>
                  <div>
                    <strong>{currentAnswer.correct ? "这手正确" : "这手还可以更好"}</strong>
                    {question.type === "choice" && !currentAnswer.correct && <small>正确答案：{optionLetters[question.correct]} · {question.options[question.correct]}</small>}
                    {question.type === "board" && (
                      <>
                        <small>推荐起手：{uniquePoints(question.solutionLines.map((line) => line[0])).map((point) => pointLabel(point, question.boardSize)).join(" / ")}</small>
                        <small>推荐变化：{question.solutionLines[0].map((point, index) => `${index + 1}.${pointLabel(point, question.boardSize)}`).join(" → ")}</small>
                      </>
                    )}
                    <p>{question.explanation}</p>
                    {question.type === "board" && question.stepNotes.length > 1 && (
                      <ol className="go-variation-notes">
                        {question.stepNotes.map((note, index) => <li key={`${question.id}-note-${index}`}><b>{index + 1}</b>{note}</li>)}
                      </ol>
                    )}
                  </div>
                </div>
              )}
            </article>
            {currentAnswer ? (
              <button className="go-primary-button" type="button" onClick={nextQuestion}><span>{questionIndex === questions.length - 1 ? "完成本级" : "继续下一题"}</span><b>→</b></button>
            ) : <p className="go-quiz-tip">{question.type === "board" ? "每一手都会先做合法性检查；答完不会自动跳题" : "点选后立即显示正确答案和讲解"}</p>}
          </section>
        )}

        {screen === "result" && (
          <section className="go-result" style={{ "--go-level": selectedLevel.color } as CSSProperties}>
            <div className="go-result-heading"><small>LEVEL COMPLETE · 娱乐证书</small><h1>{certificateLabel(score, answers.length, selectedLevel.rank)}</h1><p>晋级不会卡死：复盘错题后可直接继续，也可以留下来重练。</p></div>
            <article className="go-certificate">
              <div className="go-certificate-pixels" aria-hidden="true" />
              <div className="go-certificate-stones" aria-hidden="true"><i /><i /></div>
              <small>TIM GO CLASS · MOSAIC CERTIFICATE</small>
              <h2>{certificateLabel(score, answers.length, selectedLevel.rank)}</h2>
              <strong>{profile?.nickname ?? "Tim 棋友"}</strong>
              <p>完成「{selectedLevel.title}」学习与练习</p>
              <div><b>{resultPercent}</b><span>分</span><em>{score} / {answers.length} 题</em></div>
              <footer><span>{certificateId || "正在生成证书编号…"}</span><span>{new Date().toLocaleDateString("zh-CN")}</span></footer>
            </article>
            <div className="go-result-stats">
              <div><small>本轮用时</small><strong>{Math.max(1, Math.round(elapsedMs / 1000))}s</strong></div>
              <div><small>获得星星</small><strong>{"★".repeat(starsFor(score, answers.length)) || "练"}</strong></div>
              <div><small>云端记录</small><strong>{recordStatus === "saved" ? "已保存" : recordStatus === "saving" ? "保存中" : recordStatus === "offline" ? "待同步" : "准备中"}</strong></div>
            </div>
            <div className="go-result-actions">
              <button className="go-primary-button" type="button" onClick={downloadCertificate}><span>下载像素证书</span><b>↓</b></button>
              <button type="button" onClick={retryWrong}>{wrongAnswers.length ? `重练 ${wrongAnswers.length} 道错题` : "再随机练一组"}</button>
              {selectedLevel.id < 10 && <button type="button" onClick={() => openLevel(goLevels[selectedLevel.id])}>继续下一级 →</button>}
            </div>
            <div className="go-review-list">
              <div className="go-review-title"><h2>本轮复盘</h2><span>{wrongAnswers.length ? `${wrongAnswers.length} 处可成长` : "全部掌握"}</span></div>
              {answers.map((answer, index) => (
                <details key={answer.question.id} open={!answer.correct} className={answer.correct ? "correct" : "wrong"}>
                  <summary><span>{answer.correct ? "✓" : "!"}</span><strong>第 {index + 1} 题 · {answer.question.category}</strong><em>{answer.correct ? "答对" : "查看正确下法"}</em></summary>
                  <div>
                    <p>{answer.question.prompt}</p>
                    {answer.question.type === "board" && <small>推荐变化：{solutionLabel(answer.question)}</small>}
                    <small>{answer.question.explanation}</small>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {screen === "opponents" && (
          <section className="go-selection" aria-labelledby="go-opponent-heading">
            <div className="go-section-heading">
              <small>CHOOSE YOUR TIM BOSS</small>
              <h1 id="go-opponent-heading">选择对手棋力</h1>
              <p>你执黑先行。四个 Boss 都是 Tim，只是造型和思考深度逐级变化。</p>
            </div>
            <div className="go-board-size-picker" aria-label="选择棋盘大小">
              {boardSizes.map((size) => <button type="button" className={boardSize === size ? "active" : ""} key={size} onClick={() => setBoardSize(size)}><strong>{size}路</strong><small>{size === 9 ? "入门推荐" : size === 13 ? "进阶练习" : "完整棋盘"}</small></button>)}
            </div>
            <div className="go-opponent-list">
              {goOpponents.map((opponent, index) => (
                <button type="button" key={opponent.id} style={{ "--go-opponent": opponent.color } as CSSProperties} onClick={() => startGame(opponent)}>
                  <Image src={opponent.image} alt={`${opponent.name}围棋对手造型`} width={224} height={224} sizes="96px" />
                  <div><small>BOSS {index + 1} · {opponent.rank}</small><strong>{opponent.name}</strong><em>{opponent.estimatedRank}</em><p>{opponent.description}</p></div>
                  <b aria-hidden="true">→</b>
                </button>
              ))}
            </div>
            <div className={`go-engine-chip is-${engineStatus}`}><span /> <strong>{engineStatus === "loading" ? "ENGINE LOADING" : engineStatus === "ready" ? "NEURAL MCTS READY" : engineStatus === "fallback" ? "TACTICAL FALLBACK" : "ENGINE IDLE"}</strong><small>{engineLabel}</small></div>
            <p className="go-engine-note">Web KaTrain / KataGo 风格神经网络 + MCTS 在浏览器 Worker 中思考；前两档使用 b6 轻量网络，后两档使用更强的 b10 网络与更深搜索。WebGPU 不可用时自动转 WASM / CPU，强化模型失败时再降到轻量网络。棋力标签仅表示本课堂相对强弱，不是正式段位认证。</p>
          </section>
        )}

        {screen === "game" && (
          <section className="go-game">
            <div className="go-game-rival">
              <Image src={selectedOpponent.image} alt={`${selectedOpponent.name}头像`} width={128} height={128} sizes="64px" />
              <div><small>{selectedOpponent.rank}</small><strong>{selectedOpponent.name}</strong><span>{aiThinking ? "思考中 · · ·" : gameResult ? "对局结束" : "等待你的黑棋"}</span></div>
              <b>{boardSize}路</b>
            </div>
            <div className="go-game-status" role="status"><span className={aiThinking ? "thinking" : ""} />{gameMessage}</div>
            <div className={`go-live-engine is-${engineStatus}`}><span>{engineStatus === "ready" ? "NEURAL MCTS" : engineStatus === "loading" ? "MODEL LOADING" : "TACTICAL SEARCH"}</span><small>{engineLabel}</small></div>
            <GoBoard board={gameBoard} onPlay={playerMove} disabled={aiThinking || Boolean(gameResult)} lastMove={lastMove} label={`与${selectedOpponent.name}的${boardSize}路对局`} />
            <div className="go-capture-row">
              <span><i className="black" />你提白子 <strong>{capturedWhite}</strong></span>
              <span><i className="white" />Tim 提黑子 <strong>{capturedBlack}</strong></span>
              <span>手数 <strong>{moveCount}</strong></span>
            </div>
            <div className="go-game-actions">
              <button type="button" onClick={playerPass} disabled={aiThinking || Boolean(gameResult)}>停一手</button>
              <button type="button" onClick={() => finishGame("resign", gameBoard, 2)} disabled={aiThinking || Boolean(gameResult)}>认输</button>
              <button type="button" onClick={() => startGame(selectedOpponent)}>重新开局</button>
            </div>
            <details className="go-move-log">
              <summary>查看落子记录（{moveLog.length}）</summary>
              <ol>{moveLog.map((item, index) => <li key={`${item}-${index}`}>{String(index + 1).padStart(2, "0")} · {item}</li>)}</ol>
            </details>
            {lastAiAnalysis && (
              <details className="go-ai-review">
                <summary>查看 Tim 最近一次搜索</summary>
                <div><span>引擎</span><strong>{lastAiAnalysis.engine === "neural-mcts" ? "神经网络 + MCTS" : "本地战术搜索"}</strong></div>
                <div><span>搜索访问</span><strong>{lastAiAnalysis.visits || "降级模式"}</strong></div>
                {lastAiAnalysis.principalVariation.length > 0 && <p>主变化：{lastAiAnalysis.principalVariation.slice(0, 8).join(" → ")}</p>}
                <p>{lastAiAnalysis.note}</p>
              </details>
            )}
            <p className="go-game-rules">中国规则 · 黑贴 3¾ 子（白方计分加 7.5）· 禁止自杀与重复局面 · 双方连续停一手后自动数子</p>
            <p className="go-game-rules go-game-note">练习盘按当前盘面自动数子；复杂死棋请继续提净，或在复盘时人工确认。</p>

            {gameResult && (
              <div className="go-game-result" role="dialog" aria-modal="true" aria-label="对局结果">
                <Image src={selectedOpponent.image} alt="" width={252} height={252} sizes="126px" />
                <small>GAME REVIEW</small>
                <h2>{gameResult.winner === 1 ? "你赢下了这盘练习！" : gameResult.reason === "resign" ? "这盘先记到这里" : `${selectedOpponent.name} 赢下此局`}</h2>
                <p>{gameResult.reason === "resign" ? "认输也是围棋的一部分。复盘最薄弱的一块棋，再开一局会更有效。" : `自动数子：黑 ${gameResult.score.black.toFixed(1)}，白 ${gameResult.score.white.toFixed(1)}，相差 ${gameResult.score.margin.toFixed(1)} 目。`}</p>
                <div><span>黑棋子 {gameResult.score.blackStones}</span><span>白棋子 {gameResult.score.whiteStones}</span><span>单官 {gameResult.score.dame}</span></div>
                <button className="go-primary-button" type="button" onClick={() => startGame(selectedOpponent)}><span>再来一盘</span><b>↻</b></button>
                <button type="button" onClick={() => setScreen("opponents")}>换一个 Tim Boss</button>
              </div>
            )}
          </section>
        )}

        {showProfileSetup && (
          <div className="go-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowProfileSetup(false); }}>
            <section className="go-profile-modal" role="dialog" aria-modal="true" aria-labelledby="go-profile-title">
              <header><div><small>LEARNING PROFILE</small><h2 id="go-profile-title">{profile ? "围棋学习档案" : "先取一个棋友昵称"}</h2></div><button type="button" onClick={() => setShowProfileSetup(false)} aria-label="关闭">×</button></header>
              {profile ? (
                <>
                  <div className="go-profile-card"><strong>{profile.nickname}</strong><span>{shortLearnerId(profile.id)}</span><small>恢复码：{profile.accessCode}</small></div>
                  <p>请把学习编号和恢复码一起保存。换手机时可以继续原来的级别与证书记录。</p>
                  <button className="go-copy-profile" type="button" onClick={() => void navigator.clipboard.writeText(`Tim围棋学习档案\n学习ID：${profile.id}\n恢复码：${profile.accessCode}`)}>复制档案凭证</button>
                </>
              ) : showRecovery ? (
                <form onSubmit={restoreProfile}>
                  <label>学习 ID<input value={restoreId} onChange={(event) => setRestoreId(event.target.value)} placeholder="粘贴完整 UUID 学习 ID" autoComplete="off" /></label>
                  <label>恢复码<input value={restoreCode} onChange={(event) => setRestoreCode(event.target.value)} placeholder="GO-XXXX-XXXX-XXXX" autoComplete="off" /></label>
                  {profileError && <p className="go-form-error">{profileError}</p>}
                  <button className="go-primary-button" type="submit" disabled={profileBusy}><span>{profileBusy ? "正在恢复…" : "恢复学习进度"}</span><b>→</b></button>
                  <button className="go-form-switch" type="button" onClick={() => { setShowRecovery(false); setProfileError(""); }}>新建学习档案</button>
                </form>
              ) : (
                <form onSubmit={createProfile}>
                  <label>你的昵称<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如：小黑棋" maxLength={20} /></label>
                  <p>只记录昵称、答题与对弈进度，不收集手机号或邮箱。</p>
                  {profileError && <p className="go-form-error">{profileError}</p>}
                  <button className="go-primary-button" type="submit" disabled={profileBusy || !nickname.trim()}><span>{profileBusy ? "正在建档…" : "建立档案并开始"}</span><b>→</b></button>
                  <button className="go-form-switch" type="button" onClick={() => { setShowRecovery(true); setProfileError(""); }}>我有旧档案，恢复进度</button>
                </form>
              )}
            </section>
          </div>
        )}

        {!profileReady && <div className="go-loading" aria-live="polite">正在读取围棋学习档案…</div>}
      </section>
    </main>
  );
}
