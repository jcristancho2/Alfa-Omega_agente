export const config = {
  allowLiveTrading: process.env.ALLOW_LIVE_TRADING === "true",
  apiKey: process.env.EXECUTOR_API_KEY ?? "",
  autoConfirmWarnings: process.env.IBKR_AUTO_CONFIRM_WARNINGS === "true",
  baseUrl: process.env.IBKR_BASE_URL ?? "https://localhost:5000/v1/api",
  connectionMode: process.env.IBKR_CONNECTION_MODE ?? "cpapi",
  dryRun: process.env.IBKR_DRY_RUN !== "false",
  ibkrAccountId: process.env.IBKR_ACCOUNT_ID ?? "",
  maxDailyLoss: Number(process.env.MAX_DAILY_LOSS ?? 100),
  maxDailyTrades: Number(process.env.MAX_DAILY_TRADES ?? 20),
  maxOrderNotional: Number(process.env.MAX_ORDER_NOTIONAL ?? 500),
  maxOrderQty: Number(process.env.MAX_ORDER_QTY ?? 1),
  port: Number(process.env.PORT ?? 8080),
  twsClientId: Number(process.env.IBKR_CLIENT_ID ?? process.env.IBKR_TWS_CLIENT_ID ?? 1),
  twsHost: process.env.IBKR_HOST ?? process.env.IBKR_TWS_HOST ?? "127.0.0.1",
  twsPort: Number(process.env.IBKR_PORT ?? process.env.IBKR_TWS_PORT ?? 4002),
  twsTimeoutSeconds: Number(process.env.IBKR_TWS_TIMEOUT_SECONDS ?? 8)
};
