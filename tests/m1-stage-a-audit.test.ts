import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditM1StageA,
  M1_STAGE_A_FROZEN_SCOPE,
  type M1StageAExternalGates,
  type M1StageAInputManifest,
  type M1StageAManualStopChecks,
  type M1StageAPairAuditInput,
} from "../lib/m1-stage-a-audit";
import {
  normalizeM1StageAExports,
  parseResearchCsv,
  type CsvTable,
  type M1StageAExportTables,
} from "../lib/m1-stage-a-normalize";
import { buildM1ProtocolPlan, M1_PROTOCOL_VERSION } from "../lib/m1-protocol";
import { hashM1ScientificResponse } from "../lib/m1-response-integrity";

const HASH = "a".repeat(64);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const verifiedManifest: M1StageAInputManifest = {
  allocationsSha256: HASH,
  sessionsSha256: HASH,
  responsesSha256: HASH,
  stepExposuresSha256: HASH,
  agentAttemptsSha256: HASH,
  exportBundleSha256: HASH,
  externalEvidenceSha256: HASH,
  verified: true,
};

const completeGates: M1StageAExternalGates = {
  stageACollectionClosed: true,
  inputExportBundleHashVerified: true,
  eventSourceArchiveVerified: true,
  ethicsDecisionArchived: true,
  approvedConsentAndDataPlanArchived: true,
  humanScreeningProtocolArchived: true,
  deploymentManifestArchived: true,
  withdrawalExclusionProcessVerified: true,
  rawUaMinimizationAuditArchived: true,
  dataLossAuditArchived: true,
  futureDisclosureAuditArchived: true,
  executableControllerArchived: true,
  runtimePromptPackageArchived: true,
  frozenModelAndApiArchived: true,
  frozenBrowserRuntimeArchived: true,
  runArtifactManifestHashLinked: true,
  externalEvidenceBundleHashVerified: true,
};

const zeroStopChecks: M1StageAManualStopChecks = {
  confirmedDataLossCount: 0,
  confirmedDataLossAuditSha256: HASH,
  futureDisclosureLeakageCount: 0,
  futureDisclosureAuditSha256: HASH,
};

function completeSession(actor: "human" | "agent", completionMinutes = 40) {
  return {
    actor,
    status: "complete" as const,
    completionMinutes,
    integrityComplete: true,
    hasProtocolDeviation: false,
    g0JudgmentCount: 6,
    g0ExactDefaultAnchorCount: 0,
  };
}

function completePairs(): M1StageAPairAuditInput[] {
  return (["staged", "repeat-control"] as const).flatMap((condition) =>
    Array.from({ length: 6 }, (_, index) => ({
      pairId: `${condition}-${index + 1}`,
      condition,
      scheduleId: index + 1,
      human: completeSession("human"),
      agent: completeSession("agent"),
      humanPreStartTerminal: null,
      agentPreStartTerminal: null,
    })),
  );
}

function runAudit(overrides: Partial<Parameters<typeof auditM1StageA>[0]> = {}) {
  return auditM1StageA({
    scope: { ...M1_STAGE_A_FROZEN_SCOPE },
    inputManifest: { ...verifiedManifest },
    pairs: completePairs(),
    manualStopChecks: { ...zeroStopChecks },
    externalGates: { ...completeGates },
    ...overrides,
  });
}

function csvTable(rows: Array<Record<string, string>>): CsvTable {
  assert.ok(rows.length > 0);
  return { headers: Object.keys(rows[0]), rows };
}

