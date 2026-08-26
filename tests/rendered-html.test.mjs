import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";

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

async function appMiniflare() {
  const root = path.resolve("dist");
  async function walk(directory = "") {
    const files = [];
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walk(relative));
      else if (/\.m?js$/.test(entry.name)) files.push(relative.replaceAll("\\", "/"));
    }
    return files;
  }

  const files = await walk();
  const ordered = ["server/index.js", ...files.filter((file) => file !== "server/index.js")];
  const modules = await Promise.all(ordered.map(async (modulePath) => ({
    type: "ESModule",
    path: modulePath,
    contents: await readFile(path.join(root, modulePath), "utf8"),
  })));
  return new Miniflare({
    modules,
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: { RESEARCHER_EMAILS: "researcher@example.com" },
  });
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
  assert.match(html, /人类 M1 主实验/);
  assert.match(html, /Agent 全模块实验/);
  assert.match(html, /确认配置，生成参与者说明/);
  assert.doesNotMatch(html, /我已阅读并理解以上说明/);
  assert.doesNotMatch(html, /你对这次划分有多大信心/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton/i);
});

test("server-renders Tim Classroom with six course tracks, Go training, and Xiangqi", async () => {
  const response = await render("/tim-classroom");
  assert.equal(response.status, 200);
  const html = await response.text();
  const classroomCss = await readFile(
    new URL("../app/tim-classroom/tim-classroom.css", import.meta.url),
    "utf8",
  );

  assert.match(html, /<title>Tim小课堂｜六门课程、围棋与象棋AI对弈<\/title>/i);
  assert.match(html, /六门课程，多档挑战/);
  assert.match(html, /运动小课堂/);
  assert.match(html, /图论小课堂/);
  assert.match(html, /凸函数小课堂/);
  assert.match(html, /恋爱小课堂/);
  assert.match(html, /围棋小课堂/);
  assert.match(html, /象棋小课堂/);
  assert.match(html, /12(?:<!-- -->)? 套能力题库 \+ 围棋 10 级 \+ 象棋竞技场/);
  assert.match(html, /840(?:<!-- -->)? 题池/);
  assert.match(html, /og-tim-classroom-v2\.png/);
  assert.match(html, /class="tim-classroom" data-screen="home"/);
  assert.doesNotMatch(html, /五门课程|四门课程|三门课程|540 题池|240 题池|180 题池/);
  assert.match(classroomCss, /url\("\/tim-classroom\/home-background\.png"\)/);
  assert.match(classroomCss, /\.tim-phone\[data-screen="home"\]/);
});

test("server-renders a standalone fixed M1 pilot without the researcher console", async () => {
  const response = await render("/pilot");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<title>Boundary Lab｜M1 初批实验<\/title>/i);
  assert.match(html, /M1 · 初批实验/);
  assert.match(html, /观察曲线/);
  assert.match(html, /六条时间序列/);
  assert.match(html, /六条曲线，分别作答/);
  assert.match(html, /匿名参与者编号/);
  assert.match(html, /进入实验说明/);
  assert.doesNotMatch(html, /RESEARCHER CONSOLE/);
  assert.doesNotMatch(html, /选择实验模块/);
  assert.doesNotMatch(html, /任务定义实验/);
  assert.doesNotMatch(html, /跨指标一致性/);
  assert.doesNotMatch(html, /稳健性与对照/);
});

test("server-renders the standalone human M1 main experiment", async () => {
  const response = await render("/m1");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<title>Boundary Lab｜人类 M1 主实验<\/title>/i);
  assert.match(html, /M1 · 主实验/);
  assert.match(html, /M1 MAIN STUDY · PARTICIPANT ENTRY/);
  assert.match(html, /观察曲线/);
  assert.match(html, /六条时间序列/);
  assert.match(html, /六条曲线，分别作答/);
  assert.match(html, /匿名参与者编号/);
  assert.doesNotMatch(html, /初批实验/);
  assert.doesNotMatch(html, /RESEARCHER CONSOLE/);
  assert.doesNotMatch(html, /选择实验模块|任务定义实验|跨指标一致性|稳健性与对照/);
});

