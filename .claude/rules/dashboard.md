---
paths:
  - 'apps/dashboard/**'
---

# Dashboard

## Role

The dashboard is an operator console for a trading automation MVP. It should make bot state, risk state, recent signals, open/closed trades, notifications, and logs clear at a glance.

## UX Priorities

- Show stale or offline API states clearly.
- Make risk locks, paused state, live/simulated mode, and open-trade exposure visible.
- Keep destructive or risky controls explicit: pause, resume, unlock risk, close trade.
- Prefer compact, scannable layouts over marketing-style hero sections.
- Tables should favor alignment, clear status labels, and responsive overflow.

## Implementation

- Use Next.js App Router conventions already present in `apps/dashboard/src/app`.
- Use Tailwind CSS v4 already configured in the app.
- Do not introduce a new component library or routing system without a concrete need.
- Keep trading calculations out of React components; consume API values.
