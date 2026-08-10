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
    modelName: text("model_name"),
    status: text("status").notNull().default("active"),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [index("idx_sessions_status").on(table.status)],
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
