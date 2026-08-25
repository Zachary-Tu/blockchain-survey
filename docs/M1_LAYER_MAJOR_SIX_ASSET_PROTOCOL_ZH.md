# M1 v4.3：按披露层、六资产分页面推进的实验协议

## 1. 本版目的

本版继续按信息层推进，但每个信息层改为六个连续的单资产页面。参与者依次完成六条曲线后进入下一信息状态，既保留同层横向可比性，也避免在同一页面同时看到六条曲线而产生直接参照或视觉负荷。

固定 M1 条件为：T2（三阶段、两个分界点）、价格序列、周频、线性刻度、完整可用时间窗、combined 披露路径。

## 2. 六种资产

资产集合固定为 BTC、ETH、SOL、BNB、XRP、DOGE，会话内只随机一次资产顺序，之后七个信息层复用该顺序。

- BTC：工作量证明与原生加密资产基准。
- ETH：通用智能合约平台。
- SOL：高吞吐公链。
- BNB：交易平台与链上生态相关资产。
- XRP：面向支付与跨币种结算的原生账本资产。技术背景依据 XRP Ledger 官方说明：<https://xrpl.org/docs/introduction/what-is-the-xrp-ledger>。
- DOGE：社区与网络文化驱动、采用 Scrypt 工作量证明的点对点货币。技术与历史背景依据 Dogecoin 官方材料：<https://dogecoin.com/dogepedia/articles/what-is-a-miner/>、<https://dogecoin.com/assets/pdf/20230819-Obit-BallBall.pdf>。

XRP 与 DOGE 的加入旨在增加机制与语义类别差异；稳定币不纳入主目标集合，因为近似锚定价格会把阶段判断转化为脱锚检测，适合另设控制条件。

## 3. 试次顺序

七个信息层依次为：G0 → GI1 → GI2 → DI1 → DI2 → DI3 → DI4。进入每一层之前先显示独立的“新信息已解锁”过渡页，随后依次进入六个单资产页面。每个页面独立提交，因此每位参与者完成 7 × 6 = 42 次独立响应。

在第 k 层处理某一种资产时：

1. 恢复该资产第 k−1 层提交的两个分界点和不确定范围；
2. 用虚线显示上一层分界点；
3. 允许参与者移动边界并连续调整不确定范围；
4. 若边界与范围均未改变，要求显式确认“有意保持不变”；
5. 当前资产提交后立即锁定并进入同层下一资产；
6. 六种资产全部完成后显示层级反馈页，再进入下一信息层。

G0 没有上一层答案，使用 1/3 与 2/3 的中性初始位置，但不确定范围必须由参与者主动确认。

## 4. 连续不确定范围

原来的五个预设宽度改为连续旋钮条。记录字段仍为 `halfWidthRatio`，允许范围为 0.005–0.200；人类界面的步进为 0.005。界面显示名义半宽（±百分比）与总宽度范围。Agent 接口接收同一数值区间的 JSON 浮点数，不再限定为五个离散值。

人类 M1 页面不再询问“划分主要依据了哪些线索”“还想补充什么”或“本次与上次不同的主要原因”。保留的响应内容只有分界点、连续不确定范围、层级更新后的影响评分，以及边界完全未变化时的显式确认。为兼容既有导出结构，`cue_tags` 与 `rationale` 字段仍保留，但在人类 M1 新记录中固定为空。

## 5. 事件披露

事件源冻结为 `events_20260527.zip`，SHA-256：

`cc9d1f5d06fa2aeb447c57abeb1c42c560195967d33e7a4f90629333c3bc9438`

事件分组规则：

- DI3 核心事件：原表 `priority` 1–2；
- DI4 补充事件：原表 `priority` 3–5；
- 每一层、每一资产最多新增 10 个事件；
- 先过滤到当前实际显示时间窗，再按日期和事件 ID 排序；候选数超过 10 时，在有序候选中等距取 10 个并保留首尾事件；
- DI4 页面继续保留 DI3 的图上事件标记，但事件卡片只列出 DI4 新增项；因此“每层最多 10 个”指该层新增事件数；
- 每条响应保存原始事件 ID、原始数值 priority、新增事件 ID、保留事件 ID、筛选协议版本与显示窗口。

事件标题与描述保留源表原文，避免未审计的自由翻译改变语义。若正式中文样本需要译文，应在预注册前冻结双语对照表并进行独立复核。

## 6. 数据与版本标识

- 刺激数据：`research-stimuli-modular-v8.json`
- 数据协议：`boundary-lab-modular-v4.1`
- 人类 M1：`m1-human-main-v4-six-sequential-pages-minimal-response`
- Agent 接口：`agent-native-json-v2-layer-major-six-assets`
- 事件筛选：`events-20260527-priority-bands-even-spacing-v1`
- 人类范围控件：`continuous-range-knob-v1`
- 人类层级呈现：`sequential-single-asset-pages-v1`
- 人类问题集：`boundaries-uncertainty-influence-v1`
- 单页计时：`step-start-to-submit-v1`；每条响应的 `elapsed_ms` 为进入当前资产页面到提交的时间。
- 人类响应格式：`v4.3`；设备采集协议为 `session-device-environment-v1`，逐页可见时间协议为 `per-page-visible-time-v1`。

XRP 与 DOGE 的价格来自 Li Blockchain 项目中的 `xrp.tsv` 与 `dogecoin.tsv`。当前六资产扩展只为这两种新增资产纳入价格数据；其 active addresses 与 Google Trends 条件在数据包中显式标记为不可用，不会被通用控制台错误抽样。

## 7. 数据库与导出

数据库唯一键仍由 `session_id + trial_id + disclosure_index` 区分每次回答。会话表保存资产随机顺序、设备类别、屏幕与初始视口尺寸、平台、语言、时区等技术环境；逐题响应表保存 42 次回答、每页总时间、后台隐藏时间、可见作答时间、客户端开始/提交时间及提交时视口。研究者入口可分别导出“一名测试者一行”的会话/设备表，以及“一次披露判断一行”的逐题答题表。完整字段说明见 `M1_DATA_STORAGE_AND_TELEMETRY_ZH.md`。
