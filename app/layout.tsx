import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./v2.css";
import "./v3.css";
import "./modular.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boundary Lab｜模块化阶段判断实验平台",
  description:
    "将信息披露、任务定义、跨指标一致性与稳健性拆为四个独立模块，研究人类与 Agent 如何划分时间序列阶段。",
  openGraph: {
    title: "Boundary Lab｜模块化阶段判断实验平台",
    description:
      "四个可独立运行的研究模块，记录阶段边界、主观范围、信息修正轨迹与完整交互时间。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og-modular.png",
        width: 1536,
        height: 1024,
        alt: "Boundary Lab 模块化阶段判断研究平台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Boundary Lab｜模块化阶段判断实验平台",
    description:
      "信息披露、任务定义、跨指标一致性与稳健性四个模块，测量人类与 Agent 的阶段判断。",
    images: ["/og-modular.png"],
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
