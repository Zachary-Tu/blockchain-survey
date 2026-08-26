import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const M1_SOURCE_MANIFEST_FILES = [
  ".openai/hosting.json",
  "README.md",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "vite.config.ts",
  "postcss.config.mjs",
  "drizzle.config.ts",
  "tsconfig.json",
  "build/sites-vite-plugin.ts",
  "worker/index.ts",
  "worker-configuration.d.ts",
  "app/layout.tsx",
  "app/globals.css",
  "app/v2.css",
  "app/v3.css",
  "app/agent.css",
  "app/ExperimentModular.tsx",
  "app/modular.css",
  "app/m1/page.tsx",
  "app/agent/page.tsx",
  "app/research/m1-launch/page.tsx",
  "app/research/m1-launch/M1LaunchClient.tsx",
  "app/research/results/page.tsx",
  "app/methodology/m1/page.tsx",
  "app/api/m1-launches/route.ts",
  "app/api/m1-step-exposures/route.ts",
  "app/api/agent-attempts/route.ts",
  "app/api/modular-responses/route.ts",
  "app/api/sessions/route.ts",
  "app/api/research-export/route.ts",
  "db/index.ts",
  "db/schema.ts",
  "lib/csv.ts",
  "lib/m1-agent-profile.ts",
  "lib/m1-collection-gates.ts",
  "lib/m1-execution-limits.ts",
  "lib/m1-launch.ts",
  "lib/m1-protocol.ts",
  "lib/m1-response-integrity.ts",
  "lib/m1-stage-a-audit.ts",
  "lib/m1-stage-a-evidence.ts",
  "lib/m1-stage-a-normalize.ts",
  "lib/m1-ui-invariants.ts",
  "public/data/research-stimuli-modular-v8.json",
  "public/data/m1-agent-runner-protocol.json",
  "public/data/m1-agent-system-prompt-v1.txt",
  "docs/M1_ISOMORPHIC_HUMAN_AGENT_METHOD_ZH.md",
  "docs/M1_STAGE_A_AUDIT_RUNBOOK_ZH.md",
  "docs/M1_DATA_STORAGE_AND_TELEMETRY_ZH.md",
  "docs/EXPERIMENT_BRIEF_REPORT_EN.md",
  "scripts/audit-m1-stage-a.ts",
  "scripts/generate-m1-source-manifest.ts",
  "tests/rendered-html.test.mjs",
  "tests/m1-protocol.test.ts",
  "tests/m1-ui-invariants.test.ts",
  "tests/m1-execution-limits.test.ts",
  "tests/m1-stage-a-audit.test.ts",
  "tests/m1-stage-a-evidence.test.ts",
  "tests/m1-source-manifest.test.ts",
].sort();

export function normalizeM1ManifestSource(relativePath: string, source: Buffer) {
  // Source manifests must be reproducible across Windows and POSIX checkouts.
  // Every indexed source artifact is UTF-8 text, so normalize Git's possible
  // CRLF working-tree conversion before hashing.
  const normalizedLineEndings = Buffer.from(source.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  if (relativePath === "lib/m1-protocol.ts") {
    return Buffer.from(normalizedLineEndings.toString("utf8").replace(
      /export const M1_IMPLEMENTATION_BUILD_ID = "[^"]+";/,
      'export const M1_IMPLEMENTATION_BUILD_ID = "<SOURCE_MANIFEST_HASH>";',
    ), "utf8");
  }
  if (relativePath === "tests/rendered-html.test.mjs" || relativePath === "docs/EXPERIMENT_BRIEF_REPORT_EN.md") {
    return Buffer.from(
      normalizedLineEndings.toString("utf8").replaceAll(/m1-stage-a2-[a-f0-9]{16}/g, "m1-stage-a2-<SOURCE_MANIFEST_HASH>"),
      "utf8",
    );
  }
  return normalizedLineEndings;
}

export async function buildM1SourceManifest(root = process.cwd()) {
  const migrationFiles = (await readdir(path.join(root, "drizzle"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => `drizzle/${entry.name}`);
  const migrationMetadataFiles = (await readdir(path.join(root, "drizzle", "meta"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && (entry.name === "_journal.json" || entry.name.endsWith("_snapshot.json")))
    .map((entry) => `drizzle/meta/${entry.name}`);
  const manifestFiles = [...new Set([
    ...M1_SOURCE_MANIFEST_FILES,
    ...migrationFiles,
    ...migrationMetadataFiles,
  ])].sort();
  const files = await Promise.all(manifestFiles.map(async (relativePath) => {
    const source = await readFile(path.join(root, relativePath));
    const normalized = normalizeM1ManifestSource(relativePath, source);
    return {
      path: relativePath,
      sha256: createHash("sha256").update(normalized).digest("hex"),
      bytes: normalized.byteLength,
    };
  }));
  return {
    schemaVersion: "m1-source-manifest-v1",
    protocolArchitecture: "m1-isomorphic-v1",
    cohortFamily: "m1-technical-pilot-a2",
    normalization: {
      "all-indexed-source-files": "utf8-crlf-to-lf-v1",
      "lib/m1-protocol.ts": "implementation-build-id-placeholder-v1",
      "tests/rendered-html.test.mjs": "implementation-build-id-placeholder-v1",
      "docs/EXPERIMENT_BRIEF_REPORT_EN.md": "implementation-build-id-placeholder-v1",
    },
    files,
  };
}

async function main() {
  const root = process.cwd();
  const manifest = await buildM1SourceManifest(root);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(root, "public/data/m1-source-manifest.json"), serialized, "utf8");
  const digest = createHash("sha256").update(serialized).digest("hex");
  process.stdout.write(`${digest}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Manifest generation failed"}\n`);
    process.exitCode = 1;
  });
}
