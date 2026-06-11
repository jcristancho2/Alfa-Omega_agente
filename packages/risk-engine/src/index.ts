import type { RiskDecision, TradeOrderRequest } from "@alfa-omega/trading-types";

export interface RiskInput extends TradeOrderRequest {
  allowLiveTrading: boolean;
  allowedSymbols?: string[];
  dailyTrades: number;
  killSwitch: boolean;
  maxDailyTrades: number;
  maxOrderNotional: number;
  maxOrderQty: number;
  availableCash?: number;
  availablePositionQty?: number;
  idempotencyKeyExists?: boolean;
  stopLoss?: number;
  takeProfit?: number;
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

  if (input.idempotencyKeyExists) {
    return fail("duplicate_order", "An order with this idempotency key already exists");
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

  if (input.availableCash !== undefined && input.side === "BUY" && notional > input.availableCash) {
    return fail("insufficient_cash", "Order notional exceeds available cash", {
      availableCash: input.availableCash,
      notional
    });
  }

  if (
    input.availablePositionQty !== undefined &&
    input.side === "SELL" &&
    input.quantity > input.availablePositionQty
  ) {
    return fail("insufficient_position", "Sell quantity exceeds available position", {
      availablePositionQty: input.availablePositionQty,
      quantity: input.quantity
    });
  }

  if (input.stopLoss !== undefined || input.takeProfit !== undefined) {
    const referencePrice = input.limitPrice;
    if (!referencePrice || input.stopLoss === undefined || input.takeProfit === undefined) {
      return fail("bracket_prices_required", "Bracket orders require entry, stop loss and take profit");
    }
    const valid =
      input.side === "BUY"
        ? input.stopLoss < referencePrice && input.takeProfit > referencePrice
        : input.stopLoss > referencePrice && input.takeProfit < referencePrice;
    if (!valid) {
      return fail("invalid_bracket_prices", "Stop loss and take profit are invalid for order side");
    }
  }

  if (input.dailyTrades >= input.maxDailyTrades) {
    return fail("max_daily_trades", "Daily trade limit reached", {
      dailyTrades: input.dailyTrades,
      maxDailyTrades: input.maxDailyTrades
    });
  }

  const normalizedSymbol = input.symbol.trim().toUpperCase();
  const normalizedAllowedSymbols = input.allowedSymbols?.map((symbol) => symbol.trim().toUpperCase());
  if (normalizedAllowedSymbols?.length && !normalizedAllowedSymbols.includes(normalizedSymbol)) {
    return fail("allowed_symbols", "Symbol is not in the allowed symbols list", {
      allowedSymbols: normalizedAllowedSymbols,
      symbol: normalizedSymbol
    });
  }

  return {
    metadata: { notional },
    passed: true,
    reason: null,
    rule: "passed"
  };
}
