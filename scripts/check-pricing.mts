#!/usr/bin/env node
/**
 * Pricing formula + matcher checks.
 *
 * The formula is author-supplied and evaluated, so the sandbox is a security
 * boundary — this asserts it computes real formulas correctly AND refuses every
 * way an expression could try to reach beyond arithmetic. Matched to
 * sazuna-unik 2's pricing engine.
 *
 * Run: npx tsx scripts/check-pricing.mts
 */
import {
  MRP_MULTIPLIER,
  computeRulePrice,
  evaluateFormula,
  findMatchingRule,
  formulaError,
  keepOneDot,
  mrpFromSalePrice,
  wholeRupees,
} from "../lib/admin/pricing";
import { OFF_VOCABULARY_SUFFIX, withCurrentValue, withValuesInUse } from "../lib/admin/vocab-options";

const checks: [string, boolean][] = [];
const approx = (a: number, b: number) => Math.abs(a - b) < 0.001;

// --- evaluation ---
checks.push(
  ["a weight formula computes", approx(evaluateFormula("net_weight * 9800", { net_weight: 3 }), 29400)],
  ["multiple variables combine", approx(evaluateFormula("net_weight * 9800 + diamond_weight * 82000", { net_weight: 2, diamond_weight: 0.5 }), 60600)],
  ["parentheses and aliases work", approx(evaluateFormula("(gross + stone) * 2", { gross_weight: 4, stone_weight: 1 }), 10)],
  ["a missing variable is zero", approx(evaluateFormula("net_weight * 100", {}), 0)],
  ["the short alias resolves", approx(evaluateFormula("net * 10", { net_weight: 5 }), 50)],
);

// --- the sandbox refuses everything non-arithmetic ---
function rejected(expr: string): boolean {
  try {
    evaluateFormula(expr, { net_weight: 1, gross_weight: 1, diamond_weight: 1, stone_weight: 1 });
    return false;
  } catch {
    return true;
  }
}
checks.push(
  ["rejects a global reference", rejected("process")],
  ["rejects constructor access", rejected("net_weight.constructor")],
  ["rejects a method call", rejected("net_weight.toString()")],
  ["rejects a statement injection", rejected("1; globalThis.x = 1")],
  ["rejects bracket access", rejected("[].constructor")],
  ["rejects a bare identifier", rejected("gross_weightt")],
  ["rejects a ternary (: not allowed)", rejected("net_weight ? 1 : 2")],
  ["rejects an empty formula", rejected("")],
  ["rejects scientific notation (e is alphabetic)", rejected("1e3")],
  ["a plainly valid formula is accepted", !rejected("net_weight * 9800 * 1.14")],
);

// --- formulaError ---
checks.push(
  ["formulaError is null for a valid formula", formulaError("net_weight * 100") === null],
  ["formulaError returns a message for an invalid one", typeof formulaError("net.toFixed(2)") === "string"],
);

// --- the matcher ---
const rules = [
  { material: "Gold", purity: "18KT", category_id: 5, formula: "net_weight * 12000", priority: 1 },
  { material: "Gold", purity: null, category_id: null, formula: "net_weight * 9800", priority: 2 },
  { material: null, purity: null, category_id: null, formula: "net_weight * 5000", priority: 3 },
];

checks.push(
  [
    "the most specific matching rule wins (priority order)",
    findMatchingRule(rules, { material: "Gold", purity: "18KT", categoryIds: [5] })?.formula === "net_weight * 12000",
  ],
  [
    "a null condition means any — the gold rule matches a different purity",
    findMatchingRule(rules, { material: "Gold", purity: "22KT", categoryIds: [9] })?.formula === "net_weight * 9800",
  ],
  [
    "the catch-all matches when nothing else does",
    findMatchingRule(rules, { material: "Silver", purity: "925", categoryIds: [] })?.formula === "net_weight * 5000",
  ],
  [
    "a rule's category matches any of the product's categories",
    findMatchingRule(rules, { material: "Gold", purity: "18KT", categoryIds: [1, 5, 9] })?.formula === "net_weight * 12000",
  ],
  [
    "material matching is case-insensitive",
    findMatchingRule(rules, { material: "gold", purity: "18kt", categoryIds: [5] })?.formula === "net_weight * 12000",
  ],
);

// --- computeRulePrice ---
checks.push(
  ["computeRulePrice returns a fixed-2 string", computeRulePrice(rules, { material: "Gold", purity: null, categoryIds: [], net_weight: 3 }) === "29400.00"],
  ["computeRulePrice is null when no rule matches", computeRulePrice([], { material: "Gold", purity: null, categoryIds: [], net_weight: 3 }) === null],
);


/* --- weight ranges (migration 0014) ---------------------------------------- */