test("server-renders the consolidated agent console as the primary agent entry", async () => {
  const response = await render("/agent");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Boundary Lab｜Agent 全模块实验<\/title>/i);
  assert.match(html, /Agent 全模块实验/);
  assert.match(html, /FULL_MODULAR_PROTOCOL/);
  assert.match(html, /汇总原研究控制台的 M1—M4 条件/);
  assert.match(html, /EXPERIMENT_CONFIG/);
  assert.match(html, /信息披露主实验/);
  assert.match(html, /任务定义实验/);
  assert.match(html, /跨指标一致性/);
  assert.match(html, /稳健性与对照/);
  assert.match(html, /disclosure_path/);
  assert.match(html, /window_mode/);
  assert.match(html, /model_or_agent_name/);
  assert.doesNotMatch(html, /选择 Agent 实验入口/);
  assert.doesNotMatch(html, /\/agent\/pilot/);

  const legacy = await render("/agent/legacy");
  assert.equal(legacy.status, 200);
  const legacyHtml = await legacy.text();
  assert.match(legacyHtml, /保留的 Agent 双入口/);
  assert.match(legacyHtml, /\/agent\/pilot/);
  assert.match(legacyHtml, /\/agent\/console/);

  const pilot = await render("/agent/pilot");
  assert.equal(pilot.status, 200);
  const pilotHtml = await pilot.text();
  assert.match(pilotHtml, /<title>Boundary Lab｜M1 Agent 初批实验<\/title>/i);
  assert.match(pilotHtml, /LOCKED_PROTOCOL/);
  assert.match(pilotHtml, /T2 \/ 2 boundaries \/ 3 stages/);
  assert.match(pilotHtml, /BTC, ETH, SOL, BNB, XRP, DOGE \/ randomized/);
  assert.match(pilotHtml, /disclosure-major \/ six series per layer/);
  assert.match(pilotHtml, /expected responses/);
  assert.match(pilotHtml, />42</);
  assert.match(pilotHtml, /model_or_agent_name/);
  assert.match(pilotHtml, /不得查看源代码、网络请求、完整数据包、未来披露或外部资料/);
  assert.doesNotMatch(pilotHtml, /RESEARCHER CONSOLE/);
  assert.doesNotMatch(pilotHtml, /本轮作答轨迹|你对这次划分有多大信心/);

  const consoleResponse = await render("/agent/console");
  assert.equal(consoleResponse.status, 200);
  const consoleHtml = await consoleResponse.text();
  assert.match(consoleHtml, /<title>Boundary Lab｜保留的 Agent 模块控制台<\/title>/i);
  assert.match(consoleHtml, /EXPERIMENT_CONFIG/);
});

test("server-renders the researcher CSV export hub", async () => {
  const response = await render("/research/results");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /实验结果导出/);
  assert.match(html, /下载参与者\/设备表 CSV/);
  assert.match(html, /下载人类 M1 逐题答题表 CSV/);
  assert.match(html, /下载 Agent 全模块答题表 CSV/);
  assert.match(html, /下载全部 Agent 答题表 CSV/);
  assert.match(html, /下载全部逐题答题表 CSV/);
  assert.match(html, /研究者白名单|服务器端研究者白名单/);
  assert.match(html, /scope=human-m1/);
  assert.match(html, /scope=agent-console/);
  assert.match(html, /scope=agent/);
  assert.match(html, /scope=all/);
  assert.match(html, /table=sessions/);
});

