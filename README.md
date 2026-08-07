# Sazuna Jewellers — storefront

Next.js 16 · React 19 · TypeScript · Tailwind v4 · MySQL

A full rebuild of the Sazuna storefront and admin, replacing the previous
Express + MySQL application. Built on the **Ceremony** design system.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the database credentials
npm run migrate              # apply schema migrations
npm run dev                  # http://localhost:3000
```

`/design` renders every component and variant in the design system — it is the
review surface for any visual change.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (standalone output) |
| `npm run verify` | tokens → typecheck → lint → build. Run before committing. |
| `npm run check:tokens` | Fails if the design tokens drift from the spec |
| `npm run migrate` | Apply pending database migrations |
| `npm run migrate:status` | List applied and pending migrations |

## Structure

```
app/              routes (App Router)
  design/         design system gallery
components/
  ui/             design system primitives
  shell/          shared header, footer, nav — mounted once in layout
lib/              cn, fonts, navigation, env, db
db/migrations/    versioned schema migrations
design-spec/      offline copy of the design spec's token block
docs/adr/         architecture decision records
scripts/          token parity check, migration runner
```

## Conventions

- **Design system is not optional.** See `CLAUDE.md`. Token drift fails CI.
- **Conventional Commits** with enforced scopes — see `commitlint.config.mjs`.
- **Architecture decisions** are recorded in `docs/adr`.
- **Never commit credentials.** `.env.local` is gitignored; `.env.example`
  documents the required shape.
