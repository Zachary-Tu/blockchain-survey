import type { Metadata } from "next";
import { TimClassroom } from "./TimClassroom";
import "./tim-classroom.css";

const title = "Tim小课堂｜四门随机10题与能力报告";
const description =
  "跟着不同动作的像素 Tim 从 240 题池随机挑战 10 题，即时查看对错，并生成体育、图论、凸优化或恋爱能力报告。";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/tim-classroom/og-tim-classroom-v2.png",
        width: 1536,
        height: 1024,
        alt: "Tim小课堂：四门随机10题与体育、图论、凸优化、恋爱能力报告",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/tim-classroom/og-tim-classroom-v2.png"],
  },
};

export default function TimClassroomPage() {
  return <TimClassroom />;
}
