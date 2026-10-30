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
  - app/customer-performance/index.html
  - app/meters/index.html
  - app/calculator/index.html
  - assets/css/site.css
  - assets/js/common.js
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
| `app/daily/` | daily sold / expenses / profit charts | `cumilativeCalculations` |
| `app/customer-profit/` | profit and debt movement per customer and date range | `db2.deliveries`, `cumilativeCalculations` |
| `app/customer-performance/` | per-customer orders/week and avg order KG over 1/2/3/6/12 months, KG chart by day/week/month/year (timeline or years overlaid, with change vs previous period and last year), all-customer comparison | `deliveries.2023`, `db2.deliveries` |
| `app/meters/` | meter reading difference and units to target | `apiData` (meter sheet) |
| `app/calculator/` | discount and commission calculator | none |

## Layout (ADR-003)
- `assets/css/site.css`: design tokens (`:root`), base, components, app shell, public site,
  print. Light theme only: chart colours in `app/profits/profits.js` are hard-coded for a light background.
- `assets/js/common.js`: `Mb` namespace (`TOOLS`, `url`, `escapeHtml`, `toISTDate`, `todayIST`,
  `formatINR`, `formatNumber`, `setStatus`) and the app header/footer, inserted on
  DOMContentLoaded. It resolves the site root from its own URL, so links work under any base path.
- `pay/` and `index.html` use `assets/css/site.css` only, without `assets/js/common.js`.

## Shared patterns
- Data pages: load → `Mb.setStatus(…, "info")` → `callSheetsApi([...])` → transform `rows` →
  build DOM with `textContent` → clear status, or show an error status on failure.
- Share buttons: phones get the Web Share sheet, other browsers download the file
  (`app/customer-performance/` PNG, `app/statement/` PDF via version-pinned jsPDF + jspdf-autotable from jsDelivr).
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
