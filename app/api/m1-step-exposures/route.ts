import { and, count, eq, sql } from "drizzle-orm";
import { ensureExperimentSchema, getD1, getDb } from "@/db";
import {
  experimentExpectedSteps,
  experimentSessions,
  modularResponses,
} from "@/db/schema";
import {
  M1_FORMAL_PAGE_LIMIT_MS,
  M1_FULL_RUN_LIMIT_SECONDS,
} from "@/lib/m1-execution-limits";
import { m1SessionMutationGateResponse } from "@/lib/m1-collection-gates";
import { isStrictM1Arm, M1_PROTOCOL_VERSION } from "@/lib/m1-protocol";

function parseStudyConfig(studyConfigJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(studyConfigJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function abortActiveSession(sessionId: string, terminationCode: string) {
  await getDb()
    .update(experimentSessions)
    .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode })
    .where(and(eq(experimentSessions.id, sessionId), eq(experimentSessions.status, "active")));
}

async function readExposure(sessionId: string, stepOrder: number) {
  return getD1()
    .prepare(`SELECT
        id,
        session_id,
        step_order,
        started_at,
        MAX(0, CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)) AS elapsed_ms,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS server_now
      FROM experiment_step_exposures
      WHERE session_id = ? AND step_order = ?`)
    .bind(sessionId, stepOrder)
    .first<{
      id: string;
      session_id: string;
      step_order: number;
      started_at: string;
      elapsed_ms: number;
      server_now: string;
    }>();
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
    const stepOrder = typeof payload.stepOrder === "number" && Number.isInteger(payload.stepOrder)
      ? payload.stepOrder
      : -1;
    if (!sessionId || sessionId.length > 80 || stepOrder < 0 || stepOrder > 41) {
      return Response.json({ error: "Invalid M1 page exposure" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const [session] = await getDb()
      .select({
        status: experimentSessions.status,
        experimentalArm: experimentSessions.experimentalArm,
        studyConfigJson: experimentSessions.studyConfigJson,
        practiceCompletedAt: experimentSessions.practiceCompletedAt,
        elapsedSeconds: sql<number>`unixepoch('now') - unixepoch(${experimentSessions.startedAt})`,
      })
      .from(experimentSessions)
      .where(eq(experimentSessions.id, sessionId))
      .limit(1);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    const sessionConfig = parseStudyConfig(session.studyConfigJson);
    if (
      !isStrictM1Arm(session.experimentalArm) ||
      String(sessionConfig.protocolArchitecture ?? "") !== M1_PROTOCOL_VERSION
    ) {
      return Response.json({ error: "Page exposures are only available for frozen M1 sessions" }, { status: 403 });
    }
    const collectionGateResponse = m1SessionMutationGateResponse(session.experimentalArm, sessionConfig);
    if (collectionGateResponse) return collectionGateResponse;
    if (session.status !== "active") {
      return Response.json({ error: "Session is not active", code: "SESSION_NOT_ACTIVE" }, { status: 409 });
    }
    if ((session.elapsedSeconds ?? M1_FULL_RUN_LIMIT_SECONDS + 1) > M1_FULL_RUN_LIMIT_SECONDS) {
      await abortActiveSession(sessionId, "RUN_TIME_LIMIT_EXCEEDED");
      return Response.json(
        { error: "The frozen 120-minute session limit was exceeded", code: "RUN_TIME_LIMIT_EXCEEDED" },
        { status: 409 },
      );
    }
    if (!session.practiceCompletedAt) {
      return Response.json(
        { error: "The common practice must be completed before a formal page starts", code: "PRACTICE_REQUIRED" },
        { status: 409 },
      );
    }

    const [[expected], [saved]] = await Promise.all([
      getDb()
        .select({ stepOrder: experimentExpectedSteps.stepOrder })
        .from(experimentExpectedSteps)
        .where(and(
          eq(experimentExpectedSteps.sessionId, sessionId),
          eq(experimentExpectedSteps.stepOrder, stepOrder),
        ))
        .limit(1),
      getDb()
        .select({ value: count() })
        .from(modularResponses)
        .where(eq(modularResponses.sessionId, sessionId)),
    ]);
    if (!expected || (saved?.value ?? 0) !== stepOrder) {
      return Response.json(
        {
          error: "Only the current canonical M1 page can start its server clock",
          code: "EXPOSURE_OUT_OF_ORDER",
          nextStepOrder: saved?.value ?? 0,
        },
        { status: 409 },
      );
    }

    let exposure = await readExposure(sessionId, stepOrder);
    let created = false;
    if (!exposure) {
      const id = crypto.randomUUID();
      try {
        const result = await getD1()
          .prepare(`INSERT INTO experiment_step_exposures (id, session_id, step_order)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id, step_order) DO NOTHING`)
          .bind(id, sessionId, stepOrder)
          .run();
        created = result.meta.changes === 1;
      } catch {
        // A concurrent page mount may have won the unique key. The canonical
        // exposure below remains the only server clock for this step.
      }
      exposure = await readExposure(sessionId, stepOrder);
    }
    if (!exposure) throw new Error("M1 page clock could not be materialized");
    const elapsedMs = Number(exposure.elapsed_ms);
    if (!Number.isFinite(elapsedMs) || elapsedMs > M1_FORMAL_PAGE_LIMIT_MS) {
      await abortActiveSession(sessionId, "FORMAL_PAGE_TIME_LIMIT");
      return Response.json(
        { error: "The formal page exceeded the frozen 180-second server limit", code: "FORMAL_PAGE_TIME_LIMIT" },
        { status: 409 },
      );
    }

    return Response.json(
      {
        exposureId: exposure.id,
        sessionId,
        stepOrder,
        startedAt: exposure.started_at,
        serverNow: exposure.server_now,
        remainingMs: Math.max(0, M1_FORMAL_PAGE_LIMIT_MS - elapsedMs),
        idempotent: !created,
      },
      { status: created ? 201 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "M1 page exposure failed" },
      { status: 500 },
    );
  }
}
