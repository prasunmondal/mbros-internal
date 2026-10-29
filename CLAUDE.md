# CLAUDE.md

Guidance for Claude Code in this repository. This file is a **router**: details live in
`.claude/context/`, and path-scoped rules in `.claude/rules/` load by themselves when you open
matching files. Same conventions as the GridBase repo (`C:\Projects\GridBase`).

## What this is

Internal web pages for **Mondal Brothers** (the family business): delivery reports, customer
khata (credit) balances, profits, a discount/commission calculator, meter readings, and UPI
payment pages. Plain HTML + inline JS, no build step, no package manager, no tests.

Data lives in Google Sheets and is read through the **GridBase** engine (Apps Script web app),
via the shared client in `config.js`.

## Hard constraints

- All sheet I/O goes through `callSheetsApi(operations)` in `config.js`. Never call Google
  Sheets or the engine URL any other way (ADR-001).
- POST bodies are a JSON **string** with no Content-Type header, so there is no CORS preflight.
  Do not add `Content-Type: application/json` (ADR-002).
- Each page is self-contained: its own HTML, CSS and JS. Shared code goes in `config.js` only.
- Charts use Chart.js from the jsDelivr CDN (`profits.html`, `day-dashboard.html`).
- The engine's wire contract is owned by the GridBase repo. Never redefine it here.

## Commands

```bash
npx serve .                               # local preview (any static server works)
node scripts/knowledge/lint-context.js    # check the knowledge base against the repo (warn-only)
```

## Knowledge map (read on demand, start at `.claude/context/INDEX.md`)

| File | Holds |
|---|---|
| `product.md` | business domain, glossary, business rules, page → purpose |
| `domains/data-access.md` | GridBase client, spreadsheets and worksheets used, operation ids |
| `domains/pages.md` | page inventory, shared page patterns, UI conventions |
| `known-issues.md` | open bugs and doubts |
| `decisions/` | ADRs: **read the relevant ones before an architectural change** |

## Source of truth

1. The user's current instruction  2. Source code  3. Accepted ADRs  4. `.claude/context/`
Business rules: the owner's statement wins. A rule only seen in code is `[inferred]` until the
owner confirms it. If knowledge contradicts the code, check the code, then fix the knowledge
file or mark it `status: STALE`. If the code looks wrong, ask.

## Keeping knowledge current

After a meaningful change, check whether a durable fact changed (data source, worksheet, business
rule, invariant, convention). If it did, edit its single home in `.claude/context/` in place,
following `.claude/rules/knowledge.md`. Most changes need no knowledge update.
Never record a guess as fact: tag it `[inferred]`, or `[?]` in Open questions.
