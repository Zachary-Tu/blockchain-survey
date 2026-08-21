export type XiangqiSide = "red" | "black";
export type XiangqiPieceKind = "general" | "advisor" | "elephant" | "horse" | "rook" | "cannon" | "pawn";
export type XiangqiPiece = { side: XiangqiSide; kind: XiangqiPieceKind };
export type XiangqiPoint = { row: number; col: number };
export type XiangqiMove = { from: XiangqiPoint; to: XiangqiPoint; captured?: XiangqiPiece };
export type XiangqiBoardState = Array<Array<XiangqiPiece | null>>;

export const XIANGQI_ROWS = 10;
export const XIANGQI_COLS = 9;

const backRank: XiangqiPieceKind[] = ["rook", "horse", "elephant", "advisor", "general", "advisor", "elephant", "horse", "rook"];

export function oppositeSide(side: XiangqiSide): XiangqiSide {
  return side === "red" ? "black" : "red";
}

export function createXiangqiBoard(): XiangqiBoardState {
  const board: XiangqiBoardState = Array.from({ length: XIANGQI_ROWS }, () => Array<XiangqiPiece | null>(XIANGQI_COLS).fill(null));
  backRank.forEach((kind, col) => {
    board[0][col] = { side: "black", kind };
    board[9][col] = { side: "red", kind };
  });
  board[2][1] = { side: "black", kind: "cannon" };
  board[2][7] = { side: "black", kind: "cannon" };
  board[7][1] = { side: "red", kind: "cannon" };
  board[7][7] = { side: "red", kind: "cannon" };
  for (let col = 0; col < XIANGQI_COLS; col += 2) {
    board[3][col] = { side: "black", kind: "pawn" };
    board[6][col] = { side: "red", kind: "pawn" };
  }
  return board;
}

export function cloneXiangqiBoard(board: XiangqiBoardState): XiangqiBoardState {
  return board.map((row) => row.map((piece) => piece ? { ...piece } : null));
}

function inBounds(point: XiangqiPoint) {
  return point.row >= 0 && point.row < XIANGQI_ROWS && point.col >= 0 && point.col < XIANGQI_COLS;
}

function inPalace(point: XiangqiPoint, side: XiangqiSide) {
  return point.col >= 3 && point.col <= 5 && (side === "red" ? point.row >= 7 && point.row <= 9 : point.row >= 0 && point.row <= 2);
}

function pushIfAvailable(board: XiangqiBoardState, side: XiangqiSide, moves: XiangqiPoint[], point: XiangqiPoint) {
  if (!inBounds(point)) return;
  const target = board[point.row][point.col];
  if (!target || target.side !== side) moves.push(point);
}

function rayMoves(board: XiangqiBoardState, from: XiangqiPoint, side: XiangqiSide, cannon: boolean) {
  const result: XiangqiPoint[] = [];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [rowDelta, colDelta] of directions) {
    let row = from.row + rowDelta;
    let col = from.col + colDelta;
    let screenFound = false;
    while (inBounds({ row, col })) {
      const target = board[row][col];
      if (!cannon) {
        if (!target) result.push({ row, col });
        else {
          if (target.side !== side) result.push({ row, col });
          break;
        }
      } else if (!screenFound) {
        if (!target) result.push({ row, col });
        else screenFound = true;
      } else if (target) {
        if (target.side !== side) result.push({ row, col });
        break;
      }
      row += rowDelta;
      col += colDelta;
    }
  }
  return result;
}

