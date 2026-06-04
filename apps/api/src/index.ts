import { validateOrderRisk } from "@alfa-omega/risk-engine";
import type { TradeOrderResponse } from "@alfa-omega/trading-types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  type LocalDb,
  type SignalRow,
  type TradeRow,
  SignalSchema,
  createId,
  readDb,
  writeDb
} from "../../../packages/shared/src/index";

const app = new Hono();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
app.use("*", cors());
const riskPerTradePct = Number(process.env.RISK_PER_TRADE_PCT || 0.01);
const maxDailyRiskPct = Number(process.env.MAX_DAILY_RISK_PCT || 0.03);
const maxOpenTrades = Number(process.env.MAX_OPEN_TRADES || 3);
const assistantChunkSize = 42;
const ibkrExecutorUrl = process.env.IBKR_EXECUTOR_URL ?? "http://localhost:8080";
const ibkrExecutorApiKey = process.env.IBKR_EXECUTOR_API_KEY ?? "";
const apiAllowLiveTrading = process.env.ALLOW_LIVE_TRADING === "true";
const maxOrderQty = Number(process.env.MAX_ORDER_QTY ?? 1);
const maxOrderNotional = Number(process.env.MAX_ORDER_NOTIONAL ?? 500);
const maxDailyTrades = Number(process.env.MAX_DAILY_TRADES ?? 20);
const allowedSymbols = (process.env.ALLOWED_SYMBOLS ?? "")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const geminiBaseUrl =
  process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const geminiEnabled = process.env.GEMINI_ENABLED === "true" && Boolean(geminiApiKey);

const TradingSignalSchema = z.object({
  assetClass: z.string().default("STK"),
  confidence: z.number().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  side: z.enum(["BUY", "SELL"]),
  source: z.string().default("api"),
  strategyId: z.string().default("manual"),
  symbol: z.string().min(1),
  timeframe: z.string().optional()
});

const TradingOrderSchema = z.object({
  accountId: z.string().optional(),
  accountMode: z.enum(["paper", "live"]).default("paper"),
  conid: z.number().int().positive(),
  limitPrice: z.number().positive().optional(),
  orderType: z.enum(["LMT", "MKT", "STP", "STOP_LIMIT"]),
  quantity: z.number().positive(),
  side: z.enum(["BUY", "SELL"]),
  signal: TradingSignalSchema.optional(),
  symbol: z.string().min(1),
  tif: z.enum(["DAY", "GTC", "IOC"]).default("DAY")
});

type TradingOrder = z.infer<typeof TradingOrderSchema>;
type TradingHttpStatus = 200 | 400 | 500 | 502;

interface TradingHandlerResult {
  body: Record<string, unknown>;
  status: TradingHttpStatus;
}

let supabaseClient: SupabaseClient | null = null;

type AssistantRole = "user" | "assistant";

interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

interface AssistantChatRequest {
  messages?: AssistantMessage[];
}

interface AssistantAnswer {
  reply: string;
  tool: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return supabaseClient;
}

function requireSupabase() {
  const client = getSupabase();
  if (!client) {
    throw new Error("Supabase is required for IBKR trading endpoints");
  }
  return client;
}

async function readRuntimeState(client: SupabaseClient) {
  const { data, error } = await client
    .from("trading_runtime_state")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    throw new Error(`runtime state read failed: ${error.message}`);
  }

  return {
    allow_live_trading: Boolean(data?.allow_live_trading),
    kill_switch: data?.kill_switch ?? true,
    trading_mode: data?.trading_mode ?? "paper"
  };
}

