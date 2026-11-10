import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firewatch",
  description: "Fire and carbon monoxide alerts for markets and homes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
