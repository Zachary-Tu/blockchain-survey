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
    status: text("status").notNull().default("active"),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [index("idx_sessions_status").on(table.status)],
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
