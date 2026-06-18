# Lint — auditing the wiki for health

Triggers: user explicitly asks ("audit the wiki", "clean up the wiki"), or it's been a long stretch of ingests without a cleanup pass.

## Checks to run

- **Orphan pages** — pages no other page links to and that aren't in `index.md`. Either link them from somewhere relevant or flag them for the user to confirm they're still wanted.
- **Stale `overview.md`** — does it still match what `entities/` and `integrations/` actually describe? If the project has clearly grown past what the overview says, flag it for a rewrite.
- **Contradictions across pages** — two pages making incompatible claims about the same thing (e.g. one page says orders are validated client-side, another implies server-side only). Surface these explicitly; don't silently pick one.
- **Stale low-confidence pages** — `confidence: low` pages that are old and were never revisited. Ask the user if they're still relevant or should be confirmed/removed.
- **Missing index entries** — pages on disk that aren't listed in `wiki/wiki/index.md`.
- **Broken wikilinks** — `[[Page-Name]]` references pointing to pages that don't exist (renamed or deleted without updating links).

## Output

Don't silently fix everything. Produce a short report:

```
## Wiki lint report — YYYY-MM-DD
- 2 orphan pages: [[some-page]], [[another-page]] — not linked from anywhere
- 1 contradiction: [[order-validation]] vs [[api-error-handling]] disagree on where validation happens
- 3 stale low-confidence pages older than 30 days, never revisited
- 1 broken link: [[old-name]] referenced in [[concept-x]] no longer exists
```

Fix what's unambiguous (broken links to obviously-renamed pages, missing index entries) automatically. Ask before fixing anything that requires a judgment call (contradictions, whether a tentative claim is still believed).