test("completes human M1 main and Agent console lifecycles with isolated CSV exports", async () => {
  const mf = await appMiniflare();
  try {
    const api = (pathname, init = {}) => mf.dispatchFetch(`http://localhost${pathname}`, init);

    const disclosureKeys = ["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4"];
    const plan = ["bitcoin", "ethereum", "solana", "bnb", "xrp", "dogecoin"].map((assetId, order) => ({
      id: `human-m1-${assetId}`,
      order,
      disclosures: disclosureKeys,
    }));
    const incompleteSessionResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        participantCode: "SYSTEM-INCOMPLETE",
        expertise: "none",
        experimentalArm: "test-incomplete",
        protocolVersion: "boundary-lab-modular-v4",
        studyConfig: { randomizedPlan: [{ disclosures: ["G0"] }] },
      }),
    });
    assert.equal(incompleteSessionResponse.status, 201);
    const { session: incompleteSession } = await incompleteSessionResponse.json();
    const prematureCompletion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: incompleteSession.id }),
    });
    assert.equal(prematureCompletion.status, 409);
    assert.deepEqual(await prematureCompletion.json(), {
      error: "Session responses are incomplete",
      responseCount: 0,
      expectedResponseCount: 1,
    });

    const sessionResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        participantCode: "SYSTEM-E2E",
        expertise: "none",
        experimentalArm: "m1-main",
        protocolVersion: "m1-human-main-v4.6-blank-baseline",
        deviceInfo: {
          deviceType: "desktop",
          userAgent: "BoundaryLabTest/1.0",
          platform: "Windows",
          browserLanguage: "zh-CN",
          timezone: "Asia/Shanghai",
          screenWidth: 1920,
          screenHeight: 1080,
          viewportWidth: 1440,
          viewportHeight: 900,
          devicePixelRatio: 1.25,
          touchPoints: 0,
          pointerType: "fine",
          orientation: "landscape-primary",
        },
        studyConfig: { entryMode: "m1", mainStudyProtocol: "m1-human-main-v4.6-blank-baseline", baselinePlacementProtocol: "blank-two-click-placement-v1", disclosureFlowOrder: "disclosure-major", layerPresentation: "sequential-single-asset-pages-v1", participantQuestionSet: "boundaries-uncertainty-influence-v1", randomizedPlan: plan },
      }),
    });
    assert.equal(sessionResponse.status, 201);
    const { session } = await sessionResponse.json();
    assert.ok(session.id);

    const boundaries = [
      { index: 10, ratio: 0.3, date: "2021-01-01" },
      { index: 20, ratio: 0.7, date: "2023-01-01" },
    ];
    const boundaryIntervals = [
      { boundaryIndex: 0, centerRatio: 0.3, halfWidthRatio: 0, widthRatio: 0, lowerRatio: 0.3, upperRatio: 0.3, lowerIndex: 10, upperIndex: 10, lowerDate: "2021-01-01", upperDate: "2021-01-01" },
      { boundaryIndex: 1, centerRatio: 0.7, halfWidthRatio: 0.037, widthRatio: 0.074, lowerRatio: 0.663, upperRatio: 0.737, lowerIndex: 18, upperIndex: 22, lowerDate: "2022-10-01", upperDate: "2023-04-01" },
    ];
    const cueByDisclosure = {
      G0: "g0_trend_slope",
      GI1: "gi1_metric_meaning",
      GI2: "gi2_calendar_location",
      DI1: "di1_asset_category",
      DI2: "di2_launch_maturity",
      DI3: "di3_event_proximity",
      DI4: "di4_boundary_refinement",
    };

    let lastHumanResponsePayload;
    for (let disclosureIndex = 0; disclosureIndex < disclosureKeys.length; disclosureIndex += 1) {
      const disclosureKey = disclosureKeys[disclosureIndex];
      for (const trial of plan) {
        const responsePayload = {
          sessionId: session.id,
          trialId: trial.id,
          trialOrder: trial.order,
          responseVersion: "v4.6-blank-baseline",
          moduleKey: "disclosure",
          taskType: "T2",
          stimulusType: "crypto",
          assetId: trial.id.replace("human-m1-", ""),
          metricType: "price",
          resolution: "weekly",
          scaleMode: "linear",
          windowMode: "whole",
          disclosureIndex,
          disclosureKey,
          disclosureState: { key: disclosureKey },
          stimulusWindow: { mode: "whole" },
          cueSchemaVersion: "none",
          boundaries,
          previousBoundaries: disclosureIndex === 0 ? [] : boundaries,
          boundaryIntervals,
          singleStageConfirmed: false,
          influenceRating: disclosureIndex === 0 ? null : 3,
          influenceTouched: disclosureIndex > 0,
          noChangeConfirmed: disclosureIndex > 0,
          cueTags: [],
          rationale: "",
          elapsedMs: 1200,
          revealReadMs: 300,
          firstMoveMs: 400,
          firstUncertaintyMs: 500,
          adjustmentCount: 2,
          uncertaintyAdjustmentCount: 2,
          clientStartedAt: "2026-08-25T08:00:00.000Z",
          clientSubmittedAt: "2026-08-25T08:00:01.200Z",
          responseViewportWidth: 1440,
          responseViewportHeight: 900,
          responseOrientation: "landscape-primary",
          pageHiddenMs: 100,
          activeElapsedMs: 1100,
        };
        lastHumanResponsePayload = responsePayload;
        if (disclosureIndex === 0 && trial.order === 0) {
          const legacyZeroWidth = await api("/api/modular-responses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...responsePayload, responseVersion: "v4.4-disclosure-safe" }),
          });
          assert.equal(legacyZeroWidth.status, 400, await legacyZeroWidth.text());

          const mismatchedVersion = await api("/api/modular-responses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...responsePayload, responseVersion: "v4.5-zero-width-enabled" }),
          });
          assert.equal(mismatchedVersion.status, 409, await mismatchedVersion.text());
        }
        const response = await api("/api/modular-responses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(responsePayload),
        });
        assert.equal(response.status, 201, await response.text());
        if (disclosureIndex === 0 && trial.order === 0) {
          const retry = await api("/api/modular-responses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...responsePayload, elapsedMs: 1700, clientSubmittedAt: "2026-08-25T08:00:01.700Z", activeElapsedMs: 1600 }),
          });
          const retryPayload = await retry.json();
          assert.equal(retry.status, 200, JSON.stringify(retryPayload));
          assert.equal(retryPayload.idempotent, true);

          const conflictingRetry = await api("/api/modular-responses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...responsePayload, rationale: "changed after finalized" }),
          });
          assert.equal(conflictingRetry.status, 409, await conflictingRetry.text());
        }
      }
    }

    const completion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    });
    assert.equal(completion.status, 200);
    assert.deepEqual(await completion.json(), {
      ok: true,
      responseCount: 42,
      expectedResponseCount: 42,
    });

    const postCompletionWrite = await api("/api/modular-responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...lastHumanResponsePayload, trialId: "post-completion-extra" }),
    });
    assert.equal(postCompletionWrite.status, 409, await postCompletionWrite.text());

    const forbiddenExport = await api("/api/research-export?scope=human-m1", {
      headers: { "oai-authenticated-user-email": "participant@example.com" },
    });
    assert.equal(forbiddenExport.status, 403);

    const exportResponse = await api("/api/research-export?scope=human-m1", {
      headers: { "oai-authenticated-user-email": "researcher@example.com" },
    });
    assert.equal(exportResponse.status, 200, await exportResponse.clone().text());
    assert.match(exportResponse.headers.get("content-type") ?? "", /^text\/csv/i);
    assert.match(exportResponse.headers.get("content-disposition") ?? "", /boundary-lab-human-m1/);
    const csvBytes = new Uint8Array(await exportResponse.arrayBuffer());
    assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(csvBytes);
    assert.match(csv, /session_id,session_status/);
    assert.match(csv, /boundary_1_date,boundary_1_ratio,boundary_2_date,boundary_2_ratio/);
    assert.match(csv, /device_type,screen_width,screen_height,initial_viewport_width/);
    assert.match(csv, /client_started_at,client_submitted_at,response_viewport_width,response_viewport_height,response_orientation,page_hidden_ms,active_elapsed_ms/);
    assert.doesNotMatch(csv, /包含,逗号与/);
    assert.match(csv, /m1-main/);
    assert.match(csv, /BoundaryLabTest\/1\.0/);
    assert.match(csv, /v4\.6-blank-baseline/);
    assert.doesNotMatch(csv, /AGENT-E2E-001/);
    assert.equal(csv.split("\r\n").length, 43);

    const sessionExportResponse = await api("/api/research-export?scope=human-m1&table=sessions", {
      headers: { "oai-authenticated-user-email": "researcher@example.com" },
    });
    assert.equal(sessionExportResponse.status, 200, await sessionExportResponse.clone().text());
    assert.match(sessionExportResponse.headers.get("content-disposition") ?? "", /boundary-lab-human-m1-sessions/);
    const sessionCsv = await sessionExportResponse.text();
    assert.equal(sessionCsv.split("\r\n").length, 2);
    assert.match(sessionCsv, /session_id,session_status/);
    assert.match(sessionCsv, /desktop/);
    assert.match(sessionCsv, /1920,1080,1440,900/);
    assert.match(sessionCsv, /SYSTEM-E2E/);

    const agentPlan = ["bitcoin", "ethereum", "solana", "bnb", "xrp", "dogecoin"].map((assetId, order) => ({
      id: `agent-console-${assetId}`,
      order,
      disclosures: disclosureKeys,
    }));
    const agentSessionResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "agent",
        participantCode: "AGENT-E2E-001",
        expertise: "none",
        modelName: "AgentModel-Test-1",
        experimentalArm: "agent-disclosure",
        protocolVersion: "boundary-lab-modular-v4.1",
        studyConfig: {
          entryMode: "agent-console",
          agentInterfaceVersion: "agent-native-json-v2-layer-major-six-assets",
          disclosureFlowOrder: "disclosure-major",
          agentMetadata: { provider: "test", temperature: "0", promptVersion: "agent-protocol-v1" },
          randomizedPlan: agentPlan,
        },
      }),
    });
    assert.equal(agentSessionResponse.status, 201, await agentSessionResponse.clone().text());
    const { session: agentSession } = await agentSessionResponse.json();
    assert.ok(agentSession.id);

    for (let disclosureIndex = 0; disclosureIndex < disclosureKeys.length; disclosureIndex += 1) {
      const disclosureKey = disclosureKeys[disclosureIndex];
      for (const trial of agentPlan) {
        const response = await api("/api/modular-responses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: agentSession.id,
            trialId: trial.id,
            trialOrder: trial.order,
            responseVersion: "agent-v2",
            moduleKey: "disclosure",
            taskType: "T2",
            stimulusType: "crypto",
            assetId: trial.id.replace("agent-console-", ""),
            metricType: "price",
            resolution: "weekly",
            scaleMode: "linear",
            windowMode: "whole",
            disclosureIndex,
            disclosureKey,
            disclosureState: { key: disclosureKey, agentInterfaceVersion: "agent-native-json-v2-layer-major-six-assets" },
            stimulusWindow: { mode: "whole" },
            cueSchemaVersion: "disclosure-specific-cues-v2",
            boundaries,
            previousBoundaries: disclosureIndex === 0 ? [] : boundaries,
            boundaryIntervals,
            singleStageConfirmed: false,
            influenceRating: disclosureIndex === 0 ? null : 3,
            influenceTouched: disclosureIndex > 0,
            noChangeConfirmed: disclosureIndex > 0,
            cueTags: [cueByDisclosure[disclosureKey]],
            rationale: disclosureIndex === 6 ? "agent final rationale" : "",
            elapsedMs: 900,
            revealReadMs: 900,
            firstMoveMs: null,
            firstUncertaintyMs: null,
            adjustmentCount: 0,
            uncertaintyAdjustmentCount: 0,
          }),
        });
        assert.equal(response.status, 201, await response.text());
      }
    }

    const agentCompletion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: agentSession.id }),
    });
    assert.equal(agentCompletion.status, 200);
    assert.deepEqual(await agentCompletion.json(), {
      ok: true,
      responseCount: 42,
      expectedResponseCount: 42,
    });

    const agentExportResponse = await api("/api/research-export?scope=agent-console", {
      headers: { "oai-authenticated-user-email": "researcher@example.com" },
    });
    assert.equal(agentExportResponse.status, 200, await agentExportResponse.clone().text());
    assert.match(agentExportResponse.headers.get("content-disposition") ?? "", /boundary-lab-agent-console/);
    const agentCsv = await agentExportResponse.text();
    assert.equal(agentCsv.split("\r\n").length, 43);
    assert.match(agentCsv, /agent-v2/);
    assert.match(agentCsv, /agent-disclosure/);
    assert.match(agentCsv, /AgentModel-Test-1/);
    assert.doesNotMatch(agentCsv, /SYSTEM-E2E/);

    const combinedExportResponse = await api("/api/research-export?scope=all", {
      headers: { "oai-authenticated-user-email": "researcher@example.com" },
    });
    assert.equal(combinedExportResponse.status, 200, await combinedExportResponse.clone().text());
    assert.match(combinedExportResponse.headers.get("content-disposition") ?? "", /boundary-lab-all/);
    const combinedCsv = await combinedExportResponse.text();
    assert.equal(combinedCsv.split("\r\n").length, 85);
    assert.match(combinedCsv, /SYSTEM-E2E/);
    assert.match(combinedCsv, /AGENT-E2E-001/);
    assert.match(combinedCsv, /m1-main/);
    assert.match(combinedCsv, /agent-disclosure/);
  } finally {
    await mf.dispose();
  }
});

