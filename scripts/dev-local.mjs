import { spawn } from "node:child_process";
const skipExecutor = process.argv.includes("--no-executor");

const defaults = {
  API_PORT: "4000",
  API_BASE_URL: "http://localhost:4000",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
  DASHBOARD_PORT: "3000",
  TRADING_MODE: "simulated",
  WORKER_POLL_INTERVAL_SECONDS: "10"
};

const env = { ...defaults, ...process.env };

const includeExecutor =
  !skipExecutor && (env.IBKR_CONNECTION_MODE === "tws" || Boolean(env.IBKR_ACCOUNT_ID));
const includeOrchestrator = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const services = [
  {
    name: "api",
    command: "bun",
    args: ["--cwd", "apps/api", "dev"],
    color: "\x1b[36m"
  },
  {
    name: "notify",
    command: "bun",
    args: ["--cwd", "apps/notification-worker", "dev"],
    color: "\x1b[33m"
  }
];

services.push({
  name: "broker",
  command: "bun",
  args: ["--cwd", "apps/broker-gateway", "dev"],
  color: "\x1b[34m"
});

if (includeOrchestrator) {
  services.push({
    name: "orchestrator",
    command: "bun",
    args: ["--cwd", "apps/trading-orchestrator", "dev"],
    color: "\x1b[94m"
  });
}

if (includeExecutor) {
  services.push({
    name: "ibkr",
    command: "bun",
    args: ["--cwd", "apps/ibkr-executor", "dev"],
    color: "\x1b[96m"
  });
}

services.push(
  {
    name: "dashboard",
    command: "bun",
    args: [
      "--cwd",
      "apps/dashboard",
      "dev",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      env.DASHBOARD_PORT
    ],
    color: "\x1b[32m"
  }
);

const reset = "\x1b[0m";
const children = new Map();
let shuttingDown = false;

function prefixLines(name, color, stream, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    stream.write(`${color}[${name}]${reset} ${line}\n`);
  }
}

function startService(service) {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.set(service.name, child);

  child.stdout.on("data", (chunk) =>
    prefixLines(service.name, service.color, process.stdout, chunk)
  );
  child.stderr.on("data", (chunk) =>
    prefixLines(service.name, service.color, process.stderr, chunk)
  );

  child.on("exit", (code, signal) => {
    children.delete(service.name);
    if (shuttingDown) return;

    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`${service.color}[${service.name}]${reset} exited with ${detail} — restarting in 3s`);
    setTimeout(() => {
      if (!shuttingDown) startService(service);
    }, 3000);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children.values()) {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const child of children.values()) {
      child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("ALFA-OMEGA local dev");
console.log(`API:       ${env.API_BASE_URL}`);
console.log(`Dashboard: http://localhost:${env.DASHBOARD_PORT}`);
console.log("Storage:   supabase");
console.log(`Scheduler: ${includeOrchestrator ? `enabled every ${env.ORCHESTRATOR_INTERVAL_MS || "3000"}ms` : "disabled (missing Supabase env)"}`);
console.log(`IBKR:      ${includeExecutor ? `http://localhost:${env.PORT || "8080"}` : "disabled"}`);
console.log(`Mode:      ${env.TRADING_MODE}`);
console.log("Stop:      Ctrl+C\n");

for (const service of services) {
  startService(service);
}
