# ADR-001: All sheet access goes through the GridBase engine

## Status
Accepted (recorded retroactively)

## Date
Introduced in commit 7c5c6c5 "migrate to gridbase"; recorded 2026-10-29

## Context
Pages read business data from Google Sheets through an Apps Script web app. The same engine
(GridBase) also serves the owner's other clients, and its contract is maintained in the
GridBase repo.

## Decision
Every page reads data only through `callSheetsApi(operations)` in `config.js`, which sends
batched GridBase operations to `API_URL`.

## Alternatives
- Google Sheets API directly from the browser: needs OAuth or exposed API keys.
- Per-page fetch code: duplicates retry and error handling.
- [?] The reasons for leaving the previous approach were not recorded. Owner to confirm.

## Consequences
- The GridBase engine's wire contract governs request and response shapes. Engine changes reach
  these pages only after the engine is redeployed.
- One client in `config.js` means one place to fix transport issues (see ADR-002).
