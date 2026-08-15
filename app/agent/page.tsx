import type { Metadata } from "next";
import { AgentExperiment } from "../AgentExperiment";

export const metadata: Metadata = {
  title: "Boundary Lab｜Agent 全模块实验",
  description: "汇总 M1—M4 控制台条件的 Agent 原生阶段判断实验。",
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentFullExperimentPage() {
  return <AgentExperiment mode="console" />;
}
