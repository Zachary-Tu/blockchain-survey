import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";

const TEST_AGENT_MODEL_NAME = "AgentModel-Test-1";
const TEST_AGENT_METADATA = {
  provider: "OpenAI",
  modelSnapshot: "gpt-test-2026-08-26",
  apiVersion: "2026-08-01",
  controllerVersion: "browser-controller-test-v1",
  controllerArtifactSha256: "7".repeat(64),
  runtimePromptPackageSha256: "8".repeat(64),
  contextPolicy: "persistent",
  inputModality: "screenshot",
  imageDetail: "high",
  temperature: 0,
  topP: 1,
  seed: 42,
  reasoningEffort: "high",
  promptSha256: "9bb751053f6adab759323983c9358089fdf0906ef9217ef7627cd94586974647",
  browserEngine: "Chrome",
  browserMajor: 140,
  replicateId: "R-PRIMARY",
};
const TEST_AGENT_PROFILE = {
  schemaVersion: "m1-agent-profile-v1",
  provider: TEST_AGENT_METADATA.provider,
  modelName: TEST_AGENT_MODEL_NAME,
  modelSnapshot: TEST_AGENT_METADATA.modelSnapshot,
  apiVersion: TEST_AGENT_METADATA.apiVersion,
  controllerVersion: TEST_AGENT_METADATA.controllerVersion,
  controllerArtifactSha256: TEST_AGENT_METADATA.controllerArtifactSha256,
  runtimePromptPackageSha256: TEST_AGENT_METADATA.runtimePromptPackageSha256,
  repositorySystemPromptSha256: TEST_AGENT_METADATA.promptSha256,
  contextPolicy: TEST_AGENT_METADATA.contextPolicy,
  inputModality: "screenshot",
  imageDetail: TEST_AGENT_METADATA.imageDetail,
  temperature: TEST_AGENT_METADATA.temperature,
  topP: TEST_AGENT_METADATA.topP,
  seed: TEST_AGENT_METADATA.seed,
  reasoningEffort: TEST_AGENT_METADATA.reasoningEffort,
  browserEngine: TEST_AGENT_METADATA.browserEngine,
  browserMajor: TEST_AGENT_METADATA.browserMajor,
  viewportWidth: 1440,
  viewportHeight: 900,
  devicePixelRatio: 1,
};
const TEST_AGENT_PROFILE_SHA256 = createHash("sha256").update(JSON.stringify(TEST_AGENT_PROFILE)).digest("hex");
const TEST_DEPLOYMENT_ID = "m1-test-deployment-2026-08-26";
const TEST_DEPLOYMENT_FINGERPRINT_SHA256 = "e".repeat(64);

async function render(pathname = "/", extraHeaders = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html", ...extraHeaders },
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

async function appMiniflare(bindingOverrides = {}) {
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
    bindings: {
      RESEARCHER_EMAILS: "researcher@example.com",
      M1_AGENT_PROFILE_SHA256: TEST_AGENT_PROFILE_SHA256,
      M1_PRIMARY_CHROME_MAJOR: "140",
      M1_STAGE_A_PRIMARY_COLLECTION_ENABLED: "true",
      M1_HUMAN_COLLECTION_ENABLED: "true",
      M1_DEVELOPMENT_PILOT_ENABLED: "",
      M1_DEPLOYMENT_ID: TEST_DEPLOYMENT_ID,
      M1_DEPLOYMENT_FINGERPRINT_SHA256: TEST_DEPLOYMENT_FINGERPRINT_SHA256,
      ...bindingOverrides,
    },
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
  assert.match(html, /Agent M1 同构实验/);
  assert.match(html, /M1 配对启动器/);
  assert.match(html, /M1 冻结方法/);
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
  assert.match(html, /研究编码/);
  assert.match(html, /研究机构批准的知情同意流程/);
  assert.match(html, /原始 User-Agent 不写入 M1 研究表/);
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

  assert.match(html, /<title>Boundary Lab｜M1 阶段判断实验<\/title>/i);
  assert.match(html, /M1 · 主实验/);
  assert.match(html, /M1 MAIN STUDY · PARTICIPANT ENTRY/);
  assert.match(html, /观察曲线/);
  assert.match(html, /六条时间序列/);
  assert.match(html, /六条曲线，分别作答/);
  assert.match(html, /研究编码/);
  assert.match(html, /研究机构批准的知情同意流程/);
  assert.match(html, /原始 User-Agent 不写入 M1 研究表/);
  assert.doesNotMatch(html, /初批实验/);
  assert.doesNotMatch(html, /RESEARCHER CONSOLE/);
  assert.doesNotMatch(html, /选择实验模块|任务定义实验|跨指标一致性|稳健性与对照/);
});

test("server-renders the isomorphic Agent M1 task as the primary agent entry", async () => {
  const response = await render("/agent");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Boundary Lab｜M1 阶段判断实验<\/title>/i);
  assert.match(html, /M1 · Agent 同构实验/);
  assert.match(html, /M1 MATCHED STUDY · AGENT RUN ENTRY/);
  assert.match(html, /登记可复现运行信息/);
  assert.match(html, /模型显示名称/);
  assert.match(html, /模型快照/);
  assert.match(html, /控制器版本/);
  assert.match(html, /截图/);
  assert.doesNotMatch(html, /FULL_MODULAR_PROTOCOL|EXPERIMENT_CONFIG|LOCKED_PROTOCOL|BOUNDARY_JSON/);
  assert.doesNotMatch(html, /BTC, ETH, SOL|price \/ weekly \/ linear \/ whole/);

  const legacy = await render("/agent/legacy");
  assert.equal(legacy.status, 200);
  const legacyHtml = await legacy.text();
  assert.match(legacyHtml, /保留的 Agent 双入口/);
  assert.match(legacyHtml, /\/agent\/pilot/);
  assert.match(legacyHtml, /\/agent\/console/);

  const pilot = await render("/agent/pilot");
  assert.equal(pilot.status, 200);
  const pilotHtml = await pilot.text();
  assert.match(pilotHtml, /<title>Boundary Lab｜Agent M1 同构主实验<\/title>/i);
  assert.match(pilotHtml, /M1 · Agent 同构实验/);
  assert.match(pilotHtml, /登记可复现运行信息/);
  assert.doesNotMatch(pilotHtml, /LOCKED_PROTOCOL|BOUNDARY_JSON|RESEARCHER CONSOLE/);

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
  assert.match(html, /Human–Agent 同构主比较/);
  assert.match(html, /下载配对会话表 CSV/);
  assert.match(html, /下载分配与启动令牌账本 CSV/);
  assert.match(html, /下载 Agent attempts CSV/);
  assert.match(html, /下载参与者\/设备表 CSV/);
  assert.match(html, /下载人类 M1 逐题答题表 CSV/);
  assert.match(html, /下载 Agent 全模块答题表 CSV/);
  assert.match(html, /下载全部 Agent 答题表 CSV/);
  assert.match(html, /下载全部逐题答题表 CSV/);
  assert.match(html, /研究者白名单|服务器端研究者白名单/);
  assert.match(html, /scope=human-m1/);
  assert.match(html, /scope=m1-comparison/);
  assert.match(html, /scope=agent-console/);
  assert.match(html, /scope=agent/);
  assert.match(html, /scope=all/);
  assert.match(html, /table=sessions/);
});

test("server-renders the paired launcher and frozen M1 methods architecture", async () => {
  const unauthenticatedLauncher = await render("/research/m1-launch");
  assert.equal(unauthenticatedLauncher.status, 307);
  assert.match(unauthenticatedLauncher.headers.get("location") ?? "", /\/signin-with-chatgpt/);
  const launcher = await render("/research/m1-launch", {
    "oai-authenticated-user-id": "researcher-test-user",
    "oai-authenticated-user-email": "researcher@example.com",
  });
  assert.equal(launcher.status, 200);
  const launcherHtml = await launcher.text();
  assert.match(launcherHtml, /为同一实验计划/);
  assert.match(launcherHtml, /Williams schedule/);
  assert.match(launcherHtml, /Staged disclosure/);
  assert.match(launcherHtml, /No-new-information retest/);
  assert.match(launcherHtml, /生成两条不透明启动链接/);
  assert.match(launcherHtml, /HUMAN SESSION/);
  assert.match(launcherHtml, /AGENT SESSION/);

  const methods = await render("/methodology/m1");
  assert.equal(methods.status, 200);
  const methodsHtml = await methods.text();
  assert.match(methodsHtml, /m1-isomorphic-v1/);
  assert.match(methodsHtml, /2 × 2 核心设计/);
  assert.match(methodsHtml, /无新增信息重复条件/);
  assert.match(methodsHtml, /A 12 pairs；B 尚未启用/);
  assert.match(methodsHtml, /pair 是分配与 cluster 单位/);
  assert.match(methodsHtml, /1 Human \+ 1 R-PRIMARY/);
  assert.match(methodsHtml, /complete matched pairs/);
  assert.match(methodsHtml, /先减去复测漂移，再比较 Human 与 Agent/);
  assert.match(methodsHtml, /canonical expected steps/);
  assert.match(methodsHtml, /AUDIT STATE MACHINE/);
  assert.match(methodsHtml, /NOT EVALUABLE/);
  assert.match(methodsHtml, /GO PENDING/);
  assert.match(methodsHtml, /事件信息（一）/);
  assert.match(methodsHtml, /英文筛选/);
  assert.match(methodsHtml, /伦理批准|书面豁免/);
  assert.match(methodsHtml, /正式预注册/);
  assert.match(methodsHtml, /可执行外部 controller/);
  assert.match(methodsHtml, /不计入阶段 A 的受监督 feasibility run/);
});

