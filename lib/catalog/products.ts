import "server-only";

import { query, queryOne, type SqlParam } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { EFFECTIVE_PRICE, IN_STOCK, IS_VISIBLE, PRODUCT_COLUMNS, SORT_SQL } from "./sql";
import type {
  CountRow,
  ListingQuery,
  ProductDetail,
  ProductListing,
  ProductRow,
  ProductSummary,
  SortKey,
  TaxonRow,
} from "./types";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

/** Canonical storefront URL. Preserved exactly from the Express app — see ADR 0007. */
export function jewelleryHref(slug: string): string {
  return `/jewellery/${encodeURIComponent(slug)}.html`;
}

/**
 * Map a row to the shape the UI consumes.
 *
 * The compare-at price is only surfaced when it genuinely exceeds the selling
 * price. Showing a struck price equal to (or below) what is charged is a dark
 * pattern, and in several jurisdictions unlawful — so the guard is deliberate
 * rather than defensive.
 */
function toSummary(row: ProductRow): ProductSummary {
  const effective = row.sale_price ?? row.price;
  const hasRealDiscount = row.sale_price !== null && Number(row.price) > Number(row.sale_price);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    href: jewelleryHref(row.slug),
    sku: row.sku,
    price: formatPrice(effective) ?? "",
    compareAtPrice: hasRealDiscount ? formatPrice(row.price) : null,
    imageUrl: row.image_url,
    inStock: row.always_available === 1 || (row.stock ?? 0) > 0,
  };
}

function resolveSort(sort: SortKey | undefined): string {
  return SORT_SQL[sort ?? "popularity"] ?? SORT_SQL.popularity;
}

/**
 * Build the shared WHERE clause and its parameters.
 *
 * Every value is bound, never interpolated. The only interpolated fragments are
 * the sort expression and generated placeholder lists, both derived from
 * validated input rather than from the request.
 */
function buildFilters(input: ListingQuery): { where: string; params: SqlParam[]; joins: string } {
  const clauses = [IS_VISIBLE];
  const params: SqlParam[] = [];
  const joins: string[] = [];

  if (input.categorySlug) {
    joins.push(
      "JOIN product_categories pc ON pc.product_id = p.id",
      "JOIN categories c ON c.id = pc.category_id",
    );
    // Include descendants so a parent category lists everything beneath it.
    clauses.push("(c.slug = ? OR c.parent_id = (SELECT id FROM categories WHERE slug = ? LIMIT 1))");
    params.push(input.categorySlug, input.categorySlug);
  }

  if (input.tagSlugs?.length) {
    const placeholders = input.tagSlugs.map(() => "?").join(", ");
    clauses.push(
      `p.id IN (SELECT pt.product_id FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.slug IN (${placeholders}))`,
    );
    params.push(...input.tagSlugs);
  }

  if (input.collectionIds?.length) {
    const placeholders = input.collectionIds.map(() => "?").join(", ");
    clauses.push(
      `p.id IN (
         SELECT pc2.product_id FROM product_categories pc2
         JOIN collection_categories cc ON cc.category_id = pc2.category_id
         WHERE cc.collection_id IN (${placeholders})
       )`,
    );
    params.push(...input.collectionIds);
  }

  if (input.search) {
    clauses.push("(p.name LIKE ? OR p.sku LIKE ?)");
    const like = `%${input.search}%`;
    params.push(like, like);
  }

  // Sidebar category selections, independent of the page's own category.
  if (input.categorySlugs?.length) {
    const placeholders = input.categorySlugs.map(() => "?").join(", ");
    clauses.push(
      `p.id IN (SELECT pc3.product_id FROM product_categories pc3
                  JOIN categories c3 ON c3.id = pc3.category_id
                 WHERE c3.slug IN (${placeholders}))`,
    );
    params.push(...input.categorySlugs);
  }

  if (input.collectionSlugs?.length) {
    const placeholders = input.collectionSlugs.map(() => "?").join(", ");
    clauses.push(
      `p.id IN (SELECT pc4.product_id FROM product_categories pc4
                  JOIN collection_categories cc2 ON cc2.category_id = pc4.category_id
                  JOIN collections co2 ON co2.id = cc2.collection_id
                 WHERE co2.slug IN (${placeholders}) AND co2.is_active = 1)`,
    );
    params.push(...input.collectionSlugs);
  }

  /**
   * Price brackets are OR'd: selecting two bands means "either". Each bracket
   * is bound, and the open-ended top band simply omits its upper bound.
   */
  if (input.priceBrackets?.length) {
    const ranges = input.priceBrackets.map((bracket) => {
      params.push(bracket.min);
      if (bracket.max === null) return `${EFFECTIVE_PRICE} >= ?`;
      params.push(bracket.max);
      return `(${EFFECTIVE_PRICE} >= ? AND ${EFFECTIVE_PRICE} <= ?)`;
    });
    clauses.push(`(${ranges.join(" OR ")})`);
  }

  for (const [column, values] of [
    ["p.material", input.material],
    ["p.purity", input.purity],
  ] as const) {
    if (values?.length) {
      clauses.push(`${column} IN (${values.map(() => "?").join(", ")})`);
      params.push(...values);
    }
  }

  return { where: clauses.join(" AND "), params, joins: joins.join(" ") };
}

