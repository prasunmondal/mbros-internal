---
status: VERIFIED
last_verified: 2026-10-29
sources:
  - index.html
  - payment.html
---
# Known issues

- `payment.html`: the "Pay Online" link's `href` starts with `prsnmondal@ybl&pn=...` and has no
  `upi://pay?pa=` prefix, unlike `qr.html`. The button probably doesn't open a UPI app `[inferred]`.
- `index.html` builds its list by fetching `.` and parsing a directory listing. Static hosts
  without directory listings (e.g. GitHub Pages) return no links `[inferred]`.
  [?] Where is this repo hosted?
