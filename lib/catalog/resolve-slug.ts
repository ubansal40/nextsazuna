import "server-only";

import { cache } from "react";
import { queryOne } from "@/lib/db";
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
 */

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
    "SELECT id, name, slug, parent_id FROM categories WHERE slug = ? LIMIT 1",
    [slug],
  );
  if (category) return { kind: "category", category };

  const tag = await queryOne<TaxonRow>(
    "SELECT id, name, slug FROM tags WHERE slug = ? LIMIT 1",
    [slug],
  );
  if (tag) return { kind: "tag", tag };

  const collection = await queryOne<TaxonRow>(
    "SELECT id, name, slug FROM collections WHERE slug = ? AND is_active = 1 LIMIT 1",
    [slug],
  );
  if (collection) return { kind: "collection", collection };

  const product = await queryOne<SlugRow>(
    "SELECT slug FROM products WHERE slug = ? AND is_active = 1 LIMIT 1",
    [slug],
  );
  if (product) return { kind: "product", slug: product.slug };

  return null;
});

/**
 * Strip the `.html` suffix the canonical URLs carry.
 *
 * The route segment arrives as "solitaire-halo-ring.html". Returning null for
 * anything without the suffix keeps the canonical form single: a request to
 * /jewellery/foo 404s rather than silently serving the same page at a second
 * URL, which would split ranking between two addresses for identical content.
 */
export function slugFromSegment(segment: string): string | null {
  if (!segment.endsWith(".html")) return null;
  const slug = segment.slice(0, -".html".length);
  return slug.length > 0 ? slug : null;
}

export const SLUG_KINDS: readonly SlugKind[] = ["category", "tag", "collection", "product"];
