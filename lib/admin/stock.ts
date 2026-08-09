import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { readSheet } from "read-excel-file/node";
import { transaction } from "../db";
import { recordAdminAction } from "./audit";
import { extractSkus, parseCsvRows, type Cell, type SkuSheet } from "./stock-parse";
import type { AdminContext } from "./rbac";

/**
 * Stock management — publish what the ERP export lists, draft everything else.
 *
 * The behaviour is sazuna-unik 2's: for every product NOT marked
 * `always_available`, `is_active` becomes 1 if its SKU appears in the sheet and
 * 0 if it doesn't, in one atomic CASE update. Uploaded SKUs go into a
 * connection-scoped MEMORY temp table so a 50,000-row sheet doesn't blow the
 * prepared-statement parameter limit.
 *
 * What this adds over the reference is the **dry run**: the spec insists the
 * admin sees the damage before doing it, and this sync can take the entire shop
 * offline from one wrong column. The dry run runs the very same counting
 * queries as the apply and then simply doesn't issue the UPDATE.
 *
 * Storefront pages are `force-dynamic`, so there is no cache to invalidate —
 * the change is live on the next request.
 */

/** Never return more unmatched SKUs than a person can act on; the count is exact. */
const UNMATCHED_SAMPLE_CAP = 500;

/** Insert the uploaded SKUs in chunks rather than one statement per SKU. */
const INSERT_BATCH = 1000;

/**
 * Fraction of the sellable catalogue that going dark counts as alarming. The
 * spec's "This would draft X% of the catalogue" warning; the reference had no
 * such guard, which is how a partial export silently unpublishes a shop.
 */
const BIG_DRAFT_SHARE = 0.3;

export interface StockPlan {
  /** Distinct SKUs read from column A. */
  skuCount: number;
  totalRows: number;
  skippedRows: number;
  duplicateRows: number;
  /** Products that would change state. */
  willPublish: number;
  willDraft: number;
  /** Products in each state once applied. */
  publishedAfter: number;
  draftedAfter: number;
  /** `always_available` products, untouched either way. */
  exempt: number;
  /** Non-exempt products — the population this sync governs. */
  governed: number;
  /** Uploaded SKUs with no product in the catalogue. */
  unmatched: number;
  unmatchedSkus: string[];
  /** True when the file would draft an alarming share of the catalogue. */
  bigDraftWarning: boolean;
  draftSharePct: number;
}

/** Read an upload into raw sheet rows. Extension decides the reader. */
export async function readSheetRows(buffer: Buffer, filename: string): Promise<Cell[][]> {
  if (!buffer?.length) throw new Error("That file is empty.");
  if (/\.csv$/i.test(filename)) {
    try {
      return parseCsvRows(buffer.toString("utf8"));
    } catch {
      throw new Error("That CSV could not be read.");
    }
  }
  try {
    // `readSheet` (not the default export, which returns every sheet wrapped in
    // `{sheet, data}`) yields the first sheet's rows — the reference read the
    // first sheet too, and an ERP export puts the inventory on it.
    return (await readSheet(buffer)) as unknown as Cell[][];
  } catch {
    throw new Error("That spreadsheet could not be read. Save it as .xlsx or .csv and try again.");
  }
}

/** Parse an upload all the way to the distinct SKU list. */
export async function readSkuSheet(buffer: Buffer, filename: string): Promise<SkuSheet> {
  const rows = await readSheetRows(buffer, filename);
  if (rows.length === 0) throw new Error("That file has no rows.");
  const sheet = extractSkus(rows);
  if (sheet.skus.length === 0) {
    throw new Error("No SKUs were found in column A. Check that the first column holds SKUs.");
  }
  return sheet;
}

/**
 * Load the SKUs into a connection-scoped MEMORY temp table and run `work`
 * against it. Dropped in a `finally` so a pooled connection is never handed on
 * still carrying the table.
 */
async function withSkuTable<T>(
  skus: readonly string[],
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  return transaction(async (connection) => {
    // CREATE/DROP TEMPORARY TABLE does not force an implicit commit, so this is
    // safe inside the transaction that the apply also writes through.
    await connection.query("DROP TEMPORARY TABLE IF EXISTS _stock_sync_skus");
    await connection.query(
      "CREATE TEMPORARY TABLE _stock_sync_skus (sku VARCHAR(120) PRIMARY KEY) ENGINE=MEMORY",
    );
    try {
      for (let i = 0; i < skus.length; i += INSERT_BATCH) {
        const slice = skus.slice(i, i + INSERT_BATCH);
        await connection.query(
          `INSERT IGNORE INTO _stock_sync_skus (sku) VALUES ${slice.map(() => "(?)").join(",")}`,
          slice,
        );
      }
      return await work(connection);
    } finally {
      await connection.query("DROP TEMPORARY TABLE IF EXISTS _stock_sync_skus");
    }
  });
}

