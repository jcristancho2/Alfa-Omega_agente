---
paths:
  - 'apps/api/**'
  - 'apps/trading-engine/**'
  - 'apps/broker-gateway/**'
  - 'packages/shared/**'
  - 'supabase/**'
---

# Trading Safety

## Non-Negotiables

- Default to `TRADING_MODE=simulated`.
- Do not enable live trading paths without explicit user approval.
- Validate all external inputs before mutation: TradingView payloads, Kapso commands, dashboard actions, and broker responses.
- Do not log secrets, broker credentials, webhook secrets, or raw auth headers.

## Risk Logic

Any change touching these behaviors requires focused tests or a clear explanation if tests are not available:

- Minimum signal score.
- Position sizing.
- Max open trades.
- Daily risk limit.
- Risk lock/unlock.
- Stop loss and take profit close behavior.
- Manual close behavior.
- PnL calculation and capital mutation.

## Idempotency

Workers and webhooks can retry. New mutations should be safe if invoked twice or should clearly reject duplicate work.

## Numeric Handling

Prefer explicit conversions and named helpers for price, quantity, percentage, and PnL math. Avoid hiding financial calculations inside route handlers or UI components.
