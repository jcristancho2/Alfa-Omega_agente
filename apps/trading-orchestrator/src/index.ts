import { createClient } from "@supabase/supabase-js";
import type { Candle } from "@alfa-omega/trading-types";
import { emaCrossSignal, nextRunAt, quantityFromUsd } from "./lib";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !serviceKey) throw new Error("trading-orchestrator requires Supabase");
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const gatewayUrl = process.env.BROKER_GATEWAY_URL ?? "http://localhost:4100";
const gatewayApiKey = process.env.BROKER_GATEWAY_API_KEY ?? "";
const apiUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
const operatorApiKey = process.env.OPERATOR_API_KEY ?? "";
const intervalMs = Number(process.env.ORCHESTRATOR_INTERVAL_MS ?? 3000);

function normalizeStatus(status: unknown) {
  const value = String(status ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (value === "filled") return "filled";
  if (value === "partiallyfilled") return "partially_filled";
  if (["cancelled", "apicancelled"].includes(value)) return "cancelled";
  if (["inactive", "rejected"].includes(value)) return "rejected";
  if (["created", "pending", "apipending", "pendingsubmit", "presubmitted", "submitted"].includes(value)) {
    return value === "created" ? "created" : "submitted";
  }
  return "failed";
}

function nullableNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface ReconciledBrokerOrderState {
  brokerStatus: string;
  filledQuantity: number;
  permId: string | null;
  remainingQuantity: number;
  status: string;
}

function brokerOrderState(input: unknown): ReconciledBrokerOrderState | null {
  if (Array.isArray(input)) {
    for (const value of input) {
      const result = brokerOrderState(value);
      if (result) return result;
    }
    return null;
  }
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const orderStatus = row.orderStatus && typeof row.orderStatus === "object"
    ? row.orderStatus as Record<string, unknown>
    : null;
  const brokerStatus = String(row.status ?? orderStatus?.status ?? "");
  if (brokerStatus) {
    const order = row.order && typeof row.order === "object"
      ? row.order as Record<string, unknown>
      : null;
    return {
        brokerStatus,
        filledQuantity: Number(row.filledQuantity ?? orderStatus?.filled ?? 0),
        permId: String(row.permId ?? row.perm_id ?? order?.permId ?? orderStatus?.permId ?? "") || null,
        remainingQuantity: Number(row.remainingQuantity ?? orderStatus?.remaining ?? 0),
        status: normalizeStatus(brokerStatus)
    };
  }
  for (const value of Object.values(row)) {
    const result = brokerOrderState(value);
    if (result) return result;
  }
  return null;
}

function brokerExecutions(input: unknown) {
  const executions: Array<Record<string, unknown>> = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (row.execution && typeof row.execution === "object") executions.push(row);
    else Object.values(row).forEach(visit);
  }
  visit(input);
  return executions;
}

function brokerPositions(input: unknown) {
  const positions: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  function tupleToPosition(row: unknown[]) {
    if (row.length >= 8 && row[0] && typeof row[0] === "object") {
      return {
        account: row[7],
        averageCost: row[4],
        contract: row[0],
        marketPrice: row[2],
        marketValue: row[3],
        position: row[1],
        realizedPNL: row[6],
        unrealizedPNL: row[5]
      };
    }
    if (row.length >= 4 && row[1] && typeof row[1] === "object") {
      return {
        account: row[0],
        averageCost: row[3],
        contract: row[1],
        position: row[2]
      };
    }
    return null;
  }

  function add(row: Record<string, unknown>) {
    const contract = row.contract && typeof row.contract === "object"
      ? row.contract as Record<string, unknown>
      : {};
    const instrumentId = String(contract.conId ?? contract.conid ?? row.instrumentId ?? row.instrument_id ?? "");
    const symbol = String(contract.symbol ?? row.symbol ?? "");
    const account = String(row.account ?? row.accountId ?? row.broker_account_id ?? "");
    const key = `${account}:${instrumentId || symbol}`;
    const quantity = Number(row.position ?? row.quantity ?? 0);
    if ((!instrumentId && !symbol) || seen.has(key) || !Number.isFinite(quantity)) return;
    seen.add(key);
    positions.push(row);
  }

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      const position = tupleToPosition(value);
      if (position) {
        add(position);
        return;
      }
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (row.contract && (row.position !== undefined || row.quantity !== undefined)) add(row);
    else Object.values(row).forEach(visit);
  }

  visit(input);
  return positions;
}

