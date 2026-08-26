import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "M1 Human–Agent 同构实验方法｜Boundary Lab",
  description: "Boundary Lab M1 的研究问题、2×2 设计、同构流程、盲化、统计估计、Agent 协议与解释边界。",
};

const disclosures = [
  ["G0", "匿名曲线", "仅曲线和作答控件", "指标、日期、频率、点数、单位、资产、事件"],
  ["GI1", "序列类型", "增加价格序列类别", "日期、频率、单位、资产、事件"],
  ["GI2", "时间与单位", "时间轴、USD、周频、线性刻度、观测数与指标定义", "资产、背景、事件"],
  ["DI1", "资产名称", "币名与代码", "背景与事件"],
  ["DI2", "资产背景", "冻结的中性介绍", "事件"],
  ["DI3", "事件信息（一）", "后台 priority 1–2 预选；统一视觉；每币最多 10 个", "第二组事件"],
  ["DI4", "事件信息（二）", "后台 priority 3–5 预选；统一视觉；最多新增 10 个", "—"],
];

const limits = [
  "六种著名加密资产不能代表全部金融或区块链序列。",
  "匿名形状仍可能被熟悉行情历史的 Human 或模型识别。",
  "固定披露顺序仍把信息内容与时间顺序绑定；重复控制不能完全匹配阅读负荷。",
  "上一轮虚线会产生锚定，因此测量的是已有判断上的修正。",
  "G0 从共同标准化的 1/3、2/3 三等分起点开始，本实验操作化为调整预置边界，而不是从空白放置。",
  "G0 完全接受默认锚点要求两条边界均未移动、adjustmentCount=0 且 firstMoveMs 为空。",
  "事件层同时加入标线和文字，估计的是二者的联合效应。",
  "冻结事件文本为英文；Human 的流程外阅读筛选限制了结果对一般中文人群的外推。",
  "Agent 结果属于模型、视觉输入与浏览器控制器的联合系统。",
];