async function validFiveTableFixture(): Promise<M1StageAExportTables> {
  const pairId = "stage-a-pair-01";
  const scheduleId = "1";
  const condition = "staged";
  const scopeColumns = {
    cohort_id: M1_STAGE_A_FROZEN_SCOPE.cohortId,
    protocol_architecture: M1_STAGE_A_FROZEN_SCOPE.protocolArchitecture,
    implementation_build_id: M1_STAGE_A_FROZEN_SCOPE.implementationBuildId,
    allocation_mode: "balanced-random-v1",
    stimulus_sha256: M1_STAGE_A_FROZEN_SCOPE.stimulusSha256,
    event_source_sha256: M1_STAGE_A_FROZEN_SCOPE.eventSourceSha256,
    deployment_id: "m1-stage-a-test-deployment",
    deployment_fingerprint_sha256: "d".repeat(64),
  };
  const sessions = (["human", "agent"] as const).map((actor) => ({
    session_id: `${actor}-session-01`,
    session_status: "complete",
    session_started_at: "2026-08-01 00:00:00",
    session_completed_at: "2026-08-01 00:40:00",
    actor_type: actor,
    experimental_arm: actor === "human" ? "m1-main" : "agent-m1-main",
    protocol_version: M1_PROTOCOL_VERSION,
    practice_completed_at: "2026-08-01 00:01:00",
    pair_id: pairId,
    schedule_id: scheduleId,
    information_condition: condition,
    ...scopeColumns,
    primary_browser_major: "130",
    device_type: "desktop",
    initial_viewport_width: "1440",
    initial_viewport_height: "900",
    device_pixel_ratio: "1",
    pointer_type: "fine",
    screen_orientation: "landscape-primary",
    user_agent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36",
    // Deliberately wrong: the normalizer must derive eligibility from raw telemetry.
    primary_protocol_eligible: "false",
  }));
  const allocations = (["human", "agent"] as const).map((actor) => ({
    pair_id: pairId,
    actor_type: actor,
    replicate_id: actor === "human" ? "human-primary" : "R-PRIMARY",
    schedule_id: scheduleId,
    information_condition: condition,
    assignment_version: "balanced-random-v1",
    ...scopeColumns,
    primary_browser_major: "130",
    token_sha256: (actor === "human" ? "b" : "c").repeat(64),
    token_created_at: "2026-07-31T23:59:00.000Z",
    token_claimed_at: "2026-08-01T00:00:00.000Z",
    claimed_session_id: `${actor}-session-01`,
    revoked_at: "",
    terminal_disposition: "",
    terminal_at: "",
  }));
  const responses: Array<Record<string, string>> = [];
  const stepExposures: Array<Record<string, string>> = [];
  const agentAttempts: Array<Record<string, string>> = [];
  const plan = buildM1ProtocolPlan(1, "staged");
  let responseId = 1;
  const weeklyWindows: Record<string, { start: string; end: string; observationCount: number }> = {
    bitcoin: { start: "2010-10-21", end: "2026-04-06", observationCount: 808 },
    ethereum: { start: "2015-11-16", end: "2026-04-06", observationCount: 543 },
    solana: { start: "2020-07-19", end: "2026-04-06", observationCount: 300 },
    bnb: { start: "2017-11-02", end: "2026-04-06", observationCount: 441 },
    xrp: { start: "2013-11-13", end: "2026-04-06", observationCount: 648 },
    dogecoin: { start: "2014-03-26", end: "2026-04-06", observationCount: 629 },
  };
  const dateAtRatio = (assetId: string, ratio: number) => {
    const window = weeklyWindows[assetId];
    const index = Math.round(ratio * (window.observationCount - 1));
    return {
      index,
      date: index === 0
        ? window.start
        : new Date(
            Date.parse(`${window.end}T00:00:00Z`) -
            (window.observationCount - 1 - index) * 7 * 86_400_000,
          ).toISOString().slice(0, 10),
    };
  };
  const scientificAnswer = (assetId: string, disclosureIndex: number) => {
    const displayedWindow = weeklyWindows[assetId];
    const stimulusWindowJson = JSON.stringify({
      mode: "whole",
      source: displayedWindow,
      displayed: displayedWindow,
      curatedRule: null,
    });
    const ratios = disclosureIndex === 0
      ? [Number((1 / 3).toFixed(6)), Number((2 / 3).toFixed(6))]
      : [Number((1 / 3 - disclosureIndex * 0.002).toFixed(6)), Number((2 / 3 + disclosureIndex * 0.002).toFixed(6))];
    const boundaries = ratios.map((ratio) => ({ ...dateAtRatio(assetId, ratio), ratio }));
    const boundaryIntervals = ratios.map((centerRatio, boundaryIndex) => {
      const halfWidthRatio = 0.05;
      const lowerRatio = Number((centerRatio - halfWidthRatio).toFixed(6));
      const upperRatio = Number((centerRatio + halfWidthRatio).toFixed(6));
      const lower = dateAtRatio(assetId, lowerRatio);
      const upper = dateAtRatio(assetId, upperRatio);
      return {
        boundaryIndex,
        centerRatio,
        halfWidthRatio,
        widthRatio: Number((upperRatio - lowerRatio).toFixed(6)),
        lowerRatio,
        upperRatio,
        lowerIndex: lower.index,
        upperIndex: upper.index,
        lowerDate: lower.date,
        upperDate: upper.date,
      };
    });
    return {
      boundariesJson: JSON.stringify(boundaries),
      boundaryIntervalsJson: JSON.stringify(boundaryIntervals),
      stimulusWindowJson,
    };
  };
  for (const actor of ["human", "agent"] as const) {
    const sessionId = `${actor}-session-01`;
    for (let disclosureIndex = 0; disclosureIndex < 7; disclosureIndex += 1) {
      for (const trial of plan) {
        const stepOrder = disclosureIndex * 6 + trial.order;
        const currentResponseId = responseId;
        responseId += 1;
        const { boundariesJson, boundaryIntervalsJson, stimulusWindowJson } = scientificAnswer(trial.assetId, disclosureIndex);
        const previousBoundariesJson = disclosureIndex === 0
          ? "[]"
          : scientificAnswer(trial.assetId, disclosureIndex - 1).boundariesJson;
        const response = {
          session_id: sessionId,
          actor_type: actor,
          pair_id: pairId,
          schedule_id: scheduleId,
          information_condition: condition,
          ...scopeColumns,
          response_id: String(currentResponseId),
          step_order: String(stepOrder),
          trial_id: trial.id,
          trial_order: String(trial.order),
          response_version: M1_PROTOCOL_VERSION,
          module_key: "disclosure",
          task_type: "T2",
          stimulus_type: "crypto",
          asset_id: trial.assetId,
          metric_type: "price",
          resolution: "weekly",
          scale_mode: "linear",
          window_mode: "whole",
          disclosure_index: String(disclosureIndex),
          disclosure_key: trial.disclosures[disclosureIndex],
          cue_schema_version: "none",
          boundaries_json: boundariesJson,
          previous_boundaries_json: previousBoundariesJson,
          boundary_intervals_json: boundaryIntervalsJson,
          stimulus_window_json: stimulusWindowJson,
          influence_rating: disclosureIndex === 0 ? "" : "3",
          no_change_confirmed: "false",
          single_stage_confirmed: "false",
          cue_tags_json: "[]",
          rationale: "",
          adjustment_count: disclosureIndex === 0 ? "0" : "1",
          first_move_ms: disclosureIndex === 0 ? "" : "100",
          response_viewport_width: "1440",
          response_viewport_height: "900",
          response_orientation: "landscape-primary",
          // Deliberately wrong derived columns: both must be ignored.
          g0_exact_default_anchor: "false",
          response_protocol_eligible: "false",
        };
        responses.push(response);
        stepExposures.push({
          session_id: sessionId,
          pair_id: pairId,
          actor_type: actor,
          cohort_id: scopeColumns.cohort_id,
          allocation_mode: scopeColumns.allocation_mode,
          deployment_id: scopeColumns.deployment_id,
          deployment_fingerprint_sha256: scopeColumns.deployment_fingerprint_sha256,
          step_order: String(stepOrder),
          trial_id: trial.id,
          disclosure_index: String(disclosureIndex),
          response_id: String(currentResponseId),
          server_page_elapsed_ms: "60000",
        });
        if (actor === "agent") {
          const responseSha256 = await hashM1ScientificResponse({
            sessionId,
            stepOrder,
            trialId: trial.id,
            disclosureIndex,
            boundariesJson,
            previousBoundariesJson,
            boundaryIntervalsJson,
            influenceRating: disclosureIndex === 0 ? null : 3,
            noChangeConfirmed: false,
            singleStageConfirmed: false,
          });
          agentAttempts.push({
            session_id: sessionId,
            pair_id: pairId,
            schedule_id: scheduleId,
            information_condition: condition,
            cohort_id: scopeColumns.cohort_id,
            allocation_mode: scopeColumns.allocation_mode,
            deployment_id: scopeColumns.deployment_id,
            deployment_fingerprint_sha256: scopeColumns.deployment_fingerprint_sha256,
            step_order: String(stepOrder),
            attempt_number: "1",
            model_api_attempt_number: "1",
            mechanical_action_id: "",
            mechanical_retry_number: "0",
            model_request_id: `request-${stepOrder}`,
            source_model_request_id: "",
            prompt_sha256: HASH,
            runtime_request_sha256: HASH,
            screenshot_sha256: HASH,
            output_sha256: HASH,
            action_trace_sha256: HASH,
            response_id: String(currentResponseId),
            response_sha256: responseSha256,
            tool_calls: "1",
            status: "submitted",
            error_code: "",
            started_at: "2026-08-01T00:00:00.000Z",
            completed_at: "2026-08-01T00:00:01.000Z",
          });
        }
      }
    }
  }
  return {
    allocations: csvTable(allocations),
    sessions: csvTable(sessions),
    responses: csvTable(responses),
    stepExposures: csvTable(stepExposures),
    agentAttempts: csvTable(agentAttempts),
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function runCliHashCheck(options: {
  corruptExportHash?: boolean;
  corruptBundleHash?: boolean;
  corruptEvidenceHash?: boolean;
}) {
  const directory = mkdtempSync(join(tmpdir(), "m1-stage-a-audit-test-"));
  try {
    const keys = ["allocations", "sessions", "responses", "stepExposures", "agentAttempts"] as const;
    const hashes = {} as Record<(typeof keys)[number], string>;
    const exports = {} as Record<(typeof keys)[number], { path: string; sha256: string }>;
    for (const key of keys) {
      const contents = `${key}\n`;
      const path = `${key}.csv`;
      writeFileSync(join(directory, path), contents, "utf8");
      hashes[key] = sha256(contents);
      exports[key] = { path, sha256: hashes[key] };
    }
    if (options.corruptExportHash) exports.allocations.sha256 = HASH;
    const bundleMaterial = `${keys.map((key) => `${key}:${hashes[key]}`).join("\n")}\n`;
    const evidenceContents = "{}\n";
    writeFileSync(join(directory, "evidence.json"), evidenceContents, "utf8");
    const config = {
      schemaVersion: "m1-stage-a-audit-config-v2",
      scope: { ...M1_STAGE_A_FROZEN_SCOPE },
      exports,
      exportBundleSha256: options.corruptBundleHash ? HASH : sha256(bundleMaterial),
      externalEvidence: {
        path: "evidence.json",
        sha256: options.corruptEvidenceHash ? HASH : sha256(evidenceContents),
      },
    };
    const configPath = join(directory, "config.json");
    writeFileSync(configPath, JSON.stringify(config), "utf8");
    return spawnSync(
      process.execPath,
      ["--import", "tsx", join(PROJECT_ROOT, "scripts", "audit-m1-stage-a.ts"), configPath],
      { cwd: PROJECT_ROOT, encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("GO requires a complete, valid frozen Stage-A bundle", () => {
  const result = runAudit();
  assert.equal(result.decision, "GO");
  assert.equal(result.completeMatchedPairs, 12);
  assert.deepEqual(result.inputValidationReasons, []);
  assert.deepEqual(result.pendingExternalGates, []);
});

test("a missing primary slot is NOT_EVALUABLE", () => {
  const pairs = completePairs();
  pairs[0].human = null;
  const result = runAudit({ pairs });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.equal(result.allPrimarySlotsTerminal, false);
});

test("a legal pre-start terminal allocation closes its slot without inflating started", () => {
  const pairs = completePairs();
  pairs[0].human = null;
  pairs[0].humanPreStartTerminal = {
    disposition: "no-show-expired",
    terminalAt: "2026-08-25T12:00:00.000Z",
  };
  const result = runAudit({ pairs });
  assert.equal(result.decision, "GO");
  assert.equal(result.allPrimarySlotsTerminal, true);
  assert.equal(result.actorSummary.human.started, 11);
  assert.equal(result.actorSummary.human.complete, 11);
  assert.equal(result.completeMatchedPairs, 11);
  assert.equal(result.preStartTerminalSummary.human.total, 1);
  assert.equal(result.preStartTerminalSummary.human.byDisposition["no-show-expired"], 1);
});

test("a slot cannot have both a real session and a pre-start terminal outcome", () => {
  const pairs = completePairs();
  pairs[0].humanPreStartTerminal = {
    disposition: "declined-before-start",
    terminalAt: "2026-08-25T12:00:00.000Z",
  };
  const result = runAudit({ pairs });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.ok(result.inputValidationReasons.includes(
    `session-prestart-terminal-conflict:${pairs[0].pairId}:human`,
  ));
});

test("collection closure and verified input bundle are hard evaluability gates", () => {
  const result = runAudit({
    externalGates: {
      ...completeGates,
      stageACollectionClosed: false,
      inputExportBundleHashVerified: false,
    },
  });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.ok(result.pendingExternalGates.includes("stageACollectionClosed"));
  assert.ok(result.pendingExternalGates.includes("inputExportBundleHashVerified"));
});

test("a complete session with failed reconstructed integrity triggers STOP", () => {
  const pairs = completePairs();
  pairs[0].agent!.integrityComplete = false;
  const result = runAudit({ pairs });
  assert.equal(result.decision, "STOP");
  assert.ok(result.stopReasons.includes(`complete-session-integrity-failed:${pairs[0].pairId}:agent`));
});

test("a confirmed disclosure leak triggers STOP even when coverage is incomplete", () => {
  const pairs = completePairs();
  pairs[0].human = null;
  const result = runAudit({
    pairs,
    manualStopChecks: {
      ...zeroStopChecks,
      futureDisclosureLeakageCount: 1,
    },
  });
  assert.equal(result.decision, "STOP");
  assert.ok(result.stopReasons.includes("future-disclosure-leakage"));
});

test("insufficient complete matched pairs produces REVISE after every slot is terminal", () => {
  const pairs = completePairs();
  for (const pair of pairs.slice(0, 3)) {
    pair.human = {
      ...pair.human!,
      status: "aborted",
      completionMinutes: null,
      integrityComplete: false,
      g0JudgmentCount: 0,
    };
  }
  const result = runAudit({ pairs });
  assert.equal(result.decision, "REVISE");
  assert.equal(result.completeMatchedPairs, 9);
  assert.ok(result.reviseReasons.includes("complete-matched-pairs-below-10"));
});

test("passing quantitative rules but missing an external artifact is GO_PENDING", () => {
  const result = runAudit({
    externalGates: { ...completeGates, executableControllerArchived: false },
  });
  assert.equal(result.decision, "GO_PENDING_EXTERNAL_GATES");
  assert.deepEqual(result.pendingExternalGates, ["executableControllerArchived"]);
});

test("an actor swapped into the other primary slot can never GO", () => {
  const pairs = completePairs();
  pairs[0].human = completeSession("agent");
  const result = runAudit({ pairs });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.ok(result.inputValidationReasons.includes(`actor-slot-mismatch:${pairs[0].pairId}:human`));
});

test("a complete session without a duration can never GO", () => {
  const pairs = completePairs();
  pairs[0].human!.completionMinutes = null;
  const result = runAudit({ pairs });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.ok(result.inputValidationReasons.includes(`complete-duration-missing:${pairs[0].pairId}:human`));
});

test("a complete session without all six G0 judgments can never GO", () => {
  const pairs = completePairs();
  pairs[0].human!.g0JudgmentCount = 0;
  const result = runAudit({ pairs });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.ok(result.inputValidationReasons.includes(`complete-g0-count-not-six:${pairs[0].pairId}:human`));
});

test("a cohort or frozen implementation mismatch can never GO", () => {
  const result = runAudit({
    scope: { ...M1_STAGE_A_FROZEN_SCOPE, cohortId: "invented-cohort" },
  });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.equal(result.frozenScopeVerified, false);
  assert.ok(result.inputValidationReasons.includes("frozen-scope-mismatch"));
});

test("an unverified or malformed export manifest can never GO", () => {
  const result = runAudit({
    inputManifest: {
      ...verifiedManifest,
      responsesSha256: "not-a-sha256",
      verified: false,
    },
  });
  assert.equal(result.decision, "NOT_EVALUABLE");
  assert.equal(result.inputManifestVerified, false);
  assert.ok(result.inputValidationReasons.includes("input-manifest-unverified"));
});

test("zero cannot stand in for unknown data-loss or leakage evidence", () => {
  const result = runAudit({
    manualStopChecks: {
      confirmedDataLossCount: 0,
      confirmedDataLossAuditSha256: null,
      futureDisclosureLeakageCount: 0,
      futureDisclosureAuditSha256: null,
    },
  });
  assert.notEqual(result.decision, "GO");
  assert.equal(result.decision, "GO_PENDING_EXTERNAL_GATES");
  assert.ok(result.pendingExternalGates.includes("dataLossAuditArchived"));
  assert.ok(result.pendingExternalGates.includes("futureDisclosureAuditArchived"));
});

test("null unknown counts also remain pending and can never GO", () => {
  const result = runAudit({
    manualStopChecks: {
      confirmedDataLossCount: null,
      confirmedDataLossAuditSha256: null,
      futureDisclosureLeakageCount: null,
      futureDisclosureAuditSha256: null,
    },
  });
  assert.notEqual(result.decision, "GO");
  assert.ok(result.pendingExternalGates.includes("dataLossAuditArchived"));
  assert.ok(result.pendingExternalGates.includes("futureDisclosureAuditArchived"));
});

test("an omitted external gate is treated as unknown rather than passing", () => {
  const incompleteGates = { ...completeGates } as Partial<M1StageAExternalGates>;
  delete incompleteGates.ethicsDecisionArchived;
  const result = runAudit({ externalGates: incompleteGates as M1StageAExternalGates });
  assert.equal(result.decision, "GO_PENDING_EXTERNAL_GATES");
  assert.ok(result.pendingExternalGates.includes("ethicsDecisionArchived"));
});

test("completion time uses the conventional even-sample median", () => {
  const pairs = completePairs();
  pairs.forEach((pair, index) => {
    pair.human!.completionMinutes = index < 6 ? 40 : 60;
  });
  const result = runAudit({ pairs });
  assert.equal(result.actorSummary.human.medianCompletionMinutes, 50);
  assert.equal(result.decision, "REVISE");
  assert.ok(result.reviseReasons.includes("median-completion-above-45-minutes:human"));
});

test("CSV parsing preserves quoted commas, escaped quotes, and embedded newlines", () => {
  const table = parseResearchCsv('\uFEFFid,note\r\n1,"comma, quote ""ok"""\r\n2,"line one\nline two"\r\n');
  assert.deepEqual(table.headers, ["id", "note"]);
  assert.deepEqual(table.rows, [
    { id: "1", note: 'comma, quote "ok"' },
    { id: "2", note: "line one\nline two" },
  ]);
});

test("five verified export tables normalize into linked Human and Agent summaries", async () => {
  const pairs = await normalizeM1StageAExports(
    { ...M1_STAGE_A_FROZEN_SCOPE },
    await validFiveTableFixture(),
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].pairId, "stage-a-pair-01");
  assert.equal(pairs[0].human?.actor, "human");
  assert.equal(pairs[0].agent?.actor, "agent");
  assert.equal(pairs[0].human?.completionMinutes, 40);
  assert.equal(pairs[0].agent?.completionMinutes, 40);
  assert.equal(pairs[0].human?.g0JudgmentCount, 6);
  assert.equal(pairs[0].agent?.g0JudgmentCount, 6);
  assert.equal(pairs[0].human?.g0ExactDefaultAnchorCount, 6);
  assert.equal(pairs[0].agent?.g0ExactDefaultAnchorCount, 6);
  assert.equal(pairs[0].human?.hasProtocolDeviation, false);
  assert.equal(pairs[0].agent?.hasProtocolDeviation, false);
  assert.equal(pairs[0].human?.integrityComplete, true);
  assert.equal(pairs[0].agent?.integrityComplete, true);
});

test("five-table normalization rejects a response actor swap", async () => {
  const tables = await validFiveTableFixture();
  tables.responses.rows[0].actor_type = "agent";
  await assert.rejects(
    normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
    /actor_type does not match its session/,
  );
});

test("five-table normalization requires one deployment identity across every raw row", async (context) => {
  await context.test("a row from another deployment is rejected", async () => {
    const tables = await validFiveTableFixture();
    tables.responses.rows[0].deployment_fingerprint_sha256 = "e".repeat(64);
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /do not share exactly one deployment identity/,
    );
  });
  await context.test("an empty deployment ID is rejected", async () => {
    const tables = await validFiveTableFixture();
    tables.stepExposures.rows[0].deployment_id = "";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /invalid deployment_id/,
    );
  });
});

test("five-table normalization requires unique valid allocation token hashes", async (context) => {
  await context.test("missing Human token hash", async () => {
    const tables = await validFiveTableFixture();
    const human = tables.allocations.rows.find((row) => row.actor_type === "human");
    assert.ok(human);
    human.token_sha256 = "";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /Invalid allocation token SHA-256/,
    );
  });
  await context.test("duplicate Human and Agent token hash", async () => {
    const tables = await validFiveTableFixture();
    const human = tables.allocations.rows.find((row) => row.actor_type === "human");
    const agent = tables.allocations.rows.find((row) => row.actor_type === "agent");
    assert.ok(human);
    assert.ok(agent);
    human.token_sha256 = agent.token_sha256;
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /Duplicate allocation token SHA-256/,
    );
  });
  await context.test("malformed Human token hash", async () => {
    const tables = await validFiveTableFixture();
    const human = tables.allocations.rows.find((row) => row.actor_type === "human");
    assert.ok(human);
    human.token_sha256 = "not-a-sha256";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /Invalid allocation token SHA-256/,
    );
  });
});

