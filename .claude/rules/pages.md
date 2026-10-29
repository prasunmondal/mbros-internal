---
paths:
  - "index.html"
  - "pay/**"
  - "app/**"
  - "assets/css/**"
  - "assets/js/common.js"
---
# Pages: conventions

- One folder per page with an `index.html` (ADR-003). Shared code only in `assets/`; page-only
  code inline (small pages) or as sibling `.js`/`.css` (large pages). No build step or framework.
- Every app page: `<body data-page="<id>">`, loads `assets/css/site.css` and, in `<head>`,
  `assets/js/common.js` (renders header/nav, defines `Mb`). New tools go in `Mb.TOOLS`.
- Use `assets/css/site.css` tokens and components (`.card`, `.btn`, `.table`, `.stat`, `.status`) before
  writing page CSS. Show loading/errors with `Mb.setStatus`, not `alert`.
- Never put sheet values into `innerHTML` unescaped: use `textContent` or `Mb.escapeHtml`.
- All paths relative (the site may live under a sub-path). App pages carry `noindex`.
- Pages that read data load `assets/js/config.js` and call `callSheetsApi([...])`; read
  `result[i].rows`. Main spreadsheet: `MAIN_SHEET_ID`; other IDs stay in the page that uses them.
- `app/deliveries/deliveries.js` and `app/profits/profits.js` are large: grep, don't read whole.
- Business calculations: check `context/product.md` first; a changed rule needs the owner.
- `pay/` and `index.html` are customer-facing: keep Bengali + English text.
- More: `context/domains/pages.md`.
