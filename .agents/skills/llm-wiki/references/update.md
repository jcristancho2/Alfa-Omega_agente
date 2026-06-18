# Update — extending or correcting existing pages

Triggers: new information arrives that touches a page that already exists — it confirms a tentative page, contradicts something documented, or adds detail to something already there.

## Steps

1. Find the existing page(s) via `wiki/wiki/index.md`.
2. Decide which kind of update this is:
   - **Confirmation** — a `tentative`/`low confidence` claim turns out to be true. Bump `confidence` to `high`, note how it was confirmed (e.g. "confirmed by observing live paper-account fill on 2026-06-18").
   - **Extension** — new detail that doesn't conflict with what's there. Add it, update `updated:` date.
   - **Contradiction** — new info conflicts with the existing page. **Don't silently overwrite.** Either:
     a) The old info was simply wrong (e.g. a misunderstanding) — correct it, but leave a one-line note in the page (or in `log.md`) saying what changed and why, so there's a trail.
     b) The old info was right *at the time* but circumstances changed (e.g. a decision was revisited) — mark the old page `status: superseded`, create or update the new page, and link old → new with a one-line explanation of why it changed.
3. For straightforward, low-stakes updates, just make the edit and report it. For anything that changes a documented architectural decision or could surprise the user, show them the diff (before/after) and wait for confirmation before writing — per the project's actual preference if they've stated one in `AGENTS.md`.
4. Update `wiki/wiki/index.md` if the page's status/type changed, and append to `wiki/wiki/log.md`.
