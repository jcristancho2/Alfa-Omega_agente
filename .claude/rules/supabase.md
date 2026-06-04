---
paths:
  - 'supabase/**'
  - 'apps/api/**'
  - 'packages/shared/**'
---

# Supabase Boundary

## Current State

Supabase is present as the future hosted boundary. The local MVP still uses JSON persistence.

## Migration Discipline

- Keep SQL schema, shared TypeScript types, Python data access, and API contracts aligned.
- Add constraints and indexes with the trading lifecycle in mind.
- Plan RLS before multi-user or hosted production use.
- Use service-role access only from trusted server-side contexts.

## Edge Functions

- Verify webhook secrets.
- Reject malformed payloads before writing.
- Return deterministic response codes for accepted, rejected, and duplicate signals.
- Avoid logging raw payloads if they may contain secrets or account identifiers.