test("allocation lifecycle distinguishes open, terminal, and claimed slots", async (context) => {
  await context.test("an open unclaimed slot is preserved without fabricating a session", async () => {
    const tables = await validFiveTableFixture();
    const humanAllocation = tables.allocations.rows[0];
    humanAllocation.claimed_session_id = "";
    humanAllocation.token_claimed_at = "";
    tables.sessions.rows = tables.sessions.rows.filter((row) => row.actor_type !== "human");
    tables.responses.rows = tables.responses.rows.filter((row) => row.actor_type !== "human");
    tables.stepExposures.rows = tables.stepExposures.rows.filter((row) => row.actor_type !== "human");
    const [pair] = await normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables);
    assert.equal(pair.human, null);
    assert.equal(pair.humanPreStartTerminal, null);
  });
  await context.test("a pre-start terminal slot is explicit and has no session", async () => {
    const tables = await validFiveTableFixture();
    const humanAllocation = tables.allocations.rows[0];
    humanAllocation.claimed_session_id = "";
    humanAllocation.token_claimed_at = "";
    humanAllocation.revoked_at = "2026-08-02T00:00:00.000Z";
    humanAllocation.terminal_disposition = "no-show-expired";
    humanAllocation.terminal_at = humanAllocation.revoked_at;
    tables.sessions.rows = tables.sessions.rows.filter((row) => row.actor_type !== "human");
    tables.responses.rows = tables.responses.rows.filter((row) => row.actor_type !== "human");
    tables.stepExposures.rows = tables.stepExposures.rows.filter((row) => row.actor_type !== "human");
    const [pair] = await normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables);
    assert.equal(pair.human, null);
    assert.deepEqual(pair.humanPreStartTerminal, {
      disposition: "no-show-expired",
      terminalAt: "2026-08-02T00:00:00.000Z",
    });
  });
  await context.test("a partial pre-start terminal record is rejected", async () => {
    const tables = await validFiveTableFixture();
    const humanAllocation = tables.allocations.rows[0];
    humanAllocation.claimed_session_id = "";
    humanAllocation.token_claimed_at = "";
    humanAllocation.terminal_disposition = "no-show-expired";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /terminal_at and revoked_at must be the same server timestamp/,
    );
  });
  await context.test("one session claimed by two allocations", async () => {
    const tables = await validFiveTableFixture();
    tables.allocations.rows[1].claimed_session_id = tables.allocations.rows[0].claimed_session_id;
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /claimed_session_id is linked from more than one allocation/,
    );
  });
});

