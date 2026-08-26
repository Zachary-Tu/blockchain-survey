import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { inflateSync } from "node:zlib";
import {
  canonicalM1AgentProfile,
  hashM1AgentProfile,
  validM1AgentProfile,
} from "./m1-agent-profile";
import type {
  M1StageAExternalGates,
  M1StageAFrozenScope,
  M1StageAManualStopChecks,
} from "./m1-stage-a-audit";
import {
  type CsvTable,
  type M1StageADeploymentIdentity,
  type M1StageAExportTables,
  validateM1StageADeploymentIdentity,
} from "./m1-stage-a-normalize";
import {
  M1_AGENT_PROMPT_SHA256,
  M1_ANALYSIS_SET_VERSION,
  M1_PREREGISTRATION_VERSION,
  M1_STUDY_PHASE,
} from "./m1-protocol";
import { hashM1ScientificResponse } from "./m1-response-integrity";
import { isM1PreStartTerminalDisposition } from "./m1-launch";

const SHA256 = /^[a-f0-9]{64}$/i;
const SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const EXPORT_KEYS = ["allocations", "sessions", "responses", "stepExposures", "agentAttempts"] as const;

export type M1StageAExportKey = (typeof EXPORT_KEYS)[number];

export type M1StageAFileReference = {
  path: string;
  sha256: string;
};

export const M1_STAGE_A_EXTERNAL_ARTIFACT_KEYS = [
  "collectionExportReceipt",
  "eventSourceArchive",
  "ethicsDecision",
  "approvedConsentMaterials",
  "dataManagementPlan",
  "humanLanguageScreeningProtocol",
  "withdrawalExclusionProcess",
  "rawUaMinimizationAudit",
  "confirmedDataLossAudit",
  "futureDisclosureAudit",
  "executableController",
  "runtimePromptPackage",
  "agentProfileManifest",
  "browserRuntimeManifest",
  "runArtifactManifest",
  "sourceManifest",
  "deploymentManifest",
  "deploymentBundleManifest",
] as const;

export type M1StageAExternalArtifactKey = (typeof M1_STAGE_A_EXTERNAL_ARTIFACT_KEYS)[number];

export type M1StageAExternalEvidenceV3 = {
  schemaVersion: "m1-stage-a-external-evidence-v3";
  scope: M1StageAFrozenScope;
  confirmedDataLossCount: number | null;
  futureDisclosureLeakageCount: number | null;
  signatureAlgorithm: "HMAC-SHA256";
  evidenceKeyId: string;
  evidenceSignature: string;
} & Record<M1StageAExternalArtifactKey, M1StageAFileReference | null>;

export type M1StageAVerifiedArtifact = {
  sha256: string;
  bytes: Uint8Array;
};

export type M1StageACollectionExportReceipt = {
  schemaVersion: "m1-stage-a-collection-export-receipt-v2";
  scope: M1StageAFrozenScope;
  collectionClosed: true;
  collectionClosedAt: string;
  snapshotId: string;
  snapshotCreatedAt: string;
  deploymentId: string;
  deploymentFingerprintSha256: string;
  exportBundleSha256: string;
  exports: Record<M1StageAExportKey, string>;
  signatureAlgorithm: "HMAC-SHA256";
  receiptKeyId: string;
  receiptSignature: string;
};

export type M1StageAAgentProfileManifest = {
  schemaVersion: "m1-stage-a-agent-profile-manifest-v1";
  scope: M1StageAFrozenScope;
  snapshotId: string;
  agentProfileSha256: string;
  modelName: string;
  metadata: Record<string, unknown>;
};

export type M1StageABrowserRuntimeManifest = {
  schemaVersion: "m1-stage-a-browser-runtime-manifest-v1";
  scope: M1StageAFrozenScope;
  snapshotId: string;
  browserEngine: "Chrome";
  browserMajor: number;
  viewportWidth: 1440;
  viewportHeight: 900;
  devicePixelRatio: 1;
};

export type M1StageADeploymentManifest = {
  schemaVersion: "m1-stage-a-deployment-manifest-v1";
  scope: M1StageAFrozenScope;
  snapshotId: string;
  sourceManifestSha256: string;
  gitCommit: string;
  deploymentId: string;
  jsCssBundleManifestSha256: string;
  deploymentFingerprintSha256: string;
  collectionGates: {
    stageAPrimaryCollectionEnabled: true;
    humanCollectionEnabled: true;
    developmentPilotEnabled: false;
  };
};

export const M1_STAGE_A_DEPLOYMENT_ARTIFACT_ROLES = [
  "javascript",
  "css",
  "font",
  "worker",
  "stimulus",
  "system-prompt",
  "source-manifest",
  "migration-bundle",
] as const;

export type M1StageADeploymentArtifactRole = (typeof M1_STAGE_A_DEPLOYMENT_ARTIFACT_ROLES)[number];

export type M1StageADeploymentBundleArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  role: M1StageADeploymentArtifactRole;
};

export type M1StageADeploymentBundleManifest = {
  schemaVersion: "m1-deployment-bundle-manifest-v2";
  scope: M1StageAFrozenScope;
  snapshotId: string;
  deploymentId: string;
  sourceManifestSha256: string;
  implementationBuildId: string;
  gitCommit: string;
  origin: string;
  createdAt: string;
  environment: "production";
  workerEntrySha256: string;
  migrationBundleSha256: string;
  collectionGates: {
    stageAPrimaryCollectionEnabled: true;
    humanCollectionEnabled: true;
    developmentPilotEnabled: false;
  };
  routes: Array<{ route: string; artifacts: string[] }>;
  artifacts: M1StageADeploymentBundleArtifact[];
  deploymentFingerprintSha256: string;
};

export type M1StageARunManifestEntry = {
  pairId: string;
  replicateId: "R-PRIMARY";
  sessionId: string;
  scheduleId: number;
  informationCondition: "staged" | "repeat-control";
  launchTokenSha256: string;
  status: "complete" | "aborted";
  terminationCode: string;
  agentProfileSha256: string;
  primaryBrowserMajor: number;
  modelName: string;
  attemptCount: number;
  attemptLedgerSha256: string;
  runArtifact: M1StageAFileReference;
};

export type M1StageARunArtifactManifest = {
  schemaVersion: "m1-stage-a-run-artifact-manifest-v1";
  scope: M1StageAFrozenScope;
  snapshotId: string;
  exportBundleSha256: string;
  agentProfileSha256: string;
  runs: M1StageARunManifestEntry[];
};

export type M1StageARunArtifact = {
  schemaVersion: "m1-stage-a-agent-run-artifact-v1";
  scope: M1StageAFrozenScope;
  snapshotId: string;
  exportBundleSha256: string;
  pairId: string;
  replicateId: "R-PRIMARY";
  sessionId: string;
  launchTokenSha256: string;
  status: "complete" | "aborted";
  terminationCode: string;
  agentProfileSha256: string;
  attemptCount: number;
  attemptLedgerSha256: string;
  artifacts: M1StageARawArtifactEntry[];
};

export const M1_STAGE_A_RAW_ARTIFACT_KINDS = [
  "runtime-request",
  "screenshot",
  "model-output",
  "action-trace",
] as const;

export type M1StageARawArtifactKind = (typeof M1_STAGE_A_RAW_ARTIFACT_KINDS)[number];

export type M1StageARawArtifactEntry = {
  kind: M1StageARawArtifactKind;
  sha256: string;
  file: M1StageAFileReference;
};

