# M1 Stage A GO / REVISE / STOP 审计运行手册（v3）

## 1. 目的与可信根

Stage A 审计必须在查看 Human–Agent 边界效应之前执行。它只判断技术先导是否完整、可审计、是否有资格冻结一个新的 Stage-B build；它不检验研究假设，也不自动开放 Stage B。

权威实现包括：

- `lib/m1-stage-a-audit.ts`：五态判定与量化阈值；
- `lib/m1-stage-a-normalize.ts`：从五个原始 CSV 重建 12 pairs、24 个 allocation slots、实际创建的 0–24 sessions 和 42-step scientific integrity；
- `lib/m1-stage-a-evidence.ts`：签名 receipt、外部 evidence、Agent profile、deployment 与逐 run 原始工件核验；
- `scripts/audit-m1-stage-a.ts`：唯一正式 CLI 入口。

CLI 不接受研究者手填的 pair/session 汇总。文件 SHA-256 只证明文件完整性；来源真实性分别以两个独立受控密钥为可信根：

1. `M1_AUDIT_RECEIPT_HMAC_SECRET`：由服务器导出/受控审计服务持有，为 collection/export receipt 签名；
2. `M1_AUDIT_EVIDENCE_HMAC_SECRET`：由机构治理或独立审核方持有，为 external-evidence root 签名。

两个密钥都必须至少 32 个 UTF-8 bytes，必须不同，不能写进 Git、配置文件或研究 CSV。缺少任一密钥、签名错误、密钥相同，CLI 均以输入错误退出，不可能得到 `GO`。正式环境应在受控 CI/审计主机中注入密钥；普通研究者不能自行用一个本地 receipt 代替服务器/机构证明。

## 2. 冻结输入与五表 bundle

Stage A 关闭后，从同一个正式 cohort 导出 allocations、sessions、responses、step-exposures 和 agent-attempts 五个 CSV。

CLI 逐字节复算每个 CSV 的 SHA-256，并按下列固定 UTF-8 文本计算 bundle SHA-256（顺序固定，末尾换行）：

```text
allocations:<allocationsSha256>
sessions:<sessionsSha256>
responses:<responsesSha256>
stepExposures:<stepExposuresSha256>
agentAttempts:<agentAttemptsSha256>
```

签名的 `m1-stage-a-collection-export-receipt-v2` 必须绑定：冻结 scope、`collectionClosed=true`、关闭时间、snapshot ID/时间、deployment ID/fingerprint、五个文件 hash 和 bundle hash。receipt 的 HMAC 使用递归 key-sort canonical JSON，签名时排除 `receiptSignature` 字段。五表来自不同 deployment/snapshot、任一文件被改写或签名无效都会被拒绝。关闭时间必须不早于 allocation 的 claim/terminal 写入、terminal session、response、exposure response 以及 Agent attempt 的最后写入。Agent attempt 以数据库/服务器生成的 `created_at` 为关闭证据，不信任 controller 提供的 `completed_at`；同时要求 `started_at <= completed_at <= created_at + 999 ms`，其中 999 ms 仅用于容纳 D1 `CURRENT_TIMESTAMP` 的秒级截断。即使 controller 声称在关闭前完成，只要真实 `created_at` 晚于关闭时间，receipt 仍必须被拒绝。

冻结 scope 与代码的 `M1_STAGE_A_FROZEN_SCOPE` 必须完全一致：`cohortId`、`protocolArchitecture`、`implementationBuildId`、`stimulusSha256`、`eventSourceSha256`。allocation/session 还必须匹配冻结的 study phase、preregistration、analysis-set、`balanced-random-v1`、Agent profile hash 和 primary Chrome major。

allocation lifecycle 必须属于三种且字段完整：①开放且未领取（无 claimed、revoked、terminal 字段），此时审计保持 `NOT_EVALUABLE`；②已领取（`claimed_session_id` 与 `token_claimed_at` 均存在，无 pre-start terminal/revoked 字段），且必须解析到唯一真实 session；③合法 pre-start terminal（从未领取、无 session，`terminal_disposition` 为 `declined-before-start` / `no-show-expired` / `withdrawn-before-start` / `technical-cancel-before-start`，并且 `terminal_at=revoked_at`）。第三种会关闭 allocation slot，但绝不进入 started 分母。部分字段、自由文本原因、领取后再标 pre-start terminal 或伪造 session 都会失败。

## 3. 从原始字段重建 scientific integrity

Normalizer 不信任 `primary_protocol_eligible`、`response_protocol_eligible`、`g0_exact_default_anchor` 三个导出派生布尔，而是重新执行：

