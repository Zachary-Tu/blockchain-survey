# M1 数据存储、时钟、设备与导出说明

## 1. 事实来源与数据边界

正式网站以 Cloudflare D1 关系型数据库为唯一事实来源。浏览器 `localStorage` 只保留不透明 session 恢复指针；参与者完成页下载的 CSV/JSON 只是本次回答的便利副本，不含完整 assignment、server exposure 或 Agent attempt 审计链，不能替代研究者导出。

实验库只保存研究编码和技术/作答数据，属于编码化/假名化数据，不称为完全匿名数据。姓名、邮箱、补偿信息、真实同意、筛选结果、联系信息和撤回状态必须留在独立受限账本，并只用机构批准的不透明标识或 token hash 连接。

## 2. 关系表

### `m1_pair_assignments`、`m1_launch_tokens`、`m1_pair_slots`

- assignment 锁定 pair、2×6 分配 cell、protocol/cohort/build、stimulus/event hash、allocation mode、cohort Agent-profile SHA-256、primary Chrome major、deployment ID 与 deployment fingerprint；
- 每个 pair 生成 Human 与 Agent 两个 256-bit opaque token；数据库只保存不可逆 token SHA-256；
- token 领取后同时保存 `claimed_session_id` 与 `claimed_at`。若领取前终止，研究者 API 只接受 `declined-before-start`、`no-show-expired`、`withdrawn-before-start`、`technical-cancel-before-start` 四个 disposition，并原子写入 `terminal_disposition`、`terminal_at=revoked_at`；它不会创建 session；
- slot 对 pair × actor × replicate、session 与 token 设唯一约束，阻止同一 primary slot 被替换；
- 当前 balanced Stage-A cohort 硬性上限为 12 pairs；quota-manual 和其他 cohort 不进入 primary comparison。

### `experiment_sessions`

每次成功领取 token 后新增一行，主要字段包括；因此 `started` 分母只统计这里真实存在的 canonical session，未领取而 terminal 的 allocation 不进入该分母：

- `id`、`actor_type`、`participant_code`、`expertise`、`experimental_arm`、`protocol_version`；
- `status`、`started_at`、`practice_completed_at`、`completed_at`、`termination_code`；
- `study_config_json`：pair、condition、schedule、42-step plan、cohort/build、stimulus/event hash、Agent-profile hash、primary Chrome major、deployment ID/fingerprint、Human consent-confirmation version/time、英文筛选-confirmation version/time、设备预检结果与 Agent metadata；
- 设备环境：`device_type`、screen/viewport、DPR、platform、language、timezone、pointer、touch 与 orientation；
- strict M1 仅持久化粗粒度 browser-major/OS 摘要，不保存 raw User-Agent。

Human 网站 checkbox 只记录“机构批准的外部同意流程”和 `m1-en-financial-reading-v1` 英文金融新闻阅读筛选已经在流程外完成的操作确认。实验库不保存筛选题目、分数或 cutoff；这些材料、screen-out 数量、重测规则和排除依据必须在受限招募账本与预注册材料中冻结。

### `experiment_expected_steps`

服务端在 session 创建时按冻结 schedule 与 condition 物化 42 个 canonical step。每行包含 step/trial 顺序、资产、任务、指标、频率、刻度、窗口和 disclosure tuple。提交只能匹配当前下一步，完成不能只凭“行数等于 42”。

### `experiment_step_exposures`

每个 formal step 恰有一个不可变 server `started_at`，唯一键为 `(session_id, step_order)`。共同练习完成且 step 恰为当前 canonical next step 时才能创建；页面确认成功前不显示刺激。completion 要求 42/42 exposure。

### `modular_responses`

每个“session × trial × disclosure”一行，正常完成为 42 行。主要保存：

- canonical tuple 与实际 disclosure state/stimulus window；
- 两条边界、服务器读取的上一轮边界、两个连续不确定区间；
- 1–5 信息影响评分和“有意保持不变”确认；
- `elapsed_ms`、`active_elapsed_ms`、`page_hidden_ms`、首次移动/范围调整时间与调整次数；
- 客户端 ISO 时间、提交时 viewport/orientation 与逐题 protocol deviation；
- 服务器 `created_at`。

唯一键 `(session_id, trial_id, disclosure_index)` 防止重复行；同一步相同科学答案为幂等重试，不同答案重写返回冲突。

### `agent_run_attempts`

只用于 Agent。每个 ledger row 保存 step/attempt 序号、模型 API 序号、机械动作 ID/重试序号、当前与源 request ID、controller/version、prompt/runtime-request/screenshot/output/action-trace SHA-256、参数、可用时的 token 数、动作数、状态、错误码与时间戳。

