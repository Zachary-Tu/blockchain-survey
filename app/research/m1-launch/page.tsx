import type { Metadata } from "next";
import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { M1LaunchClient } from "./M1LaunchClient";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 配对会话启动器",
  description: "研究者用于生成 Human–Agent 同构 M1 配对链接的操作页。",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default async function M1LaunchPage() {
  const researcher = await requireChatGPTUser("/research/m1-launch");
  return (
    <main className="mod-site mod-m1-launch-page">
      <header className="mod-topbar">
        <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>04</b></Link>
        <span>RESEARCHER · {researcher.email}</span>
      </header>
      <section className="mod-m1-launch-shell">
        <span className="mod-eyebrow">PAIRED ASSIGNMENT · HUMAN / AGENT</span>
        <h1>为同一实验计划，<br />生成两条配对入口。</h1>
        <p>在当前开发测试阶段，本页会为同一个 pair 生成两条只含 256-bit 随机令牌的链接：一条供 Human 使用，一条供 Agent 使用。两侧共享信息条件与 Williams 顺序，pair、条件、顺序和匿名编号不会出现在受试者 URL 中。这个操作页只供研究团队使用。</p>
        <M1LaunchClient />
        <aside><strong>上下文与执行约束</strong><p>每个 Agent run 使用一个全新的模型上下文，并在该 run 的 42 个页面内持续保留；不同 run 之间不得继承聊天历史。每个 token 绑定 actor、pair、匿名编号和 replicate，首次成功创建后只能幂等恢复同一 session。当前默认的手动配额只用于开发诊断；正式实验另行启用服务端平衡随机、冻结模型配置、1440×900 视口、截图输入与坐标交互。</p></aside>
        <div className="mod-launch-links"><Link href="/methodology/m1">查看冻结方法架构 →</Link><Link href="/research/results">打开结果导出 →</Link></div>
      </section>
    </main>
  );
}
