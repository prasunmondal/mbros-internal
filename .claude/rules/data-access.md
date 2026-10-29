---
paths:
  - "assets/js/config.js"
---
# Data access (`assets/js/config.js`): invariants

- `assets/js/config.js` is the only GridBase client. Every page that reads data depends on it, so a change
  here affects all of them.
- Keep the POST body a JSON string with no Content-Type header (no CORS preflight, ADR-002).
- `fetchWithRetry` retries because failed Apps Script calls return an HTML page without CORS
  headers, which the browser reports as a CORS error. All current calls are reads (SELECT), so
  retrying is safe. Do not retry writes blindly (GridBase ADR-004).
- `callSheetsApi` throws on `success: false`; callers rely on getting `results` back.
- Request and response shapes are the GridBase wire contract: see the GridBase repo,
  .claude/context/domains/wire-contract.md (there). Do not invent fields here.
- More: `context/domains/data-access.md`.
