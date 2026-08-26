# M1 Human–Agent 同构主实验：冻结方法与实验架构

版本：`m1-isomorphic-v1`

状态：`Stage-A implementation frozen / Stage-B specification only`。当前 build 只启用阶段 A 的 12-pair 分配上限；阶段 B 尚未在启动器中开放，必须在阶段 A 获得完整 GO 后使用新的 cohort、build、preregistration、analysis-set 与 36-pair cap 单独实现。任何真实 Human（包括阶段 A、阶段 B 与后续确认性研究）的接触、招募或研究数据采集，均须事先取得适用机构伦理审查的批准或书面豁免，并使用经该机构批准的完整知情同意材料；研究团队不得自行把 pilot 认定为免审。网站 checkbox 仅是外部同意已完成的操作确认时间，不能构成或替代知情同意。paired Agent 阶段 A 前仍需实现并冻结外部 controller 与实际运行时完整 prompt package。
正式入口：Human `/m1`；Agent `/agent`；研究者配对启动器 `/research/m1-launch`

## 1. 研究问题与可识别目标

核心问题是：同一个判断主体在逐层获得时间序列的语义信息时，阶段边界会发生多大、什么方向的修正；这种“上下文弹性”在人类与多模态 Agent 之间是否不同。

主比较不把 Agent 视为获得结构化数据的算法。Agent 必须像人类一样，只看到当前浏览器页面，通过同一图表、滑条、旋钮和提交按钮完成整个流程。因此研究对象严格表述为：

> Human participant 与“模型 + 视觉输入 + 浏览器控制器”系统，在同构页面条件下的阶段判断差异。

主实验不能把固定披露顺序中出现的全部自然漂移都归因于语义信息。为此加入无新增信息重复控制条件，估计练习、疲劳、时间流逝、上一答案锚定和机械复测带来的变化。

## 2. 实验设计

核心设计为 `2 × 2` 组间因素，并在资产、轮次和边界上重复测量：

| 因素 | 水平 | 类型 |
|---|---|---|
| Actor | Human / multimodal Agent | pair 内配对比较（两种主体） |
| Information condition | staged / repeat-control | pair 间随机 |
| Judgment round | 1–7 | 组内 |
| Asset | BTC / ETH / SOL / BNB / XRP / DOGE | 组内 |
| Boundary | boundary 1 / boundary 2 | 组内 |

每个正式会话冻结为：T2 固定三阶段、价格序列、周频、线性刻度、完整可用数据窗口、两个分界点和两个连续不确定范围。每个会话有 `7 × 6 = 42` 个正式判断。

### 2.1 Pilot 阶段与样本

- **阶段 A：技术 pilot。** 固定 `12 pairs`，12 个 `information condition × Williams schedule` cell 各 1 pair。目标是验证页面流程、数据完整性、Agent 控制链、设备合规、疲劳和默认锚点行为，不进行确认性假设检验。
- **阶段 B：方差 pilot（当前仅为规范，未启用）。** 只有阶段 A 达到第 12 节全部 Go 条件后才可另建 build 启动；固定 `36 pairs`，每个 cell 3 pairs。目标是估计 pair、session、session × asset 与 round 方差，并为确认性样本量模拟提供输入。
- 阶段 A 与阶段 B 分开报告。任何页面、刺激、prompt、controller、设备协议、主要 estimand 或失败规则发生修改后，修改前数据均不得与修改后数据合并；确认性样本也不与 pilot 数据合并。
- 一个 primary pair 严格包含 `1 Human + 1 R-PRIMARY Agent run`。R-PRIMARY 使用同一个冻结的模型 snapshot、完整 prompt、controller 和浏览器环境。额外模型或额外 stochastic replicates 只能进入另行标记的诊断/敏感性队列，不进入 primary pair 分析。
- Human 纳入标准冻结为：年满 18 岁、中文熟练、正常或矫正后视力、首次参加本项目，在启动前通过桌面设备预检，并通过研究团队预先实施的英文金融新闻阅读筛选 `m1-en-financial-reading-v1`。这是因为冻结事件刺激为英文；因此当前目标总体是能独立阅读简短英文金融事件的中文使用者，结果不得外推为所有中文人群。排除标准仅使用预注册的同意撤回、重复参与、未满足纳入条件或技术/协议偏离规则，不根据其边界答案排除。
- Human 专业经验按 `none / casual / active / professional` 记录。阶段 A 只分层描述，不据此重分配或事后排除；若阶段 B 启用，预定在每个 condition × schedule cell 中各纳入一名 `none`、`casual`、`active`，`professional` 另作诊断队列且不进入 primary 36-pair 分析。若招募可行性要求改变该配额，必须更换 Stage-B 规范版本并在看见 Actor 效应前冻结。

### 2.1.1 Human 招募与伦理前置门槛