export type M1StageAEvidenceVerificationInput = {
  scope: M1StageAFrozenScope;
  exportHashes: Record<M1StageAExportKey, string>;
  exportBundleSha256: string;
  tables: M1StageAExportTables;
  evidence: M1StageAExternalEvidenceV3;
  artifacts: Partial<Record<M1StageAExternalArtifactKey, M1StageAVerifiedArtifact>>;
  deploymentArtifacts: Map<string, M1StageAVerifiedArtifact>;
  runArtifacts: Map<string, M1StageAVerifiedArtifact>;
  rawArtifacts: Map<string, Map<string, M1StageAVerifiedArtifact>>;
  externalEvidenceFileVerified: boolean;
  receiptHmacSecret: string | undefined;
  evidenceHmacSecret: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be SHA-256`);
}

function assertSnapshotId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SNAPSHOT_ID.test(value)) {
    throw new Error(`${label} must be a stable 8-160 character snapshot identifier`);
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.includes("T") || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
}

function assertFileReference(value: unknown, label: string): asserts value is M1StageAFileReference {
  if (!isRecord(value) || typeof value.path !== "string" || !value.path.trim()) {
    throw new Error(`${label} requires a non-empty path`);
  }
  assertSha256(value.sha256, `${label}.sha256`);
}

function assertScope(value: unknown, label: string): asserts value is M1StageAFrozenScope {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  for (const key of ["cohortId", "protocolArchitecture", "implementationBuildId"] as const) {
    if (typeof value[key] !== "string" || !value[key]) throw new Error(`${label}.${key} is required`);
  }
  assertSha256(value.stimulusSha256, `${label}.stimulusSha256`);
  assertSha256(value.eventSourceSha256, `${label}.eventSourceSha256`);
}

function sameScope(first: M1StageAFrozenScope, second: M1StageAFrozenScope) {
  return first.cohortId === second.cohortId &&
    first.protocolArchitecture === second.protocolArchitecture &&
    first.implementationBuildId === second.implementationBuildId &&
    first.stimulusSha256.toLowerCase() === second.stimulusSha256.toLowerCase() &&
    first.eventSourceSha256.toLowerCase() === second.eventSourceSha256.toLowerCase();
}

function requireSameScope(actual: M1StageAFrozenScope, expected: M1StageAFrozenScope, label: string) {
  if (!sameScope(actual, expected)) throw new Error(`${label} does not match the frozen scope`);
}

function parseJsonArtifact<T>(artifact: M1StageAVerifiedArtifact, label: string) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes)) as T;
  } catch {
    throw new Error(`${label} must be valid UTF-8 JSON`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot encode a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Canonical JSON contains an unsupported value");
}

function unsignedObject(value: Record<string, unknown>, signatureKey: string) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== signatureKey));
}

function assertDeploymentClosedKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) throw new Error(`${label} contains unexpected fields: ${unexpected.join(", ")}`);
}

export function hashM1StageADeploymentBundleManifest(value: Record<string, unknown>) {
  return createHash("sha256")
    .update(canonicalJson(unsignedObject(value, "deploymentFingerprintSha256")))
    .digest("hex");
}

export function signM1StageACollectionExportReceipt(
  receiptWithoutSignature: Omit<M1StageACollectionExportReceipt, "receiptSignature">,
  secret: string,
) {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Receipt HMAC secret must contain at least 32 UTF-8 bytes");
  return createHmac("sha256", secret).update(canonicalJson(receiptWithoutSignature)).digest("hex");
}

export function signM1StageAExternalEvidence(
  evidenceWithoutSignature: Omit<M1StageAExternalEvidenceV3, "evidenceSignature">,
  secret: string,
) {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Evidence HMAC secret must contain at least 32 UTF-8 bytes");
  return createHmac("sha256", secret).update(canonicalJson(evidenceWithoutSignature)).digest("hex");
}

export function validateM1StageAExternalEvidence(value: unknown): asserts value is M1StageAExternalEvidenceV3 {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-external-evidence-v3") {
    throw new Error("Expected schemaVersion m1-stage-a-external-evidence-v3");
  }
  assertScope(value.scope, "evidence.scope");
  for (const key of M1_STAGE_A_EXTERNAL_ARTIFACT_KEYS) {
    if (value[key] !== null) assertFileReference(value[key], `evidence.${key}`);
  }
  for (const [key, raw] of [
    ["confirmedDataLossCount", value.confirmedDataLossCount],
    ["futureDisclosureLeakageCount", value.futureDisclosureLeakageCount],
  ] as const) {
    if (raw !== null) assertNonNegativeInteger(raw, key);
  }
  if (value.signatureAlgorithm !== "HMAC-SHA256") throw new Error("evidence.signatureAlgorithm must be HMAC-SHA256");
  if (typeof value.evidenceKeyId !== "string" || !SNAPSHOT_ID.test(value.evidenceKeyId)) {
    throw new Error("evidence.evidenceKeyId must identify the controlled evidence key");
  }
  assertSha256(value.evidenceSignature, "evidence.evidenceSignature");
}

function requireHeaders(table: CsvTable, tableName: string, headers: string[]) {
  const available = new Set(table.headers);
  const missing = headers.filter((header) => !available.has(header));
  if (missing.length) throw new Error(`${tableName} is missing evidence-binding columns: ${missing.join(", ")}`);
}

function integer(value: string, label: string) {
  if (!/^-?\d+$/.test(value)) throw new Error(`${label} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is outside the safe integer range`);
  return parsed;
}

function optionalNumberMatches(value: string, expected: unknown) {
  if (expected === null || expected === undefined) return value === "";
  if (typeof expected !== "number" || !Number.isFinite(expected) || value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Object.is(parsed, expected);
}

function artifactIsVerified(
  evidence: M1StageAExternalEvidenceV3,
  artifacts: M1StageAEvidenceVerificationInput["artifacts"],
  key: M1StageAExternalArtifactKey,
) {
  const reference = evidence[key];
  if (!reference) return false;
  const artifact = artifacts[key];
  if (!artifact) throw new Error(`Referenced evidence artifact was not loaded: ${key}`);
  if (artifact.bytes.byteLength === 0) throw new Error(`Referenced evidence artifact is empty: ${key}`);
  if (artifact.sha256.toLowerCase() !== reference.sha256.toLowerCase()) {
    throw new Error(`Verified evidence artifact hash disagrees with its reference: ${key}`);
  }
  return true;
}

function verifyM1StageAEventSourceArchive(
  evidence: M1StageAExternalEvidenceV3,
  artifacts: M1StageAEvidenceVerificationInput["artifacts"],
  scope: M1StageAFrozenScope,
) {
  if (!evidence.eventSourceArchive) return false;
  const artifact = artifacts.eventSourceArchive;
  if (!artifact || artifact.bytes.byteLength === 0) {
    throw new Error("Referenced evidence artifact was not loaded: eventSourceArchive");
  }
  const bytesSha256 = createHash("sha256").update(artifact.bytes).digest("hex");
  if (
    bytesSha256 !== artifact.sha256.toLowerCase() ||
    bytesSha256 !== evidence.eventSourceArchive.sha256.toLowerCase()
  ) {
    throw new Error("eventSourceArchive bytes do not match the independently signed artifact hash");
  }
  if (bytesSha256 !== scope.eventSourceSha256.toLowerCase()) {
    throw new Error("eventSourceArchive bytes do not match the frozen scope.eventSourceSha256");
  }
  return true;
}

function validateCollectionReceipt(
  value: unknown,
  scope: M1StageAFrozenScope,
  exportHashes: Record<M1StageAExportKey, string>,
  exportBundleSha256: string,
  exportDeploymentIdentity: M1StageADeploymentIdentity,
  receiptHmacSecret: string | undefined,
) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-collection-export-receipt-v2") {
    throw new Error("collectionExportReceipt has the wrong schemaVersion");
  }
  assertDeploymentClosedKeys(value, [
    "schemaVersion", "scope", "collectionClosed", "collectionClosedAt", "snapshotId",
    "snapshotCreatedAt", "deploymentId", "deploymentFingerprintSha256", "exportBundleSha256",
    "exports", "signatureAlgorithm", "receiptKeyId", "receiptSignature",
  ], "collectionExportReceipt");
  assertScope(value.scope, "collectionExportReceipt.scope");
  requireSameScope(value.scope, scope, "collectionExportReceipt.scope");
  if (value.collectionClosed !== true) throw new Error("collectionExportReceipt.collectionClosed must be true");
  assertTimestamp(value.collectionClosedAt, "collectionExportReceipt.collectionClosedAt");
  assertTimestamp(value.snapshotCreatedAt, "collectionExportReceipt.snapshotCreatedAt");
  assertSnapshotId(value.snapshotId, "collectionExportReceipt.snapshotId");
  assertSnapshotId(value.deploymentId, "collectionExportReceipt.deploymentId");
  assertSha256(value.deploymentFingerprintSha256, "collectionExportReceipt.deploymentFingerprintSha256");
  if (
    value.deploymentId !== exportDeploymentIdentity.deploymentId ||
    value.deploymentFingerprintSha256.toLowerCase() !== exportDeploymentIdentity.deploymentFingerprintSha256
  ) throw new Error("collectionExportReceipt does not bind the five-table deployment identity");
  if (Date.parse(value.snapshotCreatedAt) < Date.parse(value.collectionClosedAt)) {
    throw new Error("collectionExportReceipt snapshot predates collection closure");
  }
  if (value.signatureAlgorithm !== "HMAC-SHA256") {
    throw new Error("collectionExportReceipt.signatureAlgorithm must be HMAC-SHA256");
  }
  if (typeof value.receiptKeyId !== "string" || !SNAPSHOT_ID.test(value.receiptKeyId)) {
    throw new Error("collectionExportReceipt.receiptKeyId must identify the controlled audit key");
  }
  assertSha256(value.receiptSignature, "collectionExportReceipt.receiptSignature");
  if (!receiptHmacSecret || Buffer.byteLength(receiptHmacSecret, "utf8") < 32) {
    throw new Error("M1_AUDIT_RECEIPT_HMAC_SECRET is required and must contain at least 32 UTF-8 bytes");
  }
  const expectedSignature = createHmac("sha256", receiptHmacSecret)
    .update(canonicalJson(unsignedObject(value, "receiptSignature")))
    .digest();
  const receivedSignature = Buffer.from(value.receiptSignature, "hex");
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new Error("collectionExportReceipt HMAC signature is invalid");
  }
  assertSha256(value.exportBundleSha256, "collectionExportReceipt.exportBundleSha256");
  if (value.exportBundleSha256.toLowerCase() !== exportBundleSha256.toLowerCase()) {
    throw new Error("collectionExportReceipt does not bind the verified five-table bundle");
  }
  if (!isRecord(value.exports)) throw new Error("collectionExportReceipt.exports must be an object");
  for (const key of EXPORT_KEYS) {
    assertSha256(value.exports[key], `collectionExportReceipt.exports.${key}`);
    if (value.exports[key].toLowerCase() !== exportHashes[key].toLowerCase()) {
      throw new Error(`collectionExportReceipt does not bind exports.${key}`);
    }
  }
  return value as unknown as M1StageACollectionExportReceipt;
}

async function validateAgentProfileManifest(
  value: unknown,
  scope: M1StageAFrozenScope,
  snapshotId: string,
  controllerSha256: string,
  runtimePromptPackageSha256: string,
) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-agent-profile-manifest-v1") {
    throw new Error("agentProfileManifest has the wrong schemaVersion");
  }
  assertScope(value.scope, "agentProfileManifest.scope");
  requireSameScope(value.scope, scope, "agentProfileManifest.scope");
  assertSnapshotId(value.snapshotId, "agentProfileManifest.snapshotId");
  if (value.snapshotId !== snapshotId) throw new Error("agentProfileManifest snapshotId mismatch");
  if (typeof value.modelName !== "string" || !value.modelName.trim()) {
    throw new Error("agentProfileManifest.modelName is required");
  }
  if (!isRecord(value.metadata)) throw new Error("agentProfileManifest.metadata must be an object");
  assertSha256(value.agentProfileSha256, "agentProfileManifest.agentProfileSha256");
  const canonical = canonicalM1AgentProfile(value.modelName, value.metadata);
  if (!validM1AgentProfile(canonical)) throw new Error("agentProfileManifest contains an invalid frozen Agent profile");
  const computed = await hashM1AgentProfile(value.modelName, value.metadata);
  if (computed !== value.agentProfileSha256.toLowerCase()) {
    throw new Error("agentProfileManifest.agentProfileSha256 does not match the canonical profile");
  }
  if (canonical.repositorySystemPromptSha256 !== M1_AGENT_PROMPT_SHA256) {
    throw new Error("agentProfileManifest does not use the frozen repository system prompt");
  }
  if (canonical.controllerArtifactSha256 !== controllerSha256.toLowerCase()) {
    throw new Error("agentProfileManifest is not bound to the verified executable controller");
  }
  if (canonical.runtimePromptPackageSha256 !== runtimePromptPackageSha256.toLowerCase()) {
    throw new Error("agentProfileManifest is not bound to the verified runtime prompt package");
  }
  return { manifest: value as unknown as M1StageAAgentProfileManifest, canonical };
}

function validateBrowserRuntimeManifest(
  value: unknown,
  scope: M1StageAFrozenScope,
  snapshotId: string,
  browserMajor: number | null,
) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-browser-runtime-manifest-v1") {
    throw new Error("browserRuntimeManifest has the wrong schemaVersion");
  }
  assertScope(value.scope, "browserRuntimeManifest.scope");
  requireSameScope(value.scope, scope, "browserRuntimeManifest.scope");
  assertSnapshotId(value.snapshotId, "browserRuntimeManifest.snapshotId");
  if (value.snapshotId !== snapshotId) throw new Error("browserRuntimeManifest snapshotId mismatch");
  if (
    value.browserEngine !== "Chrome" || !Number.isInteger(value.browserMajor) || Number(value.browserMajor) < 100 ||
    value.viewportWidth !== 1440 || value.viewportHeight !== 900 || value.devicePixelRatio !== 1
  ) throw new Error("browserRuntimeManifest does not match the frozen visual runtime");
  if (value.browserMajor !== browserMajor) throw new Error("browserRuntimeManifest disagrees with the Agent profile");
  return value as unknown as M1StageABrowserRuntimeManifest;
}

function m1StageACsvTimestampMs(value: string, label: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function validateM1StageADeploymentTimeline(
  tables: M1StageAExportTables,
  deploymentCreatedAt: string,
  collectionClosedAt: string,
) {
  requireHeaders(tables.allocations, "allocations", ["token_created_at", "token_claimed_at", "terminal_at"]);
  requireHeaders(tables.sessions, "sessions", ["session_started_at", "session_completed_at"]);
  requireHeaders(tables.responses, "responses", ["response_created_at"]);
  requireHeaders(tables.stepExposures, "step-exposures", ["response_received_at"]);
  requireHeaders(tables.agentAttempts, "agent-attempts", ["started_at", "completed_at", "created_at"]);
  const allocationTimes = tables.allocations.rows.map((row, index) => {
    const label = `allocations row ${index + 2}`;
    const createdAt = m1StageACsvTimestampMs(row.token_created_at, `${label}.token_created_at`);
    const claimedAt = row.token_claimed_at
      ? m1StageACsvTimestampMs(row.token_claimed_at, `${label}.token_claimed_at`)
      : null;
    const terminalAt = row.terminal_at
      ? m1StageACsvTimestampMs(row.terminal_at, `${label}.terminal_at`)
      : null;
    if (claimedAt !== null && claimedAt < createdAt) throw new Error(`${label} was claimed before token creation`);
    if (terminalAt !== null && terminalAt < createdAt) throw new Error(`${label} became terminal before token creation`);
    return { createdAt, claimedAt, terminalAt };
  });
  const attemptServerWrites = tables.agentAttempts.rows.map((row, index) => {
    const label = `agent-attempts row ${index + 2}`;
    const startedAt = m1StageACsvTimestampMs(row.started_at, `${label}.started_at`);
    const completedAt = m1StageACsvTimestampMs(row.completed_at, `${label}.completed_at`);
    const createdAt = m1StageACsvTimestampMs(row.created_at, `${label}.created_at`);
    if (completedAt < startedAt) {
      throw new Error(`${label} completes before its controller start`);
    }
    // D1 CURRENT_TIMESTAMP is second-granularity, while controller timestamps
    // can include milliseconds.  Permit only that representational truncation;
    // the server insert still cannot materially predate controller completion.
    if (createdAt + 999 < completedAt) {
      throw new Error(`${label} server created_at predates controller completed_at`);
    }
    return createdAt;
  });
  const starts = [
    ...allocationTimes.map((timestamps) => timestamps.createdAt),
    ...tables.sessions.rows.map((row, index) =>
      m1StageACsvTimestampMs(row.session_started_at, `sessions row ${index + 2}.session_started_at`)),
  ];
  const finalWrites = [
    ...allocationTimes.flatMap((timestamps) => [timestamps.claimedAt, timestamps.terminalAt].filter(
      (timestamp): timestamp is number => timestamp !== null,
    )),
    ...tables.sessions.rows.filter((row) => row.session_completed_at).map((row, index) =>
      m1StageACsvTimestampMs(row.session_completed_at, `terminal session ${index + 1}.session_completed_at`)),
    ...tables.responses.rows.map((row, index) =>
      m1StageACsvTimestampMs(row.response_created_at, `responses row ${index + 2}.response_created_at`)),
    ...tables.stepExposures.rows.filter((row) => row.response_received_at).map((row, index) =>
      m1StageACsvTimestampMs(row.response_received_at, `step-exposures row ${index + 2}.response_received_at`)),
    // created_at is the database/server write timestamp. completed_at is
    // controller supplied and therefore cannot establish collection closure.
    ...attemptServerWrites,
  ];
  if (!starts.length || !finalWrites.length) throw new Error("Stage-A timeline cannot be reconstructed from the five exports");
  const deploymentMs = Date.parse(deploymentCreatedAt);
  const collectionClosedMs = Date.parse(collectionClosedAt);
  if (deploymentMs > Math.min(...starts)) {
    throw new Error("deploymentBundleManifest was created after primary token/session activity began");
  }
  if (collectionClosedMs < Math.max(...finalWrites)) {
    throw new Error("collectionExportReceipt closes collection before the final exported write");
  }
}

function validateDeploymentManifest(
  value: unknown,
  sourceManifestValue: unknown,
  bundleManifestValue: unknown,
  deploymentArtifacts: Map<string, M1StageAVerifiedArtifact>,
  scope: M1StageAFrozenScope,
  snapshotId: string,
  sourceManifestSha256: string,
  bundleManifestSha256: string,
  exportDeploymentIdentity: M1StageADeploymentIdentity,
  tables: M1StageAExportTables,
  collectionClosedAt: string,
) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-deployment-manifest-v1") {
    throw new Error("deploymentManifest has the wrong schemaVersion");
  }
  assertScope(value.scope, "deploymentManifest.scope");
  requireSameScope(value.scope, scope, "deploymentManifest.scope");
  assertSnapshotId(value.snapshotId, "deploymentManifest.snapshotId");
  if (value.snapshotId !== snapshotId) throw new Error("deploymentManifest snapshotId mismatch");
  assertSha256(value.sourceManifestSha256, "deploymentManifest.sourceManifestSha256");
  assertSha256(value.jsCssBundleManifestSha256, "deploymentManifest.jsCssBundleManifestSha256");
  assertSha256(value.deploymentFingerprintSha256, "deploymentManifest.deploymentFingerprintSha256");
  if (
    value.deploymentId !== exportDeploymentIdentity.deploymentId ||
    value.deploymentFingerprintSha256.toLowerCase() !== exportDeploymentIdentity.deploymentFingerprintSha256
  ) throw new Error("deploymentManifest does not match the five-table deployment identity");
  if (
    !isRecord(value.collectionGates) ||
    value.collectionGates.stageAPrimaryCollectionEnabled !== true ||
    value.collectionGates.humanCollectionEnabled !== true ||
    value.collectionGates.developmentPilotEnabled !== false
  ) throw new Error("deploymentManifest collection gates do not match the frozen research deployment");
  assertDeploymentClosedKeys(
    value.collectionGates,
    ["stageAPrimaryCollectionEnabled", "humanCollectionEnabled", "developmentPilotEnabled"],
    "deploymentManifest.collectionGates",
  );
  if (value.sourceManifestSha256.toLowerCase() !== sourceManifestSha256.toLowerCase()) {
    throw new Error("deploymentManifest is not bound to the verified source manifest");
  }
  if (scope.implementationBuildId !== `m1-stage-a2-${sourceManifestSha256.toLowerCase().slice(0, 16)}`) {
    throw new Error("deploymentManifest source manifest does not derive the frozen implementation build ID");
  }
  if (value.jsCssBundleManifestSha256.toLowerCase() !== bundleManifestSha256.toLowerCase()) {
    throw new Error("deploymentManifest is not bound to the verified JS/CSS bundle manifest");
  }
  if (typeof value.gitCommit !== "string" || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(value.gitCommit)) {
    throw new Error("deploymentManifest.gitCommit must be a full Git object ID");
  }
  assertSnapshotId(value.deploymentId, "deploymentManifest.deploymentId");
  if (
    !isRecord(sourceManifestValue) || sourceManifestValue.schemaVersion !== "m1-source-manifest-v1" ||
    sourceManifestValue.protocolArchitecture !== scope.protocolArchitecture || !Array.isArray(sourceManifestValue.files) ||
    sourceManifestValue.files.length === 0
  ) throw new Error("sourceManifest does not describe the frozen M1 source tree");
  const sourcePaths = new Set<string>();
  for (const [index, candidate] of sourceManifestValue.files.entries()) {
    if (!isRecord(candidate) || typeof candidate.path !== "string" || !candidate.path || sourcePaths.has(candidate.path)) {
      throw new Error(`sourceManifest.files[${index}].path must be non-empty and unique`);
    }
    sourcePaths.add(candidate.path);
    assertSha256(candidate.sha256, `sourceManifest.files[${index}].sha256`);
    if (!Number.isSafeInteger(candidate.bytes) || Number(candidate.bytes) <= 0) {
      throw new Error(`sourceManifest.files[${index}].bytes must be a positive integer`);
    }
  }

  if (!isRecord(bundleManifestValue) || bundleManifestValue.schemaVersion !== "m1-deployment-bundle-manifest-v2") {
    throw new Error("deploymentBundleManifest has the wrong schemaVersion");
  }
  assertDeploymentClosedKeys(bundleManifestValue, [
    "schemaVersion", "scope", "snapshotId", "deploymentId", "sourceManifestSha256",
    "implementationBuildId", "gitCommit", "origin", "createdAt", "environment",
    "workerEntrySha256", "migrationBundleSha256", "collectionGates", "routes", "artifacts",
    "deploymentFingerprintSha256",
  ], "deploymentBundleManifest");
  assertScope(bundleManifestValue.scope, "deploymentBundleManifest.scope");
  requireSameScope(bundleManifestValue.scope, scope, "deploymentBundleManifest.scope");
  assertSnapshotId(bundleManifestValue.snapshotId, "deploymentBundleManifest.snapshotId");
  if (bundleManifestValue.snapshotId !== snapshotId) throw new Error("deploymentBundleManifest snapshotId mismatch");
  if (bundleManifestValue.deploymentId !== value.deploymentId) throw new Error("deployment bundle and deployment manifest IDs differ");
  if (bundleManifestValue.implementationBuildId !== scope.implementationBuildId) {
    throw new Error("deploymentBundleManifest implementation build mismatch");
  }
  assertSha256(bundleManifestValue.sourceManifestSha256, "deploymentBundleManifest.sourceManifestSha256");
  if (bundleManifestValue.sourceManifestSha256.toLowerCase() !== sourceManifestSha256.toLowerCase()) {
    throw new Error("deploymentBundleManifest source manifest mismatch");
  }
  if (bundleManifestValue.gitCommit !== value.gitCommit) throw new Error("deploymentBundleManifest Git commit mismatch");
  if (typeof bundleManifestValue.origin !== "string") throw new Error("deploymentBundleManifest.origin is required");
  let deploymentOrigin: URL;
  try {
    deploymentOrigin = new URL(bundleManifestValue.origin);
  } catch {
    throw new Error("deploymentBundleManifest.origin must be an absolute URL");
  }
  if (deploymentOrigin.protocol !== "https:" || deploymentOrigin.pathname !== "/" || deploymentOrigin.search || deploymentOrigin.hash) {
    throw new Error("deploymentBundleManifest.origin must be an HTTPS origin without path, query, or fragment");
  }
  assertTimestamp(bundleManifestValue.createdAt, "deploymentBundleManifest.createdAt");
  if (bundleManifestValue.environment !== "production") throw new Error("deploymentBundleManifest environment must be production");
  assertSha256(bundleManifestValue.workerEntrySha256, "deploymentBundleManifest.workerEntrySha256");
  assertSha256(bundleManifestValue.migrationBundleSha256, "deploymentBundleManifest.migrationBundleSha256");
  assertSha256(bundleManifestValue.deploymentFingerprintSha256, "deploymentBundleManifest.deploymentFingerprintSha256");
  if (bundleManifestValue.deploymentFingerprintSha256.toLowerCase() !== hashM1StageADeploymentBundleManifest(bundleManifestValue)) {
    throw new Error("deploymentBundleManifest fingerprint does not match its canonical contents");
  }
  if (value.deploymentFingerprintSha256.toLowerCase() !== bundleManifestValue.deploymentFingerprintSha256.toLowerCase()) {
    throw new Error("deploymentManifest is not bound to the verified deployment fingerprint");
  }
  if (
    !isRecord(bundleManifestValue.collectionGates) ||
    bundleManifestValue.collectionGates.stageAPrimaryCollectionEnabled !== true ||
    bundleManifestValue.collectionGates.humanCollectionEnabled !== true ||
    bundleManifestValue.collectionGates.developmentPilotEnabled !== false
  ) throw new Error("deploymentBundleManifest collection gates are not production-safe");
  assertDeploymentClosedKeys(
    bundleManifestValue.collectionGates,
    ["stageAPrimaryCollectionEnabled", "humanCollectionEnabled", "developmentPilotEnabled"],
    "deploymentBundleManifest.collectionGates",
  );
  if (!Array.isArray(bundleManifestValue.artifacts) || bundleManifestValue.artifacts.length === 0) {
    throw new Error("deploymentBundleManifest.artifacts must be non-empty");
  }
  const deploymentPaths = new Set<string>();
  const roles = new Set<string>();
  for (const [index, candidate] of bundleManifestValue.artifacts.entries()) {
    const label = `deploymentBundleManifest.artifacts[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`);
    assertDeploymentClosedKeys(candidate, ["path", "sha256", "bytes", "mediaType", "role"], label);
    if (
      typeof candidate.path !== "string" || !candidate.path || candidate.path.startsWith("/") ||
      candidate.path.includes("\\") || candidate.path.split("/").includes("..") || deploymentPaths.has(candidate.path)
    ) throw new Error(`${label}.path must be a unique normalized relative path`);
    deploymentPaths.add(candidate.path);
    assertSha256(candidate.sha256, `${label}.sha256`);
    if (!Number.isSafeInteger(candidate.bytes) || Number(candidate.bytes) <= 0) throw new Error(`${label}.bytes must be positive`);
    if (typeof candidate.mediaType !== "string" || !candidate.mediaType.includes("/")) throw new Error(`${label}.mediaType is required`);
    if (typeof candidate.role !== "string" || !M1_STAGE_A_DEPLOYMENT_ARTIFACT_ROLES.includes(candidate.role as M1StageADeploymentArtifactRole)) {
      throw new Error(`${label}.role is invalid`);
    }
    roles.add(candidate.role);
    const loaded = deploymentArtifacts.get(candidate.path);
    if (!loaded || loaded.bytes.byteLength === 0) throw new Error(`${label} was not loaded from the archived deployment`);
    if (loaded.sha256.toLowerCase() !== candidate.sha256.toLowerCase() || loaded.bytes.byteLength !== candidate.bytes) {
      throw new Error(`${label} bytes/hash do not match the archived deployment file`);
    }
    if (candidate.role === "worker" && candidate.sha256.toLowerCase() !== bundleManifestValue.workerEntrySha256.toLowerCase()) {
      throw new Error("deploymentBundleManifest workerEntrySha256 does not identify its worker artifact");
    }
    if (candidate.role === "migration-bundle" && candidate.sha256.toLowerCase() !== bundleManifestValue.migrationBundleSha256.toLowerCase()) {
      throw new Error("deploymentBundleManifest migrationBundleSha256 does not identify its migration bundle");
    }
    if (candidate.role === "source-manifest" && candidate.sha256.toLowerCase() !== sourceManifestSha256.toLowerCase()) {
      throw new Error("deploymentBundleManifest source-manifest artifact is not the verified source manifest");
    }
    if (candidate.role === "stimulus" && candidate.sha256.toLowerCase() !== scope.stimulusSha256.toLowerCase()) {
      throw new Error("deploymentBundleManifest stimulus artifact is not the frozen stimulus bundle");
    }
    if (candidate.role === "system-prompt" && candidate.sha256.toLowerCase() !== M1_AGENT_PROMPT_SHA256.toLowerCase()) {
      throw new Error("deploymentBundleManifest system-prompt artifact is not the frozen repository prompt");
    }
  }
  for (const role of M1_STAGE_A_DEPLOYMENT_ARTIFACT_ROLES) {
    if (!roles.has(role)) throw new Error(`deploymentBundleManifest is missing required artifact role: ${role}`);
  }
  if ([...deploymentArtifacts.keys()].some((path) => !deploymentPaths.has(path))) {
    throw new Error("A loaded deployment artifact is not indexed by deploymentBundleManifest");
  }
  if (!Array.isArray(bundleManifestValue.routes)) throw new Error("deploymentBundleManifest.routes must be an array");
  const requiredRoutes = new Set([
    "/m1", "/agent", "/api/m1-launches", "/api/sessions", "/api/m1-step-exposures",
    "/api/modular-responses", "/api/agent-attempts", "/api/research-export",
  ]);
  const seenRoutes = new Set<string>();
  const requiredRouteReferencedPaths = new Set<string>();
  const artifactRoleByPath = new Map(
    (bundleManifestValue.artifacts as Array<Record<string, unknown>>)
      .map((artifact) => [String(artifact.path), String(artifact.role)]),
  );
  for (const [index, routeValue] of bundleManifestValue.routes.entries()) {
    const label = `deploymentBundleManifest.routes[${index}]`;
    if (!isRecord(routeValue)) throw new Error(`${label} must be an object`);
    assertDeploymentClosedKeys(routeValue, ["route", "artifacts"], label);
    if (typeof routeValue.route !== "string" || !routeValue.route.startsWith("/") || seenRoutes.has(routeValue.route)) {
      throw new Error(`${label}.route must be a unique absolute route path`);
    }
    seenRoutes.add(routeValue.route);
    if (!Array.isArray(routeValue.artifacts) || routeValue.artifacts.length === 0) throw new Error(`${label}.artifacts must be non-empty`);
    const routeArtifacts = routeValue.artifacts.map(String);
    if (new Set(routeArtifacts).size !== routeArtifacts.length || routeArtifacts.some((path) => !deploymentPaths.has(path))) {
      throw new Error(`${label}.artifacts must uniquely reference archived deployment paths`);
    }
    if (requiredRoutes.has(routeValue.route)) {
      routeArtifacts.forEach((path) => requiredRouteReferencedPaths.add(path));
      const routeRoles = new Set(routeArtifacts.map((path) => artifactRoleByPath.get(path)));
      if (routeValue.route === "/m1" && (!["javascript", "css", "stimulus"].every((role) => routeRoles.has(role)))) {
        throw new Error("deploymentBundleManifest /m1 route is missing JavaScript, CSS, or stimulus bytes");
      }
      if (routeValue.route === "/agent" && (!["javascript", "css", "stimulus", "system-prompt"].every((role) => routeRoles.has(role)))) {
        throw new Error("deploymentBundleManifest /agent route is missing JavaScript, CSS, stimulus, or system-prompt bytes");
      }
      if (routeValue.route.startsWith("/api/") && !routeRoles.has("worker")) {
        throw new Error(`${label} must reference the archived worker artifact`);
      }
    }
  }
  for (const requiredRoute of requiredRoutes) {
    if (!seenRoutes.has(requiredRoute)) throw new Error(`deploymentBundleManifest is missing required route: ${requiredRoute}`);
  }
  for (const artifact of bundleManifestValue.artifacts as Array<Record<string, unknown>>) {
    if (["javascript", "css", "worker"].includes(String(artifact.role)) && !requiredRouteReferencedPaths.has(String(artifact.path))) {
      throw new Error(`deploymentBundleManifest executable artifact is not referenced by a required route: ${artifact.path}`);
    }
  }
  validateM1StageADeploymentTimeline(tables, bundleManifestValue.createdAt, collectionClosedAt);
  return value as unknown as M1StageADeploymentManifest;
}

export function m1StageADeploymentBundleReferences(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== "m1-deployment-bundle-manifest-v2" || !Array.isArray(value.artifacts)) {
    throw new Error("deploymentBundleManifest must contain a v2 artifacts array");
  }
  return value.artifacts.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.path !== "string") {
      throw new Error(`deploymentBundleManifest.artifacts[${index}] requires a path`);
    }
    assertSha256(candidate.sha256, `deploymentBundleManifest.artifacts[${index}].sha256`);
    return {
      path: candidate.path,
      reference: { path: candidate.path, sha256: candidate.sha256 } satisfies M1StageAFileReference,
    };
  });
}

const ATTEMPT_DIGEST_COLUMNS = [
  "session_id", "pair_id", "schedule_id", "information_condition", "cohort_id", "allocation_mode",
  "deployment_id", "deployment_fingerprint_sha256",
  "model_name", "step_order", "attempt_number", "model_api_attempt_number", "mechanical_action_id",
  "mechanical_retry_number", "controller_version", "model_request_id", "source_model_request_id",
  "prompt_sha256", "runtime_request_sha256", "screenshot_sha256", "output_sha256", "action_trace_sha256",
  "response_id", "response_sha256", "context_policy", "input_modality", "image_detail", "temperature",
  "top_p", "seed", "reasoning_effort", "input_tokens", "output_tokens", "tool_calls", "status",
  "error_code", "started_at", "completed_at", "created_at",
] as const;

export function hashM1AgentAttemptLedgerRows(rows: Array<Record<string, string>>) {
  const ordered = [...rows].sort((first, second) =>
    integer(first.step_order, "attempt step_order") - integer(second.step_order, "attempt step_order") ||
    integer(first.attempt_number, "attempt_number") - integer(second.attempt_number, "attempt_number"));
  const canonical = ordered.map((row) => Object.fromEntries(
    ATTEMPT_DIGEST_COLUMNS.map((column) => [column, row[column] ?? ""]),
  ));
  return createHash("sha256").update(`${JSON.stringify(canonical)}\n`).digest("hex");
}

export function m1StageARunArtifactReferences(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-run-artifact-manifest-v1" || !Array.isArray(value.runs)) {
    throw new Error("runArtifactManifest has the wrong schemaVersion or runs list");
  }
  return value.runs.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.sessionId !== "string" || !candidate.sessionId) {
      throw new Error(`runArtifactManifest.runs[${index}].sessionId is required`);
    }
    assertFileReference(candidate.runArtifact, `runArtifactManifest.runs[${index}].runArtifact`);
    return { sessionId: candidate.sessionId, reference: candidate.runArtifact };
  });
}

export function m1StageARawArtifactReferences(value: unknown, sessionId: string) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-agent-run-artifact-v1" || !Array.isArray(value.artifacts)) {
    throw new Error(`Run artifact ${sessionId} is missing its raw artifact index`);
  }
  return value.artifacts.map((candidate, index) => {
    if (!isRecord(candidate) || !M1_STAGE_A_RAW_ARTIFACT_KINDS.includes(candidate.kind as M1StageARawArtifactKind)) {
      throw new Error(`Run artifact ${sessionId}.artifacts[${index}].kind is invalid`);
    }
    assertSha256(candidate.sha256, `Run artifact ${sessionId}.artifacts[${index}].sha256`);
    assertFileReference(candidate.file, `Run artifact ${sessionId}.artifacts[${index}].file`);
    if (candidate.file.sha256.toLowerCase() !== candidate.sha256.toLowerCase()) {
      throw new Error(`Run artifact ${sessionId}.artifacts[${index}] file hash mismatch`);
    }
    return {
      key: `${candidate.kind}:${candidate.sha256.toLowerCase()}`,
      kind: candidate.kind as M1StageARawArtifactKind,
      sha256: candidate.sha256.toLowerCase(),
      reference: candidate.file,
    };
  });
}

function validateRunArtifactManifestShape(
  value: unknown,
  scope: M1StageAFrozenScope,
  snapshotId: string,
  exportBundleSha256: string,
  agentProfileSha256: string,
  expectedRunCount: number,
) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-run-artifact-manifest-v1") {
    throw new Error("runArtifactManifest has the wrong schemaVersion");
  }
  assertScope(value.scope, "runArtifactManifest.scope");
  requireSameScope(value.scope, scope, "runArtifactManifest.scope");
  assertSnapshotId(value.snapshotId, "runArtifactManifest.snapshotId");
  if (value.snapshotId !== snapshotId) throw new Error("runArtifactManifest snapshotId mismatch");
  assertSha256(value.exportBundleSha256, "runArtifactManifest.exportBundleSha256");
  if (value.exportBundleSha256.toLowerCase() !== exportBundleSha256.toLowerCase()) {
    throw new Error("runArtifactManifest does not bind the verified five-table bundle");
  }
  assertSha256(value.agentProfileSha256, "runArtifactManifest.agentProfileSha256");
  if (value.agentProfileSha256.toLowerCase() !== agentProfileSha256.toLowerCase()) {
    throw new Error("runArtifactManifest Agent profile mismatch");
  }
  if (!Array.isArray(value.runs) || value.runs.length !== expectedRunCount) {
    throw new Error(`runArtifactManifest must contain exactly ${expectedRunCount} claimed R-PRIMARY runs`);
  }
  const runs = value.runs.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`runArtifactManifest.runs[${index}] must be an object`);
    for (const key of ["pairId", "sessionId", "modelName"] as const) {
      if (typeof candidate[key] !== "string" || !candidate[key]) throw new Error(`runArtifactManifest.runs[${index}].${key} is required`);
    }
    if (candidate.replicateId !== "R-PRIMARY") throw new Error(`runArtifactManifest.runs[${index}] is not R-PRIMARY`);
    assertSha256(candidate.launchTokenSha256, `runArtifactManifest.runs[${index}].launchTokenSha256`);
    if (candidate.status !== "complete" && candidate.status !== "aborted") {
      throw new Error(`runArtifactManifest.runs[${index}].status must be terminal`);
    }
    if (typeof candidate.terminationCode !== "string" || candidate.terminationCode.length > 120) {
      throw new Error(`runArtifactManifest.runs[${index}].terminationCode is invalid`);
    }
    if (
      (candidate.status === "complete" && candidate.terminationCode !== "") ||
      (candidate.status === "aborted" && candidate.terminationCode === "")
    ) throw new Error(`runArtifactManifest.runs[${index}] status/terminationCode mismatch`);
    assertNonNegativeInteger(candidate.attemptCount, `runArtifactManifest.runs[${index}].attemptCount`);
    assertSha256(candidate.attemptLedgerSha256, `runArtifactManifest.runs[${index}].attemptLedgerSha256`);
    assertSha256(candidate.agentProfileSha256, `runArtifactManifest.runs[${index}].agentProfileSha256`);
    if (!Number.isInteger(candidate.scheduleId) || Number(candidate.scheduleId) < 1 || Number(candidate.scheduleId) > 6) {
      throw new Error(`runArtifactManifest.runs[${index}].scheduleId is invalid`);
    }
    if (candidate.informationCondition !== "staged" && candidate.informationCondition !== "repeat-control") {
      throw new Error(`runArtifactManifest.runs[${index}].informationCondition is invalid`);
    }
    if (!Number.isInteger(candidate.primaryBrowserMajor) || Number(candidate.primaryBrowserMajor) < 100) {
      throw new Error(`runArtifactManifest.runs[${index}].primaryBrowserMajor is invalid`);
    }
    assertFileReference(candidate.runArtifact, `runArtifactManifest.runs[${index}].runArtifact`);
    return candidate as unknown as M1StageARunManifestEntry;
  });
  if (
    new Set(runs.map((run) => run.pairId)).size !== expectedRunCount ||
    new Set(runs.map((run) => run.sessionId)).size !== expectedRunCount
  ) {
    throw new Error("runArtifactManifest pairId and sessionId values must be unique");
  }
  return { manifest: value as unknown as M1StageARunArtifactManifest, runs };
}

function requireFrozenStudyColumns(row: Record<string, string>, label: string) {
  if (row.study_phase !== M1_STUDY_PHASE) throw new Error(`${label}.study_phase does not match the frozen study`);
  if (row.preregistration_version !== M1_PREREGISTRATION_VERSION) throw new Error(`${label}.preregistration_version mismatch`);
  if (row.analysis_set_version !== M1_ANALYSIS_SET_VERSION) throw new Error(`${label}.analysis_set_version mismatch`);
}

function verifyAttemptProfile(
  row: Record<string, string>,
  canonical: ReturnType<typeof canonicalM1AgentProfile>,
  label: string,
) {
  if (row.model_name !== canonical.modelName) throw new Error(`${label}.model_name does not match the Agent profile`);
  if (row.controller_version !== canonical.controllerVersion) throw new Error(`${label}.controller_version does not match the Agent profile`);
  if (row.prompt_sha256.toLowerCase() !== canonical.repositorySystemPromptSha256) throw new Error(`${label}.prompt_sha256 does not match the Agent profile`);
  if (row.context_policy !== canonical.contextPolicy) throw new Error(`${label}.context_policy does not match the Agent profile`);
  if (row.input_modality !== canonical.inputModality) throw new Error(`${label}.input_modality does not match the Agent profile`);
  if (row.image_detail !== canonical.imageDetail) throw new Error(`${label}.image_detail does not match the Agent profile`);
  for (const [column, expected] of [
    ["temperature", canonical.temperature], ["top_p", canonical.topP], ["seed", canonical.seed],
  ] as const) {
    if (!optionalNumberMatches(row[column], expected)) throw new Error(`${label}.${column} does not match the Agent profile`);
  }
  if (row.reasoning_effort !== canonical.reasoningEffort) throw new Error(`${label}.reasoning_effort does not match the Agent profile`);
}

const M1_STAGE_A_ACTION_VIEWPORT = { width: 1440, height: 900 } as const;
const M1_STAGE_A_MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const M1_STAGE_A_RUNTIME_REQUEST_FIELDS = [
  "schemaVersion",
  "sessionId",
  "stepOrder",
  "modelName",
  "controllerVersion",
  "promptPackageSha256",
  "repositoryPromptSha256",
  "screenshotSha256",
  "contextPolicy",
  "inputModality",
  "imageDetail",
  "temperature",
  "topP",
  "seed",
  "reasoningEffort",
  "modelRequestIds",
  "sourceModelRequestIds",
] as const;

function m1StageACrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertM1StageAScreenshotDimensions(width: number, height: number, label: string) {
  if (width !== M1_STAGE_A_ACTION_VIEWPORT.width || height !== M1_STAGE_A_ACTION_VIEWPORT.height) {
    throw new Error(`${label} must decode to exactly 1440x900 pixels; received ${width}x${height}`);
  }
}

function validateM1StageAPngScreenshot(bytes: Buffer, label: string) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new Error(`${label} has an invalid PNG signature`);
  }
  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let sawIhdr = false;
  let sawPalette = false;
  let sawIdat = false;
  let idatEnded = false;
  let sawIend = false;
  const idatChunks: Buffer[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`${label} contains a truncated PNG chunk header`);
    const length = bytes.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) throw new Error(`${label} contains a truncated PNG chunk`);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${label} contains an invalid PNG chunk type`);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = m1StageACrc32(bytes.subarray(offset + 4, dataEnd));
    if (actualCrc !== expectedCrc) throw new Error(`${label} contains a PNG chunk with an invalid CRC`);
    const data = bytes.subarray(dataStart, dataEnd);
    if (!sawIhdr && type !== "IHDR") throw new Error(`${label} PNG must begin with IHDR`);
    if (sawIdat && type !== "IDAT") idatEnded = true;
    if (type === "IHDR") {
      if (sawIhdr || length !== 13) throw new Error(`${label} PNG must contain one 13-byte IHDR`);
      sawIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const validBitDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!validBitDepths[colorType]?.includes(bitDepth)) throw new Error(`${label} PNG has an invalid color type/bit depth`);
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(`${label} PNG must use standard compression/filtering and be non-interlaced`);
      }
      assertM1StageAScreenshotDimensions(width, height, label);
    } else if (type === "PLTE") {
      if (sawPalette || sawIdat || length === 0 || length % 3 !== 0 || length > 768) {
        throw new Error(`${label} PNG contains an invalid PLTE chunk`);
      }
      sawPalette = true;
    } else if (type === "IDAT") {
      if (!sawIhdr || idatEnded || length === 0 || (colorType === 3 && !sawPalette)) {
        throw new Error(`${label} PNG contains an invalid IDAT sequence`);
      }
      sawIdat = true;
      idatChunks.push(data);
    } else if (type === "IEND") {
      if (!sawIdat || sawIend || length !== 0 || chunkEnd !== bytes.length) {
        throw new Error(`${label} PNG contains an invalid IEND chunk`);
      }
      sawIend = true;
    } else if ((typeBytes[0] & 0x20) === 0) {
      throw new Error(`${label} PNG contains an unknown critical chunk`);
    }
    offset = chunkEnd;
    if (sawIend) break;
  }
  if (!sawIhdr || !sawIdat || !sawIend || offset !== bytes.length) {
    throw new Error(`${label} is not a complete PNG image`);
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);
  const expectedInflatedBytes = height * (rowBytes + 1);
  let pixels: Buffer;
  try {
    pixels = inflateSync(Buffer.concat(idatChunks), { maxOutputLength: expectedInflatedBytes + 1 });
  } catch {
    throw new Error(`${label} PNG pixel stream cannot be decoded`);
  }
  if (pixels.length !== expectedInflatedBytes) throw new Error(`${label} PNG pixel stream has the wrong decoded length`);
  for (let row = 0; row < height; row += 1) {
    if (pixels[row * (rowBytes + 1)] > 4) throw new Error(`${label} PNG contains an invalid scanline filter`);
  }
}