test("G0 anchoring is recomputed from ratios and interaction telemetry", async () => {
  const tables = await validFiveTableFixture();
  for (const row of tables.responses.rows) {
    if (row.actor_type === "human" && row.disclosure_index === "0") {
      row.adjustment_count = "1";
      row.first_move_ms = "50";
      row.g0_exact_default_anchor = "true";
    }
  }
  const [pair] = await normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables);
  assert.equal(pair.human?.g0ExactDefaultAnchorCount, 0);
  assert.equal(pair.agent?.g0ExactDefaultAnchorCount, 6);
});

test("response protocol deviation is recomputed from raw viewport telemetry", async () => {
  const tables = await validFiveTableFixture();
  const row = tables.responses.rows.find((candidate) => candidate.actor_type === "human");
  assert.ok(row);
  row.response_viewport_width = "1439";
  row.response_protocol_eligible = "true";
  const [pair] = await normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables);
  assert.equal(pair.human?.hasProtocolDeviation, true);
  assert.equal(pair.agent?.hasProtocolDeviation, false);
});

test("initial protocol deviation is recomputed from raw device telemetry", async () => {
  const tables = await validFiveTableFixture();
  const session = tables.sessions.rows.find((candidate) => candidate.actor_type === "human");
  assert.ok(session);
  session.device_type = "mobile";
  session.primary_protocol_eligible = "true";
  const [pair] = await normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables);
  assert.equal(pair.human?.hasProtocolDeviation, true);
  assert.equal(pair.agent?.hasProtocolDeviation, false);
});

