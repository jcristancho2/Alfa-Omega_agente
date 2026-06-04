import { config } from "../config";

type Method = "DELETE" | "GET" | "POST";

interface IbkrRequestOptions {
  body?: unknown;
}

export interface IbkrClientResult<T = unknown> {
  data: T;
  status: number;
}

const requestTimestamps: number[] = [];
const maxRequestsPerSecond = 10;

async function enforcePacing() {
  const now = Date.now();
  while (requestTimestamps.length && now - requestTimestamps[0] > 1000) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= maxRequestsPerSecond) {
    const waitMs = 1000 - (now - requestTimestamps[0]);
    await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 0)));
  }

  requestTimestamps.push(Date.now());
}

export async function ibkrRequest<T = unknown>(
  method: Method,
  path: string,
  body?: unknown
): Promise<IbkrClientResult<T>> {
  await enforcePacing();

  const response = await fetch(`${config.baseUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    method
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await response.json()) as T)
    : ((await response.text()) as T);

  if (!response.ok) {
    throw new Error(`IBKR ${method} ${path} failed with ${response.status}: ${JSON.stringify(data)}`);
  }

  return { data, status: response.status };
}

export function getAuthStatus() {
  return ibkrRequest("POST", "/iserver/auth/status", {});
}

export function getAccounts() {
  return ibkrRequest("GET", "/portfolio/accounts");
}

export function tickle() {
  return ibkrRequest("POST", "/tickle");
}

export function initializeBrokerageSession() {
  return ibkrRequest("POST", "/iserver/auth/ssodh/init", {
    compete: true,
    publish: true
  });
}

export function getMarketDataSnapshot(conid: string) {
  return ibkrRequest("GET", `/iserver/marketdata/snapshot?conids=${encodeURIComponent(conid)}`);
}

export function previewOrder(accountId: string, order: unknown) {
  return ibkrRequest("POST", `/iserver/account/${accountId}/orders/whatif`, { orders: [order] });
}

export function placeOrder(accountId: string, order: unknown) {
  return ibkrRequest("POST", `/iserver/account/${accountId}/orders`, { orders: [order] });
}

export function replyToOrderWarning(replyId: string, confirmed: boolean) {
  return ibkrRequest("POST", `/iserver/reply/${replyId}`, { confirmed });
}

export function getOpenOrders() {
  return ibkrRequest("GET", "/iserver/account/orders");
}

export function getPortfolio(accountId: string) {
  return ibkrRequest("GET", `/portfolio/${accountId}/positions/0`);
}

export function getExecutions() {
  return ibkrRequest("GET", "/iserver/account/trades");
}

export function cancelOrder(accountId: string, orderId: string) {
  return ibkrRequest("DELETE", `/iserver/account/${accountId}/order/${orderId}`);
}