export default function M1MethodologyPage() {
  return (
    <main className="mod-site mod-method-page mod-m1-method-page">
      <header className="mod-topbar">
        <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>04</b></Link>
        <Link className="mod-method-back" href="/research/m1-launch">打开配对启动器</Link>
      </header>

      <section className="mod-method-hero">
        <span className="mod-eyebrow">STAGE-A FROZEN · STAGE-B SPECIFICATION ONLY · m1-isomorphic-v1</span>
        <h1>同一页面、同一状态机，<br />只改变判断主体。</h1>
        <p>本方法把 Human 与多模态 Agent 放进同一套 M1 浏览器流程，并用无新增信息重复条件估计练习、疲劳、时间流逝和锚定造成的自然漂移。主结果比较的是经该漂移调整后的“上下文弹性”。</p>
        <div className="mod-method-paths"><span>2 Actors</span><span>2 Information conditions</span><span>7 Rounds</span><span>6 Assets</span><span>42 Judgments / session</span></div>
      </section>

      <section className="mod-method-notice">
        <strong>主张边界</strong>
        <p>Agent 是“冻结模型 + 运行时完整 prompt package + 截图视觉输入 + 坐标控制器”系统。它不得读取 DOM、accessibility tree、源码、网络、刺激 JSON 或外部资料；JSON 控制台只作为扩展诊断，不进入主比较。网站已冻结 runner contract 与 system-prompt 组件，但可执行外部 controller 及其实际注入的完整 prompt package 仍须单独实现、归档和端到端验证；在此之前只能运行不计入阶段 A 的受监督 feasibility run。</p>
      </section>

      <section className="mod-m1-method-grid">
        <article><span>01 · DESIGN</span><h2>2 × 2 核心设计</h2><p>Actor：Human / Agent。Information condition：staged / repeat-control；control 七轮保持 G0 以估计复测漂移。资产、轮次和两个边界为组内重复测量。</p></article>
        <article><span>02 · PILOT SAMPLE</span><h2>A 12 pairs；B 尚未启用</h2><p>阶段 A 的 12 个 condition × Williams schedule cell 各 1 pair。计划中的阶段 B 为 36 pairs，但当前 build 硬性停在 12；GO 后仍须新建 Stage-B cohort/build 才能开放。</p></article>
        <article><span>03 · PAIRING</span><h2>隐藏式平衡分配</h2><p>服务端在 2×6 个 cell 中平衡分配，Human/Agent 共用 condition、Williams schedule、42 步 tuple、cohort Agent-profile hash 与 primary Chrome major。URL 只含一次性 256-bit token，不暴露条件。</p></article>
        <article><span>04 · PRIMARY PAIR</span><h2>1 Human + 1 R-PRIMARY</h2><p>每个 pair 只含一名 Human 与一个冻结模型系统的 R-PRIMARY run。pair 是分配与 cluster 单位；额外模型或随机重复仅进入独立诊断队列。</p></article>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">I</span><div><span className="mod-eyebrow">INFORMATION ISOLATION</span><h2>每一轮究竟新增什么</h2></div><p>未来主题只显示“？”，未披露字段完全不渲染。</p></div>
        <div className="mod-method-table" role="table" aria-label="披露与盲化规则">
          <div role="row"><b>步骤</b><b>状态</b><b>本轮可见</b><b>仍然隐藏</b></div>
          {disclosures.map((row) => <div role="row" key={row[0]}>{row.map((cell, index) => index === 0 ? <code key={cell}>{cell}</code> : <span key={cell}>{cell}</span>)}</div>)}
        </div>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">F</span><div><span className="mod-eyebrow">ISOMORPHIC FLOW</span><h2>共同的完整作答流程</h2></div><p>主体特有内容只存在于正式任务之前。</p></div>
        <ol className="mod-method-flow">
          <li><span>00</span><div><strong>流程外登记与筛选</strong><p>任何真实 Human 的阶段 A/B 招募前，必须取得适用机构伦理批准或书面豁免，使用机构批准的完整知情同意材料，并按冻结工具完成英文金融新闻阅读筛选。网站 checkbox 只记录流程已完成；真实同意、筛选结果与撤回状态保存在独立受限账本。</p></div></li>
          <li><span>01</span><div><strong>共同说明与合成练习</strong><p>同一任务文字、同一练习曲线和同一控件；练习不写入正式响应表。</p></div></li>
          <li><span>02</span><div><strong>7 次轮次转场</strong><p>Staged 明确高亮本轮新信息；repeat-control 进入下一轮但保持当前可见状态。</p></div></li>
          <li><span>03</span><div><strong>每轮 6 个单曲线页面</strong><p>两个边界、两个连续范围、1–5 影响评分、必要时确认有意保持不变。</p></div></li>
          <li><span>04</span><div><strong>中性休息页</strong><p>只显示 6/6 已保存和总体进度，不显示位移、范围、改变数量、表现或所谓正确答案。</p></div></li>
        </ol>
      </section>

      <section className="mod-method-notice">
        <strong>Human 招募前置门槛</strong>
        <p>阶段 A、阶段 B 和确认性研究中的真实 Human 均受同一前置规则约束。没有机构书面决定、完整同意材料、冻结数据管理计划、英文筛选材料/通过阈值与 screen-out 记录时，只能运行不进入研究数据的开发测试。</p>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">S</span><div><span className="mod-eyebrow">ANALYSIS SETS</span><h2>先报告流程，再估计 complete matched pairs。</h2></div><p>不能让未启动或失败的 run 从分母中消失。</p></div>
        <div className="mod-m1-integrity-list">
          <p><strong>Invitation</strong>：已生成 primary slot/token；是招募分母，不称为 ITT。</p><p><strong>Pre-start terminal</strong>：未领取 token 以冻结 disposition 终止；token 被撤销但不创建 session。</p><p><strong>Consented</strong>：Human 已有效同意，或 Agent R-PRIMARY 已获启动授权。</p><p><strong>Started</strong>：服务端已创建 canonical session；pre-start terminal 不进入此分母。</p><p><strong>Available</strong>：至少 1 条合法正式响应。</p><p><strong>Complete</strong>：42 条 canonical 响应；Agent 另须 42 个 submitted attempt、link 与服务器 hash。</p><p><strong>Protocol-eligible</strong>：符合纳入标准，且初始环境与所有已提交响应均无设备/交互偏离。</p>
        </div>
        <p>Primary 环境固定桌面 Chrome、1440×900 viewport、DPR 1、100% zoom 和鼠标/视觉控制器。唯一主分析使用双方均 complete 的 matched pairs。all-available 与 protocol-eligible complete pairs 只作敏感性分析；退出、技术失败与 controller abort 可能非随机，因此 all-available 不能恢复随机化或消除选择偏差。</p>
      </section>

      <section className="mod-m1-method-section is-dark">
        <div><span className="mod-eyebrow">PRIMARY ESTIMAND</span><h2>先减去复测漂移，再比较 Human 与 Agent。</h2></div>
        <pre>{`m[q,c,l,a,k] = E(|Δb| | actor=q, condition=c,
                         transition=l, asset=a, boundary=k)

theta_abs = (1/72) Σ(l=1..6,a=1..6,k=1..2)
  [(m[Agent,staged] − m[Agent,control])
  −(m[Human,staged] − m[Human,control])]`}</pre>
        <p>六次转移 × 六种资产 × 两条边界严格等权。主模型用 complete matched pairs：asset 为固定效应；pair 随机截距；session/run 嵌套于 pair，并保留 transition slope 与 session × asset 随机截距；区间以 pair 为 cluster。绝对位移使用 logistic + lognormal two-part hurdle：比例 <code>b</code> 固定保存六位小数，先以 <code>B=round(10^6×b)</code> 定义 <code>Z_b=I(|ΔB|≥1)</code>，即存储精度下的 <code>I(|Δb|&gt;0)</code>，正值部分再建模 <code>|Δb|</code>。signed Δb 及另行定义的离散网格移动 <code>I(|Δindex|≥1)</code> 只作次要分析。</p>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">D</span><div><span className="mod-eyebrow">DURABLE DATA</span><h2>数据库把计划与答案同时锁定</h2></div><p>D1 是事实来源；浏览器只保存恢复指针。</p></div>
        <div className="mod-m1-integrity-list">
          <p>服务端以 opaque token 原子锁定 pair、actor、replicate、condition、schedule、Agent profile hash 与 Chrome major。</p><p>未领取 slot 只可用四类冻结 disposition 终止；同时写入 terminal/revoked 时间，不创建 session。</p><p>会话创建时由服务端生成 42 个 canonical expected steps。</p><p>每页必须先取得唯一 server exposure clock，确认前不显示刺激。</p><p>提交必须恰好匹配下一步的资产、顺序、信息层、指标、频率、刻度与窗口。</p><p>previous boundaries 从数据库读取；伪造、跳步和过期状态均拒绝。</p><p>相同答案重试幂等成功，不同答案重写返回 409。</p><p>每个 Agent step 只能有一个 final submitted attempt，并与 response ID 和服务器科学答案 hash 一一关联。</p><p>完成时比较完整 tuple、42 个 exposure，以及 Agent 的 42 个 attempt-response links；计划为空时禁止完成。</p>
        </div>
        <p>Strict M1 不持久化 raw User-Agent：服务端仅瞬时解析并保存浏览器主版本与操作系统大类，标准研究导出及参与者本地 CSV/JSON 均不包含 raw UA。历史/开发记录、托管日志与备份仍须在招募前按机构批准的数据管理计划完成审计与处置。</p>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">R</span><div><span className="mod-eyebrow">FAILURE &amp; RETRY</span><h2>失败不能变成择优重跑。</h2></div><p>所有限额在看见 actor 差异前冻结。</p></div>
        <div className="mod-m1-integrity-list">
          <p>每个正式页面从 server exposure 起最多 180 秒；网络确认时间也计入；客户端计时只作遥测。</p><p>Agent controller 每页最多 20 个由 ledger 记录、由外部 trace 复核的动作。</p><p>每个机械动作最多额外重试 2 次，且不得重新调用模型。</p><p>只有模型尚未输出时，才允许完全相同 request 最多额外 API 重试 2 次。</p><p>完整 Human session 或 Agent run 从 canonical session 创建起最多 120 分钟。</p><p>终止码区分退出、撤回、页/全程超时、模型/机械上限、controller/network/operator 和协议错误；所有 Agent aborted primary run 均进入 abort 分子。</p><p>超限即 abort；不得在原 pair 内替换单侧主体或挑选较好 run。</p><p>固定 12-cell cohort 不增加替代 pair；只有 REVISE 后才能用新 build/cohort 重做，旧新数据不得合并。</p>
        </div>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">G</span><div><span className="mod-eyebrow">AUDIT STATE MACHINE</span><h2>阶段 A 只有一套冻结出口。</h2></div><p>当前 build 不会自动开放 Stage B。</p></div>
        <div className="mod-m1-integrity-list">
          <p><strong>NOT EVALUABLE：</strong>未满 12 个唯一 2×6 cell，或 24 个 primary allocation slot 尚有开放 token、且既无真实 complete/aborted session 也无合法 pre-start terminal disposition，或缺少绑定同一 snapshot、五张原始表与正式 collection-close 的有效签名 receipt 时，不能用小分母宣布 GO。</p><p><strong>STOP：</strong>从原始字段重建的 complete session canonical / exposure / attempt / link / hash 完整率低于 100%，已确认数据丢失不为 0，或未来信息泄漏不为 0；已确认 STOP 可即时触发。</p><p><strong>REVISE：</strong>complete matched pairs 少于 10/12，或任一 condition 少于 5/6；另检查 80% 完成率、10% Agent abort、45/75 分钟、10% 偏离与 50% G0 锚点阈值。</p><p><strong>GO PENDING：</strong>量化规则通过，但伦理/同意/DMP/英文筛选/撤回、raw-UA、真实部署、controller、完整 prompt、模型/浏览器、双签名 evidence root 或逐 run 原始工件仍有缺项。</p><p><strong>GO：</strong>量化规则与全部外部 release gates 都通过；随后只允许启动新的 Stage-B 冻结过程。</p>
        </div>
        <p>伦理批准/书面豁免、机构批准的完整同意材料、英文筛选与已验证的数据最小化是第一名真实 Human 招募前的硬门槛，不由 pilot GO 指标替代。任何修订都必须重做新的阶段 A cohort，修改前后数据不得合并。阶段 B 当前 disabled；若另行启用，只估计方差和模型可行性。确认性主实验还需正式预注册、功效模拟与冻结样本。</p>
        <p><strong>采集默认关闭：</strong>正式 Stage A 必须显式启用 primary 与 Human gate、关闭 development-pilot gate，并冻结 deployment ID/fingerprint。停止前先写完尚未领取 slot 的合法 disposition；关闭正式 gate 后，pre-start terminal、exposure、attempt、response 与 completion 写入均 fail closed；随后仍需由仓库外受控服务原子关闭 snapshot 并签 receipt。诊断 quota 只在 development-pilot gate 开启时运行，永不进入 primary 样本。</p>
      </section>

      <section className="mod-m1-method-section">
        <div className="mod-section-heading"><span className="mod-index">L</span><div><span className="mod-eyebrow">INTERPRETATION LIMITS</span><h2>论文中必须同时报告的限制</h2></div><p>避免把界面系统差异误写成纯认知差异。</p></div>
        <ul className="mod-method-limit-list">{limits.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="mod-method-notice">
        <strong>冻结文件</strong>
        <p>完整方法、失败重试规则、隐私、质量控制、结果变量和统计模型保存在仓库的 <code>docs/M1_ISOMORPHIC_HUMAN_AGENT_METHOD_ZH.md</code>。当前只启用 12-pair Stage A；36-pair Stage B 是尚未启用的规范。任何真实 Human 招募均需事先伦理决定、机构批准的知情同意及英文筛选；paired Agent Stage A 另需可执行 controller、运行时完整 prompt package、真实部署证明、双独立签名 receipt/evidence root 与可复算的逐 run 原始工件。</p>
      </section>
    </main>
  );
}
