import type { GoOpponent } from "./goTypes";

export type Stone = 0 | 1 | 2;
export type GoColor = 1 | 2;
export type GoPoint = { row: number; col: number };
export type GoBoardState = Stone[][];

export type MoveResult = {
  valid: boolean;
  board: GoBoardState;
  captured: number;
  reason?: string;
};

export type AreaScore = {
  black: number;
  white: number;
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  dame: number;
  winner: GoColor;
  margin: number;
};

const neighborSteps = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

export function createBoard(size: number): GoBoardState {
  return Array.from({ length: size }, () => Array<Stone>(size).fill(0));
}

export function cloneBoard(board: GoBoardState): GoBoardState {
  return board.map((row) => [...row]);
}

export function boardHash(board: GoBoardState): string {
  return board.map((row) => row.join("")).join("/");
}

export function otherColor(color: GoColor): GoColor {
  return color === 1 ? 2 : 1;
}

function inside(board: GoBoardState, row: number, col: number) {
  return row >= 0 && col >= 0 && row < board.length && col < board.length;
}

function neighbors(board: GoBoardState, point: GoPoint): GoPoint[] {
  return neighborSteps.flatMap(([rowDelta, colDelta]) => {
    const row = point.row + rowDelta;
    const col = point.col + colDelta;
    return inside(board, row, col) ? [{ row, col }] : [];
  });
}

