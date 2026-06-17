"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const refreshSeconds = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_SECONDS || 3);

export default function DashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    if (!Number.isFinite(refreshSeconds) || refreshSeconds <= 0) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);

    const client = getSupabaseBrowserClient();
    const channel = client
      ?.channel("operator-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_orders" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_events" }, () => router.refresh())
      .subscribe();

    return () => {
      window.clearInterval(interval);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [router]);

  return null;
}
