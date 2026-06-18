const path = require("path");
const root = __dirname;

// Read .env manually — no dotenv dep, no Bun magic
const fs = require("fs");
const envPath = path.join(root, ".env");
const env = { ...process.env };

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in env)) env[key] = val; // shell wins over .env
  }
}

const BUN = "/Users/raucrow/.bun/bin/bun";

module.exports = {
  apps: [
    {
      name: "alfa-api",
      script: BUN,
      args: "src/index.ts",
      cwd: path.join(root, "apps/api"),
      env,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "alfa-notify",
      script: BUN,
      args: "src/index.ts",
      cwd: path.join(root, "apps/notification-worker"),
      env,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "alfa-broker",
      script: BUN,
      args: "src/index.ts",
      cwd: path.join(root, "apps/broker-gateway"),
      env,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "alfa-orchestrator",
      script: BUN,
      args: "src/index.ts",
      cwd: path.join(root, "apps/trading-orchestrator"),
      env,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "alfa-ibkr",
      script: BUN,
      args: "src/index.ts",
      cwd: path.join(root, "apps/ibkr-executor"),
      env,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "alfa-dashboard",
      script: BUN,
      args: ["run", "start"],
      cwd: path.join(root, "apps/dashboard"),
      env: { ...env, PORT: env.DASHBOARD_PORT || "3000" },
      restart_delay: 5000,
      max_restarts: 5,
    },
  ],
};
