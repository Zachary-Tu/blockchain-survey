import { ensureExperimentSchema, getDb } from "@/db";
import { stageDecisions } from "@/db/schema";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function message(error: unknown) {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    return "This disclosure round has already been submitted.";
  }
  return error instanceof Error ? error.message : "Unexpected database error";
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
      rationale?: string;
      elapsedMs?: number;
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
      payload.disclosureLevel! > 5
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
        rationale: (payload.rationale ?? "").trim().slice(0, 800),
        elapsedMs: Math.max(0, Math.trunc(payload.elapsedMs!)),
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
