import { validateOrderRisk } from "@alfa-omega/risk-engine";
import type { TradeOrderResponse } from "@alfa-omega/trading-types";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "./config";
import {
  cancelBrokerOrder,
  getBrokerAccounts,
  getBrokerAuthStatus,
  getBrokerExecutions,
  getBrokerMarketDataSnapshot,
  getBrokerOpenOrders,
  getBrokerPortfolio,
  initializeBrokerSession,
  placeBrokerOrder,
  previewBrokerOrder,
  replyToBrokerWarning,
  tickleBrokerSession
} from "./lib/broker-client";

const app = new Hono();

app.onError((error, c) =>
  c.json(
    {
      error: error.message,
      ok: false
    },
    500
  )
);

const OrderSchema = z.object({
  accountId: z.string().optional(),
  accountMode: z.enum(["paper", "live"]).default("paper"),
  conid: z.number().int().positive(),
  limitPrice: z.number().positive().optional(),
  orderType: z.enum(["LMT", "MKT", "STP", "STOP_LIMIT"]),
  quantity: z.number().positive(),
  side: z.enum(["BUY", "SELL"]),
  symbol: z.string().min(1),
  tif: z.enum(["DAY", "GTC", "IOC"]).default("DAY")
});

const ReplySchema = z.object({
  confirmed: z.boolean().default(false)
});

function isWarningResponse(data: unknown): string | null {
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (entry && typeof entry === "object" && "id" in entry && "message" in entry) {
        return String((entry as { id: unknown }).id);
      }
    }
  }
  if (data && typeof data === "object" && "id" in data && "message" in data) {
    return String((data as { id: unknown }).id);
  }
  return null;
}

function toIbkrOrder(input: z.infer<typeof OrderSchema>) {
  return {
    conid: input.conid,
    orderType: input.orderType,
    outsideRTH: false,
    price: input.limitPrice,
    quantity: input.quantity,
    side: input.side,
    ticker: input.symbol,
    tif: input.tif
  };
}

function dryRunResponse(status: TradeOrderResponse["status"], rawResponse: unknown): TradeOrderResponse {
  return {
    dryRun: true,
    rawResponse,
    requiresManualConfirmation: false,
    status
  };
}

app.get("/health", (c) =>
  c.json({
    dryRun: config.dryRun,
    mode: config.connectionMode,
    ok: true,
    service: "ibkr-executor",
    timestamp: new Date().toISOString()
  })
);

app.use("*", async (c, next) => {
  if (c.req.path === "/health") {
    return next();
  }
  const apiKey = c.req.header("x-api-key");
  if (!config.apiKey || apiKey !== config.apiKey) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/ibkr/auth-status", async (c) => c.json({ ok: true, ...(await getBrokerAuthStatus()) }));
app.get("/ibkr/accounts", async (c) => c.json({ ok: true, ...(await getBrokerAccounts()) }));
app.post("/ibkr/initialize", async (c) =>
  c.json({ ok: true, ...(await initializeBrokerSession()) })
);
app.post("/ibkr/tickle", async (c) => c.json({ ok: true, ...(await tickleBrokerSession()) }));
app.get("/marketdata/:conid", async (c) =>
  c.json({ ok: true, ...(await getBrokerMarketDataSnapshot(c.req.param("conid"))) })
);
app.get("/orders/open", async (c) => c.json({ ok: true, ...(await getBrokerOpenOrders()) }));
app.get("/portfolio", async (c) => c.json({ ok: true, ...(await getBrokerPortfolio()) }));
app.get("/executions", async (c) => c.json({ ok: true, ...(await getBrokerExecutions()) }));

app.post("/orders/preview", async (c) => {
  const parsed = OrderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }
  const accountId = parsed.data.accountId ?? config.ibkrAccountId;
  const risk = validateOrderRisk({
    ...parsed.data,
    allowLiveTrading: config.allowLiveTrading,
    dailyTrades: 0,
    killSwitch: false,
    maxDailyTrades: config.maxDailyTrades,
    maxOrderNotional: config.maxOrderNotional,
    maxOrderQty: config.maxOrderQty
  });
  if (!risk.passed) {
    return c.json({ ok: false, risk }, 400);
  }
  if (config.dryRun) {
    return c.json({
      ok: true,
      ...dryRunResponse("previewed", { accountId, order: toIbkrOrder(parsed.data), risk })
    });
  }
  await getBrokerMarketDataSnapshot(String(parsed.data.conid));
  const response = await previewBrokerOrder(accountId, toIbkrOrder(parsed.data));
  return c.json({
    dryRun: false,
    ok: true,
    rawResponse: response.data,
    requiresManualConfirmation: false,
    status: "previewed"
  });
});

app.post("/orders", async (c) => {
  const parsed = OrderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }
  const accountId = parsed.data.accountId ?? config.ibkrAccountId;
  const risk = validateOrderRisk({
    ...parsed.data,
    allowLiveTrading: config.allowLiveTrading,
    dailyTrades: 0,
    killSwitch: false,
    maxDailyTrades: config.maxDailyTrades,
    maxOrderNotional: config.maxOrderNotional,
    maxOrderQty: config.maxOrderQty
  });
  if (!risk.passed) {
    return c.json({ ok: false, risk }, 400);
  }
  if (config.dryRun) {
    return c.json({
      ok: true,
      ...dryRunResponse("submitted", { accountId, order: toIbkrOrder(parsed.data), risk })
    });
  }
  await getBrokerMarketDataSnapshot(String(parsed.data.conid));
  const response = await placeBrokerOrder(accountId, toIbkrOrder(parsed.data));
  const replyId = isWarningResponse(response.data);
  if (replyId && !config.autoConfirmWarnings) {
    return c.json({
      brokerReplyId: replyId,
      dryRun: false,
      ok: true,
      rawResponse: response.data,
      requiresManualConfirmation: true,
      status: "broker_warning"
    });
  }
  return c.json({
    dryRun: false,
    ok: true,
    rawResponse: response.data,
    requiresManualConfirmation: false,
    status: "submitted"
  });
});

app.post("/orders/reply/:replyId", async (c) => {
  const parsed = ReplySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }
  if (!config.autoConfirmWarnings && parsed.data.confirmed) {
    return c.json({ ok: false, error: "warning auto-confirmation is disabled" }, 403);
  }
  const response = await replyToBrokerWarning(c.req.param("replyId"), parsed.data.confirmed);
  return c.json({ ok: true, ...response });
});

app.delete("/orders/:orderId", async (c) => {
  const accountId = c.req.query("accountId") ?? config.ibkrAccountId;
  const response = await cancelBrokerOrder(accountId, c.req.param("orderId"));
  return c.json({ ok: true, ...response });
});

Bun.serve({
  fetch: app.fetch,
  hostname: "0.0.0.0",
  port: config.port
});

console.log(`IBKR executor running on http://localhost:${config.port}`);
