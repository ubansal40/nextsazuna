"use server";

import { requireSection } from "@/lib/admin/require";
import { listAdminProducts, type AdminProductFilters, type AdminProductPage } from "@/lib/admin/catalog";

/**
 * Product picker fetch. Gated on `products_picker`, and always image-only —
 * there is nothing to share, copy or download for a product with no photo, and
 * hiding them keeps the counts and paging honest (the reference forces the same).
 */
export async function fetchPickerPage(filters: AdminProductFilters): Promise<AdminProductPage> {
  await requireSection("products_picker");
  return listAdminProducts({ ...filters, hasImage: true });
}