- 阶段 A/B 只要纳入真实 Human，均属于本协议的 Human 研究阶段；伦理批准/书面豁免与机构批准的完整知情同意材料是招募前门槛，不是阶段 A 完成后的 GO 条件。未取得机构书面决定前，只允许使用合成数据或不保留、不分析为研究数据的开发测试；研究团队成员的真实作答若会被保留或用于研究判断，同样不能自动视为豁免。
- 研究目的、流程、风险、收益、补偿、隐私、数据使用、退出/撤回方式与研究联系渠道必须在网站之外的机构批准材料中完整呈现。网站只记录“外部同意流程已完成”的操作确认时间；该确认不等于同意本身。真实同意版本、同意时间、撤回状态与必要联系信息保存在独立、受限的招募账本中，并仅以 opaque token hash 与实验记录连接。
- 网站数据库中的记录属于编码化/假名化研究数据，不应称为完全匿名数据；研究 CSV 不包含真实身份或招募账本。
- 英文筛选同样在网站之外完成。招募前须冻结筛选题目、通过阈值、重测规则、screen-out 计数与记录保存方式；网页只保存 `humanLanguageScreeningVersion` 与操作确认时间，不能把 checkbox 当作客观能力测验。

### 2.2 信息条件

Staged condition：

1. G0：只显示匿名曲线；
2. GI1：增加序列类型；
3. GI2：增加真实时间轴、USD 单位、周频、线性刻度、精确观测数与冻结的价格聚合/指标定义；
4. DI1：增加资产名称与代码；
5. DI2：增加冻结的中性资产介绍；
6. DI3：增加由 priority 1–2 规则预选的“事件信息（一）”，每币最多 10 个；参与者不看到 priority 编码或“核心”标签；
7. DI4：增加由 priority 3–5 规则预选的“事件信息（二）”，每币最多新增 10 个；参与者不看到 priority 编码或“补充”标签。

Repeat-control condition：七轮均保持 G0 可见状态；页面数量、提交次数、前一轮虚线、休息页和总体时长结构与 staged 相同。它是 `retest/no-new-information control`，并不是文本阅读负荷完全匹配的安慰剂。

### 2.3 会话配对与顺序

研究者启动器请求服务端在 `2 information conditions × 6 Williams schedules` 的 12 个格子中做最小格优先、并列格由数据库 `random()` 打破平局的平衡分配；不把该实现称为密码学随机。服务端生成 Human 与 Agent 两个 256-bit opaque token；受试者 URL 不包含 `pair_id`、`schedule_id`、`information_condition` 或研究编码。token 固定 actor、pair、研究编码和 replicate，并在首次成功创建后绑定 session；重复请求只幂等恢复同一 session。若一个 slot 在 session 创建前终止，获授权研究者必须通过 `PATCH /api/m1-launches` 写入 allocation-level disposition：`declined-before-start`、`no-show-expired`、`withdrawn-before-start` 或 `technical-cancel-before-start`。服务端在同一写入中设置 `terminal_at=revoked_at` 并使 token 失效，不创建伪 session；已领取 token、部分字段或自由文本原因均被拒绝。

`m1_pair_assignments` 以数据库主键原子锁定 pair 的 protocol、schedule、condition、刺激 hash、事件 hash、cohort-level Agent profile SHA-256、primary Chrome major、deployment ID 与 deployment fingerprint；`m1_pair_slots` 对 Human primary slot、Agent replicate slot、session 与 launch token 设置唯一约束。没有部署环境中的 `M1_AGENT_PROFILE_SHA256`、`M1_PRIMARY_CHROME_MAJOR`、`M1_DEPLOYMENT_ID` 与 `M1_DEPLOYMENT_FINGERPRINT_SHA256`，服务端拒绝创建 balanced primary pair。五表中的 assignment/session/response/exposure/attempt 必须都能回连同一 deployment identity，receipt 和部署工件也必须逐项一致。

所有采集开关默认关闭。正式 Stage A 只能在受控部署中显式设置 `M1_STAGE_A_PRIMARY_COLLECTION_ENABLED=true`、`M1_HUMAN_COLLECTION_ENABLED=true`、`M1_DEVELOPMENT_PILOT_ENABLED=false` 后创建/推进 primary 会话或写入 pre-start terminal disposition；每次 disposition 写入还必须匹配 allocation 冻结的 deployment identity。`quota-manual` 只在 development-pilot 开关显式为 true 时可用；它既不能与正式部署同时开放，也不进入 primary 样本。达到冻结停止点前，研究团队先把所有尚未领取的 slot 明确归为上述某个合法 disposition；再关闭 primary/Human 开关，使新 token、领取、pre-start disposition、exposure、attempt、response 与 completion 写入全部 fail closed；显式 session abort 仍保留以便安全终止。随后由仓库外受控服务原子关闭数据库 snapshot、导出五表并签 receipt。环境开关不是持久化 collection-close latch，也不能替代该服务。

六种资产使用六行 Williams 平衡顺序：

```text
W1  0,1,5,2,4,3
W2  1,2,0,3,5,4
W3  2,3,1,4,0,5
W4  3,4,2,5,1,0
W5  4,5,3,0,2,1
W6  5,0,4,1,3,2
```

资产顺序在同一会话的七轮中保持不变，以便恢复该资产上一轮的边界；不同会话在六种 schedule 中平衡。内部 trial ID 使用 `m1-sXX-tXX` 不透明编号，不编码币名、指标、分辨率、刻度或窗口。

正式招募仍需报告 12 个 cell 的实际分配、启动、完成与退出数量。平衡随机控制分配概率，但不能消除 token 发出后未启动或未完成造成的不平衡。

