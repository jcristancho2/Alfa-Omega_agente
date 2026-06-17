import { config } from "../config";
import {
  cancelOrder,
  getAccounts,
  getAuthStatus,
  getExecutions,
  getHistoricalData,
  getMarketDataSnapshot,
  getOpenOrders,
  getOrderStatus,
  getPortfolio,
  initializeBrokerageSession,
  placeOrder,
  placeBracketOrder,
  previewBracketOrder,
  previewOrder,
  replyToOrderWarning,
  searchInstruments,
  tickle
} from "./ibkr-client";
import {
  cancelTwsOrder,
  getTwsAccounts,
  getTwsAuthStatus,
  getTwsExecutions,
  getTwsHistoricalData,
  getTwsMarketDataSnapshot,
  getTwsOpenOrders,
  getTwsOrderStatus,
  getTwsPortfolio,
  placeTwsBracketOrder,
  placeTwsOrder,
  previewTwsBracketOrder,
  previewTwsOrder,
  searchTwsInstruments
} from "./tws-client";

function isTwsMode() {
  return config.connectionMode === "tws";
}

export function getBrokerAuthStatus() {
  return isTwsMode() ? getTwsAuthStatus() : getAuthStatus();
}

export function getBrokerAccounts() {
  return isTwsMode() ? getTwsAccounts() : getAccounts();
}

export function initializeBrokerSession() {
  return isTwsMode() ? getTwsAuthStatus() : initializeBrokerageSession();
}

export function tickleBrokerSession() {
  return isTwsMode() ? getTwsAuthStatus() : tickle();
}

export function getBrokerMarketDataSnapshot(conid: string) {
  return isTwsMode() ? getTwsMarketDataSnapshot(conid) : getMarketDataSnapshot(conid);
}

export function searchBrokerInstruments(query: string) {
  return isTwsMode() ? searchTwsInstruments(query) : searchInstruments(query);
}

export function getBrokerHistoricalData(conid: string, timeframe: string, limit: number) {
  const cpapiBars: Record<string, string> = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d"
  };
  return isTwsMode()
    ? getTwsHistoricalData(conid, timeframe, limit)
    : getHistoricalData(
        conid,
        timeframe === "1d" ? `${Math.max(limit, 2)}d` : timeframe === "4h" || timeframe === "1h" ? "30d" : "1d",
        cpapiBars[timeframe] ?? "1h"
      );
}

export function previewBrokerOrder(accountId: string, order: Record<string, unknown>) {
  return isTwsMode() ? previewTwsOrder(accountId, order) : previewOrder(accountId, order);
}

export function placeBrokerOrder(accountId: string, order: Record<string, unknown>) {
  return isTwsMode() ? placeTwsOrder(accountId, order) : placeOrder(accountId, order);
}

export function previewBrokerBracketOrder(accountId: string, orders: Record<string, unknown>[]) {
  return isTwsMode() ? previewTwsBracketOrder(accountId, orders) : previewBracketOrder(accountId, orders);
}

export function placeBrokerBracketOrder(accountId: string, orders: Record<string, unknown>[]) {
  return isTwsMode() ? placeTwsBracketOrder(accountId, orders) : placeBracketOrder(accountId, orders);
}

export function getBrokerOpenOrders() {
  return isTwsMode() ? getTwsOpenOrders() : getOpenOrders();
}

export function getBrokerOrderStatus(orderId: string) {
  return isTwsMode() ? getTwsOrderStatus(orderId) : getOrderStatus(orderId);
}

export function getBrokerPortfolio(accountId = config.ibkrAccountId) {
  return isTwsMode() ? getTwsPortfolio(accountId) : getPortfolio(accountId);
}

export function getBrokerExecutions() {
  return isTwsMode() ? getTwsExecutions() : getExecutions();
}

export function cancelBrokerOrder(accountId: string, orderId: string) {
  return isTwsMode() ? cancelTwsOrder(accountId, orderId) : cancelOrder(accountId, orderId);
}

export function replyToBrokerWarning(replyId: string, confirmed: boolean) {
  if (isTwsMode()) {
    throw new Error("Manual warning replies are not supported in TWS mode");
  }
  return replyToOrderWarning(replyId, confirmed);
}
