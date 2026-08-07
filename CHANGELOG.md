# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Next.js 16 application scaffold with TypeScript strict mode and Tailwind v4.
- **Ceremony design system foundation**
  - Token layer in `app/globals.css`, transcribed verbatim from the design spec,
    bridged into Tailwind via `@theme inline` so utilities reference tokens
    rather than copying their values.
  - `scripts/check-tokens.mjs` — fails the build if tokens drift from
    `design-spec/ceremony-tokens.css`.
  - 19 primitives: Button, Input, Select, Textarea, QuantityStepper, Toggle,
    Checkbox, RadioGroup, ProductCard, Badge, Chip, Modal, Drawer, Tabs, Toast,
    Accordion, Skeleton, Icon, Field.
  - Self-hosted Fraunces / General Sans / Geist Mono via `next/font/local`.
- **Shared shell** — `SiteHeader` (announcement bar, sticky header, mega-menu,
  account menu, mini-cart, mobile nav) and `SiteFooter`, mounted once in the
  root layout.
- `/design` — component gallery rendering every component and variant.
- **Data layer** — `server-only` `mysql2` pool with transaction helper, Zod-validated
  environment, and a versioned migration runner (`npm run migrate`).
- **Initial schema migration** — 26 tables ported from the Express application,
  with its destructive `DROP TABLE` bootstrap statements and MariaDB-only
  `IF NOT EXISTS` guards removed. Verified against MySQL 8.4.
- **Coupons migration** — the `coupons` table and four `orders` discount columns,
  found by diffing the live database against the generated schema rather than by
  reading code. The new database now matches production exactly: 27 tables, zero drift.
- `scripts/copy-database.mjs` — copies table data from a source database into this
  one. Re-serialises driver-parsed JSON columns, which MariaDB stores as LONGTEXT
  with a `json_valid()` constraint and would otherwise be written as
  `[object Object]`.
- **CI** — token parity, typecheck, lint and build on every push and pull request;
  commit message linting on pull requests.
- Architecture decision records in `docs/adr`.
