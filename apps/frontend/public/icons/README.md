# PWA icons — PLACEHOLDERS

These are **placeholder** icons (solid brand-blue `#0b5cab` PNGs) generated so the PWA
manifest validates and the production build does not 404 on icon references.

Replace with real brand assets before any public release:

- `icon-192.png` — 192×192, standard
- `icon-512.png` — 512×512, standard
- `icon-maskable-512.png` — 512×512, `purpose: maskable` (keep important content within
  the inner 80% safe zone so Android adaptive masks don't clip it)

The manifest is declared in `apps/frontend/app/manifest.ts` (App Router metadata route).
Replacing the files at these exact paths/sizes requires no code change.