随机化与报告以 pair 为单位。阶段 A 和阶段 B 使用不同的 cohort 标识与冻结 build/controller/prompt 清单；研究者不得因看到某个 Human 或 Agent 的答案而重发 token、替换 run 或改变 cell。

## 3. Human–Agent 同构规范

Human 的机构批准知情同意在网站之外完成；网页 checkbox 只确认该外部流程已经完成，不提供、构成或替代知情同意。真正的同意版本、时间与撤回状态保存在独立受限招募账本。Agent 的可复现元数据也在共同任务前登记；模型 persistent context 明确从共同任务说明开始。从该页起，两类主体使用同一个 `ExperimentModular` 组件、同文说明和同一个状态机：

```text
主体元数据/同意
→ 共同说明
→ 共同合成练习（不计入分析）
→ 轮次转场
→ 6 个连续单曲线页面
→ 中性休息页
→ 下一轮
→ 42 个正式判断完成
```

“相同点击流程”操作化为相同页面状态、可见信息、控件、验证规则、决策节点、提交节点和不可返回规则；不要求 Human 与 Agent 产生完全相同数量的底层 pointer events。

两类主体都使用：

- 同一个交互式 SVG 图表；
- 同样的两个边界滑条；
- 同样的连续不确定范围旋钮，半宽 0.5%–20%，步长 0.5% 时间窗；
- 同样的 1–5 信息状态影响评分；
- 同样的“有意保持不变”确认；
- 同样的上一轮虚线；
- 同样的逐题提交和服务器验证；
- 同样的中性休息页。

固定 M1 不收集 cue tags、自由文本理由或隐藏思维链。原 JSON Agent 控制台仅保留在 `/agent/console`，属于扩展诊断，不进入同构主比较。

## 4. Agent 执行协议

主 Agent 条件采用 persistent context：一个模型会话连续完成共同说明、练习和 42 个正式步骤。每个 primary pair 只允许一个冻结的 `R-PRIMARY` run；其输出不能从多个随机种子、重试或候选答案中择优。允许的输入与动作仅为：

- 当前浏览器截图；
- 坐标点击、拖动、滚动；
- 页面自然显示的前序答案虚线和进度。

禁止：DOM、accessibility tree、页面源码、网络请求、刺激 JSON、数据库、OCR 后的隐藏字段、外部搜索、行情网站、代码执行和 Human 答案。

每次 Agent run 冻结并记录：provider、完整模型 snapshot、API 版本、controller 版本及 artifact SHA-256、实际运行时完整 prompt package 的 SHA-256、context policy、image detail、temperature、top_p、seed、reasoning effort、replicate ID、视口、DPR、浏览器环境和设备环境。以上字段组成 canonical cohort Agent profile；其 SHA-256 与 primary Chrome major 写入 assignment，Agent session 创建时重新计算并硬校验。仓库中的 `public/data/m1-agent-system-prompt-v1.txt` 是另一个已 hash 的 system-prompt 组件；D1 `promptSha256` 校验该组件，`runtimePromptPackageSha256` 校验组装后的完整 request package。controller 与 prompt package 的版本化原文仍必须保存在外部冻结运行清单，并与 launch token hash 和 run ID 连接；只有 hash 而无原始工件不足以复现 run。

外部控制器必须向 `/api/agent-attempts` 写入每一步的完整 canonical runtime-request hash、截图/输出/action-trace hash、当前与源 request ID、模型 API 序号、机械动作 ID/重试序号、token 数（provider 可用时记录）、工具调用数、错误与重试状态。D1 不保存 API key、原始截图或模型隐藏思维链。为使 hash 可复核，受限外部工件库必须保存有期限的原始截图、非思维链模型可见输出、动作轨迹与完整 request package，并用 manifest 连接这些原文与 D1 hash；只保存 hash 不能独立验证 run。

在主 Agent arm 中这不是可选日志：完成共同练习后，每个正式 step 必须先取得不可变的服务器 exposure clock，再写入且只能有一个最终 `submitted` attempt；该 attempt 的 `stepOrder` 必须等于数据库中已保存 canonical response 的数量，因此只能提交当前下一步；`model_request_id` 在 session 内唯一。同页所有 ledger row 的 `startedAt` 表示共同 page start，不表示每次 API attempt 的开始；`completedAt` 表示该 row 完成。submitted attempt 的 `errorCode` 必须为空。页面答案保存后，服务器将 attempt 一一绑定到 `modular_response.id`，并对最终点击形成的科学答案计算独立 `response_sha256`。completion 会逐步重算并验证 42 个 exposure、42 个响应、42 个链接与 hash。机械重试和错误 attempt 可保留，但不能替代最终 submitted attempt。

网站仓库冻结的是 runner contract、页面、API、system-prompt 组件和审计链；实际执行“截图 → 完整冻结 prompt package 下的模型调用 → 坐标动作”的外部 controller，以及它实际注入的完整 prompt package，尚未作为可执行工件包含在本仓库，必须单独实现、版本化、归档并通过端到端验证。这是启动 paired Agent 阶段 A 的外部 P0 阻断项；在它们冻结前，只能做不计入阶段 A 的研究者监督 feasibility run，不能声称已具备无人值守、可复现的 Agent pilot 采样系统。

Page-reset visual、visual-direct 和 structured-direct 只能作为敏感性/诊断条件，必须与主同构结果分开报告。

