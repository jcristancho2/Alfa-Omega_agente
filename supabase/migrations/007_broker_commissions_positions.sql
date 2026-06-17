ALTER TABLE trade_orders
  ADD COLUMN IF NOT EXISTS broker_perm_id TEXT;

CREATE INDEX IF NOT EXISTS trade_orders_broker_perm_id_idx
  ON trade_orders (broker, broker_perm_id)
  WHERE broker_perm_id IS NOT NULL;

ALTER TABLE broker_executions
  ADD COLUMN IF NOT EXISTS commission NUMERIC,
  ADD COLUMN IF NOT EXISTS commission_currency TEXT,
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC;

CREATE TABLE IF NOT EXISTS broker_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  broker_account_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  asset_class TEXT,
  currency TEXT,
  exchange TEXT,
  quantity NUMERIC NOT NULL,
  average_cost NUMERIC,
  market_price NUMERIC,
  market_value NUMERIC,
  unrealized_pnl NUMERIC,
  realized_pnl NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broker, broker_account_id, instrument_id)
);

ALTER TABLE broker_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators read broker positions" ON broker_positions
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('operator', 'live_trader'));

ALTER PUBLICATION supabase_realtime ADD TABLE broker_positions;