function validateM1StageAScreenshot(bytesValue: Uint8Array, label: string) {
  const bytes = Buffer.from(bytesValue);
  if (bytes.length === 0 || bytes.length > M1_STAGE_A_MAX_SCREENSHOT_BYTES) {
    throw new Error(`${label} must contain 1-${M1_STAGE_A_MAX_SCREENSHOT_BYTES} encoded bytes`);
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    validateM1StageAPngScreenshot(bytes, label);
    return;
  }
  throw new Error(`${label} must be a complete non-interlaced 1440x900 PNG; JPEG and WebP are not permitted`);
}

function assertM1StageAClosedActionOrRuntimeRecord(
  value: unknown,
  requiredKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object using a closed schema`);
  const required = new Set(requiredKeys);
  const unexpected = Object.keys(value).filter((key) => !required.has(key)).sort();
  const missing = requiredKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unexpected.length || missing.length) {
    const details = [
      unexpected.length ? `unexpected fields: ${unexpected.join(", ")}` : "",
      missing.length ? `missing fields: ${missing.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(`${label} violates its closed schema (${details})`);
  }
}

function assertM1StageAFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertM1StageAViewportPoint(value: unknown, label: string) {
  assertM1StageAClosedActionOrRuntimeRecord(value, ["x", "y"], label);
  assertM1StageAFiniteNumber(value.x, `${label}.x`);
  assertM1StageAFiniteNumber(value.y, `${label}.y`);
  if (
    value.x < 0 || value.x >= M1_STAGE_A_ACTION_VIEWPORT.width ||
    value.y < 0 || value.y >= M1_STAGE_A_ACTION_VIEWPORT.height
  ) {
    throw new Error(`${label} must be inside the frozen 1440x900 viewport`);
  }
}

