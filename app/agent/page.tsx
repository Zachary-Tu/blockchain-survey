import type { Metadata } from "next";
import { ExperimentModular } from "../ExperimentModular";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 阶段判断实验",
  description: "固定三阶段、六曲线、七轮判断的 M1 实验。",
  openGraph: { images: [] },
  twitter: { card: "summary", images: [] },
};

export default function AgentFullExperimentPage() {
  return <ExperimentModular entryMode="agent-m1" />;
}
