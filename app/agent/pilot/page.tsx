import type { Metadata } from "next";
import { AgentExperiment } from "../../AgentExperiment";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 Agent 初批实验",
  description: "固定配置、JSON 作答的 M1 Agent 阶段判断实验。",
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentPilotPage() {
  return <AgentExperiment mode="pilot" />;
}
