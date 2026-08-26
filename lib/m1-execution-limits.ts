export const M1_FORMAL_PAGE_LIMIT_MS = 180_000;
export const M1_FULL_RUN_LIMIT_SECONDS = 7_200;
export const M1_MAX_CONTROLLER_ACTIONS_PER_PAGE = 20;
export const M1_MAX_MODEL_API_ATTEMPTS_PER_PAGE = 3;
export const M1_MAX_MECHANICAL_RETRIES_PER_ACTION = 2;

export type M1AttemptStatus =
  | "submitted"
  | "mechanical-retry"
  | "model-error"
  | "controller-error"
  | "aborted";

export type M1AttemptLedgerRow = {
  stepOrder: number;
  attemptNumber: number;
  status: string;
  modelApiAttemptNumber: number;
  mechanicalActionId: string;
  mechanicalRetryNumber: number;
  modelRequestId: string;
  sourceModelRequestId: string;
  promptSha256: string;
  runtimeRequestSha256: string;
  screenshotSha256: string;
  outputSha256: string;
  actionTraceSha256: string;
  toolCalls: number;
  errorCode: string;
  startedAt: string | null;
  completedAt: string | null;
  responseId?: number | null;
  responseSha256?: string;
};

export type M1AttemptLedgerValidation = {
  ok: boolean;
  code?: string;
  terminalAbortCode?: string;
};

const COMPLETE_HASH = /^[a-f0-9]{64}$/i;

function invalid(code: string): M1AttemptLedgerValidation {
  return { ok: false, code };
}

export function strictM1ResponseDurationViolation(input: {
  elapsedMs: number;
  activeElapsedMs: number;
  clientStartedAt: string | null | undefined;
  clientSubmittedAt: string | null | undefined;
}) {
  const started = Date.parse(input.clientStartedAt ?? "");
  const submitted = Date.parse(input.clientSubmittedAt ?? "");
  const clientDelta = submitted - started;
  return !Number.isFinite(started) ||
    !Number.isFinite(submitted) ||
    clientDelta < 0 ||
    clientDelta > M1_FORMAL_PAGE_LIMIT_MS ||
    input.elapsedMs < 0 ||
    input.elapsedMs > M1_FORMAL_PAGE_LIMIT_MS ||
    input.activeElapsedMs < 0 ||
    input.activeElapsedMs > M1_FORMAL_PAGE_LIMIT_MS;
}

