---
status: VERIFIED
last_verified: 2026-10-30
sources:
  - app/balance/index.html
  - app/customer-profit/index.html
  - pay/index.html
  - assets/js/common.js
---
# Known issues

- `app/balance/` is broken: it reads worksheet `deliveries`, and the engine answers
  "Worksheet not found: deliveries" (checked 2026-10-29; the pre-rewrite page did the same).
  Likely fix is `db2.deliveries`, but its balance column may not be `khataBalance`: needs owner.
- `app/balance/`: the "first row wins" check is `!customerBalance[name]`, so a customer whose
  balance is 0 gets overwritten by later rows, even ones after the selected date `[inferred: bug]`.
- `app/customer-profit/`: if the first matching delivery has no `cumilativeCalculations` row
  on the same timestamp and "All customers" is selected, `profitEntry.prev_due_balance` throws.
- The internal app (`app/`) has only a client-side password gate (`assets/js/common.js`) plus
  `noindex`. The hash is public and the engine URL in `assets/js/config.js` answers without a
  password, so anyone who reads the source can still fetch balances and profits. Real protection
  needs a check in the GridBase engine.

## Open questions
- [?] Where is the site hosted (GitHub Pages project path, custom domain)? Paths are relative,
  so both work.