服务器锁定连续 attempt、相同模型重试输入、机械重试与原模型输出绑定、每页动作/重试上限和 terminal 状态。最终 `submitted` row 与 response ID 一一关联，并保存服务器独立计算的 scientific-response SHA-256。terminal attempt 与 session abort 在同一数据库 batch 写入；幂等重试也会修复遗留的 active terminal session。

D1 不保存 API key、隐藏思维链或原始截图。为了让 hash 可验证，原始截图、非思维链模型可见输出、完整 runtime request、动作轨迹及其 retention/access policy 必须保存在外部受限 run-artifact store，并由 manifest 与 session/hash 连接。

## 3. 时钟层级

协议裁决以服务器时间为准：

- 页面 180 秒：`server response received time − experiment_step_exposures.started_at`；网络 acknowledgement 往返也计入；标签页隐藏不会暂停；
- 全程 120 分钟：从 canonical `experiment_sessions.started_at` 起；
- 写 attempt、写 response、创建下一 exposure 与 completion 都执行 server clock guard；
- 研究导出会把遗留的超时 active strict-M1 session 归类为 aborted。

客户端字段只用于行为分析和异常交叉检查：

- `elapsed_ms`：浏览器进入当前页面到点击提交的墙钟；
- `page_hidden_ms`：页面隐藏累计时间；
- `active_elapsed_ms = elapsed_ms - page_hidden_ms`；
- `reveal_read_ms`：进入页面至第一次边界或范围操作；
- `first_move_ms` / `first_uncertainty_ms`：首次对应操作；
- `client_started_at` / `client_submitted_at`：客户端自报 ISO 时间。

客户端时钟和 Agent attempt 时间戳都不能替代 server exposure/run clock。SQLite server timestamps 具有约一秒量化，临界页必须在质量报告中标识；正式分析应优先使用导出的 `server_page_elapsed_ms` 判断协议时间。

## 4. Session 生命周期与终止码

- `active`：session 已创建，允许继续当前 canonical step；
- `complete`：精确通过 42-step 完整性检查；
- `aborted`：显式停止、超时、controller/网络/操作失败或协议错误。

冻结终止码：

- 人员/流程：`PARTICIPANT_EXIT`、`PARTICIPANT_WITHDRAWAL`、`OPERATOR_ABORT`；
- 外部故障：`CONTROLLER_CRASH`、`NETWORK_FAILURE`；
- 时钟：`FORMAL_PAGE_TIME_LIMIT`、`RUN_TIME_LIMIT_EXCEEDED`、`SERVER_PAGE_CLOCK_INVALID`；
- Agent：`AGENT_CONTROLLER_ABORT`、`MODEL_API_RETRY_LIMIT`、`MECHANICAL_RETRY_LIMIT`、`ATTEMPT_PROTOCOL_*`。

“停止作答”写入 `PARTICIPANT_EXIT`，不自动等于撤回或删除。`PARTICIPANT_WITHDRAWAL` 只由机构批准的外部撤回流程解释；当前数据库不会自动删除记录。直接关闭浏览器可能暂时保留为 active，直到后续请求或研究导出执行超时归类；此时 `completed_at` 是系统归类时间，不是精确离开页面时间。已提交的 partial responses 默认按获批计划保留；撤回后的删除、封存或分析排除必须由外部 ledger 生成 exclusion manifest，并覆盖导出、备份和衍生数据规则。

Stage-A 的 Agent abort 指标冻结为：所有 `status=aborted` 的 R-PRIMARY Agent session / 所有 started R-PRIMARY Agent session；终止码只作原因分层，不允许事后从分子中挑选删除。

## 5. 隐私与设备控制

系统不主动读取真实姓名、邮箱、钱包、精确位置、摄像头、麦克风或页面外浏览内容。Strict M1 请求中的 raw User-Agent 只瞬时解析为 browser-major/OS 大类；D1 和标准研究 CSV 不保留原字符串。历史/开发记录、托管访问日志和备份仍须在真实招募前按机构批准的数据管理计划审计。

Primary pair 固定 1440×900 viewport、DPR 1、landscape、fine pointer、100% zoom 和部署指定的 Chrome major。服务端以瞬时 UA reduction 硬校验 Chrome major，并校验 viewport/DPR/pointer/orientation；100% zoom 仍需现场清单。设备不合格时 token 不被消耗。手机和平板只能进入另行标记的外部效度队列，不能与 primary M1 合并。

## 6. 研究者导出

登录邮箱必须存在于服务器 `RESEARCHER_EMAILS` allowlist。访问 `/research/results` 可下载 UTF-8 BOM CSV：

1. `scope=m1-comparison&table=allocations`：assignment、两侧 token hash、`token_created_at`、`token_claimed_at`、claimed session、`terminal_disposition`、`terminal_at`、`revoked_at` 与冻结 manifest 字段；
2. `scope=m1-comparison&table=sessions`：每个 session 一行，含未完成/aborted、设备、筛选/profile 与 termination；
3. `scope=m1-comparison`：每个正式 response 一行；
4. `scope=m1-comparison&table=step-exposures`：server page clock、response 连接与 authoritative elapsed；
5. `scope=m1-comparison&table=agent-attempts`：完整 Agent retry/action/hash ledger。

