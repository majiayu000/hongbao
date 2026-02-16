import type { Metadata } from "next"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

export const metadata: Metadata = {
  title: "红包封面制作工具",
  description: "在线设计微信红包封面，导出符合规范的高质量图片",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;700&family=ZCOOL+XiaoWei&family=ZCOOL+KuaiLe&family=Ma+Shan+Zheng&family=Liu+Jian+Mao+Cao&family=Long+Cang&family=Zhi+Mang+Xing&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
