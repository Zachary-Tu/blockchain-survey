import { ensureExperimentSchema, getDb } from "@/db";
import { researchResponses } from "@/db/schema";

const METRICS = new Set(["price", "activeAddresses", "googleTrends"]);
const TASKS: Map<string, { family: "placement" | "evaluation"; count: number }> = new Map([
  ["placement-1", { family: "placement", count: 1 }],
  ["placement-2", { family: "placement", count: 2 }],
  ["placement-3", { family: "placement", count: 3 }],
  ["evaluation-1", { family: "evaluation", count: 1 }],
  ["evaluation-2", { family: "evaluation", count: 2 }],
  ["evaluation-3", { family: "evaluation", count: 3 }],
]);
const RESOLUTIONS = new Set(["daily", "weekly", "monthly", "yearly"]);
const SCALES = new Set(["linear", "log"]);
const UNCERTAINTY_HALF_WIDTH_MIN = 0.005;
const UNCERTAINTY_HALF_WIDTH_MAX = 0.2;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function errorMessage(error: unknown) {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) parts.push(current.message);
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  const combined = parts.join("\n");
  if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(combined)) {
    return "This disclosure response has already been submitted.";
  }
  return parts[0] ?? "Unexpected database error";
}

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

function validBoundaries(value: unknown): value is Boundary[] {
  if (!Array.isArray(value)) return false;
  let previousRatio = -1;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const boundary = item as Boundary;
    if (
      !finiteNumber(boundary.index) ||
      !finiteNumber(boundary.ratio) ||
      typeof boundary.date !== "string" ||
      boundary.ratio <= previousRatio ||
      boundary.ratio <= 0 ||
      boundary.ratio >= 1
    ) {
      return false;
    }
    previousRatio = boundary.ratio;
    return true;
  });
}

