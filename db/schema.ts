import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const experimentSessions = sqliteTable(
  "experiment_sessions",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type").notNull(),
    participantCode: text("participant_code").notNull().default(""),
    expertise: text("expertise").notNull().default("none"),
    experimentalArm: text("experimental_arm").notNull().default("trajectory"),
    protocolVersion: text("protocol_version").notNull(),
    studyConfigJson: text("study_config_json").notNull().default("{}"),
    modelName: text("model_name"),
    deviceType: text("device_type").notNull().default("unknown"),
    userAgent: text("user_agent").notNull().default(""),
    clientPlatform: text("client_platform").notNull().default(""),
    browserLanguage: text("browser_language").notNull().default(""),
    clientTimezone: text("client_timezone").notNull().default(""),
    screenWidth: integer("screen_width"),
    screenHeight: integer("screen_height"),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    devicePixelRatio: real("device_pixel_ratio"),
    touchPoints: integer("touch_points").notNull().default(0),
    pointerType: text("pointer_type").notNull().default("unknown"),
    screenOrientation: text("screen_orientation").notNull().default("unknown"),
    status: text("status").notNull().default("active"),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    practiceCompletedAt: text("practice_completed_at"),
    completedAt: text("completed_at"),
    terminationCode: text("termination_code").notNull().default(""),
  },
  (table) => [index("idx_sessions_status").on(table.status)],
);

export const m1PairAssignments = sqliteTable(
  "m1_pair_assignments",
  {
    pairId: text("pair_id").primaryKey(),
    protocolArchitecture: text("protocol_architecture").notNull(),
    scheduleId: integer("schedule_id").notNull(),
    informationCondition: text("information_condition").notNull(),
    stimulusSha256: text("stimulus_sha256").notNull(),
    eventSourceSha256: text("event_source_sha256").notNull(),
    assignmentVersion: text("assignment_version").notNull(),
    cohortId: text("cohort_id").notNull().default("legacy-unclassified"),
    studyPhase: text("study_phase").notNull().default("legacy-unclassified"),
    preregistrationVersion: text("preregistration_version").notNull().default(""),
    analysisSetVersion: text("analysis_set_version").notNull().default(""),
    implementationBuildId: text("implementation_build_id").notNull().default(""),
    deploymentId: text("deployment_id").notNull().default(""),
    deploymentFingerprintSha256: text("deployment_fingerprint_sha256").notNull().default(""),
    allocationMode: text("allocation_mode").notNull().default("legacy-unclassified"),
    agentProfileSha256: text("agent_profile_sha256").notNull().default(""),
    primaryBrowserMajor: integer("primary_browser_major").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_m1_pair_assignment_condition_schedule").on(
      table.cohortId,
      table.allocationMode,
      table.informationCondition,
      table.scheduleId,
    ),
  ],
);

export const m1LaunchTokens = sqliteTable(
  "m1_launch_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    pairId: text("pair_id")
      .notNull()
      .references(() => m1PairAssignments.pairId, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    participantCode: text("participant_code").notNull(),
    replicateId: text("replicate_id").notNull(),
    scheduleId: integer("schedule_id").notNull(),
    informationCondition: text("information_condition").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
    terminalDisposition: text("terminal_disposition"),
    terminalAt: text("terminal_at"),
    claimedSessionId: text("claimed_session_id"),
    claimedAt: text("claimed_at"),
  },
  (table) => [
    index("idx_m1_launch_token_pair_actor").on(table.pairId, table.actorType),
  ],
);

