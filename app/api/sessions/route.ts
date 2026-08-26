import { and, asc, eq, sql } from "drizzle-orm";
import { ensureExperimentSchema, getD1, getDb } from "@/db";
import {
  agentRunAttempts,
  experimentExpectedSteps,
  experimentSessions,
  m1LaunchTokens,
  m1PairAssignments,
  m1PairSlots,
  modularResponses,
} from "@/db/schema";
import { hashM1LaunchToken } from "@/lib/m1-launch";
import {
  m1CollectionGateFailure,
  m1CollectionGateResponse,
  m1DeploymentIdentity,
  m1SessionMutationGateResponse,
} from "@/lib/m1-collection-gates";
import { canonicalM1AgentProfile, hashM1AgentProfile, validM1AgentProfile } from "@/lib/m1-agent-profile";
import { hashM1ScientificResponse } from "@/lib/m1-response-integrity";
import {
  type M1AttemptLedgerRow,
  M1_FORMAL_PAGE_LIMIT_MS,
  M1_FULL_RUN_LIMIT_SECONDS,
  m1AttemptLedgerIsSubmitted,
  strictM1ResponseDurationViolation,
  validateM1AttemptLedger,
} from "@/lib/m1-execution-limits";
import {
  buildM1ProtocolPlan,
  isStrictM1Arm,
  M1_AGENT_PROMPT_SHA256,
  M1_ANALYSIS_SET_VERSION,
  M1_COHORT_ID,
  M1_DISCLOSURE_KEYS,
  M1_EVENT_SOURCE_SHA256,
  M1_IMPLEMENTATION_BUILD_ID,
  M1_PREREGISTRATION_VERSION,
  M1_PROTOCOL_VERSION,
  M1_STUDY_PHASE,
  M1_STIMULUS_BUNDLE,
  M1_STIMULUS_SHA256,
  normalizeM1Condition,
  normalizeM1ScheduleId,
  sameM1Plan,
} from "@/lib/m1-protocol";

const EXPERTISE = new Set(["none", "casual", "active", "professional"]);
const ACTOR_TYPES = new Set(["human", "agent"]);
const DEVICE_TYPES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const POINTER_TYPES = new Set(["coarse", "fine", "none", "unknown"]);
const EXPLICIT_TERMINATION_CODES = new Map([
  ["participant-exit", "PARTICIPANT_EXIT"],
  ["participant-withdrawal", "PARTICIPANT_WITHDRAWAL"],
  ["controller-crash", "CONTROLLER_CRASH"],
  ["network-failure", "NETWORK_FAILURE"],
  ["operator-abort", "OPERATOR_ABORT"],
]);
const SHA256 = /^[a-f0-9]{64}$/i;

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

type PlanLike = {
  id?: unknown;
  order?: unknown;
  module?: unknown;
  taskType?: unknown;
  assetId?: unknown;
  metric?: unknown;
  resolution?: unknown;
  scaleMode?: unknown;
  windowMode?: unknown;
  disclosures?: unknown;
  controlId?: unknown;
};

type ExpectedStepRow = {
  sessionId: string;
  stepOrder: number;
  trialId: string;
  trialOrder: number;
  moduleKey: string;
  taskType: string;
  stimulusType: string;
  assetId: string;
  metricType: string;
  resolution: string;
  scaleMode: string;
  windowMode: string;
  disclosureIndex: number;
  disclosureKey: string;
};

type SessionMaterialization = {
  id: string;
  actorType: string;
  participantCode: string;
  expertise: string;
  experimentalArm: string;
  protocolVersion: string;
  studyConfigJson: string;
  modelName: string | null;
  deviceType: string;
  userAgent: string;
  clientPlatform: string;
  browserLanguage: string;
  clientTimezone: string;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  devicePixelRatio: number | null;
  touchPoints: number;
  pointerType: string;
  screenOrientation: string;
  status: "initializing" | "active";
};

type PairSlotMaterialization = {
  id: string;
  pairId: string;
  actorType: "human" | "agent";
  replicateId: string;
  launchTokenHash: string;
  sessionId: string;
};

class M1SessionRecoveryError extends Error {
  readonly code = "M1_SESSION_RECOVERY_FAILED";
}

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

// Strict M1 persists only coarse browser/OS categories. The raw User-Agent is
// used transiently for this reduction and is never written to the study row.
function summarizeBrowserEnvironment(value: string | undefined) {
  const userAgent = (value ?? "").trim();
  const edge = userAgent.match(/Edg\/(\d+)/i)?.[1];
  const chrome = userAgent.match(/Chrome\/(\d+)/i)?.[1];
  const firefox = userAgent.match(/Firefox\/(\d+)/i)?.[1];
  const safari = userAgent.match(/Version\/(\d+).+Safari/i)?.[1];
  const browser = edge
    ? `Edge/${edge}`
    : chrome
      ? `Chrome/${chrome}`
      : firefox
        ? `Firefox/${firefox}`
        : safari
          ? `Safari/${safari}`
          : "Other";
  const operatingSystem = /Windows/i.test(userAgent)
    ? "Windows"
    : /Android/i.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Other";
  return `${browser}; ${operatingSystem}`;
}

