---
status: VERIFIED
last_verified: 2026-10-30
sources:
  - app/customer-profit/index.html
  - pay/index.html
  - assets/js/common.js
---
# Known issues

- `app/customer-profit/`: if the first matching delivery has no `cumilativeCalculations` row
  on the same timestamp and "All customers" is selected, `profitEntry.prev_due_balance` throws.
- The internal app (`app/`) has only a client-side password gate (`assets/js/common.js`) plus
  `noindex`. The hash is public and the engine URL in `assets/js/config.js` answers without a
  password, so anyone who reads the source can still fetch balances and profits. Real protection
  needs a check in the GridBase engine.

## Open questions
- [?] Where is the site hosted (GitHub Pages project path, custom domain)? Paths are relative,
  so both work.
