import "server-only";

import { query, type SqlParam } from "@/lib/db";
import { COLLECTION_MEMBERS, scopeFilter } from "./products";
import { priceBandSql } from "./sql";
import type { ListingScope } from "./types";
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
  /** The curated name, when the value has one; free text is labelled here. */
  label: string | null;
  count: number;
}

/**
 * Brackets from the design spec's own `_bracket()` helper. Each is the half-open
 * range [min, max) — see `priceBandSql`, which both the counts below and the
 * listing filter test against.
 */
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
    .map((row) => ({ value: row.value, label: row.label ?? label(row.value), count: Number(row.count) }))
    .filter((option) => option.count > 0);
}

/**
 * Material and purity options, read through their managed vocabularies
 * (`materials`, `purities` — ADR 0010: "a hidden or reordered vocabulary entry
 * changes the storefront"). The admin screens promise exactly that: these are
 * "the options products can carry, in the order they list as storefront
 * filters".
 *
 *   - A vocabulary entry the owner has hidden is not offered. Its products stay
 *     listed; only the filter option goes.
 *   - Entries list in the owner's order (`sort_order`, then name), under the
 *     name as curated.
 *   - A value products carry that is in no vocabulary is still offered, after
 *     the curated ones, by count. The products columns are free strings and the
 *     vocabulary was seeded from them, so the two drift; hiding the stragglers
 *     would make pieces unreachable through the filter. This is the admin's own
 *     rule for its filter drawers (`withValuesInUse`, lib/admin/vocab-options.ts)
 *     minus its "not in taxonomy" label, which is for the owner, not a customer.
 *
 * Matching is SQL `=` under the column collation, the same comparison the
 * listing filter (`p.material IN (…)`) and the admin's counts use, so a count
 * is always what ticking its option returns.
 */
async function vocabularyFacet(
  table: "materials" | "purities",
  column: "material" | "purity",
  where: string,
  params: SqlParam[],
): Promise<FacetOption[]> {
  // `label` is the curated name, shown as the owner wrote it; it is null for a
  // value in no vocabulary, which `toOptions` then tidies like any free text.
  const rows = await query<FacetRow>(
    `SELECT COALESCE(v.name, p.${column}) AS value, v.name AS label, COUNT(*) AS count
       FROM products p
       LEFT JOIN ${table} v ON v.name = p.${column}
      WHERE ${where}
        AND p.${column} IS NOT NULL AND p.${column} <> ''
        AND (v.id IS NULL OR v.is_visible = 1)
      GROUP BY v.id, v.name, v.sort_order, p.${column}
      ORDER BY v.id IS NULL, v.sort_order, v.name, count DESC, value`,
    params,
  );
  return toOptions(rows);
}

/**
 * All facets for a listing, scoped to what the page is already showing.
 *
 * The scope is `scopeFilter` — the very predicate `listProducts` applies for
 * the page's category, tag, collection or search term — so an option is only
 * offered when ticking it returns something. It used to take a category and
 * nothing else: a tag, collection or search page counted the whole catalogue,
 * and /jewellery/wedding.html offered Necklaces, which led to the empty state.
 *
 * Counts are unfiltered by the *other* active filters — a deliberate
 * simplification. Fully cross-filtered counts need one query per group per
 * request; that cost is not worth paying on shared hosting until the sparse
 * fields are actually populated.
 *
 * Categories and collections list in the admin's stored order ("row order is
 * the storefront order" on both screens), and hidden ones are not offered —
 * their pages 404, so neither is a place to send a customer.
 */
export async function getFacets(scope: ListingScope = {}): Promise<Facets> {
  const { where, params } = scopeFilter(scope);

  // One conditional count per bracket, each the exact test the filter applies.
  const bands = PRICE_BRACKETS.map((bracket) => ({ value: bracket.value, ...priceBandSql(bracket) }));

  const [priceRows, categoryRows, material, purity, collectionRows] = await Promise.all([
    query<RowDataPacket>(
      `SELECT ${bands.map((band) => `COUNT(CASE WHEN ${band.sql} THEN 1 END) AS ${band.value}`).join(", ")}
         FROM products p
        WHERE ${where}`,
      [...bands.flatMap((band) => band.params), ...params],
    ),
    // Stored order, as the admin's `listCategories` reads it: top-level
    // categories first, then subcategories, each by position then name.
    query<FacetRow>(
      `SELECT c.slug AS value, c.name AS label, COUNT(*) AS count
         FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         JOIN products p ON p.id = pc.product_id
        WHERE c.is_visible = 1 AND ${where}
        GROUP BY c.id, c.slug, c.name, c.parent_id, c.sort_order
        ORDER BY (c.parent_id IS NOT NULL), c.parent_id, c.sort_order, c.name`,
      params,
    ),
    vocabularyFacet("materials", "material", where, params),
    vocabularyFacet("purities", "purity", where, params),
    // The listing's own membership set, so a count is what ticking returns.
    query<FacetRow>(
      `SELECT col.slug AS value, col.name AS label, COUNT(*) AS count
         FROM collections col
         JOIN ${COLLECTION_MEMBERS} cm ON cm.collection_id = col.id
         JOIN products p ON p.id = cm.product_id
        WHERE col.is_active = 1 AND ${where}
        GROUP BY col.id, col.slug, col.name, col.sort_order
        ORDER BY col.sort_order, col.name`,
      params,
    ),
  ]);

  const priceCounts: RowDataPacket | undefined = priceRows[0];

  return {
    price: PRICE_BRACKETS.map((b) => ({ ...b, count: Number(priceCounts?.[b.value] ?? 0) })).filter(
      (b) => b.count > 0,
    ),
    category: toOptions(categoryRows),
    material,
    purity,
    collection: toOptions(collectionRows),
  };
}
