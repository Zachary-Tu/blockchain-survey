import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Chinese experiment entry point", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Boundary Lab｜人类与 Agent 的阶段上下文弹性实验<\/title>/i);
  assert.match(html, /你在哪里看到/);
  assert.match(html, /形态/);
  assert.match(html, /坐标/);
  assert.match(html, /身份/);
  assert.match(html, /日期/);
  assert.match(html, /价格/);
  assert.match(html, /事件/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton/i);
});

test("ships the audited Bitcoin pilot stimulus", async () => {
  const raw = await readFile(
    new URL("../public/data/bitcoin-2017-2024.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.id, "li-btc-weekly-2017-2024-v1");
  assert.equal(stimulus.points.length, 416);
  assert.equal(stimulus.source.frozenCohortCount, 678);
  assert.equal(stimulus.source.currentRuleValidCount, 993);
  assert.equal(stimulus.source.rawTsvCount, 1000);
  assert.equal(stimulus.events.length, 8);
  assert.ok(stimulus.points.every((point) => point.normalized >= 0 && point.normalized <= 1));
});
