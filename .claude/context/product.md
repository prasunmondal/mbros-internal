---
status: VERIFIED
last_verified: 2026-10-29
sources:
  - app/balance/index.html
  - app/calculator/index.html
  - app/profits/profits.js
  - app/customer-profit/index.html
  - app/daily/index.html
  - app/meters/index.html
  - pay/index.html
  - index.html
---
# Product: business domain and rules

## Purpose
Internal tools for running Mondal Brothers: who owes what, what was delivered, what the business
earns, plus pages customers use to pay.

## Glossary
- **Khata**: the customer credit ledger. `khataBalance` is a customer's running balance in
  the `deliveries` worksheet.
- **Delivery**: one sale/delivery to a customer, a row in the deliveries worksheets.
- **cumilativeCalculations**: the worksheet with the daily business totals (spelling as in the
  sheet). Columns read include `date`, `sold_amount`, `total_expenses`, `profit`, `net`.

## Business rules
- **Balance on a date** (`app/balance/`): for each customer, the `khataBalance` of the latest
  delivery on or before the selected date. Customers with no delivery by then show the balance
  of their first row `[inferred: assumes rows arrive in date order]`.
- **Commission** (`app/calculator/`): commission % = total discount % − discount passed on %.
  Payable = paying amount − discount passed on. Defaults: 5% total, 3% passed on.
- **Expenses** (`app/profits/profits.js`): broken down into car, labour and extra expenses
  `[inferred: from column names]`.
- **Order** (`app/customer-performance/`): one customer's delivery day with `deliveredKg` > 0;
  rows without KG are payment-only. Orders/week counts weeks from the later of the period
  start and the customer's first delivery `[inferred: chosen when the page was built, not owner-confirmed]`.
  History joins the 2023–2025 archive (`deliveries.2023`, ends 2025-12-31) to `db2.deliveries`
  (from 2026-01-01). Balances come from `db2.deliveries` only; archive-only customers show none.
- **Payments** (`pay/`): two UPI routes. The QR image `assets/img/upi-qr.jpeg` is a Google Pay
  business QR for `9679004046@okbizaxis` ("Mondal Brothers"); the `upi://pay` button pays
  `prsnmondal@ybl` ("Prasun Mondal"). Both were on the old payment page.

## Pages → purpose
See `domains/pages.md`.

## Open questions
- [?] What is sold, and in what unit? `app/profits/profits.js` reads a `kg` column. The site calls the business a
  "Live Stock Chicken Distributor" [inferred: unit is presumably kg of live chicken].
- [?] Which UPI ID should customers use: the QR one, `prsnmondal@ybl`, or both?
- [?] Is "balance on a date" meant to fall back to the earliest balance for customers with no
  delivery by that date, or should they be hidden?
