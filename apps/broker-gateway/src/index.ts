import { Hono } from "hono";

const app = new Hono();
const port = Number(process.env.BROKER_GATEWAY_PORT || 4100);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "broker-gateway",
    mode: process.env.TRADING_MODE || "simulated"
  });
});

app.get("/balance", (c) => {
  return c.json({
    ok: true,
    broker: "simulated",
    balance: 10000,
    currency: "USD"
  });
});

app.get("/positions", (c) => {
  return c.json({
    ok: true,
    positions: []
  });
});

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`Broker Gateway running on http://localhost:${port}`);
