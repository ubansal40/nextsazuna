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
import { evaluateFormula, formulaError, findMatchingRule, computeRulePrice } from "../lib/admin/pricing";

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
