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

test("server-renders the research configuration for the third-generation study", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Boundary Lab｜阶段判断的上下文弹性研究<\/title>/i);
  assert.match(html, /语义会让分界移动吗/);
  assert.match(html, /价格数据/);
  assert.match(html, /活跃地址/);
  assert.match(html, /Google 搜索热度/);
  assert.match(html, /固定两个分界点/);
  assert.match(html, /自由选择分界点/);
  assert.match(html, /评价预设划分/);
  assert.match(html, /名称与背景/);
  assert.match(html, /时间轴与单位/);
  assert.match(html, /重要事件/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton/i);
});

test("keeps both earlier interfaces available for rollback", async () => {
  const v2 = await render("/v2");
  assert.equal(v2.status, 200);
  const v2Html = await v2.text();
  assert.match(v2Html, /你的分界点/);
  assert.match(v2Html, /4[^<]*<\/strong><span>条匿名走势/);

  const legacy = await render("/legacy");
  assert.equal(legacy.status, 200);
  const legacyHtml = await legacy.text();
  assert.match(legacyHtml, /你在哪里看到/);
  assert.match(legacyHtml, /六轮信息披露/);
});

test("ships a provenance-aware multi-metric stimulus bundle", async () => {
  const raw = await readFile(
    new URL("../public/data/research-stimuli-v4.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.protocolVersion, "context-elasticity-multimetric-v4");
  assert.deepEqual(stimulus.requestedWindow, {
    start: "2018-01-01",
    end: "2026-04-11",
  });
  assert.deepEqual(stimulus.resolutions, ["daily", "weekly", "monthly", "yearly"]);
  assert.deepEqual(
    stimulus.assets.map((asset) => asset.symbol),
    ["BTC", "ETH", "SOL", "BNB"],
  );

  for (const asset of stimulus.assets) {
    assert.equal(asset.metrics.price.available, true);
    assert.ok(asset.metrics.price.resolutions.daily.points.length >= 2000);
    assert.ok(asset.metrics.price.resolutions.weekly.points.length >= 290);
    assert.ok(asset.metrics.price.resolutions.monthly.points.length >= 69);
    assert.ok(asset.metrics.price.resolutions.yearly.points.length >= 7);
    assert.equal(asset.metrics.googleTrends.available, true);
    assert.equal(asset.metrics.googleTrends.resolutions.daily, undefined);
    assert.ok(asset.metrics.googleTrends.resolutions.weekly.points.length >= 220);
    assert.ok(asset.events.length >= 6);
  }

  const activeAvailability = stimulus.assets.map(
    (asset) => asset.metrics.activeAddresses.available,
  );
  assert.deepEqual(activeAvailability, [true, true, false, false]);
  for (const asset of stimulus.assets.slice(0, 2)) {
    assert.equal(asset.metrics.activeAddresses.source.metric, "AdrActCnt");
    assert.equal(asset.metrics.activeAddresses.resolutions.daily.points.length, 3023);
  }
  for (const asset of stimulus.assets.slice(2)) {
    assert.match(asset.metrics.activeAddresses.unavailableReason, /不.*合成数据|合成数据/);
  }
});

test("retains the preceding four-asset pilot stimulus", async () => {
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
});
