import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { ensureExperimentSchema, getDb } from "@/db";
import { m1SessionMutationGateResponse } from "@/lib/m1-collection-gates";
import {
  agentRunAttempts,
  experimentExpectedSteps,
  experimentSessions,
  experimentStepExposures,
  modularResponses,
} from "@/db/schema";
import { isStrictM1Arm, M1_PROTOCOL_VERSION } from "@/lib/m1-protocol";
import { hashM1ScientificResponse } from "@/lib/m1-response-integrity";
import {
  type M1AttemptLedgerRow,
  M1_FORMAL_PAGE_LIMIT_MS,
  M1_FULL_RUN_LIMIT_SECONDS,
  m1AttemptLedgerIsSubmitted,
  strictM1ResponseDurationViolation,
} from "@/lib/m1-execution-limits";

const MODULES = new Set(["disclosure", "framing", "cross-series", "robustness"]);
const TASKS = new Set(["T1", "T2", "T3"]);
const STIMULUS_TYPES = new Set(["crypto", "cross-domain", "null", "ground-truth"]);
const METRICS = new Set(["price", "activeAddresses", "googleTrends"]);
const RESOLUTIONS = new Set(["daily", "weekly", "monthly", "yearly"]);
const SCALES = new Set(["linear", "log"]);
const WINDOWS = new Set(["whole", "truncated"]);
const DISCLOSURES = new Set(["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4", "FULL"]);
const RESPONSE_VERSIONS = new Set(["v4", "v4.1", "v4.2", "v4.3", "pre-v4", "agent-v1", "agent-v2", "m1-isomorphic-v1"]);
const V4_CUES_V1 = new Set([
  "curve_trend_slope",
  "curve_level_shift",
  "curve_variance",
  "curve_abrupt_jump",
  "curve_extrema_reversal",
  "curve_persistence",
  "curve_periodicity",
  "curve_signal_noise",
  "display_temporal_location",
  "display_window_points",
  "display_resolution",
  "display_axis_scale",
  "context_asset_knowledge",
  "context_events_news",
  "context_prior_expectation",
  "context_other",
]);
const V4_CUES_V2_BY_DISCLOSURE: Record<string, Set<string>> = {
  G0: new Set(["g0_trend_slope", "g0_level_shift", "g0_variance_noise", "g0_abrupt_reversal", "g0_persistence"]),
  GI1: new Set(["gi1_metric_meaning", "gi1_expected_dynamics", "gi1_spike_interpretation", "gi1_domain_prior", "gi1_no_effect"]),
  GI2: new Set(["gi2_calendar_location", "gi2_duration", "gi2_resolution_density", "gi2_unit_scale", "gi2_no_effect"]),
  DI1: new Set(["di1_asset_category", "di1_cycle_memory", "di1_personal_familiarity", "di1_expected_behavior", "di1_no_effect"]),
  DI2: new Set(["di2_launch_maturity", "di2_function_positioning", "di2_mechanism", "di2_background_fit", "di2_no_effect"]),
  DI3: new Set(["di3_event_proximity", "di3_post_event_level", "di3_post_event_variance", "di3_event_cluster", "di3_no_effect"]),
  DI4: new Set(["di4_boundary_refinement", "di4_short_disturbance", "di4_event_density", "di4_cross_event_consistency", "di4_no_effect"]),
  FULL: new Set(["full_curve_structure", "full_axes_time", "full_metric_type", "full_asset_context", "full_events"]),
};
const V4_CUE_SCHEMAS = new Set(["visual-cpd-event-segmentation-v1", "disclosure-specific-cues-v2"]);
const UNCERTAINTY_HALF_WIDTH_MIN = 0.005;
const UNCERTAINTY_HALF_WIDTH_MAX = 0.2;

type Boundary = {
  index?: number;
  ratio?: number;
  date?: string;
};

type BoundaryInterval = {
  boundaryIndex?: number;
  centerRatio?: number;
  halfWidthRatio?: number;
  widthRatio?: number;
  lowerRatio?: number;
  upperRatio?: number;
  lowerIndex?: number;
  upperIndex?: number;
  lowerDate?: string;
  upperDate?: string;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: unknown) {
  return finiteNumber(value) && value >= 0 && value <= 86_400_000;
}

function validOptionalTime(value: unknown) {
  return value === null || value === undefined || nonNegative(value);
}

function validOptionalDimension(value: unknown) {
  return value === null || value === undefined ||
    (finiteNumber(value) && Number.isInteger(value) && value > 0 && value <= 20000);
}

function validOptionalIsoTimestamp(value: unknown) {
  return value === null || value === undefined ||
    (typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)));
}