test("five-table normalization rejects a boundary date inconsistent with its ratio", async () => {
  const tables = await validFiveTableFixture();
  const row = tables.responses.rows.find((candidate) =>
    candidate.actor_type === "human" && candidate.disclosure_index === "0");
  assert.ok(row);
  const boundaries = JSON.parse(row.boundaries_json) as Array<Record<string, unknown>>;
  const window = JSON.parse(row.stimulus_window_json) as { displayed: { end: string } };
  boundaries[0].date = window.displayed.end;
  row.boundaries_json = JSON.stringify(boundaries);
  await assert.rejects(
    normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
    /date is inconsistent with ratio/,
  );
});

test("five-table normalization rejects unordered boundary records", async () => {
  const tables = await validFiveTableFixture();
  const row = tables.responses.rows.find((candidate) =>
    candidate.actor_type === "human" && candidate.disclosure_index === "0");
  assert.ok(row);
  const boundaries = JSON.parse(row.boundaries_json) as Array<Record<string, unknown>>;
  row.boundaries_json = JSON.stringify([...boundaries].reverse());
  await assert.rejects(
    normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
    /boundaries must be strictly ordered/,
  );
});

test("five-table normalization rejects an interval inconsistent with its boundary", async () => {
  const tables = await validFiveTableFixture();
  const row = tables.responses.rows.find((candidate) =>
    candidate.actor_type === "human" && candidate.disclosure_index === "0");
  assert.ok(row);
  const intervals = JSON.parse(row.boundary_intervals_json) as Array<Record<string, unknown>>;
  intervals[0].upperRatio = 0.99;
  row.boundary_intervals_json = JSON.stringify(intervals);
  await assert.rejects(
    normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
    /is inconsistent with its boundary/,
  );
});

