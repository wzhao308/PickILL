import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PickILL",
  description:
    "A live queue board for UIUC's 8 pickleball courts — join a court's line and choose singles or doubles when you're up.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PickILL",
  },
};

export const viewport = {
  themeColor: "#13294B",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