## 5. 刺激、盲化与事件

刺激包：`research-stimuli-modular-v8`

刺激文件 SHA-256：`c941b59446774c62e848f5fc3431d555a05ab07e6ec416b489c4bc98d014074e`

事件源 SHA-256：`cc9d1f5d06fa2aeb447c57abeb1c42c560195967d33e7a4f90629333c3bc9438`

盲化要求：

- G0/GI1 不显示真实日期、频率、观测数、单位、资产或事件；
- 未披露的 condition chips 不出现字段名，只不渲染；
- 披露进度中未来项目仅显示“？”；
- 分界编辑器在 GI2 前只显示相对位置；
- Agent 不获得包含资产身份的 task ID；
- 中性休息页不显示边界轨迹、位移、不确定范围、改变数量或表现反馈。

DI3/DI4 同时增加事件位置标线与文字描述，所以估计的是“事件标记 + 事件语义”的联合效应。所有事件使用同一线型、颜色、圆点与文字层级；priority 只用于预先选入 DI3/DI4，不对参与者显示，避免把事件语义与显式等级/视觉显著性混在一起。冻结事件标题与简介均为英文，因此 Human 需通过英文金融新闻阅读筛选；若以后改为经双人校对/回译的中文刺激，必须重算 event/stimulus hash、更换 build 与 cohort，不能和当前数据合并。若要识别纯语义效应，还需另设错位事件或 sham event 条件。

## 6. 响应变量

令 `b[s,a,k,l]` 为主体/运行 `s`、资产 `a`、边界 `k`、轮次 `l` 的标准化位置，令 `Δb[l]=b[l]-b[l-1]`，其中 `l=1,...,6` 对应 G0 后六次相邻披露转移。

唯一全局主要 estimand 为经重复控制调整后的 Human–Agent **绝对三重差分**。定义 `m[q,c,l,a,k]=E(|Δb| | Actor=q, condition=c, transition=l, asset=a, boundary=k)`，则：

```text
theta_abs = (1 / 72) * sum(l=1..6, a=1..6, k=1..2) [
  { m[Agent, staged, l, a, k] - m[Agent, repeat-control, l, a, k] }
  - { m[Human, staged, l, a, k] - m[Human, repeat-control, l, a, k] }
]
```

数据库与研究导出把 `b` 固定保存到小数点后六位。为避免浮点容差成为可调分析选择，主要 hurdle 先定义整数化比例 `B = round(10^6 × b)`，再定义比例尺度移动指示 `Z_b = I(|B[l]-B[l-1]| >= 1)`；这正是存储精度下 `I(|Δb| > 0)` 的确定性实现，不另设事后容差。

这 72 个 `transition × asset × boundary` cell 严格等权；不得按资产长度、观测点数量、方差、完成样本数或显著性重新加权。正值表示 staged 相对 repeat-control 所增加的绝对边界修正，在 Agent 中大于 Human。以下为关键次要或探索性结果，而不是并列“主要终点”：

1. 有符号位移：`Δb = b[l] - b[l-1]`；
2. 绝对位移：`|Δb|`；
3. 离散观测网格修正概率：`I(|Δindex| >= 1)`；只要边界跨越原始刺激观测网格至少一个索引即记为 1，未跨索引（包括 `b` 已发生但不足一格的位移）记为 0。它是次要离散敏感性结果，不是主要 hurdle 的零值指示；
4. 相对 G0 的累计位移：`b[l] - b[0]`；
5. 把上式中的 `|Δb|` 替换为 `Δb` 得到的 signed triple difference；它只用于方向性次要分析；
6. Context Elasticity 的 Actor/round 分层描述量。

不确定范围结果：半宽 `h`、`Δh`、前一轮中心是否落在当前区间、当前中心是否落在前一区间，以及区间 Jaccard 重叠率 `length(I_l ∩ I_{l-1}) / length(I_l ∪ I_{l-1})`。此范围是“可接受定位区间”，不是概率置信区间。

次要结果：1–5 信息状态影响评分、事件吸引效应、Human/Agent 群体中心距离、逐层收敛/发散、会话完成率和协议偏离率。事件吸引只在 DI2→DI3 与 DI3→DI4 定义：以新增事件中距上一轮边界最近者 `e*`（并列取较早日期）为目标，`A=|b_prev-e*|-|b_current-e*|`，正值表示向事件靠近；该层没有新增事件时记为缺失而不是 0。群体中心距离为同一 condition × round × asset × boundary 中 Agent 与 Human 边界均值之绝对差。配对收敛量为 `|b_A,l-b_H,l|-|b_A,l-1-b_H,l-1|`，负值表示收敛。影响评分不能替代实际边界位移。

响应时间用于 Human 质量控制和 Agent 系统性能记录；Agent API/控制器延迟不能解释为与人类认知时间相同的心理量。

## 7. 分析集、估计与统计模型

### 7.1 流程集合与缺失

所有流程集合按 actor 分开计数，并按阶段、condition 与 Williams schedule cell 报告：

