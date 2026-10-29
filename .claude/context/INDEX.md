---
status: VERIFIED
last_verified: 2026-10-29
---
# Knowledge index

Read **one row**, then only the files it names. Rules in `.claude/rules/` load automatically when you
open matching files. A task that needs none of these (typo, styling, generic JS) needs no reading.

| Task mentions… | Read | Auto-loaded rule | Key sources | ADRs |
|---|---|---|---|---|
| fetch, API, GridBase, sheet, worksheet, spreadsheet, CORS, retry | `domains/data-access.md` | data-access | `config.js` | 001, 002 |
| a page, table, chart, filter, layout, new page | `domains/pages.md` | pages | `*.html` | — |
| khata, balance, profit, commission, discount, delivery, customer, meter, payment, UPI | `product.md` | pages | page that computes it | — |
| bug triage, "is X a known problem" | `known-issues.md` | — | — | — |
| why was X decided | `decisions/README.md` | — | — | all |
