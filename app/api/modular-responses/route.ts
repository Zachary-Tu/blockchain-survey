import { ensureExperimentSchema, getDb } from "@/db";
import { modularResponses } from "@/db/schema";

const MODULES = new Set(["disclosure", "framing", "cross-series", "robustness"]);
const TASKS = new Set(["T1", "T2", "T3"]);
const STIMULUS_TYPES = new Set(["crypto", "cross-domain", "null", "ground-truth"]);
const METRICS = new Set(["price", "activeAddresses", "googleTrends"]);
const RESOLUTIONS = new Set(["daily", "weekly", "monthly", "yearly"]);
const SCALES = new Set(["linear", "log"]);
const WINDOWS = new Set(["whole", "truncated"]);
const DISCLOSURES = new Set(["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4", "FULL"]);
const UNCERTAINTY_HALF_WIDTHS = [0.01, 0.025, 0.05, 0.08, 0.12];

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
      UNCERTAINTY_HALF_WIDTHS.some((option) => Math.abs(option - interval.halfWidthRatio!) < 0.0001) &&
      finiteNumber(interval.widthRatio) &&
      finiteNumber(interval.lowerRatio) &&
      finiteNumber(interval.upperRatio) &&
      interval.lowerRatio >= 0 &&
      interval.upperRatio <= 1 &&
      interval.lowerRatio <= interval.centerRatio &&
      interval.upperRatio >= interval.centerRatio &&
      interval.widthRatio > 0 &&
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
    };

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
      !finiteNumber(payload.confidence) ||
      payload.confidence < 1 ||
      payload.confidence > 5 ||
      !nonNegative(payload.elapsedMs) ||
      !nonNegative(payload.revealReadMs) ||
      !validOptionalTime(payload.firstMoveMs) ||
      !validOptionalTime(payload.firstUncertaintyMs) ||
      !nonNegative(payload.adjustmentCount) ||
      !nonNegative(payload.uncertaintyAdjustmentCount)
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
    if (
      (influenceRequired &&
        (!finiteNumber(payload.influenceRating) || payload.influenceRating < 1 || payload.influenceRating > 5)) ||
      (!influenceRequired && payload.influenceRating !== null && payload.influenceRating !== undefined) ||
      (payload.cueTags !== undefined &&
        (!Array.isArray(payload.cueTags) || payload.cueTags.length > 16 || payload.cueTags.some((tag) => typeof tag !== "string")))
    ) {
      return Response.json({ error: "Invalid rating or cue values" }, { status: 400 });
    }

    const disclosureStateJson = JSON.stringify(payload.disclosureState ?? {});
    if (disclosureStateJson.length > 5000) {
      return Response.json({ error: "Disclosure state is too large" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const [response] = await getDb()
      .insert(modularResponses)
      .values({
        sessionId: payload.sessionId.slice(0, 80),
        trialId: payload.trialId.slice(0, 180),
        trialOrder: payload.trialOrder,
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
        boundaryCount: boundaries.length,
        boundariesJson: JSON.stringify(boundaries),
        previousBoundariesJson: JSON.stringify(previousBoundaries),
        boundaryIntervalsJson: JSON.stringify(boundaryIntervals),
        singleStageConfirmed: payload.singleStageConfirmed === true,
        confidence: Math.trunc(payload.confidence),
        confidenceTouched: payload.confidenceTouched === true,
        influenceRating:
          payload.influenceRating === null || payload.influenceRating === undefined
            ? null
            : Math.trunc(payload.influenceRating),
        influenceTouched: payload.influenceTouched === true,
        noChangeConfirmed: payload.noChangeConfirmed === true,
        cueTags: JSON.stringify(
          Array.isArray(payload.cueTags)
            ? payload.cueTags.map((tag) => String(tag).slice(0, 50))
            : [],
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
      })
      .returning({ id: modularResponses.id, createdAt: modularResponses.createdAt });

    return Response.json({ response }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
