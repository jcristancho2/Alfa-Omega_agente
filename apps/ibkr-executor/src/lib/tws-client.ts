import { join } from "node:path";
import { config } from "../config";

type TwsAction =
  | "accounts"
  | "authStatus"
  | "cancel"
  | "executions"
  | "historicalData"
  | "marketdata"
  | "openOrders"
  | "orderStatus"
  | "place"
  | "placeBracket"
  | "portfolio"
  | "preview"
  | "previewBracket"
  | "searchInstruments";

interface TwsPayload {
  accountId?: string;
  action: TwsAction;
  conid?: number;
  limitPrice?: number;
  orderId?: string;
  orderType?: string;
  quantity?: number;
  side?: string;
  symbol?: string;
  tif?: string;
  timeframe?: string;
  limit?: number;
  orders?: Record<string, unknown>[];
  query?: string;
}

async function runTwsBridge(payload: TwsPayload) {
  const scriptPath = join(import.meta.dir, "tws_bridge.py");
  const proc = Bun.spawn(["python3", scriptPath], {
    env: {
      ...process.env,
      IBKR_ACCOUNT_ID: config.ibkrAccountId,
      IBKR_CLIENT_ID: String(config.twsClientId),
      IBKR_HOST: config.twsHost,
      IBKR_PORT: String(config.twsPort),
      IBKR_TWS_CLIENT_ID: String(config.twsClientId),
      IBKR_TWS_HOST: config.twsHost,
      IBKR_TWS_PORT: String(config.twsPort),
      IBKR_TWS_TIMEOUT_SECONDS: String(config.twsTimeoutSeconds)
    },
    stderr: "pipe",
    stdin: "pipe",
    stdout: "pipe"
  });

  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `TWS bridge failed with exit code ${exitCode}`);
  }

  const jsonLine = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  const data = JSON.parse(jsonLine || "{}") as { ok?: boolean; error?: string; [key: string]: unknown };
  if (!data.ok) {
    throw new Error(data.error ?? "TWS bridge returned an error");
  }

  return { data, status: 200 };
}

export function getTwsAuthStatus() {
  return runTwsBridge({ action: "authStatus" });
}

export function getTwsAccounts() {
  return runTwsBridge({ action: "accounts" });
}

export function getTwsMarketDataSnapshot(conid: string) {
  return runTwsBridge({ action: "marketdata", conid: Number(conid) });
}

export function searchTwsInstruments(query: string) {
  return runTwsBridge({ action: "searchInstruments", query });
}

export function getTwsHistoricalData(conid: string, timeframe: string, limit: number) {
  return runTwsBridge({ action: "historicalData", conid: Number(conid), timeframe, limit });
}

export function previewTwsOrder(accountId: string, order: Record<string, unknown>) {
  return runTwsBridge({
    accountId,
    action: "preview",
    conid: Number(order.conid),
    limitPrice: Number(order.price),
    orderType: String(order.orderType),
    quantity: Number(order.quantity),
    side: String(order.side),
    symbol: String(order.ticker),
    tif: String(order.tif)
  });
}

export function placeTwsOrder(accountId: string, order: Record<string, unknown>) {
  return runTwsBridge({
    accountId,
    action: "place",
    conid: Number(order.conid),
    limitPrice: Number(order.price),
    orderType: String(order.orderType),
    quantity: Number(order.quantity),
    side: String(order.side),
    symbol: String(order.ticker),
    tif: String(order.tif)
  });
}

export function previewTwsBracketOrder(accountId: string, orders: Record<string, unknown>[]) {
  return runTwsBridge({ accountId, action: "previewBracket", orders });
}

export function placeTwsBracketOrder(accountId: string, orders: Record<string, unknown>[]) {
  return runTwsBridge({ accountId, action: "placeBracket", orders });
}

export function getTwsOpenOrders() {
  return runTwsBridge({ action: "openOrders" });
}

export function getTwsOrderStatus(orderId: string) {
  return runTwsBridge({ action: "orderStatus", orderId });
}

export function getTwsPortfolio() {
  return runTwsBridge({ accountId: config.ibkrAccountId, action: "portfolio" });
}

export function getTwsExecutions() {
  return runTwsBridge({ action: "executions" });
}

export function cancelTwsOrder(accountId: string, orderId: string) {
  return runTwsBridge({ accountId, action: "cancel", orderId });
}
