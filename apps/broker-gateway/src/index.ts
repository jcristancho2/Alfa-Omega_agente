import type {
  BracketOrderRequest,
  BrokerAccount,
  BrokerExecution,
  BrokerId,
  BrokerInstrument,
  BrokerOrder,
  BrokerPosition,
  Candle,
  OrderRequest,
  Timeframe
} from "@alfa-omega/trading-types";
import { Hono } from "hono";
import { z } from "zod";

const app = new Hono();
const port = Number(process.env.PORT ?? process.env.BROKER_GATEWAY_PORT ?? 4100);
const apiKey = process.env.BROKER_GATEWAY_API_KEY ?? "";
const executorUrl = process.env.IBKR_EXECUTOR_URL ?? "http://localhost:8080";
const executorApiKey = process.env.IBKR_EXECUTOR_API_KEY ?? "";

const brokers = [
  { id: "simulated" as const, name: "Simulated Broker", supportsBracketOrders: true },
  { id: "ibkr" as const, name: "Interactive Brokers", supportsBracketOrders: true }
];

const simulatedInstruments: BrokerInstrument[] = [
  { assetClass: "STK", brokerId: "simulated", currency: "USD", exchange: "SIM", instrumentId: "265598", minTick: 0.01, name: "Apple Inc.", symbol: "AAPL" },
  { assetClass: "STK", brokerId: "simulated", currency: "USD", exchange: "SIM", instrumentId: "272093", minTick: 0.01, name: "Microsoft Corp.", symbol: "MSFT" },
  { assetClass: "STK", brokerId: "simulated", currency: "USD", exchange: "SIM", instrumentId: "76792991", minTick: 0.01, name: "Tesla Inc.", symbol: "TSLA" },
  { assetClass: "IND", brokerId: "simulated", currency: "USD", exchange: "CBOE", instrumentId: "416904", name: "S&P 500 Index", symbol: "SPX", tradable: false },
  { assetClass: "ETF", brokerId: "simulated", currency: "USD", exchange: "ARCA", instrumentId: "756733", minTick: 0.01, name: "SPDR S&P 500 ETF Trust", symbol: "SPY", tradable: true },
  { assetClass: "ETF", brokerId: "simulated", currency: "USD", exchange: "NASDAQ", instrumentId: "320227571", minTick: 0.01, name: "Invesco QQQ Nasdaq 100 ETF", symbol: "QQQ", tradable: true },
  { assetClass: "ETF", brokerId: "simulated", currency: "USD", exchange: "ARCA", instrumentId: "225815195", minTick: 0.01, name: "iShares Russell 2000 ETF", symbol: "IWM", tradable: true },
  { assetClass: "ETF", brokerId: "simulated", currency: "USD", exchange: "ARCA", instrumentId: "23960192", minTick: 0.01, name: "SPDR Dow Jones Industrial Average ETF", symbol: "DIA", tradable: true },
  { assetClass: "ETF", brokerId: "simulated", currency: "EUR", exchange: "IBIS", instrumentId: "200001", minTick: 0.01, name: "iShares Core DAX ETF", symbol: "EXS1", tradable: true },
  { assetClass: "ETF", brokerId: "simulated", currency: "GBP", exchange: "LSE", instrumentId: "200002", minTick: 0.01, name: "iShares Core FTSE 100 ETF", symbol: "ISF", tradable: true },
  { assetClass: "ETF", brokerId: "simulated", currency: "USD", exchange: "ARCA", instrumentId: "200003", minTick: 0.01, name: "iShares MSCI Japan ETF Nikkei", symbol: "EWJ", tradable: true }
];
const simulatedOrders = new Map<string, BrokerOrder>();
let simulatedOrderSequence = 1000;

const OrderSchema = z.object({
  accountId: z.string().min(1),
  accountMode: z.literal("paper").default("paper"),
  assetClass: z.string().default("STK"),
  brokerId: z.enum(["ibkr", "simulated"]).optional(),
  conid: z.number().int().positive().optional(),
  currency: z.string().default("USD"),
  exchange: z.string().default("SMART"),
  idempotencyKey: z.string().optional(),
  instrumentId: z.string().min(1),
  limitPrice: z.number().positive().optional(),
  orderType: z.enum(["LMT", "MKT", "STP", "STOP_LIMIT"]),
  quantity: z.number().positive(),
  side: z.enum(["BUY", "SELL"]),
  symbol: z.string().min(1),
  tif: z.enum(["DAY", "GTC", "IOC"]).default("DAY")
});
const BracketSchema = OrderSchema.extend({
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive()
});

