# ADR-004: The internal app is an installable PWA

## Status
Accepted. Adds to ADR-003: `manifest.webmanifest` and `sw.js` live at the site root, outside `assets/`.

## Date
2026-11-01

## Context
The owner asked to turn the site into a PWA, so the internal tools install on a phone home screen
and open like an app. The site is static with no build step (ADR-003), and data comes live from the
GridBase engine (ADR-001).

## Decision
- `manifest.webmanifest` (root): app "Mondal Brothers Internal" / "MBros", `start_url` `app/`,
  scope the whole site, standalone, brand green. PNG icons (192, 512, maskable 512, 180 Apple) in
  `assets/img/`.
- `sw.js` (root): a service worker's scope is its own folder, so it must sit at the root to cover
  every page. Same-origin files are network first (a deploy shows on the next load, no version bump
  needed) with the cache as the offline fallback; pinned jsDelivr scripts and Google Fonts are cache
  first. Engine calls are POSTs and pass through untouched: sheet data is never cached by the worker.
- Every app page `<head>` links the manifest and carries the Apple/theme meta tags; `assets/js/common.js`
  registers the worker (https or localhost only). Public pages (`index.html`, `pay/`) are not changed.

## Alternatives
- Cache first for site files: faster offline, but every deploy would need a `VERSION` bump.
- Caching engine responses in the worker: stale balances shown as current; `config.js` already has
  its own per-session data cache.
- A PWA library (Workbox): needs a build step or a CDN script for a ~100-line worker.

## Consequences
- The app opens offline (pages, styles, scripts) but shows load errors for data until online.
- A new page should be added to `PRECACHE` in `sw.js` so it opens offline before first visit.
- Bump `VERSION` in `sw.js` only to drop old caches (e.g. after removing a page).
- The password gate (common.js) works the same in the installed app; on iOS the installed app has
  its own storage, so it asks for the password separately from Safari.