test("five-table normalization rejects a broken previous-disclosure boundary link", async () => {
  const tables = await validFiveTableFixture();
  const row = tables.responses.rows.find((candidate) =>
    candidate.actor_type === "human" && candidate.disclosure_index === "1");
  assert.ok(row);
  row.previous_boundaries_json = row.boundaries_json;
  await assert.rejects(
    normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
    /Previous boundaries do not match the prior disclosure/,
  );
});

test("five-table normalization enforces disclosure-specific influence ratings", async (context) => {
  await context.test("G0 must have no rating", async () => {
    const tables = await validFiveTableFixture();
    const row = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "0");
    assert.ok(row);
    row.influence_rating = "3";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /influence_rating does not match its disclosure/,
    );
  });
  await context.test("later disclosures require an integer from 1 to 5", async () => {
    const tables = await validFiveTableFixture();
    const row = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "1");
    assert.ok(row);
    row.influence_rating = "6";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /influence_rating does not match its disclosure/,
    );
  });
  await context.test("later disclosures cannot omit the rating", async () => {
    const tables = await validFiveTableFixture();
    const row = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "1");
    assert.ok(row);
    row.influence_rating = "";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /influence_rating does not match its disclosure/,
    );
  });
});

test("five-table normalization rejects single-stage confirmation for fixed T2", async () => {
  const tables = await validFiveTableFixture();
  tables.responses.rows[0].single_stage_confirmed = "true";
  await assert.rejects(
    normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
    /fixed T2 cannot be single-stage/,
  );
});

