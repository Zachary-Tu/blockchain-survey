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

test("server-renders the modular research platform", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>Boundary Lab｜第四版模块化阶段判断实验<\/title>/i);
  assert.match(html, /把一个问题/);
  assert.match(html, /拆成四组可检验的实验/);
  assert.match(html, /信息披露主实验/);
  assert.match(html, /任务定义实验/);
  assert.match(html, /跨指标一致性/);
  assert.match(html, /稳健性与对照/);
  assert.match(html, /价格数据/);
  assert.match(html, /Active addresses/);
  assert.match(html, /Google Trend index/);
  assert.match(html, /T1 · 任意阶段/);
  assert.match(html, /T2 · 三阶段/);
  assert.match(html, /T3 · 定义三阶段/);
  assert.match(html, /一般信息 GI/);
  assert.match(html, /领域信息 DI/);
  assert.match(html, /数据截断/);
  assert.match(html, /完整可用数据/);
  assert.match(html, /预设截断窗口/);
  assert.match(html, /2020-01-01—2024-12-31/);
  assert.match(html, /FOURTH EDITION/);
  assert.match(html, /RESEARCHER CONSOLE/);
  assert.match(html, /研究者操作台 · 不向被测试者展示/);
  assert.match(html, /确认配置，生成参与者说明/);
  assert.doesNotMatch(html, /我已阅读并理解以上说明/);
  assert.doesNotMatch(html, /你对这次划分有多大信心/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton/i);
});

