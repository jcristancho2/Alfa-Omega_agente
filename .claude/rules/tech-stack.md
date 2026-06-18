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
- Notification worker: `apps/notification-worker`, Bun.
- Broker gateway: `apps/broker-gateway`, currently a boundary for future live integrations.
- Shared package: `packages/shared`.
- Supabase: migrations and Edge Functions are present as the future hosted boundary.

## Current MVP Mode

The repo runs IBKR paper trading with real order execution via TWS on port 4002.

## Development Commands

- `bun install`
- `bun run dev:api`
- `bun run dev:notification`
- `bun run dev:dashboard`
- `bun run typecheck`
- `bun run lint`
- `bun run build`

## Guardrails

- Do not add unrelated desktop, auth, sync, routing, or component-library conventions unless this repo adopts them explicitly.
- Keep shared contracts in `packages/shared`; avoid duplicating TypeScript-only business rules in dashboard code.
- No Python in this repo. All services are TypeScript/Bun.
