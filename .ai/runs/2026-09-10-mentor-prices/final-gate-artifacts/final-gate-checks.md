# Slice 4 browser final gate

Date: 2026-09-10
Environment: disposable local PostgreSQL and Next.js development server
Browser: repository-pinned agent-browser, isolated sessions

## Mentor price form

- 1440 × 1000 light theme: hierarchy, range chips, fixed PLN suffixes, field order and right-aligned
  primary action render correctly.
- An invalid `89.99` 25-minute value with valid `200.00` 50-minute value was refused. Both exact input
  strings remained and focus returned to `price25`.
- Correcting the value to `100.00` and activating Save with the keyboard succeeded. Reload restored
  `100.00` and `200.00` exactly.
- 320 × 800 dark theme: both fields precede Save, facts wrap without clipping and document width equals
  viewport width (320px).
- Axe WCAG 2 A/AA: zero violations after the design-system theme transition settled.
- Browser page errors: none. Console contained development-only React DevTools/HMR messages.

## Signed-out offer-ready page

- The public page displayed `PLN 90.00`, `PLN 180.00`, the mentor's public details and one future slot.
- No signed-in controls, booking, checkout or choose-time action appeared.
- 1440 × 1000 light theme had no horizontal overflow.
- Axe WCAG 2 A/AA: zero violations. Browser page errors: none.

## Evidence

- `prices-desktop-light.png`
- `prices-invalid-focus-preserved.png`
- `prices-mobile-320-dark.png`
- `public-offer-ready-desktop-light.png`

The integration suite separately owns and resets the unpriced-with-future-slot state and asserts the
exact owner/public API allowlists, all four bound refusals and atomic unchanged storage.
