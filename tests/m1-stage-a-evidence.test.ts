import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { hashM1AgentProfile } from "../lib/m1-agent-profile";
import {
  hashM1AgentAttemptLedgerRows,
  hashM1StageADeploymentBundleManifest,
  signM1StageACollectionExportReceipt,
  signM1StageAExternalEvidence,
  type M1StageACollectionExportReceipt,
  type M1StageAExternalEvidenceV3,
} from "../lib/m1-stage-a-evidence";
import {
  M1_AGENT_PROMPT_SHA256,
  M1_ANALYSIS_SET_VERSION,
  M1_PREREGISTRATION_VERSION,
  M1_PROTOCOL_VERSION,
  M1_STUDY_PHASE,
  buildM1ProtocolPlan,
} from "../lib/m1-protocol";
import { hashM1ScientificResponse } from "../lib/m1-response-integrity";
import { M1_STAGE_A_FROZEN_SCOPE } from "../lib/m1-stage-a-audit";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT_SECRET = "stage-a-test-receipt-secret-with-more-than-32-bytes";
const EVIDENCE_SECRET = "stage-a-independent-evidence-secret-more-than-32-bytes";
const SNAPSHOT_ID = "stage-a-snapshot-2026-08-26-001";
const FROZEN_EVENT_SOURCE_ARCHIVE = process.env.M1_TEST_EVENT_SOURCE_ARCHIVE?.trim() ?? "";
const WEEKLY_WINDOWS: Record<string, { start: string; end: string; observationCount: number }> = {
  bitcoin: { start: "2010-10-21", end: "2026-04-06", observationCount: 808 },
  ethereum: { start: "2015-11-16", end: "2026-04-06", observationCount: 543 },
  solana: { start: "2020-07-19", end: "2026-04-06", observationCount: 300 },
  bnb: { start: "2017-11-02", end: "2026-04-06", observationCount: 441 },
  xrp: { start: "2013-11-13", end: "2026-04-06", observationCount: 648 },
  dogecoin: { start: "2014-03-26", end: "2026-04-06", observationCount: 629 },
};

