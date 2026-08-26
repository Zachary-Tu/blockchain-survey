import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<void> | null = null;
let goSchemaReady: Promise<void> | null = null;

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
          device_type TEXT NOT NULL DEFAULT 'unknown',
          user_agent TEXT NOT NULL DEFAULT '',
          client_platform TEXT NOT NULL DEFAULT '',
          browser_language TEXT NOT NULL DEFAULT '',
          client_timezone TEXT NOT NULL DEFAULT '',
          screen_width INTEGER,
          screen_height INTEGER,
          viewport_width INTEGER,
          viewport_height INTEGER,
          device_pixel_ratio REAL,
          touch_points INTEGER NOT NULL DEFAULT 0,
          pointer_type TEXT NOT NULL DEFAULT 'unknown',
          screen_orientation TEXT NOT NULL DEFAULT 'unknown',
          status TEXT NOT NULL DEFAULT 'active',
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          practice_completed_at TEXT,
          completed_at TEXT,
          termination_code TEXT NOT NULL DEFAULT ''
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
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS modular_responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          session_id TEXT NOT NULL,
          trial_id TEXT NOT NULL,
          trial_order INTEGER NOT NULL,
          response_version TEXT NOT NULL DEFAULT 'pre-v4',
          module_key TEXT NOT NULL,
          task_type TEXT NOT NULL,
          stimulus_type TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          metric_type TEXT NOT NULL,
          resolution TEXT NOT NULL,
          scale_mode TEXT NOT NULL,
          window_mode TEXT NOT NULL,
          disclosure_index INTEGER NOT NULL,
          disclosure_key TEXT NOT NULL,
          disclosure_state_json TEXT NOT NULL DEFAULT '{}',
          stimulus_window_json TEXT NOT NULL DEFAULT '{}',
          cue_schema_version TEXT NOT NULL DEFAULT 'legacy-cues-v1',
          boundary_count INTEGER NOT NULL DEFAULT 0,
          boundaries_json TEXT NOT NULL DEFAULT '[]',
          previous_boundaries_json TEXT NOT NULL DEFAULT '[]',
          boundary_intervals_json TEXT NOT NULL DEFAULT '[]',
          single_stage_confirmed INTEGER NOT NULL DEFAULT 0,
          confidence INTEGER NOT NULL,
          confidence_touched INTEGER NOT NULL DEFAULT 0,
          influence_rating INTEGER,
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
          client_started_at TEXT,
          client_submitted_at TEXT,
          response_viewport_width INTEGER,
          response_viewport_height INTEGER,
          response_orientation TEXT NOT NULL DEFAULT 'unknown',
          page_hidden_ms INTEGER NOT NULL DEFAULT 0,
          active_elapsed_ms INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS experiment_expected_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          session_id TEXT NOT NULL,
          step_order INTEGER NOT NULL,
          trial_id TEXT NOT NULL,
          trial_order INTEGER NOT NULL,
          module_key TEXT NOT NULL,
          task_type TEXT NOT NULL,
          stimulus_type TEXT NOT NULL DEFAULT 'crypto',
          asset_id TEXT NOT NULL,
          metric_type TEXT NOT NULL,
          resolution TEXT NOT NULL,
          scale_mode TEXT NOT NULL,
          window_mode TEXT NOT NULL,
          disclosure_index INTEGER NOT NULL,
          disclosure_key TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS experiment_step_exposures (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          step_order INTEGER NOT NULL,
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS agent_run_attempts (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          step_order INTEGER NOT NULL,
          attempt_number INTEGER NOT NULL,
          model_api_attempt_number INTEGER NOT NULL DEFAULT 0,
          mechanical_action_id TEXT NOT NULL DEFAULT '',
          mechanical_retry_number INTEGER NOT NULL DEFAULT 0,
          controller_version TEXT NOT NULL DEFAULT '',
          model_request_id TEXT NOT NULL DEFAULT '',
          source_model_request_id TEXT NOT NULL DEFAULT '',
          prompt_sha256 TEXT NOT NULL DEFAULT '',
          runtime_request_sha256 TEXT NOT NULL DEFAULT '',
          screenshot_sha256 TEXT NOT NULL DEFAULT '',
          output_sha256 TEXT NOT NULL DEFAULT '',
          action_trace_sha256 TEXT NOT NULL DEFAULT '',
          context_policy TEXT NOT NULL DEFAULT 'persistent',
          input_modality TEXT NOT NULL DEFAULT 'screenshot',
          image_detail TEXT NOT NULL DEFAULT 'auto',
          temperature REAL,
          top_p REAL,
          seed INTEGER,
          reasoning_effort TEXT NOT NULL DEFAULT '',
          input_tokens INTEGER,
          output_tokens INTEGER,
          tool_calls INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'submitted',
          error_code TEXT NOT NULL DEFAULT '',
          started_at TEXT,
          completed_at TEXT,
          response_id INTEGER,
          response_sha256 TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY (response_id) REFERENCES modular_responses(id) ON DELETE RESTRICT
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS m1_pair_assignments (
          pair_id TEXT PRIMARY KEY NOT NULL,
          protocol_architecture TEXT NOT NULL,
          schedule_id INTEGER NOT NULL,
          information_condition TEXT NOT NULL,
          stimulus_sha256 TEXT NOT NULL,
          event_source_sha256 TEXT NOT NULL,
          assignment_version TEXT NOT NULL,
          cohort_id TEXT NOT NULL DEFAULT 'legacy-unclassified',
          study_phase TEXT NOT NULL DEFAULT 'legacy-unclassified',
          preregistration_version TEXT NOT NULL DEFAULT '',
          analysis_set_version TEXT NOT NULL DEFAULT '',
          implementation_build_id TEXT NOT NULL DEFAULT '',
          deployment_id TEXT NOT NULL DEFAULT '',
          deployment_fingerprint_sha256 TEXT NOT NULL DEFAULT '',
          allocation_mode TEXT NOT NULL DEFAULT 'legacy-unclassified',
          agent_profile_sha256 TEXT NOT NULL DEFAULT '',
          primary_browser_major INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS m1_pair_slots (
          id TEXT PRIMARY KEY NOT NULL,
          pair_id TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          replicate_id TEXT NOT NULL,
          launch_token_hash TEXT NOT NULL,
          session_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (pair_id) REFERENCES m1_pair_assignments(pair_id) ON DELETE CASCADE,
          FOREIGN KEY (launch_token_hash) REFERENCES m1_launch_tokens(token_hash) ON DELETE RESTRICT,
          FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE
        )`),
      d1
        .prepare(`CREATE TABLE IF NOT EXISTS m1_launch_tokens (
          token_hash TEXT PRIMARY KEY NOT NULL,
          pair_id TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          participant_code TEXT NOT NULL,
          replicate_id TEXT NOT NULL,
          schedule_id INTEGER NOT NULL,
          information_condition TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at TEXT,
          terminal_disposition TEXT,
          terminal_at TEXT,
          claimed_session_id TEXT,
          claimed_at TEXT,
          FOREIGN KEY (pair_id) REFERENCES m1_pair_assignments(pair_id) ON DELETE CASCADE
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
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_modular_responses_session_id ON modular_responses(session_id)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_modular_responses_condition ON modular_responses(module_key, task_type, metric_type)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_modular_response_session_trial_disclosure ON modular_responses(session_id, trial_id, disclosure_index)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_expected_steps_session_step ON experiment_expected_steps(session_id, step_order)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_expected_steps_session_trial_disclosure ON experiment_expected_steps(session_id, trial_id, disclosure_index)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_step_exposures_session_step ON experiment_step_exposures(session_id, step_order)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_agent_attempts_session_step ON agent_run_attempts(session_id, step_order)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_attempts_session_step_attempt ON agent_run_attempts(session_id, step_order, attempt_number)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_m1_pair_assignment_condition_schedule ON m1_pair_assignments(information_condition, schedule_id)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_m1_pair_slot_actor_replicate ON m1_pair_slots(pair_id, actor_type, replicate_id)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_m1_pair_slot_session ON m1_pair_slots(session_id)",
      ),
      d1.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_m1_pair_slot_launch_token ON m1_pair_slots(launch_token_hash)",
      ),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS idx_m1_launch_token_pair_actor ON m1_launch_tokens(pair_id, actor_type)",
      ),
    ]);
    const sessionColumnInfo = await d1
      .prepare("PRAGMA table_info(experiment_sessions)")
      .all<{ name: string }>();
    const existingSessionColumns = new Set(
      sessionColumnInfo.results.map((column) => column.name),
    );
    const sessionAdditiveMigrations = [
      ["study_config_json", "ALTER TABLE experiment_sessions ADD COLUMN study_config_json TEXT NOT NULL DEFAULT '{}'"],
      ["device_type", "ALTER TABLE experiment_sessions ADD COLUMN device_type TEXT NOT NULL DEFAULT 'unknown'"],
      ["user_agent", "ALTER TABLE experiment_sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''"],
      ["client_platform", "ALTER TABLE experiment_sessions ADD COLUMN client_platform TEXT NOT NULL DEFAULT ''"],
      ["browser_language", "ALTER TABLE experiment_sessions ADD COLUMN browser_language TEXT NOT NULL DEFAULT ''"],
      ["client_timezone", "ALTER TABLE experiment_sessions ADD COLUMN client_timezone TEXT NOT NULL DEFAULT ''"],
      ["screen_width", "ALTER TABLE experiment_sessions ADD COLUMN screen_width INTEGER"],
      ["screen_height", "ALTER TABLE experiment_sessions ADD COLUMN screen_height INTEGER"],
      ["viewport_width", "ALTER TABLE experiment_sessions ADD COLUMN viewport_width INTEGER"],
      ["viewport_height", "ALTER TABLE experiment_sessions ADD COLUMN viewport_height INTEGER"],
      ["device_pixel_ratio", "ALTER TABLE experiment_sessions ADD COLUMN device_pixel_ratio REAL"],
      ["touch_points", "ALTER TABLE experiment_sessions ADD COLUMN touch_points INTEGER NOT NULL DEFAULT 0"],
      ["pointer_type", "ALTER TABLE experiment_sessions ADD COLUMN pointer_type TEXT NOT NULL DEFAULT 'unknown'"],
      ["screen_orientation", "ALTER TABLE experiment_sessions ADD COLUMN screen_orientation TEXT NOT NULL DEFAULT 'unknown'"],
      ["practice_completed_at", "ALTER TABLE experiment_sessions ADD COLUMN practice_completed_at TEXT"],
      ["termination_code", "ALTER TABLE experiment_sessions ADD COLUMN termination_code TEXT NOT NULL DEFAULT ''"],
    ] as const;
    for (const [column, statement] of sessionAdditiveMigrations) {
      if (!existingSessionColumns.has(column)) {
        await d1.prepare(statement).run();
      }
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
    const modularColumnInfo = await d1
      .prepare("PRAGMA table_info(modular_responses)")
      .all<{ name: string }>();
    const existingModularColumns = new Set(
      modularColumnInfo.results.map((column) => column.name),
    );
    const modularAdditiveMigrations = [
      ["response_version", "ALTER TABLE modular_responses ADD COLUMN response_version TEXT NOT NULL DEFAULT 'pre-v4'"],
      ["stimulus_window_json", "ALTER TABLE modular_responses ADD COLUMN stimulus_window_json TEXT NOT NULL DEFAULT '{}'"],
      ["cue_schema_version", "ALTER TABLE modular_responses ADD COLUMN cue_schema_version TEXT NOT NULL DEFAULT 'legacy-cues-v1'"],
      ["client_started_at", "ALTER TABLE modular_responses ADD COLUMN client_started_at TEXT"],
      ["client_submitted_at", "ALTER TABLE modular_responses ADD COLUMN client_submitted_at TEXT"],
      ["response_viewport_width", "ALTER TABLE modular_responses ADD COLUMN response_viewport_width INTEGER"],
      ["response_viewport_height", "ALTER TABLE modular_responses ADD COLUMN response_viewport_height INTEGER"],
      ["response_orientation", "ALTER TABLE modular_responses ADD COLUMN response_orientation TEXT NOT NULL DEFAULT 'unknown'"],
      ["page_hidden_ms", "ALTER TABLE modular_responses ADD COLUMN page_hidden_ms INTEGER NOT NULL DEFAULT 0"],
      ["active_elapsed_ms", "ALTER TABLE modular_responses ADD COLUMN active_elapsed_ms INTEGER NOT NULL DEFAULT 0"],
    ] as const;
    for (const [column, statement] of modularAdditiveMigrations) {
      if (!existingModularColumns.has(column)) {
        await d1.prepare(statement).run();
      }
    }
    const pairAssignmentColumnInfo = await d1
      .prepare("PRAGMA table_info(m1_pair_assignments)")
      .all<{ name: string }>();
    const existingPairAssignmentColumns = new Set(
      pairAssignmentColumnInfo.results.map((column) => column.name),
    );
    if (!existingPairAssignmentColumns.has("agent_profile_sha256")) {
      await d1.prepare("ALTER TABLE m1_pair_assignments ADD COLUMN agent_profile_sha256 TEXT NOT NULL DEFAULT ''").run();
    }
    if (!existingPairAssignmentColumns.has("primary_browser_major")) {
      await d1.prepare("ALTER TABLE m1_pair_assignments ADD COLUMN primary_browser_major INTEGER NOT NULL DEFAULT 0").run();
    }
    const attemptColumnInfo = await d1
      .prepare("PRAGMA table_info(agent_run_attempts)")
      .all<{ name: string }>();
    const existingAttemptColumns = new Set(
      attemptColumnInfo.results.map((column) => column.name),
    );
    const attemptAdditiveMigrations = [
      ["response_id", "ALTER TABLE agent_run_attempts ADD COLUMN response_id INTEGER"],
      ["response_sha256", "ALTER TABLE agent_run_attempts ADD COLUMN response_sha256 TEXT NOT NULL DEFAULT ''"],
      ["action_trace_sha256", "ALTER TABLE agent_run_attempts ADD COLUMN action_trace_sha256 TEXT NOT NULL DEFAULT ''"],
      ["model_api_attempt_number", "ALTER TABLE agent_run_attempts ADD COLUMN model_api_attempt_number INTEGER NOT NULL DEFAULT 0"],
      ["mechanical_action_id", "ALTER TABLE agent_run_attempts ADD COLUMN mechanical_action_id TEXT NOT NULL DEFAULT ''"],
      ["mechanical_retry_number", "ALTER TABLE agent_run_attempts ADD COLUMN mechanical_retry_number INTEGER NOT NULL DEFAULT 0"],
      ["source_model_request_id", "ALTER TABLE agent_run_attempts ADD COLUMN source_model_request_id TEXT NOT NULL DEFAULT ''"],
      ["runtime_request_sha256", "ALTER TABLE agent_run_attempts ADD COLUMN runtime_request_sha256 TEXT NOT NULL DEFAULT ''"],
    ] as const;
    for (const [column, statement] of attemptAdditiveMigrations) {
      if (!existingAttemptColumns.has(column)) {
        await d1.prepare(statement).run();
      }
    }
    const assignmentColumnInfo = await d1
      .prepare("PRAGMA table_info(m1_pair_assignments)")
      .all<{ name: string }>();
    const existingAssignmentColumns = new Set(
      assignmentColumnInfo.results.map((column) => column.name),
    );
    const assignmentAdditiveMigrations = [
      ["cohort_id", "ALTER TABLE m1_pair_assignments ADD COLUMN cohort_id TEXT NOT NULL DEFAULT 'legacy-unclassified'"],
      ["study_phase", "ALTER TABLE m1_pair_assignments ADD COLUMN study_phase TEXT NOT NULL DEFAULT 'legacy-unclassified'"],
      ["preregistration_version", "ALTER TABLE m1_pair_assignments ADD COLUMN preregistration_version TEXT NOT NULL DEFAULT ''"],
      ["analysis_set_version", "ALTER TABLE m1_pair_assignments ADD COLUMN analysis_set_version TEXT NOT NULL DEFAULT ''"],
      ["implementation_build_id", "ALTER TABLE m1_pair_assignments ADD COLUMN implementation_build_id TEXT NOT NULL DEFAULT ''"],
      ["deployment_id", "ALTER TABLE m1_pair_assignments ADD COLUMN deployment_id TEXT NOT NULL DEFAULT ''"],
      ["deployment_fingerprint_sha256", "ALTER TABLE m1_pair_assignments ADD COLUMN deployment_fingerprint_sha256 TEXT NOT NULL DEFAULT ''"],
      ["allocation_mode", "ALTER TABLE m1_pair_assignments ADD COLUMN allocation_mode TEXT NOT NULL DEFAULT 'legacy-unclassified'"],
    ] as const;
    for (const [column, statement] of assignmentAdditiveMigrations) {
      if (!existingAssignmentColumns.has(column)) {
        await d1.prepare(statement).run();
      }
    }
    const launchTokenColumnInfo = await d1
      .prepare("PRAGMA table_info(m1_launch_tokens)")
      .all<{ name: string }>();
    const existingLaunchTokenColumns = new Set(
      launchTokenColumnInfo.results.map((column) => column.name),
    );
    const launchTokenAdditiveMigrations = [
      ["terminal_disposition", "ALTER TABLE m1_launch_tokens ADD COLUMN terminal_disposition TEXT"],
      ["terminal_at", "ALTER TABLE m1_launch_tokens ADD COLUMN terminal_at TEXT"],
    ] as const;
    for (const [column, statement] of launchTokenAdditiveMigrations) {
      if (!existingLaunchTokenColumns.has(column)) {
        await d1.prepare(statement).run();
      }
    }
    await d1.batch([
      d1.prepare("DROP INDEX IF EXISTS idx_m1_pair_assignment_condition_schedule"),
      d1.prepare("CREATE INDEX idx_m1_pair_assignment_condition_schedule ON m1_pair_assignments(cohort_id, allocation_mode, information_condition, schedule_id)"),
    ]);
    await d1.batch([
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_one_submitted_per_step ON agent_run_attempts(session_id, step_order) WHERE status = 'submitted'"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_attempt_response ON agent_run_attempts(response_id) WHERE response_id IS NOT NULL"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_model_request ON agent_run_attempts(session_id, model_request_id) WHERE model_request_id <> ''"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_mechanical_retry ON agent_run_attempts(session_id, step_order, mechanical_action_id, mechanical_retry_number) WHERE mechanical_action_id <> '' AND mechanical_retry_number > 0"),
    ]);
    await d1.prepare("PRAGMA optimize").run();
  })();
  return schemaReady;
}

