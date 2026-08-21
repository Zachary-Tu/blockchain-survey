import assert from "node:assert/strict";
import test from "node:test";

import { boardHash, createBoard, getGroup, playMove } from "../app/tim-classroom/go/goEngine";
import { chooseObjectiveReply, objectiveAchieved } from "../app/tim-classroom/go/goPuzzleEngine";
import { buildGoAttempt, goQuestionBanks, goQuestionBankStats } from "../app/tim-classroom/go/goQuestionBank";

test("十级混合题库规模完整", () => {
  assert.deepEqual(goQuestionBankStats, {
    levels: 10,
    themesPerLevel: 10,
    variantsPerTheme: 6,
    total: 600,
  });
  for (let level = 1; level <= 10; level += 1) {
    const bank = goQuestionBanks[level];
    assert.equal(bank.length, 60);
    assert.equal(new Set(bank.map((question) => question.family)).size, 10);
    assert.ok(bank.filter((question) => question.type === "choice").length >= 24);
    assert.ok(bank.filter((question) => question.type === "board" && question.mode === "candidate").length >= 18);
    assert.equal(bank.filter((question) => question.type === "board" && question.mode === "objective").length, 12);
  }
});

function canonicalBoardQuestion(level: number, family: string) {
  const question = goQuestionBanks[level].find((item) => item.id === `go-l${level}-${family}-v1`);
  assert.ok(question && question.type === "board", `缺少 ${level}/${family} 标准棋形`);
  if (!question || question.type !== "board") throw new Error("unreachable");
  const board = createBoard(question.boardSize);
  for (const stone of question.stones) board[stone.row][stone.col] = stone.color;
  return { question, board };
}

test("关键战术棋形通过结果校验，而不是只靠手填答案", () => {
  const doubleAtari = canonicalBoardQuestion(2, "double-atari-point");
  const doubleAtariMove = doubleAtari.question.solutionLines[0][0];
  const afterDoubleAtari = playMove(doubleAtari.board, 1, doubleAtariMove);
  assert.equal(afterDoubleAtari.valid, true);
  assert.equal(afterDoubleAtari.captured, 0, "双打吃不应被误写成已经提子");
  assert.equal(getGroup(afterDoubleAtari.board, { row: 3, col: 2 }).liberties.length, 1);
  assert.equal(getGroup(afterDoubleAtari.board, { row: 3, col: 4 }).liberties.length, 1);

  const net = canonicalBoardQuestion(2, "net-vital");
  const net1 = playMove(net.board, 1, { row: 2, col: 2 });
  const net2 = playMove(net1.board, 2, { row: 3, col: 2 });
  const net3 = playMove(net2.board, 1, { row: 3, col: 1 });
  const net4 = playMove(net3.board, 2, { row: 2, col: 3 });
  const net5 = playMove(net4.board, 1, { row: 1, col: 3 });
  assert.ok([net1, net2, net3, net4, net5].every((result) => result.valid));
  assert.equal(net5.captured, 3, "枷的两条对称逃路都应在收网后被提");

  const snapback = canonicalBoardQuestion(6, "snapback-point");
  const throwIn = playMove(snapback.board, 1, { row: 3, col: 3 });
  const takeThrowIn = playMove(throwIn.board, 2, { row: 3, col: 2 });
  const recapture = playMove(takeThrowIn.board, 1, { row: 3, col: 3 });
  assert.equal(throwIn.valid, true);
  assert.equal(takeThrowIn.captured, 1);
  assert.equal(recapture.valid, true);
  assert.equal(recapture.captured, 8, "倒扑必须以一子换取回提更大棋块");

  const shortage = canonicalBoardQuestion(6, "connect-and-die-point");
  const atari = playMove(shortage.board, 1, { row: 3, col: 1 });
  const connect = playMove(atari.board, 2, { row: 3, col: 3 });
  const finish = playMove(connect.board, 1, { row: 3, col: 5 });
  assert.ok([atari, connect, finish].every((result) => result.valid));
  assert.equal(finish.captured, 3, "白棋连接后仍应只有另一端一气");

  const race = canonicalBoardQuestion(7, "semeai-liberty");
  const takeOutside = playMove(race.board, 1, { row: 3, col: 5 });
  const replyOutside = playMove(takeOutside.board, 2, { row: 3, col: 1 });
  const takeShared = playMove(replyOutside.board, 1, { row: 3, col: 3 });
  assert.ok([takeOutside, replyOutside, takeShared].every((result) => result.valid));
  assert.equal(takeShared.captured, 1, "对杀应先收外气、最后占公共气");
});