function validBoundaries(value: unknown, maximum = 5): value is Boundary[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  let previousRatio = -1;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const boundary = item as Boundary;
    if (
      !finiteNumber(boundary.index) ||
      !Number.isInteger(boundary.index) ||
      boundary.index < 0 ||
      !finiteNumber(boundary.ratio) ||
      boundary.ratio <= previousRatio ||
      boundary.ratio <= 0 ||
      boundary.ratio >= 1 ||
      typeof boundary.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(boundary.date)
    ) {
      return false;
    }
    previousRatio = boundary.ratio;
    return true;
  });
}

function validIntervals(value: unknown, boundaries: Boundary[]): value is BoundaryInterval[] {
  if (!Array.isArray(value) || value.length !== boundaries.length) return false;
  return value.every((item, index) => {
    if (!item || typeof item !== "object") return false;
    const interval = item as BoundaryInterval;
    const center = boundaries[index]?.ratio;
    return (
      finiteNumber(interval.boundaryIndex) &&
      interval.boundaryIndex === index &&
      finiteNumber(interval.centerRatio) &&
      finiteNumber(center) &&
      Math.abs(interval.centerRatio - center) <= 0.002 &&
      finiteNumber(interval.halfWidthRatio) &&
      interval.halfWidthRatio >= UNCERTAINTY_HALF_WIDTH_MIN &&
      interval.halfWidthRatio <= UNCERTAINTY_HALF_WIDTH_MAX &&
      finiteNumber(interval.widthRatio) &&
      finiteNumber(interval.lowerRatio) &&
      finiteNumber(interval.upperRatio) &&
      interval.lowerRatio >= 0 &&
      interval.upperRatio <= 1 &&
      interval.lowerRatio <= interval.centerRatio &&
      interval.upperRatio >= interval.centerRatio &&
      interval.widthRatio > 0 &&
      Math.abs(interval.lowerRatio - (interval.centerRatio - interval.halfWidthRatio)) <= 0.002 &&
      Math.abs(interval.upperRatio - (interval.centerRatio + interval.halfWidthRatio)) <= 0.002 &&
      Math.abs(interval.widthRatio - 2 * interval.halfWidthRatio) <= 0.002 &&
      Math.abs(interval.widthRatio - (interval.upperRatio - interval.lowerRatio)) <= 0.002 &&
      finiteNumber(interval.lowerIndex) &&
      finiteNumber(interval.upperIndex) &&
      Number.isInteger(interval.lowerIndex) &&
      Number.isInteger(interval.upperIndex) &&
      interval.lowerIndex >= 0 &&
      interval.upperIndex >= interval.lowerIndex &&
      typeof interval.lowerDate === "string" &&
      typeof interval.upperDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(interval.lowerDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(interval.upperDate)
    );
  });
}

function errorMessage(error: unknown) {
  const messages: string[] = [];
  let cursor: unknown = error;
  for (let depth = 0; depth < 6 && cursor; depth += 1) {
    if (cursor instanceof Error) messages.push(cursor.message);
    cursor =
      typeof cursor === "object" && cursor !== null && "cause" in cursor
        ? (cursor as { cause?: unknown }).cause
        : null;
  }
  const combined = messages.join("\n");
  if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(combined)) {
    return "This trial disclosure has already been submitted.";
  }
  return messages[0] ?? "Unexpected database error";
}

function isUniqueConstraint(error: unknown) {
  let cursor: unknown = error;
  for (let depth = 0; depth < 6 && cursor; depth += 1) {
    if (cursor instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(cursor.message)) {
      return true;
    }
    cursor = typeof cursor === "object" && cursor !== null && "cause" in cursor
      ? (cursor as { cause?: unknown }).cause
      : null;
  }
  return false;
}

function sameJson(left: string, right: unknown) {
  try {
    return JSON.stringify(JSON.parse(left)) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function sameBoundaryPositions(left: Boundary[], right: Boundary[]) {
  return left.length === right.length && left.every((boundary, index) =>
    finiteNumber(boundary.ratio) &&
    finiteNumber(right[index]?.ratio) &&
    Math.abs((boundary.ratio ?? 0) - (right[index]?.ratio ?? 0)) <= 0.00001,
  );
}

function intervalHalfWidths(value: BoundaryInterval[]) {
  return value.map((interval) => interval.halfWidthRatio ?? Number.NaN);
}

function sameNumberList(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) =>
    Number.isFinite(value) && Number.isFinite(right[index]) && Math.abs(value - right[index]) <= 0.00001,
  );
}