async function gateway(path: string, init?: RequestInit) {
  const response = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-api-key": gatewayApiKey, ...(init?.headers ?? {}) }
  });
  const result = await response.json().catch(() => ({})) as { data?: unknown; error?: unknown };
  if (!response.ok) throw new Error(String(result.error ?? `gateway ${response.status}`));
  return result.data;
}

async function submitOrder(input: Record<string, unknown>) {
  const response = await fetch(`${apiUrl}/api/trading/v2/orders/submit`, {
    body: JSON.stringify({ ...input, brokerId: input.brokerId ?? input.broker }),
    headers: { "content-type": "application/json", "x-operator-key": operatorApiKey },
    method: "POST"
  });
  const result = await response.json().catch(() => ({})) as { error?: unknown; orderId?: string; risk?: { reason?: string } };
  if (!response.ok) throw new Error(String(result.error ?? result.risk?.reason ?? `api ${response.status}`));
  return result;
}

async function processSchedules() {
  const now = new Date();
  const { data: schedules, error } = await db.from("recurring_schedules").select("*").eq("status", "active").lte("next_run_at", now.toISOString()).limit(20);
  if (error) throw error;
  for (const schedule of schedules ?? []) {
    const idempotencyKey = `schedule:${schedule.id}:${schedule.next_run_at}`;
    const run = await db.from("schedule_runs").insert({ idempotency_key: idempotencyKey, schedule_id: schedule.id, status: "started" }).select("id").single();
    if (run.error) continue;
    try {
      const candles = await gateway(`/brokers/${schedule.broker}/instruments/${schedule.instrument_id}/candles?timeframe=1m&limit=2`) as Candle[];
      const price = candles.at(-1)?.close ?? 0;
      const quantity = schedule.amount_type === "usd" ? quantityFromUsd(Number(schedule.amount), price) : Number(schedule.amount);
      if (quantity <= 0) throw new Error("calculated quantity is zero");
      const order = await submitOrder({
        accountId: schedule.broker_account_id, accountMode: "paper", brokerId: schedule.broker,
        idempotencyKey, instrumentId: schedule.instrument_id, conid: Number(schedule.instrument_id),
        limitPrice: price, orderType: "LMT", quantity, side: schedule.side, symbol: schedule.symbol, tif: "DAY",
        ...(schedule.stop_loss && schedule.take_profit ? { stopLoss: Number(schedule.stop_loss), takeProfit: Number(schedule.take_profit) } : {})
      });
      await db.from("trade_orders").update({ recurring_schedule_id: schedule.id }).eq("id", order.orderId);
      await db.from("schedule_runs").update({ order_id: order.orderId ?? null, status: "submitted" }).eq("id", run.data.id);
    } catch (cause) {
      await db.from("schedule_runs").update({ error_message: cause instanceof Error ? cause.message : String(cause), status: "failed" }).eq("id", run.data.id);
    } finally {
      const next = nextRunAt({
        intervalCount: schedule.interval_count, intervalUnit: schedule.interval_unit,
        scheduleKind: schedule.schedule_kind, timezone: schedule.timezone,
        weeklyDays: schedule.weekly_days, weeklyTime: schedule.weekly_time
      }, new Date(schedule.next_run_at));
      await db.from("recurring_schedules").update({ next_run_at: next.toISOString(), updated_at: now.toISOString() }).eq("id", schedule.id);
    }
  }
}

