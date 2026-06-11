import type { Candle, RecurringSchedule } from "@alfa-omega/trading-types";

export function quantityFromUsd(usd: number, price: number, increment = 1) {
  if (usd <= 0 || price <= 0 || increment <= 0) return 0;
  const steps = Math.floor(usd / price / increment);
  return Number((steps * increment).toFixed(8));
}

export function ema(values: number[], period: number) {
  if (period <= 0 || values.length < period) return [];
  const multiplier = 2 / (period + 1);
  const result = [values.slice(0, period).reduce((sum, value) => sum + value, 0) / period];
  for (const value of values.slice(period)) {
    result.push((value - result[result.length - 1]) * multiplier + result[result.length - 1]);
  }
  return result;
}

export function emaCrossSignal(candles: Candle[], fastPeriod: number, slowPeriod: number) {
  if (fastPeriod >= slowPeriod || candles.length < slowPeriod + 2) return null;
  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const previousFast = fast[fast.length - 2];
  const currentFast = fast[fast.length - 1];
  const previousSlow = slow[slow.length - 2];
  const currentSlow = slow[slow.length - 1];
  if ([previousFast, currentFast, previousSlow, currentSlow].some((value) => value === undefined)) return null;
  if (previousFast <= previousSlow && currentFast > currentSlow) return "BUY" as const;
  if (previousFast >= previousSlow && currentFast < currentSlow) return "SELL" as const;
  return null;
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    weekday: "short",
    year: "numeric"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function nextRunAt(schedule: Pick<RecurringSchedule, "intervalCount" | "intervalUnit" | "scheduleKind" | "timezone" | "weeklyDays" | "weeklyTime">, from = new Date()) {
  if (schedule.scheduleKind === "interval") {
    const count = schedule.intervalCount ?? 1;
    const milliseconds = count * ({ minute: 60_000, hour: 3_600_000, day: 86_400_000 }[schedule.intervalUnit ?? "day"]);
    return new Date(from.getTime() + milliseconds);
  }
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const targetDays = schedule.weeklyDays?.length ? schedule.weeklyDays : [1];
  const [targetHour, targetMinute] = (schedule.weeklyTime ?? "09:00").split(":").map(Number);
  for (let minute = 1; minute <= 8 * 24 * 60; minute += 1) {
    const candidate = new Date(from.getTime() + minute * 60_000);
    const parts = zonedParts(candidate, schedule.timezone);
    if (targetDays.includes(weekdays[parts.weekday]) && Number(parts.hour) === targetHour && Number(parts.minute) === targetMinute) {
      return candidate;
    }
  }
  throw new Error("unable to calculate next weekly run");
}
