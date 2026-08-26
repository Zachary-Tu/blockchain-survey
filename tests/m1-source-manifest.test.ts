import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { M1_IMPLEMENTATION_BUILD_ID } from "../lib/m1-protocol";
import {
  buildM1SourceManifest,
  normalizeM1ManifestSource,
} from "../scripts/generate-m1-source-manifest";

test("source-manifest hashing is stable across CRLF and LF checkouts", () => {
  const crlf = normalizeM1ManifestSource("README.md", Buffer.from("alpha\r\nbeta\r\n"));
  const lf = normalizeM1ManifestSource("README.md", Buffer.from("alpha\nbeta\n"));
  assert.deepEqual(crlf, lf);
});

test("the frozen M1 build ID is bound to the current source manifest", async () => {
  const expected = await buildM1SourceManifest();
  const raw = await readFile("public/data/m1-source-manifest.json", "utf8");
  const stored = JSON.parse(raw) as unknown;
  assert.deepEqual(stored, expected);
  const digest = createHash("sha256").update(raw).digest("hex");
  assert.equal(M1_IMPLEMENTATION_BUILD_ID, `m1-stage-a2-${digest.slice(0, 16)}`);
});
