import { env } from "cloudflare:workers";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ensureExperimentSchema, getD1, getDb } from "@/db";
import {
  agentRunAttempts,
  experimentExpectedSteps,
  experimentSessions,
  experimentStepExposures,
  m1LaunchTokens,
  m1PairAssignments,
  modularResponses,
} from "@/db/schema";
import { buildCsv, type CsvColumn } from "@/lib/csv";
import { M1_COHORT_ID, M1_PROTOCOL_VERSION } from "@/lib/m1-protocol";

type ExportRow = {
  session: typeof experimentSessions.$inferSelect;
  response: typeof modularResponses.$inferSelect;
};

type SessionRow = typeof experimentSessions.$inferSelect;
type AgentAttemptExportRow = {
  session: typeof experimentSessions.$inferSelect;
  attempt: typeof agentRunAttempts.$inferSelect;
};
type AllocationExportRow = {
  assignment: typeof m1PairAssignments.$inferSelect;
  launch: typeof m1LaunchTokens.$inferSelect;
};
type StepExposureExportRow = {
  session: typeof experimentSessions.$inferSelect;
  exposure: typeof experimentStepExposures.$inferSelect;
  expected: typeof experimentExpectedSteps.$inferSelect;
  responseId: number | null;
  responseCreatedAt: string | null;
};