async function countDailyOrders(client: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await client
    .from("trade_orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00.000Z`);

  if (error) {
    throw new Error(`daily order count failed: ${error.message}`);
  }

  return count ?? 0;
}

async function insertTradingSignal(client: SupabaseClient, input?: TradingOrder["signal"]) {
  if (!input) {
    return null;
  }

  const { data, error } = await client
    .from("trading_signals")
    .insert({
      asset_class: input.assetClass,
      confidence: input.confidence ?? null,
      payload: input.payload,
      side: input.side,
      source: input.source,
      strategy_id: input.strategyId,
      symbol: input.symbol,
      timeframe: input.timeframe ?? null
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`trading signal insert failed: ${error.message}`);
  }

  return data.id as string;
}

async function insertTradeOrder(client: SupabaseClient, input: TradingOrder, signalId: string | null) {
  const { data, error } = await client
    .from("trade_orders")
    .insert({
      account_mode: input.accountMode,
      conid: input.conid,
      limit_price: input.limitPrice ?? null,
      order_type: input.orderType,
      quantity: input.quantity,
      side: input.side,
      signal_id: signalId,
      status: "created",
      symbol: input.symbol,
      tif: input.tif
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`trade order insert failed: ${error.message}`);
  }

  return data.id as string;
}

async function updateTradeOrder(
  client: SupabaseClient,
  orderId: string,
  values: Record<string, unknown>
) {
  const { error } = await client
    .from("trade_orders")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    throw new Error(`trade order update failed: ${error.message}`);
  }
}

async function insertRiskEvent(
  client: SupabaseClient,
  orderId: string,
  signalId: string | null,
  decision: ReturnType<typeof validateOrderRisk>
) {
  const { error } = await client.from("risk_events").insert({
    metadata: decision.metadata ?? {},
    order_id: orderId,
    passed: decision.passed,
    reason: decision.reason,
    rule_name: decision.rule,
    signal_id: signalId
  });
  if (error) {
    throw new Error(`risk event insert failed: ${error.message}`);
  }
}

async function insertBrokerLog(
  client: SupabaseClient,
  input: {
    endpoint: string;
    errorMessage?: string;
    orderId: string;
    requestPayload?: unknown;
    responsePayload?: unknown;
    statusCode?: number;
  }
) {
  const { error } = await client.from("broker_execution_logs").insert({
    endpoint: input.endpoint,
    error_message: input.errorMessage ?? null,
    order_id: input.orderId,
    request_payload: input.requestPayload ?? null,
    response_payload: input.responsePayload ?? null,
    status_code: input.statusCode ?? null
  });
  if (error) {
    throw new Error(`broker log insert failed: ${error.message}`);
  }
}

async function callExecutor(endpoint: "/orders" | "/orders/preview", input: TradingOrder) {
  const response = await fetch(`${ibkrExecutorUrl}${endpoint}`, {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
      "x-api-key": ibkrExecutorApiKey
    },
    method: "POST"
  });
  const data = (await response.json().catch(() => ({}))) as TradeOrderResponse & {
    error?: unknown;
    ok?: boolean;
    risk?: unknown;
  };
  return { data, status: response.status };
}

async function callExecutorGet(endpoint: "/executions" | "/orders/open" | "/portfolio") {
  const response = await fetch(`${ibkrExecutorUrl}${endpoint}`, {
    headers: {
      "x-api-key": ibkrExecutorApiKey
    }
  });
  const data = (await response.json().catch(() => ({}))) as {
    data?: unknown;
    error?: unknown;
    ok?: boolean;
  };
  return { data, status: response.status };
}

function statusFromExecutor(data: TradeOrderResponse, isPreview: boolean) {
  if (data.status === "broker_warning") return "broker_warning";
  if (data.status === "broker_rejected") return "broker_rejected";
  if (data.status === "broker_error") return "broker_error";
  return isPreview ? "previewed" : "submitted";
}