// Two rules on identical attributes, separated only by a net-weight band. This
// is the case the ranges exist for: before them, priority alone decided and the
// heavy band was unreachable.
const banded = [
  { material: null, purity: null, category_id: null, formula: "net_weight * 1000", net_weight: { min: null, max: 5 } },
  { material: null, purity: null, category_id: null, formula: "net_weight * 2000", net_weight: { min: 5, max: null } },
];
const light = { material: null, purity: null, categoryIds: [], net_weight: 3 };
const heavy = { material: null, purity: null, categoryIds: [], net_weight: 9 };

checks.push(
  ["a light piece takes the light band", findMatchingRule(banded, light)?.formula === "net_weight * 1000"],
  ["a heavy piece takes the heavy band", findMatchingRule(banded, heavy)?.formula === "net_weight * 2000"],
  [
    "a bound is inclusive, so priority breaks the tie at the boundary",
    findMatchingRule(banded, { material: null, purity: null, categoryIds: [], net_weight: 5 })?.formula ===
      "net_weight * 1000",
  ],
  [
    "an open-ended minimum means 'over'",
    findMatchingRule(
      [{ material: null, purity: null, category_id: null, formula: "x", gross_weight: { min: 10, max: null } }],
      { material: null, purity: null, categoryIds: [], gross_weight: 50 },
    ) !== null,
  ],
  [
    "a weight below an open-ended minimum does not match",
    findMatchingRule(
      [{ material: null, purity: null, category_id: null, formula: "x", gross_weight: { min: 10, max: null } }],
      { material: null, purity: null, categoryIds: [], gross_weight: 2 },
    ) === null,
  ],
  [
    "a rule with no ranges still matches anything",
    findMatchingRule(
      [{ material: null, purity: null, category_id: null, formula: "x" }],
      { material: null, purity: null, categoryIds: [], net_weight: 7 },
    ) !== null,
  ],
  [
    "a null/null range is treated as 'ignore', not as zero",
    findMatchingRule(
      [{ material: null, purity: null, category_id: null, formula: "x", net_weight: { min: null, max: null } }],
      { material: null, purity: null, categoryIds: [], net_weight: 7 },
    ) !== null,
  ],
  [
    "a product with NO weight does not match a banded rule",
    findMatchingRule(
      [{ material: null, purity: null, category_id: null, formula: "x", diamond_weight: { min: 0.5, max: 2 } }],
      { material: null, purity: null, categoryIds: [] },
    ) === null,
  ],
  [
    "ranges compose with attribute conditions",
    findMatchingRule(
      [{ material: "gold", purity: null, category_id: null, formula: "x", net_weight: { min: 1, max: 4 } }],
      { material: "Silver", purity: null, categoryIds: [], net_weight: 2 },
    ) === null,
  ],
);

/* --- MRP ------------------------------------------------------------------
 * Every product lists at double and sells at half, so this one multiplication
 * is the struck-through price on every card in the shop. It is written on every
 * save, which means a wrong answer here silently re-prices the catalogue one
 * product at a time.
 */
checks.push(
  ["the MRP is twice the selling price", mrpFromSalePrice("1400") === "2800.00"],
  ["...from a DECIMAL string too", mrpFromSalePrice("1400.00") === "2800.00"],
  ["...and from a number", mrpFromSalePrice(51500) === "103000.00"],
  ["the multiplier is 2, and the sums above agree with it", MRP_MULTIPLIER === 2],
  ["the MRP is stored scale-2, as the column is", /^\d+\.00$/.test(mrpFromSalePrice("999"))],
  ["a half rupee rounds before doubling, never to an odd paisa", mrpFromSalePrice("1400.50") === "2802.00"],
  // A zero MRP beside a real sale price would draw as an infinite discount.
  ["a zero sale price yields no MRP rather than a nonsense one", mrpFromSalePrice("0") === "0.00"],
  ["rubbish yields no MRP", mrpFromSalePrice("abc") === "0.00" && mrpFromSalePrice("") === "0.00"],
  ["the MRP always sits above the sale price, so a markdown is never a markup", Number(mrpFromSalePrice("1")) > 1],
);

/* --- typing a price ------------------------------------------------------
 * The field is whole rupees, but the point must survive keystroke by keystroke.
 * Stripping it on change turns "5500.75" into "550075" — a hundredfold price on
 * a piece of jewellery, typed by someone who entered exactly what they meant.
 */
checks.push(
  ["a decimal point survives while typing", keepOneDot("5500.75") === "5500.75"],
  ["a trailing point survives, so the next digit lands after it", keepOneDot("5500.") === "5500."],
  ["...so typing it out never multiplies the price by a hundred", keepOneDot(keepOneDot("5500.") + "7") === "5500.7"],
  ["a second point is refused rather than making the number unparseable", keepOneDot("55.00.75") === "55.0075"],
  ["letters and symbols are dropped", keepOneDot("रु 5,500.75") === "5500.75"],
  ["and blur settles it to whole rupees", wholeRupees(keepOneDot("5500.75")) === "5501"],
);

