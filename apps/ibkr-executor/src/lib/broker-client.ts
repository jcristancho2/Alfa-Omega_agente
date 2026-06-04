import { config } from "../config";
import {
  cancelOrder,
  getAccounts,
  getAuthStatus,
  getExecutions,
  getMarketDataSnapshot,
  getOpenOrders,
  getPortfolio,
  initializeBrokerageSession,
  placeOrder,
  previewOrder,
  replyToOrderWarning,
  tickle
} from "./ibkr-client";
import {
  cancelTwsOrder,
  getTwsAccounts,
  getTwsAuthStatus,
  getTwsExecutions,
  getTwsMarketDataSnapshot,
  getTwsOpenOrders,
  getTwsPortfolio,
  placeTwsOrder,
  previewTwsOrder
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

export function previewBrokerOrder(accountId: string, order: Record<string, unknown>) {
  return isTwsMode() ? previewTwsOrder(accountId, order) : previewOrder(accountId, order);
}

export function placeBrokerOrder(accountId: string, order: Record<string, unknown>) {
  return isTwsMode() ? placeTwsOrder(accountId, order) : placeOrder(accountId, order);
}

export function getBrokerOpenOrders() {
  return isTwsMode() ? getTwsOpenOrders() : getOpenOrders();
}

export function getBrokerPortfolio() {
  return isTwsMode() ? getTwsPortfolio() : getPortfolio(config.ibkrAccountId);
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