export function validateM1AttemptLedger(rows: readonly M1AttemptLedgerRow[]): M1AttemptLedgerValidation {
  if (rows.length === 0) return invalid("ATTEMPT_LEDGER_EMPTY");
  const ordered = [...rows].sort((first, second) => first.attemptNumber - second.attemptNumber);
  let actionCount = 0;
  let modelErrors = 0;
  let outputObserved = false;
  let terminalSeen = false;
  let terminalAbortCode: string | undefined;
  let lastCompleted = Number.NEGATIVE_INFINITY;
  let commonStartedAt: string | null = null;
  let commonPromptSha256 = "";
  let commonRuntimeRequestSha256 = "";
  let commonScreenshotSha256 = "";
  let successfulModelRequestId = "";
  let successfulOutputSha256 = "";
  const actionState = new Map<string, { lastRetry: number; resolved: boolean }>();

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    if (row.attemptNumber !== index + 1) return invalid("ATTEMPT_NUMBER_NOT_CONTIGUOUS");
    if (terminalSeen) return invalid("ATTEMPT_AFTER_TERMINAL_STATE");
    if (!row.startedAt || !row.completedAt) return invalid("ATTEMPT_TIMESTAMP_REQUIRED");
    const started = Date.parse(row.startedAt);
    const completed = Date.parse(row.completedAt);
    if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
      return invalid("ATTEMPT_TIMESTAMP_INVALID");
    }
    commonStartedAt ??= row.startedAt;
    if (row.startedAt !== commonStartedAt) return invalid("PAGE_START_TIMESTAMP_CHANGED");
    if (completed < lastCompleted) return invalid("ATTEMPT_TIMESTAMPS_OUT_OF_ORDER");
    if (completed - started > M1_FORMAL_PAGE_LIMIT_MS) return invalid("FORMAL_PAGE_TIME_LIMIT");
    lastCompleted = completed;
    if (!Number.isInteger(row.toolCalls) || row.toolCalls < 0) return invalid("ACTION_COUNT_INVALID");
    actionCount += row.toolCalls;
    if (actionCount > M1_MAX_CONTROLLER_ACTIONS_PER_PAGE) return invalid("CONTROLLER_ACTION_LIMIT");

    if (
      !COMPLETE_HASH.test(row.promptSha256) ||
      !COMPLETE_HASH.test(row.runtimeRequestSha256) ||
      !COMPLETE_HASH.test(row.screenshotSha256)
    ) return invalid("MODEL_INPUT_HASH_REQUIRED");
    commonPromptSha256 ||= row.promptSha256;
    commonRuntimeRequestSha256 ||= row.runtimeRequestSha256;
    commonScreenshotSha256 ||= row.screenshotSha256;
    if (
      row.promptSha256 !== commonPromptSha256 ||
      row.runtimeRequestSha256 !== commonRuntimeRequestSha256 ||
      row.screenshotSha256 !== commonScreenshotSha256
    ) return invalid("MODEL_RETRY_INPUT_CHANGED");

    if (row.status === "model-error") {
      if (outputObserved || actionState.size > 0) return invalid("MODEL_RETRY_AFTER_OUTPUT");
      modelErrors += 1;
      if (
        row.modelApiAttemptNumber !== modelErrors ||
        modelErrors > M1_MAX_MODEL_API_ATTEMPTS_PER_PAGE ||
        !row.modelRequestId ||
        row.sourceModelRequestId !== "" ||
        row.outputSha256 !== "" ||
        row.actionTraceSha256 !== "" ||
        row.toolCalls !== 0 ||
        !row.errorCode ||
        row.mechanicalActionId !== "" ||
        row.mechanicalRetryNumber !== 0
      ) return invalid("MODEL_ERROR_METADATA_INVALID");
      if (modelErrors === M1_MAX_MODEL_API_ATTEMPTS_PER_PAGE) {
        if (index !== ordered.length - 1) return invalid("MODEL_RETRY_LIMIT");
        return { ok: true, terminalAbortCode: "MODEL_API_RETRY_LIMIT" };
      }
      continue;
    }

    if (row.status === "controller-error") {
      outputObserved = true;
      successfulModelRequestId ||= row.sourceModelRequestId;
      successfulOutputSha256 ||= row.outputSha256;
      if (
        row.modelApiAttemptNumber !== modelErrors + 1 ||
        !row.mechanicalActionId ||
        row.mechanicalRetryNumber !== 0 ||
        !row.errorCode ||
        row.modelRequestId !== "" ||
        !row.sourceModelRequestId ||
        row.sourceModelRequestId !== successfulModelRequestId ||
        !COMPLETE_HASH.test(row.outputSha256) ||
        row.outputSha256 !== successfulOutputSha256 ||
        !COMPLETE_HASH.test(row.actionTraceSha256) ||
        row.toolCalls !== 1 ||
        actionState.has(row.mechanicalActionId)
      ) return invalid("CONTROLLER_ERROR_METADATA_INVALID");
      actionState.set(row.mechanicalActionId, { lastRetry: 0, resolved: false });
      continue;
    }

    if (row.status === "mechanical-retry") {
      outputObserved = true;
      const state = actionState.get(row.mechanicalActionId);
      if (
        row.modelApiAttemptNumber !== modelErrors + 1 ||
        !state ||
        state.resolved ||
        row.mechanicalRetryNumber !== state.lastRetry + 1 ||
        row.mechanicalRetryNumber > M1_MAX_MECHANICAL_RETRIES_PER_ACTION ||
        row.modelRequestId !== "" ||
        !row.sourceModelRequestId ||
        row.sourceModelRequestId !== successfulModelRequestId ||
        !COMPLETE_HASH.test(row.outputSha256) ||
        row.outputSha256 !== successfulOutputSha256 ||
        !COMPLETE_HASH.test(row.actionTraceSha256) ||
        row.toolCalls !== 1
      ) return invalid("MECHANICAL_RETRY_METADATA_INVALID");
      state.lastRetry = row.mechanicalRetryNumber;
      state.resolved = row.errorCode === "";
      if (!state.resolved && state.lastRetry === M1_MAX_MECHANICAL_RETRIES_PER_ACTION) {
        if (index !== ordered.length - 1) return invalid("MECHANICAL_RETRY_LIMIT");
        return { ok: true, terminalAbortCode: "MECHANICAL_RETRY_LIMIT" };
      }
      continue;
    }

    if (row.status === "submitted") {
      outputObserved = true;
      if (
        row.modelApiAttemptNumber !== modelErrors + 1 ||
        row.modelApiAttemptNumber < 1 ||
        row.modelApiAttemptNumber > M1_MAX_MODEL_API_ATTEMPTS_PER_PAGE ||
        row.mechanicalActionId !== "" ||
        row.mechanicalRetryNumber !== 0 ||
        row.sourceModelRequestId !== "" ||
        !row.modelRequestId ||
        !COMPLETE_HASH.test(row.outputSha256) ||
        !COMPLETE_HASH.test(row.actionTraceSha256) ||
        row.errorCode ||
        row.toolCalls < 1 ||
        (successfulModelRequestId && row.modelRequestId !== successfulModelRequestId) ||
        (successfulOutputSha256 && row.outputSha256 !== successfulOutputSha256) ||
        [...actionState.values()].some((state) => !state.resolved)
      ) return invalid("SUBMITTED_ATTEMPT_METADATA_INVALID");
      terminalSeen = true;
      continue;
    }

    if (row.status === "aborted") {
      const abortedAfterOutput = outputObserved || actionState.size > 0;
      if (
        !row.errorCode ||
        row.toolCalls !== 0 ||
        row.modelApiAttemptNumber !== 0 ||
        row.modelRequestId !== "" ||
        row.mechanicalActionId !== "" ||
        row.mechanicalRetryNumber !== 0 ||
        (abortedAfterOutput
          ? !row.sourceModelRequestId ||
            row.sourceModelRequestId !== successfulModelRequestId ||
            row.outputSha256 !== successfulOutputSha256 ||
            !COMPLETE_HASH.test(row.actionTraceSha256)
          : row.sourceModelRequestId !== "" || row.outputSha256 !== "" || row.actionTraceSha256 !== "")
      ) return invalid("ABORT_METADATA_INVALID");
      terminalSeen = true;
      terminalAbortCode = "AGENT_CONTROLLER_ABORT";
      continue;
    }

    return invalid("ATTEMPT_STATUS_INVALID");
  }

  return terminalAbortCode ? { ok: true, terminalAbortCode } : { ok: true };
}

export function m1AttemptLedgerIsSubmitted(rows: readonly M1AttemptLedgerRow[]) {
  const validation = validateM1AttemptLedger(rows);
  if (!validation.ok || validation.terminalAbortCode) return false;
  const ordered = [...rows].sort((first, second) => first.attemptNumber - second.attemptNumber);
  return ordered.at(-1)?.status === "submitted";
}
