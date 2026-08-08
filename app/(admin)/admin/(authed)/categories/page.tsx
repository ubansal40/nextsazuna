import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listCategories, getTaxonomyCounts } from "@/lib/admin/taxonomy";
import { CategoriesScreen } from "./_components/categories-screen";

export const metadata: Metadata = { title: "Categories", robots: { index: false, follow: false } };

export default async function CategoriesPage() {
  await requireSection("categories");
  const [rows, counts] = await Promise.all([listCategories(), getTaxonomyCounts()]);
  return <CategoriesScreen initial={rows} counts={counts} />;
}
