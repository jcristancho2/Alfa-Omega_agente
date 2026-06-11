import { describe, expect, it } from "bun:test";
import type { Candle } from "@alfa-omega/trading-types";
import { emaCrossSignal, nextRunAt, quantityFromUsd } from "./lib";

describe("orchestrator helpers", () => {
  it("converts USD to whole share quantity", () => {
    expect(quantityFromUsd(250, 100)).toBe(2);
    expect(quantityFromUsd(50, 100)).toBe(0);
  });

  it("calculates interval next run", () => {
    const next = nextRunAt({ intervalCount: 5, intervalUnit: "minute", scheduleKind: "interval", timezone: "America/Bogota" }, new Date("2026-06-10T10:00:00Z"));
    expect(next.toISOString()).toBe("2026-06-10T10:05:00.000Z");
  });

  it("detects a bullish EMA cross", () => {
    const closes = [10, 10, 10, 10, 10, 9, 8, 12];
    const candles: Candle[] = closes.map((close, index) => ({ close, high: close, low: close, open: close, timestamp: new Date(index * 60_000).toISOString(), volume: 1 }));
    expect(emaCrossSignal(candles, 2, 4)).toBe("BUY");
  });
});
