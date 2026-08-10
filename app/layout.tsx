import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./v2.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boundary Lab｜你的分界点，会不会移动？",
  description:
    "在四条加密资产走势上固定选择两个分界点，逐步披露坐标、币种、日期、价格、事件位置和事件名称，测量判断如何改变。",
  openGraph: {
    title: "Boundary Lab｜你的分界点，会不会移动？",
    description: "四条走势、两个分界点、七步信息变化：比较人类与多模态 Agent 的上下文弹性。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "一条价格走势被两个分界点分成三段，并逐步增加七项信息",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Boundary Lab｜你的分界点，会不会移动？",
    description: "四条走势、两个分界点、七步信息变化，测量人类与 Agent 的上下文弹性。",
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
