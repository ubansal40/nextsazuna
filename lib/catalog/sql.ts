/**
 * Shared SQL fragments for the catalog.
 *
 * These exist as constants rather than being inlined so that "what is a
 * sellable product" and "what does this cost" have exactly one definition. In
 * the Express application the equivalent expressions were repeated across
 * several query builders, which is how a listing and a detail page drift into
 * disagreeing about a price.
 */

/**
 * The price a customer actually pays.
 *
 * Ported verbatim from the Express app's EFFECTIVE_PRICE_SQL. In this catalog
 * `price` is MRP and `sale_price` is the selling price; 3,078 of 3,079 active
 * products carry one, so this branch is the normal path, not an edge case.
 */
export const EFFECTIVE_PRICE = effectivePriceFor("p");

/**
 * The same expression against a different table alias, for the rare query that
 * needs a second `products` in a subquery. A function rather than a second
 * constant so there is still exactly one definition of what a customer pays —
 * `EFFECTIVE_PRICE` is just this applied to the usual alias.
 */
export function effectivePriceFor(alias: string): string {
  return `CASE WHEN ${alias}.sale_price IS NOT NULL THEN ${alias}.sale_price ELSE ${alias}.price END`;
}

/**
 * A product is purchasable when it is flagged always-available, or has stock.
 * NULL stock is treated as out of stock: unknown inventory is not a promise we
 * can keep to a customer.
 */
export const IN_STOCK = `
  (p.always_available = 1 OR COALESCE(p.stock, 0) > 0)
`.trim();

/** Only active products are ever visible on the storefront. */
export const IS_VISIBLE = `p.is_active = 1`;

/** Columns every product query selects, so summary and detail cannot diverge. */
export const PRODUCT_COLUMNS = `
  p.id, p.name, p.slug, p.sku, p.image_url,
  p.price, p.sale_price, p.stock, p.always_available, p.is_active
`.trim();

/**
 * Sort expressions. Keys are validated against this map, never interpolated raw.
 *
 * `bestselling` counts actual order lines. With only 27 order rows in the
 * catalog today it degrades to near-arbitrary, so it falls back to id order for
 * everything unsold rather than returning a random-looking list.
 *
 * Every entry ends in `p.id`, and that is load-bearing rather than tidiness.
 * These expressions are paged with LIMIT/OFFSET, and LIMIT over a non-unique
 * ORDER BY is *not* stable: rows tied on the leading key may come back in a
 * different relative order on each execution, so page 2 can repeat rows page 1
 * already returned and skip others entirely. The price sorts had no tiebreaker,
 * and with ~3,000 products sharing a few hundred distinct prices the ties are
 * dense — infinite scroll dropped rows, then never terminated because the
 * accumulated list could not reach `total`. The primary key is unique, so
 * appending it makes each ordering total and every page deterministic.
 *
 * Index impact: none. `EFFECTIVE_PRICE` is a CASE over two columns, which no
 * index can satisfy — `idx_products_pricing (price, sale_price)` was never
 * eligible and these queries already filesort. Adding a second sort key extends
 * the sort tuple; it does not change the access path. The two orderings that
 * *can* use an index — `popularity` and `newest`, on
 * `idx_products_active_publish_id (is_active, publish_date, id)` — already led
 * with `p.id` or ended with it, and are untouched.
 */
export const SORT_SQL = {
  popularity: "p.id DESC",
  "price-asc": `${EFFECTIVE_PRICE} ASC, p.id ASC`,
  "price-desc": `${EFFECTIVE_PRICE} DESC, p.id DESC`,
  newest: "COALESCE(p.publish_date, p.created_at) DESC, p.id DESC",
  bestselling:
    "(SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) DESC, p.id DESC",
} as const;