- **invitation set：** 已在冻结分配账本生成 primary slot/token 的记录，包括从未同意或从未启动者；它是招募与失败流程分母，不称为 ITT；
- **consented set：** Human 在外部招募账本中具有有效、未撤回的机构批准知情同意；网站的操作确认时间只能用于流程核对，不能单独把记录归入 consented set。Agent 则为冻结 R-PRIMARY run 已获启动授权；
- **started set：** 服务端已成功创建 canonical session；仅有 allocation-level pre-start terminal disposition 而没有 session 的 slot 不进入 started 分母；
- **available set：** started session 至少有 1 条通过服务器验证的正式 response；
- **complete set：** session 状态 complete 且恰有 42 条 canonical response；Agent 还必须有 42 个唯一 submitted attempts、42 个 attempt-response links 与 42 个服务器验证 hash；
- **protocol-eligible set：** 满足预注册纳入标准，Human 通过桌面预检，并且会话初始及全部已提交 response 的设备/交互遥测均无 protocol deviation。完整性失败不能因统计纳入而豁免。

主分析集是 **complete matched pairs**：同一 primary pair 的 Human 与唯一 R-PRIMARY Agent run 均进入 complete set。不得用同一 pair 内后来成功的 run 替换失败 run。`all-available` 是预注册敏感性分析，使用所有 available session 的合法观测并保留相同的固定/随机层级；另报告 protocol-eligible complete matched pairs 敏感性分析。all-available 只能在可忽略缺失假设下辅助解释；未启动、退出、技术失败或 controller abort 很可能是非随机缺失，因此它不能恢复随机化、不能消除选择偏差，也不能替代 complete-pair 主结果。主分析不作临时单次插补；缺失流程以集合计数、原因和时间点透明报告。

### 7.2 主要与次要估计

主要绝对更新先用 repeat-control 调整无新增语义时的漂移，再比较 actor：

```text
AbsSemanticUpdate(actor, transition, asset, boundary)
  = E(|Δb| | staged, actor, transition, asset, boundary)
  - E(|Δb| | repeat-control, actor, transition, asset, boundary)

AbsHumanAgentEffect(transition, asset, boundary)
  = AbsSemanticUpdate(agent, transition, asset, boundary)
  - AbsSemanticUpdate(human, transition, asset, boundary)
```

`theta_abs` 是上述 cell effect 的 72-cell 等权平均。signed counterpart 使用相同式子但以 `Δb` 取代 `|Δb|`，仅为次要方向分析。

### 7.3 模型与不确定性

主要模型使用 complete matched pairs，以 pair 作为分配与 cluster 单位。固定效应冻结为 `Actor × InformationCondition × Transition + BoundaryNumber + AssetSerialPosition + Schedule + Asset`；asset 是固定刺激效应，不把这六个有目的选取资产当作资产总体的随机样本。随机结构为 pair 随机截距、session/run 嵌套于 pair 的随机截距与 transition slope，以及 session/run × asset 随机截距。由模型标准化预测得到每个 cell 的边际均值，再按 72 cell 等权形成 `theta_abs`。

绝对位移的主模型冻结为 two-part hurdle：第一部分对比例尺度的 `Z_b = I(|Δb|>0)`（按上述六位小数整数化规则实现）使用混合效应 logistic，第二部分只在 `Z_b=1` 时对 `|Δb|` 使用 lognormal 混合模型；两部分合成为无条件 `E(|Δb|)`。主要 95% 区间与检验使用 pair-cluster uncertainty；确认性阶段优先使用按 12 个 allocation cell 分层、以 pair 为重抽样单位的 5,000 次 bootstrap，并以 pair-cluster CR2 sandwich 区间作敏感性分析。阶段 A/B 只报告可行性、方差与区间，不将小样本 p 值解释为确认性证据。

多重比较冻结为：确认性研究只有 `theta_abs` 一个 primary estimand，以双侧 `α=.05` 检验；若 primary 未通过，所有关键次要检验只作描述。若通过，signed triple difference、离散观测网格移动概率 triple difference 与不确定半宽 triple difference 构成一个 family，使用 Holm step-down 控制 family-wise `α=.05`。影响评分、事件吸引、群体中心距离、收敛与其他分层结果均为探索性；按预先命名 outcome family 报告 Benjamini–Hochberg `q=.10`，并同时给出未调整区间，不以探索性结果替代主要结论。阶段 A/B 不作通过/未通过式显著性解释。

- 比例尺度是否移动：`Z_b` 构成上述 hurdle 第一部分；
- 是否跨越观测网格：`I(|Δindex|>=1)` 使用独立的次要混合效应 logistic 分析；
- 有符号位移：Student-t 稳健分层模型，只作关键次要分析；
- 不确定半宽：logit 变换混合模型或 Beta 模型；
- 影响评分：有序 logistic；
- 群体距离与一致性：以 pair 为 cluster，并在 session × asset 层级保留重复测量结构。

42 行不是 42 个独立样本。Human 独立单位是参与者，Agent 独立单位是一次完整 run，随机化和主要不确定性单位是 pair；同一模型的多次运行是同一系统的 stochastic replicates，不能表述成多个不同 Agent。阶段 A 固定为 12 pairs，阶段 B 固定为 36 pairs；阶段 B 的 pair、session/run、session/run × asset 与 transition 方差只用于设计后续确认性样本量模拟。

## 8. 服务端完整性与恢复

会话创建时，服务端根据 schedule 与 condition 生成 canonical plan，并物化为 `experiment_expected_steps` 的 42 行。每次正式提交：

