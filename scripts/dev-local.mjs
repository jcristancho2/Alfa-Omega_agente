import { spawn } from "node:child_process";

const includeBroker = process.argv.includes("--broker");

const defaults = {
  API_PORT: "4000",
  API_BASE_URL: "http://localhost:4000",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
  DASHBOARD_PORT: "3000",
  LOCAL_DB_PATH: "data/local-db.json",
  TRADING_MODE: "simulated",
  WORKER_POLL_INTERVAL_SECONDS: "10"
};

const env = { ...defaults, ...process.env };

const services = [
  {
    name: "api",
    command: "bun",
    args: ["--cwd", "apps/api", "dev"],
    color: "\x1b[36m"
  },
  {
    name: "engine",
    command: "python3",
    args: ["apps/trading-engine/main.py"],
    color: "\x1b[35m"
  },
  {
    name: "notify",
    command: "bun",
    args: ["--cwd", "apps/notification-worker", "dev"],
    color: "\x1b[33m"
  },
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
];

if (includeBroker) {
  services.push({
    name: "broker",
    command: "bun",
    args: ["--cwd", "apps/broker-gateway", "dev"],
    color: "\x1b[34m"
  });
}

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
    console.error(`${service.color}[${service.name}]${reset} exited with ${detail}`);
    shutdown(code || 1);
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
console.log(`DB:        ${env.LOCAL_DB_PATH}`);
console.log(`Mode:      ${env.TRADING_MODE}`);
console.log("Stop:      Ctrl+C\n");

for (const service of services) {
  startService(service);
}
