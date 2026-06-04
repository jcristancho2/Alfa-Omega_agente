import { Hono } from "hono";
import { cors } from "hono/cors";
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
const port = Number(process.env.API_PORT || 4000);
app.use("*", cors());
const riskPerTradePct = Number(process.env.RISK_PER_TRADE_PCT || 0.01);
const maxDailyRiskPct = Number(process.env.MAX_DAILY_RISK_PCT || 0.03);
const maxOpenTrades = Number(process.env.MAX_OPEN_TRADES || 3);
const assistantChunkSize = 42;

type AssistantRole = "user" | "assistant";

interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

interface AssistantChatRequest {
  messages?: AssistantMessage[];
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

function answerAssistant(db: LocalDb, prompt: string) {
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
  return c.json({ ok: true, data: db.bot_status });
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
  const answer = answerAssistant(db, lastUserMessage.content);
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

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`ALFA-OMEGA API running on http://localhost:${port}`);
