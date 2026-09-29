#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies every unapplied file in db/migrations in filename order, inside a
 * transaction per migration, and records what ran in `schema_migrations`.
 *
 * This deliberately replaces the previous app's approach of running DDL on every
 * boot: that could not express "this column was renamed", gave no record of what
 * had been applied, and coupled schema changes to process start.
 *
 * Usage:
 *   node scripts/migrate.mjs          apply pending migrations
 *   node scripts/migrate.mjs status   list applied and pending, apply nothing
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(root, "db/migrations");

// Load .env.local without a dependency — the runner is invoked outside Next.
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      // \r?\n: a .env saved on Windows ends every line in \r, which `$` never
      // matches — the file loaded as empty and DB_HOST read as "not set".
      for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (match && process.env[match[1]] === undefined) {
          process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // Absent file is fine; the environment may be supplied by the host.
    }
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ ${name} is not set. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  return value;
}

loadEnv();

const connection = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT ?? 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  multipleStatements: true,
});

await connection.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

const [applied] = await connection.query("SELECT name FROM schema_migrations");
const appliedNames = new Set(applied.map((row) => row.name));

/*
 * A fresh database takes its character set from the server's default, and
 * 0001 creates most of its tables without naming one — they inherit it. Every
 * later migration pins utf8mb4_unicode_ci, so on a server whose default is
 * anything else (Ubuntu's MariaDB ships utf8mb4_general_ci; MariaDB 11.6+ and
 * MySQL 8 use newer collations) 0004 dies on "Illegal mix of collations", and
 * with a latin1 default a Nepali name cannot be stored at all. Before the
 * first migration only, the database is set to what the schema expects. An
 * existing database is never altered here — that would be a migration.
 */
if (appliedNames.size === 0 && process.argv[2] !== "status") {
  await connection.query(
    `ALTER DATABASE \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
}

let files = [];
try {
  files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
} catch {
  console.error(`✗ No migrations directory at ${MIGRATIONS_DIR}`);
  await connection.end();
  process.exit(1);
}

const pending = files.filter((file) => !appliedNames.has(file));

if (process.argv[2] === "status") {
  console.log(`applied: ${appliedNames.size}`);
  for (const file of files) {
    console.log(`  ${appliedNames.has(file) ? "✓" : "·"} ${file}`);
  }
  console.log(pending.length === 0 ? "\nup to date" : `\n${pending.length} pending`);
  await connection.end();
  process.exit(0);
}

if (pending.length === 0) {
  console.log("✓ no pending migrations");
  await connection.end();
  process.exit(0);
}

for (const file of pending) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  process.stdout.write(`… ${file}`);
  try {
    await connection.beginTransaction();
    await connection.query(sql);
    await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    await connection.commit();
    console.log(`\r✓ ${file}`);
  } catch (error) {
    await connection.rollback();
    console.log(`\r✗ ${file}`);
    console.error(`\n${error.message}\n`);
    // Only the data statements are undone: MySQL and MariaDB commit implicitly
    // after every DDL statement, so any CREATE/ALTER before the failure stayed.
    // Saying "rolled back" sent people to re-run into "duplicate column".
    console.error(
      `${file} is NOT recorded as applied, but schema changes it made before the failing ` +
        "statement are committed (DDL cannot be rolled back). Inspect the schema and undo " +
        "them, or finish the migration by hand, before running migrate again. No further " +
        "migrations were applied.",
    );
    await connection.end();
    process.exit(1);
  }
}

console.log(`\n✓ applied ${pending.length} migration(s)`);
await connection.end();