async function processStrategies() {
  const { data: strategies, error } = await db.from("strategy_configs").select("*").eq("status", "active").limit(20);
  if (error) throw error;
  for (const strategy of strategies ?? []) {
    try {
      const candles = await gateway(`/brokers/${strategy.broker}/instruments/${strategy.instrument_id}/candles?timeframe=${strategy.timeframe}&limit=${Math.max(strategy.slow_period + 5, 50)}`) as Candle[];
      const latest = candles.at(-1);
      if (!latest || latest.timestamp === strategy.last_evaluated_candle) continue;
      const signal = emaCrossSignal(candles, strategy.fast_period, strategy.slow_period);
      const run = await db.from("strategy_runs").insert({ candle_timestamp: latest.timestamp, signal, status: signal ? "signal" : "no_signal", strategy_id: strategy.id }).select("id").single();
      await db.from("strategy_configs").update({ last_evaluated_candle: latest.timestamp, updated_at: new Date().toISOString() }).eq("id", strategy.id);
      if (!signal || run.error) continue;
      const quantity = strategy.amount_type === "usd" ? quantityFromUsd(Number(strategy.amount), latest.close) : Number(strategy.amount);
      if (quantity <= 0) throw new Error("calculated quantity is zero");
      const stopLoss = signal === "BUY" ? latest.close * (1 - strategy.stop_loss_percent / 100) : latest.close * (1 + strategy.stop_loss_percent / 100);
      const takeProfit = signal === "BUY" ? latest.close * (1 + strategy.take_profit_percent / 100) : latest.close * (1 - strategy.take_profit_percent / 100);
      const idempotencyKey = `strategy:${strategy.id}:${latest.timestamp}`;
      const order = await submitOrder({ accountId: strategy.broker_account_id, accountMode: "paper", broker: strategy.broker, conid: Number(strategy.instrument_id), idempotencyKey, instrumentId: strategy.instrument_id, limitPrice: latest.close, orderType: "LMT", quantity, side: signal, stopLoss, symbol: strategy.symbol, takeProfit, tif: "DAY" });
      await db.from("trade_orders").update({ strategy_config_id: strategy.id }).eq("id", order.orderId);
      await db.from("strategy_runs").update({ order_id: order.orderId ?? null, status: "submitted" }).eq("id", run.data.id);
    } catch (cause) {
      console.error("strategy cycle failed", strategy.id, cause);
    }
  }
}

async function reconcile() {
  const { data: orders, error } = await db.from("trade_orders").select("id,broker,broker_account_id,broker_order_id,normalized_status").in("normalized_status", ["created", "submitted", "partially_filled"]).not("broker_order_id", "is", null).limit(100);
  if (error) throw error;
  for (const order of orders ?? []) {
    try {
      const raw = await gateway(`/brokers/${order.broker}/orders/${order.broker_order_id}`);
      const state = brokerOrderState(raw);
      if (!state) continue;
      const timestamp = new Date().toISOString();
      await db.from("trade_orders").update({
        broker_perm_id: state.permId,
        broker_status: state.brokerStatus,
        cancelled_at: state.status === "cancelled" ? timestamp : undefined,
        filled_at: state.status === "filled" ? timestamp : undefined,
        filled_quantity: state.filledQuantity,
        last_reconciled_at: timestamp,
        normalized_status: state.status,
        remaining_quantity: state.remainingQuantity,
        status: state.status,
        updated_at: timestamp
      }).eq("id", order.id);
      if (state.status !== order.normalized_status) {
        await db.from("order_status_events").insert({ broker: order.broker, broker_order_id: order.broker_order_id, order_id: order.id, payload: raw, status: state.status });
      }
    } catch (cause) {
      console.error("reconcile failed", order.id, cause);
    }
  }
}

async function reconcileBracketLegs() {
  const { data: legs, error } = await db.from("order_legs").select("id,order_id,broker_order_id,leg_type,status,trade_orders!inner(broker)").in("status", ["created", "submitted", "partially_filled"]).not("broker_order_id", "is", null).limit(100);
  if (error) throw error;
  for (const leg of legs ?? []) {
    const relation = leg.trade_orders as unknown as { broker: string };
    try {
      const raw = await gateway(`/brokers/${relation.broker}/orders/${leg.broker_order_id}`);
      const state = brokerOrderState(raw);
      if (!state || state.status === leg.status) continue;
      await db.from("order_legs").update({ broker_response: raw, status: state.status, updated_at: new Date().toISOString() }).eq("id", leg.id);
      if (state.status === "filled" && leg.leg_type !== "entry") {
        const { data: siblings } = await db.from("order_legs").select("id,broker_order_id,status").eq("order_id", leg.order_id).neq("id", leg.id).neq("leg_type", "entry").in("status", ["created", "submitted", "partially_filled"]);
        for (const sibling of siblings ?? []) {
          if (sibling.broker_order_id) await gateway(`/brokers/${relation.broker}/orders/${sibling.broker_order_id}`, { method: "DELETE" }).catch(() => null);
          await db.from("order_legs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", sibling.id);
        }
      }
    } catch (cause) {
      console.error("bracket leg reconcile failed", leg.id, cause);
    }
  }
}

