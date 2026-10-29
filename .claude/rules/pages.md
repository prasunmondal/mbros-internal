---
paths:
  - "*.html"
---
# Pages: conventions

- One page = one feature, self-contained (HTML + `<style>` + `<script>`). Do not add a build
  step, framework or shared CSS file without an ADR.
- Pages that read data load `config.js` with `<script src="config.js">` and call
  `callSheetsApi([...])`. Each operation returns `{ operationId, rowCount, rows }`; read
  `result[i].rows`.
- Use `MAIN_SHEET_ID` from `config.js` for the main spreadsheet. Other spreadsheet IDs stay
  where they are used (see `context/domains/data-access.md`).
- `pastDeliveryReports.html` and `profits.html` are large (~2.5k / ~1.7k lines): grep for the
  symbol you need, do not read them whole.
- Business calculations (balances, profit, commission): check `context/product.md` before
  changing them; a changed rule needs the owner's confirmation.
- `payment.html` / `qr.html` are customer-facing (Bengali + English text). Keep both languages.
- More: `context/domains/pages.md`.