1. 检查 session 存在且 active，并以 canonical session 创建时间执行 120 分钟服务器 run clock；
2. 核对 trial/order/actor arm/asset/metric/resolution/scale/window/disclosure；
3. 检查当前请求恰好是下一预期 step；
4. 从数据库读取同一资产上一轮边界；
5. 拒绝伪造或过期的 previous boundaries；
6. 相同 step + 相同科学答案作为幂等重试返回；
7. 相同 step + 不同答案返回 409；
8. 每个正式 step 必须先有唯一服务器 exposure；服务器接收时间超过 180 秒即终止，客户端 `elapsed_ms` 仅作遥测与交叉审计；
9. Agent 正式响应必须已有唯一 submitted attempt；保存后服务器绑定 response ID 并写入科学答案 hash；
10. 完成时比较完整预期 tuple 集，不只比较行数；两类主体均须 42 个 exposure，Agent 还须有 42 个唯一且 hash 一致的 attempt-response links；
11. 无有效计划或预期数为 0 时禁止完成。

浏览器 localStorage 只保存一个不透明 session 指针；`GET /api/sessions?sessionId=...` 从 D1 恢复 canonical plan、已保存响应和下一步。D1 是唯一事实来源。

## 9. 失败、重试与协议偏离

- 每个正式判断页面先由服务端原子创建唯一 exposure clock，页面在确认后才显示并可交互；自服务器 `started_at` 起最多 `180 s`。客户端倒计时用于反馈，但服务端接收时间是判定依据；Agent controller 每页最多自报并由 ledger 审计 `20` 个截图、坐标点击/拖拽、滚动或短暂等待动作，正式协议不允许键盘输入。网站无法独立观察浏览器外动作，最终还须由外部 action trace manifest 复核；
- 单个机械动作未注册：最多额外重试相同动作 `2` 次，不重新调用模型，不改变目标坐标或答案；
- 模型尚未返回任何输出时的 API 故障：最多额外重试 `2` 次，必须使用完全相同截图、prompt、模型参数和 context；一旦已返回任何模型输出，该模型请求不得重采样；
- 模型已经输出但无法完成页面：不得由研究者修改或挑选更好的答案；
- 每个完整 Human session 或 Agent run 从 canonical session 创建起最多 `120 min`；超过任一页面、动作、重试或整 run 限额即记为 protocol abort；
- 页面刷新或暂时断网只能在上述限额内从最后一个合法步骤恢复，不重新回答已提交步骤；
- 不支持确定性恢复时终止原 session/run；技术失败不得在原 pair 内另选一个更好 Agent run 或替换单侧主体。固定 12-cell Stage A cohort 不增补或重启新 primary pair：失败 allocation/session 保留在其真实 invitation、started 与失败分母中。只有在本轮审计得到 `REVISE` 后，才能以新 build、cohort 和完整 12-cell 清单重做阶段 A；旧新 cohort 不得合并；
- 阶段 A、阶段 B 与任何因修订后重启的 cohort 使用独立清单，失败前后的答案不得合并。所有错误 attempt 均保留 `errorCode` 与时间戳；submitted attempt 的 `errorCode` 必须为空。

终止码采用冻结分类，不以自由文本事后归类：`PARTICIPANT_EXIT`（主动停止）、`PARTICIPANT_WITHDRAWAL`（按外部撤回流程处理）、`FORMAL_PAGE_TIME_LIMIT`、`RUN_TIME_LIMIT_EXCEEDED`、`MODEL_API_RETRY_LIMIT`、`MECHANICAL_RETRY_LIMIT`、`AGENT_CONTROLLER_ABORT` / `CONTROLLER_CRASH`、`NETWORK_FAILURE`、`OPERATOR_ABORT`、`SERVER_PAGE_CLOCK_INVALID` 与 `ATTEMPT_PROTOCOL_*`。所有 Agent `status=aborted` 的 primary run 均进入 Agent abort 分子，终止码只用于分层报告，不能挑选性删除。页面“停止”与研究撤回不是同一概念；只有外部受限账本确认撤回，才按获批数据管理计划生成排除/删除清单。

## 10. 设备、隐私与质量控制

primary pair 固定部署环境变量指定的同一 Chrome 主版本、1440×900 视口、DPR 1、100% 缩放和鼠标/视觉控制器。Human 必须在完成机构批准的外部知情同意后、正式启动前通过桌面设备与英文阅读预检；手机、平板或不合规桌面不能启动 primary session，只能进入另行标记且不与 primary pilot 合并的外部效度队列。

服务端根据已测得的 device type、viewport、DPR 与 pointer 写入 `primaryProtocolEligible` 和 `protocolDeviationCodes`；每道响应另导出 `response_protocol_eligible` 与逐题 viewport 偏离码。初始环境和 42 道响应全部合规才进入 protocol-eligible set；complete matched pairs 仍是主分析，protocol-eligible complete matched pairs 是敏感性分析。全部 invitation、consented、started、available 与 complete 记录进入流程图及相应分母，但 pre-consent invitation 不称为 ITT。服务端从请求中的 User-Agent 瞬时解析 Chrome major 并与 assignment 硬校验，但不会保存 raw 字符串；100% zoom 仍主要由现场执行清单控制，因为标准网页 API 不能可靠证明缩放值。