export const m1PairSlots = sqliteTable(
  "m1_pair_slots",
  {
    id: text("id").primaryKey(),
    pairId: text("pair_id")
      .notNull()
      .references(() => m1PairAssignments.pairId, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    replicateId: text("replicate_id").notNull(),
    launchTokenHash: text("launch_token_hash")
      .notNull()
      .references(() => m1LaunchTokens.tokenHash, { onDelete: "restrict" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_m1_pair_slot_actor_replicate").on(
      table.pairId,
      table.actorType,
      table.replicateId,
    ),
    uniqueIndex("idx_m1_pair_slot_session").on(table.sessionId),
    uniqueIndex("idx_m1_pair_slot_launch_token").on(table.launchTokenHash),
  ],
);

export const researchResponses = sqliteTable(
  "research_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    stimulusId: text("stimulus_id").notNull(),
    assetId: text("asset_id").notNull(),
    assetOrder: integer("asset_order").notNull(),
    metricType: text("metric_type").notNull(),
    taskMode: text("task_mode").notNull(),
    taskFamily: text("task_family").notNull().default("placement"),
    resolution: text("resolution").notNull(),
    scaleMode: text("scale_mode").notNull().default("linear"),
    disclosureLevel: integer("disclosure_level").notNull(),
    disclosureKey: text("disclosure_key").notNull(),
    boundaryCount: integer("boundary_count").notNull().default(0),
    boundariesJson: text("boundaries_json").notNull().default("[]"),
    previousBoundariesJson: text("previous_boundaries_json").notNull().default("[]"),
    referenceBoundariesJson: text("reference_boundaries_json").notNull().default("[]"),
    boundaryIntervalsJson: text("boundary_intervals_json").notNull().default("[]"),
    reasonablenessRating: integer("reasonableness_rating"),
    confidence: integer("confidence").notNull(),
    influenceRating: integer("influence_rating"),
    confidenceTouched: integer("confidence_touched", { mode: "boolean" })
      .notNull()
      .default(false),
    influenceTouched: integer("influence_touched", { mode: "boolean" })
      .notNull()
      .default(false),
    noChangeConfirmed: integer("no_change_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    cueTags: text("cue_tags").notNull().default("[]"),
    rationale: text("rationale").notNull().default(""),
    elapsedMs: integer("elapsed_ms").notNull(),
    revealReadMs: integer("reveal_read_ms").notNull().default(0),
    firstMoveMs: integer("first_move_ms"),
    firstUncertaintyMs: integer("first_uncertainty_ms"),
    adjustmentCount: integer("adjustment_count").notNull().default(0),
    uncertaintyAdjustmentCount: integer("uncertainty_adjustment_count")
      .notNull()
      .default(0),
    scaleSwitchCount: integer("scale_switch_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_research_responses_session_id").on(table.sessionId),
    index("idx_research_responses_condition").on(
      table.metricType,
      table.taskMode,
      table.resolution,
    ),
    uniqueIndex("idx_research_response_session_stimulus_layer").on(
      table.sessionId,
      table.stimulusId,
      table.disclosureLevel,
    ),
  ],
);

export const modularResponses = sqliteTable(
  "modular_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    trialId: text("trial_id").notNull(),
    trialOrder: integer("trial_order").notNull(),
    responseVersion: text("response_version").notNull().default("pre-v4"),
    moduleKey: text("module_key").notNull(),
    taskType: text("task_type").notNull(),
    stimulusType: text("stimulus_type").notNull(),
    assetId: text("asset_id").notNull(),
    metricType: text("metric_type").notNull(),
    resolution: text("resolution").notNull(),
    scaleMode: text("scale_mode").notNull(),
    windowMode: text("window_mode").notNull(),
    disclosureIndex: integer("disclosure_index").notNull(),
    disclosureKey: text("disclosure_key").notNull(),
    disclosureStateJson: text("disclosure_state_json").notNull().default("{}"),
    stimulusWindowJson: text("stimulus_window_json").notNull().default("{}"),
    cueSchemaVersion: text("cue_schema_version").notNull().default("legacy-cues-v1"),
    boundaryCount: integer("boundary_count").notNull().default(0),
    boundariesJson: text("boundaries_json").notNull().default("[]"),
    previousBoundariesJson: text("previous_boundaries_json").notNull().default("[]"),
    boundaryIntervalsJson: text("boundary_intervals_json").notNull().default("[]"),
    singleStageConfirmed: integer("single_stage_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    confidence: integer("confidence").notNull(),
    confidenceTouched: integer("confidence_touched", { mode: "boolean" })
      .notNull()
      .default(false),
    influenceRating: integer("influence_rating"),
    influenceTouched: integer("influence_touched", { mode: "boolean" })
      .notNull()
      .default(false),
    noChangeConfirmed: integer("no_change_confirmed", { mode: "boolean" })
      .notNull()
      .default(false),
    cueTags: text("cue_tags").notNull().default("[]"),
    rationale: text("rationale").notNull().default(""),
    elapsedMs: integer("elapsed_ms").notNull(),
    revealReadMs: integer("reveal_read_ms").notNull().default(0),
    firstMoveMs: integer("first_move_ms"),
    firstUncertaintyMs: integer("first_uncertainty_ms"),
    adjustmentCount: integer("adjustment_count").notNull().default(0),
    uncertaintyAdjustmentCount: integer("uncertainty_adjustment_count")
      .notNull()
      .default(0),
    clientStartedAt: text("client_started_at"),
    clientSubmittedAt: text("client_submitted_at"),
    responseViewportWidth: integer("response_viewport_width"),
    responseViewportHeight: integer("response_viewport_height"),
    responseOrientation: text("response_orientation").notNull().default("unknown"),
    pageHiddenMs: integer("page_hidden_ms").notNull().default(0),
    activeElapsedMs: integer("active_elapsed_ms").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_modular_responses_session_id").on(table.sessionId),
    index("idx_modular_responses_condition").on(
      table.moduleKey,
      table.taskType,
      table.metricType,
    ),
    uniqueIndex("idx_modular_response_session_trial_disclosure").on(
      table.sessionId,
      table.trialId,
      table.disclosureIndex,
    ),
  ],
);

export const experimentExpectedSteps = sqliteTable(
  "experiment_expected_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    trialId: text("trial_id").notNull(),
    trialOrder: integer("trial_order").notNull(),
    moduleKey: text("module_key").notNull(),
    taskType: text("task_type").notNull(),
    stimulusType: text("stimulus_type").notNull().default("crypto"),
    assetId: text("asset_id").notNull(),
    metricType: text("metric_type").notNull(),
    resolution: text("resolution").notNull(),
    scaleMode: text("scale_mode").notNull(),
    windowMode: text("window_mode").notNull(),
    disclosureIndex: integer("disclosure_index").notNull(),
    disclosureKey: text("disclosure_key").notNull(),
  },
  (table) => [
    uniqueIndex("idx_expected_steps_session_step").on(table.sessionId, table.stepOrder),
    uniqueIndex("idx_expected_steps_session_trial_disclosure").on(
      table.sessionId,
      table.trialId,
      table.disclosureIndex,
    ),
  ],
);

export const experimentStepExposures = sqliteTable(
  "experiment_step_exposures",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_step_exposures_session_step").on(table.sessionId, table.stepOrder),
  ],
);

