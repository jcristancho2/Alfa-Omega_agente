---
name: alfa-omega-architecture-reviewer
description: Deep architecture audit for the ALFA-OMEGA trading automation MVP. Use for repository-wide reviews of Bun/Hono services, Python trading engine, Next.js dashboard, local JSON persistence, Supabase boundaries, risk controls, and production readiness.
---

# ALFA-OMEGA Architecture Reviewer

Use this skill when asked for a broad architecture audit, production-readiness review, risk review, or system design critique of this repo.

## Project Context

- MVP flow: `signal -> score/risk evaluation -> simulated trade -> mock notification -> dashboard`.
- Runtime apps:
  - `apps/api`: Bun + Hono API for status, signals, trades, risk controls, market prices, logs, and Kapso command simulation.
  - `apps/trading-engine`: Python worker for signal evaluation and simulated trade lifecycle.
  - `apps/notification-worker`: Bun worker for pending notifications.
  - `apps/broker-gateway`: future broker integration boundary.
  - `apps/dashboard`: Next.js operator dashboard.
  - `packages/shared`: TypeScript contracts and local JSON DB access.
  - `supabase`: future hosted DB and Edge Function boundary.
- Current persistence is local JSON. Supabase is planned, not yet the source of truth.

## Evidence First

Before concluding, inspect:

- `README.md`
- root `package.json`
- `apps/*/package.json`
- `packages/shared/src`
- `apps/api/src`
- `apps/trading-engine/main.py`
- `apps/notification-worker/src`
- `apps/dashboard/src`
- `supabase/migrations`
- `supabase/functions`

Useful scans:

```bash
rg -n "TRADING_MODE|risk|risk_locked|capital|daily_pnl|position_size|pnl|stop_loss|take_profit|LOCAL_DB_PATH|writeDb|readDb|write_db|read_db|KAPSO|secret|service_role|RLS|policy"
rg -n "fetch\\(|POST|GET|pause|resume|unlock|close|webhook" apps packages supabase
```

## Audit Priorities

1. Financial safety: position sizing, daily risk, max open trades, PnL math, TP/SL, manual closes, lock/unlock behavior, live-mode gates.
2. Contract drift: TypeScript local DB types, Python data shape, seed JSON, and Supabase schema must stay aligned.
3. Persistence safety: file-backed race conditions, idempotency, retries, and migration path to repository interfaces.
4. API and worker boundaries: validation, error handling, retries, shutdown behavior, and duplicated business logic.
5. Dashboard operator safety: clear status, risk visibility, safe controls, and reduced ambiguity.
6. Supabase readiness: RLS, service-role isolation, webhook secret validation, audit logs, and constraints.

## Output Shape

Lead with findings. Group by severity: Critical, High, Medium, Low.

For each finding include:

- Title
- Evidence with file path and line reference when possible
- Impact
- Recommended remediation

Then include:

- System map
- Boundary and coupling review
- Financial/risk integrity review
- Highest-value tests
- Phased roadmap
- Open questions only when they affect architecture or production readiness