test("fails closed until primary, Human, and development collection gates are explicitly enabled", async () => {
  const disabledPrimary = await appMiniflare({ M1_STAGE_A_PRIMARY_COLLECTION_ENABLED: "" });
  try {
    const response = await disabledPrimary.dispatchFetch("http://localhost/api/m1-launches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "researcher@example.com",
      },
      body: JSON.stringify({
        pairId: "M1-GATE-PRIMARY",
        humanCode: "H-GATE-PRIMARY",
        agentCode: "A-GATE-PRIMARY",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "M1_STAGE_A_PRIMARY_COLLECTION_DISABLED");

    const initializeSchema = await disabledPrimary.dispatchFetch(
      "http://localhost/api/research-export?scope=m1-comparison&table=allocations",
      { headers: { "oai-authenticated-user-email": "researcher@example.com" } },
    );
    assert.equal(initializeSchema.status, 200, await initializeSchema.clone().text());
    const d1 = await disabledPrimary.getD1Database("DB");
    await d1.batch([
      d1.prepare(`INSERT INTO m1_pair_assignments (
          pair_id, protocol_architecture, schedule_id, information_condition,
          stimulus_sha256, event_source_sha256, assignment_version, cohort_id,
          study_phase, preregistration_version, analysis_set_version,
          implementation_build_id, deployment_id, deployment_fingerprint_sha256,
          allocation_mode, agent_profile_sha256, primary_browser_major
        ) VALUES (?, 'm1-isomorphic-v1', 1, 'staged', ?, ?, 'balanced-random-v1',
          'm1-technical-pilot-a2-2026', 'technical-pilot', 'm1-pilot-prereg-v2',
          'm1-pilot-analysis-v2', 'm1-stage-a2-6d1a0f5d304b9fca', ?, ?, 'balanced-random-v1', ?, 140)`)
        .bind(
          "M1-GATE-TERMINAL",
          "a".repeat(64),
          "b".repeat(64),
          TEST_DEPLOYMENT_ID,
          TEST_DEPLOYMENT_FINGERPRINT_SHA256,
          TEST_AGENT_PROFILE_SHA256,
        ),
      d1.prepare(`INSERT INTO m1_launch_tokens (
          token_hash, pair_id, actor_type, participant_code, replicate_id,
          schedule_id, information_condition
        ) VALUES (?, 'M1-GATE-TERMINAL', 'human', 'H-GATE-TERMINAL',
          'human-primary', 1, 'staged')`)
        .bind("f".repeat(64)),
    ]);
    const terminalWhileClosed = await disabledPrimary.dispatchFetch(
      "http://localhost/api/m1-launches",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "oai-authenticated-user-email": "researcher@example.com",
        },
        body: JSON.stringify({
          pairId: "M1-GATE-TERMINAL",
          actorType: "human",
          disposition: "no-show-expired",
        }),
      },
    );
    assert.equal(terminalWhileClosed.status, 503);
    assert.equal((await terminalWhileClosed.json()).code, "M1_STAGE_A_PRIMARY_COLLECTION_DISABLED");
    const unchanged = await d1.prepare(`SELECT terminal_disposition
        FROM m1_launch_tokens WHERE pair_id = 'M1-GATE-TERMINAL'`)
      .first();
    assert.equal(unchanged.terminal_disposition, null);
  } finally {
    await disabledPrimary.dispose();
  }

  const disabledHuman = await appMiniflare({
    M1_HUMAN_COLLECTION_ENABLED: "",
  });
  try {
    const launchResponse = await disabledHuman.dispatchFetch("http://localhost/api/m1-launches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "researcher@example.com",
      },
      body: JSON.stringify({
        pairId: "M1-GATE-HUMAN",
        humanCode: "H-GATE-HUMAN",
        agentCode: "A-GATE-HUMAN",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(launchResponse.status, 503);
    assert.equal((await launchResponse.json()).code, "M1_HUMAN_COLLECTION_DISABLED");
  } finally {
    await disabledHuman.dispose();
  }

  const disabledPilot = await appMiniflare({
    M1_STAGE_A_PRIMARY_COLLECTION_ENABLED: "",
    M1_HUMAN_COLLECTION_ENABLED: "",
    M1_DEVELOPMENT_PILOT_ENABLED: "",
  });
  try {
    const quotaLaunchResponse = await disabledPilot.dispatchFetch("http://localhost/api/m1-launches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "researcher@example.com",
      },
      body: JSON.stringify({
        pairId: "M1-GATE-PILOT-ALLOCATION",
        scheduleId: 1,
        informationCondition: "staged",
        humanCode: "H-GATE-PILOT",
        agentCode: "A-GATE-PILOT",
        agentReplicateId: "R-DIAGNOSTIC",
        allocationMode: "quota-manual",
      }),
    });
    assert.equal(quotaLaunchResponse.status, 503);
    assert.equal((await quotaLaunchResponse.json()).code, "M1_DEVELOPMENT_PILOT_DISABLED");

    const pilotResponse = await disabledPilot.dispatchFetch("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        expertise: "none",
        experimentalArm: "pilot-m1",
        protocolVersion: "boundary-lab-modular-v4.1",
      }),
    });
    assert.equal(pilotResponse.status, 503);
    assert.equal((await pilotResponse.json()).code, "M1_DEVELOPMENT_PILOT_DISABLED");
  } finally {
    await disabledPilot.dispose();
  }
});

test("formal and development collection modes are mutually exclusive", async () => {
  const formalConflict = await appMiniflare({ M1_DEVELOPMENT_PILOT_ENABLED: "true" });
  try {
    const response = await formalConflict.dispatchFetch("http://localhost/api/m1-launches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "researcher@example.com",
      },
      body: JSON.stringify({
        pairId: "M1-GATE-MODE-CONFLICT-FORMAL",
        humanCode: "H-GATE-MODE-CONFLICT",
        agentCode: "A-GATE-MODE-CONFLICT",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "M1_COLLECTION_MODE_CONFLICT");
  } finally {
    await formalConflict.dispose();
  }

  const diagnosticConflict = await appMiniflare({
    M1_STAGE_A_PRIMARY_COLLECTION_ENABLED: "true",
    M1_HUMAN_COLLECTION_ENABLED: "",
    M1_DEVELOPMENT_PILOT_ENABLED: "true",
  });
  try {
    const response = await diagnosticConflict.dispatchFetch("http://localhost/api/m1-launches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "researcher@example.com",
      },
      body: JSON.stringify({
        pairId: "M1-GATE-MODE-CONFLICT-DIAGNOSTIC",
        scheduleId: 1,
        informationCondition: "staged",
        humanCode: "H-GATE-MODE-CONFLICT",
        agentCode: "A-GATE-MODE-CONFLICT",
        agentReplicateId: "R-DIAGNOSTIC",
        allocationMode: "quota-manual",
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "M1_COLLECTION_MODE_CONFLICT");
  } finally {
    await diagnosticConflict.dispose();
  }
});

test("lets quota-manual diagnostics claim, recover, and mutate only through the development gate", async () => {
  const mf = await appMiniflare({
    M1_STAGE_A_PRIMARY_COLLECTION_ENABLED: "",
    M1_HUMAN_COLLECTION_ENABLED: "",
    M1_DEVELOPMENT_PILOT_ENABLED: "true",
    M1_DEPLOYMENT_ID: "",
    M1_DEPLOYMENT_FINGERPRINT_SHA256: "",
  });
  try {
    const api = (pathname, init = {}) => mf.dispatchFetch(`http://localhost${pathname}`, init);
    const launchResponse = await api("/api/m1-launches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "researcher@example.com",
      },
      body: JSON.stringify({
        pairId: "M1-DIAGNOSTIC-GATE-001",
        scheduleId: 3,
        informationCondition: "repeat-control",
        humanCode: "H-DIAGNOSTIC-GATE",
        agentCode: "A-DIAGNOSTIC-GATE",
        agentReplicateId: "R-DIAGNOSTIC-GATE",
        allocationMode: "quota-manual",
      }),
    });
    assert.equal(launchResponse.status, 201, await launchResponse.clone().text());
    const launch = await launchResponse.json();
    assert.equal(launch.deploymentId, "diagnostic-unfrozen");
    const launchToken = new URL(launch.links.human).searchParams.get("launch");
    assert.match(launchToken, /^[a-f0-9]{64}$/);
    const sessionBody = {
      actorType: "human",
      expertise: "none",
      experimentalArm: "m1-main",
      protocolVersion: "boundary-lab-modular-v4.1",
      launchToken,
      studyConfig: {
        humanConsentVersion: "m1-human-consent-v1",
        humanConsentedAt: "2026-08-25T07:55:00.000Z",
        humanLanguageScreeningVersion: "m1-en-financial-reading-v1",
        humanLanguageScreenedAt: "2026-08-25T07:54:00.000Z",
      },
      deviceInfo: {
        deviceType: "desktop",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        platform: "Windows",
        browserLanguage: "zh-CN",
        timezone: "Asia/Shanghai",
        screenWidth: 1920,
        screenHeight: 1080,
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 1,
        touchPoints: 0,
        pointerType: "fine",
        orientation: "landscape-primary",
      },
    };
    const sessionResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sessionBody),
    });
    assert.equal(sessionResponse.status, 201, await sessionResponse.clone().text());
    const created = await sessionResponse.json();
    const recoveryResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sessionBody),
    });
    assert.equal(recoveryResponse.status, 200, await recoveryResponse.clone().text());
    assert.equal((await recoveryResponse.json()).session.id, created.session.id);
    const practice = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: created.session.id, action: "practice-complete" }),
    });
    assert.equal(practice.status, 200, await practice.clone().text());
    const exposure = await api("/api/m1-step-exposures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: created.session.id, stepOrder: 0 }),
    });
    assert.ok([200, 201].includes(exposure.status), await exposure.clone().text());
  } finally {
    await mf.dispose();
  }
});

