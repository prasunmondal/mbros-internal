---
status: VERIFIED
last_verified: 2026-10-30
sources:
  - app/balance/index.html
  - app/calculator/index.html
  - app/profits/profits.js
  - app/profits/monthly.js
  - app/customer-profit/index.html
  - app/daily/index.html
  - app/meters/index.html
  - app/statements/index.html
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
  sheet). One row per day (a couple of 2023 dates have two). `date` is `YYYY-MM-DD` on newer rows and a
  UTC timestamp of IST midnight on older ones. Its `sold_amount` and `deliveredPc` match that day's
  delivery rows on most days (1,042 of 1,124, checked 2026-10-30). `shortage` is a percentage
  `[inferred: (kg − deliveredKg) / kg]`; `employeeSalaries` reads `{Name|Role|Amount}, …`.

## Business rules
- **Dues** always mean `totalBalance`, never `khataBalance` (owner, 2026-11-07). The due columns of `cumilativeCalculations` add up `khataBalance` (written by the Android app), so `useTotalBalanceDues` in `assets/js/config.js` corrects them on every page that reads them. If the app starts writing `totalBalance` dues, that correction must go. Rows before the correction counted a move between `otherBalances` and `khataBalance` as dues changing, e.g. ₹135,000 on 2026-04-03.
- **Balance on a date** (`app/balance/`): for each customer, the `totalBalance` of the latest
  delivery on or before the selected date. Customers with no delivery by then show the balance
  of their first row `[inferred: assumes rows arrive in date order]`.
- **Khata row arithmetic** (`db2.deliveries`): `khataBalance` = `prevAmount` + `deliverAmount` − `paidCash`
  − `paidOnline` − `discount` + `autoAdjust` + `adjustments`, and each row's `prevAmount` is the
  customer's previous `khataBalance`. Held for every row on 2026-10-30 `[inferred: from data, not owner-stated]`.
  `totalBalance` adds `otherBalances` on top; the statement uses `totalBalance` and shows a change in `otherBalances` as an adjustment.
  The 2023–2025 archive does not hold to this: ~1,900 rows (mostly 2023) lack payment amounts and
  ~47 rows' `prevAmount` differs from the previous balance. Each customer's last 2025 balance does
  equal their first 2026 `prevAmount` (checked 2026-10-30).
- **Customer statement** (`app/statements/`, Customer Statement tab): opening = each selected customer's last `totalBalance` before
  the start date (else the `prevAmount` of their first row), summed; the running balance then adds
  each row's `totalBalance` − the customer's previous `totalBalance`, in date order across all
  selected customers, so it always lands on the sheet's balances. A fall the row's columns don't
  explain counts as a cash payment noted "Payment not entered in sheet" (owner, 2026-10-30); an
  unexplained rise is shown as an adjustment `[inferred]`. The archive loads only for ranges
  starting before 2026.
- **MBros statement** (`app/statements/`, `db2.loads`): each row moves goods or money from
  `sender` (via `via`) to `receiver`. The balance with a party is what MBros owes it: value reaching
  MBros adds `senderAmount` (or `viaSellAmount` when it came through a via), value leaving subtracts it.
  When MBros is the via, it owes the sender `senderAmount` and the receiver owes it `viaSellAmount` (owner, 2026-10-30).
  The 2025-10-31 "Migrate to newer balance sheet" Adjustment rows reset the supplier balances.
- **Commission** (`app/calculator/`): commission % = total discount % − discount passed on %.
  Payable = paying amount − discount passed on. Defaults: 5% total, 3% passed on.
- **Expenses** (`app/profits/profits.js`): broken down into car, labour and extra expenses
  `[inferred: from column names]`.
- **Order** (`app/customer-performance/`): one customer's delivery day with `deliveredKg` > 0;
  rows without KG are payment-only. Orders/week counts weeks from the later of the period
  start and the customer's first delivery `[inferred: chosen when the page was built, not owner-confirmed]`.
  History joins the 2023–2025 archive (`deliveries.2023`, ends 2025-12-31) to `db2.deliveries`
  (from 2026-01-01). Balances come from `db2.deliveries` only; archive-only customers show none.
- **Networth** (`app/profits/` Revenue tab, Balances): Balance = Cash + Bank + Direct Debt + Online; Networth = Balance + Market Due (owner's example, 2026-11-04). The page shows the `revenue` sheet's own `inhouseBalance`, `customerDue` and `networth`, working them out only when blank (Market Due then = every customer's last khata balance on that date) [inferred: fallback chosen when built].
- **Monthly average actual money received** (`app/profits/` Revenue tab, Balances): actual money received (profit − rise in dues) minus the salaries for that month, averaged per month. Salaries are `db2.loads` rows labelled `EmployeeSalary`, amount in `senderAmount`. A month's salary is paid from 5 days before its end up to the 20th of the next month, e.g. June's between 25 June and 20 July (owner, 2026-11-07). Covers the last 12 finished months, leaving out a month with no salary recorded until its window closes `[inferred: chosen when built, not owner-confirmed]`. Rows paid between the 21st and the start of a window belong to no month: they are listed, not deducted. Until December 2025 Raju's salary is in the `RajuSalary` column of `cumilativeCalculations`; the `profit` column doesn't subtract it (checked against the data, 2026-11-07), so those months show no deduction.
- **Payments** (`pay/`): two UPI routes. The QR image `assets/img/upi-qr.jpeg` is a Google Pay
  business QR for `9679004046@okbizaxis` ("Mondal Brothers"); the `upi://pay` button pays
  `prsnmondal@ybl` ("Prasun Mondal"). Both were on the old payment page.

## Pages → purpose
See `domains/pages.md`.

## Open questions
- [?] Should the monthly average also deduct the `RajuSalary` column for months before 2026, and were the January, February, April and June 2026 salaries paid outside `db2.loads`?
- [?] What is sold, and in what unit? `app/profits/profits.js` reads a `kg` column. The site calls the business a
  "Live Stock Chicken Distributor" [inferred: unit is presumably kg of live chicken].
- [?] Which UPI ID should customers use: the QR one, `prsnmondal@ybl`, or both?
- [?] Is "balance on a date" meant to fall back to the earliest balance for customers with no
  delivery by that date, or should they be hidden?
