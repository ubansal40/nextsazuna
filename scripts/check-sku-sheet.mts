#!/usr/bin/env node
/**
 * Inventory-sheet (SKU autofill) parsing checks.
 *
 * This sheet fills purity and four weights into a product card, and the sale
 * price is then derived from those weights by a pricing rule. A column detected
 * one position out does not error — it quietly prices jewellery from the wrong
 * number. Hence the header-detection cases below.
 *
 * Run: npx tsx scripts/check-sku-sheet.mts
 */
import {
  detectColumns,
  parseSkuWeightSheet,
  parseSkuWeightCsv,
  parseWeight,
  normalisePurity,
  type Cell,
} from "../lib/admin/sku-sheet";

const checks: [string, boolean][] = [];
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* --- weights --------------------------------------------------------------- */

checks.push(
  ["a plain weight parses", parseWeight("12.345") === 12.345],
  ["thousands separators are stripped", parseWeight("1,234.5") === 1234.5],
  ["surrounding space is ignored", parseWeight("  7.2  ") === 7.2],
  ["blank is null, not zero", parseWeight("") === null && parseWeight(null) === null],
  ["text is null, never NaN", parseWeight("n/a") === null],
  ["a negative weight is refused", parseWeight("-5") === null],
  ["rounded to three decimals, matching DECIMAL(10,3)", parseWeight("1.23456") === 1.235],
);

/* --- purity ---------------------------------------------------------------- */

checks.push(
  ["a bare K becomes KT so it matches the vocabulary", normalisePurity("14K") === "14KT"],
  ["an existing KT is untouched", normalisePurity("18KT") === "18KT"],
  ["case is normalised", normalisePurity("9k") === "9KT"],
  ["blank purity is null", normalisePurity("") === null],
  ["a non-karat stamp passes through", normalisePurity("925") === "925"],
);

/* --- header detection ------------------------------------------------------ */

const withHeader: Cell[][] = [
  ["Tag No", "Desc", "Stamp", "Size", "Gr.Wt", "N.Wt", "Dia Wt", "Stn.Wt"],
  ["DGR-1", "Ring", "18K", "12", "5.5", "4.2", "0.35", "0.10"],
];
const detected = detectColumns(withHeader);
checks.push(
  ["a real header row is found", detected.headerRowIndex === 0],
  ["columns map to the header, not to positions", detected.columns.net_weight === 5 && detected.columns.purity === 2],
);

// The export routinely carries a title and a blank line above the header.
const offsetHeader: Cell[][] = [
  ["SAZUNA INVENTORY — MARCH"],
  [],
  ["SKU", "Purity", "Gross", "Net"],
  ["DGR-2", "22K", "9.100", "8.000"],
];
const offsetDetected = detectColumns(offsetHeader);
checks.push(
  ["a header below title rows is still found", offsetDetected.headerRowIndex === 2],
  ["its columns follow that header", offsetDetected.columns.net_weight === 3],
);

// A data row containing the word "net" must not be mistaken for a header.
const noHeader: Cell[][] = [["DGR-3", "Net chain", "18K", "", "3.0", "2.5", "0", "0"]];
checks.push([
  "a data row is not mistaken for a header",
  detectColumns(noHeader).headerRowIndex === -1,
]);
checks.push([
  "with no header, the reference's default column positions are used",
  detectColumns(noHeader).columns.gross_weight === 4 && detectColumns(noHeader).columns.sku === 0,
]);

/* --- rows ------------------------------------------------------------------ */

const sheet = parseSkuWeightSheet(withHeader);
checks.push(
  ["one row per SKU", sheet.rows.length === 1],
  ["the SKU is upper-cased", sheet.rows[0].sku === "DGR-1"],
  ["purity is normalised on the way in", sheet.rows[0].purity === "18KT"],
  [
    "all four weights are read from the right columns",
    eq(
      [sheet.rows[0].gross_weight, sheet.rows[0].net_weight, sheet.rows[0].diamond_weight, sheet.rows[0].stone_weight],
      [5.5, 4.2, 0.35, 0.1],
    ),
  ],
);

// A row with a SKU and nothing else must be dropped: storing it would make
// autofill CLEAR fields the admin had already typed.
const emptyRow = parseSkuWeightSheet([
  ["SKU", "Purity", "Gross", "Net"],
  ["DGR-4", "", "", ""],
]);
checks.push(
  ["a SKU with nothing to fill is skipped", emptyRow.rows.length === 0],
  ["and counted as skipped", emptyRow.skippedRows === 1],
);

// A corrected line appended at the bottom should win.
const duped = parseSkuWeightSheet([
  ["SKU", "Purity", "Gross", "Net"],
  ["DGR-5", "18K", "5.0", "4.0"],
  ["DGR-5", "18K", "5.5", "4.5"],
]);
checks.push([
  "a repeated SKU takes the LAST row, so an appended correction wins",
  duped.rows.length === 1 && duped.rows[0].net_weight === 4.5,
]);

checks.push([
  "a header repeated mid-file is not stored as a SKU",
  parseSkuWeightSheet([
    ["SKU", "Purity", "Gross", "Net"],
    ["DGR-6", "18K", "5.0", "4.0"],
    ["SKU", "Purity", "Gross", "Net"],
    ["DGR-7", "18K", "6.0", "5.0"],
  ]).rows.length === 2,
]);

/* --- CSV round trip -------------------------------------------------------- */

const csv = parseSkuWeightCsv('Tag No,Desc,Stamp,Size,Gr.Wt,N.Wt,Dia Wt,Stn.Wt\r\n"DGR-8","Ring, halo",18K,12,"1,005.5",4.2,0.35,0.1\r\n');
checks.push([
  "CSV: quoted comma survives and the weights land correctly",
  csv.rows.length === 1 && csv.rows[0].gross_weight === 1005.5 && csv.rows[0].purity === "18KT",
]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ SKU sheet checks FAILED — a column read one position out prices jewellery from the wrong number.");
}
process.exit(failed ? 1 : 0);
