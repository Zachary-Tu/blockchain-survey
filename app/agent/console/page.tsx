import type { Metadata } from "next";
import { AgentExperiment } from "../../AgentExperiment";

export const metadata: Metadata = {
  title: "Boundary Lab｜Agent 模块实验控制台",
  description: "与人类研究控制台对齐的可配置 Agent 实验入口。",
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentConsolePage() {
  return <AgentExperiment mode="console" />;
}
