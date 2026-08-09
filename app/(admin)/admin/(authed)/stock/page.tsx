import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { StockScreen } from "./_components/stock-screen";

export const metadata: Metadata = { title: "Stock Management", robots: { index: false, follow: false } };

export default async function StockPage() {
  await requireSection("products_stock");
  return <StockScreen />;
}