function validateM1StageAActionTrace(value: unknown, label: string) {
  assertM1StageAClosedActionOrRuntimeRecord(value, ["actions"], label);
  if (!Array.isArray(value.actions) || value.actions.length > 20) {
    throw new Error(`${label} must contain at most 20 actions`);
  }
  const allowed = new Set(["screenshot", "click", "drag", "scroll", "wait"]);
  for (const [index, action] of value.actions.entries()) {
    if (!isRecord(action) || typeof action.kind !== "string" || !allowed.has(action.kind)) {
      throw new Error(`${label} contains a forbidden action at index ${index}`);
    }
    const actionLabel = `${label} ${action.kind} action at index ${index}`;
    switch (action.kind) {
      case "screenshot":
        assertM1StageAClosedActionOrRuntimeRecord(action, ["kind"], actionLabel);
        break;
      case "click":
        assertM1StageAClosedActionOrRuntimeRecord(action, ["kind", "x", "y"], actionLabel);
        assertM1StageAViewportPoint({ x: action.x, y: action.y }, actionLabel);
        break;
      case "drag":
        assertM1StageAClosedActionOrRuntimeRecord(action, ["kind", "from", "to"], actionLabel);
        assertM1StageAViewportPoint(action.from, `${actionLabel}.from`);
        assertM1StageAViewportPoint(action.to, `${actionLabel}.to`);
        break;
      case "scroll":
        assertM1StageAClosedActionOrRuntimeRecord(action, ["kind", "deltaX", "deltaY"], actionLabel);
        assertM1StageAFiniteNumber(action.deltaX, `${actionLabel}.deltaX`);
        assertM1StageAFiniteNumber(action.deltaY, `${actionLabel}.deltaY`);
        break;
      case "wait":
        assertM1StageAClosedActionOrRuntimeRecord(action, ["kind", "milliseconds"], actionLabel);
        if (!Number.isInteger(action.milliseconds) || Number(action.milliseconds) < 1 || Number(action.milliseconds) > 10_000) {
          throw new Error(`${actionLabel}.milliseconds must be an integer from 1 through 10000`);
        }
        break;
    }
  }
  return value.actions.length;
}

