import {
  type M1StageAActor,
  type M1StageACondition,
  type M1StageAFrozenScope,
  type M1StageAPairAuditInput,
  type M1StageAPreStartTerminalInput,
  type M1StageASessionAuditInput,
} from "./m1-stage-a-audit";
import { isM1PreStartTerminalDisposition } from "./m1-launch";
import {
  type M1AttemptLedgerRow,
  M1_FORMAL_PAGE_LIMIT_MS,
  m1AttemptLedgerIsSubmitted,
  validateM1AttemptLedger,
} from "./m1-execution-limits";
import { buildM1ProtocolPlan, M1_PROTOCOL_VERSION } from "./m1-protocol";
import { hashM1ScientificResponse } from "./m1-response-integrity";

export type CsvTable = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export type M1StageAExportTables = {
  allocations: CsvTable;
  sessions: CsvTable;
  responses: CsvTable;
  stepExposures: CsvTable;
  agentAttempts: CsvTable;
};

const SHA256 = /^[a-f0-9]{64}$/i;
const DEPLOYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const DAY_MS = 86_400_000;
const M1_WEEKLY_WINDOWS: Record<string, { start: string; end: string; observationCount: number }> = {
  bitcoin: { start: "2010-10-21", end: "2026-04-06", observationCount: 808 },
  ethereum: { start: "2015-11-16", end: "2026-04-06", observationCount: 543 },
  solana: { start: "2020-07-19", end: "2026-04-06", observationCount: 300 },
  bnb: { start: "2017-11-02", end: "2026-04-06", observationCount: 441 },
  xrp: { start: "2013-11-13", end: "2026-04-06", observationCount: 648 },
  dogecoin: { start: "2014-03-26", end: "2026-04-06", observationCount: 629 },
};

export function parseResearchCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  while (rows.length && rows.at(-1)?.every((value) => value === "")) rows.pop();
  if (!rows.length) throw new Error("CSV has no header row");
  const headers = rows[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("CSV headers must be non-empty and unique");
  }
  const records = rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
  return { headers, rows: records };
}

function requireHeaders(table: CsvTable, tableName: string, required: string[]) {
  const available = new Set(table.headers);
  const missing = required.filter((header) => !available.has(header));
  if (missing.length) throw new Error(`${tableName} is missing columns: ${missing.join(", ")}`);
}

export type M1StageADeploymentIdentity = {
  deploymentId: string;
  deploymentFingerprintSha256: string;
};

export function validateM1StageADeploymentIdentity(
  tables: M1StageAExportTables,
): M1StageADeploymentIdentity {
  const deploymentIds = new Set<string>();
  const deploymentFingerprints = new Set<string>();
  for (const [tableName, table] of Object.entries(tables) as Array<[keyof M1StageAExportTables, CsvTable]>) {
    requireHeaders(table, tableName, ["deployment_id", "deployment_fingerprint_sha256"]);
    for (const [index, row] of table.rows.entries()) {
      if (!DEPLOYMENT_ID.test(row.deployment_id)) {
        throw new Error(`${tableName} row ${index + 2} has an invalid deployment_id`);
      }
      const fingerprint = row.deployment_fingerprint_sha256.toLowerCase();
      if (!SHA256.test(fingerprint)) {
        throw new Error(`${tableName} row ${index + 2} has an invalid deployment_fingerprint_sha256`);
      }
      deploymentIds.add(row.deployment_id);
      deploymentFingerprints.add(fingerprint);
    }
  }
  if (deploymentIds.size !== 1 || deploymentFingerprints.size !== 1) {
    throw new Error("The five Stage-A exports do not share exactly one deployment identity");
  }
  return {
    deploymentId: [...deploymentIds][0],
    deploymentFingerprintSha256: [...deploymentFingerprints][0],
  };
}

function integer(value: string, label: string) {
  if (!/^-?\d+$/.test(value)) throw new Error(`${label} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is outside the safe integer range`);
  return parsed;
}

function nullableInteger(value: string, label: string) {
  return value === "" ? null : integer(value, label);
}

function finiteNumber(value: string, label: string) {
  if (value.trim() === "") throw new Error(`${label} must be a number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite`);
  return parsed;
}

