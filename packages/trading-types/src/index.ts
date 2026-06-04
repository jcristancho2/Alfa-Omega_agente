export type AccountMode = "paper" | "live";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "LMT" | "MKT" | "STP" | "STOP_LIMIT";
export type TimeInForce = "DAY" | "GTC" | "IOC";

export interface TradingSignal {
  assetClass: string;
  confidence?: number;
  payload: Record<string, unknown>;
  side: OrderSide;
  source: string;
  strategyId: string;
  symbol: string;
  timeframe?: string;
}

export interface TradeOrderRequest {
  accountId?: string;
  accountMode: AccountMode;
  conid: number;
  limitPrice?: number;
  orderType: OrderType;
  quantity: number;
  side: OrderSide;
  signal?: TradingSignal;
  symbol: string;
  tif: TimeInForce;
}

export interface TradeOrderResponse {
  brokerOrderId?: string;
  brokerReplyId?: string;
  dryRun: boolean;
  rawResponse?: unknown;
  requiresManualConfirmation: boolean;
  status: "previewed" | "submitted" | "broker_warning" | "broker_rejected" | "broker_error";
}

export interface BrokerExecutionLog {
  broker: "IBKR";
  endpoint: string;
  errorMessage?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  statusCode?: number;
}

export interface RiskDecision {
  metadata?: Record<string, unknown>;
  passed: boolean;
  reason: string | null;
  rule: string;
}
