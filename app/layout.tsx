import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const baloo = Baloo_2({ subsets: ["latin"], variable: "--font-baloo-2", display: "swap" });

export const metadata: Metadata = {
  title: "AP / IB Practice",
  description: "AP mock exam and IB topic practice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`min-h-full flex flex-col ${nunito.variable} ${baloo.variable}`}>{children}</body>
    </html>
  );
}
