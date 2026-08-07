# Migrations

Applied in filename order by `scripts/migrate.mjs`, one transaction each,
recorded in `schema_migrations`. See ADR 0006.

## Naming

```
0001_initial_schema.sql
0002_add_loyalty_tiers.sql
```

Zero-padded sequence, then a short snake_case description. The sequence is what
orders them — never renumber a migration that has been applied anywhere.

## Rules

- **One concern per file.** MySQL DDL is not transactional, so a migration that
  mixes DDL and data changes can leave a partial state if it fails midway.
- **Never edit an applied migration.** It has already run somewhere; editing it
  makes that database silently different from a fresh one. Write a new migration.
- **Forward-only.** There is no `down`. A mistake is corrected by a new migration
  that undoes it, which is what would happen in production anyway.

## Commands

```bash
npm run migrate          # apply pending
npm run migrate:status   # report without changing anything
```
