CREATE TABLE IF NOT EXISTS trading_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  timeframe TEXT,
  confidence NUMERIC,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES trading_signals(id),
  broker TEXT DEFAULT 'IBKR',
  account_mode TEXT CHECK (account_mode IN ('paper', 'live')),
  symbol TEXT NOT NULL,
  conid BIGINT,
  side TEXT CHECK (side IN ('BUY', 'SELL')),
  order_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  limit_price NUMERIC,
  tif TEXT DEFAULT 'DAY',
  status TEXT DEFAULT 'created',
  client_order_id TEXT,
  broker_order_id TEXT,
  broker_reply_id TEXT,
  broker_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES trade_orders(id),
  signal_id UUID REFERENCES trading_signals(id),
  rule_name TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broker_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES trade_orders(id),
  broker TEXT DEFAULT 'IBKR',
  endpoint TEXT,
  request_payload JSONB,
  response_payload JSONB,
  status_code INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_runtime_state (
  id TEXT PRIMARY KEY,
  kill_switch BOOLEAN DEFAULT TRUE,
  trading_mode TEXT DEFAULT 'paper',
  allow_live_trading BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO trading_runtime_state (id, kill_switch, trading_mode, allow_live_trading)
VALUES ('global', TRUE, 'paper', FALSE)
ON CONFLICT (id) DO NOTHING;
