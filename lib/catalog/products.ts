import "server-only";

import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { query, queryOne, type SqlParam } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { servableImageUrl } from "@/lib/image-hosts";
import { jewelleryUrl } from "@/lib/navigation";
import {
  EFFECTIVE_PRICE,
  IN_STOCK,
  IS_VISIBLE,
  PRODUCT_COLUMNS,
  SORT_SQL,
  effectivePriceFor,
  priceBandSql,
} from "./sql";
import type {
  CountRow,
  ListingQuery,
  ListingScope,
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
 * Keep only image URLs this deployment can actually serve — an allowlisted
 * host (the legacy silveejewels.com photos) or an app-relative `/uploads/…`
 * path the admin's pipeline wrote. See `lib/image-hosts.ts`.
 *
 * Relative paths were once dropped too, because every one was a stale pointer
 * into the Express app's filesystem. That stopped being true the moment the
 * admin could upload: a freshly uploaded product stores
 * `/uploads/products/….avif`, and the product looked permanently photo-less.
 */
const usableImage = servableImageUrl;

/** Only a fallback — every listing surface passes its own `STEP`. Kept in step
 *  with them so a caller that forgets does not silently get a different page. */
const DEFAULT_PAGE_SIZE = 12;
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
 * Every collection membership, as a derived table of (collection_id,
 * product_id) — the storefront twin of `COLLECTION_MATCH` in
 * `lib/admin/taxonomy.ts`, and it must stay in step with it: what the admin
 * counts on the collections screen is what the shop must show. A product
 * qualifies three ways, matching the drawer's two sections:
 *
 *   1. it sits in one of the collection's rule categories, or
 *   2. it carries one of its rule tags — both then narrowed by the sale-price
 *      band when one is set, or
 *   3. it was hand-picked, which is unconditional. Picking a piece by hand is an
 *      explicit override, so a band must not silently drop it back out.
 *
 * The listing filter and the sidebar's Collection counts both read this, so the
 * count beside an option is the number of pieces ticking it returns. The counts
 * used to follow the category rules alone — no tags, no hand-picks, no band.
 *
 * A set rather than the admin's per-product EXISTS test, for the counts' sake:
 * they need every collection at once, and a correlated test per (collection,
 * product) pair measured ~600ms per listing render against 3,079 products and a
 * dozen collections, where this is ~25ms. The filter got faster too. Same rules,
 * same answer — verified pair for pair against the EXISTS form. UNION (not
 * UNION ALL) leaves one row per pair, so a product both matched and picked is
 * counted once, as the admin's COUNT(DISTINCT) does.
 */
export const COLLECTION_MEMBERS = `(
  SELECT rule.collection_id, rule.product_id
    FROM (
      SELECT mcc.collection_id, mpc.product_id
        FROM collection_categories mcc
        JOIN product_categories mpc ON mpc.category_id = mcc.category_id
      UNION
      SELECT mct.collection_id, mpt.product_id
        FROM collection_tags mct
        JOIN product_tags mpt ON mpt.tag_id = mct.tag_id
    ) rule
    JOIN collections bcol ON bcol.id = rule.collection_id
    JOIN products bp ON bp.id = rule.product_id
   WHERE (bcol.price_band_min IS NULL OR ${effectivePriceFor("bp")} >= bcol.price_band_min)
     AND (bcol.price_band_max IS NULL OR ${effectivePriceFor("bp")} <= bcol.price_band_max)
  UNION
  SELECT mcp.collection_id, mcp.product_id FROM collection_products mcp
)`;

/**
 * "Is this product in the collection(s) `predicate` selects?"
 *
 * `predicate` is a fragment over the aliased `collections col`, and its own
 * placeholders are bound by the caller in the same order.
 */
function collectionMembership(predicate: string): string {
  return `p.id IN (
    SELECT cm.product_id FROM ${COLLECTION_MEMBERS} cm
      JOIN collections col ON col.id = cm.collection_id
     WHERE ${predicate}
  )`;
}

/**
 * Escape LIKE's metacharacters so a search means what was typed — the
 * storefront copy of the admin's `escapeLike` (lib/admin/catalog.ts), which the
 * catalog does not import from the console. Unescaped, a search for `_` or `%`
 * matched every product, and a `\` escaped the closing wildcard. Used with an
 * explicit `ESCAPE '\\'`, as the admin does.
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * The page's own scope — its category, tag(s), collection(s) or search term —
 * as a WHERE clause over `products p`, with its parameters.
 *
 * Exported because the sidebar's facet counts (lib/catalog/facets.ts) must be
 * scoped by exactly this predicate. They used to scope by category alone, so a
 * tag, collection or search page offered options counted across the whole
 * catalogue, and ticking one of them led to the empty state.
 *
 * Every clause is a predicate on `p` — no JOIN — so each product appears once
 * and neither caller needs DISTINCT. That matters beyond tidiness: the category
 * scope used to JOIN `product_categories`, which is the only reason the listing
 * said `SELECT DISTINCT`, and DISTINCT alongside an ORDER BY on a column it does
 * not select (`newest` sorts on `publish_date`) is error 3065 on MySQL 8.
 * MariaDB accepts it, which is how it went unnoticed.
 */
export function scopeFilter(scope: ListingScope): { where: string; params: SqlParam[] } {
  const clauses = [IS_VISIBLE];
  const params: SqlParam[] = [];

  if (scope.categorySlug) {
    // Include descendants so a parent category lists everything beneath it.
    clauses.push(
      `p.id IN (SELECT pc.product_id FROM product_categories pc
                  JOIN categories c ON c.id = pc.category_id
                 WHERE c.slug = ? OR c.parent_id = (SELECT id FROM categories WHERE slug = ? LIMIT 1))`,
    );
    params.push(scope.categorySlug, scope.categorySlug);
  }

  if (scope.tagSlugs?.length) {
    const placeholders = scope.tagSlugs.map(() => "?").join(", ");
    clauses.push(
      `p.id IN (SELECT pt.product_id FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.slug IN (${placeholders}))`,
    );
    params.push(...scope.tagSlugs);
  }

  if (scope.collectionIds?.length) {
    const placeholders = scope.collectionIds.map(() => "?").join(", ");
    clauses.push(collectionMembership(`col.id IN (${placeholders})`));
    params.push(...scope.collectionIds);
  }

  if (scope.search) {
    clauses.push("(p.name LIKE ? ESCAPE '\\\\' OR p.sku LIKE ? ESCAPE '\\\\')");
    const like = `%${escapeLike(scope.search)}%`;
    params.push(like, like);
  }

  return { where: clauses.join(" AND "), params };
}

/**
 * Build the shared WHERE clause and its parameters: the page's scope, then the
 * sidebar's selections.
 *
 * Every value is bound, never interpolated. The only interpolated fragments are
 * the sort expression and generated placeholder lists, both derived from
 * validated input rather than from the request.
 */
function buildFilters(input: ListingQuery): { where: string; params: SqlParam[] } {
  const scope = scopeFilter(input);
  const clauses = [scope.where];
  const params: SqlParam[] = [...scope.params];

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
   * Price brackets are OR'd: selecting two bands means "either". Each band is
   * `priceBandSql`, the same half-open test the sidebar counts with.
   */
  if (input.priceBrackets?.length) {
    const ranges = input.priceBrackets.map((bracket) => {
      const band = priceBandSql(bracket);
      params.push(...band.params);
      return band.sql;
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

  return { where: clauses.join(" AND "), params };
}

/**
 * A collection page's default order: its hand-picked pieces first, in the order
 * the admin arranged them — the drawer calls them "hand-picked pieces in the
 * order they should appear" — then everything its rules match, in the usual
 * order, which also breaks any tie between positions.
 *
 * Only under the default sort, since a customer who asks for price order means
 * price order, and only for a single collection, the one place `position` is
 * defined. The LEFT JOIN adds at most one row per product, because
 * (collection_id, product_id) is the table's primary key. Its placeholder
 * precedes the WHERE clause's, so its parameter is bound first.
 */
function curatedOrder(input: ListingQuery): { join: string; order: string; params: SqlParam[] } {
  const ids = input.collectionIds ?? [];
  if (ids.length !== 1 || (input.sort ?? "popularity") !== "popularity") {
    return { join: "", order: "", params: [] };
  }
  return {
    join: "LEFT JOIN collection_products cpo ON cpo.collection_id = ? AND cpo.product_id = p.id",
    order: "cpo.position IS NULL, cpo.position, ",
    params: [ids[0]],
  };
}

/** Paginated product listing. Used by every PLP surface. */
export async function listProducts(input: ListingQuery = {}): Promise<ProductListing> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
  const { where, params } = buildFilters(input);
  const curated = curatedOrder(input);

  // Every filter is a predicate on `p`, so each product is one row: COUNT(*)
  // and a plain SELECT, no DISTINCT. See `scopeFilter`.
  const countRow = await queryOne<CountRow>(
    `SELECT COUNT(*) AS total FROM products p WHERE ${where}`,
    params,
  );
  const total = Number(countRow?.total ?? 0);

  // LIMIT/OFFSET are numbers we computed and clamped, not request strings.
  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p ${curated.join}
      WHERE ${where}
      ORDER BY ${curated.order}${resolveSort(input.sort)}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    [...curated.params, ...params],
  );

  return {
    products: rows.map(toSummary),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * A single product by slug, or null. Returns inactive products as null.
 *
 * Memoised per request: `generateMetadata` and the page component both ask for
 * the same product, so this and its three-query fan-out used to run twice on
 * every product page — eight round trips for one product.
 */
export const getProductBySlug = cache(async function getProductBySlug(
  slug: string,
): Promise<ProductDetail | null> {
  const row = await queryOne<ProductRow>(
    `SELECT p.*, ${EFFECTIVE_PRICE} AS effective_price, ${IN_STOCK} AS in_stock
       FROM products p
      WHERE p.slug = ? AND ${IS_VISIBLE}
      LIMIT 1`,
    [slug],
  );
  if (!row) return null;

  // Hidden categories and tags are left out: each one becomes a link, and
  // `resolveSlug` answers a hidden taxon's URL with a 404.
  const [categories, tags, gallery] = await Promise.all([
    query<TaxonRow>(
      `SELECT c.id, c.name, c.slug FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
        WHERE pc.product_id = ? AND c.is_visible = 1 ORDER BY c.name`,
      [row.id],
    ),
    query<TaxonRow>(
      `SELECT t.id, t.name, t.slug FROM tags t
         JOIN product_tags pt ON pt.tag_id = t.id
        WHERE pt.product_id = ? AND t.is_visible = 1 ORDER BY t.name`,
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
});

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
