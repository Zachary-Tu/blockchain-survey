import { eq } from "drizzle-orm";
import { ensureExperimentSchema, getDb } from "@/db";
import { experimentSessions } from "@/db/schema";

const EXPERTISE = new Set(["none", "casual", "active", "professional"]);
const ACTOR_TYPES = new Set(["human", "agent"]);

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected database error";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      actorType?: string;
      participantCode?: string;
      expertise?: string;
      experimentalArm?: string;
      protocolVersion?: string;
      modelName?: string | null;
      studyConfig?: unknown;
    };
    const actorType = payload.actorType ?? "human";
    const expertise = payload.expertise ?? "none";
    const protocolVersion = payload.protocolVersion?.trim() ?? "";
    if (!ACTOR_TYPES.has(actorType) || !EXPERTISE.has(expertise) || !protocolVersion) {
      return Response.json({ error: "Invalid session configuration" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const studyConfigJson = JSON.stringify(payload.studyConfig ?? {});
    if (studyConfigJson.length > 12000) {
      return Response.json({ error: "Study configuration is too large" }, { status: 400 });
    }
    const sessionId = crypto.randomUUID();
    const [session] = await getDb()
      .insert(experimentSessions)
      .values({
        id: sessionId,
        actorType,
        participantCode: (payload.participantCode ?? "").trim().slice(0, 64),
        expertise,
        experimentalArm: (payload.experimentalArm ?? "trajectory").slice(0, 40),
        protocolVersion: protocolVersion.slice(0, 80),
        studyConfigJson,
        modelName: payload.modelName?.trim().slice(0, 120) || null,
      })
      .returning({ id: experimentSessions.id, startedAt: experimentSessions.startedAt });
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as { sessionId?: string };
    if (!payload.sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }
    await ensureExperimentSchema();
    await getDb()
      .update(experimentSessions)
      .set({ status: "complete", completedAt: new Date().toISOString() })
      .where(eq(experimentSessions.id, payload.sessionId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}
