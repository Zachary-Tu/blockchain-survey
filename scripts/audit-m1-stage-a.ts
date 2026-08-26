import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { readFile, realpath, writeFile } from "node:fs/promises";
import {
  auditM1StageA,
  type M1StageAFrozenScope,
  type M1StageAInputManifest,
} from "../lib/m1-stage-a-audit";
import {
  M1_STAGE_A_EXTERNAL_ARTIFACT_KEYS,
  m1StageADeploymentBundleReferences,
  m1StageARunArtifactReferences,
  m1StageARawArtifactReferences,
  validateM1StageAExternalEvidence,
  verifyM1StageAEvidenceBundle,
  type M1StageAExternalArtifactKey,
  type M1StageAExternalEvidenceV3,
  type M1StageAFileReference,
  type M1StageAVerifiedArtifact,
} from "../lib/m1-stage-a-evidence";
import {
  normalizeM1StageAExports,
  parseResearchCsv,
  validSha256,
  type CsvTable,
  type M1StageAExportTables,
} from "../lib/m1-stage-a-normalize";

const EXPORT_KEYS = ["allocations", "sessions", "responses", "stepExposures", "agentAttempts"] as const;
type ExportKey = (typeof EXPORT_KEYS)[number];

type FileReference = M1StageAFileReference;

type AuditConfig = {
  schemaVersion: "m1-stage-a-audit-config-v2" | "m1-stage-a-audit-config-v3";
  scope: M1StageAFrozenScope;
  exports: Record<ExportKey, FileReference>;
  exportBundleSha256: string;
  externalEvidence: FileReference;
};

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireScope(value: unknown, label: string): asserts value is M1StageAFrozenScope {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  for (const key of ["cohortId", "protocolArchitecture", "implementationBuildId", "stimulusSha256", "eventSourceSha256"] as const) {
    if (typeof value[key] !== "string" || !value[key]) throw new Error(`${label}.${key} is required`);
  }
  if (!validSha256(value.stimulusSha256) || !validSha256(value.eventSourceSha256)) {
    throw new Error(`${label} stimulus/event hashes must be SHA-256`);
  }
}

function requireFileReference(value: unknown, label: string): asserts value is FileReference {
  if (!isRecord(value) || typeof value.path !== "string" || !value.path || !validSha256(value.sha256)) {
    throw new Error(`${label} requires a path and expected SHA-256`);
  }
}

function validateConfig(value: unknown): asserts value is AuditConfig {
  if (
    !isRecord(value) ||
    (value.schemaVersion !== "m1-stage-a-audit-config-v2" && value.schemaVersion !== "m1-stage-a-audit-config-v3")
  ) {
    throw new Error("Expected schemaVersion m1-stage-a-audit-config-v3");
  }
  requireScope(value.scope, "scope");
  if (!isRecord(value.exports)) throw new Error("exports is required");
  for (const key of EXPORT_KEYS) requireFileReference(value.exports[key], `exports.${key}`);
  if (!validSha256(value.exportBundleSha256)) throw new Error("exportBundleSha256 must be SHA-256");
  requireFileReference(value.externalEvidence, "externalEvidence");
}

function sameScope(first: M1StageAFrozenScope, second: M1StageAFrozenScope) {
  return (Object.keys(first) as Array<keyof M1StageAFrozenScope>).every((key) => first[key] === second[key]);
}

async function readVerified(reference: FileReference, baseDirectory: string, label: string) {
  const absolutePath = resolve(baseDirectory, reference.path);
  const bytes = await readFile(absolutePath);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== reference.sha256.toLowerCase()) {
    throw new Error(`${label} SHA-256 mismatch: expected ${reference.sha256}, received ${actualSha256}`);
  }
  return { absolutePath, bytes, sha256: actualSha256 };
}

async function readVerifiedEvidenceArtifact(reference: FileReference, rootDirectory: string, label: string) {
  if (isAbsolute(reference.path)) throw new Error(`${label}.path must be relative to the evidence directory`);
  const normalizedRelative = relative(rootDirectory, resolve(rootDirectory, reference.path));
  if (!normalizedRelative || normalizedRelative === "." || normalizedRelative.startsWith("..") || isAbsolute(normalizedRelative)) {
    throw new Error(`${label}.path escapes the evidence directory`);
  }
  const verified = await readVerified(reference, rootDirectory, label);
  const [realRoot, realFile] = await Promise.all([realpath(rootDirectory), realpath(verified.absolutePath)]);
  const realRelative = relative(realRoot, realFile);
  if (!realRelative || realRelative === "." || realRelative.startsWith("..") || isAbsolute(realRelative)) {
    throw new Error(`${label}.path resolves outside the evidence directory`);
  }
  return verified;
}