/** Paginated product listing. Used by every PLP surface. */
export async function listProducts(input: ListingQuery = {}): Promise<ProductListing> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
  const { where, params, joins } = buildFilters(input);

  const countRow = await queryOne<CountRow>(
    `SELECT COUNT(DISTINCT p.id) AS total FROM products p ${joins} WHERE ${where}`,
    params,
  );
  const total = Number(countRow?.total ?? 0);

  // LIMIT/OFFSET are numbers we computed and clamped, not request strings.
  const rows = await query<ProductRow>(
    `SELECT DISTINCT ${PRODUCT_COLUMNS}
       FROM products p ${joins}
      WHERE ${where}
      ORDER BY ${resolveSort(input.sort)}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );

  return {
    products: rows.map(toSummary),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** A single product by slug, or null. Returns inactive products as null. */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const row = await queryOne<ProductRow>(
    `SELECT p.*, ${EFFECTIVE_PRICE} AS effective_price, ${IN_STOCK} AS in_stock
       FROM products p
      WHERE p.slug = ? AND ${IS_VISIBLE}
      LIMIT 1`,
    [slug],
  );
  if (!row) return null;

  const [categories, tags] = await Promise.all([
    query<TaxonRow>(
      `SELECT c.id, c.name, c.slug FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
        WHERE pc.product_id = ? ORDER BY c.name`,
      [row.id],
    ),
    query<TaxonRow>(
      `SELECT t.id, t.name, t.slug FROM tags t
         JOIN product_tags pt ON pt.tag_id = t.id
        WHERE pt.product_id = ? ORDER BY t.name`,
      [row.id],
    ),
  ]);

  const taxon = (t: TaxonRow) => ({ name: t.name, slug: t.slug, href: jewelleryHref(t.slug) });

  return {
    ...toSummary(row),
    description: row.description,
    material: row.material,
    purity: row.purity,
    stoneType: row.stone_type,
    grossWeight: row.gross_weight,
    netWeight: row.net_weight,
    diamondWeight: row.diamond_weight,
    stoneWeight: row.stone_weight,
    categories: categories.map(taxon),
    tags: tags.map(taxon),
  };
}

/** Products sharing a category with the given one, excluding it. */
export async function getRelatedProducts(productId: number, limit = 4): Promise<ProductSummary[]> {
  const rows = await query<ProductRow>(
    `SELECT DISTINCT ${PRODUCT_COLUMNS}
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
      WHERE ${IS_VISIBLE}
        AND p.id <> ?
        AND pc.category_id IN (SELECT category_id FROM product_categories WHERE product_id = ?)
      ORDER BY ${IN_STOCK} DESC, p.id DESC
      LIMIT ${Math.min(12, Math.max(1, limit))}`,
    [productId, productId],
  );
  return rows.map(toSummary);
}
