import "server-only";

import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { env } from "./env";

/**
 * MySQL connection pool.
 *
 * `server-only` at the top makes importing this from a Client Component a build
 * error rather than a runtime credential leak.
 *
 * The pool is cached on globalThis because Next's dev server re-evaluates
 * modules on every hot reload; without this, each reload would open a fresh pool
 * and exhaust the connection cap on shared hosting within minutes.
 */
declare global {
  var __sazunaPool: Pool | undefined;
}

function createPool(): Pool {
  const config = env();
  return mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    connectionLimit: config.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    queueLimit: 0,
    // Money must never round-trip through a float. Return DECIMAL as a string
    // and parse it deliberately at the edge that needs a number.
    decimalNumbers: false,
    dateStrings: false,
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
  });
}

export function pool(): Pool {
  if (!globalThis.__sazunaPool) globalThis.__sazunaPool = createPool();
  return globalThis.__sazunaPool;
}

/**
 * Values a prepared statement accepts. Deliberately narrow: passing an object or
 * an arbitrary `unknown` to a placeholder is almost always a bug, and letting it
 * through is how `[object Object]` ends up in a WHERE clause.
 */
export type SqlParam = string | number | boolean | Date | Buffer | null;

/**
 * mysql2's `ExecuteValues` is not exported, so the cast is unavoidable. It is
 * confined to these three functions rather than leaking into every call site.
 */
type DriverValues = Parameters<Pool["execute"]>[1];

/** Typed SELECT. Returns rows only. */
export async function query<T extends RowDataPacket>(
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<T[]> {
  const [rows] = await pool().execute<T[]>(sql, params as DriverValues);
  return rows;
}

/** Typed single-row SELECT. Returns null rather than throwing on empty. */
export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE. Returns affected rows and insertId. */
export async function execute(
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<ResultSetHeader> {
  const [result] = await pool().execute<ResultSetHeader>(sql, params as DriverValues);
  return result;
}

/**
 * Run a set of statements in a transaction, rolling back on any throw.
 * Anything that writes more than one table must go through this — a half-written
 * order is worse than a failed one.
 */
export async function transaction<T>(
  work: (connection: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
