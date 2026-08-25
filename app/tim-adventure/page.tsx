import type { Metadata } from "next";
import { LiLaiAdventure } from "./LiLaiAdventure";
import "./li-lai-adventure.css";

const title = "李来历险记｜北大、普林斯顿与 MIT 人生三跃";
const description = "从中学校园起步，在同一幅纵向像素地图中蓄力起跳，陪 Tim 跃向北大、普林斯顿与 MIT，并随学习轨迹完成三次校园换装。";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", locale: "zh_CN" },
  twitter: { card: "summary", title, description },
};

export default function TimAdventurePage() {
  return <LiLaiAdventure />;
}
