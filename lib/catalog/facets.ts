import "server-only";

import { query } from "@/lib/db";
import { EFFECTIVE_PRICE, IS_VISIBLE } from "./sql";
import type { RowDataPacket } from "mysql2";

/**
 * Filter facets for the listing sidebar.
 *
 * Counts come from the catalog, not from a hardcoded list, for two reasons:
 * a filter that returns nothing is worse than no filter, and this data is
 * genuinely sparse — `purity` is populated on a handful of products and
 * `material` is free text. Driving the sidebar off live counts means a group
 * appears exactly when it becomes useful, with no code change.
 */

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface PriceBracket extends FacetOption {
  min: number;
  max: number | null;
}

export interface Facets {
  price: PriceBracket[];
  category: FacetOption[];
  material: FacetOption[];
  purity: FacetOption[];
  collection: FacetOption[];
}

interface FacetRow extends RowDataPacket {
  value: string | null;
  count: number;
}

/** Brackets from the design spec's own `_bracket()` helper. */
const PRICE_BRACKETS: { value: string; label: string; min: number; max: number | null }[] = [
  { value: "b1", label: "Under रु 75,000", min: 0, max: 75_000 },
  { value: "b2", label: "रु 75,000 – 1,50,000", min: 75_000, max: 150_000 },
  { value: "b3", label: "रु 1,50,000 – 5,00,000", min: 150_000, max: 500_000 },
  { value: "b4", label: "रु 5,00,000 – 10,00,000", min: 500_000, max: 1_000_000 },
  { value: "b5", label: "Above रु 10,00,000", min: 1_000_000, max: null },
];

export function bracketById(value: string) {
  return PRICE_BRACKETS.find((b) => b.value === value) ?? null;
}

/** Title-case free-text values so "14KT Gold" and "gold" present consistently. */
function label(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) =>
      /^\d+KT$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function toOptions(rows: FacetRow[]): FacetOption[] {
  return rows
    .filter((row): row is FacetRow & { value: string } => Boolean(row.value?.trim()))
    .map((row) => ({ value: row.value, label: label(row.value), count: Number(row.count) }))
    .filter((option) => option.count > 0);
}

/**
 * All facets for a listing, scoped to the taxonomy the page is already showing.
 *
 * Counts are unfiltered by the *other* active filters — a deliberate
 * simplification. Fully cross-filtered counts need one query per group per
 * request; that cost is not worth paying on shared hosting until the sparse
 * fields are actually populated.
 */
export async function getFacets(scope: { categorySlug?: string } = {}): Promise<Facets> {
  const scoped = scope.categorySlug
    ? `JOIN product_categories spc ON spc.product_id = p.id
       JOIN categories sc ON sc.id = spc.category_id
       AND (sc.slug = ? OR sc.parent_id = (SELECT id FROM categories WHERE slug = ? LIMIT 1))`
    : "";
  const scopeParams = scope.categorySlug ? [scope.categorySlug, scope.categorySlug] : [];

  const [priceRows, categoryRows, materialRows, purityRows, collectionRows] = await Promise.all([
    query<FacetRow>(
      `SELECT
         CASE
           WHEN ${EFFECTIVE_PRICE} <= 75000 THEN 'b1'
           WHEN ${EFFECTIVE_PRICE} <= 150000 THEN 'b2'
           WHEN ${EFFECTIVE_PRICE} <= 500000 THEN 'b3'
           WHEN ${EFFECTIVE_PRICE} <= 1000000 THEN 'b4'
           ELSE 'b5'
         END AS value,
         COUNT(DISTINCT p.id) AS count
       FROM products p ${scoped}
       WHERE ${IS_VISIBLE}
       GROUP BY value`,
      scopeParams,
    ),
    query<FacetRow>(
      `SELECT c.slug AS value, COUNT(DISTINCT p.id) AS count
         FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         JOIN products p ON p.id = pc.product_id
        WHERE ${IS_VISIBLE}
        GROUP BY c.slug, c.name
        ORDER BY count DESC`,
      [],
    ),
    query<FacetRow>(
      `SELECT p.material AS value, COUNT(DISTINCT p.id) AS count
         FROM products p ${scoped}
        WHERE ${IS_VISIBLE} AND p.material IS NOT NULL AND p.material <> ''
        GROUP BY p.material ORDER BY count DESC`,
      scopeParams,
    ),
    query<FacetRow>(
      `SELECT p.purity AS value, COUNT(DISTINCT p.id) AS count
         FROM products p ${scoped}
        WHERE ${IS_VISIBLE} AND p.purity IS NOT NULL AND p.purity <> ''
        GROUP BY p.purity ORDER BY count DESC`,
      scopeParams,
    ),
    query<FacetRow>(
      `SELECT co.slug AS value, COUNT(DISTINCT p.id) AS count
         FROM collections co
         JOIN collection_categories cc ON cc.collection_id = co.id
         JOIN product_categories pc ON pc.category_id = cc.category_id
         JOIN products p ON p.id = pc.product_id
        WHERE co.is_active = 1 AND ${IS_VISIBLE}
        GROUP BY co.slug, co.name
        ORDER BY count DESC`,
      [],
    ),
  ]);

  const priceCounts = new Map(priceRows.map((r) => [r.value, Number(r.count)]));

  // Category and collection facets carry slugs; show the human name.
  const [categoryNames, collectionNames] = await Promise.all([
    query<RowDataPacket & { slug: string; name: string }>(
      "SELECT slug, name FROM categories",
      [],
    ),
    query<RowDataPacket & { slug: string; name: string }>(
      "SELECT slug, name FROM collections WHERE is_active = 1",
      [],
    ),
  ]);
  const nameBySlug = new Map([...categoryNames, ...collectionNames].map((r) => [r.slug, r.name]));
  const named = (options: FacetOption[]) =>
    options.map((o) => ({ ...o, label: nameBySlug.get(o.value) ?? o.label }));

  return {
    price: PRICE_BRACKETS.map((b) => ({ ...b, count: priceCounts.get(b.value) ?? 0 })).filter(
      (b) => b.count > 0,
    ),
    category: named(toOptions(categoryRows)),
    material: toOptions(materialRows),
    purity: toOptions(purityRows),
    collection: named(toOptions(collectionRows)),
  };
}
