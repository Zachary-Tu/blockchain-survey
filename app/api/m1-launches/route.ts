import { env } from "cloudflare:workers";
import { ensureExperimentSchema, getD1 } from "@/db";
import {
  hashM1LaunchToken,
  isM1PreStartTerminalDisposition,
} from "@/lib/m1-launch";
import {
  m1CollectionGateFailure,
  m1SessionMutationGateResponse,
} from "@/lib/m1-collection-gates";
import {
  M1_ANALYSIS_SET_VERSION,
  M1_COHORT_ID,
  M1_EVENT_SOURCE_SHA256,
  M1_IMPLEMENTATION_BUILD_ID,
  M1_PREREGISTRATION_VERSION,
  M1_PROTOCOL_VERSION,
  M1_STUDY_PHASE,
  M1_STIMULUS_SHA256,
} from "@/lib/m1-protocol";

type InformationCondition = "staged" | "repeat-control";

type AssignmentRow = {
  pair_id: string;
  protocol_architecture: string;
  schedule_id: number;
  information_condition: InformationCondition;
  stimulus_sha256: string;
  event_source_sha256: string;
  assignment_version: string;
  cohort_id: string;
  study_phase: string;
  preregistration_version: string;
  analysis_set_version: string;
  implementation_build_id: string;
  deployment_id: string;
  deployment_fingerprint_sha256: string;
  allocation_mode: string;
  agent_profile_sha256: string;
  primary_browser_major: number;
};

type LaunchTerminalRow = {
  token_hash: string;
  actor_type: string;
  claimed_session_id: string | null;
  revoked_at: string | null;
  terminal_disposition: string | null;
  terminal_at: string | null;
  allocation_mode: string;
  deployment_id: string;
  deployment_fingerprint_sha256: string;
};

