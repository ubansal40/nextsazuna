# 6. Versioned migrations, not DDL on boot

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The previous application created and altered its schema at process start:
`server/startup/schema/*` ran `CREATE TABLE IF NOT EXISTS` and column-widening
statements on every boot.

This has real problems:

- It cannot express a rename, a backfill, or a destructive change — only
  idempotent additions.
- There is no record of what has been applied to a given database.
- Schema changes are coupled to process start, so a deploy that restarts several
  instances races itself.
- Rolling back means hand-writing the inverse from memory.

## Decision

Schema changes are **files** in `db/migrations`, applied in filename order by
`scripts/migrate.mjs`, each inside a transaction, and recorded in a
`schema_migrations` table.

`npm run migrate` applies pending migrations. `npm run migrate:status` reports
without changing anything. A failed migration rolls back and stops the run
rather than continuing.

## Consequences

- The schema has a history, and any database can report exactly where it stands.
- Migrations run as a deliberate deploy step, not as a side effect of boot.
- MySQL DDL is not transactional, so a migration mixing DDL and DML can still
  leave a partial state on failure. Keep each migration to one concern.
- The schema of the existing production database is ported into an initial
  migration rather than being redesigned, so business logic transfers unchanged.
