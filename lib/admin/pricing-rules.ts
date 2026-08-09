import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { query, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { formulaError, evaluateFormula, findMatchingRule, FORMULA_MAX_LENGTH, RULE_NAME_MAX_LENGTH, type PricingRuleCondition } from "./pricing";
import type { AdminContext } from "./rbac";

/**
 * Pricing rules — the authoring side.
 *
 * Rules turn a SKU's weights into its base price. They are evaluated in
 * priority order and **the first match wins**, so ordering is the whole model:
 * narrow bands first, a catch-all last.
 *
 * This runs at authoring time only. A product's price is derived once, when it
 * is saved (`resolveBasePrice` in `product-write.ts`); nothing here re-prices
 * the catalogue behind anyone's back, which is why this phase was safe to land
 * last.
 */

export interface WeightBand {
  min: string;
  max: string;
}

export interface PricingRuleRow {
  id: number;
  name: string;
  formula: string;
  priority: number;
  isActive: boolean;
  material: string | null;
  purity: string | null;
  categoryId: number | null;
  categoryName: string | null;
  grossWeight: WeightBand;
  netWeight: WeightBand;
  diamondWeight: WeightBand;
  stoneWeight: WeightBand;
  /** Set when the stored formula no longer parses — surfaced on the row so a
   *  rule that silently stopped pricing anything is visible. */
  formulaError: string | null;
  /** True when the rule constrains nothing: it matches every product. */
  isCatchAll: boolean;
}

interface RuleDbRow extends RowDataPacket {
  id: number;
  name: string;
  formula: string;
  priority: number;
  is_active: number;
  material: string | null;
  purity: string | null;
  category_id: number | null;
  category_name: string | null;
  gross_weight_min: string | null;
  gross_weight_max: string | null;
  net_weight_min: string | null;
  net_weight_max: string | null;
  diamond_weight_min: string | null;
  diamond_weight_max: string | null;
  stone_weight_min: string | null;
  stone_weight_max: string | null;
}

const band = (min: string | null, max: string | null): WeightBand => ({ min: min ?? "", max: max ?? "" });

/** A DECIMAL string, or null when the field was left blank. */
function bound(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("A weight bound must be a number of 0 or more.");
  return n.toFixed(3);
}

export async function listPricingRules(): Promise<PricingRuleRow[]> {
  const rows = await query<RuleDbRow>(
    `SELECT r.*, c.name AS category_name
       FROM pricing_rules r LEFT JOIN categories c ON c.id = r.category_id
      ORDER BY r.priority ASC, r.id ASC`,
  );
  return rows.map((r) => {
    const bands = {
      grossWeight: band(r.gross_weight_min, r.gross_weight_max),
      netWeight: band(r.net_weight_min, r.net_weight_max),
      diamondWeight: band(r.diamond_weight_min, r.diamond_weight_max),
      stoneWeight: band(r.stone_weight_min, r.stone_weight_max),
    };
    const constrained =
      Boolean(r.material) ||
      Boolean(r.purity) ||
      r.category_id != null ||
      Object.values(bands).some((b) => b.min !== "" || b.max !== "");
    return {
      id: r.id,
      name: r.name,
      formula: r.formula,
      priority: r.priority,
      isActive: r.is_active === 1,
      material: r.material,
      purity: r.purity,
      categoryId: r.category_id,
      categoryName: r.category_name,
      ...bands,
      formulaError: formulaError(r.formula),
      isCatchAll: !constrained,
    };
  });
}

export interface PricingRuleInput {
  name: string;
  formula: string;
  priority: number;
  isActive: boolean;
  material: string;
  purity: string;
  categoryId: number | null;
  grossWeight: WeightBand;
  netWeight: WeightBand;
  diamondWeight: WeightBand;
  stoneWeight: WeightBand;
}

/** Validate a band pair and return its stored bounds. */
function bandColumns(label: string, input: WeightBand): [string | null, string | null] {
  const min = bound(input.min);
  const max = bound(input.max);
  if (min != null && max != null && Number(min) > Number(max)) {
    throw new Error(`The ${label} range starts above where it ends.`);
  }
  return [min, max];
}

export async function savePricingRule(
  admin: AdminContext,
  id: number | null,
  input: PricingRuleInput,
): Promise<void> {
  const name = input.name.trim().slice(0, RULE_NAME_MAX_LENGTH);
  if (!name) throw new Error("A rule name is required.");

  const formula = input.formula.trim().slice(0, FORMULA_MAX_LENGTH);
  // The formula is refused at the boundary rather than left to fail later on a
  // product save, where the author is no longer looking at it.
  const invalid = formulaError(formula);
  if (invalid) throw new Error(invalid);

  const [grossMin, grossMax] = bandColumns("gross weight", input.grossWeight);
  const [netMin, netMax] = bandColumns("net weight", input.netWeight);
  const [diaMin, diaMax] = bandColumns("diamond weight", input.diamondWeight);
  const [stoneMin, stoneMax] = bandColumns("stone weight", input.stoneWeight);

  const values = [
    name,
    formula,
    Math.max(0, Math.floor(Number(input.priority) || 0)),
    input.isActive ? 1 : 0,
    input.material.trim().slice(0, 120) || null,
    input.purity.trim().slice(0, 80) || null,
    input.categoryId,
    grossMin, grossMax, netMin, netMax, diaMin, diaMax, stoneMin, stoneMax,
  ];

  await transaction(async (connection) => {
    if (id) {
      await connection.execute(
        `UPDATE pricing_rules SET name = ?, formula = ?, priority = ?, is_active = ?,
                material = ?, purity = ?, category_id = ?,
                gross_weight_min = ?, gross_weight_max = ?, net_weight_min = ?, net_weight_max = ?,
                diamond_weight_min = ?, diamond_weight_max = ?, stone_weight_min = ?, stone_weight_max = ?
          WHERE id = ?`,
        [...values, id],
      );
    } else {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO pricing_rules (name, formula, priority, is_active, material, purity, category_id,
                gross_weight_min, gross_weight_max, net_weight_min, net_weight_max,
                diamond_weight_min, diamond_weight_max, stone_weight_min, stone_weight_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );
      id = result.insertId;
    }
    await recordAdminAction(connection, admin, {
      action: id ? "pricing_rules.update" : "pricing_rules.create",
      resourceType: "pricing_rules",
      resourceId: id,
      metadata: { name, formula },
    });
  });
}

export async function deletePricingRule(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute("DELETE FROM pricing_rules WHERE id = ?", [id]);
    await recordAdminAction(connection, admin, {
      action: "pricing_rules.delete",
      resourceType: "pricing_rules",
      resourceId: id,
    });
  });
}