五表必须以 `pair_id`、`session_id`、`step_order` 和 `response_id` 连接；不能只下载逐题表后把 42 行当成 42 个独立样本。每张表同时导出 `deployment_id` 与 `deployment_fingerprint_sha256`，所有正式行必须与 allocation、签名 receipt 和归档部署 bundle 的单一身份相同。正式 Stage-A v3 审计不采信导出中的 `primary_protocol_eligible`、`response_protocol_eligible` 或 `g0_exact_default_anchor` 便利字段，而是从五表原始字段重建 12 个分配 cell、24 个 primary allocation slot、实际创建的 sessions、42-step canonical plan、边界/index/ratio/date、范围、previous-boundary 连续性、设备偏离、Human exposure 及 Agent attempt/link/hash 完整性。开放未领取 allocation 使审计保持 `NOT_EVALUABLE`；合法 pre-start terminal allocation 关闭 slot 但不伪造 session。

五表必须来自同一个已关闭数据库 snapshot。生产导出/审计服务使用独立受控的 `M1_AUDIT_RECEIPT_HMAC_SECRET` 对 v2 collection-close/export receipt 签名，绑定 deployment ID/fingerprint、关闭时间、snapshot、五个文件 hash 与固定顺序 bundle hash；关闭时间不得早于 allocation claim/terminal 或五表中其他最后一条 authoritative write。机构治理或独立审核方再以不同的 `M1_AUDIT_EVIDENCE_HMAC_SECRET` 对 external-evidence root 签名。两个密钥均至少 32 bytes、必须不同且不得写入 Git、CSV 或普通配置；缺少、相同或签名不符均不能产生 GO。外部 evidence root 逐项绑定伦理/同意/DMP/英文筛选/撤回、raw-UA 和泄漏审计、真实事件源 archive、source/deployment manifest 与实际部署 bytes、controller、完整 runtime prompt、浏览器、每个已领取 R-PRIMARY allocation 的 run manifest，以及所有实际 runtime request、完整 1440×900 non-interlaced PNG、模型可见输出和坐标动作轨迹。合法 pre-start terminal Agent allocation 不应有 run manifest。CLI 会读取这些受限工件并复算 hash，而非只相信清单文字。

当前仓库提供 v3 verifier 与 CLI，但不包含正式生产环境中的原子 collection-close/receipt 签名服务、机构侧 evidence signer、真实部署清单或 Agent 原始工件仓。它们必须由相互分离的受控服务/人员在真实采集前完成。HMAC 适合技术先导的可实施可信根；确认性部署宜进一步使用 KMS 或非对称签名，并在可用时保存模型提供方 execution receipt。原始数据、密钥和受限 Agent 工件不得提交到 Git。

### 6.1 默认关闭的采集开关

生产环境默认不接受正式研究写入。只有 `M1_STAGE_A_PRIMARY_COLLECTION_ENABLED=true` 与 `M1_HUMAN_COLLECTION_ENABLED=true` 且 `M1_DEVELOPMENT_PILOT_ENABLED=false` 时，冻结 deployment ID/fingerprint 下的 balanced primary pair 才可创建和推进；研究者写入 pre-start terminal disposition 也执行相同 collection gate 与 allocation deployment-identity 校验。开发诊断 `quota-manual` 必须反向要求 development-pilot 开关为 true，并始终排除在 Stage-A primary 导出/审计之外。停止采集前先终结所有未领取 allocation；关闭 primary/Human 开关会阻止新的 disposition 以及既有 strict session 的 exposure、attempt、response 和 completion 写入（安全 abort 例外）；之后还必须由外部受控服务执行持久化、原子的 collection-close、snapshot 与双签名流程。

## 7. 招募前硬门槛

任何真实 Human Stage A/B/确认性活动前，必须具备：适用机构伦理批准或书面豁免、机构批准的完整同意材料、英文筛选工具/阈值/重测规则、保存期限、访问人员、编码生成方式、外部招募/撤回账本与删除/封存流程、raw-UA/日志/备份审计。网站 checkbox 不能替代这些材料。

Paired Agent Stage A 还需：可执行 controller、完整 runtime prompt package、冻结模型/API、Chrome runtime、逐 run 原始工件及其双向完整清单、真实 source/deployment/bundle manifest，以及由两个独立受控密钥签名的 collection/export receipt 和 external-evidence root。当前仓库具备网页/API/数据库、五表 normalizer、v3 evidence verifier 与 hash 契约，但不包含生产签名服务、受控密钥、真实部署证明或外部原始工件。
