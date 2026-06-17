import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BotStatus = "active" | "paused" | "risk_locked" | "error" | "maintenance";
export type TradingMode = "simulated" | "paper" | "live";

export interface SignalRow {
  id: string;
  symbol: string;
  strategy: string;
  direction: "BUY" | "SELL";
  score: number;
  confidence: "low" | "medium" | "high";
  entry_price: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  source: string;
  reason: string;
  status: "pending" | "processed" | "rejected";
  created_at: string;
}

export interface TradeRow {
  id: string;
  signal_id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  entry_price: number;
  stop_loss: number;
  take_profit_1: number | null;
  take_profit_2: number | null;
  position_size: number;
  risk_amount: number;
  status: "open" | "closed" | "cancelled";
  close_reason: string | null;
  exit_price: number | null;
  pnl: number;
  pnl_percentage: number;
  opened_at: string;
  closed_at: string | null;
}

export interface NotificationRow {
  id: string;
  channel: "whatsapp";
  event_type: string;
  message: string;
  status: "pending" | "sent";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LogRow {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LocalDb {
  bot_status: {
    id: number;
    status: BotStatus;
    trading_mode: TradingMode;
    capital: number;
    daily_pnl: number;
    updated_at: string;
  };
  signals: SignalRow[];
  trades: TradeRow[];
  market_prices: Record<string, number>;
  notifications: NotificationRow[];
  system_logs: LogRow[];
}

interface SupabaseSignalRow extends Omit<SignalRow, "entry_price" | "stop_loss" | "take_profit_1" | "take_profit_2"> {
  entry_price: number | string | null;
  stop_loss: number | string | null;
  take_profit_1: number | string | null;
  take_profit_2: number | string | null;
  raw_payload?: Record<string, unknown> | null;
}

interface SupabaseTradeRow
  extends Omit<
    TradeRow,
    | "entry_price"
    | "stop_loss"
    | "take_profit_1"
    | "take_profit_2"
    | "position_size"
    | "risk_amount"
    | "exit_price"
    | "pnl"
    | "pnl_percentage"
  > {
  entry_price: number | string;
  stop_loss: number | string | null;
  take_profit_1: number | string | null;
  take_profit_2: number | string | null;
  position_size: number | string;
  risk_amount: number | string | null;
  exit_price: number | string | null;
  pnl: number | string | null;
  pnl_percentage: number | string | null;
}

interface SupabaseBotStatusRow {
  id: number;
  status: BotStatus;
  trading_mode: TradingMode;
  capital: number | string;
  daily_pnl: number | string;
  updated_at: string;
}

interface SupabaseMarketPriceRow {
  symbol: string;
  price: number | string;
  updated_at?: string;
}

const now = () => new Date().toISOString();

export const defaultDb = (): LocalDb => ({
  bot_status: {
    id: 1,
    status: "active",
    trading_mode: "simulated",
    capital: 10000,
    daily_pnl: 0,
    updated_at: now()
  },
  signals: [],
  trades: [],
  market_prices: {},
  notifications: [],
  system_logs: []
});

let supabaseClient: SupabaseClient | null = null;

function shouldUseSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
  if (!shouldUseSupabase()) {
    throw new Error("Supabase is required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: { persistSession: false }
      }
    );
  }
  return supabaseClient;
}

