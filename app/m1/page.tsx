import type { Metadata } from "next";
import { ExperimentModular } from "../ExperimentModular";

export const metadata: Metadata = {
  title: "Boundary Lab｜人类 M1 主实验",
  description: "面向人类被测试者的固定 M1 信息披露主实验。",
  openGraph: {
    title: "Boundary Lab｜人类 M1 主实验",
    description: "固定三阶段任务，按信息层依次完成六条曲线的基线判断与六步信息披露。",
    type: "website",
    locale: "zh_CN",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "Boundary Lab｜人类 M1 主实验",
    description: "面向人类被测试者的固定 M1 信息披露主实验。",
    images: [],
  },
};

export default function HumanM1Page() {
  return <ExperimentModular entryMode="m1" />;
}
