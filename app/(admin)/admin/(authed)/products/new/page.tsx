import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { getProductEditorOptions } from "@/lib/admin/catalog";
import { getSkuSheetStatus } from "@/lib/admin/sku-weights";
import { ProductEditor } from "../_components/product-editor";

export const metadata: Metadata = {
  title: "Add products",
  robots: { index: false, follow: false },
};

/**
 * Add products — the spec's multi-card create screen.
 *
 * The inventory sheet's status is read here rather than on the client so the
 * toolbar never flashes "no sheet" at an admin who has one: whether autofill
 * works is the first thing they need to know.
 */
export default async function NewProductPage() {
  await requireSection("products");
  const [options, sheetStatus] = await Promise.all([getProductEditorOptions(), getSkuSheetStatus()]);
  return <ProductEditor options={options} sheetStatus={sheetStatus} />;
}
