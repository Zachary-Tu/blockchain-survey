import assert from "node:assert/strict";
import test from "node:test";
import {
  buildM1ProtocolPlan,
  M1_ASSET_IDS,
  M1_DISCLOSURE_KEYS,
  M1_EVENT_SOURCE_SHA256,
  M1_STIMULUS_SHA256,
  m1StepOrder,
  normalizeM1Condition,
  normalizeM1ScheduleId,
  scheduleIdFromText,
} from "../lib/m1-protocol";

test("M1 Williams schedules balance asset positions and directed immediate carry-over", () => {
  const schedules = Array.from({ length: 6 }, (_, index) =>
    buildM1ProtocolPlan(index + 1, "staged").map((trial) => trial.assetId),
  );

  for (let position = 0; position < M1_ASSET_IDS.length; position += 1) {
    assert.deepEqual(
      new Set(schedules.map((schedule) => schedule[position])),
      new Set(M1_ASSET_IDS),
      `position ${position + 1} must contain every asset exactly once`,
    );
  }

  const transitions = new Map<string, number>();
  for (const schedule of schedules) {
    for (let index = 1; index < schedule.length; index += 1) {
      const key = `${schedule[index - 1]}→${schedule[index]}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
    }
  }
  assert.equal(transitions.size, 30);
  assert.ok([...transitions.values()].every((count) => count === 1));
});

test("staged and repeat-control sessions preserve the same 42-step task topology", () => {
  const staged = buildM1ProtocolPlan(4, "staged");
  const repeated = buildM1ProtocolPlan(4, "repeat-control");

  assert.equal(staged.length * staged[0].disclosures.length, 42);
  assert.equal(repeated.length * repeated[0].disclosures.length, 42);
  assert.deepEqual(
    staged.map(({ id, order, assetId }) => ({ id, order, assetId })),
    repeated.map(({ id, order, assetId }) => ({ id, order, assetId })),
  );
  assert.deepEqual(staged[0].disclosures, [...M1_DISCLOSURE_KEYS]);
  assert.deepEqual(repeated[0].disclosures, ["G0", "G0", "G0", "G0", "G0", "G0", "G0"]);

  for (let disclosureIndex = 0; disclosureIndex < 7; disclosureIndex += 1) {
    for (let trialOrder = 0; trialOrder < 6; trialOrder += 1) {
      assert.equal(m1StepOrder(trialOrder, disclosureIndex), disclosureIndex * 6 + trialOrder);
    }
  }
});

test("M1 normalization is deterministic and bounded", () => {
  assert.equal(normalizeM1ScheduleId(0), 1);
  assert.equal(normalizeM1ScheduleId(7), 1);
  assert.equal(normalizeM1ScheduleId("5"), 5);
  assert.equal(normalizeM1Condition("unexpected"), "staged");
  assert.equal(normalizeM1Condition("repeat-control"), "repeat-control");
  assert.equal(scheduleIdFromText("PAIR-001"), scheduleIdFromText("PAIR-001"));
  assert.ok(scheduleIdFromText("PAIR-001") >= 1 && scheduleIdFromText("PAIR-001") <= 6);
  assert.match(M1_STIMULUS_SHA256, /^[a-f0-9]{64}$/);
  assert.match(M1_EVENT_SOURCE_SHA256, /^[a-f0-9]{64}$/);
});
