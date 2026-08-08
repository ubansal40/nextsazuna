import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminProducts, getProductFilterOptions } from "@/lib/admin/catalog";
import { PickerView } from "./_components/picker-view";

/**
 * Product Picker — Sazuna Admin Product Picker.dc.html.
 *
 * A grid of the photographed catalogue for pulling pieces into a customer chat:
 * pick tiles, then share the photos or copy SKU + price. Image-only, so every
 * tile has something to share.
 */

export const metadata: Metadata = {
  title: "Product Picker",
  robots: { index: false, follow: false },
};

export default async function ProductPickerPage() {
  await requireSection("products_picker");
  const [first, options] = await Promise.all([
    listAdminProducts({ page: 1, hasImage: true }),
    getProductFilterOptions(),
  ]);

  return <PickerView initial={first} options={options} />;
}
