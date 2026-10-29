---
paths:
  - ".claude/**"
  - "CLAUDE.md"
---
# Editing the knowledge base

- **Record intent, constraints, reasons and pointers to code.** Never copy code, column lists or
  sheet IDs that the code already shows.
- Context files keep their frontmatter: `status` (VERIFIED | NEEDS_REVIEW | STALE | HISTORICAL),
  `last_verified`, `sources`. Set `last_verified` only after actually checking the content
  against the code.
- One home per fact. Edit in place; never append a second version of a fact.
- Claim tags: untagged = checked against code or stated by the owner. `[inferred]` = read from
  code, intent unconfirmed. `[?]` = open question, only under "Open questions". Business rules
  the owner states in a session are recorded untagged with "(owner, YYYY-MM-DD)".
- Never persist session assumptions, debugging output, task logs or secrets.
- If a file contradicts the code, fix the file or mark it `STALE`. Never leave it silently wrong.
- Budgets: CLAUDE.md ≤ 90 lines, each rule ≤ 35 lines, each context file ≤ 150 lines.
- Every rule needs a `paths:` list. Without one it loads in every session.
- ADRs are never rewritten. Supersede them with a new ADR and update `decisions/README.md`.
- GridBase wire-contract facts belong in the GridBase repo. Link to them, do not copy them.
- Run `node scripts/knowledge/lint-context.js` after editing.
