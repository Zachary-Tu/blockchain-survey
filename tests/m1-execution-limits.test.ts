import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  type M1AttemptLedgerRow,
  M1_FORMAL_PAGE_LIMIT_MS,
  M1_FULL_RUN_LIMIT_SECONDS,
  M1_MAX_CONTROLLER_ACTIONS_PER_PAGE,
  M1_MAX_MECHANICAL_RETRIES_PER_ACTION,
  M1_MAX_MODEL_API_ATTEMPTS_PER_PAGE,
  m1AttemptLedgerIsSubmitted,
  strictM1ResponseDurationViolation,
  validateM1AttemptLedger,
} from "../lib/m1-execution-limits";

const hashes = {
  prompt: "a".repeat(64),
  runtime: "b".repeat(64),
  screenshot: "c".repeat(64),
  output: "d".repeat(64),
  action: "e".repeat(64),
};

function row(overrides: Partial<M1AttemptLedgerRow> = {}): M1AttemptLedgerRow {
  return {
    stepOrder: 0,
    attemptNumber: 1,
    status: "submitted",
    modelApiAttemptNumber: 1,
    mechanicalActionId: "",
    mechanicalRetryNumber: 0,
    modelRequestId: "req-success",
    sourceModelRequestId: "",
    promptSha256: hashes.prompt,
    runtimeRequestSha256: hashes.runtime,
    screenshotSha256: hashes.screenshot,
    outputSha256: hashes.output,
    actionTraceSha256: hashes.action,
    toolCalls: 2,
    errorCode: "",
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:00:01.000Z",
    ...overrides,
  };
}

function modelError(attemptNumber: number): M1AttemptLedgerRow {
  return row({
    attemptNumber,
    status: "model-error",
    modelApiAttemptNumber: attemptNumber,
    modelRequestId: `req-error-${attemptNumber}`,
    outputSha256: "",
    actionTraceSha256: "",
    toolCalls: 0,
    errorCode: "MODEL_API_ERROR",
    completedAt: `2026-08-26T00:00:0${attemptNumber}.000Z`,
  });
}

test("accepts a direct submitted M1 Agent ledger", () => {
  const ledger = [row()];
  assert.deepEqual(validateM1AttemptLedger(ledger), { ok: true });
  assert.equal(m1AttemptLedgerIsSubmitted(ledger), true);
});

test("accepts two identical-input model errors followed by the third API attempt succeeding", () => {
  const ledger = [
    modelError(1),
    modelError(2),
    row({ attemptNumber: 3, modelApiAttemptNumber: 3, completedAt: "2026-08-26T00:00:03.000Z" }),
  ];
  assert.deepEqual(validateM1AttemptLedger(ledger), { ok: true });
  assert.equal(m1AttemptLedgerIsSubmitted(ledger), true);
});

test("terminates after the third failed model API attempt", () => {
  const result = validateM1AttemptLedger([modelError(1), modelError(2), modelError(3)]);
  assert.deepEqual(result, { ok: true, terminalAbortCode: "MODEL_API_RETRY_LIMIT" });
  assert.equal(m1AttemptLedgerIsSubmitted([modelError(1), modelError(2), modelError(3)]), false);
});

test("binds mechanical retries to the same successful model request and output", () => {
  const controllerError = row({
    status: "controller-error",
    modelApiAttemptNumber: 1,
    modelRequestId: "",
    sourceModelRequestId: "req-success",
    mechanicalActionId: "drag-boundary-1",
    toolCalls: 1,
    errorCode: "POINTER_MISSED",
  });
  const retry = row({
    attemptNumber: 2,
    status: "mechanical-retry",
    modelApiAttemptNumber: 1,
    modelRequestId: "",
    sourceModelRequestId: "req-success",
    mechanicalActionId: "drag-boundary-1",
    mechanicalRetryNumber: 1,
    toolCalls: 1,
    errorCode: "",
    completedAt: "2026-08-26T00:00:02.000Z",
  });
  const submitted = row({ attemptNumber: 3, toolCalls: 2, completedAt: "2026-08-26T00:00:03.000Z" });
  assert.deepEqual(validateM1AttemptLedger([controllerError, retry, submitted]), { ok: true });
});

test("rejects gaps, changed retry inputs, model recall after output, and attempts after terminal", () => {
  assert.equal(validateM1AttemptLedger([row({ attemptNumber: 2 })]).code, "ATTEMPT_NUMBER_NOT_CONTIGUOUS");
  assert.equal(validateM1AttemptLedger([
    modelError(1),
    row({ attemptNumber: 2, modelApiAttemptNumber: 2, runtimeRequestSha256: "f".repeat(64) }),
  ]).code, "MODEL_RETRY_INPUT_CHANGED");
  assert.equal(validateM1AttemptLedger([
    row({
      status: "controller-error",
      modelRequestId: "",
      sourceModelRequestId: "req-success",
      mechanicalActionId: "click-1",
      toolCalls: 1,
      errorCode: "MISSED",
    }),
    modelError(2),
  ]).code, "MODEL_RETRY_AFTER_OUTPUT");
  assert.equal(validateM1AttemptLedger([row(), row({ attemptNumber: 2 })]).code, "ATTEMPT_AFTER_TERMINAL_STATE");
});

