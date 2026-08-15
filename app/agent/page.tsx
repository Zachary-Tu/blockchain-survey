import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Boundary Lab｜Agent 实验入口",
  description: "与人类实验协议对齐的 Agent 原生阶段判断入口。",
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentHubPage() {
  return (
    <main className="agent-site agent-hub">
      <header className="agent-header"><Link href="/">Boundary Lab</Link><code>AGENT INTERFACES</code></header>
      <section>
        <p>AGENT-NATIVE EXPERIMENT INTERFACE v1</p>
        <h1>选择 Agent 实验入口</h1>
        <p>两条路径都使用与人类版本相同的曲线、披露逻辑、边界定义、不确定范围和数据库字段；回答通过受约束 JSON 提交。</p>
        <div>
          <Link href="/agent/pilot"><code>01 / FIXED</code><strong>M1 Agent 初批实验</strong><span>固定 T2、四种资产、G0+6 步披露，共 28 次响应。</span></Link>
          <Link href="/agent/console"><code>02 / CONFIGURABLE</code><strong>Agent 模块控制台</strong><span>配置 M1—M4、任务、指标、信息快照、分辨率、刻度和时间窗。</span></Link>
        </div>
      </section>
    </main>
  );
}
