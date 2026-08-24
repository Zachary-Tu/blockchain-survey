# M1 v4.2：按披露层、六资产同页推进的实验协议

## 1. 本版目的

本版将 M1 从“先完成一个资产的全部披露，再进入下一个资产”改为“每个信息层在同一页面呈现全部六种资产，整层完成后再进入下一信息状态”。这样可以降低披露层与资产顺序的系统性混淆，并让每一层形成可直接比较的横截面。

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

七个信息层依次为：G0 → GI1 → GI2 → DI1 → DI2 → DI3 → DI4。进入每一层之前先显示独立的“新信息已解锁”过渡页，随后在一个页面中同时呈现六种资产。每位参与者完成 7 次整层提交；后台仍写入 7 × 6 = 42 条独立响应记录。

在第 k 层处理六种资产时：

1. 恢复该资产第 k−1 层提交的两个分界点和不确定范围；
2. 用虚线显示上一层分界点；
3. 允许参与者移动边界并连续调整不确定范围；
4. 若边界与范围均未改变，要求显式确认“有意保持不变”；
5. 六种资产全部完成后统一提交；客户端逐条安全写入六条响应，写入中断时可以重试且不会重复记录；
6. 整层写入完成后锁定该层并显示层级反馈页。

G0 没有上一层答案，使用 1/3 与 2/3 的中性初始位置，但不确定范围必须由参与者主动确认。

## 4. 连续不确定范围

原来的五个预设宽度改为连续旋钮条。记录字段仍为 `halfWidthRatio`，允许范围为 0.005–0.200；人类界面的步进为 0.005。界面显示名义半宽（±百分比）与总宽度范围。Agent 接口接收同一数值区间的 JSON 浮点数，不再限定为五个离散值。

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
- 人类 M1：`m1-human-main-v3-six-assets-single-page`
- Agent 接口：`agent-native-json-v2-layer-major-six-assets`
- 事件筛选：`events-20260527-priority-bands-even-spacing-v1`
- 人类范围控件：`continuous-range-knob-v1`
- 人类层级呈现：`simultaneous-six-asset-page-v1`
- 同页计时：`layer-start-to-last-asset-interaction-v1`；每条响应的 `elapsed_ms` 为进入该层到该资产最后一次作答交互的时间，首次移动与首次调整范围仍分别记录。

XRP 与 DOGE 的价格来自 Li Blockchain 项目中的 `xrp.tsv` 与 `dogecoin.tsv`。当前六资产扩展只为这两种新增资产纳入价格数据；其 active addresses 与 Google Trends 条件在数据包中显式标记为不可用，不会被通用控制台错误抽样。

## 7. 数据库与导出

数据库唯一键仍由 `session_id + trial_id + disclosure_index` 区分每次回答，无需迁移。会话配置额外保存资产随机顺序、`disclosure-major` 顺序、`simultaneous-six-asset-page-v1` 呈现方式、事件规则和范围控件版本。CSV/JSON 导出继续逐行保存 42 次回答，因此可按披露层、资产、参与者或 Agent 模型直接分组分析。
