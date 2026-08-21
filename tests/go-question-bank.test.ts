import assert from "node:assert/strict";
import test from "node:test";

import { boardHash, createBoard, playMove } from "../app/tim-classroom/go/goEngine";
import { buildGoAttempt, goQuestionBanks, goQuestionBankStats } from "../app/tim-classroom/go/goQuestionBank";

test("十级题库规模与棋谱主题完整", () => {
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
    assert.ok(bank.every((question) => question.type === "board"), `第 ${level} 级不能混入规则背诵题`);
  }
});

test("600 个变式的每条推荐变化逐手合法", () => {
  for (const [level, questions] of Object.entries(goQuestionBanks)) {
    for (const question of questions) {
      assert.equal(question.type, "board");
      if (question.type !== "board") continue;
      const initial = createBoard(question.boardSize);
      for (const stone of question.stones) {
        assert.equal(initial[stone.row][stone.col], 0, `${question.id} 重复摆子`);
        initial[stone.row][stone.col] = stone.color;
      }
      for (const [lineIndex, line] of question.solutionLines.entries()) {
        let board = initial.map((row) => [...row]);
        const history = [boardHash(board)];
        for (let ply = 0; ply < line.length; ply += 1) {
          const color = (ply % 2 === 0 ? question.toPlay : question.toPlay === 1 ? 2 : 1) as 1 | 2;
          const result = playMove(board, color, line[ply], history);
          assert.equal(result.valid, true, `第 ${level} 级 ${question.id} 变化 ${lineIndex + 1} 第 ${ply + 1} 手非法：${result.reason}`);
          board = result.board;
          history.push(boardHash(board));
        }
      }
    }
  }
});

test("标准练习每级稳定抽取 10 个不重复主题", () => {
  for (let level = 1; level <= 10; level += 1) {
    for (let round = 0; round < 20; round += 1) {
      const attempt = buildGoAttempt(level);
      assert.equal(attempt.length, 10);
      assert.equal(new Set(attempt.map((question) => question.family)).size, 10);
      assert.ok(attempt.every((question) => question.id.startsWith(`go-l${level}-`)));
    }
  }
});

test("旋转与镜像变式同步改写方向讲解", () => {
  const variants = goQuestionBanks[1].filter((question) => question.family === "atari-direction");
  assert.equal(variants.length, 6);
  assert.match(variants[0].prompt, /从右侧.*向下方/);
  assert.match(variants[1].prompt, /从下侧.*向左方/);
  assert.match(variants[2].prompt, /从左侧.*向上方/);
  assert.ok(variants.every((question) => !/[\uE000-\uF8FF]/.test(`${question.prompt}${question.explanation}`)));
});
