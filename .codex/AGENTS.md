# Codex Memory - ALFA-OMEGA

This file is the compact working memory for Codex in this repository.

## Project

- Repository: `alfa-omega`.
- MVP flow: `TradingView/manual signal -> score/risk evaluation -> simulated trade -> mock Kapso notification -> dashboard`.
- Current storage: local JSON database at `data/local-db.json` via `LOCAL_DB_PATH`.
- Future boundary: Supabase migrations and Edge Functions will replace or back the local persistence path.

## Stack

- Root workspace: Bun workspaces under `apps/*` and `packages/*`.
- API: `apps/api`, Bun + Hono.
- Dashboard: `apps/dashboard`, Next.js + React + Tailwind CSS v4.
- Trading engine: `apps/trading-engine`, Python.
- Notification worker: `apps/notification-worker`, Bun.
- Broker boundary: `apps/broker-gateway`, reserved for production broker integrations.
- Shared contracts: `packages/shared`.
- Supabase: `supabase/migrations` and `supabase/functions`.

## Daily Rules

1. Start with `README.md`, root `package.json`, and the package or app being touched.
2. Preserve financial safety before feature velocity: risk limits, idempotency, PnL math, TP/SL handling, and live-mode gates are high-risk.
3. Keep TypeScript and Python models aligned. If local DB shape changes, check `packages/shared/src/local-db.ts`, `apps/trading-engine/main.py`, `data/local-db.json`, and `supabase/migrations`.
4. Do not introduce live trading behavior without explicit user approval and strong safeguards.
5. Prefer small, testable domain helpers around scoring, risk, trade lifecycle, notifications, and storage.
6. Treat dashboard changes as operator tooling: clarity, state visibility, and safe controls matter more than decorative UI.

## Useful Commands

- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `bun run dev:api`
- `bun run dev:engine`
- `bun run dev:notification`
- `bun run dev:dashboard`
- `python3 apps/trading-engine/main.py`

## Local Skills

- Use `alfa-omega-architecture-reviewer` for broad architecture audits.
- Use `alfa-omega-code-review` for PR or diff review.
- Use `typescript-magician` only for TypeScript type-system work.