本网站不收集真实姓名、邮箱、钱包、精确位置、相机或麦克风；这些身份与联系字段如因招募/补偿必须存在，只能留在独立受限账本。实验库保存研究编码、预先指定的设备派生字段、页面可见/隐藏时间与逐题响应，因此属于编码化数据而非完全匿名数据。

Strict M1 新会话不持久化原始 User-Agent。服务端只在请求处理中瞬时解析浏览器主版本与操作系统大类，D1 兼容字段及标准研究 CSV 仅保留粗粒度摘要；参与者下载的 strict M1 CSV/JSON 将 raw UA 留空。若机构批准的数据管理计划确需临时保存 raw UA，必须另建与分析表分离、最小权限、带过期时间的诊断存储并部署经测试的自动清理；不能复用当前分析表。上线招募前还须审计并按获批计划处置历史/开发记录中可能存在的 raw UA，并核实托管日志与备份生命周期。

在查看 Actor 差异前预注册排除/敏感性规则：撤回、未完成、非标准设备、大量后台隐藏、极短响应、练习无法完成、机械重复坐标。Agent 对应的质量状态为控制器失败、页面状态偏离、上下文截断、工具违规和请求异常。

## 11. 解释边界

- 六种著名加密资产不能代表全部金融或区块链序列；
- 匿名形状仍可能被熟悉历史行情的 Human/Agent 识别；
- 各资产完整可用窗口起点不同；
- 固定披露顺序仍把具体内容与时间顺序绑定；重复控制不能完全匹配阅读负荷；
- 上一轮虚线会产生锚定，本实验测量的是已有判断上的修正；
- G0 两条边界预置于 1/3 与 2/3。本版本明确把任务定义为“调整共同标准化三等分起点”，并记录 `initialBoundaryPolicy=common-tertile-anchors-adjustment-v1`、`adjustmentCount`、`firstMoveMs` 与 `g0_exact_default_anchor`；“完全接受默认锚点”冻结定义为 `g0_exact_default_anchor=true`、`adjustmentCount=0` 且 `firstMoveMs=null`。论文必须按 actor 报告该比率，不能把 G0 写成完全从空白自主放置；
- DI3/DI4 是视觉标记与文字语义的联合处理；
- 当前事件文本为英文，因此语言筛选既控制混杂，也限制外部效度；它不能证明 Human 与模型具有等价英文理解能力；
- 模型服务方可能静默更新模型；
- 结果属于“模型 + 视觉 + 控制器”，不是纯语言推理能力；
- schedule 配对不等于 Human 与模型个体配对。

## 12. Pilot 与确认性 Go / No-Go

**Human recruitment gate（不参与 GO 评分）：** 伦理批准/书面豁免、机构批准的完整知情同意材料、冻结的英文金融新闻阅读筛选材料与通过阈值、screen-out 记录、外部招募/撤回账本，以及 raw-UA 最小化与标准导出验证，均须在第一名真实 Human 接触或招募前落实并留有验证记录。任一项缺失即不得启动 Human 阶段 A。

除已确认的 STOP 事件可在采集中即时优先触发外，阶段 A 只有在以下审计前置条件全部满足后才可作 GO/REVISE 判定；否则输出 `NOT_EVALUABLE`，不得因小分母比例好看而宣称 GO：恰好发出 12 个当前 cohort 的 balanced primary pairs；12 个 condition × schedule cell 各 1 pair；24 个 primary allocation slot 各自要么具有真实且 `complete`/`aborted` 的 session，要么在从未创建 session 的前提下具有合法、完整、服务器记录的 pre-start terminal disposition；尚开放的未领取 token 不是终态。Stage-A collection 已由受控 collection/export service 关闭；同一 deployment 与 snapshot 的五表 bundle 已由服务器侧独立密钥签署 v2 receipt 并通过验证，receipt 的关闭时间晚于最后一条 allocation terminal/session/response/exposure/attempt 正式写入。外部 evidence root 使用另一把机构/独立审核密钥签名，并把五表/receipt 的 deployment identity 与真实 production bundle、路由依赖和首个 primary activity 之前的部署时间绑定；其中某一 release artifact 缺失时输出 `GO_PENDING_EXTERNAL_GATES`，而不是 `NOT_EVALUABLE`。阶段 A 完成后只按以下冻结规则作一次判定：

**STOP（先修复完整性，现有数据不进入下一阶段）：** 任一标记为 complete 的 Human session 未同时达到 42/42 canonical response 与 42/42 server exposure，或任一 complete Agent run 未同时达到 42/42 canonical response、server exposure、submitted attempt、attempt-response link 与服务器 hash；任一 complete response 的边界、日期、区间或 previous-boundary 链不能从原始字段重建；任一已获服务器确认的正式答案发生数据丢失；或任一页面/截图审计发现未来披露信息泄漏。上述完整率、丢失与泄漏阈值分别为 `100%`、`0`、`0`，不允许四舍五入或豁免。

