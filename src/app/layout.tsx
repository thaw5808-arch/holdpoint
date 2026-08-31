import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jet = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jet" });

export const metadata: Metadata = {
  title: "Holdpoint — hold your ground",
  description:
    "Watch, play, team up and compete. Holdpoint is where your gaming identity lives, live or not.",
};

export const viewport: Viewport = {
  themeColor: "#0d1310",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${chakra.variable} ${inter.variable} ${jet.variable}`}>
      <body>{children}</body>
    </html>
  );
}