/** One `SELECT COUNT(*)`, unwrapped. */
async function count(connection: PoolConnection, sql: string): Promise<number> {
  const [rows] = await connection.query<(RowDataPacket & { n: number })[]>(sql);
  return Number(rows[0]?.n ?? 0);
}

/**
 * The counts behind both the preview and the result. `UPPER(p.sku)` matches the
 * uploaded SKUs, which the parser upper-cases, so a lower-case sheet does not
 * silently miss every product.
 */
async function computePlan(connection: PoolConnection, sheet: SkuSheet): Promise<StockPlan> {
  const IN_SHEET = "UPPER(p.sku) IN (SELECT sku FROM _stock_sync_skus)";
  const GOVERNED = "p.always_available = 0";

  const [publishedAfter, draftedAfter, willPublish, willDraft, exempt, unmatched] = await Promise.all([
    count(connection, `SELECT COUNT(*) n FROM products p WHERE ${GOVERNED} AND ${IN_SHEET}`),
    count(connection, `SELECT COUNT(*) n FROM products p WHERE ${GOVERNED} AND NOT ${IN_SHEET}`),
    count(connection, `SELECT COUNT(*) n FROM products p WHERE ${GOVERNED} AND ${IN_SHEET} AND p.is_active = 0`),
    count(connection, `SELECT COUNT(*) n FROM products p WHERE ${GOVERNED} AND NOT ${IN_SHEET} AND p.is_active = 1`),
    count(connection, "SELECT COUNT(*) n FROM products p WHERE p.always_available = 1"),
    count(
      connection,
      "SELECT COUNT(*) n FROM _stock_sync_skus s WHERE s.sku NOT IN (SELECT UPPER(sku) FROM products)",
    ),
  ]);

  const [sample] = await connection.query<(RowDataPacket & { sku: string })[]>(
    `SELECT s.sku FROM _stock_sync_skus s
      WHERE s.sku NOT IN (SELECT UPPER(sku) FROM products)
      ORDER BY s.sku LIMIT ${UNMATCHED_SAMPLE_CAP}`,
  );

  const governed = publishedAfter + draftedAfter;
  const draftShare = governed > 0 ? willDraft / governed : 0;

  return {
    skuCount: sheet.skus.length,
    totalRows: sheet.totalRows,
    skippedRows: sheet.skippedRows,
    duplicateRows: sheet.duplicateRows,
    willPublish,
    willDraft,
    publishedAfter,
    draftedAfter,
    exempt,
    governed,
    unmatched,
    unmatchedSkus: sample.map((r) => r.sku),
    bigDraftWarning: draftShare > BIG_DRAFT_SHARE,
    draftSharePct: Math.round(draftShare * 100),
  };
}

/**
 * What applying this sheet would do. Runs the real queries against the real
 * catalogue and writes nothing — no UPDATE is issued and the only DDL is the
 * temp table, which is dropped before the connection goes back to the pool.
 */
export async function dryRunStockSync(sheet: SkuSheet): Promise<StockPlan> {
  return withSkuTable(sheet.skus, (connection) => computePlan(connection, sheet));
}

/**
 * Apply the sheet. The counts are computed BEFORE the update, in the same
 * transaction, so the reported numbers describe exactly the rows this statement
 * changed rather than a re-read that a concurrent edit could have moved.
 *
 * One atomic CASE update, so there is no partial outcome to report: it commits
 * whole or rolls back whole.
 */
export async function applyStockSync(
  admin: AdminContext,
  sheet: SkuSheet,
  fileName: string,
): Promise<StockPlan> {
  return withSkuTable(sheet.skus, async (connection) => {
    const plan = await computePlan(connection, sheet);

    await connection.query(
      `UPDATE products p
          SET p.is_active = CASE
            WHEN UPPER(p.sku) IN (SELECT sku FROM _stock_sync_skus) THEN 1
            ELSE 0
          END
        WHERE p.always_available = 0`,
    );

    await recordAdminAction(connection, admin, {
      action: "stock.sync",
      resourceType: "products",
      metadata: {
        fileName,
        skuCount: plan.skuCount,
        published: plan.willPublish,
        drafted: plan.willDraft,
        exempt: plan.exempt,
        unmatched: plan.unmatched,
      },
    });

    return plan;
  });
}
