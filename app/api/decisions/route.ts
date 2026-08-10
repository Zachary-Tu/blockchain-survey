import { ensureExperimentSchema, getDb } from "@/db";
import { stageDecisions } from "@/db/schema";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function message(error: unknown) {
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
    return "This disclosure round has already been submitted.";
  }
  return parts[0] ?? "Unexpected database error";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      sessionId?: string;
      curveId?: string;
      disclosureLevel?: number;
      disclosureKey?: string;
      boundary1Index?: number;
      boundary2Index?: number;
      boundary1Ratio?: number;
      boundary2Ratio?: number;
      boundary1Date?: string;
      boundary2Date?: string;
      confidence?: number;
      influenceRating?: number;
      cueTags?: unknown;
      rationale?: string;
      elapsedMs?: number;
      revealReadMs?: number;
      firstMoveMs?: number | null;
      adjustmentCount?: number;
    };

    const requiredText = [
      payload.sessionId,
      payload.curveId,
      payload.disclosureKey,
      payload.boundary1Date,
      payload.boundary2Date,
    ];
    const requiredNumbers = [
      payload.disclosureLevel,
      payload.boundary1Index,
      payload.boundary2Index,
      payload.boundary1Ratio,
      payload.boundary2Ratio,
      payload.confidence,
      payload.elapsedMs,
    ];
    if (requiredText.some((value) => !value) || !requiredNumbers.every(finiteNumber)) {
      return Response.json({ error: "Incomplete decision payload" }, { status: 400 });
    }
    if (
      payload.boundary1Index! >= payload.boundary2Index! ||
      payload.boundary1Ratio! < 0 ||
      payload.boundary2Ratio! > 1 ||
      payload.confidence! < 1 ||
      payload.confidence! > 5 ||
      payload.disclosureLevel! < 0 ||
      payload.disclosureLevel! > 6 ||
      (payload.influenceRating !== undefined &&
        (!finiteNumber(payload.influenceRating) ||
          payload.influenceRating < 0 ||
          payload.influenceRating > 4)) ||
      (payload.revealReadMs !== undefined &&
        (!finiteNumber(payload.revealReadMs) || payload.revealReadMs < 0)) ||
      (payload.firstMoveMs !== undefined &&
        payload.firstMoveMs !== null &&
        (!finiteNumber(payload.firstMoveMs) || payload.firstMoveMs < 0)) ||
      (payload.adjustmentCount !== undefined &&
        (!finiteNumber(payload.adjustmentCount) || payload.adjustmentCount < 0)) ||
      (payload.cueTags !== undefined &&
        (!Array.isArray(payload.cueTags) ||
          payload.cueTags.some((tag) => typeof tag !== "string")))
    ) {
      return Response.json({ error: "Invalid boundary or confidence values" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const [decision] = await getDb()
      .insert(stageDecisions)
      .values({
        sessionId: payload.sessionId!,
        curveId: payload.curveId!.slice(0, 100),
        disclosureLevel: Math.trunc(payload.disclosureLevel!),
        disclosureKey: payload.disclosureKey!.slice(0, 60),
        boundary1Index: Math.trunc(payload.boundary1Index!),
        boundary2Index: Math.trunc(payload.boundary2Index!),
        boundary1Ratio: payload.boundary1Ratio!,
        boundary2Ratio: payload.boundary2Ratio!,
        boundary1Date: payload.boundary1Date!.slice(0, 20),
        boundary2Date: payload.boundary2Date!.slice(0, 20),
        confidence: Math.trunc(payload.confidence!),
        influenceRating: Math.trunc(payload.influenceRating ?? 0),
        cueTags: JSON.stringify(
          Array.isArray(payload.cueTags)
            ? payload.cueTags.slice(0, 16).map((tag) => String(tag).slice(0, 50))
            : [],
        ),
        rationale: (payload.rationale ?? "").trim().slice(0, 800),
        elapsedMs: Math.max(0, Math.trunc(payload.elapsedMs!)),
        revealReadMs: Math.max(0, Math.trunc(payload.revealReadMs ?? 0)),
        firstMoveMs:
          payload.firstMoveMs === null || payload.firstMoveMs === undefined
            ? null
            : Math.max(0, Math.trunc(payload.firstMoveMs)),
        adjustmentCount: Math.max(0, Math.trunc(payload.adjustmentCount ?? 0)),
      })
      .returning({ id: stageDecisions.id, createdAt: stageDecisions.createdAt });
    return Response.json({ decision }, { status: 201 });
  } catch (error) {
    const errorMessage = message(error);
    return Response.json(
      { error: errorMessage },
      { status: errorMessage.includes("already") ? 409 : 500 },
    );
  }
}