test("no_change_confirmed must match centers and uncertainty widths", async (context) => {
  await context.test("an unchanged answer must be confirmed", async () => {
    const tables = await validFiveTableFixture();
    const current = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "1");
    assert.ok(current);
    const prior = tables.responses.rows.find((candidate) =>
      candidate.session_id === current.session_id && candidate.trial_id === current.trial_id &&
      candidate.disclosure_index === "0");
    assert.ok(prior);
    current.boundaries_json = prior.boundaries_json;
    current.boundary_intervals_json = prior.boundary_intervals_json;
    current.no_change_confirmed = "false";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /no_change_confirmed does not match the prior scientific answer/,
    );
  });
  await context.test("a changed answer cannot claim no change", async () => {
    const tables = await validFiveTableFixture();
    const current = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "1");
    assert.ok(current);
    current.no_change_confirmed = "true";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /no_change_confirmed does not match the prior scientific answer/,
    );
  });
  await context.test("an uncertainty-only change cannot claim no change", async () => {
    const tables = await validFiveTableFixture();
    const current = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "1");
    assert.ok(current);
    const prior = tables.responses.rows.find((candidate) =>
      candidate.session_id === current.session_id && candidate.trial_id === current.trial_id &&
      candidate.disclosure_index === "0");
    assert.ok(prior);
    current.boundaries_json = prior.boundaries_json;
    const boundaries = JSON.parse(prior.boundaries_json) as Array<{ index: number; ratio: number; date: string }>;
    const intervals = JSON.parse(prior.boundary_intervals_json) as Array<Record<string, number | string>>;
    const window = JSON.parse(prior.stimulus_window_json) as {
      displayed: { start: string; end: string; observationCount: number };
    };
    const center = boundaries[0];
    const halfWidthRatio = 0.06;
    const lowerRatio = Number((center.ratio - halfWidthRatio).toFixed(6));
    const upperRatio = Number((center.ratio + halfWidthRatio).toFixed(6));
    const lastIndex = window.displayed.observationCount - 1;
    const lowerIndex = Math.round(lowerRatio * lastIndex);
    const upperIndex = Math.round(upperRatio * lastIndex);
    const dateAtIndex = (index: number) => index === 0
      ? window.displayed.start
      : new Date(
          Date.parse(`${window.displayed.end}T00:00:00Z`) - (lastIndex - index) * 7 * 86_400_000,
        ).toISOString().slice(0, 10);
    intervals[0] = {
      boundaryIndex: 0,
      centerRatio: center.ratio,
      halfWidthRatio,
      widthRatio: Number((upperRatio - lowerRatio).toFixed(6)),
      lowerRatio,
      upperRatio,
      lowerIndex,
      upperIndex,
      lowerDate: dateAtIndex(lowerIndex),
      upperDate: dateAtIndex(upperIndex),
    };
    current.boundary_intervals_json = JSON.stringify(intervals);
    current.no_change_confirmed = "true";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /no_change_confirmed does not match the prior scientific answer/,
    );
  });
  await context.test("G0 cannot claim no change", async () => {
    const tables = await validFiveTableFixture();
    const baseline = tables.responses.rows.find((candidate) =>
      candidate.actor_type === "human" && candidate.disclosure_index === "0");
    assert.ok(baseline);
    baseline.no_change_confirmed = "true";
    await assert.rejects(
      normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
      /Baseline response cannot confirm no change/,
    );
  });
});

