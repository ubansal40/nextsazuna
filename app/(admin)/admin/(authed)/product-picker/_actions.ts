"use server";

import { requireSection } from "@/lib/admin/require";
import {
  listAdminProducts,
  type AdminProductFilters,
  type AdminProductPage,
} from "@/lib/admin/catalog";
import { PICKER_PAGE_SIZE, type PickerFilters } from "./_config";

/**
 * Product picker actions.
 *
 * Every one re-gates on `products_picker` — the layout guard runs before a page,
 * never before an action — and resolves to a discriminated result rather than
 * rejecting, so the screen can draw the spec's "Couldn't load the catalogue"
 * panel instead of crashing the tree and losing the selection with it.
 *
 * `requireSection` is called OUTSIDE the try: it redirects an unauthorized admin
 * by throwing Next's redirect signal, and swallowing that would turn a denial
 * into a silent empty grid.
 */

export type PickerResult = { ok: true; page: AdminProductPage } | { ok: false; error: string };

/**
 * The picker is image-only, always. There is nothing to share, copy or download
 * for a product with no photo, and excluding them keeps "N pieces" and the
 * paging honest (the reference forces the same). `hasImage` is set here rather
 * than accepted from the caller so no client can widen it.
 *
 * Sort is fixed newest-first: the spec's picker has no sort control, unlike the
 * products table it shares a filter drawer with.
 */
function toCatalogFilters(filters: PickerFilters): AdminProductFilters {
  const tag = filters.tag;
  return {
    // `q` is escaped for LIKE metacharacters by listAdminProducts (escapeLike),
    // so a customer's SKU containing `_` searches for that character.
    q: filters.q?.trim() || undefined,
    category: filters.category || undefined,
    material: filters.material || undefined,
    purity: filters.purity || undefined,
    tag: Number.isInteger(tag) && (tag as number) > 0 ? tag : undefined,
    status: filters.status || undefined,
    hasImage: true,
    sort: "id_desc",
    page: filters.page ?? 1,
    pageSize: PICKER_PAGE_SIZE,
  };
}

export async function loadPickerAction(filters: PickerFilters): Promise<PickerResult> {
  await requireSection("products_picker");
  try {
    return { ok: true, page: await listAdminProducts(toCatalogFilters(filters)) };
  } catch (error) {
    // Detail stays in the server log; the client gets the spec's wording.
    console.error("[admin] product picker load failed", error);
    return { ok: false, error: "Couldn't load the catalogue." };
  }
}