test("enforces mechanical retry state and per-page action limits", () => {
  const controllerError = row({
    status: "controller-error",
    modelRequestId: "",
    sourceModelRequestId: "req-success",
    mechanicalActionId: "click-1",
    toolCalls: 1,
    errorCode: "MISSED",
  });
  const successfulRetry = row({
    attemptNumber: 2,
    status: "mechanical-retry",
    modelRequestId: "",
    sourceModelRequestId: "req-success",
    mechanicalActionId: "click-1",
    mechanicalRetryNumber: 1,
    toolCalls: 1,
    errorCode: "",
    completedAt: "2026-08-26T00:00:02.000Z",
  });
  assert.equal(validateM1AttemptLedger([
    controllerError,
    successfulRetry,
    row({
      attemptNumber: 3,
      status: "mechanical-retry",
      modelRequestId: "",
      sourceModelRequestId: "req-success",
      mechanicalActionId: "click-1",
      mechanicalRetryNumber: 2,
      toolCalls: 1,
      errorCode: "",
      completedAt: "2026-08-26T00:00:03.000Z",
    }),
  ]).code, "MECHANICAL_RETRY_METADATA_INVALID");
  assert.equal(validateM1AttemptLedger([row({ toolCalls: 21 })]).code, "CONTROLLER_ACTION_LIMIT");
});

test("maps an explicit controller abort to a terminal session code", () => {
  const result = validateM1AttemptLedger([row({
    status: "aborted",
    modelApiAttemptNumber: 0,
    modelRequestId: "",
    outputSha256: "",
    actionTraceSha256: "",
    toolCalls: 0,
    errorCode: "CONTROLLER_CRASH",
  })]);
  assert.deepEqual(result, { ok: true, terminalAbortCode: "AGENT_CONTROLLER_ABORT" });
});

test("rejects every ledger row after an explicit abort", () => {
  const aborted = row({
    status: "aborted",
    modelApiAttemptNumber: 0,
    modelRequestId: "",
    outputSha256: "",
    actionTraceSha256: "",
    toolCalls: 0,
    errorCode: "CONTROLLER_CRASH",
  });
  const afterAbort = row({ attemptNumber: 2 });
  assert.equal(
    validateM1AttemptLedger([aborted, afterAbort]).code,
    "ATTEMPT_AFTER_TERMINAL_STATE",
  );
});

test("checks client telemetry at the exact 180-second boundary", () => {
  assert.equal(strictM1ResponseDurationViolation({
    elapsedMs: M1_FORMAL_PAGE_LIMIT_MS,
    activeElapsedMs: M1_FORMAL_PAGE_LIMIT_MS,
    clientStartedAt: "2026-08-26T00:00:00.000Z",
    clientSubmittedAt: "2026-08-26T00:03:00.000Z",
  }), false);
  assert.equal(strictM1ResponseDurationViolation({
    elapsedMs: M1_FORMAL_PAGE_LIMIT_MS + 1,
    activeElapsedMs: 1,
    clientStartedAt: "2026-08-26T00:00:00.000Z",
    clientSubmittedAt: "2026-08-26T00:00:01.000Z",
  }), true);
  assert.equal(strictM1ResponseDurationViolation({
    elapsedMs: 1,
    activeElapsedMs: M1_FORMAL_PAGE_LIMIT_MS + 1,
    clientStartedAt: "2026-08-26T00:00:00.000Z",
    clientSubmittedAt: "2026-08-26T00:00:01.000Z",
  }), true);
  assert.equal(strictM1ResponseDurationViolation({
    elapsedMs: 1,
    activeElapsedMs: 1,
    clientStartedAt: "2026-08-26T00:00:00.000Z",
    clientSubmittedAt: "2026-08-26T00:03:00.001Z",
  }), true);
});

test("keeps the machine runner limits synchronized with executable constants", async () => {
  const runner = JSON.parse(await readFile("public/data/m1-agent-runner-protocol.json", "utf8")) as {
    attemptLogPolicy: { submittedAttemptRequires: string[] };
    executionLimits: Record<string, number>;
    requiredSessionMetadata: string[];
    pilotPlan: { stageB: { runtimeEnabled: boolean } };
    primaryCohortProfilePolicy: { sourceManifestBoundBuildId: boolean };
  };
  assert.equal(runner.executionLimits.formalPageWallClockSeconds * 1000, M1_FORMAL_PAGE_LIMIT_MS);
  assert.equal(runner.executionLimits.fullRunWallClockMinutes * 60, M1_FULL_RUN_LIMIT_SECONDS);
  assert.equal(runner.executionLimits.maxControllerActionsPerFormalPage, M1_MAX_CONTROLLER_ACTIONS_PER_PAGE);
  assert.equal(runner.executionLimits.maxAdditionalMechanicalRetriesPerAction, M1_MAX_MECHANICAL_RETRIES_PER_ACTION);
  assert.equal(runner.executionLimits.maxAdditionalModelApiRetriesBeforeAnyOutput + 1, M1_MAX_MODEL_API_ATTEMPTS_PER_PAGE);
  for (const field of [
    "modelApiAttemptNumber",
    "mechanicalActionId",
    "mechanicalRetryNumber",
    "sourceModelRequestId",
    "runtimeRequestSha256",
  ]) assert.ok(runner.attemptLogPolicy.submittedAttemptRequires.includes(field), `runner requires ${field}`);
  for (const field of [
    "controllerArtifactSha256",
    "runtimePromptPackageSha256",
    "browserEngine",
    "browserMajor",
  ]) assert.ok(runner.requiredSessionMetadata.includes(field), `runner session metadata requires ${field}`);
  assert.equal(runner.pilotPlan.stageB.runtimeEnabled, false);
  assert.equal(runner.primaryCohortProfilePolicy.sourceManifestBoundBuildId, true);
});
