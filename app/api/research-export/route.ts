import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";
import { ensureExperimentSchema, getDb } from "@/db";
import { experimentSessions, modularResponses } from "@/db/schema";
import { buildCsv, type CsvColumn } from "@/lib/csv";

type ExportRow = {
  session: typeof experimentSessions.$inferSelect;
  response: typeof modularResponses.$inferSelect;
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

function nestedValue(
  json: string,
  index: number,
  key: "date" | "ratio",
) {
  const value = parseJsonArray(json)[index]?.[key];
  return typeof value === "string" || typeof value === "number" ? value : "";
}

const COLUMNS: CsvColumn<ExportRow>[] = [
  { key: "session_id", value: (row) => row.session.id },
  { key: "session_status", value: (row) => row.session.status },
  { key: "session_started_at", value: (row) => row.session.startedAt },
  { key: "session_completed_at", value: (row) => row.session.completedAt },
  { key: "actor_type", value: (row) => row.session.actorType },
  { key: "participant_code", value: (row) => row.session.participantCode },
  { key: "expertise", value: (row) => row.session.expertise },
  { key: "model_name", value: (row) => row.session.modelName },
  { key: "experimental_arm", value: (row) => row.session.experimentalArm },
  { key: "protocol_version", value: (row) => row.session.protocolVersion },
  { key: "study_config_json", value: (row) => row.session.studyConfigJson },
  { key: "response_id", value: (row) => row.response.id },
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
  { key: "uncertainty_adjustment_count", value: (row) => row.response.uncertaintyAdjustmentCount },
  { key: "disclosure_state_json", value: (row) => row.response.disclosureStateJson },
  { key: "stimulus_window_json", value: (row) => row.response.stimulusWindowJson },
  { key: "response_created_at", value: (row) => row.response.createdAt },
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
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "pilot" ? "pilot" : "all";
    const base = getDb()
      .select({ session: experimentSessions, response: modularResponses })
      .from(modularResponses)
      .innerJoin(
        experimentSessions,
        eq(modularResponses.sessionId, experimentSessions.id),
      );
    const rows = scope === "pilot"
      ? await base
          .where(eq(experimentSessions.experimentalArm, "pilot-m1"))
          .orderBy(
            asc(experimentSessions.startedAt),
            asc(modularResponses.trialOrder),
            asc(modularResponses.disclosureIndex),
          )
      : await base.orderBy(
          asc(experimentSessions.startedAt),
          asc(modularResponses.trialOrder),
          asc(modularResponses.disclosureIndex),
        );

    const date = new Date().toISOString().slice(0, 10);
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
