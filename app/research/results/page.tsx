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
        <p>服务器会把会话表与逐步响应表连接后导出；每一行代表一名测试者在某条曲线、某一披露步骤的一次提交。CSV 带 UTF-8 BOM，可直接用 Excel 打开中文字段。</p>
        <div className="mod-research-export-grid">
          <article>
            <span>01 · PAIRED M1</span>
            <h2>M1 人类 + Agent</h2>
            <p>合并 <code>pilot-m1</code> 与 <code>agent-pilot-m1</code>，用于直接比较同一初批协议。</p>
            <a href="/api/research-export?scope=m1">下载 M1 配对 CSV</a>
          </article>
          <article>
            <span>02 · AGENT</span>
            <h2>全部 Agent 回答</h2>
            <p>筛选 <code>actor_type=agent</code>，包含固定 M1 与 Agent 模块控制台产生的记录。</p>
            <a href="/api/research-export?scope=agent">下载 Agent CSV</a>
          </article>
          <article>
            <span>03 · HUMAN PILOT</span>
            <h2>仅人类 M1 初批</h2>
            <p>只包含独立人类初批入口产生、实验臂标记为 <code>pilot-m1</code> 的记录。</p>
            <a href="/api/research-export?scope=pilot">下载人类 M1 CSV</a>
          </article>
          <article>
            <span>04 · ALL MODULES</span>
            <h2>完整控制台实验</h2>
            <p>包含人类、Agent、M1—M4 与历史模块化会话的全部逐步记录，便于统一备份。</p>
            <a href="/api/research-export?scope=all">下载全部实验 CSV</a>
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
