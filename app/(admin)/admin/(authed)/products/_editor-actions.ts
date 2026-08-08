"use server";

import { requireSection } from "@/lib/admin/require";
import {
  saveProduct,
  parseProductInput,
  ProductValidationError,
  type ProductInput,
} from "@/lib/admin/product-write";

/**
 * Product editor save. Re-gates and re-validates — the client's validation is a
 * courtesy, this is the boundary. Resolves rather than rejects; a validation
 * failure names the field so the card can mark it.
 */
export type SaveProductResult =
  | { ok: true; id: number; processing: boolean }
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