test("rejects unauthenticated aggregate CSV access before touching the database", async () => {
  const mf = await appMiniflare();
  try {
    const response = await mf.dispatchFetch("http://localhost/api/research-export?scope=all");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Researcher sign-in is required" });
  } finally {
    await mf.dispose();
  }
});

test("implements a configuration-aware participant briefing without future disclosure leakage", async () => {
  const source = await readFile(
    new URL("../app/ExperimentModular.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /phase === "briefing"/);
  assert.match(source, /PARTICIPANT BRIEFING · 正式实验尚未开始/);
  assert.match(source, /本页不会说明后续尚未呈现的信息类别或具体内容/);
  assert.doesNotMatch(source, /本页不会说明资产名称、指标类型、真实日期、数值单位、图表尺度、时间窗口或事件/);
  assert.match(source, /我已了解，开始正式实验/);
  assert.match(source, /DISCLOSURE_PATHS\[disclosurePath\]\.length - 1/);
  assert.match(source, /participantBriefingVersion: isV4 \? "participant-briefing-v2-device-telemetry"/);
  assert.match(source, /experimentalArm: isM1Main \? "m1-main"/);
  assert.match(source, /mainStudyProtocol: isM1Main \? "m1-human-main-v4\.6-blank-baseline"/);
  assert.match(source, /sessionProtocolVersion = isM1Main[\s\S]*?"m1-human-main-v4\.6-blank-baseline"/);
  assert.match(source, /protocolVersion: isFixedM1 \? sessionProtocolVersion : bundle\.protocolVersion/);
  assert.match(source, /baselinePlacementProtocol = isFixedM1 \? "blank-two-click-placement-v1"/);
  assert.match(source, /initialPlacementCount: disclosureIndex === 0 \? Math\.min\(adjustmentCount, 2\) : 0/);
  assert.match(source, /revisionAdjustmentCount: disclosureIndex === 0 \? Math\.max\(0, adjustmentCount - 2\) : adjustmentCount/);
  assert.match(source, /session_protocol_version/);
  assert.match(source, /stimulus_protocol_version/);
  assert.match(source, /baseline_placement_protocol/);
  assert.match(source, /stimulusProtocolVersion: bundle\.protocolVersion/);
  assert.match(source, /disclosureFlowOrder: usesLayerMajorDisclosureFlow \? "disclosure-major"/);
  assert.match(source, /usesFixedM1SequentialPages[\s\S]*?"sequential-single-asset-pages-v1"/);
  assert.match(source, /participantQuestionSet: isFixedM1 \? "boundaries-uncertainty-influence-v1"/);
  assert.match(source, /uncertaintyControl: isFixedM1 \? "continuous-range-knob-zero-enabled-v2"/);
  assert.match(source, /NEW INFORMATION · 新信息已解锁/);
  assert.match(source, /phase === "experiment" && usesLayerMajorDisclosureFlow && !usesFixedM1SequentialPages/);
  assert.match(source, /!isFixedM1 && \(\(!isV4 \|\| responseShapeReady\)/);
  assert.match(source, /cueSchemaVersion: isFixedM1 \? "none"/);
  assert.match(source, /deviceTelemetryProtocol: isFixedM1 \? "session-device-environment-v1"/);
  assert.match(source, /responseTelemetryProtocol: isFixedM1 \? "per-page-visible-time-v1"/);
  assert.match(source, /activeResponseVersion = isFixedM1 \? "v4\.6-blank-baseline"/);
  assert.match(source, /validityRepairVersion: isFixedM1 \? "early-disclosure-and-feedback-bias-v1"/);
  assert.match(source, /pageHiddenMs/);
  assert.match(source, /activeElapsedMs/);
});

test("keeps the restored human M1 disclosure sequence free of early semantic leakage", async () => {
  const source = await readFile(
    new URL("../app/ExperimentModular.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /margin: Object\.freeze\(\{ top: 72, right: 28, bottom: 72, left: 88 \}\)/);
  assert.match(source, /metricDescriptionForDisclosure\(currentTrial\.metric, visibility\.axes, currentMetric\.definition, isFixedM1\)/);
  assert.match(source, /M1_AXIS_DISCLOSURE_COPY/);
  assert.match(source, /纵轴单位为美元（USD）/);
  assert.match(source, /showDates=\{visibility\.axes\}/);
  assert.match(source, /showDates=\{context\.visibility\.axes\}/);
  assert.match(source, /visibility\.axes \? `\$\{points\.length\.toLocaleString\("zh-CN"\)\} 个\$\{RESOLUTION_LABEL\[resolution\]\}观测值` : "当前仅显示曲线形状"/);
  assert.match(source, /DI3: \{ title: "事件信息（一）"/);
  assert.match(source, /DI4: \{ title: "事件信息（二）"/);
  assert.match(source, /RESPONSES SAVED · 中性休息页/);
  assert.match(source, /这里不显示答案分析、边界移动或表现反馈/);
  assert.match(source, /export const UNCERTAINTY_MIN = 0;/);
  assert.match(source, /总宽度 0%/);
  assert.match(source, /0% · 仅点估计/);
  assert.match(source, /0% 只表示提交当前点，不等同于绝对确定/);
  assert.match(source, /initialBoundaries\(task: TaskType, startBlank = false\)/);
  assert.match(source, /initialBoundaries\("T2", isFixedM1\)/);
  assert.match(source, /initialBoundaries\(nextTask, isFixedM1\)/);
  assert.match(source, /taskType !== "T1" && boundaries\.length < 2/);
  assert.match(source, /当前没有预设位置/);
  assert.match(source, /请直接点击左侧主图的两个位置；完成后系统会按从左到右编号/);
  assert.match(source, /先放置第二个分界点，再分别设置两个不确定范围/);
  assert.match(source, /taskType !== "T1" && boundaries\.length < 2[\s\S]*?\? \[0, 1\]/);
  assert.match(source, /两个分界点不能落在同一个观测位置/);
  assert.doesNotMatch(source, /Math\.abs\(boundaries\[0\] - placementRatio\) < 0\.02/);
  assert.match(source, /if \(!isWithinPlot\(event\.clientX, event\.clientY\)\) return/);
  assert.match(source, /请在绘图区内点击，放置第一个分界点/);
  assert.match(source, /请在绘图区内点击另一个位置，完成两个分界点/);
  assert.match(source, /scaleMode === "linear" && minimum >= 0[\s\S]*?Math\.max\(0, minimum - range \* 0\.05\)/);
  assert.match(source, /key=\{`boundary-label-\$\{index\}`\} pointerEvents="none"/);
  assert.doesNotMatch(source, /<span className=\{eventSourcePriority\(event\) <= 2 \? "is-high" : ""\}>P\{eventSourcePriority\(event\)\}<\/span>/);
});

test("keeps the agent boundary judgment separate from post-judgment annotations", async () => {
  const source = await readFile(
    new URL("../app/AgentExperiment.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /responseStage === "annotation"\s*\? activeCueSet\.options/);
  assert.match(source, /allowed_cue_tags:[\s\S]*?: null/);
  assert.match(source, /VALIDATE BOUNDARIES \+ REVEAL ANNOTATION/);
  assert.match(source, /先提交边界与不确定范围；通过校验后才会显示线索代码与影响评分/);
  assert.match(source, /actorType: "agent"/);
  assert.match(source, /responseVersion: "agent-v2"/);
  assert.match(source, /agentInterfaceVersion: "agent-native-json-v2-layer-major-six-assets"/);
  assert.match(source, /allowed_uncertainty_half_width_range/);
  assert.match(source, /SUBMIT \+ NEXT SERIES \/ SAME LAYER/);
  assert.match(source, /information_snapshot/);
  assert.match(source, /robustness_factor/);
  assert.match(source, /不得查看源代码、网络请求、完整数据包、未来披露或外部资料/);
  assert.match(source, /firstMoveMs: null/);
  assert.match(source, /adjustmentCount: 0/);
  assert.doesNotMatch(source, /你对这次划分有多大信心/);
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

test("ships the fourth-edition six-asset, priority-event, and window protocol", async () => {
  const raw = await readFile(
    new URL("../public/data/research-stimuli-modular-v8.json", import.meta.url),
    "utf8",
  );
  const stimulus = JSON.parse(raw);

  assert.equal(stimulus.protocolVersion, "boundary-lab-modular-v4.1");
  assert.equal(stimulus.datasetVersion, "research-stimuli-modular-v8");
  assert.deepEqual(
    stimulus.assets.map((asset) => asset.id),
    ["bitcoin", "ethereum", "solana", "bnb", "xrp", "dogecoin"],
  );
  assert.deepEqual(
    { start: stimulus.curatedWindow.start, end: stimulus.curatedWindow.end },
    { start: "2020-01-01", end: "2024-12-31" },
  );
  assert.match(stimulus.curatedWindow.rule, /without interpolation/);
  assert.deepEqual(
    stimulus.assets.map((asset) => asset.metrics.price.resolutions.daily.points[0].date),
    ["2010-10-21", "2015-11-16", "2020-07-19", "2017-11-02", "2013-11-13", "2014-03-26"],
  );
  for (const asset of stimulus.assets) {
    const source = asset.metrics.price.source;
    assert.equal(source.availableWindow.start, asset.metrics.price.resolutions.daily.points[0].date);
    assert.equal(source.observationCount, asset.metrics.price.resolutions.daily.points.length);
    assert.ok(asset.events.length > 0);
    assert.ok(asset.events.every((event) => Number.isInteger(event.sourcePriority)));
    assert.ok(asset.events.every((event) => event.sourceId));
  }
  assert.equal(stimulus.dataset.eventSource.file, "events_20260527.zip");
  assert.equal(stimulus.dataset.eventSource.sha256, "cc9d1f5d06fa2aeb447c57abeb1c42c560195967d33e7a4f90629333c3bc9438");
  assert.deepEqual(stimulus.modularProtocol.eventDisclosureProtocol.DI3.sourcePriorities, [1, 2]);
  assert.deepEqual(stimulus.modularProtocol.eventDisclosureProtocol.DI4.sourcePriorities, [3, 4, 5]);
  assert.equal(stimulus.modularProtocol.eventDisclosureProtocol.DI3.maximumNewEvents, 10);
  assert.equal(stimulus.modularProtocol.eventDisclosureProtocol.DI4.maximumNewEvents, 10);
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
