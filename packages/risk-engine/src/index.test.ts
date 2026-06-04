import { describe, expect, it } from "bun:test";
import { type RiskInput, validateOrderRisk } from "./index";

const baseOrder: RiskInput = {
  accountMode: "paper",
  allowLiveTrading: false,
  conid: 265598,
  dailyTrades: 0,
  killSwitch: false,
  limitPrice: 100,
  maxDailyTrades: 20,
  maxOrderNotional: 500,
  maxOrderQty: 1,
  orderType: "LMT",
  quantity: 1,
  side: "BUY",
  symbol: "AAPL",
  tif: "DAY"
};

describe("validateOrderRisk", () => {
  it("rejects live trading when allowLiveTrading=false", () => {
    const decision = validateOrderRisk({ ...baseOrder, accountMode: "live" });
    expect(decision.passed).toBe(false);
    expect(decision.rule).toBe("live_trading_disabled");
  });

  it("rejects market orders", () => {
    const decision = validateOrderRisk({ ...baseOrder, orderType: "MKT" });
    expect(decision.passed).toBe(false);
    expect(decision.rule).toBe("limit_orders_only");
  });

  it("rejects stop orders during initial integration", () => {
    const decision = validateOrderRisk({ ...baseOrder, orderType: "STP" });
    expect(decision.passed).toBe(false);
    expect(decision.rule).toBe("limit_orders_only");
  });

  it("rejects quantity above the max", () => {
    const decision = validateOrderRisk({ ...baseOrder, quantity: 2 });
    expect(decision.passed).toBe(false);
    expect(decision.rule).toBe("max_order_quantity");
  });

  it("rejects LMT orders without price", () => {
    const decision = validateOrderRisk({ ...baseOrder, limitPrice: undefined });
    expect(decision.passed).toBe(false);
    expect(decision.rule).toBe("limit_price_required");
  });

  it("rejects notional above max", () => {
    const decision = validateOrderRisk({
      ...baseOrder,
      limitPrice: 501,
      maxOrderQty: 2
    });
    expect(decision.passed).toBe(false);
    expect(decision.rule).toBe("max_order_notional");
  });

  it("accepts a valid paper LMT order", () => {
    const decision = validateOrderRisk(baseOrder);
    expect(decision.passed).toBe(true);
    expect(decision.rule).toBe("passed");
  });
});
