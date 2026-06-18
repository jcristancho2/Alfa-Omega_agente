# Query — answering from the wiki instead of re-deriving

Triggers: "how does X work", "why did we choose Y", "what do we know about Z", or any question where the project's own history/decisions are relevant — including implicitly, e.g. starting a coding task that touches an area the wiki already documents.

## Steps

1. Check `wiki/wiki/index.md` for relevant pages (by tag, by name, or just by reading titles). If the wiki is large, grep/search rather than reading every page.
2. Read the matching page(s) in full, plus anything they link to via `[[...]]` that's directly relevant.
3. Answer **strictly from the wiki content**, citing the page(s) by name (e.g. "per `integrations/ibkr-gateway.md`, ..."). Don't blend in unrelated general knowledge about the topic as if it were project-specific fact — if the wiki doesn't cover something, say so plainly rather than guessing and presenting the guess as documented.
4. If the answer reveals a gap, contradiction, or outdated info in the wiki, **say so and offer to fix it** (see `update.md`) rather than silently working around it.
5. If the question doesn't have a page yet but the answer has standalone future value (a genuinely novel synthesis, not just a one-off fact), offer to save it as a new page — don't do this automatically for trivial questions.

## What NOT to do

- Don't re-derive an answer from first principles (e.g. re-reading the whole codebase, or general knowledge about IBKR's API) when the wiki already has a documented, possibly more accurate-to-this-project answer.
- Don't present a low-confidence/tentative page's content as settled fact — carry the confidence level into your answer (e.g. "this hasn't been verified yet, but per the wiki the assumption is...").
