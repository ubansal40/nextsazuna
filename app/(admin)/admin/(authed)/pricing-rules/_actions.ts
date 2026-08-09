"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listPricingRules,
  savePricingRule,
  deletePricingRule,
  setPricingRuleActive,
  reorderPricingRules,
  countUnpricedProducts,
  testPricingFormula,
  type PricingRuleInput,
  type PricingRuleRow,
  type RuleTestResult,
} from "@/lib/admin/pricing-rules";

/**
 * Pricing-rule actions, all gated on `products_pricing`.
 *
 * Each mutation returns the refreshed list AND the unpriced count, because
 * editing a rule can change how many products no rule matches — showing a stale
 * nudge would be worse than showing none.
 */

export type RulesResult =
  | { ok: true; rules: PricingRuleRow[]; unpriced: number }
  | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function refresh(): Promise<RulesResult> {
  const [rules, unpriced] = await Promise.all([listPricingRules(), countUnpricedProducts()]);
  return { ok: true, rules, unpriced };
}

export async function saveRuleAction(id: number | null, input: PricingRuleInput): Promise<RulesResult> {
  const admin = await requireSection("products_pricing");
  try {
    await savePricingRule(admin, id, input);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRuleAction(id: number): Promise<RulesResult> {
  const admin = await requireSection("products_pricing");
  try {
    await deletePricingRule(admin, id);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function setRuleActiveAction(id: number, active: boolean): Promise<RulesResult> {
  const admin = await requireSection("products_pricing");
  try {
    await setPricingRuleActive(admin, id, active);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function reorderRulesAction(orderedIds: number[]): Promise<RulesResult> {
  const admin = await requireSection("products_pricing");
  try {
    await reorderPricingRules(admin, orderedIds);
    return refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function testRuleAction(
  formula: string,
  input: { sku?: string; gross?: string; net?: string; diamond?: string; stone?: string },
): Promise<RuleTestResult> {
  await requireSection("products_pricing");
  return testPricingFormula(formula, input);
}
