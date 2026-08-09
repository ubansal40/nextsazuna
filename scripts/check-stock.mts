#!/usr/bin/env node
/**
 * Stock-sync parsing checks.
 *
 * The sync flips `is_active` across the entire catalogue from one uploaded
 * column, so a parser bug does not produce a wrong pixel — it takes the shop
 * offline. The CSV reader is hand-rolled (see `stock-parse.ts`), which earns it
 * an adversarial pass: quoted commas and newlines, escaped quotes, BOM, CR/CRLF,
 * and the inch-mark quote that appears mid-SKU in real jewellery data.
 *
 * Run: npx tsx scripts/check-stock.mts
 */
import { parseCsvRows, extractSkus, normaliseSku, MAX_SHEET_ROWS, type Cell } from "../lib/admin/stock-parse";

const checks: [string, boolean][] = [];
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* --- CSV shape ------------------------------------------------------------- */

checks.push(
  ["plain rows split on commas", eq(parseCsvRows("A,B\nC,D"), [["A", "B"], ["C", "D"]])],
  ["CRLF endings", eq(parseCsvRows("A,B\r\nC,D"), [["A", "B"], ["C", "D"]])],
  ["a lone CR still breaks the row", eq(parseCsvRows("A\rB"), [["A"], ["B"]])],
  ["a trailing newline adds no empty row", eq(parseCsvRows("A\nB\n"), [["A"], ["B"]])],
  ["a UTF-8 BOM is stripped from the first field", eq(parseCsvRows("﻿SAZ-1\n"), [["SAZ-1"]])],
  ["a quoted field keeps its comma", eq(parseCsvRows('"A,B",C'), [["A,B", "C"]])],
  ["a quoted field keeps its newline", eq(parseCsvRows('"line1\nline2",C'), [["line1\nline2", "C"]])],
  ['"" inside quotes is one literal quote', eq(parseCsvRows('"say ""hi""",C'), [['say "hi"', "C"]])],
  ["a quote mid-field is literal, not a delimiter", eq(parseCsvRows('5" chain,C'), [['5" chain', "C"]])],
  ["empty fields survive", eq(parseCsvRows("A,,C"), [["A", "", "C"]])],
  ["empty input yields no rows", eq(parseCsvRows(""), [])],
);

/* --- SKU normalisation ----------------------------------------------------- */

checks.push(
  ["lower case is upper-cased", normaliseSku("saz-ring-01") === "SAZ-RING-01"],
  ["surrounding whitespace goes", normaliseSku("  SAZ-1\t") === "SAZ-1"],
  ["internal whitespace collapses", normaliseSku("SAZ  001") === "SAZ 001"],
  ["an integer cell does not become exponent notation", normaliseSku(12345678901) === "12345678901"],
  ["a float cell keeps its point", normaliseSku(12.5) === "12.5"],
  ["a date cell is not a SKU", normaliseSku(new Date("2026-01-01")) === ""],
  ["a boolean cell is not a SKU", normaliseSku(true) === ""],
  ["null and undefined are not SKUs", normaliseSku(null) === "" && normaliseSku(undefined) === ""],
  ["an absurdly long value is capped", normaliseSku("X".repeat(500)).length === 120],
);

/* --- column A extraction --------------------------------------------------- */

const basic = extractSkus([["SKU", "Qty"], ["saz-1", 5], ["SAZ-2", 0], ["", 9], ["saz-1", 1]]);
checks.push(
  ["the header row is dropped", !basic.skus.includes("SKU")],
  ["column A only, upper-cased", eq(basic.skus, ["SAZ-1", "SAZ-2"])],
  ["a blank row is skipped, not counted as a SKU", basic.skippedRows === 2],
  ["a repeat of the same SKU is counted once", basic.duplicateRows === 1],
  ["totalRows counts every row given", basic.totalRows === 5],
);

const midFileHeader = extractSkus([["Item Code"], ["A-1"], ["ITEM CODE"], ["A-2"]]);
checks.push(
  ["a header repeated mid-file is dropped too", eq(midFileHeader.skus, ["A-1", "A-2"])],
);

// Only column A matters — a SKU sitting in column B is not picked up.
checks.push(
  ["a value in column B is ignored", eq(extractSkus([["", "SAZ-9"]]).skus, [])],
  ["an all-header sheet yields nothing, without throwing", eq(extractSkus([["SKU"], ["sku"]]).skus, [])],
);

// The row ceiling is enforced, and enforced at the boundary rather than near it.
const atLimit: Cell[][] = Array.from({ length: MAX_SHEET_ROWS }, (_, i) => [`S-${i}`]);
let limitHeld = false;
try {
  extractSkus([...atLimit, ["S-over"]]);
} catch {
  limitHeld = true;
}
checks.push(
  ["a sheet at exactly the ceiling is accepted", extractSkus(atLimit).skus.length === MAX_SHEET_ROWS],
  ["one row over the ceiling is refused", limitHeld],
);

/* --- the two halves agree -------------------------------------------------- */

const roundTrip = extractSkus(parseCsvRows('SKU\r\n"SAZ,01"\nsaz-02\n\nSAZ-02\n'));
checks.push([
  "CSV → extract round-trip: header dropped, quoted comma kept, dupe collapsed",
  eq(roundTrip.skus, ["SAZ,01", "SAZ-02"]),
]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ stock parsing checks FAILED — this parser decides what stays published.");
}
process.exit(failed ? 1 : 0);
