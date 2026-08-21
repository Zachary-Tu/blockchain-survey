import {
  applyXiangqiMove,
  findGeneral,
  isInCheck,
  listXiangqiLegalMoves,
  oppositeSide,
  xiangqiMoveToUci,
  xiangqiPositionKey,
} from "./xiangqiEngine";
import type { XiangqiBoardState, XiangqiMove, XiangqiPieceKind, XiangqiSide } from "./xiangqiEngine";

export type XiangqiSearchLevel = "young" | "woodcutter" | "immortal";
export type XiangqiSearchResult = { move: XiangqiMove | null; depth: number; nodes: number; score: number; engine: "local-alpha-beta" };

const pieceValue: Record<XiangqiPieceKind, number> = {
  general: 100_000,
  rook: 980,
  cannon: 480,
  horse: 430,
  elephant: 210,
  advisor: 210,
  pawn: 110,
};

type SearchContext = {
  deadline: number;
  nodes: number;
  stopped: boolean;
  table: Map<string, { depth: number; value: number }>;
};

function positionalBonus(kind: XiangqiPieceKind, row: number, col: number, side: XiangqiSide) {
  const advanced = side === "red" ? 9 - row : row;
  const center = 4 - Math.abs(4 - col);
  if (kind === "pawn") return advanced * 7 + (advanced >= 5 ? center * 3 : 0);
  if (kind === "horse" || kind === "cannon") return center * 4;
  if (kind === "rook") return center * 2;
  return 0;
}

function staticEvaluation(board: XiangqiBoardState, perspective: XiangqiSide) {
  let score = 0;
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const piece = board[row][col];
      if (!piece) continue;
      const value = pieceValue[piece.kind] + positionalBonus(piece.kind, row, col, piece.side);
      score += piece.side === perspective ? value : -value;
    }
  }
  if (isInCheck(board, oppositeSide(perspective))) score += 26;
  if (isInCheck(board, perspective)) score -= 30;
  return score;
}

function moveOrderValue(move: XiangqiMove) {
  const capture = move.captured ? pieceValue[move.captured.kind] : 0;
  const center = 4 - Math.abs(4 - move.to.col);
  return capture * 16 + center;
}

function orderedMoves(board: XiangqiBoardState, side: XiangqiSide) {
  return listXiangqiLegalMoves(board, side).sort((left, right) => moveOrderValue(right) - moveOrderValue(left));
}

function checkDeadline(context: SearchContext) {
  context.nodes += 1;
  if ((context.nodes & 255) === 0 && Date.now() >= context.deadline) context.stopped = true;
  return context.stopped;
}

function quiescence(board: XiangqiBoardState, side: XiangqiSide, alpha: number, beta: number, context: SearchContext, depth: number): number {
  if (checkDeadline(context)) return staticEvaluation(board, side);
  const best = staticEvaluation(board, side);
  if (best >= beta) return beta;
  if (best > alpha) alpha = best;
  if (depth <= 0) return best;
  const captures = orderedMoves(board, side).filter((move) => move.captured);
  for (const move of captures) {
    const value = -quiescence(applyXiangqiMove(board, move), oppositeSide(side), -beta, -alpha, context, depth - 1);
    if (context.stopped) return alpha;
    if (value >= beta) return beta;
    if (value > alpha) alpha = value;
  }
  return alpha;
}

function negamax(board: XiangqiBoardState, side: XiangqiSide, depth: number, alpha: number, beta: number, context: SearchContext, ply: number): number {
  if (checkDeadline(context)) return staticEvaluation(board, side);
  if (!findGeneral(board, side)) return -100_000 + ply;
  if (!findGeneral(board, oppositeSide(side))) return 100_000 - ply;
  if (depth <= 0) return quiescence(board, side, alpha, beta, context, 2);
  const key = xiangqiPositionKey(board, side);
  const cached = context.table.get(key);
  if (cached && cached.depth >= depth) return cached.value;
  const moves = orderedMoves(board, side);
  if (!moves.length) return -90_000 + ply;
  let value = -Infinity;
  for (const move of moves) {
    const candidate = -negamax(applyXiangqiMove(board, move), oppositeSide(side), depth - 1, -beta, -alpha, context, ply + 1);
    if (context.stopped) return Number.isFinite(value) ? value : staticEvaluation(board, side);
    value = Math.max(value, candidate);
    alpha = Math.max(alpha, candidate);
    if (alpha >= beta) break;
  }
  context.table.set(key, { depth, value });
  return value;
}

function rootSearch(board: XiangqiBoardState, side: XiangqiSide, depth: number, context: SearchContext) {
  const moves = orderedMoves(board, side);
  const scored: Array<{ move: XiangqiMove; score: number }> = [];
  let alpha = -Infinity;
  for (const move of moves) {
    const score = -negamax(applyXiangqiMove(board, move), oppositeSide(side), depth - 1, -Infinity, -alpha, context, 1);
    if (context.stopped) break;
    scored.push({ move, score });
    alpha = Math.max(alpha, score);
  }
  scored.sort((left, right) => right.score - left.score || xiangqiMoveToUci(left.move).localeCompare(xiangqiMoveToUci(right.move)));
  return scored;
}

function deterministicIndex(board: XiangqiBoardState, side: XiangqiSide, length: number) {
  const key = xiangqiPositionKey(board, side);
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return Math.abs(hash >>> 0) % Math.max(1, length);
}

export function searchXiangqiMove(board: XiangqiBoardState, side: XiangqiSide, level: XiangqiSearchLevel): XiangqiSearchResult {
  const plan = level === "young"
    ? { maxDepth: 1, maxTimeMs: 90 }
    : level === "woodcutter"
      ? { maxDepth: 3, maxTimeMs: 520 }
      : { maxDepth: 5, maxTimeMs: 1_350 };
  const context: SearchContext = { deadline: Date.now() + plan.maxTimeMs, nodes: 0, stopped: false, table: new Map() };
  let completed: Array<{ move: XiangqiMove; score: number }> = [];
  let completedDepth = 0;
  for (let depth = 1; depth <= plan.maxDepth; depth += 1) {
    const result = rootSearch(board, side, depth, context);
    if (context.stopped || !result.length) break;
    completed = result;
    completedDepth = depth;
  }
  if (!completed.length) {
    const move = orderedMoves(board, side)[0] ?? null;
    return { move, depth: 0, nodes: context.nodes, score: 0, engine: "local-alpha-beta" };
  }
  let selected = completed[0];
  if (level === "young") {
    const reasonable = completed.filter((candidate) => candidate.score >= completed[0].score - 180).slice(0, 4);
    selected = reasonable[deterministicIndex(board, side, reasonable.length)] ?? selected;
  }
  return { move: selected.move, depth: completedDepth, nodes: context.nodes, score: selected.score, engine: "local-alpha-beta" };
}
