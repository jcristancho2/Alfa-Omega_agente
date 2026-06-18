import { createClient } from "@supabase/supabase-js";

const kapsoApiKey = process.env.KAPSO_API_KEY ?? "";
const kapsoPhoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID ?? "";
const kapsoApiUrl = process.env.KAPSO_API_URL ?? "";
const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_SECONDS ?? 10) * 1000;

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const db = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  : null;

async function sendKapsoMessage(message: string, recipient?: string | null): Promise<void> {
  if (!kapsoApiKey || !kapsoApiUrl || !kapsoPhoneNumberId) {
    console.log("[KAPSO MOCK]", message);
    return;
  }

  // Wire real HTTP call here once KAPSO_API_URL is set in .env
  // Expected shape (WhatsApp-compatible):
  //   POST ${kapsoApiUrl}/${kapsoPhoneNumberId}/messages
  //   Authorization: Bearer ${kapsoApiKey}
  //   { to: recipient, type: "text", text: { body: message } }
  const res = await fetch(`${kapsoApiUrl}/${kapsoPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${kapsoApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: recipient ?? kapsoPhoneNumberId,
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Kapso HTTP ${res.status}: ${body}`);
  }

  console.log("[KAPSO SENT]", message);
}

async function processNotifications() {
  if (!db) {
    console.warn("[notify] Supabase not configured — skipping");
    return;
  }

  const { data: pending, error } = await db
    .from("notifications")
    .select("id,message,recipient,event_type,channel")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("[notify] fetch error", error.message);
    return;
  }

  for (const n of pending ?? []) {
    try {
      await sendKapsoMessage(n.message, n.recipient);
      await db.from("notifications").update({ status: "sent" }).eq("id", n.id);
    } catch (err) {
      console.error("[notify] send failed", n.id, err);
      await db.from("notifications").update({ status: "failed" }).eq("id", n.id);
    }
  }
}

console.log("ALFA-OMEGA notification worker started");
console.log(`  Supabase: ${db ? "connected" : "NOT configured — mock mode"}`);
console.log(`  Kapso:    ${kapsoApiKey && kapsoApiUrl ? "live" : "mock (set KAPSO_API_KEY + KAPSO_API_URL)"}`);

setInterval(processNotifications, pollInterval);
await processNotifications();