function boolean(value: string, label: string) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${label} must be true or false`);
}

function timestampMs(value: string, label: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function assertScopeRow(
  row: Record<string, string>,
  scope: M1StageAFrozenScope,
  label: string,
  fields: Array<[string, keyof M1StageAFrozenScope]>,
) {
  for (const [column, scopeKey] of fields) {
    if (row[column] !== scope[scopeKey]) {
      throw new Error(`${label}.${column} does not match the frozen scope`);
    }
  }
  if (row.allocation_mode !== "balanced-random-v1") {
    throw new Error(`${label}.allocation_mode must be balanced-random-v1`);
  }
}

function assertSessionLink(
  row: Record<string, string>,
  session: Record<string, string>,
  label: string,
  fields: Array<[string, string]>,
) {
  for (const [rowColumn, sessionColumn] of fields) {
    if (row[rowColumn] !== session[sessionColumn]) {
      throw new Error(`${label}.${rowColumn} does not match its session`);
    }
  }
}

type StimulusWindow = {
  start: string;
  end: string;
  observationCount: number;
  startMs: number;
  endMs: number;
};

type BoundaryRecord = {
  index: number;
  ratio: number;
  date: string;
};

type BoundaryIntervalRecord = {
  boundaryIndex: number;
  centerRatio: number;
  halfWidthRatio: number;
  widthRatio: number;
  lowerRatio: number;
  upperRatio: number;
  lowerIndex: number;
  upperIndex: number;
  lowerDate: string;
  upperDate: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function isoDateMs(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO calendar date`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real ISO calendar date`);
  }
  return parsed;
}

function jsonFiniteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}

function jsonInteger(value: unknown, label: string) {
  const parsed = jsonFiniteNumber(value, label);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function parseStimulusWindow(
  value: string,
  expectedMode: string,
  assetId: string,
  label: string,
): StimulusWindow {
  const parsed = record(parseJson(value, label), label);
  if (parsed.mode !== expectedMode) throw new Error(`${label}.mode does not match window_mode`);
  if (expectedMode !== "whole") throw new Error(`${label}.mode is outside the frozen M1 whole-window protocol`);
  const displayed = record(parsed.displayed, `${label}.displayed`);
  const source = record(parsed.source, `${label}.source`);
  const startMs = isoDateMs(displayed.start, `${label}.displayed.start`);
  const endMs = isoDateMs(displayed.end, `${label}.displayed.end`);
  const observationCount = jsonInteger(displayed.observationCount, `${label}.displayed.observationCount`);
  if (observationCount < 3 || endMs <= startMs) {
    throw new Error(`${label}.displayed must contain at least three ordered observations`);
  }
  const canonical = M1_WEEKLY_WINDOWS[assetId];
  if (!canonical) throw new Error(`${label} has an unknown M1 asset`);
  if (
    displayed.start !== canonical.start || displayed.end !== canonical.end ||
    observationCount !== canonical.observationCount || source.start !== canonical.start ||
    source.end !== canonical.end || source.observationCount !== canonical.observationCount
  ) throw new Error(`${label} does not match the frozen asset window`);
  return {
    start: displayed.start as string,
    end: displayed.end as string,
    observationCount,
    startMs,
    endMs,
  };
}

function assertDateRatioPosition(
  index: number,
  ratio: number,
  date: string,
  window: StimulusWindow,
  label: string,
  endpointsAllowed: boolean,
) {
  const lastIndex = window.observationCount - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > lastIndex) {
    throw new Error(`${label}.index is outside the displayed series`);
  }
  if (!Number.isFinite(ratio) || (endpointsAllowed ? ratio < 0 || ratio > 1 : ratio <= 0 || ratio >= 1)) {
    throw new Error(`${label}.ratio is outside the displayed series`);
  }
  if (index !== Math.round(ratio * lastIndex)) {
    throw new Error(`${label}.index is inconsistent with ratio`);
  }
  const dateMs = isoDateMs(date, `${label}.date`);
  if (dateMs < window.startMs || dateMs > window.endMs) {
    throw new Error(`${label}.date is outside the displayed series`);
  }
  const temporalRatio = (dateMs - window.startMs) / (window.endMs - window.startMs);
  const tolerance = Math.max(0.005, 2 / lastIndex);
  if (Math.abs(temporalRatio - ratio) > tolerance) {
    throw new Error(`${label}.date is inconsistent with ratio`);
  }
  // In the frozen M1 bundle, observation 1 through the final observation are
  // exact weekly anchors. Observation 0 is the launch-tail point and may be a
  // partial week, so it is validated against the frozen start date separately.
  const expectedDateMs = index === 0
    ? window.startMs
    : window.endMs - (lastIndex - index) * 7 * DAY_MS;
  if (dateMs !== expectedDateMs) throw new Error(`${label}.date does not match index`);
}

function parseBoundaries(
  value: string,
  window: StimulusWindow,
  expectedCount: 0 | 2,
  label: string,
): BoundaryRecord[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error(`${label} must contain exactly ${expectedCount} boundaries`);
  }
  const boundaries = parsed.map((item, index) => {
    const boundary = record(item, `${label}[${index}]`);
    const candidate = {
      index: jsonInteger(boundary.index, `${label}[${index}].index`),
      ratio: jsonFiniteNumber(boundary.ratio, `${label}[${index}].ratio`),
      date: String(boundary.date ?? ""),
    };
    assertDateRatioPosition(candidate.index, candidate.ratio, candidate.date, window, `${label}[${index}]`, false);
    return candidate;
  });
  for (let index = 1; index < boundaries.length; index += 1) {
    const prior = boundaries[index - 1];
    const current = boundaries[index];
    if (current.index <= prior.index || current.ratio <= prior.ratio || current.date <= prior.date) {
      throw new Error(`${label} boundaries must be strictly ordered`);
    }
  }
  return boundaries;
}

function parseBoundaryIntervals(
  value: string,
  boundaries: BoundaryRecord[],
  window: StimulusWindow,
  label: string,
): BoundaryIntervalRecord[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed) || parsed.length !== boundaries.length) {
    throw new Error(`${label} must contain one interval per boundary`);
  }
  return parsed.map((item, index) => {
    const interval = record(item, `${label}[${index}]`);
    const candidate: BoundaryIntervalRecord = {
      boundaryIndex: jsonInteger(interval.boundaryIndex, `${label}[${index}].boundaryIndex`),
      centerRatio: jsonFiniteNumber(interval.centerRatio, `${label}[${index}].centerRatio`),
      halfWidthRatio: jsonFiniteNumber(interval.halfWidthRatio, `${label}[${index}].halfWidthRatio`),
      widthRatio: jsonFiniteNumber(interval.widthRatio, `${label}[${index}].widthRatio`),
      lowerRatio: jsonFiniteNumber(interval.lowerRatio, `${label}[${index}].lowerRatio`),
      upperRatio: jsonFiniteNumber(interval.upperRatio, `${label}[${index}].upperRatio`),
      lowerIndex: jsonInteger(interval.lowerIndex, `${label}[${index}].lowerIndex`),
      upperIndex: jsonInteger(interval.upperIndex, `${label}[${index}].upperIndex`),
      lowerDate: String(interval.lowerDate ?? ""),
      upperDate: String(interval.upperDate ?? ""),
    };
    const center = boundaries[index];
    if (
      candidate.boundaryIndex !== index ||
      Math.abs(candidate.centerRatio - center.ratio) > 0.002 ||
      candidate.halfWidthRatio < 0.005 || candidate.halfWidthRatio > 0.2 ||
      candidate.lowerRatio < 0 || candidate.upperRatio > 1 ||
      candidate.lowerRatio > candidate.centerRatio || candidate.upperRatio < candidate.centerRatio ||
      candidate.lowerIndex > center.index || candidate.upperIndex < center.index ||
      candidate.lowerDate > center.date || candidate.upperDate < center.date ||
      Math.abs(candidate.lowerRatio - (candidate.centerRatio - candidate.halfWidthRatio)) > 0.002 ||
      Math.abs(candidate.upperRatio - (candidate.centerRatio + candidate.halfWidthRatio)) > 0.002 ||
      Math.abs(candidate.widthRatio - 2 * candidate.halfWidthRatio) > 0.002 ||
      Math.abs(candidate.widthRatio - (candidate.upperRatio - candidate.lowerRatio)) > 0.002
    ) throw new Error(`${label}[${index}] is inconsistent with its boundary`);
    assertDateRatioPosition(
      candidate.lowerIndex,
      candidate.lowerRatio,
      candidate.lowerDate,
      window,
      `${label}[${index}].lower`,
      true,
    );
    assertDateRatioPosition(
      candidate.upperIndex,
      candidate.upperRatio,
      candidate.upperDate,
      window,
      `${label}[${index}].upper`,
      true,
    );
    return candidate;
  });
}

function sameBoundaries(first: BoundaryRecord[], second: BoundaryRecord[]) {
  return first.length === second.length && first.every((boundary, index) => {
    const other = second[index];
    return other !== undefined && boundary.index === other.index && boundary.date === other.date &&
      Math.abs(boundary.ratio - other.ratio) <= 0.000001;
  });
}

function sameBoundaryCenters(first: BoundaryRecord[], second: BoundaryRecord[]) {
  return first.length === second.length && first.every((boundary, index) =>
    second[index] !== undefined && Math.abs(boundary.ratio - second[index].ratio) <= 0.00001);
}

function sameIntervalHalfWidths(first: BoundaryIntervalRecord[], second: BoundaryIntervalRecord[]) {
  return first.length === second.length && first.every((interval, index) =>
    second[index] !== undefined &&
    Math.abs(interval.halfWidthRatio - second[index].halfWidthRatio) <= 0.00001);
}

function chromeBrowserMajor(value: string) {
  if (/Edg\//i.test(value)) return null;
  const match = value.match(/Chrome\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function sessionHasVisualProtocolDeviation(
  session: Record<string, string>,
  allocation: Record<string, string>,
) {
  const viewportWidth = integer(session.initial_viewport_width, `${session.session_id} initial_viewport_width`);
  const viewportHeight = integer(session.initial_viewport_height, `${session.session_id} initial_viewport_height`);
  const devicePixelRatio = finiteNumber(session.device_pixel_ratio, `${session.session_id} device_pixel_ratio`);
  const expectedChromeMajor = integer(allocation.primary_browser_major, `${session.session_id} primary_browser_major`);
  if (session.primary_browser_major !== allocation.primary_browser_major) {
    throw new Error(`Session primary_browser_major does not match allocation ${session.session_id}`);
  }
  if (
    viewportWidth <= 0 || viewportWidth > 20_000 || viewportHeight <= 0 || viewportHeight > 20_000 ||
    devicePixelRatio <= 0 || devicePixelRatio > 100 || expectedChromeMajor < 100
  ) throw new Error(`Session visual protocol telemetry is invalid ${session.session_id}`);
  return session.device_type !== "desktop" || viewportWidth !== 1440 || viewportHeight !== 900 ||
    devicePixelRatio !== 1 || session.pointer_type !== "fine" ||
    !session.screen_orientation.startsWith("landscape") ||
    chromeBrowserMajor(session.user_agent) !== expectedChromeMajor;
}

type ResponseRow = {
  sessionId: string;
  responseId: number;
  stepOrder: number;
  trialId: string;
  trialOrder: number;
  disclosureIndex: number;
  disclosureKey: string;
  assetId: string;
  boundariesJson: string;
  previousBoundariesJson: string;
  boundaryIntervalsJson: string;
  boundaries: BoundaryRecord[];
  previousBoundaries: BoundaryRecord[];
  boundaryIntervals: BoundaryIntervalRecord[];
  influenceRating: number | null;
  noChangeConfirmed: boolean;
  singleStageConfirmed: boolean;
  g0ExactDefaultAnchor: boolean;
  hasResponseProtocolDeviation: boolean;
  raw: Record<string, string>;
};

type ExposureRow = {
  sessionId: string;
  stepOrder: number;
  trialId: string;
  disclosureIndex: number;
  responseId: number | null;
  elapsedMs: number | null;
};

type AttemptRow = M1AttemptLedgerRow & { sessionId: string };

function canonicalRowsAreComplete(
  session: Record<string, string>,
  responses: ResponseRow[],
) {
  const scheduleId = integer(session.schedule_id, `session ${session.session_id} schedule_id`);
  const condition = session.information_condition as M1StageACondition;
  const plan = buildM1ProtocolPlan(scheduleId, condition);
  if (responses.length !== 42 || new Set(responses.map((row) => row.stepOrder)).size !== 42) return false;
  const byStep = new Map(responses.map((row) => [row.stepOrder, row]));
  for (let disclosureIndex = 0; disclosureIndex < 7; disclosureIndex += 1) {
    for (const trial of plan) {
      const stepOrder = disclosureIndex * 6 + trial.order;
      const response = byStep.get(stepOrder);
      if (!response) return false;
      const raw = response.raw;
      if (
        response.trialId !== trial.id || response.trialOrder !== trial.order ||
        response.disclosureIndex !== disclosureIndex ||
        response.disclosureKey !== trial.disclosures[disclosureIndex] ||
        response.assetId !== trial.assetId ||
        raw.response_version !== M1_PROTOCOL_VERSION || raw.module_key !== "disclosure" ||
        raw.task_type !== "T2" || raw.stimulus_type !== "crypto" ||
        raw.metric_type !== "price" || raw.resolution !== "weekly" ||
        raw.scale_mode !== "linear" || raw.window_mode !== "whole"
      ) return false;
    }
  }
  return true;
}

function exposuresAreComplete(responses: ResponseRow[], exposures: ExposureRow[]) {
  if (exposures.length !== 42 || new Set(exposures.map((row) => row.stepOrder)).size !== 42) return false;
  const responsesByStep = new Map(responses.map((row) => [row.stepOrder, row]));
  return exposures.every((exposure) => {
    const response = responsesByStep.get(exposure.stepOrder);
    return response !== undefined && exposure.trialId === response.trialId &&
      exposure.disclosureIndex === response.disclosureIndex && exposure.responseId === response.responseId &&
      exposure.elapsedMs !== null && exposure.elapsedMs >= 0 && exposure.elapsedMs <= M1_FORMAL_PAGE_LIMIT_MS;
  });
}

async function agentAttemptsAreComplete(
  responses: ResponseRow[],
  attempts: AttemptRow[],
) {
  const attemptsByStep = new Map<number, AttemptRow[]>();
  for (const attempt of attempts) {
    const rows = attemptsByStep.get(attempt.stepOrder) ?? [];
    rows.push(attempt);
    attemptsByStep.set(attempt.stepOrder, rows);
  }
  if (attemptsByStep.size !== 42) return false;
  const responsesByStep = new Map(responses.map((row) => [row.stepOrder, row]));
  for (let stepOrder = 0; stepOrder < 42; stepOrder += 1) {
    const ledger = attemptsByStep.get(stepOrder) ?? [];
    const response = responsesByStep.get(stepOrder);
    if (!response || !validateM1AttemptLedger(ledger).ok || !m1AttemptLedgerIsSubmitted(ledger)) return false;
    const submitted = ledger.find((attempt) => attempt.status === "submitted");
    if (!submitted || submitted.responseId !== response.responseId) return false;
    const expectedHash = await hashM1ScientificResponse({
      sessionId: response.sessionId,
      stepOrder,
      trialId: response.trialId,
      disclosureIndex: response.disclosureIndex,
      boundariesJson: response.boundariesJson,
      previousBoundariesJson: response.previousBoundariesJson,
      boundaryIntervalsJson: response.boundaryIntervalsJson,
      influenceRating: response.influenceRating,
      noChangeConfirmed: response.noChangeConfirmed,
      singleStageConfirmed: response.singleStageConfirmed,
    });
    if (submitted.responseSha256 !== expectedHash) return false;
  }
  return true;
}

export async function normalizeM1StageAExports(
  scope: M1StageAFrozenScope,
  tables: M1StageAExportTables,
): Promise<M1StageAPairAuditInput[]> {
  requireHeaders(tables.allocations, "allocations", [
    "pair_id", "actor_type", "replicate_id", "schedule_id", "information_condition",
    "assignment_version", "cohort_id", "implementation_build_id", "allocation_mode",
    "protocol_architecture", "stimulus_sha256", "event_source_sha256", "primary_browser_major",
    "deployment_id", "deployment_fingerprint_sha256", "token_sha256", "token_created_at",
    "token_claimed_at", "claimed_session_id", "revoked_at", "terminal_disposition", "terminal_at",
  ]);
  requireHeaders(tables.sessions, "sessions", [
    "session_id", "session_status", "session_started_at", "session_completed_at", "actor_type",
    "experimental_arm", "protocol_version", "practice_completed_at", "pair_id", "schedule_id", "information_condition",
    "protocol_architecture", "cohort_id", "implementation_build_id", "allocation_mode",
    "stimulus_sha256", "event_source_sha256", "primary_browser_major", "deployment_id",
    "deployment_fingerprint_sha256", "device_type",
    "initial_viewport_width", "initial_viewport_height", "device_pixel_ratio", "pointer_type",
    "screen_orientation", "user_agent",
  ]);
  requireHeaders(tables.responses, "responses", [
    "session_id", "actor_type", "pair_id", "schedule_id", "information_condition", "protocol_architecture",
    "cohort_id", "implementation_build_id", "allocation_mode", "stimulus_sha256", "event_source_sha256",
    "deployment_id", "deployment_fingerprint_sha256",
    "response_id", "step_order", "trial_id", "trial_order", "response_version", "module_key", "task_type",
    "stimulus_type", "asset_id", "metric_type", "resolution", "scale_mode", "window_mode",
    "disclosure_index", "disclosure_key", "boundaries_json", "previous_boundaries_json",
    "boundary_intervals_json", "influence_rating", "no_change_confirmed", "single_stage_confirmed",
    "stimulus_window_json", "adjustment_count", "first_move_ms", "response_viewport_width",
    "response_viewport_height", "response_orientation", "cue_schema_version", "cue_tags_json", "rationale",
  ]);
  requireHeaders(tables.stepExposures, "step-exposures", [
    "session_id", "pair_id", "actor_type", "cohort_id", "allocation_mode", "step_order", "trial_id",
    "disclosure_index", "response_id", "server_page_elapsed_ms", "deployment_id", "deployment_fingerprint_sha256",
  ]);
  requireHeaders(tables.agentAttempts, "agent-attempts", [
    "session_id", "pair_id", "schedule_id", "information_condition", "cohort_id", "allocation_mode", "step_order", "attempt_number",
    "model_api_attempt_number", "mechanical_action_id", "mechanical_retry_number", "model_request_id",
    "source_model_request_id", "prompt_sha256", "runtime_request_sha256", "screenshot_sha256",
    "output_sha256", "action_trace_sha256", "response_id", "response_sha256", "tool_calls", "status",
    "error_code", "started_at", "completed_at", "deployment_id", "deployment_fingerprint_sha256",
  ]);

  validateM1StageADeploymentIdentity(tables);

  const sessionsById = new Map<string, Record<string, string>>();
  for (const row of tables.sessions.rows) {
    assertScopeRow(row, scope, `session ${row.session_id}`, [
      ["cohort_id", "cohortId"], ["protocol_architecture", "protocolArchitecture"],
      ["implementation_build_id", "implementationBuildId"], ["stimulus_sha256", "stimulusSha256"],
      ["event_source_sha256", "eventSourceSha256"],
    ]);
    if (!row.session_id || sessionsById.has(row.session_id)) throw new Error(`Duplicate or empty session_id ${row.session_id}`);
    sessionsById.set(row.session_id, row);
  }

  const responseGroups = new Map<string, ResponseRow[]>();
  const responseIds = new Set<number>();
  for (const raw of tables.responses.rows) {
    assertScopeRow(raw, scope, `response ${raw.response_id}`, [
      ["cohort_id", "cohortId"], ["protocol_architecture", "protocolArchitecture"],
      ["implementation_build_id", "implementationBuildId"], ["stimulus_sha256", "stimulusSha256"],
      ["event_source_sha256", "eventSourceSha256"],
    ]);
    const session = sessionsById.get(raw.session_id);
    if (!session) throw new Error(`Response references unknown session ${raw.session_id}`);
    assertSessionLink(raw, session, `response ${raw.response_id}`, [
      ["actor_type", "actor_type"], ["pair_id", "pair_id"], ["schedule_id", "schedule_id"],
      ["information_condition", "information_condition"],
    ]);
    const responseId = integer(raw.response_id, "response_id");
    if (responseIds.has(responseId)) throw new Error(`Duplicate response_id ${responseId}`);
    responseIds.add(responseId);
    const disclosureIndex = integer(raw.disclosure_index, `response ${responseId} disclosure_index`);
    const window = parseStimulusWindow(
      raw.stimulus_window_json,
      raw.window_mode,
      raw.asset_id,
      `response ${responseId} stimulus_window_json`,
    );
    const boundaries = parseBoundaries(raw.boundaries_json, window, 2, `response ${responseId} boundaries_json`);
    const previousBoundaries = parseBoundaries(
      raw.previous_boundaries_json,
      window,
      disclosureIndex === 0 ? 0 : 2,
      `response ${responseId} previous_boundaries_json`,
    );
    const boundaryIntervals = parseBoundaryIntervals(
      raw.boundary_intervals_json,
      boundaries,
      window,
      `response ${responseId} boundary_intervals_json`,
    );
    const adjustmentCount = integer(raw.adjustment_count, `response ${responseId} adjustment_count`);
    if (adjustmentCount < 0) throw new Error(`response ${responseId} adjustment_count must be non-negative`);
    const firstMoveMs = nullableInteger(raw.first_move_ms, `response ${responseId} first_move_ms`);
    if (firstMoveMs !== null && firstMoveMs < 0) throw new Error(`response ${responseId} first_move_ms must be non-negative`);
    const responseViewportWidth = integer(raw.response_viewport_width, `response ${responseId} response_viewport_width`);
    const responseViewportHeight = integer(raw.response_viewport_height, `response ${responseId} response_viewport_height`);
    if (
      responseViewportWidth <= 0 || responseViewportWidth > 20_000 ||
      responseViewportHeight <= 0 || responseViewportHeight > 20_000 ||
      !raw.response_orientation || raw.response_orientation.length > 40
    ) {
      throw new Error(`response ${responseId} response viewport telemetry is invalid`);
    }
    const influenceRating = raw.influence_rating === ""
      ? null
      : integer(raw.influence_rating, `response ${responseId} influence_rating`);
    if (
      (disclosureIndex === 0 && influenceRating !== null) ||
      (disclosureIndex > 0 && (influenceRating === null || influenceRating < 1 || influenceRating > 5))
    ) throw new Error(`response ${responseId} influence_rating does not match its disclosure`);
    const singleStageConfirmed = boolean(raw.single_stage_confirmed, `response ${responseId} single_stage_confirmed`);
    if (singleStageConfirmed) throw new Error(`response ${responseId} fixed T2 cannot be single-stage`);
    const cueTags = parseJson(raw.cue_tags_json, `response ${responseId} cue_tags_json`);
    if (
      raw.cue_schema_version !== "none" || !Array.isArray(cueTags) || cueTags.length !== 0 ||
      raw.rationale !== ""
    ) throw new Error(`response ${responseId} strict M1 cue fields must be empty`);
    const response: ResponseRow = {
      sessionId: raw.session_id,
      responseId,
      stepOrder: integer(raw.step_order, `response ${responseId} step_order`),
      trialId: raw.trial_id,
      trialOrder: integer(raw.trial_order, `response ${responseId} trial_order`),
      disclosureIndex,
      disclosureKey: raw.disclosure_key,
      assetId: raw.asset_id,
      boundariesJson: raw.boundaries_json,
      previousBoundariesJson: raw.previous_boundaries_json,
      boundaryIntervalsJson: raw.boundary_intervals_json,
      boundaries,
      previousBoundaries,
      boundaryIntervals,
      influenceRating,
      noChangeConfirmed: boolean(raw.no_change_confirmed, `response ${responseId} no_change_confirmed`),
      singleStageConfirmed,
      g0ExactDefaultAnchor: disclosureIndex === 0 &&
        Math.abs(boundaries[0].ratio - 1 / 3) <= 0.00001 &&
        Math.abs(boundaries[1].ratio - 2 / 3) <= 0.00001 &&
        adjustmentCount === 0 && firstMoveMs === null,
      hasResponseProtocolDeviation:
        responseViewportWidth !== 1440 || responseViewportHeight !== 900 ||
        !raw.response_orientation.startsWith("landscape"),
      raw,
    };
    const rows = responseGroups.get(raw.session_id) ?? [];
    rows.push(response);
    responseGroups.set(raw.session_id, rows);
  }

  for (const [sessionId, responses] of responseGroups) {
    const byTrialDisclosure = new Map<string, ResponseRow>();
    for (const response of responses) {
      const key = `${response.trialId}:${response.disclosureIndex}`;
      if (byTrialDisclosure.has(key)) throw new Error(`Duplicate response position ${sessionId}:${key}`);
      byTrialDisclosure.set(key, response);
    }
    for (const response of responses) {
      if (response.disclosureIndex === 0) {
        if (response.noChangeConfirmed) {
          throw new Error(`Baseline response cannot confirm no change ${sessionId}:${response.trialId}`);
        }
        continue;
      }
      const prior = byTrialDisclosure.get(`${response.trialId}:${response.disclosureIndex - 1}`);
      if (!prior) throw new Error(`Response is missing its prior disclosure ${sessionId}:${response.trialId}:${response.disclosureIndex}`);
      if (!sameBoundaries(response.previousBoundaries, prior.boundaries)) {
        throw new Error(`Previous boundaries do not match the prior disclosure ${sessionId}:${response.trialId}:${response.disclosureIndex}`);
      }
      const unchanged = sameBoundaryCenters(response.boundaries, prior.boundaries) &&
        sameIntervalHalfWidths(response.boundaryIntervals, prior.boundaryIntervals);
      if (response.noChangeConfirmed !== unchanged) {
        throw new Error(`no_change_confirmed does not match the prior scientific answer ${sessionId}:${response.trialId}:${response.disclosureIndex}`);
      }
    }
  }

  const exposureGroups = new Map<string, ExposureRow[]>();
  for (const raw of tables.stepExposures.rows) {
    assertScopeRow(raw, scope, `exposure ${raw.session_id}:${raw.step_order}`, [["cohort_id", "cohortId"]]);
    const session = sessionsById.get(raw.session_id);
    if (!session) throw new Error(`Exposure references unknown session ${raw.session_id}`);
    assertSessionLink(raw, session, `exposure ${raw.session_id}:${raw.step_order}`, [
      ["actor_type", "actor_type"], ["pair_id", "pair_id"],
    ]);
    const exposure: ExposureRow = {
      sessionId: raw.session_id,
      stepOrder: integer(raw.step_order, "exposure step_order"),
      trialId: raw.trial_id,
      disclosureIndex: integer(raw.disclosure_index, "exposure disclosure_index"),
      responseId: nullableInteger(raw.response_id, "exposure response_id"),
      elapsedMs: raw.server_page_elapsed_ms === "" ? null : finiteNumber(raw.server_page_elapsed_ms, "server_page_elapsed_ms"),
    };
    const rows = exposureGroups.get(raw.session_id) ?? [];
    rows.push(exposure);
    exposureGroups.set(raw.session_id, rows);
  }

  const attemptGroups = new Map<string, AttemptRow[]>();
  for (const raw of tables.agentAttempts.rows) {
    assertScopeRow(raw, scope, `attempt ${raw.session_id}:${raw.step_order}:${raw.attempt_number}`, [["cohort_id", "cohortId"]]);
    const session = sessionsById.get(raw.session_id);
    if (!session || session.actor_type !== "agent") throw new Error(`Attempt references non-Agent session ${raw.session_id}`);
    assertSessionLink(raw, session, `attempt ${raw.session_id}:${raw.step_order}:${raw.attempt_number}`, [
      ["pair_id", "pair_id"], ["schedule_id", "schedule_id"],
      ["information_condition", "information_condition"],
    ]);
    const attempt: AttemptRow = {
      sessionId: raw.session_id,
      stepOrder: integer(raw.step_order, "attempt step_order"),
      attemptNumber: integer(raw.attempt_number, "attempt_number"),
      status: raw.status,
      modelApiAttemptNumber: integer(raw.model_api_attempt_number, "model_api_attempt_number"),
      mechanicalActionId: raw.mechanical_action_id,
      mechanicalRetryNumber: integer(raw.mechanical_retry_number, "mechanical_retry_number"),
      modelRequestId: raw.model_request_id,
      sourceModelRequestId: raw.source_model_request_id,
      promptSha256: raw.prompt_sha256,
      runtimeRequestSha256: raw.runtime_request_sha256,
      screenshotSha256: raw.screenshot_sha256,
      outputSha256: raw.output_sha256,
      actionTraceSha256: raw.action_trace_sha256,
      toolCalls: integer(raw.tool_calls, "tool_calls"),
      errorCode: raw.error_code,
      startedAt: raw.started_at || null,
      completedAt: raw.completed_at || null,
      responseId: nullableInteger(raw.response_id, "attempt response_id"),
      responseSha256: raw.response_sha256,
    };
    const rows = attemptGroups.get(raw.session_id) ?? [];
    rows.push(attempt);
    attemptGroups.set(raw.session_id, rows);
  }

  const pairAllocations = new Map<string, Record<M1StageAActor, Record<string, string> | null>>();
  const pairConditions = new Map<string, { condition: M1StageACondition; scheduleId: number }>();
  const claimedSessionIds = new Set<string>();
  const allocationTokenHashes = new Set<string>();
  for (const raw of tables.allocations.rows) {
    assertScopeRow(raw, scope, `allocation ${raw.pair_id}:${raw.actor_type}`, [
      ["cohort_id", "cohortId"], ["protocol_architecture", "protocolArchitecture"],
      ["implementation_build_id", "implementationBuildId"], ["stimulus_sha256", "stimulusSha256"],
      ["event_source_sha256", "eventSourceSha256"],
    ]);
    if (raw.assignment_version !== "balanced-random-v1") throw new Error("assignment_version must be balanced-random-v1");
    const tokenSha256 = raw.token_sha256.toLowerCase();
    if (!SHA256.test(tokenSha256)) throw new Error(`Invalid allocation token SHA-256 ${raw.pair_id}:${raw.actor_type}`);
    if (allocationTokenHashes.has(tokenSha256)) throw new Error(`Duplicate allocation token SHA-256 ${raw.pair_id}:${raw.actor_type}`);
    allocationTokenHashes.add(tokenSha256);
    const lifecycleLabel = `allocation ${raw.pair_id}:${raw.actor_type}`;
    const tokenCreatedAt = timestampMs(raw.token_created_at, `${lifecycleLabel}.token_created_at`);
    const isClaimed = raw.claimed_session_id !== "";
    const hasAnyPreStartTerminalField = Boolean(
      raw.terminal_disposition || raw.terminal_at || raw.revoked_at,
    );
    if (isClaimed) {
      if (!raw.token_claimed_at) throw new Error(`${lifecycleLabel} claimed token is missing token_claimed_at`);
      if (timestampMs(raw.token_claimed_at, `${lifecycleLabel}.token_claimed_at`) < tokenCreatedAt) {
        throw new Error(`${lifecycleLabel} was claimed before token creation`);
      }
      if (hasAnyPreStartTerminalField) {
        throw new Error(`${lifecycleLabel} cannot be both claimed and pre-start terminal/revoked`);
      }
      if (claimedSessionIds.has(raw.claimed_session_id)) {
        throw new Error(`claimed_session_id is linked from more than one allocation ${raw.claimed_session_id}`);
      }
      claimedSessionIds.add(raw.claimed_session_id);
    } else {
      if (raw.token_claimed_at) throw new Error(`${lifecycleLabel} has token_claimed_at without a session`);
      if (hasAnyPreStartTerminalField) {
        if (!isM1PreStartTerminalDisposition(raw.terminal_disposition)) {
          throw new Error(`${lifecycleLabel} has an invalid pre-start terminal disposition`);
        }
        if (!raw.terminal_at || !raw.revoked_at || raw.terminal_at !== raw.revoked_at) {
          throw new Error(`${lifecycleLabel} terminal_at and revoked_at must be the same server timestamp`);
        }
        if (timestampMs(raw.terminal_at, `${lifecycleLabel}.terminal_at`) < tokenCreatedAt) {
          throw new Error(`${lifecycleLabel} became terminal before token creation`);
        }
      }
    }
    const actor = raw.actor_type as M1StageAActor;
    if (actor !== "human" && actor !== "agent") throw new Error(`Invalid allocation actor ${raw.actor_type}`);
    if ((actor === "human" && raw.replicate_id !== "human-primary") || (actor === "agent" && raw.replicate_id !== "R-PRIMARY")) {
      throw new Error(`Invalid primary replicate ${raw.pair_id}:${actor}`);
    }
    const condition = raw.information_condition as M1StageACondition;
    if (condition !== "staged" && condition !== "repeat-control") throw new Error(`Invalid condition ${condition}`);
    const scheduleId = integer(raw.schedule_id, `allocation ${raw.pair_id} schedule_id`);
    const existingCondition = pairConditions.get(raw.pair_id);
    if (existingCondition && (existingCondition.condition !== condition || existingCondition.scheduleId !== scheduleId)) {
      throw new Error(`Pair assignment disagrees across actor rows: ${raw.pair_id}`);
    }
    pairConditions.set(raw.pair_id, { condition, scheduleId });
    const slots = pairAllocations.get(raw.pair_id) ?? { human: null, agent: null };
    if (slots[actor]) throw new Error(`Duplicate allocation slot ${raw.pair_id}:${actor}`);
    slots[actor] = raw;
    pairAllocations.set(raw.pair_id, slots);
  }
  for (const sessionId of sessionsById.keys()) {
    if (!claimedSessionIds.has(sessionId)) throw new Error(`Session is not linked from a primary allocation: ${sessionId}`);
  }

  async function summarizeSession(
    pairId: string,
    actor: M1StageAActor,
    allocation: Record<string, string> | null,
  ): Promise<M1StageASessionAuditInput | null> {
    if (!allocation?.claimed_session_id) return null;
    if (allocation.revoked_at) throw new Error(`Claimed primary token is revoked: ${pairId}:${actor}`);
    const session = sessionsById.get(allocation.claimed_session_id);
    if (!session) throw new Error(`Claimed session missing from session export: ${allocation.claimed_session_id}`);
    if (session.actor_type !== actor || session.pair_id !== pairId || session.schedule_id !== allocation.schedule_id || session.information_condition !== allocation.information_condition) {
      throw new Error(`Session does not match allocation ${pairId}:${actor}`);
    }
    if ((actor === "human" && session.experimental_arm !== "m1-main") || (actor === "agent" && session.experimental_arm !== "agent-m1-main")) {
      throw new Error(`Session arm does not match actor ${pairId}:${actor}`);
    }
    if (session.protocol_version !== M1_PROTOCOL_VERSION) {
      throw new Error(`Session protocol_version does not match the frozen protocol ${pairId}:${actor}`);
    }
    const status = session.session_status as M1StageASessionAuditInput["status"];
    if (status !== "active" && status !== "complete" && status !== "aborted") throw new Error(`Invalid session status ${status}`);
    const responses = responseGroups.get(session.session_id) ?? [];
    const exposures = exposureGroups.get(session.session_id) ?? [];
    const attempts = attemptGroups.get(session.session_id) ?? [];
    const visualProtocolDeviation = sessionHasVisualProtocolDeviation(session, allocation);
    const canonicalComplete = canonicalRowsAreComplete(session, responses);
    const exposureComplete = exposuresAreComplete(responses, exposures);
    const agentComplete = actor === "human" || await agentAttemptsAreComplete(responses, attempts);
    const completionMinutes = status === "complete"
      ? (timestampMs(session.session_completed_at, `${session.session_id} completed_at`) -
        timestampMs(session.session_started_at, `${session.session_id} started_at`)) / 60_000
      : null;
    if (
      status === "complete" &&
      (completionMinutes === null || !Number.isFinite(completionMinutes) || completionMinutes < 0)
    ) {
      throw new Error(`Complete session has invalid duration ${session.session_id}`);
    }
    const g0Rows = responses.filter((response) => response.disclosureIndex === 0);
    return {
      actor,
      status,
      completionMinutes,
      integrityComplete: status === "complete" && Boolean(session.practice_completed_at) && canonicalComplete && exposureComplete && agentComplete,
      hasProtocolDeviation: visualProtocolDeviation || responses.some((response) => response.hasResponseProtocolDeviation),
      g0JudgmentCount: g0Rows.length,
      g0ExactDefaultAnchorCount: g0Rows.filter((response) => response.g0ExactDefaultAnchor).length,
    };
  }

  function summarizePreStartTerminal(
    allocation: Record<string, string> | null,
  ): M1StageAPreStartTerminalInput | null {
    if (!allocation?.terminal_disposition) return null;
    if (!isM1PreStartTerminalDisposition(allocation.terminal_disposition)) {
      throw new Error("Invalid pre-start terminal disposition after allocation validation");
    }
    return {
      disposition: allocation.terminal_disposition,
      terminalAt: allocation.terminal_at,
    };
  }

  const pairs: M1StageAPairAuditInput[] = [];
  for (const [pairId, slots] of pairAllocations) {
    const assignment = pairConditions.get(pairId);
    if (!assignment) throw new Error(`Pair assignment missing ${pairId}`);
    pairs.push({
      pairId,
      condition: assignment.condition,
      scheduleId: assignment.scheduleId,
      human: await summarizeSession(pairId, "human", slots.human),
      agent: await summarizeSession(pairId, "agent", slots.agent),
      humanPreStartTerminal: summarizePreStartTerminal(slots.human),
      agentPreStartTerminal: summarizePreStartTerminal(slots.agent),
    });
  }
  return pairs.sort((first, second) =>
    first.condition.localeCompare(second.condition) || first.scheduleId - second.scheduleId);
}

export function validSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}
