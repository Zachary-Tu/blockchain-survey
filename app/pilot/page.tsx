import type { Metadata } from "next";
import { ExperimentModular } from "../ExperimentModular";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 初批实验",
  description: "M1 信息披露主实验的独立参与者入口。",
  openGraph: {
    title: "Boundary Lab｜M1 初批实验",
    description: "固定三阶段任务；每个信息层依次完成六个单曲线页面，再进入下一层。",
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
