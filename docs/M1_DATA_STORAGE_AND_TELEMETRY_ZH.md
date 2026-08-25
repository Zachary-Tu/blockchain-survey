# M1 数据存储、设备信息与导出说明

## 1. 数据库结构

正式网站以 Cloudflare D1 关系型数据库为主存储，不以参与者本地下载文件作为唯一记录。

### `experiment_sessions`：参与者/会话表

每次开始正式实验时新增一行，主要字段包括：

- `id`：随机生成的会话 ID；
- `participant_code`：研究者分配的匿名编号，不填写真实姓名；
- `expertise`、`experimental_arm`、`protocol_version`、`status`；
- `started_at`、`completed_at`；
- `study_config_json`：随机曲线顺序、披露顺序及实验条件；
- 设备环境：`device_type`、`screen_width`、`screen_height`、初始 `viewport_width` / `viewport_height`、`device_pixel_ratio`、`client_platform`、`browser_language`、`client_timezone`、`pointer_type`、`touch_points`、`screen_orientation` 与 `user_agent`。

`device_type` 由浏览器能力和显示尺寸推断为 `mobile`、`tablet`、`desktop` 或 `unknown`，属于分析用分类，不应视为设备型号的精确识别。

### `modular_responses`：逐题响应表

每个“会话 × 币种 × 披露层”单独写入一行。M1 正式实验正常完成时为 6 个币种 × 7 个披露层 = 42 行。主要字段包括：

- 实验条件：币种、指标、分辨率、线性/对数、时间窗口、披露层及实际可见信息；
- 回答：两个分界点、上一层分界点、两个连续不确定区间、新信息影响评分及“有意保持不变”确认；
- 行为过程：总作答时间、页面可见作答时间、切到后台的时间、首次移动分界点时间、首次调整不确定范围时间，以及两类调整次数；
- 时间与显示环境：客户端开始/提交时间、该题提交时的视口宽高与横竖屏状态；
- 服务器写入时间 `created_at`。

数据库使用 `(session_id, trial_id, disclosure_index)` 唯一约束，防止刷新或重试造成同一题重复写入。会话只有在预期的 42 行全部存在后才能标记为 `complete`；中途退出的会话保留为 `active`，已提交行不会丢失。

## 2. 时间字段解释

- `elapsed_ms`：进入当前单币种披露页面到点击提交的总墙钟时间；
- `page_hidden_ms`：其中浏览器标签页处于后台/隐藏状态的累计时间；
- `active_elapsed_ms`：`elapsed_ms - page_hidden_ms`，建议作为主要有效作答时长；
- `reveal_read_ms`：进入页面到第一次移动分界点或不确定范围的时间；
- `first_move_ms`：首次移动分界点的时间；
- `first_uncertainty_ms`：首次调整不确定范围的时间；
- `client_started_at` / `client_submitted_at`：客户端 ISO 时间戳；
- `created_at`：服务器数据库写入时间。

客户端时钟可能不准确，因此持续时长优先使用基于浏览器高精度计时器生成的 `*_ms` 字段；ISO 时间用于审计顺序和异常检查。

## 3. 隐私边界

实验页面明确告知参与者会记录设备技术环境与逐页响应时间。不主动读取真实姓名、联系人、硬件序列号、精确地理位置、摄像头、麦克风或页面外浏览内容。`user_agent` 仅用于浏览器兼容性和设备分类复核。

正式采集前仍应由研究团队根据所在机构的伦理审查/数据管理要求，确定保存期限、访问人员、匿名编号生成方式和撤回流程。

## 4. 如何导出为表格

研究者登录后访问 `/research/results`，可分别下载：

1. **参与者/设备表 CSV**：每个会话一行，包括未完成会话；
2. **逐题答题表 CSV**：每个币种、每个披露层一次提交一行，并重复附带会话级设备字段，便于直接在 Excel、R、Python、Stata 或 SPSS 中分析。

下载接口要求登录邮箱同时存在于服务器环境变量 `RESEARCHER_EMAILS` 的白名单中。CSV 为 UTF-8 BOM 格式，可直接由 Excel 打开。

参与者完成页另提供本次会话的 CSV 和 JSON 本地副本；它们用于即时备份，服务器 D1 数据库仍是研究数据的主记录。
