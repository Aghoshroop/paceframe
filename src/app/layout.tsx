import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACEFRAME — Camera-Based Automatic Sprint Timing",
  description:
    "Distance-independent multi-device automatic athletic sprint timing system with continuous video monitoring, synchronized devices, and sub-frame computer vision.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#ccff00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-[#0a0c0f]">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="h-full w-full bg-[#0a0c0f] text-[#f3f4f6] antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
