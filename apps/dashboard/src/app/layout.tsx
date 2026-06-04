import type { Metadata } from "next";
import { Barlow, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dashboardSans = Barlow({
  variable: "--font-dashboard-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dashboardMono = JetBrains_Mono({
  variable: "--font-dashboard-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ALFA-OMEGA Dashboard",
  description: "Panel operativo local de ALFA-OMEGA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${dashboardSans.variable} ${dashboardMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