export async function setPricingRuleActive(admin: AdminContext, id: number, active: boolean): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute("UPDATE pricing_rules SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]);
    await recordAdminAction(connection, admin, {
      action: "pricing_rules.active",
      resourceType: "pricing_rules",
      resourceId: id,
      metadata: { active },
    });
  });
}

/** Priority is the model — the first matching rule wins — so reordering the
 *  list IS the edit. Rows become priority 1..n in the given order. */
export async function reorderPricingRules(admin: AdminContext, orderedIds: number[]): Promise<void> {
  const ids = orderedIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  await transaction(async (connection) => {
    for (let i = 0; i < ids.length; i += 1) {
      await connection.execute("UPDATE pricing_rules SET priority = ? WHERE id = ?", [i + 1, ids[i]]);
    }
    await recordAdminAction(connection, admin, {
      action: "pricing_rules.reorder",
      resourceType: "pricing_rules",
      metadata: { count: ids.length },
    });
  });
}

/**
 * How many active products no active rule matches.
 *
 * Their price cannot be derived, so this is the nudge the spec puts at the top
 * of the screen. Counted in TypeScript rather than SQL because "matches" is the
 * evaluator's definition — expressing it twice, once here and once in a query,
 * is how the two drift apart.
 */
export async function countUnpricedProducts(): Promise<number> {
  const [rules, products] = await Promise.all([
    query<RuleDbRow>(
      `SELECT * FROM pricing_rules WHERE is_active = 1 ORDER BY priority ASC, id ASC`,
    ),
    query<RowDataPacket & { id: number; material: string | null; purity: string | null; gross_weight: string | null; net_weight: string | null; diamond_weight: string | null; stone_weight: string | null; category_ids: string | null }>(
      `SELECT p.id, p.material, p.purity, p.gross_weight, p.net_weight, p.diamond_weight, p.stone_weight,
              GROUP_CONCAT(pc.category_id) AS category_ids
         FROM products p LEFT JOIN product_categories pc ON pc.product_id = p.id
        WHERE p.is_active = 1
        GROUP BY p.id`,
    ),
  ]);

  const conditions: PricingRuleCondition[] = rules.map((r) => ({
    material: r.material,
    purity: r.purity,
    category_id: r.category_id,
    formula: r.formula,
    gross_weight: toRange(r.gross_weight_min, r.gross_weight_max),
    net_weight: toRange(r.net_weight_min, r.net_weight_max),
    diamond_weight: toRange(r.diamond_weight_min, r.diamond_weight_max),
    stone_weight: toRange(r.stone_weight_min, r.stone_weight_max),
  }));

  let unpriced = 0;
  for (const product of products) {
    const match = findMatchingRule(conditions, {
      material: product.material,
      purity: product.purity,
      categoryIds: (product.category_ids ?? "").split(",").filter(Boolean).map(Number),
      gross_weight: Number(product.gross_weight) || 0,
      net_weight: Number(product.net_weight) || 0,
      diamond_weight: Number(product.diamond_weight) || 0,
      stone_weight: Number(product.stone_weight) || 0,
    });
    if (!match) unpriced += 1;
  }
  return unpriced;
}