function exportBundleDigest(hashes: Record<ExportKey, string>) {
  return sha256(`${EXPORT_KEYS.map((key) => `${key}:${hashes[key]}`).join("\n")}\n`);
}

async function main() {
  const configPathArgument = process.argv[2];
  const outputPath = process.argv[3];
  if (!configPathArgument) {
    throw new Error("Usage: npm run audit:m1-stage-a -- <audit-config-v3.json> [result.json]");
  }
  const configPath = resolve(configPathArgument);
  const configBytes = await readFile(configPath);
  const parsedConfig: unknown = JSON.parse(configBytes.toString("utf8"));
  validateConfig(parsedConfig);
  const baseDirectory = dirname(configPath);

  const exportHashes = {} as Record<ExportKey, string>;
  const tables = {} as M1StageAExportTables;
  for (const key of EXPORT_KEYS) {
    const verified = await readVerified(parsedConfig.exports[key], baseDirectory, `exports.${key}`);
    exportHashes[key] = verified.sha256;
    (tables as Record<ExportKey, CsvTable>)[key] = parseResearchCsv(verified.bytes.toString("utf8"));
  }
  const actualExportBundleSha256 = exportBundleDigest(exportHashes);
  if (actualExportBundleSha256 !== parsedConfig.exportBundleSha256.toLowerCase()) {
    throw new Error(`Export bundle SHA-256 mismatch: expected ${parsedConfig.exportBundleSha256}, received ${actualExportBundleSha256}`);
  }

  const verifiedEvidence = await readVerified(parsedConfig.externalEvidence, baseDirectory, "externalEvidence");
  if (parsedConfig.schemaVersion !== "m1-stage-a-audit-config-v3") {
    throw new Error("Legacy Stage-A audit config cannot authorize GO; migrate to m1-stage-a-audit-config-v3");
  }
  const parsedEvidence: unknown = JSON.parse(verifiedEvidence.bytes.toString("utf8"));
  validateM1StageAExternalEvidence(parsedEvidence);
  if (!sameScope(parsedConfig.scope, parsedEvidence.scope)) throw new Error("Config and evidence scopes differ");

  const evidenceDirectory = dirname(verifiedEvidence.absolutePath);
  const evidenceArtifacts: Partial<Record<M1StageAExternalArtifactKey, M1StageAVerifiedArtifact>> = {};
  const evidenceArtifactPaths = new Map<M1StageAExternalArtifactKey, string>();
  for (const key of M1_STAGE_A_EXTERNAL_ARTIFACT_KEYS) {
    const reference = parsedEvidence[key];
    if (!reference) continue;
    const verified = await readVerifiedEvidenceArtifact(reference, evidenceDirectory, `externalEvidence.${key}`);
    evidenceArtifacts[key] = { sha256: verified.sha256, bytes: verified.bytes };
    evidenceArtifactPaths.set(key, verified.absolutePath);
  }

  const runArtifacts = new Map<string, M1StageAVerifiedArtifact>();
  const rawArtifacts = new Map<string, Map<string, M1StageAVerifiedArtifact>>();
  const deploymentArtifacts = new Map<string, M1StageAVerifiedArtifact>();
  const deploymentBundleArtifact = evidenceArtifacts.deploymentBundleManifest;
  if (deploymentBundleArtifact) {
    let deploymentBundleValue: unknown;
    try {
      deploymentBundleValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(deploymentBundleArtifact.bytes));
    } catch {
      throw new Error("externalEvidence.deploymentBundleManifest must be valid UTF-8 JSON");
    }
    const deploymentBundlePath = evidenceArtifactPaths.get("deploymentBundleManifest");
    if (!deploymentBundlePath) throw new Error("deploymentBundleManifest path was not retained after verification");
    for (const { path, reference } of m1StageADeploymentBundleReferences(deploymentBundleValue)) {
      if (deploymentArtifacts.has(path)) throw new Error(`Duplicate deployment artifact path: ${path}`);
      const verified = await readVerifiedEvidenceArtifact(
        reference,
        dirname(deploymentBundlePath),
        `deploymentBundleManifest.${path}`,
      );
      deploymentArtifacts.set(path, { sha256: verified.sha256, bytes: verified.bytes });
    }
  }
  const runManifestArtifact = evidenceArtifacts.runArtifactManifest;
  if (runManifestArtifact) {
    let runManifestValue: unknown;
    try {
      runManifestValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(runManifestArtifact.bytes));
    } catch {
      throw new Error("externalEvidence.runArtifactManifest must be valid UTF-8 JSON");
    }
    const runManifestPath = evidenceArtifactPaths.get("runArtifactManifest");
    if (!runManifestPath) throw new Error("runArtifactManifest path was not retained after verification");
    const runArtifactDirectory = dirname(runManifestPath);
    for (const { sessionId, reference } of m1StageARunArtifactReferences(runManifestValue)) {
      if (runArtifacts.has(sessionId)) throw new Error(`Duplicate run artifact sessionId: ${sessionId}`);
      const verified = await readVerifiedEvidenceArtifact(
        reference,
        runArtifactDirectory,
        `runArtifactManifest.${sessionId}`,
      );
      runArtifacts.set(sessionId, { sha256: verified.sha256, bytes: verified.bytes });
      let runArtifactValue: unknown;
      try {
        runArtifactValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(verified.bytes));
      } catch {
        throw new Error(`Run artifact ${sessionId} must be valid UTF-8 JSON`);
      }
      const rawForRun = new Map<string, M1StageAVerifiedArtifact>();
      for (const rawReference of m1StageARawArtifactReferences(runArtifactValue, sessionId)) {
        if (rawForRun.has(rawReference.key)) throw new Error(`Duplicate raw artifact reference for ${sessionId}: ${rawReference.key}`);
        const rawVerified = await readVerifiedEvidenceArtifact(
          rawReference.reference,
          dirname(verified.absolutePath),
          `runArtifact.${sessionId}.${rawReference.key}`,
        );
        rawForRun.set(rawReference.key, { sha256: rawVerified.sha256, bytes: rawVerified.bytes });
      }
      rawArtifacts.set(sessionId, rawForRun);
    }
  }

  const pairs = await normalizeM1StageAExports(parsedConfig.scope, tables);
  const { manualStopChecks, externalGates } = await verifyM1StageAEvidenceBundle({
    scope: parsedConfig.scope,
    exportHashes,
    exportBundleSha256: actualExportBundleSha256,
    tables,
    evidence: parsedEvidence as M1StageAExternalEvidenceV3,
    artifacts: evidenceArtifacts,
    deploymentArtifacts,
    runArtifacts,
    rawArtifacts,
    externalEvidenceFileVerified: true,
    receiptHmacSecret: process.env.M1_AUDIT_RECEIPT_HMAC_SECRET,
    evidenceHmacSecret: process.env.M1_AUDIT_EVIDENCE_HMAC_SECRET,
  });
  const inputManifest: M1StageAInputManifest = {
    allocationsSha256: exportHashes.allocations,
    sessionsSha256: exportHashes.sessions,
    responsesSha256: exportHashes.responses,
    stepExposuresSha256: exportHashes.stepExposures,
    agentAttemptsSha256: exportHashes.agentAttempts,
    exportBundleSha256: actualExportBundleSha256,
    externalEvidenceSha256: verifiedEvidence.sha256,
    verified: true,
  };
  const result = auditM1StageA({
    scope: parsedConfig.scope,
    inputManifest,
    pairs,
    manualStopChecks,
    externalGates,
  });
  const output = {
    schemaVersion: "m1-stage-a-audit-result-v3",
    rulesetVersion: "m1-pilot-go-v3",
    scope: parsedConfig.scope,
    configSha256: sha256(configBytes),
    inputManifest,
    proceedToStageB: result.decision === "GO",
    ...result,
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (outputPath) await writeFile(resolve(outputPath), serialized, { encoding: "utf8", flag: "wx" });
  else process.stdout.write(serialized);
  process.exitCode = result.decision === "GO"
    ? 0
    : result.decision === "REVISE"
      ? 2
      : result.decision === "STOP"
        ? 3
        : 4;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Stage-A audit failed"}\n`);
  process.exitCode = 4;
});
