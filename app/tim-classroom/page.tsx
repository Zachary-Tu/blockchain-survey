import type { Metadata } from "next";
import { TimClassroom } from "./TimClassroom";
import "./tim-classroom.css";

const title = "Tim小课堂｜三分钟知识挑战";
const description =
  "跟着像素 Tim 挑战运动、图神经网络与恋爱沟通三门小课堂。";

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
        alt: "Tim小课堂：运动、图论与恋爱三门知识挑战",
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