export const agentRunAttempts = sqliteTable(
  "agent_run_attempts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    modelApiAttemptNumber: integer("model_api_attempt_number").notNull().default(0),
    mechanicalActionId: text("mechanical_action_id").notNull().default(""),
    mechanicalRetryNumber: integer("mechanical_retry_number").notNull().default(0),
    controllerVersion: text("controller_version").notNull().default(""),
    modelRequestId: text("model_request_id").notNull().default(""),
    sourceModelRequestId: text("source_model_request_id").notNull().default(""),
    promptSha256: text("prompt_sha256").notNull().default(""),
    runtimeRequestSha256: text("runtime_request_sha256").notNull().default(""),
    screenshotSha256: text("screenshot_sha256").notNull().default(""),
    outputSha256: text("output_sha256").notNull().default(""),
    actionTraceSha256: text("action_trace_sha256").notNull().default(""),
    contextPolicy: text("context_policy").notNull().default("persistent"),
    inputModality: text("input_modality").notNull().default("screenshot"),
    imageDetail: text("image_detail").notNull().default("auto"),
    temperature: real("temperature"),
    topP: real("top_p"),
    seed: integer("seed"),
    reasoningEffort: text("reasoning_effort").notNull().default(""),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    toolCalls: integer("tool_calls").notNull().default(0),
    status: text("status").notNull().default("submitted"),
    errorCode: text("error_code").notNull().default(""),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    responseId: integer("response_id").references(() => modularResponses.id, { onDelete: "restrict" }),
    responseSha256: text("response_sha256").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_agent_attempts_session_step").on(table.sessionId, table.stepOrder),
    uniqueIndex("idx_agent_attempts_session_step_attempt").on(
      table.sessionId,
      table.stepOrder,
      table.attemptNumber,
    ),
    uniqueIndex("idx_agent_one_submitted_per_step")
      .on(table.sessionId, table.stepOrder)
      .where(sql`${table.status} = 'submitted'`),
    uniqueIndex("idx_agent_attempt_response")
      .on(table.responseId)
      .where(sql`${table.responseId} IS NOT NULL`),
    uniqueIndex("idx_agent_model_request")
      .on(table.sessionId, table.modelRequestId)
      .where(sql`${table.modelRequestId} <> ''`),
    uniqueIndex("idx_agent_mechanical_retry")
      .on(table.sessionId, table.stepOrder, table.mechanicalActionId, table.mechanicalRetryNumber)
      .where(sql`${table.mechanicalActionId} <> '' AND ${table.mechanicalRetryNumber} > 0`),
  ],
);

