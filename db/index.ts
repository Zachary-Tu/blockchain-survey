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
          model_name TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
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
          rationale TEXT NOT NULL DEFAULT '',
          elapsed_ms INTEGER NOT NULL,
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
    ]);
    await d1.prepare("PRAGMA optimize").run();
  })();
  return schemaReady;
}
