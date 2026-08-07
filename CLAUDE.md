# Sazuna — Next.js storefront

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · MySQL (raw `mysql2`).
Full rebuild of the Express storefront. Single brand per deploy.

## Non-negotiables

1. **The design spec is the source of truth.** Claude Design project
   `deea797d-e4b5-409c-b32f-f5f926846bb6`. `.dc.html` files are **specs, not
   code** — read and implement them; never paste them.
2. **Never hardcode a value a token covers.** If the spec's components use a size
   the core scale doesn't name, add it to the component-token block in
   `app/globals.css` — do not write a literal in a component.
3. **`npm run verify` must pass before any commit.** CI runs the same checks.
4. **Never commit credentials.** `.env.local` only; `.env.example` documents the shape.

## Design system

- All tokens are `--sz-*`, declared once in `app/globals.css` `:root`,
  transcribed verbatim from the spec's §Token file.
- `design-spec/ceremony-tokens.css` is an offline copy of that spec block.
  `npm run check:tokens` fails if `globals.css` drifts from it. If the spec
  changes, **re-export the fixture** — never hand-patch it to make the check pass.
- `-rgb` tracks are space-separated: `rgb(var(--x-rgb) / .5)`.
  `rgba(var(--x-rgb), .5)` is invalid CSS and fails silently.
- Tailwind utilities are bridged in `@theme inline`, so a utility references the
  token rather than copying it and can never diverge.
- Fonts: **Fraunces** (display) · **General Sans** (UI/body) · **Geist Mono**
  (prices, SKUs), self-hosted in `public/fonts`. **No new fonts. No new palettes.**

### Hard rules from the design project

- **Sale price**: `--sz-primary-700`, weight 600, Geist Mono, negative tracking,
  original struck in `--sz-price-struck`. Regular prices stay ink and lighter.
  Never restyle price per surface.
- **Shared shell is mandatory.** `components/shell/site-header.tsx` and
  `site-footer.tsx` are mounted once in `app/layout.tsx`. No page may build its
  own header, footer, announcement bar, mega-menu, mini-cart or WhatsApp button.

## Components

- Primitives in `components/ui`, one file each, exported via `components/ui/index.ts`.
  Import from `@/components/ui`.
- Multi-variant components use CVA. Every component takes `className` and merges
  it through `cn()`, so callers override without specificity fights.
- **Server Components by default.** `"use client"` only for real state.
- Focus rings come from the global `:focus-visible` rule. Components never
  restyle their own focus ring.
- Prefer native elements — `<dialog>` for modal/drawer, `<details>` for
  accordion, real `<input>`s for form controls. The platform gets focus
  trapping, Escape and screen-reader semantics right for free.

## Data

- Raw `mysql2` via `lib/db.ts`. It is `server-only`: importing it from a Client
  Component is a build error, not a runtime credential leak.
- Money is `DECIMAL` and returned as a **string** (`decimalNumbers: false`).
  Never let a price round-trip through a float.
- Anything writing more than one table goes through `transaction()`.
- Schema changes are **migrations only** — a new file in `db/migrations`, applied
  with `npm run migrate`. Never DDL on boot.

## Conventions

- Conventional Commits, scopes enforced by `commitlint.config.mjs`.
- Architecture decisions get an ADR in `docs/adr`. If we are about to relitigate
  something, check there first.

## Verify

```
npm run verify        # tokens → typecheck → lint → build
npm run migrate:status
```