function researcherEmails() {
  const value = (env as Cloudflare.Env & { RESEARCHER_EMAILS?: string })
    .RESEARCHER_EMAILS;
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseJsonArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null,
        )
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function studyConfigValue(row: SessionRow, key: string) {
  const value = parseJsonObject(row.studyConfigJson)[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : "";
}

function studyConfigList(row: SessionRow, key: string) {
  const value = parseJsonObject(row.studyConfigJson)[key];
  return Array.isArray(value) ? value.map(String).join("|") : "";
}

function nestedValue(
  json: string,
  index: number,
  key: "date" | "ratio",
) {
  const value = parseJsonArray(json)[index]?.[key];
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function responseStepOrder(row: ExportRow) {
  const config = parseJsonObject(row.session.studyConfigJson);
  const plan = Array.isArray(config.randomizedPlan) ? config.randomizedPlan : [];
  if (config.disclosureFlowOrder !== "asset-major") {
    return row.response.disclosureIndex * plan.length + row.response.trialOrder;
  }
  let cursor = 0;
  for (const candidate of [...plan].sort((first, second) =>
    Number((first as Record<string, unknown>).order ?? 0) - Number((second as Record<string, unknown>).order ?? 0))) {
    const trial = candidate as Record<string, unknown>;
    if (trial.id === row.response.trialId) return cursor + row.response.disclosureIndex;
    cursor += Array.isArray(trial.disclosures) ? trial.disclosures.length : 0;
  }
  return "";
}

function isExactG0DefaultAnchor(row: ExportRow) {
  if (row.response.disclosureIndex !== 0) return false;
  const first = Number(nestedValue(row.response.boundariesJson, 0, "ratio"));
  const second = Number(nestedValue(row.response.boundariesJson, 1, "ratio"));
  return Number.isFinite(first) && Number.isFinite(second) &&
    Math.abs(first - 1 / 3) <= 0.00001 && Math.abs(second - 2 / 3) <= 0.00001 &&
    row.response.adjustmentCount === 0 && row.response.firstMoveMs === null;
}

function responseProtocolDeviationCodes(row: ExportRow) {
  const config = parseJsonObject(row.session.studyConfigJson);
  return [
    ...(config.primaryProtocolEligible === true ? [] : ["initial_visual_protocol_ineligible"]),
    ...(row.response.responseViewportWidth === 1440 ? [] : ["response_viewport_width_not_1440"]),
    ...(row.response.responseViewportHeight === 900 ? [] : ["response_viewport_height_not_900"]),
    ...(row.response.responseOrientation.startsWith("landscape") ? [] : ["response_orientation_not_landscape"]),
  ];
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { key: "session_id", value: (row) => row.session.id },
  { key: "session_status", value: (row) => row.session.status },
  { key: "session_started_at", value: (row) => row.session.startedAt },
  { key: "session_completed_at", value: (row) => row.session.completedAt },
  { key: "session_termination_code", value: (row) => row.session.terminationCode },
  { key: "actor_type", value: (row) => row.session.actorType },
  { key: "participant_code", value: (row) => row.session.participantCode },
  { key: "expertise", value: (row) => row.session.expertise },
  { key: "model_name", value: (row) => row.session.modelName },
  { key: "experimental_arm", value: (row) => row.session.experimentalArm },
  { key: "protocol_version", value: (row) => row.session.protocolVersion },
  { key: "study_config_json", value: (row) => row.session.studyConfigJson },
  { key: "pair_id", value: (row) => studyConfigValue(row.session, "pairId") },
  { key: "schedule_id", value: (row) => studyConfigValue(row.session, "scheduleId") },
  { key: "information_condition", value: (row) => studyConfigValue(row.session, "informationCondition") },
  { key: "protocol_architecture", value: (row) => studyConfigValue(row.session, "protocolArchitecture") },
  { key: "cohort_id", value: (row) => studyConfigValue(row.session, "cohortId") },
  { key: "allocation_mode", value: (row) => studyConfigValue(row.session, "allocationMode") },
  { key: "study_phase", value: (row) => studyConfigValue(row.session, "studyPhase") },
  { key: "preregistration_version", value: (row) => studyConfigValue(row.session, "preregistrationVersion") },
  { key: "analysis_set_version", value: (row) => studyConfigValue(row.session, "analysisSetVersion") },
  { key: "implementation_build_id", value: (row) => studyConfigValue(row.session, "implementationBuildId") },
  { key: "deployment_id", value: (row) => studyConfigValue(row.session, "deploymentId") },
  { key: "deployment_fingerprint_sha256", value: (row) => studyConfigValue(row.session, "deploymentFingerprintSha256") },
  { key: "human_consent_version", value: (row) => studyConfigValue(row.session, "humanConsentVersion") },
  { key: "human_consented_at", value: (row) => studyConfigValue(row.session, "humanConsentedAt") },
  { key: "human_language_screening_version", value: (row) => studyConfigValue(row.session, "humanLanguageScreeningVersion") },
  { key: "human_language_screened_at", value: (row) => studyConfigValue(row.session, "humanLanguageScreenedAt") },
  { key: "agent_profile_sha256", value: (row) => studyConfigValue(row.session, "agentProfileSha256") },
  { key: "primary_browser_major", value: (row) => studyConfigValue(row.session, "primaryBrowserMajor") },
  { key: "stimulus_sha256", value: (row) => studyConfigValue(row.session, "stimulusSha256") },
  { key: "event_source_sha256", value: (row) => studyConfigValue(row.session, "eventSourceSha256") },
  { key: "initial_boundary_policy", value: (row) => studyConfigValue(row.session, "initialBoundaryPolicy") },
  { key: "primary_protocol_eligible", value: (row) => studyConfigValue(row.session, "primaryProtocolEligible") },
  { key: "protocol_deviation_codes", value: (row) => studyConfigList(row.session, "protocolDeviationCodes") },
  { key: "device_type", value: (row) => row.session.deviceType },
  { key: "screen_width", value: (row) => row.session.screenWidth },
  { key: "screen_height", value: (row) => row.session.screenHeight },
  { key: "initial_viewport_width", value: (row) => row.session.viewportWidth },
  { key: "initial_viewport_height", value: (row) => row.session.viewportHeight },
  { key: "device_pixel_ratio", value: (row) => row.session.devicePixelRatio },
  { key: "client_platform", value: (row) => row.session.clientPlatform },
  { key: "browser_language", value: (row) => row.session.browserLanguage },
  { key: "client_timezone", value: (row) => row.session.clientTimezone },
  { key: "pointer_type", value: (row) => row.session.pointerType },
  { key: "touch_points", value: (row) => row.session.touchPoints },
  { key: "screen_orientation", value: (row) => row.session.screenOrientation },
  { key: "user_agent", value: (row) => row.session.userAgent },
  { key: "response_id", value: (row) => row.response.id },
  { key: "step_order", value: responseStepOrder },
  { key: "trial_id", value: (row) => row.response.trialId },
  { key: "trial_order", value: (row) => row.response.trialOrder },
  { key: "response_version", value: (row) => row.response.responseVersion },
  { key: "module_key", value: (row) => row.response.moduleKey },
  { key: "task_type", value: (row) => row.response.taskType },
  { key: "stimulus_type", value: (row) => row.response.stimulusType },
  { key: "asset_id", value: (row) => row.response.assetId },
  { key: "metric_type", value: (row) => row.response.metricType },
  { key: "resolution", value: (row) => row.response.resolution },
  { key: "scale_mode", value: (row) => row.response.scaleMode },
  { key: "window_mode", value: (row) => row.response.windowMode },
  { key: "disclosure_index", value: (row) => row.response.disclosureIndex },
  { key: "disclosure_key", value: (row) => row.response.disclosureKey },
  { key: "cue_schema_version", value: (row) => row.response.cueSchemaVersion },
  { key: "boundary_count", value: (row) => row.response.boundaryCount },
  { key: "boundary_1_date", value: (row) => nestedValue(row.response.boundariesJson, 0, "date") },
  { key: "boundary_1_ratio", value: (row) => nestedValue(row.response.boundariesJson, 0, "ratio") },
  { key: "boundary_2_date", value: (row) => nestedValue(row.response.boundariesJson, 1, "date") },
  { key: "boundary_2_ratio", value: (row) => nestedValue(row.response.boundariesJson, 1, "ratio") },
  { key: "boundaries_json", value: (row) => row.response.boundariesJson },
  { key: "previous_boundaries_json", value: (row) => row.response.previousBoundariesJson },
  { key: "boundary_intervals_json", value: (row) => row.response.boundaryIntervalsJson },
  { key: "single_stage_confirmed", value: (row) => row.response.singleStageConfirmed },
  { key: "influence_rating", value: (row) => row.response.influenceRating },
  { key: "influence_touched", value: (row) => row.response.influenceTouched },
  { key: "no_change_confirmed", value: (row) => row.response.noChangeConfirmed },
  { key: "cue_tags_json", value: (row) => row.response.cueTags },
  { key: "rationale", value: (row) => row.response.rationale },
  { key: "elapsed_ms", value: (row) => row.response.elapsedMs },
  { key: "reveal_read_ms", value: (row) => row.response.revealReadMs },
  { key: "first_move_ms", value: (row) => row.response.firstMoveMs },
  { key: "first_uncertainty_ms", value: (row) => row.response.firstUncertaintyMs },
  { key: "adjustment_count", value: (row) => row.response.adjustmentCount },
  { key: "g0_exact_default_anchor", value: isExactG0DefaultAnchor },
  { key: "uncertainty_adjustment_count", value: (row) => row.response.uncertaintyAdjustmentCount },
  { key: "client_started_at", value: (row) => row.response.clientStartedAt },
  { key: "client_submitted_at", value: (row) => row.response.clientSubmittedAt },
  { key: "response_viewport_width", value: (row) => row.response.responseViewportWidth },
  { key: "response_viewport_height", value: (row) => row.response.responseViewportHeight },
  { key: "response_orientation", value: (row) => row.response.responseOrientation },
  { key: "response_protocol_eligible", value: (row) => responseProtocolDeviationCodes(row).length === 0 },
  { key: "response_protocol_deviation_codes", value: (row) => responseProtocolDeviationCodes(row).join("|") },
  { key: "page_hidden_ms", value: (row) => row.response.pageHiddenMs },
  { key: "active_elapsed_ms", value: (row) => row.response.activeElapsedMs },
  { key: "disclosure_state_json", value: (row) => row.response.disclosureStateJson },
  { key: "stimulus_window_json", value: (row) => row.response.stimulusWindowJson },
  { key: "response_created_at", value: (row) => row.response.createdAt },
];

const SESSION_COLUMNS: CsvColumn<SessionRow>[] = [
  { key: "session_id", value: (row) => row.id },
  { key: "session_status", value: (row) => row.status },
  { key: "session_started_at", value: (row) => row.startedAt },
  { key: "session_completed_at", value: (row) => row.completedAt },
  { key: "session_termination_code", value: (row) => row.terminationCode },
  { key: "practice_completed_at", value: (row) => row.practiceCompletedAt },
  { key: "actor_type", value: (row) => row.actorType },
  { key: "participant_code", value: (row) => row.participantCode },
  { key: "expertise", value: (row) => row.expertise },
  { key: "model_name", value: (row) => row.modelName },
  { key: "experimental_arm", value: (row) => row.experimentalArm },
  { key: "protocol_version", value: (row) => row.protocolVersion },
  { key: "device_type", value: (row) => row.deviceType },
  { key: "screen_width", value: (row) => row.screenWidth },
  { key: "screen_height", value: (row) => row.screenHeight },
  { key: "initial_viewport_width", value: (row) => row.viewportWidth },
  { key: "initial_viewport_height", value: (row) => row.viewportHeight },
  { key: "device_pixel_ratio", value: (row) => row.devicePixelRatio },
  { key: "client_platform", value: (row) => row.clientPlatform },
  { key: "browser_language", value: (row) => row.browserLanguage },
  { key: "client_timezone", value: (row) => row.clientTimezone },
  { key: "pointer_type", value: (row) => row.pointerType },
  { key: "touch_points", value: (row) => row.touchPoints },
  { key: "screen_orientation", value: (row) => row.screenOrientation },
  { key: "user_agent", value: (row) => row.userAgent },
  { key: "study_config_json", value: (row) => row.studyConfigJson },
  { key: "pair_id", value: (row) => studyConfigValue(row, "pairId") },
  { key: "schedule_id", value: (row) => studyConfigValue(row, "scheduleId") },
  { key: "information_condition", value: (row) => studyConfigValue(row, "informationCondition") },
  { key: "protocol_architecture", value: (row) => studyConfigValue(row, "protocolArchitecture") },
  { key: "cohort_id", value: (row) => studyConfigValue(row, "cohortId") },
  { key: "allocation_mode", value: (row) => studyConfigValue(row, "allocationMode") },
  { key: "study_phase", value: (row) => studyConfigValue(row, "studyPhase") },
  { key: "preregistration_version", value: (row) => studyConfigValue(row, "preregistrationVersion") },
  { key: "analysis_set_version", value: (row) => studyConfigValue(row, "analysisSetVersion") },
  { key: "implementation_build_id", value: (row) => studyConfigValue(row, "implementationBuildId") },
  { key: "deployment_id", value: (row) => studyConfigValue(row, "deploymentId") },
  { key: "deployment_fingerprint_sha256", value: (row) => studyConfigValue(row, "deploymentFingerprintSha256") },
  { key: "human_consent_version", value: (row) => studyConfigValue(row, "humanConsentVersion") },
  { key: "human_consented_at", value: (row) => studyConfigValue(row, "humanConsentedAt") },
  { key: "human_language_screening_version", value: (row) => studyConfigValue(row, "humanLanguageScreeningVersion") },
  { key: "human_language_screened_at", value: (row) => studyConfigValue(row, "humanLanguageScreenedAt") },
  { key: "agent_profile_sha256", value: (row) => studyConfigValue(row, "agentProfileSha256") },
  { key: "primary_browser_major", value: (row) => studyConfigValue(row, "primaryBrowserMajor") },
  { key: "stimulus_sha256", value: (row) => studyConfigValue(row, "stimulusSha256") },
  { key: "event_source_sha256", value: (row) => studyConfigValue(row, "eventSourceSha256") },
  { key: "initial_boundary_policy", value: (row) => studyConfigValue(row, "initialBoundaryPolicy") },
  { key: "primary_protocol_eligible", value: (row) => studyConfigValue(row, "primaryProtocolEligible") },
  { key: "protocol_deviation_codes", value: (row) => studyConfigList(row, "protocolDeviationCodes") },
];

const AGENT_ATTEMPT_COLUMNS: CsvColumn<AgentAttemptExportRow>[] = [
  { key: "session_id", value: (row) => row.session.id },
  { key: "pair_id", value: (row) => studyConfigValue(row.session, "pairId") },
  { key: "schedule_id", value: (row) => studyConfigValue(row.session, "scheduleId") },
  { key: "information_condition", value: (row) => studyConfigValue(row.session, "informationCondition") },
  { key: "cohort_id", value: (row) => studyConfigValue(row.session, "cohortId") },
  { key: "allocation_mode", value: (row) => studyConfigValue(row.session, "allocationMode") },
  { key: "deployment_id", value: (row) => studyConfigValue(row.session, "deploymentId") },
  { key: "deployment_fingerprint_sha256", value: (row) => studyConfigValue(row.session, "deploymentFingerprintSha256") },
  { key: "model_name", value: (row) => row.session.modelName },
  { key: "step_order", value: (row) => row.attempt.stepOrder },
  { key: "attempt_number", value: (row) => row.attempt.attemptNumber },
  { key: "model_api_attempt_number", value: (row) => row.attempt.modelApiAttemptNumber },
  { key: "mechanical_action_id", value: (row) => row.attempt.mechanicalActionId },
  { key: "mechanical_retry_number", value: (row) => row.attempt.mechanicalRetryNumber },
  { key: "controller_version", value: (row) => row.attempt.controllerVersion },
  { key: "model_request_id", value: (row) => row.attempt.modelRequestId },
  { key: "source_model_request_id", value: (row) => row.attempt.sourceModelRequestId },
  { key: "prompt_sha256", value: (row) => row.attempt.promptSha256 },
  { key: "runtime_request_sha256", value: (row) => row.attempt.runtimeRequestSha256 },
  { key: "screenshot_sha256", value: (row) => row.attempt.screenshotSha256 },
  { key: "output_sha256", value: (row) => row.attempt.outputSha256 },
  { key: "action_trace_sha256", value: (row) => row.attempt.actionTraceSha256 },
  { key: "response_id", value: (row) => row.attempt.responseId },
  { key: "response_sha256", value: (row) => row.attempt.responseSha256 },
  { key: "context_policy", value: (row) => row.attempt.contextPolicy },
  { key: "input_modality", value: (row) => row.attempt.inputModality },
  { key: "image_detail", value: (row) => row.attempt.imageDetail },
  { key: "temperature", value: (row) => row.attempt.temperature },
  { key: "top_p", value: (row) => row.attempt.topP },
  { key: "seed", value: (row) => row.attempt.seed },
  { key: "reasoning_effort", value: (row) => row.attempt.reasoningEffort },
  { key: "input_tokens", value: (row) => row.attempt.inputTokens },
  { key: "output_tokens", value: (row) => row.attempt.outputTokens },
  { key: "tool_calls", value: (row) => row.attempt.toolCalls },
  { key: "status", value: (row) => row.attempt.status },
  { key: "error_code", value: (row) => row.attempt.errorCode },
  { key: "started_at", value: (row) => row.attempt.startedAt },
  { key: "completed_at", value: (row) => row.attempt.completedAt },
  { key: "created_at", value: (row) => row.attempt.createdAt },
];

function sqliteTimestampMs(value: string | null) {
  if (!value) return Number.NaN;
  return Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

const STEP_EXPOSURE_COLUMNS: CsvColumn<StepExposureExportRow>[] = [
  { key: "session_id", value: (row) => row.session.id },
  { key: "pair_id", value: (row) => studyConfigValue(row.session, "pairId") },
  { key: "actor_type", value: (row) => row.session.actorType },
  { key: "cohort_id", value: (row) => studyConfigValue(row.session, "cohortId") },
  { key: "allocation_mode", value: (row) => studyConfigValue(row.session, "allocationMode") },
  { key: "deployment_id", value: (row) => studyConfigValue(row.session, "deploymentId") },
  { key: "deployment_fingerprint_sha256", value: (row) => studyConfigValue(row.session, "deploymentFingerprintSha256") },
  { key: "step_order", value: (row) => row.exposure.stepOrder },
  { key: "trial_id", value: (row) => row.expected.trialId },
  { key: "disclosure_index", value: (row) => row.expected.disclosureIndex },
  { key: "server_page_started_at", value: (row) => row.exposure.startedAt },
  { key: "response_id", value: (row) => row.responseId },
  { key: "response_received_at", value: (row) => row.responseCreatedAt },
  {
    key: "server_page_elapsed_ms",
    value: (row) => {
      const started = sqliteTimestampMs(row.exposure.startedAt);
      const received = sqliteTimestampMs(row.responseCreatedAt);
      return Number.isFinite(started) && Number.isFinite(received) ? Math.max(0, Math.round(received - started)) : "";
    },
  },
];

const ALLOCATION_COLUMNS: CsvColumn<AllocationExportRow>[] = [
  { key: "pair_id", value: (row) => row.assignment.pairId },
  { key: "actor_type", value: (row) => row.launch.actorType },
  { key: "participant_code", value: (row) => row.launch.participantCode },
  { key: "replicate_id", value: (row) => row.launch.replicateId },
  { key: "schedule_id", value: (row) => row.assignment.scheduleId },
  { key: "information_condition", value: (row) => row.assignment.informationCondition },
  { key: "assignment_version", value: (row) => row.assignment.assignmentVersion },
  { key: "cohort_id", value: (row) => row.assignment.cohortId },
  { key: "study_phase", value: (row) => row.assignment.studyPhase },
  { key: "preregistration_version", value: (row) => row.assignment.preregistrationVersion },
  { key: "analysis_set_version", value: (row) => row.assignment.analysisSetVersion },
  { key: "implementation_build_id", value: (row) => row.assignment.implementationBuildId },
  { key: "deployment_id", value: (row) => row.assignment.deploymentId },
  { key: "deployment_fingerprint_sha256", value: (row) => row.assignment.deploymentFingerprintSha256 },
  { key: "allocation_mode", value: (row) => row.assignment.allocationMode },
  { key: "agent_profile_sha256", value: (row) => row.assignment.agentProfileSha256 },
  { key: "primary_browser_major", value: (row) => row.assignment.primaryBrowserMajor },
  { key: "protocol_architecture", value: (row) => row.assignment.protocolArchitecture },
  { key: "stimulus_sha256", value: (row) => row.assignment.stimulusSha256 },
  { key: "event_source_sha256", value: (row) => row.assignment.eventSourceSha256 },
  { key: "token_sha256", value: (row) => row.launch.tokenHash },
  { key: "token_created_at", value: (row) => row.launch.createdAt },
  { key: "token_claimed_at", value: (row) => row.launch.claimedAt },
  { key: "claimed_session_id", value: (row) => row.launch.claimedSessionId },
  { key: "revoked_at", value: (row) => row.launch.revokedAt },
  { key: "terminal_disposition", value: (row) => row.launch.terminalDisposition },
  { key: "terminal_at", value: (row) => row.launch.terminalAt },
];

export async function GET(request: Request) {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!email) {
    return Response.json({ error: "Researcher sign-in is required" }, { status: 401 });
  }

  const allowed = researcherEmails();
  if (allowed.size === 0) {
    return Response.json(
      { error: "Research export allowlist is not configured" },
      { status: 503 },
    );
  }
  if (!allowed.has(email)) {
    return Response.json({ error: "Researcher access denied" }, { status: 403 });
  }

  try {
    await ensureExperimentSchema();
    await getD1().prepare(`UPDATE experiment_sessions AS session
      SET status = 'aborted', completed_at = CURRENT_TIMESTAMP, termination_code = 'FORMAL_PAGE_TIME_LIMIT'
      WHERE session.status = 'active'
        AND session.experimental_arm IN ('m1-main', 'agent-m1-main', 'pilot-m1')
        AND json_extract(session.study_config_json, '$.protocolArchitecture') = ?
        AND EXISTS (
          SELECT 1
          FROM experiment_step_exposures AS exposure
          WHERE exposure.session_id = session.id
            AND exposure.step_order = (
              SELECT COUNT(*) FROM modular_responses AS response WHERE response.session_id = session.id
            )
            AND CAST((julianday('now') - julianday(exposure.started_at)) * 86400000 AS INTEGER) > 180000
        )`)
      .bind(M1_PROTOCOL_VERSION)
      .run();
    await getD1().prepare(`UPDATE experiment_sessions
      SET status = 'aborted', completed_at = CURRENT_TIMESTAMP, termination_code = 'RUN_TIME_LIMIT_EXCEEDED'
      WHERE status = 'active'
        AND experimental_arm IN ('m1-main', 'agent-m1-main', 'pilot-m1')
        AND json_extract(study_config_json, '$.protocolArchitecture') = ?
        AND unixepoch('now') - unixepoch(started_at) > 7200`)
      .bind(M1_PROTOCOL_VERSION)
      .run();
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scope");
    const scope = requestedScope === "pilot" ||
      requestedScope === "m1" ||
      requestedScope === "agent" ||
      requestedScope === "human-m1" ||
      requestedScope === "m1-comparison" ||
      requestedScope === "agent-console"
      ? requestedScope
      : "all";
    const requestedTable = url.searchParams.get("table");
    const table = requestedTable === "sessions" || requestedTable === "agent-attempts" || requestedTable === "allocations" || requestedTable === "step-exposures"
      ? requestedTable
      : "responses";
    const date = new Date().toISOString().slice(0, 10);
    const primaryM1SessionFilter = and(
      inArray(experimentSessions.experimentalArm, ["m1-main", "agent-m1-main"]),
      sql`json_extract(${experimentSessions.studyConfigJson}, '$.protocolArchitecture') = ${M1_PROTOCOL_VERSION}`,
      sql`json_extract(${experimentSessions.studyConfigJson}, '$.cohortId') = ${M1_COHORT_ID}`,
      sql`json_extract(${experimentSessions.studyConfigJson}, '$.allocationMode') = 'balanced-random-v1'`,
    );
    if (table === "allocations") {
      const allocationBase = getDb()
        .select({ assignment: m1PairAssignments, launch: m1LaunchTokens })
        .from(m1LaunchTokens)
        .innerJoin(m1PairAssignments, eq(m1LaunchTokens.pairId, m1PairAssignments.pairId));
      const rows = scope === "m1-comparison"
        ? await allocationBase.where(and(
            eq(m1PairAssignments.protocolArchitecture, M1_PROTOCOL_VERSION),
            eq(m1PairAssignments.cohortId, M1_COHORT_ID),
            eq(m1PairAssignments.allocationMode, "balanced-random-v1"),
          )).orderBy(asc(m1PairAssignments.createdAt), asc(m1LaunchTokens.actorType))
        : await allocationBase.orderBy(asc(m1PairAssignments.createdAt), asc(m1LaunchTokens.actorType));
      return new Response(buildCsv(rows, ALLOCATION_COLUMNS), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="boundary-lab-m1-allocation-ledger-${date}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }
    if (table === "step-exposures") {
      const exposureBase = getDb()
        .select({
          session: experimentSessions,
          exposure: experimentStepExposures,
          expected: experimentExpectedSteps,
          responseId: modularResponses.id,
          responseCreatedAt: modularResponses.createdAt,
        })
        .from(experimentStepExposures)
        .innerJoin(experimentSessions, eq(experimentStepExposures.sessionId, experimentSessions.id))
        .innerJoin(experimentExpectedSteps, and(
          eq(experimentExpectedSteps.sessionId, experimentStepExposures.sessionId),
          eq(experimentExpectedSteps.stepOrder, experimentStepExposures.stepOrder),
        ))
        .leftJoin(modularResponses, and(
          eq(modularResponses.sessionId, experimentExpectedSteps.sessionId),
          eq(modularResponses.trialId, experimentExpectedSteps.trialId),
          eq(modularResponses.disclosureIndex, experimentExpectedSteps.disclosureIndex),
        ));
      const exposureRows = scope === "m1-comparison"
        ? await exposureBase.where(primaryM1SessionFilter).orderBy(asc(experimentSessions.startedAt), asc(experimentStepExposures.stepOrder))
        : await exposureBase.orderBy(asc(experimentSessions.startedAt), asc(experimentStepExposures.stepOrder));
      return new Response(buildCsv(exposureRows, STEP_EXPOSURE_COLUMNS), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="boundary-lab-${scope}-step-exposures-${date}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }
    if (table === "agent-attempts") {
      const attemptBase = getDb()
        .select({ session: experimentSessions, attempt: agentRunAttempts })
        .from(agentRunAttempts)
        .innerJoin(experimentSessions, eq(agentRunAttempts.sessionId, experimentSessions.id));
      const attemptRows = scope === "m1-comparison"
        ? await attemptBase.where(and(eq(experimentSessions.experimentalArm, "agent-m1-main"), primaryM1SessionFilter)).orderBy(asc(experimentSessions.startedAt), asc(agentRunAttempts.stepOrder), asc(agentRunAttempts.attemptNumber))
        : scope === "agent-console"
          ? await attemptBase.where(inArray(experimentSessions.experimentalArm, ["agent-disclosure", "agent-framing", "agent-cross-series", "agent-robustness"])).orderBy(asc(experimentSessions.startedAt), asc(agentRunAttempts.stepOrder), asc(agentRunAttempts.attemptNumber))
          : scope === "m1"
            ? await attemptBase.where(eq(experimentSessions.experimentalArm, "agent-pilot-m1")).orderBy(asc(experimentSessions.startedAt), asc(agentRunAttempts.stepOrder), asc(agentRunAttempts.attemptNumber))
            : scope === "pilot" || scope === "human-m1"
              ? await attemptBase.where(sql`1 = 0`).orderBy(asc(experimentSessions.startedAt))
              : await attemptBase.where(eq(experimentSessions.actorType, "agent")).orderBy(asc(experimentSessions.startedAt), asc(agentRunAttempts.stepOrder), asc(agentRunAttempts.attemptNumber));
      return new Response(buildCsv(attemptRows, AGENT_ATTEMPT_COLUMNS), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="boundary-lab-${scope}-agent-attempts-${date}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }
    if (table === "sessions") {
      const sessionBase = getDb().select().from(experimentSessions);
      const sessionRows = scope === "pilot"
        ? await sessionBase.where(eq(experimentSessions.experimentalArm, "pilot-m1")).orderBy(asc(experimentSessions.startedAt))
        : scope === "human-m1"
          ? await sessionBase.where(eq(experimentSessions.experimentalArm, "m1-main")).orderBy(asc(experimentSessions.startedAt))
          : scope === "m1-comparison"
            ? await sessionBase.where(primaryM1SessionFilter).orderBy(asc(experimentSessions.startedAt))
          : scope === "agent-console"
            ? await sessionBase.where(inArray(experimentSessions.experimentalArm, [
                "agent-disclosure",
                "agent-framing",
                "agent-cross-series",
                "agent-robustness",
              ])).orderBy(asc(experimentSessions.startedAt))
            : scope === "m1"
              ? await sessionBase.where(inArray(experimentSessions.experimentalArm, ["pilot-m1", "agent-pilot-m1"])).orderBy(asc(experimentSessions.startedAt))
              : scope === "agent"
                ? await sessionBase.where(eq(experimentSessions.actorType, "agent")).orderBy(asc(experimentSessions.startedAt))
                : await sessionBase.orderBy(asc(experimentSessions.startedAt));
      const filename = `boundary-lab-${scope}-sessions-${date}.csv`;
      return new Response(buildCsv(sessionRows, SESSION_COLUMNS), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }
    const base = getDb()
      .select({ session: experimentSessions, response: modularResponses })
      .from(modularResponses)
      .innerJoin(
        experimentSessions,
        eq(modularResponses.sessionId, experimentSessions.id),
      );
    const order = [
      asc(experimentSessions.startedAt),
      asc(modularResponses.trialOrder),
      asc(modularResponses.disclosureIndex),
    ] as const;
    const rows = scope === "pilot"
      ? await base.where(eq(experimentSessions.experimentalArm, "pilot-m1")).orderBy(...order)
      : scope === "human-m1"
        ? await base.where(eq(experimentSessions.experimentalArm, "m1-main")).orderBy(...order)
        : scope === "m1-comparison"
          ? await base.where(primaryM1SessionFilter).orderBy(
              asc(experimentSessions.startedAt),
              asc(modularResponses.disclosureIndex),
              asc(modularResponses.trialOrder),
            )
        : scope === "agent-console"
          ? await base.where(inArray(experimentSessions.experimentalArm, [
              "agent-disclosure",
              "agent-framing",
              "agent-cross-series",
              "agent-robustness",
            ])).orderBy(...order)
          : scope === "m1"
            ? await base.where(inArray(experimentSessions.experimentalArm, ["pilot-m1", "agent-pilot-m1"])).orderBy(...order)
            : scope === "agent"
              ? await base.where(eq(experimentSessions.actorType, "agent")).orderBy(...order)
              : await base.orderBy(
                  asc(experimentSessions.startedAt),
                  asc(modularResponses.trialOrder),
                  asc(modularResponses.disclosureIndex),
                );

    const filename = `boundary-lab-${scope}-${date}.csv`;
    return new Response(buildCsv(rows, COLUMNS), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Research export failed" },
      { status: 500 },
    );
  }
}
