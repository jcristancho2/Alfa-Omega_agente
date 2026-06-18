# Ingest — turning a new source into wiki pages

Triggers: the user pastes/uploads a doc, describes how something works, says "remember this", "document this decision", or a substantial implementation/debugging session just wrapped up and contains knowledge worth keeping.

## Steps

1. **Save the raw source** to `wiki/raw/YYYY-MM-DD-<short-slug>.md`, unmodified (or a faithful markdown transcription if the source wasn't already markdown). This is the immutable record — even if your synthesis later turns out wrong, the raw source survives.

2. **Read `wiki/AGENTS.md`** to recall the project's tagging taxonomy and conventions, and skim `wiki/wiki/index.md` to see what already exists (avoid creating a duplicate page for something that already has one — update it instead, see `update.md`).

3. **Decide what page(s) this source produces.** One source can produce multiple pages. Ask for each distinct piece of knowledge: is this a *thing* (entity), an *idea/process* (concept), a *choice made* (decision), a *how a third-party system behaves* (integration), or a *what broke* (incident)?
   - Don't force one page per source — a short Slack-message-like source might only warrant a one-line addition to an existing page's changelog, not a new page.
   - Don't over-fragment either — five tightly related facts about the same broker integration belong on one `integrations/` page, not five.

4. **Write the page(s)** using the matching template from `templates/`. Specifically:
   - Pull concrete details (exact error messages, exact config keys, exact parameter names) rather than paraphrasing them away — specificity is what makes the wiki useful later.
   - Set `confidence` honestly. Something the user just asserted in chat is `medium` at best until it's been observed working. Something you watched actually execute successfully is `high`.
   - Cross-link to any related existing pages with `[[Page-Name]]`.

5. **Update `wiki/wiki/index.md`** to list the new/changed pages.

6. **Append to `wiki/wiki/log.md`**: `YYYY-MM-DD — ingested <source> → created/updated [[Page-1]], [[Page-2]]`.

7. **Report back concisely** — which pages were created/updated and a one-line summary of each, not the full page text.

## Example

**Input:** user explains "the scheduler runs as a Supabase Edge Function on a cron trigger every minute, checks the `scheduled_orders` table for anything due, and calls the Python execution service over HTTP with a shared secret header."

**Output:**
- `wiki/wiki/integrations/supabase-edge-scheduler.md` (integration page: how the cron trigger is configured, what it polls, the HTTP contract to the execution service, the auth mechanism)
- `wiki/wiki/concepts/order-lifecycle.md` updated to add a step referencing `[[supabase-edge-scheduler]]` as the trigger for scheduled (vs. manual) orders
- index.md and log.md updated accordingly
