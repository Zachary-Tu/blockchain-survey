import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Boundary Lab｜保留的 Agent 双入口",
  description: "上一版 Agent M1 与模块控制台入口，供实验回退使用。",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function LegacyAgentHubPage() {
  return (
    <main className="agent-site agent-hub">
      <header className="agent-header"><Link href="/">Boundary Lab</Link><code>PREVIOUS AGENT INTERFACES</code></header>
      <section>
        <p>RETAINED FOR PROTOCOL ROLLBACK</p>
        <h1>保留的 Agent 双入口</h1>
        <p>此页保留上一版的固定 M1 Agent 入口和可配置控制台入口；当前正式 Agent 实验入口为 <Link href="/agent">/agent</Link>。</p>
        <div>
          <Link href="/agent/pilot"><code>01 / FIXED</code><strong>M1 Agent 初批实验</strong><span>固定 T2、六种资产、按披露层推进，共 42 次响应。</span></Link>
          <Link href="/agent/console"><code>02 / CONFIGURABLE</code><strong>Agent 模块控制台</strong><span>配置 M1—M4、任务、指标、信息快照、分辨率、刻度和时间窗。</span></Link>
        </div>
      </section>
    </main>
  );
}