function asNumber(value: number | string | null | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

async function readSupabaseDb(client: SupabaseClient): Promise<LocalDb> {
  const [
    statusResult,
    signalsResult,
    tradesResult,
    pricesResult,
    notificationsResult,
    logsResult
  ] = await Promise.all([
    client.from("bot_status").select("*").order("id", { ascending: true }).limit(1),
    client.from("signals").select("*").order("created_at", { ascending: true }),
    client.from("trades").select("*").order("opened_at", { ascending: true }),
    client.from("market_prices").select("*").order("symbol", { ascending: true }),
    client.from("notifications").select("*").order("created_at", { ascending: true }),
    client.from("system_logs").select("*").order("created_at", { ascending: true })
  ]);

  for (const result of [
    statusResult,
    signalsResult,
    tradesResult,
    pricesResult,
    notificationsResult,
    logsResult
  ]) {
    if (result.error) {
      throw new Error(`supabase read failed: ${result.error.message}`);
    }
  }

  const seed = defaultDb();
  const status = (statusResult.data?.[0] ?? seed.bot_status) as SupabaseBotStatusRow;
  const marketPrices = Object.fromEntries(
    ((pricesResult.data ?? []) as SupabaseMarketPriceRow[]).map((row) => [
      row.symbol,
      asNumber(row.price)
    ])
  );

  return {
    bot_status: {
      id: Number(status.id ?? 1),
      status: status.status,
      trading_mode: status.trading_mode,
      capital: asNumber(status.capital, seed.bot_status.capital),
      daily_pnl: asNumber(status.daily_pnl),
      updated_at: status.updated_at ?? now()
    },
    signals: ((signalsResult.data ?? []) as SupabaseSignalRow[]).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      strategy: row.strategy,
      direction: row.direction,
      score: Number(row.score),
      confidence: row.confidence ?? "medium",
      entry_price: row.entry_price === null ? null : asNumber(row.entry_price),
      stop_loss: row.stop_loss === null ? null : asNumber(row.stop_loss),
      take_profit_1: row.take_profit_1 === null ? null : asNumber(row.take_profit_1),
      take_profit_2: row.take_profit_2 === null ? null : asNumber(row.take_profit_2),
      source: row.source ?? "unknown",
      reason: row.reason ?? "",
      status: row.status,
      created_at: row.created_at
    })),
    trades: ((tradesResult.data ?? []) as SupabaseTradeRow[]).map((row) => ({
      id: row.id,
      signal_id: row.signal_id,
      symbol: row.symbol,
      direction: row.direction,
      entry_price: asNumber(row.entry_price),
      stop_loss: asNumber(row.stop_loss),
      take_profit_1: row.take_profit_1 === null ? null : asNumber(row.take_profit_1),
      take_profit_2: row.take_profit_2 === null ? null : asNumber(row.take_profit_2),
      position_size: asNumber(row.position_size),
      risk_amount: asNumber(row.risk_amount),
      status: row.status,
      close_reason: row.close_reason,
      exit_price: row.exit_price === null ? null : asNumber(row.exit_price),
      pnl: asNumber(row.pnl),
      pnl_percentage: asNumber(row.pnl_percentage),
      opened_at: row.opened_at,
      closed_at: row.closed_at
    })),
    market_prices: marketPrices,
    notifications: notificationsResult.data as NotificationRow[],
    system_logs: logsResult.data as LogRow[]
  };
}

async function writeSupabaseDb(db: LocalDb, client: SupabaseClient): Promise<void> {
  const priceRows = Object.entries(db.market_prices).map(([symbol, price]) => ({
    price,
    symbol,
    updated_at: now()
  }));

  const writes = [
    client.from("bot_status").upsert(db.bot_status, { onConflict: "id" }),
    db.signals.length
      ? client.from("signals").upsert(db.signals, { onConflict: "id" })
      : Promise.resolve({ error: null }),
    db.trades.length
      ? client.from("trades").upsert(db.trades, { onConflict: "id" })
      : Promise.resolve({ error: null }),
    priceRows.length
      ? client.from("market_prices").upsert(priceRows, { onConflict: "symbol" })
      : Promise.resolve({ error: null }),
    db.notifications.length
      ? client.from("notifications").upsert(db.notifications, { onConflict: "id" })
      : Promise.resolve({ error: null }),
    db.system_logs.length
      ? client.from("system_logs").upsert(db.system_logs, { onConflict: "id" })
      : Promise.resolve({ error: null })
  ];

  const results = await Promise.all(writes);
  for (const result of results) {
    if (result.error) {
      throw new Error(`supabase write failed: ${result.error.message}`);
    }
  }
}

export async function readDb(): Promise<LocalDb> {
  const client = getSupabase();
  return readSupabaseDb(client);
}

export async function writeDb(db: LocalDb): Promise<void> {
  const client = getSupabase();
  await writeSupabaseDb(db, client);
}

export function createId(): string {
  return randomUUID();
}
