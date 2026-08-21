"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { XiangqiBoard } from "./XiangqiBoard";
import {
  applyXiangqiMove,
  createXiangqiBoard,
  findGeneral,
  formatXiangqiMove,
  isInCheck,
  legalMovesForPiece,
  listXiangqiLegalMoves,
  sameXiangqiPoint,
  xiangqiPositionKey,
} from "./xiangqiEngine";
import type { XiangqiBoardState, XiangqiMove, XiangqiPoint } from "./xiangqiEngine";
import { requestXiangqiAiMove, warmupXiangqiImmortal } from "./xiangqiAi";
import type { XiangqiAiResult } from "./xiangqiAi";
import type { XiangqiSearchLevel } from "./xiangqiSearch";
import "./xiangqi-classroom.css";

type XiangqiClassroomProps = { onExit: () => void };
type XiangqiScreen = "landing" | "opponents" | "game";
type GameResult = { winner: "red" | "black" | "draw"; reason: "checkmate" | "stalemate" | "general" | "resign" | "repetition" | "move-limit" };

type XiangqiOpponent = {
  id: XiangqiSearchLevel;
  name: string;
  title: string;
  strength: string;
  description: string;
  image: string;
  color: string;
};

const opponents: XiangqiOpponent[] = [
  {
    id: "young",
    name: "少年 Tim",
    title: "初习棋谱 · 基础陪练",
    strength: "一层战术 · 合法棋优先",
    description: "懂完整象棋规则、将军与应将，会吃未保护的棋，但会在几个合理候选中保留入门失误。",
    image: "/tim-classroom/xiangqi/opponents/young-tim.png",
    color: "#7bd7c5",
  },
  {
    id: "woodcutter",
    name: "中年樵夫 Tim",
    title: "山中磨局 · 稳健计算",
    strength: "三层搜索 · 吃子延伸",
    description: "使用迭代加深、将军校验和置换表，能发现基本串打、牵制与交换。",
    image: "/tim-classroom/xiangqi/opponents/woodcutter-tim.png",
    color: "#f2bd67",
  },
  {
    id: "immortal",
    name: "老年仙人 Tim",
    title: "云上残局 · 最高难度",
    strength: "Fairy-Stockfish NNUE",
    description: "优先启用成熟的 Stockfish 系中国象棋引擎；设备不支持时自动切换本地五层迭代搜索。",
    image: "/tim-classroom/xiangqi/opponents/immortal-tim.png",
    color: "#c99cff",
  },
];

function resultAfterMove(board: XiangqiBoardState, sideToMove: "red" | "black"): GameResult | null {
  if (!findGeneral(board, sideToMove)) return { winner: sideToMove === "red" ? "black" : "red", reason: "general" };
  const legal = listXiangqiLegalMoves(board, sideToMove);
  if (legal.length) return null;
  return {
    winner: sideToMove === "red" ? "black" : "red",
    reason: isInCheck(board, sideToMove) ? "checkmate" : "stalemate",
  };
}

