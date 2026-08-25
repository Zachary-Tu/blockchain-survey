import { count, eq } from "drizzle-orm";
import { ensureExperimentSchema, getDb } from "@/db";
import { experimentSessions, modularResponses } from "@/db/schema";

const EXPERTISE = new Set(["none", "casual", "active", "professional"]);
const ACTOR_TYPES = new Set(["human", "agent"]);
const DEVICE_TYPES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const POINTER_TYPES = new Set(["coarse", "fine", "none", "unknown"]);

type DeviceInfoPayload = {
  deviceType?: string;
  userAgent?: string;
  platform?: string;
  browserLanguage?: string;
  timezone?: string;
  screenWidth?: number | null;
  screenHeight?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  devicePixelRatio?: number | null;
  touchPoints?: number;
  pointerType?: string;
  orientation?: string;
};

function optionalDimension(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 20000
    ? value
    : null;
}

function optionalRatio(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 20
    ? value
    : null;
}

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
      deviceInfo?: DeviceInfoPayload;
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
    const deviceInfo = payload.deviceInfo ?? {};
    const deviceType = DEVICE_TYPES.has(deviceInfo.deviceType ?? "")
      ? deviceInfo.deviceType!
      : "unknown";
    const pointerType = POINTER_TYPES.has(deviceInfo.pointerType ?? "")
      ? deviceInfo.pointerType!
      : "unknown";
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
        deviceType,
        userAgent: (deviceInfo.userAgent ?? "").trim().slice(0, 600),
        clientPlatform: (deviceInfo.platform ?? "").trim().slice(0, 120),
        browserLanguage: (deviceInfo.browserLanguage ?? "").trim().slice(0, 40),
        clientTimezone: (deviceInfo.timezone ?? "").trim().slice(0, 80),
        screenWidth: optionalDimension(deviceInfo.screenWidth),
        screenHeight: optionalDimension(deviceInfo.screenHeight),
        viewportWidth: optionalDimension(deviceInfo.viewportWidth),
        viewportHeight: optionalDimension(deviceInfo.viewportHeight),
        devicePixelRatio: optionalRatio(deviceInfo.devicePixelRatio),
        touchPoints:
          typeof deviceInfo.touchPoints === "number" &&
          Number.isInteger(deviceInfo.touchPoints) &&
          deviceInfo.touchPoints >= 0 &&
          deviceInfo.touchPoints <= 100
            ? deviceInfo.touchPoints
            : 0,
        pointerType,
        screenOrientation: (deviceInfo.orientation ?? "unknown").trim().slice(0, 40) || "unknown",
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
    const [session] = await getDb()
      .select({
        id: experimentSessions.id,
        status: experimentSessions.status,
        studyConfigJson: experimentSessions.studyConfigJson,
      })
      .from(experimentSessions)
      .where(eq(experimentSessions.id, payload.sessionId))
      .limit(1);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    let expectedResponseCount = 0;
    try {
      const config = JSON.parse(session.studyConfigJson) as {
        randomizedPlan?: Array<{ disclosures?: unknown[] }>;
      };
      expectedResponseCount = Array.isArray(config.randomizedPlan)
        ? config.randomizedPlan.reduce(
            (sum, trial) =>
              sum + (Array.isArray(trial.disclosures) ? trial.disclosures.length : 0),
            0,
          )
        : 0;
    } catch {
      expectedResponseCount = 0;
    }

    const [responseTotal] = await getDb()
      .select({ value: count() })
      .from(modularResponses)
      .where(eq(modularResponses.sessionId, payload.sessionId));
    const responseCount = responseTotal?.value ?? 0;
    if (expectedResponseCount > 0 && responseCount !== expectedResponseCount) {
      return Response.json(
        {
          error: "Session responses are incomplete",
          responseCount,
          expectedResponseCount,
        },
        { status: 409 },
      );
    }

    if (session.status !== "complete") {
      await getDb()
      .update(experimentSessions)
      .set({ status: "complete", completedAt: new Date().toISOString() })
      .where(eq(experimentSessions.id, payload.sessionId));
    }
    return Response.json({ ok: true, responseCount, expectedResponseCount });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}
