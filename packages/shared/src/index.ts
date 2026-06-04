import { z } from "zod";

export const TradingModeSchema = z.enum(["simulated", "paper", "live"]);
export const BotStatusSchema = z.enum([
  "active",
  "paused",
  "risk_locked",
  "error",
  "maintenance"
]);

export const SignalSchema = z.object({
  symbol: z.string(),
  strategy: z.string(),
  direction: z.enum(["BUY", "SELL"]),
  score: z.number().int().min(0).max(13),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  entry_price: z.number().nullable().optional(),
  stop_loss: z.number().nullable().optional(),
  take_profit_1: z.number().nullable().optional(),
  take_profit_2: z.number().nullable().optional(),
  source: z.string().default("unknown"),
  reason: z.string().optional()
});

export type Signal = z.infer<typeof SignalSchema>;
export type TradingMode = z.infer<typeof TradingModeSchema>;
export type BotStatus = z.infer<typeof BotStatusSchema>;

export * from "./local-db";
