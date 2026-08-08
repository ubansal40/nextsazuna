/**
 * Pricing-rule evaluation — the formula sandbox and the matcher.
 *
 * Pure and self-contained, matched to sazuna-unik 2's pricing-rules.js: a rule
 * is `{ material?, purity?, category_id?, formula, priority }`, and a product's
 * base price is the formula of the first active, priority-ordered rule whose
 * conditions all match. Shared by the product editor (auto base-pricing at save)
 * and the pricing-rules screen, so "what does this rule compute" has one
 * definition. No `server-only` — it is arithmetic, not a data-layer.
 *
 * The formula is author-supplied and evaluated, so the sandbox is the security
 * boundary: after the known weight variables are substituted with numbers,
 * ANYTHING still alphabetic is rejected, then only digits, spaces, parentheses
 * and the four arithmetic operators survive to a strict `Function`. A formula
 * cannot reach a global, call a method, or read a property — there is nothing
 * left in it but arithmetic.
 */

export const FORMULA_MAX_LENGTH = 500;
export const RULE_NAME_MAX_LENGTH = 120;

/**
 * Weight variable aliases → canonical key. Order matters only in spirit
 * (longest first); the `\b…\b` boundaries already stop `net` matching inside
 * `net_weight` (the `_` is a word char, so there is no boundary between them).
 */
const ALIASES: { alias: string; key: string }[] = [
  { alias: "gross_weight", key: "gross_weight" },
  { alias: "grosswt", key: "gross_weight" },
  { alias: "gross", key: "gross_weight" },
  { alias: "net_weight", key: "net_weight" },
  { alias: "netwt", key: "net_weight" },
  { alias: "net", key: "net_weight" },
  { alias: "diamond_weight", key: "diamond_weight" },
  { alias: "diamondwt", key: "diamond_weight" },
  { alias: "dwt", key: "diamond_weight" },
  { alias: "diamond", key: "diamond_weight" },
  { alias: "stone_weight", key: "stone_weight" },
  { alias: "stonewt", key: "stone_weight" },
  { alias: "stnwt", key: "stone_weight" },
  { alias: "stone", key: "stone_weight" },
];

const ALIAS_REGEX = ALIASES.map((entry) => ({
  key: entry.key,
  regex: new RegExp(`\\b${entry.alias}\\b`, "g"),
}));

export interface FormulaVariables {
  gross_weight?: number;
  net_weight?: number;
  diamond_weight?: number;
  stone_weight?: number;
}

/**
 * Evaluate a pricing formula with the given weights, or throw a message safe to
 * show the author. Substitutes each weight alias with its numeric value, refuses
 * any residual identifier, whitelists the arithmetic characters, and requires a
 * finite result.
 */
export function evaluateFormula(expression: string, variables: FormulaVariables = {}): number {
  const raw = String(expression ?? "").trim().toLowerCase();
  if (!raw) throw new Error("Formula is required.");
  if (raw.length > FORMULA_MAX_LENGTH) throw new Error(`Formula is too long (max ${FORMULA_MAX_LENGTH}).`);

  let sanitized = raw;
  const values: Record<string, number> = {
    gross_weight: numberOr0(variables.gross_weight),
    net_weight: numberOr0(variables.net_weight),
    diamond_weight: numberOr0(variables.diamond_weight),
    stone_weight: numberOr0(variables.stone_weight),
  };
  for (const { key, regex } of ALIAS_REGEX) {
    sanitized = sanitized.replace(regex, String(values[key]));
  }

  if (/[a-z_]/i.test(sanitized)) throw new Error("Formula has unsupported variables.");
  if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
    throw new Error("Formula can only include numbers, ( ), +, -, *, / and known variables.");
  }

  let result: number;
  try {
    // The string is now provably arithmetic-only — see the module comment.
    result = Function(`"use strict"; return (${sanitized});`)() as number;
  } catch {
    throw new Error("Formula is invalid.");
  }
  if (!Number.isFinite(result)) throw new Error("Formula result is invalid.");
  return Number(result);
}

/** Whether a formula is valid for a unit product — used by the rule editor's
 *  live validity indicator. Returns the error message, or null when valid. */
export function formulaError(expression: string): string | null {
  try {
    evaluateFormula(expression, { gross_weight: 1, net_weight: 1, diamond_weight: 1, stone_weight: 1 });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Formula is invalid.";
  }
}

export interface PricingRuleCondition {
  material: string | null;
  purity: string | null;
  category_id: number | null;
  formula: string;
}

export interface ProductPricingInput {
  material: string | null;
  purity: string | null;
  /** A product may sit in several categories; a rule matches if its single
   *  category condition is any of them. */
  categoryIds: number[];
}

/**
 * The first rule whose conditions all match, or null. `rules` must already be
 * active-only and priority-ordered (lowest number first) — the caller owns the
 * query. A null/empty condition on a rule means "any".
 */
export function findMatchingRule<T extends PricingRuleCondition>(
  rules: readonly T[],
  product: ProductPricingInput,
): T | null {
  const material = (product.material ?? "").trim().toLowerCase();
  const purity = (product.purity ?? "").trim().toUpperCase();
  const categoryIds = new Set(product.categoryIds ?? []);

  for (const rule of rules) {
    const ruleMaterial = (rule.material ?? "").trim().toLowerCase();
    const rulePurity = (rule.purity ?? "").trim().toUpperCase();
    if (ruleMaterial && ruleMaterial !== material) continue;
    if (rulePurity && rulePurity !== purity) continue;
    if (rule.category_id != null && !categoryIds.has(rule.category_id)) continue;
    return rule;
  }
  return null;
}

/**
 * The base price for a product from the rules, or null when nothing matches (the
 * caller then leaves the price as entered). Rounded to paisa via `toFixed(2)` and
 * returned as a string so it slots straight into a DECIMAL column without a float
 * round-trip.
 */
export function computeRulePrice(
  rules: readonly PricingRuleCondition[],
  product: ProductPricingInput & FormulaVariables,
): string | null {
  const rule = findMatchingRule(rules, product);
  if (!rule) return null;
  const value = evaluateFormula(rule.formula, product);
  if (value <= 0) return null;
  return value.toFixed(2);
}

function numberOr0(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
