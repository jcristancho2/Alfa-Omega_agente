"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const refreshSeconds = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_SECONDS || 5);

export default function DashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    if (!Number.isFinite(refreshSeconds) || refreshSeconds <= 0) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
