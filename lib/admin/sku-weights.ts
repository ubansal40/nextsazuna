import "server-only";

import { query, queryOne, transaction } from "../db";
import type { RowDataPacket } from "mysql2";
import { recordAdminAction } from "./audit";
import { parseSkuWeightSheet, type SkuWeightRow } from "./sku-sheet";
import { readSheetRows } from "./stock";
import type { AdminContext } from "./rbac";

/**
 * The stored inventory sheet behind SKU autofill (migration 0015).
 *
 * One sheet is in force at a time: an upload replaces the previous one, exactly
 * as the old admin behaved. Staff think of it as "the current inventory list",
 * and merging uploads would leave stale weights alive with no way to see which
 * were which.
 */

const INSERT_BATCH = 500;

export interface SkuSheetStatus {
  count: number;
  fileName: string | null;
  uploadedAt: string | null;
}

export async function getSkuSheetStatus(): Promise<SkuSheetStatus> {
  const row = await queryOne<RowDataPacket & { n: number; source_file_name: string | null; source_uploaded_at: Date | null }>(
    `SELECT COUNT(*) AS n,
            MAX(source_file_name) AS source_file_name,
            MAX(source_uploaded_at) AS source_uploaded_at
       FROM sku_weight_overrides`,
  );
  return {
    count: Number(row?.n ?? 0),
    fileName: row?.source_file_name ?? null,
    uploadedAt: row?.source_uploaded_at ? new Date(row.source_uploaded_at).toISOString() : null,
  };
}

/** Parse an upload into rows. Reuses the stock sync's reader, which already
 *  handles .xlsx via read-excel-file and .csv via the in-repo RFC 4180 parser. */
export async function parseSkuSheetUpload(buffer: Buffer, fileName: string) {
  const rows = await readSheetRows(buffer, fileName);
  if (rows.length === 0) throw new Error("That file has no rows.");
  const sheet = parseSkuWeightSheet(rows);
  if (sheet.rows.length === 0) {
    throw new Error(
      "No usable rows were found. The sheet needs a SKU column and at least one weight or purity column.",
    );
  }
  return sheet;
}

/**
 * Replace the stored sheet.
 *
 * `DELETE` then insert inside one transaction, so autofill is never served from
 * a half-replaced table: a product saved mid-upload would otherwise take weights
 * from one sheet and purity from another.
 */
export async function replaceSkuWeights(
  admin: AdminContext,
  rows: readonly SkuWeightRow[],
  fileName: string,
): Promise<number> {
  const uploadedAt = new Date();
  return transaction(async (connection) => {
    await connection.execute("DELETE FROM sku_weight_overrides");

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const slice = rows.slice(i, i + INSERT_BATCH);
      const placeholders = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(",");
      const params = slice.flatMap((r) => [
        r.sku,
        r.gross_weight,
        r.net_weight,
        r.diamond_weight,
        r.stone_weight,
        r.purity,
        fileName.slice(0, 255),
        uploadedAt,
      ]);
      await connection.query(
        `INSERT INTO sku_weight_overrides
           (sku, gross_weight, net_weight, diamond_weight, stone_weight, purity, source_file_name, source_uploaded_at)
         VALUES ${placeholders}`,
        params,
      );
    }

    await recordAdminAction(connection, admin, {
      action: "sku_weights.upload",
      resourceType: "sku_weight_overrides",
      metadata: { fileName, rows: rows.length },
    });
    return rows.length;
  });
}

/** One SKU's stored weights, or null. Matched case-insensitively, because the
 *  sheet is upper-cased on the way in and an admin types however they type. */
export async function lookupSkuWeights(sku: string): Promise<SkuWeightRow | null> {
  const key = String(sku ?? "").trim().toUpperCase();
  if (!key) return null;
  const row = await queryOne<RowDataPacket & { sku: string; purity: string | null; gross_weight: string | null; net_weight: string | null; diamond_weight: string | null; stone_weight: string | null }>(
    `SELECT sku, purity, gross_weight, net_weight, diamond_weight, stone_weight
       FROM sku_weight_overrides WHERE sku = ? LIMIT 1`,
    [key],
  );
  if (!row) return null;
  const num = (v: string | null) => (v == null ? null : Number(v));
  return {
    sku: row.sku,
    purity: row.purity,
    gross_weight: num(row.gross_weight),
    net_weight: num(row.net_weight),
    diamond_weight: num(row.diamond_weight),
    stone_weight: num(row.stone_weight),
  };
}

/** Every SKU in the sheet, for the editor's datalist. Capped — this is a typing
 *  aid, not a catalogue browser. */
export async function listSheetSkus(limit = 2000): Promise<string[]> {
  const rows = await query<RowDataPacket & { sku: string }>(
    `SELECT sku FROM sku_weight_overrides ORDER BY sku LIMIT ${Math.min(Math.max(1, limit), 5000)}`,
  );
  return rows.map((r) => r.sku);
}