export async function ensureGoSchema() {
  goSchemaReady ??= (async () => {
    const d1 = getD1();
    await d1.batch([
      d1.prepare(`CREATE TABLE IF NOT EXISTS go_learners (
        id TEXT PRIMARY KEY NOT NULL,
        nickname TEXT NOT NULL,
        access_code_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      d1.prepare(`CREATE TABLE IF NOT EXISTS go_attempts (
        id TEXT PRIMARY KEY NOT NULL,
        learner_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'quiz',
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        answers_json TEXT NOT NULL DEFAULT '[]',
        certificate_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (learner_id) REFERENCES go_learners(id) ON DELETE CASCADE
      )`),
      d1.prepare(`CREATE TABLE IF NOT EXISTS go_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        learner_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        best_score INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        stars INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        last_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (learner_id) REFERENCES go_learners(id) ON DELETE CASCADE
      )`),
      d1.prepare(`CREATE TABLE IF NOT EXISTS go_games (
        id TEXT PRIMARY KEY NOT NULL,
        learner_id TEXT NOT NULL,
        opponent_id TEXT NOT NULL,
        board_size INTEGER NOT NULL,
        result TEXT NOT NULL,
        score_json TEXT NOT NULL DEFAULT '{}',
        move_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (learner_id) REFERENCES go_learners(id) ON DELETE CASCADE
      )`),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_go_learners_last_seen ON go_learners(last_seen_at)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_go_attempts_learner ON go_attempts(learner_id)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_go_attempts_level ON go_attempts(level)"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_go_attempts_certificate ON go_attempts(certificate_id)"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_go_progress_learner_level ON go_progress(learner_id, level)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_go_progress_level ON go_progress(level)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_go_games_learner ON go_games(learner_id)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS idx_go_games_opponent ON go_games(opponent_id)"),
    ]);
    await d1.prepare("PRAGMA optimize").run();
  })();
  return goSchemaReady;
}
