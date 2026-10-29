---
status: VERIFIED
last_verified: 2026-10-29
sources:
  - config.js
  - balance.html
  - day-dashboard.html
  - meter_readings.html
  - pastDeliveryReports.html
  - profits.html
  - profitsPerCustomer.html
---
# Data access: GridBase client and data sources

## Purpose
How pages read Google Sheets. The engine is the GridBase Apps Script web app. Its source and wire
contract live in the GridBase repo (C:\Projects\GridBase: appscript/ and
.claude/context/domains/wire-contract.md). Paths in that repo are written without backticks so
the lint here does not check them.

## Client (`config.js`)
- `API_URL`: the deployed engine. `MAIN_SHEET_ID`: the main business spreadsheet.
- `callSheetsApi(operations)` sends `{ operations }` in one POST and resolves to one
  `{ operationId, rowCount, rows }` per operation. It throws when the reply has `success: false`.
- `fetchWithRetry`: 3 retries, exponential back-off from 1 s. It exists because engine failures
  (timeouts, quota, concurrency) come back as HTML without CORS headers.
- Every page uses `type: "SELECT"` only. There are no writes from this repo.

## Data sources
| Spreadsheet | Worksheet | Read by |
|---|---|---|
| main (`MAIN_SHEET_ID`) | `deliveries` | `balance.html` |
| main | `db2.deliveries` | `pastDeliveryReports.html`, `profitsPerCustomer.html` |
| main | `cumilativeCalculations` | `profits.html`, `profitsPerCustomer.html`, `day-dashboard.html` |
| 2023 archive (ID in `pastDeliveryReports.html`) | `deliveries.2023` | `pastDeliveryReports.html` |
| meter sheet (ID in `meter_readings.html`) | `apiData` | `meter_readings.html` |

`deliveries` vs `db2.deliveries`: [?] which one is current, and is the other one legacy?

## Operation `id`
Each operation carries an `id`, returned as `operationId`. Pages use fixed strings
(e.g. `mbros-github-site`, or a UUID-like id shared by several pages). [?] whether the engine
uses `id` for anything beyond echoing it back (check the GridBase wire contract before relying
on it).

## Decisions
- ADR-001 all sheet access through the GridBase engine
- ADR-002 text/plain POST to avoid the CORS preflight
