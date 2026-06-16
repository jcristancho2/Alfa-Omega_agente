"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const refreshSeconds = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_SECONDS || 3);

export default function DashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    if (!Number.isFinite(refreshSeconds) || refreshSeconds <= 0) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const client = url && key ? createClient(url, key) : null;
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
