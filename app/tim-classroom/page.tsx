import type { Metadata } from "next";
import { TimClassroom } from "./TimClassroom";
import "./tim-classroom.css";
import "./go/go-classroom.css";

const title = "Tim小课堂｜五门课程、围棋教学与AI对弈";
const description =
  "跟着不同动作的像素 Tim 学习体育、图论、凸优化、恋爱与围棋；围棋区含10级教学、互动棋盘、AI对弈和趣味证书。";

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
        alt: "Tim小课堂：体育、图论、凸优化、恋爱与围棋学习",
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