function validBoundaryIntervals(
  value: unknown,
  boundaries: Boundary[],
): value is BoundaryInterval[] {
  if (!Array.isArray(value) || value.length !== boundaries.length) return false;
  return value.every((item, index) => {
    if (!item || typeof item !== "object") return false;
    const interval = item as BoundaryInterval;
    const center = boundaries[index]?.ratio;
    if (
      !finiteNumber(interval.boundaryIndex) ||
      interval.boundaryIndex !== index ||
      !finiteNumber(interval.centerRatio) ||
      !finiteNumber(interval.halfWidthRatio) ||
      !finiteNumber(interval.widthRatio) ||
      !finiteNumber(interval.lowerRatio) ||
      !finiteNumber(interval.upperRatio) ||
      !finiteNumber(interval.lowerIndex) ||
      !finiteNumber(interval.upperIndex) ||
      typeof interval.lowerDate !== "string" ||
      typeof interval.upperDate !== "string" ||
      !finiteNumber(center) ||
      Math.abs(interval.centerRatio - center) > 0.002 ||
      interval.halfWidthRatio < UNCERTAINTY_HALF_WIDTH_MIN ||
      interval.halfWidthRatio > UNCERTAINTY_HALF_WIDTH_MAX ||
      interval.lowerRatio < 0 ||
      interval.upperRatio > 1 ||
      interval.lowerRatio > interval.centerRatio ||
      interval.upperRatio < interval.centerRatio ||
      interval.widthRatio <= 0 ||
      Math.abs(interval.widthRatio - (interval.upperRatio - interval.lowerRatio)) > 0.002
    ) {
      return false;
    }
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      sessionId?: string;
      stimulusId?: string;
      assetId?: string;
      assetOrder?: number;
      metricType?: string;
      taskMode?: string;
      taskFamily?: string;
      resolution?: string;
      scaleMode?: string;
      disclosureLevel?: number;
      disclosureKey?: string;
      boundaries?: unknown;
      previousBoundaries?: unknown;
      referenceBoundaries?: unknown;
      boundaryIntervals?: unknown;
      reasonablenessRating?: number | null;
      confidence?: number;
      influenceRating?: number | null;
      confidenceTouched?: boolean;
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
      scaleSwitchCount?: number;
    };

    if (
      !payload.sessionId ||
      !payload.stimulusId ||
      !payload.assetId ||
      !payload.disclosureKey ||
      !payload.metricType ||
      !payload.taskMode ||
      !payload.resolution ||
      !payload.scaleMode ||
      !METRICS.has(payload.metricType) ||
      !TASKS.has(payload.taskMode) ||
      !RESOLUTIONS.has(payload.resolution) ||
      !SCALES.has(payload.scaleMode) ||
      !finiteNumber(payload.assetOrder) ||
      !finiteNumber(payload.disclosureLevel) ||
      !finiteNumber(payload.confidence) ||
      !finiteNumber(payload.elapsedMs)
    ) {
      return Response.json({ error: "Incomplete research response" }, { status: 400 });
    }

    const boundaries = payload.boundaries ?? [];
    const previousBoundaries = payload.previousBoundaries ?? [];
    const referenceBoundaries = payload.referenceBoundaries ?? [];
    const boundaryIntervals = payload.boundaryIntervals ?? [];
    if (
      !validBoundaries(boundaries) ||
      !validBoundaries(previousBoundaries) ||
      !validBoundaries(referenceBoundaries)
    ) {
      return Response.json({ error: "Invalid boundary list" }, { status: 400 });
    }
    const task = TASKS.get(payload.taskMode);
    if (!task) {
      return Response.json({ error: "Invalid task condition" }, { status: 400 });
    }
    const count = boundaries.length;
    if (
      count !== task.count ||
      referenceBoundaries.length !== task.count ||
      (payload.disclosureLevel === 0 && previousBoundaries.length !== 0) ||
      (payload.disclosureLevel > 0 && previousBoundaries.length !== task.count) ||
      (payload.taskFamily !== undefined && payload.taskFamily !== task.family) ||
      (task.family === "placement" &&
        !validBoundaryIntervals(boundaryIntervals, boundaries)) ||
      (task.family === "evaluation" &&
        (!Array.isArray(boundaryIntervals) || boundaryIntervals.length !== 0)) ||
      (task.family === "evaluation" &&
        (!finiteNumber(payload.reasonablenessRating) ||
          payload.reasonablenessRating < 1 ||
          payload.reasonablenessRating > 5)) ||
      payload.confidence < 1 ||
      payload.confidence > 5 ||
      payload.disclosureLevel < 0 ||
      payload.disclosureLevel > 3 ||
      (payload.influenceRating !== undefined &&
        payload.influenceRating !== null &&
        (!finiteNumber(payload.influenceRating) ||
          payload.influenceRating < 1 ||
          payload.influenceRating > 5)) ||
      (payload.cueTags !== undefined &&
        (!Array.isArray(payload.cueTags) ||
          payload.cueTags.some((tag) => typeof tag !== "string")))
    ) {
      return Response.json({ error: "Invalid research response values" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const [response] = await getDb()
      .insert(researchResponses)
      .values({
        sessionId: payload.sessionId,
        stimulusId: payload.stimulusId.slice(0, 140),
        assetId: payload.assetId.slice(0, 40),
        assetOrder: Math.trunc(payload.assetOrder),
        metricType: payload.metricType,
        taskMode: payload.taskMode,
        taskFamily: task.family,
        resolution: payload.resolution,
        scaleMode: payload.scaleMode,
        disclosureLevel: Math.trunc(payload.disclosureLevel),
        disclosureKey: payload.disclosureKey.slice(0, 60),
        boundaryCount: count,
        boundariesJson: JSON.stringify(boundaries),
        previousBoundariesJson: JSON.stringify(previousBoundaries),
        referenceBoundariesJson: JSON.stringify(referenceBoundaries),
        boundaryIntervalsJson: JSON.stringify(boundaryIntervals),
        reasonablenessRating:
          payload.reasonablenessRating === null ||
          payload.reasonablenessRating === undefined
            ? null
            : Math.trunc(payload.reasonablenessRating),
        confidence: Math.trunc(payload.confidence),
        influenceRating:
          payload.influenceRating === null ||
          payload.influenceRating === undefined
            ? null
            : Math.trunc(payload.influenceRating),
        confidenceTouched: payload.confidenceTouched === true,
        influenceTouched: payload.influenceTouched === true,
        noChangeConfirmed: payload.noChangeConfirmed === true,
        cueTags: JSON.stringify(
          Array.isArray(payload.cueTags)
            ? payload.cueTags.slice(0, 16).map((tag) => String(tag).slice(0, 50))
            : [],
        ),
        rationale: (payload.rationale ?? "").trim().slice(0, 1000),
        elapsedMs: Math.max(0, Math.trunc(payload.elapsedMs)),
        revealReadMs: Math.max(0, Math.trunc(payload.revealReadMs ?? 0)),
        firstMoveMs:
          payload.firstMoveMs === null || payload.firstMoveMs === undefined
            ? null
            : Math.max(0, Math.trunc(payload.firstMoveMs)),
        firstUncertaintyMs:
          payload.firstUncertaintyMs === null ||
          payload.firstUncertaintyMs === undefined
            ? null
            : Math.max(0, Math.trunc(payload.firstUncertaintyMs)),
        adjustmentCount: Math.max(0, Math.trunc(payload.adjustmentCount ?? 0)),
        uncertaintyAdjustmentCount: Math.max(
          0,
          Math.trunc(payload.uncertaintyAdjustmentCount ?? 0),
        ),
        scaleSwitchCount: Math.max(0, Math.trunc(payload.scaleSwitchCount ?? 0)),
      })
      .returning({ id: researchResponses.id, createdAt: researchResponses.createdAt });
    return Response.json({ response }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    return Response.json(
      { error: message },
      { status: message.includes("already") ? 409 : 500 },
    );
  }
}
