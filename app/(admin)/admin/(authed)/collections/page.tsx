import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listCollections, getTaxonomyCounts } from "@/lib/admin/taxonomy";
import { getProductEditorOptions } from "@/lib/admin/catalog";
import { CollectionsScreen } from "./_components/collections-screen";

export const metadata: Metadata = { title: "Collections", robots: { index: false, follow: false } };

export default async function CollectionsPage() {
  await requireSection("collections");
  const [rows, counts, options] = await Promise.all([
    listCollections(),
    getTaxonomyCounts(),
    getProductEditorOptions(),
  ]);
  return <CollectionsScreen initial={rows} counts={counts} options={options} />;
}
