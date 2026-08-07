"use server";

import { listProducts, type ProductSummary, type SortKey } from "@/lib/catalog";
import { bracketById } from "@/lib/catalog/facets";
import type { FilterState } from "@/lib/catalog/filter-params";

export interface LoadMoreInput {
  categorySlug?: string;
  tagSlug?: string;
  collectionId?: number;
  filters: FilterState;
  sort?: string;
  page: number;
  pageSize: number;
}

const SORTS = new Set(["popularity", "price-asc", "price-desc", "newest"]);

/**
 * Fetch the next page for infinite scroll.
 *
 * Everything the client sends is re-validated here — sort against a fixed set,
 * price brackets resolved from ids rather than taking raw bounds, page size
 * clamped. A Server Action is a public endpoint; treating its arguments as
 * trusted because "our own component sent them" is how injection happens.
 */
export async function loadMoreProducts(input: LoadMoreInput): Promise<ProductSummary[]> {
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.min(48, Math.max(1, Math.floor(input.pageSize)));
  const sort = input.sort && SORTS.has(input.sort) ? (input.sort as SortKey) : undefined;

  const listing = await listProducts({
    categorySlug: input.categorySlug,
    tagSlugs: input.tagSlug ? [input.tagSlug] : undefined,
    collectionIds: input.collectionId ? [input.collectionId] : undefined,
    categorySlugs: input.filters.cat?.length ? input.filters.cat : undefined,
    collectionSlugs: input.filters.collection?.length ? input.filters.collection : undefined,
    material: input.filters.material?.length ? input.filters.material : undefined,
    purity: input.filters.purity?.length ? input.filters.purity : undefined,
    priceBrackets: input.filters.price?.length
      ? input.filters.price.map(bracketById).filter((b) => b !== null)
      : undefined,
    sort,
    page,
    pageSize,
  });

  return listing.products;
}