function sameScientificAnswer(
  existing: typeof modularResponses.$inferSelect,
  candidate: {
    boundaries: Boundary[];
    previousBoundaries: Boundary[];
    boundaryIntervals: BoundaryInterval[];
    singleStageConfirmed: boolean;
    influenceRating: number | null;
    noChangeConfirmed: boolean;
    cueTags: string[];
    rationale: string;
  },
) {
  return sameJson(existing.boundariesJson, candidate.boundaries) &&
    sameJson(existing.previousBoundariesJson, candidate.previousBoundaries) &&
    sameJson(existing.boundaryIntervalsJson, candidate.boundaryIntervals) &&
    existing.singleStageConfirmed === candidate.singleStageConfirmed &&
    existing.influenceRating === candidate.influenceRating &&
    existing.noChangeConfirmed === candidate.noChangeConfirmed &&
    sameJson(existing.cueTags, candidate.cueTags) &&
    existing.rationale === candidate.rationale;
}

async function linkSubmittedAgentAttempt(
  response: typeof modularResponses.$inferSelect,
  stepOrder: number,
) {
  const [attempt] = await getDb()
    .select()
    .from(agentRunAttempts)
    .where(and(
      eq(agentRunAttempts.sessionId, response.sessionId),
      eq(agentRunAttempts.stepOrder, stepOrder),
      eq(agentRunAttempts.status, "submitted"),
    ))
    .limit(1);
  if (!attempt) return false;
  const responseSha256 = await hashM1ScientificResponse({
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
  if (attempt.responseId !== null) {
    if (attempt.responseId !== response.id || attempt.responseSha256 !== responseSha256) {
      throw new Error("Submitted Agent attempt is already linked to another scientific response");
    }
    return true;
  }
  await getDb()
    .update(agentRunAttempts)
    .set({ responseId: response.id, responseSha256 })
    .where(and(eq(agentRunAttempts.id, attempt.id), isNull(agentRunAttempts.responseId)));
  const [linked] = await getDb()
    .select({ responseId: agentRunAttempts.responseId, responseSha256: agentRunAttempts.responseSha256 })
    .from(agentRunAttempts)
    .where(eq(agentRunAttempts.id, attempt.id))
    .limit(1);
  if (linked?.responseId !== response.id || linked.responseSha256 !== responseSha256) {
    throw new Error("Agent attempt could not be linked to the saved scientific response");
  }
  return true;
}

function responseMatchesExpected(
  payload: {
    trialId?: string;
    trialOrder?: number;
    moduleKey?: string;
    taskType?: string;
    stimulusType?: string;
    assetId?: string;
    metricType?: string;
    resolution?: string;
    scaleMode?: string;
    windowMode?: string;
    disclosureIndex?: number;
    disclosureKey?: string;
  },
  expected: typeof experimentExpectedSteps.$inferSelect,
) {
  return payload.trialId === expected.trialId &&
    payload.trialOrder === expected.trialOrder &&
    payload.moduleKey === expected.moduleKey &&
    payload.taskType === expected.taskType &&
    payload.stimulusType === expected.stimulusType &&
    payload.assetId === expected.assetId &&
    payload.metricType === expected.metricType &&
    payload.resolution === expected.resolution &&
    payload.scaleMode === expected.scaleMode &&
    payload.windowMode === expected.windowMode &&
    payload.disclosureIndex === expected.disclosureIndex &&
    payload.disclosureKey === expected.disclosureKey;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      sessionId?: string;
      trialId?: string;
      trialOrder?: number;
      responseVersion?: string;
      moduleKey?: string;
      taskType?: string;
      stimulusType?: string;
      assetId?: string;
      metricType?: string;
      resolution?: string;
      scaleMode?: string;
      windowMode?: string;
      disclosureIndex?: number;
      disclosureKey?: string;
      disclosureState?: unknown;
      stimulusWindow?: unknown;
      cueSchemaVersion?: string;
      boundaries?: unknown;
      previousBoundaries?: unknown;
      boundaryIntervals?: unknown;
      singleStageConfirmed?: boolean;
      confidence?: number;
      confidenceTouched?: boolean;
      influenceRating?: number | null;
      influenceTouched?: boolean;
      noChangeConfirmed?: boolean;
      cueTags?: unknown;
      rationale?: string;
      elapsedMs?: number;
      revealReadMs?: number;
      firstMoveMs?: number | null;
      firstUncertaintyMs?: number | null;
      adjustmentCount?: number;
      uncertaintyAdjustmentCount?: number;
      clientStartedAt?: string | null;
      clientSubmittedAt?: string | null;
      responseViewportWidth?: number | null;
      responseViewportHeight?: number | null;
      responseOrientation?: string;
      pageHiddenMs?: number;
      activeElapsedMs?: number;
    };
    const responseVersion = payload.responseVersion ?? "pre-v4";
    const isStructuredResponse = ["v4", "v4.1", "v4.2", "v4.3", "agent-v1", "agent-v2", "m1-isomorphic-v1"].includes(responseVersion);
    const isTelemetryResponse = responseVersion === "v4.3" || responseVersion === "m1-isomorphic-v1";

    if (
      !payload.sessionId ||
      !payload.trialId ||
      !payload.moduleKey ||
      !payload.taskType ||
      !payload.stimulusType ||
      !payload.assetId ||
      !payload.metricType ||
      !payload.resolution ||
      !payload.scaleMode ||
      !payload.windowMode ||
      !payload.disclosureKey ||
      !RESPONSE_VERSIONS.has(responseVersion) ||
      !MODULES.has(payload.moduleKey) ||
      !TASKS.has(payload.taskType) ||
      !STIMULUS_TYPES.has(payload.stimulusType) ||
      !METRICS.has(payload.metricType) ||
      !RESOLUTIONS.has(payload.resolution) ||
      !SCALES.has(payload.scaleMode) ||
      !WINDOWS.has(payload.windowMode) ||
      !DISCLOSURES.has(payload.disclosureKey) ||
      !finiteNumber(payload.trialOrder) ||
      !Number.isInteger(payload.trialOrder) ||
      payload.trialOrder < 0 ||
      !finiteNumber(payload.disclosureIndex) ||
      !Number.isInteger(payload.disclosureIndex) ||
      payload.disclosureIndex < 0 ||
      payload.disclosureIndex > 6 ||
      (!isStructuredResponse &&
        (!finiteNumber(payload.confidence) || payload.confidence < 1 || payload.confidence > 5)) ||
      (isStructuredResponse && payload.confidence !== undefined) ||
      !nonNegative(payload.elapsedMs) ||
      !nonNegative(payload.revealReadMs) ||
      !validOptionalTime(payload.firstMoveMs) ||
      !validOptionalTime(payload.firstUncertaintyMs) ||
      !nonNegative(payload.adjustmentCount) ||
      !nonNegative(payload.uncertaintyAdjustmentCount) ||
      !validOptionalIsoTimestamp(payload.clientStartedAt) ||
      !validOptionalIsoTimestamp(payload.clientSubmittedAt) ||
      !validOptionalDimension(payload.responseViewportWidth) ||
      !validOptionalDimension(payload.responseViewportHeight) ||
      (payload.responseOrientation !== undefined &&
        (typeof payload.responseOrientation !== "string" || payload.responseOrientation.length > 40)) ||
      (payload.pageHiddenMs !== undefined && !nonNegative(payload.pageHiddenMs)) ||
      (payload.activeElapsedMs !== undefined && !nonNegative(payload.activeElapsedMs)) ||
      (isTelemetryResponse &&
        (typeof payload.clientStartedAt !== "string" ||
          typeof payload.clientSubmittedAt !== "string" ||
          !finiteNumber(payload.responseViewportWidth) ||
          !Number.isInteger(payload.responseViewportWidth) ||
          payload.responseViewportWidth <= 0 ||
          payload.responseViewportWidth > 20000 ||
          !finiteNumber(payload.responseViewportHeight) ||
          !Number.isInteger(payload.responseViewportHeight) ||
          payload.responseViewportHeight <= 0 ||
          payload.responseViewportHeight > 20000 ||
          typeof payload.responseOrientation !== "string" ||
          payload.responseOrientation.length === 0 ||
          !nonNegative(payload.pageHiddenMs) ||
          !nonNegative(payload.activeElapsedMs) ||
          Math.abs((payload.pageHiddenMs ?? 0) + (payload.activeElapsedMs ?? 0) - (payload.elapsedMs ?? 0)) > 1500))
    ) {
      return Response.json({ error: "Incomplete or invalid modular response" }, { status: 400 });
    }

    const boundaries = payload.boundaries ?? [];
    const previousBoundaries = payload.previousBoundaries ?? [];
    const boundaryIntervals = payload.boundaryIntervals ?? [];
    if (!validBoundaries(boundaries) || !validBoundaries(previousBoundaries)) {
      return Response.json({ error: "Invalid boundary list" }, { status: 400 });
    }
    if (!validIntervals(boundaryIntervals, boundaries)) {
      return Response.json({ error: "Invalid uncertainty interval list" }, { status: 400 });
    }

    const requiredCount = payload.taskType === "T1" ? null : 2;
    if (
      (requiredCount !== null && boundaries.length !== requiredCount) ||
      (payload.taskType === "T1" && (boundaries.length < 0 || boundaries.length > 5)) ||
      (payload.taskType === "T1" && boundaries.length === 0 && payload.singleStageConfirmed !== true) ||
      (payload.taskType !== "T1" && payload.singleStageConfirmed === true) ||
      (payload.moduleKey !== "disclosure" && previousBoundaries.length !== 0) ||
      (payload.moduleKey === "disclosure" && payload.disclosureIndex === 0 && previousBoundaries.length !== 0) ||
      (payload.moduleKey === "disclosure" && payload.disclosureIndex > 0 && previousBoundaries.length > 5)
    ) {
      return Response.json({ error: "Boundary count does not match the task condition" }, { status: 400 });
    }

    const influenceRequired = payload.moduleKey === "disclosure" && payload.disclosureIndex > 0;
    const cueTags = Array.isArray(payload.cueTags) ? payload.cueTags : [];
    const cueSchema = payload.cueSchemaVersion ?? "";
    const cueCollectionDisabled = (responseVersion === "v4.2" || responseVersion === "v4.3" || responseVersion === "m1-isomorphic-v1") && cueSchema === "none";
    const activeV2Cues = V4_CUES_V2_BY_DISCLOSURE[payload.disclosureKey];
    const hasV2NoEffect = cueTags.some((tag) => typeof tag === "string" && tag.endsWith("_no_effect"));
    const invalidV4Cues = isStructuredResponse && !cueCollectionDisabled && (
      !V4_CUE_SCHEMAS.has(cueSchema) ||
      (cueSchema === "visual-cpd-event-segmentation-v1" && cueTags.some((tag) => typeof tag !== "string" || !V4_CUES_V1.has(tag))) ||
      (cueSchema === "disclosure-specific-cues-v2" && (
        cueTags.length < 1 ||
        cueTags.some((tag) => typeof tag !== "string" || !activeV2Cues?.has(tag)) ||
        new Set(cueTags).size !== cueTags.length ||
        (hasV2NoEffect && cueTags.length !== 1)
      ))
    );
    if (
      (influenceRequired &&
        (!finiteNumber(payload.influenceRating) || payload.influenceRating < 1 || payload.influenceRating > 5)) ||
      (!influenceRequired && payload.influenceRating !== null && payload.influenceRating !== undefined) ||
      (payload.cueTags !== undefined &&
        (!Array.isArray(payload.cueTags) || payload.cueTags.length > 16 || payload.cueTags.some((tag) => typeof tag !== "string"))) ||
      invalidV4Cues ||
      (!isStructuredResponse && payload.cueSchemaVersion !== undefined && payload.cueSchemaVersion.length > 80)
    ) {
      return Response.json({ error: "Invalid rating or cue values" }, { status: 400 });
    }

    const disclosureStateJson = JSON.stringify(payload.disclosureState ?? {});
    const stimulusWindowJson = JSON.stringify(payload.stimulusWindow ?? {});
    if (disclosureStateJson.length > 5000 || stimulusWindowJson.length > 2500) {
      return Response.json({ error: "Disclosure state is too large" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const [session] = await getDb()
      .select({
        id: experimentSessions.id,
        status: experimentSessions.status,
        experimentalArm: experimentSessions.experimentalArm,
        studyConfigJson: experimentSessions.studyConfigJson,
        practiceCompletedAt: experimentSessions.practiceCompletedAt,
      })
      .from(experimentSessions)
      .where(eq(experimentSessions.id, payload.sessionId))
      .limit(1);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    let sessionProtocolArchitecture = "";
    let sessionConfig: Record<string, unknown> = {};
    try {
      sessionConfig = JSON.parse(session.studyConfigJson) as Record<string, unknown>;
      sessionProtocolArchitecture = String(sessionConfig.protocolArchitecture ?? "");
    } catch {
      sessionProtocolArchitecture = "";
    }
    // The arm name existed before the isomorphic protocol.  Gate strict behavior on
    // the frozen architecture marker so unfinished legacy sessions remain readable.
    const isStrictM1Session = isStrictM1Arm(session.experimentalArm) &&
      sessionProtocolArchitecture === M1_PROTOCOL_VERSION;
    if (isStrictM1Session) {
      const collectionGateResponse = m1SessionMutationGateResponse(session.experimentalArm, sessionConfig);
      if (collectionGateResponse) return collectionGateResponse;
    }
    if (isStrictM1Session && !session.practiceCompletedAt) {
      return Response.json({ error: "The common practice must be completed before formal responses", code: "PRACTICE_REQUIRED" }, { status: 409 });
    }

    const [expected] = await getDb()
      .select()
      .from(experimentExpectedSteps)
      .where(and(
        eq(experimentExpectedSteps.sessionId, payload.sessionId),
        eq(experimentExpectedSteps.trialId, payload.trialId),
        eq(experimentExpectedSteps.disclosureIndex, payload.disclosureIndex),
      ))
      .limit(1);
    if (isStrictM1Session && !expected) {
      return Response.json({ error: "The session does not have a valid canonical M1 step" }, { status: 409 });
    }
    if (expected && !responseMatchesExpected(payload, expected)) {
      return Response.json(
        { error: "Submitted condition does not match the assigned experiment step", code: "STEP_CONDITION_MISMATCH" },
        { status: 409 },
      );
    }
    if (isStrictM1Session && responseVersion !== M1_PROTOCOL_VERSION) {
      return Response.json({ error: "M1 response protocol version mismatch" }, { status: 409 });
    }
    if (isStrictM1Session && (cueSchema !== "none" || cueTags.length || (payload.rationale ?? "").trim())) {
      return Response.json({ error: "Matched M1 does not collect cue tags or rationale" }, { status: 400 });
    }

    const [existing] = await getDb()
      .select()
      .from(modularResponses)
      .where(and(
        eq(modularResponses.sessionId, payload.sessionId),
        eq(modularResponses.trialId, payload.trialId),
        eq(modularResponses.disclosureIndex, payload.disclosureIndex),
      ))
      .limit(1);
    if (existing) {
      if (sameScientificAnswer(existing, {
        boundaries,
        previousBoundaries,
        boundaryIntervals,
        singleStageConfirmed: payload.singleStageConfirmed === true,
        influenceRating: payload.influenceRating ?? null,
        noChangeConfirmed: payload.noChangeConfirmed === true,
        cueTags: cueTags.map(String),
        rationale: (payload.rationale ?? "").trim().slice(0, 1000),
      })) {
        if (isStrictM1Session && session.experimentalArm === "agent-m1-main" && expected) {
          const linked = await linkSubmittedAgentAttempt(existing, expected.stepOrder);
          if (!linked) {
            return Response.json(
              { error: "A submitted Agent attempt is required for this response", code: "AGENT_ATTEMPT_REQUIRED" },
              { status: 409 },
            );
          }
        }
        return Response.json(
          { response: { id: existing.id, createdAt: existing.createdAt }, idempotent: true },
          { status: 200 },
        );
      }
      return Response.json(
        { error: "This experiment step was already finalized with a different answer", code: "STEP_ALREADY_FINALIZED" },
        { status: 409 },
      );
    }
    if (session.status !== "active") {
      return Response.json({ error: "Session is not active" }, { status: 409 });
    }

    let canonicalPreviousBoundaries = previousBoundaries;
    if (expected) {
      const [submittedTotal] = await getDb()
        .select({ value: count() })
        .from(modularResponses)
        .where(eq(modularResponses.sessionId, payload.sessionId));
      if ((submittedTotal?.value ?? 0) !== expected.stepOrder) {
        return Response.json(
          { error: "Responses must be submitted in the assigned order", code: "OUT_OF_ORDER_STEP", expectedStepOrder: submittedTotal?.value ?? 0 },
          { status: 409 },
        );
      }
      if (isStrictM1Session && session.experimentalArm === "agent-m1-main") {
        const attemptLedger = await getDb()
          .select()
          .from(agentRunAttempts)
          .where(and(
            eq(agentRunAttempts.sessionId, payload.sessionId),
            eq(agentRunAttempts.stepOrder, expected.stepOrder),
          ))
          .orderBy(asc(agentRunAttempts.attemptNumber));
        if (!m1AttemptLedgerIsSubmitted(attemptLedger as M1AttemptLedgerRow[])) {
          return Response.json(
            {
              error: "A protocol-compliant Agent controller attempt is required before this response",
              code: "AGENT_ATTEMPT_REQUIRED",
              stepOrder: expected.stepOrder,
            },
            { status: 409 },
          );
        }
      }
      if (isStrictM1Session) {
        const [serverClock] = await getDb()
          .select({
            runElapsedSeconds: sql<number>`unixepoch('now') - unixepoch(${experimentSessions.startedAt})`,
            pageElapsedMs: sql<number>`CAST((julianday('now') - julianday(${experimentStepExposures.startedAt})) * 86400000 AS INTEGER)`,
          })
          .from(experimentSessions)
          .leftJoin(experimentStepExposures, and(
            eq(experimentStepExposures.sessionId, experimentSessions.id),
            eq(experimentStepExposures.stepOrder, expected.stepOrder),
          ))
          .where(eq(experimentSessions.id, payload.sessionId))
          .limit(1);
        if (serverClock?.pageElapsedMs === null || serverClock?.pageElapsedMs === undefined) {
          return Response.json(
            { error: "The current formal page does not have a server-issued clock", code: "PAGE_EXPOSURE_REQUIRED" },
            { status: 409 },
          );
        }
        if ((serverClock.runElapsedSeconds ?? M1_FULL_RUN_LIMIT_SECONDS + 1) > M1_FULL_RUN_LIMIT_SECONDS) {
          await getDb()
            .update(experimentSessions)
            .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "RUN_TIME_LIMIT_EXCEEDED" })
            .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
          return Response.json(
            { error: "The frozen 120-minute session limit was exceeded", code: "RUN_TIME_LIMIT_EXCEEDED" },
            { status: 409 },
          );
        }
        if (serverClock.pageElapsedMs < 0 || serverClock.pageElapsedMs > M1_FORMAL_PAGE_LIMIT_MS) {
          await getDb()
            .update(experimentSessions)
            .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "FORMAL_PAGE_TIME_LIMIT" })
            .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
          return Response.json(
            { error: "The formal page exceeded the frozen 180-second server limit", code: "FORMAL_PAGE_TIME_LIMIT" },
            { status: 409 },
          );
        }
        if (strictM1ResponseDurationViolation({
          elapsedMs: payload.elapsedMs ?? 0,
          activeElapsedMs: payload.activeElapsedMs ?? 0,
          clientStartedAt: payload.clientStartedAt,
          clientSubmittedAt: payload.clientSubmittedAt,
        })) {
          return Response.json(
            { error: "Client timing telemetry is missing or inconsistent", code: "CLIENT_TIMING_INVALID" },
            { status: 400 },
          );
        }
      }
    }

    if (payload.moduleKey === "disclosure" && payload.disclosureIndex > 0 && expected) {
      const [prior] = await getDb()
        .select({
          boundariesJson: modularResponses.boundariesJson,
          boundaryIntervalsJson: modularResponses.boundaryIntervalsJson,
        })
        .from(modularResponses)
        .where(and(
          eq(modularResponses.sessionId, payload.sessionId),
          eq(modularResponses.trialId, payload.trialId),
          eq(modularResponses.disclosureIndex, payload.disclosureIndex - 1),
        ))
        .limit(1);
      if (!prior) {
        return Response.json({ error: "The prior disclosure response is required", code: "PRIOR_DISCLOSURE_REQUIRED" }, { status: 409 });
      }
      let parsedPriorBoundaries: Boundary[] = [];
      let parsedPriorIntervals: BoundaryInterval[] = [];
      try {
        parsedPriorBoundaries = JSON.parse(prior.boundariesJson) as Boundary[];
        parsedPriorIntervals = JSON.parse(prior.boundaryIntervalsJson) as BoundaryInterval[];
      } catch {
        return Response.json({ error: "Stored prior response is invalid" }, { status: 500 });
      }
      if (!sameJson(prior.boundariesJson, previousBoundaries)) {
        return Response.json(
          { error: "Previous boundaries do not match the stored prior response", code: "STALE_PREVIOUS_BOUNDARIES", canonicalPreviousBoundaries: parsedPriorBoundaries },
          { status: 409 },
        );
      }
      canonicalPreviousBoundaries = parsedPriorBoundaries;
      const unchanged = sameBoundaryPositions(boundaries, parsedPriorBoundaries) &&
        sameNumberList(
          intervalHalfWidths(boundaryIntervals),
          intervalHalfWidths(parsedPriorIntervals),
        );
      if (unchanged !== (payload.noChangeConfirmed === true)) {
        return Response.json(
          { error: unchanged ? "An unchanged answer must be explicitly confirmed" : "The unchanged flag cannot be used after modifying a boundary or range", code: "NO_CHANGE_CONFIRMATION_MISMATCH" },
          { status: 400 },
        );
      }
    } else if (payload.noChangeConfirmed === true) {
      return Response.json({ error: "The baseline step cannot be marked unchanged" }, { status: 400 });
    }

    const responseValues: typeof modularResponses.$inferInsert = {
        sessionId: payload.sessionId.slice(0, 80),
        trialId: payload.trialId.slice(0, 180),
        trialOrder: payload.trialOrder,
        responseVersion,
        moduleKey: payload.moduleKey,
        taskType: payload.taskType,
        stimulusType: payload.stimulusType,
        assetId: payload.assetId.slice(0, 60),
        metricType: payload.metricType,
        resolution: payload.resolution,
        scaleMode: payload.scaleMode,
        windowMode: payload.windowMode,
        disclosureIndex: payload.disclosureIndex,
        disclosureKey: payload.disclosureKey,
        disclosureStateJson,
        stimulusWindowJson,
        cueSchemaVersion: (payload.cueSchemaVersion ?? "legacy-cues-v1").slice(0, 80),
        boundaryCount: boundaries.length,
        boundariesJson: JSON.stringify(boundaries),
        previousBoundariesJson: JSON.stringify(canonicalPreviousBoundaries),
        boundaryIntervalsJson: JSON.stringify(boundaryIntervals),
        singleStageConfirmed: payload.singleStageConfirmed === true,
        confidence: isStructuredResponse ? 0 : Math.trunc(payload.confidence ?? 0),
        confidenceTouched: isStructuredResponse ? false : payload.confidenceTouched === true,
        influenceRating:
          payload.influenceRating === null || payload.influenceRating === undefined
            ? null
            : Math.trunc(payload.influenceRating),
        influenceTouched: payload.influenceTouched === true,
        noChangeConfirmed: payload.noChangeConfirmed === true,
        cueTags: JSON.stringify(
          cueTags.map((tag) => String(tag).slice(0, 50)),
        ),
        rationale: (payload.rationale ?? "").trim().slice(0, 1000),
        elapsedMs: Math.trunc(payload.elapsedMs ?? 0),
        revealReadMs: Math.trunc(payload.revealReadMs ?? 0),
        firstMoveMs:
          payload.firstMoveMs === null || payload.firstMoveMs === undefined
            ? null
            : Math.trunc(payload.firstMoveMs),
        firstUncertaintyMs:
          payload.firstUncertaintyMs === null || payload.firstUncertaintyMs === undefined
            ? null
            : Math.trunc(payload.firstUncertaintyMs),
        adjustmentCount: Math.trunc(payload.adjustmentCount ?? 0),
        uncertaintyAdjustmentCount: Math.trunc(payload.uncertaintyAdjustmentCount ?? 0),
        clientStartedAt: payload.clientStartedAt ?? null,
        clientSubmittedAt: payload.clientSubmittedAt ?? null,
        responseViewportWidth:
          payload.responseViewportWidth === null || payload.responseViewportWidth === undefined
            ? null
            : Math.trunc(payload.responseViewportWidth),
        responseViewportHeight:
          payload.responseViewportHeight === null || payload.responseViewportHeight === undefined
            ? null
            : Math.trunc(payload.responseViewportHeight),
        responseOrientation: (payload.responseOrientation ?? "unknown").slice(0, 40) || "unknown",
        pageHiddenMs: Math.trunc(payload.pageHiddenMs ?? 0),
        activeElapsedMs: Math.trunc(payload.activeElapsedMs ?? payload.elapsedMs ?? 0),
      };
    let response: { id: number; createdAt: string };
    try {
      const [inserted] = await getDb()
        .insert(modularResponses)
        .values(responseValues)
        .returning({ id: modularResponses.id, createdAt: modularResponses.createdAt });
      response = inserted;
    } catch (insertError) {
      if (!isUniqueConstraint(insertError)) throw insertError;
      const [winner] = await getDb()
        .select()
        .from(modularResponses)
        .where(and(
          eq(modularResponses.sessionId, payload.sessionId),
          eq(modularResponses.trialId, payload.trialId),
          eq(modularResponses.disclosureIndex, payload.disclosureIndex),
        ))
        .limit(1);
      if (!winner) throw insertError;
      if (sameScientificAnswer(winner, {
        boundaries,
        previousBoundaries: canonicalPreviousBoundaries,
        boundaryIntervals,
        singleStageConfirmed: payload.singleStageConfirmed === true,
        influenceRating: payload.influenceRating ?? null,
        noChangeConfirmed: payload.noChangeConfirmed === true,
        cueTags: cueTags.map(String),
        rationale: (payload.rationale ?? "").trim().slice(0, 1000),
      })) {
        if (isStrictM1Session && session.experimentalArm === "agent-m1-main" && expected) {
          const linked = await linkSubmittedAgentAttempt(winner, expected.stepOrder);
          if (!linked) {
            return Response.json(
              { error: "A submitted Agent attempt is required for this response", code: "AGENT_ATTEMPT_REQUIRED" },
              { status: 409 },
            );
          }
        }
        return Response.json(
          { response: { id: winner.id, createdAt: winner.createdAt }, idempotent: true },
          { status: 200 },
        );
      }
      return Response.json(
        { error: "This experiment step was already finalized with a different answer", code: "STEP_ALREADY_FINALIZED" },
        { status: 409 },
      );
    }

    if (isStrictM1Session && session.experimentalArm === "agent-m1-main" && expected) {
      const [savedResponse] = await getDb()
        .select()
        .from(modularResponses)
        .where(eq(modularResponses.id, response.id))
        .limit(1);
      if (!savedResponse || !(await linkSubmittedAgentAttempt(savedResponse, expected.stepOrder))) {
        throw new Error("Saved Agent response is missing its submitted controller attempt");
      }
    }

    return Response.json({ response }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