export const stageDecisions = sqliteTable(
  "stage_decisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => experimentSessions.id, { onDelete: "cascade" }),
    curveId: text("curve_id").notNull(),
    disclosureLevel: integer("disclosure_level").notNull(),
    disclosureKey: text("disclosure_key").notNull(),
    boundary1Index: integer("boundary_1_index").notNull(),
    boundary2Index: integer("boundary_2_index").notNull(),
    boundary1Ratio: real("boundary_1_ratio").notNull(),
    boundary2Ratio: real("boundary_2_ratio").notNull(),
    boundary1Date: text("boundary_1_date").notNull(),
    boundary2Date: text("boundary_2_date").notNull(),
    confidence: integer("confidence").notNull(),
    influenceRating: integer("influence_rating").notNull().default(0),
    cueTags: text("cue_tags").notNull().default("[]"),
    rationale: text("rationale").notNull().default(""),
    elapsedMs: integer("elapsed_ms").notNull(),
    revealReadMs: integer("reveal_read_ms").notNull().default(0),
    firstMoveMs: integer("first_move_ms"),
    adjustmentCount: integer("adjustment_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_decisions_session_id").on(table.sessionId),
    uniqueIndex("idx_decisions_session_curve_layer").on(
      table.sessionId,
      table.curveId,
      table.disclosureLevel,
    ),
  ],
);

export const goLearners = sqliteTable(
  "go_learners",
  {
    id: text("id").primaryKey(),
    nickname: text("nickname").notNull(),
    accessCodeHash: text("access_code_hash").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_go_learners_last_seen").on(table.lastSeenAt)],
);

export const goAttempts = sqliteTable(
  "go_attempts",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => goLearners.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    mode: text("mode").notNull().default("quiz"),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    answersJson: text("answers_json").notNull().default("[]"),
    certificateId: text("certificate_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_go_attempts_learner").on(table.learnerId),
    index("idx_go_attempts_level").on(table.level),
    uniqueIndex("idx_go_attempts_certificate").on(table.certificateId),
  ],
);

export const goProgress = sqliteTable(
  "go_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    learnerId: text("learner_id")
      .notNull()
      .references(() => goLearners.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    bestScore: integer("best_score").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    stars: integer("stars").notNull().default(0),
    completedAt: text("completed_at"),
    lastAttemptAt: text("last_attempt_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_go_progress_learner_level").on(table.learnerId, table.level),
    index("idx_go_progress_level").on(table.level),
  ],
);

export const goGames = sqliteTable(
  "go_games",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id")
      .notNull()
      .references(() => goLearners.id, { onDelete: "cascade" }),
    opponentId: text("opponent_id").notNull(),
    boardSize: integer("board_size").notNull(),
    result: text("result").notNull(),
    scoreJson: text("score_json").notNull().default("{}"),
    moveCount: integer("move_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_go_games_learner").on(table.learnerId),
    index("idx_go_games_opponent").on(table.opponentId),
  ],
);
