# 3. Raw `mysql2` rather than an ORM

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The rebuild could have adopted Drizzle or Prisma. The existing application uses
raw `mysql2` with hand-written SQL, including some genuinely intricate queries —
effective-price resolution, catalog filtering, and pricing-rule matching.

## Decision

Keep raw `mysql2`, wrapped in a small typed helper (`lib/db.ts`) providing
`query`, `queryOne`, `execute` and `transaction`.

## Consequences

- The complex queries port across as-is instead of being re-expressed in an ORM
  dialect, which is where subtle pricing bugs would be introduced.
- Adopting an ORM concurrently with a framework migration would mean two
  migrations at once, doubling the surface where a regression can hide.
- **Cost:** no generated types from the schema. Row shapes are declared by hand
  and can drift from the database. Mitigated by keeping queries close to their
  callers and typing every result explicitly.
- An ORM remains possible later as its own project, with the schema stable.

## Notes

Two deliberate configuration choices in `lib/db.ts`:

- `decimalNumbers: false` — money is returned as a string. A `DECIMAL` price
  parsed into a JS float is a rounding bug waiting to be discovered in an order
  total.
- The pool is cached on `globalThis`, because Next's dev server re-evaluates
  modules on hot reload and would otherwise exhaust the shared-hosting
  connection cap within minutes.
