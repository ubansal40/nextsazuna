/**
 * Inventory-sheet parsing — the pure half of the stock sync.
 *
 * Deliberately free of `import "server-only"` and of any database or file
 * access, so `scripts/check-stock.mts` can hammer it directly. The server-only
 * half (`stock.ts`) reads the upload and runs the SQL.
 *
 * **A deliberate divergence from sazuna-unik 2.** The reference's stock sync
 * reuses its SKU-weights parser, which drops any row carrying no weight or
 * purity — so a plain one-column inventory export parses to nothing and the
 * upload is rejected as empty. The spec asks for "SKU in column A", and a
 * stock list legitimately has nothing else in it, so this reads column A and
 * nothing more.
 */

/** The spec's stated ceiling: ".xlsx or .csv · SKU in column A · up to 50,000 rows". */
export const MAX_SHEET_ROWS = 50_000;

/**
 * Values that are a column heading rather than a SKU. Compared after
 * normalisation, and checked on every row (not just the first) because exports
 * that concatenate several sheets repeat their header mid-file.
 */
const HEADER_TOKENS = new Set([
  "SKU",
  "SKUS",
  "SKU CODE",
  "SKUCODE",
  "SKU NO",
  "SKU NUMBER",
  "ITEM",
  "ITEM CODE",
  "ITEMCODE",
  "ITEM NO",
  "PRODUCT",
  "PRODUCT CODE",
  "PRODUCT SKU",
  "STYLE",
  "STYLE CODE",
  "CODE",
  "BARCODE",
  "DESIGN",
  "DESIGN CODE",
]);

/**
 * A sheet cell as it reaches us: `read-excel-file` yields real JS types, so a
 * numeric SKU arrives as a number and a date-shaped one as a Date.
 */
export type Cell = string | number | boolean | Date | null | undefined;

/**
 * Normalise one cell into a comparable SKU, or "" if it isn't one.
 *
 * Uppercased because the match against the catalogue is `UPPER(p.sku)`, so a
 * sheet in lower case must not silently miss every product. Numbers are
 * stringified without exponent notation — a SKU column typed as numeric in
 * Excel would otherwise arrive as `1.2345e+7`. Internal whitespace collapses so
 * `"SAZ  001"` and `"SAZ 001"` are the same SKU.
 */
export function normaliseSku(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return "";
  if (typeof value === "boolean") return "";
  const raw =
    typeof value === "number"
      ? Number.isInteger(value)
        ? value.toFixed(0)
        : String(value)
      : String(value);
  return raw.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 120);
}

export interface SkuSheet {
  /** Distinct SKUs in first-seen order. */
  skus: string[];
  /** Rows examined, headers included. */
  totalRows: number;
  /** Rows with no usable SKU in column A (blank, header, or a stray type). */
  skippedRows: number;
  /** SKUs that appeared more than once; the duplicate occurrences. */
  duplicateRows: number;
}

/**
 * Pull the distinct SKU list out of a sheet's rows.
 *
 * Throws only for a sheet larger than the stated ceiling — an empty result is
 * returned as data, not an exception, so the caller can tell the admin *why*
 * (all blank vs. all headers) rather than just "failed".
 */
export function extractSkus(rows: readonly (readonly Cell[])[]): SkuSheet {
  if (rows.length > MAX_SHEET_ROWS) {
    throw new Error(`That file has ${rows.length.toLocaleString("en-IN")} rows — the limit is ${MAX_SHEET_ROWS.toLocaleString("en-IN")}.`);
  }

  const seen = new Set<string>();
  const skus: string[] = [];
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const row of rows) {
    const sku = normaliseSku(Array.isArray(row) ? row[0] : undefined);
    if (!sku || HEADER_TOKENS.has(sku)) {
      skippedRows += 1;
      continue;
    }
    if (seen.has(sku)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(sku);
    skus.push(sku);
  }

  return { skus, totalRows: rows.length, skippedRows, duplicateRows };
}

/**
 * Parse CSV text into rows, to RFC 4180.
 *
 * Hand-rolled rather than adding a second dependency, because the sync needs
 * exactly one thing from a CSV — column A — and the tricky parts are few and
 * fully covered by `scripts/check-stock.mts`: quoted fields containing commas
 * or newlines, `""` as an escaped quote, a UTF-8 BOM, and CRLF/CR/LF endings.
 * A quote is only special at the start of a field, so an unquoted `5" chain`
 * survives intact.
 */
export function parseCsvRows(text: string): Cell[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: Cell[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStart = true;
  let sawAny = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStart = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    sawAny = true;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r") {
      // Swallow the LF of a CRLF pair; a lone CR is still a row break.
      if (input[i + 1] === "\n") i += 1;
      endRow();
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    field += ch;
    fieldStart = false;
  }

  // A trailing newline ends the last row; anything else leaves one open.
  if (field !== "" || row.length > 0 || (sawAny && rows.length === 0)) endRow();

  return rows;
}
