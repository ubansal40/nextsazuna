import type { Metadata } from "next";
import { listProducts, type SortKey } from "@/lib/catalog";
import { bracketById, getFacets } from "@/lib/catalog/facets";
import { readFilters, type RawParams, readSort } from "@/lib/catalog/filter-params";
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
 * The App Router hands `params` back already percent-decoded, so this must not
 * decode a second time. It used to, and the second pass was doing two things:
 * throwing URIError on any term containing a bare `%` — /search/100%25 gold
 * arrives here as `100% gold` and `decodeURIComponent("100% gold")` is a hard
 * 500 inside an async Server Component — and silently mangling anything that
 * merely *looked* like an escape, so a search for `50%20` became a search for
 * `50 `. Encoding still happens on the way out, when `basePath` is rebuilt.
 */
function readTerm(segments: string[] | undefined): string {
  return (segments?.[0] ?? "").trim();
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const term = readTerm((await params).term);
  return {
    title: term ? `Search: ${term}` : "Search",
    // Result pages are thin and infinitely variable. Keeping them out of the
    // index stops them competing with the category pages that should rank.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const term = readTerm((await params).term);
  const q = await searchParams;
  const filters = readFilters(q);

  const sort = readSort(one(q.sort));

  const [listing, facets] = await Promise.all([
    listProducts({
      search: term || undefined,
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
    getFacets(),
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
      request={{ search: term, filters, sort }}
    />
  );
}
