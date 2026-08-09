import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne, type SqlParam } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { jewelleryUrl } from "@/lib/navigation";
import { EFFECTIVE_PRICE, IN_STOCK, IS_VISIBLE, PRODUCT_COLUMNS, SORT_SQL, effectivePriceFor } from "./sql";
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

interface ImageRow extends RowDataPacket {
  image_url: string | null;
}

/**
 * Keep only image URLs this deployment can actually serve.
 *
 * A handful of rows still hold `/uploads/...` paths pointing at the Express
 * app's own filesystem. There is no such file here, so next/image answers 400
 * and the page shows a blank frame. Dropping them instead lets the gallery fall
 * through to its "photography in progress" state, which is the truth.
 */
function usableImage(url: string | null | undefined): string | null {
  const value = url?.trim();
  return value && /^https?:\/\//i.test(value) ? value : null;
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

/**
 * Canonical storefront URL. Preserved exactly from the Express app — see ADR 0007.
 *
 * Re-exported from `lib/navigation`, which is client-safe, so the header and
 * the catalog cannot drift into two different URL shapes.
 */
export const jewelleryHref = jewelleryUrl;

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
    priceMinor: Math.round(Number(effective) * 100),
    compareAtPrice: hasRealDiscount ? formatPrice(row.price) : null,
    imageUrl: usableImage(row.image_url),
    inStock: row.always_available === 1 || (row.stock ?? 0) > 0,
  };
}

function resolveSort(sort: SortKey | undefined): string {
  return SORT_SQL[sort ?? "popularity"] ?? SORT_SQL.popularity;
}

/**
 * "Is this product in the collection(s) `predicate` selects?" — the storefront
 * twin of `COLLECTION_MATCH` in `lib/admin/taxonomy.ts`, and it must stay in
 * step with it: what the admin counts on the collections screen is what the shop
 * must show. A product qualifies three ways, matching the drawer's two sections:
 *
 *   1. it sits in one of the collection's rule categories, or
 *   2. it carries one of its rule tags — both then narrowed by the sale-price
 *      band when one is set, or
 *   3. it was hand-picked, which is unconditional. Picking a piece by hand is an
 *      explicit override, so a band must not silently drop it back out.
 *
 * `predicate` is a fragment over the aliased `collections col`, and its own
 * placeholders are bound by the caller in the same order.
 */
function collectionMembership(predicate: string): string {
  return `p.id IN (
    SELECT p5.id FROM products p5
    JOIN collections col ON ${predicate}
    WHERE (
      (
        (EXISTS (SELECT 1 FROM product_categories pc5
                  JOIN collection_categories cc5 ON cc5.category_id = pc5.category_id
                 WHERE pc5.product_id = p5.id AND cc5.collection_id = col.id)
         OR EXISTS (SELECT 1 FROM product_tags pt5
                     JOIN collection_tags ct5 ON ct5.tag_id = pt5.tag_id
                    WHERE pt5.product_id = p5.id AND ct5.collection_id = col.id))
        AND (col.price_band_min IS NULL OR ${effectivePriceFor("p5")} >= col.price_band_min)
        AND (col.price_band_max IS NULL OR ${effectivePriceFor("p5")} <= col.price_band_max)
      )
      OR EXISTS (SELECT 1 FROM collection_products cp5
                  WHERE cp5.product_id = p5.id AND cp5.collection_id = col.id)
    )
  )`;
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
    clauses.push(collectionMembership(`col.id IN (${placeholders})`));
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
    clauses.push(collectionMembership(`col.slug IN (${placeholders}) AND col.is_active = 1`));
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

  const [categories, tags, gallery] = await Promise.all([
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
    query<ImageRow>(
      `SELECT image_url FROM product_images
        WHERE product_id = ? AND image_url <> ''
        ORDER BY sort_order, id`,
      [row.id],
    ),
  ]);

  const taxon = (t: TaxonRow) => ({ name: t.name, slug: t.slug, href: jewelleryHref(t.slug) });

  // `product_images` usually repeats the product's primary image as its first
  // row, so the primary is placed first and the set deduplicated rather than
  // trusting either source alone.
  const images = [
    ...new Set(
      [row.image_url, ...gallery.map((g) => g.image_url)]
        .map(usableImage)
        .filter((url): url is string => url !== null),
    ),
  ];

  return {
    ...toSummary(row),
    images,
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

/**
 * Products by id, for the bag.
 *
 * The browser stores ids; this is what turns them back into names and prices.
 * Invisible or deleted ids simply do not come back, which is how a line for a
 * withdrawn product drops out of the cart on its own.
 */
export async function getProductsByIds(ids: number[]): Promise<ProductSummary[]> {
  const clean = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (!clean.length) return [];

  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
      WHERE ${IS_VISIBLE} AND p.id IN (${clean.map(() => "?").join(", ")})`,
    clean,
  );
  return rows.map(toSummary);
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
