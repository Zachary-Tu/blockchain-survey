import { and, asc, eq, sql } from "drizzle-orm";
import { ensureExperimentSchema, getDb } from "@/db";
import { m1SessionMutationGateResponse } from "@/lib/m1-collection-gates";
import {
  agentRunAttempts,
  experimentExpectedSteps,
  experimentSessions,
  experimentStepExposures,
  modularResponses,
} from "@/db/schema";
import {
  type M1AttemptLedgerRow,
  M1_FORMAL_PAGE_LIMIT_MS,
  M1_FULL_RUN_LIMIT_SECONDS,
  validateM1AttemptLedger,
} from "@/lib/m1-execution-limits";

const STATUSES = new Set(["submitted", "mechanical-retry", "model-error", "controller-error", "aborted"]);
const CONTEXT_POLICIES = new Set(["persistent", "page-reset"]);
const HASH = /^(?:[a-f0-9]{64})?$/i;
const COMPLETE_HASH = /^[a-f0-9]{64}$/i;

function provided(value: unknown) {
  return value !== undefined && value !== null;
}

function isUniqueConstraint(error: unknown) {
  let cursor: unknown = error;
  for (let depth = 0; depth < 6 && cursor; depth += 1) {
    if (cursor instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(cursor.message)) return true;
    cursor = typeof cursor === "object" && cursor !== null && "cause" in cursor
      ? (cursor as { cause?: unknown }).cause
      : null;
  }
  return false;
}

function optionalNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function optionalInteger(value: unknown, minimum = 0, maximum = 100_000_000) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function optionalTimestamp(value: unknown) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

