import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listTags, getTaxonomyCounts } from "@/lib/admin/taxonomy";
import { TagsScreen } from "./_components/tags-screen";

export const metadata: Metadata = { title: "Tags", robots: { index: false, follow: false } };

export default async function TagsPage() {
  await requireSection("tags");
  const [data, counts] = await Promise.all([listTags(), getTaxonomyCounts()]);
  return <TagsScreen initial={data} counts={counts} />;
}
