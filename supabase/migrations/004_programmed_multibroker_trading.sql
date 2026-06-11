CREATE TABLE IF NOT EXISTS broker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  broker_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  account_mode TEXT NOT NULL DEFAULT 'paper' CHECK (account_mode = 'paper'),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broker, broker_account_id)
);

CREATE TABLE IF NOT EXISTS broker_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange TEXT NOT NULL,
  min_tick NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broker, instrument_id)
);

ALTER TABLE trade_orders
  ALTER COLUMN broker DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS broker_account_id TEXT,
  ADD COLUMN IF NOT EXISTS instrument_id TEXT,
  ADD COLUMN IF NOT EXISTS recurring_schedule_id UUID,
  ADD COLUMN IF NOT EXISTS strategy_config_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS filled_quantity NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS normalized_status TEXT NOT NULL DEFAULT 'created';

CREATE UNIQUE INDEX IF NOT EXISTS trade_orders_idempotency_key_idx
  ON trade_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES trade_orders(id) ON DELETE CASCADE,
  broker_order_id TEXT,
  leg_type TEXT NOT NULL CHECK (leg_type IN ('entry', 'stop_loss', 'take_profit')),
  price NUMERIC,
  quantity NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  broker_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES trade_orders(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  broker_order_id TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  broker_account_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  amount_type TEXT NOT NULL CHECK (amount_type IN ('quantity', 'usd')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('interval', 'weekly')),
  interval_count INTEGER,
  interval_unit TEXT,
  weekly_days INTEGER[],
  weekly_time TIME,
  timezone TEXT NOT NULL DEFAULT 'America/Bogota',
  stop_loss NUMERIC,
  take_profit NUMERIC,
  next_run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES trade_orders(id),
  status TEXT NOT NULL,
  error_message TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  broker_account_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy_type TEXT NOT NULL DEFAULT 'ema_cross',
  timeframe TEXT NOT NULL,
  fast_period INTEGER NOT NULL,
  slow_period INTEGER NOT NULL,
  amount_type TEXT NOT NULL CHECK (amount_type IN ('quantity', 'usd')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  stop_loss_percent NUMERIC NOT NULL,
  take_profit_percent NUMERIC NOT NULL,
  last_evaluated_candle TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategy_configs(id) ON DELETE CASCADE,
  candle_timestamp TIMESTAMPTZ NOT NULL,
  signal TEXT,
  order_id UUID REFERENCES trade_orders(id),
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (strategy_id, candle_timestamp)
);

ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators manage recurring schedules" ON recurring_schedules
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator');

CREATE POLICY "operators manage strategy configs" ON strategy_configs
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator');

ALTER PUBLICATION supabase_realtime ADD TABLE trade_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_status_events;
ALTER PUBLICATION supabase_realtime ADD TABLE recurring_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE strategy_configs;