- 用 `buildM1ProtocolPlan()` 重建每个 session 的 42 个 canonical steps；
- 检查 trial、asset、round、disclosure、weekly/linear/whole-window 与冻结刺激一致；
- 解析 boundaries、previous boundaries、uncertainty intervals 和 stimulus window；
- 检查两边界有序且位于范围内，index、ratio、date 与冻结 weekly 序列精确对应；
- 检查每一资产相邻披露的 `previous_boundaries_json` 与上一轮正式答案完全一致；
- 从 ratio、`adjustment_count` 和 `first_move_ms` 重算 G0 exact-default-anchor；
- 从原始设备、User-Agent 派生 Chrome major、初始/逐题 viewport、DPR、pointer 与 orientation 重算 protocol deviation；
- 对 Human complete session 要求 42 response + 42 server exposure；
- 对 Agent complete run 另要求 42 submitted attempt、response link、server scientific-response hash 与合法 attempt ledger。

complete session 缺时长、缺 6 个 G0、actor 槽互换、边界/日期/区间错误或 previous 链断裂都不能进入 `GO`。complete integrity 失败为 `STOP`。

## 4. External evidence v3

`m1-stage-a-external-evidence-v3` 是签名 root manifest。它包含冻结 scope、两个人工审计计数、签名信息，以及下列相对路径 + SHA-256 引用：

- collectionExportReceipt；
- eventSourceArchive；
- ethicsDecision；
- approvedConsentMaterials；
- dataManagementPlan；
- humanLanguageScreeningProtocol；
- withdrawalExclusionProcess；
- rawUaMinimizationAudit；
- confirmedDataLossAudit；
- futureDisclosureAudit；
- executableController；
- runtimePromptPackage；
- agentProfileManifest；
- browserRuntimeManifest；
- sourceManifest；
- deploymentBundleManifest；
- deploymentManifest；
- runArtifactManifest。

每个非空引用都必须实际存在、非空且逐字节 hash 匹配。绝对路径、`..` 越界、symlink 逃逸、缺文件或 hash 不符会直接失败。evidence root 的 HMAC 使用独立机构密钥，签名时排除 `evidenceSignature`。

`confirmedDataLossCount=0` 和 `futureDisclosureLeakageCount=0` 只有在对应审计工件存在且 evidence root 有效签名时才表示“已核对为零”。`null` 或缺工件最多得到 `GO_PENDING_EXTERNAL_GATES`；确认计数大于 0 为 `STOP`。

## 5. Agent profile、deployment 与已启动的 R-PRIMARY runs

Agent profile manifest 保存可重算的 `m1-agent-profile-v1` 原文。CLI 重算 profile SHA，并将其与 provider、model snapshot、API version、controller 版本/文件 hash、完整 runtime prompt package、仓库 system prompt、persistent context、screenshot modality、image detail、temperature、top-p、seed、reasoning effort、Chrome major、1440×900 和 DPR 1 逐项绑定。

source manifest 必须是非空、路径唯一、每项具有合法 hash/byte count 的 `m1-source-manifest-v1`；其文件 SHA-256 前 16 位必须与 `implementationBuildId` 一致。deployment bundle v2 必须逐文件归档并复算实际 JavaScript、CSS、字体、worker、刺激、仓库 system prompt、source manifest 与 migration bundle，声明 `/m1`、`/agent` 和六个研究 API 的路由依赖；Human/Agent 页面至少分别绑定实际 JavaScript、CSS、刺激（Agent 另含 system prompt），API 必须绑定 worker，所有 executable bytes 至少被一个 required route 覆盖。只写文件名/hash 或用字体冒充路由依赖都会被拒绝。deployment manifest 必须绑定同一 snapshot、source manifest、完整 Git object ID、deployment ID、deployment fingerprint、实际 bundle 和生产开关状态 `primary=true / human=true / development=false`；deployment `createdAt` 必须不晚于最早的 primary token/session activity。五表与 collection receipt 也必须记录并匹配同一 deployment identity。

仓库测试使用合成事件源验证“字节重算 hash → signed reference → scope”正反路径；由于真实 `events_20260527.zip` 不提交 Git，普通本地测试的完整 frozen-scope CLI 结果有意停在 `GO_PENDING_EXTERNAL_GATES`。正式 release CI/审计主机必须从受限工件仓注入真实 archive，复算为冻结 `eventSourceSha256`，再以环境变量 `M1_TEST_EVENT_SOURCE_ARCHIVE=<受限绝对路径>` 运行 evidence suite 并保存一次端到端 `GO` 结果；没有这一步不能把开发测试当成 release 证明。

run artifact manifest 必须恰好覆盖 allocations 中每个**已领取并创建 session** 的 `R-PRIMARY` Agent slot，包括 aborted run；合法 pre-start terminal slot 没有 run，开放未领取 slot 则使整轮 `NOT_EVALUABLE`。manifest 数量必须等于 claimed Agent allocations 与 Agent sessions 的数量，不允许 diagnostic run、补跑、伪 run 或后来成功 run 替换。每个真实 run 绑定 pair、session、launch-token SHA-256、schedule、condition、profile、Chrome、model、status、termination code、attempt count、attempt-ledger digest 和 per-run manifest。

