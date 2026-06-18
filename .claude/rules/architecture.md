---
paths:
  - 'apps/**'
  - 'packages/**'
  - 'supabase/**'
  - 'data/**'
---

# Architecture - ALFA-OMEGA

## Module Boundaries

- `apps/api`: HTTP surface and orchestration. Keep business decisions thin or extracted.
- `apps/notification-worker`: notification delivery and retry policy.
- `apps/broker-gateway`: integration boundary for broker/live trading, not a place for dashboard or API shortcuts.
- `apps/dashboard`: operator UI. It should consume API contracts and avoid duplicating trading logic.
- `packages/shared`: shared TypeScript rows, helpers, and local DB access.
- `supabase`: hosted DB and Edge Function boundary.

## Data Contract Alignment

When changing signal, trade, notification, risk, or log shape, check all relevant places:

- `packages/shared/src/local-db.ts`
- `data/local-db.json`
- `apps/api/src/index.ts`
- `apps/dashboard/src`
- `supabase/migrations/001_init_alfa_omega.sql`
- `supabase/functions`

## High-Risk Areas

- Position sizing, PnL, TP/SL, daily risk, and max-open-trades logic.
- Any transition from simulated to live trading.
- Polling workers that can process the same record twice.
- File-backed persistence shared by multiple processes.
- Webhooks and secrets.

## Preferred Direction

- Extract testable domain helpers before expanding the API surface.
- Introduce repository interfaces before swapping local JSON for Supabase.
- Keep Supabase constraints/RLS and application types evolving together.
