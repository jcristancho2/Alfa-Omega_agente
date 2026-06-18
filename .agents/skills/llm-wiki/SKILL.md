---
name: llm-wiki
description: Maintain a persistent, self-updating project knowledge base (a "wiki") in markdown so Claude never has to re-derive the same architecture, integration, or business-logic context from scratch every session. Use this skill whenever the user wants to remember an architecture or design decision, document how an integration or external API works (brokers like IBKR, Supabase, Telegram/WhatsApp bots, payment providers, auth providers, etc.), explain "how does X work" or "why did we choose Y", ingest a document/spec/conversation into long-term project memory, ask "what do we know about Z", says "remember this", "document this", "add this to the wiki/knowledge base", or starts a session by asking to be caught up on project context. Also proactively suggest using it at the end of a substantial implementation session, after a non-trivial debugging session, or after a decision was made that future sessions will need to know about.
---

# LLM Wiki

A pattern (originated by Andrej Karpathy) for giving a project a persistent, LLM-maintained knowledge base instead of re-explaining the same context every session. You read the wiki; the LLM (you) writes it.

## Why this exists

Without this, every new Claude Code session re-derives context from scratch: re-reading the codebase, re-asking "why is it built this way", re-discovering the same IBKR quirk or Supabase RLS gotcha that already got solved three sessions ago. That's wasted tokens and wasted time, and worse, the same mistake can get re-made.

With this, knowledge compounds. A source (a conversation, a doc, a bugfix, a decision) gets ingested once, turned into one or more wiki pages, cross-linked to related pages, and then every future session reads the wiki first instead of re-deriving.

**You never hand-edit the wiki.** The user curates raw sources and asks questions; you are the one who writes and maintains the wiki pages.

## Directory layout

```
wiki/
├── AGENTS.md              # Domain schema — read this FIRST, every time
├── raw/                    # Immutable sources you've ingested (transcripts, notes, specs)
│   └── 2026-06-18-some-source.md
└── wiki/
    ├── index.md            # Catalog of every page, organized by category
    ├── overview.md         # One-page "what is this project" — keep this current
    ├── log.md              # Append-only changelog of wiki edits
    ├── entities/           # Concrete things: services, tables, bots, endpoints
    ├── concepts/           # Ideas/processes that span multiple entities
    ├── decisions/          # ADR-style: what we chose and why, what we rejected
    ├── integrations/       # Third-party APIs/services: how to talk to them, gotchas
    ├── incidents/           # Postmortems: what broke, why, how it was fixed
    └── questions/          # Open questions / unresolved unknowns, tracked explicitly
```

If `wiki/` doesn't exist yet in the project, run **init** (see `references/init.md`) before doing anything else.

## Core loop

1. **Always start by reading `wiki/AGENTS.md`** (the schema) and `wiki/wiki/overview.md` if they exist. This costs almost nothing and prevents you from re-deriving things that are already documented or contradicting an established decision.
2. Figure out which operation applies:

| User intent | Operation | Reference |
|---|---|---|
| "Remember/document this", drops in a doc, conversation, or spec | **Ingest** | `references/ingest.md` |
| "How does X work", "why did we choose Y", "what do we know about Z" | **Query** | `references/query.md` |
| New info that extends or contradicts an existing page | **Update** | `references/update.md` |
| "Audit the wiki", or it's been a while since a cleanup | **Lint** | `references/lint.md` |
| No `wiki/` directory exists yet | **Init** | `references/init.md` |

3. Do the operation, following the relevant reference file.
4. Update `wiki/wiki/index.md` and append a one-line entry to `wiki/wiki/log.md` for anything you wrote.
5. Tell the user concisely what you wrote/changed and where — don't dump the full page content into chat, just summarize and point to the file path.

## Writing pages

Use the templates in `templates/` as starting structure — `entity.md`, `concept.md`, `decision.md`, `integration.md`, `incident.md`. Every page gets YAML frontmatter:

```yaml
---
type: entity | concept | decision | integration | incident
status: confirmed | tentative | superseded | open-question
confidence: high | medium | low
tags: [trading-bot, ibkr, backend]
related: ["[[Other-Page]]", "[[Another-Page]]"]
updated: 2026-06-18
---
```

- **confidence: low** means "this is what was said/assumed, not yet verified against running code or the broker." Don't silently upgrade confidence — only the user (or running, observed behavior) can confirm something.
- Cross-link liberally using `[[Page-Name]]` wikilink syntax. A wiki with no links between pages is just a pile of files.
- Keep each page focused on one thing. If a page is trying to explain both "what Supabase tables exist" and "why we chose Supabase over Postgres directly," split it into an entity page and a decision page, and link them.

## Principles

- **Specificity over generality.** "IBKR's `reqMktData` silently returns stale prices outside RTH unless you pass `snapshot=False`" is a useful wiki entry. "IBKR has some quirks with market data" is not — don't write that.
- **Don't overwrite history.** When a decision changes, mark the old page `status: superseded`, link to what replaced it, and explain why it changed. Future-you (or future Claude) benefits from knowing what was tried and rejected, not just what's current.
- **Open questions are first-class.** If something is unknown or unverified (e.g. "does IBKR's paper account enforce the same rate limits as live?"), write a page in `questions/` rather than guessing and writing it as fact.
- **The wiki is for project knowledge, not code.** Don't duplicate what's already legible by reading the code (e.g. don't write a page that's just "here's what `place_order()` does" if the function is short and self-explanatory). Write pages for things that aren't obvious from the code alone: why a choice was made, how an external system behaves, what was tried and failed, what the deployment/runtime topology actually is.

## Domain note for this project (trading bot example)

If this wiki belongs to an algorithmic-trading project (IBKR + a Python execution engine + a Next.js/TypeScript app + Supabase + WhatsApp/Telegram notifications, or similar), pay particular attention to documenting as `integrations/` and `decisions/`:
- Broker connection lifecycle (paper vs. live account switch, gateway/TWS auth, reconnect behavior)
- Order execution path: where an order is created (manual UI action vs. scheduled job), how it's persisted before/after being sent, how broker confirmations are reconciled back
- The background/scheduled execution mechanism (what runs orders when the app isn't open — cron, worker process, Supabase Edge Function, etc.) and what happens on failure
- Notification pipeline: what triggers a WhatsApp/Telegram message, what data it includes, and what happens if the notification fails (does the trade still execute?)
- Anything involving credentials/API keys/account numbers — document *that they exist and where they're configured*, never document the actual secret values in the wiki.

This is just domain framing — the same five page types (entity/concept/decision/integration/incident) apply to any project, not only trading bots.
