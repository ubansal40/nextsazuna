import { parseCsvRows, type Cell } from "./stock-parse";

/** Re-exported so the check script and callers have one import for the sheet. */
export type { Cell };

/**
 * The inventory sheet that powers SKU autofill in the product editor.
 *
 * Pure, and deliberately free of `server-only`, so `scripts/check-sku-sheet.mts`
 * can hammer it. The workshop's export is the same file the old admin took, so
 * the header aliases and the default column positions are sazuna-unik 2's
 * verbatim — a sheet that worked there works here.
 *
 * Note this is the OPPOSITE of `stock-parse.ts`. Stock sync wants column A and
 * nothing else, and a SKU-only row is meaningful there. Here a row with a SKU
 * and no weights carries nothing to autofill, so it is skipped. Two readers,
 * two jobs; sharing one would make both wrong.
 */

/** Header text -> field. Compared after stripping non-alphanumerics. */
const HEADER_ALIASES: Record<SkuField, ReadonlySet<string>> = {
  sku: new Set(["sku", "tagno", "tagnumber", "tagstock", "stockcode", "productcode"]),
  purity: new Set(["purity", "stamp", "karat", "carat", "kt"]),
  gross_weight: new Set(["grosswt", "grossweight", "grwt", "grweight", "gross"]),
  net_weight: new Set(["netwt", "netweight", "nwt", "net"]),
  diamond_weight: new Set(["diawt", "diaweight", "diamondwt", "diamondweight", "dwt", "dia"]),
  stone_weight: new Set(["stnwt", "stnweight", "stonewt", "stoneweight", "stwt", "stone"]),
};

/** Where the columns sit when a sheet has no recognisable header row. */
const COLUMN_DEFAULTS: Record<SkuField, number> = {
  sku: 0,
  purity: 2,
  gross_weight: 4,
  net_weight: 5,
  diamond_weight: 6,
  stone_weight: 7,
};

export type SkuField = "sku" | "purity" | "gross_weight" | "net_weight" | "diamond_weight" | "stone_weight";

const FIELDS: SkuField[] = ["sku", "purity", "gross_weight", "net_weight", "diamond_weight", "stone_weight"];

export interface SkuWeightRow {
  sku: string;
  purity: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  diamond_weight: number | null;
  stone_weight: number | null;
}

function headerToken(value: Cell): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Weights arrive with thousands separators and stray spaces. Three decimals,
 *  matching the DECIMAL(10,3) columns. */
export function parseWeight(value: Cell): number | null {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}

/**
 * "Stamp" cells read `14K` / `9K`; the product purity vocabulary uses `14KT` /
 * `9KT`. A trailing bare K becomes KT so the autofilled value actually matches
 * an entry in the vocabulary — otherwise the field fills with something the
 * purity select cannot represent.
 */
export function normalisePurity(value: Cell): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  const mapped = raw.endsWith("K") && !raw.endsWith("KT") ? `${raw}T` : raw;
  return mapped.slice(0, 20);
}

export interface ColumnDetection {
  columns: Record<SkuField, number>;
  /** Index of the recognised header row, or -1 when none was found. */
  headerRowIndex: number;
}

/**
 * Find the header row and map each field to its column.
 *
 * The first twenty rows are scanned, because these exports routinely carry a
 * title and a blank line above the real header. A row counts as the header when
 * it names at least the SKU column plus one other field; anything weaker and a
 * data row containing the word "net" would be mistaken for one.
 */
export function detectColumns(rows: readonly (readonly Cell[])[]): ColumnDetection {
  for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const found: Partial<Record<SkuField, number>> = {};
    row.forEach((cell, index) => {
      const token = headerToken(cell);
      if (!token) return;
      for (const field of FIELDS) {
        if (found[field] === undefined && HEADER_ALIASES[field].has(token)) found[field] = index;
      }
    });
    if (found.sku !== undefined && Object.keys(found).length >= 2) {
      return { columns: { ...COLUMN_DEFAULTS, ...found }, headerRowIndex: r };
    }
  }
  return { columns: { ...COLUMN_DEFAULTS }, headerRowIndex: -1 };
}

export interface SkuWeightSheet {
  rows: SkuWeightRow[];
  totalRows: number;
  skippedRows: number;
}

/**
 * Parse a sheet into one row per SKU.
 *
 * Later rows win on a duplicate SKU — a corrected line appended to the bottom of
 * an export is the common case, and it should be the one that takes effect.
 * A row with a SKU but nothing to fill is skipped: storing it would make
 * autofill clear the fields an admin had already typed.
 */
export function parseSkuWeightSheet(rows: readonly (readonly Cell[])[]): SkuWeightSheet {
  const { columns, headerRowIndex } = detectColumns(rows);
  const start = headerRowIndex + 1;
  const bySku = new Map<string, SkuWeightRow>();
  let skippedRows = 0;

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) {
      skippedRows += 1;
      continue;
    }
    const sku = String(row[columns.sku] ?? "").trim().toUpperCase().slice(0, 80);
    // A repeated header mid-file is not a SKU.
    if (!sku || HEADER_ALIASES.sku.has(headerToken(sku))) {
      skippedRows += 1;
      continue;
    }

    const entry: SkuWeightRow = {
      sku,
      purity: normalisePurity(row[columns.purity]),
      gross_weight: parseWeight(row[columns.gross_weight]),
      net_weight: parseWeight(row[columns.net_weight]),
      diamond_weight: parseWeight(row[columns.diamond_weight]),
      stone_weight: parseWeight(row[columns.stone_weight]),
    };

    const hasSomething =
      entry.purity !== null ||
      entry.gross_weight !== null ||
      entry.net_weight !== null ||
      entry.diamond_weight !== null ||
      entry.stone_weight !== null;
    if (!hasSomething) {
      skippedRows += 1;
      continue;
    }
    bySku.set(sku, entry);
  }

  return { rows: [...bySku.values()], totalRows: Math.max(0, rows.length - start), skippedRows };
}

/** CSV convenience, reusing the RFC 4180 reader the stock sync already proves. */
export function parseSkuWeightCsv(text: string): SkuWeightSheet {
  return parseSkuWeightSheet(parseCsvRows(text));
}
