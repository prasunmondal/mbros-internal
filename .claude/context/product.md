---
status: VERIFIED
last_verified: 2026-10-29
sources:
  - balance.html
  - calculator.html
  - profits.html
  - profitsPerCustomer.html
  - day-dashboard.html
  - meter_readings.html
  - payment.html
  - qr.html
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
- **Balance on a date** (`balance.html`): for each customer, the `khataBalance` of the latest
  delivery on or before the selected date. Customers with no delivery by then show the balance
  of their first row `[inferred: assumes rows arrive in date order]`.
- **Commission** (`calculator.html`): commission % = total discount % − discount passed on %.
  Payable = paying amount − discount passed on. Defaults: 5% total, 3% passed on.
- **Expenses** (`profits.html`): broken down into car, labour and extra expenses
  `[inferred: from column names]`.
- **Payments**: customers pay by UPI to `prsnmondal@ybl` (name "Prasun Mondal"), via the QR
  image `gpay_business.jpeg` or a `upi://pay` link.

## Pages → purpose
See `domains/pages.md`.

## Open questions
- [?] What is sold, and in what unit? `profits.html` reads a `kg` column.
- [?] Is "balance on a date" meant to fall back to the earliest balance for customers with no
  delivery by that date, or should they be hidden?