function chromeBrowserMajor(value: string | undefined) {
  const userAgent = value ?? "";
  if (/Edg\//i.test(userAgent)) return null;
  const match = userAgent.match(/Chrome\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected database error";
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stimulusTypeForPlanTrial(trial: PlanLike) {
  if (typeof trial.controlId !== "string") return "crypto";
  if (trial.controlId === "white-noise") return "null";
  if (trial.controlId === "synthetic-regime") return "ground-truth";
  return "cross-domain";
}

function expectedRowsFromPlan(
  sessionId: string,
  candidate: unknown,
  disclosureFlowOrder: "disclosure-major" | "asset-major" = "disclosure-major",
) {
  if (!Array.isArray(candidate) || candidate.length === 0) return [];
  const trials = candidate as PlanLike[];
  const rowCount = trials.length;
  const assetMajorBase = new Map<string, number>();
  let assetMajorCursor = 0;
  [...trials]
    .sort((first, second) => Number(first.order ?? 0) - Number(second.order ?? 0))
    .forEach((trial) => {
      if (typeof trial.id === "string") assetMajorBase.set(trial.id, assetMajorCursor);
      assetMajorCursor += Array.isArray(trial.disclosures) ? trial.disclosures.length : 0;
    });
  const rows: ExpectedStepRow[] = [];
  for (const trial of trials) {
    if (
      typeof trial.id !== "string" ||
      typeof trial.order !== "number" ||
      !Number.isInteger(trial.order) ||
      typeof trial.module !== "string" ||
      typeof trial.taskType !== "string" ||
      typeof trial.assetId !== "string" ||
      typeof trial.metric !== "string" ||
      typeof trial.resolution !== "string" ||
      typeof trial.scaleMode !== "string" ||
      typeof trial.windowMode !== "string" ||
      !Array.isArray(trial.disclosures) ||
      trial.disclosures.length === 0 ||
      trial.disclosures.some((key) => typeof key !== "string")
    ) return [];
    const trialId = trial.id as string;
    const trialOrder = trial.order as number;
    const moduleKey = trial.module as string;
    const taskType = trial.taskType as string;
    const assetId = trial.assetId as string;
    const metricType = trial.metric as string;
    const resolution = trial.resolution as string;
    const scaleMode = trial.scaleMode as string;
    const windowMode = trial.windowMode as string;
    (trial.disclosures as string[]).forEach((disclosureKey, disclosureIndex) => {
      rows.push({
        sessionId,
        stepOrder: disclosureFlowOrder === "asset-major"
          ? (assetMajorBase.get(trialId) ?? 0) + disclosureIndex
          : disclosureIndex * rowCount + trialOrder,
        trialId,
        trialOrder,
        moduleKey,
        taskType,
        stimulusType: stimulusTypeForPlanTrial(trial),
        assetId,
        metricType,
        resolution,
        scaleMode,
        windowMode,
        disclosureIndex,
        disclosureKey: String(disclosureKey),
      });
    });
  }
  return rows.sort((first, second) => first.stepOrder - second.stepOrder);
}

function exactStepKey(row: {
  trialId: string;
  trialOrder: number;
  moduleKey: string;
  taskType: string;
  stimulusType?: string;
  assetId: string;
  metricType: string;
  resolution: string;
  scaleMode: string;
  windowMode: string;
  disclosureIndex: number;
  disclosureKey: string;
}) {
  return [
    row.trialId,
    row.trialOrder,
    row.moduleKey,
    row.taskType,
    row.stimulusType ?? "",
    row.assetId,
    row.metricType,
    row.resolution,
    row.scaleMode,
    row.windowMode,
    row.disclosureIndex,
    row.disclosureKey,
  ].join("\u001f");
}

async function insertExpectedRows(
  rows: ExpectedStepRow[],
) {
  // D1 caps bound parameters per statement. Five rows keep this comfortably
  // below the limit while still materializing the whole plan atomically enough
  // for a newly-created, not-yet-visible session.
  for (let index = 0; index < rows.length; index += 5) {
    await getDb()
      .insert(experimentExpectedSteps)
      .values(rows.slice(index, index + 5))
      .onConflictDoNothing();
  }
}

async function readExpectedRows(sessionId: string) {
  return getDb()
    .select({
      stepOrder: experimentExpectedSteps.stepOrder,
      trialId: experimentExpectedSteps.trialId,
      trialOrder: experimentExpectedSteps.trialOrder,
      moduleKey: experimentExpectedSteps.moduleKey,
      taskType: experimentExpectedSteps.taskType,
      stimulusType: experimentExpectedSteps.stimulusType,
      assetId: experimentExpectedSteps.assetId,
      metricType: experimentExpectedSteps.metricType,
      resolution: experimentExpectedSteps.resolution,
      scaleMode: experimentExpectedSteps.scaleMode,
      windowMode: experimentExpectedSteps.windowMode,
      disclosureIndex: experimentExpectedSteps.disclosureIndex,
      disclosureKey: experimentExpectedSteps.disclosureKey,
    })
    .from(experimentExpectedSteps)
    .where(eq(experimentExpectedSteps.sessionId, sessionId))
    .orderBy(asc(experimentExpectedSteps.stepOrder));
}

function expectedRowsAreExact(
  stored: Awaited<ReturnType<typeof readExpectedRows>>,
  expected: ExpectedStepRow[],
) {
  return stored.length === expected.length && stored.every((row, index) => (
    row.stepOrder === expected[index].stepOrder && exactStepKey(row) === exactStepKey(expected[index])
  ));
}

async function ensureExpectedRows(
  rows: ExpectedStepRow[],
) {
  await insertExpectedRows(rows);
  if (rows.length === 0) return [];
  const stored = await readExpectedRows(rows[0].sessionId);
  if (!expectedRowsAreExact(stored, rows)) {
    throw new Error("Canonical expected-step plan could not be materialized exactly");
  }
  return stored;
}

function prepareSessionInsert(
  d1: ReturnType<typeof getD1>,
  session: SessionMaterialization,
  ignoreConflicts: boolean,
) {
  return d1.prepare(`${ignoreConflicts ? "INSERT OR IGNORE" : "INSERT"} INTO experiment_sessions (
    id, actor_type, participant_code, expertise, experimental_arm, protocol_version,
    study_config_json, model_name, device_type, user_agent, client_platform,
    browser_language, client_timezone, screen_width, screen_height, viewport_width,
    viewport_height, device_pixel_ratio, touch_points, pointer_type, screen_orientation, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      session.id,
      session.actorType,
      session.participantCode,
      session.expertise,
      session.experimentalArm,
      session.protocolVersion,
      session.studyConfigJson,
      session.modelName,
      session.deviceType,
      session.userAgent,
      session.clientPlatform,
      session.browserLanguage,
      session.clientTimezone,
      session.screenWidth,
      session.screenHeight,
      session.viewportWidth,
      session.viewportHeight,
      session.devicePixelRatio,
      session.touchPoints,
      session.pointerType,
      session.screenOrientation,
      session.status,
    );
}

function prepareExpectedStepInsert(
  d1: ReturnType<typeof getD1>,
  row: ExpectedStepRow,
  ignoreConflicts: boolean,
) {
  return d1.prepare(`${ignoreConflicts ? "INSERT OR IGNORE" : "INSERT"} INTO experiment_expected_steps (
    session_id, step_order, trial_id, trial_order, module_key, task_type, stimulus_type,
    asset_id, metric_type, resolution, scale_mode, window_mode, disclosure_index, disclosure_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      row.sessionId,
      row.stepOrder,
      row.trialId,
      row.trialOrder,
      row.moduleKey,
      row.taskType,
      row.stimulusType,
      row.assetId,
      row.metricType,
      row.resolution,
      row.scaleMode,
      row.windowMode,
      row.disclosureIndex,
      row.disclosureKey,
    );
}

function preparePairSlotInsert(
  d1: ReturnType<typeof getD1>,
  slot: PairSlotMaterialization,
  mode: "strict-claim" | "repair",
) {
  if (mode === "repair") {
    return d1.prepare(`INSERT OR IGNORE INTO m1_pair_slots (
      id, pair_id, actor_type, replicate_id, launch_token_hash, session_id
    ) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        slot.id,
        slot.pairId,
        slot.actorType,
        slot.replicateId,
        slot.launchTokenHash,
        slot.sessionId,
      );
  }
  // The NOT NULL session_id is also the transactional assertion that the
  // preceding token claim belongs to this exact session. A lost race makes
  // the scalar subquery NULL, so D1 rolls the entire batch back.
  return d1.prepare(`INSERT INTO m1_pair_slots (
    id, pair_id, actor_type, replicate_id, launch_token_hash, session_id
  ) VALUES (?, ?, ?, ?, ?, (
    SELECT CASE
      WHEN claimed_session_id = ? AND revoked_at IS NULL THEN ?
      ELSE NULL
    END
    FROM m1_launch_tokens
    WHERE token_hash = ?
  ))`)
    .bind(
      slot.id,
      slot.pairId,
      slot.actorType,
      slot.replicateId,
      slot.launchTokenHash,
      slot.sessionId,
      slot.sessionId,
      slot.launchTokenHash,
    );
}

async function createStrictM1SessionAtomically(
  session: SessionMaterialization,
  slot: PairSlotMaterialization,
  expectedRows: ExpectedStepRow[],
) {
  if (session.status !== "initializing" || expectedRows.length !== 42) {
    throw new Error("Strict M1 session materialization requires exactly 42 initializing steps");
  }
  const d1 = getD1();
  const claimedAt = new Date().toISOString();
  await d1.batch([
    prepareSessionInsert(d1, session, false),
    d1.prepare(`UPDATE m1_launch_tokens
      SET claimed_session_id = ?, claimed_at = ?
      WHERE token_hash = ? AND claimed_session_id IS NULL AND revoked_at IS NULL`)
      .bind(session.id, claimedAt, slot.launchTokenHash),
    preparePairSlotInsert(d1, slot, "strict-claim"),
    ...expectedRows.map((row) => prepareExpectedStepInsert(d1, row, false)),
    d1.prepare("UPDATE experiment_sessions SET status = 'active' WHERE id = ? AND status = 'initializing'")
      .bind(session.id),
  ]);
}

async function repairStrictM1SessionAtomically(
  session: SessionMaterialization,
  slot: PairSlotMaterialization,
  expectedRows: ExpectedStepRow[],
) {
  const d1 = getD1();
  await d1.batch([
    prepareSessionInsert(d1, session, true),
    preparePairSlotInsert(d1, slot, "repair"),
    ...expectedRows.map((row) => prepareExpectedStepInsert(d1, row, true)),
  ]);
}

async function verifyStrictM1Materialization(
  expectedSession: SessionMaterialization,
  expectedSlot: PairSlotMaterialization,
  expectedRows: ExpectedStepRow[],
  canonicalPlan: ReturnType<typeof buildM1ProtocolPlan>,
) {
  let expectedConfig: Record<string, unknown> = {};
  try {
    expectedConfig = JSON.parse(expectedSession.studyConfigJson) as Record<string, unknown>;
  } catch {
    throw new M1SessionRecoveryError("Canonical M1 session configuration is unreadable");
  }
  const [token, session, slotByToken, slotBySession] = await Promise.all([
    getDb()
      .select()
      .from(m1LaunchTokens)
      .where(eq(m1LaunchTokens.tokenHash, expectedSlot.launchTokenHash))
      .limit(1)
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(experimentSessions)
      .where(eq(experimentSessions.id, expectedSession.id))
      .limit(1)
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(m1PairSlots)
      .where(eq(m1PairSlots.launchTokenHash, expectedSlot.launchTokenHash))
      .limit(1)
      .then((rows) => rows[0]),
    getDb()
      .select()
      .from(m1PairSlots)
      .where(eq(m1PairSlots.sessionId, expectedSession.id))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (
    !token || token.revokedAt || token.claimedSessionId !== expectedSession.id ||
    token.pairId !== expectedSlot.pairId ||
    token.actorType !== expectedSlot.actorType ||
    token.replicateId !== expectedSlot.replicateId ||
    token.scheduleId !== Number(expectedConfig.scheduleId) ||
    token.informationCondition !== expectedConfig.informationCondition ||
    !session ||
    session.actorType !== expectedSession.actorType ||
    session.participantCode !== expectedSession.participantCode ||
    session.experimentalArm !== expectedSession.experimentalArm ||
    session.protocolVersion !== expectedSession.protocolVersion ||
    !slotByToken || !slotBySession || slotByToken.id !== slotBySession.id ||
    slotByToken.pairId !== expectedSlot.pairId ||
    slotByToken.actorType !== expectedSlot.actorType ||
    slotByToken.replicateId !== expectedSlot.replicateId ||
    slotByToken.launchTokenHash !== expectedSlot.launchTokenHash ||
    slotByToken.sessionId !== expectedSession.id
  ) {
    throw new M1SessionRecoveryError("Claimed M1 token, session, and pair slot are not an exact match");
  }

  let storedConfig: Record<string, unknown> = {};
  try {
    storedConfig = JSON.parse(session.studyConfigJson) as Record<string, unknown>;
  } catch {
    throw new M1SessionRecoveryError("Claimed M1 session configuration is unreadable");
  }
  const allocationMode = storedConfig.allocationMode;
  const gateFailure = m1CollectionGateFailure(expectedSession.experimentalArm, allocationMode);
  if (gateFailure) {
    throw new M1SessionRecoveryError(gateFailure.error);
  }
  const deploymentIdentity = m1DeploymentIdentity();
  const deploymentMatches = allocationMode === "quota-manual"
    ? storedConfig.deploymentId === expectedConfig.deploymentId &&
      storedConfig.deploymentFingerprintSha256 === expectedConfig.deploymentFingerprintSha256
    : deploymentIdentity.valid &&
      storedConfig.deploymentId === deploymentIdentity.deploymentId &&
      storedConfig.deploymentFingerprintSha256 === deploymentIdentity.deploymentFingerprintSha256;
  if (
    (allocationMode !== "balanced-random-v1" && allocationMode !== "quota-manual") ||
    storedConfig.protocolArchitecture !== M1_PROTOCOL_VERSION ||
    storedConfig.cohortId !== M1_COHORT_ID ||
    storedConfig.studyPhase !== M1_STUDY_PHASE ||
    storedConfig.preregistrationVersion !== M1_PREREGISTRATION_VERSION ||
    storedConfig.analysisSetVersion !== M1_ANALYSIS_SET_VERSION ||
    storedConfig.implementationBuildId !== M1_IMPLEMENTATION_BUILD_ID ||
    !deploymentMatches ||
    storedConfig.pairId !== expectedSlot.pairId ||
    Number(storedConfig.scheduleId) !== Number(expectedConfig.scheduleId) ||
    storedConfig.informationCondition !== expectedConfig.informationCondition ||
    storedConfig.stimulusSha256 !== M1_STIMULUS_SHA256 ||
    storedConfig.eventSourceSha256 !== M1_EVENT_SOURCE_SHA256 ||
    storedConfig.module !== "disclosure" ||
    storedConfig.taskType !== "T2" ||
    storedConfig.metric !== "price" ||
    storedConfig.resolution !== "weekly" ||
    storedConfig.scaleMode !== "linear" ||
    storedConfig.windowMode !== "whole" ||
    storedConfig.disclosureFlowOrder !== "disclosure-major" ||
    storedConfig.responseVersion !== M1_PROTOCOL_VERSION ||
    !sameM1Plan(storedConfig.randomizedPlan, canonicalPlan)
  ) {
    throw new M1SessionRecoveryError("Claimed M1 session does not match its canonical assignment");
  }

  const storedExpectedRows = await readExpectedRows(expectedSession.id);
  if (expectedRows.length !== 42 || !expectedRowsAreExact(storedExpectedRows, expectedRows)) {
    throw new M1SessionRecoveryError("Claimed M1 session does not contain the exact 42-step plan");
  }
  if (session.status === "initializing") {
    await getDb()
      .update(experimentSessions)
      .set({ status: "active" })
      .where(and(
        eq(experimentSessions.id, expectedSession.id),
        eq(experimentSessions.status, "initializing"),
      ));
  } else if (session.status !== "active" && session.status !== "complete") {
    throw new M1SessionRecoveryError("Claimed M1 session is in an invalid lifecycle state");
  }
  const [verifiedSession] = await getDb()
    .select({
      id: experimentSessions.id,
      startedAt: experimentSessions.startedAt,
      status: experimentSessions.status,
    })
    .from(experimentSessions)
    .where(eq(experimentSessions.id, expectedSession.id))
    .limit(1);
  if (!verifiedSession || (verifiedSession.status !== "active" && verifiedSession.status !== "complete")) {
    throw new M1SessionRecoveryError("Claimed M1 session could not be activated");
  }
  return verifiedSession;
}

async function recoverStrictM1Session(
  claimedSessionId: string,
  baseSession: SessionMaterialization,
  baseSlot: PairSlotMaterialization,
  canonicalPlan: ReturnType<typeof buildM1ProtocolPlan>,
) {
  const session = { ...baseSession, id: claimedSessionId, status: "initializing" as const };
  const slot = { ...baseSlot, id: crypto.randomUUID(), sessionId: claimedSessionId };
  const expectedRows = expectedRowsFromPlan(claimedSessionId, canonicalPlan, "disclosure-major");
  if (expectedRows.length !== 42) {
    throw new M1SessionRecoveryError("Canonical M1 recovery plan is not exactly 42 steps");
  }
  await repairStrictM1SessionAtomically(session, slot, expectedRows);
  const verifiedSession = await verifyStrictM1Materialization(session, slot, expectedRows, canonicalPlan);
  return { verifiedSession, expectedRows };
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
      launchToken?: string | null;
      studyConfig?: unknown;
      deviceInfo?: DeviceInfoPayload;
    };
    const actorType = payload.actorType ?? "human";
    const expertise = payload.expertise ?? "none";
    const protocolVersion = payload.protocolVersion?.trim() ?? "";
    const experimentalArm = (payload.experimentalArm ?? "trajectory").slice(0, 40);
    if (!ACTOR_TYPES.has(actorType) || !EXPERTISE.has(expertise) || !protocolVersion) {
      return Response.json({ error: "Invalid session configuration" }, { status: 400 });
    }

    const deploymentIdentity = m1DeploymentIdentity();
    if (experimentalArm !== "m1-main" && experimentalArm !== "agent-m1-main") {
      const collectionGateResponse = m1CollectionGateResponse(experimentalArm);
      if (collectionGateResponse) return collectionGateResponse;
    }

    const sessionId = crypto.randomUUID();
    let rawStudyConfig = record(payload.studyConfig);
    let assignedParticipantCode: string | null = null;
    let assignedReplicateId: string | null = null;
    let assignedAllocationMode: "balanced-random-v1" | "quota-manual" | null = null;
    let assignedAgentProfileSha256 = "";
    let assignedPrimaryBrowserMajor = 0;
    let assignedDeploymentId = "";
    let assignedDeploymentFingerprintSha256 = "";
    let launchTokenHash: string | null = null;
    await ensureExperimentSchema();
    if (experimentalArm === "m1-main" || experimentalArm === "agent-m1-main") {
      const launchToken = typeof payload.launchToken === "string" ? payload.launchToken.trim() : "";
      if (!/^[a-f0-9]{64}$/i.test(launchToken)) {
        return Response.json(
          { error: "A valid opaque M1 launch token is required", code: "M1_LAUNCH_TOKEN_REQUIRED" },
          { status: 400 },
        );
      }
      launchTokenHash = await hashM1LaunchToken(launchToken.toLowerCase());
      const [launch] = await getDb()
        .select()
        .from(m1LaunchTokens)
        .where(eq(m1LaunchTokens.tokenHash, launchTokenHash))
        .limit(1);
      if (!launch || launch.revokedAt) {
        return Response.json({ error: "M1 launch token is invalid or revoked" }, { status: 403 });
      }
      if (launch.actorType !== actorType) {
        return Response.json({ error: "M1 launch token does not match this entry" }, { status: 403 });
      }
      assignedParticipantCode = launch.participantCode;
      assignedReplicateId = launch.replicateId;
      const [assignment] = await getDb()
        .select()
        .from(m1PairAssignments)
        .where(eq(m1PairAssignments.pairId, launch.pairId))
        .limit(1);
      if (
        !assignment ||
        assignment.protocolArchitecture !== M1_PROTOCOL_VERSION ||
        assignment.scheduleId !== launch.scheduleId ||
        assignment.informationCondition !== launch.informationCondition ||
        assignment.stimulusSha256 !== M1_STIMULUS_SHA256 ||
        assignment.eventSourceSha256 !== M1_EVENT_SOURCE_SHA256 ||
        assignment.cohortId !== M1_COHORT_ID ||
        assignment.studyPhase !== M1_STUDY_PHASE ||
        assignment.preregistrationVersion !== M1_PREREGISTRATION_VERSION ||
        assignment.analysisSetVersion !== M1_ANALYSIS_SET_VERSION ||
        assignment.implementationBuildId !== M1_IMPLEMENTATION_BUILD_ID ||
        !["balanced-random-v1", "quota-manual"].includes(assignment.allocationMode) ||
        assignment.assignmentVersion !== assignment.allocationMode
      ) {
        return Response.json(
          { error: "M1 launch token is not linked to the frozen assignment" },
          { status: 409 },
        );
      }
      assignedAllocationMode = assignment.allocationMode === "balanced-random-v1"
        ? "balanced-random-v1"
        : "quota-manual";
      const allocationGateResponse = m1CollectionGateResponse(experimentalArm, assignedAllocationMode);
      if (allocationGateResponse) return allocationGateResponse;
      if (
        assignedAllocationMode === "balanced-random-v1" &&
        !deploymentIdentity.valid
      ) {
        return Response.json(
          { error: "The M1 deployment identity is not frozen", code: "M1_DEPLOYMENT_IDENTITY_NOT_CONFIGURED" },
          { status: 503 },
        );
      }
      if (
        assignedAllocationMode === "balanced-random-v1" &&
        (assignment.deploymentId !== deploymentIdentity.deploymentId ||
          assignment.deploymentFingerprintSha256 !== deploymentIdentity.deploymentFingerprintSha256)
      ) {
        return Response.json(
          { error: "M1 launch token is linked to a different frozen deployment" },
          { status: 409 },
        );
      }
      assignedAgentProfileSha256 = assignment.agentProfileSha256;
      assignedPrimaryBrowserMajor = assignment.primaryBrowserMajor;
      assignedDeploymentId = assignment.deploymentId;
      assignedDeploymentFingerprintSha256 = assignment.deploymentFingerprintSha256;
      if (
        assignedAllocationMode === "balanced-random-v1" &&
        (!/^[a-f0-9]{64}$/i.test(assignedAgentProfileSha256) || assignedPrimaryBrowserMajor < 100)
      ) {
        return Response.json({ error: "M1 assignment is missing its frozen Agent/browser profile" }, { status: 409 });
      }
      if (
        actorType === "agent" &&
        assignedAllocationMode === "balanced-random-v1" &&
        assignedReplicateId !== "R-PRIMARY"
      ) {
        return Response.json(
          { error: "Balanced primary Agent sessions require R-PRIMARY" },
          { status: 409 },
        );
      }
      rawStudyConfig = {
        ...rawStudyConfig,
        pairId: launch.pairId,
        scheduleId: launch.scheduleId,
        informationCondition: launch.informationCondition,
        allocationMode: assignedAllocationMode,
        agentProfileSha256: assignedAgentProfileSha256,
        primaryBrowserMajor: assignedPrimaryBrowserMajor,
        deploymentId: assignedDeploymentId,
        deploymentFingerprintSha256: assignedDeploymentFingerprintSha256,
        launchAssignmentVersion: "opaque-token-v1",
      };
    }
    let storedStudyConfig: Record<string, unknown> = { ...rawStudyConfig };
    let normalizedAgentMetadata: Record<string, unknown> | null = null;
    if (isStrictM1Arm(experimentalArm)) {
      const rawCondition = rawStudyConfig.informationCondition;
      const rawSchedule = Number(rawStudyConfig.scheduleId);
      const pairId = String(rawStudyConfig.pairId ?? "").trim().slice(0, 64);
      if (
        (rawCondition !== undefined && rawCondition !== "staged" && rawCondition !== "repeat-control") ||
        !Number.isInteger(rawSchedule) || rawSchedule < 1 || rawSchedule > 6 ||
        !pairId
      ) {
        return Response.json({ error: "Invalid M1 pair, schedule, or information condition" }, { status: 400 });
      }
      const condition = normalizeM1Condition(rawStudyConfig.informationCondition);
      const scheduleId = normalizeM1ScheduleId(rawStudyConfig.scheduleId);
      const canonicalPlan = buildM1ProtocolPlan(scheduleId, condition);
      const expectedActor = experimentalArm === "agent-m1-main" ? "agent" : "human";
      if (actorType !== expectedActor) {
        return Response.json({ error: "Actor type does not match the M1 entry" }, { status: 400 });
      }
      if (experimentalArm === "m1-main") {
        const consentedAt = rawStudyConfig.humanConsentedAt;
        const languageScreenedAt = rawStudyConfig.humanLanguageScreenedAt;
        if (
          rawStudyConfig.humanConsentVersion !== "m1-human-consent-v1" ||
          typeof consentedAt !== "string" ||
          !Number.isFinite(Date.parse(consentedAt)) ||
          rawStudyConfig.humanLanguageScreeningVersion !== "m1-en-financial-reading-v1" ||
          typeof languageScreenedAt !== "string" ||
          !Number.isFinite(Date.parse(languageScreenedAt))
        ) {
          return Response.json({ error: "Recorded Human consent and language screening are required before session creation" }, { status: 400 });
        }
      }
      if (experimentalArm === "agent-m1-main") {
        const metadata = record(rawStudyConfig.agentMetadata);
        const replicateId = assignedReplicateId ?? (typeof metadata.replicateId === "string"
          ? metadata.replicateId.trim()
          : "");
        if (
          !payload.modelName?.trim() ||
          typeof metadata.provider !== "string" || !metadata.provider.trim() ||
          typeof metadata.modelSnapshot !== "string" || !metadata.modelSnapshot.trim() ||
          typeof metadata.apiVersion !== "string" || !metadata.apiVersion.trim() ||
          typeof metadata.controllerVersion !== "string" || !metadata.controllerVersion.trim() ||
          metadata.contextPolicy !== "persistent" ||
          !["high", "auto", "original"].includes(String(metadata.imageDetail ?? "")) ||
          typeof metadata.promptSha256 !== "string" ||
          metadata.promptSha256.toLowerCase() !== M1_AGENT_PROMPT_SHA256 ||
          typeof metadata.runtimePromptPackageSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(metadata.runtimePromptPackageSha256) ||
          typeof metadata.controllerArtifactSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(metadata.controllerArtifactSha256) ||
          metadata.browserEngine !== "Chrome" ||
          typeof metadata.browserMajor !== "number" || !Number.isInteger(metadata.browserMajor) || metadata.browserMajor < 100 ||
          !replicateId || replicateId.length > 64 ||
          (metadata.temperature !== null && metadata.temperature !== undefined &&
            (typeof metadata.temperature !== "number" || !Number.isFinite(metadata.temperature) || metadata.temperature < 0 || metadata.temperature > 10)) ||
          (metadata.topP !== null && metadata.topP !== undefined &&
            (typeof metadata.topP !== "number" || !Number.isFinite(metadata.topP) || metadata.topP < 0 || metadata.topP > 1)) ||
          (metadata.seed !== null && metadata.seed !== undefined &&
            (typeof metadata.seed !== "number" || !Number.isInteger(metadata.seed) || metadata.seed < 0 || metadata.seed > 2_147_483_647))
        ) {
          return Response.json({ error: "Agent reproducibility metadata is incomplete" }, { status: 400 });
        }
        const canonicalProfile = canonicalM1AgentProfile(payload.modelName, metadata);
        if (!validM1AgentProfile(canonicalProfile)) {
          return Response.json({ error: "Agent cohort profile is invalid" }, { status: 400 });
        }
        const computedAgentProfileSha256 = await hashM1AgentProfile(payload.modelName, metadata);
        if (
          assignedAllocationMode === "balanced-random-v1" &&
          computedAgentProfileSha256 !== assignedAgentProfileSha256
        ) {
          return Response.json(
            { error: "Agent metadata does not match the cohort-level frozen profile", code: "AGENT_PROFILE_MISMATCH" },
            { status: 409 },
          );
        }
        normalizedAgentMetadata = { ...metadata, replicateId, agentProfileSha256: computedAgentProfileSha256 };
      }
      storedStudyConfig = {
        ...rawStudyConfig,
        ...(normalizedAgentMetadata ? { agentMetadata: normalizedAgentMetadata } : {}),
        protocolArchitecture: M1_PROTOCOL_VERSION,
        cohortId: M1_COHORT_ID,
        studyPhase: M1_STUDY_PHASE,
        preregistrationVersion: M1_PREREGISTRATION_VERSION,
        analysisSetVersion: M1_ANALYSIS_SET_VERSION,
        implementationBuildId: M1_IMPLEMENTATION_BUILD_ID,
        deploymentId: assignedDeploymentId,
        deploymentFingerprintSha256: assignedDeploymentFingerprintSha256,
        allocationMode: assignedAllocationMode ?? "quota-manual",
        agentProfileSha256: assignedAgentProfileSha256,
        primaryBrowserMajor: assignedPrimaryBrowserMajor,
        pairId,
        informationCondition: condition,
        scheduleId,
        module: "disclosure",
        taskType: "T2",
        metric: "price",
        resolution: "weekly",
        scaleMode: "linear",
        windowMode: "whole",
        disclosureFlowOrder: "disclosure-major",
        layerPresentation: "sequential-single-asset-pages-v1",
        responseVersion: M1_PROTOCOL_VERSION,
        initialBoundaryPolicy: "common-tertile-anchors-adjustment-v1",
        initialBoundaryRatios: [1 / 3, 2 / 3],
        nominalDisclosureSequence: [...M1_DISCLOSURE_KEYS],
        presentedDisclosureSequence: canonicalPlan[0]?.disclosures ?? [],
        stimulusBundle: M1_STIMULUS_BUNDLE,
        stimulusSha256: M1_STIMULUS_SHA256,
        eventSourceSha256: M1_EVENT_SOURCE_SHA256,
        randomizedPlan: canonicalPlan,
      };
    }

    const deviceInfo = payload.deviceInfo ?? {};
    const deviceType = DEVICE_TYPES.has(deviceInfo.deviceType ?? "")
      ? deviceInfo.deviceType!
      : "unknown";
    const pointerType = POINTER_TYPES.has(deviceInfo.pointerType ?? "")
      ? deviceInfo.pointerType!
      : "unknown";
    const viewportWidth = optionalDimension(deviceInfo.viewportWidth);
    const viewportHeight = optionalDimension(deviceInfo.viewportHeight);
    const devicePixelRatio = optionalRatio(deviceInfo.devicePixelRatio);
    const screenOrientation = (deviceInfo.orientation ?? "unknown").trim().slice(0, 40) || "unknown";
    if (isStrictM1Arm(experimentalArm)) {
      const protocolDeviationCodes = [
        ...(deviceType === "desktop" ? [] : ["non_desktop_device"]),
        ...(viewportWidth === 1440 && viewportHeight === 900 ? [] : ["viewport_not_1440x900"]),
        ...(devicePixelRatio === 1 ? [] : ["dpr_not_1"]),
        ...(pointerType === "fine" ? [] : ["pointer_not_fine"]),
        ...(screenOrientation.startsWith("landscape") ? [] : ["orientation_not_landscape"]),
        ...(assignedAllocationMode === "balanced-random-v1" && chromeBrowserMajor(deviceInfo.userAgent) !== assignedPrimaryBrowserMajor
          ? ["chrome_major_not_frozen"]
          : []),
      ];
      storedStudyConfig = {
        ...storedStudyConfig,
        primaryProtocolEligible: protocolDeviationCodes.length === 0,
        protocolDeviationCodes,
        measuredVisualProtocol: {
          deviceType,
          viewportWidth,
          viewportHeight,
          devicePixelRatio,
          pointerType,
          screenOrientation,
        },
      };
      if (
        (experimentalArm === "m1-main" || experimentalArm === "agent-m1-main") &&
        assignedAllocationMode === "balanced-random-v1" &&
        protocolDeviationCodes.length > 0
      ) {
        return Response.json(
          {
            error: "Primary M1 requires the frozen desktop visual environment",
            code: "PRIMARY_DEVICE_INELIGIBLE",
            protocolDeviationCodes,
          },
          { status: 422 },
        );
      }
    }

    const studyConfigJson = JSON.stringify(storedStudyConfig);
    if (studyConfigJson.length > 30000) {
      return Response.json({ error: "Study configuration is too large" }, { status: 400 });
    }

    const touchPoints =
      typeof deviceInfo.touchPoints === "number" &&
      Number.isInteger(deviceInfo.touchPoints) &&
      deviceInfo.touchPoints >= 0 &&
      deviceInfo.touchPoints <= 100
        ? deviceInfo.touchPoints
        : 0;
    const sessionMaterialization: SessionMaterialization = {
      id: sessionId,
      actorType,
      participantCode: (assignedParticipantCode ?? payload.participantCode ?? "").trim().slice(0, 64),
      expertise,
      experimentalArm,
      protocolVersion: protocolVersion.slice(0, 80),
      studyConfigJson,
      modelName: payload.modelName?.trim().slice(0, 120) || null,
      deviceType,
      userAgent: isStrictM1Arm(experimentalArm)
        ? summarizeBrowserEnvironment(deviceInfo.userAgent)
        : (deviceInfo.userAgent ?? "").trim().slice(0, 600),
      clientPlatform: (deviceInfo.platform ?? "").trim().slice(0, 120),
      browserLanguage: (deviceInfo.browserLanguage ?? "").trim().slice(0, 40),
      clientTimezone: (deviceInfo.timezone ?? "").trim().slice(0, 80),
      screenWidth: optionalDimension(deviceInfo.screenWidth),
      screenHeight: optionalDimension(deviceInfo.screenHeight),
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      touchPoints,
      pointerType,
      screenOrientation,
      status: isStrictM1Arm(experimentalArm) ? "initializing" : "active",
    };

    let pairSlot: {
      pairId: string;
      actorType: "human" | "agent";
      replicateId: string;
      launchTokenHash: string;
    } | null = null;
    if (experimentalArm === "m1-main" || experimentalArm === "agent-m1-main") {
      const pairId = String(storedStudyConfig.pairId);
      if (!assignedAllocationMode) {
        return Response.json({ error: "M1 pair slots require a frozen assignment" }, { status: 409 });
      }
      const replicateId = actorType === "human"
        ? "human-primary"
        : String(record(storedStudyConfig.agentMetadata).replicateId ?? "");
      if (!launchTokenHash) {
        return Response.json({ error: "M1 pair slots require an opaque launch token" }, { status: 400 });
      }
      pairSlot = {
        pairId,
        actorType: actorType as "human" | "agent",
        replicateId,
        launchTokenHash,
      };
    }
    const disclosureFlowOrder = storedStudyConfig.disclosureFlowOrder === "asset-major"
      ? "asset-major"
      : "disclosure-major";
    const expectedRows = expectedRowsFromPlan(sessionId, storedStudyConfig.randomizedPlan, disclosureFlowOrder);
    if (isStrictM1Arm(experimentalArm) && expectedRows.length !== 42) {
      return Response.json({ error: "Canonical M1 plan must contain exactly 42 steps" }, { status: 400 });
    }
    if (pairSlot && launchTokenHash) {
      const canonicalPlan = buildM1ProtocolPlan(
        Number(storedStudyConfig.scheduleId),
        String(storedStudyConfig.informationCondition) === "repeat-control"
          ? "repeat-control"
          : "staged",
      );
      const slot: PairSlotMaterialization = {
        id: crypto.randomUUID(),
        pairId: pairSlot.pairId,
        actorType: pairSlot.actorType,
        replicateId: pairSlot.replicateId,
        launchTokenHash,
        sessionId,
      };
      const recoverClaimed = async (claimedSessionId: string) => {
        try {
          const recovered = await recoverStrictM1Session(
            claimedSessionId,
            sessionMaterialization,
            slot,
            canonicalPlan,
          );
          return Response.json({
            session: {
              id: recovered.verifiedSession.id,
              startedAt: recovered.verifiedSession.startedAt,
            },
            plan: canonicalPlan,
            assignment: {
              scheduleId: storedStudyConfig.scheduleId,
              informationCondition: storedStudyConfig.informationCondition,
            },
            expectedResponseCount: recovered.expectedRows.length,
            idempotent: true,
          });
        } catch (error) {
          if (error instanceof M1SessionRecoveryError) {
            return Response.json(
              { error: error.message, code: error.code },
              { status: 409 },
            );
          }
          throw error;
        }
      };
      const [latestToken] = await getDb()
        .select({
          claimedSessionId: m1LaunchTokens.claimedSessionId,
          revokedAt: m1LaunchTokens.revokedAt,
        })
        .from(m1LaunchTokens)
        .where(eq(m1LaunchTokens.tokenHash, launchTokenHash))
        .limit(1);
      if (!latestToken || latestToken.revokedAt) {
        return Response.json({ error: "M1 launch token is invalid or revoked" }, { status: 403 });
      }
      if (latestToken.claimedSessionId) {
        return recoverClaimed(latestToken.claimedSessionId);
      }

      try {
        await createStrictM1SessionAtomically(sessionMaterialization, slot, expectedRows);
      } catch (writeError) {
        // A concurrent retry may have won the token. In that case return the
        // winner's exact session instead of exposing a transient 409/500.
        const [racedToken] = await getDb()
          .select({
            claimedSessionId: m1LaunchTokens.claimedSessionId,
            revokedAt: m1LaunchTokens.revokedAt,
          })
          .from(m1LaunchTokens)
          .where(eq(m1LaunchTokens.tokenHash, launchTokenHash))
          .limit(1);
        if (racedToken?.claimedSessionId && !racedToken.revokedAt) {
          return recoverClaimed(racedToken.claimedSessionId);
        }
        const [occupiedSlot] = await getDb()
          .select({ sessionId: m1PairSlots.sessionId })
          .from(m1PairSlots)
          .where(and(
            eq(m1PairSlots.pairId, pairSlot.pairId),
            eq(m1PairSlots.actorType, pairSlot.actorType),
            eq(m1PairSlots.replicateId, pairSlot.replicateId),
          ))
          .limit(1);
        if (occupiedSlot) {
          return Response.json(
            {
              error: pairSlot.actorType === "human"
                ? "This M1 pair already has a Human session"
                : "This M1 pair and Agent replicate ID already have a session",
              code: "PAIR_SLOT_ALREADY_CLAIMED",
            },
            { status: 409 },
          );
        }
        throw writeError;
      }
      try {
        const verifiedSession = await verifyStrictM1Materialization(
          sessionMaterialization,
          slot,
          expectedRows,
          canonicalPlan,
        );
        return Response.json(
          {
            session: { id: verifiedSession.id, startedAt: verifiedSession.startedAt },
            plan: canonicalPlan,
            assignment: {
              scheduleId: storedStudyConfig.scheduleId,
              informationCondition: storedStudyConfig.informationCondition,
            },
            expectedResponseCount: expectedRows.length,
          },
          { status: 201 },
        );
      } catch (error) {
        if (error instanceof M1SessionRecoveryError) {
          return Response.json(
            { error: error.message, code: error.code },
            { status: 500 },
          );
        }
        throw error;
      }
    }
    const [session] = await getDb()
      .insert(experimentSessions)
      .values(sessionMaterialization)
      .returning({ id: experimentSessions.id, startedAt: experimentSessions.startedAt });
    if (expectedRows.length) {
      try {
        await ensureExpectedRows(expectedRows);
      } catch (error) {
        await getDb().delete(experimentSessions).where(eq(experimentSessions.id, sessionId));
        throw error;
      }
    }
    if (isStrictM1Arm(experimentalArm)) {
      await getDb()
        .update(experimentSessions)
        .set({ status: "active" })
        .where(and(eq(experimentSessions.id, sessionId), eq(experimentSessions.status, "initializing")));
    }
    return Response.json(
      {
        session,
        plan: storedStudyConfig.randomizedPlan ?? null,
        assignment: isStrictM1Arm(experimentalArm) ? {
          scheduleId: storedStudyConfig.scheduleId,
          informationCondition: storedStudyConfig.informationCondition,
          allocationMode: storedStudyConfig.allocationMode,
        } : null,
        expectedResponseCount: expectedRows.length,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const sessionId = requestUrl.searchParams.get("sessionId")?.trim();
    if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });
    await ensureExperimentSchema();
    const [session] = await getDb()
      .select()
      .from(experimentSessions)
      .where(eq(experimentSessions.id, sessionId))
      .limit(1);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    if (isStrictM1Arm(session.experimentalArm)) {
      const launchToken = requestUrl.searchParams.get("launch")?.trim() ?? "";
      if (!SHA256.test(launchToken)) {
        return Response.json({ error: "A valid launch token is required to resume this M1 session" }, { status: 403 });
      }
      const launchTokenHash = await hashM1LaunchToken(launchToken);
      const [matchingLaunch] = await getDb()
        .select({ tokenHash: m1LaunchTokens.tokenHash })
        .from(m1LaunchTokens)
        .where(and(
          eq(m1LaunchTokens.tokenHash, launchTokenHash),
          eq(m1LaunchTokens.claimedSessionId, session.id),
          eq(m1LaunchTokens.actorType, session.actorType),
        ))
        .limit(1);
      if (!matchingLaunch) {
        return Response.json({ error: "The launch token does not belong to this M1 session" }, { status: 403 });
      }
    }
    const responses = await getDb()
      .select()
      .from(modularResponses)
      .where(eq(modularResponses.sessionId, sessionId))
      .orderBy(asc(modularResponses.disclosureIndex), asc(modularResponses.trialOrder));
    const expected = await getDb()
      .select({ stepOrder: experimentExpectedSteps.stepOrder })
      .from(experimentExpectedSteps)
      .where(eq(experimentExpectedSteps.sessionId, sessionId));
    let studyConfig: unknown = {};
    try { studyConfig = JSON.parse(session.studyConfigJson); } catch { studyConfig = {}; }
    return Response.json({
      session: {
        id: session.id,
        actorType: session.actorType,
        participantCode: session.participantCode,
        experimentalArm: session.experimentalArm,
        protocolVersion: session.protocolVersion,
        status: session.status,
        startedAt: session.startedAt,
        practiceCompletedAt: session.practiceCompletedAt,
        completedAt: session.completedAt,
        terminationCode: session.terminationCode,
        studyConfig,
      },
      progress: {
        responseCount: responses.length,
        expectedResponseCount: expected.length,
        nextStepOrder: Math.min(responses.length, expected.length),
        complete: session.status === "complete",
      },
      responses,
    });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as { sessionId?: string; action?: string; reason?: string };
    if (!payload.sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }
    await ensureExperimentSchema();
    const [session] = await getDb()
      .select({
        id: experimentSessions.id,
        status: experimentSessions.status,
        experimentalArm: experimentSessions.experimentalArm,
        studyConfigJson: experimentSessions.studyConfigJson,
        practiceCompletedAt: experimentSessions.practiceCompletedAt,
        startedAt: experimentSessions.startedAt,
        terminationCode: experimentSessions.terminationCode,
      })
      .from(experimentSessions)
      .where(eq(experimentSessions.id, payload.sessionId))
      .limit(1);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    let protocolArchitecture = "";
    let sessionConfig: Record<string, unknown> = {};
    try {
      sessionConfig = JSON.parse(session.studyConfigJson) as Record<string, unknown>;
      protocolArchitecture = String(sessionConfig.protocolArchitecture ?? "");
    } catch {
      protocolArchitecture = "";
    }
    const isStrictM1Session = isStrictM1Arm(session.experimentalArm) &&
      protocolArchitecture === M1_PROTOCOL_VERSION;
    if (isStrictM1Session && session.status === "active") {
      const [runClock] = await getDb()
        .select({
          elapsedSeconds: sql<number>`unixepoch('now') - unixepoch(${experimentSessions.startedAt})`,
        })
        .from(experimentSessions)
        .where(eq(experimentSessions.id, payload.sessionId))
        .limit(1);
      if ((runClock?.elapsedSeconds ?? M1_FULL_RUN_LIMIT_SECONDS + 1) > M1_FULL_RUN_LIMIT_SECONDS) {
        await getDb()
          .update(experimentSessions)
          .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "RUN_TIME_LIMIT_EXCEEDED" })
          .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
        return Response.json(
          { error: "The frozen 120-minute session limit was exceeded", code: "RUN_TIME_LIMIT_EXCEEDED" },
          { status: 409 },
        );
      }
    }
    if (payload.action === "abort") {
      const terminationCode = EXPLICIT_TERMINATION_CODES.get(payload.reason ?? "");
      if (!terminationCode) {
        return Response.json({ error: "A recognized termination reason is required" }, { status: 400 });
      }
      if (session.status === "complete") {
        return Response.json({ error: "A completed session cannot be aborted" }, { status: 409 });
      }
      if (session.status === "active") {
        await getDb()
          .update(experimentSessions)
          .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode })
          .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
      }
      return Response.json({ ok: true, status: "aborted", terminationCode: session.terminationCode || terminationCode });
    }
    if (isStrictM1Session) {
      const collectionGateResponse = m1SessionMutationGateResponse(session.experimentalArm, sessionConfig);
      if (collectionGateResponse) return collectionGateResponse;
    }
    if (payload.action === "practice-complete") {
      if (session.status !== "active") {
        return Response.json({ error: "Practice can only be completed for an active session" }, { status: 409 });
      }
      if (!session.practiceCompletedAt) {
        await getDb()
          .update(experimentSessions)
          .set({ practiceCompletedAt: new Date().toISOString() })
          .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
      }
      return Response.json({ ok: true, practiceCompleted: true });
    }
    if (session.status !== "active" && session.status !== "complete") {
      return Response.json(
        { error: "Only an active session can be completed", code: "SESSION_NOT_ACTIVE" },
        { status: 409 },
      );
    }

    let expected = await getDb()
      .select()
      .from(experimentExpectedSteps)
      .where(eq(experimentExpectedSteps.sessionId, payload.sessionId))
      .orderBy(asc(experimentExpectedSteps.stepOrder));
    // Backfill expected steps for valid sessions created before this integrity
    // table existed. Empty or malformed plans deliberately remain uncompletable.
    if (expected.length === 0) {
      let legacyPlan: unknown = null;
      try {
        const legacyConfig = JSON.parse(session.studyConfigJson) as Record<string, unknown>;
        legacyPlan = legacyConfig.randomizedPlan;
      } catch {
        legacyPlan = null;
      }
      let legacyFlowOrder: "disclosure-major" | "asset-major" = "disclosure-major";
      try {
        const legacyConfig = JSON.parse(session.studyConfigJson) as Record<string, unknown>;
        legacyFlowOrder = legacyConfig.disclosureFlowOrder === "asset-major" ? "asset-major" : "disclosure-major";
      } catch {
        legacyFlowOrder = "disclosure-major";
      }
      const backfill = expectedRowsFromPlan(payload.sessionId, legacyPlan, legacyFlowOrder);
      if (backfill.length) {
        await insertExpectedRows(backfill);
        expected = await getDb()
          .select()
          .from(experimentExpectedSteps)
          .where(eq(experimentExpectedSteps.sessionId, payload.sessionId))
          .orderBy(asc(experimentExpectedSteps.stepOrder));
      }
    }
    const responses = await getDb()
      .select()
      .from(modularResponses)
      .where(eq(modularResponses.sessionId, payload.sessionId));
    const expectedResponseCount = expected.length;
    const responseCount = responses.length;
    if (expectedResponseCount === 0) {
      return Response.json({ error: "Session has no valid expected-step plan" }, { status: 409 });
    }
    const responseKeys = new Set(responses.map(exactStepKey));
    const missingStepOrders = expected
      .filter((step) => !responseKeys.has(exactStepKey(step)))
      .map((step) => step.stepOrder);
    if (responseCount !== expectedResponseCount || missingStepOrders.length) {
      return Response.json(
        {
          error: "Session responses are incomplete or do not match the assigned plan",
          responseCount,
          expectedResponseCount,
          missingStepOrders,
        },
        { status: 409 },
      );
    }

    if (isStrictM1Session) {
      const serverExposureAudit = await getD1()
        .prepare(`SELECT
            expected.step_order AS step_order,
            exposure.started_at AS exposure_started_at,
            response.created_at AS response_created_at,
            CAST((julianday(response.created_at) - julianday(exposure.started_at)) * 86400000 AS INTEGER) AS server_elapsed_ms
          FROM experiment_expected_steps AS expected
          LEFT JOIN experiment_step_exposures AS exposure
            ON exposure.session_id = expected.session_id
            AND exposure.step_order = expected.step_order
          LEFT JOIN modular_responses AS response
            ON response.session_id = expected.session_id
            AND response.trial_id = expected.trial_id
            AND response.disclosure_index = expected.disclosure_index
          WHERE expected.session_id = ?
          ORDER BY expected.step_order`)
        .bind(payload.sessionId)
        .all<{
          step_order: number;
          exposure_started_at: string | null;
          response_created_at: string | null;
          server_elapsed_ms: number | null;
        }>();
      const invalidServerClockStepOrders = serverExposureAudit.results
        .filter((row) =>
          !row.exposure_started_at ||
          !row.response_created_at ||
          row.server_elapsed_ms === null ||
          row.server_elapsed_ms < 0 ||
          row.server_elapsed_ms > M1_FORMAL_PAGE_LIMIT_MS)
        .map((row) => row.step_order);
      if (invalidServerClockStepOrders.length) {
        await getDb()
          .update(experimentSessions)
          .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "SERVER_PAGE_CLOCK_INVALID" })
          .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
        return Response.json(
          {
            error: "One or more formal pages are missing a valid server-issued clock",
            code: "SERVER_PAGE_CLOCK_INVALID",
            invalidServerClockStepOrders,
          },
          { status: 409 },
        );
      }
      const invalidDurationStepOrders = expected
        .filter((step) => {
          const response = responses.find((candidate) => exactStepKey(candidate) === exactStepKey(step));
          return !response || strictM1ResponseDurationViolation({
            elapsedMs: response.elapsedMs,
            activeElapsedMs: response.activeElapsedMs,
            clientStartedAt: response.clientStartedAt,
            clientSubmittedAt: response.clientSubmittedAt,
          });
        })
        .map((step) => step.stepOrder);
      if (invalidDurationStepOrders.length) {
        await getDb()
          .update(experimentSessions)
          .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "FORMAL_PAGE_TIME_LIMIT" })
          .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
        return Response.json(
          {
            error: "One or more formal pages violate the frozen 180-second limit",
            code: "FORMAL_PAGE_TIME_LIMIT",
            invalidDurationStepOrders,
          },
          { status: 409 },
        );
      }
    }
    if (session.experimentalArm === "agent-m1-main" && protocolArchitecture === M1_PROTOCOL_VERSION) {
      const allAttempts = await getDb()
        .select()
        .from(agentRunAttempts)
        .where(eq(agentRunAttempts.sessionId, payload.sessionId))
        .orderBy(asc(agentRunAttempts.stepOrder), asc(agentRunAttempts.attemptNumber));
      const attemptsByStep = new Map<number, M1AttemptLedgerRow[]>();
      for (const attempt of allAttempts as M1AttemptLedgerRow[]) {
        const rows = attemptsByStep.get(attempt.stepOrder) ?? [];
        rows.push(attempt);
        attemptsByStep.set(attempt.stepOrder, rows);
      }
      const responsesByKey = new Map(responses.map((response) => [exactStepKey(response), response]));
      const missingAttemptStepOrders: number[] = [];
      const invalidAttemptStepOrders: number[] = [];
      for (const step of expected) {
        const ledger = attemptsByStep.get(step.stepOrder) ?? [];
        const response = responsesByKey.get(exactStepKey(step));
        if (!ledger.length) {
          missingAttemptStepOrders.push(step.stepOrder);
          continue;
        }
        const validation = validateM1AttemptLedger(ledger);
        const attempt = ledger.find((candidate) => candidate.status === "submitted");
        if (!response || !validation.ok || validation.terminalAbortCode || !m1AttemptLedgerIsSubmitted(ledger) || !attempt) {
          invalidAttemptStepOrders.push(step.stepOrder);
          continue;
        }
        const expectedHash = await hashM1ScientificResponse({
          sessionId: response.sessionId,
          stepOrder: step.stepOrder,
          trialId: response.trialId,
          disclosureIndex: response.disclosureIndex,
          boundariesJson: response.boundariesJson,
          previousBoundariesJson: response.previousBoundariesJson,
          boundaryIntervalsJson: response.boundaryIntervalsJson,
          influenceRating: response.influenceRating,
          noChangeConfirmed: response.noChangeConfirmed,
          singleStageConfirmed: response.singleStageConfirmed,
        });
        if (
          attempt.responseId !== response.id ||
          attempt.responseSha256 !== expectedHash ||
          !attempt.modelRequestId ||
          !SHA256.test(attempt.actionTraceSha256)
        ) {
          invalidAttemptStepOrders.push(step.stepOrder);
        }
      }
      const unexpectedAttemptStepOrders = [...attemptsByStep.keys()]
        .filter((stepOrder) => !expected.some((step) => step.stepOrder === stepOrder));
      if (missingAttemptStepOrders.length || invalidAttemptStepOrders.length || unexpectedAttemptStepOrders.length) {
        return Response.json(
          {
            error: "Agent session attempts are missing, unlinked, or inconsistent with saved responses",
            code: "AGENT_ATTEMPTS_INCOMPLETE",
            missingAttemptStepOrders,
            invalidAttemptStepOrders,
            unexpectedAttemptStepOrders,
          },
          { status: 409 },
        );
      }
    }

    if (session.status !== "complete") {
      const completion = isStrictM1Session
        ? await getD1()
          .prepare(`UPDATE experiment_sessions
            SET status = 'complete', completed_at = CURRENT_TIMESTAMP, termination_code = ''
            WHERE id = ? AND status = 'active'
              AND unixepoch('now') - unixepoch(started_at) <= ?`)
          .bind(payload.sessionId, M1_FULL_RUN_LIMIT_SECONDS)
          .run()
        : await getD1()
          .prepare(`UPDATE experiment_sessions
            SET status = 'complete', completed_at = CURRENT_TIMESTAMP, termination_code = ''
            WHERE id = ? AND status = 'active'`)
          .bind(payload.sessionId)
          .run();
      if (completion.meta.changes !== 1) {
        const [current] = await getDb()
          .select({ status: experimentSessions.status })
          .from(experimentSessions)
          .where(eq(experimentSessions.id, payload.sessionId))
          .limit(1);
        if (current?.status !== "complete") {
          if (!isStrictM1Session) {
            return Response.json({ error: "Session completion changed concurrently" }, { status: 409 });
          }
          await getDb()
            .update(experimentSessions)
            .set({ status: "aborted", completedAt: new Date().toISOString(), terminationCode: "RUN_TIME_LIMIT_EXCEEDED" })
            .where(and(eq(experimentSessions.id, payload.sessionId), eq(experimentSessions.status, "active")));
          return Response.json(
            { error: "The frozen 120-minute session limit was exceeded", code: "RUN_TIME_LIMIT_EXCEEDED" },
            { status: 409 },
          );
        }
      }
    }
    return Response.json({ ok: true, responseCount, expectedResponseCount });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}