async function abortActiveAgentSession(sessionId: string, terminationCode: string) {
  await getDb()
    .update(experimentSessions)
    .set({
      status: "aborted",
      completedAt: new Date().toISOString(),
      terminationCode,
    })
    .where(and(eq(experimentSessions.id, sessionId), eq(experimentSessions.status, "active")));
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
    const stepOrder = optionalInteger(payload.stepOrder, 0, 41);
    const attemptNumber = optionalInteger(payload.attemptNumber, 1, 100);
    if (provided(payload.status) && (typeof payload.status !== "string" || !STATUSES.has(payload.status))) {
      return Response.json({ error: "Invalid Agent attempt status" }, { status: 400 });
    }
    if (provided(payload.contextPolicy) && (typeof payload.contextPolicy !== "string" || !CONTEXT_POLICIES.has(payload.contextPolicy))) {
      return Response.json({ error: "Invalid Agent context policy" }, { status: 400 });
    }
    const status = typeof payload.status === "string" ? payload.status : "submitted";
    const modelApiAttemptNumber = optionalInteger(payload.modelApiAttemptNumber, 0, 3);
    const mechanicalActionId = String(payload.mechanicalActionId ?? "").trim().slice(0, 120);
    const mechanicalRetryNumber = optionalInteger(payload.mechanicalRetryNumber, 0, 2);
    const contextPolicy = typeof payload.contextPolicy === "string" ? payload.contextPolicy : "persistent";
    const promptSha256 = typeof payload.promptSha256 === "string" ? payload.promptSha256 : "";
    const screenshotSha256 = typeof payload.screenshotSha256 === "string" ? payload.screenshotSha256 : "";
    const outputSha256 = typeof payload.outputSha256 === "string" ? payload.outputSha256 : "";
    const actionTraceSha256 = typeof payload.actionTraceSha256 === "string" ? payload.actionTraceSha256 : "";
    if (
      !sessionId || stepOrder === null || attemptNumber === null ||
      modelApiAttemptNumber === null || mechanicalRetryNumber === null ||
      !HASH.test(promptSha256) || !HASH.test(screenshotSha256) || !HASH.test(outputSha256) || !HASH.test(actionTraceSha256)
    ) {
      return Response.json({ error: "Invalid Agent attempt metadata" }, { status: 400 });
    }
    const controllerVersion = String(payload.controllerVersion ?? "").slice(0, 120);
    const modelRequestId = String(payload.modelRequestId ?? "").slice(0, 180);
    const sourceModelRequestId = String(payload.sourceModelRequestId ?? "").slice(0, 180);
    const normalizedPromptHash = promptSha256.toLowerCase();
    const runtimeRequestSha256 = typeof payload.runtimeRequestSha256 === "string" ? payload.runtimeRequestSha256 : "";
    const normalizedRuntimeRequestHash = runtimeRequestSha256.toLowerCase();
    const normalizedScreenshotHash = screenshotSha256.toLowerCase();
    const normalizedOutputHash = outputSha256.toLowerCase();
    const normalizedActionTraceHash = actionTraceSha256.toLowerCase();
    const inputModality = String(payload.inputModality ?? "screenshot").slice(0, 40);
    const imageDetail = String(payload.imageDetail ?? "auto").slice(0, 40);
    const temperature = optionalNumber(payload.temperature, 0, 10);
    const topP = optionalNumber(payload.topP, 0, 1);
    const seed = optionalInteger(payload.seed, 0, 2_147_483_647);
    const reasoningEffort = String(payload.reasoningEffort ?? "").slice(0, 40);
    const inputTokens = optionalInteger(payload.inputTokens);
    const outputTokens = optionalInteger(payload.outputTokens);
    const toolCalls = optionalInteger(payload.toolCalls, 0, 10_000) ?? 0;
    const errorCode = String(payload.errorCode ?? "").slice(0, 120);
    const startedAt = optionalTimestamp(payload.startedAt);
    const completedAt = optionalTimestamp(payload.completedAt);
    if (
      !controllerVersion || !HASH.test(runtimeRequestSha256) ||
      (provided(payload.temperature) && temperature === null) ||
      (provided(payload.topP) && topP === null) ||
      (provided(payload.seed) && seed === null) ||
      (provided(payload.inputTokens) && inputTokens === null) ||
      (provided(payload.outputTokens) && outputTokens === null) ||
      (provided(payload.toolCalls) && optionalInteger(payload.toolCalls, 0, 10_000) === null) ||
      (provided(payload.startedAt) && startedAt === null) ||
      (provided(payload.completedAt) && completedAt === null)
    ) {
      return Response.json({ error: "Invalid Agent attempt settings" }, { status: 400 });
    }
    if (
      status === "submitted" &&
      (!modelRequestId || !COMPLETE_HASH.test(promptSha256) || !COMPLETE_HASH.test(screenshotSha256) || !COMPLETE_HASH.test(outputSha256) ||
        !COMPLETE_HASH.test(runtimeRequestSha256) || !COMPLETE_HASH.test(actionTraceSha256) || sourceModelRequestId ||
        !startedAt || !completedAt || Date.parse(completedAt) < Date.parse(startedAt) ||
        Date.parse(completedAt) - Date.parse(startedAt) > 180_000 || toolCalls < 1 || toolCalls > 20 || errorCode)
    ) {
      return Response.json({ error: "Submitted Agent attempts require complete hashes, a 0–180 second interval, at most 20 actions, and no error code" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const [session] = await getDb()
      .select({
        actorType: experimentSessions.actorType,
        experimentalArm: experimentSessions.experimentalArm,
        studyConfigJson: experimentSessions.studyConfigJson,
        status: experimentSessions.status,
        practiceCompletedAt: experimentSessions.practiceCompletedAt,
      })
      .from(experimentSessions)
      .where(eq(experimentSessions.id, sessionId))
      .limit(1);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    if (session.actorType !== "agent") {
      return Response.json({ error: "Agent attempts can only be attached to Agent sessions" }, { status: 403 });
    }
    let sessionConfig: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(session.studyConfigJson) as unknown;
      sessionConfig = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      sessionConfig = {};
    }
    const collectionGateResponse = m1SessionMutationGateResponse(session.experimentalArm, sessionConfig);
    if (collectionGateResponse) return collectionGateResponse;
    if (session.experimentalArm === "agent-m1-main") {
      const agentMetadata = typeof sessionConfig.agentMetadata === "object" && sessionConfig.agentMetadata !== null
        ? sessionConfig.agentMetadata as Record<string, unknown>
        : {};
      if (
        controllerVersion !== String(agentMetadata.controllerVersion ?? "") ||
        contextPolicy !== String(agentMetadata.contextPolicy ?? "") ||
        imageDetail !== String(agentMetadata.imageDetail ?? "") ||
        inputModality !== "screenshot" ||
        temperature !== (typeof agentMetadata.temperature === "number" ? agentMetadata.temperature : null) ||
        topP !== (typeof agentMetadata.topP === "number" ? agentMetadata.topP : null) ||
        seed !== (typeof agentMetadata.seed === "number" ? agentMetadata.seed : null) ||
        reasoningEffort !== String(agentMetadata.reasoningEffort ?? "") ||
        normalizedPromptHash !== String(agentMetadata.promptSha256 ?? "").toLowerCase()
      ) {
        return Response.json(
          { error: "Agent attempt settings do not match the frozen session", code: "ATTEMPT_SETTINGS_MISMATCH" },
          { status: 409 },
        );
      }
    }
    const [step] = await getDb()
      .select({ stepOrder: experimentExpectedSteps.stepOrder })
      .from(experimentExpectedSteps)
      .where(and(
        eq(experimentExpectedSteps.sessionId, sessionId),
        eq(experimentExpectedSteps.stepOrder, stepOrder),
      ))
      .limit(1);
    if (!step) return Response.json({ error: "Unknown experiment step" }, { status: 409 });

    const existingAttempts = await getDb()
      .select()
      .from(agentRunAttempts)
      .where(and(
        eq(agentRunAttempts.sessionId, sessionId),
        eq(agentRunAttempts.stepOrder, stepOrder),
      ))
      .orderBy(asc(agentRunAttempts.attemptNumber));
    const existing = existingAttempts.find((candidate) => candidate.attemptNumber === attemptNumber);
    const matchesAttempt = (candidate: typeof agentRunAttempts.$inferSelect) =>
        candidate.controllerVersion === controllerVersion &&
        candidate.modelApiAttemptNumber === modelApiAttemptNumber &&
        candidate.mechanicalActionId === mechanicalActionId &&
        candidate.mechanicalRetryNumber === mechanicalRetryNumber &&
        candidate.modelRequestId === modelRequestId &&
        candidate.sourceModelRequestId === sourceModelRequestId &&
        candidate.promptSha256 === normalizedPromptHash &&
        candidate.runtimeRequestSha256 === normalizedRuntimeRequestHash &&
        candidate.screenshotSha256 === normalizedScreenshotHash &&
        candidate.outputSha256 === normalizedOutputHash &&
        candidate.actionTraceSha256 === normalizedActionTraceHash &&
        candidate.contextPolicy === contextPolicy &&
        candidate.inputModality === inputModality &&
        candidate.imageDetail === imageDetail &&
        candidate.temperature === temperature &&
        candidate.topP === topP &&
        candidate.seed === seed &&
        candidate.reasoningEffort === reasoningEffort &&
        candidate.inputTokens === inputTokens &&
        candidate.outputTokens === outputTokens &&
        candidate.toolCalls === toolCalls &&
        candidate.status === status &&
        candidate.errorCode === errorCode &&
        candidate.startedAt === startedAt &&
        candidate.completedAt === completedAt;
    if (existing) {
      if (matchesAttempt(existing)) {
        if (session.experimentalArm === "agent-m1-main") {
          const validation = validateM1AttemptLedger(existingAttempts as M1AttemptLedgerRow[]);
          if (!validation.ok) {
            const terminationCode = `ATTEMPT_PROTOCOL_${validation.code ?? "INVALID"}`.slice(0, 120);
            await abortActiveAgentSession(sessionId, terminationCode);
            return Response.json(
              {
                error: "Stored Agent ledger violates the frozen execution protocol",
                code: validation.code ?? "ATTEMPT_PROTOCOL_INVALID",
                sessionAborted: true,
              },
              { status: 409 },
            );
          }
          if (validation.terminalAbortCode) {
            await abortActiveAgentSession(sessionId, validation.terminalAbortCode);
            return Response.json({
              attempt: existing,
              idempotent: true,
              sessionAborted: true,
              terminationCode: validation.terminalAbortCode,
            });
          }
        }
        return Response.json({ attempt: existing, idempotent: true });
      }
      return Response.json(
        { error: "This Agent attempt number was already recorded with different metadata", code: "ATTEMPT_ALREADY_FINALIZED" },
        { status: 409 },
      );
    }
    if (session.status !== "active") {
      return Response.json({ error: "New Agent attempts require an active session" }, { status: 409 });
    }
    if (session.experimentalArm === "agent-m1-main") {
      if (!session.practiceCompletedAt) {
        return Response.json(
          { error: "The common practice must be completed before formal Agent attempts", code: "PRACTICE_REQUIRED" },
          { status: 409 },
        );
      }
      const savedResponses = await getDb()
        .select({ id: modularResponses.id })
        .from(modularResponses)
        .where(eq(modularResponses.sessionId, sessionId));
      if (savedResponses.length !== stepOrder) {
        return Response.json(
          {
            error: savedResponses.length > stepOrder
              ? "This Agent step already has a finalized page response"
              : "Agent attempts must follow the canonical page order",
            code: "AGENT_ATTEMPT_OUT_OF_ORDER",
            nextStepOrder: savedResponses.length,
          },
          { status: 409 },
        );
      }
      const [serverClock] = await getDb()
        .select({
          runElapsedSeconds: sql<number>`unixepoch('now') - unixepoch(${experimentSessions.startedAt})`,
          pageElapsedMs: sql<number>`CAST((julianday('now') - julianday(${experimentStepExposures.startedAt})) * 86400000 AS INTEGER)`,
        })
        .from(experimentSessions)
        .leftJoin(experimentStepExposures, and(
          eq(experimentStepExposures.sessionId, experimentSessions.id),
          eq(experimentStepExposures.stepOrder, stepOrder),
        ))
        .where(eq(experimentSessions.id, sessionId))
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
          .where(and(eq(experimentSessions.id, sessionId), eq(experimentSessions.status, "active")));
        return Response.json(
          { error: "The frozen 120-minute session limit was exceeded", code: "RUN_TIME_LIMIT_EXCEEDED" },
          { status: 409 },
        );
      }
      if (serverClock.pageElapsedMs < 0 || serverClock.pageElapsedMs > M1_FORMAL_PAGE_LIMIT_MS) {
        await getDb()
          .update(experimentSessions)
          .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "FORMAL_PAGE_TIME_LIMIT" })
          .where(and(eq(experimentSessions.id, sessionId), eq(experimentSessions.status, "active")));
        return Response.json(
          { error: "The formal page exceeded the frozen 180-second server limit", code: "FORMAL_PAGE_TIME_LIMIT" },
          { status: 409 },
        );
      }
    }
    let strictLedgerValidation: ReturnType<typeof validateM1AttemptLedger> | null = null;
    if (session.experimentalArm === "agent-m1-main") {
      if (attemptNumber !== existingAttempts.length + 1) {
        return Response.json(
          {
            error: "Agent attempt numbers must be contiguous within each page",
            code: "ATTEMPT_NUMBER_NOT_CONTIGUOUS",
            nextAttemptNumber: existingAttempts.length + 1,
          },
          { status: 409 },
        );
      }
      const candidate: M1AttemptLedgerRow = {
        stepOrder,
        attemptNumber,
        status,
        modelApiAttemptNumber,
        mechanicalActionId,
        mechanicalRetryNumber,
        modelRequestId,
        sourceModelRequestId,
        promptSha256: normalizedPromptHash,
        runtimeRequestSha256: normalizedRuntimeRequestHash,
        screenshotSha256: normalizedScreenshotHash,
        outputSha256: normalizedOutputHash,
        actionTraceSha256: normalizedActionTraceHash,
        toolCalls,
        errorCode,
        startedAt,
        completedAt,
      };
      strictLedgerValidation = validateM1AttemptLedger([
        ...(existingAttempts as M1AttemptLedgerRow[]),
        candidate,
      ]);
      if (!strictLedgerValidation.ok) {
        const terminationCode = `ATTEMPT_PROTOCOL_${strictLedgerValidation.code ?? "INVALID"}`.slice(0, 120);
        await abortActiveAgentSession(sessionId, terminationCode);
        return Response.json(
          {
            error: "Agent attempt violates the frozen execution protocol",
            code: strictLedgerValidation.code ?? "ATTEMPT_PROTOCOL_INVALID",
            sessionAborted: true,
          },
          { status: 409 },
        );
      }
    }
    if (status === "submitted") {
      const [submittedForStep] = await getDb()
        .select({ id: agentRunAttempts.id })
        .from(agentRunAttempts)
        .where(and(
          eq(agentRunAttempts.sessionId, sessionId),
          eq(agentRunAttempts.stepOrder, stepOrder),
          eq(agentRunAttempts.status, "submitted"),
        ))
        .limit(1);
      if (submittedForStep) {
        return Response.json(
          { error: "This step already has its final submitted Agent attempt", code: "SUBMITTED_ATTEMPT_ALREADY_EXISTS" },
          { status: 409 },
        );
      }
    }
    if (modelRequestId) {
      const [requestReuse] = await getDb()
        .select({ id: agentRunAttempts.id })
        .from(agentRunAttempts)
        .where(and(
          eq(agentRunAttempts.sessionId, sessionId),
          eq(agentRunAttempts.modelRequestId, modelRequestId),
        ))
        .limit(1);
      if (requestReuse) {
        return Response.json(
          { error: "Agent model request IDs must be unique within a session", code: "MODEL_REQUEST_ID_REUSED" },
          { status: 409 },
        );
      }
    }

    const attemptValues: typeof agentRunAttempts.$inferInsert = {
        id: crypto.randomUUID(),
        sessionId,
        stepOrder,
        attemptNumber,
        modelApiAttemptNumber,
        mechanicalActionId,
        mechanicalRetryNumber,
        controllerVersion,
        modelRequestId,
        sourceModelRequestId,
        promptSha256: normalizedPromptHash,
        runtimeRequestSha256: normalizedRuntimeRequestHash,
        screenshotSha256: normalizedScreenshotHash,
        outputSha256: normalizedOutputHash,
        actionTraceSha256: normalizedActionTraceHash,
        contextPolicy,
        inputModality,
        imageDetail,
        temperature,
        topP,
        seed,
        reasoningEffort,
        inputTokens,
        outputTokens,
        toolCalls,
        status,
        errorCode,
        startedAt,
        completedAt,
    };
    let attempt: typeof agentRunAttempts.$inferSelect;
    try {
      if (strictLedgerValidation?.terminalAbortCode) {
        const database = getDb();
        const [insertedRows] = await database.batch([
          database.insert(agentRunAttempts).values(attemptValues).returning(),
          database.update(experimentSessions)
            .set({
              status: "aborted",
              completedAt: new Date().toISOString(),
              terminationCode: strictLedgerValidation.terminalAbortCode,
            })
            .where(and(eq(experimentSessions.id, sessionId), eq(experimentSessions.status, "active")))
            .returning({ id: experimentSessions.id }),
        ]);
        attempt = insertedRows[0];
      } else {
        const [inserted] = await getDb()
          .insert(agentRunAttempts)
          .values(attemptValues)
          .returning();
        attempt = inserted;
      }
    } catch (insertError) {
      if (!isUniqueConstraint(insertError)) throw insertError;
      const [winner] = await getDb()
        .select()
        .from(agentRunAttempts)
        .where(and(
          eq(agentRunAttempts.sessionId, sessionId),
          eq(agentRunAttempts.stepOrder, stepOrder),
          eq(agentRunAttempts.attemptNumber, attemptNumber),
        ))
        .limit(1);
      if (!winner) {
        return Response.json(
          { error: "The submitted step or model request ID was finalized concurrently", code: "ATTEMPT_UNIQUENESS_CONFLICT" },
          { status: 409 },
        );
      }
      if (matchesAttempt(winner)) {
        if (strictLedgerValidation?.terminalAbortCode) {
          await abortActiveAgentSession(sessionId, strictLedgerValidation.terminalAbortCode);
          return Response.json({
            attempt: winner,
            idempotent: true,
            sessionAborted: true,
            terminationCode: strictLedgerValidation.terminalAbortCode,
          });
        }
        return Response.json({ attempt: winner, idempotent: true });
      }
      return Response.json(
        { error: "This Agent attempt number was already recorded with different metadata", code: "ATTEMPT_ALREADY_FINALIZED" },
        { status: 409 },
      );
    }
    if (strictLedgerValidation?.terminalAbortCode) {
      return Response.json(
        { attempt, sessionAborted: true, terminationCode: strictLedgerValidation.terminalAbortCode },
        { status: 201 },
      );
    }
    return Response.json({ attempt }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Agent attempt write failed" },
      { status: 500 },
    );
  }
}
