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
export const EFFECTIVE_PRICE = `
  CASE WHEN p.sale_price IS NOT NULL THEN p.sale_price ELSE p.price END
`.trim();

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

/** Sort expressions. Keys are validated against this map, never interpolated raw. */
export const SORT_SQL = {
  popularity: "p.id DESC",
  "price-asc": `${EFFECTIVE_PRICE} ASC`,
  "price-desc": `${EFFECTIVE_PRICE} DESC`,
  newest: "COALESCE(p.publish_date, p.created_at) DESC, p.id DESC",
} as const;
