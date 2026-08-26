import type { Metadata } from "next";
import Link from "next/link";
import { M1LaunchClient } from "./M1LaunchClient";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 配对会话启动器",
  description: "研究者用于生成 Human–Agent 同构 M1 配对链接的操作页。",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function M1LaunchPage() {
  return (
    <main className="mod-site mod-m1-launch-page">
      <header className="mod-topbar">
        <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>04</b></Link>
        <span>RESEARCHER LAUNCH CONSOLE</span>
      </header>
      <section className="mod-m1-launch-shell">
        <span className="mod-eyebrow">PAIRED ASSIGNMENT · HUMAN / AGENT</span>
        <h1>为同一实验计划，<br />生成两条配对入口。</h1>
        <p>服务端先在 2 个信息条件 × 6 个 Williams 顺序的 12 个格子中进行平衡随机分配，再生成两条只含 256-bit 随机令牌的链接。pair、条件、顺序和匿名编号不会出现在受试者 URL 中。这个操作页不应展示给测试者。</p>
        <M1LaunchClient />
        <aside><strong>执行约束</strong><p>正式实验使用服务端平衡随机模式；手动配额仅用于内部诊断。每个 token 绑定 actor、pair、匿名编号和 replicate，首次成功创建后只能幂等恢复同一 session。主比较 Agent 使用 persistent context、固定 1440×900 视口、截图输入和坐标点击/拖动。</p></aside>
        <div className="mod-launch-links"><Link href="/methodology/m1">查看冻结方法架构 →</Link><Link href="/research/results">打开结果导出 →</Link></div>
      </section>
    </main>
  );
}
