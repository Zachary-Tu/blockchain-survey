import { ensureExperimentSchema, getDb } from "@/db";
import { modularResponses } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const MODULES = new Set(["disclosure", "framing", "cross-series", "robustness"]);
const TASKS = new Set(["T1", "T2", "T3"]);
const STIMULUS_TYPES = new Set(["crypto", "cross-domain", "null", "ground-truth"]);
const METRICS = new Set(["price", "activeAddresses", "googleTrends"]);
const RESOLUTIONS = new Set(["daily", "weekly", "monthly", "yearly"]);
const SCALES = new Set(["linear", "log"]);
const WINDOWS = new Set(["whole", "truncated"]);
const DISCLOSURES = new Set(["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4", "FULL"]);
const RESPONSE_VERSIONS = new Set(["v4", "v4.1", "v4.2", "v4.3", "v4.4-disclosure-safe", "v4.5-zero-width-enabled", "pre-v4", "agent-v1", "agent-v2"]);
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
const UNCERTAINTY_HALF_WIDTH_MIN = 0;
const LEGACY_UNCERTAINTY_HALF_WIDTH_MIN = 0.005;
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

function validIntervals(
  value: unknown,
  boundaries: Boundary[],
  minimumHalfWidth = LEGACY_UNCERTAINTY_HALF_WIDTH_MIN,
): value is BoundaryInterval[] {
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
      interval.halfWidthRatio >= minimumHalfWidth &&
      interval.halfWidthRatio <= UNCERTAINTY_HALF_WIDTH_MAX &&
      finiteNumber(interval.widthRatio) &&
      finiteNumber(interval.lowerRatio) &&
      finiteNumber(interval.upperRatio) &&
      interval.lowerRatio >= 0 &&
      interval.upperRatio <= 1 &&
      interval.lowerRatio <= interval.centerRatio &&
      interval.upperRatio >= interval.centerRatio &&
      interval.widthRatio >= 0 &&
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
    const isStructuredResponse = ["v4", "v4.1", "v4.2", "v4.3", "v4.4-disclosure-safe", "v4.5-zero-width-enabled", "agent-v1", "agent-v2"].includes(responseVersion);
    const isTelemetryResponse = responseVersion === "v4.3" || responseVersion === "v4.4-disclosure-safe" || responseVersion === "v4.5-zero-width-enabled";

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
    const minimumHalfWidth = responseVersion === "v4.5-zero-width-enabled" || responseVersion === "agent-v2"
      ? UNCERTAINTY_HALF_WIDTH_MIN
      : LEGACY_UNCERTAINTY_HALF_WIDTH_MIN;
    if (!validIntervals(boundaryIntervals, boundaries, minimumHalfWidth)) {
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
    const cueCollectionDisabled = (responseVersion === "v4.2" || responseVersion === "v4.3" || responseVersion === "v4.4-disclosure-safe" || responseVersion === "v4.5-zero-width-enabled") && cueSchema === "none";
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
    const boundariesJson = JSON.stringify(boundaries);
    const previousBoundariesJson = JSON.stringify(previousBoundaries);
    const boundaryIntervalsJson = JSON.stringify(boundaryIntervals);
    const cueTagsJson = JSON.stringify(cueTags.map((tag) => String(tag).slice(0, 50)));
    const cueSchemaVersion = (payload.cueSchemaVersion ?? "legacy-cues-v1").slice(0, 80);
    const rationale = (payload.rationale ?? "").trim().slice(0, 1000);
    const storedInfluenceRating = payload.influenceRating === null || payload.influenceRating === undefined
      ? null
      : Math.trunc(payload.influenceRating);
    if (disclosureStateJson.length > 5000 || stimulusWindowJson.length > 2500) {
      return Response.json({ error: "Disclosure state is too large" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const db = getDb();
    const [existing] = await db
      .select()
      .from(modularResponses)
      .where(and(
        eq(modularResponses.sessionId, payload.sessionId.slice(0, 80)),
        eq(modularResponses.trialId, payload.trialId.slice(0, 180)),
        eq(modularResponses.disclosureIndex, payload.disclosureIndex),
      ))
      .limit(1);

    if (existing) {
      const sameScientificResponse =
        existing.trialOrder === payload.trialOrder &&
        existing.responseVersion === responseVersion &&
        existing.moduleKey === payload.moduleKey &&
        existing.taskType === payload.taskType &&
        existing.stimulusType === payload.stimulusType &&
        existing.assetId === payload.assetId.slice(0, 60) &&
        existing.metricType === payload.metricType &&
        existing.resolution === payload.resolution &&
        existing.scaleMode === payload.scaleMode &&
        existing.windowMode === payload.windowMode &&
        existing.disclosureKey === payload.disclosureKey &&
        existing.disclosureStateJson === disclosureStateJson &&
        existing.stimulusWindowJson === stimulusWindowJson &&
        existing.cueSchemaVersion === cueSchemaVersion &&
        existing.boundariesJson === boundariesJson &&
        existing.previousBoundariesJson === previousBoundariesJson &&
        existing.boundaryIntervalsJson === boundaryIntervalsJson &&
        existing.singleStageConfirmed === (payload.singleStageConfirmed === true) &&
        existing.influenceRating === storedInfluenceRating &&
        existing.influenceTouched === (payload.influenceTouched === true) &&
        existing.noChangeConfirmed === (payload.noChangeConfirmed === true) &&
        existing.cueTags === cueTagsJson &&
        existing.rationale === rationale;

      if (!sameScientificResponse) {
        return Response.json({ error: "This answer is already finalized with different values." }, { status: 409 });
      }
      return Response.json({ response: { id: existing.id, createdAt: existing.createdAt }, idempotent: true }, { status: 200 });
    }

    const [response] = await db
      .insert(modularResponses)
      .values({
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
        cueSchemaVersion,
        boundaryCount: boundaries.length,
        boundariesJson,
        previousBoundariesJson,
        boundaryIntervalsJson,
        singleStageConfirmed: payload.singleStageConfirmed === true,
        confidence: isStructuredResponse ? 0 : Math.trunc(payload.confidence ?? 0),
        confidenceTouched: isStructuredResponse ? false : payload.confidenceTouched === true,
        influenceRating: storedInfluenceRating,
        influenceTouched: payload.influenceTouched === true,
        noChangeConfirmed: payload.noChangeConfirmed === true,
        cueTags: cueTagsJson,
        rationale,
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
      })
      .returning({ id: modularResponses.id, createdAt: modularResponses.createdAt });

    return Response.json({ response }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
