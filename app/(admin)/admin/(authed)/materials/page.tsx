import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listVocab, getTaxonomyCounts } from "@/lib/admin/taxonomy";
import { VocabScreen } from "@/components/admin/taxonomy/vocab-screen";

export const metadata: Metadata = { title: "Materials", robots: { index: false, follow: false } };

export default async function MaterialsPage() {
  await requireSection("materials");
  const [rows, counts] = await Promise.all([listVocab("material"), getTaxonomyCounts()]);
  return (
    <VocabScreen
      kind="material"
      singular="Material"
      plural="Materials"
      hint="The metal and material options products can carry, in the order they list as storefront filters. Renaming one updates every product that used it."
      counts={counts}
      initial={rows}
    />
  );
}