async function handleLocalTradingOrder(
  input: TradingOrder,
  isPreview: boolean
): Promise<TradingHandlerResult> {
  const db = await readDb();
  const orderId = createId();
  const dailyTrades = db.system_logs.filter((log) => {
    const broker = log.metadata?.broker;
    const dryRun =
      typeof broker === "object" &&
      broker !== null &&
      "dryRun" in broker &&
      (broker as { dryRun?: unknown }).dryRun === true;

    return (
      log.message === "local_trading_order" &&
      log.metadata?.isPreview === false &&
      !dryRun &&
      Number(log.metadata?.statusCode ?? 0) < 400 &&
      log.created_at.startsWith(new Date().toISOString().slice(0, 10))
    );
  }).length;
  const decision = validateOrderRisk({
    ...input,
    allowLiveTrading: false,
    allowedSymbols: allowedSymbols.length ? allowedSymbols : undefined,
    dailyTrades,
    killSwitch: db.bot_status.status === "risk_locked",
    maxDailyTrades,
    maxOrderNotional,
    maxOrderQty
  });

  db.system_logs.push({
    id: createId(),
    level: decision.passed ? "info" : "warn",
    message: "local_trading_risk_check",
    metadata: {
      decision,
      isPreview,
      orderId,
      order: input
    },
    created_at: new Date().toISOString()
  });

  if (!decision.passed) {
    await writeDb(db);
    return {
      body: { ok: false, orderId, risk: decision },
      status: 400
    };
  }

  const endpoint = isPreview ? "/orders/preview" : "/orders";
  try {
    const executor = await callExecutor(endpoint, input);
    const brokerStatus = executor.status >= 400 ? "broker_error" : statusFromExecutor(executor.data, isPreview);
    db.system_logs.push({
      id: createId(),
      level: executor.status >= 400 ? "error" : "info",
      message: "local_trading_order",
      metadata: {
        broker: executor.data,
        endpoint,
        isPreview,
        order: input,
        orderId,
        status: brokerStatus,
        statusCode: executor.status
      },
      created_at: new Date().toISOString()
    });
    await writeDb(db);

    if (executor.status >= 400) {
      return {
        body: { ok: false, orderId, broker: executor.data },
        status: executor.status >= 500 ? 502 : 400
      };
    }

    return {
      body: {
        broker: executor.data,
        ok: true,
        orderId,
        status: brokerStatus
      },
      status: 200
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "executor call failed";
    db.system_logs.push({
      id: createId(),
      level: "error",
      message: "local_trading_order_error",
      metadata: {
        endpoint,
        error: message,
        isPreview,
        order: input,
        orderId
      },
      created_at: new Date().toISOString()
    });
    await writeDb(db);
    return {
      body: { ok: false, orderId, error: message },
      status: 502
    };
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function money(value: number) {
  return new Intl.NumberFormat("es-CO", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency"
  }).format(value);
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: digits
  }).format(value);
}

function latestByDate<T>(rows: T[], dateKey: keyof T): T | undefined {
  return rows
    .slice()
    .sort((a, b) => String(b[dateKey]).localeCompare(String(a[dateKey])))[0];
}

function tradeSummary(trade: TradeRow) {
  const exit = trade.exit_price === null ? "sin salida" : formatNumber(trade.exit_price, 4);
  return `${trade.symbol} ${trade.direction} entrada ${formatNumber(trade.entry_price, 4)}, ${exit}, PnL ${money(trade.pnl)} (${formatNumber(trade.pnl_percentage, 2)}%)`;
}

function signalSummary(signal: SignalRow) {
  return `${signal.symbol} ${signal.direction} score ${signal.score}/13, estrategia ${signal.strategy}, estado ${signal.status}. Motivo: ${signal.reason}`;
}

function buildAssistantContext(db: LocalDb) {
  const risk = getRiskSnapshot(db);
  const latestSignal = latestByDate(db.signals, "created_at");
  const latestTrade = latestByDate(db.trades, "opened_at");
  const openTrades = db.trades.filter((trade) => trade.status === "open");
  const closedTrades = db.trades.filter((trade) => trade.status === "closed");
  const wins = closedTrades.filter((trade) => trade.pnl > 0).length;
  const losses = closedTrades.filter((trade) => trade.pnl < 0).length;
  const totalClosedPnl = closedTrades.reduce((acc, trade) => acc + trade.pnl, 0);
  const prices = Object.entries(db.market_prices)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, price]) => `${symbol}: ${formatNumber(price, 4)}`);

  return {
    bot: db.bot_status,
    closedTrades: closedTrades.length,
    latestSignal: latestSignal ? signalSummary(latestSignal) : "sin señales",
    latestTrade: latestTrade ? tradeSummary(latestTrade) : "sin operaciones",
    losses,
    marketPrices: prices.length ? prices.join(" | ") : "sin precios mock",
    openTrades: openTrades.slice(0, 5).map(tradeSummary),
    risk,
    signalsCount: db.signals.length,
    totalClosedPnl,
    tradesCount: db.trades.length,
    wins
  };
}

