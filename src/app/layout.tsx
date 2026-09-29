import type { Metadata } from "next";
import { Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Noto_Sans_JP({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "UnityCraft AI",
  description: "日本語でゲームの内容を書くと、Unity C#スクリプトを生成してGitHubにpushします。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              UnityCraft AI
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-5 py-10">{children}</main>
      </body>
    </html>
  );
}