function researcherEmails() {
  const value = (env as Cloudflare.Env & { RESEARCHER_EMAILS?: string }).RESEARCHER_EMAILS;
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function researchAuthorizationFailure(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return Response.json({ error: "Researcher sign-in is required" }, { status: 401 });
  const allowed = researcherEmails();
  if (allowed.size === 0) {
    return Response.json({ error: "Researcher allowlist is not configured" }, { status: 503 });
  }
  if (!allowed.has(email)) return Response.json({ error: "Researcher access denied" }, { status: 403 });
  return null;
}

export async function POST(request: Request) {
  const authorizationFailure = researchAuthorizationFailure(request);
  if (authorizationFailure) return authorizationFailure;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const pairId = typeof payload.pairId === "string" ? payload.pairId.trim() : "";
    const humanCode = typeof payload.humanCode === "string" ? payload.humanCode.trim() : "";
    const agentCode = typeof payload.agentCode === "string" ? payload.agentCode.trim() : "";
    const agentReplicateId = typeof payload.agentReplicateId === "string" ? payload.agentReplicateId.trim() : "";
    const requestedScheduleId = Number(payload.scheduleId);
    const requestedCondition = payload.informationCondition;
    const allocationMode = payload.allocationMode === "quota-manual"
      ? "quota-manual"
      : "balanced-random-v1";
    // A balanced launch provisions a Human+Agent pair, so use the Human arm
    // to require both formal gates. Diagnostic quota mode is mutually
    // exclusive with every formal collection gate.
    const collectionGateFailure = m1CollectionGateFailure(
      allocationMode === "balanced-random-v1" ? "m1-main" : "pilot-m1",
      allocationMode,
    );
    if (collectionGateFailure) return Response.json(collectionGateFailure, { status: 503 });
    const configuredAgentProfileSha256 = String(
      (env as Cloudflare.Env & { M1_AGENT_PROFILE_SHA256?: string }).M1_AGENT_PROFILE_SHA256 ?? "",
    ).trim().toLowerCase();
    const configuredPrimaryBrowserMajor = Number(
      (env as Cloudflare.Env & { M1_PRIMARY_CHROME_MAJOR?: string }).M1_PRIMARY_CHROME_MAJOR ?? 0,
    );
    const configuredDeploymentId = String(
      (env as Cloudflare.Env & { M1_DEPLOYMENT_ID?: string }).M1_DEPLOYMENT_ID ?? "",
    ).trim();
    const configuredDeploymentFingerprintSha256 = String(
      (env as Cloudflare.Env & { M1_DEPLOYMENT_FINGERPRINT_SHA256?: string }).M1_DEPLOYMENT_FINGERPRINT_SHA256 ?? "",
    ).trim().toLowerCase();
    if (
      !pairId || pairId.length > 64 ||
      !humanCode || humanCode.length > 64 ||
      !agentCode || agentCode.length > 64 ||
      !agentReplicateId || agentReplicateId.length > 64 ||
      (allocationMode === "balanced-random-v1" && agentReplicateId !== "R-PRIMARY") ||
      (allocationMode === "quota-manual" && (
        !Number.isInteger(requestedScheduleId) || requestedScheduleId < 1 || requestedScheduleId > 6 ||
        (requestedCondition !== "staged" && requestedCondition !== "repeat-control")
      ))
    ) {
      return Response.json({ error: "Invalid M1 launch assignment" }, { status: 400 });
    }
    if (
      allocationMode === "balanced-random-v1" &&
      (!/^[a-f0-9]{64}$/.test(configuredAgentProfileSha256) ||
        !Number.isInteger(configuredPrimaryBrowserMajor) || configuredPrimaryBrowserMajor < 100 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(configuredDeploymentId) ||
        !/^[a-f0-9]{64}$/.test(configuredDeploymentFingerprintSha256))
    ) {
      return Response.json(
        {
          error: "The cohort-level Agent profile, browser, and deployment fingerprint are not frozen",
          code: "M1_PRIMARY_PROFILE_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }
    const agentProfileSha256 = allocationMode === "balanced-random-v1" ? configuredAgentProfileSha256 : "";
    const primaryBrowserMajor = allocationMode === "balanced-random-v1" ? configuredPrimaryBrowserMajor : 0;
    const deploymentId = configuredDeploymentId || "diagnostic-unfrozen";
    const deploymentFingerprintSha256 = configuredDeploymentFingerprintSha256;

    await ensureExperimentSchema();
    const d1 = getD1();
    const humanToken = randomToken();
    const agentToken = randomToken();
    const [humanTokenHash, agentTokenHash] = await Promise.all([
      hashM1LaunchToken(humanToken),
      hashM1LaunchToken(agentToken),
    ]);

    // This marker is visible only inside the atomic batch. It lets the token
    // inserts distinguish the assignment created by this request from a
    // pre-existing pair with the same ID, without adding schema state.
    const pendingAssignmentVersion = `pending:${crypto.randomUUID()}`;
    const assignmentInsert = allocationMode === "quota-manual"
      ? d1.prepare(`INSERT INTO m1_pair_assignments (
          pair_id,
          protocol_architecture,
          schedule_id,
          information_condition,
          stimulus_sha256,
          event_source_sha256,
          assignment_version,
          cohort_id,
          study_phase,
          preregistration_version,
          analysis_set_version,
          implementation_build_id,
          deployment_id,
          deployment_fingerprint_sha256,
          allocation_mode,
          agent_profile_sha256,
          primary_browser_major
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM m1_pair_assignments WHERE pair_id = ?
        )`).bind(
          pairId,
          M1_PROTOCOL_VERSION,
          requestedScheduleId,
          requestedCondition,
          M1_STIMULUS_SHA256,
          M1_EVENT_SOURCE_SHA256,
          pendingAssignmentVersion,
          M1_COHORT_ID,
          M1_STUDY_PHASE,
          M1_PREREGISTRATION_VERSION,
          M1_ANALYSIS_SET_VERSION,
          M1_IMPLEMENTATION_BUILD_ID,
          deploymentId,
          deploymentFingerprintSha256,
          allocationMode,
          agentProfileSha256,
          primaryBrowserMajor,
          pairId,
        )
      : d1.prepare(`WITH cells(information_condition, schedule_id) AS (
          VALUES
            ('staged', 1), ('staged', 2), ('staged', 3),
            ('staged', 4), ('staged', 5), ('staged', 6),
            ('repeat-control', 1), ('repeat-control', 2), ('repeat-control', 3),
            ('repeat-control', 4), ('repeat-control', 5), ('repeat-control', 6)
        ),
        cell_counts AS (
          SELECT
            cells.information_condition,
            cells.schedule_id,
            COUNT(assignments.pair_id) AS assignment_count
          FROM cells
          LEFT JOIN m1_pair_assignments AS assignments
            ON assignments.information_condition = cells.information_condition
            AND assignments.schedule_id = cells.schedule_id
            AND assignments.cohort_id = ?
            AND assignments.allocation_mode = 'balanced-random-v1'
          GROUP BY cells.information_condition, cells.schedule_id
        ),
        selected AS (
          SELECT information_condition, schedule_id
          FROM cell_counts
          ORDER BY assignment_count ASC, random()
          LIMIT 1
        )
        INSERT INTO m1_pair_assignments (
          pair_id,
          protocol_architecture,
          schedule_id,
          information_condition,
          stimulus_sha256,
          event_source_sha256,
          assignment_version,
          cohort_id,
          study_phase,
          preregistration_version,
          analysis_set_version,
          implementation_build_id,
          deployment_id,
          deployment_fingerprint_sha256,
          allocation_mode,
          agent_profile_sha256,
          primary_browser_major
        )
        SELECT ?, ?, selected.schedule_id, selected.information_condition, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM selected
        WHERE (SELECT SUM(assignment_count) FROM cell_counts) < 12
          AND NOT EXISTS (
          SELECT 1 FROM m1_pair_assignments WHERE pair_id = ?
        )`).bind(
          M1_COHORT_ID,
          pairId,
          M1_PROTOCOL_VERSION,
          M1_STIMULUS_SHA256,
          M1_EVENT_SOURCE_SHA256,
          pendingAssignmentVersion,
          M1_COHORT_ID,
          M1_STUDY_PHASE,
          M1_PREREGISTRATION_VERSION,
          M1_ANALYSIS_SET_VERSION,
          M1_IMPLEMENTATION_BUILD_ID,
          deploymentId,
          deploymentFingerprintSha256,
          allocationMode,
          agentProfileSha256,
          primaryBrowserMajor,
          pairId,
        );

    const batchResults = await d1.batch([
      assignmentInsert,
      d1.prepare(`INSERT INTO m1_launch_tokens (
          token_hash,
          pair_id,
          actor_type,
          participant_code,
          replicate_id,
          schedule_id,
          information_condition
        )
        SELECT ?, pair_id, 'human', ?, 'human-primary', schedule_id, information_condition
        FROM m1_pair_assignments
        WHERE pair_id = ? AND assignment_version = ?`).bind(
          humanTokenHash,
          humanCode,
          pairId,
          pendingAssignmentVersion,
        ),
      d1.prepare(`INSERT INTO m1_launch_tokens (
          token_hash,
          pair_id,
          actor_type,
          participant_code,
          replicate_id,
          schedule_id,
          information_condition
        )
        SELECT ?, pair_id, 'agent', ?, ?, schedule_id, information_condition
        FROM m1_pair_assignments
        WHERE pair_id = ? AND assignment_version = ?`).bind(
          agentTokenHash,
          agentCode,
          agentReplicateId,
          pairId,
          pendingAssignmentVersion,
        ),
      d1.prepare(`UPDATE m1_pair_assignments
        SET assignment_version = ?
        WHERE pair_id = ? AND assignment_version = ?`).bind(
          allocationMode,
          pairId,
          pendingAssignmentVersion,
        ),
      d1.prepare(`SELECT
          pair_id,
          protocol_architecture,
          schedule_id,
          information_condition,
          stimulus_sha256,
          event_source_sha256,
          assignment_version,
          cohort_id,
          study_phase,
          preregistration_version,
          analysis_set_version,
          implementation_build_id,
          deployment_id,
          deployment_fingerprint_sha256,
          allocation_mode,
          agent_profile_sha256,
          primary_browser_major
        FROM m1_pair_assignments
        WHERE pair_id = ?`).bind(pairId),
    ]);

    const assignmentWasCreated = batchResults[0]?.meta?.changes === 1;
    const assignment = batchResults[4]?.results?.[0] as AssignmentRow | undefined;
    if (!assignmentWasCreated) {
      if (!assignment && allocationMode === "balanced-random-v1") {
        return Response.json(
          {
            error: "The frozen Stage A balanced allocation is full (12 primary pairs)",
            code: "M1_BALANCED_PILOT_CAP_REACHED",
          },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "Pair ID is already assigned; its original launch tokens cannot be reissued" },
        { status: 409 },
      );
    }

    if (
      !assignment ||
      assignment.protocol_architecture !== M1_PROTOCOL_VERSION ||
      assignment.stimulus_sha256 !== M1_STIMULUS_SHA256 ||
      assignment.event_source_sha256 !== M1_EVENT_SOURCE_SHA256 ||
      assignment.assignment_version !== allocationMode ||
      assignment.cohort_id !== M1_COHORT_ID ||
      assignment.study_phase !== M1_STUDY_PHASE ||
      assignment.preregistration_version !== M1_PREREGISTRATION_VERSION ||
      assignment.analysis_set_version !== M1_ANALYSIS_SET_VERSION ||
      assignment.implementation_build_id !== M1_IMPLEMENTATION_BUILD_ID ||
      assignment.deployment_id !== deploymentId ||
      assignment.deployment_fingerprint_sha256 !== deploymentFingerprintSha256 ||
      assignment.allocation_mode !== allocationMode ||
      assignment.agent_profile_sha256 !== agentProfileSha256 ||
      assignment.primary_browser_major !== primaryBrowserMajor ||
      (assignment.information_condition !== "staged" && assignment.information_condition !== "repeat-control") ||
      !Number.isInteger(assignment.schedule_id) ||
      assignment.schedule_id < 1 ||
      assignment.schedule_id > 6
    ) {
      throw new Error("Atomic M1 launch assignment failed validation");
    }

    const origin = new URL(request.url).origin;
    return Response.json(
      {
        pairId,
        scheduleId: assignment.schedule_id,
        informationCondition: assignment.information_condition,
        allocationMode: assignment.assignment_version,
        agentProfileSha256: assignment.agent_profile_sha256,
        primaryBrowserMajor: assignment.primary_browser_major,
        deploymentId: assignment.deployment_id,
        deploymentFingerprintSha256: assignment.deployment_fingerprint_sha256,
        links: {
          human: `${origin}/m1?launch=${humanToken}`,
          agent: `${origin}/agent?launch=${agentToken}`,
        },
      },
      {
        status: 201,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "M1 launch link creation failed" },
      { status: 500 },
    );
  }
}

/**
 * Records a terminal invitation/allocation outcome before a participant or
 * Agent has started. This deliberately revokes the launch token without
 * creating an experiment session; therefore the slot is terminal for flow
 * accounting but is never counted in the started denominator.
 */
export async function PATCH(request: Request) {
  const authorizationFailure = researchAuthorizationFailure(request);
  if (authorizationFailure) return authorizationFailure;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const pairId = typeof payload.pairId === "string" ? payload.pairId.trim() : "";
    const actorType = payload.actorType === "human" || payload.actorType === "agent"
      ? payload.actorType
      : "";
    const disposition = payload.disposition;
    if (!pairId || pairId.length > 64 || !actorType || !isM1PreStartTerminalDisposition(disposition)) {
      return Response.json({ error: "Invalid pre-start terminal disposition" }, { status: 400 });
    }

    await ensureExperimentSchema();
    const d1 = getD1();
    const existing = await d1.prepare(`SELECT
        launch.token_hash,
        launch.actor_type,
        launch.claimed_session_id,
        launch.revoked_at,
        launch.terminal_disposition,
        launch.terminal_at,
        assignment.allocation_mode,
        assignment.deployment_id,
        assignment.deployment_fingerprint_sha256
      FROM m1_launch_tokens AS launch
      INNER JOIN m1_pair_assignments AS assignment ON assignment.pair_id = launch.pair_id
      WHERE launch.pair_id = ?
        AND launch.actor_type = ?
        AND assignment.protocol_architecture = ?
        AND assignment.cohort_id = ?
        AND assignment.implementation_build_id = ?
        AND assignment.allocation_mode = 'balanced-random-v1'`)
      .bind(pairId, actorType, M1_PROTOCOL_VERSION, M1_COHORT_ID, M1_IMPLEMENTATION_BUILD_ID)
      .first<LaunchTerminalRow>();
    if (!existing) {
      return Response.json({ error: "Primary allocation slot was not found" }, { status: 404 });
    }
    const mutationGateResponse = m1SessionMutationGateResponse(
      actorType === "human" ? "m1-main" : "agent-m1-main",
      {
        allocationMode: existing.allocation_mode,
        deploymentId: existing.deployment_id,
        deploymentFingerprintSha256: existing.deployment_fingerprint_sha256,
      },
    );
    if (mutationGateResponse) return mutationGateResponse;

    const terminalAt = new Date().toISOString();
    const update = await d1.prepare(`UPDATE m1_launch_tokens
      SET terminal_disposition = ?, terminal_at = ?, revoked_at = ?
      WHERE token_hash = ?
        AND claimed_session_id IS NULL
        AND claimed_at IS NULL
        AND revoked_at IS NULL
        AND terminal_disposition IS NULL
        AND terminal_at IS NULL`)
      .bind(
        disposition,
        terminalAt,
        terminalAt,
        existing.token_hash,
      )
      .run();

    const row = await d1.prepare(`SELECT
        launch.token_hash,
        launch.actor_type,
        launch.claimed_session_id,
        launch.revoked_at,
        launch.terminal_disposition,
        launch.terminal_at,
        assignment.allocation_mode,
        assignment.deployment_id,
        assignment.deployment_fingerprint_sha256
      FROM m1_launch_tokens AS launch
      INNER JOIN m1_pair_assignments AS assignment ON assignment.pair_id = launch.pair_id
      WHERE launch.token_hash = ?`)
      .bind(existing.token_hash)
      .first<LaunchTerminalRow>();

    if (!row) throw new Error("Primary allocation disappeared during terminal update");
    const legallyTerminal =
      row.claimed_session_id === null &&
      row.terminal_disposition === disposition &&
      Boolean(row.terminal_at) &&
      row.revoked_at === row.terminal_at;
    if (update.meta.changes !== 1 && !legallyTerminal) {
      return Response.json(
        { error: "Allocation has already started, was revoked, or has a different terminal disposition" },
        { status: 409 },
      );
    }

    return Response.json(
      {
        pairId,
        actorType,
        disposition: row.terminal_disposition,
        terminalAt: row.terminal_at,
        alreadyRecorded: update.meta.changes !== 1,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Pre-start terminal disposition failed" },
      { status: 500 },
    );
  }
}
