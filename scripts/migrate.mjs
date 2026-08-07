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
      for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
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
    console.error("Rolled back. No further migrations were applied.");
    await connection.end();
    process.exit(1);
  }
}

console.log(`\n✓ applied ${pending.length} migration(s)`);
await connection.end();
