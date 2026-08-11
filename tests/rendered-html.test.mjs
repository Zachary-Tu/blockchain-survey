import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
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

test("server-renders the four-curve, six-step Chinese experiment", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Boundary Lab｜你的分界点，会不会移动？<\/title>/i);
  assert.match(html, /你的分界点/);
  assert.match(html, /4[^<]*<\/strong><span>条匿名走势/);
  assert.match(html, /2[^<]*<\/strong><span>个固定分界点/);
  assert.match(html, /6[^<]*<\/strong><span>步信息变化/);
  assert.match(html, /走势/);
  assert.match(html, /坐标/);
  assert.match(html, /资产/);
  assert.match(html, /时间/);
  assert.match(html, /价格/);
  assert.match(html, /全貌/);
  assert.match(html, /事件/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton/i);
});

test("keeps the original experiment available at the legacy route", async () => {
  const response = await render("/legacy");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /你在哪里看到/);
  assert.match(html, /六轮信息披露/);
});

test("ships four comparable weekly pilot curves", async () => {
  const raw = await readFile(
    new URL("../public/data/asset-stimuli-v2.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.protocolVersion, "context-elasticity-four-asset-v3");
  assert.equal(stimulus.dataset.pilotCurveCount, 4);
  assert.deepEqual(
    stimulus.curves.map((curve) => curve.asset.symbol),
    ["BTC", "ETH", "SOL", "BNB"],
  );
  assert.ok(stimulus.curves.every((curve) => curve.points.length >= 229));
  assert.ok(stimulus.curves.every((curve) => curve.points.length <= 230));
  assert.ok(stimulus.curves.every((curve) => curve.events.length === 6));
  assert.ok(stimulus.curves.every((curve) => curve.contextPoints.length > curve.points.length));
  assert.ok(stimulus.curves.every((curve) =>
    curve.source.contextWindow.start < curve.source.window.start &&
    curve.source.contextWindow.end > curve.source.window.end,
  ));
  assert.ok(stimulus.curves.every((curve) =>
    curve.points.every((point) => point.normalized >= 0 && point.normalized <= 1),
  ));
  assert.ok(stimulus.curves.every((curve) =>
    Math.min(...curve.points.map((point) => point.normalized)) === 0 &&
    Math.max(...curve.points.map((point) => point.normalized)) === 1,
  ));
  assert.ok(stimulus.curves.every((curve) =>
    Math.min(...curve.contextPoints.map((point) => point.normalized)) === 0 &&
    Math.max(...curve.contextPoints.map((point) => point.normalized)) === 1,
  ));
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