function toRange(min: string | null, max: string | null) {
  if (min == null && max == null) return null;
  return { min: min == null ? null : Number(min), max: max == null ? null : Number(max) };
}

export interface RuleTestResult {
  ok: boolean;
  price: string | null;
  message: string;
  /** The weights used, so the author can see what the SKU actually carried. */
  weights: { gross: number; net: number; diamond: number; stone: number };
}

/**
 * "Test this rule" — evaluate a formula against a real SKU's weights, or
 * against weights typed by hand.
 *
 * Deliberately tests the FORMULA rather than the whole rule chain: the author
 * is asking "does my arithmetic work", and telling them a higher-priority rule
 * would have won instead would answer a question they did not ask.
 */
export async function testPricingFormula(
  formula: string,
  input: { sku?: string; gross?: string; net?: string; diamond?: string; stone?: string },
): Promise<RuleTestResult> {
  const empty = { gross: 0, net: 0, diamond: 0, stone: 0 };
  const invalid = formulaError(formula);
  if (invalid) return { ok: false, price: null, message: invalid, weights: empty };

  let weights = {
    gross: Number(input.gross) || 0,
    net: Number(input.net) || 0,
    diamond: Number(input.diamond) || 0,
    stone: Number(input.stone) || 0,
  };

  if (input.sku?.trim()) {
    const [row] = await query<RowDataPacket & { gross_weight: string | null; net_weight: string | null; diamond_weight: string | null; stone_weight: string | null }>(
      "SELECT gross_weight, net_weight, diamond_weight, stone_weight FROM products WHERE UPPER(sku) = ? LIMIT 1",
      [input.sku.trim().toUpperCase()],
    );
    if (!row) return { ok: false, price: null, message: "No product with that SKU.", weights: empty };
    weights = {
      gross: Number(row.gross_weight) || 0,
      net: Number(row.net_weight) || 0,
      diamond: Number(row.diamond_weight) || 0,
      stone: Number(row.stone_weight) || 0,
    };
  }

  try {
    const value = evaluateFormula(formula, {
      gross_weight: weights.gross,
      net_weight: weights.net,
      diamond_weight: weights.diamond,
      stone_weight: weights.stone,
    });
    return {
      ok: value > 0,
      price: value.toFixed(2),
      message: value > 0 ? "" : "That comes out at zero or less, so no price would be set.",
      weights,
    };
  } catch (error) {
    return {
      ok: false,
      price: null,
      message: error instanceof Error ? error.message : "That formula could not be evaluated.",
      weights,
    };
  }
}