test("候选点唯一、答案被明确枚举且所有已知起手合法", () => {
  for (const questions of Object.values(goQuestionBanks)) {
    for (const question of questions) {
      if (question.type === "choice") {
        assert.ok(question.correct >= 0 && question.correct < question.options.length);
        assert.equal(new Set(question.options).size, question.options.length);
        continue;
      }
      const board = createBoard(question.boardSize);
      for (const stone of question.stones) {
        assert.equal(board[stone.row][stone.col], 0, `${question.id} 重复摆子`);
        board[stone.row][stone.col] = stone.color;
      }
      const correctKeys = new Set(question.solutionLines.map((line) => `${line[0].row},${line[0].col}`));
      assert.equal(correctKeys.size, question.solutionLines.length, `${question.id} 重复答案`);
      for (const line of question.solutionLines) {
        const result = playMove(board, question.toPlay, line[0], [boardHash(board)]);
        assert.equal(result.valid, true, `${question.id} 起手非法：${result.reason}`);
      }
      if (question.mode === "candidate") {
        const candidates = question.candidateMoves ?? [];
        assert.equal(candidates.length, 4);
        assert.equal(new Set(candidates.map((point) => `${point.row},${point.col}`)).size, 4);
        assert.ok([...correctKeys].every((key) => candidates.some((point) => `${point.row},${point.col}` === key)));
      } else {
        assert.ok(question.objective);
        if (question.objective?.kind === "capture-target") assert.notEqual(question.objective.targetColor, question.toPlay);
        else assert.equal(question.objective?.targetColor, question.toPlay);
      }
    }
  }
});

test("每个动态目标的标准变式至少存在一条可达路线", () => {
  const canonical = Object.values(goQuestionBanks).flat()
    .filter((question) => question.type === "board" && question.mode === "objective" && question.id.endsWith("-v1"));
  for (const question of canonical) {
    if (question.type !== "board" || question.mode !== "objective" || !question.objective) continue;
    const board = createBoard(question.boardSize);
    for (const stone of question.stones) board[stone.row][stone.col] = stone.color;
    let solved = false;
    for (const line of question.solutionLines) {
      const first = playMove(board, question.toPlay, line[0]);
      assert.equal(first.valid, true);
      if (objectiveAchieved(first.board, question.objective)) {
        solved = true;
        break;
      }
      const replyColor = question.toPlay === 1 ? 2 : 1;
      const reply = chooseObjectiveReply(first.board, replyColor, question.objective);
      const afterReply = reply ? playMove(first.board, replyColor, reply).board : first.board;
      for (let row = question.objective.region.top; row <= question.objective.region.bottom && !solved; row += 1) {
        for (let col = question.objective.region.left; col <= question.objective.region.right; col += 1) {
          const second = playMove(afterReply, question.toPlay, { row, col });
          if (second.valid && objectiveAchieved(second.board, question.objective)) {
            solved = true;
            break;
          }
        }
      }
    }
    assert.equal(solved, true, `${question.id} 在规定手数内不可达`);
  }
});

test("标准练习每级抽取十个不重复主题并混合三种题型", () => {
  for (let level = 1; level <= 10; level += 1) {
    const attempt = buildGoAttempt(level);
    assert.equal(attempt.length, 10);
    assert.equal(new Set(attempt.map((question) => question.family)).size, 10);
    assert.ok(attempt.some((question) => question.type === "choice"));
    assert.ok(attempt.some((question) => question.type === "board" && question.mode === "candidate"));
    assert.ok(attempt.some((question) => question.type === "board" && question.mode === "objective"));
  }
});
