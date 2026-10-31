---
status: VERIFIED
last_verified: 2026-10-30
sources:
  - index.html
  - pay/index.html
  - app/index.html
  - app/balance/index.html
  - app/statement/index.html
  - app/deliveries/index.html
  - app/profits/index.html
  - app/daily/index.html
  - app/customer-profit/index.html
  - app/mbros-statement/index.html
  - assets/js/statement-pdf.js
  - app/customer-performance/index.html
  - app/meters/index.html
  - app/calculator/index.html
  - assets/css/site.css
  - assets/js/common.js
  - assets/js/config.js
---
# Pages

## Inventory
| Page | Purpose | Data |
|---|---|---|
| `index.html` | public home: who we are, contact, link to payment | none |
| `pay/` | customer UPI payment (QR + UPI link), Bengali + English | none |
| `app/` | internal overview, cards built from `Mb.TOOLS` | none |
| `app/balance/` | customer khata balances as of a date | `deliveries` |
| `app/statement/` | statement for one or more customers over a date range, combined running balance, per-customer summary, print + PDF share | `deliveries.2023` (only for ranges before 2026), `db2.deliveries` |
| `app/deliveries/` | delivered KG per customer by date group, 2023 + current | `deliveries.2023`, `db2.deliveries` |
| `app/profits/` | business dashboard: KPIs and trend charts | `cumilativeCalculations` |
| `app/daily/` | day summary report for a chosen date (`?date=YYYY-MM-DD`): loading, sales and dues, expenses and profit, trip and staff, notes, customer deliveries | `cumilativeCalculations`, `db2.deliveries`, `deliveries.2023` (days before 2026) |
| `app/mbros-statement/` | MBros's ledger with one or more parties (suppliers, staff, accounts) over a date range: one plain sentence per party saying who pays whom at the end date, running balance, per-party table, print + PDF share (landscape). A checkbox adds staged rows from `temp.load`, marked "staged". A sliding switch picks the tab, "Due per party" first and default: every party with a non-zero balance on the "As on" date, biggest first, one equal-width amount column each for "Locked data" and "Staged data" (locked + staged, blank for a party with no staged rows), coloured green when MBros pays and red when the party pays MBros; total per direction and net for both, covering every party; print and Share PDF follow the active tab. Parties in `HIDDEN_PARTIES` (in the page) are left off entirely | `db2.loads`, `temp.load` |
| `app/customer-profit/` | profit and debt movement per customer and date range | `db2.deliveries`, `cumilativeCalculations` |
| `app/customer-performance/` | per-customer orders/week and avg order KG over 1/2/3/6/12 months, KG chart by day/week/month/year (timeline or years overlaid, with change vs previous period and last year), all-customer comparison | `deliveries.2023`, `db2.deliveries` |
| `app/meters/` | meter reading difference and units to target | `apiData` (meter sheet) |
| `app/calculator/` | discount and commission calculator | none |

## Layout (ADR-003)
- `assets/css/site.css`: design tokens (`:root`), base, components, app shell, public site,
  print. A black theme overrides the tokens under `:root[data-theme="dark"]` (screen only, so print
  and PDFs stay light); `assets/js/common.js` sets it from `localStorage` (`mb-theme`) and the app footer
  has the toggle and fires `mb:themechange` on `document`. Public pages have no toggle. Charts
  (`app/profits/profits.js`, `app/customer-performance/`) read axis, grid and legend colours from the
  tokens and redraw on `mb:themechange`; series colours are the same in both themes.
- `assets/js/common.js`: `Mb` namespace (`TOOLS`, `url`, `escapeHtml`, `toISTDate`, `todayIST`,
  `formatINR`, `formatNumber`, `setStatus`) and the app header/footer, inserted on
  DOMContentLoaded. It also runs the password gate: until the password (SHA-256 in `ACCESS_HASH`)
  is entered, the page is hidden and `Mb.ready` stays pending, and `callSheetsApi` awaits it.
  Unlock is remembered per browser in `localStorage` for `SESSION_MS` (30 minutes), then the page
  locks itself (an open page reloads to the gate); the footer "Lock" link clears it early. It resolves the site root from its own URL, so links work under any base path.
- `pay/` and `index.html` use `assets/css/site.css` only, without `assets/js/common.js`.

## Shared patterns
- Data pages: load → `Mb.setStatus(…, "info")` → `callSheetsApi([...])` → transform `rows` →
  build DOM with `textContent` → clear status, or show an error status on failure.
- Share buttons: phones get the Web Share sheet, other browsers download the file
  (`app/customer-performance/` PNG; `app/statement/` and `app/mbros-statement/` PDF via version-pinned jsPDF +
  jspdf-autotable from jsDelivr).
- Statement PDFs: `assets/js/statement-pdf.js` (`StatementPdf.share`) redraws the page's own tables to look like
  its print: same `@page` size and orientation, print CSS sizes × 0.75. A print CSS change on those pages
  needs the same change there. It reads extra `<thead>` rows above the column row as column groups, and gives
  columns whose `th` has class `even` one shared width; `group-locked` / `group-staged` cells get the light group tints. Both pages print the letterhead (`.print-frame` + `.letterhead` in
  `assets/css/site.css`, repeated on every page) and pass it to the PDF; on `app/mbros-statement/` a checkbox
  switches it off for both on the Statement tab only (`.no-letterhead`); Due per party always has it.
- Dates are shown in IST. `Mb.toISTDate` is the shared helper; `app/deliveries/deliveries.js` and
  `customer-profit` still use their own IST helpers (logic kept as it was).
- `app/deliveries/deliveries.js` and `app/profits/profits.js` were moved out of their HTML unchanged; their markup keeps
  the ids, classes and inline `onclick` names those scripts rely on.

## Adding a page
1. New folder `app/<id>/index.html` copying an existing small page's `<head>`; `data-page="<id>"`.
2. Add it to `Mb.TOOLS` in `assets/js/common.js` (nav + overview card).
3. Add a row above, and to `domains/data-access.md` if it reads a new worksheet.

## Decisions
- ADR-003 folder-per-page site with a shared design system, no build step
