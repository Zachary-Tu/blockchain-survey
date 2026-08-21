import assert from "node:assert/strict";
import test from "node:test";

import {
  applyXiangqiMove,
  boardToXiangqiFen,
  createXiangqiBoard,
  formatXiangqiMove,
  isInCheck,
  legalMovesForPiece,
  listXiangqiLegalMoves,
  pseudoMovesForPiece,
  uciToXiangqiMove,
  xiangqiMoveToUci,
} from "../app/tim-classroom/xiangqi/xiangqiEngine";
import type { XiangqiBoardState } from "../app/tim-classroom/xiangqi/xiangqiEngine";
import { searchXiangqiMove } from "../app/tim-classroom/xiangqi/xiangqiSearch";

function emptyBoard(): XiangqiBoardState {
  return Array.from({ length: 10 }, () => Array(9).fill(null));
}

test("初始局面、FEN 与首回合合法着法完整", () => {
  const board = createXiangqiBoard();
  assert.equal(boardToXiangqiFen(board, "red"), "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
  const moves = listXiangqiLegalMoves(board, "red");
  assert.ok(moves.length >= 40);
  assert.ok(moves.every((move) => !isInCheck(applyXiangqiMove(board, move), "red")));
  assert.equal(formatXiangqiMove({ from: { row: 9, col: 0 }, to: { row: 8, col: 0 } }, board[9][0]!), "车九进一");
  assert.equal(formatXiangqiMove({ from: { row: 9, col: 1 }, to: { row: 7, col: 2 } }, board[9][1]!), "马八进七");
  assert.equal(formatXiangqiMove({ from: { row: 2, col: 1 }, to: { row: 2, col: 4 } }, board[2][1]!), "砲2平5");
});

test("马腿、象眼、过河兵与炮架规则", () => {
  const horseBoard = emptyBoard();
  horseBoard[5][4] = { side: "red", kind: "horse" };
  horseBoard[4][4] = { side: "red", kind: "pawn" };
  const horseMoves = pseudoMovesForPiece(horseBoard, { row: 5, col: 4 });
  assert.ok(!horseMoves.some((point) => point.row === 3 && point.col === 3));
  assert.ok(horseMoves.some((point) => point.row === 4 && point.col === 2));

  const elephantBoard = emptyBoard();
  elephantBoard[9][2] = { side: "red", kind: "elephant" };
  assert.deepEqual(pseudoMovesForPiece(elephantBoard, { row: 9, col: 2 }).sort((a,b) => a.col - b.col), [{ row: 7, col: 0 }, { row: 7, col: 4 }]);
  elephantBoard[8][3] = { side: "red", kind: "pawn" };
  assert.ok(!pseudoMovesForPiece(elephantBoard, { row: 9, col: 2 }).some((point) => point.col === 4));

  const pawnBoard = emptyBoard();
  pawnBoard[6][4] = { side: "red", kind: "pawn" };
  assert.deepEqual(pseudoMovesForPiece(pawnBoard, { row: 6, col: 4 }), [{ row: 5, col: 4 }]);
  pawnBoard[4][4] = { side: "red", kind: "pawn" };
  assert.equal(pseudoMovesForPiece(pawnBoard, { row: 4, col: 4 }).length, 3);

  const cannonBoard = emptyBoard();
  cannonBoard[5][1] = { side: "red", kind: "cannon" };
  cannonBoard[5][3] = { side: "red", kind: "pawn" };
  cannonBoard[5][6] = { side: "black", kind: "rook" };
  const cannonMoves = pseudoMovesForPiece(cannonBoard, { row: 5, col: 1 });
  assert.ok(cannonMoves.some((point) => point.row === 5 && point.col === 6));
  assert.ok(!cannonMoves.some((point) => point.row === 5 && point.col === 4));
});

test("将帅照面与离宫着法会被完整合法性过滤", () => {
  const board = emptyBoard();
  board[0][4] = { side: "black", kind: "general" };
  board[9][4] = { side: "red", kind: "general" };
  board[5][4] = { side: "red", kind: "rook" };
  assert.equal(isInCheck(board, "red"), false);
  const rookMoves = legalMovesForPiece(board, { row: 5, col: 4 });
  assert.ok(!rookMoves.some((move) => move.to.col !== 4), "挡将线的车不能横移暴露帅");
  const generalMoves = legalMovesForPiece(board, { row: 9, col: 4 });
  assert.ok(generalMoves.every((move) => move.to.row >= 7 && move.to.col >= 3 && move.to.col <= 5));
});

test("UCI 坐标与本地合法着法往返一致", () => {
  const board = createXiangqiBoard();
  const move = listXiangqiLegalMoves(board, "red")[0];
  const encoded = xiangqiMoveToUci(move);
  const decoded = uciToXiangqiMove(encoded, board);
  assert.deepEqual(decoded?.from, move.from);
  assert.deepEqual(decoded?.to, move.to);
});

test("三档本地搜索均在预算内返回合法棋，后两档不随机", () => {
  const board = createXiangqiBoard();
  for (const level of ["young", "woodcutter", "immortal"] as const) {
    const started = Date.now();
    const result = searchXiangqiMove(board, "black", level);
    const elapsed = Date.now() - started;
    assert.ok(result.move, `${level} 没有返回着法`);
    assert.ok(legalMovesForPiece(board, result.move!.from).some((move) => xiangqiMoveToUci(move) === xiangqiMoveToUci(result.move!)));
    assert.ok(elapsed < 2_100, `${level} 搜索超时：${elapsed}ms`);
    if (level !== "young") {
      const second = searchXiangqiMove(board, "black", level);
      assert.equal(xiangqiMoveToUci(second.move!), xiangqiMoveToUci(result.move!));
    }
  }
});
