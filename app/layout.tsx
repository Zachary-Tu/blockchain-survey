import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boundary Lab｜人类与 Agent 的阶段上下文弹性实验",
  description:
    "在同一条 Bitcoin 价格曲线上逐层披露坐标、身份、日期、价格与事件，记录阶段边界如何被修正。",
  openGraph: {
    title: "Boundary Lab｜阶段上下文弹性实验",
    description: "比较人类与多模态 Agent 在语义信息逐层披露时如何修正阶段边界。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "价格曲线穿过六层语义信息，并由两个阶段边界切分",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Boundary Lab｜阶段上下文弹性实验",
    description: "比较人类与多模态 Agent 如何修正同一条曲线的阶段边界。",
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
