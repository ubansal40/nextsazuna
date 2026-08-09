import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { listPricingRules, countUnpricedProducts } from "@/lib/admin/pricing-rules";
import { getProductEditorOptions } from "@/lib/admin/catalog";
import { PricingRulesScreen } from "./_components/pricing-rules-screen";

export const metadata: Metadata = { title: "Pricing Rules", robots: { index: false, follow: false } };

export default async function PricingRulesPage() {
  await requireSection("products_pricing");
  const [rules, unpriced, options] = await Promise.all([
    listPricingRules(),
    countUnpricedProducts(),
    getProductEditorOptions(),
  ]);
  return <PricingRulesScreen initialRules={rules} initialUnpriced={unpriced} options={options} />;
}
