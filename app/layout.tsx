import type { Metadata } from "next";
import { Inter, Saira } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const saira = Saira({ variable: "--font-saira", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Visitors · Novelty Labels",
  description: "Visitor check-in for the Novelty Labels office.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${saira.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
