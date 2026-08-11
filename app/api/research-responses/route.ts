import { ensureExperimentSchema, getDb } from "@/db";
import { researchResponses } from "@/db/schema";

const METRICS = new Set(["price", "activeAddresses", "googleTrends"]);
const TASKS = new Set(["fixed", "flexible", "evaluation"]);
const RESOLUTIONS = new Set(["daily", "weekly", "monthly", "yearly"]);
const SCALES = new Set(["linear", "log"]);

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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      sessionId?: string;
      stimulusId?: string;
      assetId?: string;
      assetOrder?: number;
      metricType?: string;
      taskMode?: string;
      resolution?: string;
      scaleMode?: string;
      disclosureLevel?: number;
      disclosureKey?: string;
      boundaries?: unknown;
      referenceBoundaries?: unknown;
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
      adjustmentCount?: number;
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
    const referenceBoundaries = payload.referenceBoundaries ?? [];
    if (!validBoundaries(boundaries) || !validBoundaries(referenceBoundaries)) {
      return Response.json({ error: "Invalid boundary list" }, { status: 400 });
    }
    const count = boundaries.length;
    if (
      (payload.taskMode === "fixed" && count !== 2) ||
      (payload.taskMode === "flexible" && (count < 1 || count > 5)) ||
      (payload.taskMode === "evaluation" &&
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
        resolution: payload.resolution,
        scaleMode: payload.scaleMode,
        disclosureLevel: Math.trunc(payload.disclosureLevel),
        disclosureKey: payload.disclosureKey.slice(0, 60),
        boundaryCount: count,
        boundariesJson: JSON.stringify(boundaries),
        referenceBoundariesJson: JSON.stringify(referenceBoundaries),
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
        adjustmentCount: Math.max(0, Math.trunc(payload.adjustmentCount ?? 0)),
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
