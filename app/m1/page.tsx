import type { Metadata } from "next";
import { ExperimentModular } from "../ExperimentModular";

export const metadata: Metadata = {
  title: "Boundary Lab｜M1 阶段判断实验",
  description: "固定三阶段、六曲线、七轮判断的 M1 实验。",
  openGraph: {
    title: "Boundary Lab｜M1 阶段判断实验",
    description: "固定三阶段、六曲线、七轮判断的 M1 实验。",
    type: "website",
    locale: "zh_CN",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "Boundary Lab｜M1 阶段判断实验",
    description: "固定三阶段、六曲线、七轮判断的 M1 实验。",
    images: [],
  },
};

export default function HumanM1Page() {
  return <ExperimentModular entryMode="m1" />;
}
