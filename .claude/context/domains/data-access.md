---
status: VERIFIED
last_verified: 2026-10-30
sources:
  - assets/js/config.js
  - app/balance/index.html
  - app/statement/index.html
  - app/daily/index.html
  - app/meters/index.html
  - app/deliveries/deliveries.js
  - app/profits/profits.js
  - app/customer-profit/index.html
  - app/customer-performance/index.html
---
# Data access: GridBase client and data sources

## Purpose
How pages read Google Sheets. The engine is the GridBase Apps Script web app. Its source and wire
contract live in the GridBase repo (C:\Projects\GridBase: appscript/ and
.claude/context/domains/wire-contract.md). Paths in that repo are written without backticks so
the lint here does not check them.

## Client (`assets/js/config.js`)
- `API_URL`: the deployed engine. `MAIN_SHEET_ID`: the main business spreadsheet.
- `callSheetsApi(operations)` sends `{ operations }` in one POST and resolves to one
  `{ operationId, rowCount, rows }` per operation. It throws when the reply has `success: false`.
- `fetchWithRetry`: 3 retries, exponential back-off from 1 s. It exists because engine failures
  (timeouts, quota, concurrency) come back as HTML without CORS headers.
- Every page uses `type: "SELECT"` only. There are no writes from this repo.

## Data sources
| Spreadsheet | Worksheet | Read by |
|---|---|---|
| main (`MAIN_SHEET_ID`) | `deliveries` | `app/balance/` |
| main | `db2.deliveries` | `app/deliveries/`, `app/customer-profit/`, `app/customer-performance/`, `app/statement/` |
| main | `cumilativeCalculations` | `app/profits/`, `app/customer-profit/`, `app/daily/` |
| 2023 archive (ID in `app/deliveries/deliveries.js`) | `deliveries.2023` | `app/deliveries/`, `app/customer-performance/`, `app/statement/` |
| meter sheet (ID in `app/meters/`) | `apiData` | `app/meters/` |

`deliveries` no longer exists: on 2026-10-29 the engine answered "Worksheet not found: deliveries",
so `app/balance/` fails (see `known-issues.md`). `db2.deliveries` is the live worksheet.
The meter sheet now has a `name` column; the page used to read the unnamed `""` column.

## Operation `id`
Each operation carries an `id`, returned as `operationId`. Pages use fixed strings
(e.g. `mbros-github-site`, or a UUID-like id shared by several pages). [?] whether the engine
uses `id` for anything beyond echoing it back (check the GridBase wire contract before relying
on it).

## Decisions
- ADR-001 all sheet access through the GridBase engine
- ADR-002 text/plain POST to avoid the CORS preflight