async function executor(path: string, init?: RequestInit) {
  const response = await fetch(`${executorUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": executorApiKey,
      ...(init?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`IBKR executor ${response.status}: ${JSON.stringify(data)}`);
  return data as Record<string, unknown>;
}

function extractData(data: Record<string, unknown>) {
  return (data.data ?? data) as Record<string, unknown>;
}

function fakeCandles(instrumentId: string, timeframe: Timeframe, limit: number): Candle[] {
  const seed = Number(instrumentId.replace(/\D/g, "").slice(-4)) || 100;
  const stepMinutes: Record<Timeframe, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };
  return Array.from({ length: limit }, (_, index) => {
    const base = 80 + (seed % 100) + index * 0.12 + Math.sin(index / 3) * 1.5;
    return {
      close: Number((base + Math.sin(index) * 0.3).toFixed(4)),
      high: Number((base + 0.8).toFixed(4)),
      low: Number((base - 0.8).toFixed(4)),
      open: Number(base.toFixed(4)),
      timestamp: new Date(Date.now() - (limit - index) * stepMinutes[timeframe] * 60_000).toISOString(),
      volume: 1000 + index * 11
    };
  });
}

function fakeMarketData(instrumentId: string) {
  const last = fakeCandles(instrumentId, "1m", 1)[0]?.close ?? 100;
  return {
    ask: Number((last + 0.02).toFixed(4)),
    bid: Number((last - 0.02).toFixed(4)),
    close: last,
    conid: instrumentId,
    last,
    marketPrice: last,
    mode: "simulated",
    tradable: true
  };
}

function simulatedOrder(input: OrderRequest, suffix = "", overrides: Partial<BrokerOrder> = {}): BrokerOrder {
  const brokerOrderId = String(++simulatedOrderSequence) + suffix;
  const order: BrokerOrder = {
    brokerOrderId,
    filledQuantity: 0,
    limitPrice: input.limitPrice,
    quantity: input.quantity,
    remainingQuantity: input.quantity,
    side: input.side,
    status: "submitted",
    symbol: input.symbol,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
  simulatedOrders.set(brokerOrderId, order);
  return order;
}

function brokerId(value: string): BrokerId {
  if (value !== "ibkr" && value !== "simulated") throw new Error(`unsupported broker: ${value}`);
  return value;
}

app.onError((error, c) => c.json({ error: error.message, ok: false }, 500));
app.use("*", async (c, next) => {
  if (c.req.path === "/health") return next();
  if (apiKey && c.req.header("x-api-key") !== apiKey) return c.json({ ok: false, error: "unauthorized" }, 401);
  return next();
});

app.get("/health", (c) => c.json({ ok: true, service: "broker-gateway", timestamp: new Date().toISOString() }));
app.get("/brokers", (c) => c.json({ ok: true, data: brokers }));

app.get("/brokers/:brokerId/accounts", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  if (id === "simulated") {
    const accounts: BrokerAccount[] = [{ accountId: "SIM-PAPER", brokerId: id, currency: "USD", displayName: "Simulated Paper", mode: "paper" }];
    return c.json({ ok: true, data: accounts });
  }
  const raw = extractData(await executor("/ibkr/accounts"));
  const values = (Array.isArray(raw) ? raw : raw.accounts ?? []) as unknown[];
  const accounts: BrokerAccount[] = values.map((account) => {
    const row = account && typeof account === "object" ? account as Record<string, unknown> : null;
    const accountId = String(row?.accountId ?? row?.id ?? account);
    return {
    accountId,
    brokerId: "ibkr",
    currency: String(row?.currency ?? "USD"),
    displayName: String(row?.displayName ?? `IBKR ${accountId}`),
    mode: "paper"
  }});
  return c.json({ ok: true, data: accounts });
});

app.get("/brokers/:brokerId/instruments/search", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  const query = (c.req.query("q") ?? "").trim();
  if (!query) return c.json({ ok: true, data: [] });
  const assetClass = c.req.query("assetClass")?.trim().toUpperCase();
  const currency = c.req.query("currency")?.trim().toUpperCase();
  const exchange = c.req.query("exchange")?.trim().toUpperCase();
  const tradable = c.req.query("tradable");
  const page = Math.max(Number(c.req.query("page") ?? 1), 1);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 25), 1), 100);
  const filter = (items: BrokerInstrument[]) => {
    const filtered = items.filter((item) => {
      if (assetClass && item.assetClass.toUpperCase() !== assetClass) return false;
      if (currency && item.currency.toUpperCase() !== currency) return false;
      if (exchange && item.exchange.toUpperCase() !== exchange) return false;
      if (tradable === "true" && item.tradable === false) return false;
      if (tradable === "false" && item.tradable !== false) return false;
      return true;
    });
    return filtered.slice((page - 1) * limit, page * limit);
  };
  if (id === "simulated") {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const needle = normalize(query);
    return c.json({ ok: true, data: filter(simulatedInstruments.filter((item) => normalize(`${item.symbol} ${item.name}`).includes(needle))) });
  }
  const instruments = (extractData(await executor(`/instruments/search?q=${encodeURIComponent(query)}`)).instruments ?? []) as BrokerInstrument[];
  return c.json({ ok: true, data: filter(instruments) });
});

app.get("/brokers/:brokerId/instruments/:instrumentId/candles", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  const timeframe = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).parse(c.req.query("timeframe") ?? "1h");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100), 2), 500);
  if (id === "simulated") return c.json({ ok: true, data: fakeCandles(c.req.param("instrumentId"), timeframe, limit) });
  const path = `/instruments/${encodeURIComponent(c.req.param("instrumentId"))}/candles?timeframe=${timeframe}&limit=${limit}`;
  return c.json({ ok: true, data: extractData(await executor(path)).candles ?? [] });
});

app.get("/brokers/:brokerId/instruments/:instrumentId/marketdata", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  const instrumentId = c.req.param("instrumentId");
  if (id === "simulated") return c.json({ ok: true, data: fakeMarketData(instrumentId) });
  return c.json({ ok: true, data: extractData(await executor(`/marketdata/${encodeURIComponent(instrumentId)}`)) });
});

for (const action of ["preview", "submit"] as const) {
  app.post(`/brokers/:brokerId/orders/${action}`, async (c) => {
    const id = brokerId(c.req.param("brokerId"));
    const body = await c.req.json().catch(() => ({}));
    const isBracket = body && typeof body === "object" && "stopLoss" in body && "takeProfit" in body;
    const parsed = (isBracket ? BracketSchema : OrderSchema).safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400);
    if (id === "simulated") {
      if (action === "preview") return c.json({ ok: true, data: { dryRun: true, order: parsed.data } });
      const parent = simulatedOrder(parsed.data as OrderRequest);
      const closingSide = parsed.data.side === "BUY" ? "SELL" : "BUY";
      const bracket = isBracket ? parsed.data as z.infer<typeof BracketSchema> : null;
      const data = isBracket
        ? [
            parent,
            simulatedOrder(parsed.data as OrderRequest, "-SL", { limitPrice: undefined, side: closingSide, stopPrice: bracket?.stopLoss }),
            simulatedOrder(parsed.data as OrderRequest, "-TP", { limitPrice: bracket?.takeProfit, side: closingSide })
          ]
        : parent;
      return c.json({ ok: true, data });
    }
    const endpoint = isBracket ? `/orders/bracket/${action}` : `/orders/${action === "submit" ? "" : "preview"}`;
    return c.json({ ok: true, data: await executor(endpoint.replace(/\/$/, ""), { body: JSON.stringify({ ...parsed.data, conid: parsed.data.conid ?? Number(parsed.data.instrumentId) }), method: "POST" }) });
  });
}

app.get("/brokers/:brokerId/orders/open", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  if (id === "simulated") return c.json({ ok: true, data: [...simulatedOrders.values()].filter((order) => order.status === "submitted" || order.status === "partially_filled") });
  return c.json({ ok: true, data: extractData(await executor("/orders/open")) });
});

app.get("/brokers/:brokerId/orders/:orderId", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  if (id === "simulated") return c.json({ ok: true, data: simulatedOrders.get(c.req.param("orderId")) ?? null });
  return c.json({ ok: true, data: extractData(await executor(`/orders/${encodeURIComponent(c.req.param("orderId"))}`)) });
});

app.delete("/brokers/:brokerId/orders/:orderId", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  if (id === "simulated") {
    const order = simulatedOrders.get(c.req.param("orderId"));
    if (!order) return c.json({ ok: false, error: "order not found" }, 404);
    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();
    return c.json({ ok: true, data: order });
  }
  return c.json({ ok: true, data: extractData(await executor(`/orders/${encodeURIComponent(c.req.param("orderId"))}`, { method: "DELETE" })) });
});

app.get("/brokers/:brokerId/positions", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  const positions: BrokerPosition[] = [];
  if (id === "simulated") return c.json({ ok: true, data: positions });
  const accountId = c.req.query("accountId");
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return c.json({ ok: true, data: extractData(await executor(`/portfolio${query}`)) });
});

app.get("/brokers/:brokerId/executions", async (c) => {
  const id = brokerId(c.req.param("brokerId"));
  const executions: BrokerExecution[] = [];
  if (id === "simulated") return c.json({ ok: true, data: executions });
  return c.json({ ok: true, data: extractData(await executor("/executions")) });
});

Bun.serve({ fetch: app.fetch, hostname: "0.0.0.0", idleTimeout: 60, port });
console.log(`Broker Gateway running on http://localhost:${port}`);