test("strict M1 rejects cue schema, tags, and rationale content", async (context) => {
  for (const [label, mutate] of [
    ["cue schema", (row: Record<string, string>) => { row.cue_schema_version = "disclosure-specific-cues-v2"; }],
    ["cue tags", (row: Record<string, string>) => { row.cue_tags_json = '["context"]'; }],
    ["rationale", (row: Record<string, string>) => { row.rationale = "because of the trend"; }],
  ] as const) {
    await context.test(label, async () => {
      const tables = await validFiveTableFixture();
      mutate(tables.responses.rows[0]);
      await assert.rejects(
        normalizeM1StageAExports({ ...M1_STAGE_A_FROZEN_SCOPE }, tables),
        /strict M1 cue fields must be empty/,
      );
    });
  }
});

test("CLI rejects an export whose bytes do not match its declared SHA-256", () => {
  const result = runCliHashCheck({ corruptExportHash: true });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /exports\.allocations SHA-256 mismatch/);
});

test("CLI rejects a five-export bundle digest mismatch", () => {
  const result = runCliHashCheck({ corruptBundleHash: true });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /Export bundle SHA-256 mismatch/);
});

test("CLI rejects an external evidence file digest mismatch", () => {
  const result = runCliHashCheck({ corruptEvidenceHash: true });
  assert.equal(result.status, 4);
  assert.match(result.stderr, /externalEvidence SHA-256 mismatch/);
});
