# Programmed Multi-Broker Trading Runbook

## Architecture

```text
dashboard -> apps/api -> risk-engine -> broker-gateway -> simulated adapter
                                  |                    -> ibkr-executor -> IBKR Paper
                                  -> Supabase

trading-orchestrator -> apps/api for every order
                     -> broker-gateway for candles and reconciliation
                     -> Supabase for schedules, strategies and audit events
```

All orders are paper-only. `apps/api` is the only order entrypoint. The
orchestrator never submits directly to a broker.

## Database And Authentication

Apply `supabase/migrations/004_programmed_multibroker_trading.sql`. Verify that
Realtime includes `trade_orders`, `order_status_events`, `recurring_schedules`,
and `strategy_configs`.

Set the operator role in Supabase Auth user app metadata:

```json
{ "role": "operator" }
```

Set `OPERATOR_AUTH_REQUIRED=true` after the dashboard has an authenticated
operator session. Controlled local development may leave it false. Internal
workers authenticate with `x-operator-key`.

## Services

```bash
bun run dev:api
bun run dev:broker
bun run dev:orchestrator
bun run dev:dashboard
```

`bun run dev` starts the broker gateway automatically and starts the
orchestrator when Supabase service credentials are present.

## Safe Validation

Start with broker `simulated`:

```bash
curl "http://localhost:4100/brokers/simulated/instruments/search?q=AAPL"
curl -X POST http://localhost:4100/brokers/simulated/orders/preview \
  -H "content-type: application/json" \
  -d '{"accountId":"SIM-PAPER","accountMode":"paper","instrumentId":"265598","conid":265598,"symbol":"AAPL","side":"BUY","orderType":"LMT","quantity":1,"limitPrice":100,"stopLoss":95,"takeProfit":110,"tif":"DAY"}'
```

Do not run `apps/trading-orchestrator` without Supabase. Do not enable live
trading in API, gateway, executor, or runtime state.

## Behavior And Checks

- Failed scheduled runs are audited and retry after `ORCHESTRATOR_FAILED_SCHEDULE_RETRY_MS`
  instead of skipping the intended execution window.
- EMA strategies evaluate only once per candle.
- The reconciler checks orders and bracket legs every three seconds.
- When an exit bracket leg fills, the remaining exit leg is cancelled.
- Review `schedule_runs`, `strategy_runs`, `order_status_events`, and
  `broker_execution_logs` during operations.
