import type { Metadata } from "next";
import { ExperimentModular } from "../../ExperimentModular";

export const metadata: Metadata = {
  title: "Boundary Lab｜Agent M1 同构主实验",
  description: "兼容入口：转入与人类 M1 完全同构的多模态 Agent 实验。",
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentPilotPage() {
  return <ExperimentModular entryMode="agent-m1" />;
}
