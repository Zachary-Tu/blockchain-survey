import type { Metadata } from "next";
import { TimClassroom } from "./TimClassroom";
import "./tim-classroom.css";

const title = "Tim小课堂｜随机10题与三类能力报告";
const description =
  "跟着像素 Tim 从 180 题池随机挑战 10 题，即时查看对错，并生成图论 IQ、恋爱情商或体育运动能力报告。";

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
        url: "/tim-classroom/og-tim-classroom.png",
        width: 1536,
        height: 1024,
        alt: "Tim小课堂：随机10题与图论IQ、恋爱情商、体育运动能力报告",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/tim-classroom/og-tim-classroom.png"],
  },
};

export default function TimClassroomPage() {
  return <TimClassroom />;
}
