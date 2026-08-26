import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { M1_DISCLOSURE_KEYS } from "../lib/m1-protocol";
import { M1_CHART_FRAME, m1DisclosureVisibility, m1MetricDescription, m1RailStepState } from "../lib/m1-ui-invariants";

test("M1 uses one frozen chart frame across all disclosure states", () => {
  assert.deepEqual(M1_CHART_FRAME, {
    width: 1120,
    height: 600,
    margin: { top: 72, right: 28, bottom: 72, left: 88 },
  });
  assert.equal(Object.isFrozen(M1_CHART_FRAME), true);
  assert.equal(Object.isFrozen(M1_CHART_FRAME.margin), true);
});

test("future rail states are opaque and repeat-control labels stay neutral", () => {
  const staged = M1_DISCLOSURE_KEYS.map((_, index) =>
    m1RailStepState(M1_DISCLOSURE_KEYS, 0, index));
  assert.equal(staged[0].titleMode, "neutral-round");
  assert.deepEqual(staged.slice(1).map((state) => state.titleMode), Array(6).fill("locked"));

  const repeatKeys = Array(7).fill("G0");
  const repeat = repeatKeys.map((_, index) => m1RailStepState(repeatKeys, 3, index));
  assert.deepEqual(repeat.slice(0, 4).map((state) => state.titleMode), Array(4).fill("neutral-round"));
  assert.deepEqual(repeat.slice(4).map((state) => state.titleMode), Array(3).fill("locked"));
});

test("GI1 metric copy cannot leak GI2 units, frequency, or aggregation details", () => {
  const fullDefinition = "每个日历区间内的美元开盘价均值；周频显示 USD Open。";
  const gi1 = m1MetricDescription("price", false, fullDefinition);
  assert.equal(gi1, "该曲线表示价格数据。");
  assert.doesNotMatch(gi1, /美元|USD|周频|Open|日历区间/);
  assert.equal(m1MetricDescription("price", true, fullDefinition), fullDefinition);
  assert.equal(m1MetricDescription("activeAddresses", false, "单位为个地址"), "该曲线表示活跃地址数量数据。");
  assert.equal(m1MetricDescription("googleTrends", false, "0–100 标准化"), "该曲线表示 Google 搜索热度指数。");
});

test("the cumulative disclosure mask reveals only the fields assigned to each round", () => {
  assert.deepEqual(m1DisclosureVisibility("G0", "combined"), {
    metric: false, axes: false, asset: false, intro: false, highEvents: false, lowEvents: false,
  });
  assert.deepEqual(m1DisclosureVisibility("GI1", "combined"), {
    metric: true, axes: false, asset: false, intro: false, highEvents: false, lowEvents: false,
  });
  assert.deepEqual(m1DisclosureVisibility("GI2", "combined"), {
    metric: true, axes: true, asset: false, intro: false, highEvents: false, lowEvents: false,
  });
  assert.deepEqual(m1DisclosureVisibility("DI1", "combined"), {
    metric: true, axes: true, asset: true, intro: false, highEvents: false, lowEvents: false,
  });
  assert.deepEqual(m1DisclosureVisibility("DI4", "combined"), {
    metric: true, axes: true, asset: true, intro: true, highEvents: true, lowEvents: true,
  });
});

test("M1 event cards do not expose source priority or priority salience", () => {
  const source = readFileSync(new URL("../app/ExperimentModular.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/modular.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, />P\{eventSourcePriority\(event\)\}/);
  assert.doesNotMatch(source, /className=\{eventSourcePriority\(event\).*is-high/);
  assert.doesNotMatch(styles, /\.mod-event-list article > span\.is-high/);
  assert.match(source, /事件信息（一）/);
  assert.match(source, /事件信息（二）/);
});

test("M1 stimulus rendering is keyed to the acknowledged server exposure step", () => {
  const source = readFileSync(new URL("../app/ExperimentModular.tsx", import.meta.url), "utf8");
  assert.match(source, /pageExposureStepOrder === currentStepOrder/);
  assert.match(source, /setPageExposureStepOrder\(currentStepOrder\)/);
  assert.match(source, /isFixedM1 && \(!currentPageExposureReady \|\| currentPageExpired\)/);
});

test("M1 primary hurdle is defined on stored boundary-ratio movement, not index crossing", () => {
  const method = readFileSync(new URL("../docs/M1_ISOMORPHIC_HUMAN_AGENT_METHOD_ZH.md", import.meta.url), "utf8");
  const report = readFileSync(new URL("../docs/EXPERIMENT_BRIEF_REPORT_EN.md", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/methodology/m1/page.tsx", import.meta.url), "utf8");

  assert.match(method, /B = round\(10\^6 × b\)/);
  assert.match(method, /Z_b = I\(\|Δb\|>0\)/);
  assert.match(method, /I\(\|Δindex\|>=1\).*独立的次要/);
  assert.doesNotMatch(method, /第一部分对 `I\(\|Δindex\|>=1\)`/);
  assert.match(report, /any nonzero stored-ratio movement/);
  assert.match(report, /grid-crossing outcome `I\(\|delta index\| >= 1\)`/);
  assert.match(page, /Z_b=I\(\|ΔB\|≥1\)/);
  assert.match(page, /I\(\|Δb\|&gt;0\)/);
});
