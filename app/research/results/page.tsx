import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Boundary Lab｜研究结果导出",
  description: "研究者专用的实验数据导出入口。",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function ResearchResultsPage() {
  return (
    <main className="mod-site mod-research-export-page">
      <header className="mod-topbar">
        <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>04</b></Link>
        <span>RESEARCHER ONLY</span>
      </header>
      <section className="mod-research-export-shell">
        <span className="mod-eyebrow">DATA EXPORT · D1 → CSV</span>
        <h1>实验结果导出</h1>
        <p>数据库分别保存“参与者/会话表”和“逐题响应表”。会话表每名测试者一行并包含设备环境；响应表每行代表某名测试者在某条曲线、某一披露步骤的一次提交。CSV 带 UTF-8 BOM，可直接用 Excel 打开。</p>
        <div className="mod-research-export-grid">
          <article>
            <span>00 · MATCHED M1 COMPARISON</span>
            <h2>Human–Agent 同构主比较</h2>
            <p>同时包含 <code>m1-main</code> 与 <code>agent-m1-main</code>，并导出 opaque allocation、pair、schedule、信息条件、初始与逐题视觉资格，以及 Agent attempt-response hash 链。per-protocol 主分析要求 <code>primary_protocol_eligible=true</code> 且 42 行 <code>response_protocol_eligible=true</code>；全部分配样本另作流程/ITT 报告。</p>
            <div className="mod-export-actions"><a href="/api/research-export?scope=m1-comparison&table=allocations">下载分配与启动令牌账本 CSV</a><a href="/api/research-export?scope=m1-comparison&table=sessions">下载配对会话表 CSV</a><a href="/api/research-export?scope=m1-comparison">下载 42 步响应表 CSV</a><a href="/api/research-export?scope=m1-comparison&table=step-exposures">下载服务器逐页计时表 CSV</a><a href="/api/research-export?scope=m1-comparison&table=agent-attempts">下载 Agent attempts CSV</a></div>
          </article>
          <article>
            <span>01 · HUMAN M1 MAIN</span>
            <h2>人类 M1 主实验</h2>
            <p>只包含正式人类入口产生、实验臂标记为 <code>m1-main</code> 的记录。</p>
            <div className="mod-export-actions"><a href="/api/research-export?scope=human-m1&table=sessions">下载参与者/设备表 CSV</a><a href="/api/research-export?scope=human-m1">下载人类 M1 逐题答题表 CSV</a></div>
          </article>
          <article>
            <span>02 · AGENT DIAGNOSTIC CONSOLE</span>
            <h2>Agent 扩展控制台</h2>
            <p>汇总 Agent 在 M1—M4 诊断条件下产生的记录；不纳入 Human–Agent 同构主比较。</p>
            <div className="mod-export-actions"><a href="/api/research-export?scope=agent-console&table=sessions">下载 Agent 会话表 CSV</a><a href="/api/research-export?scope=agent-console">下载 Agent 全模块答题表 CSV</a></div>
          </article>
          <article>
            <span>03 · ALL AGENT</span>
            <h2>全部 Agent 历史记录</h2>
            <p>筛选全部 <code>actor_type=agent</code>，同时包含当前全模块入口与保留的 Agent 初批入口。</p>
            <div className="mod-export-actions"><a href="/api/research-export?scope=agent&table=sessions">下载全部 Agent 会话表 CSV</a><a href="/api/research-export?scope=agent">下载全部 Agent 答题表 CSV</a></div>
          </article>
          <article>
            <span>04 · ALL MODULES</span>
            <h2>完整控制台实验</h2>
            <p>包含人类、Agent、M1—M4 与历史模块化会话的全部逐步记录，便于统一备份。</p>
            <div className="mod-export-actions"><a href="/api/research-export?scope=all&table=sessions">下载全部会话表 CSV</a><a href="/api/research-export?scope=all">下载全部逐题答题表 CSV</a></div>
          </article>
        </div>
        <aside>
          <strong>访问保护</strong>
          <p>下载接口同时检查 ChatGPT 登录邮箱与服务器端研究者白名单；参与者即使知道这个地址，也不能读取汇总数据。</p>
        </aside>
        <Link className="mod-primary-link" href="/">返回研究者操作台 <span>←</span></Link>
      </section>
    </main>
  );
}
