import type { Metadata } from "next";
import { AgentExperiment } from "../../AgentExperiment";

export const metadata: Metadata = {
  title: "Boundary Lab｜保留的 Agent 模块控制台",
  description: "上一版可配置 Agent 控制台入口；正式入口已汇总至 /agent。",
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentConsolePage() {
  return <AgentExperiment mode="console" />;
}
