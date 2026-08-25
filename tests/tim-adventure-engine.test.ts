import assert from "node:assert/strict";
import test from "node:test";

import {
  advancePower,
  isSuccessfulLanding,
  jumpChapters,
  starsForMisses,
} from "../app/tim-adventure/jumpEngine";

test("三段储能逐级加速且绿色成功区逐级缩窄", () => {
  assert.deepEqual(jumpChapters.map((chapter) => chapter.max - chapter.min), [6, 4, 3]);
  assert.ok(jumpChapters[0].speed < jumpChapters[1].speed);
  assert.ok(jumpChapters[1].speed < jumpChapters[2].speed);
  assert.ok(jumpChapters.every((chapter) => chapter.min > 0 && chapter.max < 100));
});

test("蓄力达到满格后从零继续，而不是反向下降", () => {
  assert.deepEqual(advancePower(20, 100, 0.1), { power: 30, wrapped: false });
  const wrapped = advancePower(98, 20, 0.17);
  assert.equal(wrapped.wrapped, true);
  assert.ok(Math.abs(wrapped.power - 1.4) < 1e-9);
});

test("每段只接受狭窄绿色区内的蓄力值", () => {
  for (const chapter of jumpChapters) {
    assert.equal(isSuccessfulLanding(chapter.min, chapter), true);
    assert.equal(isSuccessfulLanding(chapter.max, chapter), true);
    assert.equal(isSuccessfulLanding(chapter.min - 0.01, chapter), false);
    assert.equal(isSuccessfulLanding(chapter.max + 0.01, chapter), false);
  }
});

test("失败次数映射为一到三星", () => {
  assert.deepEqual([0, 1, 2, 3, 99].map(starsForMisses), [3, 2, 2, 1, 1]);
});