export function XiangqiClassroom({ onExit }: XiangqiClassroomProps) {
  const [screen, setScreen] = useState<XiangqiScreen>("landing");
  const [selectedOpponentId, setSelectedOpponentId] = useState<XiangqiSearchLevel>("young");
  const [board, setBoard] = useState<XiangqiBoardState>(() => createXiangqiBoard());
  const [selected, setSelected] = useState<XiangqiPoint | null>(null);
  const [legalTargets, setLegalTargets] = useState<XiangqiPoint[]>([]);
  const [lastMove, setLastMove] = useState<XiangqiMove | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [message, setMessage] = useState("红方先行。你执红，点击棋子查看合法走法。");
  const [moveLog, setMoveLog] = useState<string[]>([]);
  const [positionHistory, setPositionHistory] = useState<string[]>(() => [xiangqiPositionKey(createXiangqiBoard(), "red")]);
  const [result, setResult] = useState<GameResult | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<XiangqiAiResult | null>(null);
  const [engineLabel, setEngineLabel] = useState("选择对手后加载");
  const requestId = useRef(0);

  const opponent = opponents.find((item) => item.id === selectedOpponentId) ?? opponents[0];

  useEffect(() => () => { requestId.current += 1; }, []);

  const finish = (gameResult: GameResult, nextMessage: string) => {
    requestId.current += 1;
    setAiThinking(false);
    setSelected(null);
    setLegalTargets([]);
    setResult(gameResult);
    setMessage(nextMessage);
  };

  const repetitionOrLimit = (history: string[], moves: number): GameResult | null => {
    const latest = history.at(-1);
    if (latest && history.filter((key) => key === latest).length >= 3) return { winner: "draw", reason: "repetition" };
    if (moves >= 240) return { winner: "draw", reason: "move-limit" };
    return null;
  };

  const scheduleAi = (nextBoard: XiangqiBoardState, history: string[], nextMoveLog: string[]) => {
    const activeRequest = ++requestId.current;
    setAiThinking(true);
    setSelected(null);
    setLegalTargets([]);
    setMessage(`${opponent.name} 正在读局…`);
    void requestXiangqiAiMove({ board: nextBoard, side: "black", level: opponent.id, fullMove: Math.floor(nextMoveLog.length / 2) + 1 })
      .then((analysis) => {
        if (activeRequest !== requestId.current) return;
        const verified = analysis.move && legalMovesForPiece(nextBoard, analysis.move.from)
          .find((move) => sameXiangqiPoint(move.to, analysis.move!.to));
        const fallback = listXiangqiLegalMoves(nextBoard, "black").sort((left, right) => Number(Boolean(right.captured)) - Number(Boolean(left.captured)))[0] ?? null;
        const move = verified ?? fallback;
        if (!move) {
          finish({ winner: "red", reason: isInCheck(nextBoard, "black") ? "checkmate" : "stalemate" }, "黑方无合法着法，你赢了！");
          return;
        }
        const piece = nextBoard[move.from.row][move.from.col]!;
        const afterAi = applyXiangqiMove(nextBoard, move);
        const notation = `${opponent.name}：${formatXiangqiMove(move, piece)}${move.captured ? ` 吃${move.captured.kind === "general" ? "帅" : "子"}` : ""}`;
        const afterLog = [...nextMoveLog, notation];
        const afterHistory = [...history, xiangqiPositionKey(afterAi, "red")];
        setBoard(afterAi);
        setLastMove(move);
        setMoveLog(afterLog);
        setPositionHistory(afterHistory);
        setLastAnalysis(analysis);
        setEngineLabel(`${analysis.label}${analysis.depth ? ` · 深度 ${analysis.depth}` : ""}${analysis.nodes ? ` · ${analysis.nodes.toLocaleString()} 节点` : ""}`);
        setAiThinking(false);
        const terminal = resultAfterMove(afterAi, "red") ?? repetitionOrLimit(afterHistory, afterLog.length);
        if (terminal) {
          finish(terminal, terminal.winner === "black" ? `${opponent.name} 赢下此局。` : "本局和棋。");
          return;
        }
        setMessage(isInCheck(afterAi, "red") ? `${opponent.name} 已将军，请先应将。` : "轮到你执红。点击红方棋子查看合法走法。");
      })
      .catch((error) => {
        if (activeRequest !== requestId.current) return;
        const fallback = listXiangqiLegalMoves(nextBoard, "black")[0] ?? null;
        if (!fallback) {
          finish({ winner: "red", reason: "stalemate" }, "黑方无合法着法，你赢了！");
          return;
        }
        const piece = nextBoard[fallback.from.row][fallback.from.col]!;
        const afterAi = applyXiangqiMove(nextBoard, fallback);
        const afterLog = [...nextMoveLog, `${opponent.name}：${formatXiangqiMove(fallback, piece)}（安全降级）`];
        const afterHistory = [...history, xiangqiPositionKey(afterAi, "red")];
        setBoard(afterAi);
        setLastMove(fallback);
        setMoveLog(afterLog);
        setPositionHistory(afterHistory);
        setAiThinking(false);
        setEngineLabel("规则安全降级");
        const terminal = resultAfterMove(afterAi, "red") ?? repetitionOrLimit(afterHistory, afterLog.length);
        if (terminal) {
          finish(terminal, terminal.winner === "black" ? `${opponent.name} 赢下此局。` : "本局和棋。");
          return;
        }
        setMessage(`AI 搜索已安全降级但页面保持运行：${error instanceof Error ? error.message : String(error)}。轮到你。`);
      });
  };

  const playRedMove = (move: XiangqiMove) => {
    const piece = board[move.from.row][move.from.col]!;
    const nextBoard = applyXiangqiMove(board, move);
    const notation = `你：${formatXiangqiMove(move, piece)}${move.captured ? ` 吃${move.captured.kind === "general" ? "将" : "子"}` : ""}`;
    const nextLog = [...moveLog, notation];
    const nextHistory = [...positionHistory, xiangqiPositionKey(nextBoard, "black")];
    setBoard(nextBoard);
    setLastMove(move);
    setMoveLog(nextLog);
    setPositionHistory(nextHistory);
    setSelected(null);
    setLegalTargets([]);
    const terminal = resultAfterMove(nextBoard, "black") ?? repetitionOrLimit(nextHistory, nextLog.length);
    if (terminal) {
      finish(terminal, terminal.winner === "red" ? "将死！你赢下了这盘棋。" : "本局和棋。");
      return;
    }
    scheduleAi(nextBoard, nextHistory, nextLog);
  };

  const handlePoint = (point: XiangqiPoint) => {
    if (aiThinking || result) return;
    const piece = board[point.row][point.col];
    if (selected) {
      const move = legalMovesForPiece(board, selected).find((candidate) => sameXiangqiPoint(candidate.to, point));
      if (move) {
        playRedMove(move);
        return;
      }
    }
    if (piece?.side === "red") {
      const legal = legalMovesForPiece(board, point);
      setSelected(point);
      setLegalTargets(legal.map((move) => move.to));
      setMessage(legal.length ? `已选择${piece.kind === "general" ? "帅" : "红棋"}，亮点均为合法着法。` : "这枚棋当前没有合法着法。");
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  };

  const startGame = (nextOpponent: XiangqiOpponent) => {
    const gameRequest = ++requestId.current;
    const nextBoard = createXiangqiBoard();
    setSelectedOpponentId(nextOpponent.id);
    setBoard(nextBoard);
    setSelected(null);
    setLegalTargets([]);
    setLastMove(null);
    setAiThinking(false);
    setMessage("红方先行。你执红，点击棋子查看合法走法。");
    setMoveLog([]);
    setPositionHistory([xiangqiPositionKey(nextBoard, "red")]);
    setResult(null);
    setLastAnalysis(null);
    setEngineLabel(nextOpponent.id === "immortal" ? "正在准备 Fairy-Stockfish NNUE…" : "本地规则与搜索已就绪");
    setScreen("game");
    if (nextOpponent.id === "immortal") {
      void warmupXiangqiImmortal().then((status) => {
        if (gameRequest === requestId.current) {
          setEngineLabel(status.ready ? `${status.label} · 已就绪` : `${status.label} · 自动兼容模式`);
        }
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    requestId.current += 1;
    if (screen === "landing") onExit();
    else if (screen === "opponents") setScreen("landing");
    else {
      setAiThinking(false);
      setScreen("opponents");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const leaveGame = () => {
    requestId.current += 1;
    setAiThinking(false);
    setScreen("opponents");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="xq-shell">
      <section className="xq-app">
        <header className="xq-topbar">
          <button type="button" onClick={goBack} aria-label="返回">‹</button>
          <div><small>TIM XIANGQI CLASS</small><strong>{screen === "game" ? opponent.name : "象棋小课堂"}</strong></div>
          <span>{screen === "game" ? `${Math.floor(moveLog.length / 2) + 1} 回合` : "06"}</span>
        </header>

        {screen === "landing" && (
          <section className="xq-landing">
            <div className="xq-hero-seal">象</div>
            <small>ANCIENT PIXEL ARENA</small>
            <h1>象棋小课堂</h1>
            <p>完整中国象棋规则与人机对弈。车马炮、蹩马腿、塞象眼、将帅照面、应将和困毙全部按真实规则处理。</p>
            <div className="xq-landing-strip"><span>少年陪练</span><i /> <span>樵夫进阶</span><i /> <span>仙人 NNUE</span></div>
            <button type="button" onClick={() => setScreen("opponents")}><span>选择 Tim 对手</span><b>开局 →</b></button>
            <aside><strong>只设对弈模式</strong><p>你始终执红先行；点棋子即可看见所有合法落点，AI 的每手也会再次通过本地规则校验。</p></aside>
          </section>
        )}

        {screen === "opponents" && (
          <section className="xq-opponents">
            <header><small>CHOOSE YOUR TIM</small><h1>三代棋力 · 一盘见真章</h1><p>三位 Tim 使用同一套完整规则，区别只在搜索深度、放水幅度与是否启用成熟 NNUE 引擎。</p></header>
            <div>
              {opponents.map((item, index) => (
                <button type="button" key={item.id} style={{ "--xq-accent": item.color } as CSSProperties} onClick={() => startGame(item)}>
                  <Image src={item.image} alt={`${item.name}古风马赛克象棋造型`} width={256} height={256} sizes="104px" />
                  <span><small>RIVAL {index + 1} · {item.title}</small><strong>{item.name}</strong><b>{item.strength}</b><p>{item.description}</p></span>
                  <i>→</i>
                </button>
              ))}
            </div>
            <p className="xq-source-note">最高档采用 Fairy-Stockfish WebAssembly（GPL-3.0）及其中国象棋 NNUE 能力；浏览器不支持隔离内存时会自动切换本地强力搜索，不会闪退。</p>
          </section>
        )}

        {screen === "game" && (
          <section className="xq-game" style={{ "--xq-accent": opponent.color } as CSSProperties}>
            <div className="xq-rival-card">
              <Image src={opponent.image} alt={`${opponent.name}头像`} width={144} height={144} sizes="66px" />
              <div><small>{opponent.title}</small><strong>{opponent.name}</strong><span>{aiThinking ? "正在读局…" : result ? "棋局结束" : "执黑后行"}</span></div>
              <b>{opponent.id === "immortal" ? "NNUE" : opponent.id === "woodcutter" ? "DEPTH 3" : "BASIC"}</b>
            </div>
            <div className={`xq-status ${aiThinking ? "is-thinking" : ""}`} role="status"><i />{message}</div>
            <div className="xq-engine"><span>{lastAnalysis?.engine === "fairy-stockfish-nnue" ? "FAIRY-STOCKFISH" : "TIM SEARCH"}</span><small>{engineLabel}</small></div>
            <XiangqiBoard board={board} selected={selected} legalTargets={legalTargets} lastMove={lastMove} disabled={aiThinking || Boolean(result)} onPoint={handlePoint} />
            <div className="xq-actions">
              <button type="button" onClick={() => finish({ winner: "black", reason: "resign" }, "你选择认输。这盘先复盘到这里。") } disabled={aiThinking || Boolean(result)}>认输</button>
              <button type="button" onClick={() => startGame(opponent)}>重新开局</button>
              <button type="button" onClick={leaveGame}>更换对手</button>
            </div>
            <details className="xq-log"><summary>棋谱记录（{moveLog.length} 手）</summary><ol>{moveLog.map((entry, index) => <li key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</li>)}</ol></details>
            {lastAnalysis && <details className="xq-analysis"><summary>查看最近一次 AI 搜索</summary><p>{lastAnalysis.note}</p></details>}
            <p className="xq-rule-note">红方先行 · 将帅不可照面 · 无合法着法判负（含困毙）· 三次重复局面和棋 · 所有 AI 着法本地二次验合法</p>

            {result && (
              <div className="xq-result" role="dialog" aria-modal="true" aria-label="象棋对局结果">
                <Image src={opponent.image} alt="" width={240} height={240} sizes="120px" />
                <small>END OF MATCH</small>
                <h2>{result.winner === "red" ? "红方得胜！" : result.winner === "black" ? `${opponent.name} 得胜` : "此局和棋"}</h2>
                <p>{result.reason === "checkmate" ? "将死：轮到的一方正在被将且没有合法应将。" : result.reason === "stalemate" ? "困毙：轮到的一方没有任何合法着法，按中国象棋规则判负。" : result.reason === "resign" ? "认输后可查看棋谱，找出第一次明显亏损。" : result.reason === "repetition" ? "同一局面出现三次，本练习盘按和棋处理。" : result.reason === "move-limit" ? "练习盘达到手数上限，按和棋处理。" : "一方将帅已离开棋盘，棋局结束。"}</p>
                <button type="button" onClick={() => startGame(opponent)}>再来一盘</button>
                <button type="button" onClick={leaveGame}>换一位 Tim</button>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