test("implements a configuration-aware participant briefing without future disclosure leakage", async () => {
  const source = await readFile(
    new URL("../app/ExperimentModular.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /phase === "briefing"/);
  assert.match(source, /PARTICIPANT BRIEFING · 正式实验尚未开始/);
  assert.match(source, /本页不会说明资产名称、指标类型、真实日期、数值单位、图表尺度、时间窗口或事件/);
  assert.match(source, /我已了解，开始正式实验/);
  assert.match(source, /DISCLOSURE_PATHS\[disclosurePath\]\.length - 1/);
  assert.match(source, /participantBriefingVersion: isV4 \? "participant-briefing-v1"/);
});

test("server-renders the researcher cue methodology and reference list", async () => {
  const response = await render("/methodology/cues");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /每一步只问/);
  assert.match(html, /本步真正新增的线索/);
  assert.match(html, /disclosure-specific-cues-v2/);
  assert.match(html, /g0_trend_slope/);
  assert.match(html, /di4_no_effect/);
  assert.match(html, /Tsai/);
  assert.match(html, /Fudolig/);
  assert.match(html, /Nguyen/);
  assert.match(html, /项目专用操作化自报项目/);
});

test("keeps all preceding interfaces available for rollback", async () => {
  const v3 = await render("/v3-revised");
  assert.equal(v3.status, 200);
  const v3Html = await v3.text();
  assert.match(v3Html, /语义会让分界移动吗/);
  assert.match(v3Html, /评价预设阶段/);

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

  const predecessor = await render("/v4-predecessor");
  assert.equal(predecessor.status, 200);
  const predecessorHtml = await predecessor.text();
  assert.match(predecessorHtml, /MODULAR PROTOCOL V6/);
  assert.doesNotMatch(predecessorHtml, /完整可用数据/);
});

test("ships the fourth-edition full and curated window protocol", async () => {
  const raw = await readFile(
    new URL("../public/data/research-stimuli-modular-v7.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.protocolVersion, "boundary-lab-modular-v4");
  assert.equal(stimulus.datasetVersion, "research-stimuli-modular-v7");
  assert.deepEqual(
    { start: stimulus.curatedWindow.start, end: stimulus.curatedWindow.end },
    { start: "2020-01-01", end: "2024-12-31" },
  );
  assert.match(stimulus.curatedWindow.rule, /without interpolation/);
  assert.deepEqual(
    stimulus.assets.map((asset) => asset.metrics.price.resolutions.daily.points[0].date),
    ["2010-10-21", "2015-11-16", "2020-07-19", "2017-11-02"],
  );
  for (const asset of stimulus.assets) {
    const source = asset.metrics.price.source;
    assert.equal(source.availableWindow.start, asset.metrics.price.resolutions.daily.points[0].date);
    assert.equal(source.observationCount, asset.metrics.price.resolutions.daily.points.length);
  }
});

test("freezes the literature-grounded cue taxonomy with stable codes", async () => {
  const raw = await readFile(
    new URL("../public/data/cue-taxonomy-v4.json", import.meta.url),
    "utf8",
  );
  const taxonomy = JSON.parse(raw);
  const options = taxonomy.groups.flatMap((group) => group.options);

  assert.equal(taxonomy.schemaVersion, "visual-cpd-event-segmentation-v1");
  assert.equal(options.length, 16);
  assert.equal(new Set(options.map((option) => option.code)).size, options.length);
  assert.ok(options.some((option) => option.code === "curve_signal_noise"));
  assert.ok(options.some((option) => option.code === "display_axis_scale"));
  assert.ok(options.some((option) => option.code === "context_prior_expectation"));
  assert.ok(taxonomy.evidenceMap.length >= 6);
});

test("ships five disclosure-specific cues for every fourth-edition information state", async () => {
  const raw = await readFile(
    new URL("../public/data/cue-taxonomy-v4-v2.json", import.meta.url),
    "utf8",
  );
  const taxonomy = JSON.parse(raw);
  const expectedDisclosures = ["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4", "FULL"];
  const options = taxonomy.sets.flatMap((set) => set.options);
  const referenceIds = new Set(taxonomy.references.map((reference) => reference.id));

  assert.equal(taxonomy.schemaVersion, "disclosure-specific-cues-v2");
  assert.deepEqual(
    [taxonomy.disclosureAccounting.general.updates, taxonomy.disclosureAccounting.domain.updates, taxonomy.disclosureAccounting.combined.updates],
    [2, 4, 6],
  );
  assert.deepEqual(taxonomy.sets.map((set) => set.disclosureKey), expectedDisclosures);
  assert.ok(taxonomy.sets.every((set) => set.options.length === 5));
  assert.equal(options.length, 40);
  assert.equal(new Set(options.map((option) => option.code)).size, options.length);
  assert.ok(taxonomy.references.length >= 10);
  assert.ok(options.every((option) => option.references.every((reference) => referenceIds.has(reference))));
  assert.ok(taxonomy.sets.filter((set) => !["G0", "FULL"].includes(set.disclosureKey)).every((set) => set.options.filter((option) => option.exclusive).length === 1));
});

test("ships the modular stimulus bundle with research controls", async () => {
  const raw = await readFile(
    new URL("../public/data/research-stimuli-modular-v6.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.protocolVersion, "boundary-lab-modular-v6");
  assert.deepEqual(
    stimulus.assets.map((asset) => asset.symbol),
    ["BTC", "ETH", "SOL", "BNB"],
  );
  assert.deepEqual(
    stimulus.controls.map((control) => control.kind),
    ["cross-domain", "null", "ground-truth"],
  );
  assert.equal(stimulus.controls[0].id, "sp500");
  assert.ok(stimulus.controls[0].metric.resolutions.daily.points.length > 2000);
  assert.equal(stimulus.controls[1].id, "white-noise");
  assert.equal(stimulus.controls[2].knownBoundaries.length, 2);
  for (const asset of stimulus.assets) {
    assert.ok(asset.events.every((event) => ["high", "low"].includes(event.priority)));
  }
});

test("ships a provenance-aware multi-metric stimulus bundle", async () => {
  const raw = await readFile(
    new URL("../public/data/research-stimuli-v5.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.protocolVersion, "context-elasticity-multimetric-v5");
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
    for (const metric of Object.values(asset.metrics)) {
      for (const resolution of Object.values(metric.resolutions ?? {})) {
        assert.deepEqual(
          Object.keys(resolution.referenceBoundariesByCount),
          ["1", "2", "3"],
        );
        for (const count of [1, 2, 3]) {
          const boundaries = resolution.referenceBoundariesByCount[String(count)];
          assert.equal(boundaries.length, count);
          assert.ok(boundaries.every((ratio) => ratio > 0 && ratio < 1));
          assert.deepEqual(boundaries, [...boundaries].sort((a, b) => a - b));
        }
      }
    }
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

test("retains the v4 multi-metric stimulus for protocol rollback", async () => {
  const raw = await readFile(
    new URL("../public/data/research-stimuli-v4.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);
  assert.equal(stimulus.protocolVersion, "context-elasticity-multimetric-v4");
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