每个 per-run manifest 必须双向完全覆盖 attempt CSV 中所有非空的 runtime request、screenshot、model output 和 action trace。CLI 会读取实际原始文件并复算 hash。同一 run 内的每个 ledger page 必须使用自己的 screenshot 和 model-output hash，不得把同一截图或模型输出跨页复用（同页 mechanical retry 可继承同一张截图）。runtime-request JSON 使用封闭 schema，必须绑定 ledger request ID、模型、prompt package、repository prompt、本页截图和采样参数，不允许夹带 DOM、accessibility tree、network、数据库或隐藏上下文。model-output JSON 必须使用封闭的 `m1-agent-model-output-v1` schema，绑定 session、step 和唯一 model-request ID；审计器从其 scientific response 重算 SHA-256，并与 submitted attempt 及五表中实际 response 双向闭合。Stage-A 截图证据冻结为可完整校验的 1440×900 non-interlaced PNG；仅有文件魔数、截断内容、错误 CRC/scanline 或其他尺寸均被拒绝。action-trace JSON 的五种动作也使用封闭 schema，动作数必须等于 `tool_calls` 且不超过 20，只允许 `screenshot/click/drag/scroll/wait` 坐标级动作；键盘输入、selector、element ID、DOM、accessibility tree、network、search、database、source-code 等字段被拒绝。

## 6. Audit config v3

配置文件只引用五表和 external-evidence root，不包含手填 summary：

```json
{
  "schemaVersion": "m1-stage-a-audit-config-v3",
  "scope": {
    "cohortId": "m1-technical-pilot-a2-2026",
    "protocolArchitecture": "m1-isomorphic-v1",
    "implementationBuildId": "<frozen build id>",
    "stimulusSha256": "<64 hex>",
    "eventSourceSha256": "<64 hex>"
  },
  "exports": {
    "allocations": { "path": "exports/allocations.csv", "sha256": "<64 hex>" },
    "sessions": { "path": "exports/sessions.csv", "sha256": "<64 hex>" },
    "responses": { "path": "exports/responses.csv", "sha256": "<64 hex>" },
    "stepExposures": { "path": "exports/step-exposures.csv", "sha256": "<64 hex>" },
    "agentAttempts": { "path": "exports/agent-attempts.csv", "sha256": "<64 hex>" }
  },
  "exportBundleSha256": "<fixed bundle digest>",
  "externalEvidence": {
    "path": "evidence/stage-a-evidence-v3.json",
    "sha256": "<evidence file SHA-256>"
  }
}
```

执行：

```powershell
$env:M1_AUDIT_RECEIPT_HMAC_SECRET = "<server-controlled secret>"
$env:M1_AUDIT_EVIDENCE_HMAC_SECRET = "<independent governance secret>"
npm run audit:m1-stage-a -- C:\restricted\stage-a\audit-config-v3.json C:\restricted\stage-a\audit-result-v3.json
```

输出为 `m1-stage-a-audit-result-v3`；目标已存在时使用独占创建并失败，不会覆盖。Exit code：`0=GO`、`2=REVISE`、`3=STOP`、`4=NOT_EVALUABLE / GO_PENDING / 输入或证据错误`。

## 7. 冻结判定规则

判定优先级：

1. `STOP`：complete integrity 失败、确认的数据丢失或未来信息泄漏；
2. `NOT_EVALUABLE`：输入/scope/签名/hash 无效，未覆盖 12 个唯一 condition × schedule cells，24 primary allocation slots 未全部成为真实 terminal session 或合法 pre-start terminal disposition，仍有开放 token，或 collection 未以可信 receipt 关闭；
3. `REVISE`：complete matched pairs <10/12、任一 condition <5/6、任一 actor completion <80%、Agent abort >10%、median >45 分钟、nearest-rank P95 >75 分钟、deviation >10% 或 G0 default-anchor >50%；
4. `GO_PENDING_EXTERNAL_GATES`：量化门槛通过但任一伦理、同意/DMP、英语筛选、撤回、raw-UA、deployment、controller/prompt/model/browser/run-artifact 或机构 evidence gate 未完成；
5. `GO`：以上全部通过。只有此状态 `proceedToStageB=true`，且只允许另建新的 Stage-B build/cohort；当前 build 仍不开放 Stage B。

偶数样本 median 取中间两值平均；P95 使用 nearest-rank。阈值的“至少/不高于”包含边界值。

## 8. 双人复核与归档

第二名研究者独立复算五表、bundle、receipt、evidence、source/deployment 和 run-artifact hashes，核对 HMAC key ID、snapshot、24 个 allocation slots、每个 slot 的 lifecycle、所有 claimed Agent runs 与原始工件。归档到机构批准的受限/WORM 存储：五 CSV、config v3、签名 receipt、签名 evidence root 及所有引用工件、result v3、密钥轮换/审核记录、Git/deployment manifest 和执行环境版本。

不要把真实 CSV、session/pair 明细、设备原始信息、HMAC secrets 或 raw Agent artifacts 提交到 Git。论文流程图分别报告 invitation、四类 pre-start terminal disposition、started、available、complete、aborted 与 complete matched pairs，并按 actor、condition × schedule 报告 12 cells；`started` 只计有 canonical session 的 slot。