test("atomically balances M1 launches without counting quota-manual assignments", async () => {
  const mf = await appMiniflare();
  try {
    const api = (pathname, init = {}) => mf.dispatchFetch(`http://localhost${pathname}`, init);
    const researcherHeaders = {
      "content-type": "application/json",
      "oai-authenticated-user-email": "researcher@example.com",
    };
    const launch = (pairId, overrides = {}) => api("/api/m1-launches", {
      method: "POST",
      headers: researcherHeaders,
      body: JSON.stringify({
        pairId,
        scheduleId: 1,
        informationCondition: "staged",
        humanCode: `H-${pairId}`,
        agentCode: `A-${pairId}`,
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
        ...overrides,
      }),
    });

    const invalidBalancedReplicate = await launch("M1-BAD-REPLICATE", {
      agentReplicateId: "R-SECONDARY",
    });
    assert.equal(invalidBalancedReplicate.status, 400);

    for (let index = 0; index < 3; index += 1) {
      const response = await launch(`M1-MANUAL-${index}`);
      assert.equal(response.status, 201, await response.clone().text());
    }

    const d1 = await mf.getD1Database("DB");
    await d1.prepare(`UPDATE m1_pair_assignments
        SET allocation_mode = 'quota-manual'
        WHERE pair_id LIKE 'M1-MANUAL-%'`)
      .run();
    const assignmentMetadata = await d1
      .prepare(`SELECT
          cohort_id,
          study_phase,
          preregistration_version,
          analysis_set_version,
          implementation_build_id,
          deployment_id,
          deployment_fingerprint_sha256,
          allocation_mode
        FROM m1_pair_assignments
        WHERE pair_id = 'M1-MANUAL-0'`)
      .first();
    assert.deepEqual(assignmentMetadata, {
      cohort_id: "m1-technical-pilot-a2-2026",
      study_phase: "technical-pilot",
      preregistration_version: "m1-pilot-prereg-v2",
      analysis_set_version: "m1-pilot-analysis-v2",
      implementation_build_id: "m1-stage-a2-6d1a0f5d304b9fca",
      deployment_id: TEST_DEPLOYMENT_ID,
      deployment_fingerprint_sha256: TEST_DEPLOYMENT_FINGERPRINT_SHA256,
      allocation_mode: "quota-manual",
    });
    for (let index = 0; index < 3; index += 1) {
      await d1.prepare(`INSERT INTO m1_pair_assignments (
          pair_id,
          protocol_architecture,
          schedule_id,
          information_condition,
          stimulus_sha256,
          event_source_sha256,
          assignment_version,
          cohort_id,
          study_phase,
          preregistration_version,
          analysis_set_version,
          implementation_build_id,
          allocation_mode
        )
        SELECT
          ?,
          protocol_architecture,
          1,
          'staged',
          stimulus_sha256,
          event_source_sha256,
          'balanced-random-v1',
          'M1-FOREIGN-COHORT',
          study_phase,
          preregistration_version,
          analysis_set_version,
          implementation_build_id,
          'balanced-random-v1'
        FROM m1_pair_assignments
        WHERE pair_id = 'M1-MANUAL-0'`)
        .bind(`M1-FOREIGN-${index}`)
        .run();
    }

    const racedDuplicateResponses = await Promise.all([
      launch("M1-RACED-DUPLICATE"),
      launch("M1-RACED-DUPLICATE"),
    ]);
    assert.deepEqual(
      racedDuplicateResponses.map((response) => response.status).sort(),
      [201, 409],
    );
    const racedWinner = racedDuplicateResponses.find((response) => response.status === 201);
    assert.ok(racedWinner);
    const racedAssignment = await racedWinner.json();

    const balancedResponses = await Promise.all(
      Array.from({ length: 11 }, (_, index) => launch(`M1-BALANCED-${index}`)),
    );
    const balancedAssignments = [racedAssignment, ...await Promise.all(balancedResponses.map(async (response) => {
      assert.equal(response.status, 201, await response.clone().text());
      return response.json();
    }))];
    const actualCells = balancedAssignments
      .map((assignment) => `${assignment.informationCondition}:${assignment.scheduleId}`)
      .sort();
    const expectedCells = (["staged", "repeat-control"])
      .flatMap((condition) => [1, 2, 3, 4, 5, 6].map((scheduleId) => `${condition}:${scheduleId}`))
      .sort();
    assert.deepEqual(actualCells, expectedCells);
    assert.ok(balancedAssignments.every((assignment) => assignment.allocationMode === "balanced-random-v1"));

    const duplicate = await launch("M1-BALANCED-0");
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error, /original launch tokens cannot be reissued/);

    const overCap = await launch("M1-BALANCED-OVER-CAP");
    assert.equal(overCap.status, 409);
    assert.equal((await overCap.json()).code, "M1_BALANCED_PILOT_CAP_REACHED");

    const assignmentCount = await d1
      .prepare(`SELECT COUNT(*) AS assignment_count
        FROM m1_pair_assignments
        WHERE cohort_id = (
          SELECT cohort_id FROM m1_pair_assignments WHERE pair_id = 'M1-MANUAL-0'
        )`)
      .first();
    assert.equal(Number(assignmentCount.assignment_count), 15);
    const tokenCounts = await d1
      .prepare(`SELECT assignments.pair_id, COUNT(tokens.token_hash) AS token_count
        FROM m1_pair_assignments AS assignments
        LEFT JOIN m1_launch_tokens AS tokens ON tokens.pair_id = assignments.pair_id
        WHERE assignments.cohort_id = (
          SELECT cohort_id FROM m1_pair_assignments WHERE pair_id = 'M1-MANUAL-0'
        )
        GROUP BY assignments.pair_id
        ORDER BY assignments.pair_id`)
      .all();
    assert.equal(tokenCounts.results.length, 15);
    assert.ok(tokenCounts.results.every((row) => Number(row.token_count) === 2));
  } finally {
    await mf.dispose();
  }
});

