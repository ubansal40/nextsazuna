"use server";

import { requireSection } from "@/lib/admin/require";
import {
  saveProduct,
  parseProductInput,
  ProductValidationError,
  type ProductInput,
} from "@/lib/admin/product-write";
import { previewRulePrice } from "@/lib/admin/product-write";
import { lookupSkuWeights, getSkuSheetStatus, type SkuSheetStatus } from "@/lib/admin/sku-weights";

/**
 * Product editor save. Re-gates and re-validates — the client's validation is a
 * courtesy, this is the boundary. Resolves rather than rejects; a validation
 * failure names the field so the card can mark it.
 *
 * The save is now the cheap half of adding a product: the photos were processed
 * as they were uploaded, so this writes rows and returns.
 */
export type SaveProductResult =
  | { ok: true; id: number }
  | { ok: false; error: string; field?: string };

export async function saveProductAction(
  id: number | null,
  raw: Partial<ProductInput>,
): Promise<SaveProductResult> {
  const admin = await requireSection("products");
  try {
    const input = parseProductInput(raw);
    const result = await saveProduct(admin, { id: id ?? undefined, input });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ProductValidationError) {
      return { ok: false, error: error.message, field: error.field };
    }
    console.error("[admin] save product failed", error);
    return { ok: false, error: "Couldn't save. Please try again." };
  }
}

/* --- SKU autofill (migration 0015) ----------------------------------------- */

export interface SkuAutofill {
  sku: string;
  purity: string | null;
  grossWeight: string;
  netWeight: string;
  diamondWeight: string;
  stoneWeight: string;
}

/**
 * Look a SKU up in the uploaded inventory sheet.
 *
 * Returns null rather than an error when the sheet has no such SKU: typing a
 * SKU that is not on the sheet is completely ordinary (a new piece), and an
 * error toast per keystroke would be intolerable.
 */
export async function lookupSkuAction(sku: string): Promise<SkuAutofill | null> {
  await requireSection("products");
  const row = await lookupSkuWeights(sku);
  if (!row) return null;
  const w = (v: number | null) => (v == null ? "" : String(v));
  return {
    sku: row.sku,
    purity: row.purity,
    grossWeight: w(row.gross_weight),
    netWeight: w(row.net_weight),
    diamondWeight: w(row.diamond_weight),
    stoneWeight: w(row.stone_weight),
  };
}

/**
 * The sale price the pricing rules derive for these attributes and weights.
 *
 * This is why the pricing-rules screen exists: the admin should not be pricing
 * jewellery by hand when a rule already says what it costs. Null when no rule
 * matches — the field is then left alone rather than zeroed, because "no rule"
 * must never read as "free".
 */
export async function previewPriceAction(input: {
  material: string;
  purity: string;
  categoryIds: number[];
  grossWeight: string;
  netWeight: string;
  diamondWeight: string;
  stoneWeight: string;
}): Promise<string | null> {
  await requireSection("products");
  return previewRulePrice(input);
}

/** What the editor's toolbar says about the sheet currently in force. */
export async function skuSheetStatusAction(): Promise<SkuSheetStatus> {
  await requireSection("products");
  return getSkuSheetStatus();
}
