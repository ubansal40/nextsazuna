import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { getProductEditorOptions, listProductsByIds } from "@/lib/admin/catalog";
import { BulkEditView } from "../_components/bulk-edit-view";

/**
 * Bulk edit — /admin/products/bulk?ids=1,2,3
 *
 * The selection travels in the URL rather than in a store, so the screen is
 * linkable and survives a reload: an admin who came here with three hundred
 * products chosen should not lose them to a stray refresh.
 *
 * Ids are resolved to real products server-side. Anything the URL names that
 * does not exist simply drops out, and the screen shows what it actually found —
 * a bulk change should never be applied to a count nobody has seen.
 */

export const metadata: Metadata = {
  title: "Bulk edit",
  robots: { index: false, follow: false },
};

/** The reference caps its bulk endpoints at 200 ids; this cap is higher because
 *  the change is one statement per table, but it is still a cap — an unbounded
 *  IN list is a way to make one click lock the whole catalogue. */
const MAX_IDS = 500;

function parseIds(raw: string | string[] | undefined): { ids: number[]; truncated: number } {
  const text = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const all = [
    ...new Set(
      text
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  return { ids: all.slice(0, MAX_IDS), truncated: Math.max(0, all.length - MAX_IDS) };
}

export default async function BulkEditPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  await requireSection("products");
  const { ids: raw } = await searchParams;
  const { ids, truncated } = parseIds(raw);

  const [products, options] = await Promise.all([listProductsByIds(ids), getProductEditorOptions()]);

  return <BulkEditView products={products} options={options} truncated={truncated} />;
}