test("records a pre-start terminal allocation without creating or counting a session", async () => {
  const mf = await appMiniflare();
  try {
    const api = (pathname, init = {}) => mf.dispatchFetch(`http://localhost${pathname}`, init);
    const researcherHeaders = {
      "content-type": "application/json",
      "oai-authenticated-user-email": "researcher@example.com",
    };
    const pairId = "M1-PRESTART-TERMINAL-001";
    const launchResponse = await api("/api/m1-launches", {
      method: "POST",
      headers: researcherHeaders,
      body: JSON.stringify({
        pairId,
        scheduleId: 1,
        informationCondition: "staged",
        humanCode: "H-PRESTART",
        agentCode: "A-PRESTART",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(launchResponse.status, 201, await launchResponse.clone().text());
    const launch = await launchResponse.json();
    const humanLaunchToken = new URL(launch.links.human).searchParams.get("launch");
    assert.match(humanLaunchToken, /^[a-f0-9]{64}$/);

    const d1 = await mf.getD1Database("DB");
    await d1.prepare(`UPDATE m1_pair_assignments
        SET deployment_fingerprint_sha256 = ?
        WHERE pair_id = ?`)
      .bind("0".repeat(64), pairId)
      .run();
    const crossDeployment = await api("/api/m1-launches", {
      method: "PATCH",
      headers: researcherHeaders,
      body: JSON.stringify({ pairId, actorType: "human", disposition: "no-show-expired" }),
    });
    assert.equal(crossDeployment.status, 409);
    assert.equal((await crossDeployment.json()).code, "M1_DEPLOYMENT_MISMATCH");
    await d1.prepare(`UPDATE m1_pair_assignments
        SET deployment_fingerprint_sha256 = ?
        WHERE pair_id = ?`)
      .bind(TEST_DEPLOYMENT_FINGERPRINT_SHA256, pairId)
      .run();

    const unauthorized = await api("/api/m1-launches", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairId, actorType: "human", disposition: "no-show-expired" }),
    });
    assert.equal(unauthorized.status, 401);

    const terminalResponse = await api("/api/m1-launches", {
      method: "PATCH",
      headers: researcherHeaders,
      body: JSON.stringify({ pairId, actorType: "human", disposition: "no-show-expired" }),
    });
    assert.equal(terminalResponse.status, 200, await terminalResponse.clone().text());
    const terminal = await terminalResponse.json();
    assert.equal(terminal.disposition, "no-show-expired");
    assert.equal(terminal.alreadyRecorded, false);

    const idempotentResponse = await api("/api/m1-launches", {
      method: "PATCH",
      headers: researcherHeaders,
      body: JSON.stringify({ pairId, actorType: "human", disposition: "no-show-expired" }),
    });
    assert.equal(idempotentResponse.status, 200, await idempotentResponse.clone().text());
    assert.equal((await idempotentResponse.json()).alreadyRecorded, true);

    const allocation = await d1.prepare(`SELECT
        claimed_session_id,
        claimed_at,
        revoked_at,
        terminal_disposition,
        terminal_at,
        (SELECT COUNT(*) FROM experiment_sessions) AS session_count
      FROM m1_launch_tokens
      WHERE pair_id = ? AND actor_type = 'human'`)
      .bind(pairId)
      .first();
    assert.equal(allocation.claimed_session_id, null);
    assert.equal(allocation.claimed_at, null);
    assert.equal(allocation.terminal_disposition, "no-show-expired");
    assert.equal(allocation.terminal_at, allocation.revoked_at);
    assert.equal(Number(allocation.session_count), 0);

    const refusedStart = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        participantCode: "H-PRESTART",
        expertise: "none",
        modelName: null,
        launchToken: humanLaunchToken,
        experimentalArm: "m1-main",
        protocolVersion: "boundary-lab-modular-v4.1",
        studyConfig: {
          pairId,
          scheduleId: launch.scheduleId,
          informationCondition: launch.informationCondition,
          humanConsentVersion: "m1-human-consent-v1",
          humanConsentedAt: "2026-08-25T07:55:00.000Z",
          humanLanguageScreeningVersion: "m1-en-financial-reading-v1",
          humanLanguageScreenedAt: "2026-08-25T07:54:00.000Z",
        },
        deviceInfo: {
          deviceType: "desktop",
          userAgent: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
          platform: "Windows",
          browserLanguage: "zh-CN",
          timezone: "Asia/Shanghai",
          screenWidth: 1920,
          screenHeight: 1080,
          viewportWidth: 1440,
          viewportHeight: 900,
          devicePixelRatio: 1,
          touchPoints: 0,
          pointerType: "fine",
          orientation: "landscape-primary",
        },
      }),
    });
    assert.equal(refusedStart.status, 403, await refusedStart.clone().text());
    assert.match((await refusedStart.json()).error, /invalid or revoked/);

    const exportResponse = await api("/api/research-export?scope=m1-comparison&table=allocations", {
      headers: { "oai-authenticated-user-email": "researcher@example.com" },
    });
    assert.equal(exportResponse.status, 200, await exportResponse.clone().text());
    const allocationCsv = await exportResponse.text();
    assert.match(allocationCsv.split(/\r?\n/, 1)[0], /terminal_disposition,terminal_at/);
    assert.match(allocationCsv, /no-show-expired/);
  } finally {
    await mf.dispose();
  }
});

test("atomically materializes an opaque-token M1 session and repairs legacy partial claims", async () => {
  const mf = await appMiniflare({
    M1_STAGE_A_PRIMARY_COLLECTION_ENABLED: "",
    M1_HUMAN_COLLECTION_ENABLED: "",
    M1_DEVELOPMENT_PILOT_ENABLED: "true",
  });
  try {
    const api = (pathname, init = {}) => mf.dispatchFetch(`http://localhost${pathname}`, init);
    const d1 = await mf.getD1Database("DB");
    const researcherHeaders = {
      "content-type": "application/json",
      "oai-authenticated-user-email": "researcher@example.com",
    };
    const createLaunch = async (pairId, scheduleId, informationCondition) => {
      const response = await api("/api/m1-launches", {
        method: "POST",
        headers: researcherHeaders,
        body: JSON.stringify({
          pairId,
          scheduleId,
          informationCondition,
          humanCode: `H-${pairId}`,
          agentCode: `A-${pairId}`,
          agentReplicateId: `R-${pairId}`,
          allocationMode: "quota-manual",
        }),
      });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json();
    };
    const humanSessionPayload = (pairId, scheduleId, informationCondition, launchToken) => ({
      actorType: "human",
      participantCode: `H-${pairId}`,
      expertise: "none",
      modelName: null,
      launchToken,
      experimentalArm: "m1-main",
      protocolVersion: "boundary-lab-modular-v4.1",
      studyConfig: {
        pairId,
        scheduleId,
        informationCondition,
        humanConsentVersion: "m1-human-consent-v1",
        humanConsentedAt: "2026-08-25T07:55:00.000Z",
        humanLanguageScreeningVersion: "m1-en-financial-reading-v1",
        humanLanguageScreenedAt: "2026-08-25T07:54:00.000Z",
        randomizedPlan: [{ id: "client-forged-plan" }],
      },
      deviceInfo: {
        deviceType: "desktop",
        userAgent: "BoundaryAtomicTest/1.0",
        platform: "Windows",
        browserLanguage: "zh-CN",
        timezone: "Asia/Shanghai",
        screenWidth: 1920,
        screenHeight: 1080,
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 1,
        touchPoints: 0,
        pointerType: "fine",
        orientation: "landscape-primary",
      },
    });

    const concurrentPairId = "M1-PAIR-CONCURRENT-001";
    const concurrentLaunch = await createLaunch(concurrentPairId, 4, "repeat-control");
    const concurrentHumanToken = new URL(concurrentLaunch.links.human).searchParams.get("launch");
    assert.match(concurrentHumanToken, /^[a-f0-9]{64}$/);
    const concurrentPayload = humanSessionPayload(
      concurrentPairId,
      4,
      "repeat-control",
      concurrentHumanToken,
    );
    const concurrentStarts = await Promise.all([
      api("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(concurrentPayload),
      }),
      api("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(concurrentPayload),
      }),
    ]);
    assert.deepEqual(concurrentStarts.map((response) => response.status).sort(), [200, 201]);
    const concurrentSessions = await Promise.all(concurrentStarts.map((response) => response.json()));
    assert.equal(concurrentSessions[0].session.id, concurrentSessions[1].session.id);
    assert.ok(concurrentSessions.every((result) => result.expectedResponseCount === 42));
    assert.equal(concurrentSessions.filter((result) => result.idempotent === true).length, 1);
    const concurrentSessionId = concurrentSessions[0].session.id;
    const concurrentMaterialization = await d1.prepare(`SELECT
        (SELECT COUNT(*) FROM experiment_sessions WHERE id = ?) AS session_count,
        (SELECT COUNT(*) FROM m1_pair_slots WHERE pair_id = ? AND actor_type = 'human') AS slot_count,
        (SELECT COUNT(*) FROM experiment_expected_steps WHERE session_id = ?) AS step_count,
        (SELECT status FROM experiment_sessions WHERE id = ?) AS session_status`)
      .bind(concurrentSessionId, concurrentPairId, concurrentSessionId, concurrentSessionId)
      .first();
    assert.deepEqual(
      {
        sessionCount: Number(concurrentMaterialization.session_count),
        slotCount: Number(concurrentMaterialization.slot_count),
        stepCount: Number(concurrentMaterialization.step_count),
        status: concurrentMaterialization.session_status,
      },
      { sessionCount: 1, slotCount: 1, stepCount: 42, status: "active" },
    );

    const danglingPairId = "M1-PAIR-DANGLING-001";
    const danglingLaunch = await createLaunch(danglingPairId, 5, "staged");
    const danglingHumanToken = new URL(danglingLaunch.links.human).searchParams.get("launch");
    assert.match(danglingHumanToken, /^[a-f0-9]{64}$/);
    const danglingTokenRow = await d1
      .prepare("SELECT token_hash FROM m1_launch_tokens WHERE pair_id = ? AND actor_type = 'human'")
      .bind(danglingPairId)
      .first();
    assert.ok(danglingTokenRow?.token_hash);
    const danglingSessionId = "legacy-partial-session-without-row";
    await d1.prepare(`UPDATE m1_launch_tokens
        SET claimed_session_id = ?, claimed_at = '2026-08-25T00:00:00.000Z'
        WHERE token_hash = ?`)
      .bind(danglingSessionId, danglingTokenRow.token_hash)
      .run();
    const recoveredDanglingResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(humanSessionPayload(
        danglingPairId,
        5,
        "staged",
        danglingHumanToken,
      )),
    });
    assert.equal(recoveredDanglingResponse.status, 200, await recoveredDanglingResponse.clone().text());
    const recoveredDangling = await recoveredDanglingResponse.json();
    assert.equal(recoveredDangling.idempotent, true);
    assert.equal(recoveredDangling.session.id, danglingSessionId);
    assert.equal(recoveredDangling.expectedResponseCount, 42);
    const danglingMaterialization = await d1.prepare(`SELECT
        (SELECT status FROM experiment_sessions WHERE id = ?) AS session_status,
        (SELECT COUNT(*) FROM m1_pair_slots WHERE session_id = ?) AS slot_count,
        (SELECT COUNT(*) FROM experiment_expected_steps WHERE session_id = ?) AS step_count`)
      .bind(danglingSessionId, danglingSessionId, danglingSessionId)
      .first();
    assert.deepEqual(
      {
        status: danglingMaterialization.session_status,
        slotCount: Number(danglingMaterialization.slot_count),
        stepCount: Number(danglingMaterialization.step_count),
      },
      { status: "active", slotCount: 1, stepCount: 42 },
    );
  } finally {
    await mf.dispose();
  }
});

