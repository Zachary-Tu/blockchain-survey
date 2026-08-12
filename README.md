# Boundary Lab：阶段判断的上下文弹性研究

Boundary Lab 是一个可运行的研究采集平台，用于比较人类与多模态 LLM / Agent 面对同一条时间序列时，阶段判断如何随着语义信息逐层增加而改变。

## 当前版本（研究平台第三版）

研究者在测试开始前锁定三个条件：

1. 曲线指标：价格、活跃地址或 Google 搜索热度；
2. 判断任务：A 类自主选择 1、2 或 3 个分界点；B 类评价对应的 1、2 或 3 个预设分界点，共六个配对条件；
3. 时间分辨率：日、周、月或年。不可用的“指标 × 分辨率”组合会直接禁用，不插值伪造观测。

每条曲线经历四级固定披露：

1. 只显示曲线形状；
2. 显示曲线名称、资产身份与中性背景；
3. 显示真实时间轴和数值单位，价格条件同时解锁线性 / 对数刻度；
4. 在轴上显示重点事件、日期与中性说明。

测试过程中，尚未到达的披露主题统一显示“？”，避免参与者预判后续信息。从第二层起，橙色虚线保留上一层已经提交的分界位置，深绿色实线表示本层当前判断。

A 类任务还要求参与者为每个分界点选择一个对称可能范围。第一次没有默认范围，之后可随新增信息收窄、放宽或保持。系统同时记录中心点、区间宽度与起止位置、上一层参照、合理性评分、信心、主观影响、判断依据、理由、阅读时间、首次移动时间、首次范围选择时间、调整次数与刻度切换次数。每条曲线结束后展示个人回答轨迹作为非评价性反馈。

当前研究版位于 `/`；第二版保留在 `/v2`；最早的单曲线原型保留在 `/legacy`。

## 数据口径与覆盖

- 价格：Li Blockchain 项目内 CMC 原始日频 `Open*`，覆盖 BTC、ETH、SOL、BNB；周/月/年均按自然日历区间取日 Open 算术均值。
- 活跃地址：Coin Metrics Community API `AdrActCnt`。当前同口径公开数据覆盖 BTC 与 ETH；SOL 与 BNB Smart Chain 不用旧 BNB Beacon Chain、其他供应商口径或合成数据补齐。
- Google Trends：Worldwide、Web Search 的 Bitcoin / Ethereum / Solana / BNB 主题。2018–2026 长窗口以两段重叠的原生周频序列为基础，分别锚定到全窗口月频序列，再对共享周取均值并统一归一化；日频明确禁用。
- 事件：使用可追溯链接的预测试标注。确认性研究前仍需独立筛选、冻结与预注册。

最长请求窗口为 2018-01-01 至 2026-04-11。Solana 价格从其真实上线后数据起点开始，BNB Google Trends 主题也只保留来源实际返回的可用期；不向前填充。

基础数据与实验设计见 [`docs/RESEARCH_PROTOCOL_V4_ZH.md`](docs/RESEARCH_PROTOCOL_V4_ZH.md)；六条件、未来主题盲化和边界不确定区间的修订见 [`docs/RESEARCH_PROTOCOL_V5_ZH.md`](docs/RESEARCH_PROTOCOL_V5_ZH.md)。

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

重新生成基础刺激（需要项目本地 Li Blockchain 路径、Python `requests`，并会访问 Coin Metrics / Google Trends），再生成 v5 的 1/2/3 分界参考方案：

```bash
python scripts/export_research_stimuli_v4.py
python scripts/export_research_stimuli_v5.py
```

## 关键文件

- `app/ExperimentV3.tsx`：研究配置、六个配对任务条件、四级披露、边界范围、奖励页与会话导出；
- `app/api/research-responses/route.ts`：新版逐层响应校验与写入；
- `db/schema.ts`：D1 会话、旧版决策与新版研究响应结构；
- `public/data/research-stimuli-v5.json`：冻结的多指标、多分辨率刺激与 1/2/3 分界参考方案；
- `scripts/export_research_stimuli_v4.py`：来源获取、聚合与数据审计；
- `scripts/export_research_stimuli_v5.py`：从冻结观测生成六条件共用的参考分界；
- `docs/RESEARCH_PROTOCOL_V4_ZH.md`：研究设计与正式实验前检查清单；
- `docs/RESEARCH_PROTOCOL_V5_ZH.md`：任务配对、信息盲化与边界区间修订；
- `drizzle/`：数据库迁移。

## 研究状态

这是方法与界面预测试平台，不是已经完成伦理审批或预注册的确认性实验。正式招募前仍需完成伦理审查、样本量 / 功效分析、事件集独立预注册、反事实或伪事件对照、参与者退出与数据删除流程、Google Trends 重复抽样敏感性分析，以及锁定模型版本、提示词、采样参数和视觉输入尺寸的 Agent 运行协议。
