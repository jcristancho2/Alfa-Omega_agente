export type AccountMode = "paper" | "live";
export type BrokerId = "ibkr" | "simulated";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "LMT" | "MKT" | "STP" | "STOP_LIMIT";
export type TimeInForce = "DAY" | "GTC" | "IOC";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type NormalizedOrderStatus =
  | "created"
  | "submitted"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "failed";

export interface BrokerAccount {
  accountId: string;
  brokerId: BrokerId;
  currency: string;
  displayName: string;
  mode: AccountMode;
}

export interface BrokerInstrument {
  assetClass: string;
  brokerId: BrokerId;
  currency: string;
  exchange: string;
  instrumentId: string;
  minTick?: number;
  name: string;
  symbol: string;
  tradable?: boolean;
}

export interface Candle {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number;
}

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
  brokerId?: BrokerId;
  conid: number;
  idempotencyKey?: string;
  instrumentId?: string;
  limitPrice?: number;
  orderType: OrderType;
  quantity: number;
  side: OrderSide;
  signal?: TradingSignal;
  symbol: string;
  tif: TimeInForce;
}

export interface OrderRequest extends Omit<TradeOrderRequest, "conid"> {
  conid?: number;
  instrumentId: string;
}

export interface BracketOrderRequest extends OrderRequest {
  stopLoss: number;
  takeProfit: number;
}

export interface TradeOrderResponse {
  brokerOrderId?: string;
  brokerReplyId?: string;
  dryRun: boolean;
  rawResponse?: unknown;
  requiresManualConfirmation: boolean;
  status: "previewed" | "submitted" | "broker_warning" | "broker_rejected" | "broker_error";
}

export interface BrokerOrder {
  brokerOrderId: string;
  filledQuantity: number;
  instrument?: BrokerInstrument;
  limitPrice?: number;
  quantity: number;
  raw?: unknown;
  remainingQuantity: number;
  side: OrderSide;
  status: NormalizedOrderStatus;
  stopPrice?: number;
  symbol: string;
  updatedAt: string;
}

export interface BrokerPosition {
  accountId: string;
  averageCost: number;
  instrument: BrokerInstrument;
  marketPrice: number;
  marketValue: number;
  quantity: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface BrokerExecution {
  brokerExecutionId: string;
  brokerOrderId: string;
  executedAt: string;
  price: number;
  quantity: number;
  side: OrderSide;
  symbol: string;
}

export interface BrokerAdapter {
  accounts(): Promise<BrokerAccount[]>;
  cancelOrder(accountId: string, orderId: string): Promise<BrokerOrder>;
  candles(instrumentId: string, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  executions(accountId: string): Promise<BrokerExecution[]>;
  openOrders(accountId: string): Promise<BrokerOrder[]>;
  order(accountId: string, orderId: string): Promise<BrokerOrder | null>;
  placeBracketOrder(input: BracketOrderRequest): Promise<BrokerOrder[]>;
  placeOrder(input: OrderRequest): Promise<BrokerOrder>;
  positions(accountId: string): Promise<BrokerPosition[]>;
  previewOrder(input: OrderRequest | BracketOrderRequest): Promise<unknown>;
  searchInstruments(query: string): Promise<BrokerInstrument[]>;
}

export type ScheduleKind = "interval" | "weekly";
export type ScheduleStatus = "active" | "paused" | "cancelled";
export type AmountType = "quantity" | "usd";

export interface RecurringSchedule {
  accountId: string;
  amount: number;
  amountType: AmountType;
  brokerId: BrokerId;
  id: string;
  instrument: BrokerInstrument;
  intervalCount?: number;
  intervalUnit?: "minute" | "hour" | "day";
  nextRunAt: string;
  scheduleKind: ScheduleKind;
  side: OrderSide;
  status: ScheduleStatus;
  stopLoss?: number;
  takeProfit?: number;
  timezone: string;
  weeklyDays?: number[];
  weeklyTime?: string;
}

export interface ScheduleRun {
  errorMessage?: string;
  id: string;
  idempotencyKey: string;
  orderId?: string;
  ranAt: string;
  scheduleId: string;
  status: "started" | "submitted" | "skipped" | "failed";
}

export interface StrategyConfig {
  accountId: string;
  amount: number;
  amountType: AmountType;
  brokerId: BrokerId;
  fastPeriod: number;
  id: string;
  instrument: BrokerInstrument;
  lastEvaluatedCandle?: string;
  slowPeriod: number;
  status: "active" | "paused";
  stopLossPercent: number;
  takeProfitPercent: number;
  timeframe: Timeframe;
  type: "ema_cross";
}

export interface BrokerExecutionLog {
  broker: BrokerId;
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