function validateM1StageARuntimeRequestShape(value: unknown, label: string) {
  assertM1StageAClosedActionOrRuntimeRecord(value, M1_STAGE_A_RUNTIME_REQUEST_FIELDS, label);
  if (value.schemaVersion !== "m1-agent-runtime-request-v1") {
    throw new Error(`${label} has the wrong schemaVersion`);
  }
  assertSha256(value.promptPackageSha256, `${label}.promptPackageSha256`);
  assertSha256(value.repositoryPromptSha256, `${label}.repositoryPromptSha256`);
  assertSha256(value.screenshotSha256, `${label}.screenshotSha256`);
  if (
    !Array.isArray(value.modelRequestIds) || value.modelRequestIds.some((item) => typeof item !== "string") ||
    !Array.isArray(value.sourceModelRequestIds) || value.sourceModelRequestIds.some((item) => typeof item !== "string")
  ) {
    throw new Error(`${label} request-ID fields must be arrays of strings`);
  }
  return value;
}

const M1_STAGE_A_MODEL_OUTPUT_FIELDS = [
  "schemaVersion",
  "sessionId",
  "stepOrder",
  "modelRequestId",
  "responseSha256",
  "scientificResponse",
] as const;

const M1_STAGE_A_MODEL_SCIENTIFIC_RESPONSE_FIELDS = [
  "trialId",
  "disclosureIndex",
  "boundaries",
  "previousBoundaries",
  "boundaryIntervals",
  "influenceRating",
  "noChangeConfirmed",
  "singleStageConfirmed",
] as const;

