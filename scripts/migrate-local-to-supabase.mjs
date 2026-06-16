import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeDb } from "../packages/shared/src/local-db";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const path = resolve(process.cwd(), process.env.LOCAL_DB_PATH || "data/local-db.json");
const db = JSON.parse(await readFile(path, "utf8"));

await writeDb(db);

console.log("Local persistence copied to Supabase.");
console.log(`Source: ${path}`);
console.log(`Signals: ${db.signals?.length ?? 0}`);
console.log(`Trades: ${db.trades?.length ?? 0}`);
console.log(`Notifications: ${db.notifications?.length ?? 0}`);
console.log(`System logs: ${db.system_logs?.length ?? 0}`);
