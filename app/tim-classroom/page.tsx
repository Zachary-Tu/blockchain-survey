import type { Metadata } from "next";
import { TimClassroom } from "./TimClassroom";
import "./tim-classroom.css";

const title = "Tim小课堂｜中学、大学、博士三档知识挑战";
const description =
  "跟着像素 Tim 挑战运动、图神经网络与恋爱沟通三门课程，选择中学、大学或博士难度，探索 9 套共 180 道题。";

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
        alt: "Tim小课堂：三门课程、三档难度、共 180 道知识挑战",
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
