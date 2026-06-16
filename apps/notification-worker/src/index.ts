import { readDb, writeDb } from "../../../packages/shared/src/index";

const kapsoApiKey = process.env.KAPSO_API_KEY;
const pollInterval = Number(process.env.WORKER_POLL_INTERVAL_SECONDS || 10) * 1000;

async function sendKapsoMessage(message: string) {
  if (!kapsoApiKey) {
    console.log("[KAPSO MOCK]", message);
    return;
  }

  console.log("[KAPSO SEND]", message);
}

async function processNotifications() {
  const db = await readDb();
  const pending = db.notifications
    .filter((n) => n.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 5);

  for (const notification of pending) {
    await sendKapsoMessage(notification.message);
    notification.status = "sent";
  }

  if (pending.length > 0) {
    await writeDb(db);
  }
}

const persistence = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? "supabase"
  : "local";
console.log(`ALFA-OMEGA notification worker iniciado (${persistence} data mode)`);
setInterval(processNotifications, pollInterval);
await processNotifications();
