#!/usr/bin/env node
/**
 * Copy table data from a source database into this project's database.
 *
 * Used to seed the rebuild from the live Express database, and to re-sync
 * before launch. The source is only ever read; every write goes to the target.
 *
 * Credentials come from the environment, never from this file:
 *   SOURCE_DB_HOST / SOURCE_DB_USER / SOURCE_DB_PASSWORD / SOURCE_DB_NAME
 *   DB_HOST / DB_USER / DB_PASSWORD / DB_NAME   (the target, from .env.local)
 *
 * Usage:
 *   node scripts/copy-database.mjs --dry-run   report what would be copied
 *   node scripts/copy-database.mjs             copy (target tables are emptied)
 *
 * Tables present in the source but not the target are reported and skipped
 * rather than silently ignored — that gap means a migration is missing.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

/** Never touched: it records which migrations this database has had applied. */
const NEVER_COPY = new Set(["schema_migrations"]);

/** Rows inserted per statement. Large enough to be fast, small enough for max_allowed_packet. */
const BATCH = 500;

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(root, file), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* absent file is fine */
    }
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

/**
 * Re-serialise values the driver parsed on the way out.
 *
 * MariaDB's JSON type is LONGTEXT plus a json_valid() CHECK constraint, and
 * mysql2 parses those columns into JavaScript objects when reading. Handing the
 * object straight back to INSERT coerces it to the string "[object Object]",
 * which fails the constraint — and on a column without that constraint it would
 * have silently written garbage instead of erroring.
 *
 * Buffers and Dates are passed through: the driver round-trips those correctly,
 * and stringifying them would corrupt binary and temporal data.
 */
function serialise(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

loadEnv();

const source = await mysql.createConnection({
  host: required("SOURCE_DB_HOST"),
  port: Number(process.env.SOURCE_DB_PORT ?? 3306),
  user: required("SOURCE_DB_USER"),
  password: required("SOURCE_DB_PASSWORD"),
  database: required("SOURCE_DB_NAME"),
  // Keep everything as strings/Buffers so values round-trip byte-for-byte.
  // Parsing a DECIMAL into a float here would corrupt every price.
  decimalNumbers: false,
  dateStrings: true,
});

const target = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT ?? 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  decimalNumbers: false,
  dateStrings: true,
});

const [sourceTables] = await source.query(
  "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
);
const [targetTables] = await target.query(
  "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()",
);
const targetSet = new Set(targetTables.map((r) => r.t));

const plan = [];
const skipped = [];

for (const { t } of sourceTables) {
  if (NEVER_COPY.has(t)) continue;
  if (!targetSet.has(t)) {
    skipped.push(t);
    continue;
  }
  const [[{ c }]] = await source.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
  plan.push({ table: t, rows: c });
}

if (skipped.length > 0) {
  console.error(`\n⚠ ${skipped.length} table(s) exist in the source but not here: ${skipped.join(", ")}`);
  console.error("  That means a migration is missing. Fix the schema before copying.\n");
}

const total = plan.reduce((n, p) => n + p.rows, 0);
console.log(`${DRY_RUN ? "[dry run] " : ""}${plan.length} tables, ${total.toLocaleString()} rows\n`);

if (DRY_RUN) {
  for (const { table, rows } of plan.filter((p) => p.rows > 0)) {
    console.log(`  ${String(rows).padStart(7)}  ${table}`);
  }
  await source.end();
  await target.end();
  process.exit(skipped.length > 0 ? 1 : 0);
}

// FK checks off for the whole run, so table order does not matter. They are
// restored in the finally block even if a copy throws.
await target.query("SET FOREIGN_KEY_CHECKS = 0");
let copied = 0;

try {
  for (const { table, rows } of plan) {
    await target.query(`TRUNCATE TABLE \`${table}\``);
    if (rows === 0) {
      console.log(`  ·  ${table} (empty)`);
      continue;
    }

    const [columns] = await source.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position",
      [table],
    );
    const names = columns.map((r) => r.c);
    const quoted = names.map((c) => `\`${c}\``).join(", ");

    let offset = 0;
    while (offset < rows) {
      const [batch] = await source.query(
        `SELECT ${quoted} FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`,
      );
      if (batch.length === 0) break;
      const values = batch.map((row) => names.map((c) => serialise(row[c])));
      await target.query(`INSERT INTO \`${table}\` (${quoted}) VALUES ?`, [values]);
      offset += batch.length;
    }

    const [[{ c: landed }]] = await target.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
    const ok = landed === rows;
    console.log(`  ${ok ? "✓" : "✗"}  ${table}: ${landed}/${rows}`);
    if (!ok) throw new Error(`${table}: copied ${landed} of ${rows} rows`);
    copied += landed;
  }
} finally {
  await target.query("SET FOREIGN_KEY_CHECKS = 1");
}

console.log(`\n✓ copied ${copied.toLocaleString()} rows across ${plan.length} tables`);
await source.end();
await target.end();
