import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<void> | null = null;

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` before using the experiment recorder."
    );
  }
  return env.DB;
}

export async function ensureExperimentSchema() {
  schemaReady ??= (async () => {
    const d1 = getD1();
    await d1.batch([
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS experiment_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          actor_type TEXT NOT NULL,
          participant_code TEXT NOT NULL DEFAULT '',
          expertise TEXT NOT NULL DEFAULT 'none',
          experimental_arm TEXT NOT NULL DEFAULT 'trajectory',
          protocol_version TEXT NOT NULL,
          study_config_json TEXT NOT NULL DEFAULT '{}',
          model_name TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS research_responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          session_id TEXT NOT NULL,
          stimulus_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          asset_order INTEGER NOT NULL,
          metric_type TEXT NOT NULL,
          task_mode TEXT NOT NULL,
          task_family TEXT NOT NULL DEFAULT 'placement',
          resolution TEXT NOT NULL,
          scale_mode TEXT NOT NULL DEFAULT 'linear',
          disclosure_level INTEGER NOT NULL,
          disclosure_key TEXT NOT NULL,
          boundary_count INTEGER NOT NULL DEFAULT 0,
          boundaries_json TEXT NOT NULL DEFAULT '[]',
          previous_boundaries_json TEXT NOT NULL DEFAULT '[]',
          reference_boundaries_json TEXT NOT NULL DEFAULT '[]',
          boundary_intervals_json TEXT NOT NULL DEFAULT '[]',
          reasonableness_rating INTEGER,
          confidence INTEGER NOT NULL,
          influence_rating INTEGER,
          confidence_touched INTEGER NOT NULL DEFAULT 0,
          influence_touched INTEGER NOT NULL DEFAULT 0,
          no_change_confirmed INTEGER NOT NULL DEFAULT 0,
          cue_tags TEXT NOT NULL DEFAULT '[]',
          rationale TEXT NOT NULL DEFAULT '',
          elapsed_ms INTEGER NOT NULL,
          reveal_read_ms INTEGER NOT NULL DEFAULT 0,
          first_move_ms INTEGER,
          first_uncertainty_ms INTEGER,
          adjustment_count INTEGER NOT NULL DEFAULT 0,
          uncertainty_adjustment_count INTEGER NOT NULL DEFAULT 0,
          scale_switch_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS stage_decisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          session_id TEXT NOT NULL,
          curve_id TEXT NOT NULL,
          disclosure_level INTEGER NOT NULL,
          disclosure_key TEXT NOT NULL,
          boundary_1_index INTEGER NOT NULL,
          boundary_2_index INTEGER NOT NULL,
          boundary_1_ratio REAL NOT NULL,
          boundary_2_ratio REAL NOT NULL,
          boundary_1_date TEXT NOT NULL,
          boundary_2_date TEXT NOT NULL,
          confidence INTEGER NOT NULL,
          influence_rating INTEGER NOT NULL DEFAULT 0,
          cue_tags TEXT NOT NULL DEFAULT '[]',
          rationale TEXT NOT NULL DEFAULT '',
          elapsed_ms INTEGER NOT NULL,
          reveal_read_ms INTEGER NOT NULL DEFAULT 0,
          first_move_ms INTEGER,
          adjustment_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE
        )`),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_sessions_status ON experiment_sessions(status)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_decisions_session_id ON stage_decisions(session_id)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_session_curve_layer ON stage_decisions(session_id, curve_id, disclosure_level)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_research_responses_session_id ON research_responses(session_id)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_research_responses_condition ON research_responses(metric_type, task_mode, resolution)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_response_session_stimulus_layer ON research_responses(session_id, stimulus_id, disclosure_level)",
      ),
    ]);
    const sessionColumnInfo = await d1
      .prepare("PRAGMA table_info(experiment_sessions)")
      .all<{ name: string }>();
    const existingSessionColumns = new Set(
      sessionColumnInfo.results.map((column) => column.name),
    );
    if (!existingSessionColumns.has("study_config_json")) {
      await d1
        .prepare(
          "ALTER TABLE experiment_sessions ADD COLUMN study_config_json TEXT NOT NULL DEFAULT '{}'",
        )
        .run();
    }
    const columnInfo = await d1
      .prepare("PRAGMA table_info(stage_decisions)")
      .all<{ name: string }>();
    const existingColumns = new Set(
      columnInfo.results.map((column) => column.name),
    );
    const additiveMigrations = [
      ["influence_rating", "ALTER TABLE stage_decisions ADD COLUMN influence_rating INTEGER NOT NULL DEFAULT 0"],
      ["cue_tags", "ALTER TABLE stage_decisions ADD COLUMN cue_tags TEXT NOT NULL DEFAULT '[]'"],
      ["reveal_read_ms", "ALTER TABLE stage_decisions ADD COLUMN reveal_read_ms INTEGER NOT NULL DEFAULT 0"],
      ["first_move_ms", "ALTER TABLE stage_decisions ADD COLUMN first_move_ms INTEGER"],
      ["adjustment_count", "ALTER TABLE stage_decisions ADD COLUMN adjustment_count INTEGER NOT NULL DEFAULT 0"],
    ] as const;
    for (const [column, statement] of additiveMigrations) {
      if (!existingColumns.has(column)) {
        await d1.prepare(statement).run();
      }
    }
    const researchColumnInfo = await d1
      .prepare("PRAGMA table_info(research_responses)")
      .all<{ name: string }>();
    const existingResearchColumns = new Set(
      researchColumnInfo.results.map((column) => column.name),
    );
    const researchAdditiveMigrations = [
      ["task_family", "ALTER TABLE research_responses ADD COLUMN task_family TEXT NOT NULL DEFAULT 'placement'"],
      ["previous_boundaries_json", "ALTER TABLE research_responses ADD COLUMN previous_boundaries_json TEXT NOT NULL DEFAULT '[]'"],
      ["boundary_intervals_json", "ALTER TABLE research_responses ADD COLUMN boundary_intervals_json TEXT NOT NULL DEFAULT '[]'"],
      ["first_uncertainty_ms", "ALTER TABLE research_responses ADD COLUMN first_uncertainty_ms INTEGER"],
      ["uncertainty_adjustment_count", "ALTER TABLE research_responses ADD COLUMN uncertainty_adjustment_count INTEGER NOT NULL DEFAULT 0"],
    ] as const;
    for (const [column, statement] of researchAdditiveMigrations) {
      if (!existingResearchColumns.has(column)) {
        await d1.prepare(statement).run();
      }
    }
    await d1.prepare("PRAGMA optimize").run();
  })();
  return schemaReady;
}
