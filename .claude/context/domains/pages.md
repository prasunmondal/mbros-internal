---
status: VERIFIED
last_verified: 2026-10-29
sources:
  - index.html
  - balance.html
  - calculator.html
  - day-dashboard.html
  - meter_readings.html
  - pastDeliveryReports.html
  - payment.html
  - profits.html
  - profitsPerCustomer.html
  - qr.html
---
# Pages

## Inventory
| Page | Purpose | Data |
|---|---|---|
| `index.html` | links to the other pages, built from a directory listing | none |
| `balance.html` | customer khata balances as of a chosen date | `deliveries` |
| `pastDeliveryReports.html` | delivery analysis over 2023 + current deliveries (large file) | `deliveries.2023`, `db2.deliveries` |
| `profits.html` | business dashboard: profit, expenses, trends (Chart.js) | `cumilativeCalculations` |
| `day-dashboard.html` | daily sold / expenses / profit charts (Chart.js) | `cumilativeCalculations` |
| `profitsPerCustomer.html` | profit per selected customer | `db2.deliveries`, `cumilativeCalculations` |
| `meter_readings.html` | meter reading difference and estimated bill | `apiData` (meter sheet) |
| `calculator.html` | discount and commission calculator | none |
| `payment.html`, `qr.html` | customer UPI payment pages (Bengali + English) | none |

## Shared patterns
- Each page has inline `<style>` and `<script>`. There is no shared CSS or component code.
- Data pages: `fetchData()` on load → `callSheetsApi([...])` → transform `rows` → build DOM.
- Dates are shown in IST. `formatDateToIST` is defined separately in `balance.html` and
  `pastDeliveryReports.html`; it is not shared.
- Errors are logged with `console.error`; some pages also `alert` the user.

## Adding a page
1. New self-contained `<name>.html`; include `config.js` if it reads data.
2. Add a row above, and to `domains/data-access.md` if it reads a new worksheet.

## Decisions
None yet.
