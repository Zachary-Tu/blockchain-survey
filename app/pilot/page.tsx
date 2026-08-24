import type { Metadata } from "next";
import { ExperimentModular } from "../ExperimentModular";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 初批实验",
  description: "M1 信息披露主实验的独立参与者入口。",
  openGraph: {
    title: "Boundary Lab｜M1 初批实验",
    description: "固定三阶段任务，按信息层依次完成六条曲线的基线判断与六步信息披露。",
    type: "website",
    locale: "zh_CN",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "Boundary Lab｜M1 初批实验",
    description: "M1 信息披露主实验的独立参与者入口。",
    images: [],
  },
};

export default function PilotPage() {
  return <ExperimentModular entryMode="pilot" />;
}
