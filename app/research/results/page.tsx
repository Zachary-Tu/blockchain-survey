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
            <span>01 · PILOT</span>
            <h2>M1 初批实验</h2>
            <p>只包含独立初批入口产生、实验臂标记为 <code>pilot-m1</code> 的记录。</p>
            <a href="/api/research-export?scope=pilot">下载 M1 初批 CSV</a>
          </article>
          <article>
            <span>02 · ALL MODULES</span>
            <h2>完整控制台实验</h2>
            <p>包含 M1—M4 与历史模块化会话的全部逐步记录，便于统一备份。</p>
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
