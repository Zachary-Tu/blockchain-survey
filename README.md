# Boundary Lab：阶段判断的上下文弹性研究

Boundary Lab 是一个可运行的研究采集平台，用于比较人类与多模态 LLM / Agent 面对同一条时间序列时，阶段判断如何随着语义信息逐层增加而改变。

## 当前版本（研究平台第三版）

研究者在测试开始前锁定三个条件：

1. 曲线指标：价格、活跃地址或 Google 搜索热度；
2. 判断任务：固定两个分界点、自由选择 1–5 个分界点，或评价一套预设三阶段划分；
3. 时间分辨率：日、周、月或年。不可用的“指标 × 分辨率”组合会直接禁用，不插值伪造观测。

每条曲线经历四级固定披露：

1. 只显示曲线形状；
2. 显示曲线名称、资产身份与中性背景；
3. 显示真实时间轴和数值单位，价格条件同时解锁线性 / 对数刻度；
4. 在轴上显示重点事件、日期与中性说明。

量表不预选默认值。若阶段边界或合理性评分与上一步相同，测试者必须主动确认“维持上一判断”。系统记录分界点数组、预设分界、合理性评分、信心、主观影响、判断依据、理由、阅读时间、首次移动时间、调整次数与刻度切换次数。每条曲线结束后展示个人回答轨迹作为非评价性反馈。

当前研究版位于 `/`；第二版保留在 `/v2`；最早的单曲线原型保留在 `/legacy`。

## 数据口径与覆盖

- 价格：Li Blockchain 项目内 CMC 原始日频 `Open*`，覆盖 BTC、ETH、SOL、BNB；周/月/年均按自然日历区间取日 Open 算术均值。
- 活跃地址：Coin Metrics Community API `AdrActCnt`。当前同口径公开数据覆盖 BTC 与 ETH；SOL 与 BNB Smart Chain 不用旧 BNB Beacon Chain、其他供应商口径或合成数据补齐。
- Google Trends：Worldwide、Web Search 的 Bitcoin / Ethereum / Solana / BNB 主题。2018–2026 长窗口以两段重叠的原生周频序列为基础，分别锚定到全窗口月频序列，再对共享周取均值并统一归一化；日频明确禁用。
- 事件：使用可追溯链接的预测试标注。确认性研究前仍需独立筛选、冻结与预注册。

最长请求窗口为 2018-01-01 至 2026-04-11。Solana 价格从其真实上线后数据起点开始，BNB Google Trends 主题也只保留来源实际返回的可用期；不向前填充。

详细实验设计、指标与分析建议见 [`docs/RESEARCH_PROTOCOL_V4_ZH.md`](docs/RESEARCH_PROTOCOL_V4_ZH.md)。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

常用验证：

```bash
npx tsc --noEmit
npm run lint
npm test
```

重新生成冻结刺激（需要项目本地 Li Blockchain 路径、Python `requests`，并会访问 Coin Metrics / Google Trends）：

```bash
python scripts/export_research_stimuli_v4.py
```

## 关键文件

- `app/ExperimentV3.tsx`：研究配置、三种任务、四级披露、奖励页与会话导出；
- `app/api/research-responses/route.ts`：新版逐层响应校验与写入；
- `db/schema.ts`：D1 会话、旧版决策与新版研究响应结构；
- `public/data/research-stimuli-v4.json`：冻结的多指标、多分辨率刺激；
- `scripts/export_research_stimuli_v4.py`：来源获取、聚合、参考分界与数据审计；
- `docs/RESEARCH_PROTOCOL_V4_ZH.md`：研究设计与正式实验前检查清单；
- `drizzle/`：数据库迁移。

## 研究状态

这是方法与界面预测试平台，不是已经完成伦理审批或预注册的确认性实验。正式招募前仍需完成伦理审查、样本量 / 功效分析、事件集独立预注册、反事实或伪事件对照、参与者退出与数据删除流程、Google Trends 重复抽样敏感性分析，以及锁定模型版本、提示词、采样参数和视觉输入尺寸的 Agent 运行协议。
