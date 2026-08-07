import { listProducts } from "@/lib/catalog";

/**
 * Type-ahead for the header search overlay.
 *
 * Deliberately thin: it reuses the listing query's existing `search` clause
 * (name or SKU) rather than introducing a second, divergent notion of what
 * "matching" means. A real relevance-ranked search is still an open decision —
 * see the note in README/ADRs — and this is not it.
 */

/** Suggestions shown before the reader commits to the full results page. */
const LIMIT = 6;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return Response.json({ total: 0, products: [] });
  }

  const { products, total } = await listProducts({
    search: q,
    pageSize: LIMIT,
    sort: "popularity",
  });

  return Response.json({
    total,
    products: products.map((product) => ({
      name: product.name,
      href: product.href,
      sku: product.sku,
      price: product.price,
      imageUrl: product.imageUrl,
    })),
  });
}
