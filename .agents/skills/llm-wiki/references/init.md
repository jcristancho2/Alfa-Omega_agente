# Init — setting up a wiki for the first time

Run this when a project has no `wiki/` directory yet, or the user asks to "set up the llm-wiki" / "set up a knowledge base for this project."

## Steps

1. **Ask only what you can't infer.** Look at the repo first (README, package.json, existing folder names, any conversation history about the project) to infer:
   - What kind of project this is (web app, trading bot, API, library...)
   - What the major components/services are
   - What external integrations exist
   If you genuinely can't infer the basics, ask one short question rather than guessing — but prefer inferring over asking.

2. **Create the directory structure:**
   ```
   wiki/
   ├── AGENTS.md
   ├── raw/
   └── wiki/
       ├── index.md
       ├── overview.md
       ├── log.md
       ├── entities/
       ├── concepts/
       ├── decisions/
       ├── integrations/
       ├── incidents/
       └── questions/
   ```

3. **Write `AGENTS.md`** — the schema file. This is the most important file you'll write during init; it's what every future session reads first. Cover:
   - One paragraph: what this project is and what the wiki is for.
   - The five page types and when to use each (copy from `SKILL.md` if helpful, but tailor the trigger examples to this specific project's domain).
   - A tagging taxonomy specific to this project (e.g. for a trading bot: `backend`, `frontend`, `ibkr`, `supabase`, `notifications`, `scheduling`, `security`).
   - Confidence-level conventions (reuse `high/medium/low` from SKILL.md unless the user wants something different).
   - One line: "Claude maintains this wiki; humans curate raw/ and ask questions, they don't hand-edit wiki/ pages directly" (or whatever variant the user actually wants — some people do want to hand-edit, that's fine, just note it).

4. **Write `wiki/overview.md`** — even a thin one. One paragraph of what the project does, one short list of major components, one short list of external integrations. Mark anything not yet confirmed as `confidence: low`. This file should always be readable in under a minute and should be kept current as the project's shape becomes clearer — treat stale entries here as a lint target.

5. **Seed a few starter pages** if you already have enough information from the conversation (e.g. the user just described their architecture to you) — don't leave the wiki empty if you already have real content to put in it. Mark anything inferred-but-unconfirmed as `status: tentative` / `confidence: low` rather than asserting it as fact.

6. **Write `wiki/index.md`** listing every page created so far, grouped by type.

7. **Initialize `wiki/log.md`** with a single entry: `YYYY-MM-DD — wiki initialized`.

8. Tell the user where the wiki lives and give 1-2 concrete examples of what to say next (e.g. "Document how the Telegram notifier works" or "What do we know about the IBKR paper account?").
