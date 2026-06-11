ALTER TABLE broker_accounts
  DROP CONSTRAINT IF EXISTS broker_accounts_account_mode_check;

ALTER TABLE broker_accounts
  ADD CONSTRAINT broker_accounts_account_mode_check
  CHECK (account_mode IN ('paper', 'live'));

ALTER TABLE trade_orders
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broker_status TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT;

CREATE INDEX IF NOT EXISTS trade_orders_broker_order_id_idx
  ON trade_orders (broker, broker_order_id);

CREATE INDEX IF NOT EXISTS trade_orders_history_idx
  ON trade_orders (created_at DESC, normalized_status, account_mode);

CREATE UNIQUE INDEX IF NOT EXISTS order_legs_broker_order_id_idx
  ON order_legs (broker_order_id)
  WHERE broker_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS broker_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  broker_execution_id TEXT NOT NULL,
  broker_order_id TEXT,
  order_id UUID REFERENCES trade_orders(id) ON DELETE SET NULL,
  broker_account_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  exchange TEXT,
  executed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broker, broker_execution_id)
);

CREATE TABLE IF NOT EXISTS operator_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  account_mode TEXT CHECK (account_mode IN ('paper', 'live')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE broker_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators read broker executions" ON broker_executions
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('operator', 'live_trader'));

CREATE POLICY "operators read audit events" ON operator_audit_events
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('operator', 'live_trader'));

ALTER PUBLICATION supabase_realtime ADD TABLE broker_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE operator_audit_events;
