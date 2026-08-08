"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listAdminProducts,
  setProductsVisibility,
  deleteProduct,
  type AdminProductFilters,
  type AdminProductPage,
} from "@/lib/admin/catalog";

/**
 * Products list actions.
 *
 * Every one re-gates with `requireSection("products")` — a Server Action is a
 * public endpoint, and a layout guard does not run before it. They resolve
 * rather than reject so the client can render an outcome; the detail of any
 * failure goes to the server log, never to the caller.
 */

export async function fetchProductsPage(filters: AdminProductFilters): Promise<AdminProductPage> {
  await requireSection("products");
  return listAdminProducts(filters);
}

export async function setVisibility(
  ids: number[],
  isActive: boolean,
): Promise<{ ok: boolean; changed: number }> {
  const admin = await requireSection("products");
  try {
    const changed = await setProductsVisibility(admin, ids, isActive);
    return { ok: true, changed };
  } catch (error) {
    console.error("[admin] set visibility failed", error);
    return { ok: false, changed: 0 };
  }
}

export type RemoveResult =
  | { ok: true; mode: "hard" }
  | { ok: true; mode: "soft"; reason: "has_orders" }
  | { ok: false };

export async function removeProduct(id: number): Promise<RemoveResult> {
  const admin = await requireSection("products");
  try {
    const outcome = await deleteProduct(admin, id);
    return { ok: true, ...outcome };
  } catch (error) {
    console.error("[admin] delete product failed", error);
    return { ok: false };
  }
}
