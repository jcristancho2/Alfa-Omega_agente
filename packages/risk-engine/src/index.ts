import type { RiskDecision, TradeOrderRequest } from "@alfa-omega/trading-types";

export interface RiskInput extends TradeOrderRequest {
  allowLiveTrading: boolean;
  allowedSymbols?: string[];
  dailyTrades: number;
  killSwitch: boolean;
  maxDailyTrades: number;
  maxOrderNotional: number;
  maxOrderQty: number;
}

function fail(rule: string, reason: string, metadata?: Record<string, unknown>): RiskDecision {
  return { metadata, passed: false, reason, rule };
}

export function validateOrderRisk(input: RiskInput): RiskDecision {
  if (input.killSwitch) {
    return fail("kill_switch", "Trading kill switch is enabled");
  }

  if (input.accountMode === "live" && !input.allowLiveTrading) {
    return fail("live_trading_disabled", "Live trading is disabled");
  }

  if (input.quantity <= 0) {
    return fail("quantity_positive", "Quantity must be greater than zero", {
      quantity: input.quantity
    });
  }

  if (input.quantity > input.maxOrderQty) {
    return fail("max_order_quantity", "Quantity exceeds max order quantity", {
      maxOrderQty: input.maxOrderQty,
      quantity: input.quantity
    });
  }

  if (input.orderType !== "LMT") {
    return fail("limit_orders_only", "Only LMT orders are enabled during initial IBKR integration", {
      orderType: input.orderType
    });
  }

  if (input.orderType === "LMT" && (input.limitPrice === undefined || input.limitPrice <= 0)) {
    return fail("limit_price_required", "LMT orders require a positive limit price");
  }

  const notional = input.quantity * (input.limitPrice ?? 0);
  if (notional > input.maxOrderNotional) {
    return fail("max_order_notional", "Order notional exceeds max order notional", {
      maxOrderNotional: input.maxOrderNotional,
      notional
    });
  }

  if (input.dailyTrades >= input.maxDailyTrades) {
    return fail("max_daily_trades", "Daily trade limit reached", {
      dailyTrades: input.dailyTrades,
      maxDailyTrades: input.maxDailyTrades
    });
  }

  if (input.allowedSymbols?.length && !input.allowedSymbols.includes(input.symbol)) {
    return fail("allowed_symbols", "Symbol is not in the allowed symbols list", {
      allowedSymbols: input.allowedSymbols,
      symbol: input.symbol
    });
  }

  return {
    metadata: { notional },
    passed: true,
    reason: null,
    rule: "passed"
  };
}