export function getGroup(board: GoBoardState, start: GoPoint) {
  const color = board[start.row]?.[start.col] ?? 0;
  const stones: GoPoint[] = [];
  const liberties = new Map<string, GoPoint>();
  if (!color) return { color, stones, liberties: [] as GoPoint[] };

  const queue = [start];
  const visited = new Set<string>();
  while (queue.length) {
    const point = queue.pop()!;
    const key = `${point.row},${point.col}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(point);
    for (const neighbor of neighbors(board, point)) {
      const value = board[neighbor.row][neighbor.col];
      if (value === 0) liberties.set(`${neighbor.row},${neighbor.col}`, neighbor);
      if (value === color && !visited.has(`${neighbor.row},${neighbor.col}`)) queue.push(neighbor);
    }
  }
  return { color, stones, liberties: [...liberties.values()] };
}

export function playMove(
  board: GoBoardState,
  color: GoColor,
  point: GoPoint,
  positionHistory: string[] = [],
): MoveResult {
  if (!inside(board, point.row, point.col)) {
    return { valid: false, board, captured: 0, reason: "这个落点不在棋盘上。" };
  }
  if (board[point.row][point.col] !== 0) {
    return { valid: false, board, captured: 0, reason: "这里已经有棋子了。" };
  }

  const next = cloneBoard(board);
  next[point.row][point.col] = color;
  const opponent = otherColor(color);
  let captured = 0;
  const checked = new Set<string>();

  for (const neighbor of neighbors(next, point)) {
    if (next[neighbor.row][neighbor.col] !== opponent) continue;
    const key = `${neighbor.row},${neighbor.col}`;
    if (checked.has(key)) continue;
    const group = getGroup(next, neighbor);
    group.stones.forEach((stone) => checked.add(`${stone.row},${stone.col}`));
    if (group.liberties.length === 0) {
      for (const stone of group.stones) next[stone.row][stone.col] = 0;
      captured += group.stones.length;
    }
  }

  if (getGroup(next, point).liberties.length === 0) {
    return { valid: false, board, captured: 0, reason: "这一手会让自己的棋没有气，不能落在这里。" };
  }

  const hash = boardHash(next);
  if (positionHistory.includes(hash)) {
    return { valid: false, board, captured: 0, reason: "这一手会重复之前的局面，触发劫争禁入。" };
  }

  return { valid: true, board: next, captured };
}

export function listLegalMoves(
  board: GoBoardState,
  color: GoColor,
  positionHistory: string[] = [],
): GoPoint[] {
  const moves: GoPoint[] = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      if (board[row][col] !== 0) continue;
      if (playMove(board, color, { row, col }, positionHistory).valid) moves.push({ row, col });
    }
  }
  return moves;
}

export function scoreChineseArea(board: GoBoardState, komi = 7.5): AreaScore {
  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let dame = 0;
  const visited = new Set<string>();

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      const value = board[row][col];
      if (value === 1) {
        blackStones += 1;
        continue;
      }
      if (value === 2) {
        whiteStones += 1;
        continue;
      }
      const startKey = `${row},${col}`;
      if (visited.has(startKey)) continue;

      const queue: GoPoint[] = [{ row, col }];
      const region: GoPoint[] = [];
      const borders = new Set<GoColor>();
      while (queue.length) {
        const point = queue.pop()!;
        const key = `${point.row},${point.col}`;
        if (visited.has(key)) continue;
        visited.add(key);
        region.push(point);
        for (const neighbor of neighbors(board, point)) {
          const neighborValue = board[neighbor.row][neighbor.col];
          if (neighborValue === 0 && !visited.has(`${neighbor.row},${neighbor.col}`)) queue.push(neighbor);
          if (neighborValue === 1 || neighborValue === 2) borders.add(neighborValue);
        }
      }

      if (borders.size === 1 && borders.has(1)) blackTerritory += region.length;
      else if (borders.size === 1 && borders.has(2)) whiteTerritory += region.length;
      else dame += region.length;
    }
  }

  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + komi;
  return {
    black,
    white,
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    dame,
    winner: black > white ? 1 : 2,
    margin: Math.abs(black - white),
  };
}

function countAdjacent(board: GoBoardState, point: GoPoint, color: Stone) {
  return neighbors(board, point).filter((neighbor) => board[neighbor.row][neighbor.col] === color).length;
}

function moveHeuristic(
  board: GoBoardState,
  color: GoColor,
  point: GoPoint,
  history: string[],
  moveNumber: number,
) {
  const result = playMove(board, color, point, history);
  if (!result.valid) return -Infinity;
  const group = getGroup(result.board, point);
  const size = board.length;
  const opponent = otherColor(color);
  const center = (size - 1) / 2;
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);
  const edgeDistance = Math.min(point.row, point.col, size - 1 - point.row, size - 1 - point.col);
  const adjacentOwn = countAdjacent(board, point, color);
  const adjacentOpponent = countAdjacent(board, point, opponent);
  let score = result.captured * 34;
  score += Math.min(group.liberties.length, 6) * 2.2;
  score += adjacentOpponent * 2.1 + adjacentOwn * 1.2;
  if (group.liberties.length === 1) score -= 22;
  if (moveNumber < size * 1.7) {
    score += size >= 13 ? edgeDistance * 1.4 : Math.max(0, size / 2 - centerDistance) * 1.1;
    if (size >= 13 && edgeDistance > 1 && edgeDistance < 5) score += 3.5;
  }
  if (moveNumber > size * 2.2) score += adjacentOwn + adjacentOpponent;
  return score;
}

function opponentReplyPenalty(
  board: GoBoardState,
  color: GoColor,
  history: string[],
  moveNumber: number,
) {
  const replies = listLegalMoves(board, color, history);
  if (!replies.length) return 0;
  let best = -Infinity;
  for (const reply of replies) {
    best = Math.max(best, moveHeuristic(board, color, reply, history, moveNumber));
  }
  return Number.isFinite(best) ? best : 0;
}

function rolloutValue(
  board: GoBoardState,
  aiColor: GoColor,
  history: string[],
  depth: number,
) {
  let current = cloneBoard(board);
  let color = otherColor(aiColor);
  const hashes = [...history, boardHash(current)];
  for (let turn = 0; turn < depth; turn += 1) {
    const moves = listLegalMoves(current, color, hashes);
    if (!moves.length) break;
    const sampled = moves[Math.floor(Math.random() * moves.length)];
    const result = playMove(current, color, sampled, hashes);
    if (!result.valid) break;
    current = result.board;
    hashes.push(boardHash(current));
    color = otherColor(color);
  }
  const score = scoreChineseArea(current);
  const lead = aiColor === 1 ? score.black - score.white : score.white - score.black;
  return lead;
}

export function chooseAiMove(
  board: GoBoardState,
  aiColor: GoColor,
  opponentId: GoOpponent["id"],
  positionHistory: string[],
  moveNumber: number,
): GoPoint | null {
  const legalMoves = listLegalMoves(board, aiColor, positionHistory);
  if (!legalMoves.length) return null;

  const noiseByOpponent: Record<GoOpponent["id"], number> = {
    normal: 25,
    hero: 10,
    emperor: 4,
    saiyan: 1.6,
  };
  const scored = legalMoves.map((point) => ({
    point,
    score: moveHeuristic(board, aiColor, point, positionHistory, moveNumber)
      + (Math.random() - 0.5) * noiseByOpponent[opponentId],
  }));
  scored.sort((left, right) => right.score - left.score);

  if (opponentId === "normal") {
    const pool = scored.slice(0, Math.min(14, scored.length));
    return pool[Math.floor(Math.random() * pool.length)].point;
  }
  if (opponentId === "hero") {
    const pool = scored.slice(0, Math.min(6, scored.length));
    return pool[Math.floor(Math.random() * Math.min(3, pool.length))].point;
  }

  const candidateLimit = opponentId === "saiyan" ? 10 : 7;
  const candidates = scored.slice(0, Math.min(candidateLimit, scored.length)).map((candidate) => {
    const result = playMove(board, aiColor, candidate.point, positionHistory);
    const nextHistory = [...positionHistory, boardHash(result.board)];
    const replyPenalty = opponentReplyPenalty(
      result.board,
      otherColor(aiColor),
      nextHistory,
      moveNumber + 1,
    );
    let total = candidate.score - replyPenalty * (opponentId === "saiyan" ? 0.55 : 0.35);
    if (opponentId === "saiyan" && board.length <= 13) {
      total += rolloutValue(result.board, aiColor, nextHistory, 6) * 1.2;
    }
    return { point: candidate.point, score: total };
  });
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.point ?? scored[0].point;
}

export function pointLabel(point: GoPoint, boardSize: number) {
  const columns = "ABCDEFGHJKLMNOPQRST";
  return `${columns[point.col] ?? point.col + 1}${boardSize - point.row}`;
}
