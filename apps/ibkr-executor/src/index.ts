import type { TradeOrderResponse } from "@alfa-omega/trading-types";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "./config";
import {
  cancelBrokerOrder,
  getBrokerAccounts,
  getBrokerAuthStatus,
  getBrokerExecutions,
  getBrokerHistoricalData,
  getBrokerMarketDataSnapshot,
  getBrokerOpenOrders,
  getBrokerOrderStatus,
  getBrokerPortfolio,
  initializeBrokerSession,
  placeBrokerOrder,
  placeBrokerBracketOrder,
  previewBrokerOrder,
  previewBrokerBracketOrder,
  replyToBrokerWarning,
  searchBrokerInstruments,
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
  assetClass: z.string().default("STK"),
  conid: z.number().int().positive(),
  currency: z.string().default("USD"),
  exchange: z.string().default("SMART"),
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

const ExecutorRiskSettingsSchema = z.object({
  allowedSymbols: z.array(z.string().trim().min(1)).default([]),
  maxDailyTrades: z.number().int().positive(),
  maxOrderNotional: z.number().positive(),
  maxOrderQty: z.number().positive()
});

let runtimeRiskSettings = {
  allowedSymbols: config.allowedSymbols,
  maxDailyTrades: config.maxDailyTrades,
  maxOrderNotional: config.maxOrderNotional,
  maxOrderQty: config.maxOrderQty
};

const BracketOrderSchema = OrderSchema.extend({
  instrumentId: z.string().optional(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive()
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
    assetClass: input.assetClass,
    conid: input.conid,
    currency: input.currency,
    exchange: input.exchange,
    orderType: input.orderType,
    outsideRTH: false,
    price: input.limitPrice,
    quantity: input.quantity,
    side: input.side,
    ticker: input.symbol,
    tif: input.tif
  };
}

function toIbkrBracket(input: z.infer<typeof BracketOrderSchema>) {
  const closingSide = input.side === "BUY" ? "SELL" : "BUY";
  return [
    toIbkrOrder(input),
    { ...toIbkrOrder(input), orderType: "STP", price: input.stopLoss, side: closingSide, tif: "GTC" },
    { ...toIbkrOrder(input), orderType: "LMT", price: input.takeProfit, side: closingSide, tif: "GTC" }
  ];
}

function dryRunResponse(status: TradeOrderResponse["status"], rawResponse: unknown): TradeOrderResponse {
  return {
    dryRun: true,
    rawResponse,
    requiresManualConfirmation: false,
    status
  };
}

function validateLiveMode(accountMode: "paper" | "live") {
  if (accountMode === "live" && !config.allowLiveTrading) {
    return {
      passed: false,
      reason: "Live trading is disabled",
      rule: "live_trading_disabled"
    };
  }
  return {
    metadata: { riskEngine: "disabled" },
    passed: true,
    reason: null,
    rule: "risk_disabled"
  };
}

function normalizeInstrumentSearch(raw: unknown) {
  const rows =
    raw && typeof raw === "object" && "instruments" in raw
      ? (raw as { instruments?: unknown[] }).instruments ?? []
      : Array.isArray(raw)
        ? raw
        : [];
  return rows.map((entry) => {
    const row = entry as Record<string, unknown>;
    const contract = (row.contract ?? row) as Record<string, unknown>;
    return {
      assetClass: String(contract.secType ?? row.assetClass ?? "STK"),
      brokerId: "ibkr",
      currency: String(contract.currency ?? row.currency ?? "USD"),
      exchange: String(contract.primaryExchange ?? contract.exchange ?? row.exchange ?? "SMART"),
      instrumentId: String(contract.conId ?? row.conid ?? row.instrumentId ?? ""),
      name: String(row.companyName ?? contract.description ?? row.name ?? contract.symbol ?? ""),
      symbol: String(contract.symbol ?? row.symbol ?? ""),
      tradable: String(contract.secType ?? row.assetClass ?? "STK") !== "IND"
    };
  }).filter((entry) => entry.instrumentId && entry.symbol);
}

function normalizeCandles(raw: unknown) {
  const source = raw && typeof raw === "object" && "candles" in raw
    ? (raw as { candles?: unknown[] }).candles ?? []
    : raw && typeof raw === "object" && "data" in raw
      ? (raw as { data?: unknown[] }).data ?? []
      : [];
  return source.map((entry) => {
    const row = entry as Record<string, unknown>;
    const timestamp = row.timestamp ?? row.t ?? new Date().toISOString();
    return {
      close: Number(row.close ?? row.c ?? 0),
      high: Number(row.high ?? row.h ?? 0),
      low: Number(row.low ?? row.l ?? 0),
      open: Number(row.open ?? row.o ?? 0),
      timestamp: typeof timestamp === "number" ? new Date(timestamp).toISOString() : String(timestamp),
      volume: Number(row.volume ?? row.v ?? 0)
    };
  });
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
app.get("/risk/settings", (c) => c.json({ ok: true, data: runtimeRiskSettings }));
app.post("/risk/settings", async (c) => {
  const parsed = ExecutorRiskSettingsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  runtimeRiskSettings = parsed.data;
  return c.json({ ok: true, data: runtimeRiskSettings });
});
app.get("/marketdata/:conid", async (c) =>
  c.json({ ok: true, ...(await getBrokerMarketDataSnapshot(c.req.param("conid"))) })
);
app.get("/instruments/search", async (c) => {
  const result = await searchBrokerInstruments(c.req.query("q") ?? "");
  return c.json({ ok: true, instruments: normalizeInstrumentSearch(result.data) });
});
app.get("/instruments/:conid/candles", async (c) => {
  const result = await getBrokerHistoricalData(
    c.req.param("conid"),
    c.req.query("timeframe") ?? "1h",
    Number(c.req.query("limit") ?? 100)
  );
  return c.json({ ok: true, candles: normalizeCandles(result.data) });
});
app.get("/orders/open", async (c) => c.json({ ok: true, ...(await getBrokerOpenOrders()) }));
app.get("/orders/:orderId", async (c) => c.json({ ok: true, ...(await getBrokerOrderStatus(c.req.param("orderId"))) }));
app.get("/portfolio", async (c) => c.json({ ok: true, ...(await getBrokerPortfolio()) }));
app.get("/executions", async (c) => c.json({ ok: true, ...(await getBrokerExecutions()) }));

app.post("/orders/preview", async (c) => {
  const parsed = OrderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }
  const accountId = parsed.data.accountId ?? config.ibkrAccountId;
  const risk = validateLiveMode(parsed.data.accountMode);
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
  const risk = validateLiveMode(parsed.data.accountMode);
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

for (const action of ["preview", "submit"] as const) {
  app.post(`/orders/bracket/${action}`, async (c) => {
    const parsed = BracketOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400);
    const accountId = parsed.data.accountId ?? config.ibkrAccountId;
    const risk = validateLiveMode(parsed.data.accountMode);
    if (!risk.passed) return c.json({ ok: false, risk }, 400);
    if (config.dryRun) {
      return c.json({ ok: true, ...dryRunResponse(action === "preview" ? "previewed" : "submitted", { accountId, orders: toIbkrBracket(parsed.data), risk }) });
    }
    const response = action === "preview"
      ? await previewBrokerBracketOrder(accountId, toIbkrBracket(parsed.data))
      : await placeBrokerBracketOrder(accountId, toIbkrBracket(parsed.data));
    return c.json({ dryRun: false, ok: true, rawResponse: response.data, requiresManualConfirmation: false, status: action === "preview" ? "previewed" : "submitted" });
  });
}

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
