import assert from "node:assert/strict";
import test from "node:test";

import {
  boardHash,
  chooseAiMove,
  createBoard,
  playMove,
  scoreChineseArea,
} from "../app/tim-classroom/go/goEngine";
import type { GoBoardState } from "../app/tim-classroom/go/goEngine";
import type { GoOpponent } from "../app/tim-classroom/go/goTypes";

function boardFrom(stones: Array<[number, number, 1 | 2]>, size = 7): GoBoardState {
  const board = createBoard(size);
  for (const [row, col, color] of stones) board[row][col] = color;
  return board;
}

test("提子、禁自杀与盘面不变性", () => {
  const board = boardFrom([[3,3,2],[2,3,1],[3,2,1],[4,3,1]]);
  const captured = playMove(board, 1, { row: 3, col: 4 });
  assert.equal(captured.valid, true);
  assert.equal(captured.captured, 1);
  assert.equal(captured.board[3][3], 0);
  assert.equal(board[3][3], 2, "原盘面不能被原地修改");

  const suicideBoard = boardFrom([[2,3,2],[3,2,2],[4,3,2],[3,4,2]]);
  const suicide = playMove(suicideBoard, 1, { row: 3, col: 3 });
  assert.equal(suicide.valid, false);
  assert.match(suicide.reason ?? "", /没有气/);
});

test("单劫不能立即回提", () => {
  const initial = boardFrom([
    [3,3,2],
    [2,3,1],[4,3,1],[3,2,1],
    [2,4,2],[4,4,2],[3,5,2],
  ]);
  const history = [boardHash(initial)];
  const capture = playMove(initial, 1, { row: 3, col: 4 }, history);
  assert.equal(capture.valid, true);
  const recapture = playMove(capture.board, 2, { row: 3, col: 3 }, [...history, boardHash(capture.board)]);
  assert.equal(recapture.valid, false);
  assert.match(recapture.reason ?? "", /重复之前的局面/);
});

test("中国面积计分保持有限且胜负一致", () => {
  const board = boardFrom([[0,0,1],[0,1,1],[1,0,1],[6,6,2],[6,5,2],[5,6,2]]);
  const score = scoreChineseArea(board, 7.5);
  assert.ok(Number.isFinite(score.black));
  assert.ok(Number.isFinite(score.white));
  assert.equal(score.winner, score.black > score.white ? 1 : 2);
  assert.equal(score.blackStones, 3);
  assert.equal(score.whiteStones, 3);
});

test("五档本地降级搜索都给出确定且合法的着法", () => {
  const board = boardFrom([[2,2,1],[2,3,2],[3,2,1],[4,4,2]], 5);
  const history = [boardHash(board)];
  const opponents: GoOpponent["id"][] = ["normal", "hero", "emperor", "robot", "saiyan"];
  for (const opponent of opponents) {
    const first = chooseAiMove(board, 2, opponent, history, 8);
    const second = chooseAiMove(board, 2, opponent, history, 8);
    assert.deepEqual(first, second, `${opponent} 不应依赖随机乱下`);
    assert.ok(first, `${opponent} 应找到合法候选`);
    assert.equal(playMove(board, 2, first!, history).valid, true);
  }
});