async function reconcileExecutions() {
  const { data: accounts, error } = await db.from("broker_accounts").select("broker,broker_account_id").eq("enabled", true);
  if (error) throw error;
  for (const account of accounts ?? []) {
    try {
      const raw = await gateway(`/brokers/${account.broker}/executions?accountId=${encodeURIComponent(account.broker_account_id)}`);
      for (const row of brokerExecutions(raw)) {
        const execution = row.execution as Record<string, unknown>;
        const commissionReport = row.commissionReport && typeof row.commissionReport === "object"
          ? row.commissionReport as Record<string, unknown>
          : {};
        const contract = row.contract && typeof row.contract === "object" ? row.contract as Record<string, unknown> : {};
        const executionId = String(execution.execId ?? execution.executionId ?? "");
        if (!executionId) continue;
        const brokerOrderId = String(execution.orderId ?? execution.order_id ?? "");
        const order = brokerOrderId
          ? await db.from("trade_orders").select("id").eq("broker", account.broker).eq("broker_order_id", brokerOrderId).maybeSingle()
          : { data: null };
        await db.from("broker_executions").upsert({
          broker: account.broker,
          broker_account_id: account.broker_account_id,
          broker_execution_id: executionId,
          broker_order_id: brokerOrderId || null,
          commission: nullableNumber(commissionReport.commission),
          commission_currency: commissionReport.currency ?? null,
          exchange: execution.exchange ?? null,
          executed_at: execution.time ?? row.time ?? new Date().toISOString(),
          order_id: order.data?.id ?? null,
          payload: row,
          price: nullableNumber(execution.price) ?? 0,
          quantity: nullableNumber(execution.shares ?? execution.quantity) ?? 0,
          realized_pnl: nullableNumber(commissionReport.realizedPNL),
          side: execution.side ?? null,
          symbol: String(contract.symbol ?? execution.symbol ?? "")
        }, { onConflict: "broker,broker_execution_id" });
      }
    } catch (cause) {
      console.error("execution reconcile failed", account.broker, account.broker_account_id, cause);
    }
  }
}

async function reconcilePositions() {
  const { data: accounts, error } = await db.from("broker_accounts").select("broker,broker_account_id").eq("enabled", true);
  if (error) throw error;
  for (const account of accounts ?? []) {
    try {
      const raw = await gateway(`/brokers/${account.broker}/positions?accountId=${encodeURIComponent(account.broker_account_id)}`);
      for (const row of brokerPositions(raw)) {
        const contract = row.contract && typeof row.contract === "object" ? row.contract as Record<string, unknown> : {};
        const instrumentId = String(contract.conId ?? contract.conid ?? row.instrumentId ?? row.instrument_id ?? "");
        const symbol = String(contract.symbol ?? row.symbol ?? "");
        if (!instrumentId || !symbol) continue;
        await db.from("broker_positions").upsert({
          asset_class: contract.secType ?? row.assetClass ?? null,
          average_cost: nullableNumber(row.averageCost ?? row.avgCost),
          broker: account.broker,
          broker_account_id: String(row.account ?? account.broker_account_id),
          currency: contract.currency ?? row.currency ?? null,
          exchange: contract.exchange ?? contract.primaryExchange ?? row.exchange ?? null,
          instrument_id: instrumentId,
          market_price: nullableNumber(row.marketPrice),
          market_value: nullableNumber(row.marketValue),
          payload: row,
          quantity: nullableNumber(row.position ?? row.quantity) ?? 0,
          realized_pnl: nullableNumber(row.realizedPNL),
          symbol,
          unrealized_pnl: nullableNumber(row.unrealizedPNL),
          updated_at: new Date().toISOString()
        }, { onConflict: "broker,broker_account_id,instrument_id" });
      }
    } catch (cause) {
      console.error("position reconcile failed", account.broker, account.broker_account_id, cause);
    }
  }
}

async function cycle() {
  await Promise.allSettled([processSchedules(), processStrategies(), reconcile(), reconcileBracketLegs(), reconcileExecutions(), reconcilePositions()]);
}

console.log(`Trading orchestrator running every ${intervalMs}ms`);
await cycle();
setInterval(cycle, intervalMs);