function parseM1StageAResponseJson(value: string, label: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function m1StageACsvBoolean(value: string, label: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false`);
}

async function validateM1StageAModelOutput(
  value: unknown,
  label: string,
  entry: M1StageARunManifestEntry,
  linkedAttempts: Array<Record<string, string>>,
  responsesById: Map<number, Record<string, string>>,
) {
  assertM1StageAClosedActionOrRuntimeRecord(value, M1_STAGE_A_MODEL_OUTPUT_FIELDS, label);
  if (value.schemaVersion !== "m1-agent-model-output-v1") {
    throw new Error(`${label} has the wrong schemaVersion`);
  }
  if (value.sessionId !== entry.sessionId || !Number.isInteger(value.stepOrder)) {
    throw new Error(`${label} is not bound to its run session and integer step`);
  }
  const stepOrders = new Set(linkedAttempts.map((attempt) => integer(attempt.step_order, `${label} attempt step_order`)));
  if (stepOrders.size !== 1 || value.stepOrder !== [...stepOrders][0]) {
    throw new Error(`${label} is not bound to exactly one ledger page`);
  }
  const requestIds = new Set(
    linkedAttempts.flatMap((attempt) => [attempt.model_request_id, attempt.source_model_request_id]).filter(Boolean),
  );
  if (requestIds.size !== 1 || typeof value.modelRequestId !== "string" || value.modelRequestId !== [...requestIds][0]) {
    throw new Error(`${label} model-request binding mismatch`);
  }
  assertSha256(value.responseSha256, `${label}.responseSha256`);
  assertM1StageAClosedActionOrRuntimeRecord(
    value.scientificResponse,
    M1_STAGE_A_MODEL_SCIENTIFIC_RESPONSE_FIELDS,
    `${label}.scientificResponse`,
  );
  const scientific = value.scientificResponse;
  if (
    typeof scientific.trialId !== "string" || !scientific.trialId ||
    !Number.isInteger(scientific.disclosureIndex) || Number(scientific.disclosureIndex) < 0 ||
    Number(scientific.disclosureIndex) > 6 || !Array.isArray(scientific.boundaries) ||
    !Array.isArray(scientific.previousBoundaries) || !Array.isArray(scientific.boundaryIntervals) ||
    (scientific.influenceRating !== null &&
      (!Number.isInteger(scientific.influenceRating) || Number(scientific.influenceRating) < 1 || Number(scientific.influenceRating) > 5)) ||
    typeof scientific.noChangeConfirmed !== "boolean" || typeof scientific.singleStageConfirmed !== "boolean"
  ) throw new Error(`${label}.scientificResponse has invalid field types`);

  const modelScientificHash = await hashM1ScientificResponse({
    sessionId: entry.sessionId,
    stepOrder: Number(value.stepOrder),
    trialId: scientific.trialId,
    disclosureIndex: Number(scientific.disclosureIndex),
    boundariesJson: JSON.stringify(scientific.boundaries),
    previousBoundariesJson: JSON.stringify(scientific.previousBoundaries),
    boundaryIntervalsJson: JSON.stringify(scientific.boundaryIntervals),
    influenceRating: scientific.influenceRating === null ? null : Number(scientific.influenceRating),
    noChangeConfirmed: scientific.noChangeConfirmed,
    singleStageConfirmed: scientific.singleStageConfirmed,
  });
  if (modelScientificHash !== value.responseSha256.toLowerCase()) {
    throw new Error(`${label} scientific payload does not match responseSha256`);
  }

  const submittedAttempts = linkedAttempts.filter((attempt) => attempt.status === "submitted");
  if (submittedAttempts.length > 1) throw new Error(`${label} is linked to multiple submitted attempts`);
  if (submittedAttempts.length === 0) return;
  const submitted = submittedAttempts[0];
  if (submitted.response_sha256.toLowerCase() !== modelScientificHash) {
    throw new Error(`${label} does not match the submitted attempt response hash`);
  }
  const responseId = integer(submitted.response_id, `${label} submitted response_id`);
  const response = responsesById.get(responseId);
  if (!response || response.session_id !== entry.sessionId || integer(response.step_order, `${label} response step_order`) !== value.stepOrder) {
    throw new Error(`${label} does not resolve to its exported scientific response`);
  }
  const responseScientificHash = await hashM1ScientificResponse({
    sessionId: response.session_id,
    stepOrder: integer(response.step_order, `${label} response step_order`),
    trialId: response.trial_id,
    disclosureIndex: integer(response.disclosure_index, `${label} response disclosure_index`),
    boundariesJson: JSON.stringify(parseM1StageAResponseJson(response.boundaries_json, `${label} response boundaries_json`)),
    previousBoundariesJson: JSON.stringify(parseM1StageAResponseJson(response.previous_boundaries_json, `${label} response previous_boundaries_json`)),
    boundaryIntervalsJson: JSON.stringify(parseM1StageAResponseJson(response.boundary_intervals_json, `${label} response boundary_intervals_json`)),
    influenceRating: response.influence_rating === "" ? null : integer(response.influence_rating, `${label} response influence_rating`),
    noChangeConfirmed: m1StageACsvBoolean(response.no_change_confirmed, `${label} response no_change_confirmed`),
    singleStageConfirmed: m1StageACsvBoolean(response.single_stage_confirmed, `${label} response single_stage_confirmed`),
  });
  if (responseScientificHash !== modelScientificHash) {
    throw new Error(`${label} scientific payload does not match the exported response`);
  }
}

async function validateRunArtifact(
  value: unknown,
  entry: M1StageARunManifestEntry,
  attempts: Array<Record<string, string>>,
  responsesById: Map<number, Record<string, string>>,
  rawArtifacts: Map<string, M1StageAVerifiedArtifact>,
  canonical: ReturnType<typeof canonicalM1AgentProfile>,
  scope: M1StageAFrozenScope,
  snapshotId: string,
  exportBundleSha256: string,
) {
  if (!isRecord(value) || value.schemaVersion !== "m1-stage-a-agent-run-artifact-v1") {
    throw new Error(`Run artifact ${entry.sessionId} has the wrong schemaVersion`);
  }
  assertScope(value.scope, `runArtifact ${entry.sessionId}.scope`);
  requireSameScope(value.scope, scope, `runArtifact ${entry.sessionId}.scope`);
  if (
    value.snapshotId !== snapshotId || value.exportBundleSha256 !== exportBundleSha256 ||
    value.pairId !== entry.pairId || value.replicateId !== "R-PRIMARY" || value.sessionId !== entry.sessionId ||
    value.launchTokenSha256 !== entry.launchTokenSha256 || value.status !== entry.status ||
    value.terminationCode !== entry.terminationCode ||
    value.agentProfileSha256 !== entry.agentProfileSha256 || value.attemptCount !== entry.attemptCount ||
    value.attemptLedgerSha256 !== entry.attemptLedgerSha256
  ) throw new Error(`Run artifact ${entry.sessionId} is not bound to its run manifest entry`);
  const indexed = m1StageARawArtifactReferences(value, entry.sessionId);
  const indexedKeys = new Set<string>();
  for (const artifact of indexed) {
    if (indexedKeys.has(artifact.key)) throw new Error(`Run artifact ${entry.sessionId} contains a duplicate raw artifact`);
    indexedKeys.add(artifact.key);
  }
  const requiredKeys = new Set<string>();
  for (const attempt of attempts) {
    for (const [column, kind] of [
      ["runtime_request_sha256", "runtime-request"],
      ["screenshot_sha256", "screenshot"],
      ["output_sha256", "model-output"],
      ["action_trace_sha256", "action-trace"],
    ] as const) {
      const hash = attempt[column];
      if (!hash) continue;
      assertSha256(hash, `attempt ${entry.sessionId}:${attempt.step_order}:${attempt.attempt_number}.${column}`);
      requiredKeys.add(`${kind}:${hash.toLowerCase()}`);
    }
  }
  if (
    indexedKeys.size !== requiredKeys.size ||
    [...requiredKeys].some((key) => !indexedKeys.has(key)) ||
    [...indexedKeys].some((key) => !requiredKeys.has(key))
  ) throw new Error(`Run artifact ${entry.sessionId} does not exactly cover every non-empty raw attempt artifact hash`);
  for (const [column, label] of [
    ["screenshot_sha256", "screenshot"],
    ["output_sha256", "model-output"],
  ] as const) {
    const ownerByHash = new Map<string, number>();
    for (const attempt of attempts) {
      const hash = attempt[column]?.toLowerCase();
      if (!hash) continue;
      const stepOrder = integer(attempt.step_order, `attempt ${entry.sessionId}.step_order`);
      const priorOwner = ownerByHash.get(hash);
      if (priorOwner !== undefined && priorOwner !== stepOrder) {
        throw new Error(`Run artifact ${entry.sessionId} reuses one ${label} across ledger pages ${priorOwner} and ${stepOrder}`);
      }
      ownerByHash.set(hash, stepOrder);
    }
  }
  for (const artifact of indexed) {
    const verified = rawArtifacts.get(artifact.key);
    if (!verified || verified.bytes.byteLength === 0) {
      throw new Error(`Run artifact ${entry.sessionId} raw artifact was not loaded: ${artifact.key}`);
    }
    if (verified.sha256.toLowerCase() !== artifact.sha256) {
      throw new Error(`Run artifact ${entry.sessionId} raw artifact SHA-256 mismatch: ${artifact.key}`);
    }
    const linkedAttempts = attempts.filter((attempt) => {
      const column = artifact.kind === "runtime-request"
        ? "runtime_request_sha256"
        : artifact.kind === "screenshot"
          ? "screenshot_sha256"
          : artifact.kind === "model-output"
            ? "output_sha256"
            : "action_trace_sha256";
      return attempt[column]?.toLowerCase() === artifact.sha256;
    });
    if (artifact.kind === "screenshot") {
      validateM1StageAScreenshot(verified.bytes, `Run artifact ${entry.sessionId} screenshot`);
    }
    if (artifact.kind === "action-trace") {
      const trace = parseJsonArtifact<Record<string, unknown>>(verified, `action trace ${entry.sessionId}:${artifact.sha256}`);
      const actionCount = validateM1StageAActionTrace(trace, `Run artifact ${entry.sessionId} action trace`);
      for (const attempt of linkedAttempts) {
        if (actionCount !== integer(attempt.tool_calls, `attempt ${entry.sessionId}:${attempt.step_order}:${attempt.attempt_number}.tool_calls`)) {
          throw new Error(`Run artifact ${entry.sessionId} action trace count does not match tool_calls`);
        }
      }
    }
    if (artifact.kind === "runtime-request") {
      const request = validateM1StageARuntimeRequestShape(
        parseJsonArtifact<Record<string, unknown>>(verified, `runtime request ${entry.sessionId}:${artifact.sha256}`),
        `Run artifact ${entry.sessionId} runtime request`,
      );
      const stepOrders = new Set(linkedAttempts.map((attempt) => integer(attempt.step_order, "attempt step_order")));
      if (stepOrders.size !== 1 || request.sessionId !== entry.sessionId || request.stepOrder !== [...stepOrders][0]) {
        throw new Error(`Run artifact ${entry.sessionId} runtime request is not bound to one ledger page`);
      }
      if (
        request.modelName !== canonical.modelName || request.controllerVersion !== canonical.controllerVersion ||
        request.promptPackageSha256 !== canonical.runtimePromptPackageSha256 ||
        request.repositoryPromptSha256 !== canonical.repositorySystemPromptSha256 ||
        request.contextPolicy !== canonical.contextPolicy || request.inputModality !== canonical.inputModality ||
        request.imageDetail !== canonical.imageDetail || request.reasoningEffort !== canonical.reasoningEffort ||
        request.temperature !== canonical.temperature || request.topP !== canonical.topP || request.seed !== canonical.seed
      ) throw new Error(`Run artifact ${entry.sessionId} runtime request does not match the frozen Agent profile`);
      const screenshots = new Set(linkedAttempts.map((attempt) => attempt.screenshot_sha256.toLowerCase()));
      if (screenshots.size !== 1 || request.screenshotSha256 !== [...screenshots][0]) {
        throw new Error(`Run artifact ${entry.sessionId} runtime request screenshot binding mismatch`);
      }
      const expectedModelIds = [...new Set(linkedAttempts.map((attempt) => attempt.model_request_id).filter(Boolean))].sort();
      const expectedSourceIds = [...new Set(linkedAttempts.map((attempt) => attempt.source_model_request_id).filter(Boolean))].sort();
      const modelIds = [...request.modelRequestIds as string[]].sort();
      const sourceIds = [...request.sourceModelRequestIds as string[]].sort();
      if (
        new Set(modelIds).size !== modelIds.length || new Set(sourceIds).size !== sourceIds.length ||
        JSON.stringify(modelIds) !== JSON.stringify(expectedModelIds) || JSON.stringify(sourceIds) !== JSON.stringify(expectedSourceIds)
      ) throw new Error(`Run artifact ${entry.sessionId} runtime request model-request ID binding mismatch`);
    }
    if (artifact.kind === "model-output") {
      await validateM1StageAModelOutput(
        parseJsonArtifact<Record<string, unknown>>(verified, `model output ${entry.sessionId}:${artifact.sha256}`),
        `Run artifact ${entry.sessionId} model output`,
        entry,
        linkedAttempts,
        responsesById,
      );
    }
  }
  if ([...rawArtifacts.keys()].some((key) => !indexedKeys.has(key))) {
    throw new Error(`Run artifact ${entry.sessionId} has a loaded raw artifact not present in its index`);
  }
}

async function validateRunCoverage(
  tables: M1StageAExportTables,
  runManifestValue: unknown,
  runArtifacts: Map<string, M1StageAVerifiedArtifact>,
  rawArtifacts: Map<string, Map<string, M1StageAVerifiedArtifact>>,
  scope: M1StageAFrozenScope,
  snapshotId: string,
  exportBundleSha256: string,
  agentProfileSha256: string,
  browserMajor: number,
  canonical: ReturnType<typeof canonicalM1AgentProfile>,
) {
  requireHeaders(tables.allocations, "allocations", [
    "pair_id", "actor_type", "replicate_id", "schedule_id", "information_condition", "token_sha256",
    "token_created_at", "token_claimed_at", "claimed_session_id", "revoked_at", "terminal_disposition", "terminal_at",
    "study_phase", "preregistration_version", "analysis_set_version", "agent_profile_sha256", "primary_browser_major",
    "deployment_id", "deployment_fingerprint_sha256",
  ]);
  requireHeaders(tables.sessions, "sessions", [
    "session_id", "actor_type", "experimental_arm", "pair_id", "schedule_id", "information_condition", "session_status", "session_termination_code",
    "study_phase", "preregistration_version", "analysis_set_version", "agent_profile_sha256", "primary_browser_major", "model_name",
    "deployment_id", "deployment_fingerprint_sha256",
  ]);
  requireHeaders(tables.responses, "responses", [
    "response_id", "session_id", "step_order", "trial_id", "disclosure_index",
    "boundaries_json", "previous_boundaries_json", "boundary_intervals_json", "influence_rating",
    "no_change_confirmed", "single_stage_confirmed",
  ]);
  requireHeaders(tables.agentAttempts, "agent-attempts", [...ATTEMPT_DIGEST_COLUMNS]);

  const allocations = tables.allocations.rows.filter((row) => row.actor_type === "agent");
  if (allocations.length !== 12) throw new Error("Allocation export must contain exactly 12 Agent primary rows");
  const claimedAllocations: Array<Record<string, string>> = [];
  const allocationTokenHashes = new Set<string>();
  for (const allocation of allocations) {
    const label = `allocation ${allocation.pair_id}:agent`;
    if (allocation.replicate_id !== "R-PRIMARY") throw new Error(`${label} is not R-PRIMARY`);
    assertSha256(allocation.token_sha256, `${label}.token_sha256`);
    const tokenHash = allocation.token_sha256.toLowerCase();
    if (allocationTokenHashes.has(tokenHash)) throw new Error("Agent allocation tokens must be unique");
    allocationTokenHashes.add(tokenHash);
    requireFrozenStudyColumns(allocation, label);
    if (allocation.agent_profile_sha256.toLowerCase() !== agentProfileSha256) throw new Error(`${label}.agent_profile_sha256 mismatch`);
    if (integer(allocation.primary_browser_major, `${label}.primary_browser_major`) !== browserMajor) throw new Error(`${label}.primary_browser_major mismatch`);
    const createdAt = m1StageACsvTimestampMs(allocation.token_created_at, `${label}.token_created_at`);
    if (allocation.claimed_session_id) {
      if (!allocation.token_claimed_at) throw new Error(`${label} claimed token is missing token_claimed_at`);
      if (m1StageACsvTimestampMs(allocation.token_claimed_at, `${label}.token_claimed_at`) < createdAt) {
        throw new Error(`${label} was claimed before token creation`);
      }
      if (allocation.revoked_at || allocation.terminal_disposition || allocation.terminal_at) {
        throw new Error(`${label} cannot be both claimed and pre-start terminal/revoked`);
      }
      claimedAllocations.push(allocation);
      continue;
    }
    if (allocation.token_claimed_at) throw new Error(`${label} has token_claimed_at without a session`);
    const hasAnyTerminalField = Boolean(
      allocation.revoked_at || allocation.terminal_disposition || allocation.terminal_at,
    );
    if (!hasAnyTerminalField) continue;
    if (
      !isM1PreStartTerminalDisposition(allocation.terminal_disposition) ||
      !allocation.terminal_at ||
      allocation.terminal_at !== allocation.revoked_at
    ) throw new Error(`${label} has an invalid pre-start terminal lifecycle`);
    if (m1StageACsvTimestampMs(allocation.terminal_at, `${label}.terminal_at`) < createdAt) {
      throw new Error(`${label} became terminal before token creation`);
    }
  }
  const { runs } = validateRunArtifactManifestShape(
    runManifestValue,
    scope,
    snapshotId,
    exportBundleSha256,
    agentProfileSha256,
    claimedAllocations.length,
  );
  const sessions = tables.sessions.rows.filter((row) => row.actor_type === "agent");
  if (sessions.length !== claimedAllocations.length) {
    throw new Error("Session export must contain exactly one Agent primary session per claimed allocation");
  }
  const sessionsById = new Map<string, Record<string, string>>();
  for (const session of sessions) {
    if (!session.session_id || sessionsById.has(session.session_id)) throw new Error("Agent session_id values must be non-empty and unique");
    sessionsById.set(session.session_id, session);
  }
  const runBySession = new Map(runs.map((run) => [run.sessionId, run]));
  const allocationSessions = new Set<string>();
  for (const allocation of claimedAllocations) {
    const label = `allocation ${allocation.pair_id}:agent`;
    if (allocationSessions.has(allocation.claimed_session_id)) throw new Error("An Agent session is claimed by multiple allocations");
    allocationSessions.add(allocation.claimed_session_id);
    const session = sessionsById.get(allocation.claimed_session_id);
    if (!session) throw new Error(`${label} references a missing Agent session`);
    if (
      session.pair_id !== allocation.pair_id || session.schedule_id !== allocation.schedule_id ||
      session.information_condition !== allocation.information_condition
    ) throw new Error(`${label} does not match its Agent session`);
    const run = runBySession.get(allocation.claimed_session_id);
    if (!run) throw new Error(`${label} is missing from the run artifact manifest`);
    if (
      run.pairId !== allocation.pair_id || run.replicateId !== allocation.replicate_id ||
      run.launchTokenSha256.toLowerCase() !== allocation.token_sha256.toLowerCase() ||
      run.scheduleId !== integer(allocation.schedule_id, `${label}.schedule_id`) ||
      run.informationCondition !== allocation.information_condition
    ) throw new Error(`${label} does not match its run artifact manifest entry`);
  }
  if (
    allocationSessions.size !== claimedAllocations.length ||
    [...sessionsById.keys()].some((sessionId) => !allocationSessions.has(sessionId))
  ) {
    throw new Error("Agent allocation/session coverage does not exactly match the claimed R-PRIMARY runs");
  }

  const attemptsBySession = new Map<string, Array<Record<string, string>>>();
  for (const attempt of tables.agentAttempts.rows) {
    const session = sessionsById.get(attempt.session_id);
    if (!session) throw new Error(`Agent attempt references a non-primary session: ${attempt.session_id}`);
    verifyAttemptProfile(attempt, canonical, `attempt ${attempt.session_id}:${attempt.step_order}:${attempt.attempt_number}`);
    const rows = attemptsBySession.get(attempt.session_id) ?? [];
    rows.push(attempt);
    attemptsBySession.set(attempt.session_id, rows);
  }
  const responsesById = new Map<number, Record<string, string>>();
  for (const response of tables.responses.rows) {
    if (!sessionsById.has(response.session_id)) continue;
    const responseId = integer(response.response_id, `response ${response.response_id}.response_id`);
    if (responsesById.has(responseId)) throw new Error(`Duplicate Agent response_id in evidence bundle: ${responseId}`);
    responsesById.set(responseId, response);
  }

  for (const run of runs) {
    const session = sessionsById.get(run.sessionId);
    if (!session) throw new Error(`Run manifest contains an unknown session: ${run.sessionId}`);
    const label = `session ${run.sessionId}`;
    requireFrozenStudyColumns(session, label);
    if (session.experimental_arm !== "agent-m1-main") throw new Error(`${label} is not an agent-m1-main run`);
    if (session.session_status !== run.status || session.session_termination_code !== run.terminationCode) {
      throw new Error(`${label} status/terminationCode does not match the run artifact manifest`);
    }
    if (session.agent_profile_sha256.toLowerCase() !== agentProfileSha256) throw new Error(`${label}.agent_profile_sha256 mismatch`);
    if (integer(session.primary_browser_major, `${label}.primary_browser_major`) !== browserMajor) throw new Error(`${label}.primary_browser_major mismatch`);
    if (session.model_name !== canonical.modelName || run.modelName !== canonical.modelName) throw new Error(`${label}.model_name mismatch`);
    if (run.agentProfileSha256.toLowerCase() !== agentProfileSha256 || run.primaryBrowserMajor !== browserMajor) {
      throw new Error(`${label} run profile/browser mismatch`);
    }
    const attempts = attemptsBySession.get(run.sessionId) ?? [];
    const digest = hashM1AgentAttemptLedgerRows(attempts);
    if (run.attemptCount !== attempts.length || run.attemptLedgerSha256.toLowerCase() !== digest) {
      throw new Error(`${label} attempt ledger is not bound to the run artifact manifest`);
    }
    const artifact = runArtifacts.get(run.sessionId);
    if (!artifact || artifact.bytes.byteLength === 0) throw new Error(`${label} run artifact was not loaded`);
    if (artifact.sha256.toLowerCase() !== run.runArtifact.sha256.toLowerCase()) {
      throw new Error(`${label} run artifact SHA-256 mismatch`);
    }
    await validateRunArtifact(
      parseJsonArtifact(artifact, `${label} run artifact`),
      run,
      attempts,
      responsesById,
      rawArtifacts.get(run.sessionId) ?? new Map(),
      canonical,
      scope,
      snapshotId,
      exportBundleSha256,
    );
  }
  if ([...runArtifacts.keys()].some((sessionId) => !runBySession.has(sessionId))) {
    throw new Error("A loaded run artifact is not listed in the run artifact manifest");
  }
}

export async function verifyM1StageAEvidenceBundle(
  input: M1StageAEvidenceVerificationInput,
): Promise<{ externalGates: M1StageAExternalGates; manualStopChecks: M1StageAManualStopChecks }> {
  validateM1StageAExternalEvidence(input.evidence);
  requireSameScope(input.evidence.scope, input.scope, "evidence.scope");
  if (!input.evidenceHmacSecret || Buffer.byteLength(input.evidenceHmacSecret, "utf8") < 32) {
    throw new Error("M1_AUDIT_EVIDENCE_HMAC_SECRET is required and must contain at least 32 UTF-8 bytes");
  }
  if (input.evidenceHmacSecret === input.receiptHmacSecret) {
    throw new Error("Receipt and evidence HMAC secrets must be independently controlled");
  }
  const expectedEvidenceSignature = createHmac("sha256", input.evidenceHmacSecret)
    .update(canonicalJson(unsignedObject(input.evidence as unknown as Record<string, unknown>, "evidenceSignature")))
    .digest();
  const receivedEvidenceSignature = Buffer.from(input.evidence.evidenceSignature, "hex");
  if (
    receivedEvidenceSignature.length !== expectedEvidenceSignature.length ||
    !timingSafeEqual(receivedEvidenceSignature, expectedEvidenceSignature)
  ) throw new Error("External evidence root HMAC signature is invalid");
  for (const key of M1_STAGE_A_EXTERNAL_ARTIFACT_KEYS) artifactIsVerified(input.evidence, input.artifacts, key);
  const eventSourceArchiveVerified = verifyM1StageAEventSourceArchive(
    input.evidence,
    input.artifacts,
    input.scope,
  );
  const exportDeploymentIdentity = validateM1StageADeploymentIdentity(input.tables);

  let receipt: M1StageACollectionExportReceipt | null = null;
  if (input.evidence.collectionExportReceipt) {
    receipt = validateCollectionReceipt(
      parseJsonArtifact(input.artifacts.collectionExportReceipt!, "collectionExportReceipt"),
      input.scope,
      input.exportHashes,
      input.exportBundleSha256,
      exportDeploymentIdentity,
      input.receiptHmacSecret,
    );
    if (receipt.receiptKeyId === input.evidence.evidenceKeyId) {
      throw new Error("Receipt and evidence roots must use distinct controlled key IDs");
    }
  }

  let deploymentVerified = false;
  if (
    receipt && input.evidence.sourceManifest && input.evidence.deploymentManifest &&
    input.evidence.deploymentBundleManifest
  ) {
    validateDeploymentManifest(
      parseJsonArtifact(input.artifacts.deploymentManifest!, "deploymentManifest"),
      parseJsonArtifact(input.artifacts.sourceManifest!, "sourceManifest"),
      parseJsonArtifact(input.artifacts.deploymentBundleManifest!, "deploymentBundleManifest"),
      input.deploymentArtifacts,
      input.scope,
      receipt.snapshotId,
      input.artifacts.sourceManifest!.sha256,
      input.artifacts.deploymentBundleManifest!.sha256,
      exportDeploymentIdentity,
      input.tables,
      receipt.collectionClosedAt,
    );
    deploymentVerified = true;
  }

  let agentBindingsVerified = false;
  if (
    receipt && input.evidence.executableController && input.evidence.runtimePromptPackage &&
    input.evidence.agentProfileManifest && input.evidence.browserRuntimeManifest && input.evidence.runArtifactManifest
  ) {
    const profile = await validateAgentProfileManifest(
      parseJsonArtifact(input.artifacts.agentProfileManifest!, "agentProfileManifest"),
      input.scope,
      receipt.snapshotId,
      input.artifacts.executableController!.sha256,
      input.artifacts.runtimePromptPackage!.sha256,
    );
    const browser = validateBrowserRuntimeManifest(
      parseJsonArtifact(input.artifacts.browserRuntimeManifest!, "browserRuntimeManifest"),
      input.scope,
      receipt.snapshotId,
      profile.canonical.browserMajor,
    );
    await validateRunCoverage(
      input.tables,
      parseJsonArtifact(input.artifacts.runArtifactManifest!, "runArtifactManifest"),
      input.runArtifacts,
      input.rawArtifacts,
      input.scope,
      receipt.snapshotId,
      input.exportBundleSha256,
      profile.manifest.agentProfileSha256.toLowerCase(),
      browser.browserMajor,
      profile.canonical,
    );
    agentBindingsVerified = true;
  }

  const has = (key: M1StageAExternalArtifactKey) => Boolean(input.evidence[key]);
  return {
    manualStopChecks: {
      confirmedDataLossCount: input.evidence.confirmedDataLossCount,
      confirmedDataLossAuditSha256: input.evidence.confirmedDataLossAudit?.sha256 ?? null,
      futureDisclosureLeakageCount: input.evidence.futureDisclosureLeakageCount,
      futureDisclosureAuditSha256: input.evidence.futureDisclosureAudit?.sha256 ?? null,
    },
    externalGates: {
      stageACollectionClosed: receipt !== null,
      inputExportBundleHashVerified: receipt !== null,
      eventSourceArchiveVerified,
      ethicsDecisionArchived: has("ethicsDecision"),
      approvedConsentAndDataPlanArchived: has("approvedConsentMaterials") && has("dataManagementPlan"),
      humanScreeningProtocolArchived: has("humanLanguageScreeningProtocol"),
      deploymentManifestArchived: deploymentVerified,
      withdrawalExclusionProcessVerified: has("withdrawalExclusionProcess"),
      rawUaMinimizationAuditArchived: has("rawUaMinimizationAudit"),
      dataLossAuditArchived: input.evidence.confirmedDataLossCount !== null && has("confirmedDataLossAudit"),
      futureDisclosureAuditArchived: input.evidence.futureDisclosureLeakageCount !== null && has("futureDisclosureAudit"),
      executableControllerArchived: agentBindingsVerified,
      runtimePromptPackageArchived: agentBindingsVerified,
      frozenModelAndApiArchived: agentBindingsVerified,
      frozenBrowserRuntimeArchived: agentBindingsVerified,
      runArtifactManifestHashLinked: agentBindingsVerified,
      externalEvidenceBundleHashVerified: input.externalEvidenceFileVerified,
    },
  };
}
