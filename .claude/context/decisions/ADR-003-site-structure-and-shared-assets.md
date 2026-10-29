# ADR-003: Folder-per-page site with a shared design system, still no build step

## Status
Accepted. Supersedes the "self-contained page, no shared CSS" convention in `.claude/rules/pages.md`.
Moves the GridBase client from `config.js` to `assets/js/config.js`; ADR-001 and ADR-002 otherwise
stand unchanged.

## Date
2026-10-29

## Context
The repo was ten flat HTML files, each with its own inline CSS and a different look. There was no
public home page, and `index.html` listed pages by parsing a directory listing, which static hosts do
not serve. The owner asked for a "professional website": a public home page plus a consistent
internal app, keeping plain static hosting.

## Decision
- One folder per page with an `index.html`: `/` (public home), `pay/` (customer payment),
  `app/` (internal overview) and `app/<tool>/` for each tool.
- Shared code lives only in `assets/`: `css/site.css` (design tokens and components),
  `js/config.js` (GridBase client, unchanged API), `js/common.js` (app header/nav, formatting).
  `common.js` exposes one global, `Mb`, so it cannot clash with page globals.
- Page-specific code stays with its page: inline for small pages, sibling `.js`/`.css` files
  for the large ones (deliveries, profits).
- All links and asset paths are relative, so the site works under any base path.
- Still no build step, package manager or framework. Chart.js stays on jsDelivr, now version-pinned.
- Old URLs (`payment.html`, `qr.html`, `balance.html`, …) are dropped with no redirects (owner, 2026-10-29).

## Alternatives
- Keep flat files and only restyle: no shared design system, so the look drifts again.
- Vite build: bundling and a deploy workflow for a site with no npm dependencies.
- React/Vue rewrite: the most risk to report logic that has no tests.
- Redirect stubs for old URLs: declined by the owner.

## Consequences
- A design change is made once in `site.css`; a nav change once in `Mb.TOOLS` (`common.js`).
- Pages depend on `assets/`, so a page can no longer be copied out on its own.
- Printed or shared links to the old `payment.html` / `qr.html` return 404.
- The internal app is still public (no auth); app pages only carry `noindex`.
