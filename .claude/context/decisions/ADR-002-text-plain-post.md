# ADR-002: POST bodies as text/plain JSON to avoid the CORS preflight

## Status
Accepted (recorded retroactively)

## Date
Present in `config.js` since commit 7c5c6c5; recorded 2026-10-29

## Context
Apps Script web apps do not answer CORS preflight (OPTIONS) requests. A POST with
`Content-Type: application/json` triggers a preflight, so the browser blocks it.

## Decision
`callSheetsApi` sends `JSON.stringify({ operations })` with no Content-Type header. The browser
sends it as `text/plain`, which is a simple request with no preflight, and the engine parses the
body as JSON.

## Alternatives
- A proxy server that adds CORS headers: extra infrastructure to run.
- GET with query parameters: URL length limits, no batching.

## Consequences
- The engine must keep accepting text/plain bodies (part of the GridBase contract).
- Engine failures still return HTML without CORS headers, which the browser reports as CORS
  errors. `fetchWithRetry` retries those; this is safe because all calls are reads.
