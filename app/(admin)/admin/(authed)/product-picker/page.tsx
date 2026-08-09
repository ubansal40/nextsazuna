import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminProducts, getProductFilterOptions } from "@/lib/admin/catalog";
import { PICKER_PAGE_SIZE } from "./_config";
import { PickerScreen } from "./_components/picker-screen";

/**
 * Product Picker — Sazuna Admin Product Picker.dc.html.
 *
 * A grid of the photographed catalogue for pulling pieces into a customer chat:
 * pick tiles, then share the photos or copy SKU + price. Image-only, so every
 * tile has something to share.
 *
 * The gate is here AND on every action: this page-level `requireSection` only
 * covers the first render.
 */

export const metadata: Metadata = {
  title: "Product Picker",
  robots: { index: false, follow: false },
};

export default async function ProductPickerPage() {
  await requireSection("products_picker");

  const [first, options] = await Promise.all([
    listAdminProducts({ hasImage: true, sort: "id_desc", page: 1, pageSize: PICKER_PAGE_SIZE }),
    getProductFilterOptions(),
  ]);

  return <PickerScreen initialPage={first} options={options} />;
}
