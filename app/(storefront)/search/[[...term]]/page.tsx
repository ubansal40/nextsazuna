import type { Metadata } from "next";
import { listProducts, type SortKey } from "@/lib/catalog";
import { bracketById, getFacets } from "@/lib/catalog/facets";
import { readFilters, type RawParams, readSort } from "@/lib/catalog/filter-params";
import { getWhatsAppHref } from "@/lib/content";
import { ProductListingView } from "@/app/(storefront)/jewellery/[slug]/_components/product-listing";

/**
 * Search results — /search and /search/{term}.
 *
 * The header's search overlay needs somewhere to land, and this is it: the same
 * listing surface as a category page, scoped by a free-text term instead of a
 * taxonomy, so filters, sort and infinite scroll all work unchanged.
 *
 * The term is a path segment rather than `?q=`, because the listing's filter
 * URLs are rebuilt from `basePath` plus the filter state alone — a query
 * parameter would be dropped the moment anyone ticked a facet.
 *
 * Matching is the catalog's existing name-or-SKU LIKE. That is interim: how
 * search should actually rank is still an open product decision.
 */

/** Kept in step with the category listing — see `jewellery/[slug]/page.tsx`. */
const STEP = 12;

interface PageProps {
  params: Promise<{ term?: string[] }>;
  searchParams: Promise<RawParams>;
}

/**
 * The page and its metadata are NOT handed the same string, and each reader
 * below is correct only for its own caller.
 *
 * `generateMetadata` receives the segment percent-decoded: /search/100%25%20gold
 * arrives as `100% gold`, and decoding that again is a URIError — a hard 500.
 *
 * The page component receives it still percent-encoded, because Next builds a
 * page's `params` from the router tree's segment value, which it encodes
 * (`getParamValue` in next/dist/shared/lib/router/utils/get-dynamic-param.js).
 * Read raw, every multi-word search looked for the literal text
 * `diamond%20ring`, found nothing, and printed "Results for “diamond%20ring”".
 *
 * So the page decodes exactly once. The fallback keeps a bare `%` from ever
 * becoming a 500 should a future Next start handing pages decoded params too.
 * Encoding happens again on the way out, when `basePath` is rebuilt.
 */
function termForMetadata(segments: string[] | undefined): string {
  return (segments?.[0] ?? "").trim();
}

function termForPage(segments: string[] | undefined): string {
  const raw = segments?.[0] ?? "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const term = termForMetadata((await params).term);
  return {
    title: term ? `Search: ${term}` : "Search",
    // Result pages are thin and infinitely variable. Keeping them out of the
    // index stops them competing with the category pages that should rank.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const term = termForPage((await params).term);
  const q = await searchParams;
  const filters = readFilters(q);

  const sort = readSort(one(q.sort));

  // The facets are scoped by the same term as the results, so the sidebar
  // only offers what this search can actually narrow to.
  const scope = { search: term || undefined };

  const [listing, facets, whatsappHref] = await Promise.all([
    listProducts({
      ...scope,
      categorySlugs: filters.cat.length ? filters.cat : undefined,
      collectionSlugs: filters.collection.length ? filters.collection : undefined,
      material: filters.material.length ? filters.material : undefined,
      purity: filters.purity.length ? filters.purity : undefined,
      priceBrackets: filters.price.length
        ? filters.price.map(bracketById).filter((b) => b !== null)
        : undefined,
      sort: sort as SortKey,
      page: 1,
      pageSize: STEP,
    }),
    getFacets(scope),
    getWhatsAppHref(),
  ]);

  return (
    <ProductListingView
      heading={term ? `Results for “${term}”` : "Search"}
      subheading={
        term ? null : "Search by product name or SKU, or browse a category from the menu above."
      }
      basePath={term ? `/search/${encodeURIComponent(term)}` : "/search"}
      listing={listing}
      facets={facets}
      state={filters}
      sort={sort}
      pageSize={STEP}
      whatsappHref={whatsappHref}
      request={{ search: term, filters, sort }}
    />
  );
}