**REVISE（修改后重做新的阶段 A cohort，修改前后不得合并）：** complete matched pairs 少于 `10/12`，或任一 condition 少于 `5/6` complete matched pairs；任一 actor 的 `complete / started < 80%`；Agent 的 `all aborted R-PRIMARY / started > 10%`；任一 actor 的 complete session 总时长中位数 `>45 min` 或 empirical nearest-rank P95 `>75 min`；任一 actor 的 started primary session 中出现任何设备/逐题 protocol deviation 的比例 `>10%`；或任一 actor 在 available G0 判断中“完全接受默认锚点”的比例 `>50%`。等于 80%、10%、45 分钟、75 分钟或 50% 时通过相应阈值。还应把 invitation→started 流失、错误类型与超时页面作为描述性修订依据，但不得临时新增阈值或按边界答案择优修订。

**GO：** 无 STOP，全部 REVISE 阈值通过，且外部 release gates 全部以签名 evidence root 和实际可读取工件验证：伦理决定、批准的同意材料与数据管理计划、英文筛选协议、撤回排除流程、raw-UA 最小化审计、source/Git/deployment/JS-CSS bundle manifest、可执行 controller、实际运行时完整 prompt package、模型/API snapshot、浏览器环境，以及每个已领取 R-PRIMARY allocation 对应的唯一 run 和每个非空 runtime request、screenshot、model output、action trace。合法的 Agent pre-start terminal allocation 没有 session/run，不得为凑满 12 个 run 而伪造工件。量化阈值通过但外部证据缺失时只能输出 `GO_PENDING_EXTERNAL_GATES`，`proceedToStageB=false`。当前 build 的 Stage B 启动仍被硬性禁用；完整 GO 以后还必须建立新的 Stage-B build/cohort 才能采集 36 pairs。

阶段 A、阶段 B 以及确认性研究中的任何真实 Human 招募都需要各自适用的机构伦理批准/书面豁免、机构批准的完整知情同意与冻结数据管理计划；确认性主实验还需正式预注册、独立样本量/停止规则和冻结部署。不得报告 pilot 的确认性 p 值，也不得把阶段 A、阶段 B、修订前 cohort 或后续确认性样本合并。当前仓库尚不包含生产级 controller、运行时完整 prompt package、真实 raw run artifacts、机构 HMAC/KMS keys，亦未实现从真正关闭后的单一数据库 snapshot 生成 receipt 的生产 collection service；因此只足以支持不进入研究样本的开发验证，这些缺口仍是启动 paired Stage A 前的外部阻断项。

## 13. 报告与导出

- `scope=m1-comparison&table=allocations`：所有已分配 pair 与不可逆 token hash 账本，含 `token_created_at`、领取时间/session、`terminal_disposition`、`terminal_at`、`revoked_at` 和未启动分母；
- `scope=m1-comparison&table=sessions`：Human/Agent 配对会话与设备表；
- `scope=m1-comparison`：42 步逐题响应表；
- `scope=m1-comparison&table=agent-attempts`：Agent 请求与控制器尝试元数据；
- `scope=m1-comparison&table=step-exposures`：每步服务器曝光时钟、响应关联与服务器墙钟时长；
- `/research/results`：研究者白名单保护的下载入口。

外部招募/运行清单还必须用 opaque token hash 连接 invitation、consent/authorization、cohort、build、运行时完整 prompt package、controller、模型 snapshot、浏览器镜像、R-PRIMARY 标记和失败原因；这些内容不能从现有 response CSV 反向推断。

Stage-A 出口由三层组成：`lib/m1-stage-a-normalize.ts` 从五表原始字段重建 scientific integrity；`lib/m1-stage-a-evidence.ts` 验证双 HMAC 可信根、deployment/profile/run/raw artifacts；`lib/m1-stage-a-audit.ts` 在不读取边界效应结果的前提下执行五态规则。CLI 为 `scripts/audit-m1-stage-a.ts`，只允许 v3 evidence 链授权 `GO`。自动校验不能替代第二研究者对签名密钥治理、机构文件真实性、供应商执行 provenance 与受限存储归档的独立复核。

分析前冻结：protocol/build/source/deployment manifest、刺激与事件 hash、纳排规则、唯一 `theta_abs`、`B=round(10^6×b)` 与 `Z_b=I(|ΔB|>=1)` 的主要零值规则、`|Δindex|>=1` 次要离散修正规则、72-cell 等权规则、模型式、complete matched-pair 主分析、all-available 缺失敏感性、Agent 重试规则和多重比较策略。当前 `M1_IMPLEMENTATION_BUILD_ID` 绑定 `public/data/m1-source-manifest.json` 的 SHA-256 前缀，测试会在任一列入清单的源码/样式/API/刺激/方法文件漂移时失败；但 source manifest 仍不等于实际部署证明，正式采集前还须把 Git commit、部署版本和实际 JS/CSS bundle manifest 写入外部 release manifest 并与 pair assignment 归档。

## 14. 相关方法依据

- Williams, E. J. (1949). Experimental designs balanced for the estimation of residual effects of treatments.
- Zacks, J. M., et al. (2007). Event perception: A mind-brain perspective.
- Truong, C., Oudre, L., & Vayatis, N. (2020). Selective review of offline change point detection methods.
- Brehmer, M., et al. (2017). Timelines revisited: A design space and considerations for expressive storytelling.
- Cleveland, W. S., McGill, R., & McGill, M. E. (1988). The shape parameter of a two-variable graph.

这些来源支持顺序平衡、事件分段、变点概念和图表表征控制；本实验中的“上下文弹性”及不确定范围旋钮是项目专用操作化，不应声称来自单一现成量表。
