DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bot_status',
    'signals',
    'trades',
    'market_prices',
    'notifications',
    'system_logs',
    'trading_signals',
    'trade_orders',
    'risk_events',
    'broker_execution_logs',
    'trading_runtime_state',
    'broker_accounts',
    'broker_instruments',
    'order_legs',
    'order_status_events',
    'schedule_runs',
    'strategy_runs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY "operators read %1$s" ON public.%1$I FOR SELECT TO authenticated USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') IN (''operator'', ''live_trader''))',
      table_name
    );
  END LOOP;
END
$$;
