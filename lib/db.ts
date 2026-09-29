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
    /**
     * `execute` prepares every distinct SQL text once per connection and keeps
     * it open on the server. mysql2's default cache is 16,000 per connection,
     * and listing pages interpolate LIMIT/OFFSET, so each page of each sort and
     * filter combination is a new statement that is never closed. The server's
     * `max_prepared_stmt_count` is 16,382 for the WHOLE server — shared with
     * every other tenant on shared hosting — and once it is reached every new
     * statement fails with error 1461. A small LRU closes the oldest instead.
     */
    maxPreparedStatements: 256,
    // Money must never round-trip through a float. Return DECIMAL as a string
    // and parse it deliberately at the edge that needs a number.
    decimalNumbers: false,
    dateStrings: false,
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
  });
}

export function pool(): Pool {
  if (!globalThis.__sazunaPool) {
    const created = createPool();
    /*
     * `timezone: "Z"` only tells the driver how to turn JS Dates into strings
     * and back; it does not change the session. The session keeps the server's
     * own `time_zone`, which decides how TIMESTAMP columns read and what NOW()
     * and CURDATE() mean. On a server that is not on UTC every created_at
     * would come back shifted by its offset, and every Date bound into a query
     * would compare against the wrong instant. Pinning each new connection to
     * UTC makes the driver's assumption true instead of a matter of luck. It
     * is queued on the connection, so it runs before anything the app sends.
     *
     * On the core pool: that is where the connection is created, and its event
     * hands over the callback-style connection its typings describe.
     */
    created.pool.on("connection", (connection) => {
      connection.query("SET time_zone = '+00:00'", (error: Error | null) => {
        if (error) console.error("[db] could not pin the session time zone to UTC", error);
      });
    });
    globalThis.__sazunaPool = created;
  }
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