checks.push(
  ["a DECIMAL price loses its trailing zeroes for the editor", wholeRupees("1400.00") === "1400"],
  ["...and a fraction rounds rather than truncating", wholeRupees("1400.60") === "1401"],
  ["a blank price stays blank — an empty field is not a zero", wholeRupees("") === "" && wholeRupees(null) === ""],
  ["rubbish is blank, never NaN", wholeRupees("abc") === ""],
  ["a zero price is shown, not swallowed", wholeRupees("0.00") === "0"],
);

/* --- the vocabulary a rule is edited against ------------------------------
 * A rule's material and purity are picked from the taxonomy, but the taxonomy
 * changes and the rule does not. A <select> whose value matches no <option>
 * silently renders the first one, so the screen would show "Any material" for a
 * rule that actually matches "Yellow Gold" — a condition misread, with nothing
 * thrown and nothing logged. The live rule YG14 is exactly this shape.
 */
const VOCAB = ["Yellow Gold", "White Gold", "Silver"];

checks.push(
  [
    "the vocabulary is offered in the order it is given, not re-sorted",
    withCurrentValue(VOCAB, "").map((o) => o.value).join(",") === "Yellow Gold,White Gold,Silver",
  ],
  [
    "a stored value that is still in the taxonomy adds no duplicate",
    withCurrentValue(VOCAB, "Silver").length === VOCAB.length,
  ],
  [
    "a stored value that has left the taxonomy is still offered",
    withCurrentValue(VOCAB, "Gold").some((o) => o.value === "Gold"),
  ],
  [
    "...and says so, so it reads as history rather than a choice",
    withCurrentValue(VOCAB, "Gold").at(-1)?.label === `Gold${OFF_VOCABULARY_SUFFIX}`,
  ],
  [
    "...while still posting the exact string the column stores",
    withCurrentValue(VOCAB, "Gold").at(-1)?.value === "Gold",
  ],
  [
    "an empty value adds nothing — each screen words its own empty choice",
    withCurrentValue(VOCAB, "").length === VOCAB.length,
  ],
  [
    "whitespace is not a value",
    withCurrentValue(VOCAB, "   ").length === VOCAB.length,
  ],
  [
    "matching is exact — a near-miss is surfaced, not silently accepted",
    withCurrentValue(VOCAB, "silver").length === VOCAB.length + 1,
  ],
  [
    "an empty taxonomy still offers what a rule already stores",
    withCurrentValue([], "Yellow Gold").map((o) => o.value).join(",") === "Yellow Gold",
  ],
);

/* --- the same rule, applied to a filter drawer ----------------------------
 * The filters offer the taxonomy, in its curated order. But a filter also has
 * to be able to FIND things, and 752 products still carry "Gold", which is in
 * no vocabulary — offering the taxonomy alone would put a quarter of the
 * catalogue out of reach with nothing on screen to say so.
 */
const IN_USE = ["Gold", "White Gold", "Silver", "Gold Plated Silver"];

checks.push(
  [
    "the filter leads with the taxonomy, in its order",
    withValuesInUse(VOCAB, IN_USE).slice(0, 3).map((o) => o.value).join(",") === "Yellow Gold,White Gold,Silver",
  ],
  [
    "a value in use but not in the taxonomy stays findable",
    withValuesInUse(VOCAB, IN_USE).some((o) => o.value === "Gold"),
  ],
  [
    "...appended after the vocabulary, not mixed into it",
    withValuesInUse(VOCAB, IN_USE).slice(3).every((o) => !VOCAB.includes(o.value)),
  ],
  [
    "...and labelled as the odd one out",
    withValuesInUse(VOCAB, IN_USE).find((o) => o.value === "Gold")?.label === `Gold${OFF_VOCABULARY_SUFFIX}`,
  ],
  [
    "a value in both appears once — the filter posts one string per option",
    withValuesInUse(VOCAB, IN_USE).filter((o) => o.value === "Silver").length === 1,
  ],
  [
    "a duplicate among the in-use values is collapsed",
    withValuesInUse(VOCAB, ["Gold", "Gold"]).filter((o) => o.value === "Gold").length === 1,
  ],
  [
    "blanks and whitespace never become an option",
    withValuesInUse(VOCAB, ["", "   "]).length === VOCAB.length,
  ],
  [
    "nothing in use leaves the taxonomy exactly as it is",
    withValuesInUse(VOCAB, []).map((o) => o.value).join(",") === VOCAB.join(","),
  ],
);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ pricing checks FAILED — the formula sandbox is a security boundary; fix lib/admin/pricing.ts.");
}
process.exit(failed ? 1 : 0);
