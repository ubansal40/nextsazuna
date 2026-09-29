import "server-only";

import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "@/lib/db";
import type { CategoryRow, SlugKind, SlugRow, TaxonRow } from "./types";

/**
 * Resolve a /jewellery/{slug}.html slug to whatever it names.
 *
 * PRECEDENCE IS LOAD-BEARING: category → tag → collection → product, first
 * match wins. Ported exactly from the Express dispatcher.
 *
 * Nothing in the schema enforces slug uniqueness across these four tables. It
 * happens to hold in the current data (verified: zero collisions), but an admin
 * could create a tag tomorrow whose slug matches a product, and the order below
 * is what decides which page a customer lands on. Do not reorder these to
 * "optimise" — products are the largest table, and putting them first would
 * change behaviour the moment a collision appears.
 *
 * WHAT RESOLVES is what the admin shows as live: a visible category, a visible
 * tag, an active collection, an active product. Anything else falls through to
 * the next kind, exactly as an inactive collection always has, and so usually
 * to a 404. Categories and tags used to resolve regardless of the "Visible on
 * the storefront" switch, which made the switch decorative.
 *
 * Tag GROUP visibility is deliberately not part of this. The admin defines a
 * group as "the storefront filter it appears under", so hiding one hides that
 * filter — the storefront renders no tag filters yet, so there is nothing to
 * hide — and must not quietly 404 every landing page of every tag inside it.
 *
 * The same four predicates drive the sitemap below, so the sitemap cannot list
 * a URL this answers with a 404.
 */
const LIVE_CATEGORY = "is_visible = 1";
const LIVE_TAG = "is_visible = 1";
const LIVE_COLLECTION = "is_active = 1";
const LIVE_PRODUCT = "is_active = 1";

export type ResolvedSlug =
  | { kind: "category"; category: CategoryRow }
  | { kind: "tag"; tag: TaxonRow }
  | { kind: "collection"; collection: TaxonRow }
  | { kind: "product"; slug: string }
  | null;

/**
 * Memoised for the life of one request.
 *
 * `generateMetadata` and the page component each resolve the same slug, and
 * neither knows the other exists — so every product page ran this four-query
 * ladder twice, eight round trips to answer one question. React's `cache` is
 * request-scoped, so the second caller gets the first one's answer and the
 * behaviour is unchanged. Next dedupes `fetch`; it cannot dedupe mysql2.
 */
export const resolveSlug = cache(async function resolveSlug(slug: string): Promise<ResolvedSlug> {
  const category = await queryOne<CategoryRow>(
    `SELECT id, name, slug, parent_id, description FROM categories WHERE slug = ? AND ${LIVE_CATEGORY} LIMIT 1`,
    [slug],
  );
  if (category) return { kind: "category", category };

  const tag = await queryOne<TaxonRow>(
    `SELECT id, name, slug FROM tags WHERE slug = ? AND ${LIVE_TAG} LIMIT 1`,
    [slug],
  );
  if (tag) return { kind: "tag", tag };

  const collection = await queryOne<TaxonRow>(
    `SELECT id, name, slug FROM collections WHERE slug = ? AND ${LIVE_COLLECTION} LIMIT 1`,
    [slug],
  );
  if (collection) return { kind: "collection", collection };

  const product = await queryOne<SlugRow>(
    `SELECT slug FROM products WHERE slug = ? AND ${LIVE_PRODUCT} LIMIT 1`,
    [slug],
  );
  if (product) return { kind: "product", slug: product.slug };

  return null;
});

/**
 * The slug a resolved page is canonically served at — the one stored, which is
 * not always the one typed. The columns compare under a case- and
 * accent-insensitive collation, so /jewellery/RINGS.html finds `rings`; the
 * page redirects to this rather than serving the same listing at a second URL.
 */
export function storedSlug(resolved: NonNullable<ResolvedSlug>): string {
  switch (resolved.kind) {
    case "category":
      return resolved.category.slug;
    case "tag":
      return resolved.tag.slug;
    case "collection":
      return resolved.collection.slug;
    case "product":
      return resolved.slug;
  }
}

/**
 * Strip the `.html` suffix the canonical URLs carry.
 *
 * The route segment arrives as "solitaire-halo-ring.html". Returning null for
 * anything without the suffix keeps the canonical form single: a request to
 * /jewellery/foo 404s rather than silently serving the same page at a second
 * URL, which would split ranking between two addresses for identical content.
 *
 * Decoded once, tolerantly. A page's `params` arrive percent-encoded while
 * `generateMetadata` gets them decoded (see the search page), so without this
 * the two resolved different slugs for anything outside [a-z0-9-.] — and a bare
 * `%` must never become a URIError, which inside a Server Component is a 500.
 * The metadata's already-decoded value passes through unchanged unless it
 * still holds a `%`, which no slug can. For a real slug, which is always
 * [a-z0-9-], decoding changes nothing at all.
 */
export function slugFromSegment(segment: string): string | null {
  if (!segment.endsWith(".html")) return null;
  let slug = segment.slice(0, -".html".length);
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Not valid percent-encoding; keep it as typed. It will simply not match.
  }
  return slug.length > 0 ? slug : null;
}

export interface CatalogUrl {
  slug: string;
  kind: SlugKind;
  updatedAt: Date;
}

interface CatalogUrlRow extends RowDataPacket {
  slug: string;
  updated_at: Date;
}

/**
 * Every live category, tag, collection and product slug, for the sitemap.
 *
 * In resolution order, and a slug is listed once, under the kind that wins it —
 * the URL serves exactly one page, so it is exactly one sitemap entry.
 */
export async function listCatalogUrls(): Promise<CatalogUrl[]> {
  const read = (table: string, live: string) =>
    query<CatalogUrlRow>(`SELECT slug, updated_at FROM ${table} WHERE ${live} ORDER BY id`);

  const [categories, tags, collections, products] = await Promise.all([
    read("categories", LIVE_CATEGORY),
    read("tags", LIVE_TAG),
    read("collections", LIVE_COLLECTION),
    read("products", LIVE_PRODUCT),
  ]);

  const seen = new Set<string>();
  const urls: CatalogUrl[] = [];
  for (const [kind, rows] of [
    ["category", categories],
    ["tag", tags],
    ["collection", collections],
    ["product", products],
  ] as const) {
    for (const row of rows) {
      // The same collation as `resolveSlug`'s `=`, near enough: two slugs that
      // differ only in case resolve to one page.
      const key = row.slug.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push({ slug: row.slug, kind, updatedAt: row.updated_at });
    }
  }
  return urls;
}

export const SLUG_KINDS: readonly SlugKind[] = ["category", "tag", "collection", "product"];