test("enforces the matched Human-Agent M1 state machine, resume contract, and paired exports", async () => {
  const mf = await appMiniflare();
  try {
    const api = (pathname, init = {}) => mf.dispatchFetch(`http://localhost${pathname}`, init);
    const pairId = "M1-PAIR-E2E-001";
    const agentMetadata = { ...TEST_AGENT_METADATA };
    const researcherHeaders = {
      "content-type": "application/json",
      "oai-authenticated-user-email": "researcher@example.com",
    };
    const launchResponse = await api("/api/m1-launches", {
      method: "POST",
      headers: researcherHeaders,
      body: JSON.stringify({
        pairId,
        scheduleId: 2,
        informationCondition: "staged",
        humanCode: "HUMAN-001",
        agentCode: "AGENT-RUN-001",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(launchResponse.status, 201, await launchResponse.clone().text());
    const launch = await launchResponse.json();
    const assignedScheduleId = launch.scheduleId;
    const assignedCondition = launch.informationCondition;
    const d1 = await mf.getD1Database("DB");
    assert.doesNotMatch(launch.links.human, /pair=|schedule=|condition=|participant=/);
    assert.doesNotMatch(launch.links.agent, /pair=|schedule=|condition=|participant=/);
    const humanLaunchToken = new URL(launch.links.human).searchParams.get("launch");
    const agentLaunchToken = new URL(launch.links.agent).searchParams.get("launch");
    assert.match(humanLaunchToken, /^[a-f0-9]{64}$/);
    assert.match(agentLaunchToken, /^[a-f0-9]{64}$/);
    const duplicateLaunchResponse = await api("/api/m1-launches", {
      method: "POST",
      headers: researcherHeaders,
      body: JSON.stringify({
        pairId,
        scheduleId: 2,
        informationCondition: "staged",
        humanCode: "HUMAN-001",
        agentCode: "AGENT-RUN-001",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(duplicateLaunchResponse.status, 409);
    assert.match((await duplicateLaunchResponse.json()).error, /original launch tokens cannot be reissued/);
    const matchedSessionPayload = (actorType, overrides = {}) => {
      const isAgent = actorType === "agent";
      const overrideStudyConfig = overrides.studyConfig ?? {};
      return {
        actorType,
        participantCode: isAgent ? "AGENT-RUN-001" : "HUMAN-001",
        expertise: "none",
        modelName: isAgent ? TEST_AGENT_MODEL_NAME : null,
        launchToken: isAgent ? agentLaunchToken : humanLaunchToken,
        experimentalArm: isAgent ? "agent-m1-main" : "m1-main",
        protocolVersion: "boundary-lab-modular-v4.1",
        ...overrides,
        studyConfig: {
          pairId,
          scheduleId: assignedScheduleId,
          informationCondition: assignedCondition,
          humanConsentVersion: isAgent ? undefined : "m1-human-consent-v1",
          humanConsentedAt: isAgent ? undefined : "2026-08-25T07:55:00.000Z",
          humanLanguageScreeningVersion: isAgent ? undefined : "m1-en-financial-reading-v1",
          humanLanguageScreenedAt: isAgent ? undefined : "2026-08-25T07:54:00.000Z",
          agentMetadata: isAgent ? agentMetadata : undefined,
          // A caller-supplied plan must never override the server plan.
          randomizedPlan: [{ id: "client-forged-plan" }],
          ...overrideStudyConfig,
        },
        deviceInfo: {
          deviceType: "desktop",
          userAgent: isAgent
            ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 AgentFixture/1.0"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 HumanFixture/1.0",
          platform: "Windows",
          browserLanguage: "zh-CN",
          timezone: "Asia/Shanghai",
          screenWidth: 1920,
          screenHeight: 1080,
          viewportWidth: 1440,
          viewportHeight: 900,
          devicePixelRatio: 1,
          touchPoints: 0,
          pointerType: "fine",
          orientation: "landscape-primary",
          ...(overrides.deviceInfo ?? {}),
        },
      };
    };
    const createMatchedSession = async (actorType) => {
      const response = await api("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(matchedSessionPayload(actorType)),
      });
      assert.equal(response.status, 201, await response.clone().text());
      const created = await response.json();
      assert.equal(created.expectedResponseCount, 42);
      assert.equal(created.plan.length, 6);
      const schedulePrefix = `m1-s${String(assignedScheduleId).padStart(2, "0")}`;
      assert.deepEqual(
        created.plan.map((trial) => trial.id),
        Array.from({ length: 6 }, (_, index) => `${schedulePrefix}-t${String(index + 1).padStart(2, "0")}`),
      );
      assert.deepEqual(
        [...created.plan.map((trial) => trial.assetId)].sort(),
        ["bitcoin", "bnb", "dogecoin", "ethereum", "solana", "xrp"],
      );
      return created;
    };

    const missingAgentMetadata = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "agent",
        participantCode: "BAD-AGENT",
        expertise: "none",
        modelName: "Unversioned model",
        launchToken: agentLaunchToken,
        experimentalArm: "agent-m1-main",
        protocolVersion: "boundary-lab-modular-v4.1",
        studyConfig: { pairId, scheduleId: assignedScheduleId, informationCondition: assignedCondition },
      }),
    });
    assert.equal(missingAgentMetadata.status, 400);

    const ineligibleHuman = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(matchedSessionPayload("human", {
        deviceInfo: { viewportWidth: 1024, viewportHeight: 768 },
      })),
    });
    assert.equal(ineligibleHuman.status, 422);
    const ineligibleHumanPayload = await ineligibleHuman.json();
    assert.equal(ineligibleHumanPayload.code, "PRIMARY_DEVICE_INELIGIBLE");
    assert.ok(ineligibleHumanPayload.protocolDeviationCodes.includes("viewport_not_1440x900"));
    const unclaimedHumanToken = await d1
      .prepare("SELECT claimed_session_id FROM m1_launch_tokens WHERE pair_id = ? AND actor_type = 'human'")
      .bind(pairId)
      .first();
    assert.equal(unclaimedHumanToken.claimed_session_id, null);

    const invalidEmpty = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        participantCode: "EMPTY-PLAN",
        expertise: "none",
        experimentalArm: "legacy-empty",
        protocolVersion: "legacy-test",
        studyConfig: {},
      }),
    });
    assert.equal(invalidEmpty.status, 201);
    const { session: emptySession } = await invalidEmpty.json();
    const invalidEmptyCompletion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: emptySession.id }),
    });
    assert.equal(invalidEmptyCompletion.status, 409);
    assert.match((await invalidEmptyCompletion.json()).error, /no valid expected-step plan/i);

    const boundaries = [
      { index: 10, ratio: 1 / 3, date: "2021-01-01" },
      { index: 20, ratio: 2 / 3, date: "2023-01-01" },
    ];
    const boundaryIntervals = [
      { boundaryIndex: 0, centerRatio: 1 / 3, halfWidthRatio: 0.04, widthRatio: 0.08, lowerRatio: 1 / 3 - 0.04, upperRatio: 1 / 3 + 0.04, lowerIndex: 8, upperIndex: 12, lowerDate: "2020-10-01", upperDate: "2021-04-01" },
      { boundaryIndex: 1, centerRatio: 2 / 3, halfWidthRatio: 0.04, widthRatio: 0.08, lowerRatio: 2 / 3 - 0.04, upperRatio: 2 / 3 + 0.04, lowerIndex: 18, upperIndex: 22, lowerDate: "2022-10-01", upperDate: "2023-04-01" },
    ];
    const responseBody = (sessionId, trial, disclosureIndex, overrides = {}) => ({
      sessionId,
      trialId: trial.id,
      trialOrder: trial.order,
      responseVersion: "m1-isomorphic-v1",
      moduleKey: trial.module,
      taskType: trial.taskType,
      stimulusType: "crypto",
      assetId: trial.assetId,
      metricType: trial.metric,
      resolution: trial.resolution,
      scaleMode: trial.scaleMode,
      windowMode: trial.windowMode,
      disclosureIndex,
      disclosureKey: trial.disclosures[disclosureIndex],
      disclosureState: { round: disclosureIndex },
      stimulusWindow: { mode: trial.windowMode },
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
      firstMoveMs: null,
      firstUncertaintyMs: 500,
      adjustmentCount: 0,
      uncertaintyAdjustmentCount: 2,
      clientStartedAt: "2026-08-25T08:00:00.000Z",
      clientSubmittedAt: "2026-08-25T08:00:01.200Z",
      responseViewportWidth: 1440,
      responseViewportHeight: 900,
      responseOrientation: "landscape-primary",
      pageHiddenMs: 100,
      activeElapsedMs: 1100,
      ...overrides,
    });
    const submit = (body) => api("/api/modular-responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const completePractice = async (sessionId) => {
      const response = await api("/api/sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, action: "practice-complete" }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(await response.json(), { ok: true, practiceCompleted: true });
    };
    const startExposure = async (sessionId, stepOrder) => {
      const response = await api("/api/m1-step-exposures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, stepOrder }),
      });
      assert.ok([200, 201].includes(response.status), await response.clone().text());
      const payload = await response.json();
      assert.equal(payload.stepOrder, stepOrder);
      assert.ok(payload.remainingMs >= 0 && payload.remainingMs <= 180000);
      return payload;
    };

    const legacyAssetMajorPlan = [
      {
        id: "legacy-synthetic-control",
        order: 0,
        module: "disclosure",
        taskType: "T2",
        assetId: "synthetic-regime",
        controlId: "synthetic-regime",
        metric: "price",
        resolution: "weekly",
        scaleMode: "linear",
        windowMode: "whole",
        disclosures: ["G0", "GI1"],
      },
      {
        id: "legacy-bitcoin",
        order: 1,
        module: "disclosure",
        taskType: "T2",
        assetId: "bitcoin",
        metric: "price",
        resolution: "weekly",
        scaleMode: "linear",
        windowMode: "whole",
        disclosures: ["G0", "GI1"],
      },
    ];
    const legacyAssetMajorSessionResponse = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        participantCode: "LEGACY-ASSET-MAJOR",
        expertise: "none",
        experimentalArm: "legacy-asset-major",
        protocolVersion: "legacy-v4-test",
        studyConfig: { disclosureFlowOrder: "asset-major", randomizedPlan: legacyAssetMajorPlan },
      }),
    });
    assert.equal(legacyAssetMajorSessionResponse.status, 201);
    const { session: legacyAssetMajorSession } = await legacyAssetMajorSessionResponse.json();
    for (const trial of legacyAssetMajorPlan) {
      for (let disclosureIndex = 0; disclosureIndex < trial.disclosures.length; disclosureIndex += 1) {
        const response = await submit(responseBody(legacyAssetMajorSession.id, trial, disclosureIndex, {
          responseVersion: "v4.2",
          stimulusType: trial.controlId === "synthetic-regime" ? "ground-truth" : "crypto",
        }));
        assert.equal(response.status, 201, await response.clone().text());
      }
    }
    const legacyAssetMajorCompletion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: legacyAssetMajorSession.id }),
    });
    assert.equal(legacyAssetMajorCompletion.status, 200);
    assert.deepEqual(await legacyAssetMajorCompletion.json(), { ok: true, responseCount: 4, expectedResponseCount: 4 });

    const human = await createMatchedSession("human");
    await d1.prepare("UPDATE experiment_sessions SET status = 'initializing' WHERE id = ?")
      .bind(human.session.id)
      .run();
    await d1.prepare("DELETE FROM m1_pair_slots WHERE session_id = ?")
      .bind(human.session.id)
      .run();
    await d1.prepare("DELETE FROM experiment_expected_steps WHERE session_id = ? AND step_order = 41")
      .bind(human.session.id)
      .run();
    const duplicateHuman = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(matchedSessionPayload("human", { participantCode: "HUMAN-DUPLICATE" })),
    });
    assert.equal(duplicateHuman.status, 200);
    const duplicateHumanPayload = await duplicateHuman.json();
    assert.equal(duplicateHumanPayload.idempotent, true);
    assert.equal(duplicateHumanPayload.session.id, human.session.id);
    assert.equal(duplicateHumanPayload.expectedResponseCount, 42);
    const recoveredHuman = await api(`/api/sessions?sessionId=${human.session.id}&launch=${humanLaunchToken}`);
    assert.equal(recoveredHuman.status, 200);
    const recoveredHumanPayload = await recoveredHuman.json();
    assert.equal(recoveredHumanPayload.session.status, "active");
    assert.equal(recoveredHumanPayload.progress.expectedResponseCount, 42);
    const humanConfigBeforeDeploymentTamper = await d1
      .prepare("SELECT study_config_json FROM experiment_sessions WHERE id = ?")
      .bind(human.session.id)
      .first();
    assert.ok(humanConfigBeforeDeploymentTamper?.study_config_json);
    await d1.prepare(`UPDATE experiment_sessions
        SET study_config_json = json_set(study_config_json, '$.deploymentFingerprintSha256', ?)
        WHERE id = ?`)
      .bind("d".repeat(64), human.session.id)
      .run();
    const crossDeploymentPractice = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: human.session.id, action: "practice-complete" }),
    });
    assert.equal(crossDeploymentPractice.status, 409);
    assert.equal((await crossDeploymentPractice.json()).code, "M1_DEPLOYMENT_MISMATCH");
    const crossDeploymentExposure = await api("/api/m1-step-exposures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: human.session.id, stepOrder: 0 }),
    });
    assert.equal(crossDeploymentExposure.status, 409);
    assert.equal((await crossDeploymentExposure.json()).code, "M1_DEPLOYMENT_MISMATCH");
    const crossDeploymentResponse = await submit(responseBody(human.session.id, human.plan[0], 0));
    assert.equal(crossDeploymentResponse.status, 409);
    assert.equal((await crossDeploymentResponse.json()).code, "M1_DEPLOYMENT_MISMATCH");
    await d1.prepare("UPDATE experiment_sessions SET study_config_json = ? WHERE id = ?")
      .bind(humanConfigBeforeDeploymentTamper.study_config_json, human.session.id)
      .run();
    const premature = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: human.session.id }),
    });
    assert.equal(premature.status, 409);
    assert.equal((await premature.json()).expectedResponseCount, 42);

    const beforePractice = await submit(responseBody(human.session.id, human.plan[0], 0));
    assert.equal(beforePractice.status, 409);
    assert.equal((await beforePractice.json()).code, "PRACTICE_REQUIRED");
    await completePractice(human.session.id);
    await startExposure(human.session.id, 0);

    const wrongAsset = human.plan[0].assetId === "bitcoin" ? "ethereum" : "bitcoin";
    const wrongCondition = await submit(responseBody(human.session.id, human.plan[0], 0, { assetId: wrongAsset }));
    assert.equal(wrongCondition.status, 409);
    assert.equal((await wrongCondition.json()).code, "STEP_CONDITION_MISMATCH");
    const outOfOrder = await submit(responseBody(human.session.id, human.plan[1], 0));
    assert.equal(outOfOrder.status, 409);
    assert.equal((await outOfOrder.json()).code, "OUT_OF_ORDER_STEP");
    const wrongResponseVersion = await submit(responseBody(human.session.id, human.plan[0], 0, { responseVersion: "v4.3" }));
    assert.equal(wrongResponseVersion.status, 409);
    assert.match((await wrongResponseVersion.json()).error, /protocol version mismatch/);

    const firstBody = responseBody(human.session.id, human.plan[0], 0);
    const firstResponse = await submit(firstBody);
    assert.equal(firstResponse.status, 201, await firstResponse.clone().text());
    const duplicateResponse = await submit(firstBody);
    assert.equal(duplicateResponse.status, 200);
    assert.equal((await duplicateResponse.json()).idempotent, true);
    const conflictingResponse = await submit({ ...firstBody, noChangeConfirmed: true });
    assert.equal(conflictingResponse.status, 409);
    assert.equal((await conflictingResponse.json()).code, "STEP_ALREADY_FINALIZED");

    const resumeWithoutToken = await api(`/api/sessions?sessionId=${human.session.id}`);
    assert.equal(resumeWithoutToken.status, 403);
    const resumeWithWrongToken = await api(`/api/sessions?sessionId=${human.session.id}&launch=${agentLaunchToken}`);
    assert.equal(resumeWithWrongToken.status, 403);
    const resume = await api(`/api/sessions?sessionId=${human.session.id}&launch=${humanLaunchToken}`);
    assert.equal(resume.status, 200);
    const resumeState = await resume.json();
    assert.deepEqual(resumeState.progress, { responseCount: 1, expectedResponseCount: 42, nextStepOrder: 1, complete: false });
    assert.equal(resumeState.responses.length, 1);
    assert.equal(resumeState.session.studyConfig.protocolArchitecture, "m1-isomorphic-v1");

    const humanAttempt = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: human.session.id,
        stepOrder: 0,
        attemptNumber: 1,
        modelApiAttemptNumber: 1,
        mechanicalActionId: "",
        mechanicalRetryNumber: 0,
        controllerVersion: "test-controller",
        modelRequestId: "req-human-forbidden",
        sourceModelRequestId: "",
        promptSha256: "a".repeat(64),
        runtimeRequestSha256: "f".repeat(64),
        screenshotSha256: "b".repeat(64),
        outputSha256: "c".repeat(64),
        actionTraceSha256: "e".repeat(64),
        contextPolicy: "persistent",
        inputModality: "screenshot",
        imageDetail: "high",
        toolCalls: 1,
        status: "submitted",
        startedAt: "2026-08-25T08:00:00.000Z",
        completedAt: "2026-08-25T08:00:01.000Z",
      }),
    });
    assert.equal(humanAttempt.status, 403);

    for (let disclosureIndex = 0; disclosureIndex < 7; disclosureIndex += 1) {
      for (const trial of human.plan) {
        if (disclosureIndex === 0 && trial.order === 0) continue;
        const stepOrder = disclosureIndex * human.plan.length + trial.order;
        await startExposure(human.session.id, stepOrder);
        if (disclosureIndex === 1 && trial.order === 0) {
          const stale = await submit(responseBody(human.session.id, trial, disclosureIndex, {
            previousBoundaries: [
              { index: 10, ratio: 0.31, date: "2021-01-01" },
              { index: 20, ratio: 0.69, date: "2023-01-01" },
            ],
          }));
          assert.equal(stale.status, 409);
          assert.equal((await stale.json()).code, "STALE_PREVIOUS_BOUNDARIES");
        }
        const response = await submit(responseBody(human.session.id, trial, disclosureIndex));
        assert.equal(response.status, 201, await response.clone().text());
      }
    }
    const humanCompletion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: human.session.id }),
    });
    assert.equal(humanCompletion.status, 200);
    assert.deepEqual(await humanCompletion.json(), { ok: true, responseCount: 42, expectedResponseCount: 42 });

    const pairMismatch = await api("/api/m1-launches", {
      method: "POST",
      headers: researcherHeaders,
      body: JSON.stringify({
        pairId,
        scheduleId: 3,
        informationCondition: "staged",
        humanCode: "HUMAN-WRONG-SCHEDULE",
        agentCode: "AGENT-WRONG-SCHEDULE",
        agentReplicateId: "R-PRIMARY",
        allocationMode: "balanced-random-v1",
      }),
    });
    assert.equal(pairMismatch.status, 409);
    assert.match((await pairMismatch.json()).error, /Pair ID is already assigned/);

    const ineligibleAgent = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(matchedSessionPayload("agent", {
        deviceInfo: { devicePixelRatio: 2, pointerType: "coarse", orientation: "portrait-primary" },
      })),
    });
    assert.equal(ineligibleAgent.status, 422);
    const ineligibleAgentPayload = await ineligibleAgent.json();
    assert.equal(ineligibleAgentPayload.code, "PRIMARY_DEVICE_INELIGIBLE");
    assert.ok(ineligibleAgentPayload.protocolDeviationCodes.includes("dpr_not_1"));
    const unclaimedAgentToken = await d1
      .prepare("SELECT claimed_session_id FROM m1_launch_tokens WHERE pair_id = ? AND actor_type = 'agent'")
      .bind(pairId)
      .first();
    assert.equal(unclaimedAgentToken.claimed_session_id, null);

    const agent = await createMatchedSession("agent");
    const duplicateAgentReplicate = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(matchedSessionPayload("agent", { participantCode: "AGENT-DUPLICATE" })),
    });
    assert.equal(duplicateAgentReplicate.status, 200);
    const duplicateAgentPayload = await duplicateAgentReplicate.json();
    assert.equal(duplicateAgentPayload.idempotent, true);
    assert.equal(duplicateAgentPayload.session.id, agent.session.id);
    await completePractice(agent.session.id);
    await startExposure(agent.session.id, 0);
    assert.deepEqual(
      agent.plan.map(({ id, order, assetId, disclosures }) => ({ id, order, assetId, disclosures })),
      human.plan.map(({ id, order, assetId, disclosures }) => ({ id, order, assetId, disclosures })),
    );
    const attemptBody = {
      sessionId: agent.session.id,
      stepOrder: 0,
      attemptNumber: 1,
      modelApiAttemptNumber: 1,
      mechanicalActionId: "",
      mechanicalRetryNumber: 0,
      controllerVersion: agentMetadata.controllerVersion,
      modelRequestId: "req-test-001",
      sourceModelRequestId: "",
      promptSha256: "9bb751053f6adab759323983c9358089fdf0906ef9217ef7627cd94586974647",
      runtimeRequestSha256: "f".repeat(64),
      screenshotSha256: "b".repeat(64),
      outputSha256: "c".repeat(64),
      actionTraceSha256: "e".repeat(64),
      contextPolicy: "persistent",
      inputModality: "screenshot",
      imageDetail: "high",
      temperature: 0,
      topP: 1,
      seed: 42,
      reasoningEffort: "high",
      inputTokens: 1000,
      outputTokens: 100,
      toolCalls: 2,
      status: "submitted",
      startedAt: "2026-08-25T08:00:00.000Z",
      completedAt: "2026-08-25T08:00:01.000Z",
    };
    const agentConfigBeforeDeploymentTamper = await d1
      .prepare("SELECT study_config_json FROM experiment_sessions WHERE id = ?")
      .bind(agent.session.id)
      .first();
    assert.ok(agentConfigBeforeDeploymentTamper?.study_config_json);
    await d1.prepare(`UPDATE experiment_sessions
        SET study_config_json = json_set(study_config_json, '$.deploymentId', ?)
        WHERE id = ?`)
      .bind("m1-other-deployment-2026-08-26", agent.session.id)
      .run();
    const crossDeploymentAttempt = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(attemptBody),
    });
    assert.equal(crossDeploymentAttempt.status, 409);
    assert.equal((await crossDeploymentAttempt.json()).code, "M1_DEPLOYMENT_MISMATCH");
    await d1.prepare("UPDATE experiment_sessions SET study_config_json = ? WHERE id = ?")
      .bind(agentConfigBeforeDeploymentTamper.study_config_json, agent.session.id)
      .run();
    const futureAttempt = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...attemptBody, stepOrder: 1, modelRequestId: "req-future-forbidden" }),
    });
    assert.equal(futureAttempt.status, 409);
    assert.equal((await futureAttempt.json()).code, "AGENT_ATTEMPT_OUT_OF_ORDER");
    const attempt = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(attemptBody),
    });
    assert.equal(attempt.status, 201, await attempt.clone().text());
    const settingsMismatch = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...attemptBody, attemptNumber: 2, controllerVersion: "different-controller" }),
    });
    assert.equal(settingsMismatch.status, 409);
    assert.equal((await settingsMismatch.json()).code, "ATTEMPT_SETTINGS_MISMATCH");
    const duplicateAttempt = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(attemptBody),
    });
    assert.equal(duplicateAttempt.status, 200);
    assert.equal((await duplicateAttempt.json()).idempotent, true);
    const conflictingAttempt = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...attemptBody, outputSha256: "d".repeat(64) }),
    });
    assert.equal(conflictingAttempt.status, 409);
    assert.equal((await conflictingAttempt.json()).code, "ATTEMPT_ALREADY_FINALIZED");
    const invalidAttemptStatus = await api("/api/agent-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...attemptBody, attemptNumber: 2, status: "looks-good" }),
    });
    assert.equal(invalidAttemptStatus.status, 400);

    for (let disclosureIndex = 0; disclosureIndex < 7; disclosureIndex += 1) {
      for (const trial of agent.plan) {
        const stepOrder = disclosureIndex * agent.plan.length + trial.order;
        if (stepOrder > 0) await startExposure(agent.session.id, stepOrder);
        if (stepOrder === 41) {
          const missingAttemptResponse = await submit(responseBody(agent.session.id, trial, disclosureIndex));
          assert.equal(missingAttemptResponse.status, 409);
          assert.equal((await missingAttemptResponse.json()).code, "AGENT_ATTEMPT_REQUIRED");
        }
        if (stepOrder > 0) {
          const stepAttempt = await api("/api/agent-attempts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...attemptBody,
              stepOrder,
              attemptNumber: 1,
              modelRequestId: `req-step-${String(stepOrder).padStart(2, "0")}`,
            }),
          });
          assert.equal(stepAttempt.status, 201, await stepAttempt.clone().text());
        }
        const response = await submit(responseBody(agent.session.id, trial, disclosureIndex));
        assert.equal(response.status, 201, await response.clone().text());
      }
    }
    const agentCompletion = await api("/api/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: agent.session.id }),
    });
    assert.equal(agentCompletion.status, 200);
    assert.deepEqual(await agentCompletion.json(), { ok: true, responseCount: 42, expectedResponseCount: 42 });

    const exportHeaders = { "oai-authenticated-user-email": "researcher@example.com" };
    const comparisonExport = await api("/api/research-export?scope=m1-comparison", { headers: exportHeaders });
    assert.equal(comparisonExport.status, 200, await comparisonExport.clone().text());
    const comparisonCsv = await comparisonExport.text();
    assert.equal(comparisonCsv.split("\r\n").length, 85);
    assert.match(comparisonCsv, /pair_id,schedule_id,information_condition,protocol_architecture/);
    assert.match(comparisonCsv, /implementation_build_id,deployment_id,deployment_fingerprint_sha256/);
    assert.match(comparisonCsv, new RegExp(`${TEST_DEPLOYMENT_ID},${TEST_DEPLOYMENT_FINGERPRINT_SHA256}`));
    assert.match(comparisonCsv, /response_id,step_order,trial_id/);
    assert.match(comparisonCsv, /M1-PAIR-E2E-001/);
    assert.match(comparisonCsv, /m1-main/);
    assert.match(comparisonCsv, /agent-m1-main/);
    assert.match(comparisonCsv, /m1-isomorphic-v1/);
    assert.match(comparisonCsv, /c941b59446774c62e848f5fc3431d555a05ab07e6ec416b489c4bc98d014074e/);
    assert.match(comparisonCsv, /cc9d1f5d06fa2aeb447c57abeb1c42c560195967d33e7a4f90629333c3bc9438/);
    assert.match(comparisonCsv, /primary_protocol_eligible,protocol_deviation_codes/);
    assert.match(comparisonCsv, /g0_exact_default_anchor/);
    assert.match(comparisonCsv, /,true,/);
    assert.match(comparisonCsv, /AgentModel-Test-1/);

    const comparisonSessions = await api("/api/research-export?scope=m1-comparison&table=sessions", { headers: exportHeaders });
    assert.equal(comparisonSessions.status, 200);
    const comparisonSessionsCsv = await comparisonSessions.text();
    assert.equal(comparisonSessionsCsv.split("\r\n").length, 3);
    assert.match(comparisonSessionsCsv, /Chrome\/140; Windows/);
    assert.doesNotMatch(comparisonSessionsCsv, /Mozilla\/5\.0|HumanFixture|AgentFixture/);
    assert.match(comparisonSessionsCsv, /session_termination_code/);
    assert.match(comparisonSessionsCsv, /allocation_mode/);
    assert.match(comparisonSessionsCsv, /implementation_build_id,deployment_id,deployment_fingerprint_sha256/);
    assert.match(comparisonSessionsCsv, new RegExp(`${TEST_DEPLOYMENT_ID},${TEST_DEPLOYMENT_FINGERPRINT_SHA256}`));

    const allocationExport = await api("/api/research-export?scope=m1-comparison&table=allocations", { headers: exportHeaders });
    assert.equal(allocationExport.status, 200);
    const allocationCsv = await allocationExport.text();
    assert.equal(allocationCsv.split("\r\n").length, 3);
    assert.match(
      allocationCsv,
      /assignment_version,cohort_id,study_phase,preregistration_version,analysis_set_version,implementation_build_id,deployment_id,deployment_fingerprint_sha256,allocation_mode,agent_profile_sha256,primary_browser_major,protocol_architecture/,
    );
    assert.match(allocationCsv, new RegExp(`m1-technical-pilot-a2-2026,technical-pilot,m1-pilot-prereg-v2,m1-pilot-analysis-v2,m1-stage-a2-6d1a0f5d304b9fca,${TEST_DEPLOYMENT_ID},${TEST_DEPLOYMENT_FINGERPRINT_SHA256},balanced-random-v1,${TEST_AGENT_PROFILE_SHA256},140,m1-isomorphic-v1`));
    assert.match(allocationCsv, /M1-PAIR-E2E-001/);
    assert.doesNotMatch(allocationCsv, new RegExp(humanLaunchToken));
    assert.doesNotMatch(allocationCsv, new RegExp(agentLaunchToken));

    const attemptsExport = await api("/api/research-export?scope=m1-comparison&table=agent-attempts", { headers: exportHeaders });
    assert.equal(attemptsExport.status, 200);
    const attemptsCsv = await attemptsExport.text();
    assert.equal(attemptsCsv.split("\r\n").length, 43);
    assert.match(attemptsCsv, /attempt_number,model_api_attempt_number,mechanical_action_id,mechanical_retry_number,controller_version/);
    assert.match(attemptsCsv, /allocation_mode,deployment_id,deployment_fingerprint_sha256/);
    assert.match(attemptsCsv, new RegExp(`${TEST_DEPLOYMENT_ID},${TEST_DEPLOYMENT_FINGERPRINT_SHA256}`));
    assert.match(attemptsCsv, /model_request_id,source_model_request_id,prompt_sha256,runtime_request_sha256,screenshot_sha256,output_sha256,action_trace_sha256/);
    assert.match(attemptsCsv, /response_id,response_sha256/);
    assert.match(attemptsCsv, /browser-controller-test-v1/);
    assert.match(attemptsCsv, /9bb751053f6adab759323983c9358089fdf0906ef9217ef7627cd94586974647/);
    const humanAttemptsExport = await api("/api/research-export?scope=human-m1&table=agent-attempts", { headers: exportHeaders });
    assert.equal(humanAttemptsExport.status, 200);
    assert.equal((await humanAttemptsExport.text()).split("\r\n").length, 1);

    const exposureExport = await api("/api/research-export?scope=m1-comparison&table=step-exposures", { headers: exportHeaders });
    assert.equal(exposureExport.status, 200);
    const exposureCsv = await exposureExport.text();
    assert.equal(exposureCsv.split("\r\n").length, 85);
    assert.match(exposureCsv, /allocation_mode,deployment_id,deployment_fingerprint_sha256/);
    assert.match(exposureCsv, new RegExp(`${TEST_DEPLOYMENT_ID},${TEST_DEPLOYMENT_FINGERPRINT_SHA256}`));
    assert.match(exposureCsv, /server_page_started_at,response_id,response_received_at,server_page_elapsed_ms/);
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
  assert.match(source, /每一轮只呈现当时可用的页面状态/);
  assert.match(source, /我已了解，开始正式实验/);
  assert.match(source, /DISCLOSURE_PATHS\[disclosurePath\]\.length - 1/);
  assert.match(source, /participantBriefingVersion: isV4 \? "participant-briefing-v2-device-telemetry"/);
  assert.match(source, /experimentalArm: isAgentM1 \? "agent-m1-main" : isHumanM1Main \? "m1-main"/);
  assert.match(source, /mainStudyProtocol: isMatchedM1 \? M1_PROTOCOL_VERSION/);
  assert.match(source, /protocolArchitecture: isFixedM1 \? M1_PROTOCOL_VERSION/);
  assert.match(source, /buildM1ProtocolPlan\(fixedSchedule, informationCondition\)/);
  assert.match(source, /disclosureFlowOrder: usesLayerMajorDisclosureFlow \? "disclosure-major"/);
  assert.match(source, /usesFixedM1SequentialPages[\s\S]*?"sequential-single-asset-pages-v1"/);
  assert.match(source, /participantQuestionSet: isFixedM1 \? "boundaries-uncertainty-influence-v1"/);
  assert.match(source, /uncertaintyControl: isV4 \? "continuous-range-knob-v1"/);
  assert.match(source, /NEW INFORMATION · 新信息已出现/);
  assert.match(source, /NEXT JUDGMENT · 进入下一轮/);
  assert.match(source, /phase === "experiment" && usesLayerMajorDisclosureFlow && !usesFixedM1SequentialPages/);
  assert.match(source, /!isFixedM1 && \(\(!isV4 \|\| responseShapeReady\)/);
  assert.match(source, /cueSchemaVersion: isFixedM1 \? "none"/);
  assert.match(source, /deviceTelemetryProtocol: isFixedM1 \? "session-device-environment-v1"/);
  assert.match(source, /responseTelemetryProtocol: isFixedM1 \? "per-page-visible-time-v1"/);
  assert.match(source, /responseVersion: isFixedM1 \? "m1-isomorphic-v1"/);
  assert.match(source, /COMMON PRACTICE · 共同练习/);
  assert.match(source, /练习答案不会写入正式响应表/);
  assert.match(source, /RESPONSES SAVED · 中性休息页/);
  assert.match(source, /这里不显示答案分析、边界移动或表现反馈/);
  assert.match(source, /showDates=\{context\.visibility\.axes\}/);
  assert.match(source, /visibility\.axes \? `\$\{points\.length\.toLocaleString\("zh-CN"\)\} 个/);
  assert.match(source, /m1RailStepState\(keys, activeIndex, index\)/);
  assert.match(source, /state\.titleMode === "neutral-round"/);
  assert.match(source, /DISCLOSURE_COPY\[key\]\.title : "？"/);
  assert.match(source, /pageHiddenMs/);
  assert.match(source, /activeElapsedMs/);
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