type FixtureOptions = {
  missingEthicsArtifact?: boolean;
  invalidReceiptSignature?: boolean;
  invalidEvidenceSignature?: boolean;
  attemptControllerDrift?: boolean;
  omitRunManifestEntry?: boolean;
  receiptBundleMismatch?: boolean;
  missingRawArtifact?: boolean;
  runtimeRequestProfileDrift?: boolean;
  runtimeRequestScreenshotDrift?: boolean;
  forbiddenActionTrace?: boolean;
  actionTraceHiddenFields?: boolean;
  runtimeRequestHiddenPayload?: boolean;
  allAllowedActionKinds?: boolean;
  eventSourceArchiveMode?: "missing" | "matching-synthetic" | "mismatched";
  invalidScreenshot?: boolean;
  wrongDimensionScreenshot?: boolean;
  alternateScreenshotFormat?: "jpeg" | "webp";
  runTokenSwap?: boolean;
  omitHumanScreening?: boolean;
  deploymentSourceHashMismatch?: boolean;
  deploymentArtifactHashMismatch?: boolean;
  deploymentGateDisabled?: boolean;
  deploymentIdentityMismatch?: boolean;
  routeArtifactsWrongRole?: boolean;
  deploymentCreatedAfterStart?: boolean;
  collectionClosedBeforeFinalWrite?: boolean;
  attemptCreatedAfterClose?: boolean;
  attemptServerTimestampBeforeCompletion?: boolean;
  reuseScreenshotAcrossPages?: boolean;
  reuseModelOutputAcrossPages?: boolean;
  modelOutputResponseDrift?: boolean;
  modelOutputRequestDrift?: boolean;
  modelOutputStepDrift?: boolean;
  agentPreStartTerminal?: boolean;
  allocationTerminalAfterClose?: boolean;
  frozenEventSourceArchivePath?: string;
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function makeRgbaPng(width: number, height: number, marker = 0) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlineLength = width * 4 + 1;
  const pixels = Buffer.alloc(scanlineLength * height);
  if (marker !== 0) {
    pixels.writeUInt32BE(marker >>> 0, 1);
    pixels.writeUInt32BE((marker ^ 0xffffffff) >>> 0, 5);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const WRONG_DIMENSION_SCREENSHOT_PNG = makeRgbaPng(1439, 900);
const VALID_SCREENSHOT_PNGS = Array.from({ length: 12 * 42 }, (_, index) => makeRgbaPng(1440, 900, index + 1));
const TRUNCATED_SCREENSHOT_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48]),
]);

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(rows: Array<Record<string, string>>) {
  assert.ok(rows.length > 0);
  const headers = Object.keys(rows[0]);
  for (const row of rows) assert.deepEqual(Object.keys(row), headers);
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`;
}

function writeArtifact(directory: string, relativePath: string, contents: string | Buffer) {
  const path = join(directory, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return { path: relativePath.replaceAll("\\", "/"), sha256: sha256(contents) };
}

function isoDateAtIndex(window: { start: string; end: string; observationCount: number }, index: number) {
  if (index === 0) return window.start;
  const lastIndex = window.observationCount - 1;
  return new Date(Date.parse(`${window.end}T00:00:00Z`) - (lastIndex - index) * 7 * 86_400_000)
    .toISOString().slice(0, 10);
}

function responseGeometry(assetId: string) {
  const window = WEEKLY_WINDOWS[assetId];
  assert.ok(window);
  const lastIndex = window.observationCount - 1;
  const indexes = [Math.round(lastIndex * 0.25), Math.round(lastIndex * 0.75)];
  const boundaries = indexes.map((index) => ({
    index,
    ratio: index / lastIndex,
    date: isoDateAtIndex(window, index),
  }));
  const halfSteps = Math.max(2, Math.round(lastIndex * 0.05));
  const intervals = boundaries.map((boundary, boundaryIndex) => {
    const lowerIndex = boundary.index - halfSteps;
    const upperIndex = boundary.index + halfSteps;
    const lowerRatio = lowerIndex / lastIndex;
    const upperRatio = upperIndex / lastIndex;
    const halfWidthRatio = halfSteps / lastIndex;
    return {
      boundaryIndex,
      centerRatio: boundary.ratio,
      halfWidthRatio,
      widthRatio: 2 * halfWidthRatio,
      lowerRatio,
      upperRatio,
      lowerIndex,
      upperIndex,
      lowerDate: isoDateAtIndex(window, lowerIndex),
      upperDate: isoDateAtIndex(window, upperIndex),
    };
  });
  return {
    boundariesJson: JSON.stringify(boundaries),
    intervalsJson: JSON.stringify(intervals),
    stimulusWindowJson: JSON.stringify({ mode: "whole", displayed: window, source: window }),
  };
}

async function createCliFixture(options: FixtureOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), "m1-stage-a-evidence-"));
  const exportsDirectory = join(directory, "exports");
  const evidenceDirectory = join(directory, "evidence");
  mkdirSync(exportsDirectory, { recursive: true });
  mkdirSync(evidenceDirectory, { recursive: true });

  const controller = writeArtifact(evidenceDirectory, "controller.bin", "frozen-controller-binary-v1\n");
  const runtimePrompt = writeArtifact(evidenceDirectory, "runtime-prompt.json", "{\"promptPackage\":\"frozen-v1\"}\n");
  const actionTraceActions = options.forbiddenActionTrace
    ? [{ kind: "dom" }]
    : options.actionTraceHiddenFields
      ? [{ kind: "click", x: 100, y: 100, selector: "#hidden-target", domQuery: "[data-secret]" }]
      : options.allAllowedActionKinds
        ? [
            { kind: "screenshot" },
            { kind: "click", x: 100, y: 100 },
            { kind: "drag", from: { x: 100, y: 100 }, to: { x: 200, y: 200 } },
            { kind: "scroll", deltaX: 0, deltaY: 500 },
            { kind: "wait", milliseconds: 250 },
          ]
        : [{ kind: "click", x: 100, y: 100 }];
  const rawArtifactFiles = {
    actionTrace: writeArtifact(
      evidenceDirectory,
      "runs/raw-action-trace.json",
      `${JSON.stringify({ actions: actionTraceActions })}\n`,
    ),
  };
  const metadata = {
    provider: "OpenAI",
    modelSnapshot: "gpt-test-2026-08-01",
    apiVersion: "responses-v1",
    controllerVersion: "m1-controller-v1",
    controllerArtifactSha256: controller.sha256,
    runtimePromptPackageSha256: runtimePrompt.sha256,
    promptSha256: M1_AGENT_PROMPT_SHA256,
    contextPolicy: "persistent",
    imageDetail: "high",
    temperature: 0,
    topP: 1,
    seed: 42,
    reasoningEffort: "high",
    browserEngine: "Chrome",
    browserMajor: 140,
  };
  const modelName = "gpt-test";
  const agentProfileSha256 = await hashM1AgentProfile(modelName, metadata);
  const syntheticEventSourceBytes = Buffer.from("synthetic restricted event-source archive for audit tests\n");
  const scope = {
    ...M1_STAGE_A_FROZEN_SCOPE,
    ...(options.eventSourceArchiveMode === "matching-synthetic"
      ? { eventSourceSha256: sha256(syntheticEventSourceBytes) }
      : {}),
  };
  const eventSourceArchive = options.frozenEventSourceArchivePath
    ? writeArtifact(
        evidenceDirectory,
        "restricted/event-source-archive.zip",
        readFileSync(options.frozenEventSourceArchivePath),
      )
    : options.eventSourceArchiveMode === "missing" || !options.eventSourceArchiveMode
      ? null
      : writeArtifact(
          evidenceDirectory,
          "restricted/event-source-archive.zip",
          syntheticEventSourceBytes,
        );
  const deploymentId = "m1-stage-a-deployment-2026-08-26";
  const sourceManifestBytes = readFileSync(join(PROJECT_ROOT, "public", "data", "m1-source-manifest.json"));
  const sourceManifestReference = writeArtifact(
    evidenceDirectory,
    "source-manifest.json",
    sourceManifestBytes,
  );
  const frozenStimulusBytes = readFileSync(join(PROJECT_ROOT, "public", "data", "research-stimuli-modular-v8.json"));
  const frozenPromptBytes = readFileSync(join(PROJECT_ROOT, "public", "data", "m1-agent-system-prompt-v1.txt"));
  const deploymentFileSources = [
    { path: "archive/m1-client.js", contents: Buffer.from("frozen-m1-client-bundle\n"), mediaType: "text/javascript", role: "javascript" },
    { path: "archive/m1.css", contents: Buffer.from(".m1{display:block}\n"), mediaType: "text/css", role: "css" },
    { path: "archive/geist.woff2", contents: Buffer.from("test-font-binary\n"), mediaType: "font/woff2", role: "font" },
    { path: "archive/worker.js", contents: Buffer.from("export default {fetch(){}}\n"), mediaType: "text/javascript", role: "worker" },
    { path: "archive/research-stimuli-modular-v8.json", contents: frozenStimulusBytes, mediaType: "application/json", role: "stimulus" },
    { path: "archive/m1-agent-system-prompt-v1.txt", contents: frozenPromptBytes, mediaType: "text/plain", role: "system-prompt" },
    { path: sourceManifestReference.path, contents: sourceManifestBytes, mediaType: "application/json", role: "source-manifest" },
    { path: "archive/migrations.tar", contents: Buffer.from("frozen-migration-bundle\n"), mediaType: "application/x-tar", role: "migration-bundle" },
  ] as const;
  const deploymentArtifacts = deploymentFileSources.map((source) => {
    const reference = source.path === sourceManifestReference.path
      ? sourceManifestReference
      : writeArtifact(evidenceDirectory, source.path, source.contents);
    return {
      path: reference.path,
      sha256: reference.sha256,
      bytes: source.contents.byteLength,
      mediaType: source.mediaType,
      role: source.role,
    };
  });
  const workerArtifact = deploymentArtifacts.find((artifact) => artifact.role === "worker")!;
  const migrationArtifact = deploymentArtifacts.find((artifact) => artifact.role === "migration-bundle")!;
  const commonRouteArtifacts = [
    "archive/m1-client.js", "archive/m1.css", "archive/geist.woff2", "archive/worker.js",
  ];
  const deploymentBundleWithoutFingerprint = {
    schemaVersion: "m1-deployment-bundle-manifest-v2",
    scope,
    snapshotId: SNAPSHOT_ID,
    deploymentId,
    sourceManifestSha256: sourceManifestReference.sha256,
    implementationBuildId: scope.implementationBuildId,
    gitCommit: "d".repeat(40),
    origin: "https://m1-stage-a.example.org/",
    createdAt: options.deploymentCreatedAfterStart
      ? "2026-08-02T00:00:00.000Z"
      : "2026-07-31T23:59:00.000Z",
    environment: "production",
    workerEntrySha256: workerArtifact.sha256,
    migrationBundleSha256: migrationArtifact.sha256,
    collectionGates: {
      stageAPrimaryCollectionEnabled: true,
      humanCollectionEnabled: options.deploymentGateDisabled ? false : true,
      developmentPilotEnabled: false,
    },
    routes: options.routeArtifactsWrongRole
      ? [
          "/m1", "/agent", "/api/m1-launches", "/api/sessions", "/api/m1-step-exposures",
          "/api/modular-responses", "/api/agent-attempts", "/api/research-export",
        ].map((route) => ({ route, artifacts: ["archive/geist.woff2"] }))
      : [
          { route: "/m1", artifacts: [...commonRouteArtifacts, "archive/research-stimuli-modular-v8.json"] },
          { route: "/agent", artifacts: [...commonRouteArtifacts, "archive/research-stimuli-modular-v8.json", "archive/m1-agent-system-prompt-v1.txt"] },
          ...["/api/m1-launches", "/api/sessions", "/api/m1-step-exposures", "/api/modular-responses", "/api/agent-attempts", "/api/research-export"]
            .map((route) => ({ route, artifacts: ["archive/worker.js"] })),
        ],
    artifacts: deploymentArtifacts,
  };
  const deploymentFingerprintSha256 = hashM1StageADeploymentBundleManifest(deploymentBundleWithoutFingerprint);
  const exportDeploymentFingerprintSha256 = options.deploymentIdentityMismatch
    ? "f".repeat(64)
    : deploymentFingerprintSha256;
  const deploymentBundleReference = writeArtifact(evidenceDirectory, "deployment-bundles.json", `${JSON.stringify({
    ...deploymentBundleWithoutFingerprint,
    deploymentFingerprintSha256,
  }, null, 2)}\n`);
  const deploymentReference = writeArtifact(evidenceDirectory, "deployment-manifest.json", `${JSON.stringify({
    schemaVersion: "m1-stage-a-deployment-manifest-v1",
    scope,
    snapshotId: SNAPSHOT_ID,
    sourceManifestSha256: options.deploymentSourceHashMismatch ? "0".repeat(64) : sourceManifestReference.sha256,
    gitCommit: "d".repeat(40),
    deploymentId,
    jsCssBundleManifestSha256: deploymentBundleReference.sha256,
    deploymentFingerprintSha256,
    collectionGates: {
      stageAPrimaryCollectionEnabled: true,
      humanCollectionEnabled: options.deploymentGateDisabled ? false : true,
      developmentPilotEnabled: false,
    },
  }, null, 2)}\n`);
  const scopeColumns = {
    cohort_id: scope.cohortId,
    protocol_architecture: scope.protocolArchitecture,
    implementation_build_id: scope.implementationBuildId,
    allocation_mode: "balanced-random-v1",
    stimulus_sha256: scope.stimulusSha256,
    event_source_sha256: scope.eventSourceSha256,
    study_phase: M1_STUDY_PHASE,
    preregistration_version: M1_PREREGISTRATION_VERSION,
    analysis_set_version: M1_ANALYSIS_SET_VERSION,
    agent_profile_sha256: agentProfileSha256,
    primary_browser_major: "140",
    deployment_id: deploymentId,
    deployment_fingerprint_sha256: exportDeploymentFingerprintSha256,
  };

  const allocations: Array<Record<string, string>> = [];
  const sessions: Array<Record<string, string>> = [];
  const responses: Array<Record<string, string>> = [];
  const stepExposures: Array<Record<string, string>> = [];
  const agentAttempts: Array<Record<string, string>> = [];
  type FixtureRawArtifactEntry = {
    kind: "runtime-request" | "screenshot" | "model-output";
    sha256: string;
    file: { path: string; sha256: string };
  };
  const rawArtifactEntriesBySession = new Map<string, FixtureRawArtifactEntry[]>();
  const firstScreenshotBySession = new Map<string, { path: string; sha256: string }>();
  const firstModelOutputBySession = new Map<string, { path: string; sha256: string }>();
  let screenshotMarker = 1;
  const addRawArtifactEntry = (sessionId: string, entry: FixtureRawArtifactEntry) => {
    const entries = rawArtifactEntriesBySession.get(sessionId) ?? [];
    if (!entries.some((candidate) => candidate.kind === entry.kind && candidate.sha256 === entry.sha256)) entries.push(entry);
    rawArtifactEntriesBySession.set(sessionId, entries);
  };
  const runCoordinates: Array<{
    pairId: string;
    sessionId: string;
    scheduleId: number;
    condition: "staged" | "repeat-control";
  }> = [];
  let responseId = 1;

  for (const condition of ["staged", "repeat-control"] as const) {
    for (let scheduleId = 1; scheduleId <= 6; scheduleId += 1) {
      const pairId = `${condition}-pair-${scheduleId}`;
      const plan = buildM1ProtocolPlan(scheduleId, condition);
      for (const actor of ["human", "agent"] as const) {
        const sessionId = `${actor}-${condition}-${scheduleId}`;
        const isPreStartTerminal = Boolean(
          options.agentPreStartTerminal &&
          actor === "agent" && condition === "staged" && scheduleId === 1,
        );
        const terminalAt = options.allocationTerminalAfterClose && isPreStartTerminal
          ? "2026-08-27T00:00:00.000Z"
          : "2026-08-01T00:00:02.000Z";
        allocations.push({
          pair_id: pairId,
          actor_type: actor,
          participant_code: `${actor}-${scheduleId}`,
          replicate_id: actor === "human" ? "human-primary" : "R-PRIMARY",
          schedule_id: String(scheduleId),
          information_condition: condition,
          assignment_version: "balanced-random-v1",
          ...scopeColumns,
          token_sha256: sha256(`token-${sessionId}`),
          token_created_at: "2026-08-01T00:00:00.000Z",
          token_claimed_at: isPreStartTerminal ? "" : "2026-08-01T00:00:01.000Z",
          claimed_session_id: isPreStartTerminal ? "" : sessionId,
          revoked_at: isPreStartTerminal ? terminalAt : "",
          terminal_disposition: isPreStartTerminal ? "no-show-expired" : "",
          terminal_at: isPreStartTerminal ? terminalAt : "",
        });
        if (isPreStartTerminal) continue;
        sessions.push({
          session_id: sessionId,
          session_status: "complete",
          session_started_at: "2026-08-01T00:00:00.000Z",
          session_completed_at: "2026-08-01T00:40:00.000Z",
          session_termination_code: "",
          actor_type: actor,
          participant_code: `${actor}-${scheduleId}`,
          expertise: actor === "human" ? "intermediate" : "",
          model_name: actor === "agent" ? modelName : "",
          experimental_arm: actor === "agent" ? "agent-m1-main" : "m1-main",
          protocol_version: M1_PROTOCOL_VERSION,
          practice_completed_at: "2026-08-01T00:01:00.000Z",
          pair_id: pairId,
          schedule_id: String(scheduleId),
          information_condition: condition,
          ...scopeColumns,
          initial_boundary_policy: "common-tertile-anchors-adjustment-v1",
          primary_protocol_eligible: "true",
          protocol_deviation_codes: "",
          device_type: "desktop",
          initial_viewport_width: "1440",
          initial_viewport_height: "900",
          device_pixel_ratio: "1",
          pointer_type: "fine",
          screen_orientation: "landscape-primary",
          user_agent: "Mozilla/5.0 Chrome/140.0.0.0",
        });
        if (actor === "agent") runCoordinates.push({ pairId, sessionId, scheduleId, condition });

        for (let disclosureIndex = 0; disclosureIndex < 7; disclosureIndex += 1) {
          for (const trial of plan) {
            const stepOrder = disclosureIndex * 6 + trial.order;
            const currentResponseId = responseId++;
            const geometry = responseGeometry(trial.assetId);
            const { boundariesJson, intervalsJson, stimulusWindowJson } = geometry;
            const parsedBoundaries = JSON.parse(boundariesJson) as Array<{ date: string; ratio: number }>;
            const previousBoundariesJson = disclosureIndex === 0 ? "[]" : boundariesJson;
            const influenceRating = disclosureIndex === 0 ? null : 3;
            const noChangeConfirmed = disclosureIndex > 0;
            responses.push({
              session_id: sessionId,
              session_status: "complete",
              session_started_at: "2026-08-01T00:00:00.000Z",
              session_completed_at: "2026-08-01T00:40:00.000Z",
              session_termination_code: "",
              actor_type: actor,
              participant_code: `${actor}-${scheduleId}`,
              expertise: actor === "human" ? "intermediate" : "",
              model_name: actor === "agent" ? modelName : "",
              experimental_arm: actor === "agent" ? "agent-m1-main" : "m1-main",
              protocol_version: M1_PROTOCOL_VERSION,
              study_config_json: "{}",
              pair_id: pairId,
              schedule_id: String(scheduleId),
              information_condition: condition,
              protocol_architecture: scope.protocolArchitecture,
              cohort_id: scope.cohortId,
              allocation_mode: "balanced-random-v1",
              study_phase: M1_STUDY_PHASE,
              preregistration_version: M1_PREREGISTRATION_VERSION,
              analysis_set_version: M1_ANALYSIS_SET_VERSION,
              implementation_build_id: scope.implementationBuildId,
              deployment_id: deploymentId,
              deployment_fingerprint_sha256: exportDeploymentFingerprintSha256,
              human_consent_version: actor === "human" ? "m1-consent-v1" : "",
              human_consented_at: actor === "human" ? "2026-08-01T00:00:00.000Z" : "",
              human_language_screening_version: actor === "human" ? "m1-language-v1" : "",
              human_language_screened_at: actor === "human" ? "2026-08-01T00:00:00.000Z" : "",
              agent_profile_sha256: agentProfileSha256,
              primary_browser_major: "140",
              stimulus_sha256: scope.stimulusSha256,
              event_source_sha256: scope.eventSourceSha256,
              initial_boundary_policy: "common-tertile-anchors-adjustment-v1",
              primary_protocol_eligible: "true",
              protocol_deviation_codes: "",
              device_type: "desktop",
              screen_width: "1440",
              screen_height: "900",
              initial_viewport_width: "1440",
              initial_viewport_height: "900",
              device_pixel_ratio: "1",
              client_platform: "test",
              browser_language: "en-US",
              client_timezone: "UTC",
              pointer_type: "mouse",
              touch_points: "0",
              screen_orientation: "landscape-primary",
              user_agent: "minimized",
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
              boundary_count: "2",
              boundary_1_date: parsedBoundaries[0].date,
              boundary_1_ratio: String(parsedBoundaries[0].ratio),
              boundary_2_date: parsedBoundaries[1].date,
              boundary_2_ratio: String(parsedBoundaries[1].ratio),
              boundaries_json: boundariesJson,
              previous_boundaries_json: previousBoundariesJson,
              boundary_intervals_json: intervalsJson,
              single_stage_confirmed: "false",
              influence_rating: influenceRating === null ? "" : String(influenceRating),
              influence_touched: disclosureIndex === 0 ? "false" : "true",
              no_change_confirmed: String(noChangeConfirmed),
              cue_tags_json: "[]",
              rationale: "",
              elapsed_ms: "60000",
              reveal_read_ms: "1000",
              first_move_ms: disclosureIndex === 0 ? "1000" : "",
              first_uncertainty_ms: "2000",
              adjustment_count: disclosureIndex === 0 ? "1" : "0",
              g0_exact_default_anchor: "false",
              uncertainty_adjustment_count: "1",
              client_started_at: "2026-08-01T00:00:00.000Z",
              client_submitted_at: "2026-08-01T00:01:00.000Z",
              response_viewport_width: "1440",
              response_viewport_height: "900",
              response_orientation: "landscape-primary",
              response_protocol_eligible: "true",
              response_protocol_deviation_codes: "",
              page_hidden_ms: "0",
              active_elapsed_ms: "60000",
              disclosure_state_json: "{}",
              stimulus_window_json: stimulusWindowJson,
              response_created_at: "2026-08-01T00:01:00.000Z",
            });
            stepExposures.push({
              session_id: sessionId,
              pair_id: pairId,
              actor_type: actor,
              cohort_id: scope.cohortId,
              allocation_mode: "balanced-random-v1",
              deployment_id: deploymentId,
              deployment_fingerprint_sha256: exportDeploymentFingerprintSha256,
              step_order: String(stepOrder),
              trial_id: trial.id,
              disclosure_index: String(disclosureIndex),
              server_page_started_at: "2026-08-01T00:00:00.000Z",
              response_id: String(currentResponseId),
              response_received_at: "2026-08-01T00:01:00.000Z",
              server_page_elapsed_ms: "60000",
            });
            if (actor === "agent") {
              const modelRequestId = `request-${sessionId}-${stepOrder}`;
              const isFirstEvidencePage = sessionId === "agent-staged-1" && stepOrder === 0;
              let screenshotReference = options.reuseScreenshotAcrossPages
                ? firstScreenshotBySession.get(sessionId)
                : undefined;
              if (!screenshotReference) {
                const screenshotBytes = isFirstEvidencePage && options.invalidScreenshot
                  ? TRUNCATED_SCREENSHOT_PNG
                  : isFirstEvidencePage && options.wrongDimensionScreenshot
                    ? WRONG_DIMENSION_SCREENSHOT_PNG
                    : isFirstEvidencePage && options.alternateScreenshotFormat === "jpeg"
                      ? Buffer.from([0xff, 0xd8, 0xff, 0xd9])
                      : isFirstEvidencePage && options.alternateScreenshotFormat === "webp"
                        ? Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBP", "binary")
                        : VALID_SCREENSHOT_PNGS[(screenshotMarker++ - 1) % VALID_SCREENSHOT_PNGS.length];
                const relativePath = `raw/${sessionId}-${stepOrder}-screenshot.png`;
                const written = writeArtifact(evidenceDirectory, `runs/${relativePath}`, screenshotBytes);
                screenshotReference = { path: relativePath, sha256: written.sha256 };
                firstScreenshotBySession.set(sessionId, screenshotReference);
              }
              addRawArtifactEntry(sessionId, {
                kind: "screenshot",
                sha256: screenshotReference.sha256,
                file: screenshotReference,
              });
              const runtimeRequestBody = `${JSON.stringify({
                schemaVersion: "m1-agent-runtime-request-v1",
                sessionId,
                stepOrder,
                modelName,
                controllerVersion: metadata.controllerVersion,
                promptPackageSha256: metadata.runtimePromptPackageSha256,
                repositoryPromptSha256: metadata.promptSha256,
                screenshotSha256: options.runtimeRequestScreenshotDrift && isFirstEvidencePage
                  ? "0".repeat(64)
                  : screenshotReference.sha256,
                contextPolicy: options.runtimeRequestProfileDrift && sessionId === "agent-staged-1" && stepOrder === 0
                  ? "stateless"
                  : metadata.contextPolicy,
                inputModality: "screenshot",
                imageDetail: metadata.imageDetail,
                temperature: metadata.temperature,
                topP: metadata.topP,
                seed: metadata.seed,
                reasoningEffort: metadata.reasoningEffort,
                modelRequestIds: [modelRequestId],
                sourceModelRequestIds: [],
                ...(options.runtimeRequestHiddenPayload && sessionId === "agent-staged-1" && stepOrder === 0
                  ? {
                      stimulusJson: { futureDisclosure: "DI4" },
                      dom: { selector: "#answer" },
                      accessibility: { tree: "hidden" },
                      network: { url: "/api/research-export" },
                      humanResponses: [{ sessionId: "human-staged-1" }],
                    }
                  : {}),
              })}\n`;
              const runtimeReference = writeArtifact(
                evidenceDirectory,
                `runs/raw/${sessionId}-${stepOrder}.json`,
                runtimeRequestBody,
              );
              addRawArtifactEntry(sessionId, {
                kind: "runtime-request",
                sha256: runtimeReference.sha256,
                file: { path: `raw/${sessionId}-${stepOrder}.json`, sha256: runtimeReference.sha256 },
              });
              const scientificHash = await hashM1ScientificResponse({
                sessionId,
                stepOrder,
                trialId: trial.id,
                disclosureIndex,
                boundariesJson,
                previousBoundariesJson,
                boundaryIntervalsJson: intervalsJson,
                influenceRating,
                noChangeConfirmed,
                singleStageConfirmed: false,
              });
              let modelOutputReference = options.reuseModelOutputAcrossPages
                ? firstModelOutputBySession.get(sessionId)
                : undefined;
              if (!modelOutputReference) {
                const modelOutputStepOrder = options.modelOutputStepDrift && isFirstEvidencePage
                  ? stepOrder + 1
                  : stepOrder;
                const modelOutputRequestId = options.modelOutputRequestDrift && isFirstEvidencePage
                  ? `${modelRequestId}-drift`
                  : modelRequestId;
                const modelOutputNoChange = options.modelOutputResponseDrift && isFirstEvidencePage
                  ? !noChangeConfirmed
                  : noChangeConfirmed;
                const modelOutputScientificHash = await hashM1ScientificResponse({
                  sessionId,
                  stepOrder: modelOutputStepOrder,
                  trialId: trial.id,
                  disclosureIndex,
                  boundariesJson,
                  previousBoundariesJson,
                  boundaryIntervalsJson: intervalsJson,
                  influenceRating,
                  noChangeConfirmed: modelOutputNoChange,
                  singleStageConfirmed: false,
                });
                const modelOutputBody = `${JSON.stringify({
                  schemaVersion: "m1-agent-model-output-v1",
                  sessionId,
                  stepOrder: modelOutputStepOrder,
                  modelRequestId: modelOutputRequestId,
                  responseSha256: modelOutputScientificHash,
                  scientificResponse: {
                    trialId: trial.id,
                    disclosureIndex,
                    boundaries: JSON.parse(boundariesJson),
                    previousBoundaries: JSON.parse(previousBoundariesJson),
                    boundaryIntervals: JSON.parse(intervalsJson),
                    influenceRating,
                    noChangeConfirmed: modelOutputNoChange,
                    singleStageConfirmed: false,
                  },
                })}\n`;
                const relativePath = `raw/${sessionId}-${stepOrder}-model-output.json`;
                const written = writeArtifact(evidenceDirectory, `runs/${relativePath}`, modelOutputBody);
                modelOutputReference = { path: relativePath, sha256: written.sha256 };
                firstModelOutputBySession.set(sessionId, modelOutputReference);
              }
              addRawArtifactEntry(sessionId, {
                kind: "model-output",
                sha256: modelOutputReference.sha256,
                file: modelOutputReference,
              });
              agentAttempts.push({
                session_id: sessionId,
                pair_id: pairId,
                schedule_id: String(scheduleId),
                information_condition: condition,
                cohort_id: scope.cohortId,
                allocation_mode: "balanced-random-v1",
                deployment_id: deploymentId,
                deployment_fingerprint_sha256: exportDeploymentFingerprintSha256,
                model_name: modelName,
                step_order: String(stepOrder),
                attempt_number: "1",
                model_api_attempt_number: "1",
                mechanical_action_id: "",
                mechanical_retry_number: "0",
                controller_version: options.attemptControllerDrift && sessionId === "agent-staged-1" && stepOrder === 0
                  ? "wrong-controller"
                  : metadata.controllerVersion,
                model_request_id: modelRequestId,
                source_model_request_id: "",
                prompt_sha256: M1_AGENT_PROMPT_SHA256,
                runtime_request_sha256: runtimeReference.sha256,
                screenshot_sha256: screenshotReference.sha256,
                output_sha256: modelOutputReference.sha256,
                action_trace_sha256: rawArtifactFiles.actionTrace.sha256,
                response_id: String(currentResponseId),
                response_sha256: scientificHash,
                context_policy: metadata.contextPolicy,
                input_modality: "screenshot",
                image_detail: metadata.imageDetail,
                temperature: String(metadata.temperature),
                top_p: String(metadata.topP),
                seed: String(metadata.seed),
                reasoning_effort: metadata.reasoningEffort,
                input_tokens: "100",
                output_tokens: "20",
                tool_calls: String(options.allAllowedActionKinds ? actionTraceActions.length : 1),
                status: "submitted",
                error_code: "",
                started_at: "2026-08-01T00:00:00.000Z",
                completed_at: options.attemptServerTimestampBeforeCompletion && isFirstEvidencePage
                  ? "2026-08-01T00:00:02.000Z"
                  : "2026-08-01T00:00:01.000Z",
                created_at: options.attemptCreatedAfterClose && isFirstEvidencePage
                  ? "2026-08-27T00:00:00.000Z"
                  : options.attemptServerTimestampBeforeCompletion && isFirstEvidencePage
                    ? "2026-08-01T00:00:00.000Z"
                    : "2026-08-01T00:00:01.000Z",
              });
            }
          }
        }
      }
    }
  }

  const exportRows = { allocations, sessions, responses, stepExposures, agentAttempts };
  const exportHashes = {} as Record<keyof typeof exportRows, string>;
  const exportReferences = {} as Record<keyof typeof exportRows, { path: string; sha256: string }>;
  for (const key of Object.keys(exportRows) as Array<keyof typeof exportRows>) {
    const contents = csv(exportRows[key]);
    const relativePath = `exports/${key}.csv`;
    writeFileSync(join(directory, relativePath), contents, "utf8");
    exportHashes[key] = sha256(contents);
    exportReferences[key] = { path: relativePath, sha256: exportHashes[key] };
  }
  const exportBundleSha256 = sha256(`${(Object.keys(exportRows) as Array<keyof typeof exportRows>)
    .map((key) => `${key}:${exportHashes[key]}`).join("\n")}\n`);

  const receiptWithoutSignature: Omit<M1StageACollectionExportReceipt, "receiptSignature"> = {
    schemaVersion: "m1-stage-a-collection-export-receipt-v2",
    scope,
    collectionClosed: true,
    collectionClosedAt: options.collectionClosedBeforeFinalWrite
      ? "2026-07-31T00:00:00.000Z"
      : "2026-08-26T00:00:00.000Z",
    snapshotId: SNAPSHOT_ID,
    snapshotCreatedAt: "2026-08-26T00:01:00.000Z",
    deploymentId,
    deploymentFingerprintSha256,
    exportBundleSha256: options.receiptBundleMismatch ? "0".repeat(64) : exportBundleSha256,
    exports: { ...exportHashes },
    signatureAlgorithm: "HMAC-SHA256",
    receiptKeyId: "stage-a-controlled-test-key-01",
  };
  const receipt = {
    ...receiptWithoutSignature,
    receiptSignature: options.invalidReceiptSignature
      ? "0".repeat(64)
      : signM1StageACollectionExportReceipt(receiptWithoutSignature, RECEIPT_SECRET),
  };
  const receiptReference = writeArtifact(evidenceDirectory, "collection-receipt.json", `${JSON.stringify(receipt, null, 2)}\n`);
  const profileReference = writeArtifact(evidenceDirectory, "agent-profile.json", `${JSON.stringify({
    schemaVersion: "m1-stage-a-agent-profile-manifest-v1",
    scope,
    snapshotId: SNAPSHOT_ID,
    agentProfileSha256,
    modelName,
    metadata,
  }, null, 2)}\n`);
  const browserReference = writeArtifact(evidenceDirectory, "browser-runtime.json", `${JSON.stringify({
    schemaVersion: "m1-stage-a-browser-runtime-manifest-v1",
    scope,
    snapshotId: SNAPSHOT_ID,
    browserEngine: "Chrome",
    browserMajor: 140,
    viewportWidth: 1440,
    viewportHeight: 900,
    devicePixelRatio: 1,
  }, null, 2)}\n`);
  const runs = [];
  for (const coordinate of runCoordinates) {
    const rows = agentAttempts.filter((row) => row.session_id === coordinate.sessionId);
    const attemptLedgerSha256 = hashM1AgentAttemptLedgerRows(rows);
    const runArtifactBody = `${JSON.stringify({
      schemaVersion: "m1-stage-a-agent-run-artifact-v1",
      scope,
      snapshotId: SNAPSHOT_ID,
      exportBundleSha256,
      pairId: coordinate.pairId,
      replicateId: "R-PRIMARY",
      sessionId: coordinate.sessionId,
      launchTokenSha256: options.runTokenSwap && coordinate.sessionId === "agent-staged-1"
        ? sha256("token-agent-staged-2")
        : sha256(`token-${coordinate.sessionId}`),
      status: "complete",
      terminationCode: "",
      agentProfileSha256,
      attemptCount: rows.length,
      attemptLedgerSha256,
      artifacts: [
        ...(rawArtifactEntriesBySession.get(coordinate.sessionId) ?? []),
        {
          kind: "action-trace",
          sha256: rawArtifactFiles.actionTrace.sha256,
          file: { path: "raw-action-trace.json", sha256: rawArtifactFiles.actionTrace.sha256 },
        },
      ],
    }, null, 2)}\n`;
    const runArtifact = writeArtifact(evidenceDirectory, `runs/${coordinate.sessionId}.json`, runArtifactBody);
    runs.push({
      pairId: coordinate.pairId,
      replicateId: "R-PRIMARY",
      sessionId: coordinate.sessionId,
      scheduleId: coordinate.scheduleId,
      informationCondition: coordinate.condition,
      launchTokenSha256: options.runTokenSwap && coordinate.sessionId === "agent-staged-1"
        ? sha256("token-agent-staged-2")
        : sha256(`token-${coordinate.sessionId}`),
      status: "complete",
      terminationCode: "",
      agentProfileSha256,
      primaryBrowserMajor: 140,
      modelName,
      attemptCount: rows.length,
      attemptLedgerSha256,
      runArtifact,
    });
  }
  const runManifestReference = writeArtifact(evidenceDirectory, "run-artifact-manifest.json", `${JSON.stringify({
    schemaVersion: "m1-stage-a-run-artifact-manifest-v1",
    scope,
    snapshotId: SNAPSHOT_ID,
    exportBundleSha256,
    agentProfileSha256,
    runs: options.omitRunManifestEntry ? runs.slice(0, 11) : runs,
  }, null, 2)}\n`);

  const generic = (name: string) => writeArtifact(evidenceDirectory, `${name}.json`, `${JSON.stringify({ evidence: name, snapshotId: SNAPSHOT_ID })}\n`);
  const evidenceWithoutSignature: Omit<M1StageAExternalEvidenceV3, "evidenceSignature"> = {
    schemaVersion: "m1-stage-a-external-evidence-v3",
    scope,
    confirmedDataLossCount: 0,
    futureDisclosureLeakageCount: 0,
    collectionExportReceipt: receiptReference,
    eventSourceArchive,
    ethicsDecision: options.missingEthicsArtifact
      ? { path: "missing-ethics.json", sha256: "a".repeat(64) }
      : generic("ethics-decision"),
    approvedConsentMaterials: generic("approved-consent"),
    dataManagementPlan: generic("data-management-plan"),
    humanLanguageScreeningProtocol: options.omitHumanScreening ? null : generic("human-language-screening-protocol"),
    withdrawalExclusionProcess: generic("withdrawal-exclusion-process"),
    rawUaMinimizationAudit: generic("raw-ua-minimization-audit"),
    confirmedDataLossAudit: generic("confirmed-data-loss-audit"),
    futureDisclosureAudit: generic("future-disclosure-audit"),
    executableController: controller,
    runtimePromptPackage: runtimePrompt,
    agentProfileManifest: profileReference,
    browserRuntimeManifest: browserReference,
    runArtifactManifest: runManifestReference,
    sourceManifest: sourceManifestReference,
    deploymentManifest: deploymentReference,
    deploymentBundleManifest: deploymentBundleReference,
    signatureAlgorithm: "HMAC-SHA256",
    evidenceKeyId: "stage-a-independent-evidence-key-01",
  };
  const evidence = {
    ...evidenceWithoutSignature,
    evidenceSignature: options.invalidEvidenceSignature
      ? "0".repeat(64)
      : signM1StageAExternalEvidence(evidenceWithoutSignature, EVIDENCE_SECRET),
  };
  const evidenceContents = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(join(evidenceDirectory, "evidence.json"), evidenceContents, "utf8");
  const config = {
    schemaVersion: "m1-stage-a-audit-config-v3",
    scope,
    exports: exportReferences,
    exportBundleSha256,
    externalEvidence: { path: "evidence/evidence.json", sha256: sha256(evidenceContents) },
  };
  const configPath = join(directory, "config.json");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  if (options.missingRawArtifact) {
    rmSync(join(evidenceDirectory, "runs", "raw", "agent-staged-1-0.json"), { force: true });
  }
  if (options.deploymentArtifactHashMismatch) {
    writeFileSync(join(evidenceDirectory, "archive", "m1.css"), ".m1{display:none}\n", "utf8");
  }
  return { directory, configPath };
}

function runCli(configPath: string, includeSecret = true) {
  const env = { ...process.env };
  if (includeSecret) env.M1_AUDIT_RECEIPT_HMAC_SECRET = RECEIPT_SECRET;
  else delete env.M1_AUDIT_RECEIPT_HMAC_SECRET;
  if (includeSecret) env.M1_AUDIT_EVIDENCE_HMAC_SECRET = EVIDENCE_SECRET;
  else delete env.M1_AUDIT_EVIDENCE_HMAC_SECRET;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", join(PROJECT_ROOT, "scripts", "audit-m1-stage-a.ts"), configPath],
    { cwd: PROJECT_ROOT, encoding: "utf8", env },
  );
}

async function withFixture(options: FixtureOptions, callback: (configPath: string) => void) {
  const fixture = await createCliFixture(options);
  try {
    callback(fixture.configPath);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
}

test("v3 evidence chain stays pending until the restricted event-source archive is supplied", async () => {
  await withFixture({}, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4, result.stderr);
    assert.ok(result.stdout, result.stderr);
    const output = JSON.parse(result.stdout) as { decision: string; pendingExternalGates: string[]; proceedToStageB: boolean };
    assert.equal(output.decision, "GO_PENDING_EXTERNAL_GATES");
    assert.ok(output.pendingExternalGates.includes("eventSourceArchiveVerified"));
    assert.equal(output.proceedToStageB, false);
  });
});

test("event-source bytes are independently hashed and must equal scope.eventSourceSha256", async () => {
  await withFixture({ eventSourceArchiveMode: "mismatched" }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /eventSourceArchive bytes do not match the frozen scope\.eventSourceSha256/);
  });
  await withFixture({ eventSourceArchiveMode: "matching-synthetic" }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4, result.stderr);
    const output = JSON.parse(result.stdout) as {
      decision: string;
      inputValidationReasons: string[];
      pendingExternalGates: string[];
    };
    assert.equal(output.decision, "NOT_EVALUABLE");
    assert.ok(output.inputValidationReasons.includes("frozen-scope-mismatch"));
    assert.ok(!output.pendingExternalGates.includes("eventSourceArchiveVerified"));
  });
});

test(
  "the complete frozen-scope v3 chain can reach GO when the restricted event archive is explicitly injected",
  { skip: !FROZEN_EVENT_SOURCE_ARCHIVE },
  async () => {
    await withFixture({ frozenEventSourceArchivePath: FROZEN_EVENT_SOURCE_ARCHIVE }, (configPath) => {
      const result = runCli(configPath);
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout) as { decision: string; pendingExternalGates: string[] };
      assert.equal(output.decision, "GO");
      assert.deepEqual(output.pendingExternalGates, []);
    });
  },
);

test("a syntactically valid external hash without a readable artifact cannot GO", async () => {
  await withFixture({ missingEthicsArtifact: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /missing-ethics|ENOENT/);
  });
});

test("a self-consistent local receipt/evidence bundle cannot GO without the controlled HMAC secrets", async () => {
  await withFixture({}, (configPath) => {
    const result = runCli(configPath, false);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /M1_AUDIT_EVIDENCE_HMAC_SECRET|M1_AUDIT_RECEIPT_HMAC_SECRET/);
  });
});

test("an invalid signed collection receipt or a receipt for another export bundle cannot GO", async () => {
  await withFixture({ invalidReceiptSignature: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /HMAC signature is invalid/);
  });
  await withFixture({ receiptBundleMismatch: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /does not bind the verified five-table bundle/);
  });
});

test("a locally replaced external evidence root cannot GO without the independent valid signature", async () => {
  await withFixture({ invalidEvidenceSignature: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /External evidence root HMAC signature is invalid/);
  });
});

test("a controller setting drift in a hash-consistent CSV/run manifest cannot GO", async () => {
  await withFixture({ attemptControllerDrift: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /controller_version does not match the Agent profile/);
  });
});

test("a run manifest that omits one of the 12 R-PRIMARY runs cannot GO", async () => {
  await withFixture({ omitRunManifestEntry: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /exactly 12 claimed R-PRIMARY runs/);
  });
});

test("a signed pre-start Agent terminal disposition requires no fake session or run", async () => {
  await withFixture({ agentPreStartTerminal: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4, result.stderr);
    const output = JSON.parse(result.stdout) as {
      decision: string;
      allPrimarySlotsTerminal: boolean;
      completeMatchedPairs: number;
      actorSummary: { agent: { started: number } };
      preStartTerminalSummary: { agent: { total: number } };
    };
    assert.equal(output.decision, "GO_PENDING_EXTERNAL_GATES");
    assert.equal(output.allPrimarySlotsTerminal, true);
    assert.equal(output.completeMatchedPairs, 11);
    assert.equal(output.actorSummary.agent.started, 11);
    assert.equal(output.preStartTerminalSummary.agent.total, 1);
  });
});

test("a replacement run cannot swap the frozen R-PRIMARY launch token", async () => {
  await withFixture({ runTokenSwap: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /does not match its run artifact manifest entry/);
  });
});

test("Human screening and the source/deployment/bundle chain are mandatory GO gates", async () => {
  await withFixture({ omitHumanScreening: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    const output = JSON.parse(result.stdout) as { decision: string; pendingExternalGates: string[] };
    assert.equal(output.decision, "GO_PENDING_EXTERNAL_GATES");
    assert.ok(output.pendingExternalGates.includes("humanScreeningProtocolArchived"));
  });
  await withFixture({ deploymentSourceHashMismatch: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /not bound to the verified source manifest/);
  });
  await withFixture({ deploymentArtifactHashMismatch: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /deploymentBundleManifest\.archive\/m1\.css|SHA-256 mismatch/);
  });
  await withFixture({ deploymentGateDisabled: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /collection gates|production-safe/);
  });
  await withFixture({ deploymentIdentityMismatch: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /collectionExportReceipt does not bind the five-table deployment identity/);
  });
  await withFixture({ routeArtifactsWrongRole: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /\/m1 route is missing JavaScript, CSS, or stimulus bytes/);
  });
  await withFixture({ deploymentCreatedAfterStart: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /created after primary token\/session activity began/);
  });
  await withFixture({ collectionClosedBeforeFinalWrite: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /closes collection before the final exported write/);
  });
  await withFixture({ attemptCreatedAfterClose: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /closes collection before the final exported write/);
  });
  await withFixture({ attemptServerTimestampBeforeCompletion: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /server created_at predates controller completed_at/);
  });
  await withFixture({ agentPreStartTerminal: true, allocationTerminalAfterClose: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /closes collection before the final exported write/);
  });
});

test("every non-empty runtime/screenshot/output/trace hash must resolve to readable raw bytes", async () => {
  await withFixture({ missingRawArtifact: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /agent-staged-1-0|ENOENT/);
  });
});

test("one screenshot or model output cannot be reused across distinct ledger pages", async () => {
  await withFixture({ reuseScreenshotAcrossPages: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /reuses one screenshot across ledger pages/);
  });
  await withFixture({ reuseModelOutputAcrossPages: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /reuses one model-output across ledger pages/);
  });
});

test("model-output scientific content must close over the submitted response", async () => {
  await withFixture({ modelOutputResponseDrift: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /does not match the submitted attempt response hash/);
  });
  await withFixture({ modelOutputRequestDrift: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /model-request binding mismatch/);
  });
  await withFixture({ modelOutputStepDrift: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /not bound to exactly one ledger page/);
  });
});

test("runtime-request content must bind the frozen profile and ledger envelope", async () => {
  await withFixture({ runtimeRequestProfileDrift: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /runtime request does not match the frozen Agent profile/);
  });
  await withFixture({ runtimeRequestScreenshotDrift: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /runtime request screenshot binding mismatch/);
  });
});

test("all five coordinate-only action kinds satisfy their closed schemas", async () => {
  await withFixture({ allAllowedActionKinds: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4, result.stderr);
    const output = JSON.parse(result.stdout) as { decision: string; pendingExternalGates: string[] };
    assert.equal(output.decision, "GO_PENDING_EXTERNAL_GATES");
    assert.deepEqual(output.pendingExternalGates, ["eventSourceArchiveVerified"]);
  });
});

test("a signed, hash-consistent allowed action cannot smuggle selector or DOM-query fields", async () => {
  await withFixture({ actionTraceHiddenFields: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /click action.*closed schema.*domQuery.*selector/i);
  });
});

test("a signed, hash-consistent runtime request cannot smuggle hidden stimulus, DOM, network, or Human data", async () => {
  await withFixture({ runtimeRequestHiddenPayload: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /runtime request.*closed schema.*accessibility.*dom.*humanResponses.*network.*stimulusJson/i);
  });
});

test("truncated or wrong-dimension PNG screenshots cannot GO", async () => {
  await withFixture({ invalidScreenshot: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /truncated PNG chunk header/);
  });
  await withFixture({ wrongDimensionScreenshot: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /must decode to exactly 1440x900 pixels; received 1439x900/);
  });
});

test("the frozen raw-screenshot evidence contract rejects JPEG and WebP", async () => {
  await withFixture({ alternateScreenshotFormat: "jpeg" }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /must be a complete non-interlaced 1440x900 PNG; JPEG and WebP are not permitted/);
  });
  await withFixture({ alternateScreenshotFormat: "webp" }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /must be a complete non-interlaced 1440x900 PNG; JPEG and WebP are not permitted/);
  });
});

test("forbidden non-coordinate action traces cannot GO", async () => {
  await withFixture({ forbiddenActionTrace: true }, (configPath) => {
    const result = runCli(configPath);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /action trace contains a forbidden action/);
  });
});
