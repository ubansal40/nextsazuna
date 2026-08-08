import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listVocab, getTaxonomyCounts } from "@/lib/admin/taxonomy";
import { VocabScreen } from "@/components/admin/taxonomy/vocab-screen";

export const metadata: Metadata = { title: "Purities", robots: { index: false, follow: false } };

export default async function PuritiesPage() {
  await requireSection("purities");
  const [rows, counts] = await Promise.all([listVocab("purity"), getTaxonomyCounts()]);
  return (
    <VocabScreen
      kind="purity"
      singular="Purity"
      plural="Purities"
      hint="The purity / karat options products can carry, in storefront filter order. Renaming one updates every product that used it."
      counts={counts}
      initial={rows}
    />
  );
}
