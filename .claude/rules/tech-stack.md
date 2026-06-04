---
paths:
  - 'package.json'
  - 'bun.lock'
  - 'apps/**'
  - 'packages/**'
  - 'supabase/**'
---

# Tech Stack - ALFA-OMEGA

## Current Runtime

- Root package manager/runtime: Bun workspaces.
- API: `apps/api`, Bun + Hono.
- Dashboard: `apps/dashboard`, Next.js 16, React 19, Tailwind CSS v4.
- Trading engine: `apps/trading-engine`, Python 3.10+.
- Notification worker: `apps/notification-worker`, Bun.
- Broker gateway: `apps/broker-gateway`, currently a boundary for future live integrations.
- Shared package: `packages/shared`.
- Supabase: migrations and Edge Functions are present as the future hosted boundary.

## Current MVP Mode

The repo is configured for local MVP validation:

`signal -> evaluation/score -> simulated trade -> mock notification -> dashboard`

Current persistence is local JSON through `LOCAL_DB_PATH`. Do not assume Supabase is already the production source of truth.

## Development Commands

- `bun install`
- `bun run dev:api`
- `bun run dev:engine`
- `bun run dev:notification`
- `bun run dev:dashboard`
- `bun run typecheck`
- `bun run lint`
- `bun run build`

## Guardrails

- Do not add unrelated desktop, auth, sync, routing, or component-library conventions unless this repo adopts them explicitly.
- Keep shared contracts in `packages/shared`; avoid duplicating TypeScript-only business rules in dashboard code.
- Python and TypeScript data assumptions must be checked together.
