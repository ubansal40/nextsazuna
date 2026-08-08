import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/admin/require";
import { getAdminProduct } from "@/lib/admin/product-detail";
import { getProductEditorOptions } from "@/lib/admin/catalog";
import { ProductEditor } from "../../_components/product-editor";

export const metadata: Metadata = {
  title: "Edit product",
  robots: { index: false, follow: false },
};

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("products");
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const [product, options] = await Promise.all([getAdminProduct(productId), getProductEditorOptions()]);
  if (!product) notFound();

  return <ProductEditor product={product} options={options} />;
}