async function answerWithGemini(db: LocalDb, messages: AssistantMessage[]): Promise<AssistantAnswer | null> {
  if (!geminiEnabled) {
    return null;
  }

  const context = buildAssistantContext(db);
  const prompt = `
Eres Asistente ALFA, copiloto operativo de ALFA-OMEGA.
Responde en español, breve, con foco en trading operativo y riesgo.
No prometas ejecutar órdenes. No des instrucciones para saltarse controles de riesgo.
Si el usuario pide operar, explica que las órdenes solo pasan por API, risk-engine e ibkr-executor.

Contexto local actual:
${JSON.stringify(context, null, 2)}

Conversación:
${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}
`;

  const url = `${geminiBaseUrl}/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
  const response = await fetch(url, {
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
          role: "user"
        }
      ]
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const data = (await response.json().catch(() => ({}))) as GeminiGenerateResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Gemini request failed");
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  return text ? { reply: text, tool: `gemini:${geminiModel}` } : null;
}

function answerAssistant(db: LocalDb, prompt: string): AssistantAnswer {
  const text = normalizeText(prompt);
  const risk = getRiskSnapshot(db);
  const latestSignal = latestByDate(db.signals, "created_at");
  const latestTrade = latestByDate(db.trades, "opened_at");
  const openTrades = db.trades.filter((trade) => trade.status === "open");
  const closedTrades = db.trades.filter((trade) => trade.status === "closed");
  const wins = closedTrades.filter((trade) => trade.pnl > 0).length;
  const losses = closedTrades.filter((trade) => trade.pnl < 0).length;
  const winRate = closedTrades.length ? (wins / closedTrades.length) * 100 : 0;
  const totalClosedPnl = closedTrades.reduce((acc, trade) => acc + trade.pnl, 0);
  const prices = Object.entries(db.market_prices)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, price]) => `${symbol}: ${formatNumber(price, 4)}`);

  if (text.includes("riesgo") || text.includes("risk")) {
    return {
      reply:
        `Riesgo actual: ${money(risk.daily_risk_used)} usados de ${money(risk.daily_risk_limit)}. ` +
        `Quedan ${money(risk.remaining_daily_risk)} disponibles. ` +
        `Hay ${risk.open_trades}/${risk.max_open_trades} operaciones abiertas y el riesgo por trade está en ${(risk.risk_per_trade_pct * 100).toFixed(2)}%.`,
      tool: "risk_snapshot"
    };
  }

  if (text.includes("senal") || text.includes("señal") || text.includes("signal")) {
    return {
      reply: latestSignal
        ? `Última señal: ${signalSummary(latestSignal)}`
        : "No hay señales registradas todavía. Cuando llegue una señal, la veré desde la base local.",
      tool: "latest_signal"
    };
  }

  if (text.includes("operacion") || text.includes("operaciones") || text.includes("trade")) {
    const openText = openTrades.length
      ? openTrades.slice(0, 5).map(tradeSummary).join(" | ")
      : "no hay operaciones abiertas";
    return {
      reply:
        `Operaciones: ${openTrades.length} abiertas, ${closedTrades.length} cerradas. ` +
        `Win rate cerrado: ${formatNumber(winRate, 1)}% (${wins} ganadoras, ${losses} perdedoras). ` +
        `PnL cerrado acumulado: ${money(totalClosedPnl)}. Abiertas: ${openText}.`,
      tool: "trades_summary"
    };
  }

  if (text.includes("precio") || text.includes("market") || text.includes("mercado")) {
    return {
      reply: prices.length
        ? `Precios mock cargados: ${prices.join(" | ")}.`
        : "No hay precios mock cargados. Puedes cargar uno desde el control de precio del dashboard.",
      tool: "market_prices"
    };
  }

  if (text.includes("capital") || text.includes("pnl") || text.includes("profit")) {
    return {
      reply:
        `Capital simulado: ${money(db.bot_status.capital)}. ` +
        `PnL diario: ${money(db.bot_status.daily_pnl)}. ` +
        `PnL cerrado histórico: ${money(totalClosedPnl)} con ${closedTrades.length} cierres.`,
      tool: "capital_snapshot"
    };
  }

  if (text.includes("estado") || text.includes("status") || text.includes("bot")) {
    return {
      reply:
        `Estado del bot: ${db.bot_status.status}. ` +
        `Modo: ${db.bot_status.trading_mode}. ` +
        `Capital: ${money(db.bot_status.capital)}. ` +
        `Última señal: ${latestSignal ? signalSummary(latestSignal) : "sin señales"}. ` +
        `Última operación: ${latestTrade ? tradeSummary(latestTrade) : "sin operaciones"}.`,
      tool: "bot_status"
    };
  }

  return {
    reply:
      "Puedo revisar estado del bot, riesgo, última señal, operaciones, capital/PnL y precios mock. " +
      "Prueba con: “¿cómo está el riesgo?”, “última señal” u “operaciones abiertas”.",
    tool: "assistant_help"
  };
}

function sse(event: string, data: Record<string, unknown>) {
  return `event:${event}\ndata:${JSON.stringify(data)}\n\n`;
}

function chunkText(text: string) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += assistantChunkSize) {
    chunks.push(text.slice(index, index + assistantChunkSize));
  }
  return chunks;
}

function closeTrade(
  db: Awaited<ReturnType<typeof readDb>>,
  tradeId: string,
  exitPrice: number,
  reason: string
) {
  const trade = db.trades.find((t) => t.id === tradeId && t.status === "open");
  if (!trade) return null;

  const signedDelta =
    trade.direction === "BUY" ? exitPrice - trade.entry_price : trade.entry_price - exitPrice;
  const pnl = signedDelta * trade.position_size;
  const pnlPercentage =
    trade.entry_price === 0 ? 0 : (signedDelta / trade.entry_price) * 100;

  trade.status = "closed";
  trade.close_reason = reason;
  trade.exit_price = exitPrice;
  trade.pnl = pnl;
  trade.pnl_percentage = pnlPercentage;
  trade.closed_at = new Date().toISOString();

  db.bot_status.daily_pnl += pnl;
  db.bot_status.capital += pnl;
  db.bot_status.updated_at = new Date().toISOString();

  db.system_logs.push({
    id: createId(),
    level: "info",
    message: "trade_closed_manual",
    metadata: { trade_id: trade.id, reason, exit_price: exitPrice, pnl },
    created_at: new Date().toISOString()
  });
  db.notifications.push({
    id: createId(),
    channel: "whatsapp",
    event_type: "trade_closed",
    message: `ALFA-OMEGA cerró operación ${trade.symbol} por ${reason}. PnL: ${pnl.toFixed(2)}`,
    status: "pending",
    metadata: { trade_id: trade.id, reason, pnl },
    created_at: new Date().toISOString()
  });

  return trade;
}

function getRiskSnapshot(db: Awaited<ReturnType<typeof readDb>>) {
  const today = new Date().toISOString().slice(0, 10);
  const openTrades = db.trades.filter((t) => t.status === "open");
  const dailyRiskUsed = openTrades
    .filter((t) => t.opened_at.slice(0, 10) === today)
    .reduce((acc, t) => acc + t.risk_amount, 0);
  const capital = db.bot_status.capital;
  const dailyRiskLimit = capital * maxDailyRiskPct;

  return {
    risk_per_trade_pct: riskPerTradePct,
    max_daily_risk_pct: maxDailyRiskPct,
    max_open_trades: maxOpenTrades,
    open_trades: openTrades.length,
    daily_risk_used: dailyRiskUsed,
    daily_risk_limit: dailyRiskLimit,
    remaining_daily_risk: Math.max(dailyRiskLimit - dailyRiskUsed, 0)
  };
}

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "alfa-omega-api",
    backend: "local",
    timestamp: new Date().toISOString()
  });
});

app.get("/status", async (c) => {
  const db = await readDb();
  return c.json({
    ok: true,
    data: {
      ...db.bot_status,
      trading_mode: process.env.TRADING_MODE ?? db.bot_status.trading_mode
    }
  });
});

app.post("/pause", async (c) => {
  const db = await readDb();
  db.bot_status.status = "paused";
  db.bot_status.updated_at = new Date().toISOString();
  await writeDb(db);
  return c.json({ ok: true, status: "paused" });
});

app.post("/resume", async (c) => {
  const db = await readDb();
  if (db.bot_status.status !== "risk_locked") {
    db.bot_status.status = "active";
  }
  db.bot_status.updated_at = new Date().toISOString();
  await writeDb(db);
  return c.json({ ok: true, status: db.bot_status.status });
});

app.post("/risk/unlock", async (c) => {
  const db = await readDb();
  db.bot_status.status = "paused";
  db.bot_status.updated_at = new Date().toISOString();
  db.system_logs.push({
    id: createId(),
    level: "warn",
    message: "risk_unlock_manual",
    metadata: {},
    created_at: new Date().toISOString()
  });
  await writeDb(db);
  return c.json({ ok: true, status: db.bot_status.status });
});

app.post("/kapso-webhook", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const commandRaw = typeof body?.command === "string" ? body.command : "";
  const command = commandRaw.trim().toLowerCase();
  const db = await readDb();

  const latestSignal = db.signals
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const today = new Date().toISOString().slice(0, 10);
  const tradesToday = db.trades.filter((t) => t.opened_at.slice(0, 10) === today);

  let response = "Comando no reconocido";

  if (command === "estado") {
    response = `Estado: ${db.bot_status.status} | modo: ${db.bot_status.trading_mode} | capital: ${db.bot_status.capital}`;
  } else if (command === "pausar") {
    db.bot_status.status = "paused";
    db.bot_status.updated_at = new Date().toISOString();
    response = "Bot pausado";
  } else if (command === "reanudar") {
    if (db.bot_status.status !== "risk_locked") {
      db.bot_status.status = "active";
      response = "Bot reanudado";
    } else {
      response = "No se puede reanudar: bot en risk_locked";
    }
    db.bot_status.updated_at = new Date().toISOString();
  } else if (command === "ultima_senal" || command === "última señal") {
    response = latestSignal
      ? `Última señal: ${latestSignal.symbol} ${latestSignal.direction} score ${latestSignal.score}/13 (${latestSignal.status})`
      : "No hay señales";
  } else if (command === "operaciones_hoy") {
    response = `Operaciones hoy: ${tradesToday.length}`;
  } else if (command === "capital") {
    response = `Capital: ${db.bot_status.capital} | PnL diario: ${db.bot_status.daily_pnl}`;
  } else if (command === "riesgo") {
    const risk = getRiskSnapshot(db);
    response = `Riesgo/trade: ${(risk.risk_per_trade_pct * 100).toFixed(2)}% | usado hoy: ${risk.daily_risk_used.toFixed(2)} / ${risk.daily_risk_limit.toFixed(2)} | abiertas: ${risk.open_trades}/${risk.max_open_trades}`;
  }

  db.system_logs.push({
    id: createId(),
    level: "info",
    message: "kapso_command_received",
    metadata: { command, response },
    created_at: new Date().toISOString()
  });
  db.notifications.push({
    id: createId(),
    channel: "whatsapp",
    event_type: "kapso_response",
    message: response,
    status: "pending",
    metadata: { command },
    created_at: new Date().toISOString()
  });
  await writeDb(db);

  return c.json({ ok: true, command, response });
});

app.post("/assistant/chat", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as AssistantChatRequest;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());

  if (!lastUserMessage) {
    return c.json({ ok: false, error: "messages must include a user message" }, 400);
  }

  const db = await readDb();
  let answer: AssistantAnswer;
  try {
    answer =
      (await answerWithGemini(db, messages)) ?? answerAssistant(db, lastUserMessage.content);
  } catch (error) {
    answer = answerAssistant(db, lastUserMessage.content);
    db.system_logs.push({
      id: createId(),
      level: "warn",
      message: "assistant_gemini_fallback",
      metadata: {
        error: error instanceof Error ? error.message : "unknown gemini error",
        model: geminiModel
      },
      created_at: new Date().toISOString()
    });
  }
  db.system_logs.push({
    id: createId(),
    level: "info",
    message: "assistant_chat",
    metadata: { tool: answer.tool, prompt: lastUserMessage.content },
    created_at: new Date().toISOString()
  });
  await writeDb(db);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse("tool", { name: answer.tool, status: "done" })));
      for (const chunk of chunkText(answer.reply)) {
        controller.enqueue(encoder.encode(sse("message", { text: chunk })));
      }
      controller.enqueue(encoder.encode(sse("done", {})));
      controller.close();
    }
  });

  return c.body(stream, 200, {
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });
});

app.get("/signals", async (c) => {
  const db = await readDb();
  const data = db.signals
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  return c.json({ ok: true, data });
});

app.post("/signals", async (c) => {
  const body = await c.req.json();
  const parsed = SignalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: parsed.error.flatten() }, 400);
  }

  const db = await readDb();
  const signal = {
    id: createId(),
    ...parsed.data,
    confidence: parsed.data.confidence ?? "medium",
    entry_price: parsed.data.entry_price ?? null,
    stop_loss: parsed.data.stop_loss ?? null,
    take_profit_1: parsed.data.take_profit_1 ?? null,
    take_profit_2: parsed.data.take_profit_2 ?? null,
    source: parsed.data.source ?? "manual",
    reason: parsed.data.reason ?? "manual signal",
    status: "pending" as const,
    created_at: new Date().toISOString()
  };
  db.signals.push(signal);
  db.system_logs.push({
    id: createId(),
    level: "info",
    message: "signal_created",
    metadata: { signal_id: signal.id, symbol: signal.symbol },
    created_at: new Date().toISOString()
  });
  await writeDb(db);

  return c.json({ ok: true, data: signal }, 201);
});

app.post("/market/price", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const price = Number(body?.price);

  if (!symbol || !Number.isFinite(price) || price <= 0) {
    return c.json({ ok: false, error: "symbol and positive price are required" }, 400);
  }

  const db = await readDb();
  db.market_prices[symbol] = price;
  db.system_logs.push({
    id: createId(),
    level: "info",
    message: "market_price_updated",
    metadata: { symbol, price },
    created_at: new Date().toISOString()
  });
  await writeDb(db);

  return c.json({ ok: true, data: { symbol, price } }, 201);
});

app.get("/market/prices", async (c) => {
  const db = await readDb();
  return c.json({ ok: true, data: db.market_prices });
});

app.get("/trades", async (c) => {
  const db = await readDb();
  const data = db.trades
    .slice()
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
    .slice(0, 50);
  return c.json({ ok: true, data });
});

app.post("/trades/:id/close", async (c) => {
  const tradeId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "manual";

  const db = await readDb();
  const candidate = db.trades.find((t) => t.id === tradeId && t.status === "open");
  if (!candidate) {
    return c.json({ ok: false, error: "open trade not found" }, 404);
  }

  const explicitExitPrice = Number(body?.exit_price);
  const marketPrice = db.market_prices[candidate.symbol];
  const exitPrice = Number.isFinite(explicitExitPrice)
    ? explicitExitPrice
    : Number.isFinite(marketPrice)
      ? marketPrice
      : candidate.entry_price;

  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    return c.json({ ok: false, error: "invalid exit price" }, 400);
  }

  const trade = closeTrade(db, tradeId, exitPrice, reason);
  if (!trade) {
    return c.json({ ok: false, error: "could not close trade" }, 400);
  }

  await writeDb(db);
  return c.json({ ok: true, data: trade });
});

app.get("/notifications", async (c) => {
  const db = await readDb();
  const data = db.notifications
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  return c.json({ ok: true, data });
});

app.get("/logs", async (c) => {
  const db = await readDb();
  const data = db.system_logs
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100);
  return c.json({ ok: true, data });
});

app.get("/risk", async (c) => {
  const db = await readDb();
  return c.json({ ok: true, data: getRiskSnapshot(db) });
});

async function handleTradingOrder(input: unknown, isPreview: boolean): Promise<TradingHandlerResult> {
  const parsed = TradingOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      body: { ok: false, error: parsed.error.flatten() },
      status: 400
    };
  }

  const client = getSupabase();
  if (!client) {
    return handleLocalTradingOrder(parsed.data, isPreview);
  }

  const runtime = await readRuntimeState(client);
  const dailyTrades = await countDailyOrders(client);
  const signalId = await insertTradingSignal(client, parsed.data.signal);
  const orderId = await insertTradeOrder(client, parsed.data, signalId);
  const decision = validateOrderRisk({
    ...parsed.data,
    allowLiveTrading: apiAllowLiveTrading && runtime.allow_live_trading,
    allowedSymbols: allowedSymbols.length ? allowedSymbols : undefined,
    dailyTrades,
    killSwitch: runtime.kill_switch,
    maxDailyTrades,
    maxOrderNotional,
    maxOrderQty
  });

  await insertRiskEvent(client, orderId, signalId, decision);

  if (!decision.passed) {
    await updateTradeOrder(client, orderId, {
      error_message: decision.reason,
      status: "risk_rejected"
    });
    return {
      body: { ok: false, orderId, risk: decision },
      status: 400
    };
  }

  const endpoint = isPreview ? "/orders/preview" : "/orders";
  try {
    const executor = await callExecutor(endpoint, parsed.data);
    await insertBrokerLog(client, {
      endpoint,
      orderId,
      requestPayload: parsed.data,
      responsePayload: executor.data,
      statusCode: executor.status
    });

    if (executor.status >= 400) {
      await updateTradeOrder(client, orderId, {
        error_message: JSON.stringify(executor.data.error ?? executor.data),
        status: "broker_error"
      });
      return {
        body: { ok: false, orderId, broker: executor.data },
        status: executor.status >= 500 ? 502 : 400
      };
    }

    const brokerStatus = statusFromExecutor(executor.data, isPreview);
    await updateTradeOrder(client, orderId, {
      broker_reply_id: executor.data.brokerReplyId ?? null,
      broker_response: executor.data.rawResponse ?? executor.data,
      status: brokerStatus
    });

    return {
      body: {
        broker: executor.data,
        ok: true,
        orderId,
        status: brokerStatus
      },
      status: 200
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "executor call failed";
    await insertBrokerLog(client, {
      endpoint,
      errorMessage: message,
      orderId,
      requestPayload: parsed.data
    });
    await updateTradeOrder(client, orderId, {
      error_message: message,
      status: "broker_error"
    });
    return {
      body: { ok: false, orderId, error: message },
      status: 502
    };
  }
}

app.post("/api/trading/orders/preview", async (c) => {
  try {
    const result = await handleTradingOrder(await c.req.json().catch(() => ({})), true);
    return c.json(result.body, result.status);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, 500);
  }
});

app.post("/api/trading/orders/submit", async (c) => {
  try {
    const result = await handleTradingOrder(await c.req.json().catch(() => ({})), false);
    return c.json(result.body, result.status);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, 500);
  }
});

app.get("/api/trading/orders/open", async (c) => {
  try {
    const executor = await callExecutorGet("/orders/open");
    if (executor.status >= 400) {
      return c.json(
        {
          broker: executor.data,
          error: executor.data.error ?? "executor call failed",
          ok: false
        },
        executor.status >= 500 ? 502 : 400
      );
    }

    return c.json({
      data: executor.data.data ?? executor.data,
      ok: true
    });
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : "executor call failed" },
      502
    );
  }
});

async function handleTradingRead(endpoint: "/executions" | "/portfolio") {
  const executor = await callExecutorGet(endpoint);
  if (executor.status >= 400) {
    return {
      body: {
        broker: executor.data,
        error: executor.data.error ?? "executor call failed",
        ok: false
      },
      status: executor.status >= 500 ? 502 : 400
    } as const;
  }

  return {
    body: {
      data: executor.data.data ?? executor.data,
      ok: true
    },
    status: 200
  } as const;
}

app.get("/api/trading/portfolio", async (c) => {
  try {
    const result = await handleTradingRead("/portfolio");
    return c.json(result.body, result.status);
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : "executor call failed" },
      502
    );
  }
});

app.get("/api/trading/executions", async (c) => {
  try {
    const result = await handleTradingRead("/executions");
    return c.json(result.body, result.status);
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : "executor call failed" },
      502
    );
  }
});

Bun.serve({
  hostname: "0.0.0.0",
  port,
  fetch: app.fetch
});

console.log(`ALFA-OMEGA API running on http://localhost:${port}`);