export function pseudoMovesForPiece(board: XiangqiBoardState, from: XiangqiPoint): XiangqiPoint[] {
  const piece = board[from.row]?.[from.col];
  if (!piece) return [];
  const moves: XiangqiPoint[] = [];
  if (piece.kind === "rook") return rayMoves(board, from, piece.side, false);
  if (piece.kind === "cannon") return rayMoves(board, from, piece.side, true);

  if (piece.kind === "general") {
    for (const [rowDelta, colDelta] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const point = { row: from.row + rowDelta, col: from.col + colDelta };
      if (inPalace(point, piece.side)) pushIfAvailable(board, piece.side, moves, point);
    }
    for (const rowDelta of [-1, 1]) {
      let row = from.row + rowDelta;
      while (row >= 0 && row < XIANGQI_ROWS) {
        const target = board[row][from.col];
        if (target) {
          if (target.side !== piece.side && target.kind === "general") moves.push({ row, col: from.col });
          break;
        }
        row += rowDelta;
      }
    }
    return moves;
  }

  if (piece.kind === "advisor") {
    for (const [rowDelta, colDelta] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const point = { row: from.row + rowDelta, col: from.col + colDelta };
      if (inPalace(point, piece.side)) pushIfAvailable(board, piece.side, moves, point);
    }
    return moves;
  }

  if (piece.kind === "elephant") {
    for (const [rowDelta, colDelta] of [[-2,-2],[-2,2],[2,-2],[2,2]]) {
      const point = { row: from.row + rowDelta, col: from.col + colDelta };
      const eye = { row: from.row + rowDelta / 2, col: from.col + colDelta / 2 };
      const staysHome = piece.side === "red" ? point.row >= 5 : point.row <= 4;
      if (staysHome && inBounds(point) && !board[eye.row][eye.col]) pushIfAvailable(board, piece.side, moves, point);
    }
    return moves;
  }

  if (piece.kind === "horse") {
    const jumps = [
      [-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],
      [-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1],
    ];
    for (const [rowDelta, colDelta, legRow, legCol] of jumps) {
      if (board[from.row + legRow]?.[from.col + legCol]) continue;
      pushIfAvailable(board, piece.side, moves, { row: from.row + rowDelta, col: from.col + colDelta });
    }
    return moves;
  }

  const forward = piece.side === "red" ? -1 : 1;
  pushIfAvailable(board, piece.side, moves, { row: from.row + forward, col: from.col });
  const crossedRiver = piece.side === "red" ? from.row <= 4 : from.row >= 5;
  if (crossedRiver) {
    pushIfAvailable(board, piece.side, moves, { row: from.row, col: from.col - 1 });
    pushIfAvailable(board, piece.side, moves, { row: from.row, col: from.col + 1 });
  }
  return moves;
}

export function applyXiangqiMove(board: XiangqiBoardState, move: XiangqiMove): XiangqiBoardState {
  const next = cloneXiangqiBoard(board);
  next[move.to.row][move.to.col] = next[move.from.row][move.from.col];
  next[move.from.row][move.from.col] = null;
  return next;
}

export function findGeneral(board: XiangqiBoardState, side: XiangqiSide): XiangqiPoint | null {
  for (let row = 0; row < XIANGQI_ROWS; row += 1) {
    for (let col = 0; col < XIANGQI_COLS; col += 1) {
      const piece = board[row][col];
      if (piece?.side === side && piece.kind === "general") return { row, col };
    }
  }
  return null;
}

export function isInCheck(board: XiangqiBoardState, side: XiangqiSide) {
  const general = findGeneral(board, side);
  if (!general) return true;
  const enemy = oppositeSide(side);
  for (let row = 0; row < XIANGQI_ROWS; row += 1) {
    for (let col = 0; col < XIANGQI_COLS; col += 1) {
      if (board[row][col]?.side !== enemy) continue;
      if (pseudoMovesForPiece(board, { row, col }).some((point) => point.row === general.row && point.col === general.col)) return true;
    }
  }
  return false;
}

export function legalMovesForPiece(board: XiangqiBoardState, from: XiangqiPoint): XiangqiMove[] {
  const piece = board[from.row]?.[from.col];
  if (!piece) return [];
  return pseudoMovesForPiece(board, from).map((to) => ({ from, to, captured: board[to.row][to.col] ?? undefined }))
    .filter((move) => !isInCheck(applyXiangqiMove(board, move), piece.side));
}

