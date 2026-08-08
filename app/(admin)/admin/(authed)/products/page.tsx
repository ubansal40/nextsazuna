import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listAdminProducts, getProductFilterOptions } from "@/lib/admin/catalog";
import { ProductsView } from "./_components/products-view";

/**
 * All Products — Sazuna Admin Products.dc.html.
 *
 * The correction surface for everything the daily stock sync gets wrong: it sees
 * drafts, and its whole job is the products the storefront is hiding. The first
 * page and the filter vocab are fetched on the server; the client view takes it
 * from there (search, filter, load-more, bulk).
 */

export const metadata: Metadata = {
  title: "All Products",
  robots: { index: false, follow: false },
};

export default async function ProductsPage() {
  await requireSection("products");
  const [first, options] = await Promise.all([
    listAdminProducts({ page: 1 }),
    getProductFilterOptions(),
  ]);

  return <ProductsView initial={first} options={options} />;
}
