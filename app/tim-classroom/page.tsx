import type { Metadata } from "next";
import { TimClassroom } from "./TimClassroom";
import "./tim-classroom.css";
import "./go/go-classroom.css";

const title = "Tim小课堂｜六门课程、双棋 AI 与李来历险记";
const description =
  "跟着像素 Tim 学习体育、图论、凸优化、恋爱、围棋与象棋，也可在李来历险记中蓄力跳过北大、普林斯顿与 MIT 三段学习轨迹。";

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
        alt: "Tim小课堂：六门课程、围棋象棋 AI 与李来历险记",
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
