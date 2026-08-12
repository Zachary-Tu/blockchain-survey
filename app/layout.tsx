import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./v2.css";
import "./v3.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boundary Lab｜阶段判断的上下文弹性研究",
  description:
    "比较人类与多模态 Agent 在三类时间序列上的阶段判断，并测量四级语义披露如何改变分界点及其不确定范围。",
  openGraph: {
    title: "Boundary Lab｜阶段判断的上下文弹性研究",
    description:
      "三类曲线、六个配对任务条件、四级信息披露：比较人类与 Agent 的分界点和不确定范围如何随语义而改变。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Boundary Lab 多指标阶段判断与四级信息披露研究界面",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Boundary Lab｜阶段判断的上下文弹性研究",
    description:
      "三类曲线、六个配对任务条件与四级信息披露，测量人类与 Agent 的上下文弹性。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