export function listXiangqiLegalMoves(board: XiangqiBoardState, side: XiangqiSide): XiangqiMove[] {
  const moves: XiangqiMove[] = [];
  for (let row = 0; row < XIANGQI_ROWS; row += 1) {
    for (let col = 0; col < XIANGQI_COLS; col += 1) {
      if (board[row][col]?.side === side) moves.push(...legalMovesForPiece(board, { row, col }));
    }
  }
  return moves;
}

export function sameXiangqiPoint(left: XiangqiPoint | null | undefined, right: XiangqiPoint) {
  return Boolean(left && left.row === right.row && left.col === right.col);
}

export function xiangqiPositionKey(board: XiangqiBoardState, turn: XiangqiSide) {
  return `${board.map((row) => row.map((piece) => piece ? `${piece.side[0]}${piece.kind[0]}` : "..").join("")).join("/")}:${turn}`;
}

const fenCode: Record<XiangqiPieceKind, string> = {
  rook: "r", horse: "n", elephant: "b", advisor: "a", general: "k", cannon: "c", pawn: "p",
};

export function boardToXiangqiFen(board: XiangqiBoardState, turn: XiangqiSide, fullMove = 1) {
  const rows = board.map((row) => {
    let result = "";
    let empty = 0;
    for (const piece of row) {
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) result += String(empty);
      empty = 0;
      const code = fenCode[piece.kind];
      result += piece.side === "red" ? code.toUpperCase() : code;
    }
    if (empty) result += String(empty);
    return result;
  }).join("/");
  return `${rows} ${turn === "red" ? "w" : "b"} - - 0 ${Math.max(1, fullMove)}`;
}

export function xiangqiMoveToUci(move: XiangqiMove) {
  const square = (point: XiangqiPoint) => `${String.fromCharCode(97 + point.col)}${9 - point.row}`;
  return `${square(move.from)}${square(move.to)}`;
}

export function uciToXiangqiMove(value: string, board: XiangqiBoardState): XiangqiMove | null {
  const match = /^([a-i])([0-9])([a-i])([0-9])/.exec(value.trim());
  if (!match) return null;
  const from = { row: 9 - Number(match[2]), col: match[1].charCodeAt(0) - 97 };
  const to = { row: 9 - Number(match[4]), col: match[3].charCodeAt(0) - 97 };
  const legal = legalMovesForPiece(board, from).find((move) => sameXiangqiPoint(move.to, to));
  return legal ?? null;
}

export const xiangqiPieceText: Record<XiangqiSide, Record<XiangqiPieceKind, string>> = {
  red: { general: "帅", advisor: "仕", elephant: "相", horse: "马", rook: "车", cannon: "炮", pawn: "兵" },
  black: { general: "将", advisor: "士", elephant: "象", horse: "马", rook: "车", cannon: "砲", pawn: "卒" },
};

export function formatXiangqiMove(move: XiangqiMove, piece: XiangqiPiece) {
  const files = "一二三四五六七八九";
  const fromFile = piece.side === "red" ? files[8 - move.from.col] : String(move.from.col + 1);
  const toFile = piece.side === "red" ? files[8 - move.to.col] : String(move.to.col + 1);
  if (move.from.row === move.to.row) return `${xiangqiPieceText[piece.side][piece.kind]}${fromFile}平${toFile}`;
  const advances = piece.side === "red" ? move.to.row < move.from.row : move.to.row > move.from.row;
  const direction = advances ? "进" : "退";
  const usesStepCount = piece.kind === "general" || piece.kind === "rook" || piece.kind === "cannon" || piece.kind === "pawn";
  const distance = Math.abs(move.to.row - move.from.row);
  const destination = usesStepCount ? (piece.side === "red" ? files[distance - 1] : String(distance)) : toFile;
  return `${xiangqiPieceText[piece.side][piece.kind]}${fromFile}${direction}${destination}`;
}
