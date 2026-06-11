import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard-shell";
import "./globals.css";

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
    <html lang="es" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
