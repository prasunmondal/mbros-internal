---
status: VERIFIED
last_verified: 2026-10-30
sources:
  - assets/js/config.js
  - app/statements/index.html
  - app/daily/index.html
  - app/meters/index.html
  - app/deliveries/deliveries.js
  - app/profits/profits.js
  - app/profits/monthly.js
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
- `useTotalBalanceDues(dayRows)` turns `cumilativeCalculations` due columns into `totalBalance` dues (rule in `product.md`). It reads both delivery worksheets, so every page reading those columns loads them.
- Column check: `callSheetsApi` passes every SELECT result to `checkColumns`. Columns listed for the worksheet in `EXPECTED_COLUMNS` that the rows lack raise an error notice (`Mb.notice`); any column added or removed since this browser last loaded the worksheet raises an info notice once (baseline in `localStorage` `mb-columns`). It exists because a missing column reads as 0, not as an error. `EXPECTED_COLUMNS` holds only columns pages depend on, not optional notes; `revenue` is left out because `app/profits/monthly.js` matches its headers loosely. The `deliveries.2023` list is `[inferred]` from the pages that read it. Each result is kept in `columnReports` for `app/checks/`, which reads every worksheet below.
- Every page uses `type: "SELECT"` only. There are no writes from this repo.
- `DataCache` keeps each SELECT result in IndexedDB, keyed by the operation without its `id`, so
  all app pages and browser tabs reuse a worksheet already fetched. A page reload (F5) or a fresh
  password unlock clears it; `callSheetsApi` then sends only the operations not in the cache.

## Data sources
| Spreadsheet | Worksheet | Read by |
|---|---|---|
| main | `db2.loads` (notes per side: `senderNote`, `viaNote`, `receiverNote`, and MBros-only `internalNote`) | `app/statements/`, `app/profits/` (Revenue tab, Balances: `EmployeeSalary` rows) |
| staging (ID in `app/statements/`, `app/deliveries/deliveries.js`) | `temp.load`: staged transactions not yet in `db2.loads`, same columns plus `isHidden`. `cal.occasions`: one row per occasion, `occassionName` (sic), `daysPrepend`, `daysAppend`, one date column per year (`y2023`…, IST midnight as UTC timestamp, blank when unknown) | `app/statements/` (`temp.load`), `app/deliveries/` (`cal.occasions`) |
| main | `db2.deliveries` | `app/profits/` (Revenue tab, Balances), `app/deliveries/`, `app/customer-profit/`, `app/customer-performance/`, `app/statements/` (Customer Statement tab), `app/daily/` |
| main | `cumilativeCalculations` | `app/profits/`, `app/customer-profit/`, `app/daily/` |
| main | `revenue`: money snapshots by date. Read: `date`, `cashBalance`, `bankBalance`, `debt` (Direct Debt), `onlineBalance`, `customerDue` (Market Due), `inhouseBalance` (Balance), `networth` (owner, 2026-11-04). Not used yet: `categoryForApp`, `id`, `spends`, `spendsNote`, `realisedProfit` | `app/profits/` (Revenue tab, Balances) |
| 2023 archive (ID in `app/deliveries/deliveries.js`) | `deliveries.2023` | `app/profits/` (Balances), `app/deliveries/`, `app/customer-performance/`, `app/statements/` (Customer Statement tab), `app/daily/`, `app/customer-profit/` (Balance Tracker) |
| meter sheet (ID in `app/meters/`) | `apiData` | `app/meters/` |

`deliveries` no longer exists (engine: "Worksheet not found", 2026-10-29); `db2.deliveries` is the live worksheet.
The Balance page (app/balance) that still read it was removed on 2026-11-28 (owner); balances on a date are
on the Statements Customer tab and the Customer Profile Balance Tracker.
The meter sheet now has a `name` column; the page used to read the unnamed `""` column.

## Operation `id`
Each operation carries an `id`, returned as `operationId`. Pages use fixed strings
(e.g. `mbros-github-site`, or a UUID-like id shared by several pages). [?] whether the engine
uses `id` for anything beyond echoing it back (check the GridBase wire contract before relying
on it).

## Decisions
- ADR-001 all sheet access through the GridBase engine
- ADR-002 text/plain POST to avoid the CORS preflight
