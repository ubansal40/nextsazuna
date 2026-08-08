import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { getProductEditorOptions } from "@/lib/admin/catalog";
import { ProductEditor } from "../_components/product-editor";

export const metadata: Metadata = {
  title: "Add product",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  await requireSection("products");
  const options = await getProductEditorOptions();
  return <ProductEditor options={options} />;
}
