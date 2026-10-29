# Mondal Brothers website

Public site, customer payment page and internal tools for Mondal Brothers, a live stock chicken
distributor in Goghat, West Bengal. Static HTML, CSS and JS: no build step.

| Path | What |
|---|---|
| `/` | Public home page: contact details and a link to payment |
| `/pay/` | Customer payment: UPI QR code and pay-by-UPI button (Bengali + English) |
| `/app/` | Internal tools: balances, deliveries, customer profit, dashboards, meters, calculator |

## Structure

```
index.html            public home
pay/                  payment page
app/                  internal overview; one folder per tool (app/<tool>/index.html)
assets/css/site.css   design system (tokens, components, layouts)
assets/js/config.js   GridBase client: all Google Sheets reads go through callSheetsApi()
assets/js/common.js   app header/nav and helpers (the `Mb` namespace)
assets/img/           QR code, favicon
```

## Run locally

```bash
npx serve .
```

Then open http://localhost:3000. Data pages read live Google Sheets through the GridBase engine.

## Adding a tool

1. Create `app/<id>/index.html` (copy the `<head>` of a small page such as `app/calculator/`).
2. Set `<body data-page="<id>">` and add the tool to `TOOLS` in `assets/js/common.js`.

Architecture decisions are recorded in `.claude/context/decisions/`.
