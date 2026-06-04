---
name: alfa-omega-code-review
description: Code review for ALFA-OMEGA PRs, diffs, or changed files. Focuses on trading safety, risk controls, contract drift, Supabase/webhook security, TypeScript/Python correctness, Next.js operator UX, and missing tests.
---

# ALFA-OMEGA Code Review

Use this skill when the user asks for a PR review, diff review, or code review.

## Review Stance

Prioritize bugs, regressions, unsafe trading behavior, missing validation, data-contract drift, and missing tests. Keep style comments secondary unless they hide correctness or maintainability risk.

## Required Checks

- Trading safety:
  - `TRADING_MODE=live` must not become reachable by accident.
  - Risk limits, max open trades, daily PnL, and `risk_locked` transitions must be deterministic.
  - TP/SL and manual close paths must calculate PnL consistently.
  - Signal and trade processing must be idempotent where retries or polling can repeat work.

- Data contracts:
  - Compare changed local DB fields across `packages/shared/src/local-db.ts`, `apps/trading-engine/main.py`, `data/local-db.json`, and `supabase/migrations`.
  - Avoid untyped `Record<string, unknown>` spreading into business logic without narrowing.
  - Validate API and webhook payloads before mutation.

- Persistence:
  - File writes must avoid partial/corrupt writes.
  - Shared local DB access across API, engine, and workers must account for concurrency.
  - New Supabase paths need constraints, indexes, and RLS/service-role intent.

- API and webhooks:
  - Hono routes should return clear errors and not mutate state on malformed input.
  - Supabase Edge Functions must verify secrets and reject invalid payloads.
  - Secrets must never be logged.

- Dashboard:
  - Controls like pause, resume, unlock, and close trades need obvious feedback and safe semantics.
  - Operator views should expose stale/offline API states and risk lock status.

- Tests:
  - Ask for tests around scoring thresholds, position sizing, max daily risk, max open trades, TP/SL closes, manual close, webhook validation, and local DB persistence.

## Output Shape

Lead with findings ordered by severity. Use file and line references when possible.

Then add:

- Open questions or assumptions
- Brief change summary only if useful
- Tests run or not run
